// ORCH-001 етап 2: orch pakket (сумісний tar.gz з UITROL-BASIS через maak-voorstelpakket.sh + пакет передачі -overdracht.zip),
// pakket-controleer (цілісність, метадані, база), імпорт пакета передачі через inleveren без git, статус released.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { checker } from './hulp/nep-google';

const sh = (cwd: string, cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout.trim(); };
const git = (cwd: string, ...a: string[]) => sh(cwd, 'git', a);
const orch = (cwd: string, ...a: string[]) => { const r = spawnSync(process.execPath, [join(cwd, 'scripts/orch.mjs'), ...a], { cwd, encoding: 'utf8' }); return { code: r.status ?? -1, uit: `${r.stdout}${r.stderr}` }; };
const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const tarLees = (tar: string, lid: string) => spawnSync('tar', ['-xzOf', tar, lid], { encoding: 'utf8' }).stdout;

function maakRepo() {
  const R = mkdtempSync(join(tmpdir(), 'orch-pak-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules', 'scripts/orch.mjs', 'scripts/orch', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md', 'orchestratie/eigenaar-ondertekenaars', 'orchestratie/sjablonen', 'deploy/uitrol/maak-voorstelpakket.sh']) cpSync(p, join(R, p), { recursive: true });
  cpSync('.github/copilot-instructions.md', join(R, '.github/copilot-instructions.md'));
  writeFileSync(join(R, 'deploy/installeer-app.sh'), '#!/bin/bash\necho stub\n');
  mkdirSync(join(R, 'src')); writeFileSync(join(R, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(R, 'orchestratie/wachtrij.json'), JSON.stringify({ schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] }, null, 2));
  git(R, 'init', '-q', '-b', 'integratie'); git(R, 'config', 'user.email', 'e@t'); git(R, 'config', 'user.name', 'eigenaar');
  orch(R, 'vergrendel'); orch(R, 'context'); git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'basis');
  const basis = git(R, 'rev-parse', 'HEAD');
  // факт установки: саме ця база стоїть на «сервері»
  writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261031-093842', bronCommit: basis, bron: 'eigenaar', op: '2026-10-31T10:00:00Z' }, null, 2));
  git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'geinstalleerd');
  // basis = вершок integratie (від нього агент гілкується); geinstalleerd = commit, що стоїть на «сервері» (старший за basis)
  return { R, basis: git(R, 'rev-parse', 'HEAD'), geinstalleerd: basis };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-pakket');
  const { R, basis, geinstalleerd } = maakRepo();
  const uit = mkdtempSync(join(tmpdir(), 'orch-pak-uit-'));
  try {
    // робота агента у власній гілці
    orch(R, 'taak-start', '--id', 'REL-001', '--agent', 'claude', '--basis', basis, '--tak', 'feature/rel-001-20261031-140000', '--omschrijving', 'Тестовий випуск: нова функція b.ts і зміна a.ts для перевірки пакета');
    git(R, 'checkout', '-q', '-b', 'feature/rel-001-20261031-140000');
    writeFileSync(join(R, 'src/a.ts'), 'export const a = 2;\n'); writeFileSync(join(R, 'src/b.ts'), 'export const b = 1;\n');
    git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'REL-001: a en b');
    const head = git(R, 'rev-parse', 'HEAD');
    const manifest = join(uit, 'manifest.json'); writeFileSync(manifest, manifestVoor('20261102-120000'));
    const tests = join(uit, 'tests.json'); writeFileSync(tests, JSON.stringify({ geslaagd: 12, mislukt: 0, falend: [], uitleg: { uk: 'усе зелене', nl: 'alles groen' } }));

    // TRACE-002: een pakket vanaf integratie of een willekeurige tak haalt de rootvoorcontrole nooit.
    git(R, 'checkout', '-q', '-b', 'zonder-taaktak');
    let ongeldigeTak = orch(R, 'pakket', '--taak', 'REL-001', '--auteur', 'Test Eigenaar', '--versie', '20261108-120000', '--uit', uit);
    check('TRACE-002: недозволена гілка зупиняє випуск до складання', ongeldigeTak.code === 1 && ongeldigeTak.uit.includes('ONTWIKKELARCHIEF_TAK_ONGELDIG'), ongeldigeTak.uit);
    git(R, 'checkout', '-q', 'feature/rel-001-20261031-140000');
    git(R, 'branch', '-D', 'zonder-taaktak');

    let r = orch(R, 'pakket', '--taak', 'REL-001', '--auteur', 'Test Eigenaar', '--versie', '20261101-000000', '--uit', uit);
    check('pakket з версією ≤ встановленої? ні — 20261101 > 20261031 → але без manifest (≥20261101) збирання падає зрозуміло', r.code === 1 && /MANIFEST|PAKKET_BOUW_MISLUKT/.test(r.uit), r.uit);
    r = orch(R, 'pakket', '--taak', 'REL-001', '--auteur', 'Test Eigenaar', '--versie', '20261102-120000', '--uit', uit, '--manifest', manifest, '--testresultaten', tests, '--niet-gedaan', 'мобільну версію не перевірено');
    check('pakket зібрано: tar + overdracht.zip, базу взято з geinstalleerd.json', r.code === 0 && r.uit.includes('mijn-ruimte-20261102-120000-claude-overdracht.zip') && r.uit.includes('geinstalleerd.json'), r.uit);
    const zip = join(uit, 'mijn-ruimte-20261102-120000-claude-overdracht.zip'); const tar = join(uit, 'mijn-ruimte-20261102-120000.tar.gz');
    check('файли існують', existsSync(zip) && existsSync(tar));
    const inhoud = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    check('zip містить tar.gz, .sha256, ORCH-OVERDRACHT.json, UITROL-MANIFEST.json, RAPPORT.md, TESTRESULTATEN.json, COMMITS.txt, commits.bundle, AGENTEN.json, LEESMIJ.txt, .voorstel.json', ['mijn-ruimte-20261102-120000.tar.gz', 'mijn-ruimte-20261102-120000.tar.gz.sha256', 'ORCH-OVERDRACHT.json', 'UITROL-MANIFEST.json', 'RAPPORT.md', 'TESTRESULTATEN.json', 'COMMITS.txt', 'commits.bundle', 'AGENTEN.json', 'LEESMIJ.txt', 'mijn-ruimte-20261102-120000.voorstel.json'].every((n) => inhoud.includes(n)), inhoud.join(','));
    const top = 'mijn-ruimte-20261102-120000';
    check('tar: UITROL-VERSIE, BRON-COMMIT=HEAD, AGENT=claude, AUTEUR, SAMENVATTING, UITROL-MANIFEST.json, UITROL-BASIS з versie/commit/regelsVersie/regelsHash', tarLees(tar, `${top}/UITROL-VERSIE`) === '20261102-120000' && tarLees(tar, `${top}/BRON-COMMIT`) === head && tarLees(tar, `${top}/AGENT`) === 'claude' && tarLees(tar, `${top}/AUTEUR`) === 'Test Eigenaar' && tarLees(tar, `${top}/UITROL-MANIFEST.json`).includes('"versie":"20261102-120000"') && /^versie=20261031-093842\ncommit=[0-9a-f]{40}\nregelsVersie=\d+\.\d+\.\d+\nregelsHash=[0-9a-f]{64}\n?$/.test(tarLees(tar, `${top}/UITROL-BASIS`)) && tarLees(tar, `${top}/UITROL-BASIS`).includes(`commit=${geinstalleerd}\n`), tarLees(tar, `${top}/UITROL-BASIS`));
    check('tar: вміст коду — src/b.ts присутній, deploy/installeer-app.sh присутній, без ORCH-OVERDRACHT.json', tarLees(tar, `${top}/src/b.ts`).includes('b = 1') && tarLees(tar, `${top}/deploy/installeer-app.sh`).includes('stub') && !spawnSync('tar', ['-tzf', tar], { encoding: 'utf8' }).stdout.split('\n').includes(`${top}/ORCH-OVERDRACHT.json`));
    const W = mkdtempSync(join(tmpdir(), 'orch-pak-w-')); sh(W, 'unzip', ['-q', zip, '-d', W]);
    const od = json(join(W, 'ORCH-OVERDRACHT.json'));
    check('ORCH-OVERDRACHT: taak, agent, basisCommit = база гілки, installatie = встановлена база з geinstalleerd.json (старший commit), regelsHash, 1 commit гілки, bestanden gewijzigd a.ts / toegevoegd b.ts + власний файл задачі, pakket.sha256 = sha256 файла', od.taakId === 'REL-001' && od.agent === 'claude' && od.basisCommit === basis && od.basisVersie === '20261031-093842' && od.installatie.commit === geinstalleerd && od.installatie.versie === '20261031-093842' && od.installatie.inHead === true && od.sindsInstallatie.commits === 2 && /^[0-9a-f]{64}$/.test(od.regelsHash) && od.commits.length === 1 && od.commits[0] === head && od.bestanden.gewijzigd.includes('src/a.ts') && od.bestanden.toegevoegd.includes('src/b.ts') && od.bestanden.toegevoegd.includes('orchestratie/taken/REL-001.json') && od.pakket.sha256 === sh(W, 'sha256sum', ['mijn-ruimte-20261102-120000.tar.gz']).split(' ')[0] && od.pakket.bronCommit === head && od.tests.geslaagd === 12 && od.kritiekBevestigd === false, JSON.stringify(od).slice(0, 400));
    const rapport = readFileSync(join(W, 'RAPPORT.md'), 'utf8');
    check('RAPPORT.md: версія, задача, база, sha256, коміт, учасники з manifest, «не зроблено», чесно про непідтверджені політики', rapport.includes('20261102-120000') && rapport.includes('REL-001') && rapport.includes(basis) && rapport.includes(geinstalleerd) && rapport.includes('від установки 2 комітів') && rapport.includes(od.pakket.sha256) && rapport.includes('grok') && rapport.includes('мобільну версію не перевірено') && rapport.includes('НЕ підтверджені власником'));
    check('AGENTEN.json: учасники з manifest (3), COMMITS.txt містить HEAD', json(join(W, 'AGENTEN.json')).deelnemers.length === 3 && readFileSync(join(W, 'COMMITS.txt'), 'utf8').includes(head));
    check('commits.bundle — справжній git bundle з комітом', spawnSync('git', ['bundle', 'verify', join(W, 'commits.bundle')], { cwd: R, encoding: 'utf8' }).status === 0);
    const taak = json(join(R, 'orchestratie/taken/REL-001.json'));
    check('задача: releaseVersie/releaseSha256/releaseCommit; status → released', taak.releaseVersie === '20261102-120000' && taak.releaseSha256 === od.pakket.sha256 && taak.releaseCommit === head && /REL-001\s+released/.test(orch(R, 'status').uit), orch(R, 'status').uit);
    // pakket оновив файл задачі (releaseVersie) — агент комітить лише стан; інакше дерево брудне
    r = orch(R, 'staat-commit');
    check('staat-commit після pakket: лише файл задачі, дерево чисте', r.code === 0 && git(R, 'status', '--porcelain') === '' && git(R, 'show', '--stat', '--oneline', 'HEAD').includes('orchestratie/taken/REL-001.json'), r.uit);

    // pakket-controleer
    r = orch(R, 'pakket-controleer', '--bron', zip);
    check('pakket-controleer: гаразд, база = встановлена, попередження «без підпису»', r.code === 0 && r.uit.includes('in orde') && r.uit.includes('GEEN_HANDTEKENING'), r.uit);
    // підробка: змінити tar у zip → цілісність
    const W2 = mkdtempSync(join(tmpdir(), 'orch-pak-w2-')); sh(W2, 'unzip', ['-q', zip, '-d', W2]);
    const b = readFileSync(join(W2, 'mijn-ruimte-20261102-120000.tar.gz')); b[b.length - 3] ^= 0xff; writeFileSync(join(W2, 'mijn-ruimte-20261102-120000.tar.gz'), b);
    const zip2 = join(uit, 'mijn-ruimte-20261102-120000-claude-overdracht-kapot.zip'); sh(W2, 'zip', ['-q', '-j', zip2, ...readdirSync(W2).map((n) => join(W2, n))]);
    r = orch(R, 'pakket-controleer', '--bron', zip2);
    check('змінений tar у zip → INTEGRITEIT, відхилено', r.code === 1 && r.uit.includes('INTEGRITEIT'), r.uit);
    r = orch(R, 'inleveren', '--bron', zip2, '--zonder-tests', 'перевірка цілісності в тесті');
    check('inleveren пошкодженого пакета передачі → відхилено з INTEGRITEIT (нічого не накладено)', r.code === 1 && r.uit.includes('INTEGRITEIT'), r.uit);
    // база застаріла: «на сервері» вже новіша версія
    writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261101-090000', bronCommit: basis, bron: 'installer' }));
    r = orch(R, 'pakket-controleer', '--bron', zip);
    check('pakket-controleer з новішою встановленою версією → BASIS_VEROUDERD', r.code === 1 && r.uit.includes('BASIS_VEROUDERD'), r.uit);
    writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261031-093842', bronCommit: 'f'.repeat(40), bron: 'installer' }));
    r = orch(R, 'pakket-controleer', '--bron', zip);
    check('pakket-controleer з іншим встановленим commit → BASIS_COMMIT_VERSCHILT', r.code === 1 && r.uit.includes('BASIS_COMMIT_VERSCHILT'), r.uit);
    git(R, 'checkout', '-q', 'orchestratie/geinstalleerd.json');

    // імпорт пакета передачі без git (інший «сервер»/агент): inleveren на integratie
    git(R, 'checkout', '-q', 'integratie');
    // ORCH-OVERDRACHT у zip має tak feature/rel-001-… яка вже існує → inleveren має відхилити TAK_BESTAAT; після видалення гілки — прийняти
    r = orch(R, 'inleveren', '--bron', zip, '--tests', 'node scripts/orch.mjs controleer');
    check('імпорт zip, коли гілка з ORCH-OVERDRACHT уже існує → TAK_BESTAAT (не перезаписуємо)', r.code === 1 && r.uit.includes('TAK_BESTAAT'), r.uit);
    git(R, 'branch', '-q', '-D', 'feature/rel-001-20261031-140000');
    r = orch(R, 'inleveren', '--bron', zip, '--tests', 'node scripts/orch.mjs controleer');
    check('імпорт пакета передачі без git → прийнято, канал zip, 3 файли (a.ts, b.ts, власний файл задачі — дозволено), гілка відтворена від бази гілки', r.code === 0 && r.uit.includes('aanvaard') && r.uit.includes('bestanden 3') && git(R, 'show', 'feature/rel-001-20261031-140000:src/b.ts').includes('b = 1') && git(R, 'merge-base', 'feature/rel-001-20261031-140000', 'integratie') === basis, r.uit);
    const rec = readdirSync(join(R, 'orchestratie/inleveringen')).map((n) => json(join(R, 'orchestratie/inleveringen', n))).find((j) => j.uitkomst === 'aanvaard' && j.taakId === 'REL-001');
    check('запис передачі позначено як пакет передачі (overdrachtZip) з sha256 джерела', !!rec && rec.overdrachtZip === true && /^[0-9a-f]{64}$/.test(rec.bronSha256));
    // стан після inleveren (запис, задача, черга) комітиться окремо — інакше maak-voorstelpakket.sh відмовляє через брудне дерево
    check('staat-commit після inleveren на integratie', orch(R, 'staat-commit').code === 0 && git(R, 'status', '--porcelain') === '');
    // maak-voorstelpakket.sh сам: без BASIS_* для версії ≥ 20261201 — відмова
    const rv = spawnSync('bash', [join(R, 'deploy/uitrol/maak-voorstelpakket.sh'), uit], { cwd: R, encoding: 'utf8', env: { ...process.env, AUTEUR: 'x y z', AGENT: 'claude', SAMENVATTING: 'достатньо довгий підсумок для тесту', UITROL_VERSIE_OVERRIDE: '20261201-000000', MANIFEST: manifest } });
    check('maak-voorstelpakket.sh: версія ≥ 20261201 без BASIS_VERSIE/BASIS_COMMIT → відмова з поясненням', rv.status === 1 && rv.stderr.includes('BASIS_VERSIE'), rv.stderr);
    const rv2 = spawnSync('bash', [join(R, 'deploy/uitrol/maak-voorstelpakket.sh'), uit], { cwd: R, encoding: 'utf8', env: { ...process.env, AUTEUR: 'x y z', AGENT: 'claude', SAMENVATTING: 'достатньо довгий підсумок для тесту', UITROL_VERSIE_OVERRIDE: '20261029-000000', BASIS_VERSIE: '2026', BASIS_COMMIT: 'abc' } });
    check('maak-voorstelpakket.sh: некоректні BASIS_* → відмова', rv2.status === 1 && rv2.stderr.includes('BASIS_VERSIE'), rv2.stderr);
    for (const d of [W, W2]) rmSync(d, { recursive: true, force: true });
  } finally { rmSync(R, { recursive: true, force: true }); rmSync(uit, { recursive: true, force: true }); }
  return einde();
}
