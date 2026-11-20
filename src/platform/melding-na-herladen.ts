// IDENTITEIT-015 (рецензія delen): підсумок дії, після якої сторінка перезавантажується («Вийти з простору»), інакше зникає разом
// зі станом React ще до того, як людина його побачить. Зберігаємо пару uk/nl у sessionStorage цієї вкладки на хвилину й показуємо
// один раз після завантаження. Melding die een herlaadbeurt overleeft: één keer tonen, alleen in dit tabblad, maximaal een minuut oud.
// Сховище може бути недоступне (приватне вікно, заборона) — тоді просто нічого не показуємо, дія від цього не залежить.
export type MeldingPaar = readonly [string, string];

const SLEUTEL = 'tsv-melding-na-herladen-v1';
const MAX_OUDERDOM = 60_000;
type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const standaard = (): Opslag | null => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };

/** Bewaar de melding vlak vóór location.reload(). */
export function bewaarMeldingNaHerladen(paar: MeldingPaar, opslag: Opslag | null = standaard(), nu = Date.now()): void {
  try { opslag?.setItem(SLEUTEL, JSON.stringify({ uk: String(paar[0]), nl: String(paar[1]), t: nu })); } catch { /* geen opslag — niets */ }
}

/** Haal de melding één keer op (en wis haar meteen); te oud of onleesbaar = null. */
export function haalMeldingNaHerladen(opslag: Opslag | null = standaard(), nu = Date.now()): MeldingPaar | null {
  try {
    const ruw = opslag?.getItem(SLEUTEL); if (!ruw) return null;
    opslag?.removeItem(SLEUTEL);
    const m = JSON.parse(ruw) as { uk?: unknown; nl?: unknown; t?: unknown };
    if (typeof m.uk !== 'string' || typeof m.nl !== 'string' || !m.uk || !m.nl || typeof m.t !== 'number' || nu - m.t > MAX_OUDERDOM || m.t > nu + 5_000) return null;
    return [m.uk.slice(0, 400), m.nl.slice(0, 400)];
  } catch { return null; }
}
