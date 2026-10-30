// Menu v2 fase B1: vlotte overgangen.
//  • Voortgangsbalk bovenaan in de kleur van het DOEL-onderdeel (ACCENT_KLEUREN, licht/donker). Start bij elke navigatie:
//    – via de Navigation API (`navigate`-gebeurtenis) voor ALLE navigaties: links, location.assign, history.pushState, terug/vooruit;
//    – zonder Navigation API: vanuit het menu (`voortgangStart`).
//    Andere host → balk loopt tot de pagina wisselt (pagehide). Zelfde host → klaar zodra er geen API-verzoeken meer lopen.
//    Pas zichtbaar na 120 ms (geen geflits bij snelle wissels); maximaal 12 s.
//  • Zachte overgang binnen een onderdeel (View Transitions, alleen het werkgebied; uit bij «minder beweging» of in de instellingen).
//  • Vooruitladen van een ander onderdeel bij aanwijzen: een onzichtbare <a data-tsv-vooruit> die door de Speculation Rules uit de
//    header (`/speculatie.json`) wordt opgepikt: «prefetch» (standaard), «prerender» alleen als dat in de instellingen aan staat.
//    Alleen https-URL's op *.tarasevych.com; nooit met tokens/codes in de URL; uit bij «databesparing»/2G.
import { flushSync } from 'react-dom';
import { ACCENT_KLEUREN, itemAccent } from '../shared/menu-model';
import { apiLopend, opApiActiviteit } from './platform/client';
import { zijbalkVoorkeuren } from './zijbalk-voorkeuren';
import { prefetchMode } from './zichtbaar-voorladen';
import { dienstVanUrl, vooruitUrl } from './navigatie-urls';
export { dienstVanUrl, vooruitUrl };

const instellingen = () => zijbalkVoorkeuren().snelheid;
const donker = () => { const c = document.documentElement.classList; return c.contains('theme-dark') || c.contains('theme-plum-dark'); };
const minderBeweging = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Kleur van de balk: hoofdtint van het onderdeel in het huidige thema; onbekend → accent van de site. */
export function voortgangKleur(dienst: string): string {
  const a = dienst ? itemAccent(`svc:${dienst}`) : undefined;
  if (!a) return '';
  return ACCENT_KLEUREN[a][donker() ? 'donker' : 'licht'].hoofd;
}

// ------------------------------------------------------------------------------------------------ voortgangsbalk
let balk: HTMLDivElement | null = null;
let staat: { extern: boolean; start: number; breedte: number; zichtbaar: boolean; generatie: number } | null = null;
let generatie = 0, trickle: number | undefined, toon: number | undefined, stilSinds = 0, uitApi: (() => void) | undefined, maxTimer: number | undefined;

function zorgBalk() {
  if (balk && balk.isConnected) return balk;
  const bestaand = document.getElementById('tsv-voortgang');
  if (bestaand instanceof HTMLDivElement) { balk = bestaand; if (!balk.firstElementChild) balk.appendChild(document.createElement('i')); return balk; }
  balk = document.createElement('div');
  balk.id = 'tsv-voortgang'; balk.setAttribute('aria-hidden', 'true'); balk.dataset.staat = 'uit';
  balk.appendChild(document.createElement('i'));
  document.body.appendChild(balk);
  return balk;
}
function zetBreedte(w: number) { if (!staat) return; staat.breedte = w; if (balk) balk.style.setProperty('--tsv-voortgang', `${w.toFixed(1)}%`); }
function opruimen() { window.clearInterval(trickle); window.clearTimeout(toon); window.clearTimeout(maxTimer); uitApi?.(); uitApi = undefined; trickle = toon = maxTimer = undefined; }

/** Start (of herstart) de balk. `dienst` bepaalt de kleur; `extern` = de pagina gaat weg (andere host). */
export function voortgangStart(dienst: string, opties: { extern?: boolean; vanaf?: number; direct?: boolean } = {}) {
  if (typeof document === 'undefined' || !instellingen().voortgang) return;
  // Wissel naar een ander onderdeel loopt eerst via de sessie-overdracht (API) en daarna via navigate: niet opnieuw starten.
  if (staat?.extern && opties.extern && balk?.dataset.dienst === (dienst || '')) return;
  opruimen();
  const g = ++generatie;
  const b = zorgBalk();
  const kleur = voortgangKleur(dienst);
  if (kleur) b.style.setProperty('--tsv-voortgang-kleur', kleur); else b.style.removeProperty('--tsv-voortgang-kleur');
  b.dataset.dienst = dienst || '';
  staat = { extern: !!opties.extern, start: Date.now(), breedte: 0, zichtbaar: false, generatie: g };
  if (opties.direct) { staat.zichtbaar = true; b.dataset.staat = 'bezig'; } else b.dataset.staat = 'wacht';
  zetBreedte(opties.vanaf ?? 6);
  if (opties.extern) overdrachtSchrijven(dienst, kleur);
  if (!opties.direct) toon = window.setTimeout(() => { if (staat?.generatie !== g) return; staat.zichtbaar = true; b.dataset.staat = 'bezig'; }, 120);
  trickle = window.setInterval(() => { if (!staat || staat.generatie !== g) return; const doel = staat.extern ? 92 : 85; zetBreedte(staat.breedte + (doel - staat.breedte) * (minderBeweging() ? 0.25 : 0.07)); }, 180);
  if (!staat.extern) {
    stilSinds = apiLopend() === 0 ? Date.now() : 0;
    uitApi = opApiActiviteit((n) => { stilSinds = n === 0 ? Date.now() : 0; });
    const kijk = () => { if (!staat || staat.generatie !== g) return; const lang = Date.now() - staat.start; if (lang >= 160 && stilSinds && Date.now() - stilSinds >= 220) { voortgangKlaar(); return; } window.setTimeout(kijk, 60); };
    window.setTimeout(kijk, 60);
  }
  maxTimer = window.setTimeout(() => { if (staat?.generatie === g) voortgangKlaar(); }, 12000);
}
/** Klaar: naar 100 % en vervagen (alleen als hij zichtbaar was; anders stil weg). */
export function voortgangKlaar() {
  if (!staat || !balk) return;
  const b = balk, wasZichtbaar = staat.zichtbaar, g = staat.generatie;
  opruimen(); staat = null;
  if (!wasZichtbaar) { b.dataset.staat = 'uit'; return; }
  b.style.setProperty('--tsv-voortgang', '100%'); b.dataset.staat = 'klaar';
  window.setTimeout(() => { if (generatie === g) b.dataset.staat = 'uit'; }, 420);
}
export const voortgangStaat = () => (balk?.dataset.staat || 'uit');

// ------------------------------------------------------------------------------------------------ overdracht tussen subdomeinen
// Naar een ander subdomein = een nieuwe pagina: de balk zou verdwijnen en de pagina leek te «vallen». Daarom gaat de balk mee:
// een kort koekje (20 s, alleen dienst + kleur + tijd, niets persoonlijks) voor *.tarasevych.com; het opstartscript van de nieuwe
// pagina (index.html, canonical-boot) tekent de balk meteen in dezelfde kleur, en de app maakt hem af zodra ze klaar is.
const OVERDRACHT = 'tsv_voortgang';
function overdrachtSchrijven(dienst: string, kleur: string) {
  if (!/(^|\.)tarasevych\.com$/.test(location.hostname)) return;
  const waarde = encodeURIComponent(JSON.stringify({ d: dienst || '', k: /^#[0-9a-f]{6}$/i.test(kleur) ? kleur : '', t: Date.now() }));
  document.cookie = `${OVERDRACHT}=${waarde}; Path=/; Max-Age=20; SameSite=Lax; Secure; Domain=.tarasevych.com`;
}
/** Door de app bij het starten: een door het opstartscript getekende balk overnemen en afmaken als de pagina klaar is. */
export function voortgangOvernemen() {
  const el = document.getElementById('tsv-voortgang');
  if (!(el instanceof HTMLDivElement) || el.dataset.overdracht !== '1') return false;
  delete el.dataset.overdracht;
  el.dataset.overgenomen = '1';
  balk = el;
  voortgangStart(el.dataset.dienst || '', { vanaf: 70, direct: true });
  return true;
}

// ------------------------------------------------------------------------------------------------ overgang binnen een onderdeel
type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
/** Voert `doe` uit binnen een View Transition (werkgebied vervaagt kort) als dat kan en mag; anders direct. */
export function metOvergang(doe: () => void) {
  const d = document as VTDocument;
  if (!instellingen().overgangen || minderBeweging() || typeof d.startViewTransition !== 'function' || document.visibilityState !== 'visible') { doe(); return; }
  try { d.startViewTransition(() => { flushSync(doe); }); } catch { doe(); }
}

// ------------------------------------------------------------------------------------------------ vooruitladen (Speculation Rules)
const ondersteunt = () => { try { return typeof HTMLScriptElement !== 'undefined' && typeof (HTMLScriptElement as unknown as { supports?: (t: string) => boolean }).supports === 'function' && (HTMLScriptElement as unknown as { supports: (t: string) => boolean }).supports('speculationrules'); } catch { return false; } };
const MAX_VOORUIT = 4;
/** Bij aanwijzen/focus van een menu-item naar een ander onderdeel: alvast ophalen (of voorbereiden). */
export function vooruitladen(href: string) {
  const s = instellingen();
  if (!s.vooruitladen || prefetchMode() === 'off' || typeof document === 'undefined') return '';
  const url = vooruitUrl(href); if (!url) return '';
  const soort = s.prerender ? 'prerender' : 'prefetch';
  let doos = document.getElementById('tsv-vooruit');
  if (!doos) { doos = document.createElement('div'); doos.id = 'tsv-vooruit'; doos.setAttribute('aria-hidden', 'true'); document.body.appendChild(doos); }
  const al = Array.from(doos.querySelectorAll<HTMLAnchorElement>('a[data-tsv-vooruit]')).find((a) => a.href === url);
  if (al) { if (al.dataset.tsvVooruit !== soort) al.dataset.tsvVooruit = soort; return soort; }
  if (!ondersteunt()) { // terugval: gewone prefetch van het HTML-document (geen prerender)
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = url; l.dataset.tsvVooruit = 'link'; document.head.appendChild(l); return 'link';
  }
  const a = document.createElement('a'); a.href = url; a.dataset.tsvVooruit = soort; a.tabIndex = -1; a.textContent = '';
  doos.appendChild(a);
  while (doos.children.length > MAX_VOORUIT) doos.firstElementChild?.remove();
  return soort;
}

// ------------------------------------------------------------------------------------------------ installatie
type NavEvent = Event & { navigationType?: string; destination?: { url: string; sameDocument?: boolean }; hashChange?: boolean; downloadRequest?: string | null };
let geinstalleerd = false;
export const heeftNavigationApi = () => typeof window !== 'undefined' && 'navigation' in window;
export function installeerNavigatieSnel() {
  if (geinstalleerd || typeof window === 'undefined') return; geinstalleerd = true;
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('navigate', (ev) => {
    const e = ev as NavEvent; const url = e.destination?.url || '';
    if (!url || e.hashChange || e.downloadRequest || e.navigationType === 'replace' || e.navigationType === 'reload') return;
    let doel: URL; try { doel = new URL(url); } catch { return; }
    const extern = doel.origin !== location.origin;
    if (!extern && doel.pathname === location.pathname) return; // alleen query/hash: geen echte paginawissel
    const dienst = dienstVanUrl(url); if (!dienst && extern) return; // externe sites (Google enz.): geen balk
    voortgangStart(dienst, { extern });
  });
  voortgangOvernemen();
  // Terug via bfcache of een geannuleerde navigatie: balk weg.
  window.addEventListener('pageshow', () => { if (staat) { opruimen(); staat = null; if (balk) balk.dataset.staat = 'uit'; } });
}
