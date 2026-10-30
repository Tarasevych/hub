// CLOUD vNEXT — OVERDRACHTEN (29.10.2026): hervattbare uploads op schijf, stukken in elke volgorde en parallel,
// status/zoek om verder te gaan (ook na een SERVERHERSTART — hier nagebootst door het geheugen te wissen), de schijf
// als enige echte grens (SCHIJF_VOL met cijfers), downloaden in delen, en de achtergrondtaken tussen eigen opslag en
// Google Drive (backend/cloud-vnext-taken.ts) met een gestubde Drive (globale fetch) en gestubde toegang.
// Contract: shared/cloud-overdracht-model.ts. Patroon: tests/eenheid/cloud-vnext-backend-20261029.test.ts.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { cloudVnextBestandenRoutes, cloudVnextProef } from '../../backend/cloud-vnext-bestanden';
import { cloudVnextTakenRoutes, cloudVnextTakenProef } from '../../backend/cloud-vnext-taken';
import { cloudVoorvoegsel, metLade } from '../../backend/ruimte-cloud-agenda';
import { CLOUD_VNEXT_LIMIETEN as LIMIET } from '../../shared/cloud-vnext-model';
import { OVERDRACHT_GRENZEN, stukTotaal } from '../../shared/cloud-overdracht-model';
import type { Lade } from '../../shared/ruimte-scheiding';
import { checker } from './hulp/nep-google';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
type Antw = { status: number; uit: Record<string, any> };

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-vnext-overdracht-20261029');
  const uploads = mkdtempSync(join(tmpdir(), 'cloud-vnext-ovd-'));
  process.env.UPLOADS_DIR = uploads;
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`ovd-a-${sfx}@eenheid.test`);
  const b = await mk(`ovd-b-${sfx}@eenheid.test`);
  const prive: Lade = { userId: a, ruimte: 'prive' };
  const tech: Lade = { userId: a, ruimte: 'technisch' };
  const ander: Lade = { userId: b, ruimte: 'prive' };
  const maak = (id: string) => cloudVnextBestandenRoutes(async () => ({ user: { id, role: 'member', status: 'approved' }, service: 'cloud' }));
  const maakT = (id: string) => cloudVnextTakenRoutes(async () => ({ user: { id, role: 'member', status: 'approved' }, service: 'cloud' }));
  const rA = maak(a); const tTA = maakT(a); const tTB = maakT(b);
  const roep = async (routes: Record<string, unknown[]>, pad: string, body: Record<string, unknown>, lade: Lade = prive): Promise<Antw> => {
    const res = await metLade(lade, 'cloud', async () => (routes[`POST /api/owner/cloud/vnext/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {}, query: {} }));
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };
  const stukVan = (inhoud: Buffer, i: number) => inhoud.subarray(i * LIMIET.stukMaxBytes, (i + 1) * LIMIET.stukMaxBytes).toString('base64');
  const echteFetch = globalThis.fetch;
  cloudVnextTakenProef.zetKlok(false);

  try {
    // ================================================================ 1. stukken in elke volgorde, status, zoek, herstart
    const inhoud = randomBytes(Math.floor(2.4 * LIMIET.stukMaxBytes)); // 3 stukken: vol, vol, rest
    const begin = await roep(rA, 'upload', { actie: 'begin', naam: 'ovd.bin', mime: 'application/octet-stream', bytes: inhoud.length });
    check('begin geeft id, stukMax en ontvangen 0', begin.status === 200 && begin.uit.stukMax === LIMIET.stukMaxBytes && begin.uit.ontvangen === 0);
    const id1 = begin.uit.id as string;
    const st2 = await roep(rA, 'upload', { actie: 'stuk', id: id1, offset: 2 * LIMIET.stukMaxBytes, data: stukVan(inhoud, 2) });
    check('het LAATSTE stuk eerst (willekeurige volgorde) wordt aangenomen', st2.status === 200 && st2.uit.ontvangen === inhoud.length - 2 * LIMIET.stukMaxBytes);
    const status1 = await roep(rA, 'upload', { actie: 'status', id: id1 });
    check('status: ontvangen klopt en ontbreekt noemt precies de stukken 0 en 1', status1.uit.ontvangen === st2.uit.ontvangen && JSON.stringify(status1.uit.ontbreekt) === '[0,1]' && status1.uit.naam === 'ovd.bin' && status1.uit.bytes === inhoud.length);
    check('klaar terwijl er stukken ontbreken → STUK_BUITEN_ORDE', (await roep(rA, 'upload', { actie: 'klaar', id: id1, sha256: sha(inhoud) })).uit.error === 'STUK_BUITEN_ORDE');
    const zoek1 = await roep(rA, 'upload', { actie: 'zoek', naam: 'ovd.bin', bytes: inhoud.length });
    check('zoek vindt de eigen sessie (zelfde naam+grootte) met de juiste voortgang', zoek1.uit.sessie?.id === id1 && zoek1.uit.sessie?.ontvangen === st2.uit.ontvangen);
    check('zoek in de TECHNISCHE lade vindt die privésessie niet', (await roep(rA, 'upload', { actie: 'zoek', naam: 'ovd.bin', bytes: inhoud.length }, tech)).uit.sessie === null);
    check('een ander account vindt en ziet de sessie niet (zoek null, status 404)',
      (await roep(maak(b), 'upload', { actie: 'zoek', naam: 'ovd.bin', bytes: inhoud.length }, ander)).uit.sessie === null
      && await roep(maak(b), 'upload', { actie: 'status', id: id1 }, ander).then((r) => r.status === 404 && r.uit.error === 'UPLOAD_ONBEKEND'));

    // «Serverherstart»: het geheugen weg — de waarheid staat op schijf.
    cloudVnextProef.wisSessieGeheugen();
    const statusNaHerstart = await roep(rA, 'upload', { actie: 'status', id: id1 });
    check('na een herstart (geheugen gewist) leeft de sessie verder vanaf de schijf', statusNaHerstart.status === 200 && statusNaHerstart.uit.ontvangen === st2.uit.ontvangen && JSON.stringify(statusNaHerstart.uit.ontbreekt) === '[0,1]');
    await roep(rA, 'upload', { actie: 'stuk', id: id1, offset: 0, data: stukVan(inhoud, 0) });
    const dubbel = await roep(rA, 'upload', { actie: 'stuk', id: id1, offset: 0, data: stukVan(inhoud, 0) });
    check('hetzelfde stuk nogmaals is idempotent (zelfde ontvangen, geen fout)', dubbel.status === 200 && dubbel.uit.ontvangen === inhoud.length - LIMIET.stukMaxBytes);
    await roep(rA, 'upload', { actie: 'stuk', id: id1, offset: LIMIET.stukMaxBytes, data: stukVan(inhoud, 1) });
    const klaar1 = await roep(rA, 'upload', { actie: 'klaar', id: id1, sha256: sha(inhoud) });
    check('klaar ná de herstart: bestand met de juiste bytes en sha (stromende controle)', klaar1.status === 200 && klaar1.uit.bestand.bytes === inhoud.length && klaar1.uit.bestand.sha256 === sha(inhoud));
    const dl1 = await roep(rA, 'download', { id: klaar1.uit.bestand.id });
    check('de inhoud is byte voor byte gelijk', Buffer.from(dl1.uit.data, 'base64').equals(inhoud));

    // ---------------------------------------------------------------- ongeldige offsets en stuklengtes
    const b10 = await roep(rA, 'upload', { actie: 'begin', naam: 'klein.bin', mime: 'application/octet-stream', bytes: 10 });
    check('offset niet op het raster → STUK_BUITEN_ORDE', (await roep(rA, 'upload', { actie: 'stuk', id: b10.uit.id, offset: 5, data: Buffer.alloc(5).toString('base64') })).uit.error === 'STUK_BUITEN_ORDE');
    check('offset voorbij het bestand → STUK_BUITEN_ORDE', (await roep(rA, 'upload', { actie: 'stuk', id: b10.uit.id, offset: LIMIET.stukMaxBytes, data: Buffer.alloc(4).toString('base64') })).uit.error === 'STUK_BUITEN_ORDE');
    check('een stuk met de verkeerde lengte (4 van 10 bytes) → STUK_BUITEN_ORDE', (await roep(rA, 'upload', { actie: 'stuk', id: b10.uit.id, offset: 0, data: Buffer.alloc(4).toString('base64') })).uit.error === 'STUK_BUITEN_ORDE');
    await roep(rA, 'upload', { actie: 'afbreken', id: b10.uit.id });
    check('na afbreken is ook de schijfsessie weg (status 404)', (await roep(rA, 'upload', { actie: 'status', id: b10.uit.id })).status === 404);

    // ---------------------------------------------------------------- de schijf als enige echte grens
    cloudVnextProef.zetVrijeBytes(async () => 1024);
    const vol = await roep(rA, 'upload', { actie: 'begin', naam: 'groot.bin', mime: 'application/octet-stream', bytes: 1_000_000 });
    check('te weinig vrije schijf → SCHIJF_VOL mét de cijfers (vrijBytes, nodigBytes)', vol.status === 400 && vol.uit.error === 'SCHIJF_VOL' && vol.uit.vrijBytes === 1024 && vol.uit.nodigBytes === 1_000_000 + 256 * 1024 * 1024);
    cloudVnextProef.zetVrijeBytes(null);
    check('met echte schijfruimte mag dezelfde begin wél', (await roep(rA, 'upload', { actie: 'begin', naam: 'groot.bin', mime: 'application/octet-stream', bytes: 1_000_000 })).status === 200);
    check('de upload-weg zelf staat tot 32 GiB open (uploadMaxBytes is geen 64 MiB meer)', LIMIET.uploadMaxBytes === 32 * 1024 * 1024 * 1024);

    // ================================================================ 2. parallel (16 MiB) en downloaden in delen
    const groot = randomBytes(16 * 1024 * 1024);
    const bg = await roep(rA, 'upload', { actie: 'begin', naam: 'parallel.bin', mime: 'application/octet-stream', bytes: groot.length });
    const parallel = await Promise.all([...Array(stukTotaal(groot.length)).keys()].map((i) => roep(rA, 'upload', { actie: 'stuk', id: bg.uit.id, offset: i * LIMIET.stukMaxBytes, data: stukVan(groot, i) })));
    check('16 MiB: 4 stukken ECHT parallel (Promise.all) allemaal 200', parallel.every((r) => r.status === 200));
    const klaarG = await roep(rA, 'upload', { actie: 'klaar', id: bg.uit.id, sha256: sha(groot) });
    check('parallel aangekomen stukken → klaar met de juiste sha', klaarG.status === 200 && klaarG.uit.bestand.sha256 === sha(groot));
    const delen: Buffer[] = [];
    let totaalUit = 0;
    for (let o = 0; o < groot.length; o += LIMIET.downloadDeelBytes) {
      const deel = await roep(rA, 'download', { id: klaarG.uit.bestand.id, offset: o, lengte: LIMIET.downloadDeelBytes });
      if (deel.status !== 200) break;
      totaalUit = deel.uit.bytes;
      delen.push(Buffer.from(deel.uit.data, 'base64'));
    }
    check('downloaden in delen: 4 delen, totaal klopt, en de som is byte voor byte het bestand', delen.length === 4 && totaalUit === groot.length && Buffer.concat(delen).equals(groot));
    check('een deel voorbij het einde → DEEL_BUITEN_BEREIK', (await roep(rA, 'download', { id: klaarG.uit.bestand.id, offset: groot.length })).uit.error === 'DEEL_BUITEN_BEREIK');
    const kap = await roep(rA, 'download', { id: klaarG.uit.bestand.id, offset: 0, lengte: 999_999_999 });
    check('een te grote deelvraag wordt op downloadDeelBytes gekapt', kap.status === 200 && Buffer.from(kap.uit.data, 'base64').length === LIMIET.downloadDeelBytes);

    // ================================================================ 3. taken: preflight met eerlijke grenzen
    const telefoonboek: Array<{ url: string; method: string }> = [];
    const driveBytes = randomBytes(2048);
    let uploadFaalt = false; // de nep-Drive weigert uploads zolang dit aan staat (fouttak van de werker)
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input instanceof URL ? input.href : input);
      const method = String(init?.method || 'GET').toUpperCase();
      telefoonboek.push({ url, method });
      if (!url.startsWith('https://www.googleapis.com/')) return echteFetch(input as never, init);
      if (url.includes('/upload/drive/v3/files')) return new Response(JSON.stringify({ id: 'nieuw-drive-id', size: '2048' }), { status: uploadFaalt ? 500 : 200 });
      if (url.includes('alt=media')) return new Response(driveBytes.buffer.slice(driveBytes.byteOffset, driveBytes.byteOffset + driveBytes.length) as ArrayBuffer, { status: 200 });
      if (method === 'PATCH') return new Response(JSON.stringify({ id: 'df1', trashed: true }), { status: 200 });
      return new Response(JSON.stringify({ id: url.includes('df1') ? 'df1' : 'x', name: 'drive.bin', size: '2048', mimeType: 'application/octet-stream' }), { status: 200 });
    }) as typeof fetch;
    cloudVnextTakenProef.zetDriveToegang(async (userId, accountId) => (userId === a && accountId === 'acc-1' ? { token: 'proef-token', accountId: 'acc-1', email: 'proef@gmail.test' } : null));

    check('drive→eigen met een onbekend account → BRON_NIET_GEKOPPELD', (await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: 'nergens', id: 'df1' }, doel: { dienst: 'eigen' } })).uit.error === 'BRON_NIET_GEKOPPELD');
    const zes = randomBytes(6 * 1024 * 1024);
    const upZes = await (async () => { const bgn = await roep(rA, 'upload', { actie: 'begin', naam: 'zes.bin', mime: 'application/octet-stream', bytes: zes.length }); for (let i = 0; i < stukTotaal(zes.length); i++) await roep(rA, 'upload', { actie: 'stuk', id: bgn.uit.id, offset: i * LIMIET.stukMaxBytes, data: stukVan(zes, i) }); return roep(rA, 'upload', { actie: 'klaar', id: bgn.uit.id, sha256: sha(zes) }); })();
    const teGroot = await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'eigen', id: upZes.uit.bestand.id }, doel: { dienst: 'google-drive', account: 'acc-1' } });
    check('6 MiB naar Drive → DOEL_LIMIET met de grens, haar BRON-uitleg en suggestie erbij', teGroot.status === 400 && teGroot.uit.error === 'DOEL_LIMIET' && teGroot.uit.bytes === zes.length && teGroot.uit.grens?.uploadMaxBytes === OVERDRACHT_GRENZEN['google-drive'].uploadMaxBytes && Array.isArray(teGroot.uit.grens?.bron) && Array.isArray(teGroot.uit.grens?.suggestie));

    // ---------------------------------------------------------------- eigen → drive (kopie en verplaats)
    const klein = randomBytes(2000);
    const upKlein = await (async () => { const bgn = await roep(rA, 'upload', { actie: 'begin', naam: 'mee.bin', mime: 'application/octet-stream', bytes: klein.length }); await roep(rA, 'upload', { actie: 'stuk', id: bgn.uit.id, offset: 0, data: klein.toString('base64') }); return roep(rA, 'upload', { actie: 'klaar', id: bgn.uit.id, sha256: sha(klein) }); })();
    const t1 = await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'eigen', id: upKlein.uit.bestand.id }, doel: { dienst: 'google-drive', account: 'acc-1' } });
    check('taak aangemaakt: wacht, naam en totaal uit het SERVERrecord (niet uit de browser)', t1.status === 200 && t1.uit.taak.stand === 'wacht' && t1.uit.taak.naam === 'mee.bin' && t1.uit.taak.totaalBytes === klein.length);
    check('dezelfde actieve taak nogmaals → dezelfde taak terug (geen dubbel werk)', (await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'eigen', id: upKlein.uit.bestand.id }, doel: { dienst: 'google-drive', account: 'acc-1' } })).uit.taak.id === t1.uit.taak.id);
    const uploadsVoor = telefoonboek.filter((q) => q.url.includes('/upload/drive')).length;
    await cloudVnextTakenProef.tikProef();
    const na1 = (await roep(tTA, 'taken', { actie: 'lijst' })).uit.taken.find((x: any) => x.id === t1.uit.taak.id);
    check('één tik van de werker: kopie eigen→Drive is klaar; de multipart-upload is echt gedaan', na1.stand === 'klaar' && na1.voortgangBytes === klein.length && telefoonboek.filter((q) => q.url.includes('/upload/drive')).length === uploadsVoor + 1);
    check('kopie laat de bron met rust (niet in de prullenbak)', (await roep(rA, 'download', { id: upKlein.uit.bestand.id })).status === 200);
    const t2 = await roep(tTA, 'taken', { actie: 'nieuw', soort: 'verplaats', bron: { dienst: 'eigen', id: upKlein.uit.bestand.id }, doel: { dienst: 'google-drive', account: 'acc-1' } });
    await cloudVnextTakenProef.tikProef();
    const bronRij = (await pool.query(`SELECT data->>'verwijderdOp' AS weg FROM app.records WHERE tbl='cloud_items_v1' AND id=$1`, [upKlein.uit.bestand.id])).rows[0];
    check('verplaatsen: de bron gaat pas NA de gelukte schrijf naar de prullenbak (30 dagen herstelbaar)', (await roep(tTA, 'taken', { actie: 'lijst' })).uit.taken.find((x: any) => x.id === t2.uit.taak.id).stand === 'klaar' && Boolean(bronRij?.weg));

    // ---------------------------------------------------------------- drive → eigen (kopie, naamkeuze, verplaats)
    const t3 = await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: 'acc-1', id: 'df1' }, doel: { dienst: 'eigen' } });
    check('drive→eigen: preflight haalt naam en grootte bij Drive zelf', t3.status === 200 && t3.uit.taak.naam === 'drive.bin' && t3.uit.taak.totaalBytes === 2048);
    await cloudVnextTakenProef.tikProef();
    const klaar3 = (await roep(tTA, 'taken', { actie: 'lijst' })).uit.taken.find((x: any) => x.id === t3.uit.taak.id);
    const nieuwItem = (await pool.query(`SELECT id FROM app.records WHERE tbl='cloud_items_v1' AND data->>'ownerUserId'=$1 AND data->>'title'='drive.bin'`, [a])).rows[0];
    const dlNieuw = nieuwItem ? await roep(rA, 'download', { id: nieuwItem.id }) : null;
    check('de bytes staan echt in de eigen opslag en zijn byte voor byte die van Drive', klaar3.stand === 'klaar' && Boolean(dlNieuw) && Buffer.from(dlNieuw!.uit.data, 'base64').equals(driveBytes));
    const t4 = await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: 'acc-1', id: 'df1' }, doel: { dienst: 'eigen' } });
    await cloudVnextTakenProef.tikProef();
    const tweeNamen = (await pool.query(`SELECT data->>'title' AS t FROM app.records WHERE tbl='cloud_items_v1' AND data->>'ownerUserId'=$1 AND data->>'title' LIKE 'drive%'`, [a])).rows.map((r) => r.t).sort();
    check('zelfde naam nogmaals → volgnummer, nooit stil overschrijven', (await roep(tTA, 'taken', { actie: 'lijst' })).uit.taken.find((x: any) => x.id === t4.uit.taak.id).stand === 'klaar' && JSON.stringify(tweeNamen) === JSON.stringify(['drive (2).bin', 'drive.bin']));
    const patchesVoor = telefoonboek.filter((q) => q.method === 'PATCH').length;
    await roep(tTA, 'taken', { actie: 'nieuw', soort: 'verplaats', bron: { dienst: 'google-drive', account: 'acc-1', id: 'df1' }, doel: { dienst: 'eigen' } });
    await cloudVnextTakenProef.tikProef();
    check('verplaatsen uit Drive: het origineel gaat pas na de gelukte schrijf de Drive-prullenbak in (PATCH trashed)', telefoonboek.filter((q) => q.method === 'PATCH').length === patchesVoor + 1);

    // ---------------------------------------------------------------- fouten, opnieuw, annuleren, isolatie, opruimen
    uploadFaalt = true;
    const upF = await (async () => { const bgn = await roep(rA, 'upload', { actie: 'begin', naam: 'faal.bin', mime: 'application/octet-stream', bytes: 100 }); await roep(rA, 'upload', { actie: 'stuk', id: bgn.uit.id, offset: 0, data: randomBytes(100).toString('base64') }); return roep(rA, 'upload', { actie: 'klaar', id: bgn.uit.id, sha256: '' }); })();
    // (sha '' → SHA_MISMATCH; voor de faaltaak uploaden we netjes opnieuw)
    const inhoudF = randomBytes(100);
    const upF2 = await (async () => { const bgn = await roep(rA, 'upload', { actie: 'begin', naam: 'faal.bin', mime: 'application/octet-stream', bytes: inhoudF.length }); await roep(rA, 'upload', { actie: 'stuk', id: bgn.uit.id, offset: 0, data: inhoudF.toString('base64') }); return roep(rA, 'upload', { actie: 'klaar', id: bgn.uit.id, sha256: sha(inhoudF) }); })();
    check('(opzet) een kapotte sha bij de faal-upload gaf SHA_MISMATCH, de nette upload lukte', upF.uit.error === 'SHA_MISMATCH' && upF2.status === 200);
    const tf = await roep(tTA, 'taken', { actie: 'nieuw', soort: 'kopie', bron: { dienst: 'eigen', id: upF2.uit.bestand.id }, doel: { dienst: 'google-drive', account: 'acc-1' } });
    await cloudVnextTakenProef.tikProef();
    const foutTaak = (await roep(tTA, 'taken', { actie: 'lijst' })).uit.taken.find((x: any) => x.id === tf.uit.taak.id);
    check('Drive weigert (500) → stand fout met een eerlijke, tweetalige uitleg', foutTaak?.stand === 'fout' && foutTaak.fout?.code === 'GOOGLE_WEIGERT' && Array.isArray(foutTaak.fout?.uitleg) && foutTaak.fout.uitleg.length === 2, JSON.stringify(foutTaak));
    const opnieuw = await roep(tTA, 'taken', { actie: 'opnieuw', id: tf.uit.taak.id });
    check('opnieuw: fout → wacht, voortgang op nul, de fout is weg', opnieuw.uit.taak.stand === 'wacht' && opnieuw.uit.taak.voortgangBytes === 0 && !opnieuw.uit.taak.fout);
    const geann = await roep(tTA, 'taken', { actie: 'annuleer', id: tf.uit.taak.id });
    check('annuleren van een wachtende taak → geannuleerd', geann.uit.taak.stand === 'geannuleerd');
    check('annuleren van een afgeronde taak → ACTIE_ONGELDIG', (await roep(tTA, 'taken', { actie: 'annuleer', id: t3.uit.taak.id })).uit.error === 'ACTIE_ONGELDIG');
    delete (globalThis as never as Record<string, unknown>).__driveUploadStuk;
    check('een ander account ziet GEEN taken van dit account', (await roep(tTB, 'taken', { actie: 'lijst' }, ander)).uit.taken.length === 0);
    check('een ander account kan andermans taak niet annuleren (404)', (await roep(tTB, 'taken', { actie: 'annuleer', id: t3.uit.taak.id }, ander)).status === 404);
    // Hangende 'bezig' zonder hartslag (herstart): de eerstvolgende tik zet haar terug op wacht (en mag haar meteen afmaken).
    const hangId = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['cloud_taken_v1', hangId, { ownerUserId: a, ruimte: 'prive', soort: 'kopie', stand: 'bezig', bron: { dienst: 'eigen', id: 'bestaat-niet' }, doel: { dienst: 'google-drive', account: 'acc-1' }, naam: 'hang.bin', totaalBytes: 1, voortgangBytes: 0, createdAt: Date.now() - 600000, updatedAt: Date.now() - 600000 }]);
    await cloudVnextTakenProef.tikProef();
    await cloudVnextTakenProef.tikProef();
    const hang = (await pool.query(`SELECT data->>'stand' AS s FROM app.records WHERE tbl='cloud_taken_v1' AND id=$1`, [hangId])).rows[0];
    check('een hangende «bezig» zonder hartslag valt terug en eindigt eerlijk (wacht of fout, nooit eeuwig bezig)', hang?.s === 'wacht' || hang?.s === 'fout');
    const opruimen = await roep(tTA, 'taken', { actie: 'opruimen' });
    const over = (await roep(tTA, 'taken', { actie: 'lijst' })).uit.taken;
    check('opruimen haalt klaar/fout/geannuleerd weg; wat wacht of bezig is blijft', opruimen.uit.ok === true && over.every((x: any) => x.stand === 'wacht' || x.stand === 'bezig'));
  } finally {
    globalThis.fetch = echteFetch;
    cloudVnextTakenProef.zetKlok(true);
    cloudVnextProef.zetVrijeBytes(null);
    await pool.query(`DELETE FROM app.records WHERE tbl IN ('cloud_items_v1','cloud_mappen_v1','cloud_taken_v1') AND data->>'ownerUserId' = ANY($1)`, [[a, b]]).catch(() => undefined);
    for (const lade of [prive, tech, ander]) await pool.query(`DELETE FROM app.storage_objects WHERE path LIKE $1`, [`${cloudVoorvoegsel(lade)}/%`]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[a, b]]).catch(() => undefined);
    rmSync(uploads, { recursive: true, force: true });
  }
  return einde();
}
