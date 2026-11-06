// Notities vNext — de pagina (vlag notities-vnext, migratie 0127). Binnen de bestaande CanonicalChrome en het hub-tabblad
// «Нотатки»: geen eigen kop, geen tweede menu. Links een smalle rail (weergaven, mappen, etiketten), midden de notities
// (kaarten of lijst, chips voor filters), rechts een OPTIONELE kolom «Vandaag» (minikalender, checklists). Onder 1200 px
// gaat die kolom onder de lijst; op de telefoon: onderbalk met vier onderdelen, één FAB, bewerker op het hele scherm.
// Toetsen: / = zoeken op deze pagina (Ctrl+K blijft van het zoekpalet van de chrome), Ctrl/Cmd+N = nieuw, Esc = sluiten. Alles via /api/notities/* met de poort van het bord.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight, Folder, FolderPlus, LayoutGrid, List, ListChecks, NotebookPen, PanelRightClose, PanelRightOpen, Pencil, Pin, Plug, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { RuimteGeslotenVlak, RuimteStrook } from '../RuimteStrook';
import type { RuimteFeiten, RuimteGesloten } from '../../shared/ruimte-weergave';
import { WEERGAVE_LABEL, lijstRegelOmzetten, lijstVoortgang, ordenVnext, type Notitie, type NotitieMap, type NotitieSoort, type Weergave } from '../../shared/notities-vnext-model';
import NotitieKaart from './NotitieKaart';
import { NotitiesFout, notitiesClient, voorkeurenBewaren, voorkeurenLezen, type LijstAntwoord, type Voorkeuren } from './notities-client';
import { SOORT_LABEL, foutTekst, inVeld, locale, tr, useSmal, type Lang } from './tekst';
import './notities-vnext.css';
import { DIEPE_PARAMS, diepeWaarde, wisDiepeParams } from '../../shared/zoek-diepe-link';

const NotitieBewerker = lazy(() => import('./NotitieBewerker'));
const NotitiesImport = lazy(() => import('./NotitiesImport'));
const NotitiesBronnen = lazy(() => import('./NotitiesBronnen'));

type Scherm = Weergave | 'bronnen';
type Laag = { soort: 'geen' } | { soort: 'nieuw'; startSoort?: NotitieSoort } | { soort: 'bewerk'; notitie: Notitie } | { soort: 'import' };
const LEGE_TELLING: Record<Weergave, number> = { alle: 0, vandaag: 0, vast: 0, lijsten: 0, archief: 0, prullenbak: 0 };
const RAIL_ICOON: Record<Weergave, typeof NotebookPen> = { alle: NotebookPen, vandaag: CalendarDays, vast: Pin, lijsten: ListChecks, archief: Archive, prullenbak: Trash2 };

export default function NotitiesPagina({ lang }: { lang: Lang }) {
  const smal = useSmal();
  const [scherm, setScherm] = useState<Scherm>('alle');
  const [mapId, setMapId] = useState<string | null>(null);
  const [etiket, setEtiket] = useState('');
  const [vraag, setVraag] = useState('');
  const [soort, setSoort] = useState<NotitieSoort | ''>('');
  const [data, setData] = useState<LijstAntwoord | null>(null);
  const [extra, setExtra] = useState<Notitie[]>([]);
  const [gesloten, setGesloten] = useState<RuimteGesloten | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [laag, setLaag] = useState<Laag>({ soort: 'geen' });
  const [voorkeur, setVoorkeur] = useState<Voorkeuren>(voorkeurenLezen);
  const [melding, setMelding] = useState('');
  const [mapBewerk, setMapBewerk] = useState<{ id: string; naam: string } | null>(null);
  const [nieuweMap, setNieuweMap] = useState<string | null>(null);
  const [maand, setMaand] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const zoekVeld = useRef<HTMLInputElement | null>(null);
  const laadTeller = useRef(0);
  const weergave: Weergave = scherm === 'bronnen' ? 'alle' : scherm;

  const zetVoorkeur = (p: Partial<Voorkeuren>) => setVoorkeur((v) => { const n = { ...v, ...p }; voorkeurenBewaren(n); return n; });
  const laad = useCallback(async (opts: { stil?: boolean; offset?: number } = {}) => {
    const nr = ++laadTeller.current;
    if (!opts.stil && !opts.offset) setData((d) => (d ? d : null));
    try {
      const r = await notitiesClient.lijst({ weergave, mapId, etiket, vraag, soort, kleur: '', offset: opts.offset ?? 0 });
      if (nr !== laadTeller.current) return;
      if (opts.offset) setExtra((x) => [...x, ...r.notities]); else { setData(r); setExtra([]); }
      setGesloten(null); setFout('');
    } catch (e) {
      if (nr !== laadTeller.current) return;
      if (e instanceof NotitiesFout && e.gesloten) { setGesloten(e.gesloten); setData({ notities: [], totaal: 0, offset: 0, limiet: 0, volgende: null, telling: LEGE_TELLING, mappen: [], etiketten: [], ruimte: null }); setFout(''); return; }
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : String((e as Error)?.message || 'FOUT')));
      setData((d) => d ?? { notities: [], totaal: 0, offset: 0, limiet: 0, volgende: null, telling: LEGE_TELLING, mappen: [], etiketten: [], ruimte: null });
    }
  }, [weergave, mapId, etiket, vraag, soort, lang]);
  useEffect(() => { const t = setTimeout(() => void laad(), vraag ? 220 : 0); return () => clearTimeout(t); }, [laad, vraag]);

  const toon = (tekst: string) => { setMelding(tekst); setTimeout(() => setMelding(''), 4000); };
  const notities = useMemo(() => ordenVnext([...(data?.notities ?? []), ...extra], voorkeur.volgorde), [data, extra, voorkeur.volgorde]);
  const mappen = data?.mappen ?? [];
  const telling = data?.telling ?? LEGE_TELLING;
  const ruimte: RuimteFeiten | null = data?.ruimte ?? null;

  const actie = async (n: Notitie, a: 'vast' | 'losmaken' | 'archief' | 'uit-archief' | 'prullenbak' | 'herstel' | 'definitief') => {
    if (bezig) return;
    setBezig(true);
    try {
      await notitiesClient.actie(n.id, a);
      if (a === 'prullenbak') toon(tr(lang, 'Перенесено в кошик (30 днів на відновлення).', 'Naar de prullenbak (30 dagen te herstellen).'));
      if (a === 'archief') toon(tr(lang, 'Архівовано.', 'Gearchiveerd.'));
      if (a === 'herstel') toon(tr(lang, 'Відновлено.', 'Hersteld.'));
      if (a === 'definitief') toon(tr(lang, 'Видалено назавжди.', 'Voorgoed verwijderd.'));
      await laad({ stil: true });
    } catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
    finally { setBezig(false); }
  };
  const vink = async (n: Notitie, regel: number) => {
    if (bezig) return;
    setBezig(true);
    try { await notitiesClient.wijzig(n.id, n.versie, { inhoud: lijstRegelOmzetten(n.inhoud, regel) }); await laad({ stil: true }); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); if (e instanceof NotitiesFout && e.code === 'VERSIE_VEROUDERD') await laad({ stil: true }); }
    finally { setBezig(false); }
  };
  const open = (n: Notitie) => { if (n.verwijderdOp) return; setLaag({ soort: 'bewerk', notitie: n }); };
  // ZOEKDIEP-001 (05.11.2026): diepe link uit de zoekpagina (?open_item_id=<id>; zelfde id als het bord, migratie 0127) → de notitie
  // ophalen (ook als zij niet op de eerste pagina staat) en in de bewerker openen. Niet gevonden → eerlijke melding.
  const zoekNotitie = useRef(typeof location !== 'undefined' ? diepeWaarde(location.search, DIEPE_PARAMS.item) : '');
  useEffect(() => {
    const id = zoekNotitie.current; if (!id) return;
    zoekNotitie.current = ''; wisDiepeParams(DIEPE_PARAMS.item);
    notitiesClient.een(id).then((n) => { if (n && !n.verwijderdOp) open(n); else setFout(tr(lang, 'Нотатку з пошуку не знайдено: можливо, її вже видалено.', 'De notitie uit de zoekresultaten is niet gevonden: misschien is zij verwijderd.')); },
      () => setFout(tr(lang, 'Нотатку з пошуку не знайдено: можливо, її вже видалено.', 'De notitie uit de zoekresultaten is niet gevonden: misschien is zij verwijderd.')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const bewaard = (n: Notitie, nieuw: boolean) => { toon(nieuw ? tr(lang, 'Нотатку створено.', 'Notitie aangemaakt.') : tr(lang, 'Збережено.', 'Opgeslagen.')); if (nieuw) setLaag({ soort: 'bewerk', notitie: n }); void laad({ stil: true }); };
  const mapNieuw = async () => {
    const naam = (nieuweMap ?? '').trim(); if (!naam) { setNieuweMap(null); return; }
    try { await notitiesClient.mapNieuw(naam, 'geen'); setNieuweMap(null); await laad({ stil: true }); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
  };
  const mapHernoem = async () => {
    if (!mapBewerk) return;
    try { await notitiesClient.mapWijzig(mapBewerk.id, { naam: mapBewerk.naam }); setMapBewerk(null); await laad({ stil: true }); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
  };
  const mapWeg = async (m: NotitieMap) => {
    try { await notitiesClient.mapVerwijder(m.id); if (mapId === m.id) setMapId(null); toon(tr(lang, 'Папку прибрано; нотатки залишилися.', 'Map weggehaald; de notities blijven.')); await laad({ stil: true }); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
  };

  // Toetsen op de hele pagina (niet in een veld, niet in een laag).
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (laag.soort !== 'geen') return;
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd+K is van het ZOEKPALET van de chrome (GlobaalZoekPaneel) — die laten we met rust; hier alleen «/» en Ctrl+N.
      if (mod && (e.key === 'n' || e.key === 'N') && !inVeld(document.activeElement)) { e.preventDefault(); setLaag({ soort: 'nieuw' }); return; }
      if (e.key === '/' && !inVeld(document.activeElement)) { e.preventDefault(); zoekVeld.current?.focus(); }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [laag.soort]);

  const kies = (s: Scherm) => { setScherm(s); if (s !== 'bronnen') { setMapId(null); } };
  const filterActief = Boolean(vraag.trim() || etiket || soort || mapId);
  const kop = scherm === 'bronnen' ? tr(lang, 'Інтеграції', 'Integraties') : mapId ? (mappen.find((m) => m.id === mapId)?.naam ?? tr(lang, 'Папка', 'Map')) : tr(lang, WEERGAVE_LABEL[weergave][0], WEERGAVE_LABEL[weergave][1]);

  // Minikalender «Vandaag»: dagen waarop notities zijn gewijzigd krijgen een stip (uit wat er geladen is).
  const dagen = useMemo(() => {
    const s = new Set<string>();
    for (const n of notities) s.add(n.gewijzigdOp.slice(0, 10));
    return s;
  }, [notities]);
  const kalender = () => {
    const eerste = (maand.getDay() + 6) % 7;
    const aantal = new Date(maand.getFullYear(), maand.getMonth() + 1, 0).getDate();
    const vandaag = new Date().toISOString().slice(0, 10);
    const cellen: Array<{ dag: number; iso: string } | null> = Array.from({ length: eerste }, () => null);
    for (let d = 1; d <= aantal; d++) cellen.push({ dag: d, iso: `${maand.getFullYear()}-${String(maand.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    const namen = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(lang), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
    return (
      <div className='vn-kalender' aria-label={tr(lang, 'Мінікалендар', 'Minikalender')}>
        <div className='vn-kalender-kop'>
          <button type='button' className='vn-icoonknop' onClick={() => setMaand(new Date(maand.getFullYear(), maand.getMonth() - 1, 1))} aria-label={tr(lang, 'Попередній місяць', 'Vorige maand')}><ChevronLeft /></button>
          <strong>{new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(maand)}</strong>
          <button type='button' className='vn-icoonknop' onClick={() => setMaand(new Date(maand.getFullYear(), maand.getMonth() + 1, 1))} aria-label={tr(lang, 'Наступний місяць', 'Volgende maand')}><ChevronRight /></button>
        </div>
        <div className='vn-kalender-raster'>
          {namen.map((n) => <span key={n} className='vn-kalender-dagnaam'>{n}</span>)}
          {cellen.map((c, i) => c ? <span key={c.iso} className={`vn-kalender-dag${c.iso === vandaag ? ' is-vandaag' : ''}${dagen.has(c.iso) ? ' heeft-notitie' : ''}`}>{c.dag}</span> : <span key={`l${i}`} />)}
        </div>
      </div>
    );
  };
  const lijsten = notities.filter((n) => n.soort === 'lijst' && !n.verwijderdOp && !n.gearchiveerdOp);
  const lijstenStat = lijsten.reduce((a, n) => { const v = lijstVoortgang(n.inhoud); return { af: a.af + v.af, totaal: a.totaal + v.totaal }; }, { af: 0, totaal: 0 });

  const rail = (
    <nav className='vn-rail' aria-label={tr(lang, 'Розділи нотаток', 'Onderdelen van notities')}>
      <ul className='vn-rail-lijst'>
        {(['alle', 'vandaag', 'vast', 'lijsten', 'archief', 'prullenbak'] as Weergave[]).map((w) => { const I = RAIL_ICOON[w]; return (
          <li key={w}><button type='button' className={scherm === w && !mapId ? 'is-actief' : ''} aria-current={scherm === w && !mapId ? 'page' : undefined} onClick={() => kies(w)} data-vn-weergave={w}><I aria-hidden='true' />{tr(lang, WEERGAVE_LABEL[w][0], WEERGAVE_LABEL[w][1])}<span className='vn-telling'>{telling[w] || ''}</span></button></li>
        ); })}
        <li><button type='button' className={scherm === 'bronnen' ? 'is-actief' : ''} aria-current={scherm === 'bronnen' ? 'page' : undefined} onClick={() => kies('bronnen')} data-vn-weergave='bronnen'><Plug aria-hidden='true' />{tr(lang, 'Інтеграції', 'Integraties')}</button></li>
      </ul>
      <div className='vn-rail-kop'><span>{tr(lang, 'Папки', 'Mappen')}</span><button type='button' className='vn-icoonknop' onClick={() => setNieuweMap('')} aria-label={tr(lang, 'Нова папка', 'Nieuwe map')} title={tr(lang, 'Нова папка', 'Nieuwe map')} data-vn-map-nieuw='1'><FolderPlus /></button></div>
      {nieuweMap !== null ? (
        <form className='vn-rail-vorm' onSubmit={(e) => { e.preventDefault(); void mapNieuw(); }}>
          <input autoFocus value={nieuweMap} maxLength={80} placeholder={tr(lang, 'назва папки', 'mapnaam')} aria-label={tr(lang, 'Назва нової папки', 'Naam van de nieuwe map')} onChange={(e) => setNieuweMap(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNieuweMap(null); }} />
          <button type='submit' className='vn-icoonknop' aria-label={tr(lang, 'Створити папку', 'Map maken')}><Check /></button>
          <button type='button' className='vn-icoonknop' onClick={() => setNieuweMap(null)} aria-label={tr(lang, 'Скасувати', 'Annuleren')}><X /></button>
        </form>
      ) : null}
      <ul className='vn-rail-lijst is-mappen'>
        {mappen.map((m) => (
          <li key={m.id}>
            {mapBewerk?.id === m.id ? (
              <form className='vn-rail-vorm' onSubmit={(e) => { e.preventDefault(); void mapHernoem(); }}>
                <input autoFocus value={mapBewerk.naam} maxLength={80} aria-label={tr(lang, 'Нова назва папки', 'Nieuwe mapnaam')} onChange={(e) => setMapBewerk({ id: m.id, naam: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setMapBewerk(null); }} />
                <button type='submit' className='vn-icoonknop' aria-label={tr(lang, 'Зберегти', 'Opslaan')}><Check /></button>
                <button type='button' className='vn-icoonknop' onClick={() => setMapBewerk(null)} aria-label={tr(lang, 'Скасувати', 'Annuleren')}><X /></button>
              </form>
            ) : (
              <>
                <button type='button' className={mapId === m.id ? 'is-actief' : ''} aria-current={mapId === m.id ? 'page' : undefined} onClick={() => { setScherm('alle'); setMapId(mapId === m.id ? null : m.id); }} data-vn-map={m.id}><Folder aria-hidden='true' /><span className={`vn-stip kleur-${m.kleur}`} aria-hidden='true' />{m.naam}<span className='vn-telling'>{m.aantal || ''}</span></button>
                <span className='vn-rail-mapknoppen'>
                  <button type='button' className='vn-icoonknop' onClick={() => setMapBewerk({ id: m.id, naam: m.naam })} aria-label={tr(lang, `Перейменувати «${m.naam}»`, `«${m.naam}» hernoemen`)}><Pencil /></button>
                  <button type='button' className='vn-icoonknop is-gevaar' onClick={() => void mapWeg(m)} aria-label={tr(lang, `Прибрати папку «${m.naam}» (нотатки залишаться)`, `Map «${m.naam}» weghalen (notities blijven)`)}><X /></button>
                </span>
              </>
            )}
          </li>
        ))}
        {!mappen.length ? <li className='vn-rail-leeg'>{tr(lang, 'Папок ще немає.', 'Nog geen mappen.')}</li> : null}
      </ul>
      {data?.etiketten.length ? (
        <>
          <div className='vn-rail-kop'><span>{tr(lang, 'Теги', 'Etiketten')}</span></div>
          <div className='vn-rail-etiketten' role='group' aria-label={tr(lang, 'Теги', 'Etiketten')}>
            {data.etiketten.slice(0, 20).map((e) => <button key={e.etiket} type='button' className={`vn-etiket${etiket === e.etiket ? ' is-actief' : ''}`} aria-pressed={etiket === e.etiket} onClick={() => setEtiket(etiket === e.etiket ? '' : e.etiket)}>#{e.etiket} <small>{e.aantal}</small></button>)}
          </div>
        </>
      ) : null}
    </nav>
  );

  const zijkolom = scherm !== 'bronnen' && voorkeur.zijkolom ? (
    <aside className='vn-zijkolom' aria-label={tr(lang, 'Сьогодні', 'Vandaag')}>
      {kalender()}
      <div className='vn-zijblok'>
        <strong><ListChecks aria-hidden='true' />{tr(lang, 'Чеклісти', 'Checklists')}</strong>
        {lijstenStat.totaal ? (
          <>
            <div className='vn-voortgang'><span style={{ width: `${Math.round((lijstenStat.af / lijstenStat.totaal) * 100)}%` }} /><small>{lijstenStat.af}/{lijstenStat.totaal}</small></div>
            <small className='vn-hint'>{tr(lang, `${lijstenStat.af} з ${lijstenStat.totaal} пунктів виконано у ${lijsten.length} списках`, `${lijstenStat.af} van ${lijstenStat.totaal} punten gedaan in ${lijsten.length} lijsten`)}</small>
          </>
        ) : <small className='vn-hint'>{tr(lang, 'Серед показаних нотаток чеклістів немає.', 'Geen checklists tussen de getoonde notities.')}</small>}
        <button type='button' className='vn-knop is-klein' onClick={() => kies('lijsten')}>{tr(lang, 'Відкрити чеклісти', 'Checklists openen')}</button>
      </div>
      <div className='vn-zijblok'>
        <strong><CalendarDays aria-hidden='true' />{tr(lang, 'Нотатка → подія', 'Notitie → afspraak')}</strong>
        <small className='vn-hint'>{tr(lang, 'Зв’язок із календарем заплановано (noteId ↔ eventId, з підтвердженням). Ще не працює — див. «Інтеграції».', 'De koppeling met de agenda is gepland (noteId ↔ eventId, met bevestiging). Werkt nog niet — zie «Integraties».')}</small>
      </div>
    </aside>
  ) : null;

  const inhoud = scherm === 'bronnen'
    ? <Suspense fallback={<p className='vn-hint'>{tr(lang, 'Завантаження…', 'Laden…')}</p>}><NotitiesBronnen lang={lang} onImport={() => setLaag({ soort: 'import' })} /></Suspense>
    : (
      <>
        <div className='vn-werkbalk-pagina' role='search'>
          <label className='vn-zoekveld'>
            <Search aria-hidden='true' />
            <input ref={zoekVeld} type='search' value={vraag} placeholder={tr(lang, 'Знайти нотатку, тег або ідею…', 'Zoek een notitie, etiket of idee…')} aria-label={tr(lang, 'Шукати в нотатках', 'In notities zoeken')} onChange={(e) => setVraag(e.target.value)} data-vn-zoek='1' />
            {!smal ? <kbd title={tr(lang, 'Клавіша «/» ставить курсор сюди', 'Toets «/» zet de cursor hier')}>/</kbd> : null}
          </label>
          <div className='vn-chips' role='group' aria-label={tr(lang, 'Тип', 'Soort')}>
            <button type='button' className={`vn-chip${!soort ? ' is-actief' : ''}`} aria-pressed={!soort} onClick={() => setSoort('')}>{tr(lang, 'Усе', 'Alles')}</button>
            {(['tekst', 'lijst', 'code', 'koppeling'] as NotitieSoort[]).map((s) => <button key={s} type='button' className={`vn-chip${soort === s ? ' is-actief' : ''}`} aria-pressed={soort === s} onClick={() => setSoort(soort === s ? '' : s)}>{tr(lang, SOORT_LABEL[s][0], SOORT_LABEL[s][1])}</button>)}
            {etiket ? <button type='button' className='vn-chip is-actief' onClick={() => setEtiket('')} aria-label={tr(lang, `Прибрати фільтр за тегом ${etiket}`, `Filter op etiket ${etiket} weghalen`)}>#{etiket} <X aria-hidden='true' /></button> : null}
            {filterActief ? <button type='button' className='vn-chip is-stil' onClick={() => { setVraag(''); setEtiket(''); setSoort(''); setMapId(null); }}><X aria-hidden='true' />{tr(lang, 'Скинути', 'Wissen')}</button> : null}
          </div>
          <div className='vn-weergaveknoppen'>
            <button type='button' className={`vn-icoonknop${voorkeur.indeling === 'kaarten' ? ' is-actief' : ''}`} aria-pressed={voorkeur.indeling === 'kaarten'} onClick={() => zetVoorkeur({ indeling: 'kaarten' })} aria-label={tr(lang, 'Картки', 'Kaarten')} title={tr(lang, 'Картки', 'Kaarten')}><LayoutGrid /></button>
            <button type='button' className={`vn-icoonknop${voorkeur.indeling === 'lijst' ? ' is-actief' : ''}`} aria-pressed={voorkeur.indeling === 'lijst'} onClick={() => zetVoorkeur({ indeling: 'lijst' })} aria-label={tr(lang, 'Список', 'Lijst')} title={tr(lang, 'Список', 'Lijst')}><List /></button>
            <label className='vn-sorteer' title={tr(lang, 'Сортування', 'Sortering')}><ArrowDownUp aria-hidden='true' /><span className='vn-verborgen'>{tr(lang, 'Сортування', 'Sortering')}</span>
              <select value={voorkeur.volgorde} onChange={(e) => zetVoorkeur({ volgorde: e.target.value as Voorkeuren['volgorde'] })}>
                <option value='gewijzigd'>{tr(lang, 'за зміною', 'op wijziging')}</option><option value='aangemaakt'>{tr(lang, 'за створенням', 'op aanmaak')}</option><option value='titel'>{tr(lang, 'за назвою', 'op titel')}</option>
              </select></label>
            {!smal ? <button type='button' className='vn-icoonknop' onClick={() => zetVoorkeur({ zijkolom: !voorkeur.zijkolom })} aria-pressed={voorkeur.zijkolom} aria-label={tr(lang, 'Колонка «Сьогодні»', 'Kolom «Vandaag»')} title={tr(lang, 'Колонка «Сьогодні»', 'Kolom «Vandaag»')}>{voorkeur.zijkolom ? <PanelRightClose /> : <PanelRightOpen />}</button> : null}
          </div>
        </div>
        {weergave === 'prullenbak' ? <p className='vn-hint' data-vn-prullenbak-uitleg='1'>{tr(lang, 'Нотатки в кошику зникають назавжди через 30 днів. Відновити можна будь-коли до того.', 'Notities in de prullenbak verdwijnen na 30 dagen voorgoed. Herstellen kan tot die tijd altijd.')}</p> : null}
        {data === null ? <p className='vn-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>
          : !notities.length ? (
            <div className='vn-leeg' data-vn-leeg='1'>
              <NotebookPen aria-hidden='true' />
              {filterActief ? <p>{tr(lang, 'За цим фільтром нотаток немає.', 'Met dit filter zijn er geen notities.')}</p>
                : weergave === 'alle' ? <><p>{tr(lang, 'Ідея починається з одного рядка.', 'Een idee begint met één regel.')}</p><button type='button' className='vn-knop is-hoofd' onClick={() => setLaag({ soort: 'nieuw' })}><Plus aria-hidden='true' />{tr(lang, 'Нова нотатка', 'Nieuwe notitie')}</button></>
                  : <p>{tr(lang, 'Тут поки порожньо.', 'Hier is het nog leeg.')}</p>}
            </div>
          ) : (
            <>
              <p className='vn-telling-regel'><span>{kop}</span><small>{data.totaal}</small></p>
              <div className={`vn-raster is-${voorkeur.indeling}${voorkeur.leesbaar ? ' is-leesbaar' : ''}`} data-vn-raster={String(notities.length)}>
                {notities.map((n) => <NotitieKaart key={n.id} lang={lang} notitie={n} indeling={voorkeur.indeling} mappen={mappen} bezig={bezig} weergave={weergave} onOpen={open} onActie={(x, a) => void actie(x, a)} onVink={(x, r) => void vink(x, r)} onEtiket={(e) => setEtiket(etiket === e ? '' : e)} />)}
              </div>
              {data.volgende !== null && notities.length < data.totaal ? <button type='button' className='vn-knop vn-meer' onClick={() => void laad({ offset: notities.length })} data-vn-meer='1'>{tr(lang, `Показати ще (${data.totaal - notities.length})`, `Meer tonen (${data.totaal - notities.length})`)}</button> : null}
            </>
          )}
      </>
    );

  return (
    <section className={`vn${smal ? ' is-smal' : ''}`} data-vn-pagina={scherm} aria-labelledby='vn-kop'>
      <header className='vn-kop'>
        <div>
          <h2 id='vn-kop'><NotebookPen aria-hidden='true' />{kop}</h2>
          <p className='vn-hint'>{tr(lang, 'Ваші ідеї, документи й списки — в одному місці цього простору.', 'Uw ideeën, documenten en lijsten — op één plek in deze ruimte.')}</p>
        </div>
        {!smal ? (
          <div className='vn-kop-acties'>
            <button type='button' className='vn-knop' onClick={() => setLaag({ soort: 'import' })} data-vn-knop='import'><Upload aria-hidden='true' />{tr(lang, 'Імпорт / експорт', 'Import / export')}</button>
            <button type='button' className='vn-knop is-hoofd' onClick={() => setLaag({ soort: 'nieuw' })} data-vn-knop='nieuw'><Plus aria-hidden='true' />{tr(lang, 'Нова нотатка', 'Nieuwe notitie')}<kbd>Ctrl N</kbd></button>
          </div>
        ) : null}
      </header>
      <RuimteStrook feiten={ruimte} lang={lang} />
      {gesloten ? <RuimteGeslotenVlak gesloten={gesloten} lang={lang} /> : null}
      {fout ? <p className='vn-melding is-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='vn-toost' role='status' aria-live='polite'>{melding}</p> : null}
      <div className={`vn-indeling${zijkolom ? ' heeft-zijkolom' : ''}`}>
        {!smal ? rail : null}
        <div className='vn-midden'>{inhoud}</div>
        {zijkolom}
      </div>
      {smal ? (
        <>
          <nav className='vn-onderbalk' aria-label={tr(lang, 'Розділи', 'Onderdelen')}>
            {([['alle', NotebookPen, tr(lang, 'Нотатки', 'Notities')], ['vandaag', CalendarDays, tr(lang, 'Сьогодні', 'Vandaag')]] as Array<[Scherm, typeof NotebookPen, string]>).map(([s, I, l]) => (
              <button key={s} type='button' className={scherm === s ? 'is-actief' : ''} aria-current={scherm === s ? 'page' : undefined} onClick={() => kies(s)} data-vn-onderbalk={s}><I aria-hidden='true' /><span>{l}</span></button>
            ))}
            <button type='button' className='vn-plus' onClick={() => setLaag({ soort: 'nieuw' })} aria-label={tr(lang, 'Нова нотатка', 'Nieuwe notitie')} data-vn-knop='nieuw'><Plus aria-hidden='true' /></button>
            {([['lijsten', ListChecks, tr(lang, 'Списки', 'Lijsten')], ['bronnen', Plug, tr(lang, 'Сервіси', 'Diensten')]] as Array<[Scherm, typeof NotebookPen, string]>).map(([s, I, l]) => (
              <button key={s} type='button' className={scherm === s ? 'is-actief' : ''} aria-current={scherm === s ? 'page' : undefined} onClick={() => kies(s)} data-vn-onderbalk={s}><I aria-hidden='true' /><span>{l}</span></button>
            ))}
            <details className='vn-onderbalk-meer'>
              <summary aria-label={tr(lang, 'Інші розділи', 'Meer onderdelen')}><Folder aria-hidden='true' /><span>{tr(lang, 'Ще', 'Meer')}</span></summary>
              <div className='vn-onderbalk-menu'>
                {(['vast', 'archief', 'prullenbak'] as Weergave[]).map((w) => { const I = RAIL_ICOON[w]; return <button key={w} type='button' onClick={(e) => { kies(w); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}><I aria-hidden='true' />{tr(lang, WEERGAVE_LABEL[w][0], WEERGAVE_LABEL[w][1])} <span className='vn-telling'>{telling[w] || ''}</span></button>; })}
                {mappen.map((m) => <button key={m.id} type='button' onClick={(e) => { setScherm('alle'); setMapId(m.id); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}><Folder aria-hidden='true' />{m.naam} <span className='vn-telling'>{m.aantal || ''}</span></button>)}
                <button type='button' onClick={(e) => { setLaag({ soort: 'import' }); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}><Upload aria-hidden='true' />{tr(lang, 'Імпорт / експорт', 'Import / export')}</button>
              </div>
            </details>
          </nav>
        </>
      ) : null}
      <Suspense fallback={null}>
        {laag.soort === 'nieuw' || laag.soort === 'bewerk'
          ? <NotitieBewerker key={laag.soort === 'bewerk' ? laag.notitie.id : 'nieuw'} lang={lang} smal={smal} notitie={laag.soort === 'bewerk' ? laag.notitie : null} mappen={mappen} startMap={mapId} startSoort={laag.soort === 'nieuw' ? laag.startSoort : undefined} onSluit={() => setLaag({ soort: 'geen' })} onBewaard={bewaard} onMappen={() => void laad({ stil: true })} />
          : laag.soort === 'import'
            ? <NotitiesImport lang={lang} smal={smal} mappen={mappen} onSluit={() => setLaag({ soort: 'geen' })} onKlaar={(n) => { setLaag({ soort: 'geen' }); toon(tr(lang, `Імпортовано ${n} нотаток.`, `${n} notities geïmporteerd.`)); void laad({ stil: true }); }} />
            : null}
      </Suspense>
    </section>
  );
}
