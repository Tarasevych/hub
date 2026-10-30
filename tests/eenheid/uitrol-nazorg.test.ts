// Dode-mansschakelaar na een uitrol (deploy/uitrol/mijn-ruimte-nazorg.sh): alleen binnen het venster, pas na N opeenvolgende fouten,
// één keer terugdraaien, herstel van gezondheid zet de teller op nul, en een gebeurtenis voor het dashboard.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-nazorg');
  const basis = mkdtempSync(join(tmpdir(), 'nazorg-'));
  try {
    const dir = join(basis, 'uitrol'); const status = join(basis, 'status'); const bin = join(basis, 'bin');
    for (const d of [dir, status, bin, join(basis, 'releases', 'oud')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(bin, 'curl'), '#!/bin/bash\n[ -f "$FAKE_GEZOND" ] && { echo \'{"ok":true}\'; exit 0; }; exit 22\n'); chmodSync(join(bin, 'curl'), 0o755);
    writeFileSync(join(bin, 'logger'), '#!/bin/bash\nexit 0\n'); chmodSync(join(bin, 'logger'), 0o755);
    const installeer = join(basis, 'installeer.sh');
    writeFileSync(installeer, `#!/bin/bash\necho "$MIJN_RUIMTE_UITROL_MODUS $*" >> ${join(basis, 'aanroepen.txt')}\nexit 0\n`); chmodSync(installeer, 0o755);
    const gezond = join(basis, 'gezond');
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MIJN_RUIMTE_NAZORG_DIR: dir, MIJN_RUIMTE_NAZORG_INSTALLEER: installeer, MIJN_RUIMTE_STATUS_DIR: status, FAKE_GEZOND: gezond };
    const run = () => execFileSync('bash', ['deploy/uitrol/mijn-ruimte-nazorg.sh'], { env, encoding: 'utf8' });
    const aanroepen = () => (existsSync(join(basis, 'aanroepen.txt')) ? readFileSync(join(basis, 'aanroepen.txt'), 'utf8').trim().split('\n').filter(Boolean) : []);
    const zet = (tot: number) => writeFileSync(join(dir, 'nazorg'), `${tot} ${join(basis, 'releases', 'nieuw')} ${join(basis, 'releases', 'oud')}\n`);

    run();
    check('zonder nazorg-bestand: niets', aanroepen().length === 0);
    zet(Math.floor(Date.now() / 1000) + 600);
    writeFileSync(gezond, ''); run(); run();
    check('gezonde site: geen terugdraaien, geen teller', aanroepen().length === 0 && !existsSync(join(dir, 'nazorg-fouten')));
    rmSync(gezond); run(); run();
    check('twee fouten: nog niet terugdraaien', aanroepen().length === 0 && readFileSync(join(dir, 'nazorg-fouten'), 'utf8').trim() === '2');
    writeFileSync(gezond, ''); run();
    check('herstel zet de teller op nul', !existsSync(join(dir, 'nazorg-fouten')));
    rmSync(gezond); run(); run(); run();
    const a = aanroepen();
    check('drie fouten achter elkaar: één keer terugdraaien naar de vorige release, modus nazorg', a.length === 1 && a[0] === 'nazorg terugdraaien oud', a.join('|'));
    check('na het terugdraaien is het nazorg-bestand weg (nooit twee keer)', !existsSync(join(dir, 'nazorg')) && !existsSync(join(dir, 'nazorg-fouten')));
    run(); run(); run();
    check('daarna doet de schakelaar niets meer', aanroepen().length === 1);
    const ev = readFileSync(join(status, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    check('gebeurtenis NAZORG_TERUGGEDRAAID met tekst in beide talen', ev.length === 1 && ev[0].code === 'NAZORG_TERUGGEDRAAID' && !!ev[0].uk && !!ev[0].nl && ev[0].niveau === 'warn', JSON.stringify(ev));
    zet(Math.floor(Date.now() / 1000) - 5); run(); run(); run();
    check('verlopen venster: geen controle en bestand opgeruimd', aanroepen().length === 1 && !existsSync(join(dir, 'nazorg')));
    zet(Math.floor(Date.now() / 1000) + 600); writeFileSync(join(dir, 'nazorg'), `${Math.floor(Date.now() / 1000) + 600} ${join(basis, 'releases', 'nieuw')} ${join(basis, 'releases', 'bestaat-niet')}\n`);
    run(); run(); run();
    const ev2 = readFileSync(join(status, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    check('zonder bruikbare vorige release: melding NAZORG_MISLUKT (niveau error), geen aanroep', aanroepen().length === 1 && ev2[1]?.code === 'NAZORG_MISLUKT' && ev2[1]?.niveau === 'error', JSON.stringify(ev2[1]));
  } finally { rmSync(basis, { recursive: true, force: true }); }
  return einde();
}
