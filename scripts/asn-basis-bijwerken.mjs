// ОНОВЛЕННЯ БАЗИ МЕРЕЖ (PLAATS-TEKENS-001, 17.11.2026). Завантажує відкриту базу «IP → номер мережі (ASN) → назва провайдера» з
// iptoasn.com (суспільне надбання, Open Data Commons PDDL) у теку сервера, щоб сайт сам, без зовнішніх служб, знав провайдера
// для сповіщень про вхід. Запускає адміністратор (або таймер, якщо він так вирішить); сайт під час роботи нікуди не звертається.
// NETWERKBASIS BIJWERKEN: haalt ip2asn-v4/v6.tsv.gz van iptoasn.com (PDDL) naar MIJN_RUIMTE_GEO_MAP. Draait als beheerder (beheer),
// nooit als root nodig: de map moet alleen schrijfbaar zijn voor deze gebruiker.
//
// Також (емблема «Мережа», 17.11.2026) три відкриті списки для backend/geo/netwerk.ts: вихідні вузли Tor (Tor Project),
// діапазони iCloud Private Relay (Apple) і сервери Mullvad. Збій одного списку не зупиняє решту: лишається попередня копія.
// Ook drie open lijsten: Tor-uitgangen, iCloud Private Relay-bereiken en Mullvad-servers. Een mislukte lijst houdt de vorige kopie.
//
// Gebruik:  node scripts/asn-basis-bijwerken.mjs [--map /var/lib/mijn-ruimte/geo] [--bron <map met eigen kopie>] [--zonder-lijsten]
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
// ---------------------------------------------------------------- open lijsten (Tor, iCloud Private Relay, Mullvad)
const IP = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+:[0-9a-f:]*)(\/\d{1,3})?$/i;
const LIJSTEN = [
  { naam: 'tor-exit.txt', url: 'https://check.torproject.org/torbulkexitlist', bron: 'Tor Project — torbulkexitlist',
    controleer: (t) => { const r = t.split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#')); if (r.length < 200 || r.some((x) => !IP.test(x))) throw new Error(`${r.length} regels of een regel zonder IP`); return r.length; } },
  { naam: 'apple-relay.csv', url: 'https://mask-api.icloud.com/egress-ip-ranges.csv', bron: 'Apple — iCloud Private Relay egress IP ranges',
    controleer: (t) => { const r = t.split('\n').filter(Boolean); if (r.length < 1000 || r.filter((_, i) => i % 499 === 0).some((x) => !IP.test(x.split(',')[0].trim()))) throw new Error(`${r.length} regels of een regel zonder bereik`); return r.length; } },
  { naam: 'mullvad.json', url: 'https://api.mullvad.net/www/relays/all/', bron: 'Mullvad — openbare serverlijst',
    controleer: (t) => { const j = JSON.parse(t); if (!Array.isArray(j) || j.length < 100 || !j.every((x) => x && typeof x === 'object' && (!x.ipv4_addr_in || IP.test(String(x.ipv4_addr_in))))) throw new Error('geen lijst met servers'); return j.length; },
    // Alleen wat de site gebruikt: adressen. Namen, eigenaars en sleutels blijven buiten de server.
    inkorten: (t) => JSON.stringify(JSON.parse(t).map((x) => ({ ipv4_addr_in: x.ipv4_addr_in || undefined, ipv6_addr_in: x.ipv6_addr_in || undefined }))) },
];
const bronRegels = ['iptoasn.com — IP to ASN (Open Data Commons Public Domain Dedication and License, PDDL)'];
if (!process.argv.includes('--zonder-lijsten')) {
  for (const l of LIJSTEN) {
    try {
      let tekst;
      if (BRON) { const p = join(BRON, l.naam); if (!existsSync(p)) { console.log(`${l.naam}: niet in --bron, overgeslagen`); continue; } tekst = readFileSync(p, 'utf8'); }
      else {
        const r = await fetch(l.url, { headers: { 'User-Agent': 'MijnRuimte-asn-basis/1.0 (self-hosted)' }, signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        tekst = await r.text();
      }
      const n = l.controleer(tekst);
      const doel = join(MAP, l.naam);
      if (existsSync(doel)) copyFileSync(doel, `${doel}.vorige`);
      writeFileSync(`${doel}.nieuw`, l.inkorten ? l.inkorten(tekst) : tekst);
      renameSync(`${doel}.nieuw`, doel);
      bronRegels.push(`${l.bron} (${l.url})`);
      console.log(`${l.naam}: ${n} regels → ${doel}`);
    } catch (e) {
      console.log(`${l.naam}: NIET bijgewerkt (${e.message}); de vorige kopie blijft staan.`);
    }
  }
}
writeFileSync(join(MAP, 'BRON.txt'), `${bronRegels.join('\n')}\nbijgewerkt: ${new Date().toISOString()}\n`);
