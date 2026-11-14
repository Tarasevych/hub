// KLASSIEK-010A (Хвиля 9А тем оформлення «Біла класика» та «Чорна класика» для піддомену керування):
// перевірка кореневої оболонки BeheerConsoleWeergave, граничних станів доступу, ущільненої службової смуги,
// секцій користувачів, ролей, каталогів, єдиного входу, пристроїв і зовнішніх додатків, а також панелі
// політики доступу штучного інтелекту BeheerAiBeleidWeergave у src/beheer-kern-maquette.css —
// відсікання студійних світлих і вітринних блоків через :not([data-maquette-stijl="klassiek"]),
// явних колірних схем обох класичних палітр, повного перевизначення похідних змінних ядра й чистих мініпалітр,
// монохромної пігулки стану у шапці MaquetteHeld, збереження всіх живих кнопок, контрасту первинних кнопок без #fff,
// плавної геометрії 16px / 11px / 999px, шапок вікон із правим відступом <= 20px, захисту рамок :not(#_mqk)
// суворо без padding і gap, табличних цифр tabular-nums та каскадної дисципліни.
// Eenheidstest voor de klassieke opmaak van de beheerconsolekern en het toegangsbeleid voor kunstmatige intelligentie (KLASSIEK-010A).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { merkContrast } from '../../src/merk/merk-register';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const RUW_WIT_KLEUR = /(?<![-\w])(?:#fff(?:fff)?|white)(?![-\w])/i;
const KLASSIEK_PREFIX = 'html.palet-maquette[data-maquette-stijl="klassiek"]';
const MQK_PREFIX = 'html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)';

const VERWACHTE_KERN_VARS: readonly [string, string][] = [
  ['--mq-accent-adm', 'var(--mq-accent)'],
  ['--mq-accent-adm-diep', 'var(--mq-accent)'],
  ['--mq-accent-adm-op', 'var(--mq-accent-op)'],
  ['--mq-adm-halo', 'transparent'],
  ['--mq-adm-halo-warm', 'transparent'],
  ['--mq-adm-halo-zacht', 'transparent'],
  ['--mq-adm-rand', 'var(--mq-rand)'],
  ['--mq-adm-rand-sterk', 'var(--mq-rand-sterk)'],
  ['--mq-adm-rand-accent', 'var(--mq-accent)'],
  ['--mq-adm-glas-diep', 'var(--mq-oppervlak)'],
  ['--mq-adm-glas-verhoogd', 'var(--mq-oppervlak-2)'],
  ['--mq-adm-glas-glans', 'transparent'],
  ['--mq-adm-code-put', 'var(--mq-oppervlak-2)'],
  ['--mq-adm-goed', 'var(--ok)'],
  ['--mq-adm-goed-zacht', 'var(--ok-zacht)'],
  ['--mq-adm-wacht', 'var(--warn)'],
  ['--mq-adm-wacht-zacht', 'var(--warn-zacht)'],
  ['--mq-adm-gevaar', 'var(--fout)'],
  ['--mq-adm-gevaar-zacht', 'var(--fout-zacht)'],
  ['--panel', 'var(--mq-oppervlak)'],
  ['--surface', 'var(--mq-oppervlak-2)'],
  ['--surface2', 'var(--mq-oppervlak-2)'],
  ['--border', 'var(--mq-rand)'],
  ['--line', 'var(--mq-rand)'],
  ['--text', 'var(--mq-tekst)'],
  ['--muted', 'var(--mq-gedempt)'],
  ['--faint', 'var(--mq-stil)'],
  ['--accent', 'var(--mq-accent)'],
  ['--accenttext', 'var(--mq-accent-op)'],
  ['--text-on-accent', 'var(--mq-accent-op)'],
  ['--accent-soft', 'var(--mq-oppervlak-zacht)'],
  ['--danger', 'var(--fout)'],
  ['--focus', 'var(--mq-accent)'],
];

function inhoudBuitenMediaBlokken(cssInhoud: string, eersteMediaIndex: number): string {
  if (eersteMediaIndex < 0) return 'GEEN_MEDIA';
  const staart = cssInhoud.slice(eersteMediaIndex);
  let diepte = 0;
  let inMedia = false;
  let buiten = '';
  let i = 0;
  while (i < staart.length) {
    if (!inMedia) {
      const rest = staart.slice(i);
      const overeenkomst = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*[^{]+\{/);
      if (overeenkomst) {
        inMedia = true;
        diepte = 1;
        i += overeenkomst[0].length;
        continue;
      }
      buiten += staart[i];
      i += 1;
    } else {
      const teken = staart[i];
      if (teken === '{') diepte += 1;
      else if (teken === '}') {
        diepte -= 1;
        if (diepte === 0) inMedia = false;
      }
      i += 1;
    }
  }
  return buiten.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

function rechterPaddingPx(paddingWaarde: string): number {
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechts = delen[1] ?? delen[0] ?? '';
  if (rechts === '0') return 0;
  const overeenkomst = /^(-?\d+(?:\.\d+)?)px$/.exec(rechts);
  return overeenkomst ? Number(overeenkomst[1]) : Number.NaN;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-010a-beheer-kern');

  const consoleTsxPad = 'src/BeheerConsoleWeergave.tsx';
  const aiBeleidTsxPad = 'src/BeheerAiBeleidWeergave.tsx';
  const cssPad = 'src/beheer-kern-maquette.css';
  const kernKlassiekPad = 'src/maquette-kern/maquette-klassiek.css';
  const controlePad = 'tests/eenheid/klassiek-010a-beheer-kern.test.ts';

  const consoleTsx = readFileSync(consoleTsxPad, 'utf8');
  const aiBeleidTsx = readFileSync(aiBeleidTsxPad, 'utf8');
  const cssBron = readFileSync(cssPad, 'utf8');
  const kernKlassiekCss = readFileSync(kernKlassiekPad, 'utf8');
  const zelfBron = readFileSync(controlePad, 'utf8');

  const idxKlassiekTitel = cssBron.indexOf('6. ДІЛОВЕ МОНОХРОМНЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-010A');
  const idxKlassiek = idxKlassiekTitel > 0 ? cssBron.lastIndexOf('/*', idxKlassiekTitel) : -1;
  const idxEersteMedia = cssBron.search(/@media\s*\(/);
  const studioRauw = idxKlassiek > 0 ? cssBron.slice(0, idxKlassiek) : '';
  const klassiekPcRauw =
    idxKlassiek > 0 && idxEersteMedia > idxKlassiek ? cssBron.slice(idxKlassiek, idxEersteMedia) : '';
  const klassiekPcZonderCommentaar = klassiekPcRauw.replace(/\/\*[\s\S]*?\*\//g, '');

  const alleRegels = leesCss(cssBron);
  const studioRegels = leesCss(studioRauw);
  const klassiekPcRegels = leesCss(klassiekPcRauw);
  const klassiekMediaRegels = alleRegels.filter(
    (r) => r.media.length > 0 && r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]')),
  );
  const alleKlassiekRegels = [...klassiekPcRegels, ...klassiekMediaRegels];

  const declKaart = (r: (typeof alleRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Відсікання студійних світлих режимів, примусово темних вітринних шапок та студійних правил flat-content.
  const studioLichtRegels = studioRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light'),
    ),
  );
  const studioHeldRegels = studioRegels.filter((r) => r.selectors.some((s) => s.includes('>.mq-held')));
  const studioFlatRegels = studioRegels.filter((r) =>
    r.selectors.some((s) => s.includes('[data-surface-model="flat-content"]')),
  );
  check(
    'у студійній частині beheer-kern-maquette.css усі чотири світлі селектори, обидва блоки >.mq-held та всі три правила обходу flat-content відсічені через :not([data-maquette-stijl="klassiek"])',
    studioLichtRegels.length === 2 &&
      studioLichtRegels[0].selectors.length === 1 &&
      studioLichtRegels[1].selectors.length === 3 &&
      studioLichtRegels.every((r) =>
        r.selectors.every((s) => s.includes(':not([data-maquette-stijl="klassiek"])')),
      ) &&
      studioHeldRegels.length === 2 &&
      studioHeldRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      studioFlatRegels.length === 3 &&
      studioFlatRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Явні колірні схеми для «Білої класики» та «Чорної класики» і чистота префіксів класичних селекторів.
  const witSchemaRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.some((s) => s.startsWith('html.palet-klassiek-wit')) &&
      r.decls.some((d) => d.eig === 'color-scheme' && d.waarde === 'light'),
  );
  const zwartSchemaRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.some((s) => s.startsWith('html.palet-klassiek-zwart')) &&
      r.decls.some((d) => d.eig === 'color-scheme' && d.waarde === 'dark'),
  );
  check(
    'обидві класичні теми явно встановлюють color-scheme: light для palet-klassiek-wit та color-scheme: dark для palet-klassiek-zwart на всіх чотирьох контурах',
    witSchemaRegel !== undefined &&
      witSchemaRegel.selectors.length === 4 &&
      zwartSchemaRegel !== undefined &&
      zwartSchemaRegel.selectors.length === 4 &&
      klassiekPcRegels.length >= 45 &&
      klassiekMediaRegels.length >= 8 &&
      alleKlassiekRegels.every((r) =>
        r.selectors.every(
          (s) =>
            s.startsWith(KLASSIEK_PREFIX) ||
            s.startsWith('html.palet-klassiek-wit') ||
            s.startsWith('html.palet-klassiek-zwart') ||
            s.startsWith('html.palet-maquette.palet-klassiek-wit') ||
            s.startsWith('html.palet-maquette.palet-klassiek-zwart'),
        ),
      ),
  );

  // 3. Перевизначення всіх похідних змінних ядра керування на .admin-console, .mq-admin-boundary, .admin-key-dialog та .aib-venster-laag.
  const varRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console`) &&
      r.selectors.includes(`${KLASSIEK_PREFIX} .mq-admin-boundary`) &&
      r.selectors.includes(`${KLASSIEK_PREFIX} .admin-key-dialog`) &&
      r.selectors.includes(`${KLASSIEK_PREFIX}[data-presentation-service="admin"] .aib-venster-laag`) &&
      r.decls.some((d) => d.eig === '--mq-accent-adm'),
  );
  const varKaart = declKaart(varRegel);
  check(
    'класичний корінь перевизначає всі 33 змінні поверхонь, рамок та семантичних станів (--mq-adm-goed/--wacht/--gevaar -> --ok/--warn/--fout) на всіх чотирьох цільових вузлах',
    VERWACHTE_KERN_VARS.every(([eig, waarde]) => varKaart.get(eig) === waarde) &&
      klassiekPcZonderCommentaar.includes('--accentText: var(--mq-accent-op);'),
  );

  // 4. Чистота змінних мініпалітр (--aib-*, --aiz-*) винятково на семантичних і монохромних змінних без #hex, rgb() чи color-mix().
  const miniDecls = alleKlassiekRegels.flatMap((r) =>
    r.decls.filter((d) => d.eig.startsWith('--aib-') || d.eig.startsWith('--aiz-')),
  );
  check(
    'усі 17 змінних мініпалітр (--aib-*, --aiz-*) використовують винятково чисті змінні var(--ok/--warn/--fout/--mq-...) без жодного #hex, rgb() чи color-mix()',
    miniDecls.length === 17 &&
      miniDecls.every(
        (d) =>
          /^var\(--(?:ok|ok-zacht|warn|warn-zacht|fout|fout-zacht|info|info-zacht|mq-[a-z0-9-]+)\)$/.test(
            d.waarde,
          ) && !/#|rgba?\(|color-mix/i.test(d.waarde),
      ),
  );

  // 5. Монохромна пігулка .mq-admin-held-status у компактній діловій шапці MaquetteHeld.
  const heldStatusRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console.mq-schil .mq-admin-held-status`),
  );
  const heldStatusSvgRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console.mq-schil .mq-admin-held-status svg`),
  );
  const heldStatusKaart = declKaart(heldStatusRegel);
  check(
    'пігулка .mq-admin-held-status оформлена як охайна монохромна пігулка (border: 1px solid var(--mq-rand), background: var(--mq-oppervlak-2), color: var(--mq-tekst), svg -> var(--mq-accent))',
    heldStatusKaart.get('border') === '1px solid var(--mq-rand)' &&
      heldStatusKaart.get('background') === 'var(--mq-oppervlak-2)' &&
      heldStatusKaart.get('color') === 'var(--mq-tekst)' &&
      heldStatusKaart.get('border-radius') === '999px' &&
      heldStatusKaart.get('box-shadow') === 'none' &&
      declKaart(heldStatusSvgRegel).get('color') === 'var(--mq-accent)',
  );

  // 6. Ущільнена ділова смуга .admin-title під MaquetteHeld зі збереженням усіх живих кнопок на вкладках керування.
  const titleRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console .admin-title`) &&
      r.decls.some((d) => d.eig === 'min-height'),
  );
  const titleKaart = declKaart(titleRegel);
  const verborgenKnopRegel = alleKlassiekRegels.some((r) =>
    r.decls.some((d) => d.eig === 'display' && d.waarde === 'none'),
  );
  check(
    'смуга .admin-title ущільнена в однорядкову ділову панель (min-height: 46px, border-radius: 16px), а всі робочі кнопки (.admin-codes-toggle, Оновити та дії вкладок) повністю збережені',
    titleKaart.get('min-height') === '46px' &&
      titleKaart.get('padding') === '8px 14px' &&
      titleKaart.get('border-radius') === '16px' &&
      titleKaart.get('background') === 'var(--mq-oppervlak)' &&
      titleKaart.get('background-image') === 'none' &&
      !verborgenKnopRegel &&
      consoleTsx.includes("className='admin-codes-toggle'") &&
      consoleTsx.includes("tr(lang,'Оновити','Vernieuwen')") &&
      consoleTsx.includes("tr(lang,'Зберегти політику','Beleid opslaan')") &&
      consoleTsx.includes("tr(lang,'Зберегти політику єдиного входу','Beleid voor eenmalige aanmelding opslaan')") &&
      consoleTsx.includes("tr(lang,'Застосувати роль','Rol toepassen')") &&
      aiBeleidTsx.includes("className='aib-hoofd'"),
  );

  // 7. Первинні кнопки на всіх вкладках і у вікнах керування: винятково var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff і var(--mq-wit).
  const primKnopRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console .admin-section>button`),
  );
  const primKaart = declKaart(primKnopRegel);
  const primSelectoren = primKnopRegel?.selectors.join(' | ') ?? '';
  const witPrimairContrast = merkContrast('#ffffff', '#181c24');
  const zwartPrimairContrast = merkContrast('#0c0e12', '#f3f4f6');
  check(
    'усі 10 селекторів первинних кнопок мають var(--mq-knop-primair-bg), var(--mq-knop-primair-tekst), border-radius: 11px і box-shadow: none (контраст ≥ 16:1, нуль #fff і нуль var(--mq-wit))',
    primKaart.get('background') === 'var(--mq-knop-primair-bg)' &&
      primKaart.get('background-image') === 'none' &&
      primKaart.get('color') === 'var(--mq-knop-primair-tekst)' &&
      primKaart.get('border') === '1px solid var(--mq-knop-primair-bg)' &&
      primKaart.get('border-radius') === '11px' &&
      primKaart.get('box-shadow') === 'none' &&
      [
        '.admin-section>button',
        '.admin-role-form>button',
        '.admin-directory-grid article>button',
        '.admin-access-users article>button',
        '.admin-console .aib .aib-hoofd',
        '.aib-venster-laag .aib .aib-hoofd',
        '.ns .ns-hoofd',
        '.tga-knop.tga-knop-hoofd',
        '.tga-sectie .tga-aanmeld-knop',
        '.apb-knop.apb-knop-hoofd',
      ].every((onderdeel) => primSelectoren.includes(onderdeel)) &&
      kernKlassiekCss.includes('--mq-knop-primair-bg: var(--mq-accent);') &&
      witPrimairContrast >= 16 &&
      zwartPrimairContrast >= 16 &&
      !klassiekPcZonderCommentaar.includes('var(--mq-wit)') &&
      !RUW_WIT_KLEUR.test(klassiekPcZonderCommentaar),
  );

  // 8. Плавні заокруглення 16px і суцільні матові поверхні для всіх секцій, граничних станів, карток, панелей політик ШІ, черги .aib-wachtrij та .ns.
  const grote16Onderdelen = [
    '.admin-boundary.mq-admin-boundary',
    '.admin-console .admin-title',
    '.admin-console .admin-notice',
    '.admin-console .admin-honest-state',
    '.admin-console .admin-section',
    '.admin-console .admin-cards article',
    '.admin-console .admin-table article',
    '.admin-console .admin-directory-grid article',
    '.admin-console .admin-access-users article',
    '.admin-console .admin-retired-accounts article',
    '.admin-console>.aib',
    '.aiz-detail',
    '.admin-console .ns',
    '.admin-console .aiz .aiz-kaart',
    '.admin-console .aiz-groep',
    '.admin-console .aib-keuze',
    '.admin-console .aib-wachtrij',
  ];
  check(
    'усі секції, граничні стани .mq-admin-boundary, картки користувачів/пристроїв/додатків/ролей/політик ШІ, .aib-wachtrij та .ns мають border-radius: 16px і матове тло без background-image',
    grote16Onderdelen.every((onderdeel) => {
      const r = klassiekPcRegels.find(
        (regel) =>
          !regel.selectors.some((s) => s.includes(':not(#_mqk)')) &&
          regel.selectors.some((s) => s.includes(onderdeel)) &&
          regel.decls.some((d) => d.eig === 'border-radius') &&
          regel.decls.some((d) => d.eig === 'background-image'),
      );
      if (!r) return false;
      const m = declKaart(r);
      return m.get('border-radius') === '16px' && m.get('background-image') === 'none';
    }),
  );

  // 9. Модальні й спільні вікна без розмиття та з правим відступом шапок вікон суворо <= 20px (нуль порушень kopReserves).
  const sluierRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .admin-key-dialog`) &&
      r.decls.some((d) => d.eig === 'backdrop-filter'),
  );
  const vensterRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .admin-key-dialog>article`) &&
      r.selectors.includes(`${KLASSIEK_PREFIX}[data-presentation-service="admin"] .venster`) &&
      r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console .aib-venster`),
  );
  const sleutelKopRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .admin-key-dialog>article>header`),
  );
  const vensterKopRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX}[data-presentation-service="admin"] .venster>.venster-kop`),
  );
  const wachtrijRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console .aib-wachtrij`),
  );
  const sleutelKopRechts = rechterPaddingPx(declKaart(sleutelKopRegel).get('padding') ?? '');
  const vensterKopRechts = rechterPaddingPx(declKaart(vensterKopRegel).get('padding') ?? '');
  const reserves = kopReserves(cssPad, cssBron);
  check(
    'вікна та черга .aib-wachtrij не мають розмиття backdrop-filter, мають border-radius: 16px, а правий відступ шапок вікон становить <= 20px (kopReserves = 0)',
    declKaart(sluierRegel).get('backdrop-filter') === 'none' &&
      declKaart(vensterRegel).get('border-radius') === '16px' &&
      declKaart(vensterRegel).get('backdrop-filter') === 'none' &&
      declKaart(wachtrijRegel).get('backdrop-filter') === 'none' &&
      sleutelKopRechts <= 20 &&
      vensterKopRechts <= 20 &&
      reserves.length === 0,
  );

  // 10. Узгоджені радіуси 11px для кнопок, полів введення, пошуку, перемикача сегментів і кодів та 999px для пігулок станів.
  const binnen11Onderdelen = [
    '.admin-codes-toggle',
    '.admin-title button',
    ':where(input:not([type="checkbox"]):not([type="radio"]), select, textarea)',
    '.aiz .aiz-zoek input',
    '.aiz .aiz-sorteer select',
    '.admin-cards code',
    '.admin-term-code',
    '.aib-ssh',
    '.aiz-segment',
    '.aiz .aiz-seg',
    '.aib-rij',
    '.aiz-avatar',
  ];
  const pillen999Onderdelen = [
    '.mq-admin-held-status',
    '.admin-title span',
    '.admin-cards b',
    '.admin-recht',
    '.aiz .aiz-chip',
    '.aib-status',
    '.aib-teller',
    '.aib-balk',
    'span.aiz-stand',
    '.ns-chip',
  ];
  const alleKlassiekeStralen = alleKlassiekRegels.flatMap((r) =>
    r.decls.filter((d) => d.eig === 'border-radius').map((d) => d.waarde),
  );
  check(
    'кнопки, поля введення, пошук, сегменти й коди мають радіус 11px, пігулки станів і жетони — 999px, а всі класичні радіуси належать винятково до {16px, 11px, 999px}',
    binnen11Onderdelen.every((onderdeel) =>
      klassiekPcRegels.some(
        (r) =>
          r.selectors.some((s) => s.includes(onderdeel)) &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px'),
      ),
    ) &&
      pillen999Onderdelen.every((onderdeel) =>
        klassiekPcRegels.some(
          (r) =>
            r.selectors.some((s) => s.includes(onderdeel)) &&
            r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '999px'),
        ),
      ) &&
      alleKlassiekeStralen.length >= 25 &&
      alleKlassiekeStralen.every((w) => w === '16px' || w === '11px' || w === '999px'),
    alleKlassiekeStralen.filter((w) => w !== '16px' && w !== '11px' && w !== '999px').join(', '),
  );

  // 11. Правила захисту рамок поверх flat-content через :not(#_mqk) суворо без padding і без gap.
  const mqkRegels = alleKlassiekRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'обидва класичні правила захисту рамок :not(#_mqk) містять винятково border, border-inline, border-radius: 16px та box-shadow — нуль padding і нуль gap',
    mqkRegels.length === 2 &&
      mqkRegels.every(
        (r) =>
          r.selectors.every((s) => s.startsWith(MQK_PREFIX) && s.includes(':not([data-mq-a12])')) &&
          r.decls.some((d) => d.eig === 'border') &&
          r.decls.some((d) => d.eig === 'border-inline') &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') &&
          r.decls.some((d) => d.eig === 'box-shadow'),
      ) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 12. Відсутність градієнтів, розмиття, color-mix() і зсувів при наведенні, беззасічковий гротеск заголовків та табличні цифри tabular-nums.
  const kopFontRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .admin-console :is(h1, h2, h3, h4)`),
  );
  const tabularRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.some((s) => s.includes('.admin-term-code') && s.includes('.aib-timer dd')) &&
      r.decls.some((d) => d.eig === 'font-variant-numeric' && d.waarde === 'tabular-nums'),
  );
  const hoverZonderSprong = klassiekMediaRegels.some(
    (r) =>
      r.media.some((m) => m.includes('hover: hover')) &&
      r.selectors.some((s) => s.includes('.admin-section>button:hover:not(:disabled)')) &&
      r.decls.some((d) => d.eig === 'transform' && d.waarde === 'none') &&
      r.decls.some((d) => d.eig === 'box-shadow' && d.waarde === 'none'),
  );
  check(
    'класичний розділ не містить gradient, blur(), color-mix(), rgb() чи translateY/scale(), встановлює гротеск без засічок і табличні цифри tabular-nums',
    !/gradient/i.test(klassiekPcZonderCommentaar) &&
      !/blur\(/i.test(klassiekPcZonderCommentaar) &&
      !/translateY|translateX|scale\(/i.test(klassiekPcZonderCommentaar) &&
      !/color-mix|rgba?\(|#[0-9a-f]{3,8}/i.test(klassiekPcZonderCommentaar) &&
      declKaart(kopFontRegel).get('font-family') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      declKaart(kopFontRegel).get('font-style') === 'normal' &&
      tabularRegel !== undefined &&
      hoverZonderSprong,
  );

  // 13. Каскадна дисципліна: нуль !important, prefers-color-scheme, position: fixed; усі настільні правила стоять перед першим @media; мобільні відступи перемагають.
  const buitenMedia = inhoudBuitenMediaBlokken(cssBron, idxEersteMedia);
  const sectieSel = `${KLASSIEK_PREFIX} .admin-console .admin-section`;
  const aibSel = `${KLASSIEK_PREFIX} .admin-console>.aib`;
  const titleSel = `${KLASSIEK_PREFIX} .admin-console .admin-title`;
  const boundarySel = `${KLASSIEK_PREFIX} .admin-boundary.mq-admin-boundary`;
  const kaartSel = `${KLASSIEK_PREFIX} .admin-console .admin-access-users article`;
  const detailSel = `${KLASSIEK_PREFIX} .admin-console .aiz-detail`;
  check(
    'немає !important, prefers-color-scheme чи position: fixed, увесь класичний настільний розділ стоїть перед першим @media, а на 390×844 перемагають мобільні відступи',
    !/!\s*important/i.test(cssBron) &&
      !/prefers-color-scheme/i.test(cssBron) &&
      !/position\s*:\s*fixed/i.test(cssBron) &&
      idxKlassiek > 0 &&
      idxEersteMedia > idxKlassiek &&
      buitenMedia === '' &&
      wint(alleRegels, sectieSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(alleRegels, sectieSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(alleRegels, aibSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(alleRegels, aibSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(alleRegels, titleSel, 'padding', pcProfiel)?.waarde === '8px 14px' &&
      wint(alleRegels, titleSel, 'padding', telProfiel)?.waarde === '10px 12px' &&
      wint(alleRegels, boundarySel, 'padding', pcProfiel)?.waarde === '32px 28px' &&
      wint(alleRegels, boundarySel, 'padding', telProfiel)?.waarde === '22px 18px' &&
      wint(alleRegels, kaartSel, 'padding', pcProfiel)?.waarde === '14px 16px' &&
      wint(alleRegels, kaartSel, 'padding', telProfiel)?.waarde === '12px 14px' &&
      wint(alleRegels, detailSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(alleRegels, detailSel, 'padding', telProfiel)?.waarde === '12px 14px',
  );

  // 14. Абсолютний мовний закон у всіх файлах контуру KLASSIEK-010A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [consoleTsxPad, consoleTsx],
    [aiBeleidTsxPad, aiBeleidTsx],
    [cssPad, cssBron],
    [controlePad, zelfBron],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден із файлів контуру KLASSIEK-010A не містить заборонених літер російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
