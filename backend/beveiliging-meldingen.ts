// SEC-002 (privacy-logboek-03, 12.11.2026): veiligheidskritieke wijzigingen aan een account komen in het meldingencentrum van de
// mens zelf. Vroeger stonden ze alleen in het auditlogboek (en de activiteitenstroom liet access.*, sleutelkluis.*, agent.*, diag.*
// weg): wie een gestolen sessie had, kon een wachtwoord toevoegen, TOTP uitzetten of een AI-token maken zonder dat de eigenaar iets zag.
// Eén plek voor de teksten (uk/nl), zodat elke route met één regel meldt. Soort «security» (prive, staat in beide registers).
import { meld } from './melder';

export type BeveiligingsWijziging =
  | 'wachtwoord-gezet' | 'totp-uit' | 'passkey-weg' | 'stap-op-onthouden' | 'wachtwoord-door-beheer'
  | 'ai-token' | 'ai-token-ingetrokken' | 'kluis' | 'account-bekeken' | 'github-webhook-uit'
  | 'consent-andere-browser' | 'json-vereist'
  | 'aanmeldmethode-gekoppeld' | 'aanmeldmethode-ontkoppeld' // IDENTITEIT-012
  | 'gegevens-uitgevoerd' // IDENTITEIT-014
  | 'account-hersteld' | 'tweede-factor-verplicht' | 'tweede-factor-vrij' // IDENTITEIT-015
  | 'apparaat-melding-uit' | 'apparaat-melding-aan' | 'apparaat-vergeten'; // IDENTITEIT-015 (apparaten-uitvoer)

const NIET_JIJ = 'Якщо це були не ви — одразу завершіть інші сеанси на сторінці безпеки й змініть доступ. / Was u dit niet? Beëindig meteen de andere sessies op de beveiligingspagina en wijzig uw toegang.';

const TEKSTEN: Record<BeveiligingsWijziging, (x: Record<string, string>) => [string, string]> = {
  'wachtwoord-gezet': () => ['Додано або змінено пароль для входу / Wachtwoord voor aanmelden ingesteld', `Для вашого облікового запису встановлено пароль як спосіб входу. / Voor uw account is een wachtwoord als aanmeldmethode ingesteld. ${NIET_JIJ}`],
  'totp-uit': () => ['Код із застосунку (TOTP) вимкнено / App-code (TOTP) uitgezet', `Другий крок входу кодом із застосунку вимкнено. / De tweede aanmeldstap met een app-code is uitgezet. ${NIET_JIJ}`],
  'passkey-weg': () => ['Passkey видалено / Passkey verwijderd', `З вашого облікового запису видалено passkey. / Er is een passkey van uw account verwijderd. ${NIET_JIJ}`],
  'stap-op-onthouden': (x) => ['Підтвердження запам’ятовано на цьому сеансі / Bevestiging onthouden voor deze sessie', `Повторне підтвердження не питатиметься до ${x.tot || '—'} на одному з ваших сеансів. / Op een van uw sessies wordt tot ${x.tot || '—'} niet opnieuw om bevestiging gevraagd. ${NIET_JIJ}`],
  'wachtwoord-door-beheer': () => ['Адміністратор встановив вам тимчасовий пароль / Een beheerder gaf u een tijdelijk wachtwoord', `Адміністратор сайту скинув ваш пароль і встановив тимчасовий; при наступному вході його треба змінити. / Een beheerder van de site heeft uw wachtwoord gereset naar een tijdelijk wachtwoord; bij de volgende aanmelding moet u het wijzigen. Als u hier niet om vroeg, neem contact op met de eigenaar van de site.`],
  'ai-token': (x) => ['Випущено токен доступу для ШІ / Toegangstoken voor AI uitgegeven', `Створено токен «${x.naam || '—'}» для доступу ШІ до дошки. / Token "${x.naam || '—'}" voor AI-toegang tot het bord is aangemaakt. ${NIET_JIJ}`],
  'ai-token-ingetrokken': (x) => ['Токен доступу для ШІ відкликано / Toegangstoken voor AI ingetrokken', `Токен «${x.naam || '—'}» більше не діє. / Token "${x.naam || '—'}" werkt niet meer.`],
  'kluis': (x) => ['Зміна в сховищі ключів / Wijziging in de sleutelkluis', `Дія зі сховищем ключів: ${x.wat || '—'}. / Actie met de sleutelkluis: ${x.wat || '—'}. ${NIET_JIJ}`],
  // SEC-002 зауваження 2: het systeem maakte een GitHub-haak onschadelijk (koppeling weg, lade dicht of technische rechten weg).
  'github-webhook-uit': (x) => ['Вебхук GitHub вимкнено / GitHub-webhook uitgeschakeld', `Події зі сховища ${x.repo || '—'} більше не надходять: ${x.reden === 'lade-dicht' ? 'технічну шухляду GitHub закрито чи заморожено' : x.reden === 'rechten-weg' ? 'технічних прав більше немає' : 'з’єднання з GitHub від’єднано'}. Гачок у самому GitHub видаліть у налаштуваннях сховища або ввімкніть вебхук знову після підключення. / Gebeurtenissen van ${x.repo || '—'} komen niet meer binnen: ${x.reden === 'lade-dicht' ? 'de technische GitHub-lade is dicht of bevroren' : x.reden === 'rechten-weg' ? 'de technische rechten zijn weg' : 'de koppeling met GitHub is verbroken'}. Verwijder de haak bij GitHub in de instellingen van de repository, of zet de webhook opnieuw aan na het koppelen.`],
  // SEC-002 (slot s, eind-interface 4): een toestemmingsverzoek voor ШІ werd geopend in een ANDERE browser dan die de koppeling begon.
  'consent-andere-browser': () => ['Запит на підключення ШІ відкрито в іншому браузері — доступ не видано / Verzoek voor een AI-koppeling geopend in een andere browser — geen toegang gegeven', `Хтось відкрив вікно згоди на підключення ШІ не в тому браузері, де почалося підключення (наприклад, за надісланим посиланням). Доступ не видано. Якщо ви самі підключаєте ШІ — почніть підключення заново в цьому браузері. / Iemand opende het toestemmingsvenster voor een AI-koppeling in een andere browser dan waarin de koppeling begon (bijvoorbeeld via een toegestuurde link). Er is geen toegang gegeven. Koppelt u zelf een AI? Begin de koppeling dan opnieuw in deze browser. ${NIET_JIJ}`],
  // SEC-002 (slot s, eind-interface 3): een formulier (geen JSON) met uw cookie probeerde iets te wijzigen — geweigerd (415).
  'json-vereist': (x) => ['Відхилено запит-форму з вашим сеансом / Formulierverzoek met uw sessie geweigerd', `Сторінка поза сайтом (або застаріла вкладка) надіслала дію «${x.route || '—'}» як звичайну форму з вашим сеансом. Сервер приймає дії лише як JSON, тому нічого не змінено. Оновіть вкладки сайту; якщо ви нічого не робили — закрийте незнайомі сторінки й перевірте сеанси на сторінці безпеки. / Een pagina buiten de site (of een verouderd tabblad) stuurde de actie «${x.route || '—'}» als gewoon formulier met uw sessie. De server neemt acties alleen als JSON aan, dus er is niets gewijzigd. Ververs de tabbladen van de site; deed u niets, sluit dan onbekende pagina's en controleer de sessies op de beveiligingspagina.`],
  // IDENTITEIT-012: зовнішній спосіб входу (Microsoft, Discord, Apple, Telegram) прив'язано або відв'язано.
  'aanmeldmethode-gekoppeld': (x) => ['Прив’язано зовнішній спосіб входу / Externe aanmeldmethode gekoppeld', `До облікового запису прив’язано ${x.aanbieder || '—'}${x.label ? ` (${x.label})` : ''}. / ${x.aanbieder || '—'}${x.label ? ` (${x.label})` : ''} is aan uw account gekoppeld. ${NIET_JIJ}`],
  'aanmeldmethode-ontkoppeld': (x) => ['Відв’язано зовнішній спосіб входу / Externe aanmeldmethode ontkoppeld', `Від облікового запису відв’язано ${x.aanbieder || '—'}. / ${x.aanbieder || '—'} is van uw account ontkoppeld. ${NIET_JIJ}`],
  // IDENTITEIT-014: вивантажено всі дані облікового запису (POST /api/owner/privacy/export). Alle gegevens van het account geëxporteerd.
  'gegevens-uitgevoerd': () => ['Ваші дані вивантажено у файл / Uw gegevens zijn geëxporteerd', `Після підтвердження доступу завантажено файл з усіма даними облікового запису, зокрема з журналом безпеки. / Na bevestiging van toegang is een bestand met alle gegevens van het account gedownload, ook het beveiligingslogboek. ${NIET_JIJ}`],
  // IDENTITEIT-015: видалений обліковий запис відновлено самим власником протягом 30 днів (POST /api/owner/identity/account/recover).
  'account-hersteld': (x) => ['Обліковий запис відновлено / Account hersteld', `${x.mode === 'fresh' ? 'Обліковий запис відновлено з новим порожнім простором; старі простори лишилися в архіві й їх можна відновити окремо.' : 'Обліковий запис і всі простори відновлено.'} / ${x.mode === 'fresh' ? 'Het account is hersteld met een nieuwe, lege ruimte; de oude ruimtes blijven in het archief en zijn apart te herstellen.' : 'Het account en alle ruimtes zijn hersteld.'} ${NIET_JIJ}`],
  // IDENTITEIT-015: власник сайту змінив правило «другий чинник обов'язковий» (POST /api/owner/access/policy/save).
  'tweede-factor-verplicht': () => ['Другий крок входу тепер обов’язковий / Tweede aanmeldstap is nu verplicht', `Після Google кожен, хто має код із застосунку або ключ доступу, підтверджує вхід ним (запасний шлях — код відновлення). Хто не має другого чинника, входить як раніше. / Na Google bevestigt iedereen met een app-code of passkey de aanmelding daarmee (reserve: een herstelcode). Wie geen tweede factor heeft, meldt aan zoals voorheen. ${NIET_JIJ}`],
  'tweede-factor-vrij': () => ['Другий крок входу більше не обов’язковий / Tweede aanmeldstap niet meer verplicht', `Після Google сеанс знову відкривається без коду. Другий чинник і далі потрібен для важливих дій. / Na Google opent de sessie weer zonder code. De tweede factor blijft nodig voor belangrijke acties. ${NIET_JIJ}`],
  // IDENTITEIT-015 (apparaten-uitvoer): вибір «Попереджати про новий пристрій» і «Забути пристрій» (backend/bekende-apparaten.ts).
  'apparaat-melding-uit': () => ['Попередження про новий пристрій вимкнено / Waarschuwing voor een nieuw apparaat uitgezet', `Вхід із нового пристрою більше не дає спливного сповіщення; запис у журналі безпеки лишається. Увімкнути знову: «Сесії та пристрої» → «Попереджати про новий пристрій» → «Завжди». / Een aanmelding vanaf een nieuw apparaat geeft geen melding meer; de regel in het beveiligingslogboek blijft. Weer aanzetten: «Sessies en apparaten» → «Waarschuwen bij een nieuw apparaat» → «Altijd». ${NIET_JIJ}`],
  'apparaat-melding-aan': () => ['Попередження про новий пристрій увімкнено / Waarschuwing voor een nieuw apparaat aangezet', 'Після входу з невідомого пристрою тут з’явиться сповіщення з пристроєм, регіоном і часом. / Na een aanmelding vanaf een onbekend apparaat verschijnt hier een melding met apparaat, regio en tijd.'],
  'apparaat-vergeten': (x) => ['Пристрій забуто / Apparaat vergeten', `Пристрій «${x.apparaat || '—'}» вилучено з відомих: наступний вхід із нього знову вважатиметься входом з нового пристрою. / Apparaat «${x.apparaat || '—'}» staat niet meer bij de bekende apparaten: de volgende aanmelding ermee geldt weer als nieuw apparaat. ${NIET_JIJ}`],
  'account-bekeken': (x) => ['Ваш обліковий запис переглянуто для діагностики / Uw account is bekeken voor diagnose', `Адміністратор (${x.wie || '—'}) переглянув ${x.wat || 'дані вашого облікового запису'} у технічній діагностиці. / Een beheerder (${x.wie || '—'}) bekeek ${x.watNl || 'gegevens van uw account'} in de technische diagnose.`],
};

/** Meld een veiligheidskritieke wijziging aan de eigenaar van het account. Faalt nooit (meld vangt zelf af). */
export async function meldBeveiligingsWijziging(userId: string, soort: BeveiligingsWijziging, extra: Record<string, unknown> = {}): Promise<void> {
  if (!userId) return;
  const x: Record<string, string> = {};
  // Alleen korte, schone tekst in de melding (geen geheimen, geen stuurtekens).
  for (const [k, v] of Object.entries(extra)) x[k] = String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').slice(0, 80);
  const [titel, tekst] = TEKSTEN[soort](x);
  await meld(userId, 'security', titel, tekst);
}

/**
 * SEC-002 (slot s): dezelfde melding hoogstens één keer per uur per account en soort (een aanvaller die blijft proberen, maakt geen
 * stroom meldingen). Geeft true als er gemeld is. Те саме сповіщення — не частіше разу на годину на обліковий запис і вид.
 */
const laatsteBeperkt = new Map<string, number>();
export async function meldBeveiligingsWijzigingBeperkt(userId: string, soort: BeveiligingsWijziging, extra: Record<string, unknown> = {}, nu = Date.now()): Promise<boolean> {
  if (!userId) return false;
  const sleutel = `${userId}|${soort}`;
  const vorige = laatsteBeperkt.get(sleutel);
  if (vorige !== undefined && nu - vorige < 3_600_000) return false;
  if (laatsteBeperkt.size > 5000) for (const [k, v] of laatsteBeperkt) if (nu - v >= 3_600_000 || laatsteBeperkt.size > 4000) laatsteBeperkt.delete(k);
  laatsteBeperkt.set(sleutel, nu);
  await meldBeveiligingsWijziging(userId, soort, extra);
  return true;
}
export const _beperktLeeg = (): void => laatsteBeperkt.clear();
