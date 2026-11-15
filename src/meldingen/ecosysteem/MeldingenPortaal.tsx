// Незалежний портальний центр сповіщень формату «застосунок у застосунку» (GEMINI-002).
// Відображається в окремому шарі безпосередньо в document.body поверх усіх вікон і меню сайту:
// перетягування, 8-стороннє змінення розмірів, 4 режими розміру, плавуча міні-пігулка, картки зі змахами,
// вбудований програвач усіх форматів вкладень, ШІ-інспектор та контекстна адаптація до піддомену.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Columns2,
  ExternalLink,
  Maximize2,
  Minimize2,
  Minus,
  PanelTopClose,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  contextVoorSubdomein,
  kanaalLabel,
  KANALEN,
  klemVenster,
  maatVanModus,
  pasVensterMaatAan,
  type AiAanbiederKeuze,
  type MeldingAiSamenvatting,
  type MeldingEcosysteemGebeurtenis,
  type MeldingEcosysteemProfiel,
  type MeldingGebeurtenisStatus,
  type MeldingKanaal,
  type MeldingSubdomein,
  type RandRichting,
  type RuimteType,
  type VensterGeometrie,
  type VensterModus,
} from '../../../shared/meldingen-ecosysteem';
import { canonicalNavigationUrl } from '../../canoniek-navigatie';
import MeldingVoorkeurenPaneel from '../MeldingVoorkeurenPaneel';
import MeldingVeegKaart from './MeldingVeegKaart';
import MeldingBijlageSpeler from './MeldingBijlageSpeler';
import MeldingAiPaneel from './MeldingAiPaneel';

const RANDEN: readonly RandRichting[] = ['n', 'z', 'w', 'o', 'nw', 'no', 'zw', 'zo'];

function leesScherm() {
  if (typeof window === 'undefined') {
    return { breedte: 1280, hoogte: 800, dokBoven: 0, dokOnder: 0, dokLinks: 0, dokRechts: 0 };
  }
  let dokBoven = 0;
  let dokOnder = 0;
  let dokLinks = 0;
  let dokRechts = 0;
  try {
    const s = getComputedStyle(document.documentElement);
    const n = (k: string) => Math.max(0, parseFloat(s.getPropertyValue(k)) || 0);
    dokBoven = n('--venster-dok-boven');
    dokOnder = n('--venster-dok-onder');
    dokLinks = n('--venster-dok-links');
    dokRechts = n('--venster-dok-rechts');
  } catch {
    /* без обчислених змінних */
  }
  return {
    breedte: window.innerWidth || 1280,
    hoogte: window.innerHeight || 800,
    dokBoven,
    dokOnder,
    dokLinks,
    dokRechts,
  };
}

type StatusFilter = 'actief' | 'nieuw' | 'uitgesteld' | 'opgelost' | 'archief' | 'alle';

type Props = {
  lang: 'uk' | 'nl';
  open: boolean;
  ruimte: RuimteType;
  subdomeinNu: MeldingSubdomein;
  profiel: MeldingEcosysteemProfiel;
  stroom: MeldingEcosysteemGebeurtenis[];
  laden: boolean;
  sound: boolean;
  techTypen?: boolean;
  onSluiten: () => void;
  onOpenen: () => void;
  onToggleSound: () => void;
  onVervers: () => void;
  onSlaGeometrieOp: (geo: VensterGeometrie, direct?: boolean) => void;
  onStatusWijzigen: (g: MeldingEcosysteemGebeurtenis, status: MeldingGebeurtenisStatus, uitstelMinuten?: number) => Promise<void>;
  onOntleden: (g: MeldingEcosysteemGebeurtenis, modus: 'intern' | 'extern', aanbieder?: AiAanbiederKeuze) => Promise<MeldingAiSamenvatting>;
  onMarkAll: () => void;
  onSwitchToClassic: () => void;
};

export default function MeldingenPortaal({
  lang,
  open,
  ruimte,
  subdomeinNu,
  profiel,
  stroom,
  laden,
  sound,
  techTypen = false,
  onSluiten,
  onOpenen,
  onToggleSound,
  onVervers,
  onSlaGeometrieOp,
  onStatusWijzigen,
  onOntleden,
  onMarkAll,
  onSwitchToClassic,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const ctx = useMemo(() => contextVoorSubdomein(subdomeinNu, ruimte), [subdomeinNu, ruimte]);

  const [geo, setGeo] = useState<VensterGeometrie>(() => klemVenster(profiel.geometrie, leesScherm()));
  const laatsteGeoRef = useRef<VensterGeometrie>(geo);
  laatsteGeoRef.current = geo;
  const [zoek, setZoek] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('actief');
  const [kanaalFilter, setKanaalFilter] = useState<MeldingKanaal | 'alle'>('alle');
  const [alleenDitSubdomein, setAlleenDitSubdomein] = useState(false);
  const [toonVoorkeuren, setToonVoorkeuren] = useState(false);
  const [geselecteerdId, setGeselecteerdId] = useState<string>('');
  const [detailBijlageIdx, setDetailBijlageIdx] = useState(0);
  const [modaalBijlage, setModaalBijlage] = useState<{ gebeurtenis: MeldingEcosysteemGebeurtenis; index: number } | null>(null);
  const vensterRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const geklemd = klemVenster(profiel.geometrie, leesScherm());
    laatsteGeoRef.current = geklemd;
    setGeo(geklemd);
  }, [
    profiel.geometrie.x,
    profiel.geometrie.y,
    profiel.geometrie.breedte,
    profiel.geometrie.hoogte,
    profiel.geometrie.modus,
    profiel.geometrie.vastgepind,
    profiel.geometrie.minimalePil,
  ]);

  useEffect(() => {
    const onResize = () => {
      setGeo((h) => {
        const geklemd = klemVenster(h, leesScherm());
        laatsteGeoRef.current = geklemd;
        return geklemd;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open || modaalBijlage) return;
    const r = requestAnimationFrame(() => {
      const el = vensterRef.current;
      if (el && !el.contains(document.activeElement)) {
        el.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(r);
  }, [open, modaalBijlage]);

  useEffect(() => {
    if (!open && !modaalBijlage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (modaalBijlage) {
        e.preventDefault();
        e.stopPropagation();
        setModaalBijlage(null);
        return;
      }
      if (open) {
        const doel = e.target as Element | null;
        if (doel && !doel.closest('.mel-ecosysteem-portaal') && !doel.closest('.canonical-notification-bell') && doel.closest('[role="dialog"],[aria-modal="true"]')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onSluiten();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, modaalBijlage, onSluiten]);

  // Автозакриття при натисканні зовні (коли вікно не закріплене)
  useEffect(() => {
    if (!open || geo.vastgepind) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el) return;
      if (
        el.closest('.mel-ecosysteem-portaal') ||
        el.closest('.mel-bijlage-portaal') ||
        el.closest('.canonical-notification-bell')
      ) {
        return;
      }
      onSluiten();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, geo.vastgepind, onSluiten]);

  const sleepStaat = useRef<{
    soort: 'verplaats' | 'maat';
    richting?: RandRichting;
    pointerId: number;
    startX: number;
    startY: number;
    startGeo: VensterGeometrie;
  } | null>(null);

  const startVerplaats = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button > 0 || geo.modus === 'volledig') return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('button,a,input,select')) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ігноруємо */
    }
    sleepStaat.current = {
      soort: 'verplaats',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startGeo: geo,
    };
  };

  const startMaat = (richting: RandRichting, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ігноруємо */
    }
    sleepStaat.current = {
      soort: 'maat',
      richting,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startGeo: geo,
    };
  };

  const beweegVenster = (e: ReactPointerEvent<HTMLElement>) => {
    const s = sleepStaat.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const scherm = leesScherm();
    const volgende =
      s.soort === 'verplaats'
        ? klemVenster({ ...s.startGeo, x: s.startGeo.x + dx, y: s.startGeo.y + dy }, scherm)
        : s.richting
          ? pasVensterMaatAan(s.startGeo, s.richting, dx, dy, scherm)
          : null;
    if (volgende) {
      laatsteGeoRef.current = volgende;
      setGeo(volgende);
    }
  };

  const eindigVensterSleep = (e: ReactPointerEvent<HTMLElement>) => {
    const s = sleepStaat.current;
    if (!s || s.pointerId !== e.pointerId) return;
    sleepStaat.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ігноруємо */
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const scherm = leesScherm();
    const eindGeo =
      s.soort === 'verplaats'
        ? klemVenster({ ...s.startGeo, x: s.startGeo.x + dx, y: s.startGeo.y + dy }, scherm)
        : s.richting
          ? pasVensterMaatAan(s.startGeo, s.richting, dx, dy, scherm)
          : laatsteGeoRef.current;
    laatsteGeoRef.current = eindGeo;
    setGeo(eindGeo);
    onSlaGeometrieOp(eindGeo, true);
  };

  const pasModusToe = (modus: VensterModus) => {
    const scherm = leesScherm();
    const { breedte, hoogte } = maatVanModus(modus, scherm);
    const volgende = klemVenster({ ...geo, modus, breedte, hoogte, minimalePil: false }, scherm);
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
  };

  const toggleVastpinnen = () => {
    const volgende = { ...geo, vastgepind: !geo.vastgepind };
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
  };

  const togglePil = (aan: boolean) => {
    const volgende = { ...geo, minimalePil: aan };
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
    if (aan) onSluiten();
    else onOpenen();
  };

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return stroom.filter((g) => {
      if (statusFilter === 'actief' && (g.status === 'archief' || g.status === 'opgelost')) return false;
      if (statusFilter !== 'actief' && statusFilter !== 'alle' && g.status !== statusFilter) return false;
      if (kanaalFilter !== 'alle' && g.kanaal !== kanaalFilter) return false;
      if (alleenDitSubdomein && g.subdomein !== subdomeinNu) return false;
      if (q) {
        const hay = `${g.titel} ${g.bericht} ${g.contextLabel} ${g.subdomein} ${g.bron}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [stroom, statusFilter, kanaalFilter, alleenDitSubdomein, subdomeinNu, zoek]);

  const geselecteerd = useMemo(() => {
    if (!gefilterd.length) return null;
    return gefilterd.find((g) => g.id === geselecteerdId) ?? gefilterd[0];
  }, [gefilterd, geselecteerdId]);

  useEffect(() => {
    setDetailBijlageIdx(0);
  }, [geselecteerd?.id]);

  const tellers = useMemo(() => {
    let nieuw = 0;
    let kritiek = 0;
    for (const g of stroom) {
      if (g.status === 'nieuw') nieuw += 1;
      if (g.status === 'nieuw' && g.prioriteit === 'kritiek') kritiek += 1;
    }
    return { nieuw, kritiek, totaal: stroom.length };
  }, [stroom]);

  const isBreed = (geo.modus === 'breed' || geo.modus === 'volledig' || geo.breedte >= 660) && !toonVoorkeuren;
  const instellingenHref = canonicalNavigationUrl('identity', 'melding', lang);

  if (!open && !geo.minimalePil && !modaalBijlage) return null;

  const portalLaag = (
    <>
      {!open && geo.minimalePil && (
        <div
          className='mel-minimale-pil'
          data-no-edge-swipe='1'
          data-testid='mel-minimale-pil'
          style={{
            ['--mel-accent' as string]: ctx.accent,
            ['--mel-tint' as string]: ctx.tintAchtergrond,
          }}
        >
          <button
            type='button'
            className='mel-pil-hoofd'
            onClick={() => togglePil(false)}
            aria-label={t('Розгорнути екосистему сповіщень', 'Meldingsapp uitklappen')}
          >
            <Bell className={tellers.kritiek > 0 ? 'is-kritiek' : undefined} aria-hidden='true' />
            <span className='mel-pil-tekst'>
              <strong>{lang === 'nl' ? ctx.naamNl : ctx.naamUk}</strong>
              <small>
                {tellers.nieuw > 0
                  ? t(`Нових: ${tellers.nieuw}`, `Nieuw: ${tellers.nieuw}`)
                  : t(`Усі події (${tellers.totaal})`, `Alle gebeurtenissen (${tellers.totaal})`)}
              </small>
            </span>
            {tellers.nieuw > 0 && <b className='mel-pil-teller'>{tellers.nieuw}</b>}
          </button>
          <button
            type='button'
            className='mel-ikoon-knop'
            onClick={() => {
              const v = { ...geo, minimalePil: false };
              setGeo(v);
              onSlaGeometrieOp(v, true);
              onSluiten();
            }}
            aria-label={t('Прибрати плавучу пігулку', 'Zwevende pil verbergen')}
            title={t('Прибрати плавучу пігулку', 'Zwevende pil verbergen')}
          >
            <X aria-hidden='true' />
          </button>
        </div>
      )}

      {open && (
        <section
          ref={vensterRef}
          className={`mel-ecosysteem-portaal is-modus-${geo.modus}${isBreed ? ' is-tweekolom' : ''}`}
          data-qa-id='canonical-notification-panel'
          data-no-edge-swipe='1'
          data-ruimte={ruimte}
          data-subdomein={subdomeinNu}
          role='dialog'
          tabIndex={-1}
          aria-label={t('Екосистема сповіщень', 'Meldingen-ecosysteem')}
          style={{
            ['--mel-x' as string]: `${geo.x}px`,
            ['--mel-y' as string]: `${geo.y}px`,
            ['--mel-w' as string]: `${geo.breedte}px`,
            ['--mel-h' as string]: `${geo.hoogte}px`,
            ['--mel-accent' as string]: ctx.accent,
            ['--mel-tint' as string]: ctx.tintAchtergrond,
          }}
        >
          {RANDEN.map((r) => (
            <div
              key={r}
              className={`mel-rand mel-rand-${r}`}
              aria-hidden='true'
              onPointerDown={(e) => startMaat(r, e)}
              onPointerMove={beweegVenster}
              onPointerUp={eindigVensterSleep}
              onPointerCancel={eindigVensterSleep}
            />
          ))}

          <header
            className='mel-kop'
            onPointerDown={startVerplaats}
            onPointerMove={beweegVenster}
            onPointerUp={eindigVensterSleep}
            onPointerCancel={eindigVensterSleep}
          >
            <div className='mel-kop-titel'>
              <span className='mel-kop-badge' aria-hidden='true'>
                <Sparkles />
              </span>
              <div>
                <strong>{t('Центр подій і сповіщень', 'Meldingen-ecosysteem')}</strong>
                <small>
                  {lang === 'nl' ? ctx.naamNl : ctx.naamUk} ·{' '}
                  {tellers.nieuw > 0
                    ? t(`нових: ${tellers.nieuw}`, `nieuw: ${tellers.nieuw}`)
                    : t('усе переглянуто', 'alles bijgewerkt')}
                </small>
              </div>
            </div>

            <div className='mel-kop-gereedschap'>
              <div className='mel-modus-groep' role='group' aria-label={t('Розмір вікна', 'Venstermodus')}>
                <button
                  type='button'
                  className={geo.modus === 'kompakt' ? 'is-actief' : undefined}
                  onClick={() => pasModusToe('kompakt')}
                  title={t('Компактно', 'Compact')}
                  aria-label={t('Компактно', 'Compact')}
                >
                  <Minimize2 aria-hidden='true' />
                </button>
                <button
                  type='button'
                  className={geo.modus === 'normaal' ? 'is-actief' : undefined}
                  onClick={() => pasModusToe('normaal')}
                  title={t('Звичайне вікно', 'Normaal')}
                  aria-label={t('Звичайне вікно', 'Normaal')}
                >
                  <PanelTopClose aria-hidden='true' />
                </button>
                <button
                  type='button'
                  className={geo.modus === 'breed' ? 'is-actief' : undefined}
                  onClick={() => pasModusToe('breed')}
                  title={t('Широкий оглядач (2 колонки)', 'Breed (twee kolommen)')}
                  aria-label={t('Широкий оглядач (2 колонки)', 'Breed (twee kolommen)')}
                >
                  <Columns2 aria-hidden='true' />
                </button>
                <button
                  type='button'
                  className={geo.modus === 'volledig' ? 'is-actief' : undefined}
                  onClick={() => pasModusToe('volledig')}
                  title={t('На весь екран', 'Volledig scherm')}
                  aria-label={t('На весь екран', 'Volledig scherm')}
                >
                  <Maximize2 aria-hidden='true' />
                </button>
              </div>

              <button
                type='button'
                className={`mel-ikoon-knop${geo.vastgepind ? ' is-actief' : ''}`}
                onClick={toggleVastpinnen}
                aria-pressed={geo.vastgepind}
                title={geo.vastgepind ? t('Відкріпити вікно', 'Venster losmaken') : t('Закріпити поверх сайту', 'Vastpinnen boven de site')}
                aria-label={geo.vastgepind ? t('Відкріпити вікно', 'Venster losmaken') : t('Закріпити поверх сайту', 'Vastpinnen boven de site')}
              >
                {geo.vastgepind ? <Pin aria-hidden='true' /> : <PinOff aria-hidden='true' />}
              </button>

              <button
                type='button'
                className='mel-ikoon-knop'
                onClick={() => togglePil(true)}
                title={t('Згорнути в плавучу пігулку', 'Minimaliseren naar zwevende pil')}
                aria-label={t('Згорнути в плавучу пігулку', 'Minimaliseren naar zwevende pil')}
              >
                <Minus aria-hidden='true' />
              </button>

              <button
                type='button'
                className='mel-ikoon-knop'
                onClick={onSluiten}
                title={t('Закрити', 'Sluiten')}
                aria-label={t('Закрити', 'Sluiten')}
              >
                <X aria-hidden='true' />
              </button>
            </div>
          </header>

          <div className='mel-werkbalk'>
            <label className='mel-zoekveld'>
              <Search aria-hidden='true' />
              <input
                type='search'
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder={t('Пошук за заголовком, службою, вкладенням…', 'Zoeken op titel, dienst of bijlage…')}
              />
            </label>

            <div className='mel-werkbalk-knoppen'>
              <button
                type='button'
                className={`mel-ikoon-knop${laden ? ' is-laden' : ''}`}
                onClick={onVervers}
                title={t('Оновити потік', 'Stroom verversen')}
                aria-label={t('Оновити потік', 'Stroom verversen')}
              >
                <RefreshCw className={laden ? 'mel-draai' : undefined} aria-hidden='true' />
              </button>

              <button
                type='button'
                className='mel-ikoon-knop'
                onClick={onToggleSound}
                title={sound ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')}
                aria-label={sound ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')}
              >
                {sound ? <Volume2 aria-hidden='true' /> : <VolumeX aria-hidden='true' />}
              </button>

              <button
                type='button'
                className={`mel-ikoon-knop${toonVoorkeuren ? ' is-actief' : ''}`}
                onClick={() => setToonVoorkeuren((v) => !v)}
                aria-pressed={toonVoorkeuren}
                title={t('Типи сповіщень', 'Soorten meldingen')}
                aria-label={t('Типи сповіщень', 'Soorten meldingen')}
              >
                <SlidersHorizontal aria-hidden='true' />
              </button>

              <a
                href={instellingenHref}
                className='mel-ikoon-knop'
                title={t('Правила та пісочниця (/melding)', 'Regels en testruimte (/melding)')}
                aria-label={t('Правила та пісочниця (/melding)', 'Regels en testruimte (/melding)')}
              >
                <Settings aria-hidden='true' />
              </a>
            </div>
          </div>

          {!toonVoorkeuren && (
            <div className='mel-filters'>
              <div className='mel-tabs' role='tablist' aria-label={t('Стани подій', 'Gebeurtenisstatus')}>
                {(
                  [
                    ['actief', t('Активні', 'Actief')],
                    ['nieuw', t(`Нові (${tellers.nieuw})`, `Nieuw (${tellers.nieuw})`)],
                    ['uitgesteld', t('Відкладені', 'Uitgesteld')],
                    ['opgelost', t('Вирішені', 'Opgelost')],
                    ['archief', t('Архів', 'Archief')],
                    ['alle', t('Усі', 'Alle')],
                  ] as const
                ).map(([sleutel, tekst]) => (
                  <button
                    key={sleutel}
                    type='button'
                    role='tab'
                    aria-selected={statusFilter === sleutel}
                    className={`mel-tab${statusFilter === sleutel ? ' is-actief' : ''}`}
                    onClick={() => setStatusFilter(sleutel)}
                  >
                    {tekst}
                  </button>
                ))}
              </div>

              <div className='mel-kanaal-chips'>
                <button
                  type='button'
                  className={`mel-kanaal-chip${alleenDitSubdomein ? ' is-actief' : ''}`}
                  onClick={() => setAlleenDitSubdomein((v) => !v)}
                >
                  {alleenDitSubdomein
                    ? t(`Тільки ${subdomeinNu}`, `Alleen ${subdomeinNu}`)
                    : t(`Контекст: ${subdomeinNu}`, `Context: ${subdomeinNu}`)}
                </button>

                <button
                  type='button'
                  className={`mel-kanaal-chip${kanaalFilter === 'alle' ? ' is-actief' : ''}`}
                  onClick={() => setKanaalFilter('alle')}
                >
                  {t('Усі канали', 'Alle kanalen')}
                </button>

                {ctx.snelFilters.map((k) => (
                  <button
                    key={k}
                    type='button'
                    className={`mel-kanaal-chip${kanaalFilter === k ? ' is-actief' : ''}`}
                    onClick={() => setKanaalFilter((cur) => (cur === k ? 'alle' : k))}
                  >
                    {kanaalLabel(k, lang)}
                  </button>
                ))}

                <select
                  className='mel-kanaal-select'
                  aria-label={t('Обрати будь-який канал', 'Kies willekeurig kanaal')}
                  value={kanaalFilter}
                  onChange={(e) => setKanaalFilter(e.target.value as MeldingKanaal | 'alle')}
                >
                  <option value='alle'>{t('Інший канал…', 'Ander kanaal…')}</option>
                  {KANALEN.map((k) => (
                    <option key={k} value={k}>
                      {kanaalLabel(k, lang)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className='mel-lichaam'>
            {toonVoorkeuren ? (
              <div className='mel-voorkeuren-kader'>
                <MeldingVoorkeurenPaneel lang={lang} techTypen={techTypen} />
              </div>
            ) : (
              <>
                <div className='mel-stroom-kolom'>
                  {gefilterd.length === 0 ? (
                    <div className='mel-leeg-staat'>
                      <Bell aria-hidden='true' />
                      <strong>{t('За вибраними фільтрами подій немає', 'Geen gebeurtenissen voor deze filters')}</strong>
                      <span>
                        {t(
                          'Змініть стан фільтра, очистіть пошук або відкрийте повні налаштування на сторінці /melding.',
                          'Pas de filters aan, wis de zoekopdracht of open de instellingen op /melding.',
                        )}
                      </span>
                    </div>
                  ) : (
                    gefilterd.map((geb) => (
                      <MeldingVeegKaart
                        key={geb.id}
                        lang={lang}
                        gebeurtenis={geb}
                        profiel={profiel}
                        geselecteerd={isBreed && geselecteerd?.id === geb.id}
                        bijlageVoorkeur={profiel.bijlageWeergave}
                        onSelect={() => setGeselecteerdId(geb.id)}
                        onStatus={(st, min) => onStatusWijzigen(geb, st, min)}
                        onOntleden={(modus, aanbieder) => onOntleden(geb, modus, aanbieder)}
                        onOpenBijlageModaal={(idx) => setModaalBijlage({ gebeurtenis: geb, index: idx })}
                      />
                    ))
                  )}
                </div>

                {isBreed && geselecteerd && (
                  <aside className='mel-detail-kolom' aria-label={t('Інспектор події', 'Gebeurtenisinspectie')}>
                    <div className='mel-detail-kop'>
                      <span className='mel-subdomein-chip'>{geselecteerd.subdomein}</span>
                      <strong>{geselecteerd.titel}</strong>
                      <small>{geselecteerd.contextLabel}</small>
                    </div>
                    {geselecteerd.bericht && <p className='mel-detail-tekst'>{geselecteerd.bericht}</p>}
                    {geselecteerd.uitleg && <pre className='mel-uitleg-blok'>{geselecteerd.uitleg}</pre>}

                    {geselecteerd.bijlagen.length > 0 && (
                      <MeldingBijlageSpeler
                        lang={lang}
                        bijlagen={geselecteerd.bijlagen}
                        actieveIndex={Math.min(detailBijlageIdx, geselecteerd.bijlagen.length - 1)}
                        voorkeur={profiel.bijlageWeergave}
                        onSelectIndex={setDetailBijlageIdx}
                        onToggleModaal={() => setModaalBijlage({ gebeurtenis: geselecteerd, index: Math.min(detailBijlageIdx, geselecteerd.bijlagen.length - 1) })}
                      />
                    )}

                    <MeldingAiPaneel
                      lang={lang}
                      gebeurtenis={geselecteerd}
                      aiInstelling={profiel.ai}
                      onOntleden={(modus, aanbieder) => onOntleden(geselecteerd, modus, aanbieder)}
                    />
                  </aside>
                )}
              </>
            )}
          </div>

          <div className='mel-voet' role='region' aria-label={t('Дії екосистеми', 'Ecosysteemacties')}>
            <button
              type='button'
              className='mel-knop mel-knop-zacht'
              disabled={tellers.nieuw === 0}
              onClick={onMarkAll}
            >
              {t('Позначити все прочитаним', 'Alles als gelezen')}
            </button>

            <button
              type='button'
              className='mel-knop mel-knop-zacht'
              onClick={onSwitchToClassic}
            >
              {t('Компактно біля дзвоника', 'Klassiek bij bel')}
            </button>

            <a href={instellingenHref} className='mel-knop mel-knop-primair'>
              <ExternalLink aria-hidden='true' />
              {t('Усі правила (/melding)', 'Alle regels (/melding)')}
            </a>
          </div>
        </section>
      )}

      {modaalBijlage && (
        <MeldingBijlageSpeler
          lang={lang}
          bijlagen={modaalBijlage.gebeurtenis.bijlagen}
          actieveIndex={modaalBijlage.index}
          voorkeur={profiel.bijlageWeergave}
          modaal
          onSelectIndex={(idx) => setModaalBijlage((cur) => (cur ? { ...cur, index: idx } : null))}
          onSluiten={() => setModaalBijlage(null)}
          onToggleModaal={() => setModaalBijlage(null)}
        />
      )}
    </>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(portalLaag, document.body);
  }
  return portalLaag;
}
