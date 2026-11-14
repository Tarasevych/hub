// Toestand van het technisch profiel in DIT tabblad (één bron voor de band, het accountmenu en de «?»-uitleg).
// Vraagt /api/owner/tech/status bij het laden (alleen als er waarschijnlijk een sessie is), bij terugkeer naar het tabblad en elke minuut
// zolang de activering loopt. De server is de baas: verloopt de tijd, dan zegt de volgende status «niet actief» en verdwijnt de band.
import { useSyncExternalStore } from 'react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { abonneerZijbalk, zijbalkServerDienst } from '../zijbalk-voorkeuren';
import { serviceFromLocation } from '../canoniek-navigatie';
import { CANONICAL_AUTH_CHANGE } from '../canoniek-gebeurtenissen';
import type { BandKleur, BandPatroon, TechMogelijkheid, TechRol, Tekst } from '../../shared/tech-rollen';

export type TechProfiel = { userId: string; profielId: string; rollen: TechRol[]; maxMinuten: number; maxNu: number; band: { kleur: BandKleur; patroon: BandPatroon }; laatstActief: number | null;
  /** Migratie 0080: openen nieuwe tabbladen in het technische profiel? Standaard false = nieuwe tabbladen zijn gebruikerstabbladen. */
  ervenNieuweTabbladen: boolean };
export type TechActivatie = { id: string; profielId: string; rollen: TechRol[]; mogelijkheden: TechMogelijkheid[]; reden: string; begin: number; eind: number; modus?: 'tijd' | 'tot-uitloggen' | 'tot-verlaten'; herkomst?: 'eigen' | 'geerfd' | 'gedeeld' };
export type TechCatalogus = { rollen: Array<{ id: TechRol; naam: Tekst; kort: Tekst; plafondMinuten: number }>; kleuren: Record<BandKleur, { bg: string; fg: string; naam: Tekst }>; patronen: Record<BandPatroon, Tekst>; duren: number[] };
/** fout: laatste statusaanvraag mislukte door netwerk/5xx — de vorige profiel/activatie blijven staan (HUB-01); null = laatste antwoord was geldig. */
export type TechStatus = { geladen: boolean; profiel: TechProfiel | null; activatie: TechActivatie | null; catalogus: TechCatalogus | null; scheef: number; fout: 'netwerk' | null };

let toestand: TechStatus = { geladen: false, profiel: null, activatie: null, catalogus: null, scheef: 0, fout: null };
const luisteraars = new Set<() => void>();
const zet = (t: Partial<TechStatus>) => { toestand = { ...toestand, ...t }; profielMetaBijwerken(); luisteraars.forEach((f) => f()); };

// ---------------------------------------------------------------- <meta name="mjn-profiel"> (extensie 0.6, contract EXT-06 §1)
// Profiel van DIT tabblad voor de browserextensie: 'technisch' zolang dit tabblad een lopende technische activering heeft, anders
// 'gebruiker'. De bridge van de extensie leest de meta (en volgt wijzigingen) en meldt {op:'account', claim, profiel}. Bijgewerkt bij
// elke statuswijziging (activeren, beëindigen, ander tabblad sloot het profiel) en op het eindtijdstip zelf, zonder herladen.
// Alleen weergave/signaal: de server beslist wat het technische slot mag; een vervalste meta geeft geen rechten.
export type TabProfiel = 'gebruiker' | 'technisch';
export const PROFIEL_META = 'mjn-profiel';
export const profielVan = (t: TechStatus = toestand, nu = Date.now()): TabProfiel => (!!t.activatie && t.activatie.eind > nu + t.scheef ? 'technisch' : 'gebruiker');
/**
 * SEC-002 extensie-04 (12.11.2026): WEET de site al of dit tabblad technisch is? Nee zolang het eerste antwoord van /tech/status er
 * niet is (de pagina laadt, of dit tabblad vraagt nog geen status) en na een netwerk-/serverfout zonder bekende activering. De meta
 * draagt dat als data-zeker="0"; de extensie behandelt zo'n tabblad als «onbekend» en GEEN slot leest of bedient het. Vroeger stond
 * er in die tijd gewoon «gebruiker», waardoor de AI van de privéruimte een technisch tabblad kon lezen tijdens het laden — en na
 * één mislukte statusvraag tot het tabblad opnieuw zichtbaar werd.
 */
export const profielZeker = (t: TechStatus = toestand): boolean => t.geladen && !(t.fout === 'netwerk' && !t.activatie);
export const PROFIEL_ZEKER_ATTR = 'data-zeker';
let profielTimer: ReturnType<typeof setTimeout> | null = null;
export function profielMetaBijwerken(nu = Date.now()): TabProfiel {
  const waarde = profielVan(toestand, nu);
  try {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return waarde;
    let m = document.querySelector(`meta[name="${PROFIEL_META}"]`);
    if (!m && document.head) { m = document.createElement('meta'); m.setAttribute('name', PROFIEL_META); document.head.appendChild(m); }
    // Eerst het voorbehoud, dan de waarde: de brug van de extensie leest beide in één keer (MutationObserver na deze taak).
    const zeker = profielZeker(toestand) ? '1' : '0';
    if (m && m.getAttribute(PROFIEL_ZEKER_ATTR) !== zeker) m.setAttribute(PROFIEL_ZEKER_ATTR, zeker);
    if (m && m.getAttribute('content') !== waarde) m.setAttribute('content', waarde);
    if (profielTimer !== null) clearTimeout(profielTimer);
    profielTimer = null;
    // Op het einde van de activering zelf omzetten (ook als er dan geen nieuwe status komt).
    if (waarde === 'technisch' && toestand.activatie) profielTimer = setTimeout(() => { profielTimer = null; profielMetaBijwerken(); }, Math.max(50, Math.min(toestand.activatie.eind - (Date.now() + toestand.scheef) + 50, 2 ** 31 - 1)));
  } catch { /* geen DOM (server/test): alleen de waarde */ }
  return waarde;
}
profielMetaBijwerken();
export const techToestand = () => toestand;
export const useTech = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => luisteraars.delete(f); }, () => toestand, () => toestand);

export const techBody = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
let statussen = 0;
const neem = (data: any) => (statussen += 1, zet({ geladen: true, profiel: data?.profiel ?? null, activatie: data?.activatie ?? null, catalogus: data?.catalogus ?? toestand.catalogus, scheef: data?.nu ? Number(data.nu) - Date.now() : 0, fout: null }));

/** HUB-01: alleen een DUIDELIJK antwoord van de server (401/403/404: geen sessie of geen recht) wist het profiel; netwerk/5xx houdt de vorige staat. */
export const techFoutReset = (e: unknown): boolean => { const st = Number((e as { status?: number } | null)?.status || 0); return st === 401 || st === 403 || st === 404; };
// SEC-002 extensie-04: na een netwerk-/serverfout de status zelf opnieuw vragen (4 s, 8 s … hoogstens 60 s), ook ZONDER bekende
// activering. Vroeger kwam er pas een nieuwe vraag als het tabblad verborgen en weer getoond werd; tot dan bleef het profiel fout.
let herkansTimer: ReturnType<typeof setTimeout> | null = null;
let herkansMs = 0;
function herkansPlannen(): void {
  if (herkansTimer !== null) return;
  herkansMs = Math.min(60_000, Math.max(4_000, herkansMs * 2));
  herkansTimer = setTimeout(() => { herkansTimer = null; if (sleutel && toestand.fout === 'netwerk') void techVernieuwen(); }, herkansMs);
  (herkansTimer as unknown as { unref?: () => void }).unref?.(); // Node (tests): een wachtende herkansing houdt het proces niet open
}
export async function techVernieuwen(): Promise<void> {
  try { neem((await api.post('/api/owner/tech/status', techBody())).data); herkansMs = 0; }
  catch (e) {
    if (techFoutReset(e)) { zet({ geladen: true, profiel: null, activatie: null, fout: null }); herkansMs = 0; }
    else { zet({ geladen: true, fout: 'netwerk' }); herkansPlannen(); }
  }
}
export async function techActiveren(minuten: number, reden: string) {
  neem((await api.post('/api/owner/tech/activeren', { ...techBody(), minuten, reden })).data);
  // Open activering geldt voor de hele browsersessie: de andere tabbladen (zelfde origin) vragen meteen hun status en erven ze.
  meld({ t: 'aan' });
}
/** «Вийти з технічного профілю»: de server sluit het in ELK tabblad van deze sessie; de andere tabbladen horen het meteen. */
export async function techBeeindigen() { neem((await api.post('/api/owner/tech/beeindigen', techBody())).data); meld({ t: 'uit' }); }
export async function techBand(kleur: BandKleur, patroon: BandPatroon) { neem((await api.post('/api/owner/tech/band', { ...techBody(), kleur, patroon })).data); }
/**
 * «Нові вкладки: технічні / користувацькі» (migratie 0080). Standaard GEBRUIKER: anders is elk nieuw tabblad technisch en mag de
 * AI in de privéruimte van de gebruiker er niets lezen of doen (het technische slot is het enige dat een technisch tabblad raakt).
 */
export async function techErven(aan: boolean) { neem((await api.post('/api/owner/tech/erven', { ...techBody(), aan })).data); }
export const techErfNieuweTabbladen = (t: TechStatus = toestand) => t.profiel?.ervenNieuweTabbladen === true;
export const techActief = (t: TechStatus = toestand) => !!t.activatie && t.activatie.eind > Date.now() + t.scheef;
/** Technische ruimte van dit tabblad, ook net na F5 (ORCH-001, 05.11.2026, oude fout). Zolang de EERSTE status nog laadt, blijft het
 *  tabblad technisch als het dat vóór het herladen was (hint per tabblad: src/gedeelde-voorkeuren.ts → weergaveRuimteNu). Anders
 *  sprongen menu en uiterlijk van een beheerpagina na F5 even naar de privéruimte en terug, en zette CanoniekOmlijsting de hint al
 *  op 'gebruiker'. Alleen het eerste beeld: de server beslist wat de pagina toont. Zonder goedgekeurde sessie (afgemeld, wacht op
 *  goedkeuring, geblokkeerd, fout: dan vraagt dit tabblad geen status en blijft `geladen` false) of zodra de status er is → alleen
 *  techActief. */
export const techRuimteBijLaden = (t: TechStatus, vorigeRuimte: string, zonderSessie: boolean): boolean =>
  techActief(t) || (!t.geladen && !zonderSessie && vorigeRuimte === 'technisch');
export const techMag = (m: TechMogelijkheid, t: TechStatus = toestand) => techActief(t) && !!t.activatie?.mogelijkheden.includes(m);

// Vensters openen vanuit elk scherm (accountmenu, band): één gebeurtenis, de laag (TechLaag) luistert.
export type TechVenster = 'activeren' | 'band' | 'profielen' | 'ondersteuning' | 'terminal' | 'vlaggen' | 'ssh' | 'remote' | 'toegang' | 'uitloggen';
// Integratiefix 27.10 (Technische ruimtes v2): TechLaag laadt pas ná de app; een klik vóór dat moment ging verloren («er gebeurt niets»).
// De laatste vraag wordt 10 s bewaard; TechLaag neemt hem bij het koppelen over (alleen met vlag tech-ruimtes-v2, zie TechLaag).
let opgespaard: { v: TechVenster; t: number } | null = null;
export const openTechVenster = (v: TechVenster) => { opgespaard = { v, t: Date.now() }; window.dispatchEvent(new CustomEvent('mr-tech-venster', { detail: v })); };
export const neemOpgespaardVenster = (nu = Date.now()): TechVenster | null => { const x = opgespaard; opgespaard = null; return x && nu - x.t <= 10_000 ? x.v : null; };

// Wanneer vragen: pas als er een GOEDGEKEURDE accountsessie is voor deze host (zelfde bron als het menu: zijbalkServerDienst) én de
// gebruiker bekend is (accountmenu). Zo geen 401/403 op pagina's zonder sessie of met een account dat nog wacht op goedkeuring.
let gebruiker = '';
let sleutel = '';
function herbeoordeel(): void {
  const dienst = zijbalkServerDienst();
  const k = gebruiker && dienst ? `${gebruiker}|${dienst}` : '';
  if (k === sleutel) return;
  sleutel = k;
  if (k) void techVernieuwen(); else zet({ geladen: true, profiel: null, activatie: null, fout: null });
}
export function techGebruiker(userId: string | null | undefined): void { gebruiker = String(userId || ''); herbeoordeel(); }

// ---------------------------------------------------------------- tabbladen van dezelfde browser (0071)
// BroadcastChannel 'mr-tech' (alleen dezelfde origin; andere subdomeinen merken het bij hun volgende status — zichtbaar worden of de
// minuutcontrole). Berichten bevatten nooit rechten: elk tabblad vraagt zelf de server, die beslist.
//  {t:'aan'}  iemand activeerde → status vragen (een open activering wordt dan geërfd);
//  {t:'uit'}  iemand verliet het profiel → status vragen (de server heeft alles van deze sessie al gesloten);
//  {t:'vraag', n, doel}  een nieuw tabblad, geopend vanuit een technisch tabblad, vraagt een kopie (n = eenmalig nummer uit het kaartje);
//  {t:'gedeeld', doel}  het bron-tabblad heeft gedeeld → het doel vraagt zijn status.
type TechBericht = { t: 'aan' } | { t: 'uit' } | { t: 'vraag'; n: string; doel: string } | { t: 'gedeeld'; doel: string };
export const TECH_KANAAL = 'mr-tech';
/** Kaartje in localStorage: «het volgende tabblad dat binnen 15 s opent, komt van een technisch tabblad». */
export const ERF_SLEUTEL = 'mr-tech-erf';
export const ERF_GELDIG_MS = 15_000;
let kanaal: BroadcastChannel | null = null;
const openKaartjes = new Map<string, number>();
function meld(b: TechBericht): void { try { kanaal?.postMessage(b); } catch { /* geen BroadcastChannel: de minuutcontrole vangt het op */ } }

/** Bron-tabblad: noteer dat het volgende nieuwe tabblad (link in nieuw tabblad, middelklik, window.open) vanuit hier komt. */
export function techKaartjeVoorNieuwTabblad(nu = Date.now()): string | null {
  if (!techActief()) return null;
  const n = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');
  openKaartjes.set(n, nu + ERF_GELDIG_MS);
  try { localStorage.setItem(ERF_SLEUTEL, JSON.stringify({ n, tot: nu + ERF_GELDIG_MS })); } catch { /* opslag geblokkeerd: dan geen delen */ }
  return n;
}
/** Nieuw tabblad: geldig kaartje lezen én meteen weggooien (eenmalig). */
export function leesKaartje(nu = Date.now(), opslag: Pick<Storage, 'getItem' | 'removeItem'> = localStorage): string | null {
  try {
    const k = JSON.parse(opslag.getItem(ERF_SLEUTEL) || 'null') as { n?: string; tot?: number } | null;
    if (!k?.n || !(Number(k.tot) > nu)) return null;
    opslag.removeItem(ERF_SLEUTEL);
    return String(k.n);
  } catch { return null; }
}
async function opBericht(b: TechBericht): Promise<void> {
  if (!b || typeof b !== 'object' || !sleutel) return;
  if (b.t === 'aan' || b.t === 'uit') { await techVernieuwen(); return; }
  if (b.t === 'gedeeld') { if (b.doel === ecosystemTabContext()) await techVernieuwen(); return; }
  if (b.t === 'vraag') {
    const tot = openKaartjes.get(b.n);
    if (!tot) return; // niet ons kaartje
    openKaartjes.delete(b.n);
    if (tot < Date.now() || !techActief() || !/^[a-f0-9]{48}$/.test(String(b.doel))) return;
    try { await api.post('/api/owner/tech/delen', { ...techBody(), doel: b.doel }); meld({ t: 'gedeeld', doel: b.doel }); } catch { /* server weigert (al actief, andere sessie): niets */ }
  }
}
const NIEUW_TABBLAD = (e: MouseEvent) => {
  if (!techActief()) return;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || a.origin !== location.origin) return;
  if (e.type === 'auxclick' ? e.button === 1 : (a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey)) techKaartjeVoorNieuwTabblad();
};

let gestart = false;
export function startTech(): void {
  if (gestart) return;
  gestart = true;
  const kaartje = leesKaartje();
  try {
    kanaal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(TECH_KANAAL) : null;
    if (kanaal) kanaal.onmessage = (e) => { void opBericht(e.data as TechBericht); };
  } catch { kanaal = null; }
  document.addEventListener('click', NIEUW_TABBLAD, true);
  document.addEventListener('auxclick', NIEUW_TABBLAD, true);
  // Programmatisch openen (window.open) vanuit een technisch tabblad telt ook als «vanuit dit tabblad».
  const open = window.open?.bind(window);
  if (open) window.open = ((...args: Parameters<typeof window.open>) => { techKaartjeVoorNieuwTabblad(); return open(...args); }) as typeof window.open;
  abonneerZijbalk(herbeoordeel);
  herbeoordeel();
  // Geopend vanuit een technisch tabblad: na de eerste status (die een open activering al erft) om een kopie vragen.
  if (kaartje) {
    const vraag = () => { if (!techActief()) meld({ t: 'vraag', n: kaartje, doel: ecosystemTabContext() }); };
    let pogingen = 0;
    const wacht = window.setInterval(() => { pogingen += 1; if ((sleutel && statussen > 0) || pogingen > 60) { window.clearInterval(wacht); if (sleutel && statussen > 0) vraag(); } }, 150);
  }
  // Uitloggen / account wisselen in DIT tabblad: de server sloot de activeringen van de sessie; de andere tabbladen meteen laten kijken.
  window.addEventListener(CANONICAL_AUTH_CHANGE, () => {
    if (!toestand.activatie) return;
    void techVernieuwen().then(() => { if (!toestand.activatie) meld({ t: 'uit' }); });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && sleutel) void techVernieuwen(); });
  window.setInterval(() => { if (!document.hidden && sleutel && toestand.activatie) void techVernieuwen(); }, 60_000);
}
