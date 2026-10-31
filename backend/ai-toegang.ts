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
  STANDAARD_SCOPES, isToegangScope, scopeVoorTool, toegangScope,
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

/** Nieuwe verbinding: standaard (niet-gevoelige) scopes; gevoelige nooit voor een technische verbinding. */
export async function geefStandaard(userId: string, onderwerp: Onderwerp, ruimte: AiRuimte): Promise<void> {
  const technisch = ruimteOf(ruimte) === 'technisch';
  const lijst = STANDAARD_SCOPES.filter((s) => !(technisch && toegangScope(s)?.gevoelig));
  await q(
    `INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes)
     VALUES ($1, $2, $3, $4::text[]) ON CONFLICT (soort, onderwerp_id) DO NOTHING`,
    [userId, onderwerp.soort, onderwerp.id, lijst],
  );
}

/** Vaste herinneringsrij per gebruiker × AI-klant (AiToegangTab met «bord:<klant>»), zodat ook nieuwe OAuth-sessies die keuze erven. */
export function bordOnderwerp(userId: string, klant: string): Onderwerp | null {
  if (!/^[a-z0-9_-]{2,24}$/.test(klant) || klant === 'overig') return null;
  const bordId = `bord_${userId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48)}_${klant}`.slice(0, 80);
  return bordId.length >= 8 ? { soort: 'mcp-koppeling', id: bordId } : null;
}

/**
 * Nieuwe /mcp OAuth-verbinding: had de gebruiker op de site («Доступ ШІ», bord:<klant>) al expliciet scopes gezet,
 * kopieer die keuze naar de nieuwe grant (zonder gevoelige scopes op een technische verbinding); anders `geefStandaard`.
 */
export async function geefVoorNieuweKoppeling(userId: string, grantId: string, klant: string, ruimte: AiRuimte): Promise<void> {
  const doel: Onderwerp = { soort: 'mcp-koppeling', id: grantId };
  const bord = bordOnderwerp(userId, klant);
  if (bord) {
    const { rows } = await q('SELECT scopes FROM app.ai_toegang WHERE soort = $1 AND onderwerp_id = $2', [bord.soort, bord.id]);
    if (rows[0] && Array.isArray(rows[0].scopes)) {
      const technisch = ruimteOf(ruimte) === 'technisch';
      const lijst = (rows[0].scopes as unknown[]).filter(isToegangScope).filter((s) => !(technisch && toegangScope(s)?.gevoelig));
      await q(
        `INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes)
         VALUES ($1, $2, $3, $4::text[]) ON CONFLICT (soort, onderwerp_id) DO NOTHING`,
        [userId, doel.soort, doel.id, [...new Set(lijst)]],
      );
      return;
    }
  }
  await geefStandaard(userId, doel, ruimte);
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
