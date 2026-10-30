// ZOEKEN ETAPPE C — VEILIG ARCHIEVEN UITPAKKEN VOOR DE INDEX (zip, gzip, tar, tar.gz; genest).
//
// Alleen in het geheugen, nooit naar schijf: er is dus geen pad om «uit te breken», maar we weigeren zulke namen toch
// (ONVEILIG_PAD), zodat een kwaadaardig archief ook in de index niet als «../../etc/passwd» verschijnt.
// Grenzen (alle instelbaar, standaard hieronder): totale uitgepakte grootte, grootte per bestand, aantal bestanden,
// nestdiepte en compressieverhouding (zip-bom). Het uitpakken gebeurt STROMEND met fflate (al een afhankelijkheid van het
// project, zie package.json) in invoerbrokken van 4 KiB (≤ ~4 MiB uitvoer per brok): een bom wordt afgebroken zodra de teller over de grens gaat, niet pas
// nadat hij al in het geheugen staat. Opgegeven groottes in de zip-kop worden NIET vertrouwd.
import { Gunzip, Inflate } from 'fflate';

export type ArchiefGrenzen = {
  maxTotaalBytes: number;      // alle uitgepakte bytes samen, over alle niveaus
  maxBestandBytes: number;     // één bestand
  maxBestanden: number;        // aantal bestanden samen
  maxDiepte: number;           // 1 = alleen het archief zelf; 2 = een archief in een archief; ...
  maxVerhouding: number;       // uitgepakt / ingepakt per item (zip-bom)
};
export const STANDAARD_GRENZEN: ArchiefGrenzen = {
  maxTotaalBytes: 200 * 1024 * 1024, maxBestandBytes: 50 * 1024 * 1024, maxBestanden: 2000, maxDiepte: 3, maxVerhouding: 200,
};
export type ArchiefBestand = { pad: string; bytes: Uint8Array; diepte: number };
export type ArchiefProbleem = { code: 'ONVEILIG_PAD' | 'TE_GROOT_BESTAND' | 'TE_GROOT_TOTAAL' | 'TE_VEEL_BESTANDEN' | 'TE_DIEP' | 'ZIP_BOM' | 'VERSLEUTELD' | 'METHODE_ONBEKEND' | 'ZIP64' | 'BESCHADIGD' | 'GEEN_GEWOON_BESTAND'; pad: string };
export type ArchiefUitslag = { bestanden: ArchiefBestand[]; problemen: ArchiefProbleem[]; totaalBytes: number; afgebroken: boolean };
export type ArchiefSoort = 'zip' | 'gzip' | 'tar' | '';

class Grens extends Error { constructor(readonly code: ArchiefProbleem['code']) { super(code); } }

export function archiefSoort(b: Uint8Array, naam = ''): ArchiefSoort {
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) ) return 'zip';
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
  if (b.length >= 262 && String.fromCharCode(...b.subarray(257, 262)) === 'ustar') return 'tar';
  if (/\.tar$/i.test(naam) && b.length >= 512 && b.length % 512 === 0) return 'tar';
  return '';
}

/** Een veilige, genormaliseerde naam binnen het archief, of '' als hij niet veilig is. */
/**
 * Pakketbestanden die technisch een zip zijn maar inhoudelijk één document (Office/ODF/EPUB/JAR): die worden NIET als
 * genest archief uitgepakt — ze gaan als één bestand naar de tekstextractie (docx → tekst), of worden geweigerd (jar/apk).
 */
export const isPakketBestand = (naam: string) => /\.(docx|docm|dotx|xlsx|xlsm|xltx|pptx|ppsx|potx|odt|ods|odp|odg|epub|jar|apk|xpi|whl|ipa|war|ear|vsix|crx|nupkg|kmz|sketch)$/i.test(naam);

export function veiligPad(ruw: string): string {
  const naam = String(ruw || '');
  if (!naam || naam.length > 1000 || /[\u0000-\u001f]/.test(naam)) return '';
  if (naam.includes('\\')) return '';                       // Windows-scheiding: dubbelzinnig, weigeren
  if (naam.startsWith('/') || /^[A-Za-z]:/.test(naam)) return '';
  const delen = naam.split('/').filter((d) => d !== '' && d !== '.');
  if (!delen.length || delen.some((d) => d === '..')) return '';
  return delen.join('/');
}

type Teller = { totaal: number; bestanden: number; g: ArchiefGrenzen };

/** Stromend uitpakken met een harde bovengrens; gooit Grens zodra de grens overschreden wordt. */
function stroom(soort: 'inflate' | 'gunzip', invoer: Uint8Array, t: Teller): Uint8Array {
  const delen: Uint8Array[] = []; let lengte = 0; let klaar = false;
  const opvang = (brok: Uint8Array, laatste: boolean) => {
    lengte += brok.length; t.totaal += brok.length;
    if (lengte > t.g.maxBestandBytes) throw new Grens('TE_GROOT_BESTAND');
    if (t.totaal > t.g.maxTotaalBytes) throw new Grens('TE_GROOT_TOTAAL');
    if (lengte > 64 * 1024 && lengte / Math.max(1, invoer.length) > t.g.maxVerhouding) throw new Grens('ZIP_BOM');
    delen.push(brok); if (laatste) klaar = true;
  };
  const s = soort === 'inflate' ? new Inflate(opvang) : new Gunzip(opvang);
  // Kleine invoerbrokken: deflate haalt hoogstens ~1032:1, dus één brok van 4 KiB levert hoogstens ~4 MiB uitvoer vóór de
  // volgende controle. Zo blijft ook een bom binnen één brok begrensd in het geheugen.
  const BROK = 4 * 1024;
  try {
    for (let i = 0; i < invoer.length; i += BROK) s.push(invoer.subarray(i, Math.min(invoer.length, i + BROK)), i + BROK >= invoer.length);
    if (!invoer.length) s.push(new Uint8Array(0), true);
  } catch (e) { if (e instanceof Grens) throw e; throw new Grens('BESCHADIGD'); }
  if (!klaar && soort === 'inflate') throw new Grens('BESCHADIGD');
  const uit = new Uint8Array(lengte); let o = 0; for (const d of delen) { uit.set(d, o); o += d.length; }
  return uit;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = new TextDecoder('utf-8', { fatal: false });

type Item = { naam: string; lees: () => Uint8Array; map: boolean; gewoon: boolean };

function zipItems(b: Uint8Array, t: Teller): Item[] {
  // End of central directory: laatste 64 KiB + 22 doorzoeken.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Grens('BESCHADIGD');
  const aantal = u16(b, eocd + 10), cdOff = u32(b, eocd + 16);
  // zip64 (meer dan 65535 items of > 4 GiB): bewust niet ondersteund — eerlijk melden, nooit gokken op de 32-bits velden.
  if (aantal === 0xffff || cdOff === 0xffffffff || u32(b, eocd + 12) === 0xffffffff) throw new Grens('ZIP64');
  for (let i = eocd - 20; i >= Math.max(0, eocd - 20 - 4); i--) if (u32(b, i) === 0x07064b50) throw new Grens('ZIP64'); // zip64 end-of-central-directory locator
  const items: Item[] = []; let p = cdOff;
  for (let n = 0; n < aantal; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new Grens('BESCHADIGD');
    const vlag = u16(b, p + 8), methode = u16(b, p + 10), ingepakt = u32(b, p + 20);
    const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lokaal = u32(b, p + 42);
    const externeAttr = u32(b, p + 38);
    const naam = utf8.decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    const map = naam.endsWith('/');
    const symlink = ((externeAttr >>> 16) & 0o170000) === 0o120000;
    items.push({
      naam, map, gewoon: !symlink,
      lees: () => {
        if (vlag & 1) throw new Grens('VERSLEUTELD');
        if (lokaal + 30 > b.length || u32(b, lokaal) !== 0x04034b50) throw new Grens('BESCHADIGD');
        const start = lokaal + 30 + u16(b, lokaal + 26) + u16(b, lokaal + 28);
        if (start + ingepakt > b.length) throw new Grens('BESCHADIGD');
        const data = b.subarray(start, start + ingepakt);
        if (methode === 0) {
          t.totaal += data.length;
          if (data.length > t.g.maxBestandBytes) throw new Grens('TE_GROOT_BESTAND');
          if (t.totaal > t.g.maxTotaalBytes) throw new Grens('TE_GROOT_TOTAAL');
          return data.slice();
        }
        if (methode === 8) return stroom('inflate', data, t);
        throw new Grens('METHODE_ONBEKEND');
      },
    });
  }
  return items;
}

function tarItems(b: Uint8Array, t: Teller): Item[] {
  const items: Item[] = []; let p = 0; let langeNaam = '';
  const cstr = (s: Uint8Array) => { const i = s.indexOf(0); return utf8.decode(i < 0 ? s : s.subarray(0, i)); };
  while (p + 512 <= b.length) {
    const kop = b.subarray(p, p + 512);
    if (kop.every((x) => x === 0)) break;
    const grootte = parseInt(cstr(kop.subarray(124, 136)).trim() || '0', 8);
    if (!Number.isFinite(grootte) || grootte < 0) throw new Grens('BESCHADIGD');
    const type = String.fromCharCode(kop[156] || 0x30);
    const prefix = cstr(kop.subarray(345, 500));
    const naam = langeNaam || (prefix ? `${prefix}/${cstr(kop.subarray(0, 100))}` : cstr(kop.subarray(0, 100)));
    const dataStart = p + 512; p = dataStart + Math.ceil(grootte / 512) * 512;
    if (dataStart + grootte > b.length) throw new Grens('BESCHADIGD');
    langeNaam = '';
    if (type === 'L') { langeNaam = cstr(b.subarray(dataStart, dataStart + grootte)); continue; }   // GNU lange naam
    if (type === 'x' || type === 'g') {                                                            // pax: alleen path
      const m = /\d+ path=([^\n]*)\n/.exec(utf8.decode(b.subarray(dataStart, dataStart + grootte))); if (m) langeNaam = m[1];
      continue;
    }
    const gewoon = type === '0' || type === '\0' || type === '7';
    items.push({ naam, map: type === '5', gewoon, lees: () => {
      t.totaal += grootte;
      if (grootte > t.g.maxBestandBytes) throw new Grens('TE_GROOT_BESTAND');
      if (t.totaal > t.g.maxTotaalBytes) throw new Grens('TE_GROOT_TOTAAL');
      return b.slice(dataStart, dataStart + grootte);
    } });
  }
  return items;
}

/**
 * Pakt een archief (en archieven daarin, tot maxDiepte) veilig uit. Geeft de gewone bestanden terug met een veilig pad
 * ("buiten.zip/binnen.tar/map/a.pdf") en een lijst problemen. Overschrijding van een TOTAAL-grens breekt alles af
 * (afgebroken = true); een probleem met één item slaat alleen dat item over.
 */
export function archiefUitpakken(invoer: Uint8Array, naam = 'archief', grenzen: Partial<ArchiefGrenzen> = {}): ArchiefUitslag {
  const g = { ...STANDAARD_GRENZEN, ...grenzen };
  const t: Teller = { totaal: 0, bestanden: 0, g };
  const uit: ArchiefUitslag = { bestanden: [], problemen: [], totaalBytes: 0, afgebroken: false };
  const totaalGrens = new Set(['TE_GROOT_TOTAAL', 'TE_VEEL_BESTANDEN']);

  const verwerk = (b: Uint8Array, padVoor: string, diepte: number) => {
    if (diepte > g.maxDiepte) { uit.problemen.push({ code: 'TE_DIEP', pad: padVoor }); return; }
    let soort = archiefSoort(b, padVoor);
    if (soort === 'gzip') {
      const binnen = stroom('gunzip', b, t);
      const binnenNaam = padVoor.replace(/\.(t?gz|gzip)$/i, (m) => (m.toLowerCase() === '.tgz' ? '.tar' : ''));
      if (archiefSoort(binnen, binnenNaam)) { verwerk(binnen, binnenNaam, diepte + 1); return; }
      voegToe(binnen, binnenNaam || `${padVoor}.uit`, diepte); return;
    }
    const items = soort === 'zip' ? zipItems(b, t) : soort === 'tar' ? tarItems(b, t) : [];
    for (const item of items) {
      if (item.map) continue;
      const veilig = veiligPad(item.naam);
      const vol = veilig ? `${padVoor}/${veilig}` : `${padVoor}/?`;
      if (!veilig) { uit.problemen.push({ code: 'ONVEILIG_PAD', pad: `${padVoor}/${item.naam.slice(0, 200)}` }); continue; }
      if (!item.gewoon) { uit.problemen.push({ code: 'GEEN_GEWOON_BESTAND', pad: vol }); continue; }
      let bytes: Uint8Array;
      try { bytes = item.lees(); }
      catch (e) { if (e instanceof Grens) { if (totaalGrens.has(e.code)) throw e; uit.problemen.push({ code: e.code, pad: vol }); continue; } throw e; }
      if (archiefSoort(bytes, vol) && !isPakketBestand(veilig)) {
        if (diepte + 1 > g.maxDiepte) { uit.problemen.push({ code: 'TE_DIEP', pad: vol }); continue; }
        try { verwerk(bytes, vol, diepte + 1); }
        catch (e) { if (e instanceof Grens) { if (totaalGrens.has(e.code)) throw e; uit.problemen.push({ code: e.code, pad: vol }); continue; } throw e; }
        continue;
      }
      voegToe(bytes, vol, diepte);
    }
  };
  const voegToe = (bytes: Uint8Array, pad: string, diepte: number) => {
    t.bestanden += 1;
    if (t.bestanden > g.maxBestanden) throw new Grens('TE_VEEL_BESTANDEN');
    uit.bestanden.push({ pad, bytes, diepte });
  };

  const basis = veiligPad(naam.split('/').pop() || '') || 'archief';
  try {
    if (!archiefSoort(invoer, basis)) { uit.problemen.push({ code: 'METHODE_ONBEKEND', pad: basis }); return uit; }
    verwerk(invoer, basis, 1);
  } catch (e) {
    if (!(e instanceof Grens)) throw e;
    uit.problemen.push({ code: e.code, pad: basis }); uit.afgebroken = true;
    if (totaalGrens.has(e.code)) uit.bestanden = [];          // niets half indexeren bij een bom
  }
  uit.totaalBytes = t.totaal;
  return uit;
}
