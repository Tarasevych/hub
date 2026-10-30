// Pure delen van src/impersonatie/modus.ts (zonder browser-API's), apart zodat de eenheidstest ze in Node kan laden.
/** Dienst uit de hostnaam (id.tarasevych.com → identity). Lokaal/onbekend: hub. */
export function dienstVanHost(host: string): string {
  const eerste = String(host || '').toLowerCase().split('.')[0];
  if (eerste === 'id') return 'identity';
  return ['hub', 'mail', 'cloud', 'ai', 'github', 'huis'].includes(eerste) ? eerste : 'hub';
}

/**
 * Puur (getest): welke aanroep van de app moet als de gebruiker lopen, en met welke route en body?
 * null = niet doorsturen (andere origin, geen /api/, of /api/impersonatie/* zelf — die horen bij de beheerder).
 */
export function herschrijf(method: string, url: string, bodyTekst: unknown, origin: string): { route: string; body: Record<string, unknown> } | null {
  let u: URL;
  try { u = new URL(url, origin); } catch { return null; }
  // /api/impersonatie/* en het technisch profiel (/api/owner/tech/*) blijven van de beheerder zelf: zijn band en zijn activering.
  if (u.origin !== origin || !u.pathname.startsWith('/api/') || u.pathname.startsWith('/api/impersonatie/') || u.pathname.startsWith('/api/owner/tech/')) return null;
  const m = String(method || 'GET').toUpperCase();
  let body: Record<string, unknown> = {};
  if (typeof bodyTekst === 'string' && bodyTekst) { try { const p = JSON.parse(bodyTekst); if (p && typeof p === 'object' && !Array.isArray(p)) body = p; } catch { /* geen JSON: lege body */ } }
  if (m === 'GET' || m === 'DELETE' || m === 'HEAD') u.searchParams.forEach((v, k) => { body[k] = v; });
  return { route: `${m} ${u.pathname}`, body };
}
