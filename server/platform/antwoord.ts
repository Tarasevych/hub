// JSON-antwoorden van de router (`json`, `error`) — ZONDER de rest van server/platform (context, auth-poort, pg), zodat routebestanden die
// geen database nodig hebben (backend/orch-routes.ts) en hun tests zonder pg kunnen draaien. router.ts exporteert ze opnieuw; voor de
// backend verandert er niets. ORCH-001 етап 3 (31.10.2026).
import type { RouterResponse } from './router';

export const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({ 'Content-Type': 'application/json; charset=utf-8' });

/** JSON-succesantwoord (zoals AppDeploy `json`). */
export function json(data: unknown, status = 200): RouterResponse {
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify(data ?? null) };
}

export type ErrorExtra = { retryAfter?: number; maxAttempts?: number; windowSec?: number };

/** JSON-foutantwoord `{ error: message }` (zoals AppDeploy `error`), met optionele `Retry-After` en limietfeiten voor HTTP 429. */
export function error(message: string, status = 400, extra?: ErrorExtra): RouterResponse {
  const sec = extra?.retryAfter && Number.isFinite(extra.retryAfter) && extra.retryAfter > 0 ? Math.max(1, Math.ceil(extra.retryAfter)) : 0;
  if (!sec) return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify({ error: message }) };
  const payload: Record<string, unknown> = { error: message, retryAfter: sec };
  if (extra?.maxAttempts && Number.isFinite(extra.maxAttempts) && extra.maxAttempts > 0) payload.maxAttempts = Math.ceil(extra.maxAttempts);
  if (extra?.windowSec && Number.isFinite(extra.windowSec) && extra.windowSec > 0) payload.windowSec = Math.ceil(extra.windowSec);
  return { statusCode: status, headers: { ...JSON_HEADERS, 'Retry-After': String(sec) }, body: JSON.stringify(payload) };
}
