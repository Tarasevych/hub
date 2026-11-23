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

/** Двомовні назви розділів для спливної капсули активного завантаження сторінки (`uk` / `nl`). */
export const DIENST_LAAD_NAAM: Readonly<Record<string, { readonly uk: string; readonly nl: string }>> = {
  hub: { uk: 'Мій простір', nl: 'Mijn ruimte' },
  ai: { uk: 'ШІ', nl: 'AI' },
  mail: { uk: 'Пошта', nl: 'E-mail' },
  cloud: { uk: 'Хмарне сховище', nl: 'Cloudopslag' },
  github: { uk: 'GitHub', nl: 'GitHub' },
  crm: { uk: 'Клієнтські взаємини', nl: 'Klantrelatiebeheer' },
  huis: { uk: 'Розумний будинок', nl: 'Slim huis' },
  mcp: { uk: 'Міст ШІ → сайт', nl: 'Brug AI → site' },
  tasks: { uk: 'Завдання', nl: 'Taken' },
  calendar: { uk: 'Календар', nl: 'Agenda' },
  notes: { uk: 'Нотатки', nl: 'Notities' },
  identity: { uk: 'Налаштування', nl: 'Instellingen' },
  api: { uk: 'API та інтеграції', nl: 'API en integraties' },
  admin: { uk: 'Адміністрування', nl: 'Beheer' },
  social: { uk: 'Соціальні мережі', nl: 'Sociale netwerken' },
};

/** Формує зрозумілий напис спливної капсули завантаження мовою сайту (`uk` або `nl`). */
export function laadKapselTekst(dienst: string, lang?: string): string {
  const docTaal = typeof document !== 'undefined' ? document.documentElement?.lang : 'uk';
  const taal = (lang || docTaal) === 'nl' ? 'nl' : 'uk';
  const item = dienst ? DIENST_LAAD_NAAM[dienst] : undefined;
  if (!item) return taal === 'nl' ? 'Pagina laden…' : 'Завантаження сторінки…';
  return taal === 'nl' ? `Laden: ${item.nl}…` : `Завантаження: ${item.uk}…`;
}

const WACHT_SELECTORS = [
  ':scope > .canonical-signed-out.checking',
  ':scope > .session-bootstrap-silent',
  ':scope > .service-lazy-loading',
  '.hub-maquette-inhoud > .service-lazy-loading',
  ':scope > .ia-wacht',
  ':scope > .tech-poort[data-tech-poort="wacht"]',
  ':scope > .werkblad[data-werkblad="laden"]:empty',
  '.hub-maquette-inhoud > .werkblad[data-werkblad="laden"]:empty',
].join(', ');

/** Перевіряє, чи робоча область сторінки вже містить відмальований видимий вміст (не порожня і не на скелеті початкового завантаження). */
export function paginaHeeftZichtbareInhoud(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): boolean {
  if (!doc || !doc.documentElement) return false;
  if (doc.documentElement.classList?.contains('boot-active')) return false;
  const boot = doc.getElementById?.('boot-shell') as HTMLElement | null;
  if (boot && !boot.hidden && boot.childElementCount > 0) return false;
  const root = doc.getElementById?.('root');
  if (!root || root.childElementCount === 0) return false;
  const inhoud = root.querySelector?.('.canonical-content');
  if (!inhoud) {
    return Array.from(root.children || []).some(
      (el) => !(el as HTMLElement).hidden && (el.childElementCount > 0 || (el.textContent || '').trim().length > 0),
    );
  }
  const kinderen = Array.from(inhoud.children || []).filter((el) => !el.classList?.contains('menu-start'));
  if (kinderen.length === 0) return false;
  if (inhoud.querySelector?.(WACHT_SELECTORS)) return false;
  if (inhoud.querySelector?.('[data-mail-list-pending="true"]') && !inhoud.querySelector?.('.google-mail-row')) {
    return false;
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ voortgangsbalk + laadkapsel
type KapselReden = 'geen' | 'leeg' | 'navigatie';
let balk: HTMLDivElement | null = null;
let kapsel: HTMLDivElement | null = null;
let staat: {
  extern: boolean;
  achtergrond: boolean;
  verzoekGestart: boolean;
  kapselReden: KapselReden;
  start: number;
  breedte: number;
  zichtbaar: boolean;
  generatie: number;
} | null = null;
let generatie = 0;
let kapselGeneratie = 0;
let trickle: number | undefined;
let toon: number | undefined;
let stilSinds = 0;
let uitApi: (() => void) | undefined;
let maxTimer: number | undefined;
let kapselMaxTimer: number | undefined;
let inhoudWaarnemer: MutationObserver | null = null;
let inhoudRaf = 0;

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

function zorgKapsel() {
  if (kapsel && kapsel.isConnected) return kapsel;
  const bestaand = document.getElementById('tsv-laad-kapsel');
  if (bestaand instanceof HTMLDivElement) {
    kapsel = bestaand;
    if (!kapsel.querySelector('i')) {
      const icoon = document.createElement('i');
      icoon.setAttribute('aria-hidden', 'true');
      kapsel.prepend(icoon);
    }
    if (!kapsel.querySelector('span')) {
      kapsel.appendChild(document.createElement('span'));
    }
    return kapsel;
  }
  kapsel = document.createElement('div');
  kapsel.id = 'tsv-laad-kapsel';
  kapsel.setAttribute('role', 'status');
  kapsel.setAttribute('aria-live', 'polite');
  kapsel.setAttribute('aria-atomic', 'true');
  kapsel.dataset.staat = 'uit';
  const icoon = document.createElement('i');
  icoon.setAttribute('aria-hidden', 'true');
  const tekst = document.createElement('span');
  kapsel.appendChild(icoon);
  kapsel.appendChild(tekst);
  document.body.appendChild(kapsel);
  return kapsel;
}

function werkKapselBij(dienst: string, kleur: string) {
  const k = zorgKapsel();
  if (kleur) k.style.setProperty('--tsv-voortgang-kleur', kleur);
  else k.style.removeProperty('--tsv-voortgang-kleur');
  k.dataset.dienst = dienst || '';
  const tekst = k.querySelector('span');
  if (tekst) tekst.textContent = laadKapselTekst(dienst);
  return k;
}

function stopInhoudWaarnemer() {
  inhoudWaarnemer?.disconnect();
  inhoudWaarnemer = null;
  if (inhoudRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(inhoudRaf);
  }
  inhoudRaf = 0;
  window.clearTimeout(kapselMaxTimer);
  kapselMaxTimer = undefined;
}

function rondKapselAf(direct = false) {
  stopInhoudWaarnemer();
  const el = kapsel && kapsel.isConnected ? kapsel : document.getElementById('tsv-laad-kapsel');
  if (!(el instanceof HTMLDivElement)) return;
  kapsel = el;
  delete el.dataset.opstart;
  const kg = ++kapselGeneratie;
  if (direct || el.dataset.staat !== 'bezig') {
    el.dataset.staat = 'uit';
    return;
  }
  el.dataset.staat = 'klaar';
  window.setTimeout(() => {
    if (kapselGeneratie === kg && el.dataset.staat === 'klaar') {
      el.dataset.staat = 'uit';
    }
  }, 260);
}

function rondOpstartBalkAf() {
  const el = balk && balk.isConnected ? balk : document.getElementById('tsv-voortgang');
  if (el instanceof HTMLDivElement && el.dataset.opstart === '1') {
    delete el.dataset.opstart;
    if (!staat && el.dataset.staat === 'opstart') {
      el.dataset.staat = 'uit';
    }
  }
}

function startInhoudWaarnemer() {
  if (typeof document === 'undefined') return;
  if (paginaHeeftZichtbareInhoud()) {
    rondOpstartBalkAf();
    if (!(staat && (staat.extern || staat.kapselReden === 'navigatie'))) {
      rondKapselAf();
    }
    return;
  }
  if (!inhoudWaarnemer && typeof MutationObserver === 'function') {
    const controleer = () => {
      inhoudRaf = 0;
      const el = kapsel && kapsel.isConnected ? kapsel : document.getElementById('tsv-laad-kapsel');
      if (el instanceof HTMLDivElement && el.dataset.staat === 'bezig') {
        const span = el.querySelector('span');
        const nieuw = laadKapselTekst(el.dataset.dienst || '');
        if (span && span.textContent !== nieuw) span.textContent = nieuw;
      }
      if (paginaHeeftZichtbareInhoud()) {
        rondOpstartBalkAf();
        if (staat && staat.kapselReden === 'leeg') {
          staat.kapselReden = 'geen';
        }
        if (!(staat && (staat.extern || staat.kapselReden === 'navigatie'))) {
          rondKapselAf();
        } else {
          stopInhoudWaarnemer();
        }
      }
    };
    const plan = () => {
      if (inhoudRaf) return;
      if (typeof requestAnimationFrame === 'function') {
        inhoudRaf = requestAnimationFrame(controleer);
      } else {
        inhoudRaf = window.setTimeout(controleer, 16);
      }
    };
    inhoudWaarnemer = new MutationObserver(plan);
    inhoudWaarnemer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'lang', 'data-werkblad', 'data-mail-list-pending'],
    });
  }
  window.clearTimeout(kapselMaxTimer);
  kapselMaxTimer = window.setTimeout(() => {
    rondOpstartBalkAf();
    if (!(staat && staat.extern)) {
      rondKapselAf();
    }
  }, 12000);
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

/** Start (of herstart) de balk en zo nodig de laadkapsel. `dienst` bepaalt kleur en tekst; `extern` = naar een andere host. */
export function voortgangStart(
  dienst: string,
  opties: { extern?: boolean; vanaf?: number; direct?: boolean; achtergrond?: boolean; verzoekGestart?: boolean; opstartOvergenomen?: boolean } = {},
) {
  if (typeof document === 'undefined') return;
  if (!instellingen().voortgang) {
    rondOpstartBalkAf();
    rondKapselAf(true);
    return;
  }
  // Wissel naar een ander onderdeel loopt eerst via de sessie-overdracht (API) en daarna via navigate: niet opnieuw starten.
  if (staat?.extern && opties.extern && balk?.dataset.dienst === (dienst || '')) return;
  if (!opties.achtergrond && !opties.verzoekGestart) {
    focusOpKlik(dienst || 'navigatie');
  }
  opruimen();
  const g = ++generatie;
  const b = zorgBalk();
  delete b.dataset.opstart;
  const kleur = voortgangKleur(dienst);
  if (kleur) b.style.setProperty('--tsv-voortgang-kleur', kleur); else b.style.removeProperty('--tsv-voortgang-kleur');
  b.dataset.dienst = dienst || '';
  const isAchtergrond = Boolean(opties.achtergrond && !opties.extern);
  const leegWerkgebied = !paginaHeeftZichtbareInhoud();
  const isNavigatie = !opties.achtergrond && !opties.verzoekGestart;
  const kapselReden: KapselReden = opties.extern
    ? 'navigatie'
    : opties.opstartOvergenomen
      ? (leegWerkgebied ? 'leeg' : 'geen')
      : isNavigatie
        ? (leegWerkgebied ? 'leeg' : 'navigatie')
        : (!isAchtergrond && leegWerkgebied)
          ? 'leeg'
          : 'geen';
  staat = {
    extern: !!opties.extern,
    achtergrond: isAchtergrond,
    verzoekGestart: !!opties.verzoekGestart,
    kapselReden,
    start: Date.now(),
    breedte: 0,
    zichtbaar: false,
    generatie: g,
  };
  zetAchtergrondStand(isAchtergrond);
  if (kapselReden !== 'geen') {
    ++kapselGeneratie;
    const k = werkKapselBij(dienst, kleur);
    delete k.dataset.opstart;
    if (opties.direct || k.dataset.staat === 'bezig') {
      k.dataset.staat = 'bezig';
    } else {
      k.dataset.staat = 'wacht';
    }
    if (kapselReden === 'leeg') {
      startInhoudWaarnemer();
    }
  } else if (!leegWerkgebied) {
    const bestaandKapsel = kapsel && kapsel.isConnected ? kapsel : document.getElementById('tsv-laad-kapsel');
    if (bestaandKapsel instanceof HTMLDivElement && bestaandKapsel.dataset.staat !== 'uit') {
      rondKapselAf();
    }
  }
  if (opties.direct) { staat.zichtbaar = true; b.dataset.staat = 'bezig'; } else b.dataset.staat = 'wacht';
  const beginStand = huidigeLaadStand();
  zetBreedte(werkelijkeBreedteUitStand(beginStand, opties.vanaf ?? (isAchtergrond ? 10 : 12)));
  if (opties.extern) overdrachtSchrijven(dienst, kleur);
  if (!opties.direct) {
    toon = window.setTimeout(() => {
      if (staat?.generatie !== g) return;
      staat.zichtbaar = true;
      b.dataset.staat = 'bezig';
      if (staat.kapselReden !== 'geen') {
        if (staat.kapselReden === 'leeg' && paginaHeeftZichtbareInhoud()) {
          staat.kapselReden = 'geen';
          rondKapselAf(true);
        } else {
          const k = zorgKapsel();
          k.dataset.staat = 'bezig';
        }
      }
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
  maxTimer = window.setTimeout(() => {
    if (staat?.generatie === g) {
      voortgangKlaar();
      rondKapselAf(true);
    }
  }, 12000);
}
/** Klaar: naar 100 % en vervagen (alleen als hij zichtbaar was; anders stil weg). */
export function voortgangKlaar() {
  if (!staat || !balk) {
    if (paginaHeeftZichtbareInhoud()) rondKapselAf();
    return;
  }
  const b = balk, wasZichtbaar = staat.zichtbaar, g = staat.generatie, reden = staat.kapselReden;
  opruimen(); staat = null;
  delete b.dataset.achtergrond;
  delete b.dataset.opstart;
  if (reden !== 'geen') {
    if (!paginaHeeftZichtbareInhoud()) {
      startInhoudWaarnemer();
    } else {
      rondKapselAf(!wasZichtbaar);
    }
  } else if (paginaHeeftZichtbareInhoud()) {
    const bestaandKapsel = kapsel && kapsel.isConnected ? kapsel : document.getElementById('tsv-laad-kapsel');
    if (bestaandKapsel instanceof HTMLDivElement && bestaandKapsel.dataset.staat !== 'uit') {
      rondKapselAf(!wasZichtbaar);
    }
  }
  if (!wasZichtbaar) { b.dataset.staat = 'uit'; return; }
  b.style.setProperty('--tsv-voortgang', '100%'); b.dataset.staat = 'klaar';
  window.setTimeout(() => { if (generatie === g) b.dataset.staat = 'uit'; }, 420);
}
export const voortgangStaat = () => (balk?.dataset.staat || (typeof document !== 'undefined' ? document.getElementById('tsv-voortgang')?.dataset.staat : '') || 'uit');
export const laadKapselStaat = () => (kapsel?.dataset.staat || (typeof document !== 'undefined' ? document.getElementById('tsv-laad-kapsel')?.dataset.staat : '') || 'uit');

function verwerkLaadStand(stand: LaadStand) {
  if (typeof document === 'undefined') return;
  if (!instellingen().voortgang) {
    rondOpstartBalkAf();
    rondKapselAf(true);
    return;
  }
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
        if (staat.kapselReden === 'geen' && !paginaHeeftZichtbareInhoud()) {
          staat.kapselReden = 'leeg';
          const dienst = balk?.dataset.dienst || dienstVanUrl(location.href);
          const k = werkKapselBij(dienst, voortgangKleur(dienst));
          k.dataset.staat = staat.zichtbaar ? 'bezig' : 'wacht';
          startInhoudWaarnemer();
        }
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
  delete el.dataset.opstart;
  el.dataset.overgenomen = '1';
  balk = el;
  voortgangStart(el.dataset.dienst || '', { vanaf: 70, direct: true, opstartOvergenomen: true });
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
  const overgenomen = voortgangOvernemen();
  if (!overgenomen) {
    if (!instellingen().voortgang) {
      rondOpstartBalkAf();
      rondKapselAf(true);
    } else {
      const bestaandKapsel = document.getElementById('tsv-laad-kapsel');
      if (bestaandKapsel instanceof HTMLDivElement) {
        kapsel = bestaandKapsel;
        const d = bestaandKapsel.dataset.dienst || dienstVanUrl(location.href);
        werkKapselBij(d, voortgangKleur(d));
      }
      startInhoudWaarnemer();
    }
  }
  // Terug via bfcache: balk en laadkapsel weg. (Een gewone eerste pageshow met persisted=false mag een nog lege pagina niet sluiten.)
  window.addEventListener('pageshow', (ev) => {
    if (!(ev as PageTransitionEvent).persisted) return;
    if (staat) {
      opruimen();
      staat = null;
      if (balk) {
        delete balk.dataset.achtergrond;
        delete balk.dataset.opstart;
        balk.dataset.staat = 'uit';
      }
    }
    rondOpstartBalkAf();
    rondKapselAf(true);
  });
}
