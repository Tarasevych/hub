// Встановлення розширення через рідний вибір папки: запис лише після перевірки SHA-256, захист від небезпечних шляхів, скасування.
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { installExtensionToPickedFolder, PickerFailure } from '../../src/extension-folder-install';
import { checker } from './hulp/nep-google';

type Written = Record<string, string>;
function fakeDir(name: string, written: Written, prefix = ''): any {
  return {
    name,
    getDirectoryHandle: async (n: string) => fakeDir(n, written, `${prefix}${n}/`),
    getFileHandle: async (n: string) => ({ createWritable: async () => ({ chunks: [] as Uint8Array[], async write(d: Uint8Array) { (this as any).chunks.push(d); }, async close() { written[`${prefix}${n}`] = Buffer.concat((this as any).chunks).toString('utf8'); } }) }),
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('extension-folder-install');
  const g = globalThis as any;
  const oldWindow = g.window; const oldFetch = g.fetch;
  const good = zipSync({ 'manifest.json': strToU8('{"name":"x"}'), 'icons/a.png': strToU8('png') });
  const sha = createHash('sha256').update(good).digest('hex');
  const evil = zipSync({ '../evil.txt': strToU8('x') });
  let served: Uint8Array = good;
  g.fetch = async () => new Response(served as BodyInit, { status: 200 });
  const written: Written = {};
  g.window = { showDirectoryPicker: async () => fakeDir('D:Data', written) };
  try {
    const stages: string[] = [];
    const out = await installExtensionToPickedFolder({ origin: 'https://x', sha256: sha.toUpperCase(), onStage: (s) => stages.push(s) });
    check('gekozen map: bestanden (ook in submappen) komen in de submap MijnRuimte-extension, stappen download → verify → write',
      out.files === 2 && written['MijnRuimte-extension/manifest.json'] === '{"name":"x"}' && written['MijnRuimte-extension/icons/a.png'] === 'png' && stages.join() === 'download,verify,write' && out.folderName === 'D:Data', JSON.stringify([written, stages]));

    const w2: Written = {}; g.window = { showDirectoryPicker: async () => fakeDir('E', w2) };
    let code = ''; try { await installExtensionToPickedFolder({ origin: 'https://x', sha256: 'ab'.repeat(32) }); } catch (e) { code = (e as PickerFailure).code; }
    check('verkeerde SHA-256: SHA-fout en er wordt niets geschreven', code === 'SHA' && Object.keys(w2).length === 0);

    served = evil; const w3: Written = {}; g.window = { showDirectoryPicker: async () => fakeDir('F', w3) };
    code = ''; try { await installExtensionToPickedFolder({ origin: 'https://x', sha256: createHash('sha256').update(evil).digest('hex') }); } catch (e) { code = (e as PickerFailure).code; }
    check('pad met ".." wordt geweigerd (BAD_ZIP), niets buiten de map', code === 'BAD_ZIP' && Object.keys(w3).every((k) => !k.includes('..')));

    g.window = { showDirectoryPicker: async () => { const e: any = new Error('x'); e.name = 'AbortError'; throw e; } };
    code = ''; try { await installExtensionToPickedFolder({ origin: 'https://x', sha256: sha }); } catch (e) { code = (e as PickerFailure).code; }
    check('annuleren in het venster = CANCELLED (geen foutmelding in de UI)', code === 'CANCELLED');

    g.window = {}; code = ''; try { await installExtensionToPickedFolder({ origin: 'https://x', sha256: sha }); } catch (e) { code = (e as PickerFailure).code; }
    check('browser zonder mapkiezer (Firefox/Safari): UNSUPPORTED', code === 'UNSUPPORTED');
  } finally { g.window = oldWindow; g.fetch = oldFetch; }
  return einde();
}
