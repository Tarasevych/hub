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
  // INTEG-001: onafhankelijk van andere tests in hetzelfde proces. Een eerdere test kan globalThis.localStorage al hebben gezet
  // (en niet teruggezet); Node 26 heeft bovendien zelf een localStorage-accessor. Voor deze ene controle halen we hem tijdelijk
  // weg en zetten hem daarna precies zo terug als we hem vonden (descriptor), ook als de controle zelf gooit.
  const g = globalThis as { localStorage?: unknown };
  const voorOpslag = Object.getOwnPropertyDescriptor(g, 'localStorage');
  const zetOpslagTerug = () => { if (voorOpslag) Object.defineProperty(g, 'localStorage', voorOpslag); else Reflect.deleteProperty(g, 'localStorage'); };
  const zonderOpslag = <T>(f: () => T): T => { Reflect.deleteProperty(g, 'localStorage'); try { return f(); } finally { zetOpslagTerug(); } };
  check('A8: zonder localStorage (Node) geeft leesFilters LEEG en gooit bewaarFilters niet', zonderOpslag(() => { bewaarFilters(smal); return leesFilters() === LEEG; }));
  const opslag = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => { opslag.set(k, v); } };
  bewaarFilters(smal);
  const geladen = leesFilters();
  check('A8: via opslag: oude sleutel v1 wordt niet meer gelezen; v2 bevat alleen voorkeuren', [...opslag.keys()].every((k) => k.endsWith('-v2')) && !/uitrol\.goedgekeurd|passkey/.test([...opslag.values()].join()) && filtersActief(geladen) === filtersActief({ ...LEEG, bron: 'oud', periode: '30d', verbergRuis: false, volgorde: 'oud' }));
  // Oorspronkelijk gebruikte de test hier `delete`; nu terug naar de toestand van vóór deze test (andere tests in dit proces houden hun eigen opslag).
  zetOpslagTerug();
  return einde();
}
