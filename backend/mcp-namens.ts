// Namens welke AI-verbinding loopt de huidige (asynchrone) aanroep? Gezet door de MCP-laag rond elke tools/call, gelezen door
// code die zelf een logregel schrijft (bv. de MCP-console: «probe», «server.opdracht»). Zo staat in het verkeerslog niet meer
// «console · eigenaar@…» voor iets wat Claude deed, maar «mcp · Claude → eigenaar@…».
// Alleen deze module zet de waarde; een HTTP-verzoek kan haar niet meegeven (AsyncLocalStorage leeft alleen in dit proces).
import { AsyncLocalStorage } from 'node:async_hooks';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

/**
 * `ruimte`: de AI-ruimte van de verbinding (shared/ai-ruimte.ts); ontbreekt hij (chat, console, eigenaar zelf), dan geldt 'prive'.
 * `lade`: de GEGEVENSRUIMTE van deze aanroep (shared/ruimte-scheiding.ts → Lade.ruimte). Twee verschillende vragen, sinds
 * 20.10.2026 bewust los van elkaar: `ruimte` zegt WELKE HULPMIDDELEN bestaan, `lade` zegt UIT WELKE RIJEN gelezen en
 * geschreven wordt. Ze lopen alleen uiteen bij de stand 'gedeeld' van een dienst: dan is de gereedschapskist technisch en
 * zijn de gegevens persoonlijk (de bewuste samenvoeging van de eigenaar). Ontbreekt `lade`, dan geldt `ruimte` — zo
 * verandert er niets voor code die de lade niet kent.
 * `v2` (SEC-002, ai-mcp-01): de aanroep komt via connector v2 (/<agent>), waar het recht per hulpmiddel in de koppeling staat.
 * Alleen backend/mcp-connector.ts → roepTool zet hem (uit zijn eigen V2Context, nooit uit iets van de klant); callTool weigert
 * zonder deze vlag elk hulpmiddel dat alleen via connector v2 bestaat (V2_ALLEEN).
 */
export type Namens = { client: string; grantId?: string; ruimte?: AiRuimte; lade?: AiRuimte; /** Connector v2: de agent (slug) waaraan het token is gebonden; komt uit de geauthenticeerde koppeling, niet van de client. */ agent?: string; v2?: boolean };
const opslag = new AsyncLocalStorage<Namens>();

export const metNamens = <T>(namens: Namens, fn: () => Promise<T>): Promise<T> => opslag.run({ client: String(namens.client || '?').slice(0, 80), ...(namens.grantId ? { grantId: String(namens.grantId) } : {}), ...(namens.ruimte ? { ruimte: ruimteOf(namens.ruimte) } : {}), ...(namens.lade ? { lade: ruimteOf(namens.lade) } : {}), ...(namens.agent ? { agent: String(namens.agent).slice(0, 40) } : {}), ...(namens.v2 === true ? { v2: true } : {}) }, fn);
export const huidigeNamens = (): Namens | undefined => opslag.getStore();
/** De ruimte waarin de huidige aanroep loopt: die van de AI-verbinding, anders de privéruimte (minste rechten). */
export const huidigeRuimte = (): AiRuimte => ruimteOf(opslag.getStore()?.ruimte);
/**
 * De GEGEVENSLADE van de huidige aanroep: waaruit rijen gelezen en geschreven worden (apparaten, externe MCP-servers).
 * Ontbreekt zij, dan is het de ruimte van de verbinding; ontbreekt die ook, dan 'prive' (minste rechten). Gebruik
 * `huidigeRuimte()` voor de vraag «mag dit HULPMIDDEL hier bestaan» en `huidigeLade()` voor «welke RIJEN horen hierbij».
 */
export const huidigeLade = (): AiRuimte => { const s = opslag.getStore(); return ruimteOf(s?.lade ?? s?.ruimte); };

/** Naam waaronder het chatvenster van de site (ai.tarasevych.com, eigen API-sleutel) in het AI-beleid en het journaal staat. */
export const CHAT_KLANT = 'Чат ШІ (ai.tarasevych.com)';
