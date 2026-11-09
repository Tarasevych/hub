// APPARAAT-001 — databasetoegang (systeemrol, zie migratie 0204) en de gecachete instellingen, voorkeuren en vlag.
// Zelfde opzet als backend/telegram-aanmelden/opslag.ts: de vlag is nooit een recht; backend/index.ts geeft de beoordelaar mee.
import { getPool } from '../../server/platform/pg';
import { APPARAAT_VLAG, instellingenNormaliseren, voorkeurenNormaliseren, type ApparaatInstellingen, type ApparaatVoorkeuren } from '../../shared/apparaat-bevestiging/model';

export const sql = async <T = Record<string, any>>(tekst: string, waarden: unknown[] = []): Promise<T[]> => // eslint-disable-line @typescript-eslint/no-explicit-any
  (await getPool('systeem').query(tekst, waarden)).rows as T[];

// ------------------------------------------------------------------------------------------------ vlag
let beoordelaar: ((userId: string) => Promise<boolean>) | null = null;
export const registreerVlagBeoordelaar = (f: ((userId: string) => Promise<boolean>) | null): void => { beoordelaar = f; };
/** Vlag `apparaat-bevestiging-v1` voor één gebruiker; geen beoordelaar geregistreerd (tests) = AAN als de rij het zegt, anders uit. */
export async function vlagVoor(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (beoordelaar) { try { return (await beoordelaar(userId)) === true; } catch { return false; } }
  try {
    const [r] = await sql<{ aan: boolean; standaard: boolean }>('SELECT aan, standaard FROM app.feature_flags WHERE sleutel = $1', [APPARAAT_VLAG]);
    return !!r && r.aan === true && r.standaard === true;
  } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ instellingen (beheerder)
let instCache: { waarde: ApparaatInstellingen; tot: number } | null = null;
export const instellingenCacheWissen = (): void => { instCache = null; };
export async function instellingen(): Promise<ApparaatInstellingen> {
  if (instCache && instCache.tot > Date.now()) return instCache.waarde;
  const [r] = await sql<{ waarde: unknown }>("SELECT waarde FROM app.apparaat_instellingen WHERE id = 'actief'").catch(() => []);
  const waarde = instellingenNormaliseren(r?.waarde ?? {});
  instCache = { waarde, tot: Date.now() + 10_000 };
  return waarde;
}
/** Opslaan met één stap «ongedaan maken» (de vorige waarde blijft bewaard). */
export async function instellingenOpslaan(door: string, invoer: unknown): Promise<ApparaatInstellingen> {
  const nieuw = instellingenNormaliseren(invoer);
  const [oud] = await sql<{ waarde: unknown }>("SELECT waarde FROM app.apparaat_instellingen WHERE id = 'actief'");
  if (oud) await sql("INSERT INTO app.apparaat_instellingen (id, waarde, door) VALUES ('vorige', $1, $2) ON CONFLICT (id) DO UPDATE SET waarde = EXCLUDED.waarde, door = EXCLUDED.door, gewijzigd_op = now()", [JSON.stringify(oud.waarde), door.slice(0, 80)]);
  await sql("INSERT INTO app.apparaat_instellingen (id, waarde, door) VALUES ('actief', $1, $2) ON CONFLICT (id) DO UPDATE SET waarde = EXCLUDED.waarde, door = EXCLUDED.door, gewijzigd_op = now()", [JSON.stringify(nieuw), door.slice(0, 80)]);
  instellingenCacheWissen();
  return nieuw;
}
export async function instellingenOngedaan(door: string): Promise<ApparaatInstellingen> {
  const [vorige] = await sql<{ waarde: unknown }>("SELECT waarde FROM app.apparaat_instellingen WHERE id = 'vorige'");
  if (!vorige) return instellingen();
  await sql("INSERT INTO app.apparaat_instellingen (id, waarde, door) VALUES ('actief', $1, $2) ON CONFLICT (id) DO UPDATE SET waarde = EXCLUDED.waarde, door = EXCLUDED.door, gewijzigd_op = now()", [JSON.stringify(instellingenNormaliseren(vorige.waarde)), door.slice(0, 80)]);
  await sql("DELETE FROM app.apparaat_instellingen WHERE id = 'vorige'");
  instellingenCacheWissen();
  return instellingen();
}

// ------------------------------------------------------------------------------------------------ voorkeuren (gebruiker) + teller
export type VoorkeurRij = { waarde: ApparaatVoorkeuren; mislukt: number; pauzeTot: Date | null; uitgeschakeld: boolean; reden: string };
export async function voorkeuren(userId: string): Promise<VoorkeurRij> {
  const [r] = await sql<{ waarde: unknown; mislukt: number; pauze_tot: Date | null; uitgeschakeld: boolean; reden: string }>('SELECT * FROM app.apparaat_voorkeuren WHERE user_id = $1', [userId]).catch(() => []);
  return { waarde: voorkeurenNormaliseren(r?.waarde ?? {}), mislukt: Number(r?.mislukt || 0), pauzeTot: r?.pauze_tot ?? null, uitgeschakeld: r?.uitgeschakeld === true, reden: String(r?.reden || '') };
}
export async function voorkeurenOpslaan(userId: string, invoer: unknown): Promise<ApparaatVoorkeuren> {
  const nieuw = voorkeurenNormaliseren(invoer);
  await sql('INSERT INTO app.apparaat_voorkeuren (user_id, waarde) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET waarde = EXCLUDED.waarde, gewijzigd_op = now()', [userId, JSON.stringify(nieuw)]);
  return nieuw;
}
/** Teller van verkeerde symbolen: +1, met pauze na `pauzeNa` en uit na `uitNa` (dezelfde regels als de geheime code). */
export async function misluktTellen(userId: string, inst: ApparaatInstellingen): Promise<{ mislukt: number; uitkomst: 'fout' | 'pauze' | 'uit' }> {
  const [na] = await sql<{ mislukt: number }>(`INSERT INTO app.apparaat_voorkeuren (user_id, waarde, mislukt) VALUES ($1, '{}'::jsonb, 1)
    ON CONFLICT (user_id) DO UPDATE SET mislukt = app.apparaat_voorkeuren.mislukt + 1, gewijzigd_op = now() RETURNING mislukt`, [userId]);
  const mislukt = Number(na?.mislukt || 0);
  if (mislukt >= inst.uitNa) {
    await sql("UPDATE app.apparaat_voorkeuren SET uitgeschakeld = true, reden = 'te-veel-pogingen' WHERE user_id = $1", [userId]);
    return { mislukt, uitkomst: 'uit' };
  }
  if (mislukt >= inst.pauzeNa && mislukt % inst.pauzeNa === 0) {
    await sql('UPDATE app.apparaat_voorkeuren SET pauze_tot = now() + make_interval(mins => $2) WHERE user_id = $1', [userId, inst.pauzeMinuten]);
    return { mislukt, uitkomst: 'pauze' };
  }
  return { mislukt, uitkomst: 'fout' };
}
export async function misluktWissen(userId: string): Promise<void> {
  await sql('UPDATE app.apparaat_voorkeuren SET mislukt = 0, pauze_tot = NULL WHERE user_id = $1', [userId]).catch(() => undefined);
}
/** Herstel na «uit» (alleen na een verse toegangssleutel op de site; de route controleert dat). */
export async function herstellen(userId: string): Promise<void> {
  await sql("UPDATE app.apparaat_voorkeuren SET mislukt = 0, pauze_tot = NULL, uitgeschakeld = false, reden = '' WHERE user_id = $1", [userId]);
}

// ------------------------------------------------------------------------------------------------ levende apparaten (andere browsers)
export type LevendApparaat = { anker: string; laatstGezien: number; dienst: string };
/**
 * Andere BROWSERS (ankersessies) van dit account die de site onlangs gebruikten. Een tabblad in dezelfde browser is geen ander
 * apparaat (dezelfde toegangssleutel ontbreekt daar net zo goed), daarom per anker één rij en het eigen anker eruit.
 * Leest de tabsessies rechtstreeks (systeemrol): ook bruikbaar buiten de router (snelle stroom).
 */
export async function levendeApparaten(userId: string, levendMinuten: number, behalveAnker = ''): Promise<LevendApparaat[]> {
  const sinds = Date.now() - Math.max(1, levendMinuten) * 60_000;
  const rijen = await sql<{ anker: string; laatst: string; dienst: string }>(`SELECT data->>'anchorSessionId' AS anker, max(data->>'lastSeenAt') AS laatst, max(data->>'service') AS dienst
    FROM app.records WHERE tbl = 'owner_tab_sessions_v1' AND data->>'userId' = $1 AND data->>'status' = 'active'
      AND coalesce(nullif(data->>'revokedAt','')::bigint, 0) = 0 AND (data->>'lastSeenAt')::bigint >= $2 AND (data->>'idleExpiresAt')::bigint > $3
    GROUP BY data->>'anchorSessionId'`, [userId, sinds, Date.now()]).catch(() => []);
  return rijen.filter((r) => r.anker && r.anker !== behalveAnker).map((r) => ({ anker: r.anker, laatstGezien: Number(r.laatst) || 0, dienst: String(r.dienst || '') }));
}
