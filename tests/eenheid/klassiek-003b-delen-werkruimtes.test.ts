// KLASSIEK-003B (Хвиля 2 тем оформлення «Біла класика» та «Чорна класика»):
// перевірка спільного доступу, гостьового перегляду GedeeldWeergave, робочих просторів та діалогових шарів —
// відсутності подвійної шапки за toonStudioHeld, автономної синхронізації теми на <html>
// та прагматичного класичного шару в cloud-delen-maquette.css.
// Eenheidstest voor de zakelijke klassieke weergave van gedeelde koppelingen, werkruimtes en dialooglagen.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-003b-delen-werkruimtes');

  const gedeeldWeergave = readFileSync('src/cloud-vnext/GedeeldWeergave.tsx', 'utf8');
  const delenCss = readFileSync('src/cloud-vnext/cloud-delen-maquette.css', 'utf8');
  const zelf = readFileSync('tests/eenheid/klassiek-003b-delen-werkruimtes.test.ts', 'utf8');

  // 1. GedeeldWeergave.tsx: вимкнення студійної вітрини MaquetteHeld у Класиці за toonStudioHeld зі збереженням оболонки mq-schil.
  const aantalToonStudioHeld = (gedeeldWeergave.match(/\{toonStudioHeld\s*\?\s*\(\s*<MaquetteHeld/g) ?? []).length;
  const aantalMaquetteHeld = (gedeeldWeergave.match(/<MaquetteHeld\b/g) ?? []).length;

  check(
    'GedeeldWeergave обчислює toonStudioHeld = isMaquette && !isKlassiek і переводить усі 5 викликів MaquetteHeld на toonStudioHeld без подвійної шапки',
    gedeeldWeergave.includes('useIsKlassiekMaquette') &&
      gedeeldWeergave.includes('const isKlassiek = useIsKlassiekMaquette();') &&
      gedeeldWeergave.includes('const toonStudioHeld = isMaquette && !isKlassiek;') &&
      aantalMaquetteHeld === 5 &&
      aantalToonStudioHeld === 5 &&
      !/\{isMaquette\s*\?\s*\(\s*<MaquetteHeld/.test(gedeeldWeergave),
  );

  check(
    'GedeeldWeergave зберігає poortSchilKlas, openSchilKlas і mqDienstAttr на isMaquette для присутності .mq-schil та data-mq-dienst у Класиці',
    gedeeldWeergave.includes("const poortSchilKlas = isMaquette ? 'cvn cvn-gedeeld-scherm mq-schil' : 'cvn cvn-gedeeld-scherm';") &&
      gedeeldWeergave.includes("const openSchilKlas = isMaquette ? 'cvn cvn-gedeeld-weergave mq-schil' : 'cvn cvn-gedeeld-weergave';") &&
      gedeeldWeergave.includes("const mqDienstAttr = isMaquette ? ({ 'data-mq-dienst': 'cloud' } as const) : {};"),
  );

  // 2. GedeeldWeergave.tsx: автономна синхронізація класів палітри та атрибута data-maquette-stijl на <html>.
  check(
    'GedeeldWeergave синхронізує класи palet-klassiek-wit / palet-klassiek-zwart, palet-maquette і data-maquette-stijl="klassiek" на documentElement',
    gedeeldWeergave.includes('useEffect(() => {') &&
      gedeeldWeergave.includes('document.documentElement.dataset.maquetteStijl') &&
      gedeeldWeergave.includes('isKlassiekPalet(') &&
      gedeeldWeergave.includes('leesKeuze(') &&
      gedeeldWeergave.includes("wortel.classList.add(`palet-${gekozenPalet}`, 'palet-maquette');") &&
      gedeeldWeergave.includes("wortel.dataset.maquetteStijl = 'klassiek';"),
  );

  // 3. cloud-delen-maquette.css: розташування класичного шару суворо перед першим @media (max-width: ...).
  const eersteMaxMedia = delenCss.search(/@media\s*\(\s*max-width/);
  const idxKlassiekBlok = delenCss.indexOf('html.palet-maquette[data-maquette-stijl="klassiek"] body');
  const cssZonderCommentaar = delenCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const eersteMaxZonderCommentaar = cssZonderCommentaar.search(/@media\s*\(\s*max-width/);
  const naMedia =
    eersteMaxZonderCommentaar >= 0
      ? cssZonderCommentaar
          .slice(eersteMaxZonderCommentaar)
          .replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
          .trim()
      : 'GEEN_MEDIA';

  check(
    'cloud-delen-maquette.css оголошує розділ Класики html.palet-maquette[data-maquette-stijl="klassiek"] body суворо перед першим @media (max-width)',
    idxKlassiekBlok > 0 && eersteMaxMedia > idxKlassiekBlok,
  );

  const klassiekDeel = delenCss.slice(idxKlassiekBlok, eersteMaxMedia);

  // 4. Охоплення воріт доступу, гостьового перегляду, полиць робочих просторів та портального шару .cvn-laag із радіусом 16px.
  check(
    'класичний блок у cloud-delen-maquette.css оформлює .cvn-gedeeld-poortkaart, .cvn-gedeeld-held, .cvn-werkruimtes і .cvn-laag на матовому полотні з радіусом 16px без кольорових ореолів',
    klassiekDeel.includes('--mq-straal-kaart: 16px;') &&
      klassiekDeel.includes('--mq-gloed: transparent;') &&
      klassiekDeel.includes('.cvn-gedeeld-poortkaart') &&
      klassiekDeel.includes('.cvn-gedeeld-held') &&
      klassiekDeel.includes('.cvn-gedeeld-pagina') &&
      klassiekDeel.includes('.cvn-werkruimtes') &&
      klassiekDeel.includes('.cvn-werkruimtes > .cvn-blok') &&
      klassiekDeel.includes('.cvn-ws-kaart') &&
      klassiekDeel.includes('.cvn-laag') &&
      klassiekDeel.includes('.cvn-laag-vak') &&
      klassiekDeel.includes('.cvn-laag-venster') &&
      klassiekDeel.includes('.cvn-laag-paneel') &&
      klassiekDeel.includes('border-radius: var(--mq-straal-kaart);') &&
      klassiekDeel.includes('background-image: none;') &&
      klassiekDeel.includes('backdrop-filter: none;') &&
      !/radial-gradient|linear-gradient/i.test(klassiekDeel),
  );

  // 5. Кнопки, поля вводу, пігулки, перемикачі з радіусом 11px та суцільні контрастні головні кнопки .cvn-knop.is-hoofd.
  check(
    'класичний блок задає радіус 11px для .cvn-knop, полів вводу, пігулок і перемикачів та суцільні головні кнопки .cvn-knop.is-hoofd без #fff і градієнтів',
    klassiekDeel.includes('--mq-straal-knop: 11px;') &&
      klassiekDeel.includes('border-radius: var(--mq-straal-knop);') &&
      klassiekDeel.includes('.cvn-knop.is-hoofd') &&
      klassiekDeel.includes('background: var(--mq-knop-primair-bg);') &&
      klassiekDeel.includes('color: var(--mq-knop-primair-tekst);') &&
      klassiekDeel.includes('border-color: var(--mq-knop-primair-bg);') &&
      klassiekDeel.includes('box-shadow: none;') &&
      klassiekDeel.includes('[role="tablist"]') &&
      klassiekDeel.includes('.cvn-deel-pil') &&
      !/color\s*:\s*#fff(?:fff)?\b/i.test(klassiekDeel),
  );

  // 6. Світлочутливий блок перегляду коду та текстових вирізок без примусового темного прямокутника у Білій класиці.
  check(
    'блок перегляду коду .cvn-gedeeld-codeblok, .cvn-gedeeld-codekop, .cvn-deel-code-voorbeeld і .cvn-deel-code-regel працює на світлочутливих змінних var(--mq-*) без темних шістнадцяткових кольорів',
    klassiekDeel.includes('.cvn-gedeeld-codeblok') &&
      klassiekDeel.includes('.cvn-gedeeld-codekop') &&
      klassiekDeel.includes('.cvn-deel-code-voorbeeld') &&
      klassiekDeel.includes('.cvn-deel-code-regel') &&
      klassiekDeel.includes('background: var(--mq-oppervlak-2);') &&
      klassiekDeel.includes('background: var(--mq-oppervlak-zacht);') &&
      klassiekDeel.includes('color: var(--mq-tekst);') &&
      klassiekDeel.includes('color: var(--mq-stil);') &&
      !/#[0-9a-f]{3,8}\b/i.test(klassiekDeel),
  );

  // 7. Ділова типографіка без засічок та табличні цифри tabular-nums.
  check(
    'заголовки h1–h4 переведено на гротеск var(--mq-font-ui) без курсиву, а лічильники, обсяги байтів, терміни дії та номери рядків коду мають tabular-nums',
    klassiekDeel.includes(':is(h1, h2, h3, h4)') &&
      klassiekDeel.includes('font-family: var(--mq-font-ui);') &&
      klassiekDeel.includes('font-style: normal;') &&
      klassiekDeel.includes('font-variant-numeric: tabular-nums;') &&
      klassiekDeel.includes('.cvn-deel-code-regel i') &&
      klassiekDeel.includes('.cvn-gedeeld-tellers') &&
      klassiekDeel.includes('.cvn-deel-bestaande-cijfers'),
  );

  // 8. Непорушні інваріанти каскаду стилів і розміщення шапок вікон.
  check(
    'cloud-delen-maquette.css не містить !important, prefers-color-scheme, position:fixed чи завищеного padding-right на .cvn-laag-kop, а всі @media (max-width) стоять наприкінці файла',
    !/!important/i.test(delenCss) &&
      !/prefers-color-scheme/i.test(delenCss) &&
      !/position\s*:\s*fixed/i.test(delenCss) &&
      !/\.cvn-laag-kop[^{]*\{[^}]*padding-right\s*:/i.test(delenCss) &&
      eersteMaxZonderCommentaar > 0 &&
      naMedia === '',
  );

  // 9. Мовна чистота всіх змінених і створених файлів ділянки KLASSIEK-003B.
  const bestanden: readonly [string, string][] = [
    ['src/cloud-vnext/GedeeldWeergave.tsx', gedeeldWeergave],
    ['src/cloud-vnext/cloud-delen-maquette.css', delenCss],
    ['tests/eenheid/klassiek-003b-delen-werkruimtes.test.ts', zelf],
  ];
  const overtredingen = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-003B не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
