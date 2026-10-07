// Mogelijkheden van de browserextensie zoals de gebruiker ze in het kabinet ziet: naam, groep en een uitleg voor AAN en UIT.
// De lijst met opdrachttypes zelf staat in backend/browser-capabilities.ts (server) en extension/shared.js (extensie).
export type CapGroup = 'read' | 'navigate' | 'interact' | 'advanced';
export type Cap = {
  type: string; group: CapGroup; auto: boolean; // auto = mag "zonder bevestiging" als de gebruiker dat kiest
  uk: string; nl: string; on: [string, string]; off: [string, string];
};

export const GROUPS: Record<CapGroup, { uk: string; nl: string; hint: [string, string] }> = {
  read: { uk: 'Читання й перегляд', nl: 'Lezen en kijken', hint: ['Нічого не змінює на сайті.', 'Verandert niets op de site.'] },
  navigate: { uk: 'Навігація', nl: 'Navigatie', hint: ['Відкриває сторінки лише на tarasevych.com.', "Opent alleen pagina's op tarasevych.com."] },
  interact: { uk: 'Дії на сторінці', nl: 'Handelen op de pagina', hint: ['Завжди чекає вашого «Дозволити», автоматично не буває.', 'Wacht altijd op uw "Toestaan", nooit automatisch.'] },
  advanced: { uk: 'Розширені', nl: 'Geavanceerd', hint: ['Можуть показати приватні дані, кожен раз потрібне «Дозволити».', 'Kunnen privégegevens tonen; elke keer "Toestaan".'] },
};

export const CAPABILITIES: Cap[] = [
  { type: 'browser.snapshot', group: 'read', auto: true, uk: 'Читати сторінку', nl: 'Pagina lezen',
    on: ['ШІ бачить текст, заголовки й елементи керування відкритої сторінки сайту (без паролів і без значень полів).', 'De AI ziet tekst, koppen en bedieningselementen van de open pagina (zonder wachtwoorden en veldwaarden).'],
    off: ['ШІ не може прочитати сторінку.', 'De AI kan de pagina niet lezen.'] },
  { type: 'browser.diagnostics', group: 'read', auto: true, uk: 'Діагностика сторінки', nl: 'Paginadiagnose',
    on: ['ШІ бачить помилки JavaScript, помилки консолі, невдалі запити (метод, шлях без параметрів і статус) та метрики швидкості.', 'De AI ziet JavaScript- en consolefouten, mislukte verzoeken (methode, pad zonder query, status) en snelheidsmetrics.'],
    off: ['ШІ не бачить технічних помилок сторінки.', 'De AI ziet geen technische fouten van de pagina.'] },
  { type: 'browser.tabs', group: 'read', auto: true, uk: 'Список вкладок', nl: 'Tabbladenlijst',
    on: ['ШІ бачить назви й адреси відкритих вкладок сайту (інших сайтів не бачить).', "De AI ziet titels en adressen van open tabbladen van deze site (andere sites niet)."],
    off: ['ШІ не знає, які вкладки відкриті.', 'De AI weet niet welke tabbladen open staan.'] },
  { type: 'browser.scroll', group: 'read', auto: true, uk: 'Прокручування', nl: 'Scrollen',
    on: ['ШІ може гортати сторінку, щоб побачити більше. Дані не змінюються.', 'De AI kan de pagina scrollen om meer te zien. Er verandert niets aan de gegevens.'],
    off: ['ШІ бачить лише ту частину сторінки, яка вже на екрані.', 'De AI ziet alleen wat al in beeld is.'] },
  { type: 'browser.wait', group: 'read', auto: true, uk: 'Очікування тексту', nl: 'Wachten op tekst',
    on: ['ШІ може зачекати до 15 секунд, поки на сторінці з’явиться певний текст.', 'De AI kan tot 15 seconden wachten tot een bepaalde tekst op de pagina verschijnt.'],
    off: ['ШІ не може чекати на завантаження результату.', 'De AI kan niet wachten op een resultaat.'] },
  { type: 'browser.navigate', group: 'navigate', auto: true, uk: 'Відкривати сторінки', nl: "Pagina's openen",
    on: ['ШІ може відкрити сторінку сайту у вашій вкладці (лише tarasevych.com).', 'De AI kan een pagina van de site in uw tabblad openen (alleen tarasevych.com).'],
    off: ['ШІ не може відкривати сторінки, лише бачити відкриту.', 'De AI kan geen pagina\'s openen, alleen de open pagina zien.'] },
  { type: 'browser.history', group: 'navigate', auto: true, uk: 'Назад, вперед, оновити', nl: 'Terug, vooruit, verversen',
    on: ['ШІ може повернутись назад, піти вперед або оновити сторінку.', 'De AI kan terug, vooruit of de pagina verversen.'],
    off: ['ШІ не може керувати історією вкладки.', 'De AI kan de geschiedenis van het tabblad niet bedienen.'] },
  { type: 'browser.click', group: 'interact', auto: false, uk: 'Кліки', nl: 'Klikken',
    on: ['ШІ може натискати кнопки й посилання за назвою. Кожен клік чекає вашого «Дозволити». Поля паролів і оплати недоступні.', 'De AI kan knoppen en links op naam aanklikken. Elke klik wacht op uw "Toestaan". Wachtwoord- en betaalvelden zijn uitgesloten.'],
    off: ['ШІ не може нічого натискати.', 'De AI kan niets aanklikken.'] },
  { type: 'browser.type', group: 'interact', auto: false, uk: 'Введення тексту', nl: 'Tekst typen',
    on: ['ШІ може вписувати текст у поля. Кожне введення чекає вашого «Дозволити». Поля паролів і оплати недоступні.', 'De AI kan tekst in velden typen. Elke invoer wacht op uw "Toestaan". Wachtwoord- en betaalvelden zijn uitgesloten.'],
    off: ['ШІ не може нічого вписувати.', 'De AI kan niets typen.'] },
  { type: 'browser.select', group: 'interact', auto: false, uk: 'Вибір у списках', nl: 'Kiezen in lijsten',
    on: ['ШІ може вибрати пункт у випадному списку. Кожен вибір чекає вашого «Дозволити».', 'De AI kan een optie in een keuzelijst kiezen. Elke keuze wacht op uw "Toestaan".'],
    off: ['ШІ не може змінювати списки.', 'De AI kan keuzelijsten niet wijzigen.'] },
  { type: 'browser.key', group: 'interact', auto: false, uk: 'Клавіші навігації', nl: 'Navigatietoetsen',
    on: ['ШІ може натиснути Enter, Esc, Tab, стрілки, PageUp/PageDown, Home, End (без літер і поєднань). Кожне натискання чекає вашого «Дозволити».', 'De AI kan Enter, Esc, Tab, pijlen, PageUp/PageDown, Home en End indrukken (geen letters of combinaties). Elke keer wacht op uw "Toestaan".'],
    off: ['ШІ не може натискати клавіші.', 'De AI kan geen toetsen indrukken.'] },
  { type: 'browser.invoke', group: 'interact', auto: false, uk: 'Дії сайту', nl: 'Siteacties',
    on: ['ШІ може запускати дії, які пропонує сам сайт (наприклад, відкрити сервіс). Кожна дія чекає вашого «Дозволити».', 'De AI kan acties uitvoeren die de site zelf aanbiedt (bijvoorbeeld een dienst openen). Elke actie wacht op uw "Toestaan".'],
    off: ['ШІ не може запускати дії сайту.', 'De AI kan geen siteacties uitvoeren.'] },
  { type: 'browser.screenshot', group: 'advanced', auto: false, uk: 'Знімок екрана', nl: 'Schermafbeelding',
    on: ['ШІ може зробити знімок видимої частини вкладки (там може бути приватна інформація). Кожен знімок чекає вашого «Дозволити».', 'De AI kan een schermafbeelding van het zichtbare deel van het tabblad maken (er kan privé-informatie op staan). Elke keer wacht op uw "Toestaan".'],
    off: ['ШІ не може робити знімки екрана.', 'De AI kan geen schermafbeeldingen maken.'] },
  { type: 'browser.deep_diagnostics', group: 'advanced', auto: false, uk: 'Глибока діагностика', nl: 'Diepe diagnose',
    on: ['ШІ може кілька секунд спостерігати вкладку Mijn Ruimte: помилки консолі, винятки, невдалі й повільні запити (лише адреса без параметрів, статус і час; ніколи вміст чи заголовки). Працює в обох виданнях розширення: у звичайному через збирач усередині сторінки, у виданні «з режимом налагодження» — глибше, через налагоджувач Chrome (тоді Chrome на кілька секунд показує жовту смугу «розпочав налагодження»: це нормально). Кожен раз чекає вашого «Дозволити».', 'De AI kan het Mijn Ruimte-tabblad enkele seconden observeren: consolefouten, uitzonderingen, mislukte en trage verzoeken (alleen adres zonder parameters, status en tijd; nooit inhoud of headers). Werkt in beide uitgaven van de extensie: in de gewone via een verzamelaar in de pagina, in de uitgave "met foutopsporingsmodus" dieper via de debugger van Chrome (dan toont Chrome enkele seconden een gele balk "begonnen met foutopsporing": dat is normaal). Elke keer wacht op uw "Toestaan".'],
    off: ['Глибока діагностика недоступна.', 'Diepe diagnose is niet beschikbaar.'] },
];

export const DEFAULT_ENABLED = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait'];
export const AUTO_HELP: [string, string] = [
  'Увімкнено: ШІ виконує це одразу, без вашого «Дозволити». Вимкнено: кожна така дія чекає вашого «Дозволити» на сайті.',
  'Aan: de AI doet dit direct, zonder uw "Toestaan". Uit: elke keer wacht het op uw "Toestaan" op de site.',
];
