// APPARAAT-001 — de catalogus van symbolen en de trekking. Puur (geen React, geen database), getest in
// tests/eenheid/apparaat-bevestiging-20261109.test.ts.
//
// Waarom eigen pictogrammen mét naam en niet alleen emoji: emoji zien er op iOS, Android en Windows anders uit en zijn in de
// Telegram-knoppen alleen als tekst mogelijk. Daarom: in de browser een vectorpictogram (lucide, al overal op de site in gebruik)
// mét zijn naam eronder; in Telegram de emoji mét dezelfde naam. De NAAM is op beide schermen gelijk en maakt de keuze eenduidig,
// ook voor een schermlezer. Letters: alleen Latijnse letters zonder Cyrillische dubbelganger (A/В/С/Е/Н/К/М/О/Р/Т/Х/У/І vallen af).
// Cijfers: 2–9 (0/1 lijken op O/I/l).
import { SYMBOOL_SOORTEN, type SymboolSoort, type Tekst } from './model';

export type Pictogram = { id: string; icoon: string; naam: Tekst; emoji: string };

/** 24 pictogrammen die ook klein en in grijs goed uit elkaar te houden zijn. `icoon` = naam van het lucide-pictogram. */
export const PICTOGRAMMEN: readonly Pictogram[] = Object.freeze([
  { id: 'anker', icoon: 'Anchor', naam: ['Якір', 'Anker'], emoji: '⚓' },
  { id: 'fiets', icoon: 'Bike', naam: ['Велосипед', 'Fiets'], emoji: '🚲' },
  { id: 'camera', icoon: 'Camera', naam: ['Камера', 'Camera'], emoji: '📷' },
  { id: 'kat', icoon: 'Cat', naam: ['Кіт', 'Kat'], emoji: '🐱' },
  { id: 'hond', icoon: 'Dog', naam: ['Пес', 'Hond'], emoji: '🐶' },
  { id: 'vis', icoon: 'Fish', naam: ['Риба', 'Vis'], emoji: '🐟' },
  { id: 'bloem', icoon: 'Flower2', naam: ['Квітка', 'Bloem'], emoji: '🌸' },
  { id: 'gitaar', icoon: 'Guitar', naam: ['Гітара', 'Gitaar'], emoji: '🎸' },
  { id: 'blad', icoon: 'Leaf', naam: ['Листок', 'Blad'], emoji: '🍃' },
  { id: 'maan', icoon: 'Moon', naam: ['Місяць', 'Maan'], emoji: '🌙' },
  { id: 'berg', icoon: 'Mountain', naam: ['Гора', 'Berg'], emoji: '⛰️' },
  { id: 'vliegtuig', icoon: 'Plane', naam: ['Літак', 'Vliegtuig'], emoji: '✈️' },
  { id: 'raket', icoon: 'Rocket', naam: ['Ракета', 'Raket'], emoji: '🚀' },
  { id: 'schip', icoon: 'Ship', naam: ['Корабель', 'Schip'], emoji: '🚢' },
  { id: 'ster', icoon: 'Star', naam: ['Зірка', 'Ster'], emoji: '⭐' },
  { id: 'zon', icoon: 'Sun', naam: ['Сонце', 'Zon'], emoji: '☀️' },
  { id: 'tent', icoon: 'Tent', naam: ['Намет', 'Tent'], emoji: '⛺' },
  { id: 'boom', icoon: 'TreePine', naam: ['Ялинка', 'Dennenboom'], emoji: '🌲' },
  { id: 'paraplu', icoon: 'Umbrella', naam: ['Парасоля', 'Paraplu'], emoji: '☂️' },
  { id: 'vogel', icoon: 'Bird', naam: ['Пташка', 'Vogel'], emoji: '🐦' },
  { id: 'auto', icoon: 'Car', naam: ['Авто', 'Auto'], emoji: '🚗' },
  { id: 'wolk', icoon: 'Cloud', naam: ['Хмара', 'Wolk'], emoji: '☁️' },
  { id: 'hart', icoon: 'Heart', naam: ['Серце', 'Hart'], emoji: '❤️' },
  { id: 'koffie', icoon: 'Coffee', naam: ['Кава', 'Koffie'], emoji: '☕' },
] as Pictogram[]);

export const CIJFERS: readonly string[] = Object.freeze(['2', '3', '4', '5', '6', '7', '8', '9']);
export const LETTERS: readonly string[] = Object.freeze(['D', 'F', 'G', 'J', 'L', 'N', 'Q', 'R', 'S', 'U', 'V', 'W', 'Z']);

export type VasteSoort = Exclude<SymboolSoort, 'gemengd'>;
export const VASTE_SOORTEN: readonly VasteSoort[] = ['pictogrammen', 'cijfers', 'letters'];
/** Hoeveel symbolen een soort heeft (de grens van een geldige index). */
export const catalogusGrootte = (soort: VasteSoort): number => (soort === 'pictogrammen' ? PICTOGRAMMEN.length : soort === 'cijfers' ? CIJFERS.length : LETTERS.length);

export type SymboolWeergave = {
  soort: VasteSoort;
  index: number;
  /** Korte tekst (cijfer, letter, of de naam van het pictogram in de gevraagde taal). */
  tekst: string;
  /** Alleen pictogrammen: naam van het lucide-pictogram en de emoji voor Telegram. */
  icoon?: string;
  emoji?: string;
  naam?: Tekst;
};
/** Wat één symbool is; ongeldige index → null (de browser toont dan niets, nooit een verkeerd symbool). */
export function symbool(soort: VasteSoort, index: number, taal: 'uk' | 'nl' = 'uk'): SymboolWeergave | null {
  if (!Number.isInteger(index) || index < 0 || index >= catalogusGrootte(soort)) return null;
  if (soort === 'cijfers') return { soort, index, tekst: CIJFERS[index] };
  if (soort === 'letters') return { soort, index, tekst: LETTERS[index] };
  const p = PICTOGRAMMEN[index];
  return { soort, index, tekst: taal === 'nl' ? p.naam[1] : p.naam[0], icoon: p.icoon, emoji: p.emoji, naam: p.naam };
}
/** Tekst voor een knop in Telegram (alleen tekst mogelijk): «🚲 Велосипед» of «7» of «R». */
export function telegramKnopTekst(soort: VasteSoort, index: number, taal: 'uk' | 'nl'): string {
  const s = symbool(soort, index, taal);
  if (!s) return '·';
  return s.emoji ? `${s.emoji} ${s.tekst}` : s.tekst;
}

export type Trekking = { soort: VasteSoort; kandidaten: number[]; juist: number };
/** Willekeur die te vervangen is in tests: een getal in [0, n). */
export type Willekeur = (n: number) => number;

/**
 * Trekt `aantal` verschillende symbolen uit één soort («gemengd» → eerst een soort kiezen) en wijst er één aan als het juiste.
 * De volgorde van `kandidaten` is de volgorde van tonen, op A en B gelijk (zoals itsme). `juist` is de POSITIE in `kandidaten`.
 */
export function trek(soort: SymboolSoort, aantal: number, willekeur: Willekeur): Trekking {
  const vaste: VasteSoort = soort === 'gemengd' ? VASTE_SOORTEN[willekeur(VASTE_SOORTEN.length)] : soort;
  const n = Math.max(3, Math.min(5, Math.floor(aantal) || 3));
  const grootte = catalogusGrootte(vaste);
  const bak = Array.from({ length: grootte }, (_, i) => i);
  const kandidaten: number[] = [];
  while (kandidaten.length < Math.min(n, grootte)) {
    const i = willekeur(bak.length);
    kandidaten.push(bak[i]);
    bak.splice(i, 1);
  }
  return { soort: vaste, kandidaten, juist: willekeur(kandidaten.length) };
}

/** Controle van een keuze van B: positie in de getoonde lijst. Alleen een geldige positie is een echte poging. */
export const keuzeGeldig = (keuze: unknown, aantal: number): keuze is number => Number.isInteger(keuze) && (keuze as number) >= 0 && (keuze as number) < aantal;

/** Zijn alle kandidaten geldige indexen van hun soort (bv. na het lezen uit de database)? */
export function trekkingGeldig(soort: unknown, kandidaten: unknown, juist: unknown): boolean {
  if (!VASTE_SOORTEN.includes(soort as VasteSoort) || !Array.isArray(kandidaten) || kandidaten.length < 3 || kandidaten.length > 5) return false;
  const grootte = catalogusGrootte(soort as VasteSoort);
  if (!kandidaten.every((k) => Number.isInteger(k) && k >= 0 && k < grootte)) return false;
  if (new Set(kandidaten).size !== kandidaten.length) return false;
  return keuzeGeldig(juist, kandidaten.length);
}

export { SYMBOOL_SOORTEN };
