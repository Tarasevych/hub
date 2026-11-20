// Extern bureaublad (RDP/VNC/SSH) via Apache Guacamole — uitvoerder D, 18.10.2026. Zie shared/extern-bureaublad.ts voor de regels.
//
// Keten: browser (guacamole-common-js) —WSS /api/owner/remote/tunnel→ deze server —TCP 127.0.0.1:4822→ guacd —RDP/VNC/SSH→ doel.
//  - Openen: alleen de eigenaar, met een lopend technisch profiel in DIT tabblad en een passkey-bevestiging (één bevestiging = één sessie).
//  - Ticket: 60 s, eenmalig, HMAC; bevat sessie-id + vervaltijd + nonce, NOOIT het wachtwoord. Het ticket gaat in het eerste
//    Guacamole-bericht («mr-auth»), niet in de URL (de WS-poort weigert ?ticket/?token: die belanden in logs).
//  - Het wachtwoord/de sleutel komt uit de kluis op het moment dat guacd verbindt en wordt daarna uit het geheugen gewist.
//  - Doel: de server lost de naam op en controleert ELK adres (privé/loopback/CGNAT of uitdrukkelijk toegestaan, nooit link-local/
//    metadata/multicast); guacd krijgt het IP, niet de naam (geen DNS-rebinding tussen controle en verbinding).
//  - Einde: zelf, 15 min zonder invoer, eind van de geplande tijd, het technisch profiel stopt (uitloggen, intrekken, verlopen —
//    elke 20 s gecontroleerd én meteen via de haak van tech-profiel), of de browser/guacd valt weg. Alles in app.remote_sessies + audit.
//  - Een AI kan dit niet: geen MCP-tool, en /api/owner/remote/* staat in AGENT_VERBODEN (backend/agent-namens.ts).
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { connect as tcpConnect, isIP, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { WebSocketServer, type WebSocket } from 'ws';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { actieveActivatie, bijTechEinde, isEigenaar, TAB_RE, TechFout, type Gebruiker, type Sessie as TechSessie } from './tech-profiel';
import { ownerVaultBewarenIntern, ownerVaultVerwijderenIntern, readOwnerVaultPlaintext, vaultEncryptionReady } from './api-platform-kluis';
import { sleutelUitCookie } from './tech-bundels';
import { meld } from './melder';
import {
  ACTIVITEIT_OPCODES, BESTAND_OPCODES, REMOTE_INACTIEF_MS, REMOTE_MAX_MINUTEN, REMOTE_MAX_SESSIES, REMOTE_PROTOCOLLEN, REMOTE_TICKET_MS, STANDAARD_POORT,
  adresSoort, adresToegestaan, connectWaarden, guacInstructie, guacOntleed, hostGeldig, instellingenNormaliseren, type RemoteInstellingen, type RemoteProtocol,
} from '../shared/extern-bureaublad';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
export const REMOTE_WS_PATH = '/api/owner/remote/tunnel';
const guacdHost = () => process.env.GUACD_HOST || '127.0.0.1';
const guacdPoort = () => Number(process.env.GUACD_PORT || 4822);
const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
const opnamePad = () => process.env.REMOTE_OPNAME_PAD || '/srv/data/guac-opnames';
const CONTROLE_MS = () => Number(process.env.REMOTE_CONTROLE_MS || 20_000);

const audit = (ownerId: string, action: string, details: Record<string, unknown>, result: 'success' | 'denied' | 'failure' = 'success') =>
  auditToevoegen({ ownerId, actorId: ownerId, action, type: 'beveiliging', result, details }).catch(() => undefined);

// ---------------------------------------------------------------- schakelaar + DNS (vervangbaar in tests)
export async function remoteAan(): Promise<boolean> {
  try { return JSON.parse(await readFile(rechtenPad(), 'utf8'))?.guacamole === true; } catch { return false; }
}
type Opzoeken = (naam: string) => Promise<string[]>;
let opzoeken: Opzoeken = async (naam) => (await dnsLookup(naam, { all: true, verbatim: true })).map((a) => a.address);
export function _zetDns(f: Opzoeken | null) { opzoeken = f ?? (async (naam) => (await dnsLookup(naam, { all: true, verbatim: true })).map((a) => a.address)); }

/** Naam of IP → één toegestaan IP. Elk gevonden adres moet toegestaan zijn (een gemengd antwoord wordt geweigerd). */
export async function doelOplossen(host: string, toegestaan: readonly string[]): Promise<string> {
  const h = host.trim().replace(/^\[|\]$/g, '');
  if (!hostGeldig(h)) fout('HOST_ONGELDIG');
  let adressen: string[];
  if (isIP(h)) adressen = [h];
  else { try { adressen = await opzoeken(h); } catch { adressen = []; } }
  if (!adressen.length) fout('HOST_NIET_GEVONDEN', 404);
  if (adressen.some((a) => adresSoort(a) === 'verboden')) fout('HOST_VERBODEN', 403);
  if (!adressen.every((a) => adresToegestaan(a, h, toegestaan))) fout('HOST_NIET_TOEGESTAAN', 403);
  return adressen[0];
}

async function tcpOpen(host: string, poort: number, ms = 3000): Promise<boolean> {
  return new Promise((res) => {
    const s = tcpConnect({ host, port: poort });
    const t = setTimeout(() => { s.destroy(); res(false); }, ms);
    s.once('connect', () => { clearTimeout(t); s.end(); res(true); });
    s.once('error', () => { clearTimeout(t); res(false); });
  });
}

// ---------------------------------------------------------------- tickets
const TICKET_GEHEIM = randomBytes(32); // per proces: ticket en tunnel leven in hetzelfde proces, en 60 s is kort genoeg
const handtekening = (deel: string) => createHmac('sha256', TICKET_GEHEIM).update(deel).digest('base64url');
export function ticketMaken(sid: string, nonce: string, exp: number) { const deel = `${sid}.${exp}.${nonce}`; return `${deel}.${handtekening(deel)}`; }
/** Ticket controleren (vorm, handtekening, termijn) — de eenmaligheid controleert de sessie (nonce). */
export function ticketLezen(t: unknown, nu = Date.now()): { sid: string; nonce: string; exp: number } | null {
  if (typeof t !== 'string' || t.length > 300) return null;
  const m = /^([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/.exec(t);
  if (!m) return null;
  const verwacht = Buffer.from(handtekening(`${m[1]}.${m[2]}.${m[3]}`)), echt = Buffer.from(m[4]);
  if (verwacht.length !== echt.length || !timingSafeEqual(verwacht, echt)) return null;
  const exp = Number(m[2]);
  if (exp < nu) return null;
  return { sid: m[1], exp, nonce: m[3] };
}

// ---------------------------------------------------------------- sessies in het geheugen
type Sessie = {
  sid: string; userId: string; tab: string; techSessie: TechSessie | null; verbindingId: string; naam: string; protocol: RemoteProtocol; host: string; ip: string; poort: number;
  gebruiker: string; geheim: string | null; instellingen: RemoteInstellingen; nonce: string; ticketExp: number;
  begin: number; eind: number; laatsteInvoer: number; ws: WebSocket | null; guacd: Socket | null; open: boolean; klaar: boolean;
  bytesIn: number; bytesUit: number; activatieId: string; timer: NodeJS.Timeout | null;
};
const sessies = new Map<string, Sessie>();
export const _sessies = sessies;
export const actieveSessies = (userId: string) => [...sessies.values()].filter((s) => s.userId === userId && s.open);

/**
 * SEC-002 (slot t, toets-g01-6 «oracle»): de tech-cookies van een eigenaar met een open sessie staan IN HET GEHEUGEN (SHA-256 →
 * eigenaar), geladen bij het openen en zolang een sessie op haar ticket wacht om de 20 s ververst. Zo herkent upgrade() de browser
 * van de eigenaar zonder databasevraag en zonder de gedeelde opzoekplaatsen: een anoniem kan die plaatsen vullen, maar de eigenaar
 * staat daar niet in de rij. Tech-cookies власника з відкритим сеансом — у пам'яті; власник не стоїть у черзі пошуків разом з анонімами.
 */
type CookieLader = (userId: string) => Promise<Array<{ hash: string; tot: number }>>;
const cookieLaderDb: CookieLader = async (userId) => {
  const rows = (await sys().query(
    `SELECT t.sleutel_hash AS hash,
            LEAST(t.verloopt_op, COALESCE(a.eind_op, CASE WHEN v.modus = 'tijd' THEN LEAST(v.eind_op, v.grens_op) ELSE v.grens_op END)) AS tot
       FROM app.tech_asset_toegang t
       LEFT JOIN app.tech_activaties a ON a.id = t.activatie_id AND a.beeindigd_op IS NULL AND a.eind_op > now()
       LEFT JOIN app.tech_ruimte_sessies v ON v.id = t.ruimte_sessie_id AND v.beeindigd_op IS NULL AND v.grens_op > now() AND (v.modus <> 'tijd' OR v.eind_op > now())
      WHERE t.user_id = $1 AND t.verloopt_op > now() AND (a.id IS NOT NULL OR v.id IS NOT NULL)
      ORDER BY t.verloopt_op DESC LIMIT 32`, [userId])).rows;
  return rows.map((r) => ({ hash: String(r.hash), tot: new Date(r.tot).getTime() }));
};
let cookieLader: CookieLader = cookieLaderDb;
export function _zetCookieLader(f: CookieLader | null) { cookieLader = f ?? cookieLaderDb; }
const bekendeCookies = new Map<string, { userId: string; tot: number }>();
function vergeetEigenCookies(userId: string) { for (const [h, c] of bekendeCookies) if (c.userId === userId) bekendeCookies.delete(h); }
/** De geldige tech-cookies van deze eigenaar (opnieuw) in het geheugen zetten; een fout laat de vorige stand staan. */
async function eigenCookiesLaden(userId: string): Promise<void> {
  let lijst: Array<{ hash: string; tot: number }>;
  try { lijst = await cookieLader(userId); } catch { return; }
  if (!sessies.size || ![...sessies.values()].some((x) => x.open && x.userId === userId)) return; // intussen dicht: niets onthouden
  vergeetEigenCookies(userId);
  for (const c of lijst) if (/^[0-9a-f]{64}$/.test(c.hash) && c.tot > Date.now()) bekendeCookies.set(c.hash, { userId, tot: c.tot });
}
export const _eigenCookiesLaden = eigenCookiesLaden;

function afsluiten(s: Sessie, reden: string, statusCode = 0x020B) {
  if (!s.open) return;
  s.open = false;
  s.geheim = null;
  if (s.timer) clearInterval(s.timer);
  sessies.delete(s.sid);
  if (!actieveSessies(s.userId).length) vergeetEigenCookies(s.userId); // laatste sessie dicht: de cookies gelden hier niet meer
  const g = s.guacd;
  try { g?.end(guacInstructie('disconnect')); } catch { /* al dicht */ }
  if (g) setTimeout(() => { try { g.destroy(); } catch { /* al dicht */ } }, 2_000).unref?.();
  try { s.ws?.send(guacInstructie('mr-einde', reden)); s.ws?.close(1000, String(statusCode)); } catch { /* al dicht */ }
  const seconden = Math.round((Date.now() - s.begin) / 1000);
  void sys().query('UPDATE app.remote_sessies SET einde_op = now(), einde_reden = $2, bytes_in = $3, bytes_uit = $4 WHERE id = $1', [s.sid, reden.slice(0, 40), s.bytesIn, s.bytesUit]).catch(() => undefined);
  void audit(s.userId, 'owner.remote.gesloten', { sessie: s.sid, verbinding: s.naam, protocol: s.protocol, host: s.host, reden, seconden, bytesIn: s.bytesIn, bytesUit: s.bytesUit });
}

/** Alle sessies van een gebruiker sluiten (uitloggen, sessies intrekken, technisch profiel uit). */
export function beeindigVoorGebruiker(userId: string, reden = 'tech-uit'): number {
  let n = 0;
  for (const s of [...sessies.values()]) if (s.userId === userId && s.open) { afsluiten(s, reden); n++; }
  return n;
}

async function controleren(s: Sessie) {
  if (!s.open) return;
  const nu = Date.now();
  if (nu >= s.eind) return afsluiten(s, 'tijd', 0x020A);
  if (s.klaar && nu - s.laatsteInvoer >= REMOTE_INACTIEF_MS) return afsluiten(s, 'inactief', 0x020A);
  // Strikt: dezelfde activering als bij het openen (opnieuw activeren of vervangen = opnieuw bevestigen).
  try { const a = await actieveActivatie(s.userId, s.tab, s.techSessie); if (!a || a.id !== s.activatieId) afsluiten(s, 'tech-uit'); } catch { /* db even weg: volgende ronde */ }
  if (s.open && !s.ws) await eigenCookiesLaden(s.userId); // wacht nog op het ticket: de bekende cookies vers houden
}
/** Meteen controleren (haak van tech-profiel na uitloggen, intrekken, zelf beëindigen). */
export function herControleren(userId: string): Promise<void[]> {
  return Promise.all([...sessies.values()].filter((s) => s.userId === userId && s.open).map((s) => controleren(s)));
}
bijTechEinde((userId) => { void herControleren(userId); });

// ---------------------------------------------------------------- opslag
type Rij = { id: string; naam: string; protocol: RemoteProtocol; host: string; poort: number; gebruiker: string; geheim_naam: string; instellingen: unknown; gewijzigd_op: Date };
const verbindingUit = (r: Rij) => ({ id: r.id, naam: r.naam, protocol: r.protocol, host: r.host, poort: r.poort, gebruiker: r.gebruiker, heeftGeheim: !!r.geheim_naam, instellingen: instellingenNormaliseren(r.instellingen), gewijzigd: new Date(r.gewijzigd_op).getTime() });

async function toegestaneHosts(userId: string): Promise<string[]> {
  const r = (await sys().query('SELECT toegestane_hosts FROM app.remote_instellingen WHERE user_id = $1', [userId])).rows[0];
  return (r?.toegestane_hosts as string[] | undefined) ?? [];
}
async function verbindingVan(userId: string, id: string): Promise<Rij> {
  if (!/^[0-9a-f-]{36}$/.test(id)) fout('VERBINDING_NIET_GEVONDEN', 404);
  const r = (await sys().query('SELECT * FROM app.remote_verbindingen WHERE id = $1 AND user_id = $2', [id, userId])).rows[0] as Rij | undefined;
  if (!r) fout('VERBINDING_NIET_GEVONDEN', 404);
  return r!;
}

function alleenEigenaar(u: Gebruiker) { if (!isEigenaar(u)) fout('REMOTE_ALLEEN_EIGENAAR', 403); }
async function vereisTech(u: Gebruiker, tab: string, techSessie: TechSessie | null) {
  alleenEigenaar(u);
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab, techSessie);
  if (!a) fout('TECH_PROFIEL_VEREIST', 403);
  return a!;
}

export async function stand(u: Gebruiker, tab: string, techSessie: TechSessie | null) {
  alleenEigenaar(u);
  const tech = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab, techSessie) : null;
  const [aan, guacd, kluis] = await Promise.all([remoteAan(), tcpOpen(guacdHost(), guacdPoort(), 1000), vaultEncryptionReady().catch(() => false)]);
  const rows = (await sys().query('SELECT * FROM app.remote_verbindingen WHERE user_id = $1 ORDER BY naam', [u.id])).rows as Rij[];
  return {
    aan, guacd, kluis, techActief: !!tech, techEind: tech?.eind ?? null,
    verbindingen: rows.map(verbindingUit), toegestaneHosts: await toegestaneHosts(u.id),
    actief: actieveSessies(u.id).map((s) => ({ sid: s.sid, naam: s.naam, protocol: s.protocol, host: s.host, begin: s.begin, eind: s.eind, verbonden: !!s.ws })),
  };
}

export async function opslaan(u: Gebruiker, b: Record<string, unknown>) {
  alleenEigenaar(u);
  const naam = String(b.naam ?? '').trim().replace(/\s+/g, ' ');
  if (naam.length < 1 || naam.length > 60) fout('NAAM_ONGELDIG');
  const protocol = String(b.protocol) as RemoteProtocol;
  if (!REMOTE_PROTOCOLLEN.includes(protocol)) fout('PROTOCOL_ONGELDIG');
  const host = String(b.host ?? '').trim().replace(/^\[|\]$/g, '');
  if (!hostGeldig(host)) fout('HOST_ONGELDIG');
  const poort = b.poort === undefined || b.poort === '' ? STANDAARD_POORT[protocol] : Math.round(Number(b.poort));
  if (!Number.isInteger(poort) || poort < 1 || poort > 65535) fout('POORT_ONGELDIG');
  const gebruiker = String(b.gebruiker ?? '').trim().slice(0, 120);
  const instellingen = instellingenNormaliseren(b.instellingen);
  await doelOplossen(host, await toegestaneHosts(u.id)); // ook bij opslaan: een verkeerd doel meteen melden
  const bestaand = b.id ? await verbindingVan(u.id, String(b.id)) : null;
  const id = bestaand?.id ?? randomUUID();
  let geheimNaam = bestaand?.geheim_naam ?? '';
  const geheim = typeof b.geheim === 'string' ? b.geheim : '';
  if (geheim) {
    if (geheim.length > 8000) fout('GEHEIM_TE_GROOT');
    if (!(await vaultEncryptionReady())) fout('KLUIS_NIET_KLAAR', 503);
    geheimNaam = `remote-${id.slice(0, 8)}`;
    try { await ownerVaultBewarenIntern(u.id, geheimNaam, protocol === 'ssh' ? 'ssh' : 'other', 'remote-desktop', geheim); }
    catch (e) { fout((e as Error).message === 'OWNER_VAULT_LIMIT_REACHED' ? 'KLUIS_VOL' : 'KLUIS_NIET_KLAAR', 503); }
  }
  if (bestaand) {
    await sys().query('UPDATE app.remote_verbindingen SET naam=$3, protocol=$4, host=$5, poort=$6, gebruiker=$7, geheim_naam=$8, instellingen=$9, gewijzigd_op=now() WHERE id=$1 AND user_id=$2',
      [id, u.id, naam, protocol, host, poort, gebruiker, geheimNaam, JSON.stringify(instellingen)]);
  } else {
    const aantal = Number((await sys().query('SELECT count(*)::int AS n FROM app.remote_verbindingen WHERE user_id = $1', [u.id])).rows[0]?.n || 0);
    if (aantal >= 50) fout('TE_VEEL_VERBINDINGEN', 429);
    await sys().query('INSERT INTO app.remote_verbindingen (id, user_id, naam, protocol, host, poort, gebruiker, geheim_naam, instellingen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, u.id, naam, protocol, host, poort, gebruiker, geheimNaam, JSON.stringify(instellingen)]);
  }
  await audit(u.id, bestaand ? 'owner.remote.verbinding.gewijzigd' : 'owner.remote.verbinding.toegevoegd', { verbinding: id, naam, protocol, host, poort, nieuwGeheim: !!geheim, instellingen });
  return verbindingUit((await sys().query('SELECT * FROM app.remote_verbindingen WHERE id = $1', [id])).rows[0] as Rij);
}

export async function verwijderen(u: Gebruiker, id: string) {
  alleenEigenaar(u);
  const r = await verbindingVan(u.id, id);
  for (const s of [...sessies.values()]) if (s.verbindingId === id) afsluiten(s, 'verbinding-verwijderd');
  await sys().query('DELETE FROM app.remote_verbindingen WHERE id = $1 AND user_id = $2', [id, u.id]);
  if (r.geheim_naam) await ownerVaultVerwijderenIntern(u.id, r.geheim_naam).catch(() => false);
  await audit(u.id, 'owner.remote.verbinding.verwijderd', { verbinding: id, naam: r.naam, host: r.host });
  return { ok: true };
}

export async function hostsZetten(u: Gebruiker, lijstIn: unknown) {
  alleenEigenaar(u);
  const lijst = (Array.isArray(lijstIn) ? lijstIn : []).map((h) => String(h).trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  if (lijst.length > 20 || lijst.some((h) => !hostGeldig(h))) fout('HOST_ONGELDIG');
  const voor = await toegestaneHosts(u.id);
  const uniek = [...new Set(lijst)];
  await sys().query(`INSERT INTO app.remote_instellingen (user_id, toegestane_hosts) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET toegestane_hosts = EXCLUDED.toegestane_hosts, gewijzigd_op = now()`, [u.id, uniek]);
  await audit(u.id, 'owner.remote.hosts.gewijzigd', { voor, na: uniek });
  return { toegestaneHosts: uniek };
}

export async function testen(u: Gebruiker, id: string) {
  alleenEigenaar(u);
  const r = await verbindingVan(u.id, id);
  const ip = await doelOplossen(r.host, await toegestaneHosts(u.id));
  const begin = Date.now();
  const ok = await tcpOpen(ip, r.poort, 3000);
  return { ok, ip, ms: Date.now() - begin, code: ok ? '' : 'TCP_DICHT' };
}

export async function openen(u: Gebruiker, tab: string, techSessie: TechSessie | null, b: Record<string, unknown>) {
  if (!(await remoteAan())) fout('REMOTE_UIT', 409);
  const act = await vereisTech(u, tab, techSessie);
  const r = await verbindingVan(u.id, String(b.id || ''));
  if (actieveSessies(u.id).length >= REMOTE_MAX_SESSIES) fout('TE_VEEL_SESSIES', 429);
  const ip = await doelOplossen(r.host, await toegestaneHosts(u.id));
  if (!(await tcpOpen(guacdHost(), guacdPoort(), 1500))) fout('GUACD_ONBEREIKBAAR', 503);
  let geheim = '';
  if (r.geheim_naam) { try { geheim = await readOwnerVaultPlaintext(u.id, r.geheim_naam); } catch { fout('KLUIS_NIET_KLAAR', 503); } }
  const inst = instellingenNormaliseren({ ...(r.instellingen as object), ...(b.breedte ? { breedte: b.breedte, hoogte: b.hoogte, dpi: b.dpi } : {}) });
  const sid = randomUUID(), nonce = randomBytes(18).toString('base64url');
  const begin = Date.now();
  const eind = Math.min(begin + REMOTE_MAX_MINUTEN * 60_000, act.eind);
  const s: Sessie = { sid, userId: u.id, tab, techSessie, verbindingId: r.id, naam: r.naam, protocol: r.protocol, host: r.host, ip, poort: r.poort, gebruiker: r.gebruiker, geheim,
    instellingen: inst, nonce, ticketExp: begin + REMOTE_TICKET_MS, begin, eind, laatsteInvoer: begin, ws: null, guacd: null, open: true, klaar: false, bytesIn: 0, bytesUit: 0, activatieId: act.id, timer: null };
  await sys().query(`INSERT INTO app.remote_sessies (id, user_id, verbinding_id, naam, protocol, host, ip, poort, begin_op, eind_gepland, opname, activatie_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9 / 1000.0),to_timestamp($10 / 1000.0),$11,$12)`,
    [sid, u.id, r.id, r.naam, r.protocol, r.host, ip, r.poort, begin, eind, inst.opnemen ? `${opnamePad()}/${sid}` : '', act.id]);
  sessies.set(sid, s);
  await eigenCookiesLaden(u.id); // SEC-002 (slot t): de browser van de eigenaar herkennen zonder databasevraag in upgrade()
  s.timer = setInterval(() => { void controleren(s); }, CONTROLE_MS());
  s.timer.unref?.();
  // Ticket niet gebruikt binnen 60 s: sessie dicht (geen half open toegang).
  setTimeout(() => { const x = sessies.get(sid); if (x && !x.ws) afsluiten(x, 'geen-browser'); }, REMOTE_TICKET_MS + 2_000).unref?.();
  await audit(u.id, 'owner.remote.geopend', { sessie: sid, verbinding: r.naam, protocol: r.protocol, host: r.host, ip, poort: r.poort, opname: inst.opnemen, klembord: inst.klembord, bestanden: inst.bestanden, viaActivatie: act.id, eindGepland: new Date(eind).toISOString() });
  return { sid, ticket: ticketMaken(sid, nonce, s.ticketExp), verloopt: s.ticketExp, eind, naam: r.naam, protocol: r.protocol, inactiefMs: REMOTE_INACTIEF_MS };
}

export function sluitEigen(u: Gebruiker, sid: string) {
  const s = sessies.get(sid);
  if (!s || s.userId !== u.id) fout('SESSIE_NIET_GEVONDEN', 404);
  afsluiten(s!, 'gesloten');
  return { ok: true };
}

export async function geschiedenis(u: Gebruiker) {
  alleenEigenaar(u);
  const rows = (await sys().query('SELECT * FROM app.remote_sessies WHERE user_id = $1 ORDER BY begin_op DESC LIMIT 50', [u.id])).rows;
  return { sessies: rows.map((r) => ({ id: r.id, naam: r.naam, protocol: r.protocol, host: r.host, poort: r.poort, begin: new Date(r.begin_op).getTime(), eindGepland: new Date(r.eind_gepland).getTime(), einde: r.einde_op ? new Date(r.einde_op).getTime() : null, reden: r.einde_reden, bytesIn: Number(r.bytes_in), bytesUit: Number(r.bytes_uit), opname: !!r.opname, open: sessies.has(r.id) })) };
}

// ---------------------------------------------------------------- tunnel
function naarGuacd(s: Sessie): Promise<void> {
  return new Promise((res, rej) => {
    const sock = tcpConnect({ host: guacdHost(), port: guacdPoort() });
    s.guacd = sock;
    const dec = new StringDecoder('utf8');
    let buf = '', fase: 'args' | 'ready' | 'relay' = 'args';
    const t = setTimeout(() => { rej(new Error('GUACD_TIMEOUT')); sock.destroy(); }, 10_000);
    sock.once('connect', () => sock.write(guacInstructie('select', s.protocol)));
    sock.on('data', (chunk: Buffer) => {
      s.bytesUit += chunk.length;
      buf += dec.write(chunk);
      let ontleed;
      try { ontleed = guacOntleed(buf); } catch { afsluiten(s, 'guacd-protocol'); return; }
      buf = ontleed.rest;
      const door: string[] = [];
      for (const ins of ontleed.instructies) {
        if (fase === 'args') {
          if (ins.opcode !== 'args') { clearTimeout(t); rej(new Error(ins.opcode === 'error' ? `GUACD_FOUT:${ins.args[0] || ''}` : 'GUACD_PROTOCOL')); return; }
          const i = s.instellingen;
          sock.write(guacInstructie('size', i.breedte, i.hoogte, i.dpi) + guacInstructie('audio') + guacInstructie('video') + guacInstructie('image', 'image/png', 'image/jpeg', 'image/webp')
            + guacInstructie('timezone', 'Europe/Brussels')
            + guacInstructie('connect', ...connectWaarden(ins.args, { protocol: s.protocol, ip: s.ip, poort: s.poort, gebruiker: s.gebruiker, wachtwoord: s.protocol === 'ssh' && (s.geheim || '').includes('PRIVATE KEY') ? '' : (s.geheim || ''), sleutel: (s.geheim || '').includes('PRIVATE KEY') ? s.geheim || '' : '', instellingen: i, opnamePad: opnamePad(), opnameNaam: s.sid })));
          s.geheim = null; // na het doorgeven nooit meer in het geheugen
          fase = 'ready';
          continue;
        }
        if (fase === 'ready') {
          if (ins.opcode === 'ready') { clearTimeout(t); fase = 'relay'; s.klaar = true; res(); continue; }
          if (ins.opcode === 'error') { clearTimeout(t); rej(new Error(`GUACD_FOUT:${ins.args[0] || ''}`)); return; }
          continue;
        }
        if (ins.opcode === 'clipboard' && !s.instellingen.klembord) continue;
        door.push(ins.tekst);
      }
      if (door.length && s.ws) { try { s.ws.send(door.join('')); } catch { /* dicht */ } }
    });
    sock.on('error', (e) => { clearTimeout(t); if (fase !== 'relay') rej(e); else afsluiten(s, 'guacd-fout'); });
    sock.on('close', () => { if (fase === 'relay') afsluiten(s, 'doel-gesloten'); });
  });
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, handleProtocols: (p) => (p.has('guacamole') ? 'guacamole' : false) });
// SEC-002 (server-uitrol-03): grenzen VÓÓR de aanmelding. Wie nog geen ticket toonde, is een onbekende: het ticket is hoogstens
// 300 tekens en Guacamole.Client stuurt vooraf alleen nop/sync/size/ping (tientallen bytes). Vroeger groeide de buffer onbeperkt
// (berichten tot 4 MiB) en werd hij bij elk bericht opnieuw van voren ontleed; één anonieme client kon zo de hele server laten haperen.
// Межі до входу: невідомий клієнт не може накопичувати дані; порушення → з’єднання обривається одразу (terminate), а не «колись».
const VOOR_AUTH_MAX_BYTES = 8 * 1024;       // één bericht én de hele wachtende buffer
const VOOR_AUTH_MAX_BERICHTEN = 100;        // WebSocket-berichten vóór «mr-auth»
const VOOR_AUTH_MAX_INSTRUCTIES = 50;       // nop/sync/size/ping vóór «mr-auth»
const VOOR_AUTH_ONTLEDEN = { maxInstructie: 2 * 1024, maxElementen: 16 } as const;
const NA_AUTH_MAX_ELEMENT = 256 * 1024;
const MAX_ONAANGEMELD = 8;                  // gelijktijdige verbindingen die nog geen geldig ticket toonden
const WACHTRIJ_MAX_BYTES = 1024 * 1024;    // invoer die wacht tot guacd klaar is (hoogstens 10 s): klein houden
const MAX_EIGENAAR_WACHTEND = 8;            // verbindingen van de eigen browser (tech-cookie) die nog geen ticket toonden — eigen pool
let onaangemeld = 0, eigenaarWachtend = 0;
export const _onaangemeld = () => onaangemeld;
// Eén regel per minuut in het serverlogboek als onaangemelde verbindingen op een grens stuiten (geen logboekvloed bij een aanval).
let afgebrokenTeller = 0, afgebrokenGemeld = 0;
function meldAfgebroken(waarom: string) {
  afgebrokenTeller += 1;
  const nu = Date.now();
  if (nu - afgebrokenGemeld < 60_000) return;
  afgebrokenGemeld = nu;
  console.warn(`[extern-bureaublad] tunnel: ${afgebrokenTeller} onaangemelde verbinding(en) geweigerd of afgebroken (laatste reden: ${waarom})`);
  afgebrokenTeller = 0;
}

/**
 * SEC-002 (na de controle, g01-4): een weigering of afbraak van een verbinding ZONDER geldig ticket laat ook een auditregel en een
 * beveiligingsmelding achter — voor elke eigenaar met een open sessie (alleen dan bestaat de tunnel voor een buitenstaander). Gebundeld:
 * hoogstens één auditregel + één melding per minuut per eigenaar, met het aantal en de redenen sinds de vorige.
 * Відмова або обрив з’єднання без чинного квитка — запис аудиту й сповіщення власникові відкритого сеансу (не частіше разу на хвилину).
 */
const weigeringen = new Map<string, { aantal: number; redenen: Set<string>; laatste: number }>();
export const _weigeringenLeeg = () => weigeringen.clear();
function meldGeweigerd(waarom: string) {
  meldAfgebroken(waarom);
  const nu = Date.now();
  const eigenaars = new Set<string>();
  for (const x of sessies.values()) if (x.open) eigenaars.add(x.userId);
  for (const uid of eigenaars) {
    const st = weigeringen.get(uid) ?? { aantal: 0, redenen: new Set<string>(), laatste: 0 };
    weigeringen.set(uid, st);
    st.aantal += 1;
    if (st.redenen.size < 8) st.redenen.add(waarom);
    if (nu - st.laatste < 60_000) continue;
    const aantal = st.aantal, reden = [...st.redenen].join('; ');
    st.laatste = nu; st.aantal = 0; st.redenen.clear();
    void audit(uid, 'owner.remote.tunnel.geweigerd', { aantal, reden }, 'denied');
    void meld(uid, 'security',
      'Віддалений стіл: відхилено з’єднання без входу / Extern bureaublad: verbinding zonder aanmelding geweigerd',
      `Хтось без чинного квитка намагався під’єднатися до тунелю віддаленого столу, поки у вас відкритий сеанс (спроб: ${aantal}). З’єднання відхилено. Якщо це були не ви — закрийте сеанс і перевірте пристрої. / `
      + `Iemand zonder geldig ticket probeerde verbinding te maken met de tunnel van het externe bureaublad terwijl u een sessie open hebt (pogingen: ${aantal}). De verbinding is geweigerd. Was u dit niet, sluit dan de sessie en controleer uw apparaten.`,
    ).catch(() => undefined);
  }
}

/**
 * SEC-002 (na de controle, g01-2): wie is de eigenaar van deze browser? Via de HttpOnly tech-cookie (SameSite=Strict, alleen geldig zolang
 * een technische activering of ruimtesessie loopt — dezelfde regel als /assets/tech/*, backend/tech-bundels.ts). Een anoniem kan die cookie
 * niet maken; zo kan hij met onaangemelde verbindingen de eigenaar niet meer buitensluiten. Vervangbaar in tests.
 */
type CookieEigenaar = (cookie: string | undefined) => Promise<string | null>;
const eigenaarUitCookieDb: CookieEigenaar = async (cookie) => {
  const sleutel = sleutelUitCookie(cookie);
  if (!sleutel) return null;
  try {
    const r = (await sys().query(
      `SELECT t.user_id
         FROM app.tech_asset_toegang t
         LEFT JOIN app.tech_activaties a ON a.id = t.activatie_id AND a.beeindigd_op IS NULL AND a.eind_op > now()
         LEFT JOIN app.tech_ruimte_sessies v ON v.id = t.ruimte_sessie_id AND v.beeindigd_op IS NULL AND v.grens_op > now() AND (v.modus <> 'tijd' OR v.eind_op > now())
        WHERE t.sleutel_hash = $1 AND t.verloopt_op > now() AND (a.id IS NOT NULL OR v.id IS NOT NULL)`,
      [createHash('sha256').update(sleutel).digest('hex')])).rows[0];
    return r ? String(r.user_id) : null;
  } catch { return null; }
};
let eigenaarUitCookie: CookieEigenaar = eigenaarUitCookieDb;
export function _zetCookieEigenaar(f: CookieEigenaar | null) { eigenaarUitCookie = f ?? eigenaarUitCookieDb; }
const wachtOpTicket = (userId?: string) => { for (const x of sessies.values()) if (x.open && !x.ws && (!userId || x.userId === userId)) return true; return false; };
const berichtLengte = (raw: unknown): number => (Array.isArray(raw) ? raw.reduce((n: number, b: Buffer) => n + b.length, 0) : (raw as { byteLength?: number; length?: number })?.byteLength ?? (raw as { length?: number })?.length ?? 0);

/** `eigenaar`: user-id uit de tech-cookie (g01-2) — telt in een eigen pool en mag alleen een ticket van een EIGEN sessie gebruiken. */
export function tunnelVerbinding(ws: WebSocket, eigenaar?: string) {
  let s: Sessie | null = null;
  let buf = '';
  const wachtrij: string[] = []; let wachtrijBytes = 0;
  let voorAuth = 0, berichten = 0;
  let dicht = false;   // na het begin van sluiten wordt geen enkel bericht meer verwerkt
  let geteld = true;
  if (eigenaar) eigenaarWachtend += 1; else onaangemeld += 1;
  const vrij = () => { if (geteld) { geteld = false; if (eigenaar) eigenaarWachtend -= 1; else onaangemeld -= 1; } };
  /** g01-4: weigeringen van onbekenden ook in audit + melding; die van de eigen browser niet (dat is de eigenaar zelf). */
  const meldAnoniem = (waarom: string) => { if (eigenaar) meldAfgebroken(waarom); else meldGeweigerd(waarom); };
  /** Hard afbreken (geen sluit-handdruk afwachten): voor schendingen van de grenzen. */
  const breek = () => { dicht = true; buf = ''; try { ws.terminate(); } catch { /* al dicht */ } };
  /** Net sluiten (de browser ziet de code), maar niets meer verwerken en na 1 s hoe dan ook afbreken. */
  const sluit = (code: number, status: number) => {
    if (dicht) return;
    dicht = true; buf = '';
    try { ws.close(code, String(status)); } catch { /* al dicht */ }
    setTimeout(() => { try { ws.terminate(); } catch { /* al dicht */ } }, 1_000).unref?.();
  };
  const t = setTimeout(() => { if (!s) { meldAnoniem('geen ticket binnen 5 s'); sluit(4401, 0x0301); } }, 5_000);
  ws.send(guacInstructie('', randomUUID())); // tunnel-UUID: de client gaat naar OPEN en mag daarna «mr-auth» sturen
  ws.on('message', (raw) => {
    if (dicht || (s && !s.open)) return; // ook na het einde van de sessie (tijd, inactiviteit, tech-uit) niets meer verwerken
    if (!s) {
      berichten += 1;
      if (berichten > VOOR_AUTH_MAX_BERICHTEN || berichtLengte(raw) > VOOR_AUTH_MAX_BYTES || buf.length + berichtLengte(raw) > VOOR_AUTH_MAX_BYTES) { meldAnoniem('te veel of te grote berichten vóór de aanmelding'); breek(); return; }
    }
    buf += raw.toString();
    let ontleed;
    try { ontleed = s ? guacOntleed(buf, NA_AUTH_MAX_ELEMENT) : guacOntleed(buf, VOOR_AUTH_MAX_BYTES, VOOR_AUTH_ONTLEDEN); }
    catch { if (s) { sluit(4400, 0x0300); afsluiten(s, 'browser-protocol'); } else { meldAnoniem('ongeldige of te grote instructie vóór de aanmelding'); breek(); } return; }
    buf = ontleed.rest;
    for (const ins of ontleed.instructies) {
      if (dicht) return;
      if (!s && ++voorAuth > VOOR_AUTH_MAX_INSTRUCTIES) { meldAnoniem('te veel instructies vóór de aanmelding'); sluit(4401, 0x0301); return; }
      if (ins.opcode === '') { if (ins.args[0] === 'ping') ws.send(ins.tekst); continue; } // interne ping terugsturen
      if (!s) {
        // Guacamole.Client kan vóór de aanmelding al nop/sync/size sturen: negeren (begrensd); alles wordt pas na «mr-auth» doorgegeven.
        if (ins.opcode !== 'mr-auth') continue;
        const tk = ticketLezen(ins.args[0]);
        const x = tk ? sessies.get(tk.sid) : undefined;
        if (!tk || !x || !x.open || x.ws || x.nonce !== tk.nonce || x.ticketExp < Date.now() || (eigenaar && x.userId !== eigenaar)) { meldAnoniem('ongeldig of al gebruikt ticket'); sluit(4403, 0x0303); return; }
        clearTimeout(t);
        vrij();
        x.nonce = ''; // eenmalig
        x.ws = ws; s = x;
        naarGuacd(x).then(() => {
          void audit(x.userId, 'owner.remote.verbonden', { sessie: x.sid, verbinding: x.naam, protocol: x.protocol, host: x.host });
          try { ws.send(guacInstructie('mr-info', x.sid, x.eind, REMOTE_INACTIEF_MS)); } catch { /* dicht */ }
          for (const w of wachtrij.splice(0)) x.guacd?.write(w);
        }).catch((e: Error) => {
          void audit(x.userId, 'owner.remote.mislukt', { sessie: x.sid, verbinding: x.naam, host: x.host, fout: String(e.message).slice(0, 120) }, 'failure');
          afsluiten(x, String(e.message).startsWith('GUACD_FOUT') ? 'doel-weigert' : 'guacd-onbereikbaar', 0x0207);
        });
        continue;
      }
      if (ins.opcode === 'mr-auth') continue;
      if (!s.instellingen.bestanden && BESTAND_OPCODES.has(ins.opcode)) continue;
      if (!s.instellingen.klembord && ins.opcode === 'clipboard') continue;
      if (ins.opcode === 'disconnect') { dicht = true; afsluiten(s, 'gesloten', 0); return; }
      if (ACTIVITEIT_OPCODES.has(ins.opcode)) s.laatsteInvoer = Date.now();
      s.bytesIn += ins.tekst.length;
      if (s.klaar && s.guacd) s.guacd.write(ins.tekst);
      else if (wachtrij.length < 200 && wachtrijBytes + ins.tekst.length <= WACHTRIJ_MAX_BYTES) { wachtrij.push(ins.tekst); wachtrijBytes += ins.tekst.length; }
    }
  });
  ws.on('close', () => { dicht = true; clearTimeout(t); vrij(); if (s && s.open) afsluiten(s, 'browser-weg'); });
  ws.on('error', () => undefined);
}

/**
 * WS-upgrade (aangeroepen door de gateway voor REMOTE_WS_PATH): alleen vanaf de eigen site (Origin = Host).
 * SEC-002 (server-uitrol-03): Origin is voor een niet-browser vrij te kiezen, dus dat alleen is geen poort. Daarom ook:
 *  - zonder één open sessie van de eigenaar (geopend met passkey in een technisch profiel) heeft niemand hier iets te zoeken → 403
 *    nog vóór de WebSocket-handdruk; de schakelaar «guacamole» uit betekent dus ook: geen tunnel voor onbekenden;
 *  - hoogstens MAX_ONAANGEMELD verbindingen tegelijk die nog geen geldig ticket toonden → 503.
 * Na de controle (g01-2): die gedeelde grens kon een anoniem helemaal vullen, en dan kreeg de eigenaar met een geldig ticket ook 503.
 * Nu krijgt de browser van de eigenaar — herkend aan de HttpOnly tech-cookie van een lopende technische activering, terwijl een sessie
 * van DIEZELFDE eigenaar op haar ticket wacht — een eigen pool (MAX_EIGENAAR_WACHTEND) die anoniemen niet kunnen vullen. Elke weigering
 * van een onbekende → audit + melding (g01-4).
 * SEC-002 (afwerking A, g01-2 «оракул»): de anonieme weg is weg. ELKE verbinding moet de tech-cookie van de eigenaar tonen van wie op
 * dat moment een sessie op haar ticket wacht; anders 403 — ook als er wél een open sessie is.
 * SEC-002 (slot t, toets-g01-6): de rest van het «oracle» is ook dicht. Vroeger keek upgrade() EERST naar de stand (open sessie? wacht
 * er een op haar ticket?) en zocht pas dan de cookie op: zonder sessie meteen 403, met een wachtende sessie 403 ná een databasevraag
 * (meetbaar) of 503 als 16 opzoekingen liepen; en wie die 16 plaatsen bezet hield, sloot de eigenaar met 503 buiten. Nu:
 *  - de stand wordt pas gelezen NA de cookie; elke verbinding met een cookie van de juiste vorm kost dus precies één opzoeking,
 *    met of zonder sessie — zelfde werk, zelfde tijd;
 *  - wie zich niet als eigenaar toont krijgt altijd EXACT hetzelfde antwoord (403, zelfde bytes) — ook als de opzoekplaatsen vol
 *    zijn (geen 503 meer voor onbekenden); audit + melding (g01-4) pas NA het antwoord, zodat ook dat de tijd niet beïnvloedt;
 *  - de cookies van een eigenaar met een open sessie staan in het geheugen (bekendeCookies): zijn browser gaat zonder opzoeking
 *    en buiten de gedeelde opzoekplaatsen door. Een 503 bestaat alleen nog voor de eigenaar zelf (eigen pool vol).
 * Тепер: стан сеансу читається лише ПІСЛЯ cookie; анонім завжди отримує той самий 403 за той самий час; власник (cookie в пам'яті)
 * має окремі місця й не стоїть у черзі пошуків, яку може заповнити анонім.
 */
const MAX_COOKIE_OPZOEKINGEN = 16; // gelijktijdige databasevragen voor cookies die (nog) niet als die van de eigenaar bekend zijn
let cookieOpzoekingen = 0;
const WEIGER_403 = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n';
export function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const weiger = (regel: string) => { socket.write(`HTTP/1.1 ${regel}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  /** Elke weigering van wie zich niet als eigenaar toonde: dezelfde bytes; audit + melding pas na het antwoord. */
  const onbekend = (waarom: string) => {
    if (socket.destroyed) return;
    socket.write(WEIGER_403); socket.destroy();
    setImmediate(() => meldGeweigerd(waarom));
  };
  const eigenaarDoor = (uid: string) => {
    if (eigenaarWachtend >= MAX_EIGENAAR_WACHTEND) { meldAfgebroken('te veel wachtende verbindingen van de eigenaar'); weiger('503 Service Unavailable'); return; }
    wss.handleUpgrade(req, socket, head, (ws) => tunnelVerbinding(ws, uid));
  };
  const host = String(req.headers.host || '').toLowerCase();
  let origin = '';
  try { origin = new URL(String(req.headers.origin || '')).host.toLowerCase(); } catch { origin = ''; }
  if (!origin || origin !== host) { socket.write(WEIGER_403); socket.destroy(); return; }
  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
  const sleutel = sleutelUitCookie(cookie);
  if (!sleutel) { onbekend('geen geldige tech-cookie'); return; }
  const hash = createHash('sha256').update(sleutel).digest('hex');
  // De eigen browser van een eigenaar met een open sessie: geen opzoeking, niet in de gedeelde rij.
  const bekend = bekendeCookies.get(hash);
  if (bekend && bekend.tot <= Date.now()) bekendeCookies.delete(hash);
  else if (bekend && wachtOpTicket(bekend.userId)) { eigenaarDoor(bekend.userId); return; }
  // Alle andere cookies van de juiste vorm: altijd één opzoeking, wat de stand ook is (geen tijdsverschil met/zonder sessie).
  if (cookieOpzoekingen >= MAX_COOKIE_OPZOEKINGEN) { meldAfgebroken('te veel cookie-opzoekingen tegelijk'); onbekend('te veel cookie-opzoekingen tegelijk'); return; }
  // De http-server heeft zijn foutafhandeling van deze socket al weggenomen: tijdens het opzoeken een stille afhandelaar, anders
  // laat een verbroken verbinding het proces vallen.
  socket.on('error', () => undefined);
  cookieOpzoekingen += 1;
  void eigenaarUitCookie(cookie).catch(() => null).then((uid) => {
    cookieOpzoekingen -= 1;
    if (socket.destroyed) return;
    if (!uid || !wachtOpTicket(uid)) { onbekend('tech-cookie zonder eigen wachtende sessie'); return; }
    // Onthouden tot de volgende verversing (controleren) of tot de laatste sessie van deze eigenaar sluit.
    bekendeCookies.set(hash, { userId: uid, tot: Date.now() + REMOTE_TICKET_MS });
    eigenaarDoor(uid);
  });
}
