// Logboek / Журнал — розділ повністю: Сповіщення · Історія · Обслуговування · Правила.
// Сповіщення: центр на всю сторінку — «Тривають», «Чекають рішення», «Критичні», дні; фільтри за службою, автором,
// важливістю, «для мене», непрочитаними й відкладеними; пошук; розгортання «що · чому · було → стало · чий дозвіл · хто отримав»;
// дії зі сповіщення («Повернути», «Відкрити пристрій», «Чому?», «Відкласти», «Сповіщення цієї служби»).
// Історія: «Стрічка | Графіки | Таблиця» — перегляд минулого, вибір сутностей, лінії й смуги станів на спільній осі часу,
// спільний курсор, порівняння періодів, прогноз, теплова карта, «Виправити значення», експорт CSV (лише як дія з поясненням).
// Обслуговування: батарейки, прошивки, фільтри, сервіс техніки, перевірка датчиків диму; «Зроблено», «Відкласти».
// Правила: що, куди, кому, від якої важливості; тихі години; ескалація; мова одержувача; перевірка доставки.
// Кожна зміна стану — запис Журналу з автором і сповіщення з «Повернути»; команди пристроям — лише через HV.doe.
// Розширення світу живе в w.lb (створюється раз на світ: сценарій симулятора починає з чистого паспорта).
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var MIN = 60000, UUR = 3600000, DAG = 86400000;
  var kopie = function (x) { return JSON.parse(JSON.stringify(x)); };
  var ic = function (naam, maat) { return HV.icoon(naam, { maat: maat || 's' }); };
  var P = function (paar) { return paar ? HV.p(paar) : ''; };

  // ───────────────────────── Довідники ─────────────────────────
  // Служби Журналу (§8 зональної специфікації): іконка lucide і назва; захищені не опускаються нижче «звичайної» доставки.
  var DIENSTEN = [
    { id: 'apparaten', icoon: 'lamp', naam: ['Кімнати й пристрої', 'Kamers en apparaten'] },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат і медіа', 'Klimaat en media'] },
    { id: 'energie', icoon: 'zap', naam: ['Енергія', 'Energie'] },
    { id: 'veiligheid', icoon: 'shield', naam: ['Безпека', 'Beveiliging'], beschermd: true },
    { id: 'garage', icoon: 'car', naam: ['Гараж', 'Garage'] },
    { id: 'automatisering', icoon: 'workflow', naam: ['Автоматика', 'Automatisering'] },
    { id: 'agenten', icoon: 'bot', naam: ['Агенти й запити', 'Agenten en verzoeken'], beschermd: true },
    { id: 'integraties', icoon: 'plug', naam: ['Інтеграції', 'Integraties'] },
    { id: 'schermen', icoon: 'monitor-smartphone', naam: ['Екрани', 'Schermen'] },
    { id: 'simulator', icoon: 'flask-conical', naam: ['Симулятор', 'Simulator'] },
    { id: 'systeem', icoon: 'settings', naam: ['Система', 'Systeem'] }
  ];
  var DIENST = {};
  DIENSTEN.forEach(function (d) { DIENST[d.id] = d; });

  var KLASSE_DIENST = {
    thermostaat: 'klimaat', airco: 'klimaat', warmtepomp: 'klimaat', vloerverwarming: 'klimaat', radiatorkraan: 'klimaat', ventilatie: 'klimaat', bevochtiger: 'klimaat',
    luchtreiniger: 'klimaat', boiler: 'klimaat', tv: 'klimaat', speaker: 'klimaat', speakergroep: 'klimaat', irzender: 'klimaat', temperatuur: 'klimaat', vocht: 'klimaat', co2: 'klimaat',
    p1meter: 'energie', zonnepanelen: 'energie', thuisbatterij: 'energie', laadpaal: 'energie',
    slot: 'veiligheid', alarmsysteem: 'veiligheid', camera: 'veiligheid', deurbel: 'veiligheid', rook: 'veiligheid', lek: 'veiligheid', co: 'veiligheid', contact: 'veiligheid', beweging: 'veiligheid',
    garagedeur: 'garage', poort: 'garage', stofzuiger: 'garage', maaier: 'garage'
  };
  /** Служба запису Журналу: явна (dienst), за видом запису, автором або класом пристрою. */
  function dienstVan(r) {
    if (r.dienst && DIENST[r.dienst]) return r.dienst;
    var s = r.soort || '';
    if (s === 'huis.alarm' || s === 'huis.toegang') return 'veiligheid';
    if (s === 'huis.agent') return 'agenten';
    if (s === 'huis.energie') return 'energie';
    if (s === 'huis.voertuig') return 'garage';
    if (s === 'huis.integratie') return 'integraties';
    if (s === 'huis.simulatie') return 'simulator';
    if (s === 'huis.automatisering') return r.maker && r.maker.soort === 'optimalisatie' ? 'energie' : 'automatisering';
    if (s === 'huis.systeem') return r.maker && r.maker.soort === 'simulator' ? 'simulator' : 'systeem';
    var a = r.doel && HV.staat.w ? HV.staat.w.apparaten[r.doel] : null;
    if (a) return KLASSE_DIENST[a.soort] || 'apparaten';
    if (r.maker && r.maker.soort === 'simulator') return 'simulator';
    return 'apparaten';
  }

  // Автори (знак hv-maker); сцена власного знака не має — у фільтрі вона стоїть словом.
  var MAKERS = [
    { id: 'mens', icoon: 'user', naam: ['Людина', 'Mens'] },
    { id: 'knop', icoon: 'hand', naam: ['Фізична кнопка', 'Fysieke knop'] },
    { id: 'automatisering', icoon: 'diamond', naam: ['Автоматизація', 'Automatisering'] },
    { id: 'scene', icoon: 'sparkles', naam: ['Сцена', 'Scène'] },
    { id: 'agent', icoon: 'agent', naam: ['ШІ-агент', 'AI-agent'] },
    { id: 'optimalisatie', icoon: 'gauge', naam: ['Оптимізатор', 'Optimalisatie'] },
    { id: 'dienst', icoon: 'cloud', naam: ['Зовнішня служба', 'Externe dienst'] },
    { id: 'systeem', icoon: 'cpu', naam: ['Система', 'Systeem'] },
    { id: 'simulator', icoon: 'flask-conical', naam: ['Симуляція', 'Simulatie'] }
  ];
  var GEWICHT = { info: ['до відома', 'ter info'], belangrijk: ['важливо', 'belangrijk'], alarm: ['тривога', 'alarm'] };
  var GEWICHT_RANG = { info: 0, belangrijk: 1, alarm: 2 };
  var WIE = {
    thuis: ['хто вдома', 'wie thuis is'], volwassenen: ['усі дорослі', 'alle volwassenen'], eigenaar: ['лише власник', 'alleen de eigenaar'],
    iedereen: ['усі в домі', 'iedereen in huis'], sleutel: ['ключотримач (сусід Ян)', 'sleutelhouder (buurman Jan)']
  };
  var VANAF = {
    info: ['усе', 'alles'], belangrijk: ['важливе й тривоги', 'belangrijk en alarm'], alarm: ['лише тривоги', 'alleen alarm'], nooit: ['лише в Журналі', 'alleen in het logboek']
  };
  var KANALEN = [
    { id: 'app', icoon: 'bell', naam: ['Застосунок', 'App'], vast: true },
    { id: 'push', icoon: 'smartphone', naam: ['Телефон', 'Telefoon'] },
    { id: 'mail', icoon: 'mail', naam: ['Ел. пошта', 'E-mail'] },
    { id: 'scherm', icoon: 'monitor-smartphone', naam: ['Екрани дому', 'Schermen in huis'] },
    { id: 'geluid', icoon: 'volume-2', naam: ['Звук крізь тишу', 'Geluid door de stilte'] }
  ];
  var MAAND_KORT = [['січ', 'jan'], ['лют', 'feb'], ['бер', 'mrt'], ['кві', 'apr'], ['тра', 'mei'], ['чер', 'jun'], ['лип', 'jul'], ['сер', 'aug'], ['вер', 'sep'], ['жов', 'okt'], ['лис', 'nov'], ['гру', 'dec']];
  var DAG_KORT = [['нд', 'zo'], ['пн', 'ma'], ['вт', 'di'], ['ср', 'wo'], ['чт', 'do'], ['пт', 'vr'], ['сб', 'za']];

  // ───────────────────────── Розширення світу ─────────────────────────
  function startRegels() {
    var r = {};
    var zet = function (id, vanaf, wie, push, mail, scherm, geluid) { r[id] = { vanaf: vanaf, wie: wie, push: push, mail: mail, scherm: scherm, geluid: geluid }; };
    zet('apparaten', 'belangrijk', 'thuis', true, false, true, false);
    zet('klimaat', 'belangrijk', 'thuis', true, false, false, false);
    zet('energie', 'belangrijk', 'volwassenen', true, true, false, false);
    zet('veiligheid', 'info', 'iedereen', true, false, true, true);
    zet('garage', 'belangrijk', 'volwassenen', true, false, false, false);
    zet('automatisering', 'belangrijk', 'volwassenen', true, false, false, false);
    zet('agenten', 'belangrijk', 'volwassenen', true, false, true, false);
    zet('integraties', 'belangrijk', 'eigenaar', true, true, false, false);
    zet('schermen', 'belangrijk', 'eigenaar', true, false, false, false);
    zet('simulator', 'nooit', 'eigenaar', false, false, false, false);
    zet('systeem', 'belangrijk', 'eigenaar', true, true, false, false);
    return r;
  }

  // Обслуговування: [id, soort, doel, icoon, uk, nl, інтервал (дн), минуло днів, extra]
  var ONDERHOUD = [
    ['fw-router', 'firmware', 'router', 'router', 'Маршрутизатор', 'Router', 0, 0, { van: '7.1.4', naar: '7.2.0', veilig: true, niveau: 'gevaarlijk', duur: 3, notities: ['закрито вразливість у віддаленому керуванні; стабільніший Wi-Fi 6 ГГц', 'kwetsbaarheid in beheer op afstand gedicht; stabielere wifi op 6 GHz'] }],
    ['fw-thermostaat', 'firmware', 'thermostaat', 'thermometer', 'Термостат', 'Thermostaat', 0, 0, { van: '4.3.0', naar: '4.3.2', duur: 2, notities: ['виправлено графік на вихідні; точніший датчик', 'weekendschema hersteld; nauwkeuriger sensor'] }],
    ['fw-cameravoor', 'firmware', 'cameravoor', 'cctv', 'Камера біля входу', 'Camera voordeur', 0, 0, { van: '3.0.6', naar: '3.1.0', duur: 4, notities: ['краща нічна зйомка; зони приватності на кадрі', 'beter nachtbeeld; privacyzones in het beeld'] }],
    ['fw-slot', 'firmware', 'voordeurslot', 'lock-keyhole', 'Замок вхідних дверей', 'Slot voordeur', 0, 0, { van: '2.4.0', naar: '2.4.1', niveau: 'kritiek', duur: 1, notities: ['довша робота батареї; замок під час оновлення лишається замкненим', 'langere batterijduur; het slot blijft tijdens de update vergrendeld'] }],
    ['fw-sceneknop', 'firmware', 'sceneknop', 'circle-dot', 'Кнопка сцен', 'Scèneknop', 0, 0, { van: '1.8', naar: '1.9', slaapt: true, duur: 1, notities: ['сплячий пристрій: оновиться після першого натиску', 'slapend apparaat: werkt bij na de eerste druk'] }],
    ['luchtreiniger', 'filter', 'luchtreiniger', 'wind', 'Очищувач повітря: фільтр HEPA', 'Luchtreiniger: HEPA-filter', 365, 372, {}],
    ['ventilatie', 'filter', 'ventilatie', 'fan', 'Вентиляція: фільтри', 'Ventilatie: filters', 182, 170, {}],
    ['bevochtiger', 'filter', 'bevochtiger', 'droplets', 'Зволожувач: фільтр і резервуар', 'Luchtbevochtiger: filter en reservoir', 30, 26, {}],
    ['vaatwasser', 'reiniging', 'vaatwasser', 'utensils', 'Посудомийна: очистити фільтр', 'Vaatwasser: filter reinigen', 30, 33, {}],
    ['wasmachine', 'reiniging', 'wasmachine', 'washing-machine', 'Пральна: прання барабана 90 °C', 'Wasmachine: trommel reinigen op 90 °C', 30, 19, {}],
    ['koffie', 'reiniging', 'koffie', 'coffee', 'Кавоварка: видалити накип', 'Koffiemachine: ontkalken', 60, 58, {}],
    ['stofzuiger', 'reiniging', 'stofzuiger', 'bot', 'Пилосос: щітки й фільтр', 'Robotstofzuiger: borstels en filter', 90, 61, {}],
    ['warmtepomp', 'service', 'warmtepomp', 'heater', 'Тепловий насос: щорічний огляд', 'Warmtepomp: jaarlijkse controle', 365, 341, { bedrijf: ['Сервіс «Тепло Утрехт»', 'Service ‘Warmte Utrecht’'] }],
    ['boiler', 'service', 'boiler', 'droplet', 'Бойлер: огляд і накип', 'Boiler: controle en ontkalken', 365, 203, { bedrijf: ['Сервіс «Тепло Утрехт»', 'Service ‘Warmte Utrecht’'] }],
    ['maaier', 'service', 'maaier', 'bot', 'Косарка: ножі й зимове зберігання', 'Robotmaaier: messen en winterstalling', 180, 172, { bedrijf: ['Дилер косарок', 'Maaierdealer'] }],
    ['rookkeuken', 'test', 'rookkeuken', 'alarm-smoke', 'Датчик диму на кухні', 'Rookmelder keuken', 30, 31, {}],
    ['cobijkeuken', 'test', 'cobijkeuken', 'alarm-smoke', 'Датчик чадного газу в підсобці', 'Koolmonoxidemelder bijkeuken', 30, 12, {}],
    ['lekbijkeuken', 'test', 'lekbijkeuken', 'droplet', 'Датчик протікання в підсобці', 'Lekkagesensor bijkeuken', 90, 40, {}]
  ];
  // Батарейки пристроїв без власного числа в паспорті (у відсотках); batterijraam, radiatorkinder і sceneknop читаються наживо.
  var BATTERIJEN = { rookkeuken: 87, cobijkeuken: 92, lekbijkeuken: 64, raamslaap: 58, voordeurcontact: 76, beweginghal: 41, voordeurslot: 66, tempslaap: 81, tempkinder: 24, tempwerk: 90, vochtbad: 55 };

  function L(w) {
    w = w || HV.staat.w;
    if (!w) return null;
    if (w.lb) return w.lb;
    var X = {
      status: {}, regels: startRegels(),
      stil: { aan: true, van: 22.5, tot: 7, dagen: 'elke', belangrijk: false, verzoek: true },
      escalatie: { aan: true, stappen: [{ na: 0, wie: 'thuis' }, { na: 2, wie: 'volwassenen' }, { na: 5, wie: 'sleutel' }] },
      taal: { olena: 'uk', taras: 'uk', marko: 'nl', solomija: 'uk', iryna: 'nl' },
      simBuiten: false, test: null, correcties: [], batterijen: kopie(BATTERIJEN), onderhoud: {}
    };
    ONDERHOUD.forEach(function (r) {
      X.onderhoud[r[0]] = { laatst: w.tijd - r[7] * DAG, uitgesteld: null, gepland: null, bezig: null, versie: r[8].van || null, gedaan: false };
    });
    w.lb = X;
    // «Перший запуск»: дім щойно створено — Журнал порожній, минулих записів і запитів ще немає
    if (!w.eersteStart) zaaiLogboek(w);
    HV.staat.wijzig();
    return X;
  }
  // світ створюється до першої перерисовки — розширення з'являється на першому ж кадрі абонентів
  HV.staat.abonneer(function (w) { if (w && !w.lb) L(w); });

  /** Записи Журналу за вчора й сьогодні: різні автори, служби, важливість і ланцюги «що запустило → умова → дія». */
  function zaaiLogboek(w) {
    var dag0 = Math.floor(w.tijd / DAG) * DAG, gister = dag0 - DAG;
    var om = function (d, uur, min) { return d + uur * UUR + (min || 0) * MIN; };
    var M = {
      olena: { soort: 'mens', naam: ['Олена', 'Olena'] }, taras: { soort: 'mens', naam: ['Тарас', 'Taras'] },
      claude: { soort: 'agent', naam: ['Агент Claude', 'Agent Claude'] }, gemini: { soort: 'agent', naam: ['Агент Gemini', 'Agent Gemini'] },
      opt: { soort: 'optimalisatie', naam: ['Оптимізатор енергії', 'Energie-optimalisatie'] }, sys: { soort: 'systeem', naam: ['Система', 'Systeem'] },
      knop: { soort: 'knop', naam: ['Кнопка сцен', 'Scèneknop'] }, sim: { soort: 'simulator', naam: ['Симулятор', 'Simulator'] },
      knmi: { soort: 'dienst', naam: ['Погода KNMI', 'Weer KNMI'] }, rook: { soort: 'systeem', naam: ['Датчик диму', 'Rookmelder'] }
    };
    var auto = function (uk, nl) { return { soort: 'automatisering', naam: [uk, nl] }; };
    var regels = [
      { tijd: om(gister, 6, 30), maker: auto('«Ранок у будні»', '‘Werkdagochtend’'), wat: ['Сцена «Ранок»: 4 із 4 кроків', 'Scène ‘Ochtend’: 4 van 4 stappen'], waarom: ['06:30 у будні', '06:30 op werkdagen'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.automatisering',
        keten: [['06:30, будній день', '06:30, werkdag'], ['хтось удома, режим «Ніч»', 'iemand thuis, stand ‘Nacht’'], ['сцена «Ранок»', 'scène ‘Ochtend’']] },
      { tijd: om(gister, 7, 52), maker: M.taras, wat: ['Замок вхідних дверей: відімкнено', 'Slot voordeur: ontgrendeld'], was: ['замкнено', 'vergrendeld'], werd: ['відімкнено', 'ontgrendeld'], soort: 'huis.toegang', doel: 'voordeurslot',
        keten: [['Тарас на клавіатурі замка', 'Taras op het toetsenbord van het slot'], ['код Тараса дійсний', 'code van Taras geldig'], ['відімкнути двері', 'deur ontgrendelen']] },
      { tijd: om(gister, 8, 15), maker: auto('«Усі пішли»', '‘Iedereen weg’'), wat: ['Режим дому: «Не вдома»', 'Huisstand: ‘Afwezig’'], was: ['Вдома', 'Thuis'], werd: ['Не вдома', 'Afwezig'], waarom: ['останній телефон вийшов із домашньої мережі', 'de laatste telefoon verliet het thuisnetwerk'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.automatisering',
        keten: [['телефони поза домом 10 хв', 'telefoons 10 min buiten huis'], ['датчики руху спокійні', 'bewegingssensoren rustig'], ['режим «Не вдома»: світло й медіа вимкнено', 'stand ‘Afwezig’: licht en media uit']] },
      { tijd: om(gister, 10, 5), maker: M.knmi, wat: ['Попередження: вітер до 7 балів увечері', 'Waarschuwing: wind tot 7 Bft in de avond'], waarom: ['код жовтий для провінції Утрехт', 'code geel voor de provincie Utrecht'], soort: 'huis.integratie', gewicht: 'belangrijk', dienst: 'integraties' },
      { tijd: om(gister, 11, 40), maker: M.opt, wat: ['Домашня батарея: заряджати з мережі', 'Thuisbatterij: laden van het net'], was: ['розумно', 'slim'], werd: ['дешеві години', 'goedkope uren'], waarom: ['ціна € 0,08 за кВт·год до 13:00', 'prijs € 0,08 per kWh tot 13:00'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.energie', doel: 'thuisbatterij',
        keten: [['ціна нижча за € 0,10', 'prijs onder € 0,10'], ['батарея нижче 60 %', 'batterij onder 60 %'], ['заряджати з мережі до 90 %', 'laden van het net tot 90 %']] },
      { tijd: om(gister, 13, 20), maker: M.sys, wat: ['Прошивку оновлено: датчик руху в передпокої', 'Firmware bijgewerkt: bewegingssensor hal'], was: ['2.0.3', '2.0.3'], werd: ['2.1.0', '2.1.0'], soort: 'huis.systeem', doel: 'beweginghal' },
      { tijd: om(gister, 16, 2), maker: M.knop, wat: ['Сцена «Вечір»: 9 із 9 кроків', 'Scène ‘Avond’: 9 van 9 stappen'], waarom: ['подвійний натиск', 'dubbel gedrukt'], soort: 'huis.automatisering', via: ['Вечір', 'Avond'] },
      { tijd: om(gister, 18, 44), maker: M.rook, wat: ['Датчик диму на кухні: тривога', 'Rookmelder keuken: alarm'], waarom: ['пара від духовки, 41 с', 'damp van de oven, 41 s'], soort: 'huis.alarm', gewicht: 'alarm', doel: 'rookkeuken',
        keten: [['дим у кухні', 'rook in de keuken'], ['поріг датчика перевищено', 'drempel van de melder overschreden'], ['сирена й аварійний шар на всіх екранах', 'sirene en noodlaag op alle schermen']] },
      { tijd: om(gister, 18, 45), maker: M.olena, wat: ['Тривогу підтверджено, сирену приглушено', 'Alarm bevestigd, sirene gedempt'], waarom: ['пара, не пожежа', 'damp, geen brand'], soort: 'huis.alarm', gewicht: 'alarm' },
      { tijd: om(gister, 19, 30), maker: M.claude, wat: ['Колонка на кухні: гучність 15 %', 'Speaker keuken: volume 15 %'], was: ['24 %', '24 %'], werd: ['15 %', '15 %'], waarom: ['ви сказали «тихіше» в Команді', 'je zei ‘zachter’ in Opdracht'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.agent', doel: 'speakerkeuken', terug: { doel: 'speakerkeuken', mogelijkheid: 'volume', waarde: 24 } },
      { tijd: om(gister, 21, 10), maker: M.gemini, wat: ['Не виконано: Відчинити ворота — Гаражні ворота', 'Niet uitgevoerd: Poort of garagedeur openen — Garagedeur'], waarom: ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'], soort: 'huis.agent', gewicht: 'belangrijk', doel: 'garagedeur' },
      { tijd: om(gister, 22, 30), maker: auto('Порядок дня «Вечір»', 'Dagorde ‘Avond’'), wat: ['Нічна сцена: 10 із 12 підтверджено', 'Nachtscène: 10 van 12 bevestigd'], was: ['вітальня 60 %', 'woonkamer 60 %'], werd: ['вітальня 0 %', 'woonkamer 0 %'], waarom: ['порядок дня «Вечір», версія 4, від імені: Тарас', 'dagorde ‘Avond’, versie 4, namens: Taras'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.automatisering',
        keten: [['22:30 за порядком дня', '22:30 volgens de dagorde'], ['режим «Вдома»', 'stand ‘Thuis’'], ['нічна сцена; 2 лампи не відповіли', 'nachtscène; 2 lampen gaven geen antwoord']] },
      { tijd: om(gister, 23, 5), maker: M.sys, wat: ['Копію налаштувань збережено', 'Kopie van de instellingen bewaard'], soort: 'huis.systeem' },
      { tijd: om(dag0, 2, 0), maker: M.sys, wat: ['Нічна копія на мережеве сховище: 1,2 ГБ', 'Nachtelijke kopie naar de netwerkopslag: 1,2 GB'], soort: 'huis.systeem', doel: 'nas' },
      { tijd: om(dag0, 3, 12), maker: M.sys, wat: ['Датчик температури на горищі мовчить', 'Temperatuursensor zolder zwijgt'], waarom: ['немає звіту понад 60 хв', 'al meer dan 60 min geen melding'], soort: 'huis.apparaat', gewicht: 'belangrijk', doel: 'tempzolder' },
      { tijd: om(dag0, 5, 40), maker: M.sys, wat: ['Адаптер Zigbee перепідключено', 'Zigbee-adapter opnieuw verbonden'], waarom: ['зв’язок зник на 40 с', 'verbinding 40 s weg'], soort: 'huis.integratie', gewicht: 'belangrijk', dienst: 'integraties' },
      { tijd: om(dag0, 7, 5), maker: auto('«Ранок у будні»', '‘Werkdagochtend’'), wat: ['Сцена «Ранок»: 4 із 4 кроків', 'Scène ‘Ochtend’: 4 van 4 stappen'], waarom: ['будній день, 07:05 (схід сонця пізніший)', 'werkdag, 07:05 (zonsopgang later)'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.automatisering',
        keten: [['07:05, будній день', '07:05, werkdag'], ['хтось удома', 'iemand thuis'], ['сцена «Ранок»', 'scène ‘Ochtend’']] },
      { tijd: om(dag0, 7, 6), maker: auto('«Ранок у будні»', '‘Werkdagochtend’'), wat: ['Кавоварка: увімкнено', 'Koffiemachine: aan'], soort: 'huis.automatisering', doel: 'koffie', via: ['Ранок', 'Ochtend'] },
      { tijd: om(dag0, 7, 6, 0) + 20000, maker: auto('«Ранок у будні»', '‘Werkdagochtend’'), wat: ['Кавоварка: увімкнено', 'Koffiemachine: aan'], soort: 'huis.automatisering', doel: 'koffie', via: ['Ранок', 'Ochtend'], waarom: ['повтор: перша команда без підтвердження', 'herhaling: eerste opdracht zonder bevestiging'] },
      { tijd: om(dag0, 9, 30), maker: M.opt, wat: ['Посудомийна: старт перенесено на 13:00', 'Vaatwasser: start verschoven naar 13:00'], waarom: ['дешевше на € 0,21 — сонце й нижча ціна', '€ 0,21 goedkoper — zon en lagere prijs'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.energie', doel: 'vaatwasser' },
      { tijd: om(dag0, 12, 10), maker: M.olena, wat: ['Екран «Кухня» сполучено', 'Scherm ‘Keuken’ gekoppeld'], waarom: ['код сполучення 4 цифри', 'koppelcode van 4 cijfers'], soort: 'huis.systeem', gewicht: 'belangrijk', dienst: 'schermen' },
      { tijd: om(dag0, 12, 48), maker: M.sys, wat: ['Електровелосипед Тараса: заряд 37 %', 'E-bike van Taras: lading 37 %'], waarom: ['нижче 40 % перед завтрашньою поїздкою', 'onder 40 % voor de rit van morgen'], soort: 'huis.voertuig' },
      { tijd: om(dag0, 13, 40), maker: M.sim, wat: ['Швидкість часу дому: ×60', 'Snelheid huistijd: ×60'], soort: 'huis.simulatie', dienst: 'simulator' },
      { tijd: w.tijd - 20 * MIN, maker: M.claude, wat: ['Термостат: 20,5 °C', 'Thermostaat: 20,5 °C'], was: ['21,0 °C', '21,0 °C'], werd: ['20,5 °C', '20,5 °C'], waarom: ['у вітальні нікого 40 хв; економія близько € 0,30 за вечір', 'al 40 min niemand in de woonkamer; ongeveer € 0,30 zuiniger per avond'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.agent', doel: 'thermostaat', ongelezen: true,
        terug: { doel: 'thermostaat', mogelijkheid: 'doel', waarde: 21 }, keten: [['датчик присутності: нікого 40 хв', 'aanwezigheidssensor: 40 min niemand'], ['ціль вище 20,5 °C', 'doel boven 20,5 °C'], ['ціль −0,5 °C', 'doel −0,5 °C']] },
      { tijd: w.tijd - 6 * MIN, maker: M.sys, wat: ['Батарейка датчика вікна в дитячій: 12 %', 'Batterij raamsensor kinderkamer: 12 %'], waarom: ['нижче порога 15 %', 'onder de drempel van 15 %'], soort: 'huis.apparaat', gewicht: 'belangrijk', doel: 'batterijraam', ongelezen: true, dienst: 'apparaten' }
    ];
    // запит оптимізатора за режимом «Питати» — лише разом зі справжнім дозволом і записами про нього
    var verzoek = zaaiVerzoek(w);
    if (verzoek) {
      if (verzoek.dozvil) regels.push({ tijd: verzoek.dozvil, maker: M.olena, wat: ['Дозвіл «' + verzoek.actie.naam[0] + '» для «' + M.opt.naam[0] + '»', 'Toestemming ‘' + verzoek.actie.naam[1] + '’ voor ‘' + M.opt.naam[1] + '’'], was: HV.gevaar.standNamen.uit, werd: HV.gevaar.standNamen.vragen, soort: 'huis.systeem' });
      regels.push({ tijd: verzoek.sinds, maker: M.opt, wat: ['Запит: ' + verzoek.actie.naam[0], 'Verzoek: ' + verzoek.actie.naam[1]], waarom: ['дозвіл «Питати»', 'toestemming ‘Vragen’'], soort: 'huis.agent', gewicht: 'belangrijk', doel: verzoek.doel, ongelezen: true });
    }
    regels.forEach(function (r) {
      if (r.tijd > w.tijd - MIN / 2) return;
      w.logboek.push({
        id: 'l' + (++w.logTeller), tijd: r.tijd, maker: r.maker, wat: r.wat, waarom: r.waarom || null, was: r.was || null, werd: r.werd || null, toegestaan: r.toegestaan || null,
        soort: r.soort, gewicht: r.gewicht || 'info', doel: r.doel || null, gelezen: !r.ongelezen, sim: true, dienst: r.dienst || null, keten: r.keten || null, terug: r.terug || null, via: r.via || null
      });
    });
    w.logboek.sort(function (a, b) { return b.tijd - a.tijd; });
  }

  /**
   * Демо-запит за режимом «Питати»: оптимізатор просить запустити посудомийну, доки триває найдешевше вікно ціни.
   * «Вимкнено» означає «не може зовсім», тому запит існує лише разом зі справжнім дозволом «Питати» (у демо-домі його
   * раніше дала власниця — про це окремий запис Журналу) і лише там, де він доречний: є живий зв'язок, немає тривоги,
   * хтось удома, машина стоїть, сценарій не має власної поради оптимізатора, а ціна з таблиці тарифу справді найнижча
   * на найближчі 8 год. Число в поясненні береться з HV.tarief, а не з рядка. Схвалення виконує саме цю дію через HV.doe.
   * Повертає { actie, doel, sinds, dozvil } або null.
   */
  function zaaiVerzoek(w) {
    if (w.gegevens !== 'live' || w.nood || !HV.tarief) return null;
    if (w.verzoeken.some(function (v) { return v.id === 'vlb1'; })) return null;
    var a = w.apparaten.vaatwasser;
    if (!a || a.beschikbaar !== 'ok' || a.st.loopt || a.wacht) return null;
    if (!w.mensen.some(function (m) { return m.thuis; })) return null;
    if (w.nu.some(function (n) { return n.maker === 'optimalisatie'; })) return null;
    var stand = HV.gevaar.stand('optimalisatie', 'programma.start');
    if (stand === 'altijd') return null; // із «Завжди» оптимізатор не питає
    // вікно: від поточної години, доки ціна тримається біля теперішньої; після нього 8 год від «зараз» мають бути дорожчі
    var uur0 = Math.floor(w.tijd / UUR) * UUR, nu = HV.tarief.prijs(w.tijd), top = nu, einde = uur0 + UUR, i;
    while (einde < uur0 + 4 * UUR && HV.tarief.prijs(einde) <= nu + 0.015) { top = Math.max(top, HV.tarief.prijs(einde)); einde += UUR; }
    for (i = einde; i <= uur0 + 8 * UUR; i += UUR) if (HV.tarief.prijs(i) <= top) return null;
    var actie = HV.gevaar.actie('programma.start'), prog = a.st.programma || ['Економний', 'Eco'];
    var sinds = Math.max(uur0 + 2 * MIN, w.tijd - 25 * MIN), dozvil = null;
    if (sinds > w.tijd - MIN) return null; // година щойно почалася: запитові ще немає звідки взятися
    if (stand === 'uit') { HV.gevaar.zetStandStil('optimalisatie', 'programma.start', 'vragen'); dozvil = sinds - 15 * MIN; }
    w.verzoeken.push({ id: 'vlb1', uitvoerder: 'optimalisatie', sleutel: actie.sleutel, doel: a.id, mogelijkheid: 'programma', waarde: 'start', sinds: sinds, tot: einde, stand: 'wacht',
      wat: [actie.naam[0] + ': ' + a.naam[0], actie.naam[1] + ': ' + a.naam[1]],
      waarom: ['до ' + HV.tijd(einde) + ' кВт·год коштує щонайбільше ' + HV.euro(top) + ' — найдешевше на найближчі 8 год; програма «' + prog[0] + '»', 'tot ' + HV.tijd(einde) + ' kost een kWh hooguit ' + HV.euro(top) + ' — het goedkoopst in de komende 8 uur; programma ‘' + prog[1] + '’'] });
    w.nu.push({ id: 'verzoek-vlb1', soort: 'verzoek', maker: 'optimalisatie', icoon: 'circle-help', verzoek: 'vlb1', sinds: sinds, tekst: ['Оптимізатор енергії просить запустити посудомийну', 'Energie-optimalisatie vraagt de vaatwasser te starten'],
      acties: [{ naam: 'verzoek-ja', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'], gegevens: { verzoek: 'vlb1' } }, { naam: 'verzoek-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { verzoek: 'vlb1' } }] });
    return { actie: actie, doel: a.id, sinds: sinds, dozvil: dozvil };
  }

  // ───────────────────────── Спільні помічники ─────────────────────────
  var magWijzigen = function () { var r = HV.rol(); return r === 'eigenaar' || r === 'bewoner'; };
  var volwassen = function () { var r = HV.rol(); return r === 'eigenaar' || r === 'bewoner'; };
  function weigerVerbinding() {
    HV.meld({ gewicht: 'belangrijk', icoon: 'wifi-off', titel: t('Не змінено: немає зв’язку з домом', 'Niet gewijzigd: geen verbinding met het huis'), tekst: t('Показано останній знімок, лише перегляд. Черги команд немає.', 'Je ziet de laatste momentopname, alleen bekijken. Er is geen wachtrij.') });
  }
  function weigerRol(tekst) {
    HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не змінено', 'Niet gewijzigd'), tekst: tekst || t('Чому ні: це змінює власник або мешканець. Що можна натомість: попросіть їх.', 'Waarom niet: dit wijzigt de eigenaar of een bewoner. Wat wel kan: vraag het hun.') });
  }
  function bewaar(X) { return kopie({ regels: X.regels, stil: X.stil, escalatie: X.escalatie, taal: X.taal, simBuiten: X.simBuiten, onderhoud: X.onderhoud, batterijen: X.batterijen, correcties: X.correcties }); }
  function herstel(X, v) { for (var k in v) X[k] = kopie(v[k]); }

  /**
   * Зміна стану Журналу (правила, обслуговування, виправлення): ворота зв'язку й ролі → зміна → запис Журналу з автором
   * «людина» і «було → стало» → сповіщення з «Повернути» (відновлює знімок і пише окремий запис).
   * p: { wat, was, werd, waarom, pas(X, w), terug(X, w)?, soort, gewicht, dienst, icoon, rol:false, geenTerug, stil, rolTekst }
   */
  function wijzig(p) {
    var w = HV.staat.w;
    if (w.gegevens === 'geen') { weigerVerbinding(); return null; }
    if (p.rol !== false && !magWijzigen()) { weigerRol(p.rolTekst); return null; }
    var X = L(w), voor = bewaar(X), mens = HV.mens();
    HV.staat.wijzig(function (x) { p.pas(L(x), x); });
    var regel = HV.logboek.voegToe({ maker: mens, wat: p.wat, was: p.was || null, werd: p.werd || null, waarom: p.waarom || null, soort: p.soort || 'huis.systeem', gewicht: p.gewicht || 'info', doel: p.doel || null });
    regel.dienst = p.dienst || 'systeem';
    if (!p.stil) {
      HV.meld({
        maker: mens, icoon: p.icoon || 'bell-ring', titel: HV.p(p.wat),
        tekst: p.was && p.werd ? HV.p(p.was) + ' → ' + HV.p(p.werd) : (p.tekst ? HV.p(p.tekst) : ''),
        terug: p.geenTerug ? null : function () {
          HV.staat.wijzig(function (x) { var Y = L(x); herstel(Y, voor); if (p.terug) p.terug(Y, x); });
          var e = HV.logboek.voegToe({ maker: mens, wat: ['Повернуто: ' + p.wat[0], 'Ongedaan gemaakt: ' + p.wat[1]], soort: regel.soort, doel: regel.doel });
          e.dienst = regel.dienst;
        }
      });
    }
    return regel;
  }

  /** Файл для збереження (CSV): справжнє завантаження там, де браузер дозволяє. */
  function bewaarBestand(naam, inhoud) {
    try {
      var blob = new Blob(['﻿' + inhoud], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = naam; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { /* уже прибрано */ } }, 800);
      return true;
    } catch (e) { return false; }
  }
  var csvVeld = function (s) { s = String(s == null ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function dagLabel(tm, nu) {
    var d = Math.floor(tm / DAG), n = Math.floor(nu / DAG);
    if (d === n) return t('Сьогодні', 'Vandaag');
    if (d === n - 1) return t('Вчора', 'Gisteren');
    return HV.datum(tm);
  }
  function chips(naam, waarde, lijst, label) {
    return '<div class="hv-filter hv-lb-filter" role="group" aria-label="' + h(label) + '">' + lijst.map(function (x) {
      return o.chip({ filter: true, gekozen: String(waarde) === String(x[0]), tekst: x[1], icoon: x[2] || null, actie: 'ui', gegevens: { naam: naam, waarde: x[0] }, k: naam + '-' + x[0] });
    }).join('') + '</div>';
  }
  /** Сегмент без власного стану (o.segment) із підписом зверху. */
  function veld(label, inhoud, extra) {
    return '<div class="hv-lb-veld"><span class="hv-lb-veld__label">' + h(label) + (extra || '') + '</span>' + inhoud + '</div>';
  }
  function kaartKop(icoon, titel, rechts, toon) {
    return '<header class="hv-lb-kaartkop' + (toon ? ' hv-toon-' + toon : '') + '"><h3>' + ic(icoon, 'm') + '<span>' + h(titel) + '</span></h3>' + (rechts ? '<span class="hv-lb-kaartkop__rechts">' + rechts + '</span>' : '') + '</header>';
  }
  function slot(tekst) { return '<p class="hv-lb-slot">' + ic('lock') + '<span>' + h(tekst) + '</span></p>'; }

  // ───────────────────────── Хто отримав ─────────────────────────
  function isStil(X, tm) {
    var s = X.stil;
    if (!s.aan) return false;
    var u = HV.uur(tm), dag = new Date(tm).getUTCDay();
    var binnen = s.van > s.tot ? (u >= s.van || u < s.tot) : (u >= s.van && u < s.tot);
    if (!binnen) return false;
    // ніч належить вечору, з якого вона почалася: «будні» — ночі перед робочим днем (нд–чт), «вихідні» — пт і сб
    var begin = u < s.tot && s.van > s.tot ? (dag + 6) % 7 : dag;
    if (s.dagen === 'werk') return begin <= 4;
    if (s.dagen === 'weekend') return begin === 5 || begin === 6;
    return true;
  }
  function uurTekst(u) { var hh = Math.floor(u), mm = Math.round((u - hh) * 60); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }

  /** Кому й якими каналами пішов запис (за чинними правилами): [{ mens, kanalen:[id], stil }]. */
  function ontvangers(r, X) {
    var w = HV.staat.w, d = dienstVan(r), regel = X.regels[d] || startRegels()[d];
    var gewicht = r.gewicht || 'info';
    var verzoek = /^Запит|^Verzoek/.test(r.wat ? r.wat[1] || '' : '') || r.soort === 'huis.agent' && gewicht === 'belangrijk';
    var drempel = regel.vanaf === 'nooit' ? 9 : GEWICHT_RANG[regel.vanaf] || 0;
    var beschermd = DIENST[d].beschermd && GEWICHT_RANG[gewicht] >= 1;
    if (GEWICHT_RANG[gewicht] < drempel && !beschermd) return [];
    var mensen = w.mensen.filter(function (m) {
      if (regel.wie === 'iedereen') return true;
      if (regel.wie === 'eigenaar') return m.rol === 'eigenaar';
      if (regel.wie === 'volwassenen') return m.rol === 'eigenaar' || m.rol === 'bewoner';
      return m.thuis || m.rol === 'eigenaar';
    });
    var stil = isStil(X, r.tijd) && !(gewicht === 'alarm' || (gewicht === 'belangrijk' && X.stil.belangrijk) || (verzoek && X.stil.verzoek));
    return mensen.map(function (m) {
      var k = ['app'];
      if (regel.push) k.push('push');
      if (regel.mail) k.push('mail');
      if (regel.scherm) k.push('scherm');
      if (regel.geluid && gewicht === 'alarm') k.push('geluid');
      if (stil) k = k.filter(function (x) { return x === 'app' || x === 'mail'; });
      return { mens: m, kanalen: k, stil: stil };
    });
  }
  function ontvangersTekst(r, X) {
    var l = ontvangers(r, X);
    if (!l.length) return t('нікому: лише в Журналі', 'niemand: alleen in het logboek');
    var stil = l[0].stil;
    return l.map(function (x) { return HV.p(x.mens.naam) + ' (' + x.kanalen.map(function (k) { return HV.p(KANALEN.filter(function (c) { return c.id === k; })[0].naam).toLowerCase(); }).join(', ') + ')'; }).join(' · ') + (stil ? ' · ' + t('тихі години: без звуку', 'stille uren: zonder geluid') : '');
  }
  function voorMij(r, X) {
    var ik = HV.mens().id;
    if (r.maker && r.maker.soort === 'mens' && HV.p(r.maker.naam) === HV.p(HV.mens().naam)) return true;
    return ontvangers(r, X).some(function (x) { return x.mens.id === ik && x.kanalen.length > 1; });
  }

  // ───────────────────────── «Тривають» і «Чекають рішення» ─────────────────────────
  function lopend(w, X) {
    var uit = [];
    var A = w.apparaten;
    var nood = w.volgorde.map(function (id) { return A[id]; }).filter(function (a) { return (a.soort === 'rook' || a.soort === 'lek' || a.soort === 'co') && a.st.alarm; });
    nood.forEach(function (a) { uit.push({ id: 'alarm-' + a.id, icoon: 'alarm-smoke', toon: 'alarm', tekst: P(HV.staat.kamer(a.kamer).naam) + ': ' + P(a.naam) + ' — ' + t('тривога', 'alarm'), sinds: w.tijd, acties: [{ tekst: t('Відкрити', 'Openen'), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }] }); });
    if (w.gegevens !== 'live') uit.push({ id: 'verbinding', icoon: w.gegevens === 'geen' ? 'wifi-off' : 'refresh-cw', toon: 'let-op', tekst: w.gegevens === 'geen' ? t('Немає зв’язку з домом: показано останній знімок', 'Geen verbinding met het huis: laatste momentopname') : t('Потік мовчить: оновлення раз на 30 с', 'De stroom zwijgt: verversen elke 30 s'), sinds: w.gegevensSinds || w.tijd, acties: [] });
    if (w.zelfGestopt) uit.push({ id: 'gestopt', icoon: 'pause', toon: 'let-op', tekst: t('Самостійні дії зупинено: автоматизації, агенти й оптимізатор чекають', 'Zelfstandige acties gestopt: automatiseringen, agenten en optimalisatie wachten'), sinds: w.tijd, acties: [{ tekst: t('Відновити', 'Hervatten'), actie: 'zelfstop', gegevens: { stop: '' } }] });
    HV.kijk.open().forEach(function (x) {
      var a = x.apparaat;
      uit.push({ id: 'open-' + a.id, icoon: 'door-open', toon: 'let-op', tekst: P(HV.staat.kamer(a.kamer).naam) + ': ' + P(a.naam).toLowerCase() + ' ' + t('відчинене ', 'open sinds ') + HV.duur(x.minuten), sinds: a.st.sinds || w.tijd, acties: [{ tekst: t('Чому?', 'Waarom?'), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }] });
    });
    w.volgorde.forEach(function (id) {
      var a = A[id];
      if (a.beschikbaar === 'onbereikbaar') uit.push({ id: 'dood-' + a.id, icoon: 'unplug', toon: 'let-op', tekst: P(a.naam) + ': ' + HV.woord.onbereikbaar() + t(' з ', ' sinds ') + HV.tijd(a.gezien), sinds: a.gezien, acties: [{ tekst: t('Що перевірити', 'Wat te controleren'), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }] });
      else if (a.beschikbaar === 'verouderd') uit.push({ id: 'oud-' + a.id, icoon: 'history', toon: 'let-op', tekst: P(HV.staat.kamer(a.kamer).naam) + ': ' + P(a.naam).toLowerCase() + ' — ' + HV.woord.verouderd() + ' ' + HV.oud(HV.kijk.leeftijd(a)), sinds: a.gezien, acties: [{ tekst: t('Відкрити', 'Openen'), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }] });
    });
    ['wasmachine', 'droger', 'vaatwasser'].forEach(function (id) {
      var a = A[id];
      if (a && a.st.loopt) uit.push({ id: 'loopt-' + id, icoon: HV.paspoort.soorten[a.soort].icoon, toon: 'aan', tekst: P(a.naam) + ': ' + t('ще ', 'nog ') + HV.duur(a.st.rest), sinds: w.tijd - (95 - a.st.rest) * MIN, acties: [{ tekst: t('Відкрити', 'Openen'), actie: 'blad', gegevens: { blad: 'apparaat:' + id } }] });
    });
    if (A.laadpaal && A.laadpaal.st.laadt) uit.push({ id: 'laadt', icoon: 'plug-zap', toon: 'auto', tekst: t('Авто заряджається: ', 'De auto laadt: ') + HV.maatTekst(A.laadpaal.st.vermogen, t('кВт', 'kW'), 1), sinds: w.tijd, acties: [{ tekst: t('План зарядки', 'Laadplan'), actie: 'ga', gegevens: { naar: 'energie-laden' } }] });
    if (isStil(X, w.tijd)) uit.push({ id: 'stil', icoon: 'moon', toon: 'neutraal', tekst: t('Тихі години до ', 'Stille uren tot ') + uurTekst(X.stil.tot) + t(': телефони без звуку, тривоги проходять', ': telefoons zonder geluid, alarmen komen door'), sinds: w.tijd, acties: [{ tekst: t('Правила', 'Regels'), actie: 'ga', gegevens: { naar: 'activiteit-regels' } }] });
    return uit;
  }

  function lopendRij(x, w) {
    var min = Math.max(0, Math.round((w.tijd - x.sinds) / MIN));
    return '<li class="hv-lb-loopt hv-toon-' + h(x.toon) + '" data-k="loopt-' + h(x.id) + '"><span class="hv-lb-loopt__teken">' + ic(x.icoon, 'm') + '</span>' +
      '<div class="hv-lb-loopt__tekst"><p>' + h(x.tekst) + '</p>' + (min > 1 ? '<p class="hv-lb-meta">' + h(t('триває ', 'duurt al ') + HV.duur(min)) + '</p>' : '') + '</div>' +
      (x.acties.length ? '<div class="hv-lb-loopt__acties">' + x.acties.map(function (a) { return o.knop({ tekst: a.tekst, klein: true, soort: 'gewoon', actie: a.actie, gegevens: a.gegevens }); }).join('') + '</div>' : '') + '</li>';
  }

  function verzoekKaart(v, w) {
    var wie = HV.gevaar.uitvoerder(v.uitvoerder), actie = HV.gevaar.actie(v.sleutel);
    var maker = { soort: wie.soort, naam: wie.naam };
    var rest = v.tot ? Math.round((v.tot - w.tijd) / MIN) : null;
    // чинний дозвіл виконавця: запит має сенс лише за «Питати»; якщо власник тим часом поставив «Вимкнено» — схвалити не можна
    var stand = actie.sleutel === 'onbekend' ? null : HV.gevaar.stand(v.uitvoerder, v.sleutel), dicht = stand === 'uit';
    var rijen = [[t('Хто', 'Wie'), o.maker(maker)], [t('Що', 'Wat'), h(P(v.wat))]];
    if (v.waarom) rijen.push([t('Чому', 'Waarom'), h(P(v.waarom))]);
    rijen.push([t('Чекає до', 'Wacht tot'), v.tot ? h(HV.tijd(v.tot) + (rest > 0 ? ' · ' + t('ще ', 'nog ') + HV.duur(rest) : ' · ' + t('час минув', 'tijd verstreken'))) : h(t('без строку', 'zonder termijn'))]);
    rijen.push([t('Рівень дії', 'Niveau'), o.risico(actie.niveau)]);
    if (stand) rijen.push([t('Дозвіл зараз', 'Toestemming nu'), h(t('«', '‘') + P(HV.gevaar.standNamen[stand]) + t('»', '’') + ' · ' + t('змінює лише власник', 'alleen de eigenaar wijzigt dit'))]);
    return '<article class="hv-verzoek" data-k="vz-' + h(v.id) + '"><div class="hv-verzoek__kop">' + ic('circle-help', 'm') + '<h4>' + h(P(wie.naam) + t(' просить дозволу', ' vraagt toestemming')) + '</h4>' + o.chip({ icoon: 'hourglass', tekst: t('чекає', 'wacht'), toon: 'let-op' }) + '</div>' +
      '<dl class="hv-lb-dl">' + rijen.map(function (x) { return '<div><dt>' + h(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>' +
      (dicht ? '<p class="hv-lb-noot hv-lb-noot--let-op">' + ic('lock') + h(t('Дозвіл цього виконавця тепер «Вимкнено», тож ця дія йому недоступна. Відхиліть запит або поверніть «Питати» в дозволах.', 'De toestemming van deze uitvoerder staat nu op ‘Uit’, dus deze actie mag hij niet doen. Wijs het verzoek af of zet de toestemming terug op ‘Vragen’.')) + '</p>' : '') +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Схвалити раз', 'Eén keer goedkeuren'), icoon: 'check', soort: dicht ? 'gewoon' : 'hoofd', actie: dicht ? null : 'verzoek-ja', gegevens: dicht ? null : { verzoek: v.id }, uit: dicht }) +
      o.knop({ tekst: t('Відхилити', 'Afwijzen'), icoon: 'x', actie: 'verzoek-nee', gegevens: { verzoek: v.id } }) +
      o.knop({ tekst: t('Дозволи', 'Toestemmingen'), icoon: 'shield-check', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-risico' } }) +
      o.gevolg(t('Що станеться: «Схвалити раз» виконає саме цю дію один раз; дозвіл виконавця лишиться «Питати». Пов’язано з: дія й рішення — два записи в Журналі. Як повернути: після виконання — «Повернути» у сповіщенні.', 'Wat er gebeurt: ‘Eén keer goedkeuren’ voert precies deze actie één keer uit; de toestemming blijft ‘Vragen’. Hangt samen met: de actie en het besluit worden twee regels in het logboek. Terugdraaien: na het uitvoeren — ‘Ongedaan maken’ in de melding.')) + '</div></article>';
  }

  // ───────────────────────── Запис Журналу ─────────────────────────
  var kaal = function (s) { return String(s).replace(/[«»‘’“”"']/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); };
  /** «Було → стало» запису словами; null, коли зміни немає (однакові значення — не зміна: «заряджається → заряджається»). */
  function wijzigingVan(r) {
    if (!r.was || !r.werd) return null;
    var was = P(r.was), werd = P(r.werd);
    return !was || !werd || kaal(was) === kaal(werd) ? null : { was: was, werd: werd };
  }
  /**
   * Заголовок запису без повтору: якщо назва закінчується новим значенням, а поруч стоїть «було → стало»,
   * значення з назви прибирається — «Торшер: 40 %» + «60 % → 40 %» стає «Торшер» + «60 % → 40 %»,
   * «Колонка на кухні: гучність 15 %» + «24 % → 15 %» — «Колонка на кухні: гучність» + «24 % → 15 %».
   */
  function kopVan(r) {
    var wat = P(r.wat), d = wijzigingVan(r), i = wat.lastIndexOf(': ');
    if (!d || i <= 0) return { naam: wat, delta: d };
    var staart = wat.slice(i + 2), n = staart.length - d.werd.length;
    if (kaal(staart) === kaal(d.werd)) return { naam: wat.slice(0, i), delta: d };
    if (n > 1 && staart.slice(n).toLowerCase() === d.werd.toLowerCase() && /\s/.test(staart.charAt(n - 1))) return { naam: wat.slice(0, i + 2 + n).trim(), delta: d };
    return { naam: wat, delta: d };
  }
  /** Чип «було → стало»: старе приглушене, нове — основним кольором; стрілка — знак, слова — для зчитувача. */
  function deltaChip(d) {
    return '<span class="hv-lb-wijziging"><span class="hv-lb-wijziging__was"><span class="hv-vo">' + h(t('було', 'was')) + ' </span>' + h(d.was) + '</span>' + ic('arrow-right') +
      '<span class="hv-lb-wijziging__werd"><span class="hv-vo">' + h(t('стало', 'werd')) + ' </span>' + h(d.werd) + '</span></span>';
  }
  function makerFilterPast(r, maker) {
    if (maker === 'alle') return true;
    var s = r.maker ? r.maker.soort : 'systeem';
    if (maker === 'scene') return s === 'scene' || !!r.via;
    return s === maker;
  }
  function zoekPast(r, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var tekst = [P(r.wat), r.waarom ? P(r.waarom) : '', r.maker ? P(r.maker.naam) : '', r.was ? P(r.was) : '', r.werd ? P(r.werd) : '', P(DIENST[dienstVan(r)].naam)].join(' ').toLowerCase();
    return tekst.indexOf(q) >= 0;
  }
  function filters() {
    return { dienst: HV.ui.lees('lb-dienst', 'alle'), maker: HV.ui.lees('lb-maker', 'alle'), gewicht: HV.ui.lees('lb-gewicht', 'alle'), alleen: HV.ui.lees('lb-alleen', 'alle'), zoek: HV.ui.lees('lb-zoek', '') || '' };
  }
  function past(r, f, X, w) {
    var st = X.status[r.id] || {};
    var gesluimerd = st.sluimer && st.sluimer > w.tijd;
    if (f.alleen === 'gesluimerd') { if (!gesluimerd) return false; }
    else if (gesluimerd) return false;
    if (f.alleen === 'ongelezen' && r.gelezen) return false;
    if (f.alleen === 'voormij' && !voorMij(r, X)) return false;
    if (f.dienst !== 'alle' && dienstVan(r) !== f.dienst) return false;
    if (f.gewicht !== 'alle' && r.gewicht !== f.gewicht) return false;
    if (!makerFilterPast(r, f.maker)) return false;
    return zoekPast(r, f.zoek);
  }
  function sleutelVan(r) { return P(r.wat) + '|' + (r.maker ? r.maker.soort + P(r.maker.naam) : '') + '|' + dienstVan(r); }
  /** Однотипне за 60 с згортається в один рядок «×N». */
  function groepeer(lijst) {
    var groepen = [];
    lijst.forEach(function (r) {
      var g = groepen[groepen.length - 1];
      if (g && g.sleutel === sleutelVan(r) && g.leden[g.leden.length - 1].tijd - r.tijd <= MIN) { g.leden.push(r); return; }
      groepen.push({ sleutel: sleutelVan(r), leden: [r] });
    });
    return groepen;
  }

  function kanTerug(r) {
    if (!r.terug) return false;
    var a = HV.staat.w.apparaten[r.terug.doel];
    return !!a && a.beschikbaar !== 'onbereikbaar';
  }

  function details(r, X, w, leden, inBlad) {
    var d = DIENST[dienstVan(r)], st = X.status[r.id] || {};
    var rijen = [[t('Хто', 'Wie'), o.maker(r.maker) + (r.via ? '<span class="hv-lb-via">' + h(t('через сцену «', 'via scène ‘') + P(r.via) + t('»', '’')) + '</span>' : '')], [t('Що', 'Wat'), h(P(r.wat))]];
    if (r.waarom) rijen.push([t('Чому', 'Waarom'), h(P(r.waarom))]);
    if (r.toegestaan) rijen.push([t('Дозволено через', 'Toegestaan via'), h(P(r.toegestaan))]);
    else if (r.maker && r.maker.soort === 'mens') rijen.push([t('Дозволено через', 'Toegestaan via'), h(t('роль людини', 'rol van de persoon'))]);
    rijen.push([t('Служба', 'Dienst'), ic(d.icoon) + ' ' + h(P(d.naam))]);
    rijen.push([t('Важливість', 'Gewicht'), h(P(GEWICHT[r.gewicht] || GEWICHT.info))]);
    rijen.push([t('Хто отримав', 'Ontvangen door'), h(ontvangersTekst(r, X))]);
    rijen.push([t('Час дому', 'Huistijd'), h(HV.datum(r.tijd) + ' · ' + HV.tijd(r.tijd)) + (leden && leden.length > 1 ? '<span class="hv-lb-meta"> · ' + h(t('ще о ', 'ook om ') + leden.slice(1).map(function (x) { return HV.tijd(x.tijd); }).join(', ')) + '</span>' : '')]);
    rijen.push([t('Запис', 'Regel'), '<span class="hv-lb-code">' + h(r.id) + '</span>' + (r.sim ? ' ' + o.chip({ icoon: 'flask-conical', tekst: t('симуляція', 'simulatie'), toon: 'sim', klas: 'hv-lb-simchip' }) : '')]);
    var delta = (r.was || r.werd) && !(r.was && r.werd && !wijzigingVan(r)) ? '<div class="hv-lb-delta" aria-label="' + h(t('Було → стало', 'Was → werd')) + '"><span class="hv-lb-delta__was"><small>' + h(t('було', 'was')) + '</small>' + h(r.was ? P(r.was) : '—') + '</span>' + ic('arrow-right', 'm') + '<span class="hv-lb-delta__werd"><small>' + h(t('стало', 'werd')) + '</small>' + h(r.werd ? P(r.werd) : '—') + '</span></div>' : '';
    var keten = r.keten && !inBlad ? '<ol class="hv-lb-keten" aria-label="' + h(t('Ланцюг: що запустило → умова → дія', 'Keten: aanleiding → voorwaarde → actie')) + '">' + r.keten.map(function (s, i) {
      return '<li><span class="hv-lb-keten__stap">' + h([t('Що запустило', 'Aanleiding'), t('Умова', 'Voorwaarde'), t('Дія', 'Actie')][i]) + '</span><span>' + h(P(s)) + '</span></li>';
    }).join('') + '</ol>' : '';
    var acties = [];
    if (kanTerug(r)) acties.push(o.knop({ tekst: t('Повернути', 'Ongedaan maken'), icoon: 'undo-2', soort: 'hoofd', actie: 'lb-terug', gegevens: { id: r.id } }));
    if (r.doel && w.apparaten[r.doel]) acties.push(o.knop({ tekst: t('Відкрити пристрій', 'Apparaat openen'), icoon: HV.paspoort.soorten[w.apparaten[r.doel].soort].icoon, actie: 'blad', gegevens: { blad: 'apparaat:' + r.doel } }));
    if (!inBlad) acties.push(o.knop({ tekst: t('Чому?', 'Waarom?'), icoon: 'circle-help', actie: 'blad', gegevens: { blad: 'waarom:' + r.id } }));
    acties.push(o.knop({ tekst: r.gelezen ? t('Непрочитане', 'Ongelezen') : t('Прочитане', 'Gelezen'), icoon: r.gelezen ? 'bell-dot' : 'check', soort: 'stil', actie: 'lb-gelezen', gegevens: { id: r.id } }));
    acties.push(st.sluimer && st.sluimer > w.tijd ? o.knop({ tekst: t('Повернути зі сну', 'Weer tonen'), icoon: 'alarm-clock', soort: 'stil', actie: 'lb-wek', gegevens: { id: r.id } }) : o.knop({ tekst: t('Відкласти на 1 год', '1 uur uitstellen'), icoon: 'alarm-clock', soort: 'stil', actie: 'lb-sluimer', gegevens: { id: r.id } }));
    acties.push(o.knop({ tekst: t('Сповіщення служби', 'Meldingen van de dienst'), icoon: 'sliders-horizontal', soort: 'stil', actie: 'lb-naar-regel', gegevens: { dienst: d.id } }));
    if (r.toegestaan) acties.push(o.knop({ tekst: t('Дозволи', 'Toestemmingen'), icoon: 'shield-check', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-risico' } }));
    return '<div class="hv-lb-m__details">' + delta + keten + '<dl class="hv-lb-dl">' + rijen.map(function (x) { return '<div><dt>' + h(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="hv-knoppen hv-lb-m__acties">' + acties.join('') + '</div></div>';
  }

  function melding(g, X, w, openId) {
    var r = g.leden[0], d = DIENST[dienstVan(r)], open = openId === r.id;
    var kop = open ? { naam: P(r.wat), delta: null } : kopVan(r); // розгорнутий запис показує «було → стало» великим блоком
    var st = X.status[r.id] || {};
    var gesluimerd = st.sluimer && st.sluimer > w.tijd;
    var ongelezen = g.leden.some(function (x) { return !x.gelezen; });
    var meta = [o.maker(r.maker), '<span class="hv-lb-dienstwoord">' + h(P(d.naam)) + '</span>'];
    if (r.via) meta.push('<span>' + h(t('через «', 'via ‘') + P(r.via) + t('»', '’')) + '</span>');
    if (gesluimerd) meta.push('<span class="hv-lb-sluimer">' + ic('alarm-clock') + h(t('до ', 'tot ') + HV.tijd(st.sluimer)) + '</span>');
    if (r.sim) meta.push(ic('flask-conical', 'maker').replace('class="hv-ic', 'class="hv-lb-sim hv-ic'));
    return '<li class="hv-lb-m hv-lb-m--' + h(r.gewicht || 'info') + (ongelezen ? ' is-ongelezen' : '') + (open ? ' is-open' : '') + '" data-k="m-' + h(r.id) + '">' +
      '<button type="button" class="hv-lb-m__kop" aria-expanded="' + (open ? 'true' : 'false') + '" data-actie="lb-open" data-id="' + h(r.id) + '">' +
      '<span class="hv-lb-m__teken hv-lb-teken--' + h(r.gewicht || 'info') + '">' + ic(r.gewicht === 'alarm' ? 'alarm-smoke' : d.icoon, 'm') + '</span>' +
      '<span class="hv-lb-m__lijf"><span class="hv-lb-m__wat">' + (ongelezen ? '<span class="hv-lb-punt" aria-label="' + h(t('непрочитане', 'ongelezen')) + '"></span>' : '') + h(kop.naam) +
      (g.leden.length > 1 ? ' <span class="hv-lb-maal">×' + g.leden.length + '</span>' : '') + '</span>' +
      (kop.delta ? deltaChip(kop.delta) : '') +
      '<span class="hv-lb-m__meta">' + meta.join('<span class="hv-punt" aria-hidden="true">·</span>') + '</span></span>' +
      '<span class="hv-lb-m__rechts"><span class="hv-lb-m__tijd">' + HV.tijd(r.tijd) + '</span>' + (r.gewicht !== 'info' ? '<span class="hv-lb-gewicht hv-lb-gewicht--' + h(r.gewicht) + '">' + ic(r.gewicht === 'alarm' ? 'octagon-alert' : 'triangle-alert') + h(P(GEWICHT[r.gewicht])) + '</span>' : '') + '</span>' +
      ic('chevron-down', 's').replace('class="hv-ic', 'class="hv-lb-m__pijl hv-ic') + '</button>' +
      (open ? details(r, X, w, g.leden) : '') + '</li>';
  }

  // ───────────────────────── Вкладка «Сповіщення» ─────────────────────────
  function meldingen(ctx) {
    var w = ctx.staat, X = L(w), f = filters();
    var openId = HV.ui.lees('lb-open', null);
    var alle = w.logboek;
    var ongelezen = alle.filter(function (r) { return !r.gelezen; });
    var belangrijk = ongelezen.filter(function (r) { return r.gewicht !== 'info'; }).length;
    var alarmen = ongelezen.filter(function (r) { return r.gewicht === 'alarm'; });
    var wachten = w.verzoeken.filter(function (v) { return v.stand === 'wacht'; });
    var loopt = lopend(w, X);
    var stilNu = isStil(X, w.tijd);
    var gesluimerd = alle.filter(function (r) { var s = X.status[r.id]; return s && s.sluimer && s.sluimer > w.tijd; }).length;

    // ── зведення ──
    var kop = '<section class="hv-lb-kop" data-k="lb-kop">' +
      '<div class="hv-lb-kop__getal"><span class="hv-lb-kop__n">' + ongelezen.length + '</span><span class="hv-lb-kop__woord">' + h(HV.meervoud(ongelezen.length, ['непрочитане', 'непрочитані', 'непрочитаних'], ['ongelezen', 'ongelezen'])) + '</span></div>' +
      '<p class="hv-lb-kop__zin">' + h(alarmen.length ? t('Є тривога, яку ще не переглянули.', 'Er is een alarm dat nog niet is bekeken.') : belangrijk ? t('Важливих: ', 'Belangrijk: ') + belangrijk + t('. Решта — до відома.', '. De rest is ter info.') : t('Нічого термінового. Дім працює спокійно.', 'Niets dringends. Het huis draait rustig.')) + '</p>' +
      '<div class="hv-lb-kop__chips">' +
      o.chip({ icoon: 'octagon-alert', tekst: t('тривог ', 'alarmen ') + alarmen.length, toon: alarmen.length ? 'alarm' : null }) +
      o.chip({ icoon: 'triangle-alert', tekst: t('важливих ', 'belangrijk ') + belangrijk, toon: belangrijk ? 'let-op' : null }) +
      o.chip({ icoon: 'circle-help', tekst: t('запитів ', 'verzoeken ') + wachten.length, toon: wachten.length ? 'let-op' : null }) +
      o.chip({ icoon: stilNu ? 'moon' : 'bell-ring', tekst: X.stil.aan ? (stilNu ? t('тихі години до ', 'stil tot ') + uurTekst(X.stil.tot) : t('тихі години з ', 'stil vanaf ') + uurTekst(X.stil.van)) : t('тихі години вимкнено', 'stille uren uit'), actie: 'ga', gegevens: { naar: 'activiteit-regels' }, k: 'kop-stil' }) +
      '</div>' +
      '<div class="hv-lb-kop__acties">' + (ongelezen.length ? o.knop({ tekst: t('Усе прочитано', 'Alles gelezen'), icoon: 'check-check', actie: 'lb-alles-gelezen' }) : o.knop({ tekst: t('Усе прочитано', 'Alles gelezen'), gedrukt: true })) +
      o.knop({ tekst: t('Правила', 'Regels'), icoon: 'sliders-horizontal', soort: 'stil', actie: 'ga', gegevens: { naar: 'activiteit-regels' } }) + '</div></section>';

    // ── фільтри ──
    var actief = (f.dienst !== 'alle') + (f.maker !== 'alle') + (f.gewicht !== 'alle') + (f.zoek ? 1 : 0);
    var filtersOpen = !!HV.ui.lees('lb-filters', false);
    var tel = function (fn) { return alle.filter(fn).length; };
    var dienstRijen = [['alle', t('Усі служби', 'Alle diensten'), 'layers', alle.length]].concat(DIENSTEN.map(function (d) { return [d.id, P(d.naam), d.icoon, tel(function (r) { return dienstVan(r) === d.id; })]; }));
    var zij = '<aside class="hv-lb-zij' + (filtersOpen ? ' is-open' : '') + '" aria-label="' + h(t('Фільтри Журналу', 'Filters van het logboek')) + '" data-k="lb-zij">' +
      '<button type="button" class="hv-lb-zij__wissel" aria-expanded="' + (filtersOpen ? 'true' : 'false') + '" data-actie="ui" data-naam="lb-filters" data-waarde="' + (filtersOpen ? '' : '1') + '">' + ic('sliders-horizontal', 'm') + '<span>' + h(t('Служба й фільтри', 'Dienst en filters')) + (actief ? ' · ' + actief : '') + '</span>' + ic('chevron-down') + '</button>' +
      '<div class="hv-lb-zij__lijf">' +
      '<label class="hv-lb-zoek">' + ic('search', 'm') + '<span class="hv-vo">' + h(t('Пошук у Журналі', 'Zoeken in het logboek')) + '</span><input type="search" id="hv-lb-zoek" class="hv-lb-zoek__veld" value="' + h(f.zoek) + '" placeholder="' + h(t('Пошук: лампа, агент, батарея…', 'Zoeken: lamp, agent, batterij…')) + '" autocomplete="off"></label>' +
      '<h4 class="hv-lb-zij__kop">' + h(t('Служба', 'Dienst')) + '</h4><div class="hv-lb-diensten" role="group" aria-label="' + h(t('Служба', 'Dienst')) + '">' + dienstRijen.map(function (d) {
        var gekozen = f.dienst === d[0];
        return '<button type="button" class="hv-lb-dienst' + (gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="ui" data-naam="lb-dienst" data-waarde="' + h(d[0]) + '" data-k="dienst-' + h(d[0]) + '">' + ic(d[2], 'm') + '<span>' + h(d[1]) + '</span><b>' + d[3] + '</b></button>';
      }).join('') + '</div>' +
      '<h4 class="hv-lb-zij__kop">' + h(t('Важливість', 'Gewicht')) + '</h4>' + chips('lb-gewicht', f.gewicht, [['alle', t('усе', 'alles')], ['info', t('до відома', 'ter info')], ['belangrijk', t('важливо', 'belangrijk'), 'triangle-alert'], ['alarm', t('тривога', 'alarm'), 'octagon-alert']], t('Важливість', 'Gewicht')) +
      '<h4 class="hv-lb-zij__kop">' + h(t('Автор', 'Maker')) + '</h4>' + chips('lb-maker', f.maker, [['alle', t('усі', 'iedereen')]].concat(MAKERS.map(function (m) { return [m.id, P(m.naam), m.icoon]; })), t('Автор', 'Maker')) +
      (actief ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Скинути фільтри', 'Filters wissen'), icoon: 'x', soort: 'stil', actie: 'lb-filters-weg' }) + '</div>' : '') +
      '</div></aside>';

    // ── швидкі зрізи ──
    var zicht = o.segment({ label: t('Зріз', 'Weergave'), waarde: f.alleen, actie: 'lb-alleen', klas: 'hv-lb-zicht', k: 'lb-zicht', opties: [
      { id: 'alle', label: t('Усі', 'Alle') }, { id: 'voormij', label: t('Для мене', 'Voor mij'), icoon: 'user-check' }, { id: 'ongelezen', label: t('Нові', 'Nieuw') + (ongelezen.length ? ' ' + ongelezen.length : ''), icoon: 'bell-dot' },
      { id: 'gesluimerd', label: t('Відкладені', 'Uitgesteld') + (gesluimerd ? ' ' + gesluimerd : ''), icoon: 'alarm-clock' }] });

    // ── стрічка ──
    var lijst = alle.filter(function (r) { return past(r, f, X, w); });
    var kritiek = lijst.filter(function (r) { return r.gewicht === 'alarm' && !r.gelezen; });
    var rest = lijst.filter(function (r) { return kritiek.indexOf(r) < 0; });
    var max = Number(HV.ui.lees('lb-meer', 40)) || 40;
    var getoond = rest.slice(0, max);
    var dagen = [], huidige = null;
    groepeer(getoond).forEach(function (g) {
      var label = dagLabel(g.leden[0].tijd, w.tijd);
      if (!huidige || huidige.label !== label) { huidige = { label: label, groepen: [] }; dagen.push(huidige); }
      huidige.groepen.push(g);
    });
    var filterLeeg = f.dienst === 'alle' && f.maker === 'alle' && f.gewicht === 'alle' && !f.zoek && f.alleen === 'alle';
    var stroom = '';
    var looptAlle = !!HV.ui.lees('lb-loopt-alle', false);
    if (filterLeeg && loopt.length) stroom += '<section class="hv-lb-sectie" data-k="s-loopt"><h3 class="hv-lb-sectie__kop">' + ic('activity') + h(t('Тривають', 'Lopen nog')) + '<span class="hv-lb-teller">' + loopt.length + '</span></h3><ul class="hv-lb-lopend">' + (looptAlle ? loopt : loopt.slice(0, 3)).map(function (x) { return lopendRij(x, w); }).join('') +
      (loopt.length > 3 ? '<li class="hv-lb-loopt__meer" data-k="loopt-meer"><button type="button" class="hv-link" aria-expanded="' + (looptAlle ? 'true' : 'false') + '" data-actie="ui" data-naam="lb-loopt-alle" data-waarde="' + (looptAlle ? '' : '1') + '">' + h(looptAlle ? t('Згорнути', 'Inklappen') : t('Ще ', 'Nog ') + (loopt.length - 3) + t(' триває', ' lopend')) + '</button></li>' : '') + '</ul></section>';
    if ((filterLeeg || f.dienst === 'agenten') && wachten.length) stroom += '<section class="hv-lb-sectie" data-k="s-wacht"><h3 class="hv-lb-sectie__kop">' + ic('hourglass') + h(t('Чекають рішення', 'Wachten op besluit')) + '<span class="hv-lb-teller">' + wachten.length + '</span></h3><div class="hv-lb-verzoeken">' + wachten.map(function (v) { return verzoekKaart(v, w); }).join('') + '</div></section>';
    if (kritiek.length) stroom += '<section class="hv-lb-sectie hv-lb-sectie--kritiek" data-k="s-kritiek"><h3 class="hv-lb-sectie__kop">' + ic('octagon-alert') + h(t('Критичні', 'Kritiek')) + '<span class="hv-lb-teller">' + kritiek.length + '</span></h3><ul class="hv-lb-lijst">' + kritiek.map(function (r) { return melding({ leden: [r] }, X, w, openId); }).join('') + '</ul></section>';
    stroom += dagen.map(function (d, i) {
      var n = d.groepen.reduce(function (s, g) { return s + g.leden.length; }, 0);
      return '<section class="hv-lb-sectie" data-k="s-dag-' + i + '"><h3 class="hv-lb-sectie__kop">' + ic('calendar') + h(d.label) + '<span class="hv-lb-teller">' + n + '</span></h3><ul class="hv-lb-lijst">' + d.groepen.map(function (g) { return melding(g, X, w, openId); }).join('') + '</ul></section>';
    }).join('');
    if (rest.length > max) stroom += '<div class="hv-knoppen hv-lb-meer">' + o.knop({ tekst: t('Показати ще: ', 'Meer tonen: ') + Math.min(40, rest.length - max) + ' / ' + (rest.length - max), icoon: 'chevron-down', actie: 'ui', gegevens: { naam: 'lb-meer', waarde: max + 40 } }) + '</div>';
    if (!lijst.length) stroom += o.leeg({ icoon: f.alleen === 'gesluimerd' ? 'alarm-clock' : 'bell', titel: f.alleen === 'gesluimerd' ? t('Відкладених немає', 'Niets uitgesteld') : t('За цим фільтром нічого немає', 'Niets gevonden met dit filter'), tekst: t('Сюди потрапляє кожна дія людини, сцени, автоматизації, оптимізатора, агента, кнопки й симуляції.', 'Hier komt elke actie van een mens, scène, automatisering, de optimalisatie, een agent, een knop en de simulatie.'), actie: filterLeeg ? null : { tekst: t('Скинути фільтри', 'Filters wissen'), actie: 'lb-filters-weg', icoon: 'x' } });

    return '<div class="hv-lb" data-k="lb-meldingen">' + kop + '<div class="hv-lb-rooster">' + zij + '<div class="hv-lb-stroom">' + zicht + stroom + '</div></div></div>';
  }

  // ───────────────────────── Історія: дані ─────────────────────────
  function golf(x, zaad) { return Math.sin(x * 1.7 + zaad) * 0.5 + Math.sin(x * 0.63 + zaad * 2.1) * 0.3 + Math.sin(x * 3.1 + zaad * 0.7) * 0.2; }
  var klem = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function winter(tm) { var d = new Date(tm), begin = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.cos(2 * Math.PI * ((tm - begin) / DAG - 15) / 365); }
  function standOp(tm) {
    var u = HV.uur(tm), lijst = HV.paspoort.dag.stand;
    for (var i = 0; i < lijst.length; i++) if (u >= lijst[i][0] && u < lijst[i][1]) return lijst[i][2];
    return 'thuis';
  }
  function thuisOp(tm) { var u = HV.uur(tm); return HV.paspoort.dag.aanwezig.some(function (x) { return u >= x[0] && u < x[1]; }); }
  function doelOp(tm) { var s = standOp(tm); return s === 'thuis' ? 21 : s === 'nacht' ? 17.5 : 17; }
  function zonOp(tm) {
    var u = HV.uur(tm), d = new Date(tm), begin = Date.UTC(d.getUTCFullYear(), 0, 1);
    var w2 = Math.cos(2 * Math.PI * ((tm - begin) / DAG - 355) / 365);
    var lengte = 12.2 - 4.3 * w2, midden = 12.3, op = midden - lengte / 2, onder = midden + lengte / 2;
    if (u <= op || u >= onder) return 0;
    var wolk = 0.55 + 0.4 * golf(Math.floor(tm / DAG) * 0.77, 4);
    return Math.max(0, 3.6 * (1 - 0.55 * w2) * Math.sin(Math.PI * (u - op) / (onder - op)) * (1 - 0.75 * klem(wolk, 0, 1)) + 0.08 * golf(tm / UUR, 9));
  }

  var ENT = {
    tempwoon: { naam: ['Вітальня', 'Woonkamer'], eenheid: '°C', dec: 1, toon: 'warm', merk: 'merk-streep', bron: 'tempwoon',
      f: function (tm) { var v = 0.15 * doelOp(tm) + 0.35 * doelOp(tm - 0.5 * UUR) + 0.3 * doelOp(tm - UUR) + 0.2 * doelOp(tm - 2 * UUR); return v - 0.4 + 0.18 * golf(tm / UUR, 1) + 1.2 * Math.max(0, -winter(tm)); },
      nu: function (w) { return w.apparaten.tempwoon.st.waarde; } },
    tempslaap: { naam: ['Спальня', 'Slaapkamer'], eenheid: '°C', dec: 1, toon: 'neutraal', merk: 'merk-cirkel', bron: 'tempslaap',
      f: function (tm) { var u = HV.uur(tm); return 18.1 + 0.3 * golf(tm / UUR, 2) - (u > 7.15 && u < 7.6 ? 1.4 : 0) + 1.5 * Math.max(0, -winter(tm)); },
      nu: function (w) { return w.apparaten.tempslaap.st.waarde; } },
    buiten: { naam: ['Надворі', 'Buiten'], eenheid: '°C', dec: 1, toon: 'koud', merk: 'merk-vierkant-leeg', prognose: true,
      f: function (tm) { var u = HV.uur(tm); return 11 - 7 * winter(tm) + 3 * Math.sin(2 * Math.PI * (u - 9) / 24) + 2 * golf(tm / DAG * 0.9, 3) + 0.4 * golf(tm / UUR * 0.7, 5); },
      nu: function (w) { return w.weer.temp; } },
    verbruik: { naam: ['Споживання дому', 'Verbruik huis'], eenheid: 'kW', dec: 2, toon: 'net-in', merk: 'merk-vierkant',
      f: function (tm) { var u = HV.uur(tm); var piek = (u > 6.5 && u < 8 ? 0.9 : 0) + (u > 17 && u < 21.5 ? 0.8 + 0.3 * Math.sin(u) : 0) + (thuisOp(tm) ? 0.15 : 0); return Math.max(0.15, 0.24 + piek + 0.12 * golf(tm / UUR * 1.3, 6) + (Math.floor(tm / DAG) % 3 === 0 && u > 13.4 && u < 15 ? 0.55 : 0)); },
      nu: function (w) { return w.energie.huis; } },
    zon: { naam: ['Сонце', 'Zon'], eenheid: 'kW', dec: 2, toon: 'zon', merk: 'merk-cirkel', prognose: true, f: zonOp, nu: function (w) { return w.energie.zon; } },
    batterij: { naam: ['Домашня батарея', 'Thuisbatterij'], eenheid: '%', dec: 0, toon: 'batterij', merk: 'merk-halve-cirkel',
      f: function (tm) { var u = HV.uur(tm); return klem(24 + 52 * klem((u - 10) / 5, 0, 1) - 38 * klem((u - 17) / 6, 0, 1) + 8 * golf(tm / DAG, 7) + (u < 6 ? 6 : 0), 12, 100); },
      nu: function (w) { return w.apparaten.thuisbatterij.st.lading; } },
    ev: { naam: ['Електромобіль', 'Elektrische auto'], eenheid: '%', dec: 0, toon: 'auto', merk: 'merk-kruis',
      f: function (tm) { var u = HV.uur(tm); return klem(52 + 26 * klem((u - 1) / 4, 0, 1) - 22 * klem((u - 8.3) / 1, 0, 1) + 6 * golf(tm / DAG, 8), 20, 95); },
      nu: function (w) { return w.voertuigen[0].lading; } },
    co2: { naam: ['CO₂ у спальні', 'CO₂ slaapkamer'], eenheid: 'ppm', dec: 0, toon: 'neutraal', merk: 'merk-kruis', bron: 'co2slaap',
      f: function (tm) { var u = HV.uur(tm); var slaap = u < 7 ? 520 + 90 * u : u > 22.8 ? 520 + 300 * (u - 22.8) : 0; return Math.max(430, (slaap || 520 - 40 * klem(u - 7, 0, 1)) + 25 * golf(tm / UUR, 10) - (u > 7.15 && u < 7.6 ? 260 : 0)); },
      nu: function (w) { return w.apparaten.co2slaap.st.waarde; } },
    vocht: { naam: ['Вологість у ванній', 'Vocht badkamer'], eenheid: '%', dec: 0, toon: 'neutraal', merk: 'merk-halve-cirkel', bron: 'vochtbad',
      f: function (tm) { var u = HV.uur(tm); var douche = 24 * Math.exp(-Math.pow((u - 7.2) / 0.35, 2)) + 20 * Math.exp(-Math.pow((u - 21.3) / 0.4, 2)); return 54 + douche + 2 * golf(tm / UUR, 11); },
      nu: function (w) { return w.apparaten.vochtbad.st.waarde; } },
    prijs: { naam: ['Ціна електрики', 'Stroomprijs'], eenheid: '€/kWh', dec: 2, toon: 'net-uit', merk: 'merk-vierkant-leeg', prognose: true,
      f: function (tm) { if (HV.tarief && HV.tarief.prijs) { var p = HV.tarief.prijs(tm); if (typeof p === 'number' && !isNaN(p)) return p; } var u = HV.uur(tm); return 0.22 + 0.09 * Math.sin(2 * Math.PI * (u - 13) / 24); },
      nu: function (w) { return HV.tarief && HV.tarief.prijs ? HV.tarief.prijs(w.tijd) : 0.25; } }
  };
  var ENT_VOLGORDE = ['tempwoon', 'tempslaap', 'buiten', 'verbruik', 'zon', 'batterij', 'ev', 'co2', 'vocht', 'prijs'];
  var eenheidTekst = function (e) { return ({ '°C': '°C', kW: t('кВт', 'kW'), '%': '%', ppm: 'ppm', '€/kWh': t('€ за кВт·год', '€ per kWh') })[e] || e; };

  /** Значення сутності в момент: модель, біля «зараз» — плавно до спостереженого; виправлення людиною перекриває. */
  function waardeOp(id, tm, w, X, stap) {
    var e = ENT[id], v = e.f(tm);
    var nu = w.tijd, venster = 40 * MIN;
    if (tm <= nu && nu - tm < venster && e.nu) { var echt = e.nu(w); if (typeof echt === 'number' && !isNaN(echt)) { var k = 1 - (nu - tm) / venster; v = v * (1 - k) + echt * k; } }
    var c = X ? X.correcties.filter(function (x) { return x.entiteit === id && Math.abs(x.tijd - tm) <= (stap || 10 * MIN) / 2; })[0] : null;
    if (c) v = c.waarde;
    return v;
  }

  var PERIODEN = {
    u6: { naam: ['6 год', '6 u'], ms: 6 * UUR, stap: 10 * MIN, tik: UUR, fmt: 'tijd' },
    u24: { naam: ['24 год', '24 u'], ms: DAG, stap: 15 * MIN, tik: 4 * UUR, fmt: 'tijd' },
    d7: { naam: ['7 днів', '7 dagen'], ms: 7 * DAG, stap: 2 * UUR, tik: DAG, fmt: 'dag' },
    d30: { naam: ['30 днів', '30 dagen'], ms: 30 * DAG, stap: 8 * UUR, tik: 5 * DAG, fmt: 'dag' },
    jaar: { naam: ['Рік', 'Jaar'], ms: 365 * DAG, stap: 3 * DAG, tik: 0, fmt: 'maand' }
  };
  var PERIODE_VOLGORDE = ['u6', 'u24', 'd7', 'd30', 'jaar'];
  function tikken(van, tot, per, smal) {
    var uit = [], vrij = function (x) { var f = (x - van) / (tot - van); return f > 0.07 && f < 0.95; };
    if (per.fmt === 'maand') {
      var d = new Date(van), j = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
      for (var i = 0; i < 14; i++) { var x = Date.UTC(j, m + i, 1); if (x > tot) break; if ((m + i) % (smal ? 3 : 2) === 0 && vrij(x)) uit.push({ x: x, label: P(MAAND_KORT[new Date(x).getUTCMonth()]) }); }
      return uit;
    }
    var stap = per.tik * (smal ? (per.fmt === 'tijd' && per.tik === 4 * UUR ? 1.5 : 2) : 1);
    for (var tm = Math.ceil(van / stap) * stap; tm <= tot; tm += stap) if (vrij(tm)) uit.push({ x: tm, label: per.fmt === 'tijd' ? HV.tijd(tm) : HV.datumKort(tm) });
    return uit;
  }
  function momentTekst(tm, per) { return per.fmt === 'tijd' ? (Math.floor(tm / DAG) === Math.floor(HV.staat.w.tijd / DAG) ? HV.tijd(tm) : HV.datumKort(tm) + ' ' + HV.tijd(tm)) : per.fmt === 'dag' ? HV.datumKort(tm) + ' ' + HV.tijd(tm) : HV.datumKort(tm) + '.' + new Date(tm).getUTCFullYear(); }

  // Смуги станів: щоденні відрізки (години дому) → шматки на осі [van, tot]
  var BANEN = {
    stand: { naam: ['Режим', 'Stand'], klas: 'hv-baan--stand', stukken: function () { return HV.paspoort.dag.stand.map(function (x) { return [x[0], x[1], { klas: 'hv-stand--' + x[2], label: P(HV.huisstanden[x[2]]) }]; }); } },
    aanwezig: { naam: ['Удома', 'Thuis'], stukken: function () { return HV.paspoort.dag.aanwezig.map(function (x) { return [x[0], x[1], { toon: 'ok', label: t('хтось удома', 'iemand thuis') }]; }); } },
    licht: { naam: ['Світло', 'Licht'], stukken: function () { return [[6.75, 8.1, { toon: 'aan', label: t('світло у вітальні', 'licht woonkamer') }], [16.9, 23.2, { toon: 'aan', label: t('світло у вітальні', 'licht woonkamer') }]]; } },
    verwarming: { naam: ['Опалення', 'Verwarming'], stukken: function () { return [[6.3, 7.4], [15.4, 16.9], [19.8, 20.3], [21.6, 22.0]].map(function (x) { return [x[0], x[1], { toon: 'warm', label: t('опалення гріє', 'verwarming aan') }]; }); } },
    raam: { naam: ['Вікно', 'Raam'], stukken: function () { return [[7.15, 7.6, { toon: 'koud', label: t('вікно спальні відчинене', 'raam slaapkamer open') }]]; } },
    was: { naam: ['Прання', 'Was'], stukken: function (dag) { return dag % 2 === 0 ? [[13.4, 15.0, { toon: 'aan', label: t('пральна машина працює', 'wasmachine draait') }]] : []; } },
    deur: { naam: ['Двері', 'Deur'], punten: true }
  };
  var BAAN_VOLGORDE = ['stand', 'aanwezig', 'licht', 'verwarming', 'raam', 'was', 'deur'];
  function baanStukken(id, van, tot, nu) {
    var b = BANEN[id], uit = [];
    for (var d = Math.floor(van / DAG); d <= Math.floor(tot / DAG); d++) {
      (b.stukken(d) || []).forEach(function (s) {
        var a = Math.max(van, d * DAG + s[0] * UUR), z = Math.min(tot, nu, d * DAG + s[1] * UUR);
        if (z > a) uit.push({ van: a, tot: z, toon: s[2].toon, klas: s[2].klas, label: s[2].label });
      });
    }
    return uit;
  }
  function baanOp(id, tm) {
    var b = BANEN[id];
    if (b.punten) return null;
    var hit = baanStukken(id, tm - DAG, tm + MIN, tm + MIN).filter(function (s) { return s.van <= tm && s.tot >= tm; })[0];
    return hit ? hit.label : t('ні', 'nee');
  }

  // Обхід ядра: HV.grafiek.lijn завжди включає 0 у шкалу Y, а p.y міняє межі без нових поділок — температура 17–21 °C
  // лягала б пласкою смугою вгорі. Тут — власна «кругла» шкала: межі йдуть у p.y, поділки й підписи замінюються.
  function yschaal(reeksen, strak) {
    var ys = [];
    reeksen.forEach(function (r) { r.punten.forEach(function (q) { ys.push(q[1]); }); });
    var min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
    if (!strak) min = Math.min(0, min);
    var bereik = (max - min) || 1, ruw = bereik / 4, macht = Math.pow(10, Math.floor(Math.log(ruw) / Math.LN10));
    var stap = [1, 2, 2.5, 5, 10].map(function (m) { return m * macht; }).filter(function (s) { return s >= ruw; })[0] || ruw;
    var van = Math.floor(min / stap) * stap, tot = Math.ceil(max / stap) * stap, tik = [];
    for (var v = van; v <= tot + stap / 1000; v += stap) tik.push(Math.round(v * 1000) / 1000);
    return { min: van, max: tot, tikken: tik, dec: stap < 1 ? (stap < 0.1 ? 2 : 1) : 0 };
  }
  function metSchaal(html, s) {
    var Y = function (v) { return 100 - (v - s.min) / ((s.max - s.min) || 1) * 100; };
    var lijnen = s.tikken.map(function (v) { return '<line class="hv-grafiek__' + (v === 0 ? 'nul' : 'raster') + '" x1="0" x2="100" y1="' + Y(v).toFixed(2) + '" y2="' + Y(v).toFixed(2) + '"/>'; }).join('');
    var labels = s.tikken.map(function (v) { return '<span class="hv-grafiek__y" style="top:' + Y(v).toFixed(1) + '%">' + HV.getal(v, s.dec) + '</span>'; }).join('');
    return html.replace(/<line class="hv-grafiek__(?:raster|nul)"[^>]*\/>/g, '')
      .replace('preserveAspectRatio="none" aria-hidden="true">', 'preserveAspectRatio="none" aria-hidden="true">' + lijnen)
      .replace(/<div class="hv-grafiek__as">[\s\S]*?<\/div>/, '<div class="hv-grafiek__as">' + labels + '</div>');
  }

  // ───────────────────────── Вкладка «Історія» ─────────────────────────
  function weergaveVan(ctx) { var x = ctx.route.object; return x === 'grafieken' || x === 'tabel' ? x : 'tijdlijn'; }

  function geschiedenis(ctx) {
    var w = ctx.staat, X = L(w), weergave = weergaveVan(ctx);
    var schrijft = w.gegevens === 'live';
    var balk = '<div class="hv-lb-balk" data-k="lb-balk">' + o.segment({ label: t('Вигляд історії', 'Weergave van de geschiedenis'), waarde: weergave, actie: 'lb-weergave', klas: 'hv-lb-weergave', k: 'lb-weergave', opties: [
      { id: 'tijdlijn', label: t('Стрічка', 'Tijdlijn'), icoon: 'list' }, { id: 'grafieken', label: t('Графіки', 'Grafieken'), icoon: 'chart-spline' }, { id: 'tabel', label: t('Таблиця', 'Tabel'), icoon: 'table-2' }] }) +
      '<p class="hv-lb-balk__stand' + (schrijft ? '' : ' is-let-op') + '">' + ic(schrijft ? 'hard-drive-download' : 'triangle-alert') + '<span>' + h(schrijft ? t('Історія записується: 30 днів детально, далі погодинно', 'Geschiedenis wordt opgeslagen: 30 dagen gedetailleerd, daarna per uur') : t('Історія тимчасово не записується: немає живого потоку', 'Geschiedenis wordt tijdelijk niet opgeslagen: geen live stroom')) + '</span></p></div>';
    var lijf = weergave === 'grafieken' ? grafieken(ctx, w, X) : weergave === 'tabel' ? audit(ctx, w, X) : tijdlijn(ctx, w, X);
    return '<div class="hv-lb hv-lb-gs" data-k="lb-gs-' + weergave + '">' + balk + lijf + '</div>';
  }

  // ── Стрічка з переглядом минулого ──
  function tijdlijn(ctx, w, X) {
    var terug = Number(HV.ui.lees('lb-terug', 0)) || 0; // хвилин тому
    var moment = w.tijd + terug * MIN;
    var stand = standOp(moment);
    var lampen = baanOp('licht', moment);
    var snap = '<section class="hv-kaart hv-lb-terugblik' + (terug ? ' is-actief' : '') + '" data-k="lb-terugblik">' +
      kaartKop('history', t('Перегляд минулого', 'Terugblik'), terug ? o.knop({ tekst: t('До «зараз»', 'Naar nu'), icoon: 'undo-2', klein: true, actie: 'lb-terug-nu' }) : o.chip({ icoon: 'radio', tekst: t('зараз', 'nu'), toon: 'aan' })) +
      '<div class="hv-lb-terugblik__rij"><span class="hv-lb-terugblik__tijd" data-lb-momenttekst="1">' + h(terug ? HV.datum(moment) + ' · ' + HV.tijd(moment) : t('Зараз · ', 'Nu · ') + HV.tijd(moment)) + '</span></div>' +
      o.schuif({ label: t('Момент перегляду минулого', 'Moment van de terugblik'), waarde: terug, min: -1440, max: 0, stap: 10, eenheid: t('хв', 'min'), actie: 'lb-terug-schuif', klas: 'hv-schuif--zonder-getal hv-lb-tijdschuif', toon: 'neutraal', k: 'lb-terug-schuif' }) +
      '<div class="hv-lb-schaal" aria-hidden="true"><span>' + h(t('24 год тому', '24 u geleden')) + '</span><span>' + h(t('12 год', '12 u')) + '</span><span>' + h(t('зараз', 'nu')) + '</span></div>' +
      '<div class="hv-lb-snap">' + [
        ['house', t('Режим', 'Stand'), P(HV.huisstanden[stand])],
        ['users', t('Удома', 'Thuis'), thuisOp(moment) ? t('хтось є', 'iemand thuis') : t('нікого', 'niemand')],
        ['thermometer', t('Вітальня', 'Woonkamer'), HV.maatTekst(waardeOp('tempwoon', moment, w, X), '°C', 1)],
        ['lightbulb', t('Світло у вітальні', 'Licht woonkamer'), lampen === t('ні', 'nee') ? HV.woord.uit() : HV.woord.aan()],
        ['zap', t('Споживання', 'Verbruik'), HV.maatTekst(waardeOp('verbruik', moment, w, X), t('кВт', 'kW'), 2)],
        ['sun', t('Сонце', 'Zon'), HV.maatTekst(waardeOp('zon', moment, w, X), t('кВт', 'kW'), 2)]
      ].map(function (x) { return '<div class="hv-lb-snap__deel">' + ic(x[0], 'm') + '<span class="hv-lb-snap__label">' + h(x[1]) + '</span><strong>' + h(x[2]) + '</strong></div>'; }).join('') + '</div>' +
      (terug ? '<p class="hv-lb-noot">' + ic('info') + h(t('Стан відновлено з історії; події поруч із цим моментом підсвічено в стрічці.', 'De toestand komt uit de geschiedenis; gebeurtenissen rond dit moment zijn gemarkeerd in de tijdlijn.')) + '</p>' : '') + '</section>';

    var f = filters();
    var lijst = w.logboek.filter(function (r) { return (f.dienst === 'alle' || dienstVan(r) === f.dienst) && makerFilterPast(r, f.maker); });
    var max = Number(HV.ui.lees('lb-tl-meer', 50)) || 50;
    var dagen = [], huidige = null;
    lijst.slice(0, max).forEach(function (r) {
      var label = dagLabel(r.tijd, w.tijd);
      if (!huidige || huidige.label !== label) { huidige = { label: label, regels: [] }; dagen.push(huidige); }
      huidige.regels.push(r);
    });
    var filter = '<div class="hv-lb-tlfilter">' + chips('lb-maker', f.maker, [['alle', t('усі автори', 'alle makers')]].concat(MAKERS.map(function (m) { return [m.id, P(m.naam), m.icoon]; })), t('Автор', 'Maker')) + '</div>';
    var stroom = dagen.map(function (d, i) {
      return '<section class="hv-tijdlijn" data-k="tl-' + i + '"><h3 class="hv-tijdlijn__dag">' + h(d.label) + '</h3><ol class="hv-tijdlijn__lijst">' + d.regels.map(function (r) {
        var dichtbij = terug && Math.abs(r.tijd - moment) <= 30 * MIN;
        var dd = DIENST[dienstVan(r)], kop = kopVan(r);
        return '<li class="hv-tijdlijn__item hv-tijdlijn__item--' + h(r.gewicht || 'info') + (dichtbij ? ' is-dichtbij' : '') + '" data-k="tli-' + h(r.id) + '">' +
          '<span class="hv-tijdlijn__tijd">' + HV.tijd(r.tijd) + '</span><span class="hv-tijdlijn__stip" aria-hidden="true">' + ic(dd.icoon) + '</span>' +
          '<button type="button" class="hv-tijdlijn__kaart" data-actie="blad" data-blad="waarom:' + h(r.id) + '" aria-label="' + h(P(r.wat) + (kop.delta ? ' (' + t('було ', 'was ') + kop.delta.was + ')' : '') + '. ' + t('Чому?', 'Waarom?')) + '">' +
          '<span class="hv-tijdlijn__kop"><span class="hv-tijdlijn__wat">' + h(kop.naam) + '</span>' + (kop.delta ? deltaChip(kop.delta) : '') + '</span>' +
          (r.keten ? '<span class="hv-tijdlijn__keten">' + r.keten.map(function (s) { return '<span>' + h(P(s)) + '</span>'; }).join(ic('arrow-right')) + '</span>' : (r.waarom ? '<span class="hv-tijdlijn__waarom">' + h(t('чому: ', 'waarom: ') + P(r.waarom)) + '</span>' : '')) +
          '<span class="hv-lb-m__meta">' + o.maker(r.maker) + '<span class="hv-punt" aria-hidden="true">·</span><span>' + h(P(dd.naam)) + '</span></span></button></li>';
      }).join('') + '</ol></section>';
    }).join('');
    var meer = lijst.length > max ? '<div class="hv-knoppen hv-lb-meer">' + o.knop({ tekst: t('Показати раніші', 'Eerdere tonen'), icoon: 'chevron-down', actie: 'ui', gegevens: { naam: 'lb-tl-meer', waarde: max + 50 } }) + '</div>' : '';
    return '<div class="hv-lb-tl" data-k="lb-tl">' + snap + '<div class="hv-kaart hv-lb-tlkaart">' + kaartKop('list', t('Стрічка подій', 'Tijdlijn van het huis'), '<span class="hv-lb-meta">' + h(lijst.length + ' ' + HV.meervoud(lijst.length, ['запис', 'записи', 'записів'], ['regel', 'regels'])) + '</span>') + filter + (stroom || o.leeg({ icoon: 'list', titel: t('Подій за цим фільтром немає', 'Geen gebeurtenissen met dit filter') })) + meer + '</div></div>';
  }

  // ── Графіки ──
  function gekozen(naam, standaard) { var v = HV.ui.lees(naam, standaard); return String(v || '').split(',').filter(Boolean); }

  function grafieken(ctx, w, X) {
    var per = PERIODEN[HV.ui.lees('lb-periode', 'u24')] || PERIODEN.u24, perId = HV.ui.lees('lb-periode', 'u24');
    var ents = gekozen('lb-ent', 'tempwoon,buiten,verbruik,zon').filter(function (x) { return ENT[x]; });
    var banen = gekozen('lb-banen', 'stand,aanwezig,licht,verwarming,deur').filter(function (x) { return BANEN[x]; });
    var vergelijk = !!HV.ui.lees('lb-vergelijk', false);
    var prognose = !!HV.ui.lees('lb-prognose', false) && per.ms <= DAG;
    var nu = w.tijd, van = nu - per.ms;
    var tot = prognose && ents.some(function (id) { return ENT[id].prognose; }) ? nu + 6 * UUR : nu;
    var moment = nu + (Number(HV.ui.lees('lb-moment', 0)) || 0) * MIN;
    if (moment < van) moment = van;
    var cursorX = (moment - van) / (tot - van) * 100;

    // вибір
    var kies = '<section class="hv-kaart hv-lb-kies" data-k="lb-kies">' + kaartKop('sliders-horizontal', t('Що показати', 'Wat tonen'), '<span class="hv-lb-meta">' + h(t('до 4 рядів', 'tot 4 reeksen')) + '</span>') +
      veld(t('Період', 'Periode'), o.segment({ label: t('Період', 'Periode'), waarde: perId, actie: 'lb-periode', klas: 'hv-lb-periode', k: 'lb-periode', opties: PERIODE_VOLGORDE.map(function (id) { return { id: id, label: P(PERIODEN[id].naam) }; }) })) +
      veld(t('Числа', 'Getallen'), '<div class="hv-filter hv-lb-filter" role="group" aria-label="' + h(t('Числові ряди', 'Getalreeksen')) + '">' + ENT_VOLGORDE.map(function (id) {
        var e = ENT[id], aan = ents.indexOf(id) >= 0;
        return o.chip({ filter: true, gekozen: aan, html: '<span class="hv-lb-merk hv-toon-' + e.toon + '">' + HV.icoon(e.merk, { maat: 'merk' }) + '</span><span>' + h(P(e.naam)) + '</span>', actie: 'lb-ent', gegevens: { id: id }, k: 'ent-' + id, klas: aan ? '' : (ents.length >= 4 ? 'is-vol' : '') });
      }).join('') + '</div>') +
      veld(t('Смуги станів', 'Toestandsbanen'), '<div class="hv-filter hv-lb-filter" role="group" aria-label="' + h(t('Смуги станів', 'Toestandsbanen')) + '">' + BAAN_VOLGORDE.map(function (id) {
        return o.chip({ filter: true, gekozen: banen.indexOf(id) >= 0, tekst: P(BANEN[id].naam), actie: 'lb-baan', gegevens: { id: id }, k: 'baan-' + id });
      }).join('') + '</div>') +
      '<div class="hv-lb-opties">' + o.chip({ filter: true, gekozen: vergelijk, icoon: 'git-compare-arrows', tekst: t('Порівняти з попереднім періодом', 'Vergelijken met de vorige periode'), actie: 'ui', gegevens: { naam: 'lb-vergelijk', waarde: vergelijk ? '' : '1' }, k: 'opt-vgl' }) +
      (per.ms <= DAG ? o.chip({ filter: true, gekozen: prognose, icoon: 'cloud-sun', tekst: t('Прогноз на 6 год', 'Verwachting 6 u'), actie: 'ui', gegevens: { naam: 'lb-prognose', waarde: prognose ? '' : '1' }, k: 'opt-prog' }) : '') + '</div></section>';

    // лінії: одна картка на одиницю виміру, усі на спільній осі [van, tot]
    var groepen = {};
    ents.forEach(function (id) { var e = ENT[id]; (groepen[e.eenheid] = groepen[e.eenheid] || []).push(id); });
    var x = { min: van, max: tot, tikken: tikken(van, tot, per, ctx.profiel.breedte < 700), format: function (v) { return momentTekst(v, per); } };
    var cursor = function (pct) { return '<span class="hv-lb-cursor" style="left:' + pct.toFixed(2) + '%" aria-hidden="true"></span>'; };
    var lijnen = Object.keys(groepen).map(function (eenheid) {
      var reeksen = [];
      groepen[eenheid].forEach(function (id) {
        var e = ENT[id], punten = [];
        for (var tm = van; tm <= nu + 1; tm += per.stap) punten.push([tm, waardeOp(id, Math.min(tm, nu), w, X, per.stap)]);
        if (punten[punten.length - 1][0] < nu) punten.push([nu, waardeOp(id, nu, w, X, per.stap)]);
        reeksen.push({ naam: P(e.naam), toon: e.toon, merk: e.merk, streep: '', punten: punten });
        if (vergelijk) reeksen.push({ naam: P(e.naam) + ' · ' + t('попередній період', 'vorige periode'), toon: e.toon, merk: e.merk, streep: '2 5', punten: punten.map(function (q) { return [q[0], e.f(q[0] - per.ms)]; }) });
        if (prognose && e.prognose) {
          var pr = [[nu, waardeOp(id, nu, w, X)]];
          for (var tp = nu + per.stap; tp <= tot; tp += per.stap) pr.push([tp, e.f(tp)]);
          reeksen.push({ naam: P(e.naam) + ' · ' + t('прогноз', 'verwachting'), toon: e.toon, merk: e.merk, geschat: true, punten: pr });
        }
      });
      var schaal = yschaal(reeksen, eenheid === '°C' || eenheid === 'ppm');
      var html = HV.grafiek.lijn({
        id: 'lb-' + perId + '-' + ({ '°C': 'temp', kW: 'kw', '%': 'pct', ppm: 'ppm', '€/kWh': 'prijs' })[eenheid], titel: groepen[eenheid].map(function (id) { return P(ENT[id].naam); }).join(' · '), eenheid: eenheidTekst(eenheid), hoogte: 170, nu: tot > nu ? nu : null,
        x: x, y: { min: schaal.min, max: schaal.max }, reeksen: reeksen, tabelKop: [t('Час', 'Tijd')],
        samenvatting: groepen[eenheid].map(function (id) {
          var e = ENT[id], vs = []; for (var tm = van; tm <= nu; tm += per.stap) vs.push(waardeOp(id, tm, w, X, per.stap));
          return P(e.naam) + ': ' + t('від ', 'van ') + HV.getal(Math.min.apply(null, vs), e.dec) + t(' до ', ' tot ') + HV.getal(Math.max.apply(null, vs), e.dec) + ' ' + eenheidTekst(e.eenheid) + t(', середнє ', ', gemiddeld ') + HV.getal(vs.reduce(function (s, v) { return s + v; }, 0) / vs.length, e.dec);
        }).join('; ') + '.'
      });
      return metSchaal(html, schaal).replace('<div class="hv-grafiek__xas">', cursor(cursorX) + '<div class="hv-grafiek__xas">');
    }).join('');

    // смуги станів (до 7 днів)
    var banenHtml = '';
    if (banen.length && per.ms <= 7 * DAG) {
      var duren = [];
      var rijen = banen.map(function (id) {
        var b = BANEN[id];
        if (b.punten) {
          var punten = [];
          for (var d = Math.floor(van / DAG); d <= Math.floor(nu / DAG); d++) HV.paspoort.dag.deuren.forEach(function (u) { var tm = d * DAG + u * UUR; if (tm >= van && tm <= nu) punten.push({ x: tm, label: t('вхідні двері відчинено о ', 'voordeur open om ') + HV.tijd(tm), icoon: 'door-open' }); });
          duren.push(P(b.naam) + ': ' + punten.length + ' ' + HV.meervoud(punten.length, ['відкриття', 'відкриття', 'відкриттів'], ['keer open', 'keer open']));
          return { naam: P(b.naam), punten: punten };
        }
        var stukken = baanStukken(id, van, tot, nu);
        var som = stukken.reduce(function (s, x) { return s + (x.tot - x.van); }, 0);
        if (id !== 'stand') duren.push(P(b.naam) + ': ' + HV.duur(som / MIN));
        return { naam: P(b.naam), klas: b.klas, stukken: stukken };
      });
      banenHtml = HV.grafiek.toestanden({ id: 'lb-banen-' + perId, titel: t('Смуги станів', 'Toestandsbanen'), van: van, tot: tot, nu: tot > nu ? nu : null, tikken: x.tikken, banen: rijen, format: function (v) { return momentTekst(v, per); },
        samenvatting: t('За період: ', 'In de periode: ') + duren.join('; ') + '.' })
        .replace('<div class="hv-grafiek__banenas">', '<span class="hv-lb-cursor hv-lb-cursor--banen" style="--x:' + (cursorX / 100).toFixed(4) + '" aria-hidden="true"></span><div class="hv-grafiek__banenas">');
    } else if (banen.length) banenHtml = '<p class="hv-lb-noot">' + ic('info') + h(t('Смуги станів показуються для періодів до 7 днів; для довших — теплова карта нижче.', 'Toestandsbanen staan er voor periodes tot 7 dagen; voor langere — de warmtekaart hieronder.')) + '</p>';

    // спільний курсор і зчитування
    var lees = ents.map(function (id) {
      var e = ENT[id], v = moment <= nu ? waardeOp(id, moment, w, X, per.stap) : e.f(moment);
      var gecorr = X.correcties.some(function (c) { return c.entiteit === id && Math.abs(c.tijd - moment) <= per.stap / 2; });
      return '<li class="hv-toon-' + e.toon + '"><span class="hv-lb-lees__naam"><span class="hv-lb-merk">' + HV.icoon(e.merk, { maat: 'merk' }) + '</span>' + h(P(e.naam)) + '</span><strong data-lb-lees="' + id + '">' + h(HV.maatTekst(v, eenheidTekst(e.eenheid), e.dec)) + (moment > nu ? ' ≈' : '') + '</strong>' + (gecorr ? '<span class="hv-lb-gecorr">' + h(t('виправлено', 'gecorrigeerd')) + '</span>' : '') + (vergelijk ? '<span class="hv-lb-meta">' + h(t('раніше ', 'eerder ') + HV.getal(e.f(moment - per.ms), e.dec)) + '</span>' : '') + '</li>';
    }).concat(per.ms <= 7 * DAG ? banen.filter(function (id) { return !BANEN[id].punten; }).map(function (id) {
      return '<li class="hv-lb-lees__baan"><span class="hv-lb-lees__naam">' + h(P(BANEN[id].naam)) + '</span><strong data-lb-baan="' + id + '">' + h(baanOp(id, Math.min(moment, nu))) + '</strong></li>';
    }) : []).join('');
    var schuifMin = -Math.round(per.ms / MIN), schuifStap = Math.max(5, Math.round(per.stap / MIN));
    var cursorKaart = '<div class="hv-lb-lees" data-k="lb-lees"><div class="hv-lb-lees__kop">' + ic('scan-line', 'm') + '<span>' + h(t('Курсор', 'Cursor')) + '</span><strong data-lb-momenttekst="1">' + h(momentTekst(moment, per)) + '</strong>' +
      ((Number(HV.ui.lees('lb-moment', 0)) || 0) ? o.knop({ tekst: t('До «зараз»', 'Naar nu'), klein: true, soort: 'stil', actie: 'lb-moment-nu' }) : '') + '</div>' +
      o.schuif({ label: t('Момент курсора', 'Moment van de cursor'), waarde: Math.max(schuifMin, Math.round((moment - nu) / MIN)), min: schuifMin, max: Math.round((tot - nu) / MIN), stap: schuifStap, eenheid: t('хв', 'min'), actie: 'lb-moment-schuif', klas: 'hv-schuif--zonder-getal hv-lb-tijdschuif', toon: 'neutraal', k: 'lb-moment-schuif' }) +
      '<ul class="hv-lb-lees__lijst">' + lees + '</ul></div>';

    var grafiekKaart = '<section class="hv-kaart hv-lb-as" data-k="lb-as">' + kaartKop('chart-spline', t('Спільна вісь часу', 'Gedeelde tijdas'),
      o.stempel({ waarde: h(t('крок ', 'stap ') + HV.duur(per.stap / MIN)), bron: t('Симулятор', 'Simulator') })) +
      (ents.length ? lijnen : o.leeg({ icoon: 'chart-spline', titel: t('Оберіть хоча б один ряд', 'Kies minstens één reeks'), tekst: t('Числа з різними одиницями стоять окремими графіками на тій самій осі часу.', 'Getallen met verschillende eenheden staan in aparte grafieken op dezelfde tijdas.') })) +
      banenHtml + cursorKaart +
      '<div class="hv-knoppen hv-lb-asacties">' + o.knop({ tekst: t('Виправити значення', 'Waarde corrigeren'), icoon: 'pencil-line', actie: 'blad', gegevens: { blad: 'lbcorrectie:' + (ents[0] || 'tempwoon') }, uit: !ents.length }) +
      o.knop({ tekst: t('Експорт CSV', 'CSV exporteren'), icoon: 'file-down', actie: 'lb-export-reeksen', uit: !ents.length }) +
      o.gevolg(t('Що станеться: на цьому пристрої буде створено файл CSV з обраними рядами за ' + P(per.naam) + ' (крок ' + HV.duur(per.stap / MIN) + '); у домі нічого не зміниться. Пов’язано з: файл може містити присутність людей — зберігайте його приватно; експорт записується в Журнал. Як повернути: видаліть файл самі; запис у Журналі лишається.', 'Wat er gebeurt: op dit apparaat ontstaat een CSV-bestand met de gekozen reeksen over ' + P(per.naam) + ' (stap ' + HV.duur(per.stap / MIN) + '); in huis verandert niets. Hangt samen met: het bestand kan aanwezigheid bevatten — bewaar het privé; de export komt in het logboek. Terugdraaien: verwijder het bestand zelf; de regel in het logboek blijft.'), { kop: t('Експорт історії', 'Geschiedenis exporteren') }) + '</div></section>';

    // теплова карта: 7 днів × 8 трьохгодинних проміжків
    var wId = HV.ui.lees('lb-warmte', ents[0] || 'verbruik');
    if (!ENT[wId]) wId = 'verbruik';
    var we = ENT[wId], rijenWarmte = [], waarden = [];
    for (var dd = 6; dd >= 0; dd--) {
      var d0 = (Math.floor(nu / DAG) - dd) * DAG, rij = [];
      rijenWarmte.push(P(DAG_KORT[new Date(d0).getUTCDay()]) + ' ' + HV.datumKort(d0));
      for (var b = 0; b < 8; b++) {
        var s = 0, n = 0;
        for (var k = 0; k < 6; k++) { var tm = d0 + b * 3 * UUR + k * 30 * MIN; if (tm <= nu) { s += waardeOp(wId, tm, w, X); n++; } }
        rij.push(n ? s / n : null);
      }
      waarden.push(rij);
    }
    var warmte = '<section class="hv-kaart hv-lb-warmte" data-k="lb-warmte">' + kaartKop('grid-3x3', t('Теплова карта тижня', 'Warmtekaart van de week'), '') +
      veld(t('Ряд', 'Reeks'), '<div class="hv-filter hv-lb-filter" role="group" aria-label="' + h(t('Ряд теплової карти', 'Reeks van de warmtekaart')) + '">' + ['verbruik', 'zon', 'tempwoon', 'co2', 'vocht', 'prijs'].map(function (id) {
        return o.chip({ filter: true, gekozen: wId === id, tekst: P(ENT[id].naam), actie: 'ui', gegevens: { naam: 'lb-warmte', waarde: id }, k: 'wk-' + id });
      }).join('') + '</div>') +
      HV.grafiek.warmtekaart({ id: 'lb-wk-' + wId, titel: P(we.naam) + t(', середнє за 3 год', ', gemiddeld per 3 u'), eenheid: eenheidTekst(we.eenheid), decimalen: we.dec > 1 ? 1 : we.dec, rijen: rijenWarmte, kolommen: ['00', '03', '06', '09', '12', '15', '18', '21'], waarden: waarden,
        samenvatting: t('Темніша клітинка — більше значення; число стоїть у кожній клітинці. Прочерк — проміжок ще не настав.', 'Een donkerder vak is een hogere waarde; het getal staat in elk vak. Een streep — dit blok is nog niet begonnen.') }) + '</section>';

    return '<div class="hv-lb-gr" data-k="lb-gr">' + kies + grafiekKaart + warmte + '</div>';
  }

  // ── Таблиця аудиту ──
  function audit(ctx, w, X) {
    var m = HV.ui.lees('lb-tabel-maker', 'alle'), d = HV.ui.lees('lb-dienst', 'alle');
    var lijst = w.logboek.filter(function (r) { return makerFilterPast(r, m) && (d === 'alle' || dienstVan(r) === d); });
    var max = Number(HV.ui.lees('lb-tabel-n', 30)) || 30;
    var kop = [t('Час', 'Tijd'), t('Хто', 'Wie'), t('Що', 'Wat'), t('Було → стало', 'Was → werd'), t('Дозвіл', 'Toestemming'), t('Служба', 'Dienst')];
    var rijen = lijst.slice(0, max).map(function (r) {
      var cel = function (i, html) { return '<td data-kop="' + h(kop[i]) + '">' + html + '</td>'; };
      return '<tr class="hv-lb-audit__rij hv-lb-audit__rij--' + h(r.gewicht || 'info') + '" data-k="a-' + h(r.id) + '"><th scope="row" data-kop="' + h(kop[0]) + '">' + h(HV.datumKort(r.tijd) + ' ' + HV.tijd(r.tijd)) + '</th>' + cel(1, o.maker(r.maker)) +
        cel(2, '<button type="button" class="hv-link" data-actie="blad" data-blad="waarom:' + h(r.id) + '">' + h(P(r.wat)) + '</button>') + cel(3, r.was && r.werd && !wijzigingVan(r) ? h(P(r.werd)) + ' <span class="hv-lb-meta">' + h(t('без змін', 'ongewijzigd')) + '</span>' : r.was || r.werd ? h((r.was ? P(r.was) : '—') + ' → ' + (r.werd ? P(r.werd) : '—')) : '<span class="hv-lb-meta">—</span>') +
        cel(4, r.toegestaan ? h(P(r.toegestaan)) : (r.maker && r.maker.soort === 'mens' ? h(t('роль людини', 'rol van de persoon')) : '<span class="hv-lb-meta">—</span>')) + cel(5, h(P(DIENST[dienstVan(r)].naam))) + '</tr>';
    }).join('');
    return '<section class="hv-kaart hv-lb-audit" data-k="lb-audit">' + kaartKop('table-2', t('Таблиця аудиту', 'Tabel van het controlespoor'), '<span class="hv-lb-meta">' + h(t('лише додавання: запис не змінюється й не видаляється', 'alleen toevoegen: een regel wordt nooit gewijzigd of gewist')) + '</span>') +
      veld(t('Автор', 'Maker'), chips('lb-tabel-maker', m, [['alle', t('усі', 'iedereen')], ['agent', t('агенти', 'agenten'), 'agent'], ['automatisering', t('автоматизації', 'automatiseringen'), 'diamond'], ['optimalisatie', t('оптимізатор', 'optimalisatie'), 'gauge'], ['mens', t('люди', 'mensen'), 'user'], ['knop', t('кнопки', 'knoppen'), 'hand'], ['systeem', t('система', 'systeem'), 'cpu'], ['simulator', t('симуляція', 'simulatie'), 'flask-conical']], t('Автор', 'Maker'))) +
      veld(t('Служба', 'Dienst'), chips('lb-dienst', d, [['alle', t('усі', 'alle')]].concat(DIENSTEN.map(function (x) { return [x.id, P(x.naam), x.icoon]; })), t('Служба', 'Dienst'))) +
      (rijen ? '<div class="hv-tabel__rol"><table class="hv-tabel hv-lb-audit__tabel"><caption class="hv-vo">' + h(t('Записи Журналу', 'Regels van het logboek')) + '</caption><thead><tr>' + kop.map(function (k) { return '<th scope="col">' + h(k) + '</th>'; }).join('') + '</tr></thead><tbody>' + rijen + '</tbody></table></div>' : o.leeg({ icoon: 'table-2', titel: t('Записів за цим фільтром немає', 'Geen regels met dit filter') })) +
      '<div class="hv-knoppen">' + (lijst.length > max ? o.knop({ tekst: t('Показати ще 30', 'Nog 30 tonen'), icoon: 'chevron-down', actie: 'ui', gegevens: { naam: 'lb-tabel-n', waarde: max + 30 } }) : '') +
      o.knop({ tekst: t('Експорт CSV · ', 'CSV exporteren · ') + lijst.length, icoon: 'file-down', actie: 'lb-export-audit' }) +
      o.gevolg(t('Що станеться: на цьому пристрої буде створено файл CSV з усіма записами за поточним фільтром; Журнал не зміниться. Пов’язано з: у файлі — імена людей і дії агентів; експорт сам стає записом аудиту. Як повернути: видаліть файл самі.', 'Wat er gebeurt: op dit apparaat ontstaat een CSV-bestand met alle regels volgens het huidige filter; het logboek verandert niet. Hangt samen met: het bestand bevat namen en acties van agenten; de export wordt zelf een regel in het controlespoor. Terugdraaien: verwijder het bestand zelf.'), { kop: t('Експорт аудиту', 'Controlespoor exporteren') }) + '</div></section>';
  }

  // ───────────────────────── Вкладка «Обслуговування» ─────────────────────────
  function onderhoudItems(w, X) {
    return ONDERHOUD.map(function (r) {
      var s = X.onderhoud[r[0]], a = w.apparaten[r[2]], ex = r[8];
      var item = { id: r[0], soort: r[1], doel: r[2], icoon: r[3], naam: [r[4], r[5]], interval: r[6], ex: ex, s: s, a: a };
      if (r[1] === 'firmware') {
        item.klaar = s.versie === ex.naar;
        item.groep = item.klaar ? 'later' : ex.veilig ? 'nu' : 'binnenkort';
        item.rest = null; item.deel = item.klaar ? 1 : 0.15;
        return item;
      }
      var termijn = s.laatst + r[6] * DAG;
      if (s.uitgesteld && s.uitgesteld > termijn) termijn = s.uitgesteld;
      item.termijn = termijn;
      item.rest = (termijn - w.tijd) / DAG;
      item.deel = klem(1 - (w.tijd - s.laatst) / (r[6] * DAG), 0, 1);
      item.groep = item.rest < 0 ? 'nu' : item.rest <= 30 ? 'binnenkort' : 'later';
      if (s.gepland && item.groep === 'nu') item.groep = 'binnenkort';
      return item;
    });
  }
  function batterijLijst(w, X) {
    var uit = [];
    Object.keys(X.batterijen).forEach(function (id) { var a = w.apparaten[id]; if (a) uit.push({ id: id, a: a, waarde: X.batterijen[id] }); });
    if (w.apparaten.batterijraam) uit.push({ id: 'batterijraam', a: w.apparaten.raamkinder || w.apparaten.batterijraam, waarde: w.apparaten.batterijraam.st.waarde, via: 'batterijraam' });
    ['radiatorkinder', 'sceneknop'].forEach(function (id) { var a = w.apparaten[id]; if (a && a.batterij != null) uit.push({ id: id, a: a, waarde: a.batterij, veld: true }); });
    return uit.sort(function (a, b) { return a.waarde - b.waarde; });
  }
  function termijnTekst(rest) {
    var n = Math.round(Math.abs(rest));
    if (rest < -0.5) return t('прострочено ', 'te laat: ') + n + ' ' + HV.meervoud(n, ['день', 'дні', 'днів'], ['dag', 'dagen']);
    if (rest < 0.5) return t('сьогодні', 'vandaag');
    if (n > 60) { var m = Math.round(n / 30); return t('через ', 'over ') + m + ' ' + HV.meervoud(m, ['місяць', 'місяці', 'місяців'], ['maand', 'maanden']); }
    return t('через ', 'over ') + n + ' ' + HV.meervoud(n, ['день', 'дні', 'днів'], ['dag', 'dagen']);
  }
  function ring(deel, icoon, toon) {
    var r = 19, omtrek = 2 * Math.PI * r;
    return '<span class="hv-onderhoud__ring hv-toon-' + toon + '" aria-hidden="true"><svg class="hv-onderhoud__svg" viewBox="0 0 44 44"><circle class="hv-onderhoud__baan" cx="22" cy="22" r="' + r + '"/><circle class="hv-onderhoud__boog" cx="22" cy="22" r="' + r + '" stroke-dasharray="' + (omtrek * klem(deel, 0.02, 1)).toFixed(1) + ' ' + omtrek.toFixed(1) + '" transform="rotate(-90 22 22)"/></svg>' + ic(icoon) + '</span>';
  }

  function onderhoudRij(it, w) {
    var s = it.s, mag = magWijzigen(), knoppen = [];
    var toon = it.groep === 'nu' ? (it.rest != null && it.rest < -0.5 ? 'alarm' : 'let-op') : it.groep === 'binnenkort' ? 'let-op' : 'ok';
    var sub = [], term = '';
    if (it.soort === 'firmware') {
      toon = it.klaar ? 'ok' : it.ex.veilig ? 'alarm' : 'let-op';
      sub.push(it.klaar ? t('версія ', 'versie ') + s.versie + t(' — актуальна', ' — actueel') : s.versie + ' → ' + it.ex.naar);
      sub.push(P(it.ex.notities));
      term = it.klaar ? t('оновлено', 'bijgewerkt') : it.ex.veilig ? t('виправлення безпеки', 'veiligheidsupdate') : t('доступне оновлення', 'update beschikbaar');
      if (s.bezig) {
        knoppen.push('<span class="hv-onderhoud__voortgang" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(s.bezig.voortgang) + '" aria-label="' + h(t('Хід оновлення', 'Voortgang van de update')) + '"><i style="width:' + Math.round(s.bezig.voortgang) + '%"></i></span><span class="hv-lb-meta">' + h(P(s.bezig.fase) + ' · ' + Math.round(s.bezig.voortgang) + ' %') + '</span>');
      } else if (!it.klaar) {
        knoppen.push(o.knop({ tekst: it.ex.slaapt ? t('Оновити після натиску', 'Bijwerken na een druk') : t('Оновити', 'Bijwerken'), icoon: 'cloud-download', soort: it.ex.veilig ? 'hoofd' : 'gewoon', klein: true, actie: 'lb-firmware', gegevens: { id: it.id } }));
        if (it.ex.niveau) knoppen.push(o.risico(it.ex.niveau) + o.gevolg(it.id === 'fw-router'
          ? t('Що може статися: мережа зникне приблизно на 3 хв, екрани й камери покажуть «немає зв’язку». Хто зможе це запускати: лише людина з ритуалом утримання. Як вимкнути: не оновлюйте зараз — запис лишиться в «Зараз».', 'Wat er kan gebeuren: het netwerk valt ongeveer 3 min weg, schermen en camera’s tonen ‘geen verbinding’. Wie dit kan starten: alleen een mens met het vasthoudritueel. Uitzetten: werk nu niet bij — de regel blijft in ‘Nu’.')
          : t('Що може статися: замок кілька хвилин не прийматиме команд; він лишається замкненим, ключ працює. Хто зможе це запускати: лише людина. Як вимкнути: не оновлюйте зараз.', 'Wat er kan gebeuren: het slot neemt een paar minuten geen opdrachten aan; het blijft vergrendeld, de sleutel werkt. Wie dit kan starten: alleen een mens. Uitzetten: werk nu niet bij.'), { soort: 'uitroep', kop: t('Ризик оновлення', 'Risico van de update') }));
        else knoppen.push(o.gevolg(t('Що станеться: пристрій завантажить прошивку ' + it.ex.naar + ' і перезапуститься; приблизно ' + it.ex.duur + ' хв він не відповідатиме. Пов’язано з: правила з цим пристроєм зачекають. Як повернути: «Відкотити» протягом 30 днів.', 'Wat er gebeurt: het apparaat laadt firmware ' + it.ex.naar + ' en herstart; ongeveer ' + it.ex.duur + ' min reageert het niet. Hangt samen met: regels met dit apparaat wachten. Terugdraaien: ‘Terugzetten’ binnen 30 dagen.')));
      } else if (s.vorige) {
        knoppen.push(o.knop({ tekst: t('Відкотити до ', 'Terugzetten naar ') + s.vorige, icoon: 'undo-2', soort: 'stil', klein: true, actie: 'lb-firmware-terug', gegevens: { id: it.id } }));
      }
    } else {
      var laatst = HV.datumKort(s.laatst);
      if (it.soort === 'test') sub.push(t('остання перевірка ', 'laatste test ') + laatst + t(' · кожні ', ' · elke ') + it.interval + t(' днів', ' dagen') + (s.uitslag ? ' · ' + P(s.uitslag) : ''));
      else sub.push(t('востаннє ', 'laatst ') + laatst + t(' · кожні ', ' · elke ') + (it.interval >= 60 ? Math.round(it.interval / 30) + t(' міс', ' mnd') : it.interval + t(' днів', ' dagen')));
      if (it.ex.bedrijf) sub.push(P(it.ex.bedrijf));
      if (s.gepland) sub.push(t('записано на ', 'gepland op ') + HV.datumKort(s.gepland));
      if (s.uitgesteld && s.uitgesteld > w.tijd) sub.push(t('відкладено до ', 'uitgesteld tot ') + HV.datumKort(s.uitgesteld));
      term = termijnTekst(it.rest);
      if (s.bezig) knoppen.push('<span class="hv-onderhoud__voortgang is-test" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(s.bezig.voortgang) + '" aria-label="' + h(t('Хід перевірки', 'Voortgang van de test')) + '"><i style="width:' + Math.round(s.bezig.voortgang) + '%"></i></span><span class="hv-lb-meta">' + h(P(s.bezig.fase)) + '</span>');
      else {
        if (it.soort === 'test') knoppen.push(o.knop({ tekst: t('Перевірити зараз', 'Nu testen'), icoon: 'siren', soort: it.groep === 'nu' ? 'hoofd' : 'gewoon', klein: true, actie: 'lb-test-melder', gegevens: { id: it.id } }) +
          o.gevolg(t('Що станеться: сирена датчика звучатиме 3 с, екрани покажуть «Перевірка», аварійний шар не відкриється. Пов’язано з: охорона й правила тривоги знають, що це перевірка. Як повернути: перевірка завершиться сама.', 'Wat er gebeurt: de sirene van de melder klinkt 3 s, schermen tonen ‘Test’, de noodlaag gaat niet open. Hangt samen met: alarm en alarmregels weten dat het een test is. Terugdraaien: de test stopt vanzelf.')));
        else if (it.soort === 'service' && !s.gepland) knoppen.push(o.knop({ tekst: t('Записати на сервіс', 'Service plannen'), icoon: 'calendar-plus', klein: true, actie: 'lb-service', gegevens: { id: it.id } }));
        if (it.soort !== 'test') knoppen.push(o.knop({ tekst: t('Зроблено', 'Gedaan'), icoon: 'check', soort: it.groep === 'nu' ? 'hoofd' : 'gewoon', klein: true, actie: 'lb-gedaan', gegevens: { id: it.id } }));
        if (it.groep !== 'later') knoppen.push(o.knop({ tekst: t('Відкласти на тиждень', 'Week uitstellen'), icoon: 'alarm-clock', soort: 'stil', klein: true, actie: 'lb-later', gegevens: { id: it.id } }));
      }
    }
    if (!mag) knoppen = [slot(t('Обслуговування позначає власник або мешканець', 'Onderhoud markeert de eigenaar of een bewoner'))];
    return '<li class="hv-onderhoud hv-onderhoud--' + h(it.groep) + '" data-k="od-' + h(it.id) + '">' + ring(it.deel, it.icoon, toon) +
      '<div class="hv-onderhoud__tekst"><button type="button" class="hv-onderhoud__naam" data-actie="blad" data-blad="apparaat:' + h(it.doel) + '">' + h(P(it.naam)) + '</button>' +
      '<p class="hv-lb-meta">' + sub.map(h).join('<span class="hv-punt" aria-hidden="true">·</span>') + '</p></div>' +
      '<span class="hv-onderhoud__term hv-toon-' + toon + '">' + ic(toon === 'ok' ? 'circle-check' : toon === 'alarm' ? 'octagon-alert' : 'triangle-alert') + h(term) + '</span>' +
      '<div class="hv-onderhoud__acties">' + knoppen.join('') + '</div></li>';
  }

  function onderhoud(ctx) {
    var w = ctx.staat, X = L(w);
    var items = onderhoudItems(w, X), bats = batterijLijst(w, X);
    var A = w.apparaten;
    var dood = w.volgorde.map(function (id) { return A[id]; }).filter(function (a) { return a.beschikbaar === 'onbereikbaar' || a.beschikbaar === 'verouderd'; });
    var quarantaine = w.auto && w.auto.regels ? w.auto.regels.filter(function (r) { return r.quarantaine; }) : [];
    var batNu = bats.filter(function (b) { return b.waarde < 15; }), batBinnen = bats.filter(function (b) { return b.waarde >= 15 && b.waarde < 30; });
    var nu = items.filter(function (i) { return i.groep === 'nu'; }), binnen = items.filter(function (i) { return i.groep === 'binnenkort'; }), later = items.filter(function (i) { return i.groep === 'later'; });
    var nNu = nu.length + batNu.length + dood.length + quarantaine.length, nBinnen = binnen.length + batBinnen.length;

    var tegel = function (n, label, icoon, toon, sub) { return '<div class="hv-lb-stat hv-toon-' + toon + '"><span class="hv-lb-stat__teken">' + ic(icoon, 'm') + '</span><span class="hv-lb-stat__n">' + n + '</span><span class="hv-lb-stat__label">' + h(label) + '</span><span class="hv-lb-meta">' + h(sub) + '</span></div>'; };
    var kop = '<section class="hv-lb-stats" data-k="od-stats">' +
      tegel(nNu, t('Зараз', 'Nu'), 'triangle-alert', nNu ? 'let-op' : 'ok', t('прострочене й несправне', 'te laat en defect')) +
      tegel(nBinnen, t('Скоро', 'Binnenkort'), 'calendar-clock', 'neutraal', t('у найближчі 30 днів', 'in de komende 30 dagen')) +
      tegel(later.length + bats.length - batNu.length - batBinnen.length, t('Гаразд', 'In orde'), 'circle-check', 'ok', t('строки ще далеко', 'termijnen nog ver weg')) + '</section>';

    var bijzonder = dood.map(function (a) {
      return '<li class="hv-onderhoud hv-onderhoud--nu" data-k="od-dood-' + h(a.id) + '">' + ring(0.02, a.beschikbaar === 'onbereikbaar' ? 'unplug' : 'history', 'let-op') +
        '<div class="hv-onderhoud__tekst"><button type="button" class="hv-onderhoud__naam" data-actie="blad" data-blad="apparaat:' + h(a.id) + '">' + h(P(HV.staat.kamer(a.kamer).naam) + ': ' + P(a.naam)) + '</button><p class="hv-lb-meta">' + h(a.beschikbaar === 'onbereikbaar' ? HV.woord.onbereikbaar() + t(' з ', ' sinds ') + HV.tijd(a.gezien) : HV.woord.verouderd() + ' · ' + HV.oud(HV.kijk.leeftijd(a))) + '</p></div>' +
        '<span class="hv-onderhoud__term hv-toon-let-op">' + ic('triangle-alert') + h(a.beschikbaar === 'onbereikbaar' ? t('немає зв’язку', 'geen verbinding') : t('мовчить', 'zwijgt')) + '</span>' +
        '<div class="hv-onderhoud__acties">' + o.knop({ tekst: t('Що перевірити', 'Wat te controleren'), icoon: 'wrench', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }) + '</div></li>';
    }).concat(quarantaine.map(function (r) {
      return '<li class="hv-onderhoud hv-onderhoud--nu" data-k="od-q-' + h(r.id) + '">' + ring(0.02, 'workflow', 'alarm') + '<div class="hv-onderhoud__tekst"><span class="hv-onderhoud__naam">' + h(t('Правило «', 'Regel ‘') + P(r.naam) + t('»', '’')) + '</span><p class="hv-lb-meta">' + h(t('на карантині: три збої поспіль', 'in quarantaine: drie keer mislukt')) + '</p></div>' +
        '<span class="hv-onderhoud__term hv-toon-alarm">' + ic('octagon-alert') + h(t('на карантині', 'in quarantaine')) + '</span><div class="hv-onderhoud__acties">' + o.knop({ tekst: t('До автоматики', 'Naar automatisering'), icoon: 'workflow', klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen' } }) + '</div></li>';
    })).concat(batNu.map(function (b) { return batterijOnderhoud(b, 'nu'); }));

    var lijstNu = bijzonder.join('') + nu.map(function (i) { return onderhoudRij(i, w); }).join('');
    var lijstBinnen = batBinnen.map(function (b) { return batterijOnderhoud(b, 'binnenkort'); }).join('') + binnen.sort(function (a, b) { return (a.rest == null ? 0 : a.rest) - (b.rest == null ? 0 : b.rest); }).map(function (i) { return onderhoudRij(i, w); }).join('');
    var lijstLater = later.sort(function (a, b) { return (a.rest == null ? 999 : a.rest) - (b.rest == null ? 999 : b.rest); }).map(function (i) { return onderhoudRij(i, w); }).join('');

    var batKaart = '<section class="hv-kaart hv-lb-bats" data-k="od-bats">' + kaartKop('battery-medium', t('Батарейки', 'Batterijen'), '<span class="hv-lb-meta">' + h(t('поріг заміни — 15 %', 'vervangen onder 15 %')) + '</span>') +
      '<ul class="hv-lb-bats__lijst">' + bats.map(function (b) {
        var toon = b.waarde < 15 ? 'alarm' : b.waarde < 30 ? 'let-op' : 'batterij';
        var maanden = Math.max(0, Math.round(b.waarde / 100 * 18));
        return '<li class="hv-lb-bat hv-toon-' + toon + '" data-k="bat-' + h(b.id) + '"><button type="button" class="hv-lb-bat__naam" data-actie="blad" data-blad="apparaat:' + h(b.via || b.a.id) + '">' + ic(b.waarde < 15 ? 'battery-warning' : b.waarde < 50 ? 'battery-medium' : 'battery-full') + '<span>' + h(P(HV.staat.kamer(b.a.kamer).naam) + ' · ' + P(b.a.naam)) + '</span></button>' +
          '<span class="hv-lb-bat__balk" aria-hidden="true"><i style="width:' + klem(b.waarde, 2, 100) + '%"></i></span><strong>' + h(HV.maatTekst(Math.round(b.waarde), '%', 0)) + '</strong><span class="hv-lb-meta">' + h(b.waarde < 15 ? t('замінити', 'vervangen') : '≈ ' + maanden + t(' міс', ' mnd')) + '</span></li>';
      }).join('') + '</ul></section>';

    var gedaan = w.logboek.filter(function (r) { return r.onderhoud; }).slice(0, 8);
    var historie = gedaan.length ? '<section class="hv-kaart" data-k="od-hist">' + kaartKop('history', t('Зроблено нещодавно', 'Onlangs gedaan'), '') + '<ul class="hv-berichten">' + gedaan.map(function (r) { return o.bericht(r, { open: HV.ui.lees('bericht', null) === r.id }); }).join('') + '</ul></section>' : '';
    var fwOpen = items.filter(function (i) { return i.soort === 'firmware' && !i.klaar && !i.ex.niveau && !i.s.bezig; });
    var fwKnop = fwOpen.length > 1 && magWijzigen() ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Оновити безпечні прошивки · ', 'Veilige firmware bijwerken · ') + fwOpen.length, icoon: 'cloud-download', actie: 'lb-firmware-alle' }) +
      o.gevolg(t('Що станеться: оновляться прошивки без позначки ризику, по черзі; кожен пристрій кілька хвилин не відповідатиме. Пов’язано з: маршрутизатор і замок оновлюються лише окремо, з ритуалом. Як повернути: «Відкотити» біля кожного пристрою.', 'Wat er gebeurt: firmware zonder risicomarkering wordt een voor een bijgewerkt; elk apparaat reageert een paar minuten niet. Hangt samen met: router en slot worden alleen apart bijgewerkt, met het ritueel. Terugdraaien: ‘Terugzetten’ bij elk apparaat.')) + '</div>' : '';

    return '<div class="hv-lb hv-lb-od" data-k="lb-od">' + kop + '<div class="hv-lb-od__rooster"><div class="hv-lb-od__kolom">' +
      o.blok({ id: 'lb-od-nu', titel: t('Зараз', 'Nu'), teller: nNu, inhoud: lijstNu ? '<ul class="hv-onderhoud__lijst hv-kaart">' + lijstNu + '</ul>' : '', vast: true }) +
      o.blok({ id: 'lb-od-binnen', titel: t('Скоро', 'Binnenkort'), teller: nBinnen, inhoud: lijstBinnen ? '<ul class="hv-onderhoud__lijst hv-kaart">' + lijstBinnen + '</ul>' + fwKnop : '' }) +
      o.blok({ id: 'lb-od-later', titel: t('Пізніше й актуальне', 'Later en actueel'), teller: later.length, inhoud: lijstLater ? '<ul class="hv-onderhoud__lijst hv-kaart">' + lijstLater + '</ul>' : '', dicht: true, samenvatting: h(t('Строки далі ніж за 30 днів і актуальні прошивки.', 'Termijnen verder dan 30 dagen en actuele firmware.')) }) +
      (!lijstNu && !lijstBinnen ? o.leeg({ icoon: 'circle-check', titel: t('Усе обслуговано', 'Alles is onderhouden'), tekst: t('Наступний строк — у розділі «Пізніше».', 'De volgende termijn staat bij ‘Later’.') }) : '') +
      '</div><div class="hv-lb-od__kolom">' + batKaart + historie + '</div></div></div>';
  }
  function batterijOnderhoud(b, groep) {
    var naam = P(HV.staat.kamer(b.a.kamer).naam) + ': ' + t('батарейка, ', 'batterij, ') + P(b.a.naam).toLowerCase();
    return '<li class="hv-onderhoud hv-onderhoud--' + groep + '" data-k="od-bat-' + h(b.id) + '">' + ring(b.waarde / 100, b.waarde < 15 ? 'battery-warning' : 'battery-low', b.waarde < 15 ? 'alarm' : 'let-op') +
      '<div class="hv-onderhoud__tekst"><button type="button" class="hv-onderhoud__naam" data-actie="blad" data-blad="apparaat:' + h(b.via || b.a.id) + '">' + h(naam) + '</button><p class="hv-lb-meta">' + h(t('батарейка-таблетка · ', 'knoopcelbatterij · ') + (b.waarde < 15 ? t('датчик може замовкнути за кілька днів', 'de sensor kan binnen enkele dagen zwijgen') : t('ще кілька тижнів', 'nog enkele weken'))) + '</p></div>' +
      '<span class="hv-onderhoud__term hv-toon-' + (b.waarde < 15 ? 'alarm' : 'let-op') + '">' + ic('battery-warning') + h(HV.maatTekst(Math.round(b.waarde), '%', 0)) + '</span>' +
      '<div class="hv-onderhoud__acties">' + (magWijzigen() ? o.knop({ tekst: t('Замінено', 'Vervangen'), icoon: 'check', soort: groep === 'nu' ? 'hoofd' : 'gewoon', klein: true, actie: 'lb-batterij', gegevens: { id: b.id } }) : slot(t('Позначає власник або мешканець', 'Markeert de eigenaar of een bewoner'))) + '</div></li>';
  }

  // ───────────────────────── Вкладка «Правила» ─────────────────────────
  function regels(ctx) {
    var w = ctx.staat, X = L(w), mag = magWijzigen();
    var open = HV.ui.lees('lb-regel-open', null);
    var stilNu = isStil(X, w.tijd);
    var ik = HV.mens();

    // хто що отримує зараз
    var voorbeeld = { tijd: w.tijd, gewicht: 'belangrijk', soort: 'huis.apparaat', dienst: 'apparaten', wat: ['', ''] };
    var alarmVb = { tijd: w.tijd, gewicht: 'alarm', soort: 'huis.alarm', wat: ['', ''] };
    var ontvRij = function (label, r) {
      var l = ontvangers(r, X);
      return '<div class="hv-lb-ontv"><span class="hv-lb-ontv__label">' + h(label) + '</span><span class="hv-lb-ontv__mensen">' + (l.length ? l.map(function (x) {
        var kan = x.kanalen.map(function (k) { return KANALEN.filter(function (c) { return c.id === k; })[0]; });
        return '<span class="hv-lb-mens' + (x.stil ? ' is-stil' : '') + '"><span class="hv-lb-mens__naam">' + h(P(x.mens.naam)) + '</span>' + kan.filter(function (k) { return k.id !== 'app'; }).map(function (k) { return ic(k.icoon); }).join('') +
          '<span class="hv-vo">' + h(': ' + kan.map(function (k) { return P(k.naam).toLowerCase(); }).join(', ')) + '</span></span>';
      }).join('') : '<span class="hv-lb-meta">' + h(t('нікому — лише Журнал', 'niemand — alleen het logboek')) + '</span>') + '</span></div>';
    };
    var samen = '<section class="hv-lb-kop hv-lb-kop--regels" data-k="rg-kop"><div class="hv-lb-kop__getal"><span class="hv-lb-kop__n">' + ic(stilNu ? 'moon' : 'bell-ring', 'l') + '</span></div>' +
      '<p class="hv-lb-kop__zin">' + h(stilNu ? t('Зараз тихі години: телефони мовчать, тривоги проходять зі звуком.', 'Nu zijn het stille uren: telefoons zwijgen, alarmen komen met geluid door.') : t('Зараз сповіщення йдуть звичайно; тихі години — з ', 'Meldingen komen nu gewoon binnen; stille uren vanaf ') + uurTekst(X.stil.van) + '.') + '</p>' +
      '<div class="hv-lb-kop__chips hv-lb-kop__chips--ontv">' + ontvRij(t('Важливе з пристроїв', 'Belangrijk van apparaten'), voorbeeld) + ontvRij(t('Тривога', 'Alarm'), alarmVb) + '</div>' +
      '<div class="hv-lb-kop__acties">' + o.knop({ tekst: X.test && X.test.bezig ? t('Надсилається…', 'Wordt verstuurd…') : t('Надіслати перевірку', 'Test versturen'), icoon: 'send', soort: 'hoofd', actie: 'lb-test', uit: !!(X.test && X.test.bezig) }) + '</div></section>';

    var test = X.test ? '<section class="hv-kaart hv-lb-test" data-k="rg-test">' + kaartKop('send', t('Перевірка доставки', 'Bezorgtest'), '<span class="hv-lb-meta">' + h(HV.tijd(X.test.tijd) + ' · ' + P(ik.naam)) + '</span>') +
      '<ol class="hv-lb-test__lijst">' + X.test.kanalen.map(function (k) {
        var kn = KANALEN.filter(function (c) { return c.id === k.id; })[0];
        var toon = k.stand === 'bezorgd' ? 'ok' : k.stand === 'mislukt' ? 'alarm' : k.stand === 'traag' ? 'let-op' : 'neutraal';
        var woord = { wacht: ['надсилається…', 'wordt verstuurd…'], bezorgd: ['доставлено', 'bezorgd'], traag: ['доставлено із запізненням', 'bezorgd met vertraging'], mislukt: ['не доставлено', 'niet bezorgd'], stil: ['без звуку: тихі години', 'zonder geluid: stille uren'] }[k.stand];
        return '<li class="hv-toon-' + toon + '" data-k="tk-' + k.id + '">' + ic(kn.icoon, 'm') + '<span>' + h(P(kn.naam)) + '</span><strong>' + ic(k.stand === 'bezorgd' ? 'circle-check' : k.stand === 'mislukt' ? 'circle-x' : k.stand === 'wacht' ? 'loader' : 'triangle-alert') + h(P(woord)) + '</strong>' + (k.reden ? '<span class="hv-lb-meta">' + h(P(k.reden)) + '</span>' : '') + '</li>';
      }).join('') + '</ol></section>' : '';

    // служби
    var diensten = '<section class="hv-kaart hv-lb-regels" data-k="rg-diensten">' + kaartKop('sliders-horizontal', t('Що, куди й кому', 'Wat, waarheen en naar wie'), mag ? '' : slot(t('змінює власник або мешканець', 'wijzigt de eigenaar of een bewoner'))) +
      '<ul class="hv-lb-regels__lijst">' + DIENSTEN.map(function (d) {
        var r = X.regels[d.id], isOpen = open === d.id;
        var kanalen = KANALEN.filter(function (k) { return k.id === 'app' || r[k.id]; }).map(function (k) { return P(k.naam).toLowerCase(); }).join(', ');
        var kop = '<button type="button" class="hv-lb-regel__kop" aria-expanded="' + (isOpen ? 'true' : 'false') + '" data-actie="ui" data-naam="lb-regel-open" data-waarde="' + (isOpen ? '' : d.id) + '">' +
          '<span class="hv-lb-regel__teken">' + ic(d.icoon, 'm') + '</span><span class="hv-lb-regel__naam">' + h(P(d.naam)) + (d.beschermd ? '<span class="hv-lb-beschermd">' + ic('shield-check') + h(t('захищено', 'beschermd')) + '</span>' : '') + '</span>' +
          '<span class="hv-lb-regel__som">' + h(P(VANAF[r.vanaf]) + (r.vanaf === 'nooit' ? '' : ' → ' + kanalen + ' · ' + P(WIE[r.wie]))) + '</span>' + ic('chevron-down').replace('class="hv-ic', 'class="hv-lb-regel__pijl hv-ic') + '</button>';
        var lijf = '';
        if (isOpen) {
          var opties = Object.keys(VANAF).map(function (id) { return { id: id, label: P(VANAF[id]) }; });
          lijf = '<div class="hv-lb-regel__lijf">' +
            veld(t('Надсилати на телефон', 'Naar de telefoon sturen'), o.segment({ label: t('Від якої важливості', 'Vanaf welk gewicht'), waarde: r.vanaf, actie: mag ? 'lb-regel-vanaf' : null, gegevens: { dienst: d.id }, uit: !mag, klas: 'hv-segment--vier', k: 'rv-' + d.id, opties: opties }) +
              (d.beschermd ? '<p class="hv-lb-noot">' + ic('lock') + h(t('Тривоги й запити цієї служби доставляються завжди — «лише тривоги» й «лише в Журналі» тут не діють.', 'Alarmen en verzoeken van deze dienst komen altijd aan — ‘alleen alarm’ en ‘alleen in het logboek’ gelden hier niet.')) + '</p>' : '')) +
            veld(t('Канали', 'Kanalen'), '<div class="hv-filter hv-lb-filter" role="group" aria-label="' + h(t('Канали', 'Kanalen')) + '">' + KANALEN.filter(function (k) { return k.id !== 'geluid' || d.id === 'veiligheid'; }).map(function (k) {
              var aan = k.vast || !!r[k.id];
              if (k.vast || !mag) return o.chip({ icoon: k.vast ? 'lock' : k.icoon, tekst: P(k.naam) + (k.vast ? t(' · завжди', ' · altijd') : aan ? '' : t(' · ні', ' · nee')), klas: 'hv-lb-kanaal' + (aan ? ' is-aan' : ''), k: 'k-' + d.id + '-' + k.id });
              return o.chip({ filter: true, gekozen: aan, icoon: k.icoon, tekst: P(k.naam), actie: 'lb-regel-kanaal', gegevens: { dienst: d.id, kanaal: k.id }, k: 'k-' + d.id + '-' + k.id });
            }).join('') + (d.id === 'veiligheid' ? o.gevolg(t('Що може статися: «Звук крізь тишу» будить телефон уночі навіть у режимі «Не турбувати». Хто зможе це запускати: лише тривоги диму, газу, води й зламу. Як вимкнути: зніміть цей канал — тривога прийде без звуку.', 'Wat er kan gebeuren: ‘Geluid door de stilte’ maakt de telefoon ’s nachts wakker, ook bij ‘Niet storen’. Wie dit kan starten: alleen alarmen voor rook, gas, water en inbraak. Uitzetten: haal dit kanaal weg — het alarm komt dan zonder geluid.'), { soort: 'uitroep', kop: t('Звук крізь тишу', 'Geluid door de stilte') }) : '') + '</div>') +
            veld(t('Кому', 'Naar wie'), o.segment({ label: t('Кому', 'Naar wie'), waarde: r.wie, actie: mag ? 'lb-regel-wie' : null, gegevens: { dienst: d.id }, uit: !mag, klas: 'hv-segment--vier', k: 'rw-' + d.id, opties: ['thuis', 'volwassenen', 'eigenaar', 'iedereen'].map(function (id) { return { id: id, label: P(WIE[id]) }; }) })) +
            ontvRij(t('Приклад зараз', 'Voorbeeld nu'), { tijd: w.tijd, gewicht: d.beschermd ? 'alarm' : 'belangrijk', dienst: d.id, soort: 'huis.apparaat', wat: ['', ''] }) + '</div>';
        }
        return '<li class="hv-lb-regel' + (isOpen ? ' is-open' : '') + '" data-k="rg-' + d.id + '">' + kop + lijf + '</li>';
      }).join('') + '</ul></section>';

    // тихі години
    var s = X.stil;
    var strook = function () {
      var vanP = s.van / 24 * 100, totP = s.tot / 24 * 100, nuP = HV.uur(w.tijd) / 24 * 100;
      var vlakken = s.van > s.tot ? '<i style="left:' + vanP.toFixed(2) + '%;width:' + (100 - vanP).toFixed(2) + '%"></i><i style="left:0;width:' + totP.toFixed(2) + '%"></i>' : '<i style="left:' + vanP.toFixed(2) + '%;width:' + (totP - vanP).toFixed(2) + '%"></i>';
      return '<div class="hv-lb-stilstrook' + (s.aan ? '' : ' is-uit') + '" role="img" aria-label="' + h(t('Тихі години ', 'Stille uren ') + uurTekst(s.van) + '–' + uurTekst(s.tot)) + '">' + vlakken + '<b style="left:' + nuP.toFixed(2) + '%"><span>' + h(t('зараз', 'nu')) + '</span></b>' +
        '<div class="hv-lb-stilstrook__as">' + ['00', '06', '12', '18', '24'].map(function (x, i) { return '<span style="left:' + (i * 25) + '%">' + x + '</span>'; }).join('') + '</div></div>';
    };
    var stil = '<section class="hv-kaart hv-lb-stil" data-k="rg-stil">' + kaartKop('moon', t('Тихі години', 'Stille uren'), o.schakel({ aan: s.aan, icoon: 'moon', toon: 'neutraal', actie: mag ? 'lb-stil-aan' : null, aria: t('Тихі години', 'Stille uren') })) +
      strook() +
      '<div class="hv-lb-stil__tijden">' +
      veld(t('Початок', 'Begin'), '<span class="hv-lb-tijdveld">' + (mag ? o.stapper({ actie: 'lb-stil-tijd', gegevens: { veld: 'van' }, stap: 0.5, label: t('Початок тихих годин', 'Begin van de stille uren'), waarde: '<strong>' + uurTekst(s.van) + '</strong>', k: 'st-van' }) : '<strong>' + uurTekst(s.van) + '</strong>') + '</span>') +
      veld(t('Кінець', 'Einde'), '<span class="hv-lb-tijdveld">' + (mag ? o.stapper({ actie: 'lb-stil-tijd', gegevens: { veld: 'tot' }, stap: 0.5, label: t('Кінець тихих годин', 'Einde van de stille uren'), waarde: '<strong>' + uurTekst(s.tot) + '</strong>', k: 'st-tot' }) : '<strong>' + uurTekst(s.tot) + '</strong>') + '</span>') + '</div>' +
      veld(t('Дні', 'Dagen'), o.segment({ label: t('Дні тихих годин', 'Dagen van de stille uren'), waarde: s.dagen, actie: mag ? 'lb-stil-dagen' : null, uit: !mag, k: 'st-dagen', opties: [{ id: 'elke', label: t('Щодня', 'Elke dag') }, { id: 'werk', label: t('Будні', 'Werkdagen') }, { id: 'weekend', label: t('Вихідні', 'Weekend') }] })) +
      veld(t('Що проходить крізь тишу', 'Wat door de stilte komt'), '<div class="hv-filter hv-lb-filter">' +
        o.chip({ icoon: 'lock', tekst: t('Тривоги · завжди', 'Alarmen · altijd'), klas: 'hv-lb-kanaal is-aan', k: 'door-alarm' }) +
        o.chip({ filter: true, gekozen: s.belangrijk, icoon: 'triangle-alert', tekst: t('Важливе', 'Belangrijk'), actie: mag ? 'lb-stil-door' : null, gegevens: { soort: 'belangrijk' }, k: 'door-bel' }) +
        o.chip({ filter: true, gekozen: s.verzoek, icoon: 'circle-help', tekst: t('Запити на схвалення', 'Verzoeken om goedkeuring'), actie: mag ? 'lb-stil-door' : null, gegevens: { soort: 'verzoek' }, k: 'door-vz' }) + '</div>') +
      '<p class="hv-lb-meta">' + h(stilNu ? t('Зараз діють — до ', 'Nu actief — tot ') + uurTekst(s.tot) : s.aan ? t('Зараз не діють — почнуться о ', 'Nu niet actief — beginnen om ') + uurTekst(s.van) : t('Вимкнено: сповіщення приходять зі звуком цілодобово.', 'Uit: meldingen komen dag en nacht met geluid.')) + '</p></section>';

    // ескалація
    var e = X.escalatie;
    var esc = '<section class="hv-kaart hv-lb-esc" data-k="rg-esc">' + kaartKop('siren', t('Ескалація тривог і запитів', 'Escalatie van alarmen en verzoeken'), o.schakel({ aan: e.aan, icoon: 'siren', toon: 'neutraal', actie: mag ? 'lb-esc-aan' : null, aria: t('Ескалація', 'Escalatie') })) +
      '<p class="hv-lb-meta">' + h(t('Якщо ніхто не відповів, сповіщення йде далі — до наступного кола людей.', 'Als niemand reageert, gaat de melding verder — naar de volgende kring.')) + '</p>' +
      '<ol class="hv-escalatie' + (e.aan ? '' : ' is-uit') + '">' + e.stappen.map(function (st, i) {
        return '<li class="hv-escalatie__stap" data-k="esc-' + i + '"><div class="hv-escalatie__kaart"><span class="hv-escalatie__na">' + h(i === 0 ? t('одразу', 'meteen') : t('через ', 'na ') + st.na + t(' хв', ' min')) + '</span>' +
          '<span class="hv-escalatie__wie">' + ic(st.wie === 'sleutel' ? 'key-round' : st.wie === 'thuis' ? 'house' : 'users', 'm') + '<strong>' + h(P(WIE[st.wie])) + '</strong></span>' +
          (mag && i > 0 ? '<span class="hv-escalatie__orgaan">' + o.stapper({ actie: 'lb-esc-na', gegevens: { i: i }, stap: 1, label: t('Хвилин до кроку ', 'Minuten tot stap ') + (i + 1), k: 'escna-' + i }) +
            '<select class="hv-lb-select" data-lb-esc="' + i + '" aria-label="' + h(t('Кому на кроці ', 'Naar wie bij stap ') + (i + 1)) + '">' + ['thuis', 'volwassenen', 'eigenaar', 'iedereen', 'sleutel'].map(function (id) { return '<option value="' + id + '"' + (id === st.wie ? ' selected' : '') + '>' + h(P(WIE[id])) + '</option>'; }).join('') + '</select>' +
            o.icoonknop({ icoon: 'x', aria: t('Прибрати крок ', 'Stap weghalen ') + (i + 1), actie: 'lb-esc-weg', gegevens: { i: i }, maat: 's' }) + '</span>' : '') + '</div>' +
          (i < e.stappen.length - 1 ? '<span class="hv-escalatie__pijl" aria-hidden="true">' + ic('arrow-right') + '</span>' : '') + '</li>';
      }).join('') + '</ol>' +
      (mag && e.stappen.length < 4 ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Додати крок', 'Stap toevoegen'), icoon: 'plus', soort: 'stil', klein: true, actie: 'lb-esc-plus' }) + '</div>' : '') +
      '<p class="hv-lb-meta">' + h(t('Діє для: тривога · запит на схвалення. Відповідь будь-кого зупиняє ескалацію.', 'Geldt voor: alarm · verzoek om goedkeuring. Een antwoord van wie dan ook stopt de escalatie.')) + '</p></section>';

    // мова одержувача
    var taal = '<section class="hv-kaart hv-lb-taal" data-k="rg-taal">' + kaartKop('languages', t('Мова одержувача', 'Taal van de ontvanger'), '') + '<ul class="hv-rijen">' + w.mensen.map(function (m) {
      return '<li class="hv-lb-taal__rij" data-k="taal-' + m.id + '"><span class="hv-lb-taal__naam">' + ic(m.gast ? 'user-round' : 'user', 'm') + '<span>' + h(P(m.naam)) + '</span><span class="hv-lb-meta">' + h(P((HV.paspoort.rollen.filter(function (r) { return r.id === m.rol; })[0] || { naam: ['', ''] }).naam)) + '</span></span>' +
        o.segment({ label: t('Мова для ', 'Taal voor ') + P(m.naam), waarde: X.taal[m.id] || 'uk', actie: mag ? 'lb-taal' : null, uit: !mag, gegevens: { mens: m.id }, k: 'taal-s-' + m.id, opties: [{ id: 'uk', label: t('Українська', 'Oekraïens') }, { id: 'nl', label: t('Нідерландська', 'Nederlands') }] }) + '</li>';
    }).join('') + '</ul></section>';

    // симуляція назовні
    var sim = '<section class="hv-kaart hv-lb-sim" data-k="rg-sim">' + kaartKop('flask-conical', t('Симуляцію — в зовнішні канали', 'Simulatie ook naar buiten'), o.schakel({ aan: X.simBuiten, icoon: 'flask-conical', toon: 'neutraal', actie: mag ? 'lb-simbuiten' : null, aria: t('Симуляцію — в зовнішні канали', 'Simulatie ook naar buiten') })) +
      '<p class="hv-lb-meta">' + h(X.simBuiten ? t('Події симулятора йдуть на телефони й пошту з позначкою «симуляція».', 'Gebeurtenissen van de simulator gaan naar telefoons en e-mail met de markering ‘simulatie’.') : t('Події симулятора лишаються в застосунку й Журналі; на телефон і пошту не йдуть.', 'Gebeurtenissen van de simulator blijven in de app en het logboek; niet naar telefoon of e-mail.')) + '</p>' +
      '<p class="hv-lb-risico">' + o.risico('gevoelig') + o.gevolg(t('Що може статися: людина отримає на телефон «тривогу», якої насправді не було, і може злякатися чи викликати допомогу. Хто зможе це запускати: будь-який сценарій симулятора. Як вимкнути: залиште цей перемикач вимкненим.', 'Wat er kan gebeuren: iemand krijgt een ‘alarm’ op de telefoon dat niet echt was, schrikt of belt hulp. Wie dit kan starten: elk scenario van de simulator. Uitzetten: laat deze schakelaar uit.'), { soort: 'uitroep', kop: t('Ризик', 'Risico') }) + '</p></section>';

    return '<div class="hv-lb hv-lb-rg" data-k="lb-rg">' + samen + test + '<div class="hv-lb-rg__rooster"><div class="hv-lb-rg__kolom">' + diensten + '</div><div class="hv-lb-rg__kolom">' + stil + esc + taal + sim + '</div></div></div>';
  }

  // ───────────────────────── Реєстрація ─────────────────────────
  HV.scherm({
    id: 'activiteit', sectie: 'logboek', titel: ['Журнал', 'Logboek'], icoon: 'bell', adres: '/activiteit',
    tabs: [
      { id: 'meldingen', titel: ['Сповіщення', 'Meldingen'], adres: '/activiteit', render: meldingen },
      { id: 'geschiedenis', titel: ['Історія', 'Geschiedenis'], adres: '/activiteit/geschiedenis', render: geschiedenis },
      { id: 'onderhoud', titel: ['Обслуговування', 'Onderhoud'], adres: '/activiteit/onderhoud', render: onderhoud },
      { id: 'regels', titel: ['Правила', 'Regels'], adres: '/activiteit/regels', render: regels }
    ]
  });

  // ── Аркуш «Чому?» ──
  HV.blad({
    soort: 'waarom', vrij: true, icoon: 'circle-help', titel: ['Чому?', 'Waarom?'],
    sub: function (ctx, id) { var r = vind(id); return r ? HV.datum(r.tijd) + ' · ' + HV.tijd(r.tijd) + (r.maker && r.maker.naam ? ' · ' + P(r.maker.naam) : '') : ''; },
    render: function (ctx, id) {
      var w = ctx.staat, X = L(w), r = vind(id);
      if (!r) return o.leeg({ icoon: 'circle-help', titel: t('Запис не знайдено', 'Regel niet gevonden') });
      var keten = r.keten || [
        r.maker && r.maker.soort === 'mens' && r.maker.naam ? [r.maker.naam[0] + ' — дія вручну', r.maker.naam[1] + ' — handmatig'] : r.maker && r.maker.soort === 'knop' ? ['натиск кнопки', 'druk op de knop'] : ['подія в домі', 'gebeurtenis in huis'],
        r.waarom || (r.toegestaan ? r.toegestaan : ['без додаткових умов', 'zonder extra voorwaarden']),
        r.wat
      ];
      var stappen = '<ol class="hv-lb-keten hv-lb-keten--groot">' + keten.map(function (s, i) {
        return '<li><span class="hv-lb-keten__nr">' + (i + 1) + '</span><span class="hv-lb-keten__stap">' + h([t('Що запустило', 'Aanleiding'), t('Умова', 'Voorwaarde'), t('Дія', 'Actie')][i]) + '</span><span>' + h(P(s)) + '</span></li>';
      }).join('') + '</ol>';
      var verwant = r.doel ? w.logboek.filter(function (x) { return x.doel === r.doel && x.id !== r.id; }).slice(0, 5) : [];
      return o.kaart({ inhoud: stappen }) + details(r, X, w, null, true).replace('class="hv-lb-m__details"', 'class="hv-lb-m__details hv-lb-m__details--blad"') +
        (verwant.length ? o.kaart({ titel: t('Інші події цього пристрою', 'Andere gebeurtenissen van dit apparaat'), inhoud: '<ul class="hv-berichten">' + verwant.map(function (x) { return o.bericht(x, { open: HV.ui.lees('bericht', null) === x.id }); }).join('') + '</ul>' }) : '');
    }
  });
  function vind(id) { var w = HV.staat.w; for (var i = 0; i < w.logboek.length; i++) if (w.logboek[i].id === id) return w.logboek[i]; return null; }

  // ── Аркуш «Виправити значення» ──
  HV.blad({
    soort: 'lbcorrectie', vrij: true, icoon: 'pencil-line', titel: ['Виправити значення', 'Waarde corrigeren'],
    sub: function (ctx, id) { var e = ENT[id] || ENT.tempwoon; return P(e.naam) + ' · ' + t('аудит лише на додавання', 'controlespoor alleen toevoegen'); },
    render: function (ctx, id) {
      var w = ctx.staat, X = L(w), e = ENT[id] ? id : 'tempwoon', E = ENT[e];
      var per = PERIODEN[HV.ui.lees('lb-periode', 'u24')] || PERIODEN.u24;
      var moment = Math.min(w.tijd, w.tijd + (Number(HV.ui.lees('lb-moment', 0)) || 0) * MIN);
      moment = Math.round(moment / per.stap) * per.stap;
      if (moment > w.tijd) moment -= per.stap;
      var gemeten = E.f(moment);
      var nieuw = HV.ui.lees('lb-corr-waarde', null);
      var v = nieuw == null ? Math.round(gemeten * Math.pow(10, E.dec)) / Math.pow(10, E.dec) : Number(nieuw);
      var reden = HV.ui.lees('lb-corr-reden', 'zon');
      var stap = E.dec >= 1 ? 0.1 : 1;
      var ents = ENT_VOLGORDE.filter(function (x) { return ENT[x].bron; });
      return o.kaart({ inhoud:
        veld(t('Ряд', 'Reeks'), '<div class="hv-filter hv-lb-filter">' + ents.map(function (x) { return o.chip({ filter: true, gekozen: x === e, tekst: P(ENT[x].naam), actie: 'blad', gegevens: { blad: 'lbcorrectie:' + x }, k: 'ce-' + x }); }).join('') + '</div>') +
        '<div class="hv-lb-corr">' + o.getal({ maat: 'm', label: t('Виміряно о ', 'Gemeten om ') + momentTekst(moment, per), waarde: HV.maat(gemeten, eenheidTekst(E.eenheid), E.dec) }) + ic('arrow-right', 'l') +
        o.getal({ maat: 'm', label: t('Нове значення', 'Nieuwe waarde'), waarde: HV.maat(v, eenheidTekst(E.eenheid), E.dec), toon: 'warm' }) + '</div>' +
        '<div class="hv-lb-corr__stapper">' + o.stapper({ actie: 'lb-corr-stap', gegevens: { stap: stap, basis: v }, stap: stap, label: t('Нове значення', 'Nieuwe waarde'), k: 'corr-stap' }) + '<span class="hv-lb-meta">' + h(t('Курсор графіка задає момент.', 'De cursor van de grafiek kiest het moment.')) + '</span></div>' +
        veld(t('Причина', 'Reden'), o.segment({ label: t('Причина виправлення', 'Reden van de correctie'), waarde: reden, actie: 'lb-corr-reden', klas: 'hv-segment--vier', k: 'corr-reden', opties: [
          { id: 'zon', label: t('Сонце на датчику', 'Zon op de sensor') }, { id: 'storing', label: t('Збій датчика', 'Storing') }, { id: 'kalibratie', label: t('Калібрування', 'Kalibratie') }] })) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Зберегти виправлення', 'Correctie opslaan'), icoon: 'check', soort: 'hoofd', actie: 'lb-corr-opslaan', gegevens: { entiteit: e, tijd: moment, waarde: v, was: gemeten, reden: reden } }) +
        o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'blad-sluit' }) +
        o.gevolg(t('Що станеться: у графіках і звітах замість виміряного стане нове значення з позначкою «виправлено»; виміряне лишається в аудиті. Пов’язано з: правила, що вже спрацювали, не перезапускаються. Як повернути: «Повернути» протягом 10 с або нове виправлення.', 'Wat er gebeurt: in grafieken en rapporten staat de nieuwe waarde met de markering ‘gecorrigeerd’; de meting blijft in het controlespoor. Hangt samen met: regels die al afgingen, worden niet opnieuw gestart. Terugdraaien: ‘Ongedaan maken’ binnen 10 s of een nieuwe correctie.')) + '</div>' });
    }
  });

  // ───────────────────────── Дії ─────────────────────────
  HV.actie('lb-open', function (ctx, g) {
    var nu = HV.ui.lees('lb-open', null);
    HV.ui.zet('lb-open', nu === g.id ? null : g.id);
    var r = vind(g.id);
    if (r && !r.gelezen) HV.staat.wijzig(function () { r.gelezen = true; });
  });
  HV.actie('lb-alleen', function (ctx, g) { HV.ui.zet('lb-alleen', g.waarde); HV.ui.zet('lb-meer', 40); });
  HV.actie('lb-filters-weg', function () { ['lb-dienst', 'lb-maker', 'lb-gewicht'].forEach(function (n) { HV.ui.zet(n, 'alle'); }); HV.ui.zet('lb-zoek', ''); HV.ui.zet('lb-alleen', 'alle'); var v = document.getElementById('hv-lb-zoek'); if (v) v.value = ''; });
  HV.actie('lb-alles-gelezen', function () {
    var w = HV.staat.w, ids = w.logboek.filter(function (r) { return !r.gelezen; }).map(function (r) { return r.id; });
    HV.logboek.leesAlles();
    HV.meld({ icoon: 'check-check', titel: t('Усе прочитано', 'Alles gelezen'), tekst: ids.length + ' ' + HV.meervoud(ids.length, ['запис', 'записи', 'записів'], ['regel', 'regels']), terug: function () { HV.staat.wijzig(function (x) { x.logboek.forEach(function (r) { if (ids.indexOf(r.id) >= 0) r.gelezen = false; }); }); } });
  });
  HV.actie('lb-gelezen', function (ctx, g) { var r = vind(g.id); if (r) HV.staat.wijzig(function () { r.gelezen = !r.gelezen; }); });
  HV.actie('lb-sluimer', function (ctx, g) {
    var w = HV.staat.w, r = vind(g.id); if (!r) return;
    var tot = w.tijd + UUR;
    HV.staat.wijzig(function (x) { var X = L(x); X.status[g.id] = { sluimer: tot }; r.gelezen = true; });
    if (HV.ui.lees('lb-open', null) === g.id) HV.ui.zet('lb-open', null);
    HV.meld({ icoon: 'alarm-clock', titel: t('Відкладено до ', 'Uitgesteld tot ') + HV.tijd(tot), tekst: P(r.wat), terug: function () { HV.staat.wijzig(function (x) { delete L(x).status[g.id]; }); } });
  });
  HV.actie('lb-wek', function (ctx, g) { HV.staat.wijzig(function (x) { delete L(x).status[g.id]; }); });
  HV.actie('lb-terug', function (ctx, g) {
    var r = vind(g.id); if (!r || !r.terug) return;
    HV.doe({ doel: r.terug.doel, mogelijkheid: r.terug.mogelijkheid, waarde: r.terug.waarde, waarom: ['повернуто з Журналу: ' + r.wat[0], 'ongedaan gemaakt vanuit het logboek: ' + r.wat[1]] });
  });
  HV.actie('lb-naar-regel', function (ctx, g) { HV.ui.zet('lb-regel-open', g.dienst); HV.open('activiteit-regels'); });

  // пошук: поле живе поза перерисовкою (вузол INPUT ядро не чіпає)
  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'hv-lb-zoek') { HV.ui.zet('lb-zoek', ev.target.value); HV.ui.zet('lb-meer', 40); }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute || el.getAttribute('data-lb-esc') == null) return;
    var i = Number(el.getAttribute('data-lb-esc')), waarde = el.value, X = L(), oud = X.escalatie.stappen[i] ? X.escalatie.stappen[i].wie : null;
    if (!oud || oud === waarde) return;
    wijzig({ wat: ['Ескалація: крок ' + (i + 1), 'Escalatie: stap ' + (i + 1)], was: WIE[oud], werd: WIE[waarde], icoon: 'siren', pas: function (Y) { Y.escalatie.stappen[i].wie = waarde; } });
  });

  // ── Історія ──
  HV.actie('lb-weergave', function (ctx, g) { HV.open('activiteit-geschiedenis' + (g.waarde === 'tijdlijn' ? '' : '-' + g.waarde)); });
  HV.actie('lb-periode', function (ctx, g) { HV.ui.zet('lb-moment', 0); HV.ui.zet('lb-periode', g.waarde); });
  HV.actie('lb-ent', function (ctx, g) {
    var l = gekozen('lb-ent', 'tempwoon,buiten,verbruik,zon'), i = l.indexOf(g.id);
    if (i >= 0) l.splice(i, 1);
    else {
      if (l.length >= 4) { HV.meld({ icoon: 'info', titel: t('Не більше чотирьох рядів', 'Hoogstens vier reeksen'), tekst: t('Зніміть один ряд, щоб додати інший — так графік лишається читабельним.', 'Haal een reeks weg om een andere toe te voegen — zo blijft de grafiek leesbaar.') }); return; }
      l.push(g.id);
    }
    HV.ui.zet('lb-ent', l.join(',') || ',');
  });
  HV.actie('lb-baan', function (ctx, g) {
    var l = gekozen('lb-banen', 'stand,aanwezig,licht,verwarming,deur'), i = l.indexOf(g.id);
    if (i >= 0) l.splice(i, 1); else l.push(g.id);
    HV.ui.zet('lb-banen', l.join(',') || ',');
  });
  HV.actie('lb-terug-nu', function () { HV.ui.zet('lb-terug', 0); });
  HV.actie('lb-moment-nu', function () { HV.ui.zet('lb-moment', 0); });
  /** Повзунок часу: під час руху — лише підпис моменту (без перерисовки); на «klaar» — новий стан. */
  function tijdSchuif(naam, g, el, tekst) {
    var v = Number(g.waarde);
    var wortel = el && el.closest ? el.closest('.hv-lb-gs') : null;
    if (wortel) {
      var lbl = wortel.querySelectorAll('[data-lb-momenttekst]');
      for (var i = 0; i < lbl.length; i++) lbl[i].textContent = tekst(v);
    }
    if (el && el.setAttribute) el.setAttribute('aria-valuetext', tekst(v));
    if (g.fase === 'klaar') HV.ui.zet(naam, v);
  }
  HV.actie('lb-terug-schuif', function (ctx, g, el) {
    tijdSchuif('lb-terug', g, el, function (v) { var tm = HV.staat.w.tijd + v * MIN; return v ? HV.datum(tm) + ' · ' + HV.tijd(tm) : t('Зараз · ', 'Nu · ') + HV.tijd(tm); });
  });
  HV.actie('lb-moment-schuif', function (ctx, g, el) {
    var per = PERIODEN[HV.ui.lees('lb-periode', 'u24')] || PERIODEN.u24;
    tijdSchuif('lb-moment', g, el, function (v) { return momentTekst(HV.staat.w.tijd + v * MIN, per); });
    // живий курсор під час руху: положення ліній без перерисовки
    var w = HV.staat.w, wortel = el && el.closest ? el.closest('.hv-lb-as') : null;
    if (!wortel || g.fase === 'klaar') return;
    var van = w.tijd - per.ms, tot = Number(el.getAttribute('aria-valuemax')) * MIN + w.tijd;
    var pct = ((w.tijd + Number(g.waarde) * MIN) - van) / (tot - van) * 100;
    Array.prototype.forEach.call(wortel.querySelectorAll('.hv-lb-cursor'), function (c) {
      if (c.classList.contains('hv-lb-cursor--banen')) c.style.setProperty('--x', (pct / 100).toFixed(4)); else c.style.left = pct.toFixed(2) + '%';
    });
  });
  HV.actie('lb-export-reeksen', function () {
    var w = HV.staat.w, X = L(w);
    if (!volwassen()) { weigerRol(t('Чому ні: історія містить присутність людей — експортує власник або мешканець.', 'Waarom niet: de geschiedenis bevat aanwezigheid — exporteren doet de eigenaar of een bewoner.')); return; }
    var perId = HV.ui.lees('lb-periode', 'u24'), per = PERIODEN[perId] || PERIODEN.u24;
    var ents = gekozen('lb-ent', 'tempwoon,buiten,verbruik,zon').filter(function (x) { return ENT[x]; });
    if (!ents.length) return;
    var regels = [[t('час дому', 'huistijd')].concat(ents.map(function (id) { return P(ENT[id].naam) + ' (' + eenheidTekst(ENT[id].eenheid) + ')'; })).map(csvVeld).join(';')];
    var n = 0;
    for (var tm = w.tijd - per.ms; tm <= w.tijd; tm += per.stap) {
      var d = new Date(tm);
      regels.push([d.toISOString().slice(0, 16).replace('T', ' ')].concat(ents.map(function (id) { return HV.getal(waardeOp(id, tm, w, X, per.stap), ENT[id].dec); })).map(csvVeld).join(';'));
      n++;
    }
    var naam = 'geschiedenis-' + perId + '-' + new Date(w.tijd).toISOString().slice(0, 10) + '.csv';
    var ok = bewaarBestand(naam, regels.join('\n'));
    var e = HV.logboek.voegToe({ maker: HV.mens(), wat: ['Експорт історії: рядів ' + ents.length + ', ' + per.naam[0], 'Geschiedenis geëxporteerd: ' + ents.length + (ents.length === 1 ? ' reeks' : ' reeksen') + ', ' + per.naam[1]], waarom: ['CSV, рядків: ' + n, 'CSV, regels: ' + n], soort: 'huis.systeem' });
    e.dienst = 'systeem';
    HV.meld({ maker: HV.mens(), icoon: 'file-down', titel: ok ? t('Файл підготовлено', 'Bestand klaargezet') : t('Файл не вдалося зберегти', 'Bestand kon niet worden bewaard'), tekst: naam + ' · ' + n + ' ' + HV.meervoud(n, ['рядок', 'рядки', 'рядків'], ['regel', 'regels']), hoe: t('Як повернути: у домі нічого не змінено; файл видаліть самі.', 'Terugdraaien: in huis is niets veranderd; verwijder het bestand zelf.') });
  });
  HV.actie('lb-export-audit', function () {
    var w = HV.staat.w;
    if (!volwassen()) { weigerRol(t('Чому ні: аудит містить імена й дії — експортує власник або мешканець.', 'Waarom niet: het controlespoor bevat namen en acties — exporteren doet de eigenaar of een bewoner.')); return; }
    var m = HV.ui.lees('lb-tabel-maker', 'alle'), d = HV.ui.lees('lb-dienst', 'alle');
    var lijst = w.logboek.filter(function (r) { return makerFilterPast(r, m) && (d === 'alle' || dienstVan(r) === d); });
    var regels = [[t('час дому', 'huistijd'), t('автор', 'maker'), t('вид автора', 'soort maker'), t('що', 'wat'), t('чому', 'waarom'), t('було', 'was'), t('стало', 'werd'), t('дозвіл', 'toestemming'), t('служба', 'dienst'), t('важливість', 'gewicht'), t('запис', 'regel')].map(csvVeld).join(';')];
    lijst.forEach(function (r) {
      regels.push([new Date(r.tijd).toISOString().slice(0, 16).replace('T', ' '), r.maker ? P(r.maker.naam) : '', r.maker ? r.maker.soort : '', P(r.wat), r.waarom ? P(r.waarom) : '', r.was ? P(r.was) : '', r.werd ? P(r.werd) : '', r.toegestaan ? P(r.toegestaan) : '', P(DIENST[dienstVan(r)].naam), P(GEWICHT[r.gewicht] || GEWICHT.info), r.id].map(csvVeld).join(';'));
    });
    var naam = 'logboek-controlespoor-' + new Date(w.tijd).toISOString().slice(0, 10) + '.csv';
    var ok = bewaarBestand(naam, regels.join('\n'));
    var e = HV.logboek.voegToe({ maker: HV.mens(), wat: ['Експорт аудиту Журналу: ' + lijst.length + ' записів', 'Controlespoor van het logboek geëxporteerd: ' + lijst.length + ' regels'], waarom: ['CSV за поточним фільтром', 'CSV volgens het huidige filter'], soort: 'huis.systeem' });
    e.dienst = 'systeem';
    HV.meld({ maker: HV.mens(), icoon: 'file-down', titel: ok ? t('Файл підготовлено', 'Bestand klaargezet') : t('Файл не вдалося зберегти', 'Bestand kon niet worden bewaard'), tekst: naam, hoe: t('Як повернути: Журнал не змінено; файл видаліть самі.', 'Terugdraaien: het logboek is niet veranderd; verwijder het bestand zelf.') });
  });
  HV.actie('lb-corr-stap', function (ctx, g) {
    var stap = Number(g.stap) || 0.1;
    var v = Number(HV.ui.lees('lb-corr-waarde', g.basis));
    HV.ui.zet('lb-corr-waarde', Math.round((v + Number(g.richting) * stap) * 100) / 100);
  });
  HV.actie('lb-corr-reden', function (ctx, g) { HV.ui.zet('lb-corr-reden', g.waarde); });
  HV.actie('lb-corr-opslaan', function (ctx, g) {
    var E = ENT[g.entiteit]; if (!E) return;
    var tijd = Number(g.tijd), waarde = Number(g.waarde), was = Number(g.was);
    var reden = { zon: ['сонце на датчику', 'zon op de sensor'], storing: ['збій датчика', 'storing van de sensor'], kalibratie: ['ручне калібрування', 'handmatige kalibratie'] }[g.reden] || ['виправлення', 'correctie'];
    var eh = eenheidTekst(E.eenheid);
    var ok = wijzig({
      wat: [E.naam[0] + ': виправлено значення о ' + HV.tijd(tijd), E.naam[1] + ': waarde gecorrigeerd om ' + HV.tijd(tijd)], was: [HV.maatTekst(was, eh, E.dec), HV.maatTekst(was, eh, E.dec)], werd: [HV.maatTekst(waarde, eh, E.dec), HV.maatTekst(waarde, eh, E.dec)], waarom: reden,
      icoon: 'pencil-line', doel: E.bron || null, rolTekst: t('Чому ні: значення історії виправляє власник або мешканець.', 'Waarom niet: waarden in de geschiedenis corrigeert de eigenaar of een bewoner.'),
      pas: function (X) { X.correcties = X.correcties.filter(function (c) { return !(c.entiteit === g.entiteit && Math.abs(c.tijd - tijd) < MIN); }); X.correcties.push({ entiteit: g.entiteit, tijd: tijd, waarde: waarde, was: was, reden: g.reden }); }
    });
    if (ok) { HV.ui.zet('lb-corr-waarde', null); HV.bladOpen(null); }
  });

  // ── Обслуговування ──
  function od(id) { var r = ONDERHOUD.filter(function (x) { return x[0] === id; })[0]; return r ? { id: r[0], soort: r[1], doel: r[2], naam: [r[4], r[5]], interval: r[6], ex: r[8] } : null; }
  function odLog(e) { e.onderhoud = true; return e; }
  HV.actie('lb-gedaan', function (ctx, g) {
    var it = od(g.id); if (!it) return;
    var w = HV.staat.w, X = L(w), oud = X.onderhoud[g.id].laatst;
    var r = wijzig({ wat: [it.naam[0] + ': зроблено', it.naam[1] + ': gedaan'], was: ['востаннє ' + HV.datumKort(oud), 'laatst ' + HV.datumKort(oud)], werd: ['наступний строк через ' + it.interval + ' днів', 'volgende termijn over ' + it.interval + ' dagen'], icoon: 'wrench', doel: it.doel, dienst: 'apparaten',
      pas: function (Y, x) { var s = Y.onderhoud[g.id]; s.laatst = x.tijd; s.uitgesteld = null; s.gepland = null; } });
    if (r) odLog(r);
  });
  HV.actie('lb-later', function (ctx, g) {
    var it = od(g.id); if (!it) return;
    var w = HV.staat.w, tot = w.tijd + 7 * DAG;
    var r = wijzig({ wat: [it.naam[0] + ': відкладено на тиждень', it.naam[1] + ': een week uitgesteld'], werd: ['до ' + HV.datumKort(tot), 'tot ' + HV.datumKort(tot)], was: ['строк зараз', 'termijn nu'], icoon: 'alarm-clock', doel: it.doel, dienst: 'apparaten',
      pas: function (Y) { Y.onderhoud[g.id].uitgesteld = tot; } });
    if (r) odLog(r);
  });
  HV.actie('lb-service', function (ctx, g) {
    var it = od(g.id); if (!it) return;
    var w = HV.staat.w, op = Math.floor((w.tijd + 8 * DAG) / DAG) * DAG + 9 * UUR;
    var r = wijzig({ wat: [it.naam[0] + ': записано на сервіс', it.naam[1] + ': service gepland'], werd: [HV.datumKort(op) + ' о 09:00 · ' + it.ex.bedrijf[0], HV.datumKort(op) + ' om 09:00 · ' + it.ex.bedrijf[1]], icoon: 'calendar-plus', doel: it.doel, dienst: 'apparaten',
      pas: function (Y) { Y.onderhoud[g.id].gepland = op; } });
    if (r) odLog(r);
  });
  HV.actie('lb-batterij', function (ctx, g) {
    var w = HV.staat.w, X = L(w), a = w.apparaten[g.id]; if (!a) return;
    var was = g.id === 'batterijraam' ? a.st.waarde : g.id in X.batterijen ? X.batterijen[g.id] : a.batterij;
    var r = wijzig({ wat: [a.naam[0] + ': батарейку замінено', a.naam[1] + ': batterij vervangen'], was: [Math.round(was) + ' %', Math.round(was) + ' %'], werd: ['100 %', '100 %'], icoon: 'battery-full', doel: g.id, dienst: 'apparaten',
      pas: function (Y, x) { var b = x.apparaten[g.id]; if (g.id === 'batterijraam') b.st.waarde = 100; else if (g.id in Y.batterijen) Y.batterijen[g.id] = 100; else b.batterij = 100; b.gezien = x.tijd; },
      terug: function (Y, x) { var b = x.apparaten[g.id]; if (g.id === 'batterijraam') b.st.waarde = was; else if (!(g.id in Y.batterijen)) b.batterij = was; } });
    if (r) odLog(r);
  });

  /** Хід процесу (оновлення, перевірка) у світі; зупиняється, якщо світ замінили. */
  function proces(id, fasen, ms, klaar) {
    var w0 = HV.staat.w, begin = Date.now();
    HV.staat.wijzig(function (x) { L(x).onderhoud[id].bezig = { fase: fasen[0][1], voortgang: 0 }; });
    var klok = setInterval(function () {
      if (HV.staat.w !== w0) { clearInterval(klok); return; }
      var deel = Math.min(1, (Date.now() - begin) / ms);
      var fase = fasen.filter(function (f) { return deel * 100 >= f[0]; }).pop();
      HV.staat.wijzig(function (x) { var s = L(x).onderhoud[id]; if (s.bezig) { s.bezig.voortgang = deel * 100; s.bezig.fase = fase[1]; } });
      if (deel >= 1) { clearInterval(klok); HV.staat.wijzig(function (x) { L(x).onderhoud[id].bezig = null; }); klaar(); }
    }, 200);
  }
  function firmware(id) {
    var it = od(id), w = HV.staat.w, X = L(w), s = X.onderhoud[id];
    if (!it || s.bezig || s.versie === it.ex.naar) return;
    if (w.gegevens === 'geen') { weigerVerbinding(); return; }
    if (!magWijzigen()) { weigerRol(t('Чому ні: прошивку оновлює власник або мешканець.', 'Waarom niet: firmware werkt de eigenaar of een bewoner bij.')); return; }
    var mens = HV.mens();
    var start = function () {
      var e = odLog(HV.logboek.voegToe({ maker: mens, wat: [it.naam[0] + ': оновлення прошивки почалося', it.naam[1] + ': firmware-update gestart'], was: [it.ex.van, it.ex.van], werd: [it.ex.naar, it.ex.naar], soort: 'huis.systeem', doel: it.doel }));
      e.dienst = 'systeem';
      proces(id, [[0, ['завантаження', 'downloaden']], [40, ['встановлення', 'installeren']], [85, ['перезапуск', 'herstarten']]], it.id === 'fw-router' ? 4200 : 3200, function () {
        HV.staat.wijzig(function (x) { var y = L(x).onderhoud[id]; y.vorige = y.versie; y.versie = it.ex.naar; });
        var k = odLog(HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: [it.naam[0] + ': прошивку оновлено', it.naam[1] + ': firmware bijgewerkt'], was: [it.ex.van, it.ex.van], werd: [it.ex.naar, it.ex.naar], soort: 'huis.systeem', doel: it.doel }));
        k.dienst = 'systeem';
        HV.meld({ icoon: 'circle-check', titel: P(it.naam) + ': ' + t('прошивка ', 'firmware ') + it.ex.naar, tekst: P(it.ex.notities), hoe: t('Як повернути: «Відкотити» в Обслуговуванні протягом 30 днів.', 'Terugdraaien: ‘Terugzetten’ bij Onderhoud binnen 30 dagen.') });
      });
    };
    if (it.ex.slaapt) {
      var e = odLog(HV.logboek.voegToe({ maker: mens, wat: [it.naam[0] + ': оновлення чекає на натиск', it.naam[1] + ': update wacht op een druk'], waarom: ['сплячий пристрій', 'slapend apparaat'], soort: 'huis.systeem', doel: it.doel }));
      e.dienst = 'systeem';
      HV.meld({ maker: mens, icoon: 'hand', titel: t('Натисніть кнопку сцен один раз', 'Druk één keer op de scèneknop'), tekst: t('Пристрій прокинеться й завантажить прошивку ', 'Het apparaat wordt wakker en laadt firmware ') + it.ex.naar + '.' });
      setTimeout(function () { if (HV.staat.w === w) start(); }, 1600);
      return;
    }
    if (it.id === 'fw-router') {
      // небезпечна дія: ритуал рейки утримання через HV.doe (перезапуск маршрутизатора з новою прошивкою)
      HV.doe({ doel: 'router', mogelijkheid: 'herstart', waarde: true, waarom: ['оновлення прошивки ' + it.ex.naar, 'firmware-update ' + it.ex.naar] }).then(function (r) { if (r && r.ok) start(); });
      return;
    }
    if (it.ex.niveau === 'kritiek' && HV.schil && HV.schil.gevaar) {
      HV.schil.gevaar({ actie: { sleutel: 'onderhoud.firmware.slot', niveau: 'kritiek', naam: ['Оновити прошивку замка', 'Firmware van het slot bijwerken'],
        gevolg: ['Що станеться: замок кілька хвилин не прийматиме команд; він лишається замкненим, ключ працює. Пов’язано з: нічна охорона стежить за цими дверима. Як повернути: «Відкотити» протягом 30 днів.', 'Wat er gebeurt: het slot neemt een paar minuten geen opdrachten aan; het blijft vergrendeld, de sleutel werkt. Hangt samen met: het nachtalarm bewaakt deze deur. Terugdraaien: ‘Terugzetten’ binnen 30 dagen.'] },
        naam: P(it.naam), apparaat: w.apparaten[it.doel] || null, waarde: it.ex.naar }).then(function (ja) { if (ja) start(); });
      return;
    }
    start();
  }
  HV.actie('lb-firmware', function (ctx, g) { firmware(g.id); });
  HV.actie('lb-firmware-alle', function () {
    var w = HV.staat.w, X = L(w);
    var lijst = ONDERHOUD.filter(function (r) { return r[1] === 'firmware' && !r[8].niveau && !r[8].slaapt && X.onderhoud[r[0]].versie !== r[8].naar && !X.onderhoud[r[0]].bezig; });
    lijst.forEach(function (r, i) { setTimeout(function () { if (HV.staat.w === w) firmware(r[0]); }, i * 500); });
  });
  HV.actie('lb-firmware-terug', function (ctx, g) {
    var it = od(g.id), X = L(); if (!it || !X.onderhoud[g.id].vorige) return;
    var vorige = X.onderhoud[g.id].vorige, nu = X.onderhoud[g.id].versie;
    var r = wijzig({ wat: [it.naam[0] + ': прошивку відкочено', it.naam[1] + ': firmware teruggezet'], was: [nu, nu], werd: [vorige, vorige], icoon: 'undo-2', doel: it.doel,
      pas: function (Y) { var s = Y.onderhoud[g.id]; s.versie = vorige; s.vorige = null; } });
    if (r) odLog(r);
  });
  HV.actie('lb-test-melder', function (ctx, g) {
    var it = od(g.id), w = HV.staat.w, X = L(w); if (!it || X.onderhoud[g.id].bezig) return;
    if (w.gegevens === 'geen') { weigerVerbinding(); return; }
    if (!magWijzigen()) { weigerRol(t('Чому ні: перевірку датчика запускає власник або мешканець.', 'Waarom niet: een sensortest start de eigenaar of een bewoner.')); return; }
    var mens = HV.mens(), a = w.apparaten[it.doel];
    var e = odLog(HV.logboek.voegToe({ maker: mens, wat: [it.naam[0] + ': перевірку почато', it.naam[1] + ': test gestart'], waarom: ['планова перевірка; аварійний шар не відкривається', 'geplande test; de noodlaag gaat niet open'], soort: 'huis.alarm', doel: it.doel }));
    e.dienst = 'veiligheid';
    HV.meld({ maker: mens, gewicht: 'belangrijk', icoon: 'siren', titel: P(it.naam) + ': ' + t('перевірка', 'test'), tekst: t('Сирена звучить 3 с — це перевірка, не тривога.', 'De sirene klinkt 3 s — dit is een test, geen alarm.') });
    proces(g.id, [[0, ['сирена звучить', 'sirene klinkt']], [55, ['перевірка зв’язку', 'verbinding controleren']], [85, ['батарейка', 'batterij']]], 3400, function () {
      var bat = X.batterijen[it.doel] != null ? X.batterijen[it.doel] : 90;
      var uitslag = ['сирена так · зв’язок 100 % · батарейка ' + Math.round(bat) + ' %', 'sirene ja · verbinding 100 % · batterij ' + Math.round(bat) + ' %'];
      HV.staat.wijzig(function (x) { var s = L(x).onderhoud[g.id]; s.laatst = x.tijd; s.uitgesteld = null; s.uitslag = uitslag; if (a) a.gezien = x.tijd; });
      var k = odLog(HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: [it.naam[0] + ': перевірку пройдено', it.naam[1] + ': test geslaagd'], werd: uitslag, soort: 'huis.alarm', doel: it.doel }));
      k.dienst = 'veiligheid';
      HV.meld({ icoon: 'circle-check', titel: P(it.naam) + ': ' + t('перевірку пройдено', 'test geslaagd'), tekst: P(uitslag) });
    });
  });

  // ── Правила ──
  HV.actie('lb-regel-vanaf', function (ctx, g) {
    var X = L(), d = DIENST[g.dienst], oud = X.regels[g.dienst].vanaf;
    if (oud === g.waarde) return;
    if (d.beschermd && (g.waarde === 'alarm' || g.waarde === 'nooit')) {
      HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не змінено: служба захищена', 'Niet gewijzigd: beschermde dienst'), tekst: t('Чому ні: тривоги й запити не опускаються нижче звичайної доставки. Що можна натомість: тихі години або менше каналів.', 'Waarom niet: alarmen en verzoeken gaan niet onder gewone bezorging. Wat wel kan: stille uren of minder kanalen.') });
      return;
    }
    wijzig({ wat: ['Сповіщення «' + d.naam[0] + '»: на телефон', 'Meldingen ‘' + d.naam[1] + '’: naar de telefoon'], was: VANAF[oud], werd: VANAF[g.waarde], icoon: d.icoon, pas: function (Y) { Y.regels[g.dienst].vanaf = g.waarde; } });
  });
  HV.actie('lb-regel-kanaal', function (ctx, g) {
    var X = L(), d = DIENST[g.dienst], k = KANALEN.filter(function (c) { return c.id === g.kanaal; })[0], aan = !!X.regels[g.dienst][g.kanaal];
    wijzig({ wat: ['Сповіщення «' + d.naam[0] + '»: канал «' + k.naam[0] + '»', 'Meldingen ‘' + d.naam[1] + '’: kanaal ‘' + k.naam[1] + '’'], was: aan ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: aan ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'], icoon: k.icoon, pas: function (Y) { Y.regels[g.dienst][g.kanaal] = !aan; } });
  });
  HV.actie('lb-regel-wie', function (ctx, g) {
    var X = L(), d = DIENST[g.dienst], oud = X.regels[g.dienst].wie;
    if (oud === g.waarde) return;
    wijzig({ wat: ['Сповіщення «' + d.naam[0] + '»: кому', 'Meldingen ‘' + d.naam[1] + '’: naar wie'], was: WIE[oud], werd: WIE[g.waarde], icoon: 'users', pas: function (Y) { Y.regels[g.dienst].wie = g.waarde; } });
  });
  HV.actie('lb-stil-aan', function () {
    var aan = L().stil.aan;
    wijzig({ wat: ['Тихі години', 'Stille uren'], was: aan ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: aan ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'], icoon: 'moon', pas: function (Y) { Y.stil.aan = !aan; } });
  });
  HV.actie('lb-stil-tijd', function (ctx, g) {
    var X = L(), oud = X.stil[g.veld], nieuw = (oud + Number(g.richting) * 0.5 + 24) % 24;
    wijzig({ wat: [g.veld === 'van' ? 'Тихі години: початок' : 'Тихі години: кінець', g.veld === 'van' ? 'Stille uren: begin' : 'Stille uren: einde'], was: [uurTekst(oud), uurTekst(oud)], werd: [uurTekst(nieuw), uurTekst(nieuw)], icoon: 'moon', pas: function (Y) { Y.stil[g.veld] = nieuw; } });
  });
  HV.actie('lb-stil-dagen', function (ctx, g) {
    var X = L(), oud = X.stil.dagen; if (oud === g.waarde) return;
    var N = { elke: ['щодня', 'elke dag'], werk: ['будні', 'werkdagen'], weekend: ['вихідні', 'weekend'] };
    wijzig({ wat: ['Тихі години: дні', 'Stille uren: dagen'], was: N[oud], werd: N[g.waarde], icoon: 'moon', pas: function (Y) { Y.stil.dagen = g.waarde; } });
  });
  HV.actie('lb-stil-door', function (ctx, g) {
    var X = L(), aan = !!X.stil[g.soort];
    var N = g.soort === 'verzoek' ? ['запити на схвалення', 'verzoeken om goedkeuring'] : ['важливе', 'belangrijk'];
    wijzig({ wat: ['Тихі години: ' + N[0] + ' крізь тишу', 'Stille uren: ' + N[1] + ' door de stilte'], was: aan ? ['так', 'ja'] : ['ні', 'nee'], werd: aan ? ['ні', 'nee'] : ['так', 'ja'], icoon: 'moon', pas: function (Y) { Y.stil[g.soort] = !aan; } });
  });
  HV.actie('lb-esc-aan', function () {
    var aan = L().escalatie.aan;
    wijzig({ wat: ['Ескалація тривог і запитів', 'Escalatie van alarmen en verzoeken'], was: aan ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: aan ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'], icoon: 'siren', pas: function (Y) { Y.escalatie.aan = !aan; } });
  });
  HV.actie('lb-esc-na', function (ctx, g) {
    var X = L(), i = Number(g.i), st = X.escalatie.stappen;
    var min = st[i - 1] ? st[i - 1].na + 1 : 0, max = st[i + 1] ? st[i + 1].na - 1 : 60;
    var oud = st[i].na, nieuw = klem(oud + Number(g.richting), min, max);
    if (nieuw === oud) { HV.meld({ icoon: 'info', titel: t('Крок не зсунуто', 'Stap niet verschoven'), tekst: t('Кроки йдуть по черзі: кожен — хоча б на 1 хв пізніше за попередній.', 'Stappen volgen elkaar op: elke stap minstens 1 min na de vorige.') }); return; }
    wijzig({ wat: ['Ескалація: крок ' + (i + 1), 'Escalatie: stap ' + (i + 1)], was: ['через ' + oud + ' хв', 'na ' + oud + ' min'], werd: ['через ' + nieuw + ' хв', 'na ' + nieuw + ' min'], icoon: 'siren', pas: function (Y) { Y.escalatie.stappen[i].na = nieuw; } });
  });
  HV.actie('lb-esc-plus', function () {
    var X = L(), st = X.escalatie.stappen, laatste = st[st.length - 1];
    if (st.length >= 4) return;
    var nieuw = { na: laatste.na + 5, wie: 'iedereen' };
    wijzig({ wat: ['Ескалація: додано крок ' + (st.length + 1), 'Escalatie: stap ' + (st.length + 1) + ' toegevoegd'], werd: ['через ' + nieuw.na + ' хв — ' + WIE.iedereen[0], 'na ' + nieuw.na + ' min — ' + WIE.iedereen[1]], icoon: 'siren', pas: function (Y) { Y.escalatie.stappen.push(nieuw); } });
  });
  HV.actie('lb-esc-weg', function (ctx, g) {
    var X = L(), i = Number(g.i), st = X.escalatie.stappen[i];
    if (!st || i === 0) return;
    wijzig({ wat: ['Ескалація: прибрано крок ' + (i + 1), 'Escalatie: stap ' + (i + 1) + ' weggehaald'], was: ['через ' + st.na + ' хв — ' + WIE[st.wie][0], 'na ' + st.na + ' min — ' + WIE[st.wie][1]], icoon: 'siren', pas: function (Y) { Y.escalatie.stappen.splice(i, 1); } });
  });
  HV.actie('lb-taal', function (ctx, g) {
    var X = L(), oud = X.taal[g.mens] || 'uk'; if (oud === g.waarde) return;
    var m = HV.staat.w.mensen.filter(function (x) { return x.id === g.mens; })[0];
    var N = { uk: ['українська', 'Oekraïens'], nl: ['нідерландська', 'Nederlands'] };
    wijzig({ wat: ['Мова сповіщень для ' + m.naam[0], 'Taal van de meldingen voor ' + m.naam[1]], was: N[oud], werd: N[g.waarde], icoon: 'languages', pas: function (Y) { Y.taal[g.mens] = g.waarde; } });
  });
  HV.actie('lb-simbuiten', function () {
    var aan = L().simBuiten;
    wijzig({ wat: ['Симуляцію — в зовнішні канали', 'Simulatie ook naar buiten'], was: aan ? ['так', 'ja'] : ['ні', 'nee'], werd: aan ? ['ні', 'nee'] : ['так', 'ja'], icoon: 'flask-conical', gewicht: aan ? 'info' : 'belangrijk', pas: function (Y) { Y.simBuiten = !aan; } });
  });
  HV.actie('lb-test', function () {
    var w = HV.staat.w, X = L(w);
    if (X.test && X.test.bezig) return;
    if (w.gegevens === 'geen') { weigerVerbinding(); return; }
    var mens = HV.mens(), stil = isStil(X, w.tijd);
    var kanalen = [{ id: 'app', stand: 'wacht', na: 400, uit: 'bezorgd' }, { id: 'push', stand: 'wacht', na: 1100, uit: stil ? 'stil' : 'bezorgd' },
      { id: 'scherm', stand: 'wacht', na: 1500, uit: 'bezorgd', reden: ['3 екрани: кухня, передпокій, вітальня', '3 schermen: keuken, hal, woonkamer'] },
      { id: 'mail', stand: 'wacht', na: 3600, uit: 'traag', reden: ['поштовий сервер відповів за 3,4 с', 'de mailserver antwoordde na 3,4 s'] }];
    HV.staat.wijzig(function (x) { L(x).test = { tijd: x.tijd, bezig: true, kanalen: kanalen.map(function (k) { return { id: k.id, stand: 'wacht' }; }) }; });
    var e = HV.logboek.voegToe({ maker: mens, wat: ['Перевірку доставки надіслано', 'Bezorgtest verstuurd'], waarom: ['канали: застосунок, телефон, екрани, пошта', 'kanalen: app, telefoon, schermen, e-mail'], soort: 'huis.systeem' });
    e.dienst = 'systeem';
    kanalen.forEach(function (k, i) {
      setTimeout(function () {
        if (HV.staat.w !== w) return;
        HV.staat.wijzig(function (x) { var T = L(x).test; if (!T) return; T.kanalen[i].stand = k.uit; T.kanalen[i].reden = k.uit === 'stil' ? ['тихі години: доставлено без звуку', 'stille uren: zonder geluid bezorgd'] : k.reden || null; if (i === kanalen.length - 1) T.bezig = false; });
        if (i === kanalen.length - 1) {
          var k2 = HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: ['Перевірка доставки: 4 із 4 каналів', 'Bezorgtest: 4 van 4 kanalen'], waarom: ['пошта — із запізненням 3,4 с', 'e-mail — met 3,4 s vertraging'], soort: 'huis.systeem' });
          k2.dienst = 'systeem';
          HV.meld({ icoon: 'send', titel: t('Перевірку доставлено', 'Test bezorgd'), tekst: t('4 із 4 каналів; пошта — із запізненням.', '4 van 4 kanalen; e-mail met vertraging.') });
        }
      }, k.na);
    });
  });
})(window.HV = window.HV || {});
