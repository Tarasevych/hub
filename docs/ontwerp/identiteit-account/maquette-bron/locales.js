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
        {type:"choice",label:"Щільність інтерфейсу",note:"Більше простору або більше інформації",options:["Комфортна","Компактна"]},
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
        {type:"choice",label:"Informatiedichtheid",note:"Meer ruimte of meer informatie",options:["Comfortabel","Compact"]},
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
