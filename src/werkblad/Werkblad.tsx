// WERKBLAD («Робочий стіл») — de hoofdpagina van de hub (hub.*/overzicht), zone F 22.10.2026.
//
// Wat hier gebeurt (en wat niet):
//   * de indeling komt van de server (POST /api/owner/hub/werkblad/laden, 0112, per lade) — met een lokale cache voor de EERSTE
//     weergave (api.ts). Zonder rij op de server: overzetting van het oude bureaublad en de oude hub-blokken (shared/werkblad-indeling.ts
//     eersteWerkblad) en meteen bewaren, zodat niemand iets kwijtraakt;
//   * de regels (toevoegen, verplaatsen, formaat, rechten, plaatsing zonder overlap) staan zuiver in shared/werkblad-indeling.ts en
//     draaien ook op de server; dit bestand doet alleen de bediening: aanwijzer (slepen/formaat), toetsenbord (pijltjes, Shift+pijltjes,
//     Delete), knoppen op de telefoon (omhoog/omlaag), instelmodus, catalogus, achtergrond;
//   * elke widget laadt haar gegevens LUI (pas in beeld) via useZichtbaar() en de zware widgets komen als aparte chunks (React.lazy);
//   * geen nieuwe afhankelijkheden: slepen op pointer events, zoals het oude bureaublad en het menu (src/menu-slepen.ts).
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, Bot, CalendarDays, Check, CheckSquare, Clock, Cpu, FolderOpen, GripVertical, HardDrive, Image, LayoutGrid, Link2, Mail, Minus, NotebookPen, Package, Plus, RefreshCw, RotateCcw, Settings2, SquareKanban, Stethoscope, Sun, Trash2, X, Zap, type LucideIcon } from 'lucide-react';
import { Venster } from '../platform/vensters';
import HulpVraag from '../hulp/HulpVraag';
import { canonicalNavigationUrl, type HubTabId } from '../canoniek-navigatie';
import { image } from '../platform/client';
import { pasPaginaAchtergrondToe } from './pagina-achtergrond';
import { profielVan, useTech } from '../tech/tech-opslag';
import { haalBureau } from '../bureau/api';
import type { AccountRechten } from '../account-rechten';
import {
  ACHTERGRONDEN, KOLOMMEN, MAX_ITEMS, RIJEN, WERKBLAD_CATEGORIEEN, WERKBLAD_WIDGETS, EIGEN_ACHTERGROND_MAX,
  eersteWerkblad, formaat, gelijkWerkblad, leegIs, neerzetIndex, normaliseerWerkblad, plaatsen, schuif, stapFormaat, standaardWerkblad, toegestaan, verwijder, voegToe, werkbladTekst, werkbladWidget, zetAchtergrond, blokInst,
  type Achtergrond, type OudBlok, type WerkbladCategorie, type WerkbladContext, type WerkbladIndeling, type WerkbladItem, type WerkbladWidgetId,
} from '../../shared/werkblad-indeling';
import { bewaarWerkblad, haalWerkblad, leesCache, schrijfCache, wisCache, wisWerkblad, WerkbladVerouderd, type WerkbladAntwoord } from './api';
import { allesVergeten, useZichtbaar } from './gegevens';
import { tr, type Acties, type Dienst, type Lang, type WidgetProps } from './soorten';
import { Ai, Begroeting, SnelToegang, SnelleActies, Tip } from './widgets/Start';
import { Skelet } from './widgets/Vlak';
import './werkblad.css';
import './werkblad-maquette.css';
import { useIsMaquette } from '../thema/useThema';
import { laadV3, type V3Antwoord } from './api-v3';

// Werkblad v3 (vrij canvas) achter de vlag `werkblad-v3` — een aparte chunk; met de vlag uit wordt hij nooit geladen.
const WerkbladV3 = lazy(() => import('./WerkbladV3'));
const V3_VLAG_SLEUTEL = (uid: string) => `tsv:werkblad-v3-aan:${uid}`;

const Post = lazy(() => import('./widgets/Post'));
const Agenda = lazy(() => import('./widgets/Agenda'));
const Taken = lazy(() => import('./widgets/Taken'));
const Bestanden = lazy(() => import('./widgets/Bestanden'));
const Overig = lazy(() => import('./widgets/Overig').then((m) => ({ default: m.ZoekRecentWidget })));
const Diensten = lazy(() => import('./widgets/Overig').then((m) => ({ default: m.DienstenWidget })));
const Systeem = lazy(() => import('./widgets/Overig').then((m) => ({ default: m.SysteemWidget })));
const Tech = lazy(() => import('./widgets/Overig').then((m) => ({ default: m.TechWidget })));
const OudBlokW = lazy(() => import('./widgets/Overig').then((m) => ({ default: m.OudBlokWidget })));
const Snelkoppeling = lazy(() => import('./widgets/Overig').then((m) => ({ default: m.SnelkoppelingWidget })));

export const WIDGET_ICOON: Record<WerkbladWidgetId, LucideIcon> = {
  begroeting: Sun, 'snel-toegang': LayoutGrid, 'snelle-acties': Zap, tip: Sun, post: Mail, agenda: CalendarDays, taken: CheckSquare, notities: NotebookPen, bord: SquareKanban,
  bestanden: FolderOpen, opslag: HardDrive, 'zoek-recent': Clock, diensten: Cpu, ai: Bot, systeem: Cpu, github: Package, 'tech-server': Cpu, 'tech-updates': Package, 'tech-diagnostiek': Stethoscope,
  'oud-blok': LayoutGrid, snelkoppeling: Link2,
};
/** Widgets zonder kaart (op de achtergrond zelf): begroeting en de tip-strook. */
export const KAAL = new Set<WerkbladWidgetId>(['begroeting', 'tip']);

export function Inhoud(p: WidgetProps) {
  switch (p.item.id) {
    case 'begroeting': return <Begroeting {...p} />;
    case 'snel-toegang': return <SnelToegang {...p} />;
    case 'snelle-acties': return <SnelleActies {...p} />;
    case 'tip': return <Tip {...p} />;
    case 'ai': return <Ai {...p} />;
    case 'post': return <Post {...p} />;
    case 'agenda': return <Agenda {...p} />;
    case 'taken': case 'notities': case 'bord': return <Taken {...p} />;
    case 'bestanden': case 'opslag': return <Bestanden {...p} />;
    case 'zoek-recent': return <Overig {...p} />;
    case 'diensten': return <Diensten {...p} />;
    case 'systeem': return <Systeem {...p} />;
    case 'tech-server': case 'tech-updates': case 'tech-diagnostiek': return <Tech {...p} />;
    case 'oud-blok': return <OudBlokW {...p} />;
    case 'snelkoppeling': return <Snelkoppeling {...p} />;
    default: return null;
  }
}

/** Eén tegel: kop (greep, titel, knoppen in de instelmodus) + inhoud die pas laadt als de tegel in beeld is. */
function Tegel({ item, plek, lang, instellen, index, aantal, kolommen, acties, basis, op, magWeg }: {
  item: WerkbladItem; plek: { x: number; y: number; k: number; r: number }; lang: Lang; instellen: boolean; index: number; aantal: number; kolommen: number; acties: Acties;
  basis: Omit<WidgetProps, 'item' | 'acties' | 'zichtbaar' | 'lang' | 'kolommen' | 'weg'>; magWeg: boolean;
  op: { sleep: (e: ReactPointerEvent) => void; beweeg: (e: ReactPointerEvent) => void; eind: (e: ReactPointerEvent) => void; maat: (e: ReactPointerEvent) => void; maatBeweeg: (e: ReactPointerEvent) => void; maatEind: () => void; toets: (e: ReactKeyboardEvent) => void; weg: () => void; schuif: (r: -1 | 1) => void; formaat: (k?: number, r?: number) => void; sleept: boolean };
}) {
  const def = werkbladWidget(item.id)!;
  const [ref, zichtbaar] = useZichtbaar<HTMLElement>();
  const [teller, setTeller] = useState<{ n: number; label: string } | null>(null);
  const zetTeller = useCallback((n: number | null, label = '') => setTeller((oud) => (n === null ? null : oud && oud.n === n && oud.label === label ? oud : { n, label })), []);
  const Icoon = WIDGET_ICOON[item.id];
  const titel = item.id === 'oud-blok' || item.id === 'snelkoppeling' ? String(item.inst?.titel || werkbladTekst(def.titel, lang)) : werkbladTekst(def.titel, lang);
  const stijl = { gridColumn: `${plek.x + 1} / span ${plek.k}`, gridRow: `${plek.y + 1} / span ${plek.r}` } as CSSProperties;
  const kaal = KAAL.has(item.id);
  return (
    <article ref={ref} className={`wb-tegel${kaal ? ' is-kaal' : ' is-kaart'}${instellen ? ' is-instellen' : ''}${op.sleept ? ' is-sleept' : ''}`} style={stijl}
      data-wb-tegel={item.tid} data-wb-widget={item.id} data-wb-k={item.k} data-wb-r={item.r} role='listitem' aria-label={titel}>
      {(!kaal || instellen) ? (
        <header className={`wb-tegel-kop${instellen ? ' is-sleepbaar' : ''}${kaal ? ' is-zwevend' : ''}`} onPointerDown={instellen ? op.sleep : undefined} onPointerMove={instellen ? op.beweeg : undefined} onPointerUp={instellen ? op.eind : undefined} onPointerCancel={instellen ? op.eind : undefined}>
          {instellen ? <GripVertical aria-hidden='true' className='wb-greep' /> : <Icoon aria-hidden='true' className='wb-tegel-icoon' />}
          <span className='wb-tegel-titel' tabIndex={instellen ? 0 : -1} role={instellen ? 'button' : undefined} onKeyDown={instellen ? op.toets : undefined}
            aria-label={instellen ? tr(lang, `${titel}: віджет ${index + 1} з ${aantal}. Стрілки — пересунути, Shift+стрілки — розмір, Delete — прибрати.`, `${titel}: widget ${index + 1} van ${aantal}. Pijltjes — verplaatsen, Shift+pijltjes — formaat, Delete — weghalen.`) : undefined}>{titel}</span>
          {teller && !instellen ? <span className='wb-teller' data-wb-teller={teller.n} aria-label={teller.label}>{teller.n > 99 ? '99+' : teller.n}</span> : null}
          {instellen ? (
            <span className='wb-tegel-knoppen'>
              {kolommen < 12 ? (
                <>
                  <button type='button' className='wb-icoonknop' data-wb-richting='-1' disabled={index === 0} aria-label={tr(lang, `«${titel}» вище`, `«${titel}» omhoog`)} onClick={() => op.schuif(-1)}><ArrowUp aria-hidden='true' /></button>
                  <button type='button' className='wb-icoonknop' data-wb-richting='1' disabled={index === aantal - 1} aria-label={tr(lang, `«${titel}» нижче`, `«${titel}» omlaag`)} onClick={() => op.schuif(1)}><ArrowDown aria-hidden='true' /></button>
                </>
              ) : (
                <>
                  <button type='button' className='wb-icoonknop' data-wb-maat='smaller' disabled={item.k <= def.minK} aria-label={tr(lang, `«${titel}» вужче`, `«${titel}» smaller`)} onClick={() => op.formaat(stapFormaat(item.k, KOLOMMEN, def.minK, -1))}><Minus aria-hidden='true' /></button>
                  <button type='button' className='wb-icoonknop' data-wb-maat='breder' disabled={item.k >= 12} aria-label={tr(lang, `«${titel}» ширше`, `«${titel}» breder`)} onClick={() => op.formaat(stapFormaat(item.k, KOLOMMEN, def.minK, 1))}><Plus aria-hidden='true' /></button>
                </>
              )}
              <button type='button' className='wb-icoonknop is-gevaar' aria-label={tr(lang, `Прибрати «${titel}» зі столу`, `«${titel}» van het werkblad halen`)} title={tr(lang, 'Прибрати', 'Weghalen')} onClick={op.weg}><Trash2 aria-hidden='true' /></button>
            </span>
          ) : null}
        </header>
      ) : null}
      <div className='wb-tegel-inhoud'>
        <Suspense fallback={<Skelet rijen={3} />}>
          <Inhoud {...basis} lang={lang} item={item} acties={acties} zichtbaar={zichtbaar} kolommen={kolommen} weg={magWeg ? op.weg : undefined} zetTeller={zetTeller} />
        </Suspense>
      </div>
      {instellen && kolommen > 1 && !KAAL.has(item.id) ? (
        <span className='wb-maat' aria-hidden='true' title={tr(lang, 'Змінити розмір', 'Formaat wijzigen')} onPointerDown={op.maat} onPointerMove={op.maatBeweeg} onPointerUp={op.maatEind} onPointerCancel={op.maatEind} />
      ) : null}
    </article>
  );
}

const kolommenVan = () => (typeof matchMedia === 'undefined' ? 12 : matchMedia('(max-width:700px)').matches ? 1 : matchMedia('(max-width:1100px)').matches ? 6 : 12);

export type WerkbladProps = { lang: Lang; ownerUserId: string; naam: string; magBewerken: boolean; rechten: AccountRechten; oudeBlokken: readonly OudBlok[]; onHubTab: (tab: HubTabId) => void };

function WerkbladV2({ lang, ownerUserId, naam, magBewerken, rechten, oudeBlokken, onHubTab }: WerkbladProps) {
  const isMaquette = useIsMaquette();
  const tech = useTech();
  const techProfiel = profielVan(tech) === 'technisch';
  const profiel = techProfiel ? 'technisch' : 'gebruiker';
  const [cache] = useState(() => leesCache(ownerUserId, profiel));
  const [ruimte, setRuimte] = useState<WerkbladContext['ruimte']>(cache?.ruimte || (techProfiel ? 'technisch' : 'prive'));
  const ctx = useMemo<WerkbladContext>(() => ({ ruimte, eigenaar: rechten.eigenaar, apiPlatform: rechten.apiPlatform }), [ruimte, rechten.eigenaar, rechten.apiPlatform]);
  const [indeling, setIndeling] = useState<WerkbladIndeling>(() => cache?.indeling || standaardWerkblad({ ruimte: techProfiel ? 'technisch' : 'prive' }));
  const [achtergrondEigen, setAchtergrondEigen] = useState(cache?.achtergrondEigen || '');
  const [versie, setVersie] = useState(cache?.versie || 0);
  const [geladen, setGeladen] = useState(Boolean(cache));
  const [herkomst, setHerkomst] = useState<'bureau' | 'blokken' | 'standaard' | ''>('');
  const [verborgen, setVerborgen] = useState<OudBlok[]>([]);
  const [fout, setFout] = useState('');
  const [instellen, setInstellen] = useState(false);
  const [catalogus, setCatalogus] = useState(false);
  const [achtergrondVenster, setAchtergrondVenster] = useState(false);
  const [cat, setCat] = useState<WerkbladCategorie | 'alles'>('alles');
  const [kolommen, setKolommen] = useState(kolommenVan);
  const [sleept, setSleept] = useState('');
  const [ronde, setRonde] = useState(0);
  const raster = useRef<HTMLDivElement | null>(null);
  const keten = useRef<Promise<unknown>>(Promise.resolve());
  const laatstBewaard = useRef<WerkbladIndeling | null>(cache?.indeling || null);
  const versieRef = useRef(versie);
  versieRef.current = versie;
  const indelingRef = useRef(indeling);
  indelingRef.current = indeling;

  useEffect(() => {
    const mql = ['(max-width:700px)', '(max-width:1100px)'].map((q) => matchMedia(q));
    const f = () => setKolommen(kolommenVan());
    mql.forEach((m) => m.addEventListener('change', f));
    return () => mql.forEach((m) => m.removeEventListener('change', f));
  }, []);

  /** Antwoord van de server overnemen (laden of bewaren): indeling, versie, cache. */
  const neemOver = useCallback((a: WerkbladAntwoord) => {
    if (!a.indeling) return;
    setRuimte(a.ruimte); setIndeling(a.indeling); setAchtergrondEigen(a.achtergrondEigen); setVersie(a.versie); laatstBewaard.current = a.indeling;
    schrijfCache(ownerUserId, profiel, { ruimte: a.ruimte, indeling: a.indeling, achtergrondEigen: a.achtergrondEigen, versie: a.versie, herkomst: a.herkomst, op: Date.now() });
  }, [ownerUserId, profiel]);

  /** Bewaren in één keten; een 409 (ander tabblad was sneller) neemt de serverversie over in plaats van te overschrijven. */
  const bewaar = useCallback((volgende: WerkbladIndeling, extra: { achtergrondEigen?: string; herkomst?: string } = {}) => {
    keten.current = keten.current.catch(() => undefined)
      .then(() => bewaarWerkblad(volgende, versieRef.current, extra))
      .then((a) => { neemOver(a); setFout(''); })
      .catch((e: unknown) => {
        if (e instanceof WerkbladVerouderd) { neemOver(e.actueel); setFout('VEROUDERD'); return; }
        setFout(String((e as Error)?.message || 'FOUT'));
      });
  }, [neemOver]);

  // Laden van de server; zonder rij: overzetting van het oude bureaublad en de oude blokken, en meteen bewaren.
  useEffect(() => {
    let leeft = true;
    (async () => {
      try {
        const a = await haalWerkblad();
        if (!leeft) return;
        const c: WerkbladContext = { ruimte: a.ruimte, eigenaar: rechten.eigenaar, apiPlatform: rechten.apiPlatform };
        if (a.bestaat && a.indeling) { neemOver(a); setFout(''); }
        else {
          let bureau: unknown = null;
          try { bureau = (await haalBureau()).indeling; } catch { bureau = null; }
          const eerste = eersteWerkblad({ bureau, blokken: oudeBlokken }, c);
          setRuimte(a.ruimte); setIndeling(eerste.indeling); setHerkomst(eerste.herkomst); setVerborgen(eerste.verborgen); setVersie(0); laatstBewaard.current = eerste.indeling;
          bewaar(eerste.indeling, { herkomst: eerste.herkomst });
        }
      } catch (e: unknown) { if (leeft) setFout(String((e as Error)?.message || 'FOUT')); }
      finally { if (leeft) setGeladen(true); }
    })();
    return () => { leeft = false; };
  }, [ownerUserId, profiel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verborgen oude blokken blijven in de catalogus beschikbaar (ook als de rij al bestond).
  useEffect(() => { setVerborgen(oudeBlokken.filter((b) => !b.visible && blokInst(b))); }, [oudeBlokken]);

  const zet = useCallback((volgende: WerkbladIndeling, extra: { achtergrondEigen?: string } = {}) => {
    const schoon = normaliseerWerkblad(volgende, ctx);
    setIndeling(schoon);
    if (laatstBewaard.current && gelijkWerkblad(schoon, laatstBewaard.current) && !extra.achtergrondEigen) return;
    laatstBewaard.current = schoon;
    if (!magBewerken) return;
    bewaar(schoon, extra);
  }, [ctx, magBewerken, bewaar]);

  const items = indeling.items;
  // Tijdens het slepen: een VOORBEELD van de nieuwe volgorde. Alleen de plaatsen op het raster volgen het voorbeeld; de volgorde in
  // de DOM blijft die van de bewaarde indeling tot het loslaten — anders verplaatst React de tegel met de pointer-capture en gaat
  // het loslaten verloren (stand 23.10: «geen /bewaren» na slepen op 768/1280).
  const [voorbeeld, setVoorbeeld] = useState<WerkbladIndeling | null>(null);
  const voorbeeldRef = useRef<WerkbladIndeling | null>(null);
  voorbeeldRef.current = voorbeeld;
  const zicht = voorbeeld ?? indeling;
  const plekken = useMemo(() => plaatsen(zicht.items, kolommen), [zicht.items, kolommen]);
  // Aankondiging voor schermlezers na verplaatsen/formaat met toetsenbord of knoppen.
  const [melding, setMelding] = useState('');
  const plekVan = useMemo(() => new Map(plekken.map((p) => [p.tid, p])), [plekken]);

  // ---------------------------------------------------------------- acties van widgets (nooit location.* in een widget)
  const acties = useMemo<Acties>(() => ({
    hubTab: (tab) => onHubTab(tab),
    dienst: (dienst: Dienst, tab = '') => { location.assign(canonicalNavigationUrl(dienst, tab, lang)); },
    zoek: (vraag) => { const u = new URL(canonicalNavigationUrl('hub', 'zoek', lang)); if (vraag) u.searchParams.set('q', vraag); location.assign(u.toString()); },
    instellen: () => setInstellen(true),
    catalogus: () => { setInstellen(true); setCatalogus(true); },
  }), [lang, onHubTab]);

  // ---------------------------------------------------------------- slepen (aanwijzer: muis, pen, aanraken — geen HTML5-drag)
  const sleepRef = useRef<{ tid: string; x: number; y: number; actief: boolean; laatste: number } | null>(null);
  const eindSleep = (bewaren = true) => {
    const d = sleepRef.current;
    if (!d) return;
    sleepRef.current = null;
    setSleept('');
    const v = voorbeeldRef.current;
    voorbeeldRef.current = null;
    setVoorbeeld(null);
    if (bewaren && d.actief && v) {
      zet(v);
      const plek = v.items.findIndex((t) => t.tid === d.tid);
      const def = werkbladWidget(v.items[plek]?.id);
      if (def) setMelding(tr(lang, `«${werkbladTekst(def.titel, lang)}»: позиція ${plek + 1} з ${v.items.length}.`, `«${werkbladTekst(def.titel, lang)}»: plaats ${plek + 1} van ${v.items.length}.`));
    }
  };
  // Vangnet: ook als de capture toch verloren gaat (venster verliest focus, aanraking afgebroken) eindigt het slepen.
  useEffect(() => {
    const op = () => eindSleep(true), af = () => eindSleep(false);
    addEventListener('pointerup', op); addEventListener('pointercancel', af); addEventListener('blur', af);
    return () => { removeEventListener('pointerup', op); removeEventListener('pointercancel', af); removeEventListener('blur', af); };
  });
  const startSleep = (tid: string) => (e: ReactPointerEvent) => {
    if (!magBewerken || e.button !== 0 || (e.target as HTMLElement).closest('button,a,input,select')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sleepRef.current = { tid, x: e.clientX, y: e.clientY, actief: false, laatste: -1 };
  };
  const beweegSleep = (e: ReactPointerEvent) => {
    const d = sleepRef.current;
    if (!d) return;
    if (!d.actief && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
    if (!d.actief) { d.actief = true; setSleept(d.tid); }
    e.preventDefault();
    const vak = raster.current;
    if (!vak) return;
    const basisInd = voorbeeldRef.current ?? indelingRef.current;
    const sleepItem = basisInd.items.find((t) => t.tid === d.tid);
    if (!sleepItem) return;
    // De andere tegels in de volgorde van het VOORBEELD, met hun rechthoek op het scherm (die volgt het voorbeeld).
    const andere = basisInd.items.filter((t) => t.tid !== d.tid).map((t) => ({ t, el: vak.querySelector<HTMLElement>(`[data-wb-tegel="${t.tid}"]`) })).filter((x): x is { t: WerkbladItem; el: HTMLElement } => Boolean(x.el));
    const i = neerzetIndex(andere.map((x) => x.el.getBoundingClientRect()), e.clientX, e.clientY);
    if (i === d.laatste) return;
    d.laatste = i;
    const nieuw: WerkbladIndeling = { ...basisInd, items: [...andere.slice(0, i).map((x) => x.t), sleepItem, ...andere.slice(i).map((x) => x.t)] };
    voorbeeldRef.current = nieuw;
    setVoorbeeld(nieuw);
  };

  // ---------------------------------------------------------------- formaat met de greep rechtsonder
  const maatRef = useRef<{ tid: string; x: number; y: number; k: number; r: number; kolomBreedte: number; rijHoogte: number } | null>(null);
  const startMaat = (tid: string) => (e: ReactPointerEvent) => {
    const t = items.find((x) => x.tid === tid), vak = raster.current;
    if (!magBewerken || !t || !vak || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const stijl = getComputedStyle(vak);
    maatRef.current = { tid, x: e.clientX, y: e.clientY, k: t.k, r: t.r, kolomBreedte: vak.clientWidth / Math.max(1, kolommen), rijHoogte: parseFloat(stijl.getPropertyValue('--wb-rij')) || 96 };
  };
  const beweegMaat = (e: ReactPointerEvent) => {
    const d = maatRef.current;
    if (!d) return;
    e.preventDefault();
    const schaal = kolommen >= 12 ? 1 : 12 / kolommen;
    const k = d.k + Math.round(((e.clientX - d.x) / Math.max(1, d.kolomBreedte)) * schaal);
    const r = d.r + Math.round((e.clientY - d.y) / Math.max(1, d.rijHoogte));
    setIndeling((huidig) => formaat(huidig, d.tid, k, r));
  };
  const eindMaat = () => { const d = maatRef.current; maatRef.current = null; if (d) zet(indelingRef.current); };

  /** Na verplaatsen met toetsenbord of knop: de focus blijft op hetzelfde bedieningselement van dezelfde tegel, en het wordt aangekondigd. */
  const naVerplaatsen = (tid: string, volgende: WerkbladIndeling, selector: string, wat: 'plaats' | 'formaat') => {
    const plek = volgende.items.findIndex((t) => t.tid === tid), t = volgende.items[plek], def = t && werkbladWidget(t.id);
    if (def) setMelding(wat === 'plaats'
      ? tr(lang, `«${werkbladTekst(def.titel, lang)}»: позиція ${plek + 1} з ${volgende.items.length}.`, `«${werkbladTekst(def.titel, lang)}»: plaats ${plek + 1} van ${volgende.items.length}.`)
      : tr(lang, `«${werkbladTekst(def.titel, lang)}»: ширина ${t.k} з 12, висота ${t.r}.`, `«${werkbladTekst(def.titel, lang)}»: breedte ${t.k} van 12, hoogte ${t.r}.`));
    requestAnimationFrame(() => raster.current?.querySelector<HTMLElement>(`[data-wb-tegel="${tid}"] ${selector}`)?.focus());
  };
  const toets = (tid: string) => (e: ReactKeyboardEvent) => {
    if (!magBewerken) return;
    const t = items.find((x) => x.tid === tid), def = t && werkbladWidget(t.id);
    if (!t || !def) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); zet(verwijder(indeling, tid)); setMelding(tr(lang, `«${werkbladTekst(def.titel, lang)}» прибрано зі столу.`, `«${werkbladTekst(def.titel, lang)}» van het werkblad gehaald.`)); return; }
    const richting = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!richting) return;
    e.preventDefault();
    const volgende = !e.shiftKey ? schuif(indeling, tid, richting)
      : e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? formaat(indeling, tid, stapFormaat(t.k, KOLOMMEN, def.minK, richting))
        : formaat(indeling, tid, undefined, stapFormaat(t.r, RIJEN, def.minR, richting));
    if (volgende === indeling) return;
    zet(volgende);
    naVerplaatsen(tid, volgende, '.wb-tegel-titel', e.shiftKey ? 'formaat' : 'plaats');
  };

  // ---------------------------------------------------------------- achtergrond
  const kiesAchtergrond = (a: Achtergrond) => { if (a === 'eigen' && !achtergrondEigen) return; zet(zetAchtergrond(indeling, a)); };
  const [achtergrondFout, setAchtergrondFout] = useState('');
  const laadEigen = async (file: File | null) => {
    if (!file) return;
    setAchtergrondFout('');
    try {
      let klaar = await image.resizeIfNeeded(file, { maxDimension: 1600, maxPixels: 1_600_000, quality: 0.78, mimeType: 'image/jpeg' });
      if (klaar.bytes * 1.37 > EIGEN_ACHTERGROND_MAX) klaar = await image.resizeIfNeeded(file, { maxDimension: 1200, maxPixels: 900_000, quality: 0.62, mimeType: 'image/jpeg' });
      const url = `data:${klaar.mimeType};base64,${klaar.data}`;
      if (url.length > EIGEN_ACHTERGROND_MAX) { setAchtergrondFout(tr(lang, 'Зображення завелике навіть після стиснення (межа 400 КБ).', 'De afbeelding is zelfs na verkleinen te groot (grens 400 kB).')); return; }
      setAchtergrondEigen(url);
      zet(zetAchtergrond(indeling, 'eigen'), { achtergrondEigen: url });
    } catch (e: unknown) { setAchtergrondFout(String((e as Error)?.message || 'FOUT')); }
  };

  const terugzetten = async () => {
    try { await wisWerkblad(); } catch { /* zonder server: alleen lokaal */ }
    wisCache(ownerUserId, profiel);
    const s = standaardWerkblad(ctx);
    laatstBewaard.current = s; setVersie(0); setAchtergrondEigen(''); setIndeling(s); setHerkomst('standaard');
    bewaar(s, { herkomst: 'standaard' });
  };
  const vernieuwen = () => { allesVergeten(); setRonde((n) => n + 1); };

  const vol = items.length >= MAX_ITEMS;
  const catalogusLijst = useMemo(() => WERKBLAD_WIDGETS.filter((w) => !w.verborgenInCatalogus && w.ruimtes.includes(ctx.ruimte) && (cat === 'alles' || w.cat === cat)), [cat, ctx.ruimte]);
  const basis = { ctx, naam, ownerUserId, techProfiel, apiPlatform: rechten.apiPlatform, eigenaar: rechten.eigenaar };
  const stijl = indeling.achtergrond === 'eigen' && achtergrondEigen ? ({ '--wb-eigen': `url("${achtergrondEigen}")` } as CSSProperties) : undefined;
  // Фон на всю оболонку, не лише всередині блоку віджетів (блок 7). Плитки вибору лишаються на секції.
  useEffect(() => {
    pasPaginaAchtergrondToe({ achtergrond: indeling.achtergrond, achtergrondEigen });
  }, [indeling.achtergrond, achtergrondEigen]);

  return (
    <section className={`werkblad wb-achtergrond-${indeling.achtergrond}${instellen ? ' is-instellen' : ''}${isMaquette ? ' is-maquette' : ''}`} style={stijl} data-mq-dienst={isMaquette ? 'hub' : undefined} data-werkblad={geladen ? 'klaar' : 'laden'} data-wb-ruimte={ruimte} data-wb-kolommen={kolommen} data-wb-aantal={items.length} aria-labelledby='werkblad-kop'>
      <div className='wb-balk'>
        {/* De paginakop (h1 «Робочий стіл» in App.tsx) staat er al; deze kop is er voor schermlezers en de regio-naam. */}
        <h2 id='werkblad-kop' className='sr-only'>{tr(lang, 'Віджети робочого столу', 'Widgets van het werkblad')}</h2>
        {ruimte === 'technisch' ? <span className='pil pil-info wb-ruimte-pil'><LayoutGrid aria-hidden='true' />{tr(lang, 'Технічний простір: окрема розкладка', 'Technische ruimte: eigen indeling')}</span> : null}
        <div className='wb-balk-acties'>
          <button type='button' className='knop-stil is-klein' onClick={vernieuwen} aria-label={tr(lang, 'Оновити дані віджетів', 'Widgetgegevens vernieuwen')} title={tr(lang, 'Оновити', 'Vernieuwen')}><RefreshCw aria-hidden='true' /></button>
          {magBewerken ? (
            <>
              {instellen ? (
                <>
                  <button type='button' className='knop-secundair is-klein' data-wb-catalogus='open' onClick={() => setCatalogus(true)} disabled={vol}><Plus aria-hidden='true' />{tr(lang, 'Додати віджет', 'Widget toevoegen')}</button>
                  <button type='button' className='knop-secundair is-klein' data-wb-achtergrond='open' onClick={() => setAchtergrondVenster(true)}><Image aria-hidden='true' />{tr(lang, 'Фон', 'Achtergrond')}</button>
                  <button type='button' className='knop-stil is-klein' data-wb-terugzetten='1' data-hulp='werkblad.terugzetten' onClick={() => void terugzetten()}><RotateCcw aria-hidden='true' />{tr(lang, 'Скинути', 'Terugzetten')}</button>
                  <HulpVraag k='werkblad.terugzetten' lang={lang} />
                  <button type='button' className='knop-primair is-klein' data-wb-instellen='klaar' onClick={() => setInstellen(false)}><Check aria-hidden='true' />{tr(lang, 'Готово', 'Klaar')}</button>
                </>
              ) : <button type='button' className='knop-secundair is-klein' data-wb-instellen='aan' data-hulp='werkblad.instellen' onClick={() => setInstellen(true)}><Settings2 aria-hidden='true' />{tr(lang, 'Налаштувати', 'Instellen')}</button>}
              <HulpVraag k='werkblad.instellen' lang={lang} />
            </>
          ) : null}
        </div>
      </div>
      {herkomst && herkomst !== 'standaard' ? (
        <p className='wb-melding melding melding-info' data-wb-herkomst={herkomst}>
          {herkomst === 'bureau' ? tr(lang, 'Ваш попередній стіл перенесено на новий робочий стіл — усі блоки на місці.', 'Uw vorige bureaublad is overgezet naar het nieuwe werkblad — alle blokken staan er.') : tr(lang, 'Блоки з попереднього огляду перенесено на новий робочий стіл; приховані блоки — у каталозі.', 'De blokken van het vorige overzicht zijn overgezet naar het nieuwe werkblad; verborgen blokken staan in de catalogus.')}
          <button type='button' className='wb-tip-sluit' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={() => setHerkomst('')}><X aria-hidden='true' /></button>
        </p>
      ) : null}
      {fout ? <p className='wb-fout-balk melding melding-warn' role='alert'>{fout === 'VEROUDERD'
        ? tr(lang, 'Розкладку змінили в іншій вкладці або на іншому пристрої — показано новішу версію.', 'De indeling is in een ander tabblad of op een ander apparaat gewijzigd — de nieuwere versie wordt getoond.')
        : /^OWNER_HUB_WERKBLAD_|401|403/.test(fout) ? tr(lang, 'Розкладку столу можна зберегти лише після входу у ваш акаунт.', 'De indeling kan alleen worden bewaard als u in uw account bent aangemeld.')
          : tr(lang, `Розкладку не збережено (${fout}).`, `De indeling is niet bewaard (${fout}).`)}</p> : null}
      <p className='sr-only' aria-live='polite' data-wb-melding=''>{melding}</p>
      {instellen ? <p className='wb-uitleg'>{tr(lang, 'Перетягніть заголовок, щоб переставити; куток — щоб змінити розмір. З клавіатури: стрілки, Shift+стрілки, Delete.', 'Sleep de kop om te verplaatsen; de hoek om het formaat te wijzigen. Toetsenbord: pijltjes, Shift+pijltjes, Delete.')}</p> : null}

      {leegIs(indeling) ? (
        <div className='wb-leeg-stol' data-wb-leeg='1'>
          <LayoutGrid aria-hidden='true' />
          <h3>{tr(lang, 'Ваш стіл порожній', 'Uw werkblad is leeg')}</h3>
          <p>{tr(lang, 'Додайте віджети з каталогу або поверніть стандартну розкладку.', 'Voeg widgets toe uit de catalogus of zet de standaardindeling terug.')}</p>
          {magBewerken ? <div className='knoppen'><button type='button' className='knop-primair' onClick={() => { setInstellen(true); setCatalogus(true); }}><Plus aria-hidden='true' />{tr(lang, 'Додати віджет', 'Widget toevoegen')}</button><button type='button' className='knop-secundair' onClick={() => void terugzetten()}><RotateCcw aria-hidden='true' />{tr(lang, 'Стандартна розкладка', 'Standaardindeling')}</button></div> : null}
        </div>
      ) : (
        <div className='wb-raster' ref={raster} role='list' aria-label={tr(lang, 'Віджети робочого столу', 'Widgets van het werkblad')} key={ronde}>
          {items.map((item, i) => {
            const plek = plekVan.get(item.tid) || { x: 0, y: i, k: 1, r: 1 };
            return (
              <Tegel key={item.tid} item={item} plek={plek} lang={lang} instellen={instellen && magBewerken} index={i} aantal={items.length} kolommen={kolommen} acties={acties} basis={basis}
                magWeg={magBewerken}
                op={{ sleep: startSleep(item.tid), beweeg: beweegSleep, eind: (e) => eindSleep(e.type !== 'pointercancel'), maat: startMaat(item.tid), maatBeweeg: beweegMaat, maatEind: eindMaat, toets: toets(item.tid), weg: () => zet(verwijder(indeling, item.tid)), schuif: (r) => { const v = schuif(indeling, item.tid, r); if (v === indeling) return; zet(v); naVerplaatsen(item.tid, v, `.wb-tegel-knoppen button[data-wb-richting="${r}"]`, 'plaats'); }, formaat: (k, r) => { const v = formaat(indeling, item.tid, k, r); if (v === indeling) return; zet(v); naVerplaatsen(item.tid, v, `.wb-tegel-knoppen button[data-wb-maat="${k !== undefined && k > item.k ? 'breder' : 'smaller'}"]`, 'formaat'); }, sleept: sleept === item.tid }} />
            );
          })}
        </div>
      )}

      {catalogus ? (
        <Venster id='werkblad-catalogus' titel={tr(lang, 'Каталог віджетів', 'Widgetcatalogus')} breedte={760} onSluit={() => setCatalogus(false)} lang={lang} className='wb-catalogus-venster'>
          <div className='wb-catalogus'>
            <p className='wb-catalogus-uitleg'>{tr(lang, 'Віджети з позначкою «скоро» покласти на стіл не можна: сервер ще не має для них джерела даних.', 'Widgets met «binnenkort» kunt u niet neerleggen: de server heeft er nog geen gegevensbron voor.')}</p>
            <div className='wb-chips' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
              <button type='button' className={cat === 'alles' ? 'is-actief' : ''} aria-pressed={cat === 'alles'} onClick={() => setCat('alles')}>{tr(lang, 'Усі', 'Alle')}</button>
              {WERKBLAD_CATEGORIEEN.filter((c) => (c.id === 'technisch' ? ctx.ruimte === 'technisch' : c.id === 'oud' ? verborgen.length > 0 : true)).map((c) => <button key={c.id} type='button' className={cat === c.id ? 'is-actief' : ''} aria-pressed={cat === c.id} data-wb-cat={c.id} onClick={() => setCat(c.id)}>{werkbladTekst(c.titel, lang)}</button>)}
            </div>
            <ul className='wb-catalogus-lijst'>
              {catalogusLijst.map((w) => {
                const Icoon = WIDGET_ICOON[w.id];
                const klaar = toegestaan(w.id, ctx);
                const aantal = items.filter((t) => t.id === w.id).length;
                const kan = klaar && !vol && !(w.enkel && aantal > 0);
                return (
                  <li key={w.id} data-wb-kaart={w.id} data-wb-stand={w.stand}>
                    <Icoon aria-hidden='true' />
                    <div>
                      <strong>{werkbladTekst(w.titel, lang)}</strong>
                      <small>{werkbladTekst(w.uitleg, lang)}</small>
                      {w.stand === 'klaar' ? (w.bron ? <code className='wb-bron'>{w.bron}</code> : null) : <em className='wb-ontbreekt'>{tr(lang, 'Чого бракує: ', 'Wat ontbreekt: ')}{werkbladTekst(w.ontbreekt!, lang)}</em>}
                      {aantal ? <span className='pil pil-stil'>{tr(lang, `Уже на столі: ${aantal}`, `Al op het werkblad: ${aantal}`)}</span> : null}
                    </div>
                    <span className={`pil ${w.stand === 'klaar' ? 'pil-ok' : 'pil-warn'}`}>{w.stand === 'klaar' ? tr(lang, 'працює', 'werkt') : tr(lang, 'скоро', 'binnenkort')}</span>
                    <button type='button' className='knop-primair is-klein' disabled={!kan} onClick={() => zet(voegToe(indeling, w.id, ctx))} aria-label={tr(lang, `Додати «${werkbladTekst(w.titel, lang)}»`, `«${werkbladTekst(w.titel, lang)}» toevoegen`)}><Plus aria-hidden='true' />{tr(lang, 'Додати', 'Toevoegen')}</button>
                  </li>
                );
              })}
              {(cat === 'alles' || cat === 'oud') ? verborgen.map((b) => {
                const bi = blokInst(b)!;
                const al = items.some((t) => String(t.inst?.blokId) === b.id);
                return (
                  <li key={`oud-${b.id}`} data-wb-kaart='oud' data-wb-oud-blok={b.id}>
                    <LayoutGrid aria-hidden='true' />
                    <div><strong>{b.title}</strong><small>{tr(lang, 'Прихований блок із попереднього огляду.', 'Verborgen blok uit het vorige overzicht.')}{b.description ? ` ${b.description}` : ''}</small></div>
                    <span className='pil pil-stil'>{tr(lang, 'старий блок', 'oud blok')}</span>
                    <button type='button' className='knop-primair is-klein' disabled={al || vol} onClick={() => zet(voegToe(indeling, bi.id, ctx, bi.inst))}><Plus aria-hidden='true' />{tr(lang, 'Додати', 'Toevoegen')}</button>
                  </li>
                );
              }) : null}
            </ul>
            <div className='wb-catalogus-voet'><button type='button' className='knop-stil' onClick={() => setCatalogus(false)}><X aria-hidden='true' />{tr(lang, 'Готово', 'Klaar')}</button></div>
          </div>
        </Venster>
      ) : null}

      {achtergrondVenster ? (
        <Venster id='werkblad-achtergrond' titel={tr(lang, 'Фон робочого столу', 'Achtergrond van het werkblad')} breedte={560} onSluit={() => setAchtergrondVenster(false)} lang={lang} className='wb-catalogus-venster'>
          <div className='wb-achtergrond-keuze'>
            <p>{tr(lang, 'Нейтральні градієнти лежать у стилях сайту; власне зображення зменшується у браузері й зберігається лише для вас.', 'De neutrale verlopen staan in de stijlen van de site; een eigen afbeelding wordt in de browser verkleind en alleen voor u bewaard.')}<HulpVraag k='werkblad.achtergrond' lang={lang} /></p>
            <div className='wb-achtergrond-tegels' role='radiogroup' aria-label={tr(lang, 'Фон', 'Achtergrond')}>
              {ACHTERGRONDEN.filter((a) => a !== 'eigen' || achtergrondEigen).map((a) => (
                <button key={a} type='button' role='radio' data-hulp='werkblad.achtergrond' aria-checked={indeling.achtergrond === a} className={`wb-achtergrond-tegel wb-achtergrond-${a}${indeling.achtergrond === a ? ' is-actief' : ''}`} style={a === 'eigen' ? stijl : undefined} onClick={() => kiesAchtergrond(a)} data-wb-achtergrond-keuze={a}>
                  <span>{a === 'geen' ? tr(lang, 'Без фону', 'Geen') : a === 'nacht' ? tr(lang, 'Ніч', 'Nacht') : a === 'zee' ? tr(lang, 'Море', 'Zee') : a === 'woud' ? tr(lang, 'Ліс', 'Woud') : a === 'avond' ? tr(lang, 'Вечір', 'Avond') : tr(lang, 'Власне', 'Eigen')}</span>
                </button>
              ))}
            </div>
            <label className='wb-bestand-keuze'>
              <Image aria-hidden='true' />{tr(lang, 'Завантажити власне зображення (JPEG/PNG/WebP)', 'Eigen afbeelding uploaden (JPEG/PNG/WebP)')}
              <input type='file' accept='image/jpeg,image/png,image/webp' onChange={(e) => void laadEigen(e.target.files?.[0] || null)} />
            </label>
            {achtergrondFout ? <p className='melding melding-fout' role='alert'>{achtergrondFout}</p> : null}
            <div className='wb-catalogus-voet'><button type='button' className='knop-stil' onClick={() => setAchtergrondVenster(false)}><X aria-hidden='true' />{tr(lang, 'Готово', 'Klaar')}</button></div>
          </div>
        </Venster>
      ) : null}
    </section>
  );
}


/**
 * Poort v2 ↔ v3. Vlag uit (standaard) → exact het v2-werkblad hierboven (zelfde code, zelfde verzoeken; één extra
 * `v3/laden` dat bij vlag uit alleen {aan:false} antwoordt en NIETS overzet). Vlag aan → het vrije canvas (WerkbladV3).
 * De laatste uitkomst wordt per gebruiker onthouden zodat de eerste weergave niet tussen v2 en v3 knippert.
 */
export default function Werkblad(p: WerkbladProps) {
  const [v3, setV3] = useState<V3Antwoord | null>(null);
  const [wachtV3, setWachtV3] = useState(() => { try { return localStorage.getItem(V3_VLAG_SLEUTEL(p.ownerUserId)) === '1'; } catch { return false; } });
  useEffect(() => {
    let leeft = true;
    laadV3().then((a) => {
      if (!leeft) return;
      try { if (a.aan) localStorage.setItem(V3_VLAG_SLEUTEL(p.ownerUserId), '1'); else localStorage.removeItem(V3_VLAG_SLEUTEL(p.ownerUserId)); } catch { /* privémodus */ }
      setV3(a.aan ? a : null); setWachtV3(false);
    }).catch(() => { if (leeft) setWachtV3(false); });
    return () => { leeft = false; };
  }, [p.ownerUserId]);
  if (v3 && v3.aan) return <Suspense fallback={<Skelet rijen={4} />}><WerkbladV3 {...p} eerste={v3} /></Suspense>;
  if (wachtV3) return <Skelet rijen={4} />;
  return <WerkbladV2 {...p} />;
}
