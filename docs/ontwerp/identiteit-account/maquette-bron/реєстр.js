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
    група("особа","Профіль і фото","Profiel en foto","Справжня світлина надходить з авторизованого облікового запису. Вилучення фото наразі потребує окремої серверної дії.","De echte foto komt uit het aangemelde account. Verwijderen vereist nog een afzonderlijke serverhandeling.","частково",[
      рядок("Світлина з облікового запису","Foto uit het account","фото"),
      рядок("Прибрати власну світлину","Eigen foto verwijderen","обережна-дія",[],"частково",null,{uk:"Виявлена кнопка не вилучає фото, а повторно його передає. Потрібні окрема серверна дія вилучення, підтвердження та оновлення усіх зображень профілю.",nl:"De huidige knop verwijdert de foto niet, maar verstuurt dezelfde foto opnieuw. Een afzonderlijke serverhandeling, bevestiging en verversing van alle profielafbeeldingen zijn nodig."})
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
      return '<details class="register-group" data-register-group="'+sleutel+'" '+(open?'open':'')+'><summary><span class="register-group-index">'+String(i+1).padStart(2,'0')+'</span><span class="register-group-text"><strong>'+veiligeTekstРеєстру(preferences.lang==="nl"?g.nl:g.uk)+'</strong><small>'+veiligeTekstРеєстру(preferences.lang==="nl"?g.поясненняNl:g.поясненняUk)+'</small></span>'+badgeРеєстру(g.стан)+'<span class="register-chevron" aria-hidden="true">⌄</span></summary><div class="register-group-body">'+g.рядки.map((rij,j)=>veldРеєстру(sectie,g,rij,j)).join('')+'</div></details>';
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
// ціль: "розділ|селектор" усередині гнізда .mq-echt розділу (без розділу — той самий розділ). Група, усі рядки якої «в-чинних», зникає з карти.
// De levende kaart: status per groep en regel volgens de live code; «в-чинних» wordt een knop naar de echte instelling.
const станНаСайті={
  menu:{
    "швидкий-доступ":{стан:"в-чинних",ціль:"#menu-snel"},
    "сповіщення":{стан:"в-чинних",ціль:"#menu-meldingen",цілі:{9:"#menu-meldingtypen"},додати:[
      {uk:"Нагадування про резервний доступ",nl:"Herinnering aan reservetoegang",стан:"в-чинних",ціль:"[data-meld-schakel=\"reserve\"]",іконка:"нагадування"}
    ]},
    "швидкодія":{стан:"в-чинних",ціль:"#menu-snelheid"},
    "видимість":{стан:"в-чинних",ціль:"#menu-zichtbaarheid"}
  },
  themes:{
    "розклад":{стан:"в-чинних",ціль:"#thema-auto-kop"},
    "палітра":{стан:"в-чинних",ціль:"#thema-kleur-kop"}
  },
  widgets:{"створення":{стан:"частково",ціль:".settings-form"}},
  sharing:{
    "запрошення":{стан:"в-чинних",ціль:"#delen-uitnodigen"},
    "посилання":{стан:"частково",ціль:"#delen-uitnodigen",рядки:{0:"частково",1:"в-чинних"}},
    "чинні":{стан:"в-чинних",ціль:"#delen-leden"}
  },
  account:{
    "особа":{стан:"в-чинних"},
    "стан":{стан:"в-чинних"},
    "простори":{стан:"в-чинних"},
    "видалення":{стан:"частково",ціль:".settings-danger"},
    "експорт":{стан:"частково",ціль:"#gegevensuitvoer",рядки:{0:"частково",1:"в-чинних"}}
  },
  sessions:{
    "цей-пристрій":{стан:"в-чинних",ціль:".sessies-onthouden"},
    "активні":{стан:"в-чинних"},
    "гості":{стан:"в-чинних"},
    "сповіщення":{стан:"частково"}
  },
  methods:{
    "основні":{стан:"частково",ціль:"#aanmeldmethoden-google",рядки:{0:"в-чинних",1:"частково",2:"в-чинних"},цілі:{1:"security|#aanmeldmethoden-sleutels",2:"security|#aanmeldmethoden-2fa"}},
    "пароль":{стан:"в-чинних",ціль:"#aanmeldmethoden-wachtwoord"},
    "захист":{стан:"в-чинних",цілі:{0:"recovery|#aanmeldmethoden-herstel",1:"security|#aanmeldmethoden-sleutelkluis",2:"security|#toegangscodes"}},
    "додаткові":{стан:"частково",ціль:"#aanmeldmethoden-catalogus",рядки:{0:"частково",1:"частково",2:"частково",3:"частково",4:"недоступно",5:"заплановано"}}
  },
  security:{
    "ключі":{стан:"в-чинних",ціль:"#aanmeldmethoden-sleutels",рядки:{5:"заплановано"}},
    "другий-чинник":{стан:"в-чинних",ціль:"#aanmeldmethoden-2fa",додати:[
      {uk:"QR-код для застосунку-автентифікатора",nl:"QR-code voor de authenticator-app",стан:"в-чинних",іконка:"зчитування"},
      {uk:"Замінити автентифікатор",nl:"Authenticator vervangen",стан:"в-чинних",іконка:"повернути"}
    ]},
    "резервні-коди":{стан:"в-чинних",ціль:"recovery|#aanmeldmethoden-herstel"},
    "шифрування":{стан:"в-чинних",ціль:"#aanmeldmethoden-sleutelkluis"},
    "гостьові-коди":{стан:"в-чинних",ціль:"#toegangscodes"}
  },
  recovery:{
    "засоби":{стан:"в-чинних",ціль:"#aanmeldmethoden-herstel",цілі:{1:"#herstel-overzicht"}},
    "сценарії":{стан:"в-чинних",ціль:"#herstel-scenarios",цілі:{0:"#herstel-scenarios [data-scenario=\"apparaat\"]",1:"#herstel-scenarios [data-scenario=\"passkey\"]",2:"#herstel-scenarios [data-scenario=\"authenticator\"]",3:"#herstel-scenarios [data-scenario=\"codes-op\"]"}},
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
        return {...р,стан,ціль:(рідний&&сайт.цілі?.[р.первіснийНомер])||сайт.ціль||null};
      })
      .filter(р=>!вжеОформленіРядки[розділ]?.includes(р.uk));
    return {...г,стан:сайт.стан||г.стан,рядки};
  }).filter(г=>г.рядки.length&&!г.рядки.every(р=>р.стан==="в-чинних"));
  if(!групи.length)return '';
  // САЙТ: чесні мітки живої карти; мітки «звірити підключення» більше немає.
  const статус=стан=>стан==='заплановано'?(nl?'Nog te ontwikkelen':'Потребує розробки'):стан==='макет'?(nl?'Alleen ontwerp':'Лише макет'):стан==='частково'?(nl?'Deels beschikbaar':'Частково реалізовано'):стан==='недоступно'?(nl?'Niet beschikbaar':'Недоступно'):(nl?'Werkt':'Працює');
  const клас=стан=>стан==='в-чинних'||стан==='наявне'?'werkt':стан==='частково'?'deels':стан==='недоступно'?'nee':стан==='макет'?'ontwerp':'gepland';
  const рядок=(р,і,г)=>{
    const знак=р.іконка?піктограмаЗаСуттю(р.іконка):знакМожливості(розділ,г.id,р.первіснийНомер);
    const мітка='<small class="future-option-status future-stand-'+клас(р.стан)+'">'+статус(р.стан)+'</small>';
    const назва='<span class="future-option-name">'+veiligeTekstРеєстру(nl?р.nl:р.uk)+'</span>';
    // Робоче або частково робоче місце з відомою ціллю — кнопка переходу до справжнього налаштування.
    if(р.ціль&&(р.стан==='в-чинних'||р.стан==='частково')){
      const ціль=р.ціль.includes('|')?р.ціль:розділ+'|'+р.ціль;
      const підказка=nl?'Opent de echte instelling in «Huidige instellingen»; wijzigingen daar gelden meteen voor uw account.':'Відкриває справжнє налаштування в блоці «Чинні налаштування»; зміни там одразу діють для вашого облікового запису.';
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

document.addEventListener('toggle',event=>{
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

document.addEventListener('click',event=>{
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
  if(overgang){const id=overgang.dataset.registerGo;openInlineSettings(id,{toggle:false});document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
  const knop=event.target.closest('[data-register-all]');
  if(knop){
    const bloks=[...document.querySelectorAll('.register-catalog[data-register-section="'+knop.dataset.registerAll+'"] .register-group')];
    const openen=bloks.some(b=>!b.open);
    bloks.forEach(b=>{b.open=openen;if(openen)відкритіГрупиРеєстру.add(b.dataset.registerGroup);else відкритіГрупиРеєстру.delete(b.dataset.registerGroup);});
    knop.textContent=написиРеєстру[preferences.lang][openen?'hideAll':'showAll'];return;
  }
  if(event.target.closest('[data-register-action]'))showToast(написиРеєстру[preferences.lang].toast);
});

document.addEventListener('change',event=>{
  if(event.target.matches('[data-register-field],[data-register-range]'))showToast(написиРеєстру[preferences.lang].toast);
});
