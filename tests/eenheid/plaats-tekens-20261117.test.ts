// PLAATS-TEKENS-001 (17.11.2026) — база знаків місць і провайдерів. Перевіряє справжню поведінку й справжні файли:
//   1. підбір знака: місто → провінція → країна (за назвою з Cloudflare, українською назвою, кодом регіону), запасні варіанти;
//   2. кожен знак в індексі має файл, файл — справжній WebP 96×96, ліцензія вільна (HERKOMST.json), загальний розмір у межах;
//   3. провайдер за номером мережі (ASN) і за назвою; кожен ключ провайдера є в реєстрі логотипів або явно «без логотипа»;
//   4. база мереж: IPv4/IPv6, приватні адреси, немає файла → null; зібране місце й провайдер запиту (backend/geo/plaats.ts);
//   5. показ через <Merk>: герб — <img> із public/merk/plaats, прапор — окремий вид, Proximus — на своїй фіолетовій підкладці;
//   6. BYOS: під час роботи сайту ці модулі нікуди не звертаються (жодного fetch до чужих адрес).
// PLAATSTEKENS: keuze, bestanden, licenties, providers, netwerkbasis, weergave en «geen verzoek naar buiten».
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { plaatsTekens, normPlaatsNaam, isPlaatsSleutel, type PlaatsIndex } from '../../shared/plaats-teken';
import { PROVIDERS, providerTeken, providerNaamUitAsNaam } from '../../shared/aanbieder-teken';
import { asnVanIp, leesAsnTabel, zoekInTabel } from '../../backend/geo/asn';
import { plaatsVanVerzoek } from '../../backend/geo/plaats';
import { OFFICIEEL_SLEUTELS } from '../../src/merk/officieel-sleutels';
import { PLAATS_DONKER, PLAATS_LANDEN } from '../../src/merk/plaats/plaats-gegenereerd';
import { merkDef } from '../../src/merk/merk-register';
import { LOGOS } from '../../src/merk/merk-logos';
import { MERKEN } from '../../src/merk/merk-tabel';
import Merk from '../../src/merk/Merk';

const MAP = 'public/merk/plaats';

export async function main() {
  const { check, einde } = checker('plaats-tekens-20261117');
  const be = JSON.parse(readFileSync(join(MAP, 'be.json'), 'utf8')) as PlaatsIndex;

  // ------------------------------------------------------------ 1. keuze
  const gent = plaatsTekens({ land: 'BE', regioCode: 'VLG', regio: 'Flanders', stad: 'Ghent' }, be);
  check('1: Ghent (Cloudflare, Engels) → wapen Gent, dan Oost-Vlaanderen, dan Vlaanderen, dan de vlag',
    gent.keten.map((t) => t.sleutel).join(' ') === 'stad-be-gent regio-be-vov regio-be-vlg land-be' && gent.stad?.naam.uk === 'Гент', gent.keten.map((t) => t.sleutel).join(' '));
  const gentUk = plaatsTekens({ land: 'be', stad: 'Гент' }, be);
  check('1: «Гент» (українською, без регіону) → той самий герб і провінція', gentUk.teken?.sleutel === 'stad-be-gent' && gentUk.keten[1]?.sleutel === 'regio-be-vov');
  const antw = plaatsTekens({ land: 'BE', stad: 'Antwerpen' }, be);
  check('1: Antwerpen → eigen wapen, provincie Antwerpen', antw.teken?.soort === 'stad' && antw.keten.some((t) => t.sleutel === 'regio-be-van'), antw.keten.map((t) => t.sleutel).join(' '));
  const onbekend = plaatsTekens({ land: 'BE', regioCode: 'VOV', stad: 'Nergenshuizen' }, be);
  check('1: onbekende stad → provincie (uit cf-region-code) → vlag', onbekend.keten.map((t) => t.sleutel).join(' ') === 'regio-be-vov land-be');
  check('1: land zonder index → alleen de vlag', plaatsTekens({ land: 'JP', stad: 'Tokyo' }, null).keten.map((t) => t.sleutel).join() === 'land-jp');
  check('1: onbekend land (XX/T1) → niets', plaatsTekens({ land: 'XX' }, be).keten.length === 0 && plaatsTekens({ land: 'T1' }, null).teken === null);
  check('1: index van een ander land wordt niet gebruikt', plaatsTekens({ land: 'NL', stad: 'Gent' }, be).keten.map((t) => t.sleutel).join() === 'land-nl');
  check('1: namen genormaliseerd zonder accenten', normPlaatsNaam('Liège') === 'liege' && normPlaatsNaam(" Kam'yanets ") === 'kamyanets');
  check('1: sleutelvorm', isPlaatsSleutel('stad-be-gent') && isPlaatsSleutel('regio-ua-46') && isPlaatsSleutel('land-be') && !isPlaatsSleutel('stad-be-../x') && !isPlaatsSleutel('telenet'));

  // ------------------------------------------------------------ 2. bestanden en licenties
  const herkomst = JSON.parse(readFileSync('src/merk/plaats/HERKOMST.json', 'utf8')) as { regels: Array<{ sleutel: string; licentie: string; pagina: string; auteur: string; sha256: string; bytes: number }>; donker: string[] };
  const perSleutel = new Map(herkomst.regels.map((r) => [r.sleutel, r]));
  const bestanden = readdirSync(MAP).filter((f) => f.endsWith('.webp'));
  const indexSleutels: string[] = [];
  for (const land of PLAATS_LANDEN) {
    const ix = JSON.parse(readFileSync(join(MAP, `${land.toLowerCase()}.json`), 'utf8')) as PlaatsIndex;
    for (const r of Object.values(ix.regios)) if (r.sleutel) indexSleutels.push(r.sleutel);
    for (const s of ix.steden) if (s.sleutel) indexSleutels.push(s.sleutel);
  }
  const zonderBestand = indexSleutels.filter((s) => !bestanden.includes(`${s}.webp`));
  check(`2: elk teken in de indexen (${indexSleutels.length}) heeft een bestand`, indexSleutels.length > 100 && zonderBestand.length === 0, zonderBestand.slice(0, 5).join(', '));
  const wees = bestanden.filter((f) => !perSleutel.has(f.slice(0, -5)));
  check(`2: elk bestand (${bestanden.length}) staat in HERKOMST.json`, wees.length === 0, wees.slice(0, 5).join(', '));
  const VRIJ = /^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$|attribution)/i;
  const nietVrij = herkomst.regels.filter((r) => !VRIJ.test(r.licentie) || !/^https:\/\/commons\.wikimedia\.org\//.test(r.pagina));
  check('2: alleen vrije licenties, elk met de Commons-pagina van het origineel', nietVrij.length === 0, nietVrij.slice(0, 3).map((r) => `${r.sleutel}: ${r.licentie}`).join('; '));
  let fout = '';
  for (const f of bestanden) {
    const b = readFileSync(join(MAP, f));
    const r = perSleutel.get(f.slice(0, -5));
    const isWebp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    // VP8X: breedte-1 en hoogte-1 als 24-bits little endian op 24 en 27.
    const vp8x = b.toString('ascii', 12, 16) === 'VP8X';
    const w = vp8x ? b.readUIntLE(24, 3) + 1 : 0, h = vp8x ? b.readUIntLE(27, 3) + 1 : 0;
    if (!isWebp || (vp8x && (w !== 96 || h !== 96)) || b.length > 16 * 1024 || r?.bytes !== b.length) { fout = `${f}: webp=${isWebp} ${w}×${h} ${b.length} B`; break; }
  }
  check('2: elk bestand is een echte WebP 96×96, ≤ 16 KB, grootte gelijk aan HERKOMST', !fout, fout);
  const totaal = bestanden.reduce((n, f) => n + statSync(join(MAP, f)).size, 0) + readdirSync(MAP).filter((f) => f.endsWith('.json')).reduce((n, f) => n + statSync(join(MAP, f)).size, 0);
  check(`2: hele basis ≤ 16 MB (nu ${(totaal / 1048576).toFixed(1)} MB) — buiten de bundel, per teken geladen`, totaal < 16 * 1048576);
  check('2: donkere ondergrond alleen voor bestaande tekens', [...PLAATS_DONKER].every((s) => perSleutel.has(s)) && herkomst.donker.length === PLAATS_DONKER.size);
  const bundel = readFileSync('src/merk/merk-officieel.ts').length;
  check(`2: luie tabel officiële logo's blijft klein (${Math.round(bundel / 1024)} KB < 300 KB)`, bundel < 300 * 1024);

  // ------------------------------------------------------------ 3. providers
  check('3: ASN → provider', providerTeken({ asn: 5432 })?.sleutel === 'proximus' && providerTeken({ asn: 'AS6848' })?.sleutel === 'telenet'
    && providerTeken({ asn: 1136 })?.sleutel === 'kpn' && providerTeken({ asn: 15895 })?.sleutel === 'kyivstar' && providerTeken({ asn: 21497 })?.sleutel === 'vodafone');
  check('3: netwerknaam → provider; onbekend → null', providerTeken({ naam: 'TELENET-AS Telenet BV' })?.sleutel === 'telenet' && providerTeken({ asn: 64512, naam: 'Kleine Coöperatie' }) === null);
  check('3: leesbare naam uit de netwerknaam', providerNaamUitAsNaam('PROXIMUS-ISP-AS Proximus NV') === 'Proximus NV' && providerNaamUitAsNaam('CLOUDFLARENET - Cloudflare, Inc.') === 'Cloudflare, Inc.');
  const geenLogo = PROVIDERS.filter((p) => !p.zonderLogo && !OFFICIEEL_SLEUTELS.has(p.sleutel) && !merkDef(p.sleutel) && !(p.sleutel in LOGOS) && !(p.sleutel in MERKEN));
  check('3: elke provider heeft een logo in het register (of is bewust gemarkeerd «zonderLogo», max. 3)', geenLogo.length === 0 && PROVIDERS.filter((p) => p.zonderLogo).length <= 3, geenLogo.map((p) => p.sleutel).join(', '));
  const nieuw = ['lenovo', 'dell', 'hp', 'asus', 'acer', 'xiaomi', 'passkey', 'proximus', 'telenet', 'voo', 'kpn', 'odido', 'ziggo', 'vodafone', 'ukrtelecom', 'deutschetelekom', 'ukrnet'];
  check('3: nieuwe officiële logo\'s (fabrikanten, providers, passkey, Ukr.net) staan in het register', nieuw.every((s) => OFFICIEEL_SLEUTELS.has(s)), nieuw.filter((s) => !OFFICIEEL_SLEUTELS.has(s)).join(', '));
  const hk = JSON.parse(readFileSync('src/merk/officieel/HERKOMST.json', 'utf8')) as { regels: Array<{ sleutel: string; plaat?: string; bronUrl: string; pagina?: string }> };
  const ukr = hk.regels.find((r) => r.sleutel === 'ukrnet');
  check('3: Ukr.net = het voorbeeld van de eigenaar (webcatalog), Proximus op #5c2d91', !!ukr && ukr.bronUrl.includes('webcatalog.io') && hk.regels.find((r) => r.sleutel === 'proximus')?.plaat === '#5c2d91');

  // ------------------------------------------------------------ 4. netwerkbasis
  const tsv = ['1.0.0.0\t1.0.0.255\t13335\tUS\tCLOUDFLARENET - Cloudflare, Inc.', '81.82.0.0\t81.83.255.255\t6848\tBE\tTELENET-AS Telenet BV', '81.84.0.0\t81.84.0.255\t0\tNone\tNot routed', '91.183.0.0\t91.183.255.255\t5432\tBE\tPROXIMUS-ISP-AS Proximus NV'].join('\n');
  const t = leesAsnTabel(gzipSync(Buffer.from(`${tsv}\n`)));
  check('4: tabel gelezen (gzip), «Not routed» overgeslagen', t.n === 3);
  const ipv = (s: string) => BigInt(s.split('.').reduce((n, d) => n * 256 + Number(d), 0));
  check('4: binair zoeken: binnen, rand, buiten', zoekInTabel(t, ipv('81.82.10.1'))?.asn === 6848 && zoekInTabel(t, ipv('81.83.255.255'))?.asn === 6848 && zoekInTabel(t, ipv('81.84.0.5')) === null && zoekInTabel(t, ipv('9.9.9.9')) === null);
  const map = mkdtempSync(join(tmpdir(), 'geo-'));
  const oud = process.env.MIJN_RUIMTE_GEO_MAP;
  try {
    process.env.MIJN_RUIMTE_GEO_MAP = map;
    check('4: geen basis → geen provider (geen fout, geen verzoek)', asnVanIp('81.82.0.1') === null);
    writeFileSync(join(map, 'ip2asn-v4.tsv.gz'), gzipSync(Buffer.from(tsv)));
    writeFileSync(join(map, 'ip2asn-v6.tsv'), '2a02:1800::\t2a02:1803:ffff:ffff:ffff:ffff:ffff:ffff\t6848\tBE\tTELENET-AS Telenet BV\n');
    check('4: IPv4 en ::ffff:-vorm', asnVanIp('81.82.0.1')?.asn === 6848 && asnVanIp('::ffff:91.183.1.2')?.asn === 5432);
    check('4: IPv6', asnVanIp('2a02:1801:abcd::1')?.asn === 6848 && asnVanIp('2a03::1') === null);
    check('4: privé/lokale adressen → null', ['192.168.1.4', '10.0.0.1', '127.0.0.1', '100.64.1.1', '::1', 'fe80::1', 'onzin'].every((ip) => asnVanIp(ip) === null));
    const v = plaatsVanVerzoek({ 'cf-ipcountry': 'BE', 'cf-region-code': 'VLG', 'cf-region': 'Flanders', 'cf-ipcity': 'Ghent' }, '81.82.0.1');
    check('4: verzoek uit Gent via Telenet → wapen Gent … vlag, provider Telenet met logo',
      v.keten.map((x) => x.sleutel).join(' ') === 'stad-be-gent regio-be-vov regio-be-vlg land-be' && v.provider?.sleutel === 'telenet' && v.provider.naam === 'Telenet' && v.bron === 'cloudflare');
    const z = plaatsVanVerzoek({}, '91.183.0.9');
    check('4: zonder Cloudflare-koppen → land uit de netwerkbasis, provider Proximus', z.land === 'BE' && z.keten.map((x) => x.sleutel).join() === 'land-be' && z.provider?.sleutel === 'proximus' && z.bron === 'netwerkbasis');
    const n = plaatsVanVerzoek({ 'cf-ipcountry': 'BE' }, '1.2.3.4');
    check('4: onbekende provider → naam leeg, geen sleutel', n.provider === null && n.keten.length === 1);
  } finally {
    if (oud === undefined) delete process.env.MIJN_RUIMTE_GEO_MAP; else process.env.MIJN_RUIMTE_GEO_MAP = oud;
    rmSync(map, { recursive: true, force: true });
  }

  // ------------------------------------------------------------ 5. weergave
  const wapen = renderToString(createElement(Merk, { merk: 'stad-be-gent', vorm: 'rond', maat: 22 }));
  check('5: <Merk merk="stad-be-gent"> = <img> uit public/merk/plaats, rond, op een plaat', wapen.includes('src="/merk/plaats/stad-be-gent.webp"') && wapen.includes('data-merk-plaats="stad-be-gent"') && wapen.includes('merk-plaat') && /border-radius:11px/.test(wapen));
  const vlag = renderToString(createElement(Merk, { merk: 'land-be', vorm: 'rond', maat: 22 }));
  check('5: <Merk merk="land-be"> = vlagvlak (vlag wordt per land lui geladen)', vlag.includes('merk-plaats-vlag') && vlag.includes('data-merk-plaats="land-be"'));
  const keten = renderToString(createElement(Merk, { keten: ['stad-be-gent', 'regio-be-vov', 'land-be'], maat: 20, vorm: 'rond' }));
  check('5: keten: eerste teken wordt getoond', keten.includes('/merk/plaats/stad-be-gent.webp'));
  await import('../../src/merk/merk-officieel');
  const prox = renderToString(createElement(Merk, { merk: 'proximus', vorm: 'gliefje', maat: 22 }));
  check('5: Proximus (wit teken) staat ook als gliefje op zijn eigen paarse plaat', prox.includes('data-merk-plaatkleur="#5c2d91"') && prox.includes('background:#5c2d91'));
  const lenovo = renderToString(createElement(Merk, { merk: 'lenovo', vorm: 'rond', maat: 22 }));
  check('5: Lenovo uit het officiële register (geen monogram)', lenovo.includes('data-merk-officieel="lenovo"'));

  // ------------------------------------------------------------ 6. BYOS
  const bronnen = ['shared/plaats-teken.ts', 'shared/aanbieder-teken.ts', 'backend/geo/asn.ts', 'backend/geo/plaats.ts', 'src/merk/MerkPlaats.tsx', 'src/merk/merk-plaats.ts'].map((f) => readFileSync(f, 'utf8'));
  const naarBuiten = bronnen.some((s) => /https?:\/\/(?!commons\.wikimedia|iptoasn)/.test(s.replace(/\/\/.*$/gm, '')) || /fetch\(\s*['"`]https?:/.test(s));
  check('6: tijdens het draaien geen verzoek naar buiten (alleen eigen /merk/plaats en lokale bestanden)', !naarBuiten);

  return einde();
}
