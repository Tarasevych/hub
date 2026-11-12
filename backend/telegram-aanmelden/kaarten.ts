// TELEGRAM-AANMELDEN v1 — kaarten en animaties die de SERVER zelf tekent (geen extra pakket, geen extern beeld):
//   • PNG-kaart (sendPhoto): kleur naar betekenis — blauw gewoon, geel nieuw apparaat, rood verdacht, groen gelukt —
//     met het zegel (schild) en een pictogram; de tekst (wie, wat, wanneer, waarom, wat nu) staat in het onderschrift,
//     zodat ook schermlezers en meldingen op het slot scherm alles tonen;
//   • GIF-animatie (sendAnimation): het slot sluit en er verschijnt ✅ (alleen bij succes, uit te zetten door de beheerder).
// Rasteren op een palet: dezelfde tekenfuncties voeden PNG (RGB) en GIF (LZW).
import { deflateSync, crc32 } from 'node:zlib';
import type { KaartSoort } from '../../shared/telegram-aanmelden/model';

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const KLEUR: Record<KaartSoort, Rgb> = { gewoon: hex('#2AABEE'), nieuwApparaat: hex('#F2B01E'), verdacht: hex('#E5484D'), gelukt: hex('#2FB36B') };
const ZEGEL_DONKER = hex('#1E2A6B');
const ZEGEL_LICHT = hex('#3D5BD9');
const WIT = hex('#FFFFFF');
const SCHADUW = hex('#0F1733');
const GOUD = hex('#E8C66A');

class Doek {
  readonly px: Uint8Array;
  readonly palet: Rgb[] = [];
  constructor(readonly b: number, readonly h: number, achtergrond: Rgb) { this.px = new Uint8Array(b * h); this.px.fill(this.kleur(achtergrond)); }
  kleur(c: Rgb): number {
    const i = this.palet.findIndex((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]);
    if (i >= 0) return i;
    if (this.palet.length >= 256) return 0;
    this.palet.push(c);
    return this.palet.length - 1;
  }
  zet(x: number, y: number, k: number) { if (x >= 0 && y >= 0 && x < this.b && y < this.h) this.px[y * this.b + x] = k; }
  rechthoek(x0: number, y0: number, b: number, h: number, c: Rgb, r = 0) {
    const k = this.kleur(c);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + b; x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x0 + b - 1 - r)), dy = Math.max(y0 + r - y, 0, y - (y0 + h - 1 - r));
      if (dx * dx + dy * dy <= r * r) this.zet(x, y, k);
    }
  }
  cirkel(cx: number, cy: number, r: number, c: Rgb) {
    const k = this.kleur(c);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.zet(x, y, k);
  }
  ring(cx: number, cy: number, r: number, dikte: number, c: Rgb, alleenBoven = false) {
    const k = this.kleur(c);
    for (let y = Math.floor(cy - r - dikte); y <= cy + r + dikte; y++) for (let x = Math.floor(cx - r - dikte); x <= cx + r + dikte; x++) {
      if (alleenBoven && y > cy) continue;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= r + dikte / 2 && d >= r - dikte / 2) this.zet(x, y, k);
    }
  }
  veelhoek(punten: Array<[number, number]>, c: Rgb) {
    const k = this.kleur(c);
    const ys = punten.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const snij: number[] = [];
      for (let i = 0; i < punten.length; i++) {
        const [x1, y1] = punten[i], [x2, y2] = punten[(i + 1) % punten.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) snij.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      snij.sort((a, b) => a - b);
      for (let i = 0; i + 1 < snij.length; i += 2) for (let x = Math.ceil(snij[i]); x <= snij[i + 1]; x++) this.zet(x, y, k);
    }
  }
  lijn(x1: number, y1: number, x2: number, y2: number, dikte: number, c: Rgb) {
    const stappen = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    for (let i = 0; i <= stappen; i++) this.cirkel(x1 + ((x2 - x1) * i) / stappen, y1 + ((y2 - y1) * i) / stappen, dikte / 2, c);
  }
}

/** Het zegel: donkerblauw schild met lichte rand en een gouden ster, zoals het logo van «Мій простір». */
function zegel(d: Doek, cx: number, cy: number, s: number) {
  d.cirkel(cx, cy, s * 1.05, WIT);
  d.cirkel(cx, cy, s, ZEGEL_DONKER);
  d.ring(cx, cy, s * 0.86, Math.max(2, s * 0.06), GOUD);
  const schild = (f: number): Array<[number, number]> => [[cx - s * 0.5 * f, cy - s * 0.45 * f], [cx, cy - s * 0.62 * f], [cx + s * 0.5 * f, cy - s * 0.45 * f], [cx + s * 0.44 * f, cy + s * 0.15 * f], [cx, cy + s * 0.62 * f], [cx - s * 0.44 * f, cy + s * 0.15 * f]];
  d.veelhoek(schild(1), ZEGEL_LICHT);
  d.veelhoek(schild(0.78), ZEGEL_DONKER);
}
function vinkje(d: Doek, cx: number, cy: number, s: number, c: Rgb) {
  d.lijn(cx - s * 0.45, cy, cx - s * 0.1, cy + s * 0.35, s * 0.18, c);
  d.lijn(cx - s * 0.1, cy + s * 0.35, cx + s * 0.5, cy - s * 0.35, s * 0.18, c);
}
function uitroep(d: Doek, cx: number, cy: number, s: number, c: Rgb) {
  d.rechthoek(Math.round(cx - s * 0.08), Math.round(cy - s * 0.5), Math.round(s * 0.16), Math.round(s * 0.62), c, Math.round(s * 0.06));
  d.cirkel(cx, cy + s * 0.38, s * 0.1, c);
}
function slot(d: Doek, cx: number, cy: number, s: number, sluiting: number, c: Rgb) {
  // sluiting 0 = open (beugel omhoog), 1 = dicht
  const hoogte = (1 - sluiting) * s * 0.35;
  d.ring(cx, cy - s * 0.15 - hoogte, s * 0.3, s * 0.12, c, true);
  d.lijn(cx - s * 0.3, cy - s * 0.15 - hoogte, cx - s * 0.3, cy - hoogte * 0.2, s * 0.12, c);
  d.lijn(cx + s * 0.3, cy - s * 0.15 - hoogte, cx + s * 0.3, cy, s * 0.12, c);
  d.rechthoek(Math.round(cx - s * 0.48), Math.round(cy), Math.round(s * 0.96), Math.round(s * 0.7), c, Math.round(s * 0.1));
}

function kaartDoek(soort: KaartSoort, b = 640, h = 320): Doek {
  const d = new Doek(b, h, KLEUR[soort]);
  d.rechthoek(24, 24, b - 48, h - 48, SCHADUW, 28);
  d.rechthoek(20, 18, b - 48, h - 48, WIT, 28);
  d.rechthoek(20, 18, b - 48, 18, KLEUR[soort], 8);
  zegel(d, 150, h / 2 + 6, 84);
  const pc = KLEUR[soort];
  d.cirkel(430, h / 2 + 6, 86, pc);
  if (soort === 'gelukt' || soort === 'gewoon') vinkje(d, 430, h / 2 + 6, 90, WIT);
  else uitroep(d, 430, h / 2 + 6, 110, WIT);
  return d;
}

// ------------------------------------------------------------------------------------------------ PNG
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function pngVan(d: Doek): Buffer {
  const rij = d.b * 3 + 1;
  const ruw = Buffer.alloc(rij * d.h);
  for (let y = 0; y < d.h; y++) {
    ruw[y * rij] = 0;
    for (let x = 0; x < d.b; x++) { const c = d.palet[d.px[y * d.b + x]]; ruw.set(c, y * rij + 1 + x * 3); }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(d.b, 0); ihdr.writeUInt32BE(d.h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(ruw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

const kaartCache = new Map<KaartSoort, Buffer>();
/** PNG-kaart voor deze betekenis (gecachet: het beeld hangt alleen van de soort af; persoonsgegevens staan in het onderschrift). */
export function kaartPng(soort: KaartSoort): Buffer {
  let b = kaartCache.get(soort);
  if (!b) { b = pngVan(kaartDoek(soort)); kaartCache.set(soort, b); }
  return b;
}

// ------------------------------------------------------------------------------------------------ GIF (LZW)
function lzw(indices: Uint8Array, minCode: number): Buffer {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeGrootte = minCode + 1, volgende = eoi + 1;
  let tabel = new Map<string, number>();
  const uit: number[] = []; let acc = 0, bits = 0;
  const schrijf = (code: number) => { acc |= code << bits; bits += codeGrootte; while (bits >= 8) { uit.push(acc & 0xff); acc >>>= 8; bits -= 8; } };
  const reset = () => { tabel = new Map(); codeGrootte = minCode + 1; volgende = eoi + 1; };
  schrijf(clear);
  let w = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]; const wk = `${w},${k}`;
    if (tabel.has(wk)) { w = wk; continue; }
    schrijf(w.includes(',') ? tabel.get(w)! : Number(w));
    if (volgende < 4096) { tabel.set(wk, volgende++); if (volgende > (1 << codeGrootte) && codeGrootte < 12) codeGrootte++; }
    else { schrijf(clear); reset(); }
    w = String(k);
  }
  schrijf(w.includes(',') ? tabel.get(w)! : Number(w));
  schrijf(eoi);
  if (bits > 0) uit.push(acc & 0xff);
  const blokken: number[] = [];
  for (let i = 0; i < uit.length; i += 255) { const deel = uit.slice(i, i + 255); blokken.push(deel.length, ...deel); }
  blokken.push(0);
  return Buffer.from(blokken);
}
function gifVan(frames: Doek[], vertragingCs: number[]): Buffer {
  const palet: Rgb[] = [];
  const idx = (c: Rgb) => { let i = palet.findIndex((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]); if (i < 0) { palet.push(c); i = palet.length - 1; } return i; };
  const herindex = frames.map((f) => { const m = f.palet.map(idx); return Uint8Array.from(f.px, (v) => m[v]); });
  const bitsPalet = Math.max(2, Math.ceil(Math.log2(Math.max(2, palet.length))));
  const grootte = 1 << bitsPalet;
  const tabel = Buffer.alloc(grootte * 3); palet.forEach((c, i) => tabel.set(c, i * 3));
  const { b, h } = frames[0];
  const kop = Buffer.alloc(13); kop.write('GIF89a', 0, 'ascii'); kop.writeUInt16LE(b, 6); kop.writeUInt16LE(h, 8); kop[10] = 0x80 | ((bitsPalet - 1) << 4) | (bitsPalet - 1); kop[11] = 0; kop[12] = 0;
  const lus = Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00]);
  const delen: Buffer[] = [kop, tabel, lus];
  herindex.forEach((px, i) => {
    const gce = Buffer.from([0x21, 0xf9, 0x04, 0x00, vertragingCs[i] & 0xff, (vertragingCs[i] >> 8) & 0xff, 0x00, 0x00]);
    const beeld = Buffer.alloc(10); beeld[0] = 0x2c; beeld.writeUInt16LE(0, 1); beeld.writeUInt16LE(0, 3); beeld.writeUInt16LE(b, 5); beeld.writeUInt16LE(h, 7); beeld[9] = 0;
    delen.push(gce, beeld, Buffer.from([bitsPalet]), lzw(px, bitsPalet));
  });
  delen.push(Buffer.from([0x3b]));
  return Buffer.concat(delen);
}

let animatieCache: Buffer | null = null;
/** Korte animatie: het slot sluit, daarna verschijnt het vinkje. ≈ 1,5 s, één keer per bericht afgespeeld (lus in de speler). */
export function succesAnimatie(): Buffer {
  if (animatieCache) return animatieCache;
  const frames: Doek[] = [], vertraging: number[] = [];
  const b = 320, h = 200;
  for (let i = 0; i <= 6; i++) {
    const d = new Doek(b, h, KLEUR.gelukt);
    d.rechthoek(14, 12, b - 28, h - 24, WIT, 22);
    zegel(d, 90, h / 2, 52);
    if (i < 6) slot(d, 225, h / 2 - 8, 90, i / 5, ZEGEL_DONKER);
    else { d.cirkel(225, h / 2, 56, KLEUR.gelukt); vinkje(d, 225, h / 2, 60, WIT); }
    frames.push(d); vertraging.push(i === 6 ? 200 : 12);
  }
  animatieCache = gifVan(frames, vertraging);
  return animatieCache;
}
