// Регресійне випробування для UPD-007: усі 9 пунктів оновлення інтерфейсу, меню якорів та перемикання просторів.
// Regressietest voor UPD-007: alle 9 punten van de interface-, ankermenu- en ruimtewissel-update.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Term, TermList } from '../../src/beheer-termen';
import { leesVoorkeur, STROOK_STANDAARD } from '../../src/tech/strook-voorkeur';
import { gebruikerKoosPrive, wisGebruikerPrive, zetGebruikerPrive } from '../../src/tech/ruimtes/ruimte-signaal';
import { checker } from './hulp/nep-google';

const WORTEL = process.cwd();
const lees = (pad: string) => readFileSync(join(WORTEL, pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('upd-007-ui-en-ruimte-20261119');

  // 1. Бічна панель у режимі «Автоматично» наповзає поверх сторінки, не зсуваючи її.
  const omlCss = lees('src/canoniek-omlijsting.css');
  const idxCss = lees('src/index.css');
  const plCss = lees('src/plaatsing/plaatsing.css');
  const m2Css = lees('src/menu-v2.css');
  check(
    '1. Бічна панель у режимі «Автоматично» наповзає поверх сторінки зі щільним фоном і не зсуває .canonical-workspace',
    !/\.sidebar-hover\s+\.canonical-workspace/.test(omlCss)
      && !/\.sidebar-hover\s+\.canonical-workspace/.test(idxCss)
      && !/\.sidebar-hover/.test(plCss)
      && !/:is\(\.sidebar-pinned,\.sidebar-hover\)\s+\.canonical-workspace/.test(m2Css)
      && /\.canonical-chrome:not\(\.sidebar-drawer-mode\)\.sidebar-hover\s+\.canonical-sidebar\{background:color-mix/.test(m2Css),
  );

  // 2. Технічна смуга має єдиний компактний розмір (6px / 38px), колір профілю, два режими підписів і вимикані підказки.
  const strookCss = lees('src/tech/strook.css');
  const techMaq = lees('src/tech/tech-maquette.css');
  const techLaag = lees('src/tech/TechLaag.tsx');
  const paneel = lees('src/tech/StrookPaneel.tsx');
  check(
    '2. Технічна смуга має стабільний розмір (6px / 38px), колір профілю, однорядковий тумблер і вимикані підказки',
    /--tech-strook-h:6px;--tech-band-vol:38px/.test(strookCss)
      && /\.tech-band:not\(\.is-ingeklapt\)\{[^}]*background-color:var\(--tech-band-bg\)/.test(strookCss)
      && /\.tech-band:not\(\.is-ingeklapt\)\s+\.rw-label\{flex-direction:row/.test(strookCss)
      && /\[data-tech-tooltips="0"\]\s+\.tech-strook-item::after\{display:none!important\}/.test(strookCss)
      && /background-color:\s*var\(--tech-band-bg\)/.test(techMaq)
      && /data-tech-tooltips=\{voorkeur\.tooltips \? '1' : '0'\}/.test(techLaag)
      && /voorkeur\.tooltips/.test(paneel)
      && STROOK_STANDAARD.tooltips === true
      && leesVoorkeur().grootte === 'middel',
  );

  // 3. Спільну кнопку «Показати технічні коди» прибрано; біля кожного терміна є локальна піктограма зі спливаючим поясненням.
  const consoleTsx = lees('src/BeheerConsoleWeergave.tsx');
  const overzichtTsx = lees('src/BeheerOverzichtWeergave.tsx');
  const dashboardTsx = lees('src/overzicht/Dashboard.tsx');
  const consoleCss = lees('src/beheer-console.css');
  const htmlTerm = renderToStaticMarkup(createElement(Term, { lang: 'uk', raw: 'active' }));
  const htmlList = renderToStaticMarkup(createElement(TermList, { lang: 'nl', values: ['owner', 'active'] }));
  check(
    '3. Спільну кнопку «Показати технічні коди» прибрано; <Term>/<TermList> показують локальну піктограму зі спливаючим поясненням',
    !/admin-codes-toggle/.test(consoleTsx)
      && !/admin-codes-toggle/.test(overzichtTsx)
      && !/admin-codes-toggle/.test(dashboardTsx)
      && /\.admin-term-info\{/.test(consoleCss)
      && /\.admin-term-popover\{/.test(consoleCss)
      && /class="admin-term"/.test(htmlTerm)
      && /class="admin-term-info"/.test(htmlTerm)
      && /class="admin-term-popover"/.test(htmlTerm)
      && /<code class="admin-term-code">active<\/code>/.test(htmlTerm)
      && /admin-term-popover/.test(htmlList),
  );

  // 4. Перемикання на «Звичайний» не відкочується назад у «Технічний» через TechPoort.
  const poort = lees('src/tech/TechPoort.tsx');
  const opslag = lees('src/tech/ruimtes/ruimtes-opslag.ts');
  wisGebruikerPrive();
  const voor = gebruikerKoosPrive();
  zetGebruikerPrive(true);
  const tijdens = gebruikerKoosPrive();
  wisGebruikerPrive();
  const na = gebruikerKoosPrive();
  check(
    '4. Перемикання на «Звичайний» не відкочується назад у «Технічний» через TechPoort',
    /!gebruikerKoosPrive\(\)/.test(poort)
      && /zetGebruikerPrive\(naar === 'prive'\)/.test(opslag)
      && /zetGebruikerPrive\(false\)/.test(opslag)
      && voor === false
      && tijdens === true
      && na === false,
  );

  // 5. При розгорнутій технічній смузі бічна панель обмежується висотою #root і не обрізає нижній перемикач .zr.
  const techCss = lees('src/tech/tech.css');
  check(
    '5. При розгорнутій технічній смузі бічна панель обмежується висотою #root і не обрізає нижній перемикач .zr',
    /html\[data-tech=aan\]\s+#root\s+\.canonical-sidebar[\s\S]*?\{height:100%;max-height:100%\}/.test(techCss),
  );

  // 6 та 9. Чистий вигляд кнопки «Адміністрування» і технічних ярликів без півмісяця, щитка та порожньої смужки підменю.
  const omlTsx = lees('src/CanoniekOmlijsting.tsx');
  const bewTsx = lees('src/SnelleToegangBewerker.tsx');
  check(
    '6 та 9. Чистий вигляд кнопки «Адміністрування» і технічних ярликів без півмісяця, щитка та порожньої смужки підменю',
    !/inset 3px 0 0/.test(m2Css)
      && !/\.tech-yarlyk-schild/.test(m2Css)
      && !/tech-yarlyk-schild/.test(omlTsx)
      && !/tech-yarlyk-schild/.test(bewTsx)
      && /\.canonical-chrome:not\(\.sidebar-expanded\)\s+\.canonical-local-pages:empty\{display:none\}/.test(m2Css)
      && /\.canonical-service-button:has\(\.menu-herkomst\)\{padding-block:5px;line-height:1\.18\}/.test(m2Css)
      && /box-shadow:0 0 0 2px var\(--tech-profiel-kleur/.test(m2Css),
  );

  // 7. Сторінка api.tarasevych.com/afstemming має єдине меню якорів MaquetteAnkerRail із 8 розділами в усіх палітрах.
  const wissel = lees('src/AfstemmingWissel.tsx');
  const pagina = lees('src/afstemming-vnext/AfstemmingPagina.tsx');
  const afvCss = lees('src/afstemming-vnext/afstemming.css');
  const afvMaqCss = lees('src/afstemming-vnext/afstemming-maquette.css');
  check(
    '7. Сторінка api.tarasevych.com/afstemming має єдине меню якорів MaquetteAnkerRail із 8 розділами в усіх палітрах',
    /MaquetteAnkerRail/.test(wissel)
      && /const toonAnkerRail = !laagOpen;/.test(wissel)
      && /overzicht[\s\S]*kartotheek[\s\S]*kaart-grafiek[\s\S]*controles[\s\S]*releases[\s\S]*mogelijkheden[\s\S]*geschiedenis[\s\S]*bronnen/.test(wissel)
      && !/className='afv-zijnav'/.test(pagina)
      && !/className='afv-onderbalk'/.test(pagina)
      && /\.afv-romp\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/.test(afvCss)
      && /html\.palet-maquette \.afv \.afv-romp\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/.test(afvMaqCss),
  );

  // 8. Сторінка admin.tarasevych.com/updates має єдине меню якорів MaquetteAnkerRail із 6 розділами в усіх палітрах.
  const uitrol = lees('src/BeheerUitrolWeergave.tsx');
  check(
    '8. Сторінка admin.tarasevych.com/updates має єдине меню якорів MaquetteAnkerRail із 6 розділами в усіх палітрах',
    !/className='ut-tabs'/.test(uitrol)
      && /<MaquetteAnkerRail/.test(consoleTsx)
      && /upd-tab:overzicht[\s\S]*upd-tab:stroom[\s\S]*upd-tab:historie[\s\S]*upd-tab:log[\s\S]*upd-tab:diagnose[\s\S]*upd-tab:instellen/.test(consoleTsx),
  );

  return einde();
}
