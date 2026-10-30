// «Сайт оновлено» (18.10.2026). Een open tabblad weet niet dat er intussen een nieuwe release draait: live liep een tabblad een uur
// met de code van vóór de installatie (de oplossing voor het springen van de pagina was al geïnstalleerd, maar dat tabblad zag hem
// niet). De build zet zijn eigen versie in de bundel (vite define __MR_BOUW_VERSIE__ uit UITROL-VERSIE); de site vergelijkt die met
// /api/version (wat het draaiende proces is) bij terugkeer naar het tabblad en elke 60 s zolang het zichtbaar is.
// Zuiver en zonder DOM-globals: getest in tests/eenheid/nieuwe-versie.test.ts.

import { dienstVanHostnaam } from '../../shared/foutuitleg';

export const VERSIE_RE = /^[0-9]{8}-[0-9]{6}$/;
export const INTERVAL_MS = 60_000;
/** Nooit vaker dan dit (ook niet bij snel wisselen tussen tabbladen). */
export const MIN_TUSSEN_MS = 15_000;
export const LATER_SLEUTEL = 'mr-nieuwe-versie-later';

export type Besluit = 'niets' | 'toon' | 'herlaad';

/**
 * - Geen of ongeldige versie aan een van beide kanten, of gelijk → niets.
 * - Tabblad verborgen en niets onopgeslagen → herlaad (de gebruiker komt terug op de nieuwe versie, verliest niets).
 * - De gebruiker zei «Пізніше» voor precies deze serverversie → niets (pas weer bij een volgende versie).
 * - Anders → strook tonen (nooit vanzelf herladen terwijl de gebruiker kijkt of iets invult).
 */
export function beslis(i: { ingebouwd: string; server: string; zichtbaar: boolean; onopgeslagen: boolean; uitgesteld: string }): Besluit {
  if (!VERSIE_RE.test(i.ingebouwd) || !VERSIE_RE.test(i.server) || i.ingebouwd === i.server) return 'niets';
  if (!i.zichtbaar && !i.onopgeslagen) return 'herlaad';
  if (i.uitgesteld === i.server) return 'niets';
  return 'toon';
}

type Veld = { tagName: string; type?: string; value?: string; defaultValue?: string; checked?: boolean; defaultChecked?: boolean; hasAttribute?: (n: string) => boolean; textContent?: string | null; isContentEditable?: boolean; options?: ArrayLike<{ selected: boolean; defaultSelected: boolean }> };

/** Is er iets ingevuld dat bij herladen verloren zou gaan? (gewijzigde velden, concepten, bewerkbare tekst met inhoud) */
export function veldGewijzigd(el: Veld): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (['hidden', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color'].includes(type)) return false;
    if (type === 'checkbox' || type === 'radio') return el.checked !== el.defaultChecked;
    if (el.hasAttribute?.('data-concept') && (el.value || '').trim()) return true;
    return (el.value || '') !== (el.defaultValue || '');
  }
  if (tag === 'TEXTAREA') return (el.value || '') !== (el.defaultValue || '') || (!!el.hasAttribute?.('data-concept') && !!(el.value || '').trim());
  if (tag === 'SELECT') return Array.from(el.options || []).some((o) => o.selected !== o.defaultSelected);
  if (el.isContentEditable) return !!(el.textContent || '').trim();
  return false;
}

export function heeftOnopgeslagen(doc: { querySelectorAll: (s: string) => ArrayLike<unknown> }): boolean {
  const velden = Array.from(doc.querySelectorAll('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) as Veld[];
  return velden.some(veldGewijzigd);
}

// ------------------------------------------------------------------------------------------------ server onbereikbaar (G4 + punt 3, audit 19.10.2026)
// Twee keer per dag stond de server ±20–30 s op 502 (herinstallatie); de pagina's toonden niets. Daarna toonde de plakkaat wél iets,
// maar ZONDER feiten en MET een gok («Імовірно, встановлюється оновлення») — punt 3 van de eigenaar. Nu meldt elke API-respons
// (client.ts) en de versie-poll (NieuweVersieBand) hier de FEITEN: status, code, route, dienst, tijdstip, nummer van de poging en het
// rauwe antwoordlichaam. CanonicalConnectionBanner laat ze zien via shared/foutuitleg.ts; niets wordt verzonnen.
export const isServerStoring = (status: number) => status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 530);
/** Bij storing vaker pollen, zodat de strook snel weer weggaat. */
export const STORING_POLL_MS = 5_000;

/** Precies wat de laatste mislukte poging opleverde. Geen schatting, geen gok. */
export type StoringFeiten = {
  status: number;
  /** Code uit het antwoord (data.error/reasonCode) of van de client ('NETWORK_ERROR'); leeg als er geen code was. */
  code: string;
  /** Bijv. 'GET /api/version'. */
  route: string;
  /** Dienst van deze host: 'mail', 'hub', 'admin', 'mcp'… (shared/foutuitleg.ts: dienstVanHostnaam). */
  dienst: string;
  /** Tijdstip van deze (laatste) poging, ms sinds 1970. */
  tijd: number;
  /** Hoeveelste mislukte poging op rij dit is (1 = de eerste). */
  poging: number;
  /** Rauw antwoordlichaam, afgekapt; leeg als de server er geen gaf. */
  lichaam: string;
};
export type AntwoordInfo = { route?: string; code?: string; lichaam?: string; dienst?: string };

let storing = false;
let feiten: StoringFeiten | null = null;
let opRij = 0;
const luisteraars = new Set<(storing: boolean, feiten: StoringFeiten | null) => void>();
const feitLuisteraars = new Set<(feiten: StoringFeiten | null) => void>();
export const serverStoring = () => storing;
/** De feiten van de lopende storing, of null zodra de server weer antwoordde. */
export const serverStoringFeiten = (): StoringFeiten | null => (storing ? feiten : null);

export function meldServerAntwoord(status: number, info: AntwoordInfo = {}) {
  const nu = isServerStoring(status);
  if (nu) {
    opRij += 1;
    feiten = {
      status,
      code: String(info.code || `HTTP_${status}`),
      route: String(info.route || ''),
      dienst: String(info.dienst || (typeof location !== 'undefined' ? dienstVanHostnaam(location.hostname) : 'hub')),
      tijd: Date.now(),
      poging: opRij,
      lichaam: String(info.lichaam || '').slice(0, 2000),
    };
    for (const f of feitLuisteraars) { try { f(feiten); } catch { /* een luisteraar mag de client niet breken */ } }
  } else {
    opRij = 0;
    feiten = null;
  }
  if (nu === storing) return;
  storing = nu;
  for (const f of luisteraars) { try { f(nu, feiten); } catch { /* een luisteraar mag de client niet breken */ } }
}
/** Wisselt de storing aan/uit? (wordt alleen bij een wissel aangeroepen) */
export function opServerStoring(f: (storing: boolean, feiten: StoringFeiten | null) => void) { luisteraars.add(f); return () => { luisteraars.delete(f); }; }
/** Elke mislukte poging tijdens een storing (nieuw tijdstip, nieuw pogingnummer), zodat de plakkaat actueel blijft. */
export function opStoringFeiten(f: (feiten: StoringFeiten | null) => void) { feitLuisteraars.add(f); return () => { feitLuisteraars.delete(f); }; }
