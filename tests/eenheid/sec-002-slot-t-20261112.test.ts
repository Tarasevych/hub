// SEC-002 · slot «t» (12.11.2026) — drie restpunten uit de eindcontrole «omzeiling» (K/eind/omzeiling.md, punten 3, 5 en 6).
//
// 1. TUNNEL VAN HET EXTERNE BUREAUBLAD (toets-g01-6, «oracle»). Vroeger zag een anoniem aan het ANTWOORD (403 tegenover
//    503 «16 cookie-opzoekingen») en aan de TIJD (meteen tegenover na een databasevraag) of de eigenaar een sessie open had
//    staan; en met 16 gelijktijdige verzonnen cookies kon hij de eigenaar zelf een 503 bezorgen. Deze test toont:
//    - het antwoord voor wie geen cookie van de eigenaar heeft is BYTE VOOR BYTE gelijk, met en zonder (wachtende) sessie;
//    - het werk (aantal cookie-opzoekingen) en de tijd hangen niet af van de stand van de eigenaar;
//    - nergens een 503 voor een anoniem, ook niet bij een vloed;
//    - de eigenaar met zijn eigen cookie komt binnen terwijl anoniemen alle opzoekplaatsen bezet houden (eigen plaatsen).
//    Тунель віддаленого стола: однакова відповідь і час для аноніма незалежно від сеансу; власник має окремі місця.
// 2. htmlNaarTekst (zoekindex) LINEAIR. Vroeger kwadratische regexen (200 kB «<» → 42 s). Nu: elke vijandige invoer van
//    200 kB < 1 s, en de uitkomst is GELIJK aan de oude regex-pijplijn op het corpus én op 20 000 willekeurige stukken HTML.
//    Hetzelfde voor xmlNaarTekst (OOXML/ODF) en de gedeelde opschoning (`schoon`, «\f»-reeksen).
//    htmlNaarTekst — лінійний розбір; результат той самий, що в старої функції (корпус + випадкові дані).
// 3. vNext LEEST NIETS ZONDER GRENS. Een record met een verouderde sizeBytes (klein) terwijl het bestand op schijf groot is:
//    download (één stuk), de poort voor delen, het archief en de overdracht naar Google Drive lezen het NIET in het geheugen
//    maar weigeren met de bekende code (TE_GROOT / ARCHIEF_TE_GROOT / DOEL_LIMIET met uitleg uk/nl).
//    vNext: читання файла лише з межею maxBytes і зрозуміла відмова.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer as httpServer, type IncomingMessage } from 'node:http';
import { connect as netConnect, type AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { checker } from './hulp/nep-google';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const mediaan = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const C = (n: number) => String.fromCharCode(n);

// ---------------------------------------------------------------- de OUDE pijplijn (11e0aad8), letterlijk, als referentie
// (alleen op kleine invoer gebruikt: zij is kwadratisch). Еталон — стара функція з основи.
const NBSP_RUN = new RegExp(`[ \\t${C(0xa0)}]+`, 'g');
async function oudeFuncties() {
  const { decode: htmlDecode } = await import('html-entities');
  const schoon = (t: string, max: number) => t.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t\f\v]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
  const html = (h: string, max: number) => {
    const bron = h.slice(0, max * 8);
    const titel = htmlDecode((bron.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    let t = bron
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote|pre|table|ul|ol|dd|dt)\s*>/gi, '\n')
      .replace(/<(td|th)\b[^>]*>/gi, '\t')
      .replace(/<[^>]+>/g, ' ');
    t = htmlDecode(t).replace(NBSP_RUN, ' ').replace(/ *\n */g, '\n');
    return { tekst: schoon(t, max), titel };
  };
  const xml = (x: string, max: number) => {
    let t = x
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<w:tab\b[^>]*\/>|<text:tab\b[^>]*\/>/gi, '\t')
      .replace(/<w:br\b[^>]*\/>|<text:line-break\b[^>]*\/>|<a:br\b[^>]*\/>/gi, '\n')
      .replace(/<\/(w:p|text:p|text:h|a:p|table:table-row|row)\s*>/gi, '\n')
      .replace(/<\/(w:tc|table:table-cell|c)\s*>/gi, '\t')
      .replace(/<[^>]+>/g, '');
    t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n)))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16)))).replace(/&amp;/g, '&');
    return schoon(t.replace(/[ \t]+\n/g, '\n').replace(/\t{2,}/g, '\t'), max);
  };
  return { html, xml };
}

/** Rauwe WS-upgrade over TCP: het volledige antwoord (kop) en de tijd tot dat antwoord. Bij 101 wordt de verbinding gesloten. */
function rauw(poort: number, pad: string, koppen: Record<string, string> = {}): Promise<{ tekst: string; ms: number; status: number }> {
  return new Promise((res) => {
    const t0 = performance.now();
    const s = netConnect(poort, '127.0.0.1');
    let buf = ''; let klaar = false;
    const af = () => { if (klaar) return; klaar = true; const ms = performance.now() - t0; const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buf)?.[1] || 0); s.destroy(); res({ tekst: buf, ms, status }); };
    s.on('connect', () => {
      const extra = Object.entries(koppen).map(([k, v]) => `${k}: ${v}\r\n`).join('');
      s.write(`GET ${pad} HTTP/1.1\r\nHost: 127.0.0.1:${poort}\r\nOrigin: http://127.0.0.1:${poort}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Protocol: guacamole\r\n${extra}\r\n`);
    });
    s.on('data', (d) => { buf += d.toString('latin1'); if (buf.includes('\r\n\r\n')) af(); });
    s.on('close', af); s.on('error', af);
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-slot-t-20261112');
  const W = process.cwd();

  // ================================================================ 1. tunnel: geen oracle, eigen plaatsen voor de eigenaar
  {
    const map = mkdtempSync(join(tmpdir(), 'sec002-t-rb-'));
    const rechten = join(map, 'mcp-rechten.json');
    writeFileSync(rechten, JSON.stringify({ read: true, guacamole: true }));
    process.env.MCP_RECHTEN_PAD = rechten;
    process.env.REMOTE_CONTROLE_MS = '600000';
    const G = await import('../../shared/extern-bureaublad');
    const rb = await import('../../backend/remote-bureaublad');
    const { TECH_ASSET_COOKIE } = await import('../../shared/tech-bundels');
    const proef = rb as unknown as { _zetCookieLader?: (f: ((uid: string) => Promise<Array<{ hash: string; tot: number }>>) | null) => void; _eigenCookiesLaden?: (uid: string) => Promise<void> };

    const http = httpServer((_q, s) => { s.statusCode = 404; s.end(); });
    http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => { rb.upgrade(req, socket, head); });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const poort = (http.address() as AddressInfo).port;
    const vraag = (koppen: Record<string, string> = {}) => rauw(poort, rb.REMOTE_WS_PATH, koppen);

    // Nep-opzoeking van de cookie (in plaats van de database): 40 ms, telt mee; een «hek» kan opzoekingen vasthouden.
    const LOOKUP_MS = 40;
    let opzoekingen = 0; let hek: Promise<void> | null = null; let hekOpen: () => void = () => undefined;
    const geldig = new Map<string, string>(); // cookie-sleutel → user-id
    rb._zetCookieEigenaar(async (cookie) => {
      opzoekingen += 1;
      if (hek) await hek;
      await wacht(LOOKUP_MS);
      const sleutel = /=([A-Za-z0-9_-]{43})/.exec(String(cookie || ''))?.[1] || '';
      return geldig.get(sleutel) ?? null;
    });
    const nepSessie = (over: Record<string, unknown> = {}) => {
      const sid = randomUUID(); const nonce = randomBytes(18).toString('base64url'); const nu = Date.now();
      const s = { sid, userId: randomUUID(), tab: 'x', techSessie: null, verbindingId: randomUUID(), naam: 'proef', protocol: 'vnc', host: '127.0.0.1', ip: '127.0.0.1', poort: 5900, gebruiker: '', geheim: null,
        instellingen: G.instellingenNormaliseren({}), nonce, ticketExp: nu + 60_000, begin: nu, eind: nu + 600_000, laatsteInvoer: nu, ws: null, guacd: null, open: true, klaar: false, bytesIn: 0, bytesUit: 0, activatieId: 'x', timer: null, ...over };
      rb._sessies.set(sid, s as never);
      return s;
    };
    const verzonnen = () => `${TECH_ASSET_COOKIE}=${randomBytes(32).toString('base64url')}`;

    try {
      // ---- stand per toestand: geen sessie / sessie open maar verbonden / sessie wacht op haar ticket
      type Meting = { teksten: string[]; lookupsPerVerzoek: number[]; msVerzonnen: number[]; msZonder: number[] };
      const meet = async (): Promise<Meting> => {
        const m: Meting = { teksten: [], lookupsPerVerzoek: [], msVerzonnen: [], msZonder: [] };
        for (let i = 0; i < 5; i++) {
          const z = await vraag(); m.teksten.push(z.tekst); m.msZonder.push(z.ms);
          const voor = opzoekingen;
          const v = await vraag({ cookie: verzonnen() }); m.teksten.push(v.tekst); m.msVerzonnen.push(v.ms);
          m.lookupsPerVerzoek.push(opzoekingen - voor);
          m.teksten.push((await vraag({ cookie: `${TECH_ASSET_COOKIE}=kapot` })).tekst);
        }
        return m;
      };
      rb._sessies.clear();
      const geen = await meet();
      const verbonden = nepSessie({ ws: {} }); // open, maar al gekoppeld (wacht niet)
      const metOpen = await meet();
      rb._sessies.delete(verbonden.sid);
      const wachtend = nepSessie();
      const metWachtend = await meet();
      const alle = [...geen.teksten, ...metOpen.teksten, ...metWachtend.teksten];
      const verwacht = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n';
      check('tunnel/oracle: het antwoord voor wie geen cookie van de eigenaar heeft is byte voor byte gelijk (403), met en zonder (wachtende) sessie',
        alle.every((t) => t === verwacht), [...new Set(alle.map((t) => JSON.stringify(t)))].join(' | ').slice(0, 300));
      check('tunnel/oracle: hetzelfde werk (cookie-opzoekingen per verzoek) in elke stand — geen databasevraag «alleen als er een sessie wacht»',
        JSON.stringify(geen.lookupsPerVerzoek) === JSON.stringify(metWachtend.lookupsPerVerzoek) && JSON.stringify(metOpen.lookupsPerVerzoek) === JSON.stringify(metWachtend.lookupsPerVerzoek),
        `geen=${geen.lookupsPerVerzoek} open=${metOpen.lookupsPerVerzoek} wachtend=${metWachtend.lookupsPerVerzoek}`);
      const dVerzonnen = Math.abs(mediaan(metWachtend.msVerzonnen) - mediaan(geen.msVerzonnen));
      const dZonder = Math.abs(mediaan(metWachtend.msZonder) - mediaan(geen.msZonder));
      check(`tunnel/oracle: de tijd tot het antwoord hangt niet af van de stand (verschil van de medianen < ${LOOKUP_MS / 2} ms bij een opzoeking van ${LOOKUP_MS} ms)`,
        dVerzonnen < LOOKUP_MS / 2 && dZonder < LOOKUP_MS / 2, `verzonnen: geen=${mediaan(geen.msVerzonnen).toFixed(1)} wachtend=${mediaan(metWachtend.msVerzonnen).toFixed(1)}; zonder: ${mediaan(geen.msZonder).toFixed(1)}/${mediaan(metWachtend.msZonder).toFixed(1)} ms`);

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
      rb._sessies.clear();
      const vloedGeen = await vloed();
      nepSessie();
      const vloedWachtend = await vloed();
      check('tunnel/vloed: geen enkele 503 voor een anoniem (vroeger 503 «te veel cookie-opzoekingen» alleen als er een sessie wachtte)',
        ![...vloedGeen.alleStatus, ...vloedWachtend.alleStatus].includes(503) && [...vloedGeen.alleStatus, ...vloedWachtend.alleStatus].every((s) => s === 403),
        `geen: ${vloedGeen.alleStatus.join(',')} | wachtend: ${vloedWachtend.alleStatus.join(',')}`);
      check('tunnel/vloed: wat meteen terugkomt (en wat moet wachten) is gelijk met en zonder wachtende sessie',
        JSON.stringify(vloedGeen.snel) === JSON.stringify(vloedWachtend.snel), `geen: [${vloedGeen.snel}] wachtend: [${vloedWachtend.snel}]`);

      // ---- de eigenaar komt binnen terwijl anoniemen alle opzoekplaatsen bezet houden
      rb._sessies.clear();
      const uid = randomUUID();
      const eigenSleutel = randomBytes(32).toString('base64url');
      const eigenCookie = `${TECH_ASSET_COOKIE}=${eigenSleutel}`;
      geldig.set(eigenSleutel, uid);
      const eigen = nepSessie({ userId: uid });
      if (proef._zetCookieLader && proef._eigenCookiesLaden) {
        proef._zetCookieLader(async (u) => (u === uid ? [{ hash: sha(eigenSleutel), tot: Date.now() + 60_000 }] : []));
        await proef._eigenCookiesLaden(uid);
      }
      hek = new Promise<void>((r) => { hekOpen = r; });
      const bezetters = Array.from({ length: 20 }, () => vraag({ cookie: verzonnen() }));
      await wacht(100);
      const eigenaar = await Promise.race([vraag({ cookie: eigenCookie }), wacht(1500).then(() => ({ status: 0, tekst: 'geen antwoord binnen 1,5 s', ms: 1500 }))]);
      check('tunnel/eigen plaatsen: de eigenaar met zijn eigen cookie krijgt de WebSocket (101) terwijl anoniemen alle opzoekplaatsen vasthouden',
        eigenaar.status === 101, `status=${eigenaar.status} ${eigenaar.tekst.split('\r\n')[0]}`);
      hekOpen(); hek = null;
      await Promise.all(bezetters);
      rb._sessies.delete(eigen.sid);
      check('tunnel/eigen plaatsen: dezelfde cookie zonder wachtende sessie van de eigenaar → hetzelfde 403 als voor een anoniem',
        (await vraag({ cookie: eigenCookie })).tekst === verwacht);
      rb.beeindigVoorGebruiker(uid, 'test-einde');
      check('tunnel/eigen plaatsen: de bekende cookies van de eigenaar vervallen met zijn laatste sessie (geen doorgang meer)',
        (await vraag({ cookie: eigenCookie })).status === 403);

      // ---- de bron: geen «503» meer in de anonieme weg, en de stand wordt niet vóór de cookie gelezen
      const bron = readFileSync(join(W, 'backend/remote-bureaublad.ts'), 'utf8');
      const upg = bron.slice(bron.indexOf('export function upgrade('));
      check('tunnel/bron: upgrade() leest de sessiestand niet meer vóór de cookie («if (!open) 403» is weg)', !/if \(!open\)/.test(upg));
      void wachtend;
    } finally {
      rb._zetCookieEigenaar(null);
      proef._zetCookieLader?.(null);
      for (const s of [...rb._sessies.values()]) rb.beeindigVoorGebruiker((s as { userId: string }).userId, 'test-einde');
      rb._sessies.clear();
      http.closeAllConnections?.();
      await new Promise((r) => http.close(r));
      rmSync(map, { recursive: true, force: true });
    }
  }

  // ================================================================ 2. htmlNaarTekst / xmlNaarTekst lineair en gelijk aan de oude
  {
    const tk = await import('../../backend/zoek/tekst-kern') as typeof import('../../backend/zoek/tekst-kern') & { xmlNaarTekst?: (x: string, max: number) => string };
    const oud = await oudeFuncties();
    const N = 200_000;
    const vijandig: Array<[string, string]> = [
      ['«<» ×200k', '<'.repeat(N)], ['«<svg » ×40k', '<svg '.repeat(N / 5)], ['«<style» ×33k', '<style'.repeat(Math.floor(N / 6))],
      ['«<script>» zonder sluittag', '<script>'.repeat(N / 8)], ['«<!--» ×50k', '<!--'.repeat(N / 4)], ['«<title>» ×28k', '<title>'.repeat(Math.floor(N / 7))],
      ['«<td » ×50k', '<td '.repeat(N / 4)], ['«<th» ×66k', '<th'.repeat(Math.floor(N / 3))], ['«\\f» ×200k', C(12).repeat(N)], ['« \\f» ×100k', ` ${C(12)}`.repeat(N / 2)],
      ['«<br» + spaties', `<br${' '.repeat(N)}`], ['«</p» + witruimte ×', `</p${'\t'.repeat(10)}`.repeat(N / 14)], ['«<a <b <c» ×', '<a <b <c '.repeat(N / 9)],
      ['«<head x» ×', '<head x'.repeat(N / 7)], ['«<noscript>» + «</noscript» zonder >', `<noscript>${'</noscript '.repeat(N / 11)}`],
    ];
    let traagste = 0, traagsteNaam = '';
    for (const [naam, invoer] of vijandig) {
      const b = performance.now(); tk.htmlNaarTekst(invoer); const ms = performance.now() - b;
      if (ms > traagste) { traagste = ms; traagsteNaam = naam; }
    }
    check('htmlNaarTekst: elke vijandige invoer van ~200 kB binnen 1 s (vroeger tot 42 s voor «<» ×200k)', traagste < 1000, `traagste: ${traagsteNaam} ${Math.round(traagste)} ms`);
    if (tk.xmlNaarTekst) {
      const xmlVijandig = ['<'.repeat(N), '<w:tab '.repeat(N / 7), '<!--'.repeat(N / 4), '<text:line-break '.repeat(N / 17), `</w:p${' '.repeat(N)}`, `x${' '.repeat(N)}`, '\t '.repeat(N / 2)];
      let tx = 0; for (const x of xmlVijandig) { const b = performance.now(); tk.xmlNaarTekst(x, N); tx = Math.max(tx, performance.now() - b); }
      check('xmlNaarTekst (docx/odt): vijandige invoer ~200 kB binnen 1 s', tx < 1000, `traagste ${Math.round(tx)} ms`);
    } else check('xmlNaarTekst is uitgevoerd (export) voor deze controle', false);

    // ---- gelijkheid op het corpus
    const corpus = [
      '<html><head><title>Ti&amp;tel</title><style>p{}</style><script>evil()</script></head><body><p>Eerste</p><p>Tweede &eacute;</p></body></html>',
      '<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title> Рахунок\n №42 </title></head><body><h1>Рахунок</h1><table><tr><th>Позиція</th><th>Сума</th></tr><tr><td>Хостинг</td><td>12,50&nbsp;€</td></tr></table><br/><ul><li>Один</li><li>Два</li></ul><!-- verborgen --><noscript>geen js</noscript><svg viewBox="0 0 1 1"><text>logo</text></svg></body></html>',
      '<div>Beste Pavlo,<br>dank voor je bericht.<BR />Groet</div><blockquote>citaat &lt;tag&gt; &#65;&#x42;</blockquote><pre>  code  </pre><TEMPLATE><b>x</b></template>',
      '<p>open <b>vet <i>schuin</p></b><td>cel<TH>kop<thead>niet</thead><tdx>geen cel</tdx>',
      '<SCRIPT type="text/javascript">if (a < b && c > d) { x(); }</SCRIPT >na</script>',
      `tekst${C(0xa0)}${C(0xa0)}met  ${C(9)}spaties${C(12)}\n${C(11)} \nregel\r\n\r\n\r\n\r\nverder${C(0)}eind`,
      '<title>eerste</title><title>tweede</title>', '<title a="b>c">x</title>', '<titlex>niet echt</titlex>', '<!-- a --> b <!-- c', '<!-->x-->y', '<br/ >x<br/>', '</h7>x</h6>y</header>z</HEADER >',
      '', '   ', '<>', '<<>>', 'a > b < c', '&unknown; &amp &AMP; &#99999999;',
    ];
    let afwijking = '';
    for (const h of corpus) for (const max of [200_000, 40, 3]) {
      const a = oud.html(h, max), b = tk.htmlNaarTekst(h, max);
      if (a.tekst !== b.tekst || a.titel !== b.titel) { afwijking = `${JSON.stringify(h).slice(0, 80)} max=${max}: oud=${JSON.stringify(a)} nieuw=${JSON.stringify(b)}`; break; }
    }
    check('htmlNaarTekst: op het corpus (o.a. de HTML uit zoek-tekst-20261022) gelijk aan de oude regex-pijplijn', !afwijking, afwijking.slice(0, 400));

    // ---- gelijkheid op willekeurige stukken HTML/XML (deterministisch: vaste zaadwaarde)
    let zaad = 20261112;
    const rnd = (n: number) => { zaad = (zaad * 1103515245 + 12345) & 0x7fffffff; return zaad % n; };
    const TOK = ['<', '>', '/', '<!--', '-->', '<!-->', '<script>', '</script>', '<SCRIPT type="x">', '</script >', `</script${C(9)}>`, '</scriptx>', '<scripts>', '<style>', '</STYLE>', '<svg', '<svg/>', '</svg>', '<head>', `</head${C(12)}>`,
      '<noscript>', '</noscript>', '<template>', '</template>', '<title>', '</title>', '<TITLE x>', '</TiTlE>', '<br>', '<br/>', '<BR />', '<br  /', '<br/ >', '<p>', '</p>', '</P >', '</pre>', '</div>', '</h1>', '</h7>', '</header>',
      '</li>', '</tr>', '</table>', '<td>', '<th class=a>', '<thead>', '<tdx>', '<td', '<a href="x">', '<>', '&amp;', '&lt;', '&gt;', '&nbsp;', '&#65;', '&#x42;', '&eacute;', '&', ' ', '  ', C(9), '\n', '\r\n', '\r', C(12), C(11), C(0xa0),
      C(0x2028), C(0), C(0x3000), 'x', 'tekst', 'Привіт', 'ß', C(0x130), C(0x17f) + 'cript', '<' + C(0x17f) + 'cript>', C(0x212a), '"', "'", '=',
      '<w:tab/>', '<w:tab x="1"/>', '<w:tabx/>', '<w:tab>', '<text:tab/>', '<w:br/>', '<w:br>', '<a:br />', '<text:line-break/>', '</w:p>', '</text:p>', '</text:h>', '</a:p>', '</table:table-row>', '</row>', '</w:tc>',
      '</table:table-cell>', '</c>', '</c >', '</cx>', '&quot;', '&apos;', '&#128512;', '&#x1F600;', '&#99999999;', '&#x;'];
    let fuzzAfwijking = '', xmlAfwijking = '', n = 0;
    for (let i = 0; i < 20_000; i++) {
      let s = ''; const lengte = rnd(40);
      for (let k = 0; k < lengte; k++) s += TOK[rnd(TOK.length)];
      const max = [200_000, 60, 7][rnd(3)];
      const a = oud.html(s, max), b = tk.htmlNaarTekst(s, max); n++;
      if (!fuzzAfwijking && (a.tekst !== b.tekst || a.titel !== b.titel)) fuzzAfwijking = `${JSON.stringify(s)} max=${max}: oud=${JSON.stringify(a)} nieuw=${JSON.stringify(b)}`;
      if (tk.xmlNaarTekst && !xmlAfwijking) { const ax = oud.xml(s, max), bx = tk.xmlNaarTekst(s, max); if (ax !== bx) xmlAfwijking = `${JSON.stringify(s)} max=${max}: oud=${JSON.stringify(ax)} nieuw=${JSON.stringify(bx)}`; }
    }
    check(`htmlNaarTekst: ${n} willekeurige stukken HTML — tekst én titel gelijk aan de oude pijplijn`, !fuzzAfwijking, fuzzAfwijking.slice(0, 500));
    check('xmlNaarTekst: dezelfde willekeurige stukken — gelijk aan de oude pijplijn', !!tk.xmlNaarTekst && !xmlAfwijking, xmlAfwijking.slice(0, 500));
    // Grote, gewone HTML (een nieuwsbrief van ~1 MB): gelijk én snel.
    const brief = Array.from({ length: 2500 }, (_, i) => `<tr><td class="c">Regel ${i} &amp; meer</td><td><a href="https://x.example/${i}">link</a><br/></td></tr><!-- r${i} --><p>Alinea ${i} met <b>vet</b> en&nbsp;tekst.</p>`).join('\n');
    const html1 = `<html><head><title>Nieuwsbrief</title><style>${'td{color:red}'.repeat(200)}</style></head><body><table>${brief}</table><script>${'var a=1;'.repeat(500)}</script></body></html>`;
    const b0 = performance.now(); const nieuwGroot = tk.htmlNaarTekst(html1); const msGroot = performance.now() - b0;
    const oudGroot = oud.html(html1, 200_000);
    check('htmlNaarTekst: gewone HTML van ~0,4 MB — gelijk aan de oude en binnen 1 s', nieuwGroot.tekst === oudGroot.tekst && nieuwGroot.titel === oudGroot.titel && msGroot < 1000, `${Math.round(msGroot)} ms, lengte ${html1.length}`);
    // De dode kwadratische functie in shared/ai-vertaling.ts wordt door tests geïmporteerd (zie verslag): hier niet aangeraakt.
  }

  // ================================================================ 3. vNext leest niets zonder grens (verouderde sizeBytes)
  if (process.env.DATABASE_URL || process.env.DATABASE_URL_SYSTEM) {
    const uploads = mkdtempSync(join(tmpdir(), 'sec002-t-wolk-'));
    process.env.UPLOADS_DIR = uploads;
    const { getPool } = await import('../../server/platform/pg');
    const { cloudVnextBestandenRoutes, leesLadeBestandVoorDelen } = await import('../../backend/cloud-vnext-bestanden');
    const { cloudVnextTakenRoutes, cloudVnextTakenProef } = await import('../../backend/cloud-vnext-taken');
    const { metLade } = await import('../../backend/ruimte-cloud-agenda');
    const { CLOUD_VNEXT_LIMIETEN: LIMIET } = await import('../../shared/cloud-vnext-model');
    const pool = getPool('systeem');
    const a = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', a, { email: `slot-t-${randomBytes(4).toString('hex')}@eenheid.test`, role: 'member', status: 'approved' }]);
    const prive = { userId: a, ruimte: 'prive' as const };
    const rA = cloudVnextBestandenRoutes(async () => ({ user: { id: a, role: 'member', status: 'approved' }, service: 'cloud' }));
    const tA = cloudVnextTakenRoutes(async () => ({ user: { id: a, role: 'member', status: 'approved' }, service: 'cloud' }));
    const roep = async (routes: Record<string, unknown[]>, pad: string, body: Record<string, unknown>) => {
      const res = await metLade(prive, 'cloud', async () => (routes[`POST /api/owner/cloud/vnext/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} }));
      return { status: res.statusCode, uit: JSON.parse(res.body) as Record<string, any> };
    };
    const klein = async (naam: string) => {
      const inhoud = randomBytes(2000);
      const bgn = await roep(rA, 'upload', { actie: 'begin', naam, mime: 'application/octet-stream', bytes: inhoud.length });
      await roep(rA, 'upload', { actie: 'stuk', id: bgn.uit.id, offset: 0, data: inhoud.toString('base64') });
      const k = await roep(rA, 'upload', { actie: 'klaar', id: bgn.uit.id, sha256: sha(inhoud) });
      const id = String(k.uit.bestand?.id || '');
      const pad = String((await pool.query(`SELECT data->>'storagePath' AS p FROM app.records WHERE tbl='cloud_items_v1' AND id=$1`, [id])).rows[0]?.p || '');
      return { id, schijf: join(uploads, pad) };
    };
    const echteFetch = globalThis.fetch;
    cloudVnextTakenProef.zetKlok(false);
    try {
      // download in één stuk: record zegt 2000 bytes, op schijf staat (verouderd record) 33 MiB
      const f1 = await klein('groeit.bin');
      check('(voorwaarde) download van het kleine bestand werkt', (await roep(rA, 'download', { id: f1.id })).status === 200);
      truncateSync(f1.schijf, LIMIET.downloadMaxBytes + 1024 * 1024);
      const d1 = await roep(rA, 'download', { id: f1.id });
      check('vNext download: verouderde sizeBytes, groot bestand op schijf → 400 TE_GROOT, niets in het geheugen gelezen (vroeger tot 384 MB)',
        d1.status === 400 && d1.uit.error === 'TE_GROOT' && !d1.uit.data, `status=${d1.status} error=${d1.uit.error} dataLengte=${String(d1.uit.data || '').length}`);
      check('vNext download in delen (offset) blijft werken voor hetzelfde bestand', (await roep(rA, 'download', { id: f1.id, offset: 0, lengte: 1024 })).status === 200);
      let delen = ''; try { const r = await leesLadeBestandVoorDelen(prive, f1.id); delen = r ? `data ${r.data.length}` : 'null'; } catch (e) { delen = (e as Error).message; }
      check('vNext poort voor delen (leesLadeBestandVoorDelen): hetzelfde bestand → TE_GROOT, niet ingelezen', delen === 'TE_GROOT', delen);

      // archief: record klein, op schijf groter dan ARCHIEF_INVOER_MAX (64 MiB)
      const f2 = await klein('archief.zip');
      truncateSync(f2.schijf, 64 * 1024 * 1024 + 1);
      const a2 = await roep(rA, 'archief', { id: f2.id, actie: 'inhoud' });
      check('vNext archief: verouderde sizeBytes, > 64 MiB op schijf → 400 ARCHIEF_TE_GROOT (vroeger eerst 64 MiB ingelezen, pas daarna geweigerd)', a2.status === 400 && a2.uit.error === 'ARCHIEF_TE_GROOT', `status=${a2.status} ${JSON.stringify(a2.uit).slice(0, 120)}`);

      // overdracht eigen → Google Drive: record klein (taak aangenomen), op schijf groter dan de uploadgrens (5 MB)
      const uploadsNaarDrive: string[] = [];
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        const url = String((input as { url?: string })?.url || input);
        if (!url.startsWith('https://www.googleapis.com/')) return echteFetch(input as never, init);
        if (url.includes('/upload/drive/v3/files')) { uploadsNaarDrive.push(url); return new Response(JSON.stringify({ id: 'nieuw', size: '1' }), { status: 200 }); }
        return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
      }) as typeof fetch;
      cloudVnextTakenProef.zetDriveToegang(async (userId, accountId) => (userId === a && accountId === 'acc-1' ? { token: 'proef-token', accountId: 'acc-1', email: 'proef@gmail.test' } : null));
      const f3 = await klein('naar-drive.bin');
      const t3 = await roep(tA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'eigen', id: f3.id }, doel: { dienst: 'google-drive', account: 'acc-1' } });
      check('(voorwaarde) overdrachtstaak aangenomen op basis van het kleine record', t3.status === 200 && t3.uit.taak?.stand === 'wacht', JSON.stringify(t3.uit).slice(0, 160));
      truncateSync(f3.schijf, 6 * 1024 * 1024);
      await cloudVnextTakenProef.tikProef();
      const na3 = ((await roep(tA, 'taken', { actie: 'lijst' })).uit.taken as Array<Record<string, any>>).find((x) => x.id === t3.uit.taak?.id);
      check('vNext overdracht naar Drive: groter op schijf dan de grens → taak «fout» DOEL_LIMIET met uitleg uk/nl, NIETS naar Google gestuurd',
        na3?.stand === 'fout' && na3?.fout?.code === 'DOEL_LIMIET' && Array.isArray(na3?.fout?.uitleg) && uploadsNaarDrive.length === 0, `stand=${na3?.stand} fout=${JSON.stringify(na3?.fout ?? null).slice(0, 160)} uploads=${uploadsNaarDrive.length}`);

      // bron: elke storage.read in cloud-vnext*.ts geeft een maxBytes mee
      const zonder: string[] = [];
      for (const f of ['backend/cloud-vnext-bestanden.ts', 'backend/cloud-vnext-taken.ts', 'backend/cloud-vnext-integraties.ts']) {
        readFileSync(join(W, f), 'utf8').split('\n').forEach((r, i) => { if (/storage\.read\(/.test(r) && !/maxBytes/.test(r)) zonder.push(`${f}:${i + 1}`); });
      }
      check('vNext bron: elke storage.read in cloud-vnext*.ts geeft maxBytes mee', zonder.length === 0, zonder.join(', '));
    } finally {
      globalThis.fetch = echteFetch;
      cloudVnextTakenProef.zetKlok(false);
      await pool.query(`DELETE FROM app.records WHERE tbl IN ('cloud_items_v1','cloud_taken_v1') AND data->>'ownerUserId' = $1`, [a]).catch(() => undefined);
      rmSync(uploads, { recursive: true, force: true });
    }
  } else console.log('OVERGESLAGEN: vNext-grenzen (geen database)');

  return einde();
}
