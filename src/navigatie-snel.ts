// Menu v2 fase B1 + UPD-012: vlotte overgangen en eerlijke voortgangsbalk.
//  • Voortgangsbalk bovenaan in de kleur van het DOEL-onderdeel (ACCENT_KLEUREN, licht/donker). Start bij elke navigatie
//    en bij echte netwerkverzoeken (`abonneerLaadStand`):
//    – via de Navigation API (`navigate`-gebeurtenis) voor ALLE navigaties: links, location.assign, history.pushState, terug/vooruit;
//    – zonder Navigation API: vanuit het menu (`voortgangStart`);
//    – bij lopende API-verzoeken op dezelfde pagina met het echte aandeel voltooide verzoeken en zachte achtergrondstand (`data-achtergrond='1'`).
//    Andere host → balk loopt tot de pagina wisselt (pagehide). Zelfde host → klaar zodra er geen verzoeken meer lopen.
//    Direct zichtbaar binnen ≤ 20 ms (geen blinde pauze van 120 ms); maximaal 12 s.
//  • Zachte overgang binnen een onderdeel (View Transitions, alleen het werkgebied; uit bij «minder beweging» of in de instellingen).
//  • Vooruitladen van een ander onderdeel bij aanwijzen: een onzichtbare <a data-tsv-vooruit> die door de Speculation Rules uit de
//    header (`/speculatie.json`) wordt opgepikt: «prefetch» (standaard), «prerender» alleen als dat in de instellingen aan staat.
//    Alleen https-URL's op *.tarasevych.com; nooit met tokens/codes in de URL; uit in de spaarzame modus of bij databesparing/2G.
import { flushSync } from 'react-dom';
import { ACCENT_KLEUREN, itemAccent } from '../shared/menu-model';
import { apiLopend, opApiActiviteit } from './platform/client';
import {
  abonneerLaadStand,
  bepaalLaadProfiel,
  focusOpKlik,
  huidigeLaadStand,
  type LaadStand,
} from './platform/adaptief-laden';
import { zijbalkVoorkeuren } from './zijbalk-voorkeuren';
import { prefetchMode } from './zichtbaar-voorladen';
import { dienstVanUrl, vooruitUrl } from './navigatie-urls';
export { dienstVanUrl, vooruitUrl };

const instellingen = () => zijbalkVoorkeuren().snelheid;
const donker = () => { const c = document.documentElement.classList; return c.contains('theme-dark') || c.contains('theme-plum-dark'); };
const minderBeweging = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOON_VERTRAGING_MS = 20;

/** Kleur van de balk: hoofdtint van het onderdeel in het huidige thema; onbekend → accent van de site. */
export function voortgangKleur(dienst: string): string {
  const a = dienst ? itemAccent(`svc:${dienst}`) : undefined;
  if (!a) return '';
  return ACCENT_KLEUREN[a][donker() ? 'donker' : 'licht'].hoofd;
}

// ------------------------------------------------------------------------------------------------ voortgangsbalk
let balk: HTMLDivElement | null = null;
let staat: {
  extern: boolean;
  achtergrond: boolean;
  verzoekGestart: boolean;
  start: number;
  breedte: number;
  zichtbaar: boolean;
  generatie: number;
} | null = null;
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
function zetAchtergrondStand(aan: boolean) {
  if (!balk) return;
  if (aan) balk.dataset.achtergrond = '1';
  else delete balk.dataset.achtergrond;
}
function werkelijkeBreedteUitStand(stand: LaadStand, huidig: number): number {
  if (stand.totaalInBatch <= 0) return huidig;
  const verhouding = Math.max(0, Math.min(1, stand.voltooidInBatch / stand.totaalInBatch));
  const doel = Math.min(94, 14 + verhouding * 78);
  return Math.max(huidig, doel);
}
function opruimen() { window.clearInterval(trickle); window.clearTimeout(toon); window.clearTimeout(maxTimer); uitApi?.(); uitApi = undefined; trickle = toon = maxTimer = undefined; }

/** Start (of herstart) de balk. `dienst` bepaalt de kleur; `extern` = de pagina gaat weg (andere host). */
export function voortgangStart(
  dienst: string,
  opties: { extern?: boolean; vanaf?: number; direct?: boolean; achtergrond?: boolean; verzoekGestart?: boolean } = {},
) {
  if (typeof document === 'undefined' || !instellingen().voortgang) return;
  // Wissel naar een ander onderdeel loopt eerst via de sessie-overdracht (API) en daarna via navigate: niet opnieuw starten.
  if (staat?.extern && opties.extern && balk?.dataset.dienst === (dienst || '')) return;
  if (!opties.achtergrond && !opties.verzoekGestart) {
    focusOpKlik(dienst || 'navigatie');
  }
  opruimen();
  const g = ++generatie;
  const b = zorgBalk();
  const kleur = voortgangKleur(dienst);
  if (kleur) b.style.setProperty('--tsv-voortgang-kleur', kleur); else b.style.removeProperty('--tsv-voortgang-kleur');
  b.dataset.dienst = dienst || '';
  const isAchtergrond = Boolean(opties.achtergrond && !opties.extern);
  staat = {
    extern: !!opties.extern,
    achtergrond: isAchtergrond,
    verzoekGestart: !!opties.verzoekGestart,
    start: Date.now(),
    breedte: 0,
    zichtbaar: false,
    generatie: g,
  };
  zetAchtergrondStand(isAchtergrond);
  if (opties.direct) { staat.zichtbaar = true; b.dataset.staat = 'bezig'; } else b.dataset.staat = 'wacht';
  const beginStand = huidigeLaadStand();
  zetBreedte(werkelijkeBreedteUitStand(beginStand, opties.vanaf ?? (isAchtergrond ? 10 : 12)));
  if (opties.extern) overdrachtSchrijven(dienst, kleur);
  if (!opties.direct) {
    toon = window.setTimeout(() => {
      if (staat?.generatie !== g) return;
      staat.zichtbaar = true;
      b.dataset.staat = 'bezig';
    }, TOON_VERTRAGING_MS);
  }
  trickle = window.setInterval(() => {
    if (!staat || staat.generatie !== g) return;
    const stand = huidigeLaadStand();
    const echt = werkelijkeBreedteUitStand(stand, staat.breedte);
    const bovengrens = staat.extern ? 92 : staat.achtergrond ? 78 : 88;
    const zacht = echt + Math.max(0, bovengrens - echt) * (minderBeweging() ? 0.2 : 0.055);
    zetBreedte(Math.min(94, zacht));
  }, 160);
  if (!staat.extern) {
    const heeftLopend = () => apiLopend() > 0 || huidigeLaadStand().actief > 0 || huidigeLaadStand().achtergrondActief > 0;
    stilSinds = heeftLopend() ? 0 : Date.now();
    uitApi = opApiActiviteit((n) => { stilSinds = n === 0 && !heeftLopend() ? Date.now() : 0; });
    const kijk = () => {
      if (!staat || staat.generatie !== g) return;
      if (heeftLopend()) {
        stilSinds = 0;
      } else if (!stilSinds) {
        stilSinds = Date.now();
      }
      const lang = Date.now() - staat.start;
      const minDuur = staat.verzoekGestart ? 80 : 140;
      const stilteGrens = staat.verzoekGestart ? 120 : 200;
      if (lang >= minDuur && stilSinds && Date.now() - stilSinds >= stilteGrens) {
        voortgangKlaar();
        return;
      }
      window.setTimeout(kijk, 50);
    };
    window.setTimeout(kijk, 50);
  }
  maxTimer = window.setTimeout(() => { if (staat?.generatie === g) voortgangKlaar(); }, 12000);
}
/** Klaar: naar 100 % en vervagen (alleen als hij zichtbaar was; anders stil weg). */
export function voortgangKlaar() {
  if (!staat || !balk) return;
  const b = balk, wasZichtbaar = staat.zichtbaar, g = staat.generatie;
  opruimen(); staat = null;
  delete b.dataset.achtergrond;
  if (!wasZichtbaar) { b.dataset.staat = 'uit'; return; }
  b.style.setProperty('--tsv-voortgang', '100%'); b.dataset.staat = 'klaar';
  window.setTimeout(() => { if (generatie === g) b.dataset.staat = 'uit'; }, 420);
}
export const voortgangStaat = () => (balk?.dataset.staat || 'uit');

function verwerkLaadStand(stand: LaadStand) {
  if (typeof document === 'undefined' || !instellingen().voortgang) return;
  const totaalActief = stand.actief + stand.achtergrondActief;
  if (totaalActief > 0) {
    stilSinds = 0;
    if (!staat) {
      voortgangStart(dienstVanUrl(location.href), {
        extern: false,
        achtergrond: stand.alleenAchtergrond,
        verzoekGestart: true,
      });
      return;
    }
    if (!staat.extern) {
      if (stand.actief > 0 && staat.achtergrond) {
        staat.achtergrond = false;
        zetAchtergrondStand(false);
      } else if (stand.alleenAchtergrond && staat.verzoekGestart && !staat.achtergrond) {
        staat.achtergrond = true;
        zetAchtergrondStand(true);
      }
      zetBreedte(werkelijkeBreedteUitStand(stand, staat.breedte));
    }
    return;
  }
  if (staat && !staat.extern) {
    zetBreedte(Math.max(staat.breedte, 92));
    if (!stilSinds) stilSinds = Date.now();
  }
}

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
const MAX_VOORUIT = 10;
const voorverbonden = new Set<string>();
/** Bij aanwijzen/focus van een menu-item naar een ander onderdeel: alvast ophalen (of voorbereiden). */
export function vooruitladen(href: string) {
  const s = instellingen();
  const profiel = bepaalLaadProfiel();
  if (!s.vooruitladen || !profiel.vooruitladenToegestaan || prefetchMode() === 'off' || typeof document === 'undefined') return '';
  const url = vooruitUrl(href); if (!url) return '';
  try {
    const u = new URL(url);
    if (u.origin !== location.origin && !voorverbonden.has(u.origin)) {
      voorverbonden.add(u.origin);
      const pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = u.origin;
      pre.dataset.tsvVooruit = 'preconnect';
      document.head.appendChild(pre);
    }
  } catch { /* ongeldige URL */ }
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
  const limiet = profiel.modus === 'snel' ? MAX_VOORUIT : Math.min(MAX_VOORUIT, Math.max(1, profiel.vooruitladenMax));
  while (doos.children.length > limiet) doos.firstElementChild?.remove();
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
  abonneerLaadStand(verwerkLaadStand);
  voortgangOvernemen();
  // Terug via bfcache of een geannuleerde navigatie: balk weg.
  window.addEventListener('pageshow', () => {
    if (staat) {
      opruimen();
      staat = null;
      if (balk) {
        delete balk.dataset.achtergrond;
        balk.dataset.staat = 'uit';
      }
    }
  });
}
