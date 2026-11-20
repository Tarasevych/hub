// Регресійне випробування для UPD-009: єдине симетричне центрування та стабільність макета всіх сторінок Mijn Ruimte.
// Regressietest voor UPD-009: uniforme symmetrische centrering en stabiele lay-out van alle pagina's van Mijn Ruimte.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const WORTEL = process.cwd();
const lees = (pad: string) => readFileSync(join(WORTEL, pad), 'utf8');

/** Формула симетричних полів із src/centrering-globaal.css:
 *  вільна ширина робочої області W (між лівим меню + 24 px і правим краєм + 24 px + скролбар),
 *  ширина колонки K, ширина правої/лівої рейки R (280 / 76 / 0 px). */
const velden = (W: number, K: number, R: number) => {
  const zij = Math.max(0, (W - R - K) / 2);
  return { links: 24 + zij, naarRail: 24 + zij, breedte: Math.min(K, W - R) };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('upd-009-centrering-globaal-20261119');
  const css = lees('src/centrering-globaal.css');
  const mainTsx = lees('src/main.tsx');

  check(
    '1. Глобальний шар центрування src/centrering-globaal.css підключено в src/main.tsx перед afdruk.css',
    mainTsx.includes("import './centrering-globaal.css';")
      && mainTsx.indexOf("import './centrering-globaal.css';") < mainTsx.indexOf("import './afdruk.css';"),
  );

  check(
    '2. Усунено горизонтальне совгання та плаваючу анімацію полів (overscroll-behavior-x: none, overflow-x: clip, .mq-schil transition: none)',
    /\.canonical-chrome\s+\.canonical-workspace\s*\{[^}]*overscroll-behavior-x:\s*none/.test(css)
      && /\.canonical-chrome:not\(:has\(\.mail-functional\.google-workspace-active\)\)\s+\.canonical-content\s*\{[^}]*overflow-x:\s*clip/.test(css)
      && /\.canonical-chrome\s+\.mq-schil\s*\{[^}]*transition:\s*none\s*!important/.test(css),
  );

  check(
    '3. Робоча область на ПК має симетричні 24 px поля від бічного меню зліва (і справа при data-dock=rechts), не чіпаючи повноекранну пошту',
    /padding-left:\s*calc\(var\(--zijbalk-rail,\s*60px\)\s*\+\s*24px\)/.test(css)
      && /padding-right:\s*24px/.test(css)
      && /padding-left:\s*calc\(min\(316px,\s*calc\(100vw - var\(--zijbalk-rail,\s*60px\)\)\)\s*\+\s*24px\)/.test(css)
      && /:not\(:has\(\.mail-functional\.google-workspace-active\)\)/.test(css),
  );

  check(
    '4. Сторінки без рейки якорів (hub, cloud, github, huis, ai, mcp, api, admin поза updates) центруються єдиною колонкою 1180 px',
    /\.werkblad,[\s\S]*\.blocks,[\s\S]*\.hub-notes,[\s\S]*\.cloud-overview,[\s\S]*\.smart-home,[\s\S]*\.aie-container,[\s\S]*\.ag-pagina/.test(css)
      && /max-width:\s*1180px;\s*margin-inline:\s*auto;/.test(css),
  );

  check(
    '5. Сторінки з рейкою якорів (.mq-schil, крім admin/updates) використовують чесну симетричну формулу для розгорнутої (276 px), компактної (76 px) і згорнутої (0 px) рейки',
    css.includes('--cg-rail: 276px;')
      && css.includes('--cg-rail: 76px;')
      && css.includes('--cg-rail: 0px;')
      && css.includes('--cg-zij: max(0px, calc((100% - var(--cg-rail) - var(--cg-kolom)) / 2));')
      && css.includes('padding-right: calc(var(--cg-rail) + var(--cg-zij));')
      && css.includes('padding-left: calc(var(--cg-rail) + var(--cg-zij));')
      && css.includes('.mq-schil:not(:has([data-admin-uitrol]))'),
  );

  // 6. Перевірка симетрії на 1440 px і 1920 px (робоча область без лівої 84 px, правої 24 px і смуги прокручування 15 px).
  const id1440 = velden(1440 - 123, 1040, 276);
  const id1920 = velden(1920 - 123, 1040, 276);
  const hub1440 = velden(1440 - 123, 1180, 0);
  const hub1920 = velden(1920 - 123, 1180, 0);
  const compact1440 = velden(1440 - 123, 1180, 76);

  check(
    '6. Математична симетрія 0 px перекосу на 1440 px і 1920 px (id із рейкою, hub/ai/cloud/github/huis без рейки, компактна рейка)',
    id1440.links === id1440.naarRail && id1440.links >= 24 && id1440.breedte === 1040
      && id1920.links === id1920.naarRail && id1920.links > 250 && id1920.breedte === 1040
      && hub1440.links === hub1440.naarRail && hub1440.breedte === 1180
      && hub1920.links === hub1920.naarRail && hub1920.breedte === 1180
      && compact1440.links === compact1440.naarRail,
    JSON.stringify({ id1440, id1920, hub1440, hub1920, compact1440 }),
  );

  return einde();
}
