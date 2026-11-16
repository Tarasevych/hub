// KLEUREN-001 (15.11.2026): одна палітра акцентів і одні назви в усіх місцях вибору кольору.
// Раніше: «Теми» → «Акцентна палітра» — 4 (згодом 10), меню облікового запису — 8, картка «Макета» — 4, довідник «Макета» — 4 акценти
// з позначкою «лише макет» і 4 палітри замість 7; той самий cyan звався «Ціан» і «Бірюзовий». Тест стереже, щоб набори знову не роз'їхалися.
// Eén set accenten en één set namen op elke plek waar een kleur gekozen wordt.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { UITERLIJK_ACCENTEN, UITERLIJK_PALETTEN } from '../../shared/uiterlijk';
import { ACCENT_KEUZES, ACCENT_NAMEN, ACCENT_TONEN, accentKeuzesMet } from '../../src/thema/weergave-stijl';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('kleuren-001-een-bron');
  const menu = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const thema = lees('src/thema/WeergaveVoorkeuren.tsx');
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');

  check('кожен акцент облікового запису має назву uk/nl і тони', UITERLIJK_ACCENTEN.every((a) => ACCENT_NAMEN[a]?.uk && ACCENT_NAMEN[a]?.nl && ACCENT_TONEN[a]));
  check('назви унікальні (немає двох «Бірюзових»)', new Set(ACCENT_KEUZES.map((a) => ACCENT_NAMEN[a].uk)).size === ACCENT_KEUZES.length);
  check('давній обраний відтінок показується, доки обраний', accentKeuzesMet('amber').includes('amber') && !accentKeuzesMet(undefined).includes('amber'));
  check('меню облікового запису бере набір з accentKeuzesMet, а не власний список із 8', menu.includes('accentKeuzesMet(') && !/groep === 'vast'\)\.map/.test(menu));
  check('меню облікового запису не має власних назв акцентів', !menu.includes('OUDE_ACCENT_NAMEN') && menu.includes('ACCENT_NAMEN[accentKeuze]'));
  check('«Теми» беруть той самий набір і назви', thema.includes('accentKeuzesMet(stijl.accent)') && !thema.includes('ACCENT_NAAM:'));
  check('картка «Макета» бере ACCENT_KEUZES (не чотири кружечки)', motor.includes('ACCENT_KEUZES.concat(') && !motor.includes('["violet","cyan","pink","amber"].map'));
  check('довідник «Макета»: акцент — наявне налаштування з повним набором', motor.includes('ACCENT_KEUZES.map(id=>[ACCENT_NAMEN[id].uk') && !/група\("акцент"[^\n]*"макет"/.test(motor));
  const рядокПалітр = motor.split('\n').find((r) => r.includes('рядок("Оформлення сторінки"')) || '';
  check('довідник «Макета»: стільки палітр, скільки їх на сайті', (рядокПалітр.match(/\["/g) || []).length === UITERLIJK_PALETTEN.length);
  return einde();
}
