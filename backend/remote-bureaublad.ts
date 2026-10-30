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
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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

function afsluiten(s: Sessie, reden: string, statusCode = 0x020B) {
  if (!s.open) return;
  s.open = false;
  s.geheim = null;
  if (s.timer) clearInterval(s.timer);
  sessies.delete(s.sid);
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
export function tunnelVerbinding(ws: WebSocket) {
  let s: Sessie | null = null;
  let buf = '';
  const wachtrij: string[] = [];
  let voorAuth = 0;
  const t = setTimeout(() => { if (!s) ws.close(4401, String(0x0301)); }, 5_000);
  ws.send(guacInstructie('', randomUUID())); // tunnel-UUID: de client gaat naar OPEN en mag daarna «mr-auth» sturen
  ws.on('message', (raw) => {
    buf += raw.toString();
    let ontleed;
    try { ontleed = guacOntleed(buf, 256 * 1024); } catch { ws.close(4400, String(0x0300)); if (s) afsluiten(s, 'browser-protocol'); return; }
    buf = ontleed.rest;
    for (const ins of ontleed.instructies) {
      if (ins.opcode === '') { if (ins.args[0] === 'ping') ws.send(ins.tekst); continue; } // interne ping terugsturen
      if (!s) {
        // Guacamole.Client kan vóór de aanmelding al nop/sync/size sturen: negeren (begrensd); alles wordt pas na «mr-auth» doorgegeven.
        if (ins.opcode !== 'mr-auth') { if (++voorAuth > 50) { ws.close(4401, String(0x0301)); return; } continue; }
        const tk = ticketLezen(ins.args[0]);
        const x = tk ? sessies.get(tk.sid) : undefined;
        if (!tk || !x || !x.open || x.ws || x.nonce !== tk.nonce || x.ticketExp < Date.now()) { ws.close(4403, String(0x0303)); return; }
        clearTimeout(t);
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
      if (ins.opcode === 'disconnect') { afsluiten(s, 'gesloten', 0); return; }
      if (ACTIVITEIT_OPCODES.has(ins.opcode)) s.laatsteInvoer = Date.now();
      s.bytesIn += ins.tekst.length;
      if (s.klaar && s.guacd) s.guacd.write(ins.tekst); else if (wachtrij.length < 200) wachtrij.push(ins.tekst);
    }
  });
  ws.on('close', () => { clearTimeout(t); if (s && s.open) afsluiten(s, 'browser-weg'); });
  ws.on('error', () => undefined);
}

/** WS-upgrade (aangeroepen door de gateway voor REMOTE_WS_PATH): alleen vanaf de eigen site (Origin = Host). */
export function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const host = String(req.headers.host || '').toLowerCase();
  let origin = '';
  try { origin = new URL(String(req.headers.origin || '')).host.toLowerCase(); } catch { origin = ''; }
  if (!origin || origin !== host) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, tunnelVerbinding);
}
