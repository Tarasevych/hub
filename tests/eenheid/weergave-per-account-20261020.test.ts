// Punt 2 en punt 4 van de eigenaar (audit 20.10.2026): THEMA, PALET EN DE REST VAN HET UITERLIJK zijn per ACCOUNT én per
// WEBRUIMTE (profiel), met de server als bron van waarheid en de cookie alleen als snelle cache voor het eerste beeld.
//
// Gevonden fout: src/gedeelde-voorkeuren.ts hield het hele uiterlijk (thema, palet, automatisch schakelen, taal, foto,
// meldingsgeluid, plaats van de bel, laatste paden) onder ÉÉN waarde in de cookie `tsv_ecosystem_preferences`
// (Domain=.tarasevych.com) en in sessionStorage. Dus: (a) twee accounts in dezelfde browser zagen elkaars thema, en (b) de
// gebruikersruimte en het technisch profiel waren visueel identiek, waardoor je niet zag waar je werkte.
//
// Deze test houdt vast:
//   1. het model (shared/uiterlijk.ts) houdt de twee ruimtes strikt apart — zoals shared/menu-model.ts voor het menu;
//   2. de SERVER stelt de profielgrens vast: lezen/schrijven per ruimte, 403 TECH_PROFIEL_VEREIST voor «technisch» zonder
//      lopend profiel (ook voor de eigenaar), de bootstrap geeft nooit de technische stand, beide ruimtes apart in de database;
//   3. de cookie en sessionStorage hebben een record PER ACCOUNT en PER RUIMTE, en wisselen van account of profiel brengt
//      niets van de ander mee (ook niet vóór het antwoord van de server); een anonieme bezoeker heeft zijn eigen 'anon';
//   4. een bestaande gedeelde waarde migreert naar precies het NU ACTIEVE account in de GEBRUIKERSRUIMTE — niet naar alle
//      accounts en niet naar het technisch profiel;
//   5. het eerste beeld (het inline script in index.html, vóór het malen) zet het thema van de juiste scope: geen witte flits
//      en geen sprong — ook met de oude cookie, dus ook tijdens de release zelf;
//   6. de cookie blijft binnen de grens van de browser: hoogstens MAX_RUIMTES scopes en MAX_COOKIE tekens.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import * as tp from '../../backend/tech-profiel';
import {
  metUiterlijkRuimte, normaliseerUiterlijkAccount, normaliseerUiterlijkRuimte, normaliseerUiterlijkRuimtes,
  standaardUiterlijkRuimtes, standaardVoorRuimte, uiterlijkLeeg, uiterlijkVoorRuimte, STANDAARD_TECHNISCH,
} from '../../shared/uiterlijk';

const ORIGIN = 'https://hub.tarasevych.com';
const COOKIE = 'tsv_ecosystem_preferences';
const A = 'u-0000000a', B = 'u-0000000b';
type Opslag = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const opslag = (): Opslag => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 } as unknown as Opslag; };
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uitCookie = (tekst: string) => { const paar = tekst.split('; ').find((x) => x.startsWith(`${COOKIE}=`)) || ''; try { return JSON.parse(decodeURIComponent(paar.slice(COOKIE.length + 1))) as Record<string, any>; } catch { return {} as Record<string, any>; } };
/** Een volledig gevuld uiterlijk (in de vorm die de app schrijft): zo wordt de cookie echt groot en is de grens te meten. */
const vol = (theme: string, palet: string) => ({
  theme, palet, auto: { soort: 'zon', van: '21:30', tot: '06:15', lat: 50.8, lon: 4.4, plaats: 'Brussel' }, menu: ['hub', 'mail', 'cloud', 'github', 'ai', 'mcp'],
  notificationSound: false, notificationBellPosition: { x: 0.95, y: 0.9 },
  lastPathByService: { hub: '/overview', ai: '/workspace', mail: '/inbox', cloud: '/overview', github: '/overview', huis: '/overview', identity: '/themes', api: '/access', admin: '/overview', mcp: '/overview' },
  viewByRoute: { 'mail:inbox': 'mail-empty', 'github:overview': 'github-empty' },
});

type Verzoek = { url: string; body: Record<string, unknown> };
const verzoeken: Verzoek[] = [];
type Koek = { tekst: () => string; laatste: () => string; zet: (naam: string, waarde: string) => void };

/** Nagebootste browser met een ECHTE cookiepot (zo is de lengte van de cookie meetbaar) en sessionStorage per «tabblad». */
function nepBrowser(): { ss: Opslag; koek: Koek } {
  const g = globalThis as Record<string, unknown>;
  const ls = opslag(), ss = opslag();
  const u = new URL(`${ORIGIN}/overview`);
  const potje = new Map<string, string>();
  let laatste = '';
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: '', hash: '', protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.localStorage = ls; g.sessionStorage = ss;
  try { Object.defineProperty(g, 'navigator', { value: { language: 'uk-UA' }, configurable: true, writable: true }); } catch { /* al aanwezig */ }
  g.window = Object.assign(g, { name: '', innerWidth: 1280, innerHeight: 800, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, setTimeout, clearTimeout, setInterval, clearInterval, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  const doc: Record<string, unknown> = {
    hidden: false, title: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    head: { appendChild: () => undefined }, createElement: () => ({ setAttribute: () => undefined, getAttribute: () => null, dataset: {}, getContext: () => null, style: {} }),
    documentElement: { lang: 'uk', dataset: {} as Record<string, string>, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null,
  };
  Object.defineProperty(doc, 'cookie', {
    get: () => [...potje].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (waarde: string) => { laatste = String(waarde); const paar = String(waarde).split('; ')[0], i = paar.indexOf('='); if (i > 0) potje.set(paar.slice(0, i), paar.slice(i + 1)); },
  });
  g.document = doc;
  g.fetch = async (url: unknown, init?: { body?: string }) => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>; } catch { /* geen json */ }
    verzoeken.push({ url: String(url), body });
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => JSON.stringify({ ok: true, weergave: body.weergave ?? null, sidebar: body.sidebar ?? null }) } as unknown as Response;
  };
  // De canonieke runtime (public/canonical-service.js) wordt door src/canoniek-dienst.ts verwacht; zelfde aanpak als menu-per-account.
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...doc, cookie: '', head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, sessionStorage: ss, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return { ss, koek: { tekst: () => String((doc as { cookie: string }).cookie), laatste: () => laatste, zet: (naam, waarde) => potje.set(naam, waarde) } };
}

/** Het inline script van index.html (vóór het eerste malen) in een eigen context uitvoeren en kijken wat er op <html> staat. */
function eersteBeeld(cookieWaarde: string, hints: Record<string, string>) {
  const html = readFileSync('index.html', 'utf8');
  const begin = html.indexOf('<script id="presentation-init">') + '<script id="presentation-init">'.length;
  const script = html.slice(begin, html.indexOf('</script>', begin));
  const klassen = new Set<string>();
  const ss = opslag(); for (const [k, v] of Object.entries(hints)) ss.setItem(k, v);
  const u = new URL(`${ORIGIN}/`);
  const loc = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: '/', search: '', hash: '', replace: () => undefined };
  const wortel = { lang: 'uk', dataset: {} as Record<string, string>, style: {} as Record<string, string>, classList: { contains: (k: string) => klassen.has(k), add: (...k: string[]) => k.forEach((x) => klassen.add(x)), remove: (...k: string[]) => k.forEach((x) => klassen.delete(x)) } };
  const doc = { cookie: `${COOKIE}=${cookieWaarde}`, title: '', documentElement: wortel, head: { appendChild: () => undefined }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute: () => undefined, dataset: {}, getContext: () => null, style: {} }), addEventListener: () => undefined };
  const venster: Record<string, unknown> = { name: '', addEventListener: () => undefined, location: loc, document: doc, sessionStorage: ss, navigator: { language: 'uk-UA' }, matchMedia: () => ({ matches: false }) };
  const ctx = { window: venster, location: loc, document: doc, sessionStorage: ss, navigator: venster.navigator, matchMedia: venster.matchMedia, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), ctx);
  runInNewContext(script, ctx);
  return { klassen, wortel, presentatie: (venster.__TSV_PRESENTATION__ || {}) as Record<string, any> };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('weergave-per-account-20261020');
  const bron = readFileSync('src/gedeelde-voorkeuren.ts', 'utf8');

  // ================================================================ 1. het model houdt de ruimtes apart (zoals het menu)
  const std = standaardUiterlijkRuimtes();
  check('twee ruimtes in één veld, versie 2 (zelfde vorm als `sidebar` voor het menu)', std.versie === 2 && uiterlijkLeeg(std.gebruiker) && uiterlijkLeeg(std.technisch));
  const oud = { modus: 'light', palet: 'puur', belPositie: { x: 0.2, y: 0.4 } };
  const gemigreerd = normaliseerUiterlijkRuimtes(oud);
  check('oud formaat (één los record) → GEBRUIKERSruimte, volledig behouden; technisch blijft leeg',
    gemigreerd.gebruiker.modus === 'light' && gemigreerd.gebruiker.palet === 'puur' && gemigreerd.gebruiker.belPositie?.x === 0.2 && uiterlijkLeeg(gemigreerd.technisch), JSON.stringify(gemigreerd));
  const na = metUiterlijkRuimte(gemigreerd, 'technisch', { modus: 'dark', palet: 'grifel' });
  check('technisch opslaan verandert de gebruikersruimte niet (en omgekeerd)',
    JSON.stringify(na.gebruiker) === JSON.stringify(gemigreerd.gebruiker) && na.technisch.modus === 'dark'
    && metUiterlijkRuimte(na, 'gebruiker', { modus: 'auto' }).technisch.palet === 'grifel');
  check('uiterlijkVoorRuimte leest één ruimte uit beide formaten', uiterlijkVoorRuimte(oud, 'gebruiker').palet === 'puur' && uiterlijkLeeg(uiterlijkVoorRuimte(oud, 'technisch')));
  check('rommel → beide ruimtes leeg', JSON.stringify(normaliseerUiterlijkRuimtes('x')) === JSON.stringify(std) && JSON.stringify(normaliseerUiterlijkRuimtes(null)) === JSON.stringify(std));
  const rommel = normaliseerUiterlijkRuimte({ onzin: 1, modus: 'paars', palet: 'neon', geluid: 'ja', belPositie: { x: 9, y: -9 }, laatstePad: { hub: '/bestaat-niet' }, routeBeeld: { 'mail:inbox': 'onzin' } });
  check('strikt genormaliseerd (browser én server): onbekende velden en waarden vallen weg',
    !('onzin' in rommel) && !rommel.modus && !rommel.palet && !('geluid' in rommel) && rommel.belPositie?.x === 1 && !rommel.laatstePad && !rommel.routeBeeld
    && normaliseerUiterlijkRuimte({ laatstePad: { hub: '/overview' } }).laatstePad?.hub === '/overview', JSON.stringify(rommel));
  check('oude vaste thema’s («plum-dark») blijven bewaard zoals ze zijn: voor niemand verandert er iets', normaliseerUiterlijkRuimte({ modus: 'plum-dark' }).modus === 'plum-dark');
  check('foto in de cache: alleen https en kort; een data:-URI (tot 340 kB) komt er NOOIT in — die past in geen cookie',
    !normaliseerUiterlijkAccount({ avatar: 'data:image/png;base64,AAAA' }).avatar && !normaliseerUiterlijkAccount({ avatar: `https://a.test/${'x'.repeat(1100)}` }).avatar
    && normaliseerUiterlijkAccount({ avatar: 'https://lh3.googleusercontent.com/foto', taal: 'nl' }).taal === 'nl');
  // ---- punt 4: het technisch profiel heeft standaard een EIGEN uiterlijk, maar de eigenaar kan het veranderen
  check('standaard technisch profiel = eigen set (donker + grifel); de gebruikersruimte houdt apparaat + sectiekleur',
    STANDAARD_TECHNISCH.modus === 'dark' && STANDAARD_TECHNISCH.palet === 'grifel' && standaardVoorRuimte('technisch').modus === 'dark' && uiterlijkLeeg(standaardVoorRuimte('gebruiker')));

  // ---- de bron: één mechaniek, dezelfde als die van het menu
  check('de opslag is per account EN per ruimte (`<account>|<ruimte>`), met een hint per tabblad voor het eerste beeld',
    /export const sleutelVoor=\(account:string,ruimte:MenuRuimte\)=>`\$\{account\|\|'anon'\}\|\$\{ruimte\}`/.test(bron)
    && /WEERGAVE_ACCOUNT_HINT='tsv-weergave-account',WEERGAVE_RUIMTE_HINT='tsv-weergave-ruimte'/.test(bron));
  check('schrijven gaat altijd naar de scope van DIT tabblad; alleen de accountkaart is globaal',
    /sleutel=sleutelVoor\(account,ruimteNu\)/.test(bron) && /accountPerDienst:\{\.\.\.opslag\.accountPerDienst,\.\.\.accountKaart\(patch\.accountKeyByService\)\}/.test(bron));
  check('CanonicalChrome zet de ruimte van dit tabblad voor het menu ÉN voor het uiterlijk',
    /zijbalkRuimte\(r\);weergaveRuimte\(r\)/.test(readFileSync('src/CanoniekOmlijsting.tsx', 'utf8')));
  const sync = readFileSync('src/weergave-uiterlijk.ts', 'utf8');
  check('server is de bron: bootstrap = gebruikersruimte, technisch apart opvragen, gebundeld opslaan per ruimte',
    /'\/api\/owner\/ui\/weergave'/.test(sync) && /'\/api\/owner\/ui\/weergave\/save'/.test(sync) && /ruimte: 'technisch'/.test(sync));
  check('bij een accountwissel wordt openstaande opslag AFGEBROKEN en nooit namens een ander geschreven',
    /if \(nieuwAccount !== weergaveAccountNu\(\)\) \{ wachtendenAf\(\);/.test(sync) && /if \(!server \|\| weergaveAccountNu\(\) !== account\) return; \/\/ ander account/.test(sync));
  check('ook de andere weergavekeuzes gebruiken dezelfde scope (integraties, keuze kaart/lijst/tabel)',
    /const OPSLAG = \(\) => `\$\{BASIS\}:\$\{weergaveScopeNu\(\)\}`/.test(readFileSync('src/integraties/Integraties.tsx', 'utf8'))
    && /const BRON_WEERGAVE = \(\) => `\$\{BRON_BASIS\}:\$\{weergaveScopeNu\(\)\}`/.test(readFileSync('src/uitrol/Bronnen.tsx', 'utf8')));

  // ================================================================ 2. de SERVER stelt de profielgrens vast (zoals bij het menu)
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const eigenaar = `wpa-eig-${T}@example.test`, gewoon = `wpa-gew-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  type B2 = ReturnType<typeof G.browser>;
  const opslaanS = (b: B2, weergave: unknown, ruimte?: string) => b.verzoek('id.tarasevych.com', '/api/owner/ui/weergave/save', b.ctxBody('identity', { weergave, ...(ruimte === undefined ? {} : { ruimte }) }));
  const lezenS = (b: B2, ruimte?: string) => b.verzoek('id.tarasevych.com', '/api/owner/ui/weergave', b.ctxBody('identity', ruimte === undefined ? {} : { ruimte }));
  const bootstrap = async (b: B2) => (await b.verzoek('id.tarasevych.com', '/api/owner/ui/preferences', b.ctxBody('identity'))).data;
  try {
    const b = G.browser();
    await b.aanmelden(`sub-wpa-eig-${T}`, eigenaar, { service: 'identity', intent: 'login' });
    const eigRij = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0];
    const eigUser = { id: String(eigRij?.id || ''), email: eigenaar, role: 'owner', status: 'approved' };

    const weigerSchrijf = await opslaanS(b, { modus: 'dark' }, 'technisch');
    check('eigenaar ZONDER lopend technisch profiel: het technische uiterlijk opslaan → 403 TECH_PROFIEL_VEREIST',
      weigerSchrijf.status === 403 && JSON.stringify(weigerSchrijf.data).includes('TECH_PROFIEL_VEREIST'), `${weigerSchrijf.status} ${weigerSchrijf.body.slice(0, 140)}`);
    const weigerLees = await lezenS(b, 'technisch');
    check('eigenaar ZONDER lopend technisch profiel: het technische uiterlijk lezen → 403 (de ene ruimte leest de andere niet uit)',
      weigerLees.status === 403 && JSON.stringify(weigerLees.data).includes('TECH_PROFIEL_VEREIST'), `${weigerLees.status} ${weigerLees.body.slice(0, 140)}`);
    check('onbekende ruimte → 403 (geen stille val terug naar een andere ruimte)', (await opslaanS(b, { modus: 'dark' }, 'eigenaar')).status === 403);

    const gebOk = await opslaanS(b, { modus: 'light', palet: 'puur', belPositie: { x: 0.3, y: 0.4 }, laatstePad: { mail: '/inbox' }, onzin: 'weg' });
    check('gebruikersruimte opslaan (standaard, zonder veld «ruimte»): 200, ruimte «gebruiker», strikt genormaliseerd',
      gebOk.status === 200 && gebOk.data.ruimte === 'gebruiker' && gebOk.data.weergave?.modus === 'light' && gebOk.data.weergave?.palet === 'puur'
      && gebOk.data.weergave?.belPositie?.x === 0.3 && !('onzin' in (gebOk.data.weergave || {})), `${gebOk.status} ${gebOk.body.slice(0, 220)}`);
    check('de bootstrap geeft de GEBRUIKERSruimte mee (zodat het eerste beeld op een nieuw toestel meteen klopt)', (await bootstrap(b)).weergave?.modus === 'light');
    check('de menuvoorkeuren bewaren wist het uiterlijk niet (één rij, twee losse velden)',
      (await b.verzoek('id.tarasevych.com', '/api/owner/ui/preferences/save', b.ctxBody('identity', { menu: [], language: 'nl' }))).status === 200 && (await bootstrap(b)).weergave?.modus === 'light');
    const teGroot = await opslaanS(b, { modus: 'light', auto: { soort: 'zon', plaats: 'x'.repeat(9000) } });
    check('een te grote waarde wordt geweigerd (413), de opgeslagen stand blijft', teGroot.status === 413 && (await lezenS(b)).data.weergave?.palet === 'puur', `${teGroot.status}`);

    await tp.activeren(eigUser, b.tab, 60, 'eenheidstest uiterlijk per profiel');
    const techOk = await opslaanS(b, { modus: 'dark', palet: 'grifel' }, 'technisch');
    check('met lopend technisch profiel: eigen uiterlijk opslaan, ruimte «technisch»',
      techOk.status === 200 && techOk.data.ruimte === 'technisch' && techOk.data.weergave?.palet === 'grifel', `${techOk.status} ${techOk.body.slice(0, 160)}`);
    check('de gebruikersruimte is NIET veranderd door het technische profiel', (await lezenS(b)).data.weergave?.palet === 'puur' && (await bootstrap(b)).weergave?.modus === 'light');
    check('en omgekeerd: de gebruikersruimte opslaan laat het technische uiterlijk staan',
      (await opslaanS(b, { modus: 'auto' })).status === 200 && (await lezenS(b, 'technisch')).data.weergave?.palet === 'grifel');
    check('de bootstrap bevat nooit de technische stand', (await bootstrap(b)).weergave?.palet !== 'grifel');

    const b2 = G.browser();
    b2.jar.clear(); for (const [k, v] of b.jar) b2.jar.set(k, v); // zelfde browser/sessie, ander tabblad
    check('ander tabblad zonder eigen activering: het technische uiterlijk geweigerd (ook voor de eigenaar)', (await lezenS(b2, 'technisch')).status === 403);

    const b3 = G.browser();
    await b3.aanmelden(`sub-wpa-gew-${T}`, gewoon, { service: 'identity', intent: 'login' });
    const gewId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [gewoon])).rows[0]?.id as string | undefined;
    if (gewId) await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where id=$1", [gewId]);
    check('gewoon account: het technische uiterlijk geweigerd', [401, 403].includes((await lezenS(b3, 'technisch')).status));
    const gewGeb = await lezenS(b3);
    check('gewoon account: eigen (leeg) uiterlijk, nooit dat van de eigenaar', gewGeb.status === 200 && !gewGeb.data.weergave?.palet, `${gewGeb.status} ${gewGeb.body.slice(0, 160)}`);
    const rij = (await pool.query("select data->'weergave' as w from app.records where tbl='owner_ui_preferences_v1' and data->>'userId'=$1", [eigUser.id])).rows[0]?.w as { versie?: number; gebruiker?: { modus?: string; palet?: string }; technisch?: { modus?: string; palet?: string } } | undefined;
    check('database: één veld «weergave» met BEIDE ruimtes apart (versie 2); opslaan vervangt alleen de eigen ruimte',
      rij?.versie === 2 && rij?.gebruiker?.modus === 'auto' && !rij?.gebruiker?.palet && rij?.technisch?.palet === 'grifel' && rij?.technisch?.modus === 'dark', JSON.stringify(rij).slice(0, 200));
    const srv = readFileSync('backend/index.ts', 'utf8');
    check('server: één veld per account met metUiterlijkRuimte/uiterlijkVoorRuimte, zelfde poort (ownerMenuRuimte) als het menu',
      /const weergave=metUiterlijkRuimte\(current\?\.weergave,ruimte,value\)/.test(srv) && /return uiterlijkVoorRuimte\(row\?\.weergave,ruimte\)/.test(srv)
      && /weergave:row\?\.weergave\?uiterlijkVoorRuimte\(row\.weergave,'gebruiker'\)/.test(srv));
  } catch (e) {
    check('onverwachte fout (server)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar, gewoon]])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await getPool('systeem').query('delete from app.tech_activaties where user_id = any($1)', [ids]).catch(() => undefined);
      await getPool('systeem').query('delete from app.tech_profielen where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1)", [ids]);
    }
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
    await closePool();
  }

  // ================================================================ 3. migratie van de bestaande gedeelde waarde (punt 3)
  const { ss, koek } = nepBrowser();
  koek.zet(COOKIE, encodeURIComponent(JSON.stringify({ lang: 'nl', theme: 'dark', palet: 'puur', avatarUrl: 'https://lh3.googleusercontent.com/foto', notificationBellPosition: { x: 0.1, y: 0.2 }, lastPathByService: { mail: '/inbox' }, accountKeyByService: { hub: A, mail: A }, revision: 1 })));
  const sp = await import('../../src/gedeelde-voorkeuren');
  sp.migrateLegacyPresentationStorage();
  const naMigratie = sp.readSharedPreferences();
  check('migratie: de oude gedeelde waarde is nu van het ACTIEVE account in de GEBRUIKERSRUIMTE (niets verloren)',
    sp.weergaveAccountNu() === A && sp.weergaveRuimteNu() === 'gebruiker' && naMigratie.theme === 'dark' && naMigratie.palet === 'puur' && naMigratie.lang === 'nl'
    && naMigratie.avatarUrl === 'https://lh3.googleusercontent.com/foto' && naMigratie.notificationBellPosition?.x === 0.1 && naMigratie.lastPathByService?.mail === '/inbox', JSON.stringify(naMigratie));
  const koekNa = uitCookie(koek.tekst());
  check('migratie: de cookie staat op versie 3, met een record per scope en geen gedeelde velden meer',
    Number(koekNa.versie) === 3 && !!koekNa.ruimtes?.[`${A}|gebruiker`] && koekNa.theme === undefined && koekNa.lang === undefined && koekNa.accountPerDienst?.hub === A, JSON.stringify(koekNa).slice(0, 240));
  sp.zetWeergaveRuimte('technisch');
  check('migratie: het TECHNISCH profiel krijgt de oude waarde NIET — het houdt zijn eigen standaard (donker grifel)',
    !koekNa.ruimtes?.[`${A}|technisch`] && sp.readSharedPreferences().theme === 'dark' && sp.readSharedPreferences().palet === 'grifel', JSON.stringify(sp.readSharedPreferences()));
  sp.zetWeergaveRuimte('gebruiker');
  sp.zetWeergaveAccount(B);
  check('migratie: een ANDER account krijgt de oude waarde niet (alleen het actieve account)',
    !sp.readSharedPreferences().theme && !sp.readSharedPreferences().palet && !sp.readSharedPreferences().lang, JSON.stringify(sp.readSharedPreferences()));
  sp.zetWeergaveAccount(A);

  // ================================================================ 4. wisselen van account en van profiel loopt niet door
  sp.zetWeergaveRuimte('technisch');
  sp.writeSharedPreferences({ theme: 'light', palet: 'violet' });
  check('technisch profiel: eigen keuze opgeslagen onder zijn eigen scope', sp.readSharedPreferences().theme === 'light' && sp.readSharedPreferences().palet === 'violet');
  sp.zetWeergaveRuimte('gebruiker');
  check('terug in de gebruikersruimte: nog steeds de eigen stand (de keuze van het technische profiel loopt niet door)',
    sp.readSharedPreferences().theme === 'dark' && sp.readSharedPreferences().palet === 'puur');
  sp.zetWeergaveAccount(B);
  sp.writeSharedPreferences({ theme: 'auto', palet: 'kleur', lang: 'uk' });
  check('account B: eigen thema, eigen taal; niets van A', sp.readSharedPreferences().theme === 'auto' && sp.readSharedPreferences().palet === 'kleur' && sp.readSharedPreferences().lang === 'uk');
  sp.zetWeergaveAccount(A);
  check('terug bij A: zijn eigen stand komt terug (en zijn taal)', sp.readSharedPreferences().theme === 'dark' && sp.readSharedPreferences().palet === 'puur' && sp.readSharedPreferences().lang === 'nl');
  sp.zetWeergaveAccount('anon');
  check('anonieme bezoeker: eigen record «anon», niets van een account',
    sp.weergaveAccountNu() === 'anon' && !sp.readSharedPreferences().theme && !sp.readSharedPreferences().lang, JSON.stringify(sp.readSharedPreferences()));
  sp.writeSharedPreferences({ theme: 'light' });
  sp.zetWeergaveAccount(A);
  const aNaAnon = sp.readSharedPreferences().theme;
  sp.zetWeergaveAccount(B);
  check('en wat de anonieme bezoeker kiest, verandert niets bij de accounts', aNaAnon === 'dark' && sp.readSharedPreferences().theme === 'auto');
  check('de accountkaart (welk account bij welke dienst) blijft globaal: die zegt juist WELKE scope geldt', sp.readSharedPreferences().accountKeyByService?.hub === A);
  check('de hints van dit tabblad staan in sessionStorage (dus per tabblad, nooit per browser)',
    ss.getItem('tsv-weergave-account') === sp.weergaveAccountNu() && ss.getItem('tsv-weergave-ruimte') === sp.weergaveRuimteNu());

  // ---- de server krijgt de wijziging, per ruimte, en alleen van het eigen account
  const sync2 = await import('../../src/weergave-uiterlijk');
  verzoeken.length = 0;
  sync2.weergaveVanServer({ modus: 'light', palet: 'puur' }, { service: 'hub', scope: 'gebruiker-A' });
  const accountVanServer = sp.weergaveAccountNu();
  check('bootstrap: de scope wordt de KORTE accountsleutel en de gebruikersruimte van de server wordt toegepast',
    /^u-[a-f0-9]{8}$/.test(accountVanServer) && sp.readSharedPreferences().theme === 'light' && sp.readSharedPreferences().palet === 'puur', `${accountVanServer} ${JSON.stringify(sp.readSharedPreferences())}`);
  verzoeken.length = 0;
  sp.writeSharedPreferences({ palet: 'grifel' });
  await wacht(600);
  const opslaan = verzoeken.filter((r) => r.url.includes('/api/owner/ui/weergave/save'));
  check('een wijziging gaat gebundeld naar de server, met de ruimte van dit tabblad',
    opslaan.length === 1 && opslaan[0].body.ruimte === 'gebruiker' && (opslaan[0].body.weergave as { palet?: string }).palet === 'grifel', JSON.stringify(opslaan[0]?.body || {}).slice(0, 200));
  check('`routeBeeld` (alleen een skelet-hint van deze browser) gaat NIET naar de server', !JSON.stringify(opslaan[0]?.body || {}).includes('routeBeeld'));
  verzoeken.length = 0;
  sync2.weergaveVanServer(undefined, { service: 'hub', scope: 'gebruiker-B' });
  sp.writeSharedPreferences({ theme: 'dark' });
  await wacht(600);
  const naWissel = verzoeken.filter((r) => r.url.includes('/api/owner/ui/weergave/save'));
  check('na een accountwissel wordt niets van de vorige verstuurd; de opslag gaat op naam van het NIEUWE account',
    naWissel.length === 1 && (naWissel[0].body.weergave as { palet?: string }).palet !== 'grifel' && (naWissel[0].body.weergave as { modus?: string }).modus === 'dark', JSON.stringify(naWissel.map((r) => r.body.weergave)).slice(0, 200));
  verzoeken.length = 0;
  sync2.weergaveVanServer(null, null);
  sp.writeSharedPreferences({ theme: 'light' });
  await wacht(500);
  check('afgemeld: een wijziging blijft lokaal (geen enkel verzoek)', verzoeken.length === 0, verzoeken.map((r) => r.url).join(', '));

  // ================================================================ 5. het EERSTE BEELD (geen flits, geen sprong)
  const html = readFileSync('index.html', 'utf8');
  check('het thema wordt gezet in het inline script in <head>, dus vóór het eerste malen (en vóór de app-bundel)',
    html.indexOf('<script id="presentation-init">') < html.indexOf('</head>') && html.indexOf('</head>') < html.indexOf('<body') && html.indexOf('</head>') < html.indexOf('src="./src/main.tsx"'));
  const cookieV3 = encodeURIComponent(JSON.stringify({
    versie: 3, revisie: 2, accountPerDienst: { hub: A },
    accounts: { [A]: { versie: 1, taal: 'nl' }, [B]: { versie: 1, taal: 'uk' } },
    ruimtes: { [`${A}|gebruiker`]: { versie: 1, modus: 'dark', palet: 'puur' }, [`${A}|technisch`]: { versie: 1, modus: 'light', palet: 'violet' }, [`${B}|gebruiker`]: { versie: 1, modus: 'light', palet: 'kleur' } },
  }));
  const beeldA = eersteBeeld(cookieV3, {});
  check('eerste beeld: thema EN palet van het actieve account staan al op <html> (geen witte flits, geen sprong)',
    beeldA.klassen.has('theme-dark') && beeldA.klassen.has('palet-puur') && beeldA.wortel.dataset.presentationTheme === 'dark' && beeldA.wortel.style.colorScheme === 'dark', [...beeldA.klassen].join(' '));
  check('eerste beeld: de taal van het account (nl), niet die van een ander account', beeldA.wortel.lang === 'nl' && beeldA.presentatie.lang === 'nl');
  const beeldTech = eersteBeeld(cookieV3, { 'tsv-weergave-ruimte': 'technisch' });
  check('eerste beeld in het TECHNISCH profiel: meteen de eigen stand van dat profiel, niet die van de gebruikersruimte',
    beeldTech.klassen.has('theme-plum-light') && beeldTech.klassen.has('palet-violet') && !beeldTech.klassen.has('theme-dark'), [...beeldTech.klassen].join(' '));
  const beeldTechLeeg = eersteBeeld(encodeURIComponent(JSON.stringify({ versie: 3, revisie: 1, accountPerDienst: { hub: B }, accounts: {}, ruimtes: {} })), { 'tsv-weergave-ruimte': 'technisch' });
  check('eerste beeld in het technisch profiel zonder eigen keuze: de standaard van dat profiel (donker grifel), punt 4',
    beeldTechLeeg.klassen.has('theme-dark') && beeldTechLeeg.klassen.has('palet-grifel'), [...beeldTechLeeg.klassen].join(' '));
  const beeldB = eersteBeeld(cookieV3, { 'tsv-weergave-account': B });
  check('eerste beeld met een ander account in dit tabblad: zijn eigen thema en taal, nooit die van de ander',
    beeldB.klassen.has('theme-light') && beeldB.klassen.has('palet-kleur') && beeldB.wortel.lang === 'uk', `${[...beeldB.klassen].join(' ')} ${beeldB.wortel.lang}`);
  const beeldOud = eersteBeeld(encodeURIComponent(JSON.stringify({ lang: 'nl', theme: 'dark', palet: 'puur', accountKeyByService: { hub: A } })), {});
  check('eerste beeld met de OUDE cookie (nog niet gemigreerd): gewoon de oude waarde, dus ook tijdens de release geen flits',
    beeldOud.klassen.has('theme-dark') && beeldOud.klassen.has('palet-puur') && beeldOud.wortel.lang === 'nl' && beeldOud.presentatie.domainAccountKey === A, [...beeldOud.klassen].join(' '));

  // ================================================================ 6. de cookie blijft binnen de grens van de browser
  sync2.__weergaveReset();
  const accounts = ['u-1111111a', 'u-2222222b', 'u-3333333c', 'u-4444444d', 'u-5555555e'];
  for (const account of accounts) for (const ruimte of ['gebruiker', 'technisch'] as const) {
    sp.zetWeergaveAccount(account); sp.zetWeergaveRuimte(ruimte);
    sp.writeSharedPreferences({ ...vol(ruimte === 'technisch' ? 'light' : 'auto', ruimte === 'technisch' ? 'violet' : 'kleur'), lang: 'nl', avatarUrl: `https://lh3.googleusercontent.com/${account}/${'x'.repeat(200)}` } as never);
  }
  const laatsteKoek = koek.laatste(), inhoud = uitCookie(koek.tekst());
  const huidigeSleutel = `${sp.weergaveAccountNu()}|${sp.weergaveRuimteNu()}`;
  const waardeLengte = (laatsteKoek.split('; ')[0] || '').slice(COOKIE.length + 1).length;
  check(`cookie binnen de grens: ${laatsteKoek.length} tekens in totaal (< 4096) en de waarde ${waardeLengte} ≤ MAX_COOKIE (${sp.MAX_COOKIE})`,
    laatsteKoek.length < 4096 && waardeLengte <= sp.MAX_COOKIE && waardeLengte > 0, `${laatsteKoek.length} / ${waardeLengte}`);
  check(`cookie houdt hoogstens MAX_RUIMTES (${sp.MAX_RUIMTES}) scopes — 10 volle scopes passen nooit in één cookie`,
    Object.keys(inhoud.ruimtes || {}).length <= sp.MAX_RUIMTES && Object.keys(inhoud.ruimtes || {}).length >= 1, `${Object.keys(inhoud.ruimtes || {}).length} scopes`);
  check('de scope van DIT tabblad staat altijd in de cookie, met thema en palet (dat heeft het eerste beeld nodig)',
    !!inhoud.ruimtes?.[huidigeSleutel] && inhoud.ruimtes[huidigeSleutel].modus === 'light' && inhoud.ruimtes[huidigeSleutel].palet === 'violet', `${huidigeSleutel}: ${JSON.stringify(inhoud.ruimtes?.[huidigeSleutel])}`);
  check('sessionStorage (geen grens van 4 kB) houdt alle scopes van dit tabblad: lokaal gaat niets verloren',
    Object.keys(sp.leesOpslag().ruimtes).length > Object.keys(inhoud.ruimtes || {}).length, `${Object.keys(sp.leesOpslag().ruimtes).length} vs ${Object.keys(inhoud.ruimtes || {}).length}`);
  check('alle scopes blijven apart: geen enkele scope kreeg de waarden van een andere',
    accounts.every((account) => sp.uiterlijkVanScope(account, 'technisch').palet === 'violet' && sp.uiterlijkVanScope(account, 'gebruiker').palet === 'kleur'
      && sp.uiterlijkVanAccount(account).avatar?.includes(account)));
  return einde();
}
