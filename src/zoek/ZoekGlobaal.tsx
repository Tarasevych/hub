// HET GLOBALE ZOEKVELD IN DE BOVENBALK (zoekronde 02.11.2026, vervangt het modale palet ⌘K van 22.10.2026; INTEG-001 03.11.2026: menu).
// Klik op de veldknop (of ⌘K / Ctrl+K) en het veld klapt uit op dezelfde plek, zoals Windows-zoeken: er opent een MENU eronder met
//   • bij een leeg veld de recente zoekopdrachten, elk met TYPE (zoekopdracht / functie / pagina), PICTOGRAM en SECTIE (zoek-recent.ts: per
//     account, alleen op dit apparaat);
//   • bij typen de suggesties van de server, het HUIDIGE RESULTAAT van de zoekopdracht (de eerste resultaten, met type en sectie) en de
//     recente die bij de tekst passen. Klikken op het veld zelf navigeert NIET en er opent geen nieuw venster.
// Toetsen: Enter zoekt (in het menu: het resultaat verschijnt meteen, niet pas na de wachttijd), ↑/↓ lopen door alle rijen (rond), Enter op een
// rij opent die rij (resultaat/functie/pagina) of voert een recente zoekopdracht opnieuw uit, Esc sluit het menu (één keer, focus terug),
// een klik ernaast sluit het ook. De aparte knop «Перейти до пошуку» (of Ctrl/⌘+Enter) opent de ZOEKPAGINA met het huidige resultaat: de
// tekst, de sectie en het resultaat gaan mee (zoek-laatste.ts), dus de pagina toont het meteen i.p.v. te wissen en opnieuw te beginnen;
// staat de zoekpagina al open, dan neemt die het over zonder herladen (zoek-menu.ts: meldZoekPagina). De toetsenlogica staat in ZoekVeld
// en zoek-menu.ts (menuToets); de rijen en wat een rij doet in zoek-menu.ts (zuiver, getest in tests/eenheid/zoek-menu-20261103.test.ts).
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Loader2, Search, Trash2 } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { focusTerug } from '../platform/toegankelijk';
import type { ZoekSuggestie } from '../../shared/zoek-model';
import { isAfgebroken, suggesties as haalSuggesties, zoeken, type ZoekUitkomst } from './zoek-api';
import { routeUrl, type Lang } from './zoek-kern';
import { LEEG_FILTER, bouwVraag, filterLokaal, parseQuery, type Categorie } from './zoek-logica';
import { bewaarRecent, leesRecent, recentRuimteVoor, wisRecent, type RecentRuimte, type RecenteZoekopdracht } from './zoek-recent';
import { profielVan, techToestand, useTech } from '../tech/tech-opslag';
import { bewaarLaatste } from './zoek-laatste';
import { MENU_MIN_TEKENS, bouwMenuRijen, keuzeActie, meldZoekPagina, menuToets, paginaDoel, uitkomstVoor } from './zoek-menu';
import ZoekVeld, { type VeldSuggestie } from './ZoekVeld';
import './zoek.css';

export const PALET_EVENT = 'tsv:zoek-palet';
export const openZoekPalet = () => window.dispatchEvent(new CustomEvent(PALET_EVENT));
const DEBOUNCE_MS = 250;
const UITKLAP_MAX_PX = 576; // 36rem: de breedte waarop het uitklapvenster niet verder groeit
const T = {
  uk: { veld: 'Пошук у «Мій простір»…', open: 'Відкрити пошук (⌘K)', menu: 'Пошук у «Мій простір»', titel: 'Швидкий пошук', ph: 'Функція, сторінка, лист, файл…', zoekpagina: 'Перейти до пошуку', zoekpaginaTitel: 'Перейти до сторінки пошуку з поточним результатом', wisRecent: 'Очистити нещодавні', geenRecent: 'Тут з’являться ваші останні пошуки на цьому пристрої.',
    hint: (mac: boolean) => `Enter — шукати · ↑↓ — вибір · Esc — закрити · ${mac ? '⌘' : 'Ctrl'}+Enter — сторінка пошуку`,
    groepen: { recent: 'Нещодавні', suggesties: 'Підказки', resultaten: 'Результати' }, zoekt: 'Шукаємо…', gevonden: (n: number) => `Знайдено: ${n}`, geenResultaat: 'Нічого не знайдено', fout: 'Пошук не виконано' },
  nl: { veld: 'Zoeken in «Mijn Ruimte»…', open: 'Zoeken openen (⌘K)', menu: 'Zoeken in «Mijn Ruimte»', titel: 'Snel zoeken', ph: 'Functie, pagina, e-mail, bestand…', zoekpagina: 'Naar zoeken', zoekpaginaTitel: 'Naar de zoekpagina met het huidige resultaat', wisRecent: 'Recent wissen', geenRecent: 'Hier verschijnen uw laatste zoekopdrachten op dit apparaat.',
    hint: (mac: boolean) => `Enter — zoeken · ↑↓ — kiezen · Esc — sluiten · ${mac ? '⌘' : 'Ctrl'}+Enter — zoekpagina`,
    groepen: { recent: 'Recent', suggesties: 'Suggesties', resultaten: 'Resultaten' }, zoekt: 'Zoeken…', gevonden: (n: number) => `Gevonden: ${n}`, geenResultaat: 'Niets gevonden', fout: 'Zoeken lukte niet' },
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
/** Het huidige resultaat van het menu: de vraag (zonder «-woord»), de sectie waarin gezocht is, het antwoord van de server en de uit te sluiten woorden. */
type MenuUitkomst = { q: string; cat: Categorie; a: ZoekUitkomst; uitsluit: string[] };
type Stand = 'rust' | 'laden' | 'fout';

export default function ZoekGlobaal({ lang, mobiel = false, dienst = '', zonderKnop = false }: { lang: Lang; mobiel?: boolean; dienst?: string; /** alleen het uitklapvenster + ⌘K (de knop staat elders, bijv. ZoekMenuKnop in het menu van de post) */ zonderKnop?: boolean }) {
  const t = T[lang]; const uid = useId();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [server, setServer] = useState<ZoekSuggestie[]>([]); const [recent, setRecent] = useState<RecenteZoekopdracht[]>([]);
  const [uitkomst, setUitkomst] = useState<MenuUitkomst | null>(null); const [stand, setStand] = useState<Stand>('rust'); const [vers, setVers] = useState(0);
  const [pos, setPos] = useState<Positie | null>(null);
  const vorigeFocus = useRef<HTMLElement | null>(null); const anker = useRef<HTMLDivElement | null>(null); const paneel = useRef<HTMLDivElement | null>(null); const input = useRef<HTMLInputElement | null>(null);
  const direct = useRef(0); // > 0: de eerstvolgende zoekopdracht zonder wachttijd (Enter, een recente rij)
  const sectie = sectieVan(dienst);
  // Ruimte van de recente lijst (ORCH-001): vastgelegd bij het OPENEN, volgens de technische activering van dit tabblad; lezen, bewaren
  // en wissen gebruiken die ene ruimte, ook als de status intussen verandert. De hint voor F5 volgt elke statuswijziging.
  const tech = useTech();
  useEffect(() => { recentRuimteVoor({ geladen: tech.geladen, technisch: profielVan(tech) === 'technisch' }); }, [tech]);
  const ruimte = useRef<RecentRuimte>('gebruiker');
  const doOpen = useCallback(() => {
    vorigeFocus.current = document.activeElement as HTMLElement | null;
    const st = techToestand();
    ruimte.current = recentRuimteVoor({ geladen: st.geladen, technisch: profielVan(st) === 'technisch' });
    setRecent(leesRecent(undefined, undefined, ruimte.current)); setOpen(true);
  }, []);
  const doClose = useCallback(() => { setOpen(false); setQ(''); setServer([]); setUitkomst(null); setStand('rust'); window.setTimeout(() => { if (!focusTerug(vorigeFocus.current) && !focusTerug(document.querySelector<HTMLElement>(TERUG_ALS_KNOP_WEG))) document.body.focus(); }, 0); }, []);

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
    // Scrollen BINNEN het menu (de lijst) verplaatst het venster niet: alleen scrollen van de pagina zelf meet opnieuw.
    const bijScroll = (e: Event) => { if (paneel.current && e.target instanceof Node && paneel.current.contains(e.target)) return; meet(); };
    window.addEventListener('resize', meet); window.addEventListener('scroll', bijScroll, true);
    return () => { window.removeEventListener('resize', meet); window.removeEventListener('scroll', bijScroll, true); };
  }, [open, meet]);

  // ⌘K / Ctrl+K overal; «/» blijft vrij (sommige pagina's gebruiken het zelf). Niet in een bewerkbaar veld met modifiers van de browser.
  // De zoekknoppen (veld, rond, in het menu) openen EN sluiten het menu (zoals Windows): het PALET_EVENT schakelt om.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); if (open) doClose(); else doOpen(); } };
    const o = () => { if (!open) doOpen(); else doClose(); };
    window.addEventListener('keydown', h); window.addEventListener(PALET_EVENT, o);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener(PALET_EVENT, o); };
  }, [open, doOpen, doClose]);

  // Klik buiten het veld en het venster sluit het (geen navigatie, geen nieuw venster). Een zoekknop zelf telt niet als «buiten»: die schakelt zelf om.
  useEffect(() => {
    if (!open) return;
    const buiten = (e: Event) => {
      const x = e.target as Node | null;
      if (!x || anker.current?.contains(x) || paneel.current?.contains(x) || (x instanceof Element && x.closest('[data-zoek-trigger]'))) return;
      doClose();
    };
    document.addEventListener('pointerdown', buiten);
    return () => document.removeEventListener('pointerdown', buiten);
  }, [open, doClose]);

  // Suggesties van de server + HET RESULTAAT van de zoekopdracht (dezelfde vraag als de zoekpagina: bouwVraag zonder filters, 20 per pagina,
  // met facets → de pagina kan dit antwoord ongewijzigd overnemen). Debounce 250 ms; Enter slaat de wachttijd over; één lopend verzoek.
  useEffect(() => {
    if (!open) return;
    const v = q.trim();
    if (!v) { setServer([]); setUitkomst(null); setStand('rust'); return; }
    const { query, excludeTerms } = parseQuery(v);
    const ac = new AbortController();
    const wacht = direct.current > 0 ? 0 : DEBOUNCE_MS; direct.current = 0;
    if (query.length >= MENU_MIN_TEKENS) setStand('laden'); else { setUitkomst(null); setStand('rust'); }
    const id = window.setTimeout(() => {
      haalSuggesties(v, 8, { signal: ac.signal }).then(s => { if (!ac.signal.aborted) setServer(s); }).catch(() => { if (!ac.signal.aborted) setServer([]); });
      if (query.length < MENU_MIN_TEKENS) return;
      zoeken(bouwVraag(query, sectie, LEEG_FILTER), { signal: ac.signal })
        .then(a => { if (ac.signal.aborted) return; setUitkomst({ q: query, cat: sectie, a, uitsluit: excludeTerms }); setStand('rust'); })
        .catch(e => { if (ac.signal.aborted || isAfgebroken(e)) return; setStand('fout'); });
    }, wacht);
    return () => { window.clearTimeout(id); ac.abort(); };
  }, [q, open, sectie, vers]);

  // De rijen van het menu: bij leeg veld de recente zoekopdrachten; bij typen suggesties, het resultaat en de recente die erbij passen.
  const treffers = useMemo(() => (uitkomst ? filterLokaal(uitkomst.a.items, LEEG_FILTER, uitkomst.uitsluit) : []), [uitkomst]);
  const rijen: VeldSuggestie[] = useMemo(() => bouwMenuRijen({ q, lang, nu: Date.now(), recent, suggesties: server, treffers, groepen: t.groepen }), [q, lang, recent, server, treffers, t]);

  // ENTER (en een recente zoekopdracht kiezen): zoeken in het menu zelf — bewaren op dit apparaat, meteen het resultaat tonen. Geen navigatie.
  const zoekNu = (tekst: string) => {
    const v = tekst.trim();
    if (v) setRecent(bewaarRecent(v, sectie, Date.now(), undefined, undefined, {}, ruimte.current));
    direct.current = 1; setQ(tekst); setVers(n => n + 1);
  };
  // Een gekozen rij: resultaat, functie of pagina met een route gaat rechtstreeks daarheen (zoek-menu.ts: keuzeActie); alles anders is een zoekopdracht (ZoekVeld → zoekNu).
  const kies = (s: VeldSuggestie): boolean => {
    const a = keuzeActie(s, q, sectie);
    if (a.type !== 'open') return false;
    const url = a.extern || routeUrl(a.route, lang);
    if (!url) return false;
    if (a.bewaar) bewaarRecent(a.bewaar.tekst, a.bewaar.sectie, Date.now(), undefined, undefined, { soort: a.bewaar.soort, route: a.bewaar.route }, ruimte.current);
    if (a.extern) { window.open(url, '_blank', 'noopener,noreferrer'); doClose(); } else location.assign(url);
    return true;
  };
  // «Перейти до пошуку»: de zoekpagina met het HUIDIGE resultaat. Leeg veld → de laatste zoekopdracht (paginaDoel); staat de pagina al open → zonder herladen.
  const naarPagina = () => {
    const doel = paginaDoel(q, sectie, recent); const v = doel.q; const vraag = parseQuery(v).query;
    if (v) bewaarRecent(v, doel.cat, Date.now(), undefined, undefined, {}, ruimte.current);
    const huidig = uitkomst && uitkomstVoor(uitkomst, vraag, doel.cat) ? uitkomst.a : null;
    if (v) bewaarLaatste(vraag, doel.cat, huidig);
    if (meldZoekPagina({ q: v, cat: doel.cat, uitkomst: huidig })) { doClose(); return; }
    location.assign(zoekPaginaUrl(lang, v, doel.cat === 'all' ? {} : { cat: doel.cat }));
  };
  const wisRecentKlik = () => { wisRecent(undefined, undefined, ruimte.current); setRecent([]); input.current?.focus(); };

  // Esc sluit het menu in ÉÉN keer (ook met de focus op een knop in het venster) en Ctrl/⌘+Enter opent de zoekpagina: vóór ZoekVeld (capture),
  // zodat de lijst/het veld er niet eerst zelf iets mee doet. Pijltjes en Enter op een rij zijn van ZoekVeld.
  const onKeyCapture = (e: RKE<HTMLElement>) => {
    const toets = menuToets({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing });
    if (toets === 'sluit') { e.preventDefault(); e.stopPropagation(); doClose(); } else if (toets === 'naar-pagina') { e.preventDefault(); e.stopPropagation(); naarPagina(); }
  };

  // Vaste rij onder de lijst: de stand van het zoeken, wissen van de recente zoekopdrachten (alleen bij een leeg veld) en een korte toelichting.
  const gezocht = q.trim().length >= MENU_MIN_TEKENS;
  const statusTekst = !gezocht ? '' : stand === 'laden' ? t.zoekt : stand === 'fout' ? t.fout : uitkomst ? (uitkomst.a.totaal > 0 && treffers.length > 0 ? t.gevonden(uitkomst.a.totaal) : t.geenResultaat) : '';
  const voet = (
    <div className='zk-pop-voet'>
      <span className='zk-pop-status' role='status' aria-live='polite' data-zoek-menu-stand={gezocht ? stand : 'leeg'}>{stand === 'laden' && gezocht && <Loader2 className='zk-spin' aria-hidden='true' />}{statusTekst}</span>
      {!q.trim() && (recent.length > 0
        ? <button type='button' className='zk-pop-wis' onMouseDown={e => e.preventDefault()} onClick={wisRecentKlik}><Trash2 aria-hidden='true' />{t.wisRecent}</button>
        : <span className='zk-pop-leeg'>{t.geenRecent}</span>)}
      <small id={`${uid}-hint`} className='zk-pop-hint'>{t.hint(isMac())}</small>
    </div>);

  const trigger = mobiel
    ? <button type='button' className={`zk-trigger-mobiel${open ? ' is-verborgen' : ''}`} aria-label={t.open} aria-keyshortcuts='Control+K Meta+K' aria-expanded={open} data-zoek-trigger='mobiel' onClick={doOpen}><Search aria-hidden='true' /></button>
    : <button type='button' className={`zk-trigger${open ? ' is-verborgen' : ''}`} aria-label={t.open} aria-keyshortcuts='Control+K Meta+K' aria-expanded={open} aria-haspopup='listbox' data-zoek-trigger='veld' onClick={doOpen}><Search aria-hidden='true' /><span className='zk-trigger-tekst'>{t.veld}</span><kbd aria-hidden='true'>{isMac() ? '⌘' : 'Ctrl'} K</kbd></button>;

  return (
    <>
      {zonderKnop ? null : <div ref={anker} className={`zk-anker${open ? ' is-open' : ''}${mobiel ? ' is-mobiel' : ''}`}>{trigger}</div>}
      {open && pos ? createPortal(
        <div ref={paneel} className={`zk-uitklap${mobiel ? ' is-mobiel' : ''}`} style={{ top: pos.top, left: pos.left, width: pos.width }} data-zoek-palet='open' onKeyDownCapture={onKeyCapture}>
          <ZoekVeld lang={lang} value={q} onChange={setQ} onSubmit={zoekNu} onKies={kies} suggesties={rijen} placeholder={t.ph} label={t.titel} inputRef={input} autoFocus vast beschrijvingId={`${uid}-hint`} voet={voet}
            rechts={<button type='button' className='zk-naar-pagina' data-zoek-naar-pagina='1' onMouseDown={e => e.preventDefault()} onClick={naarPagina} aria-label={t.zoekpaginaTitel} title={t.zoekpaginaTitel}><ArrowUpRight aria-hidden='true' /><span>{t.zoekpagina}</span></button>} />
        </div>, document.body) : null}
    </>);
}
