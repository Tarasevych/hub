// UITROL-001 · Migratieproef op een WEGWERPKOPIE van het schema (nooit op de productiedatabase).
// UITROL-001 · Проба міграцій на ТИМЧАСОВІЙ копії схеми (ніколи не на робочій базі).
//
// Wordt alleen gestart door deploy/uitrol/mijn-ruimte-migratie-proef.sh (root) via systemd-run als de app-gebruiker. Root heeft vooraf
// een EENMALIGE rol en een database met dezelfde naam (mijnruimte_proef_<stempel>) aangemaakt en het schema van de productiedatabase
// erin gezet (pg_dump --schema-only --no-owner + app.schema_migrations); dit programma krijgt alleen PROEF_DATABASE_URL van die rol.
//
// SEC-002 (server-uitrol-04): vroeger draaide de SQL uit het pakket met DATABASE_URL_MIGRATIE (de gedeelde rol mijnruimte_migrator).
// Zo'n rol mag haar EIGEN wachtwoord en standaardinstellingen wijzigen (ALTER ROLE … PASSWORD / SET …); dat geldt voor het hele
// cluster en overleeft de wegwerpdatabase: alle volgende installaties vielen dan om in «databasemigraties», en wie het wachtwoord
// kende had de eigenaar van alle app-tabellen in handen. Daarom: alleen een eenmalige rol, hier nogmaals gecontroleerd op de
// verbinding zelf (naam, geen bijzondere rechten, lid van geen enkele rol) vóór er één regel SQL uit het pakket draait.
// Раніше SQL з архіву виконувався спільною роллю міграцій; тепер — лише одноразовою роллю, яку root видаляє після проби.
// Dit programma:
//   - gebruikt alleen PROEF_DATABASE_URL en weigert elke andere databasenaam en elke rol die niet eenmalig is (zelfde slot als server/rook.ts);
//   - voert de nieuwe migraties uit precies zoals server/migrate.ts (elk in een eigen transactie, simple protocol, geen psql-meta-
//     opdrachten), met statement_timeout en lock_timeout;
//   - stopt bij de eerste fout (zoals de echte migratie) en schrijft per migratie de duur en bij een fout de PostgreSQL-velden
//     (code, bericht, detail, hint, constraint, tabel, kolom, regel) + de definitie van de geschonden beperking naar --uit (JSON).
// Gebruik: PROEF_DB=mijnruimte_proef_x node dist-server/migratie-proef.mjs --map <map met NNNN_naam.sql> --uit <bestand.json>
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { MIGRATIE_NAAM, PROEF_DB_RE, fragmentRond, positieNaarRegel, regelVoorTabel, teLangeTekst, type MigratieProefUitslag } from '../shared/uitrol-vereisten';

/**
 * De migratie-URL naar de proefdatabase omgebogen; elke andere databasenaam wordt geweigerd. Geëxporteerd voor de test.
 * SEC-002: het programma zelf gebruikt deze functie niet meer (zie proefVerbinding: alleen de eenmalige rol); ze blijft voor
 * bestaande aanroepers die alleen de naamcontrole nodig hebben.
 */
export function proefUrl(env: Record<string, string | undefined>, proefDb: string): string {
  if (!PROEF_DB_RE.test(proefDb)) throw new Error(`PROEF_DB_ONGELDIG: «${proefDb}» (verwacht mijnruimte_proef_<stempel>)`);
  const ruw = env.DATABASE_URL_MIGRATIE || env.DATABASE_URL;
  if (!ruw) throw new Error('GEEN_DATABASE_URL');
  const u = new URL(ruw);
  u.pathname = `/${proefDb}`;
  if (u.pathname !== `/${proefDb}`) throw new Error('PROEF_DB_NIET_OMGEBOGEN');
  return u.toString();
}

/**
 * SEC-002: de verbinding van de proef. Alleen PROEF_DATABASE_URL telt (DATABASE_URL_MIGRATIE en DATABASE_URL worden hier NIET
 * meer gelezen); de rol in die URL moet de eenmalige rol zijn — zelfde naam als de wegwerpdatabase — en de database moet PROEF_DB zijn.
 * З’єднання проби: лише PROEF_DATABASE_URL з одноразовою роллю (назва ролі = назва тимчасової бази).
 */
export function proefVerbinding(env: Record<string, string | undefined>, proefDb: string): string {
  if (!PROEF_DB_RE.test(proefDb)) throw new Error(`PROEF_DB_ONGELDIG: «${proefDb}» (verwacht mijnruimte_proef_<stempel>)`);
  const ruw = env.PROEF_DATABASE_URL;
  if (!ruw) throw new Error('PROEF_ROL_NIET_EENMALIG: PROEF_DATABASE_URL ontbreekt (de proef draait alleen met de eenmalige rol van het root-script, nooit met de migratierol)');
  let u: URL;
  try { u = new URL(ruw); } catch { throw new Error('PROEF_URL_ONGELDIG'); }
  const rol = decodeURIComponent(u.username);
  if (rol !== proefDb) throw new Error(`PROEF_ROL_NIET_EENMALIG: rol «${rol.slice(0, 63)}» is niet de eenmalige rol van ${proefDb}`);
  if (u.pathname !== `/${proefDb}`) throw new Error('PROEF_DB_NIET_OMGEBOGEN');
  return u.toString();
}

/**
 * SEC-002: controle op de verbinding zelf, vóór er SQL uit het pakket draait. Een eenmalige rol heet mijnruimte_proef_<stempel>,
 * heeft geen bijzondere rechten en is lid van geen enkele rol; de database draagt dezelfde naam. Geeft de reden van een weigering.
 */
export function eenmaligeRolReden(r: { rol: string; db: string; superuser: boolean; createrole: boolean; createdb: boolean; bypassrls: boolean; replicatie: boolean; lidVan: number }): string | null {
  if (!PROEF_DB_RE.test(r.rol)) return `rol «${r.rol.slice(0, 63)}» is geen eenmalige proefrol`;
  if (r.db !== r.rol) return `database «${r.db.slice(0, 63)}» hoort niet bij rol «${r.rol}»`;
  if (r.superuser || r.createrole || r.createdb || r.bypassrls || r.replicatie) return `rol «${r.rol}» heeft bijzondere rechten`;
  if (r.lidVan > 0) return `rol «${r.rol}» is lid van een andere rol`;
  return null;
}

type PgFout = Error & { code?: string; detail?: string; hint?: string; constraint?: string; table?: string; column?: string; position?: string; where?: string };

export async function proefUitvoeren(opties: { url: string; map: string; tijdslimietMs?: number }): Promise<MigratieProefUitslag> {
  const uit: MigratieProefUitslag = { id: '', ok: true, status: 'klaar', tijd: new Date().toISOString(), stappen: [], migraties: [], log: [] };
  const zeg = (s: string) => { uit.log!.push(`${new Date().toISOString().slice(11, 23)} ${s}`); process.stderr.write(`[proef] ${s}\n`); };
  const client = new pg.Client({ connectionString: opties.url, application_name: 'mijn-ruimte-migratie-proef' });
  await client.connect();
  try {
    // SEC-002: eerst wie we zijn. Met de migratierol, de app-rol of een superuser draait hier niets.
    const wie = (await client.query(`SELECT r.rolname AS rol, current_database() AS db, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication,
        (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS lid FROM pg_roles r WHERE r.rolname = session_user`)).rows[0] as
      { rol?: string; db?: string; rolsuper?: boolean; rolcreaterole?: boolean; rolcreatedb?: boolean; rolbypassrls?: boolean; rolreplication?: boolean; lid?: number } | undefined;
    const reden = eenmaligeRolReden({ rol: String(wie?.rol || ''), db: String(wie?.db || ''), superuser: !!wie?.rolsuper, createrole: !!wie?.rolcreaterole, createdb: !!wie?.rolcreatedb,
      bypassrls: !!wie?.rolbypassrls, replicatie: !!wie?.rolreplication, lidVan: Number(wie?.lid || 0) });
    if (reden) throw new Error(`PROEF_ROL_NIET_EENMALIG: ${reden}`);
    uit.pg = String((await client.query('SHOW server_version')).rows[0]?.server_version || '');
    await client.query(`SET statement_timeout = ${Math.max(5000, Math.min(600_000, opties.tijdslimietMs ?? 120_000))}`);
    await client.query("SET lock_timeout = '10s'");
    await client.query('CREATE SCHEMA IF NOT EXISTS app');
    await client.query('CREATE TABLE IF NOT EXISTS app.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const gedaan = new Set((await client.query('SELECT version FROM app.schema_migrations')).rows.map((r) => String(r.version)));
    const bestanden = (await readdir(opties.map)).filter((f) => f.endsWith('.sql') && MIGRATIE_NAAM.test(f.slice(0, -4))).sort();
    zeg(`${gedaan.size} migraties al toegepast op de kopie; ${bestanden.length} aangeboden`);
    const t0 = Date.now();
    for (const f of bestanden) {
      const naam = f.slice(0, -4);
      if (gedaan.has(naam)) { zeg(`overgeslagen (al toegepast): ${naam}`); continue; }
      const sql = await readFile(path.join(opties.map, f), 'utf8');
      const start = Date.now();
      zeg(`start: ${naam}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO app.schema_migrations (version) VALUES ($1)', [naam]);
        await client.query('COMMIT');
        const ms = Date.now() - start;
        uit.migraties.push({ naam, ms, ok: true });
        zeg(`uitgevoerd: ${naam} (${ms} ms)`);
      } catch (e) {
        const err = e as PgFout;
        await client.query('ROLLBACK').catch(() => undefined);
        let definitie = '';
        if (err.constraint) {
          try { definitie = String((await client.query('SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = $1 LIMIT 1', [err.constraint])).rows[0]?.d || ''); } catch { /* geen definitie */ }
        }
        const teLang = teLangeTekst(sql, definitie);
        const regel = positieNaarRegel(sql, err.position) ?? regelUitWhere(err.where) ?? teLang?.regel ?? regelVoorTabel(sql, err.table);
        const ms = Date.now() - start;
        uit.migraties.push({ naam, ms, ok: false, fout: { code: String(err.code || ''), bericht: String(err.message || '').slice(0, 500), detail: err.detail?.slice(0, 500), hint: err.hint?.slice(0, 300),
          constraint: err.constraint, tabel: err.table, kolom: err.column, regel, definitie: definitie.slice(0, 300), fragment: fragmentRond(sql, regel), teLang: teLang ? { lengte: teLang.lengte, grens: teLang.grens } : null } });
        uit.ok = false; uit.status = 'mislukt'; uit.code = 'MIGRATIE_PROEF_MISLUKT';
        zeg(`FOUT in ${naam}${regel ? ` (regel ${regel})` : ''}: ${err.code || ''} ${err.message}`);
        break;
      }
    }
    uit.stappen.push({ id: 'migraties', ms: Date.now() - t0, ok: uit.ok });
  } finally {
    await client.end().catch(() => undefined);
  }
  return uit;
}

/** Bij een fout binnen een functie/DO-blok staat de regel soms alleen in «where» («… line 14 at SQL statement»). */
function regelUitWhere(where?: string): number | null {
  const m = /line (\d+)/.exec(String(where || ''));
  return m ? Number(m[1]) : null;
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return false; } })();
if (isMain) {
  const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? String(process.argv[i + 1] || '') : ''; };
  const map = arg('--map'), doel = arg('--uit');
  (async () => {
    if (!map || !doel) throw new Error('GEBRUIK: --map <map> --uit <bestand>');
    const uitslag = await proefUitvoeren({ url: proefVerbinding(process.env, String(process.env.PROEF_DB || '')), map, tijdslimietMs: Number(process.env.PROEF_TIJD_MS || 120_000) });
    await writeFile(doel, JSON.stringify(uitslag), { mode: 0o640 });
    process.exitCode = uitslag.ok ? 0 : 4;
  })().catch(async (e) => {
    process.stderr.write(`[proef] FOUT: ${String((e as Error)?.message || e)}\n`);
    if (doel) await writeFile(doel, JSON.stringify({ id: '', ok: false, status: 'fout', code: 'PROEF_FOUT', tijd: new Date().toISOString(), stappen: [], migraties: [], log: [String((e as Error)?.message || e).slice(0, 300)] } satisfies MigratieProefUitslag)).catch(() => undefined);
    process.exitCode = 1;
  });
}
