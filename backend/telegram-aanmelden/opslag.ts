// TELEGRAM-AANMELDEN v1 — databasetoegang (systeemrol; zie migratie 0202) en de gedeelde, gecachete instellingen en vlag.
import { getPool } from '../../server/platform/pg';
import { TELEGRAM_VLAG, instellingenNormaliseren, type TelegramInstellingen, type KoppelRecht, type KoppelStand, type Vingerafdruk } from '../../shared/telegram-aanmelden/model';
import { INGEBOUWDE_ACTIES, isKeuze, type ActieSoort } from '../../shared/telegram-aanmelden/beleid';

export const sql = async <T = Record<string, any>>(tekst: string, waarden: unknown[] = []): Promise<T[]> => // eslint-disable-line @typescript-eslint/no-explicit-any
  (await getPool('systeem').query(tekst, waarden)).rows as T[];

/** Atomisch: alles of niets (punt A.3). */
export async function transactie<T>(fn: (q: <R = Record<string, any>>(tekst: string, waarden?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = await getPool('systeem').connect();
  try {
    await client.query('BEGIN');
    const uit = await fn(async (tekst, waarden = []) => (await client.query(tekst, waarden)).rows);
    await client.query('COMMIT');
    return uit;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally { client.release(); }
}

// ------------------------------------------------------------------------------------------------ vlag
type Vlag = { sleutel: string; omschrijving: string; aan: boolean; standaard: boolean; percentage: number; gebruikers: string[] };
let vlagCache: { vlag: Vlag | null; tot: number } | null = null;
export const vlagCacheWissen = (): void => { vlagCache = null; };
async function vlagRij(): Promise<Vlag | null> {
  if (vlagCache && vlagCache.tot > Date.now()) return vlagCache.vlag;
  let vlag: Vlag | null = null;
  try {
    const [r] = await sql('SELECT * FROM app.feature_flags WHERE sleutel = $1', [TELEGRAM_VLAG]);
    vlag = r ? { sleutel: String(r.sleutel), omschrijving: '', aan: r.aan === true, standaard: r.standaard === true, percentage: Number(r.percentage) || 0, gebruikers: Array.isArray(r.gebruikers) ? r.gebruikers.map(String) : [] } : null;
  } catch { vlag = null; }
  vlagCache = { vlag, tot: Date.now() + 15_000 };
  return vlag;
}
/** Hoofdschakelaar van de vlag (voor stromen zónder bekende gebruiker: webhook, aanmeldscherm). */
export async function vlagHoofdschakelaar(): Promise<boolean> { return (await vlagRij())?.aan === true; }
/**
 * Waarde voor één gebruiker. Een vlag is nooit een recht (tests/eenheid/vlaggen.test.ts): dit bestand importeert backend/vlaggen
 * NIET; backend/index.ts geeft de beoordelaar mee (flagsBerekenen — procent-uitrol, lijsten en tests, dezelfde regels als overal).
 * Geen beoordelaar geregistreerd = UIT.
 */
let beoordelaar: ((userId: string) => Promise<boolean>) | null = null;
export const registreerVlagBeoordelaar = (f: ((userId: string) => Promise<boolean>) | null): void => { beoordelaar = f; };
export async function vlagVoor(userId: string): Promise<boolean> {
  if (!beoordelaar || !userId) return false;
  try { return (await beoordelaar(userId)) === true; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ instellingen
let instCache: { waarde: TelegramInstellingen; tot: number } | null = null;
export const instellingenCacheWissen = (): void => { instCache = null; };
export async function instellingen(): Promise<TelegramInstellingen> {
  if (instCache && instCache.tot > Date.now()) return instCache.waarde;
  const [r] = await sql<{ waarde: unknown }>("SELECT waarde FROM app.tg_instellingen WHERE id = 'actief'").catch(() => []);
  const waarde = instellingenNormaliseren(r?.waarde ?? {});
  instCache = { waarde, tot: Date.now() + 10_000 };
  return waarde;
}

// ------------------------------------------------------------------------------------------------ handelingen (register)
export async function actieSoorten(): Promise<ActieSoort[]> {
  const eigen = await sql<{ sleutel: string; naam_uk: string; naam_nl: string; minimum: string; standaard: string; gevoelig: boolean }>('SELECT * FROM app.tg_acties ORDER BY sleutel').catch(() => []);
  const ingebouwd = new Set(INGEBOUWDE_ACTIES.map((a) => a.sleutel));
  return [
    ...INGEBOUWDE_ACTIES,
    ...eigen.filter((r) => !ingebouwd.has(r.sleutel) && isKeuze(r.minimum) && isKeuze(r.standaard)).map((r) => ({
      sleutel: r.sleutel, naam: [r.naam_uk, r.naam_nl] as const, minimum: r.minimum as ActieSoort['minimum'], standaard: r.standaard as ActieSoort['standaard'], gevoelig: r.gevoelig === true, ingebouwd: false,
    })),
  ];
}

// ------------------------------------------------------------------------------------------------ koppelingen
export type KoppelRij = {
  id: string; user_id: string; telegram_id: string; chat_id: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string;
  foto_id: string; naam: string; rechten: KoppelRecht[]; stand: KoppelStand; kleur: number; site_taal: 'uk' | 'nl'; aangemaakt_op: Date; laatst_gebruikt_op: Date | null; reden: string;
};
export const vingerafdrukVan = (r: KoppelRij): Vingerafdruk => ({ telegramId: r.telegram_id, telefoon: r.telefoon, gebruikersnaam: r.gebruikersnaam, voornaam: r.voornaam, achternaam: r.achternaam, fotoId: r.foto_id });
export const koppelingenVanGebruiker = (userId: string): Promise<KoppelRij[]> =>
  sql<KoppelRij>("SELECT * FROM app.tg_koppelingen WHERE user_id = $1 AND stand <> 'uitgeschakeld' ORDER BY aangemaakt_op", [userId]);
export const koppelingenVanTelegram = (telegramId: string): Promise<KoppelRij[]> =>
  sql<KoppelRij>("SELECT * FROM app.tg_koppelingen WHERE telegram_id = $1 AND stand <> 'uitgeschakeld' ORDER BY aangemaakt_op", [telegramId]);
export const koppeling = async (id: string): Promise<KoppelRij | null> =>
  (await sql<KoppelRij>('SELECT * FROM app.tg_koppelingen WHERE id::text = $1', [id]))[0] ?? null;

/** Stand van een koppeling zetten; uitschakelen legt tijd en reden vast. */
export async function standZetten(id: string, stand: KoppelStand, reden = ''): Promise<void> {
  await sql(`UPDATE app.tg_koppelingen SET stand = $2, reden = CASE WHEN $3 = '' THEN reden ELSE $3 END,
    uitgeschakeld_op = CASE WHEN $2 = 'uitgeschakeld' THEN now() ELSE uitgeschakeld_op END WHERE id::text = $1`, [id, stand, reden.slice(0, 80)]);
}

// ------------------------------------------------------------------------------------------------ gebeurtenissen (cijfers)
export async function gebeurtenis(soort: string, ok: boolean, userId: string | null = null): Promise<void> {
  await sql('INSERT INTO app.tg_gebeurtenissen (soort, ok, user_id) VALUES ($1,$2,$3)', [soort, ok, userId]).catch(() => undefined);
}

/** Eenmaligheid van een handtekening (widget, initData): true = eerste keer gezien. */
export async function eenmaligClaimen(hash: string): Promise<boolean> {
  const r = await sql('INSERT INTO app.tg_eenmalig (hash) VALUES ($1) ON CONFLICT DO NOTHING RETURNING hash', [hash]);
  return r.length === 1;
}
