// Etap D (/zoek): pure zoeklogica (categorieën, filters, URL-staat, markering) + route 'zoek' in beide tabbladlijsten.
// 22.10.2026 (Z4): bijgewerkt naar het contract zoek-kern-2 (shared/zoek-model.ts): 13 bronnen, filters gaan naar de server
// (bouwVraag), typo-correcties komen van de server (suggesties soort 'correctie'), geschiedenis op de server (0103).
// De uitgebreide tests staan in zoek-ui-20261022.test.ts; dit bestand bewaakt de basis. Draaien: node scripts/eenheidstests.mjs zoek-etappe-d
import { readFileSync } from 'node:fs';
import { CATEGORIE_BRONNEN, CATEGORIEEN, LEEG_FILTER, bouwVraag, effectieveBronnen, filterLokaal, leesUrl, schrijfUrl, sindsVoor } from '../../src/zoek/zoek-logica';
import { highlightParts, stukkenUitPosities } from '../../src/zoek/zoek-kern';
import { MENU_PAGINAS } from '../../shared/menu-model';
import { ZOEK_BRONNEN, type ZoekTreffer } from '../../shared/zoek-model';
const res: boolean[] = []; const check = (n: string, ok: boolean) => { res.push(ok); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}`); };
const r = (p: Partial<ZoekTreffer>): ZoekTreffer => ({ id: 'x', bron: 'mail', soort: 'bericht', titel: '', titels: {}, omschrijving: '', pad: '', route: null, taal: '', formaat: '', bijgewerktOp: 0, extra: {}, integratie: '', score: 0, percent: 100, uitleg: [], fragment: { tekst: '', bron: 'tekst', posities: [] }, ...p });
export async function main() {
  const now = 1_800_000_000_000;
  check('route zoek in MENU_PAGINAS.hub', MENU_PAGINAS.hub.includes('zoek'));
  check('route zoek in public/canonical-service.js', /tabs=\{hub:\[[^\]]*'zoek'/.test(readFileSync('public/canonical-service.js', 'utf8')));
  check('elke bron van het contract zit in precies één categorie', ZOEK_BRONNEN.every(b => CATEGORIEEN.filter(c => CATEGORIE_BRONNEN[c].includes(b)).length === 1));
  check('categorie files ∩ bronfilter', JSON.stringify(effectieveBronnen('files', { bronnen: ['drive', 'mail'], indexStand: 'alle' })) === '["drive"]');
  check('categorie zonder overlap → categorie', JSON.stringify(effectieveBronnen('files', { bronnen: ['mail'], indexStand: 'alle' })) === '["cloud","drive"]');
  check('alles + geen filter = leeg (alle)', effectieveBronnen('all', { bronnen: [], indexStand: 'alle' }).length === 0);
  const v = bouwVraag('factuur', 'mail', { ...LEEG_FILTER, datum: 'd7', soorten: ['bericht'] }, 1, null, now);
  check('filters gaan naar de server: bronnen van de categorie, soorten, sinds (d7), perPagina 20', JSON.stringify(v.bronnen) === '["mail","bijlage"]' && v.soorten?.[0] === 'bericht' && v.sinds === now - 7 * 864e5 && v.perPagina === 20);
  const rows = [r({ id: '1', titel: 'Factuur juli', percent: 90 }), r({ id: '2', bron: 'drive', titel: 'plan.pdf', percent: 30 }), r({ id: '3', titel: 'Factuur concept', percent: 70 })];
  check('-woord uitsluiting (lokaal)', filterLokaal(rows, { minPercent: 0 }, ['concept']).map(x => x.id).join() === '1,2');
  check('minimale overeenkomst (serverwaarde percent)', filterLokaal(rows, { minPercent: 50 }).map(x => x.id).join() === '1,3');
  check('sindsVoor any = 0; d1 = nu − 1 dag', sindsVoor({ datum: 'any', van: '' }, now) === 0 && sindsVoor({ datum: 'd1', van: '' }, now) === now - 864e5);
  const u = schrijfUrl('https://hub.tarasevych.com/zoek?lang=nl', 'factuur', 'mail', { ...LEEG_FILTER, soorten: ['bericht'], datum: 'd30' });
  const back = leesUrl(u.slice(u.indexOf('?')));
  check('URL heen-en-terug', u.startsWith('/zoek?') && back.q === 'factuur' && back.cat === 'mail' && back.f.soorten[0] === 'bericht' && back.f.datum === 'd30');
  check('URL negeert onbekende waarden', leesUrl('?bron=evil,mail&soort=<x>&datum=zzz&cat=nope').f.bronnen.join() === 'mail' && leesUrl('?soort=<x>').f.soorten.length === 0 && leesUrl('?cat=nope').cat === 'all');
  const parts = highlightParts('<img src=x> factuur', ['factuur']);
  check('markering: ruwe tekst blijft tekst, hit gemarkeerd', parts.some(p => p.hit && p.t === 'factuur') && parts.some(p => !p.hit && p.t.includes('<img')));
  check('markering: regex-tekens in zoekterm veilig', highlightParts('a+b (c)', ['(c)', 'a+b']).length > 0);
  check('markering uit serverposities', stukkenUitPosities('abc def', [[4, 7]]).map(p => (p.hit ? `*${p.t}` : p.t)).join('|') === 'abc |*def');
  console.log(`${res.filter(Boolean).length}/${res.length} geslaagd (zoek-etap-d)`);
  return res.every(Boolean) ? 0 : 1;
}
