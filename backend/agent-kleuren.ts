// Kleur per AI-agent, per gebruiker (opdracht eigenaar 20.10.2026; migratie 0088).
//
// Eén bron voor drie plekken die dezelfde kleur moeten laten zien:
//   1. de rand in het browsertabblad (extensie 0.6.2, extension/markering.js);
//   2. de badge op het pictogram van de extensie;
//   3. de agentenlijst op de site.
// Daarom staat de kleur bij de GEBRUIKER (niet bij een tabblad, niet bij een koppeling) en wordt ze als ACCENTNAAM bewaard:
// de echte kleurwaarden blijven in het palet van de site (shared/menu-model.ts → ACCENT_KLEUREN, al op contrast gecontroleerd
// in licht en donker). Een naam die niet (meer) in het palet staat wordt genegeerd: dan geldt de standaard van
// shared/markering-agenten.ts. Zo kan er nooit een onleesbare of verzonnen kleur in de rand komen.
//
// De extensie krijgt deze lijst via het bestaande {t:'agent-status'}-bericht (backend/extensie-ontgrendeling.ts): de kleur is
// weergave, nooit een recht, en hoeft dus niet ondertekend te worden.
import { getPool } from '../server/platform/pg';
import { ACCENTEN, type Accent } from '../shared/menu-model';
import { isAgentSlug, V2_AGENTEN, type AgentSlug } from '../shared/connector-v2/agenten';
import { AGENT_ACCENT } from '../shared/markering-agenten';

const q = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);
const isAccent = (v: unknown): v is Accent => typeof v === 'string' && (ACCENTEN as readonly string[]).includes(v);

export type AgentKleurRij = { agent: AgentSlug; accent: Accent; standaard: boolean };

/** Wat de gebruiker zelf koos ({slug: accent}); alleen bekende agents en bestaande accenten. */
export async function gekozen(userId: string): Promise<Partial<Record<AgentSlug, Accent>>> {
  const { rows } = await q('SELECT agent, accent FROM app.agent_kleuren WHERE user_id = $1', [userId]);
  const uit: Partial<Record<AgentSlug, Accent>> = {};
  for (const r of rows) {
    const slug: unknown = r.agent;
    if (isAgentSlug(slug) && isAccent(r.accent)) uit[slug] = r.accent;
  }
  return uit;
}

/** Alle zes agents met de kleur die NU geldt: de keuze van de gebruiker, anders de standaard uit het palet. */
export async function lijst(userId: string): Promise<AgentKleurRij[]> {
  const keuze = await gekozen(userId);
  return V2_AGENTEN.map((a) => ({ agent: a.slug, accent: keuze[a.slug] ?? AGENT_ACCENT[a.slug], standaard: !keuze[a.slug] }));
}

/** Kleur zetten of (accent = null) terug naar de standaard. Geeft de nieuwe lijst terug. */
export async function zet(userId: string, agent: unknown, accent: unknown): Promise<AgentKleurRij[]> {
  if (!isAgentSlug(agent)) throw new Error('AGENT_ONBEKEND');
  if (accent === null || accent === '' || accent === undefined) {
    await q('DELETE FROM app.agent_kleuren WHERE user_id = $1 AND agent = $2', [userId, agent]);
    return lijst(userId);
  }
  if (!isAccent(accent)) throw new Error('ACCENT_ONBEKEND');
  await q(
    `INSERT INTO app.agent_kleuren (user_id, agent, accent, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, agent) DO UPDATE SET accent = EXCLUDED.accent, updated_at = now()`,
    [userId, agent, accent]);
  return lijst(userId);
}

/** Vorm waarin de extensie de kleuren krijgt ({t:'agent-status'} → `kleuren`). Alleen namen, nooit hexwaarden. */
export const voorExtensie = (rijen: readonly AgentKleurRij[]) => rijen.map((r) => ({ agent: r.agent, accent: r.accent }));
