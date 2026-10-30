// Ondertekent de extensie als CRX3 met een EIGEN sleutel (alleen lokaal draaien; de privésleutel staat NIET in de repository).
//   node scripts/onderteken-extensie.mjs [pad-naar-sleutel.pem]
// Standaard: T:\mijn-ruimte\geheim\extension-signing-key.pem (wordt aangemaakt als hij ontbreekt). Maak een reservekopie van dit bestand:
// wie hem kwijt is kan geen update meer uitgeven onder hetzelfde extensie-id.
// Uitvoer (wel in de repository, publiek): extension/signed/mijn-ruimte-extension.crx en crx-info.json. De build (bouw-extensie.mjs)
// publiceert de CRX alleen als hij nog bij de huidige extensiebestanden hoort (contentHash).
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCrx3, contentHash, extensionEntries, zip, CRX_URL, UPDATE_URL } from './extensie-lib.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const extDir = join(root, 'extension');
const keyPath = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'T:\\mijn-ruimte\\geheim\\extension-signing-key.pem';

// Audit 18.10.2026 (punt 9): NOOIT stil een nieuwe sleutel maken. Een nieuwe sleutel = een ander extensie-id: alle bestaande
// installaties krijgen dan nooit meer een update. Alleen met --nieuwe-sleutel (bewust, eerste keer), en dan nog een waarschuwing.
const nieuw = process.argv.includes('--nieuwe-sleutel');
const bestaand = existsSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'extension', 'signed', 'crx-info.json'))
  ? JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'extension', 'signed', 'crx-info.json'), 'utf8')) : null;
if (!existsSync(keyPath) && !nieuw) {
  console.error(`Sleutel niet gevonden: ${keyPath}\nGebruik de bestaande sleutel van de eigenaar (extensie-id ${bestaand?.extensionId ?? '?'}): node scripts/onderteken-extensie.mjs <pad.pem>\nAlleen voor een volledig nieuwe extensie: --nieuwe-sleutel (bestaande installaties krijgen dan GEEN update).`);
  process.exit(2);
}
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

if (bestaand?.extensionId && extensionId !== bestaand.extensionId && !nieuw) {
  console.error(`Deze sleutel hoort bij extensie-id ${extensionId}, de gepubliceerde extensie heeft ${bestaand.extensionId}. Niets geschreven.`);
  process.exit(3);
}
const outDir = join(extDir, 'signed');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'mijn-ruimte-extension.crx'), crx);
writeFileSync(join(outDir, 'crx-info.json'), JSON.stringify({ extensionId, version: manifest.version, contentHash: contentHash(entries), publicKeyBase64, codebase: CRX_URL, updateUrl: UPDATE_URL }, null, 2) + '\n');
console.log(`CRX3 ondertekend: versie ${manifest.version}, extensie-id ${extensionId}, ${crx.length} bytes -> extension/signed/`);
