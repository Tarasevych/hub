// Alles wat de gebruiker op de site doet, als meldingen: het auditlogboek (app.audit) omgezet naar gebeurtenissen met een sectie en dienst.
// "source" heeft de vorm "sectie[:dienst]" (mail:google, github, agent, mcp, identity, ...), zodat het meldingencentrum het juiste gekleurde
// pictogram en het logo van de dienst kan tonen. Ruis (elke leesactie, sessierotatie, menuvoorkeuren) komt er bewust niet in.
export type SiteEvent = { id: string; source: string; platform: string; kind: 'site'; type: string; subject: string; status: 'succeeded' | 'failed'; createdAt: number; finishedAt: number };

const SKIP = /^(owner\.notifications\.|owner\.session\.(rotated|refresh)|owner\.ui\.|owner\.tab\.|owner\.mail\.(item\.|send\.prepared)|owner\.admin\.(audit\.viewed|diagnostics)|owner\.redirect\.|owner\.auth\.transaction\.(created|started)|owner\.browser\.grant\.(used|cookie))/;
const RULES: Array<[RegExp, string]> = [
  [/^owner\.mail\./, 'mail:google'], [/^owner\.cloud\./, 'cloud:google'], [/^owner\.calendar\./, 'calendar:google'], [/^owner\.github\./, 'github'],
  [/^owner\.ai\.|^owner\.chat\./, 'ai:anthropic'], [/^owner\.(agent|agents)\./, 'agent'], [/^owner\.mcp\./, 'claude'], [/^owner\.browser\./, 'browser'],
  [/^owner\.api\.|^owner\.vault\./, 'api'], [/^owner\.admin\./, 'admin'], [/^owner\.(identity|privacy|profile|session|step_up|auth|access)\./, 'identity'], [/^account\./, 'identity'],
];
/** Sectie (en dienst) voor een auditactie, of null als de actie geen melding verdient. */
export function sourceOfAudit(action: string): string | null {
  if (SKIP.test(action)) return null;
  for (const [re, source] of RULES) if (re.test(action)) return source;
  return action.startsWith('owner.') ? 'site' : null;
}
const FAIL = /fail|denied|error|reject|invalid|blocked|conflict/i;
export function siteEventsFromAudit(rows: Array<{ id: string; action: string; result: string; createdAt: number; details?: Record<string, unknown> }>): SiteEvent[] {
  const out: SiteEvent[] = [];
  for (const r of rows) {
    const source = sourceOfAudit(r.action);
    if (!source) continue;
    const subject = typeof r.details?.provider === 'string' ? r.details.provider.slice(0, 40) : '';
    out.push({ id: `audit:${r.id}`, source, platform: '', kind: 'site', type: r.action, subject, status: FAIL.test(r.result) ? 'failed' : 'succeeded', createdAt: r.createdAt, finishedAt: r.createdAt });
  }
  return out;
}
