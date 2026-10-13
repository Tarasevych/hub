// Instellingen van AI-verbindingen per gebruiker: hoe lang de toegang van elke AI-klant geldt (app.user_ai_settings.verbinding_duur,
// migratie 0029) en de extra OAuth-terugkeeradressen die de eigenaar in het root-bestand toestaat (mcp-rechten.json, «oauthRedirects»).
import { readFileSync, statSync } from 'node:fs';
import { getPool } from '../server/platform/pg';
import { duurVoorKlant, isDuurId, KLANTEN, type DuurId, type KlantId } from '../shared/ai-verbinding';

const sys = () => getPool('systeem');

export async function leesDuren(userId: string): Promise<Record<KlantId, DuurId>> {
  let raw: unknown = {};
  try { raw = (await sys().query('SELECT verbinding_duur FROM app.user_ai_settings WHERE user_id = $1', [userId])).rows[0]?.verbinding_duur ?? {}; }
  catch { raw = {}; } // kolom nog niet gemigreerd: standaard
  return Object.fromEntries(KLANTEN.map((k) => [k.id, duurVoorKlant(raw, k.id)])) as Record<KlantId, DuurId>;
}

export async function zetDuur(userId: string, klant: KlantId, duur: DuurId): Promise<void> {
  if (!isDuurId(duur) || !KLANTEN.some((k) => k.id === klant)) throw new Error('DUUR_ONGELDIG');
  await sys().query(
    `INSERT INTO app.user_ai_settings (user_id, verbinding_duur, updated_at) VALUES ($1, jsonb_build_object($2::text, $3::text), now())
     ON CONFLICT (user_id) DO UPDATE SET verbinding_duur = app.user_ai_settings.verbinding_duur || jsonb_build_object($2::text, $3::text), updated_at = now()`,
    [userId, klant, duur]);
}

const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
let extraCache: { sleutel: string; lijst: string[] } | null = null;
/** Extra terugkeeradressen van de eigenaar (root-bestand, alleen lezen). Leeg als het bestand of de sleutel ontbreekt. */
export function extraRedirects(): string[] {
  try {
    const st = statSync(rechtenPad());
    const sleutel = `${st.mtimeMs}:${st.size}`;
    if (extraCache?.sleutel === sleutel) return extraCache.lijst;
    const data = JSON.parse(readFileSync(rechtenPad(), 'utf8'));
    const lijst = Array.isArray(data?.oauthRedirects) ? data.oauthRedirects.filter((x: unknown) => typeof x === 'string' && x.length <= 300).slice(0, 20) : [];
    extraCache = { sleutel, lijst };
    return lijst;
  } catch { return []; }
}
