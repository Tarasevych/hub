// Extensie 0.5: valideerOpdracht (extension/shared.js) — schema per opdrachttype, onbekende sleutels weigeren, geen control-tekens,
// adressen alleen op de eigen site, toetsen uit de witte lijst, begrensde getallen. Plus een scan van extension/*.js op
// dynamische code (eval, new Function, setTimeout met tekst, innerHTML met variabelen).
// Geldige oproepen zijn afgeleid van backend/connectors-hulpmiddelen.ts (BROWSER_TOOLS + DEVTOOLS_ALIASES): die mogen nooit breken.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { resolveAlias } from '../../backend/connectors-hulpmiddelen';
// @ts-expect-error gewone JavaScript-module zonder typen (wordt door de extensie zelf geladen)
import { ALLOWED_COMMANDS, ALLOWED_KEYS, hostToegestaan, valideerOpdracht } from '../../extension/shared.js';

type Geval = [string, unknown, string?]; // [type, params, verwachte code bij fout]

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-validatie');
  const W = process.cwd();
  const v = (type: string, params: unknown) => valideerOpdracht(type, params) as { ok: boolean; params?: any; code?: string; detail?: string };

  // ---------------------------------------------------------------- geldige oproepen (zoals de server ze stuurt)
  const goed: Geval[] = [
    ['browser.snapshot', {}], ['browser.diagnostics', {}], ['browser.tabs', {}], ['browser.self_test', {}], ['browser.screenshot', {}],
    ['browser.snapshot', undefined], ['browser.snapshot', null],
    ['browser.scroll', { direction: 'down' }], ['browser.scroll', { direction: 'up', pages: 0.5 }], ['browser.scroll', { direction: 'top' }], ['browser.scroll', { direction: 'bottom', pages: 10 }],
    ['browser.wait', { text: 'Opgeslagen' }], ['browser.wait', { text: 'Збережено', timeout_seconds: 15 }], ['browser.wait', { text: 'x', timeout_seconds: 1 }],
    ['browser.navigate', { url: 'https://mail.tarasevych.com/' }], ['browser.navigate', { url: 'https://mcp.tarasevych.com/agents#extension' }], ['browser.navigate', { url: 'https://tarasevych.com/x?q=1' }],
    ['browser.history', { action: 'back' }], ['browser.history', { action: 'forward' }], ['browser.history', { action: 'reload' }],
    ['browser.pages', { action: 'select', pageId: 12 }], ['browser.pages', { action: 'close', pageId: 0 }], ['browser.pages', { action: 'new', url: 'https://admin.tarasevych.com/' }],
    ['browser.invoke', { action: 'open_service' }], ['browser.invoke', { action: 'open_service', args: { service: 'mail', tab: 'inbox' } }],
    ['browser.invoke', { action: 'get_diagnostics', args: {} }], ['browser.invoke', { action: 'x1', args: { lijst: [1, 'a', true, null, { diep: { nog: 1 } }] } }],
    ['browser.click', { name: 'Opslaan' }], ['browser.click', { name: 'Зберегти 💾' }], ['browser.hover', { name: 'Меню' }],
    ['browser.type', { name: 'Zoeken', text: 'hallo' }], ['browser.type', { name: 'Zoeken', text: '' }], ['browser.type', { name: 'Notitie', text: 'regel 1\nregel 2\tmet tab' }],
    ['browser.type', { name: 'Notitie', text: 'Windows\r\nregels' }], ['browser.type', { name: 'Lang', text: 'a'.repeat(2000) }],
    ['browser.select', { name: 'Taal', option: 'Українська' }],
    ...ALLOWED_KEYS.map((k: string) => ['browser.key', { key: k }] as Geval),
    ['browser.fill_form', { elements: [{ name: 'Naam', value: 'Pavlo' }, { name: 'Opmerking', value: 'twee\nregels' }] }],
    ['browser.fill_form', { elements: Array.from({ length: 20 }, (_, i) => ({ name: `Veld ${i}`, value: String(i) })) }],
    ['browser.console', {}], ['browser.console', { types: ['error', 'warn'] }], ['browser.console', { types: [] }], ['browser.console', { types: ['error', 'warn', 'log', 'info', 'debug'] }],
    ['browser.network', {}], ['browser.network', { failed_only: true }], ['browser.network', { failed_only: false }],
    ['browser.deep_diagnostics', {}], ['browser.deep_diagnostics', { seconds: 10, reload: true }], ['browser.deep_diagnostics', { seconds: 1 }],
    ['browser.audit', {}], ['browser.audit', { soort: 'alles' }], ['browser.audit', { soort: 'prestaties' }], ['browser.audit', { soort: 'beveiliging' }], ['browser.audit', { soort: 'dom' }],
    // 0.7.0 (zone E): uid zoals chrome-devtools-mcp, pageIdx, en browser.script (evaluate_script)
    ['browser.click', { uid: '12_k3x9a' }], ['browser.hover', { uid: '0_a' }], ['browser.type', { uid: '3_b', text: 'x' }], ['browser.select', { uid: '4_c', option: 'Ja' }],
    ['browser.fill_form', { elements: [{ uid: '1_a', value: 'x' }] }], ['browser.pages', { action: 'select', pageIdx: 0 }],
    ['browser.script', { expression: 'document.title' }], ['browser.script', { expression: '(() => 1)()' }],
  ];
  const goedFout = goed.filter(([t, p]) => !v(t, p).ok);
  check(`goede invoer: alle ${goed.length} geldige oproepen worden aanvaard`, goedFout.length === 0, goedFout.map(([t, p]) => `${t} ${JSON.stringify(p)} → ${JSON.stringify(v(t, p))}`).join(' | ').slice(0, 400));
  check('elk type uit ALLOWED_COMMANDS heeft een schema en minstens één geldige oproep in de tabel',
    ALLOWED_COMMANDS.every((t: string) => goed.some(([g]) => g === t)) && ALLOWED_COMMANDS.length === 22, ALLOWED_COMMANDS.filter((t: string) => !goed.some(([g]) => g === t)).join(','));

  // Oproepen zoals de MCP-client ze doet (aliasnamen van chrome-devtools-mcp), omgezet zoals de server dat doet.
  const TOOL: Record<string, string> = { browser_list_tabs: 'browser.tabs', browser_pages: 'browser.pages', browser_open: 'browser.navigate', browser_history: 'browser.history',
    browser_snapshot: 'browser.snapshot', browser_screenshot: 'browser.screenshot', browser_click: 'browser.click', browser_hover: 'browser.hover', browser_type: 'browser.type',
    browser_fill_form: 'browser.fill_form', browser_press_key: 'browser.key', browser_wait_for_text: 'browser.wait', browser_console: 'browser.console', browser_network: 'browser.network' };
  const aliasOproepen: Array<[string, any]> = [
    ['list_pages', { browser: 'Chrome' }], ['select_page', { pageId: 3 }], ['new_page', { url: 'https://hub.tarasevych.com/' }], ['close_page', { browser: 'x', pageId: 4 }],
    ['navigate_page', { url: 'https://mail.tarasevych.com/' }], ['navigate_page', { type: 'url', url: 'https://mail.tarasevych.com/' }], ['navigate_page', { type: 'back' }], ['navigate_page', { type: 'reload' }],
    ['take_snapshot', {}], ['take_screenshot', {}], ['click', { name: 'OK' }], ['hover', { name: 'Menu' }], ['fill', { name: 'Zoeken', value: 'abc' }],
    ['fill_form', { elements: [{ name: 'a', value: 'b' }] }], ['press_key', { key: 'Enter' }], ['wait_for', { text: 'Klaar' }], ['wait_for', { text: 'Klaar', timeout_seconds: 5 }],
    ['list_console_messages', { types: ['error'] }], ['list_network_requests', { failed_only: true }],
  ];
  const aliasFout = aliasOproepen.filter(([naam, args]) => {
    const r = resolveAlias(naam, structuredClone(args));
    const { browser: _b, machine: _m, ...params } = r.args ?? {};
    return !TOOL[r.name] || !v(TOOL[r.name], params).ok;
  });
  check(`MCP-aliassen (${aliasOproepen.length} oproepen, via resolveAlias zoals de server) komen ongeschonden door de validatie`, aliasFout.length === 0, aliasFout.map(([n]) => n).join(','));

  // ---------------------------------------------------------------- slechte invoer
  const slecht: Geval[] = [
    ['browser.onbekend', {}, 'TYPE_ONBEKEND'], ['browser.evaluate', { code: '1' }, 'TYPE_ONBEKEND'], ['fs.read', { path: '/' }, 'TYPE_ONBEKEND'], ['__proto__', {}, 'TYPE_ONBEKEND'], ['constructor', {}, 'TYPE_ONBEKEND'],
    ['browser.snapshot', { extra: 1 }, 'SLEUTEL_ONBEKEND'], ['browser.snapshot', [], 'PARAMS_VORM'], ['browser.snapshot', 'tekst', 'PARAMS_VORM'], ['browser.snapshot', 5, 'PARAMS_VORM'],
    ['browser.snapshot', new Date(), 'PARAMS_VORM'],
    // adressen
    ['browser.navigate', { url: 'javascript:alert(1)' }, 'URL'], ['browser.navigate', { url: 'data:text/html,<script>alert(1)</script>' }, 'URL'],
    ['browser.navigate', { url: 'http://mail.tarasevych.com/' }, 'URL'], ['browser.navigate', { url: 'https://evil.com/' }, 'URL'], ['browser.navigate', { url: 'https://tarasevych.com.evil.com/' }, 'URL'],
    ['browser.navigate', { url: 'https://u:p@mail.tarasevych.com/' }, 'URL'], ['browser.navigate', { url: 'file:///etc/passwd' }, 'URL'], ['browser.navigate', { url: 'chrome://settings' }, 'URL'],
    ['browser.navigate', { url: 'https://mail.tarasevych.com/\n' }, 'URL'], ['browser.navigate', { url: 'https://mail.tarasevych.com/' + 'a'.repeat(600) }, 'URL'], ['browser.navigate', {}, 'VERPLICHT'],
    ['browser.navigate', { url: ['https://mail.tarasevych.com/'] }, 'URL'], ['browser.pages', { action: 'new', url: 'javascript:void(0)' }, 'URL'], ['browser.pages', { action: 'new' }, 'VERPLICHT'],
    ['browser.pages', { action: 'select' }, 'VERPLICHT'], ['browser.pages', { action: 'close', pageId: 1.5 }, 'WAARDE'], ['browser.pages', { action: 'close', pageId: -1 }, 'WAARDE'], ['browser.pages', { action: 'kill', pageId: 1 }, 'WAARDE'],
    // control-tekens en lengtes
    ['browser.click', { name: 'Opslaan\u0000' }, 'CONTROLETEKEN'], ['browser.click', { name: 'a\nb' }, 'CONTROLETEKEN'], ['browser.click', { name: 'a\u202eb' }, 'CONTROLETEKEN'],
    ['browser.click', { name: '' }, 'LENGTE'], ['browser.click', { name: '   ' }, 'LENGTE'], ['browser.click', { name: 'x'.repeat(201) }, 'LENGTE'], ['browser.click', {}, 'VERPLICHT'], ['browser.click', { name: 42 }, 'TYPE'],
    ['browser.type', { name: 'Zoeken', text: 'a\u0007b' }, 'CONTROLETEKEN'], ['browser.type', { name: 'Zoeken', text: 'a\rb' }, 'CONTROLETEKEN'], ['browser.type', { name: 'Zoeken', text: 'a\u2028b' }, 'CONTROLETEKEN'],
    ['browser.type', { name: 'Zoeken', text: 'a'.repeat(2001) }, 'LENGTE'], ['browser.type', { name: 'Zoeken' }, 'VERPLICHT'], ['browser.type', { name: 'Zoeken', text: { toString: 1 } }, 'TYPE'],
    ['browser.wait', { text: 'x'.repeat(201) }, 'LENGTE'], ['browser.wait', { text: 'x', timeout_seconds: 0 }, 'WAARDE'], ['browser.wait', { text: 'x', timeout_seconds: 16 }, 'WAARDE'], ['browser.wait', { text: 'x', timeout_seconds: '5' }, 'WAARDE'],
    ['browser.scroll', { direction: 'left' }, 'WAARDE'], ['browser.scroll', { direction: 'down', pages: 11 }, 'WAARDE'], ['browser.scroll', { direction: 'down', pages: Infinity }, 'WAARDE'], ['browser.scroll', { direction: 'down', pages: NaN }, 'WAARDE'],
    ['browser.scroll', { direction: 'down', pages: 0.01 }, 'WAARDE'], ['browser.scroll', { pages: 1 }, 'VERPLICHT'],
    ['browser.history', { action: 'javascript' }, 'WAARDE'], ['browser.select', { name: 'Taal', option: '' }, 'LENGTE'],
    // toetsen
    ['browser.key', { key: 'a' }, 'WAARDE'], ['browser.key', { key: 'Control+w' }, 'WAARDE'], ['browser.key', { key: 'F12' }, 'WAARDE'], ['browser.key', { key: 'enter' }, 'WAARDE'], ['browser.key', { key: ['Enter'] }, 'WAARDE'],
    // formulier
    ['browser.fill_form', { elements: [] }, 'LENGTE'], ['browser.fill_form', { elements: Array.from({ length: 21 }, () => ({ name: 'a', value: 'b' })) }, 'LENGTE'],
    ['browser.fill_form', { elements: [{ name: 'a', value: 'b', submit: true }] }, 'SLEUTEL_ONBEKEND'], ['browser.fill_form', { elements: [{ name: 'a' }] }, 'VERPLICHT'], ['browser.fill_form', { elements: ['a'] }, 'PARAMS_VORM'],
    ['browser.fill_form', { elements: { 0: { name: 'a', value: 'b' } } }, 'TYPE'],
    // site-acties
    ['browser.invoke', { action: 'Open-Service' }, 'WAARDE'], ['browser.invoke', { action: 'x;alert(1)' }, 'WAARDE'], ['browser.invoke', { action: 'open', args: [] }, 'TYPE'],
    ['browser.invoke', { action: 'open', args: { 'a b': 1 } }, 'SLEUTEL_ONBEKEND'], ['browser.invoke', { action: 'open', args: { x: 'y'.repeat(4100) } }, 'LENGTE'],
    ['browser.invoke', { action: 'open', args: { a: { b: { c: { d: { e: 1 } } } } } }, 'DIEPTE'], ['browser.invoke', { action: 'open', args: { a: '\u0000' } }, 'CONTROLETEKEN'],
    ['browser.invoke', { action: 'open', args: JSON.parse('{"__proto__":{"isAdmin":true}}') }, 'SLEUTEL_ONBEKEND'], ['browser.invoke', { action: 'open', args: JSON.parse('{"constructor":{"prototype":{"x":1}}}') }, 'SLEUTEL_ONBEKEND'],
    // overige
    ['browser.console', { types: ['error', 'secret'] }, 'WAARDE'], ['browser.console', { types: 'error' }, 'TYPE'], ['browser.network', { failed_only: 'ja' }, 'TYPE'], ['browser.network', { failed_only: 1 }, 'TYPE'],
    ['browser.deep_diagnostics', { seconds: 11 }, 'WAARDE'], ['browser.deep_diagnostics', { reload: 'true' }, 'TYPE'], ['browser.audit', { soort: 'cookies' }, 'WAARDE'], ['browser.audit', { soort: 'alles', velden: true }, 'SLEUTEL_ONBEKEND'],
    ['browser.screenshot', { fullPage: true }, 'SLEUTEL_ONBEKEND'], ['browser.tabs', { all: true }, 'SLEUTEL_ONBEKEND'],
  ];
  const slechtFout = slecht.filter(([t, p, code]) => { const r = v(t, p); return r.ok || (code && r.code !== code); });
  check(`slechte invoer: alle ${slecht.length} gevallen geweigerd met de juiste code`, slechtFout.length === 0,
    slechtFout.map(([t, p, c]) => `${t} ${JSON.stringify(p)?.slice(0, 60)} verwacht ${c} kreeg ${JSON.stringify(v(t, p))}`).join(' | ').slice(0, 600));

  // ---------------------------------------------------------------- prototype-vervuiling
  const pp1 = v('browser.wait', JSON.parse('{"text":"x","__proto__":{"polluted":"ja"}}'));
  const pp2 = v('browser.wait', Object.assign(Object.create({ geërfd: 1 }), { text: 'x' }));
  const pp3 = v('browser.fill_form', JSON.parse('{"elements":[{"name":"a","value":"b","__proto__":{"x":1}}]}'));
  const obj = Object.create(null); obj.text = 'x';
  const pp4 = v('browser.wait', obj);
  const sym = { text: 'x', [Symbol('s')]: 1 };
  check('__proto__ als eigen sleutel (JSON.parse) → SLEUTEL_ONBEKEND; object met vreemd prototype → PARAMS_VORM; symbool-sleutel → geweigerd; null-prototype mag',
    pp1.code === 'SLEUTEL_ONBEKEND' && pp2.code === 'PARAMS_VORM' && pp3.code === 'SLEUTEL_ONBEKEND' && pp4.ok === true && v('browser.wait', sym).ok === false && ({} as any).polluted === undefined, JSON.stringify([pp1, pp2, pp3, pp4]));
  const kopie = v('browser.invoke', { action: 'open', args: { service: 'mail' } });
  const inv = { action: 'open', args: { service: 'mail' } };
  const r = v('browser.invoke', inv);
  check('resultaat is een schone kopie (niet hetzelfde object, alleen bekende sleutels)', kopie.ok && r.params !== inv && r.params.args !== inv.args && JSON.stringify(r.params) === JSON.stringify(inv));
  check('typtekst: \\r\\n wordt \\n', v('browser.type', { name: 'a', text: 'x\r\ny' }).params?.text === 'x\ny');

  // ---------------------------------------------------------------- review 18.10 punt 6: hostToegestaan zonder poort
  const D = ['admin.tarasevych.com'];
  check('hostToegestaan: andere poort, :443 expliciet mag (URL normaliseert), afsluitende punt, hoofdletters en punycode-lookalike',
    !hostToegestaan('https://admin.tarasevych.com:8443/', D) && hostToegestaan('https://admin.tarasevych.com:443/', D) && !hostToegestaan('https://admin.tarasevych.com./', D)
    && hostToegestaan('https://ADMIN.TARASEVYCH.COM/', D) && !hostToegestaan('https://xn--admn-xxx.tarasevych.com/', D) && !hostToegestaan('https://ADMİN.tarasevych.com/', D));

  // ---------------------------------------------------------------- codescan: geen dynamische code in de extensie
  const map = join(W, 'extension');
  const bestanden = readdirSync(map).filter((f) => f.endsWith('.js'));
  const zonderCommentaar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  const regels: Array<[string, RegExp]> = [
    ['eval(', /(^|[^.\w])eval\s*\(/],
    ['new Function', /new\s+Function\s*\(/],
    ['Function(...) als constructor', /(^|[^.\w])Function\s*\(\s*['"`]/],
    ['setTimeout/setInterval met tekst', /set(Timeout|Interval)\s*\(\s*['"`]/],
    ['innerHTML/outerHTML met variabelen', /\.(inner|outer)HTML\s*\+?=(?!\s*['"][^'"$`]*['"]\s*[;,)\n])/],
    ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
    ['document.write', /document\.write(ln)?\s*\(/],
    ['import() van een variabele (niet chrome.runtime.getURL)', /(^|[^.\w])import\s*\(\s*(?!chrome\.runtime\.getURL\(\s*['"`][\w.-]+['"`]\s*\))/],
  ];
  const treffers: string[] = [];
  for (const f of bestanden) {
    const s = zonderCommentaar(readFileSync(join(map, f), 'utf8'));
    for (const [naam, re] of regels) if (re.test(s)) treffers.push(`${f}: ${naam}`);
  }
  check(`codescan extension/*.js (${bestanden.length} bestanden): geen eval, new Function, setTimeout(tekst), innerHTML met variabelen, document.write, dynamische import`,
    bestanden.length >= 8 && treffers.length === 0, treffers.join(' | '));
  const manifest = JSON.parse(readFileSync(join(map, 'manifest.json'), 'utf8'));
  check("manifest-CSP: script-src 'self'; object-src 'none'; base-uri 'none' (geen unsafe-eval / unsafe-inline)",
    manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'none'; base-uri 'none'" && !/unsafe/.test(JSON.stringify(manifest)));
  const html = readdirSync(map).filter((f) => f.endsWith('.html')).map((f) => readFileSync(join(map, f), 'utf8')).join('\n');
  check('extensiepagina’s: geen inline scripts of on…=-attributen (CSP zou ze toch blokkeren)', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) && !/\son[a-z]+\s*=\s*["']/i.test(html));
  return einde();
}
