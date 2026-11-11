// Спадне меню облікового запису v3 (IDENTITEIT-008, прапорець `accountmenu-v3`):
// перевірка міграції, прапорця, Моделі В гортання палітр, Режиму А («Орбіта світлин») та Режиму Б («Секційна картка»),
// концентричного кільця 32x32 (r=15.5), світіння щитка лише за активного технічного простору та масштабування 78%..134%.
import { readFileSync } from 'node:fs';
import { evalueer, VLAG_UITLEG, type Vlag } from '../../shared/vlaggen';
import { ACCOUNTMENU_V3_VLAG } from '../../src/accountmenu-v3/vlag';
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

  // 4. Перевірка компонента та інтеграції з CanoniekAccountMenu.tsx
  const menu = readFileSync('src/CanoniekAccountMenu.tsx', 'utf8');
  const v3Tsx = readFileSync('src/accountmenu-v3/AccountMenuV3.tsx', 'utf8');
  const v3Css = readFileSync('src/accountmenu-v3/accountmenu-v3.css', 'utf8');
  const instellingen = readFileSync('src/InstellingencentrumWeergave.tsx', 'utf8');

  check('CanoniekAccountMenu відмальовує AccountMenuV3 лише за увімкненого am3', menu.includes('data-account-menu-v3={am3 ? \'aan\' : undefined}') && menu.includes('{am3 && displayUser ? (') && menu.includes('<AccountMenuV3'));
  check('Налаштування містять перемикач режимів меню v3 (AccountMenuV3Instellingen)', instellingen.includes('<AccountMenuV3Instellingen lang={p.lang}/>'));
  check('AccountMenuV3 має трикамерну орбіту, палітру Моделі В, щиток та лоток 3 умов завершення', v3Tsx.includes('am3-orbit-stage') && v3Tsx.includes('onContextMenu={opPaletContextMenu}') && v3Tsx.includes('am3-access-ring') && v3Tsx.includes('tot-technisch-einde') && v3Tsx.includes('tot-site-uitloggen'));
  check('кнопка Доступ і терміни має концентричне кільце 32x32 із r=15.5 та тематичну спливну підказку', v3Tsx.includes("viewBox='0 0 32 32'") && v3Tsx.includes("cx='16'") && v3Tsx.includes("r='15.5'") && v3Tsx.includes('am3-access-hover-tip'));
  check('щиток світиться кольором технічної смуги лише коли активний технічний простір', v3Css.includes('.am3-seg-btn.is-tech-btn svg') && v3Css.includes('color: currentColor;') && v3Css.includes('.am3-seg-btn.is-tech-btn.active svg') && v3Css.includes('color: var(--am3-shield-color'));
  check('CSS v3: без position:fixed та з підтримкою prefers-reduced-motion', !/position:\s*fixed/.test(v3Css) && v3Css.includes('prefers-reduced-motion: reduce'));

  return einde();
}
