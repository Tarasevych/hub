// OFFICIËLE LOGO'S IN DE INGEBOUWDE BASIS (21.10.2026, besluit van de eigenaar: «знайди публічні фото їх логотипів і збережи в
// базу … Логотипи наявних систем не треба видумувати … Без імітації, а справжні»).
//
// Wat dit script doet — en wat NIET:
//   • het NEEMT het SVG-bestand van een merk uit een npm-pakket met een open licentie (CC0-1.0 / MIT / Apache-2.0) en met een
//     naam, versie en integriteit in package-lock.json: @iconify-json/logos (de verzameling gilbarbara/logos, CC0) en
//     @iconify-json/vscode-icons (MIT). Het pakket zelf staat in devDependencies; alleen het RESULTAAT gaat de repo in, zodat een
//     BYOS-server zonder internet de logo's ook heeft;
//   • het TEKENT NIETS en verandert geen enkele vorm: de inhoud (`body`) van het icoon wordt letterlijk in een <svg> met de eigen
//     viewBox van het icoon gezet. Daarna gaat het bestand door DEZELFDE ontsmetting als een eigen logo van de beheerder
//     (shared/merk-eigen.ts → ontsmetSvg): geen script, geen verwijzing naar buiten. Weigert die controle, dan stopt het script;
//   • voor merken die in geen enkel open pakket staan (Ukr.net, I.ua, Online.ua …) neemt het het bestand dat de coördinator van
//     de EIGEN website van het merk haalde (map met <sleutel>.svg|png + bron.json met de URL). Zulke bestanden krijgen in
//     HERKOMST.json `soort: 'officiele-site'` met de URL — hun «licentie» is het handelsmerk van de eigenaar, uitsluitend om de
//     dienst te herkennen. Er wordt niets bijgeraden: zonder bron.json-regel wordt een bestand overgeslagen.
//
// Uitvoer (in de repo):
//   src/merk/officieel/<sleutel>.svg|png   het bestand zelf
//   src/merk/officieel/HERKOMST.json       per bestand: pakket, versie, icoon, licentie, sha256, bytes, ondergrond
//   src/merk/merk-officieel.ts             de luie tabel voor de browser (zelfde inhoud; de test vergelijkt de sha256)
//
// Gebruik:  node scripts/merk-officieel-maken.mjs [--ua <map met <sleutel>.svg|png + bron.json>]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const WORTEL = process.cwd();
const UIT = join(WORTEL, 'src/merk/officieel');
const uaArg = process.argv.indexOf('--ua');
const UA_MAP = uaArg > 0 ? process.argv[uaArg + 1] : '';

// ------------------------------------------------------------------------------------------------ de keuze (sleutel → bron)
// Eén regel per merk dat tot 21.10 een NAGETEKENDE vorm had (en daarna de neutrale plaat). Alleen een icoon dat het merk zelf
// is (geen «file-type»-variant van iets anders). Wat hier niet staat, heeft in geen open pakket een echt logo: zie AFWEZIG.
const KEUZE = [
  { sleutel: 'windows', pakket: '@iconify-json/logos', icoon: 'microsoft-windows-icon' },
  { sleutel: 'edge', pakket: '@iconify-json/logos', icoon: 'microsoft-edge' },
  { sleutel: 'microsoft', pakket: '@iconify-json/logos', icoon: 'microsoft-icon' },
  { sleutel: 'node', pakket: '@iconify-json/logos', icoon: 'nodejs-icon' },
  { sleutel: 'microsoftonedrive', pakket: '@iconify-json/logos', icoon: 'microsoft-onedrive' },
  { sleutel: 'microsoftteams', pakket: '@iconify-json/logos', icoon: 'microsoft-teams' },
  { sleutel: 'microsoftazure', pakket: '@iconify-json/logos', icoon: 'microsoft-azure' },
  { sleutel: 'yahoo', pakket: '@iconify-json/logos', icoon: 'yahoo', opmerking: 'woordmerk (Yahoo heeft geen los beeldmerk in een open pakket)' },
  { sleutel: 'mondaydotcom', pakket: '@iconify-json/logos', icoon: 'monday-icon' },
  { sleutel: 'pipedrive', pakket: '@iconify-json/logos', icoon: 'pipedrive', opmerking: 'woordmerk' },
  { sleutel: 'webhook', pakket: '@iconify-json/logos', icoon: 'webhooks' },
  { sleutel: 'oauth', pakket: '@iconify-json/logos', icoon: 'oauth' },
  { sleutel: 'microsoftoutlook', pakket: '@iconify-json/vscode-icons', icoon: 'file-type-outlook', opmerking: 'het Outlook-logo zoals vscode-icons het meelevert (ontwerp 2013–2018)' },
  { sleutel: 'microsoftonenote', pakket: '@iconify-json/vscode-icons', icoon: 'file-type-onenote', opmerking: 'het OneNote-logo zoals vscode-icons het meelevert (ontwerp 2013–2018)' },
];
/** Merken zonder bestand in een open pakket (gecontroleerd: @iconify-json/logos 1.2.17, vscode-icons 1.2.92, skill-icons 1.2.4,
 *  devicon 1.2.71, cib 1.2.3, simple-icons 6.23/9.21/13.21/16.35). Zij komen uit de database van de site (app.merk_beeld:
 *  BIMI of de eigen website van het domein, backend/merk-bron.ts) of uit een bestand van de beheerder. */
export const AFWEZIG = ['microsoftentra', 'fastmail', 'freshdesk', 'mollie', 'tuya', 'ukrnet', 'iua', 'onlineua'];
const OPEN = new Set(['CC0-1.0', 'MIT', 'Apache-2.0']);

// ------------------------------------------------------------------------------------------------ ontsmetting (shared/merk-eigen.ts)
const tmp = mkdtempSync(join(WORTEL, 'rapporten', 'merk-officieel-'));
let ontsmetSvg, controleerMerkEigen;
try {
  const js = join(tmp, 'merk-eigen.mjs');
  await build({ entryPoints: [join(WORTEL, 'shared/merk-eigen.ts')], outfile: js, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
  ({ ontsmetSvg, controleerMerkEigen } = await import(pathToFileURL(js).href));
} finally { rmSync(tmp, { recursive: true, force: true }); }

const sha = (b) => createHash('sha256').update(b).digest('hex');
const lum = (hex) => { let v = hex.replace('#', ''); if (v.length === 3) v = [...v].map((c) => c + c).join(''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Heeft het logo vormen die op een donker vlak wegvallen (zwart/donkergrijs/donkerpaars, of een vorm zonder vulling)?
 *  Dan tekent <Merk> het ook als los gliefje op een lichte plaat — de vorm zelf blijft onaangeroerd. */
function ondergrondVan(svg) {
  const kleuren = [...svg.matchAll(/(?:fill|stop-color)="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1]);
  // Een vorm zonder eigen vulling is zwart (of erft van een <g>; bij twijfel: licht — de veilige kant). Luminantie < 0,1 = minder dan
  // 3:1 tegen zwart, het donkerste vlak van de 26 paletten.
  const zonderVulling = /<(path|circle|rect|ellipse|polygon)(?![^>]*\bfill=)[^>]*>/.test(svg);
  return zonderVulling || kleuren.some((k) => lum(k) < 0.1) ? 'licht' : 'vrij';
}

// ------------------------------------------------------------------------------------------------ uit de pakketten
const lock = JSON.parse(readFileSync(join(WORTEL, 'package-lock.json'), 'utf8'));
const herkomst = [];
const tabel = {};
mkdirSync(UIT, { recursive: true });
for (const f of readdirSync(UIT)) if (/\.(svg|png)$/.test(f)) rmSync(join(UIT, f));

for (const k of KEUZE) {
  const pkg = require(`${k.pakket}/package.json`);
  const info = require(`${k.pakket}/info.json`);
  const set = require(`${k.pakket}/icons.json`);
  const vastgelegd = lock.packages?.[`node_modules/${k.pakket}`];
  if (!vastgelegd || vastgelegd.version !== pkg.version) throw new Error(`${k.pakket}: versie ${pkg.version} staat niet zo in package-lock.json`);
  const licentie = String(info.license?.spdx || pkg.license || '');
  if (!OPEN.has(licentie)) throw new Error(`${k.pakket}: licentie ${licentie} is niet CC0-1.0/MIT/Apache-2.0`);
  let icoon = set.icons[k.icoon];
  if (!icoon && set.aliases?.[k.icoon]) icoon = set.icons[set.aliases[k.icoon].parent];
  if (!icoon) throw new Error(`${k.pakket}: icoon ${k.icoon} bestaat niet`);
  const w = icoon.width ?? set.width ?? 16, h = icoon.height ?? set.height ?? 16, l = icoon.left ?? set.left ?? 0, t = icoon.top ?? set.top ?? 0;
  if (icoon.rotate || icoon.hFlip || icoon.vFlip) throw new Error(`${k.icoon}: gedraaid/gespiegeld icoon — niet zonder bewerking te gebruiken`);
  const ruw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${l} ${t} ${w} ${h}" width="${w}" height="${h}">${icoon.body}</svg>`;
  const u = ontsmetSvg(ruw);
  if (!u.ok) throw new Error(`${k.sleutel}: de ontsmetting weigert het bestand (${u.reden})`);
  const inhoud = u.inhoud;
  writeFileSync(join(UIT, `${k.sleutel}.svg`), inhoud);
  const regel = {
    sleutel: k.sleutel, bestand: `${k.sleutel}.svg`, soort: 'pakket', pakket: k.pakket, versie: pkg.version,
    integriteit: vastgelegd.integrity, icoon: k.icoon, verzameling: info.name, auteur: info.author?.name || '', bronUrl: info.author?.url || '',
    licentie, licentieUrl: info.license?.url || '', mime: 'image/svg+xml', bytes: inhoud.length, sha256: sha(inhoud),
    ondergrond: ondergrondVan(inhoud.toString('utf8')), ...(k.opmerking ? { opmerking: k.opmerking } : {}),
  };
  herkomst.push(regel);
  tabel[k.sleutel] = { soort: 'svg', inhoud: inhoud.toString('utf8'), sha256: regel.sha256, ondergrond: regel.ondergrond, bron: `${k.pakket}@${pkg.version} · ${k.icoon} · ${licentie}` };
}

// ------------------------------------------------------------------------------------------------ van de eigen website (UA-diensten)
if (UA_MAP && existsSync(join(UA_MAP, 'bron.json'))) {
  const bron = JSON.parse(readFileSync(join(UA_MAP, 'bron.json'), 'utf8'));
  const regels = Array.isArray(bron) ? bron : Object.entries(bron).map(([sleutel, v]) => ({ sleutel, ...(typeof v === 'string' ? { url: v } : v) }));
  for (const r of regels) {
    const sleutel = String(r.sleutel || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9.+-]{0,40}$/.test(sleutel) || tabel[sleutel]) continue;
    const url = String(r.url || r.bron || '');
    if (!/^https:\/\/[a-z0-9.-]+\//i.test(url)) { console.error(`overgeslagen ${sleutel}: geen https-bron`); continue; }
    const bestand = ['svg', 'png'].map((s) => `${sleutel}.${s}`).find((n) => existsSync(join(UA_MAP, n)));
    if (!bestand) { console.error(`overgeslagen ${sleutel}: geen bestand`); continue; }
    const soort = bestand.endsWith('.png') ? 'png' : 'svg';
    const u = controleerMerkEigen(soort, readFileSync(join(UA_MAP, bestand)));
    if (!u.ok) { console.error(`overgeslagen ${sleutel}: ${u.reden}`); continue; }
    writeFileSync(join(UIT, bestand), u.inhoud);
    const regel = {
      sleutel, bestand, soort: 'officiele-site', bronUrl: url, opgehaald: String(r.opgehaald || r.datum || '').slice(0, 30),
      licentie: 'handelsmerk-van-de-eigenaar', licentieUitleg: 'officieel logo van de eigen website van de dienst; alleen ter herkenning van de dienst',
      mime: soort === 'png' ? 'image/png' : 'image/svg+xml', bytes: u.inhoud.length, sha256: sha(u.inhoud),
      ondergrond: soort === 'svg' ? ondergrondVan(u.inhoud.toString('utf8')) : 'licht',
    };
    herkomst.push(regel);
    tabel[sleutel] = { soort, inhoud: soort === 'svg' ? u.inhoud.toString('utf8') : u.inhoud.toString('base64'), sha256: regel.sha256, ondergrond: regel.ondergrond, bron: `${url} · handelsmerk van de eigenaar` };
  }
}

herkomst.sort((a, b) => a.sleutel.localeCompare(b.sleutel));
writeFileSync(join(UIT, 'HERKOMST.json'), `${JSON.stringify({ gemaakt: 'scripts/merk-officieel-maken.mjs', regels: herkomst, afwezig: AFWEZIG.filter((s) => !tabel[s]) }, null, 2)}\n`);

const sleutels = Object.keys(tabel).sort();
const kop = `// GEGENEREERD door scripts/merk-officieel-maken.mjs — niet met de hand wijzigen (de test merk-officieel-20261021 vergelijkt elke
// regel met src/merk/officieel/<sleutel>.* en HERKOMST.json). Officiële logo's uit open pakketten (CC0-1.0/MIT) of van de eigen
// website van een dienst; geen enkele vorm is nagetekend. Lui geladen (eigen bundelstuk), registreert zich bij het merkregister.
// Merknamen en logo's blijven eigendom van de rechthebbenden; ze dienen hier uitsluitend om een dienst te herkennen.
import { registreerOfficieleMerken, type OfficieelMerk } from './merk-register';

export const OFFICIEEL: Readonly<Record<string, OfficieelMerk>> = Object.freeze({
${sleutels.map((s) => `  ${JSON.stringify(s)}: ${JSON.stringify(tabel[s])},`).join('\n')}
});

registreerOfficieleMerken(OFFICIEEL);
`;
writeFileSync(join(WORTEL, 'src/merk/merk-officieel.ts'), kop);
console.log(`${sleutels.length} officiële logo's (${herkomst.filter((r) => r.soort === 'pakket').length} uit pakketten, ${herkomst.filter((r) => r.soort === 'officiele-site').length} van de eigen website); nog zonder: ${AFWEZIG.filter((s) => !tabel[s]).join(', ') || '—'}`);
