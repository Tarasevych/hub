// Zijbalkvoorkeuren (menu v2): modus (auto / altijd open / altijd smal), icoonstijl en — voor fase 2 — dock en indeling.
// Bron van waarheid is de server (owner_ui_preferences_v1, veld `sidebar`, via de bootstrap en POST /api/owner/ui/sidebar/save);
// localStorage is alleen een cache zodat de eerste weergave meteen klopt. Zonder goedgekeurde sessie: alleen lokaal.
import { useSyncExternalStore } from 'react';
import { normaliseerZijbalk, standaardZijbalk, type ZijbalkVoorkeuren } from '../shared/menu-model';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';

const SLEUTEL = 'tsv-zijbalk-v2';
type Server = { service: string } | null;
let huidig: ZijbalkVoorkeuren = lees();
let lokaalGezet = heeftLokaal();
let server: Server = null;
let laatsteServer = '';
const luisteraars = new Set<() => void>();

function heeftLokaal() { try { return typeof localStorage !== 'undefined' && localStorage.getItem(SLEUTEL) !== null; } catch { return false; } }
function lees(): ZijbalkVoorkeuren { try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(SLEUTEL) : null; return r ? normaliseerZijbalk(JSON.parse(r)) : standaardZijbalk(); } catch { return standaardZijbalk(); } }
function schrijfLokaal(v: ZijbalkVoorkeuren) { try { localStorage.setItem(SLEUTEL, JSON.stringify(v)); lokaalGezet = true; } catch { /* privémodus */ } }
function melden() { for (const f of luisteraars) f(); }

export const zijbalkVoorkeuren = () => huidig;
/** Heeft deze browser (of de server) al ooit een keuze opgeslagen? Anders volgt de modus het oude per-tabblad-vastzetten. */
export const zijbalkKeuzeBekend = () => lokaalGezet || laatsteServer !== '';
export function abonneerZijbalk(f: () => void) { luisteraars.add(f); return () => { luisteraars.delete(f); }; }
export function useZijbalkVoorkeuren() { return useSyncExternalStore(abonneerZijbalk, zijbalkVoorkeuren, zijbalkVoorkeuren); }

/** Uit de bootstrap (uiPreferences.sidebar). `ctx` alleen bij een goedgekeurd account: dan worden wijzigingen ook op de server bewaard. */
export function zijbalkVanServer(raw: unknown, ctx: Server) {
  server = ctx;
  if (!ctx || raw === undefined || raw === null) return;
  const v = normaliseerZijbalk(raw), s = JSON.stringify(v);
  if (s === laatsteServer) return;
  laatsteServer = s;
  if (s !== JSON.stringify(huidig)) { huidig = v; schrijfLokaal(v); melden(); }
}

let wachtend: number | undefined;
/** Wijzigen: meteen lokaal (en in alle componenten), daarna — gebundeld — naar de server. */
export function zetZijbalk(patch: Partial<ZijbalkVoorkeuren> | ((v: ZijbalkVoorkeuren) => ZijbalkVoorkeuren)) {
  const volgende = normaliseerZijbalk(typeof patch === 'function' ? patch(huidig) : { ...huidig, ...patch });
  if (JSON.stringify(volgende) === JSON.stringify(huidig)) return;
  huidig = volgende; schrijfLokaal(volgende); melden();
  if (!server || typeof window === 'undefined') return;
  const ctx = server;
  window.clearTimeout(wachtend);
  wachtend = window.setTimeout(() => {
    void api.post('/api/owner/ui/sidebar/save', { service: ctx.service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin, sidebar: huidig })
      .then((r) => { laatsteServer = JSON.stringify(normaliseerZijbalk((r.data as { sidebar?: unknown }).sidebar)); })
      .catch(() => undefined); // offline of uitgelogd: lokaal blijft het gelden, volgende wijziging probeert opnieuw
  }, 350);
}
/** Alleen voor tests. */
export function __zijbalkReset(v: ZijbalkVoorkeuren = standaardZijbalk()) { huidig = v; server = null; laatsteServer = ''; lokaalGezet = false; }
