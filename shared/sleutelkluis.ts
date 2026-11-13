// DE SLEUTELKLUIS — gedeelde regels, teksten en het register van gevoelige tabellen (migratie 0092, backend/sleutelkluis.ts).
//
// Puur: geen Node, geen DOM. Server, browser en tests gebruiken dezelfde constanten, zodat de envelopvorm, de HKDF-tekst
// en de herstelcode op maar één plek staan.
//
// WIE KAN WAT LEZEN, EN WANNEER (het model in één tabel; de eenheidstest tests/eenheid/sleutelkluis-20261020.test.ts bewijst
// elke regel):
//   ┌──────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
//   │ wie                              │ leest 'dek1.…'-rijen …                                                      │
//   ├──────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
//   │ de mens, in een sessie           │ zodra hij zijn sleutel opende (passkey met PRF of herstelcode); tot uitloggen │
//   │ achtergrondtaken (cron)          │ alleen terwijl de sleutel voor die mens open staat (sessie of AI-verbinding) │
//   │ een AI-verbinding (MCP-token)    │ alleen met het eigen, nog geldige token; intrekken = dicht                   │
//   │ de serverbeheerder (DB + env)    │ NOOIT zonder een mens of een geldig agenttoken                               │
//   │ een technisch profiel            │ alleen de TECHNISCHE sleutel; de persoonlijke rijen gaan ermee niet open      │
//   │ een back-up van de database      │ niets: er staat geen omslag met een serversleutel in                         │
//   └──────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

/** Envelop onder de eigen gegevenssleutel (AES-256-GCM): 'dek1.<iv>.<ct>.<tag>'. 'v1.' is de oude envelop met de serversleutel. */
export const DEK_ENVELOP = 'dek1';
export const SERVER_ENVELOP = 'v1';
export const isDekEnvelop = (v: unknown): boolean => typeof v === 'string' && v.startsWith(`${DEK_ENVELOP}.`);
/** SEC-002 (geheimen-07): ook 'v2.' … 'v9.' (dezelfde serversleutel na rotatie, server/platform/beveiliging.ts) is de serverweg. */
export const isServerEnvelop = (v: unknown): boolean => typeof v === 'string' && /^v[1-9]\./.test(v);

/** HKDF-info (en PRF-salt-label) voor de KEK uit een passkey: browser en test rekenen exact hetzelfde. */
export const KEK_INFO = 'mijn-ruimte-sleutelkluis-kek-v1';
/** Omslag van de DEK (zelfde vorm voor passkey, herstelcode en grant): 'omslag1.<iv>.<ct>.<tag>'. */
export const OMSLAG = 'omslag1';
/** AAD van een omslag: aan mens, ruimte, soort en houder gebonden — een omslag van de ene ruimte gaat nooit open voor de andere. */
export const omslagAad = (userId: string, ruimte: string, soort: string, houder: string, deel = ''): string =>
  `sleutelkluis-omslag|${userId}|${ruimte}|${soort}|${houder}|${deel}`;

export type KluisStand = 'uit' | 'gesloten' | 'open';
export const SLEUTEL_GESLOTEN_CODE = 'SLEUTELKLUIS_GESLOTEN';

// ------------------------------------------------------------------------------------------------ herstelcode
/** 20 tekens uit een alfabet zonder O/0/I/1 (32 tekens → 100 bits). Getoond als 5 groepen van 4. */
export const HERSTELCODE_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const HERSTELCODE_LENGTE = 20;
export const normaliseerHerstelcode = (v: unknown): string => String(v ?? '').toUpperCase().replace(/[^A-Z2-9]/g, '');
export const herstelcodeGeldig = (v: unknown): boolean => { const n = normaliseerHerstelcode(v); return n.length === HERSTELCODE_LENGTE && [...n].every((c) => HERSTELCODE_ALFABET.includes(c)); };
export const opmaakHerstelcode = (c: string): string => (normaliseerHerstelcode(c).match(/.{1,4}/g) || [c]).join('-');

// ------------------------------------------------------------------------------------------------ register
/**
 * ELKE tabel met persoonlijke gegevens staat hier — óf onder de eigen sleutel ('dek'), óf eerlijk als 'nog-niet' MET reden.
 * De eenheidstest vergelijkt dit register met de tabellen die de code aanraakt: een nieuwe gevoelige tabel zonder regel
 * hier laat de test falen. Klassen: 'geheim' (tokens, wachtwoorden: een lek = toegang tot een dienst van de mens),
 * 'persoonlijk' (inhoud: post, bestanden, afspraken, contacten), 'voorkeur' (instellingen, weergave, vensters).
 */
export type RegisterKlasse = 'geheim' | 'persoonlijk' | 'voorkeur';
export type RegisterStand = 'dek' | 'nog-niet';
export type RegisterRegel = {
  tabel: string; veld: string; klasse: RegisterKlasse; stand: RegisterStand; module: string;
  /** Alleen bij 'nog-niet': waarom (in beide talen), zodat de pagina het eerlijk kan zeggen. */
  reden?: { uk: string; nl: string };
};
export const SLEUTELKLUIS_REGISTER: readonly RegisterRegel[] = Object.freeze([
  // --- onder de eigen sleutel sinds dit uitrolpakket (nieuwe rijen; oude rijen blijven v1 tot «перешифрувати») ---
  { tabel: 'google_oauth_grant_v1', veld: 'ciphertext (refresh-token Google)', klasse: 'geheim', stand: 'dek', module: 'backend/google-suite-inrichting.ts' },
  { tabel: 'app.mail_imap_koppeling', veld: 'geheim (app-wachtwoord IMAP/SMTP)', klasse: 'geheim', stand: 'dek', module: 'backend/mail-imap.ts' },
  { tabel: 'app.agenda_abonnement', veld: 'geheim (CalDAV-wachtwoord)', klasse: 'geheim', stand: 'dek', module: 'backend/agenda-caldav.ts' },
  { tabel: 'github_koppeling_v1', veld: 'token/secret-zegels', klasse: 'geheim', stand: 'dek', module: 'backend/github-koppeling-opslag.ts' },
  { tabel: 'app.venster_stand', veld: 'vensters_versleuteld', klasse: 'voorkeur', stand: 'dek', module: 'backend/vensters-onthouden.ts' },
  { tabel: 'app.ai_bevestiging', veld: 'parameters/resultaat (verzoeken van AI ter bevestiging, 0094)', klasse: 'persoonlijk', stand: 'dek', module: 'backend/ai-bevestiging.ts' },
  { tabel: 'app.afzender_beeld', veld: 'data_versleuteld (foto\'s van afzenders: Google-contacten, vCard, Gravatar)', klasse: 'persoonlijk', stand: 'dek', module: 'backend/merk-bron.ts' },
  // --- nog niet: met reden ---
  { tabel: 'mail_oauth_tokens_v2', veld: 'token (Microsoft 365)', klasse: 'geheim', stand: 'nog-niet', module: 'backend/index.ts (Microsoft-tak)',
    reden: { uk: 'Гілка Microsoft у backend/index.ts — спільний файл; переносимо в окремому випуску після зняття блокування.', nl: 'De Microsoft-tak zit in backend/index.ts (gedeeld bestand); volgt in een eigen uitrol.' } },
  { tabel: 'owner_vault_v1', veld: 'ciphertext (kluis van de eigenaar)', klasse: 'geheim', stand: 'nog-niet', module: 'backend/api-platform-kluis.ts',
    reden: { uk: 'Секрети платформи (OAuth-клієнти, ключі) потрібні серверу БЕЗ людини (OAuth-колбеки, крони). Це не персональні дані користувача, а конфігурація сервера.', nl: 'Platformgeheimen (OAuth-clients) heeft de server ZONDER mens nodig (callbacks, cron). Dat is serverconfiguratie, geen persoonlijke inhoud.' } },
  { tabel: 'identity_totp_v1', veld: 'secretEnc (TOTP)', klasse: 'geheim', stand: 'nog-niet', module: 'backend/toegangslaag.ts',
    reden: { uk: 'TOTP перевіряється ДО відкриття ключа (це сам спосіб підтвердження). Шифрувати його DEK = замкнене коло.', nl: 'TOTP wordt gecontroleerd VÓÓR de sleutel open is (het is zelf de bevestiging). Onder de DEK zetten = kip-en-ei.' } },
  { tabel: 'mail_items_v1', veld: 'subject/body/snippet/senders', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/mail-*.ts',
    reden: { uk: 'Проєкція пошти читається десятками маршрутів і фільтрується в SQL (jsonb @>). Шифрування полів ламає пошук і фільтри; потрібен окремий індекс (пошук по зашифрованих даних) — окремий випуск.', nl: 'De postprojectie wordt door tientallen routes gelezen en in SQL gefilterd (jsonb @>). Velden versleutelen breekt zoeken en filters; vraagt een eigen zoekindex — eigen uitrol.' } },
  { tabel: 'app.mail_afzenders / app.mail_contacten_scan', veld: 'adressen, namen', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/mail-afzenders.ts',
    reden: { uk: 'Контакти шукаються за адресою в SQL (унікальні індекси). Те саме обмеження, що й у пошти.', nl: 'Contacten worden in SQL op adres gezocht (unieke indexen). Zelfde beperking als post.' } },
  { tabel: 'google_suite_drive_projection_v1', veld: 'name/description/webViewLink', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/google-suite-sync.ts',
    reden: { uk: 'Проєкція Drive фільтрується в SQL за назвою; зашифровані назви = сліпий список. Окремий випуск разом із поштою.', nl: 'De Drive-projectie wordt in SQL op naam gefilterd; versleutelde namen = blinde lijst. Eigen uitrol, samen met post.' } },
  { tabel: 'google_suite_calendar_events_v1 / app.agenda_externe_gebeurtenis', veld: 'summary/description/location', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/google-suite-agenda-sync.ts, backend/agenda-*.ts',
    reden: { uk: 'Події запитуються за часовим вікном у SQL і показуються у блоках хабу; план — шифрувати лише текстові поля після індексу.', nl: 'Afspraken worden in SQL op tijdvenster bevraagd; plan: alleen tekstvelden versleutelen zodra er een index is.' } },
  { tabel: 'cloud_items_v1 / app.storage', veld: 'bestandsinhoud en namen', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/cloud-platform.ts',
    reden: { uk: 'Вміст файлів у сховищі — великі обʼєкти; потрібне потокове шифрування при завантаженні/віддачі. Окремий випуск.', nl: 'Bestandsinhoud zijn grote objecten; vraagt streaming-versleuteling bij upload/download. Eigen uitrol.' } },
  { tabel: 'app.mcp_console_items', veld: 'taken en notities', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/mcp-console.ts',
    reden: { uk: 'Дошка читається агентами через MCP; потрібен грант-шлях (готовий у цьому випуску) + перенесення читання. Наступний випуск.', nl: 'Het bord wordt door agents via MCP gelezen; de grant-weg bestaat nu, het lezen verhuist in de volgende uitrol.' } },
  { tabel: 'owner_ui_preferences_v1 / app.ui_weergave / mail_view_preferences_v1', veld: 'weergave-instellingen', klasse: 'voorkeur', stand: 'nog-niet', module: 'backend/weergave.ts, backend/mail-weergave-voorkeuren.ts',
    reden: { uk: 'Теми й розкладка потрібні ДО входу (перший кадр) — не містять особистого змісту; низький клас чутливості.', nl: 'Thema en indeling zijn nodig VÓÓR het aanmelden (eerste beeld) en bevatten geen persoonlijke inhoud; lage gevoeligheid.' } },
  { tabel: 'app.browser_diag_archive', veld: 'sealed (diagnose van de extensie)', klasse: 'persoonlijk', stand: 'nog-niet', module: 'backend/browser-diag-archief.ts',
    reden: { uk: 'Архів пишеться агентом розширення без сесії сайту; потрібен грант-шлях для токена агента. Наступний випуск.', nl: 'Het archief wordt door de extensie-agent zonder sitesessie geschreven; vraagt de grant-weg voor agenttokens. Volgende uitrol.' } },
  { tabel: 'app.huis_integraties', veld: 'token_envelop (Home Assistant-koppeling van de woning)', klasse: 'geheim', stand: 'nog-niet', module: 'backend/huis-vnext.ts',
    reden: { uk: 'Інтеграція оселі спільна для учасників дому (app.huis_leden) та автоматизацій без сесії однієї людини; потрібен окремий ключ оселі.', nl: 'Een woningintegratie wordt gedeeld door leden van de woning (app.huis_leden) en automatiseringen zonder één mensensessie; vraagt een eigen woningsleutel.' } },
]);
export const registerVan = (stand: RegisterStand) => SLEUTELKLUIS_REGISTER.filter((r) => r.stand === stand);

// ------------------------------------------------------------------------------------------------ teksten
export const KLUIS_TEKST = Object.freeze({
  stand: {
    uit: { uk: 'Вимкнено: дані захищені лише ключем сервера', nl: 'Uit: gegevens alleen met de serversleutel beschermd' },
    gesloten: { uk: 'Увімкнено, ключ закритий у цій сесії', nl: 'Aan, sleutel gesloten in deze sessie' },
    open: { uk: 'Увімкнено, ключ відкритий у цій сесії', nl: 'Aan, sleutel open in deze sessie' },
  },
  gesloten: {
    uk: 'Ключ закритий: синхронізація продовжиться після входу або розблокування.',
    nl: 'Sleutel gesloten: synchronisatie gaat verder na aanmelden of ontgrendelen.',
  },
  geenPrf: {
    uk: 'Цей passkey не підтримує PRF (старіший пристрій або браузер). Розблокувати можна кодом відновлення; додайте passkey на новішому пристрої, щоб не вводити код.',
    nl: 'Deze passkey ondersteunt geen PRF (ouder apparaat of browser). Ontgrendelen kan met de herstelcode; voeg een passkey toe op een nieuwer apparaat om de code niet te hoeven typen.',
  },
  // SEC-002 (geheimen-04): de nieuwe herstelcode wacht op bevestiging; tot dan werkt de vorige nog.
  codeWacht: {
    uk: 'Новий код відновлення ще не підтверджено. Доки ви не підтвердите, що зберегли його, попередній код теж відкриває ключ. Після підтвердження попередній код перестане діяти назавжди.',
    nl: 'De nieuwe herstelcode is nog niet bevestigd. Tot u bevestigt dat u hem bewaard hebt, opent ook de vorige code de sleutel. Na bevestiging werkt de vorige code nooit meer.',
  },
  codeWachtZonderCode: {
    uk: 'Якщо ви не встигли зберегти новий код — не підтверджуйте: натисніть «Новий код», щоб отримати інший (усі попередні коди тоді перестануть діяти).',
    nl: 'Hebt u de nieuwe code niet kunnen bewaren, bevestig dan niet: kies «Nieuwe code» voor een andere (alle eerdere codes werken dan niet meer).',
  },
  // SEC-002 (geheimen-04): kluis «aan» zonder één omslag — niets te openen; opruimen is zonder verlies.
  zonderOmslag: {
    uk: 'Шифрування позначене як увімкнене, але ключ не має жодного способу відкриття (збій під час увімкнення). Під цим ключем ще немає даних, тож нічого не втрачається: скиньте цей стан і ввімкніть шифрування заново. Доки цього не зроблено, нові підключення пошти, календаря й хмари в цьому просторі не зберігаються.',
    nl: 'Versleuteling staat als ingeschakeld, maar de sleutel heeft geen enkele manier om open te gaan (storing tijdens het inschakelen). Onder deze sleutel staan nog geen gegevens, dus er gaat niets verloren: zet deze toestand terug en schakel de versleuteling opnieuw in. Tot dan worden nieuwe koppelingen van post, agenda en cloud in deze ruimte niet bewaard.',
  },
});
export const KLUIS_FOUT: Readonly<Record<string, { uk: string; nl: string }>> = Object.freeze({
  SLEUTELKLUIS_GESLOTEN: { uk: 'Ключ даних закритий. Розблокуйте його passkey або кодом відновлення.', nl: 'De gegevenssleutel is gesloten. Ontgrendel hem met een passkey of de herstelcode.' },
  SLEUTELKLUIS_UIT: { uk: 'Шифрування ще не ввімкнено.', nl: 'Versleuteling staat nog niet aan.' },
  SLEUTELKLUIS_AL_AAN: { uk: 'Шифрування вже ввімкнено для цього простору.', nl: 'Versleuteling staat al aan voor deze ruimte.' },
  SLEUTELKLUIS_HERSTELCODE_ONGELDIG: { uk: 'Код відновлення не підійшов.', nl: 'De herstelcode klopt niet.' },
  SLEUTELKLUIS_HERSTELCODE_GEBLOKKEERD: { uk: 'Забагато спроб. Зачекайте й спробуйте знову.', nl: 'Te veel pogingen. Wacht even en probeer opnieuw.' },
  SLEUTELKLUIS_DEK_ONGELDIG: { uk: 'Розгорнутий ключ не відповідає контрольному значенню.', nl: 'De aangeboden sleutel komt niet overeen met de controlewaarde.' },
  SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG: { uk: 'Для цього passkey ще немає обгортки ключа.', nl: 'Voor deze passkey bestaat nog geen omslag van de sleutel.' },
  SLEUTELKLUIS_PEPPER_ONTBREEKT: { uk: 'На сервері немає перцю для обгорток ШІ-підключень (SLEUTELKLUIS_SLEUTEL_V1).', nl: 'De server mist de pepper voor omslagen van AI-verbindingen (SLEUTELKLUIS_SLEUTEL_V1).' },
  SLEUTELKLUIS_TE_VAAK: { uk: 'Цю дію виконано забагато разів за короткий час. Спробуйте пізніше.', nl: 'Deze actie is te vaak uitgevoerd in korte tijd. Probeer het later opnieuw.' },
  SLEUTELKLUIS_BEZET: { uk: 'Сервер зараз зайнятий обчисленням ключів. Спробуйте за хвилину.', nl: 'De server is nu bezet met het berekenen van sleutels. Probeer het over een minuut opnieuw.' },
  SLEUTELKLUIS_HEEFT_OMSLAGEN: { uk: 'Скинути можна лише ключ без жодного способу відкриття. У цього ключа вони є — розблокуйте його passkey або кодом відновлення.', nl: 'Terugzetten kan alleen voor een sleutel zonder enige manier om hem te openen. Deze sleutel heeft die wel — ontgrendel hem met een passkey of de herstelcode.' },
  STEP_UP_REQUIRED: { uk: '', nl: '' },
  STEP_UP_STRONG_REQUIRED: { uk: '', nl: '' },
});
