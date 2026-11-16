// MCP-001 · R1 (12.11.2026): перевірка заголовка Origin на MCP-адресах (захист від DNS-rebinding).
// Специфікація MCP (транспорт Streamable HTTP, 2025-11-25 і 2026-07-28): сервер MUST перевіряти Origin; якщо Origin присутній
// і недійсний — відповідь 403. Запити сервер-сервер (claude.ai, ChatGPT, Gemini з їхніх серверів) Origin не надсилають — вони
// проходять як раніше. Браузерні MCP-клієнти (веб-інспектор, сайти ШІ) — лише з дозволених походжень.
//
// Zuivere functies (geen database, geen netwerk): server/start.ts roept ze aan vóór de routering en vóór de GET-stroom.
// Terugval zonder nieuwe uitrol: MCP_ORIGIN_MODUS=melden → niets weigeren, alleen melden (in het beheerlogboek).

/** Eigen sites + bekende webklanten van MCP. Alleen exacte origins (schema + host + poort), geen jokers. */
export const MCP_ORIGINS_STANDAARD: readonly string[] = Object.freeze([
  'https://claude.ai', 'https://claude.com', 'https://www.claude.com',
  'https://chatgpt.com', 'https://chat.openai.com', 'https://platform.openai.com',
  'https://gemini.google.com', 'https://aistudio.google.com',
  'https://grok.com', 'https://x.ai',
  'https://copilot.microsoft.com', 'https://github.com',
  'https://cursor.com', 'https://www.cursor.com',
  // MCP Inspector (веб-клієнт) на власному ПК: стандартний порт 6274
  'http://localhost:6274', 'http://127.0.0.1:6274',
]);

export type OriginModus = 'weigeren' | 'melden';
export const originModus = (v: string | undefined = process.env.MCP_ORIGIN_MODUS): OriginModus => (String(v || '').trim().toLowerCase() === 'melden' ? 'melden' : 'weigeren');

/** Extra origins uit MCP_EXTRA_ORIGINS (komma-gescheiden). Ongeldige of jokers worden genegeerd. */
export function extraOrigins(v: string | undefined = process.env.MCP_EXTRA_ORIGINS): string[] {
  return String(v || '').split(',').map((s) => normaliseerOrigin(s)).filter((s): s is string => !!s);
}

/** «https://Claude.AI/» → «https://claude.ai»; alles wat geen geldige http(s)-origin is → null. `null` (tekst) blijft null. */
export function normaliseerOrigin(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s || s === 'null' || s.includes('*')) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    // Een origin heeft geen pad, query of fragment (de URL-parser maakt van een kale origin pad «/»).
    if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return null;
    return u.origin.toLowerCase();
  } catch { return null; }
}

export type OriginBesluit =
  | { soort: 'geen' }                     // geen Origin: server-naar-server of native klant → doorlaten
  | { soort: 'toegestaan'; origin: string }
  | { soort: 'geweigerd'; origin: string; melden: boolean; blokkeren: boolean };

/**
 * Beslis over één verzoek. `eigen` = de eigen app-origins (https://<dienst>.tarasevych.com) uit server/start.ts.
 * De letterlijke tekst «null» (sandbox-iframe, file://) telt als ongeldig: zo'n bron is nooit een vertrouwde klant.
 */
export function mcpOriginBesluit(origin: unknown, eigen: Iterable<string>, opties: { modus?: OriginModus; extra?: string[] } = {}): OriginBesluit {
  const ruw = String(origin ?? '').trim();
  if (!ruw) return { soort: 'geen' };
  const modus = opties.modus ?? originModus();
  const n = normaliseerOrigin(ruw);
  const toegestaan = new Set<string>([...MCP_ORIGINS_STANDAARD, ...[...eigen].map((o) => normaliseerOrigin(o)).filter((o): o is string => !!o), ...(opties.extra ?? extraOrigins())]);
  if (n && toegestaan.has(n)) return { soort: 'toegestaan', origin: n };
  return { soort: 'geweigerd', origin: (n ?? ruw).slice(0, 200), melden: true, blokkeren: modus === 'weigeren' };
}

/** MCP-paden (na connectorPad) waarop de controle geldt: het JSON-RPC-eindpunt van het oude /mcp en van elke agent. */
export const isMcpRpcPad = (pad: string): boolean => /^\/api\/(mcp-connector\/rpc|connector-v2\/[a-z]+\/rpc)$/.test(pad);

/** Antwoordtekst bij 403 — tweetalig (UI-regel), met de technische code voor de klant. */
export const ORIGIN_403 = Object.freeze({
  error: 'ORIGIN_DENIED',
  reasonCode: 'ORIGIN_DENIED',
  uk: 'Запит до MCP відхилено: походження (Origin) не входить до дозволених. Захист від DNS-rebinding.',
  nl: 'MCP-verzoek geweigerd: de herkomst (Origin) staat niet op de toegestane lijst. Bescherming tegen DNS-rebinding.',
});
