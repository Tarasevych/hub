// Єдиний портальний центр «Пульт уваги, спокою та дії» у двох розмірах: компактному біля дзвіночка
// та розгорнутому двоколонковому вікні (GEMINI-002 + MELDPANEEL-002).
// Об’єднує перетягування, 8-стороннє змінення розмірів, рухому міні-пігулку, картки зі змахами,
// фірмові логотипи з src/merk/, граф першопричини, 15-секундне спокійне зведення, радіус дії мандата ШІ,
// розумне умовне відкладення, 5-секундне повернення дії (Ctrl+Z), вбудований переглядач вкладень і розбір ШІ.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AppWindow,
  Archive,
  Bell,
  BellDot,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Columns2,
  ExternalLink,
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
import MeldingAiPaneel from './MeldingAiPaneel';
import MeldingBijlageSpeler from './MeldingBijlageSpeler';
import MeldingVeegKaart from './MeldingVeegKaart';

const RANDEN: readonly RandRichting[] = ['n', 'z', 'w', 'o', 'nw', 'no', 'zw', 'zo'];
const DND_KEUZES_MIN = [30, 60, 120, 480] as const;

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
  onStatusWijzigen,
  onOntleden,
  onMarkAll,
  onSwitchToClassic,
  onOpenVensterModus,
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
  const [dndMenuOpen, setDndMenuOpen] = useState(false);
  const [geselecteerdId, setGeselecteerdId] = useState<string>('');
  const [spatieOpenId, setSpatieOpenId] = useState<string>('');
  const [detailMandaatDuur, setDetailMandaatDuur] = useState<'eenmalig' | '15m'>('eenmalig');
  const [detailBijlageIdx, setDetailBijlageIdx] = useState(0);
  const [modaalBijlage, setModaalBijlage] = useState<{ gebeurtenis: MeldingEcosysteemGebeurtenis; index: number } | null>(null);
  const [ongedaan, setOngedaan] = useState<OngedaanMakenStaat | null>(null);
  const [ongedaanSec, setOngedaanSec] = useState(5);
  const vensterRef = useRef<HTMLElement | null>(null);

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

  // MELDINGEN-UX-001: zolang het venster nooit verplaatst is (standaardplek x 24 / y 72), opent het onder de bel, rechts uitgelijnd.
  useEffect(() => {
    if (!open) return;
    const g = profiel.geometrie;
    if (!compactBijBel && (g.modus === 'volledig' || g.x !== 24 || g.y !== 72)) return;
    const bel = document.querySelector<HTMLElement>('.canonical-notification-bell');
    const r = bel?.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return;
    setGeo((h0) => {
      const h = compactBijBel ? { ...h0, breedte: 440, hoogte: 620 } : h0;
      return klemVenster({ ...h, x: r.right - h.breedte, y: r.bottom + 10 }, leesScherm());
    });
  }, [open, compactBijBel, profiel.geometrie]);

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
  }, [open, modaalBijlage, dndMenuOpen, ongedaan, voerOngedaanUit, onSluiten]);

  // Автозакриття при натисканні зовні (коли вікно не закріплене або відкрите компактно біля дзвіночка)
  useEffect(() => {
    if (!open || (geo.vastgepind && !compactBijBel)) return;
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
  }, [open, geo.vastgepind, compactBijBel, onSluiten]);

  const sleepStaat = useRef<{
    soort: 'verplaats' | 'maat';
    richting?: RandRichting;
    pointerId: number;
    startX: number;
    startY: number;
    startGeo: VensterGeometrie;
  } | null>(null);

  const startVerplaats = (e: ReactPointerEvent<HTMLElement>) => {
    if (compactBijBel || e.button > 0 || geo.modus === 'volledig') return;
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
    if (compactBijBel || e.button > 0) return;
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

  const isBreed = !compactBijBel && (geo.modus === 'breed' || geo.modus === 'volledig' || geo.breedte >= 660) && !toonVoorkeuren;
  const instellingenHref = canonicalNavigationUrl('identity', 'melding', lang);
  const dndActief = Boolean(nietStorenTot && nietStorenTot > Date.now());

  const opPaneelToets = (e: ReactKeyboardEvent<HTMLElement>) => {
    const doel = e.target as HTMLElement | null;
    if (doel && /^(INPUT|TEXTAREA|SELECT)$/.test(doel.tagName)) return;
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

  if (!open && !geo.minimalePil && !modaalBijlage) return null;

  const renderLosseKaart = (geb: MeldingEcosysteemGebeurtenis) => (
    <MeldingVeegKaart
      key={geb.id}
      lang={lang}
      gebeurtenis={geb}
      profiel={profiel}
      geselecteerd={isBreed && geselecteerd?.id === geb.id}
      geforceerdOpen={spatieOpenId ? spatieOpenId === geb.id : undefined}
      bijlageVoorkeur={profiel.bijlageWeergave}
      onSelect={() => setGeselecteerdId(geb.id)}
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
          className={`mel-ecosysteem-portaal puls-portaal is-modus-${compactBijBel ? 'kompakt' : geo.modus}${isBreed ? ' is-tweekolom' : ''}${compactBijBel ? ' is-compact-bij-bel' : ''}`}
          data-qa-id='canonical-notification-panel'
          data-puls-vorm={compactBijBel ? 'compact' : 'venster'}
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
            ['--mel-w' as string]: `${compactBijBel ? Math.min(448, Math.max(320, leesScherm().breedte - 16)) : geo.breedte}px`,
            ['--mel-h' as string]: `${compactBijBel ? Math.min(650, Math.max(360, leesScherm().hoogte - 88)) : geo.hoogte}px`,
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
                  {subdomeinMenselijkLabel(subdomeinNu, lang)} ·{' '}
                  {tellers.nieuw > 0
                    ? t(`потребують уваги / нових: ${tellers.nieuw}`, `nieuw: ${tellers.nieuw}`)
                    : t('усе під контролем', 'alles onder controle')}
                </small>
              </div>
            </div>

            <div className='mel-kop-gereedschap'>
              {onZetNietStoren && (
                <div className='puls-uitstel-anker'>
                  <button
                    type='button'
                    className={`mel-ikoon-knop${dndActief ? ' is-actief' : ''}`}
                    aria-pressed={dndActief}
                    aria-expanded={dndMenuOpen}
                    onClick={() => setDndMenuOpen((v) => !v)}
                    title={t('Не турбувати (безпека все одно проходить)', 'Niet storen (beveiliging blijft zichtbaar)')}
                    aria-label={t('Не турбувати', 'Niet storen')}
                  >
                    <Moon aria-hidden='true' />
                  </button>
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

              {!compactBijBel && (
                <>
                  <button
                    type='button'
                    className={`mel-ikoon-knop${geo.modus === 'breed' ? ' is-actief' : ''}`}
                    aria-pressed={geo.modus === 'breed'}
                    onClick={() => pasModusToe(geo.modus === 'breed' ? 'normaal' : 'breed')}
                    title={geo.modus === 'breed' ? t('Одна колонка', 'Eén kolom') : t('Дві колонки: список і подробиці поруч', 'Twee kolommen: lijst en details naast elkaar')}
                    aria-label={geo.modus === 'breed' ? t('Одна колонка', 'Eén kolom') : t('Дві колонки', 'Twee kolommen')}
                  >
                    <Columns2 aria-hidden='true' />
                  </button>
                  <button
                    type='button'
                    className={`mel-ikoon-knop${geo.modus === 'volledig' ? ' is-actief' : ''}`}
                    aria-pressed={geo.modus === 'volledig'}
                    onClick={() => pasModusToe(geo.modus === 'volledig' ? 'normaal' : 'volledig')}
                    title={geo.modus === 'volledig' ? t('Повернути звичайний розмір вікна', 'Terug naar de gewone venstergrootte') : t('На весь екран', 'Volledig scherm')}
                    aria-label={geo.modus === 'volledig' ? t('Звичайний розмір', 'Gewone grootte') : t('На весь екран', 'Volledig scherm')}
                  >
                    {geo.modus === 'volledig' ? <Minimize2 aria-hidden='true' /> : <Maximize2 aria-hidden='true' />}
                  </button>

                  <button
                    type='button'
                    className={`mel-ikoon-knop${geo.vastgepind ? ' is-actief' : ''}`}
                    onClick={toggleVastpinnen}
                    aria-pressed={geo.vastgepind}
                    title={geo.vastgepind ? t('Відкріпити: вікно закриється після натискання поза ним', 'Losmaken: het venster sluit bij een klik erbuiten') : t('Закріпити: вікно лишається відкритим, коли працюєте на сторінці', 'Vastpinnen: het venster blijft open terwijl u op de pagina werkt')}
                    aria-label={geo.vastgepind ? t('Відкріпити вікно', 'Venster losmaken') : t('Закріпити поверх сайту', 'Vastpinnen boven de site')}
                  >
                    {geo.vastgepind ? <Pin aria-hidden='true' /> : <PinOff aria-hidden='true' />}
                  </button>

                  <button
                    type='button'
                    className='mel-ikoon-knop'
                    onClick={() => togglePil(true)}
                    title={t('Згорнути в маленьку рухому кнопку з лічильником', 'Minimaliseren naar een kleine zwevende knop met teller')}
                    aria-label={t('Згорнути в рухому кнопку', 'Minimaliseren naar zwevende knop')}
                  >
                    <Minus aria-hidden='true' />
                  </button>
                </>
              )}

              {compactBijBel && onOpenVensterModus ? (
                <button
                  type='button'
                  className='mel-vorm-schakel'
                  data-qa-id='melding-vorm-venster-puls'
                  onClick={() => {
                    pasModusToe('breed');
                    onOpenVensterModus();
                  }}
                  title={t('Розгорнути цю ж панель у широке вікно з інспектором. Повернутися — кнопкою «Компактно» у вікні.', 'Dit paneel uitklappen naar een breed venster met inspectie. Terug met «Compact» in het venster.')}
                >
                  <AppWindow aria-hidden='true' />
                  <span>{t('Вікно', 'Venster')}</span>
                </button>
              ) : null}

              <button
                type='button'
                className='mel-vorm-schakel'
                style={compactBijBel && onOpenVensterModus ? { display: 'none' } : undefined}
                data-qa-id='melding-vorm-compact'
                onClick={onSwitchToClassic}
                title={t('Показувати сповіщення компактною панеллю біля дзвіночка. Повернутися до вікна — кнопкою «Вікно» в тій панелі.', 'Meldingen tonen als compact paneel bij de bel. Terug naar het venster met de knop «Venster» in dat paneel.')}
              >
                <PanelRightClose aria-hidden='true' />
                <span>{t('Компактно', 'Compact')}</span>
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

          {dndActief && nietStorenTot ? (
            <div className='puls-dnd-strook' role='status'>
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
              <div className='mel-tabs puls-tabs' role='tablist' aria-label={t('Стани подій', 'Gebeurtenisstatus')}>
                {(
                  [
                    ['actief', t('Потребують уваги', 'Vraagt aandacht')],
                    ['nieuw', t(`Нові (${tellers.nieuw})`, `Nieuw (${tellers.nieuw})`)],
                    ['uitgesteld', tellers.uitgesteld > 0 ? t(`За умовою (${tellers.uitgesteld})`, `Op voorwaarde (${tellers.uitgesteld})`) : t('За умовою', 'Op voorwaarde')],
                    ['opgelost', t('Вирішені', 'Opgelost')],
                    ['archief', t('Спокійний журнал', 'Archief')],
                    ['alle', t('Усі', 'Alle')],
                  ] as const
                ).map(([sleutel, tekst]) => (
                  <button
                    key={sleutel}
                    type='button'
                    role='tab'
                    aria-selected={statusFilter === sleutel}
                    className={`mel-tab puls-tab is-tab-${sleutel}${statusFilter === sleutel ? ' is-actief' : ''}`}
                    onClick={() => setStatusFilter(sleutel)}
                  >
                    <TabIcoon sleutel={sleutel} />
                    <span>{tekst}</span>
                  </button>
                ))}
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
          )}

          {/* 15-секундне Спокійне зведення для швидкого очищення фонового шуму в 1 дотик */}
          {!toonVoorkeuren && statusFilter === 'actief' && !zoek.trim() && rustigOverzicht.toon && (
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
          {!toonVoorkeuren && slim.stilteSuggestie && (
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

          <div className='mel-lichaam'>
            {toonVoorkeuren ? (
              <div className='mel-voorkeuren-kader'>
                <MeldingVoorkeurenPaneel lang={lang} techTypen={techTypen} />
              </div>
            ) : (
              <>
                <div className='mel-stroom-kolom'>
                  {stroomEenheden.length === 0 ? (
                    <div className='mel-leeg-staat'>
                      <CheckCircle2 aria-hidden='true' />
                      <strong>{t('Спокій і порядок — активних питань за цим фільтром немає', 'Rust en overzicht — geen openstaande punten voor dit filter')}</strong>
                      <span>
                        {t(
                          'Усі фонові дії збережені у вкладці «Спокійний журнал», а правила доступні на сторінці /melding.',
                          'Alle achtergrondtaken staan in het archief en regels zijn beschikbaar op /melding.',
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
                          <strong>{geselecteerd.titel}</strong>
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
                              sub={gev.herstelTekst}
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
            <button
              type='button'
              className='mel-knop mel-knop-zacht'
              disabled={tellers.nieuw === 0}
              onClick={onMarkAll}
            >
              <CheckCheck aria-hidden='true' />
              <span>{t('Позначити все прочитаним', 'Alles als gelezen')}</span>
            </button>

            <span className='puls-toets-hints' aria-hidden='true'>
              <kbd>↑↓</kbd> {t('вибір', 'keuze')} · <kbd>{t('Пробіл', 'Spatie')}</kbd> {t('докази', 'bewijs')} · <kbd>S</kbd> {t('умова', 'uitstel')} · <kbd>E</kbd> {t('архів', 'archief')}
            </span>

            <a href={instellingenHref} className='mel-knop mel-knop-primair'>
              <ExternalLink aria-hidden='true' />
              <span>{t('Усі правила (/melding)', 'Alle regels (/melding)')}</span>
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
