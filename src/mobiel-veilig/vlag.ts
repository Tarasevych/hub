// MOBIEL-BREEDTE-VEILIG v1 — vlag `mobiel-breedte-veilig-v1` (standaard UIT, migratie 0302).
// Met de vlag aan krijgt <html> het attribuut data-mobiel-breedte-veilig; src/ontwerp/mobiel.css schakelt daarop de brede regel
// (max-width:100% op elke div/section/… bij ≤700 px, de oorzaak van 5–10 s lay-out en gigabytes geheugen in Chrome) om naar een
// smalle vervanging. Plek.tsx en AgentenPagina.tsx lezen dezelfde stand voor hun zuinigere waarnemers.
// Waarom het attribuut vóór de eerste weergave: de CSS-regel werkt vanaf de eerste lay-out; een late vlag zou de dure lay-out
// al laten beginnen. Daarom de laatst bekende uitkomst uit localStorage (blijft over tabbladen en herstarts), daarna één
// OFREP-verzoek dat de stand bevestigt of terugzet. Fout of geen antwoord = laatst bekende stand; nooit bekend = UIT = de site
// precies zoals de basisuitgave (20261119-072255).
import { useSyncExternalStore } from 'react';
// platform/client en ruimtes-vlag pas bij het verzoek laden: Plek.tsx (en zijn eenheidstests in Node, zonder window) importeert
// deze module, en canoniek-dienst leest window al bij het laden.

export const MOBIEL_VEILIG_VLAG = 'mobiel-breedte-veilig-v1';
export const MOBIEL_VEILIG_ATTR = 'data-mobiel-breedte-veilig';
const OPSLAG = `mr-vlag:${MOBIEL_VEILIG_VLAG}`;

const leesOpslag = (): boolean => { try { return localStorage.getItem(OPSLAG) === '1'; } catch { return false; } };
let stand = typeof window === 'undefined' ? false : leesOpslag();
const luisteraars = new Set<() => void>();

function zet(aan: boolean) {
  const wissel = aan !== stand;
  stand = aan;
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute(MOBIEL_VEILIG_ATTR, aan);
  if (wissel) luisteraars.forEach((f) => f());
}

/** Huidige stand (synchroon, voor effecten en waarnemers). */
export const mobielVeiligAan = (): boolean => stand;

/** Eén OFREP-verzoek; null = geen bruikbaar antwoord (netwerk, nog geen sessie). */
export function vraagMobielVeilig(): Promise<boolean | null> {
  return Promise.all([import('../platform/client'), import('../tech/ruimtes/ruimtes-vlag')])
    .then(([{ api }, { vlagBody }]) => api.post(`/api/ofrep/v1/evaluate/flags/${MOBIEL_VEILIG_VLAG}`, vlagBody()))
    .then((r) => (r.data as { value?: boolean })?.value === true, () => null);
}

let geïnstalleerd = false;
/** Vóór de eerste weergave aanroepen (src/main.tsx). Zet het attribuut meteen en bevestigt daarna bij de server. */
export function installeerMobielVeilig(): void {
  if (geïnstalleerd || typeof document === 'undefined') return;
  geïnstalleerd = true;
  zet(stand);
  // De sessie kan bij het opstarten nog ontbreken: dan later opnieuw (2, 6 en 15 s), daarna niet meer tot de volgende pagina.
  const pogingen = [2000, 6000, 15000];
  const vraag = () => {
    void vraagMobielVeilig().then((v) => {
      if (v === null) { const w = pogingen.shift(); if (w !== undefined) window.setTimeout(vraag, w); return; }
      try { localStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ }
      zet(v);
    });
  };
  vraag();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('mr:vlaggen-vernieuwd', () => {
      try { localStorage.removeItem(OPSLAG); } catch { /* geen opslag */ }
      void vraagMobielVeilig().then((v) => {
        if (v === null) return;
        try { localStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ }
        zet(v);
      });
    });
  }
}

const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
/** React: true zodra de vlag aan staat; wisselt mee als de server een andere stand teruggeeft. */
export function useMobielVeilig(): boolean {
  return useSyncExternalStore(abonneer, mobielVeiligAan, () => false);
}
