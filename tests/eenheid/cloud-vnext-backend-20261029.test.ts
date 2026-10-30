// CLOUD vNEXT — EIGEN BESTANDEN (29.10.2026, vlag cloud-vnext, backend/cloud-vnext-bestanden.ts, contract
// shared/cloud-vnext-model.ts). Tegen de ECHTE Postgres en de echte opslag (UPLOADS_DIR → tijdelijke map).
//
// WAT DEZE TEST VASTHOUDT:
//   1. DE POORT. Geen sessie → 401; verkeerde dienst → OWNER_CLOUD_SESSION_REQUIRED; niet goedgekeurd → ACCOUNT_NOT_APPROVED.
//   2. MAPPEN. Aanmaken/hernoemen/verplaatsen; diepte 12 mag, 13 niet (MAP_DIEPTE); een map in haar eigen tak → MAP_IN_ZICHZELF;
//      kapotte naam → NAAM_ONGELDIG; onbekende ouder → MAP_ONBEKEND; verwijderen stuurt de bestanden naar de prullenbak.
//   3. UPLOAD IN STUKKEN. 3 stukken → klaar → download byte voor byte gelijk (ook text/*: de base64-redenering van
//      server/platform/opslag.ts); verkeerde offset → STUK_BUITEN_ORDE; foute sha → SHA_MISMATCH én de sessie is weg;
//      te groot → TE_GROOT; text/html en alles met «javascript» → MIME_NIET_TOEGESTAAN; onbekende sessie → UPLOAD_ONBEKEND.
//   4. DE LIJST VOORBIJ DE OUDE AFKAP. 210 records in één map: totaal = 210 (de oude code zag er 100), pagina 200 + token.
//      Filters soort/tag/favoriet/zoek, sorteren op grootte, broodkruimelpad.
//   5. PRULLENBAK. Verwijderen is zacht; herstel; definitief haalt óók de bytes van de schijf; ouder dan 30 dagen wordt
//      lui opgeruimd; herstel/definitief op een actief bestand → NIET_IN_PRULLENBAK.
//   6. VERSIES. Vervangen (zelfde naam, zelfde map) bewaart de vorige inhoud; download van een versie; herstel van een versie.
//   7. LADEN EN ANDERMANS. De technische lade ziet de persoonlijke bestanden niet (en andersom); een ander account ziet niets.
//   8. OUDE RECORDS. Een record van de oude pagina (zonder vNext-velden) staat gewoon in de wortel: geen datamigratie nodig.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { db, storage } from '../../server/platform';
import { cloudVnextBestandenRoutes } from '../../backend/cloud-vnext-bestanden';
import { cloudVoorvoegsel, metLade } from '../../backend/ruimte-cloud-agenda';
import { CLOUD_VNEXT_LIMIETEN as LIMIET } from '../../shared/cloud-vnext-model';
import type { Lade } from '../../shared/ruimte-scheiding';
import { checker } from './hulp/nep-google';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
type Routes = ReturnType<typeof cloudVnextBestandenRoutes>;
type Antw = { status: number; uit: Record<string, any> };

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-vnext-backend-20261029');
  const uploads = mkdtempSync(join(tmpdir(), 'cloud-vnext-test-'));
  process.env.UPLOADS_DIR = uploads; // de opslagwortel is lui (per aanroep), dus dit geldt voor de hele test
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`cv-a-${sfx}@eenheid.test`);
  const b = await mk(`cv-b-${sfx}@eenheid.test`);
  const prive: Lade = { userId: a, ruimte: 'prive' };
  const tech: Lade = { userId: a, ruimte: 'technisch' };
  const ander: Lade = { userId: b, ruimte: 'prive' };
  const maak = (id: string, service = 'cloud', status = 'approved') => cloudVnextBestandenRoutes(async () => ({ user: { id, role: 'member', status }, service }));
  const rA = maak(a);
  const rB = maak(b);
  const roep = async (routes: Routes, pad: string, body: Record<string, unknown>, lade: Lade = prive): Promise<Antw> => {
    const res = await metLade(lade, 'cloud', async () => (routes[`POST /api/owner/cloud/vnext/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} }));
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };
  // Sinds de hervattbare uploads liggen stukken op het stukMax-raster (offset = n × stukMax, elk stuk exact zijn
  // rasterlengte): de helper stuurt ze zó, en `volgorde` kan ze bewust door elkaar sturen (parallel/hervatten).
  const upload = async (naam: string, mime: string, inhoud: Buffer, mapId: string | null, _stukken = 1, lade: Lade = prive, volgorde?: number[]): Promise<Antw> => {
    const begin = await roep(rA, 'upload', { actie: 'begin', naam, mime, bytes: inhoud.length, mapId }, lade);
    if (begin.status !== 200) return begin;
    const n = Math.max(1, Math.ceil(inhoud.length / LIMIET.stukMaxBytes));
    const indexen = volgorde ?? [...Array(n).keys()];
    for (const i of indexen) {
      const o = i * LIMIET.stukMaxBytes;
      const st = await roep(rA, 'upload', { actie: 'stuk', id: begin.uit.id, offset: o, data: inhoud.subarray(o, o + LIMIET.stukMaxBytes).toString('base64') }, lade);
      if (st.status !== 200) return st;
    }
    return roep(rA, 'upload', { actie: 'klaar', id: begin.uit.id, sha256: sha(inhoud) }, lade);
  };
  const opSchijf = async (id: string) => { const r = (await pool.query(`SELECT data->>'storagePath' AS p FROM app.records WHERE tbl='cloud_items_v1' AND id=$1`, [id])).rows[0]; return r?.p ? existsSync(join(uploads, r.p)) : null; };

  try {
    // ================================================================ 1. de poort
    const geen = cloudVnextBestandenRoutes(async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }));
    check('zonder sessie: 401 met de code van de sessiecontrole', (await roep(geen, 'overzicht', {})).status === 401);
    check('verkeerde dienst (mail) → OWNER_CLOUD_SESSION_REQUIRED (403)', await roep(maak(a, 'mail'), 'overzicht', {}).then((r) => r.status === 403 && r.uit.error === 'OWNER_CLOUD_SESSION_REQUIRED'));
    check('niet goedgekeurd account → ACCOUNT_NOT_APPROVED (403)', await roep(maak(a, 'cloud', 'pending'), 'overzicht', {}).then((r) => r.status === 403 && r.uit.error === 'ACCOUNT_NOT_APPROVED'));
    const leeg = await roep(rA, 'overzicht', {});
    check('een leeg begin: 0 bestanden, 0 bytes, lege wortel, lege prullenbak', leeg.status === 200 && leeg.uit.stats.aantal === 0 && leeg.uit.stats.bytes === 0 && leeg.uit.mappen.length === 0 && leeg.uit.prullenbak === 0);

    // ================================================================ 2. mappen
    const d1 = (await roep(rA, 'map', { actie: 'nieuw', naam: ' Документи ', ouderId: null })).uit.map;
    const d2 = (await roep(rA, 'map', { actie: 'nieuw', naam: 'Рахунки', ouderId: d1.id })).uit.map;
    check('aanmaken: naam geschoond, ouder bewaard', d1.naam === 'Документи' && d2.ouderId === d1.id);
    check('kapotte naam → NAAM_ONGELDIG; onbekende ouder → MAP_ONBEKEND (404)', (await roep(rA, 'map', { actie: 'nieuw', naam: '..' })).uit.error === 'NAAM_ONGELDIG'
      && await roep(rA, 'map', { actie: 'nieuw', naam: 'x', ouderId: randomUUID() }).then((r) => r.status === 404 && r.uit.error === 'MAP_ONBEKEND'));
    let ouder: string | null = null;
    for (let i = 1; i <= LIMIET.mapDiepteMax; i++) ouder = (await roep(rA, 'map', { actie: 'nieuw', naam: `Рівень ${i}`, ouderId: ouder })).uit.map.id;
    check(`diepte ${LIMIET.mapDiepteMax} mag; één dieper → MAP_DIEPTE`, typeof ouder === 'string' && (await roep(rA, 'map', { actie: 'nieuw', naam: 'te diep', ouderId: ouder })).uit.error === 'MAP_DIEPTE');
    check('een map in haar eigen tak verplaatsen → MAP_IN_ZICHZELF', (await roep(rA, 'map', { actie: 'verplaats', id: d1.id, ouderId: d2.id })).uit.error === 'MAP_IN_ZICHZELF');
    check('hernoemen werkt en geeft de map terug', (await roep(rA, 'map', { actie: 'hernoem', id: d2.id, naam: 'Рахунки 2026' })).uit.map.naam === 'Рахунки 2026');
    check('een te diepe tak verplaatsen → MAP_DIEPTE (wortel-tak van 12 past niet onder een andere map)', (await roep(rA, 'map', { actie: 'verplaats', id: (await roep(rA, 'bestanden', {})).uit.mappen.find((m: any) => m.naam === 'Рівень 1').id, ouderId: d1.id })).uit.error === 'MAP_DIEPTE');

    // ================================================================ 3. upload in stukken
    const inhoud1 = randomBytes(300_000);
    const up1 = await upload('звіт.pdf', 'application/pdf', inhoud1, d2.id, 3);
    check('upload (één rasterstuk): bestand met naam, map, soort pdf, juiste bytes en sha', up1.status === 200 && up1.uit.bestand.naam === 'звіт.pdf' && up1.uit.bestand.mapId === d2.id && up1.uit.bestand.soort === 'pdf' && up1.uit.bestand.bytes === 300_000 && up1.uit.bestand.sha256 === sha(inhoud1) && up1.uit.bestand.versies === 0);
    const dl1 = await roep(rA, 'download', { id: up1.uit.bestand.id });
    check('download is byte voor byte gelijk (sha, bytes, inhoud)', dl1.status === 200 && dl1.uit.sha256 === sha(inhoud1) && Buffer.from(dl1.uit.data, 'base64').equals(inhoud1) && dl1.uit.mime === 'application/pdf');
    const tekst = Buffer.from('привіт світ — текстовий файл', 'utf8');
    const upT = await upload('nota.txt', 'text/plain', tekst, null);
    const dlT = await roep(rA, 'download', { id: upT.uit.bestand.id });
    check('ook een text/*-bestand komt byte voor byte terug (de base64-afspraak van de opslaglaag)', Buffer.from(dlT.uit.data, 'base64').toString('utf8') === tekst.toString('utf8') && dlT.uit.bytes === tekst.length);
    const b2 = await roep(rA, 'upload', { actie: 'begin', naam: 'x.bin', mime: 'application/octet-stream', bytes: 10 });
    check('een stuk op de verkeerde plek → STUK_BUITEN_ORDE', (await roep(rA, 'upload', { actie: 'stuk', id: b2.uit.id, offset: 4, data: Buffer.from('abcd').toString('base64') })).uit.error === 'STUK_BUITEN_ORDE');
    check('klaar terwijl er bytes ontbreken → STUK_BUITEN_ORDE', (await roep(rA, 'upload', { actie: 'klaar', id: b2.uit.id, sha256: '0'.repeat(64) })).uit.error === 'STUK_BUITEN_ORDE');
    await roep(rA, 'upload', { actie: 'stuk', id: b2.uit.id, offset: 0, data: Buffer.alloc(10).toString('base64') });
    check('een foute sha → SHA_MISMATCH en de sessie is daarna weg (UPLOAD_ONBEKEND)', (await roep(rA, 'upload', { actie: 'klaar', id: b2.uit.id, sha256: 'f'.repeat(64) })).uit.error === 'SHA_MISMATCH'
      && await roep(rA, 'upload', { actie: 'klaar', id: b2.uit.id, sha256: sha(Buffer.alloc(10)) }).then((r) => r.status === 404 && r.uit.error === 'UPLOAD_ONBEKEND'));
    check('te groot bij begin → TE_GROOT; 0 bytes → TE_GROOT', (await roep(rA, 'upload', { actie: 'begin', naam: 'g.bin', mime: 'application/zip', bytes: LIMIET.uploadMaxBytes + 1 })).uit.error === 'TE_GROOT'
      && (await roep(rA, 'upload', { actie: 'begin', naam: 'leeg.bin', mime: 'application/zip', bytes: 0 })).uit.error === 'TE_GROOT');
    check('text/html (ook met parameters) en «javascript» → MIME_NIET_TOEGESTAAN; afbreken ruimt op', (await roep(rA, 'upload', { actie: 'begin', naam: 'p.html', mime: 'Text/HTML; charset=utf-8', bytes: 5 })).uit.error === 'MIME_NIET_TOEGESTAAN'
      && (await roep(rA, 'upload', { actie: 'begin', naam: 's.js', mime: 'application/javascript', bytes: 5 })).uit.error === 'MIME_NIET_TOEGESTAAN'
      && await roep(rA, 'upload', { actie: 'begin', naam: 'w.bin', mime: 'application/octet-stream', bytes: 5 }).then(async (w) => (await roep(rA, 'upload', { actie: 'afbreken', id: w.uit.id })).uit.ok === true));
    check('een onbekende uploadsessie → UPLOAD_ONBEKEND (404)', await roep(rA, 'upload', { actie: 'stuk', id: randomUUID(), offset: 0, data: 'AAAA' }).then((r) => r.status === 404 && r.uit.error === 'UPLOAD_ONBEKEND'));

    // ================================================================ 4. de lijst voorbij de oude 100-afkap
    const lm = (await roep(rA, 'map', { actie: 'nieuw', naam: 'Великий список' })).uit.map;
    const basis = Date.now() - 500_000;
    const partij = Array.from({ length: 210 }, (_, i) => ({ ownerUserId: a, ruimte: 'prive', workspaceId: '', kind: 'file', title: `lijst-${i}`, originalName: `lijst-${i}.pdf`, mimeType: 'application/pdf', sizeBytes: i + 1, storagePath: '', tags: i % 2 ? ['звіт-210'] : [], favoriet: i < 5, mapId: lm.id, createdAt: basis + i, updatedAt: basis + i, openedAt: 0 }));
    const partijIds = await db.add('cloud_items_v1', partij);
    check('(voorbereiding) 210 records in één keer toegevoegd', partijIds.length === 210 && partijIds.every(Boolean));
    const p1 = await roep(rA, 'bestanden', { mapId: lm.id });
    check('totaal = 210 — de oude 100-records-afkap is écht voorbij — en de pagina is 200 met een token', p1.uit.totaal === 210 && p1.uit.bestanden.length === LIMIET.lijstPagina && typeof p1.uit.volgende === 'string');
    const p2 = await roep(rA, 'bestanden', { mapId: lm.id, token: p1.uit.volgende });
    check('de tweede pagina geeft de overige 10 en geen token meer', p2.uit.bestanden.length === 10 && p2.uit.volgende === null && p2.uit.totaal === 210);
    check('het broodkruimelpad noemt de map; de wortel toont haar als onderliggende map met de telling', p1.uit.pad.length === 1 && p1.uit.pad[0].id === lm.id && (await roep(rA, 'bestanden', {})).uit.mappen.find((m: any) => m.id === lm.id)?.aantal === 210);
    const f1 = await roep(rA, 'bestanden', { mapId: lm.id, tag: 'Звіт-210' });
    const f2 = await roep(rA, 'bestanden', { mapId: lm.id, favoriet: true });
    const f3 = await roep(rA, 'bestanden', { mapId: lm.id, zoek: 'lijst-209' });
    const f4 = await roep(rA, 'bestanden', { soort: 'pdf', mapId: lm.id });
    check('filters: tag (hoofdletterongevoelig) 105, favoriet 5, zoeken 1, soort pdf 210', f1.uit.totaal === 105 && f2.uit.totaal === 5 && f3.uit.totaal === 1 && f3.uit.bestanden[0].naam === 'lijst-209' && f4.uit.totaal === 210);
    const srt = await roep(rA, 'bestanden', { mapId: lm.id, sorteer: 'grootte', oplopend: true });
    check('sorteren op grootte, oplopend: het kleinste bestand (1 byte) eerst', srt.uit.bestanden[0].bytes === 1);
    check('een kapot etiket in het filter → TAG_ONGELDIG; een onbekende map → MAP_ONBEKEND', (await roep(rA, 'bestanden', { tag: '###' })).uit.error === 'TAG_ONGELDIG' && (await roep(rA, 'bestanden', { mapId: randomUUID() })).uit.error === 'MAP_ONBEKEND');

    // ================================================================ bestand-acties
    const nota = upT.uit.bestand.id as string;
    check('hernoemen: lege naam → NAAM_ONGELDIG; een goede naam komt terug', (await roep(rA, 'bestand', { actie: 'hernoem', id: nota, naam: '  ' })).uit.error === 'NAAM_ONGELDIG'
      && (await roep(rA, 'bestand', { actie: 'hernoem', id: nota, naam: 'Нотатка.txt' })).uit.bestand.naam === 'Нотатка.txt');
    check('etiketten: geschoond en bewaard; een kapot etiket → TAG_ONGELDIG; te veel → LIMIET_BEREIKT', (await roep(rA, 'bestand', { actie: 'tags', id: nota, tags: ['Проєкт X', 'дім'] })).uit.bestand.tags.join() === 'проєкт-x,дім'
      && (await roep(rA, 'bestand', { actie: 'tags', id: nota, tags: ['###'] })).uit.error === 'TAG_ONGELDIG'
      && (await roep(rA, 'bestand', { actie: 'tags', id: nota, tags: Array.from({ length: LIMIET.tagsMax + 1 }, (_, i) => `t${i}`) })).uit.error === 'LIMIET_BEREIKT');
    check('favoriet aan (ids-vorm) en zichtbaar in het overzicht', (await roep(rA, 'bestand', { actie: 'favoriet', ids: [nota], favoriet: true })).uit.aantal === 1
      && (await roep(rA, 'overzicht', {})).uit.favorieten.some((f: any) => f.id === nota));
    check('verplaatsen naar een map; de wortel toont het bestand daarna niet meer', (await roep(rA, 'bestand', { actie: 'verplaats', ids: [nota], mapId: d1.id })).uit.aantal === 1
      && (await roep(rA, 'bestanden', { mapId: d1.id })).uit.bestanden.some((f: any) => f.id === nota)
      && !(await roep(rA, 'bestanden', {})).uit.bestanden.some((f: any) => f.id === nota));
    check('het overzicht telt eerlijk: aantal, bytes en perSoort (pdf 211 — 210 uit de lijst + het rapport)', await roep(rA, 'overzicht', {}).then((o) => o.uit.stats.aantal === 212 && o.uit.stats.perSoort.pdf?.aantal === 211 && o.uit.stats.bytes > 300_000));

    // ================================================================ 5. prullenbak
    check('verwijderen is zacht: aantal 1, weg uit de map, zichtbaar in de prullenbak met verwijderdOp', (await roep(rA, 'bestand', { actie: 'verwijder', ids: [nota] })).uit.aantal === 1
      && !(await roep(rA, 'bestanden', { mapId: d1.id })).uit.bestanden.some((f: any) => f.id === nota)
      && await roep(rA, 'bestanden', { prullenbak: true }).then((r) => r.uit.bestanden.some((f: any) => f.id === nota && f.verwijderdOp)));
    check('nóg eens verwijderen is onschadelijk (aantal 0); het overzicht telt de prullenbak', (await roep(rA, 'bestand', { actie: 'verwijder', ids: [nota] })).uit.aantal === 0 && (await roep(rA, 'overzicht', {})).uit.prullenbak === 1);
    check('herstel zet het terug in zijn map; herstel van een actief bestand → NIET_IN_PRULLENBAK', (await roep(rA, 'bestand', { actie: 'herstel', ids: [nota] })).uit.aantal === 1
      && (await roep(rA, 'bestanden', { mapId: d1.id })).uit.bestanden.some((f: any) => f.id === nota)
      && (await roep(rA, 'bestand', { actie: 'herstel', ids: [nota] })).uit.error === 'NIET_IN_PRULLENBAK'
      && (await roep(rA, 'bestand', { actie: 'definitief', ids: [nota] })).uit.error === 'NIET_IN_PRULLENBAK');
    await roep(rA, 'bestand', { actie: 'verwijder', ids: [nota] });
    const wasOpSchijf = await opSchijf(nota);
    check('definitief verwijderen haalt record én bytes weg', wasOpSchijf === true && (await roep(rA, 'bestand', { actie: 'definitief', ids: [nota] })).uit.aantal === 1
      && (await opSchijf(nota)) === null && (await roep(rA, 'download', { id: nota })).status === 404);
    // lui opruimen: een record dat 31 dagen geleden is weggegooid, mét echte bytes op schijf
    const oudPad = `${cloudVoorvoegsel(prive)}/${Date.now()}-oud-${randomBytes(4).toString('hex')}.bin`;
    await storage.write([{ path: oudPad, content: randomBytes(64).toString('base64'), contentType: 'application/octet-stream', ownerId: a }]);
    const [oudId] = await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'file', title: 'oud-weggegooid', originalName: 'oud.bin', mimeType: 'application/octet-stream', sizeBytes: 64, storagePath: oudPad, tags: [], createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0, verwijderdOp: new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString() }]);
    await roep(rA, 'bestanden', { prullenbak: true });
    check('ouder dan 30 dagen in de prullenbak → bij de eerstvolgende blik zijn record en bytes weg', oudId !== null && (await db.get('cloud_items_v1', [oudId!]))[0] === null && !existsSync(join(uploads, oudPad)));

    // ================================================================ 6. versies (vervangen, downloaden, herstellen)
    const inhoud2 = randomBytes(2048);
    const up2 = await upload('звіт.pdf', 'application/pdf', inhoud2, d2.id);
    check('zelfde naam in dezelfde map = vervangen: zelfde id, nieuwe sha, 1 versie', up2.uit.bestand.id === up1.uit.bestand.id && up2.uit.bestand.sha256 === sha(inhoud2) && up2.uit.bestand.versies === 1);
    const vl = await roep(rA, 'versies', { id: up1.uit.bestand.id });
    check('de versielijst noemt de vorige inhoud (sha en bytes)', vl.uit.versies.length === 1 && vl.uit.versies[0].sha256 === sha(inhoud1) && vl.uit.versies[0].bytes === 300_000);
    const dlV = await roep(rA, 'download', { id: up1.uit.bestand.id, versie: sha(inhoud1) });
    check('een versie downloaden geeft de OUDE bytes; een onbekende versie → VERSIE_ONBEKEND (404)', Buffer.from(dlV.uit.data, 'base64').equals(inhoud1)
      && await roep(rA, 'download', { id: up1.uit.bestand.id, versie: 'f'.repeat(64) }).then((r) => r.status === 404 && r.uit.error === 'VERSIE_ONBEKEND'));
    const hv = await roep(rA, 'versies', { id: up1.uit.bestand.id, actie: 'herstel', versie: sha(inhoud1) });
    check('een versie herstellen: de oude inhoud is weer de huidige en de vervanger werd zelf een versie', hv.uit.bestand.sha256 === sha(inhoud1) && hv.uit.bestand.bytes === 300_000
      && Buffer.from((await roep(rA, 'download', { id: up1.uit.bestand.id })).uit.data, 'base64').equals(inhoud1)
      && (await roep(rA, 'versies', { id: up1.uit.bestand.id })).uit.versies[0].sha256 === sha(inhoud2));
    check('een te groot bestand wordt eerlijk geweigerd vóór het lezen (TE_GROOT)', await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'file', title: 'reus', originalName: 'reus.bin', mimeType: 'application/octet-stream', sizeBytes: LIMIET.downloadMaxBytes + 1, storagePath: `${cloudVoorvoegsel(prive)}/${Date.now()}-reus.bin`, tags: [], createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0 }]).then(async ([id]) => (await roep(rA, 'download', { id })).uit.error === 'TE_GROOT'));

    // ================================================================ map verwijderen → bestanden naar de prullenbak
    const wegMap = await roep(rA, 'map', { actie: 'verwijder', id: d1.id });
    const bak = await roep(rA, 'bestanden', { prullenbak: true });
    check('een map (met onderliggende map) verwijderen stuurt haar bestanden naar de prullenbak', wegMap.uit.aantal === 1 && bak.uit.bestanden.some((f: any) => f.id === up1.uit.bestand.id && f.mapId === null)
      && !(await roep(rA, 'bestanden', {})).uit.mappen.some((m: any) => m.id === d1.id || m.id === d2.id));
    check('herstel daarna landt in de wortel (de map bestaat niet meer)', (await roep(rA, 'bestand', { actie: 'herstel', ids: [up1.uit.bestand.id] })).uit.aantal === 1
      && (await roep(rA, 'bestanden', {})).uit.bestanden.some((f: any) => f.id === up1.uit.bestand.id));

    // ================================================================ notitie/koppeling en oude records (geen migratie nodig)
    const [nId] = await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', kind: 'note', title: 'Нотатка-тест', textContent: 'текст нотатки', mimeType: '', sizeBytes: 0, storagePath: '', tags: [], createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0 }]);
    const dlN = await roep(rA, 'download', { id: nId });
    check('een notitie downloaden geeft haar tekst (text/plain), zonder opslagbytes', dlN.status === 200 && dlN.uit.mime === 'text/plain' && Buffer.from(dlN.uit.data, 'base64').toString('utf8') === 'текст нотатки');
    const [legacyId] = await db.add('cloud_items_v1', [{ ownerUserId: a, workspaceId: '', suggestedWorkspaceId: '', kind: 'file', title: 'Стара світлина', originalName: 'oud.png', description: '', textContent: '', sourceUrl: '', mimeType: 'image/png', sizeBytes: 123, storagePath: `${cloudVoorvoegsel(prive)}/legacy.png`, tags: ['old'], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0.5, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, openedAt: 0 }]);
    const wortel = await roep(rA, 'bestanden', {});
    const legacyUit = wortel.uit.bestanden.find((f: any) => f.id === legacyId);
    check('een record van de oude pagina (zonder vNext-velden) staat gewoon in de wortel: geen favoriet, geen versies, soort uit MIME', Boolean(legacyUit) && legacyUit.favoriet === false && legacyUit.versies === 0 && legacyUit.soort === 'afbeelding' && legacyUit.verwijderdOp === null);
    const [wsId] = await db.add('cloud_workspaces_v1', [{ ownerUserId: a, ruimte: 'prive', title: 'Проєкт Alfa', normalizedTitle: 'проєкт alfa', description: '', template: 'project', sections: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now(), archivedAt: 0 }]);
    await db.add('cloud_items_v1', [{ ownerUserId: a, ruimte: 'prive', workspaceId: wsId, kind: 'file', title: 'ws-bestand', originalName: 'ws.pdf', mimeType: 'application/pdf', sizeBytes: 9, storagePath: '', tags: [], createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0 }]);
    check('het overzicht noemt de werkruimte met haar telling; de lijst filtert erop', await roep(rA, 'overzicht', {}).then((o) => o.uit.workspaces.some((w: any) => w.id === wsId && w.titel === 'Проєкт Alfa' && w.aantal === 1))
      && (await roep(rA, 'bestanden', { workspaceId: wsId })).uit.totaal === 1);

    // ================================================================ 7. laden en andermans account
    const techLijst = await roep(rA, 'bestanden', {}, tech);
    check('de technische lade ziet géén persoonlijke bestanden of mappen', techLijst.uit.totaal === 0 && techLijst.uit.mappen.length === 0 && (await roep(rA, 'overzicht', {}, tech)).uit.stats.aantal === 0);
    check('de technische lade kan een persoonlijk bestand niet hernoemen of downloaden (BESTAND_ONBEKEND)', await roep(rA, 'bestand', { actie: 'hernoem', id: up1.uit.bestand.id, naam: 'kaap' }, tech).then((r) => r.status === 404 && r.uit.error === 'BESTAND_ONBEKEND')
      && (await roep(rA, 'download', { id: up1.uit.bestand.id }, tech)).status === 404);
    const techMap = await roep(rA, 'map', { actie: 'nieuw', naam: 'Techmap' }, tech);
    check('een technische map bestaat alleen in de technische lade', techMap.status === 200 && (await roep(rA, 'bestanden', {}, tech)).uit.mappen.some((m: any) => m.id === techMap.uit.map.id)
      && !(await roep(rA, 'bestanden', {})).uit.mappen.some((m: any) => m.id === techMap.uit.map.id));
    check('een ander account ziet niets en kan niets (overzicht leeg, download 404)', (await roep(rB, 'overzicht', {}, ander)).uit.stats.aantal === 0
      && (await roep(rB, 'download', { id: up1.uit.bestand.id }, ander)).status === 404
      && (await roep(rB, 'bestand', { actie: 'verwijder', ids: [up1.uit.bestand.id] }, ander)).status === 404);
    check('een onbekende actie → ACTIE_ONGELDIG (map, bestand en upload)', (await roep(rA, 'map', { actie: 'x' })).uit.error === 'ACTIE_ONGELDIG'
      && (await roep(rA, 'bestand', { actie: 'x', id: up1.uit.bestand.id })).uit.error === 'ACTIE_ONGELDIG'
      && (await roep(rA, 'upload', { actie: 'x' })).uit.error === 'ACTIE_ONGELDIG');
    // Regressie 29.10.2026 (ACHTERAAN, zodat de tellertests hierboven exact blijven): de oude base64-controle
    // /^(?:[A-Za-z0-9+/]{4})*…$/ — in deze route én in storage.write — liet V8 recursief terugkeren en gaf
    // «Maximum call stack size exceeded» op een VOL stuk van 4 MiB. De lineaire controle moet twee volle stukken aankunnen.
    const vol = randomBytes(LIMIET.stukMaxBytes * 2);
    const upVol = await upload('vol-4MiB-stukken.bin', 'application/octet-stream', vol, null, 2);
    check('twee VOLLE stukken van 4 MiB passeren de lineaire base64-controle (regressie: stack-overloop)', upVol.status === 200 && upVol.uit.bestand.bytes === vol.length && upVol.uit.bestand.sha256 === sha(vol));
    const dlVol = await roep(rA, 'download', { id: upVol.uit.bestand.id });
    check('en de 8 MiB komt byte voor byte terug uit storage (ook storage.write is lineair)', dlVol.status === 200 && dlVol.uit.sha256 === sha(vol) && Buffer.from(dlVol.uit.data, 'base64').equals(vol));
  } finally {
    await pool.query(`DELETE FROM app.records WHERE tbl IN ('cloud_items_v1','cloud_mappen_v1','cloud_workspaces_v1') AND data->>'ownerUserId' = ANY($1)`, [[a, b]]).catch(() => undefined);
    for (const lade of [prive, tech, ander]) await pool.query(`DELETE FROM app.storage_objects WHERE path LIKE $1`, [`${cloudVoorvoegsel(lade)}/%`]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[a, b]]).catch(() => undefined);
    rmSync(uploads, { recursive: true, force: true });
  }
  return einde();
}
