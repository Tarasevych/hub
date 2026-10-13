// Vensterbeheer van de site (één plek voor ALLE vensters boven de pagina): welke bovenaan staat, verplaatsen, groter/kleiner,
// maximaliseren, minimaliseren naar het dok en wisselen tussen vensters.
//
// Regels (na het incident van 9.10: «Підтвердіть доступ» stond ONDER het toestemmingsvenster van Claude en was onzichtbaar):
//   1. Een venster dat later opent, staat boven een venster dat eerder opende (een gevolg verschijnt dus altijd boven de oorzaak).
//   2. Prioriteit «kritiek» (bevestigen van toegang, passkey) staat altijd boven «normaal», wat er ook gebeurt.
//   3. Alle vensters gebruiken dezelfde laag (VENSTER_BASIS, hoger dan elk ander paneel van de site); geen losse z-index meer.
//   4. Een venster onder een ander modaal venster is `inert` (geen focus, geen klikken) — maar zichtbaar in het dok en met één klik
//      terug naar voren te halen. Niets kan meer onzichtbaar «wachten».
//   5. Minimaliseren: het venster verdwijnt naar het dok rechtsonder (zoals geminimaliseerde brieven in Пошта); het verzoek loopt door.
//   6. Positie en grootte per venster blijven bewaard (localStorage, alleen gemak; zonder opslag werkt alles gewoon).
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AppWindow, Maximize2, Minimize2, Minus, X } from 'lucide-react';
import './vensters.css';

import { RAND, binnenScherm as binnen, bovensteZichtbaar as bovenste, stapel as stapelVan, type Geometrie, type Item, type VensterPrioriteit } from './vensters-logica';
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
const binnenScherm = (g: Geometrie) => binnen(g, window.innerWidth, window.innerHeight);

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
    const h0 = hoogte ?? Math.min(el.scrollHeight || 480, window.innerHeight - 2 * RAND);
    const b0 = Math.min(breedte, window.innerWidth - 2 * RAND);
    const basis: Geometrie = { b: b0, h: h0, x: (window.innerWidth - b0) / 2, y: Math.max(RAND, (window.innerHeight - h0) / 2), max: false };
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
        const onder = window.innerHeight - RAND, h = natuurlijk();
        return g.y + h <= onder || g.y <= RAND ? g : { ...g, y: Math.max(RAND, onder - h) };
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
    return () => window.removeEventListener('resize', opnieuw);
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

  // max-height vanaf de eigen bovenkant: wat niet past, scrolt binnen het venster (de knoppen blijven bereikbaar).
  const stijl = geo && !geo.max && !smal ? { left: geo.x, top: geo.y, width: geo.b, maxHeight: `calc(100dvh - ${Math.round(geo.y) + RAND}px)`, ...(geo.vast || hoogte ? { height: geo.h } : {}) } : undefined;
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
function Dok() {
  const lijst = useVensters();
  const [open, setOpen] = useState(true);
  const t = (k: keyof typeof T) => T[k][taal()];
  const s = useMemo(() => stapel(lijst), [lijst]);
  const boven = bovensteZichtbaar(lijst);
  const klein = s.filter((x) => x.klein);
  // Alleen tonen als er iets te halen valt: een geminimaliseerd venster, of meer dan één open venster (wisselen).
  if (!klein.length && s.length < 2) return null;
  return (
    <nav className='venster-dok' aria-label={t('dok')} style={{ zIndex: VENSTER_BASIS + s.length * 10 + 5 }}>
      <button type='button' className='venster-dok-kop' aria-expanded={open} onClick={() => setOpen(!open)}><AppWindow aria-hidden='true' />{t('dok')}: {s.length}</button>
      {open ? <ul>
        {[...s].reverse().map((x) => (
          <li key={x.id}>
            <button type='button' className={`venster-dok-item${x.id === boven?.id ? ' is-actief' : ''}${x.klein ? ' is-klein' : ''}${x.prioriteit === 'kritiek' ? ' is-kritiek' : ''}`}
              aria-current={x.id === boven?.id ? 'true' : undefined} onClick={() => vensterBeheer.naarVoren(x.id)} data-dok-venster={x.id}>
              <span className='venster-dok-titel'>{x.titel}</span>
              {x.prioriteit === 'kritiek' && x.id !== boven?.id ? <small>{t('wacht')}</small> : x.wacht ? <small>{t('wachtOp')}</small> : x.klein ? <small>{t('tonen')}</small> : null}
            </button>
          </li>
        ))}
      </ul> : null}
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
