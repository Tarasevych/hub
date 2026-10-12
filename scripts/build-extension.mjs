// Bouwt de downloads van de browserextensie in dist/downloads/:
//   mijn-ruimte-extension.zip        voor "Load unpacked" en voor de Chrome Web Store (zonder update_url)
//   Install-MijnRuimte.cmd / install-mijn-ruimte.sh   helpers die het installeren zoveel mogelijk automatiseren
//   mijn-ruimte-extension.crx + updates.xml           eigen CRX3 (ondertekend met `node scripts/sign-extension.mjs`), alleen als hij nog actueel is
//   extension-version.json           versie, controlesom, link naar de winkel, beschikbare helpers en CRX
// Draait na `vite build` (dist/ bestaat dan) en schrijft de pictogrammen ook naar extension/icons/, zodat "Load unpacked"
// rechtstreeks vanuit de repository werkt.
import { deflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRX_URL, contentHash, extensionEntries, parseCrx3, zip } from './extension-lib.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const extDir = join(root, 'extension');
const outDir = join(root, 'dist', 'downloads');

// ---- pictogrammen: teal cirkel met witte kern (RGBA-PNG) ----
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - c, y - c);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      let px = [0, 0, 0, 0];
      if (d <= size * 0.46) px = d <= size * 0.18 ? [255, 255, 255, 255] : [47, 111, 115, 255];
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = px[3];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 bit, RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(join(extDir, 'icons'), { recursive: true });
// Bestaande pictogrammen blijven ongemoeid: de CRX-handtekening hangt aan hun bytes, en gecomprimeerde PNG-bytes kunnen per machine verschillen.
for (const size of [16, 48, 128]) { const f = join(extDir, 'icons', `icon${size}.png`); if (!existsSync(f)) writeFileSync(f, png(size)); }

const entries = extensionEntries(extDir);
if (!entries.some((e) => e.name === 'manifest.json')) throw new Error('extension/manifest.json ontbreekt');
const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
mkdirSync(outDir, { recursive: true });
const target = join(outDir, 'mijn-ruimte-extension.zip');
writeFileSync(target, zip(entries));
const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
// Sinds 0.4.0 staat "debugger" vast in het manifest (de gebruiker zet diepe diagnose zelf aan in de opties: diagOptIn), dus er is
// geen aparte uitgave "налагодження" meer. Een oud pakket uit een eerdere build wordt opgeruimd; extension-version.json meldt debug: null.
const debugOud = join(outDir, 'mijn-ruimte-extension-debug.zip');
if (existsSync(debugOud)) rmSync(debugOud);
const debug = null;
const storeUrl = existsSync(join(extDir, 'store-url.txt')) ? readFileSync(join(extDir, 'store-url.txt'), 'utf8').trim() : '';

// ---- eigen CRX3: alleen publiceren als hij ondertekend is voor DEZE extensiebestanden en de handtekening klopt ----
let crx = null;
const signedDir = join(extDir, 'signed');
const infoPath = join(signedDir, 'crx-info.json');
const crxPath = join(signedDir, 'mijn-ruimte-extension.crx');
let crxNote = 'geen (nog niet ondertekend: node scripts/sign-extension.mjs)';
if (existsSync(infoPath) && existsSync(crxPath)) {
  const info = JSON.parse(readFileSync(infoPath, 'utf8'));
  const parsed = parseCrx3(readFileSync(crxPath));
  const fresh = info.contentHash === contentHash(extensionEntries(extDir, { selfHosted: true }));
  if (!parsed.valid || !parsed.crxIdMatchesKey || parsed.extensionId !== info.extensionId) crxNote = 'NIET gepubliceerd: handtekening ongeldig';
  else if (!fresh || info.version !== manifest.version) crxNote = 'NIET gepubliceerd: verouderd (extensie gewijzigd sinds het ondertekenen; draai node scripts/sign-extension.mjs)';
  else {
    copyFileSync(crxPath, join(outDir, 'mijn-ruimte-extension.crx'));
    writeFileSync(join(outDir, 'updates.xml'),
      `<?xml version='1.0' encoding='UTF-8'?>\n<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n  <app appid='${info.extensionId}'>\n    <updatecheck codebase='${CRX_URL}' version='${info.version}' />\n  </app>\n</gupdate>\n`);
    crx = { file: 'mijn-ruimte-extension.crx', extensionId: info.extensionId, version: info.version, sha256: createHash('sha256').update(readFileSync(crxPath)).digest('hex') };
    crxNote = `gepubliceerd (id ${info.extensionId})`;
  }
}

// Helpers die het installeren zoveel mogelijk automatiseren (Chrome staat stil installeren buiten de Web Store niet toe):
// downloaden, controlesom controleren, uitpakken op een vaste plek, de extensiepagina openen, het pad op het klembord.
const installers = [];
for (const [src, dest] of [['Install-MijnRuimte.cmd', 'Install-MijnRuimte.cmd'], ['install-mijn-ruimte.sh', 'install-mijn-ruimte.sh']]) {
  const template = join(root, 'scripts', 'installer', src);
  if (!existsSync(template)) continue;
  const text = readFileSync(template, 'utf8').replaceAll('@@SHA256@@', sha256).replaceAll('@@VERSION@@', manifest.version);
  // Windows: CRLF; shell: LF.
  writeFileSync(join(outDir, dest), dest.endsWith('.cmd') ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'));
  installers.push(dest);
}
// Het pc-/VM-agentprogramma (één bestand zonder afhankelijkheden): zo kan de koppel-wizard op de site het gewoon laten downloaden.
let agent = null;
const agentSrc = join(root, 'deploy', 'agent', 'agent.mjs');
if (existsSync(agentSrc)) {
  const bytes = readFileSync(agentSrc);
  writeFileSync(join(outDir, 'agent.mjs'), bytes);
  const versie = /const VERSION = '([0-9.]+)'/.exec(bytes.toString('utf8'))?.[1] ?? null;
  agent = { file: 'agent.mjs', version: versie, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
writeFileSync(join(outDir, 'extension-version.json'), JSON.stringify({ version: manifest.version, file: 'mijn-ruimte-extension.zip', sha256, files: entries.length, storeUrl, installers, crx, agent, debug }));
console.log(`Extensie ${manifest.version}: ${entries.length} bestanden -> ${relative(root, target)} (${statSync(target).size} bytes, sha256 ${sha256.slice(0, 12)}…, helpers: ${installers.join(', ') || 'geen'}), CRX: ${crxNote}`);
