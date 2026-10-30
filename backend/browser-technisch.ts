// Technische browserhulpmiddelen: de serverkant van shared/browser-technisch-slot.ts (20.10.2026).
//
// Deze module haalt de feiten op (gekoppeld slot, lopende ontgrendeling, beleid, gemeld tabprofiel en debuggerrecht), laat de ZES
// voorwaarden door de pure poort beslissen en schrijft elke technische browseractie in het beheerjournaal. Ze verruimt niets: de
// ontgrendeling, het beleid en de extensie zelf blijven de laatste schakels — dit is de bovenste, zodat een AI een uitlegbare
// weigering krijgt in plaats van een opdracht die blijft wachten en pas in de extensie stukloopt.
import { listAgents, type AgentRow } from './connectors-opslag';
import { capabilityFor, commandUrls } from './ai-toestemmingen';
import { actieveOntgrendeling, gemeldeTab } from './extensie-ontgrendeling';
import { capsBinnenBeleid, leesBeleid, ruimteAan } from './extensie-beleid';
import { huidigeNamens, huidigeRuimte } from './mcp-namens';
import { aiDienstStand } from './ai-ruimte-poort';
import { journaalSchrijf } from './beheer-journaal';
import { ruimteOf } from '../shared/ai-ruimte';
import { isBrowserCap, type BrowserCap } from '../shared/extensie-ontgrendeling';
import {
  hostVanAdres, technischeBrowserPoort, verduidelijkExtensieFout,
  type TechnischeBrowserCode, type TechnischeBrowserUitslag,
} from '../shared/browser-technisch-slot';

/** Actie in het beheerjournaal (shared/beheer-journaal.ts → categorie «tech»). */
export const JOURNAAL_ACTIE = 'owner.tech.browser';

/** Browseragenten van dit account in het slot 'technisch'. */
export const technischeSloten = async (userId: string): Promise<AgentRow[]> =>
  (await listAgents(userId).catch(() => [] as AgentRow[])).filter((a) => a.platform === 'browser' && ruimteOf(a.ruimte) === 'technisch');

export type Uitslag = TechnischeBrowserUitslag;

/**
 * De poort vóór elke browseropdracht van een TECHNISCHE verbinding. `agentId` mag null zijn: dan wordt het eerste technische slot
 * gebruikt om de oorzaak te kunnen noemen (ontbreekt het, dan is dat zelf de weigering).
 */
export async function poort(userId: string, agentId: string | null, type: string, params: unknown): Promise<Uitslag> {
  // Voorwaarde 1 (RUIMTE) is sinds 20.10.2026 ondergeschikt aan de stand van de dienst «ai» (app.ruimte_dienst_stand,
  // backend/ai-ruimte-poort.ts → aiPoortNu): staat die op 'uit' of 'bevroren', dan bestaat de technische ruimte voor deze
  // mens niet en valt de eerste voorwaarde dus al om. De andere vijf worden hierdoor NIET losser — er komt alleen een
  // voorwaarde bij, en de weigering blijft dezelfde uitlegbare code.
  const ruimte = huidigeRuimte() === 'technisch' && (await aiDienstStand(userId)).aan ? 'technisch' : 'prive';
  const sloten = ruimte === 'technisch' ? await technischeSloten(userId) : [];
  const agent = agentId ? sloten.find((a) => a.id === agentId) ?? null : sloten[0] ?? null;
  let rij = null;
  let caps: BrowserCap[] = [];
  let domeinen: string[] = [];
  let beleidAan = true;
  if (agent) {
    try {
      rij = await actieveOntgrendeling(agent.id, userId);
      const beleid = await leesBeleid(userId);
      beleidAan = ruimteAan(beleid, 'technisch');
      if (rij) {
        caps = capsBinnenBeleid(beleid, ruimteOf(rij.ruimte), rij.caps.filter(isBrowserCap));
        domeinen = [...rij.domeinen];
      }
    } catch { rij = null; }     // DB-fout: behandelen als «vergrendeld» (veilige richting)
  }
  const gemeld = agent ? gemeldeTab(agent.id) : null;
  return technischeBrowserPoort({
    ruimte,
    slot: sloten.length > 0,
    beleidAan,
    ontgrendeling: rij ? { ruimte: ruimteOf(rij.ruimte), caps, domeinen } : null,
    type,
    cap: capabilityFor(type) as BrowserCap | null,
    urls: commandUrls(params),
    tabProfiel: gemeld?.profielTab ?? null,
    diagRecht: gemeld?.diagRecht ?? null,
  });
}

/** Alleen de ZES voorwaarden nalopen zonder DB (voor de test en voor hergebruik). */
export { technischeBrowserPoort, verduidelijkExtensieFout } from '../shared/browser-technisch-slot';

type JournaalInvoer = {
  userId: string; type: string; params: unknown; agent: AgentRow | null;
  resultaat: 'success' | 'denied' | 'failure'; code?: TechnischeBrowserCode | null; fout?: string | null;
};
/**
 * Elke technische browseractie in het beheerjournaal: dienst, actie, host, tabblad en de AI-agent — net als de andere technische
 * acties (owner.tech.*). Gooit nooit: journaalSchrijf vangt zijn eigen fouten.
 */
export async function journaal(inv: JournaalInvoer): Promise<void> {
  const namens = huidigeNamens();
  const host = (commandUrls(inv.params).map(hostVanAdres).find(Boolean)) ?? null;
  await journaalSchrijf({
    actie: JOURNAAL_ACTIE,
    actor: inv.userId,
    eigenaar: inv.userId,
    resultaat: inv.resultaat,
    ...(namens?.agent ? { agent: namens.agent } : {}),
    ...(inv.code ? { reden: inv.code } : {}),
    doel: { soort: 'apparaat', ...(inv.agent ? { id: inv.agent.id, naam: inv.agent.name } : {}) },
    details: {
      dienst: host ?? 'actief tabblad',
      ruimte: 'technisch',
      slot: 'technisch',
      actie: inv.type,
      ...(host ? { host } : {}),
      tabblad: inv.agent ? (gemeldeTab(inv.agent.id)?.profielTab ?? 'onbekend') : 'onbekend',
      ...(namens?.client ? { client: namens.client.slice(0, 80) } : {}),
      ...(namens?.grantId ? { koppeling: String(namens.grantId).slice(0, 80) } : {}),
      ...(inv.fout ? { melding: String(inv.fout).slice(0, 200) } : {}),
    },
    service: 'mcp',
  });
}
