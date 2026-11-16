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

/** `kleur`: vaste achtergrond van de tegel (TELEGRAM-002), onafhankelijk van licht/donker thema en passend bij het beeld (maan geel, dennenboom groen).
 *  De lijn en de naam erop zijn wit of donker — zie inktVoor — zodat het contrast altijd ≥ 4,5:1 is. */
export type Pictogram = { id: string; icoon: string; naam: Tekst; emoji: string; kleur: string };

/** 96 pictogrammen die ook klein en in grijs goed uit elkaar te houden zijn. `icoon` = naam van het lucide-pictogram. */
export const PICTOGRAMMEN: readonly Pictogram[] = Object.freeze([
  { id: 'anker', icoon: 'Anchor', naam: ['Якір', 'Anker'], emoji: '⚓', kleur: '#1f4e79' },
  { id: 'fiets', icoon: 'Bike', naam: ['Велосипед', 'Fiets'], emoji: '🚲', kleur: '#00838f' },
  { id: 'camera', icoon: 'Camera', naam: ['Камера', 'Camera'], emoji: '📷', kleur: '#37474f' },
  { id: 'kat', icoon: 'Cat', naam: ['Кіт', 'Kat'], emoji: '🐱', kleur: '#b05c0e' },
  { id: 'hond', icoon: 'Dog', naam: ['Пес', 'Hond'], emoji: '🐶', kleur: '#7a4f2a' },
  { id: 'vis', icoon: 'Fish', naam: ['Риба', 'Vis'], emoji: '🐟', kleur: '#197e98' },
  { id: 'bloem', icoon: 'Flower2', naam: ['Квітка', 'Bloem'], emoji: '🌸', kleur: '#c84077' },
  { id: 'gitaar', icoon: 'Guitar', naam: ['Гітара', 'Gitaar'], emoji: '🎸', kleur: '#a05a2c' },
  { id: 'blad', icoon: 'Leaf', naam: ['Листок', 'Blad'], emoji: '🍃', kleur: '#4c9a2a' },
  { id: 'maan', icoon: 'Moon', naam: ['Місяць', 'Maan'], emoji: '🌙', kleur: '#f6d743' },
  { id: 'berg', icoon: 'Mountain', naam: ['Гора', 'Berg'], emoji: '⛰️', kleur: '#6b7780' },
  { id: 'vliegtuig', icoon: 'Plane', naam: ['Літак', 'Vliegtuig'], emoji: '✈️', kleur: '#3f8fd6' },
  { id: 'raket', icoon: 'Rocket', naam: ['Ракета', 'Raket'], emoji: '🚀', kleur: '#b3261e' },
  { id: 'schip', icoon: 'Ship', naam: ['Корабель', 'Schip'], emoji: '🚢', kleur: '#1e4f8a' },
  { id: 'ster', icoon: 'Star', naam: ['Зірка', 'Ster'], emoji: '⭐', kleur: '#e6a700' },
  { id: 'zon', icoon: 'Sun', naam: ['Сонце', 'Zon'], emoji: '☀️', kleur: '#ffb300' },
  { id: 'tent', icoon: 'Tent', naam: ['Намет', 'Tent'], emoji: '⛺', kleur: '#81722b' },
  { id: 'boom', icoon: 'TreePine', naam: ['Ялинка', 'Dennenboom'], emoji: '🌲', kleur: '#1b6b3a' },
  { id: 'paraplu', icoon: 'Umbrella', naam: ['Парасоля', 'Paraplu'], emoji: '☂️', kleur: '#7b2fa0' },
  { id: 'vogel', icoon: 'Bird', naam: ['Пташка', 'Vogel'], emoji: '🐦', kleur: '#2a9df4' },
  { id: 'auto', icoon: 'Car', naam: ['Авто', 'Auto'], emoji: '🚗', kleur: '#d32f2f' },
  { id: 'wolk', icoon: 'Cloud', naam: ['Хмара', 'Wolk'], emoji: '☁️', kleur: '#b8c7d6' },
  { id: 'hart', icoon: 'Heart', naam: ['Серце', 'Hart'], emoji: '❤️', kleur: '#e0245e' },
  { id: 'koffie', icoon: 'Coffee', naam: ['Кава', 'Koffie'], emoji: '☕', kleur: '#6b4423' },
  // TELEGRAM-002 (14.11.2026, eis van de eigenaar): ruimer assortiment — 24 erbij; ALLEEN achteraan toevoegen (indexen staan in lopende verzoeken).
  { id: 'appel', icoon: 'Apple', naam: ['Яблуко', 'Appel'], emoji: '🍎', kleur: '#c62828' },
  { id: 'bel', icoon: 'Bell', naam: ['Дзвоник', 'Bel'], emoji: '🔔', kleur: '#d4a017' },
  { id: 'boek', icoon: 'BookOpen', naam: ['Книга', 'Boek'], emoji: '📖', kleur: '#3f51b5' },
  { id: 'sleutel', icoon: 'Key', naam: ['Ключ', 'Sleutel'], emoji: '🔑', kleur: '#b8860b' },
  { id: 'lamp', icoon: 'Lightbulb', naam: ['Лампочка', 'Lamp'], emoji: '💡', kleur: '#ffd54f' },
  { id: 'noot', icoon: 'Music', naam: ['Нота', 'Muzieknoot'], emoji: '🎵', kleur: '#6a1b9a' },
  { id: 'schaar', icoon: 'Scissors', naam: ['Ножиці', 'Schaar'], emoji: '✂️', kleur: '#5d7986' },
  { id: 'sneeuw', icoon: 'Snowflake', naam: ['Сніжинка', 'Sneeuwvlok'], emoji: '❄️', kleur: '#8fd3f4' },
  { id: 'beker', icoon: 'Trophy', naam: ['Кубок', 'Beker'], emoji: '🏆', kleur: '#c99700' },
  { id: 'cadeau', icoon: 'Gift', naam: ['Подарунок', 'Cadeau'], emoji: '🎁', kleur: '#ad1457' },
  { id: 'wereld', icoon: 'Globe', naam: ['Глобус', 'Wereldbol'], emoji: '🌍', kleur: '#1976a8' },
  { id: 'hamer', icoon: 'Hammer', naam: ['Молоток', 'Hamer'], emoji: '🔨', kleur: '#5d4037' },
  { id: 'huis', icoon: 'House', naam: ['Дім', 'Huis'], emoji: '🏠', kleur: '#a8452e' },
  { id: 'kroon', icoon: 'Crown', naam: ['Корона', 'Kroon'], emoji: '👑', kleur: '#e0b100' },
  { id: 'veer', icoon: 'Feather', naam: ['Перо', 'Veer'], emoji: '🪶', kleur: '#4a6572' },
  { id: 'vlam', icoon: 'Flame', naam: ['Вогонь', 'Vlam'], emoji: '🔥', kleur: '#c64c1d' },
  { id: 'bril', icoon: 'Glasses', naam: ['Окуляри', 'Bril'], emoji: '👓', kleur: '#263238' },
  { id: 'trein', icoon: 'TrainFront', naam: ['Потяг', 'Trein'], emoji: '🚆', kleur: '#283593' },
  { id: 'potlood', icoon: 'Pencil', naam: ['Олівець', 'Potlood'], emoji: '✏️', kleur: '#f4b400' },
  { id: 'klok', icoon: 'Clock', naam: ['Годинник', 'Klok'], emoji: '🕒', kleur: '#4527a0' },
  { id: 'kers', icoon: 'Cherry', naam: ['Вишня', 'Kers'], emoji: '🍒', kleur: '#9b1b30' },
  { id: 'wortel', icoon: 'Carrot', naam: ['Морква', 'Wortel'], emoji: '🥕', kleur: '#e8730c' },
  { id: 'konijn', icoon: 'Rabbit', naam: ['Кролик', 'Konijn'], emoji: '🐰', kleur: '#c9c2b8' },
  { id: 'schildpad', icoon: 'Turtle', naam: ['Черепаха', 'Schildpad'], emoji: '🐢', kleur: '#527e34' },
  // 15.11.2026 (eis van de eigenaar): nog 48 erbij en kleuren die bij het beeld horen (dennenboom groen, maan geel). ALLEEN achteraan toevoegen.
  // Українською: кольори за змістом, щоб швидко орієнтуватися; нові піктограми — лише в кінець списку.
  { id: 'banaan', icoon: 'Banana', naam: ['Банан', 'Banaan'], emoji: '🍌', kleur: '#ffe135' },
  { id: 'druif', icoon: 'Grape', naam: ['Виноград', 'Druiven'], emoji: '🍇', kleur: '#6f2da8' },
  { id: 'citroen', icoon: 'Citrus', naam: ['Лимон', 'Citroen'], emoji: '🍋', kleur: '#fff44f' },
  { id: 'ei', icoon: 'Egg', naam: ['Яйце', 'Ei'], emoji: '🥚', kleur: '#f3e5c0' },
  { id: 'pizza', icoon: 'Pizza', naam: ['Піца', 'Pizza'], emoji: '🍕', kleur: '#e07b1a' },
  { id: 'ijsje', icoon: 'IceCreamCone', naam: ['Морозиво', 'IJsje'], emoji: '🍦', kleur: '#f8bbd0' },
  { id: 'taart', icoon: 'CakeSlice', naam: ['Торт', 'Taart'], emoji: '🍰', kleur: '#e57399' },
  { id: 'croissant', icoon: 'Croissant', naam: ['Круасан', 'Croissant'], emoji: '🥐', kleur: '#c68a3c' },
  { id: 'koekje', icoon: 'Cookie', naam: ['Печиво', 'Koekje'], emoji: '🍪', kleur: '#9c6b3f' },
  { id: 'snoep', icoon: 'Candy', naam: ['Цукерка', 'Snoepje'], emoji: '🍬', kleur: '#cf386a' },
  { id: 'eekhoorn', icoon: 'Squirrel', naam: ['Білка', 'Eekhoorn'], emoji: '🐿️', kleur: '#b5541c' },
  { id: 'slak', icoon: 'Snail', naam: ['Равлик', 'Slak'], emoji: '🐌', kleur: '#8d9440' },
  { id: 'kever', icoon: 'Bug', naam: ['Жук', 'Kever'], emoji: '🐞', kleur: '#b71c1c' },
  { id: 'schelp', icoon: 'Shell', naam: ['Мушля', 'Schelp'], emoji: '🐚', kleur: '#f1d7b8' },
  { id: 'poot', icoon: 'PawPrint', naam: ['Лапа', 'Poot'], emoji: '🐾', kleur: '#795548' },
  { id: 'bot', icoon: 'Bone', naam: ['Кістка', 'Bot'], emoji: '🦴', kleur: '#ece5d3' },
  { id: 'trommel', icoon: 'Drum', naam: ['Барабан', 'Trommel'], emoji: '🥁', kleur: '#c0392b' },
  { id: 'bus', icoon: 'Bus', naam: ['Автобус', 'Bus'], emoji: '🚌', kleur: '#f9a825' },
  { id: 'zeilboot', icoon: 'Sailboat', naam: ['Вітрильник', 'Zeilboot'], emoji: '⛵', kleur: '#0d6ea8' },
  { id: 'vrachtwagen', icoon: 'Truck', naam: ['Вантажівка', 'Vrachtwagen'], emoji: '🚚', kleur: '#546e7a' },
  { id: 'tractor', icoon: 'Tractor', naam: ['Трактор', 'Tractor'], emoji: '🚜', kleur: '#398133' },
  { id: 'regenboog', icoon: 'Rainbow', naam: ['Веселка', 'Regenboog'], emoji: '🌈', kleur: '#8e44ad' },
  { id: 'bliksem', icoon: 'Zap', naam: ['Блискавка', 'Bliksem'], emoji: '⚡', kleur: '#ffea00' },
  { id: 'druppel', icoon: 'Droplet', naam: ['Крапля', 'Druppel'], emoji: '💧', kleur: '#1e88e5' },
  { id: 'diamant', icoon: 'Gem', naam: ['Діамант', 'Diamant'], emoji: '💎', kleur: '#4dd0e1' },
  { id: 'puzzel', icoon: 'Puzzle', naam: ['Пазл', 'Puzzel'], emoji: '🧩', kleur: '#43a047' },
  { id: 'palet', icoon: 'Palette', naam: ['Палітра', 'Palet'], emoji: '🎨', kleur: '#8d6e63' },
  { id: 'shirt', icoon: 'Shirt', naam: ['Футболка', 'T-shirt'], emoji: '👕', kleur: '#5c6bc0' },
  { id: 'rugzak', icoon: 'Backpack', naam: ['Рюкзак', 'Rugzak'], emoji: '🎒', kleur: '#00796b' },
  { id: 'kompas', icoon: 'Compass', naam: ['Компас', 'Kompas'], emoji: '🧭', kleur: '#8c2f39' },
  { id: 'vlag', icoon: 'Flag', naam: ['Прапор', 'Vlag'], emoji: '🚩', kleur: '#d73531' },
  { id: 'slot', icoon: 'Lock', naam: ['Замок', 'Slot'], emoji: '🔒', kleur: '#455a64' },
  { id: 'magneet', icoon: 'Magnet', naam: ['Магніт', 'Magneet'], emoji: '🧲', kleur: '#d50000' },
  { id: 'telescoop', icoon: 'Telescope', naam: ['Телескоп', 'Telescoop'], emoji: '🔭', kleur: '#1a237e' },
  { id: 'bijl', icoon: 'Axe', naam: ['Сокира', 'Bijl'], emoji: '🪓', kleur: '#6d4c41' },
  { id: 'spook', icoon: 'Ghost', naam: ['Привид', 'Spook'], emoji: '👻', kleur: '#e3e8ee' },
  { id: 'bed', icoon: 'Bed', naam: ['Ліжко', 'Bed'], emoji: '🛏️', kleur: '#7e57c2' },
  { id: 'kiem', icoon: 'Sprout', naam: ['Паросток', 'Kiemplant'], emoji: '🌱', kleur: '#8bc34a' },
  { id: 'klaver', icoon: 'Clover', naam: ['Конюшина', 'Klaver'], emoji: '🍀', kleur: '#2e7d32' },
  { id: 'koren', icoon: 'Wheat', naam: ['Колос', 'Korenaar'], emoji: '🌾', kleur: '#e3b448' },
  { id: 'golven', icoon: 'Waves', naam: ['Хвилі', 'Golven'], emoji: '🌊', kleur: '#0277bd' },
  { id: 'schild', icoon: 'Shield', naam: ['Щит', 'Schild'], emoji: '🛡️', kleur: '#3949ab' },
  { id: 'halter', icoon: 'Dumbbell', naam: ['Гантеля', 'Halter'], emoji: '🏋️', kleur: '#424242' },
  { id: 'bal', icoon: 'Volleyball', naam: ['М’яч', 'Bal'], emoji: '🏐', kleur: '#fb8c00' },
  { id: 'melk', icoon: 'Milk', naam: ['Молоко', 'Melk'], emoji: '🥛', kleur: '#dbeafe' },
  { id: 'ticket', icoon: 'Ticket', naam: ['Квиток', 'Kaartje'], emoji: '🎫', kleur: '#c2185b' },
  { id: 'dobbelsteen', icoon: 'Dice5', naam: ['Кубик', 'Dobbelsteen'], emoji: '🎲', kleur: '#008073' },
  { id: 'kwast', icoon: 'Brush', naam: ['Пензель', 'Penseel'], emoji: '🖌️', kleur: '#7b1fa2' },
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

/**
 * Trekking voor het Telegram-venster ZONDER snelle herhaling (eis van de eigenaar 15.11.2026): het juiste pictogram komt niet uit
 * `recent` (de laatst getoonde juiste pictogrammen van dit apparaat of account), zodat iemand die vaak aanmeldt het beeld van nu
 * niet verwart met dat van de vorige keer. De afleiders komen uit de hele catalogus. `recent` leeg of te groot → gewone trekking.
 * Українською: правильна піктограма не повторюється, доки не пройде майже весь набір; хибні варіанти — з усього каталогу.
 */
export function trekZonderHerhaling(aantal: number, recent: readonly number[], willekeur: Willekeur): { soort: 'pictogrammen'; kandidaten: number[]; juist: number } {
  const n = Math.max(3, Math.min(5, Math.floor(aantal) || 3));
  const grootte = PICTOGRAMMEN.length;
  const weg = new Set(recent.filter((i) => Number.isInteger(i) && i >= 0 && i < grootte));
  let vrij = Array.from({ length: grootte }, (_, i) => i).filter((i) => !weg.has(i));
  if (vrij.length < 1) vrij = Array.from({ length: grootte }, (_, i) => i);
  const goed = vrij[willekeur(vrij.length)];
  const bak = Array.from({ length: grootte }, (_, i) => i).filter((i) => i !== goed);
  const kandidaten: number[] = [];
  while (kandidaten.length < n - 1) { const i = willekeur(bak.length); kandidaten.push(bak[i]); bak.splice(i, 1); }
  const juist = willekeur(n);
  kandidaten.splice(juist, 0, goed);
  return { soort: 'pictogrammen', kandidaten, juist };
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

const helderheid = (hex: string): number => {
  const k = (i: number) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * k(1) + 0.7152 * k(3) + 0.0722 * k(5);
};
export const INKT_LICHT = '#ffffff';
export const INKT_DONKER = '#1b1f24';
/** Kleur van lijn en naam op een tegel: wit waar dat ≥ 4,5:1 haalt, anders donker (lichte tegels: maan, citroen, sneeuwvlok). */
export function inktVoor(kleur: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(kleur)) return INKT_LICHT;
  return 1.05 / (helderheid(kleur) + 0.05) >= 4.5 ? INKT_LICHT : INKT_DONKER;
}
/** Contrast tussen de tegel en zijn inkt (voor de test). */
export const tegelContrast = (kleur: string): number => { const a = helderheid(kleur), b = helderheid(inktVoor(kleur)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

export type Tegel = { index: number; id: string; kleur: string; inkt: string; naam: string; vorm: (typeof VORMEN)[string] };
export function pictogramTegel(index: number, taal: 'uk' | 'nl'): Tegel | null {
  if (!Number.isInteger(index) || index < 0 || index >= PICTOGRAMMEN.length) return null;
  const p = PICTOGRAMMEN[index];
  const vorm = VORMEN[p.icoon];
  if (!vorm) return null;
  return { index, id: p.id, kleur: p.kleur, inkt: inktVoor(p.kleur), naam: taal === 'nl' ? p.naam[1] : p.naam[0], vorm };
}
const attrEsc = (v: string): string => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** Het pictogram als svg-tekst (inkt van de tegel, lijn 2), voor pagina's zonder React. Alleen vormen uit de vaste catalogus: geen invoer van buiten. */
export function pictogramSvg(index: number, stijl = ''): string {
  const p = PICTOGRAMMEN[index];
  const vorm = p ? VORMEN[p.icoon] : null;
  if (!vorm) return '';
  const delen = vorm.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${attrEsc(v)}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${inktVoor(p.kleur)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${stijl ? ` style="${attrEsc(stijl)}"` : ''}>${delen}</svg>`;
}

/**
 * Opmaak van de tegel als gegevens: de site zet ze als `style` (React), het Telegram-venster als `style="…"`-tekst. Zo is er
 * één bron en kunnen de twee niet uit elkaar lopen. Vaste kleuren: het thema (licht/donker) van site of Telegram verandert niets.
 */
export function tegelStijlen(kleur: string, groot = false): { tegel: Record<string, string>; vorm: Record<string, string>; naam: Record<string, string> } {
  return {
    tegel: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%', minHeight: groot ? '128px' : '90px', padding: groot ? '12px 8px' : '8px 4px', aspectRatio: '1 / 1', boxSizing: 'border-box',
      borderRadius: groot ? '30px' : '22px', background: /^#[0-9a-f]{6}$/i.test(kleur) ? kleur : '#4f5b66', color: inktVoor(kleur), position: 'relative',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,.18)' },
    vorm: { display: 'block', width: groot ? '56%' : '50%', height: 'auto', aspectRatio: '1 / 1', flex: 'none' },
    naam: { fontSize: groot ? '1.1rem' : 'clamp(0.68rem, 2.7vw, 0.8rem)', overflowWrap: 'break-word', hyphens: 'auto', maxWidth: '100%', fontWeight: '650', letterSpacing: '0.01em', lineHeight: '1.18', textAlign: 'center', padding: '0 2px' },
  };
}
/** React-stijl → `style`-attribuut («placeItems» → «place-items»). */
export const stijlTekst = (s: Record<string, string>): string => Object.entries(s).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`).join(';');
