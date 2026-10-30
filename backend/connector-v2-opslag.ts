// Connector v2 — opslag (0045): rechten per koppeling, geheugen per gebruiker × agent, instellingen per gebruiker.
// Alles via de systeemrol; elke query filtert zelf op user_id (RLS is de tweede laag). Geen import van mcp-connector.ts.
import { getPool } from '../server/platform/pg';
import { isAgentSlug, type AgentSlug } from '../shared/connector-v2/agenten';
import { V2_OPTIES, type Kant } from '../shared/connector-v2/catalogus';
import { STANDAARD, isKant, schoon } from '../shared/connector-v2/rechten';
import { scopeVoorTool } from '../shared/ai-toegang';
import { zetToegang } from './ai-toegang';
import { grantSluiten } from './sleutelkluis';

const q = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);

export type V2Keuze = { kanten: Kant[]; sleutels: string[] };

/** Ongeldige of lege invoer → alleen de privéruimte met de veilige standaard. Sleutels altijd opgeschoond. */
export function normaliseerKeuze(ruw: unknown): V2Keuze {
  const o = ruw && typeof ruw === 'object' ? ruw as Record<string, unknown> : {};
  const kanten = Array.isArray(o.kanten) ? [...new Set(o.kanten.filter(isKant))].sort() as Kant[] : [];
  const k: Kant[] = kanten.length ? kanten : ['gebruiker'];
  const sleutels = Array.isArray(o.sleutels) ? schoon(o.sleutels, k) : STANDAARD(k);
  return { kanten: k, sleutels };
}

/** De bestaande scopelaag (0044, shared/ai-toegang.ts) gelijk houden: precies de scopes van de toegestane interne hulpmiddelen. */
export function scopesVoor(sleutels: readonly string[]): string[] {
  const s = new Set<string>();
  for (const o of V2_OPTIES) if (sleutels.includes(o.key) && o.intern) { const sc = scopeVoorTool(o.intern); if (sc) s.add(sc); }
  return [...s].sort();
}

export async function leesRechten(grantId: string): Promise<(V2Keuze & { agent: AgentSlug; userId: string }) | null> {
  const { rows } = await q('SELECT user_id, agent, kanten, sleutels FROM app.connector_v2_rechten WHERE grant_id = $1', [grantId]);
  const r = rows[0];
  if (!r || !isAgentSlug(r.agent)) return null;
  const kanten = (r.kanten as string[]).filter(isKant);
  return { userId: String(r.user_id), agent: r.agent, kanten, sleutels: schoon(r.sleutels as string[], kanten) };
}

/** Rechten van één koppeling vastleggen (en de scopelaag erbij). */
export async function zetRechten(userId: string, grantId: string, agent: AgentSlug, keuze: V2Keuze): Promise<V2Keuze> {
  const k = normaliseerKeuze(keuze);
  await q(
    `INSERT INTO app.connector_v2_rechten (grant_id, user_id, agent, kanten, sleutels, updated_at)
     VALUES ($1, $2, $3, $4::text[], $5::text[], now())
     ON CONFLICT (grant_id) DO UPDATE SET kanten = EXCLUDED.kanten, sleutels = EXCLUDED.sleutels, updated_at = now()
     WHERE app.connector_v2_rechten.user_id = EXCLUDED.user_id`,
    [grantId, userId, agent, k.kanten, k.sleutels]);
  await zetToegang(userId, { soort: 'mcp-koppeling', id: grantId }, scopesVoor(k.sleutels));
  return k;
}

export type Voorkeur = V2Keuze & { herverbinden: boolean; updatedAt: number };
export async function leesVoorkeur(userId: string, agent: AgentSlug): Promise<Voorkeur | null> {
  const { rows } = await q('SELECT kanten, sleutels, herverbinden, updated_at FROM app.connector_v2_voorkeur WHERE user_id = $1 AND agent = $2', [userId, agent]);
  const r = rows[0];
  if (!r) return null;
  const kanten = (r.kanten as string[]).filter(isKant);
  return { kanten, sleutels: schoon(r.sleutels as string[], kanten), herverbinden: !!r.herverbinden, updatedAt: new Date(r.updated_at).getTime() };
}
export async function zetVoorkeur(userId: string, agent: AgentSlug, keuze: V2Keuze, herverbinden: boolean): Promise<Voorkeur> {
  const k = normaliseerKeuze(keuze);
  await q(
    `INSERT INTO app.connector_v2_voorkeur (user_id, agent, kanten, sleutels, herverbinden, updated_at)
     VALUES ($1, $2, $3::text[], $4::text[], $5, now())
     ON CONFLICT (user_id, agent) DO UPDATE SET kanten = EXCLUDED.kanten, sleutels = EXCLUDED.sleutels, herverbinden = EXCLUDED.herverbinden, updated_at = now()`,
    [userId, agent, k.kanten, k.sleutels, herverbinden]);
  return { ...k, herverbinden, updatedAt: Date.now() };
}

/** Actieve v2-koppelingen van een gebruiker (alle agents of één). */
export async function actieveKoppelingen(userId: string, agent?: AgentSlug) {
  const { rows } = await q(
    `SELECT t.id::text AS id, t.agent, t.client_name, t.created_at, t.last_used_at, t.refresh_expires_at, t.duur, r.kanten, r.sleutels
       FROM app.mcp_oauth_tokens t LEFT JOIN app.connector_v2_rechten r ON r.grant_id = t.id
      WHERE t.user_id = $1 AND t.agent IS NOT NULL AND t.revoked_at IS NULL AND t.refresh_expires_at > now() AND ($2::text IS NULL OR t.agent = $2)
      ORDER BY t.created_at DESC`, [userId, agent ?? null]);
  return rows.filter((r) => isAgentSlug(r.agent)).map((r) => {
    const kanten = ((r.kanten as string[] | null) ?? []).filter(isKant);
    return {
      id: String(r.id), agent: r.agent as AgentSlug, clientName: String(r.client_name), createdAt: new Date(r.created_at).getTime(),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).getTime() : null, expiresAt: new Date(r.refresh_expires_at).getTime(), duur: r.duur ?? null,
      kanten, sleutels: schoon((r.sleutels as string[] | null) ?? [], kanten),
    };
  });
}

/** Intrekken van v2-koppelingen van één agent (of één koppeling). Geeft de ingetrokken ids. */
export async function trekIn(userId: string, agent: AgentSlug, grantId?: string): Promise<string[]> {
  const { rows } = await q(
    `UPDATE app.mcp_oauth_tokens SET revoked_at = now()
      WHERE user_id = $1 AND agent = $2 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id = $3::uuid) RETURNING id::text AS id`,
    [userId, agent, grantId ?? null]);
  const ids = rows.map((r) => String(r.id));
  // Sleutelkluis (0092): een ingetrokken verbinding houdt de gegevenssleutel niet meer open en verliest haar omslagen.
  for (const id of ids) await grantSluiten(id).catch(() => undefined);
  return ids;
}

export async function leesInstellingen(userId: string): Promise<{ extraBevestigen: boolean }> {
  const { rows } = await q('SELECT extra_bevestigen FROM app.connector_v2_instellingen WHERE user_id = $1', [userId]);
  return { extraBevestigen: !!rows[0]?.extra_bevestigen };
}
export async function zetInstellingen(userId: string, extraBevestigen: boolean): Promise<void> {
  await q(
    `INSERT INTO app.connector_v2_instellingen (user_id, extra_bevestigen, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET extra_bevestigen = EXCLUDED.extra_bevestigen, updated_at = now()`, [userId, extraBevestigen]);
}

/** Na uitgifte van een v2-token: rechten vastleggen en het geheugen bijwerken (herverbinden afgerond). */
export async function naUitgifte(userId: string, grantId: string, agent: AgentSlug, keuze: unknown): Promise<V2Keuze> {
  const k = await zetRechten(userId, grantId, agent, normaliseerKeuze(keuze));
  await zetVoorkeur(userId, agent, k, false);
  return k;
}
