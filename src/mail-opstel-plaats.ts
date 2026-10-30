// Plaats van de zwevende «Написати лист»-knop — GESCHIEDENIS en gedeelde typen.
//
// 21.10.2026: de FAB stond via fabPlaats() vast naast de meldingenbel (stapel rechtsonder), het vensterdok rekende met dezelfde functie.
// 25.10.2026 (klacht eigenaar, telefoon): «кругла «Написати» ховається/дригається при прокрутці вниз», «в куті екрана … прийнялося
// буквально». Gemeten (stand plaatsing-nu): «Написати» rekende vanaf de bel en gleed 250–280 ms (14 tussenposities) bij elke wijziging
// van de adresbalk; de bel rekende vanaf visualViewport en ging mee met een veeg en met inzoomen. Daarom is fabPlaats() vervangen door
// ZONES en GNIEZDA (shared/plaatsing.ts): «Написати», «Вгору» en de bel hebben elk een eigen gniezdo; de browser legt de zone uit
// (src/plaatsing/Plek.tsx, src/plaatsing/plaatsing.css). Niemand rekent meer vanaf een andere knop.
//
// Wat hier blijft: het type van de veilige randen (src/platform/veilige-rand.ts, venster-dok-logica) en een overlaptest.
export type Randen = { boven: number; onder: number; links: number; rechts: number };
export const GEEN_RAND: Randen = { boven: 0, onder: 0, links: 0, rechts: 0 };
type Rect = { left: number; top: number; width: number; height: number };

/** Overlappen twee rechthoeken (randen die elkaar raken tellen niet)? */
export function overlapt(a: Rect, b: Rect) {
  const ar = a.left + a.width, ab = a.top + a.height, br = b.left + b.width, bb = b.top + b.height;
  return a.left < br && ar > b.left && a.top < bb && ab > b.top;
}
