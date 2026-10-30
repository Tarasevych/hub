#!/usr/bin/env node
// РЕНДЕР-КОНТРОЛЬ (rook-controle) — 22.10.2026, зона A.
//
// Навіщо: випуск 20261021-221718 мав «Buffer is not defined» на рівні модуля в технічному бандлі admin.*; усі сторінки admin.* були
// білими, але /__gezondheid і «HTTP 200» були зеленими — інсталятор, nazorg і «Діагностика» нічого не помітили. Ця перевірка відкриває
// ключові сторінки у СПРАВЖНЬОМУ headless Chromium на сервері (лише loopback) і вважає сторінку зламаною, якщо:
//   - є pageerror (неперехоплена помилка) або console.error із ReferenceError/TypeError;
//   - `#root` порожній або містить лише смугу (немає main/форми/розділу);
//   - запит бандла (JS) завершився не 200 (або не завантажився);
//   - на сторінці є текст «Internal server error».
// Плюс: кожен бандл із dist/assets/**/*.js імпортується в браузері (ловить помилки рівня модуля в УСІХ чанках, не лише на відкритих
// сторінках). Без Chromium — лише модульна перевірка в Node (vm-контекст без Buffer/process/require): чесно позначається як
// «рендеринг не перевірено».
//
// Режими:
//   --stand        власна одноразова копія сайту через dist-server/rook.mjs (ROOK_DB у середовищі; інсталятор створює й видаляє базу):
//                  тестовий власник + активний технічний профіль → також admin.*, mcp.* і технічні чанки.
//   --sessie FILE  готовий рядок ROOK_SESSIE (JSON) від запущеного rook.mjs (для тестів).
//   --live URL     жива служба (напр. http://127.0.0.1:8080) через локальний TLS-проксі, БЕЗ входу: лише публічні сторінки
//                  (вхід id, hub, двері admin) і публічні чанки — це запускає nazorg після встановлення.
//   --alleen-modules  без браузера: лише модульна перевірка в Node.
// Інше: --dist DIR (dist/), --uit FILE (rapporten/rook-controle.json), --chromium PAD, --tls DIR (srv.key/srv.crt), --profiel DIR,
//   --tijd SEC (ліміт на сторінку, 20), --paginas a,b (фільтр за назвою), --migreren (разом із --stand), --praat (докладно).
// Код виходу: 0 = усе гаразд, 1 = зламано (підстава для відкату), 2 = перевірку не вдалося виконати (НЕ підстава для відкату).
//
// Gebruik: node scripts/rook-controle.mjs [opties]   (de installer geeft --experimental-vm-modules door voor de modulecontrole)
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const HIER = dirname(fileURLToPath(import.meta.url));
const WORTEL = resolve(HIER, '..');
const require = createRequire(import.meta.url);

// ------------------------------------------------------------------------------------------------------------ argumenten
const argv = process.argv.slice(2);
const arg = (naam, standaard = '') => { const i = argv.indexOf(naam); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : standaard; };
const vlag = (naam) => argv.includes(naam);
const DIST = resolve(arg('--dist', join(WORTEL, 'dist')));
const UIT = resolve(arg('--uit', join(WORTEL, 'rapporten', 'rook-controle.json')));
const TIJD_MS = Math.max(5, Number(arg('--tijd', '20')) || 20) * 1000;
const FILTER = arg('--paginas', '').split(',').map((s) => s.trim()).filter(Boolean);
const PRAAT = vlag('--praat');
const praat = (s) => { if (PRAAT) process.stderr.write(`[rook] ${s}\n`); };
const zeg = (s) => process.stderr.write(`[rook] ${s}\n`);

// ------------------------------------------------------------------------------------------------------------ netwerkslot
// Лише loopback: жодне з'єднання назовні (як у scripts/e2e-lokaal.mjs). Chromium дістає host-resolver-rules з «усе інше → ~NOTFOUND».
const LOKAAL = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
{
  const weiger = (host) => { const e = new Error(`rook: verbinding naar ${host} geweigerd (alleen loopback)`); e.code = 'ROOK_NIET_LOKAAL'; return e; };
  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...a) {
    const b = Array.isArray(a[0]) ? a[0] : a;
    const o = b[0] && typeof b[0] === 'object' ? b[0] : null;
    const pad = o ? o.path : (typeof b[0] === 'string' && !/^\d+$/.test(b[0]) ? b[0] : undefined);
    const host = o ? (o.path ? undefined : (o.host || 'localhost')) : (pad ? undefined : (typeof b[1] === 'string' ? b[1] : 'localhost'));
    if (!pad && !LOKAAL.has(String(host).toLowerCase())) throw weiger(host);
    return origConnect.apply(this, a);
  };
  const origLookup = dns.lookup;
  dns.lookup = function (host, ...rest) {
    if (!LOKAAL.has(String(host).toLowerCase())) { const cb = rest.find((x) => typeof x === 'function'); const e = weiger(host); if (cb) { process.nextTick(() => cb(e)); return {}; } throw e; }
    return origLookup.call(this, host, ...rest);
  };
  for (const k of Object.keys(process.env)) if (/^(https?|no|all)_proxy$/i.test(k)) delete process.env[k];
}

// ------------------------------------------------------------------------------------------------------------ Chromium zoeken
export const CHROMIUM_KANDIDATEN = ['/srv/mijn-ruimte/browser/chrome-headless-shell', '/srv/mijn-ruimte/browser/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/lib/chromium/chromium', '/opt/pw-browsers/chromium'];
export function zoekChromium(expliciet = '') {
  for (const p of [expliciet, process.env.ROOK_CHROMIUM, ...CHROMIUM_KANDIDATEN].filter(Boolean)) {
    try { if (statSync(p).isFile()) return p; } catch { /* volgende */ }
  }
  return '';
}

// ------------------------------------------------------------------------------------------------------------ bundels in dist
export function bundelsVan(dist) {
  const uit = [];
  const loop = (map) => { for (const n of readdirSync(map)) { const p = join(map, n); if (statSync(p).isDirectory()) loop(p); else if (n.endsWith('.js')) uit.push(p); } };
  const assets = join(dist, 'assets');
  if (existsSync(assets)) loop(assets);
  return uit.sort();
}
/** Класичні (не-module) скрипти з index.html у порядку появи: ./canonical-security.js … ./canonical-boot.js. */
export function klassiekeScripts(dist) {
  let html = ''; try { html = readFileSync(join(dist, 'index.html'), 'utf8'); } catch { return []; }
  return [...html.matchAll(/<script\s+src="\.\/([a-z0-9-]+\.js)"><\/script>/g)].map((m) => m[1]).filter((n) => existsSync(join(dist, n)));
}
/** Чанки, недосяжні з index.html (ні прямо, ні через інші чанки): залишки старої збірки, не частина застосунку. */
export function weesChunks(dist) {
  const alle = bundelsVan(dist);
  const perNaam = new Map(alle.map((p) => [p.slice(p.lastIndexOf('/') + 1), p]));
  let tekst = ''; try { tekst = readFileSync(join(dist, 'index.html'), 'utf8'); } catch { /* geen index */ }
  // Посилання = будь-який рядок у лапках, що закінчується на .js (import, import(), __vite__mapDeps, index.html).
  const verwijzingen = (t) => [...t.matchAll(/["'](?:[A-Za-z0-9_./-]*\/)?([A-Za-z0-9_.-]+\.js)["']/g)].map((m) => m[1]).filter((n) => perNaam.has(n));
  const bereikt = new Set();
  const stapel = verwijzingen(tekst).map((n) => perNaam.get(n));
  while (stapel.length) {
    const p = stapel.pop();
    if (bereikt.has(p)) continue;
    bereikt.add(p);
    for (const n of verwijzingen(readFileSync(p, 'utf8'))) { const q = perNaam.get(n); if (q && !bereikt.has(q)) stapel.push(q); }
  }
  return new Set(alle.filter((p) => !bereikt.has(p)));
}
/**
 * «Скелет» сторінок: чанки, без яких сторінка не відкривається — вхідний чанк з index.html, його ліниві маршрути першого рівня
 * (App → *View), усі технічні чанки (assets/tech/) і все, що вони імпортують СТАТИЧНО. Помилка рівня модуля тут = біла сторінка
 * (саме так 20261021-221718). Ледача бібліотека глибше (напр. mdb-reader лише при відкритті вкладення) = попередження, не відкат.
 */
export function skeletChunks(dist) {
  const alle = bundelsVan(dist);
  const perNaam = new Map(alle.map((p) => [p.slice(p.lastIndexOf('/') + 1), p]));
  const naam = (p) => p.slice(p.lastIndexOf('/') + 1);
  let html = ''; try { html = readFileSync(join(dist, 'index.html'), 'utf8'); } catch { /* geen index */ }
  const statisch = (t) => [...t.matchAll(/\b(?:from|import)\s*["'](\.{0,2}\/[^"']+\.js)["']/g)].map((m) => perNaam.get(naam(m[1]))).filter(Boolean);
  const dynamisch = (t) => [...t.matchAll(/\bimport\(\s*["'](\.{0,2}\/[^"']+\.js)["']\s*\)/g)].map((m) => perNaam.get(naam(m[1]))).filter(Boolean);
  const ingangen = [...html.matchAll(/src="\.\/(assets\/[^"]+\.js)"/g)].map((m) => join(dist, m[1])).filter((p) => perNaam.has(naam(p)));
  const wortels = new Set([...ingangen, ...alle.filter((p) => /\/assets\/tech\//.test(p))]);
  // Ліниві маршрути першого рівня: з вхідного чанка (App → *View) і з технічних чанків (AdminConsoleView → підсторінки admin).
  for (const p of [...ingangen, ...alle.filter((q) => /\/assets\/tech\//.test(q))]) for (const q of dynamisch(readFileSync(p, 'utf8'))) wortels.add(q);
  const skelet = new Set();
  const stapel = [...wortels];
  while (stapel.length) {
    const p = stapel.pop();
    if (skelet.has(p)) continue;
    skelet.add(p);
    for (const q of statisch(readFileSync(p, 'utf8'))) if (!skelet.has(q)) stapel.push(q);
  }
  return skelet;
}
const NODE_GLOBAAL = /\b(Buffer|process|require|module|exports|__dirname|__filename|global|setImmediate)\b is not defined/;
const NODE_GLOBAAL_TEKST = /\b(?:ReferenceError|TypeError)\b.*\b(?:Buffer|process|require|__dirname|__filename|setImmediate)\b/;

/**
 * Модульна перевірка в Node: кожен чанк виконується як ES-модуль у голому vm-контексті (без Buffer/process/require, з легкою
 * DOM-заглушкою). Вердикт «зламано» ЛИШЕ для Node-глобалів (саме той клас помилок, що зламав 20261021-221718); будь-яка інша помилка
 * (document/window-специфіка, якої заглушка не знає) — «не можна оцінити в Node», не зламано. Потрібен --experimental-vm-modules.
 */
export async function modulesControleren(dist, domein = 'voorbeeld.invalid') {
  const bundels = bundelsVan(dist);
  const uitslag = { aantal: bundels.length, kapot: [], waarschuwingen: [], onbeoordeelbaar: [], ok: 0, modus: 'node-vm' };
  if (typeof vm.SourceTextModule !== 'function') {
    // Zonder de vlag: onszelf opnieuw starten met de vlag en het resultaat overnemen.
    const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', fileURLToPath(import.meta.url), '--alleen-modules', '--dist', dist, '--uit', '-', '--domein', domein], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    try { const j = JSON.parse(r.stdout.split('\n').filter((l) => l.startsWith('{')).pop() || '{}'); if (j.bundels) return j.bundels; } catch { /* hieronder */ }
    uitslag.modus = 'onmogelijk'; uitslag.onbeoordeelbaar.push(`vm.SourceTextModule niet beschikbaar (${(r.stderr || '').trim().split('\n').pop() || 'geen uitvoer'})`);
    return uitslag;
  }
  // Асинхронні помилки модулів (промиси, колбеки) не повинні звалити цей процес; вони не є помилками рівня модуля.
  process.on('unhandledRejection', () => undefined); process.on('uncaughtException', () => undefined);
  const ctx = vm.createContext(domShim(domein));
  // Як у браузері: спершу класичні скрипти з index.html (canonical-security/service/presentation/boot), потім модулі.
  // Помилка в них — «не можна оцінити» (заглушка DOM неповна), ніколи вердикт.
  for (const src of klassiekeScripts(dist)) {
    try { vm.runInContext(readFileSync(join(dist, src), 'utf8'), ctx, { filename: src, timeout: 5000 }); }
    catch (e) { uitslag.onbeoordeelbaar.push(`${src} (klassiek script): ${String((e && e.message) || e).split('\n')[0].slice(0, 160)}`); }
  }
  const wezen = weesChunks(dist), skelet = skeletChunks(dist);
  uitslag.waarschuwingen = [];
  const cache = new Map();
  const laad = (pad) => {
    if (cache.has(pad)) return cache.get(pad);
    const bron = readFileSync(pad, 'utf8');
    const url = `https://admin.${domein}/${relative(dist, pad).replace(/\\/g, '/')}`;
    const m = new vm.SourceTextModule(bron, {
      context: ctx, identifier: url,
      initializeImportMeta: (meta) => { meta.url = url; meta.env = { MODE: 'production', PROD: true, DEV: false }; },
      importModuleDynamically: (spec, ref) => link(spec, ref),
    });
    cache.set(pad, m);
    return m;
  };
  const link = async (spec, ref) => {
    if (!/^\.{0,2}\//.test(spec)) throw new Error(`BARE_IMPORT:${spec}`);
    const basis = fileURLToPath(pathToFileURL(ref.identifier.startsWith('https://') ? join(dist, new URL(ref.identifier).pathname) : ref.identifier));
    const doel = spec.startsWith('/') ? join(dist, spec) : resolve(dirname(basis), spec);
    const m = laad(doel);
    if (m.status === 'unlinked') await m.link(link);
    if (m.status === 'linked') await m.evaluate({ timeout: 10_000 });
    return m;
  };
  for (const pad of bundels) {
    const naam = relative(dist, pad).replace(/\\/g, '/');
    try {
      const m = laad(pad);
      if (m.status === 'unlinked') await m.link(link);
      if (m.status === 'linked') await m.evaluate({ timeout: 10_000 });
      if (m.status === 'errored') throw m.error;
      uitslag.ok++;
      praat(`module ok: ${naam} (${m.status})`);
      // Een chunk die zelf een Node-global op het venster zet (bv. een Buffer-polyfill) mag de volgende chunks niet maskeren: weghalen.
      for (const g of ['Buffer', 'process', 'require', 'global', 'module', 'exports', 'setImmediate']) {
        if (vm.runInContext(`typeof ${g} !== 'undefined'`, ctx)) { vm.runInContext(`delete globalThis.${g}; delete window.${g};`, ctx); delete ctx[g]; uitslag.polyfills = [...(uitslag.polyfills || []), `${naam}: ${g}`]; }
      }
    } catch (e) {
      const msg = String((e && e.message) || e).split('\n')[0].slice(0, 200);
      praat(`module fout: ${naam}: ${msg}`);
      if (wezen.has(pad)) uitslag.onbeoordeelbaar.push(`${naam} (wees-chunk, nergens gerefereerd): ${msg}`);
      else if (!(NODE_GLOBAAL.test(msg) || NODE_GLOBAAL_TEKST.test(msg))) uitslag.onbeoordeelbaar.push(`${naam}: ${msg}`);
      else if (skelet.has(pad)) uitslag.kapot.push(`${naam}: ${msg}`);
      else uitslag.waarschuwingen.push(`${naam} (lazy bibliotheek, geen paginaskelet): ${msg}`);
    }
  }
  return uitslag;
}

/** Легка заглушка браузера для vm-контексту: достатньо, щоб модулі дійшли до власного коду; БЕЗ Buffer/process/require. */
export function domShim(domein) {
  const noop = () => undefined;
  const el = () => ({ nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', get ownerDocument() { return doc; }, style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop }, setAttribute: noop, getAttribute: () => null, removeAttribute: noop, appendChild: (c) => c, removeChild: noop, insertBefore: (c) => c, addEventListener: noop, removeEventListener: noop, getContext: () => null, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }), children: [], childNodes: [], firstChild: null, parentNode: null, textContent: '', innerHTML: '', focus: noop, blur: noop, remove: noop, cloneNode() { return el(); }, contains: () => false, matches: () => false, closest: () => null, attachShadow: () => el(), toString: () => '[object HTMLElement]' });
  const opslag = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
  class Waarnemer { constructor() { } observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } }
  class Leeg { constructor() { } addEventListener() { } removeEventListener() { } postMessage() { } close() { } terminate() { } send() { } open() { } setRequestHeader() { } }
  const doc = Object.assign(el(), { documentElement: el(), head: el(), body: el(), createElement: () => el(), createElementNS: () => el(), createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => el(), createComment: () => ({}), getElementById: (id) => (id === 'root' || id === 'boot-shell' ? el() : null), nodeType: 9, nodeName: '#document', getElementsByTagName: () => [], readyState: 'complete', cookie: '', title: '', visibilityState: 'visible', hidden: false, activeElement: null, currentScript: null, fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) }, implementation: { createHTMLDocument: () => doc }, location: null, defaultView: null });
  const locatie = { href: `https://admin.${domein}/overzicht`, origin: `https://admin.${domein}`, protocol: 'https:', host: `admin.${domein}`, hostname: `admin.${domein}`, port: '', pathname: '/overzicht', search: '', hash: '', assign: noop, replace: noop, reload: noop, toString() { return this.href; } };
  // Таймери ковтають помилки колбеків (асинхронна робота застосунку — не предмет модульної перевірки); MessageChannel нічого не доставляє,
  // тож React-планувальник ніколи не рендерить у заглушку.
  const veilig = (f) => (typeof f === 'function' ? (...a) => { try { return f(...a); } catch { /* asynchrone fout: niet moduleniveau */ } } : noop);
  class KanaalPoort { constructor() { this.onmessage = null; } postMessage() { } start() { } close() { } addEventListener() { } removeEventListener() { } }
  class Kanaal { constructor() { this.port1 = new KanaalPoort(); this.port2 = new KanaalPoort(); } }
  const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, trace: noop, group: noop, groupEnd: noop, table: noop, time: noop, timeEnd: noop },
    URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout: (f, ms, ...a) => setTimeout(veilig(f), ms, ...a), clearTimeout, setInterval: (f, ms, ...a) => setInterval(veilig(f), ms, ...a), clearInterval, queueMicrotask: (f) => queueMicrotask(veilig(f)), Intl, Date, Math, JSON, atob, btoa, structuredClone,
    AbortController, AbortSignal, Blob, File: globalThis.File, Event, EventTarget, CustomEvent: globalThis.CustomEvent || Event, MessageChannel: Kanaal, MessagePort: KanaalPoort, Headers, Request, Response, FormData, performance, DOMException, BroadcastChannel: globalThis.BroadcastChannel || Leeg,
    ReadableStream, WritableStream, TransformStream, TextDecoderStream, TextEncoderStream, CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream, WebAssembly, SharedArrayBuffer, Atomics, BigInt, Symbol, Proxy, Reflect, WeakRef, FinalizationRegistry, Promise, Map, Set, WeakMap, WeakSet, Array, Object, Function, String, Number, Boolean, RegExp, Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError, AggregateError, ArrayBuffer, DataView, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape, NaN, Infinity, undefined,
    fetch: () => new Promise(noop), XMLHttpRequest: Leeg, WebSocket: Leeg, Worker: Leeg, SharedWorker: Leeg, Image: Leeg, Audio: Leeg, FileReader: Leeg, Notification: Object.assign(Leeg, { permission: 'default', requestPermission: () => Promise.resolve('default') }),
    MutationObserver: Waarnemer, ResizeObserver: Waarnemer, IntersectionObserver: Waarnemer, PerformanceObserver: Object.assign(Waarnemer, { supportedEntryTypes: [] }),
    HTMLElement: class { }, Element: class { }, Node: class { }, HTMLIFrameElement: class { }, HTMLCanvasElement: class { }, HTMLImageElement: class { }, HTMLInputElement: class { }, SVGElement: class { }, Text: class { }, Document: class { }, Window: class { }, ShadowRoot: class { }, DocumentFragment: class { }, CSSStyleSheet: class { replaceSync() { } }, OffscreenCanvas: class { getContext() { return null; } }, ImageData: class { }, Path2D: class { }, DOMMatrix: class { }, DOMParser: class { parseFromString() { return doc; } }, XMLSerializer: class { serializeToString() { return ''; } }, MediaQueryList: class { }, TouchEvent: Event, KeyboardEvent: Event, MouseEvent: Event, PointerEvent: Event, FocusEvent: Event, InputEvent: Event, ErrorEvent: Event, PromiseRejectionEvent: Event, StorageEvent: Event, PopStateEvent: Event, HashChangeEvent: Event, MessageEvent: Event, CloseEvent: Event, ProgressEvent: Event, UIEvent: Event, WheelEvent: Event, DragEvent: Event, ClipboardEvent: Event, AnimationEvent: Event, TransitionEvent: Event,
    document: doc, location: locatie, navigator: { userAgent: 'Mozilla/5.0 rook-controle', language: 'uk', languages: ['uk', 'nl'], platform: 'Linux', onLine: true, hardwareConcurrency: 2, maxTouchPoints: 0, clipboard: { writeText: () => Promise.resolve() }, serviceWorker: undefined, mediaDevices: undefined, permissions: { query: () => Promise.resolve({ state: 'denied' }) }, storage: { estimate: () => Promise.resolve({}) }, credentials: undefined, locks: undefined, userAgentData: undefined, connection: undefined, sendBeacon: () => true, vibrate: noop },
    localStorage: opslag(), sessionStorage: opslag(), history: { pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop, state: null, length: 1, scrollRestoration: 'auto' }, screen: { width: 1280, height: 800, availWidth: 1280, availHeight: 800, orientation: { type: 'landscape-primary', addEventListener: noop } },
    matchMedia: () => ({ matches: false, media: '', addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null }),
    requestAnimationFrame: (f) => setTimeout(veilig(() => f(performance.now())), 0), cancelAnimationFrame: clearTimeout, requestIdleCallback: (f) => setTimeout(veilig(() => f({ didTimeout: false, timeRemaining: () => 1 })), 0), cancelIdleCallback: clearTimeout,
    getComputedStyle: () => ({ getPropertyValue: () => '' }), scrollTo: noop, scroll: noop, scrollBy: noop, alert: noop, confirm: () => false, prompt: () => null, open: () => null, close: noop, focus: noop, blur: noop, print: noop, postMessage: noop, addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 800, devicePixelRatio: 1, scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, isSecureContext: true, origin: `https://admin.${domein}`, name: '', closed: false, frames: [], length: 0, opener: null, parent: null, top: null, frameElement: null, crossOriginIsolated: false, customElements: { define: noop, get: () => undefined, whenDefined: () => Promise.resolve() }, CSS: { supports: () => false, escape: (s) => s }, speechSynthesis: undefined, indexedDB: undefined, caches: undefined, visualViewport: { width: 1280, height: 800, addEventListener: noop, removeEventListener: noop }, scheduler: undefined, trustedTypes: undefined, __TSV_PRESENTATION__: {},
  };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx; ctx.parent = ctx; ctx.top = ctx; doc.defaultView = ctx; doc.location = locatie; 
  return ctx;
}

// ------------------------------------------------------------------------------------------------------------ CDP (eigen, via ws)
/** Мінімальний клієнт Chrome DevTools Protocol поверх пакета `ws` (уже залежність): без playwright у package.json. */
class Cdp {
  constructor(ws) { this.ws = ws; this.n = 0; this.wacht = new Map(); this.luisteraars = []; ws.on('message', (d) => this.ontvang(String(d))); }
  static async verbind(url) {
    const { WebSocket } = require('ws');
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    return new Cdp(ws);
  }
  ontvang(tekst) {
    let m; try { m = JSON.parse(tekst); } catch { return; }
    if (m.id && this.wacht.has(m.id)) { const w = this.wacht.get(m.id); this.wacht.delete(m.id); if (m.error) w.rej(new Error(`${w.method}: ${m.error.message}`)); else w.res(m.result); }
    else if (m.method) for (const l of this.luisteraars) { try { l(m); } catch { /* luisteraar */ } }
  }
  send(method, params = {}, sessionId) {
    const id = ++this.n;
    const p = new Promise((res, rej) => { this.wacht.set(id, { res, rej, method }); setTimeout(() => { if (this.wacht.has(id)) { this.wacht.delete(id); rej(new Error(`${method}: geen antwoord (30 s)`)); } }, 30_000).unref(); });
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return p;
  }
  on(fn) { this.luisteraars.push(fn); }
  sluit() { try { this.ws.close(); } catch { /* al dicht */ } }
}

async function chromiumStarten(pad, profiel, poort, domein) {
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-sync', '--disable-component-update', '--disable-default-apps', '--mute-audio', '--window-size=1280,800', '--lang=uk', '--ignore-certificate-errors', '--no-proxy-server',
    `--host-resolver-rules=MAP *.${domein} 127.0.0.1:${poort}, MAP ${domein} 127.0.0.1:${poort}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
    '--remote-debugging-port=0', `--user-data-dir=${profiel}`, 'about:blank',
  ];
  const kind = spawn(pad, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: profiel, TMPDIR: profiel, LANG: 'C.UTF-8' } });
  const url = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error(`Chromium meldde geen DevTools-adres binnen 30 s: ${buf.slice(-400)}`)), 30_000);
    kind.stderr.on('data', (d) => { buf += String(d); const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } });
    kind.on('exit', (code) => { clearTimeout(t); rej(new Error(`Chromium stopte (code ${code}): ${buf.slice(-400)}`)); });
  });
  return { kind, url };
}

// ------------------------------------------------------------------------------------------------------------ pagina's
const RENDER_SELECTOR = 'main, [role="main"], form, .admin-section, [data-tech-poort], .mcp-estate, [data-admin-diagnostics], article, [data-adg-root], .canonical-service-list, [data-v2-wizard], [data-mcp-consent-modal]';
const KAPOT_RE = /\b(ReferenceError|TypeError)\b|is not defined|Cannot read propert|is not a function|is not iterable|Internal server error/;

/** Лист ключових сторінок (з сесією власника + технічним профілем). `zonder` = у другому контексті без cookies (вхід). */
export function paginaLijst(hosts, metSessie) {
  const P = (naam, host, pad, extra = {}) => ({ naam, host, pad, ...extra });
  if (!metSessie) return [P('id-inloggen', hosts.identity, '/'), P('hub-overzicht-zonder', hosts.hub, '/overzicht'), P('admin-poort-zonder', hosts.admin, '/overzicht')];
  return [
    P('hub-overzicht', hosts.hub, '/overzicht'), P('hub-zoek', hosts.hub, '/zoek'),
    P('mail-postvak-in', hosts.mail, '/postvak-in'),
    P('cloud-overzicht', hosts.cloud, '/overzicht'),
    P('admin-overzicht', hosts.admin, '/overzicht'), P('admin-updates', hosts.admin, '/updates'), P('admin-diagnostiek', hosts.admin, '/diagnostiek'), P('admin-toegang', hosts.admin, '/toegang'),
    P('mcp-dashboard', hosts.mcp, '/dashboard'), P('mcp-agenten', hosts.mcp, '/agenten'),
    P('id-inloggen', hosts.identity, '/', { zonder: true }),
    P('github-overzicht', hosts.github, '/overzicht'),
    P('ai', hosts.ai, '/'),
  ];
}

/** Вердикт для однієї сторінки з зібраних фактів — чиста функція (тестується окремо). */
export function beoordeel(f) {
  const fouten = [];
  if (f.http && f.http >= 500) fouten.push(`HTTP ${f.http}`);
  for (const b of f.bundels) fouten.push(`bundel ${b}`);
  for (const e of f.pageerrors) fouten.push(`pageerror: ${e}`);
  for (const c of f.consoleFouten) if (KAPOT_RE.test(c)) fouten.push(`console.error: ${c}`);
  if (/Internal server error/i.test(f.tekst || '')) fouten.push('tekst «Internal server error»');
  if (!f.geladen) fouten.push('pagina niet geladen (time-out)');
  else if (!f.rootKinderen) fouten.push('#root leeg');
  else if (!f.inhoud) fouten.push('#root alleen een strook (geen main/sectie/formulier)');
  const stand = fouten.length ? 'kapot' : 'ok';
  return { stand, fouten };
}

async function paginaControleren(cdp, s, p, basis, cookies, tab) {
  const feiten = { http: 0, bundels: [], pageerrors: [], consoleFouten: [], netwerk: [], tekst: '', rootKinderen: 0, inhoud: false, geladen: false, ms: 0 };
  const url = `https://${p.host}${p.pad}`;
  const t0 = Date.now();
  const luister = (m) => {
    if (m.sessionId !== s) return;
    const q = m.params || {};
    if (m.method === 'Runtime.exceptionThrown') feiten.pageerrors.push(String(q.exceptionDetails?.exception?.description || q.exceptionDetails?.text || 'onbekend').split('\n')[0].slice(0, 300));
    else if (m.method === 'Runtime.consoleAPICalled' && q.type === 'error') feiten.consoleFouten.push((q.args || []).map((a) => a.description || a.value || '').join(' ').split('\n')[0].slice(0, 300));
    else if (m.method === 'Network.responseReceived') {
      const r = q.response || {};
      if (q.type === 'Document' && r.url === url) feiten.http = r.status;
      if (q.type === 'Script' && r.status !== 200 && r.status !== 304) feiten.bundels.push(`${r.status} ${r.url}`);
      else if (r.status >= 400 && !/Service Worker|service-worker/.test(r.url)) feiten.netwerk.push(`${r.status} ${r.url}`);
    } else if (m.method === 'Network.loadingFailed') { const t = String(q.errorText || ''); if (!/ERR_ABORTED|net::ERR_BLOCKED_BY_CLIENT/.test(t)) (q.type === 'Script' ? feiten.bundels : feiten.netwerk).push(`${t} (${q.type || '?'})`); }
  };
  cdp.on(luister);
  try {
    await cdp.send('Page.navigate', { url }, s);
    const eind = Date.now() + TIJD_MS;
    let klaar = false;
    while (Date.now() < eind) {
      await new Promise((r) => setTimeout(r, 350));
      const r = await cdp.send('Runtime.evaluate', { expression: `(() => { const root = document.getElementById('root'); return JSON.stringify({ ready: document.readyState, kinderen: root ? root.children.length : -1, inhoud: !!(root && root.querySelector(${JSON.stringify(RENDER_SELECTOR)})), tekst: (document.body && document.body.innerText || '').slice(0, 4000), url: location.href }); })()`, returnByValue: true }, s).catch(() => null);
      const v = r && r.result && r.result.value ? JSON.parse(r.result.value) : null;
      if (!v) continue;
      feiten.rootKinderen = Math.max(0, v.kinderen); feiten.inhoud = v.inhoud; feiten.tekst = v.tekst; feiten.url = v.url;
      if (v.ready === 'complete') feiten.geladen = true;
      if (feiten.geladen && (v.inhoud || feiten.pageerrors.length || /Internal server error/i.test(v.tekst))) { klaar = true; break; }
    }
    // Ще секунда після рендера: помилки з ефектів/ледачих чанків.
    if (klaar) await new Promise((r) => setTimeout(r, 1200));
    const r2 = await cdp.send('Runtime.evaluate', { expression: `(() => { const root = document.getElementById('root'); return JSON.stringify({ kinderen: root ? root.children.length : -1, inhoud: !!(root && root.querySelector(${JSON.stringify(RENDER_SELECTOR)})), tekst: (document.body && document.body.innerText || '').slice(0, 4000) }); })()`, returnByValue: true }, s).catch(() => null);
    const v2 = r2 && r2.result && r2.result.value ? JSON.parse(r2.result.value) : null;
    if (v2) { feiten.rootKinderen = Math.max(0, v2.kinderen); feiten.inhoud = v2.inhoud; feiten.tekst = v2.tekst; }
  } catch (e) { feiten.pageerrors.push(`cdp: ${String(e.message || e).slice(0, 200)}`); }
  cdp.luisteraars.splice(cdp.luisteraars.indexOf(luister), 1);
  feiten.ms = Date.now() - t0;
  const b = beoordeel(feiten);
  return { naam: p.naam, url, stand: b.stand, fouten: b.fouten, http: feiten.http, ms: feiten.ms, rootKinderen: feiten.rootKinderen, inhoud: feiten.inhoud, opmerkingen: [...feiten.consoleFouten.filter((c) => !KAPOT_RE.test(c)), ...feiten.netwerk].slice(0, 12), tekst: feiten.tekst.replace(/\s+/g, ' ').slice(0, 160) };
}

/** Усі чанки dist імпортуються в браузері на admin-хості (з cookie технічного профілю): помилка рівня модуля в будь-якому чанку. */
async function bundelsInBrowser(cdp, s, dist, host, metTech) {
  const uit = { aantal: 0, kapot: [], waarschuwingen: [], onbeoordeelbaar: [], ok: 0, modus: 'browser' };
  const wezen = weesChunks(dist), skelet = skeletChunks(dist);
  const padVan = (p) => join(dist, p);
  const alle = bundelsVan(dist).filter((p) => !wezen.has(p)).map((p) => '/' + relative(dist, p).replace(/\\/g, '/')).filter((p) => metTech || !p.startsWith('/assets/tech/'));
  uit.aantal = alle.length;
  await cdp.send('Page.navigate', { url: `https://${host}/overzicht` }, s);
  await new Promise((r) => setTimeout(r, 1500));
  const r = await cdp.send('Runtime.evaluate', { expression: `(async () => { const uit = []; const NG = ['Buffer', 'process', 'require', 'global', 'module', 'exports', 'setImmediate']; for (const p of ${JSON.stringify(alle)}) { try { await import(p); uit.push([p, '']); } catch (e) { uit.push([p, String(e && e.message || e).split('\\n')[0].slice(0, 200)]); } for (const g of NG) if (g in window) { try { delete window[g]; } catch {} } } return JSON.stringify(uit); })()`, awaitPromise: true, returnByValue: true, timeout: 120_000 }, s).catch((e) => ({ fout: String(e.message || e) }));
  if (r.fout || !r.result?.value) { uit.onbeoordeelbaar.push(`import in browser mislukt: ${r.fout || 'geen antwoord'}`); return uit; }
  for (const [p, fout] of JSON.parse(r.result.value)) {
    if (!fout) uit.ok++;
    else if (/Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(fout)) uit.kapot.push(`${p}: ${fout} (bundel niet geladen)`);
    else if (skelet.has(padVan(p))) uit.kapot.push(`${p}: ${fout}`);
    else uit.waarschuwingen.push(`${p} (lazy bibliotheek, geen paginaskelet): ${fout}`);
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------------------ stand / live
function tlsLaden() {
  const map = arg('--tls', process.env.ROOK_TLS || '');
  if (map && existsSync(join(map, 'srv.key'))) return { key: readFileSync(join(map, 'srv.key')), cert: readFileSync(join(map, 'srv.crt')), map: '' };
  const tmp = mkdtempSync(join(tmpdir(), 'rook-tls-'));
  const domein = arg('--domein', 'tarasevych.com');
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=rook-controle', '-addext', `subjectAltName=DNS:*.${domein},DNS:${domein}`, '-keyout', join(tmp, 'srv.key'), '-out', join(tmp, 'srv.crt')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`openssl: ${r.stderr.slice(-200)}`);
  return { key: readFileSync(join(tmp, 'srv.key')), cert: readFileSync(join(tmp, 'srv.crt')), map: tmp };
}

/** Живий режим: TLS-проксі на loopback → http://127.0.0.1:PORT, Host зберігається (CSP upgrade-insecure-requests вимагає https). */
async function liveProxy(doelUrl) {
  const doel = new URL(doelUrl);
  if (!LOKAAL.has(doel.hostname)) throw new Error(`--live mag alleen loopback zijn: ${doelUrl}`);
  const tls = tlsLaden();
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    const up = http.request({ host: doel.hostname, port: Number(doel.port || 80), method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-proto': 'https' } }, (ur) => { res.writeHead(ur.statusCode || 502, ur.headers); ur.pipe(res); });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' }); res.end('rook-proxy: upstream niet bereikbaar'); });
    req.pipe(up);
  });
  const poort = await new Promise((res, rej) => { server.on('error', rej); server.listen(0, '127.0.0.1', () => res(server.address().port)); });
  return { poort, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); if (tls.map) rmSync(tls.map, { recursive: true, force: true }); }) };
}

/** Стенд: dist-server/rook.mjs у дочірньому процесі; чекаємо рядок ROOK_SESSIE. */
async function standStarten(dist) {
  const rook = process.env.ROOK_SERVER || join(WORTEL, 'dist-server', 'rook.mjs');   // ROOK_SERVER: alleen voor tests (andere bouwmap)
  if (!existsSync(rook)) throw new Error(`dist-server/rook.mjs ontbreekt (${rook}); bouw de server eerst`);
  if (!process.env.ROOK_DB) throw new Error('ROOK_DB ontbreekt (wegwerpdatabase; de installer maakt die aan)');
  const extra = [];
  if (vlag('--migreren')) extra.push('--migreren');
  if (PRAAT) extra.push('--praat');
  const tlsMap = arg('--tls', process.env.ROOK_TLS || '');
  if (tlsMap) extra.push('--tls', tlsMap);
  const kind = spawn(process.execPath, [rook, ...extra], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, DIST_DIR: dist } });
  const sessie = await new Promise((res, rej) => {
    let uit = '', err = '';
    const t = setTimeout(() => rej(new Error(`rook-stand gaf geen sessie binnen 240 s: ${err.slice(-500)}`)), 240_000);
    kind.stdout.on('data', (d) => { uit += String(d); const m = /^ROOK_SESSIE (\{.*\})$/m.exec(uit); if (m) { clearTimeout(t); res(JSON.parse(m[1])); } });
    kind.stderr.on('data', (d) => { err += String(d); if (PRAAT) process.stderr.write(String(d)); });
    kind.on('exit', (code) => { clearTimeout(t); rej(new Error(`rook-stand stopte (code ${code}): ${err.slice(-600)}`)); });
  });
  return { sessie, stop: () => new Promise((r) => { kind.on('exit', () => r()); try { kind.stdin.end(); } catch { /* al dicht */ } setTimeout(() => { try { kind.kill('SIGTERM'); } catch { /* weg */ } r(); }, 8000).unref(); }) };
}

// ------------------------------------------------------------------------------------------------------------ hoofd
function samenvatting(res) {
  const kapot = res.paginas.filter((p) => p.stand === 'kapot');
  const bk = res.bundels?.kapot?.length || 0;
  const n = res.paginas.length;
  if (res.modus === 'modules' || res.modus === 'geen') {
    const basis = res.modus === 'geen' ? ['модульна перевірка неможлива', 'modulecontrole onmogelijk'] : [`модулів перевірено в Node: ${res.bundels.ok}/${res.bundels.aantal}`, `modules in Node gecontroleerd: ${res.bundels.ok}/${res.bundels.aantal}`];
    return bk
      ? { uk: `Зламано: ${bk} бандл(ів) падає на рівні модуля (${res.bundels.kapot[0]}). Рендеринг у браузері не перевірено (Chromium відсутній: sudo mijn-ruimte-installeer browser-controle).`, nl: `Kapot: ${bk} bundel(s) falen op moduleniveau (${res.bundels.kapot[0]}). Rendering in de browser niet gecontroleerd (geen Chromium: sudo mijn-ruimte-installeer browser-controle).` }
      : { uk: `Лише HTTP + модулі (${basis[0]}${res.bundels.waarschuwingen?.length ? `, попереджень: ${res.bundels.waarschuwingen.length}` : ''}): рендеринг НЕ перевірено — Chromium відсутній (sudo mijn-ruimte-installeer browser-controle).`, nl: `Alleen HTTP + modules (${basis[1]}${res.bundels.waarschuwingen?.length ? `, waarschuwingen: ${res.bundels.waarschuwingen.length}` : ''}): rendering NIET gecontroleerd — geen Chromium (sudo mijn-ruimte-installeer browser-controle).` };
  }
  const waar = res.modus === 'live' ? ['жива служба, без входу', 'live dienst, zonder aanmelding'] : ['стенд із тестовим власником і технічним профілем', 'stand met testeigenaar en technisch profiel'];
  if (kapot.length || bk) {
    const eerste = kapot[0] ? `сторінка ${kapot[0].naam} не рендериться (${kapot[0].fouten[0]})` : `бандл ${res.bundels.kapot[0]}`;
    const eersteNl = kapot[0] ? `pagina ${kapot[0].naam} rendert niet (${kapot[0].fouten[0]})` : `bundel ${res.bundels.kapot[0]}`;
    return { uk: `Зламано (${waar[0]}): ${kapot.length} з ${n} сторінок, ${bk} бандл(ів). Перше: ${eerste}.`, nl: `Kapot (${waar[1]}): ${kapot.length} van ${n} pagina's, ${bk} bundel(s). Eerste: ${eersteNl}.` };
  }
  const w = res.bundels.waarschuwingen?.length || 0;
  const wUk = w ? ` Попередження: ${w} лінив${w === 1 ? 'а бібліотека' : 'их бібліотек'} не завантажується (${res.bundels.waarschuwingen[0]}).` : '';
  const wNl = w ? ` Waarschuwing: ${w} lazy bibliothe${w === 1 ? 'ek' : 'ken'} laadt niet (${res.bundels.waarschuwingen[0]}).` : '';
  return { uk: `Гаразд (${waar[0]}): ${n} сторінок рендеряться, ${res.bundels.ok}/${res.bundels.aantal} бандлів завантажуються в браузері.${wUk}`, nl: `In orde (${waar[1]}): ${n} pagina's renderen, ${res.bundels.ok}/${res.bundels.aantal} bundels laden in de browser.${wNl}` };
}

async function hoofd() {
  const t0 = Date.now();
  const res = { tijd: new Date().toISOString(), versie: 1, dist: DIST, modus: 'geen', chromium: '', uitgevoerd: false, kapot: false, paginas: [], bundels: { aantal: 0, kapot: [], waarschuwingen: [], onbeoordeelbaar: [], ok: 0, modus: 'geen' }, fouten: [], samenvatting: { uk: '', nl: '' }, ms: 0 };
  let code = 2;
  try {
    if (!existsSync(join(DIST, 'index.html'))) throw new Error(`geen dist/index.html in ${DIST}`);
    try { res.release = readFileSync(join(resolve(DIST, '..'), 'UITROL-VERSIE'), 'utf8').trim().slice(0, 32); } catch { /* geen versie */ }   // van de release waarvan dist/ is
    const domein = arg('--domein', 'tarasevych.com');
    const chromium = vlag('--alleen-modules') ? '' : zoekChromium(arg('--chromium'));
    res.chromium = chromium;
    if (!chromium) {
      // Без браузера: чесно — лише модулі.
      res.modus = 'modules';
      res.bundels = await modulesControleren(DIST, domein);
      res.uitgevoerd = res.bundels.modus !== 'onmogelijk';
      if (!res.uitgevoerd) res.modus = 'geen';
      res.kapot = res.bundels.kapot.length > 0;
      code = !res.uitgevoerd ? 2 : res.kapot ? 1 : 0;
    } else {
      // З браузером: стенд або жива служба.
      let basisPoort = 0, hosts = null, cookies = [], tab = '', stop = async () => undefined, metSessie = false;
      if (vlag('--stand') || arg('--sessie')) {
        let sessie;
        if (arg('--sessie')) sessie = JSON.parse(readFileSync(arg('--sessie'), 'utf8'));
        else { const st = await standStarten(DIST); sessie = st.sessie; stop = st.stop; }
        basisPoort = sessie.poort; hosts = sessie.hosts; cookies = sessie.cookies; tab = sessie.tab; metSessie = true; res.modus = 'stand';
        if (sessie.diep) res.diep = sessie.diep;   // diepe gezondheidscontrole van de stand (technische ruimte + /assets/tech/*)
      } else if (arg('--live')) {
        const pr = await liveProxy(arg('--live')); basisPoort = pr.poort; stop = pr.stop; res.modus = 'live';
        hosts = Object.fromEntries(['hub', 'identity', 'ai', 'mail', 'cloud', 'github', 'huis', 'api', 'admin', 'mcp'].map((k) => [k, `${k === 'identity' ? 'id' : k}.${domein}`]));
      } else throw new Error('kies --stand, --live URL, --sessie FILE of --alleen-modules');
      const profiel = arg('--profiel') || mkdtempSync(join(tmpdir(), 'rook-chromium-'));
      mkdirSync(profiel, { recursive: true });
      let chrome = null, cdp = null;
      try {
        chrome = await chromiumStarten(chromium, profiel, basisPoort, domein);
        cdp = await Cdp.verbind(chrome.url);
        const v = await cdp.send('Browser.getVersion');
        res.chromiumVersie = String(v.product || '');
        praat(`browser ${res.chromiumVersie} via ${chrome.url}`);
        const nieuwTab = async (metCookies) => {
          const { browserContextId } = await cdp.send('Target.createBrowserContext', {});
          const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
          const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
          await cdp.send('Page.enable', {}, sessionId); await cdp.send('Runtime.enable', {}, sessionId); await cdp.send('Network.enable', {}, sessionId); await cdp.send('Log.enable', {}, sessionId);
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
          if (metCookies && cookies.length) {
            await cdp.send('Network.setCookies', { cookies: cookies.flatMap((c) => Object.values(hosts).map((h) => ({ name: c.name, value: c.value, url: `https://${h}/`, secure: true, httpOnly: true, sameSite: 'Lax' }))) }, sessionId);
            await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', ${JSON.stringify(tab)}); } catch {}` }, sessionId);
          }
          return sessionId;
        };
        const sMet = await nieuwTab(metSessie);
        let sZonder = null;
        for (const p of paginaLijst(hosts, metSessie)) {
          if (FILTER.length && !FILTER.some((f) => p.naam.includes(f))) continue;
          const s = p.zonder ? (sZonder ??= await nieuwTab(false)) : sMet;
          const u = await paginaControleren(cdp, s, p, basisPoort, cookies, tab);
          res.paginas.push(u);
          zeg(`${u.stand === 'ok' ? 'OK  ' : 'KAPOT'} ${u.naam} ${u.url} (HTTP ${u.http || '?'}, ${u.ms} ms)${u.fouten.length ? ' — ' + u.fouten.join(' | ') : ''}`);
        }
        if (!FILTER.length || FILTER.includes('bundels')) res.bundels = await bundelsInBrowser(cdp, sMet, DIST, hosts.admin, metSessie);
        res.uitgevoerd = res.paginas.length > 0 || res.bundels.aantal > 0;
        res.kapot = res.paginas.some((p) => p.stand === 'kapot') || res.bundels.kapot.length > 0 || res.diep?.ok === false;
        code = !res.uitgevoerd ? 2 : res.kapot ? 1 : 0;
      } finally {
        // Opruimen mag de uitslag nooit veranderen: elke fout hier wordt geslikt.
        if (cdp) { try { await cdp.send('Browser.close'); } catch { /* al dicht */ } cdp.sluit(); }
        if (chrome) {
          await new Promise((r) => { const t = setTimeout(() => { try { chrome.kind.kill('SIGKILL'); } catch { /* weg */ } r(); }, 3000); chrome.kind.once('exit', () => { clearTimeout(t); r(); }); if (chrome.kind.exitCode !== null) { clearTimeout(t); r(); } });
        }
        if (!arg('--profiel')) for (let i = 0; i < 5; i++) { try { rmSync(profiel, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
        try { await stop(); } catch { /* al gestopt */ }
      }
    }
  } catch (e) {
    res.fouten.push(String(e.message || e).slice(0, 400));
    res.uitgevoerd = false; code = 2;
    zeg(`niet uitgevoerd: ${res.fouten[0]}`);
  }
  res.ms = Date.now() - t0;
  res.samenvatting = res.uitgevoerd && res.diep?.ok === false ? { uk: `Зламано: технічні сторінки не відкриваються (діагностика технічного простору: ${res.diep.stappen.filter((x) => !x.ok).map((x) => x.id).join(', ')}).`, nl: `Kapot: technische pagina's openen niet (controle technische ruimte: ${res.diep.stappen.filter((x) => !x.ok).map((x) => x.id).join(', ')}).` }
    : res.uitgevoerd ? samenvatting(res) : { uk: `Перевірку не вдалося виконати: ${res.fouten[0] || 'невідомо'} — це НЕ підстава для відкату.`, nl: `Controle kon niet worden uitgevoerd: ${res.fouten[0] || 'onbekend'} — dit is GEEN reden om terug te draaien.` };
  res.code = code;
  const json = JSON.stringify(res, null, 1);
  if (UIT === resolve('-') || arg('--uit') === '-') process.stdout.write(json.replace(/\n */g, ' ') + '\n');
  else { mkdirSync(dirname(UIT), { recursive: true }); writeFileSync(UIT, json + '\n'); }
  zeg(`${res.samenvatting.uk}`);
  zeg(`${res.samenvatting.nl}`);
  if (res.bundels.kapot.length) for (const b of res.bundels.kapot.slice(0, 5)) zeg(`  bundel kapot: ${b}`);
  if (res.bundels.waarschuwingen?.length) for (const b of res.bundels.waarschuwingen.slice(0, 5)) zeg(`  waarschuwing: ${b}`);
  if (res.bundels.onbeoordeelbaar?.length) praat(`  niet te beoordelen: ${res.bundels.onbeoordeelbaar.length} (eerste: ${res.bundels.onbeoordeelbaar[0]})`);
  return code;
}

const alsProgramma = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (alsProgramma) hoofd().then((c) => process.exit(c)).catch((e) => { zeg(`fout: ${e.message}`); process.exit(2); });
