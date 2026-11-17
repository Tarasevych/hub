// ОНОВЛЕННЯ БАЗИ МЕРЕЖ (PLAATS-TEKENS-001, 17.11.2026). Завантажує відкриту базу «IP → номер мережі (ASN) → назва провайдера» з
// iptoasn.com (суспільне надбання, Open Data Commons PDDL) у теку сервера, щоб сайт сам, без зовнішніх служб, знав провайдера
// для сповіщень про вхід. Запускає адміністратор (або таймер, якщо він так вирішить); сайт під час роботи нікуди не звертається.
// NETWERKBASIS BIJWERKEN: haalt ip2asn-v4/v6.tsv.gz van iptoasn.com (PDDL) naar MIJN_RUIMTE_GEO_MAP. Draait als beheerder (beheer),
// nooit als root nodig: de map moet alleen schrijfbaar zijn voor deze gebruiker.
//
// Gebruik:  node scripts/asn-basis-bijwerken.mjs [--map /var/lib/mijn-ruimte/geo] [--bron <map met eigen kopie>]
//   --bron: neemt de bestanden uit een map (bv. een kopie die je zelf hebt binnengehaald) in plaats van te downloaden.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const arg = (n, d = '') => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MAP = arg('--map', process.env.MIJN_RUIMTE_GEO_MAP || '/var/lib/mijn-ruimte/geo');
const BRON = arg('--bron');
const BESTANDEN = ['ip2asn-v4.tsv.gz', 'ip2asn-v6.tsv.gz'];
mkdirSync(MAP, { recursive: true });

/** Controle vóór vervangen: echt gzip, ≥ 10 000 regels, elke steekproefregel heeft 5 velden met een geldig ASN. */
function controleer(buf, naam) {
  const tekst = gunzipSync(buf).toString('utf8');
  const regels = tekst.split('\n').filter(Boolean);
  if (regels.length < 10000) throw new Error(`${naam}: te weinig regels (${regels.length})`);
  for (const r of regels.filter((_, i) => i % 997 === 0)) {
    const v = r.split('\t');
    if (v.length < 5 || !/^\d+$/.test(v[2])) throw new Error(`${naam}: onverwachte regel «${r.slice(0, 80)}»`);
  }
  return regels.length;
}

for (const naam of BESTANDEN) {
  let buf;
  if (BRON) buf = readFileSync(join(BRON, naam));
  else {
    const r = await fetch(`https://iptoasn.com/data/${naam}`, { headers: { 'User-Agent': 'MijnRuimte-asn-basis/1.0 (self-hosted)' } });
    if (!r.ok) throw new Error(`${naam}: HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const n = controleer(buf, naam);
  const doel = join(MAP, naam);
  if (existsSync(doel)) copyFileSync(doel, `${doel}.vorige`);
  writeFileSync(`${doel}.nieuw`, buf);
  renameSync(`${doel}.nieuw`, doel); // atomisch: de server ziet nooit een half bestand
  console.log(`${naam}: ${n} netwerken, ${Math.round(statSync(doel).size / 1024)} KB → ${doel}`);
}
writeFileSync(join(MAP, 'BRON.txt'), `iptoasn.com — IP to ASN (Open Data Commons Public Domain Dedication and License, PDDL)\nbijgewerkt: ${new Date().toISOString()}\n`);
