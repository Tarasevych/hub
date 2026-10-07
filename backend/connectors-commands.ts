// Opdrachten voor een agent: aanmaken volgens het beleid van de agent, goedkeuren, en wachten op het resultaat.
import { agentOnline, dispatchCommand } from './connectors-gateway';
import * as store from './connectors-store';

const TERMINAL = new Set(['succeeded', 'failed', 'rejected', 'timeout']);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Leesopdrachten (beleid `autoApprove`) gaan direct naar de agent; schrijven en uitvoeren wachten op een klik
 * van de gebruiker in de UI. De agent controleert zelf nog eens zijn mappen en toegestane commando's.
 */
export async function submitCommand(agent: store.AgentRow, userId: string, type: string, params: object) {
  if (type.startsWith('browser.')) {
    const gate = await store.browserGate(agent.id, type);
    if (gate !== 'ok') throw new Error(gate === 'inactive' ? 'BROWSER_NOT_ACTIVE' : 'BROWSER_CAPABILITY_OFF');
  }
  const auto = agent.policy.autoApprove.includes(type);
  const cmd = await store.createCommand(agent.id, userId, type, params, auto ? 'approved' : 'pending_approval');
  if (auto && !(await dispatchCommand(cmd))) {
    await store.transitionCommand(cmd.id, ['approved'], 'failed', { error: 'agent offline' }, userId);
  }
  return { command: (await store.getCommand(userId, cmd.id)) ?? cmd, auto };
}

/** Keur een wachtende opdracht goed en verstuur hem. null = niet (meer) in afwachting. */
export async function approveCommand(userId: string, id: string) {
  const approved = await store.transitionCommand(id, ['pending_approval'], 'approved', undefined, userId);
  if (!approved) return null;
  if (!agentOnline(approved.agent_id) || !(await dispatchCommand(approved))) {
    await store.transitionCommand(id, ['approved'], 'failed', { error: 'agent offline' }, userId);
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
