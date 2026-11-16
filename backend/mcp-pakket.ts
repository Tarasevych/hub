// SEC-002 (ai-mcp-08) — JSON-RPC-pakketten (batch) van MCP-clients begrensd.
// Vroeger telde de limiet van 120 aanroepen per minuut één pakket als ÉÉN verzoek, en Promise.all voerde alle berichten tegelijk uit:
// één POST van 6 MB met tienduizenden tools/call ging langs de limiet en kon de verbindingenpool van PostgreSQL, het geheugen en
// de quota bij Google/GitHub uitputten. Nu: hoogstens MAX_PAKKET berichten, elk bericht telt mee in dezelfde limiet, en de
// uitvoering loopt met kleine parallelliteit (volgorde van de antwoorden blijft die van de berichten).
import { getPool } from '../server/platform/pg';

/** Hoogstens zoveel berichten in één JSON-RPC-pakket (meer → 400, code -32600). */
export const MAX_PAKKET = 20;
/** Zoveel berichten van één pakket tegelijk. */
export const PAKKET_PARALLEL = 3;

export type PakketBesluit = { ok: true } | { ok: false; status: 400 | 429; code: number; bericht: string; retryAfter?: number };

/**
 * Telt de EXTRA berichten van een pakket bij dezelfde bucket als rateLimit (het eerste bericht is daar al geteld) en beslist.
 * Bij een databasefout: weigeren (een pakket is precies het geval waarvoor de limiet bestaat).
 */
export async function pakketToegestaan(bucket: string, aantal: number, limiet: number, vensterSec = 60): Promise<PakketBesluit> {
  if (!Number.isInteger(aantal) || aantal < 1) return { ok: false, status: 400, code: -32600, bericht: 'Invalid Request: empty batch' };
  if (aantal > MAX_PAKKET) return { ok: false, status: 400, code: -32600, bericht: `Invalid Request: batch too large (max ${MAX_PAKKET})` };
  if (aantal === 1) return { ok: true };
  const vensterMs = vensterSec * 1000;
  const start = new Date(Math.floor(Date.now() / vensterMs) * vensterMs);
  try {
    const r = await getPool().query(
      `INSERT INTO app.rate_limits (bucket, window_start, hits) VALUES ($1, $2, $3)
       ON CONFLICT (bucket, window_start) DO UPDATE SET hits = app.rate_limits.hits + $3 RETURNING hits`,
      [bucket.slice(0, 300), start, aantal - 1]);
    const hits = Number(r.rows[0]?.hits || 0);
    if (hits <= limiet) return { ok: true };
    return { ok: false, status: 429, code: -32000, bericht: 'Te veel verzoeken', retryAfter: Math.max(1, Math.ceil((start.getTime() + vensterMs - Date.now()) / 1000)) };
  } catch {
    return { ok: false, status: 429, code: -32000, bericht: 'Te veel verzoeken', retryAfter: 30 };
  }
}

/** Voert `fn` uit voor elk bericht met hoogstens `parallel` tegelijk; de uitkomsten in de volgorde van de invoer. */
export async function pakketUitvoeren<T, U>(berichten: T[], fn: (m: T) => Promise<U>, parallel = PAKKET_PARALLEL): Promise<U[]> {
  const uit = new Array<U>(berichten.length);
  let volgende = 0;
  const werker = async () => { for (;;) { const i = volgende++; if (i >= berichten.length) return; uit[i] = await fn(berichten[i]); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, berichten.length)) }, werker));
  return uit;
}
