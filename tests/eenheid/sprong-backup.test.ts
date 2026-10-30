// Twee meldingen van de eigenaar, 18.10.2026:
//  1. «сайт стрибає та повертає сторінку завжди до верху» — TabsRij riep bij ELKE herrendering scrollIntoView({block:'nearest'})
//     op het actieve tabblad; /updates vernieuwt elke paar seconden → de pagina werd telkens naar de tabbladen getrokken
//     (live gemeten: 14× scrollIntoView op ut-tab-overzicht in 1 min, sprongen 474→301 en 1780→301 px).
//  2. «Встановлення не вдалося на кроці «резервна копія бази»: Job for mijn-ruimte-backup.service failed…» — geen oorzaak, geen
//     tweede poging; een identieke tweede uitrol 3 min later lukte wél.
// Elke check bootst eerst het oude gedrag na en bewijst dan dat het weg is.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { tabInBeeld } from '../../src/uitrol/TabsRij'; // doorverwijzing naar src/ontwerp/TabsRij.tsx (21.10)

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const zonderCommentaar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('sprong-backup');

  // ------------------------------------------------------------------ 1. pagina springt niet meer
  const rij = zonderCommentaar(lees('src/ontwerp/TabsRij.tsx'));
  check('TabsRij gebruikt geen scrollIntoView meer (scrolt nooit de pagina, alleen de rij)', !/scrollIntoView/.test(rij));
  check('effect voor het actieve tabblad doet alleen iets als het actieve tabblad verandert', /if \(id === actiefId\.current\) return;/.test(rij) && /n\.scrollLeft = doel/.test(rij));
  check('meet-effect draait één keer (afhankelijkheden []), niet bij elke herrendering', /window\.removeEventListener\('resize', meet\); \};\s*\}, \[\]\);/.test(rij));
  check('tabInBeeld: tabblad al zichtbaar → niets doen (geen scroll)', tabInBeeld({ scrollLeft: 0, clientWidth: 390 }, { offsetLeft: 10, offsetWidth: 90 }) === null);
  check('tabInBeeld: tabblad rechts buiten beeld → rij scrolt horizontaal tot het past', tabInBeeld({ scrollLeft: 0, clientWidth: 390 }, { offsetLeft: 420, offsetWidth: 110 }) === 420 + 110 + 8 - 390);
  check('tabInBeeld: tabblad links buiten beeld → rij scrolt terug', tabInBeeld({ scrollLeft: 300, clientWidth: 390 }, { offsetLeft: 120, offsetWidth: 90 }) === 112);
  const wiz = lees('src/uitrol/Upload.tsx');
  check('wizard scrolt alleen vooruit (automatisch leegmaken na afloop trekt de pagina niet weg)', /vooruit\(vorigeStap\.current, actief\)/.test(wiz));

  // ------------------------------------------------------------------ 2. back-up: echte oorzaak + één nieuwe poging
  const inst = lees('deploy/installeer-app.sh');
  // 21.10.2026: migreren() roept eerst pg_versie_controleren aan (server/pg-versie.ts); die wordt hier als no-op gestubd, net als voortgang/melding.
  const fn = (inst.match(/^migreren\(\) \{[\s\S]*?^\}/m) || [''])[0];
  check('migreren() gevonden in installeer-app.sh', fn.length > 100);
  const T = mkdtempSync(join(tmpdir(), 'mr-backup-'));
  const stub = (naam: string, body: string) => { writeFileSync(join(T, naam), `#!/bin/bash\n${body}\n`); chmodSync(join(T, naam), 0o755); };
  // systemctl: «cat» ok; «start» faalt de eerste N keer (teller in een bestand).
  stub('systemctl', `echo "$@" >> "${T}/systemctl.log"; [ "$1" = cat ] && exit 0; [ "$1" = reset-failed ] && exit 0; if [ "$1" = start ]; then n=$(cat "${T}/n" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${T}/n"; [ $n -le "$FAAL" ] && { echo "Job for mijn-ruimte-backup.service failed because the control process exited with error code." >&2; exit 1; }; exit 0; fi; exit 0`);
  stub('journalctl', `echo "[backup] database dumpen…"; echo "pg_dump: error: connection to server failed: FATAL:  too many connections for role \\"mijnruimte_systeem\\""`);
  stub('systemd-run', `echo "[migratie] niets te doen" ; exit 0`);
  stub('sleep', 'exit 0');
  const draai = (faal: number) => {
    writeFileSync(join(T, 'n'), '0');
    const script = `set -euo pipefail\nmelding() { echo "[installeer] $*"; }\nfout() { echo "[installeer] FOUT: $*" >&2; exit 1; }\nvoortgang() { echo "[installeer] stap: $1 ($2%) \${3:-}"; }\npg_versie_controleren() { :; }\nHUIDIG="${T}"; GEBRUIKER=x; GEHEIMEN=/dev/null; MIGRATIE_ENV=/dev/null; NODE=node\n${fn}\nmigreren "${T}"\n`;
    return spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${T}:${process.env.PATH}`, FAAL: String(faal) } });
  };
  // Oud gedrag nagebootst: één «systemctl start» zonder tweede poging zou bij FAAL=1 mislukken.
  const oud = spawnSync('bash', ['-c', `systemctl start mijn-ruimte-backup.service || { echo "[installeer] FOUT: back-up mislukt" >&2; exit 1; }`], { encoding: 'utf8', env: { ...process.env, PATH: `${T}:${process.env.PATH}`, FAAL: '1' } });
  writeFileSync(join(T, 'n'), '0');
  check('oud gedrag nagebootst: eenmalige storing → uitrol mislukt zonder oorzaak', oud.status === 1 && !/pg_dump/.test(oud.stderr + oud.stdout));
  const eenmaal = draai(1);
  check('nieuw: eenmalige storing → tweede poging lukt, migraties gaan door (exit 0)', eenmaal.status === 0 && /nog één poging/.test(eenmaal.stdout) && /stap: migraties/.test(eenmaal.stdout), (eenmaal.stdout + eenmaal.stderr).slice(-400));
  check('nieuw: de echte oorzaak staat in het logboek van de run ([backup] pg_dump …)', /\[backup\] pg_dump: error/.test(eenmaal.stdout));
  const tweemaal = draai(2);
  check('nieuw: twee keer mislukt → FOUT mét oorzaak (niet alleen «Job … failed»), geen migratie', tweemaal.status === 1 && /FOUT: back-up mislukt \(2 pogingen\): .*too many connections/.test(tweemaal.stderr) && !/stap: migraties/.test(tweemaal.stdout), tweemaal.stderr.slice(-300));
  const ok = draai(0);
  check('nieuw: geen storing → één poging, geen wachttijd', ok.status === 0 && !/nog één poging/.test(ok.stdout) && (readFileSync(join(T, 'systemctl.log'), 'utf8').match(/^start /gm) || []).length >= 1);
  return einde();
}
