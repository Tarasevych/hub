// Idempotentie zonder browser-afhankelijkheden (los te toetsen): één sleutel per poging met dezelfde inhoud.
export function sleutelVoor(geheugen: Map<string, string>, inhoud: string, maak: () => string): string {
  const oud = geheugen.get(inhoud); if (oud) return oud;
  const s = maak(); geheugen.set(inhoud, s); return s;
}
