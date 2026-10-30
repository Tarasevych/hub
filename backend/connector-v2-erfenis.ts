// Connector v2 — ERFENIS van het oude /mcp (20.10.2026): wat de mens vóór connector v2 al toestond, verdwijnt niet.
//
// Het oude /mcp kende geen rechten per hulpmiddel maar (a) een RUIMTE per grant (mcp_oauth_tokens.ruimte: 'prive' of 'technisch')
// en (b) SCOPES per grant (app.ai_toegang, shared/ai-toegang.ts). Connector v2 kent kanten ('gebruiker' / 'beheer') en sleutels
// (`${id}:${kant}`, shared/connector-v2/catalogus.ts). Deze module vertaalt het ene in het andere, LIVE en zonder gegevens te
// verplaatsen (geen migratie: de oude rijen blijven de waarheid van de oude koppeling, en «NULL = persoonlijk» blijft gelden):
//
//   • kanten  = de vereniging van alle nog geldige /mcp-grants van deze mens voor deze AI-klant ('prive' → gebruiker,
//               'technisch' → beheer). Had de mens Claude ooit privé én technisch toegestaan, dan draagt de erfenis beide kanten;
//   • sleutels = elke actieve optie van die kanten waarvan het interne hulpmiddel geen scope kent (bv. v2_whoami, apparaten) of
//               waarvan de scope in de vereniging van de verleende scopes staat. Een scope die de mens nooit gaf, geeft geen sleutel.
//
// Twee gebruikers:
//   1. backend/connector-v2.ts → rpc: een token dat voor het oude /mcp is uitgegeven (agent IS NULL) werkt op /<agent> van DEZELFDE
//      AI-klant (klantVan(client_name) = de klant van de agent) met deze afgeleide rechten. Geen nieuwe toestemming; de levende
//      filtering (v2Lijst/v2Roep) blijft precies dezelfde als voor een v2-grant;
//   2. backend/connector-v2.ts → consentV2: zonder v2-koppeling en zonder onthouden keuze start het venster met de erfenis
//      aangevinkt, zodat «opnieuw verbinden via het nieuwe adres» niets stil laat vallen.
import { getPool } from '../server/platform/pg';
import { klantVan } from '../shared/ai-verbinding';
import { ruimteOf } from '../shared/ai-ruimte';
import { scopeVoorTool } from '../shared/ai-toegang';
import { v2Agent, type AgentSlug } from '../shared/connector-v2/agenten';
import { V2_OPTIES, type Kant } from '../shared/connector-v2/catalogus';
import { schoon } from '../shared/connector-v2/rechten';
import type { V2Keuze } from './connector-v2-opslag';
import { BEHEER_TOOL_NAMEN } from './ai-beheer-hulpmiddeldefinities';
import { DEV_GEBRUIKER_NAMEN } from './dev-gebruiker-hulpmiddeldefinities';
import { DEV_MG_TOOLS } from '../shared/dev-media-github';

/**
 * Hulpmiddelen die NOOIT uit de erfenis van het oude /mcp komen, ook niet zonder scope (21.10.2026): het oude /mcp kende ze niet, dus
 * de mens kan ze daar ook nooit hebben toegestaan. Alleen een uitdrukkelijke keuze in het toestemmingsvenster van connector v2 geeft
 * ze (gebruikers beheren is kritiek). Wie er een rechtenfamilie bij bouwt met dezelfde eis, voegt haar interne namen hier toe.
 */
// 21.10.2026 (P1): ook de zes privé-rechten die «у розробці» stonden (mail verzenden, Drive maken/uploaden/delen, gekozen foto's,
// iCloud) — het oude /mcp kende ze niet, dus geen erfenis; alleen een uitdrukkelijk vinkje in het venster van connector v2.
// 21.10.2026 (agent D): ook PR, CI-logboeken, eigen domein, beeld, schema, ontwerpcontext en Stripe (shared/dev-media-github.ts).
export const ALLEEN_UITDRUKKELIJK: ReadonlySet<string> = new Set<string>([...BEHEER_TOOL_NAMEN, ...DEV_GEBRUIKER_NAMEN, ...DEV_MG_TOOLS]);

export type Erfenis = V2Keuze & {
  /** De oude grants (ids) waaruit dit is afgeleid; leeg = geen erfenis. */
  grants: string[];
  /** De verenigde scopes van die grants (ter uitleg in het venster). */
  scopes: string[];
};

/** Sleutels die bij deze kanten horen en door deze scopes gedekt zijn (puur; ook voor tests). */
export function sleutelsUitScopes(kanten: readonly Kant[], scopes: readonly string[]): string[] {
  const s = new Set(scopes);
  const uit: string[] = [];
  for (const o of V2_OPTIES) {
    if (o.status !== 'actief' || !kanten.includes(o.kant)) continue;
    if (o.intern && ALLEEN_UITDRUKKELIJK.has(o.intern)) continue;
    const scope = o.intern ? scopeVoorTool(o.intern) : undefined;
    if (!scope || s.has(scope)) uit.push(o.key);
  }
  return schoon(uit, kanten);
}

export type OudeGrant = { id: string; clientId: string; clientName: string; ruimte: 'prive' | 'technisch'; scopes: string[]; createdAt: number; lastUsedAt: number | null; expiresAt: number };

/** Nog geldige /mcp-grants (agent IS NULL) van deze mens; optioneel alleen die van één klant. */
async function oudeGrants(userId: string): Promise<OudeGrant[]> {
  const { rows } = await getPool('systeem').query(
    `SELECT t.id::text AS id, t.client_id, t.client_name, t.ruimte, t.created_at, t.last_used_at, t.refresh_expires_at, COALESCE(a.scopes, '{}'::text[]) AS scopes
       FROM app.mcp_oauth_tokens t
       LEFT JOIN app.ai_toegang a ON a.soort = 'mcp-koppeling' AND a.onderwerp_id = t.id::text
      WHERE t.user_id = $1 AND t.agent IS NULL AND t.revoked_at IS NULL AND t.refresh_expires_at > now()
      ORDER BY t.created_at DESC`, [userId]);
  return rows.map((r) => ({
    id: String(r.id), clientId: String(r.client_id || ''), clientName: String(r.client_name || ''), ruimte: ruimteOf(r.ruimte), scopes: Array.isArray(r.scopes) ? r.scopes.map(String) : [],
    createdAt: new Date(r.created_at).getTime(), lastUsedAt: r.last_used_at ? new Date(r.last_used_at).getTime() : null, expiresAt: new Date(r.refresh_expires_at).getTime(),
  }));
}

/**
 * De nog geldige /mcp-grants van ÉÉN AI-klant, met hun tijden — voor de WARE stand op de pagina van die agent (20.10.2026:
 * de hub zei «не підключено» terwijl Claude via het oude /mcp gewoon werkte). Geen rechtenvertaling hier; dat doet erfenisVoor.
 */
export async function oudeGrantsVoor(userId: string, slug: AgentSlug): Promise<OudeGrant[]> {
  const klant = v2Agent(slug).klant;
  return (await oudeGrants(userId)).filter((g) => klantVan(g.clientName) === klant);
}

/** De erfenis van één AI-klant: alles wat de mens die klant op het oude /mcp nog toestaat, als v2-keuze. */
export async function erfenisVoor(userId: string, slug: AgentSlug): Promise<Erfenis> {
  const klant = v2Agent(slug).klant;
  const eigen = (await oudeGrants(userId)).filter((g) => klantVan(g.clientName) === klant);
  return erfenisUit(eigen);
}

/** Puur deel: van oude grants naar kanten + sleutels. */
export function erfenisUit(grants: ReadonlyArray<{ id: string; ruimte: 'prive' | 'technisch'; scopes: readonly string[] }>): Erfenis {
  const kanten = [...new Set(grants.map((g): Kant => (g.ruimte === 'technisch' ? 'beheer' : 'gebruiker')))].sort() as Kant[];
  const scopes = [...new Set(grants.flatMap((g) => g.scopes))].sort();
  if (!kanten.length) return { kanten: ['gebruiker'], sleutels: [], grants: [], scopes: [] };
  return { kanten, sleutels: sleutelsUitScopes(kanten, scopes), grants: grants.map((g) => g.id), scopes };
}

/**
 * Rechten voor een /mcp-token dat op /<agent> aanklopt: alleen als de klant van het token bij die agent hoort (een token van
 * «ChatGPT» werkt niet op /claude), anders null.
 *   • kanten  = de erfenis van de geldige /mcp-grants van DEZELFDE OAuth-REGISTRATIE (client_id) als dit token; de levende poorten
 *               (eigenaar, technisch profiel, dienst «ai») beslissen bij elke aanroep opnieuw wat daarvan nu bestaat;
 *   • sleutels = gedekt door de scopes van DIT token: dat is wat connectors-tools.callTool bij de aanroep controleert
 *               (app.ai_toegang op deze grant), dus tools/list belooft nooit iets wat tools/call daarna zou weigeren.
 *
 * BEVEILIGINGSREVIEW 21.10.2026 — waarom client_id en niet klantVan(client_name): `client_name` kiest de klant ZELF bij de
 * dynamische registratie (RFC 7591), en klantVan herkent «claude» overal in de naam («Evil (Claude)», «My Claude» → 'claude').
 * Met de vereniging over de NAAM kreeg een vreemde app die zich «Claude» noemde en van de mens alleen een PRIVÉ-toestemming kreeg,
 * op /claude óók de beheerkant van de échte Claude (technische grant): machine_read_file/app_logs/browser_*:beheer met de scopes
 * van zijn eigen grant, en alle beheeropties zonder scope (get_admin_view, read_release_file, uitrol_voorstel_*) — zodra de eigenaar
 * zijn technisch profiel aanzette. Een client_id geeft de server zelf uit; dezelfde client_id = dezelfde registratie, dezelfde app.
 * Voor één token betekent dit: hoogstens de kanten die de mens DEZE app gaf — nooit minder dan zijn eigen grant, nooit meer.
 */
export async function rechtenVoorOudToken(userId: string, clientName: string, slug: AgentSlug, grantId: string): Promise<Erfenis | null> {
  if (klantVan(clientName) !== v2Agent(slug).klant) return null;
  const alle = (await oudeGrants(userId)).filter((g) => klantVan(g.clientName) === v2Agent(slug).klant);
  const dit = alle.find((g) => g.id === grantId);
  if (!dit || !dit.clientId) return null;
  const e = erfenisUit(alle.filter((g) => g.clientId === dit.clientId));
  return { ...e, sleutels: sleutelsUitScopes(e.kanten, dit.scopes), scopes: [...dit.scopes].sort() };
}
