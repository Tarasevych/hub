// Afdrukproef (INTEG-001 / TEMA print): drukt proefpagina's met een ECHTE Chrome af (Page.printToPDF = de afdrukweergave van Ctrl+P)
// en leest de tekst uit de PDF terug. Zo wordt gemeten of de HELE pagina op papier komt en of de schil (zijbalk, balken, knoppen) wegvalt.
// De proefpagina's gebruiken de echte klassen en de echt gebouwde CSS van de app (dist/assets/index-*.css) + src/afdruk.css + src/platform/afdruk.ts.
//
// Gebruik:   npx vite build            (of een build naar een andere map: --dist <map>)
//            node scripts/afdruk-proef.mjs [--dist dist] [--chrome <pad>] [--foto <map>] [--alleen <proefpagina>]
// Zonder Chrome of zonder gebouwde CSS meldt het script OVERGESLAAN (exit 0); een echte fout geeft exit 1. Alles lokaal (127.0.0.1);
// het Chrome-profiel staat in de tijdelijke map van het proces (TEMP/TMP) en wordt na afloop door dit script zelf weer gewist.
// Geen onderdeel van scripts/eenheidstests.mjs (die draait zonder browser); de statische kant staat in tests/eenheid/afdruk-20261103.test.ts.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const arg = (naam) => { const i = process.argv.indexOf(naam); return i > 0 ? process.argv[i + 1] : undefined; };
const DIST = resolve(arg('--dist') || 'dist');
const ALLEEN = arg('--alleen'); // bv. --alleen schil-tech: één proefpagina (zonder de dynamische controles)
const FOTO = arg('--foto') ? resolve(arg('--foto')) : '';
const CHROME = arg('--chrome') || process.env.CHROME || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => existsSync(p));
const overgeslagen = (r) => { console.log(`OVERGESLAAN afdrukproef: ${r}`); process.exit(0); };
const assets = join(DIST, 'assets');
if (!CHROME) overgeslagen('geen Chrome gevonden (zet CHROME=<pad> of --chrome)');
if (!existsSync(assets)) overgeslagen(`geen gebouwde CSS in ${DIST} (eerst: npx vite build)`);
const cssBestanden = readdirSync(assets).filter((f) => f.endsWith('.css'));
const hoofdNaam = cssBestanden.find((f) => /^index-.*\.css$/.test(f));
if (!hoofdNaam) overgeslagen(`geen index-*.css in ${assets}`);

// ── CSS-bronnen ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const volledig = readFileSync(join(assets, hoofdNaam), 'utf8');
// De CSS van de herstelcodes (src/toegangslaag.css) zit in een eigen chunk; afdruk.css noemt herstel-afdruk ook, dus zoeken op een regel die alleen daar staat.
const herstelNaam = cssBestanden.find((f) => readFileSync(join(assets, f), 'utf8').includes('.herstel-klaar'));
const herstelCss = herstelNaam ? readFileSync(join(assets, herstelNaam), 'utf8') : '';
const afdrukCss = readFileSync('src/afdruk.css', 'utf8');
const bootStijl = readFileSync('index.html', 'utf8').match(/<style id="canonical-single-boot">([\s\S]*?)<\/style>/)[1];
// «Zonder afdrukstijl» = hoe productie vóór dit werk afdrukte: het afdrukblok (@page + @media print) uit de gebouwde CSS knippen.
const MARKER = '@page{margin:14mm 12mm 16mm}';
const begin = volledig.indexOf(MARKER);
let zonder = volledig;
if (begin >= 0) {
  const start = volledig.indexOf('@media print{', begin);
  let diepte = 0, j = start;
  for (; j < volledig.length; j++) { const c = volledig[j]; if (c === '{') diepte++; else if (c === '}' && --diepte === 0) { j++; break; } }
  zonder = volledig.slice(0, begin) + volledig.slice(j);
}
const afdrukJs = (await build({
  stdin: { contents: "import { installeerAfdruk } from './src/platform/afdruk'; window.__afdruk = installeerAfdruk();", resolveDir: process.cwd(), sourcefile: 'ingang.ts', loader: 'ts' },
  bundle: true, write: false, format: 'iife', target: 'chrome120', logLevel: 'error',
})).outputFiles[0].text;

// ── Proefpagina's ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const N = (i, n = 4) => String(i).padStart(n, '0');
const rij = (i) => `<li class="ag-rij"><div class="ag-rij-kop"><button type="button" class="ag-rij-toggle" aria-expanded="false"><span class="ag-rij-tekst"><span class="ag-rij-titel"><b>RIJ-${N(i)}</b><span class="ag-badge ag-ok">actief</span></span><small class="ag-rij-status">status van agent ${i}</small></span></button><div class="ag-rij-acties"><button type="button" class="ag-knop">Видалити</button></div></div></li>`;
const sectie = (naam, aantal, start) => `<section class="ag-sectie" data-ag-sectie="${naam}" data-ag-lui="open"><h2 class="ag-sectie-kop">SECTIE-${naam.toUpperCase()}</h2><ul class="ag-lijst">${Array.from({ length: aantal }, (_, k) => rij(start + k)).join('')}</ul></section>`;
/** De schil zoals CanoniekOmlijsting hem rendert, met een lange /agenten-achtige pagina (rijen = één knop met titel + status) in de werkruimte. */
const schil = ({ thema = 'light', mobiel = false, lui = false } = {}) => `<div id="root"><main class="canonical-chrome schil-achtergrond ecosystem-v04 theme-${thema} ${mobiel ? 'sidebar-drawer-mode' : 'sidebar-pinned sidebar-expanded'}" data-active-service="hub">
  <aside class="canonical-sidebar"><nav class="canonical-service-list"><a href="#" class="canonical-service-button">ZIJBALK-MARKER</a></nav></aside>
  <div class="canonical-connection-banner" role="status">VERBINDING-MARKER</div>
  <header class="canonical-topbar"><div class="canonical-account-anchor"><button type="button">TOPBALK-KNOP-MARKER</button></div></header>
  <section class="canonical-workspace"><div class="canonical-content"><div class="ag">
    <header class="ag-kop"><h1>KOP-AGENTEN-MARKER</h1></header>
    <div class="ag-tabs-wrap"><nav class="ag-tabs"><button type="button" role="tab" aria-selected="true" class="ag-tab-knop">TAB-KNOP-MARKER</button></nav></div>
    <div class="ag-secties">${sectie('overzicht', 40, 1)}${sectie('apparaten', 40, 1000)}${sectie('journaal', 40, 2000)}${lui ? '<section class="ag-sectie" data-ag-lui="dicht"><h2 class="ag-sectie-kop">SECTIE-LAAT</h2><div class="ag-lui-plaats" aria-hidden="true"></div></section>' : ''}</div>
    <section class="ag-sectie"><h2 class="ag-sectie-kop">EINDE-MARKER</h2><pre class="ag-ruw">${Array.from({ length: 60 }, (_, i) => `ruw-regel-${N(i, 3)}`).join('\n')}</pre></section>
  </div></div></section>
  <div class="plaats-actiestapel"><button type="button" class="canonical-scroll-top">OMHOOG-MARKER</button></div></main></div>`;
const regels = (voor, n) => Array.from({ length: n }, (_, i) => `<li>${voor}-${N(i, 3)}</li>`).join('');
/** Zonder app-CSS: alle gebruikelijke manieren waarop inhoud wordt afgekapt, met inline stijlen (geen klassen om op te mikken). */
const algemeen = () => `<div id="root"><div style="position:fixed;inset:0;display:flex;flex-direction:column;height:100dvh;overflow:hidden;background:#fff">
  <header style="position:fixed;top:0;left:0;right:0;height:48px;background:#eee;z-index:5">VASTE-BALK-MARKER <button>KNOP-A</button></header>
  <div style="flex:1 1 auto;min-height:0;overflow:auto;padding-top:60px"><h1>ALGEMEEN-KOP-MARKER</h1><ul>${regels('HOOFD', 160)}</ul>
    <div style="height:200px;overflow:auto"><ul>${regels('VAKJE', 60)}</ul></div>
    <div style="height:120px;overflow:hidden">${'ABCDEFGH'.split('').map((c) => `<p>AFGEKAPT-${c}</p>`).join('')}</div>
    <div style="position:sticky;top:0;background:#ddd">STICKY-MARKER</div><pre style="max-height:100px;overflow:auto">${Array.from({ length: 40 }, (_, i) => `pre-regel-${N(i, 3)}`).join('\n')}</pre>
    <table><tbody>${Array.from({ length: 120 }, (_, i) => `<tr><td>TAB-${N(i, 3)}</td></tr>`).join('')}</tbody></table><p>EINDE-MARKER</p></div>
  <div style="position:fixed;right:16px;bottom:16px;width:44px;height:44px">OMHOOG-MARKER</div>
  <div role="dialog" aria-modal="true" style="position:fixed;inset:20% 30%;background:#fff">DIALOOG-MARKER</div></div></div>`;
/** Herstelcodes afdrukken (HerstelcodesSectie zet body.herstel-afdruk): alleen dat blok, op precies één pagina. */
const herstel = () => `<div id="root"><main class="canonical-chrome schil-achtergrond theme-light"><aside class="canonical-sidebar"><nav>ZIJBALK-MARKER</nav></aside><section class="canonical-workspace"><div class="canonical-content">
  <div style="height:900px">ANDERE-INHOUD-MARKER</div><div style="height:900px">NOG-MEER-ANDERE-INHOUD</div>
  <div class="herstel-nieuw"><h3>HERSTEL-KOP-MARKER</h3><ul class="herstel-lijst">${Array.from({ length: 10 }, (_, i) => `<li><span class="herstel-code">CODE-${N(i, 2)}-ABCD</span></li>`).join('')}</ul><div class="herstel-knoppen"><button>AFDRUKKEN-KNOP</button></div></div></div></section></main></div>`;
// Dynamische pagina's (scrollstand terugzetten, Ctrl+P met lui geladen secties, vaste kop met h1).
const dyn = {
  stand: `<div id="root"><div class="scroll-gebied" style="height:100%;overflow:auto"><div style="height:3000px"><p>BEGIN</p><p style="margin-top:2800px">EINDE-STAND</p></div></div></div>`,
  lui: `<div id="root"><div id="sc" style="height:100%;overflow:auto">${Array.from({ length: 8 }, (_, i) => `<section data-afdruk-lui="dicht" data-n="${i}" style="min-height:500px"><h2>SEC-${i}</h2><div class="plaats" style="height:400px"></div></section>`).join('')}</div></div>
  <script>window.__print = 0; window.print = () => { window.__print++; window.__open = document.querySelectorAll("[data-afdruk-lui=open]").length; };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && e.target.dataset.afdrukLui === 'dicht') setTimeout(() => { e.target.dataset.afdrukLui = 'open'; e.target.querySelector('.plaats').outerHTML = '<p>INHOUD-' + e.target.dataset.n + '</p>'; }, 30); }));
  document.querySelectorAll('section').forEach((s) => io.observe(s)); document.getElementById('sc').scrollTop = 120;</script>`,
  kop: `<div id="root"><header style="position:fixed;top:0;left:0;right:0;height:50px;background:#eee"><h1>PAGINAKOP-VAST</h1></header><div style="padding-top:60px">${Array.from({ length: 150 }, (_, i) => `<p>REGEL-${i}</p>`).join('')}<div style="position:sticky;top:0;background:#ddd">STICKY-TEKST</div></div></div>`,
};
const reeks = (voor, a, b, w = 4) => Array.from({ length: b - a + 1 }, (_, i) => `${voor}${String(a + i).padStart(w, '0')}`);
const schilEis = { aanwezig: [...reeks('RIJ-', 1, 40), ...reeks('RIJ-', 1000, 1039), ...reeks('RIJ-', 2000, 2039), 'EINDE-MARKER', 'ruw-regel-059', 'KOP-AGENTEN-MARKER', 'SECTIE-OVERZICHT', 'SECTIE-JOURNAAL'], afwezig: ['ZIJBALK-MARKER', 'TOPBALK-KNOP-MARKER', 'VERBINDING-MARKER', 'OMHOOG-MARKER', 'Видалити', 'TAB-KNOP-MARKER'], minPaginas: 5 };
const proeven = {
  'schil-agenten': { html: () => schil(), eis: schilEis },
  'schil-donker': { html: () => schil({ thema: 'dark' }), eis: schilEis, thema: 'theme-dark' },
  'schil-mobiel': { html: () => schil({ mobiel: true }), eis: schilEis, venster: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } },
  'schil-tech': { html: () => schil() + '<div id="tech-laag"><div class="tech-band" style="position:fixed;top:0;left:0;right:0;height:40px;z-index:99">TECHBAND-MARKER</div></div>', htmlAttr: 'data-tech="aan" data-ruimte="technisch"', eis: { ...schilEis, afwezig: [...schilEis.afwezig, 'TECHBAND-MARKER'] } },
  'schil-lui': { html: () => schil({ lui: true }), eis: { aanwezig: ['RIJ-0001', 'EINDE-MARKER'], afwezig: ['ZIJBALK-MARKER'], minPaginas: 3 } },
  algemeen: { html: algemeen, app: false, eis: { aanwezig: [...reeks('HOOFD-', 0, 159, 3), ...reeks('VAKJE-', 0, 59, 3), ...'ABCDEFGH'.split('').map((c) => `AFGEKAPT-${c}`), ...reeks('TAB-', 0, 119, 3), ...reeks('pre-regel-', 0, 39, 3), 'EINDE-MARKER', 'STICKY-MARKER', 'ALGEMEEN-KOP-MARKER'], afwezig: ['DIALOOG-MARKER', 'OMHOOG-MARKER', 'VASTE-BALK-MARKER'], minPaginas: 5 }, alleenMetJs: true },
  herstel: { html: herstel, herstel: true, eis: { aanwezig: [...reeks('CODE-', 0, 9, 2).map((c) => `${c}-ABCD`), 'HERSTEL-KOP-MARKER'], afwezig: ['ANDERE-INHOUD-MARKER', 'ZIJBALK-MARKER', 'AFDRUKKEN-KNOP'], paginas: 1 } },
};
const AUDIT = `(() => { const sel = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''); const slecht = []; for (const el of document.body.querySelectorAll('*')) { if (!el.getClientRects().length) continue; const cs = getComputedStyle(el); if (cs.position === 'fixed' && !el.classList.contains('herstel-nieuw')) slecht.push('vast:' + sel(el)); if (['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 2 && el.tagName !== 'TEXTAREA') slecht.push('afgekapt:' + sel(el)); } return slecht; })()`;

function pagina(naam, variant) {
  const p = proeven[naam];
  const app = p.app !== false;
  const css = variant === 'zonder' ? '' : afdrukCss;
  const stijl = app ? `<style>${bootStijl}</style><style>${variant === 'zonder' ? zonder : volledig.replace(/@page\{margin:14mm 12mm 16mm\}[\s\S]*$/, '')}</style>${p.herstel ? `<style>${herstelCss}</style>` : ''}` : '<style>html,body,#root{width:100%;height:100%;min-height:100%;overflow:hidden}body{margin:0}</style>';
  // De gebouwde CSS wordt zonder afdrukblok geladen (zonder); src/afdruk.css komt er expliciet achter, zodat altijd de bron getoetst wordt (en niet een oudere build).
  return `<!doctype html><html lang="uk" class="${p.thema || 'theme-light'}" ${p.htmlAttr || ''}><head><meta charset="utf-8"><title>proef</title>${stijl}<style>${css}</style></head><body class="${p.herstel ? 'herstel-afdruk' : ''}">${p.html()}${variant === 'js' ? `<script>${afdrukJs}</script>` : ''}</body></html>`;
}

// ── Minimale Chrome-bediening (CDP over de ingebouwde WebSocket van Node) ─────────────────────────────────────────────────────────
const profiel = mkdtempSync(join(tmpdir(), 'afdruk-proef-'));
const POORT = 9400 + Math.floor(Math.random() * 400);
const kind = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${POORT}`, `--user-data-dir=${profiel}`, '--no-first-run', '--no-default-browser-check', '--disable-crash-reporter', '--disable-breakpad', '--disable-gpu', '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const server = http.createServer((q, s) => {
  const [, soort, naam, variant] = new URL(q.url, 'http://x').pathname.split('/');
  s.setHeader('content-type', 'text/html; charset=utf-8');
  if (soort === 'p' && proeven[naam]) return s.end(pagina(naam, variant));
  if (soort === 'd' && dyn[naam]) return s.end(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>html,body,#root{width:100%;height:100%;overflow:hidden}body{margin:0}</style><style>${afdrukCss}</style></head><body>${dyn[naam]}<script>${afdrukJs}</script></body></html>`);
  s.statusCode = 404; s.end('nee');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// Chrome netjes sluiten (Browser.close sluit ook alle hulpprocessen), pas daarna het eigen profiel wissen; lukt dat niet, dan alleen een melding.
const opruimen = async (sock, stuurFn) => {
  const klaar = new Promise((r) => kind.once('exit', r));
  try { await Promise.race([stuurFn?.('Browser.close'), new Promise((r) => setTimeout(r, 3000))]); } catch { /* al weg */ }
  try { sock?.close(); } catch { /* weg */ }
  await Promise.race([klaar, new Promise((r) => setTimeout(r, 5000))]); kind.kill(); server.close();
  try { rmSync(profiel, { recursive: true, force: true, maxRetries: 12, retryDelay: 400 }); } catch (e) { console.log(`let op: tijdelijk profiel niet gewist (${profiel}): ${e.code || e.message}`); }
};
let wsUrl = '';
for (let i = 0; i < 80 && !wsUrl; i++) { await new Promise((r) => setTimeout(r, 250)); try { wsUrl = (await (await fetch(`http://127.0.0.1:${POORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* nog niet klaar */ } }
if (!wsUrl) { await opruimen(null, null); console.error('FOUT Chrome startte niet'); process.exit(1); }
const sock = new WebSocket(wsUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let nr = 0; const wacht = new Map(); const luisteraars = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wacht.has(d.id)) { const w = wacht.get(d.id); wacht.delete(d.id); d.error ? w.rej(new Error(d.error.message)) : w.res(d.result); } else luisteraars.forEach((f) => f(d)); };
const stuur = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++nr; wacht.set(id, { res, rej }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await stuur('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await stuur('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => stuur(m, p, sessionId);
await s('Page.enable'); await s('Runtime.enable');
const venster = (v) => s('Emulation.setDeviceMetricsOverride', v || { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const open = (url) => new Promise((res) => { const f = (d) => { if (d.sessionId === sessionId && d.method === 'Page.loadEventFired') { luisteraars.splice(luisteraars.indexOf(f), 1); setTimeout(res, 150); } }; luisteraars.push(f); s('Page.navigate', { url }); });
const ev = async (expressie) => { const r = await s('Runtime.evaluate', { expression: expressie, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const pdfPaginas = async () => {
  const r = await s('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, preferCSSPageSize: false, printBackground: false });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(Buffer.from(r.data, 'base64')), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const uit = [];
  for (let n = 1; n <= doc.numPages; n++) uit.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' '));
  return uit;
};

// ── Uitvoeren ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let ok = 0, fout = 0;
const check = (naam, goed, info = '') => { goed ? ok++ : fout++; console.log(`${goed ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const beoordeel = (p, tekst, paginas) => ({
  mist: p.eis.aanwezig.filter((t) => !tekst.includes(t)),
  teveel: p.eis.afwezig.filter((t) => tekst.includes(t)),
  paginaFout: (p.eis.paginas && paginas !== p.eis.paginas) || (p.eis.minPaginas && paginas < p.eis.minPaginas),
});
try {
  if (FOTO) mkdirSync(FOTO, { recursive: true });
  for (const [naam, p] of Object.entries(proeven)) {
    if (ALLEEN && naam !== ALLEEN) continue;
    // Referentie: zonder afdrukstijl (zoals productie nu afdrukt) moet de proefpagina het probleem laten zien, anders meet de proef niets.
    if (!p.alleenMetJs && !p.herstel && begin >= 0) {
      await venster(p.venster); await open(`http://127.0.0.1:${server.address().port}/p/${naam}/zonder`);
      const t = await pdfPaginas(); const b = beoordeel(p, t.join(' '), t.length);
      check(`${naam}: zonder afdrukstijl gaat er inhoud verloren (de proef is gevoelig)`, b.mist.length > 0 || b.teveel.length > 0, `${t.length} pagina('s), ${b.mist.length} ontbreken`);
    }
    for (const variant of p.alleenMetJs ? ['js'] : ['css', 'js']) {
      await venster(p.venster); await open(`http://127.0.0.1:${server.address().port}/p/${naam}/${variant}`);
      if (variant === 'js') await ev("window.dispatchEvent(new Event('beforeprint')); 1");
      let audit = [];
      if (variant === 'js' && !p.herstel) { await s('Emulation.setEmulatedMedia', { media: 'print' }); audit = await ev(AUDIT); await s('Emulation.setEmulatedMedia', { media: '' }); }
      if (FOTO) { await s('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false }); await s('Emulation.setEmulatedMedia', { media: 'print' }); const h = Math.min(await ev('document.documentElement.scrollHeight'), 4000); const f = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 794, height: h, scale: 1 } }); writeFileSync(join(FOTO, `${naam}-${variant}.png`), Buffer.from(f.data, 'base64')); await s('Emulation.setEmulatedMedia', { media: '' }); await venster(p.venster); }
      const t = await pdfPaginas(); const b = beoordeel(p, t.join(' \n '), t.length);
      check(`${naam} (${variant === 'js' ? 'CSS + afdruk.ts' : 'alleen CSS'}): alles aanwezig, schil weg`, !b.mist.length && !b.teveel.length && !b.paginaFout, `${t.length} pagina('s)${b.mist.length ? `, ontbreekt: ${b.mist.slice(0, 3).join(', ')}…` : ''}${b.teveel.length ? `, ten onrechte: ${b.teveel.join(', ')}` : ''}`);
      if (variant === 'js' && !p.herstel) check(`${naam}: in de afdrukweergave geen vaste lagen en geen afgekapte vakken meer`, audit.length === 0, audit.slice(0, 4).join(', '));
      if (variant === 'js') await ev("window.dispatchEvent(new Event('afterprint')); 1");
    }
  }
  // Dynamisch
  if (!ALLEEN) {
  const dUrl = (n) => `http://127.0.0.1:${server.address().port}/d/${n}`;
  await venster(); await open(dUrl('stand'));
  await ev("document.querySelector('.scroll-gebied').scrollTop = 700; 1");
  await ev("window.dispatchEvent(new Event('beforeprint')); 1");
  const tijdens = await ev("document.querySelector('.scroll-gebied').getAttribute('data-afdruk-auto')");
  await ev("window.dispatchEvent(new Event('afterprint')); 1");
  const na = await ev("document.querySelector('.scroll-gebied').scrollTop"), over = await ev("document.querySelectorAll('[data-afdruk-auto]').length");
  check('scrollvenster wordt tijdens het afdrukken ontgrendeld', /ontgrendel/.test(tijdens || ''), String(tijdens));
  check('scrollstand komt terug na afdrukken, geen markering blijft hangen', na === 700 && over === 0, `stand ${na}, markeringen ${over}`);
  await open(dUrl('lui'));
  const stand0 = await ev("document.getElementById('sc').scrollTop");
  const toets = { modifiers: 2, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 };
  await s('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...toets }); await s('Input.dispatchKeyEvent', { type: 'keyUp', ...toets });
  await new Promise((r) => setTimeout(r, 3500));
  const r = JSON.parse(await ev("JSON.stringify({ print: window.__print, open: window.__open, rest: document.querySelectorAll('[data-afdruk-lui=dicht]').length, top: document.getElementById('sc').scrollTop })"));
  check('Ctrl+P: lui geladen secties worden eerst opgebouwd, daarna precies één keer afgedrukt', r.print === 1 && r.open === 8 && r.rest === 0, JSON.stringify(r));
  check('Ctrl+P: scrollstand teruggezet', r.top === stand0, `${stand0} → ${r.top}`);
  await open(dUrl('kop'));
  await ev("window.dispatchEvent(new Event('beforeprint')); 1");
  const k = await pdfPaginas(); const alles = k.join(' ');
  check('vaste kop met h1 komt precies één keer op papier, niet op elke pagina', (alles.match(/PAGINAKOP-VAST/g) || []).length === 1 && k.length > 1, `${k.length} pagina's`);
  check('sticky element blijft zichtbaar; alle 150 regels aanwezig', alles.includes('STICKY-TEKST') && Array.from({ length: 150 }, (_, i) => `REGEL-${i}`).every((x) => alles.includes(x)));
  }
} catch (e) {
  fout++; console.log(`FOUT afdrukproef: ${e.message}`);
} finally {
  await opruimen(sock, stuur);
}
console.log(`\n${ok}/${ok + fout} geslaagd (afdrukproef, Chrome ${CHROME})`);
process.exit(fout ? 1 : 0);
