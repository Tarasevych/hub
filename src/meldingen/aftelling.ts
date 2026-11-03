// Aftelling van de pop-up (INTEG-001). Pure toestand, los te toetsen (tests/eenheid/meldingen-integ-20261103.test.ts, deel B).
//
// Eisen van de eigenaar: de pop-up verdwijnt na enkele seconden (afhankelijk van soort en inhoud); zolang de muis erop staat telt hij
// NIET af (pauze) zodat een lange tekst te lezen is; een balk onderaan toont hoeveel tijd er nog is. Hij blijft niet hangen tot u
// hem sluit: uitklappen of klikken geeft meer tijd, maar pauzeert niet voor altijd (vroeger: uitklappen = pauze zonder einde, en
// een klik in de pop-up hield hem via de focus open tot u ergens anders klikte).
//
// Pauzebronnen: 'muis' (aanwijzen), 'toets' (toetsenbordfocus in de pop-up), 'verborgen' (tabblad niet zichtbaar: niemand kan lezen).
export type PauzeBron = 'muis' | 'toets' | 'verborgen';
export type Aftelling = { totaal: number; over: number; pauzes: readonly PauzeBron[] };

/** Na het loslaten van een pauze blijft de pop-up nog minstens zo lang staan (niet meteen weg als u de muis weghaalt). */
export const MIN_NA_PAUZE_MS = 2500;

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
