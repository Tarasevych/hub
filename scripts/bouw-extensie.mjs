// Bouwt de downloads van de browserextensie in dist/downloads/:
//   mijn-ruimte-extension.zip        voor "Load unpacked" en voor de Chrome Web Store (zonder update_url)
//   Install-MijnRuimte.cmd / install-mijn-ruimte.sh   helpers die het installeren zoveel mogelijk automatiseren
//   mijn-ruimte-extension.crx + updates.xml           eigen CRX3 (ondertekend met `node scripts/onderteken-extensie.mjs`), alleen als hij nog actueel is
//   extension-version.json           versie, controlesom, link naar de winkel, beschikbare helpers en CRX
// Draait na `vite build` (dist/ bestaat dan) en schrijft de pictogrammen ook naar extension/icons/, zodat "Load unpacked"
// rechtstreeks vanuit de repository werkt.
import { deflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRX_URL, contentHash, extensionEntries, parseCrx3, zip } from './extensie-lib.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const extDir = join(root, 'extension');
// MR_DIST_DIR: de outDir van een vite-build (vite.config.ts → plugin mr-extensie-downloads); standaard dist/.
const outDir = join(process.env.MR_DIST_DIR ? resolve(process.env.MR_DIST_DIR) : join(root, 'dist'), 'downloads');

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
// Sinds 0.8.1 heeft het standaardpakket GEEN "debugger" (minimale rechten, bewuste keuze). Het pakket «diagnose» hieronder voegt hem vast toe.
// Een oud pakket «налагодження» uit een eerdere build wordt opgeruimd; extension-version.json meldt debug: null.
const debugOud = join(outDir, 'mijn-ruimte-extension-debug.zip');
if (existsSync(debugOud)) rmSync(debugOud);
const debug = null;

// 0.6.1 (punt 7 van de eigenaar, 19.10.2026): APART pakket «діагностика».
// Chrome staat `debugger` niet toe als OPTIONEEL recht — chrome.permissions.request eindigt altijd met «Only permissions specified
// in the manifest may be requested». Een recht dat je niet kunt vragen en dat we niet aan ieders installatie willen opdringen
// (het geeft volledige URL-toegang en een brede installatiewaarschuwing) krijgt daarom zijn eigen pakket: zelfde bestanden, zelfde
// extensie-id (zelfde `key`), alleen `debugger` staat hier VAST in `permissions`. Wie diepe diagnose wil, laadt dit pakket; het
// standaardpakket blijft op de minimale rechten. De site linkt ernaar als Chrome het recht weigert (extension-version.json.diagnose).
const diagnoseEntries = extensionEntries(extDir).map((e) => {
  if (e.name !== 'manifest.json') return e;
  const m = JSON.parse(e.data.toString('utf8'));
  // 0.8.1: het gewone pakket heeft geen `debugger`; dit pakket voegt hem vast toe (geen dubbel recht als hij er al staat).
  m.permissions = m.permissions.includes('debugger') ? m.permissions : [...m.permissions, 'debugger'];
  m.optional_permissions = (m.optional_permissions || []).filter((p) => p !== 'debugger');
  m.name = `${m.name} (diagnose)`;
  return { name: e.name, data: Buffer.from(`${JSON.stringify(m, null, 2)}\n`, 'utf8') };
});
const diagnoseBytes = zip(diagnoseEntries);
writeFileSync(join(outDir, 'mijn-ruimte-extension-diagnose.zip'), diagnoseBytes);
const diagnose = {
  file: 'mijn-ruimte-extension-diagnose.zip', version: manifest.version, permissie: 'debugger',
  sha256: createHash('sha256').update(diagnoseBytes).digest('hex'), bytes: diagnoseBytes.length,
};
const storeUrl = existsSync(join(extDir, 'store-url.txt')) ? readFileSync(join(extDir, 'store-url.txt'), 'utf8').trim() : '';

// ---- eigen CRX3: alleen publiceren als hij ondertekend is voor DEZE extensiebestanden en de handtekening klopt ----
let crx = null;
const signedDir = join(extDir, 'signed');
const infoPath = join(signedDir, 'crx-info.json');
const crxPath = join(signedDir, 'mijn-ruimte-extension.crx');
let crxNote = 'geen (nog niet ondertekend: node scripts/onderteken-extensie.mjs)';
// Status voor de site (audit 18.10.2026, punt 9): waarom er (geen) automatische update is. Oude crx/updates.xml van een vorige build
// worden verwijderd als ze niet meer kloppen — anders zou Chrome naar een verouderde versie «bijwerken».
let crxStatus = 'ontbreekt';
for (const oud of ['mijn-ruimte-extension.crx', 'updates.xml']) { const f = join(outDir, oud); if (existsSync(f)) rmSync(f); }
if (existsSync(infoPath) && existsSync(crxPath)) {
  const info = JSON.parse(readFileSync(infoPath, 'utf8'));
  const parsed = parseCrx3(readFileSync(crxPath));
  const fresh = info.contentHash === contentHash(extensionEntries(extDir, { selfHosted: true }));
  if (!parsed.valid || !parsed.crxIdMatchesKey || parsed.extensionId !== info.extensionId) { crxNote = 'NIET gepubliceerd: handtekening ongeldig'; crxStatus = 'ongeldig'; }
  else if (!fresh || info.version !== manifest.version) { crxNote = `NIET gepubliceerd: verouderd (ondertekend ${info.version}, manifest ${manifest.version}; draai node scripts/onderteken-extensie.mjs met de sleutel van de eigenaar)`; crxStatus = 'verouderd'; }
  else {
    copyFileSync(crxPath, join(outDir, 'mijn-ruimte-extension.crx'));
    writeFileSync(join(outDir, 'updates.xml'),
      `<?xml version='1.0' encoding='UTF-8'?>\n<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n  <app appid='${info.extensionId}'>\n    <updatecheck codebase='${CRX_URL}' version='${info.version}' />\n  </app>\n</gupdate>\n`);
    crx = { file: 'mijn-ruimte-extension.crx', extensionId: info.extensionId, version: info.version, sha256: createHash('sha256').update(readFileSync(crxPath)).digest('hex') };
    crxNote = `gepubliceerd (id ${info.extensionId})`;
    crxStatus = 'actueel';
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
// Lokale AI-agent via Native Messaging (extensie 0.5, alleen lezen): host + MCP-server + installatiescripts als één zip.
let lokaal = null;
const lokaalDir = join(root, 'deploy', 'extensie-native');
if (existsSync(lokaalDir)) {
  const lokaalEntries = extensionEntries(lokaalDir).map((e) => ({ name: `extensie-native/${e.name}`, data: e.data }));
  const bytes = zip(lokaalEntries);
  writeFileSync(join(outDir, 'mijn-ruimte-extensie-native.zip'), bytes);
  lokaal = { file: 'mijn-ruimte-extensie-native.zip', files: lokaalEntries.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
// Minimale versie: één bron (shared/extensie-update.ts), hier met een regex gelezen omdat dit script geen TypeScript laadt.
const minVersion = /EXT_MIN_VERSIE = '([0-9.]+)'/.exec(readFileSync(join(root, 'shared', 'extensie-update.ts'), 'utf8'))?.[1] ?? manifest.version;
const ondertekend = existsSync(infoPath) ? JSON.parse(readFileSync(infoPath, 'utf8')).version ?? null : null;
writeFileSync(join(outDir, 'extension-version.json'), JSON.stringify({ version: manifest.version, minVersion, file: 'mijn-ruimte-extension.zip', sha256, files: entries.length, storeUrl, installers, crx, crxStatus, ondertekendeVersie: ondertekend, agent, lokaal, debug, diagnose }));
console.log(`Extensie ${manifest.version}: ${entries.length} bestanden -> ${relative(root, target)} (${statSync(target).size} bytes, sha256 ${sha256.slice(0, 12)}…, helpers: ${installers.join(', ') || 'geen'}), CRX: ${crxNote}`);
console.log(`Pakket diagnose (debugger vast in het manifest): ${diagnose.file} (${diagnose.bytes} bytes, sha256 ${diagnose.sha256.slice(0, 12)}…)`);
