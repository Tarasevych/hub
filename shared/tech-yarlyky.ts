// Спільна логіка ярликів кнопок технічного профілю (без React/DOM, використовується в інтерфейсі та модульних тестах).
import { isBeheerPagina } from './beheer-paginas';
import { ontleed } from './menu-indeling';
import { BAND_KLEUREN, STANDAARD_BAND, isBandKleur, type BandKleur } from './tech-rollen';

export const TECH_YARLYK_DIENSTEN = ['admin', 'api', 'mcp'] as const;

function splitItem(raw: string): { dienst: string; pagina?: string } | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const o = ontleed(s.includes(':') ? s : s.includes('/') ? `pg:${s}` : `svc:${s}`);
  return o ? { dienst: o.dienst, pagina: o.pagina } : null;
}

/**
 * Чи є пункт кнопкою (ярликом) технічного профілю?
 * - admin, api та їхні сторінки — завжди.
 * - адмін-сторінки mcp (dashboard, apps, download, verbindingen) — завжди.
 * - svc:mcp — у технічному просторі («Сервер і розгортання») або у звичайному просторі, якщо немає звичайного права api-platform.
 */
export function isTechYarlykItem(item: string, apiPlatform = false, inTechRuimte = false): boolean {
  const o = splitItem(item);
  if (!o) return false;
  if (o.dienst === 'admin' || o.dienst === 'api') return true;
  if (o.dienst === 'mcp' && o.pagina) return isBeheerPagina('mcp', o.pagina);
  if (o.dienst === 'mcp' && !o.pagina) return inTechRuimte || !apiPlatform;
  return false;
}

/**
 * Чи можна показувати пункт у звичайному просторі (`account`/`gebruiker`).
 * Технічні ярлики (`admin`, `api`, `pg:mcp/*` керування, або `svc:mcp` без права `apiPlatform`) не засмічують звичайне меню самі по собі:
 * вони з'являються лише тоді, коли адміністратор дозволив ярлики (`yarlykMag`) І користувач явно розмістив ярлик (як копію або через itemsOverride).
 */
export function isItemZichtbaarInGebruiker(
  item: string,
  kopie: boolean,
  itemsOverride: Record<string, unknown> | undefined,
  yarlykMag: boolean,
  apiPlatform = false,
): boolean {
  const o = splitItem(item);
  if (!o) return false;
  if (isTechYarlykItem(item, apiPlatform, false)) {
    return yarlykMag && (kopie || Boolean(itemsOverride && itemsOverride[item]));
  }
  return !(o.pagina && isBeheerPagina(o.dienst, o.pagina));
}

/** Кольоровий знак і обведення для ярлика за вибраним кольором технічного профілю. */
export function techYarlykBandKleur(kleur?: string | null): { kleur: BandKleur; bg: string; fg: string } {
  const k: BandKleur = isBandKleur(kleur) ? kleur : STANDAARD_BAND.kleur;
  return { kleur: k, bg: BAND_KLEUREN[k].bg, fg: BAND_KLEUREN[k].fg };
}
