// ORCH-001 етап 1: один конвеєр приймання для всіх каналів (ZIP, TAR.GZ, git patch, тека, git-гілка, MCP-мітка), послідовна черга,
// статуси in_progress/integrated/released/installed. Усе — на справжніх git-репозиторіях у тимчасовій теці; перевіряється вміст, не метадані.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const sh = (cwd: string, cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout.trim(); };
const git = (cwd: string, ...a: string[]) => sh(cwd, 'git', a);
const orch = (cwd: string, ...a: string[]) => { const r = spawnSync(process.execPath, [join(cwd, 'scripts/orch.mjs'), ...a], { cwd, encoding: 'utf8' }); return { code: r.status ?? -1, uit: `${r.stdout}${r.stderr}` }; };
const lees = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(lees(p));
const CONTROLEER = 'node scripts/orch.mjs controleer';

/** Репозиторій-«origin» з гілкою integratie, правилами, lock і контекстом; повертає шлях і базовий commit. */
function maakRepo(): { R: string; basis: string; beleid: any; lock: any } {
  const R = mkdtempSync(join(tmpdir(), 'orch-repo-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules', 'scripts/orch.mjs', 'scripts/orch', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md', 'orchestratie/eigenaar-ondertekenaars', 'orchestratie/sjablonen']) cpSync(p, join(R, p), { recursive: true });
  cpSync('.github/copilot-instructions.md', join(R, '.github/copilot-instructions.md'));
  mkdirSync(join(R, 'src')); writeFileSync(join(R, 'src/a.ts'), 'export const a = 1;\n'); writeFileSync(join(R, 'src/b.ts'), 'export const b = 2;\n');
  writeFileSync(join(R, 'orchestratie/wachtrij.json'), JSON.stringify({ schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] }, null, 2));
  git(R, 'init', '-q', '-b', 'integratie'); git(R, 'config', 'user.email', 'eigenaar@test'); git(R, 'config', 'user.name', 'eigenaar');
  orch(R, 'vergrendel'); orch(R, 'context');
  git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'basis');
  return { R, basis: git(R, 'rev-parse', 'HEAD'), beleid: json(join(R, 'orchestratie/beleid.json')), lock: json(join(R, 'orchestratie/regels.lock.json')) };
}
/** Робоча тека агента без git: export бази + зміни. */
function agentWerk(R: string, basis: string): string { const W = mkdtempSync(join(tmpdir(), 'orch-agent-')); execFileSync('sh', ['-c', `git -C "${R}" archive ${basis} | tar -x -C "${W}"`]); return W; }
const overdracht = (o: Record<string, unknown>) => ({ schema: 1, agentPlatform: 'test', model: { id: null, versie: null, bron: 'onbekend' }, kanaal: 'zip', zonderGit: 'агент без git у тесті', commits: [], tests: { geslaagd: 1, mislukt: 0 }, nietGedaan: { uk: '—', nl: '—' }, conflicten: [], aangemaakt: '2026-10-31T13:00:00Z', ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-inleveren');
  const { R, basis, beleid, lock } = maakRepo();
  const basisOd = (id: string, tak: string, extra: Record<string, unknown> = {}) => overdracht({ taakId: id, agent: 'chatgpt', basisCommit: basis, regelsVersie: beleid.regelsVersie, regelsHash: lock.hash, tak, samenvatting: { uk: 'Тестова передача: зміна a.ts і новий файл nieuw.ts', nl: 'Testoverdracht: a.ts gewijzigd, nieuw.ts toegevoegd' }, ...extra });
  const records = () => (existsSync(join(R, 'orchestratie/inleveringen')) ? readdirSync(join(R, 'orchestratie/inleveringen')) : []);
  try {
    // A — ZIP від агента без git (ChatGPT): лише змінені файли + ORCH-OVERDRACHT.json
    const W1 = agentWerk(R, basis);
    writeFileSync(join(W1, 'src/a.ts'), 'export const a = 10; // chatgpt\n'); writeFileSync(join(W1, 'src/nieuw.ts'), 'export const nieuw = true;\n');
    writeFileSync(join(W1, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('CHT-001', 'feature/cht-001-20261031-130000', { bestanden: { gewijzigd: ['src/a.ts'], toegevoegd: ['src/nieuw.ts'], verwijderd: [] } })));
    const zipA = join(W1, 'cht-001.zip'); sh(W1, 'zip', ['-q', zipA, 'src/a.ts', 'src/nieuw.ts', 'ORCH-OVERDRACHT.json']);
    let r = orch(R, 'inleveren', '--bron', zipA, '--tests', CONTROLEER);
    check('A zip: прийнято, канал zip, 2 файли', r.code === 0 && r.uit.includes('aanvaard') && r.uit.includes('kanaal zip') && r.uit.includes('bestanden 2'), r.uit);
    check('A zip: гілка існує від бази, вміст a.ts з архіву, integratie не змінено', git(R, 'merge-base', 'feature/cht-001-20261031-130000', 'integratie') === basis && git(R, 'show', 'feature/cht-001-20261031-130000:src/a.ts').includes('chatgpt') && git(R, 'show', 'integratie:src/a.ts') === 'export const a = 1;');
    check('A zip: ORCH-OVERDRACHT.json не потрапив у гілку', spawnSync('git', ['cat-file', '-e', 'feature/cht-001-20261031-130000:ORCH-OVERDRACHT.json'], { cwd: R }).status !== 0);
    const recA = records().find((n) => n.startsWith('CHT-001-'));
    check('A zip: запис передачі з sha256 джерела, тестами й зауваженнями', !!recA && (() => { const j = json(join(R, 'orchestratie/inleveringen', recA!)); return j.uitkomst === 'aanvaard' && /^[0-9a-f]{64}$/.test(j.bronSha256) && j.tests.geslaagd === 1 && j.tests.mislukt === 0 && j.bestanden.length === 2 && j.overdracht.taakId === 'CHT-001'; })());
    const tA = json(join(R, 'orchestratie/taken/CHT-001.json'));
    check('A zip: задачу зареєстровано з передачі (агент без репозиторію), staat ter_integratie', tA.geregistreerdBijInlevering === true && tA.staat === 'ter_integratie' && tA.overdrachten.length === 1);
    check('A zip: у черзі CHT-001 як wacht', json(join(R, 'orchestratie/wachtrij.json')).wachtrij.some((x: any) => x.taakId === 'CHT-001' && x.staat === 'wacht'));
    check('A zip: заявлені файли збіглися з diff → без BESTANDEN_AFWIJKEND', !r.uit.includes('BESTANDEN_AFWIJKEND'));

    // B — TAR.GZ з видаленням файла (Grok), канал позначено як mcp
    const W2 = agentWerk(R, basis); rmSync(join(W2, 'src/b.ts'));
    writeFileSync(join(W2, 'src/c.ts'), 'export const c = 3;\n');
    writeFileSync(join(W2, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('GRK-001', 'feature/grk-001-20261031-130100', { agent: 'grok', kanaal: 'mcp', bestanden: { gewijzigd: [], toegevoegd: ['src/c.ts'], verwijderd: ['src/b.ts'] } })));
    const tarB = join(W2, 'grk.tar.gz'); sh(W2, 'tar', ['-czf', tarB, 'src/c.ts', 'ORCH-OVERDRACHT.json']);
    r = orch(R, 'inleveren', '--bron', tarB, '--kanaal', 'mcp', '--tests', CONTROLEER);
    check('B tar.gz через MCP: прийнято, канал mcp, b.ts видалено, c.ts додано', r.code === 0 && r.uit.includes('kanaal mcp') && spawnSync('git', ['cat-file', '-e', 'feature/grk-001-20261031-130100:src/b.ts'], { cwd: R }).status !== 0 && git(R, 'show', 'feature/grk-001-20261031-130100:src/c.ts').includes('c = 3'), r.uit);

    // C — git patch (Codex) з окремим --overdracht
    git(R, 'checkout', '-q', '-b', 'tmp-codex', basis); writeFileSync(join(R, 'src/b.ts'), 'export const b = 20; // codex\n'); git(R, 'add', 'src/b.ts'); git(R, 'commit', '-q', '-m', 'codex werk');
    const patchMap = mkdtempSync(join(tmpdir(), 'orch-patch-')); git(R, 'format-patch', '-q', '-1', '-o', patchMap); git(R, 'checkout', '-q', 'integratie'); git(R, 'branch', '-q', '-D', 'tmp-codex');
    const odC = join(patchMap, 'od.json'); writeFileSync(odC, JSON.stringify(basisOd('CDX-001', 'feature/cdx-001-20261031-130200', { agent: 'codex', kanaal: 'git_patch' })));
    r = orch(R, 'inleveren', '--bron', join(patchMap, readdirSync(patchMap).find((n) => n.endsWith('.patch'))!), '--overdracht', odC, '--tests', CONTROLEER);
    check('C patch: прийнято (git am), b.ts змінено у власній гілці', r.code === 0 && r.uit.includes('kanaal git_patch') && git(R, 'show', 'feature/cdx-001-20261031-130200:src/b.ts').includes('codex'), r.uit);

    // D — застаріла база з перетином: інший агент уже змінив a.ts в integratie
    writeFileSync(join(R, 'src/a.ts'), 'export const a = 99; // antigravity in integratie\n'); git(R, 'add', 'src/a.ts'); git(R, 'commit', '-q', '-m', 'antigravity: a.ts');
    const W3 = agentWerk(R, basis); writeFileSync(join(W3, 'src/a.ts'), 'export const a = 42; // gemini op oude basis\n');
    writeFileSync(join(W3, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('GEM-001', 'feature/gem-001-20261031-130300', { agent: 'gemini' })));
    const zipD = join(W3, 'gem.zip'); sh(W3, 'zip', ['-q', zipD, 'src/a.ts', 'ORCH-OVERDRACHT.json']);
    r = orch(R, 'inleveren', '--bron', zipD, '--tests', CONTROLEER);
    check('D застаріла база: відхилено з BASIS_VEROUDERD_OVERLAP і CONFLICT (a.ts)', r.code === 1 && r.uit.includes('geweigerd') && r.uit.includes('BASIS_VEROUDERD_OVERLAP') && r.uit.includes('CONFLICT') && r.uit.includes('a.ts'), r.uit);
    check('D застаріла база: гілки не лишилося, в черзі нема, integratie не перезаписано', spawnSync('git', ['rev-parse', '--verify', '-q', 'feature/gem-001-20261031-130300'], { cwd: R }).status !== 0 && !json(join(R, 'orchestratie/wachtrij.json')).wachtrij.some((x: any) => x.taakId === 'GEM-001') && git(R, 'show', 'integratie:src/a.ts').includes('antigravity'));
    check('D застаріла база: відмову теж записано (аудит)', records().some((n) => n.startsWith('GEM-001-') && json(join(R, 'orchestratie/inleveringen', n)).uitkomst === 'geweigerd'));

    // E/F/G/H — без ORCH-OVERDRACHT, застарілі правила, впалі тести, свідомий пропуск тестів
    const W4 = agentWerk(R, basis); writeFileSync(join(W4, 'src/d.ts'), 'export const d = 4;\n');
    const zipE = join(W4, 'e.zip'); sh(W4, 'zip', ['-q', zipE, 'src/d.ts']);
    r = orch(R, 'inleveren', '--bron', zipE);
    check('E без ORCH-OVERDRACHT.json → OVERDRACHT_ONTBREEKT', r.code === 1 && r.uit.includes('OVERDRACHT_ONTBREEKT'), r.uit);
    writeFileSync(join(W4, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('CPL-001', 'feature/cpl-001-20261031-130400', { agent: 'copilot', regelsVersie: '0.9.0', regelsHash: 'a'.repeat(64) })));
    const zipF = join(W4, 'f.zip'); sh(W4, 'zip', ['-q', zipF, 'src/d.ts', 'ORCH-OVERDRACHT.json']);
    r = orch(R, 'inleveren', '--bron', zipF, '--tests', CONTROLEER);
    check('F застарілі правила агента → REGELS_VEROUDERD + REGELS_HASH, відхилено', r.code === 1 && r.uit.includes('REGELS_VEROUDERD') && r.uit.includes('REGELS_HASH'), r.uit);
    writeFileSync(join(W4, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('CPL-001', 'feature/cpl-001-20261031-130400', { agent: 'copilot' })));
    rmSync(zipF); sh(W4, 'zip', ['-q', zipF, 'src/d.ts', 'ORCH-OVERDRACHT.json']);
    r = orch(R, 'inleveren', '--bron', zipF, '--tests', 'node -e "process.exit(3)"');
    check('G тести впали → TESTS_MISLUKT, відхилено, гілку прибрано', r.code === 1 && r.uit.includes('TESTS_MISLUKT') && spawnSync('git', ['rev-parse', '--verify', '-q', 'feature/cpl-001-20261031-130400'], { cwd: R }).status !== 0, r.uit);
    r = orch(R, 'inleveren', '--bron', zipF, '--zonder-tests', 'тести виконано в середовищі агента, лог у звіті');
    const recH = records().filter((n) => n.startsWith('CPL-001-')).map((n) => json(join(R, 'orchestratie/inleveringen', n))).find((j) => j.uitkomst === 'aanvaard');
    check('H --zonder-tests з причиною → прийнято, причина збережена в записі', r.code === 0 && !!recH && recH.tests.overgeslagen === true && /лог у звіті/.test(recH.tests.reden), r.uit);
    check('H: шаблонний regelsHash «<…>» відхиляється окремим кодом', (() => { writeFileSync(join(W4, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('CPL-002', 'feature/cpl-002-20261031-130500', { regelsHash: '<orchestratie/regels.lock.json → hash>' }))); const z = join(W4, 'h2.zip'); sh(W4, 'zip', ['-q', z, 'src/d.ts', 'ORCH-OVERDRACHT.json']); return orch(R, 'inleveren', '--bron', z).uit.includes('OVERDRACHT_SJABLOON'); })());

    // H2 — передача, що підміняє стан координації (черга) → відхилено
    const W5 = agentWerk(R, basis); writeFileSync(join(W5, 'orchestratie/wachtrij.json'), JSON.stringify({ schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] }));
    writeFileSync(join(W5, 'src/f.ts'), 'export const f = 6;\n');
    writeFileSync(join(W5, 'ORCH-OVERDRACHT.json'), JSON.stringify(basisOd('CRS-001', 'feature/crs-001-20261031-130450', { agent: 'cursor' })));
    const zipH2 = join(W5, 'h2.zip'); sh(W5, 'zip', ['-q', zipH2, 'src/f.ts', 'orchestratie/wachtrij.json', 'ORCH-OVERDRACHT.json']);
    r = orch(R, 'inleveren', '--bron', zipH2, '--tests', CONTROLEER);
    check('H2 передача змінює orchestratie/wachtrij.json → BESCHERMDE_BESTANDEN, відхилено, черга не зачеплена', r.code === 1 && r.uit.includes('BESCHERMDE_BESTANDEN') && json(join(R, 'orchestratie/wachtrij.json')).wachtrij.length >= 3, r.uit);
    rmSync(W5, { recursive: true, force: true });

    // I — git-гілка зареєстрованої задачі (Claude через GitHub)
    r = orch(R, 'taak-start', '--id', 'CLD-002', '--agent', 'claude', '--basis', basis, '--tak', 'feature/cld-002-20261031-130600', '--omschrijving', 'Claude: нова сторінка через git-гілку');
    check('I taak-start від бази', r.code === 0, r.uit);
    r = orch(R, 'werkruimte', '--taak', 'CLD-002', '--pad', join(R, '..', `orch-werk-${Date.now()}`));
    const werkPad = /werkruimte: (\S+)/.exec(r.uit)?.[1];
    check('I werkruimte: ізольоване робоче дерево на гілці задачі', r.code === 0 && !!werkPad && existsSync(join(werkPad!, 'AGENTS.md')) && git(werkPad!, 'branch', '--show-current') === 'feature/cld-002-20261031-130600', r.uit);
    writeFileSync(join(werkPad!, 'src/e.ts'), 'export const e = 5;\n'); git(werkPad!, 'add', '-A'); git(werkPad!, 'commit', '-q', '-m', 'CLD-002: e.ts');
    git(R, 'worktree', 'remove', '--force', werkPad!);
    r = orch(R, 'inleveren', '--bron', 'feature/cld-002-20261031-130600', '--taak', 'CLD-002', '--tests', CONTROLEER);
    check('I git-гілка: прийнято без ORCH-OVERDRACHT (дані із зареєстрованої задачі), попередження BASIS_VEROUDERD без перетину', r.code === 0 && r.uit.includes('kanaal github_pr') && r.uit.includes('BASIS_VEROUDERD') && !r.uit.includes('OVERLAP'), r.uit);

    // J — послідовна черга та статуси
    r = orch(R, 'wachtrij', 'toon');
    check('J черга: CHT-001, GRK-001, CDX-001, CPL-001, CLD-002 чекають у порядку подання', ['CHT-001', 'GRK-001', 'CDX-001', 'CPL-001', 'CLD-002'].every((id) => r.uit.includes(`[wacht] ${id}`)) && r.uit.indexOf('CHT-001') < r.uit.indexOf('CLD-002'), r.uit);
    r = orch(R, 'wachtrij', 'volgende');
    check('J volgende → CHT-001 bezig, з інструкцією злиття без force', r.code === 0 && r.uit.includes('volgende: CHT-001') && r.uit.includes('--no-ff') && json(join(R, 'orchestratie/wachtrij.json')).bezig === 'CHT-001', r.uit);
    r = orch(R, 'wachtrij', 'volgende');
    check('J друге volgende під час bezig → WACHTRIJ_BEZIG (черга послідовна)', r.code === 1 && r.uit.includes('WACHTRIJ_BEZIG'));
    r = orch(R, 'wachtrij', 'klaar', '--taak', 'GRK-001', '--uitkomst', 'integrated', '--hoofd', basis);
    check('J klaar для не-поточної задачі → WACHTRIJ_NIET_BEZIG', r.code === 1 && r.uit.includes('WACHTRIJ_NIET_BEZIG'));
    // CHT-001 змінює a.ts, integratie вже має інший a.ts → справжній конфлікт при злитті → afgewezen
    const merge = spawnSync('git', ['merge', '--no-ff', '-q', 'feature/cht-001-20261031-130000'], { cwd: R, encoding: 'utf8' });
    if (merge.status !== 0) spawnSync('git', ['merge', '--abort'], { cwd: R });
    check('J злиття CHT-001 конфліктує (a.ts) — не force, abort', merge.status !== 0 && git(R, 'show', 'integratie:src/a.ts').includes('antigravity'));
    r = orch(R, 'wachtrij', 'klaar', '--taak', 'CHT-001', '--uitkomst', 'afgewezen');
    check('J klaar afgewezen → задача назад у in_progress, bezig порожній', r.code === 0 && json(join(R, 'orchestratie/taken/CHT-001.json')).staat === 'in_progress' && json(join(R, 'orchestratie/wachtrij.json')).bezig === null);
    r = orch(R, 'wachtrij', 'volgende');
    check('J volgende → GRK-001', r.uit.includes('volgende: GRK-001'));
    git(R, 'merge', '--no-ff', '-q', '-m', 'integratie: GRK-001', 'feature/grk-001-20261031-130100');
    const hoofd = git(R, 'rev-parse', 'HEAD');
    r = orch(R, 'wachtrij', 'klaar', '--taak', 'GRK-001', '--uitkomst', 'integrated', '--hoofd', hoofd);
    const tG = json(join(R, 'orchestratie/taken/GRK-001.json'));
    check('J klaar integrated → staat integrated, integratieCommit = hoofd, історія черги', r.code === 0 && tG.staat === 'integrated' && tG.integratieCommit === hoofd && json(join(R, 'orchestratie/wachtrij.json')).geschiedenis.some((x: any) => x.taakId === 'GRK-001' && x.staat === 'integrated'));
    r = orch(R, 'status');
    check('status: GRK-001 integrated, CHT-001 in_progress, CDX-001 in_progress (у черзі), installed невідомо', /GRK-001\s+integrated/.test(r.uit) && /CHT-001\s+in_progress/.test(r.uit) && /CDX-001\s+in_progress/.test(r.uit) && r.uit.includes('geïnstalleerd: onbekend'), r.uit);
    writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261031-140000', bronCommit: hoofd, bron: 'installer', op: '2026-10-31T14:00:00Z' }));
    r = orch(R, 'status');
    check('status після факту установки (geinstalleerd.json з integratie-вершком) → GRK-001 installed, решта не', /GRK-001\s+installed/.test(r.uit) && !/CDX-001\s+installed/.test(r.uit), r.uit);
    r = orch(R, 'taak-staat', '--id', 'CDX-001', '--staat', 'installed');
    check('агент не може оголосити installed сам', r.code === 1 && r.uit.includes('INSTALLED_ALLEEN_INSTALLER'));
    r = orch(R, 'wachtrij', 'terugtrekken', '--taak', 'CPL-001', '--reden', 'агент продовжує роботу');
    check('terugtrekken → задача знята з черги, staat in_progress', r.code === 0 && !json(join(R, 'orchestratie/wachtrij.json')).wachtrij.some((x: any) => x.taakId === 'CPL-001') && json(join(R, 'orchestratie/taken/CPL-001.json')).staat === 'in_progress');
    check('controleer у репозиторії з передачами й чергою — зелений', orch(R, 'controleer').code === 0, orch(R, 'controleer').uit);
    r = orch(R, 'staat-commit');
    check('staat-commit комітить лише файли стану (taken, inleveringen, wachtrij, geinstalleerd)', r.code === 0 && (git(R, 'status', '--porcelain', 'orchestratie') === '') && git(R, 'show', '--stat', '--oneline', 'HEAD').includes('orchestratie/wachtrij.json') && !git(R, 'show', '--stat', '--oneline', 'HEAD').includes('src/'), r.uit);
    writeFileSync(join(R, 'src/a.ts'), 'export const a = 100;\n'); git(R, 'add', 'src/a.ts'); writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), '{"schema":1,"versie":"20261031-150000","bronCommit":"' + hoofd + '","bron":"installer"}\n');
    r = orch(R, 'staat-commit');
    check('staat-commit відмовляє, якщо в stage є не-станові файли', r.code === 1 && r.uit.includes('STAAT_GEMENGD'), r.uit);
    for (const W of [W1, W2, W3, W4, patchMap]) rmSync(W, { recursive: true, force: true });
  } finally { rmSync(R, { recursive: true, force: true }); }
  return einde();
}
