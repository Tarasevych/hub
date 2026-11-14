// INTEG-001 (03.11.2026) — aanmeldscherm en tumbler «Технічний простір», volgens de vijf wensen van de eigenaar:
//   1. het blad (en dus het logo en de knop) staat in het midden en steekt niet meer buiten beeld;
//   2. de knop zegt «Увійти через Google» met het OFFICIËLE gekleurde Google-«G» (letterlijk uit @iconify-json/logos, CC0);
//   3. de kleurrotatie loopt alleen tijdens het aanmelden of de controle (klik → profiel open), nooit bij hover;
//   4. «Інші способи входу» klapt GitHub, Apple, Microsoft en passkey uit, met merklogo's en een EERLIJKE stand die past bij wat
//      de server echt kan (gecontroleerd tegen de backendbronnen);
//   5. de ingang van de technische ruimte is één tumbler (role=switch), in beide standen dezelfde vorm.
// Weergave met react-dom/server (geen browser, geen DB). Draaien: node scripts/eenheidstests.mjs aanmelden-integ
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');

/** Minimale sessionStorage voor de node-omgeving. */
function nepOpslag() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0, m };
}

/** Nep-browser (zelfde opzet als ai-hub.test.ts): precies wat de schil en de tumbler bij het laden nodig hebben. Geeft een opruimfunctie. */
function nepBrowser(opslag: ReturnType<typeof nepOpslag>): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'navigator', 'matchMedia'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const u = new URL('https://hub.tarasevych.com/');
  const maakEl = () => ({ dataset: {}, style: { setProperty: () => undefined }, setAttribute: () => undefined, getAttribute: () => null, appendChild: () => undefined, addEventListener: () => undefined, getContext: () => null, classList: { add: () => undefined, remove: () => undefined, toggle: () => undefined, contains: () => false } });
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: () => undefined }, body: maakEl(),
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined, removeProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined, toggle: () => undefined }, addEventListener: () => undefined },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag; g.localStorage = nepOpslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  Object.defineProperty(g, 'navigator', { value: { language: 'uk-UA', userAgent: 'node', onLine: true }, configurable: true, writable: true });
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined });
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), matchMedia: g.matchMedia });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmelden-integ-20261103');
  const opslag = nepOpslag();
  const herstel = nepBrowser(opslag);
  try { return await toetsen(check, opslag); } finally { herstel(); }
  async function toetsen(check: (naam: string, ok: boolean, info?: string) => void, opslag: ReturnType<typeof nepOpslag>): Promise<number> {

  // ------------------------------------------------------------------ 2. officieel Google-«G»
  const g = await import('../../src/merk/google-g-officieel');
  const pak = JSON.parse(lees('node_modules/@iconify-json/logos/icons.json'));
  const versie = JSON.parse(lees('node_modules/@iconify-json/logos/package.json')).version;
  const ic = pak.icons['google-icon'];
  const w = ic.width ?? pak.width, h = ic.height ?? pak.height;
  const verwacht = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${ic.body}</svg>`;
  check('Google-«G» is letterlijk het bestand google-icon uit @iconify-json/logos (geen nagetekende vorm)', g.GOOGLE_G_SVG === verwacht);
  check('herkomst klopt: pakket, versie, licentie CC0-1.0 en sha256', g.GOOGLE_G_HERKOMST.pakket === '@iconify-json/logos' && g.GOOGLE_G_HERKOMST.versie === versie
    && g.GOOGLE_G_HERKOMST.licentie === 'CC0-1.0' && g.GOOGLE_G_HERKOMST.sha256 === createHash('sha256').update(g.GOOGLE_G_SVG).digest('hex'));
  check('vier merkkleuren van Google (blauw, groen, geel, rood), geen script of extern adres',
    ['#4285f4', '#34a853', '#fbbc05', '#eb4335'].every((k) => g.GOOGLE_G_SVG.toLowerCase().includes(k)) && !/<script|href=|url\(/i.test(g.GOOGLE_G_SVG));
  check('data-URI (CSP img-src staat data: toe) decodeert terug naar hetzelfde SVG',
    g.GOOGLE_G_DATA_URI.startsWith('data:image/svg+xml;charset=utf-8,') && decodeURIComponent(g.GOOGLE_G_DATA_URI.split(',').slice(1).join(',')) === g.GOOGLE_G_SVG);

  // ------------------------------------------------------------------ 2/3. SignedOutCenter
  const schil = await import('../../src/CanoniekOmlijsting');
  const { SignedOutCenter, aanmeldenBezig, zetAanmeldenBezig, AANMELD_BEZIG_SLEUTEL, AANMELD_BEZIG_MS } = schil;
  const teken = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(SignedOutCenter as any, { onOpenAccount: () => undefined, onRememberBrowser: () => undefined, ...p }));
  const ukUit = teken({ lang: 'uk' });
  const nlUit = teken({ lang: 'nl' });
  check('knop zegt meteen hoe: «Увійти через Google» / «Aanmelden met Google» (geen losse «Увійти»)',
    ukUit.includes('>Увійти через Google<') && nlUit.includes('>Aanmelden met Google<') && !ukUit.includes('>Увійти<') && !nlUit.includes('>Aanmelden<'));
  check('in de knop staat het officiële «G» als <img> met data-URI, decoratief (alt leeg, op een eigen witte plaat)',
    /<span class="mr-sign-in-logo" aria-hidden="true"><img src="data:image\/svg\+xml;charset=utf-8,[^"]+" alt="" width="18" height="18"/.test(ukUit));
  check('drie kolommen in vaste volgorde: logo → tekst → pijl', ukUit.indexOf('mr-sign-in-logo') < ukUit.indexOf('mr-sign-in-main-tekst') && ukUit.indexOf('mr-sign-in-main-tekst') < ukUit.indexOf('mr-sign-in-arrow'));
  check('rust: zonder aanmelding draait er niets (data-activated=false, aria-busy=false)', ukUit.includes('data-activated="false"') && ukUit.includes('aria-busy="false"'));
  check('«Інші способи входу» / «Andere aanmeldmethoden» staat er, dichtgeklapt', ukUit.includes('Інші способи входу') && nlUit.includes('Andere aanmeldmethoden') && ukUit.includes('aria-expanded="false"'));

  opslag.clear();
  const gewoneControle = teken({ lang: 'uk', checking: true });
  check('controle zonder eigen aanmelding (gewoon laden): alleen de rustige spinner, geen knop', gewoneControle.includes('canonical-checking-spinner') && !gewoneControle.includes('mr-sign-in-main-button'));
  opslag.setItem(AANMELD_BEZIG_SLEUTEL, String(Date.now() - 20_000));
  const terug = teken({ lang: 'uk', checking: true });
  check('terug van Google (aanmelding ≤ 5 min geleden begonnen): dezelfde knop draait, «Перевіряємо вхід…», niet nog eens klikbaar',
    terug.includes('data-activated="true"') && terug.includes('Перевіряємо вхід…') && terug.includes('aria-disabled="true"') && terug.includes('is-controle') && terug.includes('aria-busy="true"'));
  check('tijdens de controle geen andere keuzes (geen «Інші способи входу», geen opgeslagen account)', !terug.includes('Інші способи входу') && !terug.includes('mr-sign-in-account'));
  const nlTerug = teken({ lang: 'nl', checking: true });
  check('NL: «Aanmelding controleren…»', nlTerug.includes('Aanmelding controleren…'));
  opslag.setItem(AANMELD_BEZIG_SLEUTEL, String(Date.now() - AANMELD_BEZIG_MS - 1000));
  check('een oud merkteken (> 5 min) telt niet: dan gewoon de spinner', !aanmeldenBezig() && teken({ lang: 'uk', checking: true }).includes('canonical-checking-spinner'));
  zetAanmeldenBezig(true);
  check('zetAanmeldenBezig(true) bewaart alleen een tijdstempel', /^\d{13}$/.test(String(opslag.getItem(AANMELD_BEZIG_SLEUTEL))) && aanmeldenBezig());
  zetAanmeldenBezig(false);
  check('zetAanmeldenBezig(false) ruimt op', opslag.getItem(AANMELD_BEZIG_SLEUTEL) === null && !aanmeldenBezig());
  const bekend = teken({ lang: 'uk', preferredAccount: { name: 'Werk', email: 'werk@example.org' } });
  check('opgeslagen account: eigen knop vóór de Google-knop, die zelf niet draait', bekend.indexOf('mr-sign-in-account') < bekend.indexOf('mr-sign-in-main-button') && bekend.includes('data-activated="false"'));

  // Bron: de rotatie start alleen in de klikroute van de Google-knop, niet bij «open» (opgeslagen account) of hover.
  const bron = lees('src/CanoniekOmlijsting.tsx');
  const sig = bron.slice(bron.indexOf('export function SignedOutCenter('), bron.indexOf('export default function CanonicalChrome('));
  check('de knop met het opgeslagen account start geen rotatie (const open roept alleen onOpenAccount aan)', /const open=\(\)=>\{onOpenAccount\(\)\};/.test(sig));
  check('een mislukte start (pagina vertrekt niet) zet de rotatie meteen uit; bfcache-terugkeer ook', sig.includes("addEventListener('beforeunload'") && sig.includes('if(!vertrekt.current)stop()') && sig.includes("addEventListener('pageshow'") && sig.includes('e.persisted'));
  check('App geeft de belofte van de aanmeldstart door (geen void meer), de aanmeldfunctie zelf is dezelfde',
    lees('src/App.tsx').includes("onGoogle={()=>canonicalAuth.connect('login')}"));

  const css = lees('src/aanmeld-herontwerp.css');
  const regel = (sel: string) => { const i = css.indexOf(sel + '{'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  const hover = regel(".canonical-signed-out.mr-sign-in .mr-sign-in-main-button:hover,\n.canonical-signed-out.mr-sign-in .mr-sign-in-main-button:focus-visible");
  check('3. hover/focus: alleen een rustige rand, geen animatie of conic-gradient', hover.length > 0 && !/animation|conic-gradient/.test(hover));
  check('3. de rotatie (conic-gradient + animatie) zit uitsluitend op [data-activated=\'true\']',
    (css.match(/animation:mr-login-ring/g) || []).length === 1 && regel(".canonical-signed-out.mr-sign-in .mr-sign-in-main-button[data-activated='true']").includes('animation:mr-login-ring'));
  check('1. het aanmeldscherm vult 100% van het venster zonder buitenmarge, zonder binnenkader en zonder werkblad-achtergrond',
    css.includes('width:100%;max-width:none;min-height:100vh;min-height:100dvh') && css.includes('margin:0!important') && css.includes('border:0!important;border-radius:0!important;box-shadow:none!important')
    && css.includes('.canonical-chrome.schil-achtergrond:has(.mr-sign-in)::before{content:none!important') && css.includes('html body main.canonical-chrome:has(.mr-sign-in) .canonical-workspace'));
  check('1. de reserve van de zwevende stapel geeft op het aanmeldscherm geen extra hoogte', css.includes('.canonical-chrome:has(.mr-sign-in) .canonical-workspace::after{content:none!important;height:0!important}'));
  check('1. telefoonregel met dezelfde specificiteit als de hoofdregel houdt 0 px marge en een ronde avatarknop (38×38 px)',
    /@media\(max-width:700px\)\{[\s\S]*\.canonical-chrome\[data-surface-model='flat-content'\] \.canonical-content \.canonical-signed-out\.mr-sign-in\{\s*--mr-login-rand:0px/.test(css)
    && css.includes('button.canonical-avatar-trigger') && css.includes('min-height:38px'));
  check('2. logo-verhouding: «G» 18 px op een witte plaat van 34 px, kolommen 34px · 1fr · 34px',
    css.includes('.mr-sign-in-logo img{display:block;width:18px;height:18px') && /width:34px;height:34px;border-radius:50%;background:(var\(--papier\)|#fff)/.test(css) && css.includes('grid-template-columns:34px minmax(0,1fr) 34px'));
  check('4. optieknoppen winnen van de oude algemene regel «.canonical-signed-out button»', css.includes('.canonical-signed-out.mr-sign-in .mr-sign-in-optie{') && !/\n\.mr-sign-in-optie\{/.test(css));

  // ------------------------------------------------------------------ 4. andere aanmeldwegen
  const andere = await import('../../src/AanmeldAndereOpties');
  const ids = andere.AANMELD_INGANGEN.map((x) => x.id).join(',');
  check('4. volgorde van de eigenaar: GitHub, Apple, Microsoft, passkey — Google niet dubbel', ids === 'github,apple,microsoft,passkey');
  // TELEGRAM-001 (09.11.2026): власник вимагає жодної англійської — «passkey» → «ключ доступу».
  check('4. passkey met de woorden van de eigenaar (zonder Engels sinds 09.11)', andere.AANMELD_INGANGEN[3].titel[0] === 'Підтвердіть відбитком, обличчям, PIN-кодом або телефоном, на якому збережено ключ доступу');
  // IDENTITEIT-015 (aanmelden, 14.11.2026): ключ доступу, Apple й Microsoft ТЕПЕР можуть дати сеанс — але лише за прапорцями власника
  // (backend/aanmelden-methoden.ts). Тому перевірка змінилася законно: статичний список і далі — вимкнені рядки з причиною; робочий спосіб
  // з'являється лише як справжня кнопка через `extra`, коли сервер назвав його в /config → methoden (src/CanoniekOmlijsting.tsx).
  // Eerlijkheid: GitHub blijft een dienst; de andere drie geven pas een sessie via de vlaggen, nooit via deze statische lijst.
  const koppel = lees('backend/aanmeld-koppel.ts'), methoden = lees('backend/aanmelden-methoden.ts'), schilBron = lees('src/CanoniekOmlijsting.tsx'), gh = lees('backend/github-oauth.ts');
  const alleenViaServer = koppel.includes('het geeft zelf GEEN sessies uit') && methoden.includes("vlagPubliek(WEG_VLAG.passkey)") && schilBron.includes('werkendZonderGoogle') && gh.includes('Echte OAuth-koppeling met GitHub');
  check('4. eerlijk: zonder bericht van de server zijn alle vier uitgeschakeld met reden; werkende wegen komen alleen via de server (methoden)', alleenViaServer && andere.AANMELD_INGANGEN.every((x) => !x.beschikbaar && x.reden[0].length > 30 && x.reden[1].length > 30));
  // Het merkregister laadt lui (in de browser direct na het openklappen); hier eerst laden, zoals de pagina het doet.
  const reg = await import('../../src/merk/merk-register');
  await reg.laadMerken(); await reg.laadOfficieel();
  const lijst = (lang: 'uk' | 'nl') => renderToStaticMarkup(createElement(andere.default, { lang, standaardOpen: true }));
  const ukLijst = lijst('uk'), nlLijst = lijst('nl');
  const knoppen = ukLijst.match(/<button[^>]*class="mr-sign-in-optie[^"]*"[^>]*>/g) || [];
  check('4. vier knoppen, elk disabled met aria-describedby naar de zichtbare reden', knoppen.length === 4 && knoppen.every((k) => / disabled=""/.test(k) && /aria-describedby="mr-andere-/.test(k)));
  check('4. elke knop zegt «Недоступно» / «Niet beschikbaar»', (ukLijst.match(/>Недоступно</g) || []).length === 4 && (nlLijst.match(/>Niet beschikbaar</g) || []).length === 4);
  check('4. merklogo\'s via het merkregister (GitHub, Apple, Microsoft); passkey met neutraal pictogram',
    /data-merk="GitHub"/.test(ukLijst) && /data-merk="Apple"/.test(ukLijst) && /data-merk(-naam)?="Microsoft"/.test(ukLijst) && ukLijst.includes('lucide-fingerprint'));
  check('4. titels uk/nl', ['Увійти через GitHub', 'Увійти через Apple', 'Увійти через Microsoft'].every((s) => ukLijst.includes(s)) && ['Aanmelden met GitHub', 'Aanmelden met Apple', 'Aanmelden met Microsoft', 'Bevestig met vingerafdruk'].every((s) => nlLijst.includes(s)));
  check('4. geen Engelse UI-tekst in de lijst (alleen merknamen en «passkey»)', !/\b(Sign in|Log in|Unavailable|Not available|Continue)\b/i.test(ukLijst + nlLijst));

  // ------------------------------------------------------------------ 5. tumbler «Технічний простір»
  const rw = await import('../../src/tech/ruimtes/RuimteWissel');
  const nu = Date.now();
  const stand = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(rw.RuimteSchakelaar as any, { nu, taal: 'uk', onKies: () => undefined, ...p }));
  const uit = stand({ status: { actief: 'prive', pauze: false, sessie: null, technischToegestaan: true } });
  const aan = stand({ status: { actief: 'technisch', pauze: false, sessie: { modus: 'tijd', eindTijd: nu + 36e5, gestartOp: nu }, technischToegestaan: true } });
  const vorm = (html: string) => html.replace(/aria-checked="(true|false)"/, '').replace(/data-[a-z-]+="[^"]*"/g, '').replace(/title="[^"]*"/, '').replace(/aria-keyshortcuts="[^"]*"/, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/>[^<]*</g, '><');
  check('5. één knop met role=switch (geen twee losse knoppen meer)', (uit.match(/<button/g) || []).length === 2 /* tumbler + ⓘ */ && (uit.match(/role="switch"/g) || []).length === 1 && !uit.includes('role="radio"'));
  check('5. uit: aria-checked=false, «вимкнено», bolletje links (zelfde element)', uit.includes('aria-checked="false"') && uit.includes('>вимкнено<') && uit.includes('data-naar="technisch"'));
  check('5. aan: aria-checked=true, «увімкнено»', aan.includes('aria-checked="true"') && aan.includes('>увімкнено<') && aan.includes('data-naar="prive"'));
  check('5. beide standen hebben exact dezelfde opbouw (spoor, bolletje, naam, stand) — alleen de stand verschilt', vorm(uit) === vorm(aan) && uit.includes('rw-spoor') && uit.includes('rw-bol') && uit.includes('>Технічний простір<'));
  const geen = stand({ status: { actief: 'prive', pauze: false, sessie: null, technischToegestaan: false } });
  check('5. zonder recht: aria-disabled + slotje + eerlijke reden', geen.includes('aria-disabled="true"') && geen.includes('lucide-lock') && geen.includes('Немає дозволу на технічний простір'));
  check('5. NL-tekst', stand({ taal: 'nl', status: { actief: 'prive', pauze: false, sessie: null, technischToegestaan: true } }).includes('>Technische ruimte<'));
  const rcss = lees('src/tech/ruimtes/ruimtes.css');
  check('5. CSS: het bolletje schuift bij aan (translateX), spoor kleurt mee; oude segmentregels weg',
    rcss.includes('.rw-schakel[aria-checked=true] .rw-bol{transform:translateX(24px)') && !/\.rw-seg|\.rw-schuif|\.rw-knop\b/.test(rcss));
  const toegang = lees('src/tech/ruimtes/ToegangPagina.tsx');
  check('5. «Доступ і терміни»: geen aparte knop «Увійти в технічний простір» naast de tumbler; «Змінити термін» blijft bij een sessie',
    !toegang.includes("'Увійти в технічний простір'") && toegang.includes("{s.sessie ? <button type='button' onClick={() => openTechVenster('activeren')} data-rt-knop='termijn'>"));

  return einde();
  }
}
