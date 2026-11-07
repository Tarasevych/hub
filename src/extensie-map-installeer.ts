// Встановлення розширення прямо з браузера в теку, яку користувач обирає сам у рідному вікні (File System Access API, Chromium).
// Браузер не віддає повний шлях — лише дескриптор: ми обираємо теку, перевіряємо SHA-256, розпаковуємо й записуємо файли самі.
import { unzipSync } from 'fflate';

export type PickerError = 'CANCELLED' | 'UNSUPPORTED' | 'BLOCKED' | 'DENIED' | 'DOWNLOAD' | 'SHA' | 'BAD_ZIP' | 'WRITE';
export class PickerFailure extends Error { constructor(public code: PickerError) { super(code); } }

type Dir = { name: string; getDirectoryHandle: (n: string, o?: { create?: boolean }) => Promise<Dir>; getFileHandle: (n: string, o?: { create?: boolean }) => Promise<{ createWritable: () => Promise<{ write: (d: BufferSource) => Promise<void>; close: () => Promise<void> }> }> };
export const folderPickerSupported = () => typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const MAX_FILES = 100; const MAX_BYTES = 8 * 1024 * 1024;
export const SUBFOLDER = 'MijnRuimte-extension';

export async function installExtensionToPickedFolder(opts: { origin: string; sha256: string; file?: string; onStage?: (stage: 'download' | 'verify' | 'write') => void }): Promise<{ folderName: string; files: number }> {
  if (!folderPickerSupported()) throw new PickerFailure('UNSUPPORTED');
  // Вікно вибору теки мусить відкритися першим, у відповідь на клік користувача.
  let root: Dir;
  try { root = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Dir> }).showDirectoryPicker({ id: 'mijn-ruimte-extension', mode: 'readwrite' }); }
  catch (e) {
    const name = (e as { name?: string }).name;
    throw new PickerFailure(name === 'AbortError' ? 'CANCELLED' : name === 'SecurityError' ? 'BLOCKED' : 'DENIED');
  }
  opts.onStage?.('download');
  let bytes: Uint8Array;
  try {
    const res = await fetch(`${opts.origin}/downloads/${opts.file || 'mijn-ruimte-extension.zip'}`, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error('http');
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch { throw new PickerFailure('DOWNLOAD'); }
  opts.onStage?.('verify');
  if (hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource)) !== opts.sha256.toLowerCase()) throw new PickerFailure('SHA');
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new PickerFailure('BAD_ZIP'); }
  const entries = Object.entries(files).filter(([name]) => !name.endsWith('/'));
  if (!entries.length || entries.length > MAX_FILES || entries.reduce((a, [, d]) => a + d.length, 0) > MAX_BYTES) throw new PickerFailure('BAD_ZIP');
  opts.onStage?.('write');
  try {
    const target = await root.getDirectoryHandle(SUBFOLDER, { create: true });
    for (const [name, data] of entries) {
      const parts = name.split('/').filter(Boolean);
      if (parts.some((p) => p === '..' || p === '.' || p.includes('\\') || p.includes(':'))) throw new PickerFailure('BAD_ZIP');
      let dir = target;
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      const file = await (await dir.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
      await file.write(data as BufferSource); await file.close();
    }
  } catch (e) { throw e instanceof PickerFailure ? e : new PickerFailure('WRITE'); }
  return { folderName: root.name, files: entries.length };
}
