// SITE-001 (пункт 10): кожне зображення має атрибут alt.
// Порожній alt дозволено лише для оздобних зображень (аватар поруч з ім'ям, значок усередині кнопки з aria-label тощо);
// змістовні зображення (прапор чи герб, що несуть назву місця) мають текст.
// nl: elke afbeelding heeft een alt-attribuut; een lege alt alleen voor decoratieve beelden.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

async function bestanden(map: string): Promise<string[]> {
  const uit: string[] = [];
  for (const e of await readdir(map, { withFileTypes: true })) {
    const p = join(map, e.name);
    if (e.isDirectory()) uit.push(...(await bestanden(p)));
    else if (/\.tsx$/.test(e.name)) uit.push(p);
  }
  return uit;
}

/** Повертає всі JSX-теги <img …> з урахуванням вкладених фігурних дужок. Коментарі (рядки з «//» чи «/*») пропускає. */
function imgTags(bron: string): Array<{ tag: string; regel: number }> {
  const uit: Array<{ tag: string; regel: number }> = [];
  for (const m of bron.matchAll(/<img(?=[\s/>])/g)) {
    const begin = m.index ?? 0;
    const regelBegin = bron.lastIndexOf('\n', begin) + 1;
    const voor = bron.slice(regelBegin, begin);
    if (/\/\/|\/\*|^\s*\*/.test(voor)) continue;
    let i = begin + 4, diepte = 0;
    for (; i < bron.length; i++) {
      const c = bron[i];
      if (c === '{') diepte++;
      else if (c === '}') diepte--;
      else if (c === '>' && diepte === 0) break;
    }
    const tag = bron.slice(begin, i + 1);
    // Теги всередині рядкових шаблонів DOM-очищення (наприклад «<img onerror>») — не JSX.
    if (!/\ssrc=/.test(tag)) continue;
    uit.push({ tag, regel: bron.slice(0, begin).split('\n').length });
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-alt');
  const lijst = await bestanden('src');
  let aantal = 0;
  const zonder: string[] = [];
  for (const f of lijst) {
    const bron = await readFile(f, 'utf8');
    for (const { tag, regel } of imgTags(bron)) {
      aantal++;
      if (!/\balt\s*=/.test(tag) && !/\{\.\.\./.test(tag)) zonder.push(`${f}:${regel}`);
    }
  }
  check(`alle ${aantal} JSX-afbeeldingen hebben een alt-attribuut`, aantal > 40 && zonder.length === 0, zonder.join(', '));

  const keten = await readFile('src/merk/PlaatsKeten.tsx', 'utf8');
  check('vlag van een plaats heeft een beschrijvende alt-tekst', keten.includes('alt={`${t.vlag}: ${naam}`}'));
  check('wapen van een plaats heeft een beschrijvende alt-tekst', keten.includes('alt={`${t.wapen}: ${naam}`}'));

  const html = await readFile('index.html', 'utf8');
  const htmlZonder = [...html.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\balt=/.test(m[0]));
  check('index.html: geen <img> zonder alt', htmlZonder.length === 0, htmlZonder.map((m) => m[0].slice(0, 60)).join(' | '));
  return einde();
}
