// IDENTITEIT-015 (14.11.2026) — дзвіночок: «Код доступу «…» використано вперше» не було в панелі.
// Oorzaak (gevonden met tests/e2e/gast-toegang.e2e.ts, schermafdruk gast-08-melding: «Нові» 10, «Прочитані» 1):
//   1. de server maakt de melding (backend/toegangscodes.ts inwisselen → meld(…, 'security', …)) en levert haar in notificationItems;
//   2. de open pagina van de eigenaar toont haar als pop-up; markeerGetoond (src/CanoniekMeldingencentrum.tsx) maakte elke
//      servermelding die op het scherm staat METEEN gelezen (POST /read, ~3 s na het aanmaken);
//   3. het paneel opent op «Нові» zodra er iets nieuws is (src/MeldingenpaneelInhoud.tsx `deel`) — de gelezen beveiligingsmelding
//      stond in «Прочитані» en was dus onzichtbaar, naast «Створено код доступу» (nog ongelezen) in «Нові».
// Herstel: een BEVEILIGINGSmelding van de server (kritiek type) wordt niet gelezen door alleen een pop-up (leesBijTonen); wel door
// het paneel, door × in de pop-up of door «Очистити». Andere meldingen: ongewijzigd (pop-up = gelezen, INTEG-001).
// Elk deel toetst echt gedrag: de pure regel met de echte soorttabel, en het oude paneel echt gerenderd (react-dom/server).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { leesBijTonen } from '../../src/canoniek-meldingen';
import { isKritiekType } from '../../shared/melding-typen';
import { soortInfo } from '../../shared/melding-soorten';

const lees = (p: string) => readFileSync(p, 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Minimale nagebootste browser (zoals meldingen-integ-20261103): genoeg om het paneel in node te renderen. */
function nepBrowser(host = 'https://id.tarasevych.com/'): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'navigator'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(host);
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(g, 'location', { value: { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined }, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'history', { value: { pushState: () => undefined, replaceState: () => undefined, state: null }, configurable: true, writable: true });
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen: beveiliging van de server blijft «нова» na een pop-up (IDENTITEIT-015)');

  // ------------------------------------------------------------------ A. de regel (met de echte soorttabel)
  const security = soortInfo('security').type;
  check('A0 soort «security» (toegangscode gebruikt) is van het kritieke type «beveiliging»', security === 'beveiliging' && isKritiekType(security), security);
  check('A1 servermelding «security» in een pop-up: NIET gelezen door alleen tonen (meldingId s:…)', leesBijTonen({ type: security, meldingId: 's:42' }, isKritiekType) === false);
  check('A1 ook met alleen serverId (zonder meldingId)', leesBijTonen({ type: security, serverId: '42' }, isKritiekType) === false);
  check('A1 ook «security_warning» («Це були ви?», nieuw apparaat)', leesBijTonen({ type: soortInfo('security_warning').type, meldingId: 's:7' }, isKritiekType) === false);
  const gewoon = soortInfo('mail_sync_failed').type;
  check('A2 gewone servermelding (geen kritiek type): pop-up = gelezen, zoals INTEG-001 vraagt', !isKritiekType(gewoon) && leesBijTonen({ type: gewoon, meldingId: 's:9' }, isKritiekType) === true, gewoon);
  check('A2 lokale beveiligingsmelding (eigen handeling in dit tabblad, l:…): pop-up = gelezen', leesBijTonen({ type: security, meldingId: 'l:notice-1' }, isKritiekType) === true);
  check('A2 activiteit (a:…): pop-up = gelezen', leesBijTonen({ type: security, meldingId: 'a:e1' }, isKritiekType) === true);
  check('A2 zonder type: pop-up = gelezen (veilige terugval: niets blijft eeuwig «нове»)', leesBijTonen({ meldingId: 's:1' }, isKritiekType) === true);

  // ------------------------------------------------------------------ B. de bel gebruikt de regel (bron)
  const bel = code(lees('src/CanoniekMeldingencentrum.tsx'));
  check('B1 markeerGetoond leest een servermelding alleen als leesBijTonen het toelaat',
    bel.includes('if (serverId && leesBijTonen(next, isKritiekType)) void propsRef.current.onReadServer?.(serverId);') && !bel.includes('    if (serverId) void propsRef.current.onReadServer?.(serverId);\n'));
  check('B2 de pop-up kent het type van de melding (nodig voor de regel)', bel.includes('...notice, type, text: tekst,'));
  check('B3 × in de pop-up = bewust gezien: dan wél gelezen (sluitDoorGebruiker), automatisch verdwijnen niet',
    bel.includes("onClick={sluitDoorGebruiker} aria-label={t('Закрити повідомлення'") && bel.includes('if (huidig && serverId && !leesBijTonen(huidig, isKritiekType)) void propsRef.current.onReadServer?.(serverId);') && bel.includes('dismissRef.current();'));

  // ------------------------------------------------------------------ C. het paneel: waar de regel heen gaat (echt gerenderd)
  const herstel = nepBrowser();
  try {
    const Body = (await import('../../src/MeldingenpaneelInhoud')).default;
    const NU = Date.UTC(2026, 10, 14, 17, 14);
    const server = (vertrouwd: boolean) => [
      { id: 'c1', kind: 'security', title: 'Створено код доступу «Для Олени» / Toegangscode «Для Олени» aangemaakt', message: 'Код для гостя.', createdAt: NU - 60_000, read: false, link: 'https://id.tarasevych.com/methods?code=c#toegangscodes' },
      { id: 'c2', kind: 'security', title: 'Код доступу «Для Олени» використано вперше / Toegangscode «Для Олени» voor het eerst gebruikt', message: 'Хтось увійшов як гість.', createdAt: NU - 20_000, read: !vertrouwd, link: 'https://id.tarasevych.com/methods?code=c#toegangscodes' },
    ];
    const props = (vertrouwd: boolean) => ({ lang: 'uk' as const, local: [], server: server(vertrouwd), events: [], readEvents: new Set<string>(), onReadLocal: () => undefined, onRemoveLocal: () => undefined, onRunAction: () => undefined, onReadEvent: () => undefined, detailIcons: {}, nu: NU });
    const voor = renderToStaticMarkup(createElement(Body, props(false)));
    check('C1 vóór het herstel (pop-up las haar): paneel opent op «Нові» en «…використано вперше» ontbreekt — de fout uit de e2e',
      voor.includes('aria-label="Нові: 1"') && voor.includes('aria-label="Прочитані: 1"') && voor.includes('Створено код доступу') && !voor.includes('використано вперше'));
    const na = renderToStaticMarkup(createElement(Body, props(true)));
    check('C2 met het herstel (blijft ongelezen): «…використано вперше» staat in «Нові», naast «Створено код доступу»',
      na.includes('aria-label="Нові: 2"') && na.includes('Код доступу «Для Олени» використано вперше') && na.includes('Створено код доступу'));
    check('C2 de rij is een gewone .cnc-row van de server met de link naar de code', /class="cnc-row[^"]*is-unread[^"]*"[^>]*data-origin="server"/.test(na) && na.includes('href="https://id.tarasevych.com/methods?code=c#toegangscodes"'));
  } catch (e) {
    check('C paneel rendert in node', false, String((e as Error).stack || e).slice(0, 600));
  } finally {
    herstel();
  }
  return einde();
}
