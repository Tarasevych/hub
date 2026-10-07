// Bouwt het downloadbare pakket van de browserextensie: dist/downloads/mijn-ruimte-extension.zip.
// Geen externe bibliotheken: een klein ZIP-schrijver (deflate via node:zlib) en een PNG-schrijver voor de pictogrammen.
// Draait na `vite build` (dist/ bestaat dan) en schrijft de pictogrammen ook naar extension/icons/, zodat "Load unpacked"
// rechtstreeks vanuit de repository werkt.
import { deflateRawSync, deflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
for (const size of [16, 48, 128]) writeFileSync(join(extDir, 'icons', `icon${size}.png`), png(size));

// ---- ZIP ----
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  }).sort();
}

function zip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(relative(extDir, file).split(sep).join('/'), 'utf8');
    const data = readFileSync(file);
    const deflated = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;
    // vaste datum (1 jan 2026) zodat het pakket reproduceerbaar is
    const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, deflated); centrals.push(central, name);
    offset += local.length + name.length + deflated.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// store-url.txt is configuratie voor de site (link naar de Chrome Web Store zodra gepubliceerd), geen deel van het pakket.
const files = walk(extDir).filter((f) => !f.endsWith('store-url.txt'));
if (!files.some((f) => f.endsWith('manifest.json'))) throw new Error('extension/manifest.json ontbreekt');
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });
const target = join(outDir, 'mijn-ruimte-extension.zip');
writeFileSync(target, zip(files));
const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
const storeUrl = existsSync(join(extDir, 'store-url.txt')) ? readFileSync(join(extDir, 'store-url.txt'), 'utf8').trim() : '';

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
writeFileSync(join(outDir, 'extension-version.json'), JSON.stringify({ version: manifest.version, file: 'mijn-ruimte-extension.zip', sha256, files: files.length, storeUrl, installers }));
console.log(`Extensie ${manifest.version}: ${files.length} bestanden -> ${relative(root, target)} (${statSync(target).size} bytes, sha256 ${sha256.slice(0, 12)}…, helpers: ${installers.join(', ') || 'geen'})`);
