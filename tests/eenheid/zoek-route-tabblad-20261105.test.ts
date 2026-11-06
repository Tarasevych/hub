// ZOEKEN — EEN TREFFER OPENT ZIJN TABBLAD (ORCH-001, oude fout, 05.11.2026). Zonder database.
//
// De UI-catalogus (backend/zoek/catalogus-ui.ts) en de adapters (backend/zoek/adapters.ts) schrijven een route als
// {host: <dienst>, pad: <tabblad-id>}; de client (src/zoek/zoek-kern.ts → routeUrl) maakt er de echte URL van. Tot 05.11.2026 sloten
// die twee niet op elkaar aan: de client kende de hosts identity/api/admin/huis niet (kaart zonder link: 630 van de 1949
// catalogusobjecten) en las een tabblad-id zonder «/» als ongeldig pad (de rest opende de wortel van de dienst). Geen enkel object
// opende zijn tabblad. Deze test houdt vast:
//   A. elk object van de echte catalogus: de route komt door de client (leesRoute), geeft een URL op het domein van zijn dienst, en
//      public/canonical-service.js (resolve, zoals de pagina zelf) leest daaruit precies dat tabblad — niet «onbekend»;
//   B. voorbeelden: «Підтвердити видалення» → id.*/account, «Перейменувати» (sleutelkluis) → api.*/kluis, lokale mail → mail.*/prive;
//   C. de vormen van de adapters (mail inbox, cloud search, hub notes) openen hun tabblad;
//   D. veiligheid blijft: tabblad van een andere dienst of onbekend → «/», onveilig pad → «/», onbekende host → '', id = identity;
//   E. hash en focus blijven staan; F. recente zoekopdrachten bewaren een route naar identity/api (vroeger weggegooid).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
import type { ZoekRoute } from '../../shared/zoek-model';

type Runtime = { resolve: (loc: URL) => { service: string; tab: string; onbekend?: boolean }; serviceForHostname: (h: string) => string; defaults: Record<string, string> };

function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const u = new URL('https://hub.tarasevych.com/zoek');
  const maakEl = () => ({ dataset: {}, style: {}, setAttribute: () => undefined, getAttribute: () => null, getContext: () => null });
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  const m = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { addEventListener: () => undefined, removeEventListener: () => undefined });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-route-tabblad-20261105');
  const herstel = nepBrowser();
  try {
    const rt = (globalThis as unknown as { __TSV_CANONICAL_SERVICE__: Runtime }).__TSV_CANONICAL_SERVICE__;
    const { uiCatalogus } = await import('../../backend/zoek/catalogus-ui');
    const { routeUrl } = await import('../../src/zoek/zoek-kern');
    const { leesRoute } = await import('../../src/zoek/zoek-api');
    const { bewaarRecent, leesRecent } = await import('../../src/zoek/zoek-recent');
    const DIENST: Record<string, string> = { id: 'identity' };
    /** Wat de pagina zelf uit de URL leest (public/canonical-service.js → resolve), of een reden waarom het niet klopt. */
    const opent = (route: ZoekRoute | null | undefined) => {
      const r = leesRoute(route);
      if (!r) return { fout: 'leesRoute weigert de route' };
      const url = routeUrl(r, 'uk');
      if (!url) return { fout: 'geen URL' };
      const x = new URL(url), plek = rt.resolve(x);
      return { url, dienst: rt.serviceForHostname(x.hostname), tab: plek.tab, onbekend: Boolean(plek.onbekend), pad: x.pathname };
    };

    // A. de hele catalogus
    const cat = uiCatalogus();
    const fout: string[] = [];
    for (const o of cat) {
      const p = opent(o.route);
      const dienst = DIENST[o.route.host] || o.route.host;
      const tab = o.route.pad || rt.defaults[dienst];
      if ('fout' in p) fout.push(`${o.id}: ${p.fout}`);
      else if (p.dienst !== dienst || p.tab !== tab || p.onbekend) fout.push(`${o.id}: ${o.route.host}/${o.route.pad} → ${p.url}`);
    }
    check(`A elk object van de catalogus (${cat.length}) opent zijn eigen dienst en tabblad, zoals de pagina het leest`, cat.length > 1500 && fout.length === 0, fout.slice(0, 5).join(' | '));
    const metPad = cat.filter((o) => o.route.pad);
    check('A geen object zonder tabblad valt stil terug op de wortel: elk met een tabblad krijgt een eigen pad', metPad.length > 1500 && metPad.every((o) => { const p = opent(o.route); return !('fout' in p) && p.pad !== '/'; }));

    // B. voorbeelden met de volledige URL
    const urlVan = (pred: (o: (typeof cat)[number]) => boolean) => { const o = cat.find(pred); return o ? routeUrl(leesRoute(o.route), 'uk') : '(niet gevonden)'; };
    check('B «Підтвердити видалення» → https://id.tarasevych.com/account', urlVan((o) => o.titels.uk === 'Підтвердити видалення' && o.bron === 'ui') === 'https://id.tarasevych.com/account?lang=uk', urlVan((o) => o.titels.uk === 'Підтвердити видалення'));
    check('B «Перейменувати» van de sleutelkluis → https://api.tarasevych.com/kluis', urlVan((o) => o.titels.uk === 'Перейменувати' && (o.extra as { bestand?: string }).bestand === 'src/ApiPlatformWeergave.tsx') === 'https://api.tarasevych.com/kluis?lang=uk');
    check('B pagina mail/local → https://mail.tarasevych.com/prive; pagina admin/sso → admin.*/sso; huis/devices → huis.*/apparaten',
      urlVan((o) => o.id === 'pagina:mail/local') === 'https://mail.tarasevych.com/prive?lang=uk' && urlVan((o) => o.id === 'pagina:admin/sso') === 'https://admin.tarasevych.com/sso?lang=uk' && urlVan((o) => o.id === 'pagina:huis/devices') === 'https://huis.tarasevych.com/apparaten?lang=uk');

    // C. adapters (zelfde contract: pad = tabblad-id)
    // ZOEKDIEP-001: de oude parameter `bericht` wordt `open_message_id` — de naam die de mailpagina leest (shared/zoek-diepe-link.ts).
    check('C adapters: mail inbox → /postvak-in (+ open_message_id, ook uit het oude `bericht`), cloud search → /zoeken, hub notes → /notities, github repositories → /repositories',
      routeUrl({ host: 'mail', pad: 'inbox', params: { bericht: 'm1' } }, 'nl') === 'https://mail.tarasevych.com/postvak-in?open_message_id=m1&lang=nl'
      && routeUrl({ host: 'mail', pad: 'inbox', params: { open_message_id: 'm1', open_mail_account: 'a1' } }, 'nl') === 'https://mail.tarasevych.com/postvak-in?open_message_id=m1&open_mail_account=a1&lang=nl'
      && routeUrl({ host: 'cloud', pad: 'search' }, 'uk') === 'https://cloud.tarasevych.com/zoeken?lang=uk'
      && routeUrl({ host: 'hub', pad: 'notes' }, 'uk') === 'https://hub.tarasevych.com/notities?lang=uk'
      && routeUrl({ host: 'github', pad: 'repositories' }, 'uk') === 'https://github.tarasevych.com/repositories?lang=uk');

    // D. veiligheid en terugwaartse verenigbaarheid
    check('D tabblad van een andere dienst of onbekend → «/», nooit een vrij pad',
      routeUrl({ host: 'mail', pad: 'vault' }, 'uk') === 'https://mail.tarasevych.com/?lang=uk' && routeUrl({ host: 'api', pad: 'bestaatniet' }, 'uk') === 'https://api.tarasevych.com/?lang=uk'
      && routeUrl({ host: 'hub', pad: 'evil.example' }, 'uk') === 'https://hub.tarasevych.com/?lang=uk' && routeUrl({ host: 'hub', pad: '//evil.example/x' }, 'uk') === 'https://hub.tarasevych.com/?lang=uk');
    check('D een pad met «/» blijft zoals het was; id en identity zijn dezelfde dienst; onbekende host → \'\'',
      routeUrl({ host: 'id', pad: '/instellingen' }, 'nl') === 'https://id.tarasevych.com/instellingen?lang=nl' && routeUrl({ host: 'id', pad: 'methods' }, 'uk') === routeUrl({ host: 'identity', pad: 'methods' }, 'uk')
      && routeUrl({ host: 'identity', pad: 'methods' }, 'uk') === 'https://id.tarasevych.com/aanmeldmethoden?lang=uk' && routeUrl({ host: 'evil' as never, pad: 'inbox' }, 'uk') === '' && routeUrl({ host: '__proto__' as never, pad: '/' }, 'uk') === '' && leesRoute({ host: 'evil', pad: '/' }) === null);

    // E. hash en focus
    const metHash = cat.find((o) => o.route.hash && o.route.pad);
    const metFocus = cat.find((o) => o.route.params?.focus && o.route.pad);
    const alsUrl = (s: string) => { try { return new URL(s); } catch { return null; } };
    const uH = metHash ? alsUrl(routeUrl(leesRoute(metHash.route), 'uk')) : null, uF = metFocus ? alsUrl(routeUrl(leesRoute(metFocus.route), 'uk')) : null;
    check('E hash (#tabblad op de pagina) en ?focus=<hulp-sleutel> blijven bij de nieuwe paden staan',
      !!uH && uH.hash === metHash!.route.hash && uH.pathname !== '/' && !!uF && uF.searchParams.get('focus') === metFocus!.route.params!.focus && uF.pathname !== '/', `${uH?.href} ${uF?.href}`);

    // F. recente zoekopdrachten
    const opslag = new Map<string, string>();
    const o = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => { opslag.set(k, v); }, removeItem: (k: string) => { opslag.delete(k); } };
    bewaarRecent('видалити акаунт', 'all', 1_800_000_000_000, 'u1', o, { soort: 'functie', route: { host: 'identity', pad: 'account' } });
    bewaarRecent('кейчейн', 'all', 1_800_000_000_001, 'u1', o, { soort: 'functie', route: { host: 'api', pad: 'vault' } });
    // api.* is technisch: die rij staat in de technische lijst (src/zoek/zoek-recent.ts → isTechRoute), niet in de privélijst.
    const prive = leesRecent('u1', o, 'gebruiker');
    const terug = [...prive, ...leesRecent('u1', o, 'technisch')];
    check('F recente functies met een route naar identity/api blijven een functie (vroeger: route weggegooid → gewone zoekopdracht); api.* alleen in de technische lijst',
      prive.length === 1 && prive[0].route?.host === 'identity' &&
      terug.length === 2 && terug.every((r) => r.soort === 'functie' && r.route) && routeUrl(terug.find((r) => r.route?.host === 'api')!.route, 'uk') === 'https://api.tarasevych.com/kluis?lang=uk', JSON.stringify(terug));
  } finally {
    herstel();
  }
  return einde();
}
