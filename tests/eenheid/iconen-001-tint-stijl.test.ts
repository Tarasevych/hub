// ICONEN-001 (16.11.2026): третій стиль піктограм меню «У відтінку» — користувач сам обирає: класичні (без кольорів),
// кольорові (кожна служба у своєму кольорі) чи всі в улюбленому відтінку. Без браузера й бази
// (поведінку в справжньому Chromium перевірено на стенді /mnt/project-files/accent-001/stand/iconen-stijlen.mjs).
// Derde icoonstijl «In tint»: de gebruiker kiest zelf — klassiek, kleurrijk of alles in de voorkeurstint. Zonder browser en database.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { ICOON_STIJLEN, normaliseerZijbalk, standaardZijbalk } from '../../shared/menu-model';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('iconen-001-tint-stijl');

  check('три стилі на вибір: класичний, кольоровий, у відтінку', JSON.stringify(ICOON_STIJLEN) === JSON.stringify(['klassiek', 'kleur', 'tint']));
  check('«tint» зберігається в налаштуваннях меню', normaliseerZijbalk({ icoonStijl: 'tint' }).icoonStijl === 'tint');
  check('давні значення не змінюються, типовий стиль — класичний (без кольорів)',
    normaliseerZijbalk({ icoonStijl: 'kleur' }).icoonStijl === 'kleur' && normaliseerZijbalk({ icoonStijl: 'klassiek' }).icoonStijl === 'klassiek' && standaardZijbalk().icoonStijl === 'klassiek');
  check('сміття → класичний', normaliseerZijbalk({ icoonStijl: 'neon' }).icoonStijl === 'klassiek');

  const css = lees('src/menu-v2.css');
  check('меню: у стилі «tint» колір служби замінено акцентом у всьому бічному меню (перемагає [data-accent])',
    /\.canonical-chrome\[data-icoon-stijl='tint'\] \.canonical-sidebar \*:not\(#_is1\)\{--a:var\(--accent\);/.test(css));
  check('меню: піктограми служб і підпунктів у стилі «tint» завжди кольорові (акцент)',
    css.includes(".canonical-chrome[data-icoon-stijl='tint'] .canonical-service-button .menu-lucide-glyph{color:var(--accent)}")
    && css.includes(".canonical-chrome[data-icoon-stijl='tint'] .canonical-local-page-button :is(.menu-lucide-glyph,.mail-sidebar-icon-state svg,.lucide){color:var(--a-item)}"));
  check('приклад у налаштуваннях показує відтінок', css.includes(".zijbalk-voorbeeld[data-icoon-stijl='tint']>span{color:var(--accent)}"));
  check('правила «tint» не чіпають стиль «kleur» і класичний', !/data-icoon-stijl='tint'[^{]*data-icoon-stijl='kleur'/.test(css));

  const pagina = lees('src/ZijbalkInstellingen.tsx'), venster = lees('src/MenuInstellingenVenster.tsx');
  check('сторінка налаштувань меню: третій варіант із поясненням наслідків', /\['tint',tr\('У відтінку','In tint'\),tr\('[^']*кольори розділів[^']*не показуються/.test(pagina));
  check('швидке вікно налаштувань меню: третій варіант', /\['tint', tr\('У відтінку', 'In tint'\)/.test(venster));
  check('центр облікового запису «Студія» теж слухає стиль «tint»', lees('src/identiteit/IdentiteitAtelier.tsx').includes("' iconen-tint'") && lees('src/identiteit/identiteit-atelier.css').includes('.iconen-tint .mr-at-glief{color:var(--accent)'));
  return einde();
}
