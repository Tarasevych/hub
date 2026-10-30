// De MCP-klant zoals de rest van de site hem gebruikt: één sessie openen, iets doen, netjes sluiten, en de
// feiten opschrijven. Hier komen de drie delen samen:
//   shared/mcp-klant-model.ts   het zuivere protocolmodel (versies, grenzen, ontleden, markeren)
//   backend/mcp-klant/vervoer.ts  de twee vervoerwijzen door de veilige fetcher
//   backend/mcp-klant-opslag.ts    het register per gebruiker (migratie 0078)
//
// Elke uitgaande poging komt in het journaal (één regel per poging, met de stabiele code en zonder ooit het
// token). Elk resultaat van een vreemde server is onbetrouwbare inhoud.
import { auditToevoegen } from '../../server/platform/audit';
import { readOwnerVaultPlaintext } from '../api-platform-kluis';
import { MCP_FOUT, MCP_GRENZEN, zonderGeheim, type ExterneTool } from '../../shared/mcp-klant-model';
import * as store from '../mcp-klant-opslag';
import { McpFout, McpSessie, keurAdres, openSessie, toegestaneHosts } from './klant';

export * from './klant';
export type { HttpHaler } from './vervoer';

const journaal = (userId: string, actie: string, resultaat: 'success' | 'denied' | 'error', details: Record<string, unknown>) =>
  auditToevoegen({ ownerId: userId, action: actie, type: 'beveiliging', result: resultaat, details }).catch(() => undefined);

/** Het token uit de kluis. Mislukt het, dan gaan we ZONDER token niet verder: dat zou een stille 401 geven. */
async function tokenVan(userId: string, rij: store.VerbindingRij): Promise<string | undefined> {
  if (rij.authWijze !== 'bearer') return undefined;
  if (!rij.sleutelNaam) throw new McpFout(MCP_FOUT.geenToegang, 'sleutel-ontbreekt');
  const waarde = await readOwnerVaultPlaintext(userId, rij.sleutelNaam).catch(() => '');
  if (!waarde) throw new McpFout(MCP_FOUT.geenToegang, 'sleutel-onleesbaar');
  return waarde;
}

export type SessieHaak<T> = (sessie: McpSessie) => Promise<T>;

/**
 * Eén sessie met een vreemde server, van begin tot eind. De aanroeper krijgt de sessie en hoeft niets te
 * sluiten: dat gebeurt hier altijd, ook bij een fout. De stand van de verbinding wordt bijgewerkt uit feiten.
 */
export async function metSessie<T>(userId: string, rij: store.VerbindingRij, haak: SessieHaak<T>, opties: { haler?: import('./vervoer').HttpHaler } = {}): Promise<T> {
  if (!rij.actief) throw new McpFout(MCP_FOUT.uit);
  if (rij.authWijze === 'oauth') throw new McpFout(MCP_FOUT.oauthNietKlaar);
  const token = await tokenVan(userId, rij);
  await store.bezig(userId, rij.id);
  let sessie: McpSessie | null = null;
  try {
    sessie = await openSessie({
      adres: rij.adres, token, haler: opties.haler,
      frequentieSleutel: `${userId}|${rij.id}`,
    });
    await store.gelukt(userId, rij.id, {
      vervoer: sessie.vervoerSoort, protocolVersie: sessie.protocol, serverNaam: sessie.server.titel || sessie.server.naam,
      serverVersie: sessie.server.versie, mogelijkheden: sessie.mogelijkheden, instructies: sessie.instructies,
    });
    const uitslag = await haak(sessie);
    return uitslag;
  } catch (err) {
    const fout = err instanceof McpFout ? err : new McpFout(MCP_FOUT.onbekend);
    await store.mislukt(userId, rij.id, fout.code);
    await journaal(userId, 'externe-mcp.poging', 'error', { verbinding: rij.id, host: hostVan(rij.adres), code: fout.code, detail: zonderGeheim(fout.detail, token ? [token] : []).slice(0, 120) });
    throw fout;
  } finally {
    await sessie?.sluit();
  }
}

const hostVan = (adres: string) => { try { return new URL(adres).hostname; } catch { return ''; } };

export type TestUitslag = {
  ok: boolean; fout: string;
  vervoer: string; protocol: string; server: { naam: string; titel: string; versie: string };
  mogelijkheden: Record<string, unknown>; instructies: string;
  tools: ExterneTool[]; afgekapt: boolean;
  resources: number; prompts: number; lijstGewijzigd: boolean; sessieId: boolean;
};

/**
 * «Перевірити зʼєднання»: echt verbinden, echt `tools/list` doen, en het geheugen vernieuwen. Dit is de ENIGE
 * weg waarop een verbinding de stand «klaar» krijgt — er is geen knop die alleen maar groen wordt.
 */
export async function verbindingTesten(userId: string, id: string, opties: { haler?: import('./vervoer').HttpHaler } = {}): Promise<TestUitslag> {
  const rij = await store.een(userId, id);
  if (!rij) throw new McpFout(MCP_FOUT.onbekendeVerbinding);
  const leeg: TestUitslag = {
    ok: false, fout: '', vervoer: '', protocol: '', server: { naam: '', titel: '', versie: '' }, mogelijkheden: {},
    instructies: '', tools: [], afgekapt: false, resources: 0, prompts: 0, lijstGewijzigd: false, sessieId: false,
  };
  try {
    return await metSessie(userId, rij, async (sessie) => {
      const { tools, afgekapt } = await sessie.tools();
      await store.toolsVervangen(userId, rij.id, tools);
      // resources en prompts alleen als de server zegt dat hij ze heeft (capability-onderhandeling).
      const resources = await sessie.resources().catch(() => []);
      const prompts = await sessie.prompts().catch(() => []);
      await journaal(userId, 'externe-mcp.verbonden', 'success', {
        verbinding: rij.id, host: hostVan(rij.adres), vervoer: sessie.vervoerSoort, protocol: sessie.protocol, hulpmiddelen: tools.length,
      });
      return {
        ...leeg, ok: true, vervoer: sessie.vervoerSoort, protocol: sessie.protocol, server: sessie.server,
        mogelijkheden: sessie.mogelijkheden, instructies: sessie.instructies, tools, afgekapt,
        resources: resources.length, prompts: prompts.length, lijstGewijzigd: sessie.lijstGewijzigd, sessieId: Boolean(sessie.sessieId),
      };
    }, opties);
  } catch (err) {
    return { ...leeg, fout: err instanceof McpFout ? err.code : MCP_FOUT.onbekend };
  }
}

export type AanroepUitslag = { ok: boolean; fout: string; tekst: string; soorten: string[]; host: string; server: string };

/**
 * Eén vreemd hulpmiddel aanroepen. De AANROEPER (backend/connectors-hulpmiddelen.ts) heeft dan al gedaan:
 * het recht, de ruimte, de bevestiging van de eigenaar bij wijzigen, en het journaal van de AI-kant.
 * Hier: de verbinding moet actief en geslaagd zijn, het hulpmiddel moet AAN staan, en het resultaat is DATA.
 */
export async function toolAanroepen(userId: string, verbindingId: string, toolNaam: string, argumenten: Record<string, unknown>, opties: { haler?: import('./vervoer').HttpHaler } = {}): Promise<AanroepUitslag> {
  const rij = await store.een(userId, verbindingId);
  if (!rij) return { ok: false, fout: MCP_FOUT.onbekendeVerbinding, tekst: '', soorten: [], host: '', server: '' };
  const tool = await store.actieveTool(userId, verbindingId, toolNaam);
  if (!tool) return { ok: false, fout: MCP_FOUT.geenTools, tekst: '', soorten: [], host: hostVan(rij.adres), server: rij.serverNaam };
  if (!tool.aan) return { ok: false, fout: MCP_FOUT.toolUit, tekst: '', soorten: [], host: hostVan(rij.adres), server: rij.serverNaam };
  try {
    const uitslag = await metSessie(userId, rij, async (sessie) => sessie.roepTool(toolNaam, argumenten), opties);
    await journaal(userId, 'externe-mcp.aanroep', uitslag.fout ? 'error' : 'success', {
      verbinding: rij.id, host: hostVan(rij.adres), hulpmiddel: toolNaam, tekens: uitslag.tekst.length, serverFout: uitslag.fout,
    });
    return { ok: !uitslag.fout, fout: uitslag.fout ? MCP_FOUT.serverFout : '', tekst: uitslag.tekst, soorten: uitslag.soorten, host: hostVan(rij.adres), server: rij.serverNaam };
  } catch (err) {
    const code = err instanceof McpFout ? err.code : MCP_FOUT.onbekend;
    return { ok: false, fout: code, tekst: '', soorten: [], host: hostVan(rij.adres), server: rij.serverNaam };
  }
}

/** Wat de pagina en de diagnose moeten weten over wat deze klant vandaag werkelijk kan. */
export const externeMcpMogelijkheden = Object.freeze({
  vervoer: { streamable: true, sse: true, stdio: false, stdioReden: 'STDIO_IS_LOKAAL_PROCES_NIET_VOOR_EEN_SERVER' },
  methoden: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list'],
  meldingen: ['notifications/tools/list_changed', 'notifications/resources/list_changed', 'notifications/prompts/list_changed'],
  auth: { bearer: true, oauth: false, oauthOntbreekt: true },
  grenzen: MCP_GRENZEN,
  witteLijstBron: 'mcp-rechten.json → externeMcpHosts (of EXTERNE_MCP_HOSTS)',
});

export { keurAdres, toegestaneHosts, store };
