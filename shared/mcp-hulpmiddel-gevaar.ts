// SEC-002 (interface-03, interface-04, 12.11.2026): ÉÉN regel voor «is dit hulpmiddel gevaarlijk?» — voor de server (bulkactie
// «Усі інструменти → Завжди») en voor het paneel («!», uitleg, bevestiging).
//
// Vroeger telde alleen RISKY_TOOLS (apparaat, browser, «Додатки»). Site-hulpmiddelen die schrijven — mail naar de prullenbak of
// «spam», issues en reacties op GitHub, afspraken wijzigen/verwijderen, deelnemers uitnodigen, kaarten van het bord verwijderen —
// waren voor de bulkknop «veilig» en gingen met één klik zonder vraag op «Завжди», zonder «!» in hun rij.
// Nu: gevaarlijk = RISKY óf schrijft/voert uit/bedient de pagina óf destructief. De bulkknop «Завжди» raakt alleen hulpmiddelen
// die lezen of navigeren; al het andere zet de mens één voor één aan, met bevestiging.

export type HulpmiddelVoorGevaar = { risky?: unknown; kind?: unknown; destructive?: unknown; readOnly?: unknown };

/** Soorten (ToolKind) die iets veranderen of namens de mens handelen. */
const HANDELEND = new Set(['write', 'execute', 'interact', 'advanced']);
/** Soorten die de bulkknop «Завжди» mag omzetten. */
const ALLEEN_KIJKEN = new Set(['read', 'navigate']);

/** Krijgt een «!» en een bevestiging vóór «Завжди». */
export function isGevaarlijk(t: HulpmiddelVoorGevaar | null | undefined): boolean {
  if (!t) return true;
  return t.risky === true || t.destructive === true || HANDELEND.has(String(t.kind ?? ''));
}

/** Mag de bulkactie «Усі інструменти → Завжди» dit hulpmiddel omzetten? Alleen lezen/navigeren en niet gevaarlijk. Onbekend: nee. */
export function bulkAltijdToegestaan(t: HulpmiddelVoorGevaar | null | undefined): boolean {
  return !!t && !isGevaarlijk(t) && ALLEEN_KIJKEN.has(String(t.kind ?? ''));
}

/** Algemene risicotekst als er (nog) geen eigen tekst voor het hulpmiddel is. */
export const ALGEMEEN_RISICO: readonly [string, string] = [
  'Цей інструмент змінює дані або діє від вашого імені. У режимі «Завжди» ШІ виконує його без вашого кліку — зокрема під впливом чужого тексту з листа чи сторінки.',
  'Dit hulpmiddel wijzigt gegevens of handelt namens u. Op «Altijd» voert de AI het uit zonder uw klik — ook onder invloed van vreemde tekst uit een mail of pagina.',
];
