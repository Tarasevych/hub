// ACHTERGROND-001 «Живий фон» (15.11.2026). Без браузера й бази.
// LEVENDE ACHTERGROND. Zonder browser en zonder database.
//
// Перевіряє: (1) збереження налаштувань в обліковому записі — невідомі значення відкидаються, числа в межах, типові не зберігаються,
// старі записи без поля працюють; (2) план малювання — кількість плям, полегшений режим телефона, кадри, інтенсивність;
// (3) ощадливість: малювання не використовує filter/blur і йде в окремому потоці, CSS не анімує великі шари;
// (4) кожен кадр справді малює плями (підробний 2D-контекст рахує виклики).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { ACHTERGROND_STANDAARD, achtergrondVolledig, normaliseerAchtergrond, normaliseerUiterlijkRuimte, normaliseerUiterlijkRuimtes, metUiterlijkRuimte } from '../../shared/uiterlijk';
import { maakPlan, polotno, teken, tintVan, type Ctx2D } from '../../src/achtergrond/levende-kern';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('levende-achtergrond-20261115');

  // 1. Opslag.
  check('порожній або сміттєвий запис — без поля (типовий фон)', normaliseerAchtergrond(undefined) === undefined && normaliseerAchtergrond('x') === undefined && normaliseerAchtergrond({ stand: 'boom', tempo: 'abc', kleuren: 1 }) === undefined);
  check('типові значення не зберігаються', normaliseerAchtergrond({ ...ACHTERGROND_STANDAARD }) === undefined);
  const n = normaliseerAchtergrond({ stand: 'uit', tempo: 999, aantal: -3, sterkte: 72.6, kleuren: 'aurora', overgang: 'drift', kader: 'vloeiend', vreemd: 1 });
  check('межі й округлення: tempo ≤ 100, aantal ≥ 2, sterkte округлено, невідоме поле відкинуто',
    JSON.stringify(n) === JSON.stringify({ stand: 'uit', kleuren: 'aurora', overgang: 'drift', kader: 'vloeiend', tempo: 100, sterkte: 73, aantal: 2 }));
  check('булеві значення не стають числами', normaliseerAchtergrond({ tempo: true, sterkte: false }) === undefined);
  const r = normaliseerUiterlijkRuimte({ versie: 1, palet: 'maquette', achtergrond: { sterkte: 80 } });
  check('запис простору зберігає фон', r.achtergrond?.sterkte === 80 && r.palet === 'maquette');
  check('старий запис без фону — поля немає', !('achtergrond' in normaliseerUiterlijkRuimte({ versie: 1, palet: 'grifel' })));
  const beide = metUiterlijkRuimte(normaliseerUiterlijkRuimtes({ gebruiker: { achtergrond: { stand: 'uit' } }, technisch: {} }), 'technisch', { achtergrond: { kleuren: 'zee' } });
  check('звичайний і технічний профіль мають окремий фон', beide.gebruiker.achtergrond?.stand === 'uit' && beide.technisch.achtergrond?.kleuren === 'zee' && !beide.technisch.achtergrond?.stand);
  check('типовий режим спокійний: інтенсивність ≤ 50 %, плавність ≤ 35', ACHTERGROND_STANDAARD.sterkte <= 50 && ACHTERGROND_STANDAARD.tempo <= 35 && ACHTERGROND_STANDAARD.stand === 'auto');

  // 2. План.
  const pk = maakPlan({ aantal: 9 }, { licht: false, accentTint: 300, zuinig: false });
  const tel = maakPlan({ aantal: 9, kader: 'vloeiend' }, { licht: false, accentTint: 300, zuinig: true });
  check('ПК: стільки плям, скільки обрано', pk.vlekken.length === 9);
  check('телефон («Авто»): не більше 4 плям, ≤ 24 кадри/с, менше полотно', tel.vlekken.length === 4 && tel.fps <= 24 && tel.schaal > pk.schaal);
  check('та сама послідовність плям після зміни кількості (без стрибків)', JSON.stringify(maakPlan({ aantal: 3 }, { licht: false, accentTint: 300, zuinig: false }).vlekken) === JSON.stringify(pk.vlekken.slice(0, 3)));
  check('інтенсивність 0 → шар невидимий; світла тема тьмяніша за темну', maakPlan({ sterkte: 0 }, { licht: false, accentTint: 0, zuinig: false }).dekking === 0
    && maakPlan(undefined, { licht: true, accentTint: 0, zuinig: false }).dekking < maakPlan(undefined, { licht: false, accentTint: 0, zuinig: false }).dekking);
  check('ощадні кадри: 15 к/с', maakPlan({ kader: 'zuinig' }, { licht: false, accentTint: 0, zuinig: false }).fps === 15);
  const p = polotno(1920, 1080, pk);
  check('полотно ≈1/8 вікна (1920×1080 → 240×135)', p.w === 240 && p.h === 135);
  check('відтінок акценту з кольору (#e1477a рожевий ≈ 340°, сірий → типовий)', Math.abs(tintVan('#e1477a') - 340) <= 4 && tintVan('#808080') === 262 && Math.abs(tintVan('rgb(56, 189, 248)') - 198) <= 1);
  check('повний набір налаштувань з частини', achtergrondVolledig({ aantal: 3 }).aantal === 3 && achtergrondVolledig(undefined).kleuren === 'thema');

  // 4. Малювання: кожен кадр — clear + по еліпсу (і бічній «лопаті») на пляму, кольори з прозорістю.
  let bogen = 0, wis = 0; const kleuren: string[] = [];
  const ctx: Ctx2D = {
    clearRect: () => { wis += 1; }, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, fill() {},
    arc: () => { bogen += 1; },
    createRadialGradient: () => ({ addColorStop: (_o: number, c: string) => { kleuren.push(c); } }) as unknown as CanvasGradient,
    fillStyle: '', globalCompositeOperation: 'source-over',
  };
  teken(ctx, 240, 135, 12.5, pk);
  check('кадр малює всі плями з неправильними формами', wis === 1 && bogen >= pk.vlekken.length && bogen <= pk.vlekken.length * 2);
  check('краї плям згасають до повної прозорості (без меж)', kleuren.some((c) => /,0\)$/.test(c)) && kleuren.every((c) => c.startsWith('hsla(')));
  const kleurenNu = kleuren.join(); kleuren.length = 0; teken(ctx, 240, 135, 40, pk);
  check('з часом відтінки змінюються (перелив)', kleuren.join() !== kleurenNu);

  // 3. Ощадливість і вбудовування.
  const kern = zonderCommentaar(lees('src/achtergrond/levende-kern.ts')), comp = lees('src/achtergrond/LevendeAchtergrond.tsx'), css = zonderCommentaar(lees('src/achtergrond/levende-achtergrond.css'));
  check('без filter/blur у малюванні й стилях фону', !/\.filter\s*=|blur\(/.test(kern) && !/filter\s*:|backdrop-filter/.test(css));
  check('малювання в окремому потоці (OffscreenCanvas) із запасним шляхом', /transferControlToOffscreen/.test(comp) && /new Worker\(new URL\('\.\/levende-werker\.ts'/.test(comp) && /hoofdMotor/.test(comp));
  check('пауза на прихованій вкладці та «менше руху»', /visibilitychange/.test(comp) && /minderBeweging\(\)/.test(comp) && /loop\(actief && zichtbaar && !stil\)/.test(comp));
  check('слабкий пристрій → полегшений режим і запис у центр сповіщень', /emitCanonicalNotice\(/.test(comp) && /ZWAK_MS/.test(comp));
  check('CSS не анімує великі шари (без transition/animation на полотні)', !/transition|animation/.test(css));
  check('оболонка монтує фон першою дитиною main.canonical-chrome', /onPointerUp=\{finishSwipe\}>\{\/\*[^*]*\*\/\}<LevendeAchtergrond lang=\{lang\}\/>/.test(lees('src/CanoniekOmlijsting.tsx')));
  check('налаштування живого фону — у «Темах»', /<AchtergrondInstellingen tr=\{tr\} \/>/.test(lees('src/thema/ThemaInstellingen.tsx')));
  check('налаштування мають тексти uk і nl', (lees('src/achtergrond/AchtergrondInstellingen.tsx').match(/tr\('/g) || []).length >= 40);

  return einde();
}
