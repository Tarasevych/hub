// Connector v2 — hulpmiddelnamen: <essentie>_<agent>_<subdomein>[_<dienst>]_tarasevych_com_<gebruiker|beheer>.
// Eén functie maakt de naam, één functie leest hem terug; de server vertrouwt alleen de catalogus (nooit wat de AI «bedoelt»).
// Puur.
import { V2_OPTIES, type Kant, type V2Optie } from './catalogus';
import { isAgentSlug, type AgentSlug } from './agenten';

export const DOMEIN_DEEL = 'tarasevych_com';
/** Grens van Claude, ChatGPT en de MCP-specificatie (SEP-986): ^[a-zA-Z0-9_-]{1,64}$ — wij gebruiken alleen a-z0-9_. */
export const MAX_NAAM = 64;
export const NAAM_RE = /^[a-z0-9_]{1,64}$/;

export function toolNaam(o: Pick<V2Optie, 'essentie' | 'sub' | 'dienst' | 'kant'>, agent: AgentSlug): string {
  return [o.essentie, agent, o.sub, ...(o.dienst ? [o.dienst] : []), DOMEIN_DEEL, o.kant].join('_');
}

// Index per agent: naam → optie (alleen actieve opties krijgen een naam die werkt).
const INDEX = new Map<AgentSlug, Map<string, V2Optie>>();
function index(agent: AgentSlug): Map<string, V2Optie> {
  let m = INDEX.get(agent);
  if (!m) {
    m = new Map();
    for (const o of V2_OPTIES) if (o.status === 'actief') m.set(toolNaam(o, agent), o);
    INDEX.set(agent, m);
  }
  return m;
}

export type Ontleed =
  | { ok: true; optie: V2Optie }
  | { ok: false; reden: 'ONBEKEND' | 'ANDERE_AGENT' | 'ANDERE_SITE'; agent?: AgentSlug; kant?: Kant };

/**
 * Naam → optie voor DEZE agent. Een geldige naam van een andere agent wordt herkend en eerlijk geweigerd (ANDERE_AGENT), zodat
 * het journaal laat zien dat een AI de koppeling van een andere AI probeerde.
 */
export function ontleed(naam: string, agent: AgentSlug): Ontleed {
  const n = String(naam || '');
  const eigen = index(agent).get(n);
  if (eigen) return { ok: true, optie: eigen };
  const kant: Kant | undefined = n.endsWith(`_${DOMEIN_DEEL}_gebruiker`) ? 'gebruiker' : n.endsWith(`_${DOMEIN_DEEL}_beheer`) ? 'beheer' : undefined;
  if (!kant) return { ok: false, reden: n.includes('_tarasevych_') || /_[a-z]+_com_(gebruiker|beheer)$/.test(n) ? 'ANDERE_SITE' : 'ONBEKEND' };
  for (const a of ['claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor'] as const) {
    if (a !== agent && isAgentSlug(a) && index(a).has(n)) return { ok: false, reden: 'ANDERE_AGENT', agent: a, kant };
  }
  return { ok: false, reden: 'ONBEKEND', kant };
}

/** Alle namen van één agent (actief en in ontwikkeling) — voor de UI en de tests. */
export const alleNamen = (agent: AgentSlug) => V2_OPTIES.map((o) => ({ key: o.key, naam: toolNaam(o, agent), status: o.status }));
