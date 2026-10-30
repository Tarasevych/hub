// Regressie 28.10.2026 (Pavlo: «Технічні модулі не завантажено» in de technische ruimte). Met tech-ruimtes-v2 is de activering een rij
// in app.tech_ruimte_sessies; de toegangssleutel voor /assets/tech/* moet daar ook aan kunnen hangen (migratie 0126).
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { TECH_ASSET_COOKIE } from '../../shared/tech-bundels';
import { _assetCacheLeeg, assetCookieVoor, assetToegestaan } from '../../backend/tech-bundels';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-bundels-ruimtes-v2');
  const pool = getPool('systeem');
  const uid = `eenheid-v2-${randomUUID()}`;
  try {
    const rij = (await pool.query(`INSERT INTO app.tech_ruimte_sessies (user_id, profiel_id, sessie_id, rollen, modus, reden, grens_op)
      VALUES ($1, 'tp-1', $2, ARRAY['eigenaar'], 'tot-technisch-einde', 'eenheidstest', now() + interval '1 day') RETURNING id`, [uid, randomUUID()])).rows[0];
    const id = String(rij.id);
    let kop: string | null = null, fout = '';
    try { kop = await assetCookieVoor('', { id, eind: Date.now() + 864e5 }, uid); } catch (e) { fout = (e as Error).message; }
    check('technische ruimtesessie: status geeft een toegangscookie (vroeger: INSERT-fout op de verwijzing → geen cookie)', !!kop && kop.startsWith(`${TECH_ASSET_COOKIE}=`) && !fout, fout || String(kop));
    const cookie = kop ? kop.split(';')[0] : '';
    _assetCacheLeeg();
    check('met die cookie mag /assets/tech/ laden', await assetToegestaan(cookie, Date.now(), true));
    check('dezelfde cookie opnieuw: geen nieuwe sleutel', (await assetCookieVoor(cookie, { id, eind: Date.now() + 864e5 }, uid)) === null);
    await pool.query(`UPDATE app.tech_ruimte_sessies SET beeindigd_op = now(), beeindigd_reden = 'eenheidstest' WHERE id = $1`, [id]);
    _assetCacheLeeg();
    check('na het beëindigen van de technische ruimte: dicht', !(await assetToegestaan(cookie, Date.now(), true)));
    check('en status wist dan de cookie', ((await assetCookieVoor(cookie, null, uid)) || '').includes('Max-Age=0'));
  } finally {
    await pool.query('DELETE FROM app.tech_asset_toegang WHERE user_id = $1', [uid]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1', [uid]).catch(() => undefined);
  }
  return einde();
}
