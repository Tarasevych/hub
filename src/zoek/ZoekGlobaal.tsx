// HET GLOBALE ZOEKVELD IN DE BOVENBALK + HET PALET ⌘K (zone Z4, 22.10.2026; specificatie §11 «верхня панель»).
// Op elke dienst (CanonicalChrome): een veld-knop «Zoeken in Mijn Ruimte… ⌘K» (computer) of een ronde zoekknop (telefoon).
// ⌘K / Ctrl+K opent het palet boven de pagina: hetzelfde autodoploen als /zoek (functies en pagina's eerst, dan correcties,
// synoniemen, aanvullingen; eigen geschiedenis), Enter zonder keuze → hub /zoek?q=…, een keuze met route → die pagina,
// Escape sluit en zet de focus terug waar hij was. role=dialog + aria-modal + Tab blijft binnen (toegankelijk.ts).
// 24.10.2026 (één update, op verzoek van de eigenaar): op de POST ligt de globale zoekknop niet meer boven het accountmenu van de post —
// op de telefoon bedekte de ronde knop rechtsboven het Gmail-avatar (het «G»-logo stak eronder uit), op de computer bedekte het veld
// «Оновити пошту», «Швидкі налаштування» en het accountmenu. Daar staat de knop IN HET MENU (ZoekMenuKnop): in de lade tussen de
// profielfoto en «Редагувати меню», op de computer in de werkbalk van de zijbalk vlak vóór «Налаштувати меню». Het palet zelf blijft
// één instantie in de bovenbalk (ZoekGlobaal zonderKnop): ⌘K/Ctrl+K en PALET_EVENT werken op elke breedte, ook als de lade dicht is.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as RKE } from 'react';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { focusTerug, focusbaar, houdTab } from '../platform/toegankelijk';
import type { ZoekSuggestie } from '../../shared/zoek-model';
import { geschiedenisLijst, suggesties as haalSuggesties, type GeschiedenisRij } from './zoek-api';
import { norm, routeUrl, type Lang } from './zoek-kern';
import ZoekVeld, { type VeldSuggestie } from './ZoekVeld';
import './zoek.css';

export const PALET_EVENT = 'tsv:zoek-palet';
export const openZoekPalet = () => window.dispatchEvent(new CustomEvent(PALET_EVENT));
const DEBOUNCE_MS = 250;
const T = {
  uk: { veld: 'Пошук у «Мій простір»…', open: 'Відкрити пошук (⌘K)', menu: 'Пошук у «Мій простір»', titel: 'Швидкий пошук', ph: 'Функція, сторінка, лист, файл…', alles: (q: string) => `Усі результати для «${q}» на сторінці пошуку`, naarZoek: 'Відкрити сторінку пошуку', sluit: 'Закрити', hint: 'Enter — усі результати · ↑↓ — вибір · Esc — закрити' },
  nl: { veld: 'Zoeken in «Mijn Ruimte»…', open: 'Zoeken openen (⌘K)', menu: 'Zoeken in «Mijn Ruimte»', titel: 'Snel zoeken', ph: 'Functie, pagina, e-mail, bestand…', alles: (q: string) => `Alle resultaten voor «${q}» op de zoekpagina`, naarZoek: 'Zoekpagina openen', sluit: 'Sluiten', hint: 'Enter — alle resultaten · ↑↓ — kiezen · Esc — sluiten' },
};
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const zoekPaginaUrl = (lang: Lang, q = '', extra: Record<string, string> = {}): string => {
  const u = new URL(canonicalNavigationUrl('hub', 'zoek', lang));
  if (q.trim()) u.searchParams.set('q', q.trim().slice(0, 300));
  for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
  u.searchParams.set('lang', lang);
  return u.toString();
};

// Focus na het sluiten als de knop waarmee het palet openging niet meer bestaat (de lade sloot bij het openen): een zoekknop die er nog
// is, anders de menuknop die de lade opent (daar staat de zoekknop van de post).
const TERUG_ALS_KNOP_WEG = '[data-zoek-trigger], .canonical-menu-toggle[data-sidebar-action="open-drawer"]';

/** De zoekknop IN HET MENU (alleen op de post, 24.10.2026): rond icoon met hetzelfde palet als ⌘K. `voorOpenen` sluit bijvoorbeeld
 *  eerst de lade, zodat het palet niet boven een open lade ligt. `tooltip` = de tooltiplaag van de zijbalk (data-tooltip) i.p.v. title. */
export function ZoekMenuKnop({ lang, className = 'zk-menu-knop', voorOpenen, sneltoets = false, tooltip = false, tooltipKant, knopRef }: { lang: Lang; className?: string; voorOpenen?: () => void; sneltoets?: boolean; tooltip?: boolean; tooltipKant?: 'left' | 'right'; knopRef?: (b: HTMLButtonElement | null) => void }) {
  const tekst = sneltoets ? `${T[lang].menu} (${isMac() ? '⌘K' : 'Ctrl K'})` : T[lang].menu;
  return <button type='button' ref={knopRef} className={className} aria-label={tekst} aria-keyshortcuts='Control+K Meta+K' aria-haspopup='dialog' title={tooltip ? undefined : tekst} data-tooltip={tooltip ? tekst : undefined} data-tooltip-placement={tooltip ? tooltipKant : undefined} data-zoek-trigger='menu' onClick={() => { voorOpenen?.(); openZoekPalet(); }}><Search aria-hidden='true' /></button>;
}

export default function ZoekGlobaal({ lang, mobiel = false, dienst = '', zonderKnop = false }: { lang: Lang; mobiel?: boolean; dienst?: string; /** alleen het palet + ⌘K (de knop staat elders, bijv. ZoekMenuKnop in het menu van de post) */ zonderKnop?: boolean }) {
  const t = T[lang]; const uid = useId();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [server, setServer] = useState<ZoekSuggestie[]>([]); const [gesch, setGesch] = useState<GeschiedenisRij[]>([]);
  const vorigeFocus = useRef<HTMLElement | null>(null); const paneel = useRef<HTMLElement | null>(null); const input = useRef<HTMLInputElement | null>(null); const ctl = useRef<AbortController | null>(null);
  const opZoekPagina = dienst === 'hub' && /^\/zoek(\/|$)/.test(location.pathname);
  const doOpen = useCallback(() => { vorigeFocus.current = document.activeElement as HTMLElement | null; setOpen(true); }, []);
  const doClose = useCallback(() => { setOpen(false); setQ(''); setServer([]); window.setTimeout(() => { if (!focusTerug(vorigeFocus.current) && !focusTerug(document.querySelector<HTMLElement>(TERUG_ALS_KNOP_WEG))) document.body.focus(); }, 0); }, []);
  // ⌘K / Ctrl+K overal; «/» blijft vrij (sommige pagina's gebruiken het zelf). Niet in een bewerkbaar veld met modifiers van de browser.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); if (open) doClose(); else doOpen(); } };
    const o = () => doOpen();
    window.addEventListener('keydown', h); window.addEventListener(PALET_EVENT, o);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener(PALET_EVENT, o); };
  }, [open, doOpen, doClose]);
  useEffect(() => { if (!open) return; input.current?.focus(); geschiedenisLijst().then(setGesch).catch(() => setGesch([])); }, [open]);
  useEffect(() => {
    if (!open) return; ctl.current?.abort(); const v = q.trim(); if (!v) { setServer([]); return; }
    const ac = new AbortController(); ctl.current = ac;
    const id = window.setTimeout(() => haalSuggesties(v, 8, { signal: ac.signal }).then(s => { if (!ac.signal.aborted) setServer(s); }).catch(() => { if (!ac.signal.aborted) setServer([]); }), DEBOUNCE_MS);
    return () => { window.clearTimeout(id); ac.abort(); };
  }, [q, open]);
  const lijst: VeldSuggestie[] = useMemo(() => {
    const v = norm(q); const volgorde: Record<ZoekSuggestie['soort'], number> = { functie: 0, pagina: 1, categorie: 2, correctie: 3, synoniem: 4, aanvulling: 5 };
    const uitGesch: VeldSuggestie[] = (v ? gesch.filter(g => norm(g.vraag).startsWith(v) && norm(g.vraag) !== v).slice(0, 2) : gesch.slice(0, 5)).map(g => ({ soort: 'geschiedenis', tekst: g.vraag, id: g.id, aantal: g.totaal }));
    const gezien = new Set(uitGesch.map(x => norm(x.tekst)));
    return [...[...server].sort((a, b) => volgorde[a.soort] - volgorde[b.soort]).filter(s => { const k = norm(s.tekst); if (gezien.has(k)) return false; gezien.add(k); return true; }), ...uitGesch].slice(0, 9);
  }, [q, server, gesch]);
  const naarZoek = (tekst: string) => { location.assign(zoekPaginaUrl(lang, tekst)); };
  const kies = (s: VeldSuggestie): boolean => { if ((s.soort === 'functie' || s.soort === 'pagina') && s.route) { const url = routeUrl(s.route, lang); if (url) { location.assign(url); return true; } } return false; };
  // Escape sluit het palet METEEN (capture: vóór het veld de lijst zou sluiten) en zet de focus terug; Tab blijft binnen.
  const onKeyCapture = (e: RKE<HTMLElement>) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doClose(); } };
  const onKey = (e: RKE<HTMLElement>) => { houdTab(e, focusbaar(paneel.current), { houder: paneel.current }); };
  return (
    <>
      {zonderKnop ? null : mobiel
        ? <button type='button' className='zk-trigger-mobiel' aria-label={t.open} aria-keyshortcuts='Control+K Meta+K' data-zoek-trigger='mobiel' onClick={doOpen}><Search aria-hidden='true' /></button>
        : <button type='button' className='zk-trigger' aria-label={t.open} aria-keyshortcuts='Control+K Meta+K' data-zoek-trigger='veld' onClick={doOpen}><Search aria-hidden='true' /><span className='zk-trigger-tekst'>{t.veld}</span><kbd aria-hidden='true'>{isMac() ? '⌘' : 'Ctrl'} K</kbd></button>}
      {open && (
        <div className='zk-palet-achter' onMouseDown={e => { if (e.target === e.currentTarget) doClose(); }} data-zoek-palet='open'>
          <section ref={paneel} className='zk-palet kaart' role='dialog' aria-modal='true' aria-labelledby={`${uid}-h`} tabIndex={-1} onKeyDownCapture={onKeyCapture} onKeyDown={onKey}>
            <h2 id={`${uid}-h`} className='zk-sr'>{t.titel}</h2>
            <ZoekVeld lang={lang} value={q} onChange={setQ} onSubmit={naarZoek} onKies={kies} suggesties={lijst} placeholder={t.ph} label={t.titel} inputRef={input} autoFocus onEscapeLeeg={doClose} beschrijvingId={`${uid}-hint`} />
            <div className='zk-palet-voet'>
              {q.trim().length >= 2 ? <button type='button' className='knop knop-stil is-klein zk-palet-alles' onClick={() => naarZoek(q)}><CornerDownLeft aria-hidden='true' />{t.alles(q.trim())}</button>
                : !opZoekPagina && <a className='knop knop-stil is-klein' href={zoekPaginaUrl(lang)}><ArrowRight aria-hidden='true' />{t.naarZoek}</a>}
              <small id={`${uid}-hint`} className='zk-palet-hint'>{t.hint}</small>
            </div>
          </section>
        </div>)}
    </>);
}
