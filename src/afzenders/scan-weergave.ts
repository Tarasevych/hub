// BUG-002 (29.10.2026) «Перевірка всіх адрес» springt zelf open en dicht. Hier staat wat de achtergrondcontrole en het venster
// van elkaar SCHEIDT: het venster onthoudt de keuze van de gebruiker (open / klein / weg) los van de stand van de controle, en de
// controle zelf (automatisch starten, hervatten) gebeurt hoogstens één keer tegelijk en met een vast maximum per paginabezoek.
//
// Oorzaak (vastgelegd met tests/e2e/scan-melding.e2e.ts, logboek in docs/bug002/):
//  1. Het venster bestond alleen zolang `toon` waar was. Elke wissel (tabblad «Контакти», nieuwe mount na de sessiecontrole, een run
//     die als «fout» eindigde en weer startte, het periodieke bijwerken, verversen) haalde het weg en zette het NIEUW neer. Het
//     vensterbeheer vergeet dan «geminimaliseerd» → het venster sprong vanzelf weer open, ook na «Згорнути».
//  2. Elke mount riep opnieuw POST …/scan/auto; useAutoHervatten draaide in elke ScanPaneel/melding apart (dubbel) en hervatte
//     na élke nieuwe «fout» opnieuw (sleutel met bijgewerktOp) — bovenop de 12 pogingen van de server: zonder einde.
//  3. Eén HTTP_502 of time-out op …/scan/status stopte het bijhouden van de voortgang stil; de stand bleef hangen.
// Puur waar het kan (getest in tests/eenheid/scan-weergave-20261029.test.ts).
import type { ScanStand } from './api';

export type ScanKeuze = 'open' | 'klein' | 'weg';
const SLEUTEL = 'tsv:mail-scan-weergave';
const OUD_WEG = 'tsv:mail-contacten-melding-weg';
/** Hoe lang het venster na het einde nog blijft staan: een korte wissel (fout → opnieuw, poll mislukt) laat het niet knipperen. */
export const SCAN_NAGLOEI_MS = 6_000;
/** Hoogstens zoveel automatische hervattingen per paginabezoek (bovenop de pogingen van de server zelf). */
export const SCAN_MAX_AUTO_HERVAT = 3;
/** Minimale tijd tussen twee automatische hervattingen. */
export const SCAN_HERVAT_PAUZE_MS = 30_000;

export function leesKeuze(): ScanKeuze | null {
  try {
    const v = sessionStorage.getItem(SLEUTEL);
    if (v === 'open' || v === 'klein' || v === 'weg') return v;
    return sessionStorage.getItem(OUD_WEG) === '1' ? 'weg' : null;
  } catch { return null; }
}
export function bewaarKeuze(k: ScanKeuze) {
  try { sessionStorage.setItem(SLEUTEL, k); if (k === 'weg') sessionStorage.setItem(OUD_WEG, '1'); else sessionStorage.removeItem(OUD_WEG); } catch { /* optioneel */ }
}

/** Is er iets dat de gebruiker moet zien? Het korte periodieke bijwerken (fase «bijwerken») opent het venster NIET zelf. */
export function scanVraagtAandacht(s: ScanStand | null, herhaalt: boolean): boolean {
  if (!s) return false;
  if (s.staat === 'fout' || s.staat === 'onderbroken' || herhaalt) return true;
  const volledig = s.accounts.some((a) => a.fase !== 'bijwerken' && a.staat !== 'klaar' && a.staat !== 'overgeslagen');
  if (s.loopt) return volledig;
  return !!s.automatisch && s.staat !== 'klaar' && s.staat !== 'gepauzeerd' && s.staat !== 'gestopt' && volledig;
}

/**
 * Zichtbaarheid met naglooi: eenmaal zichtbaar blijft het venster staan tot de aandacht `SCAN_NAGLOEI_MS` lang weg is.
 * `sinds` = moment waarop de aandacht wegviel (null zolang er aandacht is). Geeft terug of het venster nu moet staan.
 */
export function scanZichtbaar(aandacht: boolean, wasZichtbaar: boolean, sinds: number | null, nu = Date.now()): boolean {
  if (aandacht) return true;
  if (!wasZichtbaar) return false;
  return sinds !== null && nu - sinds < SCAN_NAGLOEI_MS;
}

// ── levenscyclus van de achtergrondcontrole (één per paginabezoek, los van elk venster) ──
let autoLaatst = 0;
/** Zo vaak hoogstens POST …/scan/auto (dezelfde grens als het bijwerken op de server: 15 min), hoeveel componenten er ook mounten. */
export const SCAN_AUTO_INTERVAL_MS = 15 * 60_000;
/** POST …/scan/auto hoogstens één keer per SCAN_AUTO_INTERVAL_MS per paginabezoek, hoe vaak de melding ook (opnieuw) mount. */
export function eenmaligAuto(f: () => Promise<unknown>, nu = Date.now()) {
  if (autoLaatst && nu - autoLaatst < SCAN_AUTO_INTERVAL_MS) return false;
  autoLaatst = nu;
  void f().catch(() => { autoLaatst = 0; });
  return true;
}

const hervat = { aantal: 0, laatst: 0, bezig: false };
/** Mag er nu automatisch hervat worden? (één tegelijk, maximum per bezoek, pauze ertussen) Zo ja: meteen gereserveerd. */
export function reserveerHervatten(nu = Date.now()): boolean {
  if (hervat.bezig || hervat.aantal >= SCAN_MAX_AUTO_HERVAT || (hervat.laatst && nu - hervat.laatst < SCAN_HERVAT_PAUZE_MS)) return false;
  hervat.bezig = true; hervat.aantal++; hervat.laatst = nu;
  return true;
}
export function hervattenKlaar() { hervat.bezig = false; }
/** Een handmatige actie (Продовжити / Пауза / Зупинити) zet de teller terug: de gebruiker koos zelf. */
export function hervattenTerug() { hervat.aantal = 0; hervat.laatst = 0; }

let startInVlucht: Promise<unknown> | null = null;
/** Twee knoppen of twee panelen die tegelijk starten → één verzoek; de tweede wacht op hetzelfde antwoord. */
export function eenStart<T>(f: () => Promise<T>): Promise<T> {
  if (startInVlucht) return startInVlucht as Promise<T>;
  const p = f().finally(() => { if (startInVlucht === p) startInVlucht = null; });
  startInVlucht = p;
  return p;
}

/** Alleen voor tests. */
export function _herstelVoorTest() { autoLaatst = 0; hervat.aantal = 0; hervat.laatst = 0; hervat.bezig = false; startInVlucht = null; }
