// Спадне меню облікового запису v3 (IDENTITEIT-008, прапорець `accountmenu-v3`).
// Втілює затверджену композицію:
// - Режим А «Орбіта світлин» (типово) або Режим Б «Секційна картка» (перемикається в Налаштуваннях);
// - Модель В для кнопки «Палітра кольорів» (короткий натиск — по колу, правий натиск або утримання — повна поличка кольорів);
// - Щиток технічного простору світиться кольором технічної смуги лише за активного технічного режиму;
// - Кнопка «Доступ і терміни» (32x32 px) з концентричним кільцем r=15.5, тематичною підказкою при наведенні та вбудованим лотком 3 умов завершення;
// - Рядок виходу 2А з міні-кружечками сеансів (червоною є лише сама піктограма дверцят/вимкнення);
// - Пропорційне масштабування панелі за нижній кутик (78%..134%, подвійний натиск — 100%).
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  KeyRound,
  LifeBuoy,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Pause,
  Play,
  Plus,
  Power,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Waves,
  X,
} from 'lucide-react';
import { BAND_KLEUREN, isBandKleur, type BandKleur } from '../../shared/tech-rollen';
import { openAchtergrondPaneel } from '../achtergrond/AchtergrondKnop';
import { rememberedAccountStatus, type AccountMenuUser, type RememberedAccount } from '../canoniek-account-menu-model';
import { serviceFromLocation } from '../canoniek-navigatie';
import { openDiagnose } from '../diagnose/open';
import type { ThemePreference } from '../gedeelde-voorkeuren';
import { MOVA_VOLLEDIG, MoviPrapor } from '../MoviPrapor';
import { openTechVenster, techActief, techBand, techBeeindigen, useTech } from '../tech/tech-opslag';
import type { TermijnModus } from '../tech/ruimtes-contract';
import { beeindigen, pauzeer, starten, useRuimtes, verlengen } from '../tech/ruimtes/ruimtes-opslag';
import { kiesRuimte } from '../tech/ruimtes/RuimteWissel';
import { hervatAuto, pauzeerAuto, useAutoStatus, useThemaStand, zetPalet, zetWeergaveStijl } from '../thema/useThema';
import { ACCENT_NAMEN, ACCENT_TONEN, accentKeuzesMet, minderTransparantie } from '../thema/weergave-stijl';
import { UITERLIJK_TRANSPARANTIE_STANDAARD_AAN, type UiterlijkAccent } from '../../shared/uiterlijk';
import {
  begrensschaal,
  herstelAccountmenuV3Schaal,
  huidigePaletKeuze,
  kiesAccountmenuV3Palet,
  PALET_KEUZES_INFO,
  paletIcoonKleur,
  SCHAAL_STANDAARD,
  useAccountmenuV3Voorkeuren,
  volgendePaletKeuze,
  migreerVasteTint,
  zetAccountmenuV3Schaal,
  type AccountmenuV3PaletKeuze,
  type PaletKeuzeInfo,
} from './accountmenu-v3-voorkeuren';
import './accountmenu-v3.css';

const OMTREK_32 = 97.4; // 2 * Math.PI * 15.5
/** ACCENT-001: назви акцентів, обраних раніше в «Налаштування → Теми» (їх немає серед восьми відтінків меню). */
function useAccountmenuV3PaletSync(violetToegestaan: boolean): {
  keuze: AccountmenuV3PaletKeuze;
  info: PaletKeuzeInfo;
  kies: (k: AccountmenuV3PaletKeuze) => AccountmenuV3PaletKeuze;
  volgende: () => AccountmenuV3PaletKeuze;
} {
  const thema = useThemaStand();
  const voorkeuren = useAccountmenuV3Voorkeuren();
  // ACCENT-001: давній локальний відтінок → акцент облікового запису (діє в будь-якій палітрі й на всіх пристроях).
  useEffect(() => {
    const tint = migreerVasteTint(Boolean(thema.stijl.accent));
    if (tint) zetWeergaveStijl({ accent: tint });
  }, [voorkeuren.vasteTint, thema.stijl.accent]);

  const keuze = huidigePaletKeuze(thema.palet, { ...voorkeuren, vasteTint: null }, violetToegestaan);
  const info = PALET_KEUZES_INFO.find((p) => p.id === keuze) || PALET_KEUZES_INFO[0]!;
  return {
    keuze,
    info,
    kies: (k: AccountmenuV3PaletKeuze) => kiesAccountmenuV3Palet(k, violetToegestaan, zetPalet),
    volgende: () => {
      const volg = volgendePaletKeuze(keuze, violetToegestaan);
      return kiesAccountmenuV3Palet(volg, violetToegestaan, zetPalet);
    },
  };
}

export type AccountWisselMeldingData = {
  email: string;
  kop: string;
  profielId: 'gebruiker' | 'technisch';
  profiel: string;
  uitleg: string;
  actie: string | null;
  geenRecht: string | null;
};

export type AccountMenuV3Props = {
  lang: 'uk' | 'nl';
  theme: ThemePreference;
  displayUser: AccountMenuUser | null;
  visibleRows: RememberedAccount[];
  shouldShowOtherAccountsToggle: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  busy: boolean;
  selecting: string;
  forgetting: string;
  loading: boolean;
  loadFailed: boolean;
  photoBusy: boolean;
  photoError: boolean;
  photoLeesfout: string;
  photoFailedText: string;
  changePhotoLabel: string;
  manageLabel: string;
  settingsLabel: string;
  privacyLabel: string;
  termsLabel: string;
  showLogoutAll: boolean;
  wisselMelding: AccountWisselMeldingData | null;
  wisselFout?: { tekst: string; reauth?: boolean } | string | null;
  v2Ruimtes: boolean;
  onChangePhoto?: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  onSelectAccount: (item: RememberedAccount) => Promise<void> | void;
  onForgetAccount?: (item: RememberedAccount) => Promise<void> | void;
  onAddAccount: () => void;
  onManage?: () => void;
  onSettings?: () => void;
  onTheme: (theme: ThemePreference) => void;
  onThemeColors?: () => void;
  onLanguage: (lang: 'uk' | 'nl') => void;
  onLogout?: () => void;
  onLogoutAll?: () => void;
  onClose: () => void;
  onSluitNavigatie?: () => void;
  mobiel?: boolean;
  renderAvatar: (user: AccountMenuUser, size?: 'profile' | 'hero' | 'regular' | 'mini') => ReactNode;
};

function statusBijschrift(
  st: ReturnType<typeof rememberedAccountStatus>,
  isSelecting: boolean,
  uk: boolean,
): string {
  if (isSelecting) return uk ? 'Переходимо до входу…' : 'Doorsturen naar aanmelding…';
  if (st === 'active') return uk ? 'Активний сеанс' : 'Actieve sessie';
  if (st === 'signed_in') return uk ? 'Готовий до входу' : 'Klaar om te openen';
  if (st === 'registration') return uk ? 'Завершити реєстрацію' : 'Registratie voltooien';
  return uk ? 'Повторний вхід через Google' : 'Opnieuw aanmelden met Google';
}

function formatMinuten(minuten: number, uk: boolean): string {
  const m = Math.max(1, Math.round(minuten));
  if (m < 60) return uk ? `${m} хв` : `${m} min`;
  const uren = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return uk ? `${uren} год` : `${uren} u`;
  return uk ? `${uren} год ${rest} хв` : `${uren} u ${rest} m`;
}

export function AccountMenuV3({
  lang,
  theme,
  displayUser,
  visibleRows,
  shouldShowOtherAccountsToggle,
  expanded,
  onToggleExpanded,
  busy,
  selecting,
  forgetting,
  loading,
  loadFailed,
  photoBusy,
  photoError,
  photoLeesfout,
  photoFailedText,
  changePhotoLabel,
  manageLabel,
  settingsLabel,
  privacyLabel,
  termsLabel,
  showLogoutAll,
  wisselMelding,
  wisselFout = null,
  v2Ruimtes,
  onChangePhoto,
  onSelectAccount,
  onForgetAccount,
  onAddAccount,
  onManage,
  onSettings,
  onTheme,
  onThemeColors,
  onLanguage,
  onLogout,
  onLogoutAll,
  onClose,
  onSluitNavigatie,
  mobiel = false,
  renderAvatar,
}: AccountMenuV3Props) {
  const uk = lang === 'uk';
  const sluitVoorNavigatie = onSluitNavigatie ?? onClose;
  const photoInput = useRef<HTMLInputElement | null>(null);
  const voorkeuren = useAccountmenuV3Voorkeuren();
  const dienst = typeof window !== 'undefined' ? serviceFromLocation() : 'hub';
  const violetToegestaan = dienst === 'ai';
  const paletSync = useAccountmenuV3PaletSync(violetToegestaan);
  const themaStand = useThemaStand();
  const themaStijl = themaStand.stijl;
  const achtergrondStand = themaStand.achtergrond?.stand ?? 'auto';
  const achtergrondUit = achtergrondStand === 'uit';
  const autoStatus = useAutoStatus(theme);
  const tech = useTech();
  const ruimtes = useRuimtes();

  const [paletOpen, setPaletOpen] = useState(false);
  const [toegangOpen, setToegangOpen] = useState(false);
  // RUIMTE-WEERGAVE-001: «Завершити» з підтвердженням (друге натискання) і коротке повідомлення про наслідок дії.
  const [eindeBevestig, setEindeBevestig] = useState(false);
  const [ruimteMelding, setRuimteMelding] = useState('');
  // Підказка піктограм «Пауза/Завершити»: миша — наведення (CSS), палець — довге натискання (тоді дія НЕ виконується).
  const [techTip, setTechTip] = useState<'' | 'pauze' | 'einde'>('');
  const techTipTimer = useRef<number | null>(null);
  const techLangeDruk = useRef(false);
  const [paletMelding, setPaletMelding] = useState<{ tekst: string; kleur: string } | null>(null);
  const [houdtPaletVast, setHoudtPaletVast] = useState(false);
  const [afgemeldIngeklapt, setAfgemeldIngeklapt] = useState(false);

  useEffect(() => {
    if (!displayUser) {
      setToegangOpen(false);
      setAfgemeldIngeklapt(false);
    }
  }, [displayUser]);

  const holdTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);
  const lastHoldToggleAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Синхронізація CSS-змінної масштабу на панелі `.canonical-account-panel` (лише на комп'ютері)
  const shellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const paneel = shellRef.current?.closest<HTMLElement>('.canonical-account-panel');
    if (!paneel) return;
    if (mobiel) {
      paneel.style.removeProperty('--am3-scale');
      return;
    }
    paneel.style.setProperty('--am3-scale', String(voorkeuren.schaal));
    return () => {
      paneel.style.removeProperty('--am3-scale');
    };
  }, [voorkeuren.schaal, mobiel]);

  const donker = theme === 'dark' || theme === 'plum-dark' || (theme === 'auto' && autoStatus.presentatie === 'dark');
  // ACCENT-001: з обраним відтінком піктограма палітри показує саме його — видно, що акцент діє поверх палітри.
  const accentKeuze = themaStijl.accent as UiterlijkAccent | undefined;
  const paletKleur = accentKeuze && ACCENT_TONEN[accentKeuze] ? ACCENT_TONEN[accentKeuze][donker ? 'donker' : 'licht'].accent : paletIcoonKleur(paletSync.keuze, dienst, donker);
  const transparantie = typeof themaStijl.transparantie === 'number' ? themaStijl.transparantie : 0;
  const accentInfo = accentKeuze ? ACCENT_NAMEN[accentKeuze] : undefined; // KLEUREN-001: назви з одного джерела · namen uit één bron

  // Стан технічного простору та колір технічної смуги (активні виключно для увімкненого облікового запису)
  const heeftTech = Boolean(displayUser) && (Boolean(tech.profiel) || Boolean(ruimtes.status?.technischToegestaan));
  const isTechActief = Boolean(displayUser) && ((v2Ruimtes && ruimtes.status?.aan)
    ? ruimtes.status.actief === 'technisch'
    : techActief(tech));
  const bandKleurId: BandKleur = isBandKleur(tech.profiel?.band?.kleur) ? tech.profiel!.band.kleur : 'amber';
  const schildKleur = BAND_KLEUREN[bandKleurId]?.bg || '#f2b705';

  // Визначення умови завершення та залишку часу для кнопки й лотка «Доступ і терміни»
  const nuMs = ruimtes.nu || Date.now();
  const actieveModus: TermijnModus = (() => {
    if (ruimtes.status?.sessie?.modus) return ruimtes.status.sessie.modus;
    const m = tech.activatie?.modus;
    if (m === 'tot-verlaten') return 'tot-technisch-einde';
    if (m === 'tot-uitloggen') return 'tot-site-uitloggen';
    return 'tijd';
  })();

  const eindTijdMs = ruimtes.status?.sessie?.eindTijd ?? tech.activatie?.eind ?? null;
  const startTijdMs = ruimtes.status?.sessie?.gestartOp ?? tech.activatie?.begin ?? (nuMs - 30 * 60_000);
  const restMinuten = eindTijdMs ? Math.max(0, Math.ceil((eindTijdMs - nuMs) / 60_000)) : 0;
  const totaalMinuten = eindTijdMs && startTijdMs && eindTijdMs > startTijdMs
    ? Math.max(15, Math.round((eindTijdMs - startTijdMs) / 60_000))
    : 60;

  const ringVerhouding = !isTechActief
    ? 0
    : actieveModus === 'tijd' && eindTijdMs
      ? Math.max(0.08, Math.min(1, restMinuten / totaalMinuten))
      : 1;
  const ringDashoffset = Math.round((OMTREK_32 * (1 - ringVerhouding)) * 10) / 10;

  // Підписи стану простору та спливної картки «Доступ і терміни»
  // RUIMTE-WEERGAVE-001: перемикання лише змінює простір вкладки; сеанс може бути відкритий або на паузі.
  const v2Sessie = v2Ruimtes && ruimtes.status?.aan ? ruimtes.status.sessie : null;
  const sessiePauze = !!v2Sessie && !!ruimtes.status?.pauze;
  // Дії технічного сеансу належать блоку «Технічний»: у звичайному просторі їх не видно (там «Технічний» сам продовжує паузу).
  const toonTechActies = !!v2Sessie && isTechActief;
  // Пауза: вкладка у звичайному просторі, але сеанс живий — кнопка «Технічний» сама показує цей стан (зауваження власника 16.11).
  const techOpPauze = sessiePauze && !isTechActief;
  const ruimteSubtekst = !isTechActief
    ? (v2Sessie
      ? (sessiePauze ? (uk ? 'Звичайний · технічний доступ на паузі' : 'Gewoon · technische toegang gepauzeerd') : (uk ? 'Звичайний · технічний сеанс працює' : 'Gewoon · technische sessie loopt'))
      : (uk ? 'Звичайний робочий простір' : 'Gewone werkruimte'))
    : actieveModus === 'tijd' && restMinuten > 0
      ? (uk ? `Технічний · ще ${formatMinuten(restMinuten, true)}` : `Technisch · nog ${formatMinuten(restMinuten, false)}`)
      : actieveModus === 'tot-technisch-einde'
        ? (uk ? 'Технічний · до ручного вимкнення' : 'Technisch · tot handmatig uitzetten')
        : (uk ? 'Технічний · до виходу із запису' : 'Technisch · tot afmelden');

  const toegangTipKop = isTechActief
    ? (uk ? 'Технічний простір активний' : 'Technische ruimte actief')
    : (uk ? 'Доступ і терміни' : 'Toegang en termijnen');

  const toegangTipSub = !isTechActief
    ? (uk ? 'Зараз активний звичайний простір' : 'Gewone ruimte is nu actief')
    : actieveModus === 'tijd' && restMinuten > 0
      ? (uk ? `Умова: на час · залишилося ${formatMinuten(restMinuten, true)}` : `Voorwaarde: op tijd · nog ${formatMinuten(restMinuten, false)}`)
      : actieveModus === 'tot-technisch-einde'
        ? (uk ? 'Умова: до ручного вимкнення простору' : 'Voorwaarde: tot handmatig uitschakelen')
        : (uk ? 'Умова: до виходу з облікового запису' : 'Voorwaarde: tot afmelden bij dit account');

  const toegangTipHint = isTechActief
    ? (uk ? 'Натисніть, щоб змінити умову або час' : 'Klik om voorwaarde of tijd te wijzigen')
    : (uk ? 'Натисніть, щоб переглянути доступи та умови' : 'Klik om toegangen en voorwaarden te bekijken');

  // Модель В для кнопки «Палітра кольорів»:
  // - короткий натиск гортає палітри по колу + показує спливну позначку;
  // - правий натиск миші або утримання (0.38 с) відкриває/закриває поличку палітр без подвійного спрацьовування на сенсорному екрані.
  const toonPaletToast = (id: string) => {
    const gevonden = PALET_KEUZES_INFO.find((p) => p.id === id);
    if (!gevonden) return;
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setPaletMelding({ tekst: uk ? gevonden.uk : gevonden.nl, kleur: gevonden.kleur });
    toastTimerRef.current = window.setTimeout(() => {
      setPaletMelding(null);
    }, 1650);
  };

  const wisPaletHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoudtPaletVast(false);
  };

  const opPaletPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    holdTriggeredRef.current = false;
    setHoudtPaletVast(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      holdTriggeredRef.current = true;
      lastHoldToggleAtRef.current = Date.now();
      setHoudtPaletVast(false);
      setToegangOpen(false);
      setPaletOpen((v) => !v);
    }, 380);
  };

  const opPaletPointerUp = () => {
    wisPaletHold();
  };

  const opPaletClick = () => {
    if (holdTriggeredRef.current || Date.now() - lastHoldToggleAtRef.current < 650) {
      holdTriggeredRef.current = false;
      return;
    }
    const nieuwId = paletSync.volgende();
    toonPaletToast(nieuwId);
  };

  const opPaletContextMenu = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    wisPaletHold();
    // На сенсорних екранах оглядач надсилає contextmenu через ~120 мс після таймера утримання — не згортаємо щойно відкриту поличку.
    if (holdTriggeredRef.current || Date.now() - lastHoldToggleAtRef.current < 850) {
      return;
    }
    lastHoldToggleAtRef.current = Date.now();
    setToegangOpen(false);
    setPaletOpen((v) => !v);
  };

  // Керування простором (Звичайний | Технічний) та умовами завершення
  const schakelRuimte = async (naar: 'prive' | 'technisch') => {
    setEindeBevestig(false); setRuimteMelding('');
    if (naar === 'prive' && !isTechActief) return;
    if (naar === 'technisch' && isTechActief) return;
    if (v2Ruimtes && ruimtes.status?.aan) {
      if (naar === 'technisch' && ruimtes.status.technischToegestaan && !ruimtes.status.sessie) {
        sluitVoorNavigatie();
      }
      const uit = await kiesRuimte(naar, lang);
      if (uit?.tekst) setRuimteMelding(uit.tekst);
      return;
    }
    if (naar === 'technisch') {
      sluitVoorNavigatie();
      openTechVenster('activeren');
    } else {
      try {
        await techBeeindigen();
      } catch {
        /* помилка мережі залишає попередній стан */
      }
    }
  };

  const kiesVoorwaarde = async (modus: TermijnModus, minuten?: number) => {
    if (v2Ruimtes && ruimtes.status?.aan) {
      try {
        await starten(modus, uk ? 'Зміна умови в меню облікового запису' : 'Voorwaarde gewijzigd in accountmenu', minuten ?? (modus === 'tijd' ? 60 : undefined));
      } catch {
        openTechVenster('toegang');
      }
      return;
    }
    onClose();
    openTechVenster('activeren');
  };

  const pasTijdAan = async (minuten: number, soort: 'bijtellen' | 'vervangen') => {
    if (v2Ruimtes && ruimtes.status?.aan && isTechActief && actieveModus === 'tijd') {
      try {
        await verlengen(minuten, soort);
        return;
      } catch {
        /* якщо сервер вимагає повторного старту — пробуємо starten */
      }
    }
    await kiesVoorwaarde('tijd', minuten);
  };

  const techHoud = (welke: 'pauze' | 'einde') => ({
    onPointerDown: (e: { pointerType: string }) => {
      techLangeDruk.current = false;
      if (e.pointerType === 'mouse') return;
      if (techTipTimer.current) window.clearTimeout(techTipTimer.current);
      techTipTimer.current = window.setTimeout(() => {
        techLangeDruk.current = true; setTechTip(welke);
        techTipTimer.current = window.setTimeout(() => setTechTip(''), 4500);
      }, 450);
    },
    onPointerUp: () => { if (!techLangeDruk.current && techTipTimer.current) { window.clearTimeout(techTipTimer.current); techTipTimer.current = null; } },
    onPointerCancel: () => { if (!techLangeDruk.current && techTipTimer.current) { window.clearTimeout(techTipTimer.current); techTipTimer.current = null; } },
    onContextMenu: (e: { preventDefault: () => void }) => { if (techLangeDruk.current) e.preventDefault(); },
  });
  /** Довге натискання показало підказку: цей «клік» — не дія. */
  const techWasLang = () => { if (!techLangeDruk.current) return false; techLangeDruk.current = false; return true; };
  // Підтвердження завершення не висить вічно: через 6 с кнопка повертається до звичайного стану.
  useEffect(() => {
    if (!eindeBevestig) return undefined;
    const id = window.setTimeout(() => { setEindeBevestig(false); setRuimteMelding(''); }, 6000);
    return () => window.clearTimeout(id);
  }, [eindeBevestig]);
  useEffect(() => () => { if (techTipTimer.current) window.clearTimeout(techTipTimer.current); }, []);

  const pauzeKnop = async (aan: boolean) => {
    setEindeBevestig(false);
    try {
      await pauzeer(aan);
      setRuimteMelding(aan ? (uk ? 'Технічний доступ на паузі в усіх вкладках. Щоб продовжити, натисніть «Технічний»: новий вхід не потрібен.' : 'Technische toegang gepauzeerd in alle tabbladen. Klik op «Technisch» om door te gaan: opnieuw aanmelden is niet nodig.') : (uk ? 'Технічний доступ знову працює.' : 'De technische toegang werkt weer.'));
    } catch { setRuimteMelding(uk ? 'Не вдалося. Спробуйте ще раз.' : 'Dat lukte niet. Probeer het opnieuw.'); }
  };
  const eindeKnop = async () => {
    if (!eindeBevestig) {
      setEindeBevestig(true);
      setRuimteMelding(uk ? 'Натисніть кнопку завершення ще раз, щоб закрити технічний сеанс в усіх вкладках.' : 'Klik nogmaals op beëindigen om de technische sessie in alle tabbladen te sluiten.');
      return;
    }
    setEindeBevestig(false);
    try { await beeindigen(); setRuimteMelding(uk ? 'Технічний доступ завершено. Щоб повернутися, потрібен новий вхід.' : 'Technische toegang beëindigd. Terugkomen vraagt een nieuwe aanmelding.'); }
    catch { setRuimteMelding(uk ? 'Не вдалося завершити. Спробуйте ще раз.' : 'Beëindigen lukte niet. Probeer het opnieuw.'); }
  };
  const zetTechnischUit = async () => {
    setToegangOpen(false);
    if (v2Ruimtes && ruimtes.status?.aan) {
      try {
        await beeindigen();
        return;
      } catch {
        /* запасний шлях нижче */
      }
    }
    try {
      await techBeeindigen();
    } catch {
      onClose();
      openTechVenster('activeren');
    }
  };

  // Пропорційне розтягування вікна за нижній лівий або нижній правий кутик (78%..134%)
  const startSchalen = (richting: 'left' | 'right') => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startSchaal = voorkeuren.schaal;
    const opMove = (ev: PointerEvent) => {
      const dx = richting === 'left' ? startX - ev.clientX : ev.clientX - startX;
      const dy = ev.clientY - startY;
      const delta = (dx + dy) / 520;
      zetAccountmenuV3Schaal(begrensschaal(startSchaal + delta));
    };
    const opUp = () => {
      window.removeEventListener('pointermove', opMove);
      window.removeEventListener('pointerup', opUp);
    };
    window.addEventListener('pointermove', opMove);
    window.addEventListener('pointerup', opUp);
  };

  const actieveSessies = visibleRows.filter((item) => rememberedAccountStatus(item) === 'active');
  const gestapeldeVleugel = visibleRows.length >= 3;
  const toonAccountsKaart = displayUser
    ? (shouldShowOtherAccountsToggle || voorkeuren.indeling === 'kaart')
    : (visibleRows.length > 0 || loading || loadFailed || voorkeuren.indeling === 'kaart');
  const lijstOpen = displayUser ? expanded : !afgemeldIngeklapt;
  const wisselLijstOpen = () => {
    if (displayUser) onToggleExpanded();
    else setAfgemeldIngeklapt((v) => !v);
  };
  const addKnopTitel = !displayUser && visibleRows.length === 0
    ? (uk ? 'Увійти в обліковий запис' : 'Aanmelden bij uw account')
    : (uk ? 'Увійти в інший обліковий запис' : 'Aanmelden bij een ander account');

  return (
    <div
      ref={shellRef}
      className='am3-shell'
      data-am3-indeling={voorkeuren.indeling}
      data-am3-tech={isTechActief ? 'aan' : 'uit'}
      data-am3-signed-out={displayUser ? undefined : 'ja'}
      data-am3-mobiel={mobiel ? 'ja' : undefined}
      style={{
        ['--am3-shield-color' as string]: schildKleur,
        ['--am3-shield-fg' as string]: BAND_KLEUREN[bandKleurId]?.fg || '#1a1a1a',
        ['--am3-palette-color' as string]: paletKleur,
      }}
    >
      <div className={`am3-tech-strip${isTechActief ? ' is-active' : ''}`} aria-hidden='true' />

      {mobiel ? (
        <button
          type='button'
          className='am3-mobiel-sluit'
          aria-label={uk ? 'Закрити меню облікового запису' : 'Accountmenu sluiten'}
          title={uk ? 'Закрити' : 'Sluiten'}
          onClick={onClose}
        >
          <X aria-hidden='true' />
        </button>
      ) : null}

      {/* 1. Шапка профілю: єдина композиція Орбіти світлин (Режим А) або центрального знака (Режим Б) і до входу, і після входу */}
      <header className='am3-hero canonical-current-account'>
        {voorkeuren.indeling === 'orbita' ? (
          <div className='am3-orbit-stage' data-am3-orbit='stage'>
            <div className='am3-orbit-wing is-left'>
              {visibleRows.length > 0 ? (
                <div
                  className={`am3-wing-list ${gestapeldeVleugel ? 'is-stacked' : 'is-spacious'}`}
                  data-am3-wing-mode={gestapeldeVleugel ? 'stacked' : 'spacious'}
                  role='group'
                  aria-label={uk ? 'Швидке перемикання облікових записів' : 'Snel wisselen tussen accounts'}
                >
                  {visibleRows.slice(0, 4).map((item) => {
                    const st = rememberedAccountStatus(item);
                    const naam = item.user.name || item.user.email;
                    const isSelecting = Boolean(item.grantId) && selecting === item.grantId;
                    const actieTekst = displayUser || st === 'active' || st === 'signed_in'
                      ? (uk ? `Перемкнутися на ${naam}` : `Wisselen naar ${naam}`)
                      : (uk ? `Увійти як ${naam}` : `Aanmelden als ${naam}`);
                    return (
                      <button
                        key={item.grantId || item.user.email}
                        type='button'
                        className='am3-orbit-node'
                        data-selecting={isSelecting ? 'ja' : undefined}
                        aria-busy={isSelecting || undefined}
                        disabled={busy || isSelecting || !item.grantId}
                        title={`${actieTekst} (${item.user.email})`}
                        aria-label={actieTekst}
                        onClick={() => void onSelectAccount(item)}
                      >
                        {renderAvatar(item.user, 'regular')}
                        <span className={`am3-orbit-dot${st === 'active' || st === 'signed_in' ? '' : ' is-expired'}`} aria-hidden='true' />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className='am3-center-avatar-wrap canonical-current-photo'>
              <div className='am3-center-avatar'>
                {displayUser ? (
                  renderAvatar(displayUser, 'profile')
                ) : (
                  <span className='canonical-account-avatar avatar-profile'>
                    <UserRound aria-hidden='true' />
                  </span>
                )}
              </div>
              {displayUser && onChangePhoto ? (
                <>
                  <button
                    type='button'
                    className='am3-camera-btn canonical-profile-camera'
                    aria-label={changePhotoLabel}
                    title={changePhotoLabel}
                    disabled={busy || photoBusy}
                    aria-busy={photoBusy}
                    data-camera-state={photoBusy ? 'busy' : 'ready'}
                    onClick={() => photoInput.current?.click()}
                  >
                    <Camera />
                  </button>
                  <input
                    ref={photoInput}
                    className='canonical-profile-photo-input'
                    type='file'
                    accept='image/jpeg,image/png,image/webp'
                    onChange={(ev) => void onChangePhoto(ev)}
                  />
                </>
              ) : null}
            </div>

            <div className='am3-orbit-wing is-right'>
              {(displayUser || visibleRows.length > 0) ? (
                <button
                  type='button'
                  className='am3-orbit-node is-add'
                  disabled={busy}
                  title={addKnopTitel}
                  aria-label={addKnopTitel}
                  onClick={onAddAccount}
                >
                  <Plus />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className='am3-center-avatar-wrap canonical-current-photo' style={{ marginBottom: '10px' }}>
            <div className='am3-center-avatar'>
              {displayUser ? (
                renderAvatar(displayUser, 'profile')
              ) : (
                <span className='canonical-account-avatar avatar-profile'>
                  <UserRound aria-hidden='true' />
                </span>
              )}
            </div>
            {displayUser && onChangePhoto ? (
              <>
                <button
                  type='button'
                  className='am3-camera-btn canonical-profile-camera'
                  aria-label={changePhotoLabel}
                  title={changePhotoLabel}
                  disabled={busy || photoBusy}
                  aria-busy={photoBusy}
                  data-camera-state={photoBusy ? 'busy' : 'ready'}
                  onClick={() => photoInput.current?.click()}
                >
                  <Camera />
                </button>
                <input
                  ref={photoInput}
                  className='canonical-profile-photo-input'
                  type='file'
                  accept='image/jpeg,image/png,image/webp'
                  onChange={(ev) => void onChangePhoto(ev)}
                />
              </>
            ) : null}
          </div>
        )}

        <span className='canonical-account-copy canonical-current-copy' data-account-visual-isolation='text'>
          <strong className='am3-user-name'>
            {displayUser ? (displayUser.name || displayUser.email) : (uk ? 'Облікові записи' : 'Accounts')}
          </strong>
          <small className='am3-user-email'>
            {displayUser
              ? displayUser.email
              : visibleRows.length > 0
                ? (uk ? 'Оберіть збережений запис або додайте інший' : 'Kies een bewaard account of voeg een ander toe')
                : (uk ? 'Увійдіть, щоб відкрити свій простір' : 'Meld u aan om uw ruimte te openen')}
          </small>
        </span>
        {displayUser && photoError ? (
          <small className='canonical-profile-photo-error' role='status'>
            {photoLeesfout || photoFailedText}
          </small>
        ) : null}

        {displayUser ? (
          onManage ? (
            <button
              type='button'
              className='am3-manage-pill canonical-menu-action primary'
              onClick={() => {
                sluitVoorNavigatie();
                onManage();
              }}
            >
              <UserRound />
              <span>{manageLabel}</span>
            </button>
          ) : null
        ) : (
          <button
            type='button'
            className='am3-manage-pill canonical-menu-action primary add-account'
            disabled={busy}
            onClick={onAddAccount}
          >
            {visibleRows.length > 0 ? <Plus aria-hidden='true' /> : <KeyRound aria-hidden='true' />}
            <span>{addKnopTitel}</span>
          </button>
        )}
      </header>

      {/* Повідомлення про помилку перемикання облікового запису */}
      {wisselFout ? (() => {
        const tekst = typeof wisselFout === 'string' ? wisselFout : wisselFout.tekst;
        const reauth = typeof wisselFout === 'object' && Boolean(wisselFout.reauth);
        return (
          <section className='am3-wissel-fout' role='alert' data-account-wissel-fout='true'>
            <p>{tekst}</p>
            {reauth ? (
              <button
                type='button'
                className='am3-manage-pill canonical-menu-action primary'
                onClick={onAddAccount}
                disabled={busy}
              >
                <KeyRound aria-hidden='true' />
                <span>{uk ? 'Увійти через Google' : 'Aanmelden via Google'}</span>
              </button>
            ) : null}
          </section>
        );
      })() : null}

      {/* Повідомлення після швидкого перемикання облікового запису */}
      {displayUser && wisselMelding ? (
        <section
          className='canonical-account-gewisseld'
          role='status'
          data-account-gewisseld='true'
          data-account-gewisseld-tech={techActief(tech) ? 'aan' : 'uit'}
          style={{ margin: '0 14px 10px' }}
        >
          <strong>{wisselMelding.kop}</strong>
          <small data-account-gewisseld-email='true'>{wisselMelding.email}</small>
          <em data-account-gewisseld-profiel={wisselMelding.profielId}>{wisselMelding.profiel}</em>
          <p>{wisselMelding.uitleg}</p>
          {wisselMelding.actie ? (
            <button
              type='button'
              className='canonical-menu-action primary'
              data-account-gewisseld-actie='tech-aan'
              onClick={() => {
                sluitVoorNavigatie();
                openTechVenster('activeren');
              }}
            >
              <ShieldCheck />
              <span>{wisselMelding.actie}</span>
            </button>
          ) : wisselMelding.geenRecht ? (
            <p data-account-gewisseld-actie='geen-recht'>{wisselMelding.geenRecht}</p>
          ) : null}
        </section>
      ) : null}

      {/* 2. Дві симетричні плитки швидкого доступу для увімкненого профілю: Налаштування та Перевірка */}
      {displayUser ? (
        <div className='am3-quick-grid' role='group' aria-label={uk ? 'Швидкі дії' : 'Snelle acties'}>
          {onSettings ? (
            <button
              type='button'
              className='am3-quick-tile'
              onClick={() => {
                sluitVoorNavigatie();
                onSettings();
              }}
            >
              <span className='am3-quick-icon' aria-hidden='true'>
                <Settings />
              </span>
              <span className='am3-quick-copy'>
                <b>{settingsLabel}</b>
                <small>{uk ? 'Меню, вигляд, мова' : 'Menu, weergave, taal'}</small>
              </span>
            </button>
          ) : null}
          <button
            type='button'
            className='am3-quick-tile'
            onClick={() => {
              sluitVoorNavigatie();
              openDiagnose();
            }}
          >
            <span className='am3-quick-icon' aria-hidden='true'>
              <LifeBuoy />
            </span>
            <span className='am3-quick-copy'>
              <b>{uk ? 'Перевірка' : 'Controle'}</b>
              <small>{uk ? 'Щось не працює?' : 'Werkt iets niet?'}</small>
            </span>
          </button>
        </div>
      ) : null}

      {/* 3. Розкривний перелік збережених / інших облікових записів */}
      {toonAccountsKaart ? (
        <section
          className='am3-accounts-card'
          aria-label={
            displayUser
              ? (uk ? 'Інші облікові записи' : 'Andere accounts')
              : (uk ? 'Збережені облікові записи' : 'Bewaarde accounts')
          }
        >
          <button
            type='button'
            className='am3-accounts-toggle canonical-other-toggle-main'
            aria-expanded={lijstOpen}
            onClick={wisselLijstOpen}
          >
            <span className='am3-accounts-toggle-left'>
              <Users aria-hidden='true' />
              <span>
                {displayUser
                  ? (uk ? `Інші облікові записи (${visibleRows.length})` : `Andere accounts (${visibleRows.length})`)
                  : (uk ? `Збережені облікові записи (${visibleRows.length})` : `Bewaarde accounts (${visibleRows.length})`)}
              </span>
            </span>
            <span className='am3-accounts-toggle-right'>
              {!lijstOpen && visibleRows.length > 0 ? (
                <span className='am3-mini-avatars' aria-hidden='true'>
                  {visibleRows.slice(0, 3).map((item) => (
                    <span key={item.grantId || item.user.email}>{renderAvatar(item.user, 'mini')}</span>
                  ))}
                </span>
              ) : null}
              <ChevronDown size={16} className='am3-accounts-chevron' aria-hidden='true' />
            </span>
          </button>

          {lijstOpen ? (
            <div
              className='am3-accounts-body canonical-account-list'
              data-account-list={displayUser ? 'other-known' : 'known'}
            >
              {loading ? (
                <p className='canonical-account-state'>
                  {uk ? 'Завантаження облікових записів…' : 'Accounts laden…'}
                </p>
              ) : null}
              {loadFailed ? (
                <p className='canonical-account-state error'>
                  {uk ? 'Не вдалося оновити перелік облікових записів.' : 'Kan de accountlijst nu niet bijwerken.'}
                </p>
              ) : null}
              {!displayUser && !loading && !loadFailed && visibleRows.length === 0 ? (
                <p className='canonical-account-empty'>
                  {uk ? 'У цьому оглядачі ще немає збережених записів.' : 'Er zijn nog geen bewaarde accounts in deze browser.'}
                </p>
              ) : null}
              {visibleRows.map((item) => {
                const st = rememberedAccountStatus(item);
                const naam = item.user.name || item.user.email;
                const isSelecting = Boolean(item.grantId) && selecting === item.grantId;
                return (
                  <div
                    key={item.grantId || item.user.email}
                    className={`am3-account-row canonical-account-row status-${st}${isSelecting ? ' is-selecting' : ''}`}
                    data-account-row-status={st}
                    data-current-account='false'
                  >
                    <button
                      type='button'
                      className='am3-account-main canonical-account-select'
                      aria-busy={isSelecting || undefined}
                      disabled={busy || isSelecting || !item.grantId}
                      onClick={() => void onSelectAccount(item)}
                    >
                      {renderAvatar(item.user, 'regular')}
                      <span className='am3-account-copy' data-account-visual-isolation='text'>
                        <strong>{naam}</strong>
                        <small>{item.user.email}</small>
                        <em className={`am3-account-status${isSelecting ? ' is-selecting' : ''}`}>
                          {statusBijschrift(st, isSelecting, uk)}
                        </em>
                      </span>
                    </button>
                    <div className='am3-account-actions'>
                      <button
                        type='button'
                        className='am3-acc-btn canonical-account-switch'
                        aria-busy={isSelecting || undefined}
                        disabled={busy || isSelecting || !item.grantId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onSelectAccount(item);
                        }}
                      >
                        {isSelecting ? (
                          <>
                            <span className='am3-acc-spinner' aria-hidden='true' />
                            <span>{uk ? 'Вхід…' : 'Bezig…'}</span>
                          </>
                        ) : (
                          <span>{st === 'active' || st === 'signed_in' ? (uk ? 'Перейти' : 'Wisselen') : (uk ? 'Увійти' : 'Aanmelden')}</span>
                        )}
                      </button>
                      {onForgetAccount && item.grantId ? (
                        <button
                          type='button'
                          className='am3-acc-btn is-icon-only canonical-account-forget'
                          disabled={busy || isSelecting || forgetting === item.grantId}
                          title={uk
                            ? 'Прибрати з цього пристрою: запис зникне зі списку, і щоб повернутися до нього, доведеться увійти знову. Сам обліковий запис, його дані та входи на інших пристроях не зміняться.'
                            : 'Van dit apparaat verwijderen: het account verdwijnt uit de lijst en om terug te gaan moet u opnieuw aanmelden. Het account zelf, de gegevens en aanmeldingen op andere apparaten blijven ongewijzigd.'}
                          aria-label={uk ? `Прибрати запис: ${item.user.email}` : `Account verwijderen: ${item.user.email}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onForgetAccount(item);
                          }}
                        >
                          <X />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {displayUser || visibleRows.length > 0 ? (
                <button
                  type='button'
                  className='am3-add-row-btn canonical-menu-action add-account'
                  disabled={busy}
                  onClick={onAddAccount}
                >
                  <Plus />
                  <span>{uk ? 'Увійти в інший обліковий запис' : 'Aanmelden bij een ander account'}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 4. Картка налаштувань вигляду та простору: Тема + Палітра (Модель В), Мова, Простір + Доступ і терміни */}
      <section className='am3-prefs-card' aria-label={uk ? 'Вигляд і простір' : 'Weergave en ruimte'}>
        {/* Рядок 1: Тема та кнопка Палітри кольорів (Модель В) */}
        <div className='am3-pref-block'>
          {paletMelding ? (
            <div className='am3-palette-toast' role='status'>
              <span className='am3-palette-toast-dot' style={{ background: paletMelding.kleur }} />
              <span>{paletMelding.tekst}</span>
            </div>
          ) : null}

          <div className='am3-pref-row is-theme-row'>
            <span className='am3-pref-label'>
              <Sun aria-hidden='true' />
              <span>{uk ? 'Тема' : 'Thema'}</span>
            </span>

            <div className='am3-pref-controls'>
              <div className='am3-seg theme-switch' role='group' aria-label={uk ? 'Режим теми' : 'Themamodus'}>
                <button
                  type='button'
                  className={`am3-seg-btn${theme === 'device' ? ' active' : ''}`}
                  aria-pressed={theme === 'device'}
                  title={uk ? 'Як на пристрої' : 'Zoals op het apparaat'}
                  onClick={() => onTheme('device')}
                >
                  <Monitor />
                </button>
                <button
                  type='button'
                  className={`am3-seg-btn${theme === 'light' ? ' active' : ''}`}
                  aria-pressed={theme === 'light'}
                  title={uk ? 'Світла тема' : 'Licht thema'}
                  onClick={() => onTheme('light')}
                >
                  <Sun />
                </button>
                <button
                  type='button'
                  className={`am3-seg-btn${theme === 'dark' ? ' active' : ''}`}
                  aria-pressed={theme === 'dark'}
                  title={uk ? 'Темна тема' : 'Donker thema'}
                  onClick={() => onTheme('dark')}
                >
                  <Moon />
                </button>
                <button
                  type='button'
                  className={`am3-seg-btn${theme === 'auto' ? ' active' : ''}`}
                  aria-pressed={theme === 'auto'}
                  data-thema-auto=''
                  title={uk ? 'За добою: світла вдень, темна вночі' : 'Op tijd van de dag: overdag licht, ’s nachts donker'}
                  onClick={() => onTheme('auto')}
                >
                  <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                    <circle cx='12' cy='12' r='4' />
                    <path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2' />
                  </svg>
                  <span>{uk ? 'За добою' : 'Dagritme'}</span>
                </button>
              </div>

              {/* Кругла кнопка «Живий фон» (32x32 px) між перемикачем тем і кнопкою кольорів */}
              <button
                type='button'
                className={`am3-achtergrond-btn${achtergrondUit ? ' is-uit' : ' is-aan'}`}
                data-achtergrond-knop=''
                data-am3-achtergrond-knop={achtergrondStand}
                aria-haspopup='dialog'
                aria-label={uk ? 'Живий фон: налаштувати анімацію тла' : 'Levende achtergrond: animatie instellen'}
                title={
                  uk
                    ? `Живий фон (${achtergrondUit ? 'вимкнено' : achtergrondStand === 'aan' ? 'повний' : 'авто'}): швидкість, інтенсивність, перелив і рух тла`
                    : `Levende achtergrond (${achtergrondUit ? 'uit' : achtergrondStand === 'aan' ? 'volledig' : 'auto'}): snelheid, sterkte, kleurverloop en beweging`
                }
                onClick={() => {
                  setPaletOpen(false);
                  sluitVoorNavigatie();
                  openAchtergrondPaneel();
                }}
              >
                <Waves className='am3-achtergrond-icon' aria-hidden='true' />
              </button>

              {/* Кругла кнопка Палітри кольорів (32x32 px) — Модель В */}
              <button
                type='button'
                className={`am3-palette-btn${paletOpen ? ' is-open' : ''}${houdtPaletVast ? ' is-holding' : ''}`}
                data-am3-palet-knop={paletSync.keuze}
                aria-expanded={paletOpen}
                aria-label={
                  uk
                    ? `Палітра кольорів (${paletSync.info.uk}): короткий натиск гортає по колу, правий натиск або утримання відкриває список`
                    : `Kleurenpalet (${paletSync.info.nl}): kort klikken wisselt, rechtsklik of ingedrukt houden opent de lijst`
                }
                title={
                  uk
                    ? `Палітра: ${paletSync.info.uk}\n• Короткий натиск — наступна палітра\n• Правий натиск або утримання — відкрити список`
                    : `Palet: ${paletSync.info.nl}\n• Kort klikken — volgend palet\n• Rechtsklik of ingedrukt houden — lijst openen`
                }
                onPointerDown={opPaletPointerDown}
                onPointerUp={opPaletPointerUp}
                onPointerLeave={opPaletPointerUp}
                onPointerCancel={opPaletPointerUp}
                onClick={opPaletClick}
                onContextMenu={opPaletContextMenu}
              >
                <svg className='am3-hold-ring' viewBox='0 0 32 32' aria-hidden='true'>
                  <circle cx='16' cy='16' r='15.5' />
                </svg>
                <Palette className='am3-palette-icon' aria-hidden='true' />
              </button>
            </div>
          </div>

          {theme === 'auto' ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type='button'
                className='am3-tray-link'
                data-thema-pauze=''
                data-thema-auto-status={autoStatus.gepauzeerd ? 'gepauzeerd' : 'actief'}
                onClick={() => (autoStatus.gepauzeerd ? hervatAuto() : pauzeerAuto())}
              >
                {autoStatus.gepauzeerd
                  ? (uk ? 'Відновити автоперемикання за добою' : 'Automatisch wisselen hervatten')
                  : (uk ? 'Призупинити автоперемикання до наступної зміни' : 'Pauzeren tot het volgende wisselmoment')}
              </button>
            </div>
          ) : null}

          {/* Розкривна поличка повного асортименту кольорових палітр */}
          {paletOpen ? (
            <div className='am3-palette-tray' role='region' aria-label={uk ? 'Вибір кольорової палітри' : 'Kleurenpalet kiezen'}>
              <div className='am3-tray-head'>
                <span>{uk ? 'Основні палітри' : 'Hoofdpaletten'}</span>
                <span className='am3-tray-head-right'>
                  <span>{uk ? paletSync.info.uk : paletSync.info.nl}{accentInfo ? ` · ${uk ? accentInfo.uk : accentInfo.nl}` : ''}</span>
                  <button
                    type='button'
                    className='am3-tray-close'
                    aria-label={uk ? 'Згорнути список палітр' : 'Paletlijst sluiten'}
                    title={uk ? 'Згорнути список палітр' : 'Paletlijst sluiten'}
                    onClick={() => setPaletOpen(false)}
                  >
                    <X />
                  </button>
                </span>
              </div>

              <div className='am3-palette-sys-grid'>
                {PALET_KEUZES_INFO.filter((p) => p.groep === 'systeem' && (p.id !== 'violet' || violetToegestaan)).map((p) => {
                  const isActief = paletSync.keuze === p.id;
                  return (
                    <button
                      key={p.id}
                      type='button'
                      className={`am3-pal-card${isActief ? ' active' : ''}`}
                      aria-pressed={isActief}
                      onClick={() => {
                        paletSync.kies(p.id);
                      }}
                    >
                      <span className='am3-pal-dot' style={{ background: p.kleur }} aria-hidden='true' />
                      <span className='am3-pal-copy'>
                        <b>{uk ? p.uk : p.nl}</b>
                        <small>{uk ? p.subUk : p.subNl}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className='am3-tray-head' style={{ marginTop: '2px' }}>
                <span>{uk ? 'Улюблений відтінок' : 'Vaste voorkeurstint'}</span>
                {accentKeuze ? (
                  <button
                    type='button'
                    className='am3-tray-link am3-tint-reset'
                    data-am3-tint-reset=''
                    title={uk ? 'Прибрати відтінок: кнопки, посилання, якорі й живе тло знову матимуть колір самої палітри' : 'Tint weghalen: knoppen, links, ankers en de levende achtergrond krijgen weer de kleur van het palet'}
                    onClick={() => zetWeergaveStijl({ accent: undefined })}
                  >
                    {uk ? 'Як у палітрі' : 'Zoals het palet'}
                  </button>
                ) : null}
              </div>

              <div className='am3-tints-row' role='group' aria-label={uk ? 'Фіксовані кольорові відтінки' : 'Vaste kleurtinten'}>
                {/* KLEUREN-001: той самий набір і ті самі назви, що в Налаштування → Теми → «Акцентна палітра» (раніше тут було 8, там 10). */}
                {accentKeuzesMet(accentKeuze || undefined).map((id) => {
                  const p = { id, kleur: ACCENT_TONEN[id].licht.accent, ...ACCENT_NAMEN[id] };
                  const isActief = accentKeuze === p.id;
                  return (
                    <button
                      key={p.id}
                      type='button'
                      className={`am3-tint-swatch${isActief ? ' active' : ''}`}
                      style={{ background: p.kleur }}
                      aria-pressed={isActief}
                      title={isActief
                        ? (uk ? `${p.uk}: обрано. Натисніть ще раз, щоб повернути колір палітри.` : `${p.nl}: gekozen. Klik nogmaals om de kleur van het palet terug te zetten.`)
                        : (uk ? `${p.uk}: кнопки, посилання, активні пункти меню й якорі, фокус і живе тло стануть цього кольору в будь-якій палітрі, світлій і темній. Фон і текст палітри не змінюються.` : `${p.nl}: knoppen, links, actieve menu-items en ankers, focus en de levende achtergrond krijgen deze kleur in elk palet, licht en donker. Achtergrond en tekst van het palet blijven.`)}
                      aria-label={uk ? p.uk : p.nl}
                      data-am3-tint={p.id}
                      onClick={() => {
                        zetWeergaveStijl({ accent: isActief ? undefined : (p.id as UiterlijkAccent) });
                      }}
                    >
                      {isActief ? <Check /> : null}
                    </button>
                  );
                })}
              </div>

              {/* ACCENT-001: прозорий режим блоків — типово вимкнено; найкраще видно з «Живим фоном». */}
              <div className='am3-tray-head' style={{ marginTop: '2px' }}>
                <span>{uk ? 'Прозорість блоків' : 'Doorschijnende blokken'}</span>
                <label className='am3-transp-schakel' title={minderTransparantie()
                  ? (uk ? 'На пристрої ввімкнено «Зменшити прозорість» — блоки лишаються суцільними, доки її не вимкнути в системі.' : 'Op het apparaat staat «Transparantie verminderen» aan — blokken blijven dicht tot u dat in het systeem uitzet.')
                  : (uk ? 'Блоки й картки стають напівпрозорими, крізь них видно тло сторінки (найкраще — з «Живим фоном»). Текст, меню й вікна лишаються суцільними.' : 'Blokken en kaarten worden half doorschijnend, de achtergrond schemert erdoor (het mooist met de levende achtergrond). Tekst, menu\'s en vensters blijven dicht.')}>
                  <input
                    type='checkbox'
                    role='switch'
                    checked={transparantie > 0}
                    data-am3-transparantie-aan=''
                    onChange={(e) => zetWeergaveStijl({ transparantie: e.target.checked ? UITERLIJK_TRANSPARANTIE_STANDAARD_AAN : undefined })}
                  />
                  <span>{transparantie > 0 ? (uk ? 'Увімкнено' : 'Aan') : (uk ? 'Вимкнено' : 'Uit')}</span>
                </label>
              </div>
              {transparantie > 0 ? (
                <label className='am3-transp-schuif'>
                  <small aria-hidden='true'>{uk ? 'Ледь' : 'Licht'}</small>
                  <input
                    type='range'
                    min={5}
                    max={100}
                    step={5}
                    value={transparantie}
                    data-am3-transparantie=''
                    aria-label={uk ? 'Ступінь прозорості блоків' : 'Mate van doorschijnendheid'}
                    aria-valuetext={`${transparantie}%`}
                    title={uk ? 'Ліворуч — ледь помітно, праворуч — виразно. Навіть на максимумі підкладка лишається щільною щонайменше на 30 %, щоб текст читався.' : 'Links — nauwelijks, rechts — duidelijk. Ook op het maximum blijft de ondergrond minstens voor 30 % dicht, zodat tekst leesbaar blijft.'}
                    onChange={(e) => zetWeergaveStijl({ transparantie: Number(e.target.value) })}
                  />
                  <small aria-hidden='true'>{uk ? 'Виразно' : 'Sterk'}</small>
                  <output aria-hidden='true'>{transparantie}%</output>
                </label>
              ) : null}

              <div className='am3-tray-footer-row'>
                <span>{uk ? 'Короткий натиск на піктограму — по колу' : 'Kort klikken op pictogram — wisselt rond'}</span>
                {displayUser && onThemeColors ? (
                  <button
                    type='button'
                    className='am3-tray-link'
                    data-thema-kleuren=''
                    onClick={() => {
                      sluitVoorNavigatie();
                      onThemeColors();
                    }}
                  >
                    {uk ? 'Вигляд і кольори: усі налаштування ↗' : 'Weergave en kleuren: alle instellingen ↗'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Рядок 2: Мова зі справжніми прапорами */}
        <div className='am3-pref-row is-lang-row'>
          <span className='am3-pref-label'>
            <Globe aria-hidden='true' />
            <span>{uk ? 'Мова' : 'Taal'}</span>
          </span>

          <div className='am3-seg language-switch' role='group' aria-label={uk ? 'Мова інтерфейсу' : 'Taal van de weergave'}>
            <button
              type='button'
              className={`am3-seg-btn${uk ? ' active' : ''}`}
              aria-pressed={uk}
              title={MOVA_VOLLEDIG.uk}
              lang='uk'
              onClick={() => onLanguage('uk')}
            >
              <span className='am3-flag' aria-hidden='true'>
                <MoviPrapor taal='uk' />
              </span>
              <span>{MOVA_VOLLEDIG.uk}</span>
            </button>
            <button
              type='button'
              className={`am3-seg-btn${!uk ? ' active' : ''}`}
              aria-pressed={!uk}
              title={MOVA_VOLLEDIG.nl}
              lang='nl'
              onClick={() => onLanguage('nl')}
            >
              <span className='am3-flag' aria-hidden='true'>
                <MoviPrapor taal='nl' />
              </span>
              <span>{MOVA_VOLLEDIG.nl}</span>
            </button>
          </div>
        </div>

        {/* Рядок 3: Простір (Звичайний | Технічний) + кругла кнопка «Доступ і терміни» (32x32 px) */}
        {heeftTech ? (
          <div className='am3-pref-block' data-ruimtes-menu='1'>
            <div className='am3-pref-row is-space-row'>
              <span className='am3-pref-label'>
                <ShieldCheck aria-hidden='true' />
                <span className='am3-pref-label-stack'>
                  <span>{uk ? 'Простір' : 'Ruimte'}</span>
                  <small className={`am3-pref-sub${isTechActief ? ' is-tech-active' : ''}`} data-ruimte-stand='1'>
                    {ruimteSubtekst}
                  </small>
                </span>
              </span>

              <div className='am3-pref-controls'>
                <div className='am3-seg' role='group' aria-label={uk ? 'Перемикач простору' : 'Ruimteschakelaar'}>
                  <button
                    type='button'
                    className={`am3-seg-btn${!isTechActief ? ' active' : ''}`}
                    aria-pressed={!isTechActief}
                    disabled={ruimtes.bezig === 'wisselen'}
                    aria-busy={ruimtes.bezig === 'wisselen' || undefined}
                    onClick={() => void schakelRuimte('prive')}
                  >
                    <UserRound />
                    <span>{uk ? 'Звичайний' : 'Gewoon'}</span>
                  </button>
                  {/* RUIMTE-WEERGAVE-001: «Технічний» + його дії (пауза, завершення) — одна пігулка; дії видно лише в технічному просторі */}
                  <span className={`am3-seg-tech${isTechActief ? ' active' : ''}${toonTechActies ? ' heeft-acties' : ''}`} data-am3-tech-blok='1'>
                    <button
                      type='button'
                      className={`am3-seg-btn is-tech-btn${isTechActief ? ' active' : ''}${techOpPauze ? ' is-pauze' : ''}`}
                      aria-pressed={isTechActief}
                      disabled={ruimtes.bezig === 'wisselen'}
                      aria-busy={ruimtes.bezig === 'wisselen' || undefined}
                      data-am3-tech-knop={isTechActief ? 'actief' : techOpPauze ? 'pauze' : 'inactief'}
                      aria-label={techOpPauze ? (uk ? 'Технічний простір на паузі. Натисніть, щоб продовжити без нового входу' : 'Technische ruimte gepauzeerd. Klik om door te gaan zonder opnieuw aan te melden') : undefined}
                      title={techOpPauze ? (uk ? 'Технічний доступ на паузі в усіх вкладках. Натисніть, щоб продовжити: новий вхід не потрібен, доки діє термін.' : 'Technische toegang gepauzeerd in alle tabbladen. Klik om door te gaan: opnieuw aanmelden is niet nodig zolang de termijn loopt.') : undefined}
                      onClick={() => void schakelRuimte('technisch')}
                    >
                      <ShieldCheck />
                      <span>{uk ? 'Технічний' : 'Technisch'}</span>
                      {techOpPauze ? <span className='am3-tech-pauze' data-am3-tech-pauze='1' aria-hidden='true'><Pause /></span> : null}
                    </button>
                    {toonTechActies ? (
                      <span className='am3-tech-acties' role='group' data-ruimte-acties='1' aria-label={uk ? 'Керування технічним сеансом' : 'Technische sessie beheren'}>
                        <button
                          type='button'
                          className='am3-tech-actie'
                          data-ruimte-pauze-knop={sessiePauze ? 'uit' : 'aan'}
                          aria-label={sessiePauze ? (uk ? 'Продовжити технічний сеанс' : 'Technische sessie hervatten') : (uk ? 'Пауза технічного сеансу' : 'Technische sessie pauzeren')}
                          {...techHoud('pauze')}
                          onClick={() => { if (techWasLang()) return; setTechTip(''); void pauzeKnop(!sessiePauze); }}
                        >
                          {sessiePauze ? <Play aria-hidden='true' /> : <Pause aria-hidden='true' />}
                          <span className={`am3-tech-tip${techTip === 'pauze' ? ' is-open' : ''}`} role='tooltip'>
                            <span className='am3-tip-head'><span className={`am3-tip-dot${sessiePauze ? '' : ' is-active'}`} /><span>{sessiePauze ? (uk ? 'Продовжити' : 'Doorgaan') : (uk ? 'Пауза' : 'Pauze')}</span></span>
                            <span className='am3-tip-sub'>{sessiePauze
                            ? (uk ? 'Технічні сторінки, служби й ШІ знову працюють. Новий вхід не потрібен, доки діє термін.' : 'Technische pagina’s, diensten en AI werken weer. Opnieuw aanmelden is niet nodig zolang de termijn loopt.')
                            : (uk ? 'Технічні сторінки закриваються в усіх вкладках, ШІ діє за своїм правилом «під час паузи». Термін не зупиняється. Продовжити можна без нового входу.' : 'Technische pagina’s sluiten in alle tabbladen, de AI volgt zijn regel «bij pauze». De termijn loopt door. Doorgaan kan zonder opnieuw aan te melden.')}</span>
                          </span>
                        </button>
                        <button
                          type='button'
                          className={`am3-tech-actie is-gevaar${eindeBevestig ? ' is-bevestig' : ''}`}
                          data-ruimte-einde-knop={eindeBevestig ? 'bevestig' : '1'}
                          aria-label={eindeBevestig ? (uk ? 'Так, завершити технічний сеанс' : 'Ja, technische sessie beëindigen') : (uk ? 'Завершити технічний сеанс' : 'Technische sessie beëindigen')}
                          {...techHoud('einde')}
                          onClick={() => { if (techWasLang()) return; setTechTip(''); void eindeKnop(); }}
                        >
                          <Power aria-hidden='true' />
                          <span className={`am3-tech-tip${techTip === 'einde' ? ' is-open' : ''}`} role='tooltip'>
                            <span className='am3-tip-head'><span className='am3-tip-dot is-gevaar' /><span>{eindeBevestig ? (uk ? 'Так, завершити' : 'Ja, beëindigen') : (uk ? 'Завершити' : 'Beëindigen')}</span></span>
                            <span className='am3-tip-sub'>{eindeBevestig
                            ? (uk ? 'Натисніть ще раз, щоб підтвердити. Сеанс закриється в усіх вкладках.' : 'Klik nogmaals om te bevestigen. De sessie sluit in alle tabbladen.')
                            : (uk ? 'Сеанс закривається в усіх вкладках, ШІ втрачає дозволи цього сеансу. Щоб повернутися, потрібен новий вхід із ключем доступу. Дані не видаляються.' : 'De sessie sluit in alle tabbladen, de AI verliest de toestemmingen van deze sessie. Terugkomen vraagt een nieuwe aanmelding met Passkey. Er worden geen gegevens gewist.')}</span>
                          </span>
                        </button>
                      </span>
                    ) : null}
                  </span>
                </div>

                {/* Кругла кнопка «Доступ і терміни» (32x32 px) з концентричним кільцем r=15.5 і спливним сповіщенням */}
                <button
                  type='button'
                  className={`am3-access-btn${isTechActief ? ' has-ring' : ''}${toegangOpen ? ' is-open' : ''}`}
                  data-am3-toegang-knop='1'
                  aria-expanded={toegangOpen}
                  aria-label={uk ? 'Доступ і терміни технічного простору' : 'Toegang en termijnen van de technische ruimte'}
                  onClick={() => {
                    setPaletOpen(false);
                    setToegangOpen((v) => !v);
                  }}
                >
                  {isTechActief ? (
                    <svg className='am3-access-ring' viewBox='0 0 32 32' aria-hidden='true'>
                      <circle className='ring-track' cx='16' cy='16' r='15.5' />
                      <circle
                        className='ring-fill'
                        cx='16'
                        cy='16'
                        r='15.5'
                        style={{ strokeDashoffset: ringDashoffset }}
                      />
                    </svg>
                  ) : null}
                  <KeyRound className='am3-access-icon' aria-hidden='true' />

                  <span className='am3-access-hover-tip' role='tooltip'>
                    <span className='am3-tip-head'>
                      <span className={`am3-tip-dot${isTechActief ? ' is-active' : ''}`} />
                      <span>{toegangTipKop}</span>
                    </span>
                    <span className='am3-tip-sub'>{toegangTipSub}</span>
                    <span className='am3-tip-hint'>{toegangTipHint}</span>
                  </span>
                </button>
              </div>
            </div>

            {/* RUIMTE-WEERGAVE-001: наслідок натиснутої дії (пауза / підтвердження / завершено) — один тихий рядок під перемикачем */}
            {ruimteMelding ? <small className='am3-ruimte-melding' role='status' data-ruimte-uitkomst='1'>{ruimteMelding}</small> : null}

            {/* Вбудований лоток «Доступ і терміни» (3 чітко розмежовані умови завершення + колір смуги + 2 повноширинні кнопки) */}
            {toegangOpen ? (
              <div className='am3-access-tray' role='region' aria-label={uk ? 'Умови завершення технічного простору' : 'Voorwaarden voor beëindiging van de technische ruimte'}>
                <div className='am3-tray-head'>
                  <span>{uk ? 'Коли завершувати технічний простір' : 'Wanneer de technische ruimte sluit'}</span>
                </div>

                <div className='am3-cond-list'>
                  {/* Умова 1: На визначений час */}
                  <div className={`am3-cond-card${actieveModus === 'tijd' && isTechActief ? ' active' : ''}`}>
                    <div
                      className='am3-cond-top'
                      role='button'
                      tabIndex={0}
                      onClick={() => void kiesVoorwaarde('tijd', 60)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void kiesVoorwaarde('tijd', 60);
                        }
                      }}
                    >
                      <span className='am3-cond-radio' aria-hidden='true' />
                      <span className='am3-cond-copy'>
                        <b>{uk ? 'На визначений час' : 'Voor een gekozen tijd'}</b>
                        <small>
                          {uk
                            ? 'Вимкнеться автоматично після закінчення обраного часу'
                            : 'Schakelt automatisch uit zodra de gekozen tijd voorbij is'}
                        </small>
                      </span>
                    </div>
                    <div className='am3-time-chips' role='group' aria-label={uk ? 'Швидкий вибір часу' : 'Snelle tijdkeuze'}>
                      <button type='button' className='am3-time-chip' onClick={() => void pasTijdAan(15, 'bijtellen')}>
                        {uk ? '+15 хв' : '+15 min'}
                      </button>
                      <button type='button' className='am3-time-chip' onClick={() => void pasTijdAan(60, 'bijtellen')}>
                        {uk ? '+1 год' : '+1 u'}
                      </button>
                      <button type='button' className='am3-time-chip' onClick={() => void pasTijdAan(240, 'vervangen')}>
                        {uk ? '4 год' : '4 u'}
                      </button>
                    </div>
                  </div>

                  {/* Умова 2: До ручного вимкнення технічного простору */}
                  <button
                    type='button'
                    className={`am3-cond-card${actieveModus === 'tot-technisch-einde' && isTechActief ? ' active' : ''}`}
                    onClick={() => void kiesVoorwaarde('tot-technisch-einde')}
                  >
                    <span className='am3-cond-top'>
                      <span className='am3-cond-radio' aria-hidden='true' />
                      <span className='am3-cond-copy'>
                        <b>{uk ? 'До ручного вимкнення технічного простору' : 'Tot handmatig uitschakelen van de technische ruimte'}</b>
                        <small>
                          {uk
                            ? 'Діятиме без обмеження часу, доки ви самі не перемкнете назад на «Звичайний»'
                            : 'Blijft actief zonder tijdlimiet tot u zelf terugschakelt naar «Gewoon»'}
                        </small>
                      </span>
                    </span>
                  </button>

                  {/* Умова 3: До виходу з цього облікового запису */}
                  <button
                    type='button'
                    className={`am3-cond-card${actieveModus === 'tot-site-uitloggen' && isTechActief ? ' active' : ''}`}
                    onClick={() => void kiesVoorwaarde('tot-site-uitloggen')}
                  >
                    <span className='am3-cond-top'>
                      <span className='am3-cond-radio' aria-hidden='true' />
                      <span className='am3-cond-copy'>
                        <b>{uk ? 'До виходу з цього облікового запису' : 'Tot afmelden bij dit account'}</b>
                        <small>
                          {uk
                            ? 'Діятиме весь поточний сеанс і завершиться разом із виходом із запису'
                            : 'Blijft actief tijdens deze sessie en stopt zodra u zich afmeldt'}
                        </small>
                      </span>
                    </span>
                  </button>
                </div>

                {/* Колір технічної смуги та щитка */}
                {tech.profiel ? (
                  <div className='am3-band-row'>
                    <span>{uk ? 'Колір смуги та щитка' : 'Kleur van strook en schild'}</span>
                    <div className='am3-band-dots' role='group' aria-label={uk ? 'Колір технічної смуги' : 'Kleur van de technische strook'}>
                      {(Object.keys(BAND_KLEUREN) as BandKleur[]).map((k) => {
                        const info = BAND_KLEUREN[k];
                        const actief = bandKleurId === k;
                        return (
                          <button
                            key={k}
                            type='button'
                            className={`am3-band-dot${actief ? ' active' : ''}`}
                            style={{ background: info.bg }}
                            aria-pressed={actief}
                            title={uk ? info.naam[0] : info.naam[1]}
                            aria-label={uk ? info.naam[0] : info.naam[1]}
                            onClick={() => void techBand(k, tech.profiel?.band?.patroon || 'strepen')}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Дві повноширинні охайні дії унизу лотка */}
                <div className='am3-access-actions'>
                  <button
                    type='button'
                    className='am3-tray-btn'
                    onClick={() => {
                      sluitVoorNavigatie();
                      openTechVenster(v2Ruimtes ? 'toegang' : 'activeren');
                    }}
                  >
                    <span className='am3-tray-btn-left'>
                      <KeyRound aria-hidden='true' />
                      <span>{uk ? 'Усі доступи та ключі' : 'Alle toegangen en sleutels'}</span>
                    </span>
                    <ChevronRight aria-hidden='true' />
                  </button>

                  {isTechActief ? (
                    <button
                      type='button'
                      className='am3-tray-btn'
                      onClick={() => void zetTechnischUit()}
                    >
                      <span className='am3-tray-btn-left'>
                        <Power className='am3-danger-icon' aria-hidden='true' />
                        <span>{uk ? 'Вимкнути технічний простір' : 'Technische ruimte uitschakelen'}</span>
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 5. Нижній рядок виходу 2А: Вийти з поточного | Вийти з усіх + кружечки активних сеансів */}
      {(displayUser && onLogout) || (showLogoutAll && onLogoutAll) ? (
        <div
          className={`am3-exit-row${displayUser && onLogout && showLogoutAll && onLogoutAll ? '' : ' is-single'} canonical-session-actions`}
        >
          {displayUser && onLogout ? (
            <button
              type='button'
              className='am3-exit-btn canonical-menu-action logout-current'
              disabled={busy}
              onClick={() => {
                sluitVoorNavigatie();
                onLogout();
              }}
            >
              <LogOut className='am3-danger-icon' aria-hidden='true' />
              <span>{uk ? 'Вийти з поточного' : 'Afmelden (huidig)'}</span>
            </button>
          ) : null}

          {showLogoutAll && onLogoutAll ? (
            <button
              type='button'
              className='am3-exit-btn canonical-menu-action logout-all'
              disabled={busy}
              onClick={() => {
                sluitVoorNavigatie();
                onLogoutAll();
              }}
            >
              <LogOut className='am3-danger-icon' aria-hidden='true' />
              <span>{uk ? 'Вийти з усіх' : 'Overal afmelden'}</span>
              {actieveSessies.length > 0 ? (
                <span className='am3-mini-avatars' aria-hidden='true'>
                  {actieveSessies.slice(0, 3).map((item) => (
                    <span key={item.grantId || item.user.email}>{renderAvatar(item.user, 'mini')}</span>
                  ))}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 6. Підвал (Конфіденційність · Умови · Масштаб) та прозорі кутові зони масштабування без видимих насічок */}
      <footer className='am3-footer canonical-account-legal'>
        <button
          type='button'
          className='am3-resize-corner is-left'
          title={uk ? 'Потягніть, щоб змінити масштаб вікна (подвійний натиск — 100%)' : 'Sleep om het venster te schalen (dubbelklik — 100%)'}
          aria-label={uk ? 'Змінити масштаб меню (лівий кутик)' : 'Menu schalen (linkerhoek)'}
          onPointerDown={startSchalen('left')}
          onDoubleClick={() => herstelAccountmenuV3Schaal()}
        />

        <a href='?legal=privacy' data-legal-link='privacy' onClick={sluitVoorNavigatie}>
          {privacyLabel}
        </a>
        <span>·</span>
        <a href='?legal=terms' data-legal-link='terms' onClick={sluitVoorNavigatie}>
          {termsLabel}
        </a>
        {voorkeuren.schaal !== SCHAAL_STANDAARD ? (
          <>
            <span>·</span>
            <button
              type='button'
              className='am3-scale-badge'
              title={uk ? 'Скинути масштаб до 100%' : 'Schaal herstellen naar 100%'}
              onClick={() => herstelAccountmenuV3Schaal()}
            >
              {Math.round(voorkeuren.schaal * 100)}%
            </button>
          </>
        ) : null}

        <button
          type='button'
          className='am3-resize-corner is-right'
          title={uk ? 'Потягніть, щоб змінити масштаб вікна (подвійний натиск — 100%)' : 'Sleep om het venster te schalen (dubbelklik — 100%)'}
          aria-label={uk ? 'Змінити масштаб меню (правий кутик)' : 'Menu schalen (rechterhoek)'}
          onPointerDown={startSchalen('right')}
          onDoubleClick={() => herstelAccountmenuV3Schaal()}
        />
      </footer>
    </div>
  );
}
