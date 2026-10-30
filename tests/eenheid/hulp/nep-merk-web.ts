// Testhulp (geen test zelf): een NAGEBOOTST stukje internet voor backend/merk-bron.ts — een echte HTTPS-server op 127.0.0.1 met een
// eigen, kortlevend certificaat (openssl, één dag geldig, alleen in een tijdelijke map) voor een reeks testnamen, en een DNS-
// nabootser (TXT + A/AAAA). Er gaat geen byte naar buiten: elke naam wijst naar een documentatie-adres (203.0.113.0/24, RFC 5737)
// dat de dienst als PUBLIEK ziet, en alleen de testnaad `verbindMet` laat de socket daarna naar 127.0.0.1 gaan. Zo loopt precies
// dezelfde code als in productie: resolven, controleren, pinnen, TLS met SNI en certificaatcontrole, omleidingen, grenzen.
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

export type NepAntwoord = { status?: number; headers?: Record<string, string>; body?: Buffer | string };
export type NepRoute = (pad: string, kop: Record<string, string | string[] | undefined>) => NepAntwoord | null;
export type NepVerzoek = { host: string; pad: string; kop: Record<string, string | string[] | undefined> };

/** Een echte PNG van 1×1 pixel (geldige IHDR, IDAT en IEND met CRC). */
export function png(rgb: [number, number, number] = [0, 120, 212]): Buffer {
  const stuk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), stuk('IHDR', ihdr), stuk('IDAT', deflateSync(Buffer.from([0, ...rgb]))), stuk('IEND', Buffer.alloc(0))]);
}
/** Een ICO-bestand met één PNG erin. */
export function ico(): Buffer {
  const p = png([240, 80, 30]);
  const kop = Buffer.from([0, 0, 1, 0, 1, 0]);
  const dir = Buffer.alloc(16); dir[0] = 1; dir[1] = 1; dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6); dir.writeUInt32LE(p.length, 8); dir.writeUInt32LE(22, 12);
  return Buffer.concat([kop, dir, p]);
}
/** Een (niet decodeerbare, maar aan de handtekening herkenbare) JPEG. */
export const jpeg = (merk: string): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from(`JFIF\u0000${merk}`, 'latin1'), Buffer.from([0xff, 0xd9])]);

export async function nepMerkWeb(namen: readonly string[], routes: Record<string, NepRoute>) {
  const map = mkdtempSync(join(tmpdir(), 'nep-merk-web-'));
  let key: Buffer, cert: Buffer;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(map, 'key.pem'), '-out', join(map, 'cert.pem'), '-days', '1',
      '-subj', '/CN=nep-merk-web', '-addext', `subjectAltName=${namen.map((n) => `DNS:${n}`).join(',')}`], { stdio: 'ignore' });
    key = readFileSync(join(map, 'key.pem')); cert = readFileSync(join(map, 'cert.pem'));
  } finally { rmSync(map, { recursive: true, force: true }); }
  const verzoeken: NepVerzoek[] = [];
  const server = https.createServer({ key, cert }, (req, res) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    const pad = String(req.url || '/');
    verzoeken.push({ host, pad, kop: { ...req.headers } });
    const a = routes[host]?.(pad, req.headers) ?? { status: 404, body: 'niet gevonden' };
    res.writeHead(a.status ?? 200, a.headers ?? {});
    res.end(a.body ?? '');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const poort = (server.address() as { port: number }).port;
  return {
    poort, ca: cert.toString('utf8'), verzoeken,
    aantal: (host: string) => verzoeken.filter((v) => v.host === host).length,
    sluit: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
