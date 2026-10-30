// Testhulp (geen test zelf): een browser die genoeg op een browser lijkt om de PAGINAMODULES te kunnen laden en met
// react-dom/server te renderen. Nodig omdat src/canoniek-dienst.ts zijn runtime uit `window` leest op het moment dat hij
// geïmporteerd wordt (public/canonical-service.js zet die runtime). Zelfde aanpak als
// tests/eenheid/vertaalpaneel-20261019.test.ts; hier staat zij één keer, zodat elke test dezelfde nepbrowser gebruikt.
//
// LET OP voor wie een test schrijft: roep `nepBrowser()` aan VOORDAT een module uit src/ geladen wordt, dus importeer die
// modules met `await import(...)` binnen `main()` en niet bovenaan het bestand.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

export function nepBrowser(origin = 'https://cloud.tarasevych.com', taal: 'uk' | 'nl' = 'uk'): void {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 };
  };
  const u = new URL(`${origin}/`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag();
  g.localStorage = opslag();
  g.window = Object.assign(g, {
    name: '', innerWidth: 1280, innerHeight: 800,
    addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined,
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
  });
  if (!g.document) {
    g.document = {
      hidden: false, title: '', cookie: '',
      addEventListener: () => undefined, removeEventListener: () => undefined,
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      documentElement: { lang: taal, dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
      body: null,
    };
  }
  runInNewContext(readFileSync(join(process.cwd(), 'public/canonical-service.js'), 'utf8'), {
    window: g, location: g.location,
    document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) },
    addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL,
  });
}
