// «Простий / розширений» режим van dit account (zie shared/weergave.ts). De server is de bron; localStorage is alleen een kopie zodat
// de juiste tabbladen meteen goed staan bij het laden (geen flikkeren). Zonder kopie en vóór het antwoord: alles tonen (niets verstoppen
// wat iemand misschien zoekt).
import { useSyncExternalStore } from 'react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { serviceFromLocation } from '../canoniek-navigatie';
import { abonneerZijbalk, zijbalkScopeNu, zijbalkServerDienst } from '../zijbalk-voorkeuren';
import { isModus, type Modus } from '../../shared/weergave';

// Audit 19.10.2026 (punt 2): de kopie hangt aan het ACCOUNT ('mr-weergave-modus-v1:<scope>'), net als de zijbalkcache. Anders zag
// een tweede account in dezelfde browser de gekozen weergave van de eerste tot het antwoord van de server kwam.
const BASIS = 'mr-weergave-modus-v1';
const SLEUTEL = () => `${BASIS}:${zijbalkScopeNu() || 'anon'}`;
const leesKopie = (): Modus | null => { try { const v = localStorage.getItem(SLEUTEL()); return isModus(v) ? v : null; } catch { return null; } };
const schrijfKopie = (m: Modus | null) => { try { if (m) localStorage.setItem(SLEUTEL(), m); else localStorage.removeItem(SLEUTEL()); } catch { /* opslag geblokkeerd: alleen geen kopie */ } };
// De oude sleutel zonder account is van niemand: weg (de server heeft de echte stand).
try { if (localStorage.getItem(BASIS) !== null) localStorage.removeItem(BASIS); } catch { /* opslag geblokkeerd */ }

export type WeergaveToestand = { geladen: boolean; modus: Modus | null; gekozen: boolean; standaard: Modus | null };
let toestand: WeergaveToestand = { geladen: false, modus: leesKopie(), gekozen: false, standaard: null };
const luisteraars = new Set<() => void>();
const zet = (t: Partial<WeergaveToestand>) => { toestand = { ...toestand, ...t }; luisteraars.forEach((f) => f()); };
export const useWeergave = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => luisteraars.delete(f); }, () => toestand, () => toestand);
/** De modus die nu geldt voor wat zichtbaar is; null = nog onbekend (dan alles tonen). */
export const huidigeModus = (t: WeergaveToestand = toestand): Modus | null => t.modus;

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const neem = (d: any) => { if (!isModus(d?.modus)) return; schrijfKopie(d.modus); zet({ geladen: true, modus: d.modus, gekozen: !!d.gekozen, standaard: isModus(d.standaard) ? d.standaard : null }); };

export async function weergaveVernieuwen(): Promise<void> {
  try { neem((await api.post('/api/owner/weergave', body())).data); } catch { zet({ geladen: true }); }
}
export async function modusKiezen(m: Modus): Promise<void> {
  const vorige = toestand.modus;
  zet({ modus: m }); // meteen tonen; bij een fout terugzetten
  try { neem((await api.post('/api/owner/weergave/zet', { ...body(), modus: m })).data); } catch (e) { zet({ modus: vorige }); throw e; }
}

// Vragen pas bij een goedgekeurde accountsessie voor deze host (zelfde bron als het menu) en een bekende gebruiker; afgemeld → kopie weg.
let gebruiker = '';
let sleutel = '';
let geabonneerd = false;
function herbeoordeel(): void {
  const dienst = zijbalkServerDienst();
  const k = gebruiker && dienst ? `${gebruiker}|${dienst}` : '';
  if (k === sleutel) return;
  const wasAangemeld = !!sleutel;
  sleutel = k;
  if (k) { const kopie = leesKopie(); if (kopie !== toestand.modus) zet({ modus: kopie }); void weergaveVernieuwen(); }
  else if (wasAangemeld || !gebruiker) { if (!gebruiker) schrijfKopie(null); zet({ geladen: true, modus: gebruiker ? toestand.modus : null, gekozen: false, standaard: null }); }
}
/** Aangeroepen door het accountmenu zodra de aangemelde gebruiker bekend is (lege id = afgemeld). */
export function weergaveGebruiker(userId: string | null | undefined): void {
  if (!geabonneerd) { geabonneerd = true; abonneerZijbalk(herbeoordeel); }
  gebruiker = String(userId || '');
  herbeoordeel();
}
