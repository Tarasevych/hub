// «?» uit het centrale register (shared/hulp-register.ts): wat / gevolg / risico, en «Для розробників» ingeklapt met de sleutel
// en het bestand. Elke optie en schakelaar van het technisch profiel en het beheer gebruikt dit (afgedwongen door
// tests/eenheid/hulp-register.test.ts). Taal: `uk`, anders `lang`, anders de taal van de route. Onbekende sleutel: niets tonen
// (de test faalt dan al).
import Vraag from '../tech/Vraag';
import { routeLang } from '../canoniek-navigatie';
import { hulpVan } from '../../shared/hulp-register';

/** meer (29.10.2026, «één (?) per kop»): [sleutel, naam uk, naam nl] van de bedieningselementen in het blok onder deze kop. Hun
 * uitleg komt als korte alinea's in dezelfde (?) — geen rij vraagtekens meer (scripts/hulp-vraagtekens-controle.mjs). */
export type HulpMeer = ReadonlyArray<readonly [string, string, string]>;
/** naam: de naam van het element van `k` zelf; dan staat ook `k` als alinea met naam (alle elementen gelijk), anders is `k` de uitleg
 * van de kop zelf en volgen de alinea's van `meer`. */
export default function HulpVraag({ k, uk, lang, label, meer, naam }: { k: string; uk?: boolean; lang?: string; label?: string; meer?: HulpMeer; naam?: readonly [string, string] }) {
  const h = hulpVan(k);
  if (!h) return null;
  const isUk = uk ?? (lang ? lang !== 'nl' : routeLang() !== 'nl');
  const onderdelen = [...(naam ? [[k, naam[0], naam[1]] as const] : []), ...(meer || [])].flatMap(([s, nUk, nNl]) => { const o = hulpVan(s); return o ? [{ naam: isUk ? nUk : nNl, help: o, sleutel: s }] : []; });
  return <Vraag help={naam ? { wat: ['', ''], gevolg: ['', ''], dev: h.dev } : h} uk={isUk} label={label} sleutel={k} bron={h.bron} devAltijd onderdelen={onderdelen} />;
}
