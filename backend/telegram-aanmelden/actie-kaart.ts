// UPD-011: динамічна фірмова PNG-картка дії для Telegram (800×400, TrueColor RGBA без сторонніх пакетів).
// На картці: велика піктограма конкретної категорії дії, кругле фото саме того облікового запису,
// який ініціює дію (або його ініціал), бейдж категорії, назва дії, ім’я/пошта та контекст (пристрій, країна, час).
// Dynamische huisstijl-PNG-kaart voor Telegram met actiepictogram, ronde foto van het specifieke account en compacte details.
import { crc32, deflateSync } from 'node:zlib';
import { BEVESTIG_CATEGORIEEN, type BevestigCategorieId } from '../../shared/bevestig-categorie';
import { decodeBeeld, haalFotoBytes, type GedecodeerdBeeld } from './beeld-decode';

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const WIT: Rgb = [255, 255, 255];
const ACHTERGROND: Rgb = [243, 246, 251];
const TEKST: Rgb = [20, 30, 46];
const ZACHT: Rgb = [86, 102, 122];
const RAND: Rgb = [217, 226, 238];
const MERK_BLAUW: Rgb = [30, 42, 107];

// ------------------------------------------------------------------------------------------------ Полотно RGBA зі згладжуванням
class RgbaDoek {
  readonly b: number;
  readonly h: number;
  readonly data: Uint8Array;
  constructor(b: number, h: number, bg: Rgb) {
    this.b = b;
    this.h = h;
    this.data = new Uint8Array(b * h * 3);
    for (let i = 0; i < b * h; i++) {
      this.data[i * 3] = bg[0];
      this.data[i * 3 + 1] = bg[1];
      this.data[i * 3 + 2] = bg[2];
    }
  }
  blend(x: number, y: number, c: Rgb, alpha: number) {
    if (x < 0 || y < 0 || x >= this.b || y >= this.h || alpha <= 0) return;
    const o = (y * this.b + x) * 3;
    if (alpha >= 1) {
      this.data[o] = c[0]; this.data[o + 1] = c[1]; this.data[o + 2] = c[2];
      return;
    }
    const inv = 1 - alpha;
    this.data[o] = Math.round(this.data[o] * inv + c[0] * alpha);
    this.data[o + 1] = Math.round(this.data[o + 1] * inv + c[1] * alpha);
    this.data[o + 2] = Math.round(this.data[o + 2] * inv + c[2] * alpha);
  }
  rechthoek(x0: number, y0: number, w: number, h: number, c: Rgb, r = 0, alpha = 1) {
    const x1 = Math.max(0, Math.floor(x0)), y1 = Math.max(0, Math.floor(y0));
    const x2 = Math.min(this.b - 1, Math.ceil(x0 + w - 1)), y2 = Math.min(this.h - 1, Math.ceil(y0 + h - 1));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (r <= 0) { this.blend(x, y, c, alpha); continue; }
        const dx = Math.max(x0 + r - x, 0, x - (x0 + w - 1 - r));
        const dy = Math.max(y0 + r - y, 0, y - (y0 + h - 1 - r));
        const dist = Math.hypot(dx, dy);
        if (dist <= r - 0.5) this.blend(x, y, c, alpha);
        else if (dist < r + 0.5) this.blend(x, y, c, alpha * (r + 0.5 - dist));
      }
    }
  }
  cirkel(cx: number, cy: number, r: number, c: Rgb, alpha = 1) {
    const x1 = Math.max(0, Math.floor(cx - r - 1)), x2 = Math.min(this.b - 1, Math.ceil(cx + r + 1));
    const y1 = Math.max(0, Math.floor(cy - r - 1)), y2 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r - 0.5) this.blend(x, y, c, alpha);
        else if (d < r + 0.5) this.blend(x, y, c, alpha * (r + 0.5 - d));
      }
    }
  }
  ring(cx: number, cy: number, r: number, dikte: number, c: Rgb, alpha = 1) {
    const half = dikte / 2;
    const x1 = Math.max(0, Math.floor(cx - r - half - 1)), x2 = Math.min(this.b - 1, Math.ceil(cx + r + half + 1));
    const y1 = Math.max(0, Math.floor(cy - r - half - 1)), y2 = Math.min(this.h - 1, Math.ceil(cy + r + half + 1));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
        if (d <= half - 0.5) this.blend(x, y, c, alpha);
        else if (d < half + 0.5) this.blend(x, y, c, alpha * (half + 0.5 - d));
      }
    }
  }
  lijn(x1: number, y1: number, x2: number, y2: number, dikte: number, c: Rgb) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const stappen = Math.max(1, Math.ceil(len * 1.4));
    const r = dikte / 2;
    for (let i = 0; i <= stappen; i++) {
      this.cirkel(x1 + ((x2 - x1) * i) / stappen, y1 + ((y2 - y1) * i) / stappen, r, c);
    }
  }
  /** Круглий аватар із декодованого зображення (object-fit: cover + білінійне згладжування). */
  rondeFoto(cx: number, cy: number, r: number, img: GedecodeerdBeeld) {
    const minSide = Math.min(img.width, img.height);
    const offX = (img.width - minSide) / 2;
    const offY = (img.height - minSide) / 2;
    const x1 = Math.max(0, Math.floor(cx - r - 1)), x2 = Math.min(this.b - 1, Math.ceil(cx + r + 1));
    const y1 = Math.max(0, Math.floor(cy - r - 1)), y2 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= r + 0.5) continue;
        const cov = d <= r - 0.5 ? 1 : r + 0.5 - d;
        const u = ((x - (cx - r)) / (2 * r)) * (minSide - 1) + offX;
        const v = ((y - (cy - r)) / (2 * r)) * (minSide - 1) + offY;
        const sx0 = Math.max(0, Math.min(img.width - 1, Math.floor(u)));
        const sy0 = Math.max(0, Math.min(img.height - 1, Math.floor(v)));
        const sx1 = Math.min(img.width - 1, sx0 + 1);
        const sy1 = Math.min(img.height - 1, sy0 + 1);
        const fx = u - sx0, fy = v - sy0;
        const sample = (sx: number, sy: number, ch: number) => img.rgba[(sy * img.width + sx) * 4 + ch];
        const lerp = (ch: number) => Math.round(
          (sample(sx0, sy0, ch) * (1 - fx) + sample(sx1, sy0, ch) * fx) * (1 - fy)
          + (sample(sx0, sy1, ch) * (1 - fx) + sample(sx1, sy1, ch) * fx) * fy,
        );
        const a = (lerp(3) / 255) * cov;
        this.blend(x, y, [lerp(0), lerp(1), lerp(2)], a);
      }
    }
  }
  naarPng(): Buffer {
    const rij = this.b * 3 + 1;
    const ruw = Buffer.alloc(rij * this.h);
    for (let y = 0; y < this.h; y++) {
      ruw[y * rij] = 0;
      ruw.set(this.data.subarray(y * this.b * 3, (y + 1) * this.b * 3), y * rij + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.b, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(ruw, { level: 6 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// ------------------------------------------------------------------------------------------------ Піктограми категорій (векторно-растрові)
function tekenCategorieIcoon(d: RgbaDoek, cat: BevestigCategorieId, cx: number, cy: number, s: number, c: Rgb) {
  const sw = Math.max(4, Math.round(s * 0.11));
  if (cat === 'uitrol') {
    // Коробка оновлення зі стрілкою вгору
    d.lijn(cx, cy - s * 0.62, cx + s * 0.56, cy - s * 0.30, sw, c);
    d.lijn(cx + s * 0.56, cy - s * 0.30, cx + s * 0.56, cy + s * 0.32, sw, c);
    d.lijn(cx + s * 0.56, cy + s * 0.32, cx, cy + s * 0.62, sw, c);
    d.lijn(cx, cy + s * 0.62, cx - s * 0.56, cy + s * 0.32, sw, c);
    d.lijn(cx - s * 0.56, cy + s * 0.32, cx - s * 0.56, cy - s * 0.30, sw, c);
    d.lijn(cx - s * 0.56, cy - s * 0.30, cx, cy - s * 0.62, sw, c);
    d.lijn(cx, cy + s * 0.25, cx, cy - s * 0.25, sw, c);
    d.lijn(cx - s * 0.22, cy - s * 0.04, cx, cy - s * 0.26, sw, c);
    d.lijn(cx + s * 0.22, cy - s * 0.04, cx, cy - s * 0.26, sw, c);
  } else if (cat === 'aanmelden') {
    // Двері + стрілка входу
    d.lijn(cx + s * 0.06, cy - s * 0.56, cx + s * 0.52, cy - s * 0.56, sw, c);
    d.lijn(cx + s * 0.52, cy - s * 0.56, cx + s * 0.52, cy + s * 0.56, sw, c);
    d.lijn(cx + s * 0.52, cy + s * 0.56, cx + s * 0.06, cy + s * 0.56, sw, c);
    d.lijn(cx - s * 0.56, cy, cx + s * 0.20, cy, sw, c);
    d.lijn(cx - s * 0.04, cy - s * 0.26, cx + s * 0.22, cy, sw, c);
    d.lijn(cx - s * 0.04, cy + s * 0.26, cx + s * 0.22, cy, sw, c);
  } else if (cat === 'rechten') {
    // Ключ
    d.ring(cx - s * 0.26, cy + s * 0.22, s * 0.25, sw, c);
    d.lijn(cx - s * 0.08, cy + s * 0.04, cx + s * 0.48, cy - s * 0.52, sw, c);
    d.lijn(cx + s * 0.32, cy - s * 0.36, cx + s * 0.50, cy - s * 0.18, sw, c);
    d.lijn(cx + s * 0.14, cy - s * 0.18, cx + s * 0.30, cy - s * 0.02, sw, c);
  } else if (cat === 'verwijderen') {
    // Трикутник попередження + знак оклику
    d.lijn(cx, cy - s * 0.58, cx + s * 0.58, cy + s * 0.46, sw, c);
    d.lijn(cx + s * 0.58, cy + s * 0.46, cx - s * 0.58, cy + s * 0.46, sw, c);
    d.lijn(cx - s * 0.58, cy + s * 0.46, cx, cy - s * 0.58, sw, c);
    d.lijn(cx, cy - s * 0.18, cx, cy + s * 0.14, sw, c);
    d.cirkel(cx, cy + s * 0.30, sw * 0.62, c);
  } else if (cat === 'kluis') {
    // Замок
    d.ring(cx, cy - s * 0.18, s * 0.28, sw, c);
    d.rechthoek(cx - s * 0.46, cy - s * 0.06, s * 0.92, s * 0.64, c, Math.round(s * 0.12));
    d.cirkel(cx, cy + s * 0.24, s * 0.10, hex(BEVESTIG_CATEGORIEEN.kluis.kleur));
  } else if (cat === 'ai') {
    // Робот / з’єднувач
    d.lijn(cx, cy - s * 0.58, cx, cy - s * 0.34, sw, c);
    d.cirkel(cx, cy - s * 0.60, sw * 0.65, c);
    d.rechthoek(cx - s * 0.52, cy - s * 0.34, s * 1.04, s * 0.78, c, Math.round(s * 0.18));
    const binnen = hex(BEVESTIG_CATEGORIEEN.ai.kleur);
    d.cirkel(cx - s * 0.20, cy + s * 0.02, s * 0.10, binnen);
    d.cirkel(cx + s * 0.20, cy + s * 0.02, s * 0.10, binnen);
    d.lijn(cx - s * 0.22, cy + s * 0.26, cx + s * 0.22, cy + s * 0.26, sw * 0.8, binnen);
  } else if (cat === 'server') {
    // Термінал >_
    d.lijn(cx - s * 0.54, cy - s * 0.42, cx + s * 0.54, cy - s * 0.42, sw, c);
    d.lijn(cx + s * 0.54, cy - s * 0.42, cx + s * 0.54, cy + s * 0.42, sw, c);
    d.lijn(cx + s * 0.54, cy + s * 0.42, cx - s * 0.54, cy + s * 0.42, sw, c);
    d.lijn(cx - s * 0.54, cy + s * 0.42, cx - s * 0.54, cy - s * 0.42, sw, c);
    d.lijn(cx - s * 0.30, cy - s * 0.14, cx - s * 0.08, cy + s * 0.04, sw, c);
    d.lijn(cx - s * 0.08, cy + s * 0.04, cx - s * 0.30, cy + s * 0.22, sw, c);
    d.lijn(cx + s * 0.04, cy + s * 0.22, cx + s * 0.34, cy + s * 0.22, sw, c);
  } else if (cat === 'gegevens') {
    // Тека
    d.lijn(cx - s * 0.54, cy - s * 0.38, cx - s * 0.10, cy - s * 0.38, sw, c);
    d.lijn(cx - s * 0.10, cy - s * 0.38, cx + s * 0.04, cy - s * 0.22, sw, c);
    d.lijn(cx + s * 0.04, cy - s * 0.22, cx + s * 0.54, cy - s * 0.22, sw, c);
    d.lijn(cx + s * 0.54, cy - s * 0.22, cx + s * 0.54, cy + s * 0.42, sw, c);
    d.lijn(cx + s * 0.54, cy + s * 0.42, cx - s * 0.54, cy + s * 0.42, sw, c);
    d.lijn(cx - s * 0.54, cy + s * 0.42, cx - s * 0.54, cy - s * 0.38, sw, c);
  } else {
    // Щит із галочкою (beveiliging / algemeen)
    d.lijn(cx, cy - s * 0.60, cx + s * 0.52, cy - s * 0.36, sw, c);
    d.lijn(cx + s * 0.52, cy - s * 0.36, cx + s * 0.44, cy + s * 0.18, sw, c);
    d.lijn(cx + s * 0.44, cy + s * 0.18, cx, cy + s * 0.60, sw, c);
    d.lijn(cx, cy + s * 0.60, cx - s * 0.44, cy + s * 0.18, sw, c);
    d.lijn(cx - s * 0.44, cy + s * 0.18, cx - s * 0.52, cy - s * 0.36, sw, c);
    d.lijn(cx - s * 0.52, cy - s * 0.36, cx, cy - s * 0.60, sw, c);
    d.lijn(cx - s * 0.22, cy + s * 0.02, cx - s * 0.04, cy + s * 0.20, sw, c);
    d.lijn(cx - s * 0.04, cy + s * 0.20, cx + s * 0.26, cy - s * 0.16, sw, c);
  }
}

// ------------------------------------------------------------------------------------------------ Растровий шрифт 5×7 (Українська + Латиниця)
const GLYF: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '/': ['00001', '00010', '00100', '00100', '01000', '10000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '@': ['01110', '10001', '10111', '10101', '10110', '10000', '01111'],
  '·': ['00000', '00000', '00000', '00100', '00000', '00000', '00000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  // Українська кирилиця
  А: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  Б: ['11111', '10000', '10000', '11110', '10001', '10001', '11110'],
  В: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  Г: ['11111', '10000', '10000', '10000', '10000', '10000', '10000'],
  Ґ: ['00001', '11111', '10000', '10000', '10000', '10000', '10000'],
  Д: ['00110', '01010', '01010', '01010', '01010', '11111', '10001'],
  Е: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  Є: ['01110', '10001', '10000', '11110', '10000', '10001', '01110'],
  Ж: ['10101', '10101', '01110', '00100', '01110', '10101', '10101'],
  З: ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  И: ['10001', '10011', '10101', '10101', '11001', '10001', '10001'],
  І: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  Ї: ['01010', '00000', '01110', '00100', '00100', '00100', '01110'],
  Й: ['01010', '00000', '10001', '10011', '10101', '11001', '10001'],
  К: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  Л: ['00111', '01001', '01001', '01001', '01001', '01001', '10001'],
  М: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  Н: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  О: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  П: ['11111', '10001', '10001', '10001', '10001', '10001', '10001'],
  Р: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  С: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  Т: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  У: ['10001', '10001', '10001', '01111', '00001', '10001', '01110'],
  Ф: ['00100', '01110', '10101', '10101', '01110', '00100', '00100'],
  Х: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Ц: ['10010', '10010', '10010', '10010', '10010', '11111', '00001'],
  Ч: ['10001', '10001', '10001', '01111', '00001', '00001', '00001'],
  Ш: ['10101', '10101', '10101', '10101', '10101', '10101', '11111'],
  Щ: ['10101', '10101', '10101', '10101', '10101', '11111', '00001'],
  Ь: ['10000', '10000', '10000', '11110', '10001', '10001', '11110'],
  Ю: ['10110', '10101', '10101', '11101', '10101', '10101', '10110'],
  Я: ['01111', '10001', '10001', '01111', '00101', '01001', '10001'],
};

function normTeken(ch: string): string {
  if (ch === '’' || ch === '`' || ch === '‘') return "'";
  if (ch === '—' || ch === '–') return '-';
  if (ch === '•') return '·';
  const up = ch.toUpperCase();
  if (GLYF[up]) return up;
  const lat = up.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return GLYF[lat] ? lat : ' ';
}

function tekenTekst(d: RgbaDoek, tekst: string, x0: number, y0: number, schaal: number, c: Rgb, maxBreedte: number): number {
  const stap = 6 * schaal;
  let x = x0;
  for (const raw of tekst) {
    if (x + 5 * schaal > x0 + maxBreedte) break;
    const g = GLYF[normTeken(raw)] || GLYF[' '];
    for (let r = 0; r < 7; r++) {
      for (let k = 0; k < 5; k++) {
        if (g[r][k] === '1') d.rechthoek(x + k * schaal, y0 + r * schaal, schaal, schaal, c);
      }
    }
    x += stap;
  }
  return x - x0;
}

function wikkelRegels(tekst: string, maxTekens: number, maxRegels: number): string[] {
  const woorden = tekst.trim().split(/\s+/).filter(Boolean);
  const regels: string[] = [];
  let cur = '';
  for (const w of woorden) {
    if (!cur) { cur = w.slice(0, maxTekens); continue; }
    if (cur.length + 1 + w.length <= maxTekens) cur += ` ${w}`;
    else {
      regels.push(cur);
      if (regels.length >= maxRegels) return regels;
      cur = w.slice(0, maxTekens);
    }
  }
  if (cur && regels.length < maxRegels) regels.push(cur);
  return regels;
}

export type ActieKaartInvoer = {
  categorie: BevestigCategorieId;
  taal: 'uk' | 'nl';
  titel: string;
  accountNaam: string;
  accountEmail?: string;
  accountFoto?: string;
  accountFotoBytes?: Buffer | null;
  accountLetter?: string;
  toestel?: string;
  plaats?: string;
  tijd?: string;
  gevoelig?: boolean;
};

/**
 * Генерує динамічну фірмову PNG-картку (800×400) для Telegram із піктограмою конкретної дії,
 * круглим фото саме цього облікового запису та компактними даними користувача.
 */
export function bouwActieKaartPng(invoer: ActieKaartInvoer): Buffer {
  const b = 800, h = 400;
  const cat = BEVESTIG_CATEGORIEEN[invoer.categorie] || BEVESTIG_CATEGORIEEN.algemeen;
  const kleur = hex(cat.kleur);
  const donker = hex(cat.donker);
  const zachtKleur = mix(WIT, kleur, 0.12);
  const d = new RgbaDoek(b, h, ACHTERGROND);

  // М’яка тінь та основна біла картка
  d.rechthoek(22, 22, b - 44, h - 44, [214, 222, 235], 28, 0.7);
  d.rechthoek(18, 16, b - 40, h - 40, WIT, 26);
  // Ліва кольорова панель категорії
  d.rechthoek(18, 16, 250, h - 40, zachtKleur, 26);
  d.rechthoek(242, 16, 26, h - 40, zachtKleur, 0);
  // Верхня тонка фірмова смужка акценту
  d.rechthoek(18, 16, b - 40, 10, kleur, 6);

  // Великий медальйон категорії дії (ліворуч)
  const mCx = 142, mCy = 186, mR = 82;
  d.cirkel(mCx, mCy, mR + 8, mix(WIT, kleur, 0.24));
  d.cirkel(mCx, mCy, mR, kleur);
  d.ring(mCx, mCy, mR - 6, 2, donker, 0.35);
  tekenCategorieIcoon(d, cat.id, mCx, mCy, 76, WIT);

  // Кругла фотографія конкретного облікового запису прямо поверх картки (як елемент на нижньому правому краї медальйона)
  const fCx = 204, fCy = 266, fR = 46;
  d.cirkel(fCx, fCy, fR + 6, WIT);
  d.ring(fCx, fCy, fR + 3, 3, kleur);
  const img = decodeBeeld(invoer.accountFotoBytes);
  if (img) {
    d.rondeFoto(fCx, fCy, fR, img);
  } else {
    d.cirkel(fCx, fCy, fR, MERK_BLAUW);
    const letter = ([...(invoer.accountLetter || invoer.accountNaam || '?').trim()][0] || '?').toUpperCase();
    tekenTekst(d, letter, fCx - 12, fCy - 17, 5, WIT, 40);
  }

  // Права частина: бренд + бейдж категорії
  const rx = 296;
  const maxW = 462;
  const site = invoer.taal === 'nl' ? 'MIJN RUIMTE' : 'МІЙ ПРОСТІР';
  tekenTekst(d, site, rx, 46, 2, MERK_BLAUW, 210);

  const badge = invoer.taal === 'nl' ? cat.badgeNl : cat.badgeUk;
  const badgeW = Math.min(250, Math.max(104, badge.length * 12 + 24));
  d.rechthoek(b - 42 - badgeW, 38, badgeW, 30, kleur, 15);
  tekenTekst(d, badge, b - 42 - badgeW + 12, 46, 2, WIT, badgeW - 20);

  // Назва конкретної дії (великий шрифт, до 2 рядків)
  const titelTekst = invoer.titel || (invoer.taal === 'nl' ? cat.nl : cat.uk);
  const regels = wikkelRegels(titelTekst, 24, 2);
  let y = 96;
  for (const r of regels) {
    tekenTekst(d, r, rx, y, 3, TEKST, maxW);
    y += 30;
  }

  // Роздільна лінія
  d.rechthoek(rx, 174, maxW, 2, RAND);

  // Блок облікового запису (ім’я та пошта саме того користувача/адміністратора)
  const wieKop = invoer.taal === 'nl' ? 'ACCOUNT' : 'АКАУНТ';
  tekenTekst(d, wieKop, rx, 192, 2, ZACHT, maxW);
  const naam = (invoer.accountNaam || invoer.accountEmail || '—').slice(0, 34);
  tekenTekst(d, naam, rx, 214, 2, TEKST, maxW);
  if (invoer.accountEmail && invoer.accountEmail !== naam) {
    tekenTekst(d, invoer.accountEmail.slice(0, 38), rx, 238, 2, ZACHT, maxW);
  }

  // Блок контексту: пристрій, місце, час
  d.rechthoek(rx, 272, maxW, 2, RAND);
  const details = [invoer.toestel, invoer.plaats].filter(Boolean).join(' · ');
  if (details) tekenTekst(d, details.slice(0, 38), rx, 290, 2, TEKST, maxW);
  if (invoer.tijd) tekenTekst(d, invoer.tijd.slice(0, 38), rx, 316, 2, ZACHT, maxW);

  // Нижня підказка безпеки
  const voet = invoer.taal === 'nl' ? 'BEVEILIGD VENSTER · GEEN CODES IN CHAT' : 'ЗАХИЩЕНЕ ВІКНО · БЕЗ КОДІВ У ЧАТІ';
  tekenTekst(d, voet, rx, 350, 1.5 >= 2 ? 2 : 1, ZACHT, maxW);

  return d.naarPng();
}

/** Асинхронна обгортка: підтягує фото конкретного акаунта (data-URI або Google URL) і будує PNG-картку. */
export async function bouwActieKaartMetFoto(invoer: ActieKaartInvoer): Promise<Buffer> {
  const bytes = invoer.accountFotoBytes ?? (await haalFotoBytes(invoer.accountFoto).catch(() => null));
  return bouwActieKaartPng({ ...invoer, accountFotoBytes: bytes });
}
