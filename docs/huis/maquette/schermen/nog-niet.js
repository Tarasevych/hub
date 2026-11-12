// Nog niet gebouwd: registraties voor ALLE onderdelen en tabbladen van §3.3 van het plan, zodat de navigatie vanaf dag één
// volledig is. Кожен маршрут існує, показує назву, що тут буде, і позначку «збирається».
// Модуль зони замінює заглушку реєстрацією з тим самим id: HV.scherm({ id:'energie', tabs:[{ id:'tarief', … }] }) або
// HV.tab('energie', { id:'tarief', … }). Цей файл стоїть першим серед екранів (volgorde.json), тож пізніший завжди перемагає.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  function stomp(scherm, tab) {
    return function (ctx) {
      var wat = tab ? tab.wat : scherm.wat;
      var titel = tab ? HV.p(tab.titel) : HV.p(scherm.titel);
      var delen = (tab ? tab.delen : scherm.delen) || [];
      return '<div class="hv-stomp" data-k="stomp">' +
        '<div class="hv-stomp__kaart"><span class="hv-stomp__teken">' + HV.icoon(scherm.icoon, { maat: 'l' }) + '</span>' +
        '<div class="hv-stomp__tekst"><h2>' + h(titel) + ' ' + o.later() + '</h2><p>' + h(HV.p(wat)) + '</p>' +
        (delen.length ? '<ul class="hv-stomp__delen">' + delen.map(function (d) { return '<li>' + h(HV.p(d)) + '</li>'; }).join('') + '</ul>' : '') +
        '<p class="hv-stomp__adres">' + h(t('Адреса на справжньому сайті: ', 'Adres op de echte site: ')) + '<code>' + h(tab ? tab.adres : scherm.adres) + '</code></p></div></div>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('До огляду дому', 'Naar het overzicht'), icoon: 'house', actie: 'ga', gegevens: { naar: 'overzicht' } }) + '</div></div>';
    };
  }

  // [id, sectie, titel, icoon, adres, wat, tabs: [id, titel, adres, wat]]
  var kaart = [
    ['overzicht', 'thuis', ['Дім', 'Thuis'], 'house', '/overzicht', ['Небо, речення дому, розріз, «Зараз важливо», сцени, обране, кімнати, зведення і стрічка доби.', 'Hemel, huiszin, doorsnede, ‘Nu belangrijk’, scènes, favorieten, kamers, samenvattingen en de dagstrook.'], []],
    ['kamers', 'kamers', ['Кімнати', 'Kamers'], 'layout-grid', '/kamers', ['Кімнати за поверхами.', 'Kamers per verdieping.'], [
      ['nu', ['Зараз', 'Nu'], '/kamers', ['Картки кімнат за поверхами: температура, світло, винятки.', 'Kamerkaarten per verdieping: temperatuur, licht, uitzonderingen.']],
      ['plattegrond', ['План', 'Plattegrond'], '/kamers/plattegrond', ['Плоский план із шарами: світло, клімат, безпека, присутність, енергія; «Перегляд минулого» і список під планом.', 'Platte plattegrond met lagen: licht, klimaat, beveiliging, aanwezigheid, energie; ‘Terugblik’ en een lijst onder de plattegrond.']],
      ['apparaten', ['Пристрої', 'Apparaten'], '/apparaten', ['Усі пристрої дому списком: фільтри за класом, кімнатою і станом; техніка й обслуговування.', 'Alle apparaten van het huis als lijst: filters op soort, kamer en toestand; apparatuur en onderhoud.']],
      ['klimaat', ['Клімат', 'Klimaat'], '/klimaat', ['Тематична сторінка клімату: кімнати з ціллю, тепловий насос, вентиляція, якість повітря.', 'Themapagina klimaat: kamers met doel, warmtepomp, ventilatie, luchtkwaliteit.']],
      ['media', ['Медіа', 'Media'], '/media', ['Що де грає: телевізор, колонки, групи й мультирум.', 'Wat waar speelt: tv, speakers, groepen en multiroom.']]
    ]],
    ['energie', 'energie', ['Енергія', 'Energie'], 'zap', '/energie', ['Куди тече енергія, скільки коштує, коли дешевше.', 'Waar de energie heen gaat, wat het kost en wanneer het goedkoper is.'], [
      ['nu', ['Зараз', 'Nu'], '/energie', ['Потоки наживо, фази L1–L3, сальдо й ціна зараз.', 'Stromen live, fasen L1–L3, saldo en de prijs van nu.']],
      ['tarief', ['Тариф', 'Tarief'], '/energie/tarief', ['Стрічка цін на 48 годин із дешевими вікнами й від’ємною ціною.', 'Prijsstrook voor 48 uur met goedkope vensters en een negatieve prijs.']],
      ['zon', ['Сонце й батарея', 'Zon en batterij'], '/energie/zon', ['Сонячні панелі 4,2 кВт і домашня батарея 10 кВт·год: виробіток, заряд, режим.', 'Zonnepanelen van 4,2 kW en een thuisbatterij van 10 kWh: opbrengst, lading, stand.']],
      ['laden', ['Зарядка', 'Laden'], '/energie/laden', ['План зарядки авто: години з ціною, вікно, ціль; режим «Пауза · Розумно · Швидко».', 'Laadplan van de auto: uren met prijs, venster, doel; stand ‘Pauze · Slim · Snel’.']],
      ['warmte', ['Тепло', 'Warmte'], '/energie/warmte', ['Тепловий насос, газ і вода: витрата, COP, гаряча вода.', 'Warmtepomp, gas en water: verbruik, COP, warm water.']],
      ['rapporten', ['Звіти', 'Rapporten'], '/energie/rapporten', ['День, тиждень, місяць, рік; 2027 рік без сальдування.', 'Dag, week, maand, jaar; 2027 zonder salderingsregeling.']]
    ]],
    ['beveiliging', 'beveiliging', ['Безпека', 'Beveiliging'], 'shield', '/beveiliging', ['Охорона, камери, доступ і датчики — з чесною межею «не сертифікована система».', 'Alarm, camera’s, toegang en sensoren — met de eerlijke grens ‘geen gecertificeerd systeem’.'], [
      ['stand', ['Стан', 'Stand'], '/beveiliging', ['Охорона: знято · периметр · нічна · повна; відчинене й відімкнене; аварійний шар.', 'Alarm: uit · schil · nachtstand · volledig; wat open en van het slot is; de noodlaag.']],
      ['cameras', ['Камери', 'Camera’s'], '/beveiliging/cameras', ['Кадри через сервер, «Приватність удома», слід «Хто дивився».', 'Beelden via de server, ‘Privacy thuis’, het spoor ‘Wie heeft gekeken’.']],
      ['toegang', ['Доступ', 'Toegang'], '/beveiliging/toegang', ['Замки, дзвінок, коди, гості з кодом на строк; виклик із дверей.', 'Sloten, deurbel, codes, gasten met een tijdelijke code; de oproep van de deur.']],
      ['sensoren', ['Датчики', 'Sensoren'], '/beveiliging/sensoren', ['Дим, чадний газ, протікання, рух і відкриття: стан, батарейки, тест.', 'Rook, koolmonoxide, lekkage, beweging en contact: toestand, batterijen, test.']]
    ]],
    ['garage', 'garage', ['Гараж', 'Garage'], 'car', '/garage', ['Транспорт, безпілотники й роботи однією мовою.', 'Voertuigen, drones en robots in één taal.'], [
      ['nu', ['Зараз', 'Nu'], '/garage', ['Телеметричні картки: заряд, запас ходу, три числа, силует.', 'Telemetriekaarten: lading, bereik, drie getallen, silhouet.']],
      ['voertuigen', ['Транспорт', 'Voertuigen'], '/garage/voertuigen', ['Електромобіль, бензинове авто, два електровелосипеди, електросамокат і мопед.', 'Elektrische auto, benzineauto, twee e-bikes, een elektrische step en een bromfiets.']],
      ['drones', ['Безпілотники', 'Drones'], '/garage/drones', ['Парк, батареї, перевірка перед зльотом, кабіна, місії та зони польоту (довідково).', 'Vloot, accu’s, controle vóór de start, cockpit, missies en vliegzones (ter informatie).']],
      ['robots', ['Роботи', 'Robots'], '/garage/robots', ['Пилосос і косарка: стан, карта, зони, розклад.', 'Robotstofzuiger en robotmaaier: toestand, kaart, zones, rooster.']],
      ['kaart', ['Мапа', 'Kaart'], '/garage/kaart', ['Схема ділянки: геозони, кільце досяжності, де що стоїть.', 'Schema van het perceel: geozones, bereikring, wat waar staat.']]
    ]],
    ['automatiseringen', 'automatisering', ['Автоматика', 'Automatisering'], 'workflow', '/automatiseringen', ['Правила, сцени, порядок дня, помічник і агенти.', 'Regels, scènes, dagorde, de assistent en agenten.'], [
      ['regels', ['Правила', 'Regels'], '/automatiseringen', ['Редактор «Коли / Якщо / Тоді»; стежка «Чернетка → Спостереження → Увімкнено»; пробний прогін і версії.', 'Editor ‘Wanneer / Als / Dan’; het pad ‘Concept → Meekijken → Aan’; proefrun en versies.']],
      ['scenes', ['Сцени й режими', 'Scènes en standen'], '/scenes', ['Сцени зі знімка стану й режими дому з реченням наслідку.', 'Scènes uit een momentopname en huisstanden met een gevolgzin.']],
      ['dagorde', ['Порядок дня', 'Dagorde'], '/automatiseringen/dagorde', ['Що дім робить сам протягом доби.', 'Wat het huis zelf doet gedurende de dag.']],
      ['assistent', ['Помічник', 'Assistent'], '/assistent', ['Команда природною мовою → картка наміру «було → стане».', 'Een opdracht in gewone taal → een voorstelkaart ‘was → wordt’.']],
      ['agenten', ['Агенти й погодження', 'Agenten en goedkeuringen'], '/automatiseringen/agenten', ['Сторінка агента: Інструменти · Рамки · Дії · «Що бачить агент»; черга «Чекає на вас».', 'Agentpagina: Hulpmiddelen · Kaders · Acties · ‘Wat de agent ziet’; de wachtrij ‘Wacht op jou’.']]
    ]],
    ['activiteit', 'logboek', ['Журнал', 'Logboek'], 'bell', '/activiteit', ['Хто, що, чому, було → стало.', 'Wie, wat, waarom, was → werd.'], [
      ['meldingen', ['Сповіщення', 'Meldingen'], '/activiteit', ['Центр сповіщень на всю сторінку з фільтрами за автором, важливістю й видом.', 'Het meldingencentrum als volledige pagina met filters op maker, gewicht en soort.']],
      ['geschiedenis', ['Історія', 'Geschiedenis'], '/activiteit/geschiedenis', ['Стрічка подій дому з причиною і ланцюгом «що запустило → умова → дія».', 'De tijdlijn van het huis met de reden en de keten ‘aanleiding → voorwaarde → actie’.']],
      ['onderhoud', ['Обслуговування', 'Onderhoud'], '/activiteit/onderhoud', ['Батарейки, фільтри, строки й недоступні пристрої.', 'Batterijen, filters, termijnen en onbereikbare apparaten.']],
      ['regels', ['Правила', 'Regels'], '/activiteit/regels', ['Кому, про що і яким каналом сповіщати; тихі години.', 'Wie waarover en via welk kanaal een melding krijgt; stille uren.']]
    ]],
    ['instellingen', 'systeem', ['Система', 'Systeem'], 'settings', '/instellingen', ['Дім, люди, дозволи, екрани, симулятор і дані.', 'Woning, mensen, toestemmingen, schermen, simulator en gegevens.'], [
      ['woning', ['Дім', 'Woning'], '/instellingen/woning', ['Адреса, час дому, валюта, одиниці, календар сміття, джерело погоди.', 'Adres, huistijd, valuta, eenheden, afvalkalender, weerbron.']],
      ['mensen', ['Люди й доступ', 'Mensen en toegang'], '/instellingen/mensen', ['Ролі: власник, мешканець, дитина, гість; запрошення; «Як дім знає, що я вдома».', 'Rollen: eigenaar, bewoner, kind, gast; uitnodigingen; ‘Hoe weet het huis dat ik thuis ben’.']],
      ['privacy', ['Приватність', 'Privacy'], '/instellingen/privacy', ['Камера, мікрофон і місце — три перемикачі; хто бачить моє місце.', 'Camera, microfoon en locatie — drie schakelaars; wie mijn locatie ziet.']],
      ['risico', ['Дозволи й небезпечні дії', 'Toestemmingen en risicovolle acties'], '/instellingen/risico', ['Реєстр: кожна дія × кожен виконавець — «Вимкнено · Питати · Завжди» з позначкою ризику.', 'Het register: elke actie × elke uitvoerder — ‘Uit · Vragen · Altijd’ met een risicomarkering.']],
      ['meldingen', ['Сповіщення', 'Meldingen'], '/instellingen/meldingen', ['Канали, сповіщення на пристрій, перевірка доставки.', 'Kanalen, meldingen op het toestel, controle van de bezorging.']],
      ['schermen', ['Екрани', 'Schermen'], '/instellingen/schermen', ['Зовнішні екрани як пристрої: профіль, кімната, обличчя, сполучення.', 'Externe schermen als apparaten: profiel, kamer, wijzerplaten, koppelen.']],
      ['integraties', ['Інтеграції', 'Integraties'], '/instellingen/integraties', ['Джерела й адаптери; майстер нового пристрою.', 'Bronnen en adapters; de wizard voor een nieuw apparaat.']],
      ['simulator', ['Симулятор', 'Simulator'], '/instellingen/simulator', ['Час і сценарії, «Світ» із ручними значеннями, «Траси».', 'Tijd en scenario’s, ‘Wereld’ met handmatige waarden, ‘Sporen’.']],
      ['gegevens', ['Дані', 'Gegevens'], '/instellingen/gegevens', ['Що зберігається, скільки й як довго; вивантаження.', 'Wat er wordt bewaard, hoeveel en hoe lang; exporteren.']],
      ['geheimen', ['Секрети', 'Geheimen'], '/instellingen/geheimen', ['Назва, дата й де вжито; значення — у сховищі платформи.', 'Naam, datum en waar gebruikt; de waarde staat in de kluis van het platform.']],
      ['diagnose', ['Діагностика', 'Diagnose'], '/instellingen/diagnose', ['Стан системи, ланцюжок зв’язку, коди помилок.', 'Toestand van het systeem, de verbindingsketen, foutcodes.']],
      ['toegankelijkheid', ['Доступність', 'Toegankelijkheid'], '/instellingen/toegankelijkheid', ['Довше утримання, простий режим, зменшений рух, розмір тексту.', 'Langer vasthouden, eenvoudige modus, minder beweging, tekstgrootte.']],
      ['showroom', ['Вітрина', 'Toonzaal'], '/instellingen/showroom', ['Приклади сцен і панелей.', 'Voorbeelden van scènes en panelen.']],
      ['planner', ['Калькулятор', 'Rekenhulp'], '/instellingen/planner', ['Розрахунок окупності сонця, батареї й теплового насоса.', 'Berekening van de terugverdientijd van zon, batterij en warmtepomp.']],
      ['onderdelen', ['Складники', 'Onderdelen'], '/instellingen/onderdelen', ['Бібліотека компонентів hv-* у всіх станах.', 'De bibliotheek van hv-*-onderdelen in alle toestanden.']]
    ]],
    ['paneel', 'paneel', ['Екран', 'Paneel'], 'tablet-smartphone', '/paneel', ['Кіоск зовнішнього екрана без обрамлення платформи. Оберіть профіль у пульті макета: годинник, стрічка, квадратний, круглий, малий, дверна панель, чорнило, телевізор.', 'De kiosk van een extern scherm zonder de rand van het platform. Kies een profiel in de bediening van de maquette: horloge, strook, vierkant, rond, klein, deurpaneel, inkt, televisie.'], []]
  ];

  kaart.forEach(function (r) {
    var scherm = { id: r[0], sectie: r[1], titel: r[2], icoon: r[3], adres: r[4], wat: r[5], voorlopig: true };
    scherm.tabs = r[6].map(function (x) {
      var tab = { id: x[0], titel: x[1], adres: x[2], wat: x[3], voorlopig: true };
      tab.render = stomp(scherm, tab);
      return tab;
    });
    if (!scherm.tabs.length) scherm.render = stomp(scherm, null);
    HV.scherm(scherm);
  });
})(window.HV = window.HV || {});
