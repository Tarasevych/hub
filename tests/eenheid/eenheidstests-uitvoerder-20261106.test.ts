// Rev'ю 06.11.2026 (ORCH-001, стара помилка): scripts/eenheidstests.mjs mag nooit «groen» melden zonder dat er iets groen werd.
//  - Een filter dat geen enkel testbestand vond (tikfout, hernoemd bestand), draaide 0 suites en eindigde met exit 0.
//  - Een kindproces dat door een signaal stierf (OOM-killer, SIGKILL), had status null en telde als geslaagd.
// De uitvoerder draait hier echt: één keer in de repo (filters zonder treffers) en één keer op een eigen tijdelijke boom met
// drie mini-suites (groen, gedood door een signaal, rood).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checker } from './hulp/nep-google';

const UITVOERDER = resolve('scripts/eenheidstests.mjs');
const draai = (args: string[], cwd = process.cwd()) => spawnSync(process.execPath, [UITVOERDER, ...args], { cwd, encoding: 'utf8', env: { ...process.env }, timeout: 120000 });

export async function main(): Promise<number> {
  const { check, einde } = checker('eenheidstests-uitvoerder');
  for (const filter of ['zzz-bestaat-niet-20261106', 'zzz-bestaat-niet-20261106.test.ts']) {
    const r = draai([filter]);
    check(`filter «${filter}» vindt niets → exit 1 met uitleg (vroeger 0 suites en exit 0)`,
      r.status === 1 && /geen testbestand gevonden/.test(r.stderr) && /не знайдено/.test(r.stderr), `${r.status} ${String(r.stderr).slice(-200)}`);
  }
  const boom = mkdtempSync(join(tmpdir(), 'uitvoerder-'));
  try {
    const t = join(boom, 'tests', 'eenheid'); mkdirSync(t, { recursive: true });
    writeFileSync(join(t, 'x1-groen.test.ts'), 'export async function main(): Promise<number> { console.log("OK   groen"); return 0; }\n');
    writeFileSync(join(t, 'x1-signaal.test.ts'), 'export async function main(): Promise<number> { process.kill(process.pid, "SIGKILL"); return 0; }\n');
    writeFileSync(join(t, 'x2-rood.test.ts'), 'export async function main(): Promise<number> { console.log("FOUT rood"); return 1; }\n');
    let r = draai(['x1-groen'], boom);
    check('één groene suite → exit 0 (de nieuwe regels maken niets te streng)', r.status === 0 && /OK {3}groen/.test(r.stdout), `${r.status} ${String(r.stderr).slice(-200)}`);
    r = draai(['x2-rood.test.ts'], boom);
    check('één rode suite (main geeft 1) → exit 1', r.status === 1, String(r.status));
    r = draai(['x1-'], boom);
    check('twee suites, één door SIGKILL gedood → exit ≠ 0 (vroeger 0: status null telde als geslaagd)', r.status !== 0 && r.status !== null && /OK {3}groen/.test(r.stdout), `${r.status} ${r.signal}`);
  } finally {
    rmSync(boom, { recursive: true, force: true });
  }
  return einde();
}
