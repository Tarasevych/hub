import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  KeyRound,
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
import StableAvatar from './StableAvatar';
import { openTechVenster, techActief, techGebruiker, useTech } from './tech/tech-store';
import { weergaveGebruiker } from './weergave/weergave-store';
import { hervatAuto, pauzeerAuto, useAutoStatus } from './thema/useThema';
import {
  forgetAccountPreviewHistory,
  readAccountPreviewHistory,
  rememberAccountPreviewHistory,
  type AccountPreviewHistoryItem,
} from './account-preview-history';
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
} from './canonical-account-menu-model';
import './canonical-account-menu.css';

export {
  rememberedAccountStatus,
  type AccountMenuSnapshot,
  type AccountMenuUser,
  type AccountPresenceStatus,
  type ExternalConnectableCandidate,
  type RememberedAccount,
} from './canonical-account-menu-model';

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
  onSelectAccount?: (grantId: string) => void | Promise<void>;
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
    firstLogin: 'Увійти в обліковий запис через',
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
    pauze: 'Скасувати автоперемикання на сьогодні',
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
  },
  nl: {
    accounts: 'Accounts',
    close: 'Accountmenu sluiten',
    choose: 'Kies een bekend account of voeg een ander toe',
    firstLoginHint: 'Meld u aan om uw ruimte te openen',
    none: 'Er zijn geen bekende accounts.',
    add: 'Ander account toevoegen',
    firstLogin: 'Aanmelden bij een account via',
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
    pauze: 'Automatisch wisselen vandaag annuleren',
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
  },
} as const;

export const rememberedAccountStatusLabel = (status: AccountPresenceStatus, lang: 'uk' | 'nl') => {
  const t = copy[lang];
  return status === 'active'
    ? t.active
    : status === 'signed_in'
      ? t.signedIn
      : status === 'registration'
        ? t.registration
        : t.reauth;
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
  const techUid = user?.id;
  useEffect(() => { if (techUid !== undefined) { techGebruiker(techUid); weergaveGebruiker(techUid); } }, [techUid]);
  const root = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
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

  const close = () => {
    setOpen(false);
    setExpanded(false);
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
    } catch {
      setLoadFailed(true);
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
  }, [user?.id, user?.accountId, user?.email]);

  const displayUser = profileOverride && user && isSameAccount(profileOverride, user) ? profileOverride : user;

  useEffect(() => {
    if (!displayUser) return;
    setHistory(rememberAccountPreviewHistory([{ ...displayUser, lastUsedAt: sessionStartedAt || Date.now() }]));
  }, [displayUser?.id, displayUser?.accountId, displayUser?.email, displayUser?.name, displayUser?.picture, displayUser?.customPicture, sessionStartedAt]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!open || root.current?.contains(event.target as Node)) return;
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
      if (event.key !== 'Escape') return;
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

  const select = async (item: RememberedAccount) => {
    if (!item.grantId || !onSelectAccount) return;
    setSelecting(item.grantId);
    try {
      await onSelectAccount(item.grantId);
      close();
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
    try {
      const next = await onProfilePhotoChange(file);
      if (next) setProfileOverride(next);
    } catch {
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
                  <em>{rememberedAccountStatusLabel(status, lang)}</em>
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
            <i className='compact-flag flag-uk' /><b>Укр.</b>
          </button>
          <button type='button' className={lang === 'nl' ? 'active' : ''} onClick={() => onLanguage('nl')}>
            <i className='compact-flag flag-nl' /><b>NL</b>
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

  const footer = (
    <div className='canonical-account-legal'>
      <a href='?legal=privacy' data-legal-link='privacy' onClick={close}><ShieldCheck />{t.privacy}</a>
      <span>·</span>
      <a href='?legal=terms' data-legal-link='terms' onClick={close}><FileText />{t.terms}</a>
    </div>
  );

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
      data-profile-photo-control={onProfilePhotoChange ? 'enabled' : 'unavailable'}
    >
      <button
        type='button'
        className='canonical-avatar-trigger'
        aria-label={open ? t.close : t.accounts}
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

      {open && (
        <section className='canonical-account-panel' role='dialog' aria-label={t.accounts}>
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
                {photoError && <small className='canonical-profile-photo-error' role='status'>{t.photoFailed}</small>}
              </header>

              {onManage && (
                <IconAction
                  icon={<UserRound />}
                  label={t.manage}
                  onClick={() => { close(); onManage(); }}
                  className='canonical-menu-action primary'
                />
              )}

              {model.shouldShowOtherAccountsToggle && (
                <div className='canonical-other-accounts-bar'>
                  <div className='canonical-other-toggle' data-preview-location='inside-toggle'>
                    <button
                      type='button'
                      className='canonical-other-toggle-main'
                      onClick={() => setExpanded((value) => !value)}
                    >
                      <Users />
                      <span>{expanded ? t.hide : t.show}</span>
                      {!expanded && (
                        <IllustrativePreviews items={model.collapsedSwitchPreviewAccounts} mode='quick' />
                      )}
                    </button>
                    <button
                      type='button'
                      className='canonical-other-toggle-chevron'
                      aria-label={expanded ? t.hide : t.show}
                      onClick={() => setExpanded((value) => !value)}
                    >
                      {expanded ? <ChevronUp /> : <ChevronDown />}
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

              {tech.profiel ? (
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
          {controls}
          {footer}
        </section>
      )}
    </div>
  );
}
