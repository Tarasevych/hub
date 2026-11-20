// Onthouden vensters in de BROWSER: de winkel die het dok over subdomeinen heen laat voortbestaan.
//
// De regels staan in shared/vensters-onthouden-model.ts (zuiver, met tests); de server bewaart de stand per ACCOUNT en per
// RUIMTE (backend/vensters-onthouden.ts, migratie 0089). Dit bestand doet alleen het saaie werk:
//   • de SCOPE van dit tabblad bepalen — hetzelfde account en dezelfde webruimte als het uiterlijk en het menu
//     (src/gedeelde-voorkeuren.ts → weergaveAccountNu/weergaveRuimteNu). Twee accounts in één browser zien elkaars
//     vensters dus niet, en het technische profiel heeft zijn eigen dok;
//   • een snelle CACHE in localStorage voor het eerste beeld (hub → mail duurt een navigatie; zonder cache zou het dok
//     een halve seconde leeg zijn). De cache is nooit de waarheid: de server overschrijft hem zodra hij antwoordt, en per
//     venster wint de nieuwste beschrijving (voegVensterStandenSamen);
//   • het opslaan GEBUNDELD (300 ms) versturen, zodat slepen en minimaliseren niet elke beweging een verzoek wordt.
// Geheimen komen hier niet voorbij: wat de aanroeper meegeeft gaat eerst door normaliseerVenster (en dus zonderGeheimen).
import { useSyncExternalStore } from 'react';
import { api } from './client';
import { ecosystemTabContext } from '../tab-context';
import { weergaveAccountNu, weergaveRuimteNu } from '../gedeelde-voorkeuren';
import {
  LEGE_VENSTERSTAND, metVenster, metVensterKlein, normaliseerVensterStand, voegVensterStandenSamen, vensterScope,
  zonderVenster, type OnthoudenVenster, type VensterStand,
} from '../../shared/vensters-onthouden-model';

const CACHE = 'mijn-ruimte-vensters-onthouden-v1';
let scope = '';
let stand: VensterStand = LEGE_VENSTERSTAND;
const kijkers = new Set<() => void>();
const melden = () => { for (const fn of [...kijkers]) fn(); };

/** De ruimte van dit tabblad in de taal van de server ('prive' / 'technisch'); het uiterlijk noemt haar 'gebruiker'. */
const ruimteNu = () => (weergaveRuimteNu() === 'technisch' ? 'technisch' : 'prive');
const scopeNu = () => vensterScope(weergaveAccountNu(), ruimteNu());

const cacheLezen = (sl: string): VensterStand => {
  try {
    const alles = JSON.parse(localStorage.getItem(CACHE) || '{}') as Record<string, unknown>;
    return normaliseerVensterStand(alles[sl]);
  } catch { return LEGE_VENSTERSTAND; }
};
const cacheSchrijven = (sl: string, waarde: VensterStand) => {
  try {
    const alles = JSON.parse(localStorage.getItem(CACHE) || '{}') as Record<string, unknown>;
    // Hoogstens vier scopes in de cache: dit is gemak, geen archief.
    const sleutels = Object.keys(alles).filter((k) => k !== sl).slice(-3);
    const uit: Record<string, unknown> = { [sl]: waarde };
    for (const k of sleutels) uit[k] = alles[k];
    localStorage.setItem(CACHE, JSON.stringify(uit));
  } catch { /* geen opslag: niet erg, de server blijft de waarheid */ }
};

/** Scope van dit tabblad opnieuw bepalen (bij het eerste gebruik en na een accountwissel). */
const zorgScope = () => {
  const sl = scopeNu();
  if (sl === scope) return;
  scope = sl;
  stand = cacheLezen(sl);
  melden();
};

let bezig = false;
/** De stand van de server halen en met wat deze browser al had samenvoegen. Eén keer per pagina is genoeg. */
export async function vensterStandOphalen(dienst: string): Promise<void> {
  zorgScope();
  // De dienst van DEZE pagina onthouden: het opslaan stuurt hem mee en de server weigert (403) een dienst die niet bij de herkomst
  // past. Voorheen bleef het 'hub' tot iemand een venster opende — minimaliseren op mcp.* of mail.* werd dan nooit bewaard (stand 21.10).
  if (dienst) laatsteDienst = dienst;
  if (bezig || typeof window === 'undefined' || !weergaveAccountNu()) return;
  bezig = true;
  const vanScope = scope;
  try {
    const antwoord = await api.post('/api/owner/vensters/laden', { service: dienst, tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
    if (scopeNu() !== vanScope) return; // ander account tijdens het wachten: dit antwoord is niet van hem
    stand = voegVensterStandenSamen(stand, normaliseerVensterStand(antwoord.data));
    cacheSchrijven(vanScope, stand);
    melden();
  } catch { /* uitgelogd of offline: de cache blijft gelden en een volgende wijziging probeert opnieuw */ }
  finally { bezig = false; }
}

let wachtend = 0;
let laatsteDienst = 'hub';
const naarServer = () => {
  if (typeof window === 'undefined') return;
  const vanScope = scope;
  window.clearTimeout(wachtend);
  wachtend = window.setTimeout(() => {
    if (scopeNu() !== vanScope) return; // NOOIT namens een ander account schrijven
    void api.post('/api/owner/vensters/opslaan', {
      service: laatsteDienst, tabContext: ecosystemTabContext(), sourceOrigin: location.origin, vensters: stand.vensters,
    }).catch(() => undefined);
  }, 300);
};

const zetten = (volgende: VensterStand) => {
  zorgScope();
  stand = volgende;
  cacheSchrijven(scope, stand);
  melden();
  naarServer();
};

/** Dit venster bestaat (en op deze stap). Zelfde id = bijwerken; geheime velden worden weggegooid. */
export function vensterOnthouden(venster: Partial<OnthoudenVenster> & { id: string; soort: OnthoudenVenster['soort'] }): void {
  zorgScope();
  laatsteDienst = venster.dienst || laatsteDienst;
  zetten(metVenster(stand, venster));
}
/** Dit venster is gesloten: uit het dok en uit de lade. */
export function vensterVergeten(id: string): void { zetten(zonderVenster(stand, id)); }
/** Geminimaliseerd of weer open — dit is wat een subdomeinwissel moet overleven. */
export function vensterKleinOnthouden(id: string, klein: boolean): void {
  zorgScope();
  const huidig = stand.vensters.find((v) => v.id === id);
  if (!huidig || huidig.klein === klein) return;
  zetten(metVensterKlein(stand, id, klein));
}

export function onthoudenVensters(): VensterStand { zorgScope(); return stand; }
export function useOnthoudenVensters(): VensterStand {
  return useSyncExternalStore(
    (fn) => { kijkers.add(fn); zorgScope(); return () => { kijkers.delete(fn); }; },
    () => { zorgScope(); return stand; },
    () => LEGE_VENSTERSTAND,
  );
}

/** Alleen voor tests. */
export function __vensterOnthoudenReset(): void { scope = ''; stand = LEGE_VENSTERSTAND; bezig = false; }
