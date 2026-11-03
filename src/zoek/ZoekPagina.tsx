// hub.*/zoek — DE ZOEKPAGINA (zone Z4, 22.10.2026; specificatie §6.1, §6.2, §10, §11, §12). Binnen de hub-shell
// (CanonicalChrome: menu, bovenbalk met het globale veld ⌘K, taal, meldingen, profiel). Gegevens uitsluitend van de server
// (src/zoek/zoek-api.ts → POST /api/owner/zoek, /zoek/suggesties, /zoek/stand, /zoek/geschiedenis/*): geen demo-cijfers,
// geen geraden tellers, geen innerHTML. Debounce 250 ms, één lopend verzoek (AbortController), pagina's van 20 («показати ще»).
// Staten: begin (wat je kunt zoeken + echte stand van de bronnen), laden (skelet), resultaten, niets gevonden (met correcties),
// fout (tekst + opnieuw), geen toestemming, gedeeltelijk beschikbare bronnen (band), index leeg → live (band), indexeren (band),
// geen bronnen, momentopname uit de geschiedenis («збережені результати від …» → vernieuwd: «нове» / «більше недоступно»), telefoon.
//
// Zone D (22.10.2026, macet van de eigenaar): resultaten als gekleurde kaarten (ZoekKaart), «за джерелами» = groepen met een kop per
// categorie naast «за релевантністю», lijst/raster, «Останні пошуки» met relatieve tijd. In het TECHNISCH profiel: een strook die zegt
// dat hier de technische ruimte doorzocht wordt (+ in welke lade elke bron zit), en de knop «Індексація…» → zwevend venster
// (ZoekIndexVenster, vensterbeheer van de site) met de geforceerde indexatie. Voor een gewone gebruiker bestaat die knop niet.
//
// INTEG-001 (03.11.2026): de knop «Перейти до пошуку» van het uitklapvenster (ZoekGlobaal) opent deze pagina met het HUIDIGE resultaat:
// (a) is het resultaat van precies deze vraag nog in het geheugen van dit tabblad (zoek-laatste.ts), dan staat het er meteen — geen skelet,
// geen leeg scherm — en ververst de pagina op de achtergrond; (b) staat de pagina al open, dan neemt ze tekst, categorie en resultaat over
// uit de melding van het venster (ZOEK_NAAR_PAGINA_EVENT) zonder te herladen.
import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, History, Info, LayoutGrid, List, Loader2, Lock, RefreshCw, Search, SlidersHorizontal, Sparkles, Trash2, Wrench, X } from 'lucide-react';
import TabsRij from '../ontwerp/TabsRij';
import { techActief, useTech } from '../tech/tech-opslag';
import { Venster } from '../platform/vensters';
import { RuimteGeslotenVlak } from '../RuimteStrook';
import { isRuimteCode } from '../../shared/ruimte-weergave';
import type { DeelbareDienst } from '../../shared/ruimte-scheiding';
import { ApiError } from '../platform/client';
import { BRON_NAAM, BRON_STAND_NAAM, ZOEK_VERSIE, type ZoekBronStand, type ZoekSuggestie, type ZoekTreffer } from '../../shared/zoek-model';
import { bronStand, geschiedenisBewaren, geschiedenisLijst, geschiedenisOpen, geschiedenisWis, geschiedenisWisAlles, isAfgebroken, suggesties as haalSuggesties, zoeken, type GeschiedenisRij, type Gesloten, type ZoekUitkomst } from './zoek-api';
import { CATEGORIEEN, CATEGORIE_BRONNEN, CATEGORIE_NAAM, LEEG_FILTER, aantalFilters, bewaarWeergave, bouwVraag, categorieTelling, filterLokaal, filtersUitGeschiedenis, filtersVoorGeschiedenis, groepeerPerCategorie, leesUrl, leesWeergave, markeerTegenMomentopname, nietsGeindexeerd, parseQuery, schrijfUrl, zichtbareCategorieen, type Categorie, type Markering, type WeergaveKeuze, type ZoekFilters as Filters } from './zoek-logica';
import { norm, oudeGeschiedenisOpruimen, relatiefTijd, routeUrl, type Lang } from './zoek-kern';
import { CATEGORIE_ICOON } from './ZoekCategorieIcoon';
import { leesLaatste } from './zoek-laatste';
import { ZOEK_NAAR_PAGINA_EVENT, type NaarPaginaDetail } from './zoek-menu';
// Technische bundel (// @tech-asset → /assets/tech/, alleen met de toegangscookie van een actieve activering): mislukt het laden
// (404: geen cookie meer, nieuwe versie uitgerold), dan een eerlijk venster i.p.v. een kapotte pagina (React.lazy zonder vangnet gooit).
const ZoekIndexVenster = lazy(() => import('./ZoekIndexVenster').catch(() => ({ default: IndexVensterNietGeladen })));
// Teksten in T (niet inline): de UI-catalogus van de zoekfunctie neemt alleen inline uk/nl-paren op — dit venster is technisch.
function IndexVensterNietGeladen({ lang, onSluit }: { lang: Lang; onSluit: () => void; onKlaar?: () => void }) {
  const t = T[lang];
  return <Venster id='zoek-index' titel={t.ivTitel} modaal={false} breedte={420} onSluit={onSluit} lang={lang}>
    <div className='zk-iv-inhoud' data-zoek-index-venster='niet-geladen'><p className='melding melding-warn' role='alert'><AlertTriangle aria-hidden='true' /><span>{t.ivNietGeladen}</span></p>
      <button type='button' className='knop knop-secundair' onClick={() => location.reload()}><RefreshCw aria-hidden='true' />{t.ivHerladen}</button></div>
  </Venster>;
}
import ZoekVeld, { type VeldSuggestie } from './ZoekVeld';
import ZoekKaart, { fmtDatum } from './ZoekKaart';
import ZoekFilters from './ZoekFilters';
import './zoek.css';

export const DEBOUNCE_MS = 250;
const GESCHIEDENIS_NA_MS = 1500;
const T = {
  uk: { h: 'Пошук у «Мій простір»', sub: 'Сторінки, кнопки, налаштування, листи, файли, календар, дошка, GitHub — одне поле для всього. Опишіть, що хочете зробити або знайти, своїми словами.', ph: 'Що шукаємо? Наприклад: налаштування пошти, лист від бухгалтера, звіт pdf…', go: 'Знайти', filters: 'Фільтри',
    gevonden: (n: number, q: string) => `Знайдено ${n} ${n === 1 ? 'результат' : n < 5 ? 'результати' : 'результатів'} для «${q}»`, geenQ: 'Почніть вводити — підказки з’являться одразу.', zoekt: 'Шукаємо…', meer: 'Показати ще', vanTotaal: (a: number, b: number) => `Показано ${a} з ${b}`,
    niets: 'Нічого не знайдено.', nietsTip: 'Спробуйте інші слова, синоніми або транслітерацію; зніміть фільтри; перевірте, чи джерело підключене й проіндексоване.', dym: 'Можливо, ви мали на увазі', origineel: (q: string) => `Залишити «${q}»`, zoekAls: (s: string) => `Шукати «${s}»`,
    fout: 'Пошук не виконано. Дані не змінено.', opnieuw: 'Повторити', geenRecht: 'У цьому просторі пошук недоступний: немає дозволу або сесія вичерпана. Увійдіть знову або перевірте права.', geenBronnen: 'Жодне джерело ще не підключене. Підключіть пошту, файли, календар або GitHub у налаштуваннях інтеграцій — тоді тут буде що шукати. Сторінки й налаштування самого сайту індексуються автоматично.',
    nietsGeindexeerd: 'Увімкнено фільтр «лише повністю проіндексовані», але жодне джерело ще не проіндексоване повністю. Зніміть фільтр або зачекайте.', live: 'Індекс для цього простору ще порожній — результати з прямого пошуку по даних (повільніше, може бути неповним).', indexeert: 'Індексація триває — результати можуть бути неповними:', deels: 'Деякі джерела недоступні або з помилкою:',
    momentopname: (d: string) => `Збережені результати від ${d}. Оновлюємо за актуальним індексом…`, vernieuwd: (n: number, w: number) => `Оновлено за актуальним індексом: нових — ${n}, більше недоступних — ${w}.`, weg: 'Більше недоступно', wegUitleg: 'Ці результати були у збереженому пошуку, але зараз їх немає в індексі (видалено, змінено права або джерело відключене).',
    recent: 'Останні пошуки', wis: 'Очистити історію', wisEen: 'Видалити запис', herhaal: 'Повторити пошук', geenRecent: 'Історія порожня. Вона зберігається на сервері окремо для кожного акаунта й простору.', keer: (n: number) => `${n}×`,
    wat: 'Що можна шукати', watLijst: ['Функції й налаштування: «змінити мову», «підключити пошту», «теми»', 'Листи: тема, відправник, слова в тексті чи у вкладенні', 'Файли й документи: назва, вміст PDF/DOCX/TXT, сканів (OCR), архівів', 'Події календаря, задачі й нотатки дошки, репозиторії та issue GitHub', 'Будь-якою мовою, з помилками, транслітом або синонімами'],
    bronnen: 'Стан джерел', tip: 'Порада: ↑↓ — підказки, Enter — пошук, Esc — очистити, ⌘K / Ctrl+K — пошук із будь-якої сторінки, «-слово» виключає слово.', actieveFilters: 'Активні умови', verwijderFilter: 'Прибрати умову', categorieen: 'Категорії', resultaten: 'Результати пошуку', skelet: 'Завантаження результатів', laatsteOk: 'оновлено', objecten: (n: number) => { const r = n % 10, h = n % 100; return `${n} ${r === 1 && h !== 11 ? 'об’єкт' : r >= 2 && r <= 4 && (h < 12 || h > 14) ? 'об’єкти' : 'об’єктів'}`; },
    ordening: 'Упорядкування', opRelevantie: 'За релевантністю', opBron: 'За джерелами', weergave: 'Вигляд', lijst: 'Список', raster: 'Сітка', groepN: (n: number) => `${n}`,
    tech: 'Ви шукаєте в технічному просторі (технічний профіль активний у цій вкладці). Особисті дані — пошта, файли, календар — доступні тут лише для служб, перемкнутих на «власні дані» технічного простору; інакше вони показані як «Не підключено».', techLink: 'Відкрити пошук в особистому просторі (нова вкладка)', techPrive: 'особистий', techTech: 'технічний', indexKnop: 'Індексація…', indexKnopUitleg: 'Примусова повна або часткова індексація у плаваючому вікні', geslotenGroep: (n: number) => `Недоступні в цьому просторі служби (${n})`,
    ivTitel: 'Індексація пошуку', ivNietGeladen: 'Вікно індексації не завантажилось: технічний профіль у цій вкладці закінчився або вийшла нова версія сайту. Оновіть сторінку; якщо профіль завершено — увімкніть його знову.', ivHerladen: 'Оновити сторінку' },
  nl: { h: 'Zoeken in «Mijn Ruimte»', sub: 'Pagina’s, knoppen, instellingen, e-mails, bestanden, agenda, bord, GitHub — één veld voor alles. Beschrijf in je eigen woorden wat je wilt doen of vinden.', ph: 'Wat zoek je? Bijvoorbeeld: e-mailinstellingen, mail van de boekhouder, rapport pdf…', go: 'Zoeken', filters: 'Filters',
    gevonden: (n: number, q: string) => `${n} ${n === 1 ? 'resultaat' : 'resultaten'} gevonden voor «${q}»`, geenQ: 'Begin te typen — suggesties verschijnen meteen.', zoekt: 'Zoeken…', meer: 'Meer tonen', vanTotaal: (a: number, b: number) => `${a} van ${b} getoond`,
    niets: 'Niets gevonden.', nietsTip: 'Probeer andere woorden, synoniemen of een andere spelling; wis filters; kijk of de bron gekoppeld en geïndexeerd is.', dym: 'Bedoelde u misschien', origineel: (q: string) => `«${q}» houden`, zoekAls: (s: string) => `Zoeken naar «${s}»`,
    fout: 'Zoeken lukte niet. Er is niets gewijzigd.', opnieuw: 'Opnieuw', geenRecht: 'Zoeken is in deze ruimte niet beschikbaar: geen toestemming of de sessie is verlopen. Meld opnieuw aan of controleer de rechten.', geenBronnen: 'Er is nog geen enkele bron gekoppeld. Koppel e-mail, bestanden, agenda of GitHub bij de integraties — dan valt hier iets te zoeken. Pagina’s en instellingen van de site zelf worden automatisch geïndexeerd.',
    nietsGeindexeerd: 'Het filter «alleen volledig geïndexeerd» staat aan, maar geen enkele bron is al volledig geïndexeerd. Zet het filter uit of wacht even.', live: 'De index voor deze ruimte is nog leeg — resultaten komen uit een rechtstreekse zoekopdracht (trager, mogelijk onvolledig).', indexeert: 'Indexeren loopt — resultaten kunnen onvolledig zijn:', deels: 'Sommige bronnen zijn niet beschikbaar of geven een fout:',
    momentopname: (d: string) => `Bewaarde resultaten van ${d}. Vernieuwen met de actuele index…`, vernieuwd: (n: number, w: number) => `Vernieuwd met de actuele index: nieuw — ${n}, niet meer beschikbaar — ${w}.`, weg: 'Niet meer beschikbaar', wegUitleg: 'Deze resultaten zaten in de bewaarde zoekopdracht, maar staan nu niet meer in de index (verwijderd, rechten gewijzigd of bron ontkoppeld).',
    recent: 'Recente zoekopdrachten', wis: 'Geschiedenis wissen', wisEen: 'Rij verwijderen', herhaal: 'Opnieuw zoeken', geenRecent: 'De geschiedenis is leeg. Ze staat op de server, apart per account en ruimte.', keer: (n: number) => `${n}×`,
    wat: 'Wat je kunt zoeken', watLijst: ['Functies en instellingen: «taal wijzigen», «e-mail koppelen», «thema’s»', 'E-mails: onderwerp, afzender, woorden in de tekst of in een bijlage', 'Bestanden en documenten: naam, inhoud van PDF/DOCX/TXT, scans (OCR), archieven', 'Agenda-afspraken, taken en notities van het bord, GitHub-repositories en issues', 'In elke taal, met typefouten, in translit of met synoniemen'],
    bronnen: 'Stand van de bronnen', tip: 'Tip: ↑↓ — suggesties, Enter — zoeken, Esc — wissen, ⌘K / Ctrl+K — zoeken vanaf elke pagina, «-woord» sluit een woord uit.', actieveFilters: 'Actieve voorwaarden', verwijderFilter: 'Voorwaarde weghalen', categorieen: 'Categorieën', resultaten: 'Zoekresultaten', skelet: 'Resultaten laden', laatsteOk: 'bijgewerkt', objecten: (n: number) => `${n} ${n === 1 ? 'object' : 'objecten'}`,
    ordening: 'Ordening', opRelevantie: 'Op relevantie', opBron: 'Per bron', weergave: 'Weergave', lijst: 'Lijst', raster: 'Raster', groepN: (n: number) => `${n}`,
    tech: 'U zoekt in de technische ruimte (het technisch profiel is actief in dit tabblad). Persoonlijke gegevens — post, bestanden, agenda — zijn hier alleen beschikbaar voor diensten die in de technische ruimte op «eigen gegevens» staan; anders staan ze als «Niet gekoppeld».', techLink: 'Zoeken in de persoonlijke ruimte openen (nieuw tabblad)', techPrive: 'persoonlijk', techTech: 'technisch', indexKnop: 'Indexeren…', indexKnopUitleg: 'Geforceerde volledige of gedeeltelijke indexatie in een zwevend venster', geslotenGroep: (n: number) => `Diensten die in deze ruimte dicht staan (${n})`,
    ivTitel: 'Zoekindex bijwerken', ivNietGeladen: 'Het indexvenster laadde niet: het technisch profiel in dit tabblad is afgelopen of er is een nieuwe versie van de site. Vernieuw de pagina; is het profiel beëindigd, zet het dan opnieuw aan.', ivHerladen: 'Pagina vernieuwen' },
};

type Fout = { soort: 'geenRecht' | 'fout'; code: string } | null;
type Momentopname = { rij: GeschiedenisRij; nieuw: number; weg: Array<{ bron: string; id: string }>; vernieuwd: boolean };
const useMobiel = () => { const [m, setM] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches); useEffect(() => { const mq = matchMedia('(max-width: 900px)'); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []); return m; };

export default function ZoekPagina({ lang }: { lang: Lang }) {
  const t = T[lang]; const uid = useId(); const mobiel = useMobiel();
  const init = useMemo(() => leesUrl(location.search), []);
  // Het huidige resultaat van het uitklapvenster (zelfde tabblad, nog geen 10 minuten oud, zelfde vraag en categorie, zonder filters): meteen tonen.
  const voorvulling = useMemo(() => { const v = parseQuery(init.q).query; return v.length >= 2 && aantalFilters(init.f) === 0 ? leesLaatste(v, init.cat) : null; }, [init]);
  const [input, setInput] = useState(init.q); const [q, setQ] = useState(init.q);
  const [cat, setCat] = useState<Categorie>(init.cat); const [f, setF] = useState<Filters>(init.f);
  const [antwoord, setAntwoord] = useState<ZoekUitkomst | null>(voorvulling); const [items, setItems] = useState<ZoekTreffer[]>(voorvulling?.items ?? []);
  const [loading, setLoading] = useState(false); const [meerLaden, setMeerLaden] = useState(false); const [fout, setFout] = useState<Fout>(null);
  const [stand, setStand] = useState<ZoekBronStand[] | null>(null); const [standFout, setStandFout] = useState(false); const [gesloten, setGesloten] = useState<Gesloten[]>([]);
  const [geschiedenis, setGeschiedenis] = useState<GeschiedenisRij[]>([]); const [geschFout, setGeschFout] = useState(false);
  const [serverSugg, setServerSugg] = useState<ZoekSuggestie[]>([]);
  const [momentopname, setMomentopname] = useState<Momentopname | null>(null);
  const [drawer, setDrawer] = useState(false); const [herhaal, setHerhaal] = useState(0); // heropenen van dezelfde vraag → toch opnieuw zoeken
  const [laden, setLaden] = useState<Partial<Record<ZoekBronStand['bron'], 'prive' | 'technisch'>>>({});
  const [wk, setWk] = useState<WeergaveKeuze>(() => leesWeergave()); const kiesWk = (k: Partial<WeergaveKeuze>) => setWk(v => { const n = { ...v, ...k }; bewaarWeergave(n); return n; });
  const tech = useTech(); const techAan = techActief(tech);
  const [indexOpen, setIndexOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null); const filterKnop = useRef<HTMLButtonElement | null>(null);
  const ctl = useRef<AbortController | null>(null); const suggCtl = useRef<AbortController | null>(null);
  const expliciet = useRef(false); const geschTimer = useRef<number | undefined>(undefined); const versie = useRef(0);
  const { query: serverQ, excludeTerms } = parseQuery(q);
  const terms = useMemo(() => norm(serverQ).split(' ').filter(Boolean), [serverQ]);
  const filterSleutel = JSON.stringify(filtersVoorGeschiedenis(cat, f));

  // Oude localStorage-geschiedenis (zonder gebruiker) opruimen; stand van de bronnen en geschiedenis van de server laden.
  useEffect(() => { oudeGeschiedenisOpruimen(); }, []);
  const laadStand = useCallback(() => { bronStand().then(s => { setStand(s.standen); setGesloten(s.gesloten); setLaden(s.laden); setStandFout(false); }).catch(() => { setStand(null); setStandFout(true); }); }, []);
  const laadGeschiedenis = useCallback(() => { geschiedenisLijst().then(l => { setGeschiedenis(l); setGeschFout(false); }).catch(() => setGeschFout(true)); }, []);
  useEffect(() => { laadStand(); laadGeschiedenis(); }, [laadStand, laadGeschiedenis]);

  // Debounce 250 ms: getypte tekst → uitgevoerde vraag. Enter/knop/keuze zet q meteen (expliciet).
  useEffect(() => { if (input.trim() === q) return; const id = window.setTimeout(() => { expliciet.current = false; setQ(input.trim()); }, DEBOUNCE_MS); return () => window.clearTimeout(id); }, [input]);
  const submit = useCallback((v: string) => { const s = v.trim(); expliciet.current = true; setInput(s); setQ(s); }, []);
  // «Перейти до пошуку» terwijl deze pagina al open is: tekst, categorie en het resultaat van het venster overnemen, zonder herladen (preventDefault = overgenomen).
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<NaarPaginaDetail>).detail; if (!d || typeof d.q !== 'string') return;
      e.preventDefault();
      setMomentopname(null); setF(LEEG_FILTER); setCat(CATEGORIEEN.includes(d.cat) ? d.cat : 'all');
      if (d.uitkomst && d.uitkomst.items.length) { setAntwoord(d.uitkomst); setItems(d.uitkomst.items); setFout(null); }
      submit(d.q); setHerhaal(n => n + 1);
    };
    window.addEventListener(ZOEK_NAAR_PAGINA_EVENT, h);
    return () => window.removeEventListener(ZOEK_NAAR_PAGINA_EVENT, h);
  }, [submit]);

  // Suggesties (6.1): server + eigen geschiedenis; 250 ms; één lopend verzoek.
  useEffect(() => {
    suggCtl.current?.abort(); const v = input.trim();
    if (v.length < 1) { setServerSugg([]); return; }
    const ac = new AbortController(); suggCtl.current = ac;
    const id = window.setTimeout(() => { haalSuggesties(v, 8, { signal: ac.signal }).then(s => { if (!ac.signal.aborted) setServerSugg(s); }).catch(() => { if (!ac.signal.aborted) setServerSugg([]); }); }, DEBOUNCE_MS);
    return () => { window.clearTimeout(id); ac.abort(); };
  }, [input]);
  const veldSuggesties: VeldSuggestie[] = useMemo(() => {
    const v = norm(input); const uitGesch: VeldSuggestie[] = (v ? geschiedenis.filter(g => norm(g.vraag).startsWith(v) && norm(g.vraag) !== v).slice(0, 3) : geschiedenis.slice(0, 6)).map(g => ({ soort: 'geschiedenis', tekst: g.vraag, id: g.id, aantal: g.totaal }));
    const gezien = new Set(uitGesch.map(s => norm(s.tekst)));
    // Functies en pagina's eerst (6.1), dan correcties/synoniemen/aanvullingen.
    const volgorde: Record<ZoekSuggestie['soort'], number> = { functie: 0, pagina: 1, categorie: 2, correctie: 3, synoniem: 4, aanvulling: 5 };
    const server = [...serverSugg].sort((a, b) => volgorde[a.soort] - volgorde[b.soort]).filter(s => { const k = norm(s.tekst); if (gezien.has(k)) return false; gezien.add(k); return true; });
    return [...uitGesch, ...server].slice(0, 10);
  }, [input, geschiedenis, serverSugg]);

  // DE zoekopdracht: bij elke wijziging van vraag/categorie/filters pagina 1; AbortController; nooit twee tegelijk.
  const vraagKern = useCallback(async (pagina: number, moment: Momentopname | null) => {
    ctl.current?.abort(); const ac = new AbortController(); ctl.current = ac; const mijn = ++versie.current;
    try {
      const a = await zoeken(bouwVraag(serverQ, cat, f, pagina, stand), { signal: ac.signal });
      if (ac.signal.aborted || mijn !== versie.current) return;
      setAntwoord(a); setFout(null); if (a.gesloten.length) setGesloten(a.gesloten);
      if (pagina > 1) setItems(prev => { const gezien = new Set(prev.map(x => `${x.bron}:${x.id}`)); return [...prev, ...a.items.filter(x => !gezien.has(`${x.bron}:${x.id}`))]; });
      else {
        setItems(a.items);
        // Geschiedenis (§10): expliciet → meteen; getypt → na 1,5 s rust. Uit een momentopname → meteen, met het verschil.
        window.clearTimeout(geschTimer.current);
        const bewaar = () => geschiedenisBewaren({ vraag: serverQ, filters: filtersVoorGeschiedenis(cat, f), treffers: a.items.map(x => ({ bron: x.bron, id: x.id })), totaal: a.totaal, algoritmeVersie: a.versie || ZOEK_VERSIE, indexVersie: a.bron })
          .then(r => { if (mijn !== versie.current) return; if (moment) setMomentopname({ ...moment, nieuw: r.nieuw.length, weg: r.weg, vernieuwd: true }); laadGeschiedenis(); }).catch(() => { if (moment) setMomentopname({ ...moment, vernieuwd: true }); });
        if (moment || expliciet.current) void bewaar(); else geschTimer.current = window.setTimeout(() => void bewaar(), GESCHIEDENIS_NA_MS);
      }
    } catch (e) {
      if (ac.signal.aborted || isAfgebroken(e) || mijn !== versie.current) return;
      const st = e instanceof ApiError ? e.statusCode : 0; const code = e instanceof ApiError ? e.message : 'NETWORK_ERROR';
      setFout({ soort: st === 401 || st === 403 ? 'geenRecht' : 'fout', code }); if (pagina === 1) { setItems([]); setAntwoord(null); }
      if (moment) { setMomentopname({ ...moment, vernieuwd: true }); geschiedenisBewaren({ vraag: serverQ, filters: filtersVoorGeschiedenis(cat, f), treffers: [], totaal: 0, algoritmeVersie: ZOEK_VERSIE, indexVersie: '', stand: 'fout' }).catch(() => undefined); }
    } finally { if (!ac.signal.aborted && mijn === versie.current) { setLoading(false); setMeerLaden(false); } }
  }, [serverQ, cat, f, stand, laadGeschiedenis]);
  useEffect(() => {
    history.replaceState(history.state, '', schrijfUrl(location.href, q, cat, f));
    window.clearTimeout(geschTimer.current);
    if (serverQ.length < 2) { ctl.current?.abort(); setAntwoord(null); setItems([]); setFout(null); setLoading(false); if (momentopname) setMomentopname(null); return; }
    if (nietsGeindexeerd(cat, f, stand)) { ctl.current?.abort(); setAntwoord(null); setItems([]); setFout(null); setLoading(false); return; }
    setLoading(true); setFout(null);
    void vraagKern(1, momentopname && !momentopname.vernieuwd ? momentopname : null);
    return () => { ctl.current?.abort(); };
  }, [serverQ, cat, filterSleutel, stand === null, herhaal]);
  const meer = () => { if (!antwoord || meerLaden || loading) return; setMeerLaden(true); void vraagKern(antwoord.pagina + 1, null); };

  // Geschiedenis (§10): heropenen = vraag + filters terugzetten, momentopname meteen tonen, opnieuw zoeken, markeren.
  const openRij = async (g: GeschiedenisRij) => {
    setDrawer(false);
    const vol = await geschiedenisOpen(g.id).catch(() => null); const rij = vol || g;
    const { cat: c2, f: f2 } = filtersUitGeschiedenis(rij.filters);
    setMomentopname({ rij, nieuw: 0, weg: [], vernieuwd: false }); setItems([]); setAntwoord(null); setCat(c2); setF(f2); submit(rij.vraag); setHerhaal(n => n + 1);
  };
  const wisRij = async (g: GeschiedenisRij) => { setGeschiedenis(l => l.filter(x => x.id !== g.id)); try { await geschiedenisWis(g.id); } catch { laadGeschiedenis(); } };
  const wisAlles = async () => { setGeschiedenis([]); try { await geschiedenisWisAlles(); } catch { laadGeschiedenis(); } };

  // Afgeleiden
  const zichtbaar = useMemo(() => filterLokaal(items, f, excludeTerms), [items, f.minPercent, excludeTerms.join(',')]);
  const gemarkeerd = useMemo(() => (momentopname ? markeerTegenMomentopname(momentopname.rij.treffers, zichtbaar) : { items: zichtbaar.map(x => ({ ...x, markering: 'gebleven' as Markering })), weg: [] as Array<{ bron: string; id: string }> }), [momentopname, zichtbaar]);
  const wegLijst = momentopname?.vernieuwd ? (momentopname.weg.length ? momentopname.weg : gemarkeerd.weg) : [];
  const categorieen = useMemo(() => zichtbareCategorieen(stand), [stand]);
  const geenBronnen = !!stand && stand.length > 0 && stand.every(s => s.stand === 'niet_gekoppeld') && !stand.some(s => s.aantal > 0);
  const indexeert = (stand || []).filter(s => s.stand === 'indexeert'); const deels = (stand || []).filter(s => s.stand === 'fout' || s.stand === 'gedeeltelijk');
  const correcties = (antwoord?.suggesties || []).filter(s => s.soort === 'correctie' && norm(s.tekst) !== norm(serverQ)).slice(0, 4);
  const nFilters = aantalFilters(f);
  const toonResultaten = serverQ.length >= 2;
  const actieveChips: Array<{ k: string; label: string; weg: () => void }> = [
    ...f.bronnen.map(b => ({ k: `b:${b}`, label: BRON_NAAM[b][lang], weg: () => setF({ ...f, bronnen: f.bronnen.filter(x => x !== b) }) })),
    ...f.soorten.map(s => ({ k: `s:${s}`, label: s, weg: () => setF({ ...f, soorten: f.soorten.filter(x => x !== s) }) })),
    ...f.formaten.map(x => ({ k: `f:${x}`, label: x.toUpperCase(), weg: () => setF({ ...f, formaten: f.formaten.filter(y => y !== x) }) })),
    ...f.talen.map(x => ({ k: `t:${x}`, label: x, weg: () => setF({ ...f, talen: f.talen.filter(y => y !== x) }) })),
    ...(f.datum !== 'any' ? [{ k: 'd', label: f.datum === 'eigen' ? `${f.van || '…'} – ${f.tot || '…'}` : ({ d1: lang === 'uk' ? 'Сьогодні' : 'Vandaag', d7: lang === 'uk' ? '7 днів' : '7 dagen', d30: lang === 'uk' ? '30 днів' : '30 dagen', y1: lang === 'uk' ? 'Рік' : 'Jaar' } as Record<string, string>)[f.datum] || f.datum, weg: () => setF({ ...f, datum: 'any', van: '', tot: '' }) }] : []),
    ...(f.minPercent ? [{ k: 'm', label: `≥ ${f.minPercent}%`, weg: () => setF({ ...f, minPercent: 0 }) }] : []),
    ...(f.indexStand === 'klaar' ? [{ k: 'i', label: lang === 'uk' ? 'повністю проіндексовані' : 'volledig geïndexeerd', weg: () => setF({ ...f, indexStand: 'alle' }) }] : []),
    ...(f.sorteer !== 'relevantie' ? [{ k: 'o', label: f.sorteer, weg: () => setF({ ...f, sorteer: 'relevantie' }) }] : []),
  ];
  const onKiesSuggestie = (s: VeldSuggestie): boolean => {
    if (s.soort === 'geschiedenis') { const g = geschiedenis.find(x => x.id === s.id); if (g) { void openRij(g); return true; } return false; }
    if ((s.soort === 'functie' || s.soort === 'pagina') && s.route) { const url = routeUrl(s.route, lang); if (url) { location.assign(url); return true; } }
    if (s.soort === 'categorie' && s.bron) { const c = (Object.keys(CATEGORIE_BRONNEN) as Categorie[]).find(k => k !== 'all' && CATEGORIE_BRONNEN[k].includes(s.bron!)); if (c) setCat(c); }
    return false;
  };
  const openResultaat = (_r: ZoekTreffer, url: string) => { location.assign(url); };
  const statusTekst = loading ? t.zoekt : fout ? '' : antwoord && toonResultaten ? t.gevonden(antwoord.totaal, serverQ) : !toonResultaten ? t.geenQ : '';
  const groepen = useMemo(() => (wk.ordening === 'bron' ? groepeerPerCategorie(gemarkeerd.items) : null), [wk.ordening, gemarkeerd.items]);
  const kaart = (r: typeof gemarkeerd.items[number]) => <li key={`${r.bron}:${r.id}`}><ZoekKaart r={r} lang={lang} terms={terms} markering={momentopname?.vernieuwd ? r.markering : undefined} onOpen={openResultaat} weergave={wk.weergave} /></li>;
  const standRij = (s: ZoekBronStand) => (
    <li key={s.bron} className={`zk-stand stand-${s.stand}`}>
      <span className='zk-stand-naam'>{BRON_NAAM[s.bron][lang]}{techAan && laden[s.bron] && <span className={`pil pil-stil zk-stand-lade is-${laden[s.bron]}`}>{laden[s.bron] === 'prive' ? t.techPrive : t.techTech}</span>}</span>
      <span className={`pil ${s.stand === 'klaar' ? 'pil-ok' : s.stand === 'fout' ? 'pil-fout' : s.stand === 'niet_gekoppeld' ? 'pil-stil' : 'pil-warn'}`}>{BRON_STAND_NAAM[s.stand][lang]}{s.stand === 'indexeert' ? ` ${s.voortgang}%` : ''}</span>
      {s.stand === 'indexeert' && <progress className='zk-voortgang' max={100} value={s.voortgang} aria-label={`${BRON_NAAM[s.bron][lang]}: ${s.voortgang}%`} />}
      <small className='zk-stand-meta'>{s.stand !== 'niet_gekoppeld' ? t.objecten(s.aantal) : ''}{s.laatsteOk > 0 ? ` · ${t.laatsteOk} ${fmtDatum(s.laatsteOk, lang)}` : ''}{s.fout ? ` · ${s.fout}` : ''}</small>
    </li>);

  return (
    <div className='zk-pagina' data-zoek-pagina='z4' data-zoek-staat={loading ? 'laden' : fout ? fout.soort : !toonResultaten ? 'begin' : momentopname && !momentopname.vernieuwd ? 'momentopname' : antwoord && !gemarkeerd.items.length ? 'niets' : 'resultaten'} data-zoek-weergave={wk.weergave} data-zoek-ordening={wk.ordening} data-zoek-tech={techAan ? '1' : '0'}>
      {/* D3: in het technisch profiel is de doorzochte ruimte de TECHNISCHE — anders begrijpt niemand waarom alles «Не підключено» is. */}
      {techAan && <p className='melding melding-info zk-tech-strook' role='status' data-zoek-tech-strook='1'><Wrench aria-hidden='true' /><span>{t.tech} <a href={`/zoek?lang=${lang}`} target='_blank' rel='noopener'>{t.techLink}</a></span></p>}
      <section className='zk-kop kaart' aria-labelledby={`${uid}-h`}>
        <div className='zk-kop-tekst'><span className='zk-kop-ic' aria-hidden='true'><Search /></span><div><h1 id={`${uid}-h`} className='zk-h'>{t.h}</h1><p className='zk-sub'>{t.sub}</p></div></div>
        <form role='search' className='zk-form' onSubmit={e => { e.preventDefault(); submit(input); }} aria-label={t.h}>
          <ZoekVeld lang={lang} value={input} onChange={setInput} onSubmit={submit} onKies={onKiesSuggestie} suggesties={veldSuggesties} placeholder={t.ph} label={t.h} groot inputRef={inputRef} beschrijvingId={`${uid}-tip`}
            rechts={<button type='submit' className='knop knop-primair zk-go'><Search aria-hidden='true' /><span>{t.go}</span></button>} />
        </form>
        {correcties.length > 0 && (
          <p className='zk-dym' role='status'><Sparkles aria-hidden='true' /> {t.dym}: {correcties.map(c => <button key={c.tekst} type='button' className='zk-dym-knop' onClick={() => submit(c.tekst)} aria-label={t.zoekAls(c.tekst)}>{c.tekst}</button>)}
            <span className='zk-dym-orig'>— {t.origineel(serverQ)}</span></p>)}
        <div className='zk-tabs-rij'><TabsRij lang={lang} label={t.categorieen} navKlasse='zk-tabs' wrapKlasse='zk-tabs-wrap'>
          {categorieen.map(c => { const n = categorieTelling(c, antwoord?.facets); return (
            <button key={c} type='button' role='tab' aria-selected={cat === c} aria-controls={`${uid}-res`} id={`${uid}-tab-${c}`} className={`zk-tab${cat === c ? ' is-aan' : ''}`} tabIndex={cat === c ? 0 : -1} onClick={() => setCat(c)}
              onKeyDown={e => { const i = categorieen.indexOf(c); const n2 = e.key === 'ArrowRight' ? categorieen[(i + 1) % categorieen.length] : e.key === 'ArrowLeft' ? categorieen[(i + categorieen.length - 1) % categorieen.length] : e.key === 'Home' ? categorieen[0] : e.key === 'End' ? categorieen[categorieen.length - 1] : null; if (n2) { e.preventDefault(); setCat(n2); document.getElementById(`${uid}-tab-${n2}`)?.focus(); } }}>
              {CATEGORIE_NAAM[c][lang]}{typeof n === 'number' && toonResultaten && <span className='zk-tab-n'>{n}</span>}</button>); })}
        </TabsRij>
          <button type='button' ref={filterKnop} className='knop knop-stil is-klein zk-filterknop' aria-expanded={mobiel ? drawer : undefined} aria-controls={mobiel ? `${uid}-f` : undefined} onClick={() => (mobiel ? setDrawer(true) : document.querySelector<HTMLElement>('[data-zoek-filters="kolom"] input, [data-zoek-filters="kolom"] select')?.focus())}><SlidersHorizontal aria-hidden='true' />{t.filters}{nFilters > 0 && <span className='pil pil-info zk-filter-n'>{nFilters}</span>}</button>
          {techAan && <button type='button' className='knop knop-secundair is-klein zk-indexknop' onClick={() => setIndexOpen(true)} aria-pressed={indexOpen} title={t.indexKnopUitleg} data-zoek-index-knop='1'><RefreshCw aria-hidden='true' />{t.indexKnop}</button>}
        </div>
        {actieveChips.length > 0 && <ul className='zk-actief' aria-label={t.actieveFilters}>{actieveChips.map(c => <li key={c.k}><button type='button' className='pil pil-info zk-chip' onClick={c.weg} aria-label={`${t.verwijderFilter}: ${c.label}`}>{c.label}<X aria-hidden='true' /></button></li>)}</ul>}
      </section>

      <div className={`zk-raster${mobiel ? ' is-mobiel' : ''}`}>
        <main id={`${uid}-res`} role='tabpanel' aria-labelledby={`${uid}-tab-${cat}`} className='zk-resultaten' aria-busy={loading || meerLaden}>
          <div className='zk-balk'>
            <h2 className='zk-balk-h'>{t.resultaten}</h2>
            <p role='status' aria-live='polite' className='zk-status'>{loading && <Loader2 className='zk-spin' aria-hidden='true' />}{statusTekst}</p>
            {toonResultaten && (
              <div className='zk-weergave' data-zoek-weergave-knoppen='1'>
                <label className='zk-select zk-ordening'><span className='zk-sr'>{t.ordening}</span>
                  <select value={wk.ordening} onChange={e => kiesWk({ ordening: e.target.value === 'bron' ? 'bron' : 'relevantie' })} data-hulp-vrij='sortering'><option value='relevantie'>{t.opRelevantie}</option><option value='bron'>{t.opBron}</option></select></label>
                <span className='zk-weergave-knoppen' role='group' aria-label={t.weergave}>
                  <button type='button' className='knop-icoon' aria-pressed={wk.weergave === 'lijst'} aria-label={t.lijst} title={t.lijst} onClick={() => kiesWk({ weergave: 'lijst' })}><List aria-hidden='true' /></button>
                  <button type='button' className='knop-icoon' aria-pressed={wk.weergave === 'raster'} aria-label={t.raster} title={t.raster} onClick={() => kiesWk({ weergave: 'raster' })}><LayoutGrid aria-hidden='true' /></button>
                </span>
              </div>)}
          </div>
          {/* banden: eerlijk over de staat van de bronnen */}
          {fout?.soort === 'geenRecht' && <p className='melding melding-warn' role='alert'><AlertTriangle aria-hidden='true' /><span>{t.geenRecht} <code>{fout.code}</code></span></p>}
          {fout?.soort === 'fout' && <p className='melding melding-fout' role='alert'><AlertTriangle aria-hidden='true' /><span>{t.fout} <code>{fout.code}</code> <button type='button' className='knop knop-secundair is-klein' onClick={() => { setFout(null); setLoading(true); void vraagKern(1, null); }}><RefreshCw aria-hidden='true' />{t.opnieuw}</button></span></p>}
          {toonResultaten && nietsGeindexeerd(cat, f, stand) && <p className='melding melding-warn'><Info aria-hidden='true' /><span>{t.nietsGeindexeerd}</span></p>}
          {toonResultaten && antwoord?.bron === 'live' && <p className='melding melding-info'><Info aria-hidden='true' /><span>{t.live}</span></p>}
          {toonResultaten && indexeert.length > 0 && <p className='melding melding-info'><Loader2 className='zk-spin' aria-hidden='true' /><span>{t.indexeert} {indexeert.map(s => `${BRON_NAAM[s.bron][lang]} ${s.voortgang}%`).join(', ')}</span></p>}
          {/* 22.10 (etap F): hetzelfde vlak als de hub-blokken en de oude «Пошук усюди» (RuimteGeslotenVlak), niet een eigen lijstje — één uitleg voor een gesloten dienst op de hele site. */}
          {gesloten.length > 0 && (() => {
            const vlakken = gesloten.map(g => isRuimteCode(g.code) ? <RuimteGeslotenVlak key={g.dienst} lang={lang} gesloten={{ code: g.code, dienst: g.dienst as DeelbareDienst, dienstNaam: g.dienstNaam, uitleg: g.uitleg }} /> : <p key={g.dienst} className='melding melding-warn' role='status'><b>{g.dienstNaam[lang] || g.dienst}</b>: {g.uitleg[lang] || g.code}</p>);
            // Zone D: meer dan twee gesloten diensten (technisch profiel zonder keuze: zeven) duwden de resultaten een scherm naar beneden — één
            // uitklapbaar blok met de namen; erin dezelfde vlakken (zelfde uitleg en knop als op de hele site).
            return gesloten.length > 2
              ? <details className='zk-gesloten zk-gesloten-groep kaart-zacht' data-zoek-gesloten={gesloten.length}><summary><Lock aria-hidden='true' /><span>{t.geslotenGroep(gesloten.length)}: {gesloten.map(g => g.dienstNaam[lang] || g.dienst).join(', ')}</span></summary><div className='zk-gesloten-lijst'>{vlakken}</div></details>
              : <div className='zk-gesloten' data-zoek-gesloten={gesloten.length}>{vlakken}</div>;
          })()}
          {toonResultaten && deels.length > 0 && <p className='melding melding-warn'><AlertTriangle aria-hidden='true' /><span>{t.deels} {deels.map(s => `${BRON_NAAM[s.bron][lang]} — ${BRON_STAND_NAAM[s.stand][lang]}${s.fout ? ` (${s.fout})` : ''}`).join('; ')}</span></p>}
          {momentopname && !momentopname.vernieuwd && <p className='melding melding-info' data-zoek-momentopname='laden'><Clock aria-hidden='true' /><span>{t.momentopname(fmtDatum(momentopname.rij.laatstOp, lang))}</span></p>}
          {momentopname?.vernieuwd && !fout && <p className='melding melding-ok' data-zoek-momentopname='vernieuwd'><History aria-hidden='true' /><span>{t.vernieuwd(gemarkeerd.items.filter(x => x.markering === 'nieuw').length, wegLijst.length)}</span></p>}

          {/* begin: wat je kunt zoeken + echte stand van de bronnen */}
          {!toonResultaten && !fout && (
            <div className='zk-begin'>
              {geenBronnen && <p className='melding melding-info' data-zoek-staat-bron='geen'><Info aria-hidden='true' /><span>{t.geenBronnen}</span></p>}
              <section className='kaart-zacht zk-wat' aria-labelledby={`${uid}-wat`}><h3 id={`${uid}-wat`}>{t.wat}</h3><ul>{t.watLijst.map(x => <li key={x}>{x}</li>)}</ul></section>
              <section className='kaart-zacht zk-bronnen' aria-labelledby={`${uid}-br`}><h3 id={`${uid}-br`}>{t.bronnen}</h3>
                {stand ? <ul className='zk-standen'>{stand.map(standRij)}</ul> : standFout ? <p className='melding melding-warn'><AlertTriangle aria-hidden='true' /><span>{t.fout}</span></p> : <p className='zk-skelet-regel' aria-hidden='true' />}
              </section>
              {mobiel && <Geschiedenis lang={lang} t={t} rijen={geschiedenis} fout={geschFout} onOpen={openRij} onWis={wisRij} onWisAlles={wisAlles} />}
            </div>)}

          {/* laden: skelet (of de momentopname als plaatshouder) */}
          {loading && !items.length && (
            <ol className='zk-lijst zk-skelet' aria-label={t.skelet}>{(momentopname && !momentopname.vernieuwd ? momentopname.rij.treffers.slice(0, 6) : [1, 2, 3, 4]).map((x, i) => <li key={i} className='kaart zk-kaart zk-kaart-skelet' aria-hidden='true'><span className='zk-kaart-ic' /><div className='zk-kaart-body'><span className='zk-sk zk-sk-titel'>{typeof x === 'object' ? BRON_NAAM[x.bron as keyof typeof BRON_NAAM]?.[lang] || x.bron : ''}</span><span className='zk-sk' /><span className='zk-sk zk-sk-kort' /></div></li>)}</ol>)}

          {/* resultaten */}
          {toonResultaten && !loading && antwoord && !gemarkeerd.items.length && !fout && (
            <div className='zk-niets' data-zoek-niets='1'><p className='zk-niets-h'>{t.niets}</p><p>{t.nietsTip}</p>
              {correcties.length > 0 && <p>{t.dym}: {correcties.map(c => <button key={c.tekst} type='button' className='knop knop-secundair is-klein' onClick={() => submit(c.tekst)}>{c.tekst}</button>)}</p>}
              {nFilters > 0 && <button type='button' className='knop knop-stil is-klein' onClick={() => setF(LEEG_FILTER)}>{T[lang].filters}: {lang === 'uk' ? 'зняти всі' : 'alles wissen'}</button>}
            </div>)}
          {gemarkeerd.items.length > 0 && !groepen && (
            <ol className={`zk-lijst${wk.weergave === 'raster' ? ' is-raster' : ''}`}>{gemarkeerd.items.map(kaart)}</ol>)}
          {gemarkeerd.items.length > 0 && groepen && groepen.map(g => { const I = CATEGORIE_ICOON[g.categorie]; return (
            <section key={g.categorie} className={`zk-groep-sectie cat-${g.categorie}`} aria-labelledby={`${uid}-g-${g.categorie}`} data-zoek-groep={g.categorie}>
              <h3 id={`${uid}-g-${g.categorie}`} className='zk-groep-kop'><span className='zk-groep-ic' aria-hidden='true'><I /></span>{CATEGORIE_NAAM[g.categorie][lang]}<span className='zk-tab-n'>{t.groepN(g.items.length)}</span></h3>
              <ol className={`zk-lijst${wk.weergave === 'raster' ? ' is-raster' : ''}`}>{g.items.map(kaart)}</ol>
            </section>); })}
          {wegLijst.length > 0 && (
            <details className='zk-weg kaart-zacht' data-zoek-weg={wegLijst.length}><summary>{t.weg} ({wegLijst.length})</summary><p>{t.wegUitleg}</p><ul>{wegLijst.map(w => <li key={`${w.bron}:${w.id}`}><span className='pil pil-stil'>{BRON_NAAM[w.bron as keyof typeof BRON_NAAM]?.[lang] || w.bron}</span> <code>{w.id.slice(0, 40)}</code></li>)}</ul></details>)}
          {antwoord && toonResultaten && items.length < antwoord.totaal && !loading && (
            <div className='zk-meer'><span className='zk-meer-n'>{t.vanTotaal(items.length, antwoord.totaal)}</span><button type='button' className='knop knop-secundair' onClick={meer} disabled={meerLaden}>{meerLaden ? <Loader2 className='zk-spin' aria-hidden='true' /> : <ChevronDown aria-hidden='true' />}{t.meer}</button></div>)}
          <p id={`${uid}-tip`} className='zk-tip'><Info aria-hidden='true' />{t.tip}</p>
        </main>
        <div className='zk-zij'>
          <ZoekFilters lang={lang} f={f} setF={setF} facets={antwoord?.facets} stand={stand} mobiel={mobiel} open={drawer} onClose={() => setDrawer(false)} openerRef={filterKnop} />
          {!mobiel && <Geschiedenis lang={lang} t={t} rijen={geschiedenis} fout={geschFout} onOpen={openRij} onWis={wisRij} onWisAlles={wisAlles} />}
        </div>
      </div>
      {techAan && indexOpen && <Suspense fallback={null}><ZoekIndexVenster lang={lang} onSluit={() => setIndexOpen(false)} onKlaar={laadStand} /></Suspense>}
    </div>);
}

function Geschiedenis({ lang, t, rijen, fout, onOpen, onWis, onWisAlles }: { lang: Lang; t: typeof T['uk']; rijen: GeschiedenisRij[]; fout: boolean; onOpen: (g: GeschiedenisRij) => void; onWis: (g: GeschiedenisRij) => void; onWisAlles: () => void }) {
  const uid = useId();
  return (
    <section className='zk-recent kaart' aria-labelledby={`${uid}-rh`} data-zoek-geschiedenis={rijen.length}>
      <div className='zk-paneel-kop'><h2 id={`${uid}-rh`}><Clock aria-hidden='true' /> {t.recent}</h2>{rijen.length > 0 && <button type='button' className='knop knop-stil is-klein' onClick={onWisAlles}><Trash2 aria-hidden='true' />{t.wis}</button>}</div>
      {fout && <p className='melding melding-warn'><AlertTriangle aria-hidden='true' /><span>{t.fout}</span></p>}
      {!rijen.length && !fout && <p className='zk-recent-leeg'>{t.geenRecent}</p>}
      <ul className='zk-recent-lijst'>{rijen.slice(0, 10).map(g => (
        <li key={g.id}>
          <button type='button' className='zk-recent-knop' onClick={() => onOpen(g)} aria-label={`${t.herhaal}: ${g.vraag}`}><ChevronRight aria-hidden='true' /><span className='zk-recent-q'>{g.vraag}</span><small className='zk-recent-meta'>{relatiefTijd(g.laatstOp, lang) || fmtDatum(g.laatstOp, lang)}{g.aantalKeer > 1 ? ` · ${t.keer(g.aantalKeer)}` : ''}{Object.keys(g.filters).length ? ` · ${lang === 'uk' ? 'фільтри' : 'filters'}: ${Object.keys(g.filters).length}` : ''}{g.stand === 'verouderd' ? ` · ${lang === 'uk' ? 'індекс оновлено' : 'index vernieuwd'}` : ''}</small></button>
          <button type='button' className='knop-icoon zk-recent-wis' aria-label={`${t.wisEen}: ${g.vraag}`} onClick={() => onWis(g)}><X aria-hidden='true' /></button>
        </li>))}</ul>
    </section>);
}
