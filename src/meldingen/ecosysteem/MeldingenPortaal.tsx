// Єдиний портальний центр «Пульт уваги, спокою та дії» у двох розмірах: компактному біля дзвіночка
// та розгорнутому двоколонковому вікні (GEMINI-002 + MELDPANEEL-002 + MELDPANEEL-003).
// Успадковує живу палітру й тему сайту (.canonical-chrome), звільняє понад 80% простору під картки подій,
// підтримує вільне 8-стороннє змінення розміру в обох режимах та незмінну прив’язку до видимого дзвіночка.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AppWindow,
  Archive,
  Bell,
  BellDot,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock3,
  Columns2,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Network,
  PanelRightClose,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  KANALEN,
  MELDING_KAPSEL_AFLEVERING_VLAG,
  contextVoorSubdomein,
  kanaalLabel,
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
import {
  bouwRustigOverzicht,
  bundelOorzaakKetens,
  kanaalVisueelAnker,
  subdomeinMenselijkLabel,
  uitstelKeuzeLabel,
  verrijkGebeurtenisVoorPuls,
  type PulsOorzaakKeten,
  type VoorwaardelijkUitstelSoort,
} from '../../../shared/meldingen-puls/kern';
import { canonicalNavigationUrl } from '../../canoniek-navigatie';
import Merk from '../../merk/Merk';
import IcoonActieKnop from '../IcoonActieKnop';
import MeldingModusKiezer from '../MeldingModusKiezer';
import MeldingVoorkeurenPaneel from '../MeldingVoorkeurenPaneel';
import PulsOorzaakKetenKaart from '../puls/PulsOorzaakKetenKaart';
import {
  PulsBronTeken,
  PulsDienstChip,
  PulsIcoon,
  PulsKlimopZegel,
  PulsMandaatStraalBlok,
} from '../puls/PulsVisueelAnker';
import { usePulsSlimmeStaat } from '../puls/puls-opslag';
import MeldingAfleveringControle from './MeldingAfleveringControle';
import MeldingAiPaneel from './MeldingAiPaneel';
import MeldingBijlageSpeler from './MeldingBijlageSpeler';
import MeldingVeegKaart, { schoonKaartTitel } from './MeldingVeegKaart';

const RANDEN: readonly RandRichting[] = ['n', 'z', 'w', 'o', 'nw', 'no', 'zw', 'zo'];
const DND_KEUZES_MIN = [30, 60, 120, 480] as const;
const COMPACT_MAAT_SLEUTEL = 'mr:puls:compact-maat:v1';
const STANDAARD_COMPACT_BREEDTE = 468;
const STANDAARD_COMPACT_HOOGTE = 660;

const useIsomorfLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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

function leesCompactMaat(): { breedte: number; hoogte: number } {
  if (typeof window === 'undefined') {
    return { breedte: STANDAARD_COMPACT_BREEDTE, hoogte: STANDAARD_COMPACT_HOOGTE };
  }
  try {
    const rauw = window.localStorage.getItem(COMPACT_MAAT_SLEUTEL);
    if (rauw) {
      const parsed = JSON.parse(rauw) as { breedte?: unknown; hoogte?: unknown };
      const b = Number(parsed?.breedte);
      const h = Number(parsed?.hoogte);
      if (Number.isFinite(b) && Number.isFinite(h) && b >= 310 && h >= 300) {
        return { breedte: Math.round(b), hoogte: Math.round(h) };
      }
    }
  } catch {
    /* сховище недоступне */
  }
  return { breedte: STANDAARD_COMPACT_BREEDTE, hoogte: STANDAARD_COMPACT_HOOGTE };
}

function bewaarCompactMaat(breedte: number, hoogte: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      COMPACT_MAAT_SLEUTEL,
      JSON.stringify({ breedte: Math.round(breedte), hoogte: Math.round(hoogte) }),
    );
  } catch {
    /* сховище недоступне */
  }
}

/** Знаходить видиму кнопку дзвіночка на поточній сторінці (включно з дзвіночком вигляду «Макет» на /melding). */
export function vindZichtbareBel(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const kandidaten = Array.from(
    document.querySelectorAll<HTMLElement>('[data-bel-anker="maquette"], .canonical-notification-bell'),
  );
  for (const el of kandidaten) {
    try {
      const stijl = getComputedStyle(el);
      if (stijl.display === 'none' || stijl.visibility === 'hidden' || parseFloat(stijl.opacity || '1') === 0) {
        continue;
      }
    } catch {
      /* без обчисленого стилю */
    }
    const r = el.getBoundingClientRect();
    if (r && r.width > 2 && r.height > 2) return r;
  }
  return null;
}

type StatusFilter = 'actief' | 'nieuw' | 'uitgesteld' | 'opgelost' | 'archief' | 'alle';

type OngedaanMakenStaat = {
  id: string;
  tekst: string;
  vorigeItems: Array<{ geb: MeldingEcosysteemGebeurtenis; vorigeStatus: MeldingGebeurtenisStatus }>;
  verlooptOp: number;
};

type Props = {
  lang: 'uk' | 'nl';
  scope?: string;
  open: boolean;
  compactBijBel?: boolean;
  ruimte: RuimteType;
  subdomeinNu: MeldingSubdomein;
  profiel: MeldingEcosysteemProfiel;
  stroom: MeldingEcosysteemGebeurtenis[];
  laden: boolean;
  sound: boolean;
  techTypen?: boolean;
  nietStorenTot?: number | null;
  onZetNietStoren?: (minuten: number | null) => void;
  onStilVoorKanaal?: (kanaal: MeldingKanaal) => void;
  onSluiten: () => void;
  onOpenen: () => void;
  onToggleSound: () => void;
  onVervers: () => void;
  onSlaGeometrieOp: (geo: VensterGeometrie, direct?: boolean) => void;
  onWerkProfielBij?: (updater: (oud: MeldingEcosysteemProfiel) => MeldingEcosysteemProfiel, directOpslaan?: boolean) => void;
  onRegistreerAfgeleverd?: (gebeurtenissen: ReadonlyArray<Pick<MeldingEcosysteemGebeurtenis, 'id' | 'externeSleutel' | 'afgeleverdOp'>>) => void;
  onRegistreerZichtGelezen?: (g: MeldingEcosysteemGebeurtenis) => void;
  onStatusWijzigen: (g: MeldingEcosysteemGebeurtenis, status: MeldingGebeurtenisStatus, uitstelMinuten?: number) => Promise<void>;
  onOntleden: (g: MeldingEcosysteemGebeurtenis, modus: 'intern' | 'extern', aanbieder?: AiAanbiederKeuze) => Promise<MeldingAiSamenvatting>;
  onMarkAll: () => void;
  onSwitchToClassic: () => void;
  onOpenVensterModus?: () => void;
};

function TabIcoon({ sleutel }: { sleutel: StatusFilter }) {
  if (sleutel === 'actief') return <Sparkles aria-hidden='true' />;
  if (sleutel === 'nieuw') return <BellDot aria-hidden='true' />;
  if (sleutel === 'uitgesteld') return <Clock3 aria-hidden='true' />;
  if (sleutel === 'opgelost') return <CheckCircle2 aria-hidden='true' />;
  if (sleutel === 'archief') return <Archive aria-hidden='true' />;
  return <Layers aria-hidden='true' />;
}

export default function MeldingenPortaal({
  lang,
  scope = 'standaard',
  open,
  compactBijBel = false,
  ruimte,
  subdomeinNu,
  profiel,
  stroom,
  laden,
  sound,
  techTypen = false,
  nietStorenTot = null,
  onZetNietStoren,
  onStilVoorKanaal,
  onSluiten,
  onOpenen,
  onToggleSound,
  onVervers,
  onSlaGeometrieOp,
  onWerkProfielBij,
  onRegistreerAfgeleverd,
  onRegistreerZichtGelezen,
  onStatusWijzigen,
  onOntleden,
  onMarkAll,
  onSwitchToClassic,
  onOpenVensterModus,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const ctx = useMemo(() => contextVoorSubdomein(subdomeinNu, ruimte), [subdomeinNu, ruimte]);

  const [geo, setGeo] = useState<VensterGeometrie>(() => {
    const scherm = leesScherm();
    if (compactBijBel) {
      const m = leesCompactMaat();
      const r = vindZichtbareBel();
      const x = r ? r.right - m.breedte : scherm.breedte - m.breedte - 16;
      const y = r ? r.bottom + 10 : 66;
      return klemVenster({ ...profiel.geometrie, x, y, breedte: m.breedte, hoogte: m.hoogte, modus: 'normaal' }, scherm);
    }
    return klemVenster(profiel.geometrie, scherm);
  });
  const laatsteGeoRef = useRef<VensterGeometrie>(geo);
  laatsteGeoRef.current = geo;
  const vorigeVoorVolledigRef = useRef<VensterGeometrie | null>(null);

  const [schermBreedte, setSchermBreedte] = useState<number>(() => leesScherm().breedte);
  const [zoek, setZoek] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('actief');
  const [kanaalFilter, setKanaalFilter] = useState<MeldingKanaal | 'alle'>('alle');
  const [alleenDitSubdomein, setAlleenDitSubdomein] = useState(false);
  const [toonVoorkeuren, setToonVoorkeuren] = useState(false);
  const [dndMenuOpen, setDndMenuOpen] = useState(false);
  const [geselecteerdId, setGeselecteerdId] = useState<string>('');
  const [spatieOpenId, setSpatieOpenId] = useState<string>('');
  const [globaalUitgeklapt, setGlobaalUitgeklapt] = useState<boolean | null>(null);
  const [detailMandaatDuur, setDetailMandaatDuur] = useState<'eenmalig' | '15m'>('eenmalig');
  const [detailBijlageIdx, setDetailBijlageIdx] = useState(0);
  const [modaalBijlage, setModaalBijlage] = useState<{ gebeurtenis: MeldingEcosysteemGebeurtenis; index: number } | null>(null);
  const [ongedaan, setOngedaan] = useState<OngedaanMakenStaat | null>(null);
  const [ongedaanSec, setOngedaanSec] = useState(5);
  const [bovenMaten, setBovenMaten] = useState<{ alleenKop: number; kopMetDnd: number; totaalBoven: number }>({
    alleenKop: 45,
    kopMetDnd: 45,
    totaalBoven: 82,
  });
  const [scrollStaat, setScrollStaat] = useState<{ kanScrollen: boolean; voortgang: number; duimHoogtePct: number; duimTopPct: number }>({
    kanScrollen: false,
    voortgang: 0,
    duimHoogtePct: 0.25,
    duimTopPct: 0,
  });
  const [schuifActief, setSchuifActief] = useState(false);
  const vensterRef = useRef<HTMLElement | null>(null);
  const kopRef = useRef<HTMLElement | null>(null);
  const dndStrookRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const lijstRef = useRef<HTMLDivElement | null>(null);
  const schuifSpoorRef = useRef<HTMLDivElement | null>(null);
  const schuifPointerIdRef = useRef<number | null>(null);
  const zoekInputRef = useRef<HTMLInputElement | null>(null);

  const isMobielLangscroll =
    open &&
    schermBreedte <= 768 &&
    (!compactBijBel || geo.modus === 'volledig' || profiel.geometrie.modus === 'volledig');
  const isMobielLangscrollRef = useRef(isMobielLangscroll);
  isMobielLangscrollRef.current = isMobielLangscroll;
  const scrollStaatRef = useRef(scrollStaat);
  scrollStaatRef.current = scrollStaat;

  const wekGebeurtenis = useCallback(
    (geb: MeldingEcosysteemGebeurtenis) => {
      void onStatusWijzigen(geb, 'nieuw');
    },
    [onStatusWijzigen],
  );

  const slim = usePulsSlimmeStaat({
    scope,
    lang,
    subdomeinNu,
    stroom,
    onWekGebeurtenis: wekGebeurtenis,
  });

  useEffect(() => {
    if (!ongedaan) return undefined;
    const werkBij = () => {
      const rest = Math.ceil((ongedaan.verlooptOp - Date.now()) / 1000);
      if (rest <= 0) {
        setOngedaan(null);
      } else {
        setOngedaanSec(rest);
      }
    };
    werkBij();
    const timer = window.setInterval(werkBij, 250);
    return () => window.clearInterval(timer);
  }, [ongedaan]);

  const registreerActieMetOngedaan = useCallback(
    async (
      items: MeldingEcosysteemGebeurtenis[],
      doelStatus: MeldingGebeurtenisStatus,
      tekst: string,
      uitstelMinuten?: number,
    ) => {
      if (!items.length) return;
      const vorigeItems = items.map((geb) => ({ geb, vorigeStatus: geb.status }));
      setOngedaan({
        id: `${Date.now()}`,
        tekst,
        vorigeItems,
        verlooptOp: Date.now() + 5000,
      });
      for (const geb of items) {
        if (doelStatus !== 'uitgesteld') slim.wisUitstelRegel(geb.id);
        if (doelStatus === 'archief' && items.length === 1) slim.meldSnelOpgeruimd(geb);
        await onStatusWijzigen(geb, doelStatus, uitstelMinuten);
      }
    },
    [onStatusWijzigen, slim],
  );

  const voerOngedaanUit = useCallback(async () => {
    if (!ongedaan) return;
    const teHerstellen = ongedaan.vorigeItems;
    setOngedaan(null);
    for (const { geb, vorigeStatus } of teHerstellen) {
      slim.wisUitstelRegel(geb.id);
      await onStatusWijzigen(geb, vorigeStatus);
    }
  }, [ongedaan, onStatusWijzigen, slim]);

  // Синхронізуємо геометрію віконного режиму з профілем облікового запису (не збиваючи прив’язку компактної панелі до дзвіночка).
  useEffect(() => {
    if (compactBijBel) return;
    const scherm = leesScherm();
    const g = profiel.geometrie;
    if (g.modus !== 'volledig' && g.x === 24 && g.y === 72) {
      const r = vindZichtbareBel();
      if (r) {
        const bijBel = klemVenster({ ...g, x: r.right - g.breedte, y: r.bottom + 10 }, scherm);
        laatsteGeoRef.current = bijBel;
        setGeo(bijBel);
        return;
      }
    }
    const geklemd = klemVenster(g, scherm);
    laatsteGeoRef.current = geklemd;
    setGeo(geklemd);
  }, [
    compactBijBel,
    profiel.geometrie.x,
    profiel.geometrie.y,
    profiel.geometrie.breedte,
    profiel.geometrie.hoogte,
    profiel.geometrie.modus,
    profiel.geometrie.vastgepind,
    profiel.geometrie.minimalePil,
  ]);

  // MELDINGEN-UX-001 + MELDPANEEL-003: компактна панель ЗАВЖДИ відкривається рівно під видимим дзвіночком (праворуч),
  // а віконний режим теж вирівнюється під дзвіночком, поки власник не перемістив його на власне місце (x 24 / y 72).
  useIsomorfLayoutEffect(() => {
    if (!open) return;
    const g = profiel.geometrie;
    if (!compactBijBel && (g.modus === 'volledig' || g.x !== 24 || g.y !== 72)) return;
    const m = compactBijBel ? leesCompactMaat() : null;
    const scherm = leesScherm();
    const r = vindZichtbareBel() || document.querySelector<HTMLElement>('.canonical-notification-bell')?.getBoundingClientRect();
    setGeo((h0) => {
      const h = m ? { ...h0, breedte: m.breedte, hoogte: m.hoogte, modus: 'normaal' as const } : h0;
      const volgende = r && (r.width || r.height)
        ? klemVenster({ ...h, x: r.right - h.breedte, y: r.bottom + 10 }, scherm)
        : compactBijBel
          ? klemVenster({ ...h, x: scherm.breedte - h.breedte - 16, y: 66 }, scherm)
          : h0;
      laatsteGeoRef.current = volgende;
      return volgende;
    });
  }, [open, compactBijBel, profiel.geometrie.x, profiel.geometrie.y, profiel.geometrie.modus]);

  useEffect(() => {
    const onResize = () => {
      const scherm = leesScherm();
      setSchermBreedte(scherm.breedte);
      setGeo((h) => {
        if (compactBijBel) {
          const r = vindZichtbareBel();
          if (r) {
            const bijBel = klemVenster({ ...h, x: r.right - h.breedte, y: r.bottom + 10 }, scherm);
            laatsteGeoRef.current = bijBel;
            return bijBel;
          }
        }
        if (!compactBijBel && scherm.breedte > 768 && h.breedte < 620 && (h.modus === 'breed' || h.modus === 'volledig')) {
          const m = maatVanModus(h.modus, scherm);
          const hersteld = klemVenster({ ...h, breedte: m.breedte, hoogte: Math.max(h.hoogte, m.hoogte) }, scherm);
          laatsteGeoRef.current = hersteld;
          return hersteld;
        }
        const geklemd = klemVenster(h, scherm);
        laatsteGeoRef.current = geklemd;
        return geklemd;
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compactBijBel]);

  // HERSTEL-001: на вузькому екрані (<= 768px) у розгорнутому режимі вмикаємо справжнє прокручування документа,
  // щоб системна кнопка смартфона Android «Довгий знімок екрана» (Scroll Capture) охоплювала всю стрічку карток.
  useIsomorfLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const wortelEl = document.documentElement;
    if (!isMobielLangscroll) {
      if (wortelEl.getAttribute('data-mel-mobiel-langscroll') === '1') {
        wortelEl.removeAttribute('data-mel-mobiel-langscroll');
      }
      return undefined;
    }
    wortelEl.setAttribute('data-mel-mobiel-langscroll', '1');
    try {
      window.scrollTo?.(0, 0);
    } catch {
      /* без прокручування у тестовому оточенні */
    }
    return () => {
      wortelEl.removeAttribute('data-mel-mobiel-langscroll');
    };
  }, [isMobielLangscroll]);

  const werkScrollStaatBij = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    let scrollHoogte = 0;
    let zichtHoogte = 0;
    let scrollTop = 0;
    if (isMobielLangscrollRef.current) {
      const sc = document.scrollingElement || document.documentElement;
      scrollHoogte = sc?.scrollHeight || 0;
      zichtHoogte = window.innerHeight || sc?.clientHeight || 0;
      scrollTop = window.scrollY || sc?.scrollTop || 0;
    } else if (lijstRef.current) {
      scrollHoogte = lijstRef.current.scrollHeight || 0;
      zichtHoogte = lijstRef.current.clientHeight || 0;
      scrollTop = lijstRef.current.scrollTop || 0;
    }
    const kanScrollen = scrollHoogte > zichtHoogte + 8 && zichtHoogte > 0;
    if (!kanScrollen) {
      setScrollStaat((oud) => (oud.kanScrollen ? { kanScrollen: false, voortgang: 0, duimHoogtePct: 0.25, duimTopPct: 0 } : oud));
      return;
    }
    const maxScroll = Math.max(1, scrollHoogte - zichtHoogte);
    const voortgang = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const duimHoogtePct = Math.min(0.9, Math.max(0.1, zichtHoogte / Math.max(1, scrollHoogte)));
    const duimTopPct = voortgang * (1 - duimHoogtePct);
    setScrollStaat((oud) => {
      if (
        oud.kanScrollen === kanScrollen &&
        Math.abs(oud.voortgang - voortgang) < 0.002 &&
        Math.abs(oud.duimHoogtePct - duimHoogtePct) < 0.002
      ) {
        return oud;
      }
      return { kanScrollen, voortgang, duimHoogtePct, duimTopPct };
    });
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const meetAlles = () => {
      const alleenKop = Math.max(38, kopRef.current?.offsetHeight || 45);
      const dndH = dndStrookRef.current?.offsetHeight || 0;
      const filtH = filtersRef.current?.offsetHeight || 0;
      const kopMetDnd = alleenKop + dndH;
      const totaalBoven = kopMetDnd + filtH;
      setBovenMaten((oud) =>
        oud.alleenKop === alleenKop && oud.kopMetDnd === kopMetDnd && oud.totaalBoven === totaalBoven
          ? oud
          : { alleenKop, kopMetDnd, totaalBoven },
      );
      werkScrollStaatBij();
    };
    const r = requestAnimationFrame(meetAlles);
    window.addEventListener('scroll', werkScrollStaatBij, { passive: true });
    window.addEventListener('resize', meetAlles, { passive: true });
    let obs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      obs = new ResizeObserver(meetAlles);
      if (lijstRef.current) obs.observe(lijstRef.current);
      if (kopRef.current) obs.observe(kopRef.current);
      if (filtersRef.current) obs.observe(filtersRef.current);
    }
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener('scroll', werkScrollStaatBij);
      window.removeEventListener('resize', meetAlles);
      obs?.disconnect();
    };
  }, [open, isMobielLangscroll, toonVoorkeuren, filterOpen, zoek, statusFilter, kanaalFilter, stroom.length, geo.hoogte, geo.modus, werkScrollStaatBij]);

  const springSchuifNaarClientY = useCallback(
    (clientY: number) => {
      const spoor = schuifSpoorRef.current;
      if (!spoor) return;
      const rect = spoor.getBoundingClientRect();
      if (rect.height <= 4) return;
      const duimPx = Math.max(32, rect.height * scrollStaatRef.current.duimHoogtePct);
      const vrijPx = Math.max(1, rect.height - duimPx);
      const doelVoortgang = Math.min(1, Math.max(0, (clientY - rect.top - duimPx / 2) / vrijPx));
      if (isMobielLangscrollRef.current) {
        const sc = document.scrollingElement || document.documentElement;
        const max = Math.max(0, (sc?.scrollHeight || 0) - (window.innerHeight || sc?.clientHeight || 0));
        try {
          window.scrollTo(0, Math.round(doelVoortgang * max));
        } catch {
          if (sc) sc.scrollTop = Math.round(doelVoortgang * max);
        }
      } else if (lijstRef.current) {
        const el = lijstRef.current;
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.round(doelVoortgang * max);
      }
      werkScrollStaatBij();
    },
    [werkScrollStaatBij],
  );

  const startSchuifSleep = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    schuifPointerIdRef.current = e.pointerId;
    setSchuifActief(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* без перехоплення вказівника */
    }
    springSchuifNaarClientY(e.clientY);
  };

  const beweegSchuifSleep = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (schuifPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    springSchuifNaarClientY(e.clientY);
  };

  const eindigSchuifSleep = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (schuifPointerIdRef.current !== e.pointerId) return;
    schuifPointerIdRef.current = null;
    setSchuifActief(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* без перехоплення вказівника */
    }
  };

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && ongedaan) {
        e.preventDefault();
        void voerOngedaanUit();
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (modaalBijlage) {
        e.preventDefault();
        e.stopPropagation();
        setModaalBijlage(null);
        return;
      }
      if (dndMenuOpen) {
        e.preventDefault();
        setDndMenuOpen(false);
        return;
      }
      if (open) {
        const doel = e.target as Element | null;
        if (
          doel &&
          !doel.closest('.mel-ecosysteem-portaal') &&
          !doel.closest('.canonical-notification-bell') &&
          !doel.closest('[data-bel-anker="maquette"]') &&
          doel.closest('[role="dialog"],[aria-modal="true"]')
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onSluiten();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, modaalBijlage, dndMenuOpen, ongedaan, voerOngedaanUit, onSluiten]);

  // Автозакриття при натисканні зовні (коли вікно не закріплене або відкрите компактно біля дзвіночка; у повноекранному мобільному режимі закривається явно кнопкою ✕)
  useEffect(() => {
    if (!open || isMobielLangscroll || (geo.vastgepind && !compactBijBel)) return;
    const onDown = (e: PointerEvent) => {
      if (sleepStaat.current || schuifPointerIdRef.current !== null) return;
      const el = e.target as Element | null;
      if (!el || el === document.documentElement || el === document.body) return;
      if (
        el.closest('.mel-ecosysteem-portaal') ||
        el.closest('.mel-bijlage-portaal') ||
        el.closest('.canonical-notification-bell') ||
        el.closest('[data-bel-anker="maquette"]')
      ) {
        return;
      }
      onSluiten();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, isMobielLangscroll, geo.vastgepind, compactBijBel, onSluiten]);

  const sleepStaat = useRef<{
    soort: 'verplaats' | 'maat';
    richting?: RandRichting;
    pointerId: number;
    startX: number;
    startY: number;
    startGeo: VensterGeometrie;
    compactModus: boolean;
  } | null>(null);

  const pasSleepBewegingToe = useCallback((clientX: number, clientY: number) => {
    const s = sleepStaat.current;
    if (!s) return null;
    const dx = clientX - s.startX;
    const dy = clientY - s.startY;
    const scherm = leesScherm();
    const volgende =
      s.soort === 'verplaats'
        ? klemVenster({ ...s.startGeo, x: s.startGeo.x + dx, y: s.startGeo.y + dy }, scherm)
        : s.richting
          ? pasVensterMaatAan(s.startGeo, s.richting, dx, dy, scherm)
          : null;
    if (volgende) {
      const genormaliseerd = s.compactModus ? { ...volgende, modus: 'normaal' as const } : volgende;
      laatsteGeoRef.current = genormaliseerd;
      setGeo(genormaliseerd);
      return genormaliseerd;
    }
    return null;
  }, []);

  const rondSleepAf = useCallback(
    (clientX: number, clientY: number) => {
      const s = sleepStaat.current;
      if (!s) return;
      sleepStaat.current = null;
      const eindGeo = pasSleepBewegingToe(clientX, clientY) ?? laatsteGeoRef.current;
      if (s.compactModus) {
        bewaarCompactMaat(eindGeo.breedte, eindGeo.hoogte);
      } else {
        onSlaGeometrieOp(eindGeo, true);
      }
    },
    [pasSleepBewegingToe, onSlaGeometrieOp],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const opMove = (e: PointerEvent) => {
      const s = sleepStaat.current;
      if (!s || s.pointerId !== e.pointerId) return;
      pasSleepBewegingToe(e.clientX, e.clientY);
    };
    const opUp = (e: PointerEvent) => {
      const s = sleepStaat.current;
      if (!s || s.pointerId !== e.pointerId) return;
      rondSleepAf(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', opMove);
    window.addEventListener('pointerup', opUp);
    window.addEventListener('pointercancel', opUp);
    return () => {
      window.removeEventListener('pointermove', opMove);
      window.removeEventListener('pointerup', opUp);
      window.removeEventListener('pointercancel', opUp);
    };
  }, [pasSleepBewegingToe, rondSleepAf]);

  const startVerplaats = (e: ReactPointerEvent<HTMLElement>) => {
    if (isMobielLangscroll || compactBijBel || e.button > 0 || geo.modus === 'volledig') return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('button,a,input,select')) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* без перехоплення вказівника */
    }
    sleepStaat.current = {
      soort: 'verplaats',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startGeo: laatsteGeoRef.current,
      compactModus: false,
    };
  };

  // Гнучке розтягування працює за всі 8 країв і кутів як у віконному, так і в компактному режимі (крім повного екрана та мобільного потоку).
  const startMaat = (richting: RandRichting, e: ReactPointerEvent<HTMLElement>) => {
    if (isMobielLangscroll || e.button > 0 || (!compactBijBel && geo.modus === 'volledig')) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* без перехоплення вказівника */
    }
    sleepStaat.current = {
      soort: 'maat',
      richting,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startGeo: laatsteGeoRef.current,
      compactModus: compactBijBel,
    };
  };

  const beweegVenster = (e: ReactPointerEvent<HTMLElement>) => {
    const s = sleepStaat.current;
    if (!s || s.pointerId !== e.pointerId) return;
    pasSleepBewegingToe(e.clientX, e.clientY);
  };

  const eindigVensterSleep = (e: ReactPointerEvent<HTMLElement>) => {
    const s = sleepStaat.current;
    if (!s || s.pointerId !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* без перехоплення вказівника */
    }
    rondSleepAf(e.clientX, e.clientY);
  };

  const pasModusToe = (modus: VensterModus) => {
    const scherm = leesScherm();
    const huidige = laatsteGeoRef.current;

    if (modus === 'volledig') {
      if (huidige.modus !== 'volledig') {
        vorigeVoorVolledigRef.current = huidige;
      }
      const vol = klemVenster({ ...huidige, modus: 'volledig', minimalePil: false }, scherm);
      laatsteGeoRef.current = vol;
      setGeo(vol);
      onSlaGeometrieOp({ ...huidige, modus: 'volledig', minimalePil: false }, true);
      return;
    }

    if (huidige.modus === 'volledig' && vorigeVoorVolledigRef.current) {
      const herstel = klemVenster({ ...vorigeVoorVolledigRef.current, modus, minimalePil: false }, scherm);
      vorigeVoorVolledigRef.current = null;
      laatsteGeoRef.current = herstel;
      setGeo(herstel);
      onSlaGeometrieOp(herstel, true);
      return;
    }

    const { breedte, hoogte } = maatVanModus(modus, scherm);
    const belRect = vindZichtbareBel();
    const staatRechts = huidige.x + huidige.breedte > scherm.breedte * 0.55;
    const doelX =
      profiel.geometrie.x === 24 && profiel.geometrie.y === 72 && belRect
        ? belRect.right - breedte
        : staatRechts
          ? huidige.x + huidige.breedte - breedte
          : huidige.x;
    const doelY =
      profiel.geometrie.x === 24 && profiel.geometrie.y === 72 && belRect
        ? belRect.bottom + 10
        : huidige.y;
    const volgende = klemVenster({ ...huidige, x: doelX, y: doelY, modus, breedte, hoogte, minimalePil: false }, scherm);
    laatsteGeoRef.current = volgende;
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
  };

  const openVensterVanuitCompact = () => {
    const scherm = leesScherm();
    const { breedte, hoogte } = maatVanModus('breed', scherm);
    const belRect = vindZichtbareBel();
    const opgeslagen = profiel.geometrie;
    const nogOpStandaard = opgeslagen.x === 24 && opgeslagen.y === 72;
    const doelX = nogOpStandaard
      ? belRect
        ? belRect.right - breedte
        : scherm.breedte - breedte - 16
      : opgeslagen.x;
    const doelY = nogOpStandaard ? (belRect ? belRect.bottom + 10 : 66) : opgeslagen.y;
    const volgende = klemVenster(
      { ...opgeslagen, x: doelX, y: doelY, breedte, hoogte, modus: 'breed', minimalePil: false },
      scherm,
    );
    laatsteGeoRef.current = volgende;
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
    onOpenVensterModus?.();
  };

  const toggleVastpinnen = () => {
    const volgende = { ...geo, vastgepind: !geo.vastgepind };
    laatsteGeoRef.current = volgende;
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
  };

  const togglePil = (aan: boolean) => {
    const volgende = { ...geo, minimalePil: aan };
    laatsteGeoRef.current = volgende;
    setGeo(volgende);
    onSlaGeometrieOp(volgende, true);
    if (aan) onSluiten();
    else onOpenen();
  };

  const alleGebeurtenissenMap = useMemo(
    () => new Map(stroom.map((g) => [g.id, g] as const)),
    [stroom],
  );

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

  const stroomEenheden = useMemo(() => {
    if (zoek.trim() || (statusFilter !== 'actief' && statusFilter !== 'nieuw')) {
      return gefilterd.map((gebeurtenis) => ({ soort: 'los' as const, gebeurtenis }));
    }
    return bundelOorzaakKetens(gefilterd, lang);
  }, [gefilterd, statusFilter, zoek, lang]);

  const rustigOverzicht = useMemo(() => bouwRustigOverzicht(stroom, lang), [stroom, lang]);

  const geselecteerd = useMemo(() => {
    if (!gefilterd.length) return null;
    return gefilterd.find((g) => g.id === geselecteerdId) ?? gefilterd[0];
  }, [gefilterd, geselecteerdId]);

  const geselecteerdVerrijkt = useMemo(
    () => (geselecteerd ? verrijkGebeurtenisVoorPuls(geselecteerd, lang) : null),
    [geselecteerd, lang],
  );

  const geselecteerdKeten = useMemo(() => {
    if (!geselecteerd) return null;
    for (const eenheid of stroomEenheden) {
      if (eenheid.soort === 'keten' && eenheid.keten.alleIds.includes(geselecteerd.id)) {
        return eenheid.keten;
      }
    }
    return null;
  }, [geselecteerd, stroomEenheden]);

  useEffect(() => {
    setDetailBijlageIdx(0);
  }, [geselecteerd?.id]);

  const tellers = useMemo(() => {
    let nieuw = 0;
    let kritiek = 0;
    let uitgesteld = 0;
    for (const g of stroom) {
      if (g.status === 'nieuw') nieuw += 1;
      if (g.status === 'nieuw' && g.prioriteit === 'kritiek') kritiek += 1;
      if (g.status === 'uitgesteld') uitgesteld += 1;
    }
    return { nieuw, kritiek, uitgesteld, totaal: stroom.length };
  }, [stroom]);

  const isBreed =
    !isMobielLangscroll &&
    ((!compactBijBel && (geo.modus === 'breed' || geo.modus === 'volledig')) || geo.breedte >= 680) &&
    !toonVoorkeuren;
  const instellingenHref = canonicalNavigationUrl('identity', 'melding', lang);
  const registerHref = `${instellingenHref}#melding-register`;
  const dndActief = Boolean(nietStorenTot && nietStorenTot > Date.now());
  const heeftActiefFilter = Boolean(zoek.trim() || kanaalFilter !== 'alle' || alleenDitSubdomein);

  const opPaneelToets = (e: ReactKeyboardEvent<HTMLElement>) => {
    const doel = e.target as HTMLElement | null;
    if (doel && /^(INPUT|TEXTAREA|SELECT)$/.test(doel.tagName)) return;
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setFilterOpen(true);
      requestAnimationFrame(() => zoekInputRef.current?.focus());
      return;
    }
    if (!gefilterd.length) return;
    const idx = Math.max(0, gefilterd.findIndex((g) => g.id === geselecteerd?.id));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const volgende = gefilterd[Math.min(gefilterd.length - 1, idx + 1)];
      if (volgende) setGeselecteerdId(volgende.id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const vorige = gefilterd[Math.max(0, idx - 1)];
      if (vorige) setGeselecteerdId(vorige.id);
    } else if (e.key === ' ' && geselecteerd && !(doel && /^(BUTTON|A)$/.test(doel.tagName))) {
      e.preventDefault();
      setSpatieOpenId((cur) => (cur === geselecteerd.id ? '' : geselecteerd.id));
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && geselecteerd && geselecteerd.status !== 'archief') {
      if (geselecteerd.prioriteit === 'kritiek' && geselecteerd.kanaal === 'beveiliging' && geselecteerd.status === 'nieuw') return;
      e.preventDefault();
      void registreerActieMetOngedaan(
        [geselecteerd],
        'archief',
        t(`Перенесено в архів: «${geselecteerd.titel.slice(0, 38)}»`, `Gearchiveerd: «${geselecteerd.titel.slice(0, 38)}»`),
      );
    } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && geselecteerd && geselecteerd.status !== 'uitgesteld') {
      e.preventDefault();
      const min = slim.planVoorwaardelijkUitstel(geselecteerd.id, 'op_computer', geselecteerd.subdomein);
      void registreerActieMetOngedaan(
        [geselecteerd],
        'uitgesteld',
        t(`Відкладено (коли відкриєте на ПК): «${geselecteerd.titel.slice(0, 32)}»`, `Uitgesteld (op computer): «${geselecteerd.titel.slice(0, 32)}»`),
        min,
      );
    }
  };

  const behandelKaartStatus = useCallback(
    async (geb: MeldingEcosysteemGebeurtenis, st: MeldingGebeurtenisStatus, min?: number) => {
      if (st === 'archief' || st === 'opgelost' || st === 'uitgesteld') {
        const actieWoord =
          st === 'archief'
            ? t('В архіві', 'In archief')
            : st === 'opgelost'
              ? t('Вирішено', 'Opgelost')
              : t('Відкладено', 'Uitgesteld');
        await registreerActieMetOngedaan([geb], st, `${actieWoord}: «${geb.titel.slice(0, 40)}»`, min);
      } else {
        slim.wisUitstelRegel(geb.id);
        await onStatusWijzigen(geb, st, min);
      }
    },
    [registreerActieMetOngedaan, onStatusWijzigen, slim, lang],
  );

  const behandelVoorwaardelijkUitstel = useCallback(
    (geb: MeldingEcosysteemGebeurtenis, soort: VoorwaardelijkUitstelSoort) => {
      const min = slim.planVoorwaardelijkUitstel(geb.id, soort, geb.subdomein);
      const label = uitstelKeuzeLabel(soort, lang, geb.subdomein);
      void registreerActieMetOngedaan([geb], 'uitgesteld', `${label}: «${geb.titel.slice(0, 34)}»`, min);
    },
    [slim, lang, registreerActieMetOngedaan],
  );

  const behandelKetenActie = useCallback(
    (keten: PulsOorzaakKeten, status: MeldingGebeurtenisStatus, uitstelSoort?: VoorwaardelijkUitstelSoort) => {
      const leden = keten.alleIds.map((id) => alleGebeurtenissenMap.get(id)).filter(Boolean) as MeldingEcosysteemGebeurtenis[];
      if (!leden.length) return;
      let min: number | undefined;
      if (status === 'uitgesteld' && uitstelSoort) {
        for (const lid of leden) {
          min = slim.planVoorwaardelijkUitstel(lid.id, uitstelSoort, lid.subdomein);
        }
      }
      const samenvatting =
        status === 'opgelost'
          ? t(`Ланцюжок (${leden.length}) позначено вирішеним`, `Keten (${leden.length}) als opgelost gemarkeerd`)
          : status === 'uitgesteld'
            ? t(`Ланцюжок (${leden.length}) відкладено за умовою`, `Keten (${leden.length}) voorwaardelijk uitgesteld`)
            : t(`Ланцюжок (${leden.length}) перенесено в архів`, `Keten (${leden.length}) gearchiveerd`);
      void registreerActieMetOngedaan(leden, status, samenvatting, min);
    },
    [alleGebeurtenissenMap, slim, registreerActieMetOngedaan, lang],
  );

  useEffect(() => {
    setGlobaalUitgeklapt(null);
  }, [profiel.standaardUitgeklapt]);

  useEffect(() => {
    if (!open || !onRegistreerAfgeleverd || !stroom.length) return;
    onRegistreerAfgeleverd(stroom);
  }, [open, stroom, onRegistreerAfgeleverd]);

  if (!open && !geo.minimalePil && !modaalBijlage) return null;

  const effectiefAllesOpen = globaalUitgeklapt ?? Boolean(profiel.standaardUitgeklapt);

  const renderLosseKaart = (geb: MeldingEcosysteemGebeurtenis) => (
    <MeldingVeegKaart
      key={geb.id}
      lang={lang}
      gebeurtenis={geb}
      profiel={profiel}
      geselecteerd={isBreed && geselecteerd?.id === geb.id}
      geforceerdOpen={
        spatieOpenId === geb.id
          ? true
          : globaalUitgeklapt !== null
            ? globaalUitgeklapt
            : undefined
      }
      zichtActief={open && !toonVoorkeuren}
      bijlageVoorkeur={profiel.bijlageWeergave}
      onSelect={() => setGeselecteerdId(geb.id)}
      onZichtGelezen={() => {
        if (onRegistreerZichtGelezen) onRegistreerZichtGelezen(geb);
        else if (geb.status === 'nieuw') void behandelKaartStatus(geb, 'gelezen');
      }}
      onStatus={(st, min) => behandelKaartStatus(geb, st, min)}
      onVoorwaardelijkUitstel={(soort) => behandelVoorwaardelijkUitstel(geb, soort)}
      onOntleden={(modus, aanbieder) => onOntleden(geb, modus, aanbieder)}
      onOpenBijlageModaal={(idx) => setModaalBijlage({ gebeurtenis: geb, index: idx })}
    />
  );

  const portalLaag = (
    <>
      {!open && geo.minimalePil && (
        <div
          className='mel-minimale-pil'
          data-no-edge-swipe='1'
          data-testid='mel-minimale-pil'
        >
          <button
            type='button'
            className='mel-pil-hoofd'
            onClick={() => togglePil(false)}
            aria-label={t('Розгорнути екосистему сповіщень', 'Meldingsapp uitklappen')}
          >
            <Bell className={tellers.kritiek > 0 ? 'is-kritiek' : undefined} aria-hidden='true' />
            <span className='mel-pil-tekst'>
              <strong>{subdomeinMenselijkLabel(subdomeinNu, lang)}</strong>
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
            aria-label={t('Прибрати рухому пігулку', 'Zwevende pil verbergen')}
            title={t('Прибрати рухому пігулку', 'Zwevende pil verbergen')}
          >
            <X aria-hidden='true' />
          </button>
        </div>
      )}

      {open && (
        <section
          ref={vensterRef}
          className={`mel-ecosysteem-portaal puls-portaal is-modus-${compactBijBel ? 'kompakt' : geo.modus}${isBreed ? ' is-tweekolom' : ''}${compactBijBel ? ' is-compact-bij-bel' : ''}${isMobielLangscroll ? ' is-mobiel-langscroll' : ''}${
            isMobielLangscroll && typeof document !== 'undefined'
              ? (() => {
                  const bron = document.querySelector('.canonical-chrome') || document.documentElement;
                  for (const k of ['theme-plum-dark', 'theme-plum-light', 'theme-dark', 'theme-light']) {
                    if (bron.classList.contains(k)) return ` ${k}`;
                  }
                  return '';
                })()
              : ''
          }`}
          data-qa-id='canonical-notification-panel'
          data-puls-vorm={compactBijBel ? 'compact' : 'venster'}
          data-mel-langscroll={isMobielLangscroll ? '1' : undefined}
          data-no-edge-swipe='1'
          data-ruimte={ruimte}
          data-subdomein={subdomeinNu}
          role='dialog'
          tabIndex={-1}
          aria-label={t('Екосистема сповіщень', 'Meldingen-ecosysteem')}
          onKeyDown={opPaneelToets}
          style={{
            ['--mel-x' as string]: `${geo.x}px`,
            ['--mel-y' as string]: `${geo.y}px`,
            ['--mel-w' as string]: `${geo.breedte}px`,
            ['--mel-h' as string]: `${geo.hoogte}px`,
            ['--mel-alleen-kop-h' as string]: `${bovenMaten.alleenKop}px`,
            ['--mel-kop-h' as string]: `${bovenMaten.kopMetDnd}px`,
            ['--mel-boven-h' as string]: `${bovenMaten.totaalBoven}px`,
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
            ref={kopRef}
            className='mel-kop puls-kop'
            onPointerDown={startVerplaats}
            onPointerMove={beweegVenster}
            onPointerUp={eindigVensterSleep}
            onPointerCancel={eindigVensterSleep}
          >
            <div className='mel-kop-titel'>
              <span className='mel-kop-badge' aria-hidden='true'>
                <Bell />
              </span>
              <div>
                <strong>{t('Сповіщення', 'Meldingen')}</strong>
                <small>
                  {subdomeinMenselijkLabel(subdomeinNu, lang)}
                  {tellers.nieuw === 0 ? ` · ${t('спокійно', 'alles rustig')}` : ''}
                </small>
              </div>
            </div>

            <div className='mel-kop-gereedschap'>
              <IcoonActieKnop
                className='puls-filter-schakel'
                toon={filterOpen || heeftActiefFilter ? 'actief' : 'standaard'}
                stip={heeftActiefFilter}
                icoon={<Search aria-hidden='true' />}
                label={t('Пошук, канали та звук (клавіша /)', 'Zoeken, kanalen en geluid (toets /)')}
                ariaLabel={t('Пошук і фільтри каналів', 'Zoeken en kanaalfilters')}
                data-qa-id='puls-filter-knop'
                aria-pressed={filterOpen || heeftActiefFilter}
                aria-expanded={filterOpen}
                onClick={() => {
                  setToonVoorkeuren(false);
                  setFilterOpen((v) => {
                    const volgende = !v;
                    if (volgende) requestAnimationFrame(() => zoekInputRef.current?.focus());
                    return volgende;
                  });
                }}
              />

              <IcoonActieKnop
                toon={toonVoorkeuren ? 'actief' : 'standaard'}
                icoon={<SlidersHorizontal aria-hidden='true' />}
                label={t('Швидкі налаштування типів сповіщень', 'Snelle instellingen per soort')}
                ariaLabel={t('Типи сповіщень', 'Soorten meldingen')}
                aria-pressed={toonVoorkeuren}
                onClick={() => setToonVoorkeuren((v) => !v)}
              />

              {onZetNietStoren && (
                <div className='puls-uitstel-anker'>
                  <IcoonActieKnop
                    toon={dndActief ? 'actief' : 'standaard'}
                    icoon={<Moon aria-hidden='true' />}
                    label={t('Не турбувати (безпека все одно проходить)', 'Niet storen (beveiliging blijft zichtbaar)')}
                    ariaLabel={t('Не турбувати', 'Niet storen')}
                    aria-pressed={dndActief}
                    aria-expanded={dndMenuOpen}
                    onClick={() => setDndMenuOpen((v) => !v)}
                  />
                  {dndMenuOpen && (
                    <div className='puls-uitstel-menu puls-dnd-menu' role='menu' onClick={(e) => e.stopPropagation()}>
                      <div className='puls-uitstel-kop'>{t('Режим тиші (без звуку й спливання)', 'Stiltestand (geen geluid of pop-ups)')}</div>
                      {dndActief && (
                        <button
                          type='button'
                          role='menuitem'
                          className='puls-uitstel-optie is-toon-smaragd'
                          onClick={() => {
                            onZetNietStoren(null);
                            setDndMenuOpen(false);
                          }}
                        >
                          <span className='puls-uitstel-icoon' aria-hidden='true'><Bell /></span>
                          <span>{t('Вимкнути «Не турбувати» зараз', '«Niet storen» nu uitzetten')}</span>
                        </button>
                      )}
                      {DND_KEUZES_MIN.map((min) => (
                        <button
                          key={min}
                          type='button'
                          role='menuitem'
                          className='puls-uitstel-optie is-toon-indigo'
                          onClick={() => {
                            onZetNietStoren(min);
                            setDndMenuOpen(false);
                          }}
                        >
                          <span className='puls-uitstel-icoon' aria-hidden='true'><Moon /></span>
                          <span>
                            {min < 60
                              ? t(`На ${min} хвилин`, `${min} minuten`)
                              : min < 480
                                ? t(`На ${min / 60} год`, `${min / 60} uur`)
                                : t('До ранку (8 год)', 'Tot de ochtend (8 uur)')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!compactBijBel && !isMobielLangscroll && (
                <>
                  <IcoonActieKnop
                    className='puls-kop-alleen-pc'
                    toon={geo.modus === 'breed' ? 'actief' : 'standaard'}
                    icoon={<Columns2 aria-hidden='true' />}
                    label={
                      geo.modus === 'breed'
                        ? t('Одна колонка', 'Eén kolom')
                        : t('Дві колонки: список і подробиці поруч', 'Twee kolommen: lijst en details naast elkaar')
                    }
                    ariaLabel={geo.modus === 'breed' ? t('Одна колонка', 'Eén kolom') : t('Дві колонки', 'Twee kolommen')}
                    aria-pressed={geo.modus === 'breed'}
                    onClick={() => pasModusToe(geo.modus === 'breed' ? 'normaal' : 'breed')}
                  />
                  <IcoonActieKnop
                    className='puls-kop-alleen-pc'
                    toon={geo.modus === 'volledig' ? 'actief' : 'standaard'}
                    icoon={geo.modus === 'volledig' ? <Minimize2 aria-hidden='true' /> : <Maximize2 aria-hidden='true' />}
                    label={
                      geo.modus === 'volledig'
                        ? t('Повернути звичайний розмір вікна', 'Terug naar de gewone venstergrootte')
                        : t('На весь екран', 'Volledig scherm')
                    }
                    ariaLabel={geo.modus === 'volledig' ? t('Звичайний розмір', 'Gewone grootte') : t('На весь екран', 'Volledig scherm')}
                    aria-pressed={geo.modus === 'volledig'}
                    onClick={() => pasModusToe(geo.modus === 'volledig' ? 'normaal' : 'volledig')}
                  />

                  <IcoonActieKnop
                    className='puls-kop-alleen-pc'
                    toon={geo.vastgepind ? 'actief' : 'standaard'}
                    icoon={geo.vastgepind ? <Pin aria-hidden='true' /> : <PinOff aria-hidden='true' />}
                    label={
                      geo.vastgepind
                        ? t('Відкріпити вікно', 'Venster losmaken')
                        : t('Закріпити вікно поверх сайту', 'Vastpinnen boven de site')
                    }
                    aria-pressed={geo.vastgepind}
                    onClick={toggleVastpinnen}
                  />

                  <IcoonActieKnop
                    className='puls-kop-alleen-pc'
                    icoon={<Minus aria-hidden='true' />}
                    label={t('Згорнути в рухому кнопку з лічильником', 'Minimaliseren naar zwevende knop met teller')}
                    ariaLabel={t('Згорнути в рухому кнопку', 'Minimaliseren naar zwevende knop')}
                    onClick={() => togglePil(true)}
                  />
                </>
              )}

              {compactBijBel && onOpenVensterModus ? (
                <IcoonActieKnop
                  className='mel-vorm-schakel-icoon'
                  toon='actief'
                  icoon={<AppWindow aria-hidden='true' />}
                  label={t('Розгорнути у широке вікно з інспектором', 'Uitklappen naar breed venster met inspectie')}
                  srTekst={t('Вікно', 'Venster')}
                  data-qa-id='melding-vorm-venster-puls'
                  onClick={openVensterVanuitCompact}
                />
              ) : null}

              <IcoonActieKnop
                className='mel-vorm-schakel-icoon'
                style={compactBijBel && onOpenVensterModus ? { display: 'none' } : undefined}
                icoon={<PanelRightClose aria-hidden='true' />}
                label={t('Компактна панель. Повернутися до вікна — кнопкою «Вікно».', 'Compact paneel bij de bel. Terug met «Venster».')}
                srTekst={t('Компактно', 'Compact')}
                data-qa-id='melding-vorm-compact'
                onClick={onSwitchToClassic}
              />

              <IcoonActieKnop
                icoon={<X aria-hidden='true' />}
                label={t('Закрити', 'Sluiten')}
                aria-label={t('Закрити', 'Sluiten')}
                onClick={onSluiten}
              />
            </div>
          </header>

          {dndActief && nietStorenTot ? (
            <div ref={dndStrookRef} className='puls-dnd-strook' role='status'>
              <Moon aria-hidden='true' />
              <span>
                {t('Не турбувати до ', 'Niet storen tot ')}
                {new Date(nietStorenTot).toLocaleTimeString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {onZetNietStoren ? (
                <button type='button' className='mel-knop mel-knop-zacht' onClick={() => onZetNietStoren(null)}>
                  {t('Вимкнути', 'Uitzetten')}
                </button>
              ) : null}
            </div>
          ) : null}

          {!toonVoorkeuren && (
            <div ref={filtersRef} className='mel-filters puls-filters-slank' data-vlag={MELDING_KAPSEL_AFLEVERING_VLAG}>
              <div className='puls-tabs-rij'>
                <div className='mel-tabs puls-tabs' role='tablist' aria-label={t('Стани подій', 'Gebeurtenisstatus')}>
                  {(
                    [
                      ['actief', t('Увага · Потребують дії', 'Actief · Vragen aandacht'), undefined],
                      [
                        'nieuw',
                        tellers.nieuw > 0
                          ? t(`Нові сповіщення (${tellers.nieuw})`, `Nieuwe meldingen (${tellers.nieuw})`)
                          : t('Нові сповіщення', 'Nieuwe meldingen'),
                        tellers.nieuw > 0 ? tellers.nieuw : undefined,
                      ],
                      [
                        'uitgesteld',
                        tellers.uitgesteld > 0
                          ? t(`Відкладені за умовою (${tellers.uitgesteld})`, `Voorwaardelijk uitgesteld (${tellers.uitgesteld})`)
                          : t('Відкладені за умовою', 'Voorwaardelijk uitgesteld'),
                        tellers.uitgesteld > 0 ? tellers.uitgesteld : undefined,
                      ],
                      ['opgelost', t('Вирішені', 'Opgelost'), undefined],
                      ['archief', t('Спокійний журнал', 'Rustig archief'), undefined],
                      ['alle', t('Усі сповіщення', 'Alle meldingen'), undefined],
                    ] as const
                  ).map(([sleutel, tekst, tabTeller]) => (
                    <IcoonActieKnop
                      key={sleutel}
                      modus='tab'
                      role='tab'
                      toon={statusFilter === sleutel ? 'actief' : 'standaard'}
                      aria-selected={statusFilter === sleutel}
                      className={`mel-tab puls-tab is-tab-${sleutel}${statusFilter === sleutel ? ' is-actief' : ''}`}
                      icoon={<TabIcoon sleutel={sleutel} />}
                      teller={tabTeller}
                      label={tekst}
                      data-qa-id={`puls-tab-${sleutel}`}
                      onClick={() => setStatusFilter(sleutel)}
                    />
                  ))}
                </div>

                <IcoonActieKnop
                  className='puls-alles-klap-knop'
                  toon={effectiefAllesOpen ? 'actief' : 'standaard'}
                  icoon={effectiefAllesOpen ? <ChevronsDownUp aria-hidden='true' /> : <ChevronsUpDown aria-hidden='true' />}
                  label={
                    effectiefAllesOpen
                      ? t('Згорнути всі сповіщення в капсули', 'Alle meldingen inklappen tot capsules')
                      : t('Розгорнути всі сповіщення', 'Alle meldingen uitklappen')
                  }
                  aria-pressed={effectiefAllesOpen}
                  data-qa-id='puls-alles-uitklappen'
                  onClick={() => {
                    setSpatieOpenId('');
                    setGlobaalUitgeklapt(!effectiefAllesOpen);
                  }}
                />
              </div>

              {!filterOpen && (kanaalFilter !== 'alle' || alleenDitSubdomein) && (
                <div className='puls-actieve-filters'>
                  {alleenDitSubdomein && (
                    <button
                      type='button'
                      className='puls-actief-filter-pil'
                      onClick={() => setAlleenDitSubdomein(false)}
                    >
                      <span>{subdomeinMenselijkLabel(subdomeinNu, lang)}</span>
                      <X aria-hidden='true' />
                    </button>
                  )}
                  {kanaalFilter !== 'alle' && (
                    <button
                      type='button'
                      className='puls-actief-filter-pil'
                      onClick={() => setKanaalFilter('alle')}
                    >
                      <span>{kanaalLabel(kanaalFilter, lang)}</span>
                      <X aria-hidden='true' />
                    </button>
                  )}
                </div>
              )}

              <div className='mel-filter-lade' hidden={!filterOpen && !zoek.trim()}>
                <div className='mel-werkbalk'>
                  <label className='mel-zoekveld'>
                    <Search aria-hidden='true' />
                    <input
                      ref={zoekInputRef}
                      type='search'
                      value={zoek}
                      onChange={(e) => setZoek(e.target.value)}
                      placeholder={t('Пошук за заголовком, службою, вкладенням…', 'Zoeken op titel, dienst of bijlage…')}
                    />
                  </label>

                  <div className='mel-werkbalk-knoppen'>
                    <IcoonActieKnop
                      className={laden ? 'is-laden' : undefined}
                      icoon={<RefreshCw className={laden ? 'mel-draai' : undefined} aria-hidden='true' />}
                      label={t('Оновити потік', 'Stroom verversen')}
                      onClick={onVervers}
                    />

                    <IcoonActieKnop
                      toon={sound ? 'actief' : 'standaard'}
                      icoon={sound ? <Volume2 aria-hidden='true' /> : <VolumeX aria-hidden='true' />}
                      label={sound ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')}
                      onClick={onToggleSound}
                    />
                  </div>
                </div>

                <div className='mel-kanaal-chips puls-kanaal-chips'>
                  <button
                    type='button'
                    className={`mel-kanaal-chip puls-chip${alleenDitSubdomein ? ' is-actief' : ''}`}
                    onClick={() => setAlleenDitSubdomein((v) => !v)}
                  >
                    <Sparkles aria-hidden='true' />
                    <span>
                      {alleenDitSubdomein
                        ? t(`Лише: ${subdomeinMenselijkLabel(subdomeinNu, lang)}`, `Alleen: ${subdomeinMenselijkLabel(subdomeinNu, lang)}`)
                        : t(`Розділ: ${subdomeinMenselijkLabel(subdomeinNu, lang)}`, `Onderdeel: ${subdomeinMenselijkLabel(subdomeinNu, lang)}`)}
                    </span>
                  </button>

                  <button
                    type='button'
                    className={`mel-kanaal-chip puls-chip${kanaalFilter === 'alle' ? ' is-actief' : ''}`}
                    onClick={() => setKanaalFilter('alle')}
                  >
                    <Layers aria-hidden='true' />
                    <span>{t('Усі канали', 'Alle kanalen')}</span>
                  </button>

                  {ctx.snelFilters.map((k) => {
                    const ka = kanaalVisueelAnker(k, lang);
                    return (
                      <button
                        key={k}
                        type='button'
                        className={`mel-kanaal-chip puls-chip is-toon-${ka.toon}${kanaalFilter === k ? ' is-actief' : ''}`}
                        onClick={() => setKanaalFilter((cur) => (cur === k ? 'alle' : k))}
                      >
                        {ka.merkSleutel ? <Merk merk={ka.merkSleutel} naam={ka.label} maat={13} vorm='rond' /> : <PulsIcoon soort={ka.icoon} />}
                        <span>{kanaalLabel(k, lang)}</span>
                      </button>
                    );
                  })}

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
            </div>
          )}

          <div className='mel-lichaam mel-inhoud'>
            {toonVoorkeuren ? (
              <div className='mel-voorkeuren-kader'>
                <section className='puls-kapsel-voorkeuren' data-qa-id='puls-kapsel-voorkeuren'>
                  <div className='puls-kapsel-voorkeur-kop'>
                    <strong>{t('Стан карток за замовчуванням та прочитання', 'Standaardweergave van capsules en leesstatus')}</strong>
                    <small>
                      {t(
                        'У згорнутому вигляді сповіщення не створюють візуального шуму, а натиск розгортає подробиці й кнопки.',
                        'Ingeklapte capsules vermijden knoppenruis; één tik klapt details en acties uit.',
                      )}
                    </small>
                  </div>

                  <div className='puls-kapsel-stand-keuze' role='radiogroup' aria-label={t('Стан сповіщень за замовчуванням', 'Standaardstaat van meldingen')}>
                    <button
                      type='button'
                      role='radio'
                      aria-checked={!profiel.standaardUitgeklapt}
                      className={`puls-stand-knop${!profiel.standaardUitgeklapt ? ' is-actief' : ''}`}
                      data-qa-id='puls-standaard-ingeklapt'
                      onClick={() => {
                        setGlobaalUitgeklapt(null);
                        onWerkProfielBij?.((oud) => ({ ...oud, standaardUitgeklapt: false }));
                      }}
                    >
                      <ChevronsDownUp aria-hidden='true' />
                      <span>{t('Згортати в компактні капсули', 'Standaard inklappen tot capsules')}</span>
                    </button>
                    <button
                      type='button'
                      role='radio'
                      aria-checked={Boolean(profiel.standaardUitgeklapt)}
                      className={`puls-stand-knop${profiel.standaardUitgeklapt ? ' is-actief' : ''}`}
                      data-qa-id='puls-standaard-uitgeklapt'
                      onClick={() => {
                        setGlobaalUitgeklapt(null);
                        onWerkProfielBij?.((oud) => ({ ...oud, standaardUitgeklapt: true }));
                      }}
                    >
                      <ChevronsUpDown aria-hidden='true' />
                      <span>{t('Розгортати автоматично', 'Automatisch uitklappen')}</span>
                    </button>
                  </div>

                  <label className='puls-kapsel-auto-lees'>
                    <input
                      type='checkbox'
                      checked={profiel.autoGelezenBijZicht !== false}
                      onChange={(e) => {
                        const aan = e.target.checked;
                        onWerkProfielBij?.((oud) => ({ ...oud, autoGelezenBijZicht: aan }));
                      }}
                    />
                    <span>
                      {t(
                        'Автоматично позначати прочитаним (✓✓) при появі сповіщення на очах',
                        'Automatisch als gelezen markeren (✓✓) zodra de melding in beeld komt',
                      )}
                    </span>
                  </label>
                </section>

                <MeldingModusKiezer lang={lang} />
                <MeldingVoorkeurenPaneel lang={lang} techTypen={techTypen} />

                {techTypen && (
                  <MeldingAfleveringControle lang={lang} ruimte={ruimte} fallbackStroom={stroom} compact />
                )}
              </div>
            ) : (
              <>
                <div className='mel-lijst-kader'>
                  <div
                    ref={lijstRef}
                    id={`mel-lijst-${scope}`}
                    className='mel-stroom-kolom mel-lijst'
                    onScroll={werkScrollStaatBij}
                  >
                    {/* 15-секундне Спокійне зведення у потоці прокручування (не відбирає постійну висоту вікна) */}
                    {statusFilter === 'actief' && !zoek.trim() && rustigOverzicht.toon && (
                      <div className='puls-rustig-overzicht' data-puls-overzicht='1'>
                        <div className='puls-overzicht-tekst'>
                          <strong>{rustigOverzicht.titel}</strong>
                          <span>{rustigOverzicht.subtitel}</span>
                        </div>
                        <button
                          type='button'
                          className='mel-knop puls-knop-overzicht'
                          onClick={() => {
                            const items = rustigOverzicht.achtergrondKlaarIds
                              .map((id) => alleGebeurtenissenMap.get(id))
                              .filter(Boolean) as MeldingEcosysteemGebeurtenis[];
                            void registreerActieMetOngedaan(
                              items,
                              'archief',
                              t(`Згорнуто в спокійний журнал: ${items.length} фонових дій`, `${items.length} achtergrondtaken opgeruimd`),
                            );
                          }}
                        >
                          <CheckCheck aria-hidden='true' />
                          <span>{rustigOverzicht.actieLabel}</span>
                        </button>
                      </div>
                    )}

                    {/* Розумна підказка тиші після 3 закриттів однотипних некритичних подій */}
                    {slim.stilteSuggestie && (
                      <div className='puls-stilte-suggestie' role='status'>
                        <PulsBronTeken
                          anker={{
                            merkSleutel: slim.stilteSuggestie.merkSleutel,
                            icoon: slim.stilteSuggestie.icoon,
                            toon: 'systeem',
                            label: slim.stilteSuggestie.bronLabel,
                          }}
                          maat={28}
                        />
                        <p>{slim.stilteSuggestie.vraagTekst}</p>
                        <div className='puls-actie-groep'>
                          <button type='button' className='mel-knop mel-knop-zacht' onClick={() => slim.sluitStilteSuggestie(true)}>
                            {t('Залишити', 'Behouden')}
                          </button>
                          <button
                            type='button'
                            className='mel-knop mel-knop-primair'
                            onClick={() => {
                              const k = slim.stilteSuggestie?.bronSleutel.split(':')[0] as MeldingKanaal | undefined;
                              if (k && onStilVoorKanaal) onStilVoorKanaal(k);
                              slim.sluitStilteSuggestie(true);
                            }}
                          >
                            <Moon aria-hidden='true' />
                            <span>{t('Тихо в журнал', 'Stil in logboek')}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {stroomEenheden.length === 0 ? (
                      <div className='mel-leeg-staat'>
                        <CheckCircle2 aria-hidden='true' />
                        <strong>{t('Спокій і порядок — активних питань за цим фільтром немає', 'Rust en overzicht — geen openstaande punten voor dit filter')}</strong>
                        <span>
                          {t(
                            'Усі фонові дії збережені у вкладці «Журнал», а жива база типів і правила доступні на /melding.',
                            'Alle achtergrondtaken staan in het archief en het soortenregister staat op /melding.',
                          )}
                        </span>
                      </div>
                    ) : (
                      stroomEenheden.map((eenheid) =>
                        eenheid.soort === 'keten' ? (
                          <PulsOorzaakKetenKaart
                            key={eenheid.keten.sleutel}
                            lang={lang}
                            keten={eenheid.keten}
                            geselecteerd={isBreed && Boolean(geselecteerd && eenheid.keten.alleIds.includes(geselecteerd.id))}
                            standaardUitgeklapt={Boolean(profiel.standaardUitgeklapt)}
                            geforceerdOpen={globaalUitgeklapt !== null ? globaalUitgeklapt : undefined}
                            onSelect={(wortel) => setGeselecteerdId(wortel.id)}
                            onHerstelKeten={behandelKetenActie}
                            renderLosseKaart={renderLosseKaart}
                            alleGebeurtenissenMap={alleGebeurtenissenMap}
                          />
                        ) : (
                          renderLosseKaart(eenheid.gebeurtenis)
                        ),
                      )
                    )}
                  </div>

                  <div
                    ref={schuifSpoorRef}
                    className={`mel-scroll-schuif${scrollStaat.kanScrollen ? ' is-zichtbaar' : ''}${schuifActief ? ' is-actief' : ''}`}
                    data-qa-id='mel-scroll-schuif'
                    data-geen-veeg='1'
                    role='scrollbar'
                    aria-controls={`mel-lijst-${scope}`}
                    aria-orientation='vertical'
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(scrollStaat.voortgang * 100)}
                    aria-hidden={!scrollStaat.kanScrollen}
                    aria-label={t('Повзунок швидкого прокручування списку сповіщень', 'Snelle schuifbalk voor meldingenlijst')}
                    onPointerDown={startSchuifSleep}
                    onPointerMove={beweegSchuifSleep}
                    onPointerUp={eindigSchuifSleep}
                    onPointerCancel={eindigSchuifSleep}
                  >
                    <span
                      className='mel-scroll-duim'
                      style={{
                        height: `${Math.round(scrollStaat.duimHoogtePct * 1000) / 10}%`,
                        top: `${Math.round(scrollStaat.duimTopPct * 1000) / 10}%`,
                      }}
                    />
                  </div>
                </div>

                {isBreed && geselecteerd && geselecteerdVerrijkt && (
                  <aside className='mel-detail-kolom puls-detail-kolom' aria-label={t('Інспектор події', 'Gebeurtenisinspectie')}>
                    <div className='mel-detail-kop puls-detail-kop'>
                      <div className='puls-detail-boven'>
                        <PulsBronTeken anker={geselecteerdVerrijkt.anker} maat={38} />
                        <div>
                          <div className='puls-detail-chips'>
                            <span className='mel-subdomein-chip puls-onderdeel-chip'>
                              <PulsIcoon soort={geselecteerdVerrijkt.anker.icoon} />
                              <span>{subdomeinMenselijkLabel(geselecteerd.subdomein, lang)}</span>
                            </span>
                            {geselecteerdVerrijkt.klimopKernZegel && <PulsKlimopZegel lang={lang} />}
                          </div>
                          <strong>{schoonKaartTitel(geselecteerd.titel)}</strong>
                          {geselecteerd.contextLabel && <small>{geselecteerd.contextLabel}</small>}
                        </div>
                      </div>
                    </div>

                    {geselecteerdKeten && (
                      <div className='puls-detail-keten-kader'>
                        <div className='puls-oorzaak-badge'>
                          <Network aria-hidden='true' />
                          <span>{geselecteerdKeten.samenvatting}</span>
                        </div>
                        <div className='puls-keten-chips'>
                          {geselecteerdKeten.gevolgen.map((gev) => (
                            <PulsDienstChip
                              key={gev.id}
                              merkSleutel={gev.merkSleutel}
                              icoon={gev.icoon}
                              toon={gev.toon}
                              label={gev.label}
                              sub={gev.herstelTekst ? (gev.herstelTekst.startsWith('—') ? gev.herstelTekst : `— ${gev.herstelTekst}`) : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className='puls-x4-emblemen'>
                      {geselecteerdVerrijkt.emblemen.map((emb) => (
                        <div key={emb.vraag} className='puls-x4-cel'>
                          <small>{emb.vraag}</small>
                          <strong>{emb.waarde}</strong>
                        </div>
                      ))}
                    </div>

                    {geselecteerdVerrijkt.mandaat && (
                      <PulsMandaatStraalBlok
                        mandaat={geselecteerdVerrijkt.mandaat}
                        gekozenDuur={detailMandaatDuur}
                        onKiesDuur={setDetailMandaatDuur}
                        lang={lang}
                      />
                    )}

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

          {/* 5-секундна смужка м’якого повернення дії (Ctrl+Z) */}
          {ongedaan && (
            <div className='puls-ongedaan-balk' role='status' data-puls-ongedaan='1'>
              <span>{ongedaan.tekst}</span>
              <button type='button' className='puls-ongedaan-knop' onClick={() => void voerOngedaanUit()}>
                <Undo2 aria-hidden='true' />
                <span>{t(`Повернути · Ctrl+Z (${ongedaanSec} с)`, `Ongedaan maken · Ctrl+Z (${ongedaanSec} s)`)}</span>
              </button>
            </div>
          )}

          <div className='mel-voet puls-voet' role='region' aria-label={t('Дії екосистеми', 'Ecosysteemacties')}>
            <span className='puls-voet-teller'>
              {t(`Подій: ${gefilterd.length}`, `Gebeurtenissen: ${gefilterd.length}`)}
            </span>

            <span className='puls-toets-hints' aria-hidden='true'>
              <kbd>↑↓</kbd> {t('вибір', 'keuze')} · <kbd>{t('Пробіл', 'Spatie')}</kbd> {t('докази', 'bewijs')} · <kbd>/</kbd> {t('пошук', 'zoeken')} · <kbd>E</kbd> {t('архів', 'archief')}
            </span>

            <div className='puls-voet-rechts'>
              <IcoonActieKnop
                icoon={<CheckCheck aria-hidden='true' />}
                disabled={tellers.nieuw === 0}
                label={t('Позначити всі прочитаними', 'Alles als gelezen markeren')}
                data-qa-id='puls-markeer-alle'
                onClick={onMarkAll}
              />
              <IcoonActieKnop
                href={registerHref}
                icoon={<BookOpen aria-hidden='true' />}
                label={t('База всіх типів сповіщень', 'Register van alle meldingssoorten')}
                data-qa-id='puls-open-register'
              />
              <IcoonActieKnop
                href={instellingenHref}
                toon='actief'
                icoon={<Settings aria-hidden='true' />}
                label={t('Правила та налаштування сповіщень', 'Regels en voorkeuren')}
                data-qa-id='puls-open-regels'
              />
            </div>
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
    const portaalWortel = isMobielLangscroll
      ? document.body
      : document.querySelector<HTMLElement>('.canonical-chrome') || document.body;
    return createPortal(portalLaag, portaalWortel);
  }
  return portalLaag;
}
