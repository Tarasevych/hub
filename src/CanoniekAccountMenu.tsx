import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ladeBediening } from './plaatsing/plaatsing-staat';
import {
  Camera,
  ChevronDown,
  FileText,
  KeyRound,
  LifeBuoy,
  Languages,
  LogOut,
  Moon,
  Monitor,
  Palette,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  SunMoon,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import StableAvatar from './StabielAvatar';
// INTEG-001 (taal): één taalvlag-component (SVG-bestanden in src/taalvlaggen/), voor dit menu én het aanmeldscherm; geen emoji, geen CSS-blokjes.
import MoviPrapor, { MOVA_NAAM, MOVA_VOLLEDIG } from './MoviPrapor';
import { openTechVenster, techActief, techGebruiker, useTech } from './tech/tech-opslag';
// Twee ruimtes (vlag tech-ruimtes-v2, standaard uit → precies het oude menu).
import { useRuimtesV2 } from './tech/ruimtes/ruimtes-vlag';
import { startRuimtes } from './tech/ruimtes/ruimtes-opslag';
import { UITLOG_KEUZES, WOORDEN } from './tech/ruimtes/teksten';
const RuimteWissel = lazy(() => import('./tech/ruimtes/RuimteWissel'));
const UITLOG_GEBEURTENIS = 'mr-ruimtes-uitloggen';
import { weergaveGebruiker } from './weergave/weergave-opslag';
import { openDiagnose } from './diagnose/open';
import { hervatAuto, pauzeerAuto, useAutoStatus } from './thema/useThema';
import {
  forgetAccountPreviewHistory,
  readAccountPreviewHistory,
  rememberAccountPreviewHistory,
  type AccountPreviewHistoryItem,
} from './account-voorbeeld-geschiedenis';
import {
  accountIdentityKey,
  buildCanonicalAccountMenuModel,
  isSameAccount,
  normalizeAccountMenuSnapshot,
  rememberedAccountStatus,
  resolveAccountPhoto,
  type AccountMenuSnapshot,
  type AccountMenuUser,
  type AccountPresenceStatus,
  type ExternalConnectableCandidate,
  type RememberedAccount,
} from './canoniek-account-menu-model';
import './canoniek-account-menu.css';
import './account-afgemeld-menu.css'; // INTEG-001: afgemeld menu op een telefoon — paneel in het midden, kleine taalknop
// UI-008 (vlag accountmenu-v2, standaard UIT): verfijnd menu. Zonder vlag blijft alles hieronder letterlijk zoals v6.
import { avatarTip, useAccountmenuV2 } from './accountmenu-v2/vlag';
import './accountmenu-v2/accountmenu-v2.css';
import { useAccountmenuV3 } from './accountmenu-v3/vlag';
import { AccountMenuV3 } from './accountmenu-v3/AccountMenuV3';
import Vraag from './tech/Vraag';
import { isLeesfout } from '../shared/bestand-lezen';
import { bestandLeesUitleg, bestandLeesfoutCode } from '../shared/foutuitleg';

export {
  rememberedAccountStatus,
  type AccountMenuSnapshot,
  type AccountMenuUser,
  type AccountPresenceStatus,
  type ExternalConnectableCandidate,
  type RememberedAccount,
} from './canoniek-account-menu-model';

export type AccountTheme = 'light' | 'dark' | 'device' | 'auto' | 'plum-light' | 'plum-dark';

type Props = {
  lang: 'uk' | 'nl';
  theme: AccountTheme;
  /** Niet meer gebruikt in dit menu (violet is nu een palet in Налаштування → Теми); blijft voor compatibiliteit. */
  plumEnabled?: boolean;
  user: AccountMenuUser | null;
  busy?: boolean;
  openRequest?: number;
  sessionStartedAt?: number;
  onManage?: () => void;
  onSettings?: () => void;
  /** Opent Налаштування → Теми (paletten, automatisch schakelen). */
  onThemeColors?: () => void;
  onAddAccount: () => void;
  onLogout?: () => void;
  onLogoutAll?: () => void;
  onLanguage: (lang: 'uk' | 'nl') => void;
  onTheme: (theme: AccountTheme) => void;
  onLoadAccounts?: () => Promise<AccountMenuSnapshot | RememberedAccount[]>;
  /**
   * KLACHT 2 VAN DE EIGENAAR (20.10.2026): «Треба додати можливість перепідключатися між акаунтами швидко, без натискання
   * "вийти з технічного".» Het wisselen zelf kon al (POST /api/owner/session/replace-tab-remembered beëindigt de technische
   * activering van het VORIGE account — R-05 van de audit van 19.10), maar de mens zag daar niets van in het menu: zij werd
   * stil in een ander profiel gezet en moest zelf raden waar zij uitkwam.
   * Daarom mag deze functie nu VERTELLEN wat er gebeurde. Geeft zij `{ techBeeindigd }` terug, dan zegt het menu het hardop
   * en biedt het de activering voor het NIEUWE account in één stap aan. Geeft zij (zoals vroeger) niets terug, dan blijft
   * alles werken: het menu meldt dan alleen in welk profiel de mens nu staat.
   */
  onSelectAccount?: (grantId: string) => void | Promise<void | { techBeeindigd?: number } | undefined>;
  onForgetAccount?: (grantId: string) => Promise<AccountMenuSnapshot>;
  onProfilePhotoChange?: (file: File) => Promise<AccountMenuUser | void>;
};

const copy = {
  uk: {
    accounts: 'Облікові записи',
    close: 'Закрити меню акаунтів',
    choose: 'Оберіть відомий акаунт або додайте інший',
    firstLoginHint: 'Увійдіть, щоб відкрити свій простір',
    none: 'Відомих облікових записів немає.',
    add: 'Додати інший обліковий запис',
    firstLogin: 'Увійти в обліковий запис через Google',
    manage: 'Керування обліковим записом',
    show: 'Показати інші облікові записи',
    hide: 'Сховати інші облікові записи',
    chooseExpanded: 'Оберіть інший відомий акаунт або додайте новий',
    settings: 'Налаштування',
    logout: 'Вийти з цього акаунту',
    logoutAll: 'Вийти з усіх акаунтів',
    language: 'Мова',
    theme: 'Тема',
    light: 'Світла',
    dark: 'Темна',
    device: 'Пристрій',
    auto: 'Авто',
    autoHint: 'Автоматично: темна, коли надворі темно (або за вашим розкладом)',
    pauze: 'Призупинити до наступного перемикання',
    hervat: 'Повернути автоперемикання',
    kleuren: 'Кольори теми…',
    privacy: 'Конфіденційність',
    terms: 'Умови',
    loading: 'Оновлюємо список…',
    loadFailed: 'Не вдалося оновити список. Поточні дані збережено.',
    forget: 'Забути цей акаунт',
    active: 'Активний',
    signedIn: 'Увійдено',
    reauth: 'Потрібен вхід',
    registration: 'Потрібне завершення реєстрації',
    changePhoto: 'Змінити фото профілю',
    photoFailed: 'Не вдалося змінити фото. Спробуйте інше зображення.',
    // Klacht 2 (20.10.2026): snel wisselen zonder eerst «вийти з технічного», en altijd zichtbaar waar je uitkwam.
    wisselKop: 'Ви перемкнулися на інший акаунт',
    wisselProfielGebruiker: 'Профіль: користувацький',
    wisselProfielTech: 'Профіль: технічний',
    wisselTechNietMee: 'Технічний профіль не переноситься між акаунтами: активація прив’язана до людини й до цієї вкладки.',
    wisselTechBeeindigd: 'Технічний профіль попереднього акаунта завершено під час перемикання.',
    wisselTechAan: 'Увімкнути технічний профіль для цього акаунта',
    wisselTechGeenRecht: 'Цей обліковий запис не має технічного профілю, тому вмикати нічого.',
  },
  nl: {
    accounts: 'Accounts',
    close: 'Accountmenu sluiten',
    choose: 'Kies een bekend account of voeg een ander toe',
    firstLoginHint: 'Meld u aan om uw ruimte te openen',
    none: 'Er zijn geen bekende accounts.',
    add: 'Ander account toevoegen',
    firstLogin: 'Aanmelden bij een account via Google',
    manage: 'Account beheren',
    show: 'Andere accounts tonen',
    hide: 'Andere accounts verbergen',
    chooseExpanded: 'Kies een ander bekend account of voeg een nieuw toe',
    settings: 'Instellingen',
    logout: 'Afmelden bij dit account',
    logoutAll: 'Afmelden bij alle accounts',
    language: 'Taal',
    theme: 'Thema',
    light: 'Licht',
    dark: 'Donker',
    device: 'Apparaat',
    auto: 'Auto',
    autoHint: 'Automatisch: donker wanneer het buiten donker is (of volgens uw schema)',
    pauze: 'Pauzeren tot de volgende wissel',
    hervat: 'Automatisch wisselen hervatten',
    kleuren: 'Themakleuren…',
    privacy: 'Privacy',
    terms: 'Voorwaarden',
    loading: 'Accountlijst bijwerken…',
    loadFailed: 'De lijst kon niet worden bijgewerkt. De huidige gegevens blijven behouden.',
    forget: 'Dit account vergeten',
    active: 'Actief',
    signedIn: 'Aangemeld',
    reauth: 'Aanmelden vereist',
    registration: 'Registratie afronden',
    changePhoto: 'Profielfoto wijzigen',
    photoFailed: 'De foto kon niet worden gewijzigd. Probeer een andere afbeelding.',
    wisselKop: 'U bent naar een ander account gewisseld',
    wisselProfielGebruiker: 'Profiel: gebruiker',
    wisselProfielTech: 'Profiel: technisch',
    wisselTechNietMee: 'Een technisch profiel gaat niet mee naar een ander account: de activering hangt aan de mens en aan dit tabblad.',
    wisselTechBeeindigd: 'Het technisch profiel van het vorige account is bij het wisselen beeindigd.',
    wisselTechAan: 'Technisch profiel voor dit account aanzetten',
    wisselTechGeenRecht: 'Dit account heeft geen technisch profiel, dus er is niets om aan te zetten.',
  },
} as const;

/**
 * KLACHT 2 VAN DE EIGENAAR (20.10.2026) — WAT HET MENU ZEGT NA EEN SNELLE WISSEL, als pure functie.
 *
 * «Треба додати можливість перепідключатися між акаунтами швидко, без натискання "вийти з технічного".» Wisselen kon al,
 * maar het gebeurde STIL: het menu ging dicht en de mens stond ergens anders zonder te weten in welk profiel. Daarom is dit
 * de enige plek waar bepaald wordt wat er na een wissel te lezen staat — pure invoer, pure uitvoer, dus de eenheidstest
 * meet de echte regels en niet een stuk tekst uit de bron:
 *   • `profiel` zegt altijd waar de mens NU is. Na een wissel is dat het gebruikersprofiel: een technische activering hangt
 *     aan DEZE MENS en DIT TABBLAD en gaat nooit mee naar een ander account. Dat is de veiligheidsgrens, geen gebrek;
 *   • `uitleg` noemt dat met zoveel woorden, en als het technische profiel van het VORIGE account bij de wissel is
 *     beëindigd, staat dat erbij — nooit stil;
 *   • `actie` is er alleen als dit account zelf een technisch profiel HEEFT: dan is het één knop (met de gewone
 *     bevestiging). Heeft het er geen, dan `geenRecht`: een eerlijke regel in plaats van een knop die zou falen.
 */
/** UI-008: één ⓘ per blok in het v2-menu; vervangt de vaste uitlegregels (zelfde inhoud, alleen op verzoek). */
const V2_HULP = {
  sessie: {
    wat: ['Вихід, додавання іншого акаунта й вихід з усіх акаунтів у цьому браузері.', 'Afmelden, een ander account toevoegen en afmelden bij alle accounts in deze browser.'],
    gevolg: [UITLOG_KEUZES[1].gevolg.uk, UITLOG_KEUZES[1].gevolg.nl],
  },
  weergave: {
    wat: ['Мова сайту й тема. «Пристрій» — як у налаштуваннях телефона чи комп’ютера. «Авто» — темна, коли надворі темно (або за вашим розкладом).', 'Taal van de site en thema. «Apparaat» volgt de instelling van telefoon of computer. «Auto» — donker wanneer het buiten donker is (of volgens uw schema).'],
    gevolg: ['Кольори теми й розклад автоперемикання — у «Налаштування → Теми» (кнопка з палітрою).', 'Themakleuren en het schema voor automatisch wisselen staan in «Instellingen → Thema’s» (knop met het palet).'],
  },
} as const;

export type AccountWisselStand = { techBeeindigd: boolean; heeftTechProfiel: boolean; techActief: boolean; techGeladen: boolean };
export type AccountWisselMelding = { kop: string; profielId: 'gebruiker' | 'technisch'; profiel: string; uitleg: string; actie: string | null; geenRecht: string | null };
export const accountWisselMelding = (lang: 'uk' | 'nl', stand: AccountWisselStand): AccountWisselMelding => {
  const t = copy[lang];
  const profielId = stand.techActief ? 'technisch' as const : 'gebruiker' as const;
  return {
    kop: t.wisselKop,
    profielId,
    profiel: stand.techActief ? t.wisselProfielTech : t.wisselProfielGebruiker,
    uitleg: stand.techBeeindigd ? `${t.wisselTechBeeindigd} ${t.wisselTechNietMee}` : t.wisselTechNietMee,
    actie: stand.heeftTechProfiel && !stand.techActief ? t.wisselTechAan : null,
    geenRecht: !stand.heeftTechProfiel && stand.techGeladen ? t.wisselTechGeenRecht : null,
  };
};

export const rememberedAccountStatusLabel = (status: AccountPresenceStatus, lang: 'uk' | 'nl') => {
  if (status === 'active') return lang === 'uk' ? 'Активний' : 'Actief';
  if (status === 'signed_in') return lang === 'uk' ? 'Готовий до входу' : 'Klaar om te openen';
  if (status === 'registration') return lang === 'uk' ? 'Завершити реєстрацію' : 'Registratie voltooien';
  return lang === 'uk' ? 'Увійти через Google' : 'Aanmelden met Google';
};

function Avatar({ user, size = 'regular' }: { user: AccountMenuUser; size?: 'profile' | 'hero' | 'regular' | 'mini' }) {
  const photo = resolveAccountPhoto(user);
  const fallback = <span className='canonical-account-initials' aria-hidden='true'>{photo.initials}</span>;
  return (
    <span
      className={`canonical-account-avatar avatar-${size}`}
      data-account-visual-isolation='avatar'
      data-account-photo-source={photo.source}
    >
      {photo.kind === 'image'
        ? <StableAvatar key={photo.src} src={photo.src} alt='' fallback={fallback} />
        : fallback}
    </span>
  );
}

type PreviewItem = RememberedAccount | ExternalConnectableCandidate;

function IllustrativePreviews({ items, mode }: { items: PreviewItem[]; mode: 'quick' | 'stacked' }) {
  if (!items.length) return null;
  return (
    <span
      className={mode === 'stacked' ? 'canonical-stacked-preview' : 'canonical-quick-previews'}
      data-account-preview={mode}
      data-preview-interactive='false'
      aria-hidden='true'
    >
      {items.map((item, index) => (
        <span
          className='canonical-preview-avatar'
          key={`${accountIdentityKey(item.user)}-${index}`}
          style={mode === 'stacked' ? { '--preview-index': index } as CSSProperties : undefined}
        >
          <Avatar user={item.user} size='mini' />
        </span>
      ))}
    </span>
  );
}

function IconAction({
  icon,
  label,
  onClick,
  className = '',
  disabled = false,
  children,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button type='button' className={className} onClick={onClick} disabled={disabled}>
      {icon}<span>{label}</span>{children}
    </button>
  );
}

function useMobielAccountVenster(): boolean {
  const [mobiel, setMobiel] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 700px)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 700px)');
    const werkBij = () => setMobiel(media.matches);
    werkBij();
    media.addEventListener?.('change', werkBij);
    return () => media.removeEventListener?.('change', werkBij);
  }, []);
  return mobiel;
}

export default function CanonicalAccountMenu({
  lang,
  theme,
  user,
  busy = false,
  openRequest = 0,
  sessionStartedAt = 0,
  onManage,
  onSettings,
  onThemeColors,
  onAddAccount,
  onLogout,
  onLogoutAll,
  onLanguage,
  onTheme,
  onLoadAccounts,
  onSelectAccount,
  onForgetAccount,
  onProfilePhotoChange,
}: Props) {
  const t = copy[lang];
  const tech = useTech();
  const v2 = useRuimtesV2();
  const am2 = useAccountmenuV2();
  const am3 = useAccountmenuV3();
  const mobielVenster = useMobielAccountVenster();
  useEffect(() => { if (v2) startRuimtes(); }, [v2]);
  // «Вийти з акаунта на сайті» / «Вийти всюди» uit het venster «Вийти» (src/tech/ruimtes/UitloggenKeuze.tsx) → de echte afmelding hier.
  useEffect(() => {
    if (!v2) return;
    const op = (e: Event) => { const k = (e as CustomEvent<string>).detail; if (k === 'site') onLogout?.(); };
    window.addEventListener(UITLOG_GEBEURTENIS, op);
    return () => window.removeEventListener(UITLOG_GEBEURTENIS, op);
  }, [v2, onLogout]);
  const techUid = user?.id;
  useEffect(() => { if (techUid !== undefined) { techGebruiker(techUid); weergaveGebruiker(techUid); } }, [techUid]);
  const root = useRef<HTMLDivElement>(null);
  const portaalRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // UI-008: de tooltip van de kleine avatar noemt ook hoeveel andere accounts er zijn; die lijst één keer ophalen bij aanwijzen.
  const geladenVoorTip = useRef(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<AccountMenuSnapshot>({ accounts: [], previews: [], externalCandidates: [] });
  const [history, setHistory] = useState<AccountPreviewHistoryItem[]>(readAccountPreviewHistory);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selecting, setSelecting] = useState('');
  const [forgetting, setForgetting] = useState('');
  const [profileOverride, setProfileOverride] = useState<AccountMenuUser | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  // Leesfout van de schijf (File API) krijgt de echte oorzaak + handeling; «probeer een andere afbeelding» zou dan onjuist zijn.
  const [photoLeesfout, setPhotoLeesfout] = useState('');
  /**
   * Klacht 2: na een SNELLE WISSEL blijft het menu open en staat hier wat er feitelijk gebeurde — in welk account en in welk
   * profiel de mens nu is, en of het technische profiel van het vorige account is beëindigd. Geen stille overgang tussen
   * profielen: een technische activering is aan EEN MENS EN EEN TABBLAD gebonden en gaat nooit mee naar een ander account.
   */
  const [gewisseld, setGewisseld] = useState<{ naam: string; email: string; techBeeindigd: boolean } | null>(null);

  const close = () => {
    setOpen(false);
    setExpanded(false);
    setGewisseld(null);
  };

  const sluitMetLade = () => {
    close();
    if (mobielVenster) ladeBediening()?.sluit();
  };

  const applySnapshot = (next: AccountMenuSnapshot) => {
    setSnapshot(next);
    // History can refine MRU only for authoritative accounts; it never creates preview candidates.
    const values = next.accounts.map((item) => ({ ...item.user, lastUsedAt: item.lastUsedAt }));
    setHistory(rememberAccountPreviewHistory(values));
    return next;
  };

  const load = async () => {
    if (!onLoadAccounts) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      applySnapshot(normalizeAccountMenuSnapshot(await onLoadAccounts()));
    } catch (caught) {
      const status = Number(
        (caught as { status?: number; response?: { status?: number } })?.status ??
          (caught as { response?: { status?: number } })?.response?.status ??
          0,
      );
      if (user && status !== 401 && status !== 403) {
        setLoadFailed(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    setProfileOverride(null);
    setPhotoError(false);
    setLoadFailed(false);
  }, [user?.id, user?.accountId, user?.email, user?.picture, user?.customPicture, user?.customPhoto, user?.providerPicture]);

  const displayUser = profileOverride && user && isSameAccount(profileOverride, user) ? profileOverride : user;

  useEffect(() => {
    if (!displayUser) return;
    setHistory(rememberAccountPreviewHistory([{ ...displayUser, lastUsedAt: sessionStartedAt || Date.now() }]));
  }, [displayUser?.id, displayUser?.accountId, displayUser?.email, displayUser?.name, displayUser?.picture, displayUser?.customPicture, sessionStartedAt]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!open || root.current?.contains(event.target as Node) || portaalRef.current?.contains(event.target as Node)) return;
      const target = event.target as Element;
      const opensMail = Boolean(target.closest('.google-mail-open,.mail-row-date-mode'));
      const functional = Boolean(target.closest('button,a,input,select,textarea,summary,[contenteditable="true"],[role="button"],[role="menuitem"],[role="checkbox"],[tabindex]:not([tabindex="-1"]),.mail-row-interactive,.mail-row-hover-actions'));
      if (!opensMail) {
        if (functional) {
          window.setTimeout(close, 0);
          return;
        }
        close();
        return;
      }
      const blockClick = (next: MouseEvent) => {
        next.preventDefault();
        next.stopPropagation();
      };
      document.addEventListener('click', blockClick, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', blockClick, true), 450);
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('pointerdown', outside, true);
    const onKey = (event: KeyboardEvent) => {
      // Toegankelijkheid 21.10: alleen als het accountmenu OPEN is. Zonder deze voorwaarde ving dit (altijd geregistreerde) venster-
      // luistertje elke Esc op de site — uit «Новий лист», een keuzelijst, een menu — en zette de focus op de avatar (stand 1280: Esc in
      // het venster → focus «Облікові записи» in plaats van terug op de knop die het menu opende) en blokkeerde Esc voor de rest (preventDefault).
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      close();
      document.querySelector<HTMLButtonElement>('.canonical-avatar-trigger')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const model = useMemo(
    () => buildCanonicalAccountMenuModel({ currentUser: displayUser, snapshot, history }),
    [displayUser, snapshot, history],
  );

  useEffect(() => {
    if (!open || !model.shouldShowOtherAccountsToggle) setExpanded(false);
  }, [open, model.shouldShowOtherAccountsToggle]);

  const add = () => {
    close();
    onAddAccount();
  };

  /**
   * SNEL WISSELEN (klacht 2). Vroeger: wisselen en het menu dichtgooien — de mens stond ergens anders zonder te weten waar,
   * en wie in een technisch profiel zat, dacht dat zij eerst «Вийти з технічного» moest indrukken. Nu:
   *   • wisselen gaat direct, zonder eerst het technische profiel te verlaten (dat doet de server zelf voor het VORIGE
   *     account, en alleen daarvoor);
   *   • het menu BLIJFT OPEN en zegt in welk account en in welk profiel de mens nu staat;
   *   • het technische profiel gaat NIET mee — dat is de veiligheidsgrens, niet een gebrek — en wie recht heeft, zet het
   *     voor het nieuwe account met één knop aan (dezelfde stap met bevestiging als altijd).
   * De nieuwe stand van het technische profiel komt uit de store (de aanroeper vraagt /api/owner/tech/status opnieuw), dus
   * hier wordt niets geraden.
   */
  const select = async (item: RememberedAccount) => {
    if (!item.grantId || !onSelectAccount) return;
    setSelecting(item.grantId);
    try {
      const uit = await onSelectAccount(item.grantId);
      const beeindigd = Number((uit as { techBeeindigd?: unknown } | void | undefined)?.techBeeindigd || 0) > 0;
      setGewisseld({ naam: item.user.name || item.user.email, email: item.user.email, techBeeindigd: beeindigd });
      setExpanded(false);
    } finally {
      setSelecting('');
    }
  };

  const forget = async (item: RememberedAccount) => {
    if (!onForgetAccount) return;
    setForgetting(item.grantId);
    setLoadFailed(false);
    try {
      const next = applySnapshot(normalizeAccountMenuSnapshot(await onForgetAccount(item.grantId)));
      const retained = next.accounts.some((row) => isSameAccount(row.user, item.user)) || Boolean(displayUser && isSameAccount(displayUser, item.user));
      if (!retained) setHistory(forgetAccountPreviewHistory(item.user));
    } catch {
      setLoadFailed(true);
    } finally {
      setForgetting('');
    }
  };

  const changePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onProfilePhotoChange) return;
    setPhotoBusy(true);
    setPhotoError(false);
    setPhotoLeesfout('');
    try {
      const next = await onProfilePhotoChange(file);
      if (next) setProfileOverride(next);
    } catch (caught) {
      if (isLeesfout(caught)) { const u = bestandLeesUitleg(lang, bestandLeesfoutCode(caught)); setPhotoLeesfout(`${u.waarom} ${u.doen}`); }
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
    }
  };

  const light = theme === 'light';
  const dark = theme === 'dark';
  const device = theme === 'device';
  const auto = theme === 'auto';
  const autoStatus = useAutoStatus(theme);
  const showLogoutAll = Boolean(onLogoutAll) && model.shouldShowLogoutAll;
  const visibleRows = displayUser ? model.visibleExpandedAccounts : model.knownAccounts;

  const list = (
    <div className='canonical-account-list' data-account-list={displayUser ? 'other-known' : 'known'}>
      {visibleRows.length ? visibleRows.map((item) => {
        const status = rememberedAccountStatus(item);
        return (
          <div
            className={`canonical-account-row status-${status}`}
            key={item.grantId || accountIdentityKey(item.user)}
            data-account-row-status={status}
            data-current-account='false'
          >
            <button
              type='button'
              className='canonical-account-select'
              disabled={busy || selecting === item.grantId || !item.grantId}
              onClick={() => void select(item)}
            >
              <Avatar user={item.user} />
              <span className='canonical-account-copy' data-account-visual-isolation='text'>
                <strong>{item.user.name || item.user.email}</strong>
                <small>{item.user.email}</small>
                <span className='canonical-account-statuses'>
                  <em>
                    {selecting === item.grantId
                      ? (lang === 'uk' ? 'Переходимо до входу…' : 'Doorsturen naar aanmelding…')
                      : rememberedAccountStatusLabel(status, lang)}
                  </em>
                </span>
              </span>
              {selecting === item.grantId
                ? <span className='canonical-account-spinner' />
                : <ChevronDown className='canonical-account-enter' />}
            </button>
            {onForgetAccount && item.grantId && (
              <button
                type='button'
                className='canonical-account-forget'
                aria-label={`${t.forget}: ${item.user.email}`}
                title={t.forget}
                disabled={busy || forgetting === item.grantId}
                onClick={() => void forget(item)}
              >
                <X />
              </button>
            )}
          </div>
        );
      }) : <p className='canonical-account-empty'>{t.none}</p>}
    </div>
  );

  const controls = (
    <div className='canonical-preference-strip with-plum'>
      <div className='canonical-compact-setting' aria-label={t.language} title={t.language}>
        <Languages />
        <div className='canonical-segmented language-switch' role='group' aria-label={t.language}>
          <button type='button' className={lang === 'uk' ? 'active' : ''} onClick={() => onLanguage('uk')}>
            <MoviPrapor taal='uk' /><b>{MOVA_NAAM.uk}</b>
          </button>
          <button type='button' className={lang === 'nl' ? 'active' : ''} onClick={() => onLanguage('nl')}>
            <MoviPrapor taal='nl' /><b>{MOVA_NAAM.nl}</b>
          </button>
        </div>
      </div>
      <span className='canonical-setting-divider' />
      <div className='canonical-compact-setting' aria-label={t.theme} title={t.theme}>
        <Palette />
        <div className='canonical-segmented theme-switch' role='group' aria-label={t.theme}>
          <button type='button' className={light ? 'active' : ''} onClick={() => onTheme('light')}>
            <Sun /><b>{t.light}</b>
          </button>
          <button type='button' className={dark ? 'active' : ''} onClick={() => onTheme('dark')}>
            <Moon /><b>{t.dark}</b>
          </button>
          <button type='button' className={device ? 'active' : ''} onClick={() => onTheme('device')}>
            <Monitor /><b>{t.device}</b>
          </button>
          <button type='button' className={auto ? 'active' : ''} onClick={() => onTheme('auto')} title={t.autoHint} data-thema-auto>
            <SunMoon /><b>{t.auto}</b>
          </button>
        </div>
      </div>
      {auto && (
        <div className='canonical-thema-auto' data-thema-auto-status={autoStatus.gepauzeerd ? 'gepauzeerd' : 'actief'}>
          <button type='button' className='canonical-thema-pauze' onClick={() => (autoStatus.gepauzeerd ? hervatAuto() : pauzeerAuto())} data-thema-pauze>
            {autoStatus.gepauzeerd ? t.hervat : t.pauze}
          </button>
        </div>
      )}
      <div className='canonical-thema-kleuren-link'>
        <button type='button' onClick={() => { close(); onThemeColors?.(); }} data-thema-kleuren>{t.kleuren}</button>
      </div>
    </div>
  );

  const themaKnoppen = [
    { id: 'light' as const, aan: light, icon: <Sun />, label: t.light },
    { id: 'dark' as const, aan: dark, icon: <Moon />, label: t.dark },
    { id: 'device' as const, aan: device, icon: <Monitor />, label: t.device },
    { id: 'auto' as const, aan: auto, icon: <SunMoon />, label: t.auto },
  ];
  const controlsV2 = (
    <div className='am2-blok am2-weergave' data-am2-blok='weergave'>
      <div className='am2-rij' role='group' aria-label={t.language}>
        <span className='am2-rij-kop' title={t.language}><Languages aria-hidden='true' /><span className='am2-verborgen'>{t.language}</span></span>
        <div className='canonical-segmented am2-seg language-switch' role='group' aria-label={t.language}>
          <button type='button' className={lang === 'uk' ? 'active' : ''} aria-pressed={lang === 'uk'} onClick={() => onLanguage('uk')} title={MOVA_VOLLEDIG.uk} lang='uk'>
            <span className='am2-vlag' data-am2-vlag='uk' aria-hidden='true'><MoviPrapor taal='uk' /></span><b>{MOVA_NAAM.uk}</b>
          </button>
          <button type='button' className={lang === 'nl' ? 'active' : ''} aria-pressed={lang === 'nl'} onClick={() => onLanguage('nl')} title={MOVA_VOLLEDIG.nl} lang='nl'>
            <span className='am2-vlag' data-am2-vlag='nl' aria-hidden='true'><MoviPrapor taal='nl' /></span><b>{MOVA_NAAM.nl}</b>
          </button>
        </div>
        <Vraag help={V2_HULP.weergave} uk={lang === 'uk'} label={`${t.language} · ${t.theme}`} />
      </div>
      <div className='am2-rij' role='group' aria-label={t.theme}>
        <span className='am2-rij-kop' title={t.theme}><Palette aria-hidden='true' /><span className='am2-verborgen'>{t.theme}</span></span>
        <div className='canonical-segmented am2-seg theme-switch' role='group' aria-label={t.theme}>
          {themaKnoppen.map((k) => (
            <button key={k.id} type='button' className={k.aan ? 'active' : ''} aria-pressed={k.aan} aria-label={k.label} title={k.id === 'auto' ? t.autoHint : k.label} onClick={() => onTheme(k.id)} data-thema-auto={k.id === 'auto' ? '' : undefined} data-am2-thema={k.id}>
              {k.icon}<b className='am2-thema-naam'>{k.label}</b>
            </button>
          ))}
        </div>
        {auto ? (
          <button type='button' className='am2-ikoon' data-thema-pauze aria-label={autoStatus.gepauzeerd ? t.hervat : t.pauze} title={autoStatus.gepauzeerd ? t.hervat : t.pauze} aria-pressed={autoStatus.gepauzeerd} onClick={() => (autoStatus.gepauzeerd ? hervatAuto() : pauzeerAuto())} data-thema-auto-status={autoStatus.gepauzeerd ? 'gepauzeerd' : 'actief'}>
            {autoStatus.gepauzeerd ? <SunMoon /> : <Moon />}
          </button>
        ) : null}
        <button type='button' className='am2-ikoon' data-thema-kleuren aria-label={t.kleuren.replace('…', '')} title={t.kleuren.replace('…', '')} onClick={() => { close(); onThemeColors?.(); }}>
          <Settings />
        </button>
      </div>
    </div>
  );

  const footer = (
    <div className='canonical-account-legal'>
      <a href='?legal=privacy' data-legal-link='privacy' onClick={close}><ShieldCheck />{t.privacy}</a>
      <span>·</span>
      <a href='?legal=terms' data-legal-link='terms' onClick={close}><FileText />{t.terms}</a>
    </div>
  );

  const wisselMeldingData = gewisseld
    ? {
        email: gewisseld.email,
        ...accountWisselMelding(lang, {
          techBeeindigd: gewisseld.techBeeindigd,
          heeftTechProfiel: !!tech.profiel,
          techActief: techActief(tech),
          techGeladen: tech.geladen,
        }),
      }
    : null;

  return (
    <div
      className='canonical-account-menu'
      ref={root}
      data-account-menu-version='v6'
      data-account-menu-model='canonical-v1'
      data-account-menu-expanded={expanded ? 'true' : 'false'}
      data-current-account-header-only={model.currentAccount ? 'true' : 'not-applicable'}
      data-preview-exclusive={expanded ? 'add' : model.shouldShowOtherAccountsToggle ? 'switch' : 'none'}
      data-known-account-list-empty={model.knownAccounts.length === 0 ? 'true' : 'false'}
      data-other-accounts-toggle-visible={model.shouldShowOtherAccountsToggle ? 'true' : 'false'}
      data-logout-all-visible={showLogoutAll ? 'true' : 'false'}
      data-first-login={model.isFirstLogin ? 'true' : 'false'}
      data-signed-out={!displayUser ? 'true' : 'false'}
      data-profile-photo-control={onProfilePhotoChange ? 'enabled' : 'unavailable'}
      data-account-menu-v2={am2 ? 'aan' : undefined}
      data-account-menu-v3={am3 ? 'aan' : undefined}
    >
      {!displayUser && <div className='mr-sign-in-quick-controls' role='group' aria-label={lang === 'uk' ? 'Мова й тема' : 'Taal en thema'}>
        {/* Taal: echte vlag (SVG) + korte naam; klik wisselt. Dezelfde plek als voorheen, kleiner, met ruimte naast het thema-knopje. */}
        <button type='button' className='mr-sign-in-taal' aria-label={lang === 'uk' ? `${MOVA_NAAM.uk} · змінити мову на нідерландську` : `${MOVA_NAAM.nl} · taal wijzigen naar Oekraïens`} title={lang === 'uk' ? 'Мова: українська' : 'Taal: Nederlands'} onClick={() => onLanguage(lang === 'uk' ? 'nl' : 'uk')}>
          <MoviPrapor taal={lang} /><b>{MOVA_NAAM[lang]}</b>
        </button>
        <button type='button' aria-label={lang === 'uk' ? 'Перемкнути тему' : 'Thema wisselen'} title={lang === 'uk' ? 'Перемкнути світлу / темну тему' : 'Licht / donker wisselen'} onClick={() => onTheme(theme === 'dark' ? 'light' : theme === 'plum-dark' ? 'plum-light' : theme === 'plum-light' ? 'plum-dark' : 'dark')}>
          {dark || theme === 'plum-dark' ? <Moon aria-hidden='true'/> : <Sun aria-hidden='true'/>}
        </button>
      </div>}
      <button
        type='button'
        className='canonical-avatar-trigger'
        aria-label={open ? t.close : (am2 || am3) && displayUser ? `${t.accounts}: ${displayUser.name || displayUser.email}` : t.accounts}
        title={(am2 || am3) && !open && displayUser ? avatarTip(lang, displayUser.name || '', displayUser.email || '', model.knownAccounts.filter((a) => !isSameAccount(a.user, displayUser)).length) : undefined}
        data-am2-tip={am2 && displayUser ? 'ja' : undefined}
        onPointerEnter={(am2 || am3) && !open && !geladenVoorTip.current ? () => { geladenVoorTip.current = true; void load(); } : undefined}
        onFocus={(am2 || am3) && !open && !geladenVoorTip.current ? () => { geladenVoorTip.current = true; void load(); } : undefined}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => open ? close() : setOpen(true)}
      >
        {open
          ? <span className='canonical-avatar-close' data-account-trigger-open='close'><X /></span>
          : displayUser
            ? <Avatar user={displayUser} size='hero' />
            : <span className='canonical-account-avatar avatar-hero'><UserRound /></span>}
      </button>

      {open && am3 && mobielVenster && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={portaalRef}
              className='am3-mobiel-laag'
              data-account-menu-v3='aan'
              data-no-edge-swipe='1'
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <div className='am3-mobiel-scrim' aria-hidden='true' onClick={close} />
              <section
                className='canonical-account-panel am3-mobiel-paneel'
                role='dialog'
                aria-modal='true'
                aria-label={t.accounts}
              >
                <AccountMenuV3
                  lang={lang}
                  theme={theme}
                  displayUser={displayUser}
                  visibleRows={visibleRows}
                  shouldShowOtherAccountsToggle={model.shouldShowOtherAccountsToggle}
                  expanded={expanded}
                  onToggleExpanded={() => { setExpanded((value) => !value); }}
                  busy={busy}
                  selecting={selecting}
                  forgetting={forgetting}
                  loading={loading}
                  loadFailed={loadFailed}
                  photoBusy={photoBusy}
                  photoError={photoError}
                  photoLeesfout={photoLeesfout}
                  photoFailedText={t.photoFailed}
                  changePhotoLabel={t.changePhoto}
                  manageLabel={t.manage}
                  settingsLabel={t.settings}
                  privacyLabel={t.privacy}
                  termsLabel={t.terms}
                  showLogoutAll={showLogoutAll}
                  wisselMelding={wisselMeldingData}
                  v2Ruimtes={v2}
                  onChangePhoto={onProfilePhotoChange ? changePhoto : undefined}
                  onSelectAccount={select}
                  onForgetAccount={onForgetAccount ? forget : undefined}
                  onAddAccount={add}
                  onManage={onManage}
                  onSettings={onSettings}
                  onTheme={onTheme}
                  onThemeColors={onThemeColors}
                  onLanguage={onLanguage}
                  onLogout={onLogout}
                  onLogoutAll={onLogoutAll}
                  onClose={close}
                  onSluitNavigatie={sluitMetLade}
                  mobiel
                  renderAvatar={(u, sz) => <Avatar user={u} size={sz} />}
                />
              </section>
            </div>,
            document.querySelector('.canonical-chrome') ?? document.body,
          )
        : null}

      {open && !(am3 && mobielVenster && typeof document !== 'undefined') && (
        <section className='canonical-account-panel' role='dialog' aria-label={t.accounts}>
          {am3 ? (
            <AccountMenuV3
              lang={lang}
              theme={theme}
              displayUser={displayUser}
              visibleRows={visibleRows}
              shouldShowOtherAccountsToggle={model.shouldShowOtherAccountsToggle}
              expanded={expanded}
              onToggleExpanded={() => { setExpanded((value) => !value); }}
              busy={busy}
              selecting={selecting}
              forgetting={forgetting}
              loading={loading}
              loadFailed={loadFailed}
              photoBusy={photoBusy}
              photoError={photoError}
              photoLeesfout={photoLeesfout}
              photoFailedText={t.photoFailed}
              changePhotoLabel={t.changePhoto}
              manageLabel={t.manage}
              settingsLabel={t.settings}
              privacyLabel={t.privacy}
              termsLabel={t.terms}
              showLogoutAll={showLogoutAll}
              wisselMelding={wisselMeldingData}
              v2Ruimtes={v2}
              onChangePhoto={onProfilePhotoChange ? changePhoto : undefined}
              onSelectAccount={select}
              onForgetAccount={onForgetAccount ? forget : undefined}
              onAddAccount={add}
              onManage={onManage}
              onSettings={onSettings}
              onTheme={onTheme}
              onThemeColors={onThemeColors}
              onLanguage={onLanguage}
              onLogout={onLogout}
              onLogoutAll={onLogoutAll}
              onClose={close}
              renderAvatar={(u, sz) => <Avatar user={u} size={sz} />}
            />
          ) : (
            <>
          {displayUser ? (
            <>
              <header className='canonical-current-account'>
                <div className='canonical-current-photo'>
                  <Avatar user={displayUser} size='profile' />
                  {onProfilePhotoChange && (
                    <>
                      <button
                        type='button'
                        className='canonical-profile-camera'
                        aria-label={t.changePhoto}
                        title={t.changePhoto}
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
                        onChange={(event) => void changePhoto(event)}
                      />
                    </>
                  )}
                </div>
                <span className='canonical-account-copy canonical-current-copy' data-account-visual-isolation='text'>
                  <strong>{displayUser.name || displayUser.email}</strong>
                  <small>{displayUser.email}</small>
                </span>
                {photoError && <small className='canonical-profile-photo-error' role='status'>{photoLeesfout || t.photoFailed}</small>}
              </header>

              {onManage && (
                <IconAction
                  icon={<UserRound />}
                  label={t.manage}
                  onClick={() => { close(); onManage(); }}
                  className='canonical-menu-action primary'
                />
              )}

              {/* Klacht 2: wat er net gebeurde, in gewone woorden — en de enige volgende stap die er is. */}
              {gewisseld && (() => {
                const m = accountWisselMelding(lang, { techBeeindigd: gewisseld.techBeeindigd, heeftTechProfiel: !!tech.profiel, techActief: techActief(tech), techGeladen: tech.geladen });
                return (
                  <section className='canonical-account-gewisseld' role='status' data-account-gewisseld='true' data-account-gewisseld-tech={techActief(tech) ? 'aan' : 'uit'}>
                    <strong>{m.kop}</strong>
                    <small data-account-gewisseld-email='true'>{gewisseld.email}</small>
                    <em data-account-gewisseld-profiel={m.profielId}>{m.profiel}</em>
                    <p>{m.uitleg}</p>
                    {m.actie ? (
                      <button
                        type='button'
                        className='canonical-menu-action primary'
                        data-account-gewisseld-actie='tech-aan'
                        onClick={() => { close(); openTechVenster('activeren'); }}
                      >
                        <ShieldCheck /><span>{m.actie}</span>
                      </button>
                    ) : m.geenRecht ? (
                      <p data-account-gewisseld-actie='geen-recht'>{m.geenRecht}</p>
                    ) : null}
                  </section>
                );
              })()}

              {model.shouldShowOtherAccountsToggle && (
                <div className='canonical-other-accounts-bar'>
                  {/* Eén hit-vlak: tekst, voorbeeldfoto's en pijl zitten in dezelfde knop (geen los pijltje-vakje ernaast). */}
                  <div className='canonical-other-toggle' data-preview-location='inside-toggle'>
                    <button
                      type='button'
                      className='canonical-other-toggle-main'
                      aria-expanded={expanded}
                      onClick={() => setExpanded((value) => !value)}
                    >
                      <Users />
                      <span>{expanded ? t.hide : t.show}</span>
                      {!expanded && (
                        <IllustrativePreviews items={model.collapsedSwitchPreviewAccounts} mode='quick' />
                      )}
                      <span className='canonical-other-toggle-pijl' aria-hidden='true'>
                        <ChevronDown />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {expanded && model.shouldShowOtherAccountsToggle && (
                <section className='canonical-expanded-accounts'>
                  <h3>{t.chooseExpanded}</h3>
                  <div className='canonical-add-account-control' data-add-account-control='composite'>
                    <button type='button' className='canonical-menu-action add-account' onClick={add} disabled={busy}>
                      <Plus /><span>{t.add}</span>
                      <IllustrativePreviews items={model.expandedAddPreviewAccounts} mode='stacked' />
                    </button>
                  </div>
                  {loading && <p className='canonical-account-state'>{t.loading}</p>}
                  {loadFailed && <p className='canonical-account-state error'>{t.loadFailed}</p>}
                  {list}
                  {showLogoutAll && (
                    <IconAction
                      icon={<Users />}
                      label={t.logoutAll}
                      onClick={() => { close(); onLogoutAll?.(); }}
                      className='canonical-menu-action logout-all'
                      disabled={busy}
                    />
                  )}
                </section>
              )}

              {am2 ? (
                <>
                  <div className='am2-blok am2-acties' data-am2-blok='acties'>
                    {onSettings && (
                      <IconAction icon={<Settings />} label={t.settings} onClick={() => { close(); onSettings(); }} className='canonical-menu-action' />
                    )}
                    {tech.profiel && v2 ? (
                      <IconAction icon={<KeyRound />} label={WOORDEN.toegangPagina[lang === 'uk' ? 'uk' : 'nl']} onClick={() => { close(); openTechVenster('toegang'); }} className='canonical-menu-action' />
                    ) : null}
                    {tech.profiel && !v2 ? (
                      <button type='button' className='canonical-menu-action' onClick={() => { close(); openTechVenster('activeren'); }}>
                        <ShieldCheck /><span>{lang === 'uk' ? 'Технічний профіль' : 'Technisch profiel'}</span>
                        <em className={`am2-stand${techActief(tech) ? ' is-aan' : ''}`}>{techActief(tech) ? (lang === 'uk' ? 'увімкнено' : 'aan') : (lang === 'uk' ? 'вимкнено' : 'uit')}</em>
                      </button>
                    ) : null}
                    {user ? <IconAction icon={<LifeBuoy />} label={lang === 'uk' ? 'Щось не працює? Перевірка' : 'Werkt iets niet? Controle'} onClick={() => { close(); openDiagnose(); }} className='canonical-menu-action' /> : null}
                  </div>
                  <div className={`am2-blok am2-sessie canonical-session-actions ${expanded ? 'expanded' : 'collapsed'}`} data-am2-blok='sessie' data-account-add-placement={expanded ? 'expanded-list' : 'session-row'}>
                    <div className='am2-sessie-rij'>
                      {!expanded && (
                        <IconAction icon={<Plus />} label={lang === 'uk' ? 'Додати акаунт' : 'Account toevoegen'} onClick={add} className='canonical-menu-action add-account session-add-account' disabled={busy} />
                      )}
                      {onLogout && (
                        <IconAction icon={<LogOut />} label={lang === 'uk' ? 'Вийти' : 'Afmelden'} onClick={() => { close(); onLogout(); }} className='canonical-menu-action logout-current' disabled={busy} />
                      )}
                      <Vraag help={V2_HULP.sessie} uk={lang === 'uk'} label={t.logout} />
                    </div>
                    {!expanded && showLogoutAll && (
                      <IconAction icon={<Users />} label={t.logoutAll} onClick={() => { close(); onLogoutAll?.(); }} className='canonical-menu-action logout-all' disabled={busy} />
                    )}
                  </div>
                </>
              ) : (
                <>
              {user ? (
                <IconAction
                  icon={<LifeBuoy />}
                  label={lang === 'uk' ? 'Щось не працює? Перевірка' : 'Werkt iets niet? Controle'}
                  onClick={() => { close(); openDiagnose(); }}
                  className='canonical-menu-action'
                />
              ) : null}
              {tech.profiel && v2 ? (
                <div className='canonical-ruimtes' data-ruimtes-menu='1'>
                  <Suspense fallback={null}><RuimteWissel taal={lang === 'uk' ? 'uk' : 'nl'} /></Suspense>
                  <IconAction
                    icon={<ShieldCheck />}
                    label={WOORDEN.toegangPagina[lang === 'uk' ? 'uk' : 'nl']}
                    onClick={() => { close(); openTechVenster('toegang'); }}
                    className='canonical-menu-action'
                  />
                </div>
              ) : null}
              {tech.profiel && !v2 ? (
                <IconAction
                  icon={<ShieldCheck />}
                  label={`${lang === 'uk' ? 'Технічний профіль' : 'Technisch profiel'} · ${techActief(tech) ? (lang === 'uk' ? 'увімкнено' : 'aan') : (lang === 'uk' ? 'вимкнено' : 'uit')}`}
                  onClick={() => { close(); openTechVenster('activeren'); }}
                  className='canonical-menu-action'
                />
              ) : null}
              {onSettings && (
                <IconAction
                  icon={<Settings />}
                  label={t.settings}
                  onClick={() => { close(); onSettings(); }}
                  className='canonical-menu-action'
                />
              )}

              <div
                className={`canonical-session-actions ${expanded ? 'expanded' : 'collapsed'}`}
                data-account-add-placement={expanded ? 'expanded-list' : 'session-row'}
              >
                {onLogout && (
                  <IconAction
                    icon={<LogOut />}
                    label={t.logout}
                    onClick={() => { close(); onLogout(); }}
                    className='canonical-menu-action logout-current'
                    disabled={busy}
                  />
                )}
                {v2 && onLogout ? <small className='canonical-ruimtes-gevolg' data-uitlog-gevolg='site'>{UITLOG_KEUZES[1].gevolg[lang === 'uk' ? 'uk' : 'nl']}</small> : null}
                {!expanded && (
                  <IconAction
                    icon={<Plus />}
                    label={t.add}
                    onClick={add}
                    className='canonical-menu-action add-account session-add-account'
                    disabled={busy}
                  />
                )}
                {!expanded && showLogoutAll && (
                  <IconAction
                    icon={<Users />}
                    label={t.logoutAll}
                    onClick={() => { close(); onLogoutAll?.(); }}
                    className='canonical-menu-action logout-all'
                    disabled={busy}
                  />
                )}
              </div>
                </>
              )}
            </>
          ) : (
            <>
              <header className='canonical-account-heading'>
                <KeyRound />
                <div>
                  <h2>{t.accounts}</h2>
                  <p>{model.isFirstLogin ? t.firstLoginHint : t.choose}</p>
                </div>
              </header>
              {loading && <p className='canonical-account-state'>{t.loading}</p>}
              {loadFailed && <p className='canonical-account-state error'>{t.loadFailed}</p>}
              {!model.isFirstLogin && list}
              <div className='canonical-add-account-control' data-add-account-control='composite'>
                <button type='button' className='canonical-menu-action add-account' onClick={add} disabled={busy}>
                  {model.isFirstLogin ? <KeyRound /> : <Plus />}
                  <span>{model.isFirstLogin ? t.firstLogin : t.add}</span>
                </button>
              </div>
            </>
          )}
          {am2 ? controlsV2 : controls}
          {am2 && displayUser && tech.profiel && v2 ? (
            <div className='am2-ruimte' data-ruimtes-menu='1' data-am2-blok='ruimte'>
              <Suspense fallback={null}><RuimteWissel taal={lang === 'uk' ? 'uk' : 'nl'} compact /></Suspense>
            </div>
          ) : null}
          {footer}
            </>
          )}
        </section>
      )}
    </div>
  );
}
