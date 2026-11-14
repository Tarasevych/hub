// React-kant van het thema: palet + automatisch schakelen bovenop de bestaande modus-staat van de apps.
// De apps houden hun `theme` (licht/donker/apparaat/auto); deze hook voegt het palet en de klok toe, zet html.palet-… en
// schakelt zelf om op het volgende geplande moment (zonsondergang, einde van het tijdvenster, einde van een pauze).
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { readSharedPreferences, watchSharedPreferences, writeSharedPreferences, type ThemePreference } from '../gedeelde-voorkeuren';
import { hervat, normaalAuto, pauzeer, resolveer, STANDAARD_AUTO, type AutoInstelling, type Palet, type Presentatie } from './kern';
import './paletten.css';
import './weergave-stijl.css';
import { pasWeergaveStijlToe, type WeergaveStijl } from './weergave-stijl';

const GEBEURTENIS = 'tsv:thema';
// IDENTITEIT-015: у стані ще щільність, рух, акцент і виразність ефектів (shared/uiterlijk.ts) — для <html> і для вигляду «Макет».
type Stand = { palet: Palet | undefined; auto: AutoInstelling | undefined; theme: unknown; stijl: WeergaveStijl };
const uitVoorkeuren = (p: ReturnType<typeof readSharedPreferences>): Stand => ({ palet: p.palet, auto: p.auto, theme: p.theme, stijl: { dichtheid: p.dichtheid, beweging: p.beweging, accent: p.accent, effecten: p.effecten } });
let stand: Stand = (() => { try { return uitVoorkeuren(readSharedPreferences()); } catch { return { palet: undefined, auto: undefined, theme: undefined, stijl: {} }; } })();
const luisteraars = new Set<() => void>();
const ververs = () => { const n = uitVoorkeuren(readSharedPreferences()); if (JSON.stringify(n) !== JSON.stringify(stand)) { stand = n; luisteraars.forEach((l) => l()); } };
let gestart = false;
const abonneer = (l: () => void) => {
  luisteraars.add(l);
  if (!gestart) { gestart = true; watchSharedPreferences(() => ververs()); window.addEventListener(GEBEURTENIS, ververs); }
  return () => { luisteraars.delete(l); };
};
const lees = () => stand;
export const useThemaStand = () => useSyncExternalStore(abonneer, lees, lees);

/** Palet kiezen (opgeslagen in de gedeelde voorkeuren van alle subdomeinen). */
export function zetPalet(palet: Palet) { writeSharedPreferences({ palet }); window.dispatchEvent(new Event(GEBEURTENIS)); }
/** IDENTITEIT-015: щільність, рух, акцент, ефекти — у спільних уподобаннях (сервер — джерело правди, src/weergave-uiterlijk.ts).
 *  undefined повертає типове значення (поле зникає із запису). Dichtheid, beweging, accent, effecten: undefined = standaard. */
export function zetWeergaveStijl(patch: WeergaveStijl) { writeSharedPreferences(patch); window.dispatchEvent(new Event(GEBEURTENIS)); }
export function zetAuto(auto: AutoInstelling) { writeSharedPreferences({ auto: normaalAuto(auto) }); window.dispatchEvent(new Event(GEBEURTENIS)); }
export function huidigeAuto(): AutoInstelling { return normaalAuto(stand.auto || STANDAARD_AUTO); }
export function pauzeerAuto() { zetAuto(pauzeer(huidigeAuto(), Date.now())); }
export function hervatAuto() { zetAuto(hervat(huidigeAuto())); }

const KLASSEN = ['palet-grifel', 'palet-puur', 'palet-violet', 'palet-kleur'];

/** Wat de shell toont. `nu` tikt mee tot het volgende schakelmoment (max. 15 min tussen controles, en bij terugkomen). */
export function useThemaPresentatie(theme: ThemePreference, apparaatDonker: boolean, violetToegestaan: boolean): Presentatie {
  const s = useThemaStand();
  const [nu, setNu] = useState(() => Date.now());
  const r = resolveer({ theme, palet: s.palet, auto: s.auto, apparaatDonker, nu, violetToegestaan });
  useEffect(() => {
    if (r.volgende === null) return;
    const wacht = Math.max(1000, Math.min(r.volgende - Date.now() + 500, 15 * 60 * 1000));
    const t = window.setTimeout(() => setNu(Date.now()), wacht);
    return () => window.clearTimeout(t);
  }, [r.volgende, nu]);
  useEffect(() => {
    const wakker = () => { if (document.visibilityState === 'visible') setNu(Date.now()); };
    document.addEventListener('visibilitychange', wakker); window.addEventListener('focus', wakker);
    return () => { document.removeEventListener('visibilitychange', wakker); window.removeEventListener('focus', wakker); };
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains(`palet-${r.palet}`)) { root.classList.remove(...KLASSEN); root.classList.add(`palet-${r.palet}`); }
  }, [r.palet]);
  // IDENTITEIT-015: щільність, рух, акцент і ефекти облікового запису — на <html> кожного сервісу (оболонка викликає цей хук).
  const st = s.stijl;
  useLayoutEffect(() => { pasWeergaveStijlToe(st); }, [st.dichtheid, st.beweging, st.accent, st.effecten]);
  return r.presentatie;
}

/** Voor de instellingen: de huidige automatische toestand (donker? volgende moment? gepauzeerd?). */
export function useAutoStatus(theme: ThemePreference) {
  const s = useThemaStand();
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNu(Date.now()), 30000); return () => window.clearInterval(t); }, []);
  const apparaatDonker = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return { ...resolveer({ theme, palet: s.palet, auto: s.auto, apparaatDonker, nu }), auto: normaalAuto(s.auto || STANDAARD_AUTO), palet: s.palet };
}
