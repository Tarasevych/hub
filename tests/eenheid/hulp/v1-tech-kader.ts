// Допоміжна обгортка для історичних модульних випробувань спадкової гілки v1 технічних активацій (app.tech_activaties).
// Після міграції 0335 прапорець tech-ruimtes-v2 типово увімкнений «Для всіх»; щоб перевірити збережену спадкову гілку v1
// без втрати консолідованого стану бази даних, обгортка тимчасово переводить tech-ruimtes-v2 у вимкнений стан і гарантовано
// відновлює початковий рядок у блоці finally.
// Hulpfunctie voor historische eenheidstests van de behouden v1-activeringslaag (app.tech_activaties): zet tech-ruimtes-v2
// tijdelijk uit tijdens de v1-test en herstelt exact de oorspronkelijke rij in finally.

import { getPool } from '../../../server/platform/pg';
import { _vlagCacheLeeg } from '../../../backend/tech-ruimtes-kern';
import { _scheidingCacheLeeg } from '../../../backend/ruimte-sessie';

export async function beginV1TechKader(): Promise<() => Promise<void>> {
  const sys = getPool('systeem');
  const voor = (
    await sys.query<{ sleutel: string; aan: boolean; standaard: boolean; percentage: number; gebruikers: string[] }>(
      "SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel IN ('tech-ruimtes-v2', 'ruimtes-scheiding')",
    )
  ).rows;
  await sys.query(
    "UPDATE app.feature_flags SET aan = false, standaard = false, gebruikers = '{}' WHERE sleutel IN ('tech-ruimtes-v2', 'ruimtes-scheiding')",
  );
  _vlagCacheLeeg();
  _scheidingCacheLeeg();
  return async () => {
    for (const r of voor) {
      await sys
        .query(
          'UPDATE app.feature_flags SET aan = $1, standaard = $2, percentage = $3, gebruikers = $4 WHERE sleutel = $5',
          [r.aan, r.standaard, r.percentage, r.gebruikers, r.sleutel],
        )
        .catch(() => undefined);
    }
    _vlagCacheLeeg();
    _scheidingCacheLeeg();
  };
}

