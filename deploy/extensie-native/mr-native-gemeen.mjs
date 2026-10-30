// Mijn Ruimte — lokaal kanaal van de browserextensie (0.5.0): gedeelde onderdelen van de Native Messaging-host
// (mr-native-host.mjs) en de MCP-server (mr-native-mcp.mjs). Geen afhankelijkheden, Node >= 18.
//
// Wat hier staat:
//  - framing van Chrome Native Messaging: 4 bytes lengte (little-endian) + UTF-8 JSON, hoogstens 1 MB per bericht;
//  - paden: tokenbestand (~/.mijn-ruimte/extensie-token) en de lokale socket (Windows named pipe of unix-socket 0600);
//  - wederzijdse aanmelding host <-> MCP-client met HMAC over twee nonces: het token gaat NOOIT over de socket, en de client
//    controleert ook de host (een andere gebruiker die de pipe-naam inpikt, krijgt geen token en kan geen nepdata geven);
//  - een regel-lezer (newline-JSON) met maximumlengte voor de socket.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const VERSIE = '0.5.0';
export const HOST_NAAM = 'com.tarasevych.mijnruimte';
export const EXTENSIE_ORIGIN = 'chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi/';
/** Chrome staat host -> extensie hoogstens 1 MB toe; wij houden dezelfde grens in beide richtingen. */
export const MAX_BERICHT = 1024 * 1024;
/** Eén regel op de lokale socket (antwoord van 1 MB + omhulsel). */
export const MAX_REGEL = 2 * 1024 * 1024;
export const TIME_OUT_MS = 30_000;
export const AUTH_TIME_OUT_MS = 5_000;

/** Precies de zes leesopdrachten van het lokale kanaal en de parameters die elk mag hebben (zelfde lijst als extension/native.js). */
export const LOKAAL_OPDRACHTEN = Object.freeze({
  'browser.self_test': Object.freeze([]),
  'browser.snapshot': Object.freeze([]),
  'browser.diagnostics': Object.freeze([]),
  'browser.console': Object.freeze(['types']),
  'browser.network': Object.freeze(['failed_only']),
  'browser.audit': Object.freeze(['soort']),
});
export const isLokaalOpdracht = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(LOKAAL_OPDRACHTEN, t);
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ------------------------------------------------------------------ framing (Native Messaging)
/** Bericht -> Buffer (4 bytes lengte LE + JSON). Gooit bij meer dan MAX_BERICHT bytes. */
export function codeerBericht(obj, max = MAX_BERICHT) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  if (json.length > max) throw new Error(`TE_GROOT: bericht van ${json.length} bytes (max ${max})`);
  const kop = Buffer.alloc(4);
  kop.writeUInt32LE(json.length, 0);
  return Buffer.concat([kop, json]);
}

/**
 * Stroom -> berichten. `push(chunk)` mag willekeurige stukken krijgen. Een te groot bericht wordt overgeslagen (de bytes worden
 * gelezen en weggegooid) en gemeld met opFout('TE_GROOT', lengte); ongeldige JSON met opFout('JSON').
 */
export function maakDecoder(opBericht, opFout = () => {}, max = MAX_BERICHT) {
  let buf = Buffer.alloc(0);
  let overslaan = 0;
  return {
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
      for (;;) {
        if (overslaan > 0) {
          const n = Math.min(overslaan, buf.length);
          buf = buf.subarray(n); overslaan -= n;
          if (overslaan > 0) return;
        }
        if (buf.length < 4) return;
        const lengte = buf.readUInt32LE(0);
        if (lengte > max) { buf = buf.subarray(4); overslaan = lengte; opFout('TE_GROOT', lengte); continue; }
        if (buf.length < 4 + lengte) return;
        const tekst = buf.subarray(4, 4 + lengte).toString('utf8');
        buf = buf.subarray(4 + lengte);
        let bericht;
        try { bericht = JSON.parse(tekst); } catch { opFout('JSON', lengte); continue; }
        opBericht(bericht);
      }
    },
    get wachtend() { return buf.length + overslaan; },
  };
}

// ------------------------------------------------------------------ regels (lokale socket)
/** Newline-JSON. Een regel langer dan max: opFout('TE_GROOT') en de verbinding hoort dicht te gaan. */
export function maakRegelLezer(opBericht, opFout = () => {}, max = MAX_REGEL) {
  let rest = '';
  let kapot = false;
  return (chunk) => {
    if (kapot) return;
    rest += chunk.toString('utf8');
    let i;
    while ((i = rest.indexOf('\n')) >= 0) {
      const regel = rest.slice(0, i); rest = rest.slice(i + 1);
      if (!regel.trim()) continue;
      let b; try { b = JSON.parse(regel); } catch { opFout('JSON'); continue; }
      opBericht(b);
    }
    if (rest.length > max) { kapot = true; rest = ''; opFout('TE_GROOT'); }
  };
}
export const regel = (obj) => `${JSON.stringify(obj)}\n`;

// ------------------------------------------------------------------ paden
const veiligeNaam = (s) => String(s || 'gebruiker').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'gebruiker';
/** Map met token (en op unix zonder XDG_RUNTIME_DIR ook de socket). MR_EXTENSIE_MAP alleen voor tests. */
export function dataMap(env = process.env) {
  return env.MR_EXTENSIE_MAP ? path.resolve(env.MR_EXTENSIE_MAP) : path.join(os.homedir(), '.mijn-ruimte');
}
export const tokenPad = (env = process.env) => path.join(dataMap(env), 'extensie-token');
export function socketPad(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    let naam = env.USERNAME;
    try { naam = os.userInfo().username || naam; } catch { /* geen userinfo */ }
    return `\\\\.\\pipe\\mijn-ruimte-extensie-${veiligeNaam(naam)}`;
  }
  if (env.MR_EXTENSIE_MAP) return path.join(dataMap(env), 'extensie.sock');
  if (env.XDG_RUNTIME_DIR && path.isAbsolute(env.XDG_RUNTIME_DIR)) return path.join(env.XDG_RUNTIME_DIR, 'mijn-ruimte-extensie.sock');
  return path.join(dataMap(env), 'extensie.sock');
}

/** Map alleen voor de gebruiker (0700; op Windows geeft het profiel al alleen de gebruiker toegang). */
export function maakEigenMap(map) {
  mkdirSync(map, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') chmodSync(map, 0o700);
}

/** Nieuw token: 32 willekeurige bytes (hex), atomair weggeschreven met 0600. */
export function schrijfNieuwToken(pad) {
  maakEigenMap(path.dirname(pad));
  const token = randomBytes(32).toString('hex');
  const tmp = `${pad}.${process.pid}.tmp`;
  writeFileSync(tmp, token, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(tmp, 0o600);
  renameSync(tmp, pad);
  return token;
}
export function leesToken(pad) {
  const t = readFileSync(pad, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(t)) throw new Error('TOKEN_ONGELDIG');
  return t;
}
export function verwijderStil(pad) { try { if (existsSync(pad)) rmSync(pad, { force: true }); } catch { /* al weg */ } }

// ------------------------------------------------------------------ wederzijdse aanmelding
export const nonce = () => randomBytes(16).toString('hex');
/** rol 'client' bewijst de client, rol 'host' bewijst de host; de volgorde van de nonces verschilt, dus bewijzen zijn niet uitwisselbaar. */
export function bewijs(token, rol, eerste, tweede) {
  return createHmac('sha256', Buffer.from(String(token), 'utf8')).update(`mr-ext-${rol}-v1\n${eerste}\n${tweede}`).digest('hex');
}
/** Timing-safe vergelijking van twee hex-strings (verschillende lengte = false, zonder vroeg af te breken op inhoud). */
export function gelijk(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'utf8'); const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) { timingSafeEqual(x, x); return false; }
  return timingSafeEqual(x, y);
}

// ------------------------------------------------------------------ client (gebruikt door de MCP-server en de tests)
/**
 * Verbind met de host, doe de wederzijdse aanmelding en geef een object terug:
 *   { opdracht(type, params) -> Promise<{ok, data?, error?}>, status() -> laatste status, sluit(), open }
 * Fouten (geen host, verkeerd token, host bewijst zich niet) -> Promise wordt verworpen met een Error waarvan .code gezet is.
 */
export function verbindMetHost({ socket = socketPad(), token: tokenVast, tokenBestand = tokenPad(), timeoutMs = TIME_OUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let token;
    try { token = tokenVast ?? leesToken(tokenBestand); } catch (e) { const err = new Error('GEEN_HOST: geen token gevonden (draait de extensie-host?)'); err.code = 'GEEN_HOST'; err.oorzaak = String(e?.code || e?.message || e); return reject(err); }
    const c = net.connect(socket);
    let fase = 'hallo';
    let mijnNonce = '';
    let hostNonce = '';
    let status = null;
    let teller = 0;
    const wacht = new Map();
    let opStatus = () => {};
    let opSluit = () => {};
    const faal = (code, tekst) => { const e = new Error(`${code}: ${tekst}`); e.code = code; if (fase !== 'klaar') { fase = 'dicht'; c.destroy(); reject(e); } return e; };
    const authTimer = setTimeout(() => faal('GEEN_HOST', 'de host antwoordt niet'), AUTH_TIME_OUT_MS);
    const lees = maakRegelLezer((m) => {
      if (fase === 'hallo') {
        if (m?.t === 'fout') return faal(m.code === 'BEZET' ? 'BEZET' : 'TOKEN', m.code === 'BEZET' ? 'er is al een lokale agent verbonden' : 'aanmelding geweigerd');
        if (m?.t !== 'hallo' || typeof m.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(m.nonce)) return faal('PROTOCOL', 'onverwacht begin');
        hostNonce = m.nonce; mijnNonce = nonce();
        fase = 'auth';
        c.write(regel({ t: 'auth', nonce: mijnNonce, bewijs: bewijs(token, 'client', hostNonce, mijnNonce) }));
        return;
      }
      if (fase === 'auth') {
        if (m?.t === 'fout') return faal(m.code === 'BEZET' ? 'BEZET' : 'TOKEN', m.code === 'BEZET' ? 'er is al een lokale agent verbonden' : 'token geweigerd (host opnieuw gestart? probeer opnieuw)');
        if (m?.t !== 'welkom' || !gelijk(m.bewijs, bewijs(token, 'host', mijnNonce, hostNonce))) return faal('HOST_ONECHT', 'de host bewijst zich niet met het token');
        clearTimeout(authTimer);
        fase = 'klaar';
        status = m.status ?? null;
        resolve(api);
        return;
      }
      if (fase !== 'klaar') return;
      if (m?.t === 'status' || m?.t === 'vergrendeld') { status = m.t === 'vergrendeld' ? { staat: 'vergrendeld', exp: null, caps: [] } : { staat: m.staat, exp: m.exp ?? null, caps: Array.isArray(m.caps) ? m.caps : [] }; opStatus(status); return; }
      if (m?.t === 'antwoord' && wacht.has(m.id)) {
        const w = wacht.get(m.id); wacht.delete(m.id); clearTimeout(w.timer);
        w.resolve(m.ok === true ? { ok: true, data: m.data } : { ok: false, error: String(m.error || 'fout') });
      }
    }, () => { c.destroy(); });
    c.on('data', lees);
    c.on('error', (e) => { if (fase !== 'klaar') { clearTimeout(authTimer); faal('GEEN_HOST', `geen verbinding met de extensie-host (${e.code || e.message})`); } });
    c.on('close', () => {
      clearTimeout(authTimer);
      const was = fase; fase = 'dicht';
      for (const [, w] of wacht) { clearTimeout(w.timer); w.resolve({ ok: false, error: 'VERBINDING_WEG: de extensie-host is gestopt (vergrendeld of browser dicht)' }); }
      wacht.clear();
      if (was === 'klaar') opSluit(); else if (was !== 'dicht') { const e = new Error('GEEN_HOST: verbinding gesloten tijdens aanmelding'); e.code = 'GEEN_HOST'; reject(e); }
    });
    const api = {
      get open() { return fase === 'klaar'; },
      status: () => status,
      opStatus: (f) => { opStatus = f; },
      opSluit: (f) => { opSluit = f; },
      opdracht(type, params = {}) {
        if (fase !== 'klaar') return Promise.resolve({ ok: false, error: 'VERBINDING_WEG: niet verbonden met de extensie-host' });
        const id = `c${++teller}`;
        return new Promise((res) => {
          const timer = setTimeout(() => { wacht.delete(id); res({ ok: false, error: `TIME-OUT: geen antwoord binnen ${Math.round(timeoutMs / 1000)} s` }); }, timeoutMs + 2_000);
          wacht.set(id, { resolve: res, timer });
          c.write(regel({ t: 'opdracht', id, type, params }));
        });
      },
      sluit() { fase = 'dicht'; c.end(); c.destroy(); },
    };
  });
}
