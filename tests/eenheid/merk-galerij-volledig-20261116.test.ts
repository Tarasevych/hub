// REESTR-LOGO-001 (16.11.2026) — Павло: «перконайся, що в цю галерею входять всі логотипи, згадані на сайті».
// Bewaker: de galerij «Логотипи сервісів» bevat ELK merk dat de site ergens als logo toont, en elk zo'n merk heeft een tekening
// in het register (officieel bestand, vorm met herkomst of neutrale plaat) — geen losse letter meer op een eigen plek.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { MERKEN } from '../../src/merk/merk-tabel';
import { LOGOS } from '../../src/merk/merk-logos';
import { OFFICIEEL_SLEUTELS } from '../../src/merk/officieel-sleutels';
import { merkSleutel } from '../../src/merk/merk-register';
import { galerijBronnen, galerijUit, SESSIE_MERKEN } from '../../src/merk/merk-galerij';

/** Geen merk maar een pictogram of formaat (lucide/categorie): mag zonder logo in het register. */
const GEEN_MERK = new Set(['device', 'server', 'mail', 'calendar', 'markdown', 'internal', 'key', 'browser', 'search']);
/** Bestanden die merknamen als TEKST dragen (geen logo op de site): de lijst bekende afzenders (pastille, imitatiecontrole). */
const ALLEEN_TEKST = [/^shared\/mail-bekende-afzenders\.ts$/];

const lopen = (d: string, uit: string[] = []): string[] => {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) lopen(p, uit); else if (/\.(ts|tsx)$/.test(p)) uit.push(p); }
  return uit;
};

export async function main() {
  const { check, einde } = checker('merk-galerij-volledig-20261116');
  const bronnen = await galerijBronnen();
  const galerij = galerijUit(MERKEN, OFFICIEEL_SLEUTELS, bronnen);
  const in_ = new Set(galerij.map((r) => r.sleutel));
  const getekend = (k: string) => Boolean(MERKEN[k] || LOGOS[k] || OFFICIEEL_SLEUTELS.has(k));

  // 1. Elke catalogus die logo's toont zit in de galerij, en elk merk daarin heeft een tekening.
  const mis1: string[] = [], zonder: string[] = [];
  for (const b of bronnen) for (const [ruw] of b.merken) { const k = merkSleutel(ruw); if (MERKEN[k]?.lijn) continue; if (!in_.has(k)) mis1.push(`${b.bron}:${k}`); if (!getekend(k)) zonder.push(`${b.bron}:${k}`); }
  check(`1: усі каталоги з логотипами (${bronnen.map((b) => b.bron).join(', ')}) — у галереї`, bronnen.length >= 9 && mis1.length === 0, mis1.join(', '));
  check('1: кожен згаданий сервіс має знак у реєстрі (офіційний файл, форма з походженням або нейтральна плитка), а не лише літеру', zonder.length === 0, zonder.join(', '));

  // 2. Elke letterlijke merksleutel in de code (logo: '…', merk: '…', merk='…') zit in de galerij of is uitdrukkelijk geen merk.
  const mis2: string[] = [];
  for (const f of [...lopen('src'), ...lopen('shared')]) {
    if (f.startsWith('src/merk/') || ALLEEN_TEKST.some((r) => r.test(f))) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?<![-\w])(?:logo|merk)(?::\s*|=\{?\s*)['"]([a-z0-9.+-]{2,})['"]/g)) {
      const k = merkSleutel(m[1]);
      if (!GEEN_MERK.has(m[1]) && !in_.has(k)) mis2.push(`${f}: ${m[1]}`);
    }
  }
  check('2: кожен ключ логотипа, записаний у коді сайту, є в галереї (або це піктограма, а не бренд)', mis2.length === 0, mis2.join('; '));

  // 3. De grote tabel en de officiële bestanden zitten er volledig in.
  const mis3 = [...Object.keys(LOGOS), ...OFFICIEEL_SLEUTELS].map(merkSleutel).filter((k) => !in_.has(k));
  check(`3: велика таблиця (${Object.keys(LOGOS).length}) і офіційні файли (${OFFICIEEL_SLEUTELS.size}) — усі в галереї`, mis3.length === 0, mis3.join(', '));

  // 4. Browsers en systemen van «Сеанси»: dezelfde lijst als browserMerk/osMerk teruggeven.
  const iconen = readFileSync('src/sessies/SessieIconen.tsx', 'utf8');
  const sessie = new Set([...iconen.matchAll(/return '([a-z]+)'/g)].map((m) => m[1]));
  check('4: браузери й системи «Сеансів» — усі в галереї', sessie.size >= 12 && [...sessie].every((k) => (SESSIE_MERKEN as readonly string[]).includes(k) && in_.has(merkSleutel(k))), [...sessie].join(','));

  // 5. De plekken die eerder een letter tekenden, tekenen nu het merk (en dus ook het eigen logo van de mens).
  const agenda = readFileSync('src/agenda/Agenda.tsx', 'utf8'), koppel = readFileSync('src/agenda/v3/onderdelen/KoppelVenster.tsx', 'utf8');
  const notities = readFileSync('src/HubNotities.tsx', 'utf8'), vnBron = readFileSync('src/notities/NotitiesBronnen.tsx', 'utf8');
  check('5: календар, нотатки, джерела нотаток і вікно підключення календаря малюють логотип із реєстру; літера — лише без бренду',
    /aanbieder\.logo \? <MerkLogo/.test(agenda) && /'honor-calendar': 'honor'/.test(koppel) && /'huawei-calendar': 'huawei'/.test(koppel)
    && /'proton-calendar': 'protonmail'/.test(koppel) && /app\.logo && app\.logo !== 'markdown' \? <MerkLogo/.test(notities) && /b\.merk \? <span[^>]*><MerkLogo/.test(vnBron));
  check('5: нові знаки на місці (HONOR, Huawei, pCloud, ColorNote — нейтральні плитки; Google Keep — офіційний файл)',
    ['honor', 'huawei', 'pcloud', 'colornote'].every((k) => MERKEN[k]?.neutraal && in_.has(k)) && OFFICIEEL_SLEUTELS.has('googlekeep') && in_.has('googlekeep'));

  // 6. Eén rij per merk, met een menselijke naam.
  const kaal = galerij.filter((r) => !r.naam || (r.naam === r.sleutel && /^[a-z0-9]{4,}$/.test(r.naam)));
  check(`6: галерея (${galerij.length}) — по одному рядку на бренд, з людською назвою`, galerij.length >= 184 && in_.size === galerij.length && kaal.length === 0, kaal.map((r) => r.sleutel).join(','));
  return einde();
}
