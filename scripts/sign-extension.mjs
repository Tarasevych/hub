// Ondertekent de extensie als CRX3 met een EIGEN sleutel (alleen lokaal draaien; de privésleutel staat NIET in de repository).
//   node scripts/sign-extension.mjs [pad-naar-sleutel.pem]
// Standaard: T:\mijn-ruimte\geheim\extension-signing-key.pem (wordt aangemaakt als hij ontbreekt). Maak een reservekopie van dit bestand:
// wie hem kwijt is kan geen update meer uitgeven onder hetzelfde extensie-id.
// Uitvoer (wel in de repository, publiek): extension/signed/mijn-ruimte-extension.crx en crx-info.json. De build (build-extension.mjs)
// publiceert de CRX alleen als hij nog bij de huidige extensiebestanden hoort (contentHash).
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCrx3, contentHash, extensionEntries, zip, CRX_URL, UPDATE_URL } from './extension-lib.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const extDir = join(root, 'extension');
const keyPath = process.argv[2] || 'T:\\mijn-ruimte\\geheim\\extension-signing-key.pem';

if (!existsSync(keyPath)) {
  mkdirSync(dirname(keyPath), { recursive: true });
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Nieuwe ondertekeningssleutel aangemaakt: ${keyPath} (maak een reservekopie, buiten de repository!)`);
}
const pem = readFileSync(keyPath, 'utf8');

const entries = extensionEntries(extDir, { selfHosted: true });
const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
const { crx, extensionId, publicKeyBase64 } = buildCrx3(zip(entries), pem);

const outDir = join(extDir, 'signed');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'mijn-ruimte-extension.crx'), crx);
writeFileSync(join(outDir, 'crx-info.json'), JSON.stringify({ extensionId, version: manifest.version, contentHash: contentHash(entries), publicKeyBase64, codebase: CRX_URL, updateUrl: UPDATE_URL }, null, 2) + '\n');
console.log(`CRX3 ondertekend: versie ${manifest.version}, extensie-id ${extensionId}, ${crx.length} bytes -> extension/signed/`);
