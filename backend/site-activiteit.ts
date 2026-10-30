// Alles wat de gebruiker op de site doet, als meldingen: het auditlogboek (app.audit) omgezet naar gebeurtenissen met een sectie en dienst.
// "source" heeft de vorm "sectie[:dienst]" (mail:google, github, agent, mcp, identity, ...), zodat het meldingencentrum het juiste gekleurde
// pictogram en het logo van de dienst kan tonen. Ruis (elke leesactie, sessierotatie, menuvoorkeuren) komt er bewust niet in.
export type SiteEvent = { id: string; source: string; platform: string; kind: 'site'; type: string; subject: string; status: 'succeeded' | 'failed' | 'rejected'; createdAt: number; finishedAt: number;
  /** Alleen bij AI-acties (owner.mcp.tool): wat, waarop, en bij mislukking WAAROM — zodat de melding de kern noemt, niet alleen «помилка». */
  tool?: string; doel?: string; client?: string; geweigerd?: boolean; code?: string; reden?: string; /** UI-014: einde van een toegang (ISO), bv. extensie. */ eind?: string;
  /** 22.10.2026: technische auditcontext (profiel/activatie, server/platform/audit.ts) → sfeer 'technisch' (shared/meldingen-soorten.ts). Nooit de id's zelf naar de browser. */
  context?: { profiel?: string; activatie?: string };
  /** 23.10.2026: de handeling gebeurde in de TECHNISCHE ruimte (details.ruimte/lade 'technisch', of een v2-hulpmiddel van de beheerkant
   *  «…_beheer»): een AI-actie via de technische koppeling, een apparaat/browser in het technische slot. Alleen deze vlag gaat mee. */
  ruimte?: 'technisch' };

// 23.10.2026: owner.ruimte.geweigerd = elke poortweigering van de technische ruimte (backend/ruimte-scheiding.ts, per verzoek: één paginalading
// van de hub in een technisch tabblad zonder keuze gaf er 46 in één korte stand-run). De pagina legt de weigering zelf uit (RuimteStrook,
// client.ts); in de bel/het paneel was het herhaalruis («Дія на сайті: ruimte geweigerd · виконано»). Het journaal houdt elke regel.
// 23.10: owner.extensie.zijpaneel.chat = elk chatbericht in het zijpaneel van de extensie (zone E) — geen melding, wel in het journaal.
export const SITE_RUIS = /^(owner\.ruimte\.geweigerd$|owner\.extensie\.zijpaneel\.chat$|owner\.notifications\.|owner\.session\.(rotated|refresh)|owner\.ui\.|owner\.tab\.|owner\.mail\.(item\.|send\.prepared)|owner\.admin\.(audit\.viewed|diagnostics)|owner\.redirect\.|owner\.auth\.transaction\.(created|started)|owner\.browser\.grant\.(used|cookie))/;
const SKIP = SITE_RUIS;
const RULES: Array<[RegExp, string]> = [
  [/^owner\.mail\./, 'mail:google'], [/^owner\.cloud\./, 'cloud:google'], [/^owner\.calendar\./, 'calendar:google'], [/^owner\.github\./, 'github'],
  [/^owner\.ai\.|^owner\.chat\./, 'ai:anthropic'], [/^owner\.(agent|agents)\./, 'agent'], [/^owner\.mcp\./, 'claude'], [/^owner\.browser\./, 'browser'],
  [/^owner\.api\.|^owner\.vault\./, 'api'], [/^owner\.admin\./, 'admin'], [/^owner\.(identity|privacy|profile|session|step_up|auth|access)\./, 'identity'], [/^account\./, 'identity'],
];
/** Sectie (en dienst) voor een auditactie, of null als de actie geen melding verdient. */
export function sourceOfAudit(action: string): string | null {
  if (SKIP.test(action)) return null;
  for (const [re, source] of RULES) if (re.test(action)) return source;
  return action.startsWith('owner.') ? 'site' : null;
}
const FAIL = /fail|denied|error|reject|invalid|blocked|conflict|mislukt|fout|afgebroken/i;
/** Nederlandse weigering uit het beheerlogboek (journaalSchrijf resultaat 'geweigerd'): «відхилено», geen «помилка» en geen pop-up. */
const GEWEIGERD = /^(geweigerd|afgewezen)$/i;
export function siteEventsFromAudit(rows: Array<{ id: string; action: string; result: string; createdAt: number; details?: Record<string, unknown>; context?: { profiel?: string; activatie?: string } }>): SiteEvent[] {
  const out: SiteEvent[] = [];
  for (const r of rows) {
    const source = sourceOfAudit(r.action);
    if (!source) continue;
    const subject = typeof r.details?.provider === 'string' ? r.details.provider.slice(0, 40) : '';
    const failed = FAIL.test(r.result);
    const ev: SiteEvent = { id: `audit:${r.id}`, source, platform: '', kind: 'site', type: r.action, subject, status: GEWEIGERD.test(String(r.result || '')) ? 'rejected' : failed ? 'failed' : 'succeeded', createdAt: r.createdAt, finishedAt: r.createdAt };
    // Alleen de VLAG «technisch profiel actief», nooit de profiel-/activatie-id zelf.
    if (r.context && (r.context.profiel || r.context.activatie)) ev.context = { profiel: r.context.profiel ? 'ja' : undefined, activatie: r.context.activatie ? 'ja' : undefined };
    if (r.details && (r.details.ruimte === 'technisch' || r.details.lade === 'technisch' || /_beheer$/.test(String(r.details.v2 || '')))) ev.ruimte = 'technisch';
    // UI-014: extensie-gebeurtenissen — welke ruimte, tot wanneer, en de reden (code), zodat de melding zegt WAT en WAAROM. Geen ids van sleutels.
    if (/^owner\.extensie\./.test(r.action) && r.details) {
      const d = r.details, tekstVan = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
      const doel = tekstVan(d.ruimte, 20), code = tekstVan(d.reden, 60) || tekstVan(d.venster, 10), eind = tekstVan(d.eind, 40);
      if (doel) ev.doel = doel; if (code) ev.code = code; if (eind) ev.eind = eind;
    }
    if (r.action === 'owner.mcp.tool' && r.details) {
      // Veilige velden uit het journaal (backend/mcp-connector.ts werkDetails): hulpmiddel, doel, client en foutcode — nooit inhoud.
      const kort = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
      const tool = kort(r.details.tool, 80), doel = kort(r.details.doel, 120), client = kort(r.details.client, 60);
      const code = typeof r.details.fout === 'string' && /^[A-Z][A-Z0-9_]{2,47}$/.test(r.details.fout) ? r.details.fout : undefined;
      const reden = kort(r.details.reden, 40);
      if (tool) ev.tool = tool;
      if (doel) ev.doel = doel;
      if (client) ev.client = client;
      if (/denied/i.test(r.result)) ev.geweigerd = true;
      if (code) ev.code = code;
      if (reden) ev.reden = reden;
    }
    out.push(ev);
  }
  return out;
}
