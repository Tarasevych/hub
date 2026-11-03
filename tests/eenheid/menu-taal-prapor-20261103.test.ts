// INTEG-001 (onderdeel «menu»): accountmenu, taal en vlaggen. Meet echte waarden, geen losse tekst uit de bron waar dat kan:
//   A. de twee vlag-bestanden (SVG) en het ene component MoviPrapor, echt gerenderd met react-dom/server;
//   B. de korte taalnaam: «укр.» (nooit «UA»), op alle plekken waar de taal gekozen wordt;
//   C. het accountmenu op het aanmeldscherm, echt gerenderd (afgemeld): echte vlag-<img>, «укр.», geen emoji;
//   D. thema: kleuren van het menu komen uit de themavariabelen; contrast van de hover-paren uit de echte tokenwaarden (4 thema's);
//   E. hover van de accountlijst (hele rij), kop van de uitgeklapte lijst, «по центру» op de telefoon, afstand taal ↔ thema.
// Zonder DATABASE_URL: dit bestand gebruikt geen database.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');
const zonderCommentaar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');

// ── contrast uit hex (WCAG) ──
const hex = (h: string) => { let d = h.trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(d)) d = d.split('').map((c) => c + c).join(''); const m = /^([0-9a-f]{6})$/i.exec(d); if (!m) throw new Error(`geen hex: ${h}`); const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: string, b: string) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-taal-prapor-20261103');

  // ═══ A. SVG-bestanden + component ═══
  const ua = lees('src/taalvlaggen/oekraine.svg'), be = lees('src/taalvlaggen/belgie.svg');
  check('vlag UA: SVG-bestand, 3:2, blauw boven en geel onder', /^<svg [^>]*viewBox="0 0 24 16"/.test(ua) && /<rect width="24" height="8" fill="#0057B7"\/>/.test(ua) && /<rect y="8" width="24" height="8" fill="#FFD700"\/>/.test(ua));
  check('vlag NL (België, wens van de eigenaar): SVG-bestand, zwart-geel-rood verticaal', /^<svg [^>]*viewBox="0 0 24 16"/.test(be)
    && /<rect width="8" height="16" fill="#000000"\/>/.test(be) && /<rect x="8" width="8" height="16" fill="#FAE042"\/>/.test(be) && /<rect x="16" width="8" height="16" fill="#ED2939"\/>/.test(be));
  check('vlag-bestanden: geen script, geen externe verwijzing, geen tekst/emoji', ![ua, be].some((s) => /<script|href=|xlink|<text|http:\/\/(?!www\.w3\.org)/.test(s)) && ![ua, be].some((s) => /[\u{1F1E6}-\u{1F1FF}]/u.test(s)));
  const { default: MoviPrapor, MoviPrapor: benoemd, MOVA_NAAM, MOVA_VOLLEDIG, PRAPOR_BRON } = await import('../../src/MoviPrapor');
  check('component: default en benoemde export zijn hetzelfde (stabiele naam MoviPrapor)', MoviPrapor === benoemd && typeof MoviPrapor === 'function');
  const kaal = (el: unknown) => renderToStaticMarkup(el as never);
  const hUk = kaal(createElement(MoviPrapor, { taal: 'uk' })), hNl = kaal(createElement(MoviPrapor, { taal: 'nl' }));
  check('component uk: <img> met oekraine.svg, decoratief (alt leeg, aria-hidden), maat 24×16', /<img /.test(hUk) && hUk.includes('alt=""') && hUk.includes('aria-hidden="true"') && hUk.includes('width="24"') && hUk.includes('height="16"') && /src="[^"]*oekraine\.svg"/.test(hUk) && hUk.includes('data-movi-prapor="uk"'), hUk.slice(0, 160));
  check('component nl: <img> met belgie.svg', /src="[^"]*belgie\.svg"/.test(hNl) && hNl.includes('data-movi-prapor="nl"'));
  check('component: ook `lang` werkt (zelfde naam als de rest van de UI), `taal` wint, standaard uk', /belgie\.svg/.test(kaal(createElement(MoviPrapor, { lang: 'nl' }))) && /oekraine\.svg/.test(kaal(createElement(MoviPrapor, { taal: 'uk', lang: 'nl' }))) && /oekraine\.svg/.test(kaal(createElement(MoviPrapor, {}))));
  check('component: haken voor CSS (taal-vlag, language-flag) en extra klasse blijven staan', hUk.includes('taal-vlag taal-vlag-uk language-flag language-flag-uk') && kaal(createElement(MoviPrapor, { taal: 'uk', className: 'extra' })).includes('language-flag-uk extra'));
  check('component: bronnen verwijzen naar de bestanden', PRAPOR_BRON.uk.endsWith('/taalvlaggen/oekraine.svg') && PRAPOR_BRON.nl.endsWith('/taalvlaggen/belgie.svg'));
  check('component: geen emoji-vlag en geen eigen SVG-kopie in de code', !/[\u{1F1E6}-\u{1F1FF}]/u.test(lees('src/MoviPrapor.tsx')) && !/<svg|<rect/.test(zonderCommentaar(lees('src/MoviPrapor.tsx'))));
  const oud = lees('src/TaalVlag.tsx');
  check('oude naam TaalVlag.tsx tekent niets meer: alleen een doorverwijzing naar MoviPrapor', /export \{[^}]*default[^}]*\} from '\.\/MoviPrapor'/.test(oud) && !/<svg|<img/.test(zonderCommentaar(oud)));
  const taalCss = lees('src/taal-vlag.css');
  check('vlag-CSS: eigen maat 1,5em × 1em, rand, nooit filter/mengmodus/doorzichtigheid', /\.taal-vlag\.taal-vlag\{[^}]*width:1\.5em;height:1em/.test(taalCss) && /filter:none/.test(taalCss) && /mix-blend-mode:normal/.test(taalCss) && /opacity:1/.test(taalCss));

  // ═══ B. korte taalnaam ═══
  check('taalnaam: uk = «укр.», nl = «NL»; volledige namen in de eigen taal', MOVA_NAAM.uk === 'укр.' && MOVA_NAAM.nl === 'NL' && MOVA_VOLLEDIG.uk === 'Українська' && MOVA_VOLLEDIG.nl === 'Nederlands');
  const menu = lees('src/CanoniekAccountMenu.tsx'), gast = lees('src/GastToegang.tsx'), invoer = lees('src/MailInvoerHulpmiddelen.tsx'), instel = lees('src/InstellingencentrumWeergave.tsx');
  const kaartLabels = (t: string) => zonderCommentaar(t).match(/>\s*UA\s*<|'UA'|"UA"|>Укр\.<|'Укр\.'/g) || [];
  check('nergens het label «UA» of «Укр.» meer in accountmenu, gastpagina, invoerhulp en instellingen', [menu, gast, invoer, instel].every((t) => kaartLabels(t).length === 0), [menu, gast, invoer, instel].map((t) => kaartLabels(t).length).join(','));
  check('accountmenu: oude menu, v2 en afgemeld menu gebruiken MoviPrapor + MOVA_NAAM (geen LanguageFlag meer)',
    (menu.match(/<MoviPrapor taal=/g) || []).length === 5 && (menu.match(/\{MOVA_NAAM[.[]/g) || []).length >= 5 && !/LanguageFlag/.test(menu));
  check('gastpagina en invoerhulp tonen «укр.» uit dezelfde bron', gast.includes('<MoviPrapor taal=') && gast.includes('MOVA_NAAM[') && invoer.includes('{MOVA_NAAM.uk}'));
  check('instellingencentrum gebruikt MoviPrapor voor de taalkeuze', (instel.match(/<MoviPrapor taal='(uk|nl)'\/>/g) || []).length === 2 && !/LanguageFlag/.test(instel));
  check('geen emoji-vlag meer in src', !/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(['src/CanoniekAccountMenu.tsx', 'src/GastToegang.tsx', 'src/MailInvoerHulpmiddelen.tsx', 'src/InstellingencentrumWeergave.tsx', 'src/CanoniekOmlijsting.tsx', 'src/MoviPrapor.tsx'].map(lees).join('\n')));

  // ═══ C. het menu echt gerenderd (afgemeld: de snelknoppen op het aanmeldscherm) ═══
  // De menu-modules lezen bij het laden window/document/opslag; tijdelijke nepversies, na afloop precies teruggezet (andere tests delen het proces).
  const g = globalThis as unknown as Record<string, unknown>;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
  const neppe: Record<string, unknown> = {
    window: g, localStorage: opslag(), sessionStorage: opslag(), matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    location: { href: 'https://hub.tarasevych.com/', hostname: 'hub.tarasevych.com', origin: 'https://hub.tarasevych.com', host: 'hub.tarasevych.com', pathname: '/', search: '', hash: '', protocol: 'https:' },
    document: { addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {}, classList: { add() {}, remove() {} } }), documentElement: { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, style: {}, lang: 'uk' }, head: { appendChild() {} }, body: { appendChild() {} }, cookie: '', visibilityState: 'visible', referrer: '' },
  };
  const bewaard = new Map<string, PropertyDescriptor | undefined>();
  for (const k of Object.keys(neppe)) { bewaard.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: neppe[k], configurable: true, writable: true }); }
  try {
    new Function(lees('public/canonical-service.js'))(); // zet window.__TSV_CANONICAL_SERVICE__ (de schil leest het bij het laden)
    const { default: Menu } = await import('../../src/CanoniekAccountMenu');
    const noop = () => undefined;
    const props = (lang: 'uk' | 'nl') => ({ lang, theme: 'light' as const, user: null, onAddAccount: noop, onLanguage: noop, onTheme: noop });
    const uk = renderToStaticMarkup(createElement(Menu, props('uk') as never)), nl = renderToStaticMarkup(createElement(Menu, props('nl') as never));
    check('afgemeld menu uk: taalknop met echte vlag (<img>), «укр.», themaknop erbij, geen UA', /class="mr-sign-in-taal"[^>]*>[\s\S]*?<img [^>]*oekraine\.svg[^>]*><b>укр\.<\/b>/.test(uk) && !/>UA</.test(uk) && /Перемкнути тему/.test(uk), uk.slice(0, 200));
    check('afgemeld menu nl: België-vlag en «NL», aria-label noemt «укр.» niet', /<img [^>]*belgie\.svg[^>]*><b>NL<\/b>/.test(nl) && !nl.includes('укр.'));
    check('afgemeld menu: geen emoji-vlag in de uitvoer', !/[\u{1F1E6}-\u{1F1FF}]/u.test(uk + nl));
    check('afgemeld menu: de taalknop staat vóór de themaknop (twee losse knoppen, geen samengestelde)', uk.indexOf('mr-sign-in-taal') > 0 && uk.indexOf('mr-sign-in-taal') < uk.indexOf('Перемкнути тему'));
  } catch (e) {
    check('afgemeld menu: rendert met react-dom/server', false, String((e as Error)?.stack || e).slice(0, 300));
  } finally {
    for (const [k, d] of bewaard) { if (d) Object.defineProperty(globalThis, k, d); else delete g[k]; }
    delete g.__TSV_CANONICAL_SERVICE__;
  }

  // ═══ D. thema ═══
  const tokens = lees('src/ontwerp/tokens.css');
  const thema = (klasse: string) => {
    const r = new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`).exec(tokens.split('\n').filter((l) => l.startsWith(`.${klasse} {`) || l.startsWith(`:root, .${klasse} {`) || l.startsWith(`.${klasse},`)).join('\n'));
    const v: Record<string, string> = {}; for (const m of (r?.[1] || '').matchAll(/--([a-zA-Z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) v[m[1]] = m[2]; return v;
  };
  for (const k of ['theme-light', 'theme-dark', 'theme-plum-light', 'theme-plum-dark']) {
    const t = thema(k);
    const ok = ['panel', 'surface', 'text', 'muted', 'accent'].every((n) => !!t[n]);
    check(`thema ${k}: tokens gevonden (panel, surface, text, muted, accent)`, ok, Object.keys(t).join(','));
    if (!ok) continue;
    // hover van een accountrij = achtergrond --surface; tekst --text (naam), --muted (e-mail), --accent (status)
    check(`thema ${k}: hover-rij leesbaar — naam ≥ 7, e-mail ≥ 4.5, status ≥ 4.5`, contrast(t.text, t.surface) >= 7 && contrast(t.muted, t.surface) >= 4.5 && contrast(t.accent, t.surface) >= 4.5,
      `naam ${contrast(t.text, t.surface).toFixed(2)} e-mail ${contrast(t.muted, t.surface).toFixed(2)} status ${contrast(t.accent, t.surface).toFixed(2)}`);
    check(`thema ${k}: paneel en tekst scheiden (≥ 7) — het paneel kan nooit «altijd donker» zijn zonder lichte tekst`, contrast(t.text, t.panel) >= 7, contrast(t.text, t.panel).toFixed(2));
  }
  const menuCss = lees('src/canoniek-account-menu.css'), v2Css = lees('src/accountmenu-v2/accountmenu-v2.css'), loginCss = lees('src/aanmeld-herontwerp.css'), middenCss = lees('src/account-paneel-midden.css');
  const regels = (css: string) => zonderCommentaar(css).split('}').map((r) => r.trim()).filter((r) => r.includes('{'));
  const paneelRegels = regels(menuCss).filter((r) => /canonical-account-panel\s*\{/.test(r));
  const kleurDecl = paneelRegels.flatMap((r) => (r.split('{')[1] || '').split(';')).filter((d) => /^\s*(background|background-color|color)\s*:/.test(d));
  check('paneel: achtergrond en tekst komen uit de themavariabelen (geen vaste hex/rgb in .canonical-account-panel)', kleurDecl.length >= 2 && kleurDecl.every((d) => /var\(--canonical-/.test(d)) && !kleurDecl.some((d) => /#[0-9a-f]{3,8}\b|rgb\(/i.test(d)), kleurDecl.join(' | '));
  check('paneel: geen vaste donkere kleur in de menu-CSS (alleen camera-knop/foutkleuren per thema)', !/\.canonical-account-(panel|list|row|select)[^{]*\{[^}]*(background|color):\s*#(0|1|2)[0-9a-f]{5}/i.test(zonderCommentaar(menuCss)));
  check('foutmeldingen in het paneel gebruiken --fout (leesbaar in elk thema), niet een vaste #a33b43', !menuCss.includes('#a33b43') && /\.canonical-account-state\.error\{color:var\(--fout\)/.test(menuCss) && /\.canonical-profile-photo-error\{[^}]*color:var\(--fout\)/.test(menuCss));
  check('de schil zet het themaklasse op .canonical-chrome en de menu-CSS leest alleen --canonical-* (aliassen van --panel/--surface/--text)',
    /--canonical-panel:var\(--panel\)/.test(tokens) && /--canonical-surface:var\(--surface\)/.test(tokens) && /--canonical-text:var\(--text\)/.test(tokens) && /--canonical-muted:var\(--muted\)/.test(tokens));
  check('afgemeld paneel: licht én donker thema hebben een eigen achtergrond uit --mr-login-sheet (geen vaste kleur)', /\.canonical-account-panel\{[^}]*background:color-mix\(in srgb,var\(--mr-login-sheet\) 90%,white\)/.test(zonderCommentaar(loginCss).replace(/\s+/g, ' '))
    && /theme-dark,\.theme-plum-dark\):has\(\.mr-sign-in\) \.canonical-account-panel\{background:color-mix\(in srgb,var\(--mr-login-sheet\) 94%,#43536b\)!important/.test(zonderCommentaar(loginCss).replace(/\s+/g, ' ')));
  // login-sheet per thema: inkt op paneel ≥ 7
  const sheetL = '#eff2f8', inktL = '#222b39', sheetD = '#1b222d', inktD = '#f1f4f8';
  check('aanmeldscherm: inkt op blad licht ≥ 7 en donker ≥ 7 (waarden uit aanmeld-herontwerp.css)', loginCss.includes(`--mr-login-sheet:${sheetL}`) && loginCss.includes(`--mr-login-ink:${inktL}`) && loginCss.includes(`--mr-login-sheet:${sheetD}`) && loginCss.includes(`--mr-login-ink:${inktD}`) && contrast(inktL, sheetL) >= 7 && contrast(inktD, sheetD) >= 7);

  // ═══ E. lijst, kop, «по центру», taalknop ═══
  check('accountlijst: hover/focus kleurt de HELE rij (geen aparte tint voor het linkerdeel; kruisje blijft in dezelfde tint)',
    /\.canonical-account-row:hover[^{]*,\.canonical-account-row:focus-within\{background:var\(--canonical-surface\)\}/.test(menuCss) && !/\.canonical-account-select:hover:not\(:disabled\)\{background/.test(menuCss));
  check('accountlijst: tekst blijft bij hover in tekst-/dempkleur van het thema', /\.canonical-account-row:hover \.canonical-account-copy strong[^{]*\{color:var\(--canonical-text\)\}/.test(menuCss) && /\.canonical-account-row:hover \.canonical-account-copy small[^{]*\{color:var\(--canonical-muted\)\}/.test(menuCss));
  check('accountlijst: zichtbare focusring (toetsenbord) op selectie- en vergeetknop', /\.canonical-account-select:focus-visible\{outline:2px solid var\(--canonical-accent\)/.test(menuCss) && /\.canonical-account-forget:focus-visible\{outline:2px solid var\(--canonical-accent\)/.test(menuCss));
  check('uitgeklapte lijst: de kop erft het lettertype van het menu (geen schreefletter van de globale h3-regel)', /\.canonical-expanded-accounts h3\{[^}]*font-family:inherit/.test(menuCss));
  check('v2-menu: taalkeuze compact (naar inhoud) met meer lucht tussen taal- en themarij; tikhoogte blijft 44 px', /\.am2-seg\.language-switch\{flex:0 1 auto/.test(v2Css) && /\.am2-seg\.language-switch button\{flex:0 0 auto;padding:0 16px\}/.test(v2Css) && /\.am2-weergave\{gap:10px/.test(v2Css) && /\.am2-seg button\{height:44px/.test(v2Css));
  check('v2-menu: vlag-wikkel zonder emoji-lettertype, zonder filter', !/Noto Color Emoji|Apple Color Emoji|Segoe UI Emoji/.test(v2Css) && /\.am2-vlag\{[^}]*filter:none!important/.test(v2Css));
  check('aanmeldscherm: taalknop is een kleine pil (≤ 34 px) en staat ≥ 12 px van de themaknop (38 px)',
    /\.mr-sign-in-quick-controls\{display:none;align-items:center;gap:12px\}/.test(loginCss) && /\.mr-sign-in-taal\{[^}]*height:32px/.test(loginCss) && /\.mr-sign-in-quick-controls button\{width:38px;height:38px/.test(loginCss));
  check('aanmeldtekst schuift niet meer naar links als het menu opent (de oude translateX-regel is weg)', !/translateX\(-min\(7vw,105px\)\)/.test(loginCss) && /\.mr-sign-in-content\{[^}]*transition:opacity/.test(loginCss));
  check('telefoon: menu op het aanmeldscherm staat in het midden (anker zo breed als het scherm, paneel left:50% + translateX(-50%))',
    /@media\(max-width:700px\)\{/.test(middenCss) && /\.mr-guest-mobile-account\{left:0;right:0;[^}]*padding:0 24px/.test(middenCss)
    && /\.canonical-account-panel\{left:50%;right:auto;transform:translateX\(-50%\);width:min\(370px,calc\(100% - 24px\)\)\}/.test(middenCss));
  check('telefoon: geen nieuw position:fixed-element (plaatsing-controle) in de nieuwe CSS', !/position\s*:\s*fixed/.test(zonderCommentaar(middenCss)));
  check('telefoon: de menu-CSS importeert het midden-bestand', menu.includes("import './account-paneel-midden.css'"));
  check('aanmeldscherm: boven 700 px blijft het paneel onder de avatar (right:0), alleen smalle schermen centreren', /@media\(max-width:700px\)/.test(middenCss) && /canonical-account-panel\{\s*right:0;top:50px/.test(loginCss.replace(/\s+/g, ' ').replace('{ right', '{ right')));

  // ═══ bestanden ═══
  check('bestanden aanwezig: SVG\'s, component, midden-CSS', ['src/taalvlaggen/oekraine.svg', 'src/taalvlaggen/belgie.svg', 'src/MoviPrapor.tsx', 'src/account-paneel-midden.css'].every((p) => existsSync(join(process.cwd(), p))));
  return einde();
}
