// Vijftien scenario's van de minisimulator (§5.3 van het plan): elk is een functie die de wereld verandert.
// Сценарій завжди починає зі свіжого паспорта, ставить час дому й змінює стан; далі світ живе сам (крок симуляції).
(function (HV) {
  'use strict';

  var D9 = function (u, m) { return HV.huistijd(2026, 11, 9, u, m); };
  var D10 = function (u, m) { return HV.huistijd(2026, 11, 10, u, m); };

  // ── hulpjes ──
  function zet(w, id, st) { var a = w.apparaten[id]; for (var k in st) a.st[k] = st[k]; return a; }
  function licht(w, aan) {
    Object.keys(w.apparaten).forEach(function (id) { var a = w.apparaten[id]; if (a.soort === 'licht' && a.beschikbaar === 'ok') a.st.aan = aan.indexOf(id) >= 0; });
  }
  function thuis(w, ids, minutenGeleden) {
    w.mensen.forEach(function (m) {
      var t = ids.indexOf(m.id) >= 0;
      if (m.thuis !== t) { m.thuis = t; m.sinds = w.tijd - (minutenGeleden || 30) * 60000; }
    });
  }
  function weer(w, temp, bewolking, neerslag, wind) { w.weer.temp = temp; w.weer.bewolking = bewolking; w.weer.neerslag = neerslag || null; w.weer.wind = wind == null ? 4 : wind; }
  function nu(w, item) { item.sinds = item.sinds == null ? w.tijd : item.sinds; w.nu.push(item); }
  var SIM = { soort: 'simulator', naam: ['Симулятор', 'Simulator'] };

  var raamOpen = function (w, minuten) {
    zet(w, 'raamslaap', { open: true, sinds: w.tijd - minuten * 60000 });
    nu(w, {
      id: 'raam', soort: 'aandacht', maker: 'simulator', icoon: 'door-open', doel: 'raamslaap', kamer: 'slaapkamer',
      tekst: ['У спальні відчинено вікно, а опалення гріє', 'In de slaapkamer staat het raam open terwijl de verwarming aan is'],
      sinds: w.tijd - minuten * 60000,
      acties: [{ naam: 'nu-doe', hoofd: true, label: ['Знизити до 15 °C тут', 'Hier verlagen naar 15 °C'], gegevens: { doel: 'kamer:slaapkamer', mogelijkheid: 'doel', waarde: 15 } }]
    });
  };
  // Запит агента з власним часом: схвалене дорівнює виконаному. «Схвалити раз» (чи дозвіл «Завжди») не починає зарядку
  // в дорогу вечірню годину — ядро виконає дію о 02:00 годинником дому (поле om). «Чекає до» називає сам запит (tot —
  // за 5 хв до дешевого вікна): без відповіді він «минув», а не висить до ранку. Числа — з таблиці тарифу (10.11: 02:00
  // і 03:00 — € 0,18, 04:00 — € 0,19) і з кроку симуляції (16 % від 64 кВт·год на 7,4 кВт — близько 1 год 25 хв).
  var verzoekLaden = function (w) {
    var om = D10(2, 0);
    w.verzoeken.push({
      id: 'v1', uitvoerder: 'claude', sleutel: 'laadpaal.laden', doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, sinds: w.tijd, om: om, tot: om - 5 * 60000, stand: 'wacht',
      wat: ['Зарядити авто о 02:00', 'De auto om 02:00 laden'],
      waarom: ['найдешевші години ночі: 02:00–05:00, від € 0,18 за кВт·год', 'de goedkoopste uren van de nacht: 02:00–05:00, vanaf € 0,18 per kWh'],
      wordt: ['Авто: 64 % → 80 %, зарядка 02:00–03:25', 'Auto: 64 % → 80 %, laden 02:00–03:25']
    });
    nu(w, {
      id: 'verzoek-v1', soort: 'verzoek', maker: 'agent', icoon: 'plug-zap', verzoek: 'v1',
      tekst: ['Агент Claude просить зарядити авто о 02:00', 'Agent Claude vraagt de auto om 02:00 te laden'],
      acties: [{ naam: 'verzoek-ja', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'], gegevens: { verzoek: 'v1' } }, { naam: 'verzoek-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { verzoek: 'v1' } }]
    });
  };

  var lijst = [
    {
      id: 'ochtend', naam: ['Ранок буднього дня', 'Doordeweekse ochtend'], tijd: D9(7, 10),
      wat: ['Усі вдома, світанок, дорога година', 'Iedereen thuis, dageraad, duur uur'],
      pas: function (w) {
        weer(w, 6, 0.3); thuis(w, ['olena', 'taras', 'marko', 'solomija'], 600);
        licht(w, ['keukenlicht', 'badlicht', 'slaaplicht', 'hallicht']);
        zet(w, 'koffie', { aan: true, sinds: w.tijd - 60000 }); zet(w, 'speakerkeuken', { speelt: true });
        zet(w, 'thermostaat', { doel: 21, temperatuur: 18.9, verwarmt: true }); zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        zet(w, 'gordijnwoon', { positie: 100 }); zet(w, 'thuisbatterij', { lading: 34 }); zet(w, 'laadpaal', { laadt: false });
        w.voertuigen[0].lading = 80; w.voertuigen[1].plek = 'oprit';
        nu(w, { id: 'papier', soort: 'info', maker: 'dienst', icoon: 'recycle', tekst: ['Сьогодні вивозять папір — виставте контейнер до 07:30', 'Vandaag wordt het papier opgehaald — zet de container vóór 07:30 buiten'], acties: [{ naam: 'nu-weg', hoofd: true, label: ['Виставлено', 'Buiten gezet'] }] });
      }
    },
    {
      id: 'zonnigemiddag', naam: ['Сонячний полудень', 'Zonnige middag'], tijd: D9(12, 30),
      wat: ['Сонце дає більше, ніж бере дім', 'De zon levert meer dan het huis gebruikt'],
      pas: function (w) {
        weer(w, 12, 0.04, null, 3); thuis(w, ['olena'], 260);
        licht(w, ['werklicht']);
        zet(w, 'thermostaat', { doel: 20.5, temperatuur: 20.8, verwarmt: false }); zet(w, 'thuisbatterij', { lading: 71 });
        zet(w, 'laadpaal', { laadt: true, modus: 'slim', aangesloten: true }); w.voertuigen[0].lading = 52;
        zet(w, 'wasmachine', { loopt: true, rest: 24, vermogen: 480 }); zet(w, 'speakerkeuken', { speelt: false });
        zet(w, 'gordijnwoon', { positie: 100 }); zet(w, 'jaloezieslaap', { positie: 60, kantel: 45 });
        nu(w, { id: 'vaat', soort: 'info', maker: 'optimalisatie', icoon: 'sun', tekst: ['Сонця більше, ніж треба дому. Запустити посудомийну зараз?', 'Er is meer zon dan het huis nodig heeft. De vaatwasser nu starten?'], acties: [{ naam: 'nu-doe', hoofd: true, label: ['Запустити', 'Starten'], gegevens: { doel: 'vaatwasser', mogelijkheid: 'programma', waarde: 'start' } }, { naam: 'nu-weg', label: ['Не зараз', 'Niet nu'] }] });
      }
    },
    {
      id: 'avond', naam: ['Вечір', 'Avond'], tijd: D9(19, 42),
      wat: ['Сутінки, дощ, усі вдома; вікно спальні відчинене', 'Schemer, regen, iedereen thuis; het slaapkamerraam staat open'],
      pas: function (w) {
        weer(w, 8, 0.7, 'regen', 6); thuis(w, ['olena', 'taras', 'marko', 'solomija'], 150);
        licht(w, ['torsher', 'ledstrip', 'keukenlicht', 'kinderlicht']);
        zet(w, 'torsher', { helderheid: 55, kleurtemp: 2400 }); zet(w, 'keukenlicht', { helderheid: 50 }); zet(w, 'kinderlicht', { helderheid: 35 });
        zet(w, 'tv', { aan: true }); zet(w, 'stekkermedia', { vermogen: 152 }); zet(w, 'speakerkeuken', { speelt: false });
        zet(w, 'gordijnwoon', { positie: 0 }); zet(w, 'jaloezieslaap', { positie: 0, kantel: 0 });
        zet(w, 'thermostaat', { doel: 21, temperatuur: 20.7, verwarmt: true }); zet(w, 'tempslaap', { waarde: 17.1 });
        zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 }); zet(w, 'vaatwasser', { loopt: true, rest: 52, vermogen: 610 });
        // авто під'єднано й чекає дешевих годин (режим «розумно» у дорогу вечірню годину не заряджає) — тому агент і просить
        // зарядити о 02:00 (схвалений запит виконується о 02:00, а не в мить схвалення); запит існує лише за «Питати»,
        // тож дозвіл цієї дії для агента стоїть саме так
        zet(w, 'laadpaal', { laadt: false, modus: 'slim', aangesloten: true, vermogen: 0 }); w.voertuigen[0].lading = 64; w.voertuigen[1].plek = 'oprit';
        zet(w, 'thuisbatterij', { lading: 48 }); zet(w, 'computer', { aan: false });
        w.sceneActief = 'avond';
        HV.gevaar && HV.gevaar.zetStandStil('claude', 'laadpaal.laden', 'vragen');
        raamOpen(w, 42); verzoekLaden(w);
      }
    },
    {
      id: 'nacht', naam: ['Ніч', 'Nacht'], tijd: D10(2, 15),
      wat: ['Усі сплять, нічна охорона, авто заряджається дешево', 'Iedereen slaapt, nachtalarm, de auto laadt goedkoop'],
      pas: function (w) {
        weer(w, 4, 0.2, null, 2); thuis(w, ['olena', 'taras', 'marko', 'solomija'], 500);
        w.huisstand = 'nacht'; zet(w, 'alarm', { stand: 'nacht' });
        licht(w, ['kinderlicht']); zet(w, 'kinderlicht', { helderheid: 10 });
        zet(w, 'thermostaat', { doel: 17.5, temperatuur: 18.4, verwarmt: false }); zet(w, 'gordijnwoon', { positie: 0 }); zet(w, 'jaloezieslaap', { positie: 0 });
        zet(w, 'laadpaal', { laadt: true, modus: 'slim' }); w.voertuigen[0].lading = 66; w.voertuigen[1].plek = 'oprit';
        zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 }); zet(w, 'speakerkeuken', { speelt: false }); zet(w, 'computer', { aan: false });
        zet(w, 'thuisbatterij', { lading: 22 }); zet(w, 'luchtreiniger', { aan: true }); zet(w, 'stekkerbureau', { vermogen: 9 }); zet(w, 'stekkermedia', { vermogen: 6 });
      }
    },
    {
      id: 'niemandthuis', naam: ['Нікого вдома', 'Niemand thuis'], tijd: D9(10, 40),
      wat: ['Режим «Не вдома», повна охорона, пилосос прибирає', 'Stand ‘Afwezig’, alarm volledig, de robotstofzuiger is bezig'],
      pas: function (w) {
        weer(w, 9, 0.5); thuis(w, [], 140);
        w.huisstand = 'afwezig'; zet(w, 'alarm', { stand: 'volledig' });
        licht(w, []); zet(w, 'thermostaat', { doel: 17, temperatuur: 18.6, verwarmt: false });
        zet(w, 'stofzuiger', { stand: 'bezig', lading: 74 }); zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        zet(w, 'speakerkeuken', { speelt: false }); zet(w, 'computer', { aan: false }); zet(w, 'stekkerbureau', { vermogen: 9 }); zet(w, 'stekkermedia', { vermogen: 6 });
        zet(w, 'laadpaal', { laadt: false, aangesloten: false }); w.voertuigen[0].plek = 'onderweg'; w.voertuigen[0].lading = 71;
      }
    },
    {
      id: 'deurbel', naam: ['Дзвінок у двері', 'Er wordt aangebeld'], tijd: D9(16, 58),
      wat: ['Хтось стоїть біля входу; виклик на всіх екранах', 'Er staat iemand voor de deur; de oproep staat op alle schermen'],
      pas: function (w) {
        weer(w, 9, 0.6); thuis(w, ['olena', 'marko', 'solomija'], 80);
        licht(w, ['keukenlicht', 'hallicht', 'kinderlicht']);
        zet(w, 'deurbel', { laatst: w.tijd }); zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        w.oproep = { sinds: w.tijd, stand: 'belt' };
        nu(w, { id: 'oproep', soort: 'aandacht', maker: 'dienst', icoon: 'bell-ring', doel: 'deurbel', tekst: ['Хтось дзвонить у двері', 'Er wordt aangebeld bij de voordeur'], acties: [{ naam: 'oproep', hoofd: true, label: ['Показати', 'Bekijken'], gegevens: { stap: 'toon' } }, { naam: 'oproep', label: ['Відхилити', 'Weigeren'], gegevens: { stap: 'weiger' } }] });
        w.logboek.unshift({ id: 'l' + (++w.logTeller), tijd: w.tijd, maker: { soort: 'dienst', naam: ['Дверний дзвінок', 'Deurbel'] }, wat: ['Дзвінок у двері', 'Er is aangebeld'], soort: 'huis.toegang', gewicht: 'belangrijk', gelezen: false, sim: true });
      }
    },
    {
      id: 'rook', naam: ['Дим на кухні', 'Rook in de keuken'], tijd: D9(18, 20),
      wat: ['Датчик диму спрацював: аварійний шар на всіх екранах', 'De rookmelder gaat af: de noodlaag staat op alle schermen'],
      pas: function (w) {
        weer(w, 8, 0.6); thuis(w, ['olena', 'marko'], 120);
        licht(w, ['keukenlicht', 'torsher']);
        zet(w, 'rookkeuken', { alarm: true, sinds: w.tijd }); zet(w, 'oven', { aan: true, temperatuur: 196 }); zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        w.nood = { soort: 'rook', kamer: 'keuken', sinds: w.tijd, bron: 'rookkeuken', bevestigd: false };
        w.logboek.unshift({ id: 'l' + (++w.logTeller), tijd: w.tijd, maker: SIM, wat: ['Дим на кухні', 'Rook in de keuken'], soort: 'huis.alarm', gewicht: 'alarm', gelezen: false, sim: true });
      }
    },
    {
      id: 'lek', naam: ['Протікання', 'Lekkage'], tijd: D9(11, 5),
      wat: ['Вода в підсобці, нікого вдома', 'Water in de bijkeuken, niemand thuis'],
      pas: function (w) {
        weer(w, 9, 0.5); thuis(w, [], 160); w.huisstand = 'afwezig'; zet(w, 'alarm', { stand: 'volledig' });
        licht(w, []); zet(w, 'lekbijkeuken', { alarm: true, sinds: w.tijd }); zet(w, 'wasmachine', { loopt: true, rest: 31, vermogen: 480 });
        zet(w, 'laadpaal', { laadt: false, aangesloten: false }); w.voertuigen[0].plek = 'onderweg';
        w.nood = { soort: 'lek', kamer: 'bijkeuken', sinds: w.tijd, bron: 'lekbijkeuken', bevestigd: false };
        w.logboek.unshift({ id: 'l' + (++w.logTeller), tijd: w.tijd, maker: SIM, wat: ['Протікання в підсобці', 'Lekkage in de bijkeuken'], soort: 'huis.alarm', gewicht: 'alarm', gelezen: false, sim: true });
      }
    },
    {
      id: 'storing', naam: ['Збій зв’язку', 'Verbinding weg'], tijd: D9(15, 10),
      wat: ['Останній знімок і лише перегляд; керування вимкнене', 'Laatste momentopname en alleen bekijken; bediening uit'],
      pas: function (w) {
        weer(w, 9, 0.6); thuis(w, ['olena', 'marko', 'solomija'], 20); licht(w, ['keukenlicht', 'werklicht']);
        w.gegevens = 'geen'; w.gegevensSinds = w.tijd - 4 * 60000;
      }
    },
    {
      id: 'agentverzoek', naam: ['Агент просить схвалення', 'Agent vraagt goedkeuring'], tijd: D9(21, 5),
      wat: ['Запит за режимом «Питати» чекає на власника', 'Een verzoek in de stand ‘Vragen’ wacht op de eigenaar'],
      pas: function (w) {
        weer(w, 7, 0.4); thuis(w, ['olena', 'taras', 'marko', 'solomija'], 200);
        licht(w, ['torsher', 'ledstrip', 'slaaplicht']); zet(w, 'tv', { aan: true }); zet(w, 'gordijnwoon', { positie: 0 });
        zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 }); zet(w, 'laadpaal', { laadt: false, aangesloten: true }); w.voertuigen[1].plek = 'oprit';
        HV.gevaar && HV.gevaar.zetStandStil('claude', 'laadpaal.laden', 'vragen');
        verzoekLaden(w);
      }
    },
    {
      id: 'eerstestart', naam: ['Перший запуск', 'Eerste start'], tijd: D9(14, 30),
      wat: ['Дім щойно створено: перші кроки й порожній Журнал', 'Het huis is net aangemaakt: eerste stappen en een leeg logboek'],
      // Журнал справді порожній: запуск сценарію не пише свого запису, а w.logboekVanaf — мить створення дому:
      // записи, датовані раніше, ядро прибирає звідусіль (HV.staat.snoeiLogboek), хай який модуль їх посіяв
      zonderRegel: true,
      pas: function (w) {
        weer(w, 9, 0.55); thuis(w, ['olena'], 5);
        w.eersteStart = true; w.logboek = []; w.logboekVanaf = w.tijd; w.favorieten = [];
        licht(w, []);
      }
    },
    {
      id: 'dakinspectie', naam: ['Огляд даху дроном', 'Dakinspectie met de drone'], tijd: D9(13, 40),
      wat: ['Дрон «Лелека» в польоті над дахом', 'Drone ‘Ooievaar’ vliegt boven het dak'],
      pas: function (w) {
        weer(w, 11, 0.15, null, 3); thuis(w, ['olena'], 300); licht(w, ['werklicht']);
        var d = w.drones[0]; d.stand = 'vlucht'; d.lading = 71; d.signaal = 86; d.hoogte = 18; d.afstand = 24; d.sinds = w.tijd - 6 * 60000;
        zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        nu(w, { id: 'vlucht', soort: 'info', maker: 'mens', icoon: 'plane', tekst: ['Дрон «Лелека» оглядає дах: 71 %, сигнал добрий', 'Drone ‘Ooievaar’ inspecteert het dak: 71 %, signaal goed'], acties: [{ naam: 'ga', hoofd: true, label: ['Відкрити кабіну', 'Cockpit openen'], gegevens: { naar: 'garage-drones' } }] });
      }
    },
    {
      id: 'signaalverlies', naam: ['Втрата сигналу', 'Signaal kwijt'], tijd: D9(13, 52),
      wat: ['Зв’язок із дроном зник; він повертається сам', 'De verbinding met de drone is weg; hij keert zelf terug'],
      pas: function (w) {
        weer(w, 11, 0.2, null, 7); thuis(w, ['olena'], 300); licht(w, ['werklicht']);
        var d = w.drones[0]; d.stand = 'signaalkwijt'; d.lading = 58; d.signaal = 0; d.hoogte = 22; d.afstand = 61; d.sinds = w.tijd - 18 * 60000; d.kwijtSinds = w.tijd - 40000;
        zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        nu(w, { id: 'signaal', soort: 'aandacht', maker: 'simulator', icoon: 'wifi-off', tekst: ['Дрон «Лелека»: сигнал зник 40 с тому, повертається додому сам', 'Drone ‘Ooievaar’: signaal 40 s geleden weggevallen, keert zelf terug naar huis'], acties: [{ naam: 'ga', hoofd: true, label: ['Відкрити кабіну', 'Cockpit openen'], gegevens: { naar: 'garage-drones' } }] });
        w.logboek.unshift({ id: 'l' + (++w.logTeller), tijd: w.tijd - 40000, maker: SIM, wat: ['Дрон «Лелека»: втрата сигналу', 'Drone ‘Ooievaar’: signaal kwijt'], soort: 'huis.voertuig', gewicht: 'belangrijk', gelezen: false, sim: true });
      }
    },
    {
      id: 'terugkeer', naam: ['Повернення й зарядка', 'Thuiskomst en laden'], tijd: D9(17, 35),
      wat: ['Авто щойно приїхало: ворота гаража відчинені, зарядка почалася', 'De auto is net thuis: de garagedeur staat open, het laden is begonnen'],
      pas: function (w) {
        weer(w, 8, 0.6, null, 5); thuis(w, ['olena', 'taras', 'marko', 'solomija'], 4);
        licht(w, ['keukenlicht', 'hallicht', 'torsher', 'tuinlicht']);
        zet(w, 'garagedeur', { open: true, sinds: w.tijd - 4 * 60000 }); zet(w, 'laadpaal', { laadt: true, modus: 'slim', aangesloten: true });
        w.voertuigen[0].lading = 31; w.voertuigen[0].plek = 'oprit'; w.voertuigen[1].plek = 'oprit';
        zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 }); zet(w, 'thuisbatterij', { lading: 58 });
        nu(w, { id: 'garage', soort: 'aandacht', maker: 'mens', icoon: 'warehouse', doel: 'garagedeur', sinds: w.tijd - 4 * 60000, tekst: ['Ворота гаража відчинені', 'De garagedeur staat open'], acties: [{ naam: 'nu-doe', hoofd: true, label: ['Зачинити', 'Sluiten'], gegevens: { doel: 'garagedeur', mogelijkheid: 'open', waarde: false } }] });
      }
    },
    {
      id: 'negatieveprijs', naam: ['Від’ємна ціна', 'Negatieve prijs'], tijd: D10(13, 10),
      wat: ['Мережа доплачує за споживання до 14:00', 'Het net betaalt voor verbruik tot 14:00'],
      pas: function (w) {
        weer(w, 10, 0.1, null, 9); thuis(w, ['olena'], 280); licht(w, ['werklicht']);
        zet(w, 'thuisbatterij', { lading: 44 }); zet(w, 'laadpaal', { laadt: true, modus: 'snel', aangesloten: true }); w.voertuigen[0].lading = 47;
        zet(w, 'boiler', { verwarmt: true, doel: 60 }); zet(w, 'wasmachine', { loopt: true, rest: 44, vermogen: 480 }); zet(w, 'vaatwasser', { loopt: true, rest: 70, vermogen: 610 });
        nu(w, { id: 'prijs', soort: 'info', maker: 'optimalisatie', icoon: 'euro', tekst: ['Ціна від’ємна до 14:00: радимо заряджати авто й гріти воду зараз', 'De prijs is negatief tot 14:00: advies is nu de auto te laden en water te verwarmen'], acties: [{ naam: 'ga', hoofd: true, label: ['Показати тариф', 'Tarief tonen'], gegevens: { naar: 'energie-tarief' } }] });
      }
    }
  ];

  // Агент сам знімає свій запит, коли той втратив сенс: авто вже заряджене до цілі (наприклад, його раніше зарядило
  // правило «Дешева зарядка» чи людина). Запит, що чекає, і схвалений, який ще чекає 02:00, зникають із записом
  // «Запит знято: …» від імені агента. Випадок «зарядка вже йде» ядро закриває саме («уже так»).
  if (HV.staat && HV.staat.abonneer) {
    HV.staat.abonneer(function (w) {
      if (!w || !w.verzoeken || !w.verzoeken.length || !HV.verzoekIntrekken || w.gegevens === 'geen') return;
      var v = w.verzoeken.filter(function (x) { return x.id === 'v1'; })[0], ev = w.voertuigen && w.voertuigen[0];
      if (!v || !ev || !(v.stand === 'wacht' || (v.stand === 'goedgekeurd' && v.gepland && !v.uitkomst))) return;
      if (ev.lading >= ev.doel - 0.5) HV.verzoekIntrekken('v1', ['авто вже заряджене до ' + Math.round(ev.doel) + ' %', 'de auto is al geladen tot ' + Math.round(ev.doel) + ' %']);
    });
  }

  HV.scenarios = {
    lijst: lijst,
    vind: function (id) { for (var i = 0; i < lijst.length; i++) if (lijst[i].id === id) return lijst[i]; return null; },
    /** Запустити сценарій: свіжий світ → зміни сценарію → крок симуляції. Швидкість часу зберігається. */
    start: function (id, stil) {
      var s = this.vind(id);
      if (!s) return;
      HV.gevaar && HV.gevaar.herstelStanden();
      var w = HV.staat.herstel(s.tijd, true);
      w.gegevens = 'live';
      w.scenario = id;
      s.pas(w);
      HV.klok.stap(0);
      if (!stil && !s.zonderRegel && HV.logboek) {
        HV.logboek.voegToe({ maker: SIM, wat: ['Сценарій: ' + s.naam[0], 'Scenario: ' + s.naam[1]], waarom: s.wat, soort: 'huis.simulatie' });
      }
      if (HV.naScenario) HV.naScenario(s);
    }
  };
})(window.HV = window.HV || {});
