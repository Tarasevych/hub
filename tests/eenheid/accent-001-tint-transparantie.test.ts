// ACCENT-001 (15.11.2026): «Улюблений відтінок» — акцент облікового запису поверх БУДЬ-ЯКОЇ палітри, і прозорий режим блоків.
// Без браузера й бази (поведінку в справжньому Chromium перевірено на стенді /mnt/project-files/accent-001/stand/reeks.mjs).
// Voorkeurstint als accent boven elk palet en doorschijnende blokken. Zonder browser en database.
//
// Перевіряє: (1) збереження в обліковому записі — 12 акцентів, прозорість 1–100, сміття відкидається, старі записи працюють;
// (2) контраст восьми нових відтінків у кожній палітрі (зокрема родини «Макет» і класик); (3) шар акценту збігається з генератором
// і має специфічність вищу за правила сервісів «Макета» (:not(#_mq)); (4) прозорість — без backdrop-filter, меню/вікна/поля
// лишаються суцільними, системне «зменшити прозорість» має перевагу; (5) меню облікового запису більше не робить відтінок палітрою.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { normaliseerUiterlijkRuimte, UITERLIJK_ACCENTEN, UITERLIJK_TRANSPARANTIE_STANDAARD_AAN } from '../../shared/uiterlijk';
import { ACCENT_KEUZES, ACCENT_TONEN, blokDekking, pasWeergaveStijlToe } from '../../src/thema/weergave-stijl';
import { contrast, kleurWaarden, KLASSIEK_WIT, KLASSIEK_ZWART, MAQUETTE, PUUR, SECTIES } from '../../src/thema/paletten';
import { ACCOUNTMENU_V3_VASTE_TINTEN, volgendePaletKeuze } from '../../src/accountmenu-v3/accountmenu-v3-voorkeuren';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('accent-001-tint-transparantie');

  // 1. Opslag.
  check('усі вісім відтінків меню — дійсні акценти облікового запису', ACCOUNTMENU_V3_VASTE_TINTEN.every((t) => (UITERLIJK_ACCENTEN as readonly string[]).includes(t)));
  check('давні акценти (violet, cyan, pink, amber) лишаються дійсними', ['violet', 'cyan', 'pink', 'amber'].every((a) => normaliseerUiterlijkRuimte({ accent: a }).accent === a));
  check('невідомий акцент відкидається', !('accent' in normaliseerUiterlijkRuimte({ accent: 'zuurstok' })));
  check('прозорість: 1–100 зберігається цілим числом', normaliseerUiterlijkRuimte({ transparantie: 42.6 }).transparantie === 43 && normaliseerUiterlijkRuimte({ transparantie: 100 }).transparantie === 100);
  check('прозорість: 0, від’ємне, > 100, булеве й рядок-сміття — поля немає (суцільні блоки)',
    [0, -5, 101, true, 'x', null].every((v) => !('transparantie' in normaliseerUiterlijkRuimte({ transparantie: v }))));
  check('старий запис без нових полів — без змін', JSON.stringify(normaliseerUiterlijkRuimte({ versie: 1, palet: 'grifel' })) === JSON.stringify({ versie: 1, palet: 'grifel' }));
  check('типовий рівень під час вмикання — помірний (≤ 60 %)', UITERLIJK_TRANSPARANTIE_STANDAARD_AAN > 0 && UITERLIJK_TRANSPARANTIE_STANDAARD_AAN <= 60);
  check('непрозорість підкладки: 0 → 1 (суцільно), 100 → не нижче 0,3 (текст читається), монотонно',
    blokDekking(0) === 1 && blokDekking(100) >= 0.3 && blokDekking(30) > blokDekking(60) && blokDekking(undefined) === 1);
  check('у виборі — вісім відтінків меню плюс фіолетовий і ціан; «pink»/«amber» лише поки обрані',
    ACCOUNTMENU_V3_VASTE_TINTEN.every((t) => ACCENT_KEUZES.includes(t)) && !ACCENT_KEUZES.includes('pink') && !ACCENT_KEUZES.includes('amber'));

  // 2. Контраст у кожній палітрі (6-значні тла; заливка ≥ 3:1, текст на заливці ≥ 4,5:1, текст на м'якій підкладці ≥ 4,5:1).
  const licht = [...SECTIES.flatMap((s) => [kleurWaarden(s).licht.bg, kleurWaarden(s).licht.panel, kleurWaarden(s).licht.surface]), PUUR.licht.bg, PUUR.licht.surface, MAQUETTE.licht.bg, MAQUETTE.licht.surface, KLASSIEK_WIT.bg, KLASSIEK_WIT.surface];
  const donker = [...SECTIES.flatMap((s) => [kleurWaarden(s).donker.bg, kleurWaarden(s).donker.panel, kleurWaarden(s).donker.surface]), PUUR.donker.bg, PUUR.donker.surface, MAQUETTE.donker.bg, MAQUETTE.donker.surface, KLASSIEK_ZWART.bg, KLASSIEK_ZWART.surface];
  const slecht: string[] = [];
  for (const id of ACCOUNTMENU_V3_VASTE_TINTEN) {
    const t = ACCENT_TONEN[id];
    if (!t) { slecht.push(`${id}: geen tonen`); continue; }
    for (const [toon, tla, tekst] of [['licht', licht, '#17212b'], ['donker', donker, '#f3f6f8']] as const) {
      const w = t[toon];
      if (contrast(w.accent, w.tekst) < 4.5) slecht.push(`${id}/${toon} tekst`);
      for (const bg of tla) if (contrast(w.accent, bg) < 3) slecht.push(`${id}/${toon} op ${bg}`);
      if (contrast(tekst, w.zacht) < 4.5) slecht.push(`${id}/${toon} zacht`);
    }
  }
  check(`контраст восьми відтінків у ${licht.length}+${donker.length} тлах усіх палітр, зокрема «Макет» і класик`, slecht.length === 0, slecht.join(' | '));

  // 3. Шар акценту.
  let generatorOk = true;
  try { execFileSync(process.execPath, ['scripts/accent-laag-css.mjs', '--controle'], { stdio: 'pipe' }); } catch { generatorOk = false; }
  check('src/thema/accent-laag.css точно відповідає генератору (scripts/accent-laag-css.mjs)', generatorOk);
  const laag = lees('src/thema/accent-laag.css');
  check('шар акценту має правило для кожного акценту в обох темах', UITERLIJK_ACCENTEN.every((a) => laag.includes(`:root[data-accent="${a}"]:is(.theme-light,.theme-plum-light)`) && laag.includes(`:root[data-accent="${a}"]:is(.theme-dark,.theme-plum-dark)`)));
  check('шар акценту перемагає правила сервісів «Макета» (два :not(#…) проти одного)', /\*:not\(#_ac1\):not\(#_ac2\)/.test(laag));
  check('шар акценту задає змінні родини «Макет» і фокус', ['--mq-accent:', '--mq-accent-rgb:', '--mq-kaart-accent:', '--mq-nacht-accent:', '--focus:'].every((v) => laag.includes(v)));
  check('шар акценту не чіпає тла, тексту й небезпечних кольорів', !/--(bg|panel|surface|text|danger|fout|mq-oppervlak|mq-tekst):/.test(zonderCommentaar(laag)));
  check('шар підключено разом із темою', /import '\.\/accent-laag\.css';/.test(lees('src/thema/useThema.ts')));
  const mq = lees('src/identiteit/maquette/maquette-omlijsting.css');
  check('«Макет» (центр облікового запису): --global для всіх восьми відтінків, світла тема — насиченіший тон',
    ACCOUNTMENU_V3_VASTE_TINTEN.every((t) => mq.includes(`[data-accent=${t}]{--global:${ACCENT_TONEN[t].donker.accent};`) && mq.includes(`.light[data-accent=${t}]{--global:${ACCENT_TONEN[t].licht.accent};`)));

  // 4. Прозорість.
  const css = lees('src/thema/weergave-stijl.css');
  const transpCss = zonderCommentaar(css.slice(css.indexOf('/* ACCENT-001 (15.11.2026): прозорий режим')));
  check('прозорість без backdrop-filter і без анімацій (досвід ZAVYSANNIA-001)', !/backdrop-filter|animation|transition/.test(transpCss));
  check('прозорість діє на поверхні оболонки й «Макета», а меню, вікна, підказки й поля лишаються суцільними',
    ['--panel:color-mix', '--surface:color-mix', '--mq-oppervlak:color-mix'].every((v) => transpCss.includes(v)) && /\[role="dialog"\], \[role="menu"\], \[role="listbox"\], \[role="tooltip"\], dialog, input, select, textarea/.test(transpCss));
  check('центр облікового запису «Макет» виключено із загального шару (має власні змінні)', transpCss.includes(':not(.mr-mq):not(.mr-mq *)') && mq.includes('html[data-transparantie="aan"] .mr-mq'));
  const wortel = { dataset: {} as Record<string, string>, stijl: new Map<string, string>(), style: { setProperty(k: string, v: string) { wortel.stijl.set(k, v); }, removeProperty(k: string) { wortel.stijl.delete(k); } } };
  pasWeergaveStijlToe({ accent: 'oranje', transparantie: 50 }, wortel);
  check('застосування: data-accent і data-transparantie на <html>, --blok-dekking за повзунком',
    wortel.dataset.accent === 'oranje' && wortel.dataset.transparantie === 'aan' && wortel.stijl.get('--blok-dekking') === String(blokDekking(50)));
  pasWeergaveStijlToe({}, wortel);
  check('скидання: атрибути й змінна прибираються (типовий вигляд)', !wortel.dataset.accent && !wortel.dataset.transparantie && !wortel.stijl.has('--blok-dekking'));

  // 5. Меню облікового запису.
  const menu = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  check('відтінок у меню пише акцент облікового запису, а не палітру', /zetWeergaveStijl\(\{ accent: isActief \? undefined : \(p\.id as UiterlijkAccent\) \}\)/.test(menu) && !/paletSync\.kies\(p\.id\);\s*\}\}\s*>\s*\{isActief \? <Check/.test(menu));
  check('давній локальний відтінок переноситься в обліковий запис', /migreerVasteTint\(/.test(menu));
  check('є «Як у палітрі» і перемикач та повзунок прозорості', /data-am3-tint-reset/.test(menu) && /data-am3-transparantie-aan/.test(menu) && /data-am3-transparantie=''/.test(menu));
  check('короткий натиск гортає лише палітри (не відтінки)', volgendePaletKeuze('violet', true) === 'kleur' && volgendePaletKeuze('puur', false) === 'kleur');
  return einde();
}
