/**
 * Donkere mailweergave in de app: is het thema donker, en wil de eigenaar voor DIT bericht «Оригінал» of «Темний вигляд»?
 * Standaard (donker thema): «Темний вигляд». De keuze per bericht blijft op dit apparaat bewaard (localStorage).
 */
import { useEffect, useState } from 'react';

const DONKER = /\btheme-(?:dark|plum-dark)\b/;
export const isDonkerThema = () => typeof document !== 'undefined' && DONKER.test(document.documentElement.className);

export function useDonkerThema(): boolean {
  const [donker, zet] = useState(isDonkerThema);
  useEffect(() => {
    const w = new MutationObserver(() => zet(isDonkerThema()));
    w.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => w.disconnect();
  }, []);
  return donker;
}

const SLEUTEL = 'mail-donker-weergave:';
export type MailDonkerKeuze = 'donker' | 'origineel';
export function leesKeuze(berichtId: string): MailDonkerKeuze {
  try { return localStorage.getItem(SLEUTEL + berichtId) === 'origineel' ? 'origineel' : 'donker'; } catch { return 'donker'; }
}
export function bewaarKeuze(berichtId: string, keuze: MailDonkerKeuze) {
  try { if (keuze === 'origineel') localStorage.setItem(SLEUTEL + berichtId, 'origineel'); else localStorage.removeItem(SLEUTEL + berichtId); } catch { /* privémodus */ }
}
export function useMailDonkerKeuze(berichtId: string): [MailDonkerKeuze, (k: MailDonkerKeuze) => void] {
  const [k, zet] = useState<MailDonkerKeuze>(() => leesKeuze(berichtId));
  useEffect(() => { zet(leesKeuze(berichtId)); }, [berichtId]);
  return [k, (n) => { bewaarKeuze(berichtId, n); zet(n); }];
}

/** Systeemoppervlak en tekstkleur uit de thematokens (vallen terug op vaste waarden als het token geen gewone kleur is). */
export function themaKleuren() {
  const cs = getComputedStyle(document.documentElement);
  const lees = (n: string) => cs.getPropertyValue(n).trim();
  return { oppervlak: lees('--panel'), tekst: lees('--text'), koppeling: lees('--accent') };
}
