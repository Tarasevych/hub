import { strToU8, unzipSync, zipSync } from 'fflate';

export type RekenbladBlad = { name: string; rows: string[][] };
export type DatabankTabel = { name: string; columns: string[]; rows: string[][] };

export const REKENBLAD_MAX_BLADEN = 24;
export const REKENBLAD_MAX_RIJEN = 3000;
export const REKENBLAD_MAX_KOLOMMEN = 256;
const MAX_ARCHIEF_BYTES = 24 * 1024 * 1024;
const MAX_DEEL_BYTES = 24 * 1024 * 1024;
const MAX_UITGEPAKT_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_DELEN = 2000;
const MAX_XML_TEKENS = 24 * 1024 * 1024;
const MAX_XML_DIEPTE = 256;
const MAX_XML_KNOPEN = 1_500_000;

export type XmlKnoop = {
  naam: string;
  lokaal: string;
  attrs: Record<string, string>;
  tekst: string;
  kinderen: XmlKnoop[];
};

const controleerAfgebroken = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};

const schoonCel = (waarde: unknown): string =>
  String(waarde ?? '')
    .replace(/\u0000/g, '')
    .trim();

const schoonXmlTekst = (waarde: string): string =>
  String(waarde ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');

const escXml = (waarde: string): string => {
  const tekst = schoonXmlTekst(waarde);
  let uit = '';
  for (let i = 0; i < tekst.length; i += 1) {
    const ch = tekst[i];
    if (ch === '&') uit += '&amp;';
    else if (ch === '<') uit += '&lt;';
    else if (ch === '>') uit += '&gt;';
    else if (ch === '"') uit += '&quot;';
    else if (ch === "'") uit += '&apos;';
    else uit += ch;
  }
  return uit;
};

export const decodeerTekstBytes = (bytes: Uint8Array): string => {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const kopie = bytes.slice(2);
    for (let i = 0; i + 1 < kopie.length; i += 2) {
      const tmp = kopie[i];
      kopie[i] = kopie[i + 1];
      kopie[i + 1] = tmp;
    }
    return new TextDecoder('utf-16le', { fatal: false }).decode(kopie);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3));
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};

// Захист від XXE та небезпечних DTD-оголошень перед передачею до DOMParser або внутрішнього розбирача.
export const bereidVeiligeXml = (bron: string): string => {
  if (bron.length > MAX_XML_TEKENS) throw new Error('SHEET_XML_TOO_LARGE');
  if (/<!ENTITY\b/i.test(bron)) throw new Error('SHEET_XML_UNSAFE_ENTITY');
  const schoon = bron
    .replace(/<!DOCTYPE[\s\S]*?\[[\s\S]*?\]\s*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(schoon)) throw new Error('SHEET_XML_UNSAFE_ENTITY');
  return schoon;
};

const ontcijferXmlEntiteiten = (tekst: string): string =>
  tekst.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z_][\w.-]*);/g, (_vol, ref: string) => {
    if (ref === 'amp') return '&';
    if (ref === 'lt') return '<';
    if (ref === 'gt') return '>';
    if (ref === 'quot') return '"';
    if (ref === 'apos') return "'";
    if (ref.startsWith('#x') || ref.startsWith('#X')) {
      const code = Number.parseInt(ref.slice(2), 16);
      if (Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      throw new Error('SHEET_XML_INVALID');
    }
    if (ref.startsWith('#')) {
      const code = Number.parseInt(ref.slice(1), 10);
      if (Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      throw new Error('SHEET_XML_INVALID');
    }
    // Невідома зовнішня або користувацька сутність заборонена (еквівалент parsererror при XXE).
    throw new Error('SHEET_XML_UNSAFE_ENTITY');
  });

const ontleedAttributen = (bron: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  let i = 0;
  const len = bron.length;
  while (i < len) {
    while (i < len && /\s/.test(bron[i])) i += 1;
    if (i >= len) break;
    const naamStart = i;
    while (i < len && !/[\s=/>]/.test(bron[i])) i += 1;
    const naam = bron.slice(naamStart, i);
    while (i < len && /\s/.test(bron[i])) i += 1;
    if (!naam) {
      i += 1;
      continue;
    }
    if (bron[i] !== '=') {
      attrs[naam] = '';
      continue;
    }
    i += 1;
    while (i < len && /\s/.test(bron[i])) i += 1;
    const quote = bron[i];
    if (quote === '"' || quote === "'") {
      i += 1;
      const valStart = i;
      while (i < len && bron[i] !== quote) i += 1;
      attrs[naam] = ontcijferXmlEntiteiten(bron.slice(valStart, i));
      if (bron[i] === quote) i += 1;
    } else {
      const valStart = i;
      while (i < len && !/\s/.test(bron[i])) i += 1;
      attrs[naam] = ontcijferXmlEntiteiten(bron.slice(valStart, i));
    }
  }
  return attrs;
};

// Чистий синтаксичний XML-розбирач для середовищ без DOMParser (наприклад, модульні тести в Node.js).
const parseXmlNaarKnoop = (bron: string): XmlKnoop => {
  const stapel: XmlKnoop[] = [];
  let wortel: XmlKnoop | null = null;
  let knopen = 0;
  let pos = 0;
  const len = bron.length;

  const voegTekstToe = (waarde: string) => {
    if (!stapel.length || !waarde) return;
    stapel[stapel.length - 1].tekst += waarde;
  };

  while (pos < len) {
    const lt = bron.indexOf('<', pos);
    if (lt < 0) {
      voegTekstToe(ontcijferXmlEntiteiten(bron.slice(pos)));
      break;
    }
    if (lt > pos) {
      voegTekstToe(ontcijferXmlEntiteiten(bron.slice(pos, lt)));
    }

    if (bron.startsWith('<!--', lt)) {
      const end = bron.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('SHEET_XML_INVALID');
      pos = end + 3;
      continue;
    }
    if (bron.startsWith('<![CDATA[', lt)) {
      const end = bron.indexOf(']]>', lt + 9);
      if (end < 0) throw new Error('SHEET_XML_INVALID');
      voegTekstToe(bron.slice(lt + 9, end));
      pos = end + 3;
      continue;
    }
    if (bron.startsWith('<?', lt)) {
      const end = bron.indexOf('?>', lt + 2);
      if (end < 0) throw new Error('SHEET_XML_INVALID');
      pos = end + 2;
      continue;
    }
    if (bron.startsWith('<!', lt)) {
      throw new Error('SHEET_XML_UNSAFE_ENTITY');
    }

    // Пошук кінця тега поза межами лапок атрибутів.
    let i = lt + 1;
    let quote = '';
    while (i < len) {
      const ch = bron[i];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      i += 1;
    }
    if (i >= len || bron[i] !== '>') throw new Error('SHEET_XML_INVALID');

    const binnen = bron.slice(lt + 1, i).trim();
    pos = i + 1;
    if (!binnen) throw new Error('SHEET_XML_INVALID');

    if (binnen.startsWith('/')) {
      const sluitNaam = binnen.slice(1).trim();
      const top = stapel.pop();
      if (!top || top.naam !== sluitNaam) throw new Error('SHEET_XML_INVALID');
      if (stapel.length) {
        stapel[stapel.length - 1].tekst += top.tekst;
      }
      continue;
    }

    const zelfsluitend = binnen.endsWith('/');
    const kop = (zelfsluitend ? binnen.slice(0, -1) : binnen).trim();
    const spatie = kop.search(/\s/);
    const naam = spatie >= 0 ? kop.slice(0, spatie) : kop;
    if (!naam) throw new Error('SHEET_XML_INVALID');
    const lokaal = (naam.includes(':') ? naam.slice(naam.indexOf(':') + 1) : naam).toLowerCase();
    const attrTekst = spatie >= 0 ? kop.slice(spatie + 1) : '';

    knopen += 1;
    if (knopen > MAX_XML_KNOPEN || stapel.length >= MAX_XML_DIEPTE) {
      throw new Error('SHEET_XML_LIMIT');
    }

    const knoop: XmlKnoop = {
      naam,
      lokaal,
      attrs: attrTekst ? ontleedAttributen(attrTekst) : {},
      tekst: '',
      kinderen: [],
    };
    if (stapel.length) {
      stapel[stapel.length - 1].kinderen.push(knoop);
    } else {
      wortel = knoop;
    }
    if (!zelfsluitend) {
      stapel.push(knoop);
    }
  }

  if (stapel.length || !wortel) throw new Error('SHEET_XML_INVALID');
  return wortel;
};

const domNaarKnoop = (el: Element): XmlKnoop => {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    attrs[attr.name] = attr.value;
  }
  const kinderen: XmlKnoop[] = [];
  for (const child of Array.from(el.children)) {
    kinderen.push(domNaarKnoop(child));
  }
  const lokaal = (el.localName || el.nodeName.split(':').pop() || '').toLowerCase();
  return {
    naam: el.nodeName,
    lokaal,
    attrs,
    tekst: el.textContent || '',
    kinderen,
  };
};

export const ontleedXml = (bron: string): XmlKnoop => {
  const veilig = bereidVeiligeXml(bron);
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(veilig, 'application/xml');
    if (doc.querySelector('parsererror') || !doc.documentElement) {
      throw new Error('SHEET_XML_INVALID');
    }
    return domNaarKnoop(doc.documentElement);
  }
  return parseXmlNaarKnoop(veilig);
};

const knoopAttr = (knoop: XmlKnoop, sleutel: string): string => {
  if (sleutel in knoop.attrs) return knoop.attrs[sleutel];
  const lager = sleutel.toLowerCase();
  for (const [k, v] of Object.entries(knoop.attrs)) {
    const lokaal = (k.includes(':') ? k.slice(k.indexOf(':') + 1) : k).toLowerCase();
    if (lokaal === lager || k.toLowerCase() === lager) return v;
  }
  return '';
};

const vindAlle = (wortel: XmlKnoop, lokaalNaam: string, uit: XmlKnoop[] = []): XmlKnoop[] => {
  if (wortel.lokaal === lokaalNaam) uit.push(wortel);
  for (const kind of wortel.kinderen) vindAlle(kind, lokaalNaam, uit);
  return uit;
};

const normaliseerZipPad = (pad: string): string => {
  const schoon = pad.replace(/\\/g, '/').replace(/^\/+/, '');
  const delen: string[] = [];
  for (const deel of schoon.split('/')) {
    if (!deel || deel === '.') continue;
    if (deel === '..') {
      if (!delen.length) return '';
      delen.pop();
    } else {
      delen.push(deel);
    }
  }
  return delen.join('/');
};

const pakZipVeiligUit = (
  bytes: Uint8Array,
  kiesPad: (pad: string) => boolean,
  signal?: AbortSignal,
): Map<string, Uint8Array> => {
  controleerAfgebroken(signal);
  if (bytes.byteLength > MAX_ARCHIEF_BYTES) throw new Error('SHEET_TOO_LARGE');
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('SHEET_PACKAGE_SIGNATURE');
  }

  let aantal = 0;
  let totaalSchatting = 0;
  const inhoud = unzipSync(bytes, {
    filter: (info) => {
      aantal += 1;
      if (aantal > MAX_ZIP_DELEN) throw new Error('SHEET_PACKAGE_ENTRY_LIMIT');
      if (/[\u0000-\u001f]/.test(info.name) || info.name.includes('..')) {
        return false;
      }
      const pad = normaliseerZipPad(info.name);
      if (!pad || !kiesPad(pad)) return false;
      if (info.originalSize > MAX_DEEL_BYTES) throw new Error('SHEET_PACKAGE_ENTRY_LIMIT');
      totaalSchatting += info.originalSize;
      if (totaalSchatting > MAX_UITGEPAKT_BYTES) throw new Error('SHEET_PACKAGE_EXPANDED_LIMIT');
      return true;
    },
  });

  controleerAfgebroken(signal);
  const resultaat = new Map<string, Uint8Array>();
  let werkelijkTotaal = 0;
  for (const [naam, deel] of Object.entries(inhoud)) {
    if (deel.byteLength > MAX_DEEL_BYTES) throw new Error('SHEET_PACKAGE_ENTRY_LIMIT');
    werkelijkTotaal += deel.byteLength;
    if (werkelijkTotaal > MAX_UITGEPAKT_BYTES) throw new Error('SHEET_PACKAGE_EXPANDED_LIMIT');
    const norm = normaliseerZipPad(naam);
    if (norm) resultaat.set(norm, deel);
  }
  return resultaat;
};

const leesTekstZonderFonetisch = (knoop: XmlKnoop): string => {
  if (knoop.lokaal === 'rph' || knoop.lokaal === 'phoneticpr') return '';
  if (knoop.lokaal === 't') return knoop.tekst;
  if (!knoop.kinderen.length) return '';
  let som = '';
  for (const kind of knoop.kinderen) som += leesTekstZonderFonetisch(kind);
  return som;
};

const kolomIndexVanRef = (ref: string): number => {
  const match = ref.match(/^([A-Za-z]{1,4})\d+$/);
  if (!match) return -1;
  let col = 0;
  const letters = match[1].toUpperCase();
  for (let i = 0; i < letters.length; i += 1) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
};

const rijIndexVanRef = (ref: string): number => {
  const match = ref.match(/^[A-Za-z]{1,4}(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
};

const leesXlsxRelaties = (relsTekst: string): Map<string, string> => {
  const kaart = new Map<string, string>();
  if (!relsTekst) return kaart;
  const boom = ontleedXml(relsTekst);
  for (const rel of vindAlle(boom, 'relationship')) {
    const id = knoopAttr(rel, 'Id');
    const target = knoopAttr(rel, 'Target');
    const mode = knoopAttr(rel, 'TargetMode').toLowerCase();
    if (!id || !target || mode === 'external' || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const schoon = target.replace(/\\/g, '/');
    const doel = schoon.startsWith('/') ? normaliseerZipPad(schoon.slice(1)) : normaliseerZipPad(`xl/${schoon}`);
    if (doel) kaart.set(id, doel);
  }
  return kaart;
};

export const leesXlsx = (bytes: Uint8Array, signal?: AbortSignal): RekenbladBlad[] => {
  const bestanden = pakZipVeiligUit(
    bytes,
    (pad) => {
      const lager = pad.toLowerCase();
      return (
        lager === 'xl/workbook.xml' ||
        lager === 'xl/_rels/workbook.xml.rels' ||
        lager === 'xl/sharedstrings.xml' ||
        (lager.startsWith('xl/worksheets/') && lager.endsWith('.xml'))
      );
    },
    signal,
  );

  const vindBestand = (doel: string): Uint8Array | undefined => {
    const direct = bestanden.get(doel);
    if (direct) return direct;
    const lager = doel.toLowerCase();
    for (const [k, v] of bestanden) {
      if (k.toLowerCase() === lager) return v;
    }
    return undefined;
  };

  // 1. Gedeelde tekenreeksen (sharedStrings.xml).
  const sst: string[] = [];
  const sstBytes = vindBestand('xl/sharedStrings.xml');
  if (sstBytes) {
    controleerAfgebroken(signal);
    const sstBoom = ontleedXml(decodeerTekstBytes(sstBytes));
    for (const si of vindAlle(sstBoom, 'si')) {
      sst.push(leesTekstZonderFonetisch(si));
    }
  }

  // 2. Werkbladnamen en paden via workbook.xml + workbook.xml.rels.
  const relsBytes = vindBestand('xl/_rels/workbook.xml.rels');
  const relKaart = relsBytes ? leesXlsxRelaties(decodeerTekstBytes(relsBytes)) : new Map<string, string>();
  const bladLijst: Array<{ naam: string; pad: string }> = [];
  const wbBytes = vindBestand('xl/workbook.xml');
  if (wbBytes) {
    const wbBoom = ontleedXml(decodeerTekstBytes(wbBytes));
    for (const sheetEl of vindAlle(wbBoom, 'sheet')) {
      if (bladLijst.length >= REKENBLAD_MAX_BLADEN) break;
      const naam = knoopAttr(sheetEl, 'name') || `Аркуш ${bladLijst.length + 1}`;
      const rid = knoopAttr(sheetEl, 'id');
      const doel = rid ? relKaart.get(rid) : undefined;
      if (doel && vindBestand(doel)) {
        bladLijst.push({ naam, pad: doel });
      }
    }
  }

  if (!bladLijst.length) {
    const paden = [...bestanden.keys()]
      .filter((p) => /^xl\/worksheets\/[^/]+\.xml$/i.test(p))
      .sort((a, b) => {
        const na = Number(a.match(/(\d+)\.xml$/i)?.[1] || 0);
        const nb = Number(b.match(/(\d+)\.xml$/i)?.[1] || 0);
        return na - nb || a.localeCompare(b);
      })
      .slice(0, REKENBLAD_MAX_BLADEN);
    for (const [idx, pad] of paden.entries()) {
      bladLijst.push({ naam: `Аркуш ${idx + 1}`, pad });
    }
  }

  const bladen: RekenbladBlad[] = [];
  for (const { naam, pad } of bladLijst) {
    controleerAfgebroken(signal);
    const xmlBytes = vindBestand(pad);
    if (!xmlBytes) continue;
    const boom = ontleedXml(decodeerTekstBytes(xmlBytes));
    const rijen: string[][] = [];
    for (const rowEl of vindAlle(boom, 'row')) {
      if (rijen.length >= REKENBLAD_MAX_RIJEN) break;
      const rAttr = Number.parseInt(knoopAttr(rowEl, 'r'), 10);
      const eersteCel = rowEl.kinderen.find((k) => k.lokaal === 'c');
      const refRijNr = !Number.isInteger(rAttr) && eersteCel ? rijIndexVanRef(knoopAttr(eersteCel, 'r')) : 0;
      const rijNr = Number.isInteger(rAttr) && rAttr >= 1 ? rAttr : refRijNr;
      const rijDoel = rijNr >= 1 ? rijNr - 1 : rijen.length;
      if (rijDoel >= REKENBLAD_MAX_RIJEN) continue;
      while (rijen.length < rijDoel) rijen.push([]);

      const rij: string[] = [];
      let volgendeKol = 0;
      for (const celEl of rowEl.kinderen) {
        if (celEl.lokaal !== 'c') continue;
        const ref = knoopAttr(celEl, 'r');
        const colVanRef = ref ? kolomIndexVanRef(ref) : -1;
        const col = colVanRef >= 0 ? colVanRef : volgendeKol;
        volgendeKol = col + 1;
        if (col < 0 || col >= REKENBLAD_MAX_KOLOMMEN) continue;

        const type = knoopAttr(celEl, 't');
        let waarde = '';
        if (type === 'inlineStr') {
          const isEl = celEl.kinderen.find((k) => k.lokaal === 'is');
          waarde = isEl ? leesTekstZonderFonetisch(isEl) : leesTekstZonderFonetisch(celEl);
        } else {
          const vEl = celEl.kinderen.find((k) => k.lokaal === 'v');
          const ruw = vEl ? vEl.tekst : '';
          if (type === 's') {
            const idx = Number.parseInt(ruw, 10);
            waarde = Number.isInteger(idx) && idx >= 0 && idx < sst.length ? sst[idx] : '';
          } else if (type === 'b') {
            waarde = ruw === '1' || ruw.toLowerCase() === 'true' ? 'TRUE' : ruw === '0' || ruw.toLowerCase() === 'false' ? 'FALSE' : ruw;
          } else {
            waarde = ruw;
          }
        }

        while (rij.length <= col) rij.push('');
        rij[col] = schoonCel(waarde);
      }

      rijen.push(rij);
    }
    bladen.push({ name: naam, rows: rijen });
  }

  if (!bladen.length) throw new Error('XLSX_NO_SHEETS');
  return bladen;
};

const kolomNaam = (index: number): string => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const schoonBladNaam = (naam: string): string => {
  const basis = schoonXmlTekst(String(naam || 'Sheet1'))
    .replace(/[\[\]\*\?\/\\:]/g, ' ')
    .trim()
    .slice(0, 31);
  return basis || 'Sheet1';
};

export const schrijfXlsx = (sheet: RekenbladBlad): Uint8Array<ArrayBuffer> => {
  const bladNaam = schoonBladNaam(sheet.name);
  const rijenXml: string[] = [];
  const begrensdRijen = sheet.rows.slice(0, REKENBLAD_MAX_RIJEN);
  for (let r = 0; r < begrensdRijen.length; r += 1) {
    const rij = begrensdRijen[r] || [];
    const cellenXml: string[] = [];
    const maxCol = Math.min(rij.length, REKENBLAD_MAX_KOLOMMEN);
    for (let c = 0; c < maxCol; c += 1) {
      const val = schoonXmlTekst(String(rij[c] ?? ''));
      if (!val) continue;
      const ref = `${kolomNaam(c)}${r + 1}`;
      cellenXml.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(val)}</t></is></c>`);
    }
    if (cellenXml.length) {
      rijenXml.push(`<row r="${r + 1}">${cellenXml.join('')}</row>`);
    }
  }

  // Стандартні фіксовані ідентифікатори просторів імен OOXML (ECMA-376); не є мережевими викликами.
  const ooxmlSchema = 'http://schemas.openxmlformats.org'; // DevSkim: ignore DS137138

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Types xmlns="${ooxmlSchema}/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="${ooxmlSchema}/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${ooxmlSchema}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    '</Relationships>';

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<workbook xmlns="${ooxmlSchema}/spreadsheetml/2006/main" xmlns:r="${ooxmlSchema}/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escXml(bladNaam)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="${ooxmlSchema}/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${ooxmlSchema}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${ooxmlSchema}/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<styleSheet xmlns="${ooxmlSchema}/spreadsheetml/2006/main">` +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
    '</styleSheet>';

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<worksheet xmlns="${ooxmlSchema}/spreadsheetml/2006/main">` +
    `<sheetData>${rijenXml.join('')}</sheetData>` +
    '</worksheet>';

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(styles),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  });
};

const odfHerhaalAantal = (knoop: XmlKnoop, sleutel: string): number => {
  const raw = Number.parseInt(knoopAttr(knoop, sleutel), 10);
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return Math.min(raw, REKENBLAD_MAX_RIJEN);
};

const leesOdfCelTekst = (cel: XmlKnoop): string => {
  const paras = cel.kinderen.filter((k) => k.lokaal === 'p').map((p) => p.tekst);
  if (paras.length) return schoonCel(paras.join('\n'));
  if (cel.tekst.trim()) return schoonCel(cel.tekst);
  const attrWaarde = knoopAttr(cel, 'value') || knoopAttr(cel, 'date-value') || knoopAttr(cel, 'boolean-value');
  return schoonCel(attrWaarde);
};

export const leesOdfXml = (tekst: string, label: string, signal?: AbortSignal): RekenbladBlad[] => {
  controleerAfgebroken(signal);
  const boom = ontleedXml(tekst);
  const tabellen = vindAlle(boom, 'table').slice(0, REKENBLAD_MAX_BLADEN);
  const bladen: RekenbladBlad[] = [];

  for (const tabel of tabellen) {
    controleerAfgebroken(signal);
    const naam = knoopAttr(tabel, 'name') || `${label} ${bladen.length + 1}`;
    const rijen: string[][] = [];
    let uitgesteldeLegeRijen = 0;

    for (const rijKnoop of tabel.kinderen) {
      if (rijKnoop.lokaal !== 'table-row') continue;
      if (rijen.length >= REKENBLAD_MAX_RIJEN) break;

      const rijWaarden: string[] = [];
      let uitgesteldeLegeCellen = 0;
      for (const celKnoop of rijKnoop.kinderen) {
        if (celKnoop.lokaal !== 'table-cell' && celKnoop.lokaal !== 'covered-table-cell') continue;
        if (rijWaarden.length >= REKENBLAD_MAX_KOLOMMEN) break;
        const herhaal = Math.min(odfHerhaalAantal(celKnoop, 'number-columns-repeated'), REKENBLAD_MAX_KOLOMMEN);
        const val = leesOdfCelTekst(celKnoop);
        if (!val) {
          uitgesteldeLegeCellen += herhaal;
        } else {
          while (uitgesteldeLegeCellen > 0 && rijWaarden.length < REKENBLAD_MAX_KOLOMMEN) {
            rijWaarden.push('');
            uitgesteldeLegeCellen -= 1;
          }
          for (let i = 0; i < herhaal && rijWaarden.length < REKENBLAD_MAX_KOLOMMEN; i += 1) {
            rijWaarden.push(val);
          }
        }
      }

      const rijHerhaal = odfHerhaalAantal(rijKnoop, 'number-rows-repeated');
      if (!rijWaarden.length) {
        uitgesteldeLegeRijen += rijHerhaal;
      } else {
        while (uitgesteldeLegeRijen > 0 && rijen.length < REKENBLAD_MAX_RIJEN) {
          rijen.push([]);
          uitgesteldeLegeRijen -= 1;
        }
        for (let i = 0; i < rijHerhaal && rijen.length < REKENBLAD_MAX_RIJEN; i += 1) {
          rijen.push(rijWaarden.slice());
        }
      }
    }

    if (rijen.length) bladen.push({ name: naam, rows: rijen });
  }

  if (!bladen.length) {
    const rijKnopen = vindAlle(boom, 'row').concat(vindAlle(boom, 'table-row'));
    const rijen = rijKnopen
      .slice(0, REKENBLAD_MAX_RIJEN)
      .map((rij) =>
        rij.kinderen
          .filter((k) => k.lokaal === 'cell' || k.lokaal === 'table-cell')
          .slice(0, REKENBLAD_MAX_KOLOMMEN)
          .map((cel) => schoonCel(cel.tekst)),
      )
      .filter((rij) => rij.some(Boolean));
    if (rijen.length) bladen.push({ name: label, rows: rijen });
  }

  if (!bladen.length) throw new Error('SHEET_XML_NO_TABLE');
  return bladen;
};

export const leesOds = (bytes: Uint8Array, label = 'ODS', signal?: AbortSignal): RekenbladBlad[] => {
  const bestanden = pakZipVeiligUit(
    bytes,
    (pad) => {
      const lager = pad.toLowerCase();
      return lager === 'content.xml' || lager === 'mimetype';
    },
    signal,
  );
  const content = bestanden.get('content.xml');
  if (!content) throw new Error('SHEET_PACKAGE_CONTENT_MISSING');
  return leesOdfXml(decodeerTekstBytes(content), label, signal);
};

// Підтримка Excel 2003 SpreadsheetML XML (якщо .xls є текстовим XML-документом).
export const leesSpreadsheetMl2003 = (tekst: string, label: string, signal?: AbortSignal): RekenbladBlad[] => {
  controleerAfgebroken(signal);
  const boom = ontleedXml(tekst);
  if (boom.lokaal !== 'workbook') throw new Error('SHEET_XML_INVALID');
  const werkbladen = vindAlle(boom, 'worksheet').slice(0, REKENBLAD_MAX_BLADEN);
  const bladen: RekenbladBlad[] = [];
  for (const ws of werkbladen) {
    const naam = knoopAttr(ws, 'Name') || `${label} ${bladen.length + 1}`;
    const rijen: string[][] = [];
    for (const rowEl of vindAlle(ws, 'row')) {
      if (rijen.length >= REKENBLAD_MAX_RIJEN) break;
      const idx = Number.parseInt(knoopAttr(rowEl, 'Index'), 10);
      if (Number.isInteger(idx) && idx >= 1 && idx <= REKENBLAD_MAX_RIJEN) {
        while (rijen.length < idx - 1) rijen.push([]);
      }
      const rij: string[] = [];
      for (const cel of rowEl.kinderen) {
        if (cel.lokaal !== 'cell') continue;
        const cIdx = Number.parseInt(knoopAttr(cel, 'Index'), 10);
        if (Number.isInteger(cIdx) && cIdx >= 1 && cIdx <= REKENBLAD_MAX_KOLOMMEN) {
          while (rij.length < cIdx - 1) rij.push('');
        }
        if (rij.length >= REKENBLAD_MAX_KOLOMMEN) break;
        const data = cel.kinderen.find((k) => k.lokaal === 'data');
        rij.push(schoonCel(data ? data.tekst : cel.tekst));
      }
      rijen.push(rij);
    }
    bladen.push({ name: naam, rows: rijen });
  }
  if (!bladen.length) throw new Error('SHEET_XML_NO_TABLE');
  return bladen;
};

const bouwOdfTabelXml = (sheet: RekenbladBlad): string => {
  const naam = schoonXmlTekst(sheet.name || 'Sheet1').slice(0, 64) || 'Sheet1';
  const rijenXml = sheet.rows
    .slice(0, REKENBLAD_MAX_RIJEN)
    .map((rij) => {
      const cellen = rij
        .slice(0, REKENBLAD_MAX_KOLOMMEN)
        .map((cel) => {
          const val = schoonXmlTekst(String(cel ?? ''));
          if (!val) return '<table:table-cell/>';
          const regels = val.split(/\r?\n/).map((r) => `<text:p>${escXml(r)}</text:p>`).join('');
          return `<table:table-cell office:value-type="string">${regels}</table:table-cell>`;
        })
        .join('');
      return `<table:table-row>${cellen}</table:table-row>`;
    })
    .join('');
  return `<table:table table:name="${escXml(naam)}">${rijenXml}</table:table>`;
};

export const schrijfFods = (sheet: RekenbladBlad): Uint8Array<ArrayBuffer> => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">' +
    `<office:body><office:spreadsheet>${bouwOdfTabelXml(sheet)}</office:spreadsheet></office:body>` +
    '</office:document>';
  return strToU8(xml);
};

export const schrijfOds = (sheet: RekenbladBlad): Uint8Array<ArrayBuffer> => {
  const content =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">' +
    `<office:body><office:spreadsheet>${bouwOdfTabelXml(sheet)}</office:spreadsheet></office:body>` +
    '</office:document-content>';
  const manifest =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
    '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>' +
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
    '</manifest:manifest>';

  return zipSync({
    // За стандартом ODF файл mimetype повинен зберігатися без стиснення (level: 0).
    mimetype: [strToU8('application/vnd.oasis.opendocument.spreadsheet'), { level: 0 }],
    'META-INF/manifest.xml': strToU8(manifest),
    'content.xml': strToU8(content),
  });
};

// Розбір та запис DIF (Data Interchange Format).
export const leesDif = (tekst: string, label = 'DIF', signal?: AbortSignal): RekenbladBlad[] => {
  controleerAfgebroken(signal);
  const regels = tekst.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  let i = 0;
  let bladNaam = label;
  let inData = false;

  const leesAangehaald = (startIndex: number): { waarde: string; volgende: number } => {
    const eerste = regels[startIndex] ?? '';
    if (!eerste.startsWith('"')) return { waarde: eerste.trim(), volgende: startIndex + 1 };
    let buf = eerste.slice(1);
    let idx = startIndex + 1;
    for (;;) {
      let quoteCount = 0;
      for (let p = 0; p < buf.length; p += 1) {
        if (buf[p] === '"') quoteCount += 1;
      }
      // Наприкінці рядка непарні лапки замикають рядок у форматі DIF.
      if (quoteCount % 2 === 1 && buf.endsWith('"')) {
        return { waarde: buf.slice(0, -1).replace(/""/g, '"'), volgende: idx };
      }
      if (idx >= regels.length) {
        return { waarde: buf.replace(/""/g, '"'), volgende: idx };
      }
      buf += `\n${regels[idx]}`;
      idx += 1;
    }
  };

  while (i < regels.length) {
    const topic = (regels[i] || '').trim().toUpperCase();
    i += 1;
    if (!topic) continue;
    const _kop = (regels[i] || '').trim();
    i += 1;
    const val = leesAangehaald(i);
    i = val.volgende;
    if (topic === 'TABLE' && val.waarde) bladNaam = val.waarde;
    if (topic === 'DATA') {
      void _kop;
      inData = true;
      break;
    }
  }

  if (!inData) throw new Error('DIF_NO_DATA');
  const rijen: string[][] = [];
  let huidigeRij: string[] | null = null;

  while (i < regels.length && rijen.length < REKENBLAD_MAX_RIJEN) {
    controleerAfgebroken(signal);
    const paar = (regels[i] || '').trim();
    if (!paar) {
      i += 1;
      continue;
    }
    const comma = paar.indexOf(',');
    if (comma < 0) break;
    const type = Number.parseInt(paar.slice(0, comma), 10);
    const numDeel = paar.slice(comma + 1).trim();
    i += 1;
    const datum = leesAangehaald(i);
    i = datum.volgende;

    if (type === -1) {
      const merk = datum.waarde.trim().toUpperCase();
      if (merk === 'BOT') {
        if (huidigeRij) rijen.push(huidigeRij);
        huidigeRij = [];
      } else if (merk === 'EOD') {
        break;
      }
      continue;
    }

    if (!huidigeRij) huidigeRij = [];
    if (huidigeRij.length >= REKENBLAD_MAX_KOLOMMEN) continue;
    if (type === 0) {
      huidigeRij.push(datum.waarde.trim().toUpperCase() === 'V' ? numDeel : '');
    } else if (type === 1) {
      huidigeRij.push(schoonCel(datum.waarde));
    }
  }
  if (huidigeRij && rijen.length < REKENBLAD_MAX_RIJEN) rijen.push(huidigeRij);
  if (!rijen.length) throw new Error('DIF_NO_DATA');
  return [{ name: bladNaam, rows: rijen }];
};

export const schrijfDif = (sheet: RekenbladBlad): Uint8Array<ArrayBuffer> => {
  const rijen = sheet.rows.slice(0, REKENBLAD_MAX_RIJEN);
  const kolommen = Math.min(REKENBLAD_MAX_KOLOMMEN, Math.max(0, ...rijen.map((r) => r.length)));
  const naam = String(sheet.name || 'Sheet1').replace(/"/g, '""');
  const uit: string[] = [
    'TABLE',
    '0,1',
    `"${naam}"`,
    'VECTORS',
    `0,${kolommen}`,
    '""',
    'TUPLES',
    `0,${rijen.length}`,
    '""',
    'DATA',
    '0,0',
    '""',
  ];
  for (const rij of rijen) {
    uit.push('-1,0', 'BOT');
    for (let c = 0; c < kolommen; c += 1) {
      const val = String(rij[c] ?? '').replace(/\u0000/g, '');
      uit.push('1,0', `"${val.replace(/"/g, '""')}"`);
    }
  }
  uit.push('-1,0', 'EOD', '');
  return strToU8(uit.join('\r\n'));
};

// Розбір та запис SYLK (Symbolic Link).
const splitsSylkVelden = (regel: string): string[] => {
  const velden: string[] = [];
  let huidig = '';
  let inQuotes = false;
  for (let i = 0; i < regel.length; i += 1) {
    const ch = regel[i];
    if (ch === '"') {
      if (inQuotes && regel[i + 1] === '"') {
        huidig += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        huidig += ch;
      }
      continue;
    }
    if (!inQuotes && ch === ';') {
      if (regel[i + 1] === ';') {
        huidig += ';';
        i += 1;
      } else {
        velden.push(huidig);
        huidig = '';
      }
      continue;
    }
    huidig += ch;
  }
  velden.push(huidig);
  return velden;
};

export const leesSylk = (tekst: string, label = 'SYLK', signal?: AbortSignal): RekenbladBlad[] => {
  controleerAfgebroken(signal);
  const regels = tekst.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const eerste = regels.find((r) => r.trim().length > 0) || '';
  if (!eerste.startsWith('ID;')) throw new Error('SYLK_INVALID_HEADER');

  const rijen: string[][] = [];
  let curY = 1;
  let curX = 1;

  for (const regel of regels) {
    controleerAfgebroken(signal);
    if (!regel || !regel.startsWith('C;')) {
      if (regel === 'E') break;
      continue;
    }
    const velden = splitsSylkVelden(regel.slice(2));
    let waarde: string | null = null;
    for (const veld of velden) {
      if (!veld) continue;
      if (veld.startsWith('Y')) {
        const y = Number.parseInt(veld.slice(1), 10);
        if (Number.isInteger(y) && y >= 1) curY = y;
      } else if (veld.startsWith('X')) {
        const x = Number.parseInt(veld.slice(1), 10);
        if (Number.isInteger(x) && x >= 1) curX = x;
      } else if (veld.startsWith('K')) {
        let k = veld.slice(1);
        if (k.startsWith('"') && k.endsWith('"') && k.length >= 2) {
          k = k.slice(1, -1).replace(/""/g, '"').replace(/;;/g, ';');
        }
        waarde = schoonCel(k);
      }
    }
    if (waarde !== null && curY >= 1 && curY <= REKENBLAD_MAX_RIJEN && curX >= 1 && curX <= REKENBLAD_MAX_KOLOMMEN) {
      while (rijen.length < curY) rijen.push([]);
      const rij = rijen[curY - 1];
      while (rij.length < curX) rij.push('');
      rij[curX - 1] = waarde;
      curX += 1;
    }
  }

  if (!rijen.length) throw new Error('SYLK_NO_DATA');
  return [{ name: label, rows: rijen }];
};

export const schrijfSylk = (sheet: RekenbladBlad): Uint8Array<ArrayBuffer> => {
  const uit: string[] = ['ID;PMijnRuimte;N;E'];
  const rijen = sheet.rows.slice(0, REKENBLAD_MAX_RIJEN);
  for (let r = 0; r < rijen.length; r += 1) {
    const rij = rijen[r] || [];
    const maxCol = Math.min(rij.length, REKENBLAD_MAX_KOLOMMEN);
    for (let c = 0; c < maxCol; c += 1) {
      const val = String(rij[c] ?? '').replace(/[\u0000\r\n]+/g, ' ');
      if (!val) continue;
      const ontsnapt = val.replace(/"/g, '""').replace(/;/g, ';;');
      uit.push(`C;Y${r + 1};X${c + 1};K"${ontsnapt}"`);
    }
  }
  uit.push('E', '');
  return strToU8(uit.join('\r\n'));
};

// Чистий браузерний читач та записувач dBASE (.dbf).
const GELDIGE_DBF_VERSIES = new Set([
  0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x43, 0x63, 0x83, 0x8b, 0x8c, 0xcb, 0xe5, 0xf5, 0xfb,
]);

const ldidNaarCodering = (ldid: number): string => {
  if (ldid === 0x26 || ldid === 0x65 || ldid === 0x66) return 'ibm866';
  if (ldid === 0xc9) return 'windows-1251';
  if (ldid === 0xc8) return 'windows-1250';
  if (ldid === 0x01 || ldid === 0x02) return 'ibm850';
  if (ldid === 0x03 || ldid === 0x57 || ldid === 0x59) return 'windows-1252';
  return 'utf-8';
};

const decodeerDbfVeld = (bytes: Uint8Array, codering: string): string => {
  let eind = bytes.length;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0) {
      eind = i;
      break;
    }
  }
  const stuk = bytes.subarray(0, eind);
  if (codering === 'utf-8') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(stuk);
    } catch {
      return new TextDecoder('windows-1252', { fatal: false }).decode(stuk);
    }
  }
  try {
    return new TextDecoder(codering, { fatal: false }).decode(stuk);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(stuk);
  }
};

export const leesDbf = (bytes: Uint8Array, signal?: AbortSignal): DatabankTabel => {
  controleerAfgebroken(signal);
  if (bytes.byteLength < 65 || bytes.byteLength > 32 * 1024 * 1024) {
    throw new Error('DBF_INVALID_SIZE');
  }
  const versie = bytes[0];
  if (!GELDIGE_DBF_VERSIES.has(versie)) {
    throw new Error('DBF_INVALID_SIGNATURE');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordAantal = view.getUint32(4, true);
  const kopBytes = view.getUint16(8, true);
  const recordBytes = view.getUint16(10, true);
  const codering = ldidNaarCodering(bytes[29]);

  if (kopBytes < 33 || kopBytes > bytes.byteLength || recordBytes < 2) {
    throw new Error('DBF_INVALID_HEADER');
  }

  type DbfVeld = { naam: string; type: string; lengte: number };
  const velden: DbfVeld[] = [];
  let pos = 32;
  let veldSom = 1;

  while (pos + 32 <= kopBytes && velden.length < REKENBLAD_MAX_KOLOMMEN) {
    if (bytes[pos] === 0x0d) break;
    const rawNaam = bytes.subarray(pos, pos + 11);
    const naam = decodeerDbfVeld(rawNaam, codering).trim() || `C${velden.length + 1}`;
    const type = String.fromCharCode(bytes[pos + 11]);
    const lengte = bytes[pos + 16];
    if (!lengte || veldSom + lengte > recordBytes) break;
    velden.push({ naam, type, lengte });
    veldSom += lengte;
    pos += 32;
  }

  if (!velden.length) throw new Error('DBF_NO_TABLE');

  const rijen: string[][] = [];
  let offset = kopBytes;
  const maxRecords = Math.min(recordAantal, Math.floor((bytes.byteLength - kopBytes) / recordBytes));

  for (let r = 0; r < maxRecords && rijen.length < REKENBLAD_MAX_RIJEN; r += 1) {
    if (r % 256 === 0) controleerAfgebroken(signal);
    const vlag = bytes[offset];
    if (vlag === 0x1a) break;
    if (vlag !== 0x2a) {
      const rij: string[] = [];
      let veldOffset = offset + 1;
      for (const veld of velden) {
        const stuk = bytes.subarray(veldOffset, veldOffset + veld.lengte);
        veldOffset += veld.lengte;
        if (veld.type === 'I' && stuk.length === 4) {
          const dv = new DataView(stuk.buffer, stuk.byteOffset, 4);
          rij.push(String(dv.getInt32(0, true)));
        } else if ((veld.type === 'B' || veld.type === 'O') && stuk.length === 8) {
          const dv = new DataView(stuk.buffer, stuk.byteOffset, 8);
          rij.push(String(dv.getFloat64(0, true)));
        } else if (veld.type === 'L') {
          const ch = String.fromCharCode(stuk[0] || 0).toUpperCase();
          rij.push(ch === 'T' || ch === 'Y' ? 'TRUE' : ch === 'F' || ch === 'N' ? 'FALSE' : '');
        } else if (veld.type === 'D') {
          const raw = decodeerDbfVeld(stuk, 'utf-8').trim();
          rij.push(/^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw);
        } else {
          rij.push(decodeerDbfVeld(stuk, codering).trim());
        }
      }
      rijen.push(rij);
    }
    offset += recordBytes;
  }

  return {
    name: 'Data',
    columns: velden.map((v) => v.naam),
    rows: rijen,
  };
};

const breekUtf8OpGrens = (tekst: string, maxBytes: number): Uint8Array => {
  const enc = new TextEncoder();
  const vol = enc.encode(tekst);
  if (vol.byteLength <= maxBytes) return vol;
  let k = maxBytes;
  // Не розриваємо багатобайтову послідовність UTF-8 на межі 254 байтів.
  while (k > 0 && (vol[k] & 0xc0) === 0x80) k -= 1;
  return vol.subarray(0, k);
};

export const schrijfDbf = (table: DatabankTabel): Uint8Array<ArrayBuffer> => {
  const enc = new TextEncoder();
  const kolommen = (table.columns.length ? table.columns : ['C1']).slice(0, REKENBLAD_MAX_KOLOMMEN);
  const rijen = table.rows.slice(0, REKENBLAD_MAX_RIJEN);

  const gebruikt = new Set<string>();
  const velden = kolommen.map((rawNaam, idx) => {
    let kort = String(rawNaam || `C${idx + 1}`).replace(/[^\x20-\x7e]/g, '_').trim() || `C${idx + 1}`;
    kort = kort.slice(0, 10);
    if (gebruikt.has(kort.toUpperCase())) {
      const suffix = `_${idx + 1}`;
      kort = `${kort.slice(0, Math.max(1, 10 - suffix.length))}${suffix}`;
    }
    gebruikt.add(kort.toUpperCase());

    let maxLen = 1;
    for (const rij of rijen) {
      const len = Math.min(254, enc.encode(String(rij[idx] ?? '')).byteLength);
      if (len > maxLen) maxLen = len;
    }
    return { naamBytes: enc.encode(kort).subarray(0, 10), lengte: maxLen };
  });

  const kopBytes = 32 + velden.length * 32 + 1;
  const recordBytes = 1 + velden.reduce((sum, v) => sum + v.lengte, 0);
  const totaalBytes = kopBytes + rijen.length * recordBytes + 1;

  const buf = new ArrayBuffer(totaalBytes);
  const out = new Uint8Array(buf);
  const view = new DataView(buf);
  const nu = new Date();

  out[0] = 0x03; // dBASE III+
  out[1] = Math.max(0, nu.getFullYear() - 1900) % 100;
  out[2] = nu.getMonth() + 1;
  out[3] = nu.getDate();
  view.setUint32(4, rijen.length, true);
  view.setUint16(8, kopBytes, true);
  view.setUint16(10, recordBytes, true);

  let pos = 32;
  for (const veld of velden) {
    out.set(veld.naamBytes, pos);
    out[pos + 11] = 0x43; // Тип 'C' (Character)
    out[pos + 16] = veld.lengte;
    pos += 32;
  }
  out[pos] = 0x0d; // Маркер кінця опису полів.
  pos += 1;

  for (const rij of rijen) {
    out[pos] = 0x20; // Невидалений запис.
    let vPos = pos + 1;
    for (let c = 0; c < velden.length; c += 1) {
      const veld = velden[c];
      out.fill(0x20, vPos, vPos + veld.lengte);
      const valBytes = breekUtf8OpGrens(String(rij[c] ?? ''), veld.lengte);
      out.set(valBytes, vPos);
      vPos += veld.lengte;
    }
    pos += recordBytes;
  }

  out[pos] = 0x1a; // Маркер кінця файлу dBASE.
  return out;
};
