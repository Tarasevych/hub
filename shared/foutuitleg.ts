// Één bron voor ELKE foutmelding van de site (audit 19.10.2026, punt 3 van de eigenaar).
//
// Waarom dit bestand bestaat: de plakkaat zei «Сервер тимчасово недоступний — Імовірно, встановлюється оновлення (зазвичай до пів
// хвилини)». Dat was een GOK. De site wist op dat moment de HTTP-status (502), de dienst (mail/hub/admin…), de route, het tijdstip
// en het nummer van de poging — en zei daar niets over, maar verzon wel een oorzaak. Regel vanaf nu:
//
//   1. Elke melding noemt: de operatie in mensentaal, de dienst, de code (HTTP 502 / EXTENSIE_VERGRENDELD …), het tijdstip van de
//      laatste poging en het nummer van die poging.
//   2. `waarom` zegt alleen wat FEIT is (wat de server antwoordde en wat die code betekent), nooit wat de site vermoedt.
//   3. Een onbekende code krijgt «причина невідома» PLUS de rauwe code/status en het rauwe antwoordlichaam — nooit een verzonnen
//      oorzaak en nooit een lege tekst.
//   4. Over een installatie (uitrol) praat de melding ALLEEN met een gemeten feit: `feiten.uitrol` moet van een statusroute komen
//      (POST /api/owner/uitrol/live of GET /api/version, zie uitrolFeitUitLive/uitrolFeitUitVersie). Zonder dat feit staat er
//      uitdrukkelijk dat de site niet weet of er een installatie loopt.
//   5. `detailsTekst()` is één blok voor het klembord: dat stuurt de eigenaar naar ondersteuning.
//
// Zuiver (geen DOM, geen fetch, geen globals): getest in tests/eenheid/foutuitleg-20261019.test.ts.
import { uitrolCodeDoen, uitrolCodeTitel, UITROL_CODES } from './uitrol-codes';
import { WEIGERING_CODES, weigeringRegel } from './weigering-tekst';

export type Lang = 'uk' | 'nl';
export const kiesTaal = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

/** Wat een statusroute ECHT over een installatie zei. Ontbreekt dit, dan zwijgt de melding erover. */
export type UitrolFeit = {
  /** true = een statusroute meldde een LOPENDE installatie. Nooit zelf verzinnen. */
  actief: boolean;
  versie?: string;
  /** Stap in mensentaal, zoals de statusroute hem gaf (backend/uitrol-runs.ts: Run.uk/Run.nl). */
  stapUk?: string;
  stapNl?: string;
  /** Technische stapnaam (voor «Деталі»). */
  stap?: string;
  pct?: number;
  /** Waar dit feit vandaan komt, bijv. 'POST /api/owner/uitrol/live'. Gaat mee in «Деталі». */
  bron?: string;
};

export type Feiten = {
  /** De mislukte operatie in mensentaal: [uk, nl], bijv. ['Перевірка версії сайту', 'Versiecontrole van de site']. */
  operatie: readonly [string, string];
  /** Dienst zoals de site hem noemt: 'mail', 'hub', 'admin', 'mcp', 'id', 'cloud', 'github', 'ai', 'huis', 'api'. */
  dienst: string;
  /** Route van de mislukte aanroep, bijv. 'GET /api/version'. */
  route?: string;
  /** Code uit het antwoord (data.error / data.reasonCode) of van de client ('NETWORK_ERROR'). */
  code?: string;
  /** HTTP-status; 0 of ontbrekend = er kwam geen antwoord. */
  status?: number;
  /** Tijdstip van de LAATSTE poging (ms sinds 1970). */
  tijd?: number;
  /** Nummer van die poging (1 = de eerste). */
  poging?: number;
  /** Hoeveel pogingen er in totaal gepland zijn, als dat vaststaat. */
  vanPogingen?: number;
  /** Het rauwe antwoordlichaam, als de server er een gaf. Nooit weglaten: punt 6 van de eigenaar. */
  lichaam?: string;
  /** Alleen een GEMETEN uitrolstand; null/ontbrekend = de site weet het niet. */
  uitrol?: UitrolFeit | null;
  /** IANA-zone voor het tijdstip; ontbreekt = zoals de browser (tests geven 'UTC'). */
  zone?: string;
};

export type Uitleg = {
  /** Operatie + dienst + code, in één regel. */
  titel: string;
  /** Wat de server feitelijk antwoordde en wat die code betekent; bij een onbekende code: «причина невідома» + de rauwe code. */
  waarom: string;
  /** Wat de gebruiker nu kan doen. */
  doen: string;
  /** false = de oorzaak is onbekend en de tekst zegt dat ook. */
  zeker: boolean;
  /** true = er is een GEMETEN installatie; alleen dan mag de melding over een installatie praten. */
  installatie: boolean;
  codeLabel: string;
  dienstLabel: string;
  tijdLabel: string;
  pogingLabel: string;
  /** Technische regels voor «Деталі». */
  details: string[];
};

// ------------------------------------------------------------------------------------------- dienst
const DIENST_NAMEN: Readonly<Record<string, [string, string]>> = Object.freeze({
  hub: ['Мій простір (hub)', 'Mijn Ruimte (hub)'],
  mail: ['Пошта (mail)', 'Mail (mail)'],
  cloud: ['Диск (cloud)', 'Schijf (cloud)'],
  github: ['GitHub (github)', 'GitHub (github)'],
  huis: ['Дім (huis)', 'Huis (huis)'],
  identity: ['Вхід (id)', 'Aanmelden (id)'],
  id: ['Вхід (id)', 'Aanmelden (id)'],
  ai: ['Агенти (ai)', 'Agenten (ai)'],
  admin: ['Адміністрування (admin)', 'Beheer (admin)'],
  mcp: ['Конектор (mcp)', 'Connector (mcp)'],
  api: ['API (api)', 'API (api)'],
});
/** Dienst uit een hostnaam, zonder de canonical-runtime (die bestaat in een test niet). Onbekend → 'hub'. */
export function dienstVanHostnaam(host: string): string {
  const eerste = String(host || '').toLowerCase().split(':')[0].split('.')[0];
  if (eerste === 'id') return 'identity';
  return ['hub', 'mail', 'cloud', 'ai', 'github', 'huis', 'admin', 'mcp', 'api', 'identity'].includes(eerste) ? eerste : 'hub';
}
export const dienstNaam = (lang: Lang, dienst: string): string => {
  const d = DIENST_NAMEN[String(dienst || '').toLowerCase()];
  return d ? kiesTaal(lang, d[0], d[1]) : String(dienst || kiesTaal(lang, 'невідомий сервіс', 'onbekende dienst'));
};

// ------------------------------------------------------------------------------------------- code
/** De code zoals hij op het scherm komt: 'HTTP 502', 'EXTENSIE_VERGRENDELD', of beide. */
export function codeLabel(feiten: { code?: string; status?: number }): string {
  const code = String(feiten.code || '').trim();
  // Een leesfout van een bestand is geen servercode: toon alleen de naam van de DOMException (bv. «NotReadableError»).
  if (isBestandLeesfout(code)) return bestandLeesNaam(code) || 'DOMException';
  const status = Number(feiten.status || 0);
  const http = status > 0 ? `HTTP ${status}` : '';
  const kaal = code && !/^HTTP_\d+$/.test(code) ? code : '';
  if (kaal && http) return `${kaal} · ${http}`;
  return kaal || http || (/^HTTP_(\d+)$/.exec(code) ? `HTTP ${/^HTTP_(\d+)$/.exec(code)![1]}` : 'HTTP 0');
}

type Regel = { uk: string; nl: string; doenUk: string; doenNl: string };
const herstart = (status: number): Regel => ({
  uk: `Проксі сервера відповів HTTP ${status}: запит дійшов до проксі, але процес сервісу не відповів йому вчасно.`,
  nl: `De proxy van de server antwoordde HTTP ${status}: het verzoek bereikte de proxy, maar het proces van de dienst antwoordde hem niet op tijd.`,
  doenUk: 'Натисніть «Повторити». Сторінка також пробує сама. Якщо це триває понад дві хвилини — скопіюйте «Деталі» й відкрийте журнал розгортання.',
  doenNl: 'Klik op «Повторити». De pagina probeert het ook zelf. Duurt dit langer dan twee minuten, kopieer dan «Деталі» en open het uitrollogboek.',
});

// Alles wat hier niet staat, krijgt «причина невідома» + de rauwe code (nooit een verzonnen oorzaak).
const BASIS_REGELS: Record<string, Regel> = {
  BROWSER_OFFLINE: {
    uk: 'Браузер сам повідомляє, що мережі немає (navigator.onLine = false). До сервера нічого не надсилалося, тому коду від сервера немає.',
    nl: 'De browser meldt zelf dat er geen netwerk is (navigator.onLine = false). Er is niets naar de server gestuurd, dus er is geen servercode.',
    doenUk: 'Увімкніть мережу. Показані дані можуть бути застарілими; нові дії збережуться лише після відновлення зв’язку.',
    doenNl: 'Zet het netwerk aan. Weergegeven gegevens kunnen verouderd zijn; nieuwe acties worden pas bewaard als de verbinding terug is.',
  },
  NETWORK_ERROR: {
    uk: 'Запит навіть не дійшов до сервера: браузер обірвав зʼєднання (мережа, Wi-Fi, VPN або проксі). Сервер жодного коду не повернув.',
    nl: 'Het verzoek bereikte de server niet eens: de browser brak de verbinding af (netwerk, wifi, VPN of proxy). De server gaf geen enkele code.',
    doenUk: 'Перевірте мережу й повторіть. Дані на екрані можуть бути застарілими; нові дії ще не збережені.',
    doenNl: 'Controleer het netwerk en probeer opnieuw. Wat op het scherm staat kan verouderd zijn; nieuwe acties zijn nog niet bewaard.',
  },
  ABORTED: {
    uk: 'Запит скасовано самою сторінкою (ви перейшли далі, і відповідь більше не була потрібна). Це не помилка сервера.',
    nl: 'Het verzoek is door de pagina zelf geannuleerd (u navigeerde verder, het antwoord was niet meer nodig). Dit is geen serverfout.',
    doenUk: 'Нічого робити не треба. Якщо дані не з’явилися — повторіть.',
    doenNl: 'U hoeft niets te doen. Verschijnen de gegevens niet, probeer dan opnieuw.',
  },
  RATE_LIMITED: {
    uk: 'Сервер відповів, що запитів за хвилину завелико (обмежувач частоти). Дані не змінено.',
    nl: 'De server antwoordde dat er te veel verzoeken per minuut zijn (snelheidsbegrenzer). Er is niets gewijzigd.',
    doenUk: 'Зачекайте вказаний час і повторіть; списки оновляться самі.',
    doenNl: 'Wacht de aangegeven tijd en probeer opnieuw; de lijsten verversen vanzelf.',
  },
  SESSION_REQUIRED: {
    uk: 'Сервер не прийняв сесію цієї вкладки: вона закінчилася або була відкликана.',
    nl: 'De server accepteerde de sessie van dit tabblad niet: hij is verlopen of ingetrokken.',
    doenUk: 'Оновіть сторінку й увійдіть знову. Незбережений текст спершу скопіюйте.',
    doenNl: 'Ververs de pagina en meld u opnieuw aan. Kopieer eerst niet-opgeslagen tekst.',
  },
  STEP_UP_REQUIRED: {
    uk: 'Сервер вимагає свіжого підтвердження доступу для цієї дії (passkey, код із застосунку, код відновлення або повторний вхід Google).',
    nl: 'De server vraagt een verse bevestiging van de toegang voor deze actie (passkey, app-code, herstelcode of opnieuw aanmelden bij Google).',
    doenUk: 'Підтвердьте доступ у вікні, що відкриється, і повторіть дію.',
    doenNl: 'Bevestig de toegang in het venster dat opengaat en herhaal de actie.',
  },
  EXTENSIE_VERGRENDELD: {
    uk: 'Сервер відмовив: розширення браузера заблоковане (немає чинного розблокування для цього профілю або домену).',
    nl: 'De server weigerde: de browserextensie is vergrendeld (geen geldige ontgrendeling voor dit profiel of domein).',
    doenUk: 'Розблокуйте розширення у «Агенти → Розширення» власним passkey і повторіть.',
    doenNl: 'Ontgrendel de extensie in «Агенти → Розширення» met een eigen passkey en probeer opnieuw.',
  },
  API_RECHT_VEREIST: {
    uk: 'Сервер відповів, що для цього акаунта не ввімкнено право «API-платформа». Сесія справна.',
    nl: 'De server antwoordde dat het recht «API-platform» voor dit account niet is ingeschakeld. De sessie is in orde.',
    doenUk: 'Попросіть власника дозволити «API-платформу» (Адміністрування → Користувачі та запити доступу).',
    doenNl: 'Vraag de eigenaar om «API-platform» toe te staan (Beheer → Gebruikers en toegangsverzoeken).',
  },
  BODY_TOO_LARGE: {
    uk: 'Сервер або проксі відхилив запит як завеликий (HTTP 413). Нічого не збережено.',
    nl: 'De server of de proxy weigerde het verzoek als te groot (HTTP 413). Er is niets bewaard.',
    doenUk: 'Надішліть меншу частину (менший файл або коротший текст).',
    doenNl: 'Verstuur een kleiner deel (kleiner bestand of kortere tekst).',
  },
  HTTP_0: {
    uk: 'Відповіді не було зовсім: запит обірвався до коду відповіді.',
    nl: 'Er kwam helemaal geen antwoord: het verzoek brak af vóór een antwoordcode.',
    doenUk: 'Перевірте мережу й повторіть.',
    doenNl: 'Controleer het netwerk en probeer opnieuw.',
  },
  HTTP_400: {
    uk: 'Сервер відхилив сам запит як неправильний (HTTP 400). Дані не змінено.',
    nl: 'De server weigerde het verzoek zelf als onjuist (HTTP 400). Er is niets gewijzigd.',
    doenUk: 'Оновіть сторінку (можливо, вкладка працює на старій версії) і повторіть; інакше скопіюйте «Деталі».',
    doenNl: 'Ververs de pagina (misschien draait het tabblad een oude versie) en probeer opnieuw; kopieer anders «Деталі».',
  },
  HTTP_401: {
    uk: 'Сервер відповів HTTP 401: сесію цієї вкладки не прийнято (закінчилася або відкликана).',
    nl: 'De server antwoordde HTTP 401: de sessie van dit tabblad is niet geaccepteerd (verlopen of ingetrokken).',
    doenUk: 'Оновіть сторінку й увійдіть знову.',
    doenNl: 'Ververs de pagina en meld u opnieuw aan.',
  },
  HTTP_403: {
    uk: 'Сервер відповів HTTP 403: сесія справна, але цій дії бракує права або свіжого підтвердження.',
    nl: 'De server antwoordde HTTP 403: de sessie is in orde, maar deze actie mist een recht of een verse bevestiging.',
    doenUk: 'Якщо з’явиться вікно підтвердження — підтвердьте доступ; інакше потрібне право від власника.',
    doenNl: 'Verschijnt er een bevestigingsvenster, bevestig dan de toegang; anders is een recht van de eigenaar nodig.',
  },
  HTTP_404: {
    uk: 'Сервер відповів HTTP 404: цього об’єкта чи маршруту на сервері немає (можливо, його вже видалено в іншій вкладці).',
    nl: 'De server antwoordde HTTP 404: dit object of deze route bestaat niet op de server (misschien al verwijderd in een ander tabblad).',
    doenUk: 'Оновіть список. Якщо об’єкт має існувати — скопіюйте «Деталі».',
    doenNl: 'Ververs de lijst. Moet het object bestaan, kopieer dan «Деталі».',
  },
  HTTP_409: {
    uk: 'Сервер відповів HTTP 409: стан на сервері змінився між читанням і записом (хтось або інша вкладка вже змінили це).',
    nl: 'De server antwoordde HTTP 409: de stand op de server wijzigde tussen lezen en schrijven (iemand of een ander tabblad wijzigde dit al).',
    doenUk: 'Оновіть сторінку, подивіться поточний стан і повторіть дію.',
    doenNl: 'Ververs de pagina, bekijk de huidige stand en herhaal de actie.',
  },
  HTTP_413: {
    uk: 'Сервер або проксі відповів HTTP 413: запит завеликий. Нічого не збережено.',
    nl: 'De server of proxy antwoordde HTTP 413: het verzoek is te groot. Er is niets bewaard.',
    doenUk: 'Надішліть меншу частину.',
    doenNl: 'Verstuur een kleiner deel.',
  },
  HTTP_429: {
    uk: 'Сервер відповів HTTP 429: запитів за хвилину завелико. Дані не змінено.',
    nl: 'De server antwoordde HTTP 429: te veel verzoeken per minuut. Er is niets gewijzigd.',
    doenUk: 'Зачекайте й повторіть.',
    doenNl: 'Wacht even en probeer opnieuw.',
  },
  HTTP_500: {
    uk: 'Процес сервісу відповів HTTP 500: внутрішня помилка в самому коді сервера. Запит дійшов, але не був виконаний.',
    nl: 'Het proces van de dienst antwoordde HTTP 500: een interne fout in de servercode zelf. Het verzoek kwam aan, maar is niet uitgevoerd.',
    doenUk: 'Повторіть. Якщо повторюється — скопіюйте «Деталі» й відкрийте журнал: там є рядок із цією помилкою.',
    doenNl: 'Probeer opnieuw. Blijft het, kopieer dan «Деталі» en open het logboek: daar staat de regel met deze fout.',
  },
  HTTP_502: herstart(502),
  HTTP_503: {
    uk: 'Проксі сервера відповів HTTP 503: процес сервісу не приймає запитів (не запущений або сам сказав «недоступний»).',
    nl: 'De proxy antwoordde HTTP 503: het proces van de dienst neemt geen verzoeken aan (niet gestart of zei zelf «niet beschikbaar»).',
    doenUk: 'Натисніть «Повторити». Якщо це триває понад дві хвилини — скопіюйте «Деталі» й відкрийте журнал розгортання.',
    doenNl: 'Klik op «Повторити». Duurt dit langer dan twee minuten, kopieer «Деталі» en open het uitrollogboek.',
  },
  HTTP_504: {
    uk: 'Проксі сервера відповів HTTP 504: процес сервісу не вклався у час очікування проксі.',
    nl: 'De proxy antwoordde HTTP 504: het proces van de dienst bleef binnen de wachttijd van de proxy niet op tijd.',
    doenUk: 'Повторіть. Якщо повторюється — це довгий запит або перевантаження; скопіюйте «Деталі».',
    doenNl: 'Probeer opnieuw. Blijft het, dan is het een lang verzoek of overbelasting; kopieer «Деталі».',
  },
};
// Cloudflare 520–530: de proxy vóór de server kreeg zelf geen antwoord. Elke status apart, zodat het getal in de tekst klopt.
for (const s of [520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530]) BASIS_REGELS[`HTTP_${s}`] = {
  uk: `Проксі перед сервером (Cloudflare) відповів HTTP ${s}: він не отримав відповіді від самого сервера.`,
  nl: `De proxy vóór de server (Cloudflare) antwoordde HTTP ${s}: hij kreeg geen antwoord van de server zelf.`,
  doenUk: 'Натисніть «Повторити». Якщо триває — перевірте, чи сервер увімкнений і доступний (журнал, діагностика).',
  doenNl: 'Klik op «Повторити». Blijft het, controleer dan of de server aan en bereikbaar is (logboek, diagnose).',
};
// SEC-002 (slot «u»): de nieuwe weigeringen van de server (rol «лише перегляд», grenzen van de lichamen, JSON_VEREIST,
// JOURNAAL_NIET_BESCHIKBAAR …) uit de ene tabel shared/weigering-tekst.ts. Een code die hier al een eigen regel heeft, wint.
for (const c of WEIGERING_CODES) { const r = weigeringRegel(c); if (r && !BASIS_REGELS[c]) BASIS_REGELS[c] = r; }
// 415 zonder eigen code (een proxy of een oudere server): dezelfde uitleg als JSON_VEREIST.
BASIS_REGELS.HTTP_415 = BASIS_REGELS.HTTP_415 || weigeringRegel('JSON_VEREIST')!;
/** Codes en statussen die de site ECHT kan uitleggen (bevroren na het vullen). */
const REGELS: Readonly<Record<string, Regel>> = Object.freeze(BASIS_REGELS);

// ------------------------------------------------------------------------------------------- bestand lezen (File API)
// Waarom dit hier staat (eigenaar 20.10.2026): het uploaden van een pakket eindigde met «Причина невідома: цього коду сайт не
// знає. Сервер повернув NotReadableError». Dat was twee keer fout: de server gaf die code NIET (het is een DOMException van de
// File API van de BROWSER), en de oorzaak is wél bekend — de browser kan het gekozen bestand niet meer van de schijf lezen.
// Zulke fouten krijgen daarom een eigen, zekere uitleg met een oorzaak en een handeling, en nooit het woord «сервер».
/** Voorvoegsel van een leesfout van een bestand: `BESTAND_LEZEN|<naam van de DOMException>`. */
export const BESTAND_LEZEN = 'BESTAND_LEZEN';
const BESTAND_SCHEIDING = '|';
/** Veilige map voor de eigenaar in de tekst (Windows; op macOS/Linux leest men «Завантаження»/«Downloads» net zo). */
const LOKALE_MAP = 'C:\\Users\\<ви>\\Downloads';
const KOPIEER_UK = `Скопіюйте файл у звичайну локальну теку (наприклад ${LOKALE_MAP}), переконайтеся, що він справді лежить на диску (а не лише «на вимогу» в хмарі), і оберіть його ще раз.`;
const KOPIEER_NL = 'Kopieer het bestand naar een gewone lokale map (bijvoorbeeld C:\\Users\\<u>\\Downloads), controleer dat het echt op de schijf staat (en niet alleen «op aanvraag» in de cloud) en kies het opnieuw.';
const BESTAND_REGELS: Readonly<Record<string, Regel>> = Object.freeze({
  NotReadableError: {
    uk: 'Браузер більше не може прочитати цей файл з диска (NotReadableError). Файл був обраний, але до читання змінився: його перемістили, перейменували, перезаписали (наприклад, завантажили заново), він лежить у хмарній теці (OneDrive або Google Drive «файли на вимогу») і не збережений локально, він на мережевому диску або його тримає антивірус. Сервер тут нічого не відповідав — цю помилку дав File API браузера на вашому пристрої.',
    nl: 'De browser kan dit bestand niet meer van de schijf lezen (NotReadableError). Het bestand was gekozen, maar wijzigde vóór het lezen: het is verplaatst, hernoemd, overschreven (bijvoorbeeld opnieuw gedownload), het staat in een cloudmap (OneDrive of Google Drive «bestanden op aanvraag») en is niet lokaal bewaard, het staat op een netwerkschijf of een virusscanner houdt het vast. De server antwoordde hier niets — deze fout komt van de File API van de browser op uw apparaat.',
    doenUk: KOPIEER_UK,
    doenNl: KOPIEER_NL,
  },
  NotFoundError: {
    uk: 'Обраного файлу вже немає там, де він був (NotFoundError): після вибору його перемістили, перейменували або видалили. Це повідомлення браузера, не сервера.',
    nl: 'Het gekozen bestand staat niet meer waar het stond (NotFoundError): na de keuze is het verplaatst, hernoemd of verwijderd. Dit is een melding van de browser, niet van de server.',
    doenUk: `Знайдіть файл, скопіюйте його в локальну теку (наприклад ${LOKALE_MAP}) і оберіть ще раз.`,
    doenNl: 'Zoek het bestand, kopieer het naar een lokale map (bijvoorbeeld C:\\Users\\<u>\\Downloads) en kies het opnieuw.',
  },
  SecurityError: {
    uk: 'Браузер заборонив читати цей файл (SecurityError): так буває з файлами із системних тек, із мережевого диска або коли права на файл не дають його прочитати. Сервер у цьому не брав участі.',
    nl: 'De browser staat het lezen van dit bestand niet toe (SecurityError): dat gebeurt bij bestanden uit systeemmappen, op een netwerkschijf, of als de rechten op het bestand lezen verhinderen. De server had hier geen deel in.',
    doenUk: `Скопіюйте файл у власну теку (наприклад ${LOKALE_MAP}) і оберіть його вже там.`,
    doenNl: 'Kopieer het bestand naar uw eigen map (bijvoorbeeld C:\\Users\\<u>\\Downloads) en kies het daar.',
  },
  AbortError: {
    uk: 'Читання файлу перервано (AbortError): вкладку оновили чи закрили, або читання скасували до кінця. Прочитане не збережено.',
    nl: 'Het lezen van het bestand is afgebroken (AbortError): het tabblad werd verversd of gesloten, of het lezen is geannuleerd. Wat al gelezen was, is niet bewaard.',
    doenUk: 'Оберіть файл ще раз і не закривайте й не оновлюйте вкладку, доки сайт читає файл.',
    doenNl: 'Kies het bestand opnieuw en sluit of ververs het tabblad niet zolang de site het bestand leest.',
  },
  EncodingError: {
    uk: 'Браузер не зміг декодувати вміст файлу (EncodingError): на диску він обрізаний або пошкоджений.',
    nl: 'De browser kon de inhoud van het bestand niet decoderen (EncodingError): op de schijf is het afgekapt of beschadigd.',
    doenUk: 'Отримайте файл заново (завантажте пакет ще раз) і оберіть новий файл.',
    doenNl: 'Haal het bestand opnieuw op (download het pakket nog eens) en kies het nieuwe bestand.',
  },
  InvalidStateError: {
    uk: 'Файл змінився після того, як ви його обрали (InvalidStateError): браузер тримає «знімок» файлу, якого на диску вже немає в такому вигляді.',
    nl: 'Het bestand is gewijzigd ná uw keuze (InvalidStateError): de browser houdt een «momentopname» vast die zo niet meer op de schijf staat.',
    doenUk: 'Оберіть файл ще раз (і не перезаписуйте його, доки триває читання чи завантаження).',
    doenNl: 'Kies het bestand opnieuw (en overschrijf het niet terwijl het wordt gelezen of geüpload).',
  },
});
/** Onbekende naam: eerlijk zeggen WAT er gebeurde (de browser kon niet lezen) en de rauwe naam laten zien — nooit «сервер повернув». */
const bestandAlgemeen = (naam: string): Regel => ({
  uk: `Браузер не зміг прочитати обраний файл до кінця (помилка File API «${naam || 'DOMException без назви'}»; окремого пояснення для цієї назви сайт не має). Це сталося у браузері на вашому пристрої — сервер цього коду не повертав. Найчастіша причина: файл перемістили, перейменували або перезаписали після вибору, він у хмарній теці «на вимогу» й не збережений локально, він на мережевому диску або його тримає антивірус.`,
  nl: `De browser kon het gekozen bestand niet volledig lezen (File API-fout «${naam || 'DOMException zonder naam'}»; voor die naam heeft de site geen eigen uitleg). Dit gebeurde in de browser op uw apparaat — de server gaf deze code niet. Meest voorkomende oorzaak: het bestand is verplaatst, hernoemd of overschreven na de keuze, het staat «op aanvraag» in een cloudmap en niet lokaal, het staat op een netwerkschijf of een virusscanner houdt het vast.`,
  doenUk: `${KOPIEER_UK} Якщо це повториться з файлом, який точно лежить локально — надішліть у підтримку назву «${naam || 'DOMException'}».`,
  doenNl: `${KOPIEER_NL} Blijft het gebeuren met een bestand dat zeker lokaal staat, stuur dan de naam «${naam || 'DOMException'}» naar ondersteuning.`,
});

/** De naam van de DOMException/Error die het lezen gaf ('' als die er niet is). */
export function bestandFoutNaam(oorzaak: unknown): string {
  const v = oorzaak as { name?: unknown; message?: unknown } | null;
  const naam = String(v?.name || '').trim();
  if (naam && naam !== 'Error') return naam;
  const code = String(v?.message || '').trim();
  return isBestandLeesfout(code) ? bestandLeesNaam(code) : '';
}
/** `BESTAND_LEZEN|<naam>`: de code waarmee een leesfout door de site reist (zoals UPLOAD_ONDERBROKEN|…). */
export function bestandLeesfoutCode(oorzaak: unknown): string {
  const code = String((oorzaak as { message?: unknown } | null)?.message || '').trim();
  if (isBestandLeesfout(code)) return code;
  return `${BESTAND_LEZEN}${BESTAND_SCHEIDING}${bestandFoutNaam(oorzaak) || 'DOMException'}`;
}
/** true = deze code is een leesfout van een bestand (van de BROWSER, niet van de server). */
export function isBestandLeesfout(code: string): boolean {
  return String(code || '').startsWith(`${BESTAND_LEZEN}${BESTAND_SCHEIDING}`);
}
/** De naam van de DOMException uit zo'n code. */
export function bestandLeesNaam(code: string): string {
  return isBestandLeesfout(code) ? String(code).slice(BESTAND_LEZEN.length + 1).trim() : '';
}
/** De regel (uitleg + handeling) voor één naam; een onbekende naam krijgt de eerlijke algemene regel. */
const bestandRegel = (naam: string): Regel => BESTAND_REGELS[naam] || bestandAlgemeen(naam);
/**
 * De uitleg van een leesfout van een bestand, uit deze enige bron. Neemt `BESTAND_LEZEN|NotReadableError` of alleen
 * `NotReadableError`; `bekend` zegt of de site juist deze naam kent (de tekst is in beide gevallen concreet).
 */
export function bestandLeesUitleg(lang: Lang, codeOfNaam: string): { naam: string; bekend: boolean; waarom: string; doen: string } {
  const naam = isBestandLeesfout(codeOfNaam) ? bestandLeesNaam(codeOfNaam) : String(codeOfNaam || '').trim();
  const r = bestandRegel(naam);
  return { naam, bekend: Object.prototype.hasOwnProperty.call(BESTAND_REGELS, naam), waarom: kiesTaal(lang, r.uk, r.nl), doen: kiesTaal(lang, r.doenUk, r.doenNl) };
}
/** Namen die de site met eigen woorden kan uitleggen (voor tests en overzichten). */
export const BESTAND_FOUTNAMEN: readonly string[] = Object.freeze(Object.keys(BESTAND_REGELS));

/** Alleen op de CODE (zonder de status): een eigen code van de server weegt zwaarder dan het HTTP-getal eromheen. */
const zoekRegelCode = (code: string): Regel | null => {
  const c = String(code || '').trim();
  if (!c) return null;
  // Een leesfout van een bestand kent de site altijd (oorzaak + handeling), ook als de naam van de DOMException nieuw is.
  if (isBestandLeesfout(c)) return bestandRegel(bestandLeesNaam(c));
  if (REGELS[c]) return REGELS[c];
  if (/^STEP_UP/.test(c)) return REGELS.STEP_UP_REQUIRED;
  if (/^(SESSION_REQUIRED|SESSION_EXPIRED)$/.test(c)) return REGELS.SESSION_REQUIRED;
  if (/_RATE_LIMITED$/.test(c)) return REGELS.RATE_LIMITED;
  if (/^EXTENSIE_VERGRENDELD/.test(c)) return REGELS.EXTENSIE_VERGRENDELD;
  return null;
};
/** Op de status, als de code niets opleverde. */
const zoekRegelStatus = (status: number): Regel | null => (status > 0 ? REGELS[`HTTP_${status}`] || null : null);
const zoekRegel = (code: string, status: number): Regel | null => zoekRegelCode(code) || zoekRegelStatus(status);

/** De uitleg + «wat nu» van één code/status uit de enige tabel, of null als de site die code niet kent. */
export function regelTekst(lang: Lang, code: string, status = 0): { waarom: string; doen: string } | null {
  const r = zoekRegel(String(code || ''), Number(status || 0));
  return r ? { waarom: kiesTaal(lang, r.uk, r.nl), doen: kiesTaal(lang, r.doenUk, r.doenNl) } : null;
}

// ------------------------------------------------------------------------------------------- tijd en poging
export function tijdTekst(lang: Lang, tijd?: number, zone?: string): string {
  if (!tijd || !Number.isFinite(tijd)) return kiesTaal(lang, 'час спроби не записано', 'tijd van de poging niet vastgelegd');
  const d = new Date(tijd);
  let klok: string;
  try { klok = new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: zone }).format(d); }
  catch { klok = d.toISOString().slice(11, 19); }
  const zn = zone ? ` ${zone}` : '';
  return kiesTaal(lang, `остання спроба ${klok}${zn}`, `laatste poging ${klok}${zn}`);
}
export function pogingTekst(lang: Lang, poging?: number, vanPogingen?: number): string {
  const n = Number(poging || 0);
  if (!n || n < 1) return kiesTaal(lang, 'спроба не пронумерована', 'poging niet genummerd');
  const van = Number(vanPogingen || 0) > 0 ? kiesTaal(lang, ` з ${vanPogingen}`, ` van ${vanPogingen}`) : '';
  return kiesTaal(lang, `спроба ${n}${van}`, `poging ${n}${van}`);
}

// ------------------------------------------------------------------------------------------- uitrol: alleen gemeten feiten
/** Uit POST /api/owner/uitrol/live: alleen een run met staat 'bezig' is een LOPENDE installatie. */
export function uitrolFeitUitLive(antwoord: unknown): UitrolFeit | null {
  const run = (antwoord as { run?: { staat?: string; versie?: string; stap?: string; uk?: string; nl?: string; pct?: number } } | null)?.run;
  if (!run || typeof run !== 'object') return null;
  if (run.staat !== 'bezig') return { actief: false, versie: String(run.versie || ''), bron: 'POST /api/owner/uitrol/live' };
  return {
    actief: true, versie: String(run.versie || ''), stap: String(run.stap || ''),
    stapUk: String(run.uk || ''), stapNl: String(run.nl || ''),
    pct: Number.isFinite(Number(run.pct)) ? Number(run.pct) : undefined,
    bron: 'POST /api/owner/uitrol/live',
  };
}
/**
 * Uit GET /api/version: dit zegt nooit dat er NU iets installeert — alleen welke versie nu draait. Een andere versie dan de
 * versie van vóór de storing is het feit «er is een nieuwe versie geïnstalleerd» (voltooid, niet lopend).
 */
export function uitrolFeitUitVersie(voor: string, nu: string): UitrolFeit | null {
  if (!nu || !voor || voor === nu) return null;
  return { actief: false, versie: nu, bron: 'GET /api/version' };
}

// ------------------------------------------------------------------------------------------- uitleg
const ONBEKEND_DOEN: [string, string] = [
  'Натисніть «Повторити». Якщо повторюється — скопіюйте «Деталі» (там код і сире тіло відповіді) і надішліть у підтримку.',
  'Klik op «Повторити». Blijft het, kopieer dan «Деталі» (met de code en het rauwe antwoordlichaam) en stuur het naar ondersteuning.',
];

/**
 * De enige toegestane tekst voor een code die de site NIET kent: zeggen dat de oorzaak onbekend is en de rauwe code laten zien.
 * Nooit een vermoeden («встановлюється оновлення», «спробуйте пізніше») in plaats hiervan.
 */
export function onbekendeOorzaak(lang: Lang, code: string, status = 0, metLichaam = false): string {
  const label = codeLabel({ code, status });
  return kiesTaal(lang,
    `Причина невідома: цього коду сайт не знає. Сервер повернув ${label}${metLichaam ? ' і тіло відповіді (див. «Деталі»)' : ' без пояснення'}. Нічого не вигадуємо — надішліть цей код у підтримку.`,
    `De oorzaak is onbekend: deze code kent de site niet. De server gaf ${label}${metLichaam ? ' en een antwoordlichaam (zie «Деталі»)' : ' zonder uitleg'}. Wij verzinnen er niets bij — stuur deze code naar ondersteuning.`);
}

export function legUit(lang: Lang, feiten: Feiten): Uitleg {
  const code = String(feiten.code || '').trim();
  const status = Number(feiten.status || 0);
  const label = codeLabel(feiten);
  const dienst = dienstNaam(lang, feiten.dienst);
  const operatie = kiesTaal(lang, feiten.operatie[0], feiten.operatie[1]);
  const route = String(feiten.route || '').trim();
  const tijd = tijdTekst(lang, feiten.tijd, feiten.zone);
  const poging = pogingTekst(lang, feiten.poging, feiten.vanPogingen);

  // Rangorde: eigen regel voor DEZE code → oorzaak die de uitrolketen zelf noemde (shared/uitrol-codes.ts) → regel voor de
  // HTTP-status. Zo overschrijft «HTTP 409» nooit een code als NIET_NIEUWER, die veel meer zegt.
  const uitrolTitel = code && UITROL_CODES[code] ? uitrolCodeTitel(lang, code) : '';
  const regelVoorCode = zoekRegelCode(code);
  const regel = regelVoorCode || (uitrolTitel ? null : zoekRegelStatus(status));
  const zeker = !!regel || !!uitrolTitel;

  const titel = kiesTaal(lang,
    `${operatie} — не вдалося: ${dienst}, ${label}`,
    `${operatie} — mislukt: ${dienst}, ${label}`);

  const waaromDelen: string[] = [];
  // Eerste zin = alleen vastgelegde feiten: route (als die er is), dienst, code, tijdstip en pogingnummer.
  waaromDelen.push(route
    ? kiesTaal(lang, `Запит ${route} до сервісу ${dienst}: ${label}, ${tijd}, ${poging}.`, `Verzoek ${route} naar dienst ${dienst}: ${label}, ${tijd}, ${poging}.`)
    : kiesTaal(lang, `Операція «${operatie}», сервіс ${dienst}: ${label}, ${tijd}, ${poging}.`, `Operatie «${operatie}», dienst ${dienst}: ${label}, ${tijd}, ${poging}.`));
  if (regel) waaromDelen.push(kiesTaal(lang, regel.uk, regel.nl));
  else if (uitrolTitel) waaromDelen.push(kiesTaal(lang,
    `Сервер назвав причину: ${uitrolTitel} (код ${code}).`,
    `De server noemde de oorzaak: ${uitrolTitel} (code ${code}).`));
  else waaromDelen.push(onbekendeOorzaak(lang, code, status, !!feiten.lichaam));

  // Punt 4 van de eigenaar: over een installatie alleen met een gemeten feit.
  // Kwam er helemaal geen antwoord (status 0: offline, afgebroken, netwerk), dan zegt een uitrolstand niets over deze fout —
  // dan zwijgt de melding er ook over in plaats van een regel te vullen.
  const u = feiten.uitrol || null;
  const installatie = !!u?.actief;
  if (installatie) {
    const stap = kiesTaal(lang, u!.stapUk || u!.stap || '', u!.stapNl || u!.stap || '');
    waaromDelen.push(kiesTaal(lang,
      `Підтверджено (${u!.bron || 'стан розгортання'}): іде встановлення версії ${u!.versie || '—'}${stap ? `, крок «${stap}»` : ''}${typeof u!.pct === 'number' ? ` (${u!.pct}%)` : ''}.`,
      `Bevestigd (${u!.bron || 'uitrolstand'}): installatie van versie ${u!.versie || '—'} loopt${stap ? `, stap «${stap}»` : ''}${typeof u!.pct === 'number' ? ` (${u!.pct}%)` : ''}.`));
  } else if (status === 0) {
    // Geen serverantwoord (offline, afgebroken, netwerk): de uitrolstand zegt niets over deze fout, dus zwijgen we erover.
  } else if (u && u.versie) {
    waaromDelen.push(kiesTaal(lang,
      `Стан розгортання перевірено (${u.bron || 'стан розгортання'}): встановлення НЕ йде; зараз працює версія ${u.versie}.`,
      `De uitrolstand is nagekeken (${u.bron || 'uitrolstand'}): er loopt GEEN installatie; nu draait versie ${u.versie}.`));
  } else {
    waaromDelen.push(kiesTaal(lang,
      'Чи йде встановлення оновлення — сайт не знає: стан розгортання не підтверджено. Тому про оновлення тут нічого не стверджуємо.',
      'Of er een update wordt geïnstalleerd, weet de site niet: de uitrolstand is niet bevestigd. Daarom beweren wij hier niets over een update.'));
  }

  const doen = regel ? kiesTaal(lang, regel.doenUk, regel.doenNl)
    : uitrolTitel && uitrolCodeDoen(lang, code) ? uitrolCodeDoen(lang, code)
      : kiesTaal(lang, ONBEKEND_DOEN[0], ONBEKEND_DOEN[1]);

  const details = [
    `${kiesTaal(lang, 'операція', 'operatie')}: ${operatie}`,
    `${kiesTaal(lang, 'сервіс', 'dienst')}: ${feiten.dienst || '—'} (${dienst})`,
    `${kiesTaal(lang, 'маршрут', 'route')}: ${route || '—'}`,
    `${kiesTaal(lang, 'код', 'code')}: ${label}`,
    `${kiesTaal(lang, 'сира відповідь', 'rauw antwoord')}: ${code || '—'}${status ? ` / HTTP ${status}` : ''}`,
    `${kiesTaal(lang, 'час', 'tijd')}: ${feiten.tijd ? new Date(feiten.tijd).toISOString() : '—'} (${tijd})`,
    `${kiesTaal(lang, 'спроба', 'poging')}: ${poging}`,
    `${kiesTaal(lang, 'стан розгортання', 'uitrolstand')}: ${u ? `${u.actief ? kiesTaal(lang, 'іде встановлення', 'installatie loopt') : kiesTaal(lang, 'не йде', 'loopt niet')}; ${kiesTaal(lang, 'версія', 'versie')} ${u.versie || '—'}${u.stap ? `; ${kiesTaal(lang, 'крок', 'stap')} ${u.stap}` : ''}; ${kiesTaal(lang, 'джерело', 'bron')} ${u.bron || '—'}` : kiesTaal(lang, 'не перевірено (сайт не знає)', 'niet nagekeken (de site weet het niet)')}`,
    `${kiesTaal(lang, 'тіло відповіді', 'antwoordlichaam')}: ${feiten.lichaam ? String(feiten.lichaam).slice(0, 2000) : '—'}`,
  ];

  return { titel, waarom: waaromDelen.join(' '), doen, zeker, installatie, codeLabel: label, dienstLabel: dienst, tijdLabel: tijd, pogingLabel: poging, details };
}

/** Eén blok voor het klembord (knop «Копіювати»): precies de regels uit «Деталі», met een kop. */
export function detailsTekst(lang: Lang, feiten: Feiten, uitleg?: Uitleg): string {
  const u = uitleg || legUit(lang, feiten);
  const kop = kiesTaal(lang, 'Mijn Ruimte — технічні подробиці помилки', 'Mijn Ruimte — technische details van de fout');
  return [kop, u.titel, ...u.details].join('\n');
}

// ------------------------------------------------------------------------------------------- compacte feitenregel + pogingteller
/**
 * Eén regel met alleen feiten, achter een korte melding in de interface (daar past geen hele plakkaat):
 * «Деталі: сервіс hub · HTTP 502 · GET /api/version · остання спроба 12:00:03 · спроба 2».
 * Ontbreekt een feit, dan staat dat er ook (nooit een verzonnen waarde).
 */
export function feitRegel(lang: Lang, feiten: Pick<Feiten, 'dienst' | 'route' | 'code' | 'status' | 'tijd' | 'poging' | 'vanPogingen' | 'zone'>): string {
  const delen = [
    `${kiesTaal(lang, 'сервіс', 'dienst')} ${feiten.dienst || '—'}`,
    codeLabel(feiten),
    feiten.route || kiesTaal(lang, 'маршрут не записано', 'route niet vastgelegd'),
    tijdTekst(lang, feiten.tijd, feiten.zone),
    pogingTekst(lang, feiten.poging, feiten.vanPogingen),
  ];
  return `${kiesTaal(lang, 'Деталі', 'Details')}: ${delen.join(' · ')}`;
}

// Pogingen tellen per operatie. Waarom hier: de eigenaar moet in de melding «спроба 3» kunnen lezen, en dat getal mag niet uit een
// render komen (dan loopt het op zonder dat er iets gebeurde). Daarom telt alleen wie een ECHTE mislukte poging meldt (een
// catch-blok), en alleen binnen een venster: na POGING_VENSTER_MS zonder mislukking begint de telling weer bij 1.
export const POGING_VENSTER_MS = 120_000;
const tellers = new Map<string, { poging: number; tijd: number }>();
export function telPoging(sleutel: string, nu: number = Date.now(), vensterMs: number = POGING_VENSTER_MS): { poging: number; tijd: number } {
  const oud = tellers.get(sleutel);
  const stand = { poging: oud && nu - oud.tijd <= vensterMs ? oud.poging + 1 : 1, tijd: nu };
  tellers.set(sleutel, stand);
  return stand;
}
/** Na een geslaagde poging: de telling van deze operatie begint weer bij 1. */
export function wisPoging(sleutel: string) { tellers.delete(sleutel); }
/** Alleen voor tests. */
export const _wisAllePogingen = () => tellers.clear();
