// @ts-nocheck
// Двигун вигляду «Макет» центру облікового запису (IDENTITEIT-007).
// Це код макета власника (ChatGPT, 2026-11-06: locales.js, фото-профілю.js, піктограми.js, реєстр.js, drawer.js, app.js), зібраний
// в один модуль і прив'язаний до кореня компонента замість document/body, щоб поведінка збігалася з макетом один в один.
// Відмінності від макета позначено коментарями «САЙТ:». Тип-перевірку вимкнено свідомо: код лишається максимально близьким до джерела.
// De motor van de weergave «Ontwerp»: de eigen scripts van het ontwerp van de eigenaar, gebundeld en aan de component-wortel gebonden.

export type MaquetteOpties = {
  lang: 'uk' | 'nl';
  licht: boolean;
  profiel: { bevestigd: boolean; naam: string; foto: string } | null;
  /** Перехід до розділу користувачем (адресу змінює застосунок). */
  bijKies: (id: string) => void;
  /** Розділ або блок «Чинні налаштування» розгорнуто: сайт монтує справжню панель у гніздо. */
  bijOpenen: (id: string) => void;
  /** Картки перемальовано (мова, повторне малювання): гнізда .mq-echt створено заново. */
  bijRender: () => void;
  /** Кнопка смуги сервісів: перехід до справжнього сервісу сайту (hub, ai, mail, cloud, github). */
  bijDienst: (id: string) => void;
  /** Діалог світлини: відкрити меню облікового запису сайту (інші акаунти, вихід). */
  bijAccountMenu: () => void;
  /** IDENTITEIT-015: справжні налаштування сайту для елементів макета (обліковий запис). Echte instellingen van de site. */
  weergave?: MaquetteWeergave;
  /** Зміна в макеті → справжнє налаштування сайту (зберігається в обліковому записі). Wijziging → echte instelling. */
  bijWeergave?: (patch: Partial<MaquetteWeergave>) => void;
  /** Мовні кнопки картки «Мови» → справжня зміна мови сайту (cookie + обліковий запис). Taalknoppen → echte taal van de site. */
  bijTaal?: (lang: 'uk' | 'nl') => void;
};
export type MaquetteWeergave = {
  dichtheid: 'compact' | 'normaal' | 'ruim'; beweging: 'systeem' | 'minder'; accent?: 'violet' | 'cyan' | 'pink' | 'amber'; effecten: number;
  icoonStijl: 'klassiek' | 'kleur'; positie: 'links' | 'rechts' | 'boven' | 'onder'; modus: 'auto' | 'open' | 'dicht';
};
export type Maquette = { stop: () => void; direct: string[]; zetWeergave: (w: MaquetteWeergave) => void; ga: (id: string, open?: boolean) => void; zetLicht: (licht: boolean) => void; zetProfiel: (p: MaquetteOpties['profiel']) => void };

export function startMaquette(root: HTMLElement, opties: MaquetteOpties): Maquette {
  const doc = root.ownerDocument;
  const byId = (id) => root.querySelector('#' + CSS.escape(id));
  // САЙТ: сторінка прокручується в робочій області оболонки, не у вікні.
  const werkvlak = root.closest('.canonical-workspace');
  const scrolDoel = werkvlak || window;
  const scroller = () => werkvlak
    ? { top: werkvlak.scrollTop, hoogte: werkvlak.scrollHeight, venster: werkvlak.clientHeight }
    : { top: window.scrollY, hoogte: doc.documentElement.scrollHeight, venster: window.innerHeight };
  const breed = () => root.clientWidth || window.innerWidth;
  const luisteraars = [];
  const luister = (doel, soort, fn, opt) => { doel.addEventListener(soort, fn, opt); luisteraars.push(() => doel.removeEventListener(soort, fn, opt)); };

  // ───────── locales.js ─────────
  // Only authored strings. No external translation service or live account data.
  const locales = {
    uk:{
      ui:{
        workspace:"Мій простір",settings:"Налаштування",concept:"Дизайн-концепт",quickJump:"Швидкий перехід",
        heroEyebrow:"ВАШ ЦИФРОВИЙ ПРОСТІР",heroTitle:["Ваш простір.","Ваші правила."],
        heroDesc:"Один витончений центр керування всім, що робить «Мій простір» по-справжньому вашим.",
        startSetup:"Налаштувати простір",navPlacement:"Розташування навігації",sectionCount:"розділів",
        controlCenter:"Єдиний центр керування",profiles:"Окремі режими та простори",
        groups:["ОБЛИЧЧЯ ВАШОГО ПРОСТОРУ","ЛЮДИ ТА ІДЕНТИЧНІСТЬ","ВАШ АКАУНТ","БЕЗПЕКА ТА ВІДНОВЛЕННЯ"],
        interludes:[["Дизайн стає по-справжньому вашим, коли кожен елемент","має своє місце."],["Справжній контроль — це коли складне","відчувається простим."]],
        footer:"Дизайн-концепт 2026",backTop:"Повернутися вгору ↑",navigation:"НАВІГАЦІЯ",dragToEdge:"Перетягніть до краю",
        scrollProgress:"Прогрес сторінки",collapse:"Згорнути панель",expand:"Розгорнути панель",
        anchorPlacement:"ПОЛОЖЕННЯ ЯКОРІВ",positionPrompt:"Розташуйте як зручно",
        positions:{left:"Ліворуч",right:"Праворуч",top:"Зверху",bottom:"Знизу"},
        compact:"Компактний режим",navStyle:"Стиль меню",navClassic:"Звичайна панель",navPills:"Окремі кнопки",navIconLabel:"Вміст кнопок",navNames:"Піктограми з назвами",navIcons:"Лише піктограми",navStyleHint:"Кнопки за розміром тексту, без спільного фону",dragHelp:"Можна також перетягнути заголовок панелі до потрібного краю екрана.",adaptiveNavHelp:"На вузькому екрані меню висувається збоку, не займаючи місця в робочій області.",adaptiveNavModeOnly:"Автоматично: наведіть мишку на край екрана або відкрийте меню натисканням чи свайпом. Постійні режими доступні лише на широкому екрані.",
        navGroups:["Вигляд і меню","Доступ і ролі","Акаунт","Захист"],navModes:{expanded:"Завжди розгорнуте",collapsed:"Завжди згорнуте",auto:"Автоматично при наведенні"},navModeLabel:"Поведінка меню",
        findSection:"Знайти розділ налаштувань…",commandHeading:"РОЗДІЛИ ЦЕНТРУ КЕРУВАННЯ",
        choose:"↑ ↓ обрати",go:"↵ перейти",noResults:"Нічого не знайдено. Спробуйте іншу назву.",
        beginning:"Початок",manage:"КЕРУВАННЯ",openSettings:"Відкрити налаштування",
        collapseSection:"Згорнути налаштування",inlineEyebrow:"НАЛАШТУВАННЯ РОЗДІЛУ",inlineHeading:"Керуйте прямо на сторінці",
        profileName:"Відображуване ім’я",demoOnly:"Лише демонстраційне поле — дані акаунта не змінюються",prepareCopy:"Підготувати приклад",
        dockInline:"Положення якорів",dockInlineHint:"Налаштування цієї демонстраційної панелі",
        themeInline:"Атмосфера прототипу",themeInlineHint:"Відразу побачите різницю",
        accentInline:"Акцентний колір",accentInlineHint:"Лише для цього макета",
        dark:"Темна",light:"Світла",colors:{violet:"Фіолетовий",cyan:"Бірюзовий",pink:"Рожевий",amber:"Бурштиновий"},
        langInline:"Мова інтерфейсу",langInlineHint:"Написи на всіх ілюстраціях також перекладаються.",
        moved:"Панель якорів переміщено:",demoToast:"Це демонстрація дизайну. Реальні параметри акаунта не змінено.",
        navDemoToast:"Це візуальний макет. Переходи до реальних сервісів тут не підключені.",
        drawerControls:"Налаштування",drawerPreview:"Вигляд у роботі",drawerDemo:"ДЕМО · Без змін акаунта",drawerDone:"Готово",
        drawerHint:"Спробуйте елементи керування: цей прототип не зберігає змін на справжньому сайті.",
        drawerVisualTitle:"Ось як виглядає відкритий розділ",drawerVisualNote:"Простора панель, зрозумілі групи й миттєвий відгук на дії.",
        previewSample:"Попередній перегляд",previewEnabled:"Увімкнено",previewOptions:"Ваші параметри",
        savedLocally:"Показано лише в макеті",actionDemo:"Дія показана в демонстраційному режимі.",rangeValue:"Інтенсивність",
        tooltipHint:"Натисніть, щоб відкрити розділ"
      },
      art:{
        makeYours:"Ваш стиль.",personalSpace:"ОСОБИСТИЙ ПРОСТІР",nav:"МЕНЮ",anyEdge:"БУДЬ-ЯКЕ РОЗТАШУВАННЯ",
        beautifully:"Тонка<br>гармонія.",hello1:"Вітаю",hello2:"Привіт",commonSpace:"ЄДИНИЙ ПРОСТІР",greeting:"Привіт,<br>Павле.",
        widgets:"ВІДЖЕТИ",create:"ДОДАТИ",widgetCalendar:"КАЛЕНДАР",widgetMail:"ПОШТА",widgetNotes:"НОТАТКИ",
        sharing:"ВАШ ПРОСТІР · ВАШІ ПРАВИЛА",sharingOnly:"ЛИШЕ ОБРАНІ",sharingSecure:"ДОСТУП ПІД КОНТРОЛЕМ",
        sharingTitle:"ПРИКЛАД ПРАВ ДОСТУПУ",sharingOwner:"ВЛАСНИК",sharingInvite:"ЗАПРОШЕНА ОСОБА",sharingView:"ПЕРЕГЛЯД",sharingLink:"ПРИВАТНЕ ПОСИЛАННЯ",sharingOff:"ВИМКНЕНО",
        tech:"ТЕХНІЧНИЙ ПРОФІЛЬ",control:"КЕРУВАННЯ",personal:"ОСОБИСТИЙ ПРОСТІР",daily:"ЩОДЕННИЙ ПРОСТІР",
        yourData:"ВАШІ ДАНІ",inHands:"ПІД ВАШИМ КОНТРОЛЕМ",private:"КОНФІДЕНЦІЙНО ЗА ЗАДУМОМ",
        devices:"ПІДКЛЮЧЕНІ ПРИСТРОЇ",passkey:"КЛЮЧ ДОСТУПУ",verified:"ЛИШЕ ІЛЮСТРАЦІЯ",
        methodsPrimary:"ОСНОВНИЙ ВХІД",methodsConfirm:"ПІДТВЕРДЖЕННЯ ДІЙ",methodsNote:"ДВА РІЗНІ ПРИЗНАЧЕННЯ",
        securityCheck:"ПІДТВЕРДЖЕННЯ",securityEncrypt:"ШИФРУВАННЯ",
        recovery:"ВІДНОВЛЕННЯ",keepAccess:"ЗБЕРЕЖІТЬ ДОСТУП",backupCodes:"РЕЗЕРВНІ КОДИ"
      },
      panels:{
        personalization:[
          {type:"choice",label:"Стиль іконок",note:"Виберіть характер піктограм розділів",options:["Класичний","Кольоровий"]},
          {type:"choice",label:"Щільність інтерфейсу",note:"Більше простору або більше інформації",options:["Звичайна","Компактна","Простора"]},
          {type:"toggle",label:"Плавна поява блоків",note:"Делікатна анімація під час прокручування",initial:true}
        ],
        menu:[
          {type:"toggle",label:"Підсвічувати активний розділ",note:"Автоматична орієнтація під час прокручування",initial:true},
          {type:"toggle",label:"Підказки при наведенні",note:"Контрастні підказки в акцентній гамі",initial:true}
        ],
        themes:[
          {type:"theme",label:"Кольорова атмосфера",note:"Перемикайте світлий і темний вигляд"},
          {type:"accent",label:"Акцентна палітра",note:"Колір виділення, підказок і перемикачів"},
          {type:"range",label:"Виразність ефектів",note:"Налаштуйте інтенсивність декоративного сяйва",value:45}
        ],
        languages:[
          {type:"language",label:"Мова всього інтерфейсу",note:"Зміни стосуються меню, карток та ілюстрацій"}
        ],
        widgets:[
          {type:"toggle",label:"Показувати віджети",note:"Розміщуйте корисні блоки у просторі",initial:true},
          {type:"choice",label:"Розмір карток",note:"Адаптивне компонування",options:["Звичайні","Великі"]},
          {type:"action",label:"Додати новий віджет",note:"Відкрити приклад каталогу блоків"}
        ],
        sharing:[
          {type:"choice",label:"Видимість простору",note:"Хто має право його переглядати",options:["Лише я","За запрошенням"]},
          {type:"toggle",label:"Доступ за посиланням",note:"Тимчасова гостьова сесія з обмеженнями",initial:false},
          {type:"action",label:"Переглянути запрошення",note:"Приклад панелі керування доступом"}
        ],
        identities:[
          {type:"choice",label:"Активний профіль",note:"Окрема атмосфера для кожної ролі",options:["Звичайний","Технічний"]},
          {type:"toggle",label:"Показувати позначку режиму",note:"Завжди бачити, де ви зараз",initial:true}
        ],
        account:[
          {type:"profile",label:"Профіль",note:"Вкажіть демонстраційне ім’я — справжній профіль не зміниться"},
          {type:"export",label:"Дані й експорт",note:"Оберіть формат прикладу архіву без справжнього завантаження"},
          {type:"warning",label:"Небезпечні дії",note:"Видалення акаунта — лише в окремій зоні з підтвердженням. У прототипі недоступно."}
        ],
        sessions:[
          {type:"info",label:"Поточний пристрій",note:"Приклад картки: ноутбук · Chrome · Windows"},
          {type:"toggle",label:"Сповіщення про новий вхід",note:"Показувати сповіщення про нові пристрої",initial:true},
          {type:"action",label:"Історія сесій",note:"Демонстрація списку входів"}
        ],
        methods:[
          {type:"info",label:"Вхід через Google",note:"Основний спосіб входу в поточній концепції."},
          {type:"action",label:"Додати ключ доступу",note:"Приклад сценарію passkey без створення ключа"},
          {type:"toggle",label:"Пояснення перед підтвердженням",note:"Показувати, для чого потрібна перевірка",initial:true}
        ],
        security:[
          {type:"toggle",label:"Підказки щодо двофакторного захисту",note:"Контекстні пояснення важливих дій",initial:true},
          {type:"info",label:"Шифрування даних",note:"Статус захисту має містити чітке пояснення, а не лише іконку."},
          {type:"action",label:"Переглянути гостьові дозволи",note:"Макет списку обмежених доступів"}
        ],
        recovery:[
          {type:"info",label:"Коди відновлення",note:"Секретні значення ніколи не показуються в демонстрації."},
          {type:"info",label:"Нагадування про резервний доступ",note:"Справжній перемикач — у Меню → «Сповіщення в меню». Типово ввімкнено: коли залишиться 2 коди відновлення або менше, прийде одне сповіщення."},
          {type:"warning",label:"Важливе застереження",note:"Втрата коду відновлення сховища й усіх passkey означає втрату зашифрованих даних: ніхто не зможе їх відновити."}
        ]
      }
    },
    nl:{
      ui:{
        workspace:"Mijn Ruimte",settings:"Instellingen",concept:"Ontwerpconcept",quickJump:"Snel navigeren",
        heroEyebrow:"JOUW DIGITALE RUIMTE",heroTitle:["Jouw ruimte.","Jouw regels."],
        heroDesc:"Eén stijlvolle plek om alles te beheren wat Mijn Ruimte echt van jou maakt.",
        startSetup:"Ruimte aanpassen",navPlacement:"Navigatiepositie",sectionCount:"onderdelen",
        controlCenter:"Eén centrale plek",profiles:"Aparte profielen en ruimtes",
        groups:["DE SFEER VAN JOUW RUIMTE","MENSEN EN IDENTITEIT","JOUW ACCOUNT","BEVEILIGING EN HERSTEL"],
        interludes:[["Een ontwerp wordt persoonlijk wanneer elk element","zijn eigen plek krijgt."],["Echte controle voelt natuurlijk aan, ook als","de techniek complex is."]],
        footer:"Ontwerpconcept 2026",backTop:"Terug naar boven ↑",navigation:"NAVIGATIE",dragToEdge:"Sleep naar een rand",
        scrollProgress:"Pagina-voortgang",collapse:"Paneel inklappen",expand:"Paneel uitklappen",
        anchorPlacement:"POSITIE VAN ANKERS",positionPrompt:"Zet het waar jij wilt",
        positions:{left:"Links",right:"Rechts",top:"Boven",bottom:"Onder"},
        compact:"Compacte weergave",navStyle:"Menustijl",navClassic:"Gewoon paneel",navPills:"Losse knoppen",navIconLabel:"Knopinhoud",navNames:"Pictogrammen met tekst",navIcons:"Alleen pictogrammen",navStyleHint:"Knoppen op tekstbreedte, zonder gedeelde achtergrond",dragHelp:"Je kunt de titel van het paneel ook naar een schermrand slepen.",adaptiveNavHelp:"Op smalle schermen schuift het menu opzij zonder werkruimte in te nemen.",adaptiveNavModeOnly:"Automatisch: wijs de schermrand aan of open het menu met een tik of veeg. Vaste modi zijn alleen beschikbaar op brede schermen.",
        navGroups:["Uiterlijk en menu","Toegang en rollen","Account","Bescherming"],navModes:{expanded:"Altijd uitgeklapt",collapsed:"Altijd ingeklapt",auto:"Automatisch bij aanwijzen"},navModeLabel:"Menugedrag",
        findSection:"Zoek een onderdeel…",commandHeading:"ONDERDELEN VAN INSTELLINGEN",
        choose:"↑ ↓ kiezen",go:"↵ openen",noResults:"Niets gevonden. Probeer een andere term.",
        beginning:"Begin",manage:"BEHEREN",openSettings:"Instellingen openen",
        collapseSection:"Instellingen inklappen",inlineEyebrow:"ONDERDEELINSTELLINGEN",inlineHeading:"Beheer direct op de pagina",
        profileName:"Weergavenaam",demoOnly:"Alleen een demoveld — geen wijziging van accountgegevens",prepareCopy:"Voorbeeld voorbereiden",
        dockInline:"Positie van ankers",dockInlineHint:"Pas dit demonstratiepaneel aan",
        themeInline:"Sfeer van het prototype",themeInlineHint:"Bekijk direct het verschil",
        accentInline:"Accentkleur",accentInlineHint:"Alleen voor dit ontwerp",
        dark:"Donker",light:"Licht",colors:{violet:"Paars",cyan:"Turkoois",pink:"Roze",amber:"Amber"},
        langInline:"Taal van de interface",langInlineHint:"Ook de teksten in illustraties worden vertaald.",
        moved:"Ankernavigatie verplaatst naar:",demoToast:"Dit is een ontwerpdemonstratie. Je echte accountinstellingen zijn niet gewijzigd.",
        navDemoToast:"Dit is een visueel prototype. Echte diensten zijn hier niet verbonden.",
        drawerControls:"Instellingen",drawerPreview:"Live voorbeeld",drawerDemo:"DEMO · Account ongewijzigd",drawerDone:"Gereed",
        drawerHint:"Probeer de bediening uit. Dit prototype wijzigt niets op de echte website.",
        drawerVisualTitle:"Zo ziet een geopend onderdeel eruit",drawerVisualNote:"Een ruim paneel met heldere groepen en directe visuele feedback.",
        previewSample:"Voorbeeld",previewEnabled:"Ingeschakeld",previewOptions:"Jouw voorkeuren",
        savedLocally:"Alleen zichtbaar in het prototype",actionDemo:"Actie getoond in demomodus.",rangeValue:"Intensiteit",
        tooltipHint:"Klik om dit onderdeel te openen"
      },
      art:{
        makeYours:"Helemaal jij.",personalSpace:"PERSOONLIJKE RUIMTE",nav:"MENU",anyEdge:"OP ELKE SCHERMRAND",
        beautifully:"Mooi in<br>balans.",hello1:"Welkom",hello2:"Hallo",commonSpace:"ÉÉN RUIMTE",greeting:"Hallo,<br>Pavlo.",
        widgets:"WIDGETS",create:"TOEVOEGEN",widgetCalendar:"AGENDA",widgetMail:"MAIL",widgetNotes:"NOTITIES",
        sharing:"JOUW RUIMTE · JOUW REGELS",sharingOnly:"ALLEEN GENODIGDEN",sharingSecure:"TOEGANG ONDER CONTROLE",
        sharingTitle:"VOORBEELD VAN RECHTEN",sharingOwner:"EIGENAAR",sharingInvite:"GENODIGDE",sharingView:"BEKIJKEN",sharingLink:"PRIVÉKOPPELING",sharingOff:"UITGESCHAKELD",
        tech:"TECHNISCH PROFIEL",control:"BEHEER",personal:"PERSOONLIJKE RUIMTE",daily:"JOUW DAGELIJKSE RUIMTE",
        yourData:"JOUW GEGEVENS",inHands:"IN EIGEN HANDEN",private:"PRIVACY ALS UITGANGSPUNT",
        devices:"VERBONDEN APPARATEN",passkey:"TOEGANGSSLEUTEL",verified:"ALLEEN ILLUSTRATIE",
        methodsPrimary:"BELANGRIJKSTE AANMELDING",methodsConfirm:"ACTIES BEVESTIGEN",methodsNote:"TWEE VERSCHILLENDE DOELEN",
        securityCheck:"BEVESTIGEN",securityEncrypt:"VERSLEUTELING",
        recovery:"HERSTEL",keepAccess:"BEWAAR JE TOEGANG",backupCodes:"HERSTELCODES"
      },
      sections:{
        personalization:{name:"Personalisatie",short:"Persoonlijk",kicker:"JOUW STIJL",title:"Een ruimte die helemaal van jou voelt.",description:"Het uiterlijk, het gedrag en jouw voorkeuren op één rustige en stijlvolle plek.",details:[["Menu en pictogrammen","Volgorde, kleuren en navigatiestijl"],["Thema's en sfeer","Licht, contrast en jouw kleuren"],["Widgets en blokken","Een rustige persoonlijke werkplek"]]},
        menu:{name:"Menu",short:"Menu",kicker:"ALLE VRIJHEID",title:"Navigatie die met je meebeweegt.",description:"Menupositie, snelle toegang, iconen en subtiele animaties. Precies instelbaar, toch eenvoudig.",details:[["Positie","Links · rechts · boven · onder"],["Snelle toegang","Je favoriete acties binnen handbereik"],["Paneelweergave","Uitgevouwen, compact of als dock"]]},
        themes:{name:"Thema's",short:"Thema's",kicker:"SPEL VAN LICHT",title:"Sfeer in iedere pixel.",description:"Kies de diepte van een donker thema of de luchtigheid van een lichte omgeving.",details:[["Donker","Rust en een filmisch contrast"],["Licht","Ruimte, zachte schaduwen en helderheid"],["Accent","Jouw kleur voor actieve elementen"]]},
        languages:{name:"Talen",short:"Talen",kicker:"JOUW TAAL",title:"Meteen duidelijk.",description:"De taal van je interface hoort bij je comfort. Wissel eenvoudig tussen Oekraïens en Nederlands.",details:[["Українська","Oekraïense interface"],["Nederlands","Voor je dagelijkse leven in België"]]},
        widgets:{name:"Widgets",short:"Widgets",kicker:"MAAK HET EIGEN",title:"Kleine details. Groot verschil.",description:"Stel je werkplek samen met de blokken die vandaag voor jou belangrijk zijn.",details:[["Blokken toevoegen","Diensten, hulpmiddelen en externe links"],["Indeling","Handige afmetingen en volgorde"]]},
        sharing:{name:"Delen",short:"Delen",kicker:"JOUW GRENZEN",title:"Deel alleen wat jij wilt.",description:"Heldere toegangsrechten en uitnodigingen. Je ziet precies wie wat mag bekijken.",details:[["Toegang per account","Uitnodigingen en rollen"],["Toegang via link","Aparte opties en beperkingen"]]},
        identities:{name:"Identiteiten",short:"Identiteit",kicker:"TWEE MODI",title:"Elke rol op de juiste plek.",description:"Privé- en technisch profiel blijven duidelijk gescheiden, zowel visueel als functioneel.",details:[["Normaal profiel","Dagelijkse tools en persoonlijke ruimte"],["Technisch profiel","Een eigen stijl voor beheer"]]},
        account:{name:"Account en gegevens",short:"Account",kicker:"JOUW GEGEVENS",title:"Alles wat belangrijk is, onder controle.",description:"Profiel, gegevens en gevoelige acties zijn logisch gegroepeerd.",details:[["Profiel","Basisgegevens van je account"],["Gegevens en export","Je gegevens bekijken en beheren"],["Gevoelige acties","Een aparte zone met bevestiging"]]},
        sessions:{name:"Sessies en apparaten",short:"Apparaten",kicker:"JOUW VERBINDINGEN",title:"Elk apparaat in beeld.",description:"Actieve sessies, geschiedenis en gekoppelde apparaten meteen duidelijk.",details:[["Apparaten","Type, browser en recente activiteit"],["Sessies","Inlogmomenten bekijken en beheren"]]},
        methods:{name:"Inlogmethoden",short:"Inloggen",kicker:"ZONDER GEDOE",title:"Veilig inloggen, zonder frictie.",description:"Google, passkeys en bevestiging van belangrijke acties overzichtelijk samen.",details:[["Google","Primaire inlogmethode"],["Passkeys","Bevestiging van beveiligde acties"]]},
        security:{name:"Beveiliging",short:"Beveiliging",kicker:"RUST EN ZEKERHEID",title:"Beveiliging die je begrijpt.",description:"Tweestapsverificatie, versleuteling en rechten helder uitgelegd.",details:[["Inlogbevestiging","TOTP en toegangssleutels"],["Versleuteling","Sleutels en gegevensbescherming"],["Gasttoegang","Beperkte rechten en geschiedenis"]]},
        recovery:{name:"Toegang herstellen",short:"Herstel",kicker:"PLAN B",title:"Rust, ook als het tegenzit.",description:"Een duidelijk herstelproces met uitleg, risico's en vervolgstappen.",details:[["Herstelcodes","Een reserveoptie voor bevestiging"],["Aanbevelingen","Voorkom verlies van toegang"]]}
      },
      panels:{
        personalization:[
          {type:"choice",label:"Pictogramstijl",note:"Kies hoe onderdelen eruitzien",options:["Klassiek","Kleurrijk"]},
          {type:"choice",label:"Informatiedichtheid",note:"Meer ruimte of meer informatie",options:["Normaal","Compact","Ruim"]},
          {type:"toggle",label:"Zachte animatie van blokken",note:"Subtiele beweging tijdens het scrollen",initial:true}
        ],
        menu:[
          {type:"toggle",label:"Actief onderdeel markeren",note:"Automatisch tijdens het scrollen",initial:true},
          {type:"toggle",label:"Tooltips bij aanwijzen",note:"Contrasterende labels in de accentkleur",initial:true}
        ],
        themes:[
          {type:"theme",label:"Kleursfeer",note:"Wissel tussen licht en donker"},
          {type:"accent",label:"Accentpalet",note:"Kleur van selectie, hints en schakelaars"},
          {type:"range",label:"Sterkte van effecten",note:"Pas de gloed van illustraties aan",value:45}
        ],
        languages:[
          {type:"language",label:"Taal van de hele interface",note:"Ook de menu's, kaarten en illustraties veranderen"}
        ],
        widgets:[
          {type:"toggle",label:"Widgets tonen",note:"Nuttige blokken op je werkplek",initial:true},
          {type:"choice",label:"Kaartgrootte",note:"Responsieve indeling",options:["Normaal","Groot"]},
          {type:"action",label:"Widget toevoegen",note:"Voorbeeld van de blokkencatalogus"}
        ],
        sharing:[
          {type:"choice",label:"Zichtbaarheid",note:"Wie je ruimte kan bekijken",options:["Alleen ik","Op uitnodiging"]},
          {type:"toggle",label:"Toegang via een link",note:"Tijdelijke gastsessie met beperkingen",initial:false},
          {type:"action",label:"Uitnodigingen bekijken",note:"Voorbeeld van toegangsbeheer"}
        ],
        identities:[
          {type:"choice",label:"Actief profiel",note:"Een eigen sfeer voor elke rol",options:["Normaal","Technisch"]},
          {type:"toggle",label:"Profielindicator tonen",note:"Altijd weten in welke modus je werkt",initial:true}
        ],
        account:[
          {type:"profile",label:"Profiel",note:"Vul een demonaam in — je echte profiel blijft ongewijzigd"},
          {type:"export",label:"Gegevens en export",note:"Kies een voorbeeldformaat, zonder echte gegevens te downloaden"},
          {type:"warning",label:"Gevoelige acties",note:"Accountverwijdering vereist altijd bevestiging en is hier niet beschikbaar."}
        ],
        sessions:[
          {type:"info",label:"Huidig apparaat",note:"Voorbeeldkaart: laptop · Chrome · Windows"},
          {type:"toggle",label:"Melding bij nieuwe login",note:"Laat nieuwe apparaten opvallen",initial:true},
          {type:"action",label:"Sessiegeschiedenis",note:"Voorbeeld van recente logins"}
        ],
        methods:[
          {type:"info",label:"Inloggen met Google",note:"Primaire inlogmethode in dit concept."},
          {type:"action",label:"Passkey toevoegen",note:"Voorbeeld zonder een echte sleutel aan te maken"},
          {type:"toggle",label:"Uitleg vóór bevestiging",note:"Toon waarvoor je toestemming geeft",initial:true}
        ],
        security:[
          {type:"toggle",label:"Hints voor tweestapsbeveiliging",note:"Uitleg bij belangrijke handelingen",initial:true},
          {type:"info",label:"Gegevensversleuteling",note:"De beveiligingsstatus moet begrijpelijk zijn, niet alleen een icoon."},
          {type:"action",label:"Gastrechten bekijken",note:"Voorbeeld van beperkte toegang"}
        ],
        recovery:[
          {type:"info",label:"Herstelcodes",note:"Geheime waarden worden nooit in deze demo getoond."},
          {type:"info",label:"Herinnering aan reservetoegang",note:"De echte schakelaar staat bij Menu → «Meldingen in het menu». Standaard aan: bij 2 of minder resterende herstelcodes komt er één melding."},
          {type:"warning",label:"Belangrijk",note:"Verlies van de herstelcode van de kluis én alle passkeys betekent verlies van de versleutelde gegevens: niemand kan ze terughalen."}
        ]
      }
    }
  };


  // ───────── фото-профілю.js ─────────
  // Єдине джерело світлини для всіх зображень власника в макеті.
  // На справжньому сайті цей об'єкт заповнює лише авторизований застосунок із user.picture.
  // Окремий макет не звертається до облікового запису й не завантажує вибраних файлів на сервер.
  const даніВласника=opties.profiel;
  const дозволенаСвітлина=(значення)=>{
    if(typeof значення!=="string"||!значення.trim())return "";
    const чисте=значення.trim();
    // У чинному застосунку власне фото може бути збережене як зображення всередині даних акаунта.
    if(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(чисте)&&чисте.length<=340000)return чисте;
    if(чисте.length>1024)return "";
    try{
      const адреса=new URL(чисте);
      if(адреса.protocol!=="https:"||адреса.username||адреса.password)return "";
      адреса.hash="";
      return адреса.href;
    }catch{return "";}
  };
  const початковаАдреса=даніВласника?.bevestigd===true?дозволенаСвітлина(даніВласника.foto):"";
  const світлинаПрофілю={
    імʼя:даніВласника?.bevestigd===true&&typeof даніВласника.naam==="string"?даніВласника.naam.trim():"",
    адреса:початковаАдреса,
    джерело:даніВласника?.bevestigd===true?(початковаАдреса?"акаунт":"безФото"):"немає",
    місцеваАдреса:""
  };

  // Під час переходу між обліковими записами застосунок має передавати новий стан.
  // Джерело оновлення — лише власний код авторизованої сторінки, не повідомлення з інших сайтів.
  function прийнятиФотоПрофілю(новийПрофіль){
    if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);
    світлинаПрофілю.місцеваАдреса="";
    світлинаПрофілю.імʼя=новийПрофіль?.bevestigd===true&&typeof новийПрофіль.naam==="string"?новийПрофіль.naam.trim():"";
    const новаАдреса=новийПрофіль?.bevestigd===true?дозволенаСвітлина(новийПрофіль.foto):"";
    світлинаПрофілю.адреса=новаАдреса;
    світлинаПрофілю.джерело=новийПрофіль?.bevestigd===true?(новаАдреса?"акаунт":"безФото"):"немає";
    оновитиФотоПрофілю();
  }
  luister(window,"mijn-ruimte:profiel-bijgewerkt",подія=>прийнятиФотоПрофілю(подія.detail));

  const позначкаВідсутньогоФото='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8.1" r="3.3"/><path d="M5.6 20a6.4 6.4 0 0 1 12.8 0"/></svg>';
  const моваПрофілю=()=>typeof preferences!=="undefined"?preferences.lang:document.documentElement.lang;
  const перекладПрофілю=(ук,нл)=>моваПрофілю()==="nl"?нл:ук;
  function naamVoorProfiel(){return світлинаПрофілю.імʼя||перекладПрофілю("Ваш профіль","Jouw profiel");}
  function оновитиФотоПрофілю(){
    root.querySelectorAll("[data-profile-photo]").forEach(місце=>{
      місце.classList.toggle("profile-has-photo",Boolean(світлинаПрофілю.адреса));
      місце.classList.toggle("profile-photo-empty",!світлинаПрофілю.адреса);
      місце.replaceChildren();
      if(світлинаПрофілю.адреса){
        const зображення=document.createElement("img");
        зображення.src=світлинаПрофілю.адреса;
        зображення.alt="";
        зображення.referrerPolicy="no-referrer";
        зображення.decoding="async";
        зображення.addEventListener("error",()=>{
          if(світлинаПрофілю.адреса===зображення.src){
            світлинаПрофілю.адреса="";
            світлинаПрофілю.джерело="недоступне";
            оновитиФотоПрофілю();
          }
        },{once:true});
        місце.append(зображення);
      }else місце.innerHTML=позначкаВідсутньогоФото;
      if(!місце.hasAttribute("aria-hidden")&&місце.tagName!=="BUTTON")місце.setAttribute("aria-label",світлинаПрофілю.адреса?перекладПрофілю("Світлина власника","Foto van de eigenaar"):перекладПрофілю("Світлину не підключено","Geen foto verbonden"));
    });
    root.querySelectorAll("[data-profile-name]").forEach(місце=>місце.textContent=naamVoorProfiel());
    const рядок=byId("profilePhotoStatus"),пояснення=byId("profilePhotoExplanation");
    if(!рядок||!пояснення)return;
    const мова=моваПрофілю();
    const написи={
      акаунт:["Світлина отримана з облікового запису","Foto ontvangen uit het account","Зображення надане авторизованим застосунком. Змінити або прибрати світлину можна в розділі «Акаунт».","De aangemelde toepassing heeft de foto aangeleverd. U kunt de foto wijzigen of verwijderen bij «Account»."],
      безФото:["Світлину профілю ще не встановлено","Nog geen profielfoto ingesteld","Обліковий запис підключено, але власну чи сервісну світлину не передано. Додати її можна в розділі «Акаунт».","Het account is verbonden, maar er is nog geen profielfoto ingesteld. U kunt er een kiezen bij «Account»."],
      попередній:["Місцева світлина лише для перегляду","Lokale foto alleen als voorbeeld","Файл залишається у вашому браузері. Він не надсилається на сервер і не змінює фото облікового запису. Після оновлення сторінки місцевий перегляд зникне.","Het bestand blijft in je browser. Het wordt niet verstuurd en wijzigt je accountfoto niet. Na het vernieuwen verdwijnt dit voorbeeld."],
      немає:["Дані облікового запису ще не підключено","Accountgegevens zijn nog niet verbonden","Коли нове оформлення працюватиме всередині Mijn Ruimte, воно отримає справжню світлину з облікового запису. Зараз можна тимчасово обрати власний файл.","Binnen Mijn Ruimte krijgt dit ontwerp de echte accountfoto. Nu kun je tijdelijk een eigen bestand kiezen."],
      недоступне:["Світлину облікового запису не вдалося відобразити","De accountfoto kon niet worden getoond","Джерело світлини не відкривається. Замість вигаданого зображення показано нейтральну позначку.","De fotobron is niet bereikbaar. In plaats van een verzonnen foto zie je een neutraal symbool."]
    };
    const текст=написи[світлинаПрофілю.джерело]||написи.немає;
    рядок.textContent=текст[мова==="nl"?1:0];
    пояснення.textContent=текст[мова==="nl"?3:2];
    byId("profilePhotoEyebrow").textContent=перекладПрофілю("ОБЛІКОВИЙ ЗАПИС","ACCOUNT");
    byId("profilePhotoTitle").textContent=перекладПрофілю("Справжня світлина профілю","Echte profielfoto");
    byId("profilePhotoPickLabel").textContent=перекладПрофілю("Змінити світлину — розділ «Акаунт»","Foto wijzigen — onderdeel «Account»"); // САЙТ
    byId("profilePhotoAccount").textContent=перекладПрофілю("Обліковий запис, інші акаунти, вихід","Account, andere accounts, afmelden");
    root.querySelector("[data-close-profile-photo]")?.setAttribute("aria-label",перекладПрофілю("Закрити","Sluiten"));
  }

  luister(doc,"click",подія=>{
    const діалог=byId("profilePhotoDialog");
    if(подія.target.closest("[data-open-profile-photo]")){
      оновитиФотоПрофілю();
      if(!діалог.open)діалог.showModal();
    }
    if(подія.target.closest("[data-close-profile-photo]")||подія.target===діалог)діалог.close();
    // САЙТ: дії діалогу світлини — справжній розділ «Акаунт» або меню облікового запису сайту.
    const actie=подія.target.closest("[data-echt-actie]")?.dataset.echtActie;
    if(actie){діалог.close();if(actie==="account-foto")gaNaar("account",true);else if(actie==="account-menu")opties.bijAccountMenu();}
  });
  byId("profilePhotoFile")?.addEventListener("change",подія=>{
    const файл=подія.target.files?.[0];
    if(!файл)return;
    const повідомлення=byId("profilePhotoWarning");
    if(!/^image\/(jpeg|png|webp)$/.test(файл.type)||файл.size>8*1024*1024){
      повідомлення.textContent=перекладПрофілю("Оберіть JPEG, PNG або WebP розміром до 8 МБ.","Kies JPEG, PNG of WebP tot 8 MB.");
      подія.target.value="";
      return;
    }
    if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);
    світлинаПрофілю.місцеваАдреса=URL.createObjectURL(файл);
    світлинаПрофілю.адреса=світлинаПрофілю.місцеваАдреса;
    світлинаПрофілю.джерело="попередній";
    повідомлення.textContent=перекладПрофілю("Відображено лише в макеті. Справжнє фото акаунта не змінено.","Alleen in het ontwerp getoond. De echte accountfoto blijft ongewijzigd.");
    оновитиФотоПрофілю();
    подія.target.value="";
  });
  luister(window,"pagehide",()=>{if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);});


  // ───────── піктограми.js ─────────
  // Єдиний набір змістовних позначень. Піктограму визначає дія, а не місце в переліку.
  const контуриПіктограм={
    меню:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1" fill="currentColor"/><circle cx="7" cy="12" r="1" fill="currentColor"/>',
    палітра:'<path d="M12 2a10 10 0 0 0 0 20h1a2 2 0 0 0 2-2c0-.9-.6-1.2-.6-2 0-1.2.8-2 2-2h2.3a3.3 3.3 0 0 0 3.3-3.3A10 10 0 0 0 12 2Z"/><circle cx="7" cy="10" r="1"/><circle cx="11" cy="6.5" r="1"/><circle cx="17" cy="9" r="1"/>',
    мова:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/>',
    блоки:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/>',
    користувачі:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    захист:'<path d="m12 2 8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    щільність:'<path d="M4 5h16M4 9h16M4 15h16M4 19h16"/>',
    рух:'<rect x="3" y="4" width="15" height="13" rx="2"/><path d="m14 13 3 3 4-4M7 21h8"/>',
    підсвітка:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    панель:'<rect x="2.5" y="3" width="19" height="18" rx="2.5"/><path d="M8.5 3v18M12 8h6M12 12h6"/>',
    наведення:'<path d="m5 3 13 10-6 1-2.5 6L5 3Z"/><path d="m14 17 3 4"/>',
    дотик:'<path d="M9 12V6a2 2 0 0 1 4 0v7-2a2 2 0 0 1 4 0v2a2 2 0 0 1 3 2v2c0 3-2 5-5 5h-4c-2.5 0-4-2-6-5a2 2 0 0 1 3-2l1 1"/>',
    додати:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    прибрати:'<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
    перемістити:'<path d="M12 2v20M2 12h20m-12-7 2-3 2 3M10 19l2 3 2-3M5 10l-3 2 3 2m14-4 3 2-3 2"/>',
    клавіатура:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1M10 9h1M14 9h1M18 9h1M6 12h1M10 12h1M14 12h1M18 12h1M7 16h10"/>',
    розташування:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 10h6"/>',
    прозорість:'<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M9 12h6M12 9v6"/>',
    збільшити:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 16 8-8M11 8h5v5"/>',
    повернути:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/><path d="M12 7v5l4 2"/>',
    сповіщення:'<path d="M6 8a6 6 0 0 1 12 0c0 6 3 8 3 9H3c0-1 3-3 3-9M10 21h4"/>',
    лічильник:'<circle cx="12" cy="12" r="9"/><path d="M8 9h2v6M13 9h3v6h-3"/>',
    підказка:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 0 1 5 1.5c0 2-2.5 2-2.5 4M12 18h.01"/>',
    нагадування:'<path d="M6 8a6 6 0 0 1 12 0c0 6 3 8 3 9H3c0-1 3-3 3-9M10 21h4"/><path d="M12 2V1"/>',
    час:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    місяць:'<path d="M20 16A8.5 8.5 0 0 1 8 4 8.5 8.5 0 1 0 20 16Z"/>',
    сонце:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
    завантаження:'<path d="M3 17v3h18v-3M12 3v14m-5-5 5 5 5-5"/>',
    переходи:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-9 4 4 3-4 3"/>',
    заздалегідь:'<path d="M4 6h16M4 12h12M4 18h8"/><path d="m18 16 3 2-3 2"/>',
    дослід:'<path d="M9 3h6M10 3v7L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 17h8"/>',
    інструмент:'<path d="M14.5 5.5a5 5 0 0 0-6.3 6.3L3 17a2 2 0 1 0 4 4l5.2-5.2a5 5 0 0 0 6.3-6.3l-3.2 3.2-4-4 3.2-3.2Z"/>',
    шифрування:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v3"/>',
    видимість:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    приховати:'<path d="M2 2 22 22M9.5 5.5A10 10 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3 3.5M6.5 6.5A16 16 0 0 0 2 12s4 7 10 7a10 10 0 0 0 3-.5M10 10a3 3 0 0 0 4 4"/>',
    піктограма:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m12 6 1.5 4.5L18 12l-4.5 1.5L12 18l-1.5-4.5L6 12l4.5-1.5L12 6Z"/>',
    зафіксувати:'<path d="m8 4 8 8M14 2l8 8-4 1-3 3-2 8-3-3-1-7-4-4 3-4 6-2Z"/>',
    місце:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    скасувати:'<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>',
    сторінка:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M8 8v13"/>',
    ефекти:'<path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z"/><path d="M19 18v4M17 20h4"/>',
    прапори:'<path d="M4 22V4M4 5c4-4 8 4 16 0v12c-8 4-12-4-16 0"/>',
    простір:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 4v5"/>',
    джерело:'<path d="M8 3h8l5 5v13H3V8l5-5Z"/><path d="M8 3v5H3M16 3v5h5"/>',
    назва:'<path d="M4 6h16M12 6v14M8 20h8"/>',
    опис:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    посилання:'<path d="m9 15 6-6M7.5 10.5l-2 2a4 4 0 0 0 5.7 5.7l2-2m3.3-2.7 2-2a4 4 0 0 0-5.7-5.7l-2 2"/>',
    розмір:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16 16 8M11 8h5v5M8 11v5h5"/>',
    запрошення:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 8v8m-4-4h8"/>',
    лист:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
    права:'<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z"/><path d="M8 12h8"/>',
    особа:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    посвідчення:'<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M4 17a4 4 0 0 1 8 0M15 9h4M15 13h4"/>',
    світлина:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 18 5-5 4 3 3-4 6 6"/>',
    смітник:'<path d="M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    пошта:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
    сховище:'<path d="M5 18h14a4 4 0 0 0 .3-8A7 7 0 0 0 6 8.5 5 5 0 0 0 5 18Z"/>',
    пристрій:'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M1 21h22M12 17v4"/>',
    перевірка:'<path d="M20 11a8 8 0 1 1-2-5"/><path d="m8 12 3 3 9-10"/>',
    архів:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M10 14h4"/>',
    дані:'<path d="M7 2h7l5 5v15H5V4a2 2 0 0 1 2-2ZM14 2v5h5M8 12h8M8 16h8"/>',
    вихід:'<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M13 8l4 4-4 4M8 12h9"/>',
    гість:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 4v6m-3-3h6"/>',
    оновити:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
    сеанси:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 21h10M12 18v3M7 8h10M7 12h6"/>',
    ключ:'<circle cx="8" cy="15" r="4"/><path d="M11 12 21 2M16 7l3 3M18 5l3 3"/>',
    ключдоступу:'<circle cx="8.5" cy="14" r="4.5"/><path d="M12 10.5 20 3l1 1-2 2 2 2-3 3-2-2-3 3"/>',
    автентифікатор:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M9 14l2 2 4-5M11 19h2"/>',
    пароль:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M8 16h.01M12 16h.01M16 16h.01"/>',
    відновлення:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/><path d="M12 7v5l3 2"/>',
    замок:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v3"/>',
    відмикання:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0M12 15v3"/>',
    друк:'<rect x="5" y="3" width="14" height="6"/><rect x="5" y="16" width="14" height="6"/><path d="M5 18H3v-8h18v8h-2M17 12h1"/>',
    копія:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    довіра:'<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/><path d="M2 10h2M20 10h2"/>',
    коди:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h4M7 12h4M7 16h4M15 10l2 2-2 2"/>',
    зчитування:'<path d="M3 9V4h5M16 4h5v5M21 15v5h-5M8 20H3v-5M7 12h10M12 7v10"/>',
    строк:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h6"/>',
    одинраз:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9l3-3 3 3"/>',
    історія:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/><path d="M12 7v5l4 2"/>',
    допомога:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 0 1 5 1.5c0 2-2.5 2-2.5 4M12 18h.01"/>',
    втрата:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11l8 8M16 11l-8 8"/>',
    попередження:'<path d="m12 2 10 19H2L12 2Z"/><path d="M12 9v5M12 18h.01"/>',
    керування:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/>',
    гугл:'<circle cx="12" cy="12" r="9"/><path d="M21 12h-9M12 7a5 5 0 1 0 5 8"/>',
    смс:'<path d="M4 3h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M6 9h12M6 13h9"/>',
    телефон:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
    нотатка:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'
  };

  // Впізнавані знаки постачальників збережені в самому сайті, без зовнішніх запитів.
  const фірмовіПіктограми={
    гугл:'<svg class="brand-symbol brand-google" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.73-.06-1.42-.18-2.09H12v3.96h5.4a4.6 4.6 0 0 1-2 3.02v2.47h3.2c1.87-1.73 3-4.26 3-7.36Z"/><path fill="#34A853" d="M12 22c2.69 0 4.95-.89 6.6-2.41l-3.2-2.47c-.89.6-2.03.97-3.4.97-2.61 0-4.82-1.76-5.61-4.13H3.08v2.55A9.99 9.99 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.96A5.97 5.97 0 0 1 6.07 12c0-.68.12-1.34.32-1.96V7.49H3.08A9.96 9.96 0 0 0 2 12c0 1.63.39 3.16 1.08 4.51l3.31-2.55Z"/><path fill="#EA4335" d="M12 5.91c1.46 0 2.76.5 3.79 1.49l2.84-2.84A9.73 9.73 0 0 0 12 2a9.99 9.99 0 0 0-8.92 5.49l3.31 2.55c.79-2.37 3-4.13 5.61-4.13Z"/></svg>',
    майкрософт:'<svg class="brand-symbol" viewBox="0 0 24 24" aria-hidden="true"><path fill="#f35325" d="M2 2h9v9H2z"/><path fill="#81bc06" d="M13 2h9v9h-9z"/><path fill="#05a6f0" d="M2 13h9v9H2z"/><path fill="#ffba08" d="M13 13h9v9h-9z"/></svg>',
    телеграм:'<svg class="brand-symbol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2da6db"/><path fill="#fff" d="m5.3 11.5 12.6-5c.7-.2 1 .1.8.8l-2.1 10.1c-.2.7-.7.9-1.3.5l-3-2.2-1.5 1.5c-.2.2-.4.4-.7.4l.3-4.2 7.4-6.7-9 5.6-3.5-1z"/></svg>',
    діскорд:'<svg class="brand-symbol" viewBox="0 0 24 24" aria-hidden="true"><path fill="#5865f2" d="M7 3.5c3.3-1 6.7-1 10 0 2.6 2.8 4.3 6.7 4.5 11-1.3 1.5-3.1 2.5-5.3 3.2l-1.1-1.8c.6-.2 1.2-.5 1.8-.9-3.3 1.5-7.3 1.5-10.6 0 .6.4 1.2.7 1.8.9l-1.1 1.8C5 19.7 3.2 18.7 2 17.2c.1-4.3 1.9-8.3 4.5-11 .2-.1.4-.2.5-.2Z"/><path fill="#fff" d="M7.8 8.4c2.7-1.4 5.7-1.4 8.4 0l1.5 6c-3.8 3-7.6 3-11.4 0l1.5-6Z"/><circle cx="9.4" cy="12" r="1.2" fill="#5865f2"/><circle cx="14.6" cy="12" r="1.2" fill="#5865f2"/></svg>',
    епл:'<svg class="brand-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 7c.3-2.1 1.7-3.7 3.9-4-.3 2.2-1.5 3.6-3.9 4ZM12.3 8.6c-2.1-1.6-6.6-1.2-7.4 3.2-.8 4.4 2.6 9.5 5 9.1 1.1-.1 1.7-.8 3-1 1.4.2 2 .9 3.2 1 1.9.2 4.7-3.4 5-5.9-2.7-1.5-3.2-5.4-.4-7.2-2.1-2.3-5-2.6-7.5-.9Z" fill="currentColor"/></svg>',
    ватсап:'<svg class="brand-symbol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#25d366"/><path d="M7 18 8 15.5a7 7 0 1 1 2 2Z" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M9 9c.4 2.7 3.3 5.3 6 5.8l1-1.4-2-1-1 1-2.2-2.3.9-1.1-1.4-1.9Z" fill="#fff"/></svg>'
  };

  function піктограмаЗаСуттю(ключ){
    if(фірмовіПіктограми[ключ])return фірмовіПіктограми[ключ];
    const контур=контуриПіктограм[ключ];
    if(!контур)throw new Error("Невідоме призначення піктограми: "+ключ);
    return '<svg class="meaningful-icon option-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+контур+'</svg>';
  }


  // ───────── реєстр.js ─────────
  // Повна проєктна карта. Жоден із цих елементів не звертається до справжнього акаунта.
  const рядок=(uk,nl,тип="відомості",варіанти=[],стан=null,перехід=null,пояснення=null)=>({uk,nl,тип,варіанти,стан,перехід,пояснення});
  const група=(id,uk,nl,поясненняUk,поясненняNl,стан,рядки)=>({id,uk,nl,поясненняUk,поясненняNl,стан,рядки});

  const реєстрНалаштувань={
    personalization:[
      група("переходи","Розділи персоналізації","Onderdelen van personalisatie","Кожний пункт відкриває відповідні параметри на цій сторінці.","Elk onderdeel opent zijn instellingen op deze pagina.","наявне",[
        рядок("Меню й піктограми","Menu en pictogrammen","перехід",[],null,"menu"),
        рядок("Теми та кольори","Thema's en kleuren","перехід",[],null,"themes"),
        рядок("Мова інтерфейсу","Taal van de interface","перехід",[],null,"languages"),
        рядок("Віджети й блоки","Widgets en blokken","перехід",[],null,"widgets"),
        рядок("Спільний доступ","Delen","перехід",[],null,"sharing"),
        рядок("Ідентичності й захист","Identiteiten en beveiliging","перехід",[],null,"identities")
      ]),
      група("особисте","Додаткові вподобання","Extra voorkeuren","Пропоновані можливості, які поки існують лише в макеті.","Voorgestelde mogelijkheden die voorlopig alleen in het ontwerp bestaan.","макет",[
        рядок("Щільність інтерфейсу","Dichtheid van de interface","вибір",[["Комфортна","Comfortabel"],["Компактна","Compact"]]),
        рядок("Делікатна поява блоків","Subtiele verschijning van blokken","перемикач")
      ])
    ],
    menu:[
      група("піктограми","Стиль піктограм","Pictogramstijl","Вигляд головних розділів і вкладених пунктів.","Uiterlijk van hoofdonderdelen en subonderdelen.","наявне",[
        рядок("Стиль піктограм","Pictogramstijl","вибір",[["Класичні","Klassiek"],["Кольорові","Kleurrijk"]]),
        рядок("Колір активного пункту","Kleur van het actieve onderdeel","відомості")
      ]),
      група("панель","Поведінка бічної панелі","Gedrag van het zijpaneel","На вузьких екранах постійні режими приховані.","Op smalle schermen zijn vaste standen niet beschikbaar.","наявне",[
        рядок("Режим розгортання","Uitklapstand","вибір",[["Автоматично","Automatisch"],["Розгорнуто","Uitgeklapt"],["Згорнуто","Ingeklapt"]]),
        рядок("Розгортання при наведенні вздовж краю","Openen bij aanwijzen langs de rand","відомості"),
        рядок("Відкриття натисканням і свайпом","Openen met tik of veeg","відомості")
      ]),
      група("швидкий-доступ","Швидкий доступ","Snelle toegang","Керування улюбленими кнопками та їхнім порядком.","Beheer van favoriete knoppen en hun volgorde.","наявне",[
        рядок("Додати пункт швидкого доступу","Snelkoppeling toevoegen","дія"),
        рядок("Прибрати пункт","Snelkoppeling verwijderen","дія"),
        рядок("Змінити порядок і положення","Volgorde en positie wijzigen","дія"),
        рядок("Власна піктограма та колір","Eigen pictogram en kleur","дія"),
        рядок("Керування з клавіатури й сенсорного екрана","Bediening met toetsenbord en aanraakscherm","відомості")
      ]),
      група("розташування","Розташування й порядок меню","Positie en volgorde van het menu","Бічна панель або док; налаштування застосовуються за його видом.","Zijpaneel of dock; opties hangen af van de gekozen vorm.","наявне",[
        рядок("Розташування навігації","Navigatiepositie","вибір",[["Ліворуч","Links"],["Праворуч","Rechts"],["Зверху","Boven"],["Знизу","Onder"]]),
        рядок("Прозорість фону дока","Doorzichtigheid van de dockachtergrond","повзунок"),
        рядок("Збільшення піктограм при наведенні","Pictogrammen vergroten bij aanwijzen","перемикач"),
        рядок("Редагувати порядок і дублікати","Volgorde en kopieën bewerken","дія"),
        рядок("Скинути власні зміни","Eigen wijzigingen herstellen","обережна-дія")
      ]),
      група("сповіщення","Сповіщення в меню","Meldingen in het menu","Позначки, відомості при наведенні, нагадування та тихі години.","Markeringen, informatie bij aanwijzen, herinneringen en stille uren.","наявне",[
        рядок("Показувати позначки","Markeringen tonen","перемикач"),
        рядок("Число нового або кольорова крапка","Aantal of gekleurde stip","вибір",[["Число","Aantal"],["Крапка","Stip"]]),
        рядок("Відомості при наведенні","Informatie bij aanwijzen","перемикач"),
        рядок("Привертати увагу до нового","Aandacht vragen voor nieuwe meldingen","перемикач"),
        рядок("Нагадувати про непрочитане","Herinneren aan ongelezen meldingen","перемикач"),
        рядок("Частота нагадувань","Frequentie van herinneringen","вибір",[["Ніколи","Nooit"],["15 хв","15 min"],["30 хв","30 min"],["1 год","1 uur"]]),
        рядок("Увімкнути тихі години","Stille uren inschakelen","перемикач"),
        рядок("Початок тихих годин","Begin van stille uren","поле"),
        рядок("Завершення тихих годин","Einde van stille uren","поле"),
        рядок("Типи сповіщень","Soorten meldingen","дія")
      ]),
      група("швидкодія","Переходи та швидкодія","Overgangen en snelheid","Параметри завантаження й перемикання розділів.","Instellingen voor laden en wisselen tussen onderdelen.","наявне",[
        рядок("Смужка завантаження","Laadbalk","перемикач"),
        рядок("Плавне перемикання сторінок","Vloeiend wisselen tussen pagina's","перемикач"),
        рядок("Попереднє завантаження при наведенні","Vooraf laden bij aanwijzen","перемикач"),
        рядок("Експериментальні можливості","Experimentele mogelijkheden","відомості"),
        рядок("Повністю готувати розділ заздалегідь","Onderdeel volledig vooraf voorbereiden","перемикач"),
        рядок("Зберігати чернетки із шифруванням","Concepten versleuteld bewaren","перемикач")
      ]),
      група("видимість","Видимість і піктограми пунктів","Zichtbaarheid en pictogrammen","Пункти можна показувати або приховувати, не втрачаючи доступу до обов'язкових налаштувань.","Onderdelen kunnen worden getoond of verborgen; verplichte instellingen blijven bereikbaar.","наявне",[
        рядок("Перелік розділів та їхня видимість","Lijst met onderdelen en hun zichtbaarheid","дія"),
        рядок("Змінити піктограму пункту","Pictogram van een onderdeel wijzigen","дія"),
        рядок("Обов'язкові пункти залишаються доступними","Verplichte onderdelen blijven toegankelijk","відомості")
      ]),
      група("додаткове","Вдосконалення навігації","Verbeteringen van navigatie","Рішення, схвалені для макета, які ще потребують окремої перевірки на робочому сайті.","Ontwerpkeuzes die nog apart op de werkende site moeten worden gecontroleerd.","макет",[
        рядок("Звичайна панель або окремі кнопки","Gewoon paneel of losse knoppen","вибір",[["Панель","Paneel"],["Кнопки","Knoppen"]]),
        рядок("Лише піктограми або піктограми з назвами","Alleen pictogrammen of met tekst","вибір",[["Лише піктограми","Alleen pictogrammen"],["З назвами","Met tekst"]]),
        рядок("Стійке розміщення піктограм","Vaste plaatsing van pictogrammen","відомості"),
        рядок("Підсвічування активного розділу","Actief onderdeel markeren","перемикач")
      ])
    ],
    themes:[
      група("режим","Світлий і темний режими","Lichte en donkere modus","Вибір освітлення незалежно від основної палітри.","Lichtkeuze onafhankelijk van het kleurenpalet.","наявне",[
        рядок("Режим освітлення","Lichtmodus","вибір",[["Світлий","Licht"],["Темний","Donker"],["Як на пристрої","Volgens apparaat"],["Автоматично","Automatisch"]])
      ]),
      група("розклад","Автоматична зміна","Automatisch wisselen","Сутінки у вибраному місті або власний розклад.","Schemering in een gekozen stad of een eigen tijdschema.","наявне",[
        рядок("За заходом і сходом сонця","Volgens zonsopkomst en zonsondergang","вибір",[["За сутінками","Volgens schemering"],["За розкладом","Volgens schema"]]),
        рядок("Вибрати місто","Stad kiezen","вибір",[["Брюссель","Brussel"],["Гент","Gent"],["Антверпен","Antwerpen"],["Київ","Kyiv"]]),
        рядок("Визначити приблизне місце для сутінків","Geschatte locatie voor schemering bepalen","дія"),
        рядок("Час початку режиму","Begintijd van de modus","поле"),
        рядок("Час завершення режиму","Eindtijd van de modus","поле"),
        рядок("Тимчасове скасування автоматичного режиму","Automatische modus tijdelijk onderbreken","дія")
      ]),
      група("палітра","Основне кольорове оформлення","Basiskleuren","Наявні оформлення з різними світлими та темними відтінками.","Bestaande paletten met een lichte en donkere variant.","наявне",[
        рядок("Оформлення сторінки","Paginaweergave","вибір",[["Кольорове","Kleurrijk"],["Грифельне","Leisteen"],["Чисте","Zuiver"],["Фіолетове","Paars"]])
      ]),
      група("акцент","Допоміжний колір і виразність","Accentkleur en intensiteit","Допоміжний колір не замінює основного оформлення.","Accentkleur vervangt het basispalet niet.","макет",[
        рядок("Акцентна палітра","Accentkleuren","вибір",[["Фіолетовий","Paars"],["Бірюзовий","Turkoois"],["Рожевий","Roze"],["Бурштиновий","Amber"]]),
        рядок("Виразність декоративних ефектів","Intensiteit van decoratieve effecten","повзунок")
      ])
    ],
    languages:[
      група("мова","Мова всього інтерфейсу","Taal van de hele interface","Написи, пояснення, стани та підказки змінюються разом із мовою.","Teksten, uitleg, toestanden en aanwijzingen veranderen mee.","наявне",[
        рядок("Мова інтерфейсу","Taal van de interface","вибір",[["Українська","Українська"],["Нідерландська","Nederlands"]])
      ])
    ],
    widgets:[
      група("створення","Додати віджет або сервіс","Widget of dienst toevoegen","Повна форма створення внутрішнього блоку чи зовнішнього посилання.","Volledig formulier voor een intern blok of externe koppeling.","наявне",[
        рядок("Робочий простір","Werkruimte","вибір",[["Мій простір","Mijn Ruimte"]]),
        рядок("Джерело","Bron","вибір",[["Внутрішній сервіс","Interne dienst"],["Зовнішнє посилання","Externe koppeling"]]),
        рядок("Сервіс або сторінка","Dienst of pagina","вибір",[["Завдання","Taken"],["Календар","Agenda"],["Нотатки","Notities"],["ШІ","AI"],["Пошта","Mail"],["Сховище","Opslag"],["GitHub","GitHub"]]),
        рядок("Назва","Naam","поле"),
        рядок("Опис","Beschrijving","поле"),
        рядок("Посилання","Koppeling","поле"),
        рядок("Розмір","Grootte","вибір",[["Малий","Klein"],["Звичайний","Normaal"],["Широкий","Breed"],["Власний","Eigen"]]),
        рядок("Додати свій сервіс","Eigen dienst toevoegen","дія")
      ]),
      група("вигляд","Компонування віджетів","Indeling van widgets","Додатковий спосіб налаштувати робоче полотно.","Aanvullende manier om de werkruimte in te delen.","макет",[
        рядок("Показувати віджети","Widgets tonen","перемикач"),
        рядок("Попередній перегляд розташування","Voorbeeld van de indeling","відомості")
      ])
    ],
    sharing:[
      група("запрошення","Доступ за обліковим записом","Toegang per account","Запрошення конкретної особи з визначеними правами. Потрібно узгодити перевірку прав в інтерфейсі та на сервері.","Een persoon uitnodigen met afgebakende rechten. De controle van rechten in de interface en op de server moet worden afgestemd.","частково",[
        рядок("Право запрошувати визначає роль у вибраному просторі","De rol in de gekozen werkruimte bepaalt het uitnodigingsrecht","відомості",[],"частково",null,{uk:"Наявний інтерфейс перевіряє загальну роль користувача, а сервер — роль у вибраному просторі. До узгодження цих перевірок не показувати дозвіл як підтверджений.",nl:"De huidige interface controleert de algemene gebruikersrol, terwijl de server de rol in de gekozen werkruimte controleert. Toon de toestemming niet als bevestigd voordat beide controles overeenkomen."}),
        рядок("Робочий простір","Werkruimte","вибір",[["Мій простір","Mijn Ruimte"]]),
        рядок("Адреса запрошеної особи","Adres van de genodigde","поле"),
        рядок("Рівень доступу","Toegangsniveau","вибір",[["Перегляд","Bekijken"],["Редагування","Bewerken"]]),
        рядок("Надати доступ","Toegang verlenen","обережна-дія")
      ]),
      група("посилання","Приватне посилання","Privékoppeling","Окремі дозволи та строк дії посилання.","Afzonderlijke rechten en vervaldatum van de koppeling.","наявне",[
        рядок("Строк дії посилання","Geldigheidsduur","відомості"),
        рядок("Створити посилання","Koppeling maken","обережна-дія")
      ]),
      група("чинні","Чинні запрошення та дозволи","Bestaande uitnodigingen en rechten","Майбутнє окреме представлення керування правами.","Toekomstig apart overzicht voor rechtenbeheer.","заплановано",[
        рядок("Хто має доступ","Wie heeft toegang","відомості"),
        рядок("Змінити або відкликати право","Recht wijzigen of intrekken","обережна-дія")
      ])
    ],
    identities:[
      група("зв'язки","Розділи захисту й ідентичності","Onderdelen voor identiteit en beveiliging","Це переходи до справжніх налаштувань, а не їхні копії.","Koppelingen naar de echte instellingen, geen kopieën daarvan.","наявне",[
        рядок("Сесії та пристрої","Sessies en apparaten","перехід",[],null,"sessions"),
        рядок("Способи входу","Inlogmethoden","перехід",[],null,"methods"),
        рядок("Безпека","Beveiliging","перехід",[],null,"security"),
        рядок("Відновлення доступу","Toegang herstellen","перехід",[],null,"recovery")
      ]),
      група("профіль","Оформлення звичайного й технічного режимів","Weergave van normale en technische modus","Вигляд макета не змінює повноважень користувача.","De ontwerpweergave wijzigt geen gebruikersrechten.","макет",[
        рядок("Активний вигляд","Actieve weergave","вибір",[["Звичайний","Normaal"],["Технічний","Technisch"]]),
        рядок("Показувати позначку режиму","Modusmarkering tonen","перемикач")
      ])
    ],
    account:[
      група("особа","Профіль і фото","Profiel en foto","Справжня світлина надходить з авторизованого облікового запису; її можна замінити файлом або посиланням, прибрати власну або вибрати «Без фото» (лише ініціали).","De echte foto komt uit het aangemelde account; u kunt ze vervangen door een bestand of een link, de eigen foto verwijderen of «Geen foto» kiezen (alleen initialen).","наявне",[
        рядок("Світлина з облікового запису","Foto uit het account","фото"),
        рядок("Прибрати власну світлину","Eigen foto verwijderen","обережна-дія")
      ]),
      група("стан","Стан підключених служб","Status van verbonden diensten","Перевірка підключення без читання вмісту листів і файлів.","Controle van verbindingen zonder inhoud van berichten of bestanden te lezen.","наявне",[
        рядок("Пошта й календар","Mail en agenda","відомості"),
        рядок("Хмарне сховище й GitHub","Cloudopslag en GitHub","відомості"),
        рядок("Підключення ШІ й пристрої","AI-verbindingen en apparaten","відомості"),
        рядок("Перевірити зараз","Nu controleren","дія")
      ]),
      група("простори","Мої робочі простори","Mijn werkruimten","Активний простір та його стан.","Actieve werkruimte en de bijbehorende status.","наявне",[
        рядок("Активний робочий простір","Actieve werkruimte","відомості"),
        рядок("Відновити архівований робочий простір","Gearchiveerde werkruimte herstellen","обережна-дія")
      ]),
      група("видалення","Видалення облікового запису","Account verwijderen","Незворотна дія потребує окремої перевірки та підтвердження.","Onomkeerbare handeling vereist afzonderlijke controle en bevestiging.","наявне",[
        рядок("Пояснення наслідків видалення","Gevolgen van verwijdering","відомості"),
        рядок("Підтвердити видалення","Verwijdering bevestigen","обережна-дія")
      ]),
      група("експорт","Керування вивантаженням даних","Gegevensuitvoer beheren","Додатковий задум із попереднього макета; чинний спосіб роботи не підтверджено.","Aanvullend ontwerp; de werkende uitvoering is niet bevestigd.","макет",[
        рядок("Формат вивантаження","Uitvoerformaat","вибір",[["Структурований","Gestructureerd"],["Табличний","Tabelvorm"]]),
        рядок("Підготувати відомості","Gegevens voorbereiden","дія")
      ])
    ],
    sessions:[
      група("цей-пристрій","Збереження акаунта на пристрої","Account op dit apparaat bewaren","Чинний вибір для наступних входів.","Bestaande keuze voor volgende aanmeldingen.","наявне",[
        рядок("Зберегти обліковий запис","Account bewaren","перемикач"),
        рядок("Наслідки для місцевих даних після виходу","Gevolgen voor lokale gegevens na afmelden","відомості")
      ]),
      група("активні","Активні входи й пристрої","Actieve sessies en apparaten","Огляд пристроїв і керування завершенням входів.","Overzicht en beëindiging van aanmeldingen.","наявне",[
        рядок("Оновити список входів","Sessielijst vernieuwen","дія"),
        рядок("Завершити всі інші входи","Alle andere sessies beëindigen","обережна-дія"),
        рядок("Вийти всюди","Overal afmelden","обережна-дія")
      ]),
      група("гості","Гостьові сесії","Gastsessies","Обмежені за правами та строком входи інших осіб.","Sessies voor anderen met beperkte rechten en geldigheid.","наявне",[
        рядок("Чинні гостьові входи","Actieve gastaanmeldingen","відомості")
      ]),
      група("сповіщення","Сповіщення про новий вхід","Meldingen van nieuwe aanmeldingen","Додаткова можливість із макета, яку ще не підтверджено на робочому сайті.","Extra ontwerpmogelijkheid die nog niet op de werkende site is bevestigd.","макет",[
        рядок("Попереджати про новий пристрій","Melden bij een nieuw apparaat","перемикач")
      ])
    ],
    methods:[
      група("основні","Основні способи входу","Belangrijkste inlogmethoden","Вхід через Google підтверджено. Ключ доступу слугує передусім для додаткового підтвердження важливих дій.","Aanmelden via Google is bevestigd. Een passkey dient vooral om belangrijke handelingen extra te bevestigen.","частково",[
        рядок("Електронна пошта та Google","E-mail en Google","відомості"),
        рядок("Ключ доступу для підтвердження важливих дій","Passkey om belangrijke handelingen te bevestigen","дія",[],"частково",null,{uk:"Наявність ключа не означає, що ним можна самостійно ввійти. Показувати справжній стан ключів і відокремлювати вхід від підтвердження небезпечних дій.",nl:"Een passkey betekent niet automatisch dat je er zelfstandig mee kunt aanmelden. Toon de echte status en onderscheid aanmelden van het bevestigen van gevoelige handelingen."}),
        рядок("Застосунок-автентифікатор","Authenticatie-app","дія")
      ]),
      група("пароль","Пароль і тимчасовий доступ","Wachtwoord en tijdelijke toegang","Окреме керування паролем і підтвердження небезпечних змін.","Afzonderlijk wachtwoordbeheer en bevestiging van gevoelige wijzigingen.","наявне",[
        рядок("Стан пароля й вимога його заміни","Wachtwoordstatus en verplichte vervanging","відомості"),
        рядок("Новий пароль щонайменше з 10 символів","Nieuw wachtwoord van minstens 10 tekens","поле"),
        рядок("Зберегти новий пароль","Nieuw wachtwoord bewaren","обережна-дія"),
        рядок("Прибрати пароль","Wachtwoord verwijderen","обережна-дія")
      ]),
      група("захист","Додатковий захист","Aanvullende bescherming","Засоби захисту й відновлення з окремими станами.","Beveiligings- en herstelmiddelen met eigen status.","наявне",[
        рядок("Коди відновлення","Herstelcodes","перехід",[],null,"recovery"),
        рядок("Шифрування моїх даних","Versleuteling van mijn gegevens","перехід",[],null,"security"),
        рядок("Коди доступу для інших","Toegangscodes voor anderen","перехід",[],null,"security")
      ]),
      група("додаткові","Інші способи та готовність","Andere methoden en beschikbaarheid","Не показувати неввімкнений спосіб як готовий до входу.","Een niet-geactiveerde methode nooit als bruikbaar tonen.","наявне",[
        рядок("Microsoft — потрібне налаштування власника","Microsoft — configuratie van eigenaar nodig","відомості",[],"заплановано"),
        рядок("Discord — потрібне налаштування власника","Discord — configuratie van eigenaar nodig","відомості",[],"заплановано"),
        рядок("Telegram — потрібне налаштування власника","Telegram — configuratie van eigenaar nodig","відомості",[],"заплановано"),
        рядок("Apple — потрібне налаштування власника","Apple — configuratie van eigenaar nodig","відомості",[],"заплановано"),
        рядок("WhatsApp — такий вхід недоступний","WhatsApp — deze inlogmethode bestaat niet","відомості"),
        рядок("SMS — потребує окремої розробки","Sms — afzonderlijke ontwikkeling nodig","відомості",[],"заплановано")
      ])
    ],
    security:[
      група("ключі","Ключі доступу","Passkeys","Перелік, назви, нотатки та історія використання.","Overzicht, namen, notities en gebruiksgeschiedenis.","наявне",[
        рядок("Переглянути ключі доступу","Passkeys bekijken","дія"),
        рядок("Додати ключ доступу","Passkey toevoegen","обережна-дія"),
        рядок("Перейменувати ключ і додати нотатку","Passkey hernoemen en notitie toevoegen","обережна-дія"),
        рядок("Переглянути історію ключа","Geschiedenis van de passkey bekijken","дія"),
        рядок("Вилучити ключ доступу","Passkey verwijderen","обережна-дія"),
        рядок("Підтвердити довіру до пристрою або обладнання","Vertrouwen in apparaat of hardware bevestigen","обережна-дія")
      ]),
      група("другий-чинник","Двофакторна автентифікація","Tweestapsverificatie","Застосунок-автентифікатор і стан налаштування.","Authenticatie-app en configuratiestatus.","наявне",[
        рядок("Стан другого чинника","Status van de tweede factor","відомості"),
        рядок("Налаштувати автентифікатор","Authenticatie-app instellen","обережна-дія")
      ]),
      група("резервні-коди","Резервні коди","Herstelcodes","Кількість, використання, нотатки та перевипуск.","Aantal, gebruik, notities en vervanging.","наявне",[
        рядок("Доступні та використані коди","Beschikbare en gebruikte codes","відомості"),
        рядок("Створити нові коди","Nieuwe codes maken","обережна-дія"),
        рядок("Завантажити, скопіювати або надрукувати","Downloaden, kopiëren of afdrukken","дія"),
        рядок("Підтвердити збереження кодів","Opslaan van codes bevestigen","обережна-дія"),
        рядок("Відкликати або замінити чинні коди","Bestaande codes intrekken of vervangen","обережна-дія")
      ]),
      група("шифрування","Шифрування особистих даних","Versleuteling van persoonlijke gegevens","Пояснення меж захисту й поточного стану.","Uitleg over de bescherming en de huidige toestand.","наявне",[
        рядок("Стан особистого ключа","Status van persoonlijke sleutel","відомості"),
        рядок("Що захищено особистим ключем","Wat door de persoonlijke sleutel wordt beschermd","відомості"),
        рядок("Увімкнути захист власним ключем","Bescherming met eigen sleutel inschakelen","обережна-дія"),
        рядок("Замкнути або відімкнути сховище ключа","Sleutelkluis vergrendelen of ontgrendelen","обережна-дія"),
        рядок("Відновити доступ кодом відновлення","Toegang herstellen met een herstelcode","обережна-дія"),
        рядок("Повторно зашифрувати давні записи","Oude gegevens opnieuw versleutelen","обережна-дія")
      ]),
      група("гостьові-коди","Коди доступу для інших","Toegangscodes voor anderen","Права, строки, використання й відкликання гостьових кодів.","Rechten, vervaltermijnen, gebruik en intrekking van gastcodes.","наявне",[
        рядок("Створити обмежений код","Beperkte code maken","обережна-дія"),
        рядок("Назва та приватна нотатка","Naam en privénotitie","поле"),
        рядок("Дозволені розділи для перегляду","Toegestane onderdelen voor inzage","вибір",[["Лише вибрані","Alleen geselecteerde"],["Усі дозволені","Alle toegestane"]]),
        рядок("Строк дії та кількість використань","Geldigheidsduur en aantal keren gebruiken","поле"),
        рядок("Одноразове або багаторазове використання","Eenmalig of meermalig gebruik","вибір",[["Один раз","Eenmalig"],["Кілька разів","Meermalig"]]),
        рядок("Показати код або відомості для зчитування","Code of scanbare gegevens tonen","дія"),
        рядок("Змінити строк дії коду","Geldigheidsduur wijzigen","обережна-дія"),
        рядок("Переглянути стан та історію","Status en geschiedenis bekijken","дія"),
        рядок("Відкликати доступ","Toegang intrekken","обережна-дія")
      ])
    ],
    recovery:[
      група("засоби","Наявні засоби відновлення","Beschikbare herstelmiddelen","Огляд засобів без показу таємних значень.","Overzicht zonder geheime waarden te tonen.","наявне",[
        рядок("Коди відновлення","Herstelcodes","відомості"),
        рядок("Інші способи підтвердження","Andere bevestigingsmethoden","відомості")
      ]),
      група("сценарії","Як відновити доступ","Toegang herstellen","Окремі зрозумілі сценарії для втрати різних засобів входу.","Duidelijke scenario's voor verlies van verschillende inlogmiddelen.","заплановано",[
        рядок("Втрачено пристрій","Apparaat verloren","дія"),
        рядок("Втрачено ключ доступу","Passkey verloren","дія"),
        рядок("Недоступний автентифікатор","Authenticatie-app niet beschikbaar","дія"),
        рядок("Закінчилися резервні коди","Herstelcodes zijn op","дія")
      ]),
      група("поради","Запобігання втраті доступу","Toegangsverlies voorkomen","Поради з урахуванням можливого шифрування особистих даних.","Adviezen met aandacht voor mogelijke versleuteling van gegevens.","заплановано",[
        рядок("Перевірити резервні способи","Reserveopties controleren","дія"),
        рядок("Зрозуміти наслідки втрати ключа","Gevolgen van sleutelverlies begrijpen","відомості")
      ])
    ]
  };

  // Стан розгортання зберігається окремо для кожної групи.
  const відкритіГрупиРеєстру=new Set();
  const вибірЗразкаРеєстру=new Map();
  const написиРеєстру={
    uk:{title:"Усі параметри розділу",notice:"Це проєктне представлення. Жодна дія тут не змінює вашого облікового запису.",present:"Є на сайті",partial:"Частково реалізовано",planned:"Потребує розробки",sample:"Лише макет",showAll:"Розгорнути всі",hideAll:"Згорнути всі",inspect:"Переглянути вигляд",forbidden:"Недоступно в макеті",field:"Введіть значення для прикладу",nothing:"Потребує перевірки",toast:"Показано лише в макеті. Справжні налаштування залишилися без змін."},
    nl:{title:"Alle instellingen van dit onderdeel",notice:"Dit is een ontwerpweergave. Geen enkele handeling wijzigt je echte account.",present:"Aanwezig op de site",partial:"Gedeeltelijk beschikbaar",planned:"Ontwikkeling nodig",sample:"Alleen ontwerp",showAll:"Alles uitklappen",hideAll:"Alles inklappen",inspect:"Voorbeeld bekijken",forbidden:"Niet beschikbaar in ontwerp",field:"Vul een voorbeeldwaarde in",nothing:"Controle nodig",toast:"Alleen in het ontwerp getoond. Je echte instellingen blijven ongewijzigd."}
  };

  function tekstРеєстру(waarde){return waarde?.[preferences.lang]||waarde?.uk||"";}
  function veiligeTekstРеєстру(waarde){return String(waarde??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
  function badgeРеєстру(stand){
    const t=написиРеєстру[preferences.lang];
    const naam=stand==="заплановано"?t.planned:stand==="макет"?t.sample:stand==="частково"?t.partial:t.present;
    return '<span class="register-badge register-'+(stand||'наявне')+'">'+naam+'</span>';
  }
  function keuzeРеєстру(sectie,groepsId,rij,rijIndex){
    const sleutel=sectie+":"+groepsId+":"+rijIndex;
    const geselecteerd=вибірЗразкаРеєстру.get(sleutel)??0;
    return '<div class="register-choices" role="group" aria-label="'+veiligeTekstРеєстру(preferences.lang==="nl"?rij.nl:rij.uk)+'">'+
      rij.варіанти.map((paar,i)=>'<button type="button" class="register-choice '+(i===geselecteerd?'selected':'')+'" data-register-choice="'+sleutel+'" data-register-index="'+i+'" aria-pressed="'+(i===geselecteerd)+'">'+veiligeTekstРеєстру(paar[preferences.lang==="nl"?1:0])+'</button>').join('')+'</div>';
  }
  function veldРеєстру(sectie,groep,rij,i){
    const t=написиРеєстру[preferences.lang],naam=veiligeTekstРеєстру(preferences.lang==="nl"?rij.nl:rij.uk);
    const stand=rij.стан||groep.стан;
    let widget='';
    if(rij.тип==="вибір")widget=keuzeРеєстру(sectie,groep.id,rij,i);
    else if(rij.тип==="перемикач")widget='<button type="button" class="register-switch" role="switch" aria-label="'+naam+'" aria-checked="false" data-register-switch="'+sectie+':'+groep.id+':'+i+'"><span></span></button>';
    else if(rij.тип==="повзунок")widget='<input class="register-range" type="range" min="0" max="100" value="45" aria-label="'+naam+'" data-register-range>';
    else if(rij.тип==="поле")widget='<input class="register-field" type="text" placeholder="'+veiligeTekstРеєстру(t.field)+'" aria-label="'+naam+'" autocomplete="off" data-register-field>';
    else if(rij.тип==="фото")widget='<button type="button" class="register-action" data-open-profile-photo>'+(preferences.lang==="nl"?"Echte foto bekijken":"Переглянути справжню світлину")+'</button>';
    else if(rij.тип==="перехід")widget='<button type="button" class="register-go" data-register-go="'+rij.перехід+'" aria-label="'+naam+'"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 5 7 7-7 7"/></svg></button>';
    else if(rij.тип==="обережна-дія")widget='<button type="button" class="register-action register-disabled" disabled title="'+veiligeTekstРеєстру(t.forbidden)+'">'+veiligeTekstРеєстру(t.forbidden)+'</button>';
    else if(rij.тип==="дія")widget='<button type="button" class="register-action" data-register-action>'+veiligeTekstРеєстру(t.inspect)+'</button>';
    else widget='<span class="register-info-symbol" aria-hidden="true">ⓘ</span>';
    const пояснення=rij.пояснення?'<small class="register-row-note">'+veiligeTekstРеєстру(preferences.lang==="nl"?rij.пояснення.nl:rij.пояснення.uk)+'</small>':'';
    return '<div class="register-row"><div class="register-row-copy"><strong>'+naam+'</strong>'+(rij.стан&&rij.стан!==groep.стан?badgeРеєстру(stand):'')+пояснення+'</div><div class="register-row-widget">'+widget+'</div></div>';
  }
  function tekenРеєстр(sectie){
    const t=написиРеєстру[preferences.lang],groeplijst=реєстрНалаштувань[sectie]||[];
    const усіВідкриті=groeplijst.every(g=>відкритіГрупиРеєстру.has(sectie+':'+g.id));
    return '<div class="register-catalog" data-register-section="'+sectie+'">'+
      '<div class="register-head"><div><span class="register-eyebrow">'+veiligeTekstРеєстру(t.title)+'</span><p>'+veiligeTekstРеєстру(t.notice)+'</p></div><button type="button" class="register-all" data-register-all="'+sectie+'">'+veiligeTekstРеєстру(усіВідкриті?t.hideAll:t.showAll)+'</button></div>'+
      '<div class="register-list">'+groeplijst.map((g,i)=>{
        const sleutel=sectie+':'+g.id,open=відкритіГрупиРеєстру.has(sleutel);
        return '<details class="register-group" data-register-group="'+sleutel+'" '+(open?'open':'')+'><summary><span class="register-group-index">'+String(i+1).padStart(2,'0')+'</span><span class="register-group-text"><strong>'+veiligeTekstРеєстру(preferences.lang==="nl"?g.nl:g.uk)+'</strong><small>'+veiligeTekstРеєстру(preferences.lang==="nl"?g.поясненняNl:g.поясненняUk)+'</small></span>'+badgeРеєстру(g.стан)+'<span class="register-chevron" aria-hidden="true"><svg class="expand-chevron" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7.5 5 5 5-5"/></svg></span></summary><div class="register-group-body">'+g.рядки.map((rij,j)=>veldРеєстру(sectie,g,rij,j)).join('')+'</div></details>';
      }).join('')+'</div></div>';
  }

  // Показуємо лише доповнення до вже оформлених кнопок. Повний перелік
  // залишається у карті функцій, а не повторюється на кожній сторінці.
  const вжеОформленіГрупи={
    personalization:["переходи","особисте"],
    menu:["піктограми","панель","розташування","додаткове"],
    themes:["режим","акцент"],
    languages:["мова"],
    widgets:["вигляд"],
    identities:["зв'язки","профіль"]
  };
  const вжеОформленіРядки={account:["Світлина з облікового запису"]};
  // САЙТ (IDENTITEIT-011): жива карта. Стан кожної групи й рядка звірено з кодом живої версії 20261113-121403.
  // IDENTITEIT-014 (фаза 3): звірено ще раз після під'єднання спільного доступу, вивантаження, способів входу й відновлення;
  // кожна ціль — справжній id/селектор у коді (перевіряє tests/eenheid/identiteit-014-kaart.test.ts).
  // «в-чинних» — працює в блоці «Чинні налаштування» цього розділу; рядок стає кнопкою переходу до потрібного місця.
  // «частково» — є на сайті, але бракує частини; «заплановано» — потребує розробки; «недоступно» — свідомо не передбачено.
  // IDENTITEIT-015 (крок «kaart-stille-uren»): «власник» — код є й працює, але лише після кроку власника сайту (ключі, прапорець, право);
  // точна передумова — у рядку відомості (reden). Перехід веде до місця, де людина бачить пояснення. Підписи звірено з відомістю.
  // ціль: "розділ|селектор" усередині гнізда .mq-echt розділу (без розділу — той самий розділ). Група, усі рядки якої «в-чинних», зникає з карти.
  // De levende kaart: status per groep en regel volgens de live code; «в-чинних» wordt een knop naar de echte instelling.
  // IDENTITEIT-015 (крок «vormgeving»): групи, оформлені в самій картці, тепер під'єднано до справжніх налаштувань (обліковий запис):
  // щільність і рух, акцент і ефекти, мова, положення й режим меню, тумблер простору. Що на сайті свідомо не налаштовується — «недоступно».
  const станНаСайті={
    personalization:{
      "особисте":{стан:"в-чинних",ціль:"#weergave-dichtheid",цілі:{1:"#weergave-beweging"}}
    },
    languages:{"мова":{стан:"в-чинних",ціль:".settings-choice-grid"}},
    identities:{"профіль":{стан:"в-чинних",рядки:{1:"недоступно"}}},
    menu:{
      "панель":{стан:"в-чинних",ціль:"#menu-modus"},
      "розташування":{стан:"в-чинних",ціль:"#menu-indeling"},
      "додаткове":{стан:"частково",ціль:"#menu-modus",рядки:{0:"частково",1:"частково",2:"частково",3:"недоступно"}},
      "швидкий-доступ":{стан:"в-чинних",ціль:"#menu-snel"},
      "сповіщення":{стан:"в-чинних",ціль:"#menu-meldingen",цілі:{9:"#menu-meldingtypen"},додати:[
        {uk:"Нагадування про резервний доступ",nl:"Herinnering aan reservetoegang",стан:"в-чинних",ціль:"[data-meld-schakel=\"reserve\"]",іконка:"нагадування"}
      ]},
      "швидкодія":{стан:"в-чинних",ціль:"#menu-snelheid"},
      "видимість":{стан:"в-чинних",ціль:"#menu-zichtbaarheid"}
    },
    themes:{
      "розклад":{стан:"в-чинних",ціль:"#thema-auto-kop"},
      // IDENTITEIT-015 (зведення): фіолетова палітра — лише з правом plum-theme від власника сайту.
      "палітра":{стан:"в-чинних",ціль:"#thema-kleur-kop",рядки:{0:"власник"}},
      "акцент":{стан:"в-чинних",ціль:"#thema-accent",цілі:{1:"#thema-effecten"}}
    },
    // IDENTITEIT-015 (крок «profiel-blokken»): форма блоку повна — «Скасувати», «Відкрити в просторі», пояснення адреси внутрішнього блоку,
    // серверна перевірка посилання (крок «risico»). Передача простору перед видаленням — .settings-overdracht.
    widgets:{"створення":{стан:"в-чинних",ціль:".settings-form"},"вигляд":{стан:"частково",рядки:{0:"недоступно",1:"частково"}}},
    sharing:{
      "запрошення":{стан:"в-чинних",ціль:"#delen-uitnodigen"},
      // IDENTITEIT-015 (крок «delen»): строк 1/7/30 днів з межею на сервері, дата спливу, прив'язка до адреси (.delen-link-opties);
      // «Відкриті посилання» з відкликанням (#delen-links); «Вийти з простору» на власному рядку (#delen-leden).
      "посилання":{стан:"в-чинних",ціль:"#delen-uitnodigen",цілі:{0:".delen-link-opties"}},
      "чинні":{стан:"в-чинних",ціль:"#delen-leden"}
    },
    account:{
      "особа":{стан:"в-чинних"},
      "стан":{стан:"в-чинних"},
      "простори":{стан:"в-чинних"},
      "видалення":{стан:"в-чинних",ціль:".settings-danger",цілі:{0:".settings-overdracht"}},
      // IDENTITEIT-015 (крок «apparaten-uitvoer»): вибір формату JSON / ZIP із CSV (.gegevensuitvoer-formaat), стан «готую → готово → файл».
      "експорт":{стан:"в-чинних",ціль:"#gegevensuitvoer",цілі:{0:".gegevensuitvoer-formaat"}}
    },
    sessions:{
      "цей-пристрій":{стан:"в-чинних",ціль:".sessies-onthouden"},
      "активні":{стан:"в-чинних"},
      // IDENTITEIT-015 (зведення): гостьові входи інших облікових записів — за прапорцем власника gastcodes-iedereen.
      "гості":{стан:"в-чинних",ціль:".sessies-gasten",рядки:{0:"власник"}},
      // IDENTITEIT-015 (крок «apparaten-uitvoer»): вибір «Завжди / Вимкнено», відомі пристрої, «Це був я», «Забути пристрій».
      // IDENTITEIT-015 (зведення): вибір і відомі пристрої працюють; спливне сповіщення — після прапорців власника meldingen-v2 і meldingen-uitleg-v3.
      "сповіщення":{стан:"в-чинних",ціль:"#sessies-nieuw-apparaat",рядки:{0:"власник"}}
    },
    methods:{
      // IDENTITEIT-015 (крок «sleutels-gasten»): біля кожного ключа — «Вхід і підтвердження» / «Лише підтвердження» і окремо «Довірений».
      // IDENTITEIT-015 (зведення): позиція 0 — Google працює, вхід посиланням на пошту потребує поштової служби сайту (налаштування власника).
      "основні":{стан:"в-чинних",ціль:"#aanmeldmethoden-google",рядки:{0:"власник"},цілі:{1:"security|#aanmeldmethoden-passkeys",2:"security|#aanmeldmethoden-2fa"}},
      // IDENTITEIT-015 (зведення): позиція 0 — тимчасовий пароль від власника не дає входу (форми заміни під час входу немає) — «частково».
      "пароль":{стан:"в-чинних",ціль:"#aanmeldmethoden-wachtwoord",рядки:{0:"частково"}},
      // IDENTITEIT-015 (зведення): повторне шифрування — з перебігом і продовженням (працює); гостьові коди для інших — за прапорцем власника.
      "захист":{стан:"в-чинних",рядки:{2:"власник"},цілі:{0:"recovery|#aanmeldmethoden-herstel",1:"security|#aanmeldmethoden-sleutelkluis",2:"security|#toegangscodes"}},
      // IDENTITEIT-015 (крок «aanmelden»): Microsoft/Discord/Apple — прив'язка для схвалених не-власників і вхід за прив'язкою (потрібні ключі
      // власника й самоперевірка — тому «частково»); SMS — номер і код pending → verified (#aanmeldmethoden-telefoon), потрібен провайдер власника.
      // IDENTITEIT-015 (зведення): усі ці способи в коді є; працюють після ключів/прапорця власника (SMS — після провайдера SMS_AANBIEDER) — «власник».
      "додаткові":{стан:"власник",ціль:"#aanmeldmethoden-catalogus",рядки:{0:"власник",1:"власник",2:"власник",3:"власник",4:"недоступно",5:"власник"},цілі:{5:"#aanmeldmethoden-telefoon"},
        назви:{5:{uk:"SMS — потрібне налаштування власника",nl:"Sms — configuratie van eigenaar nodig"}}}
    },
    security:{
      // IDENTITEIT-015 (крок «sleutels-gasten»): довіра до ключа (міграція 0274, посилене підтвердження) — позначка «Довірений» у переліку ключів.
      "ключі":{стан:"в-чинних",ціль:"#aanmeldmethoden-sleutels",цілі:{5:"#aanmeldmethoden-passkeys"}},
      "другий-чинник":{стан:"в-чинних",ціль:"#aanmeldmethoden-2fa",додати:[
        {uk:"QR-код для застосунку-автентифікатора",nl:"QR-code voor de authenticator-app",стан:"в-чинних",іконка:"зчитування"},
        {uk:"Замінити автентифікатор",nl:"Authenticator vervangen",стан:"в-чинних",іконка:"повернути"}
      ]},
      "резервні-коди":{стан:"в-чинних",ціль:"recovery|#aanmeldmethoden-herstel"},
      "шифрування":{стан:"в-чинних",ціль:"#aanmeldmethoden-sleutelkluis"},
      // IDENTITEIT-015: для схвалених не-власників — за прапорцем gastcodes-iedereen; без нього в #toegangscodes пояснення й перехід до «Доступу».
      "гостьові-коди":{стан:"в-чинних",ціль:"#toegangscodes",рядки:{0:"власник"}}
    },
    recovery:{
      "засоби":{стан:"в-чинних",ціль:"#aanmeldmethoden-herstel",цілі:{1:"#herstel-overzicht"}},
      "сценарії":{стан:"в-чинних",ціль:"#herstel-scenarios",цілі:{0:"#herstel-scenarios [data-scenario=\"apparaat\"]",1:"#herstel-scenarios [data-scenario=\"passkey\"]",2:"#herstel-scenarios [data-scenario=\"authenticator\"]",3:"#herstel-scenarios [data-scenario=\"codes-op\"]"},
        // IDENTITEIT-015 (крок «sleutels-gasten»): у кожному кроці — кнопка до точного місця; перемикач нагадування — прямо тут.
        додати:[{uk:"Нагадування про резервний доступ",nl:"Herinnering aan reservetoegang",стан:"в-чинних",ціль:"[data-herstel-reserve=\"schakel\"]",іконка:"нагадування"}]},
      "поради":{стан:"в-чинних",цілі:{0:"#herstel-overzicht",1:"#herstel-sleutelverlies"}}
    }
  };
  // Кожна з 43 груп і 153 дій має власне, перевірене за змістом призначення.
  const піктограмиГруп={
    personalization:{"переходи":"блоки","особисте":"керування"},
    menu:{"піктограми":"піктограма","панель":"панель","швидкий-доступ":"зафіксувати","розташування":"розташування","сповіщення":"сповіщення","швидкодія":"завантаження","видимість":"видимість","додаткове":"керування"},
    themes:{"режим":"місяць","розклад":"сонце","палітра":"палітра","акцент":"палітра"},
    languages:{"мова":"мова"},
    widgets:{"створення":"додати","вигляд":"блоки"},
    sharing:{"запрошення":"запрошення","посилання":"посилання","чинні":"користувачі"},
    identities:{"зв'язки":"посвідчення","профіль":"особа"},
    account:{"особа":"світлина","стан":"перевірка","простори":"простір","видалення":"смітник","експорт":"дані"},
    sessions:{"цей-пристрій":"пристрій","активні":"сеанси","гості":"гість","сповіщення":"сповіщення"},
    methods:{"основні":"гугл","пароль":"пароль","захист":"захист","додаткові":"блоки"},
    security:{"ключі":"ключдоступу","другий-чинник":"автентифікатор","резервні-коди":"коди","шифрування":"шифрування","гостьові-коди":"гість"},
    recovery:{"засоби":"відновлення","сценарії":"допомога","поради":"захист"}
  };
  const піктограмиДій={
    personalization:{"переходи":["меню","палітра","мова","блоки","запрошення","посвідчення"],"особисте":["щільність","рух"]},
    menu:{
      "піктограми":["піктограма","палітра"],
      "панель":["панель","наведення","дотик"],
      "швидкий-доступ":["додати","прибрати","перемістити","піктограма","клавіатура"],
      "розташування":["розташування","прозорість","збільшити","перемістити","повернути"],
      "сповіщення":["сповіщення","лічильник","підказка","підсвітка","нагадування","час","місяць","час","час","сповіщення"],
      "швидкодія":["завантаження","переходи","заздалегідь","дослід","заздалегідь","шифрування"],
      "видимість":["видимість","піктограма","захист"],
      "додаткове":["панель","піктограма","зафіксувати","підсвітка"]
    },
    themes:{"режим":["місяць"],"розклад":["сонце","місце","місце","час","час","скасувати"],"палітра":["палітра"],"акцент":["палітра","ефекти"]},
    languages:{"мова":["мова"]},
    widgets:{"створення":["простір","джерело","блоки","назва","опис","посилання","розмір","додати"],"вигляд":["видимість","блоки"]},
    sharing:{"запрошення":["права","простір","лист","права","запрошення"],"посилання":["час","посилання"],"чинні":["користувачі","прибрати"]},
    identities:{"зв'язки":["сеанси","ключдоступу","захист","відновлення"],"профіль":["особа","посвідчення"]},
    account:{"особа":["світлина","смітник"],"стан":["пошта","сховище","пристрій","оновити"],"простори":["простір","архів"],"видалення":["попередження","смітник"],"експорт":["дані","завантаження"]},
    sessions:{"цей-пристрій":["пристрій","попередження"],"активні":["оновити","вихід","вихід"],"гості":["гість"],"сповіщення":["сповіщення"]},
    methods:{"основні":["гугл","ключдоступу","автентифікатор"],"пароль":["пароль","пароль","перевірка","смітник"],"захист":["коди","шифрування","гість"],"додаткові":["майкрософт","діскорд","телеграм","епл","ватсап","смс"]},
    security:{
      "ключі":["ключдоступу","додати","нотатка","історія","прибрати","довіра"],
      "другий-чинник":["автентифікатор","автентифікатор"],
      "резервні-коди":["коди","додати","завантаження","перевірка","повернути"],
      "шифрування":["ключ","захист","замок","відмикання","відновлення","шифрування"],
      "гостьові-коди":["коди","нотатка","права","строк","одинраз","зчитування","час","історія","прибрати"]
    },
    recovery:{"засоби":["коди","автентифікатор"],"сценарії":["втрата","ключдоступу","автентифікатор","коди"],"поради":["перевірка","попередження"]}
  };
  function знакМожливості(розділ,групаId,номер=null){
    const назва=номер===null?піктограмиГруп[розділ]?.[групаId]:піктограмиДій[розділ]?.[групаId]?.[номер];
    // САЙТ: без змістовної піктограми — нейтральний знак, а не збій усієї картки (тест перевіряє повноту окремо).
    if(!назва)return піктограмаЗаСуттю("інструмент");
    return піктограмаЗаСуттю(назва);
  }
  const відкритіМожливості=new Set();
  const відкритіПідгрупиМожливостей=new Set();
  function tekenМайбутніМожливості(розділ){
    const nl=preferences.lang==="nl";
    const групи=(реєстрНалаштувань[розділ]||[]).filter(г=>!вжеОформленіГрупи[розділ]?.includes(г.id)).map(г=>{
      // САЙТ: стани й цілі з живої карти; додані рядки (нові можливості) мають власну піктограму.
      const сайт=станНаСайті[розділ]?.[г.id]||{};
      const рядки=[...г.рядки.map((р,первіснийНомер)=>({...р,первіснийНомер})),...(сайт.додати||[]).map(р=>({...р,первіснийНомер:null}))]
        .map(р=>{
          const рідний=р.первіснийНомер!==null;
          // Пріоритет стану: окремий рядок живої карти → стан групи на сайті → власний стан рядка → стан групи з макета.
          const стан=рідний?(сайт.рядки?.[р.первіснийНомер]||сайт.стан||р.стан||г.стан):(р.стан||сайт.стан||г.стан);
          // IDENTITEIT-015: «назви» — чесна назва рядка на карті, коли текст дизайну v49 суперечить станові (дані дизайну не змінюємо).
          const назва=рідний?сайт.назви?.[р.первіснийНомер]:null;
          return {...р,...(назва?{uk:назва.uk,nl:назва.nl}:{}),стан,ціль:(рідний&&сайт.цілі?.[р.первіснийНомер])||сайт.ціль||null};
        })
        .filter(р=>!вжеОформленіРядки[розділ]?.includes(р.uk));
      return {...г,стан:сайт.стан||г.стан,рядки};
    }).filter(г=>г.рядки.length&&!г.рядки.every(р=>р.стан==="в-чинних"));
    if(!групи.length)return '';
    // САЙТ: чесні мітки живої карти; мітки «звірити підключення» більше немає.
    const статус=стан=>стан==='власник'?(nl?'Eigenaar moet dit instellen':'Потребує налаштування власника'):стан==='заплановано'?(nl?'Nog te ontwikkelen':'Потребує розробки'):стан==='макет'?(nl?'Alleen ontwerp':'Лише макет'):стан==='частково'?(nl?'Deels beschikbaar':'Частково реалізовано'):стан==='недоступно'?(nl?'Niet beschikbaar':'Недоступно'):(nl?'Werkt':'Працює');
    const клас=стан=>стан==='в-чинних'||стан==='наявне'?'werkt':стан==='власник'?'eigenaar':стан==='частково'?'deels':стан==='недоступно'?'nee':стан==='макет'?'ontwerp':'gepland';
    const рядок=(р,і,г)=>{
      const знак=р.іконка?піктограмаЗаСуттю(р.іконка):знакМожливості(розділ,г.id,р.первіснийНомер);
      const мітка='<small class="future-option-status future-stand-'+клас(р.стан)+'">'+статус(р.стан)+'</small>';
      const назва='<span class="future-option-name">'+veiligeTekstРеєстру(nl?р.nl:р.uk)+'</span>';
      // Робоче або частково робоче місце з відомою ціллю — кнопка переходу до справжнього налаштування.
      if(р.ціль&&(р.стан==='в-чинних'||р.стан==='частково'||р.стан==='власник')){
        const ціль=р.ціль.includes('|')?р.ціль:розділ+'|'+р.ціль;
        const підказка=р.стан==='власник'?(nl?'Opent de echte instelling; daar staat wat de site-eigenaar eerst moet instellen (sleutels, schakelaar of recht).':'Відкриває справжнє налаштування; там пояснено, що спершу має налаштувати власник сайту (ключі, перемикач або право).'):nl?'Opent de echte instelling in «Huidige instellingen»; wijzigingen daar gelden meteen voor uw account.':'Відкриває справжнє налаштування в блоці «Чинні налаштування»; зміни там одразу діють для вашого облікового запису.';
        return '<button type="button" class="future-option future-option-go" data-kaart-ga="'+veiligeTekstРеєстру(ціль)+'" title="'+veiligeTekstРеєстру(підказка)+'"><span class="future-option-mark">'+знак+'</span>'+назва+мітка+'<span class="future-option-open">'+(nl?'Openen':'Відкрити')+'</span></button>';
      }
      return '<div class="future-option"><span class="future-option-mark">'+знак+'</span>'+назва+мітка+'</div>';
    };
    const перелік=групи.map((г,і)=>{
      const назва=veiligeTekstРеєстру(nl?г.nl:г.uk),пояснення=veiligeTekstРеєстру(nl?г.поясненняNl:г.поясненняUk);
      const значок='<span class="future-group-glyph">'+знакМожливості(розділ,г.id)+'</span>';
      const вміст='<div class="future-options">'+г.рядки.map((р,j)=>рядок(р,j,г)).join('')+'</div>';
      if(г.рядки.length<=3)return '<div class="future-group future-group-short"><div class="future-group-head">'+значок+'<span class="future-group-copy"><strong>'+назва+'</strong><small>'+пояснення+'</small></span><span class="future-status future-stand-'+клас(г.стан)+'">'+статус(г.стан)+'</span></div>'+вміст+'</div>';
      const ід=розділ+':'+г.id;
      return '<details class="future-group" data-future-group="'+ід+'"'+(відкритіПідгрупиМожливостей.has(ід)?' open':'')+'><summary class="future-group-head">'+значок+'<span class="future-group-copy"><strong>'+назва+'</strong><small>'+пояснення+'</small></span><span class="future-status future-stand-'+клас(г.стан)+'">'+статус(г.стан)+'</span><span class="future-chevron">'+(typeof chevronIcon==='undefined'?'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m5 7.5 5 5 5-5"/></svg>':chevronIcon)+'</span></summary>'+вміст+'</details>';
    }).join('');
    const стрілка=typeof chevronIcon==='undefined'?'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m5 7.5 5 5 5-5"/></svg>':chevronIcon;
    return '<details class="future-section" data-future-section="'+розділ+'"'+(відкритіМожливості.has(розділ)?' open':'')+'>'+
      '<summary class="future-section-head"><span class="future-section-flower" aria-hidden="true">'+піктограмаЗаСуттю("інструмент")+'</span>'+
        '<span class="future-section-copy"><strong>'+(nl?'Ontwikkelkaart':'Карта розвитку')+'</strong><p>'+(nl?'Wat al werkt, opent u met één klik in de echte instellingen; wat deels klaar is of nog ontwikkeld wordt, staat erbij. Deze kaart zelf wijzigt uw account niet.':'Що вже працює — відкривається одним натиском у справжніх налаштуваннях; поруч — що працює частково і що ще в розробці. Сама карта обліковий запис не змінює.')+'</p></span>'+
        '<span class="future-section-chevron" aria-hidden="true">'+стрілка+'</span></summary>'+
      '<div class="future-section-content"><div class="future-groups">'+перелік+'</div></div></details>';
  }

  luister(doc,'toggle',event=>{
    if(event.target.matches?.('[data-future-section]')){
      const розділ=event.target.dataset.futureSection;
      if(event.target.open)відкритіМожливості.add(розділ);
      else відкритіМожливості.delete(розділ);
      return;
    }
    if(event.target.matches?.('[data-future-group]')){
      const ід=event.target.dataset.futureGroup;
      if(event.target.open)відкритіПідгрупиМожливостей.add(ід);
      else відкритіПідгрупиМожливостей.delete(ід);
      return;
    }
    const blok=event.target.closest?.('[data-register-group]');
    if(!blok)return;
    if(blok.open)відкритіГрупиРеєстру.add(blok.dataset.registerGroup);
    else відкритіГрупиРеєстру.delete(blok.dataset.registerGroup);
  },true);

  luister(doc,'click',event=>{
    const schakel=event.target.closest('[data-register-switch]');
    if(schakel){const aan=schakel.getAttribute('aria-checked')!=='true';schakel.setAttribute('aria-checked',String(aan));showToast(написиРеєстру[preferences.lang].toast);return;}
    const keuze=event.target.closest('[data-register-choice]');
    if(keuze){
      const sleutel=keuze.dataset.registerChoice,index=Number(keuze.dataset.registerIndex);
      вибірЗразкаРеєстру.set(sleutel,index);
      keuze.closest('.register-choices').querySelectorAll('[data-register-choice]').forEach(b=>{const gekozen=b===keuze;b.classList.toggle('selected',gekozen);b.setAttribute('aria-pressed',String(gekozen));});
      showToast(написиРеєстру[preferences.lang].toast);return;
    }
    // САЙТ: перехід із живої карти до справжнього налаштування (функцію надає двигун сайту).
    const карта=event.target.closest('[data-kaart-ga]');
    if(карта){const [розділКарти,...решта]=карта.dataset.kaartGa.split('|');if(typeof відкритиНаСайті==='function')відкритиНаСайті(розділКарти,решта.join('|'));return;}
    const overgang=event.target.closest('[data-register-go]');
    if(overgang){const id=overgang.dataset.registerGo;openInlineSettings(id,{toggle:false});byId(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
    const knop=event.target.closest('[data-register-all]');
    if(knop){
      const bloks=[...root.querySelectorAll('.register-catalog[data-register-section="'+knop.dataset.registerAll+'"] .register-group')];
      const openen=bloks.some(b=>!b.open);
      bloks.forEach(b=>{b.open=openen;if(openen)відкритіГрупиРеєстру.add(b.dataset.registerGroup);else відкритіГрупиРеєстру.delete(b.dataset.registerGroup);});
      knop.textContent=написиРеєстру[preferences.lang][openen?'hideAll':'showAll'];return;
    }
    if(event.target.closest('[data-register-action]'))showToast(написиРеєстру[preferences.lang].toast);
  });

  luister(doc,'change',event=>{
    if(event.target.matches('[data-register-field],[data-register-range]'))showToast(написиРеєстру[preferences.lang].toast);
  });


  // ───────── drawer.js ─────────
  // Inline settings for every section. Deliberately disconnected from account APIs.
  const expandedSections=new Set();
  const demoValues={};
  // Reserve the mini-browser for controls whose result changes the look of the
  // workspace. Account, access and security tasks need room for the actual form.
  const visualPreviewSections=new Set(["personalization","menu","themes","widgets"]);

  const optionIconNames={
    personalization:["піктограма","щільність","рух"],menu:["підсвітка","підказка"],
    themes:["місяць","палітра","ефекти"],languages:["мова"],
    widgets:["видимість","розмір","додати"],sharing:["видимість","посилання","запрошення"],
    identities:["особа","посвідчення"],account:["особа","дані","попередження"],
    sessions:["пристрій","сповіщення","історія"],methods:["гугл","ключдоступу","захист"],
    security:["захист","шифрування","гість"],recovery:["коди","нагадування","попередження"]
  };
  function optionSvg(sectionId,index){
    const name=optionIconNames[sectionId]?.[index];
    if(!name)throw new Error("Не визначено піктограму для "+sectionId+" / "+index);
    return піктограмаЗаСуттю(name);
  }

  const демоДоСайту={sharing:".settings-sharing",account:"",sessions:"",methods:"#aanmeldmethoden-google",security:"#aanmeldmethoden-2fa",recovery:"#aanmeldmethoden-herstel",identities:""};
  const демоТипи=new Set(["toggle","action","profile","export","choice","range","info","warning"]);
  function чеснийЕлемент(control,i,sectionId,ціль,пояснення,кнопка){
    const nl=preferences.lang==="nl";
    if(пояснення)control={...control,note:escapeMarkup(nl?пояснення.nl:пояснення.uk)};
    const підказка=nl?"Dit is een voorbeeld uit het ontwerp. De knop opent de echte instelling, waar wijzigingen meteen gelden.":"Це приклад із макета. Кнопка відкриває справжнє налаштування, де зміни діють одразу.";
    return '<div class="drawer-control-card control-'+control.type+' mq-demo-eerlijk">'+
      '<div class="drawer-control-top"><span class="drawer-control-glyph">'+optionSvg(sectionId,i)+'</span><div class="drawer-control-copy"><strong>'+control.label+' <span class="mq-demo-label">'+(nl?"Voorbeeld":"Приклад вигляду")+'</span></strong><p>'+control.note+'</p></div>'+
      '<button type="button" class="future-option-open mq-demo-open" data-kaart-ga="'+escapeMarkup(sectionId+"|"+ціль)+'" title="'+escapeMarkup(підказка)+'">'+(кнопка?escapeMarkup(nl?кнопка.nl:кнопка.uk):(nl?"Echte instelling":"Справжнє налаштування"))+'</button></div></div>';
  }
  // САЙТ (IDENTITEIT-015): пояснення там, де справжнього вимикача на сайті свідомо немає.
  const ЧЕСНО={
    "menu-0":[{uk:"У меню сайту активний розділ підсвічується завжди: так видно, де ви зараз, і це потрібно програмам читання з екрана. Тому окремого вимикача немає. Вигляд і поведінку меню змінюють у «Налаштування меню».",nl:"In het menu van de site is het actieve onderdeel altijd gemarkeerd: zo ziet u waar u bent, en schermlezers hebben het nodig. Daarom is er geen aparte schakelaar. Het uiterlijk en gedrag van het menu stelt u in bij «Menu-instellingen»."},{uk:"Налаштування меню",nl:"Menu-instellingen"},"#menu-modus"],
    "menu-1":[{uk:"У меню сайту назва пункту з'являється підказкою завжди, коли меню згорнуте до піктограм: без неї піктограма нічого не каже. Тому окремого вимикача немає. Згорнуте, розгорнуте чи автоматичне меню обирають у «Налаштування меню».",nl:"In het menu van de site verschijnt de naam altijd als hint wanneer het menu tot pictogrammen is ingeklapt: zonder hint zegt een pictogram niets. Daarom is er geen aparte schakelaar. Ingeklapt, uitgeklapt of automatisch kiest u bij «Menu-instellingen»."},{uk:"Налаштування меню",nl:"Menu-instellingen"},"#menu-modus"],
    "widgets-0":[{uk:"Загального вимикача блоків немає, щоб випадково не сховати весь простір. Блоки ховають і показують по одному в самому просторі: «Мій простір» → кнопка «Налаштувати».",nl:"Er is geen algemene schakelaar voor blokken, zodat u niet per ongeluk de hele werkruimte verbergt. Blokken verbergt en toont u één voor één in de werkruimte zelf: «Mijn ruimte» → knop «Aanpassen»."},{uk:"Відкрити простір",nl:"Werkruimte openen"},"dienst:hub"],
    "widgets-1":[{uk:"Тут лише зразок. Розмір і порядок ваших справжніх блоків змінюють у самому просторі: «Мій простір» → кнопка «Налаштувати»; там же видно справжні блоки.",nl:"Hier staat alleen een voorbeeld. Grootte en volgorde van uw echte blokken wijzigt u in de werkruimte zelf: «Mijn ruimte» → knop «Aanpassen»; daar ziet u ook uw echte blokken."},{uk:"Відкрити простір",nl:"Werkruimte openen"},"dienst:hub"],
    // IDENTITEIT-015 (apparaten-uitvoer): демо-елементи «Дані й експорт» і «Сповіщення про новий вхід» ведуть до справжніх блоків.
    "account-1":[{uk:"Тут лише зразок вибору. Справжнє вивантаження — у «Чинних налаштуваннях» → «Ваші дані»: формат JSON або ZIP із CSV на кожну таблицю, без секретів; перед вивантаженням сайт попросить підтвердити, що це ви.",nl:"Hier staat alleen een voorbeeld. De echte export staat in «Huidige instellingen» → «Uw gegevens»: JSON of ZIP met een CSV per tabel, zonder geheimen; vóór de export vraagt de site te bevestigen dat u het bent."},{uk:"Вивантажити дані",nl:"Gegevens exporteren"},"#gegevensuitvoer"],
    "sessions-1":[{uk:"Тут лише зразок. Справжній вибір «Завжди / Вимкнено» і перелік відомих пристроїв — у «Чинних налаштуваннях» → «Попереджати про новий пристрій»; вибір діє на всіх ваших пристроях.",nl:"Hier staat alleen een voorbeeld. De echte keuze «Altijd / Uit» en de lijst van bekende apparaten staan in «Huidige instellingen» → «Waarschuwen bij een nieuw apparaat»; de keuze geldt op al uw apparaten."},{uk:"Справжнє налаштування",nl:"Echte instelling"},"#sessies-nieuw-apparaat"],
    "identities-1":[{uk:"Позначку технічного режиму вимкнути не можна: вона не дає виконати дію керування сайтом, думаючи, що ви у звичайному просторі. Колір і згортання технічної смуги налаштовуються на самій смузі (значок налаштувань), коли технічний простір увімкнено — через меню облікового запису.",nl:"De markering van de technische modus kan niet uit: ze voorkomt dat u een beheeractie uitvoert terwijl u denkt in de gewone ruimte te zijn. Kleur en inklappen van de technische band stelt u op de band zelf in (instellingenpictogram) wanneer de technische ruimte aan staat — via het accountmenu."},{uk:"Меню облікового запису",nl:"Accountmenu"},"accountmenu:"],
  };
  function карткаПростору(control,i,sectionId){
    const nl=preferences.lang==="nl";
    const uitleg=nl?"Gewone of technische ruimte van dit account. De schakelaar is echt: de server controleert uw rechten; zonder toestemming ziet u waarom.":"Звичайний чи технічний простір цього облікового запису. Тумблер справжній: права перевіряє сервер; без дозволу ви побачите причину.";
    return '<div class="drawer-control-card control-wide mq-echt-kaart" data-echt-kaart="'+sectionId+'-'+i+'">'+
      '<div class="drawer-control-top"><span class="drawer-control-glyph">'+optionSvg(sectionId,i)+'</span><div class="drawer-control-copy"><strong>'+control.label+'</strong><p>'+escapeMarkup(uitleg)+'</p></div></div>'+
      '<div class="drawer-control-widget"><div class="mq-echt mq-ruimtewissel" data-echt="ruimtewissel"></div></div></div>';
  }
  function drawerControl(control,i,sectionId){
    if(sectionId==="identities"&&i===0)return карткаПростору(control,i,sectionId); // САЙТ (IDENTITEIT-015)
    const чесно=ЧЕСНО[sectionId+"-"+i];
    if(чесно)return чеснийЕлемент(control,i,sectionId,чесно[2],чесно[0],чесно[1]);
    if(Object.prototype.hasOwnProperty.call(демоДоСайту,sectionId)&&демоТипи.has(control.type))return чеснийЕлемент(control,i,sectionId,демоДоСайту[sectionId]);
    if(sectionId==="themes"&&control.type==="theme")return чеснийЕлемент({...control,type:"theme"},i,sectionId,"#thema-modus-kop");
    if(sectionId==="widgets"&&control.type==="action")return чеснийЕлемент(control,i,sectionId,".settings-form");
    const key=sectionId+"-"+i,type=control.type,t=ui();
    const current=demoValues[key];
    let widget="";
    if(type==="toggle"){
      const selected=current===undefined?control.initial:current;
      widget='<button class="drawer-toggle '+(selected?"on":"")+'" data-toggle-demo="'+key+'" aria-label="'+control.label+'" aria-pressed="'+selected+'"><span></span></button>';
    }else if(type==="compact"){
      widget='<button class="drawer-toggle '+(preferences.compact?"on":"")+'" data-drawer-compact aria-label="'+control.label+'" aria-pressed="'+preferences.compact+'"><span></span></button>';
    }else if(type==="navstyle"){
      widget='<div class="drawer-choice"><button data-nav-style="classic" class="'+(preferences.navStyle==="classic"?"selected":"")+'">'+t.navClassic+'</button><button data-nav-style="pills" class="'+(preferences.navStyle==="pills"?"selected":"")+'">'+t.navPills+'</button></div>';
    }else if(type==="choice"){
      const selected=current??0;
      widget='<div class="drawer-choice">'+control.options.map((label,idx)=>'<button class="'+(idx===selected?"selected":"")+'" data-choice-group="'+key+'" data-choice-index="'+idx+'">'+label+'</button>').join("")+'</div>';
    }else if(type==="positions"){
      widget='<div class="drawer-positions">'+["left","right","top","bottom"].map(pos=>'<button data-pos="'+pos+'" class="'+(pos===preferences.position?"selected":"")+'"><span class="dock-diagram dock-'+pos+'"></span>'+t.positions[pos]+'</button>').join("")+'</div>';
    }else if(type==="theme"){
      widget='<div class="drawer-choice theme-illustrated"><button data-theme="dark" class="'+(preferences.theme==="dark"?"selected":"")+'"><span class="theme-miniature theme-miniature-dark"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 16a8.4 8.4 0 0 1-12-12 8.4 8.4 0 1 0 12 12Z"/></svg></span><span>'+t.dark+'</span></button><button data-theme="light" class="'+(preferences.theme==="light"?"selected":"")+'"><span class="theme-miniature theme-miniature-light"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg></span><span>'+t.light+'</span></button></div>';
    }else if(type==="accent"){
      widget='<div class="swatches drawer-swatches">'+["violet","cyan","pink","amber"].map(c=>'<button data-accent="'+c+'" class="'+(обранийАкцент()===c?"selected":"")+'" aria-pressed="'+(обранийАкцент()===c)+'" aria-label="'+t.colors[c]+'"></button>').join("")+'</div>';
    }else if(type==="language"){
      widget='<div class="drawer-choice language-illustrated"><button data-demo-lang="uk" class="'+(preferences.lang==="uk"?"selected":"")+'"><span class="language-flag language-flag-uk" aria-hidden="true"></span><span>Українська</span></button><button data-demo-lang="nl" class="'+(preferences.lang==="nl"?"selected":"")+'"><span class="language-flag language-flag-nl" aria-hidden="true"></span><span>Nederlands</span></button></div>';
    }else if(type==="range"){
      const value=current??control.value;
      widget='<div class="drawer-range"><input type="range" min="0" max="100" value="'+value+'" data-range-demo="'+key+'" aria-label="'+control.label+'"><output>'+value+'%</output></div>';
    }else if(type==="profile"){
      const value=current??(preferences.lang==="uk"?"Павло":"Pavlo");
      widget='<label class="inline-profile-field"><span>'+t.profileName+'</span><input type="text" maxlength="42" data-profile-demo="'+key+'" value="'+escapeMarkup(value)+'" autocomplete="off" spellcheck="false"><small>'+t.demoOnly+'</small></label>';
    }else if(type==="export"){
      widget='<div class="inline-export-tools"><div class="drawer-choice export-formats">'+["JSON","CSV"].map((format,idx)=>'<button data-choice-group="'+key+'" data-choice-index="'+idx+'" class="'+((current??0)===idx?"selected":"")+'"><span class="export-format-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h7l5 5v14a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5"/>'+(idx===0?'<path d="m10 12-2 2 2 2m4-4 2 2-2 2"/>':'<path d="M8 12h8M8 16h8m-5-5v7"/>')+'</svg></span><span>'+format+'</span></button>').join("")+'</div><button class="export-sample" data-demo-action="'+key+'"><svg class="export-action-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13m-5-5 5 5 5-5M4 17v3h16v-3"/></svg><span>'+t.prepareCopy+'</span></button></div>';
    }else if(type==="action"){
      widget='<button class="drawer-action-button" data-demo-action="'+key+'" aria-label="'+control.label+'">'+піктограмаЗаСуттю(optionIconNames[sectionId][i])+'</button>';
    }else if(type==="warning"){
      widget='<span class="drawer-warning-icon">!</span>';
    }else{
      widget='<span class="drawer-info-icon">ⓘ</span>';
    }
    const fullWidth=["positions","choice","navstyle","theme","accent","language","range","profile","export"].includes(type);
    return '<div class="drawer-control-card control-'+type+' '+(fullWidth?"control-wide ":"")+'">' +
      '<div class="drawer-control-top"><span class="drawer-control-glyph">'+optionSvg(sectionId,i)+'</span><div class="drawer-control-copy"><strong>'+control.label+'</strong><p>'+control.note+'</p></div>'+(!fullWidth?widget:"")+'</div>'+
      (fullWidth?'<div class="drawer-control-widget">'+widget+'</div>':"")+'</div>';
  }

  function escapeMarkup(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
  function previewValue(row,i,sectionId){
    const key=sectionId+"-"+i, value=demoValues[key], t=ui();
    if(row.type==="toggle"||row.type==="compact"){
      const on=row.type==="compact"?preferences.compact:(value===undefined?row.initial:value);
      return '<span class="mini-live-switch '+(on?"on":"")+'"><i></i></span>';
    }
    if(row.type==="choice")return '<span class="mini-live-chip">'+row.options[value??0]+'</span>';
    if(row.type==="positions")return '<span class="mini-live-chip">'+t.positions[preferences.position]+'</span>';
    if(row.type==="navstyle")return '<span class="mini-live-chip">'+(preferences.navStyle==="pills"?t.navPills:t.navClassic)+'</span>';
    if(row.type==="theme")return '<span class="mini-live-chip">'+(preferences.theme==="dark"?t.dark:t.light)+'</span>';
    if(row.type==="accent")return '<span class="mini-live-color" style="background:var(--global)"></span>';
    if(row.type==="language")return '<span class="mini-live-chip">'+(preferences.lang==="uk"?"УК":"NL")+'</span>';
    if(row.type==="range")return '<span class="mini-live-chip">'+(value??row.value)+'%</span>';
    if(row.type==="profile")return '<span class="mini-live-chip">'+escapeMarkup(value??(preferences.lang==="uk"?"Павло":"Pavlo"))+'</span>';
    if(row.type==="export")return '<span class="mini-live-chip">'+["JSON","CSV"][value??0]+'</span>';
    if(row.type==="warning")return '<span class="mini-live-alert">!</span>';
    if(row.type==="action")return '<span class="mini-live-link">'+arrowIcon+'</span>';
    return '<span class="mini-live-info">ⓘ</span>';
  }

  function drawerPreview(s){
    const t=ui(),rows=locales[preferences.lang].panels[s.id];
    const miniIcons=[...new Set(["intro",s.id,"themes","sharing","security"])];
    const activeHighlight=demoValues["menu-0"]!==false;
    const names=new Map([["intro",t.beginning],...localizedSections().map(item=>[item.id,item.short])]);
    const dense=demoValues["personalization-1"]===1, colorful=demoValues["personalization-0"]===1;
    const motionOff=demoValues["personalization-2"]===false;
    return '<div class="live-stage-head"><div><span class="live-pulse"></span><strong>'+t.previewSample+'</strong></div><small>'+t.savedLocally+'</small></div>'+
      '<p class="live-stage-note">'+t.drawerVisualNote+'</p>'+
      '<div class="drawer-browser-demo mini-pos-'+preferences.position+' mini-theme-'+preferences.theme+(preferences.compact?" mini-compact":"")+(dense?" mini-dense":"")+(colorful?" mini-colorful":"")+(motionOff?" mini-motion-off":"")+'">'+
        '<div class="drawer-browser-chrome"><div><i></i><i></i><i></i></div><span>'+t.workspace+' / '+t.settings+'</span><b>✦</b></div>'+
        '<div class="drawer-browser-workspace"><div class="drawer-browser-nav">'+miniIcons.map(id=>'<span class="'+(activeHighlight&&id===s.id?"current":"")+'">'+iconSvg(id)+'<small class="mini-nav-label">'+names.get(id)+'</small></span>').join("")+'</div>'+
          '<div class="drawer-browser-page"><div class="drawer-preview-label">'+s.kicker+'</div><h3>'+s.name+'</h3><p>'+s.description+'</p>'+
            rows.map((row,i)=>'<div class="drawer-browser-row"><span class="mini-row-glyph">'+optionSvg(s.id,i)+'</span><span class="mini-row-label">'+row.label+'</span>'+previewValue(row,i,s.id)+'</div>').join("")+
          '</div></div></div>'+
      '<div class="drawer-preview-caption"><span>✦</span><div><strong>'+t.drawerVisualTitle+'</strong><p>'+t.savedLocally+'</p></div></div>';
  }
  function refreshLivePreview(){
    const list=localizedSections();
    for(const id of expandedSections){
      if(!visualPreviewSections.has(id))continue;
      const preview=root.querySelector('#inline-'+id+' .inline-preview-body');
      const section=list.find(item=>item.id===id);
      if(preview&&section)preview.innerHTML=drawerPreview(section);
    }
  }

  // Immediate controls visibly update the concept without an extra preview panel.
  function syncDirectVisuals(){
    const page=root;
    page.classList.toggle("demo-colorful-icons",demoValues["personalization-0"]===1);
    page.classList.toggle("demo-dense",demoValues["personalization-1"]===1);
    page.classList.toggle("demo-motion-off",demoValues["personalization-2"]===false);
    page.classList.toggle("demo-widgets-hidden",demoValues["widgets-0"]===false);
    page.classList.toggle("demo-widgets-large",demoValues["widgets-1"]===1);
    page.classList.toggle("demo-technical-identity",demoValues["identities-0"]===1);
    page.classList.toggle("demo-hide-identity-badge",demoValues["identities-1"]===false);
    const badge=root.querySelector("#identities .identity-mode-badge");
    if(badge)badge.textContent=demoValues["identities-0"]===1?locales[preferences.lang].art.tech:locales[preferences.lang].art.personal;
  }

  function renderInlinePanel(id){
    const s=localizedSections().find(section=>section.id===id);
    if(!s)return;
    const t=ui();
    const panel=byId("inline-"+id);
    if(!panel)return;
    const visualPreview=visualPreviewSections.has(id);
    panel.innerHTML=
      '<div class="inline-settings-header"><div class="inline-settings-identity"><span class="inline-settings-section-icon'+(id==='identities'?' profile-avatar':'')+'"'+(id==='identities'?' data-profile-photo':'')+'>'+(id==='identities'?'':iconSvg(id))+'</span><div><span class="inline-settings-eyebrow">'+t.inlineEyebrow+'</span><h3>'+s.name+'</h3></div></div><button class="inline-close-button" data-close-inline="'+id+'" aria-label="'+t.collapseSection+'">'+t.collapseSection+' <span class="inline-close-chevron" aria-hidden="true">'+chevronIcon+'</span></button></div>'+
      '<div class="inline-settings-workspace '+(visualPreview?'has-preview':'no-preview')+'">'+
        '<div class="inline-settings-controls"><div class="drawer-controls-list">'+locales[preferences.lang].panels[id].map((control,i)=>drawerControl(control,i,id)).join("")+'</div></div>'+
        (visualPreview?'<aside class="inline-live-panel" aria-label="'+t.previewSample+'"><div class="inline-preview-body">'+drawerPreview(s)+'</div></aside>':'')+
      '</div>'+tekenЧинні(id)+tekenМайбутніМожливості(id); // САЙТ: справжня панель під елементами макета
    if(selectedInlineOptions.has(id))markInlineOption(id,selectedInlineOptions.get(id),false);
    оновитиФотоПрофілю();
  }
  const selectedInlineOptions=new Map();
  function updateInlineTriggers(id){
    const section=byId(id),opened=expandedSections.has(id);
    if(!section)return;
    section.classList.toggle("section-expanded",opened);
    section.querySelectorAll('.open-detail').forEach(button=>{
      button.setAttribute("aria-expanded",String(opened));
      if(button.classList.contains("text-link"))button.firstChild.textContent=(opened?ui().collapseSection:ui().openSettings)+" ";
    });
  }
  function markInlineOption(id,index,scroll){
    const section=byId(id),panel=byId("inline-"+id);
    if(!section||!panel)return;
    section.querySelectorAll('.detail-item').forEach((button,i)=>button.classList.toggle('detail-selected',i===index));
    const cards=panel.querySelectorAll('.drawer-control-card');
    cards.forEach((card,i)=>card.classList.toggle('inline-spotlight',i===index));
    const selected=cards[index];
    if(selected&&scroll){
      selected.setAttribute('tabindex','-1');
      selected.focus({preventScroll:true});
      selected.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
    }
  }
  function openInlineSettings(id,{index=null,toggle=false}={}){
    if(!sections.some(s=>s.id===id))return;
    if(expandedSections.has(id)&&toggle){closeInlineSettings(id);return;}
    const newlyOpened=!expandedSections.has(id);
    expandedSections.add(id);
    const panel=byId("inline-"+id);
    if(!panel)return;
    if(index!==null)selectedInlineOptions.set(id,index);
    if(newlyOpened){panel.hidden=false;renderInlinePanel(id);opties.bijOpenen(id);requestAnimationFrame(()=>panel.classList.add('entered'));}
    updateInlineTriggers(id);
    if(index!==null)markInlineOption(id,index,true);
    else if(newlyOpened){panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  }
  function closeInlineSettings(id){
    const panel=byId("inline-"+id);
    if(!panel)return;
    expandedSections.delete(id);
    selectedInlineOptions.delete(id);
    panel.classList.remove('entered');
    panel.hidden=true;
    const section=byId(id);
    section?.querySelectorAll('.detail-selected').forEach(el=>el.classList.remove('detail-selected'));
    updateInlineTriggers(id);
    section?.querySelector('.text-link')?.focus({preventScroll:true});
  }
  function rehydrateInlineSettings(){
    for(const id of expandedSections){
      const panel=byId('inline-'+id);
      if(panel){panel.hidden=false;panel.classList.add('entered');renderInlinePanel(id);updateInlineTriggers(id);}
    }
  }

  function isIconNav(){
    return preferences.iconOnly || ["top","bottom"].includes(preferences.position) || preferences.compact ||
      ((breed()<=730)&&["left","right"].includes(preferences.position));
  }
  function showAnchorTooltip(el){
    if(!el||!isIconNav()||(demoValues["menu-1"]===false&&!["top","bottom"].includes(preferences.position)))return;
    const tooltip=byId("anchorTooltip"),rect=el.getBoundingClientRect();
    tooltip.textContent=el.dataset.tooltip;
    tooltip.hidden=false;
    tooltip.dataset.side=preferences.position;
    const tw=tooltip.offsetWidth,th=tooltip.offsetHeight,pad=9;
    let x,y;
    if(preferences.position==="left"){x=rect.right+12;y=rect.top+(rect.height-th)/2;}
    else if(preferences.position==="right"){x=rect.left-tw-12;y=rect.top+(rect.height-th)/2;}
    else if(preferences.position==="top"){x=rect.left+(rect.width-tw)/2;y=rect.bottom+12;}
    else{x=rect.left+(rect.width-tw)/2;y=rect.top-th-12;}
    tooltip.style.left=Math.max(pad,Math.min(innerWidth-tw-pad,x))+"px";
    tooltip.style.top=Math.max(pad,Math.min(innerHeight-th-pad,y))+"px";
    tooltip.classList.add("show");
  }
  function hideAnchorTooltip(){
    const tooltip=byId("anchorTooltip");
    tooltip.classList.remove("show");
    tooltip.hidden=true;
  }

  luister(doc,"click",event=>{
    const close=event.target.closest("[data-close-inline]");
    if(close){closeInlineSettings(close.dataset.closeInline);return;}
    const toggle=event.target.closest("[data-toggle-demo]");
    if(toggle){const key=toggle.dataset.toggleDemo;demoValues[key]=toggle.getAttribute("aria-pressed")!=="true";toggle.setAttribute("aria-pressed",String(demoValues[key]));toggle.classList.toggle("on",demoValues[key]);refreshLivePreview();syncDirectVisuals();if(key==="menu-0")syncActive();if(key==="menu-1"&&!demoValues[key])hideAnchorTooltip();if(key==="personalization-2")доСайту({beweging:demoValues[key]?"systeem":"minder"});return;}
    if(event.target.closest("[data-drawer-compact]")){setCompact(!preferences.compact);root.querySelectorAll("[data-drawer-compact]").forEach(b=>b.classList.toggle("on",preferences.compact));return;}
    const choice=event.target.closest("[data-choice-group]");
    if(choice){demoValues[choice.dataset.choiceGroup]=Number(choice.dataset.choiceIndex);root.querySelectorAll('[data-choice-group="'+choice.dataset.choiceGroup+'"]').forEach(button=>button.classList.toggle("selected",button===choice));refreshLivePreview();syncDirectVisuals();const ck=choice.dataset.choiceGroup;if(ck==="personalization-0")доСайту({icoonStijl:demoValues[ck]===1?"kleur":"klassiek"});if(ck==="personalization-1")доСайту({dichtheid:ЩІЛЬНІСТЬ[demoValues[ck]]||"normaal"});return;}
    if(event.target.closest("[data-demo-action]")){showToast(ui().actionDemo);return;}
  });
  luister(doc,"input",event=>{
    const profile=event.target.closest("[data-profile-demo]");
    if(profile){demoValues[profile.dataset.profileDemo]=profile.value;refreshLivePreview();return;}
    const range=event.target.closest("[data-range-demo]");
    if(range){
      demoValues[range.dataset.rangeDemo]=Number(range.value);
      range.parentElement.querySelector("output").textContent=range.value+"%";
      root.style.setProperty("--effect-intensity",String(range.value/100));
      if(range.dataset.rangeDemo==="themes-2")доСайту({effecten:Number(range.value)});
      refreshLivePreview();
    }
  });


  // ───────── app.js ─────────
  const sections = [
    {
      id:"personalization", group:"personal", number:"01", name:"Персоналізація", short:"Персоналізація", icon:"✦",
      kicker:"ВАШ ПОЧЕРК", title:"Простір, який відчувається вашим.",
      description:"Зовнішній вигляд, поведінка інтерфейсу та особисті вподобання — зібрані в одному красивому місці.",
      accent:"violet", art:"personalization",
      details:[
        {icon:"◈",label:"Меню й піктограми",note:"Порядок, кольори та характер навігації"},
        {icon:"☼",label:"Теми й атмосфера",note:"Світло, контраст і ваша палітра"},
        {icon:"⊞",label:"Віджети та блоки",note:"Робочий простір без зайвого шуму"}
      ]
    },
    {
      id:"menu", group:"personal", number:"02", name:"Меню", short:"Меню", icon:"☷",
      kicker:"ПОВНА СВОБОДА", title:"Навігація під вашу руку.",
      description:"Розташування меню, швидкий доступ, стиль іконок та делікатні анімації. Точне налаштування без складності.",
      accent:"cyan", art:"menu",
      details:[
        {icon:"↔",label:"Розташування",note:"Ліворуч · праворуч · верх · низ"},
        {icon:"◌",label:"Швидкий доступ",note:"Ваші улюблені дії під рукою"},
        {icon:"⋮",label:"Вигляд панелі",note:"Розгорнутий, компактний або док"}
      ],
      special:"dock"
    },
    {
      id:"themes", group:"personal", number:"03", name:"Теми", short:"Теми", icon:"◑",
      kicker:"ГРА СВІТЛА", title:"Настрій у кожному пікселі.",
      description:"Оберіть темний камерний простір або легку світлу атмосферу. Відтінки, які підтримують концентрацію.",
      accent:"pink", art:"themes",
      details:[
        {icon:"◕",label:"Темна",note:"Глибина, спокій та кінематографічний контраст"},
        {icon:"◒",label:"Світла",note:"Повітря, м'які тіні та чистота"},
        {icon:"✳",label:"Акцент",note:"Особистий колір для активних елементів"}
      ],
      special:"theme"
    },
    {
      id:"languages", group:"personal", number:"04", name:"Мови", short:"Мови", icon:"文",
      kicker:"ВАШ ГОЛОС", title:"Зрозуміло з першого погляду.",
      description:"Мова інтерфейсу — це частина комфорту. Швидке перемикання між українською та нідерландською.",
      accent:"mint", art:"languages",
      details:[
        {icon:"УК",label:"Українська",note:"Основна мова інтерфейсу"},
        {icon:"NL",label:"Nederlands",note:"Для повсякденного життя в Бельгії"}
      ],
      special:"language"
    },
    {
      id:"widgets", group:"personal", number:"05", name:"Віджети", short:"Віджети", icon:"⊞",
      kicker:"ЗБЕРІТЬ СВОЄ", title:"Маленькі деталі. Велика різниця.",
      description:"Побудуйте робочий простір із корисних блоків. Обирайте те, що важливе саме сьогодні.",
      accent:"amber", art:"widgets",
      details:[
        {icon:"⊞",label:"Додавання блоків",note:"Сервіси, інструменти та зовнішні посилання"},
        {icon:"▥",label:"Компонування",note:"Зручні розміри й порядок елементів"}
      ]
    },
    {
      id:"sharing", group:"social", number:"06", name:"Спільний доступ", short:"Доступ", icon:"◎",
      kicker:"ВАШІ КОРДОНИ", title:"Діліться лише тим, чим хочете.",
      description:"Прозорі права доступу, чіткі запрошення й повне розуміння того, хто що бачить.",
      accent:"blue", art:"sharing",
      details:[
        {icon:"♙",label:"Доступ за акаунтом",note:"Запрошення та керовані ролі"},
        {icon:"↗",label:"Доступ за посиланням",note:"Окремі параметри та обмеження"}
      ]
    },
    {
      id:"identities", group:"social", number:"07", name:"Ідентичності", short:"Ідентичності", icon:"◇",
      kicker:"ДВА РЕЖИМИ", title:"Кожна роль на своєму місці.",
      description:"Особистий і технічний профілі залишаються виразно відокремленими — і в логіці, і у візуальному стилі.",
      accent:"violet", art:"identities",
      details:[
        {icon:"◉",label:"Звичайний профіль",note:"Щоденні інструменти та особистий простір"},
        {icon:"⌘",label:"Технічний профіль",note:"Окремий візуальний режим для адміністрування"}
      ]
    },
    {
      id:"account", group:"account", number:"08", name:"Акаунт і дані", short:"Акаунт і дані", icon:"▣",
      kicker:"ВАШІ ДАНІ", title:"Усе важливе — під контролем.",
      description:"Профіль, дані та відповідальні дії згруповано за змістом. Важливі рішення ніколи не губляться серед дрібних перемикачів.",
      accent:"cyan", art:"account",
      details:[
        {icon:"▧",label:"Профіль",note:"Основні відомості вашого акаунта"},
        {icon:"⇩",label:"Дані й експорт",note:"Перегляд та керування вашими даними"},
        {icon:"!",label:"Небезпечні дії",note:"Відокремлена зона з підтвердженням"}
      ]
    },
    {
      id:"sessions", group:"account", number:"09", name:"Сесії та пристрої", short:"Пристрої", icon:"▤",
      kicker:"ВАШІ ПІДКЛЮЧЕННЯ", title:"Видно кожен пристрій.",
      description:"Активні сесії, історія та підключені пристрої — візуально зрозумілі з першого погляду.",
      accent:"mint", art:"sessions",
      details:[
        {icon:"▱",label:"Пристрої",note:"Тип, браузер і остання активність"},
        {icon:"◷",label:"Сесії",note:"Огляд та керування входами"}
      ]
    },
    {
      id:"methods", group:"account", number:"10", name:"Способи входу", short:"Способи входу", icon:"⌁",
      kicker:"БЕЗ ЗАЙВИХ ПАРОЛІВ", title:"Безпечний вхід. Менше тертя.",
      description:"Google, ключі доступу та способи підтвердження важливих дій — кожен на своєму місці.",
      accent:"pink", art:"methods",
      details:[
        {icon:"G",label:"Google",note:"Основний спосіб входу"},
        {icon:"✳",label:"Ключі доступу",note:"Підтвердження захищених дій"}
      ]
    },
    {
      id:"security", group:"security", number:"11", name:"Безпека", short:"Безпека", icon:"⬡",
      kicker:"ТИХА ВПЕВНЕНІСТЬ", title:"Захист, який можна зрозуміти.",
      description:"Двофакторна автентифікація, шифрування, ключі та дозволи — без прихованих деталей і двозначності.",
      accent:"blue", art:"security",
      details:[
        {icon:"⊙",label:"Підтвердження входу",note:"TOTP і ключі доступу"},
        {icon:"⌘",label:"Шифрування",note:"Ключі та межі захисту даних"},
        {icon:"♙",label:"Гостьовий доступ",note:"Обмежені права й історія"}
      ]
    },
    {
      id:"recovery", group:"security", number:"12", name:"Відновлення доступу", short:"Відновлення", icon:"✣",
      kicker:"ПЛАН Б", title:"Спокій навіть у непередбачуваному.",
      description:"Відновлення доступу повинно бути передбачуваним: із чіткими поясненнями, ризиками та шляхами дій.",
      accent:"amber", art:"recovery",
      details:[
        {icon:"⌑",label:"Коди відновлення",note:"Резервний спосіб підтвердження"},
        {icon:"◈",label:"Рекомендації",note:"Що зберегти та як не втратити доступ"}
      ]
    }
  ];


  const body = root;
  const STORAGE_KEY = "identiteit-maquette-voorkeuren";
  let preferences = {position:"right",compact:false,navStyle:"classic",iconOnly:false,theme:"dark",accent:"violet",lang:"uk"};
  try {
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved) preferences={...preferences,...JSON.parse(saved)};
    else if((breed()<=730)) preferences.position="bottom";
  } catch {}
  // САЙТ: мову й тему визначає сайт; у макеті вони були власними перемикачами.
  preferences.lang=opties.lang;
  preferences.theme=opties.licht?"light":"dark";
  // Version 32 stored icons as an exclusive style. Migrate without losing the
  // user's selection; button content and surface are independent from now on.
  if(preferences.navStyle==="icons"){
    preferences.navStyle="classic";
    preferences.iconOnly=true;
  }
  preferences.iconOnly=Boolean(preferences.iconOnly);
  preferences.railMode=preferences.railMode|| (preferences.compact?"collapsed":"expanded");
  if(!["expanded","collapsed","auto"].includes(preferences.railMode))preferences.railMode="expanded";
  preferences.compact=preferences.railMode!=="expanded";
  // САЙТ (IDENTITEIT-015): елементи макета показують і змінюють справжні налаштування сайту (обліковий запис), не демо-значення.
  const ПОЗ_САЙТ={left:"links",right:"rechts",top:"boven",bottom:"onder"},ПОЗ_МАКЕТ={links:"left",rechts:"right",boven:"top",onder:"bottom"};
  const РЕЖИМ_САЙТ={expanded:"open",collapsed:"dicht",auto:"auto"},РЕЖИМ_МАКЕТ={open:"expanded",dicht:"collapsed",auto:"auto"};
  const ЩІЛЬНІСТЬ=["normaal","compact","ruim"];
  let сайтАкцент=opties.weergave?opties.weergave.accent:preferences.accent;
  let сайтГотовий=false;
  const обранийАкцент=()=>opties.weergave?сайтАкцент:preferences.accent;
  function демоЗСайту(w){
    if(!w)return;
    demoValues["personalization-0"]=w.icoonStijl==="kleur"?1:0;
    demoValues["personalization-1"]=Math.max(0,ЩІЛЬНІСТЬ.indexOf(w.dichtheid||"normaal"));
    demoValues["personalization-2"]=w.beweging!=="minder";
    demoValues["themes-2"]=typeof w.effecten==="number"?w.effecten:45;
    сайтАкцент=w.accent;
    if(w.accent)preferences.accent=w.accent;
    if(ПОЗ_МАКЕТ[w.positie])preferences.position=ПОЗ_МАКЕТ[w.positie];
    if(РЕЖИМ_МАКЕТ[w.modus]){preferences.railMode=РЕЖИМ_МАКЕТ[w.modus];preferences.compact=preferences.railMode!=="expanded";}
  }
  демоЗСайту(opties.weergave);
  function доСайту(patch){if(сайтГотовий&&typeof opties.bijWeergave==="function")opties.bijWeergave(patch);}
  // Вже намальовані елементи підлаштовуються без перемальовування карток (справжні панелі під ними не перемонтовуються).
  function синхронізуватиДемо(){
    root.querySelectorAll("[data-choice-group]").forEach(b=>{const k=b.dataset.choiceGroup;if(k in demoValues)b.classList.toggle("selected",Number(b.dataset.choiceIndex)===demoValues[k]);});
    root.querySelectorAll("[data-toggle-demo]").forEach(b=>{const k=b.dataset.toggleDemo;if(k in demoValues){b.setAttribute("aria-pressed",String(demoValues[k]));b.classList.toggle("on",demoValues[k]);}});
    root.querySelectorAll("[data-range-demo]").forEach(r=>{const k=r.dataset.rangeDemo;if(k in demoValues&&doc.activeElement!==r){r.value=String(demoValues[k]);const o=r.parentElement?.querySelector("output");if(o)o.textContent=demoValues[k]+"%";}});
    syncDirectVisuals();syncControlStates();refreshLivePreview();
  }
  const expandedNavGroups=new Set(["personal"]);
  let horizontalNavTrigger=null;
  const isHorizontalNav=()=>["top","bottom"].includes(preferences.position);
  const isAutoRail=()=>body.classList.contains("rail-smart-condensed")||preferences.railMode==="auto";
  const adaptiveNavToggle=byId("adaptiveNavToggle");
  const adaptiveNavScrim=byId("adaptiveNavScrim");
  const adaptiveNavEdge=byId("adaptiveNavEdge");
  let drawerOpenedByControl=false;
  function placeAdaptiveNavToggle(){
    const balk=byId("mqSectieBalk");
    if(balk)balk.dataset.zijde=preferences.position==="right"?"right":"left";
  }
  function setAdaptiveNavOpen(open,{explicit=false}={}){
    const visible=Boolean(open&&body.classList.contains("rail-smart-condensed"));
    if(!visible)drawerOpenedByControl=false;
    else if(explicit)drawerOpenedByControl=true;
    body.classList.toggle("rail-smart-open",visible);
    adaptiveNavScrim.hidden=!visible;
    byId("anchorRail").setAttribute("aria-hidden",String(!visible&&body.classList.contains("rail-smart-condensed")));
    adaptiveNavToggle.setAttribute("aria-expanded",String(visible));
    adaptiveNavToggle.setAttribute("aria-label",preferences.lang==="nl"?(visible?"Pagina-onderdelen sluiten":"Pagina-onderdelen openen"):(visible?"Закрити розділи сторінки":"Відкрити розділи сторінки"));
    adaptiveNavToggle.title=adaptiveNavToggle.getAttribute("aria-label");
    const edgeLabel=preferences.lang==="nl"?"Zijmenu openen":"Відкрити бічне меню";
    adaptiveNavEdge.setAttribute("aria-label",edgeLabel);
    adaptiveNavEdge.title=edgeLabel;
    if(byId("railExpand"))syncRailCompactButton();
  }
  let stableSideNavWidth=212;
  function naturalDrawerWidth(){
    if(preferences.iconOnly)return 88;
    // The compact drawer must fit the longest button, including closed groups.
    // Measure text at its actual font size instead of the clipped panel width.
    const meter=document.createElement("span");
    meter.style.cssText="position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none";
    root.append(meter);
    let widest=0;
    byId("railItems").querySelectorAll(".anchor-link,.nav-group-toggle").forEach(button=>{
      const label=button.querySelector(".anchor-name,.nav-group-name");
      if(!label)return;
      const type=getComputedStyle(label);
      meter.style.font=`${type.fontStyle} ${type.fontWeight} ${type.fontSize} ${type.fontFamily}`;
      meter.textContent=label.textContent.trim();
      const labelWidth=meter.getBoundingClientRect().width;
      // Icon, spacing, button padding, optional chevron, panel padding/border.
      widest=Math.max(widest,labelWidth+25+9+28+26+(button.classList.contains("nav-group-toggle")?21:0));
    });
    meter.remove();
    return Math.ceil(Math.max(146,widest));
  }
  function naturalSideNavWidth(){
    // Measure the actual, unclipped labels (including closed groups). The
    // compact rail and temporary drawer must never influence this footprint.
    if(!isHorizontalNav()&&!body.classList.contains("rail-compact")&&!body.classList.contains("rail-smart-condensed")){
      const rail=byId("anchorRail");
      const hiddenGroups=[...rail.querySelectorAll(".nav-subitems")]
        .filter(group=>getComputedStyle(group).display==="none");
      hiddenGroups.forEach(group=>{group.style.display="flex";});
      const widths=[...rail.querySelectorAll(".anchor-link,.nav-group-toggle")].map(button=>{
        const oldWidth=button.style.width,oldMax=button.style.maxWidth;
        button.style.width="max-content";
        button.style.maxWidth="none";
        const width=button.getBoundingClientRect().width;
        button.style.width=oldWidth;
        button.style.maxWidth=oldMax;
        return width;
      });
      hiddenGroups.forEach(group=>{group.style.removeProperty("display");});
      // Preserve the same footprint while switching classic/pills, whose font
      // metrics may differ by a pixel or two. A language change resets it.
      if(widths.some(Boolean))stableSideNavWidth=Math.max(stableSideNavWidth,195,Math.ceil(Math.max(...widths)+24));
    }
    return stableSideNavWidth;
  }
  function syncAdaptiveNavigation(){
    placeAdaptiveNavToggle();
    // A breakpoint depends on the reserved footprint, never on button style
    // or whether the pointer temporarily expanded an auto-mode rail.
    const eligible=!isHorizontalNav();
    const navWidth=preferences.iconOnly?60:preferences.railMode==="expanded"?naturalSideNavWidth():60;
    const appLane=0;
    const layoutGutters=breed()<=730?26:95;
    const projectedCanvas=breed()-appLane-navWidth-19-layoutGutters;
    const condense=eligible&&projectedCanvas<680;
    const wasCondensed=body.classList.contains("rail-smart-condensed");
    body.classList.toggle("rail-smart-condensed",condense);
    body.classList.toggle("rail-mode-auto",condense||preferences.railMode==="auto");
    if(condense){
      const drawerWidth=naturalDrawerWidth()+"px";
      if(body.style.getPropertyValue("--smart-drawer-width")!==drawerWidth)
        body.style.setProperty("--smart-drawer-width",drawerWidth);
    }
    if(!condense&&body.classList.contains("rail-smart-open"))setAdaptiveNavOpen(false);
    setAdaptiveNavOpen(body.classList.contains("rail-smart-open"));
    byId("anchorRail").setAttribute("aria-hidden",String(condense&&!body.classList.contains("rail-smart-open")));
    // No persistent rail variant is meaningful when the menu is an overlay.
    const modePicker=byId("navSettings").querySelector(".nav-mode-picker");
    if(condense&&modePicker.contains(document.activeElement)){
      byId("closeNavSettings").focus({preventScroll:true});
    }
    modePicker.hidden=condense;
    byId("adaptiveModeDescription").hidden=!condense;
    byId("adaptiveModeDescription").textContent=ui().adaptiveNavModeOnly;
    const selectedMode=condense?"auto":preferences.railMode;
    root.querySelectorAll("[data-rail-mode]").forEach(button=>{
      const on=button.dataset.railMode===selectedMode;
      button.classList.toggle("selected",on);
      button.setAttribute("aria-pressed",String(on));
    });
    byId("navSettings").querySelector(":scope > p").textContent=condense?ui().adaptiveNavHelp:ui().dragHelp;
    if(wasCondensed!==condense){
      applyRailCollapsed(condense||preferences.railMode==="collapsed"||preferences.railMode==="auto"&&!railPointerInside);
    }
  }
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {} };
  const pill = text => '<span class="art-pill">'+text+'</span>';
  const arrowIcon='<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 5 7 7-7 7"/></svg>';
  const chevronIcon='<svg class="expand-chevron" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7.5 5 5 5-5"/></svg>';
  const ui = () => locales[preferences.lang].ui;
  const localizedSections = () => sections.map(base=>{
    const nl=locales[preferences.lang].sections?.[base.id];
    if(!nl)return base;
    return {...base,...nl,details:base.details.map((d,i)=>({...d,label:nl.details[i][0],note:nl.details[i][1]}))};
  });
  const iconPaths = {
    intro:'<path d="m3 11 9-8 9 8v9H3z"/><path d="M9 20v-7h6v7"/>',
    personalization:'<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
    menu:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M6 8h.01M6 12h.01M12 9h6M12 13h5"/>',
    themes:'<path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2a2 2 0 0 1-2-2V6a3 3 0 0 0-3-3Z"/><circle cx="7" cy="10" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="7" cy="15" r=".8"/>',
    languages:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 6-5 12 0 18M12 3c5 6 5 12 0 18"/>',
    widgets:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sharing:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    identities:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M18 3l2 2m0-2-2 2"/>',
    account:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M5.8 16a3.5 3.5 0 0 1 6.4 0M15 8h4M15 12h4M15 16h3"/>',
    sessions:'<rect x="2" y="4" width="15" height="12" rx="2"/><path d="M6 20h7M9.5 16v4"/><rect x="18" y="9" width="4" height="10" rx="1"/>',
    methods:'<circle cx="8" cy="15" r="4"/><path d="M11 12 21 2M16 7l3 3M18 5l3 3"/>',
    security:'<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    recovery:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6m-5.6 5.6-3.6 3.6"/>'
  };
  function iconSvg(id){return '<svg class="semantic-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">'+(iconPaths[id]||iconPaths.intro)+'</svg>';}

  function visual(type){
    const a=locales[preferences.lang].art;
    switch(type){
      case "personalization": return '<div class="art art-personalization"><div class="art-halo"></div><div class="floating-window main-window"><div class="window-top"><i></i><i></i><i></i></div><div class="window-row"><span></span><b></b></div><div class="window-row second"><span></span><b></b></div><div class="window-row third"><span></span><b></b></div></div><div class="floating-window smaller-window"><span>✦</span><strong>'+a.makeYours+'</strong><small>'+a.personalSpace+'</small></div><span class="art-spark spark-a">✳</span><span class="art-spark spark-b">✦</span></div>';
      case "menu": return '<div class="art art-menu"><div class="art-orbit">'+["меню","палітра","блоки","користувачі","захист","пристрій"].map(ключ=>'<span>'+піктограмаЗаСуттю(ключ)+'</span>').join("")+'</div><div class="art-middle">'+a.nav+'<br><b>360°</b></div><div class="art-menu-label">'+a.anyEdge+'</div></div>';
      case "themes": return '<div class="art art-themes"><div class="theme-sample theme-sample-back"><span class="theme-sample-dot"></span><i></i><i></i></div><div class="theme-sample theme-sample-front"><div class="sample-moon">◑</div><strong>'+a.beautifully+'</strong><div class="sample-pills"><span></span><span></span><span></span></div></div></div>';
      case "languages": return '<div class="art art-languages"><div class="language-card language-back">'+a.hello1+' <span>'+a.hello2+'</span></div><div class="language-card language-front"><small>'+a.commonSpace+'</small><strong>'+a.greeting+'</strong><span>UA ↔ NL</span></div><span class="language-ring"></span></div>';
      case "widgets": return '<div class="art art-widgets"><div class="widget-art-grid"><div><small>'+a.widgets+'</small><span>'+піктограмаЗаСуттю("строк")+'</span><small>'+a.widgetCalendar+'</small></div><div><span>'+піктограмаЗаСуттю("пошта")+'</span><small>'+a.widgetMail+'</small></div><div><span>'+піктограмаЗаСуттю("нотатка")+'</span><small>'+a.widgetNotes+'</small></div><div><span>'+піктограмаЗаСуттю("додати")+'</span><small>'+a.create+'</small></div></div></div>';
      case "sharing": return '<div class="art art-sharing"><div class="sharing-permissions-card"><div class="sharing-card-head"><span>'+піктограмаЗаСуттю("захист")+'</span><strong>'+a.sharingTitle+'</strong></div><div class="sharing-person-row"><div class="sharing-person-avatar profile-avatar" data-profile-photo></div><span>'+a.sharingOwner+'</span><b>'+піктограмаЗаСуттю("перевірка")+'</b></div><div class="sharing-person-row"><div class="sharing-person-avatar sharing-invite-avatar">'+піктограмаЗаСуттю("запрошення")+'</div><span>'+a.sharingInvite+'</span><em>'+a.sharingView+'</em></div><div class="sharing-link-row"><span>'+піктограмаЗаСуттю("посилання")+'</span><strong>'+a.sharingLink+'</strong><small>'+a.sharingOff+'</small></div><div class="sharing-card-foot">'+піктограмаЗаСуттю("права")+'<span>'+a.sharingSecure+'</span></div></div><div class="sharing-art-footer">'+a.verified+'</div></div>';
      case "identities": return '<div class="art art-identities"><div class="identity-card identity-back"><small>'+a.tech+'</small><strong class="identity-tech-mark"><svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="13" width="22" height="22" rx="5"/><path d="M18 5v8M30 5v8M18 35v8M30 35v8M5 18h8M5 30h8M35 18h8M35 30h8"/><path d="m20 24 3 3 6-7"/></svg></strong><span>'+a.control+'</span></div><div class="identity-card identity-front"><small>'+a.personal+'</small><div class="identity-avatar profile-avatar" data-profile-photo></div><strong data-profile-name>'+naamVoorProfiel()+'</strong><span>'+a.daily+'</span></div><span class="identity-mode-badge">'+a.personal+'</span></div>';
      case "account": return '<div class="art art-account"><div class="account-outer-ring"></div><div class="account-folder"><div class="folder-tab"></div><span>'+піктограмаЗаСуттю("дані")+'</span><strong>'+a.yourData+'</strong><small>'+a.inHands+'</small></div><div class="account-stamp">'+a.private+'</div></div>';
      case "sessions": return '<div class="art art-sessions"><div class="device-screen"><div class="device-notch"></div><div class="device-wave"></div><span>'+піктограмаЗаСуттю("сеанси")+'</span></div><div class="device-phone"><div class="device-notch"></div><span>'+піктограмаЗаСуттю("перевірка")+'</span></div><div class="device-label">'+a.devices+'</div></div>';
      case "methods": return '<div class="art art-methods"><div class="methods-art-card"><div class="methods-art-row"><span class="methods-art-brand">'+піктограмаЗаСуттю("гугл")+'</span><span><strong>Google</strong><small>'+a.methodsPrimary+'</small></span>'+піктограмаЗаСуттю("перевірка")+'</div><div class="methods-art-divider"><span></span><small>'+a.methodsNote+'</small><span></span></div><div class="methods-art-row"><span class="methods-art-key">'+піктограмаЗаСуттю("ключдоступу")+'</span><span><strong>'+a.passkey+'</strong><small>'+a.methodsConfirm+'</small></span>'+піктограмаЗаСуттю("захист")+'</div></div></div>';
      case "security": return '<div class="art art-security"><div class="security-ring ring-outer"></div><div class="security-ring ring-inner"></div><div class="shield-shape"><span>'+піктограмаЗаСуттю("захист")+'</span></div><span class="security-art-label security-label-one">'+піктограмаЗаСуттю("автентифікатор")+' '+a.securityCheck+'</span><span class="security-art-label security-label-two">'+піктограмаЗаСуттю("замок")+' '+a.securityEncrypt+'</span></div>';
      case "recovery": return '<div class="art art-recovery"><div class="recovery-sun"></div><div class="recovery-ticket"><span>'+a.recovery+'</span><div class="recovery-art-code">'+піктограмаЗаСуттю("коди")+'<strong>•••• ••••</strong></div><small>'+a.backupCodes+'</small></div><span class="recovery-star">'+піктограмаЗаСуттю("відновлення")+'</span></div>';
      default: return "";
    }
  }

  // Immediate switches and short choices stay on their cards. Multi-step account,
  // access and security workspaces retain their expandable detail panels.
  // The rail gear remains the single home for positioning and menu style.
  // Уже оформлені швидкі налаштування завжди залишаються на своїх місцях.
  const directSettingsSections=new Set(["personalization","menu","themes","languages","widgets","identities"]);
  // САЙТ: блок справжніх налаштувань у стилі «Можливостей для доопрацювання» макета; гніздо .mq-echt заповнює застосунок.
  const openeЧинні=new Set();
  function tekenЧинні(id){
    const nl=preferences.lang==="nl";
    const kop=nl?"Huidige instellingen":"Чинні налаштування";
    const uitleg=nl?"De echte instellingen van uw account: wijzigingen hier gelden meteen en volgen uw rechten.":"Справжні налаштування вашого облікового запису: зміни тут діють одразу й за вашими правами.";
    return '<details class="future-section mq-echt-blok" data-echt-blok="'+id+'"'+(openeЧинні.has(id)?' open':'')+'>'+
      '<summary class="future-section-head"><span class="future-section-flower" aria-hidden="true">⚙</span><div class="future-section-copy"><strong>'+kop+'</strong><p>'+uitleg+'</p></div><span class="future-section-chevron" aria-hidden="true">'+chevronIcon+'</span></summary>'+
      '<div class="future-section-content"><div class="mq-echt" data-echt="'+id+'"></div></div></details>';
  }
  function directSettings(s){
    if(!directSettingsSections.has(s.id))return "";
    return '<div class="direct-settings" role="group" aria-label="'+s.name+'">'+
      locales[preferences.lang].panels[s.id].map((control,i)=>drawerControl(control,i,s.id)).join("")+
      '</div>';
  }

  function renderCard(s){
    const expandable=!directSettingsSections.has(s.id);
    return '<section class="setting-section accent-'+s.accent+'" id="'+s.id+'" data-section="'+s.id+'">' +
      '<div class="section-card">' +
        '<div class="setting-main">' +
          '<div class="setting-topline"><span class="setting-index">'+s.number+' / 12</span><span class="setting-divider"></span><span>'+s.kicker+'</span></div>' +
          '<div class="setting-symbol'+(s.id==="identities"?' profile-avatar':'')+'"'+(s.id==="identities"?' data-profile-photo':'')+'>'+(s.id==="identities"?'':iconSvg(s.id))+'</div>' +
          '<h2>'+s.title+'</h2><p>'+s.description+'</p>' +
          (expandable?'<button class="text-link open-detail" data-for="'+s.id+'" aria-controls="inline-'+s.id+'" aria-expanded="false">'+ui().openSettings+' <span>'+chevronIcon+'</span></button>':'') +
        '</div>' +
        visual(s.art) +
      '</div>' +
      directSettings(s)+
      (!expandable?tekenЧинні(s.id)+tekenМайбутніМожливості(s.id):'')+ // САЙТ: справжня панель під елементами макета
      (expandable?'<div id="inline-'+s.id+'" class="section-inline-settings" data-inline-section="'+s.id+'" role="region" aria-label="'+s.name+'" hidden></div>':'')+
      '</section>';
  }

  function renderStatic(){
    const t=ui();
    const write=(selector,value,html=false)=>{
      const el=root.querySelector(selector);
      if(el){if(html)el.innerHTML=value;else el.textContent=value;}
    };
    
    
    write("#breadcrumbWorkspace",t.workspace);
    write(".breadcrumbs strong",t.settings);
    write(".concept-pill",'<span class="concept-dot"></span>'+t.concept,true);
    write(".search-action span",preferences.lang==="nl"?"Zoeken in «Mijn Ruimte»…":"Пошук у «Мій простір»…");
    write("#mqSectieNaam",preferences.lang==="nl"?"Onderdelen":"Розділи");
    write("#mqPaginaNavNoot",preferences.lang==="nl"?"Positie en gedrag gelden ook voor het menu van de site en worden in uw account bewaard. Stijl en inhoud van de knoppen gelden alleen voor de navigatie van deze pagina op dit apparaat.":"Положення й поведінка діють і на меню сайту та зберігаються в обліковому записі. Стиль і вміст кнопок — лише навігація цієї сторінки на цьому пристрої.");
    write("#mqPaginaNavKnop",preferences.lang==="nl"?"Menu-instellingen van de site":"Налаштування меню сайту");
    const zoekKnop=byId("openSearch");if(zoekKnop){const zl=preferences.lang==="nl"?"Zoeken in «Mijn Ruimte» (Ctrl K)":"Пошук у «Мій простір» (Ctrl K)";zoekKnop.setAttribute("aria-label",zl);zoekKnop.title=zl;}
    const posKnop=byId("mqSectiePositie");if(posKnop){const pl=preferences.lang==="nl"?"Positie van paginanavigatie":"Розташування навігації сторінки";posKnop.setAttribute("aria-label",pl);posKnop.title=pl;}
    write(".hero-eyebrow",'<span class="line"></span>'+t.heroEyebrow+'<span class="line"></span>',true);
    write(".hero h1",t.heroTitle[0]+'<br><em>'+t.heroTitle[1]+'</em>',true);
    write(".hero-copy p",t.heroDesc);
    write(".primary-button",t.startSetup+' <span>'+arrowIcon+'</span>',true);
    write(".ghost-button",t.navPlacement+' <span>⌘</span>',true);
    write(".hero-foot span:first-child",'<b>12</b> '+t.sectionCount,true);
    write(".hero-foot span:nth-of-type(2)",t.controlCenter);
    write(".hero-foot .hero-foot-last",t.profiles);
    root.querySelectorAll(".section-overline-text").forEach((el,i)=>el.textContent=t.groups[i]);
    root.querySelectorAll(".interlude p").forEach((el,i)=>el.innerHTML=t.interludes[i][0]+' <em>'+t.interludes[i][1]+'</em>');
    write(".site-footer strong",t.workspace);
    write(".site-footer div span","Account Atelier / "+t.footer);
    write(".to-top",t.backTop);
    write(".rail-title strong",t.navigation);
    write(".rail-title small",t.dragToEdge);
    byId("railProgressGauge").setAttribute("aria-label",t.scrollProgress);
    byId("railProgressHelp").setAttribute("aria-label",preferences.lang==="nl"?"Wat betekent de voortgangscirkel?":"Що означає колова шкала?");
    byId("railProgressHelp").title=preferences.lang==="nl"?"Geeft aan welk deel van de pagina je hebt bekeken":"Показує, яку частину сторінки ви переглянули";
    write(".popover-head small",t.anchorPlacement);
    write(".popover-head strong",t.positionPrompt);
    root.querySelectorAll("#dockPicker [data-pos]").forEach(el=>{
      el.lastChild.textContent=t.positions[el.dataset.pos];
    });
    write("#navModeLabel",t.navModeLabel);
    root.querySelectorAll("[data-rail-mode]").forEach(el=>el.textContent=t.navModes[el.dataset.railMode]);
    write("#navStyleLabel",t.navStyle);
    root.querySelectorAll(".nav-style-picker [data-nav-style]").forEach(el=>el.textContent=({classic:t.navClassic,pills:t.navPills})[el.dataset.navStyle]);
    write("#navIconLabel",t.navIconLabel);
    root.querySelectorAll("[data-icon-display]").forEach(el=>el.textContent=el.dataset.iconDisplay==="icons"?t.navIcons:t.navNames);
    write(".popover-panel p",t.dragHelp);
    byId("commandInput").placeholder=t.findSection;
    write(".command-hint",t.commandHeading);
    write(".command-footer",t.choose+' <span>'+t.go+'</span>',true);
    byId("anchorRail").setAttribute("aria-label",t.navigation);
    byId("navSettings").setAttribute("aria-label",t.navPlacement);
    byId("searchOverlay").querySelector('[role="dialog"]').setAttribute("aria-label",t.quickJump);
    byId("railDrag").setAttribute("aria-label",t.dragToEdge);
    byId("openSearch").setAttribute("aria-label",t.quickJump);
    byId("railConfig").setAttribute("aria-label",t.navPlacement);
    byId("railConfig").title=t.navPlacement;
    syncRailCompactButton();
    byId("closeNavSettings").setAttribute("aria-label",t.drawerDone);
    root.querySelector(".app-rail").setAttribute("aria-label",t.workspace);
    root.querySelector(".brand-mark").setAttribute("aria-label",t.workspace);
    root.querySelector(".top-avatar").setAttribute("aria-label",preferences.lang==="nl"?"Echte profielfoto bekijken":"Переглянути справжню світлину профілю");
    root.querySelectorAll(".app-icon:not(.theme-button)").forEach((el,i)=>{
      const titles=preferences.lang==="nl"?["Instellingen","Mijn Ruimte","AI voor jou","Mail","Cloudopslag","GitHub"]:["Налаштування","Мій простір","ШІ для вас","Пошта","Хмарне сховище","GitHub"];
      el.title=titles[i];
      el.setAttribute("aria-label",titles[i]);
    });
  }
  function renderAll(){
    closeHorizontalNavMenu();
    renderStatic();
    const localized=localizedSections();
    for(const g of ["personal","social","account","security"]){
      byId("group-"+g).innerHTML=localized.filter(s=>s.group===g).map(renderCard).join("");
    }
    const navItem=(id,name)=>'<button class="anchor-link" data-jump="'+id+'" aria-label="'+name+'" data-tooltip="'+name+'"><span class="anchor-icon">'+iconSvg(id)+'</span><span class="anchor-name">'+name+'</span><span class="anchor-active-marker"></span></button>';
    const groups=[{id:"personal",icon:"personalization"},{id:"social",icon:"sharing"},{id:"account",icon:"account"},{id:"security",icon:"security"}];
    byId("railItems").innerHTML=navItem("intro",ui().beginning)+groups.map((group,index)=>{
      const label=ui().navGroups[index],opened=expandedNavGroups.has(group.id);
      return '<div class="nav-group '+(opened?'nav-group-open':'')+'" data-nav-group="'+group.id+'">'+
        '<button class="nav-group-toggle" data-nav-group-toggle="'+group.id+'" aria-expanded="'+opened+'" aria-label="'+label+'" data-tooltip="'+label+'"><span class="anchor-icon">'+iconSvg(group.icon)+'</span><span class="nav-group-name">'+label+'</span><span class="nav-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></span></button>'+
        '<div class="nav-subitems" role="group" aria-label="'+label+'">'+localized.filter(s=>s.group===group.id).map(s=>navItem(s.id,s.short)).join("")+'</div></div>';
    }).join("");
    rehydrateInlineSettings();
    root.querySelectorAll(".setting-section,.section-overline,.interlude").forEach(el=>revealObserver?.observe(el));
    syncControlStates();
    syncDirectVisuals();
    syncActive();
    syncNavGroups();
    оновитиФотоПрофілю();
    requestAnimationFrame(updatePillDimensions);
    opties.bijRender(); // САЙТ: гнізда справжніх панелей створено заново — застосунок монтує їх знову
  }

  function setPosition(position){
    if(!["left","right","top","bottom"].includes(position)) return;
    closeHorizontalNavMenu();
    body.classList.remove("rail-left","rail-right","rail-top","rail-bottom");
    body.classList.add("rail-"+position);
    preferences.position=position;
    доСайту({positie:ПОЗ_САЙТ[position]}); // САЙТ (IDENTITEIT-015): положення меню сайту
    syncRailCompactButton();
    syncNavGroups();
    root.querySelectorAll("[data-pos]").forEach(b=>b.classList.toggle("selected",b.dataset.pos===position));
    persist();
    hideAnchorTooltip();
    refreshLivePreview();
    requestAnimationFrame(updatePillDimensions);
  }
  function applyRailCollapsed(collapsed){
    body.classList.toggle("rail-compact",collapsed);
    root.querySelectorAll("[data-drawer-compact]").forEach(b=>{b.setAttribute("aria-pressed",String(collapsed));b.classList.toggle("on",collapsed);});
    syncRailCompactButton();
    requestAnimationFrame(updatePillDimensions);
  }
  let railPointerInside=false;
  let railCollapseTimer=null;
  function cancelRailAutoCollapse(){
    if(railCollapseTimer!==null){clearTimeout(railCollapseTimer);railCollapseTimer=null;}
  }
  function scheduleRailAutoCollapse(){
    cancelRailAutoCollapse();
    if(!isAutoRail()||railPointerInside||drawerOpenedByControl||!byId("navSettings").hidden)return;
    // A short grace interval tolerates movement into the adjacent controls.
    railCollapseTimer=setTimeout(()=>{
      railCollapseTimer=null;
      if(isAutoRail()&&!railPointerInside&&!drawerOpenedByControl&&byId("navSettings").hidden){
        if(body.classList.contains("rail-smart-condensed"))setAdaptiveNavOpen(false);
        applyRailCollapsed(true);
      }
    },300);
  }
  function setRailMode(mode){
    if(!["expanded","collapsed","auto"].includes(mode))return;
    if(mode!=="auto"&&body.classList.contains("rail-smart-condensed"))return;
    cancelRailAutoCollapse();
    preferences.railMode=mode;
    preferences.compact=mode!=="expanded";
    доСайту({modus:РЕЖИМ_САЙТ[mode]}); // САЙТ (IDENTITEIT-015): режим меню сайту
    body.classList.toggle("rail-mode-auto",isAutoRail());
    applyRailCollapsed(mode==="collapsed"||(mode==="auto"&&!railPointerInside&&byId("navSettings").hidden));
    root.querySelectorAll("[data-rail-mode]").forEach(button=>{
      const on=button.dataset.railMode===mode;
      button.classList.toggle("selected",on);
      button.setAttribute("aria-pressed",String(on));
    });
    persist();
    hideAnchorTooltip();
    refreshLivePreview();
    requestAnimationFrame(updatePillDimensions);
  }
  function setCompact(value){setRailMode(value?"collapsed":"expanded");}
  function setNavStyle(value){
    if(!["classic","pills"].includes(value))return;
    preferences.navStyle=value;
    body.classList.toggle("rail-pills",value==="pills");
    syncControlStates();
    persist();
    hideAnchorTooltip();
    refreshLivePreview();
    requestAnimationFrame(updatePillDimensions);
  }
  function setIconOnly(iconOnly){
    preferences.iconOnly=Boolean(iconOnly);
    body.classList.toggle("rail-icons",preferences.iconOnly);
    syncControlStates();
    persist();
    hideAnchorTooltip();
    requestAnimationFrame(updatePillDimensions);
  }
  function setTheme(theme){
    preferences.theme=theme==="light"?"light":"dark";
    body.classList.toggle("light",preferences.theme==="light");
    root.querySelectorAll("[data-theme]").forEach(b=>b.classList.toggle("selected",b.dataset.theme===preferences.theme));
    persist();
    refreshLivePreview();
  }
  function setAccent(color){
    preferences.accent=color;
    body.dataset.accent=color;
    root.querySelectorAll(".swatches [data-accent]").forEach(b=>b.classList.toggle("selected",b.dataset.accent===color));
    persist();
    refreshLivePreview();
  }
  function syncControlStates(){
    root.querySelectorAll("[data-pos]").forEach(b=>b.classList.toggle("selected",b.dataset.pos===preferences.position));
    root.querySelectorAll("[data-theme]").forEach(b=>b.classList.toggle("selected",b.dataset.theme===preferences.theme));
    root.querySelectorAll(".swatches [data-accent]").forEach(b=>{const on=b.dataset.accent===обранийАкцент();b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
    root.querySelectorAll("[data-demo-lang]").forEach(b=>b.classList.toggle("selected",b.dataset.demoLang===preferences.lang));
    root.querySelectorAll("[data-drawer-compact]").forEach(b=>b.setAttribute("aria-pressed",String(preferences.compact)));
    root.querySelectorAll("[data-nav-style]").forEach(b=>{const on=b.dataset.navStyle===preferences.navStyle;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
    root.querySelectorAll("[data-icon-display]").forEach(b=>{const on=(b.dataset.iconDisplay==="icons")===preferences.iconOnly;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
    root.querySelectorAll("[data-rail-mode]").forEach(b=>{const on=b.dataset.railMode===preferences.railMode;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
  }
  function setLang(lang){
    if(!["uk","nl"].includes(lang))return;
    preferences.lang=lang;
    stableSideNavWidth=212;
    persist();
    renderAll();
    applyRailCollapsed(preferences.railMode!=="expanded");
    if(!byId("searchOverlay").hidden)renderSearch();
  }
  setPosition(preferences.position);
  setRailMode(preferences.railMode);
  setNavStyle(preferences.navStyle);
  setIconOnly(preferences.iconOnly);
  setTheme(preferences.theme);
  setAccent(preferences.accent);
  сайтГотовий=true; // САЙТ: далі кожна зміна людини йде на сайт; початкове малювання — ні

  function showToast(message){
    const el=byId("toast");
    el.textContent=message;
    el.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(()=>el.classList.remove("show"),3600);
  }
  function відкритиНаСайті(розділ,ціль){
    if(typeof ціль==="string"&&ціль.startsWith("dienst:")){opties.bijDienst(ціль.slice(7));return;} // САЙТ (IDENTITEIT-015)
    if(ціль==="accountmenu:"){opties.bijAccountMenu();return;}
    const id=розділ==="identity"?"identities":розділ;
    if(!sections.some(s=>s.id===id))return;
    gaNaar(id,true);
    opties.bijOpenen(id);
    if(!ціль)return;
    const рух=matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";
    let спроби=0;
    const шукати=()=>{
      const гніздо=root.querySelector('.mq-echt[data-echt="'+id+'"]');
      let доціль=null;
      try{доціль=гніздо?гніздо.querySelector(ціль):null;}catch{доціль=null;}
      // Панель монтується асинхронно (портал React після bijOpenen): чекаємо до ~3 с.
      if(!доціль){if(++спроби<50)setTimeout(шукати,60);return;}
      for(let d=доціль.closest("details");d;d=d.parentElement?d.parentElement.closest("details"):null)if(!d.open)d.open=true;
      доціль.scrollIntoView({behavior:рух,block:"start"});
      const фокус=доціль.matches("summary,button,a,input,select,textarea")?доціль:(доціль.querySelector(":scope > summary")||доціль);
      if(фокус===доціль&&!доціль.hasAttribute("tabindex")&&!доціль.matches("summary,button,a,input,select,textarea"))доціль.setAttribute("tabindex","-1");
      try{фокус.focus({preventScroll:true});}catch{}
      доціль.classList.add("mq-kaart-doel");
      setTimeout(()=>доціль.classList.remove("mq-kaart-doel"),1800);
    };
    setTimeout(шукати,80);
  }
  function gaNaar(id,open){
    if(!sections.some(s=>s.id===id)){jump(id,true);return;}
    if(open){
      openeЧинні.add(id);
      if(!directSettingsSections.has(id))openInlineSettings(id);
      const blok=root.querySelector('.mq-echt-blok[data-echt-blok="'+id+'"]');
      if(blok&&!blok.open)blok.open=true;
    }
    jump(id,true);
  }
  function jump(id,stil=false){
    if(!stil&&sections.some(s=>s.id===id))opties.bijKies(id); // САЙТ: адресу сторінки змінює застосунок
    closeHorizontalNavMenu();
    setAdaptiveNavOpen(false);
    const target=byId(id);
    if(!target) return;
    const group=target.dataset.section&&sections.find(s=>s.id===id)?.group;
    if(group){expandedNavGroups.add(group);syncNavGroups();}
    target.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    closeSearch();
    closeNavSettings();
  }
  function syncActive(){
    const els=[byId("intro"),...sections.map(s=>byId(s.id))];
    let active="intro";
    for(const el of els){if(el.getBoundingClientRect().top < innerHeight*.48) active=el.id;}
    const highlight=demoValues["menu-0"]!==false;
    root.querySelectorAll(".anchor-link").forEach(b=>{let on=b.dataset.jump===active;b.classList.toggle("active",on&&highlight); b.setAttribute("aria-current",on?"location":"false");});
    const currentGroup=sections.find(s=>s.id===active)?.group;
    root.querySelectorAll(".nav-group-toggle").forEach(b=>{
      const on=b.dataset.navGroupToggle===currentGroup;
      b.classList.toggle("current-group",Boolean(on&&highlight));
      b.setAttribute("aria-current",on?"location":"false");
    });
    root.querySelectorAll("#horizontalNavPopup [data-jump]").forEach(b=>{
      const on=b.dataset.jump===active;
      b.classList.toggle("current-section",on&&highlight);
      b.setAttribute("aria-current",on?"location":"false");
    });
    const scrollable=Math.max(1,scroller().hoogte-scroller().venster);
    const pct=Math.max(0,Math.min(100,Math.round(scroller().top/scrollable*100)));
    byId("scrollProgress").style.width=pct+"%";
    byId("railProgressRing").style.strokeDashoffset=String(113.097*(1-pct/100));
    byId("railProgressGauge").setAttribute("aria-valuenow",String(pct));
    byId("railPercent").textContent=pct+"%";
    const selected=isHorizontalNav()?(currentGroup?root.querySelector('.nav-group-toggle.current-group'):root.querySelector('.anchor-link[data-jump="intro"]')):null;
    if(selected){
      const row=byId("railItems"), box=selected.getBoundingClientRect(), visible=row.getBoundingClientRect();
      if(box.left<visible.left+8)row.scrollLeft+=box.left-visible.left-12;
      else if(box.right>visible.right-8)row.scrollLeft+=box.right-visible.right+12;
    }
  }
  let ticking=false;
  luister(scrolDoel,"scroll",()=>{if(ticking)return; ticking=true;requestAnimationFrame(()=>{syncActive(); ticking=false;});},{passive:true});
  luister(window,"resize",syncActive);

  // One consistent panel icon for the header and footer. CSS mirrors/rotates it
  // to match the dock edge; the chevron itself always describes the next action.
  function railToggleSvg(collapsed){
    const chevron=collapsed?"m13 9 3 3-3 3":"m16 9-3 3 3 3";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.7"/><path d="M9 4v16"/><path d="'+chevron+'"/></svg>';
  }
  // Classic and individual-button layouts both honour the same compact switch.
  // The optional button layout always reserves its real footprint in the page.
  function syncRailCompactButton(){
    const button=byId("railExpand");
    if(!button)return;
    const collapsed=body.classList.contains("rail-compact");
    const smartDrawerOpen=body.classList.contains("rail-smart-condensed")&&body.classList.contains("rail-smart-open");
    const label=smartDrawerOpen?(preferences.lang==="nl"?"Navigatie sluiten":"Закрити навігацію"):isHorizontalNav()?(preferences.lang==="nl"?"Alle onderdelen":"Усі розділи"):(collapsed?ui().expand:ui().collapse);
    if(isHorizontalNav())button.removeAttribute("aria-pressed");
    else button.setAttribute("aria-pressed",String(collapsed));
    button.setAttribute("aria-label",label);
    button.setAttribute("aria-expanded",String(smartDrawerOpen|| (isHorizontalNav()?!byId("horizontalNavPopup").hidden:!collapsed)));
    if(isHorizontalNav()){button.setAttribute("aria-haspopup","menu");button.setAttribute("aria-controls","horizontalNavPopup");}
    else{button.removeAttribute("aria-haspopup");button.setAttribute("aria-controls","railItems");}
    button.title=label;
    button.querySelector(".rail-toggle-icon").innerHTML=isHorizontalNav()?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>':railToggleSvg(collapsed);
  }
  function updatePillDimensions(){
    if((breed()>=731)){
      const rail=byId("anchorRail").getBoundingClientRect();
      if(["left","right"].includes(preferences.position)){
        const width=naturalSideNavWidth();
        body.style.setProperty("--side-nav-width",width+"px");
        body.style.setProperty("--pill-nav-width",width+"px");
      }else if(preferences.navStyle==="pills"){
        body.style.setProperty("--pill-nav-height",Math.ceil(rail.height)+"px");
      }
    }
    syncAdaptiveNavigation();
  }
  adaptiveNavToggle.addEventListener("click",()=>{
    const opening=!body.classList.contains("rail-smart-open");
    cancelRailAutoCollapse();
    setAdaptiveNavOpen(opening,{explicit:opening});
    if(opening)byId("railExpand").focus({preventScroll:true});
  });
  adaptiveNavEdge.addEventListener("click",()=>{
    cancelRailAutoCollapse();
    setAdaptiveNavOpen(true,{explicit:true});
    byId("railExpand").focus({preventScroll:true});
  });
  adaptiveNavEdge.addEventListener("pointerenter",event=>{
    if(event.pointerType==="mouse"&&isAutoRail()&&body.classList.contains("rail-smart-condensed")){
      cancelRailAutoCollapse();
      setAdaptiveNavOpen(true);
    }
  });
  luister(doc,"pointermove",event=>{
    if(event.pointerType!=="mouse"||!isAutoRail()||
       !body.classList.contains("rail-smart-condensed")||!body.classList.contains("rail-smart-open")||
       railPointerInside||drawerOpenedByControl||!byId("navSettings").hidden)return;
    const rail=byId("anchorRail").getBoundingClientRect();
    // Leave an uninterrupted path between the screen edge and the drawer,
    // including the gap beside the permanent global app rail on the left.
    const atEdge=body.classList.contains("rail-left")?event.clientX<=rail.left+8:event.clientX>=rail.right-8;
    const atDrawer=event.clientX>=rail.left&&event.clientX<=rail.right&&
      event.clientY>=rail.top&&event.clientY<=rail.bottom;
    if(atEdge||atDrawer){cancelRailAutoCollapse();return;}
    // Resetting this timer on every pixel would keep the menu open forever
    // while the cursor moved outside it.
    if(railCollapseTimer===null)scheduleRailAutoCollapse();
  },{passive:true});
  adaptiveNavScrim.addEventListener("click",()=>{setAdaptiveNavOpen(false);adaptiveNavToggle.focus({preventScroll:true});});
  byId("railExpand").addEventListener("click",event=>{
    event.stopPropagation();
    if(body.classList.contains("rail-smart-open")){
      setAdaptiveNavOpen(false);
      adaptiveNavToggle.focus({preventScroll:true});
      return;
    }
    if(isHorizontalNav()){
      toggleHorizontalNavMenu(null,byId("railExpand"));
      return;
    }
    // In hover mode this button pins the full menu open, regardless of its
    // temporary pointer-expanded appearance.
    if(preferences.railMode==="auto"){setRailMode("expanded");return;}
    setCompact(!body.classList.contains("rail-compact"));
  });
  let edgeSwipeStart=null;
  luister(doc,"pointerdown",event=>{
    if(event.pointerType==="mouse"||!body.classList.contains("rail-smart-condensed"))return;
    const right=body.classList.contains("rail-right");
    const open=body.classList.contains("rail-smart-open");
    const edgeRect=adaptiveNavEdge.getBoundingClientRect();
    const siteLade=Boolean(root.closest(".canonical-chrome")?.classList.contains("sidebar-drawer-mode"));
    const fromEdge=!open&&(right||!siteLade)&&event.clientX>=edgeRect.left-5&&event.clientX<=edgeRect.right+5&&
      event.clientY>=edgeRect.top&&event.clientY<=edgeRect.bottom;
    const railRect=byId("anchorRail").getBoundingClientRect();
    const fromDrawer=open&&event.clientX>=railRect.left&&event.clientX<=railRect.right&&event.clientY>=railRect.top&&event.clientY<=railRect.bottom;
    if(fromEdge||fromDrawer)edgeSwipeStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY,right,open};
  },{passive:true});
  luister(doc,"pointerup",event=>{
    if(!edgeSwipeStart||event.pointerId!==edgeSwipeStart.pointerId)return;
    const swipe=edgeSwipeStart;
    edgeSwipeStart=null;
    const dx=event.clientX-swipe.x;
    const dy=event.clientY-swipe.y;
    if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy)*1.35)return;
    if(!swipe.open&& (swipe.right?dx<0:dx>0)){
      cancelRailAutoCollapse();
      setAdaptiveNavOpen(true,{explicit:true});
    }
    if(swipe.open&& (swipe.right?dx>0:dx<0))setAdaptiveNavOpen(false);
  },{passive:true});
  luister(doc,"pointercancel",()=>{edgeSwipeStart=null;},{passive:true});
  luister(window,"resize",()=>requestAnimationFrame(updatePillDimensions));
  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions));ro.observe(byId("anchorRail"));luisteraars.push(()=>ro.disconnect());}
  // САЙТ: пороги ширини макета (@media) переведено на класи кореня за шириною робочої області (не вікна).
  // Зсуви закріплених елементів: відступ робочої області від справжнього головного меню сайту (--mq-links, --mq-rechts, --mq-onder, --mq-site) і висота підсмуги розділів (--mq-boven).
  const DREMPELS=[400,420,430,440,500,600,650,720,730,731,810,900,1000,1040,1120,1150,1250,1280];
  const chrome=root.closest(".canonical-chrome");
  function zetMaten(){
    const b=breed();
    for(const n of DREMPELS){root.classList.toggle("bp-max-"+n,b<=n);root.classList.toggle("bp-min-"+n,b>=n);}
    const stijl=werkvlak?getComputedStyle(werkvlak):null;
    const maat=n=>stijl?parseFloat(stijl[n])||0:0;
    const rail=root.querySelector(".app-rail");
    const railBreed=rail&&getComputedStyle(rail).display!=="none"?rail.offsetWidth:0;
    const links=maat("paddingLeft")+railBreed, site=maat("paddingTop");
    const planck=root.querySelector(".topbar")?.offsetHeight||0;
    const sectieBalkEl=byId("mqSectieBalk");
    const sectieBalk=sectieBalkEl&&getComputedStyle(sectieBalkEl).display!=="none"?sectieBalkEl.offsetHeight:0;
    root.style.setProperty("--mq-links",links+"px");
    root.style.setProperty("--mq-site-links",maat("paddingLeft")+"px");
    root.style.setProperty("--mq-rechts",maat("paddingRight")+"px");
    root.style.setProperty("--mq-onder",maat("paddingBottom")+"px");
    root.style.setProperty("--mq-site",site+"px");
    root.style.setProperty("--mq-topbar",planck+"px");
    root.style.setProperty("--mq-boven",(site+planck+sectieBalk)+"px");
    if(rail)rail.style.left=maat("paddingLeft")+"px";
  }
  zetMaten();
  if(typeof ResizeObserver!=="undefined"){const ro2=new ResizeObserver(()=>{zetMaten();requestAnimationFrame(updatePillDimensions);});ro2.observe(root);if(werkvlak)ro2.observe(werkvlak);luisteraars.push(()=>ro2.disconnect());}
  if(chrome&&typeof MutationObserver!=="undefined"){const mo=new MutationObserver(()=>{zetMaten();requestAnimationFrame(updatePillDimensions);});mo.observe(chrome,{attributes:true,attributeFilter:["class","data-dock"]});luisteraars.push(()=>mo.disconnect());}
  luisteraars.push(()=>{cancelRailAutoCollapse();clearTimeout(showToast.timer);});
  // САЙТ: відкриті блоки «Чинні налаштування» пам'ятаємо між перемальовуваннями; відкриття монтує справжню панель.
  luister(root,"toggle",e=>{
    const blok=e.target;
    if(!(blok instanceof HTMLElement)||!blok.classList.contains("mq-echt-blok"))return;
    const id=blok.dataset.echtBlok;
    if(blok.open){openeЧинні.add(id);opties.bijOpenen(id);}else openeЧинні.delete(id);
  },true);

  const popover=byId("navSettings");
  function toggleNavSettings(){
    popover.hidden=!popover.hidden;
    if(isAutoRail()){
      if(popover.hidden)scheduleRailAutoCollapse();
      else{
        cancelRailAutoCollapse();
        if(!body.classList.contains("rail-smart-condensed"))applyRailCollapsed(false);
      }
    }
  }
  function closeNavSettings(){popover.hidden=true;scheduleRailAutoCollapse();}
  byId("railConfig").addEventListener("click",e=>{e.stopPropagation(); toggleNavSettings();});
  byId("heroNavSettings").addEventListener("click",toggleNavSettings);
  byId("mqSectiePositie")?.addEventListener("click",e=>{e.stopPropagation();toggleNavSettings();});
  byId("closeNavSettings").addEventListener("click",closeNavSettings);
  byId("railProgressHelp").addEventListener("click",()=>showToast(preferences.lang==="nl"?"De cirkel laat zien hoeveel van deze pagina je al hebt bekeken.":"Коло показує, яку частину цієї сторінки ви вже переглянули."));
  byId("anchorRail").addEventListener("pointerenter",e=>{
    if(e.pointerType==="touch")return;
    railPointerInside=true;
    // Only release a hamburger-opened drawer after the pointer reaches it.
    // The route between the header and the drawer must never auto-close it.
    drawerOpenedByControl=false;
    cancelRailAutoCollapse();
    // The narrow drawer already renders its expanded contents. Rewriting the
    // desktop compact state on hover only flips icon/text order and shifts pills.
    if(isAutoRail()&&!body.classList.contains("rail-smart-condensed"))applyRailCollapsed(false);
  });
  byId("anchorRail").addEventListener("pointerleave",e=>{
    if(e.pointerType==="touch")return;
    railPointerInside=false;
    scheduleRailAutoCollapse();
  });
  function syncNavGroups(){
    root.querySelectorAll("[data-nav-group]").forEach(group=>{
      const open=expandedNavGroups.has(group.dataset.navGroup);
      group.classList.toggle("nav-group-open",open);
      const button=group.querySelector(".nav-group-toggle");
      button?.setAttribute("aria-expanded",String(isHorizontalNav()?!byId("horizontalNavPopup").hidden&&horizontalNavTrigger===button:open));
      if(isHorizontalNav()){button?.setAttribute("aria-haspopup","menu");button?.setAttribute("aria-controls","horizontalNavPopup");}
      else{button?.removeAttribute("aria-haspopup");button?.removeAttribute("aria-controls");}
    });
    requestAnimationFrame(updatePillDimensions);
  }
  function closeHorizontalNavMenu(returnFocus=false){
    const popup=byId("horizontalNavPopup");
    if(!popup)return;
    popup.hidden=true;
    if(returnFocus)horizontalNavTrigger?.focus({preventScroll:true});
    horizontalNavTrigger=null;
    root.querySelectorAll(".nav-group-toggle").forEach(b=>b.setAttribute("aria-expanded",isHorizontalNav()?"false":String(expandedNavGroups.has(b.dataset.navGroupToggle))));
    if(byId("railExpand"))syncRailCompactButton();
  }
  function openHorizontalNavMenu(groupId,trigger){
    if(!isHorizontalNav())return;
    closeHorizontalNavMenu();hideAnchorTooltip();closeNavSettings();
    const popup=byId("horizontalNavPopup"),all=localizedSections();
    const defs=[{id:"personal",label:ui().navGroups[0]},{id:"social",label:ui().navGroups[1]},{id:"account",label:ui().navGroups[2]},{id:"security",label:ui().navGroups[3]}].filter(g=>!groupId||g.id===groupId);
    popup.innerHTML=defs.map(g=>'<div class="horizontal-popup-group"><div class="horizontal-popup-heading">'+g.label+'</div>'+all.filter(s=>s.group===g.id).map(s=>'<button type="button" role="menuitem" data-jump="'+s.id+'"><span class="horizontal-popup-icon">'+iconSvg(s.id)+'</span><span>'+s.name+'</span></button>').join("")+'</div>').join("");
    popup.hidden=false;horizontalNavTrigger=trigger;
    syncActive();
    const rect=trigger.getBoundingClientRect(),width=popup.offsetWidth,height=popup.offsetHeight;
    const minLeft=(breed()<=730)?10:84;
    popup.style.left=Math.max(minLeft,Math.min(innerWidth-width-10,rect.left+rect.width/2-width/2))+"px";
    let top=preferences.position==="top"?rect.bottom+12:rect.top-height-12;
    popup.style.top=Math.max(10,Math.min(innerHeight-height-10,top))+"px";
    syncNavGroups();syncRailCompactButton();
    popup.querySelector('button')?.focus({preventScroll:true});
  }
  function toggleHorizontalNavMenu(groupId,trigger){
    const popup=byId("horizontalNavPopup");
    // Clicking the same tab again collapses its popup; clicking another tab
    // replaces the popup instead of leaving multiple menus or ignoring input.
    if(!popup.hidden&&horizontalNavTrigger===trigger){
      closeHorizontalNavMenu();
      return;
    }
    openHorizontalNavMenu(groupId,trigger);
  }
  byId("railItems").addEventListener("click",event=>{
    const group=event.target.closest("[data-nav-group-toggle]");
    if(!group){
      const home=event.target.closest('[data-jump="intro"]');
      if(isHorizontalNav()&&home?.classList.contains("active")){event.stopPropagation();toggleHorizontalNavMenu(null,home);}
      return;
    }
    const id=group.dataset.navGroupToggle;
    if(isHorizontalNav()){
      event.stopPropagation();
      const current=group.classList.contains("current-group");
      if(current||matchMedia("(hover:none)").matches||!byId("horizontalNavPopup").hidden)toggleHorizontalNavMenu(id,group);
      else{const first=sections.find(s=>s.group===id);if(first)jump(first.id);}
      return;
    }
    if(expandedNavGroups.has(id))expandedNavGroups.delete(id);else expandedNavGroups.add(id);
    syncNavGroups();
  });
  byId("railItems").addEventListener("contextmenu",event=>{
    if(!isHorizontalNav())return;
    const target=event.target.closest("[data-nav-group-toggle],.anchor-link[data-jump=\"intro\"]");
    if(!target)return;
    event.preventDefault();toggleHorizontalNavMenu(target.dataset.navGroupToggle||null,target);
  });
  byId("horizontalNavPopup").addEventListener("keydown",e=>{
    const buttons=[...byId("horizontalNavPopup").querySelectorAll('button[role="menuitem"]')];
    const index=buttons.indexOf(document.activeElement);
    if(e.key==="Escape"){e.preventDefault();closeHorizontalNavMenu(true);}
    else if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      e.preventDefault();buttons[(index+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();
    }
  });

  const searchOverlay=byId("searchOverlay"), searchInput=byId("commandInput");
  let searchIndex=0;
  function openSearch(){searchOverlay.hidden=false;searchInput.value="";renderSearch();setTimeout(()=>searchInput.focus(),30);}
  function closeSearch(){searchOverlay.hidden=true;}
  function renderSearch(){
    const term=searchInput.value.trim().toLocaleLowerCase("uk");
    const matches=localizedSections().filter(s=>(s.name+" "+s.title+" "+s.description).toLocaleLowerCase().includes(term));
    searchIndex=Math.min(searchIndex,Math.max(0,matches.length-1));
    byId("commandResults").innerHTML=matches.length?matches.map((s,i)=>'<button data-jump="'+s.id+'" class="command-result '+(i===searchIndex?"chosen":"")+'"><span>'+iconSvg(s.id)+'</span><strong>'+s.name+'</strong><small>'+s.number+' / 12</small><b>→</b></button>').join(""):'<div class="no-results">Нічого не знайдено. Спробуйте іншу назву.</div>';
    if(!matches.length)byId("commandResults").innerHTML='<div class="no-results">'+ui().noResults+'</div>';
  }
  byId("openSearch").addEventListener("click",()=>{window.dispatchEvent(new CustomEvent("tsv:zoek-palet"));});
  searchInput.addEventListener("input",()=>{searchIndex=0;renderSearch();});
  searchInput.addEventListener("keydown",e=>{
    const buttons=[...byId("commandResults").querySelectorAll("[data-jump]")];
    if(e.key==="ArrowDown"){e.preventDefault();searchIndex=Math.min(buttons.length-1,searchIndex+1);renderSearch();}
    if(e.key==="ArrowUp"){e.preventDefault();searchIndex=Math.max(0,searchIndex-1);renderSearch();}
    if(e.key==="Enter"&&buttons[searchIndex])jump(buttons[searchIndex].dataset.jump);
  });
  searchOverlay.addEventListener("click",e=>{if(e.target===searchOverlay)closeSearch();});
  luister(doc,"keydown",e=>{
    if(e.key==="Escape"){
      const closingAdaptiveNav=body.classList.contains("rail-smart-open");
      closeSearch();closeNavSettings();closeHorizontalNavMenu(true);setAdaptiveNavOpen(false);
      if(closingAdaptiveNav)adaptiveNavToggle.focus({preventScroll:true});
      if(e.target?.closest?.('.section-inline-settings'))closeInlineSettings(e.target.closest('.section-inline-settings').dataset.inlineSection);
    }
  });
  luister(doc,"pointerdown",e=>{
    if(!e.target.closest('#horizontalNavPopup,#railExpand,#railItems .nav-group-toggle,#railItems .anchor-link[data-jump="intro"]'))closeHorizontalNavMenu();
  });
  luister(doc,"click",e=>{
    let target=e.target.closest("[data-jump],[data-pos],[data-nav-style],[data-icon-display],[data-rail-mode],[data-theme],[data-accent],[data-demo-lang],.open-detail,.demo-action");
    if(target===body)target=null; // САЙТ (IDENTITEIT-015): корінь із data-accent — не кнопка акценту
    if(!target){if(!e.target.closest("#navSettings,#railConfig,#heroNavSettings,#mqSectiePositie"))closeNavSettings();return;}
    if(target.dataset.jump){hideAnchorTooltip();jump(target.dataset.jump);return;}
    if(target.dataset.pos){setPosition(target.dataset.pos);syncActive();closeNavSettings();syncControlStates();showToast(ui().moved+" "+ui().positions[target.dataset.pos]);return;}
    if(target.dataset.navStyle){setNavStyle(target.dataset.navStyle);return;}
    if(target.dataset.iconDisplay){setIconOnly(target.dataset.iconDisplay==="icons");return;}
    if(target.dataset.railMode){setRailMode(target.dataset.railMode);return;}
    if(target.dataset.theme){setTheme(target.dataset.theme);syncControlStates();return;}
    if(target.dataset.accent){сайтАкцент=target.dataset.accent;setAccent(target.dataset.accent);доСайту({accent:target.dataset.accent});syncControlStates();return;}
    // САЙТ (IDENTITEIT-015): мова сайту (cookie, <html lang>, обліковий запис); двигун перезапускається з новою мовою сам.
    if(target.dataset.demoLang){if(typeof opties.bijTaal==="function"){if(target.dataset.demoLang!==preferences.lang)opties.bijTaal(target.dataset.demoLang);}else setLang(target.dataset.demoLang);return;}
    if(target.classList.contains("open-detail")){
      const index=target.hasAttribute("data-option-index")?Number(target.dataset.optionIndex):null;
      openInlineSettings(target.dataset.for,{index,toggle:index===null});
      return;
    }
    if(target.classList.contains("demo-action")){showToast(ui().demoToast);}
  });
  root.querySelectorAll(".app-icon:not(.theme-button)").forEach(el=>el.addEventListener("click",()=>{
    // САЙТ: активна кнопка (Налаштування) веде вгору сторінки, решта — до справжніх сервісів через застосунок.
    if(el.classList.contains("active")||!el.dataset.dienst)jump("intro");else opties.bijDienst(el.dataset.dienst);
  }));
  byId("railItems").addEventListener("pointerover",e=>{
    const item=e.target.closest(".anchor-link,.nav-group-toggle");
    if(item&&item!==e.relatedTarget?.closest?.(".anchor-link,.nav-group-toggle"))showAnchorTooltip(item);
  });
  byId("railItems").addEventListener("pointerout",e=>{
    const item=e.target.closest(".anchor-link,.nav-group-toggle");
    if(item&&!item.contains(e.relatedTarget))hideAnchorTooltip();
  });
  byId("railItems").addEventListener("focusin",e=>{const item=e.target.closest(".anchor-link,.nav-group-toggle");if(item)showAnchorTooltip(item);});
  byId("railItems").addEventListener("focusout",hideAnchorTooltip);
  byId("railItems").addEventListener("scroll",hideAnchorTooltip,{passive:true});

  // Dragging the dedicated handle docks the anchor navigator at the nearest edge.
  let dragStart=null;
  const dragHandle=byId("railDrag");
  dragHandle.addEventListener("pointerdown",e=>{
    if(e.target.closest("button")||e.button!==0)return;
    dragStart={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false};
    dragHandle.setPointerCapture(e.pointerId);
  });
  dragHandle.addEventListener("pointermove",e=>{
    if(!dragStart)return;
    if(Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)>16){dragStart.moved=true;body.classList.add("dragging-rail");}
  });
  dragHandle.addEventListener("pointerup",e=>{
    if(!dragStart)return;
    if(dragStart.moved){
      const distances={left:e.clientX,right:innerWidth-e.clientX,top:e.clientY,bottom:innerHeight-e.clientY};
      const nearest=Object.keys(distances).sort((a,b)=>distances[a]-distances[b])[0];
      setPosition(nearest);
      showToast(ui().moved+" "+ui().positions[nearest]);
    }
    body.classList.remove("dragging-rail");
    dragStart=null;
  });
  dragHandle.addEventListener("pointercancel",()=>{dragStart=null;body.classList.remove("dragging-rail");});
  dragHandle.addEventListener("keydown",e=>{if(e.target===dragHandle&&(e.key==="Enter"||e.key===" ")){e.preventDefault();toggleNavSettings();}});

  const revealObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add("revealed");revealObserver.unobserve(entry.target);}
    });
  },{threshold:.06,rootMargin:"0px 0px 40px 0px"});
  luisteraars.push(()=>revealObserver.disconnect());
  renderAll();
  zetMaten();

  return {
    stop() { for (const weg of luisteraars) weg(); },
    ga(id, open) { gaNaar(id, open); },
    direct: [...directSettingsSections],
    zetLicht(l) { setTheme(l ? 'light' : 'dark'); },
    zetProfiel(p) { прийнятиФотоПрофілю(p); },
    // САЙТ (IDENTITEIT-015): налаштування змінилося на сайті (справжня панель, інший пристрій) — макет показує те саме, без луни назад.
    zetWeergave(w) {
      const колишні={positie:preferences.position,modus:preferences.railMode,accent:preferences.accent};
      демоЗСайту(w);
      сайтГотовий=false;
      try{
        if(preferences.position!==колишні.positie)setPosition(preferences.position);
        if(preferences.railMode!==колишні.modus)setRailMode(preferences.railMode);
        if(сайтАкцент&&сайтАкцент!==колишні.accent)setAccent(сайтАкцент);
      }finally{сайтГотовий=true;}
      синхронізуватиДемо();
    },
  };
}
