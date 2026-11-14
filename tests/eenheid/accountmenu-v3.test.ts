// Спадне меню облікового запису v3 (IDENTITEIT-008, прапорець `accountmenu-v3`):
// перевірка міграції, прапорця, Моделі В гортання палітр, Режиму А («Орбіта світлин») та Режиму Б («Секційна картка»),
// концентричного кільця 32x32 (r=15.5), світіння щитка лише за активного технічного простору та масштабування 78%..134%.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evalueer, VLAG_UITLEG, type Vlag } from '../../shared/vlaggen';
import { ACCOUNTMENU_V3_VLAG, STANDAARD_ACCOUNTMENU_V3 } from '../../src/accountmenu-v3/vlag';
import {
  begrensschaal,
  herstelAccountmenuV3Schaal,
  leesAccountmenuV3Voorkeuren,
  PALET_KEUZES_INFO,
  paletIcoonKleur,
  SCHAAL_MAX,
  SCHAAL_MIN,
  SCHAAL_STANDAARD,
  volgendePaletKeuze,
  zetAccountmenuV3Indeling,
  zetAccountmenuV3Schaal,
} from '../../src/accountmenu-v3/accountmenu-v3-voorkeuren';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('accountmenu-v3');

  // 1. Міграція та прапорець можливості
  const migratie = readFileSync('migrations/0206_accountmenu_v3_vlag.sql', 'utf8');
  const basisMigratie = readFileSync('migrations/0038_feature_flags.sql', 'utf8');
  const omschrijvingGrens = Number(basisMigratie.match(/CHECK\s*\(char_length\(omschrijving\)\s*<=\s*(\d+)\)/)?.[1]);
  const omschrijving = migratie.match(/VALUES\s*\(\s*'accountmenu-v3',\s*'((?:''|[^'])*)'\s*,\s*false,\s*false\s*\)/s)?.[1]?.replaceAll("''", "'");
  const vlag: Vlag = { sleutel: ACCOUNTMENU_V3_VLAG, omschrijving: '', aan: false, standaard: false, percentage: 0, gebruikers: [] };

  check('міграція 0206: типово ВИМКНЕНО та ідемпотентно', /'accountmenu-v3'/.test(migratie) && /false,\s*false\)\s*ON CONFLICT \(sleutel\) DO NOTHING/.test(migratie));
  check('опис прапорця в міграції вкладається в обмеження бази даних', Number.isInteger(omschrijvingGrens) && omschrijvingGrens > 0 && !!omschrijving && [...omschrijving].length <= omschrijvingGrens);
  check('вимкнений або відсутній прапорець повертає false', evalueer(ACCOUNTMENU_V3_VLAG, undefined, 'eigenaar').value === false && evalueer(ACCOUNTMENU_V3_VLAG, vlag, 'eigenaar').value === false);
  check('власник може увімкнути прапорець лише для себе', evalueer(ACCOUNTMENU_V3_VLAG, { ...vlag, aan: true, gebruikers: ['eigenaar'] }, 'eigenaar').value === true && evalueer(ACCOUNTMENU_V3_VLAG, { ...vlag, aan: true, gebruikers: ['eigenaar'] }, 'ander').value === false);

  const uitleg = VLAG_UITLEG[ACCOUNTMENU_V3_VLAG];
  check('прапорець має повне пояснення українською та нідерландською', !!uitleg && uitleg.naam.length === 2 && uitleg.wat.every((x) => x.length > 25) && uitleg.gevolg.every((x) => x.length > 20));

  // 2. Режими А («Орбіта світлин») і Б («Секційна картка») та масштаб 78%..134%
  check('типовий режим переліку облікових записів — orbita (Режим А)', leesAccountmenuV3Voorkeuren().indeling === 'orbita');
  zetAccountmenuV3Indeling('kaart');
  check('перемикання на Режим Б (kaart) зберігається', leesAccountmenuV3Voorkeuren().indeling === 'kaart');
  zetAccountmenuV3Indeling('orbita');
  check('повернення на Режим А (orbita) працює', leesAccountmenuV3Voorkeuren().indeling === 'orbita');

  check('begrensschaal обмежує значення межами 0.78..1.34', begrensschaal(0.3) === SCHAAL_MIN && begrensschaal(2.5) === SCHAAL_MAX && begrensschaal('не-число') === SCHAAL_STANDAARD);
  zetAccountmenuV3Schaal(1.18);
  check('встановлення масштабу 1.18 зберігається', leesAccountmenuV3Voorkeuren().schaal === 1.18);
  herstelAccountmenuV3Schaal();
  check('скидання масштабу повертає 1.00', leesAccountmenuV3Voorkeuren().schaal === SCHAAL_STANDAARD);

  // 3. Модель В гортання палітр по колу
  const reeksZonderViolet: string[] = [];
  let p = PALET_KEUZES_INFO[0]!.id;
  for (let i = 0; i < PALET_KEUZES_INFO.length; i++) {
    reeksZonderViolet.push(p);
    p = volgendePaletKeuze(p, false);
  }
  check('Модель В: поза простором ШІ палітри гортаються по колу без violet і повертаються на початок', !reeksZonderViolet.includes('violet') && reeksZonderViolet[0] === 'kleur' && reeksZonderViolet[reeksZonderViolet.length - 1] === 'kleur');
  check('Модель В: у просторі ШІ violet входить у коло перемикання', volgendePaletKeuze('puur', true) === 'violet' && volgendePaletKeuze('violet', true) === 'blauw');
  check('колір піктограми палітри відповідає обраному тону', paletIcoonKleur('blauw', 'hub', false).startsWith('#') && paletIcoonKleur('oranje', 'hub', true).startsWith('#'));

  // 4. Перевірка компонента, мобільного поверхневого вікна та інтеграції з оболонкою сайту
  const menu = readFileSync('src/CanoniekAccountMenu.tsx', 'utf8');
  const omlijsting = readFileSync('src/CanoniekOmlijsting.tsx', 'utf8');
  const v3Tsx = readFileSync('src/accountmenu-v3/AccountMenuV3.tsx', 'utf8');
  const v3Css = readFileSync('src/accountmenu-v3/accountmenu-v3.css', 'utf8');
  const instellingen = readFileSync('src/InstellingencentrumWeergave.tsx', 'utf8');
  const plaatsingCss = readFileSync('src/plaatsing/plaatsing.css', 'utf8');
  const vasteLijst = JSON.parse(readFileSync('scripts/plaatsing-vaste-elementen.json', 'utf8')) as {
    toegestaan?: Array<{ sleutel: string; reden: string }>;
  };

  check('AccountMenuV3 є типовим єдиним виглядом меню облікових записів (STANDAARD_ACCOUNTMENU_V3 === true)', STANDAARD_ACCOUNTMENU_V3 === true);
  check('CanoniekAccountMenu відмальовує AccountMenuV3 за увімкненого am3 як після входу, так і до входу (без обмеження displayUser)', menu.includes("data-account-menu-v3={am3 ? 'aan' : undefined}") && menu.includes('open && am3 && mobielVenster') && menu.includes('{am3 ? (') && !menu.includes('{am3 && displayUser ? (') && menu.includes('<AccountMenuV3'));
  check('CanoniekAccountMenu скидає profileOverride при зміні світлини профілю й не показує хибної помилки оновлення списку до входу', menu.includes('user?.picture, user?.customPicture, user?.customPhoto, user?.providerPicture') && menu.includes('onChangePhoto={onProfilePhotoChange ? changePhoto : undefined}') && menu.includes('if (user && status !== 401 && status !== 403)'));
  check('На мобільних екранах (<= 700 px) вікно виводиться через createPortal у незалежний шар .am3-mobiel-laag поверх бічної панелі та екрана входу', menu.includes('createPortal(') && menu.includes("className='am3-mobiel-laag'") && menu.includes('onSluitNavigatie={sluitMetLade}') && omlijsting.includes('.am3-mobiel-laag') && v3Css.includes('z-index: 450;'));
  check('Налаштування містять перемикач режимів меню v3 (AccountMenuV3Instellingen)', instellingen.includes('<AccountMenuV3Instellingen lang={p.lang}/>'));
  check('AccountMenuV3 має трикамерну орбіту, палітру Моделі В, щиток, лоток 3 умов завершення, єдиний шеврон та мобільну кнопку закриття', v3Tsx.includes('am3-orbit-stage') && v3Tsx.includes('onContextMenu={opPaletContextMenu}') && v3Tsx.includes('am3-access-ring') && v3Tsx.includes('tot-technisch-einde') && v3Tsx.includes('tot-site-uitloggen') && v3Tsx.includes('am3-accounts-chevron') && v3Tsx.includes('am3-mobiel-sluit'));
  check('нижні кутики масштабування прозорі без видимих діагональних насічок SVG та вимкнені на сенсорних екранах', !v3Tsx.includes('M2 6l4 4M2 2l8 8') && !v3Tsx.includes('M10 6l-4 4M10 2l-8 8') && /\[data-account-menu-v3\] \.am3-resize-corner\s*\{[^}]*opacity:\s*0;/.test(v3Css) && /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.am3-resize-corner[\s\S]*?display:\s*none\s*!important/.test(v3Css));
  check('кнопка Доступ і терміни має концентричне кільце 32x32 із r=15.5 та тематичну спливну підказку', v3Tsx.includes("viewBox='0 0 32 32'") && v3Tsx.includes("cx='16'") && v3Tsx.includes("r='15.5'") && v3Tsx.includes('am3-access-hover-tip'));
  check('щиток світиться кольором технічної смуги лише коли активний технічний простір', v3Css.includes('.am3-seg-btn.is-tech-btn svg') && v3Css.includes('color: currentColor;') && v3Css.includes('.am3-seg-btn.is-tech-btn.active svg') && v3Css.includes('color: var(--am3-shield-color'));
  check('мобільний шар зареєстрований у plaatsing-vaste-elementen.json і приховує рухомий стек дій', !!vasteLijst.toegestaan?.some((x) => x.sleutel === 'src/accountmenu-v3/accountmenu-v3.css :: [data-account-menu-v3].am3-mobiel-laag' && x.reden.length > 30) && plaatsingCss.includes('html body:has(.am3-mobiel-laag) .plaats-actiestapel'));
  check('CSS v3: має мобільний захист круглих кнопок проти 44px, захист пропорцій аватарів, адаптивні рядки простору, теми й мови та підтримку prefers-reduced-motion', (v3Css.match(/position:\s*fixed/g) || []).length === 1 && v3Css.includes('[data-account-menu-v3].am3-mobiel-laag') && v3Css.includes('.am3-shell.am3-shell.am3-shell') && v3Css.includes('object-fit: cover;') && v3Css.includes('span:not(.am3-mini-avatars)') && v3Css.includes('.am3-pref-row.is-space-row') && v3Css.includes('.am3-pref-row.is-lang-row') && v3Css.includes('prefers-reduced-motion: reduce'));
  check('поличка палітри захищена від автозгортання синтетичним contextmenu після утримання на смартфоні та має явну кнопку закриття', v3Tsx.includes('lastHoldToggleAtRef') && v3Tsx.includes('Date.now() - lastHoldToggleAtRef.current < 850') && v3Tsx.includes("className='am3-tray-close'"));
  check('кнопки Перейти/Увійти та Видалити зі списку ізольовані власним position: relative і не перекривають сусідню дію невидимим дотиковим шаром ::after', /\[data-account-menu-v3\] \.am3-acc-btn\s*\{[^}]*position:\s*relative/.test(v3Css) && /\[data-account-menu-v3\] \.am3-acc-btn\.is-icon-only\s*\{[^}]*position:\s*relative/.test(v3Css) && v3Tsx.includes("uk ? 'Перейти' : 'Wisselen'") && v3Tsx.includes('void onForgetAccount(item)'));

  // 5. Справжнє відмальовування AccountMenuV3 у стані до входу (displayUser === null) обома мовами (uk / nl) та індикатора очікування
  const g = globalThis as unknown as Record<string, unknown>;
  const nepOpslag = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    };
  };
  const neppe: Record<string, unknown> = {
    window: g,
    localStorage: nepOpslag(),
    sessionStorage: nepOpslag(),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    location: {
      href: 'https://hub.tarasevych.com/',
      hostname: 'hub.tarasevych.com',
      origin: 'https://hub.tarasevych.com',
      host: 'hub.tarasevych.com',
      pathname: '/',
      search: '',
      hash: '',
      protocol: 'https:',
    },
    document: {
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({
        style: {},
        dataset: {},
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        remove() {},
        classList: { add() {}, remove() {} },
      }),
      documentElement: {
        classList: { add() {}, remove() {}, contains: () => false },
        dataset: {},
        style: {},
        lang: 'uk',
      },
      head: { appendChild() {} },
      body: { appendChild() {} },
      cookie: '',
      visibilityState: 'visible',
      referrer: '',
    },
  };
  const bewaard = new Map<string, PropertyDescriptor | undefined>();
  for (const k of Object.keys(neppe)) {
    bewaard.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, { value: neppe[k], configurable: true, writable: true });
  }

  try {
    new Function(readFileSync('public/canonical-service.js', 'utf8'))();
    const { AccountMenuV3 } = await import('../../src/accountmenu-v3/AccountMenuV3');
    const noop = () => undefined;
    const bewaardItem = {
      grantId: 'g-1',
      user: { id: 'u-1', email: 'pavlo@tarasevych.com', name: 'Pavlo Tarasevych', picture: '' },
      lastUsedAt: 1700000000000,
      expiresAt: 1900000000000,
      silentAllowed: false,
    };
    const renderAfgemeld = (lang: 'uk' | 'nl', selecting = '') =>
      renderToStaticMarkup(
        createElement(AccountMenuV3, {
          lang,
          theme: 'light',
          displayUser: null,
          visibleRows: [bewaardItem],
          shouldShowOtherAccountsToggle: false,
          expanded: false,
          onToggleExpanded: noop,
          busy: false,
          selecting,
          forgetting: '',
          loading: false,
          loadFailed: false,
          photoBusy: false,
          photoError: false,
          photoLeesfout: '',
          photoFailedText: '',
          changePhotoLabel: '',
          manageLabel: '',
          settingsLabel: '',
          privacyLabel: lang === 'uk' ? 'Політика конфіденційності' : 'Privacybeleid',
          termsLabel: lang === 'uk' ? 'Умови використання' : 'Gebruiksvoorwaarden',
          showLogoutAll: false,
          wisselMelding: null,
          v2Ruimtes: false,
          onSelectAccount: noop,
          onForgetAccount: noop,
          onAddAccount: noop,
          onTheme: noop,
          onLanguage: noop,
          onClose: noop,
          renderAvatar: (u) => createElement('span', { className: 'test-avatar' }, u.name || u.email),
        }),
      );

    const htmlUk = renderAfgemeld('uk');
    const htmlNl = renderAfgemeld('nl');
    const htmlBezigUk = renderAfgemeld('uk', 'g-1');
    check(
      'стан до входу (uk): відмальовує єдину оболонку AccountMenuV3 зі збереженими записами, кнопкою входу, хрестиком видалення, темою+палітрою, мовою й правовими посиланнями без технічного простору чи виходу з поточного',
      htmlUk.includes('data-am3-signed-out="ja"') &&
        htmlUk.includes('Облікові записи') &&
        htmlUk.includes('Збережені облікові записи (1)') &&
        htmlUk.includes('pavlo@tarasevych.com') &&
        htmlUk.includes('Повторний вхід через Google') &&
        htmlUk.includes('Прибрати запис: pavlo@tarasevych.com') &&
        htmlUk.includes('Увійти в інший обліковий запис') &&
        htmlUk.includes('am3-palette-btn') &&
        htmlUk.includes('Політика конфіденційності') &&
        !htmlUk.includes('Вийти з поточного') &&
        !htmlUk.includes('data-ruimtes-menu="1"'),
    );
    check(
      'стан до входу (nl): повна нідерландська локалізація без залишків українських підписів інтерфейсу',
      htmlNl.includes('data-am3-signed-out="ja"') &&
        htmlNl.includes('Accounts') &&
        htmlNl.includes('Bewaarde accounts (1)') &&
        htmlNl.includes('Opnieuw aanmelden met Google') &&
        htmlNl.includes('Aanmelden bij een ander account') &&
        htmlNl.includes('Privacybeleid') &&
        !htmlNl.includes('Afmelden (huidig)') &&
        !htmlNl.includes('Облікові записи'),
    );
    check(
      'стан очікування при запуску входу зі збереженого запису показує індикатор обертання та підпис переходу',
      htmlBezigUk.includes('am3-acc-spinner') &&
        htmlBezigUk.includes('Переходимо до входу…') &&
        htmlBezigUk.includes('aria-busy="true"'),
    );
  } finally {
    for (const [k, d] of bewaard) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete g[k];
    }
    delete g.__TSV_CANONICAL_SERVICE__;
  }

  return einde();
}
