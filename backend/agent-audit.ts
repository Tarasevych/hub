// Eén vaste vorm voor elke wijziging van rechten van een AI-agent (wie gaf wie wat, wanneer, waarom, wat was het ervoor/erna).
// Gebruikt door uitrol-goedkeuring (rechten «updates voorbereiden»), uitrol-beleid-sync (automatisch uit het AI-beleid) en ai-beleid
// (ondertekende wijziging van het beleid). Schrijft in de bestaande hashketen (server/platform/audit), dus niet achteraf te wijzigen.
//
// action: 'agent.grant.gegeven' | 'agent.grant.ingetrokken' | 'agent.grant.termijn' | 'agent.grant.auto_gegeven' | 'agent.grant.auto_ingetrokken'
//         | 'agent.policy.gewijzigd' | 'agent.policy.geweigerd' | 'agent.policy.aangeboden'
// details: { actor, target, agent, before, after, reason, ... }
//   actor  = wie het deed ({ id, email, type: 'eigenaar' | 'systeem' })
//   target = wie/wat het trof ({ type: 'agent' | 'account' | 'agenttoken' | 'mcp-koppeling', id, label })
//   agent  = slug van de AI-agent (claude, gpt, …) of null
//   before/after = de rechten vóór en na (korte tekst of object), reason = opgegeven reden (mag leeg zijn bij een automatische actie)
import { auditToevoegen } from '../server/platform/audit';

export type AgentAuditActie =
  | 'agent.grant.gegeven' | 'agent.grant.ingetrokken' | 'agent.grant.termijn' | 'agent.grant.auto_gegeven' | 'agent.grant.auto_ingetrokken'
  | 'agent.policy.gewijzigd' | 'agent.policy.geweigerd' | 'agent.policy.aangeboden';
export type AgentAuditActor = { id: string; email?: string; type?: 'eigenaar' | 'systeem' };
export type AgentAuditInvoer = {
  ownerId: string | null; actor: AgentAuditActor; action: AgentAuditActie; result?: 'success' | 'denied' | 'failure';
  target: { type: string; id: string; label?: string }; agent: string | null; before?: unknown; after?: unknown; reason?: string; extra?: Record<string, unknown>;
  service?: string;
};

const kort = (v: unknown, n = 500): unknown => (typeof v === 'string' ? v.slice(0, n) : v ?? null);

/** Nooit stil verdwijnen, nooit de actie zelf breken (zelfde regel als auditeer() in uitrol-goedkeuring). */
export async function agentAudit(i: AgentAuditInvoer): Promise<void> {
  const details = {
    actor: { id: i.actor.id, email: i.actor.email || null, type: i.actor.type || 'eigenaar' },
    target: { type: i.target.type, id: i.target.id, label: i.target.label || null },
    agent: i.agent, before: kort(i.before), after: kort(i.after), reason: kort(i.reason, 300) ?? '', ...(i.extra || {}),
  };
  await auditToevoegen({ ownerId: i.ownerId, actorId: i.actor.type === 'systeem' ? null : i.actor.id, action: i.action, type: 'beveiliging', result: i.result || 'success', details, service: i.service || 'admin' })
    .catch((err) => { console.error(`[agent-audit] AUDIT MISLUKT (${i.action}):`, (err as Error).message); });
}
