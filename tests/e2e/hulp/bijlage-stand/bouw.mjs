// Bouwt de stand (esbuild) en serveert hem + testbestanden op 127.0.0.1 (alleen lokaal). Gebruikt door bijlage-viewer-v2.e2e.ts.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import zlib from 'node:zlib';

export async function maakPdf(paginas = 6) {
  const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= paginas; i++) {
    const p = doc.addPage([595, 842]);
    p.drawRectangle({ x: 40, y: 760, width: 515, height: 40, color: rgb(0.16, 0.36, 0.7) });
    p.drawText(`Factuur oktober - pagina ${i}`, { x: 56, y: 774, size: 18, font: f, color: rgb(1, 1, 1) });
    for (let r = 0; r < 30; r++) p.drawText(`Regel ${r + 1}: omschrijving van dienst, bedrag ${(r * 13.5 + i).toFixed(2)} EUR`, { x: 56, y: 720 - r * 22, size: 11, font: f, color: rgb(0.1, 0.1, 0.12) });
    p.drawText(`${i} / ${paginas}`, { x: 280, y: 30, size: 10, font: f });
  }
  return Buffer.from(await doc.save());
}
/** Eenvoudige PNG (verloop) zonder extra pakketten. */
export function maakPng(w = 1600, h = 1000) {
  const rij = Buffer.alloc(1 + w * 3), rauw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) { rij[0] = 0; for (let x = 0; x < w; x++) { rij[1 + x * 3] = Math.round(40 + 160 * x / w); rij[2 + x * 3] = Math.round(90 + 120 * y / h); rij[3 + x * 3] = ((x >> 6) + (y >> 6)) % 2 ? 210 : 150; } rij.copy(rauw, y * rij.length); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const blok = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blok('IHDR', ihdr), blok('IDAT', zlib.deflateSync(rauw)), blok('IEND', Buffer.alloc(0))]);
}
// Node-ingebouwde modules (door enkele CJS-pakketten genoemd, vite vervangt ze ook door een lege browserversie): lege klassen.
const leeg = { name: 'leeg', setup(b) {
  b.onResolve({ filter: /^(node:)?(stream|events|fs|crypto|path|util|buffer|os|zlib)$/ }, (a) => ({ path: a.path, namespace: 'leeg' }));
  b.onLoad({ filter: /.*/, namespace: 'leeg' }, () => ({ contents: 'class X{};X.EventEmitter=X;X.Transform=X;X.Readable=X;X.Writable=X;X.Duplex=X;X.PassThrough=X;X.Stream=X;module.exports=X;', loader: 'js' }));
} };
export async function startStand() {
  const map = mkdtempSync(join(tmpdir(), 'bijlage-stand-'));
  await build({ entryPoints: ['tests/e2e/hulp/bijlage-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.gif': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' }, logLevel: 'error', plugins: [leeg], assetNames: '[name]-[hash]' });
  // pdf.js-worker (MailPdfVoorbeeld zet workerSrc via new URL(... import.meta.url)): naast de bundel leggen.
  const worker = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
  writeFileSync(join(map, 'pdf.worker.min.mjs'), readFileSync(worker));
  const bestanden = { '/f/factuur.pdf': [await maakPdf(6), 'application/pdf'], '/f/foto.png': [maakPng(), 'image/png'], '/f/notitie.txt': [Buffer.from('Тестовий текст\n'.repeat(200)), 'text/plain'] };
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand bijlage</title><link rel="stylesheet" href="/stand.css"><style>body{margin:0}</style></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (bestanden[p]) { res.writeHead(200, { 'content-type': bestanden[p][1] }).end(bestanden[p][0]); return; }
    if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'); return; }
    const f = join(map, p.replace(/^\/+/, '').replace(/.*\/(pdf\.worker\.min\.mjs)$/, '$1'));
    if (p !== '/' && existsSync(f)) { const e = extname(f); res.writeHead(200, { 'content-type': e === '.css' ? 'text/css' : e === '.mjs' || e === '.js' ? 'text/javascript' : 'application/octet-stream' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, stop: () => server.close(), map };
}
