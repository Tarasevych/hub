import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  splitsGeheim,
  herstelGeheim,
  roteerDelen,
  bouwVerdeelManifest,
  oefenHerstelTest,
  controleerSpreiding,
} from '../../shared/verdeelde-opslag';
import { sqlRechtenVlaggen } from '../../backend/uitrol-risico';

const ROOT = process.cwd();
const lees = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

export async function main(): Promise<number> {
let ok = 0;
let fout = 0;

async function test(naam: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok++;
    console.log(`OK   ${naam}`);
  } catch (e: any) {
    fout++;
    console.error(`FOUT ${naam}: ${e?.message || e}`);
  }
}

await test('1) Міграція 0306 існує, зворотно сумісна, без колонок аудиту і без SQL-прапорців ризику', () => {
  const sql = lees('migrations/0306_verdeelde_opslag_knopen.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+app\.verdeelde_opslag_knopen/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+app\.verdeelde_opslag_rotaties/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /_door\b/i);
  const vlaggen = sqlRechtenVlaggen('0306_verdeelde_opslag_knopen.sql', sql);
  assert.deepEqual(vlaggen, []);
});

await test('2) Проактивна ротація часток Шаміра k-з-n і навчальне відновлення працюють без втрати секрету', async () => {
  const geheim = new TextEncoder().encode('MijnRuimte-UPD013-TestGeheim-32B');
  const delen1 = splitsGeheim(geheim, 3, 5);
  assert.equal(delen1.length, 5);
  const hersteld1 = herstelGeheim([delen1[0], delen1[2], delen1[4]]);
  assert.deepEqual(hersteld1, geheim);

  const delen2 = roteerDelen([delen1[1], delen1[2], delen1[3]], 5, 3);
  assert.equal(delen2.length, 5);
  const hersteld2 = herstelGeheim([delen2[0], delen2[3], delen2[4]]);
  assert.deepEqual(hersteld2, geheim);

  const oefen = oefenHerstelTest(5, 3);
  assert.equal(oefen.geslaagd, true);
  assert.equal(oefen.polynoomVernieuwd, true);
  assert.equal(oefen.teWeinigDelenGeweigerd, true);

  const spreiding = controleerSpreiding(
    [
      { id: 'n1', label: 'NL', landCode: 'NL', platform: 'eigen-vm', aanbieder: 'eigen-server', actief: true },
      { id: 'n2', label: 'DE', landCode: 'DE', platform: 's3', aanbieder: 's3-de', actief: true },
      { id: 'n3', label: 'CH', landCode: 'CH', platform: 'webdav', aanbieder: 'webdav-ch', actief: true },
      { id: 'n4', label: 'UA', landCode: 'UA', platform: 'lokaal', aanbieder: 'r-schijf', actief: true },
      { id: 'n5', label: 'FI', landCode: 'FI', platform: 'cloud', aanbieder: 'nextcloud-fi', actief: true },
    ],
    3,
    5,
  );
  assert.equal(spreiding.ok, true);

  const manifest = bouwVerdeelManifest({
    drempel: 3,
    aantal: 5,
    knopen: [
      { id: 'n1', naam: 'Вузол Нідерланди', landCode: 'NL', platform: 'eigen-server', soort: 'eigen-server', status: 'gezond', bestemmingHint: 'R:\\mijn-ruimte-reservekopie', actief: true },
      { id: 'n2', naam: 'Вузол Німеччина', landCode: 'DE', platform: 's3-de', soort: 's3', status: 'gezond', bestemmingHint: 's3://bucket/part-2', actief: true },
      { id: 'n3', naam: 'Вузол Швейцарія', landCode: 'CH', platform: 'webdav-ch', soort: 'webdav', status: 'gezond', bestemmingHint: 'https://cloud.example/dav', actief: true },
    ],
  });
  assert.equal(manifest.schema, 2);
  assert.equal(manifest.beleid.drempelK, 3);
  assert.equal(manifest.beleid.geheimenInManifest, false);
  assert.ok(Array.isArray(manifest.knopen) && manifest.knopen.length === 3);
});

await test('3) Серверні маршрути та панель розподіленого зберігання підключені у BeheerUitrolWeergave', () => {
  const routes = lees('backend/verdeelde-opslag-beheer.ts');
  assert.match(routes, /verdeeldeOpslagOverzicht/);
  assert.match(routes, /verdeeldeOpslagOefenHerstel/);
  assert.match(routes, /verdeeldeOpslagManifest/);
  const goedkeuring = lees('backend/uitrol-goedkeuring.ts');
  assert.match(goedkeuring, /\/api\/owner\/verdeelde-opslag\/overzicht/);
  assert.match(goedkeuring, /\/api\/owner\/verdeelde-opslag\/oefen-herstel/);
  assert.match(goedkeuring, /\/api\/owner\/verdeelde-opslag\/manifest/);
  const paneel = lees('src/uitrol/VerdeeldeOpslagPaneel.tsx');
  assert.doesNotMatch(paneel, /#[0-9a-fA-F]{3,6}\b/);
  const weergave = lees('src/BeheerUitrolWeergave.tsx');
  assert.match(weergave, /VerdeeldeOpslagPaneel/);
});

await test('4) Спільні будівельні блоки аудиту клієнтського досвіду (пункти 2–9) існують і підключені', () => {
  for (const pad of [
    'src/platform/SkeletBlok.tsx',
    'src/platform/LegeStaatKaart.tsx',
    'src/platform/KopieerKnop.tsx',
    'src/platform/opslaan-bevestiging.ts',
    'src/platform/ux-bouwstenen.css',
  ]) {
    assert.ok(existsSync(path.join(ROOT, pad)), `Відсутній файл: ${pad}`);
  }
  const omlijsting = lees('src/CanoniekOmlijsting.tsx');
  assert.match(omlijsting, /canonical-mobile-crumb/);
  const zoek = lees('src/zoek/ZoekGlobaal.tsx');
  assert.match(zoek, /Ctrl\+K/);
  const motoren = lees('src/agenten/DienstMotoren.tsx');
  assert.match(motoren, /useOpslaanBevestiging/);
  assert.match(motoren, /KopieerKnop/);
});

await test('5) Досьє MELDPANEEL-001 перенесено, а втрачені дії сповіщень повернено в обидві панелі', () => {
  for (const pad of [
    'docs/meldingen-paneel/ДОСЬЄ-ПАНЕЛІ-СПОВІЩЕНЬ.uk.md',
    'docs/meldingen-paneel/DOSSIER-MELDINGENPANEEL.nl.md',
    'orchestratie/taken/MELDPANEEL-001.json',
    'orchestratie/ontwikkelarchieven/MELDPANEEL-001.json',
  ]) {
    assert.ok(existsSync(path.join(ROOT, pad)), `Відсутній файл MELDPANEEL-001: ${pad}`);
  }
  const v2 = lees('src/meldingen/v2/MeldingenV2.tsx');
  assert.match(v2, /Позначити як непрочитане/);
  assert.match(v2, /Знову відкрити/);
  const kaart = lees('src/meldingen/ecosysteem/MeldingVeegKaart.tsx');
  assert.match(kaart, /Позначити як непрочитане/);
  assert.match(kaart, /Знову відкрити/);
});

await test('6) Ліниве розбиття моноліту GoogleMailWerkruimte зменшує початкову збірку пошти', () => {
  const mail = lees('src/GoogleMailWerkruimte.tsx');
  const lazyMatches = mail.match(/React\.lazy\s*\(|lazy\s*\(/g) || [];
  assert.ok(lazyMatches.length >= 10, `Очікувалось >= 10 лінивих підмодулів, знайдено ${lazyMatches.length}`);
  assert.ok(existsSync(path.join(ROOT, 'src/mail/MailWerkruimteExtra.ts')));
});

console.log(`\n${ok}/${ok + fout} geslaagd (upd-013-verdeelde-opslag-ux-meldpaneel)`);
return fout > 0 ? 1 : 0;
}
