// «Магазин календарів» van de hub (hub.tarasevych.com/agenda): welke agenda's u kunt koppelen en wat er dan ECHT werkt.
//
// Eerlijkheidsregel (zelfde regel als shared/integraties-catalogus.ts; de tests
// tests/eenheid/hub-agenda-notities-20261019.test.ts en tests/eenheid/agenda-ics-caldav-20261020.test.ts dwingen haar af):
//   stand 'beschikbaar'  de site kan deze agenda vandaag koppelen; `doel` wijst naar de pagina die dat werkelijk doet,
//                        en `richting` zegt wat er daarna werkt — niet wat we zouden willen.
//   stand 'binnenkort'   er is GEEN koppeling. Geen doel, `richting: 'geen'`, en `ontbreekt` zegt in gewone woorden
//                        wat er op de server mist. De kaart kan dus niet «verbinden» en doet ook niet alsof.
//   `beperking`          ook bij 'beschikbaar': wat er na het koppelen NOG NIET kan. Verplicht zodra `richting`
//                        niet alles dekt.
//   `viaIcs`             een aanbieder die wij niet rechtstreeks kunnen koppelen, maar die zelf een .ics-link geeft:
//                        dan werkt hij vandaag al via het ICS-abonnement. Dat is een EXTRA, nooit een vervanging van
//                        `stand` — en er staat altijd bij dat het lezen is.
// De LEVENDE stand («підключено») komt niet uit dit bestand maar van de server
// (POST /api/owner/agenda/overzicht → toegang.lezen / de lijst abonnementen), want alleen de server weet of de
// koppeling er werkelijk is.
//
// Stand van zaken op 20.10.2026 (nagekeken in de code, niet gewenst maar werkelijk):
//   Google Calendar  LEZEN ÉN SCHRIJVEN. backend/google-suite-inrichting.ts vraagt `auth/calendar.readonly` én
//                    `auth/calendar.events`; backend/agenda-google.ts maakt, wijzigt, verplaatst en wist afspraken,
//                    beheert deelnemers en antwoordt op uitnodigingen — met If-Match/etag tegen stil overschrijven
//                    en met een idempotentiesleutel. backend/google-suite-agenda-sync.ts haalt per agenda
//                    incrementeel op (syncToken, 410 GONE → volledige hersynchronisatie).
//                    Wie eerder alleen-lezen koppelde, breidt één keer de toestemming uit (incrementele autorisatie).
//   ICS              LEZEN. backend/agenda-ics.ts haalt een echte .ics op: alleen https, DNS-pinning, time-out,
//                    maximum grootte, een schema met ondergrens en If-None-Match.
//   CalDAV/Fastmail  LEZEN. backend/agenda-caldav.ts doet PROPFIND (principal → home-set → agenda's) en REPORT
//                    (calendar-query binnen een venster) met een app-wachtwoord. SCHRIJVEN is NIET gebouwd; wat
//                    daarvoor nog mist, staat in shared/agenda-caldav-model.ts → AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.
//   Microsoft        NIETS. backend/mail-microsoft.ts vraagt alleen Mail.*-scopes — geen Calendars.*.
//   Proton           geen API (afspraken zijn aan de clientzijde versleuteld), maar een gedeelde .ics-link van
//                    Proton werkt wél via het ICS-abonnement — lezen.
import { AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT } from './agenda-caldav-model';

export type AgendaStand = 'beschikbaar' | 'binnenkort';
/** Wat er na het koppelen ECHT werkt. */
export type AgendaRichting = 'lezen' | 'lezen-en-schrijven' | 'geen';
export type AgendaMethode = 'oauth' | 'caldav' | 'ics' | 'bridge';
export type Tweetalig = readonly [string, string];
/** Sleutels die de server levend kan bevestigen. */
export type AgendaLevend = 'calendar' | 'ics' | 'caldav';

export type AgendaAanbieder = {
  id: string;
  naam: string;
  /** simple-icons-slug van het merk. De hub tekent hem (nog) NIET: de grote merkentabel hoort bij de
   *  beheerpagina en mag niet in de hub-bundel; de kaart toont een monogram. Bewaard voor als dat verandert. */
  logo: string;
  site: string;
  methode: AgendaMethode;
  stand: AgendaStand;
  richting: AgendaRichting;
  uitleg: Tweetalig;
  /** Waar de koppeling werkelijk gebeurt. Alleen bij 'beschikbaar'. */
  doel?: { dienst: 'cloud' | 'mail' | 'identity' | 'hub'; tab: string };
  /** Sleutel van de levende servercontrole. Alleen bij 'beschikbaar'. */
  levend?: AgendaLevend;
  /** Wat er nog ontbreekt. Verplicht bij 'binnenkort'. */
  ontbreekt?: Tweetalig;
  /** Wat er na het koppelen nog NIET kan, ook bij 'beschikbaar'. Leeg = alles van `richting` werkt. */
  beperking?: Tweetalig;
  /** Werkt vandaag al via een .ics-link van de aanbieder zelf (altijd lezen). */
  viaIcs?: Tweetalig;
};

export const AGENDA_STAND_LABEL: Record<AgendaStand, Tweetalig> = Object.freeze({
  beschikbaar: ['доступно', 'beschikbaar'],
  binnenkort: ['скоро', 'binnenkort'],
});
export const AGENDA_RICHTING_LABEL: Record<AgendaRichting, Tweetalig> = Object.freeze({
  lezen: ['лише читання', 'alleen lezen'],
  'lezen-en-schrijven': ['читання й запис', 'lezen en schrijven'],
  geen: ['нічого ще не працює', 'nog niets werkt'],
});
/** De levende stand die de server kan bevestigen. */
export const AGENDA_VERBONDEN_LABEL: Tweetalig = Object.freeze(['підключено', 'gekoppeld']) as Tweetalig;

/** Wat de Google-koppeling na de uitbreiding nog NIET doet. Apart, want de pagina laat het ook los zien. */
export const AGENDA_GOOGLE_BEPERKING: Tweetalig = Object.freeze([
  'Немає відеозустрічей (Google Meet у події), вкладень, перевірки вільного часу учасників (free/busy) і окремих виключень в серії (змінити одну подію з повторюваних): серія змінюється цілком. Правила повторення — базові (щодня/щотижня/щомісяця/щороку, інтервал, кількість або дата кінця, дні тижня).',
  'Geen videovergadering (Google Meet in de afspraak), geen bijlagen, geen vrij/bezet-controle van gasten (free/busy) en geen losse uitzondering in een reeks (één afspraak uit een herhaling apart wijzigen): de reeks wijzigt in haar geheel. De herhalingsregels zijn de basis (dagelijks/wekelijks/maandelijks/jaarlijks, interval, aantal of einddatum, weekdagen).',
]) as Tweetalig;

/** De CalDAV-beperking in één zin plus de volledige lijst uit shared/agenda-caldav-model.ts. */
const caldavBeperking = (): Tweetalig => Object.freeze([
  `Лише читання. Для запису бракує: ${AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.map((r) => r[0]).join(' ')}`,
  `Alleen lezen. Voor schrijven ontbreekt: ${AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.map((r) => r[1]).join(' ')}`,
]) as Tweetalig;

export const AGENDA_AANBIEDERS: readonly AgendaAanbieder[] = Object.freeze([
  {
    id: 'google-calendar', naam: 'Google Calendar', logo: 'googlecalendar', site: 'https://calendar.google.com',
    methode: 'oauth', stand: 'beschikbaar', richting: 'lezen-en-schrijven', doel: { dienst: 'cloud', tab: 'google' }, levend: 'calendar',
    uitleg: [
      'Підключається через Google-доступ однією кнопкою. Хаб читає ваші календарі й події та створює, змінює, переносить і видаляє події, керує учасниками й відповідає на запрошення.',
      'Koppelt met één knop via Google-toegang. De hub leest uw agenda’s en afspraken én maakt, wijzigt, verplaatst en verwijdert afspraken, beheert gasten en antwoordt op uitnodigingen.',
    ],
    beperking: AGENDA_GOOGLE_BEPERKING,
  },
  {
    id: 'ics-abonnement', naam: 'ICS', logo: '', site: 'https://icalendar.org',
    methode: 'ics', stand: 'beschikbaar', richting: 'lezen', doel: { dienst: 'hub', tab: 'calendar' }, levend: 'ics',
    uitleg: [
      'Підписка на посилання .ics (розклад, свята, спортивний календар, спільний календар іншого сервісу). Сервер сам оновлює її за розкладом.',
      'Een abonnement op een .ics-link (rooster, feestdagen, sportkalender, een gedeelde agenda van een andere dienst). De server verlaagt haar zelf volgens een schema.',
    ],
    beperking: [
      'Підписка .ics за своєю природою односторонняя: у чужий календар за посиланням записати нічого не можна. Дозволено лише https, є обмеження на розмір, тайм-аут і найменший інтервал оновлення (15 хв).',
      'Een .ics-abonnement is van zichzelf eenrichting: in een andere agenda schrijven kan via een link niet. Alleen https is toegestaan, met een grens op de grootte, een time-out en een kleinste verversingsinterval (15 min).',
    ],
  },
  {
    id: 'caldav', naam: 'CalDAV / iCloud', logo: 'apple', site: 'https://www.icloud.com/calendar',
    methode: 'caldav', stand: 'beschikbaar', richting: 'lezen', doel: { dienst: 'hub', tab: 'calendar' }, levend: 'caldav',
    uitleg: [
      'Відкритий протокол CalDAV: iCloud, Nextcloud та інші сервери — з паролем застосунку. Хаб знаходить ваші календарі й читає події.',
      'Het open CalDAV-protocol: iCloud, Nextcloud en andere servers — met een app-wachtwoord. De hub vindt uw agenda’s en leest de afspraken.',
    ],
    beperking: caldavBeperking(),
  },
  // ---- Телефони та планшети (29.10.2026). Кожен виробник кладе на пристрій власний календар, і тому події
  // «розповзаються». Міст хаба: пристрій синхронізує свій календар з обліковим записом (Google чи iCloud) —
  // хаб підключається до ТОГО САМОГО облікового запису, і зміни течуть в обидва боки настільки, наскільки
  // це реально працює (Google: читання й запис; iCloud: поки лише читання). Жодна картка нижче не вигадує
  // власного API виробника — його не існує, і це написано на картці.
  {
    id: 'apple-icloud', naam: 'iPhone / iPad (iCloud)', logo: 'apple', site: 'https://www.icloud.com/calendar',
    methode: 'caldav', stand: 'beschikbaar', richting: 'lezen', doel: { dienst: 'hub', tab: 'calendar' }, levend: 'caldav',
    uitleg: [
      'iPhone та iPad синхронізують свій календар із iCloud. Підключіть iCloud (пароль застосунку) — і події з телефона читаються в хабі за кілька хвилин.',
      'iPhone en iPad synchroniseren hun agenda met iCloud. Koppel iCloud (app-wachtwoord) — en de afspraken van de telefoon zijn binnen enkele minuten in de hub te lezen.',
    ],
    beperking: caldavBeperking(),
  },
  {
    id: 'samsung-calendar', naam: 'Samsung Calendar', logo: 'samsung', site: 'https://www.samsung.com/us/support/answer/ANS00077634/',
    methode: 'bridge', stand: 'beschikbaar', richting: 'lezen-en-schrijven', doel: { dienst: 'cloud', tab: 'google' }, levend: 'calendar',
    uitleg: [
      'Телефони Samsung синхронізують календар з Google-акаунтом (Налаштування → Облікові записи → Google → Календар). Підключіть той САМИЙ Google-акаунт — і подія, створена на телефоні, з’явиться в хабі, а створена в хабі — на телефоні.',
      'Samsung-telefoons synchroniseren de agenda met het Google-account (Instellingen → Accounts → Google → Agenda). Koppel DATZELFDE Google-account — en een afspraak van de telefoon verschijnt in de hub, en één uit de hub op de telefoon.',
    ],
    beperking: [
      'Міст працює лише через Google: власного публічного API Samsung Calendar не має. Події, збережені тільки в «обліковому записі Samsung» (Samsung Cloud), на міст не потрапляють — увімкніть синхронізацію календаря з Google на телефоні.',
      'De brug loopt alleen via Google: Samsung Calendar heeft geen eigen publieke API. Afspraken die alleen in het «Samsung-account» (Samsung Cloud) staan, komen niet op de brug — zet op de telefoon de agendasynchronisatie met Google aan.',
    ],
  },
  {
    id: 'honor-calendar', naam: 'HONOR / Android', logo: 'honor', site: 'https://www.honor.com/global/support/',
    methode: 'bridge', stand: 'beschikbaar', richting: 'lezen-en-schrijven', doel: { dienst: 'cloud', tab: 'google' }, levend: 'calendar',
    uitleg: [
      'HONOR та будь-який Android із сервісами Google синхронізують календар з Google-акаунтом. Підключіть той САМИЙ акаунт — і міст двосторонній: телефон ↔ хаб ↔ інші підключені пристрої.',
      'HONOR en elke Android met Google-diensten synchroniseren de agenda met het Google-account. Koppel DATZELFDE account — en de brug is tweerichting: telefoon ↔ hub ↔ andere gekoppelde toestellen.',
    ],
    beperking: [
      'Міст працює лише через Google: власного публічного API календар HONOR не має. На телефоні календар має синхронізуватися з Google-акаунтом (Налаштування → Облікові записи → Google → Календар).',
      'De brug loopt alleen via Google: de HONOR-agenda heeft geen eigen publieke API. Op de telefoon moet de agenda met het Google-account synchroniseren (Instellingen → Accounts → Google → Agenda).',
    ],
  },
  {
    id: 'huawei-calendar', naam: 'Huawei', logo: 'huawei', site: 'https://consumer.huawei.com/en/mobileservices/',
    methode: 'bridge', stand: 'binnenkort', richting: 'geen',
    uitleg: [
      'Календар Huawei на телефонах без сервісів Google синхронізується лише з Huawei Cloud.',
      'De Huawei-agenda op telefoons zonder Google-diensten synchroniseert alleen met Huawei Cloud.',
    ],
    ontbreekt: [
      'Huawei Cloud не має публічного API календаря для сторонніх сайтів (Calendar Kit працює лише в застосунках на самому пристрої), тож прямого підключення немає — ні читання, ні запису. Якщо на телефоні все ж додано Google-акаунт або Exchange і календар синхронізується з ним — підключіть ТОЙ акаунт, і міст запрацює через нього.',
      'Huawei Cloud heeft geen publieke agenda-API voor externe sites (Calendar Kit werkt alleen in apps op het toestel zelf), dus een directe koppeling bestaat niet — lezen noch schrijven. Staat er op de telefoon tóch een Google-account of Exchange en synchroniseert de agenda daarmee — koppel DAT account, dan loopt de brug daarlangs.',
    ],
  },
  {
    id: 'fastmail', naam: 'Fastmail', logo: 'fastmail', site: 'https://www.fastmail.com/calendar',
    methode: 'caldav', stand: 'beschikbaar', richting: 'lezen', doel: { dienst: 'hub', tab: 'calendar' }, levend: 'caldav',
    uitleg: [
      'Календар Fastmail через той самий CalDAV-клієнт і пароль застосунку.',
      'De Fastmail-agenda via dezelfde CalDAV-cliënt en een app-wachtwoord.',
    ],
    beperking: caldavBeperking(),
    viaIcs: [
      'Fastmail також дає посилання .ics на календар — його можна додати як підписку (теж читання).',
      'Fastmail geeft ook een .ics-link op een agenda — die kunt u als abonnement toevoegen (ook lezen).',
    ],
  },
  {
    id: 'proton-calendar', naam: 'Proton Calendar', logo: 'protonmail', site: 'https://proton.me/calendar',
    methode: 'bridge', stand: 'binnenkort', richting: 'geen',
    uitleg: [
      'Календар Proton із наскрізним шифруванням.',
      'De Proton-agenda met end-to-end-versleuteling.',
    ],
    ontbreekt: [
      'Proton Calendar не має публічного API: події зашифровані на боці клієнта, тому прямого підключення (ні читання, ні запису) зробити неможливо — потрібен Proton Bridge на вашому сервері, якого немає.',
      'Proton Calendar heeft geen publieke API: de afspraken zijn aan de clientzijde versleuteld, dus een directe koppeling (lezen noch schrijven) is onmogelijk — daarvoor is een Proton Bridge op uw server nodig, die er niet is.',
    ],
    viaIcs: [
      'Але Proton (платний тариф) дає посилання на календар «поділитися через посилання». Додайте його як підписку .ics — хаб читатиме події. Запис цим шляхом неможливий: посилання Proton лише для читання.',
      'Maar Proton (betaald abonnement) geeft een «delen via link»-adres van een agenda. Voeg dat als .ics-abonnement toe — de hub leest de afspraken. Schrijven kan via die weg niet: de link van Proton is alleen-lezen.',
    ],
  },
  {
    id: 'microsoft-outlook', naam: 'Microsoft / Outlook', logo: 'microsoftoutlook', site: 'https://outlook.live.com/calendar',
    methode: 'oauth', stand: 'binnenkort', richting: 'geen',
    uitleg: [
      'Календар Outlook і Microsoft 365 через Microsoft Graph.',
      'De agenda van Outlook en Microsoft 365 via Microsoft Graph.',
    ],
    ontbreekt: [
      'Вхід Microsoft на сервері запитує лише області пошти (Mail.Read, Mail.ReadWrite, Mail.Send). Для календаря потрібні області Calendars.Read і Calendars.ReadWrite та маршрути календаря Graph — їх ще немає.',
      'De Microsoft-aanmelding op de server vraagt alleen mailscopes (Mail.Read, Mail.ReadWrite, Mail.Send). Voor de agenda zijn Calendars.Read en Calendars.ReadWrite en Graph-agendaroutes nodig — die zijn er nog niet.',
    ],
    viaIcs: [
      'Опублікуйте календар в Outlook («Поділитися → Опублікувати календар») і додайте отримане посилання .ics як підписку — це працює вже сьогодні, лише читання.',
      'Publiceer de agenda in Outlook («Delen → Agenda publiceren») en voeg het .ics-adres als abonnement toe — dat werkt vandaag al, alleen lezen.',
    ],
  },
]);

export const agendaAanbieder = (id: unknown): AgendaAanbieder | undefined => AGENDA_AANBIEDERS.find((a) => a.id === id);
export const agendaBeschikbaar = (): readonly AgendaAanbieder[] => AGENDA_AANBIEDERS.filter((a) => a.stand === 'beschikbaar');
export const agendaBinnenkort = (): readonly AgendaAanbieder[] => AGENDA_AANBIEDERS.filter((a) => a.stand === 'binnenkort');
/** Aanbieders die wij niet rechtstreeks koppelen maar die via een .ics-link vandaag al te lezen zijn. */
export const agendaViaIcs = (): readonly AgendaAanbieder[] => AGENDA_AANBIEDERS.filter((a) => Boolean(a.viaIcs));

/** De stand die de gebruiker te zien krijgt: de levende servercontrole gaat vóór de catalogus. */
export type AgendaKaartStand = 'verbonden' | 'beschikbaar' | 'binnenkort';
export function agendaKaartStand(aanbieder: AgendaAanbieder, gekoppeld: Partial<Record<AgendaLevend, boolean | null>> = {}): AgendaKaartStand {
  if (aanbieder.stand === 'binnenkort') return 'binnenkort';
  if (aanbieder.levend && gekoppeld[aanbieder.levend] === true) return 'verbonden';
  return 'beschikbaar';
}

/** Mag deze kaart een «підключити»-knop tonen? Nooit bij 'binnenkort'. */
export const agendaKanVerbinden = (aanbieder: AgendaAanbieder) => aanbieder.stand === 'beschikbaar' && Boolean(aanbieder.doel);

export const agendaTekst = (paar: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? paar[0] : paar[1]);
