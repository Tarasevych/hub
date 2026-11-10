// Paspoort van het demohuis «Wilgenlaan 12», Utrecht — джерело для всіх екранів макета.
// 10 кімнат на трьох поверхах + сад і гараж; близько 70 пристроїв так, щоб кожен тип із §3.5 плану мав екземпляр.
// Еталонний момент — понеділок 9 листопада 2026, 14:30 (час дому). Усі моделі й імена вигадані.
(function (HV) {
  'use strict';

  var EPOCH = HV.huistijd(2026, 11, 9, 14, 30);

  var verdiepingen = [
    { id: 'zolder', niveau: 2, naam: ['Горище', 'Zolder'] },
    { id: 'boven', niveau: 1, naam: ['Другий поверх', '1e verdieping'] },
    { id: 'beneden', niveau: 0, naam: ['Перший поверх', 'Begane grond'] },
    { id: 'buiten', niveau: -1, naam: ['Надворі', 'Buiten'] }
  ];

  // waar — готова форма «де» для речень (щоб не відмінювати назву програмно).
  var kamers = [
    { id: 'woonkamer', verdieping: 'beneden', icoon: 'sofa', naam: ['Вітальня', 'Woonkamer'], waar: ['у вітальні', 'in de woonkamer'], doel: 21 },
    { id: 'keuken', verdieping: 'beneden', icoon: 'cooking-pot', naam: ['Кухня', 'Keuken'], waar: ['на кухні', 'in de keuken'] },
    { id: 'hal', verdieping: 'beneden', icoon: 'door-closed', naam: ['Передпокій', 'Hal'], waar: ['у передпокої', 'in de hal'] },
    { id: 'bijkeuken', verdieping: 'beneden', icoon: 'washing-machine', naam: ['Підсобка', 'Bijkeuken'], waar: ['у підсобці', 'in de bijkeuken'] },
    { id: 'slaapkamer', verdieping: 'boven', icoon: 'bed', naam: ['Спальня', 'Slaapkamer'], waar: ['у спальні', 'in de slaapkamer'], doel: 18 },
    { id: 'kinderkamer', verdieping: 'boven', icoon: 'baby', naam: ['Дитяча', 'Kinderkamer'], waar: ['у дитячій', 'in de kinderkamer'], doel: 20 },
    { id: 'badkamer', verdieping: 'boven', icoon: 'bath', naam: ['Ванна', 'Badkamer'], waar: ['у ванній', 'in de badkamer'], doel: 22 },
    { id: 'werkkamer', verdieping: 'boven', icoon: 'briefcase', naam: ['Кабінет', 'Werkkamer'], waar: ['у кабінеті', 'in de werkkamer'], doel: 20 },
    { id: 'zolder', verdieping: 'zolder', icoon: 'hard-drive', naam: ['Горище', 'Zolder'], waar: ['на горищі', 'op zolder'] },
    { id: 'logeerkamer', verdieping: 'zolder', icoon: 'luggage', naam: ['Гостьова', 'Logeerkamer'], waar: ['у гостьовій', 'in de logeerkamer'] },
    { id: 'tuin', verdieping: 'buiten', icoon: 'trees', naam: ['Сад', 'Tuin'], waar: ['у саду', 'in de tuin'] },
    { id: 'garage', verdieping: 'buiten', icoon: 'warehouse', naam: ['Гараж', 'Garage'], waar: ['у гаражі', 'in de garage'] }
  ];

  // Клас пристрою → іконка й тон (maten.gedrag.klasseToon у hv-tokens.json).
  var soorten = {
    licht: { icoon: 'lightbulb', toon: 'aan', naam: ['Світло', 'Lamp'] },
    lichtgroep: { icoon: 'lamp-ceiling', toon: 'aan', naam: ['Група світла', 'Lampgroep'] },
    stopcontact: { icoon: 'plug', toon: 'aan', naam: ['Розетка', 'Stekker'] },
    gordijn: { icoon: 'blinds', toon: 'neutraal', naam: ['Штори', 'Gordijnen'] },
    jaloezie: { icoon: 'blinds', toon: 'neutraal', naam: ['Жалюзі', 'Jaloezieën'] },
    garagedeur: { icoon: 'warehouse', toon: 'neutraal', naam: ['Гаражні ворота', 'Garagedeur'] },
    poort: { icoon: 'fence', toon: 'neutraal', naam: ['Вхідні ворота', 'Toegangspoort'] },
    thermostaat: { icoon: 'thermometer', toon: 'warm', naam: ['Термостат', 'Thermostaat'] },
    airco: { icoon: 'snowflake', toon: 'koud', naam: ['Кондиціонер', 'Airco'] },
    warmtepomp: { icoon: 'heater', toon: 'warm', naam: ['Тепловий насос', 'Warmtepomp'] },
    vloerverwarming: { icoon: 'waves', toon: 'warm', naam: ['Тепла підлога', 'Vloerverwarming'] },
    radiatorkraan: { icoon: 'heater', toon: 'warm', naam: ['Радіаторний клапан', 'Radiatorkraan'] },
    ventilatie: { icoon: 'fan', toon: 'neutraal', naam: ['Вентиляція', 'Ventilatie'] },
    bevochtiger: { icoon: 'droplets', toon: 'neutraal', naam: ['Зволожувач', 'Luchtbevochtiger'] },
    luchtreiniger: { icoon: 'wind', toon: 'neutraal', naam: ['Очищувач повітря', 'Luchtreiniger'] },
    boiler: { icoon: 'droplet', toon: 'warm', naam: ['Бойлер', 'Boiler'] },
    tv: { icoon: 'tv', toon: 'aan', naam: ['Телевізор', 'Televisie'] },
    speaker: { icoon: 'speaker', toon: 'aan', naam: ['Колонка', 'Speaker'] },
    speakergroep: { icoon: 'speaker', toon: 'aan', naam: ['Група колонок', 'Speakergroep'] },
    stofzuiger: { icoon: 'bot', toon: 'aan', naam: ['Пилосос', 'Robotstofzuiger'] },
    maaier: { icoon: 'bot', toon: 'aan', naam: ['Косарка', 'Robotmaaier'] },
    beregening: { icoon: 'sprout', toon: 'neutraal', naam: ['Полив', 'Beregening'] },
    temperatuur: { icoon: 'thermometer', sensor: true, naam: ['Датчик температури', 'Temperatuursensor'] },
    vocht: { icoon: 'droplets', sensor: true, naam: ['Датчик вологості', 'Vochtsensor'] },
    co2: { icoon: 'cloud', sensor: true, naam: ['Датчик CO₂', 'CO₂-sensor'] },
    beweging: { icoon: 'radar', sensor: true, naam: ['Датчик руху', 'Bewegingssensor'] },
    aanwezigheid: { icoon: 'person-standing', sensor: true, naam: ['Датчик присутності', 'Aanwezigheidssensor'] },
    contact: { icoon: 'door-closed', sensor: true, naam: ['Датчик відкриття', 'Contactsensor'] },
    lek: { icoon: 'droplet', sensor: true, kritiek: true, naam: ['Датчик протікання', 'Lekkagesensor'] },
    rook: { icoon: 'alarm-smoke', sensor: true, kritiek: true, naam: ['Датчик диму', 'Rookmelder'] },
    co: { icoon: 'alarm-smoke', sensor: true, kritiek: true, naam: ['Датчик чадного газу', 'Koolmonoxidemelder'] },
    lichtsterkte: { icoon: 'sun-dim', sensor: true, naam: ['Датчик освітленості', 'Lichtsensor'] },
    batterij: { icoon: 'battery-low', sensor: true, naam: ['Батарейка', 'Batterij'] },
    wasmachine: { icoon: 'washing-machine', toon: 'aan', naam: ['Пральна машина', 'Wasmachine'] },
    droger: { icoon: 'wind', toon: 'aan', naam: ['Сушильна машина', 'Droger'] },
    vaatwasser: { icoon: 'utensils', toon: 'aan', naam: ['Посудомийна машина', 'Vaatwasser'] },
    oven: { icoon: 'microwave', toon: 'warm', naam: ['Духовка', 'Oven'] },
    koelkast: { icoon: 'refrigerator', toon: 'koud', naam: ['Холодильник', 'Koelkast'] },
    koffie: { icoon: 'coffee', toon: 'aan', naam: ['Кавоварка', 'Koffiemachine'] },
    computer: { icoon: 'monitor', toon: 'aan', naam: ['Комп’ютер', 'Computer'] },
    nas: { icoon: 'hard-drive', toon: 'aan', naam: ['Мережеве сховище', 'Netwerkopslag'] },
    printer: { icoon: 'printer', toon: 'aan', naam: ['Принтер', 'Printer'] },
    router: { icoon: 'router', toon: 'aan', naam: ['Маршрутизатор', 'Router'] },
    irzender: { icoon: 'radio-tower', toon: 'neutraal', naam: ['ІЧ-пульт', 'IR-zender'] },
    sceneknop: { icoon: 'circle-dot', sensor: true, naam: ['Кнопка сцен', 'Scèneknop'] },
    slot: { icoon: 'lock-keyhole', kritiek: true, naam: ['Замок дверей', 'Deurslot'] },
    alarmsysteem: { icoon: 'shield', kritiek: true, naam: ['Сигналізація', 'Alarmsysteem'] },
    camera: { icoon: 'cctv', sensor: true, naam: ['Камера', 'Camera'] },
    deurbel: { icoon: 'bell-ring', sensor: true, naam: ['Дверний дзвінок', 'Deurbel'] },
    p1meter: { icoon: 'gauge', sensor: true, naam: ['Лічильник P1', 'P1-meter'] },
    zonnepanelen: { icoon: 'sun', sensor: true, naam: ['Сонячні панелі', 'Zonnepanelen'] },
    thuisbatterij: { icoon: 'battery', toon: 'batterij', naam: ['Домашня батарея', 'Thuisbatterij'] },
    laadpaal: { icoon: 'plug-zap', toon: 'auto', naam: ['Зарядна станція', 'Laadpaal'] }
  };

  // Компактний запис: [id, soort, kamer, uk, nl, mogelijkheden, toestand, extra]
  var S = 'Симулятор';
  var lijst = [
    // ── світло ──
    ['torsher', 'licht', 'woonkamer', 'Торшер', 'Staande lamp', ['aan', 'helderheid', 'kleurtemp', 'kleur', 'effect'], { aan: true, helderheid: 60, kleurtemp: 2700, tint: 32, verzadiging: 0, effect: 'geen' }, { watt: 9 }],
    ['plafondwoon', 'licht', 'woonkamer', 'Стельова лампа', 'Plafondlamp', ['aan', 'helderheid', 'kleurtemp'], { aan: false, helderheid: 80, kleurtemp: 3000 }, { watt: 14 }],
    ['ledstrip', 'licht', 'woonkamer', 'Стрічка за телевізором', 'Ledstrip achter de tv', ['aan', 'helderheid', 'kleur', 'effect'], { aan: false, helderheid: 40, tint: 265, verzadiging: 70, effect: 'geen' }, { watt: 12 }],
    ['woongroep', 'lichtgroep', 'woonkamer', 'Усе світло вітальні', 'Alle lampen woonkamer', ['aan', 'helderheid'], {}, { leden: ['torsher', 'plafondwoon', 'ledstrip'] }],
    ['keukenlicht', 'licht', 'keuken', 'Лампа над столом', 'Lamp boven de tafel', ['aan', 'helderheid', 'kleurtemp'], { aan: true, helderheid: 75, kleurtemp: 3500 }, { watt: 11 }],
    ['aanrechtlicht', 'licht', 'keuken', 'Підсвітка стільниці', 'Aanrechtverlichting', ['aan', 'helderheid'], { aan: false, helderheid: 100 }, { watt: 8 }],
    ['hallicht', 'licht', 'hal', 'Світло в передпокої', 'Lamp in de hal', ['aan'], { aan: false }, { watt: 7 }],
    ['slaaplicht', 'licht', 'slaapkamer', 'Приліжкова лампа', 'Bedlamp', ['aan', 'helderheid', 'kleurtemp'], { aan: false, helderheid: 30, kleurtemp: 2200 }, { watt: 6 }],
    ['kinderlicht', 'licht', 'kinderkamer', 'Нічник', 'Nachtlampje', ['aan', 'helderheid', 'kleur'], { aan: false, helderheid: 20, tint: 28, verzadiging: 85 }, { watt: 4 }],
    ['badlicht', 'licht', 'badkamer', 'Світло у ванній', 'Badkamerlamp', ['aan', 'helderheid'], { aan: false, helderheid: 100 }, { watt: 10 }],
    ['werklicht', 'licht', 'werkkamer', 'Настільна лампа', 'Bureaulamp', ['aan', 'helderheid', 'kleurtemp'], { aan: true, helderheid: 85, kleurtemp: 4500 }, { watt: 8 }],
    ['zolderlicht', 'licht', 'zolder', 'Світло на горищі', 'Zolderlamp', ['aan'], { aan: true }, { watt: 7, beschikbaar: 'onbereikbaar', gezienGeleden: 1680 }],
    ['tuinlicht', 'licht', 'tuin', 'Світло в саду', 'Tuinverlichting', ['aan', 'helderheid'], { aan: false, helderheid: 60 }, { watt: 18 }],
    // ── розетки ──
    ['stekkermedia', 'stopcontact', 'woonkamer', 'Розетка медіа', 'Stekker media', ['aan', 'vermogen'], { aan: true, vermogen: 46, vandaag: 0.62 }, {}],
    ['stekkerbureau', 'stopcontact', 'werkkamer', 'Розетка стола', 'Stekker bureau', ['aan', 'vermogen'], { aan: true, vermogen: 118, vandaag: 1.14 }, {}],
    // ── штори, ворота ──
    ['gordijnwoon', 'gordijn', 'woonkamer', 'Штори', 'Gordijnen', ['positie'], { positie: 100 }, {}],
    ['jaloezieslaap', 'jaloezie', 'slaapkamer', 'Жалюзі', 'Jaloezieën', ['positie', 'kantel'], { positie: 40, kantel: 30 }, {}],
    ['garagedeur', 'garagedeur', 'garage', 'Гаражні ворота', 'Garagedeur', ['open'], { open: false }, { ingang: true }],
    ['poort', 'poort', 'tuin', 'Вхідні ворота', 'Toegangspoort', ['open'], { open: false }, { ingang: true }],
    // ── клімат ──
    ['thermostaat', 'thermostaat', 'woonkamer', 'Термостат', 'Thermostaat', ['doel', 'modus'], { doel: 21, temperatuur: 20.6, modus: 'verwarmen', verwarmt: true }, {}],
    ['airco', 'airco', 'slaapkamer', 'Кондиціонер', 'Airco', ['aan', 'doel', 'modus', 'ventilator'], { aan: false, doel: 19, modus: 'koelen', ventilator: 'auto' }, { beschikbaar: 'verondersteld' }],
    ['warmtepomp', 'warmtepomp', 'bijkeuken', 'Тепловий насос', 'Warmtepomp', ['modus'], { modus: 'verwarmen', aanvoer: 34.5, retour: 29.8, cop: 4.1, vermogen: 620, verwarmt: true }, {}],
    ['vloerbad', 'vloerverwarming', 'badkamer', 'Тепла підлога', 'Vloerverwarming', ['aan', 'doel'], { aan: true, doel: 22, temperatuur: 21.4, verwarmt: true }, {}],
    ['radiatorkinder', 'radiatorkraan', 'kinderkamer', 'Радіаторний клапан', 'Radiatorkraan', ['doel'], { doel: 20, temperatuur: 19.6, opening: 35 }, { beschikbaar: 'slaapt', gezienGeleden: 540, batterij: 71 }],
    ['ventilatie', 'ventilatie', 'bijkeuken', 'Вентиляція дому', 'Ventilatie', ['stand'], { stand: 2 }, {}],
    ['bevochtiger', 'bevochtiger', 'kinderkamer', 'Зволожувач', 'Luchtbevochtiger', ['aan', 'doel'], { aan: true, doel: 50, vocht: 46, reservoir: 60 }, { watt: 22 }],
    ['luchtreiniger', 'luchtreiniger', 'slaapkamer', 'Очищувач повітря', 'Luchtreiniger', ['aan', 'stand'], { aan: false, stand: 1, fijnstof: 6 }, { watt: 18 }],
    ['boiler', 'boiler', 'bijkeuken', 'Бойлер', 'Boiler', ['aan', 'doel'], { aan: true, doel: 55, temperatuur: 52, verwarmt: false }, {}],
    // ── медіа ──
    ['tv', 'tv', 'woonkamer', 'Телевізор', 'Televisie', ['aan', 'bron', 'volume'], { aan: false, bron: 'hdmi1', volume: 18 }, { watt: 110 }],
    ['speakerkeuken', 'speaker', 'keuken', 'Колонка на кухні', 'Speaker keuken', ['afspelen', 'volume'], { speelt: true, volume: 24, titel: ['Ранкова добірка', 'Ochtendmix'] }, { watt: 6 }],
    ['speakerwoon', 'speaker', 'woonkamer', 'Колонка у вітальні', 'Speaker woonkamer', ['afspelen', 'volume'], { speelt: false, volume: 30 }, { watt: 6 }],
    ['multiroom', 'speakergroep', 'woonkamer', 'Музика внизу', 'Muziek beneden', ['afspelen', 'volume'], { speelt: false, volume: 25 }, { leden: ['speakerkeuken', 'speakerwoon'] }],
    // ── роботи, сад ──
    ['stofzuiger', 'stofzuiger', 'hal', 'Пилосос', 'Robotstofzuiger', ['robot'], { stand: 'dock', lading: 100 }, {}],
    ['maaier', 'maaier', 'tuin', 'Косарка', 'Robotmaaier', ['robot'], { stand: 'dock', lading: 88 }, {}],
    ['beregening', 'beregening', 'tuin', 'Полив саду', 'Beregening', ['aan'], { aan: false, zones: 3, overgeslagen: true }, {}],
    // ── датчики ──
    ['tempwoon', 'temperatuur', 'woonkamer', 'Температура', 'Temperatuur', [], { waarde: 20.6 }, { eenheid: '°C', hoofd: true }],
    ['tempslaap', 'temperatuur', 'slaapkamer', 'Температура', 'Temperatuur', [], { waarde: 18.2 }, { eenheid: '°C', hoofd: true }],
    ['tempkinder', 'temperatuur', 'kinderkamer', 'Температура', 'Temperatuur', [], { waarde: 19.6 }, { eenheid: '°C', hoofd: true }],
    ['tempwerk', 'temperatuur', 'werkkamer', 'Температура', 'Temperatuur', [], { waarde: 20.1 }, { eenheid: '°C', hoofd: true }],
    ['tempkeuken', 'temperatuur', 'keuken', 'Температура', 'Temperatuur', [], { waarde: 20.9 }, { eenheid: '°C', hoofd: true }],
    ['tempzolder', 'temperatuur', 'zolder', 'Температура', 'Temperatuur', [], { waarde: 15.4 }, { eenheid: '°C', hoofd: true, beschikbaar: 'verouderd', gezienGeleden: 4380 }],
    ['vochtbad', 'vocht', 'badkamer', 'Вологість', 'Luchtvochtigheid', [], { waarde: 58 }, { eenheid: '%', hoofd: true }],
    ['co2slaap', 'co2', 'slaapkamer', 'CO₂', 'CO₂', [], { waarde: 640 }, { eenheid: 'ppm' }],
    ['beweginghal', 'beweging', 'hal', 'Рух', 'Beweging', [], { actief: false, laatst: 26 }, {}],
    ['aanwezigwerk', 'aanwezigheid', 'werkkamer', 'Присутність', 'Aanwezigheid', [], { actief: true }, {}],
    ['raamslaap', 'contact', 'slaapkamer', 'Вікно', 'Raam', [], { open: false }, { raam: true }],
    ['raamkinder', 'contact', 'kinderkamer', 'Вікно', 'Raam', [], { open: false }, { raam: true }],
    ['voordeurcontact', 'contact', 'hal', 'Вхідні двері', 'Voordeur', [], { open: false }, { deur: true }],
    ['lekbijkeuken', 'lek', 'bijkeuken', 'Протікання', 'Lekkage', [], { alarm: false }, {}],
    ['rookkeuken', 'rook', 'keuken', 'Дим', 'Rook', [], { alarm: false }, {}],
    ['cobijkeuken', 'co', 'bijkeuken', 'Чадний газ', 'Koolmonoxide', [], { alarm: false, waarde: 0 }, { eenheid: 'ppm' }],
    ['luxwoon', 'lichtsterkte', 'woonkamer', 'Освітленість', 'Lichtsterkte', [], { waarde: 320 }, { eenheid: 'lux' }],
    ['batterijraam', 'batterij', 'kinderkamer', 'Батарейка датчика вікна', 'Batterij raamsensor', [], { waarde: 12 }, { eenheid: '%' }],
    // ── побутова техніка ──
    ['wasmachine', 'wasmachine', 'bijkeuken', 'Пральна машина', 'Wasmachine', ['programma'], { loopt: true, rest: 38, programma: ['Бавовна 40°', 'Katoen 40°'], vermogen: 480 }, {}],
    ['droger', 'droger', 'bijkeuken', 'Сушильна машина', 'Droger', ['programma'], { loopt: false, rest: 0, programma: ['Шафа', 'Kastdroog'], vermogen: 0 }, {}],
    ['vaatwasser', 'vaatwasser', 'keuken', 'Посудомийна машина', 'Vaatwasser', ['programma'], { loopt: false, rest: 0, programma: ['Економний', 'Eco'], vermogen: 0 }, {}],
    ['oven', 'oven', 'keuken', 'Духовка', 'Oven', ['aan', 'doel'], { aan: false, doel: 180, temperatuur: 22 }, {}],
    ['koelkast', 'koelkast', 'keuken', 'Холодильник', 'Koelkast', ['doel'], { doel: 4, temperatuur: 4.2, vriezer: -18.4, deurOpen: false }, {}],
    ['koffie', 'koffie', 'keuken', 'Кавоварка', 'Koffiemachine', ['aan'], { aan: false, water: 70 }, { watt: 1200 }],
    // ── електроніка ──
    ['computer', 'computer', 'werkkamer', 'Комп’ютер', 'Computer', ['aan'], { aan: true, slaap: false }, { watt: 95 }],
    ['nas', 'nas', 'zolder', 'Мережеве сховище', 'Netwerkopslag', ['aan'], { aan: true, vol: 61 }, { watt: 28, kritiekeVoeding: true }],
    ['printer', 'printer', 'werkkamer', 'Принтер', 'Printer', ['aan'], { aan: false, wachtrij: 0 }, { watt: 12 }],
    ['router', 'router', 'hal', 'Маршрутизатор', 'Router', ['herstart'], { aan: true, clients: 23 }, { watt: 11, kritiekeVoeding: true }],
    ['irzender', 'irzender', 'woonkamer', 'ІЧ-пульт', 'IR-zender', ['signaal'], { laatst: ['Кондиціонер: вимкнути', 'Airco: uit'] }, {}],
    ['sceneknop', 'sceneknop', 'hal', 'Кнопка сцен', 'Scèneknop', [], { laatst: ['подвійний натиск', 'dubbel gedrukt'] }, { batterij: 84 }],
    // ── безпека ──
    ['voordeurslot', 'slot', 'hal', 'Замок вхідних дверей', 'Slot voordeur', ['vergrendeld'], { vergrendeld: true }, { ingang: true }],
    ['alarm', 'alarmsysteem', 'hal', 'Охорона', 'Alarm', ['alarmstand'], { stand: 'uit' }, {}],
    ['cameravoor', 'camera', 'tuin', 'Камера біля входу', 'Camera voordeur', [], { beeld: 'voor' }, {}],
    ['cameratuin', 'camera', 'tuin', 'Камера в саду', 'Camera tuin', [], { beeld: 'tuin' }, {}],
    ['cameragarage', 'camera', 'garage', 'Камера в гаражі', 'Camera garage', [], { beeld: 'garage' }, {}],
    ['deurbel', 'deurbel', 'hal', 'Дверний дзвінок', 'Deurbel', [], { laatst: 0 }, {}],
    // ── енергія ──
    ['p1meter', 'p1meter', 'hal', 'Лічильник P1', 'P1-meter', [], { fasen: [0.4, 0.3, 0.2] }, { eenheid: 'kW' }],
    ['zonnepanelen', 'zonnepanelen', 'zolder', 'Сонячні панелі', 'Zonnepanelen', [], { vermogen: 0 }, { piek: 4.2 }],
    ['thuisbatterij', 'thuisbatterij', 'bijkeuken', 'Домашня батарея', 'Thuisbatterij', ['modus'], { lading: 62, vermogen: 0, modus: 'slim' }, { capaciteit: 10 }],
    ['laadpaal', 'laadpaal', 'garage', 'Зарядна станція', 'Laadpaal', ['laden', 'modus'], { laadt: false, vermogen: 0, modus: 'slim', aangesloten: true }, { piek: 11 }]
  ];

  var apparaten = lijst.map(function (r) {
    var extra = r[7] || {};
    var a = { id: r[0], soort: r[1], kamer: r[2], naam: [r[3], r[4]], mog: r[5], st: r[6], beschikbaar: extra.beschikbaar || 'ok', bron: S };
    for (var k in extra) if (k !== 'beschikbaar') a[k] = extra[k];
    return a;
  });

  var mensen = [
    { id: 'olena', naam: ['Олена', 'Olena'], rol: 'eigenaar', thuis: true, sinds: -310, zeker: 'zeker' },
    { id: 'taras', naam: ['Тарас', 'Taras'], rol: 'bewoner', thuis: false, sinds: -380, zeker: 'zeker' },
    { id: 'marko', naam: ['Марко', 'Marko'], rol: 'kind', thuis: false, sinds: -370, zeker: 'waarschijnlijk' },
    { id: 'solomija', naam: ['Соломія', 'Solomija'], rol: 'kind', thuis: false, sinds: -370, zeker: 'zeker' },
    { id: 'iryna', naam: ['Ірина', 'Iryna'], rol: 'gast', thuis: false, sinds: -2000, zeker: 'onbekend', gast: true }
  ];

  var voertuigen = [
    { id: 'ev', soort: 'auto', icoon: 'car', naam: ['Електромобіль', 'Elektrische auto'], lading: 64, doel: 80, bereik: 268, plek: 'oprit', aangesloten: true, capaciteit: 64 },
    { id: 'benzine', soort: 'auto', icoon: 'car', naam: ['Бензинове авто', 'Benzineauto'], brandstof: 58, bereik: 520, plek: 'onderweg' },
    { id: 'fietsolena', soort: 'fiets', icoon: 'bike', naam: ['Електровелосипед Олени', 'E-bike van Olena'], lading: 82, bereik: 64, plek: 'garage' },
    { id: 'fietstaras', soort: 'fiets', icoon: 'bike', naam: ['Електровелосипед Тараса', 'E-bike van Taras'], lading: 37, bereik: 28, plek: 'garage' },
    { id: 'step', soort: 'step', icoon: 'bike', naam: ['Самокат', 'Elektrische step'], lading: 55, bereik: 14, plek: 'garage' },
    { id: 'bromfiets', soort: 'bromfiets', icoon: 'bike', naam: ['Мопед', 'Bromfiets'], lading: 91, bereik: 60, plek: 'garage' }
  ];
  var drones = [
    { id: 'ooievaar', naam: ['Дрон «Лелека»', 'Drone ‘Ooievaar’'], lading: 92, stand: 'dock', signaal: 100, hoogte: 0, afstand: 0 },
    { id: 'zwaluw', naam: ['Дрон «Ластівка»', 'Drone ‘Zwaluw’'], lading: 48, stand: 'dock', signaal: 100, hoogte: 0, afstand: 0 }
  ];

  // Сцени: кроки — звичайні дії через HV.doe з автором «сцена».
  var scenes = [
    { id: 'avond', icoon: 'sunset', naam: ['Вечір', 'Avond'], stappen: [
      { doel: 'torsher', mogelijkheid: 'aan', waarde: true }, { doel: 'torsher', mogelijkheid: 'helderheid', waarde: 55 }, { doel: 'torsher', mogelijkheid: 'kleurtemp', waarde: 2400 },
      { doel: 'ledstrip', mogelijkheid: 'aan', waarde: true }, { doel: 'keukenlicht', mogelijkheid: 'aan', waarde: true }, { doel: 'keukenlicht', mogelijkheid: 'helderheid', waarde: 50 },
      { doel: 'plafondwoon', mogelijkheid: 'aan', waarde: false }, { doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 0 }, { doel: 'zolderlicht', mogelijkheid: 'aan', waarde: false }] },
    { id: 'film', icoon: 'clapperboard', naam: ['Кіно', 'Film'], stappen: [
      { doel: 'tv', mogelijkheid: 'aan', waarde: true }, { doel: 'torsher', mogelijkheid: 'helderheid', waarde: 15 }, { doel: 'ledstrip', mogelijkheid: 'aan', waarde: true },
      { doel: 'plafondwoon', mogelijkheid: 'aan', waarde: false }, { doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 0 }] },
    { id: 'welterusten', icoon: 'moon', naam: ['На добраніч', 'Welterusten'], stappen: [
      { doel: 'woongroep', mogelijkheid: 'aan', waarde: false }, { doel: 'keukenlicht', mogelijkheid: 'aan', waarde: false }, { doel: 'tv', mogelijkheid: 'aan', waarde: false },
      { doel: 'slaaplicht', mogelijkheid: 'aan', waarde: true }, { doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: true }, { doel: 'thermostaat', mogelijkheid: 'doel', waarde: 17.5 }] },
    { id: 'ochtend', icoon: 'sunrise', naam: ['Ранок', 'Ochtend'], stappen: [
      { doel: 'keukenlicht', mogelijkheid: 'aan', waarde: true }, { doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 100 }, { doel: 'koffie', mogelijkheid: 'aan', waarde: true },
      { doel: 'thermostaat', mogelijkheid: 'doel', waarde: 21 }] },
    { id: 'gasten', icoon: 'party-popper', naam: ['Гості за столом', 'Gasten aan tafel'], stappen: [
      { doel: 'keukenlicht', mogelijkheid: 'aan', waarde: true }, { doel: 'keukenlicht', mogelijkheid: 'helderheid', waarde: 90 }, { doel: 'multiroom', mogelijkheid: 'afspelen', waarde: true },
      { doel: 'torsher', mogelijkheid: 'aan', waarde: true }] }
  ];

  // Хто може діяти без людини: кожен має власні дозволи hv-stand (типово «Вимкнено»).
  var uitvoerders = [
    { id: 'scene', soort: 'scene', naam: ['Сцени', 'Scènes'] },
    { id: 'automatisering', soort: 'automatisering', naam: ['Автоматизації', 'Automatiseringen'] },
    { id: 'optimalisatie', soort: 'optimalisatie', naam: ['Оптимізатор енергії', 'Energie-optimalisatie'] },
    { id: 'claude', soort: 'agent', naam: ['Агент Claude', 'Agent Claude'] },
    { id: 'gemini', soort: 'agent', naam: ['Агент Gemini', 'Agent Gemini'] }
  ];

  var rollen = [
    { id: 'eigenaar', naam: ['Власник', 'Eigenaar'], persoon: 'olena' },
    { id: 'bewoner', naam: ['Мешканець', 'Bewoner'], persoon: 'taras' },
    { id: 'kind', naam: ['Дитина', 'Kind'], persoon: 'marko' },
    { id: 'gast', naam: ['Гість', 'Gast'], persoon: 'iryna' }
  ];

  // Доба дому для стрічки hv-dagstrook: години за часом дому (0–24), повторюється щодня.
  var dag = {
    aanwezig: [[0, 8.2], [15.5, 24]],
    stand: [[0, 6.5, 'nacht'], [6.5, 8.25, 'thuis'], [8.25, 15.5, 'afwezig'], [15.5, 23, 'thuis'], [23, 24, 'nacht']],
    deuren: [7.9, 8.2, 12.6, 15.5, 17.1, 18.4],
    makers: [[6.5, 'automatisering'], [8.25, 'mens'], [12.6, 'dienst'], [15.5, 'mens'], [17.0, 'automatisering'], [19.2, 'agent'], [22.9, 'scene']]
  };

  function kopie(x) { return JSON.parse(JSON.stringify(x)); }

  HV.paspoort = {
    naam: ['Демо-дім · Wilgenlaan 12', 'Demowoning · Wilgenlaan 12'],
    adres: 'Wilgenlaan 12',
    plaats: ['Утрехт', 'Utrecht'],
    epoch: EPOCH,
    verdiepingen: verdiepingen,
    kamers: kamers,
    soorten: soorten,
    apparaten: apparaten,
    mensen: mensen,
    voertuigen: voertuigen,
    drones: drones,
    scenes: scenes,
    uitvoerders: uitvoerders,
    rollen: rollen,
    dag: dag,
    favorieten: ['torsher', 'keukenlicht', 'thermostaat', 'gordijnwoon', 'voordeurslot', 'stekkermedia'],

    /** Свіжий світ: глибока копія паспорта з часом дому `tijd`. */
    bouw: function (tijd) {
      var t = tijd == null ? EPOCH : tijd;
      var w = {
        tijd: t, snelheid: 60, pauze: false, zaad: 20261109,
        huisstand: 'thuis', gegevens: 'live', scenario: null, nood: null, oproep: null, eersteStart: false,
        zelfGestopt: false,
        weer: { temp: 9, bewolking: 0.55, neerslag: null, wind: 4, mist: false, verouderd: false },
        kamers: kopie(kamers), verdiepingen: kopie(verdiepingen), mensen: kopie(mensen),
        voertuigen: kopie(voertuigen), drones: kopie(drones), scenes: kopie(scenes),
        apparaten: {}, volgorde: [], favorieten: this.favorieten.slice(),
        energie: { zon: 0, huis: 0.5, net: 0.5, batterij: 0, auto: 0, vandaagIn: 4.2, vandaagUit: 1.1, vandaagZon: 3.6 },
        nu: [], logboek: [], verzoeken: [], sceneActief: null, logTeller: 0
      };
      apparaten.forEach(function (a) {
        var k = kopie(a);
        k.gezien = t - (k.gezienGeleden || 0) * 1000;
        w.apparaten[k.id] = k;
        w.volgorde.push(k.id);
      });
      w.mensen.forEach(function (m) { m.sinds = t + m.sinds * 60000; });
      return w;
    }
  };
})(window.HV = window.HV || {});
