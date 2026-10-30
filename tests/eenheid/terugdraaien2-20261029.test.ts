// 29.10.2026 (terugdraaien-2): (1) besluit kwam nooit in de inbox — systemd ProtectSystem=strict zonder ReadWritePaths voor besluit-inbox
// (EROFS); nu staat de map in de unit, elke schrijffout heeft een eigen code en het bestand wordt na het schrijven teruggelezen vóór
// `aanvraag` root wekt. (2) commit «beed» = hex-letters uit «onbekend»; nu alleen een echte hex-commit. (3) installer pakte het archief
// altijd opnieuw in (SIGPIPE onder pipefail); nu wordt het geleverde archief bewaard en gaan beide sha256 naar het logboek.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { BESLUIT_CODES } from '../../shared/eigenaar-besluit';
import { parseRootGebeurtenissen } from '../../backend/server-beheer';

export async function main(): Promise<number> {
  const { check, einde } = checker('terugdraaien2-20261029');
  const w = mkdtempSync(join(tmpdir(), 'td2-'));
  process.env.BESLUIT_INBOX = join(w, 'inbox');
  const eb = await import('../../backend/eigenaar-besluit');

  // (1) unit + foutcodes + teruglezen
  const unit = readFileSync('deploy/mijn-ruimte.service', 'utf8');
  check('service: besluit-inbox beschrijfbaar', /^ReadWritePaths=-\/srv\/mijn-ruimte\/besluit-inbox$/m.test(unit));
  check('service: nog steeds ProtectSystem=strict', /^ProtectSystem=strict$/m.test(unit));
  const fe = (code: string) => Object.assign(new Error(code), { code });
  check('EROFS → INBOX_ALLEEN_LEZEN', eb.inboxFout(fe('EROFS')).code === 'INBOX_ALLEEN_LEZEN');
  check('EACCES → INBOX_GEEN_RECHT', eb.inboxFout(fe('EACCES')).code === 'INBOX_GEEN_RECHT');
  check('ENOENT → INBOX_ONTBREEKT', eb.inboxFout(fe('ENOENT')).code === 'INBOX_ONTBREEKT');
  check('ENOSPC → INBOX_VOL', eb.inboxFout(fe('ENOSPC')).code === 'INBOX_VOL');
  check('onbekend → INBOX_SCHRIJFFOUT', eb.inboxFout(new Error('x')).code === 'INBOX_SCHRIJFFOUT');
  check('detail noemt errno en pad', eb.inboxFout(fe('EROFS')).detail === `EROFS: ${join(w, 'inbox')}`);
  for (const c of ['INBOX_ALLEEN_LEZEN', 'INBOX_GEEN_RECHT', 'INBOX_ONTBREEKT', 'INBOX_VOL', 'INBOX_NIET_BEVESTIGD', 'INBOX_SCHRIJFFOUT'])
    check(`tekst uk+nl voor ${c}`, !!BESLUIT_CODES[c]?.[0] && !!BESLUIT_CODES[c]?.[1] && /[а-яіїє]/i.test(BESLUIT_CODES[c][0]) && !/[а-яіїє]/i.test(BESLUIT_CODES[c][1]));
  const id = 'a'.repeat(32), inhoud = JSON.stringify({ id }) + '\n';
  await eb.inboxSchrijven(id, inhoud, 'terugdraaien');
  check('besluit staat in de inbox (inhoud gelijk)', readFileSync(join(w, 'inbox', `besluit-${id}.json`), 'utf8') === inhoud);
  check('aanvraag pas na het besluit geschreven', existsSync(join(w, 'inbox', 'aanvraag')));
  check('geen .deel achtergebleven', !readdirSync(join(w, 'inbox')).some((n) => n.endsWith('.deel')));
  const st = await eb.inboxStand();
  check('proefschrijven: schrijfbaar', st.schrijfbaar === true && st.code === '');
  check('proefbestand opgeruimd', !readdirSync(join(w, 'inbox')).some((n) => n.startsWith('.proef')));
  // inbox onder een gewoon bestand → ENOTDIR → zichtbaar, geen aanvraag
  writeFileSync(join(w, 'blok'), 'x');
  process.env.BESLUIT_INBOX = join(w, 'blok', 'inbox');
  let code = '';
  try { await eb.inboxSchrijven('b'.repeat(32), inhoud, 'terugdraaien'); } catch (e) { code = eb.inboxFout(e).code; }
  check('schrijffout geeft code (geen stille 500)', code === 'INBOX_ONTBREEKT');
  // read-only bestandssysteem nabootsen kan niet zonder root-mount; EROFS-pad via de codekaart hierboven.
  const bron = readFileSync('backend/eigenaar-besluit.ts', 'utf8');
  const i1 = bron.indexOf("await inboxSchrijven("), i2 = bron.indexOf("fout(f.code, 500)");
  check('ondertekenen: fout → rij mislukt + code zichtbaar', i1 > 0 && i2 > i1 && /staat = 'mislukt', code = \$2/.test(bron.slice(i1, i2 + 40)));

  // (2) commit
  check('«onbekend» → leeg (niet «beed»)', eb.echteCommit('onbekend\n') === '');
  check('zonder-git → leeg', eb.echteCommit('zonder-git:op basis 20261029-110852') === '');
  check('echte commit blijft', eb.echteCommit('4AC737F\n') === '4ac737f');
  for (const f of ['deploy/besluit/mijn-ruimte-besluit.sh', 'deploy/opdracht/mijn-ruimte-opdracht.sh']) {
    const s = readFileSync(f, 'utf8');
    check(`${f}: geen hex-strip meer`, !s.includes('re.sub(r"[^0-9a-f]", ""') && s.includes('re.fullmatch(r"[0-9a-f]{7,40}"'));
  }
  const py = `import re\nfor ruw in ["onbekend","4ac737f","zonder-git:x"]:\n    r=ruw.strip().lower(); print(r if re.fullmatch(r"[0-9a-f]{7,40}", r) else "-")\n`;
  check('python-regel in root-script gedraagt zich', execFileSync('python3', ['-c', py], { encoding: 'utf8' }) === '-\n4ac737f\n-\n');

  // (3) pipefail: oude test faalt altijd (141), nieuwe vindt de eerste regel
  const pm = join(w, 'pk'); mkdirSync(join(pm, 'mijn-ruimte-x'), { recursive: true });
  for (let i = 0; i < 400; i++) writeFileSync(join(pm, 'mijn-ruimte-x', `f${i}.txt`), createHash('sha256').update(String(i)).digest('hex').repeat(200));
  execFileSync('tar', ['-czf', join(w, 'a.tar.gz'), '-C', pm, 'mijn-ruimte-x']);
  const sh = (s: string) => { try { execFileSync('bash', ['-c', `set -euo pipefail; ${s}`], { stdio: 'ignore' }); return 0; } catch (e) { return (e as { status: number }).status; } };
  const oud = sh(`tar -tzf ${join(w, 'a.tar.gz')} | head -n1 | grep -q '^mijn-ruimte-x/'`);
  const nieuw = sh(`eerste="$( (tar -tzf ${join(w, 'a.tar.gz')} 2>/dev/null || true) | head -n1 )"; case "$eerste" in mijn-ruimte-x/*) exit 0;; *) exit 7;; esac`);
  check(`oude test faalde (status ${oud})`, oud !== 0);
  check('nieuwe test herkent het archief', nieuw === 0);
  const inst = readFileSync('deploy/installeer-app.sh', 'utf8');
  check('installer: geleverd_sha256 + herkomst in gebeurtenis', inst.includes('geleverd_sha256') && inst.includes('pakket_herkomst'));
  const sha = 'c'.repeat(64), gs = 'd'.repeat(64);
  const g = parseRootGebeurtenissen(JSON.stringify({ id: '20261029T100000000000Z-0000000e', bron: 'uitrol', code: 'SSH_OK', tijd: '2026-10-29T10:00:00Z', pakket_pad: 'pakketten/mijn-ruimte-20261029-120000.tar.gz', pakket_sha256: sha, pakket_bytes: 5, geleverd_sha256: gs, pakket_herkomst: 'geleverd' }) + '\n')[0];
  check('parser: geleverdSha256', g?.geleverdSha256 === gs);
  check('parser: herkomst', g?.pakketHerkomst === 'geleverd');
  const g2 = parseRootGebeurtenissen(JSON.stringify({ id: '20261029T100000000000Z-0000000f', bron: 'uitrol', code: 'SSH_OK', geleverd_sha256: 'xyz', pakket_herkomst: 'iets' }) + '\n')[0];
  check('parser: ongeldige waarden genegeerd', !!g2 && !g2.geleverdSha256 && !g2.pakketHerkomst);
  const mig = readFileSync('migrations/0129_pakket_geleverd_sha256.sql', 'utf8');
  check('migratie 0129: beide kolommen', mig.includes('pakket_geleverd_sha256') && mig.includes('pakket_herkomst'));
  return einde();
}
