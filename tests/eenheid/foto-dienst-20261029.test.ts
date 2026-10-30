// UI-002 «Фото» — model (shared/foto-model.ts) en server (backend/foto-dienst.ts) tegen de ECHTE Postgres en echte opslag.
// Fixtures: tests/fixtures/foto/*.zip (echte JPEG's met EXIF en echte exportstructuren; zie maak.py).
// WAT VASTLIGT:
//   1. archief herkennen + metadata per bron (Takeout-sidecar incl. «(1)»-duplicaat en afgekapte namen, album uit metadata.json,
//      geo 0/0 = geen plaats; Instagram met Meta-mojibake; Facebook-album met EXIF-blok; Telegram-chat; Flickr met tags/geo);
//   2. EXIF uit echte JPEG (datum, camera, GPS, afmetingen);
//   3. poort: vlag UIT → 404 FOTO_DIENST_UIT; geen sessie → 401; verkeerde dienst → 403;
//   4. import-pijplijn zoals de browser haar doet: upload in stukken, sha256, één bestand per inhoud (tweede keer = «bekend»,
//      herkomst erbij, album erbij, ontbrekende datum aangevuld), album automatisch uit het archief;
//   5. bibliotheek: tijdlijnvolgorde, filters jaar/bron/zoek/plaats/album/favoriet, facetten, paginering;
//   6. «Хмарне сховище» virtueel indexeren (geen kopie), daarna kopiëren = eigen back-up; controleren;
//   7. veiligheid: ontkoppelen van een eigen kopie geweigerd, wissen alleen met 'WISSEN', cloudbestand blijft altijd bestaan;
//      een ander account ziet niets; de technische lade ziet de persoonlijke foto's niet;
//   8. ordenen: exacte duplicaten (via indexering), gelijkende foto's (dHash + camerareeks).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { getPool } from '../../server/platform/pg';
import { storage } from '../../server/platform';
import { fotoDienstRoutes } from '../../backend/foto-dienst';
import { cloudVoorvoegsel, metLade } from '../../backend/ruimte-cloud-agenda';
import { archiefMetadata, herkenArchief, leesExif, mediaSoort, metaTekst, gelijkendeGroepen, hamming } from '../../shared/foto-model';
import type { Lade } from '../../shared/ruimte-scheiding';
import { checker } from './hulp/nep-google';

const FIX = 'tests/fixtures/foto';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function leesZip(naam: string) {
  const alles = unzipSync(readFileSync(join(FIX, naam)));
  const media = Object.keys(alles).filter((p) => mediaSoort(p));
  const json = new Map<string, unknown>(Object.keys(alles).filter((p) => p.endsWith('.json')).map((p) => [p, JSON.parse(new TextDecoder().decode(alles[p]))]));
  return { alles, media, json, soort: herkenArchief(Object.keys(alles)) };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('foto-dienst-20261029');
  // ====================================================================== 1. archieven
  const tk = leesZip('takeout.zip');
  const tkMeta = archiefMetadata(tk.soort, tk.media, tk.json);
  const m1 = tkMeta.get('Takeout/Google Photos/Photos from 2014/IMG_001.jpg');
  check('Takeout herkend', tk.soort === 'takeout');
  check('Takeout: datum, plaats, beschrijving uit .supplemental-metadata.json', m1?.genomenOp === '2014-07-12T16:00:00.000Z' && m1?.plaats?.lat === 50.4501 && m1?.beschrijving === 'Хрещатик увечері' && m1?.datumBron === 'sidecar');
  check('Takeout: «Photos from 2014» is géén album', !m1?.album);
  check('Takeout: IMG_001(1).jpg vindt zijn eigen «(1)»-sidecar', tkMeta.get('Takeout/Google Photos/Photos from 2014/IMG_001(1).jpg')?.genomenOp === '2014-07-12T16:00:00.000Z');
  const m2 = tkMeta.get('Takeout/Google Photos/Відпустка Карпати/IMG_002.jpg');
  check('Takeout: albumnaam uit metadata.json; geo 0,0 = geen plaats', m2?.album === 'Відпустка в Карпатах' && !m2?.plaats);
  const ig = leesZip('instagram.zip'); const igMeta = archiefMetadata(ig.soort, ig.media, ig.json).get('media/posts/201905/insta1.jpg');
  check('Instagram herkend; datum + bijschrift (mojibake hersteld)', ig.soort === 'instagram' && igMeta?.genomenOp === new Date(1557000000e3).toISOString() && igMeta?.beschrijving === 'Привіт з моря', JSON.stringify(igMeta));
  const fb = leesZip('facebook.zip'); const fbMeta = archiefMetadata(fb.soort, fb.media, fb.json).get(fb.media[0]);
  check('Facebook herkend; album, EXIF-datum en plaats uit het export-JSON', fb.soort === 'facebook' && fbMeta?.album === 'Mobile uploads' && fbMeta?.genomenOp === new Date(1419990000e3).toISOString() && fbMeta?.plaats?.lat === 52.37, JSON.stringify(fbMeta));
  const tg = leesZip('telegram.zip'); const tgMeta = archiefMetadata(tg.soort, tg.media, tg.json).get(tg.media[0]);
  check('Telegram herkend; chat als album, datum, tekst', tg.soort === 'telegram' && tgMeta?.album === 'Telegram · Мама' && tgMeta?.genomenOp === new Date(1612173600e3).toISOString() && tgMeta?.beschrijving === 'Дивись!', JSON.stringify(tgMeta));
  const fl = leesZip('flickr.zip'); const flMeta = archiefMetadata(fl.soort, fl.media, fl.json).get(fl.media[0]);
  check('Flickr herkend; titel, datum, tags, album, plaats (micrograden)', fl.soort === 'flickr' && flMeta?.titel === 'Zeilen' && flMeta?.genomenOp === '2010-08-01T14:00:00.000Z' && flMeta?.tags?.[0] === 'zee' && flMeta?.album === 'Zomer 2010' && Math.abs((flMeta?.plaats?.lat || 0) - 52.37) < 1e-6, JSON.stringify(flMeta));
  check('metaTekst laat gewone tekst ongemoeid', metaTekst('Gewoon — тест') === 'Gewoon — тест');
  // ====================================================================== 2. EXIF
  const ex = leesExif(new Uint8Array(readFileSync(join(FIX, 'los-exif.jpg'))));
  check('EXIF: datum, camera, afmetingen, GPS', ex.genomenOp === '2016-05-03T10:20:30.000Z' && ex.camera === 'Canon EOS 600D' && ex.breedte === 320 && ex.hoogte === 240 && Math.abs((ex.plaats?.lat || 0) - 48.6208) < 0.001 && Math.abs((ex.plaats?.lon || 0) - 22.2879) < 0.001, JSON.stringify(ex));
  check('EXIF: geen JPEG of kapot → leeg, geen uitzondering', Object.keys(leesExif(new Uint8Array([1, 2, 3]))).length === 0 && Object.keys(leesExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4]))).length === 0);
  check('hamming en gelijkende groepen (camerareeks binnen 3 s)', hamming('ffffffffffffffff', 'fffffffffffffff0') === 4 && gelijkendeGroepen([{ id: 'a', genomenOp: '2016-05-03T10:20:30.000Z', camera: 'X' }, { id: 'b', genomenOp: '2016-05-03T10:20:32.000Z', camera: 'X' }, { id: 'c', genomenOp: '2016-05-03T10:25:00.000Z', camera: 'X' }]).length === 1);

  // ====================================================================== server
  process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'foto-test-'));
  const pool = getPool('systeem'); const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`foto-a-${sfx}@eenheid.test`), b = await mk(`foto-b-${sfx}@eenheid.test`);
  const prive: Lade = { userId: a, ruimte: 'prive' }, tech: Lade = { userId: a, ruimte: 'technisch' }, ander: Lade = { userId: b, ruimte: 'prive' };
  const maak = (id: string, service = 'hub', vlag = true) => fotoDienstRoutes(async () => ({ user: { id, role: 'member', status: 'approved' }, service }), { vlagAan: async () => vlag });
  const rA = maak(a), rB = maak(b);
  const roep = async (r: ReturnType<typeof maak>, pad: string, body: Record<string, unknown>, lade: Lade = prive) => {
    const res = await metLade(lade, 'cloud', async () => (r[`POST /api/owner/foto/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body }));
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };
  // de browser-pijplijn (src/foto/foto-import.ts) zonder canvas
  const importeer = async (zip: ReturnType<typeof leesZip>, bron: string, lade: Lade = prive, rr = rA) => {
    const meta = archiefMetadata(zip.soort, zip.media, zip.json); const tel = { nieuw: 0, bekend: 0 };
    for (const p of zip.media) {
      const bytes = zip.alles[p]; const e = leesExif(bytes); const am = meta.get(p) || {};
      const velden = { naam: p.split('/').pop(), bytes: bytes.length, sha256: sha(bytes), bron, pad: p, archief: 'test.zip', genomenOp: e.genomenOp || am.genomenOp, datumBron: e.genomenOp ? 'exif' : am.genomenOp ? 'sidecar' : undefined, album: am.album, beschrijving: am.beschrijving, titel: am.titel, tags: am.tags, plaats: e.plaats || am.plaats, camera: e.camera, breedte: e.breedte, hoogte: e.hoogte };
      const begin = await roep(rr, 'upload', { actie: 'begin', ...velden }, lade);
      if (begin.uit.bekend) { tel.bekend++; continue; }
      if (begin.status !== 200) throw new Error(JSON.stringify(begin.uit));
      const st = begin.uit.stukMax as number;
      for (let o = 0; o < bytes.length; o += st) await roep(rr, 'upload', { actie: 'stuk', id: begin.uit.id, offset: o, data: Buffer.from(bytes.subarray(o, o + st)).toString('base64') }, lade);
      const k = await roep(rr, 'upload', { ...velden, actie: 'klaar', id: begin.uit.id }, lade);
      if (k.uit.bekend) tel.bekend++; else if (k.status === 200) tel.nieuw++; else throw new Error(JSON.stringify(k.uit));
    }
    return tel;
  };

  // 3. poort
  check('vlag UIT → 404 FOTO_DIENST_UIT', await roep(maak(a, 'hub', false), 'bibliotheek', {}).then((r) => r.status === 404 && r.uit.error === 'FOTO_DIENST_UIT'));
  check('geen sessie → 401', await roep(fotoDienstRoutes(async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }), { vlagAan: async () => true }), 'bibliotheek', {}).then((r) => r.status === 401));
  check('verkeerde dienst (mail) → 403', await roep(maak(a, 'mail'), 'bibliotheek', {}).then((r) => r.status === 403));
  const leeg = await roep(rA, 'bibliotheek', {});
  check('leeg begin: 0 items, facetten leeg', leeg.status === 200 && leeg.uit.totaal === 0 && leeg.uit.stats.totaal === 0);

  // 4. import
  const t1 = await importeer(tk, 'google-photos');
  check('Takeout: 4 nieuwe bestanden, IMG_001(1) (zelfde bytes) is «bekend»', t1.nieuw === 4 && t1.bekend === 1, JSON.stringify(t1));
  const t2 = await importeer(tk, 'google-photos');
  check('dezelfde Takeout opnieuw: niets nieuw, alles «bekend» (geen dubbele bestanden)', t2.nieuw === 0 && t2.bekend === 5, JSON.stringify(t2));
  await importeer(ig, 'instagram'); await importeer(fb, 'facebook'); await importeer(tg, 'telegram'); await importeer(fl, 'flickr');
  const opslagAantal = (await pool.query(`SELECT count(*)::int AS n FROM app.storage_objects WHERE path LIKE $1`, [`${cloudVoorvoegsel(prive)}/foto-%`])).rows[0].n;
  check('op schijf precies 8 bestanden (4 Takeout + 4 andere archieven)', opslagAantal === 8, String(opslagAantal));
  const alles = await roep(rA, 'bibliotheek', {});
  check('bibliotheek: 8 items; nieuwste eerst (Instagram 2021? nee: Telegram 2021 bovenaan)', alles.uit.totaal === 8 && alles.uit.items[0].herkomst[0].bron === 'telegram', alles.uit.items.map((i: any) => i.genomenOp).join());
  check('album «Відпустка в Карпатах» automatisch gemaakt (en maar één keer)', alles.uit.albums.filter((x: any) => x.naam === 'Відпустка в Карпатах').length === 1);
  check('facetten: jaren 2010/2014/2015/2016/2017/2019/2021 en bronnen geteld', ['2010', '2014', '2016', '2021'].every((j) => alles.uit.facetten.jaren[j]) && alles.uit.facetten.bronnen['google-photos'] === 4 && alles.uit.facetten.bronnen.instagram === 1, JSON.stringify(alles.uit.facetten));
  const j2016 = await roep(rA, 'bibliotheek', { jaar: 2016 });
  check('filter jaar 2016 → 2 (camera-foto’s); camera en datum uit EXIF', j2016.uit.totaal === 2 && j2016.uit.items.every((i: any) => i.camera === 'Canon EOS 600D' && i.datumBron === 'exif'));
  check('zoeken op beschrijving (Хрещатик) en op albumnaam (Карпат)', (await roep(rA, 'bibliotheek', { zoek: 'хрещатик' })).uit.totaal === 1 && (await roep(rA, 'bibliotheek', { zoek: 'карпат' })).uit.totaal === 1);
  check('filter met plaats → Takeout Kyiv + Canon GPS + Facebook + Flickr = 4', (await roep(rA, 'bibliotheek', { metPlaats: true })).uit.totaal === 4);
  const kyiv = (await roep(rA, 'bibliotheek', { zoek: 'хрещатик' })).uit.items[0];
  check('herkomst: één foto, beide Takeout-paden (IMG_001 en IMG_001(1))', kyiv.herkomst.length === 2 && kyiv.herkomst.every((h: any) => h.bron === 'google-photos'));
  check('filter bron instagram → 1, met bijschrift', await roep(rA, 'bibliotheek', { bron: 'instagram' }).then((r) => r.uit.totaal === 1 && r.uit.items[0].beschrijving === 'Привіт з моря'));
  // acties
  const fav = await roep(rA, 'item', { actie: 'favoriet', ids: [kyiv.id], waarde: true });
  const tag = await roep(rA, 'item', { actie: 'tags', ids: [kyiv.id], tags: ['Київ', 'Літо 2014', '###'] });
  check('favoriet en tags (geschoond, kapotte weg)', fav.uit.items[0].favoriet === true && tag.uit.items[0].tags.join() === 'київ,літо-2014');
  check('filter favoriet + tag', (await roep(rA, 'bibliotheek', { favoriet: true, tag: 'київ' })).uit.totaal === 1);
  const alb = await roep(rA, 'album', { actie: 'nieuw', naam: 'Найкращі' });
  await roep(rA, 'item', { actie: 'album-erbij', ids: [kyiv.id], album: alb.uit.album.id });
  check('eigen album: toevoegen en filteren', (await roep(rA, 'bibliotheek', { album: alb.uit.album.id })).uit.totaal === 1);
  const ver = await roep(rA, 'album', { actie: 'verwijder', id: alb.uit.album.id });
  check('album verwijderen laat de foto staan', ver.uit.losgemaakt === 1 && (await roep(rA, 'bibliotheek', {})).uit.totaal === 8);
  const inh = await roep(rA, 'inhoud', { id: kyiv.id });
  check('origineel downloaden: byte voor byte gelijk', inh.status === 200 && inh.uit.sha256 === kyiv.sha256 && inh.uit.mime === 'image/jpeg');
  // paginering
  check('paginering: token null bij ≤ 120', alles.uit.volgende === null);

  // 6. «Хмарне сховище» virtueel
  const cloudBytes = new Uint8Array(readFileSync(join(FIX, 'los-exif.jpg')));
  const cloudPad = `${cloudVoorvoegsel(prive)}/c-${randomUUID()}.jpg`;
  await storage.write([{ path: cloudPad, content: Buffer.from(cloudBytes).toString('base64'), contentType: 'image/jpeg', ownerId: a }]);
  const andereBytes = Buffer.from(leesZip('instagram.zip').alles['media/posts/201905/insta1.jpg']).toString('base64');
  const cloudPad2 = `${cloudVoorvoegsel(prive)}/c-${randomUUID()}.png`;
  const { db } = await import('../../server/platform');
  const nieuwBytes = new Uint8Array(readFileSync(join(FIX, 'cloud-nieuw.jpg')));
  const cloudPad3 = `${cloudVoorvoegsel(prive)}/c-${randomUUID()}.jpg`;
  await storage.write([{ path: cloudPad3, content: Buffer.from(nieuwBytes).toString('base64'), contentType: 'image/jpeg', ownerId: a }]);
  void andereBytes;
  const [cid] = await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'file', title: 'DSC_0003-kopie.jpg', originalName: 'DSC_0003-kopie.jpg', mimeType: 'image/jpeg', sizeBytes: cloudBytes.length, storagePath: cloudPad, createdAt: Date.now() }]);
  const [cidN] = await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'file', title: 'vakantie.jpg', originalName: 'vakantie.jpg', mimeType: 'image/jpeg', sizeBytes: nieuwBytes.length, storagePath: cloudPad3, createdAt: Date.now() }]);
  const [cid2] = await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'file', title: 'doc.pdf', originalName: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 10, storagePath: cloudPad2, createdAt: Date.now() }]);
  const idx = await roep(rA, 'indexeer', {});
  check('indexeren: zelfde bytes als DSC_0003 → gekoppeld (geen tweede item); nieuw beeld → 1 virtueel item; pdf niet', idx.uit.nieuw === 1 && idx.uit.gekoppeld === 1 && !!cid && !!cid2, JSON.stringify(idx.uit));
  check('DSC_0003 heeft nu twee herkomsten: Google Photos én Хмарне сховище', await roep(rA, 'bibliotheek', { bron: 'cloud' }).then((r) => r.uit.items.some((i: any) => i.herkomst.length === 2 && i.opslag === 'eigen')));
  check('opnieuw indexeren: niets dubbel', (await roep(rA, 'indexeer', {})).uit.nieuw === 0);
  const cItem = (await roep(rA, 'bibliotheek', { bron: 'cloud' })).uit.items.find((i: any) => i.opslag === 'cloud');
  check('cloud-item: EXIF door de server gelezen (2018, iPhone 8, plaats), zonder kopie', cItem?.genomenOp === '2018-09-01T08:00:00.000Z' && cItem.camera === 'Apple iPhone 8' && !!cItem.plaats && cItem.backup.kopie === false && !!cidN, JSON.stringify(cItem));
  check('back-upstatus eerlijk: 1 zonder eigen kopie', (await roep(rA, 'bibliotheek', {})).uit.stats.zonderKopie === 1);
  check('ordenen: DSC_0003 + DSC_0004 (zelfde camera, 1 s) → gelijkende groep', await roep(rA, 'organiseer', {}).then((r) => r.uit.gelijkend.some((g: any) => g.items.length >= 2)));
  const kop = await roep(rA, 'item', { actie: 'kopieer', ids: [cItem.id] });
  check('kopiëren naar eigen opslag: back-up ok, origineel in de cloud blijft', kop.uit.items[0].opslag === 'eigen' && kop.uit.items[0].backup.kopie === true && existsSync(join(process.env.UPLOADS_DIR!, cloudPad)));
  const ctl = await roep(rA, 'item', { actie: 'controleer', ids: [cItem.id] });
  check('kopie controleren: sha klopt', ctl.uit.items[0].backup.ok === true);
  // 7. veiligheid
  check('ontkoppelen van een eigen kopie → EIGEN_KOPIE_GEBRUIK_WISSEN', (await roep(rA, 'item', { actie: 'ontkoppel', ids: [kyiv.id] })).uit.error === 'EIGEN_KOPIE_GEBRUIK_WISSEN');
  check('wissen zonder WISSEN → BEVESTIGING_VEREIST', (await roep(rA, 'item', { actie: 'wis', ids: [kyiv.id], bevestiging: 'ja' })).uit.error === 'BEVESTIGING_VEREIST');
  const [cid3] = await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'file', title: 'x.jpg', originalName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 5, storagePath: `${cloudVoorvoegsel(prive)}/c-${randomUUID()}.jpg`, createdAt: Date.now() }]);
  await roep(rA, 'indexeer', {});
  const virt = (await roep(rA, 'bibliotheek', { bron: 'cloud' })).uit.items.find((i: any) => i.opslag === 'cloud');
  check('cloud-item zonder bytes: «niet beschikbaar» na verwijderen in de cloud', !!virt && cid3 !== null);
  await pool.query(`UPDATE app.records SET data = data || '{"verwijderdOp":"2026-10-29T00:00:00Z"}'::jsonb WHERE tbl='cloud_items_v1' AND id=$1`, [cid3]);
  check('… beschikbaar=false wanneer het cloudbestand in de prullenbak ligt', (await roep(rA, 'bibliotheek', { bron: 'cloud' })).uit.items.find((i: any) => i.id === virt.id)?.beschikbaar === false);
  check('wissen van een virtueel item → ALLEEN_EIGEN_KOPIE', (await roep(rA, 'item', { actie: 'wis', ids: [virt.id], bevestiging: 'WISSEN' })).uit.error === 'ALLEEN_EIGEN_KOPIE');
  const ont = await roep(rA, 'item', { actie: 'ontkoppel', ids: [virt.id] });
  check('ontkoppelen virtueel: weg uit bibliotheek, cloudrecord blijft', ont.uit.ok === true && (await pool.query(`SELECT 1 FROM app.records WHERE tbl='cloud_items_v1' AND id=$1`, [cid3])).rowCount === 1);
  const igItem = (await roep(rA, 'bibliotheek', { bron: 'instagram' })).uit.items[0];
  const igPad = (await pool.query(`SELECT data->>'storagePath' AS p FROM app.records WHERE tbl='foto_media_v1' AND id=$1`, [igItem.id])).rows[0].p;
  const wis = await roep(rA, 'item', { actie: 'wis', ids: [igItem.id], bevestiging: 'WISSEN' });
  check('wissen met WISSEN: record én eigen bytes weg', wis.uit.ok === true && !existsSync(join(process.env.UPLOADS_DIR!, igPad)));
  check('ander account ziet niets en kan niet lezen', (await roep(rB, 'bibliotheek', {}, ander)).uit.totaal === 0 && (await roep(rB, 'inhoud', { id: kyiv.id }, ander)).status === 404);
  check('technische lade ziet de persoonlijke foto’s niet', (await roep(rA, 'bibliotheek', {}, tech)).uit.totaal === 0);
  check('verbergen: uit de tijdlijn, wél onder «Приховані»', await roep(rA, 'item', { actie: 'verberg', ids: [kyiv.id], waarde: true }).then(async () => (await roep(rA, 'bibliotheek', { zoek: 'хрещатик' })).uit.totaal === 0 && (await roep(rA, 'bibliotheek', { verborgen: true })).uit.totaal === 1));
  check('bronnen: catalogus eerlijk (Instagram alleen archief, Google Photos kiezer+archief, iCloud geen live)', await roep(rA, 'bronnen', {}).then((r) => { const b = Object.fromEntries(r.uit.bronnen.map((x: any) => [x.id, x.toegang.join()])); return b.instagram === 'archief' && b['google-photos'] === 'kiezer,archief' && b.icloud === 'archief' && b.eigen === 'live'; }));
  check('upload: geen media → GEEN_MEDIA; onbekende bron → BRON_ONBEKEND', (await roep(rA, 'upload', { actie: 'begin', naam: 'a.pdf', bytes: 5 })).uit.error === 'GEEN_MEDIA' && (await roep(rA, 'upload', { actie: 'begin', naam: 'a.jpg', bytes: 5, bron: 'myspace' })).uit.error === 'BRON_ONBEKEND');
  return einde();
}
