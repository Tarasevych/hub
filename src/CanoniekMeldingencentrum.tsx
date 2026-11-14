import { ArrowLeft, Bell, CheckCheck, ChevronDown, CircleCheck, Clock3, Cloud, Database, Ellipsis, History, Info, List, Mail, Minimize2, RefreshCw, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, TriangleAlert, Undo2, Users, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readSharedPreferences, writeSharedPreferences } from './gedeelde-voorkeuren';
import {
  CANONICAL_NOTICE_EVENT, MELDINGEN_OPENEN_EVENT, SAMENVOEG_MS, isBronDuplicaat, losOpEerdere, popupLevensduurMs, registerCanonicalNoticeAction, releaseCanonicalNoticeAction,
  samenvoegDoel, samenvoegSleutel, uniekOpId, voegHerhalingToe, type CanonicalNoticeAction, type CanonicalNoticeDetailIcon, type CanonicalNoticeInput, type CanonicalNoticeKind,
  type CanonicalServerNotification, type RecentePopup,
} from './canoniek-meldingen';
import './canoniek-meldingencentrum.css';
import { historyKey, leesOpslag, normalizeDetails, normalizeLink, readRows, werkRijenBij, type BewaardeRij } from './meldingen/lokale-rijen';
import { fractie, gepauzeerd, klaar, nieuweAftelling, pauze as pauzeAftelling, tik as tikAftelling, verleng, type Aftelling, type PauzeBron } from './meldingen/aftelling';
// UI-007 (29.10.2026): vlag `meldingen-v2` (standaard UIT) — compact aandachtscentrum in hetzelfde paneel; zonder vlag alles zoals het was.
import MeldingenV2 from './meldingen/v2/MeldingenV2';
import { useMeldingenV2, meldingenV2Nu } from './meldingen/v2/vlag';
import { useLeverRegels, nietStorenActief, regelsNu } from './meldingen/v2/regels-opslag';
import { geldendeRegel } from '../shared/meldingen-v2/beleid';
import { dienstVan } from './meldingen/v2/omzetten';
import { bouwModel } from './meldingen/v2/model';
import { useStatusStand, wijzigStatus } from './meldingen/v2/status-opslag';
import { pasStatusToe } from '../shared/meldingen-v2/status';
import NotificationPanelBody from './MeldingenpaneelInhoud';
import { sectieLink, useConnectorActivity } from './connector-activiteit';
import { activiteitenVanSfeer, type MeldingSfeer } from '../shared/meldingen-soorten';
import { zetTechActiviteit } from './meldingen/tech-meldingen-opslag';
import { pijlNaarBel, placeNear, zonderDok, type Pijl } from './melding-positie';
import { zichtbaarKader, volgKader } from './platform/vast-kader';
import { styleOf } from './melding-stijl';
// 25.10.2026: de bel staat in een ZONE van de pagina (shared/plaatsing.ts) — standaard rechts van de foto (computer: bovenbalk; telefoon:
// kop van het menu). Geen eigen positie (x,y) meer vanaf de hoek van het scherm, geen eigen slepen: <Plek> en src/plaatsing/plaats-slepen.ts.
import { Plek } from './plaatsing/Plek';
import { plaatsStaat, usePlaatsStaat, zetBelTeller } from './plaatsing/plaatsing-staat';
import { terugzetten } from '../shared/plaatsing';
import { zetZijbalk } from './zijbalk-voorkeuren';
import { focusbaar, focusVerloren, houdTab, menuToets } from './platform/toegankelijk';
import './toegankelijk.css';
// Per type geluid/pop-up/tonen/blijft staan/duur (shared/melding-typen.ts) en de ene regel naar het technische paneel (shared/melding-soorten.ts).
import { isKritiekType, typeInfo, voorkeurVoor, type MeldingType, type TypeVoorkeur } from '../shared/melding-typen';
import { itemVanLink } from '../shared/menu-meldingen';
import { soortInfo, typeVanBron } from '../shared/melding-soorten';
import MeldingVoorkeurenPaneel from './meldingen/MeldingVoorkeurenPaneel';
import { openTechMeldingen } from './meldingen/tech-meldingen-opslag';
import { techSamenvattingTekst } from './meldingen/samenvatting';
import { useTech } from './tech/tech-opslag';
import { useHuidigeRuimte, ruimteFilterActief } from './tech/ruimtes/ruimte-signaal';

type Retained = BewaardeRij;

type Active = CanonicalNoticeInput & {
  id: string;
  kind: CanonicalNoticeKind;
  createdAt: number;
  expanded: boolean;
  origin: 'prop' | 'event';
  stil?: boolean;
  /** Hoe lang de pop-up staat in ms; null = blijft staan tot u sluit. */
  levensduurMs: number | null;
  /** Bij een servermelding: die wordt gelezen zodra de pop-up op het scherm staat. */
  serverId?: string;
};

type Props = {
  lang: 'uk' | 'nl';
  scope: string;
  notice?: CanonicalNoticeInput | null;
  serverItems?: CanonicalServerNotification[];
  onDismissNotice?: (text: string) => void;
  onReadServer?: (id: string) => void | Promise<void>;
  onReadAllServer?: () => void | Promise<void>;
  /** Keuzes per type (zijbalk.meldingen.soorten). */
  typen?: Partial<Record<MeldingType, TypeVoorkeur>>;
  /** Alleen in de accountruimte: technische serverMeldingen (de server levert ze alleen met technisch profiel) → één regel + geluid/opduiken. */
  techItems?: CanonicalServerNotification[];
  /** 22.10.2026: sfeer van DEZE bel (shared/meldingen-soorten.ts): de bel toont alleen activiteiten van haar eigen sfeer; technische gaan naar het paneel in de band. */
  sfeer?: MeldingSfeer;
};

/**
 * Uitleg als een fout of waarschuwing geen eigen uitleg meegeeft: de melding blijft niet zonder richting. INTEG-001: met het onderdeel erin
 * (waar u het oplost) en de knop eronder, niet het algemene «відкрийте розділ».
 */
const uitlegStandaard = (lang: 'uk' | 'nl', onderdeel: string): string => (lang === 'uk'
  ? `Що зробити: спробуйте ще раз у розділі «${onderdeel}»; якщо збій повториться, перевірте там підключення та вхід. Подробиці — у панелі сповіщень.`
  : `Wat nu: probeer het opnieuw in «${onderdeel}»; blijft het mislukken, controleer daar de koppeling en de aanmelding. Details staan in het meldingenpaneel.`);

const DETAIL_ICON_COMPONENTS: Record<CanonicalNoticeDetailIcon, typeof Info> = {
  scope: ShieldCheck, query: Search, server: Database, provider: Mail, results: List, durable: History, request: Cloud, saved: Save, cursor: RefreshCw, duration: Clock3, accounts: Users, error: TriangleAlert,
};

/** Lagen met een eigen Esc-afhandeling: zit de focus daarin (of op een menu-item waarvan de «bel» open staat), dan laat het paneel Esc aan hen (één Esc = één laag). */
const ANDERE_ESC_LAGEN = '.menu-bellen,.plaats-acties,.menu-acties,.zk-uitklap,[role="menu"],[role="listbox"]';

export default function CanonicalNotificationCenter(p: Props) {
  const v2 = useMeldingenV2();
  const v2Regels = useLeverRegels(v2);
  // INTEG-001: de blijvende status (archief, opgelost) geldt nu voor elk paneel, niet alleen met de vlag meldingen-uitleg-v3: «Очистити»
  // en «Архів» moeten overal werken. Alleen voor een aangemeld account (anders is er geen server-status).
  const v3Status = useStatusStand(!!p.scope && p.scope !== 'anon');
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const formatTime = (value: number) => new Date(value).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE');
  const prefs = readSharedPreferences();
  const belPlek = usePlaatsStaat().indeling.plek.bel || '';
  const [sound, setSound] = useState(prefs.notificationSound !== false);
  const [retained, setRetained] = useState<Retained[]>(() => readRows(p.scope));
  const [active, setActive] = useState<Active | null>(null);
  /** Pop-up staat stil (muis erop, vinger erop op het aanraakscherm, toetsenbordfocus erin of tabblad verborgen): de aftelling stopt. */
  const [paused, setPaused] = useState(false);
  const [vastgehoudenMetAanraking, setVastgehoudenMetAanraking] = useState(false);
  const [balkSegment, setBalkSegment] = useState<{ versie: number; duur: number; verstreken: number }>({ versie: 0, duur: 2000, verstreken: 0 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [instellingen, setInstellingen] = useState(false);
  const [meer, setMeer] = useState(false);
  const meerRef = useRef(false);
  const meerKnopRef = useRef<HTMLButtonElement | null>(null);
  const tech = useTech();
  const ruimteNu = useHuidigeRuimte();
  const typenRef = useRef(p.typen);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; maxHeight?: number }>({ left: 8, top: 8 });
  const toastRef = useRef<HTMLElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const [toastPos, setToastPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const [viewportRev, setViewportRev] = useState(0);
  const activeRef = useRef<Active | null>(null);
  const queueRef = useRef<Active[]>([]);
  const retainedRef = useRef<Retained[]>(retained);
  /** Aftelling van de pop-up die nu staat (null = blijft staan tot u sluit). */
  const aftelRef = useRef<Aftelling | null>(null);
  const laatsteTikRef = useRef(0);
  const aanrakingActiefRef = useRef(false);
  const heeftTouchEventRef = useRef(false);
  const laatsteAanrakingMsRef = useRef(0);
  /** Tijdelijke meldingen (uit de activiteit en de server): dezelfde melding krijgt binnen het venster maar één pop-up. */
  const toastRecentRef = useRef(new Map<string, number>());
  /** Pop-ups van de laatste minuten (sectie, soort, bron): één gebeurtenis uit twee bronnen → één pop-up (isBronDuplicaat). */
  const recentePopups = useRef<RecentePopup[]>([]);
  const lastProp = useRef('');
  const unlocked = useRef(false);
  const serverKnown = useRef<Set<string> | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const soundRef = useRef(sound);
  const propsRef = useRef(p);
  propsRef.current = p;
  const activity = useConnectorActivity(p.scope, p.lang, (notice) => receiveRef.current(notice, 'event'));
  const activityRef = useRef(activity);
  activityRef.current = activity;

  /* 22.10.2026: technische activiteiten (beheer, uitrol, diagnose, SIEM, звірка, AI in het technische profiel) horen NIET in deze bel maar in «Технічні сповіщення» in de band. */
  useEffect(() => {
    zetTechActiviteit(activiteitenVanSfeer(activity.events, 'technisch'), activity.read, activity.markRead);
  }, [activity.events, activity.read, activity.markRead]);

  /* ---------- Opslag van de lijst (altijd via de ref, zodat herhalingen elkaar direct zien) ---------- */

  /* De opslag is de bron van waarheid (gedeeld door de tabbladen van dit subdomein); het geheugen is alleen een kopie. Elke wijziging
     begint dus bij wat er NU in de opslag staat, zodat wat een ander tabblad las of wiste niet terugkomt. Zonder bruikbare opslag: het geheugen. */
  const opslagOk = useRef(true);
  const saveRetained = (updater: (rows: Retained[]) => Retained[]) => {
    const { rijen, opslagOk: ok } = werkRijenBij(p.scope, retainedRef.current, updater, opslagOk.current);
    retainedRef.current = rijen;
    setRetained(rijen);
    opslagOk.current = ok;
  };
  const markRetainedReadMany = (ids: string[]) => {
    const want = new Set(ids);
    if (!retainedRef.current.some((row) => want.has(row.id) && !row.read)) return;
    saveRetained((rows) => rows.map((row) => (want.has(row.id) ? { ...row, read: true } : row)));
  };
  const markRetainedRead = (id: string) => markRetainedReadMany([id]);

  const playChime = () => {
    if (meldingenV2Nu() && nietStorenActief()) return;
    if (!soundRef.current || !(unlocked.current || navigator.userActivation?.hasBeenActive)) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      gain.connect(ctx.destination);
      for (const [freq, delay] of [[660, 0], [880, 0.075]] as const) {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.type = 'sine';
        osc.connect(gain);
        osc.start(now + delay);
        osc.stop(now + delay + 0.13);
      }
      setTimeout(() => void ctx.close(), 400);
    } catch { /* geen geluid beschikbaar */ }
  };

  /* ---------- Pop-up ---------- */

  /**
   * Wat de gebruiker in de pop-up gezien heeft, telt als gelezen — ook de regel in het paneel (lokaal, server of activiteit).
   * INTEG-001: een pop-up over een activiteit maakte die activiteit vroeger niet gelezen: na de pop-up stond ze nog eens als «нова» in
   * het paneel en in de bel. Staat het tabblad op de achtergrond, dan pas zodra het weer zichtbaar is (niemand heeft het toen gezien).
   */
  const leesWachtend = useRef<Active | null>(null);
  const markeerGetoond = (next: Active) => {
    if (typeof document !== 'undefined' && document.hidden) { leesWachtend.current = next; return; }
    leesWachtend.current = null;
    if (!next.transient) markRetainedRead(next.id);
    const serverId = next.serverId || (next.meldingId?.startsWith('s:') ? next.meldingId.slice(2) : '');
    if (serverId) void propsRef.current.onReadServer?.(serverId);
    if (next.meldingId?.startsWith('a:')) activityRef.current.markRead(next.meldingId.slice(2));
  };

  /** Toon de pop-up. Wat op het scherm staat, telt als gelezen (ook zonder klik). */
  const activate = (next: Active) => {
    activeRef.current = next;
    aanrakingActiefRef.current = false;
    setVastgehoudenMetAanraking(false);
    laatsteTikRef.current = Date.now();
    aftelRef.current = next.levensduurMs == null ? null : pauzeAftelling(nieuweAftelling(next.levensduurMs), 'verborgen', typeof document !== 'undefined' && document.hidden);
    setPaused(!!aftelRef.current && gepauzeerd(aftelRef.current));
    setBalkSegment({ versie: 0, duur: next.levensduurMs ?? 2000, verstreken: 0 });
    setActive(next);
    if (!next.stil) playChime();
    markeerGetoond(next);
  };

  const vk = (type: MeldingType) => voorkeurVoor(typenRef.current, type);

  /**
   * Een losse melding. Herhaling van dezelfde melding binnen het venster wordt één regel met een teller en géén nieuwe pop-up.
   * Een gelukte stap lost eerdere fouten met hetzelfde onderwerp op.
   */
  const receive = (notice: CanonicalNoticeInput, origin: 'prop' | 'event', opties: { type?: MeldingType; geluid?: boolean; serverId?: string } = {}) => {
    const tekst = notice.text.trim();
    if (!tekst) return;
    const type = opties.type ?? notice.type ?? typeVanBron(notice.source);
    const kind: CanonicalNoticeKind = notice.kind || 'info';
    const nu = Date.now();
    const sectie = styleOf(notice.source || '', propsRef.current.lang).section;
    const basis = vk(type);
    // INTEG-001 (oude fout): «Не турбувати» beloofde «без звуку й спливних вікон», maar alleen het geluid zweeg. Nu ook geen pop-up
    // (beveiliging blijft opduiken). En één gebeurtenis die uit twee bronnen binnenkomt (dienst + serveractiviteit) krijgt één pop-up.
    const dnd = meldingenV2Nu() && nietStorenActief() && !isKritiekType(type);
    // Meldingen v2: een regel «Тихе»/«Вимкнене» voor deze bron maakt het stiller (geen pop-up, geen geluid); beveiliging nooit.
    const regel = meldingenV2Nu() ? geldendeRegel(regelsNu(), { dienst: dienstVan(notice.source || ''), categorie: String(notice.source || '').toLowerCase() }) : null;
    const regelStil = !!regel && (regel.modus === 'stil' || regel.modus === 'uit') && !isKritiekType(type);
    const dubbel = !notice.voorbeeld && isBronDuplicaat(recentePopups.current, { sectie, kind, transient: !!notice.transient }, nu);
    const voorkeur = { ...basis, opduiken: basis.opduiken && !dnd && !dubbel && !regelStil && !notice.alleenPaneel };
    const geluid = (opties.geluid ?? voorkeur.geluid) && !dubbel && !regelStil && !notice.alleenPaneel;
    if (!voorkeur.tonen) {
      if (origin === 'prop') propsRef.current.onDismissNotice?.(tekst);
      return;
    }
    const explain = notice.explain?.trim() || (kind === 'error' || kind === 'warning' ? uitlegStandaard(propsRef.current.lang, styleOf(notice.source || '', propsRef.current.lang).label) : undefined);
    const groep = notice.action ? undefined : samenvoegSleutel(notice.source || '', kind, tekst);
    // Een gelukte stap lost eerdere fouten met hetzelfde onderwerp op, ook als deze melding zelf geen pop-up krijgt.
    if (notice.topic && kind === 'success') saveRetained((rijen) => losOpEerdere(rijen, notice.topic!));

    if (notice.transient && !notice.voorbeeld) {
      // Activiteit en servermeldingen: dezelfde melding binnen het venster geeft maar één pop-up.
      const sleutel = groep || tekst;
      const laatst = toastRecentRef.current.get(sleutel);
      if (laatst && nu - laatst < SAMENVOEG_MS) return;
      toastRecentRef.current.set(sleutel, nu);
      if (toastRecentRef.current.size > 100) toastRecentRef.current.delete(toastRecentRef.current.keys().next().value as string);
    } else if (groep && !notice.transient) {
      // Herhaling: één regel met een teller, geen nieuwe pop-up. Al gelezen → blijft gelezen (ook na uren, zie GEZIEN_VENSTER_MS).
      const bestaand = samenvoegDoel(leesOpslag(propsRef.current.scope) ?? retainedRef.current, groep, nu, notice.dedupeSeconds ? notice.dedupeSeconds * 1000 : SAMENVOEG_MS);
      if (bestaand) {
        saveRetained((rijen) => voegHerhalingToe(rijen, bestaand.id, nu));
        if (origin === 'prop') propsRef.current.onDismissNotice?.(tekst);
        return;
      }
    }

    const id = `notice-${nu}-${Math.random().toString(36).slice(2)}`;
    const link = normalizeLink(notice.link);
    if (notice.action) registerCanonicalNoticeAction(id, notice.action);
    if (!notice.transient) {
      saveRetained((rijen) => [{
        id, text: tekst, kind, createdAt: nu, source: notice.source || '', read: false, ...(notice.action ? { heeftActie: true } : {}),
        ...(notice.details?.length ? { details: normalizeDetails(notice.details) } : {}), ...(link ? { link } : {}),
        action: notice.action, actionExpiresAt: notice.actionExpiresAt, explain, groep, onderwerp: notice.topic, count: 1,
        ...(notice.context?.trim() ? { context: notice.context.trim().slice(0, 200) } : {}),
      }, ...rijen.filter((row) => row.id !== id)]);
    }

    const next: Active = {
      ...notice, text: tekst, explain, id, kind, createdAt: nu, expanded: false, origin, stil: !geluid,
      levensduurMs: popupLevensduurMs(voorkeur, tekst, explain, kind), serverId: opties.serverId,
      meldingId: notice.meldingId ?? (notice.transient ? (opties.serverId ? `s:${opties.serverId}` : undefined) : `l:${id}`),
    };
    if (voorkeur.opduiken) recentePopups.current = [...recentePopups.current.filter((r) => nu - r.t <= 120_000), { sectie, kind, transient: !!notice.transient, t: nu }].slice(-20);
    if (!voorkeur.opduiken) {
      // Geen pop-up voor dit type: wel het geluid (als het type dat wil) en de regel in de lijst.
      if (origin === 'prop') propsRef.current.onDismissNotice?.(tekst);
      if (geluid) playChime();
      return;
    }
    if (activeRef.current) {
      if (next.action && !activeRef.current.action) {
        activeRef.current = null;
        setActive(null);
        requestAnimationFrame(() => activate(next));
      } else {
        queueRef.current.push(next);
        if (queueRef.current.length > 6) queueRef.current.splice(0, queueRef.current.length - 6);
      }
    } else {
      activate(next);
    }
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  const showNext = () => {
    const queued = queueRef.current.shift();
    if (!queued) return;
    const next = queued.action && queued.actionExpiresAt && queued.actionExpiresAt <= Date.now() ? { ...queued, action: undefined, actionExpiresAt: undefined } : queued;
    requestAnimationFrame(() => activate(next));
  };

  const dismiss = () => {
    const current = activeRef.current;
    if (!current) return;
    if (current.origin === 'prop') propsRef.current.onDismissNotice?.(current.text);
    activeRef.current = null;
    setActive(null);
    showNext();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  /** Muis erop, vinger op de melding, toetsenbordfocus erin of tabblad verborgen: de aftelling staat stil; loslaten telt vloeiend verder. */
  const pauzeer = (bron: PauzeBron, aan: boolean) => {
    const huidig = aftelRef.current;
    if (!huidig) return;
    const nu = Date.now();
    const bijgewerkt = !gepauzeerd(huidig) && laatsteTikRef.current > 0
      ? tikAftelling(huidig, Math.max(0, nu - laatsteTikRef.current))
      : huidig;
    laatsteTikRef.current = nu;
    const overVoor = bijgewerkt.over;
    const volgende = pauzeAftelling(bijgewerkt, bron, aan);
    aftelRef.current = volgende;
    if (barRef.current) barRef.current.style.transform = `scaleX(${fractie(volgende)})`;
    if (volgende.over !== overVoor) {
      setBalkSegment((s) => ({ versie: s.versie + 1, duur: volgende.totaal, verstreken: Math.max(0, volgende.totaal - volgende.over) }));
    }
    setPaused(gepauzeerd(volgende));
    setVastgehoudenMetAanraking(volgende.pauzes.includes('aanraking'));
  };
  const pauzeerRef = useRef(pauzeer);
  pauzeerRef.current = pauzeer;

  const heeftAanrakingOpToast = (touches: ArrayLike<{ clientX: number; clientY: number; target?: EventTarget | null }>): boolean => {
    const el = toastRef.current;
    if (!el || !el.isConnected || touches.length === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      for (let i = 0; i < touches.length; i += 1) {
        const doel = touches[i]?.target;
        if (doel && typeof Node !== 'undefined' && doel instanceof Node && el.contains(doel)) return true;
      }
      return false;
    }
    for (let i = 0; i < touches.length; i += 1) {
      const punt = touches[i];
      if (punt && punt.clientX >= r.left && punt.clientX <= r.right && punt.clientY >= r.top && punt.clientY <= r.bottom) return true;
    }
    return false;
  };

  /** Uitklappen geeft weer de volle tijd (balk weer vol), maar pauzeert niet voor altijd: zonder muis of vinger erop verdwijnt zij daarna. */
  const toggleExpanded = () => {
    const current = activeRef.current;
    if (!current) return;
    const next = { ...current, expanded: !current.expanded };
    activeRef.current = next;
    setActive(next);
    if (next.expanded && aftelRef.current && current.levensduurMs != null) {
      laatsteTikRef.current = Date.now();
      const verlengd = verleng(aftelRef.current, current.levensduurMs);
      aftelRef.current = verlengd;
      if (barRef.current) barRef.current.style.transform = 'scaleX(1)';
      setBalkSegment((s) => ({ versie: s.versie + 1, duur: verlengd.totaal, verstreken: Math.max(0, verlengd.totaal - verlengd.over) }));
    }
  };

  const runAction = async (id: string, action: CanonicalNoticeAction, closeToast = false) => {
    markRetainedRead(id);
    try {
      await action.onAction();
      releaseCanonicalNoticeAction(id);
      saveRetained((rows) => rows.map((item) => (item.id === id ? { ...item, read: true, action: undefined, actionExpiresAt: undefined, heeftActie: false } : item)));
      const current = activeRef.current;
      if (current?.id === id) {
        const next = { ...current, action: undefined, actionExpiresAt: undefined };
        activeRef.current = next;
        setActive(next);
        if (closeToast) dismiss();
      }
    } catch { /* de actie meldt zelf wat er misging */ }
  };

  typenRef.current = p.typen;
  meerRef.current = meer;

  useEffect(() => { if (!panelOpen) { setInstellingen(false); setMeer(false); } }, [panelOpen]);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  // Aftelling van de pop-up: de CSS-balk loopt vloeiend en stopt synchroon op animation-play-state: paused; voor verminderde beweging
  // zet deze klok ook rechtstreeks scaleX. Pauze, verlengen en de tijd na een pauze staan in src/meldingen/aftelling.ts.
  useEffect(() => {
    if (barRef.current) barRef.current.style.transform = 'scaleX(1)';
    if (!active || active.levensduurMs == null) return;
    laatsteTikRef.current = Date.now();
    const timer = window.setInterval(() => {
      const nu = Date.now();
      const a = aftelRef.current;
      if (!a) return;
      const vorige = laatsteTikRef.current || nu;
      aftelRef.current = tikAftelling(a, nu - vorige);
      laatsteTikRef.current = nu;
      if (klaar(aftelRef.current)) { window.clearInterval(timer); dismissRef.current(); return; }
      if (barRef.current) barRef.current.style.transform = `scaleX(${fractie(aftelRef.current)})`;
    }, 40);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  // Aanraakscherm: vinger rechtstreeks op de melding plaatsen OF met de vinger over het scherm naar het meldingsvlak schuiven en vasthouden.
  // Zolang een vinger binnen de rechthoek van de melding blijft, staat 'aanraking' op pauze — ook als de browser pointercancel stuurt.
  useEffect(() => {
    if (!active || active.levensduurMs == null || typeof document === 'undefined') {
      aanrakingActiefRef.current = false;
      return;
    }
    const bijAanraking = (event: TouchEvent) => {
      heeftTouchEventRef.current = true;
      const opToast = heeftAanrakingOpToast(event.touches);
      if (opToast) {
        laatsteAanrakingMsRef.current = Date.now();
        if (!aanrakingActiefRef.current) {
          aanrakingActiefRef.current = true;
          pauzeerRef.current('aanraking', true);
        }
      } else if (aanrakingActiefRef.current) {
        laatsteAanrakingMsRef.current = Date.now();
        aanrakingActiefRef.current = false;
        pauzeerRef.current('aanraking', false);
      }
    };
    const losBijVerlies = () => {
      if (aanrakingActiefRef.current) {
        aanrakingActiefRef.current = false;
        pauzeerRef.current('aanraking', false);
      }
    };
    document.addEventListener('touchstart', bijAanraking, { passive: true, capture: true });
    document.addEventListener('touchmove', bijAanraking, { passive: true, capture: true });
    document.addEventListener('touchend', bijAanraking, { passive: true, capture: true });
    document.addEventListener('touchcancel', bijAanraking, { passive: true, capture: true });
    window.addEventListener('blur', losBijVerlies);
    return () => {
      document.removeEventListener('touchstart', bijAanraking, true);
      document.removeEventListener('touchmove', bijAanraking, true);
      document.removeEventListener('touchend', bijAanraking, true);
      document.removeEventListener('touchcancel', bijAanraking, true);
      window.removeEventListener('blur', losBijVerlies);
    };
  }, [active?.id, active?.levensduurMs]);

  // Tabblad verborgen: de aftelling staat stil (niemand kan lezen); weer zichtbaar: telt door, en wat toen op het scherm stond telt als gelezen.
  const zichtRef = useRef(() => undefined as void);
  zichtRef.current = () => {
    pauzeer('verborgen', document.hidden);
    if (!document.hidden && leesWachtend.current && leesWachtend.current.id === activeRef.current?.id) markeerGetoond(leesWachtend.current);
  };
  useEffect(() => {
    const zicht = () => zichtRef.current();
    document.addEventListener('visibilitychange', zicht);
    return () => document.removeEventListener('visibilitychange', zicht);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    /* 25.10.2026: in de vangfase (vóór de lade): Esc sluit eerst het paneel — de lade (waar de bel op de telefoon staat) blijft open en de focus gaat terug naar de bel */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      /* 25.10.2026: staat de focus in een ANDERE laag met een eigen Esc, dan sluit Esc eerst die laag — niet tegelijk ook het paneel (stand a11y-meldingen) */
      const doel = event.target instanceof Element ? event.target : null;
      /* UI-007 meldingen-v2: een open laag in het paneel (zoeken, filters, menu, regels) sluit eerst zichzelf */
      if (doel?.closest('[data-mv2-esc]')) return;
      if (doel && !doel.closest('.canonical-notification-panel') && (doel.closest(ANDERE_ESC_LAGEN) || (doel.closest('[data-heeft-bellen]') && document.querySelector('.menu-bellen')))) return;
      event.preventDefault();
      if (meerRef.current) { setMeer(false); meerKnopRef.current?.focus(); return; }
      setPanelOpen(false);
      bellRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [panelOpen]);

  /* WCAG 2.4.3 (recensie toegankelijkheid 21.10): bij openen gaat de focus IN het paneel, bij sluiten terug naar de bel — behalve als de mens elders klikte. */
  useEffect(() => {
    if (!panelOpen) return;
    const paneel = panelRef.current;
    const r = requestAnimationFrame(() => { if (paneel && !paneel.contains(document.activeElement)) paneel.focus({ preventScroll: true }); });
    return () => { cancelAnimationFrame(r); if (focusVerloren()) bellRef.current?.focus({ preventScroll: true }); };
  }, [panelOpen]);

  /* «⋯» open (telefoon) → de eerste actie krijgt de focus: het menu staat onderaan in de DOM, Tab landde eerst in alle rijen. */
  useEffect(() => {
    if (!meer) return;
    const r = requestAnimationFrame(() => focusbaar(document.getElementById('cnc-acties'))[0]?.focus());
    return () => cancelAnimationFrame(r);
  }, [meer]);

  useEffect(() => {
    const rows = readRows(p.scope);
    retainedRef.current = rows;
    setRetained(rows);
    serverKnown.current = null;
    opslagOk.current = true;
    /* Een ander tabblad (zelfde subdomein) wijzigde de lijst: meteen overnemen — gelezen, opgelost en verwijderd blijven zo gelijk. */
    const opOpslag = (event: StorageEvent) => {
      if (event.key !== historyKey(p.scope)) return;
      const vers = readRows(p.scope);
      retainedRef.current = vers;
      setRetained(vers);
    };
    window.addEventListener('storage', opOpslag);
    return () => window.removeEventListener('storage', opOpslag);
  }, [p.scope]);

  useEffect(() => {
    const unlock = () => { unlocked.current = true; };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => receiveRef.current((event as CustomEvent<CanonicalNoticeInput>).detail, 'event');
    window.addEventListener(CANONICAL_NOTICE_EVENT, handler);
    // INTEG-001: «Усі сповіщення» in het venster bij een stip in het menu opent het paneel aan de bel.
    const openen = () => setPanelOpen(true);
    window.addEventListener(MELDINGEN_OPENEN_EVENT, openen);
    return () => { window.removeEventListener(CANONICAL_NOTICE_EVENT, handler); window.removeEventListener(MELDINGEN_OPENEN_EVENT, openen); };
  }, [p.scope]);

  useEffect(() => {
    const notice = p.notice;
    if (!notice?.text) { lastProp.current = ''; return; }
    const signature = `${notice.kind || 'info'}\u001f${notice.text}`;
    if (signature === lastProp.current) return;
    lastProp.current = signature;
    receiveRef.current(notice, 'prop');
  }, [p.notice?.text, p.notice?.kind]);

  useEffect(() => {
    const now = Date.now();
    const expiries = [
      ...retained.flatMap((item) => (item.action && item.actionExpiresAt && item.actionExpiresAt > now ? [item.actionExpiresAt] : [])),
      ...(active?.action && active.actionExpiresAt && active.actionExpiresAt > now ? [active.actionExpiresAt] : []),
    ];
    const nextExpiry = Math.min(...expiries);
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => {
      const at = Date.now();
      const current = activeRef.current;
      if (current?.action && current.actionExpiresAt && current.actionExpiresAt <= at) {
        const next = { ...current, action: undefined, actionExpiresAt: undefined };
        activeRef.current = next;
        setActive(next);
      }
    }, Math.max(0, nextExpiry - now) + 25);
    return () => window.clearTimeout(timer);
  }, [retained, active?.id, active?.actionExpiresAt]);

  // Nieuwe servermeldingen (of technische): geluid als een type dat mag; één pop-up met de titel als een type opduiken mag.
  useEffect(() => {
    // INTEG-001: dezelfde servermelding kan in beide lijsten zitten; per id één keer (anders «+1» en twee keer geluid voor één melding).
    const alle = uniekOpId([...(p.serverItems || []), ...(p.techItems || [])]).filter((item) => !item.read);
    const unreadIds = new Set(alle.map((item) => item.id));
    if (serverKnown.current === null) { serverKnown.current = unreadIds; return; }
    const added = alle.filter((item) => !serverKnown.current?.has(item.id) && vk(soortInfo(item.kind).type).tonen);
    serverKnown.current = unreadIds;
    if (!added.length) return;
    const klinkt = added.some((item) => vk(soortInfo(item.kind).type).geluid);
    const toon = added.filter((item) => vk(soortInfo(item.kind).type).opduiken);
    if (toon.length) {
      const item = toon[0];
      const info = soortInfo(item.kind);
      // INTEG-001: welk onderdeel (uit de link van de server: mail., id., admin. …) en welk soort melding — geen kale «Відкрити».
      const dienst = /^(?:svc|pg):([a-z]+)/.exec(itemVanLink(item.link) || '')?.[1] || '';
      const plek = dienst ? styleOf(dienst, p.lang).label : '';
      receiveRef.current({
        text: toon.length > 1 ? `${item.title} (+${toon.length - 1})` : item.title,
        kind: info.ernst === 'kritiek' ? 'warning' : 'info',
        source: dienst || 'server', transient: true, meldingId: `s:${item.id}`,
        ...(info.type !== 'systeem' ? { context: t(...typeInfo(info.type).naam) } : {}),
        ...(item.message ? { explain: item.message } : {}),
        ...(item.link ? { link: { href: item.link, label: plek ? t(`Відкрити: ${plek}`, `Openen: ${plek}`) : t('Відкрити, де це виправити', 'Openen waar u het oplost') } } : {}),
      }, 'event', { type: info.type, geluid: klinkt, serverId: item.id });
    } else if (klinkt) {
      playChime();
    }
  }, [[...(p.serverItems || []), ...(p.techItems || [])].map((item) => `${item.id}:${item.read ? 1 : 0}`).join('|')]);

  useEffect(() => volgKader(() => setViewportRev((value) => value + 1)), []);
  useLayoutEffect(() => { setViewportRev((value) => value + 1); }, []);
  useEffect(() => {
    const update = () => setViewportRev((value) => value + 1);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('.canonical-notification-panel') || target.closest('.canonical-notification-bell')) return;
      const control = target.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"],[role="checkbox"]');
      const functional = Boolean(control && !control.matches('.google-mail-open'));
      if (functional) { window.setTimeout(() => setPanelOpen(false), 0); return; }
      const blockClick = (next: MouseEvent) => { next.preventDefault(); next.stopPropagation(); };
      document.addEventListener('click', blockClick, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', blockClick, true), 450);
      event.preventDefault();
      event.stopPropagation();
      setPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [panelOpen]);

  /** Strook van het vensterdok (CSS-variabelen op <html>): het paneel en de pop-up komen er nooit onder (vroeger regelde de CSS dat met een vol blad). */
  const dokRanden = () => {
    try {
      const s = getComputedStyle(document.documentElement);
      const n = (k: string) => Math.max(0, parseFloat(s.getPropertyValue(k)) || 0);
      return { boven: n('--venster-dok-boven'), onder: n('--venster-dok-onder'), links: n('--venster-dok-links'), rechts: n('--venster-dok-rechts') };
    } catch {
      return { boven: 0, onder: 0, links: 0, rechts: 0 };
    }
  };
  const viewport = () => zonderDok(zichtbaarKader(bellRef.current || document.getElementById('root'), !bellRef.current), dokRanden());

  /* INTEG-001: een pijltje maakt het paneel en de pop-up zichtbaar vast aan de bel (gemeten NA het plaatsen: op de telefoon zet de CSS
     links/rechts tussen de veilige randen, dus de echte rechthoek telt). */
  const [paneelPijl, setPaneelPijl] = useState<Pijl | null>(null);
  const [toastPijl, setToastPijl] = useState<Pijl | null>(null);
  const meetPijl = (el: HTMLElement | null): Pijl | null => {
    const bell = bellRef.current;
    if (!el || !bell || !bell.isConnected) return null;
    const v = viewport();
    const r = el.getBoundingClientRect(), b = bell.getBoundingClientRect();
    return pijlNaarBel({ left: r.left - v.kx, top: r.top - v.ky, width: r.width, height: r.height }, { left: b.left - v.kx, top: b.top - v.ky, width: b.width, height: b.height });
  };
  const zelfdePijl = (a: Pijl | null, b: Pijl | null) => (a === b) || (!!a && !!b && a.left === b.left && a.top === b.top && a.kant === b.kant);

  useLayoutEffect(() => {
    if (!panelOpen) return;
    const panel = panelRef.current;
    const bell = bellRef.current;
    if (!panel) return;
    if (!bell || !bell.isConnected) {
      /* bel niet in beeld (lade dicht): rechtsboven onder de balk */
      const v = viewport();
      const left = Math.max(v.left + 8, v.left + v.width - panel.offsetWidth - 8);
      const top = v.top + 64;
      setPanelPos((current) => (current.left === left && current.top === top ? current : { left, top }));
      return;
    }
    const v = viewport();
    const rect = bell.getBoundingClientRect();
    const previous = panel.style.maxHeight;
    panel.style.maxHeight = 'none';
    const natural = Math.min(panel.offsetHeight, 760);
    panel.style.maxHeight = previous;
    const place = placeNear({ left: rect.left - v.kx, top: rect.top - v.ky, width: rect.width, height: rect.height }, { width: panel.offsetWidth, height: natural }, v);
    /* boven de bel mag het paneel niet hoger worden dan waarmee de bovenkant berekend is — anders schoof de onderrand onder het scherm (stand 768×1024, 36 meldingen) */
    const maxHeight = place.side === 'above' ? Math.min(place.maxHeight, Math.max(120, Math.round(natural))) : place.maxHeight;
    setPanelPos((current) => (current.left === place.left && current.top === place.top && current.maxHeight === maxHeight ? current : { left: place.left, top: place.top, maxHeight }));
  }, [panelOpen, belPlek, viewportRev, retained.length, (p.serverItems || []).length]);

  useEffect(() => {
    if (!panelOpen || typeof ResizeObserver === 'undefined') return;
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setViewportRev((value) => value + 1));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panelOpen]);

  useLayoutEffect(() => {
    const volgende = panelOpen ? meetPijl(panelRef.current) : null;
    setPaneelPijl((huidig) => (zelfdePijl(huidig, volgende) ? huidig : volgende));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, panelPos, viewportRev]);

  /* De pop-up staat NAAST de bel (kant met de meeste ruimte, binnen het scherm) — nooit midden op het scherm. */
  useLayoutEffect(() => {
    const el = toastRef.current;
    if (!active || !el) return;
    const v = viewport();
    const bell = bellRef.current;
    const vorigeMax = el.style.maxHeight;
    el.style.maxHeight = 'none';
    const breedte = el.offsetWidth;
    const hoogte = el.offsetHeight;
    el.style.maxHeight = vorigeMax;
    let place: { left: number; top: number; maxHeight: number };
    if (bell && bell.isConnected) {
      const rect = bell.getBoundingClientRect();
      place = placeNear({ left: rect.left - v.kx, top: rect.top - v.ky, width: rect.width, height: rect.height }, { width: breedte, height: hoogte }, v, { gap: 10 });
    } else {
      /* bel niet in beeld (lade dicht, telefoon): rechtsboven onder de balk, binnen het scherm */
      place = { left: Math.max(v.left + 8, v.left + v.width - breedte - 8), top: v.top + 64, maxHeight: Math.max(120, v.height - 72) };
    }
    setToastPos((current) => (current && current.left === place.left && current.top === place.top && current.maxHeight === place.maxHeight ? current : place));
  }, [active?.id, active?.expanded, belPlek, viewportRev]);

  useLayoutEffect(() => {
    const volgende = active && toastPos ? meetPijl(toastRef.current) : null;
    setToastPijl((huidig) => (zelfdePijl(huidig, volgende) ? huidig : volgende));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.expanded, toastPos, viewportRev]);

  useEffect(() => {
    const el = toastRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportRev((value) => value + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [active?.id]);

  const toggleBell = () => setPanelOpen((value) => !value);
  const server = (p.serverItems || []).filter((item) => vk(soortInfo(item.kind).type).tonen && (!ruimteFilterActief() || (item.ruimte ?? 'prive') === ruimteNu));
  const zichtbaarLokaal = retained.filter((item) => vk(typeVanBron(item.source)).tonen);
  const belSfeer: MeldingSfeer = p.sfeer || 'prive';
  const events = vk('ai').tonen ? activiteitenVanSfeer(activity.events, belSfeer) : [];
  const techUnread = (p.techItems || []).filter((item) => !item.read && vk(soortInfo(item.kind).type).tonen).length;
  const techRegel = techUnread > 0 && !!tech.profiel;
  // INTEG-001: wat opgeruimd of opgelost is (status op de server), telt niet meer als ongelezen — in geen enkel paneel.
  const afgehandeld = (id: string) => { const s = v3Status.items[id]?.s; return s === 'archief' || s === 'opgelost' || s === 'gelezen'; };
  const serverUnread = server.filter((item) => !item.read && !afgehandeld(`s:${item.id}`)).length;
  const localUnread = zichtbaarLokaal.filter((item) => !item.read && !item.opgelost && !afgehandeld(`l:${item.id}`)).length;
  const activityUnread = events.filter((event) => !activity.read.has(event.id) && !afgehandeld(`a:${event.id}`)).length;
  const unreadCountOud = localUnread + serverUnread + activityUnread + (techRegel ? techUnread : 0);
  const v2Model = useMemo(() => (v2
    ? bouwModel({ lang: p.lang, local: zichtbaarLokaal as never, server: server as never, events, readEvents: activity.read }, v2Regels, undefined, (ms) => pasStatusToe(ms, v3Status))
    : null), [v2, v2Regels, v3Status, p.lang, zichtbaarLokaal, server, events, activity.read]);
  const unreadCount = v2Model ? v2Model.tellers.bel + (techRegel ? techUnread : 0) : unreadCountOud;
  const historyCount = zichtbaarLokaal.length + server.length + events.length;
  const removeRetained = (id: string) => { releaseCanonicalNoticeAction(id); saveRetained((rows) => rows.filter((row) => row.id !== id)); };
  const markLocalRead = markRetainedRead;
  const markAll = async () => {
    activity.markAllRead();
    if (localUnread) saveRetained((rows) => rows.map((row) => ({ ...row, read: true })));
    if (serverUnread) await p.onReadAllServer?.();
  };
  const resetPosition = () => {
    const klasse = plaatsStaat().ctx.klasse;
    zetZijbalk((v) => ({ ...v, plaatsing: terugzetten(v.plaatsing, klasse, 'bel') }));
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    soundRef.current = next;
    writeSharedPreferences({ notificationSound: next });
  };

  /* Het paneel (legacy lijst): wat in het open paneel te zien is, telt als gelezen — na een korte weergave. */
  useEffect(() => {
    if (!panelOpen || v2) return;
    const lokaal = zichtbaarLokaal.filter((row) => !row.read).map((row) => row.id);
    const serverIds = server.filter((item) => !item.read).map((item) => item.id);
    const eventIds = events.filter((event) => !activity.read.has(event.id)).map((event) => event.id);
    if (!lokaal.length && !serverIds.length && !eventIds.length) return;
    const timer = window.setTimeout(() => {
      markRetainedReadMany(lokaal);
      for (const id of serverIds) void propsRef.current.onReadServer?.(id);
      for (const id of eventIds) activity.markRead(id);
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, v2, retained, p.serverItems, activity.events]);

  /* ☰ toont de teller als de bel in het menu staat (telefoon) */
  useEffect(() => { zetBelTeller(unreadCount); }, [unreadCount]);

  /* Telefoon (≤ 560 px): het paneel bedekt het scherm (meldingenpaneel.css) → modaal: Tab blijft erin, aria-modal. Computer: niet-modale popover. */
  const paneelModaal = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 560px)').matches;
  const Icon = active?.kind === 'error' ? TriangleAlert : active?.kind === 'success' ? CircleCheck : active?.kind === 'warning' ? TriangleAlert : Info;
  const toastStijl = active ? styleOf(active.source || '', p.lang) : null;
  // INTEG-001: altijd een weg naar de plek waar u het oplost — de link van de melding, anders het onderdeel zelf («Відкрити: Пошта»).
  const toastLink = active ? (normalizeLink(active.link) ?? (toastStijl ? sectieLink(toastStijl.section, p.lang) : undefined)) : undefined;
  // Waar en over wie: onderdeel · dienst (Google, Microsoft …) · account, app of apparaat (alleen wat de bron weet).
  const toastSectie = toastStijl ? [toastStijl.label, toastStijl.providerLabel && toastStijl.providerLabel !== toastStijl.label ? toastStijl.providerLabel : '', active?.context?.trim() || ''].filter(Boolean).join(' · ') : '';

  /**
   * «Очистити»: de melding is afgehandeld — gelezen en naar «Архів» (niet gewist; terug te zetten in het paneel). De status staat op de
   * server (backend/meldingen-status.ts), dus ook op andere subdomeinen en apparaten.
   */
  const markeerIdsGelezen = (ids: readonly string[]) => {
    markRetainedReadMany(ids.filter((id) => id.startsWith('l:')).map((id) => id.slice(2)));
    for (const id of ids) {
      if (id.startsWith('s:')) void propsRef.current.onReadServer?.(id.slice(2));
      else if (id.startsWith('a:')) activityRef.current.markRead(id.slice(2));
    }
  };
  const ruimOp = (ids: readonly string[], beveiliging: readonly string[] = []) => {
    if (!ids.length) return;
    markeerIdsGelezen(ids);
    void wijzigStatus({ ids: [...ids], status: 'archief', hoe: ids.length > 1 ? 'bulk' : 'kaart', beveiliging: [...beveiliging] });
  };
  const ruimToastOp = () => {
    const huidig = activeRef.current;
    if (!huidig?.meldingId) return;
    ruimOp([huidig.meldingId], isKritiekType(typeVanBron(huidig.source)) ? [huidig.meldingId] : []);
    dismiss();
  };

  return (
    <>
      {active && (
        <section
          ref={toastRef as never}
          data-qa-id='canonical-notification-toast'
          data-no-edge-swipe='1'
          className={`canonical-notification-toast kind-${active.kind}${active.action ? ' has-action' : ''}${active.expanded ? ' expanded' : ''}${paused ? ' is-paused' : ''}${active.levensduurMs == null ? ' is-sticky' : ''}`}
          style={toastPos
            ? { left: toastPos.left, top: toastPos.top, maxHeight: toastPos.maxHeight, right: 'auto', bottom: 'auto', ['--melding-top' as string]: `${toastPos.top}px` }
            : { visibility: 'hidden' }}
          role={active.kind === 'error' ? 'alert' : 'status'}
          data-levensduur={active.levensduurMs ?? 'vast'}
          onPointerEnter={(event) => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') pauzeer('muis', true); }}
          onPointerLeave={(event) => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') pauzeer('muis', false); }}
          onMouseEnter={() => { if (!aanrakingActiefRef.current && Date.now() - laatsteAanrakingMsRef.current >= 800) pauzeer('muis', true); }}
          onMouseLeave={() => pauzeer('muis', false)}
          onPointerDown={(event) => { if (event.pointerType === 'touch') { laatsteAanrakingMsRef.current = Date.now(); aanrakingActiefRef.current = true; pauzeer('aanraking', true); } }}
          onPointerUp={(event) => { if (event.pointerType === 'touch' && !heeftTouchEventRef.current) { laatsteAanrakingMsRef.current = Date.now(); aanrakingActiefRef.current = false; pauzeer('aanraking', false); } }}
          onPointerCancel={(event) => { if (event.pointerType === 'touch' && !heeftTouchEventRef.current) { laatsteAanrakingMsRef.current = Date.now(); aanrakingActiefRef.current = false; pauzeer('aanraking', false); } }}
          onTouchStart={() => { heeftTouchEventRef.current = true; laatsteAanrakingMsRef.current = Date.now(); aanrakingActiefRef.current = true; pauzeer('aanraking', true); }}
          onTouchEnd={(event) => { laatsteAanrakingMsRef.current = Date.now(); if (!heeftAanrakingOpToast(event.touches)) { aanrakingActiefRef.current = false; pauzeer('aanraking', false); } }}
          onTouchCancel={(event) => { laatsteAanrakingMsRef.current = Date.now(); if (!heeftAanrakingOpToast(event.touches)) { aanrakingActiefRef.current = false; pauzeer('aanraking', false); } }}
          onContextMenu={(event) => { if (aanrakingActiefRef.current || Date.now() - laatsteAanrakingMsRef.current < 800) event.preventDefault(); }}
          // Alleen toetsenbordfocus pauzeert (een muisklik of korte tik houdt hem niet hangend via focus).
          onFocus={(event) => { let toets = false; try { toets = event.target instanceof Element && event.target.matches(':focus-visible'); } catch { toets = false; } if (toets) pauzeer('toets', true); }}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) pauzeer('toets', false); }}
        >
          <Icon aria-hidden='true' />
          <div className='canonical-notification-toast-tekst'>
            {toastSectie ? <span className='canonical-notification-toast-sectie'>{toastSectie}</span> : null}
            <span className='canonical-notification-toast-titel'>{active.text}</span>
            {active.explain ? <p className='canonical-notification-toast-uitleg'>{active.explain}</p> : null}
            {toastLink || active.meldingId ? (
              <div className='canonical-notification-toast-acties'>
                {toastLink ? <a className='canonical-notification-link' href={toastLink.href} data-qa-id='melding-openen'>{toastLink.label} →</a> : null}
                {active.meldingId ? (
                  <button type='button' className='canonical-notification-opruimen' data-qa-id='melding-opruimen' onClick={ruimToastOp}
                    title={t('Позначити прочитаним і перенести в «Архів» (можна повернути)', 'Als gelezen markeren en naar «Archief» (terug te zetten)')}>
                    {t('Очистити', 'Opruimen')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {active.expanded ? <small className='canonical-notification-toast-meta'>{formatTime(active.createdAt)}</small> : null}
            {active.levensduurMs == null ? <small className='canonical-notification-toast-meta'>{t('Лишається, доки ви не закриєте (так налаштовано для цього типу). Після закриття — у панелі сповіщень.', 'Blijft staan tot u sluit (zo ingesteld voor dit type). Daarna staat hij in het meldingenpaneel.')}</small> : null}
            {paused && active.levensduurMs != null ? (
              <small className='canonical-notification-toast-pauze' aria-hidden='true'>
                {vastgehoudenMetAanraking
                  ? t('Пауза — не зникне, поки тримаєте палець на сповіщенні', 'Pauze — verdwijnt niet zolang u de melding vasthoudt')
                  : t('Пауза — не зникне, поки курсор на сповіщенні', 'Pauze — verdwijnt niet zolang de muis erop staat')}
              </small>
            ) : null}
          </div>
          {active.action ? (
            <button type='button' className='canonical-notification-action-icon' aria-label={active.action.label} title={active.action.label} data-tooltip={active.action.label} onClick={() => void runAction(active.id, active.action!, true)}><Undo2 /></button>
          ) : null}
          <button
            type='button'
            className='canonical-notification-icon-button canonical-notification-expand'
            aria-expanded={active.expanded}
            aria-label={active.expanded ? t('Згорнути сповіщення', 'Melding inklappen') : t('Розгорнути сповіщення', 'Melding uitklappen')}
            title={active.expanded ? t('Згорнути сповіщення', 'Melding inklappen') : t('Розгорнути сповіщення', 'Melding uitklappen')}
            onClick={toggleExpanded}
          >
            <ChevronDown aria-hidden='true' />
          </button>
          <button type='button' className='canonical-notification-icon-button' onClick={dismiss} aria-label={t('Закрити повідомлення', 'Melding sluiten')} title={t('Закрити повідомлення', 'Melding sluiten')}><X /></button>
          {active.levensduurMs != null ? (
            <div className='canonical-notification-toast-balk' aria-hidden='true'>
              <i
                key={`${active.id}:${balkSegment.versie}`}
                ref={barRef as never}
                style={{ ['--toast-duur' as string]: `${balkSegment.duur}ms`, ['--toast-verstreken' as string]: `-${balkSegment.verstreken}ms` }}
              />
            </div>
          ) : null}
        </section>
      )}
      {active && toastPijl ? <span className='cnc-pijl is-toast' data-kant={toastPijl.kant} style={{ left: toastPijl.left, top: toastPijl.top }} aria-hidden='true' /> : null}

      <Plek knop='bel'>
        {(vorm) => (
          <button
            ref={bellRef}
            data-qa-id='canonical-notification-bell'
            type='button'
            className='canonical-notification-bell'
            data-vorm={vorm}
            aria-expanded={panelOpen}
            aria-label={unreadCount ? t(`Непрочитаних сповіщень: ${unreadCount}`, `Ongelezen meldingen: ${unreadCount}`) : historyCount ? t(`Історія сповіщень: ${historyCount}`, `Meldingsgeschiedenis: ${historyCount}`) : t('Сповіщення', 'Meldingen')}
            onClick={toggleBell}
          >
            <Bell aria-hidden='true' />
            {vorm === 'rij' && <span className='plaats-rij-label'>{t('Сповіщення', 'Meldingen')}</span>}
            {unreadCount > 0 && <small>{unreadCount > 99 ? '99+' : unreadCount}</small>}
          </button>
        )}
      </Plek>

      {panelOpen && (
        <section
          ref={panelRef}
          data-qa-id='canonical-notification-panel'
          className={`canonical-notification-panel${techRegel ? ' met-tech' : ''}${meer ? ' meer-open' : ''}${v2 ? ' is-v2' : ''}`}
          role='dialog'
          aria-modal={paneelModaal ? 'true' : undefined}
          tabIndex={-1}
          aria-label={t('Центр сповіщень', 'Meldingencentrum')}
          style={panelPos}
          onKeyDown={(event) => { if (paneelModaal) houdTab(event, focusbaar(event.currentTarget), { houder: event.currentTarget }); }}
          onPointerDownCapture={(event) => { if (meer && event.target instanceof Element && !event.target.closest('#cnc-acties,[data-qa-id="melding-meer"]')) setMeer(false); }}
        >
          {v2 ? (
            <MeldingenV2
              lang={p.lang}
              local={zichtbaarLokaal as never}
              server={server as never}
              events={events}
              readEvents={activity.read}
              regels={v2Regels}
              onReadLocal={markLocalRead}
              onReadServer={p.onReadServer}
              onReadEvent={activity.markRead}
              onMarkAll={markAll}
              geluid={sound}
              onGeluid={toggleSound}
              onSluiten={() => setPanelOpen(false)}
              techTypen={!!tech.profiel}
              tech={techRegel ? { aantal: techUnread, open: () => { setPanelOpen(false); openTechMeldingen(); }, tekst: techSamenvattingTekst(p.lang, techUnread) } : null}
            />
          ) : (
            <>
              <header>
                {instellingen && (
                  <button type='button' className='cnc-terug' onClick={() => setInstellingen(false)} aria-label={t('До сповіщень', 'Terug naar meldingen')} title={t('До сповіщень', 'Terug naar meldingen')}>
                    <ArrowLeft aria-hidden='true' />
                  </button>
                )}
                <div>
                  <strong>{t('Сповіщення', 'Meldingen')}</strong>
                  <small><span role='status'>{t(`Непрочитаних: ${unreadCount}`, `Ongelezen: ${unreadCount}`)}</span>{t(` · Історія: ${historyCount}`, ` · Geschiedenis: ${historyCount}`)}</small>
                </div>
                <button type='button' ref={meerKnopRef} className='cnc-meer-knop' data-qa-id='melding-meer' aria-expanded={meer} aria-controls='cnc-acties' aria-label={t('Інші дії: звук, типи, позначити все, повернути дзвоник на типове місце', 'Meer acties: geluid, soorten, alles gelezen, bel terug naar de standaardplek')} title={t('Інші дії', 'Meer acties')} onClick={() => setMeer((v) => !v)}>
                  <Ellipsis aria-hidden='true' />
                </button>
                <button type='button' onClick={() => setPanelOpen(false)} aria-label={t('Згорнути панель сповіщень', 'Meldingenpaneel inklappen')} title={t('Згорнути панель сповіщень', 'Meldingenpaneel inklappen')}><Minimize2 /></button>
              </header>
              {techRegel && (
                <button type='button' className='canonical-notification-tech' data-qa-id='tech-meldingen-samenvatting' data-tech-aantal={techUnread} onClick={() => { setPanelOpen(false); openTechMeldingen(); }}>
                  <ShieldCheck aria-hidden='true' />
                  <span>
                    {techSamenvattingTekst(p.lang, techUnread)}
                    <small>{tech.activatie && tech.activatie.eind > Date.now() + tech.scheef ? t('Відкрити технічну панель', 'Technisch paneel openen') : t('Спершу увімкніть технічний профіль — потім панель відкриється сама', 'Zet eerst het technisch profiel aan — daarna opent het paneel vanzelf')}</small>
                  </span>
                  <b aria-hidden='true'>{techUnread > 99 ? '99+' : techUnread}</b>
                </button>
              )}
              {instellingen ? (
                <MeldingVoorkeurenPaneel lang={p.lang} techTypen={!!tech.profiel} />
              ) : (
                <NotificationPanelBody lang={p.lang} local={zichtbaarLokaal} server={server} events={events} readEvents={activity.read} onReadLocal={markLocalRead} onRemoveLocal={removeRetained} onRunAction={(id, action) => runAction(id, action)} onReadServer={p.onReadServer} onReadEvent={activity.markRead} detailIcons={DETAIL_ICON_COMPONENTS as never}
                  status={v3Status} onOpruimen={ruimOp} onTerug={(ids) => void wijzigStatus({ ids: [...ids], status: 'nieuw', hoe: ids.length > 1 ? 'bulk' : 'kaart' })} />
              )}
              <footer
                id='cnc-acties'
                className={meer ? 'is-open' : undefined}
                role='group'
                onKeyDown={(event) => {
                  if (!meer) return;
                  if (menuToets(event, focusbaar(event.currentTarget))) return;
                  if (event.key === 'Tab') { setMeer(false); meerKnopRef.current?.focus(); }
                }}
                aria-label={t('Дії зі сповіщеннями', 'Acties voor meldingen')}
              >
                <button type='button' onClick={toggleSound} data-tooltip={sound ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')}>
                  {sound ? <Volume2 /> : <VolumeX />}
                  <span className='cnc-actie-tekst'>{sound ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')}</span>
                </button>
                <button type='button' onClick={() => { setInstellingen((v) => !v); setMeer(false); }} aria-pressed={instellingen} data-qa-id='melding-typen' data-tooltip={t('Типи сповіщень', 'Soorten meldingen')}>
                  <SlidersHorizontal />
                  <span className='cnc-actie-tekst'>{instellingen ? t('До сповіщень', 'Terug naar meldingen') : t('Типи сповіщень', 'Soorten meldingen')}</span>
                </button>
                <button type='button' onClick={() => { resetPosition(); setMeer(false); }} data-tooltip={t('Повернути на типове місце', 'Terug naar de standaardplek')}>
                  <RotateCcw />
                  <span className='cnc-actie-tekst'>{t('Повернути на типове місце', 'Terug naar de standaardplek')}</span>
                </button>
                <button type='button' disabled={unreadCount === 0} onClick={() => { setMeer(false); void markAll(); }}>
                  <CheckCheck />
                  <span className='cnc-actie-tekst'>{t('Позначити все прочитаним', 'Alles als gelezen')}</span>
                </button>
              </footer>
            </>
          )}
        </section>
      )}
      {panelOpen && paneelPijl ? <span className='cnc-pijl' data-kant={paneelPijl.kant} data-qa-id='melding-paneel-pijl' style={{ left: paneelPijl.left, top: paneelPijl.top }} aria-hidden='true' /> : null}
    </>
  );
}
