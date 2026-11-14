// APPARAAT-001 — de catalogus van symbolen en de trekking. Puur (geen React, geen database), getest in
// tests/eenheid/apparaat-bevestiging-20261109.test.ts.
//
// Waarom eigen pictogrammen mét naam en niet alleen emoji: emoji zien er op iOS, Android en Windows anders uit en zijn in de
// Telegram-knoppen alleen als tekst mogelijk. Daarom: in de browser een vectorpictogram (lucide, al overal op de site in gebruik)
// mét zijn naam eronder; in Telegram de emoji mét dezelfde naam. De NAAM is op beide schermen gelijk en maakt de keuze eenduidig,
// ook voor een schermlezer. TELEGRAM-002: in het beveiligde Telegram-venster dezelfde tegel (vaste kleur + vectorvorm + naam) als op
// de site, zie pictogramTegel/pictogramSvg onderaan — de emoji blijft alleen voor de oude knoppen (venster uitgezet door de beheerder). Letters: alleen Latijnse letters zonder Cyrillische dubbelganger (A/В/С/Е/Н/К/М/О/Р/Т/Х/У/І vallen af).
// Cijfers: 2–9 (0/1 lijken op O/I/l).
import { SYMBOOL_SOORTEN, type SymboolSoort, type Tekst } from './model';
import { VORMEN } from './pictogram-vormen';

/** `kleur`: vaste achtergrond van de tegel (TELEGRAM-002), onafhankelijk van licht/donker thema; wit pictogram erop, contrast ≥ 4,5:1. */
export type Pictogram = { id: string; icoon: string; naam: Tekst; emoji: string; kleur: string };

/** 48 pictogrammen die ook klein en in grijs goed uit elkaar te houden zijn. `icoon` = naam van het lucide-pictogram. */
export const PICTOGRAMMEN: readonly Pictogram[] = Object.freeze([
  { id: 'anker', icoon: 'Anchor', naam: ['Якір', 'Anker'], emoji: '⚓', kleur: '#1f5f9e' },
  { id: 'fiets', icoon: 'Bike', naam: ['Велосипед', 'Fiets'], emoji: '🚲', kleur: '#2e7d32' },
  { id: 'camera', icoon: 'Camera', naam: ['Камера', 'Camera'], emoji: '📷', kleur: '#5b4636' },
  { id: 'kat', icoon: 'Cat', naam: ['Кіт', 'Kat'], emoji: '🐱', kleur: '#8a4b00' },
  { id: 'hond', icoon: 'Dog', naam: ['Пес', 'Hond'], emoji: '🐶', kleur: '#7a4f2a' },
  { id: 'vis', icoon: 'Fish', naam: ['Риба', 'Vis'], emoji: '🐟', kleur: '#00727a' },
  { id: 'bloem', icoon: 'Flower2', naam: ['Квітка', 'Bloem'], emoji: '🌸', kleur: '#b0306a' },
  { id: 'gitaar', icoon: 'Guitar', naam: ['Гітара', 'Gitaar'], emoji: '🎸', kleur: '#8e3b12' },
  { id: 'blad', icoon: 'Leaf', naam: ['Листок', 'Blad'], emoji: '🍃', kleur: '#3b7a1e' },
  { id: 'maan', icoon: 'Moon', naam: ['Місяць', 'Maan'], emoji: '🌙', kleur: '#5b3fa8' },
  { id: 'berg', icoon: 'Mountain', naam: ['Гора', 'Berg'], emoji: '⛰️', kleur: '#4f5b66' },
  { id: 'vliegtuig', icoon: 'Plane', naam: ['Літак', 'Vliegtuig'], emoji: '✈️', kleur: '#0a66c2' },
  { id: 'raket', icoon: 'Rocket', naam: ['Ракета', 'Raket'], emoji: '🚀', kleur: '#b3261e' },
  { id: 'schip', icoon: 'Ship', naam: ['Корабель', 'Schip'], emoji: '🚢', kleur: '#1e4f8a' },
  { id: 'ster', icoon: 'Star', naam: ['Зірка', 'Ster'], emoji: '⭐', kleur: '#946200' },
  { id: 'zon', icoon: 'Sun', naam: ['Сонце', 'Zon'], emoji: '☀️', kleur: '#a85400' },
  { id: 'tent', icoon: 'Tent', naam: ['Намет', 'Tent'], emoji: '⛺', kleur: '#6d5a00' },
  { id: 'boom', icoon: 'TreePine', naam: ['Ялинка', 'Dennenboom'], emoji: '🌲', kleur: '#1b6b3a' },
  { id: 'paraplu', icoon: 'Umbrella', naam: ['Парасоля', 'Paraplu'], emoji: '☂️', kleur: '#7b2fa0' },
  { id: 'vogel', icoon: 'Bird', naam: ['Пташка', 'Vogel'], emoji: '🐦', kleur: '#00796b' },
  { id: 'auto', icoon: 'Car', naam: ['Авто', 'Auto'], emoji: '🚗', kleur: '#c62828' },
  { id: 'wolk', icoon: 'Cloud', naam: ['Хмара', 'Wolk'], emoji: '☁️', kleur: '#3d6a8f' },
  { id: 'hart', icoon: 'Heart', naam: ['Серце', 'Hart'], emoji: '❤️', kleur: '#c2185b' },
  { id: 'koffie', icoon: 'Coffee', naam: ['Кава', 'Koffie'], emoji: '☕', kleur: '#6b4423' },
  // TELEGRAM-002 (14.11.2026, eis van de eigenaar): ruimer assortiment — 24 erbij; ALLEEN achteraan toevoegen (indexen staan in lopende verzoeken).
  { id: 'appel', icoon: 'Apple', naam: ['Яблуко', 'Appel'], emoji: '🍎', kleur: '#a3231c' },
  { id: 'bel', icoon: 'Bell', naam: ['Дзвоник', 'Bel'], emoji: '🔔', kleur: '#8a6a00' },
  { id: 'boek', icoon: 'BookOpen', naam: ['Книга', 'Boek'], emoji: '📖', kleur: '#3f51b5' },
  { id: 'sleutel', icoon: 'Key', naam: ['Ключ', 'Sleutel'], emoji: '🔑', kleur: '#7a6200' },
  { id: 'lamp', icoon: 'Lightbulb', naam: ['Лампочка', 'Lamp'], emoji: '💡', kleur: '#9c5a00' },
  { id: 'noot', icoon: 'Music', naam: ['Нота', 'Muzieknoot'], emoji: '🎵', kleur: '#6a1b9a' },
  { id: 'schaar', icoon: 'Scissors', naam: ['Ножиці', 'Schaar'], emoji: '✂️', kleur: '#455a64' },
  { id: 'sneeuw', icoon: 'Snowflake', naam: ['Сніжинка', 'Sneeuwvlok'], emoji: '❄️', kleur: '#0277bd' },
  { id: 'beker', icoon: 'Trophy', naam: ['Кубок', 'Beker'], emoji: '🏆', kleur: '#8d5b00' },
  { id: 'cadeau', icoon: 'Gift', naam: ['Подарунок', 'Cadeau'], emoji: '🎁', kleur: '#ad1457' },
  { id: 'wereld', icoon: 'Globe', naam: ['Глобус', 'Wereldbol'], emoji: '🌍', kleur: '#00695c' },
  { id: 'hamer', icoon: 'Hammer', naam: ['Молоток', 'Hamer'], emoji: '🔨', kleur: '#5d4037' },
  { id: 'huis', icoon: 'House', naam: ['Дім', 'Huis'], emoji: '🏠', kleur: '#8e244d' },
  { id: 'kroon', icoon: 'Crown', naam: ['Корона', 'Kroon'], emoji: '👑', kleur: '#7c5800' },
  { id: 'veer', icoon: 'Feather', naam: ['Перо', 'Veer'], emoji: '🪶', kleur: '#4a6572' },
  { id: 'vlam', icoon: 'Flame', naam: ['Вогонь', 'Vlam'], emoji: '🔥', kleur: '#c2410c' },
  { id: 'bril', icoon: 'Glasses', naam: ['Окуляри', 'Bril'], emoji: '👓', kleur: '#37474f' },
  { id: 'trein', icoon: 'TrainFront', naam: ['Потяг', 'Trein'], emoji: '🚆', kleur: '#283593' },
  { id: 'potlood', icoon: 'Pencil', naam: ['Олівець', 'Potlood'], emoji: '✏️', kleur: '#827717' },
  { id: 'klok', icoon: 'Clock', naam: ['Годинник', 'Klok'], emoji: '🕒', kleur: '#4527a0' },
  { id: 'kers', icoon: 'Cherry', naam: ['Вишня', 'Kers'], emoji: '🍒', kleur: '#880e4f' },
  { id: 'wortel', icoon: 'Carrot', naam: ['Морква', 'Wortel'], emoji: '🥕', kleur: '#c75300' },
  { id: 'konijn', icoon: 'Rabbit', naam: ['Кролик', 'Konijn'], emoji: '🐰', kleur: '#6d4c41' },
  { id: 'schildpad', icoon: 'Turtle', naam: ['Черепаха', 'Schildpad'], emoji: '🐢', kleur: '#33691e' },
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

// ------------------------------------------------------------------------------------------------ TELEGRAM-002: tegels
// Eén tegel = vaste kleur + wit vectorpictogram + naam. Dezelfde gegevens tekenen de tegel op de site (React) en in het
// beveiligde Telegram-venster (svg-tekst), dus beide schermen tonen pixel voor pixel hetzelfde — geen emoji.

export type Tegel = { index: number; id: string; kleur: string; naam: string; vorm: (typeof VORMEN)[string] };
export function pictogramTegel(index: number, taal: 'uk' | 'nl'): Tegel | null {
  if (!Number.isInteger(index) || index < 0 || index >= PICTOGRAMMEN.length) return null;
  const p = PICTOGRAMMEN[index];
  const vorm = VORMEN[p.icoon];
  if (!vorm) return null;
  return { index, id: p.id, kleur: p.kleur, naam: taal === 'nl' ? p.naam[1] : p.naam[0], vorm };
}
const attrEsc = (v: string): string => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** Het pictogram als svg-tekst (wit, lijn 2), voor pagina's zonder React. Alleen vormen uit de vaste catalogus: geen invoer van buiten. */
export function pictogramSvg(index: number, stijl = ''): string {
  const p = PICTOGRAMMEN[index];
  const vorm = p ? VORMEN[p.icoon] : null;
  if (!vorm) return '';
  const delen = vorm.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${attrEsc(v)}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${stijl ? ` style="${attrEsc(stijl)}"` : ''}>${delen}</svg>`;
}

/**
 * Opmaak van de tegel als gegevens: de site zet ze als `style` (React), het Telegram-venster als `style="…"`-tekst. Zo is er
 * één bron en kunnen de twee niet uit elkaar lopen. Vaste kleuren: het thema (licht/donker) van site of Telegram verandert niets.
 */
export function tegelStijlen(kleur: string, groot = false): { tegel: Record<string, string>; vorm: Record<string, string>; naam: Record<string, string> } {
  return {
    tegel: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%', aspectRatio: '1 / 1', boxSizing: 'border-box',
      borderRadius: groot ? '30px' : '22px', background: /^#[0-9a-f]{6}$/i.test(kleur) ? kleur : '#4f5b66', color: '#fff', position: 'relative',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,.18)' },
    vorm: { display: 'block', width: '56%', height: 'auto', aspectRatio: '1 / 1', flex: 'none' },
    naam: { fontSize: groot ? '1.1rem' : '0.9rem', fontWeight: '650', letterSpacing: '0.01em', lineHeight: '1.2', textAlign: 'center', padding: '0 4px' },
  };
}
/** React-stijl → `style`-attribuut («placeItems» → «place-items»). */
export const stijlTekst = (s: Record<string, string>): string => Object.entries(s).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`).join(';');
