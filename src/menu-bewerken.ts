// Menu v2 fase 2: bewerkmodus van het menu (alleen in deze pagina, niet bewaard) + ongedaan maken.
// Elke wijziging gaat via `menuWijzigen`: meteen toepassen (zetZijbalk → lokaal + server), de vorige stand op de undo-stapel,
// een melding met knop «Скасувати» / «Ongedaan maken» en een tekst voor schermlezers (aria-live in het menu).
import { useSyncExternalStore } from 'react';
import type { ZijbalkVoorkeuren } from '../shared/menu-model';
import { emitCanonicalNotice } from './canonical-notifications';
import { zetZijbalk, zijbalkVoorkeuren } from './zijbalk-voorkeuren';

type Staat = { aan: boolean; status: string; terug: number };
let staat: Staat = { aan: false, status: '', terug: 0 };
const stapel: ZijbalkVoorkeuren[] = [];
const MAX_TERUG = 20;
const luisteraars = new Set<() => void>();
const zet = (p: Partial<Staat>) => { staat = { ...staat, ...p }; for (const f of luisteraars) f(); };
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
export const menuBewerkStaat = () => staat;
export function useMenuBewerken() { return useSyncExternalStore(abonneer, menuBewerkStaat, menuBewerkStaat); }
export function zetMenuBewerken(aan: boolean) { if (aan !== staat.aan) zet({ aan, status: '' }); }
/** Alleen tekst voor schermlezers (geen melding). */
export function menuStatus(tekst: string) { zet({ status: tekst }); }

const t = (lang: 'uk' | 'nl', uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export function menuWijzigen(nieuw: ZijbalkVoorkeuren, tekst: string, lang: 'uk' | 'nl') {
  const vorige = zijbalkVoorkeuren();
  if (JSON.stringify(vorige) === JSON.stringify(nieuw)) return;
  stapel.push(vorige);
  if (stapel.length > MAX_TERUG) stapel.shift();
  zetZijbalk(() => nieuw);
  zet({ status: tekst, terug: stapel.length });
  emitCanonicalNotice({ kind: 'success', source: 'menu-indeling', text: tekst, action: { label: t(lang, 'Скасувати', 'Ongedaan maken'), onAction: () => { ongedaanMaken(lang); } } });
}
export function ongedaanMaken(lang: 'uk' | 'nl'): boolean {
  const vorige = stapel.pop();
  if (!vorige) { zet({ status: t(lang, 'Немає що скасовувати', 'Niets om ongedaan te maken') }); return false; }
  zetZijbalk(() => vorige);
  zet({ status: t(lang, 'Останню зміну меню скасовано', 'Laatste menuwijziging ongedaan gemaakt'), terug: stapel.length });
  return true;
}
/** Alleen voor tests. */
export function __menuBewerkenReset() { stapel.length = 0; staat = { aan: false, status: '', terug: 0 }; }
