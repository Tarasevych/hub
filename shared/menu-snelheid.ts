// Menu v2 fase B1: snelheid en concepten. Puur (geen DOM): draait in de browser en op de server (normalisatie in `sidebar`).
//   voortgang   — dunne voortgangsbalk bovenaan in de kleur van het doel-onderdeel (standaard aan)
//   overgangen  — zachte overgang (View Transitions) bij wisselen van pagina binnen een onderdeel (standaard aan)
//   vooruitladen — bij aanwijzen van een ander onderdeel de pagina alvast ophalen (Speculation Rules «prefetch», standaard aan)
//   prerender   — RISICO: het andere onderdeel alvast volledig voorbereiden (Speculation Rules «prerender»; standaard UIT)
//   concepten   — RISICO: onverzonden tekst in formulieren versleuteld (AES-GCM, sleutel per account, niet exporteerbaar) in deze
//                 browser bewaren en na herladen terugzetten met een melding (standaard UIT)
export type SnelheidVoorkeuren = { voortgang: boolean; overgangen: boolean; vooruitladen: boolean; prerender: boolean; concepten: boolean };
export const standaardSnelheid = (): SnelheidVoorkeuren => ({ voortgang: true, overgangen: true, vooruitladen: true, prerender: false, concepten: false });
export function normaliseerSnelheid(raw: unknown): SnelheidVoorkeuren {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const s = standaardSnelheid();
  const b = (k: keyof SnelheidVoorkeuren) => (typeof r[k] === 'boolean' ? r[k] as boolean : s[k]);
  return { voortgang: b('voortgang'), overgangen: b('overgangen'), vooruitladen: b('vooruitladen'), prerender: b('prerender'), concepten: b('concepten') };
}
