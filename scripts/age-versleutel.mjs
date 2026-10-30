// Versleutelt stdin naar een age-bestand (v1, X25519) voor een publieke age-sleutel, met alleen Node (geen age.exe nodig).
// Reden: op deze pc blokkeert Device Guard age.exe, maar Node draait wel. Het resultaat is een gewoon age-bestand: het wordt
// ontsleuteld met `age -d -i <herstelsleutel>` (op elke machine waar age mag draaien). Compatibiliteit wordt gecontroleerd met de echte age
// op de server (zie tests/eenheid/age-versleutel.test.ts-achtige controle in de handleiding, en volledige-kopie.ps1).
//   gebruik:  <bron> | node age-versleutel.mjs <publieke-sleutel-bestand> <uitvoerbestand.age>
// Formaat: https://age-encryption.org/v1
import { createCipheriv, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const polymod = (values) => {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) { const top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i += 1) if ((top >>> i) & 1) chk ^= GEN[i]; }
  return chk >>> 0;
};
const hrpExpand = (hrp) => [...[...hrp].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

/** Bech32-sleutel (age1...) naar 32 bytes. */
export function decodeRecipient(text) {
  const s = text.trim().toLowerCase();
  const pos = s.lastIndexOf('1');
  const hrp = s.slice(0, pos);
  if (hrp !== 'age') throw new Error('Geen age-publieke sleutel');
  const data = [...s.slice(pos + 1)].map((c) => { const i = CHARSET.indexOf(c); if (i < 0) throw new Error('Ongeldig teken in sleutel'); return i; });
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error('Controlesom van de sleutel klopt niet');
  const words = data.slice(0, -6);
  let acc = 0, bits = 0; const out = [];
  for (const w of words) { acc = (acc << 5) | w; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; } }
  if (out.length !== 32) throw new Error('Onverwachte sleutellengte');
  return Buffer.from(out);
}

const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '');
const chacha = (key, nonce, data) => {
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  return Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
};
const hkdf = (ikm, salt, info) => Buffer.from(hkdfSync('sha256', ikm, salt, info, 32));

/** Zet `plaintext` (Buffer) om naar een age-bestand voor de ontvanger. */
export function encrypt(plaintext, recipient) {
  const fileKey = randomBytes(16);
  const eph = generateKeyPairSync('x25519');
  const share = Buffer.from(eph.publicKey.export({ format: 'jwk' }).x, 'base64url');
  const rcpt = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: recipient.toString('base64url') }, format: 'jwk' });
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: rcpt });
  const wrapKey = hkdf(shared, Buffer.concat([share, recipient]), 'age-encryption.org/v1/X25519');
  const body = chacha(wrapKey, Buffer.alloc(12), fileKey);
  const headerNoMac = `age-encryption.org/v1\n-> X25519 ${b64(share)}\n${b64(body)}\n---`;
  const mac = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(headerNoMac).digest();
  const nonce = randomBytes(16);
  const streamKey = hkdf(fileKey, nonce, 'payload');
  const CHUNK = 65536;
  const chunks = [];
  let counter = 0n;
  const seal = (data, last) => {
    const n = Buffer.alloc(12);
    n.writeBigUInt64BE(counter, 3); // 11 bytes big-endian teller (de bovenste 3 bytes blijven 0)
    n[11] = last ? 1 : 0;
    counter += 1n;
    chunks.push(chacha(streamKey, n, data));
  };
  let offset = 0;
  while (plaintext.length - offset > CHUNK) { seal(plaintext.subarray(offset, offset + CHUNK), false); offset += CHUNK; }
  seal(plaintext.subarray(offset), true); // laatste (mag leeg zijn bij een leeg bestand)
  return Buffer.concat([Buffer.from(`${headerNoMac} ${b64(mac)}\n`, 'latin1'), nonce, ...chunks]);
}

// ---- opdrachtregel ----
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('age-versleutel.mjs')) {
  const [pubFile, outFile] = process.argv.slice(2);
  if (!pubFile || !outFile) { console.error('gebruik: <bron> | node age-versleutel.mjs <publieke-sleutel-bestand> <uitvoer.age>'); process.exit(2); }
  const match = readFileSync(pubFile, 'utf8').match(/age1[a-z0-9]+/);
  if (!match) { console.error('geen age-publieke sleutel gevonden in ' + pubFile); process.exit(2); }
  const parts = [];
  for await (const part of process.stdin) parts.push(part);
  writeFileSync(outFile, encrypt(Buffer.concat(parts), decodeRecipient(match[0])));
}
