// NAZORG + RENDERCONTROLE (zone A, 22.10.2026, deploy/uitrol/mijn-ruimte-nazorg.sh): (A) een verzoek vanaf de site («Перевірити рендеринг»)
// = leeg bestand in de goedkeur-inbox → root start `rook-controle` (stand), hoogstens één keer per 10 min, en draait NOOIT terug;
// (B) in het bewakingsvenster: één keer, NAZORG_ROOK_NA s na de activering, `rook-controle --live`; code 1 = storing → zelfde terugdraai
// als bij een gezondheidsfout, met de reden «rook» in de gebeurtenis; code 2 (geen browser) = niets; nooit twee keer.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-nazorg-rook-20261022');
  const basis = mkdtempSync(join(tmpdir(), 'nazorg-rook-'));
  try {
    const dir = join(basis, 'uitrol'); const status = join(basis, 'status'); const bin = join(basis, 'bin'); const inbox = join(basis, 'inbox');
    for (const d of [dir, status, bin, inbox, join(basis, 'releases', 'oud')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(bin, 'curl'), '#!/bin/bash\n[ -f "$FAKE_GEZOND" ] && { echo \'{"ok":true}\'; exit 0; }; exit 22\n'); chmodSync(join(bin, 'curl'), 0o755);
    writeFileSync(join(bin, 'logger'), '#!/bin/bash\necho "$*" >> "$FAKE_LOGGER"\nexit 0\n'); chmodSync(join(bin, 'logger'), 0o755);
    const installeer = join(basis, 'installeer.sh');
    // Stub-installer: logt de aanroep; rook-controle geeft ROOK_RC terug en schrijft een JSON zoals de echte.
    writeFileSync(installeer, `#!/bin/bash\necho "$MIJN_RUIMTE_UITROL_MODUS $*" >> ${join(basis, 'aanroepen.txt')}\nif [ "$1" = rook-controle ]; then printf '%s' '{"samenvatting":{"uk":"Зламано (жива служба): сторінка id-inloggen не рендериться (#root leeg).","nl":"Kapot (live): pagina id-inloggen rendert niet (#root leeg)."},"kapot":true}' > "${status}/rook-controle.json"; exit "\${ROOK_RC:-0}"; fi\nexit 0\n`); chmodSync(installeer, 0o755);
    const gezond = join(basis, 'gezond'); const loggerUit = join(basis, 'logger.txt');
    const env = (extra: Record<string, string> = {}) => ({ ...process.env, PATH: `${bin}:${process.env.PATH}`, MIJN_RUIMTE_NAZORG_DIR: dir, MIJN_RUIMTE_NAZORG_INSTALLEER: installeer, MIJN_RUIMTE_STATUS_DIR: status, MIJN_RUIMTE_ROOK_VERZOEK: join(inbox, 'rook-verzoek'), FAKE_GEZOND: gezond, FAKE_LOGGER: loggerUit, ...extra });
    const run = (extra: Record<string, string> = {}) => execFileSync('bash', ['deploy/uitrol/mijn-ruimte-nazorg.sh'], { env: env(extra), encoding: 'utf8' });
    const aanroepen = () => (existsSync(join(basis, 'aanroepen.txt')) ? readFileSync(join(basis, 'aanroepen.txt'), 'utf8').trim().split('\n').filter(Boolean) : []);
    const events = () => (existsSync(join(status, 'gebeurtenissen.jsonl')) ? readFileSync(join(status, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    const zet = (tot: number, oud = false) => { writeFileSync(join(dir, 'nazorg'), `${tot} ${join(basis, 'releases', 'nieuw')} ${join(basis, 'releases', 'oud')}\n`); if (oud) utimesSync(join(dir, 'nazorg'), new Date(Date.now() - 600_000), new Date(Date.now() - 600_000)); };
    writeFileSync(gezond, '');

    // ---- A. verzoek vanaf de site
    run();
    check('zonder verzoek en zonder venster: niets', aanroepen().length === 0);
    writeFileSync(join(inbox, 'rook-verzoek'), 'willekeurige inhoud die root nooit leest');
    run();
    check('verzoekbestand → rook-controle (stand, modus nazorg) en het bestand is weg', aanroepen().join('|') === 'nazorg rook-controle' && !existsSync(join(inbox, 'rook-verzoek')), aanroepen().join('|'));
    writeFileSync(join(inbox, 'rook-verzoek'), '');
    run();
    check('tweede verzoek binnen 10 min: genegeerd (bestand wel weg), geen tweede aanroep', aanroepen().length === 1 && !existsSync(join(inbox, 'rook-verzoek')) && /genegeerd/.test(readFileSync(loggerUit, 'utf8')));
    writeFileSync(join(dir, 'rook-laatst'), '0'); writeFileSync(join(inbox, 'rook-verzoek'), '');
    run({ ROOK_RC: '1' });
    check('verzoek na de wachttijd: opnieuw rook-controle; een kapotte uitslag draait NOOIT terug (geen terugdraaien-aanroep, geen gebeurtenis)', aanroepen().length === 2 && aanroepen().every((a) => a === 'nazorg rook-controle') && events().length === 0);
    rmSync(join(inbox, 'rook-verzoek'), { force: true }); writeFileSync(join(inbox, 'rook-verzoek'), '');
    // symlink in plaats van bestand: genegeerd (root volgt niets in een app-schrijfbare map)
    rmSync(join(inbox, 'rook-verzoek')); execFileSync('ln', ['-s', '/etc/hostname', join(inbox, 'rook-verzoek')]); writeFileSync(join(dir, 'rook-laatst'), '0');
    run();
    check('symlink als verzoek: genegeerd en niet verwijderd', aanroepen().length === 2 && existsSync(join(inbox, 'rook-verzoek')));
    rmSync(join(inbox, 'rook-verzoek'));

    // ---- B. venster: live rendercontrole één keer, NAZORG_ROOK_NA s na de activering
    rmSync(join(basis, 'aanroepen.txt'), { force: true });
    zet(Math.floor(Date.now() / 1000) + 600);
    run({ NAZORG_ROOK_NA: '120' });
    check('vers venster (< 120 s): gezond, nog geen rendercontrole', aanroepen().length === 0 && !existsSync(join(dir, 'nazorg-rook')));
    zet(Math.floor(Date.now() / 1000) + 600, true);
    run({ NAZORG_ROOK_NA: '120', ROOK_RC: '0' });
    check('na 120 s: één keer rook-controle --live (modus nazorg), markering gezet, geen terugdraai bij code 0', aanroepen().join('|') === 'nazorg rook-controle --live' && existsSync(join(dir, 'nazorg-rook')) && existsSync(join(dir, 'nazorg')), aanroepen().join('|'));
    run({ NAZORG_ROOK_NA: '120', ROOK_RC: '0' }); run({ NAZORG_ROOK_NA: '120', ROOK_RC: '0' });
    check('daarna in hetzelfde venster: geen tweede rendercontrole', aanroepen().length === 1);
    // code 2 (geen browser): niets, geen terugdraai
    rmSync(join(basis, 'aanroepen.txt'), { force: true }); rmSync(join(dir, 'nazorg-rook'), { force: true }); zet(Math.floor(Date.now() / 1000) + 600, true);
    run({ NAZORG_ROOK_NA: '0', ROOK_RC: '2' });
    check('code 2 (niet uitgevoerd): geen terugdraai, venster blijft', aanroepen().join('|') === 'nazorg rook-controle --live' && existsSync(join(dir, 'nazorg')) && events().length === 0);
    // code 1: storing → terugdraaien met reden rook
    rmSync(join(basis, 'aanroepen.txt'), { force: true }); rmSync(join(dir, 'nazorg-rook'), { force: true }); zet(Math.floor(Date.now() / 1000) + 600, true);
    run({ NAZORG_ROOK_NA: '0', ROOK_RC: '1' });
    const a = aanroepen(); const ev = events();
    check('code 1 (kapot, live): terugdraaien naar de vorige release (modus nazorg), venster weg', a.join('|') === 'nazorg rook-controle --live|nazorg terugdraaien oud' && !existsSync(join(dir, 'nazorg')) && !existsSync(join(dir, 'nazorg-rook')), a.join('|'));
    check('gebeurtenis NAZORG_TERUGGEDRAAID (warn) met reden «rook», de paginanaam en de tekst van de rendercontrole, uk+nl', ev.length === 1 && ev[0].code === 'NAZORG_TERUGGEDRAAID' && ev[0].niveau === 'warn' && ev[0].reden === 'rook' && /не рендеряться у браузері \(.*id-inloggen/.test(ev[0].uk) && /renderen niet in de browser \(.*id-inloggen/.test(ev[0].nl) && /Міграції бази не відкочуються/.test(ev[0].uk), JSON.stringify(ev));
    run({ NAZORG_ROOK_NA: '0', ROOK_RC: '1' });
    check('na de terugdraai doet de schakelaar niets meer (nooit twee keer)', aanroepen().length === 2);
    // gezondheidsfout blijft werken zoals voorheen (reden gezondheid)
    rmSync(join(basis, 'aanroepen.txt'), { force: true }); rmSync(join(status, 'gebeurtenissen.jsonl'), { force: true }); zet(Math.floor(Date.now() / 1000) + 600); rmSync(gezond);
    run(); run(); run();
    check('gezondheidsfout ×3 → terugdraaien met reden gezondheid (ongewijzigd gedrag)', aanroepen().join('|') === 'nazorg terugdraaien oud' && events()[0]?.reden === 'gezondheid' && /перестав відповідати/.test(events()[0]?.uk || ''));
  } finally { rmSync(basis, { recursive: true, force: true }); }
  return einde();
}
