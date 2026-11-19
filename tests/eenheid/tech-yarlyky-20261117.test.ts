// Модульний тест (17.11.2026): ярлики кнопок технічного профілю в обох частинах меню з дозволу адміністратора.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
import { BAND_KLEUREN, STANDAARD_BAND } from '../../shared/tech-rollen';
import { isItemZichtbaarInGebruiker, isTechYarlykItem, techYarlykBandKleur } from '../../shared/tech-yarlyky';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');

function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window && (g.window as Record<string, unknown>).__TSV_CANONICAL_SERVICE__) return;
  const opslag = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 };
  };
  const u = new URL('https://hub.tarasevych.com/overview');
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = g.sessionStorage || opslag();
  g.localStorage = g.localStorage || opslag();
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(lees('public/canonical-service.js'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-yarlyky-20261117');

  // ---------------------------------------------------------------- 1. Визначення ярликів технічного профілю
  check('admin, api та їхні сторінки завжди є технічними ярликами',
    isTechYarlykItem('svc:admin', false, false)
    && isTechYarlykItem('pg:admin/roles', true, false)
    && isTechYarlykItem('svc:api', false, false)
    && isTechYarlykItem('pg:api/vault', true, false));

  check('адмін-сторінки mcp є технічними ярликами, а звичайні сторінки mcp — ні',
    isTechYarlykItem('pg:mcp/dashboard', true, false)
    && isTechYarlykItem('pg:mcp/apps', true, false)
    && isTechYarlykItem('pg:mcp/download', false, false)
    && isTechYarlykItem('pg:mcp/verbindingen', false, false)
    && !isTechYarlykItem('pg:mcp/agents', true, false)
    && !isTechYarlykItem('pg:mcp/playground', false, false));

  check('svc:mcp є ярликом у технічній частині або без права api-platform',
    isTechYarlykItem('svc:mcp', true, true)
    && isTechYarlykItem('svc:mcp', false, false)
    && !isTechYarlykItem('svc:mcp', true, false));

  check('звичайні служби й сторінки не позначаються як технічні ярлики',
    !isTechYarlykItem('svc:hub', false, false)
    && !isTechYarlykItem('svc:mail', true, false)
    && !isTechYarlykItem('pg:hub/tasks', false, false)
    && !isTechYarlykItem('svc:identity', true, true));

  // ---------------------------------------------------------------- 2. Видимість у звичайній частині меню
  check('без дозволу адміністратора технічні ярлики приховані у звичайному просторі навіть за наявності копій',
    !isItemZichtbaarInGebruiker('svc:admin', true, { 'svc:admin': { plaats: 'snelbalk' } }, false, false)
    && !isItemZichtbaarInGebruiker('pg:admin/roles', true, {}, false, true)
    && !isItemZichtbaarInGebruiker('pg:mcp/dashboard', true, {}, false, true)
    && !isItemZichtbaarInGebruiker('svc:mcp', true, {}, false, false));

  check('із дозволом адміністратора ярлики не з’являються самі, доки їх не розмістив користувач',
    !isItemZichtbaarInGebruiker('svc:admin', false, {}, true, false)
    && !isItemZichtbaarInGebruiker('pg:api/oauth', false, {}, true, false)
    && !isItemZichtbaarInGebruiker('pg:mcp/download', false, {}, true, true));

  check('із дозволом адміністратора явно розміщені ярлики видно у звичайному просторі',
    isItemZichtbaarInGebruiker('svc:admin', true, {}, true, false)
    && isItemZichtbaarInGebruiker('pg:admin/roles', false, { 'pg:admin/roles': { plaats: 'snelbalk' } }, true, true)
    && isItemZichtbaarInGebruiker('pg:mcp/dashboard', true, {}, true, true)
    && isItemZichtbaarInGebruiker('svc:mcp', true, {}, true, false));

  check('звичайні пункти у звичайному просторі видимі незалежно від дозволу на ярлики',
    isItemZichtbaarInGebruiker('svc:mail', false, {}, false, false)
    && isItemZichtbaarInGebruiker('pg:hub/tasks', false, {}, false, false)
    && isItemZichtbaarInGebruiker('svc:mcp', false, {}, false, true));

  // ---------------------------------------------------------------- 3. Колір значка й контуру з технічного профілю
  const alleKleurenOk = Object.entries(BAND_KLEUREN).every(([k, v]) => {
    const res = techYarlykBandKleur(k);
    return res.kleur === k && res.bg === v.bg && res.fg === v.fg;
  });
  const standaardKleur = techYarlykBandKleur('onbekend');
  check('techYarlykBandKleur повертає точні кольори профілю та безпечний стандартний колір',
    alleKleurenOk
    && standaardKleur.kleur === STANDAARD_BAND.kleur
    && standaardKleur.bg === BAND_KLEUREN[STANDAARD_BAND.kleur].bg);

  // ---------------------------------------------------------------- 4. Міжпросторове розміщення копій (zijbalk-voorkeuren)
  nepBrowser();
  const { __zijbalkReset, zijbalkKopieInRuimte, zijbalkRuimtes } = await import('../../src/zijbalk-voorkeuren');
  __zijbalkReset();
  const r1 = zijbalkKopieInRuimte('gebruiker', 'svc:admin', 'snelbalk', 'k-tech0001', { kleur: 'oker' });
  const r2 = zijbalkKopieInRuimte('gebruiker', 'svc:admin', 'snelbalk', 'k-tech0002');
  const r3 = zijbalkKopieInRuimte('technisch', 'pg:admin/roles', 'start', 'k-tech0003');
  const r4 = zijbalkKopieInRuimte('technisch', 'svc:admin', 'zijbalk', 'k-tech0004');
  const ruimtes = zijbalkRuimtes();
  check('zijbalkKopieInRuimte розміщує ярлики в потрібній частині меню та не дублює вже наявні',
    r1 === 'toegevoegd'
    && r2 === 'bestaat'
    && r3 === 'toegevoegd'
    && r4 === 'bestaat'
    && ruimtes.gebruiker.kopieen.some((k) => k.id === 'k-tech0001' && k.item === 'svc:admin' && k.plaats === 'snelbalk')
    && ruimtes.technisch.kopieen.some((k) => k.id === 'k-tech0003' && k.item === 'pg:admin/roles' && k.plaats === 'start'));

  // ---------------------------------------------------------------- 5. Перевірка міграції, сервера, інтерфейсу та стилів
  const mig = lees('migrations/0301_tech_snelkoppelingen.sql');
  const srv = lees('backend/tech-profiel.ts');
  const routes = lees('backend/tech-routes.ts');
  const kern = lees('backend/tech-ruimtes-kern.ts');
  const laag = lees('src/tech/TechLaag.tsx');
  const toegang = lees('src/tech/ruimtes/ToegangPagina.tsx');
  const bewerker = lees('src/SnelleToegangBewerker.tsx');
  const omlijsting = lees('src/CanoniekOmlijsting.tsx');
  const acties = lees('src/MenuItemActies.tsx');
  const css = lees('src/menu-v2.css');

  check('міграція 0301 додає snelkoppelingen_toegestaan до app.tech_profielen',
    /ALTER TABLE app\.tech_profielen/i.test(mig) && /snelkoppelingen_toegestaan boolean NOT NULL DEFAULT false/i.test(mig));

  check('серверна логіка та маршрути підтримують дозвіл адміністратора на ярлики',
    /snelkoppelingenZetten/.test(srv)
    && /snelkoppelingenToegestaan/.test(srv)
    && /\/api\/owner\/tech\/snelkoppelingen/.test(routes)
    && /snelkoppelingen_toegestaan/.test(kern));

  check('панелі керування профілями й доступами містять перемикачі дозволу на ярлики',
    /import \{[^}]*techVernieuwen/.test(laag)
    && /SNELKOPPELINGEN_ONGELDIG/.test(laag)
    && /data-tech-yarlyk-toestaan/.test(laag)
    && /yarlyk:\$\{r\.email\}/.test(laag)
    && /techSnelkoppelingenZetten/.test(toegang)
    && /ShieldCheck/.test(toegang));

  check('меню, редактор швидкого доступу та стилі позначають ярлики чистим круглим обведенням кольором профілю без півмісяця й дубльованого щитка (UPD-007)',
    /data-tech-yarlyk/.test(bewerker)
    && !/tech-yarlyk-schild/.test(bewerker)
    && /data-snel-deel/.test(bewerker)
    && /data-tech-yarlyk/.test(omlijsting)
    && !/tech-yarlyk-schild/.test(omlijsting)
    && /--tech-profiel-kleur/.test(omlijsting)
    && /zijbalkKopieInRuimte/.test(omlijsting)
    && /extraActies/.test(acties)
    && /ander-deel/.test(acties)
    && !/\.tech-yarlyk-schild\{/.test(css)
    && !/inset 3px 0 0 var\(--tech-profiel-kleur/.test(css)
    && /box-shadow:0 0 0 2px var\(--tech-profiel-kleur/.test(css)
    && /--tech-profiel-kleur/.test(css));

  return einde();
}
