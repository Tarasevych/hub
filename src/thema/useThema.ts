// React-kant van het thema: palet + automatisch schakelen bovenop de bestaande modus-staat van de apps.
// De apps houden hun `theme` (licht/donker/apparaat/auto); deze hook voegt het palet en de klok toe, zet html.palet-… en
// schakelt zelf om op het volgende geplande moment (zonsondergang, einde van het tijdvenster, einde van een pauze).
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { readSharedPreferences, watchSharedPreferences, writeSharedPreferences, type ThemePreference } from '../gedeelde-voorkeuren';
import { hervat, isKlassiekPalet, isMaquetteStelsel, leesKeuze, normaalAuto, pauzeer, resolveer, STANDAARD_AUTO, type AutoInstelling, type Palet, type Presentatie } from './kern';
import './paletten.css';

const GEBEURTENIS = 'tsv:thema';
type Stand = { palet: Palet | undefined; auto: AutoInstelling | undefined; theme: unknown };
let stand: Stand = (() => { try { const p = readSharedPreferences(); return { palet: p.palet, auto: p.auto, theme: p.theme }; } catch { return { palet: undefined, auto: undefined, theme: undefined }; } })();
const luisteraars = new Set<() => void>();
const ververs = () => { const p = readSharedPreferences(); const n = { palet: p.palet, auto: p.auto, theme: p.theme }; if (JSON.stringify(n) !== JSON.stringify(stand)) { stand = n; luisteraars.forEach((l) => l()); } };
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
export function zetAuto(auto: AutoInstelling) { writeSharedPreferences({ auto: normaalAuto(auto) }); window.dispatchEvent(new Event(GEBEURTENIS)); }
export function huidigeAuto(): AutoInstelling { return normaalAuto(stand.auto || STANDAARD_AUTO); }
export function pauzeerAuto() { zetAuto(pauzeer(huidigeAuto(), Date.now())); }
export function hervatAuto() { zetAuto(hervat(huidigeAuto())); }

const KLASSEN = ['palet-grifel', 'palet-puur', 'palet-violet', 'palet-kleur', 'palet-maquette', 'palet-klassiek-wit', 'palet-klassiek-zwart'];

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
    root.classList.remove(...KLASSEN);
    root.classList.add(`palet-${r.palet}`);
    if (isKlassiekPalet(r.palet)) {
      root.classList.add('palet-maquette');
      root.dataset.maquetteStijl = 'klassiek';
    } else if (r.palet === 'maquette') {
      root.dataset.maquetteStijl = 'studio';
    } else {
      delete root.dataset.maquetteStijl;
    }
  }, [r.palet]);
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

export type MaquetteVariant = 'geen' | 'studio' | 'klassiek-wit' | 'klassiek-zwart';

/** Чи увімкнено родину оформлення «Макет» (студійний «Макет», «Біла класика» або «Чорна класика»). */
export function useIsMaquette(): boolean {
  const s = useThemaStand();
  return isMaquetteStelsel(leesKeuze(s.theme, s.palet).palet);
}

/** Чи увімкнено одну з класичних палітр («Біла класика» або «Чорна класика»). */
export function useIsKlassiek(): boolean {
  const s = useThemaStand();
  return isKlassiekPalet(leesKeuze(s.theme, s.palet).palet);
}

/** Точний різновид у межах родини «Макет» для умовного прибирання студійних вітрин у класиці. */
export function useMaquetteVariant(): MaquetteVariant {
  const s = useThemaStand();
  const p = leesKeuze(s.theme, s.palet).palet;
  if (p === 'maquette') return 'studio';
  if (p === 'klassiek-wit' || p === 'klassiek-zwart') return p;
  return 'geen';
}
