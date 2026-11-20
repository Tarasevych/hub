// TELEGRAM-004 (0299): «Вимагати місце пристрою» — de gebruiker kiest per aanmeldmethode. Eén lijst voor server en site.
// Спосіб входу → назва для людини. Порядок = порядок перемикачів у налаштуваннях.
export const PLAATS_EIS_METHODEN = ['telegram', 'passkey', 'password', 'google', 'microsoft', 'discord', 'apple'] as const;
export type PlaatsEisMethode = (typeof PLAATS_EIS_METHODEN)[number];
export const PLAATS_EIS_NAAM: Readonly<Record<PlaatsEisMethode, { uk: string; nl: string }>> = Object.freeze({
  telegram: { uk: 'Telegram', nl: 'Telegram' },
  passkey: { uk: 'Ключ доступу', nl: 'Toegangssleutel' },
  password: { uk: 'Пароль', nl: 'Wachtwoord' },
  google: { uk: 'Google', nl: 'Google' },
  microsoft: { uk: 'Microsoft', nl: 'Microsoft' },
  discord: { uk: 'Discord', nl: 'Discord' },
  apple: { uk: 'Apple', nl: 'Apple' },
});
/** Alleen bekende methoden, zonder dubbelen, in vaste volgorde. */
export function plaatsEisSchoon(waarde: unknown): PlaatsEisMethode[] {
  const set = new Set(Array.isArray(waarde) ? waarde.map((x) => String(x)) : []);
  return PLAATS_EIS_METHODEN.filter((m) => set.has(m));
}
/** Plaats die de browser bij het starten van een aanmelding meestuurt: geldig punt, afgerond op 2 decimalen (≈ 1 km). */
export function plaatsUitVerzoek(waarde: unknown): { geoStand: 'gegeven'; geoLat: number; geoLon: number; geoNauwkeurig: number } | null {
  if (!waarde || typeof waarde !== 'object') return null;
  const p = waarde as { lat?: unknown; lon?: unknown; nauwkeurig?: unknown };
  const lat = typeof p.lat === 'number' ? p.lat : NaN, lon = typeof p.lon === 'number' ? p.lon : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  const n = typeof p.nauwkeurig === 'number' && Number.isFinite(p.nauwkeurig) ? Math.min(100000, Math.max(0, Math.round(p.nauwkeurig))) : 0;
  return { geoStand: 'gegeven', geoLat: Math.round(lat * 100) / 100, geoLon: Math.round(lon * 100) / 100, geoNauwkeurig: n };
}
