// Tellers voor het «levende» menu (fase B2). E-mail publiceert het aantal ongelezen in Вхідні (alleen het getal); dat gaat — gebundeld
// en alleen bij een wijziging — naar de server (POST /api/owner/menu/tellers/zet, alleen vanaf mail.*), zodat ook hub/id/… de badge
// tonen (POST /api/owner/menu/tellers). Alles alleen voor een goedgekeurd account (zijbalkServerDienst() ≠ ''). Weggeklikte tellers
// staan per gebruiker op de server (geldt op elk subdomein en toestel) met localStorage als snelle kopie (alleen het weggeklikte
// aantal; bij MEER ongelezen komt de badge terug).
import { useSyncExternalStore } from 'react';
import type { Tellers } from '../shared/menu-meldingen';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { zijbalkServerDienst } from './zijbalk-voorkeuren';

type Staat = { tellers: Tellers; weg: Record<string, number>; scope: string };
let staat: Staat = { tellers: {}, weg: {}, scope: '' };
const luisteraars = new Set<() => void>();
const melden = () => { for (const f of luisteraars) f(); };
const zet = (s: Partial<Staat>) => { staat = { ...staat, ...s }; melden(); };
export const menuTellers = () => staat;
export function useMenuTellers() { return useSyncExternalStore((f) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; }, menuTellers, menuTellers); }

const WEG = 'tsv-menu-weg-v1:';
const ctx = () => ({ service: zijbalkServerDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
/** Wissel van gebruiker (scope = user-id of 'anon'): tellers leeg, weggeklikte waarden van DIE gebruiker laden. */
export function tellersScope(scope: string) {
  if (scope === staat.scope) return;
  let weg: Record<string, number> = {};
  try { const r = scope && scope !== 'anon' ? JSON.parse(localStorage.getItem(WEG + scope) || '{}') : {}; if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) if (Number.isFinite(Number(v))) weg[k] = Number(v); } catch { weg = {}; }
  zet({ scope, tellers: {}, weg });
}
let laatsteOphaal = 0, bezig = false;
/** Van de server halen (hooguit 1× per 30 s, tenzij `forceer`). Zonder goedgekeurd account: niets. */
export async function tellersOphalen(forceer = false) {
  if (!zijbalkServerDienst() || bezig || (!forceer && Date.now() - laatsteOphaal < 30_000)) return;
  bezig = true; laatsteOphaal = Date.now();
  try { const r = await api.post('/api/owner/menu/tellers', ctx()); const d = r.data as { tellers?: Tellers; weg?: Record<string, number> }; const t = d?.tellers; const w = d?.weg && typeof d.weg === 'object' ? d.weg : null; zet({ ...(t && typeof t === 'object' ? { tellers: { ...staat.tellers, ...t } } : {}), ...(w ? { weg: { ...staat.weg, ...Object.fromEntries(Object.entries(w).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) } } : {}) }); } catch { /* offline: laatste stand blijft */ } finally { bezig = false; }
}
let wacht: number | undefined, laatstVerstuurd = -1;
/** Door E-mail aangeroepen met het aantal ongelezen in Вхідні. Meteen lokaal; naar de server alleen vanaf mail.* en bij een wijziging. */
export function publiceerMailTeller(ongelezen: number) {
  const n = Math.max(0, Math.min(99999, Math.floor(Number(ongelezen) || 0)));
  // minder ongelezen dan weggeklikt → grens zakt mee, zodat later echt nieuwe post weer verschijnt
  if (staat.tellers.mail?.ongelezen !== n) zet({ tellers: { ...staat.tellers, mail: { ongelezen: n, op: Date.now() } }, ...(staat.weg.mail !== undefined && n < staat.weg.mail ? { weg: { ...staat.weg, mail: n } } : {}) });
  if (zijbalkServerDienst() !== 'mail' || n === laatstVerstuurd) return;
  window.clearTimeout(wacht);
  wacht = window.setTimeout(() => { laatstVerstuurd = n; void api.post('/api/owner/menu/tellers/zet', { ...ctx(), bron: 'mail', ongelezen: n }).catch(() => { laatstVerstuurd = -1; }); }, 1200);
}
/** × op de teller-bel: tot er MEER ongelezen zijn niet meer tonen (alleen in deze browser, per gebruiker). */
export function tellerWegklikken(bron: 'mail') {
  const n = staat.tellers[bron]?.ongelezen ?? 0, weg = { ...staat.weg, [bron]: n };
  zet({ weg });
  try { if (staat.scope && staat.scope !== 'anon') localStorage.setItem(WEG + staat.scope, JSON.stringify(weg)); } catch { /* privémodus */ }
  // ook op de server: localStorage is per subdomein, dus zonder dit kwam de melding op hub/id/… of na F5 terug
  if (zijbalkServerDienst()) void api.post('/api/owner/menu/tellers/weg', { ...ctx(), bron, aantal: n }).catch(() => undefined);
}
/** Alleen voor tests. */
export function __tellersReset() { staat = { tellers: {}, weg: {}, scope: '' }; laatsteOphaal = 0; bezig = false; laatstVerstuurd = -1; melden(); }
