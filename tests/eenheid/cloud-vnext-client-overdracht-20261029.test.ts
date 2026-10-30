// CLOUD vNEXT — OVERDRACHTBEHEER aan de clientkant (29.10.2026, uitvoerder B2). GEDRAGStests tegen een nagebootst
// vervoer (geen browser, geen server): het contract staat in shared/cloud-overdracht-model.ts.
//   1. De incrementele SHA-256 klopt met node:crypto, ook bij rare stukgroottes.
//   2. Uploads: tot PARALLEL_STUKKEN stukken tegelijk (nooit meer), willekeurige volgorde, zachte herhalingen met de
//      afgesproken pauzes, «wacht op netwerk» na aanhoudende breuk en verdergaan daarna, pauze/verder/stop.
//   3. Hervatten na herladen: 'zoek' vindt de sessie en alleen de ONTBREKENDE stukken gaan nog over de lijn.
//   4. Download in delen: herhaald per deel, incrementele sha-controle, byte-voor-byte gelijk.
//   5. Preflight tegen de grenzen per dienst: eerlijk geblokkeerd mét bron en suggestie.
//   6. Bestandscontroles: de afgesproken data-cvn-ov-*-haken, het paneel, de taken-UI en de eerlijke teksten.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { HERVAT_PAUZE_MS, HERVAT_POGINGEN, PARALLEL_STUKKEN, OVERDRACHT_GRENZEN } from '../../shared/cloud-overdracht-model';
import { OverdrachtBeheer, Sha256Stroom, bronVanFile, preflightNaarDienst, shaVanBron, stukNaarB64, voorbijgaand, type OverdrachtBron, type Vervoer } from '../../src/cloud-vnext/overdracht-beheer';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const sha = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex');
const slaapje = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function tot(f: () => boolean, ms = 4000): Promise<boolean> {
  const t0 = Date.now();
  while (!f()) { if (Date.now() - t0 > ms) return false; await slaapje(4); }
  return true;
}
const bronVanBytes = (naam: string, data: Uint8Array, mime = 'application/octet-stream'): OverdrachtBron => ({
  naam, bytes: data.length, mime, lees: async (o, l) => data.slice(o, Math.min(o + l, data.length)).buffer as ArrayBuffer,
});

/** Nagebootste server: sessies met stukken op offset, telwerk, stuurbare mislukkingen en een optionele poort (gate). */
function nepServer(stukMax = 4) {
  const s = {
    stukMax,
    sessies: new Map<string, { naam: string; bytes: number; mapId: string | null; delen: Map<number, Uint8Array> }>(),
    telling: { begin: 0, stuk: 0, status: 0, zoek: 0, klaar: 0, afbreken: 0, deel: 0 },
    offsets: [] as number[],
    lopend: 0, maxLopend: 0,
    misluk: null as null | ((actie: string, offset?: number) => number | null), // → status-code of null
    poort: null as null | (() => Promise<void>),
    bestandBytes: new Uint8Array(0), bestandSha: '',
    nr: 0,
  };
  const fout = (code: string, status: number) => { throw Object.assign(new Error(code), { code, status }); };
  const ontvangen = (z: { bytes: number; delen: Map<number, Uint8Array> }) => [...z.delen.values()].reduce((a, d) => a + d.length, 0);
  const ontbreekt = (z: { bytes: number; delen: Map<number, Uint8Array> }) => {
    const n = Math.max(1, Math.ceil(z.bytes / s.stukMax)); const uit: number[] = [];
    for (let i = 0; i < n && uit.length < 64; i++) if (!z.delen.has(i)) uit.push(i);
    return uit;
  };
  const vervoer: Vervoer = {
    begin: async (naam, _mime, bytes, mapId) => {
      s.telling.begin++; const mis = s.misluk?.('begin'); if (mis) fout(mis >= 500 || mis === 0 ? 'NETWERK' : 'TE_GROOT', mis);
      const id = `s${++s.nr}`; s.sessies.set(id, { naam, bytes, mapId, delen: new Map() });
      return { id, stukMax: s.stukMax };
    },
    stuk: async (id, offset, data) => {
      s.telling.stuk++; s.lopend++; s.maxLopend = Math.max(s.maxLopend, s.lopend);
      try {
        if (s.poort) await s.poort(); else await slaapje(2);
        const mis = s.misluk?.('stuk', offset); if (mis !== null && mis !== undefined) fout('NETWERK', mis);
        const z = s.sessies.get(id); if (!z) fout('UPLOAD_ONBEKEND', 404);
        s.offsets.push(offset);
        z!.delen.set(Math.floor(offset / s.stukMax), Uint8Array.from(Buffer.from(data, 'base64')));
        return { ontvangen: ontvangen(z!) };
      } finally { s.lopend--; }
    },
    status: async (id) => {
      s.telling.status++; const z = s.sessies.get(id); if (!z) fout('UPLOAD_ONBEKEND', 404);
      return { id, naam: z!.naam, bytes: z!.bytes, stukMax: s.stukMax, ontvangen: ontvangen(z!), ontbreekt: ontbreekt(z!) };
    },
    zoek: async (naam, bytes, mapId) => {
      s.telling.zoek++;
      for (const [id, z] of s.sessies) if (z.naam === naam && z.bytes === bytes && (z.mapId ?? null) === (mapId ?? null)) return { sessie: { id, ontvangen: ontvangen(z) } };
      return { sessie: null };
    },
    klaar: async (id, beweerd) => {
      s.telling.klaar++; const z = s.sessies.get(id); if (!z) fout('UPLOAD_ONBEKEND', 404);
      const alles = new Uint8Array(z!.bytes); for (const [i, d] of z!.delen) alles.set(d, i * s.stukMax);
      if (sha(alles) !== beweerd) fout('SHA_MISMATCH', 422);
      s.sessies.delete(id);
      return { id: 'bestand-1', naam: z!.naam, bytes: z!.bytes, sha256: beweerd } as unknown as import('../../shared/cloud-vnext-model').CloudBestand;
    },
    afbreken: async (id) => { s.telling.afbreken++; s.sessies.delete(id); return { ok: true }; },
    downloadDeel: async ({ offset, lengte }) => {
      s.telling.deel++;
      const mis = s.misluk?.('deel', offset); if (mis !== null && mis !== undefined) fout('NETWERK', mis);
      const deel = s.bestandBytes.slice(offset, Math.min(offset + lengte, s.bestandBytes.length));
      return { naam: 'dl.bin', mime: 'application/octet-stream', bytes: s.bestandBytes.length, sha256: s.bestandSha, offset, data: Buffer.from(deel).toString('base64') };
    },
  };
  return { s, vervoer };
}
/** Beheerder met nagebootste tijd-/opslag-afhankelijkheden; de wachtlog legt de herhaalpauzes vast. */
function maakBeheer(vervoer: Vervoer, opties: { bewaard?: string } = {}) {
  const wachtLog: number[] = [];
  let opslag = opties.bewaard || '';
  const m = new OverdrachtBeheer({ vervoer, wacht: async (ms) => { wachtLog.push(ms); }, bewaar: (w) => { opslag = w; }, leesBewaard: () => opslag, venster: null });
  return { m, wachtLog, opslag: () => opslag };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-vnext-client-overdracht-20261029');

  // ---- 1. incrementele SHA-256 tegen node:crypto
  check('sha256: lege invoer', new Sha256Stroom().hex() === sha(Buffer.alloc(0)));
  check('sha256: "abc" (FIPS-vector)', new Sha256Stroom().voeg(new TextEncoder().encode('abc')).hex() === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const groot = randomBytes(100_003);
  check('sha256: 100 003 willekeurige bytes in één keer', new Sha256Stroom().voeg(groot).hex() === sha(groot));
  for (const stap of [1, 7, 64, 1000]) {
    const st = new Sha256Stroom();
    for (let o = 0; o < groot.length; o += stap) st.voeg(groot.subarray(o, Math.min(o + stap, groot.length)));
    check(`sha256: incrementeel met stapgrootte ${stap} geeft dezelfde uitkomst`, st.hex() === sha(groot));
  }
  const bron63 = bronVanBytes('p.bin', Uint8Array.from(randomBytes(63)));
  check('shaVanBron leest in stukken en klopt', (await shaVanBron(bron63, 16)) === sha(Buffer.from(await bron63.lees(0, 63))));
  check('stukNaarB64 is byte-getrouw', Buffer.from(stukNaarB64(Uint8Array.from(groot.subarray(0, 70000)).buffer as ArrayBuffer), 'base64').equals(groot.subarray(0, 70000)));

  // ---- 2. voorbijgaand of blijvend
  check('voorbijgaand: 0/408/429/502/503/504 en kale fouten wél', [0, 408, 429, 502, 503, 504].every((st) => voorbijgaand({ status: st })) && voorbijgaand(new Error('failed to fetch')));
  check('blijvend: 400/404/413/422/500/501 niet herhalen', [400, 404, 413, 422, 500, 501].every((st) => !voorbijgaand({ status: st })));

  // ---- 3. upload: gelukt, parallel begrensd, willekeurige volgorde, descriptor opgeruimd
  {
    const { s, vervoer } = nepServer(2);
    const { m, opslag } = maakBeheer(vervoer);
    const data = Uint8Array.from(randomBytes(24)); // 12 stukken van 2
    let klaarBestand = '';
    m.voegUploadToe(bronVanBytes('a.bin', data), null, (b) => { klaarBestand = b.naam; });
    check('upload: descriptor voor hervatten staat in de opslag zolang hij loopt', opslag().includes('a.bin'));
    check('upload van 12 stukken rondt af', await tot(() => m.stand().some((r) => r.staat === 'klaar')));
    const rij = m.stand()[0];
    check('upload: alle bytes geteld, onKlaar gevuurd, server-sha klopte', rij.klaarBytes === 24 && klaarBestand === 'a.bin' && s.telling.klaar === 1);
    check(`upload: nooit méér dan PARALLEL_STUKKEN (${PARALLEL_STUKKEN}) tegelijk, wél echt parallel`, s.maxLopend <= PARALLEL_STUKKEN && s.maxLopend >= 2, `max=${s.maxLopend}`);
    check('upload: alle 12 offsets zijn aangekomen (volgorde vrij)', new Set(s.offsets).size === 12);
    check('upload: descriptor is na afloop opgeruimd', opslag() === '');
    check('stand(): stabiel kiekje tussen wijzigingen door', m.stand() === m.stand());
    m.ruimOp();
    check('ruimOp: afgeronde rijen verdwijnen', m.stand().length === 0);
  }

  // ---- 4. zachte herhaling met de afgesproken pauzes
  {
    const { s, vervoer } = nepServer(4);
    const { m, wachtLog } = maakBeheer(vervoer);
    let nogMis = 2;
    s.misluk = (actie, offset) => (actie === 'stuk' && offset === 4 && nogMis-- > 0 ? 503 : null);
    m.voegUploadToe(bronVanBytes('b.bin', Uint8Array.from(randomBytes(10))), null);
    check('herhaling: de upload rondt ondanks twee 503’s af', await tot(() => m.stand().some((r) => r.staat === 'klaar')));
    check('herhaling: oplopende pauzes volgens HERVAT_PAUZE_MS', wachtLog[0] === HERVAT_PAUZE_MS[0] && wachtLog[1] === HERVAT_PAUZE_MS[1], wachtLog.join(','));
  }

  // ---- 5. blijvende fout stopt eerlijk
  {
    const { s, vervoer } = nepServer(4);
    const { m } = maakBeheer(vervoer);
    s.misluk = (actie) => (actie === 'begin' ? 413 : null);
    m.voegUploadToe(bronVanBytes('c.bin', Uint8Array.from(randomBytes(6))), null);
    check('blijvende fout (413) → staat fout, geen eindeloze herhaling', await tot(() => m.stand().some((r) => r.staat === 'fout')) && s.telling.begin === 1);
  }

  // ---- 6. aanhoudende netwerkbreuk → «wacht op netwerk», daarna verdergaan
  {
    const { s, vervoer } = nepServer(4);
    const { m, wachtLog } = maakBeheer(vervoer);
    let kapot = true;
    s.misluk = (actie) => (kapot && actie === 'stuk' ? 0 : null);
    const sleutel = m.voegUploadToe(bronVanBytes('d.bin', Uint8Array.from(randomBytes(6))), null);
    check('netwerkbreuk: na de zachte pogingen → wacht-netwerk', await tot(() => m.stand().some((r) => r.staat === 'wacht-netwerk')));
    check(`netwerkbreuk: er gingen ${HERVAT_POGINGEN - 1} pauzes aan vooraf`, wachtLog.length >= HERVAT_POGINGEN - 1);
    kapot = false;
    m.verder(sleutel);
    check('netwerk terug + «Продовжити» → de upload rondt af', await tot(() => m.stand().some((r) => r.staat === 'klaar')));
  }

  // ---- 7. pauze en verder; stoppen ruimt de serversessie op
  {
    const { s, vervoer } = nepServer(2);
    const { m, opslag } = maakBeheer(vervoer);
    let open: (() => void)[] = [];
    s.poort = () => new Promise<void>((r) => open.push(r));
    const sleutel = m.voegUploadToe(bronVanBytes('e.bin', Uint8Array.from(randomBytes(12))), null);
    await tot(() => s.lopend >= 1);
    m.pauzeer(sleutel);
    while (open.length) open.shift()!();
    await tot(() => m.stand().some((r) => r.staat === 'gepauzeerd'));
    const stukkenBijPauze = s.telling.stuk;
    await slaapje(40); while (open.length) open.shift()!();
    check('pauze: geen nieuwe stukken zolang de pauze duurt', s.telling.stuk === stukkenBijPauze && m.stand()[0].staat === 'gepauzeerd');
    s.poort = null;
    m.verder(sleutel);
    check('verder na pauze → klaar', await tot(() => m.stand().some((r) => r.staat === 'klaar')));

    // stoppen: nieuwe upload, meteen afbreken
    s.poort = () => new Promise<void>((r) => open.push(r));
    const s2 = m.voegUploadToe(bronVanBytes('f.bin', Uint8Array.from(randomBytes(8))), null);
    await tot(() => s.lopend >= 1);
    m.stop(s2);
    while (open.length) open.shift()!();
    check('stop: rij afgebroken, serversessie opgeruimd, descriptor weg', await tot(() => s.telling.afbreken >= 1) && m.stand().some((r) => r.staat === 'afgebroken') && !opslag().includes('f.bin'));
  }

  // ---- 8. hervatten na herladen: alleen de ontbrekende stukken
  {
    const { s, vervoer } = nepServer(4);
    const data = Uint8Array.from(randomBytes(10)); // stukken 0..2
    s.sessies.set('oud', { naam: 'h.bin', bytes: 10, mapId: null, delen: new Map([[0, data.slice(0, 4)], [2, data.slice(8, 10)]]) });
    const { m } = maakBeheer(vervoer, { bewaard: JSON.stringify([{ naam: 'h.bin', bytes: 10, mime: 'application/octet-stream', mapId: null }]) });
    const rij = m.stand()[0];
    check('na herladen: de rij staat als «hervatbaar» klaar', rij?.staat === 'hervatbaar' && rij.naam === 'h.bin');
    check('hervatten met een ANDER bestand wordt eerlijk geweigerd', m.hervatMet(rij.sleutel, new File([data.slice(0, 9)], 'h.bin')) === false && m.stand()[0].staat === 'hervatbaar');
    check('hervatten met hetzelfde bestand wordt aangenomen', m.hervatMet(rij.sleutel, new File([data], 'h.bin')) === true);
    check('hervat: afgerond zonder nieuwe begin-sessie', await tot(() => m.stand().some((r) => r.staat === 'klaar')) && s.telling.begin === 0 && s.telling.zoek === 1);
    check('hervat: alleen het ontbrekende stuk (offset 4) ging nog over de lijn', s.offsets.length === 1 && s.offsets[0] === 4, s.offsets.join(','));
  }

  // ---- 9. download in delen met herhaling en sha-controle
  {
    const { s, vervoer } = nepServer(4);
    const inhoud = Uint8Array.from(randomBytes(10));
    s.bestandBytes = inhoud; s.bestandSha = sha(inhoud);
    let eenKeer = true;
    s.misluk = (actie, offset) => (actie === 'deel' && offset === 4 && eenKeer ? ((eenKeer = false), 503) : null);
    const { m } = maakBeheer(vervoer);
    let blob: { bytes: Uint8Array; mime: string; naam: string } | null = null;
    m.voegDownloadToe({ id: 'x', naam: 'dl.bin', bytes: 10, deelBytes: 4 }, (b) => { blob = b; });
    check('download in delen rondt af ondanks één 503', await tot(() => Boolean(blob)));
    check('download: byte-voor-byte gelijk en 3+1 deel-aanroepen', Boolean(blob) && Buffer.from(blob!.bytes).equals(inhoud) && s.telling.deel === 4);
    const rij = m.stand().find((r) => r.soort === 'download');
    check('download: voortgang en eindtoestand kloppen', rij?.staat === 'klaar' && rij.klaarBytes === 10);
  }
  {
    const { s, vervoer } = nepServer(4);
    s.bestandBytes = Uint8Array.from(randomBytes(6)); s.bestandSha = 'f'.repeat(64);
    const { m } = maakBeheer(vervoer);
    m.voegDownloadToe({ id: 'x', naam: 'dl.bin', bytes: 6, deelBytes: 4 }, () => undefined);
    check('download: een foute controlesom wordt betrapt (SHA_MISMATCH)', await tot(() => m.stand().some((r) => r.staat === 'fout' && r.foutCode === 'SHA_MISMATCH')));
  }

  // ---- 10. preflight tegen de grenzen per dienst (met bron en suggestie)
  const zesMiB = 6 * 1024 * 1024;
  const vlucht = preflightNaarDienst('google-drive', zesMiB);
  check('preflight: 6 MiB naar Google Drive is eerlijk geblokkeerd', !vlucht.ok && vlucht.grens?.uploadMaxBytes === 5 * 1024 * 1024);
  check('preflight: de grens draagt haar BRON en een suggestie', Boolean(vlucht.grens?.bron[0].includes('Google') && vlucht.grens?.suggestie));
  check('preflight: 1 MiB naar Google Drive mag; eigen opslag kent geen verzonnen plafond', preflightNaarDienst('google-drive', 1024 * 1024).ok && preflightNaarDienst('eigen', 50 * 1024 ** 3).ok && OVERDRACHT_GRENZEN.eigen.uploadMaxBytes === null);
  check('bronVanFile: naam, grootte en stukken lezen kloppen', await (async () => { const f = new File([Uint8Array.from([1, 2, 3, 4, 5])], 'k.bin'); const b = bronVanFile(f); return b.naam === 'k.bin' && b.bytes === 5 && new Uint8Array(await b.lees(2, 2))[0] === 3; })());

  // ---- 11. bestandscontroles: paneel, haken, taken-UI, eerlijke teksten
  const beheerBron = lees('src/cloud-vnext/overdracht-beheer.ts');
  check('overdracht-beheer: kent cloud-client bewust niet (vervoer wordt geregistreerd)', !beheerBron.includes("from './cloud-client'") && beheerBron.includes('registreerVervoer'));
  check('overdracht-beheer: beforeunload-waarschuwing en online-luisteraar', beheerBron.includes("'beforeunload'") && beheerBron.includes("'online'"));
  const paneel = lees('src/cloud-vnext/UploadBeheer.tsx');
  for (const haak of ['data-cvn-ov-rij', 'data-cvn-ov-pauze', 'data-cvn-ov-verder', 'data-cvn-ov-stop', 'data-cvn-ov-hervat', 'data-cvn-ov-taak', 'data-cvn-ov-fout']) {
    check(`paneel: haak ${haak} aanwezig`, paneel.includes(haak) || lees('src/cloud-vnext/onderdelen/Bestanden.tsx').includes(haak));
  }
  check('paneel: kijkt mee via useSyncExternalStore op de singleton', paneel.includes('useSyncExternalStore') && paneel.includes('overdrachten()'));
  check('paneel: peilt de achtergrondtaken en toont uitleg + suggestie bij een fout', paneel.includes("taken({ actie: 'lijst' })") && paneel.includes('fout.uitleg') && paneel.includes('fout.suggestie'));
  const best = lees('src/cloud-vnext/onderdelen/Bestanden.tsx');
  check('Bestanden: контекстне «Надіслати в Google Drive…» met preflight-laag', best.includes('data-cvn-ov-drive') && best.includes("'cvn-ov-preflight'") && best.includes('preflightNaarDienst'));
  check('Bestanden: de geblokkeerde preflight noemt de BRON van de grens én de suggestie', best.includes('vlucht.grens.bron') && best.includes('vlucht.grens.suggestie'));
  check('Bestanden: grote downloads gaan in delen via het overdrachtbeheer', best.includes('voegDownloadToe') && best.includes('downloadMaxBytes'));
  const bronTsx = lees('src/cloud-vnext/onderdelen/Bron.tsx');
  check('Bron: «У мою хмару» maakt een achtergrondtaak (drive → eigen)', bronTsx.includes('data-cvn-ov-taak-nieuw') && bronTsx.includes("soort: 'kopie'") && bronTsx.includes("dienst: 'eigen'"));
  const vast = lees('src/cloud-vnext/onderdelen/Vastleggen.tsx');
  check('Vastleggen: de grens komt uit OVERDRACHT_GRENZEN (met bron), geen verzonnen plafond meer', vast.includes('OVERDRACHT_GRENZEN') && !vast.includes('uploadMaxBytes'));
  const client = lees('src/cloud-vnext/cloud-client.ts');
  check('cloud-client: registreert het echte vervoer en kent status/zoek/downloadDeel/taken', client.includes('registreerVervoer(vervoer)') && client.includes("actie: 'status'") && client.includes("actie: 'zoek'") && client.includes('downloadDeel') && client.includes('/api/owner/cloud/vnext/taken'));

  return einde();
}
