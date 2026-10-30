// Eén poort waarmee het TABBLAD een afgebroken uitrolpoging aan de server meldt (eigenaar 20.10.2026).
//
// Waarom dit bestaat: brak het uploaden in de browser af (NotReadableError van de File API, netwerk weg, tabblad gesloten), dan
// wist de server er NIETS van en bleef er in «Останні розгортання» geen spoor over. Zonder deze melding is niet te zien op welke
// etappe het stokte en waarom. De server behandelt dit als een mededeling van een client: hij controleert het recht om
// voorbereidingen te doen, begrenst de frequentie en de veldlengtes, en markeert de regel als «повідомлено браузером».
//
// Regels hier:
//   * mag NOOIT de echte fout verdringen: deze functie werpt niets en wacht op niets (fire-and-forget);
//   * `keepalive` zodat de melding ook nog weggaat als de pagina sluit (pagehide) — daarom rechtstreeks fetch en niet api.post:
//     die zou bij een 403 een bevestigingsvenster willen openen, en dat kan tijdens het sluiten van een tabblad niet;
//   * het pogingnummer komt uit dezelfde teller als de foutmeldingen (shared/foutuitleg.ts), niet uit een eigen bijhouden.
import { telPoging } from '../../shared/foutuitleg';
import { ZONDER_REDEN, type PogingEtappe } from '../../shared/uitrol-pogingen';

export const POGING_ROUTE = '/api/uitrol/poging/afgebroken';

export type Afbreking = {
  /** Waar het stokte. */
  etappe: PogingEtappe;
  /** De reden uit de enige bron (bv. `BESTAND_LEZEN|NotReadableError`, `HTTP_502`, `NETWORK_ERROR`); leeg ⇒ eerlijk «zonder reden». */
  code?: string;
  voorstelId?: string;
  versie?: string;
  sha256?: string;
  bytes?: number;
  /** Hoeveel bytes de server al had (de server herrekent het percentage zelf uit bytes). */
  verstuurd?: number;
  bestand?: string;
};

/** Meldt één afbreking. Faalt stil (het is boekhouding, geen handeling van de gebruiker). */
export function meldAfbreking(context: Record<string, unknown>, a: Afbreking): void {
  try {
    const code = String(a.code || '').trim() || ZONDER_REDEN;
    const { poging, tijd } = telPoging(`uitrol|poging|${a.versie || a.voorstelId || a.bestand || '?'}`);
    const lichaam = JSON.stringify({
      ...context,
      etappe: a.etappe,
      code,
      redenBekend: code !== ZONDER_REDEN,
      voorstelId: a.voorstelId || '',
      versie: a.versie || '',
      sha256: a.sha256 || '',
      bytes: Math.max(0, Math.trunc(Number(a.bytes) || 0)),
      verstuurd: Math.max(0, Math.trunc(Number(a.verstuurd) || 0)),
      bestand: String(a.bestand || '').slice(0, 160),
      poging,
      tijd: new Date(tijd).toISOString(),
    });
    void fetch(POGING_ROUTE, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: lichaam,
    }).catch(() => undefined);
  } catch { /* boekhouding mag de echte fout nooit overschaduwen */ }
}
