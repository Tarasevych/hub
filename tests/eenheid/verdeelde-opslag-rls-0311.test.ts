// Модульне та базове випробування CONSOL-001 (Потік 01, 22.11.2026):
// закриття прогалини прав доступу міграції 0306 у файлі 0311_verdeelde_opslag_rls_herstel.sql
// та звірка явних прав для 0300, 0304, 0306/0311 і 0310 у migrations/rechten.sql.
// Eenheids- en databanktest voor 0311_verdeelde_opslag_rls_herstel.sql en rechten.sql (CONSOL-001).
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sqlRechtenVlaggen } from '../../backend/uitrol-risico';
import { SQL_RISICO } from '../../backend/uitrol-voorcontrole';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('verdeelde-opslag-rls-0311');

  const pad0311 = resolve('migrations/0311_verdeelde_opslag_rls_herstel.sql');
  const padRechten = resolve('migrations/rechten.sql');
  check('0311: файл міграції наявний', existsSync(pad0311));
  const sql0311 = readFileSync(pad0311, 'utf8');
  const sqlRechten = readFileSync(padRechten, 'utf8');

  check('0311: закінчення рядків LF і позначка CONSOL-001', !sql0311.includes('\r') && sql0311.includes('CONSOL-001'));
  check(
    '0311: ENABLE + FORCE ROW LEVEL SECURITY для обох таблиць розподіленого зберігання',
    /ALTER\s+TABLE\s+app\.verdeelde_opslag_knopen\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i.test(sql0311)
      && /ALTER\s+TABLE\s+app\.verdeelde_opslag_knopen\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/i.test(sql0311)
      && /ALTER\s+TABLE\s+app\.verdeelde_opslag_rotaties\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i.test(sql0311)
      && /ALTER\s+TABLE\s+app\.verdeelde_opslag_rotaties\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/i.test(sql0311),
  );
  check(
    '0311: політика рядкового захисту перевіряє gebruiker_id = app.huidige_gebruiker()',
    /CREATE\s+POLICY\s+verdeelde_opslag_knopen_eigen\s+ON\s+app\.verdeelde_opslag_knopen[\s\S]*?gebruiker_id\s*=\s*app\.huidige_gebruiker\(\)/i.test(sql0311)
      && /CREATE\s+POLICY\s+verdeelde_opslag_rotaties_eigen\s+ON\s+app\.verdeelde_opslag_rotaties[\s\S]*?gebruiker_id\s*=\s*app\.huidige_gebruiker\(\)/i.test(sql0311),
  );
  check(
    '0311: REVOKE ALL у mijnruimte_app та GRANT табличних прав у mijnruimte_system',
    /REVOKE\s+ALL\s+ON\s+app\.verdeelde_opslag_knopen\s*,\s*app\.verdeelde_opslag_rotaties\s+FROM\s+mijnruimte_app\s*;/i.test(sql0311)
      && /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+app\.verdeelde_opslag_knopen\s*,\s*app\.verdeelde_opslag_rotaties\s+TO\s+mijnruimte_system\s*;/i.test(sql0311),
  );

  const rechtenVlaggen = sqlRechtenVlaggen('0311_verdeelde_opslag_rls_herstel.sql', sql0311);
  const risicoTreffers = SQL_RISICO.filter(([re]) => re.test(sql0311)).map(([, uk]) => uk);
  check('0311: нуль червоних прапорців sqlRechtenVlaggen та SQL_RISICO', rechtenVlaggen.length === 0 && risicoTreffers.length === 0, [...rechtenVlaggen, ...risicoTreffers].join('; '));

  check(
    'rechten.sql: явні REVOKE ALL у mijnruimte_app для 0300, 0304 та 0306/0311',
    /REVOKE\s+ALL\s+ON\s+app\.merk_gebruiker\s+FROM\s+mijnruimte_app\s*;/i.test(sqlRechten)
      && /REVOKE\s+ALL\s+ON\s+app\.uitrol_beheer_sleutels\s+FROM\s+mijnruimte_app\s*;/i.test(sqlRechten)
      && /REVOKE\s+ALL\s+ON\s+app\.uitrol_release_wijzigingen\s+FROM\s+mijnruimte_app\s*;/i.test(sqlRechten)
      && /REVOKE\s+ALL\s+ON\s+app\.verdeelde_opslag_knopen\s*,\s*app\.verdeelde_opslag_rotaties\s+FROM\s+mijnruimte_app\s*;/i.test(sqlRechten),
  );
  check(
    'rechten.sql: явний GRANT для app.klantrelatieboek у mijnruimte_app та mijnruimte_system',
    /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+app\.klantrelatieboek\s+TO\s+mijnruimte_app\s*;/i.test(sqlRechten)
      && /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+app\.klantrelatieboek\s+TO\s+mijnruimte_system\s*;/i.test(sqlRechten),
  );

  if (appRolActief()) {
    const sys = getPool('systeem');
    const appPool = getPool('app');
    const proefGebruiker = `consol001-${randomUUID()}`;
    const knoopId = randomUUID();
    const rotatieId = randomUUID();
    try {
      const rlsRijen = await sys.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'app'
           AND c.relname IN ('verdeelde_opslag_knopen', 'verdeelde_opslag_rotaties')
         ORDER BY c.relname`,
      );
      check(
        'БД: обидві таблиці мають relrowsecurity = true та relforcerowsecurity = true',
        rlsRijen.rows.length === 2 && rlsRijen.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
        JSON.stringify(rlsRijen.rows),
      );

      await sys.query(
        `INSERT INTO app.verdeelde_opslag_knopen (id, gebruiker_id, naam, land_code, platform, soort, status)
         VALUES ($1, $2, 'Перевірковий вузол', 'NL', 'eigen-vm', 'eigen-server', 'gezond')`,
        [knoopId, proefGebruiker],
      );
      await sys.query(
        `INSERT INTO app.verdeelde_opslag_rotaties (id, gebruiker_id, soort, aantal_delen, drempel_k, geslaagd, samenvatting)
         VALUES ($1, $2, 'controle', 5, 3, true, 'Перевірка CONSOL-001')`,
        [rotatieId, proefGebruiker],
      );
      const sysAantal = Number(
        (await sys.query('SELECT count(*)::int AS n FROM app.verdeelde_opslag_knopen WHERE id = $1', [knoopId])).rows[0]?.n ?? 0,
      );
      check('БД: системна роль mijnruimte_system читає та записує вузли й перерозподіли', sysAantal === 1);

      const verwachtWeigering = async (sqlTekst: string, params: unknown[] = []): Promise<string> => {
        try {
          await appPool.query(sqlTekst, params);
          return 'БЕЗ_ПОМИЛКИ';
        } catch (fout) {
          return String((fout as { code?: string })?.code || fout);
        }
      };

      const weigeringen: Array<[string, string]> = [
        ['SELECT verdeelde_opslag_knopen', await verwachtWeigering('SELECT 1 FROM app.verdeelde_opslag_knopen LIMIT 1')],
        [
          'INSERT verdeelde_opslag_knopen',
          await verwachtWeigering(
            `INSERT INTO app.verdeelde_opslag_knopen (gebruiker_id, naam, land_code, platform, soort)
             VALUES ($1, 'Спроба', 'UA', 'proef', 's3')`,
            [proefGebruiker],
          ),
        ],
        ['SELECT verdeelde_opslag_rotaties', await verwachtWeigering('SELECT 1 FROM app.verdeelde_opslag_rotaties LIMIT 1')],
        [
          'INSERT verdeelde_opslag_rotaties',
          await verwachtWeigering(
            `INSERT INTO app.verdeelde_opslag_rotaties (gebruiker_id, soort, aantal_delen, drempel_k)
             VALUES ($1, 'controle', 3, 2)`,
            [proefGebruiker],
          ),
        ],
        ['SELECT merk_gebruiker', await verwachtWeigering('SELECT 1 FROM app.merk_gebruiker LIMIT 1')],
        ['SELECT uitrol_beheer_sleutels', await verwachtWeigering('SELECT 1 FROM app.uitrol_beheer_sleutels LIMIT 1')],
        ['SELECT uitrol_release_wijzigingen', await verwachtWeigering('SELECT 1 FROM app.uitrol_release_wijzigingen LIMIT 1')],
      ];
      check(
        'БД: роль mijnruimte_app отримує відмову прав доступу 42501 на всіх 5 адміністративних таблицях',
        weigeringen.every(([, code]) => code === '42501'),
        weigeringen.map(([naam, code]) => `${naam}=${code}`).join(', '),
      );

      const heeftKlantboek = Boolean(
        (await sys.query("SELECT to_regclass('app.klantrelatieboek') AS reg")).rows[0]?.reg,
      );
      if (heeftKlantboek) {
        const gebA = `consol-a-${randomUUID()}`;
        const gebB = `consol-b-${randomUUID()}`;
        const rijId = randomUUID();
        const client = await appPool.connect();
        try {
          await sys.query(
            `INSERT INTO app.klantrelatieboek (gebruiker, ruimte, id, soort, inhoud)
             VALUES ($1, 'prive', $2, 'klant', 'versleuteld-proefblok')`,
            [gebA, rijId],
          );
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'prive', true)", [gebB]);
          const zietB = Number(
            (await client.query('SELECT count(*)::int AS n FROM app.klantrelatieboek WHERE id = $1', [rijId])).rows[0]?.n ?? -1,
          );
          await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'technisch', true)", [gebA]);
          const zietTech = Number(
            (await client.query('SELECT count(*)::int AS n FROM app.klantrelatieboek WHERE id = $1', [rijId])).rows[0]?.n ?? -1,
          );
          await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'prive', true)", [gebA]);
          const zietEigen = Number(
            (await client.query('SELECT count(*)::int AS n FROM app.klantrelatieboek WHERE id = $1', [rijId])).rows[0]?.n ?? -1,
          );
          await client.query('COMMIT');
          check(
            'БД: у app.klantrelatieboek користувач B та інший простір бачать 0 чужих рядків, власник бачить свій',
            zietB === 0 && zietTech === 0 && zietEigen === 1,
            `zietB=${zietB} zietTech=${zietTech} zietEigen=${zietEigen}`,
          );
        } finally {
          client.release();
          await sys.query('DELETE FROM app.klantrelatieboek WHERE id = $1', [rijId]).catch(() => undefined);
        }
      }
    } finally {
      await sys.query('DELETE FROM app.verdeelde_opslag_knopen WHERE id = $1', [knoopId]).catch(() => undefined);
      await sys.query('DELETE FROM app.verdeelde_opslag_rotaties WHERE id = $1', [rotatieId]).catch(() => undefined);
      await closePool().catch(() => undefined);
    }
  }

  return einde();
}
