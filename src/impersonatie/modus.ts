// «Подивитися як користувач» in de browser van de BEHEERDER (backend/impersonatie.ts, 0068).
//
// Er is geen cookie of token van de gebruiker. Dit tabblad gaat naar https://<dienst>.tarasevych.com/#impersonatie=<id>; vanaf dan
// stuurt elke same-origin fetch naar /api/… via POST /api/impersonatie/aanroep (met de EIGEN sessie en het eigen tabblad van de
// beheerder). De server beslist per aanroep of het mag en voert hem uit als de gebruiker. Alles wat hier gebeurt is alleen
// doorsturen: weigeren, aflopen en het journaal gebeuren op de server. Bewust klein: main.tsx laadt dit vóór de app.
import { ecosystemTabContext } from '../tab-context';
import { dienstVanHost, herschrijf } from './herschrijf';

export { dienstVanHost, herschrijf };

export const IMP_SLEUTEL = 'mr-impersonatie';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EINDE = /^(IMPERSONATIE_BEEINDIGD|IMPERSONATIE_NIET_GEVONDEN|ANDER_TABBLAD|TECH_IMPERSONATIE_VEREIST|TAB_ONGELDIG)$/;
export type ImpStaat = { id: string };

export function leesStaat(): ImpStaat | null {
  try { const s = JSON.parse(sessionStorage.getItem(IMP_SLEUTEL) || 'null'); return s && ID.test(String(s.id)) ? { id: String(s.id) } : null; } catch { return null; }
}
function zetStaat(s: ImpStaat | null) { try { if (s) sessionStorage.setItem(IMP_SLEUTEL, JSON.stringify(s)); else sessionStorage.removeItem(IMP_SLEUTEL); } catch { /* privévenster: alleen deze pagina */ } }

/** #impersonatie=<id> in de adresbalk → bewaren (per origin, per tabblad) en uit de adresbalk halen. */
function leesHash(): ImpStaat | null {
  const m = /(?:^#|&)impersonatie=([0-9a-f-]{36})(?:&|$)/.exec(location.hash || '');
  if (!m || !ID.test(m[1])) return null;
  const s = { id: m[1] };
  zetStaat(s);
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* geen history */ }
  return s;
}

let origineel: typeof fetch | null = null;
let eindeCode = '';
/** Al door de server beëindigd (ook als dat gebeurde vóór de band geladen was)? */
export const impersonatieEinde = () => eindeCode;
export const echteFetch = (): typeof fetch => origineel || window.fetch.bind(window);

function installeer(s: ImpStaat) {
  if (origineel) return;
  origineel = window.fetch.bind(window);
  const dienst = dienstVanHost(location.hostname);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const url = req ? req.url : String(input instanceof URL ? input.href : input);
    const method = init?.method || req?.method || 'GET';
    const bodyTekst = typeof init?.body === 'string' ? init.body : req && !init?.body ? await req.clone().text().catch(() => '') : '';
    const w = herschrijf(method, url, bodyTekst, location.origin);
    if (!w) return origineel!(input as RequestInfo, init);
    const res = await origineel!('/api/impersonatie/aanroep', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: init?.signal ?? req?.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ service: dienst, tabContext: ecosystemTabContext(), id: s.id, route: w.route, body: w.body }),
    });
    if (res.status === 403 || res.status === 404) {
      const kopie = res.clone();
      void kopie.json().then((d) => { if (EINDE.test(String(d?.error || ''))) { eindeCode = String(d.error); } if (eindeCode) window.dispatchEvent(new CustomEvent('mr-impersonatie-einde', { detail: String(d.error) })); }, () => undefined);
    }
    return res;
  }) as typeof fetch;
}

/** Vóór de app: modus aan als dit tabblad een lopende impersonatie heeft (of er een opent via de hash). */
export function startImpersonatieModus(): boolean {
  if (typeof window === 'undefined') return false;
  const s = leesHash() || leesStaat();
  if (!s) return false;
  installeer(s);
  document.documentElement.dataset.impersonatie = 'aan';
  void import('./Band').then((m) => m.monteer(s)).catch(() => undefined);
  return true;
}

/** Terug naar het eigen account: modus uit en de pagina opnieuw laden (dan ziet de beheerder weer zijn eigen gegevens). */
export function stopImpersonatieModus(naar?: string) {
  zetStaat(null);
  if (origineel) { window.fetch = origineel; origineel = null; }
  delete document.documentElement.dataset.impersonatie;
  location.assign(naar || location.pathname);
}

/** URL om in DIT tabblad de site van de gebruiker in een dienst te openen. */
export const impersonatieUrl = (id: string, dienst = 'hub') => `https://${dienst === 'identity' ? 'id' : dienst}.tarasevych.com/#impersonatie=${id}`;
