// Leesvenster van de Post — het kader rond een geopende brief (pakket 1 «Adaptive Mail Canvas», 24.10.2026).
// Eén kader voor vijf vormen: volledig, rechts, onder, zwevend en telefoon (src/mail/lees-modus.ts beslist welke). Het kader regelt
// wat in elke vorm hetzelfde moet zijn, zodat de inhoud (kop, gesprek, antwoord — GoogleMailWerkruimte) er niet over hoeft na te denken:
//   • plaats en randen: naast het menu van de site (links, rechts of dock), rechts nooit over de lijst;
//   • rol: modaal dialoogvenster als de brief de lijst bedekt, niet-modaal als hij zweeft, een gewoon gebied naast de lijst;
//   • focus: bij openen naar de brief (bedekt/zwevend) of in de lijst laten (gesplitst); bij sluiten terug op de rij van de brief;
//   • Escape: nooit als de brief geminimaliseerd is; naast de lijst en zwevend alleen met de focus in de brief;
//   • «Назад»: op de telefoon en in «volledig» sluit terug de brief in plaats van de post te verlaten;
//   • schuifpositie per brief en zwevend venster (slepen, toetsenbord, binnen het scherm) — src/lezer-venster.ts.
// De werkbalk (MailLezerWerkbalk) leest dit via useLeesVenster(): knop «Зменшити вікно», greep voor het toetsenbord, Escape.
// Pakket 2 (24.10.2026): het kader houdt ook de stand van het contextpaneel bij (kolom ≥ 1100 px, blad op verzoek — Escape en
// «Назад» sluiten eerst het blad), de «Вигляд» van de brief (dichtheid, tekstgrootte) en de sneltoetsen (R, A, F, E, J/K, F6, ?).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BLAD_SLEUTEL, CONTEXT_SLEUTEL, GESCHIEDENIS_SLEUTEL, GEEN_RANDEN, LeesPosities, WEERGAVE_SLEUTEL, bladStap, contextVorm, escSluit, focusBijOpenen,
  geschiedenisStap, leesBreedte, leesModus, leesRol, normaliseerWeergave, sneltoets, sneltoetsMag,
  type ContextVorm, type LeesBreedte, type LeesModus, type LezerWeergave, type Randen, type Sneltoets,
} from './lees-modus';
import { koppel, opZwevend, pasToe, verschuif, zetZwevend, zwevendVoorkeur } from '../lezer-venster';
import SneltoetsenHulp from './SneltoetsenHulp';
import './lees-venster.css';

export type LeesVensterApi = {
  modus: LeesModus;
  breedte: LeesBreedte;
  /** Zweeft het venster nu? */
  zwevend: boolean;
  /** Kan het zweven (niet op de telefoon)? */
  kanZweven: boolean;
  wisselZwevend: () => void;
  /** Pijltjes op de greep van het zwevende venster; true = toets gebruikt (dan preventDefault). */
  greepToets: (e: { key: string; shiftKey?: boolean; altKey?: boolean }) => boolean;
  /** Mag Escape het venster nu sluiten? */
  escMag: (e: KeyboardEvent) => boolean;
  /** Contextpaneel: «kolom» naast de brief (breed venster, aan/uit onthouden), «blad» op verzoek (smaller), of «uit». */
  context: {
    vorm: ContextVorm;
    wissel: () => void;
    /** Sluit het blad (focus terug op de knop «Контекст») of zet de kolom uit. */
    sluit: () => void;
    /** De knop «Контекст» in de kop meldt zich hier: na het sluiten van het blad gaat de focus daarheen terug. */
    knop: (el: HTMLButtonElement | null) => void;
  };
  /** «Вигляд» van de brief, per apparaat: dichtheid binnen de brief (los van de vorm van het venster) en tekstgrootte. */
  weergave: LezerWeergave;
  zetWeergave: (w: Partial<LezerWeergave>) => void;
  /** Overzicht van de sneltoetsen («?»). */
  toonHulp: () => void;
};
/** Wat elke sneltoets doet (GoogleMailWerkruimte); een ontbrekende actie = de toets doet niets. F6 en «?» regelt het kader zelf. */
export type LezerSneltoetsen = Partial<Record<Exclude<Sneltoets, 'wissel' | 'hulp'>, () => void>>;

const LeesVensterContext = createContext<LeesVensterApi | null>(null);
export const useLeesVenster = () => useContext(LeesVensterContext);

const schermBreedte = () => (typeof innerWidth === 'number' ? innerWidth : 1280);
/** De vorm die nu zou gelden (voor wie buiten het kader moet weten hoe de brief er staat, bv. bij het sluiten). */
export const huidigeLeesModus = (paneel: string): LeesModus => leesModus({ schermBreedte: schermBreedte(), paneel, zwevend: zwevendVoorkeur() });

/** Inline randen voor een kader dat het vrije deel vult (leesvenster «volledig», bijlage-werkbank): ze winnen van de oude CSS-regels
 *  per breedte (76 px, 286 px …) en volgen het echte menu. Alleen wat nodig is: menu links → left; menu rechts → right (en left 0);
 *  dock boven/onder → top/bottom (en left 0). Leeg als er niets vrij te houden is (telefoon, geen menu gevonden). */
export function randStijl(r: Randen): CSSProperties | undefined {
  const s: CSSProperties = {};
  if (r.links) s.left = `${r.links}px`;
  else if (r.rechts || r.boven || r.onder) s.left = '0px';
  if (r.rechts) s.right = `${r.rechts}px`;
  if (r.boven) s.top = `${r.boven}px`;
  if (r.onder) s.bottom = `${r.onder}px`;
  return Object.keys(s).length ? s : undefined;
}

function kaderStijl(modus: LeesModus, r: Randen): CSSProperties | undefined {
  if (modus === 'volledig') return randStijl(r);
  // onder: de bovenkant volgt de lijst (CSS: top auto, 52vh hoog)
  if (modus === 'onder') return randStijl({ ...r, boven: 0 });
  // rechts: tegen de rechterrand (of het menu rechts), NOOIT met een linkerrand — vroeger zette de rechterkant van de zijbalk als
  // inline «left» de brief links over de lijst (de CSS-regel «left:auto» verloor van de inline stijl).
  if (modus === 'rechts') return { left: 'auto', right: `${r.rechts}px`, ...(r.boven ? { top: `max(58px, ${r.boven}px)` } : {}), ...(r.onder ? { bottom: `${r.onder}px` } : {}) };
  return undefined; // zwevend: het venster zelf krijgt plaats en grootte (lezer-venster); telefoon: het hele scherm
}

// ---------------------------------------------------------------- geschiedenis («Назад»)
// Eén luisteraar voor de hele pagina: het sluiten via de knop haalt de eigen stap weg met history.back(); die popstate komt later
// (ook als het kader al weg is) en mag dan niets meer sluiten — ook geen brief die intussen opnieuw is geopend.
let teNegeren = 0;
let abonnee: (() => void) | null = null;
let geinstalleerd = false;
function installeerGeschiedenis() {
  if (geinstalleerd || typeof window === 'undefined') return;
  geinstalleerd = true;
  window.addEventListener('popstate', () => { if (teNegeren > 0) { teNegeren -= 1; return; } abonnee?.(); });
}
const stapBoven = (sleutel: string) => { try { return Boolean((history.state as Record<string, unknown> | null)?.[sleutel]); } catch { return false; } };
const eigenStapBoven = () => stapBoven(GESCHIEDENIS_SLEUTEL);
// De stap van het blad bevat ook die van de brief (de staat wordt aangevuld, niet vervangen): ligt het blad boven, dan ligt de brief
// er direct onder.
function zetStap(id: string, sleutel = GESCHIEDENIS_SLEUTEL) { try { history.pushState({ ...((history.state as object | null) || {}), [sleutel]: id || '1' }, ''); return true; } catch { return false; } }
/** n eigen stappen terug; de luisteraar negeert de ene popstate die daarop volgt (ook bij history.go(-2)). */
function stappenTerug(n: number) { if (n <= 0) return; teNegeren += 1; try { if (n === 1) history.back(); else history.go(-n); } catch { teNegeren -= 1; } }
/** De stap(pen) van de brief weg: met het blad erboven twee, anders één. */
function haalStapWeg() { if (!eigenStapBoven()) return; stappenTerug(stapBoven(BLAD_SLEUTEL) ? 2 : 1); }

/** Lagen boven de brief die Escape zelf afhandelen en waarin sneltoetsen niets mogen doen (menu's, vensters, de werkbank; pakket 3:
 *  «Звідки це?» en «Порівняти версії»). */
const ANDERE_LAGEN = '.google-mail-reader-backdrop details[open],.mail-thread-message-details-popover,.mail-new-message-backdrop,.google-mail-attachment-preview,.mail-reader-organize-backdrop,.mail-reader-n09-backdrop,.mail-reader-n10-backdrop,.canonical-notification-panel,.mail-navigation-editor,.mail-label-editor,.mail-doc-editor-backdrop,.mail-snooze-popover,.mail-save-dialog,[data-lezer-hulp],[data-bron-blad],[data-versie-vergelijk]';
const typt = (t: Element | null) => Boolean(t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('[contenteditable="true"],[contenteditable=""],[role="textbox"]')));
const lees = (sleutel: string) => { try { return localStorage.getItem(sleutel); } catch { return null; } };
const bewaar = (sleutel: string, waarde: string) => { try { localStorage.setItem(sleutel, waarde); } catch { /* privévenster: alleen voor deze sessie */ } };
const leesWeergave = () => { try { return normaliseerWeergave(JSON.parse(lees(WEERGAVE_SLEUTEL) || 'null')); } catch { return normaliseerWeergave(null); } };

// ---------------------------------------------------------------- focus terug op de rij
const rijKnop = (id: string) => {
  if (!id) return null;
  return document.querySelector<HTMLElement>(`.google-mail-row[data-mail-message-id="${escId(id)}"] .mail-row-open-hit`);
};
const escId = (id: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&'));
/** Het element dat de lijst laat schuiven (de pagina of een schuivende voorouder). */
function schuifOuder(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return p; }
  return (document.scrollingElement as HTMLElement | null) || document.documentElement;
}
const rijKnoppen = () => [...document.querySelectorAll<HTMLElement>('.google-mail-row[data-mail-message-id] .mail-row-open-hit')];
function zetFocusTerug(id: string, opener: HTMLElement | null, index: number) {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return; // iemand anders heeft de focus al (zoekveld, venster …)
  const knoppen = rijKnoppen();
  const doel = rijKnop(id) || (opener && opener.isConnected ? opener : null) || (index >= 0 && knoppen.length ? knoppen[Math.min(index, knoppen.length - 1)] : null);
  if (!doel) return;
  doel.focus({ preventScroll: true });
  const b = doel.getBoundingClientRect();
  if (b.bottom < 0 || b.top > innerHeight) doel.scrollIntoView({ block: 'nearest' });
}

/** Schuifpositie per brief, zolang de pagina open is (ook na sluiten en opnieuw openen). */
const POSITIES = new LeesPosities(50);

type Props = {
  lang: 'uk' | 'nl';
  /** Id van de brief die nu open is. */
  berichtId: string;
  laden: boolean;
  /** Voorkeur van dit apparaat: 'none' | 'right' | 'below'. */
  paneel: string;
  geminimaliseerd: boolean;
  /** Vrij te houden randen (menu links/rechts, dock boven/onder) — GoogleMailWerkruimte meet ze. */
  randen?: Randen;
  /** Klik naast de brief (op de achtergrond, zoals vroeger). */
  onMinimaliseer: () => void;
  /** «Назад» van de browser/telefoon. */
  onSluit: () => void;
  labelledBy?: string;
  /** Sneltoetsen R, A, F, E, J/K (F6 en «?» regelt het kader zelf). */
  sneltoetsen?: LezerSneltoetsen;
  children: ReactNode;
};

export default function LeesVenster(p: Props) {
  const randen = p.randen || GEEN_RANDEN;
  const kaderRef = useRef<HTMLDivElement | null>(null), artikelRef = useRef<HTMLElement | null>(null);
  const [scherm, setScherm] = useState(schermBreedte);
  const [zwevendAan, setZwevendAan] = useState(zwevendVoorkeur);
  const [breedte, setBreedte] = useState<LeesBreedte>(() => leesBreedte(schermBreedte()));
  const modus = leesModus({ schermBreedte: scherm, paneel: p.paneel, zwevend: zwevendAan });
  const rol = leesRol(modus);
  // contextpaneel: de kolom (breed) blijft aan of uit zoals de eigenaar hem liet; het blad (smaller) gaat alleen open op verzoek
  const [kolomAan, setKolomAan] = useState(() => lees(CONTEXT_SLEUTEL) !== 'uit');
  const [bladOpen, setBladOpen] = useState(false);
  const [weergave, setWeergave] = useState<LezerWeergave>(leesWeergave);
  const [hulp, setHulp] = useState(false);
  const vorm = contextVorm(breedte, kolomAan, bladOpen);
  const knopRef = useRef<HTMLButtonElement | null>(null);
  const nu = useRef({ modus, geminimaliseerd: p.geminimaliseerd, randen, berichtId: p.berichtId, onSluit: p.onSluit, vorm, breedte, sneltoetsen: p.sneltoetsen });
  nu.current = { modus, geminimaliseerd: p.geminimaliseerd, randen, berichtId: p.berichtId, onSluit: p.onSluit, vorm, breedte, sneltoetsen: p.sneltoetsen };

  // scherm en «zwevend» volgen
  useEffect(() => {
    let raam = 0;
    const opResize = () => { cancelAnimationFrame(raam); raam = requestAnimationFrame(() => setScherm(schermBreedte())); };
    window.addEventListener('resize', opResize);
    const weg = opZwevend(() => setZwevendAan(zwevendVoorkeur()));
    return () => { window.removeEventListener('resize', opResize); cancelAnimationFrame(raam); weg(); };
  }, []);

  // breedteklasse van het venster zelf (niet van het scherm): rechts (52vw) en zwevend gedragen zich als een smal venster
  useLayoutEffect(() => {
    const a = artikelRef.current; if (!a) return;
    const meet = () => setBreedte(leesBreedte(a.getBoundingClientRect().width));
    meet();
    const ro = new ResizeObserver(meet); ro.observe(a);
    return () => ro.disconnect();
  }, []);

  // zwevend venster: plaats/grootte toepassen bij elke vormwissel en randwijziging; slepen + binnen het scherm houden
  useLayoutEffect(() => { pasToe(kaderRef.current, randen); }, [modus, randen.links, randen.rechts, randen.boven, randen.onder]);
  useEffect(() => koppel(kaderRef.current, () => nu.current.randen), []);

  // focus: bij openen (en bij terugkomen uit «geminimaliseerd») naar de brief als die de lijst bedekt of zweeft
  useEffect(() => {
    if (p.geminimaliseerd || !focusBijOpenen(nu.current.modus)) return;
    const a = artikelRef.current;
    if (a && !a.contains(document.activeElement)) a.focus({ preventScroll: true });
  }, [p.geminimaliseerd]);

  // focus terug bij sluiten: de rij van de laatst getoonde brief (of de rij die nu op die plek staat, of wie het venster opende)
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    return () => {
      const a = artikelRef.current, actief = document.activeElement;
      const focusHier = !actief || actief === document.body || actief === document.documentElement || Boolean(a && a.contains(actief));
      const id = nu.current.berichtId, index = rijKnoppen().findIndex((k) => k.closest<HTMLElement>('.google-mail-row')?.dataset.mailMessageId === id);
      if (focusHier) requestAnimationFrame(() => requestAnimationFrame(() => zetFocusTerug(id, opener, index)));
    };
  }, []);

  // «Назад»: één stap in de geschiedenis zolang de brief de lijst bedekt (telefoon, volledig) en zichtbaar is — en daarboven één
  // voor het open blad van het contextpaneel: terug sluit eerst het blad, dan de brief (макет: «однаково в усіх режимах»).
  const eigenStap = useRef(false), eigenBladStap = useRef(false);
  const focusOpKnop = () => requestAnimationFrame(() => { const k = knopRef.current; if (k && k.isConnected) k.focus({ preventScroll: true }); });
  useEffect(() => {
    installeerGeschiedenis();
    abonnee = () => {
      if (eigenBladStap.current && !stapBoven(BLAD_SLEUTEL)) { eigenBladStap.current = false; setBladOpen(false); focusOpKnop(); if (eigenStapBoven()) return; }
      if (eigenStap.current && !eigenStapBoven()) { eigenStap.current = false; nu.current.onSluit(); }
    };
    return () => { abonnee = null; if (eigenStap.current) { eigenStap.current = false; eigenBladStap.current = false; haalStapWeg(); } };
  }, []);
  useEffect(() => {
    const nodig = geschiedenisStap(modus) && !p.geminimaliseerd;
    if (nodig && !eigenStap.current) {
      eigenStap.current = eigenStapBoven() || zetStap(p.berichtId); // na herladen staat de stap er al
      // na herladen met het blad open: die stap ligt er ook nog — het blad dus weer open, anders doet het eerste «Назад» niets zichtbaars
      if (eigenStap.current && stapBoven(BLAD_SLEUTEL)) { eigenBladStap.current = true; setBladOpen(true); }
    } else if (!nodig && eigenStap.current) { eigenStap.current = false; eigenBladStap.current = false; haalStapWeg(); }
  }, [modus, p.geminimaliseerd]);

  const openBlad = useCallback(() => {
    setBladOpen(true);
    if (!eigenBladStap.current && bladStap(nu.current.modus) && eigenStap.current && eigenStapBoven() && !stapBoven(BLAD_SLEUTEL)) eigenBladStap.current = zetStap('1', BLAD_SLEUTEL);
  }, []);
  const sluitBlad = useCallback((focusTerug: boolean) => {
    setBladOpen(false);
    if (eigenBladStap.current) { eigenBladStap.current = false; if (stapBoven(BLAD_SLEUTEL)) stappenTerug(1); }
    if (focusTerug) focusOpKnop();
  }, []);
  // breder geworden (kolom): het blad hoort er dan niet meer bij
  useEffect(() => { if (breedte === 'breed' && bladOpen) sluitBlad(false); }, [breedte]);

  // Escape sluit eerst het blad (vóór de brief: de werkbalk luistert later en ziet defaultPrevented). Menu's en vensters boven de
  // brief gaan voor — die sluiten zelf.
  useEffect(() => {
    if (vorm !== 'blad') return;
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector(ANDERE_LAGEN)) return;
      e.preventDefault(); e.stopPropagation();
      sluitBlad(true);
    };
    document.addEventListener('keydown', opToets, true);
    return () => document.removeEventListener('keydown', opToets, true);
  }, [vorm]);

  // Sneltoetsen: R antwoorden, A allen, F doorsturen, E archiveren, J/K volgende/vorige, F6 brief ⇄ context, ? overzicht.
  // Dezelfde afspraak als Escape (lees-modus: sneltoetsMag): nooit als de brief geminimaliseerd is of er een laag boven ligt,
  // nooit tijdens het typen; naast de lijst en zwevend alleen met de focus in de brief.
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const doel = e.target instanceof Element ? e.target : null, a = artikelRef.current;
      const s = sneltoets(e, typt(doel));
      if (!s || !a || document.querySelector(ANDERE_LAGEN)) return;
      const n = nu.current;
      if (!sneltoetsMag({ modus: n.modus, geminimaliseerd: n.geminimaliseerd, focusBinnen: Boolean(doel && a.contains(doel)) })) return;
      if (s === 'hulp') { e.preventDefault(); setHulp(true); return; }
      if (s === 'wissel') { e.preventDefault(); wisselFocus(); return; }
      const actie = n.sneltoetsen?.[s];
      if (!actie) return;
      e.preventDefault();
      actie();
    };
    document.addEventListener('keydown', opToets);
    return () => document.removeEventListener('keydown', opToets);
  }, []);
  /** F6: van de brief naar het contextpaneel en terug; staat het paneel uit, dan gaat het open (kolom of blad). */
  const wisselFocus = () => {
    const a = artikelRef.current; if (!a) return;
    const paneel = a.querySelector<HTMLElement>('[data-context-paneel]'), actief = document.activeElement;
    if (paneel && actief && paneel.contains(actief)) {
      const brief = a.querySelector<HTMLElement>(':scope > section.mail-thread-content') || a;
      if (brief !== a && !brief.hasAttribute('tabindex')) brief.setAttribute('tabindex', '-1');
      brief.focus({ preventScroll: true });
      return;
    }
    if (paneel) { paneel.focus({ preventScroll: true }); return; }
    if (nu.current.breedte === 'breed') { setKolomAan(true); bewaar(CONTEXT_SLEUTEL, 'aan'); } else openBlad();
    requestAnimationFrame(() => requestAnimationFrame(() => artikelRef.current?.querySelector<HTMLElement>('[data-context-paneel]')?.focus({ preventScroll: true })));
  };

  // «onder»: de lijst houdt onder zich zoveel plaats vrij als de brief hoog is (padding, lees-venster.css), zodat ook de laatste rij boven
  // de brief kan schuiven. Vroeger werd de werkruimte zelf een schuifvak van 48vh − 12 px: dat begon onder de bovenbalk en liep zo
  // ~60 px achter de brief door (de laatste brief bleef onbereikbaar), en de lijst sprong bij openen en sluiten naar boven.
  useLayoutEffect(() => {
    const bd = kaderRef.current, ws = bd?.closest<HTMLElement>('.google-mail-workspace');
    if (!bd || !ws || modus !== 'onder' || p.geminimaliseerd) return;
    const zet = () => ws.style.setProperty('--lees-onder-hoogte', `${Math.max(0, Math.round(innerHeight - bd.getBoundingClientRect().top))}px`);
    zet();
    const ro = new ResizeObserver(zet); ro.observe(bd);
    window.addEventListener('resize', zet);
    return () => { ro.disconnect(); window.removeEventListener('resize', zet); ws.style.removeProperty('--lees-onder-hoogte'); };
  }, [modus, p.geminimaliseerd]);

  // naast de lijst: de rij van de open brief blijft in beeld (ook bij «vorige/volgende»), boven de brief in «onder»
  useEffect(() => {
    if (p.geminimaliseerd || (modus !== 'rechts' && modus !== 'onder')) return;
    const raam = requestAnimationFrame(() => {
      const rij = document.querySelector<HTMLElement>(`.google-mail-row[data-mail-message-id="${escId(p.berichtId)}"]`), bd = kaderRef.current;
      if (!rij || !bd) return;
      const r = rij.getBoundingClientRect(), grens = modus === 'onder' ? bd.getBoundingClientRect().top - 8 : innerHeight - 8, boven = 64;
      const sc = schuifOuder(rij); if (!sc) return;
      if (r.bottom > grens) sc.scrollTop += Math.ceil(r.bottom - grens);
      else if (r.top < boven) sc.scrollTop -= Math.ceil(boven - r.top);
    });
    return () => cancelAnimationFrame(raam);
  }, [p.berichtId, modus, p.geminimaliseerd]);

  // schuifpositie per brief: bijhouden tijdens het schuiven, terugzetten zodra de brief geladen is
  useEffect(() => {
    const a = artikelRef.current; if (!a) return;
    // de schuivende inhoud is de <section> van het gesprek (niet de ШІ-balk section.mra ervoor)
    const opScroll = (e: Event) => { const t = e.target as HTMLElement | null; if (t && t.parentElement === a && t.tagName === 'SECTION' && !t.classList.contains('mra')) POSITIES.zet(nu.current.berichtId, t.scrollTop); };
    a.addEventListener('scroll', opScroll, { capture: true, passive: true });
    return () => a.removeEventListener('scroll', opScroll, { capture: true });
  }, []);
  // Terugzetten: de tekst van een brief (iframe, afbeeldingen) wordt pas na het laden hoog. Een vroege schuifpositie wordt dan eerst
  // afgekapt, en de browser houdt bij het groeien de verkeerde rij in beeld (scroll anchoring) — zo kwam je 400 px verder uit. Daarom
  // tijdens het terugzetten (max. 2 s) geen anchoring en bij elke groei opnieuw dezelfde positie, tot iemand anders schuift (de
  // gebruiker, of het gesprek zelf naar een zoektreffer of het antwoordveld).
  useEffect(() => {
    if (p.laden) return;
    const y = POSITIES.haal(p.berichtId); if (!y) return;
    const sc = artikelRef.current?.querySelector<HTMLElement>(':scope > section:not(.mra)');
    if (!sc || sc.scrollTop !== 0) return;
    let klaar = false, laatst = 0, raam = 0;
    const anker = sc.style.overflowAnchor;
    sc.style.overflowAnchor = 'none';
    const ro = new ResizeObserver(() => probeer());
    const stop = () => {
      if (klaar) return; klaar = true;
      cancelAnimationFrame(raam); window.clearTimeout(wekker); ro.disconnect();
      for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) sc.removeEventListener(t, stop);
      sc.style.overflowAnchor = anker;
    };
    function probeer() {
      if (klaar || !sc) return;
      if (Math.abs(y - sc.scrollTop) > Math.abs(y - laatst) + 2) { stop(); return; } // iemand anders schoof weg van het doel
      sc.scrollTop = y; laatst = sc.scrollTop;
    }
    const wekker = window.setTimeout(stop, 2000);
    for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) sc.addEventListener(t, stop, { passive: true });
    for (const kind of Array.from(sc.children)) ro.observe(kind);
    raam = requestAnimationFrame(probeer);
    return stop;
  }, [p.berichtId, p.laden]);

  const zetWeergaveDeel = useCallback((w: Partial<LezerWeergave>) => {
    setWeergave((oud) => { const nieuw = normaliseerWeergave({ ...oud, ...w }); bewaar(WEERGAVE_SLEUTEL, JSON.stringify(nieuw)); return nieuw; });
  }, []);
  const api = useMemo<LeesVensterApi>(() => ({
    modus, breedte, zwevend: modus === 'zwevend', kanZweven: modus !== 'telefoon',
    wisselZwevend: () => { zetZwevend(!zwevendVoorkeur(), nu.current.randen); },
    greepToets: (e) => verschuif(kaderRef.current, e, nu.current.randen),
    escMag: (e) => {
      const a = artikelRef.current, t = e.target instanceof Node ? e.target : null;
      return escSluit({ modus: nu.current.modus, geminimaliseerd: nu.current.geminimaliseerd, focusBinnen: Boolean(a && (a.contains(document.activeElement) || (t && a.contains(t)))) });
    },
    context: {
      vorm,
      wissel: () => {
        if (nu.current.breedte === 'breed') setKolomAan((aan) => { bewaar(CONTEXT_SLEUTEL, aan ? 'uit' : 'aan'); return !aan; });
        else if (nu.current.vorm === 'blad') sluitBlad(true);
        else openBlad();
      },
      sluit: () => {
        if (nu.current.vorm === 'blad') sluitBlad(true);
        else if (nu.current.vorm === 'kolom') { setKolomAan(false); bewaar(CONTEXT_SLEUTEL, 'uit'); focusOpKnop(); }
      },
      knop: (el) => { knopRef.current = el; },
    },
    weergave,
    zetWeergave: zetWeergaveDeel,
    toonHulp: () => setHulp(true),
  }), [modus, breedte, vorm, weergave]);

  return (
    <LeesVensterContext.Provider value={api}>
      <div
        ref={kaderRef}
        className={`google-mail-reader-backdrop${p.geminimaliseerd ? ' reader-minimized' : ''}`}
        style={kaderStijl(modus, randen)}
        role='presentation'
        aria-hidden={p.geminimaliseerd || undefined}
        data-lees-modus={modus}
        data-lees-breedte={breedte}
        onMouseDown={p.onMinimaliseer}
      >
        <article
          ref={artikelRef}
          className={`google-mail-reader${p.laden ? ' content-loading' : ''}`}
          role={rol.role}
          aria-modal={rol.modaal ? 'true' : undefined}
          aria-labelledby={p.labelledBy || 'google-mail-subject'}
          tabIndex={-1}
          data-lees-modus={modus}
          data-lees-breedte={breedte}
          data-context={vorm}
          data-lezer-dichtheid={weergave.dichtheid}
          style={{ '--lz-tekst': String(weergave.tekst) } as CSSProperties}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {p.children}
          {hulp && <SneltoetsenHulp lang={p.lang} modus={modus} onSluit={() => setHulp(false)} />}
        </article>
      </div>
    </LeesVensterContext.Provider>
  );
}
