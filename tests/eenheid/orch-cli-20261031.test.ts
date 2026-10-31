// ORCH-001 етап 0: scripts/orch.mjs як процес — реальні виклики в тимчасовій копії репозиторію (поведінка, не метадані).
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checker } from './hulp/nep-google';

function kopie(): string {
  const d = mkdtempSync(join(tmpdir(), 'orch-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules', 'orchestratie', 'scripts/orch.mjs', 'scripts/orch']) cpSync(p, join(d, p), { recursive: true });
  cpSync('.github/copilot-instructions.md', join(d, '.github/copilot-instructions.md'));
  return d;
}
const run = (d: string, ...a: string[]) => { const r = spawnSync(process.execPath, [join(d, 'scripts/orch.mjs'), ...a], { cwd: d, encoding: 'utf8' }); return { code: r.status ?? -1, uit: `${r.stdout}${r.stderr}` }; };
const git = (d: string, ...a: string[]) => execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-cli');
  const d = kopie();
  try {
    let r = run(d, 'controleer');
    check('controleer на чистій копії → 0, «усе гаразд», попередження про непідтверджені критичні політики', r.code === 0 && r.uit.includes('усе гаразд') && r.uit.includes('KRITIEK_NIET_BEVESTIGD'), r.uit);

    writeFileSync(join(d, 'AGENTS.md'), readFileSync(join(d, 'AGENTS.md'), 'utf8').replace('<!-- compact:einde -->', '- Ще одне правило всередині compact-блоку.\n<!-- compact:einde -->'));
    r = run(d, 'controleer');
    check('правило додано без lock → controleer падає з REGELS_NIET_VERGRENDELD і CONTEXT_VEROUDERD', r.code === 1 && r.uit.includes('REGELS_NIET_VERGRENDELD') && r.uit.includes('CONTEXT_VEROUDERD'), r.uit);
    r = run(d, 'vergrendel');
    check('vergrendel без підвищення regelsVersie → VERSIE_NIET_VERHOOGD', r.code === 1 && r.uit.includes('VERSIE_NIET_VERHOOGD'), r.uit);
    const bp = join(d, 'orchestratie/beleid.json'); const b = JSON.parse(readFileSync(bp, 'utf8')); b.regelsVersie = '9.0.0'; writeFileSync(bp, JSON.stringify(b, null, 2) + '\n');
    r = run(d, 'vergrendel'); const r2 = run(d, 'context'); const r3 = run(d, 'controleer');
    check('після підвищення версії (9.0.0): vergrendel + context → controleer знову зелений', r.code === 0 && r2.code === 0 && r3.code === 0, `${r.uit}\n${r2.uit}\n${r3.uit}`);
    check('context містить нову версію 9.0.0', readFileSync(join(d, 'orchestratie/CONTEXT-COMPACT.md'), 'utf8').includes('regelsVersie: `9.0.0`'));
    // задача, зареєстрована за 1.0.0, тепер застаріла за правилами
    r = run(d, 'versheid', '--taak', 'ORCH-001', '--fase', 'start');
    check('задача зі старою regelsVersie → REGELS_VEROUDERD (агент має перечитати правила)', r.code === 1 && r.uit.includes('REGELS_VEROUDERD'), r.uit);

    // адаптер, що став «власним зводом правил»
    writeFileSync(join(d, 'GROK.md'), '<!-- orch-adapter -->\nAGENTS.md\n' + '## Правило 1\nрядок\n'.repeat(20));
    r = run(d, 'controleer');
    check('адаптер із власними правилами й надто довгий → ADAPTER_REGELS + ADAPTER_TE_LANG', r.code === 1 && r.uit.includes('ADAPTER_REGELS') && r.uit.includes('ADAPTER_TE_LANG'), r.uit);
    cpSync('GROK.md', join(d, 'GROK.md'));

    // статуси задач
    r = run(d, 'taak-staat', '--id', 'ORCH-001', '--staat', 'installed');
    check('агент не може поставити installed сам', r.code === 1 && r.uit.includes('INSTALLED_ALLEEN_INSTALLER'));
    r = run(d, 'taak-staat', '--id', 'ORCH-001', '--staat', 'ter_integratie');
    check('ter_integratie — можна', r.code === 0 && JSON.parse(readFileSync(join(d, 'orchestratie/taken/ORCH-001.json'), 'utf8')).staat === 'ter_integratie');
    r = run(d, 'taak-start', '--id', 'ORCH-001', '--agent', 'claude', '--basis', 'b279ccabe31a27139b337822162653ccc13b6a5a', '--tak', 'feature/orch-001-20261031-112355');
    check('повторна реєстрація того самого Task ID → TAAK_BESTAAT', r.code === 1 && r.uit.includes('TAAK_BESTAAT'));
    r = run(d, 'taak-start', '--id', 'X-1', '--agent', 'claude', '--basis', 'abc', '--tak', 'main');
    check('погана задача → TAAK_ID, TAAK_BASIS, TAAK_TAK разом', r.code === 1 && ['TAAK_ID', 'TAAK_BASIS', 'TAAK_TAK'].every((c) => r.uit.includes(c)), r.uit);

    // git-сценарій: застаріла база з перетином файлів
    const g = mkdtempSync(join(tmpdir(), 'orch-git-'));
    try {
      for (const p of ['orchestratie', 'scripts/orch.mjs', 'scripts/orch', 'AGENTS.md']) cpSync(p, join(g, p), { recursive: true });
      git(g, 'init', '-q', '-b', 'integratie'); git(g, 'config', 'user.email', 't@t'); git(g, 'config', 'user.name', 't');
      writeFileSync(join(g, 'a.ts'), '1\n'); git(g, 'add', '.'); git(g, 'commit', '-q', '-m', 'basis');
      const basis = git(g, 'rev-parse', 'HEAD');
      git(g, 'checkout', '-q', '-b', 'feature/tst-001-20261031-120000');
      const bp2 = join(g, 'orchestratie/beleid.json'); const b2 = JSON.parse(readFileSync(bp2, 'utf8')); b2.basis.bronCommit = basis; writeFileSync(bp2, JSON.stringify(b2, null, 2) + '\n');
      rmSync(join(g, 'orchestratie/taken'), { recursive: true, force: true }); rmSync(join(g, 'orchestratie/regels.lock.json'), { force: true });
      run(g, 'vergrendel'); run(g, 'context');
      r = run(g, 'taak-start', '--id', 'TST-001', '--agent', 'codex', '--basis', basis, '--tak', 'feature/tst-001-20261031-120000');
      check('git: задача від реальної бази зареєстрована', r.code === 0, r.uit);
      writeFileSync(join(g, 'a.ts'), '2\n'); git(g, 'add', '.'); git(g, 'commit', '-q', '-m', 'werk');
      r = run(g, 'versheid', '--taak', 'TST-001', '--fase', 'overdracht');
      check('git: інтеграція не пішла вперед → свіжо', r.code === 0 && r.uit.includes('vers'), r.uit);
      // інший агент змінив той самий файл в integratie
      git(g, 'checkout', '-q', 'integratie'); writeFileSync(join(g, 'a.ts'), '3\n'); git(g, 'commit', '-q', '-am', 'ander'); git(g, 'checkout', '-q', 'feature/tst-001-20261031-120000');
      r = run(g, 'versheid', '--taak', 'TST-001', '--fase', 'overdracht');
      check('git: інший агент змінив a.ts в integratie → BASIS_VEROUDERD_OVERLAP, передавання заборонене', r.code === 1 && r.uit.includes('BASIS_VEROUDERD_OVERLAP') && r.uit.includes('a.ts'), r.uit);
      writeFileSync(join(g, 'b.ts'), 'x\n');
      r = run(g, 'versheid', '--taak', 'TST-001', '--fase', 'start');
      check('git: той самий стан на фазі start — та ж помилка, але без NIET_GECOMMIT', r.code === 1 && r.uit.includes('BASIS_VEROUDERD_OVERLAP') && !r.uit.includes('NIET_GECOMMIT'), r.uit);
      git(g, 'add', 'b.ts'); git(g, 'commit', '-q', '-m', 'b');
      git(g, 'checkout', '-q', '-b', 'los', basis); writeFileSync(join(g, 'c.ts'), 'c\n'); git(g, 'add', '.'); git(g, 'commit', '-q', '-m', 'los');
      git(g, 'checkout', '-q', 'feature/tst-001-20261031-120000');
      const tp = join(g, 'orchestratie/taken/TST-001.json'); const t = JSON.parse(readFileSync(tp, 'utf8')); t.basisCommit = git(g, 'rev-parse', 'los'); writeFileSync(tp, JSON.stringify(t, null, 2) + '\n');
      r = run(g, 'versheid', '--taak', 'TST-001', '--fase', 'start');
      check('git: заявлена база не предок HEAD → BASIS_NIET_IN_HEAD', r.code === 1 && r.uit.includes('BASIS_NIET_IN_HEAD'), r.uit);
    } finally { rmSync(g, { recursive: true, force: true }); }
  } finally { rmSync(d, { recursive: true, force: true }); }
  return einde();
}
