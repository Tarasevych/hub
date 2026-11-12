// Klimaat en media / Клімат і медіа — вкладки «Кімнати → Клімат» (/klimaat, /klimaat/lucht, /klimaat/weekschema) і
// «Кімнати → Медіа» (/media) та аркуші керування дванадцяти типів: термостат, кондиціонер, тепловий насос, тепла підлога,
// радіаторний клапан, вентиляція, зволожувач, очищувач повітря, бойлер; телевізор, колонка, група колонок (мультирум).
// Кожен аркуш: Керування · Історія (графік) · Налаштування; стани недоступності; підказки-наслідки. Кожна дія — через HV.doe.
// Вільні аркуші: ?blad=media:waar («Де грає») і ?blad=klimaatvakantie («Відпустка до…»).
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var MIN = 60000, UUR = 3600000, DAG = 86400000;
  var MIJN = ['thermostaat', 'airco', 'warmtepomp', 'vloerverwarming', 'radiatorkraan', 'ventilatie', 'bevochtiger', 'luchtreiniger', 'boiler', 'tv', 'speaker', 'speakergroep'];
  var KLIMAAT = ['thermostaat', 'airco', 'warmtepomp', 'vloerverwarming', 'radiatorkraan', 'ventilatie', 'bevochtiger', 'luchtreiniger', 'boiler'];
  var MEDIA = ['tv', 'speaker', 'speakergroep'];
  var twee = function (n) { return (n < 10 ? '0' : '') + n; };
  var ap = function (id) { return HV.staat.w.apparaten[id] || null; };
  var klem = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var rond = function (v, stap) { return Math.round(v / stap) * stap; };

  // ───────────────────────── 0. Дані зони: розширення паспорта (лише під час завантаження) ─────────────────────────
  // Кожен рядок розкладу: «ГГХХ-ціль×10»; перший блок дня завжди о 00:00. Будні: сон · ранок · день · вечір · сон.
  var BUDEN = '0000-180,0630-210,0830-170,1630-210,2230-180', WEEKEND = '0000-180,0800-210,2300-180';
  var ROOSTER_STANDAARD = 'v1|' + [BUDEN, BUDEN, BUDEN, BUDEN, BUDEN, WEEKEND, WEEKEND].join(';');
  var OCHTENDMIX = [['Ранкова кава · Джаз-тріо «Липень»', 'Ochtendkoffie · Jazztrio Juli'], ['Обійми · Океан Ельзи', 'Obijmy · Okean Elzy'], ['Тиха гавань · Марта Ліс', 'Stille haven · Marta Lis'],
    ['Вітер з моря · ансамбль «Хвиля»', 'Wind van zee · ensemble Golf'], ['Соняшники · ДахаБраха', 'Zonnebloemen · DakhaBrakha'], ['Світанок над Дніпром · Оркестр міста', 'Dageraad boven de Dnipro · Stadsorkest']];
  var KLASSIEK = [['Ранкова симфонія · наживо', 'Ochtendsymfonie · live'], ['Нічна серенада · фортепіано', 'Nachtserenade · piano'], ['Пори року: осінь · скрипка', 'Seizoenen: herfst · viool']];
  var EXTRA = {
    thermostaat: { mog: ['rooster', 'vakantie', 'voorkeuzes'], st: { rooster: ROOSTER_STANDAARD, vakantie: 'vakantie-geen', voorkeuzes: 'vk-210-180-170-230' }, extra: { batterij: 84 } },
    airco: { mog: ['lamellen', 'aftel'], st: { lamellen: 'lamel-zwenk' } },
    warmtepomp: { mog: ['warmwater', 'stilstand', 'stooklijn'], st: { warmwater: 'ww-comfort', stilstand: 'stil-aan', stooklijn: 'lijn-0.6', druk: 1.6, starts: 4, draaiuren: 2140 } },
    vloerverwarming: { mog: ['vloermin', 'aftel'], st: { vloermin: 'vloer-24', vloer: 25.8 } },
    radiatorkraan: { mog: ['raamdetectie', 'kalibreren'], st: { raamdetectie: 'raam-aan', kalibreren: 'kalibratie-' + HV.huistijd(2026, 10, 2, 11, 20) } },
    ventilatie: { mog: ['boost', 'co2sturing', 'co2grens', 'filterwissel'], st: { boost: 'boost-uit', co2sturing: 'co2-aan', co2grens: 'ppm-1000', filterwissel: 'filter-' + HV.huistijd(2026, 6, 14, 10, 0) } },
    bevochtiger: { mog: ['modus'], st: { modus: 'normaal' } },
    luchtreiniger: { mog: ['kinderslot', 'filterwissel'], st: { kinderslot: 'slot-uit', filterwissel: 'filter-' + HV.huistijd(2026, 3, 2, 10, 0) } },
    boiler: { mog: ['planning', 'legionella'], st: { planning: 'goedkoop', legionella: 'legionella-' + HV.huistijd(2026, 11, 3, 2, 0) } },
    tv: { mog: ['kanaal', 'demp', 'toets', 'aftel'], st: { kanaal: 'zender-1', demp: 'demp-uit' } },
    speaker: { mog: ['bron', 'nummer', 'slaaptimer', 'omroep'], st: { nummer: 'nummer-0', slaaptimer: 'geen-timer', omroep: 'omroep-geen' } },
    speakergroep: { mog: ['samenstelling', 'plafond', 'bron'], st: { samenstelling: 'leden:speakerkeuken+speakerwoon', plafond: 'plafond-60', bron: 'radio', titel: ['Радіо «Класика»', 'Radio Klassiek'], wachtrij: KLASSIEK } }
  };
  var PER_APPARAAT = {
    speakerkeuken: { bron: 'lijst', wachtrij: OCHTENDMIX },
    speakerwoon: { bron: 'radio', titel: ['Радіо «Класика»', 'Radio Klassiek'], wachtrij: KLASSIEK }
  };
  (HV.paspoort && HV.paspoort.apparaten || []).forEach(function (a) {
    var x = EXTRA[a.soort];
    if (!x) return;
    x.mog.forEach(function (m) { if (a.mog.indexOf(m) < 0) a.mog.push(m); });
    for (var k in x.st) if (!(k in a.st)) a.st[k] = x.st[k];
    for (var e in x.extra || {}) if (!(e in a)) a[e] = x.extra[e];
    var eigen = PER_APPARAAT[a.id] || {};
    for (var p in eigen) if (!(p in a.st)) a.st[p] = eigen[p];
  });

  // Назви значень для Журналу й сповіщень (доповнення спільного словника, наявні ключі не змінюються).
  var NAMEN = {
    ventileren: ['лише вентилятор', 'alleen ventilator'], laag: ['низька', 'laag'], midden: ['середня', 'midden'], hoog: ['висока', 'hoog'], stil: ['тиха', 'stil'],
    normaal: ['звичайний', 'normaal'], slaap: ['сон', 'slaap'], apps: ['застосунки', 'apps'],
    radio: ['радіо', 'radio'], lijst: ['добірка', 'afspeellijst'], bluetooth: ['через Bluetooth', 'via Bluetooth'],
    'lamel-boven': ['ламелі вгору', 'lamellen omhoog'], 'lamel-midden': ['ламелі посередині', 'lamellen in het midden'], 'lamel-onder': ['ламелі вниз', 'lamellen omlaag'], 'lamel-zwenk': ['ламелі гойдаються', 'lamellen zwenken'],
    'ww-eco': ['гаряча вода: ощадно', 'warm water: zuinig'], 'ww-comfort': ['гаряча вода: комфорт', 'warm water: comfort'], 'ww-snel': ['гаряча вода: швидко', 'warm water: snel'],
    'stil-aan': ['тихий режим уночі ввімкнено', 'stille nachtstand aan'], 'stil-uit': ['тихий режим уночі вимкнено', 'stille nachtstand uit'],
    'raam-aan': ['пауза при відчиненому вікні ввімкнена', 'pauze bij open raam aan'], 'raam-uit': ['пауза при відчиненому вікні вимкнена', 'pauze bij open raam uit'],
    'boost-uit': ['посилення скасовано', 'versterking gestopt'], 'co2-aan': ['керування за CO₂ увімкнено', 'CO₂-sturing aan'], 'co2-uit': ['керування за CO₂ вимкнено', 'CO₂-sturing uit'],
    'slot-aan': ['блокування від дітей увімкнено', 'kinderslot aan'], 'slot-uit': ['блокування від дітей вимкнено', 'kinderslot uit'],
    direct: ['гріти одразу', 'direct opwarmen'], goedkoop: ['гріти в найдешевшу годину', 'opwarmen in het goedkoopste uur'], zon: ['гріти від сонця', 'opwarmen op zonnestroom'],
    'demp-aan': ['звук вимкнено', 'geluid uit'], 'demp-uit': ['звук увімкнено', 'geluid aan'], 'geen-timer': ['відлік скасовано', 'aftellen gestopt'],
    'vakantie-geen': ['відпустку завершено', 'vakantie beëindigd'], 'plafond-geen': ['без стелі гучності', 'zonder volumeplafond'], 'omroep-geen': ['без оголошення', 'geen omroep'],
    'omroep-eten': ['оголошення «Вечеря готова»', 'omroep ‘Het eten is klaar’'], 'omroep-slapen': ['оголошення «Час спати»', 'omroep ‘Bedtijd’'], 'omroep-weg': ['оголошення «Виходимо за 5 хвилин»', 'omroep ‘Over 5 minuten vertrekken we’']
  };
  for (var naamSleutel in NAMEN) if (HV.waardeNaam && !HV.waardeNaam[naamSleutel]) HV.waardeNaam[naamSleutel] = NAMEN[naamSleutel];

  var TOETS = { op: ['вгору', 'omhoog'], neer: ['вниз', 'omlaag'], links: ['ліворуч', 'links'], rechts: ['праворуч', 'rechts'], ok: ['гаразд', 'oké'], terug: ['назад', 'terug'], thuis: ['головна', 'start'] };
  var ZENDERS = [[1, 'NPO 1'], [2, 'NPO 2'], [3, 'NPO 3'], [4, 'RTL 4'], [5, 'RTL 5'], [6, 'SBS6'], [7, ['Суспільне', 'Suspilne']], [8, ['Новини 24', 'Nieuws 24']]];
  var zenderNaam = function (nr) { var z = ZENDERS.filter(function (x) { return x[0] === nr; })[0]; return z ? (typeof z[1] === 'string' ? [z[1], z[1]] : z[1]) : [String(nr), String(nr)]; };
  var datumPaar = function (ms) { var d = new Date(ms); return [twee(d.getUTCDate()) + '.' + twee(d.getUTCMonth() + 1), twee(d.getUTCDate()) + '-' + twee(d.getUTCMonth() + 1)]; };
  var getalBeide = function (n, dec) { var s = HV.getal(n, dec); return [s, s]; };

  /** Значення словами [uk, nl] для можливостей, яких ядро не описує; null — не наше. */
  function woordVoor(raw, a) {
    var s = String(raw), m;
    if (HV.waardeNaam && HV.waardeNaam[s]) return HV.waardeNaam[s];
    if (/^v1\|/.test(s)) return ['тижневий розклад змінено', 'weekschema gewijzigd'];
    if ((m = s.match(/^vakantie-(\d+)-(\d+)$/))) { var dp = datumPaar(+m[1]), tv = HV.getal(+m[2] / 10, 1); return ['відпустка до ' + dp[0] + ', ' + tv + ' °C', 'vakantie tot ' + dp[1] + ', ' + tv + ' °C']; }
    if ((m = s.match(/^vk-(\d+)-(\d+)-(\d+)-(\d+)$/))) { var v = m.slice(1).map(function (x) { return HV.getal(+x / 10, 1); }); return ['заготовки: комфорт ' + v[0] + ', сон ' + v[1] + ', економно ' + v[2] + ', посилено ' + v[3], 'voorkeuzes: comfort ' + v[0] + ', slaap ' + v[1] + ', eco ' + v[2] + ', boost ' + v[3]]; }
    if ((m = s.match(/^boost-tot-(\d+)$/))) return ['посилено до ' + HV.tijd(+m[1]), 'versterkt tot ' + HV.tijd(+m[1])];
    if ((m = s.match(/^stil-om-(\d+)$/))) return ['вимкнеться о ' + HV.tijd(+m[1]), 'stopt om ' + HV.tijd(+m[1])];
    if ((m = s.match(/^zender-(\d+)$/))) { var zn = zenderNaam(+m[1]); return ['канал ' + m[1] + ' · ' + zn[0], 'zender ' + m[1] + ' · ' + zn[1]]; }
    if ((m = s.match(/^nummer-(\d+)$/))) { var lijst = a && a.st.wachtrij || [], tr = lijst[+m[1]]; return tr ? ['трек «' + tr[0] + '»', 'nummer ‘' + tr[1] + '’'] : ['трек ' + (+m[1] + 1), 'nummer ' + (+m[1] + 1)]; }
    if ((m = s.match(/^leden:(.*)$/))) { var ids = m[1] ? m[1].split('+') : []; var nm = ids.map(function (id) { var x = HV.staat.w.apparaten[id]; return x ? HV.staat.kamer(x.kamer).naam : [id, id]; }); return ['склад групи: ' + (nm.map(function (x) { return x[0]; }).join(', ') || 'порожньо'), 'samenstelling: ' + (nm.map(function (x) { return x[1]; }).join(', ') || 'leeg')]; }
    if ((m = s.match(/^plafond-(\d+)$/))) return ['стеля гучності ' + m[1] + ' %', 'volumeplafond ' + m[1] + ' %'];
    if ((m = s.match(/^lijn-([\d.]+)$/))) return ['крива опалення ' + HV.getal(+m[1], 1), 'stooklijn ' + HV.getal(+m[1], 1)];
    if ((m = s.match(/^vloer-(\d+)$/))) return +m[1] === 0 ? ['без нижньої межі підлоги', 'geen ondergrens voor de vloer'] : ['підлога не холодніша за ' + m[1] + ' °C', 'vloer minstens ' + m[1] + ' °C'];
    if ((m = s.match(/^ppm-(\d+)$/))) return ['поріг CO₂ ' + m[1] + ' ppm', 'CO₂-grens ' + m[1] + ' ppm'];
    if (/^filter-\d+$/.test(s)) return ['фільтр замінено', 'filter vervangen'];
    if (/^legionella-\d+$/.test(s)) return ['прогрів до 65 °C запущено', 'opwarmen tot 65 °C gestart'];
    if (/^kalibratie-\d+$/.test(s)) return ['клапан відкалібровано', 'klep gekalibreerd'];
    if ((m = s.match(/^toets-(\w+)$/))) { var tn = TOETS[m[1]] || [m[1], m[1]]; return ['кнопка пульта «' + tn[0] + '»', 'toets ‘' + tn[1] + '’']; }
    return null;
  }

  // Обхід ядра: опис значення (beschrijf) у handeling.js не має точки розширення для нових можливостей, тож Журнал
  // записав би сирий рядок («lamel-zwenk»). Перекладаємо записи пристроїв цієї зони перед додаванням.
  var voegToeKern = HV.logboek.voegToe;
  HV.logboek.voegToe = function (e) {
    var a = e && e.doel && HV.staat.w ? HV.staat.w.apparaten[e.doel] : null;
    if (a && MIJN.indexOf(a.soort) >= 0) {
      var paar = function (p) { if (!p || p[0] !== p[1]) return p; return woordVoor(p[0], a) || p; };
      e.was = paar(e.was); e.werd = paar(e.werd);
      if (e.wat && e.wat[0].indexOf(a.naam[0] + ': ') === 0 && e.wat[1].indexOf(a.naam[1] + ': ') === 0) {
        var r0 = e.wat[0].slice(a.naam[0].length + 2), r1 = e.wat[1].slice(a.naam[1].length + 2);
        var w = r0 === r1 ? woordVoor(r0, a) : null;
        if (w) e.wat = [a.naam[0] + ': ' + w[0], a.naam[1] + ': ' + w[1]];
      }
    }
    return voegToeKern.call(HV.logboek, e);
  };

  // Дії матриці дозволів для нових можливостей (специфічні стоять перед загальними «Клімат у межах» і «Медіа»).
  var plafond = function () { var g = HV.staat.w && HV.staat.w.apparaten.multiroom; var m = g ? String(g.st.plafond || '').match(/^plafond-(\d+)$/) : null; return m ? +m[1] : null; };
  HV.plafondMedia = plafond;
  if (HV.gevaar && HV.gevaar.acties) {
    HV.gevaar.acties.unshift(
      { sleutel: 'media.luid', soorten: ['speaker', 'speakergroep', 'tv'], mogelijkheid: 'volume', als: function (a, v) { var p = plafond(); return p != null && Number(v) > p; }, niveau: 'gevoelig', naam: ['Гучність понад стелю', 'Volume boven het plafond'] },
      { sleutel: 'media.plafond', soorten: ['speakergroep'], mogelijkheid: 'plafond', niveau: 'gevoelig', naam: ['Стеля гучності', 'Volumeplafond'] },
      { sleutel: 'media.omroep', soorten: ['speaker', 'speakergroep'], mogelijkheid: 'omroep', niveau: 'gevoelig', naam: ['Оголошення в колонках', 'Omroepen via de speakers'] },
      { sleutel: 'warmtepomp.warmwater', soorten: ['warmtepomp'], mogelijkheid: 'warmwater', niveau: 'gevoelig', naam: ['Гаряча вода теплового насоса', 'Warm water van de warmtepomp'] },
      { sleutel: 'warmtepomp.stil', soorten: ['warmtepomp'], mogelijkheid: 'stilstand', niveau: 'gevoelig', naam: ['Тихий режим теплового насоса', 'Stille stand van de warmtepomp'] },
      { sleutel: 'warmtepomp.stooklijn', soorten: ['warmtepomp'], mogelijkheid: 'stooklijn', niveau: 'gevoelig', naam: ['Крива опалення', 'Stooklijn'] },
      { sleutel: 'boiler.legionella', soorten: ['boiler'], mogelijkheid: 'legionella', niveau: 'gevoelig', naam: ['Прогрів бойлера до 65 °C', 'Boiler opwarmen tot 65 °C'] },
      { sleutel: 'klimaat.vakantie', soorten: ['thermostaat'], mogelijkheid: 'vakantie', niveau: 'gevoelig', naam: ['Відпустка для клімату', 'Vakantiestand van het klimaat'] },
      { sleutel: 'klimaat.rooster', soorten: ['thermostaat'], mogelijkheid: 'rooster', niveau: 'gewoon', naam: ['Тижневий розклад', 'Weekschema'] }
    );
  }

  // ───────────────────────── 1. Розклад, відпустка, зони ─────────────────────────
  function leesRooster(s) {
    var delen = String(s || ROOSTER_STANDAARD).replace(/^v1\|/, '').split(';');
    var dagen = [];
    for (var i = 0; i < 7; i++) {
      dagen.push((delen[i] || delen[0]).split(',').map(function (b) { var x = b.split('-'); return { van: Number(x[0].slice(0, 2)) * 60 + Number(x[0].slice(2)), temp: Number(x[1]) / 10 }; }).sort(function (p, q) { return p.van - q.van; }));
      if (!dagen[i].length || dagen[i][0].van !== 0) dagen[i].unshift({ van: 0, temp: 18 });
    }
    return dagen;
  }
  function schrijfRooster(dagen) {
    return 'v1|' + dagen.map(function (d) { return d.map(function (b) { return twee(Math.floor(b.van / 60)) + twee(b.van % 60) + '-' + Math.round(b.temp * 10); }).join(','); }).join(';');
  }
  var dagIndex = function (ms) { return (new Date(ms).getUTCDay() + 6) % 7; };
  var middernacht = function (ms) { var d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  /** Блок розкладу на момент ms: { dag, i, temp, tot } (tot — початок наступного блоку). */
  function roosterOp(dagen, ms) {
    var di = dagIndex(ms), m = Math.floor((ms - middernacht(ms)) / MIN), dag = dagen[di], i = 0;
    for (var k = 0; k < dag.length; k++) if (dag[k].van <= m) i = k;
    var tot = i + 1 < dag.length ? middernacht(ms) + dag[i + 1].van * MIN : middernacht(ms) + DAG + dagen[(di + 1) % 7][0].van * MIN;
    return { dag: di, i: i, temp: dag[i].temp, tot: tot, sleutel: di + '-' + dag[i].van };
  }
  var DAGEN = [['Пн', 'ma'], ['Вт', 'di'], ['Ср', 'wo'], ['Чт', 'do'], ['Пт', 'vr'], ['Сб', 'za'], ['Нд', 'zo']];
  var DAGEN_LANG = [['понеділок', 'maandag'], ['вівторок', 'dinsdag'], ['середа', 'woensdag'], ['четвер', 'donderdag'], ['п’ятниця', 'vrijdag'], ['субота', 'zaterdag'], ['неділя', 'zondag']];
  var minTekst = function (m) { return twee(Math.floor(m / 60) % 24) + ':' + twee(m % 60); };

  function vakantie(w) {
    var th = w.apparaten.thermostaat, m = th ? String(th.st.vakantie || '').match(/^vakantie-(\d+)-(\d+)$/) : null;
    return m ? { eind: +m[1], temp: +m[2] / 10 } : null;
  }

  // Зони клімату: кімната → регулятор (якщо є) і датчик. Без регулятора ціль тримає кімната (kamer:<id>, doel).
  var ZONES = [
    { kamer: 'woonkamer', regelaar: 'thermostaat', sensor: 'tempwoon' },
    { kamer: 'keuken', regelaar: null, sensor: 'tempkeuken' },
    { kamer: 'slaapkamer', regelaar: null, sensor: 'tempslaap', extra: 'airco', raam: 'raamslaap' },
    { kamer: 'kinderkamer', regelaar: 'radiatorkinder', sensor: 'tempkinder', raam: 'raamkinder' },
    { kamer: 'badkamer', regelaar: 'vloerbad', sensor: null },
    { kamer: 'werkkamer', regelaar: null, sensor: 'tempwerk' },
    { kamer: 'zolder', regelaar: null, sensor: 'tempzolder' }
  ];
  /** Стан зони: { kamer, a (регулятор), gemeten, doel, bezig, woord, pauze, staat }. */
  function zoneStaat(z) {
    var w = HV.staat.w, k = HV.staat.kamer(z.kamer), a = z.regelaar ? w.apparaten[z.regelaar] : null, s = z.sensor ? w.apparaten[z.sensor] : null;
    var gemeten = a && 'temperatuur' in a.st ? a.st.temperatuur : s ? s.st.waarde : null;
    if (s && z.kamer === 'woonkamer') gemeten = s.st.waarde;
    var doel = a ? HV.gewenst(a, 'doel') : k.doel;
    var raam = z.raam ? w.apparaten[z.raam] : null, raamOpen = !!(raam && raam.st.open);
    var x = { z: z, kamer: k, a: a, sensor: s, gemeten: gemeten, doel: doel, bezig: false, koelt: false, pauze: false, raamOpen: raamOpen, staat: null };
    if (a) x.staat = a.beschikbaar !== 'ok' ? a.beschikbaar : null;
    else if (s && s.beschikbaar !== 'ok') x.staat = s.beschikbaar;
    if (a && a.soort === 'thermostaat') x.bezig = !!a.st.verwarmt && a.st.modus !== 'uit';
    else if (a && a.soort === 'vloerverwarming') x.bezig = !!a.st.verwarmt && !!a.st.aan;
    else if (a && a.soort === 'radiatorkraan') { x.pauze = raamOpen && a.st.raamdetectie === 'raam-aan'; x.bezig = !x.pauze && (a.st.opening || 0) > 8; }
    var ac = z.extra ? w.apparaten[z.extra] : null;
    if (ac && ac.st.aan && ac.st.modus === 'koelen') x.koelt = true;
    x.uit = !!(a && ((a.soort === 'thermostaat' && a.st.modus === 'uit') || ('aan' in a.st && !a.st.aan)));
    return x;
  }
  function zoneWoord(x) {
    if (x.staat === 'verouderd') return t('застаріло', 'verouderd');
    if (x.staat === 'slaapt' && !x.pauze && !x.bezig) return t('спить · ', 'slaapt · ') + (x.gemeten != null && x.doel != null && x.gemeten < x.doel - 0.2 ? t('нижче цілі', 'onder het doel') : t('у межах', 'binnen bereik'));
    if (x.pauze) return t('пауза: вікно відчинене', 'pauze: raam open');
    if (x.uit) return HV.woord.uit();
    if (x.koelt) return HV.woord.koelt();
    if (x.bezig) return HV.woord.verwarmt();
    if (x.doel == null) return t('без регулювання', 'niet geregeld');
    if (x.gemeten != null && x.gemeten < x.doel - 0.3) return t('нижче цілі', 'onder het doel');
    if (x.gemeten != null && x.gemeten > x.doel + 0.8) return t('тепліше за ціль', 'warmer dan het doel');
    return t('тримає', 'houdt vast');
  }

  // ───────────────────────── 2. Життя зони в симуляторі (підписник стану) ─────────────────────────
  var vorigeW = null, vorigeTijd = null, eindeBezig = null;
  function leven() {
    var w = HV.staat.w;
    if (!w || !w.apparaten || !w.apparaten.thermostaat) return;
    if (w !== vorigeW) { vorigeW = w; vorigeTijd = w.tijd; }
    var dt = klem((w.tijd - vorigeTijd) / UUR, 0, 2);
    vorigeTijd = w.tijd;
    var A = w.apparaten, live = w.gegevens === 'live';
    var systeem = { soort: 'systeem', naam: ['Розклад термостата', 'Rooster van de thermostaat'] };
    // розклад термостата (режим «За розкладом»): на межі блоку ціль переходить до нового значення
    var th = A.thermostaat;
    var vak = vakantie(w);
    if (th.st.modus !== 'auto' || vak) th.st.roosterSleutel = null;
    else if (live) {
      var r = roosterOp(leesRooster(th.st.rooster), w.tijd);
      if (th.st.roosterSleutel !== r.sleutel) {
        var eerste = th.st.roosterSleutel == null;
        th.st.roosterSleutel = r.sleutel;
        if (th.st.doel !== r.temp && !th.wacht) {
          var was = th.st.doel;
          th.st.doel = r.temp;
          th.maker = { soort: 'systeem', naam: systeem.naam, tijd: w.tijd, echt: Date.now() };
          HV.logboek.voegToe({ maker: systeem, wat: ['Термостат: ціль ' + HV.getal(r.temp, 1) + ' °C за розкладом', 'Thermostaat: doel ' + HV.getal(r.temp, 1) + ' °C volgens rooster'], waarom: eerste ? ['режим «За розкладом»', 'stand ‘Volgens rooster’'] : ['новий блок розкладу', 'nieuw blok van het rooster'], was: [HV.getal(was, 1) + ' °C', HV.getal(was, 1) + ' °C'], werd: [HV.getal(r.temp, 1) + ' °C', HV.getal(r.temp, 1) + ' °C'], soort: 'huis.automatisering', doel: 'thermostaat' });
        }
      }
    }
    // відпустка закінчилася: повернути цілі (запланувала людина — виконується від її імені)
    if (vak && w.tijd >= vak.eind && eindeBezig !== th.st.vakantie) { eindeBezig = th.st.vakantie; setTimeout(function () { eindeVakantie(true); }, 0); }
    // посилення вентиляції й таймери сну колонок
    var v = A.ventilatie, m;
    if (v && (m = String(v.st.boost).match(/^boost-tot-(\d+)$/)) && w.tijd >= +m[1]) {
      v.st.boost = 'boost-uit';
      HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Таймер вентиляції', 'Timer van de ventilatie'] }, wat: ['Вентиляція: посилення завершено', 'Ventilatie: versterking voorbij'], waarom: ['відлік завершено', 'aftellen voorbij'], soort: 'huis.automatisering', doel: 'ventilatie' });
    }
    HV.kijk.alle(function (a) { return a.soort === 'speaker' || a.soort === 'speakergroep'; }).forEach(function (a) {
      var s = String(a.st.slaaptimer || '').match(/^stil-om-(\d+)$/);
      if (s && w.tijd >= +s[1]) {
        a.st.slaaptimer = 'geen-timer';
        if (a.leden) a.leden.forEach(function (id) { A[id].st.speelt = false; });
        a.st.speelt = false;
        HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Таймер сну', 'Slaaptimer'] }, wat: [a.naam[0] + ': відтворення зупинено', a.naam[1] + ': afspelen gestopt'], waarom: ['таймер сну', 'slaaptimer'], soort: 'huis.automatisering', doel: a.id });
      }
    });
    // склад мультируму
    var g = A.multiroom, sl = g && String(g.st.samenstelling || '').match(/^leden:(.*)$/);
    if (sl) { var leden = sl[1] ? sl[1].split('+').filter(function (id) { return A[id]; }) : []; if (leden.join('+') !== g.leden.join('+')) g.leden = leden; }
    // кімнати з регулятором тримають ту саму ціль, що й регулятор
    [['woonkamer', 'thermostaat'], ['kinderkamer', 'radiatorkinder'], ['badkamer', 'vloerbad']].forEach(function (p) { var k = HV.staat.kamer(p[0]); if (k && A[p[1]]) k.doel = A[p[1]].st.doel; });
    if (!live || !dt) return;
    // радіаторний клапан: відкриття за різницею й пауза при відчиненому вікні
    var rk = A.radiatorkinder;
    if (rk) {
      var pauze = A.raamkinder && A.raamkinder.st.open && rk.st.raamdetectie === 'raam-aan';
      var tk = A.tempkinder ? A.tempkinder.st.waarde : rk.st.temperatuur;
      rk.st.temperatuur = Math.round(tk * 10) / 10;
      rk.st.opening = pauze ? 0 : Math.round(klem((rk.st.doel - tk) * 45 + 12, 0, 100));
    }
    // зволожувач, очищувач, бойлер, тепла підлога — повільні фізичні величини
    var bv = A.bevochtiger;
    if (bv) {
      if (bv.st.aan && bv.st.reservoir > 0) { bv.st.vocht += (bv.st.doel - bv.st.vocht) * Math.min(1, dt * 0.9); bv.st.reservoir = Math.max(0, bv.st.reservoir - dt * (bv.st.modus === 'stil' ? 2 : 4)); }
      else bv.st.vocht += (44 - bv.st.vocht) * Math.min(1, dt * 0.3);
      bv.st.vocht = Math.round(bv.st.vocht * 10) / 10; bv.st.reservoir = Math.round(bv.st.reservoir * 10) / 10;
      if (bv.st.reservoir <= 0 && bv.st.aan) { bv.st.aan = false; HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Зволожувач', 'Luchtbevochtiger'] }, wat: ['Зволожувач: бак порожній, зупинився', 'Luchtbevochtiger: tank leeg, gestopt'], soort: 'huis.apparaat', gewicht: 'belangrijk', doel: 'bevochtiger' }); }
    }
    var lr = A.luchtreiniger;
    if (lr) { var naar = lr.st.aan ? ({ 1: 4, 2: 3, 3: 2, auto: 3, slaap: 4 })[lr.st.stand] || 3 : 9; lr.st.fijnstof = Math.round((lr.st.fijnstof + (naar - lr.st.fijnstof) * Math.min(1, dt * (lr.st.aan ? 1.4 : 0.25))) * 10) / 10; }
    var bo = A.boiler;
    if (bo) {
      var legi = String(bo.st.legionella).match(/^legionella-(\d+)$/), legiDoel = legi && w.tijd - +legi[1] < 2 * UUR ? 65 : bo.st.doel;
      bo.st.verwarmt = !!bo.st.aan && bo.st.temperatuur < legiDoel - 0.5 && !(bo.st.planning === 'goedkoop' && HV.tarief && HV.tarief.prijs && HV.tarief.prijs(w.tijd) > 0.3 && legiDoel === bo.st.doel);
      bo.st.temperatuur = Math.round(klem(bo.st.temperatuur + (bo.st.verwarmt ? 9 : -0.7) * dt, 15, 70) * 10) / 10;
    }
    var vl = A.vloerbad;
    if (vl) vl.st.vloer = Math.round(klem(vl.st.vloer + ((vl.st.verwarmt ? 29 : vl.st.temperatuur + 1.5) - vl.st.vloer) * Math.min(1, dt * 0.8), 15, 30) * 10) / 10;
  }
  if (HV.staat && HV.staat.abonneer) HV.staat.abonneer(leven);

  // ───────────────────────── 3. Дія зони ─────────────────────────
  // Можливості, які ядро описує словами саме; для решти — тихе виконання й власне сповіщення з тими самими правилами «Повернути».
  var KERN_WOORD = { aan: 1, afspelen: 1, doel: 1, volume: 1, modus: 1, ventilator: 1, bron: 1, stand: 1, aftel: 1 };
  function doe(a, mogelijkheid, waarde, opties) {
    var op = opties || {};
    var eigen = !KERN_WOORD[mogelijkheid] || (typeof waarde === 'string' && !HV.waardeNaam[waarde] && ['modus', 'ventilator', 'bron'].indexOf(mogelijkheid) >= 0);
    var was = HV.huidige(a, mogelijkheid);
    return HV.doe({ doel: a.id, mogelijkheid: mogelijkheid, waarde: waarde, stil: eigen || op.stil, waarom: op.waarom }).then(function (r) {
      if (r && r.ok && eigen && !op.stil) {
        var werd = woordVoor(waarde, a) || [String(waarde), String(waarde)], wasW = was == null ? null : woordVoor(was, a);
        var actie = HV.gevaar.vind(a, mogelijkheid, waarde);
        HV.meld({ maker: HV.mens(), icoon: HV.paspoort.soorten[a.soort].icoon, titel: HV.p(a.naam) + ': ' + HV.p(werd), tekst: wasW ? HV.p(wasW) + ' → ' + HV.p(werd) : '',
          terug: actie.niveau !== 'gewoon' && was != null ? function () { HV.doe({ doel: a.id, mogelijkheid: mogelijkheid, waarde: was, stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); } : null });
      }
      return r;
    });
  }
  HV.actie('km-doe', function (ctx, g) { var a = ap(g.doel); if (a) doe(a, g.mogelijkheid, g.waarde); });
  HV.actie('km-schuif', function (ctx, g) { if (g.fase !== 'klaar') return; var a = ap(g.doel); if (a && Number(g.waarde) !== Number(HV.huidige(a, g.mogelijkheid))) doe(a, g.mogelijkheid, Number(g.waarde)); });
  HV.actie('km-wijzer', function (ctx, g) { if (g.fase !== 'klaar') return; var a = ap(g.doel); if (a && Number(g.waarde) !== Number(HV.gewenst(a, 'doel'))) doe(a, 'doel', Number(g.waarde)); });
  HV.actie('km-stap', function (ctx, g) {
    var a = ap(g.doel), stap = Number(g.stap) || 1, lo = Number(g.min), hi = Number(g.max);
    if (!a) return;
    var nu = Number(HV.gewenst(a, g.mogelijkheid));
    var nieuw = klem(Math.round((nu + Number(g.richting) * stap) / stap) * stap, isNaN(lo) ? -999 : lo, isNaN(hi) ? 999 : hi);
    if (nieuw !== nu) doe(a, g.mogelijkheid, Math.round(nieuw * 10) / 10);
  });
  HV.actie('km-aftel', function (ctx, g) {
    var a = ap(g.doel), w = ctx.staat;
    if (!a) return;
    if (Number(g.minuten) > 0 && !HV.kijk.isAan(a)) { HV.meld({ icoon: 'timer', titel: HV.p(a.naam), tekst: t('Пристрій вимкнено — відлік не потрібен.', 'Het apparaat staat uit — aftellen is niet nodig.') }); return; }
    HV.doe({ doel: a.id, mogelijkheid: 'aftel', waarde: Number(g.minuten) > 0 ? w.tijd + Number(g.minuten) * MIN : null });
  });

  // ───────────────────────── 4. Будівельні блоки ─────────────────────────
  var veld = function (label, html, extra, klas) { return '<div class="hv-veld' + (klas ? ' ' + klas : '') + '"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };
  var heeft = function (a, m) { return a.mog.indexOf(m) >= 0; };
  var gewenst = function (a, m) { return HV.gewenst(a, m); };

  /** Шапка аркуша: знак, слово стану, велике число й підпис. */
  function kop(a, p) {
    var b = o.beeld(a), sch = p.passief ? null : b.schakel;
    var aan = sch ? (a.wacht && a.wacht.mogelijkheid === sch.mogelijkheid ? a.wacht.waarde : b.aan) : b.aan;
    var schakel = o.schakel({ aan: aan, icoon: p.icoon || b.icoon, toon: p.toon || b.toon, staat: a.wacht ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : null), actie: sch ? 'schakel' : null, gegevens: sch ? { doel: a.id, mogelijkheid: sch.mogelijkheid } : null, aria: HV.p(a.naam) });
    var woord = a.wacht ? HV.woord.wacht() : p.woord;
    return '<div class="hv-bediening__hoofd hv-km-hoofd" data-k="hoofd">' + schakel + '<div class="hv-km-hoofd__tekst"><p class="hv-bediening__woord">' + h(woord) + '</p>' +
      (p.getal ? '<p class="hv-bediening__getal">' + p.getal + '</p>' : '') + (p.sub ? '<p class="hv-km-hoofd__sub">' + p.sub + '</p>' : '') + '</div>' + (p.rechts ? '<div class="hv-km-hoofd__rechts">' + p.rechts + '</div>' : '') + '</div>';
  }
  function waarom(a) {
    if (!HV.makerZichtbaar(a)) return '';
    return '<p class="hv-waarom" data-k="waarom">' + h(t('Змінено: ', 'Gewijzigd: ')) + o.maker(a.maker) + '</p>';
  }
  /** Паперова плашка-повідомлення: стан припущено, спить, застаріло, вікно відчинене. */
  function plaat(p) {
    return '<div class="hv-km-let' + (p.toon ? ' hv-km-let--' + p.toon : '') + '" data-k="' + h(p.k || 'let') + '"><span class="hv-km-let__teken">' + HV.icoon(p.icoon, { maat: 's' }) + '</span><div class="hv-km-let__lijf"><p class="hv-km-let__kop">' + h(p.kop) + '</p>' +
      (p.tekst ? '<p class="hv-km-let__tekst">' + h(p.tekst) + '</p>' : '') + (p.knoppen ? '<div class="hv-km-let__knoppen">' + p.knoppen + '</div>' : '') + '</div></div>';
  }
  function toestand(a) {
    if (a.beschikbaar === 'verondersteld') return plaat({ k: 'verondersteld', icoon: 'circle-help', toon: 'let-op', kop: t('Стан припущено', 'Toestand verondersteld'),
      tekst: t('Пристрій керується через інфрачервоний пульт і не повідомляє, чи виконав команду. Показано те, що надіслано востаннє.', 'Het apparaat wordt via een infraroodzender bediend en meldt niet of het de opdracht uitvoerde. Je ziet wat het laatst is verstuurd.'),
      knoppen: o.knop({ tekst: t('Виправити стан', 'Toestand corrigeren'), icoon: 'refresh-cw', klein: true, actie: 'km-toestand', gegevens: { doel: a.id } }) });
    if (a.beschikbaar === 'slaapt') return plaat({ k: 'slaapt', icoon: 'moon', kop: t('Пристрій спить, щоб берегти батарейку', 'Het apparaat slaapt om de batterij te sparen'),
      tekst: t('Команда дійде під час наступного пробудження — зазвичай до 5 хвилин. Востаннє на зв’язку ', 'Een opdracht komt aan bij het volgende ontwaken — meestal binnen 5 minuten. Laatst bereikbaar ') + HV.oud(HV.kijk.leeftijd(a)) + t(' тому.', ' geleden.') });
    if (a.beschikbaar === 'verouderd') return plaat({ k: 'verouderd', icoon: 'clock', toon: 'let-op', kop: t('Дані застаріли', 'Gegevens verouderd'), tekst: t('Останнє значення отримано ', 'De laatste waarde kwam ') + HV.oud(HV.kijk.leeftijd(a)) + t(' тому; керування може не дійти.', ' geleden binnen; een opdracht komt mogelijk niet aan.') });
    return '';
  }
  HV.actie('km-toestand', function (ctx, g) {
    var a = ap(g.doel);
    if (!a) return;
    var nieuw = !a.st.aan;
    HV.staat.wijzig(function (w) { a.st.aan = nieuw; a.maker = { soort: 'mens', naam: HV.mens().naam, tijd: w.tijd, echt: Date.now() }; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: [a.naam[0] + ': стан виправлено — ' + (nieuw ? 'увімкнено' : 'вимкнено'), a.naam[1] + ': toestand gecorrigeerd — ' + (nieuw ? 'aan' : 'uit')], waarom: ['виправлено вручну, команду не надіслано', 'handmatig gecorrigeerd, geen opdracht verstuurd'], soort: 'huis.apparaat', doel: a.id });
    HV.meld({ maker: HV.mens(), icoon: 'refresh-cw', titel: HV.p(a.naam), tekst: t('Стан виправлено без надсилання команди.', 'Toestand gecorrigeerd zonder een opdracht te versturen.') });
  });

  /** hv-voortgang: горизонтальна шкала з поділками й підписом (заряд бака, фільтр, відкриття клапана, PM2.5). */
  function voortgang(p) {
    var deel = klem((p.waarde - (p.min || 0)) / ((p.max || 100) - (p.min || 0)) * 100, 0, 100);
    var merken = (p.merken || []).map(function (m) { var x = klem((m[0] - (p.min || 0)) / ((p.max || 100) - (p.min || 0)) * 100, 0, 100); return '<span class="hv-voortgang__merk" style="left:' + x.toFixed(1) + '%"><span>' + h(m[1]) + '</span></span>'; }).join('');
    return '<div class="hv-voortgang' + (p.toon ? ' hv-toon-' + p.toon : '') + (p.laag ? ' is-laag' : '') + (merken ? ' heeft-merken' : '') + '" role="meter" aria-label="' + h(p.label) + '" aria-valuemin="' + (p.min || 0) + '" aria-valuemax="' + (p.max || 100) + '" aria-valuenow="' + p.waarde + '" aria-valuetext="' + h(p.tekst || '') + '">' +
      '<span class="hv-voortgang__spoor"><span class="hv-voortgang__vulling" style="width:' + deel.toFixed(1) + '%"></span>' + merken + '</span>' +
      (p.tekst ? '<span class="hv-voortgang__tekst">' + h(p.tekst) + '</span>' : '') + '</div>';
  }

  /** Міні-дуга зони: ціль — дуга тоном, виміряне — крапка; 270°, 5–30 °C. */
  function boog(p) {
    var min = p.min || 5, max = p.max || 30, R = 26, C = 32;
    var punt = function (v) { var hoek = (135 + 270 * klem((v - min) / (max - min), 0, 1)) * Math.PI / 180; return [C + R * Math.cos(hoek), C + R * Math.sin(hoek)]; };
    var pad = function (van, tot) { var a = punt(van), b = punt(tot); var groot = (tot - van) / (max - min) * 270 > 180 ? 1 : 0; return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + groot + ' 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); };
    var d = p.doel != null ? punt(p.doel) : null, m = p.gemeten != null ? punt(p.gemeten) : null;
    return '<svg class="hv-boog hv-toon-' + h(p.toon || 'warm') + (p.bezig ? ' is-bezig' : '') + '" viewBox="0 0 64 64" aria-hidden="true"><path class="hv-boog__baan" d="' + pad(min, max) + '"/>' +
      (p.doel != null ? '<path class="hv-boog__vulling" d="' + pad(min, klem(p.doel, min, max)) + '"/><circle class="hv-boog__knop" cx="' + d[0].toFixed(1) + '" cy="' + d[1].toFixed(1) + '" r="4.5"/>' : '') +
      (m ? '<circle class="hv-boog__gemeten" cx="' + m[0].toFixed(1) + '" cy="' + m[1].toFixed(1) + '" r="2.4"/>' : '') + '</svg>';
  }

  /** Знак-перемикач для режимів «так/ні» зі своєю можливістю (тихий режим, пауза при вікні, блокування від дітей). */
  function schakelRij(p) {
    return '<div class="hv-km-schakelrij" data-k="' + h(p.k) + '">' + o.schakel({ aan: p.aan, icoon: p.icoon, toon: p.toon || 'neutraal', klein: true, actie: 'km-doe', gegevens: { doel: p.doel, mogelijkheid: p.mogelijkheid, waarde: p.aan ? p.uit : p.op }, aria: p.naam }) +
      '<span class="hv-km-schakelrij__tekst"><span class="hv-km-schakelrij__naam">' + h(p.naam) + '</span>' + (p.sub ? '<span class="hv-km-schakelrij__sub">' + h(p.sub) + '</span>' : '') + '</span>' + (p.gevolg ? o.gevolg(p.gevolg, { kop: p.naam }) : '') + '</div>';
  }

  /** Повзунок гучності з позначкою стелі (якщо стелю задано). */
  function plafondOm(schuif) { var p = plafond(); return p == null ? schuif : '<div class="hv-plafond" style="--plafond:' + p + '%">' + schuif + '</div>'; }

  // ───────────────────────── 5. Графіки ─────────────────────────
  var ruis = function (zaad, i) { var x = Math.sin(zaad * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };
  var zaadVan = function (s) { var z = 0; for (var i = 0; i < s.length; i++) z = (z * 31 + s.charCodeAt(i)) % 9973; return z; };
  var merkIcoon = { warm: 'merk-streep', koud: 'merk-streep', neutraal: 'merk-vierkant', aan: 'merk-cirkel', zon: 'merk-cirkel', 'net-in': 'merk-vierkant', batterij: 'merk-halve-cirkel', auto: 'merk-kruis' };
  /** Лінійний графік вузького діапазону (температура, вологість): шкала без примусового нуля. */
  function lijnSmal(p) {
    var ys = [];
    p.reeksen.forEach(function (r) { r.punten.forEach(function (q) { ys.push(q[1]); }); });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    var ruw = Math.max(0.5, (hi - lo) / 3), macht = Math.pow(10, Math.floor(Math.log(ruw) / Math.LN10));
    var stap = [1, 2, 2.5, 5, 10].map(function (m) { return m * macht; }).filter(function (s) { return s >= ruw; })[0] || ruw;
    var min = Math.floor(lo / stap) * stap, max = Math.ceil(hi / stap) * stap;
    if (max - min < stap * 2) max = min + stap * 2;
    var dec = stap < 1 ? 1 : 0, tikken = [];
    for (var v = min; v <= max + stap / 1000; v += stap) tikken.push(Math.round(v * 100) / 100);
    var X = function (x) { return (x - p.van) / (p.tot - p.van) * 100; };
    var Y = function (y) { return 100 - (y - min) / (max - min) * 100; };
    var paden = '', namen = '';
    p.reeksen.forEach(function (r) {
      var d = r.punten.map(function (q, i) { return (i ? 'L' : 'M') + X(q[0]).toFixed(2) + ' ' + Y(q[1]).toFixed(2); }).join('');
      if (r.vlak) paden += '<path class="hv-grafiek__vlak hv-toon-' + h(r.toon) + '" d="' + d + 'L' + X(r.punten[r.punten.length - 1][0]).toFixed(2) + ' 100L' + X(r.punten[0][0]).toFixed(2) + ' 100Z"/>';
      paden += '<path class="hv-grafiek__lijn hv-toon-' + h(r.toon) + (r.dik ? ' is-dik' : '') + '" d="' + d + '" stroke-dasharray="' + (r.streep || '') + '"/>';
      var laatste = r.punten[r.punten.length - 1];
      namen += '<span class="hv-grafiek__naam hv-toon-' + h(r.toon) + '" style="left:' + X(laatste[0]).toFixed(1) + '%;top:' + Y(laatste[1]).toFixed(1) + '%">' + HV.icoon(r.merk || merkIcoon[r.toon] || 'merk-vierkant', { maat: 'merk' }) + '</span>';
    });
    var rooster = tikken.map(function (v) { return '<line class="hv-grafiek__raster" x1="0" x2="100" y1="' + Y(v).toFixed(2) + '" y2="' + Y(v).toFixed(2) + '"/>'; }).join('');
    var yLabels = tikken.map(function (v) { return '<span class="hv-grafiek__y" style="top:' + Y(v).toFixed(1) + '%">' + HV.getal(v, dec) + '</span>'; }).join('');
    var xLabels = (p.tikken || []).map(function (k) { var x = X(k.x); return '<span class="hv-grafiek__x' + (x < 6 ? ' is-begin' : x > 94 ? ' is-eind' : '') + '" style="left:' + x.toFixed(1) + '%">' + h(k.label) + '</span>'; }).join('');
    var nu = p.nu != null && p.nu < p.tot - (p.tot - p.van) * 0.03 ? '<span class="hv-grafiek__nu" style="left:' + X(p.nu).toFixed(1) + '%"><span>' + h(t('зараз', 'nu')) + '</span></span>' : '';
    var veldHtml = '<div class="hv-grafiek__veld" style="height:' + (p.hoogte || 150) + 'px" role="img" aria-label="' + h((p.titel || '') + '. ' + (p.samenvatting || '')) + '"><div class="hv-grafiek__as">' + yLabels + '</div><div class="hv-grafiek__doek"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + rooster + paden + '</svg>' + namen + nu + '<div class="hv-grafiek__xas">' + xLabels + '</div></div></div>';
    var legenda = '<ul class="hv-grafiek__legenda">' + p.reeksen.map(function (r) { var l = r.punten[r.punten.length - 1]; return '<li class="hv-toon-' + h(r.toon) + '">' + HV.icoon(r.merk || merkIcoon[r.toon] || 'merk-vierkant', { maat: 'merk' }) + '<span>' + h(r.naam) + '</span><strong>' + HV.maat(l[1], p.eenheid, p.decimalen == null ? 1 : p.decimalen) + '</strong></li>'; }).join('') + '</ul>';
    var basis = p.reeksen[0].punten, stapje = Math.max(1, Math.round(basis.length / 12));
    var rijen = basis.filter(function (q, i) { return i % stapje === 0 || i === basis.length - 1; }).map(function (q) {
      return [HV.tijd(q[0])].concat(p.reeksen.map(function (r) { var z = r.punten.filter(function (y) { return y[0] === q[0]; })[0]; return z ? HV.getal(z[1], p.decimalen == null ? 1 : p.decimalen) : '—'; }));
    });
    var alsTabel = !!(HV.grafiek.open && HV.grafiek.open[p.id]);
    return '<figure class="hv-grafiek hv-grafiek--lijn" data-k="grafiek-' + h(p.id) + '">' + (p.titel ? '<div class="hv-grafiek__kop"><h3 class="hv-grafiek__titel">' + h(p.titel) + '</h3><span class="hv-grafiek__eenheid">' + h(p.eenheid) + '</span></div>' : '') +
      (alsTabel ? HV.tabel([t('Час', 'Tijd')].concat(p.reeksen.map(function (r) { return r.naam; })), rijen) : veldHtml) + legenda +
      (p.samenvatting ? '<figcaption class="hv-grafiek__zin">' + h(p.samenvatting) + '</figcaption>' : '') +
      '<button type="button" class="hv-link hv-grafiek__wissel" data-actie="grafiek-tabel" data-grafiek="' + h(p.id) + '" aria-pressed="' + (alsTabel ? 'true' : 'false') + '">' + h(alsTabel ? t('Показати графіком', 'Als grafiek tonen') : t('Показати як таблицю', 'Als tabel tonen')) + '</button></figure>';
  }
  var tikken24 = function (w) { var van = w.tijd - DAG; return [0, 6, 12, 18, 24].map(function (u) { return { x: van + u * UUR, label: HV.tijd(van + u * UUR) }; }); };
  /** Ряд за добу, що йде за ціллю із запізненням, із симульованим шумом; останнє значення — виміряне зараз. */
  function volgReeks(w, sleutel, doelOp, nu, opties) {
    var op = opties || {}, zaad = zaadVan(sleutel), stap = 30 * MIN, n = 48, punten = [], m = doelOp(w.tijd - DAG) - (op.start || 0.6);
    for (var i = 0; i <= n; i++) {
      var x = w.tijd - DAG + i * stap, d = doelOp(x);
      m += (d - m) * (op.traag || 0.32) + ruis(zaad, i) * (op.ruis || 0.18);
      punten.push([x, m]);
    }
    if (nu != null) for (var j = 0; j < 6; j++) { var k = n - 5 + j, f = (j + 1) / 6; punten[k][1] = punten[k][1] * (1 - f) + nu * f; }
    return punten.map(function (q) { return [q[0], Math.round(q[1] * 100) / 100]; });
  }
  var buitenOp = function (w) { return function (x) { var u = HV.uur(x); return w.weer.temp - 2.2 + 3.2 * Math.sin((u - 9) / 24 * 2 * Math.PI); }; };
  function staafWeek(w, sleutel, basis, spreiding, eenheid, toon, titel, samenvatting, dec) {
    var zaad = zaadVan(sleutel), staven = [];
    for (var i = 6; i >= 0; i--) { var dag = w.tijd - i * DAG; staven.push({ label: HV.p(DAGEN[dagIndex(dag)]), waarde: Math.max(0, Math.round((basis + ruis(zaad, i) * spreiding) * 10) / 10), toon: toon, nu: i === 0, geschat: i === 0 }); }
    return HV.grafiek.staven({ id: 'week-' + sleutel, titel: titel, eenheid: eenheid, decimalen: dec == null ? 1 : dec, staven: staven, hoogte: 120, tikken: 1, samenvatting: samenvatting });
  }

  /** Історія: графік типу зверху, далі стрічка доби й записи Журналу з каркаса. */
  function historie(grafiek) {
    return function (ctx, a) { return '<div class="hv-km-blad">' + (grafiek ? o.kaart({ k: 'hist-grafiek', inhoud: grafiek(ctx, a) }) : '') + HV.bladDelen.geschiedenis(ctx, a) + '</div>'; };
  }
  /** Налаштування: власні рядки типу зверху, далі назви, дозволи й небезпечна зона з каркаса. */
  function instel(eigen) {
    return function (ctx, a) { return '<div class="hv-km-blad">' + (eigen ? eigen(ctx, a) : '') + HV.bladDelen.instellingen(ctx, a) + '</div>'; };
  }
  function paspoortRijen(a, rijen) {
    return o.kaart({ titel: t('Пристрій', 'Apparaat'), inhoud: '<div class="hv-rijen">' + rijen.map(function (r) { return o.rij({ icoon: r[0], naam: HV.p(r[1]), waarde: h(HV.p(r[2])) }); }).join('') + '</div>' });
  }

  // ───────────────────────── 6. Аркуші: клімат ─────────────────────────
  var VOORKEUZE = [['comfort', ['Комфорт', 'Comfort'], 'sofa'], ['slaap', ['Сон', 'Slaap'], 'moon'], ['eco', ['Економно', 'Eco'], 'leaf'], ['boost', ['Посилено', 'Boost'], 'flame']];
  var voorkeuzes = function (a) { var m = String(a.st.voorkeuzes || 'vk-210-180-170-230').match(/^vk-(\d+)-(\d+)-(\d+)-(\d+)$/); return m ? m.slice(1).map(function (x) { return +x / 10; }) : [21, 18, 17, 23]; };

  function thermostaat(ctx, a) {
    var w = ctx.staat, st = a.st, doel = gewenst(a, 'doel'), modus = gewenst(a, 'modus'), vak = vakantie(w);
    var dagen = leesRooster(st.rooster), nu = roosterOp(dagen, w.tijd), vk = voorkeuzes(a);
    var wijzer = o.wijzer({ doel: doel, gemeten: ap('tempwoon') ? ap('tempwoon').st.waarde : st.temperatuur, toon: 'warm', bezig: !!st.verwarmt && modus !== 'uit', actie: 'km-wijzer', gegevens: { doel: a.id }, label: t('Ціль температури у вітальні', 'Doeltemperatuur woonkamer'), k: 'wijzer-' + a.id });
    if (modus === 'uit') wijzer = wijzer.replace('>' + h(t('тримає', 'houdt vast')) + '<', '>' + h(HV.woord.uit()) + '<');
    var uit = '';
    if (vak) uit += plaat({ k: 'vakantie', icoon: 'luggage', kop: t('Відпустка до ', 'Vakantie tot ') + HV.p(datumPaar(vak.eind)) + ', ' + HV.tijd(vak.eind), tekst: t('Усі зони тримають ', 'Alle zones houden ') + HV.maatTekst(vak.temp, '°C', 1) + t('; потім цілі повернуться самі.', '; daarna komen de doelen vanzelf terug.'), knoppen: o.knop({ tekst: t('Завершити відпустку', 'Vakantie beëindigen'), klein: true, icoon: 'x', actie: 'km-vakantie-eind' }) });
    uit += '<div class="hv-km-wijzerrij">' + wijzer + '<div class="hv-km-wijzerrij__zij">' +
      o.getal({ maat: 'm', label: t('Надворі', 'Buiten'), waarde: HV.maat(w.weer.temp, '°C', 0) }) +
      o.getal({ maat: 'm', label: t('Тепловий насос', 'Warmtepomp'), waarde: HV.maat(ap('warmtepomp').st.aanvoer, '°C', 1), sub: h(t('подача', 'aanvoer')) }) +
      o.getal({ maat: 'm', label: t('Батарейка', 'Batterij'), waarde: HV.maat(a.batterij || 84, '%') }) + '</div></div>';
    uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим термостата', 'Stand van de thermostaat'), waarde: modus, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, k: 'th-modus', opties: [{ id: 'uit', label: t('Вимкнено', 'Uit'), icoon: 'power' }, { id: 'verwarmen', label: t('Вручну', 'Handmatig'), icoon: 'hand' }, { id: 'auto', label: t('Розклад', 'Rooster'), icoon: 'calendar-clock' }] }),
      ' ' + o.gevolg(t('Що станеться: «Вручну» тримає вашу ціль, доки ви її не зміните; «Розклад» сам міняє ціль на межах блоків тижневого розкладу; «Вимкнено» зупиняє опалення вітальні. Пов’язано з: тепловий насос гріє, коли гріє хоч одна зона. Як повернути: оберіть інший режим.', 'Wat er gebeurt: ‘Handmatig’ houdt jouw doel vast tot je het wijzigt; ‘Rooster’ wijzigt het doel zelf op de grenzen van het weekschema; ‘Uit’ stopt de verwarming van de woonkamer. Hangt samen met: de warmtepomp verwarmt zodra één zone warmte vraagt. Terugdraaien: kies een andere stand.'), { kop: t('Режим', 'Stand') }));
    if (modus === 'auto' && !vak) {
      uit += Math.abs(doel - nu.temp) > 0.05
        ? '<div class="hv-km-tijdelijk" data-k="tijdelijk">' + HV.icoon('clock-alert', { maat: 's' }) + '<span>' + h(t('Тимчасово до ', 'Tijdelijk tot ') + HV.tijd(nu.tot) + t(' · за розкладом ', ' · volgens rooster ') + HV.maatTekst(nu.temp, '°C', 1)) + '</span>' + o.knop({ tekst: t('До розкладу', 'Terug naar rooster'), klein: true, soort: 'stil', actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'doel', waarde: nu.temp } }) + '</div>'
        : '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('calendar-clock', { maat: 's' }) + h(t('За розкладом до ', 'Volgens rooster tot ') + HV.tijd(nu.tot) + t(', далі ', ', daarna ') + HV.maatTekst(roosterOp(dagen, nu.tot + MIN).temp, '°C', 1)) + '</p>';
    }
    uit += veld(t('Заготовки', 'Voorkeuzes'), '<div class="hv-km-voorkeuzes">' + VOORKEUZE.map(function (v, i) {
      var gekozen = Math.abs(doel - vk[i]) < 0.05;
      return '<button type="button" class="hv-km-voorkeuze' + (gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="km-voorkeuze" data-doel="' + h(a.id) + '" data-i="' + i + '">' + HV.icoon(v[2], { maat: 's' }) + '<span class="hv-km-voorkeuze__naam">' + h(HV.p(v[1])) + '</span><span class="hv-km-voorkeuze__getal">' + h(HV.maatTekst(vk[i], '°C', 1)) + '</span></button>';
    }).join('') + '</div>');
    var kaart = o.kaart({ k: 'th-bediening', inhoud: uit }) + waarom(a);
    var rooster = o.kaart({ k: 'th-rooster', titel: t('Тижневий розклад', 'Weekschema'), extra: o.knop({ tekst: t('На всю сторінку', 'Volledige pagina'), klein: true, soort: 'stil', icoon: 'maximize-2', actie: 'ga', gegevens: { naar: 'kamers-klimaat-weekschema' } }), inhoud: roosterEditor(ctx, a, true) });
    return '<div class="hv-km-blad">' + toestand(a) + kaart + rooster + '</div>';
  }
  HV.actie('km-voorkeuze', function (ctx, g) {
    var a = ap(g.doel), i = Number(g.i), vk = voorkeuzes(a), v = VOORKEUZE[i];
    HV.doe({ doel: a.id, mogelijkheid: 'doel', waarde: vk[i], waarom: ['заготовка «' + v[1][0] + '»', 'voorkeuze ‘' + v[1][1] + '’'] });
  });

  // Редактор тижневого розкладу: огляд семи днів і правка вибраного дня; чернетка живе в HV.ui, «Зберегти» — одна дія.
  function roosterConcept(a) { return HV.ui.lees('rooster-concept', null) || a.st.rooster; }
  function warmteTrede(temp) { return temp >= 22 ? 5 : temp >= 20.5 ? 4 : temp >= 19 ? 3 : temp >= 17.5 ? 2 : 1; }
  function roosterEditor(ctx, a, kort) {
    var w = ctx.staat, concept = roosterConcept(a), dagen = leesRooster(concept), vandaag = dagIndex(w.tijd);
    var gekozen = Number(HV.ui.lees('rooster-dag', vandaag)), gewijzigd = concept !== a.st.rooster;
    var nuMin = Math.floor((w.tijd - middernacht(w.tijd)) / MIN);
    var week = '<div class="hv-rooster" role="group" aria-label="' + h(t('Огляд тижня', 'Weekoverzicht')) + '">' + dagen.map(function (dag, di) {
      var blokken = dag.map(function (b, i) {
        var tot = i + 1 < dag.length ? dag[i + 1].van : 1440;
        return '<span class="hv-rooster__blok hv-km-t' + warmteTrede(b.temp) + '" style="left:' + (b.van / 14.4).toFixed(2) + '%;width:' + ((tot - b.van) / 14.4).toFixed(2) + '%" title="' + h(minTekst(b.van) + '–' + minTekst(tot) + ' · ' + HV.maatTekst(b.temp, '°C', 1)) + '"><span>' + HV.getal(b.temp, b.temp % 1 ? 1 : 0) + '</span></span>';
      }).join('');
      return '<button type="button" class="hv-rooster__dag' + (di === gekozen ? ' is-gekozen' : '') + (di === vandaag ? ' is-vandaag' : '') + '" aria-pressed="' + (di === gekozen ? 'true' : 'false') + '" data-actie="ui" data-naam="rooster-dag" data-waarde="' + di + '" aria-label="' + h(HV.p(DAGEN_LANG[di])) + '">' +
        '<span class="hv-rooster__naam">' + h(HV.p(DAGEN[di])) + '</span><span class="hv-rooster__baan">' + blokken + (di === vandaag ? '<span class="hv-rooster__nu" style="left:' + (nuMin / 14.4).toFixed(2) + '%"></span>' : '') + '</span></button>';
    }).join('') + '<div class="hv-rooster__as" aria-hidden="true"><span></span><span class="hv-rooster__uren"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></span></div></div>';
    var dag = dagen[gekozen];
    var rijen = dag.map(function (b, i) {
      var tot = i + 1 < dag.length ? dag[i + 1].van : 1440;
      var g = function (veldNaam, richting) { return { dag: gekozen, i: i, veld: veldNaam, richting: richting, doel: a.id }; };
      return '<div class="hv-rooster__rij" data-k="rij-' + gekozen + '-' + i + '"><span class="hv-rooster__stip hv-km-t' + warmteTrede(b.temp) + '" aria-hidden="true"></span>' +
        '<span class="hv-rooster__tijd">' + (i === 0 ? '<span class="hv-rooster__vast">00:00</span>' : '<span class="hv-km-mini">' + o.icoonknop({ icoon: 'minus', aria: t('Раніше на 30 хв', '30 min eerder'), actie: 'km-rooster', gegevens: g('van', -1) }) + '<output>' + minTekst(b.van) + '</output>' + o.icoonknop({ icoon: 'plus', aria: t('Пізніше на 30 хв', '30 min later'), actie: 'km-rooster', gegevens: g('van', 1) }) + '</span>') +
        '<span class="hv-rooster__tot">' + h(t('до ', 'tot ') + minTekst(tot)) + '</span></span>' +
        '<span class="hv-km-mini hv-rooster__temp">' + o.icoonknop({ icoon: 'minus', aria: t('Холодніше на 0,5°', '0,5° kouder'), actie: 'km-rooster', gegevens: g('temp', -1) }) + '<output>' + h(HV.maatTekst(b.temp, '°C', 1)) + '</output>' + o.icoonknop({ icoon: 'plus', aria: t('Тепліше на 0,5°', '0,5° warmer'), actie: 'km-rooster', gegevens: g('temp', 1) }) + '</span>' +
        (i > 0 ? o.icoonknop({ icoon: 'trash-2', aria: t('Видалити блок', 'Blok verwijderen'), actie: 'km-rooster', gegevens: { dag: gekozen, i: i, veld: 'weg', doel: a.id }, klas: 'hv-rooster__weg' }) : '<span class="hv-rooster__weg" aria-hidden="true"></span>') + '</div>';
    }).join('');
    var kopie = '<div class="hv-filter hv-rooster__kopie">' + [['werkdagen', ['На всі будні', 'Naar alle werkdagen']], ['weekend', ['На вихідні', 'Naar het weekend']], ['volgende', ['На наступний день', 'Naar de volgende dag']], ['alle', ['На весь тиждень', 'Naar de hele week']]].map(function (x) {
      return o.chip({ icoon: 'copy', tekst: HV.p(x[1]), actie: 'km-rooster-kopie', gegevens: { dag: gekozen, naar: x[0], doel: a.id }, k: 'kopie-' + x[0] });
    }).join('') + '</div>';
    var opslaan = gewijzigd
      ? '<div class="hv-rooster__opslaan" data-k="rooster-opslaan"><span class="hv-rooster__concept">' + HV.icoon('pencil', { maat: 's' }) + h(t('Незбережені зміни', 'Niet-opgeslagen wijzigingen')) + '</span>' + o.knop({ tekst: t('Скасувати', 'Annuleren'), klein: true, soort: 'stil', actie: 'ui', gegevens: { naam: 'rooster-concept', waarde: '' } }) + o.knop({ tekst: t('Зберегти розклад', 'Rooster opslaan'), klein: true, soort: 'hoofd', icoon: 'check', actie: 'km-rooster-opslaan', gegevens: { doel: a.id } }) + '</div>'
      : '';
    var modusNoot = gewenst(a, 'modus') !== 'auto'
      ? '<div class="hv-km-tijdelijk" data-k="rooster-modus">' + HV.icoon('calendar-x', { maat: 's' }) + '<span>' + h(t('Розклад зараз не діє: термостат у режимі «', 'Het rooster werkt nu niet: de thermostaat staat op ‘') + HV.p(gewenst(a, 'modus') === 'uit' ? ['Вимкнено', 'Uit'] : ['Вручну', 'Handmatig']) + t('».', '’.')) + '</span>' + o.knop({ tekst: t('Увімкнути розклад', 'Rooster aanzetten'), klein: true, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'modus', waarde: 'auto' } }) + '</div>'
      : '';
    return '<div class="hv-km-rooster' + (kort ? ' is-kort' : '') + '" data-k="rooster-editor">' + modusNoot + week +
      '<div class="hv-rooster__bewerk"><div class="hv-rooster__bewerkkop"><h4>' + h(HV.p(DAGEN_LANG[gekozen])) + '</h4><span class="hv-rooster__aantal">' + h(dag.length + ' ' + HV.meervoud(dag.length, ['блок', 'блоки', 'блоків'], ['blok', 'blokken'])) + '</span>' +
      o.knop({ tekst: t('Додати блок', 'Blok toevoegen'), klein: true, soort: 'stil', icoon: 'plus', actie: 'km-rooster', gegevens: { dag: gekozen, veld: 'nieuw', doel: a.id } }) + '</div>' +
      '<div class="hv-rooster__rijen">' + rijen + '</div>' + kopie + '</div>' + opslaan +
      '<p class="hv-km-noot">' + h(t('Що станеться: у режимі «Розклад» термостат на межі кожного блоку сам ставить його ціль; ваша ручна зміна діє до наступного блоку. Як повернути: «Скасувати» до збереження або «Повернути» у сповіщенні після.', 'Wat er gebeurt: in de stand ‘Rooster’ zet de thermostaat op de grens van elk blok zelf het doel; een handmatige wijziging geldt tot het volgende blok. Terugdraaien: ‘Annuleren’ vóór het opslaan of ‘Ongedaan maken’ in de melding erna.')) + '</p></div>';
  }
  HV.actie('km-rooster', function (ctx, g) {
    var a = ap(g.doel), dagen = leesRooster(roosterConcept(a)), dag = dagen[Number(g.dag)], i = Number(g.i), r = Number(g.richting);
    if (g.veld === 'temp') dag[i].temp = klem(rond(dag[i].temp + r * 0.5, 0.5), 5, 28);
    else if (g.veld === 'van') {
      var lo = dag[i - 1].van + 30, hi = (i + 1 < dag.length ? dag[i + 1].van : 1440) - 30;
      dag[i].van = klem(dag[i].van + r * 30, lo, hi);
    } else if (g.veld === 'weg') dag.splice(i, 1);
    else if (g.veld === 'nieuw') {
      var laatste = dag[dag.length - 1], van = Math.min(1410, laatste.van + 120);
      if (van <= laatste.van) { HV.meld({ icoon: 'calendar-clock', titel: t('Блок не додано', 'Geen blok toegevoegd'), tekst: t('Після останнього блоку немає місця до півночі.', 'Na het laatste blok is er geen ruimte meer tot middernacht.') }); return; }
      dag.push({ van: van, temp: 18 });
    }
    HV.ui.zet('rooster-concept', schrijfRooster(dagen));
  });
  HV.actie('km-rooster-kopie', function (ctx, g) {
    var a = ap(g.doel), dagen = leesRooster(roosterConcept(a)), van = Number(g.dag), bron = JSON.stringify(dagen[van]);
    var naar = g.naar === 'werkdagen' ? [0, 1, 2, 3, 4] : g.naar === 'weekend' ? [5, 6] : g.naar === 'volgende' ? [(van + 1) % 7] : [0, 1, 2, 3, 4, 5, 6];
    naar.forEach(function (d) { dagen[d] = JSON.parse(bron); });
    HV.ui.zet('rooster-concept', schrijfRooster(dagen));
    HV.meld({ icoon: 'copy', titel: t('Скопійовано в чернетку', 'Gekopieerd naar het concept'), tekst: t('Збережіть розклад, щоб зміни почали діяти.', 'Sla het rooster op om de wijziging te laten gelden.') });
  });
  HV.actie('km-rooster-opslaan', function (ctx, g) {
    var a = ap(g.doel), concept = HV.ui.lees('rooster-concept', null);
    if (!concept || concept === a.st.rooster) return;
    doe(a, 'rooster', concept).then(function (r) { if (r && r.ok) { a.st.roosterSleutel = null; HV.ui.zet('rooster-concept', ''); } });
  });

  function airco(ctx, a) {
    var st = a.st, modus = gewenst(a, 'modus'), aan = !!gewenst(a, 'aan'), koud = modus !== 'verwarmen', ts = ap('tempslaap');
    var uit = kop(a, { woord: aan ? HV.p(HV.waardeNaam[modus] || [modus, modus]) : HV.woord.uit(), getal: aan ? HV.maat(gewenst(a, 'doel'), '°C', 1) : '', sub: h(t('у спальні зараз ', 'in de slaapkamer nu ') + (ts ? HV.maatTekst(ts.st.waarde, '°C', 1) : '—')) });
    uit += '<div class="hv-km-wijzerrij is-enkel' + (aan ? '' : ' is-uit') + '">' + o.wijzer({ doel: gewenst(a, 'doel'), gemeten: ts ? ts.st.waarde : null, min: 16, max: 30, toon: koud ? 'koud' : 'warm', bezig: aan && (modus === 'koelen' || modus === 'verwarmen'), actie: 'km-wijzer', gegevens: { doel: a.id }, label: t('Ціль кондиціонера', 'Doel van de airco'), k: 'wijzer-' + a.id }).replace('>' + h(t('тримає', 'houdt vast')) + '<', '>' + h(aan ? t('тримає', 'houdt vast') : HV.woord.uit()) + '<') + '</div>';
    uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим кондиціонера', 'Stand van de airco'), waarde: modus, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, klas: 'hv-segment--rol', k: 'ac-modus', opties: [
      { id: 'koelen', label: t('Охолодження', 'Koelen'), icoon: 'snowflake' }, { id: 'verwarmen', label: t('Обігрів', 'Verwarmen'), icoon: 'sun' }, { id: 'drogen', label: t('Осушення', 'Drogen'), icoon: 'droplets' }, { id: 'ventileren', label: t('Вентилятор', 'Ventilator'), icoon: 'fan' }, { id: 'auto', label: t('Авто', 'Auto'), icoon: 'sparkles' }] }));
    uit += veld(t('Швидкість вентилятора', 'Ventilatorsnelheid'), o.segment({ label: t('Швидкість вентилятора', 'Ventilatorsnelheid'), waarde: gewenst(a, 'ventilator'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'ventilator' }, klas: 'hv-segment--rol', k: 'ac-vent', opties: [
      { id: 'auto', label: t('Авто', 'Auto') }, { id: 'stil', label: t('Тихо', 'Stil') }, { id: 'laag', label: t('Низька', 'Laag') }, { id: 'midden', label: t('Середня', 'Midden') }, { id: 'hoog', label: t('Висока', 'Hoog') }] }));
    uit += veld(t('Ламелі', 'Lamellen'), o.segment({ label: t('Напрям повітря', 'Luchtrichting'), waarde: gewenst(a, 'lamellen'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'lamellen' }, klas: 'hv-segment--vier', k: 'ac-lamel', opties: [
      { id: 'lamel-boven', label: t('Вгору', 'Omhoog'), icoon: 'arrow-up-right' }, { id: 'lamel-midden', label: t('Прямо', 'Recht'), icoon: 'arrow-right' }, { id: 'lamel-onder', label: t('Вниз', 'Omlaag'), icoon: 'arrow-down-right' }, { id: 'lamel-zwenk', label: t('Гойдання', 'Zwenken'), icoon: 'move-vertical' }] }),
      ' ' + o.gevolg(t('Що станеться: потік повітря піде вгору, прямо чи вниз; «Гойдання» рівномірно розподіляє його кімнатою. Пов’язано з: охолодження вгору менше дме на ліжко. Як повернути: оберіть інший напрям.', 'Wat er gebeurt: de luchtstroom gaat omhoog, recht of omlaag; ‘Zwenken’ verdeelt hem gelijkmatig door de kamer. Hangt samen met: koelen naar boven blaast minder op het bed. Terugdraaien: kies een andere richting.'), { kop: t('Ламелі', 'Lamellen') }));
    uit += veld(t('Вимкнути через', 'Uit over'), aftelVeld(ctx, a, [30, 60, 120]));
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'ac-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }
  function aftelVeld(ctx, a, minuten) {
    var w = ctx.staat, om = a.st.uitOm;
    if (om && om > w.tijd) return '<div class="hv-aftelrij" data-k="aftelrij">' + o.aftel({ rest: (om - w.tijd) / MIN, totaal: 120, icoon: 'timer' }) + '<span class="hv-aftelrij__om">' + h(t('о ', 'om ') + HV.tijd(om)) + '</span>' + o.knop({ tekst: t('Скасувати відлік', 'Aftellen stoppen'), klein: true, soort: 'stil', actie: 'km-aftel', gegevens: { doel: a.id, minuten: 0 } }) + '</div>';
    return '<div class="hv-filter">' + minuten.map(function (m) { return o.chip({ filter: true, icoon: 'timer', tekst: HV.duur(m), actie: 'km-aftel', gegevens: { doel: a.id, minuten: m }, k: 'aftel-' + m }); }).join('') + '</div>';
  }

  function warmtepomp(ctx, a) {
    var w = ctx.staat, st = a.st, modus = gewenst(a, 'modus'), lijn = Number(String(gewenst(a, 'stooklijn')).replace('lijn-', '')) || 0.6;
    var woord = modus === 'uit' ? HV.woord.uit() : st.verwarmt ? HV.woord.verwarmt() : t('чекає на запит тепла', 'wacht op warmtevraag');
    var uit = kop(a, { passief: true, woord: woord, getal: HV.maat(st.aanvoer, '°C', 1), sub: h(t('подача в контур опалення', 'aanvoer naar de verwarming')), toon: st.verwarmt ? 'warm' : 'neutraal' });
    var warmte = st.verwarmt ? st.vermogen * st.cop / 1000 : 0;
    uit += '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Зворотка', 'Retour'), waarde: HV.maat(st.retour, '°C', 1), sub: h('ΔT ' + HV.getal(st.aanvoer - st.retour, 1) + ' K') }) +
      o.getal({ maat: 'm', label: 'COP', waarde: HV.getal(st.cop, 1), sub: h(t('тепло ÷ струм', 'warmte ÷ stroom')) }) +
      o.getal({ maat: 'm', label: t('Струм', 'Stroom'), waarde: HV.maat(st.vermogen, t('Вт', 'W')), sub: h(t('споживання зараз', 'verbruik nu')) }) +
      o.getal({ maat: 'm', label: t('Тепло', 'Warmte'), waarde: HV.maat(warmte, t('кВт', 'kW'), 1), sub: h(t('віддає в дім', 'levert aan het huis')) }) + '</div>';
    uit += veld(t('Ефективність', 'Rendement'), voortgang({ label: 'COP', waarde: st.cop, min: 1, max: 6, toon: 'warm', tekst: 'COP ' + HV.getal(st.cop, 1) + ' · ' + (st.cop >= 4 ? t('дуже добре', 'heel goed') : st.cop >= 3 ? t('добре', 'goed') : t('слабко', 'zwak')), merken: [[2, '2'], [3, '3'], [4, '4'], [5, '5']] }));
    uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим теплового насоса', 'Stand van de warmtepomp'), waarde: modus, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, k: 'wp-modus', opties: [{ id: 'uit', label: t('Вимкнено', 'Uit'), icoon: 'power' }, { id: 'verwarmen', label: t('Обігрів', 'Verwarmen'), icoon: 'heater' }, { id: 'boiler', label: t('Лише вода', 'Alleen water'), icoon: 'droplet' }] }),
      ' ' + o.risico('gevaarlijk') + o.gevolg(t('Що станеться: «Вимкнено» зупиняє опалення й гарячу воду в усьому домі — це небезпечна дія з утриманням рейки; «Лише вода» гріє бойлер, а кімнати ні. Пов’язано з: термостат, тепла підлога, бойлер. Як повернути: оберіть «Обігрів»; дім нагрівається кілька годин.', 'Wat er gebeurt: ‘Uit’ stopt verwarming en warm water in het hele huis — een gevaarlijke actie met de houdrail; ‘Alleen water’ verwarmt de boiler, de kamers niet. Hangt samen met: thermostaat, vloerverwarming, boiler. Terugdraaien: kies ‘Verwarmen’; opwarmen duurt enkele uren.'), { kop: t('Режим', 'Stand') }));
    uit += veld(t('Гаряча вода', 'Warm water'), o.segment({ label: t('Гаряча вода', 'Warm water'), waarde: gewenst(a, 'warmwater'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'warmwater' }, k: 'wp-ww', opties: [{ id: 'ww-eco', label: t('Ощадно', 'Zuinig'), icoon: 'leaf' }, { id: 'ww-comfort', label: t('Комфорт', 'Comfort'), icoon: 'bath' }, { id: 'ww-snel', label: t('Швидко', 'Snel'), icoon: 'zap' }] }),
      ' ' + o.risico('gevoelig') + o.gevolg(t('Що станеться: «Ощадно» гріє воду повільніше й нижчою температурою, «Швидко» — з найвищою потужністю й гіршим COP. Пов’язано з: бойлер у підсобці, ціна струму. Як повернути: «Повернути» у сповіщенні 10 с або оберіть інший режим.', 'Wat er gebeurt: ‘Zuinig’ verwarmt het water langzamer en minder heet, ‘Snel’ met het hoogste vermogen en een slechtere COP. Hangt samen met: de boiler in de bijkeuken, de stroomprijs. Terugdraaien: ‘Ongedaan maken’ in de melding (10 s) of kies een andere stand.'), { kop: t('Гаряча вода', 'Warm water') }));
    uit += schakelRij({ k: 'wp-stil', doel: a.id, mogelijkheid: 'stilstand', aan: gewenst(a, 'stilstand') === 'stil-aan', op: 'stil-aan', uit: 'stil-uit', icoon: 'moon', naam: t('Тихий режим уночі', 'Stille nachtstand'), sub: t('22:00–07:00 · компресор на половині потужності', '22:00–07:00 · compressor op halve kracht'),
      gevolg: t('Що станеться: уночі насос працює тихше й повільніше. Пов’язано з: у морозну ніч дім може охолонути на пів градуса. Як повернути: вимкніть перемикач.', 'Wat er gebeurt: ’s nachts draait de pomp stiller en langzamer. Hangt samen met: in een vriesnacht kan het huis een halve graad afkoelen. Terugdraaien: zet de schakelaar uit.') });
    var kenner = o.blok({ id: 'wp-kenner', titel: t('Для знавців', 'Expertweergave'), dicht: true, samenvatting: h(t('Крива опалення ', 'Stooklijn ') + HV.getal(lijn, 1) + t(' · тиск ', ' · druk ') + HV.getal(st.druk || 1.6, 1) + t(' бар', ' bar')), inhoud:
      o.kaart({ inhoud: veld(t('Крива опалення', 'Stooklijn'), '<div class="hv-km-stooklijn">' + stooklijnSvg(lijn, w.weer.temp) + o.stapper({ actie: 'km-lijn', gegevens: { doel: a.id }, stap: 1, label: t('Крива опалення', 'Stooklijn'), waarde: HV.getal(lijn, 1), k: 'lijn-' + a.id }) + '</div>',
        ' ' + o.risico('gevoelig') + o.gevolg(t('Що станеться: крутіша крива дає гарячішу подачу в холод — тепліше, але дорожче й з гіршим COP. Пов’язано з: усі зони опалення. Як повернути: «Повернути» у сповіщенні або поверніть попереднє значення.', 'Wat er gebeurt: een steilere lijn geeft een hetere aanvoer bij kou — warmer, maar duurder en met een slechtere COP. Hangt samen met: alle verwarmingszones. Terugdraaien: ‘Ongedaan maken’ in de melding of zet de vorige waarde terug.'), { kop: t('Крива опалення', 'Stooklijn') })) +
        '<div class="hv-rijen">' + o.rij({ icoon: 'gauge', naam: t('Тиск у контурі', 'Druk in het circuit'), waarde: h(HV.getal(st.druk || 1.6, 1) + t(' бар · норма 1,2–2,0', ' bar · normaal 1,2–2,0')) }) +
        o.rij({ icoon: 'circle-check', naam: t('Код несправності', 'Storingscode'), waarde: h(t('немає', 'geen')) }) +
        o.rij({ icoon: 'rotate-cw', naam: t('Запусків сьогодні', 'Starts vandaag'), waarde: h(String(st.starts || 4)) }) +
        o.rij({ icoon: 'hourglass', naam: t('Години роботи', 'Draaiuren'), waarde: h(HV.getal(st.draaiuren || 2140) + t(' год', ' u')) }) + '</div>' }) });
    var naarEnergie = '<div class="hv-knoppen">' + o.knop({ tekst: t('Енергія: тепло', 'Energie: warmte'), icoon: 'zap', soort: 'stil', actie: 'ga', gegevens: { naar: 'energie-warmte' } }) + '</div>';
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'wp-bediening', inhoud: uit }) + waarom(a) + kenner + naarEnergie + '</div>';
  }
  function stooklijnSvg(lijn, buiten) {
    var punt = function (b) { return 20 + lijn * (20 - b) * 1.25; };
    var X = function (b) { return (b + 15) / 35 * 200; }, Y = function (v) { return 90 - (v - 20) / 40 * 80; };
    var d = [-15, -10, -5, 0, 5, 10, 15, 20].map(function (b, i) { return (i ? 'L' : 'M') + X(b).toFixed(1) + ' ' + Y(punt(b)).toFixed(1); }).join('');
    var nb = klem(buiten, -15, 20);
    return '<svg class="hv-km-stooklijn__svg" viewBox="0 0 200 100" role="img" aria-label="' + h(t('Подача ', 'Aanvoer ') + HV.getal(punt(nb), 0) + t(' °C при ', ' °C bij ') + HV.getal(nb, 0) + t(' °C надворі', ' °C buiten')) + '">' +
      '<line class="hv-km-stooklijn__as" x1="0" x2="200" y1="90" y2="90"/><path class="hv-km-stooklijn__lijn" d="' + d + '"/><circle class="hv-km-stooklijn__nu" cx="' + X(nb).toFixed(1) + '" cy="' + Y(punt(nb)).toFixed(1) + '" r="4"/>' +
      '<text x="2" y="99">−15°</text><text x="186" y="99">20°</text><text x="' + (X(nb) + 6).toFixed(1) + '" y="' + (Y(punt(nb)) - 6).toFixed(1) + '">' + HV.getal(punt(nb), 0) + '°</text></svg>';
  }
  HV.actie('km-lijn', function (ctx, g) {
    var a = ap(g.doel), nu = Number(String(HV.gewenst(a, 'stooklijn')).replace('lijn-', '')) || 0.6;
    var nieuw = Math.round(klem(nu + Number(g.richting) * 0.1, 0.2, 1.4) * 10) / 10;
    if (nieuw !== nu) doe(a, 'stooklijn', 'lijn-' + nieuw);
  });

  function vloer(ctx, a) {
    var st = a.st, aan = !!gewenst(a, 'aan'), vocht = ap('vochtbad');
    var uit = kop(a, { woord: !aan ? HV.woord.uit() : st.verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast'), getal: HV.maat(st.temperatuur, '°C', 1) + ' <span class="hv-naar">→</span> ' + HV.maat(gewenst(a, 'doel'), '°C', 1), sub: h(t('повітря у ванній → ціль', 'lucht in de badkamer → doel')) });
    uit += '<div class="hv-km-wijzerrij is-enkel' + (aan ? '' : ' is-uit') + '">' + o.wijzer({ doel: gewenst(a, 'doel'), gemeten: st.temperatuur, toon: 'warm', bezig: aan && !!st.verwarmt, actie: 'km-wijzer', gegevens: { doel: a.id }, label: t('Ціль теплої підлоги', 'Doel van de vloerverwarming'), k: 'wijzer-' + a.id }) + '</div>';
    uit += '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Підлога', 'Vloer'), waarde: HV.maat(st.vloer, '°C', 1), sub: h(t('поверхня плитки', 'oppervlak van de tegels')) }) +
      (vocht ? o.getal({ maat: 'm', label: t('Вологість', 'Vochtigheid'), waarde: HV.maat(vocht.st.waarde, '%') }) : '') +
      o.getal({ maat: 'm', label: t('Контур', 'Circuit'), waarde: HV.maat(ap('warmtepomp').st.aanvoer - 4, '°C', 1), sub: h(t('від теплового насоса', 'van de warmtepomp')) }) + '</div>';
    uit += veld(t('Підлога не холодніша за', 'Vloer minstens'), o.segment({ label: t('Нижня межа температури підлоги', 'Ondergrens van de vloertemperatuur'), waarde: gewenst(a, 'vloermin'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'vloermin' }, klas: 'hv-segment--vier', k: 'vl-min', opties: [{ id: 'vloer-0', label: t('Без межі', 'Geen') }, { id: 'vloer-22', label: '22 °C' }, { id: 'vloer-24', label: '24 °C' }, { id: 'vloer-26', label: '26 °C' }] }),
      ' ' + o.gevolg(t('Що станеться: підлога гріється до межі, навіть коли повітря вже тепле — босоніж приємно. Пов’язано з: трохи більше споживання теплового насоса. Як повернути: оберіть «Без межі».', 'Wat er gebeurt: de vloer wordt tot de grens verwarmd, ook als de lucht al warm is — prettig op blote voeten. Hangt samen met: iets meer verbruik van de warmtepomp. Terugdraaien: kies ‘Geen’.'), { kop: t('Межа підлоги', 'Vloergrens') }));
    uit += veld(t('Вимкнути через', 'Uit over'), aftelVeld(ctx, a, [30, 60, 120]));
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'vl-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }

  function radiator(ctx, a) {
    var w = ctx.staat, st = a.st, raam = ap('raamkinder'), pauze = !!(raam && raam.st.open && st.raamdetectie === 'raam-aan');
    var kal = String(st.kalibreren).match(/^kalibratie-(\d+)$/);
    var uit = kop(a, { passief: true, woord: pauze ? t('пауза: вікно відчинене', 'pauze: raam open') : (st.opening > 8 ? HV.woord.verwarmt() : t('тримає', 'houdt vast')), getal: HV.maat(st.temperatuur, '°C', 1) + ' <span class="hv-naar">→</span> ' + HV.maat(gewenst(a, 'doel'), '°C', 1), sub: h(t('дитяча зараз → ціль', 'kinderkamer nu → doel')) });
    uit += '<div class="hv-km-wijzerrij is-enkel">' + o.wijzer({ doel: gewenst(a, 'doel'), gemeten: st.temperatuur, toon: 'warm', bezig: !pauze && st.opening > 8, actie: 'km-wijzer', gegevens: { doel: a.id }, label: t('Ціль радіатора', 'Doel van de radiator'), k: 'wijzer-' + a.id }) + '</div>';
    uit += veld(t('Відкриття клапана', 'Klepopening'), voortgang({ label: t('Відкриття клапана', 'Klepopening'), waarde: st.opening || 0, toon: 'warm', tekst: HV.maatTekst(st.opening || 0, '%') + (pauze ? t(' · пауза', ' · pauze') : '') }));
    uit += schakelRij({ k: 'rk-raam', doel: a.id, mogelijkheid: 'raamdetectie', aan: gewenst(a, 'raamdetectie') === 'raam-aan', op: 'raam-aan', uit: 'raam-uit', icoon: 'app-window', naam: t('Пауза при відчиненому вікні', 'Pauze bij open raam'), sub: raam ? t('вікно дитячої: ', 'raam kinderkamer: ') + (raam.st.open ? HV.woord.open() : HV.woord.dicht()) : '',
      gevolg: t('Що станеться: коли вікно відчинене, клапан закривається й не гріє вулицю. Пов’язано з: датчик вікна дитячої. Як повернути: вимкніть перемикач.', 'Wat er gebeurt: als het raam open staat, sluit de klep en verwarmt hij de straat niet. Hangt samen met: de raamsensor van de kinderkamer. Terugdraaien: zet de schakelaar uit.') });
    uit += '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Батарейка', 'Batterij'), waarde: HV.maat(a.batterij || 71, '%') }) + o.getal({ maat: 'm', label: t('Калібрування', 'Kalibratie'), waarde: h(kal ? HV.p(datumPaar(+kal[1])) : '—'), sub: h(t('останнє', 'laatste')) }) + '</div>';
    uit += '<div class="hv-knoppen">' + o.knop({ tekst: t('Калібрувати клапан', 'Klep kalibreren'), icoon: 'ruler', soort: 'stil', actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'kalibreren', waarde: 'kalibratie-' + w.tijd } }) + '</div>';
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'rk-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }

  var DEBIET = { 0: 0, 1: 90, 2: 150, 3: 240, auto: 150 };
  function ventilatieStand(a) { var st = a.st, b = String(st.boost).match(/^boost-tot-(\d+)$/); return { boost: b ? +b[1] : null, stand: b ? 3 : st.stand === 'auto' ? (ap('co2slaap') && ap('co2slaap').st.waarde > 900 ? 3 : 2) : Number(st.stand) }; }
  function ventilatie(ctx, a) {
    var w = ctx.staat, st = a.st, vs = ventilatieStand(a), co2 = ap('co2slaap'), vocht = ap('vochtbad'), grens = Number(String(st.co2grens).replace('ppm-', '')) || 1000;
    var filterSinds = Number(String(st.filterwissel).replace('filter-', '')) || w.tijd, filterRest = klem(100 - (w.tijd - filterSinds) / (180 * DAG) * 100, 0, 100);
    var woord = vs.boost ? t('посилено до ', 'versterkt tot ') + HV.tijd(vs.boost) : vs.stand === 0 ? HV.woord.uit() : t('швидкість ', 'stand ') + vs.stand + (st.stand === 'auto' ? t(' · авто', ' · auto') : '');
    var uit = kop(a, { passief: true, woord: woord, getal: HV.maat(DEBIET[vs.stand] || 0, t('м³/год', 'm³/u')), sub: h(t('повітрообмін дому', 'luchtverversing van het huis')), toon: 'neutraal' });
    uit += veld(t('Швидкість', 'Stand'), o.segment({ label: t('Швидкість вентиляції', 'Stand van de ventilatie'), waarde: gewenst(a, 'stand'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'stand' }, k: 'ven-stand', opties: [{ id: 0, label: t('Вимк.', 'Uit') }, { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }, { id: 'auto', label: t('Авто', 'Auto') }] }),
      ' ' + o.risico('gevoelig') + o.gevolg(t('Що станеться: «Вимк.» зупиняє свіже повітря в усьому домі — це чутлива дія, CO₂ і вологість почнуть рости. Пов’язано з: ванна після душу, спальня вночі. Як повернути: «Повернути» у сповіщенні 10 с або оберіть швидкість.', 'Wat er gebeurt: ‘Uit’ stopt de verse lucht in het hele huis — een gevoelige actie, CO₂ en vocht gaan stijgen. Hangt samen met: de badkamer na het douchen, de slaapkamer ’s nachts. Terugdraaien: ‘Ongedaan maken’ in de melding (10 s) of kies een stand.'), { kop: t('Швидкість', 'Stand') }));
    uit += veld(t('Посилити на', 'Versterken voor'), vs.boost
      ? '<div class="hv-aftelrij" data-k="boostrij">' + o.aftel({ rest: (vs.boost - w.tijd) / MIN, totaal: 60, icoon: 'wind' }) + '<span class="hv-aftelrij__om">' + h(t('до ', 'tot ') + HV.tijd(vs.boost)) + '</span>' + o.knop({ tekst: t('Зупинити посилення', 'Versterken stoppen'), klein: true, soort: 'stil', actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'boost', waarde: 'boost-uit' } }) + '</div>'
      : '<div class="hv-filter">' + [15, 30, 60].map(function (m) { return o.chip({ filter: true, icoon: 'wind', tekst: HV.duur(m), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'boost', waarde: 'boost-tot-' + (w.tijd + m * MIN) }, k: 'boost-' + m }); }).join('') + '</div>');
    uit += schakelRij({ k: 'ven-co2', doel: a.id, mogelijkheid: 'co2sturing', aan: gewenst(a, 'co2sturing') === 'co2-aan', op: 'co2-aan', uit: 'co2-uit', icoon: 'cloud', naam: t('Керування за CO₂', 'Sturing op CO₂'), sub: t('у режимі «Авто» швидкість росте понад поріг', 'in de stand ‘Auto’ gaat de stand omhoog boven de grens') });
    uit += veld(t('Поріг CO₂', 'CO₂-grens'), o.segment({ label: t('Поріг CO₂', 'CO₂-grens'), waarde: gewenst(a, 'co2grens'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'co2grens' }, k: 'ven-grens', uit: gewenst(a, 'co2sturing') !== 'co2-aan', opties: [{ id: 'ppm-800', label: '800 ppm' }, { id: 'ppm-1000', label: '1000 ppm' }, { id: 'ppm-1200', label: '1200 ppm' }] }));
    var reden = co2 ? t('Причина: CO₂ у спальні ', 'Reden: CO₂ in de slaapkamer ') + HV.getal(co2.st.waarde) + ' ppm' + (co2.st.waarde > grens ? t(' — вище порога ', ' — boven de grens ') : t(' — нижче порога ', ' — onder de grens ')) + grens + (vocht ? t('; вологість у ванній ', '; vocht in de badkamer ') + HV.getal(vocht.st.waarde) + ' %' : '') + '.' : '';
    if (reden) uit += '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(reden) + '</span></p>';
    uit += veld(t('Фільтр', 'Filter'), voortgang({ label: t('Ресурс фільтра', 'Levensduur van het filter'), waarde: filterRest, toon: 'neutraal', laag: filterRest < 15, tekst: t('ресурс ', 'nog ') + HV.getal(filterRest) + ' % · ' + t('замінено ', 'vervangen ') + HV.p(datumPaar(filterSinds)) }) +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Фільтр замінено', 'Filter vervangen'), icoon: 'refresh-cw', soort: 'stil', klein: true, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'filterwissel', waarde: 'filter-' + w.tijd } }) + '</div>');
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'ven-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }

  function bevochtiger(ctx, a) {
    var st = a.st, aan = !!gewenst(a, 'aan'), leeg = st.reservoir < 15;
    var uit = kop(a, { woord: aan ? t('зволожує', 'bevochtigt') : HV.woord.uit(), getal: HV.maat(st.vocht, '%') + ' <span class="hv-naar">→</span> ' + HV.maat(gewenst(a, 'doel'), '%'), sub: h(t('вологість у дитячій → ціль', 'vochtigheid kinderkamer → doel')) });
    uit += veld(t('Цільова вологість', 'Doelvochtigheid'), o.schuif({ label: t('Цільова вологість', 'Doelvochtigheid'), waarde: gewenst(a, 'doel'), min: 30, max: 70, stap: 5, toon: 'neutraal', actie: 'km-schuif', gegevens: { doel: a.id, mogelijkheid: 'doel' }, k: 'bv-doel' }),
      ' ' + o.gevolg(t('Що станеться: зволожувач працює, доки вологість не сягне цілі. Пов’язано з: понад 60 % на вікнах може з’явитися конденсат. Як повернути: поставте 45–50 %.', 'Wat er gebeurt: de bevochtiger werkt tot het doel is bereikt. Hangt samen met: boven 60 % kan er condens op de ramen komen. Terugdraaien: zet hem op 45–50 %.'), { kop: t('Цільова вологість', 'Doelvochtigheid') }));
    uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим зволожувача', 'Stand van de bevochtiger'), waarde: gewenst(a, 'modus'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, k: 'bv-modus', opties: [{ id: 'normaal', label: t('Звичайний', 'Normaal') }, { id: 'stil', label: t('Тихий', 'Stil'), icoon: 'moon' }, { id: 'auto', label: t('Авто', 'Auto') }] }));
    uit += veld(t('Бак з водою', 'Watertank'), voortgang({ label: t('Вода в баку', 'Water in de tank'), waarde: st.reservoir, toon: 'neutraal', laag: leeg, tekst: HV.maatTekst(st.reservoir, '%') + ' · ' + (leeg ? t('долийте воду', 'vul water bij') : t('≈ ', '≈ ') + HV.duur(st.reservoir / 4 * 60) + t(' роботи', ' werktijd')) }));
    var pre = leeg ? plaat({ k: 'leeg', icoon: 'droplet', toon: 'let-op', kop: t('Мало води в баку', 'Weinig water in de tank'), tekst: t('Без води зволожувач зупиниться сам і запише це в Журнал.', 'Zonder water stopt de bevochtiger vanzelf en meldt dat in het logboek.') }) : '';
    return '<div class="hv-km-blad">' + toestand(a) + pre + o.kaart({ k: 'bv-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }

  var PM_BANDEN = [[5, ['відмінно', 'uitstekend']], [15, ['добре', 'goed']], [35, ['помірно', 'matig']], [999, ['погано', 'slecht']]];
  var pmWoord = function (v) { for (var i = 0; i < PM_BANDEN.length; i++) if (v <= PM_BANDEN[i][0]) return HV.p(PM_BANDEN[i][1]); return ''; };
  function luchtreiniger(ctx, a) {
    var w = ctx.staat, st = a.st, aan = !!gewenst(a, 'aan');
    var filterSinds = Number(String(st.filterwissel).replace('filter-', '')) || w.tijd, filterRest = klem(100 - (w.tijd - filterSinds) / (365 * DAG) * 100, 0, 100);
    var uit = kop(a, { woord: aan ? t('очищує', 'reinigt') : HV.woord.uit(), getal: HV.maat(st.fijnstof, t('мкг/м³', 'µg/m³'), 1), sub: h('PM2.5 · ' + pmWoord(st.fijnstof)) });
    uit += veld(t('Дрібний пил у спальні', 'Fijnstof in de slaapkamer'), voortgang({ label: 'PM2.5', waarde: st.fijnstof, max: 50, toon: st.fijnstof > 15 ? 'warm' : 'neutraal', tekst: 'PM2.5 ' + HV.getal(st.fijnstof, 1) + ' · ' + pmWoord(st.fijnstof), merken: [[5, '5'], [15, '15'], [35, '35']] }));
    uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим очищувача', 'Stand van de luchtreiniger'), waarde: gewenst(a, 'stand'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'stand' }, klas: 'hv-segment--rol', k: 'lr-stand', opties: [{ id: 'auto', label: t('Авто', 'Auto'), icoon: 'sparkles' }, { id: 'slaap', label: t('Сон', 'Slaap'), icoon: 'moon' }, { id: 1, label: t('Швидкість 1', 'Stand 1') }, { id: 2, label: t('Швидкість 2', 'Stand 2') }, { id: 3, label: t('Швидкість 3', 'Stand 3') }] }),
      ' ' + o.gevolg(t('Що станеться: «Авто» сам підбирає швидкість за пилом, «Сон» — найтихіше й без підсвітки. Пов’язано з: спальня, дитячий сон. Як повернути: оберіть інший режим.', 'Wat er gebeurt: ‘Auto’ kiest zelf de stand op basis van het fijnstof, ‘Slaap’ is het stilst en zonder verlichting. Hangt samen met: de slaapkamer, de nachtrust. Terugdraaien: kies een andere stand.'), { kop: t('Режим', 'Stand') }));
    uit += schakelRij({ k: 'lr-slot', doel: a.id, mogelijkheid: 'kinderslot', aan: gewenst(a, 'kinderslot') === 'slot-aan', op: 'slot-aan', uit: 'slot-uit', icoon: 'lock', naam: t('Блокування від дітей', 'Kinderslot'), sub: t('кнопки на приладі не діють', 'de knoppen op het apparaat werken niet') });
    uit += veld(t('Фільтр HEPA', 'HEPA-filter'), voortgang({ label: t('Ресурс фільтра', 'Levensduur van het filter'), waarde: filterRest, toon: 'neutraal', laag: filterRest < 15, tekst: t('ресурс ', 'nog ') + HV.getal(filterRest) + ' %' }) +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Фільтр замінено', 'Filter vervangen'), icoon: 'refresh-cw', soort: 'stil', klein: true, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'filterwissel', waarde: 'filter-' + w.tijd } }) + '</div>');
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'lr-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }

  function tank(temp, doel) {
    var deel = klem((temp - 15) / 55 * 100, 0, 100), doelDeel = klem((doel - 15) / 55 * 100, 0, 100);
    return '<div class="hv-tank" aria-hidden="true"><span class="hv-tank__vulling" style="height:' + deel.toFixed(1) + '%"></span><span class="hv-tank__doel" style="bottom:' + doelDeel.toFixed(1) + '%"></span></div>';
  }
  function boiler(ctx, a) {
    var w = ctx.staat, st = a.st, aan = !!gewenst(a, 'aan'), legi = String(st.legionella).match(/^legionella-(\d+)$/);
    var douches = Math.max(0, Math.round((st.temperatuur - 38) / 3.5));
    var uit = kop(a, { woord: !aan ? HV.woord.uit() : st.verwarmt ? HV.woord.verwarmt() : st.temperatuur < gewenst(a, 'doel') - 0.5 && st.planning === 'goedkoop' ? t('чекає дешевої години', 'wacht op een goedkoop uur') : st.temperatuur < gewenst(a, 'doel') - 0.5 && st.planning === 'zon' ? t('чекає сонця', 'wacht op zon') : t('тримає', 'houdt vast'), getal: HV.maat(st.temperatuur, '°C', 0) + ' <span class="hv-naar">→</span> ' + HV.maat(gewenst(a, 'doel'), '°C', 0), sub: h(t('вистачить ≈ на ', 'genoeg voor ≈ ') + douches + ' ' + HV.meervoud(douches, ['душ', 'душі', 'душів'], ['douche', 'douches'])) });
    uit += '<div class="hv-km-boiler">' + tank(st.temperatuur, gewenst(a, 'doel')) + '<div class="hv-km-boiler__lijf">' +
      veld(t('Ціль', 'Doel'), o.stapper({ actie: 'km-stap', gegevens: { doel: a.id, mogelijkheid: 'doel', min: 40, max: 65 }, stap: 1, label: t('Ціль бойлера', 'Doel van de boiler'), waarde: HV.maat(gewenst(a, 'doel'), '°C', 0), k: 'bo-doel' }),
        ' ' + o.risico('gevoelig') + o.gevolg(t('Що станеться: бойлер гріє воду до цілі; вище 60 °C — ризик опіку з крана. Пов’язано з: споживання струму 1,8 кВт під час нагріву. Як повернути: «Повернути» у сповіщенні 10 с.', 'Wat er gebeurt: de boiler verwarmt het water tot het doel; boven 60 °C kun je je branden aan de kraan. Hangt samen met: 1,8 kW stroomverbruik tijdens het opwarmen. Terugdraaien: ‘Ongedaan maken’ in de melding (10 s).'), { kop: t('Ціль бойлера', 'Doel van de boiler') })) + '</div></div>';
    uit += veld(t('Коли гріти', 'Wanneer opwarmen'), o.segment({ label: t('Коли гріти', 'Wanneer opwarmen'), waarde: gewenst(a, 'planning'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'planning' }, k: 'bo-plan', opties: [{ id: 'direct', label: t('Одразу', 'Direct'), icoon: 'zap' }, { id: 'goedkoop', label: t('Дешева година', 'Goedkoop uur'), icoon: 'euro' }, { id: 'zon', label: t('Від сонця', 'Zonnestroom'), icoon: 'sun' }] }));
    uit += veld(t('Захист від легіонели', 'Legionellabescherming'), '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('shield-check', { maat: 's' }) + '<span>' + h(t('Раз на тиждень вода прогрівається до 65 °C. Востаннє: ', 'Eén keer per week wordt het water tot 65 °C verwarmd. Laatst: ') + (legi ? HV.p(datumPaar(+legi[1])) + ', ' + HV.tijd(+legi[1]) : '—')) + '</span></p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Прогріти до 65 °C зараз', 'Nu opwarmen tot 65 °C'), icoon: 'flame', soort: 'stil', klein: true, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'legionella', waarde: 'legionella-' + w.tijd } }) + '</div>');
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'bo-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }

  // ───────────────────────── 7. Аркуші: медіа ─────────────────────────
  var nummerIndex = function (a) { var m = String(a.st.nummer || '').match(/^nummer-(\d+)$/); return m ? +m[1] : 0; };
  function huidig(a) {
    var lijst = a.st.wachtrij || [], i = nummerIndex(a), tr = lijst[i];
    var bron = a.st.bron || 'lijst';
    var titel = bron === 'bluetooth' ? [t('Телефон Олени', 'Telefoon van Olena'), t('Телефон Олени', 'Telefoon van Olena')] : tr ? [tr[0].split(' · ')[0], tr[1].split(' · ')[0]] : (a.st.titel || ['Тиша', 'Stilte']);
    var wie = bron === 'bluetooth' ? ['через Bluetooth', 'via Bluetooth'] : tr && tr[0].indexOf(' · ') > 0 ? [tr[0].split(' · ')[1], tr[1].split(' · ')[1]] : ['', ''];
    return { titel: HV.p(titel), wie: HV.p(wie), bron: bron === 'radio' ? HV.p(a.st.titel || ['Радіо', 'Radio']) : bron === 'lijst' ? HV.p(a.st.titel || ['Добірка', 'Afspeellijst']) : HV.p(NAMEN[bron] || [bron, bron]), i: i, aantal: lijst.length, zaad: zaadVan(HV.p(titel)) };
  }
  var HOES = [['--hv-warm', '--hv-koud'], ['--hv-aan-vlak', '--hv-warm'], ['--hv-koud', '--hv-zon'], ['--hv-net-in', '--hv-warm'], ['--hv-warm', '--hv-aan-vlak']];
  /** Обкладинка: градієнт двох тонів і мотив; колір — дані, тож лише токени. */
  function hoes(zaad, icoon, maat) {
    var p = HOES[zaad % HOES.length];
    return '<span class="hv-hoes' + (maat ? ' hv-hoes--' + maat : '') + '" style="--a:var(' + p[0] + ');--b:var(' + p[1] + ');--hoek:' + (zaad * 37 % 360) + 'deg" aria-hidden="true"><span class="hv-hoes__golf"></span>' + HV.icoon(icoon || 'music', { maat: 'l', klas: 'hv-hoes__ic' }) + '</span>';
  }
  function spelerKaart(ctx, a, opties) {
    var op = opties || {}, s = huidig(a), speelt = !!gewenst(a, 'afspelen'), vol = Number(gewenst(a, 'volume')) || 0, p = plafond();
    var leden = a.leden ? a.leden.map(ap).filter(Boolean) : null;
    var waar = leden ? leden.map(function (l) { return HV.p(HV.staat.kamer(l.kamer).naam); }).join(' + ') : HV.p(HV.staat.kamer(a.kamer).naam);
    var transport = '<div class="hv-speler__knoppen">' + (a.st.wachtrij ? o.icoonknop({ icoon: 'skip-back', aria: t('Попередній трек', 'Vorig nummer'), actie: 'km-nummer', gegevens: { doel: a.id, richting: -1 } }) : '') +
      '<button type="button" class="hv-speler__speel' + (speelt ? ' is-aan' : '') + '" data-actie="schakel" data-doel="' + h(a.id) + '" data-mogelijkheid="afspelen" aria-label="' + h(speelt ? t('Пауза', 'Pauze') : t('Грати', 'Afspelen')) + '"' + (a.wacht && a.wacht.mogelijkheid === 'afspelen' ? ' aria-busy="true"' : '') + '>' + HV.icoon(speelt ? 'pause' : 'play', { maat: 'm' }) + '</button>' +
      (a.st.wachtrij ? o.icoonknop({ icoon: 'skip-forward', aria: t('Наступний трек', 'Volgend nummer'), actie: 'km-nummer', gegevens: { doel: a.id, richting: 1 } }) : '') + '</div>';
    var volume = plafondOm(o.schuif({ label: t('Гучність', 'Volume') + ' · ' + HV.p(a.naam), waarde: vol, min: 0, max: 100, stap: 2, toon: 'neutraal', actie: 'km-schuif', gegevens: { doel: a.id, mogelijkheid: 'volume' }, k: 'vol-' + a.id + (op.k || '') }));
    var chips = op.zonderChips ? '' : '<div class="hv-filter hv-speler__chips">' + o.chip({ icoon: 'map-pin', tekst: t('Де грає', 'Waar speelt het'), actie: 'blad', gegevens: { blad: 'media:waar' }, k: 'chip-waar' }) +
      o.chip({ icoon: 'list-music', tekst: t('Черга', 'Wachtrij'), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id }, k: 'chip-rij' }) +
      o.chip({ icoon: 'moon', tekst: slaapTekst(ctx, a), actie: 'km-slaap', gegevens: { doel: a.id }, k: 'chip-slaap', gekozen: /^stil-om/.test(String(a.st.slaaptimer)), filter: true }) + '</div>';
    return '<div class="hv-speler' + (speelt ? ' is-speelt' : '') + (op.groot ? ' hv-speler--groot' : '') + '" data-k="speler-' + h(a.id) + (op.k || '') + '">' + hoes(s.zaad, a.st.bron === 'radio' ? 'radio' : a.st.bron === 'bluetooth' ? 'bluetooth' : 'music', op.groot ? 'groot' : null) +
      '<div class="hv-speler__lijf"><p class="hv-speler__waar">' + HV.icoon(a.leden ? 'speaker' : HV.paspoort.soorten[a.soort].icoon, { maat: 's' }) + '<span>' + h(waar) + '</span>' + (speelt ? '<span class="hv-speler__golf" aria-hidden="true"><i></i><i></i><i></i></span>' : '') + '</p>' +
      '<p class="hv-speler__titel">' + h(s.titel) + '</p><p class="hv-speler__wie">' + h([s.wie, s.bron].filter(Boolean).join(' · ')) + '</p>' + transport + volume + chips + '</div></div>';
  }
  function slaapTekst(ctx, a) { var m = String(a.st.slaaptimer).match(/^stil-om-(\d+)$/); return m ? t('Сон до ', 'Slaap tot ') + HV.tijd(+m[1]) : t('Сон 30 хв', 'Slaap 30 min'); }
  HV.actie('km-nummer', function (ctx, g) {
    var a = ap(g.doel), n = (a.st.wachtrij || []).length;
    if (!n) return;
    var i = (nummerIndex(a) + Number(g.richting) + n) % n;
    doe(a, 'nummer', 'nummer-' + i, { stil: true }).then(function (r) { if (r && r.ok && !a.st.speelt) HV.doe({ doel: a.id, mogelijkheid: 'afspelen', waarde: true, stil: true }); });
  });
  HV.actie('km-slaap', function (ctx, g) {
    var a = ap(g.doel), actief = /^stil-om/.test(String(a.st.slaaptimer));
    if (!actief && !a.st.speelt) { HV.meld({ icoon: 'moon', titel: HV.p(a.naam), tekst: t('Зараз нічого не грає — таймер сну не потрібен.', 'Er speelt nu niets — een slaaptimer is niet nodig.') }); return; }
    doe(a, 'slaaptimer', actief ? 'geen-timer' : 'stil-om-' + (ctx.staat.tijd + 30 * MIN));
  });

  function speaker(ctx, a) {
    var s = huidig(a), groep = ap('multiroom'), inGroep = !!(groep && groep.leden.indexOf(a.id) >= 0), lijst = a.st.wachtrij || [];
    var uit = spelerKaart(ctx, a, { groot: true, zonderChips: true });
    uit += veld(t('Джерело', 'Bron'), o.segment({ label: t('Джерело звуку', 'Geluidsbron'), waarde: gewenst(a, 'bron'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'bron' }, k: 'sp-bron', opties: [{ id: 'lijst', label: t('Добірка', 'Lijst'), icoon: 'list-music' }, { id: 'radio', label: t('Радіо', 'Radio'), icoon: 'radio' }, { id: 'bluetooth', label: 'Bluetooth', icoon: 'bluetooth' }] }));
    if (lijst.length && a.st.bron !== 'bluetooth') uit += veld(t('Черга', 'Wachtrij'), '<ol class="hv-wachtrij">' + lijst.map(function (tr, i) {
      var nu = i === s.i, delen = HV.p(tr).split(' · ');
      return '<li><button type="button" class="hv-wachtrij__rij' + (nu ? ' is-nu' : '') + '" aria-current="' + (nu ? 'true' : 'false') + '" data-actie="km-doe" data-doel="' + h(a.id) + '" data-mogelijkheid="nummer" data-waarde="nummer-' + i + '"><span class="hv-wachtrij__nr">' + (nu && a.st.speelt ? HV.icoon('audio-lines', { maat: 's' }) : (i + 1)) + '</span><span class="hv-wachtrij__tekst"><span>' + h(delen[0]) + '</span><span class="hv-wachtrij__wie">' + h(delen[1] || '') + '</span></span></button></li>';
    }).join('') + '</ol>');
    uit += veld(t('Таймер сну', 'Slaaptimer'), /^stil-om/.test(String(a.st.slaaptimer))
      ? '<div class="hv-aftelrij">' + o.aftel({ rest: (Number(String(a.st.slaaptimer).replace('stil-om-', '')) - ctx.staat.tijd) / MIN, totaal: 60, icoon: 'moon' }) + o.knop({ tekst: t('Скасувати', 'Annuleren'), klein: true, soort: 'stil', actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'slaaptimer', waarde: 'geen-timer' } }) + '</div>'
      : '<div class="hv-filter">' + [15, 30, 60].map(function (m) { return o.chip({ filter: true, icoon: 'moon', tekst: HV.duur(m), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'slaaptimer', waarde: 'stil-om-' + (ctx.staat.tijd + m * MIN) }, k: 'slaap-' + m }); }).join('') + '</div>');
    uit += veld(t('Оголосити', 'Omroepen'), '<div class="hv-filter">' + [['omroep-eten', ['Вечеря готова', 'Het eten is klaar']], ['omroep-slapen', ['Час спати', 'Bedtijd']], ['omroep-weg', ['Виходимо за 5 хв', 'Over 5 min weg']]].map(function (x) {
      return o.chip({ icoon: 'megaphone', tekst: HV.p(x[1]), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'omroep', waarde: x[0] }, k: x[0] });
    }).join('') + '</div>', ' ' + o.risico('gevoelig') + o.gevolg(t('Що станеться: колонка зробить музику тихішою й промовить фразу, потім продовжить. Пов’язано з: агенти й автоматизації можуть оголошувати лише з вашого дозволу. Як повернути: оголошення не скасувати, воно триває 4 с.', 'Wat er gebeurt: de speaker zet de muziek zachter, spreekt de zin uit en speelt daarna verder. Hangt samen met: agenten en automatiseringen mogen alleen omroepen met jouw toestemming. Terugdraaien: een omroep is niet terug te draaien, hij duurt 4 s.'), { kop: t('Оголосити', 'Omroepen') }));
    uit += schakelRij({ k: 'sp-groep', doel: 'multiroom', mogelijkheid: 'samenstelling', aan: inGroep, op: groepZonder(groep, a.id, true), uit: groepZonder(groep, a.id, false), icoon: 'speaker', naam: t('У групі «', 'In de groep ‘') + HV.p(groep.naam) + t('»', '’'), sub: groep.leden.map(function (id) { return HV.p(HV.staat.kamer(ap(id).kamer).naam); }).join(' + ') || t('порожня група', 'lege groep') });
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'sp-bediening', inhoud: uit }) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Де грає', 'Waar speelt het'), icoon: 'map-pin', soort: 'stil', actie: 'blad', gegevens: { blad: 'media:waar' } }) + '</div>' + waarom(a) + '</div>';
  }
  function groepZonder(g, id, metLid) {
    var leden = g.leden.filter(function (x) { return x !== id; });
    if (metLid) leden.push(id);
    var volgorde = HV.kijk.soort('speaker').map(function (x) { return x.id; });
    leden.sort(function (p, q) { return volgorde.indexOf(p) - volgorde.indexOf(q); });
    return 'leden:' + leden.join('+');
  }

  function speakergroep(ctx, a) {
    var leden = HV.kijk.soort('speaker'), p = plafond();
    var uit = spelerKaart(ctx, a, { groot: true, zonderChips: true });
    uit += veld(t('Склад групи й гучність кожної колонки', 'Samenstelling en volume per speaker'), '<div class="hv-km-leden">' + leden.map(function (l) {
      var lid = a.leden.indexOf(l.id) >= 0, k = HV.staat.kamer(l.kamer);
      return '<div class="hv-km-lid' + (lid ? ' is-lid' : '') + '" data-k="lid-' + h(l.id) + '"><div class="hv-km-lid__kop">' + o.chip({ filter: true, gekozen: lid, icoon: lid ? 'check' : 'plus', tekst: HV.p(k.naam), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'samenstelling', waarde: groepZonder(a, l.id, !lid) }, aria: (lid ? t('Прибрати з групи: ', 'Uit de groep halen: ') : t('Додати до групи: ', 'Aan de groep toevoegen: ')) + HV.p(l.naam) }) +
        '<span class="hv-km-lid__stand">' + h(l.st.speelt ? t('грає', 'speelt') : t('тиша', 'stil')) + '</span></div>' +
        (lid ? plafondOm(o.schuif({ label: t('Гучність: ', 'Volume: ') + HV.p(k.naam), waarde: Number(gewenst(l, 'volume')) || 0, min: 0, max: 100, stap: 2, toon: 'neutraal', actie: 'km-schuif', gegevens: { doel: l.id, mogelijkheid: 'volume' }, k: 'lidvol-' + l.id })) : '') + '</div>';
    }).join('') + '</div>', ' ' + o.gevolg(t('Що станеться: колонка в групі грає те саме, що й група; гучність кожної можна змінити окремо. Пов’язано з: прибрана колонка зупиняється. Як повернути: додайте її знову.', 'Wat er gebeurt: een speaker in de groep speelt hetzelfde als de groep; het volume per speaker kun je apart instellen. Hangt samen met: een verwijderde speaker stopt. Terugdraaien: voeg hem weer toe.'), { kop: t('Склад групи', 'Samenstelling') }));
    uit += plafondVeld(a);
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'gr-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }
  function plafondVeld(g) {
    return veld(t('Стеля гучності', 'Volumeplafond'), o.segment({ label: t('Стеля гучності', 'Volumeplafond'), waarde: gewenst(g, 'plafond'), actie: 'km-doe', gegevens: { doel: g.id, mogelijkheid: 'plafond' }, klas: 'hv-segment--vier', k: 'plafond', opties: [{ id: 'plafond-50', label: '50 %' }, { id: 'plafond-60', label: '60 %' }, { id: 'plafond-70', label: '70 %' }, { id: 'plafond-geen', label: t('Без стелі', 'Geen') }] }),
      ' ' + o.risico('gevoelig') + o.gevolg(t('Що станеться: гучніше за стелю — чутлива дія: людина бачить «Повернути», агенти й автоматизації — лише з вашим дозволом. Пов’язано з: тиха година 22:00–07:00, сусіди й дитячий сон. Як повернути: оберіть іншу стелю.', 'Wat er gebeurt: harder dan het plafond is een gevoelige actie: een mens krijgt ‘Ongedaan maken’, agenten en automatiseringen alleen met jouw toestemming. Hangt samen met: de stille uren 22:00–07:00, de buren en de nachtrust. Terugdraaien: kies een ander plafond.'), { kop: t('Стеля гучності', 'Volumeplafond') }));
  }

  var BRONNEN_TV = [{ id: 'tv', label: ['Ефір', 'Tv'], icoon: 'tv' }, { id: 'hdmi1', label: ['HDMI 1', 'HDMI 1'], icoon: 'cable' }, { id: 'hdmi2', label: ['HDMI 2', 'HDMI 2'], icoon: 'gamepad-2' }, { id: 'apps', label: ['Застосунки', 'Apps'], icoon: 'layout-grid' }];
  function tv(ctx, a) {
    var aan = !!gewenst(a, 'aan'), bron = gewenst(a, 'bron'), kanaal = Number(String(gewenst(a, 'kanaal')).replace('zender-', '')) || 1, demp = gewenst(a, 'demp') === 'demp-aan';
    var bronNaam = HV.p((BRONNEN_TV.filter(function (b) { return b.id === bron; })[0] || BRONNEN_TV[0]).label);
    var uit = kop(a, { woord: aan ? HV.woord.aan() : t('очікування', 'stand-by'), getal: aan ? h(bron === 'tv' ? kanaal + ' · ' + HV.p(zenderNaam(kanaal)) : bronNaam) : '', sub: aan ? h(t('гучність ', 'volume ') + HV.getal(gewenst(a, 'volume')) + ' %' + (demp ? t(' · звук вимкнено', ' · geluid uit') : '')) : h(t('увімкніть, щоб керувати', 'zet aan om te bedienen')) });
    if (!aan) {
      uit += '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('power', { maat: 's' }) + '<span>' + h(t('Телевізор в очікуванні: споживає ≈ 0,5 Вт. Джерело, канали й пульт з’являться після ввімкнення.', 'De tv staat op stand-by en verbruikt ≈ 0,5 W. Bron, zenders en afstandsbediening verschijnen na het aanzetten.')) + '</span></p>';
      return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'tv-bediening', inhoud: uit }) + waarom(a) + '</div>';
    }
    uit += veld(t('Джерело', 'Bron'), o.segment({ label: t('Джерело сигналу', 'Signaalbron'), waarde: bron, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'bron' }, klas: 'hv-segment--vier', k: 'tv-bron', opties: BRONNEN_TV.map(function (b) { return { id: b.id, label: HV.p(b.label) }; }) }));
    if (bron === 'tv') uit += veld(t('Канали', 'Zenders'), '<div class="hv-kanalen">' + ZENDERS.map(function (z) {
      var nu = z[0] === kanaal;
      return '<button type="button" class="hv-kanalen__kanaal' + (nu ? ' is-nu' : '') + '" aria-pressed="' + (nu ? 'true' : 'false') + '" data-actie="km-doe" data-doel="' + h(a.id) + '" data-mogelijkheid="kanaal" data-waarde="zender-' + z[0] + '"><span class="hv-kanalen__nr">' + z[0] + '</span><span class="hv-kanalen__naam">' + h(HV.p(zenderNaam(z[0]))) + '</span></button>';
    }).join('') + '</div>');
    uit += veld(t('Гучність', 'Volume'), '<div class="hv-km-volrij">' + plafondOm(o.schuif({ label: t('Гучність телевізора', 'Volume van de tv'), waarde: Number(gewenst(a, 'volume')) || 0, min: 0, max: 100, stap: 2, toon: 'neutraal', actie: 'km-schuif', gegevens: { doel: a.id, mogelijkheid: 'volume' }, k: 'tv-vol', uit: demp })) +
      o.icoonknop({ icoon: demp ? 'volume-x' : 'volume-2', aria: demp ? t('Увімкнути звук', 'Geluid aan') : t('Вимкнути звук', 'Geluid uit'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'demp', waarde: demp ? 'demp-uit' : 'demp-aan' }, klas: 'hv-km-demp' + (demp ? ' is-aan' : '') }) + '</div>');
    var tk = function (id, icoon, aria, klas) { return '<button type="button" class="hv-tvpult__toets' + (klas ? ' ' + klas : '') + '" data-actie="km-toets" data-doel="' + h(a.id) + '" data-toets="' + id + '" aria-label="' + h(aria) + '">' + (icoon ? HV.icoon(icoon, { maat: 's' }) : h(t('OK', 'OK'))) + '</button>'; };
    uit += veld(t('Пульт', 'Afstandsbediening'), '<div class="hv-tvpult"><div class="hv-tvpult__kruis">' + tk('op', 'chevron-up', t('Вгору', 'Omhoog'), 'is-op') + tk('links', 'chevron-left', t('Ліворуч', 'Links'), 'is-links') + tk('ok', null, t('Гаразд', 'Oké'), 'is-ok') + tk('rechts', 'chevron-right', t('Праворуч', 'Rechts'), 'is-rechts') + tk('neer', 'chevron-down', t('Вниз', 'Omlaag'), 'is-neer') + '</div>' +
      '<div class="hv-tvpult__zij">' + tk('terug', 'undo-2', t('Назад', 'Terug')) + tk('thuis', 'house', t('Головна', 'Startscherm')) +
      '<span class="hv-km-mini">' + o.icoonknop({ icoon: 'minus', aria: t('Канал назад', 'Vorige zender'), actie: 'km-kanaal', gegevens: { doel: a.id, richting: -1 } }) + '<output>' + h(t('кан. ', 'zender ') + kanaal) + '</output>' + o.icoonknop({ icoon: 'plus', aria: t('Канал уперед', 'Volgende zender'), actie: 'km-kanaal', gegevens: { doel: a.id, richting: 1 } }) + '</span></div></div>');
    uit += veld(t('Вимкнути через', 'Uit over'), aftelVeld(ctx, a, [30, 60, 90]));
    return '<div class="hv-km-blad">' + toestand(a) + o.kaart({ k: 'tv-bediening', inhoud: uit }) + waarom(a) + '</div>';
  }
  HV.actie('km-toets', function (ctx, g) {
    var a = ap(g.doel);
    if (!HV.kijk.isAan(a)) { HV.meld({ icoon: 'tv', titel: HV.p(a.naam), tekst: t('Спершу ввімкніть телевізор.', 'Zet eerst de tv aan.') }); return; }
    doe(a, 'toets', 'toets-' + g.toets, { stil: true });
    var el = document.querySelector('.hv-tvpult__toets[data-toets="' + g.toets + '"]');
    if (el) { el.classList.add('is-gedrukt'); setTimeout(function () { el.classList.remove('is-gedrukt'); }, 260); }
  });
  HV.actie('km-kanaal', function (ctx, g) {
    var a = ap(g.doel), nu = Number(String(HV.gewenst(a, 'kanaal')).replace('zender-', '')) || 1, n = ZENDERS.length;
    doe(a, 'kanaal', 'zender-' + (((nu - 1 + Number(g.richting)) % n + n) % n + 1));
  });

  // ───────────────────────── 8. Історія й налаштування за типом ─────────────────────────
  function grafiekThermostaat(ctx, a) {
    var w = ctx.staat, dagen = leesRooster(a.st.rooster), handmatig = a.st.modus !== 'auto';
    var doelOp = function (x) { return handmatig ? a.st.doel : roosterOp(dagen, x).temp; };
    var gemeten = volgReeks(w, a.id, doelOp, ap('tempwoon') ? ap('tempwoon').st.waarde : a.st.temperatuur);
    var doelR = []; for (var i = 0; i <= 48; i++) { var x = w.tijd - DAG + i * 30 * MIN; doelR.push([x, i === 48 ? a.st.doel : doelOp(x)]); }
    return lijnSmal({ id: 'th-hist', titel: t('Вітальня за добу', 'Woonkamer, laatste etmaal'), eenheid: '°C', van: w.tijd - DAG, tot: w.tijd, nu: w.tijd, tikken: tikken24(w), reeksen: [{ naam: t('Виміряно', 'Gemeten'), toon: 'warm', punten: gemeten, dik: true }, { naam: t('Ціль', 'Doel'), toon: 'neutraal', punten: doelR, streep: '4 4', merk: 'merk-streep' }],
      samenvatting: t('Симульований ряд; ціль іде за розкладом, виміряне — із запізненням. Останнє значення виміряне зараз.', 'Gesimuleerde reeks; het doel volgt het rooster, de meting volgt met vertraging. De laatste waarde is nu gemeten.') }) +
      staafWeek(w, 'th', 3.4, 1.8, t('год', 'u'), 'warm', t('Години обігріву за тиждень', 'Uren verwarming per week'), t('Сьогоднішній стовпчик — оцінка до кінця доби.', 'De staaf van vandaag is een schatting tot het einde van de dag.'));
  }
  function grafiekTemp(sensorId, titel, eenheid, toon) {
    return function (ctx, a) {
      var w = ctx.staat, s = sensorId ? ap(sensorId) : null, nu = s ? s.st.waarde : a.st.temperatuur != null ? a.st.temperatuur : a.st.vocht;
      var doel = a.st.doel;
      var punten = volgReeks(w, a.id, function () { return doel != null ? doel : nu; }, nu, { ruis: eenheid === '%' ? 0.9 : 0.18 });
      var reeksen = [{ naam: t('Виміряно', 'Gemeten'), toon: toon || 'warm', punten: punten, dik: true }];
      if (doel != null) reeksen.push({ naam: t('Ціль', 'Doel'), toon: 'neutraal', punten: [[w.tijd - DAG, doel], [w.tijd, doel]], streep: '4 4', merk: 'merk-streep' });
      return lijnSmal({ id: 'hist-' + a.id, titel: titel, eenheid: eenheid, decimalen: eenheid === '%' ? 0 : 1, van: w.tijd - DAG, tot: w.tijd, nu: w.tijd, tikken: tikken24(w), reeksen: reeksen, samenvatting: t('Симульований ряд за добу; останнє значення виміряне зараз.', 'Gesimuleerde reeks over een etmaal; de laatste waarde is nu gemeten.') });
    };
  }
  function grafiekWarmtepomp(ctx, a) {
    var w = ctx.staat, buiten = buitenOp(w);
    var aanvoer = volgReeks(w, 'wp-a', function (x) { return 20 + 0.6 * (20 - buiten(x)) * 1.25 + (HV.uur(x) < 6 ? -3 : 0); }, a.st.aanvoer, { ruis: 0.5 });
    var retour = volgReeks(w, 'wp-r', function (x) { return 20 + 0.6 * (20 - buiten(x)) * 1.25 - 4.6 + (HV.uur(x) < 6 ? -3 : 0); }, a.st.retour, { ruis: 0.4 });
    return lijnSmal({ id: 'wp-hist', titel: t('Подача й зворотка за добу', 'Aanvoer en retour, laatste etmaal'), eenheid: '°C', van: w.tijd - DAG, tot: w.tijd, nu: w.tijd, tikken: tikken24(w), reeksen: [{ naam: t('Подача', 'Aanvoer'), toon: 'warm', punten: aanvoer, dik: true }, { naam: t('Зворотка', 'Retour'), toon: 'koud', punten: retour }], samenvatting: t('Уночі тихий режим знижує подачу; останні значення виміряні зараз.', '’s Nachts verlaagt de stille stand de aanvoer; de laatste waarden zijn nu gemeten.') }) +
      staafWeek(w, 'wp', 4.0, 0.8, 'COP', 'warm', t('COP за днями', 'COP per dag'), t('Холодніший день — нижчий COP. Сьогодні — оцінка.', 'Een koudere dag geeft een lagere COP. Vandaag is een schatting.'));
  }
  function grafiekVentilatie(ctx, a) {
    var w = ctx.staat, van = w.tijd - DAG, zaad = zaadVan('ven'), stukken = [], banen = [];
    [[0, 6.5, 1], [6.5, 8, 3], [8, 17, 2], [17, 19, 3], [19, 23, 2], [23, 24, 1]].forEach(function (b, i) { stukken.push({ van: van + b[0] * UUR, tot: van + b[1] * UUR, toon: 'neutraal', klas: 'hv-km-stand--' + b[2], label: t('швидкість ', 'stand ') + b[2] }); void zaad; void i; });
    banen.push({ naam: t('Швидкість', 'Stand'), stukken: stukken });
    var co2 = ap('co2slaap'), punten = [];
    for (var i = 0; i <= 48; i++) { var x = van + i * 30 * MIN, u = HV.uur(x); punten.push([x, Math.round((u < 7 || u > 22 ? 900 + ruis(zaad, i) * 160 : 560 + ruis(zaad, i) * 120) )]); }
    if (co2) punten[48][1] = co2.st.waarde;
    return HV.grafiek.toestanden({ id: 'ven-banen', titel: t('Швидкість за добу', 'Stand over het etmaal'), van: van, tot: w.tijd, tikken: tikken24(w), format: HV.tijd, banen: banen, samenvatting: t('Темніша смуга — вища швидкість.', 'Een donkerder strook is een hogere stand.') }) +
      HV.grafiek.lijn({ id: 'ven-co2', titel: t('CO₂ у спальні', 'CO₂ in de slaapkamer'), eenheid: 'ppm', hoogte: 130, x: { min: van, max: w.tijd, tikken: tikken24(w), format: HV.tijd }, reeksen: [{ naam: 'CO₂', toon: 'neutraal', vlak: true, punten: punten }], samenvatting: t('Уночі CO₂ росте, вранці вентиляція його знижує.', '’s Nachts stijgt CO₂, ’s ochtends brengt de ventilatie het omlaag.') });
  }
  function grafiekReiniger(ctx, a) {
    var w = ctx.staat, van = w.tijd - DAG, zaad = zaadVan('pm'), punten = [];
    for (var i = 0; i <= 48; i++) { var x = van + i * 30 * MIN, u = HV.uur(x); punten.push([x, Math.max(1, Math.round((u > 17 && u < 20 ? 18 : 7) + ruis(zaad, i) * 6))]); }
    punten[48][1] = a.st.fijnstof;
    return HV.grafiek.lijn({ id: 'lr-pm', titel: t('PM2.5 у спальні за добу', 'PM2.5 in de slaapkamer, laatste etmaal'), eenheid: t('мкг/м³', 'µg/m³'), hoogte: 130, x: { min: van, max: w.tijd, tikken: tikken24(w), format: HV.tijd }, reeksen: [{ naam: 'PM2.5', toon: 'neutraal', vlak: true, punten: punten }], samenvatting: t('Пік увечері — готування на кухні. Межа «добре» — 15.', 'De piek ’s avonds komt van het koken. De grens ‘goed’ is 15.') });
  }
  function grafiekMedia(sleutel, titel) {
    return function (ctx, a) { return staafWeek(ctx.staat, sleutel + a.id, a.soort === 'tv' ? 2.6 : 1.8, 1.6, t('год', 'u'), 'aan', titel, t('Симульовано; сьогодні — до цієї хвилини.', 'Gesimuleerd; vandaag tot deze minuut.')); };
  }

  function instelThermostaat(ctx, a) {
    var vk = voorkeuzes(a);
    return o.kaart({ k: 'th-vk', titel: t('Температури заготовок', 'Temperaturen van de voorkeuzes'), inhoud: '<div class="hv-rijen">' + VOORKEUZE.map(function (v, i) {
      return '<div class="hv-rij"><span class="hv-rij__teken">' + HV.icoon(v[2], { maat: 's' }) + '</span><span class="hv-rij__naam">' + h(HV.p(v[1])) + '</span><span class="hv-rij__waarde">' + o.stapper({ actie: 'km-vk', gegevens: { doel: a.id, i: i }, stap: 1, label: HV.p(v[1]), waarde: HV.maat(vk[i], '°C', 1), k: 'vk-' + i }) + '</span></div>';
    }).join('') + '</div>' + '<p class="hv-km-noot">' + h(t('Межі цілі: 5–30 °C, крок 0,5. Дім тримає щонайменше 5 °C, щоб труби не замерзли.', 'Grenzen van het doel: 5–30 °C, stap 0,5. Het huis houdt minstens 5 °C, zodat de leidingen niet bevriezen.')) + '</p>' }) +
      paspoortRijen(a, [['cpu', ['Протокол', 'Protocol'], ['Zigbee', 'Zigbee']], ['battery', ['Батарейка', 'Batterij'], [String(a.batterij || 84) + ' %', String(a.batterij || 84) + ' %']], ['wrench', ['Що перевірити, якщо недоступний', 'Wat te controleren als hij onbereikbaar is'], ['батарейки, тепловий насос', 'batterijen, warmtepomp']]]);
  }
  HV.actie('km-vk', function (ctx, g) {
    var a = ap(g.doel), vk = voorkeuzes(a), i = Number(g.i);
    vk[i] = klem(rond(vk[i] + Number(g.richting) * 0.5, 0.5), 5, 28);
    doe(a, 'voorkeuzes', 'vk-' + vk.map(function (x) { return Math.round(x * 10); }).join('-'));
  });
  var CONTROLE = {
    thermostaat: [['Чи не сіли батарейки термостата', 'Of de batterijen van de thermostaat niet leeg zijn'], ['Чи працює тепловий насос', 'Of de warmtepomp werkt']],
    airco: [['Чи бачить ІЧ-передавач кондиціонер — без перешкод між ними', 'Of de infraroodzender de airco ziet — niets ertussen'], ['Чи ввімкнено кондиціонер у розетку', 'Of de airco stroom heeft']],
    warmtepomp: [['Код несправності на панелі насоса', 'De storingscode op het paneel van de pomp'], ['Тиск у контурі: норма 1,2–2,0 бар', 'De druk in het circuit: normaal 1,2–2,0 bar']],
    vloerverwarming: [['Чи не вибило запобіжник підлоги', 'Of de zekering van de vloerverwarming niet is gesprongen'], ['Приводи колектора в підсобці', 'De stelaandrijvingen van de verdeler in de bijkeuken']],
    radiatorkraan: [['Батарейки клапана: він спить, щоб їх берегти', 'De batterijen van de klep: hij slaapt om ze te sparen'], ['Чи клапан щільно сидить на радіаторі', 'Of de klep goed op de radiator zit']],
    ventilatie: [['Живлення вентиляційного блока', 'De stroom van de ventilatie-unit'], ['Чи не забитий фільтр', 'Of het filter niet verstopt is']],
    bevochtiger: [['Чи є вода в баку', 'Of er water in de tank zit'], ['Чи ввімкнено прилад у розетку', 'Of het apparaat stroom heeft']],
    luchtreiniger: [['Чи ввімкнено прилад у розетку', 'Of het apparaat stroom heeft'], ['Чи вставлено фільтр', 'Of het filter erin zit']],
    boiler: [['Захист від перегріву: кнопка скидання на бойлері', 'De oververhittingsbeveiliging: de resetknop op de boiler'], ['Запобіжник бойлера в щитку', 'De zekering van de boiler in de meterkast']],
    tv: [['Телевізор може бути в глибокому очікуванні — увімкніть пультом', 'De tv kan in diepe stand-by staan — zet hem aan met de afstandsbediening'], ['Мережа Wi-Fi у вітальні', 'Het wifi-netwerk in de woonkamer']],
    speaker: [['Мережа Wi-Fi біля колонки', 'Het wifi-netwerk bij de speaker'], ['Чи ввімкнено колонку в розетку', 'Of de speaker stroom heeft']],
    speakergroep: [['Чи доступні всі колонки групи', 'Of alle speakers van de groep bereikbaar zijn']]
  };
  // Обхід ядра: «Що перевірити» в kern/blad.js має лише світло й розетку; для своїх типів підставляємо кроки зі специфікації.
  var bladHtmlKern = HV.bladHtml;
  HV.bladHtml = function (ctx, r) {
    var uit = bladHtmlKern(ctx, r);
    if (!uit || !r || r.type !== 'apparaat' || (r.deel && r.deel !== 'bediening')) return uit;
    var a = ctx.staat.apparaten[r.id];
    if (!a || a.beschikbaar !== 'onbereikbaar' || !CONTROLE[a.soort]) return uit;
    var stappen = CONTROLE[a.soort].concat([['Чи працює вузол зв’язку', 'Of de hub werkt']]).slice(0, 3);
    return uit.replace(/<ol class="hv-stappen">[\s\S]*?<\/ol>/, '<ol class="hv-stappen">' + stappen.map(function (s) { return '<li>' + h(HV.p(s)) + '</li>'; }).join('') + '</ol>');
  };

  function rijenInstel(rijen) { return function (ctx, a) { return paspoortRijen(a, rijen); }; }
  function instelMedia(ctx, a) {
    var g = ap('multiroom');
    return (g ? o.kaart({ k: 'media-plafond', titel: t('Тиша й стеля гучності', 'Stilte en volumeplafond'), inhoud: plafondVeld(g) + '<p class="hv-km-noot">' + h(t('Тиха година 22:00–07:00: оголошення не звучать, гучність понад стелю просить підтвердження.', 'Stille uren 22:00–07:00: er wordt niet omgeroepen, volume boven het plafond vraagt om bevestiging.')) + '</p>' }) : '') +
      paspoortRijen(a, [['wifi', ['Зв’язок', 'Verbinding'], ['Wi-Fi', 'Wi-Fi']], ['wrench', ['Що перевірити, якщо недоступна', 'Wat te controleren als hij onbereikbaar is'], ['мережа, живлення', 'netwerk, stroom']]]);
  }

  var REG = [
    ['thermostaat', thermostaat, grafiekThermostaat, instelThermostaat],
    ['airco', airco, grafiekTemp('tempslaap', t('Спальня за добу', 'Slaapkamer, laatste etmaal'), '°C', 'koud'), rijenInstel([['radio-tower', ['Керування', 'Bediening'], ['інфрачервоний передавач, без зворотного зв’язку', 'infraroodzender, zonder terugmelding']], ['zap', ['Потужність охолодження', 'Koelvermogen'], ['2,5 кВт', '2,5 kW']]])],
    ['warmtepomp', warmtepomp, grafiekWarmtepomp, rijenInstel([['heater', ['Тип', 'Soort'], ['повітря — вода, 6 кВт', 'lucht-water, 6 kW']], ['moon', ['Тихі години', 'Stille uren'], ['22:00–07:00', '22:00–07:00']], ['droplet', ['Бойлер', 'Boiler'], ['200 л, у підсобці', '200 l, in de bijkeuken']]])],
    ['vloerverwarming', vloer, grafiekTemp(null, t('Ванна за добу', 'Badkamer, laatste etmaal'), '°C', 'warm'), rijenInstel([['waves', ['Зона', 'Zone'], ['ванна, 6 м²', 'badkamer, 6 m²']], ['thermometer', ['Межа підлоги', 'Grens van de vloer'], ['щонайбільше 29 °C', 'hoogstens 29 °C']]])],
    ['radiatorkraan', radiator, grafiekTemp('tempkinder', t('Дитяча за добу', 'Kinderkamer, laatste etmaal'), '°C', 'warm'), rijenInstel([['battery', ['Батарейка', 'Batterij'], ['71 %, заміна ≈ за 8 місяців', '71 %, vervangen over ≈ 8 maanden']], ['moon', ['Пробудження', 'Ontwaken'], ['кожні 5 хвилин', 'elke 5 minuten']]])],
    ['ventilatie', ventilatie, grafiekVentilatie, rijenInstel([['fan', ['Тип', 'Soort'], ['з рекуперацією тепла', 'met warmteterugwinning']], ['filter', ['Ресурс фільтра', 'Levensduur filter'], ['180 днів', '180 dagen']]])],
    ['bevochtiger', bevochtiger, grafiekTemp(null, t('Вологість у дитячій за добу', 'Vochtigheid kinderkamer, laatste etmaal'), '%', 'neutraal'), rijenInstel([['droplets', ['Бак', 'Tank'], ['3 л', '3 l']], ['wrench', ['Догляд', 'Onderhoud'], ['чистити бак щотижня', 'tank wekelijks reinigen']]])],
    ['luchtreiniger', luchtreiniger, grafiekReiniger, rijenInstel([['wind', ['Фільтр', 'Filter'], ['HEPA 13, ресурс 12 місяців', 'HEPA 13, 12 maanden']], ['ruler', ['Кімната', 'Ruimte'], ['до 30 м²', 'tot 30 m²']]])],
    ['boiler', boiler, grafiekTemp(null, t('Вода в бойлері за добу', 'Water in de boiler, laatste etmaal'), '°C', 'warm'), rijenInstel([['droplet', ['Об’єм', 'Inhoud'], ['200 л', '200 l']], ['zap', ['Нагрівач', 'Element'], ['1,8 кВт', '1,8 kW']]])],
    ['tv', tv, grafiekMedia('tv', t('Перегляд за тиждень', 'Kijktijd per week')), rijenInstel([['tv', ['Екран', 'Scherm'], ['OLED 55″', 'OLED 55″']], ['plug', ['Очікування', 'Stand-by'], ['≈ 0,5 Вт', '≈ 0,5 W']], ['wrench', ['Що перевірити, якщо недоступний', 'Wat te controleren als hij onbereikbaar is'], ['глибоке очікування, Wi-Fi', 'diepe stand-by, wifi']]])],
    ['speaker', speaker, grafiekMedia('sp', t('Прослухано за тиждень', 'Luistertijd per week')), instelMedia],
    ['speakergroep', speakergroep, grafiekMedia('gr', t('Мультирум за тиждень', 'Multiroom per week')), instelMedia]
  ];
  REG.forEach(function (r) {
    HV.blad({ soort: r[0], past: function (a) { return a.soort === r[0]; }, delen: { bediening: r[1], geschiedenis: historie(r[2]), instellingen: instel(r[3]) } });
  });

  // ───────────────────────── 9. Вкладка «Клімат» ─────────────────────────
  var KLIMAAT_DELEN = [['kamers-klimaat', ['Кімнати', 'Kamers'], 'layout-grid'], ['kamers-klimaat-lucht', ['Повітря', 'Lucht'], 'wind'], ['kamers-klimaat-weekschema', ['Тижневий розклад', 'Weekschema'], 'calendar-clock']];
  function klimaatNav(ctx) {
    var nu = ctx.route.object === 'lucht' ? 1 : ctx.route.object === 'weekschema' ? 2 : 0;
    return '<nav class="hv-km-nav" aria-label="' + h(t('Частини клімату', 'Delen van klimaat')) + '">' + KLIMAAT_DELEN.map(function (d, i) {
      return '<button type="button" class="hv-km-nav__deel' + (i === nu ? ' is-gekozen' : '') + '" aria-current="' + (i === nu ? 'page' : 'false') + '" data-actie="ga" data-naar="' + d[0] + '">' + HV.icoon(d[2], { maat: 's' }) + '<span>' + h(HV.p(d[1])) + '</span></button>';
    }).join('') + '</nav>';
  }
  function zonesNu() { return ZONES.map(zoneStaat); }
  function klimaatKop(ctx) {
    var w = ctx.staat, zones = zonesNu(), gemeten = zones.filter(function (x) { return x.gemeten != null && x.staat !== 'verouderd'; });
    var gem = gemeten.reduce(function (s, x) { return s + x.gemeten; }, 0) / (gemeten.length || 1);
    var bezig = zones.filter(function (x) { return x.bezig; }).length, vak = vakantie(w), wp = ap('warmtepomp');
    var zin = t('Удома в середньому ', 'Binnen gemiddeld ') + HV.maatTekst(gem, '°C', 1) + ' · ' + (bezig ? t('гріють зон: ', 'zones die verwarmen: ') + bezig : t('усі зони тримають ціль', 'alle zones op temperatuur')) + ' · ' + t('надворі ', 'buiten ') + HV.maatTekst(w.weer.temp, '°C', 0);
    var chips = [o.chip({ icoon: 'heater', toon: wp.st.verwarmt ? 'warm' : null, tekst: t('Насос: подача ', 'Pomp: aanvoer ') + HV.maatTekst(wp.st.aanvoer, '°C', 0) + ' · COP ' + HV.getal(wp.st.cop, 1), actie: 'blad', gegevens: { blad: 'apparaat:warmtepomp' }, k: 'chip-wp' }),
      o.chip({ icoon: 'fan', tekst: t('Вентиляція: ', 'Ventilatie: ') + HV.p(HV.beschrijf(ap('ventilatie'), 'stand', ap('ventilatie').st.stand)), actie: 'blad', gegevens: { blad: 'apparaat:ventilatie' }, k: 'chip-ven' })];
    if (vak) chips.unshift(o.chip({ icoon: 'luggage', toon: 'let-op', tekst: t('Відпустка до ', 'Vakantie tot ') + HV.p(datumPaar(vak.eind)), actie: 'blad', gegevens: { blad: 'apparaat:thermostaat' }, k: 'chip-vak' }));
    var open = zones.filter(function (x) { return x.raamOpen; });
    if (open.length) chips.push(o.chip({ icoon: 'app-window', toon: 'let-op', tekst: HV.p(open[0].kamer.naam) + t(': вікно відчинене', ': raam open'), actie: 'ga', gegevens: { naar: 'kamers-kamer-' + open[0].kamer.id }, k: 'chip-raam' }));
    var acties = '<div class="hv-km-acties">' + o.knop({ tekst: t('На 1° нижче всюди', 'Overal 1° lager'), icoon: 'thermometer-snowflake', actie: 'km-alle', gegevens: { richting: -1 } }) +
      o.knop({ tekst: t('На 1° вище всюди', 'Overal 1° hoger'), icoon: 'thermometer-sun', soort: 'stil', actie: 'km-alle', gegevens: { richting: 1 } }) +
      (vak ? o.knop({ tekst: t('Завершити відпустку', 'Vakantie beëindigen'), icoon: 'x', soort: 'stil', actie: 'km-vakantie-eind' }) : o.knop({ tekst: t('Відпустка до…', 'Vakantie tot…'), icoon: 'luggage', soort: 'stil', actie: 'blad', gegevens: { blad: 'klimaatvakantie' } })) +
      o.gevolg(t('Що станеться: ціль кожної зони з регулюванням зміниться на 1 °C; зони без регулювання не зміняться. Пов’язано з: тепловий насос гріє, доки хоч одна зона нижче цілі; кожен градус ≈ 6 % енергії на опалення. Як повернути: «Повернути» у сповіщенні 10 с.', 'Wat er gebeurt: het doel van elke geregelde zone verandert 1 °C; zones zonder regeling blijven gelijk. Hangt samen met: de warmtepomp verwarmt zolang één zone onder het doel zit; elke graad is ≈ 6 % verwarmingsenergie. Terugdraaien: ‘Ongedaan maken’ in de melding (10 s).'), { kop: t('Усі зони', 'Alle zones') }) + '</div>';
    return '<header class="hv-km-kop" data-k="kl-kop"><p class="hv-pagina__zin">' + h(zin) + '</p><div class="hv-filter hv-km-chips">' + chips.join('') + '</div>' + acties + '</header>';
  }

  function zoneKaart(x) {
    var a = x.a, k = x.kamer, blad = a ? 'apparaat:' + a.id : x.sensor ? 'apparaat:' + x.sensor.id : 'kamer:' + k.id;
    var woord = zoneWoord(x), toon = x.koelt ? 'koud' : 'warm';
    var stapper = x.doel != null && !x.uit && x.staat !== 'verouderd'
      ? '<span class="hv-km-mini hv-zone__stap">' + o.icoonknop({ icoon: 'minus', aria: HV.p(k.naam) + t(': ціль нижче', ': doel lager'), actie: 'km-zone', gegevens: { kamer: k.id, richting: -1 } }) + '<output>' + HV.maat(x.doel, '°C', 1) + '</output>' + o.icoonknop({ icoon: 'plus', aria: HV.p(k.naam) + t(': ціль вище', ': doel hoger'), actie: 'km-zone', gegevens: { kamer: k.id, richting: 1 } }) + '</span>'
      : x.doel == null && x.staat !== 'verouderd'
        ? o.knop({ tekst: t('Задати ціль', 'Doel instellen'), icoon: 'plus', klein: true, soort: 'stil', actie: 'km-zone-doel', gegevens: { kamer: k.id } })
        : '<span class="hv-zone__geen">' + h(x.staat === 'verouderd' ? t('лише перегляд: дані застаріли', 'alleen bekijken: verouderd') : t('увімкніть, щоб задати ціль', 'zet aan voor een doel')) + '</span>';
    var regelaar = a ? HV.p(HV.paspoort.soorten[a.soort].naam) : x.doel != null ? t('ціль кімнати', 'kamerdoel') : t('лише датчик', 'alleen sensor');
    var extra = x.z.extra ? ap(x.z.extra) : null;
    return '<article class="hv-zone' + (x.bezig ? ' is-bezig' : '') + (x.koelt ? ' is-koelt' : '') + (x.pauze || x.raamOpen ? ' is-pauze' : '') + (x.staat ? ' is-' + x.staat : '') + '" data-k="zone-' + h(k.id) + '">' +
      '<button type="button" class="hv-zone__lijf" data-actie="blad" data-blad="' + h(blad) + '" aria-label="' + h(HV.p(k.naam) + ': ' + (x.gemeten != null ? HV.maatTekst(x.gemeten, '°C', 1) : '—') + ', ' + woord) + '">' +
      '<span class="hv-zone__kop"><span class="hv-zone__naam">' + h(HV.p(k.naam)) + '</span><span class="hv-zone__regelaar">' + h(regelaar) + '</span></span>' +
      '<span class="hv-zone__midden">' + boog({ doel: x.doel, gemeten: x.gemeten, toon: toon, bezig: x.bezig || x.koelt }) + '<span class="hv-zone__getal">' + (x.gemeten != null ? HV.maat(x.gemeten, '°', 1) : '—') + '</span></span>' +
      '<span class="hv-zone__woord">' + (x.bezig ? HV.icoon('flame', { maat: 'maker' }) : x.koelt ? HV.icoon('snowflake', { maat: 'maker' }) : x.pauze || x.raamOpen ? HV.icoon('app-window', { maat: 'maker' }) : '') + h(woord) + (x.raamOpen && !x.pauze ? h(t(' · вікно відчинене', ' · raam open')) : '') + '</span></button>' +
      '<div class="hv-zone__voet">' + stapper + (extra ? o.icoonknop({ icoon: HV.paspoort.soorten[extra.soort].icoon, aria: HV.p(extra.naam), actie: 'blad', gegevens: { blad: 'apparaat:' + extra.id }, klas: 'hv-zone__extra' + (extra.st.aan ? ' is-aan' : '') }) : '') + '</div></article>';
  }
  function zetZoneDoel(x, v, opties) {
    if (x.a) return HV.doe({ doel: x.a.id, mogelijkheid: 'doel', waarde: v, stil: opties && opties.stil, waarom: opties && opties.waarom });
    return HV.doe({ doel: 'kamer:' + x.kamer.id, mogelijkheid: 'doel', waarde: v, stil: opties && opties.stil, waarom: opties && opties.waarom });
  }
  HV.actie('km-zone', function (ctx, g) {
    var x = zonesNu().filter(function (z) { return z.kamer.id === g.kamer; })[0];
    if (!x || x.doel == null) return;
    var v = klem(rond(x.doel + Number(g.richting) * 0.5, 0.5), 5, 30);
    if (v !== x.doel) zetZoneDoel(x, v);
  });
  HV.actie('km-zone-doel', function (ctx, g) {
    var x = zonesNu().filter(function (z) { return z.kamer.id === g.kamer; })[0];
    if (x) HV.doe({ doel: 'kamer:' + x.kamer.id, mogelijkheid: 'doel', waarde: x.gemeten != null ? klem(rond(x.gemeten, 0.5), 16, 22) : 20 });
  });
  HV.actie('km-alle', function (ctx, g) {
    var r = Number(g.richting), zones = zonesNu().filter(function (x) { return x.doel != null && !x.uit && x.staat !== 'verouderd'; });
    var voor = zones.map(function (x) { return { x: x, was: x.doel, werd: klem(x.doel + r, 5, 30) }; }).filter(function (p) { return p.werd !== p.was; });
    if (!voor.length) return;
    var waarom = r < 0 ? ['«На 1° нижче всюди»', '‘Overal 1° lager’'] : ['«На 1° вище всюди»', '‘Overal 1° hoger’'];
    Promise.all(voor.map(function (p) { return zetZoneDoel(p.x, p.werd, { stil: true, waarom: waarom }); })).then(function (uitkomst) {
      var ok = voor.filter(function (p, i) { return uitkomst[i] && uitkomst[i].ok; });
      if (!ok.length) return;
      HV.meld({ maker: HV.mens(), icoon: r < 0 ? 'thermometer-snowflake' : 'thermometer-sun', titel: (r < 0 ? t('Ціль нижче на 1 °C: ', 'Doel 1 °C lager: ') : t('Ціль вище на 1 °C: ', 'Doel 1 °C hoger: ')) + ok.length + ' ' + HV.meervoud(ok.length, ['зона', 'зони', 'зон'], ['zone', 'zones']),
        tekst: ok.map(function (p) { return HV.p(p.x.kamer.naam) + ' ' + HV.getal(p.was, 1) + ' → ' + HV.getal(p.werd, 1); }).join(' · '),
        terug: function () { ok.forEach(function (p) { zetZoneDoel(p.x, p.was, { stil: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); }); } });
    });
  });

  function warmteBlok(ctx) {
    var wp = ap('warmtepomp'), bo = ap('boiler');
    var cop = wp.st.cop, copWoord = cop >= 4 ? t('дуже добре', 'heel goed') : cop >= 3 ? t('добре', 'goed') : t('слабко', 'zwak');
    var wpKaart = '<div class="hv-km-apparaat" data-k="kl-wp"><button type="button" class="hv-km-apparaat__kop" data-actie="blad" data-blad="apparaat:warmtepomp">' + o.schakel({ aan: !!wp.st.verwarmt, icoon: 'heater', toon: 'warm' }) + '<span class="hv-km-apparaat__koptekst"><span class="hv-km-apparaat__naam">' + h(HV.p(wp.naam)) + '</span><span class="hv-km-apparaat__sub">' + h(o.beeld(wp).woord + ' · ' + HV.maatTekst(wp.st.vermogen, t('Вт', 'W'))) + '</span></span>' + HV.icoon('chevron-right', { maat: 's', klas: 'hv-km-apparaat__pijl' }) + '</button>' +
      '<div class="hv-km-apparaat__getallen"><span><b>' + HV.maat(wp.st.aanvoer, '°C', 1) + '</b><i>' + h(t('подача', 'aanvoer')) + '</i></span><span><b>' + HV.maat(wp.st.retour, '°C', 1) + '</b><i>' + h(t('зворотка', 'retour')) + '</i></span></div>' +
      '<div class="hv-km-apparaat__cop"><span class="hv-km-apparaat__copgetal">' + HV.getal(cop, 1) + '</span><div class="hv-km-apparaat__coptekst"><b>COP · ' + h(copWoord) + '</b>' + voortgang({ label: 'COP', waarde: cop, min: 1, max: 6, toon: 'warm', tekst: '' }) + '</div></div></div>';
    var douches = Math.max(0, Math.round((bo.st.temperatuur - 38) / 3.5));
    var boKaart = '<div class="hv-km-apparaat hv-km-apparaat--boiler" data-k="kl-bo">' + tank(bo.st.temperatuur, bo.st.doel) + '<button type="button" class="hv-km-apparaat__tekst" data-actie="blad" data-blad="apparaat:boiler"><span class="hv-km-apparaat__naam">' + h(HV.p(bo.naam)) + '</span><span class="hv-km-apparaat__groot">' + HV.maat(bo.st.temperatuur, '°C', 0) + '</span><span class="hv-km-apparaat__sub">' + h(t('ціль ', 'doel ') + HV.maatTekst(bo.st.doel, '°C', 0) + ' · ≈ ' + douches + ' ' + HV.meervoud(douches, ['душ', 'душі', 'душів'], ['douche', 'douches'])) + '</span><span class="hv-km-apparaat__sub">' + h(HV.p(HV.waardeNaam[bo.st.planning] || ['', ''])) + '</span></button></div>';
    return o.blok({ id: 'kl-warmte', titel: t('Тепло й вода', 'Warmte en water'), extra: o.knop({ tekst: t('Енергія: тепло', 'Energie: warmte'), klein: true, soort: 'stil', icoon: 'zap', actie: 'ga', gegevens: { naar: 'energie-warmte' } }), inhoud: '<div class="hv-km-duo">' + wpKaart + boKaart + '</div>' });
  }
  function luchtVoorproef() {
    var ven = ap('ventilatie'), lr = ap('luchtreiniger'), bv = ap('bevochtiger');
    return o.blok({ id: 'kl-luchtkort', titel: t('Повітря', 'Lucht'), extra: o.knop({ tekst: t('Усе про повітря', 'Alles over lucht'), klein: true, soort: 'stil', icoon: 'arrow-right', actie: 'ga', gegevens: { naar: 'kamers-klimaat-lucht' } }), inhoud:
      '<div class="hv-tegels">' + [ven, lr, bv].map(function (a) { return o.tegel(a, { vorm: '2x1', metKamer: true }); }).join('') + '</div>' +
      o.kaart({ k: 'kl-ven-snel', inhoud: veld(t('Вентиляція дому', 'Ventilatie van het huis'), o.segment({ label: t('Швидкість вентиляції', 'Stand van de ventilatie'), waarde: gewenst(ven, 'stand'), actie: 'km-doe', gegevens: { doel: ven.id, mogelijkheid: 'stand' }, k: 'kl-ven-stand', opties: [{ id: 0, label: t('Вимк.', 'Uit') }, { id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }, { id: 'auto', label: t('Авто', 'Auto') }] }), ' ' + o.risico('gevoelig'), 'hv-km-veld--eerste') }) });
  }
  function tempGrafiekBlok(ctx) {
    var w = ctx.staat, reeksen = [];
    [['tempwoon', 'woonkamer', 'warm'], ['tempslaap', 'slaapkamer', 'koud'], ['tempkinder', 'kinderkamer', 'auto'], ['tempwerk', 'werkkamer', 'neutraal']].forEach(function (p) {
      var s = ap(p[0]), k = HV.staat.kamer(p[1]);
      if (!s) return;
      var doel = k.doel || 20;
      reeksen.push({ naam: HV.p(k.naam), toon: p[2], punten: volgReeks(w, p[0], function (x) { var u = HV.uur(x); return u < 6.5 || u > 22.5 ? doel - 2 : doel; }, s.st.waarde, { ruis: 0.12 }) });
    });
    reeksen.push({ naam: t('Надворі', 'Buiten'), toon: 'batterij', streep: '2 3', punten: volgReeks(w, 'buiten', buitenOp(w), w.weer.temp, { ruis: 0.25, traag: 0.5 }) });
    return o.blok({ id: 'kl-grafiek', titel: t('Температура за добу', 'Temperatuur over het etmaal'), dicht: false, inhoud: o.kaart({ inhoud: lijnSmal({ id: 'kl-temp', eenheid: '°C', van: w.tijd - DAG, tot: w.tijd, nu: w.tijd, tikken: tikken24(w), hoogte: 170, reeksen: reeksen, samenvatting: t('Уночі цілі нижчі, удень зони тримають своє. Ряди симульовані; останні значення виміряні зараз.', '’s Nachts liggen de doelen lager, overdag houden de zones hun doel. Gesimuleerde reeksen; de laatste waarden zijn nu gemeten.') }) }) });
  }
  var STAND_SLEUTELS_KLIMAAT = ['klimaat', 'kamer.doel', 'klimaat.rooster', 'klimaat.vakantie', 'warmtepomp.modus', 'warmtepomp.uit', 'warmtepomp.warmwater', 'warmtepomp.stil', 'warmtepomp.stooklijn', 'ventilatie.uit', 'boiler', 'boiler.legionella'];
  var STAND_SLEUTELS_MEDIA = ['media', 'media.luid', 'media.plafond', 'media.omroep'];
  function standenBlok(ctx, id, sleutels, titel) {
    var uitvoerder = HV.ui.lees('km-uitvoerder', 'automatisering');
    var acties = sleutels.map(function (s) { return HV.gevaar.actie(s); }).filter(function (x) { return x.sleutel !== 'onbekend'; });
    return o.blok({ id: id, titel: titel, dicht: true, samenvatting: h(t('Хто, крім людей, може виконувати ці дії: сцени, автоматизації, оптимізатор, агенти.', 'Wie behalve mensen deze acties mag uitvoeren: scènes, automatiseringen, optimalisatie, agenten.')),
      uitleg: t('Що станеться: обраний виконавець зможе виконувати дію сам («Завжди»), лише після вашого схвалення («Питати») або не зможе зовсім («Вимкнено»). Пов’язано з: кожна зміна дозволу й кожна дія за ним — запис у Журналі; агент дозволів не змінює. Як повернути: оберіть «Вимкнено».', 'Wat er gebeurt: de gekozen uitvoerder mag de actie zelf doen (‘Altijd’), alleen na jouw goedkeuring (‘Vragen’) of helemaal niet (‘Uit’). Hangt samen met: elke wijziging van een toestemming en elke actie op basis daarvan komt in het logboek; een agent wijzigt geen toestemmingen. Terugdraaien: kies ‘Uit’.'),
      inhoud: o.kaart({ inhoud: o.segment({ label: t('Виконавець', 'Uitvoerder'), waarde: uitvoerder, actie: 'ui', gegevens: { naam: 'km-uitvoerder' }, klas: 'hv-segment--rol', opties: HV.gevaar.uitvoerders().map(function (u) { return { id: u.id, label: HV.p(u.naam) }; }) }) +
        '<div class="hv-km-standen">' + acties.map(function (x) { return o.stand({ uitvoerder: uitvoerder, actie: x, rol: ctx.rol }); }).join('') + '</div>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити весь реєстр', 'Het hele register openen'), icoon: 'shield-check', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-risico' } }) + '</div>' }) });
  }

  function klimaatKamers(ctx) {
    var zones = zonesNu();
    var zonesBlok = o.blok({ id: 'kl-zones', titel: t('Зони', 'Zones'), teller: zones.length, vast: true, inhoud: '<div class="hv-zones">' + zones.map(zoneKaart).join('') + '</div>' });
    return '<div class="hv-km__kolommen"><div class="hv-km__kolom hv-km__kolom--breed">' + zonesBlok + tempGrafiekBlok(ctx) + '</div><div class="hv-km__kolom">' + warmteBlok(ctx) + luchtVoorproef() + standenBlok(ctx, 'kl-standen', STAND_SLEUTELS_KLIMAAT, t('Хто ще може змінювати клімат', 'Wie het klimaat nog meer mag wijzigen')) + '</div></div>';
  }

  var CO2_BANDEN = [[800, ['добре', 'goed'], 'ok'], [1200, ['помірно', 'matig'], 'let-op'], [99999, ['провітріть', 'ventileren'], 'alarm']];
  var VOCHT_WOORD = function (v) { return v < 35 ? [t('сухо', 'droog'), 'let-op'] : v > 65 ? [t('волого', 'vochtig'), 'let-op'] : [t('добре', 'goed'), 'ok']; };
  function klimaatLucht(ctx) {
    var w = ctx.staat, co2 = ap('co2slaap'), vocht = ap('vochtbad'), lr = ap('luchtreiniger'), bv = ap('bevochtiger'), ven = ap('ventilatie');
    var rijen = [
      { kamer: 'slaapkamer', co2: co2 ? co2.st.waarde : null, vocht: null, pm: lr ? lr.st.fijnstof : null },
      { kamer: 'kinderkamer', co2: null, vocht: bv ? bv.st.vocht : null, pm: null },
      { kamer: 'badkamer', co2: null, vocht: vocht ? vocht.st.waarde : null, pm: null }
    ];
    var score = function (r) { var s = 0; if (r.co2 != null) s += r.co2 > 1200 ? 3 : r.co2 > 800 ? 1 : 0; if (r.vocht != null) s += r.vocht > 65 || r.vocht < 35 ? 2 : 0; if (r.pm != null) s += r.pm > 15 ? 2 : 0; return s; };
    rijen.sort(function (p, q) { return score(q) - score(p); });
    var cel = function (waarde, woord, toon, eenheid, dec) { return waarde == null ? '<td class="hv-lucht__leeg">' + h(t('немає датчика', 'geen sensor')) + '</td>' : '<td><span class="hv-lucht__waarde">' + HV.maat(waarde, eenheid, dec || 0) + '</span><span class="hv-lucht__woord hv-lucht__woord--' + toon + '">' + h(woord) + '</span></td>'; };
    var tabel = '<div class="hv-tabel__rol"><table class="hv-lucht"><thead><tr><th scope="col">' + h(t('Кімната', 'Kamer')) + '</th><th scope="col">CO₂</th><th scope="col">' + h(t('Вологість', 'Vochtigheid')) + '</th><th scope="col">PM2.5</th></tr></thead><tbody>' + rijen.map(function (r) {
      var c = r.co2 != null ? CO2_BANDEN.filter(function (b) { return r.co2 <= b[0]; })[0] : null, v = r.vocht != null ? VOCHT_WOORD(r.vocht) : null;
      return '<tr><th scope="row"><button type="button" class="hv-link" data-actie="ga" data-naar="kamers-kamer-' + r.kamer + '">' + h(HV.p(HV.staat.kamer(r.kamer).naam)) + '</button></th>' + cel(r.co2, c ? HV.p(c[1]) : '', c ? c[2] : '', 'ppm') + cel(r.vocht, v ? v[0] : '', v ? v[1] : '', '%') + cel(r.pm, r.pm != null ? pmWoord(r.pm) : '', r.pm != null && r.pm > 15 ? 'let-op' : 'ok', t('мкг/м³', 'µg/m³'), 1) + '</tr>';
    }).join('') + '</tbody></table></div>';
    var gevolg = co2 && co2.st.waarde > 1000 ? t('Порада: провітріть спальню або посильте вентиляцію на 15 хв.', 'Advies: zet het slaapkamerraam open of versterk de ventilatie 15 min.') : vocht && vocht.st.waarde > 65 ? t('Порада: у ванній волого — посильте вентиляцію на 30 хв.', 'Advies: het is vochtig in de badkamer — versterk de ventilatie 30 min.') : t('Повітря в домі добре; вентиляція працює за потребою.', 'De lucht in huis is goed; de ventilatie draait naar behoefte.');
    var rang = o.blok({ id: 'lu-rang', titel: t('Кімнати за якістю повітря', 'Kamers op luchtkwaliteit'), vast: true, inhoud: o.kaart({ inhoud: tabel + '<p class="hv-tekst">' + HV.icoon('lightbulb', { maat: 's' }) + '<span>' + h(gevolg) + '</span></p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Посилити вентиляцію на 15 хв', 'Ventilatie 15 min versterken'), icoon: 'wind', actie: 'km-doe', gegevens: { doel: 'ventilatie', mogelijkheid: 'boost', waarde: 'boost-tot-' + (w.tijd + 15 * MIN) } }) + o.knop({ tekst: lr.st.aan ? t('Очищувач: вимкнути', 'Luchtreiniger uit') : t('Увімкнути очищувач', 'Luchtreiniger aanzetten'), icoon: 'wind', soort: 'stil', actie: 'schakel', gegevens: { doel: lr.id, mogelijkheid: 'aan' } }) + '</div>' }) });
    var apparaten = o.blok({ id: 'lu-apparaten', titel: t('Прилади повітря', 'Luchtapparaten'), vast: true, inhoud: '<div class="hv-tegels">' + [ven, lr, bv].map(function (a) { return o.tegel(a, { vorm: '2x1', metKamer: true }); }).join('') + '</div>' });
    var grafiek = o.blok({ id: 'lu-grafiek', titel: t('CO₂ за добу', 'CO₂ over het etmaal'), inhoud: o.kaart({ inhoud: grafiekVentilatie(ctx, ven) }) });
    return '<div class="hv-km__kolommen"><div class="hv-km__kolom hv-km__kolom--breed">' + rang + grafiek + '</div><div class="hv-km__kolom">' + apparaten + o.blok({ id: 'lu-ven', titel: HV.p(ven.naam), vast: true, inhoud: ventilatie(ctx, ven) }) + '</div></div>';
  }
  function klimaatRooster(ctx) {
    var th = ap('thermostaat');
    return '<div class="hv-km__kolommen hv-km__kolommen--een">' + o.blok({ id: 'ws-editor', titel: t('Тижневий розклад термостата', 'Weekschema van de thermostaat'), vast: true, extra: o.knop({ tekst: t('Термостат', 'Thermostaat'), klein: true, soort: 'stil', icoon: 'thermometer', actie: 'blad', gegevens: { blad: 'apparaat:thermostaat' } }), inhoud: o.kaart({ inhoud: roosterEditor(ctx, th, false) }) }) + '</div>';
  }
  function klimaat(ctx) {
    var deel = ctx.route.object === 'lucht' ? klimaatLucht(ctx) : ctx.route.object === 'weekschema' ? klimaatRooster(ctx) : klimaatKamers(ctx);
    return '<div class="hv-km hv-km--klimaat" data-k="km-klimaat">' + klimaatNav(ctx) + klimaatKop(ctx) + deel + '</div>';
  }

  // Відпустка: вільний аркуш із датою кінця й температурою; початок — одна чутлива дія плюс цілі зон, кінець — повернення.
  HV.blad({ soort: 'klimaatvakantie', vrij: true, icoon: 'luggage', titel: ['Відпустка до…', 'Vakantie tot…'], sub: function () { return t('клімат усього дому', 'klimaat van het hele huis'); }, render: function (ctx) {
    var w = ctx.staat, dagen = Number(HV.ui.lees('vak-dagen', 7)), temp = Number(HV.ui.lees('vak-temp', 15)), eind = middernacht(w.tijd) + dagen * DAG + 16 * UUR;
    var zones = zonesNu().filter(function (x) { return x.doel != null && !x.uit && x.staat !== 'verouderd'; });
    return '<div class="hv-km-blad">' + o.kaart({ inhoud: veld(t('Повернуся', 'Ik ben terug'), '<div class="hv-filter">' + [[1, ['Завтра', 'Morgen']], [3, ['Через 3 дні', 'Over 3 dagen']], [7, ['Через тиждень', 'Over een week']], [14, ['Через 2 тижні', 'Over 2 weken']]].map(function (d) {
      return o.chip({ filter: true, gekozen: d[0] === dagen, tekst: HV.p(d[1]), actie: 'ui', gegevens: { naam: 'vak-dagen', waarde: d[0] }, k: 'vak-' + d[0] });
    }).join('') + '</div><p class="hv-tekst hv-tekst--zacht">' + HV.icoon('calendar', { maat: 's' }) + '<span>' + h(t('Дім почне гріти о 16:00, ', 'Het huis begint om 16:00 te verwarmen, ') + HV.p(datumPaar(eind))) + '</span></p>', '', 'hv-km-veld--eerste') +
      veld(t('Тримати всюди', 'Overal aanhouden'), '<span class="hv-stapper"><button type="button" class="hv-stap" data-actie="ui" data-naam="vak-temp" data-waarde="' + Math.max(10, temp - 1) + '" aria-label="' + h(t('Холодніше', 'Kouder')) + '">' + HV.icoon('minus', { maat: 's' }) + '</button><span class="hv-stapper__getal">' + HV.maat(temp, '°C', 0) + '</span><button type="button" class="hv-stap" data-actie="ui" data-naam="vak-temp" data-waarde="' + Math.min(18, temp + 1) + '" aria-label="' + h(t('Тепліше', 'Warmer')) + '">' + HV.icoon('plus', { maat: 's' }) + '</button></span>') +
      '<div class="hv-gevolg-blok">' + o.gevolgRijen(t('Що станеться: ', 'Wat er gebeurt: ') + zones.length + t(' зон триматимуть ', ' zones houden ') + temp + t(' °C до ', ' °C aan tot ') + HV.p(datumPaar(eind)) + t(' 16:00, потім цілі й розклад повернуться самі. Пов’язано з: бойлер і вентиляція працюють як звичайно; економія ≈ 30 % тепла на день. Як повернути: «Завершити відпустку» на сторінці клімату або в термостаті.', ' 16:00, daarna komen de doelen en het rooster vanzelf terug. Hangt samen met: de boiler en de ventilatie werken gewoon door; besparing ≈ 30 % warmte per dag. Terugdraaien: ‘Vakantie beëindigen’ op de klimaatpagina of in de thermostaat.')) + '</div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Скасувати', 'Annuleren'), soort: 'stil', actie: 'blad-sluit' }) + o.knop({ tekst: t('Почати відпустку', 'Vakantie starten'), icoon: 'luggage', soort: 'hoofd', actie: 'km-vakantie-start', gegevens: { eind: eind, temp: temp } }) + '</div>' }) + '</div>';
  } });
  HV.actie('km-vakantie-start', function (ctx, g) {
    var th = ap('thermostaat'), eind = Number(g.eind), temp = Number(g.temp);
    var zones = zonesNu().filter(function (x) { return x.doel != null && !x.uit && x.staat !== 'verouderd'; });
    var voor = zones.map(function (x) { return [x.kamer.id, x.doel]; });
    doe(th, 'vakantie', 'vakantie-' + eind + '-' + Math.round(temp * 10)).then(function (r) {
      if (!r || !r.ok) return;
      HV.staat.wijzig(function () { th.st.vakantieVoor = JSON.stringify({ doelen: voor, modus: th.st.modus }); });
      zones.forEach(function (x) { if (x.doel !== temp) zetZoneDoel(x, temp, { stil: true, waarom: ['відпустка', 'vakantie'] }); });
      if (ctx.blad) ctx.blad(null);
    });
  });
  function eindeVakantie(automatisch) {
    var th = ap('thermostaat');
    if (!th || !vakantie(HV.staat.w)) return;
    var voor = {}; try { voor = JSON.parse(th.st.vakantieVoor || '{}'); } catch (e) { voor = {}; }
    var waarom = automatisch ? ['заплановано вами: кінець відпустки', 'door jou gepland: einde vakantie'] : ['відпустку завершено', 'vakantie beëindigd'];
    HV.doe({ doel: th.id, mogelijkheid: 'vakantie', waarde: 'vakantie-geen', stil: true, zonderRitueel: automatisch, waarom: waarom }).then(function (r) {
      if (!r || !r.ok) return;
      var zones = zonesNu();
      (voor.doelen || []).forEach(function (p) { var x = zones.filter(function (z) { return z.kamer.id === p[0]; })[0]; if (x && x.doel !== p[1]) zetZoneDoel(x, p[1], { stil: true, waarom: waarom }); });
      HV.meld({ maker: HV.mens(), icoon: 'luggage', titel: t('Відпустку завершено', 'Vakantie beëindigd'), tekst: t('Цілі зон повернуто', 'De doelen van de zones zijn terug') + (voor.modus === 'auto' ? t('; розклад знову діє.', '; het rooster werkt weer.') : '.') });
    });
  }
  HV.actie('km-vakantie-eind', function () { eindeVakantie(false); });

  // ───────────────────────── 10. Вкладка «Медіа» ─────────────────────────
  function mediaKop(ctx) {
    var spelers = HV.kijk.alle(function (a) { return (a.soort === 'speaker' || a.soort === 'speakergroep') && a.st.speelt; });
    var tvA = ap('tv');
    var los = spelers.filter(function (a) { return a.soort === 'speaker' && !(ap('multiroom').st.speelt && ap('multiroom').leden.indexOf(a.id) >= 0); });
    var delen = [];
    if (ap('multiroom').st.speelt) delen.push(t('грає група «', 'de groep ‘') + HV.p(ap('multiroom').naam) + t('»', '’ speelt'));
    los.forEach(function (a) { delen.push(HV.p(HV.staat.kamer(a.kamer).naam) + ': «' + huidig(a).titel + '»'); });
    var zin = (delen.length ? t('Грає: ', 'Speelt: ') + delen.join(' · ') : t('Тиша в домі', 'Stilte in huis')) + ' · ' + t('телевізор ', 'tv ') + (tvA.st.aan ? HV.woord.aan() : t('в очікуванні', 'op stand-by'));
    var p = plafond();
    return '<header class="hv-km-kop" data-k="me-kop"><p class="hv-pagina__zin">' + h(zin) + '</p><div class="hv-filter hv-km-chips">' +
      o.chip({ icoon: 'map-pin', tekst: t('Де грає', 'Waar speelt het'), actie: 'blad', gegevens: { blad: 'media:waar' }, k: 'chip-waar' }) +
      o.chip({ icoon: 'moon', tekst: t('Тиша 22–07 · стеля ', 'Stil 22–07 · plafond ') + (p == null ? t('немає', 'geen') : p + ' %'), actie: 'blad', gegevens: { blad: 'apparaat:multiroom', deel: 'instellingen' }, k: 'chip-plafond' }) + '</div></header>';
  }
  function speeltNu(ctx) {
    var g = ap('multiroom'), lijst = [];
    if (g.st.speelt) lijst.push(g);
    HV.kijk.soort('speaker').forEach(function (a) { if (a.st.speelt && !(g.st.speelt && g.leden.indexOf(a.id) >= 0)) lijst.push(a); });
    var speelt = lijst.length;
    // тиша: ті самі програвачі на паузі — група першою, потім кожна колонка; одним дотиком «Грати»
    if (!speelt) lijst = [g].concat(HV.kijk.soort('speaker'));
    return o.blok({ id: 'me-nu', titel: speelt ? t('Зараз грає', 'Speelt nu') : t('Тиша в домі — що увімкнути?', 'Stilte in huis — wat zet je aan?'), teller: speelt || null, vast: true,
      inhoud: '<div class="hv-spelers' + (speelt ? '' : ' is-stil') + '">' + lijst.map(function (a, i) { return spelerKaart(ctx, a, { groot: i === 0, k: '-nu' }); }).join('') + '</div>' });
  }
  function multiroomBlok(ctx) {
    var g = ap('multiroom');
    var leden = HV.kijk.soort('speaker').map(function (l) {
      var lid = g.leden.indexOf(l.id) >= 0, k = HV.staat.kamer(l.kamer);
      return '<div class="hv-km-lid' + (lid ? ' is-lid' : '') + '" data-k="mr-' + h(l.id) + '"><div class="hv-km-lid__kop">' + o.chip({ filter: true, gekozen: lid, icoon: lid ? 'check' : 'plus', tekst: HV.p(k.naam), actie: 'km-doe', gegevens: { doel: g.id, mogelijkheid: 'samenstelling', waarde: groepZonder(g, l.id, !lid) }, aria: (lid ? t('Прибрати з групи: ', 'Uit de groep halen: ') : t('Додати до групи: ', 'Aan de groep toevoegen: ')) + HV.p(l.naam) }) + '<span class="hv-km-lid__stand">' + h(l.st.speelt ? t('грає', 'speelt') : t('тиша', 'stil')) + '</span></div>' +
        plafondOm(o.schuif({ label: t('Гучність: ', 'Volume: ') + HV.p(k.naam), waarde: Number(gewenst(l, 'volume')) || 0, min: 0, max: 100, stap: 2, toon: 'neutraal', actie: 'km-schuif', gegevens: { doel: l.id, mogelijkheid: 'volume' }, k: 'mrvol-' + l.id })) + '</div>';
    }).join('');
    var speelt = !!gewenst(g, 'afspelen');
    return o.blok({ id: 'me-multiroom', titel: t('Мультирум', 'Multiroom'), extra: o.knop({ tekst: speelt ? t('Пауза всюди', 'Overal pauze') : t('Грати всюди', 'Overal afspelen'), icoon: speelt ? 'pause' : 'play', klein: true, soort: speelt ? 'stil' : 'hoofd', actie: 'schakel', gegevens: { doel: g.id, mogelijkheid: 'afspelen' } }), inhoud:
      o.kaart({ k: 'mr-kaart', titel: HV.p(g.naam) + ' · ' + g.leden.length + ' ' + HV.meervoud(g.leden.length, ['колонка', 'колонки', 'колонок'], ['speaker', 'speakers']), extra: o.icoonknop({ icoon: 'settings-2', aria: t('Аркуш групи', 'Blad van de groep'), actie: 'blad', gegevens: { blad: 'apparaat:' + g.id } }), inhoud:
        veld(t('Гучність усієї групи', 'Volume van de hele groep'), plafondOm(o.schuif({ label: t('Гучність групи', 'Volume van de groep'), waarde: Number(gewenst(g, 'volume')) || 0, min: 0, max: 100, stap: 2, toon: 'neutraal', actie: 'km-schuif', gegevens: { doel: g.id, mogelijkheid: 'volume' }, k: 'mr-groepvol' })), '', 'hv-km-veld--eerste') +
        veld(t('Склад і гучність кожної колонки', 'Samenstelling en volume per speaker'), '<div class="hv-km-leden">' + leden + '</div>') +
        '<p class="hv-km-noot">' + h(t('Колонка в групі грає те саме, що й група; гучність кожної — окремо. Риска на смузі — стеля гучності.', 'Een speaker in de groep speelt hetzelfde als de groep; het volume per speaker stel je apart in. Het streepje op de schuif is het volumeplafond.')) + '</p>' }) });
  }
  function tvBlok(ctx) {
    var a = ap('tv'), aan = !!gewenst(a, 'aan'), bron = a.st.bron, kanaal = Number(String(a.st.kanaal).replace('zender-', '')) || 1, demp = a.st.demp === 'demp-aan';
    var bronNaam = HV.p((BRONNEN_TV.filter(function (b) { return b.id === bron; })[0] || BRONNEN_TV[0]).label);
    var snel = aan ? '<div class="hv-km-tvsnel">' +
      '<span class="hv-km-mini">' + o.icoonknop({ icoon: 'volume-1', aria: t('Тихіше', 'Zachter'), actie: 'km-stap', gegevens: { doel: a.id, mogelijkheid: 'volume', stap: 2, richting: -1, min: 0, max: 100 } }) + '<output>' + HV.getal(gewenst(a, 'volume')) + ' %</output>' + o.icoonknop({ icoon: 'volume-2', aria: t('Гучніше', 'Harder'), actie: 'km-stap', gegevens: { doel: a.id, mogelijkheid: 'volume', stap: 2, richting: 1, min: 0, max: 100 } }) + '</span>' +
      o.icoonknop({ icoon: demp ? 'volume-x' : 'volume', aria: demp ? t('Увімкнути звук', 'Geluid aan') : t('Вимкнути звук', 'Geluid uit'), actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'demp', waarde: demp ? 'demp-uit' : 'demp-aan' }, klas: 'hv-km-demp' + (demp ? ' is-aan' : '') }) +
      (bron === 'tv' ? '<span class="hv-km-mini">' + o.icoonknop({ icoon: 'chevron-left', aria: t('Канал назад', 'Vorige zender'), actie: 'km-kanaal', gegevens: { doel: a.id, richting: -1 } }) + '<output>' + h(t('кан. ', 'zender ') + kanaal) + '</output>' + o.icoonknop({ icoon: 'chevron-right', aria: t('Канал уперед', 'Volgende zender'), actie: 'km-kanaal', gegevens: { doel: a.id, richting: 1 } }) + '</span>' : '') + '</div>' : '';
    return o.blok({ id: 'me-tv', titel: t('Телевізор', 'Televisie'), inhoud: o.kaart({ k: 'tv-kaart', klas: 'hv-km-tvkaart', inhoud: kop(a, { woord: aan ? HV.p(HV.staat.kamer(a.kamer).naam) + ' · ' + HV.woord.aan() : HV.p(HV.staat.kamer(a.kamer).naam) + ' · ' + t('очікування', 'stand-by'), getal: aan ? h(bron === 'tv' ? kanaal + ' · ' + HV.p(zenderNaam(kanaal)) : bronNaam) : '', sub: aan ? h(demp ? t('звук вимкнено', 'geluid uit') : t('гучність ', 'volume ') + a.st.volume + ' %') : h(t('дотик до знака вмикає телевізор', 'tik op het teken om de tv aan te zetten')) }) + snel +
      (aan ? o.segment({ label: t('Джерело сигналу', 'Signaalbron'), waarde: bron, actie: 'km-doe', gegevens: { doel: a.id, mogelijkheid: 'bron' }, klas: 'hv-segment--vier', k: 'me-tv-bron', opties: BRONNEN_TV.map(function (b) { return { id: b.id, label: HV.p(b.label) }; }) }) : '') +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Пульт і канали', 'Afstandsbediening en zenders'), icoon: 'gamepad-2', soort: aan ? 'gewoon' : 'stil', actie: 'blad', gegevens: { blad: 'apparaat:tv' } }) + '</div>' }) });
  }
  function media(ctx) {
    var tegels = HV.kijk.alle(function (a) { return MEDIA.indexOf(a.soort) >= 0; });
    var apparaten = o.blok({ id: 'me-apparaten', titel: t('Колонки й телевізор', 'Speakers en tv'), teller: tegels.length, inhoud: '<div class="hv-tegels">' + tegels.map(function (a) { return o.tegel(a, { bediening: true, metKamer: true }); }).join('') + '</div>' });
    return '<div class="hv-km hv-km--media" data-k="km-media">' + mediaKop(ctx) + '<div class="hv-km__kolommen"><div class="hv-km__kolom hv-km__kolom--breed">' + speeltNu(ctx) + multiroomBlok(ctx) + '</div><div class="hv-km__kolom">' + tvBlok(ctx) + apparaten +
      standenBlok(ctx, 'me-standen', STAND_SLEUTELS_MEDIA, t('Хто ще може керувати медіа', 'Wie de media nog meer mag bedienen')) + '</div></div></div>';
  }

  // «Де грає»: усі джерела звуку дому одним списком із швидким керуванням.
  HV.blad({ soort: 'media', vrij: true, icoon: 'map-pin', titel: ['Де грає', 'Waar speelt het'], sub: function () { var n = HV.kijk.alle(function (a) { return (a.soort === 'speaker' && a.st.speelt) || (a.soort === 'tv' && a.st.aan); }).length; return n ? t('звучить у ', 'geluid in ') + n + ' ' + HV.meervoud(n, ['кімнаті', 'кімнатах', 'кімнатах'], ['kamer', 'kamers']) : t('усюди тиша', 'overal stil'); }, render: function (ctx) {
    var verd = ['beneden', 'boven', 'zolder'];
    var spelers = HV.kijk.alle(function (a) { return a.soort === 'speaker' || a.soort === 'tv'; });
    var rijen = spelers.map(function (a) {
      var aan = a.soort === 'tv' ? !!a.st.aan : !!a.st.speelt, k = HV.staat.kamer(a.kamer), s = a.soort === 'tv' ? null : huidig(a);
      return '<div class="hv-km-waar' + (aan ? ' is-aan' : '') + '" data-k="waar-' + h(a.id) + '">' + o.schakel({ aan: aan, icoon: HV.paspoort.soorten[a.soort].icoon, toon: 'aan', staat: a.wacht ? 'wacht' : null, actie: 'schakel', gegevens: { doel: a.id, mogelijkheid: a.soort === 'tv' ? 'aan' : 'afspelen' }, aria: HV.p(a.naam) }) +
        '<button type="button" class="hv-km-waar__tekst" data-actie="blad" data-blad="apparaat:' + h(a.id) + '"><span class="hv-km-waar__kamer">' + h(HV.p(k.naam)) + '</span><span class="hv-km-waar__wat">' + h(a.soort === 'tv' ? (aan ? HV.p(HV.waardeNaam[a.st.bron] || [a.st.bron, a.st.bron]) : t('очікування', 'stand-by')) : aan ? s.titel : t('тиша · ', 'stil · ') + s.bron) + '</span></button>' +
        '<span class="hv-km-waar__vol">' + HV.maat(a.st.volume, '%') + '</span></div>';
    }).join('');
    void verd;
    return '<div class="hv-km-blad">' + o.kaart({ inhoud: '<div class="hv-km-waarlijst">' + rijen + '</div>' }) + o.kaart({ titel: t('Група «', 'Groep ‘') + HV.p(ap('multiroom').naam) + t('»', '’'), inhoud: spelerKaart(ctx, ap('multiroom'), { zonderChips: true, k: '-waar' }) }) +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Сторінка медіа', 'Mediapagina'), icoon: 'arrow-right', soort: 'stil', actie: 'ga', gegevens: { naar: 'kamers-media' } }) + '</div></div>';
  } });

  HV.tab('kamers', { id: 'klimaat', titel: ['Клімат', 'Klimaat'], adres: '/klimaat', render: klimaat });
  HV.tab('kamers', { id: 'media', titel: ['Медіа', 'Media'], adres: '/media', render: media });
})(window.HV = window.HV || {});
