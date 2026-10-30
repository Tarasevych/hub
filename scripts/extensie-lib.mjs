// Gedeelde functies voor het bouwen van het extensiepakket (ZIP) en het ondertekenen van het CRX3-pakket.
// Geen externe bibliotheken: een klein ZIP-schrijver (deflate via node:zlib) en een CRX3-schrijver (protobuf met de hand, RSA via node:crypto).
import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SITE = 'https://mcp.tarasevych.com';
export const UPDATE_URL = `${SITE}/downloads/updates.xml`;
export const CRX_URL = `${SITE}/downloads/mijn-ruimte-extension.crx`;

export function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  }).sort();
}

/** Bestanden van de extensie als {name, data}; `selfHosted` voegt update_url toe aan het manifest (alleen voor het CRX-pakket). */
export function extensionEntries(extDir, { selfHosted = false } = {}) {
  // store-url.txt is configuratie voor de site en signed/ bevat het ondertekende pakket zelf: beide horen niet in het pakket.
  return walk(extDir).filter((f) => !f.endsWith('store-url.txt') && !relative(extDir, f).split(sep).includes('signed')).map((file) => {
    const name = relative(extDir, file).split(sep).join('/');
    let data = readFileSync(file);
    if (selfHosted && name === 'manifest.json') {
      const manifest = JSON.parse(data.toString('utf8'));
      manifest.update_url = UPDATE_URL;
      data = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }
    return { name, data };
  });
}

/** Vingerafdruk van de inhoud (los van de compressie), zodat een CRX controleerbaar "actueel" is op elke machine. */
export function contentHash(entries) {
  const h = createHash('sha256');
  for (const { name, data } of entries) h.update(`${name}\0${createHash('sha256').update(data).digest('hex')}\n`);
  return h.digest('hex');
}

export function zip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const { name: rawName, data } of entries) {
    const name = Buffer.from(rawName, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;
    // vaste datum (1 jan 2026) zodat het pakket reproduceerbaar is
    const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, deflated); centrals.push(central, name);
    offset += local.length + name.length + deflated.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---- CRX3 (https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/crx3.proto) ----
const varint = (n) => { const out = []; let v = n; while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); return Buffer.from(out); };
const field = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);

/** Extensie-id: eerste 16 bytes van de SHA-256 van de publieke sleutel (SPKI-DER), elke hexcijfer als letter a-p. */
export function extensionIdFromPublicKey(spkiDer) {
  return [...createHash('sha256').update(spkiDer).digest().subarray(0, 16)].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
}

export function buildCrx3(zipBuffer, privateKeyPem) {
  const publicKey = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' });
  const crxId = createHash('sha256').update(publicKey).digest().subarray(0, 16);
  const signedHeaderData = field(1, crxId); // SignedData { crx_id = 1 }
  const signedData = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(signedHeaderData.length); return b; })(), signedHeaderData, zipBuffer]);
  const signature = sign('sha256', signedData, privateKeyPem);
  const proof = Buffer.concat([field(1, publicKey), field(2, signature)]); // AsymmetricKeyProof { public_key = 1, signature = 2 }
  const header = Buffer.concat([field(2, proof), field(10000, signedHeaderData)]); // CrxFileHeader { sha256_with_rsa = 2, signed_header_data = 10000 }
  const prefix = Buffer.alloc(12);
  prefix.write('Cr24', 0, 'latin1'); prefix.writeUInt32LE(3, 4); prefix.writeUInt32LE(header.length, 8);
  return { crx: Buffer.concat([prefix, header, zipBuffer]), extensionId: extensionIdFromPublicKey(publicKey), publicKeyBase64: publicKey.toString('base64') };
}

// ---- controle van een CRX3 (voor tests en voor de build): leest de header, controleert de handtekening en geeft het ZIP terug ----
function readField(buf, pos) {
  let tag = 0, shift = 0, p = pos;
  for (;;) { const b = buf[p++]; tag += (b & 127) * 2 ** shift; if (b < 128) break; shift += 7; }
  let len = 0; shift = 0;
  for (;;) { const b = buf[p++]; len += (b & 127) * 2 ** shift; if (b < 128) break; shift += 7; }
  return { number: Math.floor(tag / 8), wire: tag & 7, value: buf.subarray(p, p + len), next: p + len };
}
export function parseCrx3(crx) {
  if (crx.subarray(0, 4).toString('latin1') !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('Geen CRX3');
  const headerLength = crx.readUInt32LE(8);
  const header = crx.subarray(12, 12 + headerLength);
  const zipBuffer = crx.subarray(12 + headerLength);
  let proofBuf = null, signedHeaderData = null;
  for (let pos = 0; pos < header.length;) { const f = readField(header, pos); if (f.number === 2) proofBuf = f.value; if (f.number === 10000) signedHeaderData = f.value; pos = f.next; }
  if (!proofBuf || !signedHeaderData) throw new Error('CRX3-header onvolledig');
  let publicKey = null, signature = null;
  for (let pos = 0; pos < proofBuf.length;) { const f = readField(proofBuf, pos); if (f.number === 1) publicKey = f.value; if (f.number === 2) signature = f.value; pos = f.next; }
  const len = Buffer.alloc(4); len.writeUInt32LE(signedHeaderData.length);
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), len, signedHeaderData, zipBuffer]);
  const valid = verify('sha256', signed, createPublicKey({ key: publicKey, format: 'der', type: 'spki' }), signature);
  const crxId = readField(signedHeaderData, 0).value;
  return { valid, extensionId: extensionIdFromPublicKey(publicKey), crxIdMatchesKey: Buffer.compare(crxId, createHash('sha256').update(publicKey).digest().subarray(0, 16)) === 0, zip: zipBuffer, publicKeyBase64: publicKey.toString('base64') };
}

/** De bestanden uit een ZIP lezen (alleen deflate/stored, zoals onze eigen schrijver ze maakt) — voor de controle van het pakket. */
export function readZipEntries(zipBuf) {
  const { inflateRawSync } = require_zlib();
  const eocd = zipBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zipBuf.readUInt16LE(eocd + 10);
  let o = zipBuf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const method = zipBuf.readUInt16LE(o + 10), csize = zipBuf.readUInt32LE(o + 20);
    const nlen = zipBuf.readUInt16LE(o + 28), elen = zipBuf.readUInt16LE(o + 30), clen = zipBuf.readUInt16LE(o + 32), lho = zipBuf.readUInt32LE(o + 42);
    const name = zipBuf.toString('utf8', o + 46, o + 46 + nlen);
    const dataStart = lho + 30 + zipBuf.readUInt16LE(lho + 26) + zipBuf.readUInt16LE(lho + 28);
    const raw = zipBuf.subarray(dataStart, dataStart + csize);
    out.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    o += 46 + nlen + elen + clen;
  }
  return out;
}
import { inflateRawSync } from 'node:zlib';
function require_zlib() { return { inflateRawSync }; }
