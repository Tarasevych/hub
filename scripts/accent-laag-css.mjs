// ACCENT-001 (15.11.2026): генерує src/thema/accent-laag.css — «шар акценту» облікового запису для всіх палітр, зокрема родини «Макет»
// («Макет (студійний)», «Біла класика», «Чорна класика»), де кольори задають десятки змінних --mq-* на окремих елементах сервісів
// (понад 60 місць із селекторами аж до :not(#_mq)). Без цього шару обраний відтінок там губився: діяв лише на --accent оболонки.
// Значення — ACCENT_TONEN (src/thema/weergave-stijl.ts); тест accent-001 звіряє файл із генератором.
// Genereert de accentlaag: de gekozen tint wint in elk palet, ook in de «Ontwerp»-familie met haar eigen --mq-variabelen.
// Gebruik: node scripts/accent-laag-css.mjs [--controle]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wortel = join(dirname(fileURLToPath(import.meta.url)), '..');
const bron = readFileSync(join(wortel, 'src/thema/weergave-stijl.ts'), 'utf8');
const blok = /export const ACCENT_TONEN[^=]*=\s*\{([\s\S]*?)\n\};/.exec(bron)?.[1] || '';
const TONEN = {};
for (const m of blok.matchAll(/^\s*([a-z]+): \{ licht: \{ accent: '(#[0-9a-f]{6})', tekst: '(#[0-9a-f]{6})', zacht: '(#[0-9a-f]{6})' \}, donker: \{ accent: '(#[0-9a-f]{6})', tekst: '(#[0-9a-f]{6})', zacht: '(#[0-9a-f]{6})' \} \},/gm)) {
  TONEN[m[1]] = { licht: { accent: m[2], tekst: m[3], zacht: m[4] }, donker: { accent: m[5], tekst: m[6], zacht: m[7] } };
}
if (Object.keys(TONEN).length < 12) throw new Error(`ACCENT_TONEN niet gelezen (${Object.keys(TONEN).length})`);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
/** Двоє ідентифікаторів у :not() — специфічність (2,·,·) перемагає правила сервісів «Макета» з :not(#_mq) (1,·,·). */
const ID = ':not(#_ac1):not(#_ac2)';

const vars = (hoofd, tweede, op, zacht, nacht) => [
  `--accent:${hoofd}`, `--accentText:${op}`, `--accent-soft:${zacht}`, `--text-on-accent:${op}`, `--focus:${hoofd}`,
  `--mq-accent:${hoofd}`, `--mq-accent-rgb:${rgb(hoofd)}`, `--mq-accent-2:${tweede}`, `--mq-accent-op:${op}`,
  `--mq-kaart-accent:${hoofd}`, `--mq-kaart-accent-rgb:${rgb(hoofd)}`,
  `--mq-nacht-accent:${nacht}`, `--mq-nacht-accent-rgb:${rgb(nacht)}`,
  `--mq-gh-indigo:${hoofd}`, `--gh-mq-indigo:${hoofd}`, `--mq-accent-ai:${hoofd}`,
].join(';');

const r = [
  '/* GEGENEREERD door scripts/accent-laag-css.mjs uit ACCENT_TONEN (src/thema/weergave-stijl.ts) — niet met de hand wijzigen.',
  '   ACCENT-001: обраний відтінок облікового запису (html[data-accent]) — акцент кожного елемента в будь-якій палітрі, також у родині',
  '   «Макет», де сервіси задають власні --mq-accent на своїх елементах. Тло, текст і небезпечні кольори палітри не змінюються.',
  '   Темні вставки всередині світлої сторінки (.theme-dark) отримують темний тон відтінку. */',
];
for (const [id, t] of Object.entries(TONEN)) {
  const L = t.licht, D = t.donker;
  const sel = (toon) => `:root[data-accent="${id}"]:is(${toon})`;
  const licht = sel('.theme-light,.theme-plum-light'), donker = sel('.theme-dark,.theme-plum-dark');
  r.push(`${licht}${ID}, ${licht} *${ID} { ${vars(L.accent, D.accent, L.tekst, L.zacht, D.accent)} }`);
  r.push(`:root.palet-klassiek-wit[data-accent="${id}"]:is(.theme-light,.theme-plum-light)${ID}, :root.palet-klassiek-wit[data-accent="${id}"]:is(.theme-light,.theme-plum-light) *${ID} { --mq-nacht-accent:${L.accent}; --mq-nacht-accent-rgb:${rgb(L.accent)}; }`);
  r.push(`${donker}${ID}, ${donker} *${ID}, :root[data-accent="${id}"] :is(.theme-dark,.theme-plum-dark)${ID}, :root[data-accent="${id}"] :is(.theme-dark,.theme-plum-dark) *${ID} { ${vars(D.accent, L.accent, D.tekst, D.zacht, D.accent)} }`);
}
const uit = `${r.join('\n')}\n`;
const doel = join(wortel, 'src/thema/accent-laag.css');
if (process.argv.includes('--controle')) {
  const nu = readFileSync(doel, 'utf8');
  if (nu !== uit) { console.error('accent-laag.css wijkt af van de generator — node scripts/accent-laag-css.mjs'); process.exit(1); }
  console.log('accent-laag.css klopt');
} else {
  writeFileSync(doel, uit);
  console.log(`accent-laag.css: ${r.length - 4} regels`);
}
