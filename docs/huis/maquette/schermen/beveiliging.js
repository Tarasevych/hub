// Beveiliging / Безпека — розділ повністю: Стан · Камери · Доступ · Датчики; приховані сторінки «Камера», «Перевірка»,
// «Відвідувачі». Аркуші пристроїв: замок, охорона, камера, дзвінок, дим, чадний газ, протікання, відкриття й рух.
// Вільні аркуші: «Не готово» (постановка з обходом), зона охорони, виклик із дверей (hv-oproep), майстер коду гостя,
// доступ до камер «роль × камера».
//
// Засади зони (специфікація панелі, версія 2): межі хаба названо чесно — «не сертифікована система», «Хто що охороняє»;
// спокій без кольору, увага — --warn на одному елементі, --fout — лише тривога. Кожна команда пристрою — через HV.doe
// (ворота, ризик, ритуал, Журнал, «Повернути»); налаштування зони (коди, маски, доступ, зони) пишуться в Журнал так само,
// як у ядрі (див. favorieten-auto). Дозволи — «Вимкнено · Питати · Завжди» для кожного виконавця, без стель (§3.8 плану).
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var MIN = 60000, UUR = 3600000, DAG = 86400000;
  var UITLOOP_S = 60;

  // ───────────────────────── 1. Паспорт: чого бракує зоні ─────────────────────────
  // Доповнюємо паспорт під час завантаження (той самий масив, з якого HV.paspoort.bouw будує кожен новий світ):
  // внутрішня камера для «Приватності вдома», ще два датчики диму (покриття поверхів), задні двері; стан замка й датчиків.
  (function () {
    var P = HV.paspoort;
    if (!P || !P.apparaten) return;
    var ids = P.apparaten.map(function (a) { return a.id; });
    var S = 'Симулятор';
    [
      { id: 'camerawoon', soort: 'camera', kamer: 'woonkamer', naam: ['Камера у вітальні', 'Camera woonkamer'], mog: ['modus'], st: { beeld: 'woon', modus: 'cam-actief' }, binnen: true },
      { id: 'rookhal', soort: 'rook', kamer: 'hal', naam: ['Дим', 'Rook'], mog: ['stand'], st: { alarm: false, stand: 'melder-paraat' }, batterij: 93, geplaatst: 2023, getestGeleden: 33 },
      { id: 'rookzolder', soort: 'rook', kamer: 'zolder', naam: ['Дим', 'Rook'], mog: ['stand'], st: { alarm: false, stand: 'melder-paraat' }, batterij: 23, geplaatst: 2016, getestGeleden: 214, beschikbaar: 'verouderd', gezienGeleden: 26 * 3600 },
      { id: 'achterdeurcontact', soort: 'contact', kamer: 'keuken', naam: ['Задні двері', 'Achterdeur'], mog: ['modus'], st: { open: false, modus: 'zone-actief' }, deur: true, batterij: 71 }
    ].forEach(function (a) {
      if (ids.indexOf(a.id) >= 0) return;
      a.beschikbaar = a.beschikbaar || 'ok';
      a.bron = S;
      P.apparaten.push(a);
    });
    var EXTRA = {
      voordeurslot: { mog: ['modus'], st: { modus: 'autoslot-aan' }, batterij: 62 },
      alarm: { mog: ['modus'], st: { modus: 'alarm-rust' } },
      cameravoor: { mog: ['modus'], st: { modus: 'cam-actief' } },
      cameratuin: { mog: ['modus'], st: { modus: 'cam-actief' } },
      cameragarage: { mog: ['modus'], st: { modus: 'cam-actief' } },
      rookkeuken: { mog: ['stand'], st: { stand: 'melder-paraat' }, batterij: 88, geplaatst: 2019, getestGeleden: 41 },
      cobijkeuken: { mog: ['stand'], st: { stand: 'melder-paraat' }, batterij: 74, geplaatst: 2021, getestGeleden: 41 },
      lekbijkeuken: { mog: ['stand'], st: { stand: 'melder-paraat' }, batterij: 41, geplaatst: 2022, getestGeleden: 96 },
      raamslaap: { mog: ['modus'], st: { modus: 'zone-actief', kiep: false }, batterij: 77 },
      raamkinder: { mog: ['modus'], st: { modus: 'zone-actief', kiep: false }, batterij: 12 },
      voordeurcontact: { mog: ['modus'], st: { modus: 'zone-actief' }, batterij: 64 },
      beweginghal: { mog: ['modus'], st: { modus: 'zone-actief' }, batterij: 58 },
      garagedeur: { mog: ['modus'], st: { modus: 'zone-actief' } },
      poort: { mog: ['modus'], st: { modus: 'zone-actief' } }
    };
    P.apparaten.forEach(function (a) {
      var x = EXTRA[a.id];
      if (!x) return;
      x.mog.forEach(function (m) { if (a.mog.indexOf(m) < 0) a.mog.push(m); });
      for (var k in x.st) if (!(k in a.st)) a.st[k] = x.st[k];
      ['batterij', 'geplaatst', 'getestGeleden'].forEach(function (k) { if (x[k] != null && a[k] == null) a[k] = x[k]; });
    });
  })();

  // ───────────────────────── 2. Матриця дій: доповнення зони ─────────────────────────
  // Дії, яких немає в ядрі, — у спільний масив HV.gevaar.acties (той самий, що читає HV.gevaar.vind), перед загальними рядками.
  // Небезпечні й критичні — з текстами наслідку й ризику. Рівень визначає лише ритуал людини; дозволів не обмежує.
  (function () {
    var G = HV.gevaar;
    if (!G || !G.acties) return;
    var RISICO = function (uk, nl) { return [uk + ' Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', nl + ' Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.']; };
    var nieuw = [
      { sleutel: 'alarm.paniek', soorten: ['alarmsysteem'], mogelijkheid: 'modus', als: function (a, v) { return v === 'alarm-paniek'; }, niveau: 'gewoon', naam: ['Тривожна кнопка', 'Noodknop'] },
      { sleutel: 'alarm.sirenetest', soorten: ['alarmsysteem'], mogelijkheid: 'modus', als: function (a, v) { return v === 'alarm-sirenetest'; }, niveau: 'gevaarlijk',
        naam: ['Перевірити сирену', 'Sirene testen'],
        gevolg: ['Що станеться: сирена звучатиме 3 с на повну гучність у домі й надворі. Пов’язано з: сусіди почують сигнал; сповіщення про тривогу не надсилаються. Як повернути: сирена вимкнеться сама через 3 с.', 'Wat er gebeurt: de sirene klinkt 3 s op vol volume, binnen en buiten. Hangt samen met: de buren horen het; er gaan geen alarmmeldingen uit. Terugdraaien: de sirene stopt na 3 s vanzelf.'],
        risico: RISICO('Що може статися: сирена зазвучить уночі чи коли вдома спить дитина.', 'Wat er kan gebeuren: de sirene gaat ’s nachts af of terwijl er een kind slaapt.') },
      { sleutel: 'alarm.sirene', soorten: ['alarmsysteem'], mogelijkheid: 'modus', niveau: 'gewoon', naam: ['Вимкнути сирену', 'Sirene uitzetten'] },
      { sleutel: 'slot.gastcode', soorten: ['slot'], mogelijkheid: 'gastcode', niveau: 'kritiek',
        naam: ['Створити код гостя', 'Gastcode aanmaken'],
        gevolg: ['Що станеться: людина з цим кодом зможе відімкнути вхідні двері в заданий строк. Пов’язано з: кожне відмикання кодом — запис у Журналі; охорону код не знімає. Як повернути: «Відкликати» — один дотик, код перестане діяти одразу.', 'Wat er gebeurt: wie deze code heeft, kan de voordeur in de gekozen periode ontgrendelen. Hangt samen met: elk ontgrendelen met de code komt in het logboek; het alarm gaat er niet van uit. Terugdraaien: ‘Intrekken’ — één tik, de code werkt meteen niet meer.'],
        risico: RISICO('Що може статися: код отримає людина, якій ви не довіряєте, і відімкне двері без вас.', 'Wat er kan gebeuren: iemand die je niet vertrouwt krijgt een code en ontgrendelt de deur zonder jou.') },
      { sleutel: 'camera.meekijken', soorten: ['camera'], mogelijkheid: 'modus', als: function (a, v) { return v === 'cam-meekijken'; }, niveau: 'gevoelig', naam: ['Тимчасово переглянути внутрішню камеру', 'Binnencamera tijdelijk bekijken'] },
      { sleutel: 'camera.prive', soorten: ['camera'], mogelijkheid: 'modus', als: function (a, v) { return v === 'cam-prive'; }, niveau: 'gevoelig', naam: ['Вимкнути камеру', 'Camera uitzetten'] },
      { sleutel: 'camera.aan', soorten: ['camera'], mogelijkheid: 'modus', niveau: 'gewoon', naam: ['Увімкнути камеру', 'Camera aanzetten'] },
      { sleutel: 'melder.test', soorten: ['rook', 'co', 'lek'], mogelijkheid: 'stand', niveau: 'gewoon', naam: ['Перевірити датчик', 'Melder testen'] },
      { sleutel: 'zone.overbruggen', soorten: ['contact', 'beweging', 'garagedeur', 'poort'], mogelijkheid: 'modus', als: function (a, v) { return v === 'zone-overbrugd'; }, niveau: 'gevoelig', naam: ['Обійти датчик в охороні', 'Melder overbruggen'] },
      { sleutel: 'zone.herstellen', soorten: ['contact', 'beweging', 'garagedeur', 'poort'], mogelijkheid: 'modus', niveau: 'gewoon', naam: ['Повернути датчик під охорону', 'Melder weer bewaken'] },
      { sleutel: 'slot.autoslot', soorten: ['slot'], mogelijkheid: 'modus', niveau: 'gevoelig', naam: ['Автозамикання', 'Automatisch vergrendelen'] }
    ];
    var sleutels = G.acties.map(function (x) { return x.sleutel; });
    var plek = sleutels.indexOf('huis.stand');
    if (plek < 0) plek = G.acties.length;
    nieuw.filter(function (x) { return sleutels.indexOf(x.sleutel) < 0; }).forEach(function (x, i) { G.acties.splice(plek + i, 0, x); });
    // назви значень для Журналу й сповіщень (спільний словник; наявні ключі не змінюються)
    var WN = HV.waardeNaam || {};
    var NAMEN = {
      'cam-actief': ['камеру ввімкнено', 'camera aan'], 'cam-prive': ['камеру вимкнено', 'camera uit'], 'cam-meekijken': ['тимчасовий перегляд на 30 хв', 'tijdelijk meekijken, 30 min'],
      'melder-test': ['перевірку запущено', 'test gestart'], 'melder-paraat': ['напоготові', 'paraat'],
      'autoslot-aan': ['автозамикання ввімкнено', 'automatisch vergrendelen aan'], 'autoslot-uit': ['автозамикання вимкнено', 'automatisch vergrendelen uit'],
      'alarm-paniek': ['тривожну кнопку натиснуто', 'noodknop ingedrukt'], 'alarm-sirenetest': ['сирена звучить 3 с — перевірка', 'sirene klinkt 3 s — test'], 'alarm-rust': ['сирену вимкнено', 'sirene uit'],
      'zone-overbrugd': ['обійдено в охороні', 'overbrugd'], 'zone-actief': ['під охороною', 'bewaakt']
    };
    for (var k in NAMEN) if (!(k in WN)) WN[k] = NAMEN[k];
  })();

  // ───────────────────────── 3. Зони охорони ─────────────────────────
  var STANDEN = ['uit', 'schil', 'nacht', 'volledig'];
  var STAND = {
    uit: { icoon: 'shield-off', woord: ['Знято', 'Uit'], kort: ['нічого не стежить', 'niets wordt bewaakt'],
      gevolg: ['Що станеться: двері, вікна й рух не піднімають тривоги; дим, чадний газ і вода стежать цілодобово. Пов’язано з: зняття — критична дія: рейка й підтвердження входу. Як повернути: оберіть інший режим — один дотик.', 'Wat er gebeurt: deuren, ramen en beweging slaan geen alarm; rook, koolmonoxide en water worden altijd bewaakt. Hangt samen met: uitzetten is kritiek: rail en bevestiging van aanmelding. Terugdraaien: kies een andere stand — één tik.'] },
    schil: { icoon: 'shield-half', woord: ['Периметр', 'Schil'], kort: ['двері й вікна', 'deuren en ramen'],
      gevolg: ['Що станеться: відкриття дверей, вікон і воріт підніме тривогу; рух усередині — ні, тож удома можна ходити. Пов’язано з: вікно на провітрюванні можна лише обійти. Як повернути: «Знято» — з підтвердженням.', 'Wat er gebeurt: deuren, ramen en poorten die opengaan geven alarm; beweging binnen niet, dus je kunt vrij rondlopen. Hangt samen met: een raam op de kiepstand kun je alleen overbruggen. Terugdraaien: ‘Uit’ — met bevestiging.'] },
    nacht: { icoon: 'bed-double', woord: ['Нічна', 'Nachtstand'], kort: ['периметр і рух унизу', 'schil en beweging beneden'],
      gevolg: ['Що станеться: периметр і рух на першому поверсі; спальні нагорі вільні. Пов’язано з: вхідні двері дають 30 с на код. Як повернути: «Знято» — з підтвердженням.', 'Wat er gebeurt: de schil en beweging op de begane grond; de slaapkamers boven blijven vrij. Hangt samen met: de voordeur geeft 30 s voor de code. Terugdraaien: ‘Uit’ — met bevestiging.'] },
    volledig: { icoon: 'shield-check', woord: ['Повна', 'Volledig'], kort: ['усе, зокрема рух', 'alles, ook beweging'],
      gevolg: ['Що станеться: периметр і рух у всьому домі; вікно на провітрюванні не допускається. Пов’язано з: відлік виходу 60 с, входу — 30 с. Як повернути: «Знято» — з підтвердженням.', 'Wat er gebeurt: de schil en beweging in het hele huis; een raam op de kiepstand mag niet. Hangt samen met: 60 s om te vertrekken, 30 s bij binnenkomst. Terugdraaien: ‘Uit’ — met bevestiging.'] }
  };
  var ZONES = [
    { id: 'schil', icoon: 'fence', naam: ['Периметр', 'Schil'], wat: ['Двері, вікна й ворота', 'Deuren, ramen en poorten'], soorten: ['contact', 'garagedeur', 'poort'] },
    { id: 'binnen', icoon: 'radar', naam: ['Усередині', 'Binnen'], wat: ['Рух і присутність', 'Beweging en aanwezigheid'], soorten: ['beweging', 'aanwezigheid'] },
    { id: 'altijd', icoon: 'alarm-smoke', naam: ['Цілодобові', 'Altijd bewaakt'], wat: ['Дим, чадний газ і вода', 'Rook, koolmonoxide en water'], soorten: ['rook', 'co', 'lek'] }
  ];
  var zoneVan = function (a) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i].soorten.indexOf(a.soort) >= 0) return ZONES[i]; return null; };
  var leden = function (zone) { return HV.kijk.alle(function (a) { return zone.soorten.indexOf(a.soort) >= 0; }); };
  var beneden = function (a) { var k = HV.staat.kamer(a.kamer); return !!k && k.verdieping === 'beneden'; };
  /** Чи стежить охорона за датчиком у режимі stand. */
  function bewaakt(a, stand) {
    var z = zoneVan(a);
    if (!z) return false;
    if (z.id === 'altijd') return true;
    if (stand === 'uit') return false;
    if (z.id === 'schil') return true;
    return stand === 'volledig' || (stand === 'nacht' && beneden(a));
  }
  var isOpen = function (a) { return a.soort === 'contact' ? !!a.st.open || !!a.st.kiep : a.soort === 'garagedeur' || a.soort === 'poort' ? !!a.st.open : a.soort === 'beweging' || a.soort === 'aanwezigheid' ? !!a.st.actief : false; };
  var overbrugd = function (a) { return a.st.modus === 'zone-overbrugd'; };
  /** Що заважає поставити режим stand: [{ apparaat, kan:'overbruggen'|'sluiten'|'dicht' }] */
  function nietGereed(stand) {
    if (stand === 'uit') return [];
    return HV.kijk.alle(function (a) { var z = zoneVan(a); return z && z.id !== 'altijd' && bewaakt(a, stand) && isOpen(a) && !overbrugd(a) && HV.kijk.isVers(a); }).map(function (a) {
      if (a.soort === 'garagedeur' || a.soort === 'poort') return { apparaat: a, kan: 'sluiten' };
      if (a.soort === 'beweging' || a.soort === 'aanwezigheid') return { apparaat: a, kan: stand === 'volledig' ? 'overbruggen' : 'overbruggen' };
      if (stand === 'volledig') return { apparaat: a, kan: 'dicht' };
      return { apparaat: a, kan: 'overbruggen' };
    });
  }

  // ───────────────────────── 4. Стан зони у світі ─────────────────────────
  var dagBegin = function (ms) { return ms - (((ms % DAG) + DAG) % DAG); };
  /** Останнє настання години доби u (0–24) не пізніше за tijd. */
  var laatste = function (tijd, u) { var x = dagBegin(tijd) + u * UUR; return x > tijd ? x - DAG : x; };
  var CAMERAS = ['cameravoor', 'cameratuin', 'cameragarage', 'camerawoon'];
  var GEBEURTENIS = {
    persoon: { icoon: 'user', naam: ['людина', 'persoon'] }, auto: { icoon: 'car', naam: ['авто', 'auto'] }, dier: { icoon: 'paw-print', naam: ['тварина', 'dier'] },
    pakket: { icoon: 'package', naam: ['пакунок', 'pakket'] }, bel: { icoon: 'bell-ring', naam: ['дзвінок', 'bel'] }
  };
  var SJABLONEN = [
    [2.78, 'cameratuin', 'dier', ['Тварина біля паркану', 'Dier bij het hek']],
    [7.87, 'cameravoor', 'persoon', ['Людина виходить із дому', 'Iemand verlaat het huis']],
    [8.22, 'cameravoor', 'persoon', ['Двоє дітей виходять до школи', 'Twee kinderen vertrekken naar school']],
    [10.68, 'cameratuin', 'dier', ['Кіт на газоні', 'Een kat op het gazon']],
    [12.6, 'cameravoor', 'pakket', ['Кур’єр залишив пакунок біля дверей', 'Bezorger zet een pakket bij de deur']],
    [12.61, 'cameravoor', 'bel', ['Дзвінок у двері', 'Er wordt aangebeld']],
    [15.5, 'cameravoor', 'persoon', ['Людина підходить до дверей', 'Iemand loopt naar de deur']],
    [17.1, 'cameragarage', 'auto', ['Авто заїхало на під’їзд', 'Een auto rijdt de oprit op']],
    [18.4, 'cameratuin', 'persoon', ['Людина в саду', 'Iemand in de tuin']]
  ];
  var CODE_SOORT = {
    mens: { icoon: 'user', naam: ['Особистий код', 'Persoonlijke code'] }, gast: { icoon: 'user-plus', naam: ['Гість', 'Gast'] },
    monteur: { icoon: 'wrench', naam: ['Візит майстра', 'Bezoek monteur'] }, hulp: { icoon: 'hand-helping', naam: ['Обслуга', 'Hulp'] }
  };
  var ROLLEN = [['eigenaar', ['Власник', 'Eigenaar']], ['bewoner', ['Мешканець', 'Bewoner']], ['kind', ['Дитина', 'Kind']], ['gast', ['Гість', 'Gast']], ['agent', ['Агенти', 'Agenten']]];
  var TOEGANG = [['geen', ['немає', 'geen']], ['gebeurtenissen', ['події', 'meldingen']], ['beelden', ['знімки', 'beelden']], ['video', ['відео', 'video']]];

  /** Стан зони в поточному світі: створюється ліниво й детерміновано від часу дому (сценарій будує новий світ). */
  function zorg(w) {
    if (w.bev) return w.bev;
    var t0 = w.tijd;
    var gebeurtenissen = SJABLONEN.map(function (s, i) { return { id: 'g' + i, cam: s[1], soort: s[2], tekst: s[3], tijd: laatste(t0, s[0]) }; })
      .filter(function (g) { return t0 - g.tijd < DAG; }).sort(function (a, b) { return b.tijd - a.tijd; });
    var toegang = {};
    CAMERAS.forEach(function (c) {
      var binnen = c === 'camerawoon';
      toegang[c] = { eigenaar: 'video', bewoner: 'video', kind: binnen ? 'geen' : 'gebeurtenissen', gast: 'geen', agent: 'gebeurtenissen' };
    });
    w.bev = {
      priveThuis: true, meekijkenTot: null, uitloop: null, alarm: null, vorigeStand: w.apparaten.alarm ? w.apparaten.alarm.st.stand : 'uit',
      zones: { schil: { vertraging: 30, stil: false, sirene: 3, kruis: false }, binnen: { vertraging: 0, stil: false, sirene: 3, kruis: true }, altijd: { vertraging: 0, stil: false, sirene: 3, kruis: false } },
      gebeurtenissen: gebeurtenissen,
      gekeken: [
        { wie: ['Олена', 'Olena'], soort: 'mens', cam: 'cameravoor', tijd: laatste(t0, 12.62), duur: 2, via: ['телефон', 'telefoon'], reden: ['дзвінок у двері', 'er werd aangebeld'] },
        { wie: ['Агент Claude', 'Agent Claude'], soort: 'agent', cam: 'cameragarage', tijd: laatste(t0, 17.12), duur: 0, via: ['лише подія, без кадру', 'alleen de gebeurtenis, zonder beeld'], reden: ['перевірка зарядки авто', 'controle van het laden'] },
        { wie: ['Тарас', 'Taras'], soort: 'mens', cam: 'cameratuin', tijd: laatste(t0, 10.7), duur: 1, via: ['комп’ютер', 'computer'], reden: ['рух у саду', 'beweging in de tuin'] }
      ].sort(function (a, b) { return b.tijd - a.tijd; }),
      codes: [
        { id: 'c1', soort: 'mens', naam: ['Олена', 'Olena'], deuren: ['voordeur', 'poort'], van: null, tot: null, laatst: laatste(t0, 15.5) },
        { id: 'c2', soort: 'mens', naam: ['Тарас', 'Taras'], deuren: ['voordeur', 'poort', 'garagedeur'], van: null, tot: null, laatst: laatste(t0, 7.87) },
        { id: 'c3', soort: 'gast', naam: ['Ірина', 'Iryna'], deuren: ['voordeur'], van: t0 - 2 * DAG, tot: t0 + DAG + 3 * UUR, laatst: t0 - 30 * UUR, gezien: true },
        { id: 'c4', soort: 'hulp', naam: ['Прибирання по середах', 'Schoonmaak op woensdag'], deuren: ['voordeur'], van: t0 - 20 * DAG, tot: t0 + 24 * DAG, rooster: ['середа 09:00–13:00', 'woensdag 09:00–13:00'], laatst: t0 - 5 * DAG, gezien: true },
        { id: 'c5', soort: 'monteur', naam: ['Майстер котла', 'Monteur cv-ketel'], deuren: ['voordeur'], van: t0 - 4 * DAG, tot: t0 - 3 * DAG, laatst: t0 - 4 * DAG + 2 * UUR, gezien: true, ingetrokken: false }
      ],
      bezoekers: [
        { id: 'b1', tijd: laatste(t0, 12.61), wie: ['Кур’єр із пакунком', 'Bezorger met pakket'], uitkomst: ['відповіли: «Залиште біля дверей»', 'antwoord: ‘Zet het maar bij de deur’'], soort: 'pakket' },
        { id: 'b2', tijd: laatste(t0, 12.61) - DAG + 3.6 * UUR, wie: ['Невідома людина', 'Onbekende persoon'], uitkomst: ['пропущено — нікого не було вдома', 'gemist — er was niemand thuis'], soort: 'persoon' },
        { id: 'b3', tijd: laatste(t0, 12.61) - 2 * DAG - 1.2 * UUR, wie: ['Сусідка', 'Buurvrouw'], uitkomst: ['відповіли: «Зараз підійду»', 'antwoord: ‘Ik kom eraan’'], soort: 'persoon' }
      ],
      maskers: { cameravoor: [0, 6], cameratuin: [5, 11], cameragarage: [], camerawoon: [] },
      toegang: toegang,
      gast: null
    };
    return w.bev;
  }
  HV.beveiligingStaat = zorg;

  // ── Літопис: ведеться через спільні HV.logboek і HV.meld ──
  var MENS = function () { return HV.mens(); };
  var SYS = { soort: 'systeem', naam: ['Система безпеки', 'Beveiligingssysteem'] };
  function noteer(e) {
    var r = HV.logboek.voegToe({ maker: e.maker || MENS(), wat: e.wat, waarom: e.waarom, was: e.was, werd: e.werd, soort: e.soort || 'huis.alarm', gewicht: e.gewicht, doel: e.doel });
    if (!e.stil) HV.meld({ maker: e.maker || MENS(), icoon: e.icoon || 'shield', gewicht: e.gewicht === 'alarm' ? 'alarm' : e.gewicht === 'belangrijk' ? 'belangrijk' : 'info', titel: HV.p(e.wat), tekst: e.tekst ? HV.p(e.tekst) : (e.was && e.werd ? HV.p(e.was) + ' → ' + HV.p(e.werd) : ''), terug: e.terug || null, hoe: e.hoe || null });
    HV.staat.wijzig();
    return r;
  }
  /** Людина може виконати дію цього рівня? Якщо ні — відмова з причиною (як у HV.doe). */
  function magMens(actie) {
    var mag = HV.gevaar.rolMag(HV.rol(), actie);
    if (!mag.mag) HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(mag.reden), tekst: t('Попросіть власника або мешканця.', 'Vraag het de eigenaar of een bewoner.') });
    return mag.mag;
  }

  // ───────────────────────── 5. Життя зони (крок після кожної зміни світу) ─────────────────────────
  var tikker = null;
  function tik(aan) {
    if (aan && !tikker) tikker = setInterval(function () { HV.staat.wijzig(); }, 1000);
    if (!aan && tikker) { clearInterval(tikker); tikker = null; }
  }
  function leven(w) {
    if (!w || !w.apparaten || !w.apparaten.alarm || !w.apparaten.voordeurslot) return;
    var b = zorg(w), A = w.apparaten, nu = Date.now();
    var stand = A.alarm.st.stand;
    // відлік виходу
    if (b.uitloop && (stand !== b.uitloop.stand)) b.uitloop = null;
    if (b.uitloop && nu >= b.uitloop.tot) {
      var s = b.uitloop.stand; b.uitloop = null;
      HV.logboek.voegToe({ maker: SYS, wat: ['Охорона діє: «' + STAND[s].woord[0].toLowerCase() + '»', 'Alarm actief: ‘' + STAND[s].woord[1].toLowerCase() + '’'], waarom: ['відлік виходу ' + UITLOOP_S + ' с завершено', 'vertrektijd van ' + UITLOOP_S + ' s voorbij'], soort: 'huis.alarm' });
    }
    tik(!!b.uitloop || !!b.alarm || !!w.oproep);
    // зняття охорони скасовує обходи
    if (b.vorigeStand !== stand) {
      if (stand === 'uit') {
        var weg = HV.kijk.alle(overbrugd);
        weg.forEach(function (a) { a.st.modus = 'zone-actief'; });
        if (weg.length) HV.logboek.voegToe({ maker: SYS, wat: ['Обходи скасовано: ' + weg.length, 'Overbruggingen opgeheven: ' + weg.length], waarom: ['охорону знято', 'het alarm is uit'], soort: 'huis.alarm' });
      }
      b.vorigeStand = stand;
    }
    // замок сам замикається через 2 хв (функція самого замка, не автоматизація хаба)
    var slot = A.voordeurslot;
    if (!slot.st.vergrendeld && !slot.wacht && slot.st.modus === 'autoslot-aan' && slot.beschikbaar === 'ok') {
      var sinds = slot.maker && slot.maker.tijd != null ? slot.maker.tijd : w.tijd;
      if (b.slotOpenSinds == null || b.slotOpenSinds > w.tijd) b.slotOpenSinds = sinds;
      if (w.tijd - b.slotOpenSinds >= 2 * MIN) {
        slot.st.vergrendeld = true;
        slot.maker = { soort: 'systeem', naam: ['Замок сам', 'Het slot zelf'], tijd: w.tijd, echt: nu };
        b.slotOpenSinds = null;
        HV.logboek.voegToe({ maker: slot.maker, wat: ['Замок вхідних дверей: замкнено', 'Slot voordeur: vergrendeld'], waarom: ['автозамикання через 2 хв', 'automatisch vergrendeld na 2 min'], was: ['відімкнено', 'ontgrendeld'], werd: ['замкнено', 'vergrendeld'], soort: 'huis.toegang', doel: 'voordeurslot' });
      }
    } else b.slotOpenSinds = null;
    // перевірка датчика: після підтвердження — знову «напоготові», дата перевірки
    HV.kijk.alle(function (a) { return a.st.stand === 'melder-test' && !a.wacht; }).forEach(function (a) { a.st.stand = 'melder-paraat'; a.st.getest = w.tijd; });
    // тимчасовий перегляд внутрішньої камери: 30 хв часу дому (або доки його не завершили вручну)
    if (b.meekijkenTot && A.camerawoon && A.camerawoon.st.modus !== 'cam-meekijken' && !A.camerawoon.wacht) b.meekijkenTot = null;
    if (b.meekijkenTot && w.tijd >= b.meekijkenTot) {
      b.meekijkenTot = null;
      if (A.camerawoon && A.camerawoon.st.modus === 'cam-meekijken') A.camerawoon.st.modus = 'cam-actief';
      HV.logboek.voegToe({ maker: SYS, wat: ['Тимчасовий перегляд вітальні завершено', 'Tijdelijk meekijken in de woonkamer voorbij'], waarom: ['минуло 30 хв', '30 min voorbij'], soort: 'huis.alarm', doel: 'camerawoon' });
    }
    // сирена-перевірка звучить 3 с і замовкає
    if (A.alarm.st.modus === 'alarm-sirenetest' && !A.alarm.wacht) {
      if (!b.sireneTot) b.sireneTot = nu + 3000;
      else if (nu >= b.sireneTot) { A.alarm.st.modus = 'alarm-rust'; b.sireneTot = null; HV.logboek.voegToe({ maker: SYS, wat: ['Перевірку сирени завершено', 'Sirenetest voorbij'], soort: 'huis.alarm', doel: 'alarm' }); }
    }
  }
  if (HV.staat && HV.staat.abonneer) HV.staat.abonneer(leven);

  // ───────────────────────── 6. Дрібні будівельні блоки ─────────────────────────
  var app = function (id) { return HV.staat.w.apparaten[id] || null; };
  var kamerNaam = function (a) { var k = HV.staat.kamer(a.kamer); return k ? HV.p(k.naam) : ''; };
  var naamKamer = function (a) { return HV.p(a.naam) + ' · ' + kamerNaam(a); };
  var kaart = function (klas, inhoud, k) { return '<section class="hv-kaart hv-bev-kaart' + (klas ? ' ' + klas : '') + '"' + (k ? ' data-k="' + h(k) + '"' : '') + '>' + inhoud + '</section>'; };
  var kop = function (icoon, titel, extra, teller) {
    return '<header class="hv-bev-kop"><h3>' + HV.icoon(icoon, { maat: 's' }) + '<span>' + h(titel) + '</span>' + (teller != null ? '<span class="hv-bev-kop__teller">' + h(teller) + '</span>' : '') + '</h3>' + (extra ? '<span class="hv-bev-kop__rechts">' + extra + '</span>' : '') + '</header>';
  };
  var naar = function (tekst, adres, aria) { return o.knop({ tekst: tekst, soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: adres }, aria: aria }); };
  var bladKnop = function (tekst, blad, icoon, soort) { return o.knop({ tekst: tekst, icoon: icoon, soort: soort || 'gewoon', klein: true, actie: 'blad', gegevens: { blad: blad } }); };
  var veld = function (label, html, extra) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };
  var nb = function (delen) { return delen.filter(Boolean).join('<span class="hv-punt" aria-hidden="true"> · </span>'); };
  /** Скільки мовчить пристрій: до 48 год — у годинах (26 год), інакше — звичайний вік. */
  var stilte = function (a) { var ms = HV.kijk.leeftijd(a); return ms >= UUR && ms < 48 * UUR ? Math.round(ms / UUR) + ' ' + HV.t('год', 'u') : HV.oud(ms); };
  var dagen = function (ms) { return Math.max(0, Math.round(ms / DAG)); };
  var wanneer = function (ms) {
    var w = HV.staat.w, d = Math.round((dagBegin(w.tijd) - dagBegin(ms)) / DAG);
    if (d === 0) return HV.tijd(ms);
    if (d === 1) return t('учора ', 'gisteren ') + HV.tijd(ms);
    if (d === -1) return t('завтра ', 'morgen ') + HV.tijd(ms);
    return HV.datumKort(ms) + ' ' + HV.tijd(ms);
  };

  /** Батарея: іконка, смужка й число; нижче порогу 15 % — тон «увага» лише на цьому елементі. */
  function batterij(pct, opties) {
    if (pct == null) return '<span class="hv-bev-bat is-net">' + HV.icoon('plug', { maat: 's' }) + '<span>' + h(t('від мережі', 'netstroom')) + '</span></span>';
    var laag = pct < 15;
    return '<span class="hv-bev-bat' + (laag ? ' is-laag' : '') + '" title="' + h(t('Батарея', 'Batterij')) + '">' + HV.icoon(pct < 20 ? 'battery-low' : pct < 60 ? 'battery-medium' : 'battery-full', { maat: 's' }) +
      '<span class="hv-bev-bat__balk" aria-hidden="true"><i style="width:' + Math.max(4, Math.min(100, pct)) + '%"></i></span><span class="hv-bev-bat__getal">' + HV.getal(pct) + ' %</span>' + (opties && opties.prognose ? '<span class="hv-bev-bat__prognose">≈ ' + h(opties.prognose) + '</span>' : '') + '</span>';
  }
  /** Стан датчика безпеки словом: { woord, toon:'let-op'|'alarm'|'oud'|null }. */
  function melderWoord(a) {
    if (a.beschikbaar === 'onbereikbaar') return { woord: HV.woord.onbereikbaar(), toon: 'oud' };
    var st = a.st;
    if (a.soort === 'rook' || a.soort === 'co' || a.soort === 'lek') {
      if (st.alarm) return { woord: t('тривога', 'alarm gaat af'), toon: 'alarm' };
      if (a.wacht || st.stand === 'melder-test') return { woord: t('перевіряється', 'wordt getest'), toon: null };
      if (a.beschikbaar === 'verouderd') return { woord: t('мовчить ', 'zwijgt al ') + stilte((a)), toon: 'let-op' };
      return { woord: a.soort === 'co' ? t('чадного газу немає', 'geen koolmonoxide') : a.soort === 'lek' ? t('сухо', 'droog') : t('спокійно', 'rustig'), toon: null };
    }
    if (a.soort === 'contact') {
      if (st.open) return { woord: HV.woord.open(), toon: 'let-op' };
      if (st.kiep) return { woord: t('на провітрюванні', 'op de kiepstand'), toon: 'let-op' };
      return { woord: HV.woord.dicht(), toon: null };
    }
    if (a.soort === 'beweging') return { woord: st.actief ? t('рух зараз', 'beweging nu') : t('рух ', 'beweging ') + HV.duur(st.laatst || 0) + t(' тому', ' geleden'), toon: null };
    if (a.soort === 'aanwezigheid') return { woord: st.actief ? t('хтось є', 'iemand aanwezig') : t('нікого', 'niemand'), toon: null };
    if (a.soort === 'garagedeur' || a.soort === 'poort') return { woord: st.open ? HV.woord.open() : HV.woord.dicht(), toon: st.open ? 'let-op' : null };
    return { woord: o.beeld(a).woord, toon: null };
  }
  var MELDER_ICOON = { rook: 'alarm-smoke', co: 'alarm-smoke', lek: 'droplet', contact: 'door-closed', beweging: 'radar', aanwezigheid: 'person-standing', garagedeur: 'warehouse', poort: 'fence' };
  var melderIcoon = function (a) { return a.soort === 'contact' ? (a.st.open || a.st.kiep ? 'door-open' : 'door-closed') : MELDER_ICOON[a.soort] || o.beeld(a).icoon; };
  var getest = function (a) { var w = HV.staat.w; return a.st.getest || (a.getestGeleden != null ? w.tijd - a.getestGeleden * DAG : null); };

  // ── Камери: кадр симулятора (власний SVG; ніякого справжнього відео) ──
  var SCENE = { cameravoor: 'voor', cameratuin: 'tuin', cameragarage: 'garage', camerawoon: 'woon' };
  var figuur = function (x, y, s) { return '<g class="hv-bev-s5" transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')"><circle cx="0" cy="-60" r="8"/><path d="M-12-50h24l5 28h-7l-3 22h-7l-1-18-1 18h-7l-3-22h-7z"/></g>'; };
  var kat = function (x, y) { return '<g class="hv-bev-s5" transform="translate(' + x + ' ' + y + ')"><ellipse cx="0" cy="-7" rx="14" ry="7"/><circle cx="14" cy="-14" r="6"/><path d="M10-19l2-6 3 5zM16-19l3-5 1 6z"/><path class="hv-bev-sl" d="M-14-8c-8-2-10-10-6-14"/></g>'; };
  /** Позначки виявлення для сцени: де стоїть фігура (рамка у відсотках 320×180). */
  var KADER = { voor: { persoon: [144, 82, 34, 72], pakket: [190, 124, 26, 22], bel: [144, 82, 34, 72] }, tuin: { persoon: [94, 82, 34, 72], dier: [196, 132, 40, 30] }, garage: { auto: [40, 98, 230, 66], persoon: [244, 84, 34, 72] }, woon: { persoon: [190, 72, 34, 72] } };
  function scene(soort, wat) {
    var s = '';
    if (soort === 'voor') {
      s = '<rect class="hv-bev-s1" width="320" height="124"/><path class="hv-bev-s2" d="M0 180 112 124h96l112 56z"/>' +
        '<path class="hv-bev-sl" d="M128 124 98 180M160 124v56M192 124l30 56M120 136h80M108 152h104"/>' +
        '<rect class="hv-bev-s2" x="34" y="34" width="62" height="44" rx="2"/><path class="hv-bev-sl" d="M65 34v44M34 56h62"/>' +
        '<rect class="hv-bev-s3" x="138" y="40" width="46" height="84" rx="2"/><path class="hv-bev-sl" d="M144 48h34v28h-34zM144 84h34v32h-34z"/><circle class="hv-bev-s4" cx="176" cy="88" r="2.5"/>' +
        '<rect class="hv-bev-s4" x="194" y="78" width="6" height="10" rx="1.5"/><circle class="hv-bev-s4 hv-bev-gloed" cx="206" cy="46" r="5"/>' +
        '<rect class="hv-bev-s3" x="226" y="34" width="62" height="44" rx="2"/><path class="hv-bev-sl" d="M257 34v44M226 56h62"/>' +
        '<ellipse class="hv-bev-s3" cx="50" cy="132" rx="46" ry="18"/><ellipse class="hv-bev-s3" cx="282" cy="136" rx="52" ry="20"/>';
      if (wat.persoon) s += figuur(160, 152, 1.04);
      if (wat.pakket) s += '<rect class="hv-bev-s4" x="192" y="128" width="22" height="16" rx="1.5"/><path class="hv-bev-sl" d="M192 134h22M203 128v16"/>';
    } else if (soort === 'tuin') {
      s = '<rect class="hv-bev-s1" width="320" height="92"/><rect class="hv-bev-s2" y="92" width="320" height="88"/>' +
        '<path class="hv-bev-sl" d="M0 74h320M0 86h320M12 64v30M40 64v30M68 64v30M96 64v30M124 64v30M152 64v30M180 64v30M208 64v30M236 64v30M264 64v30M292 64v30"/>' +
        '<rect class="hv-bev-s3" x="58" y="58" width="8" height="40"/><circle class="hv-bev-s3" cx="62" cy="46" r="30"/><rect class="hv-bev-s3" x="252" y="54" width="9" height="46"/><circle class="hv-bev-s3" cx="256" cy="40" r="36"/>' +
        '<rect class="hv-bev-s3" x="150" y="54" width="62" height="44" rx="2"/><path class="hv-bev-s4" d="M146 56l35-18 35 18z"/>' +
        '<path class="hv-bev-sl" d="M140 180c10-30 30-60 40-82"/><ellipse class="hv-bev-s3" cx="34" cy="150" rx="40" ry="12"/>';
      if (wat.persoon) s += figuur(110, 152, 1);
      if (wat.dier) s += kat(214, 160);
    } else if (soort === 'garage') {
      s = '<rect class="hv-bev-s1" width="320" height="110"/><path class="hv-bev-s2" d="M0 110h320v70H0z"/>' +
        '<rect class="hv-bev-s2" x="22" y="14" width="200" height="86" rx="2"/><path class="hv-bev-sl" d="M22 30h200M22 46h200M22 62h200M22 78h200"/>' +
        '<rect class="hv-bev-s3" x="240" y="30" width="58" height="70" rx="2"/><path class="hv-bev-sl" d="M248 44h42M248 58h42M248 72h42"/>' +
        '<circle class="hv-bev-s4" cx="300" cy="22" r="4"/>';
      if (wat.auto) s += '<path class="hv-bev-s4" d="M40 152 66 124q10-10 30-10h92q22 0 40 14l34 10q16 4 16 14v10H40z"/><path class="hv-bev-sl" d="M76 124h50v-8M134 116v8h56"/><circle class="hv-bev-s5" cx="88" cy="160" r="14"/><circle class="hv-bev-s5" cx="236" cy="160" r="14"/><circle class="hv-bev-s2" cx="88" cy="160" r="6"/><circle class="hv-bev-s2" cx="236" cy="160" r="6"/>';
      else s += '<path class="hv-bev-sl" d="M40 164h240"/>';
      s += '<g class="hv-bev-sl"><circle cx="280" cy="150" r="12"/><circle cx="306" cy="150" r="12"/><path d="M280 150l10-16 16 16M290 134h-6"/></g>';
      if (wat.persoon) s += figuur(260, 156, 1);
    } else {
      s = '<rect class="hv-bev-s1" width="320" height="120"/><rect class="hv-bev-s2" y="120" width="320" height="60"/>' +
        '<rect class="hv-bev-s4 hv-bev-gloed" x="22" y="22" width="80" height="62" rx="2"/><path class="hv-bev-sl" d="M62 22v62M22 53h80"/>' +
        '<rect class="hv-bev-s3" x="200" y="40" width="96" height="56" rx="3"/><rect class="hv-bev-s2" x="240" y="96" width="16" height="8"/>' +
        '<path class="hv-bev-s3" d="M60 150v-30q0-10 12-10h104q12 0 12 10v30z"/><path class="hv-bev-s4" d="M70 128h108v22H70z"/>' +
        '<path class="hv-bev-sl" d="M150 108V50M138 50h24l-6-14h-12z"/>';
      if (wat.persoon) s += figuur(206, 150, 1);
    }
    return s;
  }
  /** Чому кадру немає: [uk, nl] або null. */
  function camDicht(a) {
    var w = HV.staat.w, b = zorg(w);
    if (a.beschikbaar === 'onbereikbaar') return ['Камера недоступна', 'Camera niet bereikbaar'];
    if (a.st.modus === 'cam-prive') return ['Камеру вимкнено', 'De camera staat uit'];
    if (a.binnen && b.priveThuis && HV.kijk.thuis().length && a.st.modus !== 'cam-meekijken') return ['Вимкнено, бо хтось удома', 'Uit, want er is iemand thuis'];
    return null;
  }
  /** Що видно на кадрі зараз: події останніх 12 хв часу дому й виклик із дверей. */
  function camWat(cam) {
    var w = HV.staat.w, b = zorg(w), wat = {}, recent = null;
    b.gebeurtenissen.forEach(function (g) { if (g.cam === cam && w.tijd - g.tijd < 12 * MIN && w.tijd >= g.tijd) { wat[g.soort === 'bel' ? 'persoon' : g.soort] = true; if (!recent) recent = g; } });
    if (cam === 'cameravoor' && w.oproep) { wat.persoon = true; recent = recent || { soort: 'bel' }; }
    if (cam === 'cameragarage' && w.voertuigen && w.voertuigen[0] && w.voertuigen[0].plek !== 'onderweg') wat.auto = true;
    if (cam === 'camerawoon' && HV.kijk.thuis().length) wat.persoon = true;
    return { wat: wat, recent: recent };
  }
  /**
   * Кадр камери (hv-bev-beeld): SVG-сцена, рядок «знімки · 5 с», час дому, рамки виявлення, маски приватності.
   * opties: { groot (жива камера: знімок раз на 1 с), maskers (показати маски), bewerk (клітинки масок — кнопки), actie, k }
   */
  function beeld(cam, opties) {
    var w = HV.staat.w, a = w.apparaten[cam], op = opties || {}, b = zorg(w);
    if (!a) return '';
    var dicht = camDicht(a);
    var u = HV.uur(w.tijd), dag = u > 7.66 && u < 16.92;
    var naam = HV.p(a.naam);
    var boven = '<div class="hv-bev-beeld__boven"><span class="hv-bev-beeld__pil">' + (dicht ? HV.icoon('eye-off', { maat: 'maker' }) + h(t('без кадру', 'geen beeld')) : '<span class="hv-bev-beeld__stip" aria-hidden="true"></span>' + h(op.groot ? t('знімки · 1 с', 'beelden · 1 s') : t('знімки · 5 с', 'beelden · 5 s'))) + '</span>' +
      '<span class="hv-bev-beeld__pil hv-bev-beeld__naam">' + h(naam) + '</span></div>';
    var onder = '<div class="hv-bev-beeld__onder"><span class="hv-bev-beeld__pil">' + h(HV.datumKort(w.tijd) + ' ' + HV.tijd(w.tijd)) + (dag ? '' : ' · ' + h(t('ІЧ', 'IR'))) + '</span>' +
      '<span class="hv-bev-beeld__pil">' + HV.icoon('lock', { maat: 'maker' }) + h(t('через сервер', 'via de server')) + '</span></div>';
    var lijf;
    if (dicht) {
      lijf = '<div class="hv-bev-beeld__dicht">' + HV.icoon(a.beschikbaar === 'onbereikbaar' ? 'unplug' : 'eye-off', { maat: 'l' }) + '<span>' + h(HV.p(dicht)) + '</span></div>';
    } else {
      var x = camWat(cam), soort = SCENE[cam];
      var kaders = '';
      Object.keys(x.wat).forEach(function (k) {
        var r = KADER[soort] && KADER[soort][k];
        if (!r || (k === 'auto' && !(x.recent && x.recent.soort === 'auto'))) return;
        kaders += '<span class="hv-bev-kader" style="left:' + (r[0] / 3.2).toFixed(1) + '%;top:' + (r[1] / 1.8).toFixed(1) + '%;width:' + (r[2] / 3.2).toFixed(1) + '%;height:' + (r[3] / 1.8).toFixed(1) + '%"><span>' + h(HV.p(GEBEURTENIS[k].naam)) + '</span></span>';
      });
      lijf = '<svg class="hv-bev-beeld__svg' + (dag ? ' is-dag' : ' is-nacht') + '" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + h(t('Кадр симулятора: ', 'Beeld van de simulator: ') + naam) + '"><rect class="hv-bev-s0" width="320" height="180"/>' + scene(soort, x.wat) + '</svg>' + kaders;
      if (op.maskers || op.bewerk) {
        var m = b.maskers[cam] || [];
        var cellen = '';
        for (var i = 0; i < 18; i++) {
          var aan = m.indexOf(i) >= 0;
          cellen += op.bewerk
            ? '<button type="button" class="hv-bev-masker__cel' + (aan ? ' is-aan' : '') + '" aria-pressed="' + (aan ? 'true' : 'false') + '" aria-label="' + h(t('Маска, клітинка ', 'Masker, vak ') + (i + 1)) + '" data-actie="bev-masker" data-cam="' + h(cam) + '" data-cel="' + i + '"></button>'
            : '<span class="hv-bev-masker__cel' + (aan ? ' is-aan' : '') + '"></span>';
        }
        lijf += '<div class="hv-bev-masker' + (op.bewerk ? ' is-bewerk' : '') + '"' + (op.bewerk ? ' role="group" aria-label="' + h(t('Маски приватності', 'Privacymaskers')) + '"' : ' aria-hidden="true"') + '>' + cellen + '</div>';
      }
    }
    var tag = op.actie ? 'button type="button" data-actie="' + h(op.actie) + '"' + HV.attrs(op.gegevens) + ' aria-label="' + h(t('Відкрити камеру ', 'Camera openen: ') + naam) + '"' : 'div';
    return '<figure class="hv-bev-beeld' + (dicht ? ' is-dicht' : '') + (op.groot ? ' is-groot' : '') + '" data-k="' + h(op.k || 'beeld-' + cam) + '"><' + tag + ' class="hv-bev-beeld__raam">' + lijf + boven + onder + '</' + tag.split(' ')[0] + '></figure>';
  }

  // ── Щит охорони (hv-bev-schild): обідок — периметр, нижня половина — рух унизу, верхня — нагорі ──
  function schild(stand, opties) {
    var op = opties || {};
    var schil = stand !== 'uit', laag = stand === 'nacht' || stand === 'volledig', hoog = stand === 'volledig';
    return '<svg class="hv-bev-schild' + (op.alarm ? ' is-alarm' : '') + (op.uitloop ? ' is-uitloop' : '') + '" viewBox="0 0 120 132" aria-hidden="true">' +
      '<path class="hv-bev-schild__rand' + (schil ? ' is-aan' : '') + '" d="M60 6 108 22v40c0 33-20 55-48 65C32 117 12 95 12 62V22z"/>' +
      '<path class="hv-bev-schild__deel' + (hoog ? ' is-aan' : '') + '" d="M60 24 92 35v26H28V35z"/>' +
      '<path class="hv-bev-schild__deel' + (laag ? ' is-aan' : '') + '" d="M28 67h64c-2 21-14 35-32 43-18-8-30-22-32-43z"/>' +
      '</svg>';
  }

  // ───────────────────────── 7. Стан / Stand ─────────────────────────
  var NIET_GECERT = ['Що це: хаб макета — не сертифікована сигналізація й не пожежна сигналізація. Що робить хаб: сповіщення, світло, Журнал і кадри через сервер. Що робить сам пристрій: сирену й звук датчика диму дає сам пристрій — без хаба й без інтернету. Охорону хаб не викликає.',
    'Wat het is: de hub is geen gecertificeerd alarmsysteem en geen brandmeldinstallatie. Wat de hub doet: meldingen, licht, het logboek en beelden via de server. Wat het apparaat zelf doet: de sirene en het geluid van de rookmelder komen van het apparaat zelf — zonder hub en zonder internet. De hub belt geen meldkamer.'];
  var BEV_SOORTEN = ['slot', 'alarmsysteem', 'garagedeur', 'poort', 'camera', 'deurbel', 'rook', 'co', 'lek', 'contact', 'beweging'];
  var isBev = function (a) { return a && BEV_SOORTEN.indexOf(a.soort) >= 0; };

  function openDingen() {
    return HV.kijk.alle(function (a) { return (a.soort === 'contact' || a.soort === 'garagedeur' || a.soort === 'poort') && isOpen(a) && HV.kijk.isVers(a); });
  }
  function zinVan(ctx) {
    var w = ctx.staat, A = w.apparaten, b = zorg(w);
    var nl = ctx.taal === 'nl', open = openDingen();
    var delen = [];
    if (b.alarm) delen.push(t('Тривога: ', 'Alarm: ') + HV.p(b.alarm.wat) + '.');
    if (open.length) {
      var namen = open.slice(0, 2).map(function (a) { var k = HV.staat.kamer(a.kamer); return HV.p(a.naam).toLowerCase() + ' ' + (k ? HV.p(k.waar) : '') + (a.st.kiep && !a.st.open ? t(' (провітрювання)', ' (kiepstand)') : ''); });
      delen.push(t('Відчинено ', 'Open: ') + open.length + ': ' + namen.join(', ') + (open.length > 2 ? '…' : '') + '.');
    } else delen.push(t('Усі двері й вікна зачинено.', 'Alle deuren en ramen zijn dicht.'));
    delen.push(A.voordeurslot.st.vergrendeld ? t('Вхідні двері замкнено.', 'De voordeur is vergrendeld.') : t('Вхідні двері відімкнено.', 'De voordeur is ontgrendeld.'));
    var melders = HV.kijk.alle(function (a) { return a.soort === 'rook' || a.soort === 'co' || a.soort === 'lek'; });
    var alarm = melders.filter(function (a) { return a.st.alarm; });
    var stil = melders.filter(function (a) { return a.beschikbaar === 'verouderd'; });
    if (alarm.length) delen.push(HV.p(alarm[0].naam) + ' ' + HV.p(HV.staat.kamer(alarm[0].kamer).waar) + t(': тривога.', ': alarm.'));
    else if (stil.length) delen.push(nl ? 'De rookmelder ' + HV.p(HV.staat.kamer(stil[0].kamer).waar) + ' zwijgt al ' + stilte((stil[0])) + '.' : 'Датчик диму ' + HV.p(HV.staat.kamer(stil[0].kamer).waar) + ' мовчить ' + stilte((stil[0])) + '.');
    return delen.join(' ');
  }

  function held(ctx) {
    var w = ctx.staat, A = w.apparaten, b = zorg(w), stand = A.alarm.st.stand;
    var wacht = A.alarm.wacht && A.alarm.wacht.mogelijkheid === 'alarmstand' ? A.alarm.wacht.waarde : null;
    var chips = [];
    chips.push('<button type="button" class="hv-chip hv-bev-chip-cert" data-actie="uitleg" data-tekst="' + h(HV.p(NIET_GECERT)) + '" data-kop="' + h(t('Не сертифікована система', 'Geen gecertificeerd alarmsysteem')) + '" aria-haspopup="dialog" aria-expanded="false" data-k="chip-cert">' + HV.icoon('badge-info', { maat: 's' }) + '<span>' + h(t('Не сертифікована система', 'Geen gecertificeerd alarmsysteem')) + '</span></button>');
    chips.push(o.chip({ icoon: 'house', tekst: t('Режим дому: ', 'Huisstand: ') + HV.p(HV.huisstanden[w.huisstand]), actie: 'blad', gegevens: { blad: 'huisstand' }, k: 'chip-huis' }));
    var overbrug = HV.kijk.alle(overbrugd);
    if (overbrug.length) chips.push(o.chip({ icoon: 'shield-alert', toon: 'let-op', tekst: t('захист послаблено: обійдено ', 'bescherming verlaagd: overbrugd ') + overbrug.length, actie: 'blad', gegevens: { blad: 'bevzone:schil' }, k: 'chip-overbrug' }));
    if (b.meekijkenTot) chips.push(o.chip({ icoon: 'eye', toon: 'let-op', tekst: t('вітальню зараз бачать · до ', 'de woonkamer wordt bekeken · tot ') + HV.tijd(b.meekijkenTot), actie: 'ga', gegevens: { naar: 'beveiliging-camera-camerawoon' }, k: 'chip-bekeken' }));
    var thuis = HV.kijk.thuis().length;
    chips.push(o.chip({ icoon: 'users', tekst: thuis ? thuis + ' ' + t('удома', 'thuis') : t('нікого вдома', 'niemand thuis'), k: 'chip-thuis' }));
    var uitloop = '';
    if (b.uitloop) {
      var rest = Math.max(0, Math.ceil((b.uitloop.tot - Date.now()) / 1000));
      uitloop = '<div class="hv-bev-uitloop" data-k="uitloop" role="timer" aria-live="off">' + o.schakel({ aan: true, icoon: 'timer', aftel: rest / UITLOOP_S, toon: 'neutraal', aria: t('Відлік виходу', 'Vertrektijd') }) +
        '<div class="hv-bev-uitloop__tekst"><span class="hv-bev-uitloop__getal">' + rest + ' ' + h(t('с', 's')) + '</span><span>' + h(t('відлік виходу: зачиніть двері за собою', 'vertrektijd: trek de deur achter je dicht')) + '</span></div>' +
        o.knop({ tekst: t('Скасувати постановку', 'Inschakelen annuleren'), icoon: 'x', klein: true, actie: 'bev-uitloop-stop' }) + '</div>';
    }
    var woord = wacht ? HV.woord.wacht() : HV.p(STAND[stand].woord);
    return '<section class="hv-bev-held' + (stand !== 'uit' ? ' is-gewapend' : '') + (b.alarm ? ' is-alarm' : '') + '" data-k="bev-held" aria-label="' + h(HV.p(HV.alarmWoord[stand])) + '">' +
      '<div class="hv-bev-held__schild">' + schild(wacht || stand, { alarm: !!b.alarm, uitloop: !!b.uitloop }) + '</div>' +
      '<div class="hv-bev-held__tekst"><p class="hv-bev-held__kicker">' + h(t('Охорона', 'Alarm')) + ' <span class="hv-punt" aria-hidden="true">·</span> ' + h(HV.paspoort.adres) + '</p>' +
      '<h2 class="hv-bev-held__woord">' + h(woord) + '</h2><p class="hv-bev-held__zin">' + h(zinVan(ctx)) + '</p>' +
      '<div class="hv-bev-held__chips" role="list">' + chips.map(function (c) { return '<span role="listitem">' + c + '</span>'; }).join('') + '</div></div>' + uitloop + '</section>';
  }

  function alarmBanner(ctx) {
    var w = ctx.staat, b = zorg(w);
    if (!b.alarm) return '';
    var x = b.alarm, vers = Date.now() - x.echt < 30000;
    return '<section class="hv-bev-alarm" role="alert" data-k="bev-alarm"><span class="hv-bev-alarm__teken">' + HV.icoon('siren', { maat: 'l' }) + '</span>' +
      '<div class="hv-bev-alarm__tekst"><h2>' + h(t('Тривога: ', 'Alarm: ') + HV.p(x.wat)) + '</h2><p>' + h(t('з ', 'sinds ') + HV.tijd(x.sinds) + ' · ' + HV.p(x.waar) + (x.opgepakt ? t(' · займається: ', ' · pakt het op: ') + HV.p(x.opgepakt) : '')) + '</p>' +
      '<p class="hv-bev-alarm__sim">' + HV.icoon('flask-conical', { maat: 'maker' }) + h(t('Симуляція. Хаб не викликає охорону й поліцію: телефонуйте 112 самі.', 'Simulatie. De hub belt geen meldkamer of politie: bel zelf 112.')) + '</p></div>' +
      '<div class="hv-bev-alarm__knoppen">' + o.knop({ tekst: t('Відбій…', 'Afmelden…'), icoon: 'risico-kritiek', klas: 'hv-bev-knop-fout', actie: 'bev-afmelden', aria: t('Відбій тривоги — критична дія, з підтвердженням', 'Alarm afmelden — kritieke actie, met bevestiging'), k: 'afmelden' }) +
      (vers ? o.knop({ tekst: t('Хибна тривога', 'Vals alarm'), actie: 'bev-afmelden', gegevens: { vals: '1' }, k: 'vals' }) : '') +
      (x.opgepakt ? '' : o.knop({ tekst: t('Я займаюся', 'Ik pak het op'), icoon: 'hand', actie: 'bev-oppakken', k: 'oppakken' })) + '</div></section>';
  }

  /** hv-alarmstand: чотири рядки (на ширших — чотири картки), кожен із наслідком; зняття — критична дія. */
  function standen(ctx, opties) {
    var w = ctx.staat, A = w.apparaten, b = zorg(w), huidig = A.alarm.st.stand;
    var wacht = A.alarm.wacht && A.alarm.wacht.mogelijkheid === 'alarmstand' ? A.alarm.wacht.waarde : null;
    return '<div class="hv-bev-standen' + (opties && opties.smal ? ' is-smal' : '') + '" role="group" aria-label="' + h(t('Режим охорони', 'Alarmstand')) + '" data-k="standen">' + STANDEN.map(function (id) {
      var gekozen = id === huidig && !wacht, wachtHier = wacht === id;
      var lijst = id !== 'uit' && id !== huidig ? nietGereed(id) : [], ng = lijst.length;
      var eerste = ng ? lijst[0].apparaat : null;
      var sub = wachtHier ? HV.woord.wacht() : ng === 1 ? t('не готово: ', 'niet gereed: ') + HV.p(eerste.naam).toLowerCase() + ' ' + HV.p(HV.staat.kamer(eerste.kamer).waar) : ng ? t('не готово: ', 'niet gereed: ') + ng + ' ' + HV.meervoud(ng, ['перешкода', 'перешкоди', 'перешкод'], ['punt', 'punten']) : HV.p(STAND[id].kort);
      var merk = id === 'uit' && huidig !== 'uit' ? o.risico('kritiek') : (gekozen ? '<span class="hv-bev-standen__vink">' + HV.icoon('check', { maat: 's' }) + '</span>' : '');
      return '<div class="hv-bev-standen__rij' + (gekozen ? ' is-gekozen' : '') + (wachtHier ? ' is-wacht' : '') + (ng ? ' is-niet-gereed' : '') + '" data-k="stand-' + id + '">' +
        '<button type="button" class="hv-bev-standen__knop" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="bev-stand" data-waarde="' + id + '" aria-label="' + h(HV.p(HV.alarmWoord[id]) + (id === 'uit' && huidig !== 'uit' ? t(' — критична дія', ' — kritieke actie') : '')) + '">' +
        '<span class="hv-bev-standen__teken">' + HV.icoon(STAND[id].icoon) + '</span><span class="hv-bev-standen__tekst"><span class="hv-bev-standen__naam">' + h(HV.p(STAND[id].woord)) + '</span><span class="hv-bev-standen__sub">' + h(sub) + '</span></span>' + merk + '</button>' +
        o.gevolg(HV.p(STAND[id].gevolg), { kop: HV.p(HV.alarmWoord[id]) }) + '</div>';
    }).join('') + '</div>' + (b.uitloop ? '' : '');
  }

  /** «Зараз важливо» зони: фільтр єдиного переліку + спостережені винятки безпеки. */
  function nuItems(ctx) {
    var w = ctx.staat, A = w.apparaten, uit = [];
    var BEV_NU = ['oproep', 'nood', 'raam', 'bev-alarm'];
    w.nu.forEach(function (n) {
      var v = n.verzoek ? w.verzoeken.filter(function (x) { return x.id === n.verzoek; })[0] : null;
      if (BEV_NU.indexOf(n.id) >= 0 || (n.doel && isBev(A[n.doel])) || (v && isBev(A[v.doel]))) uit.push(n);
    });
    var heeft = function (doel) { return uit.some(function (n) { return n.doel === doel; }); };
    openDingen().forEach(function (a) {
      if (heeft(a.id)) return;
      uit.push({ id: 'bev-open-' + a.id, soort: 'aandacht', maker: 'systeem', icoon: a.soort === 'contact' ? 'door-open' : 'warehouse', doel: a.id, sinds: a.st.sinds || w.tijd,
        tekst: [a.naam[0] + ' ' + HV.staat.kamer(a.kamer).waar[0] + ': ' + (a.st.kiep && !a.st.open ? 'на провітрюванні' : 'відчинено'), a.naam[1] + ' ' + HV.staat.kamer(a.kamer).waar[1] + ': ' + (a.st.kiep && !a.st.open ? 'op de kiepstand' : 'open')],
        acties: [{ naam: 'blad', label: ['Відкрити', 'Openen'], gegevens: { blad: 'apparaat:' + a.id } }] });
    });
    if (!A.voordeurslot.st.vergrendeld && !heeft('voordeurslot')) uit.push({ id: 'bev-slot', soort: 'aandacht', maker: 'systeem', icoon: 'lock-keyhole-open', doel: 'voordeurslot', sinds: (A.voordeurslot.maker && A.voordeurslot.maker.tijd) || w.tijd,
      tekst: ['Вхідні двері відімкнено', 'De voordeur is ontgrendeld'], acties: [{ naam: 'doe', hoofd: true, label: ['Замкнути', 'Vergrendelen'], gegevens: { doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: 'true' } }] });
    HV.kijk.alle(function (a) { return (a.soort === 'rook' || a.soort === 'co' || a.soort === 'lek') && a.beschikbaar === 'verouderd'; }).forEach(function (a) {
      uit.push({ id: 'bev-stil-' + a.id, soort: 'aandacht', maker: 'systeem', icoon: 'alarm-smoke', doel: a.id, sinds: a.gezien,
        tekst: [a.naam[0] + ', ' + HV.staat.kamer(a.kamer).naam[0].toLowerCase() + ': мовчить ' + stilte((a)), a.naam[1] + ', ' + HV.staat.kamer(a.kamer).naam[1].toLowerCase() + ': zwijgt al ' + stilte((a))],
        acties: [{ naam: 'blad', label: ['Що перевірити', 'Wat controleren'], gegevens: { blad: 'apparaat:' + a.id } }] });
    });
    HV.kijk.alle(function (a) { return isBev(a) && a.batterij != null && a.batterij < 15; }).forEach(function (a) {
      uit.push({ id: 'bev-bat-' + a.id, soort: 'info', maker: 'systeem', icoon: 'battery-low', doel: a.id, sinds: w.tijd,
        tekst: [a.naam[0] + ' ' + HV.staat.kamer(a.kamer).waar[0] + ': батарейка ' + a.batterij + ' %', a.naam[1] + ' ' + HV.staat.kamer(a.kamer).waar[1] + ': batterij ' + a.batterij + ' %'],
        acties: [{ naam: 'blad', label: ['Відкрити', 'Openen'], gegevens: { blad: 'apparaat:' + a.id } }] });
    });
    return uit;
  }

  function deurenBlok(ctx) {
    var w = ctx.staat, A = w.apparaten;
    var tegels = ['voordeurslot', 'poort', 'garagedeur'].map(function (id) { return o.tegel(A[id], { vorm: '2x1', metKamer: true }); }).join('') +
      HV.kijk.alle(function (a) { return a.soort === 'contact' && a.deur; }).map(function (a) { return o.tegel(a, { vorm: '2x1', metKamer: true }); }).join('');
    var teDoen = (!A.voordeurslot.st.vergrendeld ? 1 : 0) + (A.poort.st.open ? 1 : 0) + (A.garagedeur.st.open ? 1 : 0);
    var extra = teDoen ? o.knop({ tekst: t('Замкнути все', 'Alles op slot') + ' · ' + teDoen, icoon: 'lock-keyhole', klein: true, actie: 'bev-alles-slot', k: 'alles-slot' }) : o.chip({ icoon: 'check', tekst: t('усе замкнено', 'alles op slot'), k: 'alles-dicht' });
    return kaart('hv-bev-deuren', kop('lock-keyhole', t('Двері й замки', 'Deuren en sloten'), extra) + '<div class="hv-tegels">' + tegels + '</div>' +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Квадрат із подвійною рамкою — дія з підтвердженням: відімкнути двері й відчинити ворота можна лише через рейку утримання.', 'Een vierkant met dubbele rand is een actie met bevestiging: deur ontgrendelen en poort openen gaan alleen via de houdrail.')) + '</p>', 'bev-deuren');
  }

  function zonesBlok(ctx) {
    var w = ctx.staat, stand = w.apparaten.alarm.st.stand, b = zorg(w);
    var kaarten = ZONES.map(function (z) {
      var l = leden(z), open = l.filter(function (a) { return isOpen(a) && z.id === 'schil'; }).length, ob = l.filter(overbrugd).length;
      var rust = l.filter(function (a) { return isOpen(a) && z.id === 'binnen'; }).length;
      var actief = z.id === 'altijd' ? true : l.some(function (a) { return bewaakt(a, stand); });
      var cfg = b.zones[z.id];
      var regel = [z.id === 'altijd' ? t('цілодобово', 'altijd') : actief ? t('стежить', 'bewaakt') : t('не стежить', 'niet bewaakt'), l.length + ' ' + HV.meervoud(l.length, ['датчик', 'датчики', 'датчиків'], ['melder', 'melders'])];
      if (open) regel.push(open + ' ' + t('відчинено', 'open'));
      if (rust) regel.push(t('рух зараз: ', 'beweging nu: ') + rust);
      if (ob) regel.push(t('обійдено ', 'overbrugd ') + ob);
      var instel = (cfg.vertraging ? t('затримка ', 'vertraging ') + cfg.vertraging + ' ' + t('с', 's') : t('без затримки', 'zonder vertraging')) + ' · ' + (cfg.stil ? t('тиха тривога', 'stil alarm') : t('сирена ', 'sirene ') + cfg.sirene + ' ' + t('хв', 'min')) + (cfg.kruis ? ' · ' + t('перехресна перевірка', 'kruiscontrole') : '');
      return '<button type="button" class="hv-bev-zone' + (actief ? ' is-actief' : '') + (open || ob ? ' is-let-op' : '') + '" data-actie="blad" data-blad="bevzone:' + z.id + '" data-k="zone-' + z.id + '">' +
        '<span class="hv-bev-zone__teken">' + HV.icoon(z.icoon) + '</span><span class="hv-bev-zone__naam">' + h(HV.p(z.naam)) + '</span>' +
        '<span class="hv-bev-zone__wat">' + h(HV.p(z.wat)) + '</span><span class="hv-bev-zone__regel">' + nb(regel.map(h)) + '</span><span class="hv-bev-zone__instel">' + h(instel) + '</span></button>';
    }).join('');
    return kaart('hv-bev-zones', kop('layers', t('Зони', 'Zones'), null, ZONES.length) + '<div class="hv-bev-zones__rij">' + kaarten + '</div>', 'bev-zones');
  }

  function camerasMini(ctx) {
    return kaart('hv-bev-cammini', kop('cctv', t('Камери', 'Camera’s'), naar(t('Усі камери', 'Alle camera’s'), 'beveiliging-cameras')) +
      '<div class="hv-bev-cammini__rooster">' + CAMERAS.map(function (c) { return beeld(c, { actie: 'ga', gegevens: { naar: 'beveiliging-camera-' + c }, k: 'mini-' + c }); }).join('') + '</div>', 'bev-cammini');
  }

  function meldersBlok(ctx) {
    var l = HV.kijk.alle(function (a) { return a.soort === 'rook' || a.soort === 'co' || a.soort === 'lek'; });
    var rijen = l.map(function (a) {
      var m = melderWoord(a);
      return '<button type="button" class="hv-bev-melderrij' + (m.toon ? ' is-' + m.toon : '') + '" data-actie="blad" data-blad="apparaat:' + h(a.id) + '" data-k="mr-' + h(a.id) + '">' +
        '<span class="hv-bev-melderrij__teken">' + HV.icoon(melderIcoon(a), { maat: 's' }) + '</span><span class="hv-bev-melderrij__naam">' + h(HV.p(a.naam)) + '<span>' + h(kamerNaam(a)) + '</span></span>' +
        '<span class="hv-bev-melderrij__woord">' + h(m.woord) + '</span>' + batterij(a.batterij) + '</button>';
    }).join('');
    return kaart('hv-bev-melders', kop('alarm-smoke', t('Аварійні датчики', 'Noodmelders'), naar(t('Датчики', 'Sensoren'), 'beveiliging-sensoren'), l.length) + '<div class="hv-bev-melderrijen">' + rijen + '</div>', 'bev-melders');
  }

  function wieBewaakt() {
    var kolom = function (icoon, titel, rijen) { return '<div class="hv-bev-wie__kolom"><h4>' + HV.icoon(icoon, { maat: 's' }) + h(titel) + '</h4><ul>' + rijen.map(function (r) { return '<li>' + HV.icoon(r[0], { maat: 's' }) + '<span>' + h(HV.p(r[1])) + '</span></li>'; }).join('') + '</ul></div>'; };
    return kaart('hv-bev-wie', kop('scale', t('Хто що охороняє', 'Wie bewaakt wat')) + '<div class="hv-bev-wie__kolommen">' +
      kolom('cpu', t('Сам пристрій', 'Het apparaat zelf'), [
        ['siren', ['Сирена охорони звучить на місці (у макеті — лише читання)', 'De sirene klinkt ter plekke (in de maquette alleen-lezen)']],
        ['alarm-smoke', ['Датчики диму й чадного газу мають власний гучний звук — працюють без хаба', 'Rook- en CO-melders hebben hun eigen luide geluid — werken zonder hub']],
        ['key-round', ['Замок: механічний ключ і власне автозамикання', 'Slot: mechanische sleutel en eigen automatisch vergrendelen']]]) +
      kolom('house', t('Хаб', 'De hub'), [
        ['bell', ['Сповіщення в застосунку — лише поки вкладка відкрита', 'Meldingen in de app — alleen zolang het tabblad open is']],
        ['lightbulb', ['Світло 100 % під час тривоги — за дозволом', 'Licht op 100 % bij alarm — met toestemming']],
        ['history', ['Журнал, стрічка подій і кадри камер через сервер', 'Logboek, gebeurtenissen en camerabeelden via de server']]]) + '</div>' +
      '<p class="hv-bev-noot">' + HV.icoon('badge-info', { maat: 's' }) + h(t('Хаб — не сертифікована система: він не викликає охорону, не будить уночі й не замінює звук датчика. Автоматизації тривоги в чинному адаптері не виконуються.', 'De hub is geen gecertificeerd systeem: hij belt geen meldkamer, maakt je ’s nachts niet wakker en vervangt het geluid van de melder niet. Alarmautomatiseringen draaien in de huidige adapter niet.')) + '</p>', 'bev-wie');
  }

  function gezondheid(ctx) {
    var w = ctx.staat;
    var stil = HV.kijk.alle(function (a) { return isBev(a) && a.beschikbaar === 'verouderd'; });
    var leeg = HV.kijk.alle(function (a) { return isBev(a) && a.batterij != null && a.batterij < 15; });
    var rij = function (icoon, naam, waarde, toon, actie, gegevens, k) { return o.rij({ icoon: icoon, naam: naam, waarde: '<span class="hv-bev-waarde' + (toon ? ' is-' + toon : '') + '">' + (toon === 'let-op' ? HV.icoon('triangle-alert', { maat: 's' }) : toon === 'ok' ? HV.icoon('circle-check', { maat: 's' }) : '') + h(waarde) + '</span>', actie: actie, gegevens: gegevens, k: k }); };
    return kaart('hv-bev-gezond', kop('heart-pulse', t('Здоров’я системи', 'Systeemgezondheid')) + '<div class="hv-rijen">' +
      rij('send', t('Доставка тривог', 'Alarmbezorging'), t('1 канал із 2 потрібних', '1 van de 2 nodige kanalen'), 'let-op', 'ga', { naar: 'activiteit-regels' }, 'gz-kanalen') +
      rij('radio-tower', t('Зовнішній сторож «дім мовчить 5 хв»', 'Externe wachter ‘huis zwijgt 5 min’'), t('немає', 'geen'), 'let-op', 'ga', { naar: 'activiteit-regels' }, 'gz-wachter') +
      (stil.length ? rij('alarm-smoke', naamKamer(stil[0]), t('мовчить ', 'zwijgt al ') + stilte((stil[0])), 'let-op', 'blad', { blad: 'apparaat:' + stil[0].id }, 'gz-stil') : '') +
      rij('battery-low', t('Батарейки нижче 15 %', 'Batterijen onder 15 %'), leeg.length ? String(leeg.length) : t('немає', 'geen'), leeg.length ? 'let-op' : 'ok', 'ga', { naar: 'beveiliging-sensoren' }, 'gz-bat') +
      rij('map-pin', t('Адреса для аварійного шару', 'Adres voor het noodscherm'), HV.paspoort.adres + ', ' + HV.p(HV.paspoort.plaats), 'ok', 'ga', { naar: 'instellingen-woning' }, 'gz-adres') +
      rij('hard-drive', t('Записи камер', 'Camera-opnamen'), t('немає сховища — лише знімки', 'geen opslag — alleen beelden'), null, 'ga', { naar: 'beveiliging-cameras' }, 'gz-opname') +
      rij('key-round', t('Підтвердження входу', 'Bevestiging van aanmelding'), t('діє 5 хв для сеансу', 'geldt 5 min per sessie'), null, 'ga', { naar: 'instellingen-risico' }, 'gz-aanmelding') +
      '</div>', 'bev-gezond');
  }

  function controleBlok(ctx) {
    var avond = controleLijst(ctx, 'avond'), weg = controleLijst(ctx, 'vertrek');
    var n = function (l) { return l.filter(function (x) { return !x.ok; }).length; };
    var knop = function (soort, icoon, naam, l) { var x = n(l); return '<button type="button" class="hv-bev-controleknop" data-actie="ga" data-naar="beveiliging-controle-' + soort + '" data-k="ck-' + soort + '">' + HV.icoon(icoon) + '<span class="hv-bev-controleknop__naam">' + h(naam) + '</span><span class="hv-bev-controleknop__sub' + (x ? ' is-let-op' : '') + '">' + h(x ? x + ' ' + HV.meervoud(x, ['пункт просить уваги', 'пункти просять уваги', 'пунктів просять уваги'], ['punt vraagt aandacht', 'punten vragen aandacht']) : t('усе гаразд', 'alles in orde')) + '</span>' + HV.icoon('chevron-right', { maat: 's', klas: 'hv-bev-controleknop__pijl' }) + '</button>'; };
    return kaart('hv-bev-controle', kop('list-checks', t('Перевірка', 'Controle')) + '<div class="hv-bev-controleknoppen">' + knop('avond', 'moon', t('Вечірня перевірка', 'Avondcontrole'), avond) + knop('vertrek', 'log-out', t('Перед виходом', 'Vertrekcontrole'), weg) + '</div>' + noodknop(), 'bev-controle');
  }

  /** Тривожна кнопка: утримання 3 с (усі ролі). Клавіатура — утримання пробілу чи Enter. */
  function noodknop() {
    return '<div class="hv-bev-noodknop" data-k="noodknop"><button type="button" class="hv-bev-noodknop__knop" data-actie="bev-noodknop" aria-describedby="bev-nood-uitleg">' +
      '<span class="hv-bev-noodknop__vulling" aria-hidden="true"></span>' + HV.icoon('siren') + '<span class="hv-bev-noodknop__tekst">' + h(t('Тривога — утримуйте 3 с', 'Noodknop — houd 3 s vast')) + '</span><span class="hv-bev-noodknop__tel" aria-hidden="true"></span></button>' +
      '<p class="hv-bev-noot" id="bev-nood-uitleg">' + HV.icoon('info', { maat: 's' }) + h(t('Для всіх ролей. Сповістить усіх дорослих і ввімкне сирену; охорону не викликає. Відпустіть раніше — нічого не станеться.', 'Voor iedereen. Waarschuwt alle volwassenen en zet de sirene aan; belt geen meldkamer. Loslaten vóór 3 s — er gebeurt niets.')) + '</p></div>';
  }

  var BEV_ACTIES = function () { return HV.gevaar.acties.filter(function (x) { return x.soorten && x.soorten.some(function (s) { return ['slot', 'alarmsysteem', 'garagedeur', 'poort', 'camera', 'rook', 'co', 'lek', 'contact'].indexOf(s) >= 0; }); }); };
  function toestemmingen(ctx) {
    var uitvoerder = HV.ui.lees('bev-uitvoerder', 'automatisering');
    var alle = BEV_ACTIES(), meer = HV.ui.lees('bev-alle-standen', false);
    var zwaarEerst = alle.slice().sort(function (a, b) { var r = { kritiek: 0, gevaarlijk: 1, gevoelig: 2, gewoon: 3 }; return r[a.niveau] - r[b.niveau]; });
    var lijst = meer ? zwaarEerst : zwaarEerst.slice(0, 5);
    var zwaar = HV.gevaar.altijdZwaar().filter(function (x) { return alle.indexOf(x.actie) >= 0; }).length;
    return kaart('hv-bev-standen-reg', kop('shield-check', t('Дозволи безпеки', 'Toestemmingen beveiliging'), naar(t('Показати в реєстрі', 'In register tonen'), 'instellingen-risico'), alle.length) +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Для кожної дії й кожного виконавця — «Вимкнено · Питати · Завжди». Типово «Вимкнено»; змінює лише власник; кожна зміна — запис у Журналі.', 'Voor elke actie en elke uitvoerder — ‘Uit · Vragen · Altijd’. Standaard ‘Uit’; alleen de eigenaar wijzigt; elke wijziging komt in het logboek.')) + (zwaar ? ' <strong class="hv-bev-waarde is-let-op">' + HV.icoon('risico-gevaarlijk', { maat: 'risico' }) + h(t('«Завжди» для небезпечних: ', '‘Altijd’ voor gevaarlijke: ') + zwaar) + '</strong>' : '') + '</p>' +
      o.segment({ label: t('Виконавець', 'Uitvoerder'), waarde: uitvoerder, actie: 'ui', gegevens: { naam: 'bev-uitvoerder' }, klas: 'hv-segment--rol', k: 'bev-uitvoerder', opties: HV.gevaar.uitvoerders().map(function (u) { return { id: u.id, label: HV.p(u.naam) }; }) }) +
      '<div class="hv-bev-standenlijst">' + lijst.map(function (x) { return o.stand({ uitvoerder: uitvoerder, actie: x, rol: ctx.rol }); }).join('') + '</div>' +
      (alle.length > 5 ? '<div class="hv-knoppen">' + o.knop({ tekst: meer ? t('Показати лише головні', 'Alleen de belangrijkste') : t('Показати всі ', 'Alle tonen: ') + alle.length, icoon: meer ? 'chevron-up' : 'chevron-down', soort: 'stil', klein: true, actie: 'ui', gegevens: { naam: 'bev-alle-standen', waarde: meer ? '' : '1' } }) + '</div>' : ''), 'bev-toestemmingen');
  }

  /** Стрічка доби безпеки: охорона, двері, рух, події камер. */
  function strook(ctx, opties) {
    var w = ctx.staat, b = zorg(w), van = w.tijd - 18 * UUR, tot = w.tijd + 2 * UUR, dag = HV.paspoort.dag;
    var stand = [], deuren = [], beweging = [], cams = [];
    var STAND_VAN = { nacht: 'nacht', afwezig: 'volledig' };
    for (var d0 = dagBegin(van); d0 < tot; d0 += DAG) {
      dag.stand.forEach(function (r) { var s = STAND_VAN[r[2]]; var a = d0 + r[0] * UUR, e = d0 + r[1] * UUR; if (s && e > van && a < w.tijd) stand.push({ van: Math.max(van, a), tot: Math.min(w.tijd, e), klas: 'hv-bev-baan--' + s, label: HV.p(STAND[s].woord) }); });
      dag.deuren.forEach(function (u) { var m = d0 + u * UUR; if (m > van && m < w.tijd) deuren.push({ x: m, label: t('вхідні двері', 'voordeur'), icoon: 'door-open' }); });
    }
    dag.deuren.concat([9.4, 13.2, 19.8]).forEach(function (u) { var m = laatste(w.tijd, u + 0.02); if (m > van) beweging.push({ x: m, label: t('рух у передпокої', 'beweging in de hal'), icoon: 'radar' }); });
    b.gebeurtenissen.forEach(function (g) { if (g.tijd > van) cams.push({ x: g.tijd, label: HV.p(g.tekst), icoon: GEBEURTENIS[g.soort].icoon }); });
    var tikken = [];
    for (var u = Math.ceil(van / (6 * UUR)) * 6 * UUR; u < tot; u += 6 * UUR) tikken.push({ x: u, label: HV.tijd(u) });
    return HV.grafiek.toestanden({ id: 'bev-strook' + (opties && opties.id ? '-' + opties.id : ''), titel: t('Доба безпеки', 'Etmaal van de beveiliging'), van: van, tot: tot, nu: w.tijd, tikken: tikken, format: HV.tijd,
      banen: [{ naam: t('охорона', 'alarm'), stukken: stand }, { naam: t('двері', 'deuren'), punten: deuren }, { naam: t('рух', 'beweging'), punten: beweging }, { naam: t('камери', 'camera’s'), punten: cams }],
      samenvatting: t('Охорона за режимом дому, відчинення дверей, рух і події камер за 18 годин. Симуляція.', 'Alarm volgens de huisstand, deuren, beweging en camera-gebeurtenissen over 18 uur. Simulatie.') });
  }

  function logBlok(ctx, filter, titel) {
    var w = ctx.staat, openId = HV.ui.lees('bericht', null);
    var regels = w.logboek.filter(filter || function (r) { return r.soort === 'huis.alarm' || r.soort === 'huis.toegang' || (r.doel && isBev(w.apparaten[r.doel])); }).slice(0, 6);
    return kaart('hv-bev-log', kop('history', titel || t('Журнал безпеки', 'Logboek beveiliging'), naar(t('Увесь Журнал', 'Heel het logboek'), 'activiteit-geschiedenis')) +
      (regels.length ? '<ul class="hv-berichten">' + regels.map(function (r) { return o.bericht(r, { open: openId === r.id }); }).join('') + '</ul>' : o.leeg({ icoon: 'history', titel: t('Ще немає записів', 'Nog geen regels'), tekst: t('Кожна дія з охороною, замками й камерами з’явиться тут зі знаком автора.', 'Elke actie met alarm, sloten en camera’s komt hier, met wie het deed.') })), 'bev-log-' + (titel ? 'x' : 'stand'));
  }

  function renderStand(ctx) {
    var w = ctx.staat;
    zorg(w);
    var items = nuItems(ctx);
    var nu = items.length ? kaart('hv-bev-nu', kop('triangle-alert', t('Зараз важливо', 'Nu belangrijk'), null, items.length) + o.nu(items), 'bev-nu') : '';
    return '<div class="hv-bev" data-k="bev-stand">' + alarmBanner(ctx) + held(ctx) +
      kaart('hv-bev-standkaart', kop('shield', t('Режим охорони', 'Alarmstand'), bladKnop(t('Аркуш охорони', 'Alarmblad'), 'apparaat:alarm', 'panel-right', 'stil')) + standen(ctx), 'bev-standkaart') +
      '<div class="hv-bev-rooster hv-bev-rooster--twee hv-bev-rooster--stand">' +
      '<div class="hv-bev-kolom">' + nu + deurenBlok(ctx) + zonesBlok(ctx) + camerasMini(ctx) + meldersBlok(ctx) + kaart('hv-bev-strookkaart', strook(ctx), 'bev-strook') + toestemmingen(ctx) + '</div>' +
      '<div class="hv-bev-kolom">' + controleBlok(ctx) + wieBewaakt() + gezondheid(ctx) + oefenBlok() + logBlok(ctx) + '</div>' +
      '</div></div>';
  }

  // ───────────────────────── 8. Камери / Camera's ─────────────────────────
  function camStatus(a) {
    var d = camDicht(a);
    if (d) return HV.p(d);
    return a.st.modus === 'cam-meekijken' ? t('тимчасовий перегляд', 'tijdelijk meekijken') : t('кадри через сервер', 'beelden via de server');
  }
  function laatsteVan(cam) { var b = zorg(HV.staat.w); for (var i = 0; i < b.gebeurtenissen.length; i++) if (b.gebeurtenissen[i].cam === cam) return b.gebeurtenissen[i]; return null; }

  function camKaart(ctx, cam, groot) {
    var a = app(cam), g = laatsteVan(cam);
    return '<article class="hv-bev-cam' + (groot ? ' is-groot' : '') + '" data-k="cam-' + cam + '">' + beeld(cam, { actie: 'ga', gegevens: { naar: 'beveiliging-camera-' + cam }, groot: groot, maskers: groot, k: 'cambeeld-' + cam }) +
      '<div class="hv-bev-cam__onder"><div class="hv-bev-cam__tekst"><span class="hv-bev-cam__naam">' + h(HV.p(a.naam)) + '</span><span class="hv-bev-cam__sub">' + nb([h(kamerNaam(a)), h(camStatus(a))]) + '</span></div>' +
      (g ? '<span class="hv-bev-cam__ev">' + o.chip({ icoon: GEBEURTENIS[g.soort].icoon, tekst: HV.tijd(g.tijd) + ' · ' + HV.p(GEBEURTENIS[g.soort].naam), actie: 'bev-moment', gegevens: { id: g.id }, k: 'camev-' + cam }) + '</span>' : '') + '</div></article>';
  }

  function priveKaart(ctx) {
    var w = ctx.staat, b = zorg(w), thuis = HV.kijk.thuis().length;
    return '<div class="hv-bev-prive" data-k="bev-prive">' + o.schakel({ aan: b.priveThuis, icoon: b.priveThuis ? 'eye-off' : 'eye', toon: 'neutraal', actie: 'bev-prive-thuis', aria: t('Приватність удома', 'Privacy thuis') }) +
      '<div class="hv-bev-prive__tekst"><span class="hv-bev-prive__naam">' + h(t('Приватність удома', 'Privacy thuis')) + '</span><span class="hv-bev-prive__sub">' + h(b.priveThuis ? (thuis ? t('Внутрішні камери вимкнено: удома ', 'Binnencamera’s staan uit: thuis zijn ') + thuis + '.' : t('Нікого немає вдома — внутрішні камери стежать.', 'Er is niemand thuis — de binnencamera’s kijken mee.')) : t('Вимкнено: внутрішні камери працюють і коли хтось удома.', 'Uit: binnencamera’s werken ook als er iemand thuis is.')) + '</span></div>' +
      o.gevolg(t('Що станеться: поки хтось удома, внутрішні камери не показують і не надсилають кадрів; вуличні працюють завжди. Пов’язано з: тимчасовий перегляд на 30 хв — чутлива дія, запис у «Хто дивився». Як повернути: той самий перемикач.', 'Wat er gebeurt: zolang er iemand thuis is, tonen en versturen de binnencamera’s geen beelden; de buitencamera’s werken altijd. Hangt samen met: 30 min meekijken is een gevoelige actie en komt in ‘Wie keek mee’. Terugdraaien: dezelfde schakelaar.'), { kop: t('Приватність удома', 'Privacy thuis') }) + '</div>';
  }

  function gebeurtenissenBlok(ctx, cam) {
    var w = ctx.staat, b = zorg(w), filter = HV.ui.lees('bev-ev-filter', 'alle');
    var lijst = b.gebeurtenissen.filter(function (g) { return (!cam || g.cam === cam) && (filter === 'alle' || g.soort === filter); });
    var van = w.tijd - 24 * UUR, tikken = [];
    for (var u = Math.ceil(van / (6 * UUR)) * 6 * UUR; u <= w.tijd; u += 6 * UUR) tikken.push({ x: u, label: HV.tijd(u) });
    var banen = (cam ? [cam] : CAMERAS).map(function (c) { return { naam: HV.p(app(c).naam).replace(/^Камера |^Camera /, ''), punten: b.gebeurtenissen.filter(function (g) { return g.cam === c && (filter === 'alle' || g.soort === filter); }).map(function (g) { return { x: g.tijd, label: HV.p(g.tekst), icoon: GEBEURTENIS[g.soort].icoon }; }) }; });
    var chips = '<div class="hv-filter" role="group" aria-label="' + h(t('Вид події', 'Soort gebeurtenis')) + '">' + [['alle', t('усі', 'alle'), 'list']].concat(Object.keys(GEBEURTENIS).map(function (k) { return [k, HV.p(GEBEURTENIS[k].naam), GEBEURTENIS[k].icoon]; })).map(function (x) {
      return o.chip({ filter: true, gekozen: filter === x[0], icoon: x[2], tekst: x[1], actie: 'ui', gegevens: { naam: 'bev-ev-filter', waarde: x[0] }, k: 'evf-' + x[0] });
    }).join('') + '</div>';
    var rijen = lijst.slice(0, cam ? 8 : 10).map(function (g) {
      return '<button type="button" class="hv-bev-ev" data-actie="bev-moment" data-id="' + h(g.id) + '" data-k="ev-' + h(g.id) + '"><span class="hv-bev-ev__tijd">' + h(wanneer(g.tijd)) + '</span><span class="hv-bev-ev__teken">' + HV.icoon(GEBEURTENIS[g.soort].icoon, { maat: 's' }) + '</span>' +
        '<span class="hv-bev-ev__wat">' + h(HV.p(g.tekst)) + (cam ? '' : '<span>' + h(HV.p(app(g.cam).naam)) + '</span>') + '</span>' + HV.icoon('chevron-right', { maat: 's', klas: 'hv-bev-ev__pijl' }) + '</button>';
    }).join('');
    return kaart('hv-bev-events', kop('scan-eye', t('Події з виявленням', 'Gebeurtenissen met detectie'), null, lijst.length) + chips +
      HV.grafiek.toestanden({ id: 'bev-ev' + (cam || ''), van: van, tot: w.tijd, nu: w.tijd, tikken: tikken, format: HV.tijd, banen: banen, samenvatting: t('Позначки — події виявлення за 24 години; дотик до рядка нижче відкриває знімок моменту.', 'Markeringen zijn detecties van de laatste 24 uur; tik op een regel hieronder voor het beeld van dat moment.') }) +
      (rijen ? '<div class="hv-bev-evs">' + rijen + '</div>' : o.leeg({ icoon: 'scan-eye', titel: t('За цим фільтром подій немає', 'Geen gebeurtenissen met dit filter') })), 'bev-events-' + (cam || 'alle'));
  }

  function gekekenBlok(ctx, cam) {
    var b = zorg(ctx.staat);
    var l = b.gekeken.filter(function (x) { return !cam || x.cam === cam; }).slice(0, 6);
    var rijen = l.map(function (x, i) {
      return '<div class="hv-bev-gekeken" data-k="gk-' + i + '-' + x.tijd + '"><span class="hv-bev-gekeken__wie">' + o.maker({ soort: x.soort, naam: x.wie }) + '</span>' +
        '<span class="hv-bev-gekeken__wat">' + nb([h(HV.p(app(x.cam).naam)), h(wanneer(x.tijd)), h(x.duur ? HV.duur(x.duur) : t('мить', 'kort')), h(HV.p(x.via))]) + (x.reden ? '<span class="hv-bev-gekeken__reden">' + h(t('Чому: ', 'Waarom: ') + HV.p(x.reden)) + '</span>' : '') + '</span></div>';
    }).join('');
    return kaart('hv-bev-gekekenkaart', kop('eye', t('Хто дивився', 'Wie keek mee'), null, l.length) + (rijen || o.leeg({ icoon: 'eye', titel: t('Ніхто ще не дивився', 'Nog niemand heeft gekeken') })) +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Слід лише на додавання: кожен перегляд людини чи агента лишає рядок. Агенти типово бачать лише події, без кадрів.', 'Het spoor wordt alleen aangevuld: elke blik van een mens of agent laat een regel na. Agenten zien standaard alleen gebeurtenissen, zonder beeld.')) + '</p>', 'bev-gekeken-' + (cam || 'alle'));
  }

  function renderCameras(ctx) {
    var w = ctx.staat, b = zorg(w);
    b.bekijkt = null;
    var raster = HV.ui.lees('bev-raster', '4'), gekozen = HV.ui.lees('bev-cam', 'cameravoor');
    var balk = kaart('hv-bev-cambalk', '<div class="hv-bev-cambalk__rij">' + o.segment({ label: t('Сітка камер', 'Cameraraster'), waarde: raster, actie: 'ui', gegevens: { naam: 'bev-raster' }, k: 'bev-raster', klas: 'hv-bev-raster', opties: [{ id: '1', label: t('Одна', 'Eén'), icoon: 'square' }, { id: '4', label: t('Чотири', 'Vier'), icoon: 'layout-grid' }] }) +
      bladKnop(t('Доступ до камер', 'Toegang tot camera’s'), 'bevtoegang', 'users', 'gewoon') + '</div>' + priveKaart(ctx) +
      '<p class="hv-bev-noot">' + HV.icoon('hard-drive', { maat: 's' }) + h(t('Записів немає: до рішення про сховище — лише знімки через сервер (жива камера раз на 1 с, решта раз на 5 с, затримка ≈ 3 с). Копії поза домом немає.', 'Geen opnamen: tot er over opslag is besloten alleen beelden via de server (de actieve camera elke 1 s, de rest elke 5 s, vertraging ≈ 3 s). Geen kopie buitenshuis.')) + '</p>', 'bev-cambalk');
    var rooster;
    if (raster === '1') {
      rooster = '<div class="hv-bev-camen is-een">' + camKaart(ctx, gekozen, true) + '<div class="hv-bev-camkeuze" role="group" aria-label="' + h(t('Обрати камеру', 'Camera kiezen')) + '">' + CAMERAS.map(function (c) {
        return '<button type="button" class="hv-bev-camkeuze__knop' + (c === gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (c === gekozen ? 'true' : 'false') + '" data-actie="ui" data-naam="bev-cam" data-waarde="' + c + '" data-k="ck-' + c + '">' + HV.icoon('cctv', { maat: 's' }) + '<span>' + h(HV.p(app(c).naam)) + '</span></button>';
      }).join('') + '</div></div>';
    } else rooster = '<div class="hv-bev-camen">' + CAMERAS.map(function (c) { return camKaart(ctx, c, false); }).join('') + '</div>';
    return '<div class="hv-bev" data-k="bev-cameras">' + balk + rooster + '<div class="hv-bev-rooster hv-bev-rooster--twee"><div class="hv-bev-kolom">' + gebeurtenissenBlok(ctx) + '</div><div class="hv-bev-kolom">' + gekekenBlok(ctx) + avgBlok(ctx) + '</div></div></div>';
  }

  /** Помічник AVG (GDPR) для вуличних камер і дзвінка: маска на вулицю, строки, звук, табличка. */
  function avgBlok(ctx, cam) {
    var b = zorg(ctx.staat);
    var lijst = (cam ? [cam] : ['cameravoor', 'cameratuin']).filter(function (c) { return c !== 'camerawoon' && c !== 'cameragarage'; });
    if (!lijst.length) return '';
    var rij = function (ok, tekst, sub) { return '<li class="' + (ok ? 'is-ok' : 'is-let-op') + '">' + HV.icoon(ok ? 'circle-check' : 'triangle-alert', { maat: 's' }) + '<span>' + h(tekst) + (sub ? '<span>' + h(sub) + '</span>' : '') + '</span></li>'; };
    return kaart('hv-bev-avg', kop('scale', t('Помічник AVG: вулична камера', 'AVG-hulp: buitencamera'), cam ? '' : naar(t('Маски', 'Maskers'), 'beveiliging-camera-cameravoor')) + lijst.map(function (c) {
      var m = (b.maskers[c] || []).length;
      return '<div class="hv-bev-avg__cam" data-k="avg-' + c + '"><h4>' + h(HV.p(app(c).naam)) + '</h4><ul class="hv-bev-check">' +
        rij(m > 0, m ? t('Маска на вулицю й сусідів: ', 'Masker op straat en buren: ') + m + ' ' + t('клітинки', 'vakken') : t('Маски на вулицю немає', 'Geen masker op de straat'), m ? '' : t('Публічну вулицю знімати не можна — додайте маску.', 'De openbare straat mag je niet filmen — voeg een masker toe.')) +
        rij(true, t('Кліпи подій — 14 днів (стеля 28)', 'Clips van gebeurtenissen — 14 dagen (maximaal 28)')) +
        rij(true, t('Звук вимкнено', 'Geluid uit')) +
        rij(false, t('Табличка про камеру біля входу', 'Bordje over de camera bij de ingang'), t('Хаб цього не перевіряє — це ваша дія.', 'De hub controleert dit niet — dat doe jij.')) + '</ul></div>';
    }).join(''), 'bev-avg-' + (cam || 'alle'));
  }

  function renderCamera(ctx) {
    var w = ctx.staat, b = zorg(w), cam = ctx.route.object;
    var a = app(cam);
    if (!a || a.soort !== 'camera') return o.leeg({ icoon: 'cctv', titel: t('Такої камери немає', 'Deze camera bestaat niet'), actie: { tekst: t('Усі камери', 'Alle camera’s'), soort: 'hoofd', actie: 'ga', gegevens: { naar: 'beveiliging-cameras' } } });
    if (b.bekijkt !== cam) {
      b.bekijkt = cam;
      var m = HV.mens();
      if (!camDicht(a)) b.gekeken.unshift({ wie: m.naam, soort: 'mens', cam: cam, tijd: w.tijd, duur: 0, via: ['цей пристрій', 'dit toestel'], reden: ['відкрито сторінку камери', 'camerapagina geopend'] });
    }
    var moment = HV.ui.lees('bev-moment', null), g = moment ? b.gebeurtenissen.filter(function (x) { return x.id === moment && x.cam === cam; })[0] : null;
    var bewerk = HV.ui.lees('bev-maskbewerk', false) === cam, dicht = camDicht(a);
    var kopHtml = '<div class="hv-bev-camkop" data-k="camkop"><div><h2>' + h(HV.p(a.naam)) + '</h2><p>' + nb([h(kamerNaam(a)), h(camStatus(a))]) + '</p></div><div class="hv-bev-camkop__chips">' +
      o.chip({ icoon: 'timer', tekst: t('знімки · 1 с · затримка ≈ 3 с', 'beelden · 1 s · vertraging ≈ 3 s') }) + o.chip({ icoon: 'lock', tekst: t('захищено', 'beveiligd') }) + '</div></div>';
    var momentHtml = g ? '<div class="hv-bev-moment" data-k="moment">' + HV.icoon(GEBEURTENIS[g.soort].icoon, { maat: 's' }) + '<span><strong>' + h(wanneer(g.tijd)) + '</strong> · ' + h(HV.p(g.tekst)) + '</span>' + o.knop({ tekst: t('Наживо', 'Live'), icoon: 'radio', klein: true, actie: 'ui', gegevens: { naam: 'bev-moment', waarde: '' } }) + '</div>' : '';
    var frame = g ? momentBeeld(cam, g) : beeld(cam, { groot: true, maskers: true, bewerk: bewerk, k: 'groot-' + cam });
    var knoppen = '<div class="hv-knoppen" data-k="camknoppen">' +
      o.knop({ tekst: t('Зберегти знімок', 'Beeld bewaren'), icoon: 'image-down', actie: 'bev-snapshot', gegevens: { cam: cam }, uit: !!dicht }) +
      (a.binnen && dicht && a.st.modus !== 'cam-prive' ? o.knop({ tekst: t('Переглянути 30 хв…', '30 min meekijken…'), icoon: 'eye', soort: 'hoofd', actie: 'bev-meekijken', gegevens: { doel: cam } }) : '') +
      (a.st.modus === 'cam-meekijken' ? o.knop({ tekst: t('Завершити перегляд', 'Meekijken stoppen'), icoon: 'eye-off', actie: 'doe', gegevens: { doel: cam, mogelijkheid: 'modus', waarde: 'cam-actief' } }) : '') +
      o.knop({ tekst: a.st.modus === 'cam-prive' ? t('Увімкнути камеру', 'Camera aanzetten') : t('Вимкнути камеру', 'Camera uitzetten'), icoon: a.st.modus === 'cam-prive' ? 'video' : 'video-off', actie: 'doe', gegevens: { doel: cam, mogelijkheid: 'modus', waarde: a.st.modus === 'cam-prive' ? 'cam-actief' : 'cam-prive' } }) +
      (dicht ? '' : o.knop({ tekst: bewerk ? t('Готово з масками', 'Klaar met maskers') : t('Маски приватності', 'Privacymaskers'), icoon: 'grid-3x3', soort: bewerk ? 'hoofd' : 'gewoon', actie: 'bev-maskbewerk', gegevens: { waarde: bewerk ? '' : cam } })) + '</div>';
    var maskNoot = bewerk ? '<p class="hv-bev-noot" data-k="masknoot">' + HV.icoon('grid-3x3', { maat: 's' }) + h(t('Торкніться клітинок, які не можна знімати: зона приватності не записується, не показується агентам і не дає подій.', 'Tik de vakken aan die niet gefilmd mogen worden: een privacyzone wordt niet bewaard, niet aan agenten getoond en geeft geen gebeurtenissen.')) + ' ' + o.knop({ tekst: t('Очистити маски', 'Maskers wissen'), soort: 'stil', klein: true, actie: 'bev-masker-wis', gegevens: { cam: cam } }) + '</p>' : '';
    var geen = '<p class="hv-bev-geenopname" data-k="geenopname">' + HV.icoon('hard-drive', { maat: 's' }) + '<span><strong>' + h(t('Записів немає', 'Geen opnamen')) + '</strong> · ' + h(t('сховище для кліпів ще не обрано; події зберігають лише знімок моменту.', 'er is nog geen opslag voor clips gekozen; gebeurtenissen bewaren alleen een beeld van het moment.')) + '</span></p>';
    return '<div class="hv-bev hv-bev-campagina" data-k="bev-camera-' + cam + '">' + kopHtml +
      '<div class="hv-bev-rooster hv-bev-rooster--cam"><div class="hv-bev-kolom">' + kaart('hv-bev-camgroot', momentHtml + frame + knoppen + maskNoot + geen, 'camgroot') + gebeurtenissenBlok(ctx, cam) + '</div>' +
      '<div class="hv-bev-kolom">' + (a.binnen ? kaart('', priveKaart(ctx), 'prive-cam') : '') + gekekenBlok(ctx, cam) + avgBlok(ctx, cam) + logBlok(ctx, function (r) { return r.doel === cam; }, t('Дії з цією камерою', 'Acties met deze camera')) + '</div></div></div>';
  }
  /** Знімок моменту події: та сама сцена з об'єктом події і часом події. */
  function momentBeeld(cam, g) {
    var wat = {}; wat[g.soort === 'bel' ? 'persoon' : g.soort] = true;
    if (cam === 'cameragarage') wat.auto = true;
    var u = HV.uur(g.tijd), dag = u > 7.66 && u < 16.92, soort = SCENE[cam], r = KADER[soort] && KADER[soort][g.soort === 'bel' ? 'persoon' : g.soort];
    return '<figure class="hv-bev-beeld is-groot" data-k="moment-' + h(g.id) + '"><div class="hv-bev-beeld__raam"><svg class="hv-bev-beeld__svg' + (dag ? ' is-dag' : ' is-nacht') + '" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + h(t('Знімок події: ', 'Beeld van de gebeurtenis: ') + HV.p(g.tekst)) + '"><rect class="hv-bev-s0" width="320" height="180"/>' + scene(soort, wat) + '</svg>' +
      (r ? '<span class="hv-bev-kader" style="left:' + (r[0] / 3.2).toFixed(1) + '%;top:' + (r[1] / 1.8).toFixed(1) + '%;width:' + (r[2] / 3.2).toFixed(1) + '%;height:' + (r[3] / 1.8).toFixed(1) + '%"><span>' + h(HV.p(GEBEURTENIS[g.soort === 'bel' ? 'persoon' : g.soort].naam)) + '</span></span>' : '') +
      '<div class="hv-bev-beeld__boven"><span class="hv-bev-beeld__pil">' + HV.icoon('image', { maat: 'maker' }) + h(t('знімок події', 'beeld van de gebeurtenis')) + '</span><span class="hv-bev-beeld__pil hv-bev-beeld__naam">' + h(HV.p(app(cam).naam)) + '</span></div>' +
      '<div class="hv-bev-beeld__onder"><span class="hv-bev-beeld__pil">' + h(HV.datumKort(g.tijd) + ' ' + HV.tijd(g.tijd)) + '</span><span class="hv-bev-beeld__pil">' + HV.icoon('lock', { maat: 'maker' }) + h(t('через сервер', 'via de server')) + '</span></div></div></figure>';
  }

  // ── Аркуш доступу «роль × камера» ──
  HV.blad({
    soort: 'bevtoegang', vrij: true, icoon: 'users', titel: ['Доступ до камер', 'Toegang tot camera’s'],
    sub: function () { return t('роль × камера · змінює лише власник', 'rol × camera · alleen de eigenaar wijzigt'); },
    render: function (ctx) {
      var b = zorg(ctx.staat), eigenaar = ctx.rol === 'eigenaar';
      return '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Немає · події (лише текст) · знімки · відео. Агентам типово «події»: вони знають, що сталося, але кадру не бачать.', 'Geen · gebeurtenissen (alleen tekst) · beelden · video. Agenten krijgen standaard ‘gebeurtenissen’: ze weten wat er gebeurde, maar zien geen beeld.')) + '</p>' +
        CAMERAS.map(function (c) {
          return o.kaart({ titel: HV.p(app(c).naam), k: 'tg-' + c, inhoud: ROLLEN.map(function (r) {
            var waarde = b.toegang[c][r[0]];
            return '<div class="hv-bev-tgrij" data-k="tg-' + c + '-' + r[0] + '"><span class="hv-bev-tgrij__rol">' + h(HV.p(r[1])) + '</span>' +
              (eigenaar ? o.segment({ label: HV.p(r[1]) + ' · ' + HV.p(app(c).naam), waarde: waarde, actie: 'bev-camtoegang', gegevens: { cam: c, rol: r[0] }, klas: 'hv-bev-tgseg', opties: TOEGANG.map(function (x) { return { id: x[0], label: HV.p(x[1]) }; }) })
                : '<span class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span><strong>' + h(HV.p(TOEGANG.filter(function (x) { return x[0] === waarde; })[0][1])) + '</strong> · ' + h(t('змінює лише власник', 'alleen de eigenaar wijzigt')) + '</span></span>') + '</div>';
          }).join('') });
        }).join('');
    }
  });

  // ───────────────────────── 9. Доступ / Toegang ─────────────────────────
  var DEUREN = [['voordeur', ['Вхідні двері', 'Voordeur'], 'door-closed'], ['poort', ['Вхідні ворота', 'Toegangspoort'], 'fence'], ['garagedeur', ['Гаражні ворота', 'Garagedeur'], 'warehouse']];
  var deurNaam = function (id) { var d = DEUREN.filter(function (x) { return x[0] === id; })[0]; return d ? HV.p(d[1]) : id; };

  /** Керування замком: «Замкнути» — один дотик; «Відімкнути…» — рейка й підтвердження входу (через HV.doe). */
  function slotBediening(ctx, a, opties) {
    var st = a.st, wacht = a.wacht && a.wacht.mogelijkheid === 'vergrendeld' ? a.wacht : null;
    var dicht = wacht ? wacht.waarde : st.vergrendeld;
    var woord = wacht ? (wacht.fase === 'bezig' ? (wacht.waarde ? t('замикається', 'vergrendelt') : t('відмикається', 'ontgrendelt')) + (wacht.voortgang != null ? ' · ' + Math.round(wacht.voortgang) + ' %' : '') : HV.woord.wacht()) : HV.mislukt(a) ? t('не виконано', 'niet uitgevoerd') : st.vergrendeld ? HV.woord.vergrendeld() : HV.woord.ontgrendeld();
    var sch = o.beeld(a).schakel;
    var ritueel = HV.ritueelVan(a, sch);
    var dagenRest = a.batterij != null ? Math.round(a.batterij * 0.65) : null;
    var wie = a.maker ? '<p class="hv-bev-slot__wie">' + h(t('Остання зміна: ', 'Laatste wijziging: ')) + o.maker(a.maker) + ' <span class="hv-punt">·</span> ' + h(HV.tijd(a.maker.tijd)) + '</p>' : '';
    var hoofd = '<div class="hv-bev-slot' + (st.vergrendeld ? ' is-dicht' : ' is-open') + (wacht ? ' is-wacht' : '') + '" data-k="slot-' + a.id + '">' +
      o.schakel({ aan: !dicht, icoon: dicht ? 'lock-keyhole' : 'lock-keyhole-open', ritueel: ritueel, staat: wacht ? (wacht.fase === 'bezig' ? 'bezig' : 'wacht') : (a.beschikbaar !== 'ok' ? a.beschikbaar : null), actie: 'schakel', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld' }, aria: HV.p(a.naam) }) +
      '<div class="hv-bev-slot__tekst"><p class="hv-bev-slot__woord">' + h(woord) + '</p><p class="hv-bev-slot__naam">' + h(naamKamer(a)) + '</p>' + wie + '</div></div>' +
      '<div class="hv-knoppen hv-bev-slot__knoppen">' + o.knop({ tekst: t('Замкнути', 'Vergrendelen'), icoon: 'lock-keyhole', soort: st.vergrendeld ? 'gewoon' : 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld', waarde: 'true' }, gedrukt: st.vergrendeld && !wacht, k: 'slot-dicht' }) +
      o.knop({ tekst: t('Відімкнути…', 'Ontgrendelen…'), icoon: 'risico-kritiek', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld', waarde: 'false' }, gedrukt: !st.vergrendeld && !wacht, aria: t('Відімкнути — критична дія, з підтвердженням', 'Ontgrendelen — kritieke actie, met bevestiging'), k: 'slot-open' }) + '</div>' +
      '<p class="hv-bev-noot">' + o.risico('kritiek', { lang: true }) + ' ' + h(t('Відмикання — рейка утримання 1,2 с і підтвердження входу; замикання — один дотик, без «Повернути».', 'Ontgrendelen — houdrail 1,2 s en bevestiging van je aanmelding; vergrendelen — één tik, zonder ‘Ongedaan maken’.')) + '</p>';
    var auto = '<div class="hv-bev-schakelrij" data-k="autoslot">' + o.schakel({ aan: st.modus === 'autoslot-aan', icoon: 'timer-reset', toon: 'neutraal', actie: 'bev-autoslot', gegevens: { doel: a.id }, aria: t('Автозамикання', 'Automatisch vergrendelen'), staat: a.wacht && a.wacht.mogelijkheid === 'modus' ? 'wacht' : null }) +
      '<div class="hv-bev-schakelrij__tekst"><span>' + h(t('Автозамикання через 2 хв', 'Automatisch vergrendelen na 2 min')) + '</span><span>' + h(t('Робить сам замок — без хаба й без інтернету.', 'Dat doet het slot zelf — zonder hub en zonder internet.')) + '</span></div>' +
      o.gevolg(t('Що станеться: відімкнені двері замкнуться самі через 2 хв; кожне замикання — запис у Журналі від імені замка. Пов’язано з: якщо двері відчинено, замок чекає, доки їх зачинять. Як повернути: той самий перемикач.', 'Wat er gebeurt: een ontgrendelde deur gaat na 2 min vanzelf op slot; elke keer komt in het logboek namens het slot. Hangt samen met: staat de deur open, dan wacht het slot tot ze dicht is. Terugdraaien: dezelfde schakelaar.'), { kop: t('Автозамикання', 'Automatisch vergrendelen') }) + '</div>';
    var leeg = '<div class="hv-bev-leeg" data-k="slot-leeg"><div class="hv-bev-leeg__kop">' + batterij(a.batterij, { prognose: dagenRest != null ? dagenRest + ' ' + HV.meervoud(dagenRest, ['день', 'дні', 'днів'], ['dag', 'dagen']) : null }) + '</div>' +
      '<h4>' + h(t('Якщо замок розрядився', 'Als het slot leeg is')) + '</h4><ul class="hv-bev-check">' +
      '<li>' + HV.icoon('key-round', { maat: 's' }) + '<span>' + h(t('Механічний ключ — у сейфі для ключів біля гаража; код сейфа знає власник.', 'Mechanische sleutel — in het sleutelkastje bij de garage; de code kent de eigenaar.')) + '</span></li>' +
      '<li>' + HV.icoon('battery-charging', { maat: 's' }) + '<span>' + h(t('Аварійне живлення — батарейка 9 В до контактів під накладкою зовні.', 'Noodvoeding — een 9V-batterij tegen de contacten onder het schild buiten.')) + '</span></li>' +
      '<li>' + HV.icoon('bell', { maat: 's' }) + '<span>' + h(t('Сповіщення — за 15 % і за 5 % заряду.', 'Melding — bij 15 % en bij 5 % lading.')) + '</span></li></ul></div>';
    if (opties && opties.alleenLeeg) return leeg;
    return hoofd + auto + (opties && opties.zonderLeeg ? '' : leeg);
  }

  function oproepBanner(ctx) {
    var w = ctx.staat;
    if (!w.oproep) return '';
    return '<section class="hv-bev-oproepbalk" role="status" data-k="bev-oproepbalk"><div class="hv-bev-oproepbalk__beeld">' + beeld('cameravoor', { k: 'oproep-mini' }) + '</div>' +
      '<div class="hv-bev-oproepbalk__tekst"><h2>' + HV.icoon('bell-ring', { maat: 's' }) + h(t('Хтось біля дверей', 'Er staat iemand voor de deur')) + '</h2><p>' + h(t('дзвонить · ', 'belt aan · ') + HV.oud(w.tijd - w.oproep.sinds) + (zorg(w).oproepAntwoord ? t(' · ви відповіли', ' · je hebt geantwoord') : '')) + '</p></div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Відповісти', 'Opnemen'), icoon: 'message-square', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'oproep' }, k: 'opnemen' }) + (zorg(w).oproepAntwoord ? o.knop({ tekst: t('Завершити', 'Ophangen'), icoon: 'phone-off', actie: 'bev-oproep-einde', gegevens: { uitkomst: 'beantwoord' }, k: 'weigeren' }) : o.knop({ tekst: t('Відхилити', 'Weigeren'), icoon: 'x', actie: 'bev-oproep-einde', gegevens: { uitkomst: 'geweigerd' }, k: 'weigeren' })) + '</div></section>';
  }

  function codeRij(ctx, c) {
    var w = ctx.staat, s = CODE_SOORT[c.soort];
    var verlopen = c.tot != null && c.tot <= w.tijd, ingetrokken = !!c.ingetrokken, actief = !verlopen && !ingetrokken;
    var deuren = c.deuren.map(deurNaam).join(', ');
    var periode = c.tot == null ? t('без строку', 'zonder einddatum') : verlopen ? t('минув ', 'verlopen ') + wanneer(c.tot) : t('до ', 'tot ') + wanneer(c.tot) + ' · ' + t('ще ', 'nog ') + (c.tot - w.tijd > DAG ? dagen(c.tot - w.tijd) + ' ' + HV.meervoud(dagen(c.tot - w.tijd), ['день', 'дні', 'днів'], ['dag', 'dagen']) : HV.duur((c.tot - w.tijd) / MIN));
    var staat = ingetrokken ? t('відкликано', 'ingetrokken') : verlopen ? t('не діє', 'werkt niet meer') : t('діє', 'actief');
    var knop = c.soort === 'mens' ? naar(t('Змінити', 'Wijzigen'), 'instellingen-mensen', t('Змінити особистий код: ', 'Persoonlijke code wijzigen: ') + HV.p(c.naam))
      : actief ? o.knop({ tekst: t('Відкликати', 'Intrekken'), icoon: 'ban', klein: true, actie: 'bev-code-intrek', gegevens: { code: c.id }, aria: t('Відкликати код: ', 'Code intrekken: ') + HV.p(c.naam) }) : '';
    return '<div class="hv-bev-code' + (actief ? '' : ' is-uit') + '" data-k="code-' + c.id + '"><span class="hv-bev-code__teken">' + HV.icoon(s.icoon, { maat: 's' }) + '</span>' +
      '<div class="hv-bev-code__tekst"><span class="hv-bev-code__naam">' + h(HV.p(c.naam)) + ' <span class="hv-bev-code__soort">' + h(HV.p(s.naam)) + '</span></span>' +
      '<span class="hv-bev-code__sub">' + nb([h(deuren), h(c.rooster ? HV.p(c.rooster) : periode), c.laatst ? h(t('востаннє ', 'laatst ') + wanneer(c.laatst)) : '']) + '</span></div>' +
      '<span class="hv-bev-code__staat' + (actief ? ' is-actief' : '') + '">' + h(staat) + '</span>' + knop + '</div>';
  }

  function codesBlok(ctx) {
    var b = zorg(ctx.staat);
    var sjablonen = '<div class="hv-bev-sjablonen">' + ['gast', 'monteur', 'hulp'].map(function (s) { return o.knop({ tekst: HV.p(CODE_SOORT[s].naam), icoon: CODE_SOORT[s].icoon, klein: true, actie: 'bev-gast-start', gegevens: { sjabloon: s }, k: 'sj-' + s }); }).join('') + '</div>';
    var actief = b.codes.filter(function (c) { return !c.ingetrokken && (c.tot == null || c.tot > ctx.staat.tijd); }).length;
    return kaart('hv-bev-codes', kop('key-round', t('Коди й гості', 'Codes en gasten'), o.knop({ tekst: t('Новий код гостя…', 'Nieuwe gastcode…'), icoon: 'user-plus', soort: 'hoofd', klein: true, actie: 'bev-gast-start', gegevens: { sjabloon: 'gast' }, k: 'nieuw-code' }), actief + ' / ' + b.codes.length) +
      '<div class="hv-bev-codelijst">' + b.codes.map(function (c) { return codeRij(ctx, c); }).join('') + '</div>' +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Код гостя — завжди зі строком (типово 24 год, найдовше 30 днів). Код не знімає охорону й не вмикає «Завжди».', 'Een gastcode heeft altijd een einde (standaard 24 u, hoogstens 30 dagen). Een code zet het alarm niet uit en zet geen ‘Altijd’ aan.')) + '</p>' + sjablonen, 'bev-codes');
  }

  function belBlok(ctx) {
    var w = ctx.staat, b = zorg(w), bel = app('deurbel');
    var rijen = b.bezoekers.slice(0, 3).map(function (x) {
      return '<div class="hv-bev-bezoeker" data-k="bz-' + x.id + '"><span class="hv-bev-bezoeker__teken">' + HV.icoon(x.soort === 'pakket' ? 'package' : 'user', { maat: 's' }) + '</span><span class="hv-bev-bezoeker__tekst"><span>' + h(HV.p(x.wie)) + '</span><span>' + nb([h(wanneer(x.tijd)), h(HV.p(x.uitkomst))]) + '</span></span></div>';
    }).join('');
    return kaart('hv-bev-bel', kop('bell-ring', t('Дзвінок і відвідувачі', 'Deurbel en bezoekers'), naar(t('Усі відвідувачі', 'Alle bezoekers'), 'beveiliging-bezoekers')) +
      '<div class="hv-bev-bel__rij">' + beeld('cameravoor', { actie: 'blad', gegevens: { blad: 'oproep' }, k: 'bel-beeld' }) + '<div class="hv-bev-bel__tekst"><p class="hv-bev-bel__woord">' + h(w.oproep ? t('дзвонить зараз', 'belt nu aan') : bel && bel.st.laatst ? t('востаннє о ', 'laatst om ') + HV.tijd(bel.st.laatst) : t('сьогодні тихо', 'vandaag stil')) + '</p>' +
      '<p class="hv-bev-noot">' + h(t('Знімки відвідувачів — 14 днів. Голосова розмова — пізніше: тунель без звуку.', 'Beelden van bezoekers — 14 dagen. Spreken — later: de tunnel heeft geen geluid.')) + '</p>' +
      '<div class="hv-knoppen">' + (w.oproep ? o.knop({ tekst: t('Відповісти', 'Opnemen'), icoon: 'message-square', soort: 'hoofd', klein: true, actie: 'blad', gegevens: { blad: 'oproep' } }) : o.knop({ tekst: t('Перевірити дзвінок', 'Deurbel testen'), icoon: 'bell-ring', klein: true, actie: 'bev-bel', k: 'bel-test' })) + '</div></div></div>' +
      '<div class="hv-bev-bezoekers">' + rijen + '</div>', 'bev-bel');
  }

  function renderToegang(ctx) {
    var w = ctx.staat, A = w.apparaten;
    zorg(w);
    var poorten = kaart('hv-bev-poorten', kop('fence', t('Ворота', 'Poorten')) + '<div class="hv-tegels">' + ['poort', 'garagedeur'].map(function (id) { return o.tegel(A[id], { vorm: '2x1', metKamer: true }); }).join('') + '</div>' +
      '<p class="hv-bev-noot">' + o.risico('kritiek') + ' ' + h(t('Відчинити — рейка й підтвердження; зачинити — відлік 5 с перед рухом.', 'Openen — rail en bevestiging; sluiten — 5 s aftellen vóór het bewegen.')) + '</p>', 'bev-poorten');
    var slot = kaart('hv-bev-slotkaart', kop('lock-keyhole', HV.p(A.voordeurslot.naam), bladKnop(t('Аркуш', 'Blad'), 'apparaat:voordeurslot', 'panel-right', 'stil')) + slotBediening(ctx, A.voordeurslot), 'bev-slotkaart');
    return '<div class="hv-bev" data-k="bev-toegang">' + oproepBanner(ctx) + '<div class="hv-bev-rooster hv-bev-rooster--twee"><div class="hv-bev-kolom">' + slot + poorten + belBlok(ctx) + '</div>' +
      '<div class="hv-bev-kolom">' + codesBlok(ctx) + logBlok(ctx, function (r) { return r.soort === 'huis.toegang' || r.doel === 'voordeurslot' || r.doel === 'poort' || r.doel === 'garagedeur' || r.doel === 'deurbel'; }, t('Аудит доступу', 'Controlespoor toegang')) + '</div></div></div>';
  }

  function renderBezoekers(ctx) {
    var w = ctx.staat, b = zorg(w);
    var rijen = b.bezoekers.map(function (x) {
      var g = { id: x.id, cam: 'cameravoor', soort: x.soort === 'pakket' ? 'pakket' : 'persoon', tekst: x.wie, tijd: x.tijd };
      return '<article class="hv-bev-bezoekkaart" data-k="bzk-' + x.id + '">' + momentBeeld('cameravoor', g) + '<div class="hv-bev-bezoekkaart__tekst"><h3>' + h(HV.p(x.wie)) + '</h3><p>' + nb([h(wanneer(x.tijd)), h(HV.p(x.uitkomst))]) + '</p></div></article>';
    }).join('');
    return '<div class="hv-bev" data-k="bev-bezoekers">' + kaart('', kop('users', t('Відвідувачі', 'Bezoekers'), naar(t('Доступ', 'Toegang'), 'beveiliging-toegang'), b.bezoekers.length) +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Журнал дзвінка: хто дзвонив, що ви відповіли, знімок моменту. Знімки зберігаються 14 днів, облич хаб не розпізнає.', 'Logboek van de deurbel: wie belde, wat je antwoordde, een beeld van het moment. Beelden blijven 14 dagen; de hub herkent geen gezichten.')) + '</p>' +
      '<div class="hv-bev-bezoekrooster">' + rijen + '</div>' + '<div class="hv-knoppen">' + o.knop({ tekst: t('Перевірити дзвінок', 'Deurbel testen'), icoon: 'bell-ring', actie: 'bev-bel' }) + '</div>', 'bev-bezoekers-lijst') + '</div>';
  }

  // ── hv-oproep: виклик із дверей (аркуш поверх будь-якої сторінки) ──
  var ANTWOORDEN = [['bij-deur', ['Залиште біля дверей', 'Zet het maar bij de deur'], 'package'], ['kom-eraan', ['Зараз підійду', 'Ik kom eraan'], 'footprints'], ['moment', ['Хвилинку, будь ласка', 'Een moment, alstublieft'], 'hourglass'], ['niet-thuis', ['Нас немає вдома — заходьте пізніше', 'We zijn niet thuis — kom later terug'], 'calendar-clock']];
  HV.blad({
    soort: 'oproep', vrij: true, icoon: 'bell-ring', titel: ['Виклик із дверей', 'Oproep van de deur'],
    sub: function (ctx) { var w = ctx.staat; return w.oproep ? t('дзвонить · ', 'belt aan · ') + HV.oud(w.tijd - w.oproep.sinds) : t('зараз ніхто не дзвонить', 'er belt nu niemand'); },
    render: function (ctx) {
      var w = ctx.staat, b = zorg(w), A = w.apparaten;
      if (!w.oproep) {
        return o.kaart({ inhoud: o.leeg({ icoon: 'bell', titel: t('Зараз ніхто не дзвонить', 'Er belt nu niemand'), tekst: t('Коли хтось подзвонить, тут з’являться знімок і швидкі відповіді.', 'Als iemand aanbelt, verschijnen hier het beeld en snelle antwoorden.'), actie: { tekst: t('Перевірити дзвінок', 'Deurbel testen'), icoon: 'bell-ring', actie: 'bev-bel' } }) }) +
          o.kaart({ titel: t('Останні відвідувачі', 'Laatste bezoekers'), inhoud: '<div class="hv-bev-bezoekers">' + b.bezoekers.slice(0, 3).map(function (x) { return '<div class="hv-bev-bezoeker"><span class="hv-bev-bezoeker__teken">' + HV.icoon('user', { maat: 's' }) + '</span><span class="hv-bev-bezoeker__tekst"><span>' + h(HV.p(x.wie)) + '</span><span>' + h(wanneer(x.tijd) + ' · ' + HV.p(x.uitkomst)) + '</span></span></div>'; }).join('') + '</div>' });
      }
      var antwoord = b.oproepAntwoord;
      return '<div class="hv-bev-oproep" data-k="oproep">' + beeld('cameravoor', { groot: true, k: 'oproep-beeld' }) +
        '<p class="hv-bev-oproep__status">' + HV.icoon('bell-ring', { maat: 's' }) + '<strong>' + h(antwoord ? t('розмова', 'in gesprek') : t('дзвонить', 'belt aan')) + '</strong> · ' + h(HV.oud(w.tijd - w.oproep.sinds)) + ' · ' + h(t('знімок раз на 1 с', 'beeld elke 1 s')) + '</p>' +
        (antwoord ? '<p class="hv-bev-oproep__antwoord" data-k="antwoord">' + HV.icoon('message-square', { maat: 's' }) + h(t('Ви відповіли: «', 'Je antwoordde: ‘') + HV.p(ANTWOORDEN.filter(function (x) { return x[0] === antwoord; })[0][1]) + t('»', '’') + t(' — показано на дверній панелі.', ' — staat op het deurpaneel.')) + '</p>' : '') +
        '</div>' +
        o.kaart({ titel: t('Швидка відповідь', 'Snel antwoord'), inhoud: '<div class="hv-bev-antwoorden">' + ANTWOORDEN.map(function (x) { return '<button type="button" class="hv-bev-antwoord' + (antwoord === x[0] ? ' is-gekozen' : '') + '" aria-pressed="' + (antwoord === x[0] ? 'true' : 'false') + '" data-actie="bev-oproep-antwoord" data-antwoord="' + x[0] + '" data-k="aw-' + x[0] + '">' + HV.icoon(x[2], { maat: 's' }) + '<span>' + h(HV.p(x[1])) + '</span></button>'; }).join('') + '</div>' +
          '<p class="hv-bev-noot">' + o.later(t('голос — пізніше', 'spreken — later')) + ' ' + h(t('Двобічного звуку немає: тунель не передає звук, мікрофон вимкнено.', 'Geen tweerichtingsgeluid: de tunnel draagt geen geluid, de microfoon staat uit.')) + '</p>' }) +
        o.kaart({ inhoud: '<div class="hv-knoppen hv-bev-oproep__knoppen">' + o.knop({ tekst: t('Відчинити…', 'Openen…'), icoon: 'risico-kritiek', actie: 'bev-oproep-open', aria: t('Відчинити двері — критична дія, з підтвердженням', 'Deur openen — kritieke actie, met bevestiging'), k: 'oproep-open', uit: !A.voordeurslot.st.vergrendeld }) +
          o.knop({ tekst: antwoord ? t('Завершити', 'Ophangen') : t('Відхилити', 'Weigeren'), icoon: 'phone-off', actie: 'bev-oproep-einde', gegevens: { uitkomst: antwoord ? 'beantwoord' : 'geweigerd' }, k: 'oproep-einde' }) + '</div>' +
          '<p class="hv-bev-noot">' + o.risico('kritiek', { lang: true }) + ' ' + h(t('Відчинити можна лише з особистого пристрою: рейка й підтвердження входу. Охорона при цьому не знімається.', 'Openen kan alleen vanaf een persoonlijk apparaat: rail en bevestiging van aanmelding. Het alarm blijft zoals het is.')) + '</p>' });
    }
  });

  // ── Майстер коду гостя: хто → двері → коли → що записується → наслідок → підтвердження ──
  var GAST_NAMEN = {
    gast: [['Ірина', 'Iryna'], ['Бабуся Ганна', 'Oma Hanna'], ['Друг Марка', 'Vriend van Marko']],
    monteur: [['Майстер котла', 'Monteur cv-ketel'], ['Електрик', 'Elektricien'], ['Сантехнік', 'Loodgieter']],
    hulp: [['Прибирання', 'Schoonmaak'], ['Няня', 'Oppas'], ['Вигул собаки', 'Hondenuitlater']]
  };
  var DUREN = [[3, ['3 год', '3 u']], [24, ['24 год', '24 u']], [72, ['3 дні', '3 dagen']], [168, ['7 днів', '7 dagen']], [720, ['30 днів', '30 dagen']]];
  var gastStaat = function () { return HV.ui.lees('bev-gast', null) || { stap: 1, sjabloon: 'gast', naam: 0, deuren: ['voordeur'], duur: 24, gezien: false }; };
  HV.blad({
    soort: 'bevgast', vrij: true, icoon: 'user-plus', titel: ['Новий код гостя', 'Nieuwe gastcode'],
    sub: function () { var g = gastStaat(); return g.stap > 5 ? t('код створено', 'code aangemaakt') : t('крок ', 'stap ') + g.stap + t(' із 5', ' van 5'); },
    render: function (ctx) {
      var w = ctx.staat, g = gastStaat(), naam = GAST_NAMEN[g.sjabloon][g.naam] || GAST_NAMEN[g.sjabloon][0];
      var stappen = [t('Хто', 'Wie'), t('Двері', 'Deuren'), t('Коли', 'Wanneer'), t('Дані', 'Gegevens'), t('Наслідок', 'Gevolg')];
      var balk = '<ol class="hv-bev-stappen" aria-label="' + h(t('Кроки майстра', 'Stappen')) + '">' + stappen.map(function (s, i) { return '<li class="' + (i + 1 === g.stap ? 'is-nu' : i + 1 < g.stap ? 'is-klaar' : '') + '"' + (i + 1 === g.stap ? ' aria-current="step"' : '') + '><span>' + (i + 1 < g.stap ? HV.icoon('check', { maat: 's' }) : i + 1) + '</span>' + h(s) + '</li>'; }).join('') + '</ol>';
      var keuze = function (veld, waarde, opties, multi) { return '<div class="hv-filter" role="group">' + opties.map(function (x) { var gek = multi ? waarde.indexOf(x[0]) >= 0 : String(waarde) === String(x[0]); return o.chip({ filter: true, gekozen: gek, icoon: x[2], tekst: x[1], actie: 'bev-gast-kies', gegevens: { veld: veld, waarde: x[0] }, k: 'gk-' + veld + '-' + x[0] }); }).join('') + '</div>'; };
      var tot = w.tijd + g.duur * UUR;
      var lijf;
      if (g.stap === 1) lijf = veld(t('Шаблон', 'Sjabloon'), o.segment({ label: t('Шаблон', 'Sjabloon'), waarde: g.sjabloon, actie: 'bev-gast-kies', gegevens: { veld: 'sjabloon' }, klas: 'hv-segment--rol', opties: ['gast', 'monteur', 'hulp'].map(function (s) { return { id: s, label: HV.p(CODE_SOORT[s].naam), icoon: CODE_SOORT[s].icoon }; }) })) +
        veld(t('Для кого', 'Voor wie'), keuze('naam', g.naam, GAST_NAMEN[g.sjabloon].map(function (n, i) { return [i, HV.p(n), 'user']; })));
      else if (g.stap === 2) lijf = veld(t('Які двері відмикає код', 'Welke deuren de code opent'), keuze('deuren', g.deuren, DEUREN.map(function (d) { return [d[0], HV.p(d[1]), d[2]]; }), true)) + '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Гаражні ворота відкривають шлях до велосипедів і зарядної станції — додавайте лише за потреби.', 'De garagedeur geeft toegang tot de fietsen en de laadpaal — voeg haar alleen toe als het nodig is.')) + '</p>';
      else if (g.stap === 3) lijf = veld(t('Строк дії (обов’язковий)', 'Geldigheid (verplicht)'), keuze('duur', g.duur, DUREN.map(function (d) { return [d[0], HV.p(d[1]), 'calendar-clock']; }))) + '<p class="hv-bev-tekstgroot">' + h(t('Діє з ', 'Geldig van ') + HV.tijd(w.tijd) + t(' до ', ' tot ') + wanneer(tot)) + '</p>';
      else if (g.stap === 4) lijf = '<ul class="hv-bev-check">' +
        '<li class="is-ok">' + HV.icoon('door-open', { maat: 's' }) + '<span>' + h(t('Кожне відмикання кодом: час і двері — у Журналі 90 днів.', 'Elke keer ontgrendelen met de code: tijd en deur — 90 dagen in het logboek.')) + '</span></li>' +
        '<li class="is-ok">' + HV.icoon('image', { maat: 's' }) + '<span>' + h(t('Знімок із дзвінка, якщо людина дзвонила, — 14 днів.', 'Een beeld van de deurbel als de persoon aanbelde — 14 dagen.')) + '</span></li>' +
        '<li class="is-ok">' + HV.icoon('bot-off', { maat: 's' }) + '<span>' + h(t('Агентам ім’я й код не передаються.', 'Naam en code gaan niet naar agenten.')) + '</span></li></ul>' +
        '<button type="button" class="hv-bev-vink' + (g.gezien ? ' is-aan' : '') + '" aria-pressed="' + (g.gezien ? 'true' : 'false') + '" data-actie="bev-gast-kies" data-veld="gezien" data-waarde="' + (g.gezien ? '' : '1') + '" data-k="gezien">' + HV.icoon(g.gezien ? 'square-check' : 'square', { maat: 's' }) + '<span>' + h(t('Я показав(ла) це людині', 'Ik heb dit aan de persoon laten zien')) + '</span></button>';
      else if (g.stap === 5) lijf = '<div class="hv-bev-overzicht">' + o.rij({ icoon: CODE_SOORT[g.sjabloon].icoon, naam: HV.p(naam), sub: HV.p(CODE_SOORT[g.sjabloon].naam) }) + o.rij({ icoon: 'door-open', naam: t('Двері', 'Deuren'), waarde: h(g.deuren.map(deurNaam).join(', ')) }) + o.rij({ icoon: 'calendar-clock', naam: t('Строк', 'Geldig'), waarde: h(t('до ', 'tot ') + wanneer(tot)) }) + '</div>' +
        '<div class="hv-bev-gevolg">' + o.risico('kritiek', { lang: true }) + o.gevolgRijen(HV.p(HV.gevaar.actie('slot.gastcode').gevolg)) + '</div>';
      else lijf = '<div class="hv-bev-codeklaar" data-k="codeklaar">' + HV.icoon('key-round', { maat: 'l' }) + '<p>' + h(t('Код для ', 'Code voor ') + HV.p(naam)) + '</p><p class="hv-bev-codeklaar__code">' + h(g.code) + '</p><p class="hv-bev-noot">' + h(t('Передайте код людині особисто. Повторно хаб його не покаже — лише відкликати.', 'Geef de code persoonlijk door. De hub toont hem niet opnieuw — je kunt hem alleen intrekken.')) + '</p></div>';
      var knoppen = g.stap > 5 ? o.knop({ tekst: t('Готово', 'Klaar'), soort: 'hoofd', klas: 'hv-knop--breed', actie: 'bev-gast-klaar' }) :
        (g.stap > 1 ? o.knop({ tekst: t('Назад', 'Terug'), icoon: 'chevron-left', actie: 'bev-gast-stap', gegevens: { stap: g.stap - 1 } }) : o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'bev-gast-klaar' })) +
        (g.stap < 5 ? o.knop({ tekst: t('Далі', 'Verder'), icoon: 'chevron-right', soort: 'hoofd', actie: 'bev-gast-stap', gegevens: { stap: g.stap + 1 }, uit: (g.stap === 4 && !g.gezien) || (g.stap === 2 && !g.deuren.length) }) : o.knop({ tekst: t('Створити код…', 'Code aanmaken…'), icoon: 'risico-kritiek', soort: 'hoofd', klas: 'hv-bev-knop-kritiek', actie: 'bev-gast-maak' }));
      return o.kaart({ inhoud: balk }) + o.kaart({ inhoud: lijf, k: 'gast-stap-' + g.stap }) + '<div class="hv-knoppen hv-bev-wizardknoppen">' + knoppen + '</div>';
    }
  });

  // ───────────────────────── 10. Датчики / Sensoren ─────────────────────────
  var GROEPEN = [
    { id: 'rook', icoon: 'alarm-smoke', naam: ['Дим', 'Rook'], soorten: ['rook'] },
    { id: 'co', icoon: 'alarm-smoke', naam: ['Чадний газ', 'Koolmonoxide'], soorten: ['co'] },
    { id: 'lek', icoon: 'droplet', naam: ['Протікання', 'Lekkage'], soorten: ['lek'] },
    { id: 'contact', icoon: 'door-closed', naam: ['Відкриття дверей і вікон', 'Deuren en ramen'], soorten: ['contact'] },
    { id: 'beweging', icoon: 'radar', naam: ['Рух і присутність', 'Beweging en aanwezigheid'], soorten: ['beweging', 'aanwezigheid'] }
  ];
  var isMelder = function (a) { return a.soort === 'rook' || a.soort === 'co' || a.soort === 'lek'; };

  function sensorRij(ctx, a) {
    var m = melderWoord(a), test = getest(a), w = ctx.staat;
    var stand = w.apparaten.alarm.st.stand, z = zoneVan(a);
    var zoneTekst = z ? (z.id === 'altijd' ? t('цілодобово', 'altijd bewaakt') : overbrugd(a) ? t('обійдено', 'overbrugd') : bewaakt(a, stand) ? t('стежить', 'bewaakt') : t('не стежить', 'niet bewaakt')) : '';
    var knop = isMelder(a) ? o.knop({ tekst: a.wacht ? HV.woord.wacht() : t('Перевірити', 'Testen'), icoon: 'bell-ring', klein: true, actie: 'bev-melder-test', gegevens: { doel: a.id }, uit: !!a.wacht, aria: t('Перевірити датчик: ', 'Melder testen: ') + naamKamer(a), k: 'test-' + a.id })
      : o.knop({ tekst: t('Відкрити', 'Openen'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:' + a.id }, aria: t('Відкрити: ', 'Openen: ') + naamKamer(a), k: 'open-' + a.id });
    return '<div class="hv-bev-sensor' + (m.toon ? ' is-' + m.toon : '') + (a.wacht ? ' is-wacht' : '') + '" data-k="sensor-' + h(a.id) + '">' +
      '<button type="button" class="hv-bev-sensor__lijf" data-actie="blad" data-blad="apparaat:' + h(a.id) + '" aria-label="' + h(naamKamer(a) + ': ' + m.woord) + '">' +
      '<span class="hv-bev-sensor__teken">' + HV.icoon(melderIcoon(a), { maat: 's' }) + '</span>' +
      '<span class="hv-bev-sensor__naam"><span>' + h(HV.p(a.naam)) + '</span><span>' + h(kamerNaam(a)) + '</span></span>' +
      '<span class="hv-bev-sensor__woord">' + h(m.woord) + '</span>' +
      '<span class="hv-bev-sensor__meta">' + nb([h(stilte((a)) + t(' тому', ' geleden')), zoneTekst ? h(zoneTekst) : '', isMelder(a) && test ? h(t('перевірено ', 'getest ') + (dagen(w.tijd - test) ? dagen(w.tijd - test) + ' ' + t('дн. тому', 'd geleden') : t('сьогодні', 'vandaag'))) : '']) + '</span></button>' +
      '<span class="hv-bev-sensor__bat">' + batterij(a.batterij) + '</span><span class="hv-bev-sensor__knop">' + knop + '</span></div>';
  }

  function dekking(ctx) {
    var w = ctx.staat, jaar = new Date(w.tijd).getUTCFullYear();
    var rijen = ['beneden', 'boven', 'zolder'].map(function (v) {
      var verdieping = w.verdiepingen.filter(function (x) { return x.id === v; })[0];
      var kamers = w.kamers.filter(function (k) { return k.verdieping === v; }).map(function (k) { return k.id; });
      var rook = HV.kijk.alle(function (a) { return a.soort === 'rook' && kamers.indexOf(a.kamer) >= 0; });
      var co = HV.kijk.alle(function (a) { return a.soort === 'co' && kamers.indexOf(a.kamer) >= 0; });
      var stil = rook.filter(function (a) { return a.beschikbaar !== 'ok'; });
      var toon = !rook.length ? 'let-op' : stil.length ? 'let-op' : 'ok';
      var tekst = !rook.length ? t('датчика диму немає — потрібен: тут спальні', 'geen rookmelder — nodig: hier zijn slaapkamers')
        : stil.length === rook.length ? t('є, але мовчить ', 'aanwezig, maar zwijgt al ') + stilte(stil[0]) + t(' — стан невідомий', ' — toestand onbekend')
          : rook.map(function (a) { return kamerNaam(a).toLowerCase() + (a.beschikbaar !== 'ok' ? t(' (мовчить)', ' (zwijgt)') : ''); }).join(', ');
      return '<li class="is-' + toon + '" data-k="dk-' + v + '">' + HV.icoon(toon === 'ok' ? 'circle-check' : 'triangle-alert', { maat: 's' }) + '<span><strong>' + h(HV.p(verdieping.naam)) + '</strong> · ' + h(t('дим: ', 'rook: ') + tekst) + (co.length ? ' · ' + h(t('чадний газ: є', 'koolmonoxide: ja')) : '') + '</span></li>';
    }).join('');
    var vervang = HV.kijk.alle(function (a) { return isMelder(a) && a.geplaatst; }).filter(function (a) { return a.geplaatst + 10 <= jaar + 1; }).map(function (a) {
      return '<li class="is-let-op" data-k="vv-' + a.id + '">' + HV.icoon('calendar-clock', { maat: 's' }) + '<span>' + h(naamKamer(a) + t(': встановлено ', ': geplaatst ') + a.geplaatst + t(' — заміна до ', ' — vervangen vóór ') + (a.geplaatst + 10) + t(' (строк служби 10 років)', ' (levensduur 10 jaar)')) + '</span></li>';
    }).join('');
    return kaart('hv-bev-dekking', kop('map', t('Тест і покриття', 'Test en dekking'), naar(t('План', 'Plattegrond'), 'kamers-plattegrond')) +
      '<ul class="hv-bev-check">' + rijen + vervang + '</ul>' +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('З 1 липня 2022 року в Нідерландах датчик диму обов’язковий на кожному поверсі з житловою кімнатою. Перевіряйте датчики щомісяця кнопкою «Перевірити».', 'Sinds 1 juli 2022 is in Nederland een rookmelder verplicht op elke verdieping met een verblijfsruimte. Test de melders elke maand met ‘Testen’.')) + '</p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Навчальна тривога: дим', 'Oefenalarm: rook'), icoon: 'alarm-smoke', actie: 'bev-oefen', gegevens: { soort: 'rook' }, k: 'oefen-rook' }) + o.knop({ tekst: t('Навчальна тривога: вода', 'Oefenalarm: water'), icoon: 'droplet', actie: 'bev-oefen', gegevens: { soort: 'lek' }, k: 'oefen-lek' }) + '</div>', 'bev-dekking');
  }

  function renderSensoren(ctx) {
    var w = ctx.staat;
    zorg(w);
    var alle = HV.kijk.alle(function (a) { return GROEPEN.some(function (g) { return g.soorten.indexOf(a.soort) >= 0; }); });
    var stil = alle.filter(function (a) { return a.beschikbaar !== 'ok' && a.beschikbaar !== 'slaapt'; }).length, leeg = alle.filter(function (a) { return a.batterij != null && a.batterij < 15; }).length;
    var alarm = alle.filter(function (a) { return a.st.alarm; }).length;
    var samen = kaart('hv-bev-samen', '<div class="hv-bev-tellers">' +
      o.getal({ maat: 'm', label: t('Датчиків', 'Melders'), waarde: HV.getal(alle.length) }) +
      o.getal({ maat: 'm', label: t('Тривога', 'Alarm'), waarde: HV.getal(alarm), toon: alarm ? 'alarm' : null }) +
      o.getal({ maat: 'm', label: t('Мовчать', 'Zwijgen'), waarde: HV.getal(stil) }) +
      o.getal({ maat: 'm', label: t('Батарейка < 15 %', 'Batterij < 15 %'), waarde: HV.getal(leeg) }) + '</div>' +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Поріг батарейки — 15 %. Датчик застаріває: замок і охорона — за 5 хв, відкриття — за 15 хв, дим — без сигналу 24 год.', 'Batterijdrempel 15 %. Verouderd: slot en alarm na 5 min, contacten na 15 min, rook zonder hartslag na 24 u.')) + ' ' + naar(t('Обслуговування', 'Onderhoud'), 'activiteit-onderhoud') + '</p>', 'bev-samen');
    var blokken = GROEPEN.map(function (g) {
      var l = alle.filter(function (a) { return g.soorten.indexOf(a.soort) >= 0; });
      if (!l.length) return '';
      return kaart('hv-bev-groep', kop(g.icoon, HV.p(g.naam), null, l.length) + '<div class="hv-bev-sensoren">' + l.map(function (a) { return sensorRij(ctx, a); }).join('') + '</div>', 'groep-' + g.id);
    }).join('');
    return '<div class="hv-bev" data-k="bev-sensoren">' + samen + '<div class="hv-bev-rooster hv-bev-rooster--twee"><div class="hv-bev-kolom">' + blokken + '</div><div class="hv-bev-kolom">' + dekking(ctx) + '</div></div></div>';
  }

  // ───────────────────────── 11. Перевірка / Controle ─────────────────────────
  /** Пункти перевірки: { id, ok, groep:'zelf'|'jij'|'onbekend', icoon, tekst, fix:{doel,mogelijkheid,waarde}|{stand}|null, blad } */
  function controleLijst(ctx, soort) {
    var w = ctx.staat, A = w.apparaten, uit = [];
    var doelStand = soort === 'vertrek' ? 'volledig' : 'nacht';
    uit.push({ id: 'slot', ok: !!A.voordeurslot.st.vergrendeld, groep: 'zelf', icoon: 'lock-keyhole', tekst: A.voordeurslot.st.vergrendeld ? t('Вхідні двері замкнено', 'De voordeur is vergrendeld') : t('Вхідні двері відімкнено', 'De voordeur is ontgrendeld'), fix: { doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: true }, label: t('Замкнути', 'Vergrendelen') });
    ['poort', 'garagedeur'].forEach(function (id) { uit.push({ id: id, ok: !A[id].st.open, groep: 'zelf', icoon: o.beeld(A[id]).icoon, tekst: HV.p(A[id].naam) + ': ' + (A[id].st.open ? HV.woord.open() : HV.woord.dicht()), fix: { doel: id, mogelijkheid: 'open', waarde: false }, label: t('Зачинити', 'Sluiten') }); });
    HV.kijk.alle(function (a) { return a.soort === 'contact'; }).forEach(function (a) {
      if (!isOpen(a)) return;
      uit.push({ id: a.id, ok: false, groep: 'jij', icoon: 'door-open', tekst: HV.p(a.naam) + ' ' + HV.p(HV.staat.kamer(a.kamer).waar) + ': ' + (a.st.kiep && !a.st.open ? t('на провітрюванні', 'op de kiepstand') : HV.woord.open()), sub: t('Хаб не зачиняє вікна — зробіть це самі.', 'De hub sluit geen ramen — doe dat zelf.'), blad: 'apparaat:' + a.id });
    });
    if (A.oven) uit.push({ id: 'oven', ok: !A.oven.st.aan, groep: 'zelf', icoon: 'cooking-pot', tekst: A.oven.st.aan ? t('Духовка гріє', 'De oven staat aan') : t('Духовку вимкнено', 'De oven is uit'), fix: { doel: 'oven', mogelijkheid: 'aan', waarde: false }, label: t('Вимкнути', 'Uitzetten') });
    if (soort === 'vertrek') {
      var n = HV.kijk.lampenAan().length;
      uit.push({ id: 'licht', ok: n === 0, groep: 'zelf', icoon: 'lightbulb', tekst: n ? t('Світло ввімкнено: ', 'Lampen aan: ') + n : t('Світло всюди вимкнено', 'Overal is het licht uit'), fix: { doel: 'alle', mogelijkheid: 'licht', waarde: false }, label: t('Вимкнути все', 'Alles uit') });
    }
    var ng = nietGereed(doelStand).length;
    var stand = A.alarm.st.stand;
    uit.push({ id: 'alarm', ok: stand === doelStand || (soort === 'avond' && stand === 'volledig'), groep: ng && stand !== doelStand ? 'jij' : 'zelf', icoon: STAND[doelStand].icoon, tekst: HV.p(HV.alarmWoord[stand]) + (stand === doelStand ? '' : t(' · варто: «', ' · beter: ‘') + HV.p(STAND[doelStand].woord).toLowerCase() + t('»', '’')),
      sub: ng && stand !== doelStand ? t('Спершу зачиніть відчинене або обійдіть його.', 'Sluit eerst wat open staat of overbrug het.') : '', fix: ng ? null : { stand: doelStand }, label: t('Поставити', 'Inschakelen'), blad: ng ? 'bevgereed:' + doelStand : null });
    HV.kijk.alle(function (a) { return isBev(a) && a.beschikbaar === 'verouderd'; }).forEach(function (a) {
      uit.push({ id: 'stil-' + a.id, ok: false, groep: 'onbekend', icoon: melderIcoon(a), tekst: naamKamer(a) + t(': мовчить ', ': zwijgt al ') + stilte((a)), sub: t('Стан невідомий — натисніть «Перевірити» в аркуші датчика.', 'Toestand onbekend — tik op ‘Testen’ in het blad van de melder.'), blad: 'apparaat:' + a.id });
    });
    if (soort === 'vertrek') uit.push({ id: 'prive', ok: true, groep: 'zelf', icoon: 'eye', tekst: t('Внутрішня камера ввімкнеться, коли всі підуть', 'De binnencamera gaat aan als iedereen weg is') });
    return uit;
  }
  function renderControle(ctx) {
    var soort = ctx.route.object === 'vertrek' ? 'vertrek' : 'avond';
    var lijst = controleLijst(ctx, soort);
    var groep = function (id, titel, icoon, uitleg) {
      var l = lijst.filter(function (x) { return !x.ok && x.groep === id; });
      if (!l.length) return '';
      return kaart('hv-bev-cgroep hv-bev-cgroep--' + id, kop(icoon, titel, null, l.length) + (uitleg ? '<p class="hv-bev-noot">' + h(uitleg) + '</p>' : '') + '<div class="hv-bev-citems">' + l.map(function (x) {
        return '<div class="hv-bev-citem" data-k="ci-' + x.id + '"><span class="hv-bev-citem__teken">' + HV.icoon(x.icoon, { maat: 's' }) + '</span><span class="hv-bev-citem__tekst"><span>' + h(x.tekst) + '</span>' + (x.sub ? '<span>' + h(x.sub) + '</span>' : '') + '</span>' +
          (x.fix ? o.knop({ tekst: x.label, klein: true, soort: 'gewoon', actie: 'bev-controle-fix', gegevens: { soort: soort, item: x.id }, k: 'cf-' + x.id }) : x.blad ? o.knop({ tekst: t('Відкрити', 'Openen'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: x.blad }, k: 'cb-' + x.id }) : '') + '</div>';
      }).join('') + '</div>', 'cg-' + id);
    };
    var goed = lijst.filter(function (x) { return x.ok; });
    var zelf = lijst.filter(function (x) { return !x.ok && x.groep === 'zelf' && x.fix; }).length;
    var titel = soort === 'vertrek' ? t('Перед виходом', 'Vertrekcontrole') : t('Вечірня перевірка', 'Avondcontrole');
    var kopHtml = '<div class="hv-bev-ckop" data-k="ckop"><span class="hv-bev-ckop__teken">' + HV.icoon(soort === 'vertrek' ? 'log-out' : 'moon', { maat: 'l' }) + '</span><div><h2>' + h(titel) + '</h2><p>' + h(lijst.length - goed.length ? (lijst.length - goed.length) + ' ' + t('із ', 'van de ') + lijst.length + t(' просять уваги', ' vragen aandacht') : t('Усе гаразд — можна йти спати спокійно.', 'Alles in orde.')) + '</p></div>' +
      (zelf ? o.knop({ tekst: t('Виправити все можливе', 'Alles herstellen wat kan') + ' · ' + zelf, icoon: 'wand-sparkles', soort: 'hoofd', actie: 'bev-controle-alles', gegevens: { soort: soort }, k: 'c-alles' }) : '') + '</div>';
    var ander = soort === 'vertrek' ? naar(t('Вечірня перевірка', 'Avondcontrole'), 'beveiliging-controle-avond') : naar(t('Перед виходом', 'Vertrekcontrole'), 'beveiliging-controle-vertrek');
    return '<div class="hv-bev hv-bev-controlepagina" data-k="bev-controle-' + soort + '">' + kaart('', kopHtml, 'ckop-kaart') +
      groep('zelf', t('Виправлю сам', 'Herstel ik zelf'), 'wand-sparkles', t('Хаб може зробити це за вас: окремо або все разом. Відмикання й зняття охорони тут не трапляються ніколи.', 'De hub kan dit voor je doen: los of alles tegelijk. Ontgrendelen of het alarm uitzetten zit hier nooit bij.')) +
      groep('jij', t('Зробіть самі', 'Doe dit zelf'), 'hand', '') + groep('onbekend', t('Невідомо', 'Onbekend'), 'circle-help', '') +
      (goed.length ? kaart('hv-bev-cgroep hv-bev-cgroep--goed', kop('circle-check', t('Гаразд', 'In orde'), ander, goed.length) + '<ul class="hv-bev-check">' + goed.map(function (x) { return '<li class="is-ok" data-k="ok-' + x.id + '">' + HV.icoon('circle-check', { maat: 's' }) + '<span>' + h(x.tekst) + '</span></li>'; }).join('') + '</ul>', 'cg-goed') : '') + '</div>';
  }

  // ───────────────────────── 12. Аркуші пристроїв ─────────────────────────
  function hoofdMelder(a, extra) {
    var m = melderWoord(a);
    return '<div class="hv-bediening__hoofd hv-bev-hoofd' + (m.toon ? ' is-' + m.toon : '') + '" data-k="hoofd">' + o.schakel({ aan: !!a.st.alarm || (a.soort === 'contact' && isOpen(a)), icoon: melderIcoon(a), toon: m.toon === 'alarm' ? 'alarm' : 'neutraal', staat: a.wacht ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : null), aria: HV.p(a.naam) + ': ' + m.woord }) +
      '<div><p class="hv-bediening__woord">' + h(m.woord) + '</p><p class="hv-bev-hoofd__sub">' + nb([h(kamerNaam(a)), h(stilte((a)) + t(' тому', ' geleden'))]) + '</p></div>' + (extra || '') + '</div>';
  }
  var MELDER_TEKST = {
    rook: ['Хаб не замінює звук датчика й не будить. Датчик пищить сам — навіть без хаба й без інтернету.', 'De hub vervangt het geluid van de melder niet en maakt je niet wakker. De melder piept zelf — ook zonder hub en zonder internet.'],
    co: ['Під час тривоги чадного газу: вийдіть надвір і не торкайтеся вимикачів. Хаб лише сповіщає.', 'Bij een koolmonoxidealarm: ga naar buiten en raak geen schakelaars aan. De hub waarschuwt alleen.'],
    lek: ['Що зробить хаб: зупинить пральну машину. Клапана на воді в домі немає — перекрийте кран самі.', 'Wat de hub doet: de wasmachine stoppen. Er is geen waterklep in huis — draai de kraan zelf dicht.']
  };
  function melderBediening(ctx, a) {
    var w = ctx.staat, test = getest(a), jaar = new Date(w.tijd).getUTCFullYear();
    var getallen = '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Батарея', 'Batterij'), waarde: a.batterij != null ? HV.maat(a.batterij, '%') : '—', sub: a.batterij != null && a.batterij < 30 ? h(t('замініть скоро', 'binnenkort vervangen')) : '' }) +
      o.getal({ maat: 'm', label: t('Перевірено', 'Getest'), waarde: test ? h(dagen(w.tijd - test) ? dagen(w.tijd - test) + ' ' + t('дн.', 'd') : t('сьогодні', 'vandaag')) : '—', sub: test ? h(dagen(w.tijd - test) > 31 ? t('давніше за місяць', 'langer dan een maand') : t('тому', 'geleden')) : '' }) +
      (a.geplaatst ? o.getal({ maat: 'm', label: t('Заміна', 'Vervangen'), waarde: h(String(a.geplaatst + 10)), sub: h(t('встановлено ', 'geplaatst ') + a.geplaatst), toon: a.geplaatst + 10 <= jaar + 1 ? 'let-op' : null }) : '') + '</div>';
    var knoppen = '<div class="hv-knoppen">' + o.knop({ tekst: a.wacht ? HV.woord.wacht() : t('Перевірити датчик', 'Melder testen'), icoon: 'bell-ring', soort: 'hoofd', actie: 'bev-melder-test', gegevens: { doel: a.id }, uit: !!a.wacht, k: 'mtest' }) +
      (a.soort === 'rook' || a.soort === 'lek' ? o.knop({ tekst: t('Навчальна тривога', 'Oefenalarm'), icoon: 'flask-conical', actie: 'bev-oefen', gegevens: { soort: a.soort, doel: a.id }, k: 'moefen' }) : '') + bladKnop(t('Зона «Цілодобові»', 'Zone ‘Altijd bewaakt’'), 'bevzone:altijd', 'layers', 'stil') + '</div>';
    var waarschuwing = a.beschikbaar === 'verouderd' ? '<p class="hv-bev-melding is-let-op">' + HV.icoon('triangle-alert', { maat: 's' }) + '<span>' + h(t('Датчик мовчить ', 'De melder zwijgt al ') + stilte((a)) + t('. Стан невідомий: перевірте батарейку (', '. Toestand onbekend: controleer de batterij (') + (a.batterij != null ? a.batterij + ' %' : '—') + t(') і натисніть «Перевірити датчик».', ') en tik op ‘Melder testen’.')) + '</span></p>' : '';
    return o.kaart({ inhoud: hoofdMelder(a) + waarschuwing + '<p class="hv-bev-melding">' + HV.icoon(a.soort === 'lek' ? 'droplet' : 'badge-info', { maat: 's' }) + '<span>' + h(HV.p(MELDER_TEKST[a.soort])) + '</span></p>' + getallen + knoppen });
  }
  function sensorBediening(ctx, a) {
    var w = ctx.staat, z = zoneVan(a), stand = w.apparaten.alarm.st.stand;
    var drie = a.raam ? '<div class="hv-bev-drie" role="img" aria-label="' + h(t('Стан вікна: ', 'Stand van het raam: ') + melderWoord(a).woord) + '" data-k="drie">' + [['dicht', t('зачинено', 'dicht'), 'square'], ['kiep', t('провітрювання', 'kiepstand'), 'panel-top-open'], ['open', t('відчинено', 'open'), 'door-open']].map(function (x) {
      var nu = a.st.open ? 'open' : a.st.kiep ? 'kiep' : 'dicht';
      return '<span class="hv-bev-drie__deel' + (nu === x[0] ? ' is-nu' : '') + '">' + HV.icoon(x[2], { maat: 's' }) + '<span>' + h(x[1]) + '</span></span>';
    }).join('') + '</div>' : '';
    var zoneRij = z ? o.rij({ icoon: z.icoon, naam: t('Зона: ', 'Zone: ') + HV.p(z.naam), sub: z.id === 'altijd' ? t('цілодобово', 'altijd bewaakt') : bewaakt(a, stand) ? t('стежить у режимі «', 'bewaakt in de stand ‘') + HV.p(STAND[stand].woord).toLowerCase() + t('»', '’') : t('зараз не стежить', 'nu niet bewaakt'), actie: 'blad', gegevens: { blad: 'bevzone:' + z.id } }) : '';
    var ob = z && z.id !== 'altijd' && a.mog.indexOf('modus') >= 0 ? '<div class="hv-bev-schakelrij" data-k="overbrug">' + o.schakel({ aan: overbrugd(a), icoon: 'shield-alert', toon: 'neutraal', actie: 'bev-overbrug', gegevens: { doel: a.id, waarde: overbrugd(a) ? 'zone-actief' : 'zone-overbrugd' }, aria: t('Обійти в охороні', 'Overbruggen'), staat: a.wacht ? 'wacht' : null }) +
      '<div class="hv-bev-schakelrij__tekst"><span>' + h(t('Обійти в охороні', 'Overbruggen in het alarm')) + '</span><span>' + h(overbrugd(a) ? t('Захист послаблено: охорона не реагує на цей датчик до зняття.', 'Bescherming verlaagd: het alarm reageert niet op deze melder tot het uit gaat.') : t('Охорона не реагуватиме на цей датчик до зняття.', 'Het alarm reageert niet op deze melder tot het uit gaat.')) + '</span></div>' +
      o.gevolg(t('Що станеться: охорона не підніматиме тривоги від цього датчика, доки її не знімуть; у герої з’явиться чип «захист послаблено». Пов’язано з: чутлива дія, запис у Журналі. Як повернути: той самий перемикач або зняття охорони.', 'Wat er gebeurt: het alarm reageert niet op deze melder tot het uit gaat; bovenaan staat ‘bescherming verlaagd’. Hangt samen met: gevoelige actie, regel in het logboek. Terugdraaien: dezelfde schakelaar of het alarm uitzetten.'), { kop: t('Обхід датчика', 'Melder overbruggen') }) + '</div>' : '';
    return o.kaart({ inhoud: hoofdMelder(a) + drie + '<div class="hv-rijen">' + zoneRij + o.rij({ icoon: 'battery', naam: t('Батарея', 'Batterij'), waarde: batterij(a.batterij) }) + '</div>' + ob });
  }

  HV.blad({ soort: 'slot', past: function (a) { return a.soort === 'slot'; }, delen: { bediening: function (ctx, a) { return o.kaart({ inhoud: slotBediening(ctx, a, { zonderLeeg: true }) }) + o.kaart({ inhoud: slotBediening(ctx, a, { alleenLeeg: true }) }) + logBlok(ctx, function (r) { return r.doel === a.id; }, t('Хто замикав і відмикав', 'Wie vergrendelde en ontgrendelde')); } } });

  HV.blad({ soort: 'alarmsysteem', past: function (a) { return a.soort === 'alarmsysteem'; }, delen: { bediening: function (ctx, a) {
    var w = ctx.staat, b = zorg(w), sirene = a.st.modus === 'alarm-sirenetest';
    var zones = '<div class="hv-rijen">' + ZONES.map(function (z) { var l = leden(z); return o.rij({ icoon: z.icoon, naam: HV.p(z.naam), sub: l.length + ' ' + HV.meervoud(l.length, ['датчик', 'датчики', 'датчиків'], ['melder', 'melders']) + (l.filter(overbrugd).length ? t(' · обійдено ', ' · overbrugd ') + l.filter(overbrugd).length : ''), actie: 'blad', gegevens: { blad: 'bevzone:' + z.id }, k: 'az-' + z.id }); }).join('') + '</div>';
    return alarmBanner(ctx) + o.kaart({ inhoud: '<div class="hv-bev-bladschild">' + schild(a.st.stand, { alarm: !!b.alarm, uitloop: !!b.uitloop }) + '<div><p class="hv-bev-held__kicker">' + h(t('Охорона', 'Alarm')) + '</p><p class="hv-bev-bladschild__woord">' + h(a.wacht ? HV.woord.wacht() : HV.p(STAND[a.st.stand].woord)) + '</p></div></div>' + standen(ctx, { smal: true }) }) +
      o.kaart({ titel: t('Зони', 'Zones'), inhoud: zones }) +
      o.kaart({ titel: t('Сирена', 'Sirene'), inhoud: '<p class="hv-bev-melding">' + HV.icoon(sirene ? 'volume-2' : 'siren', { maat: 's' }) + '<span>' + h(sirene ? t('Сирена звучить — перевірка, 3 с.', 'De sirene klinkt — test, 3 s.') : t('Сирена тиха. У чинному адаптері вона лише для читання: перевірку показано в симуляції.', 'De sirene is stil. In de huidige adapter is ze alleen-lezen: de test is gesimuleerd.')) + '</span></p>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Перевірити сирену…', 'Sirene testen…'), icoon: 'risico-gevaarlijk', actie: 'bev-sirenetest', uit: sirene, k: 'sirenetest' }) + '</div>' + noodknop() });
  } } });

  HV.blad({ soort: 'camera', past: function (a) { return a.soort === 'camera'; }, delen: { bediening: function (ctx, a) {
    var b = zorg(ctx.staat), dicht = camDicht(a);
    var ev = b.gebeurtenissen.filter(function (g) { return g.cam === a.id; }).slice(0, 3);
    return o.kaart({ inhoud: beeld(a.id, { groot: true, maskers: true, k: 'blad-' + a.id }) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити камеру', 'Camera openen'), icoon: 'maximize-2', soort: 'hoofd', actie: 'ga', gegevens: { naar: 'beveiliging-camera-' + a.id } }) +
      o.knop({ tekst: a.st.modus === 'cam-prive' ? t('Увімкнути', 'Aanzetten') : t('Вимкнути', 'Uitzetten'), icoon: a.st.modus === 'cam-prive' ? 'video' : 'video-off', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'modus', waarde: a.st.modus === 'cam-prive' ? 'cam-actief' : 'cam-prive' } }) +
      (a.binnen && dicht && a.st.modus !== 'cam-prive' ? o.knop({ tekst: t('Переглянути 30 хв…', '30 min meekijken…'), icoon: 'eye', actie: 'bev-meekijken', gegevens: { doel: a.id } }) : '') + '</div>' }) +
      (a.binnen ? o.kaart({ inhoud: priveKaart(ctx) }) : '') +
      o.kaart({ titel: t('Останні події', 'Laatste gebeurtenissen'), inhoud: ev.length ? '<div class="hv-bev-evs">' + ev.map(function (g) { return '<button type="button" class="hv-bev-ev" data-actie="bev-moment" data-id="' + h(g.id) + '"><span class="hv-bev-ev__tijd">' + h(wanneer(g.tijd)) + '</span><span class="hv-bev-ev__teken">' + HV.icoon(GEBEURTENIS[g.soort].icoon, { maat: 's' }) + '</span><span class="hv-bev-ev__wat">' + h(HV.p(g.tekst)) + '</span>' + HV.icoon('chevron-right', { maat: 's', klas: 'hv-bev-ev__pijl' }) + '</button>'; }).join('') + '</div>' : o.leeg({ icoon: 'scan-eye', titel: t('За добу подій немає', 'Geen gebeurtenissen in het etmaal') }) });
  } } });

  HV.blad({ soort: 'deurbel', past: function (a) { return a.soort === 'deurbel'; }, delen: { bediening: function (ctx, a) {
    var w = ctx.staat, b = zorg(w);
    return o.kaart({ inhoud: beeld('cameravoor', { groot: true, actie: 'blad', gegevens: { blad: 'oproep' }, k: 'belblad' }) + '<p class="hv-bev-melding">' + HV.icoon('bell-ring', { maat: 's' }) + '<span>' + h(w.oproep ? t('Дзвонить зараз — відкрийте виклик.', 'Er belt nu iemand — open de oproep.') : a.st.laatst ? t('Востаннє дзвонили о ', 'Laatst aangebeld om ') + HV.tijd(a.st.laatst) + '.' : t('Сьогодні ніхто не дзвонив.', 'Vandaag belde niemand aan.')) + '</span></p>' +
      '<div class="hv-knoppen">' + (w.oproep ? o.knop({ tekst: t('Відповісти', 'Opnemen'), icoon: 'message-square', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'oproep' } }) : o.knop({ tekst: t('Перевірити дзвінок', 'Deurbel testen'), icoon: 'bell-ring', soort: 'hoofd', actie: 'bev-bel' })) + o.knop({ tekst: t('Відвідувачі', 'Bezoekers'), icoon: 'users', actie: 'ga', gegevens: { naar: 'beveiliging-bezoekers' } }) + '</div>' }) +
      o.kaart({ titel: t('Останні відвідувачі', 'Laatste bezoekers'), inhoud: '<div class="hv-bev-bezoekers">' + b.bezoekers.slice(0, 3).map(function (x) { return '<div class="hv-bev-bezoeker"><span class="hv-bev-bezoeker__teken">' + HV.icoon(x.soort === 'pakket' ? 'package' : 'user', { maat: 's' }) + '</span><span class="hv-bev-bezoeker__tekst"><span>' + h(HV.p(x.wie)) + '</span><span>' + h(wanneer(x.tijd) + ' · ' + HV.p(x.uitkomst)) + '</span></span></div>'; }).join('') + '</div>' });
  } } });

  HV.blad({ soort: 'veiligmelder', past: function (a) { return isMelder(a); }, delen: { bediening: melderBediening } });
  HV.blad({ soort: 'veiligsensor', past: function (a) { return a.soort === 'contact' || a.soort === 'beweging'; }, delen: { bediening: sensorBediening } });

  // ── Вільні аркуші: «Не готово», зона ──
  HV.blad({
    soort: 'bevgereed', vrij: true, icoon: 'shield-alert',
    titel: function (ctx, stand) { var n = nietGereed(stand || 'nacht').length; return n ? t('Не готово: ', 'Niet gereed: ') + n + ' ' + t('відчинено', 'open') : t('Готово до постановки', 'Klaar om in te schakelen'); },
    sub: function (ctx, stand) { return HV.p(HV.alarmWoord[STAND[stand] ? stand : 'nacht']); },
    render: function (ctx, stand) {
      stand = STAND[stand] ? stand : 'nacht';
      var ng = nietGereed(stand), kanAlles = ng.length && ng.every(function (x) { return x.kan !== 'dicht'; });
      var rijen = ng.map(function (x) {
        var a = x.apparaat, m = melderWoord(a);
        var knop = x.kan === 'overbruggen' ? o.knop({ tekst: t('Обійти', 'Overbruggen'), icoon: 'shield-alert', klein: true, actie: 'bev-overbrug', gegevens: { doel: a.id, waarde: 'zone-overbrugd' } })
          : x.kan === 'sluiten' ? o.knop({ tekst: t('Зачинити', 'Sluiten'), icoon: 'arrow-down-to-line', klein: true, actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'open', waarde: 'false' } })
            : '<span class="hv-bev-waarde is-let-op">' + h(t('зачиніть самі', 'zelf sluiten')) + '</span>';
        return '<div class="hv-bev-citem" data-k="ng-' + a.id + '"><span class="hv-bev-citem__teken">' + HV.icoon(melderIcoon(a), { maat: 's' }) + '</span><span class="hv-bev-citem__tekst"><span>' + h(naamKamer(a)) + '</span><span>' + h(m.woord + (a.st.kiep && stand === 'volledig' ? t(' — у «повній» провітрювання не допускається', ' — in ‘volledig’ mag de kiepstand niet') : '')) + '</span></span>' + knop + '</div>';
      }).join('');
      if (!ng.length) return o.kaart({ inhoud: o.leeg({ icoon: 'shield-check', titel: t('Усе зачинено або обійдено', 'Alles is dicht of overbrugd'), tekst: t('Можна ставити — почнеться відлік виходу 60 с.', 'Je kunt inschakelen — de vertrektijd van 60 s begint.'), actie: { tekst: t('Поставити: ', 'Inschakelen: ') + HV.p(STAND[stand].woord).toLowerCase(), soort: 'hoofd', actie: 'bev-stand', gegevens: { waarde: stand } } }) });
      return o.kaart({ inhoud: '<p class="hv-bev-melding is-let-op">' + HV.icoon('triangle-alert', { maat: 's' }) + '<span>' + h(t('Охорона не стане, доки щось відчинене не зачинять або не обійдуть. Обхід — чутлива дія: захист послаблено до зняття охорони.', 'Het alarm gaat niet aan zolang iets open staat, tenzij je het sluit of overbrugt. Overbruggen is gevoelig: de bescherming is verlaagd tot het alarm uit gaat.')) + '</span></p><div class="hv-bev-citems">' + rijen + '</div>' }) +
        '<div class="hv-knoppen hv-bev-wizardknoppen">' + (kanAlles ? o.knop({ tekst: t('Обійти й поставити…', 'Overbruggen en inschakelen…'), icoon: 'shield-check', soort: 'hoofd', actie: 'bev-gereed-alles', gegevens: { stand: stand } }) : '') +
        (stand === 'volledig' ? o.knop({ tekst: t('Поставити «нічну» замість', 'Liever ‘nachtstand’'), icoon: 'bed-double', actie: 'bev-stand', gegevens: { waarde: 'nacht' } }) : '') + o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'blad-sluit' }) + '</div>';
    }
  });
  HV.blad({
    soort: 'bevzone', vrij: true, icoon: function (ctx, id) { var z = ZONES.filter(function (x) { return x.id === id; })[0]; return z ? z.icoon : 'layers'; },
    titel: function (ctx, id) { var z = ZONES.filter(function (x) { return x.id === id; })[0] || ZONES[0]; return t('Зона: ', 'Zone: ') + HV.p(z.naam); },
    sub: function (ctx, id) { var z = ZONES.filter(function (x) { return x.id === id; })[0] || ZONES[0]; return HV.p(z.wat); },
    render: function (ctx, id) {
      var z = ZONES.filter(function (x) { return x.id === id; })[0] || ZONES[0], b = zorg(ctx.staat), cfg = b.zones[z.id], stand = ctx.staat.apparaten.alarm.st.stand;
      var mag = ctx.rol === 'eigenaar' || ctx.rol === 'bewoner';
      var seg = function (veld, label, opties) { return veld === 'x' ? '' : '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + '</span>' + o.segment({ label: label, waarde: cfg[veld], actie: 'bev-zone', gegevens: { zone: z.id, veld: veld }, uit: !mag, opties: opties }) + '</div>'; };
      var sch = function (veld, label, sub) { return '<div class="hv-bev-schakelrij">' + o.schakel({ aan: !!cfg[veld], icoon: veld === 'stil' ? 'volume-x' : 'git-compare', toon: 'neutraal', actie: mag ? 'bev-zone' : null, gegevens: { zone: z.id, veld: veld, waarde: cfg[veld] ? '' : '1' }, aria: label }) + '<div class="hv-bev-schakelrij__tekst"><span>' + h(label) + '</span><span>' + h(sub) + '</span></div></div>'; };
      var instel = (z.id === 'schil' ? seg('vertraging', t('Затримка входу', 'Inlooptijd'), [0, 15, 30, 45].map(function (s) { return { id: s, label: s ? s + ' ' + t('с', 's') : t('немає', 'geen') }; })) : '') +
        seg('sirene', t('Сирена', 'Sirene'), [1, 3].map(function (m) { return { id: m, label: m + ' ' + t('хв', 'min') }; })) +
        sch('stil', t('Тиха тривога', 'Stil alarm'), t('Без сирени: лише сповіщення дорослим і світло.', 'Zonder sirene: alleen meldingen aan volwassenen en licht.')) +
        (z.id !== 'altijd' ? sch('kruis', t('Перехресна перевірка', 'Kruiscontrole'), t('Тривога лише коли спрацюють два датчики за 60 с — менше хибних тривог.', 'Alarm pas als twee melders binnen 60 s reageren — minder vals alarm.')) : '');
      var lijst = leden(z).map(function (a) {
        var m = melderWoord(a);
        return '<div class="hv-bev-citem" data-k="zl-' + a.id + '"><span class="hv-bev-citem__teken">' + HV.icoon(melderIcoon(a), { maat: 's' }) + '</span><button type="button" class="hv-bev-citem__tekst hv-bev-citem__lijf" data-actie="blad" data-blad="apparaat:' + h(a.id) + '"><span>' + h(naamKamer(a)) + '</span><span>' + h(m.woord + ' · ' + (z.id === 'altijd' ? t('цілодобово', 'altijd') : overbrugd(a) ? t('обійдено', 'overbrugd') : bewaakt(a, stand) ? t('стежить', 'bewaakt') : t('не стежить', 'niet bewaakt'))) + '</span></button>' +
          (z.id !== 'altijd' && a.mog.indexOf('modus') >= 0 ? o.knop({ tekst: overbrugd(a) ? t('Під охорону', 'Weer bewaken') : t('Обійти', 'Overbruggen'), klein: true, soort: 'stil', actie: 'bev-overbrug', gegevens: { doel: a.id, waarde: overbrugd(a) ? 'zone-actief' : 'zone-overbrugd' } }) : '') + '</div>';
      }).join('');
      return o.kaart({ titel: t('Налаштування зони', 'Instellingen van de zone'), inhoud: (mag ? '' : '<p class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span>' + h(t('немає доступу — змінюють власник і мешканець', 'geen toegang — eigenaar en bewoner wijzigen')) + '</span></p>') + instel }) +
        o.kaart({ titel: t('Датчики зони', 'Melders van de zone'), inhoud: '<div class="hv-bev-citems">' + lijst + '</div>' });
    }
  });

  // ───────────────────────── 13. Дії ─────────────────────────
  var w0 = function () { return HV.staat.w; };
  var uit = function (el) { return el && el.getAttribute && el.getAttribute('aria-disabled') === 'true'; };
  /** Послідовно виконати кроки-обіцянки (команди одного пристрою не можна слати одночасно — нова замінює стару). */
  function naElkaar(stappen) { return stappen.reduce(function (p, f) { return p.then(function (r) { return r && r.stop ? r : f(); }); }, Promise.resolve(null)); }

  function inschakelen(stand) {
    return HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: stand }).then(function (r) {
      if (r && r.ok) { var b = zorg(w0()); b.uitloop = { stand: stand, tot: Date.now() + UITLOOP_S * 1000 }; tik(true); HV.staat.wijzig(); }
      return r;
    });
  }
  HV.actie('bev-stand', function (ctx, g) {
    var A = w0().apparaten, stand = g.waarde, b = zorg(w0());
    if (!STAND[stand] || A.alarm.wacht) return;
    if (stand === A.alarm.st.stand) { HV.meld({ icoon: STAND[stand].icoon, titel: HV.p(HV.alarmWoord[stand]), tekst: t('Цей режим уже діє.', 'Deze stand is al actief.') }); return; }
    if (stand === 'uit') { HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: 'uit' }).then(function (r) { if (r && r.ok) { b.uitloop = null; HV.staat.wijzig(); } }); return; }
    if (nietGereed(stand).length) { HV.bladOpen('bevgereed:' + stand); return; }
    if (ctx.route.blad && ctx.route.blad.type === 'bevgereed') HV.bladOpen(null);
    inschakelen(stand);
  });
  HV.actie('bev-uitloop-stop', function () {
    var b = zorg(w0());
    if (!b.uitloop) return;
    b.uitloop = null;
    HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: 'uit', zonderRitueel: true, waarom: ['постановку скасовано під час відліку виходу', 'inschakelen geannuleerd tijdens de vertrektijd'] });
  });
  HV.actie('bev-overbrug', function (ctx, g) {
    var a = app(g.doel);
    if (!a || a.wacht) return;
    HV.doe({ doel: a.id, mogelijkheid: 'modus', waarde: g.waarde, waarom: g.waarde === 'zone-overbrugd' ? ['захист послаблено до зняття охорони', 'bescherming verlaagd tot het alarm uit gaat'] : null });
  });
  HV.actie('bev-gereed-alles', function (ctx, g) {
    var stand = g.waarde || g.stand, lijst = nietGereed(stand);
    if (lijst.some(function (x) { return x.kan === 'dicht'; })) return;
    naElkaar(lijst.map(function (x) {
      return function () {
        var p = x.kan === 'sluiten' ? HV.doe({ doel: x.apparaat.id, mogelijkheid: 'open', waarde: false }) : HV.doe({ doel: x.apparaat.id, mogelijkheid: 'modus', waarde: 'zone-overbrugd', waarom: ['захист послаблено до зняття охорони', 'bescherming verlaagd tot het alarm uit gaat'] });
        return p.then(function (r) { return r && r.ok ? r : { stop: true }; });
      };
    })).then(function (r) {
      if (r && r.stop) return;
      if (nietGereed(stand).length) return;
      HV.bladOpen(null);
      inschakelen(stand);
    });
  });

  /** Тривога (вторгнення чи тривожна кнопка): стан зони, рядок «Зараз важливо», сповіщення «тривога». */
  function tryvoga(w, x) {
    var b = zorg(w);
    b.alarm = { soort: x.soort, wat: x.wat, waar: x.waar, sinds: w.tijd, echt: Date.now(), opgepakt: null };
    w.nu = w.nu.filter(function (n) { return n.id !== 'bev-alarm'; });
    w.nu.push({ id: 'bev-alarm', soort: 'alarm', maker: x.maker || 'systeem', icoon: 'siren', sinds: w.tijd, tekst: [('Тривога: ' + x.wat[0]), ('Alarm: ' + x.wat[1])], acties: [{ naam: 'bev-naar-alarm', hoofd: true, label: ['Відкрити', 'Openen'] }] });
  }
  function paniek() {
    var m = HV.mens();
    return HV.doe({ doel: 'alarm', mogelijkheid: 'modus', waarde: 'alarm-paniek', stil: true, waarom: ['утримано 3 с', '3 s vastgehouden'] }).then(function (r) {
      if (!r || !r.ok) return r;
      HV.staat.wijzig(function (w) { tryvoga(w, { soort: 'paniek', wat: ['тривожна кнопка', 'noodknop'], waar: ['натиснув(ла): ' + m.naam[0], 'ingedrukt door ' + m.naam[1]], maker: 'mens' }); });
      HV.logboek.voegToe({ maker: m, wat: ['Тривога: тривожна кнопка', 'Alarm: noodknop'], waarom: ['сповіщено всіх дорослих; сирена — сам пристрій', 'alle volwassenen gewaarschuwd; sirene — het apparaat zelf'], soort: 'huis.alarm', gewicht: 'alarm', doel: 'alarm' });
      HV.meld({ maker: m, gewicht: 'alarm', icoon: 'siren', titel: t('Тривога: тривожна кнопка', 'Alarm: noodknop'), tekst: t('Сповіщено всіх дорослих. Відбій — на сторінці «Безпека».', 'Alle volwassenen zijn gewaarschuwd. Afmelden op de pagina ‘Beveiliging’.') });
      if (HV.route().scherm !== 'beveiliging' || HV.route().tab) HV.open('beveiliging');
      return r;
    });
  }
  HV.actie('bev-naar-alarm', function () { HV.open('beveiliging'); });
  HV.actie('bev-afmelden', function (ctx, g) {
    var w = w0(), b = zorg(w), A = w.apparaten, vals = !!g.vals;
    if (!b.alarm) return;
    var actie = HV.gevaar.actie('alarm.uitzetten');
    if (!magMens(actie)) return;
    HV.schil.gevaar({ actie: actie, naam: HV.p(A.alarm.naam), apparaat: A.alarm, waarde: 'uit' }).then(function (ja) {
      if (!ja) return;
      var waarom = vals ? ['хибна тривога', 'vals alarm'] : ['відбій тривоги', 'alarm afgemeld'];
      naElkaar([
        function () { return A.alarm.st.stand !== 'uit' ? HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: 'uit', zonderRitueel: true, stil: true, waarom: waarom }) : Promise.resolve({ ok: true }); },
        function () { return HV.doe({ doel: 'alarm', mogelijkheid: 'modus', waarde: 'alarm-rust', zonderRitueel: true, stil: true, waarom: waarom }); }
      ]).then(function () {
        HV.staat.wijzig(function (x) { x.bev.alarm = null; x.bev.uitloop = null; x.nu = x.nu.filter(function (n) { return n.id !== 'bev-alarm'; }); });
        noteer({ wat: vals ? ['Хибна тривога: відбій', 'Vals alarm: afgemeld'] : ['Тривогу завершено: відбій', 'Alarm voorbij: afgemeld'], waarom: ['рейка й підтвердження входу', 'rail en bevestiging van aanmelding'], gewicht: 'belangrijk', icoon: 'shield-check', tekst: [t('Охорону знято, сирену вимкнено.', 'Alarm uit, sirene uit.'), t('Охорону знято, сирену вимкнено.', 'Alarm uit, sirene uit.')] });
      });
    });
  });
  HV.actie('bev-oppakken', function () {
    var b = zorg(w0());
    if (!b.alarm) return;
    b.alarm.opgepakt = HV.mens().naam;
    noteer({ wat: ['Я займаюся: ' + HV.mens().naam[0], 'Ik pak het op: ' + HV.mens().naam[1]], waarom: ['ескалацію зупинено, інших дорослих повідомлено', 'escalatie gestopt, de andere volwassenen zijn ingelicht'], icoon: 'hand', gewicht: 'belangrijk' });
  });
  HV.actie('bev-sirenetest', function (ctx, g, el) { if (uit(el)) return; HV.doe({ doel: 'alarm', mogelijkheid: 'modus', waarde: 'alarm-sirenetest' }); });
  HV.actie('bev-alles-slot', function () {
    var A = w0().apparaten, stappen = [];
    if (!A.voordeurslot.st.vergrendeld) stappen.push(function () { return HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: true }); });
    ['poort', 'garagedeur'].forEach(function (id) { if (A[id].st.open) stappen.push(function () { return HV.doe({ doel: id, mogelijkheid: 'open', waarde: false }); }); });
    naElkaar(stappen);
  });

  // Тривожна кнопка: утримання 3 с (вказівник або пробіл/Enter). Під час утримання вузол позначено data-bezig — перерисовка його не чіпає.
  var houd = null;
  function houdStart(knop) {
    if (houd) return;
    var wortel = knop.closest('.hv-bev-noodknop') || knop, tel = knop.querySelector('.hv-bev-noodknop__tel'), begin = Date.now();
    wortel.setAttribute('data-bezig', '1'); knop.classList.add('is-houdt');
    houd = { knop: knop, wortel: wortel, klaar: false };
    houd.tik = setInterval(function () { if (tel) tel.textContent = HV.getal(Math.max(0, 3 - (Date.now() - begin) / 1000), 1) + ' ' + t('с', 's'); }, 100);
    houd.klok = setTimeout(function () { var x = houd; houdStop(); if (x) { x.klaar = true; laatstGeklaard = Date.now(); paniek(); } }, 3000);
  }
  var laatstGeklaard = 0;
  function houdStop() {
    if (!houd) return;
    clearInterval(houd.tik); clearTimeout(houd.klok);
    houd.knop.classList.remove('is-houdt'); houd.wortel.removeAttribute('data-bezig');
    var tel = houd.knop.querySelector('.hv-bev-noodknop__tel'); if (tel) tel.textContent = '';
    houd = null;
  }
  document.addEventListener('pointerdown', function (ev) { var k = ev.target && ev.target.closest && ev.target.closest('.hv-bev-noodknop__knop'); if (k && (ev.button == null || ev.button === 0)) houdStart(k); });
  ['pointerup', 'pointercancel'].forEach(function (n) { window.addEventListener(n, function () { houdStop(); }); });
  document.addEventListener('keydown', function (ev) { if ((ev.key === ' ' || ev.key === 'Enter') && ev.target && ev.target.classList && ev.target.classList.contains('hv-bev-noodknop__knop')) { ev.preventDefault(); if (!ev.repeat) houdStart(ev.target); } });
  document.addEventListener('keyup', function (ev) { if ((ev.key === ' ' || ev.key === 'Enter') && houd) houdStop(); });
  HV.actie('bev-noodknop', function () {
    if (houd || Date.now() - laatstGeklaard < 1500) return;
    HV.meld({ icoon: 'siren', titel: t('Утримуйте 3 с', 'Houd 3 s vast'), tekst: t('Коротке натискання нічого не робить — так тривога не спрацює випадково.', 'Kort drukken doet niets — zo gaat het alarm niet per ongeluk af.') });
  });

  // ── Перевірка ──
  function voerFix(x) {
    if (!x || !x.fix) return Promise.resolve(null);
    if (x.fix.stand) return nietGereed(x.fix.stand).length ? Promise.resolve(null) : inschakelen(x.fix.stand);
    return HV.doe({ doel: x.fix.doel, mogelijkheid: x.fix.mogelijkheid, waarde: x.fix.waarde, waarom: ['перевірка', 'controle'] });
  }
  HV.actie('bev-controle-fix', function (ctx, g) { voerFix(controleLijst(ctx, g.soort).filter(function (x) { return x.id === g.item; })[0]); });
  HV.actie('bev-controle-alles', function (ctx, g) {
    var l = controleLijst(ctx, g.soort).filter(function (x) { return !x.ok && x.groep === 'zelf' && x.fix; });
    // охорона — останньою: спершу все замкнено й зачинено
    l.sort(function (a, b) { return (a.fix.stand ? 1 : 0) - (b.fix.stand ? 1 : 0); });
    naElkaar(l.map(function (x) { return function () { return voerFix(x).then(function (r) { return r && r.ok === false && r.reden === 'geannuleerd' ? { stop: true } : r; }); }; }));
  });

  // ── Датчики ──
  HV.actie('bev-melder-test', function (ctx, g, el) {
    var a = app(g.doel);
    if (!a || a.wacht || uit(el)) return;
    var stil = a.beschikbaar === 'verouderd';
    HV.doe({ doel: a.id, mogelijkheid: 'stand', waarde: 'melder-test', stil: true }).then(function (r) {
      if (!r || !r.ok) return;
      HV.staat.wijzig(function (w) { a.st.getest = w.tijd; if (stil) { a.beschikbaar = 'ok'; a.gezien = w.tijd; } });
      HV.meld({ maker: HV.mens(), icoon: 'bell-ring', titel: naamKamer(a) + t(': перевірку пройдено', ': test geslaagd'), tekst: stil ? t('Датчик відповів — зв’язок відновлено. Батарейку все одно замініть.', 'De melder antwoordde — de verbinding is terug. Vervang toch de batterij.') : t('Датчик пискнув 3 с і відповів хабу.', 'De melder piepte 3 s en antwoordde de hub.') });
    });
  });
  HV.actie('bev-oefen', function (ctx, g) {
    var soort = g.soort === 'lek' ? 'lek' : 'rook';
    var bron = g.doel && app(g.doel) ? g.doel : soort === 'rook' ? 'rookkeuken' : 'lekbijkeuken';
    HV.bladOpen(null);
    HV.staat.wijzig(function (w) { w.nood = { soort: soort, kamer: app(bron).kamer, sinds: w.tijd, bron: bron, bevestigd: false, oefening: true }; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Навчальна тривога: ' + (soort === 'rook' ? 'дим' : 'вода'), 'Oefenalarm: ' + (soort === 'rook' ? 'rook' : 'water')], waarom: ['перевірка аварійного шару; справжньої небезпеки немає', 'test van de noodlaag; geen echt gevaar'], soort: 'huis.simulatie', gewicht: 'belangrijk' });
    if (HV.hemelSprong) HV.hemelSprong();
  });

  // ── Замок ──
  HV.actie('bev-autoslot', function (ctx, g) {
    var a = app(g.doel);
    if (!a || a.wacht) return;
    HV.doe({ doel: a.id, mogelijkheid: 'modus', waarde: a.st.modus === 'autoslot-aan' ? 'autoslot-uit' : 'autoslot-aan' });
  });

  // ── Камери ──
  HV.actie('bev-prive-thuis', function () {
    var b = zorg(w0()), was = b.priveThuis;
    if (HV.rol() !== 'eigenaar' && HV.rol() !== 'bewoner') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: немає доступу', 'Niet uitgevoerd: geen toegang'), tekst: t('Змінюють власник і мешканець.', 'De eigenaar en een bewoner wijzigen dit.') }); return; }
    var zet = function (v) { b.priveThuis = v; HV.staat.wijzig(); };
    zet(!was);
    var naam = function (v) { return v ? ['увімкнено', 'aan'] : ['вимкнено', 'uit']; };
    noteer({ wat: ['Приватність удома: ' + naam(!was)[0], 'Privacy thuis: ' + naam(!was)[1]], was: naam(was), werd: naam(!was), waarom: was ? ['внутрішні камери працюватимуть і коли хтось удома', 'binnencamera’s werken ook als er iemand thuis is'] : null, icoon: was ? 'eye' : 'eye-off', gewicht: was ? 'belangrijk' : 'info',
      terug: function () { zet(was); HV.logboek.voegToe({ maker: MENS(), wat: ['Повернуто: приватність удома', 'Ongedaan gemaakt: privacy thuis'], soort: 'huis.alarm' }); } });
  });
  HV.actie('bev-meekijken', function (ctx, g) {
    var a = app(g.doel);
    if (!a) return;
    HV.doe({ doel: a.id, mogelijkheid: 'modus', waarde: 'cam-meekijken', waarom: ['тимчасовий перегляд на 30 хв', 'tijdelijk meekijken, 30 min'] }).then(function (r) {
      if (!r || !r.ok) return;
      var w = w0(), b = zorg(w), m = HV.mens();
      b.meekijkenTot = w.tijd + 30 * MIN;
      b.gekeken.unshift({ wie: m.naam, soort: 'mens', cam: a.id, tijd: w.tijd, duur: 30, via: ['цей пристрій', 'dit toestel'], reden: ['тимчасовий перегляд', 'tijdelijk meekijken'] });
      HV.meld({ maker: m, icoon: 'eye', titel: t('Вітальню бачать до ', 'De woonkamer wordt bekeken tot ') + HV.tijd(b.meekijkenTot), tekst: t('Удома на панелі й картці кімнати — позначка «вас зараз бачать».', 'Thuis staat op het paneel en de kamerkaart: ‘je wordt nu bekeken’.') });
      HV.staat.wijzig();
    });
  });
  HV.actie('bev-masker', function (ctx, g) {
    var b = zorg(w0()), l = b.maskers[g.cam] = b.maskers[g.cam] || [], i = Number(g.cel);
    var p = l.indexOf(i);
    if (p >= 0) l.splice(p, 1); else l.push(i);
    if (!b.maskerVoor || b.maskerVoor.cam !== g.cam) b.maskerVoor = { cam: g.cam, lijst: l.slice() };
    HV.staat.wijzig();
  });
  HV.actie('bev-masker-wis', function (ctx, g) { var b = zorg(w0()); if (!b.maskerVoor || b.maskerVoor.cam !== g.cam) b.maskerVoor = { cam: g.cam, lijst: (b.maskers[g.cam] || []).slice() }; b.maskers[g.cam] = []; HV.staat.wijzig(); });
  // «Готово з масками»: одна зміна — один запис у Журналі з «Повернути»
  var uiActie = HV.acties.ui;
  HV.actie('bev-maskbewerk', function (ctx, g) {
    var b = zorg(w0());
    if (g.waarde) b.maskerVoor = { cam: g.waarde, lijst: (b.maskers[g.waarde] || []).slice() };
    uiActie(ctx, { naam: 'bev-maskbewerk', waarde: g.waarde || '' });
    HV.staat.wijzig();
  });
  HV.staat.abonneer(function (w) {
    var b = w && w.bev;
    if (!b || !b.maskerVoor || HV.ui.lees('bev-maskbewerk', false) === b.maskerVoor.cam) return;
    var cam = b.maskerVoor.cam, voor = b.maskerVoor.lijst, na = (b.maskers[cam] || []).slice();
    b.maskerVoor = null;
    if (voor.slice().sort().join() === na.slice().sort().join()) return;
    var a = w.apparaten[cam];
    HV.logboek.voegToe({ maker: MENS(), wat: [a.naam[0] + ': маски приватності змінено', a.naam[1] + ': privacymaskers gewijzigd'], was: [voor.length + ' клітинок', voor.length + ' vakken'], werd: [na.length + ' клітинок', na.length + ' vakken'], soort: 'huis.alarm', doel: cam });
    HV.meld({ maker: MENS(), icoon: 'grid-3x3', titel: HV.p(a.naam) + t(': маски збережено', ': maskers bewaard'), tekst: voor.length + ' → ' + na.length,
      terug: function () { b.maskers[cam] = voor; HV.logboek.voegToe({ maker: MENS(), wat: ['Повернуто: маски «' + a.naam[0] + '»', 'Ongedaan gemaakt: maskers ‘' + a.naam[1] + '’'], soort: 'huis.alarm', doel: cam }); HV.staat.wijzig(); } });
  });
  HV.actie('bev-camtoegang', function (ctx, g, el) {
    if (uit(el)) return;
    if (HV.rol() !== 'eigenaar') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Доступ не змінено', 'Toegang niet gewijzigd'), tekst: t('Змінює лише власник.', 'Alleen de eigenaar kan dit wijzigen.') }); return; }
    var b = zorg(w0()), was = b.toegang[g.cam][g.rol];
    if (was === g.waarde) return;
    var naamVan = function (v) { return TOEGANG.filter(function (x) { return x[0] === v; })[0][1]; };
    var rol = ROLLEN.filter(function (x) { return x[0] === g.rol; })[0][1], cam = app(g.cam);
    b.toegang[g.cam][g.rol] = g.waarde;
    noteer({ wat: ['Доступ до «' + cam.naam[0] + '»: ' + rol[0].toLowerCase(), 'Toegang tot ‘' + cam.naam[1] + '’: ' + rol[1].toLowerCase()], was: naamVan(was), werd: naamVan(g.waarde), soort: 'huis.systeem', icoon: 'users',
      terug: function () { b.toegang[g.cam][g.rol] = was; HV.logboek.voegToe({ maker: MENS(), wat: ['Повернуто: доступ до «' + cam.naam[0] + '»', 'Ongedaan gemaakt: toegang tot ‘' + cam.naam[1] + '’'], soort: 'huis.systeem' }); HV.staat.wijzig(); } });
  });
  HV.actie('bev-moment', function (ctx, g) {
    var x = zorg(w0()).gebeurtenissen.filter(function (e) { return e.id === g.id; })[0];
    if (!x) return;
    HV.ui.zet('bev-moment', x.id);
    HV.open('beveiliging-camera-' + x.cam);
  });
  HV.actie('bev-snapshot', function (ctx, g, el) {
    if (uit(el)) return;
    var a = app(g.cam);
    noteer({ wat: [a.naam[0] + ': знімок збережено', a.naam[1] + ': beeld bewaard'], waarom: ['вручну; зберігається 14 днів', 'handmatig; blijft 14 dagen'], doel: a.id, icoon: 'image-down', tekst: [t('Знімок у Журналі — 14 днів.', 'Het beeld staat 14 dagen in het logboek.'), t('Знімок у Журналі — 14 днів.', 'Het beeld staat 14 dagen in het logboek.')] });
  });

  // ── Дзвінок і виклик ──
  HV.actie('bev-bel', function () {
    HV.staat.wijzig(function (w) {
      var b = zorg(w);
      w.oproep = { sinds: w.tijd, stand: 'belt' };
      b.oproepAntwoord = null;
      if (w.apparaten.deurbel) w.apparaten.deurbel.st.laatst = w.tijd;
      b.gebeurtenissen.unshift({ id: 'g' + Date.now(), cam: 'cameravoor', soort: 'bel', tekst: ['Дзвінок у двері', 'Er wordt aangebeld'], tijd: w.tijd });
      w.nu = w.nu.filter(function (n) { return n.id !== 'oproep'; });
      w.nu.push({ id: 'oproep', soort: 'aandacht', maker: 'dienst', icoon: 'bell-ring', doel: 'deurbel', sinds: w.tijd, tekst: ['Хтось дзвонить у двері', 'Er wordt aangebeld bij de voordeur'], acties: [{ naam: 'oproep', hoofd: true, label: ['Показати', 'Bekijken'], gegevens: { stap: 'toon' } }, { naam: 'oproep', label: ['Відхилити', 'Weigeren'], gegevens: { stap: 'weiger' } }] });
    });
    HV.logboek.voegToe({ maker: { soort: 'dienst', naam: ['Дверний дзвінок', 'Deurbel'] }, wat: ['Дзвінок у двері', 'Er is aangebeld'], soort: 'huis.toegang', gewicht: 'belangrijk', doel: 'deurbel' });
    HV.meld({ maker: { soort: 'dienst', naam: ['Дверний дзвінок', 'Deurbel'] }, gewicht: 'belangrijk', icoon: 'bell-ring', titel: t('Дзвінок у двері', 'Er wordt aangebeld'), tekst: t('Виклик показано на екранах удома.', 'De oproep staat op de schermen in huis.') });
    HV.bladOpen('oproep');
  });
  var UITKOMST = { geweigerd: ['відхилено', 'geweigerd'], geopend: ['двері відімкнено з виклику', 'deur ontgrendeld vanuit de oproep'], gemist: ['пропущено', 'gemist'] };
  function oproepEinde(uitkomst) {
    var w = w0(), b = zorg(w);
    if (!w.oproep) return;
    var antwoord = b.oproepAntwoord ? ANTWOORDEN.filter(function (x) { return x[0] === b.oproepAntwoord; })[0] : null;
    var u = uitkomst === 'beantwoord' && antwoord ? ['відповіли: «' + antwoord[1][0] + '»', 'antwoord: ‘' + antwoord[1][1] + '’'] : UITKOMST[uitkomst] || UITKOMST.geweigerd;
    var sinds = w.oproep.sinds;
    HV.staat.wijzig(function (x) {
      b.bezoekers.unshift({ id: 'b' + Date.now(), tijd: sinds, wie: ['Відвідувач', 'Bezoeker'], uitkomst: u, soort: 'persoon' });
      x.oproep = null; b.oproepAntwoord = null;
      x.nu = x.nu.filter(function (n) { return n.id !== 'oproep'; });
    });
    noteer({ wat: ['Виклик із дверей завершено: ' + u[0], 'Oproep van de deur beëindigd: ' + u[1]], soort: 'huis.toegang', icoon: 'bell-ring', doel: 'deurbel' });
    var r = HV.route();
    if (r.blad && r.blad.type === 'oproep') HV.bladOpen(null);
  }
  HV.actie('bev-oproep-antwoord', function (ctx, g) {
    var w = w0(), b = zorg(w), x = ANTWOORDEN.filter(function (a) { return a[0] === g.antwoord; })[0];
    if (!w.oproep || !x) return;
    b.oproepAntwoord = x[0]; w.oproep.stand = 'gesprek';
    noteer({ wat: ['Відповідь на дверній панелі: «' + x[1][0] + '»', 'Antwoord op het deurpaneel: ‘' + x[1][1] + '’'], soort: 'huis.toegang', icoon: 'message-square', doel: 'deurbel' });
  });
  HV.actie('bev-oproep-open', function (ctx, g, el) {
    if (uit(el)) return;
    HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: false, waarom: ['виклик із дверей', 'oproep van de deur'] }).then(function (r) { if (r && r.ok) oproepEinde('geopend'); });
  });
  HV.actie('bev-oproep-einde', function (ctx, g) { oproepEinde(g.uitkomst); });
  // Ядро: «Показати» в рядку «Зараз важливо» відкриває виклик, а не скидає його (виклик живе, доки його не завершать).
  HV.actie('oproep', function (ctx, g) {
    if (g.stap === 'toon') { HV.open('beveiliging-toegang'); HV.bladOpen('oproep'); return; }
    oproepEinde('geweigerd');
  });

  // ── Коди й гості ──
  HV.actie('bev-gast-start', function (ctx, g) {
    var s = CODE_SOORT[g.sjabloon] && g.sjabloon !== 'mens' ? g.sjabloon : 'gast';
    HV.ui.zet('bev-gast', { stap: 1, sjabloon: s, naam: 0, deuren: ['voordeur'], duur: s === 'monteur' ? 3 : s === 'hulp' ? 720 : 24, gezien: false });
    HV.bladOpen('bevgast');
  });
  HV.actie('bev-gast-kies', function (ctx, g) {
    var x = JSON.parse(JSON.stringify(gastStaat()));
    if (g.veld === 'sjabloon') { x.sjabloon = g.waarde; x.naam = 0; }
    else if (g.veld === 'naam') x.naam = Number(g.waarde) || 0;
    else if (g.veld === 'deuren') { var i = x.deuren.indexOf(g.waarde); if (i >= 0) x.deuren.splice(i, 1); else x.deuren.push(g.waarde); }
    else if (g.veld === 'duur') x.duur = Math.min(720, Number(g.waarde) || 24);
    else if (g.veld === 'gezien') x.gezien = !!g.waarde;
    HV.ui.zet('bev-gast', x);
  });
  HV.actie('bev-gast-stap', function (ctx, g, el) {
    var x = JSON.parse(JSON.stringify(gastStaat()));
    if (uit(el)) { HV.meld({ icoon: 'info', titel: x.stap === 4 ? t('Спершу покажіть людині, що записується', 'Laat eerst zien wat er wordt vastgelegd') : t('Оберіть хоча б одні двері', 'Kies minstens één deur') }); return; }
    x.stap = Math.max(1, Math.min(5, Number(g.stap) || 1));
    HV.ui.zet('bev-gast', x);
  });
  HV.actie('bev-gast-maak', function () {
    var w = w0(), A = w.apparaten, x = JSON.parse(JSON.stringify(gastStaat()));
    var actie = HV.gevaar.actie('slot.gastcode');
    if (!magMens(actie)) return;
    HV.schil.gevaar({ actie: actie, naam: HV.p(A.voordeurslot.naam), apparaat: A.voordeurslot, waarde: true }).then(function (ja) {
      if (!ja) return;
      var b = zorg(w0()), nu = w0().tijd, naam = GAST_NAMEN[x.sjabloon][x.naam] || GAST_NAMEN[x.sjabloon][0];
      var zaad = (Date.now() % 900000) + 100000, code = String(zaad).replace(/(\d{3})(\d{3})/, '$1 $2');
      var c = { id: 'c' + Date.now(), soort: x.sjabloon, naam: naam, deuren: x.deuren.slice(), van: nu, tot: nu + x.duur * UUR, laatst: null, gezien: true };
      b.codes.unshift(c);
      noteer({ wat: ['Код гостя: ' + naam[0], 'Gastcode: ' + naam[1]], waarom: [x.deuren.length + ' двері; показано людині', x.deuren.length + ' deur(en); aan de persoon getoond'], werd: ['діє до ' + HV.datumKort(c.tot) + ' ' + HV.tijd(c.tot), 'geldig tot ' + HV.datumKort(c.tot) + ' ' + HV.tijd(c.tot)], soort: 'huis.toegang', gewicht: 'belangrijk', icoon: 'key-round', doel: 'voordeurslot',
        terug: function () { c.ingetrokken = true; HV.logboek.voegToe({ maker: MENS(), wat: ['Повернуто: код «' + naam[0] + '» відкликано', 'Ongedaan gemaakt: code ‘' + naam[1] + '’ ingetrokken'], soort: 'huis.toegang' }); HV.staat.wijzig(); } });
      x.stap = 6; x.code = code;
      HV.ui.zet('bev-gast', x);
    });
  });
  HV.actie('bev-gast-klaar', function () { HV.ui.zet('bev-gast', null); HV.bladOpen(null); });
  HV.actie('bev-code-intrek', function (ctx, g) {
    var b = zorg(w0()), c = b.codes.filter(function (x) { return x.id === g.code; })[0];
    if (!c || c.ingetrokken) return;
    c.ingetrokken = true;
    noteer({ wat: ['Код відкликано: ' + c.naam[0], 'Code ingetrokken: ' + c.naam[1]], was: ['діє', 'actief'], werd: ['відкликано', 'ingetrokken'], soort: 'huis.toegang', icoon: 'ban', doel: 'voordeurslot',
      terug: function () { c.ingetrokken = false; HV.logboek.voegToe({ maker: MENS(), wat: ['Повернуто: код «' + c.naam[0] + '» знову діє', 'Ongedaan gemaakt: code ‘' + c.naam[1] + '’ weer actief'], soort: 'huis.toegang' }); HV.staat.wijzig(); } });
  });

  // ── Зони ──
  HV.actie('bev-zone', function (ctx, g, el) {
    if (uit(el)) return;
    if (HV.rol() !== 'eigenaar' && HV.rol() !== 'bewoner') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: немає доступу', 'Niet uitgevoerd: geen toegang') }); return; }
    var b = zorg(w0()), cfg = b.zones[g.zone], z = ZONES.filter(function (x) { return x.id === g.zone; })[0];
    if (!cfg || !z) return;
    var was = cfg[g.veld], nieuw = g.veld === 'stil' || g.veld === 'kruis' ? !!g.waarde : Number(g.waarde);
    if (was === nieuw) return;
    var NAAM = { vertraging: ['затримка входу', 'inlooptijd'], sirene: ['сирена', 'sirene'], stil: ['тиха тривога', 'stil alarm'], kruis: ['перехресна перевірка', 'kruiscontrole'] };
    var woord = function (v) { return typeof v === 'boolean' ? (v ? ['увімкнено', 'aan'] : ['вимкнено', 'uit']) : g.veld === 'sirene' ? [v + ' хв', v + ' min'] : [v ? v + ' с' : 'немає', v ? v + ' s' : 'geen']; };
    cfg[g.veld] = nieuw;
    noteer({ wat: ['Зона «' + z.naam[0] + '»: ' + NAAM[g.veld][0], 'Zone ‘' + z.naam[1] + '’: ' + NAAM[g.veld][1]], was: woord(was), werd: woord(nieuw), icoon: z.icoon, gewicht: (g.veld === 'stil' && nieuw) ? 'belangrijk' : 'info', waarom: g.veld === 'stil' && nieuw ? ['захист послаблено: без сирени', 'bescherming verlaagd: zonder sirene'] : null,
      terug: function () { cfg[g.veld] = was; HV.logboek.voegToe({ maker: MENS(), wat: ['Повернуто: зона «' + z.naam[0] + '»', 'Ongedaan gemaakt: zone ‘' + z.naam[1] + '’'], soort: 'huis.alarm' }); HV.staat.wijzig(); } });
  });

  // ───────────────────────── 14. Сценарії зони ─────────────────────────
  // Спільний перелік сценаріїв пульта фіксовано (15, статична перевірка), тож сценарії зони запускаються з картки
  // «Навчання» на сторінці «Стан» тим самим способом, що й HV.scenarios.start: свіжий світ → зміни → крок симуляції.
  var ZONE_SCENARIOS = [];
  (function () {
    var D10 = function (u, m) { return HV.huistijd(2026, 11, 10, u, m); };
    var zet = function (w, id, st) { var a = w.apparaten[id]; for (var k in st) a.st[k] = st[k]; };
    var thuisAlleen = function (w, ids) { w.mensen.forEach(function (m) { m.thuis = ids.indexOf(m.id) >= 0; }); };
    var S = { lijst: ZONE_SCENARIOS, vind: function () { return null; } };
    if (!S.vind('inbraak')) S.lijst.push({
      id: 'inbraak', icoon: 'siren', naam: ['Нічне вторгнення', 'Nachtelijke inbraak'], tijd: D10(3, 12),
      wat: ['Нічна охорона, задні двері відчинено: тривога на всіх екранах', 'Nachtalarm, de achterdeur gaat open: alarm op alle schermen'],
      pas: function (w) {
        w.huisstand = 'nacht'; thuisAlleen(w, ['olena', 'taras', 'marko', 'solomija']);
        Object.keys(w.apparaten).forEach(function (id) { var a = w.apparaten[id]; if (a.soort === 'licht' && a.beschikbaar === 'ok') a.st.aan = false; });
        zet(w, 'alarm', { stand: 'nacht', modus: 'alarm-rust' }); zet(w, 'achterdeurcontact', { open: true, sinds: w.tijd - 40000 }); zet(w, 'beweginghal', { actief: true, laatst: 0 });
        zet(w, 'thermostaat', { doel: 17.5 }); zet(w, 'wasmachine', { loopt: false, rest: 0, vermogen: 0 });
        zorg(w).gebeurtenissen.unshift({ id: 'g-inbraak', cam: 'cameratuin', soort: 'persoon', tekst: ['Людина в саду біля задніх дверей', 'Iemand in de tuin bij de achterdeur'], tijd: w.tijd - 60000 });
        tryvoga(w, { soort: 'inbraak', wat: ['вторгнення', 'inbraak'], waar: ['задні двері · кухня, потім рух у передпокої', 'achterdeur · keuken, daarna beweging in de hal'], maker: 'systeem' });
        w.logboek.unshift({ id: 'l' + (++w.logTeller), tijd: w.tijd, maker: SYS, wat: ['Тривога: вторгнення', 'Alarm: inbraak'], waarom: ['задні двері відчинено під нічною охороною; перехресна перевірка — рух у передпокої', 'achterdeur open tijdens de nachtstand; kruiscontrole — beweging in de hal'], soort: 'huis.alarm', gewicht: 'alarm', gelezen: false, sim: true });
      }
    });
    if (!S.vind('agentpoort')) S.lijst.push({
      id: 'agentpoort', icoon: 'agent', naam: ['Агент просить відчинити ворота', 'Agent vraagt de poort te openen'], tijd: HV.huistijd(2026, 11, 9, 16, 40),
      wat: ['Дозвіл «Питати»: запит агента чекає на ваше рішення', 'Toestemming ‘Vragen’: het verzoek van de agent wacht op jou'],
      pas: function (w) {
        thuisAlleen(w, ['olena']);
        if (HV.gevaar.zetStandStil) HV.gevaar.zetStandStil('claude', 'ingang.openen', 'vragen');
        // без власного строку (tot): строк запиту ядро тепер виконує — «минув» за 10 хв часу дому закрив би сценарій
        // за 10 с перегляду на швидкості ×60
        w.verzoeken.push({ id: 'vpoort', uitvoerder: 'claude', sleutel: 'ingang.openen', doel: 'poort', mogelijkheid: 'open', waarde: true, sinds: w.tijd, stand: 'wacht', wat: ['Відчинити ворота: Вхідні ворота', 'Poort openen: Toegangspoort'], waarom: ['кур’єр із великим пакунком біля воріт (подія камери)', 'bezorger met een groot pakket bij de poort (cameragebeurtenis)'] });
        w.nu.push({ id: 'verzoek-vpoort', soort: 'verzoek', maker: 'agent', icoon: 'fence', verzoek: 'vpoort', doel: 'poort', sinds: w.tijd, tekst: ['Агент Claude просить відчинити ворота для кур’єра', 'Agent Claude vraagt de poort te openen voor de bezorger'],
          acties: [{ naam: 'verzoek-ja', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'], gegevens: { verzoek: 'vpoort' } }, { naam: 'verzoek-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { verzoek: 'vpoort' } }] });
        zorg(w).gebeurtenissen.unshift({ id: 'g-poort', cam: 'cameravoor', soort: 'pakket', tekst: ['Кур’єр із великим пакунком біля воріт', 'Bezorger met een groot pakket bij de poort'], tijd: w.tijd - 2 * MIN });
      }
    });
  })();
  HV.actie('bev-scenario', function (ctx, g) {
    var s = ZONE_SCENARIOS.filter(function (x) { return x.id === g.id; })[0];
    if (!s) return;
    HV.bladOpen(null);
    if (HV.gevaar.herstelStanden) HV.gevaar.herstelStanden();
    var w = HV.staat.herstel(s.tijd, true);
    w.gegevens = 'live';
    s.pas(w);
    HV.klok.stap(0);
    HV.logboek.voegToe({ maker: { soort: 'simulator', naam: ['Симулятор', 'Simulator'] }, wat: ['Сценарій зони: ' + s.naam[0], 'Scenario van de zone: ' + s.naam[1]], waarom: s.wat, soort: 'huis.simulatie' });
    if (HV.naScenario) HV.naScenario(s);
    HV.open('beveiliging');
  });
  function oefenBlok() {
    return kaart('hv-bev-oefen', kop('flask-conical', t('Навчання й симуляція', 'Oefenen en simulatie')) +
      '<p class="hv-bev-noot">' + HV.icoon('info', { maat: 's' }) + h(t('Перевірте, як дім поведеться в тривозі: навчальна тривога показує аварійний шар на всіх екранах, сценарій будує новий світ симулятора.', 'Oefen hoe het huis zich gedraagt bij alarm: een oefenalarm toont de noodlaag op alle schermen, een scenario bouwt een nieuwe simulatorwereld.')) + '</p>' +
      '<div class="hv-bev-oefenknoppen">' + o.knop({ tekst: t('Навчальна тривога: дим', 'Oefenalarm: rook'), icoon: 'alarm-smoke', actie: 'bev-oefen', gegevens: { soort: 'rook' }, k: 'st-oefen-rook' }) +
      o.knop({ tekst: t('Навчальна тривога: вода', 'Oefenalarm: water'), icoon: 'droplet', actie: 'bev-oefen', gegevens: { soort: 'lek' }, k: 'st-oefen-lek' }) +
      ZONE_SCENARIOS.map(function (s) { return o.knop({ tekst: HV.p(s.naam), icoon: s.icoon, actie: 'bev-scenario', gegevens: { id: s.id }, k: 'sc-' + s.id }); }).join('') + '</div>', 'bev-oefen');
  }

  // ───────────────────────── 15. Реєстрація ─────────────────────────
  HV.scherm({
    id: 'beveiliging', sectie: 'beveiliging', titel: ['Безпека', 'Beveiliging'], icoon: 'shield', adres: '/beveiliging',
    tabs: [
      { id: 'stand', titel: ['Стан', 'Stand'], adres: '/beveiliging', render: renderStand },
      { id: 'cameras', titel: ['Камери', 'Camera’s'], adres: '/beveiliging/cameras', render: renderCameras },
      { id: 'toegang', titel: ['Доступ', 'Toegang'], adres: '/beveiliging/toegang', render: renderToegang },
      { id: 'sensoren', titel: ['Датчики', 'Sensoren'], adres: '/beveiliging/sensoren', render: renderSensoren },
      { id: 'camera', titel: ['Камера', 'Camera'], adres: '/beveiliging/cameras/:object', render: renderCamera, verborgen: true },
      { id: 'controle', titel: ['Перевірка', 'Controle'], adres: '/beveiliging/controle/:object', render: renderControle, verborgen: true },
      { id: 'bezoekers', titel: ['Відвідувачі', 'Bezoekers'], adres: '/beveiliging/toegang/bezoekers', render: renderBezoekers, verborgen: true }
    ]
  });
})(window.HV = window.HV || {});
