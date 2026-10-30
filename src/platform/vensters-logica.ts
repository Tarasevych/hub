// Zuivere regels van het vensterbeheer (vensters.tsx), apart zodat ze zonder browser te testen zijn.
export type VensterPrioriteit = 'normaal' | 'kritiek';
export type Item = { id: string; titel: string; prioriteit: VensterPrioriteit; modaal: boolean; volgorde: number; klein: boolean; wacht: boolean };
export type Geometrie = { x: number; y: number; b: number; h: number; max: boolean; /** hoogte zelf ingesteld (anders volgt het venster de inhoud) */ vast?: boolean };

/** Volgorde van onder naar boven: «kritiek» altijd boven «normaal»; daarbinnen wie het laatst opende of naar voren kwam. */
export function stapel(lijst: readonly Item[]): Item[] {
  return [...lijst].sort((a, b) => (a.prioriteit === b.prioriteit ? a.volgorde - b.volgorde : a.prioriteit === 'kritiek' ? 1 : -1));
}
/** Het bovenste zichtbare (niet geminimaliseerde) venster. */
export const bovensteZichtbaar = (lijst: readonly Item[]) => stapel(lijst).filter((x) => !x.klein).pop() ?? null;

export const MIN_B = 300, MIN_H = 180, RAND = 8;
/** Binnen het scherm houden (titelbalk altijd bereikbaar), minimale grootte. */
export function binnenScherm(g: Geometrie, w: number, hv: number): Geometrie {
  const b = Math.min(Math.max(g.b, Math.min(MIN_B, w - 2 * RAND)), w - 2 * RAND);
  const h = Math.min(Math.max(g.h, MIN_H), hv - 2 * RAND);
  return { ...g, b, h, x: Math.min(Math.max(g.x, RAND), w - b - RAND), y: Math.min(Math.max(g.y, RAND), hv - Math.min(h, 48) - RAND) };
}
/** Zone waarin vensters mogen staan (vensterpixels): het scherm min de strook die het dok voor zich houdt (venster-dok-logica.ts). */
export type VensterZone = { x: number; y: number; w: number; h: number };
/** binnenScherm, maar binnen een zone (het dok houdt een strook vrij: een venster komt er nooit onder). */
export function binnenZone(g: Geometrie, z: VensterZone): Geometrie {
  const n = binnenScherm({ ...g, x: g.x - z.x, y: g.y - z.y }, z.w, z.h);
  return { ...n, x: n.x + z.x, y: n.y + z.y };
}
