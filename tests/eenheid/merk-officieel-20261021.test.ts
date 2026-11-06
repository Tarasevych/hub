// Besluit van de eigenaar (21.10.2026): «Замість перемальовувати… знайди в інтернеті публічні фото їх логотипів і збережи в базу …
// Логотипи наявних систем/компаній/людей не треба видумувати … Без імітації, а справжні.»
//
// Wat deze test bewijst over de INGEBOUWDE basis (src/merk/officieel/, scripts/merk-officieel-maken.mjs):
//   1. elk bestand heeft precies één regel in HERKOMST.json: pakket + versie + integriteit (zoals package-lock.json) en een open
//      licentie (CC0-1.0 / MIT / Apache-2.0) — of, voor een bestand van de eigen website van een dienst, de https-URL op het domein
//      van die dienst; de sha256 en het aantal bytes kloppen; geen bestand zonder regel en geen regel zonder bestand;
//   2. elk SVG-bestand komt ongewijzigd door de ontsmetting van een eigen logo (shared/merk-eigen.ts) én door de controle van de
//      merkdatabase (shared/merk-bron.ts): geen script, geen verwijzing naar buiten;
//   3. de luie tabel voor de browser (src/merk/merk-officieel.ts) is exact die bestanden (sha256 per sleutel);
//   4. geen enkele vorm in merk-tabel.ts zonder herkomst (VORM_HERKOMST), de grote tabel uit simple-icons, en de 21 merken die tot
//      21.10 nagetekend waren hebben geen pad meer;
//   5. het register neemt voor elk van die 21 merken de juiste laag: officieel (14 + OAuth), anders de merkendatabase (MERK_DOMEIN)
//      en tot de eerste ophaling de neutrale plaat; een eigen bestand van de beheerder gaat altijd voor;
//   6. <Merk> tekent het officiële bestand als <img> (data-URI, geen extern adres) op dezelfde maat als de neutrale plaat.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { ontsmetSvg } from '../../shared/merk-eigen';
import { controleerBeeld } from '../../shared/merk-bron';

const lees = (p: string) => readFileSync(p, 'utf8');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const DE_21 = ['windows', 'edge', 'microsoft', 'node', 'microsoftoutlook', 'microsoftonedrive', 'microsoftonenote', 'microsoftteams', 'microsoftazure', 'microsoftentra', 'yahoo', 'fastmail', 'freshdesk', 'mollie', 'mondaydotcom', 'pipedrive', 'tuya', 'webhook', 'ukrnet', 'iua', 'onlineua'];
const OPEN = new Set(['CC0-1.0', 'MIT', 'Apache-2.0']);

export async function main(): Promise<number> {
  const { check, einde } = checker('merk-officieel-20261021');
  const MAP = 'src/merk/officieel';
  const herkomst = JSON.parse(lees(`${MAP}/HERKOMST.json`)) as { regels: Array<Record<string, string | number>>; afwezig: string[] };
  const bestanden = readdirSync(MAP).filter((f) => /\.(svg|png)$/.test(f)).sort();
  const lock = JSON.parse(lees('package-lock.json')) as { packages: Record<string, { version: string; integrity: string }> };
  const pkg = JSON.parse(lees('package.json')) as { devDependencies: Record<string, string> };
  const reg = await import('../../src/merk/merk-register');

  // ------------------------------------------------------------------ 1. herkomst per bestand
  const perBestand = new Map(herkomst.regels.map((r) => [String(r.bestand), r]));
  check(`${bestanden.length} bestanden, ${herkomst.regels.length} regels in HERKOMST.json — één op één`, bestanden.length >= 14 && bestanden.length === herkomst.regels.length && bestanden.every((f) => perBestand.has(f)) && herkomst.regels.every((r) => bestanden.includes(String(r.bestand))));
  const shaFout = bestanden.filter((f) => { const b = readFileSync(`${MAP}/${f}`); const r = perBestand.get(f)!; return r.sha256 !== sha(b) || Number(r.bytes) !== b.length || r.sleutel !== f.replace(/\.(svg|png)$/, ''); });
  check('sha256, bytes en sleutel van elk bestand kloppen met HERKOMST.json', shaFout.length === 0, shaFout.join());
  const pakketRegels = herkomst.regels.filter((r) => r.soort === 'pakket');
  const pakketFout = pakketRegels.filter((r) => {
    const l = lock.packages[`node_modules/${r.pakket}`];
    return !OPEN.has(String(r.licentie)) || !l || l.version !== r.versie || l.integrity !== r.integriteit || pkg.devDependencies[String(r.pakket)] !== r.versie || !r.icoon;
  });
  check(`uit een pakket (${pakketRegels.length}): licentie CC0/MIT/Apache, versie + integriteit zoals package-lock.json, exacte devDependency`, pakketRegels.length >= 14 && pakketFout.length === 0, pakketFout.map((r) => r.sleutel).join());
  const siteRegels = herkomst.regels.filter((r) => r.soort === 'officiele-site');
  const siteFout = siteRegels.filter((r) => { const d = reg.MERK_DOMEIN[String(r.sleutel)]; let host = ''; try { host = new URL(String(r.bronUrl)).hostname; } catch { /* */ } return !d || !/^https:\/\//.test(String(r.bronUrl)) || !(host === d || host.endsWith(`.${d}`)) || r.licentie !== 'handelsmerk-van-de-eigenaar'; });
  check(`van de eigen website (${siteRegels.length}): https-URL op het domein van de dienst zelf, gemarkeerd als handelsmerk van de eigenaar`, siteFout.length === 0, siteFout.map((r) => r.sleutel).join());
  check('elke regel is óf een open pakket óf de eigen website — geen derde soort', herkomst.regels.every((r) => r.soort === 'pakket' || r.soort === 'officiele-site'));
  check('licentieteksten met bron en auteur (gilbarbara/logos, vscode-icons)', pakketRegels.every((r) => /^https:\/\//.test(String(r.licentieUrl)) && String(r.auteur).length > 2));

  // ------------------------------------------------------------------ 2. ontsmetting
  const svgFout = bestanden.filter((f) => f.endsWith('.svg')).filter((f) => {
    const b = readFileSync(`${MAP}/${f}`); const u = ontsmetSvg(b); const c = controleerBeeld(b);
    return !u.ok || !u.inhoud.equals(b) || !c.ok || c.mime !== 'image/svg+xml' || /<script|javascript:|href="(?!#)|xlink:href="(?!#)|url\((?!#)|<image|<foreignObject/i.test(b.toString('utf8'));
  });
  check('elk SVG komt ongewijzigd door de ontsmetting (merk-eigen) en de beeldcontrole (merk-bron); geen script of extern adres', svgFout.length === 0, svgFout.join());
  check('het generatiescript tekent niets: het zet alleen de `body` van het icoon in een <svg> met zijn eigen viewBox', /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="\$\{l\} \$\{t\} \$\{w\} \$\{h\}" width="\$\{w\}" height="\$\{h\}">\$\{icoon\.body\}<\/svg>/.test(lees('scripts/merk-officieel-maken.mjs')) && /ontsmetSvg\(ruw\)/.test(lees('scripts/merk-officieel-maken.mjs')));

  // ------------------------------------------------------------------ 3. de luie tabel = de bestanden
  const { OFFICIEEL } = await import('../../src/merk/merk-officieel');
  const tabelFout = Object.entries(OFFICIEEL).filter(([k, m]) => { const r = herkomst.regels.find((x) => x.sleutel === k); const inhoud = m.soort === 'svg' ? Buffer.from(m.inhoud, 'utf8') : Buffer.from(m.inhoud, 'base64'); return !r || sha(inhoud) !== r.sha256 || m.sha256 !== r.sha256 || m.ondergrond !== r.ondergrond; });
  check(`src/merk/merk-officieel.ts heeft exact de ${bestanden.length} bestanden (sha256 per sleutel)`, Object.keys(OFFICIEEL).length === bestanden.length && tabelFout.length === 0, tabelFout.map(([k]) => k).join());
  check('de luie tabel staat niet in de hoofdbundel (alleen import() vanuit het register)', lees('src/merk/merk-register.ts').includes("import('./merk-officieel')") && !/^import .*merk-officieel/m.test(lees('src/merk/merk-register.ts')) && !/^import .*merk-officieel/m.test(lees('src/merk/Merk.tsx')));

  // ------------------------------------------------------------------ 4. geen vorm zonder herkomst
  const { MERKEN, VORM_HERKOMST } = await import('../../src/merk/merk-tabel');
  const metVorm = Object.keys(MERKEN).filter((k) => MERKEN[k].d || MERKEN[k].paden);
  const zonderHerkomst = metVorm.filter((k) => !VORM_HERKOMST[k]);
  const herkomstZonderVorm = Object.keys(VORM_HERKOMST).filter((k) => !metVorm.includes(k));
  check(`elke vorm in merk-tabel.ts (${metVorm.length}) heeft een herkomst, en elke herkomst een vorm`, zonderHerkomst.length === 0 && herkomstZonderVorm.length === 0, [...zonderHerkomst, ...herkomstZonderVorm].join());
  check('herkomsten zijn alleen open bronnen of het eigen merk van de site', Object.values(VORM_HERKOMST).every((v) => /\((CC0-1\.0|MIT|ISC)\)$/.test(v) || v === 'eigen merk van Mijn Ruimte'));
  const nagetekend = [...DE_21, 'oauth'].filter((k) => MERKEN[k]?.d || MERKEN[k]?.paden || !MERKEN[k]?.neutraal);
  check('de 21 nagetekende merken (en het zelfgetekende OAuth-sleuteltje) hebben geen pad meer — neutrale plaat alleen als laatste terugval', nagetekend.length === 0, nagetekend.join());
  check('de grote tabel (merk-logos.ts) komt uit simple-icons (CC0) met het generatiescript ernaast', /simple-icons \(CC0-1\.0/.test(lees('src/merk/merk-logos.ts')) && existsSync('scripts/integraties-logos-maken.mjs'));

  // ------------------------------------------------------------------ 5. de laag per merk
  const officieel = Object.keys(OFFICIEEL);
  const verwachtOfficieel = DE_21.filter((k) => !herkomst.afwezig.includes(k));
  const lagen = Object.fromEntries([...DE_21, 'oauth'].map((k) => [k, reg.merkLaag(k)]));
  check(`officieel voor ${verwachtOfficieel.length} van de 21 (+ OAuth): ${verwachtOfficieel.join(', ')}`, verwachtOfficieel.length >= 13 && [...verwachtOfficieel, 'oauth'].every((k) => lagen[k] === 'officieel' && officieel.includes(k)), JSON.stringify(lagen));
  const afwezig = DE_21.filter((k) => !officieel.includes(k));
  check(`zonder bestand in een open pakket (${afwezig.join(', ')}): elk een domein voor de merkendatabase, tot dan de neutrale plaat`, afwezig.every((k) => !!reg.MERK_DOMEIN[k] && lagen[k] === 'neutraal') && JSON.stringify([...afwezig].sort()) === JSON.stringify([...herkomst.afwezig].sort()), afwezig.map((k) => `${k}:${lagen[k]}`).join());
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.alloc(17)]).toString('base64');
  reg.registreerDatabaseMerken(afwezig.map((k) => ({ domein: reg.MERK_DOMEIN[k], data: png, bron: 'favicon', mime: 'image/png' })));
  check('na de eerste geslaagde ophaling door de server: laag «database» voor die merken', afwezig.every((k) => reg.merkLaag(k) === 'database'));
  reg.registreerDatabaseMerken([{ domein: 'mollie.com', data: 'https://mollie.com/favicon.ico', bron: 'favicon', mime: 'image/png' }, { domein: 'tuya.com', data: 'javascript:alert(1)', bron: 'x', mime: 'x' }]);
  check('de database neemt alleen data-URI\'s van een beeldtype aan (geen extern adres, geen javascript:)', reg.databaseMerk('mollie')?.data === png && reg.databaseMerk('tuya')?.data === png);
  check('een vorm met herkomst gaat vóór de database (Google, GitHub blijven hun simple-icons-vorm)', reg.merkLaag('google') === 'vorm' && reg.merkLaag('github') === 'vorm');
  reg.registreerEigenMerken([{ sleutel: 'windows', soort: 'png', data: png, hash: 'x' }, { sleutel: 'ukrnet', soort: 'png', data: png, hash: 'y' }]);
  check('een eigen bestand van de beheerder gaat vóór het officiële logo en vóór de database', reg.merkLaag('windows') === 'eigen' && reg.merkLaag('ukrnet') === 'eigen');
  reg._eigenMerkenOpnieuw();

  // ------------------------------------------------------------------ 6. <Merk>
  const Merk = (await import('../../src/merk/Merk')).default;
  const outlook = renderToString(createElement(Merk, { merk: 'microsoftoutlook', maat: 36 }));
  check('<Merk merk="microsoftoutlook"> tekent het officiële bestand als <img> met een data-URI — geen neutrale plaat, geen pad', outlook.includes('data-merk-officieel="microsoftoutlook"') && /<img[^>]+src="data:image\/svg\+xml;charset=utf-8,/.test(outlook) && !outlook.includes('data-merk="neutraal"') && !outlook.includes('<path'), outlook.slice(0, 200));
  check('zelfde maat als de neutrale plaat (geen sprong): width/height 36 in de stijl', /width:36px;height:36px/.test(outlook.replace(/\s/g, '')));
  check('nergens een extern adres in wat <Merk> tekent', ![...DE_21, 'oauth'].some((k) => /src="https?:/.test(renderToString(createElement(Merk, { merk: k, maat: 24 })))));
  const yahooLos = renderToString(createElement(Merk, { merk: 'yahoo', maat: 20, vorm: 'gliefje' }));
  const windowsLos = renderToString(createElement(Merk, { merk: 'windows', maat: 20, vorm: 'gliefje' }));
  check('als los gliefje: een logo met donkere delen (Yahoo) staat op een lichte plaat, een licht/kleurrijk (Windows) niet', yahooLos.includes('merk-plaat') && !windowsLos.includes('merk-plaat'));
  const db = renderToString(createElement(Merk, { merk: 'iua', maat: 36 }));
  check('merk uit de database: <img data-merk-database="i.ua"> met de data-URI van de server', db.includes('data-merk-database="i.ua"') && db.includes(`src="${png}"`));
  reg._databaseMerkenOpnieuw();
  const plaat = renderToString(createElement(Merk, { merk: 'iua', maat: 36 }));
  check('zonder database-logo: nog steeds de neutrale plaat (geen monogram «onbekend»)', plaat.includes('data-merk="neutraal"') && !plaat.includes('onbekend'));
  const css = lees('src/merk/merk.css');
  check('merk.css: het officiële logo op een vaste lichte plaat met een rand in de lijnkleur, nooit vervormd (object-fit: contain)', /span\.merk-beeld\.merk-plaat\s*\{[^}]*background:\s*#ffffff/.test(css) && /span\.merk-beeld > img\s*\{[^}]*object-fit:\s*contain/.test(css));

  console.log(`  (${bestanden.length} officiële bestanden: ${pakketRegels.length} uit pakketten, ${siteRegels.length} van de eigen website; database-merken: ${afwezig.length}; vormen met herkomst: ${metVorm.length})`);
  return einde();
}
