// Спільний перегляд вкладень, етап 3, крок 3 (Grok: hub.tarasevych.com):
// чисті функції шукають рядок у поданих текстах вкладень одного відкритого листа без мережевих запитів.
// Рядок зводиться до спільної форми (регістр, діакритичні знаки, варіанти українського апострофа) й повертає збіги
// з коротким фрагментом і позицією в початковому тексті. Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений. Без DOM.

/** Варіанти апострофа, які в українських словах вважаємо одним знаком (прибираємо перед пошуком). */
const APOSTROF = /['’‘ʼʻ´`＇ʹ′]/g;
const DIACRITICA = /[\u0300-\u036f]/g;
const LITERA_OF_CIJFER = /[\p{L}\p{N}@._-]/u;

export const FRAGMENT_ZIJDE = 40;
export const MAX_TREFFERS_PER_ITEM = 20;

export type ZoekVeld = 'naam' | 'tekst';

export type ZoekItem = {
  bijlageId: string;
  naam: string;
  tekst: string;
};

/** Один збіг: позиції [start, einde) у початковому рядку поля, плюс короткий фрагмент навколо. */
export type ZoekTreffer = {
  bijlageId: string;
  naam: string;
  veld: ZoekVeld;
  start: number;
  einde: number;
  fragment: string;
};

type Kaart = { norm: string; naar: number[]; bron: string };

function tekenStuk(ch: string): string {
  const stuk = ch.toLocaleLowerCase().normalize('NFKD').replace(DIACRITICA, '').replace(APOSTROF, '');
  let uit = '';
  for (const t of stuk) uit += LITERA_OF_CIJFER.test(t) ? t : ' ';
  return uit;
}

/** Зведення до спільної форми без карти позицій: регістр, діакритика, апостроф, зайві пробіли. */
export function normaliseerZoek(s: string): string {
  const kaart = bouwKaart(s);
  return kaart.norm;
}

function bouwKaart(s: string): Kaart {
  const bron = String(s ?? '');
  let norm = '';
  const naar: number[] = [];
  let i = 0;
  for (const ch of bron) {
    const start = i;
    i += ch.length;
    const stuk = tekenStuk(ch);
    for (const t of stuk) {
      if (t === ' ' && (norm.length === 0 || norm.endsWith(' '))) continue;
      norm += t;
      naar.push(start);
    }
  }
  while (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    naar.pop();
  }
  return { norm, naar, bron };
}

/** Короткий уривок навколо збігу, зі знаком «…», якщо текст обрізано. */
export function fragmentRond(tekst: string, start: number, einde: number, zijde = FRAGMENT_ZIJDE): string {
  const bron = String(tekst ?? '');
  const a0 = Math.max(0, start);
  const b0 = Math.max(a0, Math.min(bron.length, einde));
  const a = Math.max(0, a0 - zijde);
  const b = Math.min(bron.length, b0 + zijde);
  const stuk = bron.slice(a, b).replace(/\s+/g, ' ').trim();
  const prefix = a > 0 ? '…' : '';
  const suffix = b < bron.length ? '…' : '';
  return prefix + stuk + suffix;
}

function treffersInVeld(item: ZoekItem, veld: ZoekVeld, kaart: Kaart, normVraag: string, limiet: number): ZoekTreffer[] {
  const uit: ZoekTreffer[] = [];
  if (!normVraag || limiet <= 0) return uit;
  let from = 0;
  while (uit.length < limiet && from <= kaart.norm.length - normVraag.length) {
    const i = kaart.norm.indexOf(normVraag, from);
    if (i < 0) break;
    const start = kaart.naar[i] ?? 0;
    const na = i + normVraag.length;
    const einde = na < kaart.naar.length ? kaart.naar[na] : kaart.bron.length;
    uit.push({
      bijlageId: item.bijlageId,
      naam: item.naam,
      veld,
      start,
      einde,
      fragment: fragmentRond(kaart.bron, start, einde),
    });
    from = i + Math.max(1, normVraag.length);
  }
  return uit;
}

/**
 * Пошук рядка в поданому списку вкладень. Мережі немає.
 * Порожній або безлітерний запит дає порожній список, без вигадок.
 * Шукаємо і в назві, і в тексті; порядок елементів зберігаємо.
 */
export function zoekInBijlagen(items: readonly ZoekItem[], vraag: string): ZoekTreffer[] {
  const normVraag = normaliseerZoek(vraag);
  if (!normVraag) return [];
  const uit: ZoekTreffer[] = [];
  for (const ruw of items ?? []) {
    const item: ZoekItem = {
      bijlageId: String(ruw?.bijlageId ?? ''),
      naam: String(ruw?.naam ?? ''),
      tekst: String(ruw?.tekst ?? ''),
    };
    if (!item.bijlageId) continue;
    const rest = MAX_TREFFERS_PER_ITEM;
    const inNaam = treffersInVeld(item, 'naam', bouwKaart(item.naam), normVraag, rest);
    const inTekst = treffersInVeld(item, 'tekst', bouwKaart(item.tekst), normVraag, rest - inNaam.length);
    uit.push(...inNaam, ...inTekst);
  }
  return uit;
}
