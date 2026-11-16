// MELDINGEN-UX-001 (15.11.2026): zuivere hulpfuncties voor «Загальне» in de meldingsregels (zonder browser, getest in
// tests/eenheid/meldingen-ux-001-20261115.test.ts). «Загальне» is geen opgeslagen veld: het is de meest gekozen instelling.
// Чисті функції для «Загальне» в правилах сповіщень: найчастіший вибір серед типів; тип зі своїм вибором не «як загальне».
import { voorkeurVoor, weergaveVan, type MeldingType, type MeldingWeergave, type TypeVoorkeur } from '../../shared/melding-typen';

export type Zichtbaar = Exclude<MeldingWeergave, 'uit'>;
/** Hoe lang de pop-up staat: '0' = standaard 2 s, '5' … '60' seconden, 'vast' = tot u sluit. */
export type Duur = string;

export const duurVan = (v: Pick<TypeVoorkeur, 'vast' | 'seconden'>): Duur => (v.vast ? 'vast' : String(v.seconden || 0));
export const metDuur = (v: TypeVoorkeur, d: Duur): TypeVoorkeur => (d === 'vast'
  ? { ...v, vast: true, vastGekozen: true }
  : { ...v, vast: false, vastGekozen: undefined, seconden: Math.max(0, Number(d) || 0) });
/** Meest gekozen waarde (bij gelijkspel: de eerste in `voorkeur`). */
function meest<T extends string>(waarden: readonly T[], voorkeur: readonly T[], standaard: T): T {
  const n = new Map<T, number>();
  for (const w of waarden) n.set(w, (n.get(w) || 0) + 1);
  let beste = standaard, max = 0;
  for (const w of [...voorkeur, ...n.keys()]) { const c = n.get(w) || 0; if (c > max) { beste = w; max = c; } }
  return beste;
}
export const ZICHTBAAR: readonly Zichtbaar[] = ['beide', 'popup', 'geluid', 'paneel'];
/** «Загальне»: de instelling die de meeste types hebben (verborgen types tellen niet mee voor «як показувати»). */
export function algemeneInstelling(soorten: Partial<Record<MeldingType, TypeVoorkeur>> | undefined, ids: readonly MeldingType[]): { weergave: Zichtbaar; duur: Duur } {
  const vs = ids.map((id) => voorkeurVoor(soorten, id));
  const ws = vs.map(weergaveVan).filter((w): w is Zichtbaar => w !== 'uit');
  return { weergave: meest(ws, ZICHTBAAR, 'beide'), duur: meest(vs.map(duurVan), ['0'], '0') };
}
/** Volgt dit type «Загальне»? (Een verborgen type volgt nog wel de duur.) */
export function volgtAlgemeen(v: TypeVoorkeur, alg: { weergave: Zichtbaar; duur: Duur }): boolean {
  const w = weergaveVan(v);
  return (w === 'uit' || w === alg.weergave) && duurVan(v) === alg.duur;
}
