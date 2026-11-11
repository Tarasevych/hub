// Zuivere regels van het koppelvenster en van «Поштові акаунти» (geen React, geen DOM — de tests lezen dit bestand).
//
// WAAROM DIT BESTAAT (klacht van de eigenaar, 21.10.2026, telefoon, mail → Акаунти):
//   «Спроба підключення додаткового Google-акаунта пошти видала помилку» — het venster «Підключення: Gmail» →
//   «Перейти до Google» gaf een rode, algemene regel «Не вдалося розпочати підключення Gmail.».
// BEWEZEN OORZAAK (tests/eenheid/mail-accounts-beheer-20261021.test.ts, deel 1 «ДО»):
//   src/mail/MailKoppelVenster.tsx stuurde ALTIJD `accountRole:'primary'`, zonder `sourceOrigin` en zonder `tabContext`.
//   • Is de hoofd-Gmail al gekoppeld (zo bij de eigenaar: eigenaar@example.test), dan antwoordt startConsent in
//     backend/google-suite-inrichting.ts terecht 200 `{ ok:true, alreadyGranted:true }` — ZONDER authUrl. Het venster zag
//     «geen URL», gooide 'GEEN_URL' en toonde de algemene foutregel. Een TWEEDE Google-account kon zo nooit gekozen worden.
//   • Is er nog niets gekoppeld, dan weigerde dezelfde functie met 400 GOOGLE_SUITE_RETURN_TO_INVALID (geen sourceOrigin) —
//     ook dat werd «не вдалося».
// WAT HET NU IS: de rol volgt uit de ECHTE stand (is de hoofdmailbox al gekoppeld → 'additional', Google toont dan
// «prompt=consent select_account» en dus de accountkiezer), de oorsprong en het tabblad gaan mee, en elke code van de server
// krijgt een eigen zin in uk en nl. Geen «не вдалося» zonder reden meer.

export type Taal = 'uk' | 'nl';
export type GoogleRol = 'primary' | 'additional';
const t = (taal: Taal, uk: string, nl: string) => (taal === 'nl' ? nl : uk);

/** Eenvoudige, strikte e-mailcontrole (zelfde als shared/mail-aanbieders.ts → geldigMailAdres). */
const adresOf = (v: unknown): string => {
  const a = String(v ?? '').trim().toLowerCase();
  return a.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a) ? a : '';
};

/** Welke rol krijgt een nieuwe Google-koppeling? Hoofdmailbox al gekoppeld → elke volgende is een EXTRA account. */
export function googleRolVoor(stand: { accounts?: ReadonlyArray<{ accountRole?: string }> } | null | undefined, gevraagd?: GoogleRol): GoogleRol {
  if (gevraagd === 'primary' || gevraagd === 'additional') return gevraagd;
  return (stand?.accounts || []).some((a) => a.accountRole === 'primary') ? 'additional' : 'primary';
}

/**
 * Het lichaam voor POST /api/owner/mail/google-suite/onboarding/start. ALTIJD met tabContext (de poort van de gescheiden
 * gegevensruimtes kiest daarmee de lade: persoonlijk of technisch) en sourceOrigin (anders 400 GOOGLE_SUITE_RETURN_TO_INVALID).
 * `loginHint` alleen bij opnieuw koppelen van een BESTAAND extra account; bij «nog een account» bewust niets, zodat Google
 * zijn accountkiezer toont.
 */
export function googleStartLichaam(o: { taal: Taal; returnTo: string; sourceOrigin: string; tabContext: string; rol: GoogleRol; loginHint?: string; opnieuw?: boolean }) {
  const hint = adresOf(o.loginHint);
  return {
    service: 'mail', tabContext: o.tabContext, sourceOrigin: o.sourceOrigin, locale: o.taal, returnTo: o.returnTo,
    accountRole: o.rol,
    ...(hint && o.rol === 'additional' ? { loginHint: hint } : {}),
    // Opnieuw koppelen van de hoofdmailbox: zonder forceConsent zegt de server «alreadyGranted» en ziet de mens Google nooit.
    ...(o.opnieuw ? { forceConsent: true } : {}),
  };
}

/** Elke code die de start kan opleveren → een eigen, eerlijke zin. Onbekend → de code zelf staat erbij (nooit een kale «не вдалося»). */
export function googleStartFoutTekst(code: string, taal: Taal): string {
  switch (code) {
    case 'GOOGLE_SUITE_GATES_INCOMPLETE': return t(taal, 'Адміністратор ще не завершив налаштування Google на цьому сервері (Client ID, секрет, ключ шифрування або адреса повернення).', 'De beheerder heeft de Google-configuratie op deze server nog niet afgerond (Client-ID, geheim, versleutelsleutel of terugkeeradres).');
    case 'GOOGLE_SUITE_RETURN_TO_INVALID': return t(taal, 'Сервер не прийняв адресу повернення після входу в Google. Відкрийте цю сторінку на піддомені пошти й спробуйте ще раз.', 'De server accepteerde het terugkeeradres na Google niet. Open deze pagina op het mail-subdomein en probeer opnieuw.');
    case 'GOOGLE_SUITE_SEQUENCE_REQUIRED': return t(taal, 'Спершу потрібно надати попередній доступ Google у плані підключення.', 'Eerst moet de vorige Google-toestemming uit het koppelplan worden gegeven.');
    case 'GOOGLE_SUITE_STATE_CREATE_FAILED': return t(taal, 'Сервер не зміг записати одноразовий ключ входу. Спробуйте ще раз за хвилину.', 'De server kon de eenmalige aanmeldsleutel niet opslaan. Probeer het over een minuut opnieuw.');
    case 'OWNER_MAIL_SESSION_REQUIRED': return t(taal, 'Підключати пошту можна лише на сторінці пошти. Відкрийте «Поштові акаунти» на піддомені mail і натисніть ще раз.', 'Een mailbox koppelen kan alleen op de mailpagina. Open «E-mailaccounts» op het mail-subdomein en probeer opnieuw.');
    case 'STEP_UP_REQUIRED': case 'STEP_UP_STRONG_REQUIRED': return t(taal, 'Потрібне додаткове підтвердження входу — підтвердьте й натисніть ще раз.', 'Er is een extra bevestiging nodig — bevestig en probeer opnieuw.');
    case 'RUIMTE_KEUZE_ONTBREEKT': case 'KEUZE_ONTBREEKT': return t(taal, 'Для технічного простору ще не вибрано, як працює пошта (спільна чи окрема). Зробіть вибір у «Простори».', 'Voor de technische ruimte is nog niet gekozen hoe post werkt (gedeeld of eigen). Kies dat eerst bij «Ruimtes».');
    case 'RUIMTE_DIENST_UIT': case 'DIENST_UIT': return t(taal, 'Пошта вимкнена для цього простору.', 'Post staat uit voor deze ruimte.');
    case 'RUIMTE_DIENST_BEVROREN': case 'BEVROREN': return t(taal, 'Пошта цього простору заморожена — підключення нових скриньок неможливе.', 'Post van deze ruimte is bevroren — nieuwe mailboxen koppelen kan niet.');
    case 'SLEUTELKLUIS_GESLOTEN': return t(taal, 'Ключ ваших даних закритий. Розблокуйте його (Способи входу → Шифрування) і спробуйте знову.', 'Uw gegevenssleutel is gesloten. Ontgrendel hem (Aanmeldmethoden → Versleuteling) en probeer opnieuw.');
    case 'NETWORK_ERROR': return t(taal, 'Немає з’єднання з сервером. Перевірте мережу й спробуйте ще раз.', 'Geen verbinding met de server. Controleer het netwerk en probeer opnieuw.');
    case 'GEEN_URL': return t(taal, 'Сервер не повернув адресу входу Google.', 'De server gaf geen Google-aanmeldadres terug.');
    default: return `${t(taal, 'Підключення Gmail не розпочато. Код сервера:', 'De Gmail-koppeling is niet gestart. Servercode:')} ${code || 'HTTP'}`;
  }
}

// ------------------------------------------------------------------------------------------------ stand per gekoppeld account
/** Eén regel in «Підключені акаунти», ongeacht de dienst. */
export type KoppelStand = 'werkt' | 'opnieuw-aanmelden' | 'fout' | 'nog-geen-toegang' | 'losgekoppeld';

/** Microsoft-rij (app mail_accounts_v1) → stand. */
export function microsoftStand(status: string): KoppelStand {
  if (status === 'connected' || status === 'initial_sync') return 'werkt';
  if (status === 'reauth_required' || status === 'revoked') return 'opnieuw-aanmelden';
  if (status === 'degraded') return 'fout';
  if (status === 'disconnected') return 'losgekoppeld';
  return 'nog-geen-toegang'; // authorization_required, connecting
}
/** Google-principal → stand (de snapshot geeft 'connected' of, voor wat niet meer werkt, 'reauth_required'/'error'). */
export function googleStand(status: string): KoppelStand {
  return status === 'connected' ? 'werkt' : status === 'reauth_required' ? 'opnieuw-aanmelden' : 'fout';
}
/** IMAP-koppeling → stand. Een bewaarde fout van de laatste controle telt; anders werkt hij. */
export function imapStand(k: { actief?: boolean; fout?: string }): KoppelStand {
  if (k.actief === false) return 'losgekoppeld';
  if (k.fout === 'MAIL_IMAP_AANMELDEN_GEWEIGERD') return 'opnieuw-aanmelden';
  return k.fout ? 'fout' : 'werkt';
}
export function standTekst(s: KoppelStand, taal: Taal): string {
  return {
    werkt: t(taal, 'Працює', 'Werkt'),
    'opnieuw-aanmelden': t(taal, 'Потрібен повторний вхід', 'Opnieuw aanmelden nodig'),
    fout: t(taal, 'Помилка', 'Fout'),
    'nog-geen-toegang': t(taal, 'Доступ ще не надано', 'Nog geen toegang verleend'),
    losgekoppeld: t(taal, 'Відключено', 'Losgekoppeld'),
  }[s];
}

/** Wat «Відключити» per dienst wist en wat het laat staan — de tekst in het bevestigingsvenster (eerlijk per dienst). */
export function ontkoppelUitleg(dienst: 'google' | 'microsoft' | 'imap', o: { hoofd: boolean; taal: Taal }): string[] {
  const { taal } = o;
  if (dienst === 'google') return [
    t(taal, 'Доступ сайту до цієї скриньки Gmail буде відкликано (і в Google, якщо цей дозвіл не потрібен Диску чи Календарю).', 'De toegang van de site tot deze Gmail-mailbox wordt ingetrokken (ook bij Google, tenzij Drive of Agenda dezelfde toestemming nog gebruikt).'),
    ...(o.hoofd ? [t(taal, 'Це ОСНОВНИЙ акаунт. Вхід на сайт через Google НЕ зачіпається — він працює окремо від доступу до пошти. Диск, Календар і Фото, якщо підключені, залишаться.', 'Dit is het HOOFDaccount. Aanmelden op de site via Google wordt NIET geraakt — dat staat los van de mailtoegang. Drive, Agenda en Foto\'s blijven, als ze gekoppeld zijn.')] : []),
  ];
  if (dienst === 'microsoft') return [
    t(taal, 'Токен доступу Microsoft буде видалено, а підписку на нові листи скасовано.', 'Het Microsoft-toegangstoken wordt gewist en het abonnement op nieuwe berichten opgezegd.'),
    t(taal, 'Ваш вхід на сайт не зачіпається.', 'Uw aanmelding op de site wordt niet geraakt.'),
  ];
  return [
    t(taal, 'Зашифрований пароль застосунку буде видалено з сервера. Сам пароль у сервісі залишиться дійсним — за бажання відкличте його там.', 'Het versleutelde app-wachtwoord wordt van de server gewist. Het wachtwoord zelf blijft bij de dienst geldig — trek het daar in als u dat wilt.'),
    t(taal, 'Листи з IMAP-скриньок ще не завантажуються, тож локальних листів немає.', 'Berichten uit IMAP-mailboxen worden nog niet binnengehaald, dus er zijn geen lokale berichten.'),
  ];
}

/** Bevestigingscode die de server eist om LOKALE gegevens te wissen (zelfde als de bestaande Microsoft-route). */
export const WIS_BEVESTIGING = 'DELETE_MAIL_ACCOUNT_DATA';

/** Adres van «Поштові акаунти» op het mail-subdomein van DEZE installatie (BYOS: geen vaste domeinnaam). */
export function mailAccountsAdres(origin: string): string {
  try {
    const u = new URL(origin);
    const delen = u.hostname.split('.');
    if (delen.length > 2) delen[0] = 'mail'; else delen.unshift('mail');
    return `${u.protocol}//${delen.join('.')}${u.port ? `:${u.port}` : ''}/?tab=accounts`;
  } catch { return '/?tab=accounts'; }
}

/** Adres van de sleutelkluis («Способи входу → Шифрування») op het id-subdomein van DEZE installatie. */
export function sleutelkluisAdres(origin: string): string {
  try {
    const u = new URL(origin);
    const delen = u.hostname.split('.');
    if (delen.length > 2) delen[0] = 'id'; else delen.unshift('id');
    return `${u.protocol}//${delen.join('.')}${u.port ? `:${u.port}` : ''}/aanmeldmethoden#aanmeldmethoden-sleutelkluis`;
  } catch { return '/aanmeldmethoden#aanmeldmethoden-sleutelkluis'; }
}

/**
 * Het tabblad-id van dit venster (zelfde bron als src/tab-context.ts: window.name «tarasevych-tab:<id>|…» of sessionStorage), zonder
 * die module te laden — zij raakt bij het importeren `window` aan, en deze pagina wordt ook buiten de browser getekend (tests, SSR).
 */
export function huidigTabblad(): string {
  if (typeof window === 'undefined') return '';
  try {
    const naam = String(window.name || '');
    const uitNaam = naam.startsWith('tarasevych-tab:') ? naam.slice(15).split('|')[0] : '';
    const id = /^[a-f0-9]{48}$/.test(uitNaam) ? uitNaam : String(sessionStorage.getItem('tsv-canonical-tab-v1') || '');
    return /^[a-f0-9]{48}$/.test(id) ? id : '';
  } catch { return ''; }
}
