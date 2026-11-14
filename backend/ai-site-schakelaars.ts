// Стеля доступності ШІ для приватного простору (shared/ai-agent-bord.ts, міграція 0043).
// Читання й запис лише системною роллю. Немає таблиці (міграцію ще не застосовано) = усе увімкнено,
// як до цієї стелі. Явний рядок aan=false відмовляє кожному приватному користувачеві.
import { getPool } from '../server/platform/pg';
import {
  STANDAARD_STAAT, isBordKlant, isPriveCap, isSiteSleutel, staatVanRijen,
  type BordKlantId, type SiteStaat,
} from '../shared/ai-agent-bord';

const q = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);

let cache: { at: number; staat: SiteStaat } | null = null;
const VERS = 5_000;
/** SEC-002 (ai-mcp-13): zo lang mag bij een leesfout de laatste geslaagde stand nog gelden; daarna weigeren. */
const NOODVENSTER = 5 * 60_000;
const capsCache = new Map<string, { at: number; caps: GebruikerCaps }>();
/** Alleen «relation … does not exist» (42P01) voor de eigen tabellen: dan geldt het oude gedrag (alles aan). */
const isOntbrekend = (err: unknown): boolean => (err as { code?: string })?.code === '42P01' || (err instanceof Error && /relation "app\.ai_(?:site_schakelaars|gebruiker_caps)" does not exist/.test(err.message));

export function vergeetStaat(): void { cache = null; }

/** Стеля сайту. Помилка читання (немає таблиці) = стандарт: нічого не вимкнено. */
export async function leesStaat(): Promise<SiteStaat> {
  if (cache && Date.now() - cache.at < VERS) return cache.staat;
  try {
    const { rows } = await q('SELECT sleutel, aan FROM app.ai_site_schakelaars');
    const staat = staatVanRijen(rows as { sleutel: string; aan: boolean }[]);
    cache = { at: Date.now(), staat };
    return staat;
  } catch (err) {
    // SEC-002 (ai-mcp-13): alleen «tabel ontbreekt» (migratie nog niet gedraaid) = standaard. Elke andere fout (time-out, volle pool,
    // verbroken verbinding) opende vroeger stil alle schakelaars; nu de laatste geslaagde stand als die vers genoeg is, anders weigeren.
    if (isOntbrekend(err)) return STANDAARD_STAAT;
    if (cache && Date.now() - cache.at < NOODVENSTER) return cache.staat;
    throw new Error('CAP_ONBEKEND');
  }
}

export async function zetStaat(sleutel: string, aan: boolean, door: string): Promise<SiteStaat> {
  if (!isSiteSleutel(sleutel)) throw new Error('SLEUTEL_ONGELDIG');
  await q(
    `INSERT INTO app.ai_site_schakelaars (sleutel, aan, gewijzigd_door, gewijzigd_op)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (sleutel) DO UPDATE SET aan = EXCLUDED.aan, gewijzigd_door = EXCLUDED.gewijzigd_door, gewijzigd_op = now()`,
    [sleutel, aan, door.slice(0, 120)],
  );
  cache = null;
  return leesStaat();
}

export type GebruikerCaps = Partial<Record<BordKlantId, Partial<Record<string, boolean>>>>;

export async function leesGebruikerCaps(userId: string): Promise<GebruikerCaps> {
  try {
    const { rows } = await q('SELECT klant, cap, aan FROM app.ai_gebruiker_caps WHERE user_id = $1', [userId]);
    const uit: GebruikerCaps = {};
    for (const rij of rows as { klant: string; cap: string; aan: boolean }[]) {
      if (!isBordKlant(rij.klant) || !isPriveCap(rij.cap) || typeof rij.aan !== 'boolean') continue;
      (uit[rij.klant] ??= {})[rij.cap] = rij.aan;
    }
    capsCache.set(userId, { at: Date.now(), caps: uit });
    if (capsCache.size > 2000) capsCache.delete(capsCache.keys().next().value as string);
    return uit;
  } catch (err) {
    // SEC-002 (ai-mcp-13): zie leesStaat — alleen een ontbrekende tabel betekent «niets uitgezet».
    if (isOntbrekend(err)) return {};
    const laatst = capsCache.get(userId);
    if (laatst && Date.now() - laatst.at < NOODVENSTER) return laatst.caps;
    throw new Error('CAP_ONBEKEND');
  }
}

export async function zetGebruikerCap(userId: string, klant: BordKlantId, cap: string, aan: boolean): Promise<void> {
  if (!isBordKlant(klant) || !isPriveCap(cap)) throw new Error('CAP_TECHNISCH');
  await q(
    `INSERT INTO app.ai_gebruiker_caps (user_id, klant, cap, aan, gewijzigd_op)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, klant, cap) DO UPDATE SET aan = EXCLUDED.aan, gewijzigd_op = now()`,
    [userId, klant, cap, aan],
  );
}
