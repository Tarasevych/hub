// PERF-001 (09.11.2026): statische bestanden van de site (bundels, stijlen, index.html) gecomprimeerd uitleveren.
//
// Waarom: server/start.ts stuurde elk bestand ongecomprimeerd. De startbundel was 2,4 MB (gzip: 0,7 MB) en elk subdomein
// (hub./id./mail./…) is voor de browser een eigen adres, dus elk onderdeel haalt bij het eerste openen opnieuw alle bundels.
// Tussen de server van de eigenaar en Cloudflare (tunnel, uploadsnelheid van een thuisverbinding) gaat dat nu ~3–4× kleiner.
//
// Hoe: per bestand (pad + grootte + mtime) één keer comprimeren — brotli (kwaliteit 5: snel en ~gzip-9 klein) of gzip — en het
// resultaat in het geheugen bewaren (LRU, samen hoogstens CACHE_MAX_BYTES). Alleen tekstsoorten vanaf MIN_BYTES; alleen als de
// browser het aanbiedt (Accept-Encoding); nooit als het resultaat niet kleiner is. Alles gebeurt asynchroon (zlib-threadpool),
// dus de server blijft andere verzoeken bedienen. Gaat comprimeren mis, dan valt de server terug op het gewone bestand.
//
// Veiligheid: het gaat om openbare, onveranderlijke bestanden zonder geheimen of door de gebruiker gestuurde tekst (geen
// BREACH-risico). API-antwoorden worden hier NIET gecomprimeerd (die comprimeert Cloudflare zelf richting de browser).
import { readFile } from 'node:fs/promises';
import { brotliCompress, constants as zc, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

export const COMPRIMEERBAAR = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest', '.map', '.xml', '.wasm']);
export const MIN_BYTES = 1024;
export const MAX_BRON_BYTES = 32 * 1024 * 1024;
const CACHE_MAX_BYTES = Math.max(4, Number(process.env.STATISCH_COMPRESSIE_CACHE_MB || 64)) * 1024 * 1024;

export type Codering = 'br' | 'gzip';

/** Kiest de codering uit Accept-Encoding (q=0 telt als «niet»); brotli heeft voorrang. */
export function kiesCodering(acceptEncoding: string | string[] | undefined): Codering | null {
  const kop = (Array.isArray(acceptEncoding) ? acceptEncoding.join(',') : String(acceptEncoding || '')).toLowerCase();
  if (!kop) return null;
  const mag = (naam: string) => kop.split(',').some((deel) => {
    const [n, ...params] = deel.trim().split(';').map((x) => x.trim());
    if (n !== naam && n !== '*') return false;
    const q = params.find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
  if (mag('br')) return 'br';
  if (mag('gzip')) return 'gzip';
  return null;
}

type Item = { buf: Buffer; sleutel: string };
const cache = new Map<string, Item>();
const bezig = new Map<string, Promise<Buffer | null>>();
let cacheBytes = 0;

function bewaar(sleutel: string, buf: Buffer) {
  if (buf.length > CACHE_MAX_BYTES / 4) return;
  const oud = cache.get(sleutel);
  if (oud) { cacheBytes -= oud.buf.length; cache.delete(sleutel); }
  cache.set(sleutel, { buf, sleutel });
  cacheBytes += buf.length;
  for (const [k, v] of cache) { if (cacheBytes <= CACHE_MAX_BYTES) break; cache.delete(k); cacheBytes -= v.buf.length; }
}

/**
 * Gecomprimeerde inhoud van `bestand` (of null: niet de moeite / niet mogelijk). `versie` = grootte + mtime, zodat een nieuwe
 * release (andere mtime) nooit een oude gecomprimeerde versie krijgt.
 */
export async function gecomprimeerd(bestand: string, ext: string, grootte: number, versie: string, codering: Codering): Promise<Buffer | null> {
  if (!COMPRIMEERBAAR.has(ext) || grootte < MIN_BYTES || grootte > MAX_BRON_BYTES) return null;
  const sleutel = `${codering}\0${bestand}\0${versie}`;
  const hit = cache.get(sleutel);
  if (hit) { cache.delete(sleutel); cache.set(sleutel, hit); return hit.buf; } // LRU: achteraan
  let p = bezig.get(sleutel);
  if (!p) {
    p = (async () => {
      try {
        const bron = await readFile(bestand);
        const uit = codering === 'br'
          ? await brotli(bron, { params: { [zc.BROTLI_PARAM_QUALITY]: 5, [zc.BROTLI_PARAM_SIZE_HINT]: bron.length, [zc.BROTLI_PARAM_MODE]: ext === '.wasm' ? zc.BROTLI_MODE_GENERIC : zc.BROTLI_MODE_TEXT } })
          : await gz(bron, { level: 6 });
        if (uit.length >= bron.length * 0.95) return null;
        bewaar(sleutel, uit);
        return uit;
      } catch { return null; }
    })();
    bezig.set(sleutel, p);
    void p.finally(() => bezig.delete(sleutel));
  }
  return p;
}

/** Voor tests: cache leegmaken. */
export function compressieCacheLegen() { cache.clear(); bezig.clear(); cacheBytes = 0; }
export const compressieCacheBytes = () => cacheBytes;
