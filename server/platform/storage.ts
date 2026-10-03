// Compatibiliteitslaag voor de vroegere AppDeploy `storage`-API, op het lokale bestandssysteem
// onder UPLOADS_DIR (standaard /srv/data/uploads).
//
// AppDeploy gaf bij `read` exact de string terug die bij `write` was opgegeven (in deze app
// altijd base64). Om bestanden op schijf bruikbaar te houden, decoderen we geldige base64
// naar ruwe bytes en noteren we de codering in app.storage_objects; `read` codeert weer terug.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from './pg';

const root = () => path.resolve(process.env.UPLOADS_DIR || '/srv/data/uploads');

const PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\-]*(\/[A-Za-z0-9][A-Za-z0-9_.\-]*)*$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript)\b)/i;

/** Strikte padcontrole: relatief, geen '..', geen dubbele of afsluitende '/', binnen de root. */
export function resolveStoragePath(relative: string): string {
  if (typeof relative !== 'string' || relative.length === 0 || relative.length > 512) throw new Error('STORAGE_PATH_INVALID');
  if (!PATH_PATTERN.test(relative)) throw new Error('STORAGE_PATH_INVALID');
  if (relative.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.tmp-'))) throw new Error('STORAGE_PATH_INVALID');
  const base = root();
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep)) throw new Error('STORAGE_PATH_INVALID');
  return full;
}

async function saveMeta(p: string, contentType: string, size: number, sha256: string, encoding: 'base64' | 'utf8') {
  await getPool().query(
    `INSERT INTO app.storage_objects (path, content_type, size_bytes, sha256, encoding)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (path) DO UPDATE SET content_type = EXCLUDED.content_type, size_bytes = EXCLUDED.size_bytes,
       sha256 = EXCLUDED.sha256, encoding = EXCLUDED.encoding, created_at = now()`,
    [p, contentType, size, sha256, encoding],
  );
}

export const storage = {
  /** Schrijf bestanden (atomisch). Geeft per bestand true/false terug. */
  async write(items: Array<{ path: string; content: string; contentType: string }>): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const item of items || []) {
      try {
        const full = resolveStoragePath(item.path);
        const content = String(item.content ?? '');
        const contentType = String(item.contentType || 'application/octet-stream').slice(0, 200);
        const asBase64 = !TEXT_TYPES.test(contentType) && content.length % 4 === 0 && BASE64_PATTERN.test(content);
        const bytes = asBase64 ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
        await mkdir(path.dirname(full), { recursive: true, mode: 0o750 });
        const tmp = path.join(path.dirname(full), `.tmp-${randomBytes(8).toString('hex')}`);
        await writeFile(tmp, bytes, { mode: 0o640, flag: 'wx' });
        await rename(tmp, full);
        await saveMeta(item.path, contentType, bytes.length, createHash('sha256').update(bytes).digest('hex'), asBase64 ? 'base64' : 'utf8');
        results.push(true);
      } catch (err) {
        console.error('[storage.write] mislukt:', (err as Error).message);
        results.push(false);
      }
    }
    return results;
  },

  /** Lees bestanden. content is null als het bestand ontbreekt of het pad ongeldig is. */
  async read(paths: string[]): Promise<Array<{ path: string; content: string | null }>> {
    const list = (paths || []).map(String);
    const valid = list.filter((p) => { try { resolveStoragePath(p); return true; } catch { return false; } });
    const encodings = new Map<string, string>();
    if (valid.length) {
      const result = await getPool().query('SELECT path, encoding FROM app.storage_objects WHERE path = ANY($1::text[])', [valid]);
      for (const row of result.rows) encodings.set(row.path, row.encoding);
    }
    const out: Array<{ path: string; content: string | null }> = [];
    for (const p of list) {
      try {
        const bytes = await readFile(resolveStoragePath(p));
        out.push({ path: p, content: encodings.get(p) === 'utf8' ? bytes.toString('utf8') : bytes.toString('base64') });
      } catch {
        out.push({ path: p, content: null });
      }
    }
    return out;
  },

  /** Verwijder bestanden. true als het bestand bestond en verwijderd is. */
  async delete(paths: string[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const p of paths || []) {
      try {
        const full = resolveStoragePath(String(p));
        await stat(full);
        await rm(full);
        await getPool().query('DELETE FROM app.storage_objects WHERE path = $1', [p]);
        results.push(true);
      } catch {
        results.push(false);
      }
    }
    return results;
  },

  /** Lijst paden (optioneel met prefix). Wordt door de app niet gebruikt; eenvoudige implementatie. */
  async list(options: { prefix?: string; nextToken?: string; limit?: number } = {}): Promise<{ paths: string[]; nextToken?: string }> {
    const prefix = String(options.prefix || '');
    const limit = Math.max(1, Math.min(1000, Number(options.limit) || 100));
    const after = String(options.nextToken || '');
    const result = await getPool().query(
      'SELECT path FROM app.storage_objects WHERE path LIKE $1 AND path > $2 ORDER BY path LIMIT $3',
      [prefix.replace(/[\\%_]/g, (c) => '\\' + c) + '%', after, limit + 1],
    );
    const paths = result.rows.slice(0, limit).map((r) => r.path as string);
    return result.rows.length > limit ? { paths, nextToken: paths[paths.length - 1] } : { paths };
  },

  /** Ondertekende URL's bestonden alleen bij AppDeploy en worden niet gebruikt. */
  async url(): Promise<Array<{ path: string; url: string }>> {
    throw new Error('STORAGE_URL_NIET_ONDERSTEUND');
  },
};

// Hulpfunctie voor diagnose: bestaat de uploadmap en is die schrijfbaar?
export async function storageReady(): Promise<boolean> {
  try {
    const s = await stat(root());
    if (!s.isDirectory()) return false;
    await readdir(root());
    return true;
  } catch {
    return false;
  }
}
