// Snelmenu van één knop van de technische strook (rechtermuisknop, lang tikken, of de toets «Контекстне меню»/Shift+F10).
// Eigenaar 03.11.2026: «Правий клік на кнопці відкриває підменю з додатковими опціями цієї кнопки». Dus eerst wat DEZE knop nog
// kan (openen in een nieuw tabblad, link kopiëren, de ruimte wisselen, de modus kiezen …), daarna de plaats op de strook, de vorm
// van de knoppen en de instellingen. Zuiver (zonder React/DOM): tests/eenheid/strook-menu.test.ts.
import { LABEL_NAMEN, MODUS_NAMEN, STROOK_LABELS, STROOK_MODI, type StrookLabel, type StrookModus } from './strook-voorkeur';

export type KnopMenuItem = {
  label: string;
  onKies: () => void;
  disabled?: boolean;
  /** Keuze uit een reeks (role=menuitemradio): gekozen of niet. Weggelaten = gewone opdracht. */
  gekozen?: boolean;
  /** Kop van het blok waarin de opdracht staat; opeenvolgende opdrachten met dezelfde kop vormen één groep. */
  groep?: string;
};

/** Vaste knoppen van de strook (niet kiesbaar, niet verplaatsbaar). */
export const VASTE_KNOPPEN = ['modus', 'meer', 'instel'] as const;

export type KnopMenuContext = {
  uk: boolean;
  /** Knop-id (strook-voorkeur.ts) of een vaste knop ('modus' | 'meer' | 'instel'). */
  id: string;
  /** Naam van de knop (kop van het eerste blok). */
  naam: string;
  /** Plaats op de strook (0 = vooraan), -1 = staat niet op de strook. */
  plek: number;
  /** Aantal knoppen op de strook. */
  aantal: number;
  /** Mag deze knop op de strook (STROOK_KNOP_IDS)? */
  kiesbaar: boolean;
  modus: StrookModus;
  label: StrookLabel;
  /** Hoofdactie van de knop («Відкрити»). */
  open?: () => void;
  /** Navigatieknop: het adres (voor «нова вкладка» en «копіювати посилання»). */
  url?: string;
  /** Eigen opties van de knop, door TechLaag samengesteld (ruimte wisselen, afmelden, termijn …). */
  extra?: Array<Omit<KnopMenuItem, 'groep'>>;
  acties: {
    naarPlek: (plek: number) => void;
    wegVanStrook: () => void;
    opStrook: () => void;
    zetModus: (m: StrookModus) => void;
    zetLabel: (l: StrookLabel) => void;
    instellingen: () => void;
    nieuwTabblad: (url: string) => void;
    kopieer: (url: string) => void;
    standaard: () => void;
  };
};

export function knopMenu(c: KnopMenuContext): KnopMenuItem[] {
  const t = (uk: string, nl: string) => (c.uk ? uk : nl);
  const uit: KnopMenuItem[] = [];
  const eigen = c.naam || t('Кнопка', 'Knop');
  // 1. wat deze knop kan
  if (c.open) uit.push({ groep: eigen, label: t('Відкрити', 'Openen'), onKies: c.open });
  if (c.url) {
    const url = c.url;
    uit.push({ groep: eigen, label: t('Відкрити в новій вкладці', 'Openen in een nieuw tabblad'), onKies: () => c.acties.nieuwTabblad(url) });
    uit.push({ groep: eigen, label: t('Копіювати посилання', 'Link kopiëren'), onKies: () => c.acties.kopieer(url) });
  }
  for (const x of c.extra || []) uit.push({ ...x, groep: eigen });
  if (c.id === 'modus') {
    const kop = t('Режим смуги', 'Modus van de strook');
    for (const m of STROOK_MODI) uit.push({ groep: kop, label: c.uk ? MODUS_NAMEN[m].uk : MODUS_NAMEN[m].nl, gekozen: c.modus === m, onKies: () => c.acties.zetModus(m) });
  }
  // 2. plaats op de strook (alleen kiesbare knoppen)
  if (c.kiesbaar) {
    const kop = t('Розташування', 'Plaats');
    if (c.plek >= 0) {
      uit.push({ groep: kop, label: t('Ліворуч', 'Naar links'), disabled: c.plek <= 0, onKies: () => c.acties.naarPlek(c.plek - 1) });
      uit.push({ groep: kop, label: t('Праворуч', 'Naar rechts'), disabled: c.plek >= c.aantal - 1, onKies: () => c.acties.naarPlek(c.plek + 1) });
      uit.push({ groep: kop, label: t('На початок смуги', 'Vooraan op de strook'), disabled: c.plek <= 0, onKies: () => c.acties.naarPlek(0) });
      uit.push({ groep: kop, label: t('У кінець смуги', 'Achteraan op de strook'), disabled: c.plek >= c.aantal - 1, onKies: () => c.acties.naarPlek(c.aantal - 1) });
      uit.push({ groep: kop, label: t('Прибрати зі смуги', 'Van de strook halen'), onKies: c.acties.wegVanStrook });
    } else {
      uit.push({ groep: kop, label: t('Додати на смугу', 'Op de strook zetten'), onKies: c.acties.opStrook });
    }
  }
  // 3. vorm van de knoppen (geldt voor de hele strook)
  {
    const kop = t('Вигляд кнопок', 'Vorm van de knoppen');
    for (const l of STROOK_LABELS) uit.push({ groep: kop, label: c.uk ? LABEL_NAMEN[l].uk : LABEL_NAMEN[l].nl, gekozen: c.label === l, onKies: () => c.acties.zetLabel(l) });
  }
  // 4. instellingen
  const kop = t('Смуга', 'Strook');
  uit.push({ groep: kop, label: t('Налаштування смуги…', 'Instellingen van de strook…'), onKies: c.acties.instellingen });
  if (c.id === 'instel') uit.push({ groep: kop, label: t('Типові налаштування', 'Standaard herstellen'), onKies: c.acties.standaard });
  return uit;
}

/** Opeenvolgende opdrachten met dezelfde kop samen (volgorde blijft). */
export function groepeer(items: KnopMenuItem[]): Array<{ kop: string; items: KnopMenuItem[] }> {
  const uit: Array<{ kop: string; items: KnopMenuItem[] }> = [];
  for (const it of items) {
    const kop = it.groep || '';
    const laatste = uit[uit.length - 1];
    if (laatste && laatste.kop === kop) laatste.items.push(it); else uit.push({ kop, items: [it] });
  }
  return uit;
}
