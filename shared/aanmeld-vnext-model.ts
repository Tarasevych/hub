// UI-015 «Aanmeldmethoden vNext» (vlag aanmeldmethoden-vnext, migratie 0198) — het GEDEELDE contract van de vernieuwde
// pagina «Способи входу» op id.tarasevych.com/aanmeldmethoden. Grondregels uit het dossier (UI-015 ТЗ §2, §5):
//   • de UI verandert NOOIT de waarheid: elke staat komt uit het echte /api/owner/access/snapshot of een levende
//     statusroute; «Підключено» zonder serverbevestiging bestaat niet, net als verzonnen percentages of «100% захист»;
//   • geen enkele nieuwe aanbieder (Apple, Telegram, Discord, WhatsApp, Microsoft, SMS) verschijnt als «доступно для
//     входу» zolang de server niet bevestigt: sleutels aanwezig ÉN de zelftest van de eigen contour geslaagd — tot dan
//     staan ze ALLEEN in de aparte, eerlijke catalogus zonder koppelknop;
//   • de bestaande beveiligingsstromen (step-up, lockout-bescherming, TOTP/herstel-regels) blijven de absolute autoriteit.
import type { Tweetalig } from './cloud-vnext-model';

export const AANMELD_VLAG = 'aanmeldmethoden-vnext';

// ---------------------------------------------------------------- de kaart van een methode (dossier §5, letterlijk)
export type MethodeStaat = 'loading' | 'active' | 'ready' | 'not-configured' | 'attention' | 'unavailable' | 'unknown';
export type MethodeActie = 'manage' | 'setup' | 'verify' | 'retry' | 'details' | 'none';
export type MethodeVermogen = 'sign-in' | 'step-up' | 'recovery' | 'encryption' | 'delegation';
export type MethodeUi = {
  id: 'google' | 'password' | 'passkey' | 'totp' | 'recovery' | 'vault' | 'guest-code';
  titel: Tweetalig; ondertitel: Tweetalig;
  icoon: string;                      // semantische sleutel; merklogo alleen bij een ECHT geïntegreerde aanbieder
  staat: MethodeStaat;
  staatReden?: Tweetalig;             // gelokaliseerde reden («Останній спосіб входу — захищено від вимкнення»)
  accountLabel?: string;              // alleen als de backend het teruggaf (e-mail van de binding)
  hoofdActie: MethodeActie;
  laatstGecontroleerd?: string;       // alleen een serverwaarde, nooit client-tijd
  waarschuwingCode?: string;          // technische code; de mens ziet de gelokaliseerde reden
  vermogen: MethodeVermogen;
  teller?: number;                    // passkeys / resterende herstelcodes / actieve toegangscodes — alleen uit de API
  beschermd?: boolean;                // laatste werkende aanmeldweg: verwijderen uitgeschakeld mét uitleg
};
export const STAAT_LABEL: Record<MethodeStaat, Tweetalig> = Object.freeze({
  loading: ['Завантаження…', 'Laden…'], active: ['Активний', 'Actief'], ready: ['Готовий', 'Gereed'],
  'not-configured': ['Не налаштовано', 'Niet ingesteld'], attention: ['Потребує уваги', 'Vraagt aandacht'],
  unavailable: ['Недоступно', 'Niet beschikbaar'], unknown: ['Не вдалося перевірити', 'Kon niet worden gecontroleerd'],
});
export const ACTIE_LABEL: Record<Exclude<MethodeActie, 'none'>, Tweetalig> = Object.freeze({
  manage: ['Керувати', 'Beheren'], setup: ['Налаштувати', 'Instellen'], verify: ['Перевірити', 'Controleren'],
  retry: ['Повторити', 'Opnieuw'], details: ['Переглянути', 'Bekijken'],
});

// De groepen van de pagina (dossier §4): filters zoeken, ze veranderen geen standen.
export const AANMELD_GROEPEN = Object.freeze(['alles', 'inloggen', 'passkey', 'bescherming', 'delegatie'] as const);
export type AanmeldGroep = (typeof AANMELD_GROEPEN)[number];
export const GROEP_LABEL: Record<AanmeldGroep, Tweetalig> = Object.freeze({
  alles: ['Усі', 'Alle'], inloggen: ['Вхід', 'Inloggen'], passkey: ['Passkey', 'Passkeys'],
  bescherming: ['Захист', 'Bescherming'], delegatie: ['Доступ іншим', 'Toegang voor anderen'],
});

// Deep-link-ankers die de pagina's «Безпека» en «Відновлення» vandaag gebruiken — de nieuwe weergave behoudt ze.
export const AANMELD_ANKERS = Object.freeze(['aanmeldmethoden-google', 'aanmeldmethoden-2fa', 'aanmeldmethoden-herstel', 'aanmeldmethoden-passkeys', 'aanmeldmethoden-sleutelkluis'] as const);

// ---------------------------------------------------------------- catalogus van TOEKOMSTIGE aanbieders (eerlijk, 30.10.2026)
// stand 'sleutels-nodig': de login-contour staat volledig in de code (routes, HMAC/OAuth-validatie, audit), maar werkt pas
// wanneer de EIGENAAR de genoemde omgevingssleutels zet; tot de statusroute «klaarVoorKoppeling: true» meldt, toont de UI
// GEEN koppelknop. stand 'niet-mogelijk': er bestaat geen echte consumenten-login-API — dat staat op de kaart, met de omweg.
export type AanmeldAanbiederStand = 'sleutels-nodig' | 'gepland' | 'niet-mogelijk';
export type AanmeldAanbieder = {
  id: 'microsoft' | 'discord' | 'telegram' | 'apple' | 'whatsapp' | 'sms';
  naam: string; monogram: string; site: string;
  stand: AanmeldAanbiederStand;
  uitleg: Tweetalig;                  // wat er vandaag ECHT in de code staat
  vereist?: readonly string[];        // omgevingssleutels van de eigenaar
  omweg?: Tweetalig;                  // alleen bij 'niet-mogelijk' / 'gepland'
};
export const AANMELD_AANBIEDERS: readonly AanmeldAanbieder[] = Object.freeze([
  { id: 'microsoft', naam: 'Microsoft', monogram: 'M', site: 'https://login.microsoftonline.com', stand: 'sleutels-nodig',
    uitleg: ['Повний OAuth-контур (code flow, state+PKCE, перевірка id_token, прив’язка до ВАШОГО акаунта) вже в коді; вмикається ключами власника.', 'Volledige OAuth-contour (code flow, state+PKCE, id_token-controle, koppeling aan UW account) staat in de code; de sleutels van de eigenaar zetten hem aan.'],
    vereist: ['AANMELD_MICROSOFT_CLIENT_ID', 'AANMELD_MICROSOFT_CLIENT_SECRET'] },
  { id: 'discord', naam: 'Discord', monogram: 'D', site: 'https://discord.com/developers', stand: 'sleutels-nodig',
    uitleg: ['Повний OAuth2-контур (identify+email, state+PKCE, прив’язка) в коді; потрібні ключі застосунку власника.', 'Volledige OAuth2-contour (identify+email, state+PKCE, koppeling) in de code; de app-sleutels van de eigenaar zijn nodig.'],
    vereist: ['AANMELD_DISCORD_CLIENT_ID', 'AANMELD_DISCORD_CLIENT_SECRET'] },
  { id: 'telegram', naam: 'Telegram', monogram: 'T', site: 'https://core.telegram.org/widgets/login', stand: 'sleutels-nodig',
    uitleg: ['Login Widget з серверною HMAC-SHA256-перевіркою підпису і свіжості (auth_date) у коді; вмикається токеном бота власника.', 'Login Widget met HMAC-SHA256-handtekening- en verscontrole (auth_date) op de server; de bottoken van de eigenaar zet hem aan.'],
    vereist: ['AANMELD_TELEGRAM_BOT_TOKEN', 'AANMELD_TELEGRAM_BOT_NAAM'] },
  { id: 'apple', naam: 'Apple', monogram: 'A', site: 'https://developer.apple.com/sign-in-with-apple/', stand: 'sleutels-nodig',
    uitleg: ['Sign in with Apple (form_post, клієнтський секрет = ES256-JWT з p8-ключа) у коді; потрібен платний Apple Developer-контур власника.', 'Sign in with Apple (form_post, clientgeheim = ES256-JWT uit de p8-sleutel) in de code; vraagt de betaalde Apple Developer-contour van de eigenaar.'],
    vereist: ['AANMELD_APPLE_CLIENT_ID', 'AANMELD_APPLE_TEAM_ID', 'AANMELD_APPLE_KEY_ID', 'AANMELD_APPLE_PRIVATE_KEY'] },
  { id: 'whatsapp', naam: 'WhatsApp', monogram: 'W', site: 'https://www.whatsapp.com', stand: 'niet-mogelijk',
    uitleg: ['WhatsApp не має публічного API «увійти через WhatsApp» для сайтів — чесно: такого входу не існує.', 'WhatsApp heeft geen publieke «log in met WhatsApp»-API voor websites — eerlijk: die aanmelding bestaat niet.'],
    omweg: ['Користуйтесь Google, passkey або TOTP; Telegram-вхід — найближчий аналог месенджера.', 'Gebruik Google, een passkey of TOTP; Telegram-aanmelding is het dichtstbijzijnde messenger-alternatief.'] },
  { id: 'sms', naam: 'SMS', monogram: '✆', site: '', stand: 'gepland',
    uitleg: ['Вхід за номером телефону потребує SMS-провайдера (платний контур власника) — коду розсилання в репозиторії ще немає.', 'Aanmelden met een telefoonnummer vraagt een sms-provider (betaalde contour van de eigenaar) — verzendcode staat nog niet in het repo.'],
    omweg: ['TOTP-застосунок дає той самий «код із телефона» без оператора.', 'Een TOTP-app geeft dezelfde «code van je telefoon» zonder operator.'] },
]);
export const aanmeldAanbieder = (id: unknown) => AANMELD_AANBIEDERS.find((a) => a.id === id);
export const AANBIEDER_STAND_LABEL: Record<AanmeldAanbiederStand, Tweetalig> = Object.freeze({
  'sleutels-nodig': ['Потрібні ключі власника', 'Sleutels van de eigenaar nodig'],
  gepland: ['Заплановано', 'Gepland'], 'niet-mogelijk': ['Неможливо', 'Niet mogelijk'],
});

// ---------------------------------------------------------------- API-contract van de NIEUWE serverkant (uitvoerder F2)
// Alle sessies/poorten zoals de bestaande identity-routes; fouten { error: CODE }.
//   POST /api/owner/aanmeld/vnext/aanbieders  {} → { aanbieders: Array<{ id, stand, sleutels: Array<{ naam, aanwezig: boolean }>,
//                                                 zelftest: 'ok'|'niet-uitgevoerd'|'fout', zelftestOp?: string,
//                                                 klaarVoorKoppeling: boolean, gekoppeld?: { label: string, op: string } | null }> }
//        — levend: leest ALLEEN echte omgeving/opslag; klaarVoorKoppeling = alle sleutels aanwezig én zelftest 'ok'.
//   POST /api/owner/aanmeld/vnext/zelftest    { id } → { zelftest, details } — read-only controle van de EIGEN contour
//        (sleutelvorm, bereikbaarheid van het eigen callback-pad, JWT-ondertekening bij Apple); doet GEEN aanroep naar de
//        aanbieder met echte gebruikersgegevens en logt een auditregel.
//   GET  /aanmeld/koppel/<id>/start           → 302 naar de aanbieder (alleen met klaarVoorKoppeling; anders 409 + uitleg)
//   GET/POST /aanmeld/koppel/<id>/terug       → validatie (state+PKCE / HMAC / id_token), koppelt de identiteit aan het
//        INGELOGDE account als extra aanmeldweg (nooit een nieuw account), audit + gebeurtenis; fouten tonen een eerlijke
//        pagina zonder geheimen in de URL te herhalen.
// Foutcodes: AANBIEDER_ONBEKEND, SLEUTELS_ONTBREKEN, ZELFTEST_VEREIST, STATE_ONGELDIG, HANDTEKENING_ONGELDIG,
//            TOKEN_ONGELDIG, VERLOPEN, KOPPELING_BESTAAT, SESSIE_VEREIST.
export const aanmeldTekst = (p: Tweetalig, lang: 'uk' | 'nl'): string => (lang === 'uk' ? p[0] : p[1]);
