// HET GLOBALE ZOEKVELD IN DE BOVENBALK (zoekronde 02.11.2026, vervangt het modale palet ⌘K van 22.10.2026).
// Klik op de veldknop (of ⌘K / Ctrl+K) en het veld klapt uit op dezelfde plek, zoals Windows-zoeken: het uitklapvenster valt
// eronder met de recente zoekopdrachten (per account, alleen op dit apparaat: zoek-recent.ts) of, bij typen, de suggesties van de
// server. Klikken op het veld zelf navigeert NIET. Enter, een gekozen zoekopdracht of de knop «Сторінка пошуку» gaat naar de
// volledige zoekpagina met de getypte tekst (die toont meteen alle resultaten). Geen nieuw venster.
// Escape: eerst de lijst dicht, dan het veld (focus terug). Klik ernaast sluit het venster. Toetsenbord in de lijst: ZoekVeld.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Search, Trash2 } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { focusTerug } from '../platform/toegankelijk';
import type { ZoekSuggestie } from '../../shared/zoek-model';
import { suggesties as haalSuggesties } from './zoek-api';
import { norm, relatiefTijd, routeUrl, type Lang } from './zoek-kern';
import { CATEGORIE_NAAM, type Categorie } from './zoek-logica';
import { CATEGORIE_ICOON } from './ZoekCategorieIcoon';
import { bewaarRecent, leesRecent, RECENT_MAX, wisRecent, type RecenteZoekopdracht } from './zoek-recent';
import ZoekVeld, { type VeldSuggestie } from './ZoekVeld';
import './zoek.css';

export const PALET_EVENT = 'tsv:zoek-palet';
export const openZoekPalet = () => window.dispatchEvent(new CustomEvent(PALET_EVENT));
const DEBOUNCE_MS = 250;
const UITKLAP_MAX_PX = 576; // 36rem: de breedte waarop het uitklapvenster niet verder groeit
const T = {
  uk: { veld: 'Пошук у «Мій простір»…', open: 'Відкрити пошук (⌘K)', menu: 'Пошук у «Мій простір»', titel: 'Швидкий пошук', ph: 'Функція, сторінка, лист, файл…', zoekpagina: 'Сторінка пошуку', zoekpaginaTitel: 'Відкрити сторінку пошуку з цим текстом', wisRecent: 'Очистити нещодавні', geenRecent: 'Тут з’являться ваші останні пошуки на цьому пристрої.', hint: 'Enter — сторінка пошуку з усіма результатами · ↑↓ — вибір · Esc — закрити' },
  nl: { veld: 'Zoeken in «Mijn Ruimte»…', open: 'Zoeken openen (⌘K)', menu: 'Zoeken in «Mijn Ruimte»', titel: 'Snel zoeken', ph: 'Functie, pagina, e-mail, bestand…', zoekpagina: 'Zoekpagina', zoekpaginaTitel: 'Zoekpagina openen met deze tekst', wisRecent: 'Recent wissen', geenRecent: 'Hier verschijnen uw laatste zoekopdrachten op dit apparaat.', hint: 'Enter — zoekpagina met alle resultaten · ↑↓ — kiezen · Esc — sluiten' },
};
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const zoekPaginaUrl = (lang: Lang, q = '', extra: Record<string, string> = {}): string => {
  const u = new URL(canonicalNavigationUrl('hub', 'zoek', lang));
  if (q.trim()) u.searchParams.set('q', q.trim().slice(0, 300));
  for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
  u.searchParams.set('lang', lang);
  return u.toString();
};

// Focus na het sluiten als de knop waarmee het venster openging niet meer bestaat: een zoekknop die er nog is, anders de menuknop
// die de lade opent (daar staat de zoekknop van de post).
const TERUG_ALS_KNOP_WEG = '[data-zoek-trigger], .canonical-menu-toggle[data-sidebar-action="open-drawer"]';

// Het zoeken hoort bij de dienst waarin je staat: mail zoekt in de mail, cloud in de bestanden, enz. (alleen de standaardkeuze).
const sectieVan = (dienst: string): Categorie => (dienst === 'mail' ? 'mail' : dienst === 'cloud' ? 'files' : dienst === 'github' ? 'github' : 'all');

/** De zoekknop IN HET MENU (alleen op de post, 24.10.2026): rond icoon dat hetzelfde uitklapvenster opent als ⌘K. `voorOpenen` sluit
 *  bijvoorbeeld eerst de lade, zodat het venster niet boven een open lade ligt. `tooltip` = de tooltiplaag van de zijbalk (data-tooltip). */
export function ZoekMenuKnop({ lang, className = 'zk-menu-knop', voorOpenen, sneltoets = false, tooltip = false, tooltipKant, knopRef }: { lang: Lang; className?: string; voorOpenen?: () => void; sneltoets?: boolean; tooltip?: boolean; tooltipKant?: 'left' | 'right'; knopRef?: (b: HTMLButtonElement | null) => void }) {
  const tekst = sneltoets ? `${T[lang].menu} (${isMac() ? '⌘K' : 'Ctrl K'})` : T[lang].menu;
  return <button type='button' ref={knopRef} className={className} aria-label={tekst} aria-keyshortcuts='Control+K Meta+K' aria-haspopup='dialog' title={tooltip ? undefined : tekst} data-tooltip={tooltip ? tekst : undefined} data-tooltip-placement={tooltip ? tooltipKant : undefined} data-zoek-trigger='menu' onClick={() => { voorOpenen?.(); openZoekPalet(); }}><Search aria-hidden='true' /></button>;
}

type Positie = { top: number; left: number; width: number };

export default function ZoekGlobaal({ lang, mobiel = false, dienst = '', zonderKnop = false }: { lang: Lang; mobiel?: boolean; dienst?: string; /** alleen het uitklapvenster + ⌘K (de knop staat elders, bijv. ZoekMenuKnop in het menu van de post) */ zonderKnop?: boolean }) {
  const t = T[lang]; const uid = useId();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [server, setServer] = useState<ZoekSuggestie[]>([]); const [recent, setRecent] = useState<RecenteZoekopdracht[]>([]);
  const [pos, setPos] = useState<Positie | null>(null);
  const vorigeFocus = useRef<HTMLElement | null>(null); const anker = useRef<HTMLDivElement | null>(null); const paneel = useRef<HTMLDivElement | null>(null); const input = useRef<HTMLInputElement | null>(null); const ctl = useRef<AbortController | null>(null);
  const sectie = sectieVan(dienst);
  const doOpen = useCallback(() => { vorigeFocus.current = document.activeElement as HTMLElement | null; setRecent(leesRecent()); setOpen(true); }, []);
  const doClose = useCallback(() => { setOpen(false); setQ(''); setServer([]); window.setTimeout(() => { if (!focusTerug(vorigeFocus.current) && !focusTerug(document.querySelector<HTMLElement>(TERUG_ALS_KNOP_WEG))) document.body.focus(); }, 0); }, []);

  // Positie van het uitklapvenster: op de plek van de veldknop (zoals Windows-zoeken), in het beeld gehouden. Het venster is
  // geportaleerd naar body, dus de coördinaten zijn die van het beeld (ook met de technische band erboven).
  const meet = useCallback(() => {
    const vw = document.documentElement.clientWidth;
    const breed = Math.min(UITKLAP_MAX_PX, vw - 16);
    const r = anker.current?.getBoundingClientRect();
    // Telefoon of zonder eigen knop (de knop staat in het menu): midden bovenaan, de volle breedte die past.
    if (mobiel || zonderKnop || !r || r.width === 0) { setPos({ top: 8, left: Math.max(8, (vw - breed) / 2), width: mobiel ? vw - 16 : breed }); return; }
    const width = Math.max(r.width, breed);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
    setPos({ top: Math.max(8, r.top), left, width });
  }, [mobiel, zonderKnop]);
  useLayoutEffect(() => { if (open) meet(); }, [open, meet]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', meet); window.addEventListener('scroll', meet, true);
    return () => { window.removeEventListener('resize', meet); window.removeEventListener('scroll', meet, true); };
  }, [open, meet]);

  // ⌘K / Ctrl+K overal; «/» blijft vrij (sommige pagina's gebruiken het zelf). Niet in een bewerkbaar veld met modifiers van de browser.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); if (open) doClose(); else doOpen(); } };
    const o = () => { if (!open) doOpen(); else input.current?.focus(); };
    window.addEventListener('keydown', h); window.addEventListener(PALET_EVENT, o);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener(PALET_EVENT, o); };
  }, [open, doOpen, doClose]);

  // Klik buiten het veld en het venster sluit het (geen navigatie, geen nieuw venster).
  useEffect(() => {
    if (!open) return;
    const buiten = (e: Event) => { const x = e.target as Node | null; if (x && !anker.current?.contains(x) && !paneel.current?.contains(x)) doClose(); };
    document.addEventListener('pointerdown', buiten);
    return () => document.removeEventListener('pointerdown', buiten);
  }, [open, doClose]);

  useEffect(() => {
    if (!open) return; ctl.current?.abort(); const v = q.trim(); if (!v) { setServer([]); return; }
    const ac = new AbortController(); ctl.current = ac;
    const id = window.setTimeout(() => haalSuggesties(v, 8, { signal: ac.signal }).then(s => { if (!ac.signal.aborted) setServer(s); }).catch(() => { if (!ac.signal.aborted) setServer([]); }), DEBOUNCE_MS);
    return () => { window.clearTimeout(id); ac.abort(); };
  }, [q, open]);

  // Lijst: bij leeg veld de recente zoekopdrachten; bij typen de suggesties van de server, daarna de recente die erbij passen.
  const lijst: VeldSuggestie[] = useMemo(() => {
    const v = norm(q); const volgorde: Record<ZoekSuggestie['soort'], number> = { functie: 0, pagina: 1, categorie: 2, correctie: 3, synoniem: 4, aanvulling: 5 };
    const uitRecent: VeldSuggestie[] = recent
      .filter(r => (v ? norm(r.vraag).startsWith(v) && norm(r.vraag) !== v : true))
      .slice(0, v ? 3 : RECENT_MAX)
      .map(r => ({ soort: 'geschiedenis' as const, tekst: r.vraag, id: String(r.tijd), icoon: CATEGORIE_ICOON[r.sectie], meta: `${CATEGORIE_NAAM[r.sectie][lang]} · ${relatiefTijd(r.tijd, lang)}` }));
    const gezien = new Set(uitRecent.map(x => norm(x.tekst)));
    const uitServer = [...server].sort((a, b) => volgorde[a.soort] - volgorde[b.soort]).filter(s => { const k = norm(s.tekst); if (gezien.has(k)) return false; gezien.add(k); return true; });
    return [...uitServer, ...uitRecent].slice(0, 9);
  }, [q, server, recent, lang]);

  // Alle zoekopdrachten gaan via hier: bewaren op dit apparaat en naar de zoekpagina met de tekst (zelfde tabblad).
  const naarZoek = (tekst: string) => {
    const v = tekst.trim();
    if (v) bewaarRecent(v, sectie);
    location.assign(zoekPaginaUrl(lang, v, sectie === 'all' ? {} : { cat: sectie }));
  };
  // Een functie of pagina met een route gaat rechtstreeks daarheen; alles anders is een zoekopdracht (ZoekVeld → naarZoek).
  const kies = (s: VeldSuggestie): boolean => { if ((s.soort === 'functie' || s.soort === 'pagina') && s.route) { const url = routeUrl(s.route, lang); if (url) { location.assign(url); return true; } } return false; };
  const wisRecentKlik = () => { wisRecent(); setRecent([]); input.current?.focus(); };

  // Escape wordt in ZoekVeld afgehandeld (eerst de lijst, dan het veld); is het dan nog niet gebruikt, dan sluit het venster.
  const onKey = (e: RKE<HTMLElement>) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); doClose(); } };

  // Vaste rij onder de lijst: wissen van de recente zoekopdrachten en een korte toelichting.
  const voet = (
    <div className='zk-pop-voet'>
      {!q.trim() && recent.length > 0
        ? <button type='button' className='zk-pop-wis' onMouseDown={e => e.preventDefault()} onClick={wisRecentKlik}><Trash2 aria-hidden='true' />{t.wisRecent}</button>
        : <span className='zk-pop-leeg'>{!q.trim() ? t.geenRecent : ''}</span>}
      <small id={`${uid}-hint`} className='zk-pop-hint'>{t.hint}</small>
    </div>);

  const trigger = mobiel
    ? <button type='button' className={`zk-trigger-mobiel${open ? ' is-verborgen' : ''}`} aria-label={t.open} aria-keyshortcuts='Control+K Meta+K' aria-expanded={open} data-zoek-trigger='mobiel' onClick={doOpen}><Search aria-hidden='true' /></button>
    : <button type='button' className={`zk-trigger${open ? ' is-verborgen' : ''}`} aria-label={t.open} aria-keyshortcuts='Control+K Meta+K' aria-expanded={open} aria-haspopup='listbox' data-zoek-trigger='veld' onClick={doOpen}><Search aria-hidden='true' /><span className='zk-trigger-tekst'>{t.veld}</span><kbd aria-hidden='true'>{isMac() ? '⌘' : 'Ctrl'} K</kbd></button>;

  return (
    <>
      {zonderKnop ? null : <div ref={anker} className={`zk-anker${open ? ' is-open' : ''}${mobiel ? ' is-mobiel' : ''}`}>{trigger}</div>}
      {open && pos ? createPortal(
        <div ref={paneel} className={`zk-uitklap${mobiel ? ' is-mobiel' : ''}`} style={{ top: pos.top, left: pos.left, width: pos.width }} data-zoek-palet='open' onKeyDown={onKey}>
          <ZoekVeld lang={lang} value={q} onChange={setQ} onSubmit={naarZoek} onKies={kies} suggesties={lijst} placeholder={t.ph} label={t.titel} inputRef={input} autoFocus onEscapeLeeg={doClose} beschrijvingId={`${uid}-hint`} voet={voet}
            rechts={<button type='button' className='zk-naar-pagina' onMouseDown={e => e.preventDefault()} onClick={() => naarZoek(q)} aria-label={t.zoekpaginaTitel} title={t.zoekpaginaTitel}><ArrowUpRight aria-hidden='true' /><span>{t.zoekpagina}</span></button>} />
        </div>, document.body) : null}
    </>);
}
