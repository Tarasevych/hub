// Політика мініатюр (блок 3, п. 6.4). Лише рішення «качати чи ні». Байти лишаються в браузері.
export type MiniatuurModus = 'auto' | 'altijd' | 'op-verzoek';
export type Verbinding = 'snel' | '3g' | '2g' | 'onbekend';

export const MINIATUUR_MAX_DUIM = 1500;
export const MINIATUUR_MAX_BYTES = 25 * 1024 * 1024;

export type MiniatuurInvoer = {
  modus: MiniatuurModus;
  verbinding: Verbinding;
  saveData: boolean;
  /** null = розмір ще невідомий; вантажник має обірвати, щойно розмір відомий і він понад maxBytes. */
  bytes: number | null;
  gevraagd: boolean;
};

const MODI = new Set<MiniatuurModus>(['auto', 'altijd', 'op-verzoek']);

export function miniatuurBesluit(i: MiniatuurInvoer): { laden: boolean; maxBytes: number } {
  const modus: MiniatuurModus = MODI.has(i.modus) ? i.modus : 'auto';
  const verbinding: Verbinding = i.verbinding === '3g' || i.verbinding === '2g' || i.verbinding === 'onbekend' ? i.verbinding : 'snel';
  const past = (maxBytes: number) => i.bytes === null || i.bytes <= maxBytes;
  if (modus === 'op-verzoek') return { laden: i.gevraagd === true && past(8_000_000), maxBytes: 8_000_000 };
  if (modus === 'altijd') return { laden: past(8_000_000), maxBytes: 8_000_000 };
  if (i.saveData || verbinding === '2g') return { laden: i.gevraagd === true && past(8_000_000), maxBytes: 8_000_000 };
  const maxBytes = verbinding === '3g' ? 1_000_000 : 4_000_000;
  return { laden: past(maxBytes), maxBytes };
}

/** prefetchMode() з src/zichtbaar-voorladen.ts → клас з'єднання для політики. */
export function verbindingUitPrefetch(mode: string): Verbinding {
  if (mode === 'off') return '2g';
  if (mode === 'conservative') return '3g';
  return 'snel';
}
