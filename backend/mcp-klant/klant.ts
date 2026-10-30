// De MCP-KLANT zelf: de levensloop van één sessie met een vreemde MCP-server, boven op het vervoer.
//
//   initialize  → versie onderhandelen (lifecycle §Version Negotiation) → notifications/initialized
//   werken      → tools/list, tools/call, resources/list, resources/read, prompts/list
//   sluiten     → de sessie netjes beëindigen (DELETE bij Streamable HTTP, stroom sluiten bij het oude vervoer)
//
// Poorten die hier staan en nergens anders overgeslagen worden:
//   1. het adres: alleen https, geen geheim in de URL (shared/mcp-klant-model.ts → veiligMcpAdres),
//   2. de HOST moet op de witte lijst van de EIGENAAR staan (mcp-rechten.json → externeMcpHosts, of
//      EXTERNE_MCP_HOSTS); een lege lijst betekent: geen enkele vreemde server mag,
//   3. een frequentiegrens per verbinding (MCP_GRENZEN.perMinuut),
//   4. tijd en bytes: de grenzen van backend/veilige-fetch.ts.
//
// Alles wat terugkomt is DATA: de namen, titels, beschrijvingen en schema's van vreemde hulpmiddelen worden
// opgeschoond en gemarkeerd (externeBeschrijving), de resultaten gaan door untrusted() van connectors-hulpmiddelen.ts.
import { readFileSync, statSync } from 'node:fs';
import {
  MCP_FOUT, MCP_GRENZEN, binnenFrequentie, hostToegestaan, initializeParams, isLijstGewijzigd, onderhandelProtocol,
  ontleedPrompts, ontleedResourceInhoud, ontleedResources, ontleedToolResultaat, ontleedToolsLijst,
  rpcMelding, rpcVerzoek, schoonExterneTekst, schoonHostLijst, veiligMcpAdres,
  type ExterneTool, type RpcMelding,
} from '../../shared/mcp-klant-model';
import { McpFout, kiesVervoer, type HttpHaler, type Vervoer } from './vervoer';

// ---------------------------------------------------------------- witte lijst van de eigenaar

const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
export const EXTERNE_HOSTS_SLEUTEL = 'externeMcpHosts';
let hostCache: { sleutel: string; lijst: string[] } | null = null;
/**
 * De hosts die de eigenaar zelf toestaat. Bron: het root-bestand mcp-rechten.json (sleutel `externeMcpHosts`)
 * en/of de omgevingsvariabele EXTERNE_MCP_HOSTS. Alleen lezen; de site kan deze lijst niet wijzigen — dat is
 * precies de bedoeling (BYOS: uitgaande verbindingen alleen waar de eigenaar ze bewust toestond).
 */
export function toegestaneHosts(): string[] {
  const uitOmgeving = schoonHostLijst(process.env.EXTERNE_MCP_HOSTS || '');
  let uitBestand: string[] = [];
  try {
    const st = statSync(rechtenPad());
    const sleutel = `${st.mtimeMs}:${st.size}`;
    if (hostCache?.sleutel === sleutel) uitBestand = hostCache.lijst;
    else {
      const data = JSON.parse(readFileSync(rechtenPad(), 'utf8'));
      uitBestand = schoonHostLijst(data?.[EXTERNE_HOSTS_SLEUTEL]);
      hostCache = { sleutel, lijst: uitBestand };
    }
  } catch { uitBestand = []; }
  return [...new Set([...uitBestand, ...uitOmgeving])].slice(0, 50);
}

/** Alleen voor de eenheidstest: de gelezen lijst vergeten (het bestand verandert tussen de gevallen). */
export const vergeetHostCache = () => { hostCache = null; };

/** Het adres controleren: vorm (https, geen geheim) én de witte lijst van de eigenaar. */
export function keurAdres(adres: unknown, hosts: readonly string[] = toegestaneHosts()): { adres: string; fout: string; host: string } {
  const { adres: schoon, fout } = veiligMcpAdres(adres);
  if (fout) return { adres: '', fout, host: '' };
  const host = new URL(schoon).hostname.toLowerCase();
  if (!hostToegestaan(host, hosts)) return { adres: '', fout: MCP_FOUT.hostNietToegestaan, host };
  return { adres: schoon, fout: '', host };
}

// ---------------------------------------------------------------- frequentie per verbinding

const stempels = new Map<string, number[]>();
/** Geeft false als deze verbinding haar minuut vol heeft. In het geheugen: een grens, geen boekhouding. */
export function magAanroepen(sleutel: string, nu = Date.now(), perMinuut: number = MCP_GRENZEN.perMinuut): boolean {
  const uitslag = binnenFrequentie(stempels.get(sleutel) ?? [], nu, perMinuut);
  stempels.set(sleutel, uitslag.stempels);
  if (stempels.size > 500) for (const [k, v] of stempels) if (!v.some((t) => nu - t < 60_000)) stempels.delete(k);
  return uitslag.mag;
}
export const vergeetFrequentie = () => stempels.clear();

// ---------------------------------------------------------------- de sessie

export type ServerInfo = { naam: string; titel: string; versie: string };
export type SessieOpties = {
  adres: string;
  token?: string;
  haler?: HttpHaler;
  /** Sleutel voor de frequentiegrens (gebruiker + verbinding). Leeg = geen grens (alleen in tests). */
  frequentieSleutel?: string;
  /** Witte lijst; standaard die van de eigenaar. */
  hosts?: readonly string[];
};

export class McpSessie {
  readonly meldingen: RpcMelding[] = [];
  lijstGewijzigd = false;
  protocol = '';
  server: ServerInfo = { naam: '', titel: '', versie: '' };
  mogelijkheden: Record<string, unknown> = {};
  instructies = '';
  private volgnummer = 1;
  constructor(private vervoer: Vervoer, private sleutel: string) {}

  get vervoerSoort() { return this.vervoer.soort; }
  get sessieId() { return this.vervoer.sessieId; }

  private async roepRpc(methode: string, params?: unknown): Promise<unknown> {
    if (this.sleutel && !magAanroepen(this.sleutel)) throw new McpFout(MCP_FOUT.frequentie);
    this.volgnummer += 1;
    const antwoord = await this.vervoer.verstuur(rpcVerzoek(this.volgnummer, methode, params));
    if (antwoord.error) {
      // De tekst van de vreemde server is DATA: we nemen alleen een afgekapte, opgeschoonde vorm mee.
      throw new McpFout(MCP_FOUT.serverFout, schoonExterneTekst(antwoord.error.message, 200));
    }
    return antwoord.result;
  }

  /** `tools/list`, met paginering zolang de server een cursor geeft en we onder de grens blijven. */
  async tools(): Promise<{ tools: ExterneTool[]; afgekapt: boolean }> {
    if (this.mogelijkheden.tools === undefined) return { tools: [], afgekapt: false };
    const alles: ExterneTool[] = [];
    let cursor = '';
    let afgekapt = false;
    for (let ronde = 0; ronde < 10; ronde += 1) {
      const result = await this.roepRpc('tools/list', cursor ? { cursor } : {});
      const stuk = ontleedToolsLijst(result);
      for (const tool of stuk.tools) {
        if (alles.length >= MCP_GRENZEN.maxTools) { afgekapt = true; break; }
        if (!alles.some((x) => x.naam === tool.naam)) alles.push(tool);
      }
      afgekapt = afgekapt || stuk.afgekapt;
      cursor = stuk.cursor;
      if (!cursor || afgekapt) break;
    }
    return { tools: alles, afgekapt };
  }

  async roepTool(naam: string, argumenten: Record<string, unknown>): Promise<{ tekst: string; fout: boolean; soorten: string[] }> {
    const result = await this.roepRpc('tools/call', { name: naam, arguments: argumenten ?? {} });
    return ontleedToolResultaat(result);
  }

  async resources() {
    if (this.mogelijkheden.resources === undefined) return [];
    return ontleedResources(await this.roepRpc('resources/list', {}));
  }

  async leesResource(uri: string) {
    if (this.mogelijkheden.resources === undefined) return [];
    return ontleedResourceInhoud(await this.roepRpc('resources/read', { uri: String(uri).slice(0, 2000) }));
  }

  async prompts() {
    if (this.mogelijkheden.prompts === undefined) return [];
    return ontleedPrompts(await this.roepRpc('prompts/list', {}));
  }

  /** Netjes sluiten. Mag nooit een fout opleveren voor de aanroeper: het werk was al gedaan. */
  async sluit(): Promise<void> { await this.vervoer.sluit().catch(() => undefined); }

  /** Interne haken voor openSessie. */
  _vulUitInit(result: unknown, gevraagd: string): void {
    const o = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
    const { versie, fout } = onderhandelProtocol(gevraagd, o.protocolVersion);
    if (fout) throw new McpFout(fout, schoonExterneTekst(o.protocolVersion, 40));
    this.protocol = versie;
    this.vervoer.protocol = versie;
    const info = (o.serverInfo && typeof o.serverInfo === 'object' ? o.serverInfo : {}) as Record<string, unknown>;
    this.server = {
      naam: schoonExterneTekst(info.name, 120), titel: schoonExterneTekst(info.title, 120),
      versie: schoonExterneTekst(info.version, 60),
    };
    this.mogelijkheden = (o.capabilities && typeof o.capabilities === 'object' && !Array.isArray(o.capabilities)
      ? o.capabilities : {}) as Record<string, unknown>;
    this.instructies = schoonExterneTekst(o.instructions, 2000);
  }

  async _meldGereed(): Promise<void> { await this.vervoer.meld(rpcMelding('notifications/initialized')); }
}

/**
 * Een sessie openen: adres keuren, vervoer kiezen (modern of oud), versie onderhandelen en
 * `notifications/initialized` sturen. Daarna is de sessie bruikbaar.
 *
 * De aanroeper MOET `sluit()` doen (ook bij een fout onderweg): anders blijft bij het oude vervoer een
 * SSE-stroom open staan.
 */
export async function openSessie(opties: SessieOpties): Promise<McpSessie> {
  const { adres, fout } = keurAdres(opties.adres, opties.hosts ?? toegestaneHosts());
  if (fout) throw new McpFout(fout);
  const sleutel = opties.frequentieSleutel ?? '';
  if (sleutel && !magAanroepen(sleutel)) throw new McpFout(MCP_FOUT.frequentie);
  let sessie: McpSessie | null = null;
  const onMelding = (melding: RpcMelding) => {
    if (!sessie) return;
    if (sessie.meldingen.length < 50) sessie.meldingen.push(melding);
    if (isLijstGewijzigd(melding.method)) sessie.lijstGewijzigd = true;
  };
  const gevraagd = initializeParams();
  const { vervoer, initAntwoord } = await kiesVervoer({ adres, token: opties.token, haler: opties.haler, onMelding }, gevraagd);
  sessie = new McpSessie(vervoer, sleutel);
  try {
    if (initAntwoord.error) throw new McpFout(MCP_FOUT.serverFout, schoonExterneTekst(initAntwoord.error.message, 200));
    sessie._vulUitInit(initAntwoord.result, gevraagd.protocolVersion);
    await sessie._meldGereed();
  } catch (err) {
    await sessie.sluit();
    throw err instanceof McpFout ? err : new McpFout(MCP_FOUT.onbekend);
  }
  return sessie;
}

export { McpFout, type Vervoer };
