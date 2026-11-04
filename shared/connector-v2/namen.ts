// Connector v2 — hulpmiddelnamen:
//   <essentie ≤5 woorden>_<agent>_<subdomein>_<bron>_tarasevych_com_<gebruiker|beheer>
// bron = externe aanbieder als die verschilt van het subdomein, anders `site` (de site zelf).
// Als de aanbieder het subdomein al is (github), staat die één keer — nooit `github_github`.
// Boven 64 tekens verkort shared/connector-v2/afkorting.ts alleen de essentie.
// Eén functie maakt de naam, één functie leest hem terug; de server vertrouwt alleen de catalogus.
// Puur.
import { V2_OPTIES, type Kant, type V2Optie } from './catalogus';
import { isAgentSlug, type AgentSlug } from './agenten';
import { kortEssentie } from './afkorting';

export const DOMEIN_DEEL = 'tarasevych_com';
/** Grens van Claude, ChatGPT en de MCP-specificatie (SEP-986): ^[a-zA-Z0-9_-]{1,64}$ — wij gebruiken alleen a-z0-9_. */
export const MAX_NAAM = 64;
export const NAAM_RE = /^[a-z0-9_]{1,64}$/;

/** Externe aanbieder die in de naam komt, of `site`, of null als het subdomein die aanbieder al noemt. */
export function bronVan(o: Pick<V2Optie, 'sub' | 'dienst'>): string | null {
  if (o.dienst && o.dienst !== o.sub) return o.dienst;
  if (o.dienst) return null;
  return 'site';
}

export function toolNaam(o: Pick<V2Optie, 'essentie' | 'sub' | 'dienst' | 'kant'>, agent: AgentSlug): string {
  const bron = bronVan(o);
  const vast = [agent, o.sub, ...(bron ? [bron] : []), DOMEIN_DEEL, o.kant];
  const budget = MAX_NAAM - (vast.join('_').length + 1);
  return [kortEssentie(o.essentie, budget), ...vast].join('_');
}

// Index per agent: naam → optie (ook «in ontwikkeling», zodat een oude grant ze niet stil uitvoert).
const INDEX = new Map<AgentSlug, Map<string, V2Optie>>();
function index(agent: AgentSlug): Map<string, V2Optie> {
  let m = INDEX.get(agent);
  if (!m) {
    m = new Map();
    for (const o of V2_OPTIES) m.set(toolNaam(o, agent), o);
    INDEX.set(agent, m);
  }
  return m;
}

export type Ontleed =
  | { ok: true; optie: V2Optie }
  | { ok: false; reden: 'IN_ONTWIKKELING'; optie: V2Optie }
  | { ok: false; reden: 'ONBEKEND' | 'ANDERE_AGENT' | 'ANDERE_SITE'; agent?: AgentSlug; kant?: Kant };

/**
 * Naam → optie voor DEZE agent. Een geldige naam van een andere agent wordt herkend en eerlijk geweigerd (ANDERE_AGENT), zodat
 * het journaal laat zien dat een AI de koppeling van een andere AI probeerde.
 */
export function ontleed(naam: string, agent: AgentSlug): Ontleed {
  const n = String(naam || '');
  const eigen = index(agent).get(n);
  if (eigen) return eigen.status === 'actief' ? { ok: true, optie: eigen } : { ok: false, reden: 'IN_ONTWIKKELING', optie: eigen };
  const kant: Kant | undefined = n.endsWith(`_${DOMEIN_DEEL}_gebruiker`) ? 'gebruiker' : n.endsWith(`_${DOMEIN_DEEL}_beheer`) ? 'beheer' : undefined;
  if (!kant) return { ok: false, reden: n.includes('_tarasevych_') || /_[a-z]+_com_(gebruiker|beheer)$/.test(n) ? 'ANDERE_SITE' : 'ONBEKEND' };
  for (const a of ['claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor'] as const) {
    if (a !== agent && isAgentSlug(a) && index(a).has(n)) return { ok: false, reden: 'ANDERE_AGENT', agent: a, kant };
  }
  return { ok: false, reden: 'ONBEKEND', kant };
}

/** Alle namen van één agent (actief en in ontwikkeling) — voor de UI en de tests. */
export const alleNamen = (agent: AgentSlug) => V2_OPTIES.map((o) => ({ key: o.key, naam: toolNaam(o, agent), status: o.status }));

/** Naam → sleutel van de optie (ook «in ontwikkeling»). null als de naam niet van deze agent is. */
export function idVanNaam(naam: string, agent: AgentSlug): string | null {
  const p = ontleed(naam, agent);
  if (p.ok || p.reden === 'IN_ONTWIKKELING') return p.optie.key;
  return null;
}
