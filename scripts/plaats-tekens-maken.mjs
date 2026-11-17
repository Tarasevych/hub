// БАЗА ЗНАКІВ МІСЦЬ (PLAATS-TEKENS-001, 17.11.2026, Павло: «має бути знак геолокації і біля нього маленьким кружечком логотип
// міста, гербу чи локації», «логотипи мають братися з бази логотипів та оригінали а не малюватися заново», «логотипи провінції
// також треба базу створити»).
// BASIS VAN PLAATSTEKENS: wapens van steden en provincies/oblasten, uit de ORIGINELE bestanden op Wikimedia Commons.
//
// Wat dit script doet — en wat NIET:
//   • het VRAAGT aan Wikidata (SPARQL) welke gemeenten/steden en provincies welk wapen (P94) of welke vlag (P41) hebben, met hun
//     ISO 3166-2-code (P300), GeoNames-id (P1566) en namen in uk/nl/en/fr/de/pl;
//   • het CONTROLEERT per bestand de licentie op Commons (imageinfo → extmetadata). Alleen vrije licenties (publiek domein, CC0,
//     CC BY, CC BY-SA) komen erin; elk bestand krijgt auteur, licentie en bronpagina in HERKOMST.json;
//   • het NEEMT de kleine weergave die Commons zelf van het origineel maakt (standaardbreedte 250 px) en verkleint die naar 96 px
//     WebP. Het TEKENT NIETS: geen vorm wordt veranderd, alleen de lege (doorzichtige) rand wordt bijgesneden;
//   • de site heeft daarna GEEN internet nodig (BYOS): de bestanden staan in public/merk/plaats/ en worden pas geladen als een
//     plaatsteken op het scherm komt (<img>, niet in de bundel).
//
// Uitvoer:
//   public/merk/plaats/<sleutel>.webp      het teken (96×96, doorzichtig)
//   public/merk/plaats/<land>.json         index per land (regio's en steden met namen) — voor shared/plaats-teken.ts
//   src/merk/plaats/HERKOMST.json          per bestand: Commons-bestand, auteur, licentie, sha256
//   src/merk/plaats/plaats-gegenereerd.ts  welke landen een index hebben en welke tekens een DONKERE ondergrond nodig hebben
//
// Gebruik:  node scripts/plaats-tekens-maken.mjs [--cache <map>] [--landen BE,NL,UA] [--alleen <sleutel,...>]
//   De cache (standaard rapporten/plaats-tekens-cache) houdt de antwoorden van Wikidata/Commons en de beelden vast: Commons beperkt
//   het aantal verzoeken streng (429). Een onderbroken run gaat de volgende keer verder waar hij stopte.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const WORTEL = process.cwd();
const arg = (n, d = '') => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('--cache', join(WORTEL, 'rapporten/plaats-tekens-cache'));
const UIT_BEELD = join(WORTEL, 'public/merk/plaats');
const UIT_SRC = join(WORTEL, 'src/merk/plaats');
const UA = 'MijnRuimtePlaatsTekens/1.0 (self-hosted; scripts/plaats-tekens-maken.mjs)';
const MAAT = 96;
mkdirSync(join(CACHE, 'beeld'), { recursive: true });
mkdirSync(UIT_BEELD, { recursive: true });
mkdirSync(UIT_SRC, { recursive: true });

// ------------------------------------------------------------------------------------------------ welke plaatsen
// Landen met een volledige gemeentelijst (wapen van elke gemeente) en buurlanden met hun grote steden (≥ 100 000 inwoners).
// Klassen: gemeente van België (Q493522), gemeente van Nederland (Q2039348), stad van Oekraïne (Q12131624), gemeente van
// Luxemburg (Q2919801); voor DE/FR/PL: stad (Q515, ook subklassen) met ≥ 100 000 inwoners.
export const LANDEN = {
  BE: { qid: 'Q31', klasse: 'Q493522' },
  NL: { qid: 'Q55', klasse: 'Q2039348' },
  UA: { qid: 'Q212', klasse: 'Q12131624' },
  LU: { qid: 'Q32', klasse: 'Q2919801' },
  DE: { qid: 'Q183', minInwoners: 100000 },
  FR: { qid: 'Q142', minInwoners: 100000 },
  PL: { qid: 'Q36', minInwoners: 100000 },
};
const gekozen = arg('--landen', Object.keys(LANDEN).join(',')).split(',').map((s) => s.trim().toUpperCase()).filter((l) => LANDEN[l]);
const alleen = new Set(arg('--alleen').split(',').filter(Boolean));
const TALEN = ['uk', 'nl', 'en', 'fr', 'de', 'pl', 'ru'];

// ------------------------------------------------------------------------------------------------ netwerk met geduld
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function haal(url, { soort = 'json', pogingen = 12, init = {} } = {}) {
  let pauze = 15000;
  for (let i = 0; i < pogingen; i++) {
    let r;
    try { r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) } }); } catch (e) { r = null; }
    if (r && r.ok) return soort === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
    const code = r ? r.status : 'netwerk';
    if (r && r.status === 404) throw new Error(`404 ${url}`);
    console.error(`  ${code} — opnieuw over ${Math.round(pauze / 1000)} s (${i + 1}/${pogingen})`);
    await wacht(pauze);
    pauze = Math.min(pauze * 1.6, 180000);
  }
  throw new Error(`geen antwoord: ${url}`);
}
function inCache(naam, maak) {
  const f = join(CACHE, naam);
  if (existsSync(f)) return Promise.resolve(JSON.parse(readFileSync(f, 'utf8')));
  return maak().then((v) => { writeFileSync(f, JSON.stringify(v)); return v; });
}
const sparql = (q) => haal(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { init: { headers: { Accept: 'application/sparql-results+json' } } });

// ------------------------------------------------------------------------------------------------ 1. Wikidata
const labelDeel = TALEN.map((t) => `OPTIONAL{?it rdfs:label ?l_${t} FILTER(lang(?l_${t})="${t}")}`).join(' ');
const labelVars = TALEN.map((t) => `?l_${t}`).join(' ');
const bestandNaam = (v) => decodeURIComponent(String(v || '').split('/Special:FilePath/')[1] || '').replace(/_/g, ' ');

async function regiosVan(land) {
  return inCache(`regio-${land}.json`, async () => {
    const q = `SELECT ?it ?iso ?coa ?flag ?gn ${labelVars} WHERE { ?it wdt:P300 ?iso . FILTER(STRSTARTS(?iso, "${land}-"))
      FILTER NOT EXISTS { ?it wdt:P576 ?e } OPTIONAL{?it wdt:P94 ?coa} OPTIONAL{?it wdt:P41 ?flag} OPTIONAL{?it wdt:P1566 ?gn} ${labelDeel} }`;
    return (await sparql(q)).results.bindings;
  });
}
async function stedenVan(land) {
  const c = LANDEN[land];
  return inCache(`stad-${land}.json`, async () => {
    const wie = c.klasse
      ? `?it p:P31 ?st . ?st ps:P31 wd:${c.klasse} . FILTER NOT EXISTS { ?st pq:P582 ?eind }`
      : `?it wdt:P31/wdt:P279* wd:Q515 ; wdt:P17 wd:${c.qid} ; wdt:P1082 ?pop . FILTER(?pop >= ${c.minInwoners})`;
    const q = `SELECT ?it ?coa ?gn ?iso ${labelVars} WHERE { ${wie} FILTER NOT EXISTS { ?it wdt:P576 ?e }
      OPTIONAL{?it wdt:P94 ?coa} OPTIONAL{?it wdt:P1566 ?gn}
      OPTIONAL{?it wdt:P131+ ?adm . ?adm wdt:P300 ?iso . FILTER NOT EXISTS { ?adm wdt:P576 ?e2 } } ${labelDeel} }`;
    return (await sparql(q)).results.bindings;
  });
}
const alt = async (land) => inCache(`alias-${land}.json`, async () => {
  // Andere namen (en/nl/uk) van de steden: Cloudflare noemt «Ghent», de gebruiker «Гент», Wikidata «Gent».
  const c = LANDEN[land];
  const wie = c.klasse ? `?it p:P31 ?st . ?st ps:P31 wd:${c.klasse} .` : `?it wdt:P31/wdt:P279* wd:Q515 ; wdt:P17 wd:${c.qid} ; wdt:P1082 ?pop . FILTER(?pop >= ${c.minInwoners})`;
  const q = `SELECT ?it ?a WHERE { ${wie} ?it skos:altLabel ?a . FILTER(lang(?a) IN ("en","nl","uk","fr","de")) }`;
  return (await sparql(q)).results.bindings;
});

// ------------------------------------------------------------------------------------------------ 2. Commons: licentie
const VRIJ = /^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$|attribution)/i;
const zonderHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 200);
async function licenties(namen) {
  const f = join(CACHE, 'licenties.json');
  const bekend = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const open = [...new Set(namen)].filter((n) => n && !bekend[n]);
  for (let i = 0; i < open.length; i += 50) {
    const deel = open.slice(i, i + 50);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=LicenseShortName|Artist|LicenseUrl&titles=${encodeURIComponent(deel.map((n) => `File:${n}`).join('|'))}`;
    const d = await haal(url);
    const norm = Object.fromEntries((d.query?.normalized || []).map((x) => [x.to, x.from]));
    for (const p of Object.values(d.query?.pages || {})) {
      const naam = (norm[p.title] || p.title).replace(/^File:/, '');
      const ii = p.imageinfo?.[0];
      const m = ii?.extmetadata || {};
      bekend[naam] = ii ? { licentie: zonderHtml(m.LicenseShortName?.value), licentieUrl: m.LicenseUrl?.value || '', auteur: zonderHtml(m.Artist?.value), pagina: ii.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(naam.replace(/ /g, '_'))}`, origineel: (ii.url || '').split('?')[0] } : { ontbreekt: true };
    }
    writeFileSync(f, JSON.stringify(bekend));
    console.log(`licenties ${Math.min(i + 50, open.length)}/${open.length}`);
    await wacht(4000);
  }
  return bekend;
}

// ------------------------------------------------------------------------------------------------ 3. Commons: beeld (250 px)
const md5 = (s) => createHash('md5').update(s).digest('hex');
function thumbUrl(naam) {
  const n = naam.replace(/ /g, '_'); const h = md5(n); const q = encodeURIComponent(n);
  const png = /\.(svg|tiff?|pdf)$/i.test(n) ? '.png' : '';
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${q}/250px-${q}${png}`;
}
async function beeld(naam) {
  const f = join(CACHE, 'beeld', `${md5(naam)}.bin`);
  if (existsSync(f)) return readFileSync(f);
  const b = await haal(thumbUrl(naam), { soort: 'buffer' });
  writeFileSync(f, b);
  await wacht(1500);
  return b;
}

// ------------------------------------------------------------------------------------------------ 4. verkleinen (Chromium-canvas)
// Geen eigen beeldbibliotheek: dezelfde Chromium als de tests (Playwright). Snijdt alleen de DOORZICHTIGE rand weg, past het teken
// in een vierkant van 96 px en meet of het teken zo licht is dat het een donkere ondergrond nodig heeft.
async function verkleiner() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  return {
    async maak(buf, mime) {
      return page.evaluate(async ({ b64, mime, MAAT }) => {
        const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight;
        const a = new OffscreenCanvas(w, h).getContext('2d'); a.drawImage(img, 0, 0);
        const d = a.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        if (x1 < 0) return null;
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = MAAT / Math.max(bw, bh);
        const tw = Math.max(1, Math.round(bw * s)), th = Math.max(1, Math.round(bh * s));
        const c = new OffscreenCanvas(MAAT, MAAT); const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, x0, y0, bw, bh, Math.round((MAAT - tw) / 2), Math.round((MAAT - th) / 2), tw, th);
        // Helderheid van de dekkende pixels: ≥ 0,8 gemiddeld en weinig donkere delen = teken valt weg op wit → donkere ondergrond.
        const p = g.getImageData(0, 0, MAAT, MAAT).data; let som = 0, n = 0, donker = 0;
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 128) { const L = 0.2126 * lin(p[i]) + 0.7152 * lin(p[i + 1]) + 0.0722 * lin(p[i + 2]); som += L; n++; if (L < 0.35) donker++; }
        const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.9 });
        const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (const x of bytes) bin += String.fromCharCode(x);
        return { webp: btoa(bin), helder: n ? som / n : 0, donkerDeel: n ? donker / n : 0 };
      }, { b64: buf.toString('base64'), mime, MAAT });
    },
    sluit: () => browser.close(),
  };
}

// ------------------------------------------------------------------------------------------------ namen en sleutels
export const normNaam = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’ʼ`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (s) => normNaam(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const qid = (it) => String(it).split('/').pop();
function verzamel(rijen, extra = []) {
  const per = new Map();
  for (const x of rijen) {
    const id = qid(x.it.value);
    const o = per.get(id) || { qid: id, namen: {}, iso: new Set(), coa: new Set(), flag: new Set(), gn: '', alias: new Set() };
    for (const t of TALEN) if (x[`l_${t}`]) o.namen[t] = x[`l_${t}`].value;
    if (x.iso) o.iso.add(x.iso.value);
    if (x.coa) o.coa.add(bestandNaam(x.coa.value));
    if (x.flag) o.flag.add(bestandNaam(x.flag.value));
    if (x.gn && !o.gn) o.gn = x.gn.value;
    per.set(id, o);
  }
  for (const x of extra) { const o = per.get(qid(x.it.value)); if (o) o.alias.add(x.a.value); }
  return [...per.values()];
}

// ------------------------------------------------------------------------------------------------ hoofdprogramma
const herkomstF = join(UIT_SRC, 'HERKOMST.json');
const oud = existsSync(herkomstF) ? JSON.parse(readFileSync(herkomstF, 'utf8')) : { regels: [] };
const herkomst = new Map((oud.regels || []).map((r) => [r.sleutel, r]));
const donkerOndergrond = new Set(oud.donker || []);
const indexen = {};
const overgeslagen = [];
let v = null;

try {
  for (const land of gekozen) {
    console.log(`== ${land}`);
    const regios = verzamel(await regiosVan(land));
    const steden = verzamel(await stedenVan(land), await alt(land));
    const nodig = [...regios.flatMap((r) => [...r.coa, ...r.flag]), ...steden.flatMap((s) => [...s.coa])];
    const lic = await licenties(nodig);
    const index = { land, regios: {}, steden: [] };
    const gebruikt = new Set();

    const maak = async (sleutel, kandidaten) => {
      if (alleen.size && !alleen.has(sleutel)) return herkomst.has(sleutel) ? sleutel : '';
      for (const naam of kandidaten) {
        const l = lic[naam];
        if (!l || l.ontbreekt) { overgeslagen.push(`${sleutel}: ${naam} (niet op Commons)`); continue; }
        if (!VRIJ.test(l.licentie)) { overgeslagen.push(`${sleutel}: ${naam} (licentie «${l.licentie}»)`); continue; }
        const oudR = herkomst.get(sleutel);
        if (oudR && oudR.bestand === naam && existsSync(join(UIT_BEELD, `${sleutel}.webp`))) return sleutel;
        let buf;
        try { buf = await beeld(naam); } catch (e) { overgeslagen.push(`${sleutel}: ${naam} (${e.message})`); continue; }
        v ||= await verkleiner();
        const mime = buf[0] === 0x89 ? 'image/png' : buf[0] === 0xff ? 'image/jpeg' : 'image/png';
        const r = await v.maak(buf, mime).catch(() => null);
        if (!r) { overgeslagen.push(`${sleutel}: ${naam} (leeg beeld)`); continue; }
        const webp = Buffer.from(r.webp, 'base64');
        writeFileSync(join(UIT_BEELD, `${sleutel}.webp`), webp);
        if (r.helder > 0.8 && r.donkerDeel < 0.04) donkerOndergrond.add(sleutel); else donkerOndergrond.delete(sleutel);
        herkomst.set(sleutel, { sleutel, bestand: naam, pagina: l.pagina, origineel: l.origineel, auteur: l.auteur, licentie: l.licentie, licentieUrl: l.licentieUrl, bytes: webp.length, sha256: createHash('sha256').update(webp).digest('hex') });
        return sleutel;
      }
      return '';
    };

    for (const r of regios) {
      const iso = [...r.iso][0];
      const sleutel = `regio-${iso.toLowerCase()}`;
      // Een wapen eerst (Павло: «герб»), anders de vlag van de provincie.
      const s = await maak(sleutel, [...r.coa, ...r.flag]);
      index.regios[iso] = { ...(s ? { sleutel: s } : {}), namen: [...new Set(Object.values(r.namen).map(normNaam))].filter(Boolean), naam: { uk: r.namen.uk || r.namen.en || '', nl: r.namen.nl || r.namen.en || '' }, ...(r.gn ? { gn: r.gn } : {}) };
    }
    for (const s of steden) {
      const naam = s.namen.en || s.namen.nl || s.namen[Object.keys(s.namen)[0]] || s.qid;
      let sleutel = `stad-${land.toLowerCase()}-${slug(s.namen.nl && land !== 'UA' ? s.namen.nl : naam) || s.qid.toLowerCase()}`;
      if (gebruikt.has(sleutel)) sleutel = `${sleutel}-${s.qid.toLowerCase()}`;
      gebruikt.add(sleutel);
      const t = s.coa.size ? await maak(sleutel, [...s.coa]) : '';
      index.steden.push({
        ...(t ? { sleutel: t } : {}), qid: s.qid, ...(s.gn ? { gn: s.gn } : {}),
        regio: [...s.iso].filter((i) => i.startsWith(`${land}-`)).sort(),
        namen: [...new Set([...Object.values(s.namen), ...s.alias].map(normNaam))].filter(Boolean),
        naam: { uk: s.namen.uk || naam, nl: s.namen.nl || naam },
      });
    }
    index.steden.sort((a, b) => a.naam.nl.localeCompare(b.naam.nl));
    writeFileSync(join(UIT_BEELD, `${land.toLowerCase()}.json`), JSON.stringify(index));
    indexen[land] = { regios: Object.keys(index.regios).length, steden: index.steden.length, metTeken: index.steden.filter((x) => x.sleutel).length };
    console.log(`   ${land}: ${indexen[land].regios} regio's, ${indexen[land].steden} steden (${indexen[land].metTeken} met teken)`);
  }
} finally { if (v) await v.sluit(); }

// Weesbestanden (sleutel niet meer in HERKOMST) opruimen; alleen in de eigen uitvoermap.
for (const f of readdirSync(UIT_BEELD)) if (f.endsWith('.webp') && !herkomst.has(f.slice(0, -5))) rmSync(join(UIT_BEELD, f));
const regels = [...herkomst.values()].sort((a, b) => a.sleutel.localeCompare(b.sleutel));
const landen = readdirSync(UIT_BEELD).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2).toUpperCase()).sort();
writeFileSync(herkomstF, `${JSON.stringify({ gemaakt: 'scripts/plaats-tekens-maken.mjs', bron: 'Wikidata (P94/P41/P300/P1566) + Wikimedia Commons (250 px-weergave van het origineel)', donker: [...donkerOndergrond].filter((s) => herkomst.has(s)).sort(), regels }, null, 1)}\n`);
writeFileSync(join(UIT_SRC, 'plaats-gegenereerd.ts'), `// GEGENEREERD door scripts/plaats-tekens-maken.mjs — niet met de hand bewerken.
// Згенеровано скриптом scripts/plaats-tekens-maken.mjs — вручну не правити.
/** Landen met een index van regio's en steden (public/merk/plaats/<land>.json). */
export const PLAATS_LANDEN: readonly string[] = ${JSON.stringify(landen)};
/** Tekens die zo licht zijn dat ze op een DONKERE ondergrond moeten staan (anders vallen ze weg op wit). */
export const PLAATS_DONKER: ReadonlySet<string> = new Set(${JSON.stringify([...donkerOndergrond].filter((s) => herkomst.has(s)).sort())});
`);
if (overgeslagen.length) writeFileSync(join(CACHE, 'overgeslagen.txt'), `${overgeslagen.join('\n')}\n`);
console.log(JSON.stringify(indexen), `\n${regels.length} tekens; overgeslagen: ${overgeslagen.length} (zie ${join(CACHE, 'overgeslagen.txt')})`);
