// Audit 18.10.2026, punt 10: de pakketscripts schrijven altijd een herleidbare BRON-COMMIT. Vroeger kon een pakket buiten git worden
// gebouwd met BRON-COMMIT «unknown» (zo stond het live). Nu: in git → HEAD (40 hex); buiten git → weigeren, behalve met een uitdrukkelijke
// reden (--zonder-git "reden" → «zonder-git:<reden>»). Het resultaat voldoet aan dezelfde regel als root en de voorcontrole (bronCommit).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bronCommit } from '../../shared/bron-commit';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-pakket-maken');
  if (spawnSync('git', ['--version']).error) { console.log('overgeslagen: git ontbreekt'); return 0; }
  const basis = mkdtempSync(join(tmpdir(), 'pakket-maken-'));
  const script = join(basis, 'maak-voorstelpakket.sh'); copyFileSync(resolve('deploy/uitrol/maak-voorstelpakket.sh'), script);
  const src = join(basis, 'src'), uit = join(basis, 'uit'); mkdirSync(join(src, 'deploy'), { recursive: true }); mkdirSync(uit);
  writeFileSync(join(src, 'a.txt'), 'hallo\n'); writeFileSync(join(src, 'deploy/installeer-app.sh'), '#!/bin/bash\n');
  const env = { ...process.env, AUTEUR: 'Test Auteur', AGENT: 'claude', SAMENVATTING: 'Een samenvatting van minstens twintig tekens', GIT_CONFIG_NOSYSTEM: '1', HOME: basis };
  const maak = (versie: string, args: string[] = []) => spawnSync('bash', [script, ...args, uit], { cwd: src, env: { ...env, UITROL_VERSIE_OVERRIDE: versie }, encoding: 'utf8' });
  const commitIn = (versie: string) => execFileSync('tar', ['-xzOf', join(uit, `mijn-ruimte-${versie}.tar.gz`), `mijn-ruimte-${versie}/BRON-COMMIT`], { encoding: 'utf8' });
  try {
    let r = maak('20261018-100000');
    check('buiten git zonder vlag → geweigerd (vroeger: pakket met BRON-COMMIT «unknown»)', r.status === 1 && /geen git-repository/.test(r.stderr) && /--zonder-git/.test(r.stderr) && !existsSync(join(uit, 'mijn-ruimte-20261018-100000.tar.gz')), r.stderr);
    r = maak('20261018-100100', ['--zonder-git', 'kort']);
    check('--zonder-git met te korte reden → geweigerd', r.status === 1 && /minstens 5 tekens/.test(r.stderr), r.stderr);
    r = maak('20261018-100200', ['--zonder-git', 'sandbox van de agent, geen git']);
    const zg = r.status === 0 ? commitIn('20261018-100200') : '';
    check('--zonder-git "reden" → pakket met BRON-COMMIT «zonder-git:<reden>» + waarschuwing', r.status === 0 && zg === 'zonder-git:sandbox van de agent, geen git' && /BUITEN git/.test(r.stderr), `${r.status} ${zg} ${r.stderr}`);
    check('… en dat voldoet aan regel 3 (status zonder-git, reden zichtbaar)', bronCommit(zg).status === 'zonder-git' && bronCommit(zg).reden === 'sandbox van de agent, geen git');
    execFileSync('git', ['init', '-q', '.'], { cwd: src }); execFileSync('git', ['add', '-A'], { cwd: src });
    execFileSync('git', ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: src });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
    r = maak('20261018-100300');
    const gc = r.status === 0 ? commitIn('20261018-100300') : '';
    check('in git → BRON-COMMIT = HEAD (40 hex), status git', r.status === 0 && gc === head && bronCommit(gc).status === 'git', `${r.status} ${gc} ${r.stderr}`);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    rmSync(basis, { recursive: true, force: true });
  }
  return einde();
}
