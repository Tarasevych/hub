// Garage / Гараж — розділ повністю, крім вкладки «Безпілотники» (її робить інший автор): Зараз · Транспорт · Роботи · Мапа.
// Аркуші пристроїв: auto, fiets, step, bromfiets, stofzuiger, maaier, beregening. Вільні аркуші: «Позначити викраденим»,
// «Хто бачить місце», «Запуск двигуна» (чесна відмова за шаблоном «Чому ні · Що перевірити · Що можна натомість»).
//
// Засади зони (специфікація панелі + план §3.8): транспорт — пристрій, як усі інші: кожна команда йде через HV.doe
// (ворота, ризик, ритуал людини, Журнал, «Повернути»). Дозволи — «Вимкнено · Питати · Завжди» для кожного виконавця й
// кожної дії, типово «Вимкнено», без стель; змінює лише власник. Налаштування зони (кімнати пилососа, правила пауз
// косарки, розклад, приватність місця) пишуться в Журнал так само, як у ядрі. Запуск двигуна не виконується ніколи.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var MIN = 60000, UUR = 3600000, DAG = 86400000;
  var VOERTUIGEN = ['ev', 'benzine', 'fietsolena', 'fietstaras', 'step', 'bromfiets'];
  var VSOORTEN = ['auto', 'fiets', 'step', 'bromfiets'];
  var TWEE = ['fiets', 'step', 'bromfiets'];
  var ROBOTS = ['stofzuiger', 'maaier', 'beregening'];

  // ───────────────────────── 1. Власні знаки (дизайн-мова §8: самокат, мопед, пилосос, косарка — не «Bot») ─────────────────────────
  var EIGEN = {
    'garage-step': { vak: '0 0 24 24', binnen: '<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 18h9"/><path d="M18.2 15.6 15.4 4"/><path d="M13 4h4.8"/>' },
    'garage-bromfiets': { vak: '0 0 24 24', binnen: '<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M8.5 17h5.5l3-6.5"/><path d="M4 13.5h7.5l2 3.5"/><path d="M15.5 6.5h3l-1 4"/>' },
    'garage-stofzuiger': { vak: '0 0 24 24', binnen: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="8.2" r="1.8"/><path d="M6.8 14.2h10.4"/><path d="M8.8 17.2h6.4"/>' },
    'garage-maaier': { vak: '0 0 24 24', binnen: '<path d="M3.5 15.5 6.2 9.5h10.6l3.7 6z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/><path d="M9 6.5V4M12 6.5V3.2M15 6.5V4"/>' }
  };
  if (HV.eigenIconen) for (var naamIcoon in EIGEN) if (!HV.eigenIconen[naamIcoon]) HV.eigenIconen[naamIcoon] = EIGEN[naamIcoon];

  // ───────────────────────── 2. Паспорт: транспорт як пристрої, доповнення роботів ─────────────────────────
  // Доповнюємо той самий масив, з якого HV.paspoort.bouw будує кожен новий світ (gegevens/ не правимо).
  // Заряд, запас ходу й місце транспорту живуть у w.voertuigen (їх веде симуляція ядра й Енергія); пристрій несе команди:
  // замок (vergrendeld), сигналізацію (modus), клімат салону (bron + doel), вікна (effect), багажник (ventilator),
  // позначку викрадення (stand), «Знайти» (signaal), зарядку від розетки (laden) і межу зарядки (positie).
  (function () {
    var P = HV.paspoort;
    if (!P || !P.apparaten) return;
    var S = P.soorten;
    var soorten = {
      auto: { icoon: 'car', toon: 'auto', naam: ['Автомобіль', 'Auto'] },
      fiets: { icoon: 'bike', toon: 'batterij', naam: ['Електровелосипед', 'E-bike'] },
      step: { icoon: 'garage-step', toon: 'batterij', naam: ['Електросамокат', 'Elektrische step'] },
      bromfiets: { icoon: 'garage-bromfiets', toon: 'batterij', naam: ['Мопед', 'Bromfiets'] }
    };
    for (var k in soorten) if (!S[k]) S[k] = soorten[k];
    if (S.stofzuiger) S.stofzuiger.icoon = 'garage-stofzuiger';
    if (S.maaier) S.maaier.icoon = 'garage-maaier';
    var ids = P.apparaten.map(function (a) { return a.id; });
    var auto = ['vergrendeld', 'modus', 'bron', 'doel', 'effect', 'ventilator', 'stand', 'signaal'];
    var twee = ['vergrendeld', 'modus', 'laden', 'positie', 'stand', 'signaal'];
    var tweeSt = function (temp) { return { vergrendeld: true, modus: 'v-alarm-aan', laadt: false, positie: 80, stand: 'v-gevonden', temp: temp }; };
    [
      { id: 'ev', soort: 'auto', naam: ['Електромобіль', 'Elektrische auto'], mog: auto.slice(), st: { vergrendeld: true, modus: 'v-alarm-aan', bron: 'v-klimaat-uit', doel: 20, effect: 'v-ramen-dicht', ventilator: 'v-koffer-dicht', stand: 'v-gevonden', binnen: 11.5, banden: [2.5, 2.5, 1.9, 2.5], km: 23140 } },
      { id: 'benzine', soort: 'auto', naam: ['Бензинове авто', 'Benzineauto'], mog: auto.filter(function (m) { return m !== 'bron' && m !== 'doel'; }), st: { vergrendeld: true, modus: 'v-alarm-aan', effect: 'v-ramen-dicht', ventilator: 'v-koffer-dicht', stand: 'v-gevonden', binnen: 13, banden: [2.4, 2.4, 2.3, 2.4], km: 88210 }, beschikbaar: 'slaapt', gezienGeleden: 5.8 * 3600 },
      { id: 'fietsolena', soort: 'fiets', naam: ['Електровелосипед Олени', 'E-bike van Olena'], mog: twee.slice(), st: tweeSt(15) },
      { id: 'fietstaras', soort: 'fiets', naam: ['Електровелосипед Тараса', 'E-bike van Taras'], mog: twee.slice(), st: tweeSt(15) },
      { id: 'step', soort: 'step', naam: ['Електросамокат', 'Elektrische step'], mog: twee.slice(), st: tweeSt(14) },
      { id: 'bromfiets', soort: 'bromfiets', naam: ['Мопед', 'Bromfiets'], mog: twee.slice(), st: tweeSt(14) }
    ].forEach(function (a) {
      if (ids.indexOf(a.id) >= 0) return;
      a.kamer = 'garage';
      a.beschikbaar = a.beschikbaar || 'ok';
      a.bron = 'Симулятор';
      P.apparaten.push(a);
    });
    var EXTRA = {
      stofzuiger: { mog: ['modus', 'signaal'], st: { modus: 'z-normaal', voortgang: 0, fout: null, borstel: 62, filter: 30, kamerNu: null } },
      maaier: { mog: ['signaal'], st: { voortgang: 0, pauzeReden: null, messen: 38 } },
      beregening: { mog: [], st: { rest: null, zoneNu: null } }
    };
    P.apparaten.forEach(function (a) {
      var x = EXTRA[a.id];
      if (!x) return;
      x.mog.forEach(function (m) { if (a.mog.indexOf(m) < 0) a.mog.push(m); });
      for (var s in x.st) if (!(s in a.st)) a.st[s] = x.st[s];
    });
  })();

  // ───────────────────────── 3. Матриця дій: рядки гаража ─────────────────────────
  // Рівень визначає лише ритуал людини; дозволи — «Вимкнено · Питати · Завжди» для кожного виконавця, без стель (§3.8).
  var isNacht = function () { var u = HV.uur(HV.staat.w.tijd); return u >= 22 || u < 7; };
  var isDonker = function () { var u = HV.uur(HV.staat.w.tijd); return u < 7.66 || u > 16.92; };
  var ZOEK = ['фари й сигнал', 'lichten en claxon', 'короткий звук', 'kort geluid'];
  var WEK = ['розбудити', 'wekken'];
  (function () {
    var G = HV.gevaar;
    if (!G || !G.acties) return;
    var RISICO = function (uk, nl) { return [uk + ' Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', nl + ' Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.']; };
    var V = VSOORTEN;
    var nieuw = [
      { sleutel: 'garage.ontgrendelen', soorten: V, mogelijkheid: 'vergrendeld', als: function (a, v) { return v === false; }, niveau: 'kritiek',
        naam: ['Відімкнути транспорт', 'Voertuig ontgrendelen'],
        gevolg: ['Що станеться: транспорт відімкнеться для кожного, хто стоїть поруч. Пов’язано з: сигналізація лишається, але двері й замок вже не тримають. Як повернути: «Замкнути» — один дотик; авто замкнеться саме за 2 хв, якщо дверей не відчинять.', 'Wat er gebeurt: het voertuig gaat open voor iedereen die ernaast staat. Hangt samen met: het alarm blijft aan, maar deur en slot houden niets meer tegen. Terugdraaien: ‘Vergrendelen’ — één tik; de auto vergrendelt na 2 min vanzelf als geen deur opengaat.'],
        risico: RISICO('Що може статися: транспорт відімкнеться, коли поруч нікого з ваших.', 'Wat er kan gebeuren: het voertuig gaat open terwijl er niemand van jullie in de buurt is.') },
      { sleutel: 'garage.vergrendelen', soorten: V, mogelijkheid: 'vergrendeld', niveau: 'gewoon', naam: ['Замкнути транспорт', 'Voertuig vergrendelen'] },
      { sleutel: 'garage.alarmuit', soorten: V, mogelijkheid: 'modus', als: function (a, v) { return v === 'v-alarm-uit'; }, niveau: 'kritiek',
        naam: ['Зняти сигналізацію транспорту', 'Alarm van het voertuig uitzetten'],
        gevolg: ['Що станеться: сигналізація перестане реагувати на поштовх, нахил і відчинення. Пов’язано з: маячок і далі показує місце. Як повернути: «Увімкнути сигналізацію» — один дотик.', 'Wat er gebeurt: het alarm reageert niet meer op schokken, kantelen en openen. Hangt samen met: het baken blijft de locatie tonen. Terugdraaien: ‘Alarm aanzetten’ — één tik.'],
        risico: RISICO('Що може статися: транспорт стоятиме без сигналізації, коли його хтось чіпає.', 'Wat er kan gebeuren: het voertuig staat zonder alarm terwijl iemand eraan zit.') },
      { sleutel: 'garage.alarmaan', soorten: V, mogelijkheid: 'modus', niveau: 'gewoon', naam: ['Увімкнути сигналізацію транспорту', 'Alarm van het voertuig aanzetten'] },
      { sleutel: 'garage.kofferbak', soorten: ['auto'], mogelijkheid: 'ventilator', als: function (a, v) { return v === 'v-koffer-open'; }, niveau: 'kritiek',
        naam: ['Відчинити багажник', 'Kofferbak openen'],
        gevolg: ['Що станеться: багажник відчиниться й лишиться відчиненим; річ у ньому зможе взяти будь-хто поруч. Пов’язано з: замок дверей не змінюється. Як повернути: багажник зачиняють рукою — дистанційно лише «Замкнути».', 'Wat er gebeurt: de kofferbak gaat open en blijft open; iedereen in de buurt kan erbij. Hangt samen met: het slot van de deuren verandert niet. Terugdraaien: de kofferbak sluit je met de hand — op afstand alleen ‘Vergrendelen’.'],
        risico: RISICO('Що може статися: багажник відчиниться на вулиці без нікого поруч.', 'Wat er kan gebeuren: de kofferbak gaat open op straat zonder iemand ernaast.') },
      { sleutel: 'garage.kofferdicht', soorten: ['auto'], mogelijkheid: 'ventilator', niveau: 'gewoon', naam: ['Зачинити багажник', 'Kofferbak sluiten'] },
      { sleutel: 'garage.ramenopen', soorten: ['auto'], mogelijkheid: 'effect', als: function (a, v) { return v === 'v-ramen-open'; }, niveau: 'gevaarlijk',
        naam: ['Відчинити вікна авто', 'Ramen van de auto openen'],
        gevolg: ['Що станеться: усі вікна опустяться на 5 см для провітрювання. Пов’язано з: дощ заллє салон; сигналізація салону не стежить, поки вікна відчинені. Як повернути: «Зачинити вікна» — один дотик.', 'Wat er gebeurt: alle ramen zakken 5 cm om te luchten. Hangt samen met: regen komt naar binnen; het interieuralarm bewaakt niet zolang de ramen open zijn. Terugdraaien: ‘Ramen sluiten’ — één tik.'],
        risico: RISICO('Що може статися: вікна відчиняться перед дощем чи вночі на вулиці.', 'Wat er kan gebeuren: de ramen gaan open vlak voor regen of ’s nachts op straat.') },
      { sleutel: 'garage.ramendicht', soorten: ['auto'], mogelijkheid: 'effect', niveau: 'gewoon', naam: ['Зачинити вікна авто', 'Ramen van de auto sluiten'] },
      { sleutel: 'garage.klimaat', soorten: ['auto'], mogelijkheid: 'bron', niveau: 'gevoelig', naam: ['Клімат салону', 'Voorklimatiseren'] },
      { sleutel: 'garage.klimaatdoel', soorten: ['auto'], mogelijkheid: 'doel', niveau: 'gevoelig', naam: ['Температура салону', 'Temperatuur in de auto'] },
      { sleutel: 'garage.wekken', soorten: ['auto'], mogelijkheid: 'signaal', als: function (a, v) { return WEK.indexOf(v) >= 0; }, niveau: 'gewoon', naam: ['Розбудити авто', 'Auto wekken'] },
      { sleutel: 'garage.zoeken', soorten: V, mogelijkheid: 'signaal', niveau: 'gewoon', naam: ['Знайти: світло й звук', 'Zoeken: licht en geluid'] },
      { sleutel: 'garage.gestolen', soorten: V, mogelijkheid: 'stand', als: function (a, v) { return v === 'v-gestolen'; }, niveau: 'gevoelig', naam: ['Позначити викраденим', 'Markeren als gestolen'] },
      { sleutel: 'garage.gevonden', soorten: V, mogelijkheid: 'stand', niveau: 'gewoon', naam: ['Зняти позначку викрадення', 'Markering gestolen opheffen'] },
      { sleutel: 'garage.accunacht', soorten: TWEE, mogelijkheid: 'laden', als: function (a, v) { return !!v && isNacht(); }, niveau: 'gevaarlijk',
        naam: ['Заряджати акумулятор уночі', 'Accu ’s nachts laden'],
        gevolg: ['Що станеться: розумна розетка в гаражі ввімкнеться й заряджатиме акумулятор, поки всі сплять. Пов’язано з: хаб вимкне розетку за 45 °C, але це не пожежний захист. Як повернути: «Зупинити зарядку» — один дотик.', 'Wat er gebeurt: de slimme stekker in de garage gaat aan en laadt de accu terwijl iedereen slaapt. Hangt samen met: de hub zet de stekker uit bij 45 °C, maar dat is geen brandbeveiliging. Terugdraaien: ‘Laden stoppen’ — één tik.'],
        risico: RISICO('Що може статися: акумулятор грітиметься без нагляду вночі.', 'Wat er kan gebeuren: de accu wordt ’s nachts zonder toezicht warm.') },
      { sleutel: 'garage.acculaden', soorten: TWEE, mogelijkheid: 'laden', als: function (a, v) { return !!v; }, niveau: 'gevoelig', naam: ['Заряджати акумулятор удень', 'Accu overdag laden'] },
      { sleutel: 'garage.accustop', soorten: TWEE, mogelijkheid: 'laden', niveau: 'gewoon', naam: ['Зупинити зарядку акумулятора', 'Laden van de accu stoppen'] },
      { sleutel: 'garage.laadtot', soorten: TWEE, mogelijkheid: 'positie', niveau: 'gewoon', naam: ['Межа зарядки акумулятора', 'Laadgrens van de accu'] }
    ];
    var sleutels = G.acties.map(function (x) { return x.sleutel; });
    var plek = sleutels.indexOf('huis.stand');
    if (plek < 0) plek = G.acties.length;
    nieuw.filter(function (x) { return sleutels.indexOf(x.sleutel) < 0; }).forEach(function (x, i) { G.acties.splice(plek + i, 0, x); });
    // косарка вдень, коли в саду нікого, — чутлива; у темряві чи з людьми в саду лишається небезпечна (рядок ядра)
    if (sleutels.indexOf('garage.maaierdag') < 0) {
      var m = G.acties.map(function (x) { return x.sleutel; }).indexOf('maaier.start');
      G.acties.splice(m < 0 ? plek : m, 0, { sleutel: 'garage.maaierdag', soorten: ['maaier'], mogelijkheid: 'robot', als: function (a, v) { var w = HV.staat.w; return v === 'start' && !isDonker() && !(w && w.gar && w.gar.iemandInTuin); }, niveau: 'gevoelig', naam: ['Запустити косарку вдень', 'Robotmaaier overdag starten'] });
    }
    var WN = HV.waardeNaam || {};
    var NAMEN = {
      'v-alarm-aan': ['сигналізацію ввімкнено', 'alarm aan'], 'v-alarm-uit': ['сигналізацію вимкнено', 'alarm uit'],
      'v-klimaat-aan': ['клімат салону ввімкнено', 'voorklimatiseren aan'], 'v-klimaat-uit': ['клімат салону вимкнено', 'voorklimatiseren uit'],
      'v-ramen-open': ['вікна відчинено на 5 см', 'ramen 5 cm open'], 'v-ramen-dicht': ['вікна зачинено', 'ramen dicht'],
      'v-koffer-open': ['багажник відчинено', 'kofferbak open'], 'v-koffer-dicht': ['багажник зачинено', 'kofferbak dicht'],
      'v-gestolen': ['позначено викраденим', 'gemarkeerd als gestolen'], 'v-gevonden': ['позначку викрадення знято', 'markering gestolen opgeheven'],
      'z-stil': ['тихе прибирання', 'stil zuigen'], 'z-normaal': ['звичайна сила', 'normale zuigkracht'], 'z-max': ['максимальна сила', 'maximale zuigkracht']
    };
    for (var n in NAMEN) if (!(n in WN)) WN[n] = NAMEN[n];
  })();

  // ───────────────────────── 4. Стан зони у світі ─────────────────────────
  var dagBegin = function (ms) { return ms - (((ms % DAG) + DAG) % DAG); };
  var DAGEN = [['ma', ['Пн', 'Ma']], ['di', ['Вт', 'Di']], ['wo', ['Ср', 'Wo']], ['do', ['Чт', 'Do']], ['vr', ['Пт', 'Vr']], ['za', ['Сб', 'Za']], ['zo', ['Нд', 'Zo']]];
  var ZONES_MAAI = [
    { id: 'achter', naam: ['Газон за домом', 'Gazon achter het huis'], m2: 140, x: 20, y: 20, b: 132, hg: 72 },
    { id: 'terras', naam: ['Біля тераси', 'Bij het terras'], m2: 46, x: 158, y: 20, b: 64, hg: 72 },
    { id: 'voor', naam: ['Перед домом', 'Voor het huis'], m2: 38, x: 20, y: 174, b: 112, hg: 30 }
  ];
  var ZONES_WATER = [
    { id: 'achter', naam: ['Газон за домом', 'Gazon achter het huis'], x: 86, y: 56 },
    { id: 'moestuin', naam: ['Город', 'Moestuin'], x: 190, y: 56 },
    { id: 'voor', naam: ['Перед домом', 'Voor het huis'], x: 112, y: 189 }
  ];
  var STOF_KAMERS = ['woonkamer', 'keuken', 'hal', 'bijkeuken'];

  /** Поїздки за 7 діб — детерміновано від часу дому (сценарій будує новий світ). */
  function maakRitten(t0) {
    var d0 = dagBegin(t0), uit = [];
    var sjabloon = {
      ev: [[8.05, 0.3, 7.4, ['Дім → школа', 'Thuis → school']], [8.4, 0.3, 7.6, ['Школа → дім', 'School → thuis']], [13.1, 0.45, 12.8, ['Дім → ринок', 'Thuis → markt']], [17.6, 0.5, 14.1, ['Басейн і назад', 'Zwembad en terug']]],
      benzine: [[8.25, 0.45, 18.4, ['Дім → офіс', 'Thuis → kantoor']], [17.4, 0.55, 18.9, ['Офіс → дім', 'Kantoor → thuis']]],
      fietsolena: [[10.2, 0.4, 9.6, ['Парк Ваудестейн', 'Park Voorveldse Polder']]],
      fietstaras: [[19.0, 0.5, 14.2, ['Вечірня поїздка', 'Avondrit']]],
      step: [[16.1, 0.2, 3.1, ['До станції', 'Naar het station']]],
      bromfiets: [[11.0, 0.3, 11.5, ['До майстерні', 'Naar de werkplaats']]]
    };
    Object.keys(sjabloon).forEach(function (id) {
      for (var d = 0; d < 7; d++) {
        sjabloon[id].forEach(function (s, i) {
          if ((d + i + id.length) % 3 === 2 && d > 0) return; // не щодня кожна поїздка
          var van = d0 - d * DAG + s[0] * UUR;
          if (van + s[1] * UUR > t0) return;
          var km = Math.round(s[2] * (0.9 + ((d * 7 + i * 3 + id.length) % 5) * 0.05) * 10) / 10;
          uit.push({ id: id + '-' + d + '-' + i, voertuig: id, van: van, tot: van + s[1] * UUR, km: km, naam: s[3] });
        });
      }
    });
    return uit.sort(function (a, b) { return b.van - a.van; });
  }

  function zorg(w) {
    if (w.gar) return w.gar;
    var t0 = w.tijd, d0 = dagBegin(t0);
    var vertrek = d0 + 8.25 * UUR;
    if (vertrek + 0.45 * UUR > t0) vertrek -= DAG;
    var leeg = function (waarde) { var x = {}; VOERTUIGEN.forEach(function (id) { x[id] = waarde; }); return x; };
    w.gar = {
      vorige: null,
      stofKamers: ['woonkamer', 'keuken', 'hal'],
      maaiZones: ['achter', 'terras', 'voor'],
      pauze: { regen: true, donker: true, iemand: true },
      iemandInTuin: false,
      beregZones: ['achter', 'moestuin', 'voor'], beregDuur: 10, regenStop: true,
      rooster: { stofzuiger: ['ma', 'wo', 'vr'], maaier: ['di', 'do', 'za'], beregening: ['ma', 'do'] },
      roosterTijd: { stofzuiger: '10:00', maaier: '11:00', beregening: '06:30' },
      volgen: leeg(true), zicht: leeg('eigenaar'),
      vertrekBenzine: vertrek, aankomstBenzine: vertrek + 0.45 * UUR,
      wakkerTot: null, ritten: maakRitten(t0), motorWeigering: 0
    };
    return w.gar;
  }
  HV.garageStaat = zorg;

  // ── Літопис налаштувань зони: той самий Журнал і ті самі сповіщення, що в ядрі ──
  var SYS = { soort: 'systeem', naam: ['Гараж', 'Garage'] };
  var SIM = { soort: 'simulator', naam: ['Симулятор', 'Simulator'] };
  function noteer(e) {
    var r = HV.logboek.voegToe({ maker: e.maker || HV.mens(), wat: e.wat, waarom: e.waarom, was: e.was, werd: e.werd, soort: e.soort || 'huis.voertuig', gewicht: e.gewicht, doel: e.doel });
    if (!e.stil) HV.meld({ maker: e.maker || HV.mens(), icoon: e.icoon || 'car', gewicht: e.gewicht === 'belangrijk' ? 'belangrijk' : 'info', titel: HV.p(e.wat), tekst: e.tekst ? HV.p(e.tekst) : (e.was && e.werd ? HV.p(e.was) + ' → ' + HV.p(e.werd) : ''), terug: e.terug || null });
    HV.staat.wijzig();
    return r;
  }
  /** Чи може людина змінити налаштування зони цього рівня (як ворота ролі в HV.doe). */
  function magMens(niveau) {
    var mag = HV.gevaar.rolMag(HV.rol(), { niveau: niveau || 'gevoelig' });
    if (!mag.mag) HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(mag.reden), tekst: t('Попросіть власника або мешканця.', 'Vraag het de eigenaar of een bewoner.') });
    return mag.mag;
  }

  // ───────────────────────── 5. Життя зони (крок після кожної зміни світу) ─────────────────────────
  var BRON_SNELHEID = { fiets: 26, step: 34, bromfiets: 16 }; // % за годину від розетки
  function leven(w) {
    if (!w || !w.apparaten || !w.apparaten.ev || !w.voertuigen) return;
    var g = zorg(w), A = w.apparaten;
    var dt = g.vorige == null ? 0 : w.tijd - g.vorige;
    g.vorige = w.tijd;
    if (w.gegevens !== 'live') return;
    // правила (паузи, сон авто) діють і на паузі часу; хід (заряд, прогрес) — лише коли час іде
    var uren = dt > 0 && dt <= 6 * UUR ? dt / UUR : 0;
    // 1. акумулятори двоколісних від розумної розетки: межа зарядки, температура, вимкнення за 45 °C
    w.voertuigen.forEach(function (v) {
      var a = A[v.id];
      if (!a || TWEE.indexOf(a.soort) < 0) return;
      var st = a.st, grens = Number(st.positie) || 80;
      if (st.laadt) {
        v.lading = Math.min(100, v.lading + BRON_SNELHEID[a.soort] * uren);
        st.temp = Math.min(46, st.temp + (31 - st.temp) * Math.min(1, uren * 3));
        if (st.temp >= 45) {
          st.laadt = false;
          HV.logboek.voegToe({ maker: SYS, wat: [a.naam[0] + ': розетку вимкнено за 45 °C', a.naam[1] + ': stekker uit bij 45 °C'], waarom: ['межа температури акумулятора', 'temperatuurgrens van de accu'], soort: 'huis.voertuig', gewicht: 'belangrijk', doel: a.id });
        } else if (v.lading >= grens) {
          v.lading = Math.max(v.lading, grens); st.laadt = false;
          HV.logboek.voegToe({ maker: SYS, wat: [a.naam[0] + ': заряджено до ' + grens + ' %', a.naam[1] + ': geladen tot ' + grens + ' %'], waarom: ['межа зарядки, розетку вимкнено', 'laadgrens bereikt, stekker uit'], soort: 'huis.voertuig', doel: a.id });
        }
      } else st.temp = Math.max(14, st.temp - (st.temp - 14) * Math.min(1, uren * 2));
      v.bereik = Math.round(v.lading * ({ fiets: 0.78, step: 0.26, bromfiets: 0.66 })[a.soort]);
    });
    // 2. клімат салону: тягнеться до цілі; через 30 хв вимикається сам
    var ev = A.ev;
    if (ev) {
      var doel = ev.st.bron === 'v-klimaat-aan' ? Number(ev.st.doel) : w.weer.temp + 2.5;
      ev.st.binnen = Math.round((ev.st.binnen + (doel - ev.st.binnen) * Math.min(1, uren * (ev.st.bron === 'v-klimaat-aan' ? 6 : 0.8))) * 10) / 10;
      if (ev.st.bron === 'v-klimaat-aan' && ev.maker && w.tijd - ev.maker.tijd > 30 * MIN && !ev.wacht) {
        ev.st.bron = 'v-klimaat-uit';
        HV.logboek.voegToe({ maker: SYS, wat: ['Електромобіль: клімат салону вимкнено', 'Elektrische auto: voorklimatiseren uit'], waarom: ['минуло 30 хв', '30 min voorbij'], soort: 'huis.voertuig', doel: 'ev' });
      }
    }
    // 3. бензинове авто після «Розбудити» знову засинає за 10 хв
    var bz = A.benzine;
    if (bz && g.wakkerTot && w.tijd > g.wakkerTot && bz.beschikbaar === 'ok') { bz.beschikbaar = 'slaapt'; g.wakkerTot = null; }
    // 4. пилосос: кімнати по черзі, заряд, завершення
    var sz = A.stofzuiger;
    if (sz) {
      var kamers = g.stofKamers.length ? g.stofKamers : STOF_KAMERS;
      if (sz.st.stand === 'bezig' && !sz.st.fout) {
        sz.st.voortgang = Math.min(100, sz.st.voortgang + uren * 60 / (kamers.length * 11) * 100);
        sz.st.lading = Math.max(5, sz.st.lading - uren * 70);
        sz.st.kamerNu = kamers[Math.min(kamers.length - 1, Math.floor(sz.st.voortgang / 100 * kamers.length))];
        if (sz.st.voortgang >= 100) {
          sz.st.stand = 'dock'; sz.st.voortgang = 0; sz.st.kamerNu = null; sz.st.klaar = w.tijd;
          HV.logboek.voegToe({ maker: SYS, wat: ['Пилосос: прибирання завершено', 'Robotstofzuiger: klaar met zuigen'], waarom: [kamers.length + ' ' + HV.meervoud(kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']), kamers.length + ' ' + (kamers.length === 1 ? 'kamer' : 'kamers')], soort: 'huis.apparaat', doel: 'stofzuiger' });
        }
      } else if (sz.st.stand === 'dock') { sz.st.lading = Math.min(100, sz.st.lading + uren * 80); sz.st.kamerNu = null; }
    }
    // 5. косарка: паузи «дощ · темно · хтось у саду» за правилами; відновлення, коли причина минула
    var mr = A.maaier;
    if (mr) {
      var reden = g.pauze.regen && w.weer.neerslag ? 'regen' : g.pauze.donker && isDonker() ? 'donker' : g.pauze.iemand && g.iemandInTuin ? 'iemand' : null;
      if (mr.st.stand === 'bezig') {
        if (reden && !mr.wacht) {
          mr.st.stand = 'pauze'; mr.st.pauzeReden = reden;
          HV.logboek.voegToe({ maker: SYS, wat: ['Косарка: пауза — ' + HV.p(PAUZE[reden].naam).toLowerCase(), 'Robotmaaier: pauze — ' + PAUZE[reden].naam[1].toLowerCase()], waarom: ['правило паузи', 'pauzeregel'], soort: 'huis.apparaat', doel: 'maaier' });
        } else {
          mr.st.voortgang = Math.min(100, mr.st.voortgang + uren * 60 / 50 * 100);
          mr.st.lading = Math.max(8, mr.st.lading - uren * 60);
          if (mr.st.voortgang >= 100) {
            mr.st.stand = 'dock'; mr.st.voortgang = 0; mr.st.klaar = w.tijd;
            HV.logboek.voegToe({ maker: SYS, wat: ['Косарка: скошено, на базі', 'Robotmaaier: klaar, in het station'], soort: 'huis.apparaat', doel: 'maaier' });
          }
        }
      } else if (mr.st.stand === 'pauze' && mr.st.pauzeReden && !reden && !mr.wacht) {
        var was = mr.st.pauzeReden;
        mr.st.stand = 'bezig'; mr.st.pauzeReden = null;
        HV.logboek.voegToe({ maker: SYS, wat: ['Косарка: продовжує', 'Robotmaaier: gaat verder'], waarom: ['причина паузи минула: ' + HV.p(PAUZE[was].naam).toLowerCase(), 'pauzereden voorbij: ' + PAUZE[was].naam[1].toLowerCase()], soort: 'huis.apparaat', doel: 'maaier' });
      } else if (mr.st.stand === 'dock') { mr.st.lading = Math.min(100, mr.st.lading + uren * 50); if (!reden) mr.st.pauzeReden = null; }
      if (mr.st.stand !== 'pauze' && mr.st.stand !== 'bezig') mr.st.pauzeReden = null;
    }
    // 6. полив: зони по черзі, хвилини, завершення
    var br = A.beregening;
    if (br) {
      if (br.st.aan) {
        var zones = g.beregZones.length ? g.beregZones : ['achter'];
        var totaal = zones.length * g.beregDuur;
        if (br.st.rest == null) br.st.rest = totaal;
        br.st.rest = Math.max(0, br.st.rest - uren * 60);
        br.st.zoneNu = zones[Math.min(zones.length - 1, Math.floor((totaal - br.st.rest) / g.beregDuur))];
        if (br.st.rest <= 0) {
          br.st.aan = false; br.st.rest = null; br.st.zoneNu = null; br.st.overgeslagen = false;
          HV.logboek.voegToe({ maker: SYS, wat: ['Полив саду: завершено', 'Beregening: klaar'], waarom: [zones.length + ' ' + HV.meervoud(zones.length, ['зона', 'зони', 'зон'], ['zone', 'zones']) + ' × ' + g.beregDuur + ' хв', zones.length + ' ' + (zones.length === 1 ? 'zone' : 'zones') + ' × ' + g.beregDuur + ' min'], soort: 'huis.apparaat', doel: 'beregening' });
        }
      } else { br.st.rest = null; br.st.zoneNu = null; }
    }
  }
  if (HV.staat && HV.staat.abonneer) HV.staat.abonneer(leven);

  // ───────────────────────── 6. Дрібні будівельні блоки ─────────────────────────
  var app = function (id) { return HV.staat.w.apparaten[id] || null; };
  var vtg = function (id) { var l = HV.staat.w.voertuigen; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
  var isTwee = function (a) { return TWEE.indexOf(a.soort) >= 0; };
  /** Аркуш стоїть поруч зі сторінкою цього ж пристрою (від 900 px аркуш немодальний): головна дія вже має заливку на сторінці. */
  var opEigenPagina = function (ctx, a) { var r = (ctx && ctx.route) || (HV.route ? HV.route() : null); return !!r && r.scherm === 'garage' && r.object === a.id && !!ctx.profiel && ctx.profiel.breedte >= 900; };
  /** Чи триває «Розбудити»: команду надіслано, авто ще не відповіло. */
  var wektNu = function (a) { return !!(a.wacht && a.wacht.mogelijkheid === 'signaal' && WEK.indexOf(a.wacht.waarde) >= 0); };
  var icoonVan = function (a) { return HV.paspoort.soorten[a.soort] ? HV.paspoort.soorten[a.soort].icoon : 'car'; };
  var kop = function (icoon, titel, extra, toon) {
    return '<header class="hv-gar-kop' + (toon ? ' hv-toon-' + toon : '') + '"><h3>' + HV.icoon(icoon, { maat: 's' }) + '<span>' + h(titel) + '</span></h3>' + (extra ? '<span class="hv-gar-kop__rechts">' + extra + '</span>' : '') + '</header>';
  };
  var kaart = function (klas, inhoud, k) { return '<section class="hv-kaart hv-gar-kaart' + (klas ? ' ' + klas : '') + '"' + (k ? ' data-k="' + h(k) + '"' : '') + '>' + inhoud + '</section>'; };
  var veld = function (label, html, extra) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };
  var naar = function (tekst, adres, icoon) { return o.knop({ tekst: tekst, icoon: icoon, soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: adres } }); };
  var nb = function (delen) { return delen.filter(Boolean).map(function (d) { return '<span class="hv-gar-stuk">' + d + '</span>'; }).join('<span class="hv-gar-punt" aria-hidden="true">·</span>'); };
  var km = function (n) { return HV.maat(n, t('км', 'km')); };
  var wanneer = function (ms) {
    var w = HV.staat.w, d = Math.round((dagBegin(w.tijd) - dagBegin(ms)) / DAG);
    if (d <= 0) return HV.tijd(ms);
    if (d === 1) return t('учора ', 'gisteren ') + HV.tijd(ms);
    return HV.datumKort(ms) + ' ' + HV.tijd(ms);
  };
  var gewenst = function (a, m) { return HV.gewenst(a, m); };
  var sim = function () { return '<span class="hv-gar-sim">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('симуляція', 'simulatie')) + '</span>'; };

  /** Де стоїть транспорт зараз (або в мить tijd для «Перегляду минулого»). */
  function plekVan(v, tijd) {
    var g = zorg(HV.staat.w);
    if (v.id === 'benzine') {
      var x = tijd == null ? HV.staat.w.tijd : tijd;
      var vertrek = g.vertrekBenzine, aankomst = g.aankomstBenzine;
      while (x < vertrek && vertrek - x > DAG - 1) { vertrek -= DAG; aankomst -= DAG; }
      if (x < vertrek) return { id: 'oprit2', rijdt: false };
      if (x < aankomst) return { id: 'onderweg', rijdt: true, deel: (x - vertrek) / (aankomst - vertrek) };
      return { id: 'kantoor', rijdt: false };
    }
    return { id: v.plek === 'oprit' ? 'oprit' : v.plek === 'onderweg' ? 'onderweg' : 'garage', rijdt: false };
  }
  var PLEK_NAAM = {
    oprit: ['на під’їзді', 'op de oprit'], oprit2: ['на під’їзді', 'op de oprit'], garage: ['у гаражі', 'in de garage'],
    kantoor: ['біля офісу, Ньївегейн', 'bij kantoor, Nieuwegein'], onderweg: ['у дорозі', 'onderweg']
  };
  var thuisPlek = function (p) { return p.id === 'oprit' || p.id === 'oprit2' || p.id === 'garage'; };

  /** Стан транспорту словом: «заряджається», «спить», «у дорозі», «замкнено». */
  function standVan(a, v) {
    var w = HV.staat.w;
    if (a.st.stand === 'v-gestolen') return { woord: t('позначено викраденим', 'gemarkeerd als gestolen'), toon: 'alarm', icoon: 'siren' };
    if (a.id === 'ev' && w.apparaten.laadpaal.st.laadt) return { woord: HV.woord.laadt() + ' · ' + HV.maatTekst(w.apparaten.laadpaal.st.vermogen, t('кВт', 'kW'), 1), toon: 'auto', icoon: 'battery-charging' };
    if (isTwee(a) && a.st.laadt) return { woord: HV.woord.laadt() + t(' від розетки', ' via de stekker'), toon: 'batterij', icoon: 'battery-charging' };
    if (wektNu(a)) return { woord: t('будимо · очікує відповіді', 'wordt gewekt · wacht op antwoord'), toon: null, icoon: 'loader' };
    if (a.beschikbaar === 'slaapt') return { woord: HV.woord.slaapt() + ' · ' + HV.oud(HV.kijk.leeftijd(a)), toon: null, icoon: 'moon' };
    var p = plekVan(v);
    if (p.rijdt) return { woord: t('у дорозі', 'onderweg'), toon: null, icoon: 'navigation' };
    return { woord: HV.p(PLEK_NAAM[p.id]), toon: null, icoon: thuisPlek(p) ? 'house' : 'map-pin' };
  }

  // ── Плитка транспорту в чужих списках (Кімнати › Гараж, Пристрої): знак — замок (ритуал вирішує матриця) ──
  var beeldKern = o.beeld;
  o.beeld = function (a) {
    if (VSOORTEN.indexOf(a.soort) >= 0) {
      var v = vtg(a.id) || { lading: 0 };
      var dicht = !!a.st.vergrendeld;
      return { icoon: dicht ? 'lock-keyhole' : 'lock-keyhole-open', toon: null, aan: !dicht, woord: dicht ? HV.woord.vergrendeld() : HV.woord.ontgrendeld(),
        waarde: a.id === 'benzine' ? HV.maat(v.brandstof, '%') : HV.maat(Math.round(v.lading), '%'), niveau: null, schakel: { mogelijkheid: 'vergrendeld' }, kritiek: false, passief: false };
    }
    var b = beeldKern(a);
    if (a.soort === 'stofzuiger' && a.st.fout) { b.woord = t('застряг', 'vast'); b.toon = 'let-op'; }
    else if (a.soort === 'maaier' && a.st.stand === 'pauze' && a.st.pauzeReden) b.woord = t('пауза: ', 'pauze: ') + HV.p(PAUZE[a.st.pauzeReden].naam).toLowerCase();
    else if (a.soort === 'beregening' && a.st.aan && a.st.rest != null) b.woord = t('поливає · ще ', 'sproeit · nog ') + HV.duur(a.st.rest);
    return b;
  };

  // ───────────────────────── 7. Силует авто (hv-silhouet) ─────────────────────────
  // Вигляд згори; невиміряне заштриховано. Тиск шин — HTML-підписи по кутах (читаються від 12 px, не масштабуються).
  var NORM_BAND = 2.5;
  function silhouet(a) {
    var st = a.st, banden = st.banden || [], slaapt = a.beschikbaar === 'slaapt';
    var bandKlas = function (i) { return banden[i] == null ? ' is-onbekend' : banden[i] < NORM_BAND - 0.35 ? ' is-laag' : ''; };
    var ramenOpen = st.effect === 'v-ramen-open', kofferOpen = st.ventilator === 'v-koffer-open';
    var laadt = a.id === 'ev' && HV.staat.w.apparaten.laadpaal.st.laadt;
    var slot = st.vergrendeld ? 'lock-keyhole' : 'lock-keyhole-open';
    var svg = '<svg class="hv-gar-sil__svg" viewBox="0 0 120 210" role="img" aria-label="' + h(t('Силует авто згори: замок, вікна, багажник, шини', 'Silhouet van de auto van boven: slot, ramen, kofferbak, banden')) + '">' +
      '<defs><pattern id="hv-gar-arc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path class="hv-gar-arc" d="M0 0V6"/></pattern></defs>' +
      [[13, 38], [95, 38], [13, 140], [95, 140]].map(function (p, i) { return '<rect class="hv-gar-sil__band' + bandKlas(i) + '" x="' + p[0] + '" y="' + p[1] + '" width="12" height="30" rx="4"/>'; }).join('') +
      '<rect class="hv-gar-sil__romp" x="22" y="8" width="76" height="194" rx="28"/>' +
      '<path class="hv-gar-sil__ruit' + (slaapt ? ' is-onbekend' : '') + '" d="M31 60 Q60 48 89 60 L85 77 Q60 69 35 77 Z"/>' +
      '<rect class="hv-gar-sil__dak" x="35" y="80" width="50" height="64" rx="8"/>' +
      '<path class="hv-gar-sil__ruit' + (slaapt ? ' is-onbekend' : '') + '" d="M35 148 Q60 154 85 148 L89 160 Q60 168 31 160 Z"/>' +
      '<path class="hv-gar-sil__zij' + (ramenOpen ? ' is-open' : '') + '" d="M27 82 V142 M93 82 V142"/>' +
      '<path class="hv-gar-sil__lijn" d="M22 112 h8 M90 112 h8"/>' +
      '<path class="hv-gar-sil__koffer' + (kofferOpen ? ' is-open' : '') + '" d="' + (kofferOpen ? 'M30 178 Q60 196 90 178' : 'M30 172 Q60 180 90 172') + '"/>' +
      '<path class="hv-gar-sil__lijn" d="M34 26 Q60 18 86 26"/>' +
      (laadt ? '<circle class="hv-gar-sil__laad" cx="24" cy="170" r="6"/>' : '') +
      '<svg x="48" y="100" width="24" height="24" viewBox="0 0 24 24" class="hv-gar-sil__slot' + (st.vergrendeld ? '' : ' is-open') + '"><use href="#hv-i-' + slot + '"/></svg>' +
      '</svg>';
    var label = function (i, klas) {
      var b = banden[i];
      return '<span class="hv-gar-sil__druk ' + klas + bandKlas(i) + '">' + (b == null ? '—' : HV.maat(b, t('бар', 'bar'), 1)) + (b != null && b < NORM_BAND - 0.35 ? '<span class="hv-gar-sil__norm">' + h(t('норма ', 'norm ') + HV.getal(NORM_BAND, 1)) + '</span>' : '') + '</span>';
    };
    var legenda = '<ul class="hv-gar-sil__legenda">' +
      '<li>' + HV.icoon(slot, { maat: 's' }) + h(st.vergrendeld ? t('замкнено', 'vergrendeld') : t('відімкнено', 'ontgrendeld')) + '</li>' +
      '<li>' + HV.icoon(ramenOpen ? 'wind' : 'square', { maat: 's' }) + h(ramenOpen ? t('вікна на 5 см', 'ramen 5 cm open') : t('вікна зачинено', 'ramen dicht')) + '</li>' +
      '<li>' + HV.icoon('package-open', { maat: 's' }) + h(kofferOpen ? t('багажник відчинено', 'kofferbak open') : t('багажник зачинено', 'kofferbak dicht')) + '</li>' +
      (slaapt ? '<li class="is-onbekend"><span class="hv-gar-sil__arcering" aria-hidden="true"></span>' + h(t('заштриховано — не виміряно, авто спить', 'gearceerd — niet gemeten, de auto slaapt')) + '</li>' : '') + '</ul>';
    return '<div class="hv-gar-sil" data-k="sil-' + h(a.id) + '">' + label(0, 'is-lv') + label(1, 'is-rv') + svg + label(2, 'is-la') + label(3, 'is-ra') + '</div>' + legenda;
  }

  // ───────────────────────── 8. Мапа (hv-landkaart): Ділянка, Околиці, Регіон ─────────────────────────
  // Фігури — SVG із незмінною товщиною штриха; підписи й маркери — HTML поверх, у відсотках від сітки: текст лишається
  // 12–14 px на будь-якій ширині, ціль дотику — завжди 44 px.
  var PERCEEL = { b: 360, h: 240 };
  var BUURT = { b: 400, h: 300, cx: 200, cy: 150, perKm: 20 };
  var REGIO = { b: 400, h: 300, cx: 200, cy: 150, perKm: 1 };
  var GEOZONES = [
    { id: 'thuis', naam: ['Дім', 'Thuis'], x: 0, y: 0, r: 0.15 },
    { id: 'school', naam: ['Школа', 'School'], x: -3.6, y: -2.4, r: 0.35 },
    { id: 'sport', naam: ['Басейн', 'Zwembad'], x: 4.1, y: -3.3, r: 0.3 },
    { id: 'kantoor', naam: ['Офіс Тараса', 'Kantoor van Taras'], x: 3.6, y: 5.2, r: 0.45, links: true }
  ];
  var STEDEN = [
    { naam: ['Амстердам', 'Amsterdam'], x: -14, y: -34 }, { naam: ['Роттердам', 'Rotterdam'], x: -42, y: 14 }, { naam: ['Гаага', 'Den Haag'], x: -58, y: -8, links: true },
    { naam: ['Арнем', 'Arnhem'], x: 55, y: 6 }, { naam: ['Ейндговен', 'Eindhoven'], x: 18, y: 78 }, { naam: ['Неймеген', 'Nijmegen'], x: 60, y: 30 },
    { naam: ['Антверпен', 'Antwerpen'], x: -40, y: 98 }, { naam: ['Зволле', 'Zwolle'], x: 62, y: -66 }, { naam: ['Алкмар', 'Alkmaar'], x: -30, y: -70 }
  ];
  var ROUTE = [[0, 0], [0.6, 0.9], [1.4, 1.6], [2.0, 3.0], [2.9, 4.2], [3.6, 5.2]];
  function opRoute(deel) {
    var lengtes = [], som = 0;
    for (var i = 1; i < ROUTE.length; i++) { var l = Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]); lengtes.push(l); som += l; }
    var doel = Math.max(0, Math.min(1, deel)) * som;
    for (var j = 0; j < lengtes.length; j++) {
      if (doel <= lengtes[j]) { var f = doel / lengtes[j]; return [ROUTE[j][0] + (ROUTE[j + 1][0] - ROUTE[j][0]) * f, ROUTE[j][1] + (ROUTE[j + 1][1] - ROUTE[j][1]) * f]; }
      doel -= lengtes[j];
    }
    return ROUTE[ROUTE.length - 1];
  }

  /**
   * hv-landkaart. opties: { schaal:'perceel'|'buurt'|'regio', lagen:{…}, tijd (для «Перегляду минулого»), nadruk (id транспорту),
   *   passief (без кнопок — уся мапа сама є посиланням) }
   */
  function landkaart(ctx, op) {
    var w = ctx.staat, g = zorg(w), A = w.apparaten;
    var lagen = op.lagen || { voertuigen: true, geozones: true, bereik: true, robots: true, routes: true };
    var tijd = op.tijd == null ? w.tijd : op.tijd, verleden = tijd < w.tijd - MIN;
    var VB = op.schaal === 'perceel' ? PERCEEL : op.schaal === 'regio' ? REGIO : BUURT;
    var delen = [], boven = [], titel;
    var plek = function (x, y) { return 'left:' + (x / VB.b * 100).toFixed(2) + '%;top:' + (y / VB.h * 100).toFixed(2) + '%'; };
    var label = function (x, y, s, klas) { boven.push('<span class="hv-gar-kaart__label' + (klas ? ' ' + klas : '') + '" style="' + plek(x, y) + '">' + h(s) + '</span>'); };
    var merk = function (x, y, icoon, naam, blad, klas, teller) {
      var binnen = '<span class="hv-gar-merk__stip">' + HV.icoon(icoon, { maat: 's' }) + '</span>' + (teller ? '<span class="hv-gar-merk__teller">' + h(teller) + '</span>' : '');
      if (!blad || op.passief) boven.push('<span class="hv-gar-merk' + (klas ? ' ' + klas : '') + '" style="' + plek(x, y) + '" aria-hidden="true">' + binnen + '</span>');
      else boven.push('<button type="button" class="hv-gar-merk is-knop' + (klas ? ' ' + klas : '') + '" style="' + plek(x, y) + '" aria-label="' + h(naam) + '" data-actie="' + (blad.indexOf(':') > 0 ? 'blad' : 'ga') + '" data-' + (blad.indexOf(':') > 0 ? 'blad' : 'naar') + '="' + h(blad) + '">' + binnen + '</button>');
    };
    if (op.schaal === 'perceel') {
      titel = t('Схема ділянки: дім, гараж, сад, док дронів, межа польоту, зони косарки й поливу, транспорт', 'Schema van het perceel: huis, garage, tuin, dronedock, vlieggrens, zones van maaier en beregening, voertuigen');
      delen.push('<rect class="hv-gar-kaart__straat" x="0" y="216" width="360" height="24"/>');
      label(14, 228, 'Wilgenlaan', 'is-straat');
      delen.push('<rect class="hv-gar-kaart__vlieg" x="4" y="4" width="352" height="208" rx="10"/>');
      delen.push('<rect class="hv-gar-kaart__perceel" x="12" y="12" width="336" height="198" rx="6"/>');
      ZONES_MAAI.forEach(function (z) {
        var aan = g.maaiZones.indexOf(z.id) >= 0;
        delen.push('<rect class="hv-gar-kaart__gras' + (aan && lagen.robots ? ' is-gekozen' : '') + (A.maaier && A.maaier.st.stand === 'bezig' && aan ? ' is-bezig' : '') + '" x="' + z.x + '" y="' + z.y + '" width="' + z.b + '" height="' + z.hg + '" rx="6"/>');
      });
      if (lagen.robots) ZONES_WATER.forEach(function (z) {
        var nu = A.beregening && A.beregening.st.zoneNu === z.id;
        delen.push('<circle class="hv-gar-kaart__sproei' + (nu ? ' is-bezig' : '') + (g.beregZones.indexOf(z.id) >= 0 ? '' : ' is-uit') + '" cx="' + z.x + '" cy="' + z.y + '" r="' + (nu ? 20 : 14) + '"/>');
      });
      delen.push('<rect class="hv-gar-kaart__huis" x="20" y="100" width="150" height="66" rx="4"/>');
      label(95, 133, t('Дім', 'Huis'), 'is-midden is-kop');
      delen.push('<rect class="hv-gar-kaart__huis" x="228" y="92" width="76" height="76" rx="4"/>');
      label(266, 102, t('Гараж', 'Garage'), 'is-midden');
      delen.push('<rect class="hv-gar-kaart__oprit" x="232" y="168" width="68" height="48"/>');
      delen.push('<rect class="hv-gar-kaart__terras" x="228" y="20" width="76" height="56" rx="4"/>');
      label(266, 48, t('Город', 'Moestuin'), 'is-midden');
      delen.push('<rect class="hv-gar-kaart__dock" x="314" y="108" width="26" height="26" rx="5"/>');
      merk(327, 121, 'drone', t('Док дронів', 'Dronedock'), 'garage-drones', 'is-dock');
      label(327, 150, t('док дронів', 'dronedock'), 'is-midden is-klein is-breed');
      if (lagen.robots) ZONES_MAAI.forEach(function (z) { label(z.x + 8, z.y + 11, HV.p(z.naam), 'is-klein is-zone'); });
      if (lagen.robots) {
        var mx = 34, my = 82;
        if (A.maaier && (A.maaier.st.stand === 'bezig' || A.maaier.st.stand === 'pauze')) { var p = A.maaier.st.voortgang / 100; mx = 34 + (p * 5 % 1) * 100; my = 34 + Math.floor(p * 5) * 10; }
        merk(mx, my, 'garage-maaier', HV.p(A.maaier.naam), 'apparaat:maaier', A.maaier.st.stand === 'bezig' ? 'is-bezig' : '');
      }
      if (lagen.voertuigen) {
        var pb = plekVan(vtg('benzine'), tijd);
        merk(250, 192, 'car', HV.p(A.ev.naam), 'apparaat:ev', op.nadruk === 'ev' ? 'is-nadruk' : '');

        if (!op.passief && pb.id !== 'oprit2') label(271, 192, Math.round(vtg('ev').lading) + ' %', 'is-pil');
        if (pb.id === 'oprit2') merk(288, 192, 'car', HV.p(A.benzine.naam), 'apparaat:benzine', 'is-verleden' + (op.nadruk === 'benzine' ? ' is-nadruk' : ''));
        var twee = VOERTUIGEN.filter(function (id) { return isTwee(A[id]); });
        var nadrukTwee = twee.indexOf(op.nadruk) >= 0 ? op.nadruk : null;
        merk(266, 138, nadrukTwee ? icoonVan(A[nadrukTwee]) : 'bike', t('Двоколісні в гаражі: ', 'Tweewielers in de garage: ') + twee.length, nadrukTwee ? 'apparaat:' + nadrukTwee : 'garage-voertuigen', nadrukTwee ? 'is-nadruk' : '', nadrukTwee ? null : String(twee.length));
      }
      return '<div class="hv-gar-kaartvlak is-perceel" style="aspect-ratio:' + VB.b + ' / ' + VB.h + '"><svg class="hv-gar-kaart__svg" viewBox="0 0 ' + VB.b + ' ' + VB.h + '" preserveAspectRatio="none" role="img" aria-label="' + h(titel) + '">' + delen.join('') + '</svg>' + boven.join('') + '</div>';
    }
    var M = VB;
    var P = function (xkm, ykm) { return [Math.round((M.cx + xkm * M.perKm) * 10) / 10, Math.round((M.cy + ykm * M.perKm) * 10) / 10]; };
    titel = op.schaal === 'regio' ? t('Схема регіону: кільця досяжності транспорту від дому', 'Schema van de regio: bereikringen van de voertuigen vanaf huis') : t('Схема околиць: дороги, геозони, транспорт', 'Schema van de omgeving: wegen, geozones, voertuigen');
    delen.push('<rect class="hv-gar-kaart__land" x="0" y="0" width="' + M.b + '" height="' + M.h + '"/>');
    if (op.schaal === 'regio') {
      delen.push('<path class="hv-gar-kaart__zee" d="M0 0 H86 Q74 70 52 128 Q34 200 0 252 Z"/>');
      STEDEN.forEach(function (s) { var p = P(s.x, s.y); delen.push('<circle class="hv-gar-kaart__stad" cx="' + p[0] + '" cy="' + p[1] + '" r="3"/>'); label(s.links ? p[0] - 6 : p[0] + 6, p[1], HV.p(s.naam), 'is-klein' + (s.links ? ' is-eind' : '')); });
      if (lagen.bereik) {
        var ev = vtg('ev');
        delen.push('<circle class="hv-gar-kaart__ring is-auto" cx="' + M.cx + '" cy="' + M.cy + '" r="' + Math.round(ev.bereik * M.perKm) + '"/>');
        delen.push('<circle class="hv-gar-kaart__ring is-auto is-heen" cx="' + M.cx + '" cy="' + M.cy + '" r="' + Math.round(ev.bereik / 2 * M.perKm) + '"/>');
        var vo = vtg('fietsolena');
        delen.push('<circle class="hv-gar-kaart__ring is-twee" cx="' + M.cx + '" cy="' + M.cy + '" r="' + Math.max(4, Math.round(vo.bereik * M.perKm)) + '"/>');
        label(M.cx, M.cy - Math.round(ev.bereik / 2 * M.perKm) + 10, t('туди й назад ', 'heen en terug ') + Math.round(ev.bereik / 2) + t(' км', ' km'), 'is-midden is-ring');
        label(M.cx, M.cy - Math.round(vo.bereik * M.perKm) + 10, t('велосипед ', 'e-bike ') + Math.round(vo.bereik) + t(' км', ' km'), 'is-midden is-klein');
        label(8, M.h - 14, t('в один бік ', 'enkele reis ') + Math.round(ev.bereik) + t(' км — за краєм схеми', ' km — buiten het schema'), 'is-klein is-ring');
      }
      delen.push('<rect class="hv-gar-kaart__schaal" x="' + (M.b - 112) + '" y="' + (M.h - 16) + '" width="' + Math.round(100 * M.perKm) + '" height="3"/>');
      label(M.b - 112, M.h - 26, t('100 км', '100 km'), 'is-klein');
    } else {
      [[[-10, 0], [10, 0]], [[0, -8], [0, 8]], [[-10, -5], [10, 6]], [[-6, 8], [7, -8]]].forEach(function (l) { var a = P(l[0][0], l[0][1]), b = P(l[1][0], l[1][1]); delen.push('<path class="hv-gar-kaart__weg" d="M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1] + '"/>'); });
      delen.push('<path class="hv-gar-kaart__water" d="M0 ' + (M.h - 64) + ' Q120 ' + (M.h - 96) + ' 220 ' + (M.h - 44) + ' T400 ' + (M.h - 74) + '"/>');
      if (lagen.bereik) ['step', 'fietstaras'].forEach(function (id) {
        var v = vtg(id), rr = Math.round(v.bereik / 2 * M.perKm);
        delen.push('<circle class="hv-gar-kaart__ring is-twee" cx="' + M.cx + '" cy="' + M.cy + '" r="' + rr + '"/>');
        if (rr < M.cy - 12) label(M.cx, M.cy - rr - 9, HV.p(A[id].naam) + t(': туди й назад ', ': heen en terug ') + Math.round(v.bereik / 2) + t(' км', ' km'), 'is-midden is-klein is-ring');
      });
      if (lagen.geozones) GEOZONES.forEach(function (z) {
        var p = P(z.x, z.y), r = Math.max(10, Math.round(z.r * M.perKm));
        delen.push('<circle class="hv-gar-kaart__geozone" cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '"/>');
        if (z.id !== 'thuis') { if (z.links) label(p[0] - r - 28, p[1], HV.p(z.naam), 'is-eind is-klein'); else label(p[0], p[1] - r - 9, HV.p(z.naam), 'is-midden is-klein'); }
      });
      if (lagen.routes) delen.push('<path class="hv-gar-kaart__route" d="M' + ROUTE.map(function (r) { var p = P(r[0], r[1]); return p[0] + ' ' + p[1]; }).join('L') + '"/>');
      delen.push('<rect class="hv-gar-kaart__schaal" x="' + (M.b - 72) + '" y="' + (M.h - 16) + '" width="' + Math.round(2 * M.perKm) + '" height="3"/>');
      label(M.b - 72, M.h - 26, t('2 км', '2 km'), 'is-klein');
    }
    var th = P(0, 0);
    delen.push('<rect class="hv-gar-kaart__thuis" x="' + (th[0] - 6) + '" y="' + (th[1] - 6) + '" width="12" height="12" rx="3"/>');
    if (op.schaal === 'regio') label(th[0], th[1] - 14, t('дім', 'thuis'), 'is-midden is-klein is-ring');
    if (lagen.voertuigen && op.schaal !== 'regio') {
      var pb2 = plekVan(vtg('benzine'), tijd), pos;
      if (pb2.id === 'oprit2') pos = [0.6, -0.9];
      else if (pb2.id === 'onderweg') pos = opRoute(pb2.deel);
      else pos = ROUTE[ROUTE.length - 1];
      var pp = P(pos[0], pos[1]);
      var oud = A.benzine.beschikbaar === 'slaapt' && !verleden;
      if (pp[0] > 0 && pp[0] < M.b && pp[1] > 0 && pp[1] < M.h) {
        if (oud) { delen.push('<circle class="hv-gar-kaart__oud" cx="' + pp[0] + '" cy="' + pp[1] + '" r="24"/>'); label(pp[0] + 26, pp[1] + 2, HV.oud(HV.kijk.leeftijd(A.benzine)), 'is-klein is-oud'); }
        merk(pp[0], pp[1], 'car', HV.p(A.benzine.naam), 'apparaat:benzine', (oud ? 'is-oud' : '') + (verleden ? ' is-verleden' : '') + (op.nadruk === 'benzine' ? ' is-nadruk' : ''));
      }
      merk(th[0] - 26, th[1] + 22, 'car', HV.p(A.ev.naam), 'apparaat:ev', op.nadruk === 'ev' ? 'is-nadruk' : '');
    }
    return '<div class="hv-gar-kaartvlak is-' + op.schaal + '" style="aspect-ratio:' + VB.b + ' / ' + VB.h + '"><svg class="hv-gar-kaart__svg" viewBox="0 0 ' + VB.b + ' ' + VB.h + '" preserveAspectRatio="none" role="img" aria-label="' + h(titel) + '">' + delen.join('') + '</svg>' + boven.join('') + '</div>';
  }
  var tekstSvg = function (x, y, s, klas) { return '<text class="hv-gar-kaart__tekst' + (klas ? ' ' + klas : '') + '" x="' + x + '" y="' + y + '">' + h(s) + '</text>'; };

  /** «Що де / Wat is waar» — текстовий відповідник мапи. */
  function watIsWaar(ctx, tijd) {
    var w = ctx.staat;
    return '<div class="hv-rijen" data-k="gar-watwaar">' + VOERTUIGEN.map(function (id) {
      var a = app(id), v = vtg(id), p = plekVan(v, tijd), oud = a.beschikbaar === 'slaapt';
      var sub = HV.p(PLEK_NAAM[p.id]) + (oud ? ' · ' + t('дані ', 'gegevens ') + HV.oud(HV.kijk.leeftijd(a)) + t(' тому', ' geleden') : '') + (!zorg(w).volgen[id] ? ' · ' + t('відстеження на паузі', 'volgen gepauzeerd') : '');
      return o.rij({ icoon: icoonVan(a), naam: HV.p(a.naam), sub: sub, waarde: a.id === 'benzine' ? HV.maat(v.brandstof, '%') : HV.maat(Math.round(v.lading), '%'), actie: 'ga', gegevens: { naar: 'garage-voertuigen-' + id }, k: 'ww-' + id });
    }).join('') + ROBOTS.map(function (id) {
      var a = app(id);
      return o.rij({ icoon: icoonVan(a), naam: HV.p(a.naam), sub: HV.p(HV.staat.kamer(a.kamer).naam) + ' · ' + o.beeld(a).woord, waarde: id === 'beregening' ? '' : HV.maat(Math.round(a.st.lading), '%'), actie: 'ga', gegevens: { naar: 'garage-robots-' + id }, k: 'ww-' + id });
    }).join('') + '</div>';
  }

  // ───────────────────────── 9. Транспорт: картки й органи ─────────────────────────
  function slotSchakel(a, klein) {
    var dood = a.beschikbaar === 'onbereikbaar';
    var sch = { mogelijkheid: 'vergrendeld' };
    var bezig = a.wacht && a.wacht.mogelijkheid === 'vergrendeld';
    return o.schakel({ aan: !a.st.vergrendeld, icoon: a.st.vergrendeld ? 'lock-keyhole' : 'lock-keyhole-open', staat: bezig ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : null), ritueel: dood ? null : HV.ritueelVan(a, sch), klein: klein,
      actie: 'schakel', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld' }, aria: HV.p(a.naam) + ': ' + (a.st.vergrendeld ? t('замкнено', 'vergrendeld') : t('відімкнено', 'ontgrendeld')) });
  }

  /** «Розбудити»: поки авто не відповіло — та сама кнопка каже «Будимо…» і не приймає другого дотику (фокус лишається на ній). */
  function wekKnop(a, tekst, klein, k) {
    var bezig = wektNu(a);
    return o.knop({ tekst: bezig ? t('Будимо…', 'Wordt gewekt…') : tekst, icoon: bezig ? 'loader' : 'sun', klein: klein, actie: 'gar-wek', gegevens: { doel: a.id }, uit: bezig, klas: bezig ? 'hv-gar-wekt' : '', k: k });
  }

  function telemetrieVan(ctx, a, metActie) {
    var w = ctx.staat, v = vtg(a.id), s = standVan(a, v), lp = w.apparaten.laadpaal.st;
    var getallen;
    if (a.id === 'ev') {
      var vertrek = lp.vertrek || '07:30';
      getallen = [{ label: t('ціль', 'doel'), waarde: HV.maat(v.doel, '%') }, { label: lp.laadt ? t('потужність', 'vermogen') : t('салон', 'binnen'), waarde: lp.laadt ? HV.maat(lp.vermogen, t('кВт', 'kW'), 1) : HV.maat(a.st.binnen, '°C', 1) }, { label: t('виїзд', 'vertrek'), waarde: h(vertrek) }];
    } else if (a.id === 'benzine') {
      getallen = [{ label: t('пробіг', 'km-stand'), waarde: HV.maat(a.st.km, t('км', 'km')) }, { label: t('витрата', 'verbruik'), waarde: HV.maat(6.4, t('л/100', 'l/100'), 1) }, { label: t('шини', 'banden'), waarde: h(t('у нормі', 'in orde')) }];
    } else {
      getallen = [{ label: t('межа', 'grens'), waarde: HV.maat(a.st.positie, '%') }, { label: t('акумулятор', 'accu'), waarde: HV.maat(a.st.temp, '°C') }, { label: t('маячок', 'baken'), waarde: h(zorg(w).volgen[a.id] ? t('активний', 'actief') : t('пауза', 'pauze')) }];
    }
    return o.telemetrie({ id: a.id, icoon: icoonVan(a), naam: HV.p(a.naam), stand: s.woord, lading: a.id === 'benzine' ? v.brandstof : v.lading, doel: a.id === 'ev' ? v.doel : (isTwee(a) ? a.st.positie : null),
      toon: s.toon === 'auto' ? 'auto' : a.id === 'benzine' ? 'neutraal' : 'batterij', bereik: km(v.bereik) + ' ' + h(t('запас', 'bereik')),
      getallen: getallen, staat: wektNu(a) ? 'wacht' : a.beschikbaar !== 'ok' ? a.beschikbaar : null, actie: metActie ? 'ga' : null, gegevens: metActie ? { naar: 'garage-voertuigen-' + a.id } : null });
  }

  /** Картка транспорту для «Зараз» і списку: телеметрія (дотик — картка) + рядок дій. */
  function voertuigKaart(ctx, a) {
    var w = ctx.staat, v = vtg(a.id), s = standVan(a, v);
    var acties = [];
    if (a.id === 'ev') acties.push(o.knop({ tekst: a.st.bron === 'v-klimaat-aan' ? t('Клімат: вимкнути', 'Klimaat: uit') : t('Клімат', 'Klimaat'), icoon: 'thermometer', klein: true, actie: 'gar-klimaat', gegevens: { doel: 'ev' }, k: 'vk-klim-' + a.id }));
    if (a.id === 'benzine' && a.beschikbaar === 'slaapt') acties.push(wekKnop(a, t('Розбудити', 'Wekken'), true, 'vk-wek'));
    if (isTwee(a)) acties.push(o.knop({ tekst: a.st.laadt ? t('Зупинити', 'Stoppen') : t('Зарядити', 'Laden'), icoon: a.st.laadt ? 'square' : 'plug-zap', klein: true, actie: 'gar-accu', gegevens: { doel: a.id }, k: 'vk-laad-' + a.id }));
    var chips = [];
    if (s.toon === 'alarm') chips.push(o.chip({ icoon: 'siren', toon: 'alarm', tekst: t('викрадено', 'gestolen') }));
    if (a.st.modus === 'v-alarm-uit') chips.push(o.chip({ icoon: 'shield-off', toon: 'let-op', tekst: t('сигналізацію вимкнено', 'alarm uit') }));
    if (a.st.effect === 'v-ramen-open') chips.push(o.chip({ icoon: 'wind', toon: 'let-op', tekst: t('вікна відчинено', 'ramen open') }));
    return '<article class="hv-gar-vkaart' + (s.toon === 'alarm' ? ' is-alarm' : '') + '" data-k="vk-' + h(a.id) + '">' + telemetrieVan(ctx, a, true) +
      '<div class="hv-gar-vkaart__voet">' + slotSchakel(a, true) + '<span class="hv-gar-vkaart__slot">' + h(a.st.vergrendeld ? t('Замкнено', 'Vergrendeld') : t('Відімкнено', 'Ontgrendeld')) + '</span>' +
      (chips.length ? '<span class="hv-gar-vkaart__chips">' + chips.join('') + '</span>' : '') +
      '<span class="hv-gar-vkaart__acties">' + acties.join('') + o.icoonknop({ icoon: 'ellipsis', aria: t('Швидке керування: ', 'Snelle bediening: ') + HV.p(a.naam), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }) + '</span></div></article>';
  }

  /** Двоколісний компактно: знак замка, назва й місце, заряд зі смугою; дотик — картка. */
  function tweeRij(ctx, a) {
    var v = vtg(a.id), s = standVan(a, v), grens = Number(a.st.positie) || 80;
    return '<div class="hv-gar-tweerij' + (s.toon === 'alarm' ? ' is-alarm' : '') + '" data-k="tw-' + h(a.id) + '">' + slotSchakel(a, true) +
      '<button type="button" class="hv-gar-tweerij__lijf" data-actie="ga" data-naar="garage-voertuigen-' + h(a.id) + '" aria-label="' + h(HV.p(a.naam) + ': ' + Math.round(v.lading) + ' %, ' + s.woord + '. ' + t('Відкрити', 'Openen')) + '">' +
      '<span class="hv-gar-tweerij__teken hv-toon-' + (s.toon || 'batterij') + '">' + HV.icoon(icoonVan(a)) + '</span>' +
      '<span class="hv-gar-tweerij__tekst"><span class="hv-gar-tweerij__naam">' + h(HV.p(a.naam)) + '</span><span class="hv-gar-tweerij__sub">' + h(s.woord + ' · ' + v.bereik + ' ' + t('км', 'km')) + '</span></span>' +
      '<span class="hv-gar-tweerij__getal">' + HV.maat(Math.round(v.lading), '%') + '<span class="hv-gar-balk hv-toon-batterij" aria-hidden="true"><i style="width:' + Math.round(v.lading) + '%"></i><b style="left:' + grens + '%"></b></span></span></button></div>';
  }

  /** Замок, сигналізація, вікна, багажник, «Знайти», двигун — органи безпеки транспорту. */
  function slotOrganen(ctx, a) {
    var auto = a.soort === 'auto', dood = a.beschikbaar === 'onbereikbaar';
    var slot = '<div class="hv-gar-slotrij">' + slotSchakel(a) + '<div class="hv-gar-slotrij__tekst"><p class="hv-gar-slotrij__woord">' + h(a.wacht && a.wacht.mogelijkheid === 'vergrendeld' ? (a.wacht.waarde ? t('замикається…', 'vergrendelt…') : t('відмикається…', 'ontgrendelt…')) : a.st.vergrendeld ? t('Замкнено', 'Vergrendeld') : t('Відімкнено', 'Ontgrendeld')) + '</p>' +
      '<p class="hv-gar-slotrij__sub">' + o.risico(a.st.vergrendeld ? 'kritiek' : 'gewoon') + ' ' + h(a.st.vergrendeld ? t('відмикання — рейка й підтвердження входу', 'ontgrendelen — rail en bevestiging van aanmelding') : t('замкнути — один дотик', 'vergrendelen — één tik')) + '</p></div></div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Замкнути', 'Vergrendelen'), icoon: 'lock-keyhole', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld', waarde: 'true' }, gedrukt: a.st.vergrendeld, uit: dood }) +
      o.knop({ tekst: t('Відімкнути…', 'Ontgrendelen…'), icoon: 'lock-keyhole-open', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld', waarde: 'false' }, gedrukt: !a.st.vergrendeld, uit: dood }) + '</div>';
    var alarmAan = a.st.modus !== 'v-alarm-uit';
    var alarm = veld(t('Сигналізація', 'Alarm'), o.segment({ label: t('Сигналізація транспорту', 'Alarm van het voertuig'), waarde: gewenst(a, 'modus'), actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, k: 'alarm-' + a.id, opties: [
      { id: 'v-alarm-aan', label: t('Увімкнено', 'Aan'), icoon: 'shield-check' }, { id: 'v-alarm-uit', label: t('Вимкнено', 'Uit'), icoon: 'shield-off' }] }),
      ' ' + (alarmAan ? o.gevolg(HV.p(HV.gevaar.actie('garage.alarmuit').gevolg), { soort: 'uitroep', kop: t('Зняти сигналізацію', 'Alarm uitzetten') }) : ''));
    var extra = '';
    if (auto) {
      var ramenOpen = a.st.effect === 'v-ramen-open', kofferOpen = a.st.ventilator === 'v-koffer-open';
      extra = veld(t('Вікна й багажник', 'Ramen en kofferbak'), '<div class="hv-knoppen">' +
        o.knop({ tekst: ramenOpen ? t('Зачинити вікна', 'Ramen sluiten') : t('Провітрити: вікна на 5 см…', 'Luchten: ramen 5 cm…'), icoon: ramenOpen ? 'square' : 'wind', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'effect', waarde: ramenOpen ? 'v-ramen-dicht' : 'v-ramen-open' }, uit: dood, k: 'ramen-' + a.id }) +
        o.knop({ tekst: kofferOpen ? t('Багажник відчинено', 'Kofferbak open') : t('Відчинити багажник…', 'Kofferbak openen…'), icoon: 'package-open', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'ventilator', waarde: 'v-koffer-open' }, gedrukt: kofferOpen, uit: dood, k: 'koffer-' + a.id }) +
        (kofferOpen ? o.knop({ tekst: t('Позначити зачиненим', 'Als dicht markeren'), icoon: 'check', soort: 'stil', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'ventilator', waarde: 'v-koffer-dicht' }, k: 'koffer-dicht-' + a.id }) : '') + '</div>' +
        '<p class="hv-tekst hv-tekst--zacht">' + o.risico('gevaarlijk') + ' ' + h(t('вікна', 'ramen')) + ' · ' + o.risico('kritiek') + ' ' + h(t('багажник', 'kofferbak')) + '</p>');
    }
    var zoek = veld(t('Знайти', 'Zoeken'), '<div class="hv-knoppen">' + o.knop({ tekst: auto ? t('Блимнути фарами й сигналом', 'Lichten en claxon') : t('Короткий звук', 'Kort geluid'), icoon: 'scan-search', actie: 'gar-zoek', gegevens: { doel: a.id }, uit: dood, k: 'zoek-' + a.id }) +
      (a.id === 'benzine' && a.beschikbaar === 'slaapt' ? wekKnop(a, t('Розбудити авто', 'Auto wekken'), false, 'wek-' + a.id) : '') + '</div>');
    var motor = auto ? veld(t('Двигун', 'Motor'), '<div class="hv-knoppen">' + o.knop({ tekst: t('Запустити двигун', 'Motor starten'), icoon: 'key-round', soort: 'stil', actie: 'gar-motor', gegevens: { doel: a.id }, k: 'motor-' + a.id }) + o.later(t('пізніше', 'later')) + '</div>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('octagon-x', { maat: 's' }) + '<span>' + h(t('Хаб не запускає двигун: у гаражі накопичиться чадний газ. Дотик покаже чому й що можна натомість.', 'De hub start de motor niet: in de garage hoopt koolmonoxide zich op. Een tik laat zien waarom en wat wel kan.')) + '</span></p>') : '';
    return slot + alarm + extra + zoek + motor;
  }

  /** Місце транспорту: мала мапа з кільцем, приватність, «Позначити викраденим». */
  function plekKaart(ctx, a) {
    var w = ctx.staat, g = zorg(w), v = vtg(a.id), p = plekVan(v), volgen = g.volgen[a.id];
    var schaal = a.soort === 'auto' && a.id === 'ev' ? 'regio' : 'buurt';
    var zicht = { eigenaar: t('лише власник', 'alleen de eigenaar'), gezin: t('уся родина', 'het hele gezin'), niemand: t('ніхто', 'niemand') }[g.zicht[a.id]];
    return kaart('hv-gar-plek', kop('map-pin', t('Де стоїть', 'Waar hij staat'), naar(t('Мапа', 'Kaart'), 'garage-kaart', 'map')) +
      '<p class="hv-gar-plek__waar">' + HV.icoon(thuisPlek(p) ? 'house' : 'map-pin', { maat: 's' }) + '<strong>' + h(HV.p(PLEK_NAAM[p.id])) + '</strong>' + (a.beschikbaar === 'slaapt' ? ' <span class="hv-gar-oud">' + h(t('дані ', 'gegevens ') + HV.oud(HV.kijk.leeftijd(a)) + t(' тому', ' geleden')) + '</span>' : '') + '</p>' +
      '<div class="hv-gar-kaartje">' + (volgen ? landkaart(ctx, { schaal: schaal, klein: true, nadruk: a.id, lagen: { voertuigen: true, geozones: true, bereik: true, routes: a.id === 'benzine' } }) : '<div class="hv-gar-kaartje__pauze">' + HV.icoon('eye-off', { maat: 'l' }) + '<p>' + h(t('Відстеження на паузі: місце не записується й не показується.', 'Volgen gepauzeerd: de locatie wordt niet bewaard en niet getoond.')) + '</p></div>') + '</div>' +
      '<div class="hv-rijen">' + o.rij({ icoon: 'users', naam: t('Хто бачить місце', 'Wie ziet de locatie'), sub: zicht + ' · ' + t('сліди 30 днів', 'sporen 30 dagen'), actie: 'blad', gegevens: { blad: 'zichtbaarheid:' + a.id }, k: 'zicht-' + a.id }) +
      o.rij({ icoon: a.st.stand === 'v-gestolen' ? 'siren' : 'flag', naam: a.st.stand === 'v-gestolen' ? t('Позначено викраденим', 'Gemarkeerd als gestolen') : t('Позначити викраденим', 'Markeren als gestolen'), sub: t('маячок щохвилини, запис слідів', 'baken elke minuut, sporen bewaard'), actie: 'blad', gegevens: { blad: 'gestolen:' + a.id }, k: 'gest-' + a.id }) + '</div>');
  }

  function klimaatKaart(ctx, a, nadruk) {
    var aan = gewenst(a, 'bron') === 'v-klimaat-aan', doel = Number(gewenst(a, 'doel'));
    return kaart('hv-gar-klimaat', kop('thermometer', t('Клімат салону', 'Klimaat in de auto'), o.gevolg(t('Що станеться: салон нагріється чи охолоне до цілі за 15–20 хв від зарядної станції або акумулятора. Пов’язано з: запас ходу зменшиться приблизно на 3 км. Як повернути: «Вимкнути» — один дотик; через 30 хв клімат вимкнеться сам.', 'Wat er gebeurt: het interieur warmt op of koelt af naar het doel in 15–20 min, via de laadpaal of de accu. Hangt samen met: het bereik daalt ongeveer 3 km. Terugdraaien: ‘Uitzetten’ — één tik; na 30 min gaat het vanzelf uit.'), { kop: t('Клімат салону', 'Voorklimatiseren') }), aan ? 'warm' : null) +
      '<div class="hv-gar-klimaat__rij">' + o.getal({ maat: 'l', label: t('У салоні', 'Binnen'), waarde: HV.maat(a.st.binnen, '°C', 1), sub: h(t('надворі ', 'buiten ') + HV.maatTekst(ctx.staat.weer.temp, '°C', 0)) }) +
      '<div class="hv-gar-klimaat__doel"><span class="hv-veld__label">' + h(t('Ціль', 'Doel')) + '</span>' + o.stapper({ actie: 'gar-klimdoel', gegevens: { doel: a.id }, stap: 0.5, label: t('Ціль салону', 'Doel in de auto'), waarde: HV.maat(doel, '°C', 1), k: 'klimdoel-' + a.id }) + '</div></div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: aan ? t('Вимкнути клімат', 'Klimaat uitzetten') : t('Увімкнути клімат', 'Klimaat aanzetten'), icoon: aan ? 'square' : 'fan', soort: aan || !nadruk ? 'gewoon' : 'hoofd', actie: 'gar-klimaat', gegevens: { doel: a.id }, k: 'klim-' + a.id }) + '</div>' +
      '<p class="hv-tekst hv-tekst--zacht">' + o.risico('gevoelig') + ' ' + h(t('вмикається одразу, «Повернути» 10 с', 'gaat meteen aan, ‘Ongedaan maken’ 10 s')) + '</p>');
  }

  function ladingKaart(ctx, a, nadruk) {
    if (nadruk === undefined) nadruk = true;
    var w = ctx.staat, v = vtg(a.id), lp = w.apparaten.laadpaal;
    if (a.id === 'benzine') {
      return kaart('hv-gar-lading', kop('fuel', t('Пальне й запас ходу', 'Brandstof en bereik')) +
        '<div class="hv-gar-lading__groot">' + o.getal({ maat: 'xl', waarde: HV.maat(v.brandstof, '%'), sub: km(v.bereik) + ' ' + h(t('запас', 'bereik')) }) + '</div>' +
        '<span class="hv-gar-balk hv-toon-neutraal" aria-hidden="true"><i style="width:' + v.brandstof + '%"></i></span>' +
        '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Бак 45 л · ≈ 26 л зараз. Заправку хаб не планує — лише нагадує, коли менше 20 %.', 'Tank 45 l · ≈ 26 l nu. De hub plant het tanken niet — hij herinnert alleen onder de 20 %.')) + '</span></p>');
    }
    if (a.id === 'ev') {
      var laadt = lp.st.laadt;
      return kaart('hv-gar-lading', kop('battery-charging', t('Заряд і запас ходу', 'Lading en bereik'), naar(t('План зарядки', 'Laadplan'), 'energie-laden', 'calendar-clock'), laadt ? 'auto' : 'batterij') +
        '<div class="hv-gar-lading__groot">' + o.getal({ maat: 'xl', waarde: HV.maat(Math.round(v.lading), '%'), sub: km(v.bereik) + ' ' + h(t('запас · ціль ', 'bereik · doel ') + v.doel + ' %') }) + '</div>' +
        '<span class="hv-gar-balk hv-toon-' + (laadt ? 'auto' : 'batterij') + '" aria-hidden="true"><i style="width:' + Math.round(v.lading) + '%"></i><b style="left:' + v.doel + '%"></b></span>' +
        '<p class="hv-gar-lading__stuurt">' + HV.icoon(laadt ? 'zap' : 'calendar-clock', { maat: 's' }) + '<span>' + h(laadt ? t('заряджається ', 'laadt ') + HV.maatTekst(lp.st.vermogen, t('кВт', 'kW'), 1) + t(' · керує: ', ' · stuurt: ') + (lp.maker ? HV.p(lp.maker.naam) : t('людина', 'mens')) : t('керує: план зарядки до ', 'stuurt: laadplan tot ') + (lp.st.vertrek || '07:30') + t(' · режим «', ' · stand ‘') + HV.p(HV.waardeNaam[lp.st.modus] || [lp.st.modus, lp.st.modus]) + t('»', '’')) + '</span></p>' +
        '<div class="hv-knoppen">' + (laadt ? o.knop({ tekst: t('Зупинити зарядку', 'Laden stoppen'), icoon: 'square', actie: 'gar-evladen', gegevens: { aan: '' }, k: 'ev-stop' })
          : o.knop({ tekst: t('Заряджати зараз', 'Nu laden'), icoon: 'zap', soort: 'hoofd', actie: 'gar-evladen', gegevens: { aan: '1' }, uit: !lp.st.aangesloten || v.lading >= v.doel, k: 'ev-nu' })) +
        (HV.ui.lees('gar-deel-' + a.id, 'status') === 'laden' ? '' : o.knop({ tekst: t('Зарядка', 'Laden'), icoon: 'chevron-right', soort: 'stil', actie: 'ui', gegevens: { naam: 'gar-deel-' + a.id, waarde: 'laden' }, k: 'ev-naar-laden' })) + '</div>');
    }
    var grens = Number(gewenst(a, 'positie')) || 80, laadtNu = gewenst(a, 'laden');
    var nacht = isNacht();
    return kaart('hv-gar-lading', kop('battery', t('Акумулятор', 'Accu'), '', laadtNu ? 'batterij' : null) +
      '<div class="hv-gar-lading__groot">' + o.getal({ maat: 'xl', waarde: HV.maat(Math.round(v.lading), '%'), sub: km(v.bereik) + ' ' + h(t('запас · ', 'bereik · ') + HV.maatTekst(a.st.temp, '°C', 0)) }) + '</div>' +
      '<span class="hv-gar-balk hv-toon-batterij" aria-hidden="true"><i style="width:' + Math.round(v.lading) + '%"></i><b style="left:' + grens + '%"></b></span>' +
      veld(t('Заряджати до', 'Laden tot'), o.schuif({ label: t('Межа зарядки', 'Laadgrens'), waarde: grens, min: 50, max: 100, stap: 5, eenheid: '%', toon: 'batterij', actie: 'gar-laadtot', gegevens: { doel: a.id }, k: 'laadtot-' + a.id })) +
      '<div class="hv-knoppen">' + o.knop({ tekst: laadtNu ? t('Зупинити зарядку', 'Laden stoppen') : t('Заряджати до ', 'Laden tot ') + grens + ' %' + (nacht ? '…' : ''), icoon: laadtNu ? 'square' : 'plug-zap', soort: laadtNu || !nadruk ? 'gewoon' : 'hoofd', actie: 'gar-accu', gegevens: { doel: a.id }, k: 'accu-' + a.id }) + '</div>' +
      '<p class="hv-tekst hv-tekst--zacht">' + o.risico(nacht ? 'gevaarlijk' : 'gevoelig') + ' ' + h(nacht ? t('уночі — рейка утримання', '’s nachts — houdrail') : t('удень — одразу, «Повернути» 10 с', 'overdag — meteen, ‘Ongedaan maken’ 10 s')) + '</p>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('shield-alert', { maat: 's' }) + '<span>' + h(t('Через розумну розетку в гаражі. Хаб вимкне розетку за 45 °C, але це не пожежний захист: заряджайте на негорючій поверхні.', 'Via de slimme stekker in de garage. De hub zet de stekker uit bij 45 °C, maar dat is geen brandbeveiliging: laad op een onbrandbare ondergrond.')) + '</span></p>');
  }

  /** Поїздки: стовпці км за 7 діб, ціна на 100 км, перелік. */
  function rittenHtml(ctx, a) {
    var w = ctx.staat, g = zorg(w), lijst = g.ritten.filter(function (r) { return r.voertuig === a.id; });
    var d0 = dagBegin(w.tijd), staven = [];
    for (var d = 6; d >= 0; d--) {
      var van = d0 - d * DAG, som = lijst.filter(function (r) { return r.van >= van && r.van < van + DAG; }).reduce(function (s, r) { return s + r.km; }, 0);
      staven.push({ label: d === 0 ? t('сьогодні', 'vandaag') : HV.datumKort(van), waarde: Math.round(som * 10) / 10, toon: a.soort === 'auto' ? 'auto' : 'batterij', nu: d === 0 });
    }
    var totaal = lijst.reduce(function (s, r) { return s + r.km; }, 0);
    var per100 = a.id === 'ev' ? 16.8 * 0.24 : a.id === 'benzine' ? 6.4 * 2.05 : a.soort === 'bromfiets' ? 1.6 * 0.24 : 0.9 * 0.24;
    var uitleg = a.id === 'benzine' ? t('6,4 л на 100 км · € 2,05 за літр', '6,4 l per 100 km · € 2,05 per liter') : a.id === 'ev' ? t('16,8 кВт·год на 100 км · € 0,24 за кВт·год', '16,8 kWh per 100 km · € 0,24 per kWh') : t('енергія від розетки · € 0,24 за кВт·год', 'stroom uit de stekker · € 0,24 per kWh');
    var rijen = lijst.slice(0, 12).map(function (r) {
      return o.rij({ icoon: 'route', naam: HV.p(r.naam), sub: wanneer(r.van) + '–' + HV.tijd(r.tot) + ' · ' + HV.duur((r.tot - r.van) / MIN), waarde: km(r.km) + ' <span class="hv-gar-euro">' + h(HV.euro(r.km / 100 * per100)) + '</span>', k: 'rit-' + r.id });
    }).join('');
    return '<div class="hv-gar-rooster hv-gar-rooster--twee">' +
      kaart('', kop('route', t('Відстань за 7 діб', 'Afstand over 7 dagen')) + HV.grafiek.staven({ id: 'gar-ritten-' + a.id, titel: t('Кілометри за добу', 'Kilometers per dag'), eenheid: t('км', 'km'), decimalen: 0, tikken: 4, staven: staven, samenvatting: t('Усього ', 'Totaal ') + HV.getal(totaal, 1) + t(' км за тиждень.', ' km deze week.') }) +
        '<div class="hv-gar-cijfers">' + o.getal({ maat: 'm', label: t('за тиждень', 'deze week'), waarde: km(Math.round(totaal)) }) + o.getal({ maat: 'm', label: t('на 100 км', 'per 100 km'), waarde: h(HV.euro(per100)), sub: h(uitleg) }) + o.getal({ maat: 'm', label: t('поїздок', 'ritten'), waarde: h(String(lijst.length)) }) + '</div>') +
      kaart('', kop('history', t('Поїздки', 'Ritten'), sim()) + (rijen ? '<div class="hv-rijen">' + rijen + '</div>' : o.leeg({ icoon: 'route', titel: t('Поїздок ще немає', 'Nog geen ritten'), tekst: t('Кожна поїздка з’явиться тут із відстанню й ціною.', 'Elke rit komt hier te staan, met afstand en prijs.') }))) + '</div>';
  }

  var ONDERHOUD = {
    ev: [['circle-parking', ['Зимові шини', 'Winterbanden'], ['до 15.11 — через 6 днів', 'vóór 15-11 — over 6 dagen'], 'let-op'], ['gauge', ['Тиск задньої лівої шини', 'Bandenspanning links achter'], ['1,9 бар, норма 2,5 — підкачати', '1,9 bar, norm 2,5 — oppompen'], 'let-op'], ['wrench', ['Огляд і техогляд', 'Onderhoud en APK'], ['березень 2027', 'maart 2027'], 'ok'], ['wind', ['Фільтр салону', 'Interieurfilter'], ['через 8 000 км', 'over 8 000 km'], 'ok']],
    benzine: [['wrench', ['Техогляд', 'APK'], ['14.03.2027', '14-03-2027'], 'ok'], ['droplet', ['Заміна оливи', 'Olie verversen'], ['через 2 400 км', 'over 2 400 km'], 'ok'], ['circle-parking', ['Зимові шини', 'Winterbanden'], ['уже стоять', 'staan er al op'], 'ok']],
    fiets: [['wrench', ['Сервіс велосипеда', 'Fietsonderhoud'], ['через 410 км', 'over 410 km'], 'ok'], ['battery', ['Здоров’я акумулятора', 'Gezondheid accu'], ['91 % · 212 циклів', '91 % · 212 cycli'], 'ok'], ['gauge', ['Гальмівні колодки', 'Remblokken'], ['перевірити навесні', 'in het voorjaar controleren'], 'ok']],
    step: [['gauge', ['Тиск шин', 'Bandenspanning'], ['перевірити — 2 тижні без перевірки', 'controleren — 2 weken niet gecontroleerd'], 'let-op'], ['battery', ['Здоров’я акумулятора', 'Gezondheid accu'], ['88 % · 340 циклів', '88 % · 340 cycli'], 'ok']],
    bromfiets: [['wrench', ['Сервіс мопеда', 'Onderhoud bromfiets'], ['квітень 2027', 'april 2027'], 'ok'], ['shield-check', ['Страховка', 'Verzekering'], ['до 01.02.2027', 'tot 01-02-2027'], 'ok']]
  };
  function onderhoudHtml(ctx, a) {
    var rijen = (ONDERHOUD[a.id] || ONDERHOUD[a.soort] || []).map(function (r, i) {
      return o.rij({ icoon: r[0], naam: HV.p(r[1]), sub: HV.p(r[2]), waarde: r[3] === 'let-op' ? o.chip({ icoon: 'triangle-alert', toon: 'let-op', tekst: t('увага', 'let op') }) : o.chip({ icoon: 'circle-check-big', tekst: t('гаразд', 'in orde') }), k: 'oh-' + a.id + '-' + i });
    }).join('');
    return kaart('', kop('wrench', t('Обслуговування', 'Onderhoud'), naar(t('Усі строки', 'Alle termijnen'), 'activiteit-onderhoud', 'chevron-right')) + '<div class="hv-rijen">' + rijen + '</div>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Зріз сторінки «Обслуговування»: строки, шини й сервіс для всього дому.', 'Een uitsnede van de pagina ‘Onderhoud’: termijnen, banden en service voor het hele huis.')) + '</span></p>');
  }

  // ───────────────────────── 10. Роботи ─────────────────────────
  var PAUZE = {
    regen: { icoon: 'cloud-rain', naam: ['Дощ', 'Regen'] },
    donker: { icoon: 'moon', naam: ['Темно', 'Donker'] },
    iemand: { icoon: 'person-standing', naam: ['Хтось у саду', 'Iemand in de tuin'] }
  };
  var ROBOT_WOORD = { dock: ['на базі', 'in het station'], bezig: ['прибирає', 'zuigt'], pauze: ['пауза', 'pauze'] };
  function robotWoord(a) {
    if (a.wacht && a.wacht.mogelijkheid === 'robot') return HV.woord.wacht();
    if (a.st.fout) return t('застряг', 'vast');
    if (a.soort === 'maaier') {
      if (a.st.stand === 'bezig') return t('косить', 'maait');
      if (a.st.stand === 'pauze' && a.st.pauzeReden) return t('пауза: ', 'pauze: ') + HV.p(PAUZE[a.st.pauzeReden].naam).toLowerCase();
    }
    return HV.p(ROBOT_WOORD[a.st.stand] || ROBOT_WOORD.dock);
  }
  /**
   * Кнопки ▶ ⏸ ⌂ і «Знайти»: три окремі органи з підписами, поточний стан — натиснутий.
   * Заливка акценту — одна на видиму область: у повторюваних картках (список роботів, «Зараз») запуск — звичайна кнопка
   * з іконкою; заливку має лише картка у фокусі (nadruk: сторінка робота, його аркуш) або перервана місія («Продовжити»).
   * Коли пилосос застряг, головна дія — «Звільнено — продовжити» в поясненні помилки, тож тут заливки немає.
   */
  function robotKnoppen(a, klein, nadruk) {
    var stand = gewenst(a, 'robot');
    var dood = a.beschikbaar === 'onbereikbaar';
    var start = a.soort === 'maaier' ? t('Косити', 'Maaien') : t('Почати', 'Starten');
    var hoofd = (nadruk || a.st.stand === 'pauze') && !a.st.fout && stand !== 'start';
    return '<div class="hv-knoppen hv-gar-robotknoppen">' +
      o.knop({ tekst: a.st.stand === 'pauze' ? t('Продовжити', 'Verder') : start, icoon: 'play', soort: hoofd ? 'hoofd' : 'gewoon', klein: klein, actie: 'gar-robot', gegevens: { doel: a.id, waarde: 'start' }, gedrukt: stand === 'start', uit: dood, k: 'rb-start-' + a.id }) +
      o.knop({ tekst: t('Пауза', 'Pauze'), icoon: 'pause', klein: klein, actie: 'gar-robot', gegevens: { doel: a.id, waarde: 'pauze' }, gedrukt: stand === 'pauze', uit: dood || stand === 'dock', k: 'rb-pauze-' + a.id }) +
      o.knop({ tekst: t('На базу', 'Naar station'), icoon: 'house', klein: klein, actie: 'gar-robot', gegevens: { doel: a.id, waarde: 'dock' }, gedrukt: stand === 'dock', uit: dood, k: 'rb-dock-' + a.id }) +
      o.knop({ tekst: t('Знайти', 'Zoeken'), icoon: 'scan-search', soort: 'stil', klein: klein, actie: 'gar-zoek', gegevens: { doel: a.id }, uit: dood, k: 'rb-zoek-' + a.id }) + '</div>';
  }
  function voortgang(a) {
    if (a.st.stand !== 'bezig' && a.st.stand !== 'pauze') return '';
    return '<div class="hv-gar-voortgang" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(a.st.voortgang) + '" aria-label="' + h(t('Виконано', 'Gedaan')) + '"><span class="hv-gar-balk hv-toon-aan"><i style="width:' + Math.round(a.st.voortgang) + '%"></i></span><span class="hv-gar-voortgang__tekst">' + HV.maat(Math.round(a.st.voortgang), '%') + ' ' + h(t('виконано', 'gedaan')) + '</span></div>';
  }

  /**
   * hv-plan: перший поверх для пилососа; кімната-ціль ≥ 44 px, вибір дотиком або списком.
   * План малюється з пропорціями (xMidYMid meet, поле з тим самим відношенням сторін). Підпис — HTML-шар поверх SVG:
   * один рядок без розриву слова, не ширший за свою кімнату. Найвужча кімната вміщує найдовшу назву, поки план не
   * вужчий за 300 px; у вужчому полі (контейнер garplan) замість назв — номери, а під планом — легенда «номер · назва».
   */
  var PLAN = { woonkamer: [6, 6, 146, 184], keuken: [158, 6, 176, 84], hal: [158, 96, 92, 94], bijkeuken: [256, 96, 78, 94] };
  function stofPlan(ctx, a) {
    var g = zorg(ctx.staat), nu = a.st.kamerNu, labels = [], legenda = [];
    var pct = function (x, y) { return 'left:' + (x / 340 * 100).toFixed(2) + '%;top:' + (y / 196 * 100).toFixed(2) + '%'; };
    var kamers = STOF_KAMERS.map(function (id, i) {
      var r = PLAN[id], k = HV.staat.kamer(id), gekozen = g.stofKamers.indexOf(id) >= 0, naam = HV.p(k.naam);
      labels.push('<span class="hv-gar-plan__label' + (gekozen ? ' is-gekozen' : '') + (nu === id ? ' is-nu' : '') + '" aria-hidden="true" style="' + pct(r[0] + r[2] / 2, r[1] + r[3] / 2) + ';max-inline-size:calc(' + (r[2] / 340 * 100).toFixed(2) + '% - 8px)">' +
        '<span class="hv-gar-plan__naam">' + h(naam) + '</span><span class="hv-gar-plan__nr">' + (i + 1) + '</span>' + (nu === id ? '<small>' + h(t('зараз тут', 'nu hier')) + '</small>' : '') + '</span>');
      legenda.push('<li' + (gekozen ? '' : ' class="is-uit"') + '><b>' + (i + 1) + '</b>' + h(naam) + '</li>');
      return '<g class="hv-gar-plan__kamer' + (gekozen ? ' is-gekozen' : '') + (nu === id ? ' is-nu' : '') + '" role="button" tabindex="0" aria-pressed="' + (gekozen ? 'true' : 'false') + '" aria-label="' + h(naam + (gekozen ? t(': прибрати', ': zuigen') : t(': пропустити', ': overslaan')) + (nu === id ? t(', пилосос зараз тут', ', de stofzuiger is nu hier') : '')) + '" data-actie="gar-kamer" data-kamer="' + id + '">' +
        '<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="3"/></g>';
    }).join('');
    var basis = '<circle class="hv-gar-plan__basis" cx="238" cy="178" r="6"/>';
    var robot = '';
    if (nu && PLAN[nu]) { var r = PLAN[nu]; robot = '<circle class="hv-gar-plan__robot" cx="' + (r[0] + r[2] * 0.25 + (a.st.voortgang % 20) * r[2] * 0.025) + '" cy="' + (r[1] + r[3] * 0.78) + '" r="8"/>'; }
    return '<div class="hv-gar-planhouder"><div class="hv-gar-planvlak"><svg class="hv-gar-plan" viewBox="0 0 340 196" preserveAspectRatio="xMidYMid meet" role="group" aria-label="' + h(t('План першого поверху: кімнати для прибирання', 'Plattegrond begane grond: kamers om te zuigen')) + '">' + kamers + basis + robot + '</svg>' + labels.join('') + '</div>' +
      '<ol class="hv-gar-plan__legenda" aria-hidden="true">' + legenda.join('') + '</ol></div>';
  }

  function stofzuigerHtml(ctx, a, compact, nadruk) {
    var g = zorg(ctx.staat);
    if (nadruk === undefined) nadruk = !compact;
    var kies = '<div class="hv-filter" role="group" aria-label="' + h(t('Кімнати', 'Kamers')) + '">' + STOF_KAMERS.map(function (id) {
      var gekozen = g.stofKamers.indexOf(id) >= 0;
      return o.chip({ filter: true, gekozen: gekozen, icoon: HV.staat.kamer(id).icoon, tekst: HV.p(HV.staat.kamer(id).naam), actie: 'gar-kamer', gegevens: { kamer: id }, k: 'stofk-' + id });
    }).join('') + '</div>';
    var fout = a.st.fout ? '<div class="hv-gar-fout" data-k="stof-fout">' + HV.icoon('triangle-alert', { maat: 'm' }) + '<div><p class="hv-gar-fout__kop">' + h(t('Код E2: щітка заплуталася', 'Code E2: borstel zit vast')) + '</p>' +
      '<p class="hv-gar-fout__wat">' + h(t('Що робити: переверніть пилосос, зніміть кришку щітки й витягніть намотане волосся чи шнур. Потім «Продовжити».', 'Wat te doen: draai de stofzuiger om, haal het borstelklepje eraf en verwijder het haar of het snoer. Daarna ‘Verder’.')) + '</p>' +
      o.knop({ tekst: t('Звільнено — продовжити', 'Vrij — verder'), icoon: 'play', soort: 'hoofd', klein: true, actie: 'gar-fout', gegevens: { weg: '1' }, k: 'stof-fout-weg' }) + '</div></div>' : '';
    var kopRij = '<div class="hv-gar-robotkop">' + o.schakel({ aan: a.st.stand === 'bezig', icoon: 'garage-stofzuiger', toon: 'aan', staat: a.wacht ? 'wacht' : null, aria: HV.p(a.naam) }) +
      '<div><p class="hv-gar-robotkop__woord">' + h(robotWoord(a)) + (a.st.kamerNu ? ' · ' + h(HV.p(HV.staat.kamer(a.st.kamerNu).waar)) : '') + '</p>' +
      '<p class="hv-gar-robotkop__sub">' + nb([HV.maat(Math.round(a.st.lading), '%'), h(t('кімнат ', 'kamers ') + g.stofKamers.length + t(' з ', ' van ') + STOF_KAMERS.length), a.st.klaar ? h(t('востаннє ', 'laatst ') + wanneer(a.st.klaar)) : '']) + '</p></div></div>';
    if (compact) return kopRij + fout + voortgang(a) + robotKnoppen(a, true, nadruk) + kies;
    return kopRij + fout + voortgang(a) + robotKnoppen(a, false, nadruk) +
      veld(t('Кімнати: дотик до плану або вибір зі списку', 'Kamers: tik op de plattegrond of in de lijst'), stofPlan(ctx, a) + kies) +
      veld(t('Сила', 'Zuigkracht'), o.segment({ label: t('Сила всмоктування', 'Zuigkracht'), waarde: gewenst(a, 'modus'), actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, k: 'stof-modus', opties: [
        { id: 'z-stil', label: t('Тихо', 'Stil'), icoon: 'moon' }, { id: 'z-normaal', label: t('Звичайно', 'Normaal'), icoon: 'fan' }, { id: 'z-max', label: t('Максимум', 'Maximaal'), icoon: 'zap' }] }));
  }

  function maaierPerceel(ctx) {
    return '<div class="hv-gar-kaartje">' + landkaart(ctx, { schaal: 'perceel', lagen: { voertuigen: false, robots: true } }) + '</div>';
  }
  function pauzeChips(ctx) {
    var g = zorg(ctx.staat), w = ctx.staat;
    var nu = { regen: !!w.weer.neerslag, donker: isDonker(), iemand: g.iemandInTuin };
    return '<div class="hv-filter" role="group" aria-label="' + h(t('Паузи косарки', 'Pauzes van de maaier')) + '">' + Object.keys(PAUZE).map(function (k) {
      return o.chip({ filter: true, gekozen: g.pauze[k], icoon: PAUZE[k].icoon, html: '<span>' + h(HV.p(PAUZE[k].naam)) + '</span>' + (nu[k] ? '<span class="hv-gar-nu">' + h(t('зараз', 'nu')) + '</span>' : ''), actie: 'gar-pauzeregel', gegevens: { regel: k }, k: 'pz-' + k, aria: HV.p(PAUZE[k].naam) + ': ' + (g.pauze[k] ? t('пауза ввімкнена', 'pauze aan') : t('пауза вимкнена', 'pauze uit')) });
    }).join('') + '</div>';
  }
  function zonesChips(ctx, lijst, gekozen, actie, pref) {
    return '<div class="hv-filter" role="group">' + lijst.map(function (z) {
      return o.chip({ filter: true, gekozen: gekozen.indexOf(z.id) >= 0, icoon: 'leaf', tekst: HV.p(z.naam) + (z.m2 ? ' · ' + z.m2 + ' ' + t('м²', 'm²') : ''), actie: actie, gegevens: { zone: z.id }, k: pref + z.id });
    }).join('') + '</div>';
  }
  function roosterHtml(ctx, robot) {
    var g = zorg(ctx.staat), dagen = g.rooster[robot];
    return '<div class="hv-filter hv-gar-week" role="group" aria-label="' + h(t('Дні тижня', 'Dagen van de week')) + '">' + DAGEN.map(function (d) {
      return o.chip({ filter: true, gekozen: dagen.indexOf(d[0]) >= 0, tekst: HV.p(d[1]), actie: 'gar-rooster', gegevens: { robot: robot, dag: d[0] }, k: 'rs-' + robot + '-' + d[0] });
    }).join('') + '<span class="hv-gar-week__tijd">' + HV.icoon('clock', { maat: 's' }) + h(g.roosterTijd[robot]) + '</span></div>';
  }

  function maaierHtml(ctx, a, compact, nadruk) {
    var g = zorg(ctx.staat), w = ctx.staat;
    if (nadruk === undefined) nadruk = !compact;
    var heen = HV.gevaar.vind(a, 'robot', 'start');
    var kopRij = '<div class="hv-gar-robotkop">' + o.schakel({ aan: a.st.stand === 'bezig', icoon: 'garage-maaier', toon: 'aan', staat: a.wacht ? 'wacht' : null, aria: HV.p(a.naam) }) +
      '<div><p class="hv-gar-robotkop__woord">' + h(robotWoord(a)) + '</p><p class="hv-gar-robotkop__sub">' + nb([HV.maat(Math.round(a.st.lading), '%'), h(g.maaiZones.length + ' ' + HV.meervoud(g.maaiZones.length, ['зона', 'зони', 'зон'], ['zone', 'zones'])), h(t('ножі ', 'messen ') + a.st.messen + t(' год', ' u'))]) + '</p></div></div>';
    var start = '<p class="hv-tekst hv-tekst--zacht">' + o.risico(heen.niveau) + ' ' + h(heen.niveau === 'gevaarlijk' ? (isDonker() ? t('старт у темряві — рейка утримання', 'starten in het donker — houdrail') : t('у саду хтось є — рейка утримання', 'er is iemand in de tuin — houdrail')) : t('старт удень — одразу, «Повернути» 10 с', 'starten overdag — meteen, ‘Ongedaan maken’ 10 s')) + '</p>';
    if (compact) return kopRij + voortgang(a) + robotKnoppen(a, true, nadruk) + start + pauzeChips(ctx);
    var simKnop = o.chip({ filter: true, gekozen: g.iemandInTuin, icoon: 'flask-conical', tekst: t('Симулювати: хтось у саду', 'Simuleren: iemand in de tuin'), actie: 'gar-iemand', k: 'sim-iemand' });
    return kopRij + voortgang(a) + robotKnoppen(a, false, nadruk) + start +
      veld(t('Зони ділянки', 'Zones van het perceel'), maaierPerceel(ctx) + zonesChips(ctx, ZONES_MAAI, g.maaiZones, 'gar-maaizone', 'mz-')) +
      veld(t('Пауза, коли…', 'Pauze als…'), pauzeChips(ctx) + '<div class="hv-filter">' + simKnop + '</div>', ' ' + o.gevolg(t('Що станеться: косарка сама стане на паузу, коли піде дощ, стемніє чи датчик побачить людину в саду, і продовжить, коли причина мине. Пов’язано з: правило діє і для розкладу, і для ручного старту. Як повернути: дотик до чипа вимикає правило.', 'Wat er gebeurt: de maaier pauzeert zelf bij regen, in het donker of als de sensor iemand in de tuin ziet, en gaat verder als de reden voorbij is. Hangt samen met: de regel geldt voor het rooster en voor een handmatige start. Terugdraaien: een tik op de chip zet de regel uit.'), { kop: t('Правила паузи', 'Pauzeregels') })) +
      veld(t('Розклад', 'Rooster'), roosterHtml(ctx, 'maaier'));
    void w;
  }

  function beregeningHtml(ctx, a, compact, nadruk) {
    var g = zorg(ctx.staat), w = ctx.staat, aan = gewenst(a, 'aan');
    if (nadruk === undefined) nadruk = !compact;
    var regen = !!w.weer.neerslag;
    var kopRij = '<div class="hv-gar-robotkop">' + o.schakel({ aan: !!a.st.aan, icoon: 'sprout', toon: 'aan', staat: a.wacht ? 'wacht' : null, actie: 'gar-water', gegevens: { doel: a.id }, aria: HV.p(a.naam) }) +
      '<div><p class="hv-gar-robotkop__woord">' + h(o.beeld(a).woord) + (a.st.zoneNu ? ' · ' + h(HV.p(ZONES_WATER.filter(function (z) { return z.id === a.st.zoneNu; })[0].naam)) : '') + '</p>' +
      '<p class="hv-gar-robotkop__sub">' + nb([h(g.beregZones.length + ' ' + HV.meervoud(g.beregZones.length, ['зона', 'зони', 'зон'], ['zone', 'zones']) + ' × ' + g.beregDuur + ' ' + t('хв', 'min')), h(t('наступний ', 'volgende ') + g.roosterTijd.beregening)]) + '</p></div></div>';
    var knop = '<div class="hv-knoppen">' + (aan ? o.knop({ tekst: t('Зупинити полив', 'Beregening stoppen'), icoon: 'square', actie: 'gar-water', gegevens: { doel: a.id }, klein: compact, k: 'water-stop' }) : o.knop({ tekst: t('Полити зараз', 'Nu sproeien'), icoon: 'play', soort: nadruk ? 'hoofd' : 'gewoon', actie: 'gar-water', gegevens: { doel: a.id }, klein: compact, k: 'water-start' })) + '</div>';
    var winter = '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('snowflake', { maat: 's' }) + '<span>' + h(t('Листопад: перед першими морозами злийте воду з труб — це в «Обслуговуванні».', 'November: laat vóór de eerste vorst het water uit de leidingen lopen — staat in ‘Onderhoud’.')) + '</span></p>';
    if (compact) return kopRij + knop + (regen && g.regenStop ? '<p class="hv-tekst">' + HV.icoon('cloud-rain', { maat: 's' }) + h(t('Іде дощ — розклад пропустить полив.', 'Het regent — het rooster slaat de beregening over.')) + '</p>' : '');
    return kopRij + knop + '<p class="hv-tekst hv-tekst--zacht">' + o.risico('gevoelig') + ' ' + h(t('старт — одразу, «Повернути» 10 с; зупинка — звичайна', 'starten — meteen, ‘Ongedaan maken’ 10 s; stoppen — gewoon')) + '</p>' +
      veld(t('Зони', 'Zones'), zonesChips(ctx, ZONES_WATER, g.beregZones, 'gar-waterzone', 'wz-')) +
      veld(t('Тривалість на зону', 'Duur per zone'), o.stapper({ actie: 'gar-waterduur', stap: 5, label: t('Тривалість на зону', 'Duur per zone'), waarde: HV.maat(g.beregDuur, t('хв', 'min')), k: 'water-duur' })) +
      veld(t('Дощ', 'Regen'), '<div class="hv-filter">' + o.chip({ filter: true, gekozen: g.regenStop, icoon: 'cloud-rain', tekst: t('Пропускати, коли пройшов дощ', 'Overslaan na regen'), actie: 'gar-regenstop', k: 'water-regen' }) + '</div>') +
      veld(t('Розклад', 'Rooster'), roosterHtml(ctx, 'beregening')) + winter;
  }

  var ROBOT_HTML = { stofzuiger: stofzuigerHtml, maaier: maaierHtml, beregening: beregeningHtml };

  // ───────────────────────── 11. Дозволи гаража: зріз реєстру ─────────────────────────
  var GROEPEN = [
    [['Транспорт: замки', 'Voertuigen: sloten'], ['garage.vergrendelen', 'garage.ontgrendelen', 'garage.kofferbak']],
    [['Транспорт: сигналізація й пошук', 'Voertuigen: alarm en zoeken'], ['garage.alarmaan', 'garage.alarmuit', 'garage.zoeken', 'garage.gestolen']],
    [['Зарядка й клімат', 'Laden en klimaat'], ['laadpaal.laden', 'garage.klimaat', 'garage.ramenopen', 'garage.acculaden', 'garage.accunacht']],
    [['Роботи й полив', 'Robots en beregening'], ['robot', 'garage.maaierdag', 'maaier.start', 'beregening.aan']]
  ];
  function dozvolyHtml(ctx) {
    var uitvoerder = HV.ui.lees('gar-uitvoerder', 'automatisering');
    var u = HV.gevaar.uitvoerder(uitvoerder);
    var groepen = GROEPEN.map(function (gr, i) {
      var rijen = gr[1].map(function (s) { return HV.gevaar.actie(s); }).filter(function (x) { return x.sleutel !== 'onbekend'; }).map(function (x) { return o.stand({ uitvoerder: uitvoerder, actie: x, rol: ctx.rol }); }).join('');
      return '<div class="hv-gar-groep" data-k="gar-groep-' + i + '"><h4 class="hv-gar-groep__naam">' + h(HV.p(gr[0])) + '</h4>' + rijen + '</div>';
    }).join('');
    return '<div class="hv-gar-dozvoly">' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Для кожної дії й кожного виконавця — «Вимкнено · Питати · Завжди». Типово «Вимкнено»; змінює лише власник; кожна зміна — запис у Журналі. Людина й далі проходить ритуал рівня.', 'Voor elke actie en elke uitvoerder — ‘Uit · Vragen · Altijd’. Standaard ‘Uit’; alleen de eigenaar wijzigt; elke wijziging komt in het logboek. Een mens doorloopt nog steeds het ritueel van het niveau.')) + '</span></p>' +
      veld(t('Виконавець', 'Uitvoerder'), o.segment({ label: t('Виконавець', 'Uitvoerder'), waarde: uitvoerder, actie: 'ui', gegevens: { naam: 'gar-uitvoerder' }, klas: 'hv-segment--rol', k: 'gar-uitv', opties: HV.gevaar.uitvoerders().map(function (x) { return { id: x.id, label: HV.p(x.naam) }; }) })) +
      groepen +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Перевірити: «', 'Proef: ‘') + HV.p(u.naam) + t('» замикає електромобіль', '’ vergrendelt de elektrische auto'), icoon: 'flask-conical', actie: 'gar-proef', k: 'gar-proef' }) +
      naar(t('Показати в реєстрі', 'In register tonen'), 'instellingen-risico', 'list') + '</div></div>';
  }

  // ───────────────────────── 12. Сторінки ─────────────────────────
  function garageZin(ctx) {
    var w = ctx.staat, A = w.apparaten, ev = vtg('ev'), lp = A.laadpaal.st;
    var delen = [];
    var evDeel = t('Електромобіль на під’їзді, ', 'De elektrische auto staat op de oprit, ') + Math.round(ev.lading) + ' %';
    if (lp.laadt) evDeel += t(', заряджається до ', ', laadt tot ') + ev.doel + ' %';
    else if (ev.lading < ev.doel) evDeel += t(' — готовий до ', ' — klaar vóór ') + (lp.vertrek || '07:30');
    delen.push(evDeel);
    var bz = A.benzine, pb = plekVan(vtg('benzine'));
    delen.push(bz.beschikbaar === 'slaapt' ? t('бензинове авто востаннє бачили ', 'de benzineauto is voor het laatst gezien ') + HV.p(PLEK_NAAM[pb.id]) + t(' о ', ' om ') + HV.tijd(bz.gezien) : t('бензинове авто ', 'de benzineauto staat ') + HV.p(PLEK_NAAM[pb.id]));
    var inGarage = VOERTUIGEN.filter(function (id) { return isTwee(A[id]) && vtg(id).plek === 'garage'; }).length;
    delen.push(inGarage + '\u00a0' + HV.meervoud(inGarage, ['двоколісний', 'двоколісні', 'двоколісних'], ['tweewieler staat', 'tweewielers staan']) + t(' у гаражі', ' in de garage'));
    var zin = delen.map(function (d) { return d.replace(/^./, function (c) { return c.toUpperCase(); }); }).join('. ');
    var kort = t('Електромобіль ', 'Elektrische auto ') + Math.round(ev.lading) + ' % · ' + km(ev.bereik);
    return { zin: zin + '.', kort: kort };
  }

  function nuItems(ctx) {
    var w = ctx.staat, A = w.apparaten, items = [];
    var ev = A.ev;
    if (ev && ev.st.banden && ev.st.banden.some(function (b) { return b < NORM_BAND - 0.35; })) items.push({ id: 'gar-band', soort: 'aandacht', icoon: 'gauge', maker: 'systeem', sinds: w.tijd - 42 * MIN, tekst: ['Електромобіль: задня ліва шина 1,9 бар, норма 2,5', 'Elektrische auto: band links achter 1,9 bar, norm 2,5'], acties: [{ naam: 'ga', hoofd: true, label: ['Далі', 'Verder'], gegevens: { naar: 'garage-voertuigen-ev' } }] });
    VOERTUIGEN.forEach(function (id) { var a = A[id]; if (a && a.st.stand === 'v-gestolen') items.push({ id: 'gar-gest-' + id, soort: 'alarm', icoon: 'siren', maker: 'systeem', sinds: a.maker ? a.maker.tijd : w.tijd, tekst: [a.naam[0] + ': позначено викраденим — маячок щохвилини', a.naam[1] + ': gemarkeerd als gestolen — baken elke minuut'], acties: [{ naam: 'ga', hoofd: true, label: ['Мапа', 'Kaart'], gegevens: { naar: 'garage-kaart' } }] }); });
    if (A.stofzuiger && A.stofzuiger.st.fout) items.push({ id: 'gar-stof', soort: 'aandacht', icoon: 'triangle-alert', maker: 'systeem', sinds: w.tijd - 3 * MIN, tekst: ['Пилосос застряг: код E2, щітка заплуталася', 'Robotstofzuiger zit vast: code E2, borstel zit vast'], acties: [{ naam: 'ga', hoofd: true, label: ['Що робити', 'Wat te doen'], gegevens: { naar: 'garage-robots-stofzuiger' } }] });
    var ft = vtg('fietstaras');
    if (ft && ft.lading < 40 && !A.fietstaras.st.laadt) items.push({ id: 'gar-fiets', soort: 'info', icoon: 'battery-low', maker: 'systeem', sinds: w.tijd - 90 * MIN, tekst: ['Електровелосипед Тараса: ' + Math.round(ft.lading) + ' %, ≈ ' + ft.bereik + ' км', 'E-bike van Taras: ' + Math.round(ft.lading) + ' %, ≈ ' + ft.bereik + ' km'], acties: [{ naam: 'gar-accu', hoofd: true, label: ['Зарядити до 80 %', 'Laden tot 80 %'], gegevens: { doel: 'fietstaras' } }] });
    if (A.maaier && A.maaier.st.stand === 'pauze' && A.maaier.st.pauzeReden) items.push({ id: 'gar-maai', soort: 'info', icoon: PAUZE[A.maaier.st.pauzeReden].icoon, maker: 'systeem', sinds: w.tijd - 5 * MIN, tekst: ['Косарка на паузі: ' + PAUZE[A.maaier.st.pauzeReden].naam[0].toLowerCase(), 'Robotmaaier gepauzeerd: ' + PAUZE[A.maaier.st.pauzeReden].naam[1].toLowerCase()], acties: [{ naam: 'gar-robot', label: ['На базу', 'Naar station'], gegevens: { doel: 'maaier', waarde: 'dock' } }] });
    items.push({ id: 'gar-winter', soort: 'info', icoon: 'snowflake', maker: 'systeem', sinds: w.tijd - 26 * UUR, tekst: ['Полив: злити воду з труб до перших морозів', 'Beregening: water uit de leidingen vóór de eerste vorst'], acties: [{ naam: 'ga', label: ['Обслуговування', 'Onderhoud'], gegevens: { naar: 'activiteit-onderhoud' } }] });
    return items;
  }

  function robotMini(ctx, a, groot) {
    var html = ROBOT_HTML[a.soort](ctx, a, true);
    if (groot) html += a.soort === 'stofzuiger' ? stofPlan(ctx, a) : a.soort === 'maaier' ? maaierPerceel(ctx) : '<div class="hv-rijen">' + ZONES_WATER.map(function (z) { var g = zorg(ctx.staat), aan = g.beregZones.indexOf(z.id) >= 0; return o.rij({ icoon: 'droplets', naam: HV.p(z.naam), sub: aan ? g.beregDuur + ' ' + t('хв', 'min') : t('пропускається', 'overgeslagen'), waarde: a.st.zoneNu === z.id ? o.chip({ icoon: 'sprout', toon: 'aan', tekst: t('зараз', 'nu') }) : '', k: 'bz-' + z.id }); }).join('') + '</div>';
    return '<article class="hv-gar-robot" data-k="rb-' + h(a.id) + '">' + kop(icoonVan(a), HV.p(a.naam), naar(t('Детальніше', 'Meer'), 'garage-robots-' + a.id, 'chevron-right'), a.st.stand === 'bezig' || a.st.aan ? 'aan' : null) + html + '</article>';
  }

  function dronesHtml(ctx) {
    var w = ctx.staat, d = w.drones || [];
    var STAND = { dock: ['у доку', 'in het dock'], vlucht: ['у польоті', 'in de lucht'], signaalkwijt: ['втрата сигналу', 'signaal kwijt'], terug: ['повертається', 'keert terug'] };
    return '<div class="hv-rijen">' + d.map(function (x) {
      return o.rij({ icoon: 'drone', naam: HV.p(x.naam), sub: HV.p(STAND[x.stand] || [x.stand, x.stand]), waarde: HV.maat(x.lading, '%'), actie: 'ga', gegevens: { naar: 'garage-drones' }, k: 'gar-dr-' + x.id });
    }).join('') + '</div><p class="hv-tekst hv-tekst--zacht">' + HV.icoon('flask-conical', { maat: 's' }) + '<span>' + h(t('Лише симуляція. Парк, перевірка перед зльотом і кабіна — на вкладці «Безпілотники».', 'Alleen simulatie. Vloot, controle vóór de vlucht en cockpit — op het tabblad ‘Drones’.')) + '</span></p>';
  }

  function renderNu(ctx) {
    var w = ctx.staat, A = w.apparaten, z = garageZin(ctx);
    var items = nuItems(ctx);
    var vliegt = (w.drones || []).filter(function (d) { return d.stand === 'vlucht'; })[0];
    var chips = [o.chip({ icoon: 'warehouse', tekst: t('Ворота гаража: ', 'Garagedeur: ') + (A.garagedeur.st.open ? HV.woord.open() : HV.woord.dicht()), actie: 'ga', gegevens: { naar: 'beveiliging-toegang' }, k: 'gar-chip-deur' }),
      o.chip({ icoon: 'plug-zap', toon: A.laadpaal.st.laadt ? 'auto' : null, tekst: t('Станція: ', 'Laadpaal: ') + o.beeld(A.laadpaal).woord, actie: 'ga', gegevens: { naar: 'energie-laden' }, k: 'gar-chip-lp' })];
    if (vliegt) chips.unshift(o.chip({ icoon: 'drone', toon: 'let-op', tekst: t('Дрон у польоті · ', 'Drone vliegt · ') + vliegt.lading + ' %', actie: 'ga', gegevens: { naar: 'garage-drones' }, k: 'gar-chip-drone' }));
    var zin = '<section class="hv-gar-zin" data-k="gar-zin">' + '<span class="hv-gar-zin__teken">' + HV.icoon('car', { maat: 'l' }) + '</span><div class="hv-gar-zin__tekst"><p class="hv-gar-zin__vol">' + h(z.zin) + '</p><p class="hv-gar-zin__kort">' + h(z.kort) + '</p>' +
      '<div class="hv-gar-zin__chips">' + chips.join('') + '</div></div></section>';
    var transport = '<div class="hv-gar-vlijst is-autos">' + VOERTUIGEN.filter(function (id) { return A[id].soort === 'auto'; }).map(function (id) { return voertuigKaart(ctx, A[id]); }).join('') + '</div>' +
      '<div class="hv-gar-twee">' + VOERTUIGEN.filter(function (id) { return isTwee(A[id]); }).map(function (id) { return tweeRij(ctx, A[id]); }).join('') + '</div>';
    var robots = '<div class="hv-gar-robots">' + ROBOTS.map(function (id) { return robotMini(ctx, A[id]); }).join('') + '</div>';
    var kaartje = '<button type="button" class="hv-gar-kaartknop" data-actie="ga" data-naar="garage-kaart" aria-label="' + h(t('Відкрити мапу: ділянка й околиці', 'Kaart openen: perceel en omgeving')) + '">' + landkaart(ctx, { schaal: 'perceel', lagen: { voertuigen: true, robots: true }, passief: true }) + '</button>';
    var onderhoud = '<div class="hv-rijen">' + [['ev', 0], ['ev', 1], ['step', 0], ['benzine', 0]].map(function (x, i) {
      var r = (ONDERHOUD[x[0]] || [])[x[1]], a = A[x[0]];
      return o.rij({ icoon: r[0], naam: HV.p(r[1]) + ' · ' + HV.p(a.naam).toLowerCase(), sub: HV.p(r[2]), waarde: r[3] === 'let-op' ? o.chip({ icoon: 'triangle-alert', toon: 'let-op', tekst: t('увага', 'let op') }) : '', actie: 'ga', gegevens: { naar: 'garage-voertuigen-' + x[0] }, k: 'gar-oh-' + i });
    }).join('') + '</div>';
    return '<div class="hv-gar" data-k="gar-nu">' + zin +
      o.blok({ id: 'gar-belangrijk', titel: t('Зараз важливо', 'Nu belangrijk'), teller: Math.min(3, items.length), inhoud: o.nu(items) }) +
      o.blok({ id: 'gar-transport', titel: t('Транспорт', 'Voertuigen'), teller: VOERTUIGEN.length, inhoud: transport, extra: naar(t('Усі', 'Alle'), 'garage-voertuigen', 'chevron-right') }) +
      '<div class="hv-gar-rooster hv-gar-rooster--twee">' +
      o.blok({ id: 'gar-robots', titel: t('Роботи й полив', 'Robots en beregening'), teller: ROBOTS.length, inhoud: robots, extra: naar(t('Усі', 'Alle'), 'garage-robots', 'chevron-right') }) +
      '<div class="hv-gar-kolom">' + o.blok({ id: 'gar-kaartje', titel: t('Ділянка', 'Perceel'), inhoud: kaart('hv-gar-kaartkaart', kaartje + '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('map', { maat: 's' }) + '<span>' + h(t('Дотик — мапа з околицями, геозонами й кільцем досяжності.', 'Tik — de kaart met omgeving, geozones en bereikring.')) + '</span></p>'), extra: naar(t('Мапа', 'Kaart'), 'garage-kaart', 'chevron-right') }) +
      o.blok({ id: 'gar-drones', titel: t('Безпілотники', 'Drones'), teller: (w.drones || []).length, inhoud: kaart('', dronesHtml(ctx)) }) +
      o.blok({ id: 'gar-onderhoud', titel: t('Обслуговування', 'Onderhoud'), inhoud: kaart('', onderhoud), extra: naar(t('Усі строки', 'Alle termijnen'), 'activiteit-onderhoud', 'chevron-right') }) + '</div></div>' +
      o.blok({ id: 'gar-dozvoly', titel: t('Дозволи гаража', 'Toestemmingen van de garage'), inhoud: kaart('', dozvolyHtml(ctx)), dicht: true, samenvatting: h(t('Хто з виконавців що може робити з транспортом і роботами: «Вимкнено · Питати · Завжди».', 'Wat elke uitvoerder met voertuigen en robots mag: ‘Uit · Vragen · Altijd’.')) }) +
      '</div>';
  }

  // ── Транспорт ──
  var VDELEN = [['status', ['Стан', 'Status'], 'gauge'], ['laden', ['Зарядка', 'Laden'], 'plug-zap'], ['ritten', ['Поїздки', 'Ritten'], 'route'], ['onderhoud', ['Сервіс', 'Onderhoud'], 'wrench']];
  function voertuigWissel(ctx, huidig) {
    return '<nav class="hv-gar-wissel" aria-label="' + h(t('Інший транспорт', 'Ander voertuig')) + '">' + VOERTUIGEN.map(function (id) {
      var a = app(id), v = vtg(id);
      return '<button type="button" class="hv-gar-wissel__deel' + (id === huidig ? ' is-gekozen' : '') + '" aria-current="' + (id === huidig ? 'page' : 'false') + '" data-actie="ga" data-naar="garage-voertuigen-' + id + '">' + HV.icoon(icoonVan(a), { maat: 's' }) + '<span>' + h(HV.p(a.naam)) + '</span><span class="hv-gar-wissel__getal">' + h(Math.round(id === 'benzine' ? v.brandstof : v.lading) + ' %') + '</span></button>';
    }).join('') + '</nav>';
  }
  function voertuigPagina(ctx, a) {
    var w = ctx.staat, v = vtg(a.id), s = standVan(a, v);
    var deel = HV.ui.lees('gar-deel-' + a.id, 'status');
    var kopHtml = '<header class="hv-gar-vkop" data-k="vkop-' + h(a.id) + '"><span class="hv-gar-vkop__teken' + (s.toon ? ' hv-toon-' + s.toon : '') + '">' + HV.icoon(icoonVan(a), { maat: 'xl' }) + '</span>' +
      '<div class="hv-gar-vkop__tekst"><h2>' + h(HV.p(a.naam)) + '</h2><p>' + nb([HV.icoon(s.icoon, { maat: 's' }) + h(s.woord), h(a.st.vergrendeld ? t('замкнено', 'vergrendeld') : t('відімкнено', 'ontgrendeld')), a.st.km ? h(HV.getal(a.st.km) + ' ' + t('км пробігу', 'km gereden')) : '']) + '</p>' +
      o.stempel({ waarde: h(a.beschikbaar === 'slaapt' ? HV.woord.slaapt() : HV.woord.live()), leeftijd: HV.kijk.leeftijd(a), bron: t('Симулятор', 'Simulator'), staat: a.beschikbaar !== 'ok' ? a.beschikbaar : null }) + '</div>' +
      '<div class="hv-gar-vkop__rechts">' + o.knop({ tekst: t('Швидке керування', 'Snelle bediening'), icoon: 'sliders-horizontal', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:' + a.id }, k: 'vkop-blad' }) + '</div></header>';
    var tabs = o.segment({ label: t('Частини картки', 'Delen van de kaart'), waarde: deel, actie: 'ui', gegevens: { naam: 'gar-deel-' + a.id }, klas: 'hv-gar-deeltabs', k: 'vdeel-' + a.id, opties: VDELEN.map(function (d) { return { id: d[0], label: HV.p(d[1]), icoon: d[2] }; }) });
    var lijf;
    if (deel === 'laden') {
      if (a.id === 'ev') lijf = '<div class="hv-gar-rooster hv-gar-rooster--twee">' + kaart('', kop('calendar-clock', t('План зарядки', 'Laadplan'), naar(t('Енергія', 'Energie'), 'energie-laden', 'chevron-right'), 'auto') + (o.laadplan ? o.laadplan(ctx, { compact: true }) : '')) + '<div class="hv-gar-kolom">' + ladingKaart(ctx, a) + klimaatKaart(ctx, a) + '</div></div>';
      else lijf = '<div class="hv-gar-rooster hv-gar-rooster--twee">' + ladingKaart(ctx, a) + kaart('', kop('info', t('Як це працює', 'Hoe het werkt')) + '<ul class="hv-gar-lijst">' +
        [t('Пальне хаб не заправляє й не планує — лише показує рівень і нагадує.', 'De hub tankt en plant geen brandstof — hij toont het niveau en herinnert.'), t('Рівень і пробіг приходять, коли авто не спить; «Розбудити» оновлює дані.', 'Niveau en km-stand komen binnen als de auto niet slaapt; ‘Wekken’ ververst de gegevens.')]
          .concat(isTwee(a) ? [t('Зарядка йде через розумну розетку в гаражі; межа 80 % береже акумулятор.', 'Laden gaat via de slimme stekker in de garage; de grens van 80 % spaart de accu.'), t('Уночі зарядка — небезпечна дія: рейка утримання для людини, окремий дозвіл для автоматизацій.', '’s Nachts laden is een gevaarlijke actie: houdrail voor een mens, eigen toestemming voor automatiseringen.')] : [])
          .slice(isTwee(a) ? 2 : 0).map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul>') + '</div>';
    } else if (deel === 'ritten') lijf = rittenHtml(ctx, a);
    else if (deel === 'onderhoud') lijf = onderhoudHtml(ctx, a);
    else {
      var kol1 = ladingKaart(ctx, a) + kaart('hv-gar-slot', kop(a.st.vergrendeld ? 'lock-keyhole' : 'lock-keyhole-open', t('Замок і сигналізація', 'Slot en alarm')) + slotOrganen(ctx, a));
      var kol2 = a.soort === 'auto' ? kaart('hv-gar-silkaart', kop('car', t('Силует', 'Silhouet'), a.beschikbaar === 'slaapt' ? '<span class="hv-gar-oud">' + h(t('дані ', 'gegevens ') + HV.oud(HV.kijk.leeftijd(a)) + t(' тому', ' geleden')) + '</span>' : '') + silhouet(a)) : '';
      var kol3 = plekKaart(ctx, a) + (a.id === 'ev' ? klimaatKaart(ctx, a) : '');
      lijf = '<div class="hv-gar-rooster hv-gar-rooster--drie' + (kol2 ? '' : ' is-zonder-sil') + '"><div class="hv-gar-kolom">' + kol1 + '</div>' + (kol2 ? '<div class="hv-gar-kolom">' + kol2 + '</div>' : '') + '<div class="hv-gar-kolom">' + kol3 + '</div></div>';
    }
    return '<div class="hv-gar" data-k="gar-v-' + h(a.id) + '">' + '<div class="hv-gar-terug">' + o.knop({ tekst: t('Увесь транспорт', 'Alle voertuigen'), icoon: 'chevron-left', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'garage-voertuigen' }, k: 'gar-terug' }) + '</div>' +
      voertuigWissel(ctx, a.id) + kopHtml + tabs + '<div class="hv-gar-deel" data-k="vdeel-lijf-' + h(a.id + '-' + deel) + '">' + lijf + '</div></div>';
  }
  function renderVoertuigen(ctx) {
    var w = ctx.staat, A = w.apparaten, id = ctx.route.object;
    if (id && A[id] && VSOORTEN.indexOf(A[id].soort) >= 0) return voertuigPagina(ctx, A[id]);
    var filter = HV.ui.lees('gar-vfilter', 'alle');
    var lijst = VOERTUIGEN.filter(function (x) { return filter === 'alle' || (filter === 'auto' ? A[x].soort === 'auto' : isTwee(A[x])); });
    var dicht = VOERTUIGEN.filter(function (x) { return A[x].st.vergrendeld; }).length;
    return '<div class="hv-gar" data-k="gar-voertuigen">' +
      '<div class="hv-gar-balkje"><div class="hv-filter" role="group" aria-label="' + h(t('Фільтр', 'Filter')) + '">' + [['alle', t('Усі', 'Alle')], ['auto', t('Авто', 'Auto’s')], ['twee', t('Двоколісні', 'Tweewielers')]].map(function (f) {
        return o.chip({ filter: true, gekozen: filter === f[0], tekst: f[1], actie: 'ui', gegevens: { naam: 'gar-vfilter', waarde: f[0] }, k: 'vf-' + f[0] });
      }).join('') + '</div><span class="hv-gar-balkje__feit">' + HV.icoon('lock-keyhole', { maat: 's' }) + h(t('замкнено ', 'vergrendeld ') + dicht + t(' з ', ' van ') + VOERTUIGEN.length) + '</span>' +
      o.knop({ tekst: t('Замкнути все', 'Alles vergrendelen'), icoon: 'lock-keyhole', klein: true, actie: 'gar-allesdicht', uit: dicht === VOERTUIGEN.length, k: 'gar-allesdicht' }) + '</div>' +
      '<div class="hv-gar-vlijst is-groot">' + lijst.map(function (x) { return voertuigKaart(ctx, A[x]); }).join('') + '</div>' +
      kaart('', kop('map', t('Що де', 'Wat is waar'), naar(t('Мапа', 'Kaart'), 'garage-kaart', 'chevron-right')) + watIsWaar(ctx)) + '</div>';
  }

  // ── Роботи ──
  function robotPagina(ctx, a) {
    var html = ROBOT_HTML[a.soort](ctx, a, false);
    var hist = HV.staat.w.logboek.filter(function (r) { return r.doel === a.id; }).slice(0, 6);
    var onderhoud = a.soort === 'stofzuiger' ? [['brush', ['Основна щітка', 'Hoofdborstel'], a.st.borstel + ' %'], ['filter', ['Фільтр', 'Filter'], a.st.filter + ' %'], ['trash-2', ['Стоянка спорожнює контейнер', 'Het station leegt de stofbak'], t('сама', 'vanzelf')]]
      : a.soort === 'maaier' ? [['scissors', ['Ножі', 'Messen'], t('ще ', 'nog ') + a.st.messen + t(' год', ' u')], ['sun-dim', ['Сезон', 'Seizoen'], t('до кінця листопада', 'tot eind november')]]
        : [['snowflake', ['Зимова підготовка', 'Winterklaar maken'], t('злити воду', 'water aftappen')], ['droplets', ['Витрата за тиждень', 'Verbruik deze week'], '410 ' + t('л', 'l')]];
    return '<div class="hv-gar" data-k="gar-r-' + h(a.id) + '"><div class="hv-gar-terug">' + o.knop({ tekst: t('Усі роботи', 'Alle robots'), icoon: 'chevron-left', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'garage-robots' }, k: 'gar-terug' }) + '</div>' +
      '<div class="hv-gar-rooster hv-gar-rooster--twee is-breed-links">' + kaart('hv-gar-robotpagina', kop(icoonVan(a), HV.p(a.naam), o.knop({ tekst: t('Швидке керування', 'Snelle bediening'), icoon: 'sliders-horizontal', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }), a.st.stand === 'bezig' || a.st.aan ? 'aan' : null) + html) +
      '<div class="hv-gar-kolom">' + kaart('', kop('wrench', t('Догляд', 'Onderhoud')) + '<div class="hv-rijen">' + onderhoud.map(function (r, i) { return o.rij({ icoon: r[0], naam: HV.p(r[1]), waarde: h(r[2]), k: 'roh-' + i }); }).join('') + '</div>' +
        (a.soort === 'stofzuiger' ? '<div class="hv-knoppen">' + o.chip({ icoon: 'flask-conical', tekst: t('Симулювати: застряг', 'Simuleren: vast'), actie: 'gar-fout', k: 'sim-fout' }) + '</div>' : '')) +
      kaart('', kop('history', t('Останні дії', 'Laatste acties')) + (hist.length ? '<ul class="hv-berichten">' + hist.map(function (r) { return o.bericht(r, { open: HV.ui.lees('bericht', null) === r.id }); }).join('') + '</ul>' : o.leeg({ icoon: 'history', titel: t('Ще немає записів', 'Nog geen regels'), tekst: t('Кожна дія з’явиться тут зі знаком автора.', 'Elke actie komt hier te staan, met wie het deed.') }))) + '</div></div></div>';
  }
  function renderRobots(ctx) {
    var A = ctx.staat.apparaten, id = ctx.route.object;
    if (id && A[id] && ROBOTS.indexOf(A[id].soort) >= 0) return robotPagina(ctx, A[id]);
    return '<div class="hv-gar" data-k="gar-robots"><div class="hv-gar-robots is-groot">' + ROBOTS.map(function (x) { return robotMini(ctx, A[x], true); }).join('') + '</div>' +
      kaart('', kop('calendar-clock', t('Розклад тижня', 'Weekrooster')) + ROBOTS.map(function (x) { return veld(HV.p(A[x].naam), roosterHtml(ctx, x)); }).join('') +
        '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('«Зупинити самостійні дії» спиняє розклад роботів; ручне керування лишається.', '‘Zelfstandige acties stoppen’ zet het rooster van de robots stil; handmatige bediening blijft.')) + '</span></p>') + '</div>';
  }

  // ── Мапа ──
  var LAGEN = [['voertuigen', ['Транспорт', 'Voertuigen'], 'car'], ['geozones', ['Геозони', 'Geozones'], 'radar'], ['bereik', ['Досяжність', 'Bereik'], 'locate'], ['routes', ['Маршрути', 'Routes'], 'route'], ['robots', ['Роботи', 'Robots'], 'garage-maaier']];
  function renderKaart(ctx) {
    var w = ctx.staat;
    var schaal = HV.ui.lees('gar-schaal', 'perceel');
    var lagen = HV.ui.lees('gar-lagen', null) || { voertuigen: true, geozones: true, bereik: true, routes: true, robots: true };
    var terug = Number(HV.ui.lees('gar-terug', 0)) || 0;
    var tijd = w.tijd - terug * UUR;
    var schaalSeg = o.segment({ label: t('Масштаб', 'Schaal'), waarde: schaal, actie: 'ui', gegevens: { naam: 'gar-schaal' }, k: 'gar-schaal', opties: [
      { id: 'perceel', label: t('Ділянка', 'Perceel'), icoon: 'trees' }, { id: 'buurt', label: t('Околиці', 'Omgeving'), icoon: 'map' }, { id: 'regio', label: t('Регіон', 'Regio'), icoon: 'compass' }] });
    var lagenChips = '<div class="hv-filter" role="group" aria-label="' + h(t('Шари', 'Lagen')) + '">' + LAGEN.filter(function (l) { return schaal === 'perceel' ? ['voertuigen', 'robots'].indexOf(l[0]) >= 0 : l[0] !== 'robots'; }).map(function (l) {
      return o.chip({ filter: true, gekozen: !!lagen[l[0]], icoon: l[2], tekst: HV.p(l[1]), actie: 'gar-laag', gegevens: { laag: l[0] }, k: 'laag-' + l[0] });
    }).join('') + '</div>';
    var tijdVeld = veld(t('Перегляд минулого', 'Terugblik'), o.schuif({ label: t('Годин тому', 'Uur geleden'), waarde: terug, min: 0, max: 24, stap: 1, eenheid: t('год', 'u'), toon: 'neutraal', actie: 'gar-terug', k: 'gar-terug-schuif' }) +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('history', { maat: 's' }) + '<span>' + h(terug ? t('Показано стан о ', 'Toestand om ') + HV.tijd(tijd) + (dagBegin(tijd) < dagBegin(w.tijd) ? t(' учора', ' gisteren') : '') + t(' — місця з журналу маячків.', ' — locaties uit het bakenlogboek.') : t('Зараз. Потягніть, щоб побачити, де що стояло за останню добу.', 'Nu. Schuif om te zien waar alles stond in het laatste etmaal.')) + '</span></p>');
    var legenda = '<ul class="hv-gar-legenda">' + (schaal === 'perceel'
      ? [['is-gras', t('зона косарки', 'maaizone')], ['is-sproei', t('зона поливу', 'beregeningszone')], ['is-vlieg', t('межа польоту дрона', 'vlieggrens van de drone')]]
      : schaal === 'regio' ? [['is-auto', t('досяжність електромобіля: суцільно — туди й назад, штрих — в один бік', 'bereik van de elektrische auto: doorgetrokken — heen en terug, streep — enkele reis')], ['is-twee', t('досяжність велосипеда', 'bereik van de e-bike')]]
      : [['is-geozone', t('геозона', 'geozone')], ['is-twee', t('досяжність двоколісних туди й назад', 'bereik van de tweewielers heen en terug')], ['is-oud', t('застаріле місце — штрих і вік', 'verouderde locatie — streep en leeftijd')]]).map(function (x) { return '<li><span class="hv-gar-legenda__merk ' + x[0] + '" aria-hidden="true"></span>' + h(x[1]) + '</li>'; }).join('') + '</ul>';
    var noot = schaal === 'perceel' ? t('Зони польоту на сайті лише довідкові; перед польотом перевірте офіційну карту.', 'Vliegzones op de site zijn ter informatie; controleer vóór de vlucht de officiële kaart.') : t('Схема доріг — від сервера дому, без зовнішніх мап. Місце людини бачить лише той, кому дозволено.', 'Het wegenschema komt van de server van het huis, zonder externe kaarten. De locatie van een mens ziet alleen wie dat mag.');
    return '<div class="hv-gar" data-k="gar-kaart"><div class="hv-gar-rooster hv-gar-rooster--twee is-breed-links">' +
      kaart('hv-gar-grootkaart', '<div class="hv-gar-kaartbalk">' + schaalSeg + '</div>' + lagenChips + '<div class="hv-gar-kaartje is-groot' + (terug ? ' is-verleden' : '') + '" data-k="gar-kaart-' + schaal + '">' + landkaart(ctx, { schaal: schaal, lagen: lagen, tijd: tijd }) + '</div>' + legenda + tijdVeld +
        '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(noot) + '</span></p>') +
      kaart('', kop('list', t('Що де', 'Wat is waar')) + watIsWaar(ctx, tijd)) + '</div></div>';
  }

  // ───────────────────────── 13. Реєстрація ─────────────────────────
  HV.scherm({ id: 'garage', sectie: 'garage', titel: ['Гараж', 'Garage'], icoon: 'car', adres: '/garage', tabs: [
    { id: 'nu', titel: ['Зараз', 'Nu'], adres: '/garage', render: renderNu },
    { id: 'voertuigen', titel: ['Транспорт', 'Voertuigen'], adres: '/garage/voertuigen/:object', render: renderVoertuigen },
    { id: 'robots', titel: ['Роботи', 'Robots'], adres: '/garage/robots/:object', render: renderRobots },
    { id: 'kaart', titel: ['Мапа', 'Kaart'], adres: '/garage/kaart', render: renderKaart }
  ] });

  // ── Аркуші пристроїв ──
  function voertuigBlad(ctx, a) {
    var v = vtg(a.id), s = standVan(a, v);
    return kaart('', telemetrieVan(ctx, a, false) + '<p class="hv-gar-bladstand">' + HV.icoon(s.icoon, { maat: 's' }) + h(s.woord) + '</p>') +
      kaart('', slotOrganen(ctx, a)) +
      (a.id === 'ev' ? klimaatKaart(ctx, a, !opEigenPagina(ctx, a)) : '') +
      (isTwee(a) ? ladingKaart(ctx, a, !opEigenPagina(ctx, a)) : '') +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити картку', 'Kaart openen'), icoon: 'chevron-right', soort: 'gewoon', actie: 'ga', gegevens: { naar: 'garage-voertuigen-' + a.id }, k: 'blad-kaart' }) + o.knop({ tekst: t('Мапа', 'Kaart'), icoon: 'map', soort: 'stil', actie: 'ga', gegevens: { naar: 'garage-kaart' } }) + '</div>';
  }
  VSOORTEN.forEach(function (soort) {
    HV.blad({ soort: soort, past: function (a) { return a.soort === soort; }, delen: { bediening: voertuigBlad } });
  });
  ROBOTS.forEach(function (soort) {
    HV.blad({ soort: soort, past: function (a) { return a.soort === soort; }, delen: { bediening: function (ctx, a) {
      return kaart('', ROBOT_HTML[soort](ctx, a, true, !opEigenPagina(ctx, a))) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити сторінку', 'Pagina openen'), icoon: 'chevron-right', actie: 'ga', gegevens: { naar: 'garage-robots-' + a.id }, k: 'blad-robot' }) + '</div>';
    } } });
  });

  // ── Вільні аркуші ──
  HV.blad({ soort: 'gestolen', vrij: true, icoon: 'flag', titel: function (ctx, id) { var a = app(id); return a ? (a.st.stand === 'v-gestolen' ? t('Знайдено? ', 'Teruggevonden? ') : t('Позначити викраденим: ', 'Markeren als gestolen: ')) + HV.p(a.naam) : t('Позначити викраденим', 'Markeren als gestolen'); },
    sub: function () { return t('Транспорт', 'Voertuigen'); },
    render: function (ctx, id) {
      var a = app(id);
      if (!a) return o.leeg({ icoon: 'circle-help', titel: t('Транспорт не знайдено', 'Voertuig niet gevonden') });
      var gestolen = a.st.stand === 'v-gestolen';
      return kaart('', '<div class="hv-gar-dialoog">' + o.gevolg(t('Що станеться: маячок надсилатиме місце щохвилини, сліди зберігатимуться до зняття позначки, а сигналізація ввімкнеться. Пов’язано з: поліції хаб нічого не надсилає — експорт слідів ви робите самі. Як повернути: «Знайдено» — один дотик.', 'Wat er gebeurt: het baken stuurt elke minuut de locatie, de sporen blijven bewaard tot je de markering opheft, en het alarm gaat aan. Hangt samen met: de hub stuurt niets naar de politie — de sporen exporteer je zelf. Terugdraaien: ‘Teruggevonden’ — één tik.'), { kop: t('Позначити викраденим', 'Markeren als gestolen') }) +
        '<p class="hv-tekst">' + h(gestolen ? t('Позначку поставлено. Місце оновлюється щохвилини; останнє — на мапі.', 'De markering staat aan. De locatie ververst elke minuut; de laatste staat op de kaart.') : t('Маячок надсилатиме місце щохвилини, сигналізація ввімкнеться, сліди зберігатимуться довше за звичайні 30 днів.', 'Het baken stuurt elke minuut de locatie, het alarm gaat aan, de sporen blijven langer dan de gewone 30 dagen bewaard.')) + '</p>' +
        '<p class="hv-tekst hv-tekst--zacht">' + o.risico(gestolen ? 'gewoon' : 'gevoelig') + ' ' + h(t('Поліції хаб нічого не надсилає.', 'De hub stuurt niets naar de politie.')) + '</p>' +
        '<div class="hv-knoppen">' + (gestolen ? o.knop({ tekst: t('Знайдено — зняти позначку', 'Teruggevonden — markering opheffen'), icoon: 'circle-check-big', soort: 'hoofd', actie: 'gar-gestolen', gegevens: { doel: id, waarde: 'v-gevonden' } })
          : o.knop({ tekst: t('Позначити викраденим', 'Markeren als gestolen'), icoon: 'flag', soort: 'hoofd', actie: 'gar-gestolen', gegevens: { doel: id, waarde: 'v-gestolen' } })) +
        o.knop({ tekst: t('Скасувати', 'Annuleren'), soort: 'stil', actie: 'blad-sluit' }) + '</div></div>');
    } });
  HV.blad({ soort: 'zichtbaarheid', vrij: true, icoon: 'users', titel: function (ctx, id) { var a = app(id); return t('Хто бачить місце: ', 'Wie ziet de locatie: ') + (a ? HV.p(a.naam) : ''); },
    sub: function () { return t('Приватність місця', 'Privacy van de locatie'); },
    render: function (ctx, id) {
      var a = app(id), g = zorg(ctx.staat);
      if (!a) return o.leeg({ icoon: 'circle-help', titel: t('Транспорт не знайдено', 'Voertuig niet gevonden') });
      return kaart('', '<p class="hv-tekst">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Місце транспорту — це місце людини, яка на ньому їде. Типово його бачить лише власник.', 'De locatie van een voertuig is de locatie van wie erop rijdt. Standaard ziet alleen de eigenaar die.')) + '</span></p>' +
        veld(t('Хто бачить', 'Wie ziet het'), o.segment({ label: t('Хто бачить місце', 'Wie ziet de locatie'), waarde: g.zicht[id], actie: 'gar-zicht', gegevens: { doel: id }, klas: 'hv-segment--rol', k: 'zicht-seg', opties: [
          { id: 'eigenaar', label: t('Лише власник', 'Alleen de eigenaar'), icoon: 'user' }, { id: 'gezin', label: t('Уся родина', 'Het hele gezin'), icoon: 'users' }, { id: 'niemand', label: t('Ніхто', 'Niemand'), icoon: 'eye-off' }] })) +
        veld(t('Відстеження', 'Volgen'), '<div class="hv-knoppen">' + o.knop({ tekst: g.volgen[id] ? t('Пауза відстеження', 'Volgen pauzeren') : t('Відновити відстеження', 'Volgen hervatten'), icoon: g.volgen[id] ? 'eye-off' : 'eye', actie: 'gar-volgen', gegevens: { doel: id }, k: 'volgen-knop' }) + '</div>' +
          '<p class="hv-tekst hv-tekst--zacht">' + h(t('На паузі місце не записується й не показується нікому, зокрема агентам. Сліди зберігаються 30 днів.', 'Gepauzeerd wordt de locatie niet bewaard en aan niemand getoond, ook niet aan agenten. Sporen blijven 30 dagen bewaard.')) + '</p>') +
        o.rij({ icoon: 'list', naam: t('Дозволи агентів на місце', 'Toestemmingen van agenten voor de locatie'), sub: t('у реєстрі дозволів', 'in het toestemmingsregister'), actie: 'ga', gegevens: { naar: 'instellingen-risico' } }));
    } });
  HV.blad({ soort: 'motor', vrij: true, icoon: 'octagon-x', titel: ['Запуск двигуна відхилено', 'Motorstart geweigerd'],
    sub: function (ctx, id) { var a = app(id); return a ? HV.p(a.naam) : ''; },
    render: function (ctx, id) {
      var a = app(id);
      return kaart('hv-gar-weiger', '<dl class="hv-gar-weiger__rijen">' +
        '<div><dt>' + HV.icoon('octagon-x', { maat: 's' }) + h(t('Чому ні', 'Waarom niet')) + '</dt><dd>' + h(t('Дистанційний запуск двигуна вимкнено в цьому домі: у зачиненому гаражі за кілька хвилин накопичується чадний газ, а хаб не бачить, де стоїть авто й чи відчинено ворота.', 'Op afstand starten staat uit in dit huis: in een gesloten garage hoopt koolmonoxide zich binnen enkele minuten op, en de hub ziet niet waar de auto staat en of de deur open is.')) + '</dd></div>' +
        '<div><dt>' + HV.icoon('search', { maat: 's' }) + h(t('Що перевірити', 'Wat te controleren')) + '</dt><dd>' + h(t('Рішення про запуск ухвалює власник окремо, з умовами: авто надворі, ворота відчинені, датчик чадного газу в гаражі.', 'Het besluit over starten neemt de eigenaar apart, met voorwaarden: de auto buiten, de deur open, een koolmonoxidemelder in de garage.')) + '</dd></div>' +
        '<div><dt>' + HV.icoon('circle-check-big', { maat: 's' }) + h(t('Що можна натомість', 'Wat wel kan')) + '</dt><dd>' + h(a && a.id === 'ev' ? t('«Клімат салону» прогріває електромобіль без двигуна — від станції чи акумулятора.', '‘Voorklimatiseren’ verwarmt de elektrische auto zonder motor — via de laadpaal of de accu.') : t('Прогріти салон можна лише в авто з електричним кліматом; для бензинового — розморожувач скла.', 'Het interieur voorverwarmen kan alleen in een auto met elektrisch klimaat; voor de benzineauto — ruitontdooier.')) + '</dd></div></dl>' +
        '<div class="hv-knoppen">' + (a && a.id === 'ev' ? o.knop({ tekst: t('Увімкнути клімат салону', 'Voorklimatiseren aanzetten'), icoon: 'fan', soort: 'hoofd', actie: 'gar-klimaat', gegevens: { doel: 'ev', aan: '1' } }) : '') + o.knop({ tekst: t('Зрозуміло', 'Begrepen'), soort: 'stil', actie: 'blad-sluit' }) + '</div>');
    } });

  // ───────────────────────── 14. Дії ─────────────────────────
  HV.actie('gar-klimaat', function (ctx, g) {
    var a = app(g.doel || 'ev');
    var aan = g.aan ? true : gewenst(a, 'bron') !== 'v-klimaat-aan';
    HV.doe({ doel: a.id, mogelijkheid: 'bron', waarde: aan ? 'v-klimaat-aan' : 'v-klimaat-uit' }).then(function (r) { if (r && r.ok && g.aan) HV.bladOpen(null); });
  });
  HV.actie('gar-klimdoel', function (ctx, g) {
    var a = app(g.doel), nu = Number(gewenst(a, 'doel'));
    var nieuw = Math.max(16, Math.min(26, Math.round((nu + Number(g.richting) * 0.5) * 2) / 2));
    if (nieuw !== nu) HV.doe({ doel: a.id, mogelijkheid: 'doel', waarde: nieuw });
  });
  HV.actie('gar-evladen', function (ctx, g) { HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: !!g.aan, waarom: ['з картки електромобіля', 'vanaf de kaart van de elektrische auto'] }); });
  HV.actie('gar-accu', function (ctx, g) {
    var a = app(g.doel);
    HV.doe({ doel: a.id, mogelijkheid: 'laden', waarde: !gewenst(a, 'laden'), waarom: g.nu ? ['з «Зараз важливо»', 'vanuit ‘Nu belangrijk’'] : null });
  });
  HV.actie('gar-laadtot', function (ctx, g) { if (g.fase === 'klaar') HV.doe({ doel: g.doel, mogelijkheid: 'positie', waarde: Math.round(Number(g.waarde)) }); });
  HV.actie('gar-zoek', function (ctx, g) {
    var a = app(g.doel);
    HV.doe({ doel: a.id, mogelijkheid: 'signaal', waarde: a.soort === 'auto' ? t('фари й сигнал', 'lichten en claxon') : t('короткий звук', 'kort geluid') });
  });
  // «Розбудити»: стан очікування видно одразу (a.wacht → «будимо · очікує відповіді» на картці й на кнопці); сповіщення каже
  // результат, а не назву команди; коли кнопка зникає, фокус переходить на картку авто (або сусідню дію), а не на BODY.
  HV.actie('gar-wek', function (ctx, g, element) {
    var a = app(g.doel);
    if (!a || wektNu(a)) return;
    var voorouders = [];
    for (var el = element; el && el.nodeType === 1; el = el.parentElement) voorouders.push(el);
    HV.doe({ doel: a.id, mogelijkheid: 'signaal', waarde: t('розбудити', 'wekken'), stil: true }).then(function (r) {
      if (!r || !r.ok) return;
      HV.staat.wijzig(function (w) { a.beschikbaar = 'ok'; a.gezien = w.tijd; zorg(w).wakkerTot = w.tijd + 10 * MIN; });
      HV.meld({ maker: HV.mens(), icoon: 'car', titel: HV.p(a.naam) + ': ' + t('на зв’язку', 'wakker'), tekst: t('спало → на зв’язку · дані оновлено, знову засне за 10 хв', 'sliep → wakker · gegevens ververst, slaapt over 10 min weer') });
      var naFocus = function () {
        var actief = document.activeElement;
        if (voorouders[0] && voorouders[0].isConnected) return; // кнопка лишилася на місці
        if (actief && actief !== document.body && actief !== voorouders[0] && actief.isConnected) return; // людина вже перейшла далі
        for (var i = 1; i < voorouders.length; i++) {
          if (!voorouders[i].isConnected) continue;
          var doel = voorouders[i].querySelector('.hv-telemetrie__lijf[data-actie], [data-k="zoek-' + a.id + '"]');
          if (doel) { doel.focus({ preventScroll: true }); return; }
          if (voorouders[i].classList.contains('hv-gar') || voorouders[i].classList.contains('hv-laag')) return;
        }
      };
      var raf = window.requestAnimationFrame || function (f) { setTimeout(f, 16); };
      raf(function () { raf(naFocus); });
    });
  });
  HV.actie('gar-motor', function (ctx, g) {
    var a = app(g.doel);
    noteer({ maker: SIM, wat: [a.naam[0] + ': запуск двигуна відхилено', a.naam[1] + ': motorstart geweigerd'], waarom: ['дистанційний запуск вимкнено (чадний газ)', 'starten op afstand staat uit (koolmonoxide)'], gewicht: 'belangrijk', doel: a.id, icoon: 'octagon-x', stil: true });
    HV.bladOpen('motor:' + a.id);
  });
  HV.actie('gar-gestolen', function (ctx, g) {
    HV.doe({ doel: g.doel, mogelijkheid: 'stand', waarde: g.waarde }).then(function (r) {
      if (!r || !r.ok) return;
      if (g.waarde === 'v-gestolen') HV.doe({ doel: g.doel, mogelijkheid: 'modus', waarde: 'v-alarm-aan', stil: true, waarom: ['позначено викраденим', 'gemarkeerd als gestolen'] });
      HV.bladOpen(null);
    });
  });
  HV.actie('gar-allesdicht', function () {
    var A = HV.staat.w.apparaten;
    VOERTUIGEN.filter(function (id) { return !A[id].st.vergrendeld; }).forEach(function (id) { HV.doe({ doel: id, mogelijkheid: 'vergrendeld', waarde: true, waarom: ['«Замкнути все»', '‘Alles vergrendelen’'] }); });
  });
  HV.actie('gar-robot', function (ctx, g) {
    var a = app(g.doel), z = zorg(HV.staat.w);
    var waarom = null;
    if (g.waarde === 'start' && a.soort === 'stofzuiger') waarom = [z.stofKamers.map(function (k) { return HV.staat.kamer(k).naam[0]; }).join(', '), z.stofKamers.map(function (k) { return HV.staat.kamer(k).naam[1]; }).join(', ')];
    if (g.waarde === 'start' && a.soort === 'maaier') waarom = [z.maaiZones.map(function (k) { return ZONES_MAAI.filter(function (x) { return x.id === k; })[0].naam[0]; }).join(', '), z.maaiZones.map(function (k) { return ZONES_MAAI.filter(function (x) { return x.id === k; })[0].naam[1]; }).join(', ')];
    if (g.waarde === 'start' && a.soort === 'beregening') { HV.doe({ doel: a.id, mogelijkheid: 'aan', waarde: true }); return; }
    HV.doe({ doel: a.id, mogelijkheid: 'robot', waarde: g.waarde, waarom: waarom }).then(function (r) {
      if (r && r.ok && g.waarde === 'start') HV.staat.wijzig(function () { a.st.fout = null; a.st.pauzeReden = null; });
    });
  });
  HV.actie('gar-water', function (ctx, g) { var a = app(g.doel); HV.doe({ doel: a.id, mogelijkheid: 'aan', waarde: !gewenst(a, 'aan') }); });
  /** Вибір зі списку (кімнати, зони): чернетка наступного запуску, а не команда — у Журнал іде запуск із переліком. */
  function wissel(lijst, id) { var i = lijst.indexOf(id); if (i >= 0) { if (lijst.length > 1) lijst.splice(i, 1); else HV.meld({ icoon: 'info', titel: t('Потрібна хоча б одна', 'Er is er minstens één nodig'), tekst: t('Оберіть іншу, перш ніж зняти цю.', 'Kies eerst een andere voordat je deze uitzet.') }); } else lijst.push(id); }
  HV.actie('gar-kamer', function (ctx, g) { HV.staat.wijzig(function (w) { wissel(zorg(w).stofKamers, g.kamer); }); });
  HV.actie('gar-maaizone', function (ctx, g) { HV.staat.wijzig(function (w) { wissel(zorg(w).maaiZones, g.zone); }); });
  HV.actie('gar-waterzone', function (ctx, g) { HV.staat.wijzig(function (w) { wissel(zorg(w).beregZones, g.zone); }); });
  HV.actie('gar-waterduur', function (ctx, g) {
    if (!magMens('gewoon')) return;
    var z = zorg(HV.staat.w), was = z.beregDuur, nieuw = Math.max(5, Math.min(30, was + Number(g.richting) * 5));
    if (nieuw === was) return;
    z.beregDuur = nieuw;
    noteer({ wat: ['Полив: тривалість на зону', 'Beregening: duur per zone'], was: [was + ' хв', was + ' min'], werd: [nieuw + ' хв', nieuw + ' min'], soort: 'huis.apparaat', doel: 'beregening', icoon: 'sprout', terug: function () { z.beregDuur = was; HV.staat.wijzig(); } });
  });
  HV.actie('gar-regenstop', function () {
    if (!magMens('gevoelig')) return;
    var z = zorg(HV.staat.w), was = z.regenStop;
    z.regenStop = !was;
    var naam = function (v) { return v ? ['пропускати після дощу', 'overslaan na regen'] : ['поливати попри дощ', 'sproeien ondanks regen']; };
    noteer({ wat: ['Полив: правило дощу', 'Beregening: regenregel'], was: naam(was), werd: naam(!was), soort: 'huis.apparaat', doel: 'beregening', icoon: 'cloud-rain', terug: function () { z.regenStop = was; HV.staat.wijzig(); } });
  });
  HV.actie('gar-pauzeregel', function (ctx, g) {
    if (!magMens('gevoelig')) return;
    var z = zorg(HV.staat.w), was = z.pauze[g.regel], p = PAUZE[g.regel];
    z.pauze[g.regel] = !was;
    var naam = function (v) { return v ? ['пауза ввімкнена', 'pauze aan'] : ['пауза вимкнена', 'pauze uit']; };
    noteer({ wat: ['Косарка: правило «' + p.naam[0] + '»', 'Robotmaaier: regel ‘' + p.naam[1] + '’'], was: naam(was), werd: naam(!was), soort: 'huis.apparaat', doel: 'maaier', icoon: p.icoon, gewicht: was ? 'belangrijk' : 'info', terug: function () { z.pauze[g.regel] = was; HV.staat.wijzig(); } });
  });
  HV.actie('gar-rooster', function (ctx, g) {
    if (!magMens('gewoon')) return;
    var z = zorg(HV.staat.w), lijst = z.rooster[g.robot], i = lijst.indexOf(g.dag), a = app(g.robot);
    var dag = DAGEN.filter(function (d) { return d[0] === g.dag; })[0][1];
    if (i >= 0) lijst.splice(i, 1); else lijst.push(g.dag);
    var aan = i < 0;
    noteer({ wat: [a.naam[0] + ': розклад, ' + dag[0], a.naam[1] + ': rooster, ' + dag[1]], was: aan ? ['вихідний', 'vrij'] : ['працює', 'werkt'], werd: aan ? ['працює', 'werkt'] : ['вихідний', 'vrij'], soort: 'huis.automatisering', doel: a.id, icoon: 'calendar-clock',
      terug: function () { var j = lijst.indexOf(g.dag); if (aan && j >= 0) lijst.splice(j, 1); else if (!aan && j < 0) lijst.push(g.dag); HV.staat.wijzig(); } });
  });
  HV.actie('gar-iemand', function () {
    var z = zorg(HV.staat.w);
    z.iemandInTuin = !z.iemandInTuin;
    noteer({ maker: SIM, wat: z.iemandInTuin ? ['Симуляція: хтось у саду', 'Simulatie: iemand in de tuin'] : ['Симуляція: у саду нікого', 'Simulatie: niemand in de tuin'], soort: 'huis.simulatie', icoon: 'flask-conical' });
  });
  HV.actie('gar-fout', function (ctx, g) {
    var a = app('stofzuiger');
    if (g.weg) { HV.doe({ doel: 'stofzuiger', mogelijkheid: 'robot', waarde: 'start', waarom: ['щітку звільнено', 'borstel vrijgemaakt'] }).then(function (r) { if (r && r.ok) HV.staat.wijzig(function () { a.st.fout = null; }); }); return; }
    HV.staat.wijzig(function (w) {
      if (a.st.stand !== 'bezig') { a.st.stand = 'bezig'; a.st.voortgang = 35; }
      a.st.fout = 'E2'; a.st.stand = 'pauze'; a.st.kamerNu = a.st.kamerNu || 'woonkamer';
      void w;
    });
    noteer({ maker: SIM, wat: ['Пилосос застряг: код E2', 'Robotstofzuiger zit vast: code E2'], waarom: ['симуляція', 'simulatie'], soort: 'huis.apparaat', gewicht: 'belangrijk', doel: 'stofzuiger', icoon: 'triangle-alert' });
  });
  HV.actie('gar-volgen', function (ctx, g) {
    if (!magMens('gevoelig')) return;
    var z = zorg(HV.staat.w), a = app(g.doel), was = z.volgen[g.doel];
    z.volgen[g.doel] = !was;
    var naam = function (v) { return v ? ['відстежується', 'wordt gevolgd'] : ['на паузі', 'gepauzeerd']; };
    noteer({ wat: [a.naam[0] + ': відстеження місця', a.naam[1] + ': volgen van de locatie'], was: naam(was), werd: naam(!was), doel: a.id, icoon: was ? 'eye-off' : 'eye', terug: function () { z.volgen[g.doel] = was; HV.staat.wijzig(); } });
  });
  HV.actie('gar-zicht', function (ctx, g) {
    if (!magMens('gevoelig')) return;
    var z = zorg(HV.staat.w), a = app(g.doel), was = z.zicht[g.doel];
    if (was === g.waarde) return;
    var NAAM = { eigenaar: ['лише власник', 'alleen de eigenaar'], gezin: ['уся родина', 'het hele gezin'], niemand: ['ніхто', 'niemand'] };
    z.zicht[g.doel] = g.waarde;
    noteer({ wat: [a.naam[0] + ': хто бачить місце', a.naam[1] + ': wie ziet de locatie'], was: NAAM[was], werd: NAAM[g.waarde], doel: a.id, icoon: 'users', terug: function () { z.zicht[g.doel] = was; HV.staat.wijzig(); } });
  });
  HV.actie('gar-laag', function (ctx, g) {
    var l = HV.ui.lees('gar-lagen', null) || { voertuigen: true, geozones: true, bereik: true, routes: true, robots: true };
    var n = {}; for (var k in l) n[k] = l[k];
    n[g.laag] = !n[g.laag];
    HV.ui.zet('gar-lagen', n);
  });
  HV.actie('gar-terug', function (ctx, g) { if (g.fase === 'klaar') HV.ui.zet('gar-terug', Math.round(Number(g.waarde))); });
  HV.actie('gar-proef', function () {
    var id = HV.ui.lees('gar-uitvoerder', 'automatisering'), u = HV.gevaar.uitvoerder(id);
    HV.doe({ doel: 'ev', mogelijkheid: 'vergrendeld', waarde: true, door: { soort: u.soort, id: u.id, naam: u.naam }, waarom: ['пробний запуск із гаража', 'proefrun vanuit de garage'] }).then(function (r) {
      if (r && r.ok) return;
      if (r && r.reden === 'stand-uit') HV.meld({ icoon: 'info', titel: t('Ворота дозволу спрацювали', 'De toestemmingspoort werkte'), tekst: t('Дозвіл «Вимкнено»: дію не виконано, запис у Журналі.', 'Toestemming ‘Uit’: de actie is niet uitgevoerd, er staat een regel in het logboek.') });
    });
  });
})(window.HV = window.HV || {});
