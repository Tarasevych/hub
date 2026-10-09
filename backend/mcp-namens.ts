// Namens welke AI-verbinding loopt de huidige (asynchrone) aanroep? Gezet door de MCP-laag rond elke tools/call, gelezen door
// code die zelf een logregel schrijft (bv. de MCP-console: «probe», «server.opdracht»). Zo staat in het verkeerslog niet meer
// «console · eigenaar@…» voor iets wat Claude deed, maar «mcp · Claude → eigenaar@…».
// Alleen deze module zet de waarde; een HTTP-verzoek kan haar niet meegeven (AsyncLocalStorage leeft alleen in dit proces).
import { AsyncLocalStorage } from 'node:async_hooks';

export type Namens = { client: string; grantId?: string };
const opslag = new AsyncLocalStorage<Namens>();

export const metNamens = <T>(namens: Namens, fn: () => Promise<T>): Promise<T> => opslag.run({ client: String(namens.client || '?').slice(0, 80), ...(namens.grantId ? { grantId: String(namens.grantId) } : {}) }, fn);
export const huidigeNamens = (): Namens | undefined => opslag.getStore();

/** Naam waaronder het chatvenster van de site (ai.tarasevych.com, eigen API-sleutel) in het AI-beleid en het journaal staat. */
export const CHAT_KLANT = 'Чат ШІ (ai.tarasevych.com)';
