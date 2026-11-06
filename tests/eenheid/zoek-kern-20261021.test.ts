// ZOEKKERN (Etap A+B, 21.10.2026) — ZUIVERE TESTS, BIJGEWERKT NAAR ZOEKKERN v2 (Z1, 22.10.2026).
// De oude SQL-tweeling app.zoek_norm is weg (0100: zij brak bij datctype=C), dus de «elke regel staat in 0093»-controle is
// vervangen door: de normalisatie leeft ALLEEN in Node en is locale-onafhankelijk. De databasekant staat in
// tests/eenheid/zoek-kern-20261022.test.ts. Geen database nodig hier.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { LATIJN_EXTRA, TRANSLIT, VOUW, zoekNorm, zoekTokens, varianten } from '../../shared/zoek-normalisatie';
import { breidUit, synoniemen } from '../../shared/zoek-synoniemen';
import { relevantie, trigramSimilariteit, percentVan, scoreVanSignalen, signalenInGeheugen, vraagGroepen, uitlegVan } from '../../shared/zoek-rangschikking';
import { tsQueryTekst, zoekIndexBijwerken, zoekInIndex } from '../../backend/zoek-index';

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-kern');
  // normalisatie
  check('kleine letters + diacritica', zoekNorm('Café Ÿ Łódź Straße') === 'cafe y lodz strasse', zoekNorm('Café Ÿ Łódź Straße'));
  check('uk ↔ Latijn: Харків == Kharkiv', zoekNorm('Харків') === zoekNorm('Kharkiv'), `${zoekNorm('Харків')} / ${zoekNorm('Kharkiv')}`);
  check('uk: Львів == lviv, Полтава == Poltava', zoekNorm('Львів') === 'lviv' && zoekNorm('Полтава') === zoekNorm('Poltava'));
  check('bg: Пловдив → plovdyv (één schema; «plovdiv» is een vraagvariant y↔i)', zoekNorm('Пловдив') === 'plovdyv' && varianten('plovdiv').includes('plovdyv'));
  check('Київ → kyyiv; «Kyiv» en «Kiev» zijn VARIANTEN van de vraag (geen fonetische vouw meer)', zoekNorm('Київ') === 'kyyiv' && varianten('kyyiv').includes('kyiv') && varianten('kiev').includes('kyev'), `${zoekNorm('Київ')} ${varianten('kyyiv').join(',')}`);
  check('geen vouw: Jan de Wijk blijft Jan de Wijk', zoekNorm('Jan de Wijk ijsje') === 'jan de wijk ijsje' && VOUW.length === 0);
  check('apostrof weg: м’ята', zoekNorm('м’ята') === 'myata');
  check('tokens ≥2, uniek, max 12', zoekTokens('a bb bb ' + 'x'.repeat(3) + Array.from({ length: 20 }, (_, i) => ` w${i}`).join('')).length === 12);
  check('TRANSLIT/LATIJN_EXTRA zijn niet leeg en alleen kleine letters', TRANSLIT.length > 40 && LATIJN_EXTRA.length >= 7 && TRANSLIT.every(([a]) => a === a.toLowerCase()));
  // synoniemen
  const factuur = synoniemen(zoekNorm('factuur'));
  check('synoniemen: factuur → invoice/рахунок/rechnung/faktura', ['invoice', zoekNorm('рахунок'), 'rechnung', 'faktura'].every(w => factuur.includes(w)), factuur.join(','));
  check('synoniemen: onbekend woord → alleen zichzelf', synoniemen('qwertyzz').length === 1);
  check('uitbreiding: één groep per token', breidUit(['mail', 'huur']).length === 2);
  // relevantie (oude 0–100-functie, nog voor het geheugenpad) en de nieuwe signalen
  const nu = Date.UTC(2026, 9, 21);
  const g = breidUit(zoekTokens('factuur huur'));
  const hoog = relevantie({ vraag: 'factuur huur', groepen: g, titel: 'Factuur huur oktober', velden: [['Factuur huur oktober', 9], ['', 2]], bijgewerktOp: nu, nu });
  const laag = relevantie({ vraag: 'factuur huur', groepen: g, titel: 'Nieuwsbrief', velden: [['Nieuwsbrief', 9], ['ook iets over huur', 2]], bijgewerktOp: nu - 400 * 86400000, nu });
  check('relevantie binnen 1..100 en titeltreffer > tekst', hoog >= 1 && hoog <= 100 && laag >= 1 && hoog > laag, `${hoog} / ${laag}`);
  check('geen treffer → 0', relevantie({ vraag: 'factuur huur', groepen: g, titel: 'Iets anders', velden: [['Iets anders', 9]], bijgewerktOp: nu }) === 0);
  const vg = vraagGroepen(zoekTokens('factuur huur'), g);
  const sExact = signalenInGeheugen({ vraagNorm: 'factuur huur', groepen: vg, titel: 'Factuur huur', bijgewerktOp: nu, nu });
  const sZwak = signalenInGeheugen({ vraagNorm: 'factuur huur', groepen: vg, titel: 'Nieuwsbrief', tekst: 'ook iets over huur', bijgewerktOp: nu, nu });
  check('signalen: exacte titel → score hoger dan zwakke treffer; uitleg exacte_titel', !!sExact && !!sZwak && scoreVanSignalen(sExact) > scoreVanSignalen(sZwak) && uitlegVan(sExact)[0].code === 'exacte_titel' && uitlegVan(sExact)[0].uk.length > 0 && uitlegVan(sExact)[0].nl.length > 0);
  check('signalen: geen treffer → null', signalenInGeheugen({ vraagNorm: 'factuur huur', groepen: vg, titel: 'Iets anders', bijgewerktOp: nu, nu }) === null);
  check('percent monotoon: 100 voor max, 1..100 anders', percentVan(3, 3) === 100 && percentVan(1.5, 3) > percentVan(0.3, 3) && percentVan(0.3, 3) >= 1);
  const syn = relevantie({ vraag: 'invoice', groepen: breidUit(zoekTokens('invoice')), titel: 'Рахунок за квітень', velden: [['Рахунок за квітень', 9]], bijgewerktOp: nu, nu });
  check('synoniem over talen heen vindt (invoice → Рахунок)', syn > 0, String(syn));
  check('trigram zoals pg_trgm (identiek = 1)', trigramSimilariteit('kharkiv', 'Харків') === 1);
  // tsquery
  check('tsquery: OF binnen groep, EN ertussen, prefix', tsQueryTekst([['huur', 'rent'], ['mail']]) === '(huur:* | rent:*) & (mail:*)', tsQueryTekst([['huur', 'rent'], ['mail']]));
  check('tsquery: geen operators uit invoer', !/[!&|():']/.test(tsQueryTekst([["a'b|c&d:*!"]]).replace(/[(): |&*]/g, '')), tsQueryTekst([["a'b|c&d:*!"]]));
  // migratie 0100 + RLS 0094
  const m100 = readFileSync('migrations/0100_zoek_kern.sql', 'utf8'), m94 = readFileSync('migrations/0094_zoek_rls.sql', 'utf8');
  check('0100: zoek_norm verwijderd, *_norm-kolommen door Node, GIN tsvector + stam + trgm, terugdraaistappen gedocumenteerd', /DROP FUNCTION IF EXISTS app\.zoek_norm/.test(m100) && /titel_norm\s+text/.test(m100) && /USING gin \(zoek_vector\)/.test(m100) && /USING gin \(zoek_stam\)/.test(m100) && /gin_trgm_ops/.test(m100) && /TERUGDRAAIEN/.test(m100));
  check('0100: stemmers die PG echt heeft (dutch/english/german/french/romanian/russian), geen ukrainian', /'dutch'::regconfig/.test(m100) && /'russian'::regconfig/.test(m100) && !/'ukrainian'::regconfig/.test(m100));
  check('0094: RLS op user_id = app.huidige_gebruiker()', /ENABLE ROW LEVEL SECURITY/.test(m94) && /user_id = app\.huidige_gebruiker\(\)/.test(m94));
  // isolatie (brontekst)
  const bron = readFileSync('backend/zoek-index.ts', 'utf8');
  const queries = [...bron.matchAll(/(SELECT|INSERT|DELETE)[\s\S]*?app\.zoek_objecten[\s\S]*?(?=`)/g)].map(x => x[0]);
  check('isolatie: elke SELECT/DELETE op zoek_objecten draagt user_id = $1', queries.filter(q => !q.startsWith('INSERT')).every(q => /user_id = \$1/.test(q)) && queries.length >= 5, String(queries.length));
  check('isolatie: ZOEK_INDEX-vlag bestaat niet meer', !/process\.env\.ZOEK_INDEX/.test(bron));
  const dicht = { ok: false as const };
  check('isolatie: gesloten lade → [] zonder database', (await zoekInIndex(dicht, ['mail'], 'huur', [['huur']])).length === 0);
  const open = { ok: true as const, lade: { userId: 'u1', ruimte: 'prive' as const } };
  let geweigerd = false; try { await zoekIndexBijwerken(open, [{ bron: 'mail', bronId: 'x', soort: 'bericht', userId: 'u2', ruimte: 'prive', titel: '', inhoud: '', metadata: {}, aangemaaktOp: 0, bijgewerktOp: 0 }]); } catch (e) { geweigerd = String((e as Error).message) === 'ZOEK_INDEX_LADE_MISMATCH'; }
  check('isolatie: object van andere gebruiker → geweigerd vóór de database', geweigerd);
  return einde();
}
