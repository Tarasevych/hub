// AANMELD-PLAATSING v1 — opslag en beheer van de plaats van elke aanmeldmethode (tabel app.aanmeld_plaatsing, migratie 0203).
// Lezen: openbaar (het aanmeldscherm), alleen ids en plaatsen, geen geheimen. Schrijven: eigenaar/beheerder + verse
// toegangssleutel (poort 'beheer-instellingen' in routes.ts) + journaal. Захист від блокування: зберегти можна лише розміщення,
// у якому хоча б один робочий спосіб входу лишається видимим.
import { auditToevoegen } from '../../server/platform/audit';
import { sql } from './opslag';
import { publiekeConfig } from './inloggen';
import { plaatsingControleren, plaatsingNormaliseren, STANDAARD_PLAATSING, type MethodeId, type Plaatsing } from '../../shared/aanmeld-plaatsing/plaatsing';

let cache: { p: Plaatsing; tot: number } | null = null;
export const plaatsingCacheWissen = () => { cache = null; };

export async function plaatsingLezen(): Promise<Plaatsing> {
  if (cache && cache.tot > Date.now()) return cache.p;
  let p: Plaatsing = plaatsingNormaliseren(STANDAARD_PLAATSING);
  try {
    const [r] = await sql<{ plaatsing: unknown }>('SELECT plaatsing FROM app.aanmeld_plaatsing WHERE id = 1');
    if (r) p = plaatsingNormaliseren(r.plaatsing);
  } catch { /* tabel ontbreekt (migratie nog niet gedraaid) → standaard */ }
  cache = { p, tot: Date.now() + 15_000 };
  return p;
}

/** Methoden die NU een sessie kunnen geven. Google: altijd (de bestaande hoofdweg). Telegram: als de knop publiek zichtbaar is. */
export async function werkendeMethoden(): Promise<MethodeId[]> {
  const uit: MethodeId[] = ['google'];
  try { if ((await publiekeConfig()).zichtbaar) uit.push('telegram'); } catch { /* telegram telt dan niet mee */ }
  return uit;
}

export async function plaatsingOpslaan(door: string, ruw: unknown): Promise<{ plaatsing: Plaatsing }> {
  const p = plaatsingNormaliseren(ruw);
  const fouten = plaatsingControleren(p, await werkendeMethoden());
  const audit = (resultaat: string, details: Record<string, unknown>) =>
    auditToevoegen({ ownerId: door, actorId: door, action: 'aanmelden.plaatsing', type: 'admin', result: resultaat, details }).catch(() => undefined);
  if (fouten.length) { await audit('denied', { fouten }); throw new Error(fouten[0]); }
  const vorige = await plaatsingLezen();
  await sql(`INSERT INTO app.aanmeld_plaatsing (id, plaatsing, door, gewijzigd_op) VALUES (1, $1::jsonb, $2, now())
    ON CONFLICT (id) DO UPDATE SET plaatsing = EXCLUDED.plaatsing, door = EXCLUDED.door, gewijzigd_op = now()`, [JSON.stringify(p), door]);
  plaatsingCacheWissen();
  await audit('success', { vorige, nieuw: p });
  return { plaatsing: p };
}
