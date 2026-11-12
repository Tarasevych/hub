// CLOUD-001 — MAPPENBOOM, LEGE BESTANDEN, ARCHIEVEN, GEDEELDE KOPPELINGEN, DEELBEREIKEN EN STATISTIEK
// Tegen de echte PostgreSQL 16-databank (inclusief migratie 0210 + RLS) en echte schijfopslag (UPLOADS_DIR).
// Draaien: node scripts/eenheidstests.mjs cloud-001-delen-mappen.test.ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { unzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { getPool } from '../../server/platform/pg';
import { cloudVnextBestandenRoutes } from '../../backend/cloud-vnext-bestanden';
import {
  bestandenDelenEigenaarRoutes,
  bestandenDelenPubliekeRoutes,
  type OptioneleSessieGebruiker,
} from '../../backend/bestanden-delen';
import { cloudVoorvoegsel, metLade } from '../../backend/ruimte-cloud-agenda';
import { CLOUD_VNEXT_LIMIETEN as LIMIET } from '../../shared/cloud-vnext-model';
import type { Lade } from '../../shared/ruimte-scheiding';
import { checker } from './hulp/nep-google';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
type Antw = { status: number; uit: Record<string, any> };

function maakTarBuffer(items: Array<{ pad: string; inhoud?: Buffer; map?: boolean }>): Buffer {
  const blokken: Buffer[] = [];
  for (const item of items) {
    const kop = Buffer.alloc(512, 0);
    const data = item.map ? Buffer.alloc(0) : (item.inhoud ?? Buffer.alloc(0));
    kop.write(item.pad, 0, Math.min(100, Buffer.byteLength(item.pad)), 'utf8');
    kop.write(item.map ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
    kop.write('0001000\0', 108, 8, 'ascii');
    kop.write('0001000\0', 116, 8, 'ascii');
    kop.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    kop.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
    kop.fill(0x20, 148, 156);
    kop.write(item.map ? '5' : '0', 156, 1, 'ascii');
    kop.write('ustar\0', 257, 6, 'ascii');
    kop.write('00', 263, 2, 'ascii');
    let som = 0;
    for (let i = 0; i < 512; i += 1) som += kop[i];
    kop.write(`${som.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blokken.push(kop);
    if (data.length > 0) {
      blokken.push(data);
      const rest = data.length % 512;
      if (rest > 0) blokken.push(Buffer.alloc(512 - rest, 0));
    }
  }
  blokken.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blokken);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-001-delen-mappen');
  const uploads = mkdtempSync(join(tmpdir(), 'cloud-001-test-'));
  process.env.UPLOADS_DIR = uploads;
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');

  const maakGebruiker = async (email: string, displayName: string) => {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)',
      ['users', id, { email, displayName, role: 'member', status: 'approved' }],
    );
    return { id, email, displayName };
  };

  const eigenaar = await maakGebruiker(`eigenaar-${sfx}@eenheid.test`, 'Власник Простору');
  const ontvanger = await maakGebruiker(`ontvanger-${sfx}@eenheid.test`, 'Отримувач Доступу');
  const vreemde = await maakGebruiker(`vreemde-${sfx}@eenheid.test`, 'Сторонній Користувач');

  const prive: Lade = { userId: eigenaar.id, ruimte: 'prive' };
  const tech: Lade = { userId: eigenaar.id, ruimte: 'technisch' };
  const ontvangerLade: Lade = { userId: ontvanger.id, ruimte: 'prive' };
  const vreemdeLade: Lade = { userId: vreemde.id, ruimte: 'prive' };

  const gemeldeOntvangers: Array<{ userId: string; email: string; titel: string; pad: string }> = [];
  const bestandenA = cloudVnextBestandenRoutes(async () => ({
    user: { id: eigenaar.id, email: eigenaar.email, role: 'member', status: 'approved' },
    service: 'cloud',
  }));
  const delenA = bestandenDelenEigenaarRoutes(
    async () => ({
      user: { id: eigenaar.id, email: eigenaar.email, displayName: eigenaar.displayName, role: 'member', status: 'approved' },
      service: 'cloud',
    }),
    {
      meldOntvanger: async (userId, email, titel, _bericht, pad) => {
        gemeldeOntvangers.push({ userId, email, titel, pad });
      },
    },
  );
  const delenOntvanger = bestandenDelenEigenaarRoutes(async () => ({
    user: { id: ontvanger.id, email: ontvanger.email, displayName: ontvanger.displayName, role: 'member', status: 'approved' },
    service: 'cloud',
  }));
  const delenVreemde = bestandenDelenEigenaarRoutes(async () => ({
    user: { id: vreemde.id, email: vreemde.email, displayName: vreemde.displayName, role: 'member', status: 'approved' },
    service: 'cloud',
  }));

  let actievePubliekeSessie: OptioneleSessieGebruiker | null = null;
  const publiekeRoutes = bestandenDelenPubliekeRoutes(async () => actievePubliekeSessie);

  const roepCloud = async (pad: string, body: Record<string, unknown>, lade: Lade = prive): Promise<Antw> => {
    const res = await metLade(lade, 'cloud', async () =>
      (bestandenA[`POST /api/owner/cloud/vnext/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({
        event: { headers: { host: 'cloud.tarasevych.com' } },
        body,
        params: {},
        query: {},
      }),
    );
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };

  const roepDelen = async (
    routes: ReturnType<typeof bestandenDelenEigenaarRoutes>,
    pad: string,
    body: Record<string, unknown>,
    lade: Lade = prive,
  ): Promise<Antw> => {
    const res = await metLade(lade, 'cloud', async () =>
      (routes[`POST /api/owner/cloud/vnext/delen/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({
        event: { headers: { host: 'cloud.tarasevych.com' } },
        body,
        params: {},
        query: {},
      }),
    );
    return { status: res.statusCode, uit: JSON.parse(res.body) };
  };

  const roepPubliek = async (
    pad: 'info' | 'inhoud' | 'download',
    body: Record<string, unknown>,
    sessie: OptioneleSessieGebruiker | null = null,
    ip = '198.51.100.24',
  ): Promise<Antw> => {
    const vorige = actievePubliekeSessie;
    actievePubliekeSessie = sessie;
    try {
      const res = await (publiekeRoutes[`POST /api/cloud/gedeeld/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({
        event: {
          headers: {
            host: 'cloud.tarasevych.com',
            'x-forwarded-for': ip,
            'user-agent': 'Mozilla/5.0 (Linux; Android 15) Chrome/134.0',
          },
        },
        body,
        params: {},
        query: {},
      });
      return { status: res.statusCode, uit: JSON.parse(res.body) };
    } finally {
      actievePubliekeSessie = vorige;
    }
  };

  const uploadBestand = async (naam: string, mime: string, inhoud: Buffer, mapId: string | null = null): Promise<Record<string, any>> => {
    const begin = await roepCloud('upload', { actie: 'begin', naam, mime, bytes: inhoud.length, mapId });
    if (begin.status !== 200) throw new Error(`upload begin mislukt: ${JSON.stringify(begin.uit)}`);
    const n = Math.max(1, Math.ceil(inhoud.length / LIMIET.stukMaxBytes));
    for (let i = 0; i < n; i += 1) {
      const o = i * LIMIET.stukMaxBytes;
      const st = await roepCloud('upload', {
        actie: 'stuk',
        id: begin.uit.id,
        offset: o,
        data: inhoud.subarray(o, o + LIMIET.stukMaxBytes).toString('base64'),
      });
      if (st.status !== 200) throw new Error(`upload stuk mislukt: ${JSON.stringify(st.uit)}`);
    }
    const klaar = await roepCloud('upload', { actie: 'klaar', id: begin.uit.id, sha256: sha(inhoud) });
    if (klaar.status !== 200) throw new Error(`upload klaar mislukt: ${JSON.stringify(klaar.uit)}`);
    return klaar.uit.bestand;
  };

  try {
    // ================================================================ 1. mappenboom (paden_zorg) & lege bestanden (nieuw_leeg)
    const zorg1 = await roepCloud('map', {
      actie: 'paden_zorg',
      ouderId: null,
      paden: [
        ['Проєкт Альфа', 'Договори', '2026'],
        ['Проєкт Альфа', 'Додатки'],
      ],
    });
    check(
      '1 paden_zorg maakt volledige geneste mappenboom in één aanroep',
      zorg1.status === 200
        && zorg1.uit.aangemaakt === 4
        && Boolean(zorg1.uit.kaart['Проєкт Альфа'])
        && Boolean(zorg1.uit.kaart['Проєкт Альфа/Договори/2026'])
        && Boolean(zorg1.uit.kaart['Проєкт Альфа/Додатки']),
    );
    const zorgIdempotent = await roepCloud('map', {
      actie: 'paden_zorg',
      ouderId: null,
      paden: [['Проєкт Альфа', 'Договори', '2026']],
    });
    check(
      '1 herhaalde paden_zorg is idempotent (0 dubbel aangemaakte mappen)',
      zorgIdempotent.status === 200
        && zorgIdempotent.uit.aangemaakt === 0
        && zorgIdempotent.uit.kaart['Проєкт Альфа/Договори/2026'] === zorg1.uit.kaart['Проєкт Альфа/Договори/2026'],
    );

    const wortelMapId = zorg1.uit.kaart['Проєкт Альфа'] as string;
    const contractMapId = zorg1.uit.kaart['Проєкт Альфа/Договори/2026'] as string;
    const bijlagenMapId = zorg1.uit.kaart['Проєкт Альфа/Додатки'] as string;

    const leegBestand = await roepCloud('bestand', {
      actie: 'nieuw_leeg',
      naam: '.gitkeep',
      mime: 'application/octet-stream',
      mapId: bijlagenMapId,
    });
    check(
      '1 nieuw_leeg bewaart een 0-byte bestand in de gekozen map',
      leegBestand.status === 200
        && leegBestand.uit.bestand.naam === '.gitkeep'
        && leegBestand.uit.bestand.bytes === 0
        && leegBestand.uit.bestand.mapId === bijlagenMapId,
    );
    const dlLeeg = await roepCloud('download', { id: leegBestand.uit.bestand.id });
    check(
      '1 0-byte bestand downloaden slaagt met bytes=0 en lege base64',
      dlLeeg.status === 200 && dlLeeg.uit.bytes === 0 && dlLeeg.uit.data === '' && dlLeeg.uit.sha256 === sha(Buffer.alloc(0)),
    );

    // ================================================================ 2. archieven (.zip en .tar.gz bekijken, lezen en uitpakken)
    const zipInhoud = Buffer.from(
      zipSync({
        'handleiding/start.md': new TextEncoder().encode('# Швидкий старт\nУсе працює.'),
        'handleiding/config.json': new TextEncoder().encode('{"taal":"uk"}'),
        'geheim/intern.txt': new TextEncoder().encode('Внутрішній запис — не для зовнішнього поширення'),
      }),
    );
    const zipBestand = await uploadBestand('bundel.zip', 'application/zip', zipInhoud, wortelMapId);
    const archiefLijst = await roepCloud('archief', { actie: 'inhoud', id: zipBestand.id });
    check(
      '2 archief inhoud (.zip) toont mappen en bestanden met juiste omvang',
      archiefLijst.status === 200
        && archiefLijst.uit.ondersteund === true
        && archiefLijst.uit.ingangen.some((i: any) => i.pad === 'handleiding/start.md' && !i.map)
        && archiefLijst.uit.ingangen.some((i: any) => i.pad === 'geheim/intern.txt' && !i.map),
    );
    const archiefEnkel = await roepCloud('archief', { actie: 'bestand', id: zipBestand.id, pad: 'handleiding/config.json' });
    check(
      '2 archief bestand leest één enkel bestand uit het .zip-archief zonder uitpakken',
      archiefEnkel.status === 200
        && Buffer.from(archiefEnkel.uit.data, 'base64').toString('utf8') === '{"taal":"uk"}',
    );

    const tarGzInhoud = gzipSync(
      maakTarBuffer([
        { pad: 'uitgave/', map: true },
        { pad: 'uitgave/versie.txt', inhoud: Buffer.from('20261112', 'utf8') },
      ]),
    );
    const tarGzBestand = await uploadBestand('pakket.tar.gz', 'application/gzip', tarGzInhoud, null);
    const uitgepakt = await roepCloud('archief', { actie: 'uitpakken', id: tarGzBestand.id, inEigenMap: true });
    check(
      '2 archief uitpakken (.tar.gz) maakt mappen en bestanden in de eigen cloudopslag',
      uitgepakt.status === 200 && uitgepakt.uit.uitgepakteBestanden === 1 && Boolean(uitgepakt.uit.mapId),
    );

    // ================================================================ 3. exacte bestandsdelen (regels, PDF-pagina's, bytebereik)
    const tienRegels = Array.from({ length: 10 }, (_, i) => `Рядок ${i + 1}: ${i === 0 || i === 9 ? 'ТАЄМНИЙ РЯДОК ПОЗА ДІАПАЗОНОМ' : `дозволений вміст №${i + 1}`}`).join('\n');
    const tekstBestand = await uploadBestand('протокол.txt', 'text/plain', Buffer.from(tienRegels, 'utf8'), contractMapId);
    const voorbTekst = await roepDelen(delenA, 'voorbereiden', { doelSoort: 'bestand', doelId: tekstBestand.id });
    check(
      '3 voorbereiden op tekstbestand geeft het exacte aantal regels en voorbeeldregels terug',
      voorbTekst.status === 200 && voorbTekst.uit.deelOpties.tekstRegelsTotaal === 10 && voorbTekst.uit.deelOpties.voorbeeldRegels.length === 10,
    );

    const deelRegels = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'bestand_deel',
      doelId: tekstBestand.id,
      naam: 'Витяг протоколу (рядки 3–6)',
      notitie: 'Лише узгоджені пункти',
      bereik: { deelSoort: 'regels', vanRegel: 3, totRegel: 6 },
      modus: 'link',
      rechten: 'downloaden',
    });
    const codeRegels = deelRegels.uit.koppeling.code as string;
    const pubRegelsInfo = await roepPubliek('info', { code: codeRegels });
    const pubRegelsInhoud = await roepPubliek('inhoud', { code: codeRegels });
    const pubRegelsDl = await roepPubliek('download', { code: codeRegels });
    const verwachteRegels = tienRegels.split('\n').slice(2, 6).join('\n');
    check(
      '3 bestand_deel (regels 3..6): ontvanger ziet en downloadt uitsluitend regels 3..6, geen enkel teken erbuiten',
      pubRegelsInfo.status === 200
        && pubRegelsInfo.uit.deelInfo?.vanRegel === 3
        && pubRegelsInfo.uit.deelInfo?.totRegel === 6
        && pubRegelsInhoud.status === 200
        && pubRegelsInhoud.uit.tekst === verwachteRegels
        && !String(pubRegelsInhoud.uit.tekst).includes('ТАЄМНИЙ')
        && pubRegelsDl.status === 200
        && Buffer.from(pubRegelsDl.uit.data, 'base64').toString('utf8') === verwachteRegels,
    );

    // PDF met 4 pagina's van verschillende afmetingen; we delen alleen pagina 2..3
    const bronPdf = await PDFDocument.create();
    bronPdf.addPage([300, 400]);
    bronPdf.addPage([410, 510]);
    bronPdf.addPage([420, 520]);
    bronPdf.addPage([600, 700]);
    const pdfBytes = Buffer.from(await bronPdf.save());
    const pdfBestand = await uploadBestand('договір-4стор.pdf', 'application/pdf', pdfBytes, contractMapId);
    const voorbPdf = await roepDelen(delenA, 'voorbereiden', { doelSoort: 'bestand', doelId: pdfBestand.id });
    check(
      '3 voorbereiden op PDF telt 4 pagina’s via pdf-lib',
      voorbPdf.status === 200 && voorbPdf.uit.deelOpties.pdfPaginasTotaal === 4,
    );
    const deelPdf = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'bestand_deel',
      doelId: pdfBestand.id,
      naam: 'Сторінки 2–3 договору',
      bereik: { deelSoort: 'paginas', vanPagina: 2, totPagina: 3 },
      modus: 'link',
      rechten: 'downloaden',
    });
    const pubPdfDl = await roepPubliek('download', { code: deelPdf.uit.koppeling.code });
    const ontvangenPdf = await PDFDocument.load(Buffer.from(pubPdfDl.uit.data, 'base64'));
    check(
      '3 bestand_deel (paginas 2..3): ontvanger krijgt een nieuw PDF-document met precies 2 pagina’s ([410,510] en [420,520])',
      pubPdfDl.status === 200
        && ontvangenPdf.getPageCount() === 2
        && Math.round(ontvangenPdf.getPage(0).getWidth()) === 410
        && Math.round(ontvangenPdf.getPage(1).getWidth()) === 420,
    );

    // Bytebereik 100..249 uit een binair bestand van 1024 bytes
    const ruweBytes = randomBytes(1024);
    const binBestand = await uploadBestand('monster.bin', 'application/octet-stream', ruweBytes, bijlagenMapId);
    const deelBytes = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'bestand_deel',
      doelId: binBestand.id,
      naam: 'Зріз байтів 100–249',
      bereik: { deelSoort: 'bytes', vanByte: 100, totByte: 249 },
      modus: 'link',
      rechten: 'downloaden',
    });
    const pubBytesDl = await roepPubliek('download', { code: deelBytes.uit.koppeling.code });
    check(
      '3 bestand_deel (bytes 100..249): exact 150 bytes gelijk aan subarray(100, 250)',
      pubBytesDl.status === 200
        && pubBytesDl.uit.bytes === 150
        && Buffer.from(pubBytesDl.uit.data, 'base64').equals(ruweBytes.subarray(100, 250)),
    );

    // ================================================================ 4. hele map, selectie binnen map & archief-selectie
    const extraGeheimBestand = await uploadBestand('не-ділитися.txt', 'text/plain', Buffer.from('приватний файл у корені теки', 'utf8'), wortelMapId);
    const deelHeleMap = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'map',
      doelId: wortelMapId,
      naam: 'Повна тека Проєкт Альфа',
      modus: 'link',
      rechten: 'downloaden',
    });
    const mapZipDl = await roepPubliek('download', { code: deelHeleMap.uit.koppeling.code, allesZip: true });
    const uitgepakteMapZip = unzipSync(new Uint8Array(Buffer.from(mapZipDl.uit.data, 'base64')));
    const zipSleutels = Object.keys(uitgepakteMapZip);
    check(
      '4 hele map delen + allesZip bundelt geneste bestanden met behoud van mappaden',
      mapZipDl.status === 200
        && zipSleutels.some((k) => k.endsWith('протокол.txt'))
        && zipSleutels.some((k) => k.endsWith('договір-4стор.pdf')),
    );

    const deelSelectie = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'selectie',
      doelId: wortelMapId,
      naam: 'Вибрані матеріали з теки',
      bereik: { mapIds: [contractMapId], bestandIds: [] },
      modus: 'link',
      rechten: 'downloaden',
    });
    const selCode = deelSelectie.uit.koppeling.code as string;
    const selGoed = await roepPubliek('download', { code: selCode, bestandId: tekstBestand.id });
    const selGeweigerd = await roepPubliek('download', { code: selCode, bestandId: extraGeheimBestand.id });
    check(
      '4 selectie delen: gekozen submap is toegankelijk, ander bestand in dezelfde hoofdmap krijgt 404 BESTAND_ONBEKEND',
      selGoed.status === 200 && selGeweigerd.status === 404 && selGeweigerd.uit.error === 'BESTAND_ONBEKEND',
    );

    const deelArchiefPad = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'archief_pad',
      doelId: zipBestand.id,
      naam: 'Лише посібник з архіву',
      bereik: { archiefPaden: ['handleiding/start.md'] },
      modus: 'link',
      rechten: 'downloaden',
    });
    const archCode = deelArchiefPad.uit.koppeling.code as string;
    const archGoed = await roepPubliek('download', { code: archCode, archiefPad: 'handleiding/start.md' });
    const archGeheim = await roepPubliek('download', { code: archCode, archiefPad: 'geheim/intern.txt' });
    check(
      '4 archief_pad delen: toegestaan pad binnen .zip werkt, niet-gedeeld pad in hetzelfde .zip geeft 404 ARCHIEF_BESTAND_ONBEKEND',
      archGoed.status === 200
        && Buffer.from(archGoed.uit.data, 'base64').toString('utf8').includes('Швидкий старт')
        && archGeheim.status === 404
        && archGeheim.uit.error === 'ARCHIEF_BESTAND_ONBEKEND',
    );

    // ================================================================ 5. modus 'accounts', melding & gedeeldMetMij
    const zoekAcc = await roepDelen(delenA, 'voorbereiden', { zoekAccounts: [ontvanger.email, 'onbekend@example.invalid'] });
    check(
      '5 zoekAccounts herkent geregistreerd account en markeert onbekend e-mailadres eerlijk',
      zoekAcc.status === 200
        && zoekAcc.uit.accounts.find((x: any) => x.email === ontvanger.email)?.geregistreerd === true
        && zoekAcc.uit.accounts.find((x: any) => x.email === 'onbekend@example.invalid')?.geregistreerd === false,
    );

    const deelAccounts = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'bestand',
      doelId: tekstBestand.id,
      naam: 'Персональний доступ для колеги',
      notitie: 'Перевірте до п’ятниці',
      modus: 'accounts',
      ontvangers: [ontvanger.email],
      rechten: 'bekijken',
    });
    const accCode = deelAccounts.uit.koppeling.code as string;
    check(
      '5 modus accounts stuurt direct een melding naar de geregistreerde ontvanger',
      deelAccounts.status === 200 && gemeldeOntvangers.some((m) => m.userId === ontvanger.id && m.email === ontvanger.email),
    );
    const zonderSessie = await roepPubliek('info', { code: accCode }, null);
    const verkeerdAccount = await roepPubliek('info', { code: accCode }, { id: vreemde.id, email: vreemde.email });
    const juistAccount = await roepPubliek('info', { code: accCode }, { id: ontvanger.id, email: ontvanger.email });
    const dlBijBekijken = await roepPubliek('download', { code: accCode }, { id: ontvanger.id, email: ontvanger.email });
    check(
      '5 modus accounts + rechten bekijken: gast → 401 ACCOUNT_VEREIST, vreemde → 403 ACCOUNT_GEWEIGERD, ontvanger → 200, download → 403 DOWNLOAD_NIET_TOEGESTAAN',
      zonderSessie.status === 401
        && zonderSessie.uit.error === 'ACCOUNT_VEREIST'
        && verkeerdAccount.status === 403
        && verkeerdAccount.uit.error === 'ACCOUNT_GEWEIGERD'
        && juistAccount.status === 200
        && dlBijBekijken.status === 403
        && dlBijBekijken.uit.error === 'DOWNLOAD_NIET_TOEGESTAAN',
    );
    const overzichtOntvanger = await roepDelen(delenOntvanger, 'overzicht', {}, ontvangerLade);
    check(
      '5 ontvanger ziet de koppeling in zijn eigen overzicht onder gedeeldMetMij',
      overzichtOntvanger.status === 200
        && overzichtOntvanger.uit.gedeeldMetMij.some((g: any) => g.code === accCode && g.naam === 'Персональний доступ для колеги'),
    );

    // ================================================================ 6. wachtwoord, planning, verloop, limieten, pauze, intrekken & statistiek
    const toekomst = new Date(Date.now() + 3600_000).toISOString();
    const deelBeheerd = await roepDelen(delenA, 'nieuw', {
      doelSoort: 'bestand',
      doelId: tekstBestand.id,
      naam: 'Тимчасове захищене посилання',
      modus: 'link',
      rechten: 'downloaden',
      wachtwoord: 'Geheim-2026!',
      actiefVanaf: toekomst,
      maxWeergaven: 2,
      maxDownloads: 1,
    });
    const behId = deelBeheerd.uit.koppeling.id as string;
    const behCode = deelBeheerd.uit.koppeling.code as string;

    const nogNietActief = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' });
    check(
      '6 actiefVanaf in de toekomst weigert toegang met 403 KOPPELING_NOG_NIET_ACTIEF',
      nogNietActief.status === 403 && nogNietActief.uit.error === 'KOPPELING_NOG_NIET_ACTIEF',
    );

    // Maak nu actief en hernoem de koppeling
    const geactiveerd = await roepDelen(delenA, 'bijwerken', {
      id: behId,
      naam: 'Активне посилання зі статистикою',
      actiefVanaf: null,
    });
    check('6 bijwerken wijzigt naam en haalt starttijd weg', geactiveerd.status === 200 && geactiveerd.uit.koppeling.naam === 'Активне посилання зі статистикою');

    const wwOntbreekt = await roepPubliek('info', { code: behCode });
    const wwFout = await roepPubliek('info', { code: behCode, wachtwoord: 'verkeerd' });
    const wwGoed1 = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' }, null, '203.0.113.10');
    const wwGoed2 = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' }, null, '203.0.113.11');
    const wwBovenLimiet = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' }, null, '203.0.113.12');
    check(
      '6 wachtwoord + maxWeergaven=2: zonder ww 401, fout ww 403, 2× 200 van 2 bezoekers, 3e keer 410 LIMIET_WEERGAVEN_BEREIKT',
      wwOntbreekt.status === 401
        && wwOntbreekt.uit.error === 'WACHTWOORD_VEREIST'
        && wwFout.status === 403
        && wwFout.uit.error === 'WACHTWOORD_ONJUIST'
        && wwGoed1.status === 200
        && wwGoed2.status === 200
        && wwBovenLimiet.status === 410
        && wwBovenLimiet.uit.error === 'LIMIET_WEERGAVEN_BEREIKT',
    );

    const dlGoed1 = await roepPubliek('download', { code: behCode, wachtwoord: 'Geheim-2026!' }, null, '203.0.113.10');
    const dlBovenLimiet = await roepPubliek('download', { code: behCode, wachtwoord: 'Geheim-2026!' }, null, '203.0.113.10');
    check(
      '6 maxDownloads=1: eerste download 200, tweede download 403 LIMIET_DOWNLOADS_BEREIKT',
      dlGoed1.status === 200 && dlBovenLimiet.status === 403 && dlBovenLimiet.uit.error === 'LIMIET_DOWNLOADS_BEREIKT',
    );

    // Pauzeren en verloopdatum testen
    await roepDelen(delenA, 'bijwerken', { id: behId, maxWeergaven: 10, gepauzeerd: true });
    const tijdensPauze = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' });
    check('6 gepauzeerde koppeling geeft 403 KOPPELING_GEPAUZEERD', tijdensPauze.status === 403 && tijdensPauze.uit.error === 'KOPPELING_GEPAUZEERD');

    await roepDelen(delenA, 'bijwerken', { id: behId, gepauzeerd: false, verlooptOp: new Date(Date.now() - 5000).toISOString() });
    const naVerloop = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' });
    check('6 verlopen koppeling geeft 410 KOPPELING_VERLOPEN', naVerloop.status === 410 && naVerloop.uit.error === 'KOPPELING_VERLOPEN');

    // Statistiek controleren
    const stat = await roepDelen(delenA, 'statistiek', { id: behId });
    check(
      '6 statistiek telt weergaven (2), downloads (1), unieke bezoekers (2), 14 dagen reeks en gebeurtenissenlogboek',
      stat.status === 200
        && stat.uit.koppeling.weergavenAantal === 2
        && stat.uit.koppeling.downloadsAantal === 1
        && stat.uit.koppeling.uniekeBezoekers === 2
        && Array.isArray(stat.uit.perDag)
        && stat.uit.perDag.length === 14
        && stat.uit.perDag.some((d: any) => d.weergaven >= 2 && d.downloads >= 1)
        && stat.uit.gebeurtenissen.some((g: any) => g.soort === 'weergave')
        && stat.uit.gebeurtenissen.some((g: any) => g.soort === 'download')
        && stat.uit.gebeurtenissen.some((g: any) => g.soort === 'geweigerd'),
    );

    // Isolatie: technische ruimte en vreemd account mogen deze koppeling niet zien of intrekken
    const techOverzicht = await roepDelen(delenA, 'overzicht', {}, tech);
    const vreemdeIntrek = await roepDelen(delenVreemde, 'intrekken', { id: behId }, vreemdeLade);
    check(
      '6 ruimte- en account-isolatie: technische lade ziet 0 privékoppelingen; ander account krijgt 404 bij intrekken',
      techOverzicht.status === 200
        && techOverzicht.uit.koppelingen.length === 0
        && vreemdeIntrek.status === 404
        && vreemdeIntrek.uit.error === 'KOPPELING_ONBEKEND',
    );

    // Onmiddellijk intrekken
    const ingetrokken = await roepDelen(delenA, 'intrekken', { id: behId });
    const naIntrekken = await roepPubliek('info', { code: behCode, wachtwoord: 'Geheim-2026!' });
    check(
      '6 intrekken maakt de koppeling onmiddellijk ongeldig (410 KOPPELING_INGETROKKEN)',
      ingetrokken.status === 200
        && ingetrokken.uit.koppeling.status === 'ingetrokken'
        && naIntrekken.status === 410
        && naIntrekken.uit.error === 'KOPPELING_INGETROKKEN',
    );
  } finally {
    const alleUsers = [eigenaar.id, ontvanger.id, vreemde.id];
    await pool.query('DELETE FROM app.cloud_deel_koppelingen WHERE user_id = ANY($1)', [alleUsers]).catch(() => undefined);
    await pool.query(
      `DELETE FROM app.records WHERE tbl IN ('cloud_items_v1','cloud_mappen_v1','cloud_workspaces_v1') AND data->>'ownerUserId' = ANY($1)`,
      [alleUsers],
    ).catch(() => undefined);
    for (const l of [prive, tech, ontvangerLade, vreemdeLade]) {
      await pool.query('DELETE FROM app.storage_objects WHERE path LIKE $1', [`${cloudVoorvoegsel(l)}/%`]).catch(() => undefined);
    }
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [alleUsers]).catch(() => undefined);
    rmSync(uploads, { recursive: true, force: true });
  }

  return einde();
}
