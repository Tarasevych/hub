// Bouwt de zoekstand (esbuild) en serveert hem op 127.0.0.1 (alleen lokaal). Gebruikt door mail-zoeken-v2.e2e.ts.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
export async function startStand() {
  const map = mkdtempSync(join(tmpdir(), 'zoeken-stand-'));
  await build({ entryPoints: ['tests/e2e/hulp/zoeken-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.gif': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' }, logLevel: 'error' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand zoeken</title><link rel="stylesheet" href="/stand.css"><style>body{margin:0}</style></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }).end('{"value":false}'); return; }
    const f = join(map, p.replace(/^\/+/, ''));
    if (p !== '/' && existsSync(f)) { const e = extname(f); res.writeHead(200, { 'content-type': e === '.css' ? 'text/css' : e === '.js' ? 'text/javascript' : 'application/octet-stream' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, stop: () => server.close(), map };
}
