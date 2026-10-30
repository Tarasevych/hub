#!/usr/bin/env node
// Mijn Ruimte — Native Messaging-host van de browserextensie (0.5.0). Chrome start dit programma zelf zodra de extensie
// chrome.runtime.connectNative('com.tarasevych.mijnruimte') aanroept, en dat doet de extensie ALLEEN na een passkey-ontgrendeling
// op de site met «локальний агент» aangevinkt. Chrome stopt het weer als de extensie de poort sluit (vergrendeld, browser dicht).
//
//   Chrome (extensie) ⇄ stdio (4 bytes LE + JSON, max 1 MB) ⇄ deze host ⇄ lokale socket (0600 / named pipe) ⇄ mr-native-mcp.mjs ⇄ AI
//
// Regels:
//  - alleen gestart door Chrome voor exact chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi/ (Chrome geeft de origin als argument);
//  - bij elke start een nieuw token (32 bytes) in ~/.mijn-ruimte/extensie-token (alleen de gebruiker); weg bij stoppen;
//  - de MCP-client meldt zich aan met HMAC(token) over twee nonces (timing-safe vergeleken) en de host bewijst zich terug;
//  - hoogstens één client tegelijk, één opdracht tegelijk, alleen de zes leesopdrachten, time-out 30 s;
//  - de extensie controleert alles nogmaals (ontgrendeling, lokaal, LOKAAL_CAPS, domeinen, account) — deze host is geen poortwachter
//    voor rechten, alleen een doorgeefluik met eigen witte lijst;
//  - logt naar stderr alleen soort opdracht, ok/fout en duur — nooit pagina-inhoud, parameters of tokens.
import net from 'node:net';
import path from 'node:path';
import { chmodSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AUTH_TIME_OUT_MS, EXTENSIE_ORIGIN, ID_RE, LOKAAL_OPDRACHTEN, MAX_BERICHT, TIME_OUT_MS, VERSIE,
  bewijs, codeerBericht, gelijk, isLokaalOpdracht, maakDecoder, maakEigenMap, maakRegelLezer, nonce, regel, schrijfNieuwToken,
  socketPad, tokenPad, verwijderStil,
} from './mr-native-gemeen.mjs';

const log = (...a) => { try { process.stderr.write(`[mr-native-host] ${a.join(' ')}\n`); } catch { /* geen stderr */ } };

/**
 * De kern zonder stdio of socket, zodat hij testbaar is.
 *  naarChrome(obj)  — stuurt een bericht naar de extensie (stdout, gecodeerd)
 *  geeft { vanChrome(obj), nieuweClient(socket), sluitAlles(), staat } terug
 */
export function maakHostKern({ token, naarChrome, timeoutMs = TIME_OUT_MS, authTimeoutMs = AUTH_TIME_OUT_MS }) {
  let client = null;          // { socket, klaar }
  let lopend = null;          // { hostId, clientId, timer, sinds, type }
  let laatsteStatus = null;
  let teller = 0;

  /** Laatste melding netjes laten aankomen en daarna hard sluiten (ook als de andere kant niet meewerkt). */
  const weigerSocket = (socket, obj) => { try { socket.end(regel(obj)); } catch { /* al dicht */ } setTimeout(() => socket.destroy(), 1000).unref?.(); };
  const naarClient = (obj) => { if (client?.klaar && !client.socket.destroyed) client.socket.write(regel(obj)); };
  const meldClient = (verbonden) => { try { naarChrome({ t: 'client', verbonden }); } catch { /* chrome weg */ } };
  const beeindigLopend = (ok, x) => {
    if (!lopend) return;
    const l = lopend; lopend = null; clearTimeout(l.timer);
    log(`opdracht ${l.type} ${ok ? 'ok' : 'fout'} ${Date.now() - l.sinds}ms`);
    naarClient(ok ? { t: 'antwoord', id: l.clientId, ok: true, data: x } : { t: 'antwoord', id: l.clientId, ok: false, error: String(x || 'fout').slice(0, 300) });
  };

  function vanChrome(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'status') {
      laatsteStatus = { staat: String(m.staat || ''), exp: typeof m.exp === 'number' ? m.exp : null, caps: Array.isArray(m.caps) ? m.caps.filter((c) => typeof c === 'string').slice(0, 10) : [] };
      naarClient({ t: 'status', ...laatsteStatus });
      return;
    }
    if (m.t === 'vergrendeld') {
      laatsteStatus = { staat: 'vergrendeld', exp: null, caps: [] };
      beeindigLopend(false, 'EXTENSIE_VERGRENDELD: de extensie is vergrendeld; ontgrendel op de site met «локальний агент»');
      naarClient({ t: 'vergrendeld' });
      return;
    }
    if (typeof m.id === 'string' && lopend && m.id === lopend.hostId) beeindigLopend(m.ok === true, m.ok === true ? m.data : m.error);
    // antwoord op een opdracht die al verlopen is: weggooien
  }

  function opdrachtVanClient(m) {
    const clientId = typeof m.id === 'string' && ID_RE.test(m.id) ? m.id : null;
    if (!clientId) return;
    const weiger = (e) => naarClient({ t: 'antwoord', id: clientId, ok: false, error: e });
    if (!isLokaalOpdracht(m.type)) return weiger('LOKAAL_GEWEIGERD: het lokale kanaal kent alleen de zes leesopdrachten');
    const params = m.params && typeof m.params === 'object' && !Array.isArray(m.params) ? m.params : {};
    const toegestaan = LOKAAL_OPDRACHTEN[m.type];
    if (Object.keys(params).some((k) => !toegestaan.includes(k))) return weiger('LOKAAL_GEWEIGERD: onbekende parameter');
    if (lopend) return weiger('LOKAAL_BEZIG: er loopt al een opdracht; één tegelijk');
    const hostId = `h${++teller}${nonce().slice(0, 8)}`;
    lopend = { hostId, clientId, type: m.type, sinds: Date.now(), timer: setTimeout(() => beeindigLopend(false, `TIME-OUT: de extensie antwoordde niet binnen ${Math.round(timeoutMs / 1000)} s`), timeoutMs) };
    try { naarChrome({ id: hostId, type: m.type, params }); }
    catch (e) { beeindigLopend(false, `HOST_FOUT: ${String(e?.message || e).slice(0, 120)}`); }
  }

  function nieuweClient(socket) {
    if (client) { socket.on('error', () => { /* weg */ }); weigerSocket(socket, { t: 'fout', code: 'BEZET' }); return; }
    const c = { socket, klaar: false };
    client = c;
    const hostNonce = nonce();
    const authTimer = setTimeout(() => { if (!c.klaar) { c.geweigerd = true; if (client === c) client = null; weigerSocket(socket, { t: 'fout', code: 'TIME-OUT' }); } }, authTimeoutMs);
    socket.write(regel({ t: 'hallo', v: 1, nonce: hostNonce, versie: VERSIE }));
    const lees = maakRegelLezer((m) => {
      if (c.geweigerd) return;
      if (!c.klaar) {
        const ok = m?.t === 'auth' && typeof m.nonce === 'string' && /^[0-9a-f]{32}$/.test(m.nonce) && gelijk(m.bewijs, bewijs(token, 'client', hostNonce, m.nonce));
        if (!ok) { log('aanmelding geweigerd'); c.geweigerd = true; clearTimeout(authTimer); if (client === c) client = null; weigerSocket(socket, { t: 'fout', code: 'TOKEN' }); return; }
        clearTimeout(authTimer);
        c.klaar = true;
        socket.write(regel({ t: 'welkom', bewijs: bewijs(token, 'host', m.nonce, hostNonce), status: laatsteStatus }));
        log('lokale agent verbonden');
        meldClient(true);
        return;
      }
      if (c.klaar && m?.t === 'opdracht') opdrachtVanClient(m);
    }, () => socket.destroy());
    socket.on('data', lees);
    socket.on('error', () => { /* close volgt */ });
    socket.on('close', () => {
      clearTimeout(authTimer);
      if (client === c) {
        client = null;
        if (lopend) { clearTimeout(lopend.timer); lopend = null; }
        if (c.klaar) { log('lokale agent weg'); meldClient(false); }
      }
    });
  }

  /** De extensie stuurde een bericht boven 1 MB: dat hoort bij de lopende opdracht (de extensie zelf begrenst ook). */
  function teGroot() { beeindigLopend(false, 'LOKAAL_TE_GROOT: het antwoord is groter dan 1 MB'); }

  function sluitAlles() {
    if (lopend) { clearTimeout(lopend.timer); lopend = null; }
    if (client) { try { client.socket.destroy(); } catch { /* al dicht */ } client = null; }
  }
  return { vanChrome, nieuweClient, sluitAlles, teGroot, get heeftClient() { return !!client?.klaar; }, get status() { return laatsteStatus; } };
}

/** Luister op de named pipe / unix-socket. Unix: oude socket zonder eigenaar weg, aanmaken met umask 0177, daarna chmod 0600. */
export async function luister(pad, opVerbinding) {
  if (process.platform !== 'win32') {
    maakEigenMap(path.dirname(pad));
    if (existsSync(pad)) {
      const leeft = await new Promise((res) => { const s = net.connect(pad); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
      if (leeft) throw Object.assign(new Error('BEZET: er draait al een extensie-host (andere browser of profiel?)'), { code: 'BEZET' });
      rmSync(pad, { force: true });
    }
  }
  const server = net.createServer({ allowHalfOpen: false }, opVerbinding);
  server.maxConnections = 4; // de kern laat er maar één toe; dit begrenst alleen wachtende pogingen
  const oud = process.platform !== 'win32' ? process.umask(0o177) : null;
  try {
    await new Promise((res, rej) => { server.once('error', rej); server.listen(pad, () => { server.off('error', rej); res(); }); });
  } finally { if (oud !== null) process.umask(oud); }
  if (process.platform !== 'win32') chmodSync(pad, 0o600);
  return server;
}

export async function hoofd({ argv = process.argv.slice(2), env = process.env, stdin = process.stdin, stdout = process.stdout } = {}) {
  // Chrome geeft de origin van de aanroeper mee (Windows daarnaast --parent-window=…). Alleen onze extensie.
  if (!argv.includes(EXTENSIE_ORIGIN)) {
    log(`geweigerd: niet gestart door de Mijn Ruimte-extensie (verwacht ${EXTENSIE_ORIGIN})`);
    process.exitCode = 2;
    return;
  }
  const tPad = tokenPad(env);
  const sPad = socketPad(env);
  let server = null;
  let gestopt = false;
  const schrijf = (obj) => { stdout.write(codeerBericht(obj, MAX_BERICHT)); };
  const token = schrijfNieuwToken(tPad);
  const kern = maakHostKern({ token, naarChrome: schrijf });
  const stop = (reden, code = 0) => {
    if (gestopt) return; gestopt = true;
    log(`stopt (${reden})`);
    kern.sluitAlles();
    try { server?.close(); } catch { /* al dicht */ }
    verwijderStil(tPad);
    if (process.platform !== 'win32') verwijderStil(sPad);
    process.exitCode = code;
    setTimeout(() => process.exit(code), 50).unref();
  };
  const decoder = maakDecoder((m) => kern.vanChrome(m), (soort, lengte) => {
    log(`bericht van de extensie geweigerd (${soort}, ${lengte} bytes)`);
    if (soort === 'TE_GROOT') kern.teGroot();
  });
  stdin.on('data', (chunk) => decoder.push(chunk));
  stdin.on('end', () => stop('stdin dicht'));
  stdin.on('close', () => stop('stdin dicht'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  try {
    server = await luister(sPad, (s) => kern.nieuweClient(s));
  } catch (e) {
    log(String(e?.message || e));
    try { schrijf({ t: 'hallo', versie: VERSIE, luistert: false, fout: e?.code === 'BEZET' ? 'BEZET' : 'LUISTER_FOUT' }); } catch { /* chrome weg */ }
    stop('kan niet luisteren', 1);
    return;
  }
  log(`luistert (versie ${VERSIE})`);
  schrijf({ t: 'hallo', versie: VERSIE, luistert: true });
}

const ditBestand = fileURLToPath(import.meta.url);
let gestartAls = '';
try { gestartAls = process.argv[1] ? realpathSync(path.resolve(process.argv[1])) : ''; } catch { gestartAls = ''; }
const zelfde = process.platform === 'win32' ? ditBestand.toLowerCase() === gestartAls.toLowerCase() : ditBestand === gestartAls;
if (zelfde) hoofd().catch((e) => { log(`fout: ${String(e?.message || e)}`); process.exit(1); });
