// Opdrachten voor een agent: aanmaken volgens de toestemmingen (grants) van de gebruiker, goedkeuren, en wachten op het resultaat.
import { agentOnline, dispatchCommand } from './connectors-gateway';
import * as store from './connectors-store';
import * as grants from './ai-grants';

const TERMINAL = new Set(['succeeded', 'failed', 'rejected', 'timeout']);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CommandRefused extends Error {
  constructor(public code: string) { super(code); }
}

/**
 * Een opdracht aanmaken:
 *   - zonder geldige grant (of buiten de domeinen, of geblokkeerd, of te veel opdrachten) → CommandRefused (geen rij, niets verstuurd);
 *   - niet-destructief met grant → direct (tenzij de gebruiker voor het hulpmiddel 'vragen' koos: forceApproval);
 *   - destructief → requireFreshApproval (wachten op een klik binnen GRANT_LIMITS.freshApprovalMinutes), behalve met een geldige
 *     'altijd'-grant die de eigenaar met step-up heeft aangezet. Er is GEEN impliciete 'altijd' meer (audit H2: forceAuto is weg).
 * De agent controleert daarna zelf nog eens zijn mappen, toegestane commando's en de handtekening van de opdracht.
 */
export async function submitCommand(agent: store.AgentRow, userId: string, type: string, params: object, opts: { forceApproval?: boolean } = {}) {
  if (agent.user_id && agent.user_id !== userId) throw new CommandRefused('AGENT_NOT_FOUND');
  if (type.startsWith('browser.') && !(await store.browserActive(agent.id))) throw new CommandRefused('BROWSER_NOT_ACTIVE');
  const check = await grants.checkCommand({ id: agent.id, user_id: userId }, type, params, 'create');
  if (!check.ok) throw new CommandRefused(check.code);
  const auto = !opts.forceApproval && !check.needsFreshApproval;
  const cmd = await store.createCommand(agent.id, userId, type, params, auto ? 'approved' : 'pending_approval', check.grantId);
  if (auto && !(await dispatchCommand(cmd))) {
    await store.transitionCommand(cmd.id, ['approved'], 'failed', { error: 'agent offline or not allowed' }, userId);
  }
  return { command: (await store.getCommand(userId, cmd.id)) ?? cmd, auto, freshApproval: !auto };
}

/** Verse goedkeuring: een wachtende opdracht kan alleen binnen een paar minuten na aanmaken worden goedgekeurd. */
export const requireFreshApproval = (userId: string) => store.expireStalePending(userId, grants.GRANT_LIMITS.freshApprovalMinutes);

/** Keur een wachtende opdracht goed en verstuur hem. null = niet (meer) in afwachting (of te oud). */
export async function approveCommand(userId: string, id: string) {
  await requireFreshApproval(userId);
  const approved = await store.transitionCommand(id, ['pending_approval'], 'approved', undefined, userId);
  if (!approved) return null;
  if (!agentOnline(approved.agent_id) || !(await dispatchCommand(approved))) {
    await store.transitionCommand(id, ['approved'], 'failed', { error: 'agent offline or not allowed' }, userId);
  }
  return store.getCommand(userId, id);
}

export const rejectCommand = (userId: string, id: string) =>
  store.transitionCommand(id, ['pending_approval'], 'rejected', undefined, userId);

/** Wacht (polling) tot de opdracht klaar is, of geef na `waitMs` de huidige stand terug. */
export async function waitForCommand(userId: string, id: string, waitMs: number) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const cmd = await store.getCommand(userId, id);
    if (!cmd || TERMINAL.has(cmd.status) || Date.now() >= deadline) return cmd;
    await sleep(500);
  }
}
