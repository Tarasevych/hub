// SEC-002 · група виправлень g05 (12.11.2026) — відтворення й регресія трьох знахідок аудиту безпеки:
//   server-uitrol-07  deploy/backup-maken.sh передавав рядок підключення з паролем системної ролі (BYPASSRLS) в аргументах
//                     pg_dump і psql — їх видно всім локальним процесам (/proc/<pid>/cmdline, `ps`);
//   ai-mcp-09         координація агентів (orch_*): синхронні spawnSync/execFileSync зупиняли цикл подій усього сайту
//                     (огляд — без ліміту й без підтвердження; «застосувати правила» — до 120 с controleer + 90 с push);
//   extensie-07       перегляд файла Google Drive буферизував до 128 МБ і повертав base64 у JSON без жодної межі
//                     одночасності — кілька паралельних запитів одного користувача вичерпували пам'ять єдиного процесу.
// Кожен блок спершу показує ваду (на коді до патча ці перевірки падають), потім — що звичайна поведінка не зламана.
// Alleen verzonnen geheimen; er gaat niets naar buiten (fetch is onderschept, pg_dump/psql zijn nagebootst of lokaal).
// Запуск: node scripts/eenheidstests.mjs sec-002-g05-20261112.test.ts (блок Drive потребує DATABASE_URL — власна тестова база).
import { spawnSync } from 'node:child_process';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as kern from '../../scripts/orch/kern.mjs';
import { ORCH_ROUTES } from '../../shared/orch-model';
import { checker } from './hulp/nep-google';

type Check = (naam: string, ok: boolean, info?: string) => void;
const lees = (p: string) => readFileSync(p, 'utf8');
const slaap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MB = 1024 * 1024;

/** Grootste gat tussen twee tikken van een klok van 20 ms terwijl `werk` loopt: zo lang stond de gebeurtenislus stil. */
async function metHartslag<T>(werk: () => Promise<T>): Promise<{ uit: T; gat: number; duur: number }> {
  const begin = performance.now();
  let vorige = begin, gat = 0;
  const tik = () => { const nu = performance.now(); gat = Math.max(gat, nu - vorige); vorige = nu; };
  const klok = setInterval(tik, 20);
  try { const uit = await werk(); tik(); return { uit, gat: Math.round(gat), duur: Math.round(performance.now() - begin) }; } finally { clearInterval(klok); }
}

// ================================================================================================ server-uitrol-07
function deelBackup(check: Check): void {
  // Het script van vóór de patch kan via SEC002_G05_BACKUP_SCRIPT worden aangewezen (bewijs «ervoor»).
  const script = resolve(process.env.SEC002_G05_BACKUP_SCRIPT || 'deploy/backup-maken.sh');
  const T = mkdtempSync(join(tmpdir(), 'sec002-g05-backup-'));
  try {
    const bin = join(T, 'bin'); mkdirSync(bin);
    mkdirSync(join(T, 'uploads')); writeFileSync(join(T, 'uploads/a.txt'), 'inhoud');
    const echt = (naam: string) => spawnSync('sh', ['-c', `command -v ${naam}`], { encoding: 'utf8' }).stdout.trim();
    const echtPgDump = echt('pg_dump'), echtPsql = echt('psql');
    /** Nagebootst programma: legt argumenten, de opdrachtregel zoals `ps` die toont en de PG*-omgeving vast. */
    const stub = (log: string, naam: string, slot: string) => {
      writeFileSync(join(bin, naam), [
        '#!/usr/bin/env bash',
        `printf '%s\\n' "$@" > "${log}/${naam}.args"`,
        `tr '\\0' ' ' < /proc/$$/cmdline > "${log}/${naam}.cmdline"`,
        `for v in PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD PGSSLMODE PGAPPNAME; do printf '%s=%s\\n' "$v" "\${!v-}"; done > "${log}/${naam}.env"`,
        slot, '',
      ].join('\n'));
      chmodSync(join(bin, naam), 0o755);
    };
    let nr = 0;
    const draai = (url: string, soort: 'nep' | 'echt' = 'nep') => {
      const log = join(T, `log-${++nr}`); mkdirSync(log);
      stub(log, 'pg_dump', soort === 'echt' ? `exec "${echtPgDump}" "$@"` : `printf 'PGDMP-nep-inhoud'`);
      stub(log, 'psql', soort === 'echt' ? `exec "${echtPsql}" "$@"` : `echo '0001_begin,0002_vervolg'`);
      const backups = join(T, `backups-${nr}`);
      const r = spawnSync('bash', [script], { encoding: 'utf8', timeout: 120_000, env: { PATH: `${bin}:${process.env.PATH}`, HOME: T, DATABASE_URL_SYSTEM: url, BACKUP_ONVERSLEUTELD: '1', BACKUP_DIR: backups, UPLOADS_DIR: join(T, 'uploads') } });
      const map = existsSync(backups) ? readdirSync(backups).filter((n) => /^\d{8}-\d{6}$/.test(n))[0] : undefined;
      const veilig = (p: string) => (existsSync(p) ? lees(p) : '');
      return { status: r.status, uitvoer: `${r.stdout}${r.stderr}`, map: map ? join(backups, map) : '', args: (n: string) => `${veilig(join(log, `${n}.args`))}\n${veilig(join(log, `${n}.cmdline`))}`, env: (n: string) => veilig(join(log, `${n}.env`)), gedraaid: (n: string) => existsSync(join(log, `${n}.args`)) };
    };

    // Verzonnen wachtwoord met tekens die in een URL gecodeerd moeten zijn: ontcijferd «NEP-geheim@w8w:oord».
    const WW_URL = 'NEP%2Dgeheim%40w8w%3Aoord', WW = 'NEP-geheim@w8w:oord';
    const URL1 = `postgres://mijnruimte_system:${WW_URL}@127.0.0.1:5433/mr_nep?sslmode=disable&application_name=reservekopie`;
    const lekt = (t: string) => t.includes('NEP') || t.includes('geheim') || /postgres(ql)?:\/\//.test(t);
    /** Voor meldingen: het voorbeeld van het verwachte formaat mag er staan, de waarde zelf nooit. */
    const lektWaarde = (t: string) => t.includes('NEP') || t.includes('geheim') || t.includes('mr_nep') || t.includes('127.0.0.1');
    const a = draai(URL1);
    check('server-uitrol-07: reservekopie slaagt met nagebootste pg_dump/psql (KLAAR, dump, migraties in info.txt)',
      a.status === 0 && !!a.map && existsSync(join(a.map, 'KLAAR')) && lees(join(a.map, 'database.dump')) === 'PGDMP-nep-inhoud' && /^migraties=0001_begin,0002_vervolg$/m.test(lees(join(a.map, 'info.txt'))),
      `status ${a.status}`);
    check('server-uitrol-07: pg_dump krijgt GEEN wachtwoord of verbindings-URL als argument (dat is wat `ps` en /proc/<pid>/cmdline tonen)',
      a.gedraaid('pg_dump') && !lekt(a.args('pg_dump')), a.gedraaid('pg_dump') ? (lekt(a.args('pg_dump')) ? 'de opdrachtregel van pg_dump bevat de URL met het wachtwoord' : '') : 'pg_dump niet aangeroepen');
    check('server-uitrol-07: psql (migratielijst) krijgt GEEN wachtwoord of verbindings-URL als argument',
      a.gedraaid('psql') && !lekt(a.args('psql')), a.gedraaid('psql') ? (lekt(a.args('psql')) ? 'de opdrachtregel van psql bevat de URL met het wachtwoord' : '') : 'psql niet aangeroepen');
    const env = a.env('pg_dump'), envPsql = a.env('psql');
    const juist = (e: string) => e.includes('PGHOST=127.0.0.1\n') && e.includes('PGPORT=5433\n') && e.includes('PGUSER=mijnruimte_system\n') && e.includes('PGDATABASE=mr_nep\n') && e.includes(`PGPASSWORD=${WW}\n`) && e.includes('PGSSLMODE=disable\n') && e.includes('PGAPPNAME=reservekopie\n');
    check('server-uitrol-07: de verbinding gaat via de PG*-omgeving (host, poort, gebruiker, database, ontcijferd wachtwoord, sslmode, application_name) — voor pg_dump én psql',
      juist(env) && juist(envPsql), env.replace(/PGPASSWORD=.*/, 'PGPASSWORD=…').replace(/\n/g, ' '));
    check('server-uitrol-07: de uitvoer van het script en info.txt/systeem-info.txt bevatten het wachtwoord niet',
      !lekt(a.uitvoer) && !!a.map && !lekt(lees(join(a.map, 'info.txt'))) && !lekt(existsSync(join(a.map, 'systeem-info.txt')) ? lees(join(a.map, 'systeem-info.txt')) : ''));

    // Verwante vormen van dezelfde URL: oud schema, IPv6 zonder poort, geen parameters.
    const b = draai(`postgresql://rol_b:${WW_URL}@[::1]/mr_zes`);
    check('server-uitrol-07: postgresql://…@[::1]/db (IPv6, geen poort) → PGHOST=::1, PGPORT niet gezet, geen lek in argumenten',
      b.status === 0 && b.env('pg_dump').includes('PGHOST=::1\n') && b.env('pg_dump').includes('PGPORT=\n') && b.env('pg_dump').includes('PGUSER=rol_b\n') && b.env('pg_dump').includes('PGDATABASE=mr_zes\n') && !lekt(b.args('pg_dump')) && !lekt(b.args('psql')),
      `status ${b.status}`);
    // Wat niet te ontleden is, wordt geweigerd — zonder de waarde te tonen en zonder pg_dump te starten.
    const slecht = [
      ['onbekende parameter', `postgres://rol:${WW_URL}@127.0.0.1:5432/mr_nep?onbekend=1`],
      ['geen URL (sleutel=waarde)', 'host=127.0.0.1 dbname=mr_nep user=rol password=NEP-geheim'],
      ['kapotte %-codering', 'postgres://rol:NEP%ZZgeheim@127.0.0.1:5432/mr_nep'],
    ].map(([naam, url]) => ({ naam, r: draai(url) }));
    check('server-uitrol-07: onbekende parameter / geen URL / kapotte codering → weigeren (status 1), pg_dump niet gestart, de waarde niet in de melding',
      slecht.every((s) => s.r.status === 1 && !s.r.gedraaid('pg_dump') && !lektWaarde(s.r.uitvoer) && /onverwacht formaat/.test(s.r.uitvoer)),
      slecht.map((s) => `${s.naam}: status ${s.r.status}${s.r.gedraaid('pg_dump') ? ', pg_dump gestart' : ''}${lektWaarde(s.r.uitvoer) ? ', LEK in melding' : ''}`).join(' | '));

    // De echte pg_dump en psql tegen de lokale testdatabase: de PG*-omgeving is voor libpq genoeg (geen gedrag kapot).
    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl && echtPgDump && echtPsql) {
      const ww = (() => { try { return decodeURIComponent(new URL(dbUrl).password); } catch { return ''; } })();
      const e = draai(dbUrl, 'echt');
      const dump = e.map && existsSync(join(e.map, 'database.dump')) ? readFileSync(join(e.map, 'database.dump')) : Buffer.alloc(0);
      const info = e.map ? lees(join(e.map, 'info.txt')) : '';
      const zonderWw = (t: string) => !/postgres(ql)?:\/\//.test(t) && (!ww || ww.length < 4 || !t.includes(ww));
      check('server-uitrol-07: echte pg_dump/psql (lokale testdatabase) werken via de PG*-omgeving: geldige dump (PGDMP), migratielijst gelezen, niets geheims in de argumenten',
        e.status === 0 && dump.subarray(0, 5).toString('latin1') === 'PGDMP' && dump.length > 1000 && /^migraties=\d{4}_/m.test(info) && zonderWw(e.args('pg_dump')) && zonderWw(e.args('psql')),
        `status ${e.status}, dump ${dump.length} bytes, migraties ${/^migraties=(.{0,12})/m.exec(info)?.[1] ?? '?'}…${zonderWw(e.args('pg_dump')) ? '' : ' — URL/wachtwoord in de argumenten van pg_dump'}`);
    } else {
      check('server-uitrol-07: echte pg_dump/psql beschikbaar voor de proef (DATABASE_URL, pg_dump, psql)', false, 'DATABASE_URL of pg_dump/psql ontbreekt');
    }
  } finally { rmSync(T, { recursive: true, force: true }); }
}

// ================================================================================================ ai-mcp-09
const git = (cwd: string, ...a: string[]) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout.trim(); };

/**
 * Werkkopie (ORCH_WORTEL) met de echte regels, lock en context (via de pure kern, zonder de CLI), en een NAGEBOOTSTE
 * scripts/orch.mjs: die telt elke aanroep, wacht SEC002_G05_VERTRAGING_MS en eindigt met SEC002_G05_CODE.
 */
function orchRepo() {
  const R = mkdtempSync(join(tmpdir(), 'sec002-g05-orch-repo-')), O = mkdtempSync(join(tmpdir(), 'sec002-g05-orch-origin-'));
  const beleid = JSON.parse(lees('orchestratie/beleid.json'));
  for (const p of beleid.regelBestanden as string[]) cpSync(p, join(R, p), { recursive: true });
  const bestanden = Object.fromEntries((beleid.regelBestanden as string[]).map((p) => [p, lees(join(R, p))]));
  const lock = (kern.vergrendel(beleid, bestanden, null) as { lock: { hash: string; kritiekHash: string } }).lock;
  writeFileSync(join(R, 'orchestratie/regels.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  writeFileSync(join(R, beleid.compactContext.bestand), kern.compacteContext(bestanden['AGENTS.md'], beleid, lock as never));
  mkdirSync(join(R, 'scripts'));
  writeFileSync(join(R, 'scripts/orch.mjs'), [
    "import { appendFileSync } from 'node:fs';",
    // Ook GIT_OPTIONAL_LOCKS wordt vastgelegd (g05-toets-1: controleer roept zelf `git status` aan in de werkkopie).
    "if (process.env.SEC002_G05_TELLER) appendFileSync(process.env.SEC002_G05_TELLER, process.argv.slice(2).join(' ') + ' locks=' + (process.env.GIT_OPTIONAL_LOCKS ?? 'niet') + '\\n');",
    "await new Promise((r) => setTimeout(r, Number(process.env.SEC002_G05_VERTRAGING_MS || 0)));",
    "console.log('ORCH: nagebootste controle klaar');",
    "process.exit(Number(process.env.SEC002_G05_CODE || 0));", '',
  ].join('\n'));
  git(R, 'init', '-q', '-b', 'integratie'); git(R, 'config', 'user.email', 'eigenaar@test.invalid'); git(R, 'config', 'user.name', 'eigenaar');
  git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'basis');
  git(O, 'init', '-q', '--bare'); git(R, 'remote', 'add', 'origin', O); git(R, 'push', '-q', '-u', 'origin', 'integratie');
  return { R, O, beleid, lock, bestanden };
}

async function deelOrch(check: Check): Promise<void> {
  const { R, O, beleid, lock, bestanden } = orchRepo();
  const T = mkdtempSync(join(tmpdir(), 'sec002-g05-orch-'));
  const leeg = join(T, 'leeg'); mkdirSync(leeg); mkdirSync(join(T, 'status'));
  const teller = join(T, 'teller.txt');
  const namen = ['ORCH_WORTEL', 'ORCH_INBOX', 'OPDRACHT_STATUS_DIR', 'MCP_RECHTEN_PAD', 'SEC002_G05_TELLER', 'SEC002_G05_VERTRAGING_MS', 'SEC002_G05_CODE'];
  const oud = Object.fromEntries(namen.map((n) => [n, process.env[n]]));
  Object.assign(process.env, { ORCH_WORTEL: R, ORCH_INBOX: join(T, 'inbox'), OPDRACHT_STATUS_DIR: join(T, 'status'), MCP_RECHTEN_PAD: join(T, 'mcp-rechten.json'), SEC002_G05_TELLER: teller, SEC002_G05_VERTRAGING_MS: '0', SEC002_G05_CODE: '0' });
  const opslag = await import('../../backend/orch-opslag') as typeof import('../../backend/orch-opslag') & { _controleInstellen?: (o?: { timeoutMs?: number; onthoudMs?: number }) => void };
  const { orchRoutes } = await import('../../backend/orch-routes');
  const hm = await import('../../backend/orch-hulpmiddelen');
  const runs = () => (existsSync(teller) ? lees(teller).split('\n').filter(Boolean).length : 0);
  const vertraging = (ms: number) => { process.env.SEC002_G05_VERTRAGING_MS = String(ms); };
  const vergeet = () => { opslag._controleInstellen?.({ timeoutMs: 120_000, onthoudMs: 30_000 }); };

  const EIGENAAR = 'eigenaar@test.invalid';
  const besluiten = new Map<string, import('../../backend/orch-opslag').BesluitVoorToepassen>();
  const limietLog: Array<{ sleutel: string; max: number; seconden: number }> = [];
  let limietVol = false;
  const maakRoutes = (metLimiet: boolean) => orchRoutes({
    requireSession: async (event) => (event.who ? ({ user: { id: 'u-owner', role: 'owner', email: EIGENAAR, status: 'approved' }, service: 'mcp' } as never) : { errorCode: 'UNAUTHORIZED' }),
    isOwnerEmail: (e) => e === EIGENAAR,
    besluitZoeken: async (_e, id) => besluiten.get(id) ?? null,
    ...(metLimiet ? { rateLimit: async (sleutel: string, max: number, seconden: number) => { limietLog.push({ sleutel, max, seconden }); return { ok: !limietVol }; } } : {}),
  });
  const routes = maakRoutes(false), routesMetLimiet = maakRoutes(true);
  const roep = async (r: ReturnType<typeof maakRoutes>, route: string, body: Record<string, unknown> = {}) => {
    const res = await r[`POST ${route}`][0]({ event: { who: 'owner', headers: {} }, body } as never) as { statusCode: number; body: string };
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode, data, fout: String(data?.error || '') };
  };
  const call = (route: string, body: Record<string, unknown> = {}) => roep(routes, route, body);
  const wie = { userId: 'u-owner', clientName: 'Grok', agent: 'grok' };
  const tool = async (naam: string, args: Record<string, unknown> = {}, w: { userId: string; clientName: string; agent: string } = wie) => { const t = await hm.voerOrchToolUit(w, naam, args); let d: any = null; try { d = JSON.parse(t.content[0].text); } catch { d = null; } return { isError: !!t.isError, tekst: t.content[0].text, d }; };

  try {
    hm._mcpLimietenLeeg();
    // ---- 1. het overzicht houdt de gebeurtenislus niet vast (route van de eigenaar én MCP-hulpmiddel)
    const TRAAG = 1500, GRENS = 600;
    vergeet(); vertraging(TRAAG);
    const h1 = await metHartslag(() => call(ORCH_ROUTES.overzicht));
    check('ai-mcp-09: overzicht (route) geeft het echte resultaat van controleer (code 0, regel van het script) — ook al duurt die 1,5 s',
      h1.uit.status === 200 && h1.uit.data.repo.aanwezig === true && h1.uit.data.controleer?.code === 0 && h1.uit.data.controleer.regels.some((r: string) => r.includes('nagebootste controle klaar')) && h1.uit.data.regels.regelsVersie === beleid.regelsVersie && h1.uit.data.regels.hash === lock.hash,
      `status ${h1.uit.status} ${JSON.stringify(h1.uit.data?.controleer).slice(0, 120)}`);
    check(`ai-mcp-09: POST /api/owner/orch/overzicht blokkeert de gebeurtenislus niet terwijl controleer ${TRAAG} ms loopt (grootste stilstand < ${GRENS} ms)`,
      h1.gat < GRENS, `stilstand ${h1.gat} ms bij een aanroep van ${h1.duur} ms`);
    const na1 = runs();
    // ---- 2. onthouden per stand van de werkkopie: herhaalde aanroepen starten controleer niet opnieuw
    const h2 = await metHartslag(async () => { for (let i = 0; i < 3; i++) await call(ORCH_ROUTES.overzicht); const t = await tool('orch_overzicht'); return [t, await tool('orch_overzicht')]; });
    check('ai-mcp-09: vijf volgende aanroepen (3× route, 2× orch_overzicht) op dezelfde stand starten controleer NIET opnieuw (één run in totaal) en blijven snel',
      na1 === 1 && runs() === 1 && h2.duur < TRAAG && h2.uit.every((t) => !t.isError && t.d.controleer?.code === 0),
      `runs ${runs()} (verwacht 1), duur ${h2.duur} ms`);
    // ---- 3. een andere stand (commit, gewijzigd bestand) → verse controle; de uitslag hoort bij die stand
    vertraging(0);
    writeFileSync(join(R, 'NIEUW.txt'), 'een'); git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'wijziging');
    const c1 = await call(ORCH_ROUTES.overzicht); const naCommit = runs();
    writeFileSync(join(R, 'NIEUW.txt'), 'twee twee'); process.env.SEC002_G05_CODE = '1';
    const c2 = await call(ORCH_ROUTES.overzicht); const naWijziging = runs();
    writeFileSync(join(R, 'NIEUW.txt'), 'drie drie drie');
    const c3 = await call(ORCH_ROUTES.overzicht); const naTweede = runs();
    check('ai-mcp-09: nieuwe commit → nieuwe controle; niet-vastgelegde wijziging → nieuwe controle met de uitslag van NU (code 1, repo niet schoon); andere inhoud van hetzelfde bestand → weer een nieuwe',
      naCommit === 2 && c1.data.controleer.code === 0 && c1.data.repo.schoon === true && naWijziging === 3 && c2.data.controleer.code === 1 && c2.data.repo.schoon === false && naTweede === 4 && c3.data.controleer.code === 1,
      `runs na commit ${naCommit} (2), na wijziging ${naWijziging} (3), na tweede wijziging ${naTweede} (4); codes ${c1.data?.controleer?.code}/${c2.data?.controleer?.code}/${c3.data?.controleer?.code}`);
    process.env.SEC002_G05_CODE = '0';
    git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'opgeruimd');
    // ---- 4. gelijktijdige vragers delen één run
    vergeet(); vertraging(700);
    const voorPar = runs();
    const par = await metHartslag(() => Promise.all([call(ORCH_ROUTES.overzicht), call(ORCH_ROUTES.overzicht), tool('orch_overzicht'), call(ORCH_ROUTES.overzicht), tool('orch_overzicht'), call(ORCH_ROUTES.overzicht)]));
    check('ai-mcp-09: zes gelijktijdige aanroepen delen ÉÉN controleer-run (geen zes processen, geen zes keer wachten) en de lus blijft vrij',
      runs() - voorPar === 1 && par.gat < GRENS && par.duur < 6 * 700 && par.uit.every((x: any) => (x.data ?? x.d)?.controleer?.code === 0),
      `runs ${runs() - voorPar} (verwacht 1), stilstand ${par.gat} ms, duur ${par.duur} ms`);
    // ---- 5. MCP: orch_overzicht en orch_context blokkeren niet
    vergeet(); vertraging(TRAAG);
    const h5 = await metHartslag(() => tool('orch_overzicht'));
    check(`ai-mcp-09: MCP-hulpmiddel orch_overzicht blokkeert de gebeurtenislus niet terwijl controleer ${TRAAG} ms loopt (stilstand < ${GRENS} ms)`,
      !h5.uit.isError && h5.uit.d.controleer?.code === 0 && h5.gat < GRENS, `stilstand ${h5.gat} ms bij een aanroep van ${h5.duur} ms`);
    const ctx = await tool('orch_context'); const ctxRoute = await call(ORCH_ROUTES.context); const rg = await call(ORCH_ROUTES.regelsOverzicht);
    check('ai-mcp-09: orch_context, route context en regels/overzicht geven dezelfde inhoud als voorheen (context uit de werkkopie, regelbestanden, lock-hash)',
      !ctx.isError && ctx.d.tekst === lees(join(R, beleid.compactContext.bestand)) && ctx.d.hash === lock.hash && ctxRoute.status === 200 && ctxRoute.data.tekst === ctx.d.tekst
      && rg.status === 200 && rg.data.hash === lock.hash && rg.data.bestanden['AGENTS.md'] === bestanden['AGENTS.md'] && rg.data.repo.aanwezig === true,
      `${ctx.tekst.slice(0, 80)} | ${ctxRoute.status} | ${rg.status}`);
    // ---- 6. tijdslimiet: een hangende controle wordt afgebroken, komt terug met code -1 en wordt niet onthouden
    if (opslag._controleInstellen) {
      opslag._controleInstellen({ timeoutMs: 300, onthoudMs: 30_000 }); vertraging(20_000);
      const h6 = await metHartslag(() => call(ORCH_ROUTES.overzicht));
      vertraging(0);
      const erna = await call(ORCH_ROUTES.overzicht);
      check('ai-mcp-09: controleer die blijft hangen → na de tijdslimiet afgebroken (code -1), de lus bleef vrij; de mislukte run wordt niet onthouden (volgende aanroep: code 0)',
        h6.uit.status === 200 && h6.uit.data.controleer?.code === -1 && h6.duur < 6000 && h6.gat < GRENS && erna.data.controleer?.code === 0,
        `code ${h6.uit.data?.controleer?.code}, duur ${h6.duur} ms, stilstand ${h6.gat} ms, erna ${erna.data?.controleer?.code}`);
    } else check('ai-mcp-09: controleer voor het overzicht heeft een instelbare tijdslimiet en een kort geheugen (_controleInstellen)', false, 'ontbreekt: het overzicht draait controleer synchroon, bij elke aanroep opnieuw');
    vergeet(); vertraging(0);

    // ---- 6b. (g05-toets-1) het asynchrone leespad loopt nu TEGELIJK met de synchrone schrijfpaden (taakStart/staatCommit, inleveren) in
    // dezelfde werkkopie. `git status` neemt dan een NIET-VERPLICHT .git/index.lock om de index te verversen; een synchrone `git add`
    // op dat moment faalt («index.lock: File exists») en staatCommit() geeft stil null terug. Het leespad hoort daarom zonder die
    // niet-verplichte sloten te draaien (GIT_OPTIONAL_LOCKS=0) — git zelf én de controle (die intern ook `git status` doet).
    {
      const gitMap = join(T, 'git-bin'); mkdirSync(gitMap);
      const echteGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
      const gitLog = join(T, 'git-log.txt');
      writeFileSync(join(gitMap, 'git'), `#!/bin/sh\nprintf '%s %s\\n' "\${GIT_OPTIONAL_LOCKS:-niet}" "$1" >> "${gitLog}"\nexec "${echteGit}" "$@"\n`);
      chmodSync(join(gitMap, 'git'), 0o755);
      const oudPath = process.env.PATH;
      process.env.PATH = `${gitMap}:${oudPath}`;
      let o6: { status: number } | null = null, c6: { status: number } | null = null;
      try {
        writeFileSync(join(R, 'NIEUW.txt'), 'vier'); // andere stand → verse controle
        o6 = await call(ORCH_ROUTES.overzicht); c6 = await call(ORCH_ROUTES.context);
      } finally { process.env.PATH = oudPath; }
      git(R, 'checkout', '--', 'NIEUW.txt');
      const gitRegels = existsSync(gitLog) ? lees(gitLog).split('\n').filter(Boolean) : [];
      const controleRegel = lees(teller).split('\n').filter(Boolean).pop() || '';
      check('ai-mcp-09 (g05-toets-1): het leespad (overzicht, context) start git én controleer zonder niet-verplichte sloten (GIT_OPTIONAL_LOCKS=0) — `git status` kan zo geen index.lock vasthouden terwijl taakStart/inleveren synchroon committen',
        o6?.status === 200 && c6?.status === 200 && gitRegels.some((r) => r.endsWith(' status')) && gitRegels.every((r) => r.startsWith('0 ')) && controleRegel.endsWith('locks=0'),
        `git: ${[...new Set(gitRegels)].join(', ')}; controle: ${controleRegel}`);
      vergeet();
    }

    // ---- 7. «regels toepassen»: controleer (tot 120 s) en push lopen niet meer synchroon
    const nieuwVersie = String(beleid.regelsVersie).replace(/(\d+)$/, (m: string) => String(Number(m) + 1));
    const beleidNieuw = `${JSON.stringify({ ...beleid, regelsVersie: nieuwVersie }, null, 2)}\n`;
    const besluitenNieuw = `${bestanden['orchestratie/BESLUITEN.md']}\n## B-099 · 2026-11-12 · ${nieuwVersie} · voorstel\n\n**Контекст.** Test via de site.\n\n**Рішення.** Testregel.\n\n**Хто.** Eigenaar (test).\n`;
    const vs = await call(ORCH_ROUTES.regelsVoorstel, { bestanden: { 'orchestratie/beleid.json': beleidNieuw, 'orchestratie/BESLUITEN.md': besluitenNieuw } });
    const v = vs.data?.voorstel;
    if (vs.status === 200 && v?.id) {
      const maakBesluit = (voorstel: { id: string; regelsVersie: string; hash: string; kritiekHash: string }) => {
        const id = randomUUID();
        besluiten.set(id, { id, passkey: 'a1b2c3d4', inhoud: { regelsVersie: voorstel.regelsVersie, hash: voorstel.hash, kritiekHash: voorstel.kritiekHash, voorstel: voorstel.id } });
        const bestand = join(T, 'status/orch-regels-bevestigd.json');
        const eerder = existsSync(bestand) ? JSON.parse(lees(bestand)).bevestigingen : [];
        writeFileSync(bestand, JSON.stringify({ bijgewerkt: new Date().toISOString(), bevestigingen: [...eerder, { regelsVersie: voorstel.regelsVersie, hash: voorstel.hash, kritiekHash: voorstel.kritiekHash, voorstel: voorstel.id, passkey: 'a1b2c3d4', label: 'telefoon', door: EIGENAAR, besluit: id.replace(/-/g, ''), tijd: new Date().toISOString() }] }));
        return id;
      };
      const bId = maakBesluit(v);
      vertraging(TRAAG);
      const hoofdVoor = git(R, 'rev-parse', 'HEAD');
      // Tegelijk een tweede aanvraag voor hetzelfde ontwerp: sinds het toepassen asynchroon is, mag dat geen tweede tak opleveren.
      const h7 = await metHartslag(() => Promise.all([call(ORCH_ROUTES.regelsToepassen, { id: v.id, besluit: bId }), call(ORCH_ROUTES.regelsToepassen, { id: v.id, besluit: bId })]));
      vertraging(0);
      const [t1, t2] = h7.uit;
      const gelukt = [t1, t2].filter((x) => x.status === 200), geweigerd = [t1, t2].filter((x) => x.status !== 200);
      const takken = git(R, 'branch', '--list', 'regels/*').split('\n').map((s) => s.trim()).filter(Boolean);
      check('ai-mcp-09: regels toepassen werkt als voorheen (tak regels/<versie>-<tijd>, commit, gepusht naar origin, werkkopie blijft op integratie en schoon)',
        gelukt.length === 1 && /^regels\//.test(gelukt[0].data.tak) && /^[0-9a-f]{40}$/.test(gelukt[0].data.commit) && gelukt[0].data.gepusht === true && gelukt[0].data.voorstel.staat === 'toegepast'
        && git(R, 'rev-parse', 'HEAD') === hoofdVoor && git(R, 'status', '--porcelain') === '' && git(O, 'rev-parse', gelukt[0].data.tak) === gelukt[0].data.commit && git(R, 'worktree', 'list').split('\n').length === 1,
        `${t1.status} ${t1.fout} | ${t2.status} ${t2.fout} | ${JSON.stringify(gelukt[0]?.data ?? {}).slice(0, 200)}`);
      check('ai-mcp-09: twee gelijktijdige aanvragen «toepassen» voor hetzelfde ontwerp → precies één slaagt, de andere GEEN_VOORSTEL 409, één tak regels/*',
        gelukt.length === 1 && geweigerd.length === 1 && geweigerd[0].status === 409 && geweigerd[0].fout === 'GEEN_VOORSTEL' && takken.length === 1, `takken: ${takken.join(', ')} | ${t1.status} ${t1.fout} | ${t2.status} ${t2.fout}`);
      check(`ai-mcp-09: regels toepassen blokkeert de gebeurtenislus niet terwijl controleer ${TRAAG} ms loopt (stilstand < ${GRENS} ms)`,
        h7.gat < GRENS, `stilstand ${h7.gat} ms bij een aanroep van ${h7.duur} ms`);
      // Intrekken terwijl de controle loopt: er wordt niets vastgelegd en er blijft geen tak achter.
      const vs2 = await call(ORCH_ROUTES.regelsVoorstel, { bestanden: { 'orchestratie/beleid.json': beleidNieuw, 'orchestratie/BESLUITEN.md': `${besluitenNieuw}\nExtra regel.\n` } });
      const v2 = vs2.data?.voorstel;
      if (vs2.status === 200 && v2?.id) {
        const b2 = maakBesluit(v2);
        vertraging(800);
        const lopend = call(ORCH_ROUTES.regelsToepassen, { id: v2.id, besluit: b2 });
        await slaap(250);
        const ingetrokken = await call(ORCH_ROUTES.regelsIntrekken, { id: v2.id });
        const uitslag = await lopend;
        vertraging(0);
        const takkenNa = git(R, 'branch', '--list', 'regels/*').split('\n').map((s) => s.trim()).filter(Boolean);
        // Vóór de patch liep toepassen in één adem (synchroon): intrekken kwam dan pas erna en vond «toegepast». Beide uitkomsten zijn samenhangend;
        // wat nooit mag: een ingetrokken ontwerp dat tóch een tak oplevert.
        const samenhangend = (uitslag.status === 409 && uitslag.fout === 'GEEN_VOORSTEL' && ingetrokken.data?.staat === 'ingetrokken' && takkenNa.length === 1)
          || (uitslag.status === 200 && ingetrokken.data?.staat === 'toegepast' && takkenNa.length === 2);
        check('ai-mcp-09: intrekken tijdens het toepassen → óf ingetrokken en niets vastgelegd (geen tak, geen worktree), óf toegepast en niet ingetrokken; nooit beide',
          samenhangend && git(R, 'worktree', 'list').split('\n').length === 1 && git(R, 'status', '--porcelain') === '',
          `toepassen ${uitslag.status} ${uitslag.fout}, intrekken → ${ingetrokken.data?.staat}, takken ${takkenNa.length}`);
      } else check('ai-mcp-09: tweede voorstel voor de intrek-proef aangemaakt', false, `${vs2.status} ${JSON.stringify(vs2.data).slice(0, 200)}`);
    } else check('ai-mcp-09: voorstel voor de toepas-proef aangemaakt', false, `${vs.status} ${JSON.stringify(vs.data).slice(0, 300)}`);

    // ---- 8. grenzen: lezen via MCP per eigenaar, taak_start via MCP, lezen via de routes
    process.env.ORCH_WORTEL = leeg;   // geen werkkopie: elke aanroep is direct klaar (ORCH_GEEN_REPO), de teller telt wel
    hm._mcpLimietenLeeg();
    const telTot = async (naam: string, args: Record<string, unknown>, max: number) => {
      let geweigerdOp = 0;
      for (let i = 1; i <= max; i++) { const t = await tool(naam, args); if (t.tekst.startsWith('RATE_LIMITED')) { geweigerdOp = i; break; } }
      return geweigerdOp;
    };
    const opOverzicht = await telTot('orch_overzicht', {}, 400);
    const anderOverzicht = await tool('orch_overzicht', {}, { userId: 'u-ander', clientName: 'Codex', agent: 'codex' });
    const opContext = await telTot('orch_context', {}, 400);
    const opTaak = await telTot('orch_taak_start', { id: 'GRK-900', agent: 'grok', tak: 'feature/grk-900', basisCommit: '0'.repeat(40), omschrijving: 'proef' }, 200);
    check('ai-mcp-09: MCP-leeshulpmiddelen hebben een grens per eigenaar (orch_overzicht en orch_context: 240 per uur → de 241e RATE_LIMITED); een andere eigenaar wordt niet geraakt',
      opOverzicht === 241 && opContext === 241 && !anderOverzicht.tekst.startsWith('RATE_LIMITED'), `overzicht geweigerd op ${opOverzicht || 'nooit'}, context op ${opContext || 'nooit'}`);
    check('ai-mcp-09: orch_taak_start via MCP heeft dezelfde grens als de route (60 per uur → de 61e RATE_LIMITED)', opTaak === 61, `geweigerd op ${opTaak || 'nooit'}`);
    hm._mcpLimietenLeeg();
    process.env.ORCH_WORTEL = R;
    limietLog.length = 0; limietVol = false;
    const l1 = await roep(routesMetLimiet, ORCH_ROUTES.overzicht), l2 = await roep(routesMetLimiet, ORCH_ROUTES.context), l3 = await roep(routesMetLimiet, ORCH_ROUTES.regelsOverzicht);
    const leesSleutels = limietLog.filter((l) => l.sleutel === 'orch-lezen:u-owner');
    limietVol = true;
    const l4 = await roep(routesMetLimiet, ORCH_ROUTES.overzicht);
    check('ai-mcp-09: de leesroutes (overzicht, context, regels/overzicht) tellen mee in één grens per eigenaar per minuut; vol → 429 RATE_LIMITED',
      l1.status === 200 && l2.status === 200 && l3.status === 200 && leesSleutels.length === 3 && leesSleutels.every((l) => l.seconden === 60 && l.max >= 30 && l.max <= 600) && l4.status === 429 && l4.fout === 'RATE_LIMITED',
      `${l1.status}/${l2.status}/${l3.status}, sleutels ${JSON.stringify(limietLog.map((l) => l.sleutel))}, vol → ${l4.status} ${l4.fout}`);
  } finally {
    for (const n of namen) { if (oud[n] === undefined) delete process.env[n]; else process.env[n] = oud[n]; }
    try { hm._mcpLimietenLeeg(); opslag._controleInstellen?.({ timeoutMs: 120_000, onthoudMs: 30_000 }); } catch { /* module van vóór de patch */ }
    for (const p of [R, O, T]) rmSync(p, { recursive: true, force: true });
  }
}

// ================================================================================================ extensie-07
type Poort = { neem: (userId: string, bytes: number) => Promise<(() => void) | null>; stand: () => { totaalBytes: number; gebruikers: number; wachtenden: number } };

async function deelDrivePoort(check: Check): Promise<void> {
  const browser = await import('../../backend/google-suite-browser') as unknown as {
    maakDriveLeesPoort?: (g: { totaalBytes: number; perGebruikerBytes: number; wachtendenPerGebruiker: number; wachtendenTotaal: number; wachtMs: number }) => Poort;
    leesBegrensd?: (r: Response, grens: number) => Promise<Buffer | null>;
    DRIVE_LEES_GRENZEN?: { totaalBytes: number; perGebruikerBytes: number };
  };
  if (!browser.maakDriveLeesPoort || !browser.leesBegrensd || !browser.DRIVE_LEES_GRENZEN) {
    check('extensie-07: er is een poort met geheugenbudget en een begrensde lezer voor Drive-bestanden', false, 'ontbreekt: drive/file leest elk bestand onbegrensd en zonder grens op gelijktijdigheid in het geheugen');
    return;
  }
  const g = browser.DRIVE_LEES_GRENZEN;
  check('extensie-07: het budget laat per gebruiker en voor de hele server hooguit ÉÉN video van 128 MB tegelijk toe (twee passen niet), maar wel één plus een paar kleine',
    g.perGebruikerBytes >= 129 * MB && g.perGebruikerBytes < 2 * 128 * MB && g.totaalBytes >= g.perGebruikerBytes && g.totaalBytes < 2 * 128 * MB, `per gebruiker ${g.perGebruikerBytes / MB} MB, server ${g.totaalBytes / MB} MB`);
  const p = browser.maakDriveLeesPoort({ totaalBytes: 10 * MB, perGebruikerBytes: 6 * MB, wachtendenPerGebruiker: 2, wachtendenTotaal: 5, wachtMs: 300 });
  const volgorde: string[] = [];
  const vraag = (naam: string, user: string, mb: number) => p.neem(user, mb * MB).then((vrij) => { volgorde.push(`${naam}:${vrij ? 'ja' : 'nee'}`); return vrij; });
  const a1 = await vraag('a1', 'A', 5);    // server 5/10
  const a2 = vraag('a2', 'A', 5);          // wacht: A's eigen budget (6) is op
  const b1 = await vraag('b1', 'B', 4);    // een ander wordt daar niet door opgehouden — server 9/10
  const c1 = vraag('c1', 'C', 5);          // wacht: budget van de server
  const d1 = await vraag('d1', 'D', 1);    // klein past nog en wacht niet achter de grote — server 10/10
  const tijdens = p.stand();
  a1?.();                                   // A's eerste klaar: c1 (C wacht al en kreeg nog niets) gaat vóór a2 (A had net zijn beurt) — g05-toets-2
  const c1vrij = await c1;
  const naA = [...volgorde];
  const a2vrij = await a2;                  // niemand geeft vrij → loopt na 300 ms af
  check('extensie-07 (poort): wie op zijn EIGEN budget wacht houdt een ander niet op; een klein verzoek van een gebruiker die niets leest wacht niet achter een groot dat op het budget van de SERVER wacht; vrijgekomen budget gaat EERST naar wie nog geen beurt had (niet naar wie net las); te lang wachten → geweigerd',
    !!a1 && !!b1 && !!d1 && tijdens.totaalBytes === 10 * MB && tijdens.wachtenden === 2 && !!c1vrij && naA.join(',') === 'a1:ja,b1:ja,d1:ja,c1:ja' && a2vrij === null,
    'volgorde ' + volgorde.join(',') + '; tijdens ' + JSON.stringify(tijdens));
  const e1 = vraag('e1', 'A', 5), e2 = vraag('e2', 'A', 5), e3 = await vraag('e3', 'A', 5);   // rij van A is vol bij de derde
  check('extensie-07 (poort): volle rij per gebruiker → meteen geweigerd (geen onbegrensde rij)', e3 === null && p.stand().wachtenden === 2, JSON.stringify(p.stand()));
  c1vrij?.(); c1vrij?.(); b1?.(); d1?.();   // dubbel vrijgeven telt één keer; e1 mag nu, e2 wacht op A's eigen budget en loopt af
  const [e1vrij, e2vrij] = await Promise.all([e1, e2]);
  e1vrij?.(); e2vrij?.();
  const groot = await p.neem('Z', 500 * MB); // meer dan het hele budget: afgetopt, dus één tegelijk — nooit voorgoed geweigerd
  const tijdensGroot = p.stand().totaalBytes;
  groot?.();
  check('extensie-07 (poort): na afloop is alles vrijgegeven (ook na dubbel vrijgeven); een aanvraag groter dan het budget wordt afgetopt op het budget',
    !!e1vrij && e2vrij === null && p.stand().totaalBytes === 0 && p.stand().wachtenden === 0 && p.stand().gebruikers === 0 && !!groot && tijdensGroot === 6 * MB, JSON.stringify(p.stand()) + ' groot ' + tijdensGroot / MB + ' MB');

  // g05-toets-2: eerlijk tussen gebruikers. A houdt zijn rij voortdurend vol met grote video's; B vraagt één groot bestand.
  // Vóór de verbetering kreeg A's volgende verzoek het vrijgekomen budget telkens eerst (A stond vooraan in de rij, of zijn verzoek paste
  // nog in het restje), zodat B na wachtMs 429 kreeg — zo lang A dat volhield. Nu: wie nog geen beurt had gaat voor, en wie al leest
  // mag geen budget nemen dat een wachtende van een ander nodig heeft.
  const eerlijk = async (aMb: number, aDuurMs: number, aTegelijk: number) => {
    const pe = browser.maakDriveLeesPoort!({ ...g, wachtendenPerGebruiker: 24, wachtendenTotaal: 96, wachtMs: 3000 });
    let stop = false, aKlaar = 0, aGeweigerd = 0;
    const lopend = new Set<Promise<void>>();
    const vulA = async () => {
      while (!stop) {
        while (lopend.size < aTegelijk && !stop) {
          const q = (async () => { const v = await pe.neem('A', aMb * MB); if (!v) { aGeweigerd++; return; } await slaap(aDuurMs); aKlaar++; v(); })();
          lopend.add(q); void q.finally(() => lopend.delete(q));
        }
        await slaap(10);
      }
    };
    const a = vulA();
    await slaap(150);
    const t0 = Date.now(), vb = await pe.neem('B', 101 * MB), duur = Date.now() - t0, aBijB = aKlaar;
    vb?.();
    stop = true; await a; await Promise.all([...lopend]);
    return { ok: !!vb, duur, aBijB, aGeweigerd, eind: pe.stand() };
  };
  const vol = await eerlijk(121, 150, 25);      // één video van A tegelijk «onderweg», 24 in de rij
  const gespreid = await eerlijk(34, 300, 25);  // A houdt met vier kleinere bestanden steeds zijn volle 136 MB bezet
  check('extensie-07 (poort, g05-toets-2): A houdt zijn rij vol met video\'s van 121 MB → het bestand van 101 MB van B is aan de beurt zodra A\'s lopende lezing klaar is (geen 429 na het wachten); ook als A zijn budget met vier kleinere bestanden steeds bijvult',
    vol.ok && vol.duur < 1500 && gespreid.ok && gespreid.duur < 1500 && vol.eind.totaalBytes === 0 && gespreid.eind.totaalBytes === 0,
    `vol: B ${vol.ok ? 'kreeg beurt' : 'GEWEIGERD'} na ${vol.duur} ms (A las intussen ${vol.aBijB}); gespreid: B ${gespreid.ok ? 'kreeg beurt' : 'GEWEIGERD'} na ${gespreid.duur} ms (A las intussen ${gespreid.aBijB}); eind ${JSON.stringify(vol.eind)} ${JSON.stringify(gespreid.eind)}`);

  // …maar wie een video bekijkt, kan intussen nog kleine bestanden openen (tot 8 MB tegelijk langs de reservering), geen grote.
  {
    const pk = browser.maakDriveLeesPoort!({ ...g, wachtMs: 2000 });
    const aVideo = await pk.neem('A', 121 * MB);
    const bWacht = pk.neem('B', 101 * MB);                 // wacht op de server → reservering
    const t0 = Date.now();
    const aKlein = await pk.neem('A', 1 * MB), aKlein2 = await pk.neem('A', 2 * MB);
    const kleinDuur = Date.now() - t0;
    let middelKreeg = false;
    const aMiddelP = pk.neem('A', 30 * MB).then((v) => { middelKreeg = !!v; return v; }); // past in de server, maar zou B's reservering opeten → wacht
    await slaap(60);
    const middelVoor = middelKreeg;
    aKlein?.(); aKlein2?.(); aVideo?.();
    const bVrij = await bWacht, aMiddel = await aMiddelP; bVrij?.(); aMiddel?.();
    check('extensie-07 (poort, g05-toets-2): wie zelf een video leest, opent intussen nog kleine bestanden (langs de reservering van een ander, hooguit 8 MB), maar geen bestand van 30 MB dat de wachtende ander zou verdringen',
      !!aVideo && !!aKlein && !!aKlein2 && kleinDuur < 100 && !middelVoor && !!bVrij && pk.stand().totaalBytes === 0,
      `klein ${aKlein && aKlein2 ? 'meteen' : 'NIET'} (${kleinDuur} ms), 30 MB ${middelVoor ? 'KREEG meteen budget' : 'wachtte'}, B ${bVrij ? 'kreeg daarna zijn beurt' : 'GEWEIGERD'}; ${JSON.stringify(pk.stand())}`);
  }

  // De begrensde lezer: breekt af zodra de grens overschreden is en haalt de rest niet meer op.
  let getrokken = 0;
  const stroom = (totaal: number) => new ReadableStream<Uint8Array>({ pull(c) { if (getrokken >= totaal) { c.close(); return; } getrokken += MB; c.enqueue(new Uint8Array(MB).fill(65)); } });
  const teGroot = await browser.leesBegrensd(new Response(stroom(40 * MB)), 3 * MB);
  const getrokkenTeGroot = getrokken; getrokken = 0;
  const past = await browser.leesBegrensd(new Response(stroom(2 * MB)), 3 * MB);
  getrokken = 0;
  const kop = await browser.leesBegrensd(new Response(stroom(40 * MB), { headers: { 'content-length': String(40 * MB) } }), 3 * MB);
  check('extensie-07 (lezer): een lichaam groter dan de grens wordt afgebroken (niet eerst helemaal gebufferd); Content-Length boven de grens → niets gelezen; binnen de grens → de volledige inhoud',
    teGroot === null && getrokkenTeGroot <= 6 * MB && kop === null && getrokken <= 2 * MB && !!past && past.length === 2 * MB && past[0] === 65,
    `opgehaald bij te groot: ${getrokkenTeGroot / MB} MB van 40; bij Content-Length: ${getrokken / MB} MB`);
}

async function deelDriveRoute(check: Check): Promise<void> {
  if (!process.env.DATABASE_URL) { check('extensie-07: testdatabase beschikbaar (DATABASE_URL) voor de proef met de route drive/file', false, 'DATABASE_URL ontbreekt'); return; }
  const CLIENT_REF = 'google_suite_web_oauth_client', DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
  const grantKey = `eenheidstest-grant-sleutel-${randomBytes(16).toString('hex')}`;
  const oudEnv = { a: process.env.GOOGLE_OAUTH_CLIENT_ID, b: process.env.GOOGLE_OAUTH_CLIENT_SECRET, c: process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 };
  process.env.GOOGLE_OAUTH_CLIENT_ID = '1234567890-sec002-g05.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = `eenheidstest-client-geheim-${randomBytes(12).toString('hex')}`;
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = grantKey;

  // ---- de nagebootste Google Drive: metadata, inhoud als stroom (telt wat er werkelijk wordt opgehaald en hoeveel er tegelijk lopen)
  type NepBestand = { name: string; mimeType: string; size?: number; werkelijk: number; vertraging?: number | ((nr: number) => number); fout?: number };
  const bestanden = new Map<string, NepBestand>();
  const meter = { bezig: 0, maxBezig: 0, getrokken: 0, inhoudVerzoeken: 0 };
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      const refresh = String(new URLSearchParams(String(init?.body || '')).get('refresh_token') || '');
      return refresh ? new Response(JSON.stringify({ access_token: `at-${refresh}`, scope: DRIVE_SCOPE, expires_in: 3600 }), { status: 200 }) : new Response('{"error":"invalid_grant"}', { status: 400 });
    }
    const m = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)(\/export)?\?(.*)$/.exec(url);
    const f = m ? bestanden.get(decodeURIComponent(m[1])) : undefined;
    if (!m || !f) return new Response('{}', { status: 404 });
    if (!m[2] && !/alt=media/.test(m[3])) {
      return new Response(JSON.stringify({ id: decodeURIComponent(m[1]), name: f.name, mimeType: f.mimeType, modifiedTime: '2026-11-12T10:00:00Z', ...(f.size === undefined ? {} : { size: String(f.size) }) }), { status: 200 });
    }
    meter.inhoudVerzoeken++; meter.bezig++; meter.maxBezig = Math.max(meter.maxBezig, meter.bezig);
    let af = false; const klaar = () => { if (!af) { af = true; meter.bezig--; } };
    await slaap(typeof f.vertraging === 'function' ? f.vertraging(meter.inhoudVerzoeken) : f.vertraging ?? 100);
    if (f.fout) { klaar(); return new Response('{}', { status: f.fout }); }
    let verzonden = 0;
    const stroom = new ReadableStream<Uint8Array>({
      pull(c) { if (verzonden >= f.werkelijk) { c.close(); klaar(); return; } const n = Math.min(MB, f.werkelijk - verzonden); verzonden += n; meter.getrokken += n; c.enqueue(new Uint8Array(n).fill(66)); },
      cancel() { klaar(); },
    });
    return new Response(stroom, { status: 200, headers: { 'content-type': m[2] ? 'application/pdf' : f.mimeType } });
  }) as typeof fetch;

  const { getPool } = await import('../../server/platform/pg');
  const { db } = await import('../../server/platform');
  const { ladeVelden } = await import('../../shared/ruimte-scheiding');
  const browser = await import('../../backend/google-suite-browser') as typeof import('../../backend/google-suite-browser') & { _driveLeesStand?: () => { totaalBytes: number; wachtenden: number } };
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const gebruikers: string[] = [];
  const maakGebruiker = async (naam: string) => {
    const id = randomUUID(), email = `${naam}-${sfx}@eenheid.test`;
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]);
    gebruikers.push(id);
    const velden = ladeVelden({ userId: id, ruimte: 'prive' }), nu = Date.now(), SUB = `sub-${naam}-${sfx}`, refresh = `refresh-${naam}-${sfx}`;
    const [principalId] = await db.add('provider_principals_v1', [{ ...velden, provider: 'google', providerAccountId: SUB, identityProviderAccountId: SUB, email, displayName: naam, picture: '', accountRole: 'primary', identityLinked: true, createdAt: nu, updatedAt: nu }]);
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(grantKey, 'utf8').digest(), iv);
    cipher.setAAD(Buffer.from(`google-oauth-grant-v1|${id}|${principalId}|${SUB}|${CLIENT_REF}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(refresh, 'utf8'), cipher.final()]);
    const envelop = { algorithm: 'AES-256-GCM', keyVersion: 1, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
    const [grantId] = await db.add('google_oauth_grant_v1', [{ ...velden, principalId, providerAccountId: SUB, provider: 'google', clientRef: CLIENT_REF, tokenKind: 'refresh_token', ...envelop, grantedScopes: [DRIVE_SCOPE], grantStatus: 'active', issuedAt: nu, lastVerifiedAt: nu, updatedAt: nu, revokedAt: 0 }]);
    await db.add('provider_service_tokens_v1', [{ ...velden, principalId, provider: 'google', service: 'drive', tokenName: 'google_drive_token', tokenKind: 'logical_handle', oauthGrantId: grantId, requiredScopes: [DRIVE_SCOPE], status: 'active', createdAt: nu, updatedAt: nu, revokedAt: 0 }]);
    await db.add('provider_service_grants_v1', [{ ...velden, principalId, provider: 'google', service: 'drive', tokenName: 'google_drive_token', oauthClientName: CLIENT_REF, status: 'connected', accountId: '', grantedScopes: [DRIVE_SCOPE], createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
    await db.add('cloud_provider_accounts_v1', [{ ...velden, principalId, provider: 'google_drive', service: 'drive', tokenName: 'google_drive_token', accountRole: 'primary', providerAccountId: SUB, email, displayName: naam, picture: '', status: 'connected', grantedScopes: [DRIVE_SCOPE], scopeMode: 'full_drive', connectionStage: 'oauth_complete_sync_not_started', lastErrorCode: '', createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
    return { id, email };
  };
  type Resp = { statusCode: number; body: string; headers?: Record<string, string> };
  try {
    const A = await maakGebruiker('anna'), B = await maakGebruiker('bas');
    const personen: Record<string, { id: string; email: string }> = { A, B };
    const routes = browser.createGoogleSuiteBrowserRoutes((async (event: Record<string, unknown>) => ({ service: 'cloud', user: { id: personen[String(event.wie)].id, email: personen[String(event.wie)].email, status: 'approved', role: 'member' } })) as never) as unknown as Record<string, Array<(ctx: unknown) => Promise<Resp>>>;
    const lees1 = async (wie: 'A' | 'B', fileId: string) => {
      const begin = performance.now();
      const res = await routes['POST /api/owner/cloud/google-suite/drive/file'][0]({ event: { wie }, body: { fileId }, params: {} });
      let data: Record<string, any> = {}; try { data = JSON.parse(res.body || '{}'); } catch { data = {}; }
      return { status: res.statusCode, data, fout: String(data.error || ''), headers: res.headers || {}, klaarOp: performance.now(), duur: performance.now() - begin };
    };
    const nul = () => { meter.bezig = 0; meter.maxBezig = 0; meter.getrokken = 0; meter.inhoudVerzoeken = 0; };
    const stand = () => browser._driveLeesStand?.() ?? { totaalBytes: -1, wachtenden: -1 };

    // ---- 0. gewone bestanden werken zoals voorheen
    bestanden.set('klein-tekst', { name: 'notitie.txt', mimeType: 'text/plain', size: 3000, werkelijk: 3000, vertraging: 10 });
    bestanden.set('doc-klein', { name: 'Document', mimeType: 'application/vnd.google-apps.document', werkelijk: 2 * MB, vertraging: 10 });
    const klein = await lees1('A', 'klein-tekst'), doc = await lees1('A', 'doc-klein');
    check('extensie-07: een gewoon bestand en een Google-document (export naar pdf) worden gelezen zoals voorheen (naam, soort, grootte, inhoud in base64)',
      klein.status === 200 && klein.data.name === 'notitie.txt' && klein.data.kind === 'text' && klein.data.sizeBytes === 3000 && Buffer.from(klein.data.data, 'base64').equals(Buffer.alloc(3000, 66))
      && doc.status === 200 && doc.data.mimeType === 'application/pdf' && doc.data.kind === 'pdf' && doc.data.sizeBytes === 2 * MB,
      `${klein.status} ${klein.fout} | ${doc.status} ${doc.fout}`);

    // ---- 1. DE AANVAL: tien gelijktijdige verzoeken om een video van 120 MB door één gebruiker
    // (de opgegeven grootte is 120 MB; het nagebootste lichaam is klein, zodat de test zelf geen geheugen opeet — het gaat om hoeveel er TEGELIJK lopen)
    bestanden.set('video-120', { name: 'film.mp4', mimeType: 'video/mp4', size: 120 * MB, werkelijk: 64 * 1024, vertraging: 120 });
    nul();
    const tien = await Promise.all(Array.from({ length: 10 }, () => lees1('A', 'video-120')));
    check('extensie-07: tien gelijktijdige verzoeken om een video van 120 MB door één gebruiker → nooit meer dan ÉÉN tegelijk in het geheugen (de rest wacht op zijn beurt); alle tien slagen',
      meter.maxBezig === 1 && tien.every((r) => r.status === 200 && r.data.sizeBytes === 64 * 1024), `tegelijk opgehaald: ${meter.maxBezig} (verwacht 1); statussen ${[...new Set(tien.map((r) => r.status))].join('/')}`);
    // ---- 2. twee gebruikers: samen ook niet meer dan één grote tegelijk; een klein bestand van de ander wacht niet op de rij van de eerste
    nul();
    bestanden.get('video-120')!.vertraging = 400;
    const beginAB = performance.now();
    const [va, vb, kb] = await Promise.all([lees1('A', 'video-120'), lees1('B', 'video-120'), (async () => { await slaap(60); return lees1('B', 'klein-tekst'); })()]);
    check('extensie-07: twee gebruikers met elk een video van 120 MB → samen ook maar één tegelijk (budget van de server); het kleine bestand van de ander is klaar terwijl de video nog loopt',
      va.status === 200 && vb.status === 200 && kb.status === 200 && kb.klaarOp - beginAB < 350 && Math.max(va.klaarOp, vb.klaarOp) - beginAB > 750,
      `klein klaar na ${Math.round(kb.klaarOp - beginAB)} ms; video's klaar na ${Math.round(va.klaarOp - beginAB)} en ${Math.round(vb.klaarOp - beginAB)} ms (na elkaar = > 750 ms)`);
    // ---- 3. de rij is begrensd: wie meer opstapelt krijgt 429 met Retry-After, niet een onbegrensde rij
    // Het eerste verzoek blijft 1,5 s onderweg (zo staan de andere 29 zeker tegelijk voor de poort), de volgende zijn kort.
    nul();
    bestanden.get('video-120')!.vertraging = (nr) => (nr === 1 ? 1500 : 10);
    const dertig = await Promise.all(Array.from({ length: 30 }, () => lees1('A', 'video-120')));
    const vol = dertig.filter((r) => r.status === 429);
    check('extensie-07: dertig gelijktijdige grote verzoeken van één gebruiker → één loopt, 24 wachten en slagen daarna, de rest krijgt meteen 429 CLOUD_GOOGLE_FILE_BUSY met Retry-After',
      meter.maxBezig === 1 && vol.length === 5 && vol.every((r) => r.fout === 'CLOUD_GOOGLE_FILE_BUSY' && r.headers['Retry-After'] === '5' && r.duur < 1400) && dertig.filter((r) => r.status === 200).length === 25,
      `tegelijk ${meter.maxBezig}; 200: ${dertig.filter((r) => r.status === 200).length}, 429: ${vol.length}, anders: ${dertig.filter((r) => ![200, 429].includes(r.status)).map((r) => `${r.status} ${r.fout}`).join(',') || '—'}`);
    // ---- 4. de opgegeven grootte is geen belofte: een lichaam dat groter is wordt afgebroken, niet eerst helemaal gebufferd
    bestanden.set('liegt', { name: 'groot.bin', mimeType: 'application/octet-stream', size: 1 * MB, werkelijk: 40 * MB, vertraging: 10 });
    nul();
    const liegt = await lees1('A', 'liegt');
    const getrokkenLiegt = meter.getrokken;
    check('extensie-07: bestand met opgegeven grootte 1 MB dat 40 MB blijkt te sturen → 413 en het ophalen stopt bij de grens (niet eerst 40 MB in het geheugen)',
      liegt.status === 413 && liegt.fout === 'CLOUD_GOOGLE_FILE_TOO_LARGE' && getrokkenLiegt <= 5 * MB, `${liegt.status} ${liegt.fout}; opgehaald ${Math.round(getrokkenLiegt / MB)} MB van 40`);
    // ---- 5. een export heeft geen opgegeven grootte: eigen grens (Google weigert zelf boven 10 MB)
    bestanden.set('doc-groot', { name: 'Reuzendocument', mimeType: 'application/vnd.google-apps.document', werkelijk: 24 * MB, vertraging: 10 });
    nul();
    const docGroot = await lees1('A', 'doc-groot');
    check('extensie-07: export zonder opgegeven grootte die 24 MB stuurt → 413, afgebroken bij de exportgrens (12 MB)',
      docGroot.status === 413 && meter.getrokken <= 15 * MB, `${docGroot.status} ${docGroot.fout}; opgehaald ${Math.round(meter.getrokken / MB)} MB van 24`);
    // ---- 6. een te grote opgave wordt nog steeds vooraf geweigerd; een fout van Google geeft het budget terug
    bestanden.set('video-200', { name: 'lang.mp4', mimeType: 'video/mp4', size: 200 * MB, werkelijk: 1024 });
    bestanden.set('kapot', { name: 'kapot.pdf', mimeType: 'application/pdf', size: 20 * MB, werkelijk: 0, fout: 500, vertraging: 10 });
    bestanden.set('pdf-100', { name: 'te-groot.pdf', mimeType: 'application/pdf', size: 100 * MB, werkelijk: 1024 });
    nul();
    const v200 = await lees1('A', 'video-200'), pdf100 = await lees1('A', 'pdf-100');
    const zonderInhoud = meter.inhoudVerzoeken;
    const kapot: Array<Awaited<ReturnType<typeof lees1>>> = [];
    for (let i = 0; i < 12; i++) kapot.push(await lees1('A', 'kapot'));
    const naFouten = await lees1('A', 'klein-tekst');
    await slaap(150);
    check('extensie-07: opgave boven de grens (video 200 MB, pdf 100 MB) → vooraf 413 zonder iets op te halen; twaalf mislukte leespogingen (Google 500 → 502) geven hun budget terug: daarna werkt lezen meteen en staat de teller op nul',
      v200.status === 413 && pdf100.status === 413 && zonderInhoud === 0 && kapot.every((r) => r.status === 502 && r.fout === 'CLOUD_GOOGLE_FILE_READ_FAILED') && naFouten.status === 200 && naFouten.duur < 2000 && stand().totaalBytes === 0 && stand().wachtenden === 0,
      `${v200.status}/${pdf100.status}, inhoud opgehaald ${zonderInhoud}×, fouten ${[...new Set(kapot.map((r) => `${r.status} ${r.fout}`))].join(',')}, daarna ${naFouten.status} in ${Math.round(naFouten.duur)} ms, stand ${JSON.stringify(stand())}`);
  } finally {
    globalThis.fetch = echteFetch;
    await pool.query(`DELETE FROM app.records WHERE tbl IN ('provider_principals_v1','provider_service_tokens_v1','provider_service_grants_v1','google_oauth_grant_v1','cloud_provider_accounts_v1','cloud_provider_selections_v1','cloud_audit_v1') AND data->>'ownerUserId' = ANY($1)`, [gebruikers]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [gebruikers]).catch(() => undefined);
    for (const [k, v] of [['GOOGLE_OAUTH_CLIENT_ID', oudEnv.a], ['GOOGLE_OAUTH_CLIENT_SECRET', oudEnv.b], ['GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', oudEnv.c]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g05-20261112');
  const veilig = async (naam: string, werk: () => Promise<void> | void) => { try { await werk(); } catch (e) { check(`${naam}: het blok liep zonder onverwachte fout`, false, String((e as Error)?.stack || e).slice(0, 600)); } };
  await veilig('server-uitrol-07', () => deelBackup(check));
  await veilig('ai-mcp-09', () => deelOrch(check));
  await veilig('extensie-07 (poort en lezer)', () => deelDrivePoort(check));
  await veilig('extensie-07 (route)', () => deelDriveRoute(check));
  return einde();
}
