// ORCH-001 етап 2: root-інсталятор (deploy/uitrol/mijn-ruimte-uitrol.sh) перевіряє не лише дату: UITROL-BASIS (встановлена версія + Git SHA),
// regels.lock.json (правила пакета вергрендельовані, python-відбиток == JS-відбиток kern.mjs), режим (na_bevestiging дозволений), і пише
// laatste-commit. Скрипт запускається як непривілейований користувач (як root він ігнорує тестові шляхи); без ssh-keygen у середовищі
// підпис перевіряє shim у PATH — тут тестується НЕ підпис (на це є uitrol-deur), а перевірки після нього.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as k from '../../scripts/orch/kern.mjs';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { checker } from './hulp/nep-google';

const SCRIPT = 'deploy/uitrol/mijn-ruimte-uitrol.sh';
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const lees = (p: string) => readFileSync(p, 'utf8');

type Pak = { basis?: string | null; bronCommit: string; regels?: { agents: string; beleid: string; besluiten: string; lock: string } | null };
function pakket(werk: string, versie: string, o: Pak) {
  const top = join(werk, `bron-${versie}`); const binnen = join(top, `mijn-ruimte-${versie}`);
  mkdirSync(join(binnen, 'deploy'), { recursive: true });
  writeFileSync(join(binnen, 'UITROL-VERSIE'), `${versie}\n`); writeFileSync(join(binnen, 'AUTEUR'), 'Test Auteur\n'); writeFileSync(join(binnen, 'AGENT'), 'claude\n');
  writeFileSync(join(binnen, 'SAMENVATTING'), 'Testpakket ORCH-001: basis, regels en modus van het pakket worden door root gecontroleerd.\n');
  writeFileSync(join(binnen, 'BRON-COMMIT'), `${o.bronCommit}\n`); writeFileSync(join(binnen, 'UITROL-MANIFEST.json'), manifestVoor(versie));
  writeFileSync(join(binnen, 'deploy/installeer-app.sh'), '#!/bin/bash\necho "ECHTE INSTALLER MAG NIET DRAAIEN"; exit 99\n');
  if (o.basis) writeFileSync(join(binnen, 'UITROL-BASIS'), o.basis);
  if (o.regels) { mkdirSync(join(binnen, 'orchestratie')); writeFileSync(join(binnen, 'AGENTS.md'), o.regels.agents); writeFileSync(join(binnen, 'orchestratie/beleid.json'), o.regels.beleid); writeFileSync(join(binnen, 'orchestratie/BESLUITEN.md'), o.regels.besluiten); writeFileSync(join(binnen, 'orchestratie/regels.lock.json'), o.regels.lock); }
  const uit = join(werk, `mijn-ruimte-${versie}.tar.gz`);
  const r = spawnSync('tar', ['-czf', uit, '-C', top, `mijn-ruimte-${versie}`], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr);
  rmSync(top, { recursive: true, force: true });
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-uitrol-basis');
  const alsRoot = process.getuid?.() === 0;
  const heeftSetpriv = spawnSync('setpriv', ['--help'], { encoding: 'utf8' }).status === 0;
  if (alsRoot && !heeftSetpriv) { console.log('overgeslagen: root zonder setpriv — het uitrolscript negeert als root de testpaden'); return 0; }
  const basisMap = mkdtempSync('/tmp/orch-uitrol-'); chmodSync(basisMap, 0o777);
  try {
    const bin = join(basisMap, 'bin'); mkdirSync(bin);
    // Shim ALTIJD vóór in PATH, ook als er een echte ssh-keygen is: de .sig-bestanden hieronder zijn nep («shim»), en een echte ssh-keygen zou
    // ze terecht afkeuren (HANDTEKENING_ONGELDIG) — deze suite test de controles ná de handtekening; de handtekening zelf test uitrol-deur.
    writeFileSync(join(bin, 'ssh-keygen'), '#!/bin/bash\n# shim voor de test: alleen -Y verify, altijd geldig (de handtekening zelf test uitrol-deur met echte sleutels)\n[ "$1" = "-Y" ] && [ "$2" = "verify" ] && exit 0\nexit 1\n'); chmodSync(join(bin, 'ssh-keygen'), 0o755);
    const inbox = join(basisMap, 'inbox'); const werk = join(basisMap, 'werk'); const statusMap = join(basisMap, 'status'); const pk = join(basisMap, 'pk'); const pakketten = join(basisMap, 'pakketten');
    for (const d of [inbox, pk]) { mkdirSync(d); chmodSync(d, 0o777); }
    const ondertekenaars = join(basisMap, 'ondertekenaars'); writeFileSync(ondertekenaars, 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n'); chmodSync(ondertekenaars, 0o644);
    const spoor = join(basisMap, 'spoor'); const stub = join(basisMap, 'stub.sh');
    writeFileSync(stub, `#!/bin/bash\necho "$1 $(cat "$2/UITROL-VERSIE")" >> "${spoor}"\n`); chmodSync(stub, 0o755);
    const scriptKopie = join(basisMap, 'uitrol.sh'); cpSync(SCRIPT, scriptKopie); chmodSync(scriptKopie, 0o755);
    const env: Record<string, string> = { PATH: `${bin}:${process.env.PATH}`, HOME: basisMap, LANG: 'C.UTF-8', UITROL_INBOX: inbox, UITROL_WERK: werk, UITROL_STATUS_DIR: statusMap, UITROL_ONDERTEKENAARS: ondertekenaars, UITROL_INSTALLEER: stub, UITROL_LOCK: join(basisMap, 'lock'), UITROL_GROEP: 'nogroup', UITROL_PAKKETTEN_DIR: pakketten };
    const draai = () => { const argv = alsRoot ? ['setpriv', '--reuid=65534', '--regid=65534', '--clear-groups', 'bash', scriptKopie] : ['bash', scriptKopie]; return spawnSync(argv[0], argv.slice(1), { env, encoding: 'utf8' }); };
    const status = () => { try { return JSON.parse(lees(join(statusMap, 'status.json'))); } catch { return {}; } };
    const leg = (p: string) => { const naam = p.split('/').pop()!; cpSync(p, join(inbox, naam)); chmodSync(join(inbox, naam), 0o644); writeFileSync(join(inbox, `${naam}.sig`), '-----BEGIN SSH SIGNATURE-----\nshim\n-----END SSH SIGNATURE-----\n'); chmodSync(join(inbox, `${naam}.sig`), 0o644); };
    const laatsteVersie = () => (existsSync(join(werk, 'laatste-versie')) ? lees(join(werk, 'laatste-versie')).trim() : null);
    const laatsteCommit = () => (existsSync(join(werk, 'laatste-commit')) ? lees(join(werk, 'laatste-commit')).trim() : null);
    const C0 = sha1('c0'); const C1 = sha1('c1'); const C2 = sha1('c2'); const C3 = sha1('c3');
    const spoorRegels = () => (existsSync(spoor) ? lees(spoor).trim().split('\n').filter(Boolean) : []);

    // 0. старий формат (без UITROL-BASIS, версія < 20261201) → встановлюється з попередженням; laatste-commit = BRON-COMMIT
    leg(pakket(pk, '20261101-090000', { basis: null, bronCommit: C0 }));
    let r = draai();
    check('0 старий формат без UITROL-BASIS → встановлено (OK), лог «oud formaat», laatste-versie і laatste-commit записані', r.status === 0 && status().code === 'OK' && /oud formaat/.test(r.stderr) && laatsteVersie() === '20261101-090000' && laatsteCommit() === C0 && spoorRegels().length === 1, `${r.status} ${status().code} ${r.stderr.slice(-400)}`);

    // 1. правильна база (встановлена версія + commit) → встановлено
    leg(pakket(pk, '20261102-100000', { basis: `versie=20261101-090000\ncommit=${C0}\n`, bronCommit: C1 }));
    r = draai();
    check('1 UITROL-BASIS = встановлена версія й commit → встановлено, laatste-commit оновлено', r.status === 0 && status().code === 'OK' && laatsteCommit() === C1 && /basis van het pakket: 20261101-090000 @ /.test(r.stderr), `${r.status} ${status().code} ${r.stderr.slice(-300)}`);

    // 2. застаріла база: пакет зібрано на 20261101-090000, а стоїть 20261102-100000
    leg(pakket(pk, '20261102-100100', { basis: `versie=20261101-090000\ncommit=${C0}\n`, bronCommit: C2 }));
    r = draai();
    check('2 база старіша за встановлену → BASIS_VEROUDERD, інсталятор не запущено, стан не змінився', r.status === 2 && status().code === 'BASIS_VEROUDERD' && laatsteVersie() === '20261102-100000' && laatsteCommit() === C1 && spoorRegels().length === 2, `${r.status} ${status().code}`);

    // 3. база тієї ж версії, але інший commit
    leg(pakket(pk, '20261102-100200', { basis: `versie=20261102-100000\ncommit=${C0}\n`, bronCommit: C2 }));
    r = draai();
    check('3 базовий commit ≠ встановлений → BASIS_COMMIT_VERSCHILT', r.status === 2 && status().code === 'BASIS_COMMIT_VERSCHILT' && r.stderr.includes(`pakket (${C0}) is niet de geïnstalleerde (${C1})`), `${r.status} ${status().code} ${r.stderr.slice(-300)}`);

    // 4. неповний UITROL-BASIS
    leg(pakket(pk, '20261102-100300', { basis: 'versie=2026\n', bronCommit: C2 }));
    r = draai();
    check('4 неповний UITROL-BASIS → BASIS_ONGELDIG', r.status === 2 && status().code === 'BASIS_ONGELDIG', `${r.status} ${status().code}`);

    // 5. правила в пакеті змінено без lock (справжні файли репозиторію + зіпсований AGENTS.md)
    const regels = { agents: lees('AGENTS.md'), beleid: lees('orchestratie/beleid.json'), besluiten: lees('orchestratie/BESLUITEN.md'), lock: lees('orchestratie/regels.lock.json') };
    const goedeBasis = `versie=20261102-100000\ncommit=${C1}\n`;
    leg(pakket(pk, '20261102-100400', { basis: goedeBasis, bronCommit: C2, regels: { ...regels, agents: regels.agents + '\n## Тихо додане правило\n' } }));
    r = draai();
    check('5 AGENTS.md змінено без lock → REGELS_NIET_VERGRENDELD з назвою файла', r.status === 2 && status().code === 'REGELS_NIET_VERGRENDELD' && /AGENTS\.md/.test(status().nl), `${r.status} ${status().code} ${status().nl}`);

    // 5b. обхід відбитка: beleid.json прибрано з regelBestanden, lock.hash чесно перераховано лише по AGENTS.md + BESLUITEN.md, а kritiek
    // змінено (privesleutelsNaarAgenten: true) зі СТАРИМ kritiekHash → root мусить відхилити (kritiekHash звіряється незалежно від списку).
    const beleidOmzeil = JSON.parse(regels.beleid); beleidOmzeil.regelBestanden = ['AGENTS.md', 'orchestratie/BESLUITEN.md']; beleidOmzeil.kritiek.privesleutelsNaarAgenten = true;
    const afdrukOmzeil = k.regelsAfdruk({ 'AGENTS.md': regels.agents, 'orchestratie/BESLUITEN.md': regels.besluiten });
    const lockOmzeil = JSON.stringify({ ...JSON.parse(regels.lock), hash: afdrukOmzeil.hash, bestanden: afdrukOmzeil.bestanden }, null, 2);
    leg(pakket(pk, '20261102-100450', { basis: goedeBasis, bronCommit: C2, regels: { ...regels, beleid: JSON.stringify(beleidOmzeil, null, 2) + '\n', lock: lockOmzeil } }));
    r = draai();
    check('5b beleid.json уникає відбитка (прибрано з regelBestanden) і змінює kritiek → REGELS_NIET_VERGRENDELD (kritiekHash)', r.status === 2 && status().code === 'REGELS_NIET_VERGRENDELD' && /kritiek/.test(status().nl), `${r.status} ${status().code} ${status().nl}`);

    // 6. узгоджений lock (відбиток порахований у JS kern.mjs), але режим na_bevestiging заборонено → MODUS_NIET_TOEGESTAAN (і python == JS відбиток!)
    const beleidModus = JSON.parse(regels.beleid); beleidModus.kritiek.installatieModi.toegestaan = ['handmatig']; beleidModus.kritiek.installatieModi.standaard = 'handmatig';
    const beleidTekst = JSON.stringify(beleidModus, null, 2) + '\n';
    const afdruk = k.regelsAfdruk({ 'AGENTS.md': regels.agents, 'orchestratie/beleid.json': beleidTekst, 'orchestratie/BESLUITEN.md': regels.besluiten });
    const lockModus = JSON.stringify({ schema: 1, regelsVersie: beleidModus.regelsVersie, hash: afdruk.hash, kritiekHash: k.kritiekAfdruk(beleidModus), bestanden: afdruk.bestanden, eigenaar: null }, null, 2);
    leg(pakket(pk, '20261102-100500', { basis: goedeBasis, bronCommit: C2, regels: { ...regels, beleid: beleidTekst, lock: lockModus } }));
    r = draai();
    check('6 lock узгоджений (python-відбиток root = JS-відбиток kern), але na_bevestiging не дозволено → MODUS_NIET_TOEGESTAAN', r.status === 2 && status().code === 'MODUS_NIET_TOEGESTAAN', `${r.status} ${status().code} ${status().nl}`);

    // 7. справжні правила репозиторію з lock → встановлено
    leg(pakket(pk, '20261102-100600', { basis: goedeBasis, bronCommit: C2, regels }));
    r = draai();
    check('7 правила з репозиторію + lock + правильна база → встановлено, «regels … vergrendeld» у лозі, laatste-commit = C2', r.status === 0 && status().code === 'OK' && /vergrendeld \(lock klopt\)/.test(r.stderr) && laatsteCommit() === C2, `${r.status} ${status().code} ${r.stderr.slice(-300)}`);

    // 8. CRLF у правилах (Windows) з тим самим lock → усе ще гаразд (нормалізація як у kern.mjs)
    leg(pakket(pk, '20261102-100700', { basis: `versie=20261102-100600\ncommit=${C2}\n`, bronCommit: C3, regels: { ...regels, agents: regels.agents.replace(/\n/g, '\r\n') } }));
    r = draai();
    check('8 AGENTS.md з CRLF, той самий lock → відбиток збігається, встановлено', r.status === 0 && status().code === 'OK', `${r.status} ${status().code} ${status().nl}`);

    // 9. версія ≥ 20261201 без UITROL-BASIS → GEEN_BASIS
    leg(pakket(pk, '20261202-100000', { basis: null, bronCommit: C3 }));
    r = draai();
    check('9 нова версія без UITROL-BASIS → GEEN_BASIS', r.status === 2 && status().code === 'GEEN_BASIS', `${r.status} ${status().code}`);
    check('інсталятор-стаб викликано рівно 4 рази (0, 1, 7, 8)', spoorRegels().length === 4, spoorRegels().join(' | '));

    // статичні плафони
    const uitrol = lees(SCRIPT); const gitops = lees('deploy/gitops/gitops-ophalen.sh');
    check('плафон: root пише laatste-commit лише з 40-hex BRON-COMMIT', uitrol.includes(`if [[ "\${BRON_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then printf '%s\\n' "$BRON_COMMIT" > "$WERK_ROOT/laatste-commit"; fi`));
    check('плафон: GitOps (автоматичний режим) вимагає automatisch_beperkt у політиці ТА підпис власника в lock', /automatisch_beperkt/.test(gitops) && /eigenaar/.test(gitops) && /MODUS_NIET_TOEGESTAAN/.test(gitops));
    check('плафон: усі нові коди root/gitops мають переклад у shared/uitrol-codes.ts', ['BASIS_ONGELDIG', 'BASIS_VEROUDERD', 'BASIS_COMMIT_VERSCHILT', 'GEEN_BASIS', 'REGELS_NIET_VERGRENDELD', 'MODUS_NIET_TOEGESTAAN'].every((c) => lees('shared/uitrol-codes.ts').includes(`${c}:`)));
  } finally { rmSync(basisMap, { recursive: true, force: true }); }
  return einde();
}
