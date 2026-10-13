// Etap 5 (13.10.2026): RLS per groep van tabellen (migratie 0033) en de rootschakelaar (db-rollen-instellen.sh rls-groep).
// Toetst met de echte rollen: mijnruimte_app wordt alleen beperkt voor tabellen van een groep die 'aan' staat; de systeemrol niet;
// de systeemrol (= de site) kan de groepen niet schakelen; het script weigert 'aan' zolang de audit overtredingen telt.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('rls-groepen');
  if (!process.env.DATABASE_URL_APP || !process.env.DATABASE_URL_MIGRATIE) { check('rollen ontbreken (overgeslagen)', true); return einde(); }
  const sys = getPool('systeem'), mig = getPool('migratie'), app = getPool('app');
  const A = `rlsg-a-${randomUUID()}`, B = `rlsg-b-${randomUUID()}`;
  const pref = randomUUID(), meld = randomUUID();
  const alsApp = async <T>(user: string, f: (q: (sql: string, p?: unknown[]) => Promise<any>) => Promise<T>): Promise<T | string> => {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.user_id', $1, true), set_config('app.route', 'eenheid/rls-groepen', true)", [user]);
      const r = await f((sql, p) => c.query(sql, p));
      await c.query('COMMIT');
      return r;
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); return `FOUT:${(e as { code?: string }).code}`; } finally { c.release(); }
  };
  const zie = (user: string, id: string) => alsApp(user, async (q) => (await q('SELECT count(*)::int AS n FROM app.records WHERE id = $1', [id])).rows[0].n);
  const zet = (groep: string, stand: string) => mig.query('UPDATE app.rls_groepen SET afdwingen = $2 WHERE groep = $1', [groep, stand]);
  const globaal = (await sys.query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde;
  try {
    const groepen = (await sys.query('SELECT groep, afdwingen FROM app.rls_groepen ORDER BY volgorde')).rows;
    check('6 groepen van laag naar hoog risico, standaard alle «uit»', groepen.map((g) => g.groep).join() === 'voorkeuren,meldingen,mail,werkruimtes,verbindingen,identiteit' && groepen.every((g) => g.afdwingen === 'uit'), JSON.stringify(groepen));
    check('globale schakelaar staat uit (audit-modus) in deze omgeving', globaal === 'uit', String(globaal));
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1,$2,$3), ($4,$5,$6)', ['owner_ui_preferences_v1', pref, { ownerUserId: A }, 'site_notifications', meld, { recipientUserId: A }]);

    check('audit-modus: B ziet de rijen van A nog (niets afgedwongen)', (await zie(B, pref)) === 1 && (await zie(B, meld)) === 1);
    await zet('voorkeuren', 'aan');
    check('groep «voorkeuren» aan: B ziet de voorkeur van A niet meer', (await zie(B, pref)) === 0);
    check('… maar wel nog de melding (andere groep, nog audit)', (await zie(B, meld)) === 1);
    check('… en A ziet zijn eigen voorkeur', (await zie(A, pref)) === 1);
    const schrijf = await alsApp(B, async (q) => (await q('INSERT INTO app.records (tbl, id, data) VALUES ($1,$2,$3)', ['owner_ui_preferences_v1', randomUUID(), { ownerUserId: A }])).rowCount);
    check('… B kan geen voorkeur op naam van A schrijven (42501)', schrijf === 'FOUT:42501', String(schrijf));
    const wijzig = await alsApp(B, async (q) => (await q("UPDATE app.records SET data = data || '{\"x\":1}' WHERE id = $1", [pref])).rowCount);
    check('… B kan de voorkeur van A niet wijzigen (0 rijen)', wijzig === 0, String(wijzig));
    check('systeemrol ziet alles (BYPASSRLS, onveranderd)', (await sys.query('SELECT count(*)::int AS n FROM app.records WHERE id = ANY($1)', [[pref, meld]])).rows[0].n === 2);
    await zet('voorkeuren', 'uit');
    check('groep weer uit: terug naar audit-modus', (await zie(B, pref)) === 1);

    const sysSchakel = await sys.query("UPDATE app.rls_groepen SET afdwingen = 'aan' WHERE groep = 'mail'").then(() => 'ok', (e) => String(e.code));
    check('de site (systeemrol) kan geen groep schakelen', sysSchakel === '42501', sysSchakel);
    const appSchakel = await app.query("UPDATE app.rls_groepen SET afdwingen = 'aan' WHERE groep = 'mail'").then(() => 'ok', (e) => String(e.code));
    check('de app-rol ook niet', appSchakel === '42501', appSchakel);
    check('ongeldige stand geweigerd door de database', (await mig.query("UPDATE app.rls_groepen SET afdwingen = 'half' WHERE groep = 'mail'").then(() => 'ok', (e) => String(e.code))) === '23514');

    // ---------------------------------------------------------------- users-trigger volgt de groep «identiteit»
    const u = randomUUID();
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1,$2,$3)', ['users', u, { email: `rlsg-${u}@eenheid.test`, role: 'member', status: 'approved' }]);
    await zet('identiteit', 'aan');
    const rol = await alsApp(u, async (q) => (await q(`UPDATE app.records SET data = data || '{"role":"owner"}' WHERE id = $1`, [u])).rowCount);
    check('groep «identiteit» aan: eigen rol ophogen geweigerd door de trigger', rol === 'FOUT:42501', String(rol));
    await zet('identiteit', 'uit');
    await sys.query('DELETE FROM app.records WHERE id = $1', [u]);

    // ---------------------------------------------------------------- rootscript
    const d = mkdtempSync(join(tmpdir(), 'rlsg-'));
    const geheimen = join(d, 'geheimen.env');
    writeFileSync(geheimen, `DATABASE_URL=${process.env.DATABASE_URL_MIGRATIE}\n`);
    const url = new URL(String(process.env.DATABASE_URL_MIGRATIE));
    const env = { ...process.env, GEHEIMEN: geheimen, MIGRATIE_ENV: join(d, 'geen.env'), ZONDER_ROOT: '1', PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PSQL_POSTGRES: 'psql -X -q -v ON_ERROR_STOP=1' };
    const script = (...args: string[]) => { try { return { ok: true, uit: execFileSync('bash', ['deploy/db-rollen-instellen.sh', ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { const x = e as { stdout?: string; stderr?: string }; return { ok: false, uit: `${x.stdout || ''}${x.stderr || ''}` }; } };
    const lijst = script('rls-groepen');
    check('script: rls-groepen toont de stand per groep', lijst.ok && /voorkeuren \| uit/.test(lijst.uit) && /identiteit/.test(lijst.uit), lijst.uit.slice(0, 300));
    check('script: onbekende groep geweigerd', !script('rls-groep', 'onzin', 'aan').ok);
    check('script: ongeldige naam geweigerd (injectie)', !script('rls-groep', "x';drop", 'aan').ok && !script('rls-groep', 'mail', 'misschien').ok);
    await sys.query(`INSERT INTO app.rls_audit (route, tbl, actie, aantal) VALUES ('eenheid/rls-groepen', 'menu_tellers_v1', 'lezen', 2) ON CONFLICT (route, tbl, actie) DO UPDATE SET aantal = 2`);
    const geweigerd = script('rls-groep', 'voorkeuren', 'aan');
    check('script: «aan» geweigerd zolang de audit overtredingen telt', !geweigerd.ok && /порушень|overtredingen/.test(geweigerd.uit) && (await sys.query("SELECT afdwingen FROM app.rls_groepen WHERE groep='voorkeuren'")).rows[0].afdwingen === 'uit', geweigerd.uit.slice(0, 200));
    const geforceerd = (() => { try { return execFileSync('bash', ['deploy/db-rollen-instellen.sh', 'rls-groep', 'voorkeuren', 'aan'], { env: { ...env, FORCEER: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return ''; } })();
    check('script: FORCEER=1 zet toch aan (met melding)', /ВВІМКНЕНО|AFGEDWONGEN/.test(geforceerd) && (await sys.query("SELECT afdwingen FROM app.rls_groepen WHERE groep='voorkeuren'")).rows[0].afdwingen === 'aan');
    const uit = script('rls-groep', 'voorkeuren', 'uit');
    check('script: terug naar uit', uit.ok && (await sys.query("SELECT afdwingen FROM app.rls_groepen WHERE groep='voorkeuren'")).rows[0].afdwingen === 'uit');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await mig.query("UPDATE app.rls_groepen SET afdwingen = 'uit'").catch(() => undefined);
    await sys.query("DELETE FROM app.rls_audit WHERE route = 'eenheid/rls-groepen'").catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [[pref, meld]]).catch(() => undefined);
  }
  return einde();
}
