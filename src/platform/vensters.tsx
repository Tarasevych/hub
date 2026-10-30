// Vensterbeheer van de site (één plek voor ALLE vensters boven de pagina): welke bovenaan staat, verplaatsen, groter/kleiner,
// maximaliseren, minimaliseren naar het dok en wisselen tussen vensters.
//
// Regels (na het incident van 9.10: «Підтвердіть доступ» stond ONDER het toestemmingsvenster van Claude en was onzichtbaar):
//   1. Een venster dat later opent, staat boven een venster dat eerder opende (een gevolg verschijnt dus altijd boven de oorzaak).
//   2. Prioriteit «kritiek» (bevestigen van toegang, passkey) staat altijd boven «normaal», wat er ook gebeurt.
//   3. Alle vensters gebruiken dezelfde laag (VENSTER_BASIS, hoger dan elk ander paneel van de site); geen losse z-index meer.
//   4. Een venster onder een ander modaal venster is `inert` (geen focus, geen klikken) — maar zichtbaar in het dok en met één klik
//      terug naar voren te halen. Niets kan meer onzichtbaar «wachten».
//   5. Minimaliseren: het venster verdwijnt naar het dok (standaard onderaan); het verzoek loopt door.
//   6. Positie en grootte per venster blijven bewaard (localStorage, alleen gemak; zonder opslag werkt alles gewoon).
//   7. (21.10.2026) Het dok ligt NOOIT over een venster: het staat aan een schermrand en houdt die strook vrij (venster-dok-logica.ts);
//      de lijst klapt alleen op een tik open; slepen naar een andere rand (of de knoppen «Перемістити …») en de plaats blijft bewaard.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AppWindow, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import './vensters.css';

import { RAND, binnenZone, bovensteZichtbaar as bovenste, stapel as stapelVan, type Geometrie, type Item, type VensterPrioriteit, type VensterZone } from './vensters-logica';
import { DOK_H, DOK_SLEEPDREMPEL, DOK_STANDAARD, dokHindernissen, dokMenuRichting, dokNaarRand, dokPlaats, dokRuimte, dokStandVanPunt, normaliseerDokStand, type DokRand, type DokStand } from './venster-dok-logica';
import { veiligeRand } from './veilige-rand';
import { stapelRechthoek } from '../../shared/plaatsing';
import { plaatsStaat } from '../plaatsing/plaatsing-staat';
export type { VensterPrioriteit } from './vensters-logica';

/** Boven alles wat de site verder heeft (menu, e-maileditor 10000, grafiek 10040 …). */
export const VENSTER_BASIS = 100_000;
let teller = 0;
let items: Item[] = [];
let momentopname: Item[] = [];
const luisteraars = new Set<() => void>();
const melden = () => { momentopname = [...items]; luisteraars.forEach((f) => f()); };
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
export const stapel = (lijst: readonly Item[] = items) => stapelVan(lijst);
export const bovensteZichtbaar = (lijst: readonly Item[] = items) => bovenste(lijst);
// Wat het dok aan zijn rand vrijhoudt (px). Vensters blijven erbuiten: hier (computer, JS-geometrie) en in vensters.css (telefoon,
// --venster-dok-*). Verandert het, dan seint het dok «venster-dok-ruimte» en klemt elk venster zich opnieuw.
let dokVrij: Record<DokRand, number> = { onder: 0, boven: 0, links: 0, rechts: 0 };
export const vensterZone = (): VensterZone => ({ x: dokVrij.links, y: dokVrij.boven, w: window.innerWidth - dokVrij.links - dokVrij.rechts, h: window.innerHeight - dokVrij.boven - dokVrij.onder });
const binnenScherm = (g: Geometrie) => binnenZone(g, vensterZone());

export const zIndexVan = (id: string) => { const s = stapel(); const i = s.findIndex((x) => x.id === id); return VENSTER_BASIS + (i < 0 ? 0 : i) * 10; };

export const vensterBeheer = {
  registreer(id: string, o: { titel: string; prioriteit?: VensterPrioriteit; modaal?: boolean }) {
    const bestaand = items.find((x) => x.id === id);
    if (bestaand) { Object.assign(bestaand, { titel: o.titel, prioriteit: o.prioriteit ?? bestaand.prioriteit, modaal: o.modaal ?? bestaand.modaal }); melden(); return; }
    items.push({ id, titel: o.titel, prioriteit: o.prioriteit ?? 'normaal', modaal: o.modaal !== false, volgorde: ++teller, klein: false, wacht: false });
    dokZeker();
    melden();
  },
  afmelden(id: string) { items = items.filter((x) => x.id !== id); melden(); },
  naarVoren(id: string) { const x = items.find((v) => v.id === id); if (!x) return; x.volgorde = ++teller; x.klein = false; melden(); },
  minimaliseer(id: string) { const x = items.find((v) => v.id === id); if (!x) return; x.klein = true; melden(); },
  /** Een venster wacht op een ander (bijv. toestemming → «Підтвердіть доступ»): het dok toont dat. */
  wacht(id: string, ja: boolean) { const x = items.find((v) => v.id === id); if (!x || x.wacht === ja) return; x.wacht = ja; melden(); },
  titel(id: string, titel: string) { const x = items.find((v) => v.id === id); if (!x || x.titel === titel) return; x.titel = titel; melden(); },
  lijst: () => momentopname,
};

export function useVensters(): Item[] { return useSyncExternalStore(abonneer, () => momentopname, () => momentopname); }

// ------------------------------------------------------------------------------------------------ geometrie (bewaard)
const SLEUTEL = 'mijn-ruimte-vensters-v1';
function leesGeometrie(id: string): Partial<Geometrie> | null {
  try { const alles = JSON.parse(localStorage.getItem(SLEUTEL) || '{}') as Record<string, Partial<Geometrie>>; return alles[id] ?? null; } catch { return null; }
}
function bewaarGeometrie(id: string, g: Geometrie) {
  try { const alles = JSON.parse(localStorage.getItem(SLEUTEL) || '{}') as Record<string, Geometrie>; alles[id] = g; localStorage.setItem(SLEUTEL, JSON.stringify(alles)); } catch { /* geen opslag: niet erg */ }
}

const T = {
  minimaliseren: ['Згорнути', 'Minimaliseren'], maximaliseren: ['Розгорнути на весь екран', 'Maximaliseren'], herstellen: ['Відновити розмір', 'Vorige grootte'],
  sluiten: ['Закрити', 'Sluiten'], verplaatsen: ['Перетягніть, щоб пересунути. Стрілки — пересунути, Shift+стрілки — змінити розмір.', 'Sleep om te verplaatsen. Pijltjes — verplaatsen, Shift+pijltjes — grootte.'],
  grootte: ['Змінити розмір', 'Grootte wijzigen'], dok: ['Відкриті вікна', 'Open vensters'], wacht: ['чекає на ваше рішення', 'wacht op uw beslissing'],
  wachtOp: ['чекає підтвердження', 'wacht op bevestiging'], tonen: ['Показати', 'Tonen'],
  anderen: ['Інші вікна', 'Andere vensters'], geminimaliseerd: ['Згорнуті вікна', 'Geminimaliseerd'], achter: ['позаду', 'op de achtergrond'],
  nu: ['Зараз відкрите', 'Nu open'], lijst: ['Вікна', 'Vensters'],
  greep: ['Перетягніть панель вікон до будь-якого краю екрана', 'Sleep het vensterpaneel naar een rand van het scherm'],
  verplaats: ['Перемістити панель', 'Paneel verplaatsen'],
  naarBoven: ['Перемістити панель угору', 'Paneel naar boven'], naarOnder: ['Перемістити панель униз', 'Paneel naar onder'],
  naarLinks: ['Перемістити панель ліворуч', 'Paneel naar links'], naarRechts: ['Перемістити панель праворуч', 'Paneel naar rechts'],
} as const;
const taal = (): 0 | 1 => (document.documentElement.lang === 'nl' ? 1 : 0);

type Props = {
  /** Stabiele id: bepaalt ook de bewaarde positie/grootte. */
  id: string;
  titel: string;
  /** Inhoud van de titelbalk (standaard de titel). */
  kop?: ReactNode;
  prioriteit?: VensterPrioriteit;
  /** Met donkere achtergrond die de pagina blokkeert (standaard ja). */
  modaal?: boolean;
  /** Startgrootte (px); breedte past zich aan smalle schermen aan. */
  breedte?: number;
  hoogte?: number;
  onSluit?: () => void;
  /** Sluiten tijdelijk niet toegestaan (bijv. terwijl een passkey loopt). */
  sluitenUit?: boolean;
  className?: string;
  /** id van het element met de titel/omschrijving voor schermlezers. */
  labelledBy?: string;
  describedBy?: string;
  lang?: string;
  children: ReactNode;
};

/** Eén venster. Rendert in een portal onder <body>, in de gezamenlijke laag. */
export function Venster({ id, titel, kop, prioriteit = 'normaal', modaal = true, breedte = 520, hoogte, onSluit, sluitenUit, className = '', labelledBy, describedBy, lang, children }: Props) {
  const lijst = useVensters();
  const titelId = useId();
  const frame = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<Geometrie | null>(null);
  const sleep = useRef<{ soort: 'verplaats' | 'grootte'; px: number; py: number; g: Geometrie } | null>(null);
  const t = (k: keyof typeof T) => T[k][taal()];

  useLayoutEffect(() => { vensterBeheer.registreer(id, { titel, prioriteit, modaal }); return () => vensterBeheer.afmelden(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { vensterBeheer.registreer(id, { titel, prioriteit, modaal }); }, [id, titel, prioriteit, modaal]);

  // Beginpositie: bewaard, anders in het midden.
  useLayoutEffect(() => {
    const el = frame.current; if (!el) return;
    const bewaard = leesGeometrie(id);
    const z = vensterZone();
    const h0 = hoogte ?? Math.min(el.scrollHeight || 480, z.h - 2 * RAND);
    const b0 = Math.min(breedte, z.w - 2 * RAND);
    const basis: Geometrie = { b: b0, h: h0, x: z.x + (z.w - b0) / 2, y: z.y + Math.max(RAND, (z.h - h0) / 2), max: false };
    setGeo(binnenScherm(bewaard && Number.isFinite(bewaard.x) ? { ...basis, ...bewaard, h: bewaard.h ?? h0 } as Geometrie : basis));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Groeit de inhoud na het openen (eerst «Завантаження…», dan het hele venster), dan omhoog schuiven zodat de onderkant (de knoppen)
  // binnen het scherm blijft — ook in een klein popupvenster van een AI-klant. Niet als de gebruiker zelf de grootte vastzette.
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Natuurlijke hoogte = titelbalk + volledige inhoud (ook als max-height de rest nu laat scrollen).
    const natuurlijk = () => (el.querySelector<HTMLElement>('.venster-kop')?.offsetHeight ?? 0) + (el.querySelector<HTMLElement>('.venster-inhoud')?.scrollHeight ?? el.offsetHeight) + 2;
    const ro = new ResizeObserver(() => {
      if (sleep.current) return;
      setGeo((g) => {
        if (!g || g.max || g.vast) return g;
        const z = vensterZone(), onder = z.y + z.h - RAND, h = natuurlijk();
        return g.y + h <= onder || g.y <= z.y + RAND ? g : { ...g, y: Math.max(z.y + RAND, onder - h) };
      });
    });
    ro.observe(el);
    const inhoud = el.querySelector('.venster-inhoud');
    if (inhoud?.firstElementChild) ro.observe(inhoud.firstElementChild);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const opnieuw = () => setGeo((g) => (g ? binnenScherm(g) : g));
    window.addEventListener('resize', opnieuw);
    window.addEventListener('venster-dok-ruimte', opnieuw);
    return () => { window.removeEventListener('resize', opnieuw); window.removeEventListener('venster-dok-ruimte', opnieuw); };
  }, []);

  const s = stapel(lijst);
  const ik = s.find((x) => x.id === id);
  const rang = s.findIndex((x) => x.id === id);
  const z = VENSTER_BASIS + Math.max(0, rang) * 10;
  const klein = !!ik?.klein;
  const boven = bovensteZichtbaar(lijst);
  const bovenaan = boven?.id === id;
  // Onder een ander, zichtbaar MODAAL venster: niet bedienbaar (maar wel via het dok terug te halen).
  const bedekt = s.slice(rang + 1).some((x) => x.modaal && !x.klein);
  const smal = typeof window !== 'undefined' && window.innerWidth < 560;

  // Focus naar het venster als het bovenaan komt (en niet al iets erin focus heeft).
  useEffect(() => {
    if (!bovenaan || klein) return;
    const el = frame.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus],[data-autofocus]') ?? el).focus({ preventScroll: true });
  }, [bovenaan, klein]);

  const zet = useCallback((g: Geometrie, bewaar = true) => { const n = binnenScherm(g); setGeo(n); if (bewaar) bewaarGeometrie(id, n); }, [id]);
  const start = (soort: 'verplaats' | 'grootte') => (e: ReactPointerEvent) => {
    if (!geo || geo.max || smal || e.button !== 0) return;
    if (soort === 'verplaats' && (e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sleep.current = { soort, px: e.clientX, py: e.clientY, g: { ...geo, h: frame.current?.offsetHeight || geo.h } };
    e.preventDefault();
  };
  const beweeg = (e: ReactPointerEvent) => {
    const d = sleep.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    zet(d.soort === 'verplaats' ? { ...d.g, x: d.g.x + dx, y: d.g.y + dy } : { ...d.g, b: d.g.b + dx, h: d.g.h + dy, vast: true }, false);
  };
  const los = () => { if (sleep.current && geo) bewaarGeometrie(id, geo); sleep.current = null; };
  const toetsKop = (e: ReactKeyboardEvent) => {
    if (!geo || geo.max) return;
    const stap = e.altKey ? 2 : 16;
    const d = { ArrowLeft: [-stap, 0], ArrowRight: [stap, 0], ArrowUp: [0, -stap], ArrowDown: [0, stap] }[e.key as 'ArrowLeft'];
    if (!d) return;
    e.preventDefault();
    zet(e.shiftKey ? { ...geo, b: geo.b + d[0], h: (frame.current?.offsetHeight || geo.h) + d[1], vast: true } : { ...geo, x: geo.x + d[0], y: geo.y + d[1] });
  };
  const wisselMax = () => { if (geo) zet({ ...geo, max: !geo.max }); };

  // Tab binnen het venster houden (alleen als het bovenaan staat en modaal is).
  const toets = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape' && onSluit && !sluitenUit && bovenaan) { e.stopPropagation(); onSluit(); return; }
    if (e.key !== 'Tab' || !modaal || !bovenaan) return;
    const el = frame.current; if (!el) return;
    const f = [...el.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };

  // max-height vanaf de eigen bovenkant tot boven de strook van het dok: wat niet past, scrolt binnen het venster (de knoppen blijven
  // bereikbaar en liggen nooit onder het dok).
  const stijl = geo && !geo.max && !smal ? { left: geo.x, top: geo.y, width: geo.b, maxHeight: `calc(100dvh - ${Math.round(geo.y) + RAND}px - var(--venster-dok-onder, 0px))`, ...(geo.vast || hoogte ? { height: geo.h } : {}) } : undefined;
  return createPortal(
    <>
      {modaal && !klein ? <div className='venster-achter' style={{ zIndex: z - 1 }} aria-hidden='true' onPointerDown={() => vensterBeheer.naarVoren(id)} /> : null}
      <div
        ref={frame}
        className={`venster${geo?.max || smal ? ' is-max' : ''}${bovenaan ? ' is-boven' : ''}${klein ? ' is-klein' : ''} ${className}`.trim()}
        data-venster={id} data-prioriteit={prioriteit} data-bovenaan={bovenaan ? '1' : '0'}
        role='dialog' aria-modal={modaal && bovenaan ? 'true' : undefined} aria-labelledby={labelledBy || titelId} aria-describedby={describedBy}
        tabIndex={-1} lang={lang} hidden={klein} inert={bedekt || klein || undefined}
        style={{ zIndex: z, ...(stijl ?? {}), visibility: geo ? undefined : 'hidden' }}
        onPointerDownCapture={() => { if (!bovenaan) vensterBeheer.naarVoren(id); }}
        onKeyDown={toets}
      >
        <div className='venster-kop' onPointerDown={start('verplaats')} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los} onDoubleClick={wisselMax}>
          <div className='venster-greep' tabIndex={0} role='group' aria-label={`${titel}. ${t('verplaatsen')}`} title={t('verplaatsen')} onKeyDown={toetsKop}>
            <span id={titelId} className='venster-titel'>{kop ?? titel}</span>
          </div>
          <div className='venster-knoppen'>
            <button type='button' onClick={() => vensterBeheer.minimaliseer(id)} aria-label={t('minimaliseren')} title={t('minimaliseren')} data-venster-knop='min'><Minus aria-hidden='true' /></button>
            {!smal ? <button type='button' onClick={wisselMax} aria-label={geo?.max ? t('herstellen') : t('maximaliseren')} title={geo?.max ? t('herstellen') : t('maximaliseren')} data-venster-knop='max'>{geo?.max ? <Minimize2 aria-hidden='true' /> : <Maximize2 aria-hidden='true' />}</button> : null}
            {onSluit ? <button type='button' onClick={onSluit} disabled={sluitenUit} aria-label={t('sluiten')} title={t('sluiten')} data-venster-knop='sluit'><X aria-hidden='true' /></button> : null}
          </div>
        </div>
        <div className='venster-inhoud'>{children}</div>
        {!geo?.max && !smal ? <div className='venster-grootte' aria-hidden='true' title={t('grootte')} onPointerDown={start('grootte')} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los} /> : null}
      </div>
    </>,
    document.body,
  );
}

// ------------------------------------------------------------------------------------------------ dok (geminimaliseerd + wisselen)
// Regels in venster-dok-logica.ts. Kort: een smalle strook/pil/knop aan een schermrand die die strook voor zich vrijhoudt (vensters
// staan er nooit onder); de lijst is een menu dat alleen op een tik opengaat en sluit na een keuze, een tik erbuiten of Escape;
// het bovenste open venster staat er niet nog eens in («Зараз відкрите» als kopje, geen knop); slepen of «Перемістити …» kiest de rand.
const DOK_SLEUTEL = 'mijn-ruimte-venster-dok-v1';
function leesDok(): DokStand {
  try { const v = localStorage.getItem(DOK_SLEUTEL); return v ? normaliseerDokStand(JSON.parse(v)) : DOK_STANDAARD; } catch { return DOK_STANDAARD; }
}
function bewaarDok(s: DokStand) {
  try { localStorage.setItem(DOK_SLEUTEL, JSON.stringify(s)); } catch { /* geen opslag: het dok werkt, alleen de plaats wordt niet onthouden */ }
}
const RANDEN: readonly DokRand[] = ['onder', 'boven', 'links', 'rechts'];
/** Vrije strook voor vensters zetten (CSS-variabelen op <html> + zone voor de JS-geometrie) en het de vensters laten weten.
 *  `px`: hoeveel het dok van zijn rand inneemt (standaard DOK_RUIMTE; bovenaan onder de kopbalk meer). */
function zetDokVrij(rand: DokRand | null, px?: number) {
  const nieuw = dokRuimte(rand ? { rand, t: 0 } : null);
  if (rand && px !== undefined) nieuw[rand] = Math.max(0, Math.round(px));
  if (RANDEN.every((k) => nieuw[k] === dokVrij[k])) return;
  dokVrij = nieuw;
  const html = document.documentElement;
  for (const k of RANDEN) { if (nieuw[k]) html.style.setProperty(`--venster-dok-${k}`, `${nieuw[k]}px`); else html.style.removeProperty(`--venster-dok-${k}`); }
  if (rand) html.dataset.vensterDok = rand; else delete html.dataset.vensterDok;
  window.dispatchEvent(new Event('venster-dok-ruimte'));
}
/** Onderkant van de kopbalk van de site (menuknop, zoeken, account): een dok BOVENAAN komt eronder, niet eroverheen. */
const kopOnder = (boven: number) => {
  let m = 0;
  for (const el of document.querySelectorAll('.canonical-topbar, .canonical-menu-toggle, .canonical-avatar-trigger, .mail-top-search-shell, header button, header input, header a[href]')) {
    if (el.closest('.venster, .venster-dok')) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1 || b.height > 120 || b.top > boven + 56 || getComputedStyle(el).visibility === 'hidden') continue;
    m = Math.max(m, b.bottom);
  }
  return m;
};
/** De actiestapel als hindernis (25.10.2026): het echte element (met alle gereserveerde gniezda — ook lege), anders uit de indeling. */
const stapelRect = (vw: number, vh: number, inzet: number) => {
  const el = plaatsStaat().zones.actiestapel;
  if (el && el.isConnected) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) return { left: b.left, top: b.top, width: b.width, height: b.height }; }
  const s = plaatsStaat(), n = s.indeling.zones.actiestapel.lijst.length;
  return n ? stapelRechthoek(s.ctx.klasse, n, vw, vh, veiligeRand(), s.onder, inzet) : null;
};

function Dok() {
  const lijst = useVensters();
  const t = (k: keyof typeof T) => T[k][taal()];
  const [open, setOpen] = useState(false);
  const [stand, setStand] = useState<DokStand>(leesDok);
  const [, setTik] = useState(0); // opnieuw plaatsen bij resize / bel verplaatst
  const [sleep, setSleep] = useState<{ x: number; y: number } | null>(null);
  const [pilMaat, setPilMaat] = useState({ label: '', b: 0 }); // gemeten natuurlijke breedte van de pil, per opschrift
  const nav = useRef<HTMLElement | null>(null);
  const kopRef = useRef<HTMLButtonElement | null>(null);
  const negeerKlikTot = useRef(0);
  const sleepStop = useRef<(() => void) | null>(null);
  useEffect(() => () => sleepStop.current?.(), []);
  const menuId = useId();
  const s = useMemo(() => stapel(lijst), [lijst]);
  const boven = bovensteZichtbaar(lijst);
  // Het bovenste open venster is al in beeld: het dok toont alleen de ANDERE (geminimaliseerd of erachter).
  const anderen = [...s].reverse().filter((x) => x.id !== boven?.id);
  const zichtbaar = anderen.length > 0;

  useEffect(() => {
    const opnieuw = () => setTik((n) => n + 1);
    window.addEventListener('resize', opnieuw);
    window.visualViewport?.addEventListener('resize', opnieuw);
    window.addEventListener('tsv:plaatsing', opnieuw); // indeling of onderrand van de stapel veranderd (src/plaatsing/plaatsing-staat.ts)
    return () => { window.removeEventListener('resize', opnieuw); window.visualViewport?.removeEventListener('resize', opnieuw); window.removeEventListener('tsv:plaatsing', opnieuw); };
  }, []);
  // Vrije strook: alleen als het dok er is. Tijdens het slepen blijft de oude strook staan (geen springende vensters).
  const innameRef = useRef(0);
  useLayoutEffect(() => { if (!sleep) zetDokVrij(zichtbaar ? stand.rand : null, innameRef.current || undefined); });
  useEffect(() => () => zetDokVrij(null), []);
  // Menu sluiten: tik buiten het dok, Escape (ook als de focus elders staat), of als er niets meer te tonen is.
  useEffect(() => {
    if (!open) return;
    const buiten = (e: PointerEvent) => { if (nav.current && !nav.current.contains(e.target as Node)) setOpen(false); };
    // Escape sluit eerst het menu en gaat niet door naar een venster eronder (dat zou anders zelf sluiten).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); if (nav.current?.contains(document.activeElement)) kopRef.current?.focus(); } };
    document.addEventListener('pointerdown', buiten, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', buiten, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  useEffect(() => { if (!zichtbaar) setOpen(false); }, [zichtbaar]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280, vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const r = veiligeRand();
  const inzet = (() => { try { return window.self !== window.top ? 72 : 0; } catch { return 72; } })();
  // Bovenaan: onder de kopbalk (anders lagen menuknop/zoeken/account eronder). Alleen voor het dok; vensters houden hun eigen rand.
  const rDok = stand.rand === 'boven' ? { ...r, boven: Math.max(r.boven, kopOnder(r.boven)) } : r;
  const label = `${boven ? t('anderen') : t('geminimaliseerd')}: ${anderen.length}`;
  const pilB = pilMaat.label === label ? pilMaat.b : 0; // ander opschrift → eerst opnieuw meten
  const plek = dokPlaats(stand, vw, vh, rDok, pilB, dokHindernissen(stapelRect(vw, vh, inzet)));
  // Alleen als de pil echt niet past (smal scherm, > 360 px) wordt hij begrensd; anders heeft hij zijn natuurlijke breedte.
  const pilBegrensd = plek.vorm === 'pil' && pilB > plek.width + 1;
  // Wat het dok van zijn rand inneemt (zonder de veilige zone, die tellen vensters zelf): standaard 48 px, bovenaan onder de kopbalk meer.
  const inname = plek.rand === 'onder' ? vh - r.onder - plek.top : plek.rand === 'boven' ? plek.top + plek.height - r.boven : plek.rand === 'links' ? plek.left + plek.width - r.links : vw - r.rechts - plek.left;
  // Natuurlijke breedte van de pil meten (CSS: width:max-content, niet begrensd) — daarmee wijkt hij voor de bel. Vóór het tekenen
  // (layout-effect), dus zonder zichtbare sprong.
  useLayoutEffect(() => {
    if (plek.vorm !== 'pil' || sleep || open || pilBegrensd || !nav.current) return;
    const b = Math.ceil(nav.current.getBoundingClientRect().width);
    if (b && (pilMaat.label !== label || Math.abs(b - pilMaat.b) > 1)) setPilMaat({ label, b });
  });

  innameRef.current = inname;
  if (!zichtbaar) return null;
  const richting = dokMenuRichting(plek, vw, vh);
  const kritiek = anderen.some((x) => x.prioriteit === 'kritiek');
  const Pijl = { boven: ChevronUp, onder: ChevronDown, links: ChevronLeft, rechts: ChevronRight }[richting.naar];
  const vorm = sleep ? 'knop' : plek.vorm;
  const stijl: CSSProperties = sleep
    ? { zIndex: VENSTER_BASIS + s.length * 10 + 5, left: sleep.x, top: sleep.y, width: DOK_H, height: DOK_H }
    : { zIndex: VENSTER_BASIS + s.length * 10 + 5, left: plek.left, top: plek.top, height: plek.height, ...(plek.vorm === 'pil' ? (pilBegrensd ? { maxWidth: plek.width } : {}) : { width: plek.width }) };
  // Menu: naar binnen toe, niet hoger/breder dan de ruimte tot de overkant.
  const eind = richting.uitlijn === 'eind';
  const menuMax = richting.naar === 'boven' ? plek.top - 12 : richting.naar === 'onder' ? vh - plek.top - plek.height - 12 : eind ? plek.top + plek.height - 8 : vh - plek.top - 8;
  const menuBreed = richting.naar === 'rechts' ? vw - plek.left - plek.width - 12 : richting.naar === 'links' ? plek.left - 12 : plek.vorm === 'strook' ? vw - 16 : eind ? plek.left + plek.width - 8 : vw - plek.left - 8;

  const kies = (id: string) => { setOpen(false); vensterBeheer.naarVoren(id); };
  const verplaats = (rand: DokRand) => { const n = dokNaarRand(stand, rand); setStand(n); bewaarDok(n); setOpen(false); requestAnimationFrame(() => kopRef.current?.focus()); };

  // Slepen (pointer: muis, aanraking, pen). Pas na DOK_SLEEPDREMPEL px is het slepen; anders blijft het een tik op de knop.
  // De bewegingen komen via window binnen (de aanwijzer verlaat het dok meteen bij de eerste beweging); geen pointer capture bij het
  // neerdrukken, zodat een gewone tik een gewone klik op de knop blijft.
  const neer = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('.venster-dok-menu')) return;
    sleepStop.current?.();
    const d = { id: e.pointerId, x: e.clientX, y: e.clientY, actief: false };
    const beweeg = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      if (!d.actief) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < DOK_SLEEPDREMPEL) return;
        d.actief = true; setOpen(false);
      }
      ev.preventDefault();
      setSleep({ x: Math.min(Math.max(ev.clientX - DOK_H / 2, 0), window.innerWidth - DOK_H), y: Math.min(Math.max(ev.clientY - DOK_H / 2, 0), window.innerHeight - DOK_H) });
    };
    const los = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      stop();
      if (!d.actief) return;
      negeerKlikTot.current = performance.now() + 400;
      const n = dokStandVanPunt(ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);
      setStand(n); bewaarDok(n); setSleep(null);
    };
    const breek = (ev: PointerEvent) => { if (ev.pointerId !== d.id) return; stop(); if (d.actief) setSleep(null); };
    const stop = () => {
      window.removeEventListener('pointermove', beweeg); window.removeEventListener('pointerup', los); window.removeEventListener('pointercancel', breek);
      sleepStop.current = null;
    };
    window.addEventListener('pointermove', beweeg, { passive: false }); window.addEventListener('pointerup', los); window.addEventListener('pointercancel', breek);
    sleepStop.current = stop;
  };

  return (
    <nav ref={nav} className={`venster-dok${sleep ? ' is-sleept' : ''}${kritiek ? ' is-kritiek' : ''}`} aria-label={t('dok')}
      data-dok-rand={plek.rand} data-dok-vorm={vorm} data-dok-menu-naar={richting.naar} data-dok-uitlijn={richting.uitlijn} style={stijl}
      onPointerDown={neer}
      onClickCapture={(e) => { if (performance.now() < negeerKlikTot.current) { e.preventDefault(); e.stopPropagation(); } }}>
      {vorm !== 'knop' ? <span className='venster-dok-greep' data-dok-greep='1' title={t('greep')} aria-hidden='true'><GripVertical /></span> : null}
      <button ref={kopRef} type='button' className='venster-dok-kop' aria-expanded={open} aria-controls={menuId}
        aria-label={vorm === 'knop' ? `${t('dok')}. ${label}` : undefined} title={vorm === 'knop' ? label : undefined} onClick={() => setOpen((o) => !o)}>
        <AppWindow aria-hidden='true' />
        {vorm === 'knop' ? <span className='venster-dok-teller' aria-hidden='true'>{anderen.length}</span> : <span className='venster-dok-label'>{label}</span>}
        {vorm !== 'knop' ? <Pijl className='venster-dok-pijl' aria-hidden='true' /> : null}
      </button>
      <div id={menuId} className='venster-dok-menu' data-dok-menu='1' hidden={!open} style={{ maxHeight: Math.max(120, menuMax), maxWidth: Math.max(200, menuBreed) }}>
        {boven ? <p className='venster-dok-nu'>{t('nu')}: <b>{boven.titel}</b></p> : null}
        <ul aria-label={t('lijst')}>
          {anderen.map((x) => (
            <li key={x.id}>
              <button type='button' className={`venster-dok-item${x.klein ? ' is-klein' : ''}${x.prioriteit === 'kritiek' ? ' is-kritiek' : ''}`}
                onClick={() => kies(x.id)} data-dok-venster={x.id}>
                <span className='venster-dok-titel'>{x.titel}</span>
                {x.prioriteit === 'kritiek' ? <small>{t('wacht')}</small> : x.wacht ? <small>{t('wachtOp')}</small> : x.klein ? <small>{t('tonen')}</small> : <small>{t('achter')}</small>}
              </button>
            </li>
          ))}
        </ul>
        <div className='venster-dok-verplaats' role='group' aria-label={t('verplaats')}>
          <span aria-hidden='true'>{t('verplaats')}</span>
          {([['boven', ArrowUp, 'naarBoven'], ['onder', ArrowDown, 'naarOnder'], ['links', ArrowLeft, 'naarLinks'], ['rechts', ArrowRight, 'naarRechts']] as const).map(([rand, Icoon, k]) => (
            <button key={rand} type='button' data-dok-naar={rand} aria-label={t(k)} title={t(k)} aria-pressed={stand.rand === rand} onClick={() => verplaats(rand)}><Icoon aria-hidden='true' /></button>
          ))}
        </div>
      </div>
    </nav>
  );
}
let dokGemaakt = false;
function dokZeker() {
  if (dokGemaakt || typeof document === 'undefined') return;
  dokGemaakt = true;
  const el = document.createElement('div');
  el.id = 'venster-dok-wortel';
  document.body.appendChild(el);
  createRoot(el).render(<Dok />);
}

/** Toetsenbord: Alt+Shift+W wisselt naar het volgende open venster (ook geminimaliseerde). */
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!(e.altKey && e.shiftKey && (e.key === 'W' || e.key === 'w' || e.code === 'KeyW'))) return;
    const s = stapel(); if (s.length < 2) return;
    e.preventDefault();
    vensterBeheer.naarVoren(s[0].id); // de onderste naar boven = rondgaan
  });
}
