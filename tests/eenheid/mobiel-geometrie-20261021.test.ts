// Eenheidstest 21.10.2026 — geometrie op de telefoon en de tablet (stand «knipsels» 20.10: ДО → ПІСЛЯ → MOBIEL-CHECK).
//
// WAT ER MIS WAS (bewezen met de stand, tests/e2e/stand-knipsels-20261020.mjs):
//  1. mail/accounts op 390: raster inline `minmax(0,1fr) 320px` → hoofdkolom 0 px (begroeting letter voor letter verticaal) en de
//     rechterkolom lag over de tegels («<div>…</div> intercepts pointer events»: alle 6 stappen mail-koppelvenster-* faalden);
//  2. toestemmingsvenster op 390: inhoud 414 px in 372 px (kinderen zonder min-width:0);
//  3. /agenten: `nav.ag-tabs` 1073 px in 307 px, zijwaarts scrollen zonder hint;
//  4. canonical-workspace op 768: 915 > 753 — .ag-sr-spans (position:absolute) in de matrixtabel ontsnapten aan de scrollcontainer;
//  5. overlap: v2b-kaart (1280) «Дії для агента» ⟂ «Низький ризик»; zoekknop van de mail 4 px over het zoekveld (768/1280);
//  6. tikvlakken < 44 px op de telefoon (submenu 34, camera 30×44, info-tip 18×18, tech-band 34, …);
//  7. letters < 12 px (8–10 px in mail/instellingen, 10–11 px in hub-widgets; preflight `small{80%}` won van het fundament);
//  8. horizontaal scrollen (mail-instellingen nav 1014 px, admin-apparaten 920 px, accountpaneel 284 > 268, admin-ai 787 > 390, …).
// Deze test legt de CSS-/markupregels vast die dat oplossen. De getallen (ДО/ПІСЛЯ) staan in het verslag van de stand.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { isTechModule } from '../../shared/tech-bundels';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;

export async function main(): Promise<number> {
  const { check, einde } = checker('mobiel-geometrie-20261021');

  // ------------------------------------------------------------------ 1. mail/accounts
  const hub = lees('src/MailAccountsHub.tsx'), hubCss = zc(lees('src/mail-accounts-hub.css'));
  check('1 MailAccountsHub: geen inline raster «minmax(0,1fr) 320px» meer; layout in mail-accounts-hub.css', !hub.includes("gridTemplateColumns: 'minmax(0,1fr) 320px'") && hub.includes("import './mail-accounts-hub.css'") && hub.includes("<div className='mail-accounts-hub'>"));
  check('1 raster: standaard één kolom, twee kolommen pas vanaf 1100 px (dan 320 px als maximum, niet als vaste breedte)', /\.mail-accounts-hub\{display:grid;grid-template-columns:minmax\(0,1fr\);/.test(hubCss) && /@media \(min-width:1100px\)\{\.mail-accounts-hub\{grid-template-columns:minmax\(0,1fr\) minmax\(0,320px\)\}\}/.test(hubCss));
  check('1 de uitlegkolom is een <aside> ná de tegels (in één kolom eronder, nooit eroverheen)', hub.includes("<aside className='mail-accounts-kant'>") && hub.indexOf('mail-provider-rooster') < hub.indexOf("<aside className='mail-accounts-kant'>"));
  check('1 tegels: minmax(min(100%,190px),1fr) — nooit breder dan de kolom; tegel ≥ tikhoogte', hubCss.includes('repeat(auto-fill,minmax(min(100%,190px),1fr))') && /\.mail-provider-tegel\{[^}]*min-height:var\(--tik-hoogte\)/.test(hubCss) && hub.includes("className='mail-provider-tegel'"));
  check('1 mail-accounts-hub.css: geen hex, geen vaste breedte > 360 px', !HEX.test(hubCss) && !/(?:^|[;{\s])width:\s*\d{3,}px/.test(hubCss));
  // (renderen met de nagebootste browser doet gebruiker-audit-2026-10-19 al: U-01 tegels + begroeting)

  // ------------------------------------------------------------------ 2. toestemmingsvensters
  const consent = zc(lees('src/mcp-toestemming-venster.css')), v2 = zc(lees('src/connector-v2/connector-v2.css'));
  check('2 McpConsentModal: kinderen min-width:0, keuzelijst max 100%, lange woorden breken', consent.includes('.mcp-consent-dialog :is(section,div,header,footer,label,p,ul,ol,li,form,fieldset){min-width:0}') && consent.includes('.mcp-consent-duur select{max-width:100%}') && /\.mcp-consent-dialog\{min-width:0;max-width:100%/.test(consent));
  check('2 KoppelWizard (.v2-wizard): dezelfde begrenzing; knoppen ≥ 44 px op de telefoon', v2.includes('.v2-wizard :is(section,div,header,footer,label,p,ul,ol,li,form,fieldset){min-width:0}') && /\.v2-wizard :is\(\.mcp-consent-secondary,\.mcp-consent-primary,\.v2-knop,\.v2-link\)\{min-height:var\(--tik-hoogte\)\}/.test(v2));
  check('2 schakelaar (role=switch) niet opgeblazen tot een cirkel: fundament slaat role=switch over, tikvlak via ::after', lees('src/ontwerp/mobiel.css').includes(':not([role=switch], [role=checkbox], [role=radio]) { min-height:var(--tik-hoogte-mobiel); }') && /\.v2-schakelaar::after\{content:"";position:absolute;/.test(v2));

  // ------------------------------------------------------------------ 3. /agenten: tabrij
  const rij = lees('src/ontwerp/TabsRij.tsx'), rijCss = zc(lees('src/ontwerp/tabs-rij.css')), ag = zc(lees('src/agenten/agenten.css'));
  check('3 TabsRij staat in het openbare ontwerpfundament (src/uitrol/ is technisch en wordt zonder technisch profiel niet geserveerd)', !isTechModule('src/ontwerp/TabsRij.tsx') && !isTechModule('src/ontwerp/tabs-rij.css') && isTechModule('src/uitrol/TabsRij.tsx') && lees('src/uitrol/TabsRij.tsx').includes("export { default, tabInBeeld } from '../ontwerp/TabsRij';"));
  check('3 TabsRij: eigen nav-/wrapklasse, rol (tablist|group), data-scroll-ok standaard aan, CSS meegeladen', rij.includes("navKlasse = 'ut-tabs', wrapKlasse = '', scrollOk = true, rol = 'tablist'") && rij.includes("data-scroll-ok={scrollOk ? '1' : undefined}") && rij.includes("import './tabs-rij.css';"));
  for (const p of ['src/agenten/AgentenPagina.tsx', 'src/agenten/VerbindingenHub.tsx']) {
    const s = lees(p);
    check(`3 ${p}: tabrij via TabsRij (navKlasse='ag-tabs'), geen kale <nav className='ag-tabs'> meer`, s.includes("<TabsRij navKlasse='ag-tabs' wrapKlasse='ag-tabs-wrap'") && !s.includes("<nav className='ag-tabs'") && s.includes("import TabsRij from '../ontwerp/TabsRij';"));
  }
  check('3 agenten.css: > 700 px lopen de tabbladen om (geen scroll); --ut-* op tokens', ag.includes('@media (min-width:701px){.ag-tabs{flex-wrap:wrap;overflow-x:visible}}') && ag.includes('.ag-tabs-wrap{--ut-bg:var(--bg);--ut-line:var(--line);--ut-text:var(--text);'));
  check('3 tabs-rij.css: pijlen 44×44 op de telefoon; geen hex', rijCss.includes('@media (max-width:700px){.ut-tabs-wrap .ut-tabs-pijl{width:var(--tik-hoogte);height:var(--tik-hoogte)}}') && !HEX.test(rijCss.replace(/var\([^)]*\)/g, '')));
  check('3 ook diagnostiek (3029 px) en integraties-categorieën (4170 px) via TabsRij', lees('src/diagnostiek/Diagnostiek.tsx').includes("<TabsRij navKlasse='adg-tabs'") && lees('src/integraties/Integraties.tsx').includes("<TabsRij navKlasse='il-groep' rol='group'"));

  // ------------------------------------------------------------------ 4. canonical-workspace op 768
  check('4 .ag-matrix-tabel is position:relative (bevattend blok voor de absolute .ag-sr-spans)', /\.ag-matrix-tabel\{overflow-x:auto;max-width:100%;position:relative\}/.test(ag));

  // ------------------------------------------------------------------ 5. overlap
  const beheer = zc(lees('src/connector-v2/beheer.css')), gmw = zc(lees('src/google-mail-werkruimte.css'));
  check('5 v2b-teller loopt om; tekst flex-basis 9rem; chip mag afbreken', /\.v2b-teller\{display:flex;flex-wrap:wrap;/.test(beheer) && beheer.includes('.v2b-teller-tekst{flex:1 1 9rem;') && beheer.includes('.v2b-teller>.v2-chip{flex:none;max-width:100%;white-space:normal}'));
  check('5 mail-zoekbalk: eerste kolom = breedte van de knop (auto), niet 36 px onder een knop van 40 px', gmw.includes('.mail-top-search-shell{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;') && !gmw.includes('grid-template-columns:36px minmax(0,1fr) auto auto'));

  // ------------------------------------------------------------------ 6. tikvlakken op de telefoon
  const tik: Array<[string, RegExp, string]> = [
    ['src/canoniek-omlijsting.css', /main\.canonical-chrome\.canonical-chrome \.canonical-sidebar \.canonical-local-pages \.canonical-local-page-button\{min-height:var\(--tik-hoogte\)/, 'submenu (34 px)'],
    ['src/canoniek-omlijsting.css', /\.canonical-chrome \.canonical-submenu-toggle\{width:var\(--tik-hoogte\);min-height:var\(--tik-hoogte\)\}/, 'pijl «підменю» (28×44)'],
    ['src/menu-v2.css', /\.zijbalk-pijl button\{width:var\(--tik-hoogte\);min-height:var\(--tik-hoogte\)\}/, 'menu scrollen (30×44)'],
    ['src/canoniek-account-menu.css', /\.canonical-profile-camera\{--cam-rand:[^}]*width:var\(--tik-hoogte\);height:var\(--tik-hoogte\)[^}]*background-clip:padding-box/, 'camera (30×44)'],
    ['src/hulp/hulp-knop.css', /::after\{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;/, 'hulpknop «?» (22×22, tikvlak 44×44 via ::after; 29.10.2026)'],
    ['src/tech/tech.css', /\.tech-band-knoppen button\{min-width:var\(--tik-hoogte\);min-height:var\(--tik-hoogte\)/, 'tech-band (34×34)'],
    ['src/hub-functioneel-blokken.css', /\.hub-sectie-menu-knop\{width:var\(--tik-hoogte\);height:var\(--tik-hoogte\)\}/, 'hub-sectiemenu (36×36)'],
    ['src/index.css', /:is\(\.primary,\.secondary,\.ghost,\.success,\.warning,\.footer-button,\.small\)(:where\(button,a,label,\[role=button\],input,select,summary\))?\{min-height:var\(--tik-hoogte\)\}/, 'oude .secondary/.small (36/33); 21.10 agent C: alleen op knoppen/links (niet op een span.small-avatar)'],
    ['src/github-weergave.css', /\.gh-btn\{min-height:var\(--tik-hoogte\)\}/, 'GitHub-knoppen (34)'],
    ['src/agenten/agenten.css', /\.ag-link\{min-height:var\(--tik-hoogte\)\}/, '«Усі конектори»/«Усі ШІ» (16/22)'],
    ['src/mail-snelle-instellingen.css', /\.mail-density-card-actions>button\{width:var\(--tik-hoogte\);height:var\(--tik-hoogte\)\}/, 'dichtheid (32×32)'],
    ['src/afzenders/afzenders.css', /\.afz-knop,\.afz-chips button\{min-height:var\(--tik-hoogte\)\}/, 'contacten (34/36)'],
    ['src/audit/audit.css', /\.aj-knop\{min-height:var\(--tik-hoogte\)\}/, 'journaal (36)'],
    ['src/geheimen/geheimen.css', /\.gm-root \.gm-knop\{min-height:var\(--tik-hoogte\)\}/, 'geheimen (38)'],
    ['src/integraties/integraties.css', /\.il-ververs,\.il-groep button,\.il-wens,\.il-reset\{min-height:var\(--tik-hoogte\)\}/, 'integraties (36/38)'],
    ['src/uitrol/uitrol.css', /\.admin-uitrol \.ut-knop,\.ut-root a\.ut-knop\{min-height:var\(--tik-hoogte\)\}/, 'updates (38)'],
    ['src/ai-beleid.css', /\.aiz \.aiz-link\{min-height:var\(--tik-hoogte\)\}/, 'AI-toegang (34)'],
    ['src/platform/verbinding-plakkaat.css', /\.vp-knop\{min-height:var\(--tik-hoogte\)\}/, 'verbindingsbanner (26)'],
    ['src/mcp-domein.css', /\.mbk-head \.mcp-ghost\{[^}]*min-width:var\(--tik-hoogte\);min-height:var\(--tik-hoogte\)\}/, 'kaartblok «Оновити» (16×16)'],
    ['src/mail-abonnementen.css', /\.mail-subscriptions-view>header button\{width:var\(--tik-hoogte\);height:var\(--tik-hoogte\)\}/, 'abonnementen «Оновити» (27×36)'],
    ['src/weergave/weergave.css', /\.weergave-richting-ander a\{display:inline-flex;align-items:center;min-height:var\(--tik-hoogte\)\}/, '«Перейти: Міст ШІ → сайт» (19)'],
  ];
  for (const [p, re, wat] of tik) {
    const css = zc(lees(p)); const m = re.exec(css);
    const media = m ? css.slice(0, m.index).lastIndexOf('@media') : -1;
    check(`6 ${wat}: ${p} — tikvlak var(--tik-hoogte) binnen @media (max-width:700px)`, !!m && media >= 0 && css.startsWith('@media (max-width:700px)', media), m ? `@media op ${media}` : 'regel ontbreekt');
  }

  // ------------------------------------------------------------------ 7. letters ≥ 12 px
  const prim = zc(lees('src/ontwerp/primitieven.css'));
  check('7 fundament: `small` met elementspecificiteit (wint van preflight small{80%})', /(^|\n)small \{ font-size:max\(var\(--tekst-mini\), \.8em\); \}/.test(prim));
  const letters: Array<[string, string, string]> = [
    ['src/mail-instellingen-geraamte.css', '.mail-settings-nav-group>small{font-size:var(--tekst-mini)}', '«ПРИСТРІЙ ПЕРЕГЛЯДУ» (8/9 px)'],
    ['src/hub-functioneel-blokken.css', '.hub-widget-metrics>span{font-size:max(var(--tekst-mini),.7rem)}', 'hub-widgets (11,2 px)'],
    ['src/mail-snelle-instellingen.css', '.mail-list-paging-or,.mail-list-paging-custom,.mail-list-paging-custom>span{font-size:max(var(--tekst-mini),1em)}', '«або»/«Власне» (9/9,5 px)'],
    ['src/ai-beleid.css', '.aiz-stand-kop small{font-size:max(var(--tekst-mini),.8rem);overflow-wrap:anywhere}', 'AI-toegang (9,7 px)'],
    ['src/uitrol/upload.css', '.ut-wiz-balk li,.ut-wiz-balk li em.ut-wiz-kort{font-size:max(var(--tekst-mini),.78rem)}', 'wizardstappen (11,2 px)'],
    ['src/canoniek-omlijsting.css', '.canonical-local-pages small{font-size:max(var(--tekst-mini),.63rem)}', 'tellers submenu (10 px)'],
    ['src/canoniek-omlijsting.css', '.canonical-connection-banner small{font-size:max(var(--tekst-mini),.72rem)}', 'verbindingsbanner (11,5 px)'],
    ['src/mail-zijbalk-navigatie.css', '.canonical-local-pages small.mail-sidebar-status{font-size:var(--tekst-mini)}', 'mailmenu-status (10 px)'],
    ['src/connector-v2/beheer.css', '.v2b-teller-tekst small{color:var(--muted);font-size:max(var(--tekst-mini),.75rem)}', '«Дії для агента»'],
  ];
  for (const [p, regel, wat] of letters) check(`7 ${wat}: ${p}`, zc(lees(p)).includes(regel));

  // ------------------------------------------------------------------ 8. horizontaal scrollen
  const ms = zc(lees('src/mail-instellingen-geraamte.css'));
  check('8 mail-instellingen: navigatie loopt om op de telefoon (geen rij van 1014 px), links 44 px', /@media \(max-width:720px\)\{\s*\.mail-settings-scaffold nav\{flex-wrap:wrap;overflow-x:visible;/.test(ms) && /\.mail-settings-scaffold nav a\{display:inline-flex;align-items:center;min-height:var\(--tik-hoogte\)/.test(ms));
  check('8 mail-instellingen: kleurkeuze in «Додати правило» steekt niet meer 78 px uit (tekst visueel verborgen, niet weg)', zc(lees('src/mail-snelle-instellingen.css')).includes('.mail-sender-rule-add .mail-color-disclosure-copy{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}'));
  check('8 admin-apparaten: onder 1000 px kaarten in plaats van een raster van 920 px', /@media \(max-width:1000px\)\{\s*\.admin-table\{overflow:visible\}\s*\.admin-table-head\{display:none\}\s*\.admin-table article\{grid-template-columns:minmax\(0,1fr\) auto;min-width:0\}/.test(zc(lees('src/beheer-console.css'))));
  check('8 accountpaneel: het adres van het actieve account breekt af (was nowrap, 284 > 268)', zc(lees('src/canoniek-account-menu.css')).includes('.canonical-current-account .canonical-current-copy :is(strong,small){white-space:normal;overflow-wrap:anywhere;text-overflow:clip}'));
  check('8 admin-ai: kop van de standlijst niet meer nowrap (787 > 390)', zc(lees('src/ai-beleid.css')).includes('.aiz-stand-kop{min-width:0;white-space:normal}'));
  check('8 api-afstemming: filterchips lopen om (920 > 669 op 768)', zc(lees('src/canoniek-implementatie-waarheid.css')).includes('.implementation-filters{flex-wrap:wrap;overflow:visible}'));

  // ------------------------------------------------------------------ algemeen: de nieuwe blokken volgen het fundament
  const bestanden = ['src/mail-accounts-hub.css', 'src/ontwerp/tabs-rij.css', ...new Set([...tik.map((t) => t[0]), ...letters.map((l) => l[0]), 'src/mail-instellingen-geraamte.css', 'src/beheer-console.css', 'src/canoniek-implementatie-waarheid.css', 'src/globaal-zoek.css', 'src/mail-abonnementen.css'])];
  const fout: string[] = [];
  for (const p of bestanden) {
    const s = lees(p); const i = s.indexOf('MOBIEL 21.10.2026'); if (i < 0) continue;
    const blok = zc(s.slice(i));
    const zonderVar = blok.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, '');
    if (HEX.test(zonderVar)) fout.push(`${p}: hex`);
    if (/prefers-color-scheme/.test(blok)) fout.push(`${p}: prefers-color-scheme`);
    if (/(?:^|[;{\s])width:\s*(3[6-9]\d|[4-9]\d\d|\d{4,})px/.test(blok)) fout.push(`${p}: vaste breedte > 360`);
    for (const m of blok.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) < 12) fout.push(`${p}: font-size ${m[1]}px`);
  }
  check(`algemeen: mobiele blokken (${bestanden.length} bestanden) zonder hex, prefers-color-scheme, vaste breedte > 360 of letter < 12 px`, fout.length === 0, fout.join(' | '));
  return einde();
}
