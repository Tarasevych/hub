// SEC-002 (toets-g10d №5, 12.11.2026): welke fouttekst van een MCP-hulpmiddel de server mag VERLATEN (/api/mcp/call, /api/mcp/agent).
//
// De twee routes gaven bij een fout de volle err.message terug — bij een fout van het bestandssysteem of PostgreSQL dus een
// absoluut pad («ENOENT … realpath '/srv/mijn-ruimte/current'») of een stuk SQL, aan elke AI of elk script met een token.
// Regel (zelfde als backend/cloud-vnext-fout.ts): een eigen vaste code («GEEN_VOORBEREIDER_GRANT», ook met uitleg erachter:
// «ALLEEN_EIGENAAR_MET_PASSKEY: …») mag naar buiten; een systeemfout (heeft een eigenschap `code`: errno of PostgreSQL-SQLSTATE)
// of vrije tekst wordt TOOL_FAILED met een kort incidentnummer; de volle tekst staat alleen in het serverlogboek.
import { randomBytes } from 'node:crypto';

const EIGEN_CODE = /^[A-Z][A-Z0-9_]{2,60}(?::[^/\\]*)?$/s;

export function veiligeToolFout(err: unknown, bron: string): { error: string; incident?: string } {
  const fout = err as { message?: unknown; code?: unknown } | null;
  const tekst = err instanceof Error ? String(fout?.message || '') : '';
  if (tekst && fout?.code === undefined && EIGEN_CODE.test(tekst)) return { error: tekst.slice(0, 500) };
  const incident = randomBytes(4).toString('hex');
  console.error(`[${bron}] incident ${incident}:`, (tekst || String(err)).slice(0, 2000));
  return { error: 'TOOL_FAILED', incident };
}
