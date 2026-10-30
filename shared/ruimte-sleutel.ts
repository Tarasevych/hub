// Ruimtes-scheiding (0123): het contract voor ELKE cache in de browser (localStorage, sessionStorage, IndexedDB, geheugen).
// Regel: een sleutel voor gegevens die per ruimte verschillen bevat ALTIJD de ruimte. Zo kan een technisch tabblad nooit een
// persoonlijk bericht uit de cache tonen (klacht 28.10.2026: privélief van Lisa in het leesvenster van de technische post).
// De ruimte zelf komt uit het antwoord van de server (status.actief / kop X-Ruimte), nooit uit een eigen gok van de client.
export type SleutelRuimte = 'prive' | 'technisch';
export const RUIMTE_SLEUTEL_VOORVOEGSEL = 'mr-ruimte' as const;
/** Kop die de server bij elk ruimte-afhankelijk antwoord meegeeft (vlag ruimtes-scheiding aan). */
export const RUIMTE_KOP = 'X-Ruimte' as const;
const isRuimte = (v: unknown): v is SleutelRuimte => v === 'prive' || v === 'technisch';
/** `ruimteSleutel('technisch', 'mail:lijst')` → `mr-ruimte:technisch:mail:lijst`. Onbekende ruimte → 'prive'-sleutel NIET: fout. */
export function ruimteSleutel(ruimte: SleutelRuimte, sleutel: string): string {
  if (!isRuimte(ruimte)) throw new Error('RUIMTE_ONGELDIG');
  return `${RUIMTE_SLEUTEL_VOORVOEGSEL}:${ruimte}:${String(sleutel)}`;
}
/** Hoort deze opgeslagen sleutel bij deze ruimte? (opruimen bij wisselen: alles van de andere ruimte uit het geheugen halen). */
export const sleutelVanRuimte = (opgeslagen: string, ruimte: SleutelRuimte): boolean => String(opgeslagen).startsWith(`${RUIMTE_SLEUTEL_VOORVOEGSEL}:${ruimte}:`);
/** Naam van de IndexedDB-databank per ruimte. */
export const ruimteDatabank = (ruimte: SleutelRuimte, naam: string): string => ruimteSleutel(ruimte, `db:${naam}`);
