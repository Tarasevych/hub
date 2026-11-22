// MAIL-TEKST-UTF8-TERUGVAL v1 — vlag `mail-tekst-utf8-terugval-v1` (standaard UIT, migratie 0307).
// Het decoderen van een briefdeel (backend/mail-tekst-normalisatie.ts) is synchroon en kent geen gebruiker; daarom leest dit
// bestand de ALGEMENE stand van de vlag (kolom `aan`) bij de start en daarna elke minuut, en zet de schakelaar in het
// normalisatiebestand. Geen rij (migratie niet toegepast), een fout of een gearchiveerde vlag = UIT = precies het oude gedrag.
// Укр.: прапорець читається для всього сервера (не для окремої людини), раз на хвилину; помилка = вимкнено.
import { getPool } from '../server/platform/pg';
import { zetMailUtf8Terugval } from './mail-tekst-normalisatie';

export const MAIL_UTF8_TERUGVAL_VLAG = 'mail-tekst-utf8-terugval-v1';

let lezer: () => Promise<boolean> = async () => {
  try {
    const { rows } = await getPool('systeem').query('SELECT aan FROM app.feature_flags WHERE sleutel = $1 AND gearchiveerd_op IS NULL', [MAIL_UTF8_TERUGVAL_VLAG]);
    return (rows[0] as { aan?: boolean } | undefined)?.aan === true;
  } catch { return false; }
};

/** Alleen voor tests: een eigen lezer van de vlag. */
export function zetMailUtf8VlagLezer(f: (() => Promise<boolean>) | null): void {
  if (f) lezer = f;
}

/** Eén ronde: vlag lezen en de schakelaar zetten. Faalt nooit. */
export async function mailUtf8TerugvalVerversen(): Promise<boolean> {
  let aan = false;
  try { aan = (await lezer()) === true; } catch { aan = false; }
  zetMailUtf8Terugval(aan);
  return aan;
}

let gestart = false;
/** Bij de start van de server (server/start.ts): meteen lezen en daarna elke minuut. */
export function startMailUtf8TerugvalVlag(intervalMs = 60_000): void {
  if (gestart) return;
  gestart = true;
  void mailUtf8TerugvalVerversen();
  setInterval(() => { void mailUtf8TerugvalVerversen(); }, intervalMs).unref();
}
