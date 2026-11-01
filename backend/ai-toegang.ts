// Gedetailleerde AI-toegang: per gebruiker, per verbinding (OAuth-grant of agenttoken),
// per scope (shared/ai-toegang.ts is de enige catalogus).
//
// Default-deny: een scope die de mens niet expliciet aan deze verbinding gaf, wordt geweigerd.
// Gevoelige scopes (mail, foto's) bovendien nooit voor een technische verbinding (naast de
// AiRuimte-poort) en alleen met een bevestiging in te schakelen. Een bestuurlijk uitgeschakelde
// scope (app.ai_toegang_beheer) wordt geweigerd, ook met een oude grantrij. Het ondertekende
// AI-beleid van de eigenaar blijft het plafond daarboven (zie connectors-tools.callTool).
import { getPool } from '../server/platform/pg';
import {
  STANDAARD_SCOPES, TECHNISCHE_STANDAARD_SCOPES, isToegangScope, scopeVoorTool, toegangScope,
  type AiToegangSoort,
} from '../shared/ai-toegang';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

export type Onderwerp = { soort: AiToegangSoort; id: string };

/** grantId uit de MCP-namen → onderwerp. OAuth-tokenId (uuid) = mcp-koppeling; «token:<uuid>» = agenttoken. */
export function onderwerpVanGrantId(grantId: string | undefined | null): Onderwerp | null {
  const ruw = String(grantId || '');
  const token = ruw.startsWith('token:')
    ? { soort: 'agenttoken' as const, id: ruw.slice(6) }
    : { soort: 'mcp-koppeling' as const, id: ruw };
  if (token.id.length < 8 || token.id.length > 80) return null;
  if (!/^[0-9a-fA-F-]{8,80}$/.test(token.id) && !/^[A-Za-z0-9_-]{8,80}$/.test(token.id)) return null;
  return token;
}

export type WeigerReden = 'onbekend-instrument' | 'gevoelig-technisch' | 'beheer-uit' | 'geen-grant';
export type Beoordeling =
  | { ok: true; scope: string }
  | { ok: false; scope: string | null; reden: WeigerReden };

const bevat = (lijst: ReadonlySet<string> | readonly string[], waarde: string): boolean =>
  typeof (lijst as ReadonlySet<string>).has === 'function'
    ? (lijst as ReadonlySet<string>).has(waarde)
    : (lijst as readonly string[]).includes(waarde);

/**
 * Puur (geen DB): mag dit instrument met deze verleende scopes en deze bestuurlijke «uit»-lijst?
 * Volgorde: onbekend instrument → gevoelig+technisch → bestuur-uit → geen grant. Alles anders = toestaan.
 */
export function beoordeel(
  instrument: string,
  ruimte: AiRuimte,
  verleend: ReadonlySet<string> | readonly string[],
  beheerUit: ReadonlySet<string> | readonly string[],
): Beoordeling {
  const naam = String(instrument || '');
  const scope = scopeVoorTool(naam);
  if (!scope) return { ok: false, scope: null, reden: 'onbekend-instrument' };
  if (ruimteOf(ruimte) === 'technisch' && toegangScope(scope)?.gevoelig) {
    return { ok: false, scope, reden: 'gevoelig-technisch' };
  }
  if (bevat(beheerUit, scope)) return { ok: false, scope, reden: 'beheer-uit' };
  if (!bevat(verleend, scope)) return { ok: false, scope, reden: 'geen-grant' };
  return { ok: true, scope };
}

const q = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);

/** Verleende scopes van één verbinding; [] als er geen rij is (nog nooit ingesteld = niets verleend). */
export async function leesToegang(onderwerp: Onderwerp): Promise<string[]> {
  const { rows } = await q('SELECT scopes FROM app.ai_toegang WHERE soort = $1 AND onderwerp_id = $2', [onderwerp.soort, onderwerp.id]);
  const lijst = rows[0]?.scopes;
  return Array.isArray(lijst) ? lijst.filter(isToegangScope) : [];
}

// Bestuurlijke «uit»-lijst (klein, zelden gewijzigd): kort in het geheugen, zodat niet elke toolcall twee queries kost.
let beheerCache: { lijst: string[]; tot: number } | null = null;
export const vergeetBeheerCache = () => { beheerCache = null; };
export async function leesBeheerUit(): Promise<string[]> {
  if (beheerCache && beheerCache.tot > Date.now()) return beheerCache.lijst;
  const { rows } = await q('SELECT scope FROM app.ai_toegang_beheer WHERE uit = true');
  const lijst = rows.map((r) => String(r.scope)).filter(isToegangScope);
  beheerCache = { lijst, tot: Date.now() + 30_000 };
  return lijst;
}

/** Combinatie voor de hot paths: één beoordeling uit de database. Gooit bij een DB-fout (de aanroeper beslist). */
export async function magTool(onderwerp: Onderwerp, instrument: string, ruimte: AiRuimte): Promise<Beoordeling> {
  const [verleend, uit] = await Promise.all([leesToegang(onderwerp), leesBeheerUit()]);
  return beoordeel(instrument, ruimte, verleend, uit);
}

/** Alleen een fout «tabel ontbreekt» (migratie 0043 nog niet gedraaid): dan geldt het oude gedrag. */
export const isOntbrekendeTabel = (err: unknown): boolean =>
  err instanceof Error && /relation "app\.ai_toegang/.test(err.message);

/** Menselijke keuze opslaan: alleen bekende scopes; eigendom wordt door de route gecontroleerd. */
export async function zetToegang(userId: string, onderwerp: Onderwerp, scopes: readonly string[]): Promise<string[]> {
  const schoon = [...new Set(scopes.filter(isToegangScope))];
  await q(
    `INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes, updated_at)
     VALUES ($1, $2, $3, $4::text[], now())
     ON CONFLICT (soort, onderwerp_id) DO UPDATE SET scopes = EXCLUDED.scopes, updated_at = now()`,
    [userId, onderwerp.soort, onderwerp.id, schoon],
  );
  return schoon;
}

/** Standaardscopes voor een verbinding in deze ruimte (puur): de niet-gevoelige standaard; technisch nooit een gevoelige scope. */
export function standaardScopesVoor(ruimte: AiRuimte): string[] {
  // Technisch: TECHNISCHE_STANDAARD_SCOPES (shared) — dezelfde lijst als de knop «Технічний стандарт» in de tab.
  return ruimteOf(ruimte) === 'technisch' ? [...TECHNISCHE_STANDAARD_SCOPES] : [...STANDAARD_SCOPES];
}

/** Nieuwe verbinding: standaard (niet-gevoelige) scopes; gevoelige nooit voor een technische verbinding. */
export async function geefStandaard(userId: string, onderwerp: Onderwerp, ruimte: AiRuimte): Promise<void> {
  await q(
    `INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes)
     VALUES ($1, $2, $3, $4::text[]) ON CONFLICT (soort, onderwerp_id) DO NOTHING`,
    [userId, onderwerp.soort, onderwerp.id, standaardScopesVoor(ruimte)],
  );
}

/**
 * Vaste herinneringsrij per gebruiker × AI-klant (AiToegangTab met «bord:<klant>»): de keuze voor de PRIVÉRUIMTE van die AI, zodat
 * nieuwe privé OAuth-sessies haar erven. Gescheiden ruimtes (besluit eigenaar 1.11.2026): een technische verbinding erft haar nooit.
 * Рядок «Доступу ШІ» — лише приватний простір цього ШІ; технічні підключення його не успадковують.
 */
export function bordOnderwerp(userId: string, klant: string): Onderwerp | null {
  if (!/^[a-z0-9_-]{2,24}$/.test(klant) || klant === 'overig') return null;
  const bordId = `bord_${userId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48)}_${klant}`.slice(0, 80);
  return bordId.length >= 8 ? { soort: 'mcp-koppeling', id: bordId } : null;
}

/**
 * Gescheiden ruimtes (besluit eigenaar 1.11.2026): «Доступ ШІ» van een AI (bord:<klant>) geldt alleen voor oude /mcp-grants in de
 * PRIVÉRUIMTE. Technische /mcp-grants (eigen technische standaard) en connector-v2-koppelingen (rechten per hulpmiddel in
 * connector_v2_rechten) worden er nooit door gelezen of geschreven. Puur.
 */
export const isPriveOudeGrant = (g: { ruimte: unknown; agent?: string | null }): boolean => ruimteOf(g.ruimte) === 'prive' && !g.agent;

/**
 * Scopes voor een nieuwe /mcp OAuth-verbinding (puur; ook voor tests). Gescheiden ruimtes (besluit eigenaar 1.11.2026):
 *   • privé: had de mens op de site («Доступ ШІ», bord:<klant>) al scopes gekozen, dan precies die (alleen bekende scopes);
 *     zonder bordrij (`null`) de standaard;
 *   • technisch: ALTIJD de technische standaard — de privékeuze van «Доступ ШІ» telt hier niet mee, ook niet ingeperkt.
 * Технічне підключення ніколи не бере приватний вибір «Доступу ШІ»: лише технічний стандарт.
 */
export function scopesVoorNieuweKoppeling(bord: readonly unknown[] | null, ruimte: AiRuimte): string[] {
  if (ruimteOf(ruimte) === 'technisch' || !bord) return standaardScopesVoor(ruimte);
  return [...new Set(bord.filter(isToegangScope))];
}

/** Nieuwe /mcp OAuth-verbinding: scopes volgens `scopesVoorNieuweKoppeling`; een technische leest de bordrij niet eens. */
export async function geefVoorNieuweKoppeling(userId: string, grantId: string, klant: string, ruimte: AiRuimte): Promise<void> {
  const doel: Onderwerp = { soort: 'mcp-koppeling', id: grantId };
  const bord = ruimteOf(ruimte) === 'technisch' ? null : bordOnderwerp(userId, klant);
  let gekozen: unknown[] | null = null;
  if (bord) {
    const { rows } = await q('SELECT scopes FROM app.ai_toegang WHERE soort = $1 AND onderwerp_id = $2', [bord.soort, bord.id]);
    if (rows[0] && Array.isArray(rows[0].scopes)) gekozen = rows[0].scopes as unknown[];
  }
  await q(
    `INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes)
     VALUES ($1, $2, $3, $4::text[]) ON CONFLICT (soort, onderwerp_id) DO NOTHING`,
    [userId, doel.soort, doel.id, scopesVoorNieuweKoppeling(gekozen, ruimte)],
  );
}

/** Bestuurlijk plafond (alleen de eigenaar, via de route): een scope voor de hele site uit of aan. */
export async function zetBeheer(scope: string, uit: boolean): Promise<void> {
  if (!isToegangScope(scope)) throw new Error('TOEGANG_SCOPE_ONBEKEND');
  if (uit) {
    await q(
      `INSERT INTO app.ai_toegang_beheer (scope, uit, updated_at) VALUES ($1, true, now())
       ON CONFLICT (scope) DO UPDATE SET uit = true, updated_at = now()`, [scope]);
  } else {
    await q('DELETE FROM app.ai_toegang_beheer WHERE scope = $1', [scope]);
  }
  vergeetBeheerCache();
}

/** Bij intrekken: de rij opruimen (een ingetrokken verbinding komt toch nooit meer door de deur). */
export async function verwijderToegang(onderwerp: Onderwerp): Promise<void> {
  await q('DELETE FROM app.ai_toegang WHERE soort = $1 AND onderwerp_id = $2', [onderwerp.soort, onderwerp.id]);
}
