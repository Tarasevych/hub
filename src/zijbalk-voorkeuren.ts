// Zijbalkvoorkeuren (menu v2): modus (auto / altijd open / altijd smal), icoonstijl, dock en indeling — PER ACCOUNT en PER PROFIEL.
// Bron van waarheid is de server (owner_ui_preferences_v1, veld `sidebar`, via de bootstrap en POST /api/owner/ui/sidebar/save);
// localStorage is alleen een cache zodat de eerste weergave meteen klopt. Zonder goedgekeurde sessie: alleen lokaal.
//
// Audit 19.10.2026 (punt 2 en punt 4) — twee fouten hersteld:
//  1. De cache lag onder ÉÉN sleutel ('tsv-zijbalk-v2') zonder account. Wie twee accounts in dezelfde browser gebruikt, zag na het
//     wisselen het menu van de ander (tot de bootstrap kwam) en een wijziging kon de indeling van de ander onder het NIEUWE account
//     naar de server schrijven. Nu: 'tsv-zijbalk-v2:<scope>' (scope = account-id, of 'anon'), net als menu-meldingen-opslag.ts. Bij
//     een accountwissel wordt niets van de oude stand verstuurd (openstaande opslag wordt afgebroken) en wordt de cache van het
//     NIEUWE account gelezen — nooit die van de ander.
//  2. Er was geen dimensie «profiel»: de gebruikersruimte en het technisch profiel deelden één indeling. Nu houdt elke ruimte zijn
//     eigen volgorde, zichtbaarheid, snelle toegang, iconen en kleuren (shared/menu-model.ts: ZijbalkRuimtes). De technische
//     indeling komt alleen van de server met een LOPEND technisch profiel (POST /api/owner/ui/sidebar) en gaat alleen zo terug.
//
// De hint per TABBLAD (sessionStorage) zegt welk account dit tabblad als laatste had, zodat de eerste weergave na F5 meteen de
// juiste indeling toont zonder ooit de cache van een ander account te gebruiken (sessionStorage is per tabblad, niet per browser).
import { useSyncExternalStore } from 'react';
import { normaliseerRuimtes, normaliseerZijbalk, standaardRuimtes, standaardZijbalk, type MenuRuimte, type ZijbalkRuimtes, type ZijbalkVoorkeuren } from '../shared/menu-model';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';

export const ZIJBALK_SLEUTEL = 'tsv-zijbalk-v2';
const SLEUTEL = (scope: string) => `${ZIJBALK_SLEUTEL}:${scope || 'anon'}`;
const SCOPE_HINT = 'tsv-zijbalk-scope';

type Server = { service: string; scope?: string } | null;
let scope = leesScopeHint();
let ruimte: MenuRuimte = 'gebruiker';
let alles: ZijbalkRuimtes = lees(scope);
let lokaalGezet = heeftLokaal(scope);
let server: Server = null;
let laatsteServer: Record<MenuRuimte, string> = { gebruiker: '', technisch: '' };
const luisteraars = new Set<() => void>();

function leesScopeHint() { try { return typeof sessionStorage !== 'undefined' ? String(sessionStorage.getItem(SCOPE_HINT) || 'anon') : 'anon'; } catch { return 'anon'; } }
function schrijfScopeHint(s: string) { try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SCOPE_HINT, s); } catch { /* privémodus */ } }
function heeftLokaal(s: string) { try { return typeof localStorage !== 'undefined' && localStorage.getItem(SLEUTEL(s)) !== null; } catch { return false; } }
function lees(s: string): ZijbalkRuimtes { try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(SLEUTEL(s)) : null; return r ? normaliseerRuimtes(JSON.parse(r)) : standaardRuimtes(); } catch { return standaardRuimtes(); } }
function schrijfLokaal() { try { localStorage.setItem(SLEUTEL(scope), JSON.stringify(alles)); lokaalGezet = true; } catch { /* privémodus */ } }
function melden() { for (const f of luisteraars) f(); }
// De oude sleutel zonder account is van NIEMAND: weg, zodat hij nooit meer bij een ander account terechtkomt (de server heeft de echte stand).
try { if (typeof localStorage !== 'undefined' && localStorage.getItem(ZIJBALK_SLEUTEL) !== null) localStorage.removeItem(ZIJBALK_SLEUTEL); } catch { /* privémodus */ }

/** De voorkeuren van de ruimte waarin dit tabblad nu staat. */
export const zijbalkVoorkeuren = () => alles[ruimte];
/** Beide ruimtes (voor opslag en tests). */
export const zijbalkRuimtes = () => alles;
/** In welke webruimte (profiel) dit tabblad nu staat. */
export const zijbalkHuidigeRuimte = () => ruimte;
/** Aan welk account de cache nu hangt ('anon' = niet aangemeld). */
export const zijbalkScopeNu = () => scope;
/** Dienst van de goedgekeurde accountsessie (null = niet aangemeld/goedgekeurd: dan geen serveraanroepen voor het menu). */
export const zijbalkServerDienst = () => server?.service || '';
/** Heeft deze browser (of de server) al ooit een keuze opgeslagen? Anders volgt de modus het oude per-tabblad-vastzetten. */
export const zijbalkKeuzeBekend = () => lokaalGezet || laatsteServer[ruimte] !== '';
export function abonneerZijbalk(f: () => void) { luisteraars.add(f); return () => { luisteraars.delete(f); }; }
export function useZijbalkVoorkeuren() { return useSyncExternalStore(abonneerZijbalk, zijbalkVoorkeuren, zijbalkVoorkeuren); }

const wachtenden = new Map<string, number>();
function wachtendenAf() { if (typeof window === 'undefined') { wachtenden.clear(); return; } for (const t of wachtenden.values()) window.clearTimeout(t); wachtenden.clear(); }

/** Ander account in dit tabblad: niets van de oude stand versturen, en de cache van DIT account lezen (nooit die van de ander). */
export function zijbalkScope(nieuw: string | null | undefined): void {
  const s = String(nieuw || '') || 'anon';
  if (s === scope) return;
  wachtendenAf();
  scope = s;
  schrijfScopeHint(s);
  alles = lees(s);
  lokaalGezet = heeftLokaal(s);
  laatsteServer = { gebruiker: '', technisch: '' };
  melden();
}

/** Van ruimte wisselen (gebruikersruimte ↔ technisch profiel): elke ruimte heeft zijn eigen menu. */
export function zijbalkRuimte(nieuw: MenuRuimte): void {
  if (nieuw === ruimte) return;
  ruimte = nieuw;
  melden();
  if (nieuw === 'technisch') void technischOphalen();
}

/** Uit de bootstrap (uiPreferences.sidebar) — altijd de GEBRUIKERSruimte. `ctx` alleen bij een goedgekeurd account. */
export function zijbalkVanServer(raw: unknown, ctx: Server) {
  const wasGoedgekeurd = server?.service || '';
  zijbalkScope(ctx ? ctx.scope : '');
  server = ctx;
  if ((ctx?.service || '') !== wasGoedgekeurd) melden(); // o.a. het «levende» menu haalt pas tellers op bij een goedgekeurd account
  if (!ctx) return;
  if (ruimte === 'technisch') void technischOphalen();
  if (raw === undefined || raw === null) return;
  const v = normaliseerRuimtes(raw).gebruiker, s = JSON.stringify(v);
  if (s === laatsteServer.gebruiker) return;
  laatsteServer.gebruiker = s;
  if (s !== JSON.stringify(alles.gebruiker)) { alles = { ...alles, gebruiker: v }; schrijfLokaal(); melden(); }
}

/** De technische indeling staat NIET in de bootstrap: die vraagt een lopend technisch profiel in dit tabblad. */
let techBezig = false;
async function technischOphalen(): Promise<void> {
  if (!server || techBezig || typeof window === 'undefined') return;
  const ctx = server, s = scope;
  techBezig = true;
  try {
    const r = await api.post('/api/owner/ui/sidebar', { service: ctx.service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ruimte: 'technisch' });
    if (scope !== s) return; // ander account tijdens het wachten: dit antwoord is niet van hem
    if (wachtenden.has(`${s}|technisch`)) return; // er wacht al een eigen wijziging: die mag niet door dit antwoord worden overschreven
    const v = normaliseerZijbalk((r.data as { sidebar?: unknown }).sidebar), j = JSON.stringify(v);
    laatsteServer.technisch = j;
    if (j !== JSON.stringify(alles.technisch)) { alles = { ...alles, technisch: v }; schrijfLokaal(); melden(); }
  } catch { /* geen technisch profiel of offline: de lokale stand blijft gelden */ }
  finally { techBezig = false; }
}

function naarServer(ctx: NonNullable<Server>, s: string, r: MenuRuimte) {
  if (typeof window === 'undefined') return;
  const sl = `${s}|${r}`;
  window.clearTimeout(wachtenden.get(sl));
  wachtenden.set(sl, window.setTimeout(() => {
    wachtenden.delete(sl);
    if (!server || scope !== s) return; // ander account: NOOIT namens hem schrijven
    void api.post('/api/owner/ui/sidebar/save', { service: ctx.service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ruimte: r, sidebar: alles[r] })
      .then((resp) => { laatsteServer[r] = JSON.stringify(normaliseerZijbalk((resp.data as { sidebar?: unknown }).sidebar)); })
      .catch(() => undefined); // offline of uitgelogd: lokaal blijft het gelden, volgende wijziging probeert opnieuw
  }, 350));
}

/** Wijzigen van de HUIDIGE ruimte: meteen lokaal (en in alle componenten), daarna — gebundeld — naar de server. */
export function zetZijbalk(patch: Partial<ZijbalkVoorkeuren> | ((v: ZijbalkVoorkeuren) => ZijbalkVoorkeuren)) {
  const huidig = alles[ruimte];
  const volgende = normaliseerZijbalk(typeof patch === 'function' ? patch(huidig) : { ...huidig, ...patch });
  if (JSON.stringify(volgende) === JSON.stringify(huidig)) return;
  alles = { ...alles, [ruimte]: volgende };
  schrijfLokaal(); melden();
  if (server) naarServer(server, scope, ruimte);
}

/** Alleen voor tests. */
export function __zijbalkReset(v: ZijbalkVoorkeuren = standaardZijbalk()) {
  wachtendenAf();
  alles = { versie: 2, gebruiker: v, technisch: standaardZijbalk() };
  ruimte = 'gebruiker'; scope = 'anon'; server = null; laatsteServer = { gebruiker: '', technisch: '' }; lokaalGezet = false; techBezig = false;
  melden();
}
