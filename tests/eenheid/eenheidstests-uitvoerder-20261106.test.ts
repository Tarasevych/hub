// Rev'ю 06.11.2026 (ORCH-001, стара помилка): scripts/eenheidstests.mjs mag nooit «groen» melden zonder dat er iets groen werd.
//  - Een filter dat geen enkel testbestand vond (tikfout, hernoemd bestand), draaide 0 suites en eindigde met exit 0.
//  - Een kindproces dat door een signaal stierf (OOM-killer, SIGKILL), had status null en telde als geslaagd.
//  - hulp/node-test-main.ts (suites in node:test-stijl): een fout ná het eind van een test telde niet mee.
//  - Pre-merge-controle van PR #30: een late fout werd rood zonder uitleg, een fout na > 25 ms bleef groen, en een suite met
//    mock.timers liet main() hangen (n3–n8).
// De uitvoerder draait hier echt: één keer in de repo (filters zonder treffers) en één keer op een eigen tijdelijke boom met
// mini-suites (groen, gedood door een signaal, rood, en node:test-suites n1–n8).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checker } from './hulp/nep-google';

const UITVOERDER = resolve('scripts/eenheidstests.mjs');
const NODE_TEST_MAIN = resolve('tests/eenheid/hulp/node-test-main.ts');
const nodeTestSuiteBestand = (tests: string) => `import { nodeTestSuite } from ${JSON.stringify(NODE_TEST_MAIN)};\nconst { test, main } = nodeTestSuite();\nexport { main };\n${tests}\n`;
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
    writeFileSync(join(t, 'n1-groen.test.ts'), nodeTestSuiteBestand('test("groen", () => {});\ntest("ook groen", async () => { await new Promise((r) => setTimeout(r, 5)); });'));
    writeFileSync(join(t, 'n2-rood.test.ts'), nodeTestSuiteBestand('test("groen", () => {});\ntest("rood", () => { throw new Error("rood"); });'));
    writeFileSync(join(t, 'n3-laat.test.ts'), nodeTestSuiteBestand('test("faalt pas na het eind", () => { setTimeout(() => { throw new Error("laat"); }, 1); });'));
    writeFileSync(join(t, 'n4-belofte.test.ts'), nodeTestSuiteBestand('test("niet-afgewachte promise", () => { Promise.reject(new Error("belofte")); });'));
    // Na de pre-merge-controle van PR #30: de vaste pauze van 25 ms miste latere fouten, mock.timers liet main() hangen.
    writeFileSync(join(t, 'n5-laat60.test.ts'), nodeTestSuiteBestand('test("gooit 60 ms na het eind", () => { setTimeout(() => { throw new Error("laat60"); }, 60); });'));
    writeFileSync(join(t, 'n6-belofte40.test.ts'), nodeTestSuiteBestand('test("verwerpt 40 ms na het eind", () => { setTimeout(() => { Promise.reject(new Error("belofte40")); }, 40); });'));
    writeFileSync(join(t, 'n7-mocktimers.test.ts'), nodeTestSuiteBestand('import { mock } from "node:test";\nimport { createServer } from "node:net";\nmock.timers.enable({ apis: ["setTimeout", "setImmediate"] });\ncreateServer().listen(0, "127.0.0.1");\ntest("groen onder mock.timers", () => {});'));
    writeFileSync(join(t, 'n8-interval.test.ts'), nodeTestSuiteBestand('setInterval(() => {}, 50);\ntest("groen met blijvende interval", () => {});'));
    let r = draai(['x1-groen'], boom);
    check('één groene suite → exit 0 (de nieuwe regels maken niets te streng)', r.status === 0 && /OK {3}groen/.test(r.stdout), `${r.status} ${String(r.stderr).slice(-200)}`);
    r = draai(['x2-rood.test.ts'], boom);
    check('één rode suite (main geeft 1) → exit 1', r.status === 1, String(r.status));
    r = draai(['x1-'], boom);
    check('twee suites, één door SIGKILL gedood → exit ≠ 0 (vroeger 0: status null telde als geslaagd)', r.status !== 0 && r.status !== null && /OK {3}groen/.test(r.stdout), `${r.status} ${r.signal}`);
    // node:test-stijl via hulp/node-test-main.ts
    r = draai(['n1-groen.test.ts'], boom);
    check('node:test-suite met alleen groene tests → exit 0', r.status === 0, `${r.status} ${String(r.stdout).slice(-300)}`);
    r = draai(['n2-rood.test.ts'], boom);
    check('node:test-suite met een falende test → exit 1 (vroeger: kale main() gaf 0)', r.status === 1, String(r.status));
    r = draai(['n3-laat.test.ts'], boom);
    check('node:test: een timer die gooit ná het eind van de test → exit 1', r.status === 1, `${r.status} ${String(r.stdout).slice(-300)}`);
    check('node:test: die late fout staat zelf in stderr (vroeger alleen exit 1, zonder één regel uitleg)',
      /niet-opgevangen fout/.test(r.stderr) && /Error: laat\b/.test(r.stderr), String(r.stderr).slice(-300));
    r = draai(['n4-belofte.test.ts'], boom);
    check('node:test: een niet-afgewachte, afgewezen promise → exit 1', r.status === 1, `${r.status} ${String(r.stdout).slice(-300)}`);
    check('node:test: de afgewezen promise staat in stderr', /Error: belofte\b/.test(r.stderr), String(r.stderr).slice(-300));
    r = draai(['n5-laat60.test.ts'], boom);
    check('node:test: een timer die 60 ms na het eind gooit → exit 1 (vroeger 0: vaste pauze van 25 ms)', r.status === 1 && /Error: laat60\b/.test(r.stderr), `${r.status} ${String(r.stderr).slice(-300)}`);
    r = draai(['n6-belofte40.test.ts'], boom);
    check('node:test: een promise die 40 ms na het eind verwerpt → exit 1 (vroeger 0)', r.status === 1 && /Error: belofte40\b/.test(r.stderr), `${r.status} ${String(r.stderr).slice(-300)}`);
    let t0 = performance.now();
    r = spawnSync(process.execPath, [UITVOERDER, 'n7-mocktimers.test.ts'], { cwd: boom, encoding: 'utf8', env: { ...process.env }, timeout: 30000 });
    check('node:test: suite zet mock.timers aan en laat een server open → exit 0 en geen hang (vroeger hing main() eeuwig)',
      r.status === 0 && r.signal === null, `${r.status} ${r.signal} ${Math.round(performance.now() - t0)} ms ${String(r.stderr).slice(-300)}`);
    t0 = performance.now();
    r = draai(['n8-interval.test.ts'], boom);
    const duur = performance.now() - t0;
    check('node:test: een blijvende setInterval → exit 0, wachten stopt op de bovengrens (≈2 s), niet eeuwig', r.status === 0 && duur < 20000, `${r.status} ${Math.round(duur)} ms`);
  } finally {
    rmSync(boom, { recursive: true, force: true });
  }
  return einde();
}
