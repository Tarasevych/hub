// MELDINGEN-UX-001 (16.11.2026): één getal op de bel — hetzelfde getal als «Нові» in het paneel dat de gebruiker koos.
// Eigenaar: «якась діч, незрозуміло звідки береться різна кількість». Oorzaken (gemeten op de stand):
//  • de bel telde er de paginasignalen bij (bv. «Сервер знову відповідає»), die de compacte panel helemaal niet toont → bel 3, lijst 2;
//  • het zwevende venster telde losse gebeurtenissen, de bel telde groepen + een deel van de stroom dat pas na het openen geladen werd;
//  • terwijl de compacte panel open staat, blijft wat u net zag in «Нові» (tot sluiten), maar de bel zakte al → bel 1, «Нові» 2.
// Regel nu: bel = lengte van de lijst «Нові» van het gekozen paneel (venster: de stroom; compact: de secties, ook terwijl het open is).
// Єдине число на дзвіночку: стільки ж, скільки рядків у «Нові» того вигляду, який вибрав користувач.

export type BelVorm = 'venster' | 'compact' | 'klassiek';
export type BelInvoer = {
  vorm: BelVorm;
  /** Zwevend venster: gebeurtenissen met status «nieuw» in de stroom (hetzelfde getal als «Нових: N» in het venster). */
  vensterNieuw: number;
  /** Compacte panel dicht: lengte van «Нові» zonder filters. */
  compactNieuw: number;
  /** Compacte panel open: wat de panel zelf in «Нові» toont (ook wat net gezien is, tot sluiten); null = dicht. */
  compactOpenNieuw: number | null;
  /** Klassieke lijst (zonder meldingen v2): ongelezen regels. */
  klassiekOngelezen: number;
  /** Technische meldingen: alleen waar het paneel er een eigen regel voor toont (compact en klassiek). */
  tech: number;
};

const heel = (n: number | null | undefined) => Math.max(0, Math.floor(Number(n) || 0));

export function belAantal(i: BelInvoer): number {
  if (i.vorm === 'venster') return heel(i.vensterNieuw);
  if (i.vorm === 'compact') return heel(i.compactOpenNieuw ?? i.compactNieuw) + heel(i.tech);
  return heel(i.klassiekOngelezen) + heel(i.tech);
}
