// Aftelling van de pop-up (INTEG-001). Pure toestand, los te toetsen (tests/eenheid/meldingen-integ-20261103.test.ts, deel B).
//
// Eisen van de eigenaar: de pop-up verschijnt standaard 2 seconden (2000 ms); zolang de muis erop staat of de vinger op het
// aanraakscherm de melding aanraakt en vasthoudt, telt zij NIET af (pauze) zodat een lange tekst rustig te lezen is; een balk onderaan
// toont hoeveel tijd er nog is. Uitklappen geeft opnieuw de volle tijd, maar pauzeert niet voor altijd.
//
// Pauzebronnen: 'muis' (aanwijzen met muis/pen), 'aanraking' (vinger op de melding op het aanraakscherm),
// 'toets' (toetsenbordfocus in de pop-up), 'verborgen' (tabblad niet zichtbaar: niemand kan lezen).
export type PauzeBron = 'muis' | 'aanraking' | 'toets' | 'verborgen';
export type Aftelling = { totaal: number; over: number; pauzes: readonly PauzeBron[] };

/** Na het loslaten van een bijna afgelopen pauze blijft er minstens een halve seconde over, zodat de pop-up niet onder vinger of muis wegspringt. */
export const MIN_NA_PAUZE_MS = 500;

export const nieuweAftelling = (ms: number): Aftelling => ({ totaal: Math.max(0, ms), over: Math.max(0, ms), pauzes: [] });
export const gepauzeerd = (a: Aftelling): boolean => a.pauzes.length > 0;
export const klaar = (a: Aftelling): boolean => a.over <= 0;
/** Deel van de tijd dat nog over is (0–1): de breedte van de balk. */
export const fractie = (a: Aftelling): number => (a.totaal > 0 ? Math.max(0, Math.min(1, a.over / a.totaal)) : 0);

/** Eén tik van de klok: telt alleen af als er geen pauze is. */
export function tik(a: Aftelling, ms: number): Aftelling {
  if (gepauzeerd(a) || klaar(a) || ms <= 0) return a;
  return { ...a, over: Math.max(0, a.over - ms) };
}

/** Pauze aan of uit voor één bron. Valt de laatste pauze weg, dan blijft er nog minstens MIN_NA_PAUZE_MS. */
export function pauze(a: Aftelling, bron: PauzeBron, aan: boolean): Aftelling {
  const voor = new Set(a.pauzes);
  if (aan) voor.add(bron); else voor.delete(bron);
  const pauzes = [...voor];
  if (pauzes.length === a.pauzes.length && pauzes.every((p) => a.pauzes.includes(p))) return a;
  const over = !pauzes.length && a.pauzes.length && bron !== 'verborgen' ? Math.max(a.over, Math.min(a.totaal, MIN_NA_PAUZE_MS)) : a.over;
  return { ...a, pauzes, over };
}

/** Meer tijd (uitklappen, iets aanklikken in de pop-up): minstens `ms` vanaf nu, de balk begint dan weer vol. */
export function verleng(a: Aftelling, ms: number): Aftelling {
  if (ms <= a.over) return a;
  return { ...a, over: ms, totaal: ms };
}
