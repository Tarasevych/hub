// Lijst en download van de nachtelijke back-ups: alleen bekende bestandsnamen, geen padtruc, onvolledige mappen herkenbaar.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backupFile, listBackups } from '../../backend/mcp-console';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-backups');
  const dir = path.join(process.cwd(), 'rapporten', `bk-${Date.now()}`);
  const vorige = process.env.BACKUP_DIR;
  process.env.BACKUP_DIR = dir;
  try {
    const volledig = path.join(dir, '20261006-030000');
    await mkdir(volledig, { recursive: true });
    for (const n of ['database.dump.age', 'uploads.tar.gz.age', 'systeem.tar.gz.age', 'systeem-info.txt', 'SHA256SUMS']) await writeFile(path.join(volledig, n), 'x'.repeat(10));
    await writeFile(path.join(volledig, 'info.txt'), 'release=/srv/mijn-ruimte/releases/20261006-221302\nversleuteling=age\nmigraties=0001,0002,0003\n');
    await writeFile(path.join(volledig, 'KLAAR'), '2026-10-06T03:01:00+02:00\n');
    const oud = path.join(dir, '20261001-030000');
    await mkdir(oud, { recursive: true });
    await writeFile(path.join(oud, 'database.dump.age'), 'x');
    await mkdir(path.join(dir, 'rommel'), { recursive: true });

    const rijen = await listBackups();
    check('lijst: nieuwste eerst, mappen zonder tijdstempel genegeerd', rijen.length === 2 && rijen[0].stamp === '20261006-030000' && rijen[1].stamp === '20261001-030000');
    check('volledige back-up: klaar, versleuteld, release en migraties uit info.txt, systeemarchief aanwezig, totaal klopt', rijen[0].ready && rijen[0].encrypted && rijen[0].release === '20261002-x'.replace('20261002-x', '20261006-221302') && rijen[0].migrations === 3 && rijen[0].hasSystem && rijen[0].files.length === 6 && rijen[0].totalBytes === 5 * 10 + (await import('node:fs')).statSync(path.join(volledig, 'info.txt')).size);
    check('onvolledige back-up (geen KLAAR, geen systeemarchief) is herkenbaar', !rijen[1].ready && !rijen[1].hasSystem && rijen[1].files.length === 1);
    check('download: alleen bekende bestanden in een geldige map', backupFile('20261006-030000', 'systeem.tar.gz.age').endsWith(path.join('20261006-030000', 'systeem.tar.gz.age')) && backupFile('20261006-030000', 'KLAAR') === '' && backupFile('20261006-030000', '../../etc/passwd') === '' && backupFile('../x', 'info.txt') === '' && backupFile('20261006-030000/..', 'info.txt') === '' && backupFile('', '') === '');
    process.env.BACKUP_DIR = path.join(dir, 'bestaat-niet');
    check('ontbrekende back-upmap geeft een lege lijst, geen fout', (await listBackups()).length === 0);

    // ---- volledig archief: voortgang uit kit-status.txt ----
    const { readKitStatus, archiveFile } = await import('../../backend/mcp-console');
    const { utimes, writeFile: wf, rm } = await import('node:fs/promises');
    // 0.4: de status en het archief staan in de root-uitgiftemap (ARCHIEF_UIT); het verzoek blijft in uploads/mcp-archives.
    const uploads = path.join(dir, 'uploads'); const verzoek = path.join(uploads, 'mcp-archives'); const kit = path.join(dir, 'uitgifte');
    await mkdir(verzoek, { recursive: true }); await mkdir(kit, { recursive: true });
    const vorigeUploads = process.env.UPLOADS_DIR; process.env.UPLOADS_DIR = uploads;
    const vorigeUit = process.env.ARCHIEF_UIT; process.env.ARCHIEF_UIT = kit;
    const veroud = (file: string, msAgo: number) => utimes(file, new Date(Date.now() - msAgo), new Date(Date.now() - msAgo));
    try {
      check('geen status en geen verzoek: leeg (idle)', Object.keys(await readKitStatus()).length === 0);
      await wf(path.join(kit, 'kit-status.txt'), 'state=building\nstage=3\npct=61\nphase=files\ndetail=bestanden: 12M\n');
      const bezig = await readKitStatus();
      check('lopende bouw: stap, percentage en wat er nu gebeurt komen door', bezig.state === 'building' && bezig.stage === '3' && bezig.pct === '61' && bezig.detail === 'bestanden: 12M');
      await veroud(path.join(kit, 'kit-status.txt'), 11 * 60_000);
      const vast = await readKitStatus();
      check('status die >10 min niet meer verandert = STALLED (geen eeuwig draaiend scherm)', vast.state === 'failed' && vast.error === 'STALLED');
      await wf(path.join(verzoek, 'kit-request'), 'go\n');
      const wacht = await readKitStatus();
      check('net aangevraagd: "in de rij" (building/queued), geen oude uitkomst', wacht.state === 'building' && wacht.phase === 'queued');
      await veroud(path.join(verzoek, 'kit-request'), 90_000);
      const nooit = await readKitStatus();
      check('verzoek >60 s onbehandeld = NOT_STARTED (de service draait niet)', nooit.state === 'failed' && nooit.error === 'NOT_STARTED');
      await rm(path.join(verzoek, 'kit-request'));
      await wf(path.join(kit, 'kit-status.txt'), 'state=ready\nstage=5\npct=100\nname=mijn-ruimte-20261007-200000-volledig.tar.age\nbytes=123\n');
      check('klaar: naam en grootte', (await readKitStatus()).state === 'ready' && (await readKitStatus()).bytes === '123');
      check('archief: vaste naam en de eigen generaties (.tar.age) zijn toegestaan; oude onversleutelde namen en padtrucs niet',
        archiveFile() === path.join(kit, 'archief-laatste.tar.age') && archiveFile('archief-laatste.tar.age') === path.join(kit, 'archief-laatste.tar.age')
        && archiveFile('mijn-ruimte-20261007-200000-volledig.tar.age') === path.join(kit, 'mijn-ruimte-20261007-200000-volledig.tar.age')
        && archiveFile('mijn-ruimte-20261007-200000-volledig.tar') === '' && archiveFile('mijn-ruimte-20261006-125448-kod-baza-fajly-sekrety-instrukcija.tar.gz') === ''
        && archiveFile('../mijn-ruimte-20261007-200000-volledig.tar.age') === '' && archiveFile('mijn-ruimte-1-volledig.tar.age') === '' && archiveFile('../x.tar') === '');

      // Twee generaties: op schijf staan 3 eigen archieven (één zonder geschiedenisregel), de geschiedenis heeft een regel te veel.
      // Verwacht: 4 rijen, nieuwste eerst; de regel zonder bestand (20261001) kept=false; het vreemde bestand rommel.tar.age telt niet mee.
      await wf(path.join(kit, 'mijn-ruimte-20261005-100000-volledig.tar.age'), 'x'.repeat(40));
      await wf(path.join(kit, 'mijn-ruimte-20261007-200000-volledig.tar.age'), 'x'.repeat(50));
      await wf(path.join(kit, 'mijn-ruimte-20261009-090000-volledig.tar.age'), 'x'.repeat(60));
      await wf(path.join(kit, 'rommel.tar.age'), 'x');
      await wf(path.join(kit, 'history.json'), JSON.stringify([
        { at: '2026-10-07T20:00:00.000Z', name: 'mijn-ruimte-20261007-200000-volledig.tar.age', bytes: 50, kod: 1, baza: 2, fajly: 3, sekrety: 4 },
        { at: '2026-10-05T10:00:00.000Z', name: 'mijn-ruimte-20261005-100000-volledig.tar.age', bytes: 40, kod: 0, baza: 0, fajly: 0, sekrety: 0 },
        { at: '2026-10-01T10:00:00.000Z', name: 'mijn-ruimte-20261001-100000-volledig.tar.age', bytes: 30, kod: 0, baza: 0, fajly: 0, sekrety: 0 },
      ]));
      const { archiveHistory } = await import('../../backend/mcp-console');
      const geschiedenis = await archiveHistory();
      check('geschiedenis: twee bewaarde generaties + oudere notitie zonder bestand, nieuwste eerst, vreemd bestand telt niet mee',
        geschiedenis.map((r) => `${r.name.slice(12, 20)}:${r.kept ? 'op-schijf' : 'weg'}`).join(',') ==='20261009:op-schijf,20261007:op-schijf,20261005:op-schijf,20261001:weg'
        && geschiedenis.length === 4 && !geschiedenis.some((r) => r.name === 'rommel.tar.age'));
      check('geschiedenis: de regel van 20261009 (geen historieregel) krijgt de grootte van het bestand', geschiedenis[0].bytes === 60 && geschiedenis[1].kod === 1);
      check('back-ups: onversleutelde namen zijn niet meer te downloaden', backupFile('20261006-030000', 'database.dump') === '' && backupFile('20261006-030000', 'uploads.tar.gz') === '' && backupFile('20261006-030000', 'systeem.tar.gz') === '');
    } finally {
      if (vorigeUploads === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = vorigeUploads;
      if (vorigeUit === undefined) delete process.env.ARCHIEF_UIT; else process.env.ARCHIEF_UIT = vorigeUit;
    }
  } finally {
    if (vorige === undefined) delete process.env.BACKUP_DIR; else process.env.BACKUP_DIR = vorige;
  }
  return einde();
}
