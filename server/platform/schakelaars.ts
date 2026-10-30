// Stand van de beschermingen die de eigenaar op de site aan/uit zet (migratie 0066, backend/beveiliging-schakelaars.ts).
// Snel en synchroon voor het hete pad (elk verzoek): de stand staat in het geheugen en wordt hoogstens elke 5 s op de achtergrond
// uit app.beveiliging_schakelaars ververst. Wie schakelt (zelfde proces), werkt het geheugen meteen bij — dus zonder herstart.
// Voorrang: omgevingsvariabele (AUTH_POORT_AFDWINGEN / OPA_AFDWINGEN = '1' of '0') > root-bestand (alleen OPA, backend/beleid.ts)
// > deze tabel. Database onbereikbaar → laatst bekende stand (begin: uit).
import { getPool } from './pg';

export type SchakelaarSleutel = 'auth-poort' | 'opa-afdwingen' | 'rls';
export const SCHAKELAARS: readonly SchakelaarSleutel[] = ['auth-poort', 'opa-afdwingen', 'rls'];
export const isSchakelaar = (v: unknown): v is SchakelaarSleutel => typeof v === 'string' && (SCHAKELAARS as readonly string[]).includes(v);
const ENV: Partial<Record<SchakelaarSleutel, string>> = { 'auth-poort': 'AUTH_POORT_AFDWINGEN', 'opa-afdwingen': 'OPA_AFDWINGEN' };

/** 'aan' / 'uit' als de omgeving het vastzet, anders null. */
export function envGeforceerd(s: SchakelaarSleutel): 'aan' | 'uit' | null {
  const naam = ENV[s];
  const v = naam ? process.env[naam] : undefined;
  return v === '1' ? 'aan' : v === '0' ? 'uit' : null;
}

const stand: Record<SchakelaarSleutel, boolean> = { 'auth-poort': false, 'opa-afdwingen': false, rls: false };
let geldigTot = 0;
let bezig: Promise<void> | null = null;
const VERS_MS = 5_000;

export async function schakelaarsVerversen(): Promise<void> {
  if (bezig) return bezig;
  bezig = (async () => {
    try {
      const rows = (await getPool('systeem').query('SELECT sleutel, stand FROM app.beveiliging_schakelaars')).rows as Array<{ sleutel: string; stand: string }>;
      for (const r of rows) if (isSchakelaar(r.sleutel)) stand[r.sleutel] = r.stand === 'aan';
    } catch { /* tabel nog niet gemigreerd of database even weg: laatst bekende stand houden */ }
    geldigTot = Date.now() + VERS_MS;
  })().finally(() => { bezig = null; });
  return bezig;
}

/** Stand uit de tabel (zonder omgeving), synchroon; ververst op de achtergrond als die ouder is dan 5 s. */
export function schakelaarTabel(s: SchakelaarSleutel): boolean {
  if (Date.now() > geldigTot && !bezig && (process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL)) void schakelaarsVerversen();
  return stand[s];
}
/** Effectieve stand: omgeving gaat voor, anders de tabel. */
export function schakelaarAan(s: SchakelaarSleutel): boolean {
  const env = envGeforceerd(s);
  return env ? env === 'aan' : schakelaarTabel(s);
}
/** Na een eigen wijziging: meteen in het geheugen (geen 5 s wachten). */
export function schakelaarLokaal(s: SchakelaarSleutel, aan: boolean): void { stand[s] = aan; }
export const _schakelaarsReset = () => { for (const s of SCHAKELAARS) stand[s] = false; geldigTot = 0; };
