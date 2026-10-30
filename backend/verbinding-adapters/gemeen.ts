// UI-013 fase 2 — gedeelde typen van de verbindingsadapters (WebDAV/Nextcloud, S3, MQTT). Alleen LEZEN/controleren: geen
// enkele adapter schrijft iets bij de externe dienst. Netwerk wordt geïnjecteerd: de route geeft pinnedFetch (SSRF-bescherming,
// time-out, maximum bytes), de tests een gewone fetch naar een lokale testserver.
export type Haal = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>;
export type Uitslag<T> = { ok: true; waarde: T } | { ok: false; fout: string; detail?: string };
export const httpFout = (prefix: string, status: number): string =>
  status === 401 || status === 403 ? `${prefix}_TOEGANG_GEWEIGERD` : status === 404 ? `${prefix}_NIET_GEVONDEN` : status >= 500 ? `${prefix}_SERVERFOUT` : `${prefix}_HTTP_${status}`;
export const alleenHttps = (adres: string, toestaanHttp = false): URL | null => {
  try { const u = new URL(adres); if (u.username || u.password) return null; if (u.protocol === 'https:' || (toestaanHttp && u.protocol === 'http:')) return u; return null; } catch { return null; }
};
