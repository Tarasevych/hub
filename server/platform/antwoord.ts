// JSON-antwoorden van de router (`json`, `error`) — ZONDER de rest van server/platform (context, auth-poort, pg), zodat routebestanden die
// geen database nodig hebben (backend/orch-routes.ts) en hun tests zonder pg kunnen draaien. router.ts exporteert ze opnieuw; voor de
// backend verandert er niets. ORCH-001 етап 3 (31.10.2026).
import type { RouterResponse } from './router';

export const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({ 'Content-Type': 'application/json; charset=utf-8' });

/** JSON-succesantwoord (zoals AppDeploy `json`). */
export function json(data: unknown, status = 200): RouterResponse {
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify(data ?? null) };
}

/** JSON-foutantwoord `{ error: message }` (zoals AppDeploy `error`). */
export function error(message: string, status = 400): RouterResponse {
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify({ error: message }) };
}
