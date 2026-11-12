// Drones / Безпілотники — вкладка «Гараж → Безпілотники» і все про дрони (HUIS-001, етап 0, зона «drones»).
//
// Маршрути (location.hash): garage-drones (парк, батареї, док, місії, пропозиції агентів) · garage-drones-vlucht (кабіна польоту)
// · garage-drones-missies (місії з маршрутом на схемі ділянки й редактором точок) · garage-drones-vluchten (журнал польотів,
// відтворення, CSV) · garage-drones-regels (правила, межі польоту, зони — довідково, дозволи) · garage-drones-ooievaar|zwaluw
// (картка дрона) · garage-drones-dock (картка дока). Аркуші: «Перевірка перед зльотом» (вільний, opstijgen:<дрон>),
// аркуші пристроїв drone і dronedock (швидке керування з плиток «Сад»).
//
// Засади (план §3.8, дизайн-мова §9–§10, зональна специфікація «Гараж»):
// - Лише симуляція: штамп «Лише симуляція / Alleen simulatie» стоїть на кожній сторінці вкладки; кадр кабіни — намальована схема.
// - Кожна команда йде через HV.doe: зліт — критична дія (перевірка → рейка → підтвердження входу людини); «Зависнути»,
//   «Повернутися додому», «Сісти зараз» — дії безпеки без ритуалу (дизайн-мова §10); «Летіти попри вітер» — небезпечна, з причиною.
// - Дозволи — загальна модель: «Вимкнено · Питати · Завжди» для кожного виконавця й кожної дії, типово «Вимкнено», без стель.
//   Агент лише пропонує місію пілотові; «Завжди» для зльоту власник може ввімкнути сам (з «!»), і тоді агент злітає сам.
// - Політ живе в реальному часі (×4 до часу польоту), стоїть на паузі симуляції. Втрата сигналу робить дрон недоступним для
//   команд (ворота HV.doe «недоступний»), а дрон сам повертається додому — так, як повідомив би адаптер.
//
// Обхід обмежень ядра (див. звіт): дрони паспорта (w.drones) не є пристроями, тож HV.doe не мав цілі — дрони й док додано як
// пристрої саду (soort 'drone' / 'dronedock'); рядок матриці «drone.opstijgen» мав doel:'drone', який HV.gevaar.vind ніколи не
// знаходить, — його переведено на клас 'drone'. Слова команд (зліт, зависає…) — через HV.waardeNaam і можливості з назвами.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var MIN = 60000, DAG = 86400000;
  var DRONES = ['ooievaar', 'zwaluw'];
  var TEMPO = 4;                       // секунд польоту за одну справжню секунду
  var DOCK = { x: 56, y: 38 };         // місце дока на схемі ділянки, метри
  var PERCEEL = { b: 64, h: 44 };      // ділянка 64 × 44 м
  var NUMMER = 'NLD-RDW-7K4Q2';        // номер експлуатанта (симуляція)
  var DATUM_ZONES = '08.11.2026';
  var PERSOONLIJK = ['telefoon', 'bureau', 'breed', 'ultrabreed'];
  var SIM = { soort: 'simulator', naam: ['Симулятор', 'Simulator'] };
  var SYS = { soort: 'systeem', naam: ['Дрон', 'Drone'] };

  // ───────────────────────── 1. Власні знаки ─────────────────────────
  if (HV.eigenIconen && !HV.eigenIconen['drn-dock']) {
    HV.eigenIconen['drn-dock'] = { vak: '0 0 24 24', binnen: '<path d="M3 12h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 12 6.5 5h11L21 12"/><path d="M9 16h6"/><path d="M12 7.5v2"/>' };
  }

  // ───────────────────────── 2. Довідник дронів, батарей і місій ─────────────────────────
  var KORT = { ooievaar: ['«Лелека»', '‘Ooievaar’'], zwaluw: ['«Ластівка»', '‘Zwaluw’'] };
  var SPEC = {
    ooievaar: { klasse: 'C1', massa: 895, sub: 'A1', wind: 12, verbruik: 3.2, vMax: 15, camera: ['4K, тепловізор', '4K, warmtebeeld'], accus: ['b1', 'b3'], vlucht: 31 },
    zwaluw: { klasse: 'C0', massa: 249, sub: 'A1', wind: 10.7, verbruik: 3.6, vMax: 12, camera: ['4K, без тепловізора', '4K, zonder warmtebeeld'], accus: ['b2', 'b4'], vlucht: 28 }
  };
  var RESERVE = 15; // % заряду, що лишається після повернення

  // Маршрути в метрах на схемі ділянки (x — схід, y — південь), висота h у метрах; zweef — секунд над кожною точкою.
  var MISSIES = [
    { id: 'perceel', icoon: 'route', naam: ['Обліт ділянки', 'Rondje perceel'], doel: ['межа, паркан і дах одним колом', 'grens, schutting en dak in één ronde'], snelheid: 4, zweef: 8,
      punten: [[8, 6, 25], [32, 4, 25], [58, 6, 25], [60, 22, 25], [58, 40, 20], [32, 41, 20], [6, 40, 20], [4, 22, 25]] },
    { id: 'dak', icoon: 'house', naam: ['Огляд даху', 'Dakinspectie'], doel: ['черепиця, комин і ринви зблизька', 'dakpannen, schoorsteen en goten van dichtbij'], snelheid: 3, zweef: 40,
      punten: [[18, 10, 20], [26, 10, 20], [34, 10, 20], [34, 16, 25], [26, 16, 25], [18, 16, 25], [18, 22, 20], [26, 22, 20], [34, 22, 35]] },
    { id: 'panelen', icoon: 'sun', naam: ['Огляд сонячних панелей', 'Zonnepanelen bekijken'], doel: ['тепловий знімок кожного ряду панелей', 'warmtebeeld van elke rij panelen'], snelheid: 3, zweef: 30,
      punten: [[18, 18.6, 12], [25, 18.6, 12], [33, 18.6, 12], [33, 21.3, 12], [25, 21.3, 12], [18, 21.3, 12]] }
  ];
  var VONDSTEN = {
    perceel: [['Паркан цілий, хвіртка зачинена', 'Schutting heel, poortje dicht']],
    dak: [['Зміщена черепиця біля комина', 'Verschoven dakpan bij de schoorsteen'], ['Листя в ринві над терасою', 'Bladeren in de dakgoot boven het terras']],
    panelen: [['Панель Б3 тепліша на 9 °C: ймовірно, бруд', 'Paneel B3 is 9 °C warmer: waarschijnlijk vuil']]
  };
  var WINDREDENEN = [
    ['wacht', ['огляд після бурі не чекає', 'de controle na de storm kan niet wachten']],
    ['zakt', ['вітер стихає, пориви рідшають', 'de wind neemt af, minder vlagen']],
    ['kort', ['короткий політ над власним дахом', 'korte vlucht boven het eigen dak']]
  ];
  var ZONES = [
    { id: 'heli', naam: ['Вертолітний майданчик лікарні', 'Helikopterplatform van het ziekenhuis'], afstand: 1.8, soort: ['заборона польотів', 'verboden te vliegen'], x: 70, y: 28, r: 14, toon: 'alarm' },
    { id: 'natuur', naam: ['Природна зона «Лінгезем»', 'Natuurgebied Lingezegen'], afstand: 1.1, soort: ['обмеження: до 30 м', 'beperking: tot 30 m'], x: 22, y: 30, r: 12, toon: 'let-op' },
    { id: 'spoor', naam: ['Залізниця', 'Spoorlijn'], afstand: 0.6, soort: ['не над колією', 'niet boven het spoor'], lijn: true, toon: 'let-op' }
  ];
  var STAND_WOORD = {
    dock: ['у доку', 'in het dock'], vlucht: ['у польоті', 'in de lucht'], signaalkwijt: ['втрата сигналу', 'signaal kwijt'], geland: ['на землі поза доком', 'aan de grond buiten het dock']
  };
  var FASE_WOORD = {
    opstijgen: ['злітає', 'stijgt op'], missie: ['виконує місію', 'voert de missie uit'], zweven: ['зависає', 'zweeft'], terug: ['повертається', 'keert terug'], landen: ['сідає', 'landt']
  };

  // ───────────────────────── 3. Паспорт: дрони й док як пристрої саду ─────────────────────────
  (function () {
    var P = HV.paspoort;
    if (!P || !P.apparaten) return;
    if (!P.soorten.drone) P.soorten.drone = { icoon: 'drone', naam: ['Дрон', 'Drone'] };
    if (!P.soorten.dronedock) P.soorten.dronedock = { icoon: 'drn-dock', naam: ['Док-станція дронів', 'Dronedock'] };
    var ids = P.apparaten.map(function (a) { return a.id; });
    // modus — команда польоту; effect — пропозиція місії від агента; bron — рішення «летіти попри вітер»
    [
      { id: 'ooievaar', soort: 'drone', naam: ['Дрон «Лелека»', 'Drone ‘Ooievaar’'], mog: ['modus', 'effect', 'bron'], st: { modus: 'd-grond', effect: 'd-geen', bron: 'd-wind-nee' } },
      { id: 'zwaluw', soort: 'drone', naam: ['Дрон «Ластівка»', 'Drone ‘Zwaluw’'], mog: ['modus', 'effect', 'bron'], st: { modus: 'd-grond', effect: 'd-geen', bron: 'd-wind-nee' } },
      { id: 'dronedock', soort: 'dronedock', naam: ['Док-станція дронів', 'Dronedock'], mog: ['open', 'laden', 'modus'], st: { open: false, laadt: true, modus: 'd-dock-rust' } }
    ].forEach(function (a) {
      if (ids.indexOf(a.id) >= 0) return;
      a.kamer = 'tuin';
      a.beschikbaar = 'ok';
      a.bron = 'Симулятор';
      P.apparaten.push(a);
    });
  })();

  // Слова команд для Журналу й сповіщень (ядро бере їх із HV.waardeNaam для modus/effect/bron).
  (function () {
    var WN = HV.waardeNaam || {};
    var NAMEN = {
      'd-opstijgen': ['зліт', 'opstijgen'], 'd-zweven': ['зависає', 'zweeft'], 'd-hervatten': ['продовжує місію', 'hervat de missie'],
      'd-naarhuis': ['повертається додому', 'keert terug naar huis'], 'd-landen': ['сідає зараз', 'landt nu'], 'd-grond': ['на землі', 'aan de grond'],
      'd-geen': ['без пропозиції', 'geen voorstel'], 'd-voorstel-perceel': ['пропозиція: обліт ділянки', 'voorstel: rondje perceel'],
      'd-voorstel-dak': ['пропозиція: огляд даху', 'voorstel: dakinspectie'], 'd-voorstel-panelen': ['пропозиція: огляд панелей', 'voorstel: panelen bekijken'],
      'd-wind-ja': ['політ попри вітер дозволено', 'toch vliegen toegestaan'], 'd-wind-nee': ['без обходу вітру', 'geen uitzondering voor wind'],
      'd-wissel-ooievaar': ['батарею «Лелеки» замінено', 'accu van ‘Ooievaar’ gewisseld'], 'd-wissel-zwaluw': ['батарею «Ластівки» замінено', 'accu van ‘Zwaluw’ gewisseld'],
      'd-dock-rust': ['док чекає', 'dock in rust']
    };
    for (var n in NAMEN) if (!(n in WN)) WN[n] = NAMEN[n];
  })();

  // ───────────────────────── 4. Матриця дій: рядки безпілотників ─────────────────────────
  (function () {
    var G = HV.gevaar;
    if (!G || !G.acties) return;
    var RISICO = function (uk, nl) { return [uk + ' Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', nl + ' Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.']; };
    // рядок ядра «Зліт дрона» мав doel:'drone', якого HV.gevaar.vind не знаходить ніколи: прив'язуємо його до класу 'drone'
    G.acties.forEach(function (x) {
      if (x.sleutel !== 'drone.opstijgen') return;
      delete x.doel;
      x.soorten = ['drone'];
      x.mogelijkheid = 'modus';
      x.als = function (a, v) { return v === 'd-opstijgen'; };
    });
    var nieuw = [
      { sleutel: 'drone.tochvliegen', soorten: ['drone'], mogelijkheid: 'bron', als: function (a, v) { return v === 'd-wind-ja'; }, niveau: 'gevaarlijk',
        naam: ['Летіти попри вітер', 'Toch vliegen bij wind'],
        gevolg: ['Що станеться: перевірка перед зльотом пропустить рядок вітру для цього польоту, причину буде записано. Пов’язано з: пориви вищі за межу дрона — його може знести з маршруту. Як повернути: «Скасувати обхід» до зльоту; у польоті — «Повернутися додому».', 'Wat er gebeurt: de controle vóór de vlucht slaat de windregel over voor deze vlucht, de reden wordt vastgelegd. Hangt samen met: de vlagen liggen boven de grens van de drone — hij kan uit koers raken. Terugdraaien: ‘Uitzondering intrekken’ vóór de start; in de lucht — ‘Naar huis’.'],
        risico: RISICO('Що може статися: дрон злетить у пориви, вищі за його межу.', 'Wat er kan gebeuren: de drone stijgt op in vlagen boven zijn grens.') },
      { sleutel: 'drone.windterug', soorten: ['drone'], mogelijkheid: 'bron', niveau: 'gewoon', naam: ['Скасувати обхід вітру', 'Uitzondering voor wind intrekken'] },
      { sleutel: 'drone.hervatten', soorten: ['drone'], mogelijkheid: 'modus', als: function (a, v) { return v === 'd-hervatten'; }, niveau: 'gevoelig', naam: ['Продовжити місію', 'Missie hervatten'] },
      { sleutel: 'drone.zweven', soorten: ['drone'], mogelijkheid: 'modus', als: function (a, v) { return v === 'd-zweven'; }, niveau: 'gewoon', naam: ['Зависнути', 'Zweven'] },
      { sleutel: 'drone.naarhuis', soorten: ['drone'], mogelijkheid: 'modus', als: function (a, v) { return v === 'd-naarhuis' || v === 'd-grond'; }, niveau: 'gewoon', naam: ['Повернутися додому', 'Naar huis'] },
      { sleutel: 'drone.landen', soorten: ['drone'], mogelijkheid: 'modus', als: function (a, v) { return v === 'd-landen'; }, niveau: 'gewoon', naam: ['Сісти зараз', 'Nu landen'] },
      { sleutel: 'drone.missievoorstel', soorten: ['drone'], mogelijkheid: 'effect', niveau: 'gevoelig', naam: ['Пропозиція місії пілотові', 'Missievoorstel aan de piloot'] },
      { sleutel: 'dock.klepopen', soorten: ['dronedock'], mogelijkheid: 'open', als: function (a, v) { return !!v; }, niveau: 'gevoelig', naam: ['Відчинити кришку дока', 'Klep van het dock openen'] },
      { sleutel: 'dock.klepdicht', soorten: ['dronedock'], mogelijkheid: 'open', niveau: 'gewoon', naam: ['Зачинити кришку дока', 'Klep van het dock sluiten'] },
      { sleutel: 'dock.laden', soorten: ['dronedock'], mogelijkheid: 'laden', niveau: 'gewoon', naam: ['Зарядка батарей у доку', 'Accu’s laden in het dock'] },
      { sleutel: 'dock.wissel', soorten: ['dronedock'], mogelijkheid: 'modus', niveau: 'gewoon', naam: ['Замінити батарею дрона', 'Accu van de drone wisselen'] }
    ];
    var sleutels = G.acties.map(function (x) { return x.sleutel; });
    var plek = sleutels.indexOf('huis.stand');
    if (plek < 0) plek = G.acties.length;
    nieuw.filter(function (x) { return sleutels.indexOf(x.sleutel) < 0; }).forEach(function (x, i) { G.acties.splice(plek + i, 0, x); });
  })();
  var ACTIES_DRONE = ['drone.opstijgen', 'drone.missievoorstel', 'drone.tochvliegen', 'drone.hervatten', 'drone.zweven', 'drone.naarhuis', 'drone.landen', 'dock.klepopen', 'dock.laden', 'dock.wissel'];

  // ───────────────────────── 5. Стан зони у світі (w.drn) ─────────────────────────
  function kopie(x) { return JSON.parse(JSON.stringify(x)); }
  function afstand(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  function rond(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }

  /** Тривалість (с польоту) і довжина маршруту місії від дока й назад. */
  function plan(m) {
    var pos = { x: DOCK.x, y: DOCK.y }, h = 0, lengte = 0, s = 0, maxH = 0;
    m.punten.forEach(function (p) {
      var d = afstand(pos, { x: p[0], y: p[1] });
      lengte += d; s += d / m.snelheid + Math.abs(p[2] - h) / 2.5 + m.zweef;
      pos = { x: p[0], y: p[1] }; h = p[2]; maxH = Math.max(maxH, h);
    });
    var terug = afstand(pos, DOCK);
    lengte += terug; s += terug / 6 + h / 1.5;
    return { seconden: s, minuten: s / 60, lengte: lengte, maxH: maxH };
  }
  function nodig(m, id) { return Math.ceil(plan(m).minuten * SPEC[id].verbruik + RESERVE); }

  function historisch(w) {
    var dag = function (n, u, m) { var d = new Date(w.tijd - n * DAG); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), u, m); };
    var maak = function (id, drone, missieId, start, duurMin, van, piloot, wind, extra) {
      var m = MISSIES.filter(function (x) { return x.id === missieId; })[0];
      var pad = [], tS = 0, pos = { x: DOCK.x, y: DOCK.y, h: 0 };
      var punten = [{ x: DOCK.x, y: DOCK.y, h: m.punten[0][2] }].concat(m.punten.map(function (p) { return { x: p[0], y: p[1], h: p[2] }; })).concat([{ x: DOCK.x, y: DOCK.y, h: 30 }, { x: DOCK.x, y: DOCK.y, h: 0 }]);
      var totaal = duurMin * 60, stappen = 60;
      punten.forEach(function (p, i) {
        if (!i) { pad.push({ t: 0, x: pos.x, y: pos.y, h: 0, l: van }); return; }
        var vorig = punten[i - 1];
        for (var k = 1; k <= 6; k++) { var f = k / 6; pad.push({ x: rond(vorig.x + (p.x - vorig.x) * f, 1), y: rond(vorig.y + (p.y - vorig.y) * f, 1), h: rond(vorig.h + (p.h - vorig.h) * f, 1) }); }
      });
      pad.forEach(function (q, i) { q.t = Math.round(i / (pad.length - 1) * totaal); q.l = Math.round(van - (van - (van - duurMin * SPEC[drone].verbruik)) * i / (pad.length - 1)); });
      void stappen; void tS;
      var r = { id: id, drone: drone, missie: missieId, start: start, einde: start + duurMin * MIN, duurS: totaal, maxH: plan(m).maxH, van: van, tot: Math.round(van - duurMin * SPEC[drone].verbruik), piloot: piloot, door: { soort: 'mens', naam: piloot }, wind: wind,
        gebeurtenissen: [], vondsten: VONDSTEN[missieId] || [], pad: pad, omweg: null, voorstel: null };
      for (var k2 in extra || {}) r[k2] = extra[k2];
      return r;
    };
    return [
      maak('v4', 'zwaluw', 'perceel', dag(2, 15, 10), 5, 88, ['Тарас', 'Taras'], 3),
      maak('v3', 'ooievaar', 'dak', dag(6, 11, 40), 9, 97, ['Олена', 'Olena'], 6),
      maak('v2', 'ooievaar', 'panelen', dag(12, 10, 5), 7, 95, ['Олена', 'Olena'], 9, { omweg: ['вітер стихає, пориви рідшають', 'de wind neemt af, minder vlagen'] }),
      maak('v1', 'zwaluw', 'perceel', dag(20, 16, 30), 4, 90, ['Тарас', 'Taras'], 5, { gebeurtenissen: [{ tS: 140, wat: ['Втрата сигналу 18 с; дрон повернувся сам', 'Signaal 18 s kwijt; de drone keerde zelf terug'] }] })
    ];
  }

  /** Лінивий стан зони: місії (з правками власника), батареї, польоти, вибір пілота, межі польоту. */
  function zorg(w) {
    if (w.drn) return w.drn;
    w.drn = {
      missies: kopie(MISSIES),
      accus: [
        { id: 'b1', naam: ['Батарея Б1', 'Accu B1'], drone: 'ooievaar', plek: 'ooievaar', lading: 92, cycli: 87, gezondheid: 94, temp: 17 },
        { id: 'b2', naam: ['Батарея Б2', 'Accu B2'], drone: 'zwaluw', plek: 'zwaluw', lading: 48, cycli: 142, gezondheid: 86, temp: 16 },
        { id: 'b3', naam: ['Батарея Б3', 'Accu B3'], drone: 'ooievaar', plek: 'dock', lading: 100, cycli: 31, gezondheid: 99, temp: 15 },
        { id: 'b4', naam: ['Батарея Б4', 'Accu B4'], drone: 'zwaluw', plek: 'dock', lading: 96, cycli: 203, gezondheid: 79, temp: 15 }
      ],
      vluchten: historisch(w),
      gekozen: { ooievaar: 'dak', zwaluw: 'perceel' },
      verklaring: {}, windReden: {}, voorstelVoor: {},
      windExtra: 0,
      inst: { plafond: 120, straal: 90, terugHoogte: 30, opname: false },
      gezien: {}, laatstTijd: w.tijd, teller: 4
    };
    return w.drn;
  }
  function drone(w, id) { for (var i = 0; i < (w.drones || []).length; i++) if (w.drones[i].id === id) return w.drones[i]; return null; }
  function missie(w, id) { var l = zorg(w).missies; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function accu(w, id) { var l = zorg(w).accus; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function inLucht(d) { return !!d && (d.stand === 'vlucht' || d.stand === 'signaalkwijt'); }
  function vliegend(w) { return (w.drones || []).filter(inLucht)[0] || null; }
  function wind(w) { var v = (w.weer.wind || 0) + zorg(w).windExtra; return { v: rond(v, 1), vlaag: rond(v * 1.5 + 0.5, 1) }; }
  function kort(id) { return HV.p(KORT[id] || [id, id]); }

  /** Поточна позиція дрона на схемі (у доку — над доком). */
  function plek(d) { return d.x == null ? { x: DOCK.x, y: DOCK.y } : { x: d.x, y: d.y }; }

  // ───────────────────────── 6. Симуляція польоту ─────────────────────────
  function nieuwVlucht(w, d, m, door, extra) {
    var z = zorg(w);
    var r = { id: 'v' + (++z.teller), drone: d.id, missie: m.id, start: w.tijd, einde: null, duurS: 0, maxH: 0, van: Math.round(d.lading), tot: null,
      piloot: door.soort === 'mens' ? door.naam : null, door: { soort: door.soort, naam: door.naam }, wind: wind(w).v, gebeurtenissen: [], vondsten: [], pad: [{ t: 0, x: plek(d).x, y: plek(d).y, h: 0, l: Math.round(d.lading) }],
      omweg: null, voorstel: null };
    for (var k in extra || {}) r[k] = extra[k];
    z.vluchten.unshift(r);
    if (z.vluchten.length > 30) z.vluchten.length = 30;
    return r;
  }
  function vluchtVan(w, d) { var l = zorg(w).vluchten; for (var i = 0; i < l.length; i++) if (l[i].id === d.vlucht) return l[i]; return null; }
  function gebeurtenis(w, d, wat) { var r = vluchtVan(w, d); if (r) r.gebeurtenissen.push({ tS: Math.round(d.vluchtS || 0), wat: wat }); }

  /** Старт польоту після підтвердженої команди «зліт». */
  function start(w, d, a, door) {
    var z = zorg(w), m = missie(w, z.gekozen[d.id] || 'perceel');
    if (d.lading < nodig(m, d.id) - 0.5) {
      a.st.modus = 'd-grond'; z.gezien[d.id] = 'd-grond';
      HV.logboek.voegToe({ maker: SYS, wat: [d.naam[0] + ': зліт скасовано — заряду замало', d.naam[1] + ': start afgebroken — accu te laag'], waarom: [Math.round(d.lading) + ' % із ' + nodig(m, d.id) + ' % потрібних', Math.round(d.lading) + ' % van de ' + nodig(m, d.id) + ' % nodig'], soort: 'huis.voertuig', gewicht: 'belangrijk', doel: d.id });
      return;
    }
    var vanDock = d.stand === 'dock';
    var p = plek(d);
    d.x = p.x; d.y = p.y; d.h = 0; d.v = 0; d.kop = 0; d.vluchtS = 0; d.punt = 0; d.zweefRest = m.zweef; d.missie = m.id; d.fase = 'opstijgen';
    d.stand = 'vlucht'; d.link = true; d.gps = 17; d.fotos = 0; d.klaar = false; d.laagGemeld = false; d.kwijtS = 0; d.gezienEcht = Date.now();
    var r = nieuwVlucht(w, d, m, door, { omweg: a.st.bron === 'd-wind-ja' ? (z.windReden[d.id] || ['причину вказано', 'reden opgegeven']) : null, voorstel: z.voorstelVoor[d.id] || null });
    d.vlucht = r.id;
    z.voorstelVoor[d.id] = null;
    z.verklaring[d.id] = false;
    if (vanDock) w.apparaten.dronedock.st.open = true;
    HV.logboek.voegToe({ maker: SYS, wat: [d.naam[0] + ': місія «' + m.naam[0] + '» почалася', d.naam[1] + ': missie ‘' + m.naam[1] + '’ is begonnen'], waarom: r.voorstel ? ['за пропозицією: ' + r.voorstel[0], 'op voorstel van: ' + r.voorstel[1]] : null, soort: 'huis.voertuig', doel: d.id });
    w.nu = w.nu.filter(function (n) { return n.id !== 'drn-voorstel-' + d.id; });
  }

  /** Крок одного дрона на s секунд польоту. */
  function stap(w, d, s) {
    var z = zorg(w), sp = SPEC[d.id], m = missie(w, d.missie) || missie(w, 'perceel');
    if (d.x == null) initScenario(w, d);
    d.vluchtS = (d.vluchtS || 0) + s;
    var vorig = { x: d.x, y: d.y, h: d.h };
    var naar = function (tx, ty, th, v) {
      var dx = tx - d.x, dy = ty - d.y, dist = Math.sqrt(dx * dx + dy * dy);
      var st = Math.min(dist, v * s);
      if (dist > 0.01) { d.x += dx / dist * st; d.y += dy / dist * st; d.kop = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; }
      var dh = th - d.h, vh = (dh > 0 ? 3 : 2) * s;
      d.h += Math.max(-vh, Math.min(vh, dh));
      return dist - st < 0.3 && Math.abs(th - d.h) < 0.3;
    };
    var fase = d.fase;
    if (fase === 'opstijgen') {
      var doelH = Math.min(z.inst.plafond, m.punten[0][2]);
      d.h = Math.min(doelH, d.h + 3 * s);
      if (d.h >= doelH - 0.1) d.fase = 'missie';
    } else if (fase === 'missie') {
      var p = m.punten[Math.min(d.punt, m.punten.length - 1)];
      if (naar(p[0], p[1], Math.min(z.inst.plafond, p[2]), m.snelheid)) {
        d.zweefRest -= s;
        if (d.zweefRest <= 0) {
          d.fotos += m.id === 'perceel' ? 1 : 4;
          d.punt++; d.zweefRest = m.zweef;
          if (d.punt >= m.punten.length) { d.klaar = true; d.fase = 'terug'; gebeurtenis(w, d, ['Місію виконано, повернення', 'Missie klaar, terugkeer']); }
        }
      }
    } else if (fase === 'terug' && !d.link && d.kwijtS - (d.kwijtStart || 0) < 5) {
      // запобіжник утрати зв'язку: 5 с зависання, далі — повернення
      d.v = 0;
    } else if (fase === 'terug') {
      var th = Math.min(z.inst.plafond, Math.max(d.h, z.inst.terugHoogte));
      if (afstand(d, DOCK) > 0.5 && d.h < th - 0.5) d.h = Math.min(th, d.h + 3 * s);
      else if (naar(DOCK.x, DOCK.y, d.h, 6)) { d.fase = 'landen'; }
    } else if (fase === 'landen') {
      d.h = Math.max(0, d.h - 1.5 * s);
    }
    var hor = Math.sqrt((d.x - vorig.x) * (d.x - vorig.x) + (d.y - vorig.y) * (d.y - vorig.y));
    d.v = s > 0 ? rond(hor / s, 1) : 0;
    d.vz = s > 0 ? rond((d.h - vorig.h) / s, 1) : 0;
    var w_ = wind(w);
    d.lading = Math.max(0, d.lading - sp.verbruik / 60 * s * (1 + Math.max(0, w_.v - 6) * 0.04));
    d.hoogte = Math.round(d.h);
    d.afstand = Math.round(afstand(d, DOCK));
    if (d.link) {
      d.signaal = Math.max(20, Math.min(100, Math.round(100 - d.afstand * 0.3 - (d.h > 60 ? 4 : 0) + Math.sin(d.vluchtS / 7) * 2)));
      d.gezienEcht = Date.now();
      d.laatst = { x: d.x, y: d.y, h: d.h, v: d.v, lading: d.lading, signaal: d.signaal, kop: d.kop };
    } else {
      d.kwijtS = (d.kwijtS || 0) + s;
      // зв'язок повертається, коли дрон підлетів ближче (не раніше ніж за 25 с) або за 2 хв польоту
      if (d.kwijtS > (d.kwijtMin || 0) && (d.afstand < 20 || d.kwijtS > 120)) herstel(w, d);
    }
    var r = vluchtVan(w, d);
    if (r) {
      r.maxH = Math.max(r.maxH, Math.round(d.h));
      var laatste = r.pad[r.pad.length - 1];
      if (!laatste || d.vluchtS - laatste.t >= 3) r.pad.push({ t: Math.round(d.vluchtS), x: rond(d.x, 1), y: rond(d.y, 1), h: rond(d.h, 1), l: Math.round(d.lading) });
      if (r.pad.length > 500) r.pad.splice(1, 1);
    }
    // заряд: повернення з запасом, далі — посадка тут
    var nodigTerug = afstand(d, DOCK) / 6 / 60 * sp.verbruik + d.h / 1.5 / 60 * sp.verbruik + 6;
    if (d.fase !== 'terug' && d.fase !== 'landen' && d.lading < nodigTerug && !d.laagGemeld) {
      d.laagGemeld = true; d.fase = 'terug';
      gebeurtenis(w, d, ['Низький заряд: повернення додому', 'Accu bijna leeg: terug naar huis']);
      HV.logboek.voegToe({ maker: SYS, wat: [d.naam[0] + ': низький заряд, повертається додому', d.naam[1] + ': accu bijna leeg, keert terug naar huis'], soort: 'huis.voertuig', gewicht: 'belangrijk', doel: d.id });
      HV.meld({ gewicht: 'belangrijk', icoon: 'battery-warning', maker: SYS, titel: HV.p(d.naam) + ': ' + t('низький заряд', 'accu bijna leeg'), tekst: t('Повертається додому сам; місію перервано.', 'Keert zelf terug naar huis; de missie is afgebroken.') });
    }
    if (d.lading < 7 && d.fase !== 'landen') { d.fase = 'landen'; gebeurtenis(w, d, ['Критичний заряд: посадка на місці', 'Kritieke lading: landing ter plaatse']); }
    if (d.fase === 'landen' && d.h <= 0.05) geland(w, d);
  }

  /** Посадка: у доку чи поза ним; запис польоту, Журнал, знахідки. */
  function geland(w, d) {
    var z = zorg(w), a = w.apparaten[d.id], m = missie(w, d.missie);
    var inDock = afstand(d, DOCK) < 1.5;
    d.h = 0; d.hoogte = 0; d.v = 0; d.vz = 0; d.fase = null;
    d.stand = inDock ? 'dock' : 'geland';
    if (inDock) { d.x = null; d.y = null; d.afstand = 0; }
    d.signaal = 100; d.link = true;
    var r = vluchtVan(w, d);
    if (r) {
      r.einde = w.tijd; r.duurS = Math.round(d.vluchtS); r.tot = Math.round(d.lading);
      r.pad.push({ t: Math.round(d.vluchtS), x: rond(plek(d).x, 1), y: rond(plek(d).y, 1), h: 0, l: Math.round(d.lading) });
      if (d.klaar) r.vondsten = (VONDSTEN[d.missie] || []).slice();
      r.fotos = d.fotos;
    }
    if (a) { a.st.modus = 'd-grond'; a.st.bron = 'd-wind-nee'; a.beschikbaar = 'ok'; z.gezien[d.id] = 'd-grond'; z.gezien[d.id + ':bron'] = 'd-wind-nee'; }
    var acc = accu(w, SPEC[d.id].accus.filter(function (id) { var x = accu(w, id); return x && x.plek === d.id; })[0]);
    if (acc) { acc.lading = Math.round(d.lading); acc.cycli += 1; acc.temp = 24; }
    if (inDock) w.apparaten.dronedock.st.open = false;
    w.nu = w.nu.filter(function (n) { return n.id !== 'vlucht' && n.id !== 'signaal' && n.id !== 'drn-kwijt-' + d.id; });
    var duur = HV.duur(d.vluchtS / 60);
    HV.logboek.voegToe({ maker: SYS, wat: [d.naam[0] + (inDock ? ': сів у док' : ': сів поза доком'), d.naam[1] + (inDock ? ': in het dock geland' : ': buiten het dock geland')],
      waarom: [(m ? '«' + m.naam[0] + '» · ' : '') + Math.round(d.lading) + ' %', (m ? '‘' + m.naam[1] + '’ · ' : '') + Math.round(d.lading) + ' %'], soort: 'huis.voertuig', doel: d.id });
    HV.meld({ icoon: inDock ? 'plane-landing' : 'map-pin', maker: SYS, gewicht: inDock ? 'info' : 'belangrijk', titel: HV.p(d.naam) + ': ' + (inDock ? t('сів у док', 'in het dock geland') : t('сів поза доком', 'buiten het dock geland')),
      tekst: duur + ' · ' + Math.round(d.lading) + ' %' + (inDock ? '' : ' · ' + t('заберіть дрон і поставте в док', 'haal de drone op en zet hem in het dock')) });
    if (d.klaar && r && r.vondsten.length) {
      w.nu.push({ id: 'drn-vondst-' + r.id, soort: 'aandacht', maker: 'systeem', icoon: m ? m.icoon : 'drone', sinds: w.tijd,
        tekst: ['«' + (m ? m.naam[0] : '') + '»: знахідок ' + r.vondsten.length + ' — ' + r.vondsten[0][0].toLowerCase(), '‘' + (m ? m.naam[1] : '') + '’: ' + r.vondsten.length + ' bevinding(en) — ' + r.vondsten[0][1].toLowerCase()],
        acties: [{ naam: 'drn-vondst', hoofd: true, label: ['Відкрити запис польоту', 'Vluchtverslag openen'], gegevens: { vlucht: r.id } }, { naam: 'nu-weg', label: ['Зрозуміло', 'Begrepen'] }] });
    }
    d.vlucht = null; d.klaar = false;
  }

  /** Втрата сигналу: команди не доходять (пристрій «недоступний»), дрон повертається сам за налаштуванням. */
  function kwijt(w, d, kwijtS) {
    var a = w.apparaten[d.id];
    if (!inLucht(d)) return;
    d.link = false; d.stand = 'signaalkwijt'; d.signaal = 0; d.kwijtS = kwijtS || 0; d.kwijtStart = d.kwijtS; d.kwijtMin = d.kwijtS + 25;
    if (!d.laatst) d.laatst = { x: d.x, y: d.y, h: d.h, v: d.v, lading: d.lading, signaal: 0, kop: d.kop };
    if (d.fase !== 'landen') d.fase = 'terug';
    if (a) { a.beschikbaar = 'onbereikbaar'; a.gezien = w.tijd - (kwijtS || 0) * 1000; }
    gebeurtenis(w, d, ['Втрата сигналу: дрон повертається сам', 'Signaal kwijt: de drone keert zelf terug']);
  }
  function herstel(w, d) {
    var a = w.apparaten[d.id];
    var duur = Math.round(d.kwijtS || 0);
    d.link = true; d.stand = 'vlucht'; d.gezienEcht = Date.now();
    if (a) { a.beschikbaar = 'ok'; a.gezien = w.tijd; }
    gebeurtenis(w, d, ['Зв’язок відновлено через ' + duur + ' с', 'Verbinding na ' + duur + ' s hersteld']);
    w.nu = w.nu.filter(function (n) { return n.id !== 'signaal' && n.id !== 'drn-kwijt-' + d.id; });
    HV.logboek.voegToe({ maker: SYS, wat: [d.naam[0] + ': зв’язок відновлено', d.naam[1] + ': verbinding hersteld'], waarom: ['без зв’язку ' + duur + ' с польоту; дрон летів додому сам', duur + ' s vliegtijd zonder verbinding; de drone vloog zelf naar huis'], soort: 'huis.voertuig', doel: d.id });
    HV.meld({ icoon: 'signal-high', maker: SYS, titel: HV.p(d.naam) + ': ' + t('зв’язок відновлено', 'verbinding hersteld'), tekst: t('Керування знову доступне; дрон далі летить додому.', 'Bediening is weer beschikbaar; de drone vliegt verder naar huis.') });
  }

  /** Політ, що почався в сценарії (огляд даху, втрата сигналу): доповнюємо модель місцем і записом польоту. */
  function initScenario(w, d) {
    var z = zorg(w);
    var mId = d.stand === 'signaalkwijt' ? 'perceel' : 'dak';
    var m = missie(w, mId);
    z.gekozen[d.id] = mId;
    d.missie = mId; d.fotos = d.stand === 'signaalkwijt' ? 5 : 12; d.zweefRest = m.zweef; d.gps = 16; d.laagGemeld = false;
    if (d.stand === 'signaalkwijt') {
      d.x = DOCK.x - 50; d.y = DOCK.y - 35; d.h = d.hoogte || 22; d.kop = 300; d.v = 4; d.fase = 'terug'; d.punt = 7;
    } else {
      var p = m.punten[3], dist = afstand(DOCK, { x: p[0], y: p[1] }), f = (d.afstand || 24) / dist;
      d.x = DOCK.x + (p[0] - DOCK.x) * f; d.y = DOCK.y + (p[1] - DOCK.y) * f; d.h = d.hoogte || 18; d.kop = 305; d.v = 3; d.fase = 'missie'; d.punt = 3;
    }
    d.vluchtS = Math.max(60, Math.round((w.tijd - (d.sinds || w.tijd)) / 1000));
    d.link = true; d.gezienEcht = Date.now();
    d.laatst = { x: d.x, y: d.y, h: d.h, v: d.v, lading: d.lading, signaal: d.signaal || 0, kop: d.kop };
    var r = nieuwVlucht(w, d, m, { soort: 'mens', naam: ['Олена', 'Olena'] });
    r.start = d.sinds || w.tijd; r.van = Math.min(100, Math.round(d.lading + d.vluchtS / 60 * SPEC[d.id].verbruik)); r.pad[0].l = r.van; r.pad[0].x = DOCK.x; r.pad[0].y = DOCK.y;
    r.pad.push({ t: Math.round(d.vluchtS), x: rond(d.x, 1), y: rond(d.y, 1), h: rond(d.h, 1), l: Math.round(d.lading) });
    d.vlucht = r.id;
    var a = w.apparaten[d.id];
    if (a) { a.st.modus = 'd-hervatten'; z.gezien[d.id] = 'd-hervatten'; }
    w.apparaten.dronedock.st.open = true;
    if (d.stand === 'signaalkwijt') {
      var kwijtS = Math.max(1, Math.round((w.tijd - (d.kwijtSinds || w.tijd)) / 1000));
      d.stand = 'vlucht';
      kwijt(w, d, kwijtS);
    }
  }

  // ── Годинник польоту: реальний час ×TEMPO; стоїть на паузі симуляції й у прихованій вкладці ──
  var klok = null, vorigEcht = 0;
  function zorgKlok() {
    if (klok) return;
    vorigEcht = Date.now();
    klok = setInterval(function () {
      var w = HV.staat.w;
      var nu = Date.now(), dt = Math.min(1.5, (nu - vorigEcht) / 1000);
      vorigEcht = nu;
      if (!w || !(w.drones || []).some(inLucht)) { clearInterval(klok); klok = null; return; }
      if (w.pauze || document.hidden || w.gegevens !== 'live') return;
      HV.staat.wijzig(function (x) { x.drones.forEach(function (d) { if (inLucht(d)) stap(x, d, dt * TEMPO); }); });
    }, 500);
  }

  // ── Абонент стану: команди, підтверджені ядром (HV.doe), стають рухом дрона; зарядка в доку за часом дому ──
  HV.staat.abonneer(function (w) {
    if (!w || !w.apparaten || !w.apparaten.dronedock || !w.drones) return;
    var z = zorg(w);
    (w.drones || []).forEach(function (d) {
      var a = w.apparaten[d.id];
      if (!a) return;
      if (inLucht(d) && d.x == null) initScenario(w, d);
      // команда польоту
      var c = a.st.modus;
      if (z.gezien[d.id] === undefined) z.gezien[d.id] = c;
      if (c !== z.gezien[d.id]) {
        z.gezien[d.id] = c;
        var door = a.maker ? { soort: a.maker.soort, naam: a.maker.naam } : HV.mens();
        if (c === 'd-opstijgen' && !inLucht(d)) start(w, d, a, door);
        else if (inLucht(d) && d.link) {
          if (c === 'd-zweven' && d.fase !== 'landen' && d.fase !== 'zweven') { d.vorigeFase = d.fase === 'opstijgen' ? 'missie' : d.fase; d.fase = 'zweven'; gebeurtenis(w, d, ['Зависання за командою', 'Zweven op commando']); }
          else if (c === 'd-hervatten' && d.fase === 'zweven') { d.fase = d.vorigeFase || 'missie'; gebeurtenis(w, d, ['Місію продовжено', 'Missie hervat']); }
          else if ((c === 'd-naarhuis' || c === 'd-grond') && d.fase !== 'landen') { d.fase = 'terug'; gebeurtenis(w, d, ['Повернення додому за командою', 'Terug naar huis op commando']); }
          else if (c === 'd-landen') { d.fase = 'landen'; gebeurtenis(w, d, ['Посадка на місці за командою', 'Landing ter plaatse op commando']); }
        }
      }
      // пропозиція місії від агента
      var e = a.st.effect;
      if (e && e !== 'd-geen' && e !== z.gezien[d.id + ':effect']) {
        z.gezien[d.id + ':effect'] = e;
        var mId = e.replace('d-voorstel-', ''), m = missie(w, mId), wie = a.maker && a.maker.naam ? a.maker.naam : ['Агент', 'Agent'];
        if (m) {
          w.nu = w.nu.filter(function (n) { return n.id !== 'drn-voorstel-' + d.id; });
          w.nu.push({ id: 'drn-voorstel-' + d.id, soort: 'verzoek', maker: 'agent', icoon: 'drone', sinds: w.tijd, tot: w.tijd + 10 * MIN, drone: d.id, missie: mId, wie: wie,
            tekst: [wie[0] + ' пропонує пілотові: «' + m.naam[0] + '» дроном ' + KORT[d.id][0], wie[1] + ' stelt de piloot voor: ‘' + m.naam[1] + '’ met drone ' + KORT[d.id][1]],
            acties: [{ naam: 'drn-voorstel-open', hoofd: true, label: ['Відкрити перевірку', 'Controle openen'], gegevens: { drone: d.id, missie: mId } }, { naam: 'drn-voorstel-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { drone: d.id } }] });
        }
        a.st.effect = 'd-geen'; z.gezien[d.id + ':effect'] = 'd-geen';
      }
    });
    // пропозиція живе 10 хв часу дому
    w.nu.filter(function (n) { return /^drn-voorstel-/.test(n.id) && n.tot && w.tijd > n.tot; }).forEach(function (n) {
      w.nu = w.nu.filter(function (x) { return x !== n; });
      HV.logboek.voegToe({ maker: { soort: 'agent', naam: n.wie || ['Агент', 'Agent'] }, wat: ['Пропозицію місії не виконано', 'Missievoorstel niet uitgevoerd'], waarom: ['минуло 10 хв без відповіді пілота', '10 min verstreken zonder antwoord van de piloot'], soort: 'huis.agent' });
    });
    // заміна батареї в доку
    var dock = w.apparaten.dronedock;
    if (dock.st.modus !== 'd-dock-rust') {
      var id = String(dock.st.modus).replace('d-wissel-', '');
      wissel(w, id);
      dock.st.modus = 'd-dock-rust';
    }
    // зарядка в доку за часом дому: батареї в гнізді й дрони в доку
    var dt = (w.tijd - (z.laatstTijd || w.tijd)) / MIN;
    z.laatstTijd = w.tijd;
    if (dt > 0 && dt < 600 && dock.st.laadt) {
      z.accus.forEach(function (b) { if (b.plek === 'dock' && b.lading < 100) b.lading = Math.min(100, b.lading + dt * 1.6); });
      (w.drones || []).forEach(function (d) { if (d.stand === 'dock' && d.lading < 100) d.lading = Math.min(100, d.lading + dt * 1.2); });
    }
    z.accus.forEach(function (b) { var d = drone(w, b.plek); if (d) b.lading = Math.round(d.lading); });
    if ((w.drones || []).some(inLucht)) zorgKlok();
  });

  function wissel(w, id) {
    var d = drone(w, id);
    if (!d || d.stand !== 'dock') return;
    var z = zorg(w);
    var erin = SPEC[id].accus.map(function (x) { return accu(w, x); }).filter(function (b) { return b.plek === id; })[0];
    var reserve = SPEC[id].accus.map(function (x) { return accu(w, x); }).filter(function (b) { return b.plek === 'dock'; })[0];
    if (!erin || !reserve) return;
    erin.lading = Math.round(d.lading); erin.plek = 'dock';
    reserve.plek = id; d.lading = reserve.lading;
    void z;
  }

  // ───────────────────────── 7. Готовність і перевірка перед зльотом ─────────────────────────
  /**
   * Рядки перевірки: { id, staat:'ok'|'let'|'fout'|'info', icoon, titel, detail, blok (не обходиться), omweg, waarom:[Чому ні, Що перевірити, Що натомість] }.
   */
  function controles(ctx, id, mId) {
    var w = ctx.staat, z = zorg(w), d = drone(w, id), a = w.apparaten[id], sp = SPEC[id];
    var m = missie(w, mId || z.gekozen[id]), nood = nodig(m, id), lad = Math.round(d.lading);
    var rijen = [];
    var anderAccu = SPEC[id].accus.map(function (x) { return accu(w, x); }).filter(function (b) { return b.plek === 'dock'; })[0];
    var goedkoper = z.missies.filter(function (x) { return nodig(x, id) <= lad; }).sort(function (x, y) { return nodig(x, id) - nodig(y, id); })[0];
    if (lad >= nood) rijen.push({ id: 'accu', staat: 'ok', icoon: 'battery-full', titel: t('Заряд ', 'Accu ') + lad + ' %' + t(', треба ', ', nodig ') + nood + ' %', detail: t('з поверненням і запасом ' + RESERVE + ' %', 'met terugkeer en ' + RESERVE + ' % reserve') });
    else rijen.push({ id: 'accu', staat: 'fout', blok: true, icoon: 'battery-low', titel: t('Заряд ', 'Accu ') + lad + ' %' + t(', треба ', ', nodig ') + nood + ' %', detail: t('не обходиться', 'geen uitzondering mogelijk'),
      waarom: [t('Чому ні: заряд ' + lad + ' %, місія з поверненням потребує ' + nood + ' %.', 'Waarom niet: accu ' + lad + ' %, de missie met terugkeer vraagt ' + nood + ' %.'),
        anderAccu ? t('Що перевірити: ' + HV.p(anderAccu.naam).toLowerCase() + ' у доку має ' + Math.round(anderAccu.lading) + ' % — замініть батарею.', 'Wat te controleren: ' + HV.p(anderAccu.naam) + ' in het dock heeft ' + Math.round(anderAccu.lading) + ' % — wissel de accu.') : t('Що перевірити: зарядка в доку ввімкнена.', 'Wat te controleren: laden in het dock staat aan.'),
        goedkoper ? t('Що можна натомість: «' + goedkoper.naam[0] + '» потребує ' + nodig(goedkoper, id) + ' %.', 'Wat wel kan: ‘' + goedkoper.naam[1] + '’ vraagt ' + nodig(goedkoper, id) + ' %.') : t('Що можна натомість: зачекайте на зарядку.', 'Wat wel kan: wacht tot de accu geladen is.')] });
    rijen.push({ id: 'gps', staat: 'ok', icoon: 'satellite', titel: t('Супутники: 17, точність 0,6 м', 'Satellieten: 17, nauwkeurigheid 0,6 m'), detail: t('не обходиться', 'geen uitzondering mogelijk') });
    rijen.push({ id: 'rid', staat: 'ok', icoon: 'radio-tower', titel: t('Віддалена ідентифікація активна', 'Remote ID actief'), detail: t('номер експлуатанта ', 'exploitantnummer ') + NUMMER });
    rijen.push({ id: 'bewijs', staat: 'ok', icoon: 'id-card', titel: t('Свідоцтво пілота A1/A3 до 03.2029', 'Bewijs van bekwaamheid A1/A3 tot 03.2029'), detail: t('категорія «відкрита», підкатегорія ', 'categorie ‘open’, subcategorie ') + sp.sub + ' · ' + sp.klasse });
    var persoonlijk = PERSOONLIJK.indexOf(ctx.profiel.id) >= 0;
    rijen.push(persoonlijk ? { id: 'toestel', staat: 'ok', icoon: 'smartphone', titel: t('Особистий пристрій у домашній мережі', 'Eigen toestel op het thuisnetwerk'), detail: t('не через тунель', 'niet via de tunnel') }
      : { id: 'toestel', staat: 'fout', blok: true, icoon: 'tablet-smartphone', titel: t('Спільний екран: зліт звідси недоступний', 'Gedeeld scherm: opstijgen kan hier niet'), detail: t('лише особистий пристрій пілота', 'alleen het eigen toestel van de piloot'),
        waarom: [t('Чому ні: пілот мусить бачити дрон і керувати з власного пристрою.', 'Waarom niet: de piloot moet de drone zien en vanaf het eigen toestel bedienen.'), t('Що перевірити: відкрийте дім на своєму телефоні в домашній мережі.', 'Wat te controleren: open het huis op je eigen telefoon op het thuisnetwerk.'), t('Що можна натомість: дивитися кабіну тут і натискати «Повернутися додому».', 'Wat wel kan: de cockpit hier bekijken en ‘Naar huis’ indrukken.')] });
    var wd = wind(w);
    if (wd.vlaag <= sp.wind) rijen.push({ id: 'wind', staat: 'ok', icoon: 'wind', titel: t('Вітер ', 'Wind ') + HV.getal(wd.v, 1) + t(', пориви ', ', vlagen ') + HV.getal(wd.vlaag, 1) + t(' м/с', ' m/s'), detail: t('межа дрона ', 'grens van de drone ') + HV.getal(sp.wind, 1) + t(' м/с', ' m/s') });
    else rijen.push({ id: 'wind', staat: a.st.bron === 'd-wind-ja' ? 'omweg' : 'let', icoon: 'wind', omweg: true, titel: t('Вітер ', 'Wind ') + HV.getal(wd.v, 1) + t(', пориви ', ', vlagen ') + HV.getal(wd.vlaag, 1) + t(' м/с', ' m/s'),
      detail: a.st.bron === 'd-wind-ja' ? t('обхід дозволено: ', 'uitzondering toegestaan: ') + HV.p(z.windReden[id] || ['', '']) : t('межа дрона ', 'grens van de drone ') + HV.getal(sp.wind, 1) + t(' м/с — потрібне рішення пілота', ' m/s — de piloot moet beslissen'),
      waarom: [t('Чому ні: пориви ' + HV.getal(wd.vlaag, 1) + ' м/с вищі за межу ' + HV.getal(sp.wind, 1) + ' м/с.', 'Waarom niet: vlagen van ' + HV.getal(wd.vlaag, 1) + ' m/s liggen boven de grens van ' + HV.getal(sp.wind, 1) + ' m/s.'), t('Що перевірити: прогноз на найближчі 30 хв і вітер біля даху.', 'Wat te controleren: de verwachting voor de komende 30 min en de wind bij het dak.'), t('Що можна натомість: «Летіти попри вітер» з причиною — небезпечна дія з рейкою.', 'Wat wel kan: ‘Toch vliegen’ met een reden — een gevaarlijke actie met rail.')] });
    var buiten = m.punten.filter(function (p) { return p[0] < 0 || p[0] > PERCEEL.b || p[1] < 0 || p[1] > PERCEEL.h; }).length;
    var verBuiten = m.punten.filter(function (p) { return afstand({ x: p[0], y: p[1] }, DOCK) > z.inst.straal || p[2] > z.inst.plafond; }).length;
    if (verBuiten) rijen.push({ id: 'grens', staat: 'fout', blok: true, icoon: 'locate-fixed', titel: t('Точок поза межею польоту: ', 'Punten buiten de vlieggrens: ') + verBuiten, detail: t('радіус ', 'straal ') + z.inst.straal + t(' м, стеля ', ' m, plafond ') + z.inst.plafond + t(' м', ' m'),
      waarom: [t('Чому ні: маршрут виходить за межу, яку задав власник.', 'Waarom niet: de route gaat buiten de grens die de eigenaar instelde.'), t('Що перевірити: точки маршруту на вкладці «Місії».', 'Wat te controleren: de routepunten op het tabblad ‘Missies’.'), t('Що можна натомість: змінити межу в «Правилах і зонах».', 'Wat wel kan: de grens aanpassen in ‘Regels en zones’.')] });
    else rijen.push({ id: 'grens', staat: buiten ? 'let' : 'ok', icoon: 'locate-fixed', titel: buiten ? t('Точок над сусідніми ділянками: ', 'Punten boven buurpercelen: ') + buiten : t('Маршрут над власною ділянкою', 'Route boven het eigen perceel'), detail: t('радіус ', 'straal ') + z.inst.straal + t(' м, стеля ', ' m, plafond ') + z.inst.plafond + t(' м', ' m') });
    rijen.push({ id: 'zone', staat: 'info', icoon: 'map', titel: t('Зона польоту: хаб не перевіряє', 'Vliegzone: de hub controleert dit niet'), detail: t('довідково; дані ', 'ter informatie; gegevens van ') + DATUM_ZONES });
    if (d.stand === 'geland') rijen.push({ id: 'plek', staat: 'let', icoon: 'map-pin', titel: t('Зліт поза доком', 'Opstijgen buiten het dock'), detail: t('дрон стоїть там, де сів', 'de drone staat waar hij landde') });
    return rijen;
  }
  /** Готовність дрона для чипа парку: { ok, redenen:[рядок] }. */
  function gereed(ctx, id) {
    var w = ctx.staat, d = drone(w, id);
    if (inLucht(d)) return { ok: false, lucht: true, redenen: [] };
    var r = controles(ctx, id).filter(function (x) { return x.staat === 'fout' || x.staat === 'let'; });
    return { ok: !r.length, redenen: r };
  }

  // ───────────────────────── 8. Схема ділянки (SVG у метрах) ─────────────────────────
  var Z = function (n) { return rond(n, 2); };
  /** Будинок, сад, гараж, панелі, док, дерева — спільна основа мапи й кадру кабіни. */
  function wereld(opties) {
    var op = opties || {}, uit = '';
    uit += '<rect class="hv-drn-w__straat" x="-30" y="' + PERCEEL.h + '" width="' + (PERCEEL.b + 60) + '" height="10"/>';
    uit += '<rect class="hv-drn-w__gras" x="0" y="0" width="' + PERCEEL.b + '" height="' + PERCEEL.h + '"/>';
    uit += '<rect class="hv-drn-w__tuin" x="4" y="13" width="8" height="12" rx="0.6"/>';
    for (var r = 0; r < 4; r++) uit += '<line class="hv-drn-w__bed" x1="5" x2="11" y1="' + (14.5 + r * 3) + '" y2="' + (14.5 + r * 3) + '"/>';
    uit += '<rect class="hv-drn-w__pad" x="40" y="22" width="8" height="' + (PERCEEL.h - 22 + 10) + '"/>';
    uit += '<rect class="hv-drn-w__terras" x="18" y="24" width="12" height="5"/>';
    uit += '<rect class="hv-drn-w__huis" x="16" y="8" width="20" height="16"/>';
    uit += '<line class="hv-drn-w__nok" x1="16" x2="36" y1="16" y2="16"/>';
    uit += '<rect class="hv-drn-w__schoorsteen" x="30" y="11" width="1.4" height="1.4"/>';
    for (var rij = 0; rij < 2; rij++) for (var k = 0; k < 7; k++) uit += '<rect class="hv-drn-w__paneel' + (rij === 1 && k === 2 && op.vondst ? ' is-warm' : '') + '" x="' + Z(17.4 + k * 2.4) + '" y="' + (17.4 + rij * 2.7) + '" width="2.2" height="2.4"/>';
    uit += '<rect class="hv-drn-w__garage" x="40" y="12" width="12" height="10"/>';
    [[6, 6, 3], [10, 36, 3.5], [58, 8, 2.5], [61, 26, 2], [28, 38, 2.5]].forEach(function (b) { uit += '<circle class="hv-drn-w__boom" cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '"/>'; });
    uit += '<rect class="hv-drn-w__grens" x="0" y="0" width="' + PERCEEL.b + '" height="' + PERCEEL.h + '"/>';
    uit += '<rect class="hv-drn-w__dock" x="' + (DOCK.x - 1.6) + '" y="' + (DOCK.y - 1.6) + '" width="3.2" height="3.2" rx="0.4"/>';
    uit += '<path class="hv-drn-w__h" d="M' + (DOCK.x - 0.6) + ' ' + (DOCK.y - 0.8) + 'v1.6M' + (DOCK.x + 0.6) + ' ' + (DOCK.y - 0.8) + 'v1.6M' + (DOCK.x - 0.6) + ' ' + DOCK.y + 'h1.2"/>';
    return uit;
  }
  /**
   * Мапа ділянки: маршрут місії, межа польоту, дрон, слід польоту, останнє відоме місце.
   * p: { k, missie, gekozenPunt, drone (об'єкт), pad, merk:{x,y}, straal, klein, titel }
   */
  function kaart(w, p) {
    var z = zorg(w), uit = '';
    var defs = '<defs><pattern id="hv-drn-arc-' + h(p.k) + '" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hv-drn-w__arclijn" x1="0" y1="0" x2="0" y2="1.6"/></pattern></defs>';
    uit += '<rect class="hv-drn-w__buren" x="-8" y="-8" width="' + (PERCEEL.b + 16) + '" height="' + (PERCEEL.h + 8) + '" fill="url(#hv-drn-arc-' + h(p.k) + ')"/>';
    uit += wereld({ vondst: p.vondst });
    if (p.straal) uit += '<circle class="hv-drn-w__straal" cx="' + DOCK.x + '" cy="' + DOCK.y + '" r="' + z.inst.straal + '"/>';
    if (p.missie) {
      var m = p.missie, d = 'M' + DOCK.x + ' ' + DOCK.y + m.punten.map(function (q) { return 'L' + q[0] + ' ' + q[1]; }).join('') + 'L' + DOCK.x + ' ' + DOCK.y;
      uit += '<path class="hv-drn-w__route' + (p.pad ? ' is-plan' : '') + '" d="' + d + '"/>';
      m.punten.forEach(function (q, i) {
        var buiten = q[0] < 0 || q[0] > PERCEEL.b || q[1] < 0 || q[1] > PERCEEL.h;
        var klas = 'hv-drn-w__punt' + (i === p.gekozenPunt ? ' is-gekozen' : '') + (buiten ? ' is-buiten' : '') + (p.drone && p.drone.missie === m.id && p.drone.punt > i ? ' is-gedaan' : '');
        uit += '<g class="' + klas + '"><circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (p.klein ? 1.9 : 1.7) + '"/>' + (p.klein ? '' : '<text x="' + q[0] + '" y="' + Z(q[1] + 0.75) + '" font-size="2.1">' + (i + 1) + '</text>') + '</g>';
      });
    }
    if (p.pad && p.pad.length > 1) uit += '<path class="hv-drn-w__spoor" d="' + p.pad.map(function (q, i) { return (i ? 'L' : 'M') + q.x + ' ' + q.y; }).join('') + '"/>';
    var dr = p.drone;
    if (dr && inLucht(dr)) {
      var l = dr.link ? dr : (dr.laatst || dr);
      if (!dr.link) uit += '<circle class="hv-drn-w__laatst" cx="' + Z(l.x) + '" cy="' + Z(l.y) + '" r="4"/>';
      uit += '<g class="hv-drn-w__drone' + (dr.link ? '' : ' is-kwijt') + '" style="transform: translate(' + Z(l.x) + 'px, ' + Z(l.y) + 'px) rotate(' + Math.round(l.kop || 0) + 'deg)"><circle r="2.2"/><path d="M0 -2.9 1.5 -0.4H-1.5z"/></g>';
    }
    if (p.merk) uit += '<g class="hv-drn-w__drone is-afspeel" data-k="drn-afspeelmerk" style="transform: translate(' + Z(p.merk.x) + 'px, ' + Z(p.merk.y) + 'px)"><circle r="2"/></g>';
    // fit: кадр за маршрутом і доком (редактор місії на телефоні), інакше — уся ділянка з облямівкою
    var vak = [-8, -8, PERCEEL.b + 16, PERCEEL.h + 16];
    if (p.fit && p.missie) {
      var xs = p.missie.punten.map(function (q) { return q[0]; }).concat([DOCK.x]), ys = p.missie.punten.map(function (q) { return q[1]; }).concat([DOCK.y]);
      var x0 = Math.max(-8, Math.min.apply(null, xs) - 6), x1 = Math.min(PERCEEL.b + 8, Math.max.apply(null, xs) + 6);
      var y0 = Math.max(-8, Math.min.apply(null, ys) - 6), y1 = Math.min(PERCEEL.h + 8, Math.max.apply(null, ys) + 6);
      if (y1 - y0 < (x1 - x0) * 0.62) { var extra = ((x1 - x0) * 0.62 - (y1 - y0)) / 2; y0 -= extra; y1 += extra; }
      vak = [rond(x0, 1), rond(y0, 1), rond(x1 - x0, 1), rond(y1 - y0, 1)];
    }
    return '<svg class="hv-drn-kaart' + (p.klein ? ' is-klein' : '') + '" viewBox="' + vak.join(' ') + '" role="img" aria-label="' + h(p.titel || t('Схема ділянки з маршрутом дрона', 'Schema van het perceel met de route van de drone')) + '"' + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' + defs + uit + '</svg>';
  }

  /** Кадр кабіни: намальований згори вигляд ділянки під дроном, HUD, маска сусідів, позначка симуляції. */
  function kader(w, d) {
    var z = zorg(w), lucht = inLucht(d);
    var l = !lucht ? { x: DOCK.x, y: DOCK.y, h: 1.2, kop: 0, v: 0 } : (d.link ? d : (d.laatst || d));
    var fov = Math.max(9, 1.55 * l.h + 4), k = 640 / fov;
    var transform = 'translate(320px, 180px) rotate(' + (-Math.round(l.kop || 0)) + 'deg) scale(' + rond(k, 3) + ') translate(' + (-Z(l.x)) + 'px, ' + (-Z(l.y)) + 'px)';
    var leeftijd = d.link === false ? Math.round(d.kwijtS || 0) : 0;
    // HUD: штрихи — у SVG (масштабуються з кадром), написи — HTML поверх кадру (сталий кегль на телефоні й комп'ютері)
    var koers = Math.round(l.kop || 0), kompas = '', letters = '';
    var NAMEN = { 0: t('Пн', 'N'), 90: t('Сх', 'O'), 180: t('Пд', 'Z'), 270: t('Зх', 'W') };
    for (var a = Math.ceil((koers - 60) / 15) * 15; a <= koers + 60; a += 15) {
      var x = 320 + (a - koers) * 3.2, hoofd = ((a % 90) + 90) % 90 === 0;
      kompas += '<line class="hv-drn-hud__tik" x1="' + rond(x, 1) + '" x2="' + rond(x, 1) + '" y1="18" y2="' + (hoofd ? 32 : 25) + '"/>';
      if (hoofd) letters += '<span class="hv-drn-hud__letter" style="left:' + rond(x / 6.4, 2) + '%">' + h(NAMEN[((a % 360) + 360) % 360]) + '</span>';
    }
    var plafond = z.inst.plafond, hy = 300 - Math.min(1, l.h / plafond) * 240;
    var hud = '<g class="hv-drn-hud" aria-hidden="true">' +
      '<path class="hv-drn-hud__kruis" d="M300 180h-14M340 180h14M320 160v-12M320 200v12"/><circle class="hv-drn-hud__kruis" cx="320" cy="180" r="6"/>' + kompas +
      '<path class="hv-drn-hud__wijzer" d="M320 50l-5 -6h10z"/>' +
      '<line class="hv-drn-hud__as" x1="612" x2="612" y1="60" y2="300"/><path class="hv-drn-hud__wijzer is-hoogte" style="transform: translateY(' + rond(hy - 180, 1) + 'px)" d="M604 180l-8 -5v10z"/></g>';
    var bericht = d.link === false ? '<div class="hv-drn-video__bericht is-alarm"><strong>' + h(t('Сигнал втрачено', 'Signaal kwijt')) + '</strong><span>' + h(t('кадр ' + leeftijd + ' с тому · дрон летить додому сам', 'beeld van ' + leeftijd + ' s geleden · de drone vliegt zelf naar huis')) + '</span></div>'
      : !lucht ? '<div class="hv-drn-video__bericht"><strong>' + h(d.stand === 'geland' ? t('На землі', 'Aan de grond') : t('У доку', 'In het dock')) + '</strong><span>' + h(t('кадр із камери дока', 'beeld van de dockcamera')) + '</span></div>' : '';
    var laag = '<div class="hv-drn-video__hud" aria-hidden="true">' + '<div class="hv-drn-hud__kompas">' + letters + '</div>' +
      '<span class="hv-drn-hud__plafond">' + plafond + ' ' + h(t('м', 'm')) + '</span>' +
      '<span class="hv-drn-hud__hoogte" style="top:' + rond(hy / 3.6, 2) + '%">' + Math.round(l.h) + '<small>' + h(t(' м', ' m')) + '</small></span>' +
      '<span class="hv-drn-hud__snelheid">' + h(HV.getal(l.v || 0, 1)) + '<small>' + h(t(' м/с', ' m/s')) + '</small></span>' + bericht +
      '<span class="hv-drn-video__pil is-links">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('Симуляція · схема ділянки', 'Simulatie · schema perceel')) + '</span>' +
      '<span class="hv-drn-video__pil is-rechts">' + HV.icoon(z.inst.opname ? 'video' : 'circle-dot', { maat: 's' }) + h(z.inst.opname ? t('запис увімкнено', 'opname aan') : t('запис вимкнено', 'opname uit')) + '</span>' +
      '<span class="hv-drn-video__pil is-boven">' + HV.icoon('eye-off', { maat: 's' }) + h(t('сусідні ділянки приховано', 'buurpercelen afgeschermd')) + '</span></div>';
    return '<div class="hv-drn-video' + (d.link === false ? ' is-kwijt' : '') + (!lucht ? ' is-grond' : '') + '" data-k="drn-video">' +
      '<svg viewBox="0 0 640 360" role="img" aria-label="' + h(t('Симульований кадр камери дрона: ', 'Gesimuleerd camerabeeld van de drone: ') + Math.round(l.h) + t(' м над ділянкою', ' m boven het perceel')) + '">' +
      '<defs><pattern id="hv-drn-vidarc" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hv-drn-video__arc" x1="0" y1="0" x2="0" y2="14"/></pattern>' +
      '<pattern id="hv-drn-burenarc" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hv-drn-video__arc" x1="0" y1="0" x2="0" y2="2"/></pattern></defs>' +
      '<rect class="hv-drn-video__achter" width="640" height="360"/>' +
      '<g class="hv-drn-video__wereld" style="transform: ' + transform + '">' +
      '<rect class="hv-drn-video__buren" x="-60" y="-60" width="' + (PERCEEL.b + 120) + '" height="' + (PERCEEL.h + 120) + '" fill="url(#hv-drn-burenarc)"/>' + wereld({ vondst: true }) +
      (lucht && d.missie ? (function () { var m = missie(w, d.missie); return '<path class="hv-drn-w__route" d="' + m.punten.map(function (q, i) { return (i ? 'L' : 'M') + q[0] + ' ' + q[1]; }).join('') + '"/>'; })() : '') +
      '</g>' + (d.link === false ? '<rect class="hv-drn-video__kwijt" x="0" y="0" width="640" height="360" fill="url(#hv-drn-vidarc)"/>' : '') + hud + '</svg>' + laag + '</div>';
  }

  // ───────────────────────── 9. Дрібні складники ─────────────────────────
  var sim = function () { return '<span class="hv-drn-sim" data-k="drn-sim">' + HV.icoon('flask-conical', { maat: 's' }) + '<span>' + h(t('Лише симуляція', 'Alleen simulatie')) + '</span></span>'; };
  function standWoord(d) {
    if (!d) return '';
    if (inLucht(d) && d.link !== false && d.fase && FASE_WOORD[d.fase]) return HV.p(FASE_WOORD[d.fase]);
    return HV.p(STAND_WOORD[d.stand] || [d.stand, d.stand]);
  }
  function mmss(sec) { var x = Math.max(0, Math.round(sec || 0)), m = Math.floor(x / 60), r = x % 60; return (m ? m + t(' хв ', ' min ') : '') + (r < 10 && m ? '0' : '') + r + t(' с', ' s'); }
  function minutenOver(d) { return Math.max(0, Math.floor((d.lading - RESERVE) / SPEC[d.id].verbruik)); }
  function kop(icoon, titel, rechts, toon) {
    return '<div class="hv-drn-kop' + (toon ? ' hv-toon-' + toon : '') + '"><h3>' + HV.icoon(icoon, { maat: 's' }) + '<span>' + h(titel) + '</span></h3>' + (rechts ? '<span class="hv-drn-kop__rechts">' + rechts + '</span>' : '') + '</div>';
  }
  function balk(waarde, toon, gewenst) {
    return '<span class="hv-drn-balk hv-toon-' + (toon || 'batterij') + '" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, waarde)) + '%"></i>' + (gewenst != null ? '<b style="left:' + gewenst + '%"></b>' : '') + '</span>';
  }
  var STAAT_ICOON = { ok: 'circle-check', let: 'triangle-alert', fout: 'circle-x', info: 'minus', omweg: 'triangle-alert' };

  /** Кнопка смуги польоту: повний підпис і короткий для вузької смуги (контейнер drnvb). */
  function vbKnop(p) {
    // gedrukt — поточний стан («Повертається»): натиснута кнопка з галочкою, без дії (як o.knop ядра)
    if (p.gedrukt) return '<button type="button" class="hv-knop hv-knop--gewoon hv-vluchtbalk__knop is-gedrukt" aria-pressed="true" aria-disabled="true" aria-label="' + h(p.vol) + '" data-k="' + h(p.k) + '">' +
      HV.icoon('check', { maat: 's' }) + '<span class="hv-vluchtbalk__vol" aria-hidden="true">' + h(p.vol) + '</span><span class="hv-vluchtbalk__kort" aria-hidden="true">' + h(p.kort) + '</span></button>';
    return '<button type="button" class="hv-knop hv-knop--' + (p.soort || 'gewoon') + ' hv-vluchtbalk__knop" data-actie="' + h(p.actie) + '"' + HV.attrs(p.gegevens) + (p.uit ? ' aria-disabled="true"' : '') + ' aria-label="' + h(p.vol) + '" data-k="' + h(p.k) + '">' +
      HV.icoon(p.icoon, { maat: 's' }) + '<span class="hv-vluchtbalk__vol" aria-hidden="true">' + h(p.vol) + '</span><span class="hv-vluchtbalk__kort" aria-hidden="true">' + h(p.kort) + '</span></button>';
  }
  /** Смуга польоту hv-vluchtbalk: стан, заряд, сигнал і три дії безпеки — без рейки (дизайн-мова §9–§10). */
  function vluchtbalk(ctx, d, opties) {
    var op = opties || {}, lucht = inLucht(d);
    var woord = !lucht ? HV.p(STAND_WOORD[d.stand] || STAND_WOORD.dock) : d.link === false ? t('втрата сигналу', 'signaal kwijt') : d.lading < 25 ? t('низький заряд', 'accu bijna leeg') : standWoord(d);
    var toon = d.link === false || (lucht && d.lading < 25) ? 'alarm' : lucht ? 'batterij' : 'neutraal';
    var l = d.link === false && d.laatst ? d.laatst : d;
    var knoppen;
    if (!lucht) {
      knoppen = o.knop({ tekst: t('Перевірка перед зльотом', 'Controle vóór de vlucht'), icoon: 'plane-takeoff', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'opstijgen:' + d.id }, k: 'vb-check-' + d.id });
    } else {
      var zweeft = d.fase === 'zweven';
      knoppen = (zweeft ? vbKnop({ vol: t('Продовжити', 'Hervatten'), kort: t('Далі', 'Verder'), icoon: 'play', actie: 'drn-cmd', gegevens: { drone: d.id, cmd: 'd-hervatten' }, k: 'vb-zweef-' + d.id })
        : vbKnop({ vol: t('Зависнути', 'Zweven'), kort: t('Зависнути', 'Zweven'), icoon: 'circle-pause', actie: 'drn-cmd', gegevens: { drone: d.id, cmd: 'd-zweven' }, uit: d.fase === 'landen', k: 'vb-zweef-' + d.id })) +
        (d.fase === 'terug' ? vbKnop({ vol: t('Повертається додому', 'Keert terug naar huis'), kort: t('Повертається', 'Keert terug'), gedrukt: true, k: 'vb-huis-' + d.id })
          : vbKnop({ vol: t('Повернутися додому', 'Naar huis'), kort: t('Додому', 'Naar huis'), icoon: 'house', soort: 'hoofd', actie: 'drn-cmd', gegevens: { drone: d.id, cmd: 'd-naarhuis' }, uit: d.fase === 'landen', k: 'vb-huis-' + d.id })) +
        (d.fase === 'landen' ? vbKnop({ vol: t('Сідає', 'Landt'), kort: t('Сідає', 'Landt'), gedrukt: true, k: 'vb-land-' + d.id })
          : vbKnop({ vol: t('Сісти зараз', 'Nu landen'), kort: t('Сісти', 'Landen'), icoon: 'arrow-down-to-line', actie: 'drn-cmd', gegevens: { drone: d.id, cmd: 'd-landen' }, k: 'vb-land-' + d.id }));
    }
    return '<div class="hv-vluchtbalk hv-toon-' + toon + (op.vast ? ' is-vast' : '') + (d.link === false ? ' is-kwijt' : '') + '" role="group" aria-label="' + h(t('Смуга польоту: ', 'Vluchtbalk: ') + HV.p(d.naam)) + '" data-k="vluchtbalk-' + h(d.id) + '">' +
      '<div class="hv-vluchtbalk__stand"><span class="hv-vluchtbalk__teken">' + HV.icoon(d.link === false ? 'wifi-off' : lucht ? 'drone' : 'drn-dock') + '</span><span class="hv-vluchtbalk__tekst"><strong>' + h(op.naam ? kort(d.id) + ' · ' + woord : woord) + '</strong>' +
      '<span class="hv-vluchtbalk__getallen"><span>' + HV.icoon(l.lading < 25 ? 'battery-low' : 'battery-medium', { maat: 's' }) + HV.maat(Math.round(l.lading), '%') + '</span><span>' + HV.icoon(d.link === false ? 'wifi-off' : 'signal-high', { maat: 's' }) + (d.link === false ? h(t('немає', 'geen')) : HV.maat(Math.round(d.signaal || 100), '%')) + '</span>' +
      (lucht ? '<span>' + HV.icoon('arrow-up-from-line', { maat: 's' }) + HV.maat(Math.round(l.h || 0), t('м', 'm')) + '</span>' : '') + '</span></span></div>' +
      '<div class="hv-vluchtbalk__knoppen">' + knoppen + '</div></div>';
  }

  /** Підменю вкладки й постійний штамп «Лише симуляція». */
  function navigatie(ctx) {
    var obj = ctx.route.object || '', w = ctx.staat, v = vliegend(w);
    var items = [['', 'layout-grid', t('Парк', 'Vloot')], ['vlucht', 'gamepad-2', t('Кабіна', 'Cockpit')], ['missies', 'route', t('Місії', 'Missies')], ['vluchten', 'history', t('Польоти', 'Vluchten')], ['regels', 'scale', t('Правила й зони', 'Regels en zones')]];
    var actief = DRONES.indexOf(obj) >= 0 || obj === 'dock' ? '' : obj;
    return '<nav class="hv-drn-nav" aria-label="' + h(t('Розділи безпілотників', 'Onderdelen van drones')) + '" data-k="drn-nav"><div class="hv-drn-nav__rij">' + items.map(function (x) {
      var gekozen = x[0] === actief;
      return '<button type="button" class="hv-drn-nav__punt' + (gekozen ? ' is-gekozen' : '') + (x[0] === 'vlucht' && v ? ' is-live' : '') + '" aria-current="' + (gekozen ? 'page' : 'false') + '" data-actie="ga" data-naar="garage-drones' + (x[0] ? '-' + x[0] : '') + '" data-k="drn-nav-' + (x[0] || 'park') + '">' +
        HV.icoon(x[1], { maat: 's' }) + '<span>' + h(x[2]) + '</span>' + (x[0] === 'vlucht' && v ? '<span class="hv-drn-nav__stip" aria-label="' + h(t('дрон у польоті', 'drone in de lucht')) + '"></span>' : '') + '</button>';
    }).join('') + '</div>' + sim() + '</nav>';
  }

  // ───────────────────────── 10. Парк ─────────────────────────
  function droneKaart(ctx, id) {
    var w = ctx.staat, d = drone(w, id), z = zorg(w), sp = SPEC[id], lucht = inLucht(d);
    var g = gereed(ctx, id), m = missie(w, z.gekozen[id]);
    var getallen = lucht
      ? [{ label: t('Висота', 'Hoogte'), waarde: HV.maat(Math.round((d.link === false && d.laatst ? d.laatst.h : d.h) || 0), t('м', 'm')) }, { label: t('Відстань', 'Afstand'), waarde: HV.maat(d.afstand || 0, t('м', 'm')) }, { label: t('Сигнал', 'Signaal'), waarde: d.link === false ? h(t('немає', 'geen')) : HV.maat(d.signaal, '%') }]
      : [{ label: t('Клас', 'Klasse'), waarde: h(sp.klasse + ' · ' + sp.massa + t(' г', ' g')) }, { label: t('Межа вітру', 'Windgrens'), waarde: HV.maat(sp.wind, t('м/с', 'm/s'), 1) }, { label: t('Польотів', 'Vluchten'), waarde: h(String(z.vluchten.filter(function (v) { return v.drone === id; }).length)) }];
    var tele = o.telemetrie({ id: 'drn-' + id, icoon: 'drone', naam: HV.p(d.naam), stand: standWoord(d) + (lucht && m ? ' · ' + HV.p(missie(w, d.missie).naam).toLowerCase() : ''), lading: d.lading, toon: lucht ? 'batterij' : 'neutraal',
      bereik: t('≈ ', '≈ ') + minutenOver(d) + t(' хв польоту', ' min vliegen'), getallen: getallen, actie: 'ga', gegevens: { naar: 'garage-drones-' + id }, staat: d.link === false ? 'onbereikbaar' : null });
    var chip = lucht ? o.chip({ icoon: d.link === false ? 'wifi-off' : 'drone', toon: d.link === false ? 'alarm' : 'batterij', tekst: d.link === false ? t('втрата сигналу', 'signaal kwijt') : t('у польоті', 'in de lucht'), actie: 'ga', gegevens: { naar: 'garage-drones-vlucht' }, k: 'drn-gereed-' + id })
      : g.ok ? o.chip({ icoon: 'circle-check', toon: 'ok', tekst: t('готовий: ', 'klaar: ') + HV.p(m.naam).toLowerCase(), actie: 'blad', gegevens: { blad: 'opstijgen:' + id }, k: 'drn-gereed-' + id })
        : o.chip({ icoon: 'triangle-alert', toon: 'let-op', tekst: t('не готовий: ', 'niet klaar: ') + g.redenen.length + ' ' + HV.meervoud(g.redenen.length, ['причина', 'причини', 'причин'], ['reden', 'redenen']), actie: 'blad', gegevens: { blad: 'opstijgen:' + id }, k: 'drn-gereed-' + id });
    var acties = lucht
      ? o.knop({ tekst: t('Кабіна', 'Cockpit'), icoon: 'gamepad-2', soort: 'hoofd', klein: true, actie: 'drn-kabine', gegevens: { drone: id }, k: 'drn-kab-' + id }) + o.knop({ tekst: t('Додому', 'Naar huis'), icoon: 'house', klein: true, actie: 'drn-cmd', gegevens: { drone: id, cmd: 'd-naarhuis' }, uit: d.fase === 'terug' || d.fase === 'landen', k: 'drn-thuis-' + id })
      : o.knop({ tekst: t('Перевірка перед зльотом', 'Controle vóór de vlucht'), icoon: 'plane-takeoff', soort: 'hoofd', klein: true, actie: 'blad', gegevens: { blad: 'opstijgen:' + id }, k: 'drn-check-' + id }) +
        (d.stand === 'geland' ? o.knop({ tekst: t('Поставлено в док', 'Teruggezet in het dock'), icoon: 'drn-dock', klein: true, actie: 'drn-terugzetten', gegevens: { drone: id }, k: 'drn-terugzet-' + id }) : '');
    return '<article class="hv-drn-dkaart' + (lucht ? ' is-lucht' : '') + (d.link === false ? ' is-alarm' : '') + '" data-k="drn-dk-' + id + '">' + tele +
      '<div class="hv-drn-dkaart__voet">' + chip + '<span class="hv-drn-dkaart__acties">' + acties + '</span></div></article>';
  }

  function dockKaart(ctx, groot) {
    var w = ctx.staat, A = w.apparaten.dronedock, st = A.st, z = zorg(w);
    var klep = HV.gewenst(A, 'open'), laadt = HV.gewenst(A, 'laden');
    var bezet = DRONES.map(function (id) { var d = drone(w, id); return d.stand === 'dock' ? d : null; });
    var neerslag = w.weer.neerslag;
    var vakken = DRONES.map(function (id, i) {
      var d = bezet[i];
      return '<div class="hv-drn-vak' + (d ? ' is-bezet' : '') + '"><span class="hv-drn-vak__teken">' + HV.icoon(d ? 'drone' : 'plane-takeoff') + '</span><span class="hv-drn-vak__naam">' + h(kort(id)) + '</span><span class="hv-drn-vak__sub">' + h(d ? t('у гнізді', 'in de bak') : standWoord(drone(w, id))) + '</span></div>';
    }).join('') + z.accus.filter(function (b) { return b.plek === 'dock'; }).map(function (b) {
      return '<div class="hv-drn-vak is-accu"><span class="hv-drn-vak__teken">' + HV.icoon(laadt && b.lading < 100 ? 'battery-charging' : 'battery-full') + '</span><span class="hv-drn-vak__naam">' + h(HV.p(b.naam)) + '</span><span class="hv-drn-vak__sub">' + HV.maat(Math.round(b.lading), '%') + '</span>' + balk(b.lading) + '</div>';
    }).join('');
    var wacht = A.wacht ? '<span class="hv-drn-wacht">' + h(HV.woord.wacht()) + '</span>' : '';
    var schakelLaden = o.schakel({ aan: !!laadt, icoon: 'plug-zap', toon: 'batterij', staat: A.wacht && A.wacht.mogelijkheid === 'laden' ? 'wacht' : null, actie: 'drn-dock', gegevens: { mogelijkheid: 'laden', waarde: laadt ? '' : '1' }, aria: t('Зарядка в доку', 'Laden in het dock') });
    var wisselKnoppen = DRONES.map(function (id) {
      var d = drone(w, id), reserve = SPEC[id].accus.map(function (x) { return accu(w, x); }).filter(function (b) { return b.plek === 'dock'; })[0];
      var kan = d.stand === 'dock' && reserve && reserve.lading > d.lading + 5;
      return o.knop({ tekst: t('Батарея ', 'Accu ') + kort(id) + (reserve ? ' → ' + Math.round(reserve.lading) + ' %' : ''), icoon: 'refresh-cw', klein: true, actie: kan ? 'drn-wissel' : 'drn-uitleg', gegevens: kan ? { drone: id } : { reden: d.stand !== 'dock' ? 'wissel-lucht' : 'wissel-vol', drone: id }, klas: kan ? null : 'is-uit', k: 'drn-wissel-' + id });
    }).join('');
    return '<div class="hv-kaart hv-drn-dock" data-k="drn-dock">' +
      kop('drn-dock', t('Док-станція', 'Dronedock'), wacht + (groot ? '' : o.knop({ tekst: t('Детальніше', 'Meer'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'garage-drones-dock' }, k: 'drn-dock-meer' }))) +
      '<div class="hv-drn-chips">' + o.chip({ icoon: klep ? 'package-open' : 'box', tekst: klep ? t('кришка відчинена', 'klep open') : t('кришка зачинена', 'klep dicht') }) +
      o.chip({ icoon: neerslag ? 'cloud-rain' : 'cloud', toon: neerslag ? 'let-op' : null, tekst: neerslag ? t('опади: так', 'neerslag: ja') : t('опадів немає', 'geen neerslag') }) + o.chip({ icoon: 'thermometer', tekst: HV.getal(w.weer.temp + 3, 0) + ' °C ' + t('усередині', 'binnen') }) + '</div>' +
      '<div class="hv-drn-vakken">' + vakken + '</div>' +
      '<div class="hv-drn-rij"><span class="hv-drn-rij__tekst"><strong>' + h(t('Зарядка батарей', 'Accu’s laden')) + '</strong><span>' + h(laadt ? t('заряджає до 100 %, 1,6 % за хвилину', 'laadt tot 100 %, 1,6 % per minuut') : t('вимкнено', 'uit')) + '</span></span>' + schakelLaden + '</div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: klep ? t('Зачинити кришку', 'Klep sluiten') : t('Відчинити кришку', 'Klep openen'), icoon: klep ? 'box' : 'package-open', klein: true, actie: 'drn-dock', gegevens: { mogelijkheid: 'open', waarde: klep ? '' : '1' }, k: 'drn-klep' }) +
      o.gevolg(t('Що станеться: кришка дока відчиниться для огляду гнізд; дрон у доку відкритий дощу й пилу. Пов’язано з: перед зльотом док відчиняє кришку сам. Як повернути: «Зачинити кришку» — один дотик.', 'Wat er gebeurt: de klep van het dock gaat open om de bakken te bekijken; de drone ligt open voor regen en stof. Hangt samen met: vóór de start opent het dock de klep zelf. Terugdraaien: ‘Klep sluiten’ — één tik.'), { kop: t('Кришка дока', 'Klep van het dock') }) + wisselKnoppen + '</div></div>';
  }

  function accusKaart(ctx) {
    var w = ctx.staat, z = zorg(w), laadt = w.apparaten.dronedock.st.laadt;
    return '<div class="hv-kaart hv-drn-accus" data-k="drn-accus">' + kop('battery-medium', t('Батареї', 'Accu’s'), '<span class="hv-drn-klein">' + h(t('4 шт. · по дві на дрон', '4 stuks · twee per drone')) + '</span>') +
      '<ul class="hv-drn-accus__lijst">' + z.accus.map(function (b) {
        var waar = b.plek === 'dock' ? t('у доку', 'in het dock') + (laadt && b.lading < 100 ? ' · ' + t('заряджається', 'laadt') : '') : t('у дроні ', 'in drone ') + kort(b.plek);
        var gezond = b.gezondheid < 82 ? 'let-op' : 'ok';
        return '<li class="hv-drn-accu" data-k="drn-accu-' + b.id + '"><span class="hv-drn-accu__kop"><strong>' + h(HV.p(b.naam)) + '</strong><span>' + h(t('для ', 'voor ') + kort(b.drone) + ' · ' + waar) + '</span></span>' +
          '<span class="hv-drn-accu__lading">' + HV.maat(Math.round(b.lading), '%') + '</span>' + balk(b.lading, b.lading < 30 ? 'warm' : 'batterij') +
          '<span class="hv-drn-accu__feiten"><span>' + h(t('циклів ', 'cycli ')) + '<b>' + b.cycli + '</b></span><span class="hv-toon-' + gezond + '">' + h(t('стан ', 'conditie ')) + '<b>' + b.gezondheid + ' %</b></span><span>' + h(HV.getal(b.temp, 0)) + ' °C</span></span></li>';
      }).join('') + '</ul>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Батарея зі станом нижче 80 % дає менше хвилин польоту; Б4 варто замінити до весни.', 'Een accu onder 80 % conditie geeft minder vliegminuten; B4 is vóór de lente aan vervanging toe.')) + '</span></p></div>';
  }

  function missieKaartje(ctx, m, id) {
    var w = ctx.staat, pl = plan(m), d = drone(w, id);
    var kan = d.lading >= nodig(m, id);
    return '<article class="hv-drn-mk" data-k="drn-mk-' + m.id + '">' + kaart(w, { k: 'mk-' + m.id, missie: m, klein: true, titel: HV.p(m.naam) }) +
      '<div class="hv-drn-mk__tekst"><h4>' + HV.icoon(m.icoon, { maat: 's' }) + '<span>' + h(HV.p(m.naam)) + '</span></h4><p>' + h(HV.p(m.doel)) + '</p>' +
      '<p class="hv-drn-mk__feiten"><span>' + h(HV.duur(pl.minuten)) + '</span><span>' + h(t('до ', 'tot ') + pl.maxH + t(' м', ' m')) + '</span><span>' + h(m.punten.length + ' ' + HV.meervoud(m.punten.length, ['точка', 'точки', 'точок'], ['punt', 'punten'])) + '</span><span class="' + (kan ? '' : 'is-te-laag') + '">' + h(t('треба ', 'nodig ') + nodig(m, id) + ' %') + '</span></p>' +
      '<div class="hv-drn-mk__knoppen">' + o.knop({ tekst: t('Підготувати зліт', 'Start voorbereiden'), icoon: 'plane-takeoff', klein: true, actie: 'drn-bereid', gegevens: { drone: id, missie: m.id }, k: 'drn-mk-start-' + m.id }) +
      o.knop({ tekst: t('Маршрут', 'Route'), icoon: 'route', soort: 'stil', klein: true, actie: 'drn-missie-open', gegevens: { missie: m.id }, k: 'drn-mk-route-' + m.id }) + '</div></div></article>';
  }

  function agentKaart(ctx) {
    var w = ctx.staat, z = zorg(w);
    var aStart = HV.gevaar.actie('drone.opstijgen'), aVoorstel = HV.gevaar.actie('drone.missievoorstel');
    var sVoorstel = HV.gevaar.stand('claude', 'drone.missievoorstel'), sStart = HV.gevaar.stand('claude', 'drone.opstijgen');
    var naam = function (s) { return HV.p(HV.gevaar.standNamen[s]); };
    var gevolg = sStart === 'altijd' ? t('Зараз: агент злетить сам після власної перевірки заряду й маршруту.', 'Nu: de agent stijgt zelf op na zijn eigen controle van accu en route.')
      : sStart === 'vragen' ? t('Зараз: агент попросить схвалити зліт; схвалення злітає без перевірки пілота.', 'Nu: de agent vraagt de start goed te keuren; goedkeuren start zonder de controle van de piloot.')
        : sVoorstel === 'uit' ? t('Зараз: агент мовчить — пропозиції вимкнено.', 'Nu: de agent zwijgt — voorstellen staan uit.')
          : sVoorstel === 'vragen' ? t('Зараз: агент спершу попросить дозволу надіслати пропозицію.', 'Nu: de agent vraagt eerst of hij het voorstel mag sturen.')
            : t('Зараз: пропозиція одразу прийде пілотові; злітає пілот сам.', 'Nu: het voorstel gaat meteen naar de piloot; de piloot stijgt zelf op.');
    void z;
    return '<div class="hv-kaart hv-drn-agent" data-k="drn-agent">' + kop('agent', t('Агенти й місії', 'Agenten en missies'), o.knop({ tekst: t('Дозволи', 'Toestemmingen'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'garage-drones-regels' }, k: 'drn-agent-regels' })) +
      '<p class="hv-drn-agent__zin">' + h(t('Агент пропонує місію пілотові — наприклад, огляд даху після нічного вітру. Злітає пілот: перевірка, рейка, підтвердження входу.', 'De agent stelt de piloot een missie voor — bijvoorbeeld een dakcontrole na de wind van vannacht. De piloot stijgt op: controle, rail, bevestiging van de aanmelding.')) + '</p>' +
      '<dl class="hv-drn-agent__standen"><div><dt>' + h(HV.p(aVoorstel.naam)) + '</dt><dd>' + o.risico(aVoorstel.niveau) + '<strong>' + h(naam(sVoorstel)) + '</strong></dd></div>' +
      '<div><dt>' + h(HV.p(aStart.naam)) + '</dt><dd>' + o.risico(aStart.niveau) + '<strong>' + h(naam(sStart)) + '</strong>' + (sStart === 'altijd' ? o.gevolg(HV.p(aStart.risico), { soort: 'uitroep', vast: 'kritiek', kop: t('Ризик', 'Risico') + ': ' + HV.p(aStart.naam) }) : '') + '</dd></div></dl>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('agent', { maat: 's' }) + '<span>' + h(gevolg) + '</span></p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Агент Claude: запропонувати огляд даху', 'Agent Claude: dakinspectie voorstellen'), icoon: 'sparkles', actie: 'drn-agent', gegevens: { agent: 'claude', missie: 'dak', drone: 'ooievaar' }, k: 'drn-agent-knop' }) + '</div></div>';
  }

  function vluchtRij(w, r) {
    var m = missie(w, r.missie) || MISSIES[0];
    var datum = HV.datumKort(r.start) + ' ' + HV.tijd(r.start);
    var sub = kort(r.drone) + ' · ' + HV.duur((r.duurS || 0) / 60) + ' · ' + t('до ', 'tot ') + r.maxH + t(' м', ' m') + (r.gebeurtenissen.some(function (g) { return /сигнал|Сигнал/.test(g.wat[0]); }) ? ' · ' + t('втрата сигналу', 'signaal kwijt') : '') + (r.omweg ? ' · ' + t('обхід вітру', 'uitzondering wind') : '');
    return o.rij({ icoon: r.einde ? m.icoon : 'drone', naam: datum + ' · ' + HV.p(m.naam), sub: sub, waarde: r.einde ? h(r.van + ' → ' + r.tot + ' %') : '<span class="hv-drn-live">' + h(t('у повітрі', 'in de lucht')) + '</span>', actie: 'drn-vlucht-open', gegevens: { vlucht: r.id }, k: 'drn-vr-' + r.id });
  }

  function renderPark(ctx) {
    var w = ctx.staat, z = zorg(w), v = vliegend(w), wd = wind(w);
    var gereedLijst = DRONES.filter(function (id) { return gereed(ctx, id).ok; });
    var zin, kortZin;
    if (v) {
      zin = v.link === false ? t(kort(v.id) + ' без зв’язку ' + Math.round(v.kwijtS) + ' с і летить додому сам. Команди не доходять, доки сигнал не повернеться.', kort(v.id) + ' is ' + Math.round(v.kwijtS) + ' s zonder verbinding en vliegt zelf naar huis. Commando’s komen niet aan tot het signaal terug is.')
        : t(kort(v.id) + ' у повітрі: ' + HV.p(missie(w, v.missie).naam).toLowerCase() + ', ' + Math.round(v.lading) + ' %, сигнал ' + v.signaal + ' %.', kort(v.id) + ' is in de lucht: ' + HV.p(missie(w, v.missie).naam).toLowerCase() + ', ' + Math.round(v.lading) + ' %, signaal ' + v.signaal + ' %.');
      kortZin = v.link === false ? t('Сигнал втрачено, дрон летить додому', 'Signaal kwijt, drone vliegt naar huis') : t(kort(v.id) + ' у польоті · ', kort(v.id) + ' vliegt · ') + Math.round(v.lading) + ' %';
    } else if (gereedLijst.length === 2) { zin = t('Обидва дрони в доку й готові до польоту. Вітер ' + HV.getal(wd.v, 0) + ' м/с, пориви до ' + HV.getal(wd.vlaag, 0) + '.', 'Beide drones staan in het dock en zijn klaar om te vliegen. Wind ' + HV.getal(wd.v, 0) + ' m/s, vlagen tot ' + HV.getal(wd.vlaag, 0) + '.'); kortZin = t('Обидва дрони готові', 'Beide drones klaar'); }
    else if (gereedLijst.length === 1) { var niet = DRONES.filter(function (id) { return gereedLijst.indexOf(id) < 0; })[0]; var r0 = gereed(ctx, niet).redenen[0]; zin = t(kort(gereedLijst[0]) + ' готовий до польоту; ' + kort(niet) + ' — ні: ', kort(gereedLijst[0]) + ' is klaar om te vliegen; ' + kort(niet) + ' niet: ') + (r0 ? r0.titel.toLowerCase() : '') + '.'; kortZin = t('Готовий один дрон із двох', 'Eén van de twee drones klaar'); }
    else { zin = t('Жоден дрон зараз не готовий до польоту — відкрийте перевірку, щоб побачити причини.', 'Geen drone is nu klaar om te vliegen — open de controle om de redenen te zien.'); kortZin = t('Дрони не готові', 'Drones niet klaar'); }
    var held = '<section class="hv-drn-zin' + (v ? (v.link === false ? ' is-alarm' : ' is-lucht') : '') + '" data-k="drn-zin"><span class="hv-drn-zin__teken">' + HV.icoon(v && v.link === false ? 'wifi-off' : 'drone', { maat: 'l' }) + '</span><div class="hv-drn-zin__tekst">' +
      '<p class="hv-drn-zin__vol">' + h(zin) + '</p><p class="hv-drn-zin__kort">' + h(kortZin) + '</p><div class="hv-drn-chips">' +
      (v ? o.chip({ icoon: 'gamepad-2', toon: v.link === false ? 'alarm' : 'batterij', tekst: t('Відкрити кабіну', 'Cockpit openen'), actie: 'drn-kabine', gegevens: { drone: v.id }, k: 'drn-zin-kab' }) : '') +
      o.chip({ icoon: 'wind', toon: wd.vlaag > 10.7 ? 'let-op' : null, tekst: t('Вітер ', 'Wind ') + HV.getal(wd.v, 0) + t(', пориви ', ', vlagen ') + HV.getal(wd.vlaag, 0) + t(' м/с', ' m/s') }) +
      o.chip({ icoon: 'drn-dock', tekst: t('Док: ', 'Dock: ') + (w.apparaten.dronedock.st.open ? t('відчинено', 'open') : t('зачинено', 'dicht')) + (w.apparaten.dronedock.st.laadt ? t(' · заряджає', ' · laadt') : ''), actie: 'ga', gegevens: { naar: 'garage-drones-dock' }, k: 'drn-zin-dock' }) + '</div></div></section>';
    var nu = o.nu(w.nu.filter(function (n) { return /^drn-|^vlucht$|^signaal$/.test(n.id); }));
    var balk = v ? vluchtbalk(ctx, v, { naam: true }) : '';
    var vloot = '<div class="hv-drn-vloot">' + DRONES.map(function (id) { return droneKaart(ctx, id); }).join('') + '</div>';
    var kies = HV.ui.lees('drn-mk-drone', 'ooievaar');
    var missies = '<div class="hv-drn-missies__kop">' + o.segment({ label: t('Дрон для місії', 'Drone voor de missie'), waarde: kies, actie: 'ui', gegevens: { naam: 'drn-mk-drone' }, opties: DRONES.map(function (id) { return { id: id, label: kort(id), icoon: 'drone' }; }), k: 'drn-mk-seg' }) + '</div>' +
      '<div class="hv-drn-missies">' + z.missies.map(function (m) { return missieKaartje(ctx, m, kies); }).join('') + '</div>';
    var recent = '<div class="hv-rijen hv-rijen--kaart">' + z.vluchten.slice(0, 3).map(function (r) { return vluchtRij(w, r); }).join('') + '</div><div class="hv-knoppen">' + o.knop({ tekst: t('Усі польоти', 'Alle vluchten'), icoon: 'history', soort: 'stil', actie: 'ga', gegevens: { naar: 'garage-drones-vluchten' }, k: 'drn-alle-vl' }) + '</div>';
    return '<div class="hv-drn" data-k="drn-park">' + navigatie(ctx) + held + nu + balk +
      '<div class="hv-drn-rooster">' +
      '<div class="hv-drn-kolom">' + o.blok({ id: 'drn-vloot', titel: t('Парк', 'Vloot'), teller: DRONES.length, vast: true, inhoud: vloot }) + o.blok({ id: 'drn-missies', titel: t('Місії', 'Missies'), teller: z.missies.length, inhoud: missies }) + '</div>' +
      '<div class="hv-drn-kolom">' + o.blok({ id: 'drn-dock', titel: t('Док і батареї', 'Dock en accu’s'), inhoud: dockKaart(ctx) + accusKaart(ctx) }) +
      o.blok({ id: 'drn-agenten', titel: t('Пропозиції агентів', 'Voorstellen van agenten'), inhoud: agentKaart(ctx) }) +
      o.blok({ id: 'drn-recent', titel: t('Останні польоти', 'Recente vluchten'), teller: z.vluchten.length, inhoud: recent }) + '</div></div></div>';
  }

  // ───────────────────────── 11. Кабіна польоту ─────────────────────────
  function tegeltje(icoon, label, waarde, sub, extra, klas) {
    return '<div class="hv-drn-tele__cel' + (klas ? ' ' + klas : '') + '"><span class="hv-drn-tele__label">' + HV.icoon(icoon, { maat: 's' }) + h(label) + '</span><span class="hv-drn-tele__waarde">' + waarde + '</span>' + (sub ? '<span class="hv-drn-tele__sub">' + sub + '</span>' : '') + (extra || '') + '</div>';
  }
  function renderCockpit(ctx) {
    var w = ctx.staat, z = zorg(w), v = vliegend(w);
    var id = v ? v.id : HV.ui.lees('drn-kies', 'ooievaar'), d = drone(w, id), lucht = inLucht(d), sp = SPEC[id];
    var l = d.link === false && d.laatst ? d.laatst : d;
    var m = lucht ? missie(w, d.missie) : missie(w, z.gekozen[id]);
    var oud = d.link === false ? Math.round(d.kwijtS || 0) : Math.max(0, (Date.now() - (d.gezienEcht || Date.now())) / 1000);
    var stale = d.link === false && oud >= 5;
    var nodigTerug = Math.ceil(afstand(plek(d), DOCK) / 6 / 60 * sp.verbruik + (l.h || 0) / 1.5 / 60 * sp.verbruik);
    var wd = wind(w);
    var kies = !v ? '<div class="hv-drn-cockpit__kies">' + o.segment({ label: t('Дрон', 'Drone'), waarde: id, actie: 'ui', gegevens: { naam: 'drn-kies' }, opties: DRONES.map(function (x) { return { id: x, label: kort(x), icoon: 'drone' }; }), k: 'drn-kab-seg' }) + '</div>' : '';
    var punt = lucht && m ? Math.min(m.punten.length, (d.punt || 0) + 1) : 0;
    var restS = lucht && m && d.fase !== 'terug' && d.fase !== 'landen' ? Math.max(0, plan(m).seconden - (d.vluchtS || 0)) : (lucht ? afstand(plek(d), DOCK) / 6 + (l.h || 0) / 1.5 : 0);
    var tele = '<div class="hv-drn-tele' + (stale ? ' is-oud' : '') + '" data-k="drn-tele">' +
      tegeltje('arrow-up-from-line', t('Висота', 'Hoogte'), HV.maat(Math.round(l.h || 0), t('м', 'm')), h(t('стеля ', 'plafond ') + z.inst.plafond + t(' м', ' m')), balk((l.h || 0) / z.inst.plafond * 100, 'koud'), 'is-hoogte') +
      tegeltje('gauge', t('Швидкість', 'Snelheid'), HV.maat(l.v || 0, t('м/с', 'm/s'), 1), h(t('верт. ', 'vert. ') + HV.getal(d.vz || 0, 1) + t(' м/с', ' m/s'))) +
      tegeltje(l.lading < 25 ? 'battery-low' : 'battery-medium', t('Заряд', 'Accu'), HV.maat(Math.round(l.lading), '%'), h('≈ ' + minutenOver(d) + t(' хв · додому треба ', ' min · naar huis nodig ') + nodigTerug + ' %'), balk(l.lading, l.lading < 25 ? 'warm' : 'batterij', RESERVE), l.lading < 25 ? 'is-let-op' : '') +
      tegeltje(d.link === false ? 'wifi-off' : 'signal-high', t('Сигнал', 'Signaal'), d.link === false ? '<span class="hv-drn-tele__nee">' + h(t('немає', 'geen')) + '</span>' : HV.maat(d.signaal || 100, '%'), h('GPS ' + (d.gps || 17) + t(' супутн.', ' sat.')), '', d.link === false ? 'is-alarm' : '') +
      tegeltje('ruler', t('Відстань', 'Afstand'), HV.maat(d.afstand || 0, t('м', 'm')), h(t('від дока; межа ', 'van het dock; grens ') + z.inst.straal + t(' м', ' m'))) +
      tegeltje('wind', t('Вітер', 'Wind'), HV.maat(wd.v, t('м/с', 'm/s'), 1), h(t('пориви ', 'vlagen ') + HV.getal(wd.vlaag, 1) + t(' · межа ', ' · grens ') + HV.getal(sp.wind, 1))) +
      tegeltje('timer', t('Політ', 'Vlucht'), lucht ? h(mmss(d.vluchtS)) : '—', lucht ? h(t('лишилося ≈ ', 'nog ≈ ') + HV.duur(restS / 60)) : h(t('місія ≈ ', 'missie ≈ ') + HV.duur(plan(m).minuten))) +
      '</div>' +
      '<p class="hv-drn-tele__vers' + (d.link === false ? ' is-alarm' : '') + '" data-k="drn-vers">' + (d.link === false ? HV.icoon('wifi-off', { maat: 's' }) + '<span>' + h(oud >= 15 ? t('недоступний · останнє місце ' + oud + ' с тому; дрон повертається сам', 'niet bereikbaar · laatste plek ' + oud + ' s geleden; de drone keert zelf terug') : t('немає даних ' + oud + ' с', 'geen gegevens sinds ' + oud + ' s')) + '</span>'
        : '<span class="hv-versheid__stip" aria-hidden="true"></span><span>' + h(lucht ? t('телеметрія: наживо, ', 'telemetrie: live, ') + HV.getal(oud, 1) + t(' с', ' s') : t('телеметрія: дрон у доку', 'telemetrie: drone in het dock')) + '</span>') + '</p>';
    var voortgang = lucht && m ? '<div class="hv-drn-voortgang" data-k="drn-voortgang"><span>' + h(d.fase === 'terug' || d.fase === 'landen' ? standWoord(d) : t('точка ', 'punt ') + punt + t(' з ', ' van ') + m.punten.length) + '</span><span>' + h(t('лишилося ', 'nog ') + HV.duur(restS / 60)) + '</span><span>' + h(t('знімків ', 'foto’s ') + (d.fotos || 0)) + '</span></div>' : '';
    var piloot = '<p class="hv-drn-piloot">' + HV.icoon('user', { maat: 's' }) + '<span>' + h(lucht ? t('Керує пілот: ', 'Piloot: ') + (vluchtVan(w, d) && vluchtVan(w, d).piloot ? HV.p(vluchtVan(w, d).piloot) : HV.p(HV.mens().naam)) + t('; решта дивляться. «Повернутися додому» доступно кожному дорослому.', '; de rest kijkt mee. ‘Naar huis’ kan elke volwassene.') : t('Пілот: ', 'Piloot: ') + HV.p(HV.mens().naam) + t(' · свідоцтво A1/A3', ' · bewijs A1/A3')) + '</span></p>';
    var nood = '<p class="hv-tekst hv-tekst--zacht hv-drn-noot">' + HV.icoon('octagon-x', { maat: 's' }) + '<span>' + h(t('Аварійної зупинки двигунів у хабі немає — дрон упав би. Вона лишається на пульті виробника.', 'Een noodstop van de motoren zit niet in de hub — de drone zou vallen. Die blijft op de afstandsbediening van de fabrikant.')) + '</span></p>';
    var simKnoppen = lucht ? '<div class="hv-drn-simrij">' + '<span class="hv-drn-simrij__label">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('Симулятор · політ ×', 'Simulator · vlucht ×') + TEMPO) + '</span>' +
      o.knop({ tekst: d.link === false ? t('Повернути сигнал', 'Signaal herstellen') : t('Втратити сигнал', 'Signaal laten wegvallen'), icoon: d.link === false ? 'signal-high' : 'wifi-off', soort: 'stil', klein: true, actie: 'drn-sim-signaal', gegevens: { drone: id }, k: 'drn-sim-sig' }) +
      o.knop({ tekst: t('Порив вітру', 'Windvlaag'), icoon: 'wind', soort: 'stil', klein: true, actie: 'drn-sim-wind', k: 'drn-sim-wind' }) + '</div>' : '';
    var kaartHtml = '<div class="hv-kaart hv-drn-cockpit__kaart" data-k="drn-kab-kaart">' + kop('map', t('Ділянка', 'Perceel'), m ? '<span class="hv-drn-klein">' + h(HV.p(m.naam)) + '</span>' : '') + kaart(w, { k: 'kab', missie: m, drone: d, pad: lucht && vluchtVan(w, d) ? vluchtVan(w, d).pad : null, straal: false }) + voortgang + '</div>';
    var leeg = !lucht ? '<div class="hv-kaart hv-drn-grond" data-k="drn-grond">' + kop('plane-takeoff', t('Перед зльотом', 'Vóór de start')) + '<p class="hv-drn-agent__zin">' + h(t(kort(id) + ' ' + standWoord(d) + '. Обрана місія: «' + m.naam[0] + '» — ' + HV.duur(plan(m).minuten) + ', треба ' + nodig(m, id) + ' %.', kort(id) + ' staat ' + standWoord(d) + '. Gekozen missie: ‘' + m.naam[1] + '’ — ' + HV.duur(plan(m).minuten) + ', ' + nodig(m, id) + ' % nodig.')) + '</p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Перевірка перед зльотом', 'Controle vóór de vlucht'), icoon: 'plane-takeoff', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'opstijgen:' + id }, k: 'drn-grond-check' }) + o.knop({ tekst: t('Змінити місію', 'Missie wijzigen'), icoon: 'route', actie: 'ga', gegevens: { naar: 'garage-drones-missies' }, k: 'drn-grond-missie' }) + '</div></div>' : '';
    return '<div class="hv-drn hv-drn--cockpit" data-k="drn-cockpit">' + navigatie(ctx) + kies +
      '<div class="hv-drn-cockpit">' +
      '<div class="hv-drn-cockpit__beeld">' + kader(w, d) + '</div>' +
      '<div class="hv-drn-cockpit__getallen"><div class="hv-kaart hv-drn-cockpit__tele">' + kop('activity', HV.p(d.naam), '<span class="hv-drn-klein">' + h(sp.klasse + ' · ' + standWoord(d)) + '</span>', lucht ? 'batterij' : null) + tele + piloot + '</div>' + leeg + '</div>' +
      '<div class="hv-drn-cockpit__kaartvak">' + kaartHtml + nood + simKnoppen + '</div>' +
      '</div>' + vluchtbalk(ctx, d, { vast: true, naam: true }) + '</div>';
  }

  // ───────────────────────── 12. Місії (маршрут, редактор точок) ─────────────────────────
  function renderMissies(ctx) {
    var w = ctx.staat, z = zorg(w);
    var mId = HV.ui.lees('drn-missie', 'dak'), m = missie(w, mId) || z.missies[0];
    var kies = HV.ui.lees('drn-mk-drone', 'ooievaar');
    var v = vliegend(w), bezig = v && v.missie === m.id;
    var gekozen = Math.min(m.punten.length - 1, Number(HV.ui.lees('drn-punt', 0)) || 0);
    var p = m.punten[gekozen], pl = plan(m);
    var buiten = function (q) { return q[0] < 0 || q[0] > PERCEEL.b || q[1] < 0 || q[1] > PERCEEL.h; };
    var lijst = '<div class="hv-drn-missielijst" role="list">' + z.missies.map(function (x) {
      var gek = x.id === m.id;
      return '<button type="button" role="listitem" class="hv-drn-missieknop' + (gek ? ' is-gekozen' : '') + '" aria-pressed="' + (gek ? 'true' : 'false') + '" data-actie="drn-missie-open" data-missie="' + x.id + '" data-k="drn-mknop-' + x.id + '">' + HV.icoon(x.icoon) + '<span><strong>' + h(HV.p(x.naam)) + '</strong><span>' + h(HV.duur(plan(x).minuten) + ' · ' + t('треба ', 'nodig ') + nodig(x, kies) + ' %') + '</span></span></button>';
    }).join('') + '</div>';
    var punten = '<ol class="hv-drn-punten">' + m.punten.map(function (q, i) {
      var gek = i === gekozen;
      return '<li><button type="button" class="hv-drn-puntrij' + (gek ? ' is-gekozen' : '') + (buiten(q) ? ' is-buiten' : '') + '" aria-pressed="' + (gek ? 'true' : 'false') + '" data-actie="ui" data-naam="drn-punt" data-waarde="' + i + '" data-k="drn-pr-' + i + '"><span class="hv-drn-puntrij__nr">' + (i + 1) + '</span><span class="hv-drn-puntrij__waar">' + h(HV.getal(q[0], 0) + ' · ' + HV.getal(q[1], 0) + t(' м', ' m')) + '</span><span class="hv-drn-puntrij__h">' + HV.maat(q[2], t('м', 'm')) + '</span>' + (buiten(q) ? o.risico('gevaarlijk') : '') + '</button></li>';
    }).join('') + '</ol>';
    var dis = bezig;
    var editor = '<div class="hv-drn-editor" data-k="drn-editor">' + '<p class="hv-drn-editor__kop"><strong>' + h(t('Точка ', 'Punt ') + (gekozen + 1)) + '</strong>' + (buiten(p) ? o.risico('gevaarlijk') + '<span class="hv-drn-klein">' + h(t('над сусідньою ділянкою', 'boven een buurperceel')) + '</span>' : '') + '</p>' +
      '<div class="hv-drn-editor__rij"><span class="hv-drn-editor__label">' + h(t('Висота', 'Hoogte')) + '</span>' + o.stapper({ actie: dis ? 'drn-uitleg' : 'drn-punt-hoogte', gegevens: dis ? { reden: 'bezig' } : { missie: m.id, punt: gekozen }, stap: 5, label: t('Висота точки', 'Hoogte van het punt'), waarde: HV.maat(p[2], t('м', 'm')), k: 'drn-ed-h' }) + '</div>' +
      '<div class="hv-drn-editor__rij"><span class="hv-drn-editor__label">' + h(t('Місце, крок 2 м', 'Plek, stap 2 m')) + '</span><span class="hv-drn-pijlen">' +
      [['arrow-up', 0, -2, t('Північ', 'Noord')], ['arrow-left', -2, 0, t('Захід', 'West')], ['arrow-down', 0, 2, t('Південь', 'Zuid')], ['arrow-right', 2, 0, t('Схід', 'Oost')]].map(function (x) {
        return o.icoonknop({ icoon: x[0], aria: t('Посунути точку: ', 'Punt verschuiven: ') + x[3], actie: dis ? 'drn-uitleg' : 'drn-punt-zet', gegevens: dis ? { reden: 'bezig' } : { missie: m.id, punt: gekozen, dx: x[1], dy: x[2] }, klas: 'hv-drn-pijl' });
      }).join('') + '</span></div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Додати точку після', 'Punt erna toevoegen'), icoon: 'plus', klein: true, actie: dis ? 'drn-uitleg' : 'drn-punt-plus', gegevens: dis ? { reden: 'bezig' } : { missie: m.id, punt: gekozen }, uit: dis || m.punten.length >= 14, k: 'drn-ed-plus' }) +
      o.knop({ tekst: t('Видалити точку', 'Punt verwijderen'), icoon: 'trash-2', klein: true, actie: dis || m.punten.length <= 3 ? 'drn-uitleg' : 'drn-punt-weg', gegevens: dis || m.punten.length <= 3 ? { reden: dis ? 'bezig' : 'min' } : { missie: m.id, punt: gekozen }, uit: dis || m.punten.length <= 3, k: 'drn-ed-weg' }) +
      o.knop({ tekst: t('Скинути маршрут', 'Route herstellen'), icoon: 'rotate-ccw', soort: 'stil', klein: true, actie: dis ? 'drn-uitleg' : 'drn-missie-herstel', gegevens: dis ? { reden: 'bezig' } : { missie: m.id }, k: 'drn-ed-reset' }) + '</div>' +
      (dis ? '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('lock', { maat: 's' }) + '<span>' + h(t('Місія зараз летить — маршрут зміниться після посадки.', 'De missie vliegt nu — de route verandert na de landing.')) + '</span></p>' : '') + '</div>';
    var kaartHtml = '<div class="hv-kaart hv-drn-missie__kaart" data-k="drn-m-kaart">' + kop(m.icoon, HV.p(m.naam), '<span class="hv-drn-klein">' + h(m.punten.length + ' ' + HV.meervoud(m.punten.length, ['точка', 'точки', 'точок'], ['punt', 'punten'])) + '</span>') + '<p class="hv-drn-missie__doel">' + h(HV.p(m.doel)) + '</p>' + kaart(w, { k: 'missie', missie: m, gekozenPunt: gekozen, drone: v, straal: true, fit: true, titel: t('Маршрут місії «', 'Route van de missie ‘') + HV.p(m.naam) + t('»', '’') }) +
      '<ul class="hv-drn-legenda"><li><i class="is-route"></i>' + h(t('маршрут', 'route')) + '</li><li><i class="is-straal"></i>' + h(t('межа польоту', 'vlieggrens')) + '</li><li><i class="is-buren"></i>' + h(t('сусідні ділянки', 'buurpercelen')) + '</li><li><i class="is-dock"></i>' + h(t('док', 'dock')) + '</li></ul>' +
      '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Тривалість', 'Duur'), waarde: h(HV.duur(pl.minuten)) }) + o.getal({ maat: 'm', label: t('Шлях', 'Afstand'), waarde: HV.maat(Math.round(pl.lengte), t('м', 'm')) }) +
      o.getal({ maat: 'm', label: t('Найвища точка', 'Hoogste punt'), waarde: HV.maat(pl.maxH, t('м', 'm')) }) + o.getal({ maat: 'm', label: t('Заряд ', 'Accu ') + kort(kies), waarde: HV.maat(nodig(m, kies), '%'), sub: h(t('з поверненням і запасом', 'met terugkeer en reserve')) }) + '</div></div>';
    return '<div class="hv-drn" data-k="drn-missiespagina">' + navigatie(ctx) +
      '<div class="hv-drn-missiekop">' + lijst + '<div class="hv-drn-missiekop__acties">' + o.segment({ label: t('Дрон для місії', 'Drone voor de missie'), waarde: kies, actie: 'ui', gegevens: { naam: 'drn-mk-drone' }, opties: DRONES.map(function (id) { return { id: id, label: kort(id), icoon: 'drone' }; }), k: 'drn-mp-seg' }) +
      o.knop({ tekst: t('Підготувати зліт', 'Start voorbereiden'), icoon: 'plane-takeoff', soort: 'hoofd', actie: 'drn-bereid', gegevens: { drone: kies, missie: m.id }, k: 'drn-mp-start' }) + '</div></div>' +
      '<div class="hv-drn-rooster is-breed-links">' + '<div class="hv-drn-kolom">' + kaartHtml + '</div>' +
      '<div class="hv-drn-kolom"><div class="hv-kaart" data-k="drn-m-punten">' + kop('list-checks', t('Точки маршруту', 'Routepunten'), '<span class="hv-drn-klein">' + h(t('над кожною — ', 'boven elk — ') + m.zweef + t(' с', ' s')) + '</span>') + punten + editor + '</div>' +
      '<div class="hv-kaart" data-k="drn-m-agent"><p class="hv-tekst hv-tekst--zacht">' + HV.icoon('agent', { maat: 's' }) + '<span>' + h(t('Агент може лише запропонувати цю місію пілотові; маршрут змінює людина.', 'Een agent kan deze missie alleen aan de piloot voorstellen; de route wijzigt een mens.')) + '</span></p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Агент Claude: запропонувати цю місію', 'Agent Claude: deze missie voorstellen'), icoon: 'sparkles', klein: true, actie: 'drn-agent', gegevens: { agent: 'claude', missie: m.id, drone: kies }, k: 'drn-m-agentknop' }) + '</div></div></div></div></div>';
  }

  // ───────────────────────── 13. Польоти (журнал, відтворення, CSV) ─────────────────────────
  function renderVluchten(ctx) {
    var w = ctx.staat, z = zorg(w);
    var filter = HV.ui.lees('drn-vfilter', 'alle');
    var lijst = z.vluchten.filter(function (r) { return filter === 'alle' || r.drone === filter; });
    var vId = HV.ui.lees('drn-vlucht', lijst[0] ? lijst[0].id : null), r = z.vluchten.filter(function (x) { return x.id === vId; })[0] || lijst[0];
    var filters = '<div class="hv-drn-chips" role="group" aria-label="' + h(t('Фільтр польотів', 'Filter van vluchten')) + '">' + [['alle', t('Усі', 'Alle')]].concat(DRONES.map(function (id) { return [id, kort(id)]; })).map(function (x) {
      return o.chip({ filter: true, gekozen: filter === x[0], tekst: x[1], actie: 'ui', gegevens: { naam: 'drn-vfilter', waarde: x[0] }, k: 'drn-vf-' + x[0] });
    }).join('') + '</div>';
    var rijen = '<div class="hv-rijen hv-rijen--kaart">' + (lijst.length ? lijst.map(function (x) { return vluchtRij(w, x); }).join('') : '') + '</div>';
    if (!lijst.length) rijen = o.leeg({ icoon: 'history', titel: t('Польотів ще немає', 'Nog geen vluchten'), tekst: t('Тут з’явиться кожен політ: пілот, місія, висота, заряд і події.', 'Hier verschijnt elke vlucht: piloot, missie, hoogte, accu en gebeurtenissen.') });
    var detail = r ? vluchtDetail(ctx, r) : '';
    return '<div class="hv-drn" data-k="drn-vluchtenpagina">' + navigatie(ctx) +
      '<div class="hv-drn-rooster is-breed-rechts"><div class="hv-drn-kolom">' + o.blok({ id: 'drn-vl-lijst', titel: t('Журнал польотів', 'Vluchtlogboek'), teller: lijst.length, vast: true, extra: o.knop({ tekst: 'CSV', icoon: 'file-down', soort: 'stil', klein: true, actie: 'drn-csv', gegevens: { alle: '1' }, k: 'drn-csv-alle' }), inhoud: filters + rijen }) + '</div>' +
      '<div class="hv-drn-kolom">' + detail + '</div></div></div>';
  }
  function vluchtDetail(ctx, r) {
    var w = ctx.staat, m = missie(w, r.missie) || MISSIES[0], d = drone(w, r.drone);
    var live = !r.einde;
    var n = r.pad.length, pos = Math.min(n - 1, Number(HV.ui.lees('drn-afspeel-' + r.id, n - 1)));
    if (isNaN(pos) || pos < 0) pos = n - 1;
    var q = r.pad[pos] || r.pad[n - 1];
    var schuif = n > 1 ? o.schuif({ label: t('Відтворення польоту', 'Vlucht afspelen'), waarde: pos, min: 0, max: n - 1, stap: 1, eenheid: '', actie: 'drn-afspeel', gegevens: { vlucht: r.id }, klas: 'hv-schuif--zonder-getal', k: 'drn-afspeel-' + r.id }) : '';
    var reeksH = r.pad.map(function (x) { return [x.t / 60, x.h]; }), reeksL = r.pad.map(function (x) { return [x.t / 60, x.l]; });
    var maxT = Math.max(1, r.pad[n - 1].t / 60);
    var tikken = [0, 0.5, 1].map(function (f) { return { x: maxT * f, label: HV.duur(maxT * f) }; });
    var grafiek = n > 2 ? HV.grafiek.lijn({ id: 'drn-h-' + r.id, titel: t('Висота', 'Hoogte'), eenheid: t('м', 'm'), hoogte: 120, x: { min: 0, max: maxT, tikken: tikken, format: function (x) { return HV.duur(x); } }, reeksen: [{ naam: t('Висота', 'Hoogte'), toon: 'koud', punten: reeksH, vlak: true }], tabelKop: [t('Хвилина', 'Minuut')], samenvatting: t('Найвище — ', 'Hoogste punt ') + r.maxH + t(' м.', ' m.') }) +
      HV.grafiek.lijn({ id: 'drn-l-' + r.id, titel: t('Заряд', 'Accu'), eenheid: '%', hoogte: 100, y: { min: 0, max: 100 }, x: { min: 0, max: maxT, tikken: tikken, format: function (x) { return HV.duur(x); } }, reeksen: [{ naam: t('Заряд', 'Accu'), toon: 'batterij', punten: reeksL }], tabelKop: [t('Хвилина', 'Minuut')], samenvatting: t('Від ', 'Van ') + r.van + ' %' + (r.tot != null ? t(' до ', ' tot ') + r.tot + ' %' : '') + '.' }) : '';
    var feiten = [[t('Пілот', 'Piloot'), r.piloot ? HV.p(r.piloot) : HV.p(r.door.naam)], [t('Хто запустив', 'Gestart door'), o.maker(r.door)], [t('Дрон', 'Drone'), kort(r.drone) + ' · ' + SPEC[r.drone].klasse],
      [t('Початок', 'Start'), HV.datumKort(r.start) + ' ' + HV.tijd(r.start)], [t('Тривалість', 'Duur'), HV.duur((live ? (d.vluchtS || 0) : r.duurS) / 60)], [t('Вітер', 'Wind'), HV.getal(r.wind, 1) + t(' м/с', ' m/s')]];
    if (r.omweg) feiten.push([t('Обхід вітру', 'Uitzondering wind'), HV.p(r.omweg)]);
    if (r.voorstel) feiten.push([t('За пропозицією', 'Op voorstel van'), HV.p(r.voorstel)]);
    var dl = '<dl class="hv-drn-feiten">' + feiten.map(function (x) { return '<div><dt>' + h(x[0]) + '</dt><dd>' + (x[1].indexOf('<') === 0 ? x[1] : h(x[1])) + '</dd></div>'; }).join('') + '</dl>';
    var gebeurt = r.gebeurtenissen.length ? '<ul class="hv-drn-gebeurt">' + r.gebeurtenissen.map(function (g) { return '<li><span>' + h(HV.duur(g.tS / 60)) + '</span>' + h(HV.p(g.wat)) + '</li>'; }).join('') + '</ul>' : '';
    var vondsten = r.vondsten && r.vondsten.length ? '<div class="hv-drn-vondsten">' + kop('scan-eye', t('Знахідки', 'Bevindingen'), '', 'let-op') + '<ul>' + r.vondsten.map(function (x) { return '<li>' + HV.icoon('triangle-alert', { maat: 's' }) + '<span>' + h(HV.p(x)) + '</span></li>'; }).join('') + '</ul></div>' : '';
    return '<div class="hv-kaart hv-drn-vluchtdetail" data-k="drn-vd-' + r.id + '">' + kop(m.icoon, HV.p(m.naam) + ' · ' + HV.datumKort(r.start), live ? '<span class="hv-drn-live">' + h(t('у повітрі', 'in de lucht')) + '</span>' : o.knop({ tekst: 'CSV', icoon: 'file-down', soort: 'stil', klein: true, actie: 'drn-csv', gegevens: { vlucht: r.id }, k: 'drn-csv-een' })) +
      kaart(w, { k: 'vd-' + r.id, missie: m, pad: r.pad, merk: q, drone: live ? d : null, vondst: r.missie === 'panelen', titel: t('Слід польоту на схемі ділянки', 'Vliegspoor op het schema van het perceel') }) +
      '<div class="hv-drn-afspeel">' + schuif + '<p class="hv-drn-afspeel__tekst" data-k="drn-afspeeltekst">' + h(HV.duur(q.t / 60) + ' · ' + HV.getal(q.h, 0) + t(' м · ', ' m · ') + q.l + ' %') + '</p></div>' +
      dl + gebeurt + vondsten + grafiek + '</div>';
  }

  // ───────────────────────── 14. Правила й зони (довідково), межі, дозволи ─────────────────────────
  function zonesSvg() {
    var uit = '<circle class="hv-drn-z__ring" cx="50" cy="50" r="16"/><circle class="hv-drn-z__ring" cx="50" cy="50" r="32"/><circle class="hv-drn-z__ring" cx="50" cy="50" r="48"/>';
    uit += '<path class="hv-drn-z__spoor" d="M2 62 L98 46"/>';
    ZONES.forEach(function (z) { if (!z.lijn) uit += '<circle class="hv-drn-z__zone hv-toon-' + z.toon + '" cx="' + z.x + '" cy="' + z.y + '" r="' + z.r + '"/>'; });
    uit += '<rect class="hv-drn-z__huis" x="47.5" y="47.5" width="5" height="5" rx="1"/>';
    return '<svg class="hv-drn-zones" viewBox="0 0 100 100" role="img" aria-label="' + h(t('Схема зон польоту довкола дому, довідково', 'Schema van vliegzones rond het huis, ter informatie')) + '">' + uit + '</svg>';
  }
  function renderRegels(ctx) {
    var w = ctx.staat, z = zorg(w), i = z.inst;
    var mens = HV.mens();
    var piloot = '<div class="hv-kaart" data-k="drn-r-piloot">' + kop('id-card', t('Пілот', 'Piloot')) + '<dl class="hv-drn-feiten">' +
      '<div><dt>' + h(t('Людина', 'Persoon')) + '</dt><dd>' + h(HV.p(mens.naam)) + '</dd></div>' +
      '<div><dt>' + h(t('Свідоцтво', 'Bewijs')) + '</dt><dd>' + h(t('A1/A3, дійсне до 03.2029', 'A1/A3, geldig tot 03.2029')) + '</dd></div>' +
      '<div><dt>' + h(t('Номер експлуатанта', 'Exploitantnummer')) + '</dt><dd>' + h(NUMMER) + '</dd></div></dl>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Дані пілота змінюють на сторінці людини; гараж їх лише читає.', 'Pilootgegevens wijzig je op de pagina van de persoon; de garage leest ze alleen.')) + '</span></p></div>';
    var tabel = '<div class="hv-kaart" data-k="drn-r-drones">' + kop('drone', t('Дрони й категорія ЄС', 'Drones en EU-categorie')) + '<div class="hv-tabel__rol"><table class="hv-tabel"><thead><tr><th scope="col">' + h(t('Дрон', 'Drone')) + '</th><th scope="col">' + h(t('Клас', 'Klasse')) + '</th><th scope="col">' + h(t('Маса', 'Massa')) + '</th><th scope="col">' + h(t('Підкатегорія', 'Subcategorie')) + '</th><th scope="col">' + h(t('Межа вітру', 'Windgrens')) + '</th></tr></thead><tbody>' +
      DRONES.map(function (id) { var s = SPEC[id]; return '<tr><th scope="row">' + h(kort(id)) + '</th><td>' + s.klasse + '</td><td>' + s.massa + h(t(' г', ' g')) + '</td><td>' + s.sub + '</td><td>' + HV.getal(s.wind, 1) + h(t(' м/с', ' m/s')) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<ul class="hv-drn-regellijst"><li>' + HV.icoon('radio-tower', { maat: 's' }) + h(t('Віддалена ідентифікація: увімкнена на обох дронах; не обходиться.', 'Remote ID: aan op beide drones; geen uitzondering mogelijk.')) + '</li><li>' + HV.icoon('arrow-up-from-line', { maat: 's' }) + h(t('Стеля категорії «відкрита»: 120 м над землею.', 'Plafond van de categorie ‘open’: 120 m boven de grond.')) + '</li><li>' + HV.icoon('eye', { maat: 's' }) + h(t('Пілот бачить дрон увесь політ; хаб цього не перевіряє — це заява пілота.', 'De piloot ziet de drone de hele vlucht; de hub controleert dat niet — het is een verklaring van de piloot.')) + '</li></ul></div>';
    var grens = '<div class="hv-kaart" data-k="drn-r-grens">' + kop('locate-fixed', t('Межі польоту', 'Vlieggrenzen'), '<span class="hv-drn-klein">' + h(t('задає власник', 'stelt de eigenaar in')) + '</span>') +
      '<div class="hv-veld"><span class="hv-veld__label">' + h(t('Стеля', 'Plafond')) + '</span>' + o.schuif({ label: t('Стеля', 'Plafond'), waarde: i.plafond, min: 20, max: 120, stap: 5, eenheid: t('м', 'm'), toon: 'koud', actie: 'drn-inst', gegevens: { sleutel: 'plafond' }, k: 'drn-i-plafond' }) + '</div>' +
      '<div class="hv-veld"><span class="hv-veld__label">' + h(t('Радіус від дока', 'Straal vanaf het dock')) + '</span>' + o.schuif({ label: t('Радіус від дока', 'Straal vanaf het dock'), waarde: i.straal, min: 30, max: 200, stap: 10, eenheid: t('м', 'm'), toon: 'koud', actie: 'drn-inst', gegevens: { sleutel: 'straal' }, k: 'drn-i-straal' }) + '</div>' +
      '<div class="hv-veld"><span class="hv-veld__label">' + h(t('Висота повернення додому', 'Hoogte bij terugkeer')) + '</span>' + o.schuif({ label: t('Висота повернення додому', 'Hoogte bij terugkeer'), waarde: i.terugHoogte, min: 15, max: 60, stap: 5, eenheid: t('м', 'm'), toon: 'koud', actie: 'drn-inst', gegevens: { sleutel: 'terugHoogte' }, k: 'drn-i-terug' }) + '</div>' +
      '<div class="hv-drn-rij"><span class="hv-drn-rij__tekst"><strong>' + h(t('Запис відео', 'Video-opname')) + '</strong><span>' + h(i.opname ? t('увімкнено · зберігання 7 днів', 'aan · 7 dagen bewaard') : t('типово вимкнено', 'standaard uit')) + '</span></span>' + o.risico('gevoelig') +
      o.gevolg(t('Що станеться: кабіна записуватиме кадр польоту й зберігатиме 7 днів. Пов’язано з: сусідні ділянки під маскою й у записі. Як повернути: вимкніть — записи видаляються за строком.', 'Wat er gebeurt: de cockpit neemt het vluchtbeeld op en bewaart het 7 dagen. Hangt samen met: buurpercelen blijven afgeschermd, ook in de opname. Terugdraaien: zet uit — opnamen verdwijnen na de termijn.'), { kop: t('Запис відео', 'Video-opname') }) +
      o.schakel({ aan: !!i.opname, icoon: i.opname ? 'video' : 'video-off', toon: 'aan', actie: 'drn-opname', aria: t('Запис відео', 'Video-opname') }) + '</div>' +
      '<div class="hv-drn-rij"><span class="hv-drn-rij__tekst"><strong>' + h(t('Маска сусідніх ділянок', 'Afscherming van buurpercelen')) + '</strong><span>' + h(t('завжди ввімкнена в кабіні й записі', 'altijd aan in cockpit en opname')) + '</span></span>' + HV.icoon('lock', { maat: 's' }) + '</div></div>';
    var zones = '<div class="hv-kaart hv-drn-zonekaart" data-k="drn-r-zones">' + kop('map', t('Зони польоту', 'Vliegzones'), '<span class="hv-drn-klein">' + h(t('дані ', 'gegevens van ') + DATUM_ZONES) + '</span>') +
      '<p class="hv-drn-terinfo">' + HV.icoon('info', { maat: 's' }) + '<strong>' + h(t('Довідково. Перед польотом перевірте офіційну карту.', 'Ter informatie. Controleer vóór de vlucht de officiële kaart.')) + '</strong></p>' +
      '<div class="hv-drn-zones__vak">' + zonesSvg() + '<ul class="hv-drn-zones__lijst">' + ZONES.map(function (zn) { return '<li class="hv-toon-' + zn.toon + '"><i></i><span><strong>' + h(HV.p(zn.naam)) + '</strong><span>' + h(HV.p(zn.soort) + ' · ' + HV.getal(zn.afstand, 1) + t(' км', ' km')) + '</span></span></li>'; }).join('') +
      '<li><i class="is-ring"></i><span><strong>' + h(t('Кільця', 'Ringen')) + '</strong><span>' + h(t('0,5 · 1 · 1,5 км від дому', '0,5 · 1 · 1,5 km van het huis')) + '</span></span></li></ul></div>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('triangle-alert', { maat: 's' }) + '<span>' + h(t('Хаб не ставить галочку біля зони: відповідальність за повітряний простір лишається на пілотові.', 'De hub zet geen vinkje bij een zone: de piloot blijft verantwoordelijk voor het luchtruim.')) + '</span></p></div>';
    var uitv = HV.gevaar.uitvoerders(), kiesU = HV.ui.lees('drn-uitvoerder', 'claude');
    var standen = '<div class="hv-kaart hv-drn-standen" data-k="drn-r-standen">' + kop('shield-check', t('Дозволи для безпілотників', 'Toestemmingen voor drones'), o.knop({ tekst: t('Реєстр', 'Register'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'instellingen' }, k: 'drn-r-register' })) +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Для кожного виконавця й кожної дії: «Вимкнено · Питати · Завжди». Типово — «Вимкнено». Змінює лише власник; агент дозволів не змінює. Кожна зміна — запис у Журналі.', 'Per uitvoerder en per actie: ‘Uit · Vragen · Altijd’. Standaard ‘Uit’. Alleen de eigenaar wijzigt; een agent wijzigt geen toestemmingen. Elke wijziging komt in het logboek.')) + '</span></p>' +
      '<div class="hv-drn-chips hv-drn-uitvoerders" role="group" aria-label="' + h(t('Виконавець', 'Uitvoerder')) + '">' + uitv.map(function (u) { return o.chip({ filter: true, gekozen: u.id === kiesU, icoon: u.soort === 'agent' ? 'agent' : u.soort === 'scene' ? 'sparkles' : u.soort === 'optimalisatie' ? 'gauge' : 'diamond', tekst: HV.p(u.naam), actie: 'ui', gegevens: { naam: 'drn-uitvoerder', waarde: u.id }, k: 'drn-u-' + u.id }); }).join('') + '</div>' +
      '<div class="hv-drn-standen__lijst">' + ACTIES_DRONE.map(function (s) { return o.stand({ uitvoerder: kiesU, actie: HV.gevaar.actie(s), rol: ctx.rol }); }).join('') + '</div></div>';
    return '<div class="hv-drn" data-k="drn-regelspagina">' + navigatie(ctx) +
      '<div class="hv-drn-rooster"><div class="hv-drn-kolom">' + zones + tabel + piloot + '</div><div class="hv-drn-kolom">' + grens + standen + '</div></div></div>';
  }

  // ───────────────────────── 15. Картки дрона й дока ─────────────────────────
  function renderDrone(ctx, id) {
    var w = ctx.staat, z = zorg(w), d = drone(w, id), sp = SPEC[id], lucht = inLucht(d);
    var vl = z.vluchten.filter(function (r) { return r.drone === id; });
    var rijen = controles(ctx, id);
    var acc = SPEC[id].accus.map(function (x) { return accu(w, x); });
    var cards = '<div class="hv-kaart" data-k="drn-d-spec">' + kop('drone', t('Паспорт', 'Paspoort')) + '<dl class="hv-drn-feiten">' +
      [[t('Клас ЄС', 'EU-klasse'), sp.klasse], [t('Маса', 'Massa'), sp.massa + t(' г', ' g')], [t('Підкатегорія', 'Subcategorie'), sp.sub], [t('Камера', 'Camera'), HV.p(sp.camera)], [t('Найбільша швидкість', 'Topsnelheid'), sp.vMax + t(' м/с', ' m/s')], [t('Політ на повній батареї', 'Vliegtijd met volle accu'), sp.vlucht + t(' хв', ' min')]].map(function (x) { return '<div><dt>' + h(x[0]) + '</dt><dd>' + h(x[1]) + '</dd></div>'; }).join('') + '</dl></div>';
    var accus = '<div class="hv-kaart" data-k="drn-d-accus">' + kop('battery-medium', t('Батареї дрона', 'Accu’s van de drone')) + acc.map(function (b) {
      return '<div class="hv-drn-accu is-rij"><span class="hv-drn-accu__kop"><strong>' + h(HV.p(b.naam)) + '</strong><span>' + h(b.plek === id ? t('стоїть у дроні', 'zit in de drone') : t('у доку', 'in het dock')) + '</span></span><span class="hv-drn-accu__lading">' + HV.maat(Math.round(b.lading), '%') + '</span>' + balk(b.lading) + '<span class="hv-drn-accu__feiten"><span>' + h(t('циклів ', 'cycli ')) + '<b>' + b.cycli + '</b></span><span>' + h(t('стан ', 'conditie ')) + '<b>' + b.gezondheid + ' %</b></span></span></div>';
    }).join('') + '</div>';
    var check = '<div class="hv-kaart" data-k="drn-d-check">' + kop('list-checks', t('Готовність', 'Gereedheid'), '<span class="hv-drn-klein">' + h(HV.p(missie(w, z.gekozen[id]).naam)) + '</span>') + controleLijst(rijen, id, false) + '</div>';
    var hist = '<div class="hv-rijen hv-rijen--kaart">' + vl.slice(0, 5).map(function (r) { return vluchtRij(w, r); }).join('') + '</div>';
    return '<div class="hv-drn" data-k="drn-dronepagina-' + id + '">' + navigatie(ctx) +
      '<div class="hv-drn-terug">' + o.knop({ tekst: t('Парк', 'Vloot'), icoon: 'chevron-left', soort: 'stil', actie: 'ga', gegevens: { naar: 'garage-drones' }, k: 'drn-terug' }) + '</div>' +
      droneKaart(ctx, id) + (lucht ? vluchtbalk(ctx, d) : '') +
      '<div class="hv-drn-rooster"><div class="hv-drn-kolom">' + check + accus + '</div><div class="hv-drn-kolom">' + cards + o.blok({ id: 'drn-d-vl-' + id, titel: t('Польоти цього дрона', 'Vluchten van deze drone'), teller: vl.length, inhoud: hist || o.leeg({ icoon: 'history', titel: t('Польотів ще немає', 'Nog geen vluchten') }) }) + '</div></div></div>';
  }
  function renderDock(ctx) {
    return '<div class="hv-drn" data-k="drn-dockpagina">' + navigatie(ctx) +
      '<div class="hv-drn-terug">' + o.knop({ tekst: t('Парк', 'Vloot'), icoon: 'chevron-left', soort: 'stil', actie: 'ga', gegevens: { naar: 'garage-drones' }, k: 'drn-terug' }) + '</div>' +
      '<div class="hv-drn-rooster"><div class="hv-drn-kolom">' + dockKaart(ctx, true) + '</div><div class="hv-drn-kolom">' + accusKaart(ctx) + '</div></div></div>';
  }

  /** Перед малюванням: стан зони й модель польоту, що почався в сценарії (абонент стану міг ще не встигнути). */
  function bereid(w) {
    zorg(w);
    (w.drones || []).forEach(function (d) { if (inLucht(d) && d.x == null) initScenario(w, d); });
    if ((w.drones || []).some(inLucht)) zorgKlok();
  }
  function renderDrones(ctx) {
    var obj = ctx.route.object;
    bereid(ctx.staat);
    if (obj === 'vlucht') return renderCockpit(ctx);
    if (obj === 'missies') return renderMissies(ctx);
    if (obj === 'vluchten') return renderVluchten(ctx);
    if (obj === 'regels') return renderRegels(ctx);
    if (obj === 'dock') return renderDock(ctx);
    if (DRONES.indexOf(obj) >= 0) return renderDrone(ctx, obj);
    return renderPark(ctx);
  }

  // ───────────────────────── 16. Перевірка перед зльотом (вільний аркуш) ─────────────────────────
  function controleLijst(rijen, id, metActies) {
    return '<ul class="hv-drn-check">' + rijen.map(function (r) {
      var open = metActies && HV.ui.lees('drn-waarom', null) === r.id;
      var knop = r.waarom ? '<button type="button" class="hv-drn-check__meer" aria-expanded="' + (open ? 'true' : 'false') + '" data-actie="ui" data-naam="drn-waarom" data-waarde="' + (open ? '' : r.id) + '">' + h(open ? t('Згорнути', 'Inklappen') : t('Чому · що робити', 'Waarom · wat te doen')) + '</button>' : '';
      return '<li class="hv-drn-check__rij is-' + r.staat + '" data-k="drn-c-' + r.id + '"><span class="hv-drn-check__teken">' + HV.icoon(STAAT_ICOON[r.staat] || 'minus', { maat: 's' }) + '</span>' +
        '<span class="hv-drn-check__tekst"><strong>' + h(r.titel) + '</strong><span>' + h(r.detail || '') + '</span>' + (metActies ? knop : '') + '</span>' +
        '<span class="hv-drn-check__woord">' + h(r.staat === 'ok' ? t('гаразд', 'in orde') : r.staat === 'fout' ? t('ні', 'nee') : r.staat === 'let' ? t('увага', 'let op') : r.staat === 'omweg' ? t('обхід', 'uitzondering') : '—') + '</span>' +
        (open && r.waarom ? '<div class="hv-drn-check__waarom">' + r.waarom.map(function (x) { var i = x.indexOf(': '); return '<p><strong>' + h(x.slice(0, i + 1)) + '</strong> ' + h(x.slice(i + 2)) + '</p>'; }).join('') + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
    void id;
  }
  function renderOpstijgen(ctx, id) {
    bereid(ctx.staat);
    var w = ctx.staat, z = zorg(w);
    if (DRONES.indexOf(id) < 0) id = 'ooievaar';
    var d = drone(w, id), a = w.apparaten[id], sp = SPEC[id];
    var m = missie(w, z.gekozen[id]), pl = plan(m);
    if (inLucht(d)) return o.kaart({ inhoud: '<p class="hv-drn-agent__zin">' + h(t(kort(id) + ' уже в повітрі.', kort(id) + ' is al in de lucht.')) + '</p><div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити кабіну', 'Cockpit openen'), icoon: 'gamepad-2', soort: 'hoofd', actie: 'drn-kabine', gegevens: { drone: id } }) + '</div>' });
    var rijen = controles(ctx, id);
    var blok = rijen.filter(function (r) { return r.blok && r.staat === 'fout'; });
    var windLet = rijen.filter(function (r) { return r.id === 'wind' && r.staat === 'let'; })[0];
    var windJa = a.st.bron === 'd-wind-ja';
    var verklaard = !!z.verklaring[id];
    var kan = !blok.length && !windLet && verklaard;
    var zin = t(kort(id) + ' виконає «' + m.naam[0] + '» за ' + HV.duur(pl.minuten) + ' на висоті до ' + pl.maxH + ' м і повернеться в док.', kort(id) + ' voert ‘' + m.naam[1] + '’ uit in ' + HV.duur(pl.minuten) + ' tot ' + pl.maxH + ' m hoog en keert terug naar het dock.');
    var voorstel = z.voorstelVoor[id] ? '<p class="hv-drn-voorstel">' + HV.icoon('agent', { maat: 's' }) + '<span>' + h(t('За пропозицією: ', 'Op voorstel van: ') + HV.p(z.voorstelVoor[id])) + '</span></p>' : '';
    var KORTNAAM = { perceel: ['Ділянка', 'Perceel'], dak: ['Дах', 'Dak'], panelen: ['Панелі', 'Panelen'] };
    var missieKeuze = o.segment({ label: t('Місія', 'Missie'), waarde: m.id, actie: 'drn-kies-missie', gegevens: { drone: id }, opties: z.missies.map(function (x) { return { id: x.id, label: HV.p(KORTNAAM[x.id] || x.naam), icoon: x.icoon }; }), k: 'drn-o-missie' });
    var windBlok = windLet || windJa ? '<div class="hv-drn-wind" data-k="drn-o-wind">' + (windJa
      ? '<p>' + o.risico('gevaarlijk') + '<span>' + h(t('Обхід вітру дозволено: ', 'Uitzondering voor wind toegestaan: ') + HV.p(z.windReden[id] || ['', ''])) + '</span></p>' + o.knop({ tekst: t('Скасувати обхід', 'Uitzondering intrekken'), icoon: 'undo-2', klein: true, actie: 'drn-wind', gegevens: { drone: id, ja: '' }, k: 'drn-wind-terug' })
      : '<p class="hv-drn-wind__kop">' + o.risico('gevaarlijk') + '<strong>' + h(t('Летіти попри вітер', 'Toch vliegen bij wind')) + '</strong></p><p class="hv-drn-klein">' + h(t('Обов’язкова причина — її буде записано в польоті й Журналі:', 'Een reden is verplicht — die komt in de vlucht en het logboek:')) + '</p>' +
        '<div class="hv-drn-chips">' + WINDREDENEN.map(function (r) { return o.chip({ filter: true, gekozen: HV.ui.lees('drn-windreden', null) === r[0], tekst: HV.p(r[1]), actie: 'ui', gegevens: { naam: 'drn-windreden', waarde: r[0] }, k: 'drn-wr-' + r[0] }); }).join('') + '</div>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Летіти попри вітер…', 'Toch vliegen…'), icoon: 'wind', actie: HV.ui.lees('drn-windreden', null) ? 'drn-wind' : 'drn-uitleg', gegevens: HV.ui.lees('drn-windreden', null) ? { drone: id, ja: '1' } : { reden: 'windreden' }, uit: !HV.ui.lees('drn-windreden', null), k: 'drn-wind-ja' }) + '</div>') + '</div>' : '';
    var verklaring = '<button type="button" class="hv-drn-verklaring' + (verklaard ? ' is-aan' : '') + '" role="checkbox" aria-checked="' + (verklaard ? 'true' : 'false') + '" data-actie="drn-verklaring" data-drone="' + id + '" data-k="drn-o-verkl"><span class="hv-drn-verklaring__vak">' + (verklaard ? HV.icoon('check', { maat: 's' }) : '') + '</span><span><strong>' + h(t('Заява пілота: я бачу дрон', 'Verklaring van de piloot: ik zie de drone')) + '</strong><span>' + h(t('хаб цього не перевіряє — заяву буде записано в польоті', 'de hub controleert dit niet — de verklaring komt in de vlucht')) + '</span></span></button>';
    var redenNiet = blok.length ? blok[0].titel : windLet ? t('потрібне рішення щодо вітру', 'beslis eerst over de wind') : !verklaard ? t('поставте заяву пілота', 'vink de verklaring van de piloot aan') : '';
    var start = '<div class="hv-drn-start" data-k="drn-o-start">' + o.knop({ tekst: t('Злетіти', 'Opstijgen'), icoon: 'plane-takeoff', soort: 'hoofd', actie: kan ? 'drn-opstijgen' : 'drn-uitleg', gegevens: kan ? { drone: id } : { reden: 'niet-klaar', tekst: redenNiet }, uit: !kan, k: 'drn-o-knop' }) +
      '<p class="hv-drn-klein">' + h(kan ? t('Далі: рейка утримання й підтвердження входу; діє 5 хв для цього сеансу.', 'Daarna: de rail vasthouden en je aanmelding bevestigen; geldt 5 min voor deze sessie.') : t('Зліт недоступний: ', 'Opstijgen kan nog niet: ') + redenNiet + '.') + '</p></div>';
    return '<div class="hv-drn-opstijgen" data-k="drn-opstijgen-' + id + '">' +
      '<p class="hv-drn-opstijgen__kop">' + o.risico('kritiek', { lang: true }) + o.gevolg(HV.p(HV.gevaar.actie('drone.opstijgen').gevolg), { kop: t('Зліт дрона', 'Drone laten opstijgen') }) + '</p>' +
      '<p class="hv-drn-opstijgen__zin">' + h(zin) + '</p>' + voorstel + missieKeuze +
      controleLijst(rijen, id, true) + windBlok + verklaring + start +
      '<div class="hv-drn-simrij"><span class="hv-drn-simrij__label">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('Симулятор', 'Simulator')) + '</span>' + o.knop({ tekst: zorg(w).windExtra ? t('Вітер стих', 'Wind gaat liggen') : t('Порив вітру', 'Windvlaag'), icoon: 'wind', soort: 'stil', klein: true, actie: 'drn-sim-wind', k: 'drn-o-simwind' }) + '</div>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('flask-conical', { maat: 's' }) + '<span>' + h(t('Лише симуляція: справжній зліт — окреме рішення власника. ', 'Alleen simulatie: echt opstijgen is een apart besluit van de eigenaar. ') + sp.klasse + ' · ' + sp.massa + t(' г', ' g')) + '</span></p></div>';
  }

  // ───────────────────────── 17. Аркуші пристроїв (плитки «Сад») ─────────────────────────
  var beeldKern = o.beeld;
  o.beeld = function (a) {
    var w = HV.staat.w;
    if (a.soort === 'drone' && w) {
      var d = drone(w, a.id);
      if (d) return { icoon: 'drone', toon: inLucht(d) ? 'batterij' : null, aan: inLucht(d), woord: standWoord(d), waarde: HV.maat(Math.round(d.link === false && d.laatst ? d.laatst.lading : d.lading), '%'), niveau: null, schakel: null, kritiek: false, passief: true };
    }
    if (a.soort === 'dronedock') {
      return { icoon: 'drn-dock', toon: a.st.laadt ? 'batterij' : null, aan: !!a.st.laadt, woord: (a.st.open ? t('кришка відчинена', 'klep open') : t('кришка зачинена', 'klep dicht')) + (a.st.laadt ? ' · ' + t('заряджає', 'laadt') : ''), waarde: '', niveau: null, schakel: { mogelijkheid: 'laden' }, kritiek: false, passief: false };
    }
    return beeldKern(a);
  };
  function droneBlad(ctx, a) {
    bereid(ctx.staat);
    var w = ctx.staat, d = drone(w, a.id);
    if (!d) return '';
    // у польоті — смуга з діями безпеки; на землі дії вже є на картці (перевірка перед зльотом)
    return droneKaart(ctx, a.id) + (inLucht(d) ? vluchtbalk(ctx, d) : '') +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Картка дрона', 'Kaart van de drone'), soort: 'stil', actie: 'ga', gegevens: { naar: 'garage-drones-' + a.id } }) + o.knop({ tekst: t('Польоти', 'Vluchten'), soort: 'stil', actie: 'ga', gegevens: { naar: 'garage-drones-vluchten' } }) + '</div>';
  }
  function dockBlad(ctx) { return dockKaart(ctx, true); }

  // ───────────────────────── 18. Реєстрація ─────────────────────────
  HV.tab('garage', { id: 'drones', titel: ['Безпілотники', 'Drones'], adres: '/garage/drones/:object', render: renderDrones });
  HV.blad({ soort: 'drone', past: function (a) { return a.soort === 'drone'; }, delen: { bediening: droneBlad } });
  HV.blad({ soort: 'dronedock', past: function (a) { return a.soort === 'dronedock'; }, delen: { bediening: dockBlad } });
  HV.blad({ soort: 'opstijgen', vrij: true, icoon: 'plane-takeoff', titel: function (ctx, id) { return t('Перевірка перед зльотом: ', 'Controle vóór de vlucht: ') + kort(DRONES.indexOf(id) >= 0 ? id : 'ooievaar'); },
    sub: function () { return t('Лише симуляція · критична дія', 'Alleen simulatie · kritieke actie'); }, render: renderOpstijgen });

  // ───────────────────────── 19. Дії ─────────────────────────
  var UITLEG = {
    'wissel-lucht': ['Батарею міняють лише в доку: дрон зараз не в гнізді.', 'Een accu wissel je alleen in het dock: de drone staat nu niet in de bak.'],
    'wissel-vol': ['Заміна не дасть більше заряду: запасна батарея не повніша за встановлену.', 'Wisselen levert geen lading op: de reserve-accu is niet voller dan de geplaatste.'],
    bezig: ['Місія зараз летить: маршрут можна змінити після посадки.', 'De missie vliegt nu: de route kun je na de landing wijzigen.'],
    min: ['У маршруті має бути щонайменше три точки.', 'Een route heeft minstens drie punten.'],
    windreden: ['Спершу оберіть причину — без неї обхід вітру не записують.', 'Kies eerst een reden — zonder reden wordt geen uitzondering vastgelegd.']
  };
  HV.actie('drn-uitleg', function (ctx, g) {
    var tekst = g.reden === 'niet-klaar' ? t('Зліт недоступний: ', 'Opstijgen kan nog niet: ') + (g.tekst || '') : HV.p(UITLEG[g.reden] || ['Дія зараз недоступна.', 'Deze actie kan nu niet.']);
    HV.meld({ gewicht: 'belangrijk', icoon: 'info', titel: t('Недоступно', 'Niet beschikbaar'), tekst: tekst });
  });
  HV.actie('drn-kabine', function (ctx, g) { if (g.drone) HV.ui.zet('drn-kies', g.drone); HV.bladOpen(null); HV.open('garage-drones-vlucht'); });
  HV.actie('drn-cmd', function (ctx, g) {
    var d = drone(HV.staat.w, g.drone);
    if (!d) return;
    if (!inLucht(d)) { HV.meld({ icoon: 'info', titel: HV.p(d.naam), tekst: t('Дрон на землі — команди польоту не потрібні.', 'De drone staat aan de grond — vluchtcommando’s zijn niet nodig.') }); return; }
    var waarom = { 'd-zweven': ['з кабіни', 'vanuit de cockpit'], 'd-naarhuis': ['з кабіни', 'vanuit de cockpit'], 'd-landen': ['посадка на місці', 'landing ter plaatse'], 'd-hervatten': ['з кабіни', 'vanuit de cockpit'] }[g.cmd];
    HV.doe({ doel: g.drone, mogelijkheid: 'modus', waarde: g.cmd, waarom: waarom });
  });
  HV.actie('drn-dock', function (ctx, g) { HV.doe({ doel: 'dronedock', mogelijkheid: g.mogelijkheid, waarde: g.waarde === '1' }); });
  HV.actie('drn-wissel', function (ctx, g) { HV.doe({ doel: 'dronedock', mogelijkheid: 'modus', waarde: 'd-wissel-' + g.drone, waarom: ['запасна батарея повніша', 'de reserve-accu is voller'] }); });
  HV.actie('drn-terugzetten', function (ctx, g) {
    var w = HV.staat.w, d = drone(w, g.drone);
    if (!d || d.stand !== 'geland') return;
    HV.staat.wijzig(function () { d.stand = 'dock'; d.x = null; d.y = null; d.afstand = 0; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: [d.naam[0] + ': поставлено в док руками', d.naam[1] + ': met de hand in het dock gezet'], soort: 'huis.voertuig', doel: d.id });
    HV.meld({ maker: HV.mens(), icoon: 'drn-dock', titel: HV.p(d.naam) + ': ' + t('у доку', 'in het dock'), tekst: t('Док заряджатиме батарею.', 'Het dock laadt de accu.') });
  });
  HV.actie('drn-verklaring', function (ctx, g) { var z = zorg(HV.staat.w); z.verklaring[g.drone] = !z.verklaring[g.drone]; HV.teken(); });
  HV.actie('drn-kies-missie', function (ctx, g) {
    var w = HV.staat.w, z = zorg(w);
    if (z.gekozen[g.drone] === g.waarde) return;
    HV.staat.wijzig(function () { z.gekozen[g.drone] = g.waarde; });
  });
  HV.actie('drn-bereid', function (ctx, g) {
    var z = zorg(HV.staat.w);
    HV.staat.wijzig(function () { z.gekozen[g.drone] = g.missie; });
    HV.bladOpen('opstijgen:' + g.drone);
  });
  HV.actie('drn-missie-open', function (ctx, g) { HV.ui.zet('drn-missie', g.missie); HV.ui.zet('drn-punt', 0); if ((ctx.route.object || '') !== 'missies') HV.open('garage-drones-missies'); });
  HV.actie('drn-wind', function (ctx, g) {
    var w = HV.staat.w, z = zorg(w), ja = g.ja === '1';
    var reden = WINDREDENEN.filter(function (r) { return r[0] === HV.ui.lees('drn-windreden', null); })[0];
    if (ja && !reden) return;
    if (ja) z.windReden[g.drone] = reden[1];
    HV.doe({ doel: g.drone, mogelijkheid: 'bron', waarde: ja ? 'd-wind-ja' : 'd-wind-nee', waarom: ja ? reden[1] : ['пілот скасував обхід', 'de piloot trok de uitzondering in'] });
  });
  HV.actie('drn-opstijgen', function (ctx, g) {
    var w = HV.staat.w, z = zorg(w), m = missie(w, z.gekozen[g.drone]);
    HV.doe({ doel: g.drone, mogelijkheid: 'modus', waarde: 'd-opstijgen', waarom: ['місія «' + m.naam[0] + '»; заява пілота: бачу дрон', 'missie ‘' + m.naam[1] + '’; verklaring piloot: ik zie de drone'] }).then(function (r) {
      if (r && r.ok) { HV.ui.zet('drn-kies', g.drone); HV.bladOpen(null); HV.open('garage-drones-vlucht'); }
    });
  });
  // агент: пропонує місію пілотові; злітає сам лише за дозволом «Завжди» для зльоту
  HV.actie('drn-agent', function (ctx, g) {
    var w = HV.staat.w, z = zorg(w);
    var wie = HV.gevaar.uitvoerder(g.agent || 'claude');
    var door = { soort: 'agent', id: wie.id, naam: wie.naam };
    var id = g.drone || 'ooievaar', d = drone(w, id), m = missie(w, g.missie || 'dak');
    var waarom = ['після нічного вітру варто оглянути «' + m.naam[0].toLowerCase() + '»', 'na de wind van vannacht is ‘' + m.naam[1].toLowerCase() + '’ verstandig'];
    if (inLucht(d)) { HV.meld({ maker: door, icoon: 'agent', titel: HV.p(wie.naam), tekst: t('Дрон уже в повітрі — пропозицію відкладено.', 'De drone is al in de lucht — het voorstel wacht.') }); return; }
    var sStart = HV.gevaar.stand(wie.id, 'drone.opstijgen');
    if (sStart === 'altijd' || sStart === 'vragen') {
      // агент сам перевіряє те, що не обходиться: заряд і межі
      if (d.lading < nodig(m, id) || w.apparaten[id].beschikbaar !== 'ok') {
        HV.logboek.voegToe({ maker: door, wat: ['Не виконано: зліт ' + KORT[id][0], 'Niet uitgevoerd: opstijgen ' + KORT[id][1]], waarom: ['заряд ' + Math.round(d.lading) + ' % із ' + nodig(m, id) + ' % потрібних', 'accu ' + Math.round(d.lading) + ' % van de ' + nodig(m, id) + ' % nodig'], soort: 'huis.agent', gewicht: 'belangrijk' });
        HV.meld({ maker: door, gewicht: 'belangrijk', icoon: 'battery-low', titel: t('Агент не злетів', 'De agent steeg niet op'), tekst: t('Заряду замало для «', 'Te weinig lading voor ‘') + HV.p(m.naam) + t('».', '’.') });
        HV.staat.wijzig();
        return;
      }
      HV.staat.wijzig(function () { z.gekozen[id] = m.id; z.voorstelVoor[id] = null; });
      HV.doe({ doel: id, mogelijkheid: 'modus', waarde: 'd-opstijgen', door: door, waarom: waarom });
      return;
    }
    HV.staat.wijzig(function () { z.gekozen[id] = m.id; });
    HV.doe({ doel: id, mogelijkheid: 'effect', waarde: 'd-voorstel-' + m.id, door: door, waarom: waarom });
  });
  HV.actie('drn-voorstel-open', function (ctx, g) {
    var w = HV.staat.w, z = zorg(w);
    var n = w.nu.filter(function (x) { return x.id === 'drn-voorstel-' + g.drone; })[0];
    HV.staat.wijzig(function () { z.gekozen[g.drone] = g.missie; z.voorstelVoor[g.drone] = n && n.wie ? n.wie : ['агент', 'agent']; });
    HV.open('garage-drones-' + g.drone);
    setTimeout(function () { HV.bladOpen('opstijgen:' + g.drone); }, 0);
  });
  HV.actie('drn-voorstel-nee', function (ctx, g) {
    var w = HV.staat.w;
    var n = w.nu.filter(function (x) { return x.id === 'drn-voorstel-' + g.drone; })[0];
    HV.staat.wijzig(function (x) { x.nu = x.nu.filter(function (y) { return y.id !== 'drn-voorstel-' + g.drone; }); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Відхилено пропозицію місії', 'Missievoorstel afgewezen'], waarom: n && n.wie ? n.wie : null, soort: 'huis.agent' });
    HV.meld({ maker: HV.mens(), titel: t('Пропозицію відхилено', 'Voorstel afgewezen'), tekst: n ? HV.p(n.tekst) : '' });
  });
  HV.actie('drn-vondst', function (ctx, g) {
    HV.staat.wijzig(function (x) { x.nu = x.nu.filter(function (y) { return y.id !== 'drn-vondst-' + g.vlucht; }); });
    HV.ui.zet('drn-vlucht', g.vlucht); HV.open('garage-drones-vluchten');
  });
  HV.actie('drn-vlucht-open', function (ctx, g) { HV.ui.zet('drn-vlucht', g.vlucht); if ((ctx.route.object || '') !== 'vluchten') HV.open('garage-drones-vluchten'); });
  HV.actie('drn-afspeel', function (ctx, g) {
    var w = HV.staat.w, r = zorg(w).vluchten.filter(function (x) { return x.id === g.vlucht; })[0];
    if (!r) return;
    var q = r.pad[Math.max(0, Math.min(r.pad.length - 1, Math.round(Number(g.waarde))))];
    if (g.fase === 'klaar') { HV.ui.zet('drn-afspeel-' + r.id, Math.round(Number(g.waarde))); return; }
    // під час руху — лише маркер і підпис, без перерисовки
    var merk = document.querySelector('[data-k="drn-afspeelmerk"]'), tekst = document.querySelector('[data-k="drn-afspeeltekst"]');
    if (merk && q) merk.style.transform = 'translate(' + q.x + 'px, ' + q.y + 'px)';
    if (tekst && q) tekst.textContent = HV.duur(q.t / 60) + ' · ' + HV.getal(q.h, 0) + t(' м · ', ' m · ') + q.l + ' %';
  });
  HV.actie('drn-csv', function (ctx, g) {
    var w = HV.staat.w, z = zorg(w);
    var lijst = g.vlucht ? z.vluchten.filter(function (r) { return r.id === g.vlucht; }) : z.vluchten;
    var regels = [['vlucht', 'drone', 'missie', 'start', 'duur_s', 'max_hoogte_m', 'accu_van', 'accu_tot', 'wind_ms', 'uitzondering', 'gebeurtenissen'].join(';')];
    lijst.forEach(function (r) { regels.push([r.id, r.drone, r.missie, new Date(r.start).toISOString().slice(0, 16), r.duurS, r.maxH, r.van, r.tot == null ? '' : r.tot, r.wind, r.omweg ? r.omweg[1] : '', r.gebeurtenissen.map(function (x) { return x.wat[1]; }).join(' | ')].join(';')); });
    if (g.vlucht && lijst[0]) { regels.push(''); regels.push('t_s;x_m;y_m;hoogte_m;accu'); lijst[0].pad.forEach(function (q) { regels.push([q.t, q.x, q.y, q.h, q.l].join(';')); }); }
    try {
      var blob = new Blob([regels.join('\n')], { type: 'text/csv' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'vluchten' + (g.vlucht ? '-' + g.vlucht : '') + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) { /* без завантаження — лише запис */ }
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Експорт польотів у CSV', 'Vluchten geëxporteerd als CSV'], waarom: [lijst.length + ' ' + HV.meervoud(lijst.length, ['запис', 'записи', 'записів'], ['record', 'records']), lijst.length + ' ' + (lijst.length === 1 ? 'record' : 'records')], soort: 'huis.voertuig' });
    HV.meld({ maker: HV.mens(), icoon: 'file-down', titel: t('CSV готовий', 'CSV klaar'), tekst: t('Записів: ', 'Records: ') + lijst.length });
    HV.staat.wijzig();
  });
  // правки маршруту: зміна налаштувань — запис у Журналі
  function missieWijzig(g, fn, wat) {
    var w = HV.staat.w, m = missie(w, g.missie);
    if (!m) return;
    var v = vliegend(w);
    if (v && v.missie === m.id) { HV.actie && HV.acties['drn-uitleg'](HV.ctx(), { reden: 'bezig' }); return; }
    var was = null, werd = null;
    HV.staat.wijzig(function () { var r = fn(m); was = r && r[0]; werd = r && r[1]; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Місія «' + m.naam[0] + '»: ' + wat[0], 'Missie ‘' + m.naam[1] + '’: ' + wat[1]], was: was, werd: werd, soort: 'huis.voertuig' });
  }
  HV.actie('drn-punt-hoogte', function (ctx, g) {
    var i = Number(g.punt), stap = Number(g.richting) * (Number(g.stap) || 5);
    missieWijzig(g, function (m) { var p = m.punten[i], oud = p[2]; p[2] = Math.max(5, Math.min(120, p[2] + stap)); return [[oud + ' м', oud + ' m'], [p[2] + ' м', p[2] + ' m']]; }, ['висота точки ' + (i + 1), 'hoogte van punt ' + (i + 1)]);
  });
  HV.actie('drn-punt-zet', function (ctx, g) {
    var i = Number(g.punt);
    missieWijzig(g, function (m) { var p = m.punten[i], oud = p[0] + ' · ' + p[1]; p[0] = Math.max(-6, Math.min(70, p[0] + Number(g.dx))); p[1] = Math.max(-6, Math.min(52, p[1] + Number(g.dy))); return [[oud + ' м', oud + ' m'], [p[0] + ' · ' + p[1] + ' м', p[0] + ' · ' + p[1] + ' m']]; }, ['точку ' + (i + 1) + ' посунуто', 'punt ' + (i + 1) + ' verschoven']);
  });
  HV.actie('drn-punt-plus', function (ctx, g) {
    var i = Number(g.punt);
    missieWijzig(g, function (m) { var a = m.punten[i], b = m.punten[i + 1] || [DOCK.x, DOCK.y, a[2]]; m.punten.splice(i + 1, 0, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), a[2]]); return [[m.punten.length - 1 + ' точок', m.punten.length - 1 + ' punten'], [m.punten.length + ' точок', m.punten.length + ' punten']]; }, ['додано точку ' + (i + 2), 'punt ' + (i + 2) + ' toegevoegd']);
    HV.ui.zet('drn-punt', i + 1);
  });
  HV.actie('drn-punt-weg', function (ctx, g) {
    var i = Number(g.punt);
    missieWijzig(g, function (m) { m.punten.splice(i, 1); return [[m.punten.length + 1 + ' точок', m.punten.length + 1 + ' punten'], [m.punten.length + ' точок', m.punten.length + ' punten']]; }, ['видалено точку ' + (i + 1), 'punt ' + (i + 1) + ' verwijderd']);
    HV.ui.zet('drn-punt', Math.max(0, i - 1));
  });
  HV.actie('drn-missie-herstel', function (ctx, g) {
    var bron = MISSIES.filter(function (x) { return x.id === g.missie; })[0];
    missieWijzig(g, function (m) { m.punten = kopie(bron.punten); return null; }, ['маршрут скинуто до типового', 'route teruggezet naar standaard']);
    HV.ui.zet('drn-punt', 0);
  });
  HV.actie('drn-inst', function (ctx, g) {
    if (g.fase !== 'klaar') return;
    var w = HV.staat.w, z = zorg(w), oud = z.inst[g.sleutel], nieuw = Math.round(Number(g.waarde));
    if (oud === nieuw) return;
    if (HV.rol() !== 'eigenaar') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не змінено', 'Niet gewijzigd'), tekst: t('Межі польоту змінює лише власник.', 'Alleen de eigenaar wijzigt de vlieggrenzen.') }); HV.teken(); return; }
    HV.staat.wijzig(function () { z.inst[g.sleutel] = nieuw; });
    var naam = { plafond: ['стеля', 'plafond'], straal: ['радіус від дока', 'straal vanaf het dock'], terugHoogte: ['висота повернення', 'hoogte bij terugkeer'] }[g.sleutel];
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Межі польоту: ' + naam[0], 'Vlieggrenzen: ' + naam[1]], was: [oud + ' м', oud + ' m'], werd: [nieuw + ' м', nieuw + ' m'], soort: 'huis.voertuig' });
    HV.meld({ maker: HV.mens(), icoon: 'locate-fixed', titel: t('Межі польоту: ', 'Vlieggrenzen: ') + HV.p(naam), tekst: oud + ' → ' + nieuw + t(' м', ' m'), terug: function () { HV.staat.wijzig(function () { z.inst[g.sleutel] = oud; }); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: межі польоту', 'Ongedaan gemaakt: vlieggrenzen'], soort: 'huis.voertuig' }); } });
  });
  HV.actie('drn-opname', function () {
    var w = HV.staat.w, z = zorg(w), oud = z.inst.opname;
    if (HV.rol() !== 'eigenaar') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не змінено', 'Niet gewijzigd'), tekst: t('Запис відео вмикає лише власник.', 'Alleen de eigenaar zet video-opname aan.') }); return; }
    HV.staat.wijzig(function () { z.inst.opname = !oud; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Запис відео дрона', 'Video-opname van de drone'], was: oud ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: oud ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'], soort: 'huis.voertuig', gewicht: oud ? 'info' : 'belangrijk' });
    HV.meld({ maker: HV.mens(), icoon: oud ? 'video-off' : 'video', titel: oud ? t('Запис відео вимкнено', 'Video-opname uit') : t('Запис відео ввімкнено', 'Video-opname aan'), tekst: t('Зберігання 7 днів; сусіди під маскою.', '7 dagen bewaard; buren afgeschermd.'), terug: function () { HV.staat.wijzig(function () { z.inst.opname = oud; }); } });
  });
  // симулятор: втрата сигналу й порив вітру
  HV.actie('drn-sim-signaal', function (ctx, g) {
    var w = HV.staat.w, d = drone(w, g.drone);
    if (!inLucht(d)) return;
    if (d.link === false) { HV.staat.wijzig(function (x) { herstel(x, d); }); return; }
    HV.staat.wijzig(function (x) {
      kwijt(x, d, 0);
      x.nu = x.nu.filter(function (n) { return n.id !== 'drn-kwijt-' + d.id; });
      x.nu.push({ id: 'drn-kwijt-' + d.id, soort: 'alarm', maker: 'simulator', icoon: 'wifi-off', sinds: x.tijd, tekst: [d.naam[0] + ': сигнал зник, повертається додому сам', d.naam[1] + ': signaal weggevallen, keert zelf terug naar huis'], acties: [{ naam: 'drn-kabine', hoofd: true, label: ['Відкрити кабіну', 'Cockpit openen'], gegevens: { drone: d.id } }] });
    });
    HV.logboek.voegToe({ maker: SIM, wat: [d.naam[0] + ': втрата сигналу', d.naam[1] + ': signaal kwijt'], waarom: ['перешкода в симуляторі', 'storing in de simulator'], soort: 'huis.voertuig', gewicht: 'belangrijk', doel: d.id });
    HV.meld({ gewicht: 'alarm', icoon: 'wifi-off', maker: SIM, titel: HV.p(d.naam) + ': ' + t('втрата сигналу', 'signaal kwijt'), tekst: t('Команди не доходять. Дрон повертається додому сам на ', 'Commando’s komen niet aan. De drone keert zelf terug op ') + zorg(w).inst.terugHoogte + t(' м.', ' m.') });
  });
  HV.actie('drn-sim-wind', function () {
    var w = HV.staat.w, z = zorg(w);
    HV.staat.wijzig(function () { z.windExtra = z.windExtra ? 0 : 5; });
    HV.logboek.voegToe({ maker: SIM, wat: z.windExtra ? ['Порив вітру +5 м/с', 'Windvlaag +5 m/s'] : ['Вітер стих', 'Wind gaat liggen'], soort: 'huis.simulatie' });
    HV.meld({ maker: SIM, icoon: 'wind', titel: z.windExtra ? t('Симулятор: порив вітру', 'Simulator: windvlaag') : t('Симулятор: вітер стих', 'Simulator: wind gaat liggen'), tekst: t('Вітер ', 'Wind ') + HV.getal(wind(w).v, 1) + t(' м/с, пориви ', ' m/s, vlagen ') + HV.getal(wind(w).vlaag, 1) });
  });

  // для інших авторів і перевірок: довідник зони без доступу до внутрішнього стану
  HV.drones = { missies: MISSIES, spec: SPEC, inLucht: inLucht, zorg: zorg };
})(window.HV = window.HV || {});
