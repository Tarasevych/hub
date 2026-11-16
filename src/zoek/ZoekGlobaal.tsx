// HET GLOBALE ZOEKVELD IN DE BOVENBALK (zoekronde 02.11.2026, vervangt het modale palet ⌘K van 22.10.2026; INTEG-001 03.11.2026: menu).
// Klik op de veldknop (of ⌘K / Ctrl+K) en het veld klapt uit op dezelfde plek, zoals Windows-zoeken: er opent een MENU eronder met
// ZOEK-002 (15.11.2026, Павло: «замість того щоб розгорталося існуюче, збільшуючись за потреби, як у Google, зверху накладається ще
// одне вікно»): op de computer wordt het veld in de bovenbalk ZELF het invoerveld — het groeit op zijn plek (de groep rechtsboven groeit
// naar links mee, profielfoto en bel blijven staan) en het menu hangt eraan als één kaart met één rand (veld boven, lijst onder), zoals
// Google. Geen tweede veld erboven meer. Alleen op de telefoon, met de zoekknop in het menu en op het «Макет» (eigen bovenbalk) staat het
// veld in een laag over de pagina — maar ook daar groeit het uit de knop zelf (zelfde hoogte, zelfde rechterrand) i.p.v. ergens anders.
// Знову українською: поле в панелі саме стає полем вводу й розширюється на місці; список випадає з нього як одна картка.
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
import { IDENTITEIT_TABS, type IdentiteitTab } from '../identiteit/identiteit-tabs';
import { isAfgebroken, suggesties as haalSuggesties, zoeken, type ZoekUitkomst } from './zoek-api';
import { norm, routeUrl, type Lang } from './zoek-kern';
import { LEEG_FILTER, bouwVraag, filterLokaal, parseQuery, type Categorie } from './zoek-logica';
import { bewaarRecent, leesRecent, recentRuimteVoor, wisRecent, type RecentRuimte, type RecenteZoekopdracht } from './zoek-recent';
import { profielVan, techToestand, useTech } from '../tech/tech-opslag';
import { bewaarLaatste } from './zoek-laatste';
import { MENU_MIN_TEKENS, bouwMenuRijen, keuzeActie, meldZoekPagina, menuToets, paginaDoel, uitkomstVoor } from './zoek-menu';
import ZoekVeld, { type VeldSuggestie } from './ZoekVeld';
import './zoek.css';
import './zoek-maquette.css';
import './zoek-uitklap-veld.css';

export const PALET_EVENT = 'tsv:zoek-palet';
export const openZoekPalet = () => window.dispatchEvent(new CustomEvent(PALET_EVENT));
const DEBOUNCE_MS = 250;
const UITKLAP_MAX_PX = 576; // 36rem: de breedte waarop het uitklapvenster niet verder groeit
const VELD_MIN_PX = 440; // ZOEK-002: smaller is een geopend veld met resultaten niet meer goed te lezen
const T = {
  uk: { veld: 'Пошук у «Мій простір»…', open: 'Відкрити пошук (⌘K)', menu: 'Пошук у «Мій простір»', titel: 'Швидкий пошук', ph: 'Функція, сторінка, лист, файл…', zoekpagina: 'Перейти до пошуку', zoekpaginaTitel: 'Перейти до сторінки пошуку з поточним результатом: там фільтри, сортування й усі знайдені, а не лише перші (Ctrl+Enter)', wisRecent: 'Очистити нещодавні', geenRecent: 'Тут з’являться ваші останні пошуки на цьому пристрої.',
    hint: (mac: boolean) => `Enter — шукати · ↑↓ — вибір · Esc — закрити · ${mac ? '⌘' : 'Ctrl'}+Enter — сторінка пошуку`,
    groepen: { recent: 'Нещодавні', suggesties: 'Підказки', resultaten: 'Результати' }, zoekt: 'Шукаємо…', gevonden: (n: number) => `Знайдено: ${n}`, geenResultaat: 'Нічого не знайдено', fout: 'Пошук не виконано' },
  nl: { veld: 'Zoeken in «Mijn Ruimte»…', open: 'Zoeken openen (⌘K)', menu: 'Zoeken in «Mijn Ruimte»', titel: 'Snel zoeken', ph: 'Functie, pagina, e-mail, bestand…', zoekpagina: 'Naar zoeken', zoekpaginaTitel: 'Naar de zoekpagina met het huidige resultaat: daar staan filters, sortering en alles wat gevonden is, niet alleen de eerste (Ctrl+Enter)', wisRecent: 'Recent wissen', geenRecent: 'Hier verschijnen uw laatste zoekopdrachten op dit apparaat.',
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

// Додаткові ключові слова для миттєвого пошуку 13 розділів центру облікового запису (uk + nl) з пріоритетом поточної сторінки.
const IDENTITEIT_SLEUTELWOORDEN: Readonly<Record<IdentiteitTab, string>> = {
  personalization: 'огляд вигляд оформлення початкова overzicht uiterlijk sfeer start',
  menu: 'бічна панель навігація док швидкий доступ zijbalk navigatie dock snelkoppelingen',
  themes: 'тема світла темна сливова палітра контраст licht donker pruim kleur contrast',
  languages: 'мова українська нідерландська переклад oekraiens nederlands vertaling',
  widgets: 'віджети блоки картки головна blokken kaarten startpagina',
  melding: 'сповіщення екосистема повідомлення інформаційна смуга тихі години жести змах вкладення ші meldingen ecosysteem meldingsstroken stille uren vegen bijlagen ai',
  sharing: 'спільний доступ запрошення гості ролі посилання uitnodiging gasten rollen delen',
  identity: 'ідентичність технічний профіль звичайний простір псевдонім technisch profiel ruimte',
  account: 'обліковий запис фото світлина пошта видалення дані profielfoto gegevens verwijderen',
  sessions: 'сесії пристрої активні входи вийти оглядач apparaten aanmeldingen afmelden',
  methods: 'способи входу ключ доступу google телеграм пароль sleutel telegram aanmelden',
  security: 'безпека захист двофакторна підтвердження сповіщення журналювання bescherming bevestiging',
  recovery: 'відновлення запасні коди доступ порятунок herstelcodes noodtoegang',
};

/** De zoekknop IN HET MENU (alleen op de post, 24.10.2026): rond icoon dat hetzelfde uitklapvenster opent als ⌘K. `voorOpenen` sluit
 *  bijvoorbeeld eerst de lade, zodat het venster niet boven een open lade ligt. `tooltip` = de tooltiplaag van de zijbalk (data-tooltip). */
export function ZoekMenuKnop({ lang, className = 'zk-menu-knop', voorOpenen, sneltoets = false, tooltip = false, tooltipKant, knopRef }: { lang: Lang; className?: string; voorOpenen?: () => void; sneltoets?: boolean; tooltip?: boolean; tooltipKant?: 'left' | 'right'; knopRef?: (b: HTMLButtonElement | null) => void }) {
  const tekst = sneltoets ? `${T[lang].menu} (${isMac() ? '⌘K' : 'Ctrl K'})` : T[lang].menu;
  return <button type='button' ref={knopRef} className={className} aria-label={tekst} aria-keyshortcuts='Control+K Meta+K' aria-haspopup='dialog' title={tooltip ? undefined : tekst} data-tooltip={tooltip ? tekst : undefined} data-tooltip-placement={tooltip ? tooltipKant : undefined} data-zoek-trigger='menu' onClick={() => { voorOpenen?.(); openZoekPalet(); }}><Search aria-hidden='true' /></button>;
}

/** Plek van het veld in een laag (telefoon, zoekknop in het menu, «Макет»): verticaal op de knop, vast aan de rechter- of linkerrand van de
 *  knop (`kant`/`x`), groeiend van de knopbreedte `van` naar `naar`. `h` = hoogte van de knop (het veld is even hoog, 0 = eigen hoogte). */
type Positie = { top: number; kant: 'left' | 'right'; x: number; van: number; naar: number; h: number };
/** Het veld OP ZIJN PLEK in de bovenbalk (computer): het groeit van de knopbreedte `van` naar `naar`, even hoog als de knop (`h`). */
type Plek = { van: number; naar: number; h: number };

/** ZOEK-002: waar een veld dat uit een knop groeit heen kan — vast aan de rand met de meeste ruimte, nooit buiten het beeld (8 px marge). */
export const groeiPlek = (r: { left: number; right: number; width: number }, vw: number, doel: number): { kant: 'left' | 'right'; x: number; van: number; naar: number } => {
  const naarLinks = Math.max(0, r.right - 8); const naarRechts = Math.max(0, vw - 8 - r.left);
  if (naarLinks >= doel || naarLinks >= naarRechts) return { kant: 'right', x: Math.max(0, vw - r.right), van: r.width, naar: Math.max(r.width, Math.min(doel, naarLinks)) };
  return { kant: 'left', x: Math.max(0, r.left), van: r.width, naar: Math.max(r.width, Math.min(doel, naarRechts)) };
};
/** ZOEK-002: hoe breed het veld op zijn plek in de bovenbalk mag worden — tot UITKLAP_MAX_PX, en normaal niet over het menu links
 *  (`linksGrens`): extra = de ruimte tussen die grens en de linkerrand van de groep. Is die ruimte te klein om resultaten te lezen (menu
 *  bovenaan als dock naast de groep), dan toch VELD_MIN_PX: dan schuift het veld tijdelijk over het einde van het dock (de groep ligt
 *  erboven), maar nooit buiten het beeld (8 px). */
export const veldDoel = (knopBreedte: number, groepLinks: number, linksGrens: number, max = UITKLAP_MAX_PX): number => {
  const ruim = knopBreedte + Math.max(0, groepLinks - linksGrens), hard = knopBreedte + Math.max(0, groepLinks - 8);
  return Math.round(Math.max(knopBreedte, Math.min(max, hard, Math.max(VELD_MIN_PX, ruim))));
};
/** Het huidige resultaat van het menu: de vraag (zonder «-woord»), de sectie waarin gezocht is, het antwoord van de server en de uit te sluiten woorden. */
type MenuUitkomst = { q: string; cat: Categorie; a: ZoekUitkomst; uitsluit: string[] };
type Stand = 'rust' | 'laden' | 'fout';

export default function ZoekGlobaal({ lang, mobiel = false, dienst = '', zonderKnop = false }: { lang: Lang; mobiel?: boolean; dienst?: string; /** alleen het uitklapvenster + ⌘K (de knop staat elders, bijv. ZoekMenuKnop in het menu van de post) */ zonderKnop?: boolean }) {
  const t = T[lang]; const uid = useId();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [server, setServer] = useState<ZoekSuggestie[]>([]); const [recent, setRecent] = useState<RecenteZoekopdracht[]>([]);
  const [uitkomst, setUitkomst] = useState<MenuUitkomst | null>(null); const [stand, setStand] = useState<Stand>('rust'); const [vers, setVers] = useState(0);
  const [pos, setPos] = useState<Positie | null>(null); const [plek, setPlek] = useState<Plek | null>(null);
  // ZOEK-002: eerst op de knopbreedte tekenen, één frame later de doelbreedte → de overgang (CSS) laat het veld zichtbaar groeien.
  const [gegroeid, setGegroeid] = useState<boolean>(false); // geen tweede open-stand: alleen de overgang
  const vorigeFocus = useRef<HTMLElement | null>(null); const anker = useRef<HTMLDivElement | null>(null); const paneel = useRef<HTMLDivElement | null>(null); const input = useRef<HTMLInputElement | null>(null);
  const vanVeld = useRef(false);
  const direct = useRef(0); // > 0: de eerstvolgende zoekopdracht zonder wachttijd (Enter, een recente rij)
  const sectie = sectieVan(dienst);
  // Ruimte van de recente lijst (ORCH-001): vastgelegd bij het OPENEN, volgens de technische activering van dit tabblad; lezen, bewaren
  // en wissen gebruiken die ene ruimte, ook als de status intussen verandert. De hint voor F5 volgt elke statuswijziging.
  const tech = useTech();
  useEffect(() => { recentRuimteVoor({ geladen: tech.geladen, technisch: profielVan(tech) === 'technisch' }); }, [tech]);
  const ruimte = useRef<RecentRuimte>('gebruiker');
  const doOpen = useCallback(() => {
    vorigeFocus.current = document.activeElement as HTMLElement | null;
    // ZOEK-002: de veldknop zelf verdwijnt zolang het veld op zijn plek open is → bij het sluiten de (nieuwe) veldknop focussen, niet de eerste zoekknop van de pagina.
    vanVeld.current = !!(vorigeFocus.current && anker.current?.contains(vorigeFocus.current));
    const st = techToestand();
    ruimte.current = recentRuimteVoor({ geladen: st.geladen, technisch: profielVan(st) === 'technisch' });
    setRecent(leesRecent(undefined, undefined, ruimte.current)); setOpen(true);
  }, []);
  const doClose = useCallback(() => { setOpen(false); setPlek(null); setPos(null); setGegroeid(false); setQ(''); setServer([]); setUitkomst(null); setStand('rust'); window.setTimeout(() => { if (!focusTerug(vorigeFocus.current) && !focusTerug(vanVeld.current ? anker.current?.querySelector<HTMLElement>('[data-zoek-trigger]') ?? null : null) && !focusTerug(document.querySelector<HTMLElement>(TERUG_ALS_KNOP_WEG))) document.body.focus(); }, 0); }, []);

  // ZOEK-002. Twee manieren, één gedrag: het veld groeit UIT de knop.
  //  • Computer, veldknop zichtbaar in de bovenbalk → OP DE PLEK (`plek`): de knop wordt het veld in dezelfde groep (geen portaal). De groep
  //    staat rechtsboven vast (position:fixed; right), dus een breder veld schuift alleen wat links ervan staat (knop «Живий фон») mee naar
  //    links; profielfoto en bel blijven waar ze zijn. Breedte: tot 36rem, niet over het menu links heen.
  //  • Anders (telefoon, zoekknop in het menu, «Макет» met eigen bovenbalk) → laag (`pos`, portaal naar body) op de hoogte van de knop,
  //    vast aan diens rechter- (of linker)rand; zonder zichtbare knop midden bovenaan.
  const meet = useCallback(() => {
    const vw = document.documentElement.clientWidth;
    const knop = anker.current?.querySelector<HTMLElement>('[data-zoek-trigger]') || null;
    const eigen = anker.current && getComputedStyle(anker.current).visibility !== 'hidden' ? anker.current.getBoundingClientRect() : null;
    if (!mobiel && !zonderKnop && eigen && eigen.width > 0) {
      const groep = anker.current?.closest<HTMLElement>('.canonical-account-anchor')?.getBoundingClientRect() || eigen;
      // Linkergrens = de rechterrand van wat links van de groep vast staat (het menu, als dat links staat), plus lucht.
      let grens = 8;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.canonical-sidebar'))) { const z = el.getBoundingClientRect(); if (z.width > 0 && z.right <= groep.left + 1) grens = Math.max(grens, z.right + 16); }
      setPlek(p => {
        // Tijdens het openstaan is de knop weg: de begin- en knopbreedte blijven die van het moment van openen.
        const van = p?.van ?? (knop?.getBoundingClientRect().width || eigen.width); const h = p?.h ?? (knop?.getBoundingClientRect().height || eigen.height);
        // Linkerrand van de groep als het veld nog knopbreed was: de huidige rand + wat het veld nu (ook midden in de overgang) breder is.
        const nu = p && paneel.current ? paneel.current.getBoundingClientRect().width : van;
        const naar = veldDoel(van, groep.left + (nu - van), grens);
        return p && p.naar === naar ? p : { van, naar, h };
      });
      setPos(null); return;
    }
    const breed = Math.min(UITKLAP_MAX_PX, vw - 16);
    // Nooit onder de technische band (die ligt boven #root): de bovenste plek is 8 px onder de bovenkant van #root.
    const bovenMin = Math.max(8, (document.getElementById('root')?.getBoundingClientRect().top || 0) + 8);
    const groepBoven = document.querySelector<HTMLElement>('.canonical-account-anchor')?.getBoundingClientRect();
    const rij = groepBoven && groepBoven.width > 0 && groepBoven.top >= bovenMin - 8 ? Math.max(bovenMin, groepBoven.top) : bovenMin;
    const mqKnop = !mobiel && (!eigen || eigen.width === 0) ? document.querySelector<HTMLElement>('[data-zoek-trigger="maquette"]') : null;
    const r = eigen && eigen.width > 0 ? eigen : mqKnop?.getBoundingClientRect();
    // Zonder zichtbare veldknop (de knop staat in het menu): midden bovenaan, de volle breedte die past.
    if (zonderKnop || !r || r.width === 0) { setPos({ top: rij, kant: 'left', x: Math.max(8, (vw - breed) / 2), van: breed, naar: mobiel ? vw - 16 : breed, h: 0 }); setPlek(null); return; }
    const g = groeiPlek(r, vw, mobiel ? vw - 16 : breed);
    // Een knop die uit beeld gescrold is (de eigen bovenbalk van het «Макет» scrolt mee): het veld komt op de bovenste rij.
    setPos(p => ({ top: r.top >= bovenMin ? r.top : rij, ...g, van: p?.van ?? g.van, h: p?.h ?? r.height }));
    setPlek(null);
  }, [mobiel, zonderKnop]);
  useLayoutEffect(() => { if (open) meet(); }, [open, meet]);
  useEffect(() => {
    if (!open || !(plek || pos) || gegroeid) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGegroeid(true)));
    return () => cancelAnimationFrame(id);
  }, [open, plek, pos, gegroeid]);
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

  // Op id.tarasevych.com krijgen onderdelen en instellingen van deze pagina direct voorrang, gevolgd door alle treffers van de hele site.
  const treffers = useMemo(() => {
    if (!uitkomst) return [];
    const lijst = filterLokaal(uitkomst.a.items, LEEG_FILTER, uitkomst.uitsluit);
    if (dienst !== 'identity') return lijst;
    return [...lijst.filter(x => x.bron === 'instelling'), ...lijst.filter(x => x.bron !== 'instelling')];
  }, [uitkomst, dienst]);
  const suggesties = useMemo(() => {
    const woorden = dienst === 'identity' ? norm(q).split(' ').filter(Boolean) : [];
    if (!woorden.length) return server;
    const lokaal: ZoekSuggestie[] = IDENTITEIT_TABS
      .filter(tab => { const hooi = norm(`${tab.uk} ${tab.nl} ${IDENTITEIT_SLEUTELWOORDEN[tab.id]}`); return woorden.every(w => hooi.includes(w)); })
      // IDENTITEIT-015 (vormgeving): pad = id розділу без «/» — routeUrl робить з нього канонічну адресу /<нідерландський slug>
      // (/beveiliging, /talen, …), як меню й смуга розділів. Раніше «/security» — англійська адреса в рядку (Правило 0).
      // Het pad is het tabblad-id: routeUrl maakt er het canonieke /<slug> van, net als het menu.
      .map(tab => ({ soort: 'functie', bron: 'instelling', tekst: tab[lang], route: { host: 'id', pad: tab.id } }));
    return [...lokaal, ...server];
  }, [dienst, q, lang, server]);
  const rijen: VeldSuggestie[] = useMemo(() => bouwMenuRijen({ q, lang, nu: Date.now(), recent, suggesties, treffers, groepen: t.groepen }), [q, lang, recent, suggesties, treffers, t]);

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
    if (a.extern) { window.open(url, '_blank', 'noopener,noreferrer'); doClose(); return true; }
    try {
      const doelUrl = new URL(url);
      if (dienst === 'identity' && doelUrl.origin === location.origin && !doelUrl.searchParams.has('focus') && !doelUrl.searchParams.has('doel')) {
        history.pushState(history.state, '', `${doelUrl.pathname}${doelUrl.search}${doelUrl.hash}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
        doClose();
        return true;
      }
    } catch { /* terugval op gewone navigatie */ }
    location.assign(url);
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

  const veld = (
    <ZoekVeld lang={lang} value={q} onChange={setQ} onSubmit={zoekNu} onKies={kies} suggesties={rijen} placeholder={t.ph} label={t.titel} inputRef={input} autoFocus vast beschrijvingId={`${uid}-hint`} voet={voet}
      rechts={<button type='button' className='zk-naar-pagina' data-zoek-naar-pagina='1' onMouseDown={e => e.preventDefault()} onClick={naarPagina} aria-label={t.zoekpaginaTitel} title={t.zoekpaginaTitel}><ArrowUpRight aria-hidden='true' /><span>{t.zoekpagina}</span></button>} />);
  const opPlek = open && !!plek;
  const groei = (p: { van: number; naar: number }) => (gegroeid ? p.naar : p.van);

  return (
    <>
      {zonderKnop ? null : <div ref={anker} className={`zk-anker${open ? ' is-open' : ''}${opPlek ? ' is-op-plek' : ''}${mobiel ? ' is-mobiel' : ''}`}>
        {opPlek ? null : trigger}
        {opPlek && plek ? <div ref={paneel} className='zk-uitklap is-veld is-op-plek' data-zoek-palet='open' data-gegroeid={gegroeid ? '1' : '0'} style={{ width: groei(plek), ['--zk-h' as string]: `${plek.h}px` }} onKeyDownCapture={onKeyCapture}>{veld}</div> : null}
      </div>}
      {open && pos && !plek ? createPortal(
        <div ref={paneel} className={`zk-uitklap is-veld is-laag${mobiel ? ' is-mobiel' : ''}`} data-zoek-palet='open' data-gegroeid={gegroeid ? '1' : '0'} style={{ top: pos.top, [pos.kant]: pos.x, width: groei(pos), ['--zk-h' as string]: pos.h ? `${pos.h}px` : undefined }} onKeyDownCapture={onKeyCapture}>
          {veld}
        </div>, document.body) : null}
    </>);
}
