// tar-lezen (src/platform/tar-lezen.ts): de browser leest een uitrolpakket vóór de upload — dezelfde regels als root.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { leesPakket, naarBase64 } from '../../src/platform/tar-lezen';
import { checker } from './hulp/nep-google';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';

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
  let commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const goed = join(map, 'goed.tar.gz');
  const P = 'mijn-ruimte-20261011-101010';
  const metaVirt = [`--add-virtual-file=${P}/UITROL-VERSIE:20261011-101010`, `--add-virtual-file=${P}/BRON-COMMIT:${commit}`, `--add-virtual-file=${P}/AUTEUR:Claude (Anthropic)`, `--add-virtual-file=${P}/AGENT:claude`, `--add-virtual-file=${P}/SAMENVATTING:Nieuwe uitrol-pagina met stappen, voorcontrole en nazorg.`];
  const g = spawnSync('git', ['archive', '--format=tar.gz', `--prefix=${P}/`, ...metaVirt, '-o', goed, 'HEAD']);
  const bestandOk = g.status === 0 && (readFileSync(goed).length > 100);
  if (!bestandOk) {
    // Geen git-checkout (bv. de uitgepakte testmap): zelf een archief met dezelfde vorm maken, >100 bestanden, met git-achtige pax-kop.
    commit = 'a'.repeat(40);
    const bron = join(map, 'bron', P); mkdirSync(join(bron, 'deploy'), { recursive: true });
    for (let i = 0; i < 120; i++) writeFileSync(join(bron, `f${i}.txt`), `bestand ${i}\n`);
    writeFileSync(join(bron, 'deploy', 'installeer-app.sh'), '#!/bin/bash\n');
    for (const [n, v] of Object.entries({ 'UITROL-VERSIE': '20261011-101010', 'BRON-COMMIT': commit, AUTEUR: 'Claude (Anthropic)', AGENT: 'claude', SAMENVATTING: 'Nieuwe uitrol-pagina met stappen, voorcontrole en nazorg.' })) writeFileSync(join(bron, n), v);
    spawnSync('tar', ['-czf', goed, '-C', join(map, 'bron'), P]);
  }
  const oud = join(map, 'oud.tar.gz');
  const oudBron = join(map, 'oudbron', 'hub-abc'); mkdirSync(join(oudBron, 'deploy'), { recursive: true }); writeFileSync(join(oudBron, 'deploy', 'installeer-app.sh'), '#!/bin/bash\n'); writeFileSync(join(oudBron, 'x.txt'), 'x');
  if (spawnSync('git', ['archive', '--format=tar.gz', '--prefix=hub-abc/', '-o', oud, 'HEAD']).status !== 0) spawnSync('tar', ['-czf', oud, '-C', join(map, 'oudbron'), 'hub-abc']);
  const buf = readFileSync(goed);
  const r = await leesPakket(new Blob([buf]));
  check('git archive + UITROL-VERSIE: versie, commit, bovenmap, installer, geen problemen', r.info.versie === '20261011-101010' && r.info.commit === commit && r.info.bovenmap === 'mijn-ruimte-20261011-101010' && r.info.installer && r.info.problemen.length === 0, JSON.stringify({ ...r.info, bestanden: r.info.bestanden }));
  check('metadata uit het pakket: auteur, agent en samenvatting (de beschrijving van de wijziging)', r.info.auteur === 'Claude (Anthropic)' && r.info.agent === 'claude' && r.info.samenvatting.startsWith('Nieuwe uitrol-pagina'), JSON.stringify(r.info));
  check('sha256 gelijk aan Node', r.sha256 === createHash('sha256').update(buf).digest('hex'));
  check('veel bestanden gelezen (alleen koppen)', r.info.bestanden > 100, String(r.info.bestanden));

  const r2 = await leesPakket(new Blob([readFileSync(oud)]));
  check('zonder UITROL-VERSIE: GEEN_VERSIE (commit uit de pax-kop van git)', r2.info.problemen.includes('GEEN_VERSIE') && (!bestandOk || r2.info.commit === commit), JSON.stringify(r2.info.problemen));

  check('zonder metadata-bestanden: GEEN_AUTEUR, GEEN_AGENT en GEEN_SAMENVATTING (beschrijving verplicht)', ['GEEN_AUTEUR', 'GEEN_AGENT', 'GEEN_SAMENVATTING'].every((c) => r2.info.problemen.includes(c)), JSON.stringify(r2.info.problemen));
  const meta = (extra: Buffer[]) => tar(kop('a/UITROL-VERSIE', 15), inhoud('20261011-101010'), kop('a/deploy/installeer-app.sh', 1), inhoud('#'), ...extra);
  const rk = await leesPakket(new Blob([meta([kop('a/AUTEUR', 3), inhoud('Ik'), kop('a/AGENT', 8), inhoud('Claude 1'), kop('a/SAMENVATTING', 5), inhoud('kort')])]));
  check('te korte/ongeldige metadata → AUTEUR_KORT, AGENT_ONGELDIG, SAMENVATTING_KORT', ['AUTEUR_KORT', 'AGENT_ONGELDIG', 'SAMENVATTING_KORT'].every((c) => rk.info.problemen.includes(c)), JSON.stringify(rk.info.problemen));
  const tekstLang = 'Wat en waarom: de pagina is opnieuw ingedeeld.\nRegel twee met meer uitleg.';
  const goedeMeta = [kop('a/AUTEUR', 6), inhoud('Pavlo\n'), kop('a/AGENT', 7), inhoud('cursor\n'), kop('a/SAMENVATTING', tekstLang.length), inhoud(tekstLang)];
  const metCommit = (c: string) => [kop('a/BRON-COMMIT', Buffer.byteLength(c)), inhoud(c)];
  const rl = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit(`${'e'.repeat(40)}\n`)])]));
  check('meerregelige samenvatting blijft behouden, geen metadataproblemen', rl.info.samenvatting === tekstLang && rl.info.agent === 'cursor' && rl.info.auteur === 'Pavlo' && rl.info.problemen.length === 0 && rl.info.commit === 'e'.repeat(40), JSON.stringify(rl.info));
  // Regel 3 (audit 18.10.2026, punt 10): zonder geldige BRON-COMMIT blokkeert de wizard al in de browser (zoals root en de voorcontrole).
  const rz = await leesPakket(new Blob([meta(goedeMeta)]));
  check('zonder BRON-COMMIT → GEEN_BRON_COMMIT (wizard blokkeert vóór het uploaden)', rz.info.problemen.includes('GEEN_BRON_COMMIT'), JSON.stringify(rz.info.problemen));
  const ru = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit('unknown\n')])]));
  check('BRON-COMMIT «unknown» → GEEN_BRON_COMMIT', ru.info.problemen.includes('GEEN_BRON_COMMIT') && ru.info.commit === '', JSON.stringify(ru.info));
  const zg = 'zonder-git: gebouwd in een sandbox zonder git\n';
  const rg = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit(zg)])]));
  check('«zonder-git:<reden>» → geen probleem; commit = «zonder-git:<reden>» (spaties behouden)', rg.info.problemen.length === 0 && rg.info.commit === 'zonder-git:gebouwd in een sandbox zonder git', JSON.stringify(rg.info));

  // 29.10.2026: TESTRESULTATEN (vrijwillig) wordt gelezen en gaat als «tests» mee naar het voorstel; kapotte JSON = alsof afwezig.
  const trJson = '{"geslaagd":42,"mislukt":0,"samenvatting":"alles groen"}';
  const rt = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit(`${'e'.repeat(40)}\n`), kop('a/TESTRESULTATEN', Buffer.byteLength(trJson)), inhoud(trJson)])]));
  check('TESTRESULTATEN in het pakket → info.tests {42, 0, samenvatting}; geen probleemcode', rt.info.tests?.geslaagd === 42 && rt.info.tests?.mislukt === 0 && rt.info.tests?.samenvatting === 'alles groen' && rt.info.problemen.length === 0, JSON.stringify(rt.info.tests));
  check('zonder TESTRESULTATEN → info.tests null, geen probleemcode (vrijwillig)', rl.info.tests === null && rl.info.problemen.length === 0);
  const rtk = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit(`${'e'.repeat(40)}\n`), kop('a/TESTRESULTATEN', 9), inhoud('geen json')])]));
  check('kapot TESTRESULTATEN → info.tests null, geen probleemcode', rtk.info.tests === null && rtk.info.problemen.length === 0);
  // UI-010: UITROL-MANIFEST.json in de browser (zelfde regels als de voorcontrole); versie 20261011 < grens → vrijwillig.
  const mJson = manifestVoor('20261011-101010');
  const rm = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit(`${'e'.repeat(40)}\n`), kop('a/UITROL-MANIFEST.json', Buffer.byteLength(mJson)), inhoud(mJson)])]));
  check('UI-010: geldig manifest → info.manifest met uk+nl, geen probleem', rm.info.problemen.length === 0 && rm.info.manifest?.beschrijving.uk.titel === 'Хмара нового покоління', JSON.stringify(rm.info.manifestFouten));
  const slecht = manifestVoor('20261011-101010', { deelnemers: [{ soort: 'ai', naam: 'gpt', rollen: ['ontwikkeling'] }] });
  const rs = await leesPakket(new Blob([meta([...goedeMeta, ...metCommit(`${'e'.repeat(40)}\n`), kop('a/UITROL-MANIFEST.json', Buffer.byteLength(slecht)), inhoud(slecht)])]));
  check('UI-010: manifest zonder agent-metadata → MANIFEST_ONGELDIG met veldnamen', rs.info.problemen.includes('MANIFEST_ONGELDIG') && rs.info.manifestFouten.some((f) => f.veld === 'deelnemers[0].platform'), JSON.stringify(rs.info));
  check('UI-010: oud pakket zonder manifest (vóór de grens) → geen probleem', rl.info.problemen.length === 0 && rl.info.manifest === null);

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
