// Toestand van het technisch profiel in DIT tabblad (één bron voor de band, het accountmenu en de «?»-uitleg).
// Vraagt /api/owner/tech/status bij het laden (alleen als er waarschijnlijk een sessie is), bij terugkeer naar het tabblad en elke minuut
// zolang de activering loopt. De server is de baas: verloopt de tijd, dan zegt de volgende status «niet actief» en verdwijnt de band.
import { useSyncExternalStore } from 'react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { abonneerZijbalk, zijbalkServerDienst } from '../zijbalk-voorkeuren';
import { serviceFromLocation } from '../canonical-navigation';
import type { BandKleur, BandPatroon, TechMogelijkheid, TechRol, Tekst } from '../../shared/tech-rollen';

export type TechProfiel = { userId: string; profielId: string; rollen: TechRol[]; maxMinuten: number; maxNu: number; band: { kleur: BandKleur; patroon: BandPatroon }; laatstActief: number | null };
export type TechActivatie = { id: string; profielId: string; rollen: TechRol[]; mogelijkheden: TechMogelijkheid[]; reden: string; begin: number; eind: number };
export type TechCatalogus = { rollen: Array<{ id: TechRol; naam: Tekst; kort: Tekst; plafondMinuten: number }>; kleuren: Record<BandKleur, { bg: string; fg: string; naam: Tekst }>; patronen: Record<BandPatroon, Tekst>; duren: number[] };
export type TechStatus = { geladen: boolean; profiel: TechProfiel | null; activatie: TechActivatie | null; catalogus: TechCatalogus | null; scheef: number };

let toestand: TechStatus = { geladen: false, profiel: null, activatie: null, catalogus: null, scheef: 0 };
const luisteraars = new Set<() => void>();
const zet = (t: Partial<TechStatus>) => { toestand = { ...toestand, ...t }; luisteraars.forEach((f) => f()); };
export const techToestand = () => toestand;
export const useTech = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => luisteraars.delete(f); }, () => toestand, () => toestand);

export const techBody = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const neem = (data: any) => zet({ geladen: true, profiel: data?.profiel ?? null, activatie: data?.activatie ?? null, catalogus: data?.catalogus ?? toestand.catalogus, scheef: data?.nu ? Number(data.nu) - Date.now() : 0 });

export async function techVernieuwen(): Promise<void> {
  try { neem((await api.post('/api/owner/tech/status', techBody())).data); }
  catch { zet({ geladen: true, profiel: null, activatie: null }); }
}
export async function techActiveren(minuten: number, reden: string) { neem((await api.post('/api/owner/tech/activeren', { ...techBody(), minuten, reden })).data); }
export async function techBeeindigen() { neem((await api.post('/api/owner/tech/beeindigen', techBody())).data); }
export async function techBand(kleur: BandKleur, patroon: BandPatroon) { neem((await api.post('/api/owner/tech/band', { ...techBody(), kleur, patroon })).data); }
export const techActief = (t: TechStatus = toestand) => !!t.activatie && t.activatie.eind > Date.now() + t.scheef;
export const techMag = (m: TechMogelijkheid, t: TechStatus = toestand) => techActief(t) && !!t.activatie?.mogelijkheden.includes(m);

// Vensters openen vanuit elk scherm (accountmenu, band): één gebeurtenis, de laag (TechLaag) luistert.
export type TechVenster = 'activeren' | 'band' | 'profielen' | 'ondersteuning' | 'terminal';
export const openTechVenster = (v: TechVenster) => window.dispatchEvent(new CustomEvent('mr-tech-venster', { detail: v }));

// Wanneer vragen: pas als er een GOEDGEKEURDE accountsessie is voor deze host (zelfde bron als het menu: zijbalkServerDienst) én de
// gebruiker bekend is (accountmenu). Zo geen 401/403 op pagina's zonder sessie of met een account dat nog wacht op goedkeuring.
let gebruiker = '';
let sleutel = '';
function herbeoordeel(): void {
  const dienst = zijbalkServerDienst();
  const k = gebruiker && dienst ? `${gebruiker}|${dienst}` : '';
  if (k === sleutel) return;
  sleutel = k;
  if (k) void techVernieuwen(); else zet({ geladen: true, profiel: null, activatie: null });
}
export function techGebruiker(userId: string | null | undefined): void { gebruiker = String(userId || ''); herbeoordeel(); }

let gestart = false;
export function startTech(): void {
  if (gestart) return;
  gestart = true;
  abonneerZijbalk(herbeoordeel);
  herbeoordeel();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && sleutel) void techVernieuwen(); });
  window.setInterval(() => { if (!document.hidden && sleutel && toestand.activatie) void techVernieuwen(); }, 60_000);
}
