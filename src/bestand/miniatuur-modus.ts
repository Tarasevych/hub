import { type MiniatuurModus } from '../../shared/miniatuur-beleid';

const SLEUTEL = 'mijn-ruimte:miniatuur-modus';

export function miniatuurModusVan(waarde: unknown): MiniatuurModus {
  return waarde === 'altijd' || waarde === 'op-verzoek' ? waarde : 'auto';
}

export function miniatuurModusLezen(): MiniatuurModus {
  try { return miniatuurModusVan(globalThis.localStorage?.getItem(SLEUTEL)); } catch { return 'auto'; }
}

export function miniatuurModusSchrijven(modus: MiniatuurModus): void {
  try { globalThis.localStorage?.setItem(SLEUTEL, modus); } catch { /* приватний режим */ }
}
