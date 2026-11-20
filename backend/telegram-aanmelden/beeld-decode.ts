// UPD-011: легкий серверний декодер PNG та Baseline JPEG без сторонніх пакетів для накладання
// круглого фото конкретного облікового запису на фірмову картку дії Telegram (kaarten.ts).
// Lichte PNG- en Baseline JPEG-decoder op de server zonder externe pakketten.
import { inflateSync } from 'node:zlib';

export type GedecodeerdBeeld = { width: number; height: number; rgba: Uint8Array };

const DATA_RE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/;
const VEILIG_DATA_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_FOTO_BYTES = 512 * 1024;
const MAX_ZIJDE = 2048;

function veiligeFoto(waarde: unknown): string {
  const ruw = String(waarde || '').trim();
  if (VEILIG_DATA_RE.test(ruw) && ruw.length <= 340000) return ruw;
  try {
    const u = new URL(ruw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || !(host === 'lh3.googleusercontent.com' || host.endsWith('.googleusercontent.com'))) return '';
    u.hash = '';
    return u.toString();
  } catch { return ''; }
}

// ------------------------------------------------------------------------------------------------ PNG декодер
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf: Buffer): GedecodeerdBeeld | null {
  if (buf.length < 33) return null;
  if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71 || buf[4] !== 13 || buf[5] !== 10 || buf[6] !== 26 || buf[7] !== 10) return null;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idats: Buffer[] = [];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) return null;
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      if (len < 13) return null;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (!width || !height || width > MAX_ZIJDE || height > MAX_ZIJDE || bitDepth !== 8 || interlace !== 0) return null;
    } else if (type === 'PLTE') {
      palette = new Uint8Array(data);
    } else if (type === 'tRNS') {
      trns = new Uint8Array(data);
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!width || !height || !idats.length) return null;
  const bpp = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!bpp) return null;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idats));
  } catch {
    return null;
  }
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return null;
  const recon = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const srcOff = y * (stride + 1) + 1;
    const dstOff = y * stride;
    for (let x = 0; x < stride; x++) {
      const xVal = raw[srcOff + x];
      const a = x >= bpp ? recon[dstOff + x - bpp] : 0;
      const b = y > 0 ? recon[dstOff - stride + x] : 0;
      const c = x >= bpp && y > 0 ? recon[dstOff - stride + x - bpp] : 0;
      let v = xVal;
      if (f === 1) v = (xVal + a) & 0xff;
      else if (f === 2) v = (xVal + b) & 0xff;
      else if (f === 3) v = (xVal + ((a + b) >> 1)) & 0xff;
      else if (f === 4) v = (xVal + paeth(a, b, c)) & 0xff;
      recon[dstOff + x] = v;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (colorType === 6) {
      rgba[o] = recon[o]; rgba[o + 1] = recon[o + 1]; rgba[o + 2] = recon[o + 2]; rgba[o + 3] = recon[o + 3];
    } else if (colorType === 2) {
      const s = i * 3;
      rgba[o] = recon[s]; rgba[o + 1] = recon[s + 1]; rgba[o + 2] = recon[s + 2]; rgba[o + 3] = 255;
    } else if (colorType === 0) {
      const g = recon[i];
      rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
    } else if (colorType === 4) {
      const s = i * 2;
      const g = recon[s];
      rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = recon[s + 1];
    } else if (colorType === 3 && palette) {
      const idx = recon[i];
      rgba[o] = palette[idx * 3] ?? 0;
      rgba[o + 1] = palette[idx * 3 + 1] ?? 0;
      rgba[o + 2] = palette[idx * 3 + 2] ?? 0;
      rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { width, height, rgba };
}

// ------------------------------------------------------------------------------------------------ Baseline JPEG декодер
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const COS_TAB: Float64Array = (() => {
  const t = new Float64Array(64);
  for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) t[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16) * (u === 0 ? 1 / Math.SQRT2 : 1);
  return t;
})();

type Huff = { codes: Map<number, number>; maxLen: number };
function bouwHuff(counts: Uint8Array, syms: Uint8Array): Huff {
  const codes = new Map<number, number>();
  let code = 0, idx = 0, maxLen = 0;
  for (let len = 1; len <= 16; len++) {
    const n = counts[len - 1];
    for (let i = 0; i < n; i++) {
      codes.set((len << 16) | code, syms[idx++]);
      code++;
      maxLen = len;
    }
    code <<= 1;
  }
  return { codes, maxLen };
}
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function idct8x8(block: Int32Array, out: Uint8Array) {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += block[y * 8 + u] * COS_TAB[u * 8 + x];
      tmp[y * 8 + x] = s;
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += tmp[v * 8 + x] * COS_TAB[v * 8 + y];
      out[y * 8 + x] = clamp255(Math.round(s * 0.25 + 128));
    }
  }
}

export function decodeJpeg(buf: Buffer): GedecodeerdBeeld | null {
  if (buf.length < 16 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const qt: Array<Uint8Array | null> = [null, null, null, null];
  const huffDc: Array<Huff | null> = [null, null, null, null];
  const huffAc: Array<Huff | null> = [null, null, null, null];
  type Comp = { id: number; h: number; v: number; q: number; dc: number; ac: number; pred: number };
  let comps: Comp[] = [];
  let width = 0, height = 0, maxH = 1, maxV = 1, dri = 0;
  let pos = 2;
  let scanStart = -1;

  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) { pos++; continue; }
    while (pos < buf.length && buf[pos] === 0xff) pos++;
    if (pos >= buf.length) break;
    const marker = buf[pos++];
    if (marker === 0xd9 || marker === 0x00) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (pos + 2 > buf.length) return null;
    const segLen = buf.readUInt16BE(pos);
    if (segLen < 2 || pos + segLen > buf.length) return null;
    const segEnd = pos + segLen;
    let p = pos + 2;

    if (marker === 0xdb) { // DQT
      while (p < segEnd) {
        const pqTq = buf[p++];
        const prec = pqTq >> 4, id = pqTq & 0x0f;
        if (prec !== 0 || id > 3 || p + 64 > segEnd) return null;
        qt[id] = new Uint8Array(buf.subarray(p, p + 64));
        p += 64;
      }
    } else if (marker === 0xc4) { // DHT
      while (p < segEnd) {
        const tcTh = buf[p++];
        const tc = tcTh >> 4, th = tcTh & 0x0f;
        if (th > 3 || p + 16 > segEnd) return null;
        const counts = buf.subarray(p, p + 16);
        p += 16;
        let total = 0;
        for (let i = 0; i < 16; i++) total += counts[i];
        if (p + total > segEnd) return null;
        const syms = buf.subarray(p, p + total);
        p += total;
        const h = bouwHuff(counts, syms);
        if (tc === 0) huffDc[th] = h; else huffAc[th] = h;
      }
    } else if (marker === 0xc0) { // SOF0 Baseline DCT
      const prec = buf[p++];
      if (prec !== 8) return null;
      height = buf.readUInt16BE(p); p += 2;
      width = buf.readUInt16BE(p); p += 2;
      const n = buf[p++];
      if (!width || !height || width > MAX_ZIJDE || height > MAX_ZIJDE || (n !== 1 && n !== 3)) return null;
      comps = [];
      maxH = 1; maxV = 1;
      for (let i = 0; i < n; i++) {
        const id = buf[p++], hv = buf[p++], q = buf[p++];
        const h = hv >> 4, v = hv & 0x0f;
        if (!h || !v || h > 2 || v > 2 || q > 3) return null;
        maxH = Math.max(maxH, h); maxV = Math.max(maxV, v);
        comps.push({ id, h, v, q, dc: 0, ac: 0, pred: 0 });
      }
    } else if (marker === 0xc2) {
      return null; // Progressive JPEG — fallback на ініціал (не ламає картку)
    } else if (marker === 0xdd) { // DRI
      dri = buf.readUInt16BE(p);
    } else if (marker === 0xda) { // SOS
      const ns = buf[p++];
      if (ns !== comps.length) return null;
      for (let i = 0; i < ns; i++) {
        const cid = buf[p++], tdTa = buf[p++];
        const c = comps.find((x) => x.id === cid);
        if (!c) return null;
        c.dc = tdTa >> 4; c.ac = tdTa & 0x0f;
      }
      scanStart = segEnd;
      break;
    }
    pos = segEnd;
  }

  if (scanStart < 0 || !width || !height || !comps.length) return null;
  for (const c of comps) if (!qt[c.q] || !huffDc[c.dc] || !huffAc[c.ac]) return null;

  let bytePos = scanStart, bitBuf = 0, bitCnt = 0;
  const readBit = (): number => {
    if (bitCnt === 0) {
      if (bytePos >= buf.length) return 0;
      let b = buf[bytePos++];
      if (b === 0xff) {
        if (bytePos < buf.length && buf[bytePos] === 0x00) bytePos++;
        else { bytePos = Math.min(buf.length, bytePos + 1); b = 0; }
      }
      bitBuf = b; bitCnt = 8;
    }
    bitCnt--;
    return (bitBuf >> bitCnt) & 1;
  };
  const readBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | readBit();
    return v;
  };
  const decodeSym = (h: Huff): number => {
    let code = 0;
    for (let len = 1; len <= h.maxLen; len++) {
      code = (code << 1) | readBit();
      const s = h.codes.get((len << 16) | code);
      if (s !== undefined) return s;
    }
    return 0;
  };
  const extend = (v: number, s: number) => (s === 0 ? 0 : v < (1 << (s - 1)) ? v - ((1 << s) - 1) : v);

  const mcuW = maxH * 8, mcuH = maxV * 8;
  const mcusX = Math.ceil(width / mcuW), mcusY = Math.ceil(height / mcuH);
  const rgba = new Uint8Array(width * height * 4);
  const block = new Int32Array(64);
  const sampleBufs = comps.map((c) => Array.from({ length: c.h * c.v }, () => new Uint8Array(64)));
  let mcuIdx = 0;

  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (dri > 0 && mcuIdx > 0 && mcuIdx % dri === 0) {
        bitCnt = 0;
        while (bytePos < buf.length - 1 && !(buf[bytePos] === 0xff && buf[bytePos + 1] >= 0xd0 && buf[bytePos + 1] <= 0xd7)) bytePos++;
        if (bytePos < buf.length - 1) bytePos += 2;
        for (const c of comps) c.pred = 0;
      }
      for (let ci = 0; ci < comps.length; ci++) {
        const c = comps[ci], q = qt[c.q]!, hdc = huffDc[c.dc]!, hac = huffAc[c.ac]!;
        let bi = 0;
        for (let bv = 0; bv < c.v; bv++) {
          for (let bh = 0; bh < c.h; bh++) {
            block.fill(0);
            const sDc = decodeSym(hdc);
            const diff = extend(readBits(sDc), sDc);
            c.pred += diff;
            block[0] = c.pred * q[0];
            let k = 1;
            while (k < 64) {
              const rs = decodeSym(hac);
              if (rs === 0) break;
              const run = rs >> 4, sz = rs & 0x0f;
              if (rs === 0xf0) { k += 16; continue; }
              k += run;
              if (k >= 64) break;
              block[ZIGZAG[k]] = extend(readBits(sz), sz) * q[k];
              k++;
            }
            idct8x8(block, sampleBufs[ci][bi++]);
          }
        }
      }
      mcuIdx++;
      for (let py = 0; py < mcuH; py++) {
        const gy = my * mcuH + py;
        if (gy >= height) continue;
        for (let px = 0; px < mcuW; px++) {
          const gx = mx * mcuW + px;
          if (gx >= width) continue;
          const samp = (ci: number): number => {
            const c = comps[ci];
            const sx = Math.floor((px * c.h) / maxH);
            const sy = Math.floor((py * c.v) / maxV);
            const bIdx = (sy >> 3) * c.h + (sx >> 3);
            return sampleBufs[ci][bIdx][((sy & 7) << 3) | (sx & 7)];
          };
          const o = (gy * width + gx) * 4;
          if (comps.length === 1) {
            const y = samp(0);
            rgba[o] = y; rgba[o + 1] = y; rgba[o + 2] = y; rgba[o + 3] = 255;
          } else {
            const y = samp(0), cb = samp(1) - 128, cr = samp(2) - 128;
            rgba[o] = clamp255(Math.round(y + 1.402 * cr));
            rgba[o + 1] = clamp255(Math.round(y - 0.344136 * cb - 0.714136 * cr));
            rgba[o + 2] = clamp255(Math.round(y + 1.772 * cb));
            rgba[o + 3] = 255;
          }
        }
      }
    }
  }
  return { width, height, rgba };
}

export function decodeBeeld(buf: Buffer | null | undefined): GedecodeerdBeeld | null {
  if (!buf || buf.length < 16 || buf.length > MAX_FOTO_BYTES) return null;
  if (buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return decodePng(buf);
  if (buf[0] === 0xff && buf[1] === 0xd8) return decodeJpeg(buf);
  return null;
}

// Короткий кеш завантажених аватарів (10 хв, до 64 записів) без зберігання на диск.
const fotoCache = new Map<string, { tot: number; bytes: Buffer | null }>();

/**
 * Отримує байти фото конкретного облікового запису (data-URI або дозволена https-адреса Google).
 * Ніколи не кидає помилок; при відмові повертає null (картка намалює ініціал).
 */
export async function haalFotoBytes(foto: string | undefined): Promise<Buffer | null> {
  const schoon = veiligeFoto(foto);
  if (!schoon) return null;
  const m = DATA_RE.exec(schoon);
  if (m) {
    const b = Buffer.from(m[2], 'base64');
    return b.length >= 16 && b.length <= MAX_FOTO_BYTES ? b : null;
  }
  if (!schoon.startsWith('https://')) return null;
  const nu = Date.now();
  const hit = fotoCache.get(schoon);
  if (hit && hit.tot > nu) return hit.bytes;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500);
    (timer as { unref?: () => void }).unref?.();
    const res = await fetch(schoon, { signal: ac.signal, redirect: 'follow' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = Buffer.from(await res.arrayBuffer());
    const ok = arr.length >= 16 && arr.length <= MAX_FOTO_BYTES ? arr : null;
    if (fotoCache.size >= 64) fotoCache.clear();
    fotoCache.set(schoon, { tot: nu + 10 * 60_000, bytes: ok });
    return ok;
  } catch {
    return null;
  }
}
