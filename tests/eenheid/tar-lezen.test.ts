// tar-lezen (src/platform/tar-lezen.ts): de browser leest een uitrolpakket vóór de upload — dezelfde regels als root.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { leesPakket, naarBase64 } from '../../src/platform/tar-lezen';
import { checker } from './hulp/nep-google';

/** Minimale ustar-kop (voor zelfgemaakte, afwijkende archieven). */
function kop(naam: string, grootte: number, type = '0') {
  const b = Buffer.alloc(512);
  b.write(naam, 0, 100); b.write('0000644\0', 100); b.write('0000000\0', 108); b.write('0000000\0', 116);
  b.write(grootte.toString(8).padStart(11, '0') + '\0', 124); b.write('00000000000\0', 136); b.write('        ', 148); b.write(type, 156); b.write('ustar\0', 257); b.write('00', 263);
  let som = 0; for (const x of b) som += x; b.write(som.toString(8).padStart(6, '0') + '\0 ', 148);
  return b;
}
const inhoud = (s: string) => { const d = Buffer.from(s); return Buffer.concat([d, Buffer.alloc((512 - (d.length % 512)) % 512)]); };
const tar = (...delen: Buffer[]) => gzipSync(Buffer.concat([...delen, Buffer.alloc(1024)]));

export async function main(): Promise<number> {
  const { check, einde } = checker('tar-lezen');
  const map = mkdtempSync(join(tmpdir(), 'tar-lezen-'));
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const goed = join(map, 'goed.tar.gz');
  spawnSync('git', ['archive', '--format=tar.gz', '--prefix=mijn-ruimte-20261011-101010/', '--add-virtual-file=mijn-ruimte-20261011-101010/UITROL-VERSIE:20261011-101010', `--add-virtual-file=mijn-ruimte-20261011-101010/BRON-COMMIT:${commit}`, '-o', goed, 'HEAD']);
  const buf = readFileSync(goed);
  const r = await leesPakket(new Blob([buf]));
  check('git archive + UITROL-VERSIE: versie, commit, bovenmap, installer, geen problemen', r.info.versie === '20261011-101010' && r.info.commit === commit && r.info.bovenmap === 'mijn-ruimte-20261011-101010' && r.info.installer && r.info.problemen.length === 0, JSON.stringify({ ...r.info, bestanden: r.info.bestanden }));
  check('sha256 gelijk aan Node', r.sha256 === createHash('sha256').update(buf).digest('hex'));
  check('veel bestanden gelezen (alleen koppen)', r.info.bestanden > 100, String(r.info.bestanden));

  const oud = join(map, 'oud.tar.gz');
  spawnSync('git', ['archive', '--format=tar.gz', '--prefix=hub-abc/', '-o', oud, 'HEAD']);
  const r2 = await leesPakket(new Blob([readFileSync(oud)]));
  check('zonder UITROL-VERSIE: GEEN_VERSIE (commit uit de pax-kop van git)', r2.info.problemen.join() === 'GEEN_VERSIE' && r2.info.commit === commit, JSON.stringify(r2.info.problemen));

  const r3 = await leesPakket(new Blob([Buffer.from('geen gzip')]));
  check('geen gzip → GEEN_GZIP', r3.info.problemen.includes('GEEN_GZIP'));
  const r4 = await leesPakket(new Blob([tar(kop('a/UITROL-VERSIE', 15), inhoud('20261011-101010'), kop('a/../../etc/passwd', 1), inhoud('x'), kop('a/deploy/installeer-app.sh', 1), inhoud('#'))]));
  check('pad buiten de map → ONVEILIG_PAD', r4.info.problemen.includes('ONVEILIG_PAD'), JSON.stringify(r4.info.problemen));
  const r5 = await leesPakket(new Blob([tar(kop('a/UITROL-VERSIE', 15), inhoud('20261011-101010'), kop('a/link', 0, '2'), kop('a/deploy/installeer-app.sh', 1), inhoud('#'))]));
  check('symlink → GEEN_GEWOON_BESTAND', r5.info.problemen.includes('GEEN_GEWOON_BESTAND'));
  const r6 = await leesPakket(new Blob([tar(kop('a/UITROL-VERSIE', 15), inhoud('20261011-101010'), kop('b/deploy/installeer-app.sh', 1), inhoud('#'))]));
  check('twee bovenmappen → MEER_MAPPEN', r6.info.problemen.includes('MEER_MAPPEN'));
  const r7 = await leesPakket(new Blob([tar(kop('a/UITROL-VERSIE', 6), inhoud('v1.2.3'), kop('a/deploy/installeer-app.sh', 1), inhoud('#'))]));
  check('ongeldige versie → VERSIE_ONGELDIG', r7.info.problemen.includes('VERSIE_ONGELDIG'));
  const r8 = await leesPakket(new Blob([Buffer.concat([gzipSync(Buffer.alloc(100, 7))])]));
  check('rommel na gunzip → TAR_ONGELDIG of geen versie (nooit «klaar»)', r8.info.problemen.length > 0);
  const groot = new Uint8Array(200_000).map((_, i) => i % 251);
  check('naarBase64 = Buffer base64 (ook > 32 KiB)', naarBase64(groot) === Buffer.from(groot).toString('base64'));
  return einde();
}
