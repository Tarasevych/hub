// KLEUREN-001 (16.11.2026): єдина зона «Вигляд і кольори». Тест стереже, щоб налаштування кольорів знову не розсипалися на стрічку
// без пояснень: один розділ з однією назвою всюди, живий приклад, три згортні шари з поточним значенням, чесний підпис «де діє»,
// і щоб «Живий фон» не мав другого блоку «Кольори» поруч із палітрою сайту.
// Eén zone «Weergave en kleuren»: één naam op elke plek, een levend voorbeeld, drie inklapbare lagen, en geen tweede blok «Kleuren».
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { ACHTERGROND_KLEUREN } from '../../shared/uiterlijk';
import { IDENTITEIT_TABS } from '../../src/identiteit/identiteit-tabs';
import { serviceTabLabel } from '../../src/dienst-tab-labels';

const lees = (p: string) => readFileSync(p, 'utf8');
// VormgevingZone тягне браузерні модулі (useThema), тому шари читаємо з тексту файла. De lagen lezen we uit de brontekst.
const ZONE_LAGEN = ['basis', 'accent', 'tlo'] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('kleuren-001-zone');
  const zone = lees('src/thema/ThemaInstellingen.tsx');
  const onderdelen = lees('src/thema/VormgevingZone.tsx');
  const css = lees('src/thema/vormgeving-zone.css');
  const voorkeuren = lees('src/thema/WeergaveVoorkeuren.tsx');
  const fon = lees('src/achtergrond/AchtergrondInstellingen.tsx');
  const knop = lees('src/achtergrond/AchtergrondKnop.tsx');
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');
  const atelier = JSON.stringify(JSON.parse(lees('src/identiteit/atelier-v49-gegevens.json')));

  // --- одна назва розділу всюди · één naam
  const tab = IDENTITEIT_TABS.find((t) => t.id === 'themes');
  check('вкладка зветься «Вигляд і кольори» / «Weergave en kleuren»', tab?.uk === 'Вигляд і кольори' && tab?.nl === 'Weergave en kleuren');
  check('та сама назва у верхній смузі сервісу', serviceTabLabel('themes', 'uk') === 'Вигляд і кольори' && serviceTabLabel('themes', 'nl') === 'Weergave en kleuren');
  check('та сама назва в «Макеті» (через генератор) і «Студії»', motor.includes('name:"Вигляд і кольори"') && motor.includes('name:"Weergave en kleuren"') && !motor.includes('name:"Теми"')
    && atelier.includes('"name":"Вигляд і кольори"') && atelier.includes('"name":"Weergave en kleuren"') && !atelier.includes('"name":"Теми"'));
  check('правка «Макета» записана в генераторі, а не лише у згенерованому файлі', lees('scripts/identiteit-maquette/motor-aanpassingen.mjs').includes('name:"Вигляд і кольори", short:"Вигляд"'));
  check('меню облікового запису веде в зону під її назвою', lees('src/accountmenu-v3/AccountMenuV3.tsx').includes('Вигляд і кольори: усі налаштування'));

  // --- будова зони · opbouw
  check('три шари в порядку накладання, кожен із поясненням uk/nl', onderdelen.includes("export const ZONE_LAGEN = ['basis', 'accent', 'tlo'] as const;") && ZONE_LAGEN.every((l) => new RegExp(l + ": \\{ uk: \\['[^']+', '[^']+'\\], nl: \\['[^']+', '[^']+'\\] \\}").test(onderdelen)));
  const volgorde = ['<VoorbeeldVenster', "<ZoneBlok laag='basis'", "<ZoneBlok laag='accent'", "<ZoneBlok laag='tlo'", '<ZoneVoet'].map((s) => zone.indexOf(s));
  check('зона: приклад → основа → акцент → тло → низ', volgorde.every((i) => i > 0) && volgorde.every((i, n) => n === 0 || i > volgorde[n - 1]));
  check('кожне налаштування — у своєму шарі (акцент окремо від прозорості й сяйва)', /laag='accent'[\s\S]*?<AccentKeuze tr=\{tr\} \/>[\s\S]*?laag='tlo'[\s\S]*?<AchtergrondInstellingen[\s\S]*?<TransparantieEnEffecten tr=\{tr\} \/>/.test(zone));
  check('заголовок блоку показує поточне значення', (zone.match(/waarde=\{/g) || []).length === 3 && onderdelen.includes('data-vz-waarde'));
  check('живий приклад стоїть на справжніх змінних теми, не на власних кольорах', ['var(--bg)', 'var(--panel)', 'var(--accent)', 'var(--text)', 'var(--line)'].every((v) => css.includes(v)) && !/\.vz-v-(blok|menu|knop)\{[^}]*#[0-9a-f]{3,6}/i.test(css));
  check('приклад показує прозорість і сяйво тими ж числами, що й сайт', onderdelen.includes('blokDekking(t)') && onderdelen.includes("'--vz-glans'") && css.includes('var(--vz-dekking') && css.includes('var(--vz-glans'));
  check('наведення й фокус на блоці чи рядку легенди підсвічують шар', onderdelen.includes('onPointerEnter={() => onWijs(laag)}') && onderdelen.includes('onFocus={() => onWijs(laag)}') && ZONE_LAGEN.every((l) => css.includes(`[data-wijs='${l}']`)));
  check('низ зони чесно каже, де діє зміна, окремо для технічного профілю', onderdelen.includes('діє на всіх сервісах сайту') && onderdelen.includes("data-vz-bereik={technisch ? 'technisch' : 'gebruiker'}"));
  check('скидання прибирає лише декоративні шари, палітра й режим лишаються', onderdelen.includes('zetWeergaveStijl({ accent: undefined, transparantie: undefined, effecten: undefined }); zetAchtergrond(undefined);'));

  // --- назви без двозначності · namen zonder dubbelzinnigheid
  check('палітра сайту й відтінки фону більше не звуться однаково «Кольори»', zone.includes("tr('Палітра сайту'") && fon.includes("tr('Відтінки фону'") && !/<h[34][^>]*>\{tr\('Кольори'/.test(zone + fon));
  check('«Як у темі» живого фону названо за тим, що воно робить: «За акцентом»', !fon.includes('Як у темі') && !knop.includes('Як у темі') && fon.includes('За акцентом') && knop.includes('За акцентом') && !voorkeuren.includes('«Як тема»'));
  check('зразки відтінків фону — один набір для карток вибору й живого прикладу', ACHTERGROND_KLEUREN.every((k) => new RegExp("\n  " + k + ": '").test(onderdelen)) && fon.includes('TLO_VOORBEELD[') && !fon.includes('KLEUR_VOORBEELD'));
  check('якорі з інших місць сайту (#thema-accent, #thema-transparantie, #thema-effecten) збережено', ["id='thema-accent'", "id='thema-transparantie'", "id='thema-effecten'"].every((s) => voorkeuren.includes(s)));

  // --- адаптивність і правила проєкту · responsief
  const mobiel = css.lastIndexOf('@media (max-width:');
  check('мобільний шар — у кінці CSS-файла', mobiel > 0 && !css.slice(mobiel).includes('@media (min-width') && css.slice(mobiel).includes('.vz-voorbeeld-vak{grid-template-columns:1fr'));
  check('у зоні немає нових position:fixed', !css.includes('position:fixed'));
  return einde();
}
