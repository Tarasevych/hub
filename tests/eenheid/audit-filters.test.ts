// Audit 19.10.2026 (A8): het beheerjournaal onthoudt tussen bezoeken alleen weergave-voorkeuren (bron, periode, ruis, volgorde) —
// geen smalle selectie (actie «Схвалено оновлення», tekst, wie, voor wie), die het journaal bij openen leeg liet lijken.
import { LEEG, bewaarFilters, filtersActief, herstelFilters, leesFilters, voorkeurenVan, type Staat } from '../../src/audit/types';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('audit-filters');
  const smal: Staat = { ...LEEG, q: 'passkey', actie: 'uitrol.goedgekeurd', actorId: 'u1', doelId: 'd1', doelNaam: 'Agent', categorieen: ['uitrol'], resultaten: ['ok'], bron: 'oud', periode: '30d', verbergRuis: false, volgorde: 'oud' };
  const terug = herstelFilters(voorkeurenVan(smal));
  check('A8: actie/tekst/wie/voor wie/categorie/resultaat komen NIET terug', !terug.actie && !terug.q && !terug.actorId && !terug.doelId && !terug.doelNaam && terug.categorieen.length === 0 && terug.resultaten.length === 0);
  check('A8: bron/periode/ruis/volgorde komen WEL terug', terug.bron === 'oud' && terug.periode === '30d' && terug.verbergRuis === false && terug.volgorde === 'oud');
  check('A8: vreemde of oude opslag → veilige standaard', herstelFilters(null).periode === '7d' && herstelFilters({ periode: 'x', bron: 'y', actie: 'z' }).periode === '7d' && herstelFilters({ periode: 'x' }).bron === 'nieuw' && !herstelFilters({ actie: 'z' }).actie);
  check('A8: zonder localStorage (Node) geeft leesFilters LEEG en gooit bewaarFilters niet', (() => { bewaarFilters(smal); return leesFilters() === LEEG; })());
  const opslag = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => { opslag.set(k, v); } };
  bewaarFilters(smal);
  const geladen = leesFilters();
  check('A8: via opslag: oude sleutel v1 wordt niet meer gelezen; v2 bevat alleen voorkeuren', [...opslag.keys()].every((k) => k.endsWith('-v2')) && !/uitrol\.goedgekeurd|passkey/.test([...opslag.values()].join()) && filtersActief(geladen) === filtersActief({ ...LEEG, bron: 'oud', periode: '30d', verbergRuis: false, volgorde: 'oud' }));
  delete (globalThis as { localStorage?: unknown }).localStorage;
  return einde();
}
