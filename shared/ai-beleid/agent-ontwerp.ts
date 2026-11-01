// Zuivere berekening van AI-beleidsoperaties (Op[]) voor één agent op #agent/<slug> (UX-AI-VAULT-001).
// Vertaalt de gekozen connector-v2-sleutels naar de exacte mogelijkheden (capabilities) in shared/ai-beleid/catalogus.ts,
// zodat de eigenaar op mcp.tarasevych.com/agenten#agent/<slug> direct ter plaatse met Passkey kan ondertekenen
// zonder blinde omleiding naar admin.tarasevych.com/ai.
import type { AgentSlug } from '../connector-v2/agenten';
import { V2_OPTIES, v2Optie, type Kant } from '../connector-v2/catalogus';
import { capabilityForTool, isOwnerOnly } from './catalogus';
import type { Op, Policy } from './model';
import { effectiveMode } from './tijd';

/** Welke beleidsmogelijkheden horen bij de gekozen connector-v2-sleutels (zonder v2_whoami en zonder ownerOnly). */
export function capabilitiesVoorSleutels(sleutels: readonly string[]): string[] {
  const uit = new Set<string>();
  for (const s of sleutels) {
    const o = v2Optie(s);
    if (!o?.intern || o.intern === 'v2_whoami') continue;
    const cap = capabilityForTool(o.intern);
    if (cap && !isOwnerOnly(cap)) uit.add(cap);
  }
  return [...uit];
}

/** Alle beleidsmogelijkheden van de actieve connector-v2-opties voor de opgegeven kanten. */
export function capabilitiesVoorKanten(kanten: readonly Kant[]): string[] {
  const kSet = new Set<Kant>(kanten);
  return capabilitiesVoorSleutels(
    V2_OPTIES.filter((o) => o.status === 'actief' && kSet.has(o.kant)).map((o) => o.key),
  );
}

/**
 * Bouwt de minimale lijst beleidsoperaties (Op[]) om `slug` in `beleid` toe te voegen / in te schakelen
 * en alle mogelijkheden die voor `sleutels` nodig zijn toe te staan (`always`).
 * Geeft `[]` terug wanneer het huidige ondertekende beleid niets blokkeert voor deze keuze.
 */
export function bouwAgentBeleidOps(
  beleid: Policy,
  slug: AgentSlug,
  naam: string,
  sleutels: readonly string[],
  opties: { bestaandeAgentId?: string | null; nu?: number } = {},
): Op[] {
  const nu = opties.nu ?? Date.now();
  const doelId = opties.bestaandeAgentId && beleid.agents[opties.bestaandeAgentId] ? opties.bestaandeAgentId : slug;
  const bestaand = beleid.agents[doelId];
  const ops: Op[] = [];

  if (!bestaand) {
    ops.push({ op: 'agent_add', agent: doelId, name: naam, spec: { type: 'ask' } });
  } else if (!bestaand.enabled) {
    ops.push({ op: 'agent_enable', agent: doelId, enabled: true });
  }

  const caps = capabilitiesVoorSleutels(sleutels);
  const teOpenen: string[] = [];
  for (const cap of caps) {
    if (!bestaand) {
      teOpenen.push(cap);
      continue;
    }
    const ruw = Object.prototype.hasOwnProperty.call(bestaand.capabilities, cap)
      ? bestaand.capabilities[cap]!
      : bestaand.defaultMode;
    const looptOpTijd = ruw.kind === 'timed' && nu < ruw.expiresAt;
    const eff = effectiveMode(ruw, nu);
    if (!looptOpTijd && eff.kind !== 'always') {
      teOpenen.push(cap);
    }
  }

  if (teOpenen.length > 0) {
    ops.push({ op: 'grant', agent: doelId, capabilities: teOpenen, spec: { type: 'always' } });
  }
  return ops;
}
