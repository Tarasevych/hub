// «Рішення власника з підписом passkey» (22.10.2026, zone B; deploy/RUNBOOK-VEILIGE-UITROL.md §15).
//
// Twee besluiten die tot nu toe een SSH-sessie vroegen, gaan nu hetzelfde pad als het goedkeuren van updates (backend/uitrol-goedkeuring.ts):
//   terugdraaien   «Відкат до попереднього» op mcp.*/dashboard — zonder "opdracht.terugdraaien": true in het root-bestand;
//   externe-hosts  de witte lijst `externeMcpHosts` in /etc/mijn-ruimte/mcp-rechten.json (mcp.*/agenten → «Зовнішні MCP»).
//
//   1. starten      — de app normaliseert de inhoud (besluit-kern.mjs, gedeeld met root), rekent de hash uit en maakt een eenmalige
//                     WebAuthn-challenge (doel 'eigenaar-besluit', ≤ 5 min, app.goedkeur_uitdagingen). Rij in app.eigenaar_besluiten: ontwerp.
//   2. ondertekenen — de browser tekende met de passkey; de app controleert de assertie vooraf (snelle melding), legt
//                     besluit-<id>.json in /srv/mijn-ruimte/besluit-inbox en tikt `aanvraag` aan. Root (mijn-ruimte-besluit.path →
//                     mijn-ruimte-besluit.service) rekent hash en handtekening ZELF opnieuw uit tegen /etc/mijn-ruimte/goedkeur-passkeys.json
//                     en voert pas dan uit. Zonder de passkey van de eigenaar gebeurt er niets; het rechtenbestand blijft van root.
//   3. status       — de uitkomst komt uit /var/lib/mijn-ruimte-uitrol-status/besluit-<id>.json (root:mijnruimte 0640); de app neemt
//                     haar over in de rij (klaar | geweigerd | mislukt) en sluit na 15 min zonder antwoord af als verlopen.
// Alleen de eigenaar (rol + OWNER_EMAIL), op mcp.* of admin.*; agents nooit (er bestaat geen hulpmiddel voor).
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import * as bk from '../deploy/goedkeuring/besluit-kern.mjs';
import { error, isOwnerEmail, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { schoonHostLijst } from '../shared/mcp-klant-model';
import { BESLUIT_CODES, BESLUIT_LIMIETEN, BESLUIT_SOORTEN, type BesluitInhoud, type BesluitSoort, type BesluitStaat, type BesluitStand, type BesluitUit } from '../shared/eigenaar-besluit';
import { UitrolFout, assertieOpties, assertieUit, leesSleutels, uitdagingMaken, uitdagingVerbruiken } from './uitrol-goedkeuring';

// ---------------------------------------------------------------- paden (tests: omgeving)
/** RELEASE-COMMIT → alleen een echte hex-commit (7–40), anders ''. Vroeger: alle niet-hex weg → «onbekend» werd «beed» (29.10.2026). */
export const echteCommit = (ruw: string) => { const c = String(ruw || '').trim().toLowerCase().slice(0, 64); return /^[0-9a-f]{7,40}$/.test(c) ? c : ''; };
const inbox = () => process.env.BESLUIT_INBOX || '/srv/mijn-ruimte/besluit-inbox';
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
const appRoot = () => process.env.BESLUIT_APP_ROOT || '/srv/mijn-ruimte';
const MCP_ORIGIN = 'https://mcp.tarasevych.com';
const sys = () => getPool('systeem');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RELEASE = /^[0-9]{8}-[0-9]{6}$/;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Bestandsnaam-id van root (32 hex) uit de uuid van de rij. */
const kortId = (id: string) => id.replace(/-/g, '');

function fout(code: string, status = 400): never { throw new UitrolFout(code, status); }
type Eigenaar = { id: string; email?: string };
const audit = (e: Eigenaar, action: string, result: 'success' | 'denied' | 'failure', details: Record<string, unknown>) =>
  auditToevoegen({ ownerId: e.id, actorId: e.id, action, type: 'beveiliging', result, details, service: 'mcp' })
    .catch((err) => { console.error(`[eigenaar-besluit] AUDIT MISLUKT (${action}):`, (err as Error).message); });

// ---------------------------------------------------------------- stand (bestanden die de app mag lezen)
async function leesRechten(): Promise<{ data: Record<string, unknown> | null; leesbaar: boolean }> {
  try {
    const d = JSON.parse(await readFile(rechtenPad(), 'utf8'));
    return { data: d && typeof d === 'object' && !Array.isArray(d) ? d as Record<string, unknown> : null, leesbaar: true };
  } catch (err) { return { data: null, leesbaar: (err as { code?: string }).code === 'ENOENT' }; }
}
async function actieveRelease(): Promise<string> {
  try { const p = path.join(appRoot(), 'current'); await readlink(p); return path.basename(await realpath(p)); } catch { return ''; }
}
async function vorigeRelease(): Promise<string> {
  try { return path.basename((await readFile(path.join(appRoot(), 'VORIGE'), 'utf8')).slice(0, 300).trim()); } catch { return ''; }
}
async function releasesLijst(actief: string, vorige: string): Promise<BesluitStand['releases']> {
  const root = path.join(appRoot(), 'releases');
  let namen: string[] = [];
  try { namen = (await readdir(root)).filter((n) => RELEASE.test(n)).sort().reverse().slice(0, 30); } catch { return []; }
  const uit: BesluitStand['releases'] = [];
  for (const n of namen) {
    let commit = ''; let bruikbaar = false;
    try { commit = echteCommit(await readFile(path.join(root, n, 'RELEASE-COMMIT'), 'utf8')); } catch { commit = ''; }
    try { bruikbaar = (await stat(path.join(root, n, 'dist-server', 'start.mjs'))).isFile(); } catch { bruikbaar = false; }
    uit.push({ naam: n, commit, actief: n === actief, vorige: n === vorige, bruikbaar, ...(await releaseGegevens(path.join(root, n))) });
  }
  return uit;
}
/** Pakketgegevens van een release op de server (29.10.2026): versie, auteur, agent, volledige BRON-COMMIT, korte samenvatting. */
async function releaseGegevens(map: string): Promise<{ versie: string; auteur: string; agent: string; bronCommit: string; samenvatting: string }> {
  const lees = async (n: string, max: number) => { try { return (await readFile(path.join(map, n), 'utf8')).slice(0, max); } catch { return ''; } };
  const eerste = (t: string) => t.split(/\r?\n/)[0].trim();
  const versie = eerste(await lees('UITROL-VERSIE', 40));
  const bc = eerste(await lees('PAKKET-BRON-COMMIT', 220)) || eerste(await lees('BRON-COMMIT', 220));
  const agent = eerste(await lees('AGENT', 40));
  return {
    versie: RELEASE.test(versie) ? versie : '',
    auteur: tekst(eerste(await lees('AUTEUR', 200)), 120),
    agent: /^[a-z0-9][a-z0-9-]{0,31}$/.test(agent) ? agent : '',
    bronCommit: /^[0-9a-f]{40}$/.test(bc) || /^zonder-git:.{5,190}$/.test(bc) ? tekst(bc, 200) : '',
    samenvatting: tekst((await lees('SAMENVATTING', 1200)).trim(), 1000),
  };
}
/** De stand van root (besluit-stand.json), alleen ter informatie («bijgewerkt»); de app rekent zelf met wat zij kan lezen. */
async function rootStand(): Promise<Partial<BesluitStand> | null> {
  try { const d = JSON.parse(await readFile(path.join(statusDir(), 'besluit-stand.json'), 'utf8')); return d && typeof d === 'object' ? d as Partial<BesluitStand> : null; } catch { return null; }
}
export async function stand(): Promise<BesluitStand & { hostsUitOmgeving: string[]; rootBijgewerkt: string }> {
  const { data, leesbaar } = await leesRechten();
  const d = data || {};
  const op = d.opdracht && typeof d.opdracht === 'object' ? d.opdracht as Record<string, unknown> : {};
  const actief = await actieveRelease(); const vorige = await vorigeRelease();
  const r = await rootStand();
  return {
    bijgewerkt: new Date().toISOString(), rechtenLeesbaar: leesbaar && !!data,
    hosts: schoonHostLijst(d.externeMcpHosts), hostsUitOmgeving: schoonHostLijst(process.env.EXTERNE_MCP_HOSTS || ''),
    schakelaars: { terugdraaienDirect: op.terugdraaien === true, terugdraaienPasskey: bk.besluitKanaalOpen('terugdraaien', d), externeHostsPasskey: bk.besluitKanaalOpen('externe-hosts', d) },
    actief, vorige, releases: await releasesLijst(actief, vorige), rootBijgewerkt: tekst(r?.bijgewerkt, 40),
  };
}

// ---------------------------------------------------------------- rijen
const rijUit = (r: Record<string, unknown>): BesluitUit => ({
  id: String(r.id), soort: String(r.soort) as BesluitSoort, inhoud: (r.inhoud || {}) as BesluitInhoud, hash: String(r.hash), staat: String(r.staat) as BesluitStaat,
  code: String(r.code || ''), uitkomst: (r.uitkomst as BesluitUit['uitkomst']) || null, passkey: String(r.passkey || ''), door: String(r.door || ''),
  aangemaaktOp: iso(r.aangemaakt_op), ondertekendOp: iso(r.ondertekend_op), afgerondOp: iso(r.afgerond_op),
});
async function eigenRij(e: Eigenaar, id: unknown) {
  if (!UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const { rows } = await sys().query('SELECT * FROM app.eigenaar_besluiten WHERE id = $1 AND user_id = $2', [String(id), e.id]);
  if (!rows[0]) fout('NIET_GEVONDEN', 404);
  return rows[0] as Record<string, unknown>;
}

/** Uitkomst van root overnemen (besluit-<id>.json); verlopen zonder antwoord. Geeft de bijgewerkte rij. */
export async function uitkomstOpnemen(r: Record<string, unknown>): Promise<Record<string, unknown>> {
  const staat = String(r.staat);
  if (!['ontwerp', 'ondertekend'].includes(staat)) return r;
  let st: Record<string, unknown> | null = null;
  try { st = JSON.parse(await readFile(path.join(statusDir(), `besluit-${kortId(String(r.id))}.json`), 'utf8')); } catch { st = null; }
  if (st && typeof st === 'object' && st.id === kortId(String(r.id))) {
    const nieuw: BesluitStaat = st.uitkomst === 'klaar' ? 'klaar' : st.uitkomst === 'mislukt' ? 'mislukt' : 'geweigerd';
    const code = /^[A-Z0-9_]{1,60}$/.test(String(st.code || '')) ? String(st.code) : (nieuw === 'klaar' ? 'OK' : 'BESLUIT_CONTROLE');
    const uitkomst: Record<string, unknown> = { uk: tekst(st.uk, 300), nl: tekst(st.nl, 300), tijd: tekst(st.tijd, 40), detail: tekst(st.detail, 300) };
    if (typeof st.actief === 'string') uitkomst.actief = tekst(st.actief, 20);
    for (const k of ['toegevoegd', 'verwijderd', 'hosts'] as const) if (Array.isArray(st[k])) uitkomst[k] = (st[k] as unknown[]).map((h) => tekst(h, 300)).slice(0, 50);
    const { rows } = await sys().query(`UPDATE app.eigenaar_besluiten SET staat = $2, code = $3, uitkomst = $4::jsonb, passkey = $5, afgerond_op = now()
      WHERE id = $1 AND staat IN ('ontwerp', 'ondertekend') RETURNING *`, [String(r.id), nieuw, code, JSON.stringify(uitkomst), /^[0-9a-f]{0,16}$/.test(String(st.passkey || '')) ? String(st.passkey || '') : '']);
    if (rows[0]) { if (nieuw === 'klaar' && String(r.soort) === 'externe-hosts') { try { (await import('./mcp-klant/klant')).vergeetHostCache(); } catch { /* cache vernieuwt zichzelf op mtime */ } } return rows[0]; }
    return r;
  }
  const sinds = staat === 'ondertekend' ? Date.parse(iso(r.ondertekend_op)) : Date.parse(iso(r.aangemaakt_op));
  const grens = staat === 'ondertekend' ? BESLUIT_LIMIETEN.uitkomstMinuten * 60_000 : kern.UITDAGING_MAX_MS + kern.KLOK_SPELING_MS;
  if (Number.isFinite(sinds) && Date.now() - sinds > grens) {
    const code = staat === 'ondertekend' ? 'GEEN_UITKOMST' : 'VERLOPEN';
    const uitkomst = staat === 'ondertekend'
      ? { uk: 'Root не відповів протягом 15 хв; подивіться journalctl -u mijn-ruimte-besluit або «Діагностика».', nl: 'Root antwoordde niet binnen 15 min; zie journalctl -u mijn-ruimte-besluit of «Діагностика».', tijd: new Date().toISOString() }
      : { uk: 'Чернетку не підписано протягом 5 хв.', nl: 'Het ontwerp is niet binnen 5 min ondertekend.', tijd: new Date().toISOString() };
    const { rows } = await sys().query(`UPDATE app.eigenaar_besluiten SET staat = 'verlopen', code = $2, uitkomst = $3::jsonb, afgerond_op = now() WHERE id = $1 AND staat = $4 RETURNING *`, [String(r.id), code, JSON.stringify(uitkomst), staat]);
    return rows[0] || r;
  }
  return r;
}

// ---------------------------------------------------------------- 1. starten
export async function starten(e: Eigenaar, input: { soort?: unknown; inhoud?: unknown }) {
  const soort = String(input.soort || '') as BesluitSoort;
  if (!(BESLUIT_SOORTEN as readonly string[]).includes(soort)) fout('SOORT_ONGELDIG');
  const s = await stand();
  if (!(soort === 'terugdraaien' ? s.schakelaars.terugdraaienPasskey : s.schakelaars.externeHostsPasskey)) fout('BESLUIT_UIT', 409);
  const b = await leesSleutels();
  if (!b.sleutels.length) fout('GEEN_PASSKEY', 409);
  let inhoud: BesluitInhoud;
  try { inhoud = bk.normaliseerInhoud(soort, input.inhoud); } catch { fout('INHOUD_ONGELDIG'); }
  if (soort === 'terugdraaien') {
    const i = inhoud! as { van: string; naar: string };
    if (!s.actief || i.van !== s.actief) fout('STAND_VERANDERD', 409);
    const rel = s.releases.find((x) => x.naam === i.naar);
    if (!rel || !rel.bruikbaar) fout('RELEASE_ONBEKEND', 404);
    if (rel.actief) fout('RELEASE_ACTIEF', 409);
  } else {
    const i = inhoud! as { hosts: string[] };
    if (i.hosts.length > BESLUIT_LIMIETEN.maxHosts) fout('TE_VEEL_HOSTS');
    if (i.hosts.length === s.hosts.length && i.hosts.every((h, n) => s.hosts[n] === h)) fout('GEEN_WIJZIGING', 409);
  }
  const limiet = await rateLimit(`besluit-starten:${e.id}`, BESLUIT_LIMIETEN.perUur, 3600);
  if (!limiet.ok) fout('RATE_LIMITED', 429);
  // Oude ontwerpen van deze eigenaar afsluiten: er is maar één lopend besluit per soort nodig.
  await sys().query(`UPDATE app.eigenaar_besluiten SET staat = 'verlopen', code = 'VERVANGEN', afgerond_op = now() WHERE user_id = $1 AND soort = $2 AND staat = 'ontwerp'`, [e.id, soort]);
  const id = randomUUID();
  const hash = bk.besluitHash(soort, inhoud!);
  const u = await uitdagingMaken(e.id, 'eigenaar-besluit', id, { besluitHash: hash });
  await sys().query(`INSERT INTO app.eigenaar_besluiten (id, user_id, soort, inhoud, hash, nonce, verloopt_ms, uitdaging_id, door) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
    [id, e.id, soort, JSON.stringify(inhoud!), hash, u.nonce, u.verloopt, u.id, tekst(e.email || e.id, 200)]);
  await audit(e, 'eigenaar_besluit_gestart', 'success', { besluit: id, soort, inhoud: inhoud!, hash: hash.slice(0, 16) });
  return { id, soort, inhoud: inhoud!, hash, uitdagingId: u.id, verloopt: u.verloopt, publicKey: assertieOpties(u.uitdaging, b), stand: { actief: s.actief, vorige: s.vorige, hosts: s.hosts } };
}

// ---------------------------------------------------------------- inbox schrijven (29.10.2026)
/** Foutcode voor het neerleggen in de inbox, met een korte, leesbare oorzaak (errno en pad, nooit inhoud). */
export function inboxFout(err: unknown): { code: string; detail: string } {
  const e = err as NodeJS.ErrnoException & { code?: string };
  if (e && e.message === 'INBOX_NIET_BEVESTIGD') return { code: 'INBOX_NIET_BEVESTIGD', detail: inbox() };
  const c = String(e?.code || '');
  const code = c === 'EROFS' ? 'INBOX_ALLEEN_LEZEN' : c === 'EACCES' || c === 'EPERM' ? 'INBOX_GEEN_RECHT' : c === 'ENOENT' || c === 'ENOTDIR' ? 'INBOX_ONTBREEKT' : c === 'ENOSPC' || c === 'EDQUOT' ? 'INBOX_VOL' : 'INBOX_SCHRIJFFOUT';
  return { code, detail: `${c || 'fout'}: ${inbox()}` };
}
/** Besluit neerleggen: tijdelijk bestand → rename → teruglezen en id controleren → pas dan `aanvraag` aantikken (wekt root). */
export async function inboxSchrijven(id32: string, inhoud: string, soort: string) {
  await mkdir(inbox(), { recursive: true });
  const tmp = path.join(inbox(), `.besluit-${id32}.deel`);
  const doel = path.join(inbox(), `besluit-${id32}.json`);
  await writeFile(tmp, inhoud, { mode: 0o640 });
  await rename(tmp, doel);
  let terug = '';
  try { terug = await readFile(doel, 'utf8'); } catch { terug = ''; }
  if (terug !== inhoud) throw new Error('INBOX_NIET_BEVESTIGD');
  await writeFile(path.join(inbox(), 'aanvraag'), `${new Date().toISOString()} ${soort} ${id32}\n`, { mode: 0o640 });
}
let inboxCache: { t: number; v: { pad: string; schrijfbaar: boolean; code: string; detail: string } } | null = null;
/** Proefschrijven in de inbox (niet `aanvraag`: dat zou root wekken). Voor stap 2 «Перевірка» van de wizard; 30 s in het geheugen. */
export async function inboxStand() {
  if (inboxCache && Date.now() - inboxCache.t < 30_000) return inboxCache.v;
  const proef = path.join(inbox(), `.proef-${process.pid}`);
  let v;
  try {
    await mkdir(inbox(), { recursive: true });
    await writeFile(proef, 'proef\n', { mode: 0o600 });
    await rm(proef, { force: true });
    v = { pad: inbox(), schrijfbaar: true, code: '', detail: '' };
  } catch (err) { const f = inboxFout(err); v = { pad: inbox(), schrijfbaar: false, code: f.code, detail: f.detail }; }
  inboxCache = { t: Date.now(), v };
  return v;
}

// ---------------------------------------------------------------- 2. ondertekenen
export async function ondertekenen(e: Eigenaar, input: { id?: unknown; uitdagingId?: unknown; assertie?: unknown }, opties: { wachtMs?: number } = {}) {
  const assertie = assertieUit(input.assertie);
  const r = await eigenRij(e, input.id);
  if (String(r.staat) !== 'ontwerp') fout('STATUS_ONGELDIG', 409);
  const u = await uitdagingVerbruiken(e.id, input.uitdagingId, 'eigenaar-besluit');
  if (u.onderwerp !== String(r.id) || String(r.uitdaging_id || '') !== String(input.uitdagingId)) fout('UITDAGING_ONGELDIG', 403);
  const soort = String(r.soort) as BesluitSoort;
  // Opnieuw uit de HUIDIGE rij: de hash in de challenge moet bij precies deze inhoud horen.
  const hash = bk.besluitHash(soort, r.inhoud);
  if (hash !== String(r.hash)) fout('UITDAGING_ONGELDIG', 403);
  const s = await stand();
  if (!(soort === 'terugdraaien' ? s.schakelaars.terugdraaienPasskey : s.schakelaars.externeHostsPasskey)) fout('BESLUIT_UIT', 409);
  const b = await leesSleutels();
  const origins = [...new Set([...b.origins, ...(kern.originHoortBijRp(MCP_ORIGIN, b.rpId) ? [MCP_ORIGIN] : [])])];
  const verwacht = kern.uitdagingVoor('eigenaar-besluit', { besluitHash: hash, nonce: u.nonce, verloopt: u.verloopt });
  const v = kern.verifieerAssertie({ assertie, verwachteUitdaging: verwacht, rpId: b.rpId, origins, sleutels: b.sleutels });
  if (!v.ok) {
    await sys().query(`UPDATE app.eigenaar_besluiten SET staat = 'geweigerd', code = $2, uitkomst = $3::jsonb, afgerond_op = now() WHERE id = $1 AND staat = 'ontwerp'`,
      [String(r.id), `PASSKEY_${v.code}`.slice(0, 60), JSON.stringify({ uk: 'Сайт не прийняв підпис passkey (попередня перевірка).', nl: 'De site accepteerde de passkey-handtekening niet (voorcontrole).', tijd: new Date().toISOString() })]);
    await audit(e, 'eigenaar_besluit_geweigerd', 'denied', { besluit: String(r.id), soort, code: v.code, waar: 'app' });
    fout(`PASSKEY_${v.code}`, 403);
  }
  const id32 = kortId(String(r.id));
  // 29.10.2026: elke fout bij het neerleggen zichtbaar maken (vroeger een kale 500; bij de eigenaar bleef de inbox leeg door EROFS) en
  // NA het schrijven bevestigen dat besluit-<id>.json echt in de inbox staat, vóór `aanvraag` root wekt.
  try {
    await inboxSchrijven(id32, JSON.stringify({ doel: 'eigenaar-besluit', id: id32, soort, inhoud: r.inhoud, besluitHash: hash, nonce: u.nonce, verloopt: u.verloopt, assertie, door: tekst(e.email || e.id, 120), tijd: new Date().toISOString() }) + '\n', soort);
  } catch (err) {
    const f = inboxFout(err);
    console.error(`[eigenaar-besluit] inbox ${inbox()}: ${f.code} (${f.detail})`);
    await sys().query(`UPDATE app.eigenaar_besluiten SET staat = 'mislukt', code = $2, uitkomst = $3::jsonb, afgerond_op = now() WHERE id = $1 AND staat = 'ontwerp'`,
      [String(r.id), f.code, JSON.stringify({ uk: `${BESLUIT_CODES[f.code]?.[0] || f.code} (${f.detail})`, nl: `${BESLUIT_CODES[f.code]?.[1] || f.code} (${f.detail})`, tijd: new Date().toISOString() })]);
    await audit(e, 'eigenaar_besluit_mislukt', 'failure', { besluit: String(r.id), soort, code: f.code, detail: f.detail, waar: 'app-inbox' });
    fout(f.code, 500);
  }
  await sys().query(`UPDATE app.eigenaar_besluiten SET staat = 'ondertekend', ondertekend_op = now(), passkey = $2 WHERE id = $1 AND staat = 'ontwerp'`, [String(r.id), v.vingerafdruk.slice(0, 16)]);
  await audit(e, 'eigenaar_besluit_ondertekend', 'success', { besluit: String(r.id), soort, inhoud: r.inhoud, hash: hash.slice(0, 16), passkey: v.vingerafdruk.slice(0, 16) });
  // Terugdraaien herstart de dienst: niet wachten (de verbinding valt weg); de pagina leest de uitkomst met `status`.
  const wachtMs = opties.wachtMs ?? (soort === 'terugdraaien' ? 0 : BESLUIT_LIMIETEN.wachtMs);
  const einde = Date.now() + wachtMs;
  let rij = (await eigenRij(e, r.id));
  while (Date.now() < einde) { rij = await uitkomstOpnemen(rij); if (String(rij.staat) !== 'ondertekend') break; await wacht(400); }
  const uit = rijUit(rij);
  if (uit.staat !== 'ondertekend') await audit(e, `eigenaar_besluit_${uit.staat}`, uit.staat === 'klaar' ? 'success' : uit.staat === 'geweigerd' ? 'denied' : 'failure', { besluit: uit.id, soort, code: uit.code, passkey: uit.passkey });
  return uit;
}

// ---------------------------------------------------------------- 3. status / overzicht
export async function status(e: Eigenaar, id: unknown) {
  const voor = await eigenRij(e, id);
  const na = await uitkomstOpnemen(voor);
  const uit = rijUit(na);
  if (String(voor.staat) !== uit.staat && ['klaar', 'geweigerd', 'mislukt', 'verlopen'].includes(uit.staat)) {
    await audit(e, `eigenaar_besluit_${uit.staat}`, uit.staat === 'klaar' ? 'success' : uit.staat === 'geweigerd' ? 'denied' : 'failure', { besluit: uit.id, soort: uit.soort, code: uit.code, passkey: uit.passkey });
  }
  const s = uit.soort === 'terugdraaien' ? { actief: await actieveRelease(), vorige: await vorigeRelease() } : { hosts: (await stand()).hosts };
  return { besluit: uit, stand: s, verwerking: await verwerking(na), gebeurtenissen: await gebeurtenissenSinds(na),
    nacontrole: uit.soort === 'terugdraaien' && uit.staat === 'klaar' ? await nacontrole() : null };
}

/**
 * Heeft root het besluit al opgepakt? (29.10.2026, eigenaar: «я підписав, і з цього моменту не відбулося нічого».)
 * Root haalt besluit-<id>.json eerst uit de inbox (os.replace) en verwerkt het dan; ligt het bestand er na 60 s nog, dan draait
 * mijn-ruimte-besluit.path/.service niet of weigert het pad. De pagina toont dan de diagnosecommando's.
 */
async function verwerking(r: Record<string, unknown>): Promise<{ inInbox: boolean; seconden: number }> {
  const sinds = Date.parse(iso(r.ondertekend_op));
  let inInbox = false;
  if (String(r.staat) === 'ondertekend') { try { inInbox = (await stat(path.join(inbox(), `besluit-${kortId(String(r.id))}.json`))).isFile(); } catch { inInbox = false; } }
  return { inInbox, seconden: Number.isFinite(sinds) ? Math.max(0, Math.round((Date.now() - sinds) / 1000)) : 0 };
}
/** Regels van root (gebeurtenissen.jsonl: bron besluit en uitrol) sinds het ondertekenen — voor de terminal op de pagina. */
async function gebeurtenissenSinds(r: Record<string, unknown>): Promise<Array<{ tijd: string; code: string; niveau: string; uk: string; nl: string }>> {
  const sinds = Date.parse(iso(r.ondertekend_op));
  if (!Number.isFinite(sinds)) return [];
  let raw = '';
  try { raw = await readFile(path.join(statusDir(), 'gebeurtenissen.jsonl'), 'utf8'); } catch { return []; }
  const uit: Array<{ tijd: string; code: string; niveau: string; uk: string; nl: string }> = [];
  for (const regel of raw.split('\n').slice(-200)) {
    try {
      const d = JSON.parse(regel) as Record<string, unknown>;
      if (!['besluit', 'uitrol'].includes(String(d.bron))) continue;
      const t = Date.parse(String(d.tijd || ''));
      if (!Number.isFinite(t) || t < sinds - 5000) continue;
      uit.push({ tijd: new Date(t).toISOString(), code: tekst(d.code, 40).replace(/[^A-Z0-9_]/g, ''), niveau: tekst(d.niveau, 10), uk: tekst(d.uk, 300), nl: tekst(d.nl, 300) });
    } catch { /* kapotte regel */ }
  }
  return uit.slice(-30);
}
/** Controle na het terugdraaien: dezelfde diepe controle als na een installatie (technische ruimte + technische bestanden). */
async function nacontrole() {
  try {
    const { diepeControle } = await import('./diepe-gezondheid');
    const d = await diepeControle(process.env.DIST_DIR || path.join(appRoot(), 'current', 'dist'));
    return { ok: d.ok, stappen: d.stappen };
  } catch (e) { return { ok: false, stappen: [{ id: 'fout', ok: false, detail: tekst((e as Error).message, 200) }] }; }
}
export async function overzicht(e: Eigenaar) {
  const { rows } = await sys().query('SELECT * FROM app.eigenaar_besluiten WHERE user_id = $1 ORDER BY aangemaakt_op DESC LIMIT 20', [e.id]);
  const besluiten: BesluitUit[] = [];
  for (const r of rows) besluiten.push(rijUit(await uitkomstOpnemen(r)));
  const b = await leesSleutels();
  return { stand: await stand(), inbox: await inboxStand(), passkeys: b.sleutels.map((s) => ({ kort: kern.vingerafdrukKort(s.vingerafdruk), label: s.label })), rpId: b.rpId, besluiten, limieten: BESLUIT_LIMIETEN };
}

// ---------------------------------------------------------------- routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const DIENSTEN = ['mcp', 'admin'] as const;

export function eigenaarBesluitRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const eigenaar = (run: (ctx: Ctx, e: Eigenaar) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!(auth.user.role === 'owner' && isOwnerEmail(auth.user.email))) return error('OWNER_REQUIRED', 403);
    try { return json(await run(ctx, { id: auth.user.id, email: auth.user.email })); }
    catch (err) {
      if (err instanceof UitrolFout) return error(err.code, err.status);
      console.error('[eigenaar-besluit]', (err as Error).message);
      return error('BESLUIT_FOUT', 500);
    }
  }) as RouterMiddleware;
  return {
    'POST /api/owner/besluit/overzicht': [eigenaar(async (_ctx, e) => overzicht(e))],
    'POST /api/owner/besluit/starten': [eigenaar(async (ctx, e) => starten(e, lichaam(ctx.body)))],
    'POST /api/owner/besluit/ondertekenen': [eigenaar(async (ctx, e) => ondertekenen(e, lichaam(ctx.body)))],
    'POST /api/owner/besluit/status': [eigenaar(async (ctx, e) => status(e, lichaam(ctx.body).id))],
  };
}
