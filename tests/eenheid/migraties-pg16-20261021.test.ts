// Regressie 21.10.2026: migraties op PostgreSQL 16 (BYOS; Ubuntu 24.04 LTS levert PG16) en de 404 op /downloads/extension-version.json.
//  1) 0007 gebruikte `ALTER COLUMN … SET EXPRESSION` (alleen PG17) → op PG16 «MIGRATIE_MISLUKT:0007 … syntax error at or near "EXPRESSION"».
//     Nu: PG17 voert via EXECUTE exact de oude opdracht uit (statisch vergeleken), PG16 bouwt de kolom opnieuw op.
//  2) Echte migrator (server/migrate.ts) op een EIGEN, nieuwe database: 0001→laatste + rechten.sql, tweede run «niets te doen»,
//     een al geregistreerde 0007 wordt nooit opnieuw gelezen (geen controlesom). De database wordt aan het eind verwijderd.
//  3) Minimale versie (server/pg-versie.ts) + controle in deploy/installeer-app.sh vóór back-up en migraties.
//  4) dist/downloads/extension-version.json: ook een losse `vite build` maakt hem (plugin), elk subdomein krijgt 200.
// Raakt de databases mijnruimte/mijnruimte_stand niet aan (alleen CREATE/DROP DATABASE via de onderhoudsdatabase «postgres»).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';
import { migrate } from '../../server/migrate';
import { closePool } from '../../server/platform/pg';
import { PG_MIN_VERSIE_NUM, pgVersie, pgVersieMelding } from '../../server/pg-versie';
import { checker } from './hulp/nep-google';

// De opdracht uit 0007 zoals die tot 21.10.2026 in het bestand stond (zonder afsluitende «;»).
const OUDE_0007_OPDRACHT = `ALTER TABLE app.records ALTER COLUMN owner_id SET EXPRESSION AS (
  CASE WHEN tbl = 'users' THEN id
       WHEN tbl = 'account_identities' THEN COALESCE(NULLIF(data->>'accountId', ''), NULLIF(data->>'userId', ''))
       ELSE COALESCE(NULLIF(data->>'ownerUserId', ''), NULLIF(data->>'userId', ''), NULLIF(data->>'recipientUserId', ''))
  END
)`;
// sha256 van alles NA die opdracht in het oude bestand (functies, trigger, policy's): moet ongewijzigd zijn.
const OUDE_0007_REST_SHA = '3e23473c8776b743339a71f75a9fa8d941e5d0250de2f85818af745b3fe25bb9';

const lees = (f: string) => readFileSync(f, 'utf8');
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

function dbUrl(basis: string, db: string): string { const u = new URL(basis); u.pathname = `/${db}`; return u.toString(); }

function get(poort: number, host: string, pad: string): Promise<{ status: number; body: string; type: string }> {
  return new Promise((ok, mis) => {
    const r = http.request({ host: '127.0.0.1', port: poort, method: 'GET', path: pad, headers: { host } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => ok({ status: res.statusCode || 0, body: b, type: String(res.headers['content-type'] || '') }));
    });
    r.on('error', mis); r.end();
  });
}

// MIGRATIONS_DIR altijd expliciet: de gebundelde test ligt in rapporten/…, het standaardpad van migrate.ts klopt daar niet.
async function migreerNaar(url: string, dir: string): Promise<string[]> {
  const vorigeUrl = process.env.DATABASE_URL_MIGRATIE, vorigeDir = process.env.MIGRATIONS_DIR;
  process.env.DATABASE_URL_MIGRATIE = url;
  process.env.MIGRATIONS_DIR = dir;
  try { return await migrate(); } finally {
    if (vorigeUrl === undefined) delete process.env.DATABASE_URL_MIGRATIE; else process.env.DATABASE_URL_MIGRATIE = vorigeUrl;
    if (vorigeDir === undefined) delete process.env.MIGRATIONS_DIR; else process.env.MIGRATIONS_DIR = vorigeDir;
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('migraties-pg16-20261021');
  const W = process.cwd();
  const migDir = join(W, 'migrations');
  const bestanden = readdirSync(migDir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const laatste = bestanden[bestanden.length - 1].replace(/\.sql$/, '');

  // ---- 1. statisch: PG17-weg is byte-gelijk aan de oude opdracht, de rest van 0007 is ongewijzigd
  const m7 = lees(join(migDir, '0007_rls_per_tabel.sql'));
  const expr = /:= \$expr\$([\s\S]*?)\$expr\$;/.exec(m7)?.[1] ?? '';
  check('0007/PG17: EXECUTE-tekst = exact de oude SET EXPRESSION-opdracht (zelfde expressie, byte voor byte)',
    m7.includes("EXECUTE 'ALTER TABLE app.records ALTER COLUMN owner_id SET EXPRESSION AS (' || v_expr || ')';")
    && `ALTER TABLE app.records ALTER COLUMN owner_id SET EXPRESSION AS (${expr})` === OUDE_0007_OPDRACHT);
  check('0007: PG17-weg alleen bij server_version_num >= 170000; PG16-weg zonder CASCADE, met dezelfde v_expr',
    /IF current_setting\('server_version_num'\)::int >= 170000 THEN/.test(m7) && !/CASCADE/i.test(m7.replace(/--[^\n]*/g, ''))
    && m7.includes("EXECUTE 'ALTER TABLE app.records ADD COLUMN owner_id text GENERATED ALWAYS AS (' || v_expr || ') STORED';"));
  const rest = m7.slice(m7.indexOf('END $mig0007$;') + 'END $mig0007$;'.length);
  check('0007: alles na de kolomwijziging (functies, trigger, 4 policy\'s) ongewijzigd t.o.v. het oude bestand', sha(rest) === OUDE_0007_REST_SHA, sha(rest));
  check('0007: geen PG17-syntax buiten de dynamische tekst (parser van PG16 ziet alleen een DO-blok)',
    !/SET EXPRESSION/.test(m7.replace(/--[^\n]*/g, '').replace(/EXECUTE '[^']*SET EXPRESSION[^']*'/, '')));
  // Andere versie-specifieke constructies in alle migraties (PG15+/16+/17+/18+).
  const VERSIE_SPECIFIEK = /SET EXPRESSION|\bMERGE\s+INTO|JSON_TABLE|JSON_EXISTS\s*\(|JSON_QUERY\s*\(|JSON_VALUE\s*\(|\bJSON_OBJECT\s*\(|\bJSON_ARRAY\s*\(|JSON_(ARRAY|OBJECT)AGG|\bIS\s+(NOT\s+)?JSON\b|any_value\s*\(|merge_action|NULLS NOT DISTINCT|SET ACCESS METHOD|regexp_(count|like|substr|instr)\s*\(|array_(shuffle|sample|sort)\s*\(|pg_input_is_valid|system_user|uuidv[47]\s*\(|pg_maintain|\bMAINTAIN\b|WITHOUT OVERLAPS|\bVIRTUAL\b|NOT ENFORCED|casefold\s*\(|security_invoker|ON PARAMETER|WITH (INHERIT|SET) (TRUE|FALSE)|RETURNING\s+(OLD|NEW)\./i;
  const treffers: string[] = [];
  for (const f of [...bestanden, 'rechten.sql']) {
    let t = lees(join(migDir, f)).replace(/--[^\n]*/g, '');
    if (f === '0007_rls_per_tabel.sql') t = t.replace(/EXECUTE 'ALTER TABLE app\.records ALTER COLUMN owner_id SET EXPRESSION AS \(' \|\| v_expr \|\| '\)';/, '');
    const m = VERSIE_SPECIFIEK.exec(t); if (m) treffers.push(`${f}: ${m[0]}`);
  }
  check(`geen PG16+/17+-constructies in ${bestanden.length} migraties + rechten.sql (behalve de afgeschermde PG17-tak van 0007)`, treffers.length === 0, treffers.join('; '));

  // ---- 3. minimale versie + installer
  check('pg-versie: 16 en 17 ondersteund; 15/14 → PG_VERSIE_TE_OUD met nl + uk, «niets gewijzigd»',
    pgVersieMelding({ num: 160015, tekst: '16.15' }) === null && pgVersieMelding({ num: 170006, tekst: '17.6' }) === null && PG_MIN_VERSIE_NUM === 160000
    && /^PG_VERSIE_TE_OUD:15\.8: PostgreSQL 15 wordt niet ondersteund; minimaal PostgreSQL 16/.test(pgVersieMelding({ num: 150008, tekst: '15.8' }) || '')
    && /Er is niets aan de database gewijzigd/.test(pgVersieMelding({ num: 140013, tekst: '14.13' }) || '') && /не підтримується.*Базу даних не змінено/.test(pgVersieMelding({ num: 140013, tekst: '14.13' }) || ''));
  const mig = lees(join(W, 'server/migrate.ts'));
  check('migrate.ts: versiecontrole vóór CREATE SCHEMA en vóór elke migratie; --pg-controle (exit 3) verandert niets',
    mig.indexOf('pgVersieMelding(await pgVersie(pool))') > 0 && mig.indexOf('pgVersieMelding(await pgVersie(pool))') < mig.indexOf("CREATE SCHEMA IF NOT EXISTS app")
    && /--pg-controle/.test(mig) && /process\.exitCode = 3/.test(mig));
  const inst = lees(join(W, 'deploy/installeer-app.sh'));
  const migreren = inst.slice(inst.indexOf('\nmigreren() {'), inst.indexOf('\nomzetten() {'));
  check('installer: pg_versie_controleren (migrate.mjs --pg-controle, zelfde rol/omgeving) vóór back-up en migraties, melding nl + uk',
    /pg_versie_controleren\(\) \{[\s\S]*dist-server\/migrate\.mjs" --pg-controle[\s\S]*3\) fout "PostgreSQL is te oud[^"]*застаріла/.test(inst)
    && migreren.indexOf('pg_versie_controleren "$doel"') > 0 && migreren.indexOf('pg_versie_controleren "$doel"') < migreren.indexOf('back-up vóór migratie')
    && migreren.indexOf('pg_versie_controleren "$doel"') < migreren.indexOf('migrate.mjs"')
    && /voortgang pgversie [0-9]+ /.test(inst));
  check('deploy/LEESMIJ.nl.md noemt het minimum (16), de aanbeveling (17) en de controle vóór de migraties',
    /minimaal \*\*16\*\*[\s\S]{0,200}aanbevolen \*\*17\*\*[\s\S]{0,400}--pg-controle/.test(lees(join(W, 'deploy/LEESMIJ.nl.md'))));

  // ---- 2. echte migrator op een eigen, nieuwe database
  const basis = String(process.env.DATABASE_URL || '');
  const naam = `mr_pg16_test_${process.pid}_${Date.now().toString(36)}`;
  const naam2 = `${naam}_oud`;
  const beheer = new pg.Client({ connectionString: dbUrl(basis, 'postgres') });
  const tijdelijk = mkdtempSync(join(tmpdir(), 'mr-pg16-'));
  await beheer.connect();
  try {
    const v = await pgVersie(beheer);
    check(`server is PostgreSQL ${v.tekst} (${v.num >= 170000 ? 'PG17+: PG16-tak hier niet geoefend' : 'PG16-tak van 0007 wordt geoefend'})`, v.num >= PG_MIN_VERSIE_NUM);
    await beheer.query(`CREATE DATABASE ${naam}`);
    await beheer.query(`CREATE DATABASE ${naam2}`);
    const url = dbUrl(basis, naam), url2 = dbUrl(basis, naam2);

    let eerste: string[] = []; let fout = '';
    try { eerste = await migreerNaar(url, migDir); } catch (e) { fout = (e as Error).message; }
    check(`schone database: alle ${bestanden.length} migraties 0001→${laatste} + rechten.sql zonder fout (zonder shim)`,
      !fout && eerste.length === bestanden.length && eerste[0] === '0001_basis' && eerste[eerste.length - 1] === laatste, fout || `${eerste.length} uitgevoerd`);
    const tweede = await migreerNaar(url, migDir).catch((e) => [`FOUT ${(e as Error).message}`]);
    check('tweede run: niets te doen (lege lijst), geen fout', tweede.length === 0, tweede.join(','));

    const db = new pg.Client({ connectionString: url }); await db.connect();
    try {
      const kol = (await db.query(`SELECT pg_get_expr(d.adbin, d.adrelid) AS expr, a.attgenerated AS gen, format_type(a.atttypid, a.atttypmod) AS type
          FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = 'app.records'::regclass AND a.attname = 'owner_id' AND NOT a.attisdropped`)).rows[0];
      // Referentie: dezelfde oude expressie in een gewone CREATE TABLE (dat kan PG16 wel) → zelfde gedeparste tekst = zelfde kolom als PG17.
      await db.query(`CREATE TEMP TABLE ref (tbl text, id text, data jsonb, owner_id text GENERATED ALWAYS AS (${OUDE_0007_OPDRACHT.slice(OUDE_0007_OPDRACHT.indexOf('(') + 1, -1)}) STORED)`);
      const ref = (await db.query(`SELECT pg_get_expr(d.adbin, d.adrelid) AS expr FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = 'ref'::regclass AND a.attname = 'owner_id'`)).rows[0];
      check('owner_id: STORED gegenereerd, type text, expressie gelijk aan de oude PG17-expressie (gedeparst vergeleken)', kol?.gen === 's' && kol?.type === 'text' && kol?.expr === ref?.expr && /account_identities/.test(String(kol?.expr)));
      const idx = (await db.query(`SELECT pg_get_indexdef(to_regclass('app.records_tbl_owner_idx')) AS d`)).rows[0]?.d;
      check('index records_tbl_owner_idx terug met dezelfde definitie', idx === 'CREATE INDEX records_tbl_owner_idx ON app.records USING btree (tbl, owner_id)', String(idx));
      const pol = (await db.query(`SELECT array_agg(polname::text ORDER BY polname) AS p FROM pg_policy WHERE polrelid = 'app.records'::regclass`)).rows[0]?.p as string[];
      check("4 records-policy's aanwezig (lezen/toevoegen/verwijderen/wijzigen)", JSON.stringify(pol) === JSON.stringify(['records_lezen', 'records_toevoegen', 'records_verwijderen', 'records_wijzigen']), JSON.stringify(pol));
      await db.query(`INSERT INTO app.records (tbl, id, data) VALUES ('users', 'u-pg16', '{}'), ('account_identities', 'ai-pg16', '{"accountId":"u-pg16"}'), ('notities', 'n-pg16', '{"ownerUserId":"","userId":"u-pg16"}')`);
      const eig = (await db.query(`SELECT id, owner_id FROM app.records WHERE id LIKE '%-pg16' ORDER BY id`)).rows.map((r) => `${r.id}=${r.owner_id}`).join(',');
      check('owner_id rekent zoals 0007 bedoelt: users→id, account_identities→accountId, anders userId', eig === 'ai-pg16=u-pg16,n-pg16=u-pg16,u-pg16=u-pg16', eig);
      const aantal = Number((await db.query('SELECT count(*)::int AS n FROM app.schema_migrations')).rows[0].n);
      check(`schema_migrations: ${bestanden.length} versies`, aantal === bestanden.length, String(aantal));
      let syntaxFout = '';
      await db.query(OUDE_0007_OPDRACHT).catch((e) => { syntaxFout = (e as Error).message; });
      if (v.num < 170000) check('bewijs van de oorzaak: de oude opdracht zelf faalt op deze PG16 met «syntax error at or near "EXPRESSION"»', /syntax error at or near "EXPRESSION"/.test(syntaxFout), syntaxFout);
    } finally { await db.end().catch(() => undefined); }

    // Bestaande installatie waar 0007 al is uitgevoerd (met de oude tekst, op PG17 of met een eigen shim): de migrator
    // registreert alleen de naam → 0007 wordt nooit opnieuw gelezen. Bewijs: een kapotte 0007 met dezelfde naam wordt overgeslagen.
    for (const f of bestanden.slice(0, bestanden.indexOf('0007_rls_per_tabel.sql') + 1)) copyFileSync(join(migDir, f), join(tijdelijk, f));
    const tot7 = await migreerNaar(url2, tijdelijk).catch((e) => [`FOUT ${(e as Error).message}`]);
    const db2 = new pg.Client({ connectionString: url2 }); await db2.connect();
    try {
      await db2.query(`COMMENT ON COLUMN app.records.owner_id IS 'merkteken-pg16'`);
      const attVoor = Number((await db2.query(`SELECT attnum FROM pg_attribute WHERE attrelid = 'app.records'::regclass AND attname = 'owner_id'`)).rows[0].attnum);
      writeFileSync(join(tijdelijk, '0007_rls_per_tabel.sql'), 'SELECT 1/0; -- mag nooit draaien: 0007 staat al in app.schema_migrations\n');
      for (const f of bestanden.slice(bestanden.indexOf('0007_rls_per_tabel.sql') + 1)) copyFileSync(join(migDir, f), join(tijdelijk, f));
      copyFileSync(join(migDir, 'rechten.sql'), join(tijdelijk, 'rechten.sql'));
      let rest2: string[] = []; let fout2 = '';
      try { rest2 = await migreerNaar(url2, tijdelijk); } catch (e) { fout2 = (e as Error).message; }
      const na = (await db2.query(`SELECT a.attnum, col_description(a.attrelid, a.attnum) AS c FROM pg_attribute a WHERE a.attrelid = 'app.records'::regclass AND a.attname = 'owner_id'`)).rows[0];
      check('database met 0007 al toegepast: geen fout, 0007 niet herhaald (kapotte tekst genegeerd, kolom ongemoeid), 0008→laatste uitgevoerd',
        tot7.length === 7 && !fout2 && !rest2.includes('0007_rls_per_tabel') && rest2[0] === '0008_audit_verharding' && rest2[rest2.length - 1] === laatste
        && Number(na?.attnum) === attVoor && na?.c === 'merkteken-pg16', fout2 || `${tot7.length}+${rest2.length}, attnum ${attVoor}→${na?.attnum}, comment ${na?.c}`);
    } finally { await db2.end().catch(() => undefined); }
  } catch (e) {
    check('onverwachte fout (database)', false, String((e as Error)?.stack || e));
  } finally {
    await closePool();
    for (const n of [naam, naam2]) await beheer.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`).catch((e) => check(`opruimen ${n}`, false, (e as Error).message));
    const over = (await beheer.query(`SELECT count(*)::int AS n FROM pg_database WHERE datname IN ($1, $2)`, [naam, naam2])).rows[0].n;
    check('testdatabases verwijderd', over === 0, String(over));
    await beheer.end().catch(() => undefined);
    rmSync(tijdelijk, { recursive: true, force: true });
  }

  // ---- 4. /downloads/extension-version.json: gemaakt door elke vite-build, 200 op elk subdomein
  // De vite-plugin zelf (vite.config.ts → plugins: [..., extensieDownloadsPlugin()]) zoals vite hem aanroept: configResolved + closeBundle.
  const pluginDist = mkdtempSync(join(tmpdir(), 'mr-vite-uit-'));
  try {
    const { extensieDownloadsPlugin } = await import(pathToFileURL(join(W, 'scripts/extensie-downloads.mjs')).href) as { extensieDownloadsPlugin: () => { name: string; apply: string; configResolved: (c: unknown) => void; closeBundle: () => void } };
    const p = extensieDownloadsPlugin();
    p.configResolved({ root: tmpdir(), build: { outDir: pluginDist } });
    p.closeBundle();
    const v2 = JSON.parse(lees(join(pluginDist, 'downloads', 'extension-version.json')));
    check('vite-plugin mr-extensie-downloads (apply: build): na closeBundle staat <outDir>/downloads/extension-version.json er', p.name === 'mr-extensie-downloads' && p.apply === 'build' && v2.version === JSON.parse(lees(join(W, 'extension/manifest.json'))).version);
  } catch (e) { check('vite-plugin mr-extensie-downloads', false, String((e as Error)?.stack || e)); } finally { rmSync(pluginDist, { recursive: true, force: true }); }
  const vragers = ['src/ExtensieUpdateBand.tsx', 'src/BrowserExtensiePaneel.tsx', 'src/agenten/TabApparaten.tsx', 'src/AgentInrichtingWizard.tsx'].filter((f) => lees(join(W, f)).includes("'/downloads/extension-version.json'"));
  check('wie het bestand opvraagt is bekend (ExtensieUpdateBand op elke pagina + 3 panelen)', vragers.length === 4, vragers.join(','));
  const dist = mkdtempSync(join(tmpdir(), 'mr-dist-dl-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
  execFileSync(process.execPath, [join(W, 'scripts/bouw-extensie.mjs')], { env: { ...process.env, MR_DIST_DIR: dist }, stdio: ['ignore', 'ignore', 'pipe'] });
  const ev = join(dist, 'downloads', 'extension-version.json');
  const manifest = JSON.parse(lees(join(W, 'extension/manifest.json')));
  const json = existsSync(ev) ? JSON.parse(lees(ev)) : null;
  check('build-extension schrijft naar MR_DIST_DIR/downloads: extension-version.json met de manifestversie', json?.version === manifest.version && /^[0-9a-f]{64}$/.test(String(json?.sha256)), JSON.stringify(json)?.slice(0, 120));
  const vorigeDist = process.env.DIST_DIR; process.env.DIST_DIR = dist;
  let server: http.Server | null = null;
  try {
    const { createServer } = await import('../../server/start');
    const { SERVICE_HOSTS } = await import('../../backend/deployment-identiteit');
    server = createServer();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const poort = (server.address() as { port: number }).port;
    const hosts = [...new Set(Object.values(SERVICE_HOSTS) as string[])];
    const st = await Promise.all(hosts.map((h) => get(poort, h, '/downloads/extension-version.json')));
    check(`200 + JSON op alle ${hosts.length} subdomeinen (${hosts.map((h) => h.split('.')[0]).join(', ')})`, st.every((s) => s.status === 200 && s.type.includes('application/json') && JSON.parse(s.body).version === manifest.version), st.map((s) => s.status).join(','));
    renameSync(join(dist, 'downloads'), join(dist, 'downloads-weg'));
    const zonder = await get(poort, hosts[0], '/downloads/extension-version.json');
    check('oorzaak nagespeeld: dist zonder downloads/ (vroeger na een losse vite build) → 404', zonder.status === 404, String(zonder.status));
  } catch (e) {
    check('onverwachte fout (downloads)', false, String((e as Error)?.stack || e));
  } finally {
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
    rmSync(dist, { recursive: true, force: true });
    await closePool();
  }
  return einde();
}
