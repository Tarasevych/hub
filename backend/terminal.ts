// Terminals in de browser (architectuur 13.10.2026). De browser praat via WSS /terminal/ws met DEZE server; de server praat via het
// bestaande agentkanaal met de agent op een EIGEN apparaat; de agent draait een wegwerpcontainer (agent.mjs termArgs: geen netwerk,
// geen capabilities, alleen-lezen systeem, root op /werk standaard alleen-lezen, geheime plekken afgedekt).
// Regels (hier, op de server): actief technisch profiel met terminal.servers (elk eigen apparaat) of terminal.test (alleen testmachines); ALLEEN eigen apparaten; verse
// bevestiging van de aanmelding; reden; duur ≤ min(60, plafond van het apparaat, rest van het technisch profiel); eenmalig
// browserticket (30 s); uitvoer opgenomen (asciicast v2, invoer NIET: wachtwoorden). Een AI kan geen terminal openen (geen MCP-tool,
// geen grant): 'term.open' gaat niet via de opdrachtenwachtrij van AI's.
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { randomToken, sha256 } from './connectors-crypto';
import * as store from './connectors-opslag';
import { agentOnline, registreerTerminal, stuurNaarAgent, stuurTerminalOpen } from './connectors-gateway';
import { actieveActivatie, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { geldigeSleutelsVan, gebruikerVanSleutel, sleutelUitCookie } from './tech-bundels';
import { meld } from './melder';
import { magApparaat } from '../shared/terminal';
import * as opdr from './terminal-opdrachten';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
export const MAX_MINUTEN = 60;
const TICKET_MS = 30_000;
const MAX_OPNAME = 4 * 1024 * 1024;

type Sessie = {
  sid: string; userId: string; agentId: string; ticketHash: string; ticketExp: number; begin: number; eind: number;
  browser: WebSocket | null; gestart: boolean; open: boolean; opname: string[]; opnameBytes: number; bytes: number; timer: NodeJS.Timeout; wachtrij: string[];
};
const sessies = new Map<string, Sessie>();
export const _sessies = sessies;

/**
 * SEC-002 (slot x, NAUWK-01 — zoals slot t voor de tunnel van het externe bureaublad): de tech-cookies (SHA-256 → gebruiker) van wie
 * een terminal opende, staan IN HET GEHEUGEN, geladen bij het openen en hoogstens tot het ticket verloopt. Zo herkent terminalUpgrade()
 * de eigen browser zonder databasevraag en buiten de gedeelde opzoekplaatsen. Vergeten zodra de laatste sessie van die gebruiker sluit.
 * Tech-cookies того, хто відкрив термінал, — у пам'яті (не довше за квиток): браузер власника не стоїть у черзі пошуків разом з анонімами.
 */
type CookieLader = (userId: string) => Promise<Array<{ hash: string; tot: number }>>;
let cookieLader: CookieLader = geldigeSleutelsVan;
export function _zetCookieLader(f: CookieLader | null) { cookieLader = f ?? geldigeSleutelsVan; }
const bekendeCookies = new Map<string, { userId: string; tot: number }>();
function vergeetEigenCookies(userId: string) { for (const [h, c] of bekendeCookies) if (c.userId === userId) bekendeCookies.delete(h); }
/** De geldige tech-cookies van deze gebruiker (opnieuw) in het geheugen; een fout laat de vorige stand staan (dan: gewone opzoeking). */
async function eigenCookiesLaden(userId: string): Promise<void> {
  let lijst: Array<{ hash: string; tot: number }>;
  try { lijst = await cookieLader(userId); } catch { return; }
  if (![...sessies.values()].some((x) => x.open && x.userId === userId)) return; // intussen dicht: niets onthouden
  vergeetEigenCookies(userId);
  const grens = Date.now() + TICKET_MS + 2_000; // na het ticket heeft niemand de cookie hier nog nodig
  for (const c of lijst) if (/^[0-9a-f]{64}$/.test(c.hash) && c.tot > Date.now()) bekendeCookies.set(c.hash, { userId, tot: Math.min(c.tot, grens) });
}
export const _eigenCookiesLaden = eigenCookiesLaden;

const audit = (ownerId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId, actorId: ownerId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

async function vereisTech(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab);
  if (!a || !(a.mogelijkheden.includes('terminal.test') || a.mogelijkheden.includes('terminal.servers'))) fout('TECH_TERMINAL_VEREIST', 403);
  return a!;
}

type Caps = opdr.TerminalCaps;
/** Eigen apparaten (alleen niet-ingetrokken, geen browsers), met hun terminalmodi (zone G: container / opdrachten / powershell), roots en
 *  toegestane programma's. Technische apparaten (ruimte 'technisch': de server zelf) eerst. */
export async function apparaten(u: Gebruiker, tab: string) {
  const act = await vereisTech(u, tab);
  const lijst = await store.listAgents(u.id);
  return lijst.filter((a) => !a.revoked_at && a.platform !== 'browser').map((a) => {
    const c = (a.capabilities ?? {}) as Caps;
    const t = c.terminal ?? {};
    const aan = !!t.enabled;
    return { id: a.id, naam: a.name, platform: a.platform ?? '', ruimte: a.ruimte === 'technisch' ? 'technisch' : 'prive', online: agentOnline(a.id), terminal: aan && t.container !== false,
      opdrachten: aan && t.opdrachten === true, powershell: aan && t.powershell === true, allow: c.allowCommands ?? [], gebruiker: c.gebruiker ?? '', host: c.host ?? '',
      bevestiging: opdr.bevestigingVan(a.policy), versie: a.agent_version ?? '',
      test: t.test === true, toegestaan: magApparaat(act.mogelijkheden, c), image: t.image ?? '', maxMinuten: Number(t.maxMinuten ?? 60),
      roots: (c.roots ?? []).map((r) => ({ pad: r, alleenLezen: (c.readonlyRoots ?? []).includes(r) })) };
  }).sort((x, y) => Number(y.ruimte === 'technisch') - Number(x.ruimte === 'technisch'));
}

function afsluiten(s: Sessie, reden: string, code: number | null = null) {
  if (!s.open) return;
  s.open = false;
  clearTimeout(s.timer);
  sessies.delete(s.sid);
  if (![...sessies.values()].some((x) => x.open && x.userId === s.userId)) vergeetEigenCookies(s.userId); // SEC-002 (slot x)
  stuurNaarAgent(s.agentId, { t: 'term.close', sid: s.sid });
  try { s.browser?.send(JSON.stringify({ t: 'exit', code, reden })); s.browser?.close(1000, reden.slice(0, 60)); } catch { /* al dicht */ }
  const kop = JSON.stringify({ version: 2, width: 100, height: 30, timestamp: Math.floor(s.begin / 1000), env: { TERM: 'xterm-256color' } });
  const opname = gzipSync(Buffer.from([kop, ...s.opname].join('\n') + '\n'));
  void sys().query(`UPDATE app.terminal_sessies SET einde_op = now(), einde_reden = $2, bytes_uit = $3, opname = $4 WHERE id = $1`, [s.sid, reden.slice(0, 40), s.bytes, opname]).catch(() => undefined);
  void audit(s.userId, 'owner.terminal.gesloten', { sessie: s.sid, reden, bytes: s.bytes, seconden: Math.round((Date.now() - s.begin) / 1000) });
}

export async function openen(u: Gebruiker, tab: string, input: { agentId: unknown; root: unknown; schrijven: unknown; minuten: unknown; reden: unknown; cols?: unknown; rows?: unknown }) {
  const act = await vereisTech(u, tab);
  const agentId = String(input.agentId || '');
  const agent = /^[0-9a-f-]{36}$/.test(agentId) ? await store.getAgent(u.id, agentId) : null;
  if (!agent || agent.revoked_at) fout('APPARAAT_NIET_GEVONDEN', 404); // alleen EIGEN apparaten (getAgent filtert op user_id)
  if (!agentOnline(agentId)) fout('APPARAAT_OFFLINE', 409);
  const c = (agent!.capabilities ?? {}) as Caps;
  if (!c.terminal?.enabled || c.terminal.container === false) fout('TERMINAL_UIT_OP_APPARAAT', 409);
  if (!magApparaat(act.mogelijkheden, c)) fout('TERMINAL_ALLEEN_TESTMACHINE', 403);
  const root = String(input.root || '');
  if (!(c.roots ?? []).includes(root)) fout('ROOT_ONGELDIG');
  const schrijven = input.schrijven === true;
  if (schrijven && (c.readonlyRoots ?? []).includes(root)) fout('ROOT_ALLEEN_LEZEN', 403);
  const reden = String(input.reden ?? '').trim().replace(/\s+/g, ' ');
  if (reden.length < 3 || reden.length > 300) fout('REDEN_ONGELDIG');
  const restTech = Math.floor((act.eind - Date.now()) / 60_000);
  const max = Math.min(MAX_MINUTEN, Number(c.terminal?.maxMinuten ?? 60), restTech);
  const minuten = Math.round(Number(input.minuten));
  if (!Number.isFinite(minuten) || minuten < 1 || minuten > max) fout('DUUR_ONGELDIG');
  if ([...sessies.values()].filter((s) => s.userId === u.id).length >= 3) fout('TE_VEEL_TERMINALS', 429);
  const sid = randomUUID();
  const ticket = randomToken(32);
  const begin = Date.now(), eind = begin + minuten * 60_000;
  await sys().query(`INSERT INTO app.terminal_sessies (id, user_id, agent_id, agent_naam, root, schrijven, reden, minuten, begin_op, eind_gepland) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9 / 1000.0),to_timestamp($10 / 1000.0))`,
    [sid, u.id, agentId, agent!.name, root, schrijven, reden, minuten, begin, eind]);
  const s: Sessie = { sid, userId: u.id, agentId, ticketHash: sha256(ticket), ticketExp: begin + TICKET_MS, begin, eind, browser: null, gestart: false, open: true, opname: [], opnameBytes: 0, bytes: 0, wachtrij: [],
    timer: setTimeout(() => { const x = sessies.get(sid); if (x) afsluiten(x, 'tijd'); }, minuten * 60_000) };
  s.timer.unref?.();
  sessies.set(sid, s);
  await eigenCookiesLaden(u.id); // SEC-002 (slot x): de eigen browser herkennen zonder databasevraag in terminalUpgrade()
  // Zonder browser binnen 30 s: sluiten (een ticket dat niemand gebruikt, laat geen container draaien).
  setTimeout(() => { const x = sessies.get(sid); if (x && !x.browser) afsluiten(x, 'geen-browser'); }, TICKET_MS + 2_000).unref?.();
  const ok = await stuurTerminalOpen(agentId, u.id, sid, { sid, root, schrijven, minuten, cols: Number(input.cols) || 100, rows: Number(input.rows) || 30 });
  if (!ok) { afsluiten(s, 'agent-niet-bereikbaar'); fout('APPARAAT_OFFLINE', 409); }
  await audit(u.id, 'owner.terminal.geopend', { sessie: sid, apparaat: agent!.name, root, schrijven, minuten, reden, viaActivatie: act.id });
  return { sid, ticket, eind, minuten, apparaat: agent!.name, root, schrijven };
}

/** Berichten van de agent voor een sessie. true = verwerkt (hoort bij een terminal). */
function vanAgent(agentId: string, msg: any): boolean {
  if (msg?.t === 'result' && opdr.vanAgent(agentId, msg)) return true; // opdracht-terminal (zone G)
  const sid = String(msg?.sid ?? (msg?.t === 'result' ? msg.id : '') ?? '');
  const s = sessies.get(sid);
  if (!s) return msg?.t === 'term.out' || msg?.t === 'term.exit'; // verlopen sessie: stil weggooien
  if (s.agentId !== agentId) return true; // een andere agent mag niet in deze sessie schrijven
  if (msg.t === 'result') {
    if (!msg.ok) { const reden = String(msg.error || 'fout').slice(0, 200); stuurBrowser(s, { t: 'fout', reden }); afsluiten(s, 'agent-weigert'); }
    else { s.gestart = true; stuurBrowser(s, { t: 'gestart', alleenLezen: msg.data?.alleenLezen !== false, image: String(msg.data?.image || '') }); }
    return true;
  }
  if (msg.t === 'term.out' && typeof msg.d === 'string') {
    const tekst = Buffer.from(msg.d, 'base64');
    s.bytes += tekst.length;
    if (s.opnameBytes < MAX_OPNAME) {
      const regel = JSON.stringify([Math.round((Date.now() - s.begin)) / 1000, 'o', tekst.toString('utf8')]);
      s.opname.push(regel); s.opnameBytes += regel.length;
    }
    stuurBrowser(s, { t: 'out', d: msg.d });
    return true;
  }
  if (msg.t === 'term.exit') { afsluiten(s, String(msg.reden || 'einde'), typeof msg.code === 'number' ? msg.code : null); return true; }
  return true;
}
function stuurBrowser(s: Sessie, obj: Record<string, unknown>) {
  const tekst = JSON.stringify(obj);
  if (s.browser) { try { s.browser.send(tekst); } catch { /* dicht */ } } else if (s.wachtrij.length < 500) s.wachtrij.push(tekst);
}

// ---- browserkant: WSS /terminal/ws, eerste bericht {t:'auth', ticket} binnen 5 s ----
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
// SEC-002 (toetsen/g01.md №6, afwerking A): dezelfde opbouw als de tunnel van het externe bureaublad na de patch — een grens op
// verbindingen tegelijk zonder geldig ticket (sinds slot x: de eigen pool hieronder), en na een weigering wordt NIETS meer verwerkt (vlag «dicht») en de socket
// na 1 s hard afgebroken (terminate), in plaats van berichten tot 256 KiB te blijven ontleden tot de sluithanddruk klaar is.
// SEC-002 (slot x, NAUWK-01): alleen nog de eigen browser (tech-cookie van wie de wachtende sessie opende) komt tot de handdruk; die
// verbindingen tellen in een EIGEN pool (MAX_EIGENAAR_WACHTEND), die een anoniem niet kan vullen. Лише браузер власника; окремий пул місць.
const MAX_EIGENAAR_WACHTEND = 8;
let eigenaarWachtend = 0;
export const _terminalEigenaarWachtend = () => eigenaarWachtend;
/** `eigenaar`: user-id uit de tech-cookie — mag alleen het ticket van een EIGEN sessie gebruiken. */
function browserVerbinding(ws: WebSocket, eigenaar: string) {
  let s: Sessie | null = null;
  let dicht = false, geteld = true;
  eigenaarWachtend += 1;
  const vrij = () => { if (geteld) { geteld = false; eigenaarWachtend -= 1; } };
  const sluit = (code: number, reden: string) => {
    if (dicht) return;
    dicht = true; vrij();
    try { ws.close(code, reden); } catch { /* al dicht */ }
    setTimeout(() => { try { ws.terminate(); } catch { /* al weg */ } }, 1_000).unref?.();
  };
  const t = setTimeout(() => { if (!s) sluit(4401, 'auth timeout'); }, 5_000);
  ws.on('message', (raw) => {
    if (dicht) return;
    let msg: any; try { msg = JSON.parse(raw.toString()); } catch { sluit(4400, 'bad json'); return; }
    if (!s) {
      if (msg?.t !== 'auth' || typeof msg.ticket !== 'string' || msg.ticket.length > 200) { sluit(4401, 'auth required'); return; }
      const h = sha256(msg.ticket);
      const x = [...sessies.values()].find((y) => y.ticketHash === h);
      if (!x || x.browser || x.ticketExp < Date.now() || x.userId !== eigenaar) { sluit(4403, 'invalid ticket'); return; }
      vrij();
      clearTimeout(t);
      x.ticketHash = ''; // eenmalig
      x.browser = ws; s = x;
      ws.send(JSON.stringify({ t: 'verbonden', sid: x.sid, eind: x.eind }));
      for (const w of x.wachtrij.splice(0)) ws.send(w);
      return;
    }
    if (msg?.t === 'in' && typeof msg.d === 'string' && msg.d.length <= 64 * 1024) stuurNaarAgent(s.agentId, { t: 'term.in', sid: s.sid, d: msg.d });
    else if (msg?.t === 'close') afsluiten(s, 'gesloten');
  });
  ws.on('close', () => { dicht = true; clearTimeout(t); vrij(); if (s && s.open) afsluiten(s, 'browser-weg'); });
  ws.on('error', () => undefined);
}
const TOEGESTANE_TERMINAL_ORIGINS = new Set<string>(Object.values(SERVICE_HOSTS).map((h) => `https://${h}`));
export function terminalOriginToegestaan(originHeader: unknown, hostHeader?: unknown): boolean {
  const raw = String(originHeader || '').trim().toLowerCase();
  if (!raw) return false;
  if (TOEGESTANE_TERMINAL_ORIGINS.has(raw)) return true;
  try {
    const u = new URL(raw);
    const host = String(hostHeader || '').trim().toLowerCase();
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && !!host && u.host.toLowerCase() === host;
  } catch { return false; }
}
/** Wacht er een sessie van deze gebruiker op haar browser (ticket uitgegeven, nog niet gebruikt, niet verlopen)? */
const wachtOpBrowser = (userId: string) => {
  const nu = Date.now();
  for (const x of sessies.values()) if (x.open && x.userId === userId && x.ticketHash && !x.browser && x.ticketExp >= nu) return true;
  return false;
};

/**
 * SEC-002 (slot x, g01-4 zoals de tunnel): een weigering van wie zich niet als eigenaar toonde → auditregel + beveiligingsmelding voor
 * elke gebruiker met een open terminal — gebundeld, hoogstens één per minuut per gebruiker, met het aantal en de redenen.
 * Відмова невідомому — запис аудиту й сповіщення власникові відкритого термінала (не частіше разу на хвилину).
 */
const weigeringen = new Map<string, { aantal: number; redenen: Set<string>; laatste: number }>();
export const _terminalWeigeringenLeeg = () => weigeringen.clear();
function meldGeweigerd(waarom: string) {
  const nu = Date.now();
  const gebruikers = new Set<string>();
  for (const x of sessies.values()) if (x.open) gebruikers.add(x.userId);
  for (const uid of gebruikers) {
    const st = weigeringen.get(uid) ?? { aantal: 0, redenen: new Set<string>(), laatste: 0 };
    weigeringen.set(uid, st);
    st.aantal += 1;
    if (st.redenen.size < 8) st.redenen.add(waarom);
    if (nu - st.laatste < 60_000) continue;
    const aantal = st.aantal, reden = [...st.redenen].join('; ');
    st.laatste = nu; st.aantal = 0; st.redenen.clear();
    void auditToevoegen({ ownerId: uid, actorId: uid, action: 'owner.terminal.geweigerd', type: 'beveiliging', result: 'denied', details: { aantal, reden } }).catch(() => undefined);
    void meld(uid, 'security',
      'Термінал: відхилено з’єднання без входу / Terminal: verbinding zonder aanmelding geweigerd',
      `Хтось без вашого входу в технічний профіль намагався під’єднатися до термінала, поки у вас відкритий сеанс (спроб: ${aantal}). З’єднання відхилено. Якщо це були не ви — закрийте термінал і перевірте пристрої та сеанси входу. / `
      + `Iemand zonder uw aanmelding in het technisch profiel probeerde verbinding te maken met de terminal terwijl u een sessie open hebt (pogingen: ${aantal}). De verbinding is geweigerd. Was u dit niet, sluit dan de terminal en controleer uw apparaten en aanmeldsessies.`,
    ).catch(() => undefined);
  }
}

/** Vervangbaar in tests: wie hoort bij deze tech-cookie (zelfde regel als /assets/tech/*, backend/tech-bundels.ts)? */
type CookieEigenaar = (sleutel: string) => Promise<string | null>;
let eigenaarVanSleutel: CookieEigenaar = gebruikerVanSleutel;
export function _zetCookieEigenaar(f: CookieEigenaar | null) { eigenaarVanSleutel = f ?? gebruikerVanSleutel; }

/**
 * WS-upgrade van /terminal/ws.
 * SEC-002 (slot x, NAUWK-01; dezelfde opbouw als de tunnel na slot t, backend/remote-bureaublad.ts upgrade()):
 * Vroeger keek terminalUpgrade() EERST naar de stand: geen sessie die op haar browser wacht → meteen 403; wel zo'n sessie → 101, of 503
 * als 8 onaangemelde verbindingen open stonden. Zo zag een anoniem (Origin is buiten een browser vrij te kiezen) of er een terminal
 * openging, en met 8 verbindingen sloot hij de browser van de eigenaar met 503 buiten. Nu:
 *  - de stand wordt pas gelezen NA de tech-cookie; zonder cookie van de juiste vorm meteen 403, met zo'n cookie altijd precies één
 *    opzoeking — met of zonder sessie: zelfde werk, zelfde tijd;
 *  - wie zich niet als eigenaar van een wachtende sessie toont, krijgt altijd EXACT dezelfde bytes (403), ook als de opzoekplaatsen vol
 *    zijn (geen 503 voor onbekenden); audit + melding pas NA het antwoord (setImmediate);
 *  - de cookies van wie een terminal opende staan in het geheugen: die browser gaat zonder opzoeking en buiten de gedeelde plaatsen
 *    door, in een eigen pool. Een 503 bestaat alleen nog voor de eigenaar zelf (eigen pool vol).
 * Анонім завжди отримує той самий 403 за той самий час, незалежно від того, чи відкривається термінал; власник має окремі місця.
 */
const MAX_COOKIE_OPZOEKINGEN = 16; // gelijktijdige databasevragen voor cookies die (nog) niet als die van de eigenaar bekend zijn
let cookieOpzoekingen = 0;
const WEIGER_403 = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n';
export function terminalUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  /** Elke weigering van wie zich niet als eigenaar toonde: dezelfde bytes; audit + melding pas na het antwoord. */
  const onbekend = (waarom: string) => {
    if (socket.destroyed) return;
    socket.write(WEIGER_403); socket.destroy();
    setImmediate(() => meldGeweigerd(waarom));
  };
  const eigenaarDoor = (uid: string) => {
    if (eigenaarWachtend >= MAX_EIGENAAR_WACHTEND) { socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => browserVerbinding(ws, uid));
  };
  if (!terminalOriginToegestaan(req.headers.origin, req.headers.host)) { socket.write(WEIGER_403); socket.destroy(); return; }
  const sleutel = sleutelUitCookie(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
  if (!sleutel) { onbekend('geen geldige tech-cookie'); return; }
  const hash = sha256(sleutel);
  // De eigen browser van wie net een terminal opende: geen opzoeking, niet in de gedeelde rij.
  const bekend = bekendeCookies.get(hash);
  if (bekend && bekend.tot <= Date.now()) bekendeCookies.delete(hash);
  else if (bekend && wachtOpBrowser(bekend.userId)) { eigenaarDoor(bekend.userId); return; }
  // Alle andere cookies van de juiste vorm: altijd één opzoeking, wat de stand ook is.
  if (cookieOpzoekingen >= MAX_COOKIE_OPZOEKINGEN) { onbekend('te veel cookie-opzoekingen tegelijk'); return; }
  socket.on('error', () => undefined); // tijdens het opzoeken: een verbroken verbinding mag het proces niet laten vallen
  cookieOpzoekingen += 1;
  void eigenaarVanSleutel(sleutel).catch(() => null).then((uid) => {
    cookieOpzoekingen -= 1;
    if (socket.destroyed) return;
    if (!uid || !wachtOpBrowser(uid)) { onbekend('tech-cookie zonder eigen wachtende sessie'); return; }
    bekendeCookies.set(hash, { userId: uid, tot: Date.now() + TICKET_MS });
    eigenaarDoor(uid);
  });
}
registreerTerminal({ vanAgent, upgrade: terminalUpgrade });

/** Eigen sessies (zonder opname); met 'opnames.bekijken' in een actief technisch profiel: alle sessies. */
export async function sessiesLijst(u: Gebruiker, tab: string) {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  const alle = !!a?.mogelijkheden.includes('opnames.bekijken');
  const rows = (await sys().query(`SELECT s.id, s.agent_naam, s.root, s.schrijven, s.reden, s.minuten, s.begin_op, s.eind_gepland, s.einde_op, s.einde_reden, s.bytes_uit, s.opname IS NOT NULL AS heeft_opname,
      COALESCE(u.data->>'email', '') AS email FROM app.terminal_sessies s LEFT JOIN app.records u ON u.tbl='users' AND u.id = s.user_id
     WHERE ($1 OR s.user_id = $2) ORDER BY s.begin_op DESC LIMIT 50`, [alle, u.id])).rows;
  return { magOpnames: alle, sessies: rows.map((r) => ({ id: r.id, apparaat: r.agent_naam, root: r.root, schrijven: r.schrijven, reden: r.reden, minuten: r.minuten, begin: new Date(r.begin_op).getTime(), eind: new Date(r.eind_gepland).getTime(), einde: r.einde_op ? new Date(r.einde_op).getTime() : null, eindeReden: r.einde_reden, bytes: Number(r.bytes_uit), opname: r.heeft_opname && alle, email: r.email, open: sessies.has(r.id) })) };
}

/** Opname (asciicast v2) — alleen 'opnames.bekijken' (Аудитор, Власник) in een actief technisch profiel; elk bekijken gelogd. */
export async function opname(u: Gebruiker, tab: string, id: string) {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  if (!a?.mogelijkheden.includes('opnames.bekijken')) fout('TECH_OPNAMES_VEREIST', 403);
  if (!/^[0-9a-f-]{36}$/.test(id)) fout('ID_ONGELDIG');
  const r = (await sys().query('SELECT user_id, opname FROM app.terminal_sessies WHERE id = $1', [id])).rows[0];
  if (!r?.opname) fout('GEEN_OPNAME', 404);
  await auditToevoegen({ ownerId: r.user_id, actorId: u.id, action: 'owner.terminal.opname.bekeken', type: 'beveiliging', result: 'success', details: { sessie: id } }).catch(() => undefined);
  return { cast: gunzipSync(r.opname).toString('utf8') };
}

export function sluitEigen(u: Gebruiker, sid: string) {
  const s = sessies.get(sid);
  if (!s || s.userId !== u.id) fout('SESSIE_NIET_GEVONDEN', 404);
  afsluiten(s!, 'gesloten');
  return { ok: true };
}
