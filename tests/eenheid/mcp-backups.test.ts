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
    const uploads = path.join(dir, 'uploads'); const kit = path.join(uploads, 'mcp-archives');
    await mkdir(kit, { recursive: true });
    const vorigeUploads = process.env.UPLOADS_DIR; process.env.UPLOADS_DIR = uploads;
    const veroud = (file: string, msAgo: number) => utimes(file, new Date(Date.now() - msAgo), new Date(Date.now() - msAgo));
    try {
      check('geen status en geen verzoek: leeg (idle)', Object.keys(await readKitStatus()).length === 0);
      await wf(path.join(kit, 'kit-status.txt'), 'state=building\nstage=3\npct=61\nphase=files\ndetail=bestanden: 12M\n');
      const bezig = await readKitStatus();
      check('lopende bouw: stap, percentage en wat er nu gebeurt komen door', bezig.state === 'building' && bezig.stage === '3' && bezig.pct === '61' && bezig.detail === 'bestanden: 12M');
      await veroud(path.join(kit, 'kit-status.txt'), 11 * 60_000);
      const vast = await readKitStatus();
      check('status die >10 min niet meer verandert = STALLED (geen eeuwig draaiend scherm)', vast.state === 'failed' && vast.error === 'STALLED');
      await wf(path.join(kit, 'kit-request'), 'go\n');
      const wacht = await readKitStatus();
      check('net aangevraagd: "in de rij" (building/queued), geen oude uitkomst', wacht.state === 'building' && wacht.phase === 'queued');
      await veroud(path.join(kit, 'kit-request'), 90_000);
      const nooit = await readKitStatus();
      check('verzoek >60 s onbehandeld = NOT_STARTED (de service draait niet)', nooit.state === 'failed' && nooit.error === 'NOT_STARTED');
      await rm(path.join(kit, 'kit-request'));
      await wf(path.join(kit, 'kit-status.txt'), 'state=ready\nstage=5\npct=100\nname=mijn-ruimte-20261007-200000-volledig.tar\nbytes=123\n');
      check('klaar: naam en grootte', (await readKitStatus()).state === 'ready' && (await readKitStatus()).bytes === '123');
      check('bestandsnamen: nieuw formaat en oud formaat toegestaan, rest niet', archiveFile('mijn-ruimte-20261007-200000-volledig.tar').endsWith('-volledig.tar') && archiveFile('mijn-ruimte-20261006-125448-kod-baza-fajly-sekrety-instrukcija.tar.gz') !== '' && archiveFile('../x.tar') === '' && archiveFile('mijn-ruimte-1-volledig.tar') === '' && archiveFile('mijn-ruimte-20261007-200000-volledig.tar.sh') === '');
    } finally { if (vorigeUploads === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = vorigeUploads; }
  } finally {
    if (vorige === undefined) delete process.env.BACKUP_DIR; else process.env.BACKUP_DIR = vorige;
  }
  return einde();
}
