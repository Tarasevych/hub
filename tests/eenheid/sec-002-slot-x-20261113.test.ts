// SEC-002 · slot «x» (13.11.2026) — restpunten uit de controle vóór de uitgave (gereed/uitslag, «bevestigd»).
//
// 1. WEBSOCKET VAN DE TERMINAL (NAUWK-01). Slot «t» sloot het «oracle» van de tunnel van het externe bureaublad, maar
//    terminalUpgrade() keek nog EERST naar de stand: geen sessie die op haar browser wacht → meteen 403; wel zo'n sessie → 101,
//    of 503 als 8 onaangemelde verbindingen open stonden. Een anoniem (Origin is buiten een browser vrij te kiezen) zag dus of er een
//    terminal openging, en kon met 8 verbindingen de browser van de eigenaar een 503 bezorgen. Deze test toont, zoals voor de tunnel:
//    - het antwoord voor wie geen cookie van de eigenaar heeft is BYTE VOOR BYTE gelijk, met en zonder (wachtende) sessie;
//    - het werk (aantal cookie-opzoekingen) en de tijd hangen niet af van de stand;
//    - nergens een 503 voor een anoniem, ook niet bij een vloed;
//    - de eigenaar met zijn eigen tech-cookie komt binnen terwijl anoniemen alle opzoekplaatsen bezet houden (eigen pool), en zijn
//      gewone aanmelding met het eenmalige ticket werkt zoals op 11e0aad8 — ook met de echte cookie uit de database.
//    Термінал: однакова відповідь, обсяг роботи й час для аноніма незалежно від сеансу; власник має окремі місця; законний вхід працює.
// 2. ZOEKINDEX LEEST NIETS ZONDER GRENS (NAUWK-05). Een cloudbestand met een verouderde sizeBytes (klein) terwijl het bestand op
//    schijf groot is, wordt NIET (volledig) ingelezen voor de index: storage.read krijgt maxBytes = de inhoudsgrens en geeft teGroot;
//    de inhoud komt niet in de index. Пошуковий індекс читає файл лише з межею maxBytes; завеликий вміст не індексується.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer as httpServer, type IncomingMessage } from 'node:http';
import { connect as netConnect, type AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { checker } from './hulp/nep-google';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const mediaan = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Rauwe WS-upgrade over TCP: het volledige antwoord (kop) en de tijd tot dat antwoord. Bij 101 wordt de verbinding gesloten. */
function rauw(poort: number, pad: string, koppen: Record<string, string> = {}, origin = `http://127.0.0.1:${poort}`): Promise<{ tekst: string; ms: number; status: number }> {
  return new Promise((res) => {
    const t0 = performance.now();
    const s = netConnect(poort, '127.0.0.1');
    let buf = ''; let klaar = false;
    const af = () => { if (klaar) return; klaar = true; const ms = performance.now() - t0; const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buf)?.[1] || 0); s.destroy(); res({ tekst: buf, ms, status }); };
    s.on('connect', () => {
      const extra = Object.entries(koppen).map(([k, v]) => `${k}: ${v}\r\n`).join('');
      s.write(`GET ${pad} HTTP/1.1\r\nHost: 127.0.0.1:${poort}\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n${extra}\r\n`);
    });
    s.on('data', (d) => { buf += d.toString('latin1'); if (buf.includes('\r\n\r\n')) af(); });
    s.on('close', af); s.on('error', af);
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-slot-x-20261113');
  const W = process.cwd();
  const uploads = mkdtempSync(join(tmpdir(), 'sec002-x-wolk-'));
  process.env.UPLOADS_DIR = uploads;
  const metDb = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_SYSTEM);

  const term = await import('../../backend/terminal');
  const { TECH_ASSET_COOKIE } = await import('../../shared/tech-bundels');
  const { WebSocket } = await import('ws');
  const PAD = '/terminal/ws';
  const verwacht = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n';

  const http = httpServer((_q, s) => { s.statusCode = 404; s.end(); });
  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => { term.terminalUpgrade(req, socket, head); });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const poort = (http.address() as AddressInfo).port;
  const vraag = (koppen: Record<string, string> = {}) => rauw(poort, PAD, koppen);

  /** Een sessie in het geheugen zoals openen() haar maakt (zonder agent): wacht op haar browser met een eenmalig ticket. */
  const nepSessie = (over: Record<string, unknown> = {}) => {
    const ticket = randomBytes(32).toString('base64url'); const nu = Date.now();
    const s = { sid: randomUUID(), userId: randomUUID(), agentId: randomUUID(), ticketHash: sha(ticket), ticketExp: nu + 30_000, begin: nu, eind: nu + 600_000, browser: null,
      gestart: false, open: true, opname: [], opnameBytes: 0, bytes: 0, timer: setTimeout(() => undefined, 0), wachtrij: [] as string[], ...over };
    term._sessies.set(s.sid, s as never);
    return { s, ticket };
  };
  /** Echte WebSocket-client: aanmelden met het ticket; uitkomst = eerste bericht of de sluitcode. */
  const aanmelden = (cookie: string, ticket: string) => new Promise<string>((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${poort}${PAD}`, { headers: { origin: `http://127.0.0.1:${poort}`, cookie } });
    const tm = setTimeout(() => { res('geen antwoord'); ws.terminate(); }, 3000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', ticket })));
    ws.on('message', (d) => { clearTimeout(tm); res(`bericht ${String(d).slice(0, 80)}`); ws.close(); });
    ws.on('close', (code) => { clearTimeout(tm); res(`dicht ${code}`); });
    ws.on('unexpected-response', (_q, r) => { clearTimeout(tm); res(`HTTP ${r.statusCode}`); });
    ws.on('error', () => undefined);
  });

  // Nep-opzoeking van de cookie (in plaats van de database): 40 ms, telt mee; een «hek» kan opzoekingen vasthouden.
  const LOOKUP_MS = 40;
  let opzoekingen = 0; let hek: Promise<void> | null = null; let hekOpen: () => void = () => undefined;
  const geldig = new Map<string, string>(); // cookie-sleutel → user-id
  term._zetCookieEigenaar(async (sleutel) => {
    opzoekingen += 1;
    if (hek) await hek;
    await wacht(LOOKUP_MS);
    return geldig.get(sleutel) ?? null;
  });
  const verzonnen = () => `${TECH_ASSET_COOKIE}=${randomBytes(32).toString('base64url')}`;

  // ================================================================ 1. terminal: geen oracle, eigen pool, gewone aanmelding werkt
  try {
    type Meting = { teksten: string[]; lookupsPerVerzoek: number[]; msVerzonnen: number[]; msZonder: number[] };
    const meet = async (): Promise<Meting> => {
      const m: Meting = { teksten: [], lookupsPerVerzoek: [], msVerzonnen: [], msZonder: [] };
      for (let i = 0; i < 5; i++) {
        const z = await vraag(); m.teksten.push(z.tekst); m.msZonder.push(z.ms);
        const voor = opzoekingen;
        const v = await vraag({ cookie: verzonnen() }); m.teksten.push(v.tekst); m.msVerzonnen.push(v.ms);
        m.lookupsPerVerzoek.push(opzoekingen - voor);
        m.teksten.push((await vraag({ cookie: `${TECH_ASSET_COOKIE}=kapot` })).tekst);
        m.teksten.push((await rauw(poort, PAD, {}, 'https://boos.example')).tekst);
      }
      return m;
    };
    term._sessies.clear();
    const geen = await meet();
    const verbonden = nepSessie({ browser: {}, ticketHash: '' }); // open, al gekoppeld (wacht niet)
    const metOpen = await meet();
    term._sessies.delete(verbonden.s.sid);
    const wachtend = nepSessie();
    const metWachtend = await meet();
    const alle = [...geen.teksten, ...metOpen.teksten, ...metWachtend.teksten];
    check('terminal/oracle: het antwoord voor wie geen cookie van de eigenaar heeft is byte voor byte gelijk (403), met en zonder (wachtende) sessie (vroeger: 101/503 alleen als er een sessie wachtte)',
      alle.every((t) => t === verwacht), [...new Set(alle.map((t) => JSON.stringify(t)))].join(' | ').slice(0, 300));
    check('terminal/oracle: hetzelfde werk (cookie-opzoekingen per verzoek) in elke stand',
      JSON.stringify(geen.lookupsPerVerzoek) === JSON.stringify(metWachtend.lookupsPerVerzoek) && JSON.stringify(metOpen.lookupsPerVerzoek) === JSON.stringify(metWachtend.lookupsPerVerzoek) && geen.lookupsPerVerzoek.every((n) => n === 1),
      `geen=${geen.lookupsPerVerzoek} open=${metOpen.lookupsPerVerzoek} wachtend=${metWachtend.lookupsPerVerzoek}`);
    const dVerzonnen = Math.abs(mediaan(metWachtend.msVerzonnen) - mediaan(geen.msVerzonnen));
    const dZonder = Math.abs(mediaan(metWachtend.msZonder) - mediaan(geen.msZonder));
    check(`terminal/oracle: de tijd tot het antwoord hangt niet af van de stand (verschil van de medianen < ${LOOKUP_MS / 2} ms bij een opzoeking van ${LOOKUP_MS} ms)`,
      dVerzonnen < LOOKUP_MS / 2 && dZonder < LOOKUP_MS / 2, `verzonnen: geen=${mediaan(geen.msVerzonnen).toFixed(1)} wachtend=${mediaan(metWachtend.msVerzonnen).toFixed(1)}; zonder: ${mediaan(geen.msZonder).toFixed(1)}/${mediaan(metWachtend.msZonder).toFixed(1)} ms`);
    check('terminal/oracle: de wachtende sessie is door al die pogingen niet geraakt (ticket nog geldig, geen browser)', wachtend.s.open && !!wachtend.s.ticketHash && !wachtend.s.browser);

    // ---- vloed: 24 gelijktijdige verzonnen cookies terwijl de opzoekingen vastzitten
    const vloed = async () => {
      hek = new Promise<void>((r) => { hekOpen = r; });
      const lopend = Array.from({ length: 24 }, () => vraag({ cookie: verzonnen() }));
      const meteen: number[] = [];
      lopend.forEach((p) => { void p.then((r) => meteen.push(r.status)); });
      await wacht(150);
      const snel = [...meteen].sort();
      hekOpen(); hek = null;
      const alleStatus = (await Promise.all(lopend)).map((r) => r.status);
      return { snel, alleStatus };
    };
    term._sessies.clear();
    const vloedGeen = await vloed();
    nepSessie();
    const vloedWachtend = await vloed();
    check('terminal/vloed: geen enkele 503 voor een anoniem, alleen 403 (vroeger 503 zodra 8 verbindingen open stonden terwijl een sessie wachtte)',
      [...vloedGeen.alleStatus, ...vloedWachtend.alleStatus].every((s) => s === 403), `geen: ${vloedGeen.alleStatus.join(',')} | wachtend: ${vloedWachtend.alleStatus.join(',')}`);
    check('terminal/vloed: wat meteen terugkomt (en wat moet wachten) is gelijk met en zonder wachtende sessie',
      JSON.stringify(vloedGeen.snel) === JSON.stringify(vloedWachtend.snel), `geen: [${vloedGeen.snel}] wachtend: [${vloedWachtend.snel}]`);

    // ---- de eigenaar: eigen cookie in het geheugen → binnen, terwijl anoniemen alle opzoekplaatsen bezet houden
    term._sessies.clear();
    const uid = randomUUID();
    const eigenSleutel = randomBytes(32).toString('base64url');
    const eigenCookie = `${TECH_ASSET_COOKIE}=${eigenSleutel}`;
    geldig.set(eigenSleutel, uid);
    const eigen = nepSessie({ userId: uid });
    term._zetCookieLader(async (u) => (u === uid ? [{ hash: sha(eigenSleutel), tot: Date.now() + 3_600_000 }] : []));
    await term._eigenCookiesLaden(uid);
    hek = new Promise<void>((r) => { hekOpen = r; });
    const voorBezet = opzoekingen;
    const bezetters = Array.from({ length: 20 }, () => vraag({ cookie: verzonnen() }));
    await wacht(100);
    const eigenaar = await Promise.race([vraag({ cookie: eigenCookie }), wacht(1500).then(() => ({ status: 0, tekst: 'geen antwoord binnen 1,5 s', ms: 1500 }))]);
    check('terminal/eigen plaatsen: de eigenaar met zijn eigen cookie krijgt de WebSocket (101) terwijl anoniemen alle opzoekplaatsen vasthouden (vroeger 503)',
      eigenaar.status === 101 && opzoekingen - voorBezet === 16, `status=${eigenaar.status} ${eigenaar.tekst.split('\r\n')[0]}; opzoekingen=${opzoekingen - voorBezet}`);
    // De gewone aanmelding (eenmalig ticket) werkt met de eigen cookie zoals op 11e0aad8.
    const aan = await aanmelden(eigenCookie, eigen.ticket);
    check('terminal/aanmelding: eigen cookie + eenmalig ticket → «verbonden» (zoals op 11e0aad8)', aan.startsWith('bericht') && aan.includes('"verbonden"'), aan);
    hekOpen(); hek = null;
    await Promise.all(bezetters);
    await wacht(50);
    check('terminal/aanmelding: het ticket is eenmalig (verbruikt) en de sessie heeft haar browser', eigen.s.ticketHash === '');
    check('terminal/eigen plaatsen: dezelfde cookie zonder wachtende sessie van de eigenaar → hetzelfde 403 als voor een anoniem', (await vraag({ cookie: eigenCookie })).tekst === verwacht);

    // ---- het ticket van een ANDERE gebruiker helpt niet, ook niet met een geldige eigen cookie
    term._sessies.clear();
    const b = nepSessie({ userId: uid });
    const vreemd = nepSessie();
    await term._eigenCookiesLaden(uid);
    const metVreemd = await aanmelden(eigenCookie, vreemd.ticket);
    check('terminal/aanmelding: eigen cookie + ticket van de sessie van iemand anders → gesloten (4403), die sessie blijft wachten',
      metVreemd === 'dicht 4403' && !!vreemd.s.ticketHash && !vreemd.s.browser, metVreemd);

    // ---- eigen pool vol → 503 alleen voor de eigenaar; een anoniem krijgt ook dan 403
    const open: InstanceType<typeof WebSocket>[] = [];
    for (let i = 0; i < 8; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${poort}${PAD}`, { headers: { origin: `http://127.0.0.1:${poort}`, cookie: eigenCookie } });
      ws.on('error', () => undefined);
      await new Promise<void>((r) => { ws.on('open', () => r()); ws.on('unexpected-response', () => r()); setTimeout(r, 1000); });
      open.push(ws);
    }
    const negende = await vraag({ cookie: eigenCookie });
    const anoniemBijVol = await vraag({ cookie: verzonnen() });
    check('terminal/eigen pool: 8 wachtende verbindingen van de eigenaar → de 9e van de eigenaar krijgt 503, een anoniem nog steeds hetzelfde 403',
      term._terminalEigenaarWachtend() === 8 && negende.status === 503 && anoniemBijVol.tekst === verwacht, `wachtend=${term._terminalEigenaarWachtend()} 9e=${negende.status} anoniem=${anoniemBijVol.status}`);
    for (const ws of open) ws.terminate();
    for (let i = 0; i < 40 && term._terminalEigenaarWachtend() > 0; i++) await wacht(25);
    check('terminal/eigen pool: plaatsen komen vrij als de verbindingen sluiten', term._terminalEigenaarWachtend() === 0, String(term._terminalEigenaarWachtend()));

    // ---- de bekende cookies vervallen met de laatste sessie van de eigenaar
    term._sessies.delete(vreemd.s.sid);
    geldig.delete(eigenSleutel); // ook de opzoeking kent haar niet meer (tech-profiel beëindigd)
    term.sluitEigen({ id: uid } as never, b.s.sid);
    check('terminal/eigen plaatsen: na het sluiten van de laatste sessie geen doorgang meer met die cookie', (await vraag({ cookie: eigenCookie })).tekst === verwacht);

    // ---- de bron: de stand wordt niet meer vóór de cookie gelezen, geen 503 in de anonieme weg
    const bron = readFileSync(join(W, 'backend/terminal.ts'), 'utf8');
    const upg = bron.slice(bron.indexOf('export function terminalUpgrade('));
    check('terminal/bron: terminalUpgrade() leest de sessiestand niet meer vóór de cookie («if (!wacht) 403» is weg) en kent geen 503 voor onbekenden',
      !/if \(!wacht\)/.test(upg) && upg.indexOf('sleutelUitCookie(') < upg.indexOf('wachtOpBrowser(') && !/onaangemeld >= /.test(bron));
  } finally {
    term._zetCookieEigenaar(null);
    term._zetCookieLader(null);
    term._sessies.clear();
    term._terminalWeigeringenLeeg();
  }

  // ================================================================ 1b. gewone aanmelding met de ECHTE tech-cookie uit de database
  if (metDb) {
    const { getPool } = await import('../../server/platform/pg');
    const { assetCookieVoor, sleutelUitCookie, gebruikerVanSleutel, geldigeSleutelsVan } = await import('../../backend/tech-bundels');
    const { tabHash } = await import('../../backend/tech-profiel');
    const pool = getPool('systeem');
    const u = randomUUID();
    try {
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', u, { email: `slot-x-${randomBytes(4).toString('hex')}@eenheid.test`, role: 'member', status: 'approved' }]);
      const pid = `tech-${randomBytes(6).toString('hex')}`;
      await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['ontwikkelaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [u, pid]);
      const act = String((await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['ontwikkelaar'],'slot-x-test', now() + interval '60 minutes') RETURNING id`, [u, pid, tabHash(randomBytes(24).toString('hex'))])).rows[0].id);
      const kop = await assetCookieVoor('', { id: act, eind: Date.now() + 3_600_000 }, u);
      const sleutel = sleutelUitCookie(String(kop || '').split(';')[0]);
      check('(voorwaarde) /api/owner/tech/status zet de tech-cookie (assetCookieVoor)', !!sleutel, `Set-Cookie ${kop ? 'aanwezig' : 'ontbreekt'}`);
      const lijst = await geldigeSleutelsVan(u);
      check('tech-cookie: de echte opzoeking kent de eigenaar; de lijst van geldige sleutels bevat haar', (await gebruikerVanSleutel(sleutel)) === u && lijst.some((x) => x.hash === sha(sleutel)) && (await gebruikerVanSleutel(randomBytes(32).toString('base64url'))) === null);
      const cookie = `andere=1; ${TECH_ASSET_COOKIE}=${sleutel}`;
      // a) cookie nog niet in het geheugen → één echte opzoeking → binnen
      const s1 = nepSessie({ userId: u });
      const r1 = await aanmelden(cookie, s1.ticket);
      check('terminal/aanmelding (echte database): tech-cookie + ticket → «verbonden», ook zonder vooraf geladen cookie', r1.includes('"verbonden"'), r1);
      // b) zoals openen() doet: cookies vooraf geladen → zonder opzoeking binnen
      const s2 = nepSessie({ userId: u });
      await term._eigenCookiesLaden(u);
      const r2 = await aanmelden(cookie, s2.ticket);
      check('terminal/aanmelding (echte database): na het laden bij openen() → «verbonden»', r2.includes('"verbonden"'), r2);
      // c) na het beëindigen van het technisch profiel: de cookie geldt niet meer
      term._sessies.clear();
      await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'zelf' WHERE id = $1`, [act]);
      const s3 = nepSessie({ userId: u });
      await term._eigenCookiesLaden(u); // zoals openen(): de lijst opnieuw uit de database (nu leeg)
      const r3 = await aanmelden(cookie, s3.ticket);
      check('terminal/aanmelding (echte database): technisch profiel beëindigd → 403 vóór de handdruk, ook met een geldig ticket', r3 === 'HTTP 403', r3);
    } finally {
      term._sessies.clear();
      term._terminalWeigeringenLeeg();
      await pool.query('DELETE FROM app.tech_asset_toegang WHERE user_id = $1', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [u]).catch(() => undefined);
    }
  } else console.log('OVERGESLAGEN: echte tech-cookie (geen database)');
  http.closeAllConnections?.();
  await new Promise((r) => http.close(r));

  // ================================================================ 2. zoekindex: verouderde sizeBytes, groot bestand → niet ingelezen
  if (metDb) {
    const { getPool } = await import('../../server/platform/pg');
    const platform = await import('../../server/platform');
    const { cloudVnextBestandenRoutes } = await import('../../backend/cloud-vnext-bestanden');
    const { metLade } = await import('../../backend/ruimte-cloud-agenda');
    const bronnen = await import('../../backend/zoek/bronnen');
    const pool = getPool('systeem');
    const a = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', a, { email: `slot-x-z-${randomBytes(4).toString('hex')}@eenheid.test`, role: 'member', status: 'approved' }]);
    const prive = { userId: a, ruimte: 'prive' as const };
    const rA = cloudVnextBestandenRoutes(async () => ({ user: { id: a, role: 'member', status: 'approved' }, service: 'cloud' }));
    const roep = async (pad: string, body: Record<string, unknown>) => {
      const res = await metLade(prive, 'cloud', async () => ((rA as unknown as Record<string, unknown[]>)[`POST /api/owner/cloud/vnext/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} }));
      return { status: res.statusCode, uit: JSON.parse(res.body) as Record<string, any> };
    };
    const echteRead = platform.storage.read;
    const lezingen: Array<{ maxBytes: unknown; teGroot: boolean; lengte: number }> = [];
    (platform.storage as { read: typeof echteRead }).read = (async (paden: string[], opties: Parameters<typeof echteRead>[1] = {}) => {
      const uit = await echteRead.call(platform.storage, paden, opties);
      lezingen.push({ maxBytes: opties?.maxBytes, teGroot: !!uit[0]?.teGroot, lengte: String(uit[0]?.content ?? '').length });
      return uit;
    }) as typeof echteRead;
    const oudMax = process.env.ZOEK_INDEX_INHOUD_MAX_MB;
    process.env.ZOEK_INDEX_INHOUD_MAX_MB = '1';
    const indexTeksten = async () => (await pool.query(`SELECT tekst FROM app.zoek_objecten WHERE user_id = $1 AND bron = 'cloud'`, [a])).rows.map((r) => String(r.tekst || ''));
    const verwerk = (id: string) => bronnen._intern.itemVerwerken(prive, { id: randomUUID(), userId: a, ruimte: 'prive', bron: 'cloud', bronId: id, actie: 'bijwerken', attempts: 0, payload: { inhoud: true } });
    try {
      const inhoud = Buffer.from(`Notitie SLOTXKLEIN ${'woord '.repeat(300)}`, 'utf8');
      const bgn = await roep('upload', { actie: 'begin', naam: 'notitie.txt', mime: 'text/plain', bytes: inhoud.length });
      await roep('upload', { actie: 'stuk', id: bgn.uit.id, offset: 0, data: inhoud.toString('base64') });
      const k = await roep('upload', { actie: 'klaar', id: bgn.uit.id, sha256: sha(inhoud) });
      const id = String(k.uit.bestand?.id || '');
      const rij = (await pool.query(`SELECT data->>'storagePath' AS p, (data->>'sizeBytes')::bigint AS n FROM app.records WHERE tbl='cloud_items_v1' AND id=$1`, [id])).rows[0];
      const schijf = join(uploads, String(rij?.p || ''));
      await verwerk(id);
      check('(voorwaarde) zoekindex: het kleine tekstbestand wordt met zijn inhoud geïndexeerd (gelezen met maxBytes)',
        (await indexTeksten()).some((t) => t.includes('SLOTXKLEIN')) && lezingen.length === 1 && lezingen[0].maxBytes === 1024 * 1024 && !lezingen[0].teGroot, JSON.stringify(lezingen));
      // Verouderd record: sizeBytes blijft klein, op schijf staat nu 3 MiB tekst (boven de grens van 1 MiB).
      writeFileSync(schijf, `Groot SLOTXGROOT ${'x'.repeat(3 * 1024 * 1024)}`);
      lezingen.length = 0;
      await verwerk(id);
      const teksten = await indexTeksten();
      check('zoekindex: verouderde sizeBytes + 3 MiB op schijf → gelezen met maxBytes = inhoudsgrens (1 MiB), teGroot, niets van de inhoud ingelezen',
        Number(rij?.n) < 1024 * 1024 && lezingen.length === 1 && lezingen[0].maxBytes === 1024 * 1024 && lezingen[0].teGroot && lezingen[0].lengte === 0, `sizeBytes=${rij?.n} ${JSON.stringify(lezingen)}`);
      check('zoekindex: de grote inhoud komt niet in de index', !teksten.some((t) => t.includes('SLOTXGROOT')), `${teksten.length} rij(en)`);
      const bronCode = readFileSync(join(W, 'backend/zoek/bronnen.ts'), 'utf8');
      const zonder = bronCode.split('\n').map((r, i) => (/storage\.read\(/.test(r) && !/maxBytes/.test(r) ? `bronnen.ts:${i + 1}` : '')).filter(Boolean);
      check('zoekindex/bron: elke storage.read in backend/zoek/bronnen.ts geeft maxBytes mee', zonder.length === 0, zonder.join(', '));
    } finally {
      (platform.storage as { read: typeof echteRead }).read = echteRead;
      if (oudMax === undefined) delete process.env.ZOEK_INDEX_INHOUD_MAX_MB; else process.env.ZOEK_INDEX_INHOUD_MAX_MB = oudMax;
      await pool.query(`DELETE FROM app.zoek_objecten WHERE user_id = $1`, [a]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl = 'cloud_items_v1' AND data->>'ownerUserId' = $1`, [a]).catch(() => undefined);
    }
  } else console.log('OVERGESLAGEN: zoekindex-grens (geen database)');
  rmSync(uploads, { recursive: true, force: true });

  return einde();
}
