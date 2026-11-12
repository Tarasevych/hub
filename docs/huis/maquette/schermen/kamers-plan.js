// Kamers → Plattegrond en Kamers → Apparaten / Кімнати → План і Кімнати → Пристрої.
// Адреси на справжньому сайті: /kamers/plattegrond?verdieping=&laag=&t= і /apparaten.
// План — креслярська мова: стіни 2 px --text, кімнати на папері, двері дугою, вікна подвійною лінією, розміри й масштаб.
// Шари: світло, клімат (температура / вологість / CO₂, ціль — «привид»), безпека (накладається), присутність, енергія, усе.
// «Перегляд минулого» відтворює стан дому на обраний час доби; керування тоді вимкнене. Під планом — той самий зміст списком.
// Реєстр пристроїв: пошук, фільтри, збережені вигляди, групування, групова дія з поступом «N з M», чесні стани.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  // ───────────────────────── Креслення (метри) ─────────────────────────
  // Кімнати — прямокутники; vlakken — неінтерактивні частини креслення (сходи, під'їзд, вулиця, обрис будинку).
  // deuren: x, y — завіса; l — ширина; as 'h' (у горизонтальній стіні) чи 'v'; zwaai ±1 — куди відчиняється стулка.
  var PLAN = {
    beneden: {
      b: 10, h: 8,
      kamers: [
        { id: 'woonkamer', x: 0, y: 0, b: 6, h: 5 }, { id: 'keuken', x: 6, y: 0, b: 4, h: 4.5 },
        { id: 'bijkeuken', x: 6, y: 4.5, b: 4, h: 3.5 }, { id: 'hal', x: 2.5, y: 5, b: 3.5, h: 3 }
      ],
      vlakken: [{ soort: 'trap', x: 0, y: 5, b: 2.5, h: 3, naam: ['Сходи', 'Trap'] }],
      deuren: [{ x: 3.4, y: 8, l: 1, as: 'h', zwaai: -1 }, { x: 3.6, y: 5, l: 0.9, as: 'h', zwaai: -1 }, { x: 6, y: 5.6, l: 0.9, as: 'v', zwaai: 1 }, { x: 6, y: 2.4, l: 1.1, as: 'v', zwaai: -1 }, { x: 1, y: 5, l: 0.9, as: 'h', zwaai: -1 }],
      ramen: [[0, 1, 0, 4], [1.2, 0, 4.6, 0], [7, 0, 9.2, 0], [10, 1, 10, 3.4], [10, 5.4, 10, 6.8]]
    },
    boven: {
      b: 10, h: 8,
      kamers: [
        { id: 'slaapkamer', x: 0, y: 0, b: 5, h: 4.5 }, { id: 'kinderkamer', x: 5, y: 0, b: 5, h: 4 },
        { id: 'werkkamer', x: 0, y: 4.5, b: 5, h: 3.5 }, { id: 'badkamer', x: 5, y: 4, b: 3, h: 4 }
      ],
      vlakken: [{ soort: 'trap', x: 8, y: 4, b: 2, h: 4, naam: ['Сходи', 'Trap'] }],
      deuren: [{ x: 3.8, y: 4.5, l: 0.9, as: 'h', zwaai: -1 }, { x: 5, y: 6.6, l: 0.9, as: 'v', zwaai: 1 }, { x: 8, y: 5.2, l: 0.9, as: 'v', zwaai: -1 }, { x: 8.6, y: 4, l: 0.9, as: 'h', zwaai: -1 }, { x: 3.8, y: 4.5, l: 0.9, as: 'h', zwaai: 1 }],
      ramen: [[0.8, 0, 3.6, 0], [6, 0, 9, 0], [0, 5.4, 0, 7.2], [10, 1, 10, 3], [5.6, 8, 7.4, 8]]
    },
    zolder: {
      b: 10, h: 6,
      kamers: [{ id: 'zolder', x: 0, y: 0, b: 6, h: 6 }, { id: 'logeerkamer', x: 6, y: 0, b: 4, h: 6 }],
      vlakken: [], schuin: [0.9, 5.1],
      deuren: [{ x: 6, y: 2.6, l: 0.9, as: 'v', zwaai: 1 }],
      ramen: [[7, 0, 9, 0], [0, 2, 0, 4], [10, 2, 10, 4]]
    },
    buiten: {
      b: 18, h: 19,
      kamers: [{ id: 'garage', x: 12.5, y: 5.2, b: 5, h: 5 }, { id: 'tuin', x: 0, y: 11.2, b: 18, h: 7.8 }],
      vlakken: [
        { soort: 'straat', x: 0, y: 0, b: 18, h: 1.2, naam: ['Вулиця · Wilgenlaan', 'Straat · Wilgenlaan'] },
        { soort: 'oprit', x: 12.5, y: 1.2, b: 5, h: 4, naam: ['Під’їзд', 'Oprit'] },
        { soort: 'huis', x: 1, y: 2.6, b: 10, h: 8, naam: ['Будинок', 'Woning'], naar: 'beneden' },
        { soort: 'maaizone', x: 5.8, y: 12.4, b: 11.6, h: 5.9, naam: ['Зона косарки', 'Maaigebied'] }
      ],
      deuren: [{ x: 13.4, y: 5.2, l: 3, as: 'h', zwaai: 0 }],
      ramen: []
    }
  };
  var VERDIEPINGEN = ['beneden', 'boven', 'zolder', 'buiten'];

  // Місця пристроїв на плані (метри від лівого верхнього кута поверху); групи (lichtgroep, speakergroep) не мають місця.
  // Камери мають третє число — напрям погляду в градусах (0 — праворуч, 90 — донизу).
  var PLEK = {
    torsher: [0.9, 4.2], plafondwoon: [3.0, 2.6], ledstrip: [5.5, 2.3], stekkermedia: [5.5, 3.5], gordijnwoon: [0.4, 2.6], thermostaat: [2.4, 4.5],
    tv: [5.5, 1.2], speakerwoon: [4.0, 4.5], irzender: [4.3, 1.2], tempwoon: [1.6, 1.7], luxwoon: [0.5, 1.4],
    keukenlicht: [8.0, 2.3], aanrechtlicht: [9.5, 1.3], speakerkeuken: [9.5, 3.8], vaatwasser: [6.6, 3.9], oven: [7.7, 3.9], koelkast: [9.5, 2.6],
    koffie: [8.6, 0.6], tempkeuken: [6.7, 1.9], rookkeuken: [8.0, 1.1],
    warmtepomp: [9.4, 5.3], ventilatie: [8.2, 5.3], boiler: [9.4, 6.5], wasmachine: [6.6, 7.4], droger: [7.7, 7.4], thuisbatterij: [9.4, 7.5],
    lekbijkeuken: [6.9, 6.3], cobijkeuken: [8.3, 6.6],
    hallicht: [4.25, 6.5], beweginghal: [5.55, 5.5], voordeurcontact: [4.1, 7.6], voordeurslot: [3.2, 7.55], alarm: [5.55, 6.5], deurbel: [5.0, 7.55],
    router: [2.95, 6.6], p1meter: [5.55, 7.55], sceneknop: [3.2, 6.5], stofzuiger: [4.25, 7.6],
    slaaplicht: [1.0, 3.6], jaloezieslaap: [2.5, 0.4], airco: [4.6, 0.9], luchtreiniger: [4.4, 3.8], tempslaap: [1.2, 1.7], co2slaap: [3.4, 2.5], raamslaap: [1.4, 0.4],
    kinderlicht: [7.5, 2.0], radiatorkinder: [9.6, 2.6], bevochtiger: [6.0, 3.4], tempkinder: [9.3, 1.1], raamkinder: [7.5, 0.4], batterijraam: [8.4, 0.5],
    badlicht: [6.5, 5.6], vloerbad: [6.5, 7.2], vochtbad: [7.5, 4.6],
    werklicht: [1.2, 6.2], stekkerbureau: [2.4, 7.5], computer: [3.4, 6.6], printer: [4.5, 7.5], aanwezigwerk: [4.4, 5.0], tempwerk: [0.6, 5.2],
    zolderlicht: [3.0, 3.0], nas: [5.4, 5.4], tempzolder: [1.0, 5.0], zonnepanelen: [3.0, 0.5],
    tuinlicht: [9.0, 13.2], maaier: [6.9, 17.3], beregening: [14.0, 14.5], cameratuin: [17.4, 11.7, 150, 4.2], cameravoor: [4.4, 2.75, 270, 2.2], poort: [0.9, 1.9],
    garagedeur: [15.0, 5.6], laadpaal: [13.1, 9.6], cameragarage: [17.1, 9.8, 215, 3.6]
  };

  // ───────────────────────── Шари ─────────────────────────
  var LAGEN = [
    { id: 'licht', icoon: 'lightbulb', naam: ['Світло', 'Licht'] },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат', 'Klimaat'] },
    { id: 'beveiliging', icoon: 'shield', naam: ['Безпека', 'Beveiliging'] },
    { id: 'aanwezigheid', icoon: 'person-standing', naam: ['Присутність', 'Aanwezigheid'] },
    { id: 'energie', icoon: 'zap', naam: ['Енергія', 'Energie'] },
    { id: 'alles', icoon: 'layout-grid', naam: ['Усі пристрої', 'Alle apparaten'] }
  ];
  var IN_LAAG = {
    licht: ['licht', 'gordijn', 'jaloezie', 'lichtsterkte'],
    // датчики клімату не дублюють число кімнати знаками — вони є на шарі «Усі пристрої» і в списку
    klimaat: ['thermostaat', 'airco', 'warmtepomp', 'vloerverwarming', 'radiatorkraan', 'ventilatie', 'bevochtiger', 'luchtreiniger', 'boiler'],
    beveiliging: ['slot', 'alarmsysteem', 'contact', 'camera', 'deurbel', 'rook', 'co', 'lek', 'garagedeur', 'poort'],
    aanwezigheid: ['beweging', 'aanwezigheid'],
    energie: ['stopcontact', 'wasmachine', 'droger', 'vaatwasser', 'oven', 'koelkast', 'koffie', 'tv', 'computer', 'nas', 'printer', 'router', 'warmtepomp', 'boiler', 'thuisbatterij', 'laadpaal', 'zonnepanelen', 'p1meter']
  };
  var VEILIG = IN_LAAG.beveiliging;
  var KLIMAAT_SUB = [
    { id: 'temperatuur', naam: ['Температура', 'Temperatuur'], eenheid: '°C', dec: 1, treden: [17, 19, 20.5, 22] },
    { id: 'vocht', naam: ['Вологість', 'Vochtigheid'], eenheid: '%', dec: 0, treden: [35, 45, 55, 65] },
    { id: 'co2', naam: ['CO₂', 'CO₂'], eenheid: 'ppm', dec: 0, treden: [600, 800, 1000, 1400] }
  ];
  var ENERGIE_TREDEN = [15, 60, 200, 600];
  var trede = function (v, treden) { var i = 0; while (i < treden.length && v >= treden[i]) i++; return i + 1; };

  // ───────────────────────── Стан: зараз або в минулому ─────────────────────────
  var UUR = 3600000;
  var DONKER = function (u) { return u < 7.66 || u > 16.92; };
  var binnen = function (vensters, u) { return (vensters || []).some(function (v) { return u >= v[0] && u < v[1]; }); };
  var ACTIEF = {
    woonkamer: [[6.6, 8.2], [16.5, 23]], keuken: [[6.5, 8.2], [17, 20.6]], slaapkamer: [[6.4, 6.9], [22.4, 23.2]], kinderkamer: [[6.5, 7.2], [19.4, 20.4]],
    badkamer: [[6.5, 7.3], [22.3, 22.9]], werkkamer: [[15.6, 19]], tuin: [[17, 22.5]], bijkeuken: [[19, 19.4]]
  };
  function zaad(id) { var z = 0; for (var i = 0; i < id.length; i++) z = (z * 31 + id.charCodeAt(i)) % 9973; return z; }
  function standOm(u) { var s = HV.paspoort.dag.stand; for (var i = 0; i < s.length; i++) if (u >= s[i][0] && u < s[i][1]) return s[i][2]; return 'thuis'; }
  function thuisOm(u) { return binnen(HV.paspoort.dag.aanwezig, u); }
  function deurMinuten(T) {
    // хвилини від останнього руху вхідних дверей до моменту T (події доби з паспорта)
    var best = null;
    for (var d = -1; d <= 0; d++) {
      var nul = Math.floor(T / 86400000) * 86400000 + d * 86400000;
      HV.paspoort.dag.deuren.forEach(function (u) { var m = nul + u * UUR; if (m <= T) { var min = (T - m) / 60000; if (best == null || min < best) best = min; } });
    }
    return best == null ? 999 : best;
  }

  /** Бачення дому: зараз (живий стан) або на момент T (відтворено з доби дому й Журналу). */
  function bron(ctx) {
    var w = ctx.staat, uren = Number(HV.ui.lees('plan-t', 0)) || 0;
    var T = w.tijd + uren * UUR, verleden = uren < 0;
    var u = HV.uur(T), stand = standOm(u), thuis = thuisOm(u), dm = deurMinuten(T);
    var B = { verleden: verleden, T: T, uur: u };
    var lichtAan = function (a) {
      if (!verleden) return a.beschikbaar !== 'onbereikbaar' && !!a.st.aan;
      if (a.id === 'zolderlicht') return T > w.tijd - 28 * 60000 - 6 * UUR;
      if (a.id === 'tuinlicht') return DONKER(u) && binnen(ACTIEF.tuin, u);
      if (a.id === 'hallicht') return DONKER(u) && dm < 6;
      if (stand === 'nacht') return a.id === 'kinderlicht';
      if (!thuis || !DONKER(u)) return false;
      var venster = ACTIEF[a.kamer];
      if (!binnen(venster, u)) return false;
      return zaad(a.id) % 3 !== 0 || (u > 18 && u < 21);
    };
    B.aan = function (a) {
      if (a.soort === 'licht') return lichtAan(a);
      if (!verleden) return a.beschikbaar !== 'onbereikbaar' && o.beeld(a).aan;
      if (a.soort === 'contact') return a.id === 'voordeurcontact' ? dm < 1.5 : a.id === 'raamslaap' ? (u >= 7 && u < 7.4) : false;
      if (a.soort === 'slot') return dm < 4; // відімкнено
      if (a.soort === 'beweging') return dm < 2;
      if (a.soort === 'aanwezigheid') return u >= 15.6 && u < 19;
      if (a.soort === 'tv') return thuis && u >= 19 && u < 22.5;
      if (a.soort === 'computer') return u >= 15.6 && u < 23;
      if (a.soort === 'wasmachine') return u >= 13.85 && u < 15.45;
      if (a.soort === 'vaatwasser') return u >= 20.5 && u < 22;
      if (a.soort === 'oven') return u >= 18 && u < 18.7;
      if (a.soort === 'warmtepomp' || a.soort === 'thermostaat') return (u >= 6 && u < 8) || (u >= 16 && u < 22);
      if (a.soort === 'speaker') return a.id === 'speakerkeuken' && ((u >= 7 && u < 8) || (u >= 13 && u < 15));
      if (a.soort === 'laadpaal') return u >= 1 && u < 5;
      if (a.soort === 'zonnepanelen') return u > 7.66 && u < 16.92;
      return 'aan' in a.st ? zaad(a.id + Math.floor(u)) % 4 === 0 : false;
    };
    B.temp = function (kamerId) {
      if (kamerId === 'tuin') return { waarde: verleden ? Math.round((w.weer.temp - 2.5 + 3 * Math.sin(Math.PI * (u - 8) / 12)) * 10) / 10 : w.weer.temp, bron: 'weer' };
      var s = HV.kijk.temperatuur(kamerId);
      if (!s && kamerId === 'badkamer') s = w.apparaten.vloerbad;
      if (!s) return null;
      var nu = s.soort === 'temperatuur' ? s.st.waarde : s.st.temperatuur;
      if (!verleden) return { waarde: nu, a: s };
      var k = HV.staat.kamer(kamerId), doel = k.doel || 20.5;
      if (kamerId === 'zolder') doel = 15.8;
      var d = stand === 'nacht' ? -2.4 : stand === 'afwezig' ? -1.8 : -0.3;
      if (kamerId === 'zolder') d = DONKER(u) ? -1.2 : 0.4;
      return { waarde: Math.round((doel + d + 0.35 * Math.sin(u + zaad(kamerId))) * 10) / 10, a: s };
    };
    B.vocht = function (kamerId) {
      var s = HV.kijk.inKamer(kamerId, function (a) { return a.soort === 'vocht' || a.soort === 'bevochtiger'; })[0];
      if (!s) return null;
      var nu = s.soort === 'vocht' ? s.st.waarde : s.st.vocht;
      if (!verleden) return { waarde: nu, a: s };
      if (s.soort === 'vocht') return { waarde: u >= 6.5 && u < 7.6 ? 78 - Math.round((u - 6.5) * 12) : (u >= 22.3 && u < 23.2 ? 72 : 56 + zaad(String(Math.floor(u))) % 5), a: s };
      return { waarde: 44 + zaad(String(Math.floor(u))) % 4, a: s };
    };
    B.co2 = function (kamerId) {
      var s = HV.kijk.inKamer(kamerId, function (a) { return a.soort === 'co2'; })[0];
      if (!s) return null;
      if (!verleden) return { waarde: s.st.waarde, a: s };
      var nacht = u >= 23 || u < 6.6;
      return { waarde: nacht ? 900 + Math.round(((u + 1) % 24) * 60) : 520 + zaad(String(Math.floor(u))) % 140, a: s };
    };
    B.beweging = function (kamerId) {
      var s = HV.kijk.inKamer(kamerId, function (a) { return a.soort === 'beweging' || a.soort === 'aanwezigheid'; })[0];
      if (!s) return null;
      if (!verleden) return { a: s, actief: !!s.st.actief, minuten: s.soort === 'beweging' ? s.st.laatst : null };
      if (s.soort === 'beweging') return { a: s, actief: dm < 2, minuten: Math.round(dm) };
      return { a: s, actief: u >= 15.6 && u < 19, minuten: null };
    };
    B.watt = function (a) {
      if (a.leden || a.beschikbaar === 'onbereikbaar') return 0;
      var aan = B.aan(a), st = a.st;
      if (a.soort === 'licht') return aan ? a.watt * ('helderheid' in st ? st.helderheid / 100 : 1) : 0;
      if (a.soort === 'stopcontact') return verleden ? (a.id === 'stekkermedia' ? (thuis && u >= 19 && u < 22.5 ? 46 : 8) : (u >= 15.6 && u < 23 ? 118 : 4)) : (st.aan ? st.vermogen : 0);
      if (a.soort === 'warmtepomp') return verleden ? (aan ? 620 : 35) : st.vermogen || 0;
      if (a.soort === 'wasmachine' || a.soort === 'droger' || a.soort === 'vaatwasser') return verleden ? (aan ? 480 : 0) : st.vermogen || 0;
      if (a.soort === 'oven') return aan ? 2100 : 0;
      if (a.soort === 'boiler') return verleden ? ((u >= 5.5 && u < 6.2) || (u >= 21 && u < 21.5) ? 1800 : 0) : (st.verwarmt ? 1800 : 0);
      if (a.soort === 'laadpaal') return verleden ? (aan ? 7400 : 0) : (st.vermogen || 0) * 1000;
      if (a.soort === 'nas' || a.soort === 'router') return a.watt;
      if (a.watt) return aan ? a.watt : 0;
      return 0;
    };
    B.zon = function () {
      if (!verleden) return w.apparaten.zonnepanelen.st.vermogen;
      var hoek = u > 7.66 && u < 16.92 ? Math.sin(Math.PI * (u - 7.66) / (16.92 - 7.66)) : 0;
      return Math.round(4.2 * 0.84 * hoek * (1 - 0.82 * w.weer.bewolking) * 100) / 100;
    };
    B.alarm = function (a) { return !verleden && !!a.st.alarm; };
    return B;
  }

  // ───────────────────────── Кімната на шарі ─────────────────────────
  function inLaag(a, laag, veilig) {
    if (!PLEK[a.id]) return false;
    if (veilig && VEILIG.indexOf(a.soort) >= 0) return true;
    if (laag === 'alles') return true;
    return (IN_LAAG[laag] || []).indexOf(a.soort) >= 0;
  }

  /** Що кімната каже на шарі: { klas, hoofd (HTML), sub, aria, onbemeten, verouderd }. */
  function kamerOpLaag(k, laag, B) {
    var w = HV.staat.w, uit = { klas: '', hoofd: '', sub: '', aria: '', onbemeten: false, verouderd: false };
    if (laag === 'licht' || laag === 'alles') {
      var lampen = HV.kijk.lampen(k.id), aan = lampen.filter(B.aan), dood = lampen.filter(function (a) { return a.beschikbaar === 'onbereikbaar'; });
      if (laag === 'licht') {
        if (!lampen.length) { uit.sub = t('без світла', 'geen lampen'); uit.aria = uit.sub; return uit; }
        uit.klas = aan.length ? 'is-licht' : '';
        uit.hoofd = aan.length + '<span class="hv-plan__van"> ' + h(t('з', 'van')) + ' ' + lampen.length + '</span>';
        uit.sub = aan.length ? t('увімкнено', 'aan') : t('світло вимкнено', 'licht uit');
        if (dood.length && !B.verleden) uit.sub += ' · ' + dood.length + ' ' + t('недоступна', 'niet bereikbaar');
        uit.aria = t('Світло: ', 'Licht: ') + aan.length + ' ' + t('з', 'van') + ' ' + lampen.length + ' ' + t('увімкнено', 'aan');
        return uit;
      }
      var tp = B.temp(k.id);
      uit.hoofd = tp ? HV.maat(tp.waarde, '°C', 1) : '';
      uit.sub = lampen.length ? (aan.length ? aan.length + ' ' + t('з', 'van') + ' ' + lampen.length + ' ' + t('ламп', 'lampen') : t('світло вимкнено', 'licht uit')) : '';
      uit.klas = aan.length ? 'is-licht' : '';
      uit.aria = (tp ? HV.maatTekst(tp.waarde, '°C', 1) + '. ' : '') + uit.sub;
      return uit;
    }
    if (laag === 'klimaat') {
      var sub = KLIMAAT_SUB.filter(function (x) { return x.id === HV.ui.lees('plan-klimaat', 'temperatuur'); })[0] || KLIMAAT_SUB[0];
      var m = sub.id === 'temperatuur' ? B.temp(k.id) : sub.id === 'vocht' ? B.vocht(k.id) : B.co2(k.id);
      if (!m) { uit.onbemeten = true; uit.klas = 'is-onbemeten'; uit.hoofd = '—'; uit.sub = t('не вимірюється', 'niet gemeten'); uit.aria = HV.p(sub.naam) + ': ' + uit.sub; return uit; }
      uit.klas = 'hv-warmte--' + trede(m.waarde, sub.treden);
      uit.hoofd = HV.maat(m.waarde, sub.eenheid, sub.dec);
      if (m.a && m.a.beschikbaar === 'verouderd') { uit.verouderd = true; uit.klas += ' is-verouderd'; uit.sub = HV.woord.verouderd() + ' ' + HV.oud(HV.kijk.leeftijd(m.a)); }
      else if (m.bron === 'weer') uit.sub = t('за прогнозом погоди', 'volgens het weerbericht');
      else if (sub.id === 'temperatuur' && k.doel != null) uit.sub = t('ціль ', 'doel ') + HV.getal(k.doel, 1) + ' °C';
      else if (k.id === 'badkamer' && sub.id === 'temperatuur') uit.sub = t('за теплою підлогою', 'via de vloerverwarming');
      uit.doel = sub.id === 'temperatuur' && k.doel != null && !uit.verouderd ? k.doel : null;
      uit.aria = HV.p(sub.naam) + ': ' + HV.maatTekst(m.waarde, sub.eenheid, sub.dec) + (uit.sub ? ', ' + uit.sub : '');
      return uit;
    }
    if (laag === 'aanwezigheid') {
      var bw = B.beweging(k.id);
      if (!bw) { uit.onbemeten = true; uit.klas = 'is-onbemeten'; uit.hoofd = '—'; uit.sub = t('не вимірюється', 'niet gemeten'); uit.aria = t('Присутність: не вимірюється', 'Aanwezigheid: niet gemeten'); return uit; }
      uit.klas = bw.actief ? 'is-aanwezig' : '';
      uit.hoofd = h(bw.actief ? (bw.a.soort === 'beweging' ? t('рух зараз', 'beweging nu') : t('хтось є', 'iemand aanwezig')) : (bw.minuten != null ? HV.duur(bw.minuten) : t('нікого', 'niemand')));
      uit.sub = bw.actief ? t('без імен — лише датчик', 'zonder namen — alleen de sensor') : (bw.minuten != null ? t('від останнього руху', 'sinds de laatste beweging') : t('датчик присутності', 'aanwezigheidssensor'));
      uit.aria = t('Присутність: ', 'Aanwezigheid: ') + HV.p([bw.actief ? 'є рух' : 'немає руху', bw.actief ? 'beweging' : 'geen beweging']) + (bw.minuten != null && !bw.actief ? ', ' + HV.duur(bw.minuten) : '');
      return uit;
    }
    if (laag === 'energie') {
      var lijst = HV.kijk.inKamer(k.id, function (a) { return !a.leden; });
      var watt = lijst.reduce(function (s, a) { return s + B.watt(a); }, 0);
      var heeft = lijst.some(function (a) { return a.watt || (IN_LAAG.energie.indexOf(a.soort) >= 0 && a.soort !== 'zonnepanelen' && a.soort !== 'p1meter'); });
      if (!heeft) { uit.onbemeten = true; uit.klas = 'is-onbemeten'; uit.hoofd = '—'; uit.sub = t('без лічильників', 'geen meting'); uit.aria = t('Енергія: не вимірюється', 'Energie: niet gemeten'); return uit; }
      uit.klas = 'hv-warmte--' + trede(watt, ENERGIE_TREDEN);
      uit.hoofd = watt >= 1000 ? HV.maat(watt / 1000, t('кВт', 'kW'), 1) : HV.maat(Math.round(watt), t('Вт', 'W'));
      uit.sub = t('споживання зараз', 'verbruik nu');
      if (k.id === 'zolder') { var zon = B.zon(); uit.sub = zon > 0.05 ? t('сонце дає ', 'zon levert ') + HV.getal(zon, 1) + ' ' + t('кВт', 'kW') : t('сонце: 0 кВт', 'zon: 0 kW'); }
      if (B.verleden) uit.sub = t('споживання тоді', 'verbruik toen');
      uit.aria = t('Енергія: ', 'Energie: ') + (watt >= 1000 ? HV.maatTekst(watt / 1000, t('кВт', 'kW'), 1) : HV.maatTekst(Math.round(watt), t('Вт', 'W')));
      return uit;
    }
    return uit;
  }

  /** Знак пристрою на плані: { aan, toon, staat, icoon, woord }. */
  function merkBeeld(a, B) {
    var s = HV.paspoort.soorten[a.soort] || {};
    if (!B.verleden) {
      var b = o.beeld(a);
      var staat = a.wacht ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : null);
      var toon = b.toon || s.toon || 'neutraal';
      if (a.soort === 'contact' && a.st.open) toon = 'let-op';
      if (a.soort === 'slot' && !a.st.vergrendeld) toon = 'let-op';
      if ((a.soort === 'rook' || a.soort === 'lek' || a.soort === 'co') && a.st.alarm) toon = 'alarm';
      return { aan: staat !== 'onbereikbaar' && b.aan, toon: toon, staat: staat, icoon: staat === 'onbereikbaar' ? 'unplug' : b.icoon, woord: staat === 'onbereikbaar' ? HV.woord.onbereikbaar() : a.wacht ? HV.woord.wacht() : (b.woord || HV.p(s.naam || ['', ''])), waarde: b.waarde ? b.waarde.replace(/<[^>]+>/g, '') : '' };
    }
    var aan = B.aan(a), icoon = s.icoon || 'circle-help', woord = aan ? HV.woord.aan() : HV.woord.uit(), tn = s.toon || 'neutraal';
    if (a.soort === 'contact') { icoon = aan ? 'door-open' : 'door-closed'; woord = aan ? HV.woord.open() : HV.woord.dicht(); if (aan) tn = 'let-op'; }
    if (a.soort === 'slot') { icoon = aan ? 'lock-keyhole-open' : 'lock-keyhole'; woord = aan ? HV.woord.ontgrendeld() : HV.woord.vergrendeld(); if (aan) tn = 'let-op'; }
    if (a.soort === 'beweging' || a.soort === 'aanwezigheid') woord = aan ? t('рух', 'beweging') : t('тихо', 'stil');
    return { aan: aan, toon: tn, staat: null, icoon: icoon, woord: woord, waarde: '' };
  }

  // ───────────────────────── Розкладка знаків (пікселі) ─────────────────────────
  var M = 44, KIER = 2;
  function botst(x, y, geplaatst, label) {
    for (var i = 0; i < geplaatst.length; i++) if (Math.abs(geplaatst[i].x - x) < M + KIER && Math.abs(geplaatst[i].y - y) < M + KIER) return true;
    if (label && x + M / 2 > label.x && x - M / 2 < label.x + label.b && y + M / 2 > label.y && y - M / 2 < label.y + label.h) return true;
    return false;
  }
  /** Ставить знаки на місця; що не вміщається — у лічильник «+N». Повертає { merken:[{a,x,y}], teller:{x,y,n,ids}|null }. */
  function plaats(lijst, vak, label, S) {
    var geplaatst = [], over = [];
    var x0 = vak.x + M / 2 + 2, x1 = vak.x + vak.b - M / 2 - 2, y0 = vak.y + M / 2 + 2, y1 = vak.y + vak.h - M / 2 - 2;
    var stappen = [[0, 0]];
    for (var r = 1; r <= 7; r++) for (var hk = 0; hk < 8; hk++) { var hoek = hk * Math.PI / 4; stappen.push([Math.round(Math.cos(hoek) * r * 24), Math.round(Math.sin(hoek) * r * 24)]); }
    lijst.forEach(function (x) {
      var p = PLEK[x.id], px = p[0] * S, py = p[1] * S, gevonden = null;
      if (x1 < x0 || y1 < y0) { over.push(x); return; }
      for (var i = 0; i < stappen.length && !gevonden; i++) {
        var cx = Math.max(x0, Math.min(x1, px + stappen[i][0])), cy = Math.max(y0, Math.min(y1, py + stappen[i][1]));
        if (!botst(cx, cy, geplaatst, label)) gevonden = { a: x, x: cx, y: cy };
      }
      if (gevonden) geplaatst.push(gevonden); else over.push(x);
    });
    var teller = null;
    if (over.length) {
      // лічильник займає місце останнього знака, якщо вільного немає
      var plek = null;
      for (var j = 0; j < stappen.length && !plek; j++) {
        var tx = Math.max(x0, Math.min(x1, x1 - stappen[j][0])), ty = Math.max(y0, Math.min(y1, y1 - stappen[j][1]));
        if (!botst(tx, ty, geplaatst, label)) plek = { x: tx, y: ty };
      }
      if (!plek && geplaatst.length) { var weg = geplaatst.pop(); over.unshift(weg.a); plek = { x: weg.x, y: weg.y }; }
      // зовсім тісно: лічильник стає в правий нижній кут, навіть поверх підпису — пристрій не губиться
      if (!plek) plek = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
      if (plek) teller = { x: plek.x, y: plek.y, n: over.length, ids: over.map(function (a) { return a.id; }) };
    }
    return { merken: geplaatst, teller: teller };
  }

  /** Оцінка місця підпису кімнати (лівий верхній кут), щоб знаки його не закривали. */
  function labelVak(x, y, b, naam, z, chip, klein) {
    var maxB = Math.max(40, b - 20);
    var regels = function (breed) { return Math.max(1, Math.ceil(breed / maxB)); };
    var naamB = naam.length * 8.4 + 8, hoofdB = (z.hoofd || '').replace(/<[^>]+>/g, '').length * (klein ? 10.5 : 12) + 8, subB = (z.sub || '').length * 6.6 + (z.doel != null ? 22 : 8);
    var hoogte = 10 + 14 * regels(naamB) + (z.hoofd ? (klein ? 21 : 25) : 0) + (z.sub ? 15 * regels(subB) + (z.doel != null ? 6 : 0) : 0) + (chip ? 24 : 0) + 4;
    return { x: x + 2, y: y + 2, b: Math.min(maxB, Math.max(naamB, hoofdB, Math.min(subB, maxB))) + 12, h: hoogte };
  }

  // ───────────────────────── Ширина полотна ─────────────────────────
  var gebruikteBreedte = null, controleGepland = false;
  function vensterBreedte(ctx) {
    var el = document.querySelector('.hv-plan__venster');
    if (el && el.clientWidth > 0) return el.clientWidth;
    var p = ctx.profiel, b = p.breedte || 390;
    if (b < 700) return b - 32;
    var laag = ctx.route.blad ? (b >= 1100 ? 400 : 360) + 28 : 0;
    return Math.max(320, Math.min(1560, b - laag) - 48 - (b >= 900 ? 300 : 0));
  }
  function controleerBreedte() {
    if (controleGepland) return;
    controleGepland = true;
    var stap = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    stap(function () {
      controleGepland = false;
      var el = document.querySelector('.hv-plan__venster');
      if (el && gebruikteBreedte != null && Math.abs(el.clientWidth - gebruikteBreedte) > 3) HV.teken();
      var zoom = document.querySelector('.hv-plan__venster[data-centreer]');
      if (zoom) {
        var c = zoom.getAttribute('data-centreer').split(',');
        zoom.scrollLeft = Math.max(0, Number(c[0]) - zoom.clientWidth / 2);
        zoom.scrollTop = Math.max(0, Number(c[1]) - zoom.clientHeight / 2);
        zoom.removeAttribute('data-centreer');
      }
    });
  }

  // ───────────────────────── Креслення: SVG-лінії ─────────────────────────
  function lijnen(v, S, B, laag, veilig) {
    var R = function (n) { return (n * S).toFixed(1); };
    var uit = '';
    // вікна: подвійна лінія в зовнішній стіні
    v.ramen.forEach(function (r) { uit += '<line class="hv-plan__raam-gat" x1="' + R(r[0]) + '" y1="' + R(r[1]) + '" x2="' + R(r[2]) + '" y2="' + R(r[3]) + '"/><line class="hv-plan__raam" x1="' + R(r[0]) + '" y1="' + R(r[1]) + '" x2="' + R(r[2]) + '" y2="' + R(r[3]) + '"/>'; });
    // двері: проріз, стулка й дуга
    v.deuren.forEach(function (d) {
      var x = d.x, y = d.y, l = d.l;
      if (d.as === 'h') {
        uit += '<line class="hv-plan__deur-gat" x1="' + R(x) + '" y1="' + R(y) + '" x2="' + R(x + l) + '" y2="' + R(y) + '"/>';
        if (d.zwaai) uit += '<line class="hv-plan__deur" x1="' + R(x) + '" y1="' + R(y) + '" x2="' + R(x) + '" y2="' + R(y + d.zwaai * l) + '"/><path class="hv-plan__boog" d="M' + R(x + l) + ' ' + R(y) + 'A' + R(l) + ' ' + R(l) + ' 0 0 ' + (d.zwaai > 0 ? 1 : 0) + ' ' + R(x) + ' ' + R(y + d.zwaai * l) + '"/>';
        else uit += '<line class="hv-plan__deur hv-plan__deur--rol" x1="' + R(x) + '" y1="' + R(y + 0.15) + '" x2="' + R(x + l) + '" y2="' + R(y + 0.15) + '"/>';
      } else {
        uit += '<line class="hv-plan__deur-gat" x1="' + R(x) + '" y1="' + R(y) + '" x2="' + R(x) + '" y2="' + R(y + l) + '"/>';
        uit += '<line class="hv-plan__deur" x1="' + R(x) + '" y1="' + R(y) + '" x2="' + R(x + d.zwaai * l) + '" y2="' + R(y) + '"/><path class="hv-plan__boog" d="M' + R(x) + ' ' + R(y + l) + 'A' + R(l) + ' ' + R(l) + ' 0 0 ' + (d.zwaai > 0 ? 0 : 1) + ' ' + R(x + d.zwaai * l) + ' ' + R(y) + '"/>';
      }
    });
    // сходи: щаблі
    v.vlakken.forEach(function (f) {
      if (f.soort !== 'trap') return;
      var n = Math.round((f.b > f.h ? f.b : f.h) / 0.28);
      for (var i = 1; i < n; i++) {
        if (f.h >= f.b) uit += '<line class="hv-plan__trede" x1="' + R(f.x) + '" y1="' + R(f.y + i * f.h / n) + '" x2="' + R(f.x + f.b) + '" y2="' + R(f.y + i * f.h / n) + '"/>';
        else uit += '<line class="hv-plan__trede" x1="' + R(f.x + i * f.b / n) + '" y1="' + R(f.y) + '" x2="' + R(f.x + i * f.b / n) + '" y2="' + R(f.y + f.h) + '"/>';
      }
      uit += '<path class="hv-plan__looplijn" d="M' + R(f.x + f.b / 2) + ' ' + R(f.y + f.h - 0.3) + 'L' + R(f.x + f.b / 2) + ' ' + R(f.y + 0.5) + 'm-6 8l6 -8l6 8"/>';
    });
    // схил даху на горищі
    if (v.schuin) v.schuin.forEach(function (y) { uit += '<line class="hv-plan__schuin" x1="0" y1="' + R(y) + '" x2="' + R(v.b) + '" y2="' + R(y) + '"/>'; });
    // поля зору камер (лише на шарі безпеки)
    if (veilig || laag === 'beveiliging') {
      Object.keys(PLEK).forEach(function (id) {
        var p = PLEK[id], a = HV.staat.w.apparaten[id];
        if (p.length < 3 || !a || !opVerdieping(a, v)) return;
        var r = (p[3] || 4) * S, h0 = (p[2] - 28) * Math.PI / 180, h1 = (p[2] + 28) * Math.PI / 180;
        uit += '<path class="hv-plan__kegel' + (a.beschikbaar === 'onbereikbaar' ? ' is-dood' : '') + '" d="M' + R(p[0]) + ' ' + R(p[1]) + 'L' + (p[0] * S + r * Math.cos(h0)).toFixed(1) + ' ' + (p[1] * S + r * Math.sin(h0)).toFixed(1) + 'A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (p[0] * S + r * Math.cos(h1)).toFixed(1) + ' ' + (p[1] * S + r * Math.sin(h1)).toFixed(1) + 'Z"/>';
      });
    }
    return '<svg class="hv-plan__lijnen" width="' + R(v.b) + '" height="' + R(v.h) + '" viewBox="0 0 ' + R(v.b) + ' ' + R(v.h) + '" aria-hidden="true" focusable="false">' + uit + '</svg>';
  }
  var verdiepingVan = function (a) { var k = HV.staat.kamer(a.kamer); return k ? k.verdieping : null; };
  var opVerdieping = function (a, v) { return PLAN[verdiepingVan(a)] === v; };

  // ───────────────────────── План ─────────────────────────
  function verdieping(ctx) {
    var id = ctx.route.object;
    if (VERDIEPINGEN.indexOf(id) < 0) id = HV.ui.lees('plan-verdieping', 'beneden');
    return id;
  }
  function laagNu() { var l = HV.ui.lees('plan-laag', 'licht'); return LAGEN.some(function (x) { return x.id === l && l !== 'beveiliging'; }) ? l : 'licht'; }

  function plattegrond(ctx) {
    var w = ctx.staat, vid = verdieping(ctx), v = PLAN[vid], B = bron(ctx);
    var laag = laagNu(), veilig = !!HV.ui.lees('plan-veilig', false);
    var zoom = Number(HV.ui.lees('plan-zoom', 1)) || 1;
    var breedte = vensterBreedte(ctx);
    gebruikteBreedte = breedte;
    controleerBreedte();
    var RAND = { boven: 30, links: 30, rechts: 14, onder: 14 };
    // креслення вміщається і в ширину, і у висоту екрана (телефон — до ~45 % висоти)
    var p = ctx.profiel, maxH = p.breedte < 700 ? Math.round((p.hoogte || 844) * 0.46) : Math.max(440, (p.hoogte || 900) - 290);
    var S0 = Math.max(16, Math.min((breedte - RAND.links - RAND.rechts) / v.b, (maxH - RAND.boven - RAND.onder) / v.h));
    var S = S0 * zoom;
    var velB = Math.floor(v.b * S + RAND.links + RAND.rechts), velH = Math.floor(v.h * S + RAND.boven + RAND.onder);
    var basisH = Math.floor(v.h * S0 + RAND.boven + RAND.onder);
    var links = Math.max(0, Math.floor((breedte - velB) / 2));
    var kamers = w.kamers.filter(function (k) { return k.verdieping === vid; });
    var focus = null;
    if (ctx.route.blad && ctx.route.blad.type === 'kamer') focus = ctx.route.blad.id;
    if (B.verleden) focus = HV.ui.lees('plan-kamer-t', null);

    // кімнати
    var kamerHtml = '', merkHtml = '', alarmen = [];
    v.kamers.forEach(function (r) {
      var k = HV.staat.kamer(r.id);
      if (!k) return;
      var x = r.x * S, y = r.y * S, b = r.b * S, hh = r.h * S;
      var z = kamerOpLaag(k, laag, B);
      var alarm = HV.kijk.inKamer(k.id, function (a) { return (a.soort === 'rook' || a.soort === 'lek' || a.soort === 'co') && B.alarm(a); });
      var open = HV.kijk.inKamer(k.id, function (a) { return a.soort === 'contact' && B.aan(a) && HV.kijk.isVers(a); });
      if (alarm.length) alarmen.push(k.id);
      var veiligChip = '';
      if (veilig || laag === 'beveiliging') {
        if (open.length) veiligChip = '<span class="hv-plan__chip hv-toon-let-op">' + HV.icoon('door-open', { maat: 'maker' }) + h(open.length + ' ' + t('відчинено', 'open')) + '</span>';
      }
      // мала кімната: підпис без другого рядка (він є в aria і в списку під планом), щоб лишилося місце для знаків
      var compact = hh < 112 || b < 104;
      // на шарах зі знаками стан несуть самі знаки — число лишаємо лише для клімату й енергії
      if (compact) z = { klas: z.klas, hoofd: laag === 'klimaat' || laag === 'energie' ? z.hoofd : '', sub: z.doel != null && hh >= 96 ? z.sub : '', aria: z.aria, doel: hh >= 96 ? z.doel : null, onbemeten: z.onbemeten, verouderd: z.verouderd };
      var label = labelVak(x, y, b, HV.p(k.naam), z, !!veiligChip, ctx.profiel.breedte < 700);
      var groot = b * hh / (S * S);
      var aria = HV.p(k.naam) + '. ' + z.aria + (open.length ? '. ' + t('Відчинено: ', 'Open: ') + open.length : '') + (alarm.length ? '. ' + t('Тривога', 'Alarm') : '') + '. ' + (B.verleden ? t('Показати, як було', 'Tonen hoe het was') : t('Відкрити кімнату', 'Kamer openen'));
      kamerHtml += '<button type="button" class="hv-plan__kamer ' + z.klas + (alarm.length ? ' is-alarm' : '') + (focus === k.id ? ' is-gekozen' : '') + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + b.toFixed(1) + 'px;height:' + hh.toFixed(1) + 'px" data-actie="' + (B.verleden ? 'plan-kamer-t' : 'blad') + '" data-blad="kamer:' + h(k.id) + '" data-kamer="' + h(k.id) + '" data-plan-kamer="1" data-k="pk-' + h(k.id) + '" aria-label="' + h(aria) + '">' +
        '<span class="hv-plan__label"><span class="hv-plan__naam">' + h(HV.p(k.naam)) + '</span>' +
        (z.hoofd ? '<span class="hv-plan__waarde">' + z.hoofd + '</span>' : '') +
        (z.sub ? '<span class="hv-plan__sub' + (z.doel != null ? ' hv-plan__sub--doel' : '') + '">' + h(z.sub) + '</span>' : '') + veiligChip + '</span>' +
        (alarm.length ? '<span class="hv-plan__alarm">' + HV.icoon('alarm-smoke', { maat: 's' }) + h(t('Тривога: ', 'Alarm: ') + alarm.map(function (a) { return HV.p(a.naam).toLowerCase(); }).join(', ')) + '</span>' : '') +
        (groot >= 9 && hh > 120 ? '<span class="hv-plan__m2">' + HV.getal(groot, 0) + ' ' + h(t('м²', 'm²')) + '</span>' : '') +
        '</button>';

      // знаки пристроїв цієї кімнати
      var lijst = HV.kijk.inKamer(k.id, function (a) { return inLaag(a, laag, veilig); });
      var binnenKamer = lijst.filter(function (a) { var p = PLEK[a.id]; return p[0] >= r.x && p[0] <= r.x + r.b && p[1] >= r.y && p[1] <= r.y + r.h; });
      var daarbuiten = lijst.filter(function (a) { return binnenKamer.indexOf(a) < 0; });
      var gezet = plaats(binnenKamer, { x: x, y: y, b: b, h: hh }, label, S);
      var buiten = daarbuiten.length ? plaats(daarbuiten, { x: 0, y: 0, b: v.b * S, h: v.h * S }, null, S) : { merken: [], teller: null };
      gezet.merken.concat(buiten.merken).forEach(function (m) { merkHtml += merk(m, B); });
      if (gezet.teller) merkHtml += teller(gezet.teller, k, B);
    });
    // неінтерактивні частини креслення й обрис будинку на ділянці
    var vlakHtml = v.vlakken.map(function (f) {
      var st = 'left:' + (f.x * S).toFixed(1) + 'px;top:' + (f.y * S).toFixed(1) + 'px;width:' + (f.b * S).toFixed(1) + 'px;height:' + (f.h * S).toFixed(1) + 'px';
      if (f.naar) return '<button type="button" class="hv-plan__vlak hv-plan__vlak--' + f.soort + '" style="' + st + '" data-actie="plan-verdieping" data-waarde="' + f.naar + '" data-k="pv-' + f.soort + '" aria-label="' + h(HV.p(f.naam) + '. ' + t('Перейти на перший поверх', 'Naar de begane grond')) + '"><span class="hv-plan__naam">' + h(HV.p(f.naam)) + '</span><span class="hv-plan__sub">' + h(t('3 поверхи · відкрити план', '3 verdiepingen · plattegrond openen')) + '</span></button>';
      return '<div class="hv-plan__vlak hv-plan__vlak--' + f.soort + '" style="' + st + '" aria-hidden="true"><span class="hv-plan__naam">' + h(HV.p(f.naam)) + '</span></div>';
    }).join('');
    // авто на під'їзді (веде в «Гараж»)
    if (vid === 'buiten') {
      var ev = w.voertuigen[0];
      merkHtml += '<button type="button" class="hv-plan__merk hv-plan__merk--auto hv-toon-batterij is-aan" style="left:' + (14.3 * S).toFixed(1) + 'px;top:' + (3.2 * S).toFixed(1) + 'px" data-actie="ga" data-naar="garage" data-k="pm-ev" aria-label="' + h(HV.p(ev.naam) + ': ' + Math.round(ev.lading) + ' %. ' + t('Відкрити гараж', 'Garage openen')) + '"><span class="hv-plan__stip">' + HV.icoon('car', { maat: 's' }) + '</span><span class="hv-plan__badge">' + Math.round(ev.lading) + ' %</span></button>';
    }

    // зосередження на кімнаті (наближення 480 мс)
    var transform = 'none';
    if (focus) {
      var fr = v.kamers.filter(function (r) { return r.id === focus; })[0];
      if (fr) {
        var vb = v.b * S, vh = v.h * S;
        var s = Math.max(1, Math.min(1.45, 0.86 * vb / (fr.b * S), 0.86 * vh / (fr.h * S)));
        var cx = (fr.x + fr.b / 2) * S, cy = (fr.y + fr.h / 2) * S;
        var tx = Math.max(vb - vb * s, Math.min(0, vb / 2 - cx * s)), ty = Math.max(vh - vh * s, Math.min(0, vh / 2 - cy * s));
        if (s > 1.02) transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      }
    }

    var maatBoven = '<span class="hv-plan__maat hv-plan__maat--b" style="left:' + RAND.links + 'px;width:' + (v.b * S).toFixed(1) + 'px" aria-hidden="true"><span>' + HV.getal(v.b, 2) + ' ' + h(t('м', 'm')) + '</span></span>';
    var maatLinks = '<span class="hv-plan__maat hv-plan__maat--h" style="top:' + RAND.boven + 'px;height:' + (v.h * S).toFixed(1) + 'px" aria-hidden="true"><span>' + HV.getal(v.h, 2) + ' ' + h(t('м', 'm')) + '</span></span>';
    var raster = 'background-size:' + (S / 2).toFixed(2) + 'px ' + (S / 2).toFixed(2) + 'px;background-position:' + (links + RAND.links) + 'px ' + RAND.boven + 'px';
    var grond = '<div class="hv-plan__grond' + (vid === 'buiten' ? ' hv-plan__grond--kavel' : '') + '" style="left:' + RAND.links + 'px;top:' + RAND.boven + 'px;width:' + (v.b * S).toFixed(1) + 'px;height:' + (v.h * S).toFixed(1) + 'px;transform:' + transform + '" data-k="grond-' + vid + '">' +
      vlakHtml + kamerHtml + lijnen(v, S, B, laag, veilig) + merkHtml + '</div>';
    var vel = '<div class="hv-plan__vel' + (B.verleden ? ' is-terugblik' : '') + '" style="width:' + velB + 'px;height:' + velH + 'px;margin-inline-start:' + links + 'px" data-k="vel">' + maatBoven + maatLinks + grond +
      (B.verleden ? '<span class="hv-plan__terugbliklabel">' + HV.icoon('history', { maat: 's' }) + h(t('Перегляд минулого · ', 'Terugblik · ') + momentTekst(w, B.T)) + '</span>' : '') + '</div>';
    var venster = '<div class="hv-plan__venster' + (zoom > 1 ? ' is-zoom' : '') + (B.verleden ? ' is-terugblik' : '') + '" style="height:' + (zoom > 1 ? Math.min(velH, Math.max(basisH, Math.min(maxH, 520))) : velH) + 'px;' + raster + '"' + (centreerVolgende ? ' data-centreer="' + Math.round(velB / 2) + ',' + Math.round(velH / 2) + '"' : '') + ' role="group" aria-label="' + h(t('План: ', 'Plattegrond: ') + HV.p(verdNaam(vid)) + '. ' + t('Той самий зміст — у списку під планом.', 'Dezelfde inhoud staat in de lijst onder de plattegrond.')) + '" data-k="venster-' + vid + '">' + vel + '</div>';
    centreerVolgende = false;

    var balk = '<div class="hv-plan__balk" data-k="planbalk">' +
      o.segment({ label: t('Поверх', 'Verdieping'), waarde: vid, actie: 'plan-verdieping', klas: 'hv-segment--rol hv-plan__verdiepingen', k: 'plan-verd', opties: VERDIEPINGEN.map(function (id) { return { id: id, label: HV.p(verdNaam(id)), icoon: id === 'buiten' ? 'trees' : 'layers' }; }) }) +
      '<div class="hv-filter hv-plan__lagen" role="group" aria-label="' + h(t('Шари плану', 'Lagen van de plattegrond')) + '">' + LAGEN.map(function (l) {
        var gekozen = l.id === 'beveiliging' ? veilig : l.id === laag;
        return o.chip({ icoon: l.icoon, tekst: HV.p(l.naam), filter: true, gekozen: gekozen, actie: 'plan-laag', gegevens: { laag: l.id }, k: 'laag-' + l.id, aria: HV.p(l.naam) + (l.id === 'beveiliging' ? t(' — накладається на будь-який шар', ' — ligt over elke laag') : '') });
      }).join('') + '</div></div>';

    var gereedschap = '<div class="hv-plan__gereedschap" data-k="plangereedschap">' +
      '<div class="hv-plan__zoom" role="group" aria-label="' + h(t('Масштаб', 'Schaal')) + '">' +
      o.icoonknop({ icoon: 'zoom-out', aria: t('Віддалити', 'Uitzoomen'), actie: 'plan-zoom', gegevens: { richting: -1 }, klas: zoom <= 1 ? 'is-grens' : '' }) +
      '<span class="hv-plan__zoomgetal" aria-live="polite">' + HV.getal(zoom * 100, 0) + ' %</span>' +
      o.icoonknop({ icoon: 'zoom-in', aria: t('Наблизити', 'Inzoomen'), actie: 'plan-zoom', gegevens: { richting: 1 }, klas: zoom >= 3 ? 'is-grens' : '' }) +
      o.knop({ tekst: t('Увесь поверх', 'Hele verdieping'), icoon: 'maximize', klein: true, soort: 'stil', actie: 'plan-zoom', gegevens: { richting: 0 } }) + '</div>' +
      '<div class="hv-plan__schaal" aria-hidden="true"><span class="hv-plan__schaalbalk" style="width:' + (S * (v.b > 12 ? 2 : 1)).toFixed(1) + 'px"></span><span>' + (v.b > 12 ? '2' : '1') + ' ' + h(t('м', 'm')) + '</span>' + HV.icoon('compass', { maat: 's' }) + '<span>' + h(t('Пн', 'N')) + '</span></div></div>';

    var legende = legenda(ctx, laag, veilig, B, kamers, vid);
    var kop = '<p class="hv-pagina__zin hv-plan__zin" data-k="planzin">' + h(zinVan(ctx, vid, laag, B)) + '</p>';
    var werk = '<div class="hv-plan__werk" data-k="planwerk"><div class="hv-plan__links">' + venster + gereedschap + '</div><aside class="hv-plan__zij" aria-label="' + h(t('Легенда й перегляд минулого', 'Legenda en terugblik')) + '">' + legende + terugblik(ctx, B) + '</aside></div>';
    return '<div class="hv-plan" data-k="plan">' + kop + balk + werk + lijstOnder(ctx, vid, laag, veilig, B, kamers) + '</div>';
  }
  var centreerVolgende = false;
  var verdNaam = function (id) { var v = HV.staat.w.verdiepingen.filter(function (x) { return x.id === id; })[0]; return v ? v.naam : [id, id]; };
  function momentTekst(w, T) {
    var dag = Math.floor(T / 86400000) === Math.floor(w.tijd / 86400000) ? t('сьогодні ', 'vandaag ') : t('вчора ', 'gisteren ');
    return dag + HV.tijd(T);
  }

  function zinVan(ctx, vid, laag, B) {
    var w = ctx.staat, kamers = w.kamers.filter(function (k) { return k.verdieping === vid; });
    var aan = 0, lampen = 0;
    kamers.forEach(function (k) { var l = HV.kijk.lampen(k.id); lampen += l.length; aan += l.filter(B.aan).length; });
    var deel = (B.verleden ? t('Так було ', 'Zo was het ') + momentTekst(w, B.T) + ': ' : '') + HV.p(verdNaam(vid)) + ' — ' + kamers.length + ' ' + HV.meervoud(kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']);
    if (lampen) deel += ', ' + t('світло: ', 'licht: ') + aan + ' ' + t('з', 'van') + ' ' + lampen;
    var dood = HV.kijk.alle(function (a) { return a.beschikbaar === 'onbereikbaar' && verdiepingVan(a) === vid; }).length;
    if (dood && !B.verleden) deel += ', ' + t('недоступних: ', 'niet bereikbaar: ') + dood;
    return deel + '.';
  }

  function merk(m, B) {
    var a = m.a, mb = merkBeeld(a, B), naam = HV.p(a.naam);
    var klas = 'hv-plan__merk hv-toon-' + mb.toon + (mb.aan ? ' is-aan' : '') + (mb.staat ? ' is-' + mb.staat : '') + (HV.makerZichtbaar(a) && !B.verleden ? ' heeft-maker' : '');
    var st = 'left:' + m.x.toFixed(1) + 'px;top:' + m.y.toFixed(1) + 'px';
    var binnenHtml = '<span class="hv-plan__stip">' + HV.icoon(mb.icoon, { maat: 's' }) + '</span>' + (mb.staat === 'verouderd' || mb.staat === 'verondersteld' || mb.staat === 'slaapt' ? '<span class="hv-plan__staat" aria-hidden="true"></span>' : '');
    var aria = naam + ': ' + mb.woord + (mb.waarde ? ', ' + mb.waarde : '') + (mb.staat && mb.staat !== 'onbereikbaar' && mb.staat !== 'wacht' ? ', ' + HV.woord[mb.staat]() : '');
    if (B.verleden) return '<span class="' + klas + '" style="' + st + '" role="img" aria-label="' + h(aria) + '" data-k="pm-' + h(a.id) + '">' + binnenHtml + '</span>';
    return '<button type="button" class="' + klas + '" style="' + st + '" data-actie="blad" data-blad="apparaat:' + h(a.id) + '" data-k="pm-' + h(a.id) + '" aria-label="' + h(aria + '. ' + t('Відкрити', 'Openen')) + '" title="' + h(naam) + '">' + binnenHtml + '</button>';
  }
  function teller(tl, k, B) {
    var st = 'left:' + tl.x.toFixed(1) + 'px;top:' + tl.y.toFixed(1) + 'px';
    var aria = t('Ще ', 'Nog ') + tl.n + ' ' + HV.meervoud(tl.n, ['пристрій', 'пристрої', 'пристроїв'], ['apparaat', 'apparaten']) + ' ' + HV.p(k.waar) + '. ' + t('Відкрити кімнату', 'Kamer openen');
    if (B.verleden) return '<span class="hv-plan__merk hv-plan__merk--teller" style="' + st + '" role="img" aria-label="' + h(aria) + '" data-k="pt-' + h(k.id) + '"><span class="hv-plan__stip">+' + tl.n + '</span></span>';
    return '<button type="button" class="hv-plan__merk hv-plan__merk--teller" style="' + st + '" data-actie="blad" data-blad="kamer:' + h(k.id) + '" data-k="pt-' + h(k.id) + '" aria-label="' + h(aria) + '"><span class="hv-plan__stip">+' + tl.n + '</span></button>';
  }

  // ───────────────────────── Легенда ─────────────────────────
  function stap(klas, tekst) { return '<li><span class="hv-plan__staal ' + klas + '" aria-hidden="true"></span><span>' + h(tekst) + '</span></li>'; }
  function legenda(ctx, laag, veilig, B, kamers, vid) {
    var w = ctx.staat, delen = [], titel = HV.p(LAGEN.filter(function (l) { return l.id === laag; })[0].naam);
    if (laag === 'licht') {
      var aanKamers = kamers.filter(function (k) { return HV.kijk.lampen(k.id).some(B.aan); });
      delen.push('<ul class="hv-plan__schaalrij">' + stap('is-licht', t('світло увімкнено', 'licht aan')) + stap('', t('світло вимкнено', 'licht uit')) + stap('is-dood', t('недоступна лампа', 'lamp niet bereikbaar')) + '</ul>');
      if (!B.verleden && aanKamers.length) delen.push('<div class="hv-knoppen hv-plan__actie">' + o.knop({ tekst: t('Вимкнути світло поверху', 'Licht van de verdieping uit'), icoon: 'lightbulb-off', actie: 'plan-licht-uit', gegevens: { verdieping: vid } }) + o.gevolg(t('Що станеться: вимкнуться всі лампи цього поверху (' + aanKamers.length + ' ' + HV.meervoud(aanKamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']) + '). Пов’язано з: недоступні лампи буде пропущено й названо. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: alle lampen van deze verdieping gaan uit (' + aanKamers.length + ' ' + (aanKamers.length === 1 ? 'kamer' : 'kamers') + '). Hangt samen met: onbereikbare lampen worden overgeslagen en genoemd. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'), { kop: t('Вимкнути світло поверху', 'Licht van de verdieping uit') }) + '</div>');
    } else if (laag === 'klimaat') {
      var subId = HV.ui.lees('plan-klimaat', 'temperatuur'), sub = KLIMAAT_SUB.filter(function (x) { return x.id === subId; })[0] || KLIMAAT_SUB[0];
      delen.push(o.segment({ label: t('Що показати', 'Wat tonen'), waarde: sub.id, actie: 'plan-klimaat', k: 'plan-klimaat', opties: KLIMAAT_SUB.map(function (x) { return { id: x.id, label: HV.p(x.naam) }; }) }));
      var grenzen = sub.treden.map(function (g) { return HV.getal(g, sub.dec > 0 && g % 1 ? 1 : 0); });
      var schaal = [t('до ', 'tot ') + grenzen[0], grenzen[0] + '–' + grenzen[1], grenzen[1] + '–' + grenzen[2], grenzen[2] + '–' + grenzen[3], t('від ', 'vanaf ') + grenzen[3]];
      delen.push('<ol class="hv-plan__warmteschaal" aria-label="' + h(HV.p(sub.naam) + ', ' + sub.eenheid) + '">' + schaal.map(function (s, i) { return '<li class="hv-warmte--' + (i + 1) + '"><span>' + h(s) + '</span></li>'; }).join('') + '</ol><p class="hv-plan__eenheid">' + h(sub.eenheid) + '</p>');
      delen.push('<ul class="hv-plan__schaalrij">' + stap('is-onbemeten', t('не вимірюється', 'niet gemeten')) + (sub.id === 'temperatuur' ? stap('is-doel', t('ціль кімнати — штрихом', 'doel van de kamer — gestreept')) : '') + '</ul>');
    } else if (laag === 'aanwezigheid') {
      delen.push('<ul class="hv-plan__schaalrij">' + stap('is-aanwezig', t('рух зараз', 'beweging nu')) + stap('', t('рух N хв тому', 'beweging N min geleden')) + stap('is-onbemeten', t('не вимірюється', 'niet gemeten')) + '</ul>');
      delen.push('<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('eye-off', { maat: 's' }) + h(t('План не показує імен: лише датчики руху й присутності. Хто вдома — на сторінці «Дім».', 'De plattegrond toont geen namen: alleen bewegings- en aanwezigheidssensoren. Wie thuis is, staat op ‘Thuis’.')) + '</p>');
    } else if (laag === 'energie') {
      var g = ENERGIE_TREDEN;
      delen.push('<ol class="hv-plan__warmteschaal" aria-label="' + h(t('Споживання, Вт', 'Verbruik, W')) + '">' + [t('до ', 'tot ') + g[0], g[0] + '–' + g[1], g[1] + '–' + g[2], g[2] + '–' + g[3], t('від ', 'vanaf ') + g[3]].map(function (s, i) { return '<li class="hv-warmte--' + (i + 1) + '"><span>' + h(s) + '</span></li>'; }).join('') + '</ol><p class="hv-plan__eenheid">' + h(t('Вт', 'W')) + '</p>');
      var totaal = HV.kijk.alle(function (a) { return verdiepingVan(a) === vid; }).reduce(function (s, a) { return s + B.watt(a); }, 0);
      delen.push('<div class="hv-plan__totaal">' + o.getal({ maat: 'm', label: B.verleden ? t('Поверх тоді', 'Verdieping toen') : t('Поверх зараз', 'Verdieping nu'), waarde: totaal >= 1000 ? HV.maat(totaal / 1000, t('кВт', 'kW'), 2) : HV.maat(Math.round(totaal), t('Вт', 'W')) }) +
        (B.verleden ? '' : o.knop({ tekst: t('Енергія дому', 'Energie van het huis'), icoon: 'zap', klein: true, soort: 'stil', actie: 'ga', gegevens: { naar: 'energie' } })) + '</div>');
    } else {
      delen.push('<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('layout-grid', { maat: 's' }) + h(t('Усі пристрої поверху на своїх місцях. Де тісно — лічильник «+N» відкриває кімнату.', 'Alle apparaten van de verdieping op hun plek. Waar het krap is, opent de teller ‘+N’ de kamer.')) + '</p>');
    }
    if (veilig || laag === 'beveiliging') {
      delen.push('<div class="hv-plan__veilig"><p class="hv-plan__legkop">' + HV.icoon('shield', { maat: 's' }) + h(t('Безпека поверх шару', 'Beveiliging over de laag')) + '</p><ul class="hv-plan__schaalrij">' +
        stap('is-merk-let-op', t('відчинено або відімкнено', 'open of ontgrendeld')) + stap('is-merk', t('зачинено й замкнено', 'dicht en vergrendeld')) + stap('is-kegel', t('поле зору камери', 'zichtveld van de camera')) + stap('is-alarm', t('тривога — подвійна рамка й слово', 'alarm — dubbele rand en woord')) + '</ul>' +
        '<p class="hv-plan__regel">' + h(HV.p(HV.alarmWoord[w.apparaten.alarm.st.stand])) + '</p></div>');
    }
    return '<section class="hv-kaart hv-plan__legenda" data-k="legenda-' + laag + '"><h3 class="hv-kaart__titel">' + h(titel) + '</h3>' + delen.join('') + '</section>';
  }

  // ───────────────────────── Перегляд минулого ─────────────────────────
  function terugblik(ctx, B) {
    var w = ctx.staat, uren = Number(HV.ui.lees('plan-t', 0)) || 0;
    var van = w.tijd - 24 * UUR, dag = HV.paspoort.dag;
    var X = function (x) { return Math.max(0, Math.min(100, (x - van) / (24 * UUR) * 100)); };
    var stukken = '', thuis = '';
    for (var d0 = Math.floor(van / 86400000) * 86400000; d0 < w.tijd; d0 += 86400000) {
      dag.stand.forEach(function (r) { var a = d0 + r[0] * UUR, b = d0 + r[1] * UUR; if (b > van && a < w.tijd) stukken += '<span class="hv-baan__stuk hv-stand--' + r[2] + '" style="left:' + X(a).toFixed(2) + '%;width:' + Math.max(0.4, X(Math.min(b, w.tijd)) - X(Math.max(a, van))).toFixed(2) + '%" title="' + h(HV.p(HV.huisstanden[r[2]])) + '"></span>'; });
      dag.aanwezig.forEach(function (r) { var a = d0 + r[0] * UUR, b = d0 + r[1] * UUR; if (b > van && a < w.tijd) thuis += '<span class="hv-baan__stuk hv-toon-neutraal" style="left:' + X(a).toFixed(2) + '%;width:' + Math.max(0.4, X(Math.min(b, w.tijd)) - X(Math.max(a, van))).toFixed(2) + '%"></span>'; });
    }
    var tikken = '';
    for (var u = Math.ceil(van / (6 * UUR)) * 6 * UUR; u <= w.tijd; u += 6 * UUR) tikken += '<span class="hv-terugblik__tik" style="left:' + X(u).toFixed(2) + '%">' + HV.tijd(u) + '</span>';
    var deel = (uren + 24) / 24 * 100;
    var schuif = '<div class="hv-terugblik__schuif" data-k="tb-schuif">' +
      '<button type="button" class="hv-stap" data-actie="plan-tijd-stap" data-richting="-1" aria-label="' + h(t('На годину раніше', 'Een uur eerder')) + '">' + HV.icoon('chevron-left', { maat: 's' }) + '</button>' +
      '<div class="hv-terugblik__vak hv-toon-neutraal">' +
      '<div class="hv-schuif__baan" role="slider" tabindex="0" aria-label="' + h(t('Час доби для перегляду минулого', 'Tijdstip voor de terugblik')) + '" aria-valuemin="-24" aria-valuemax="0" aria-valuenow="' + uren + '" aria-valuetext="' + h(uren < 0 ? momentTekst(w, B.T) : t('зараз', 'nu')) + '" data-schuif="plan-tijd" data-min="-24" data-max="0" data-stap="0.25" data-eenheid="' + h(t('год', 'u')) + '" data-decimalen="2">' +
      '<span class="hv-schuif__spoor"><span class="hv-schuif__vulling" style="width:' + deel.toFixed(2) + '%"></span></span><span class="hv-schuif__knop" style="left:' + deel.toFixed(2) + '%"></span></div>' +
      '<div class="hv-terugblik__banen" aria-hidden="true"><div class="hv-terugblik__baan" title="' + h(t('режим дому', 'huisstand')) + '">' + stukken + '</div><div class="hv-terugblik__baan hv-terugblik__baan--thuis">' + thuis + '</div><div class="hv-terugblik__tikken">' + tikken + '</div></div></div>' +
      '<button type="button" class="hv-stap" data-actie="plan-tijd-stap" data-richting="1" aria-label="' + h(t('На годину пізніше', 'Een uur later')) + '">' + HV.icoon('chevron-right', { maat: 's' }) + '</button></div>';
    var kop = '<div class="hv-terugblik__kop"><h3 class="hv-kaart__titel">' + HV.icoon('history', { maat: 's' }) + h(t('Перегляд минулого', 'Terugblik')) + '</h3><output class="hv-terugblik__tijd" data-k="tb-tijd">' + h(uren < 0 ? momentTekst(w, B.T) : t('зараз · наживо', 'nu · live')) + '</output></div>';
    var voet = '';
    if (B.verleden) {
      var regels = w.logboek.filter(function (r) { return Math.abs(r.tijd - B.T) <= 45 * 60000; }).slice(0, 4);
      var gekozen = HV.ui.lees('plan-kamer-t', null), k = gekozen ? HV.staat.kamer(gekozen) : null;
      var detail = '';
      if (k) {
        var tp = B.temp(k.id), lampen = HV.kijk.lampen(k.id), bw = B.beweging(k.id), watt = HV.kijk.inKamer(k.id).reduce(function (s, a) { return s + B.watt(a); }, 0);
        detail = '<div class="hv-terugblik__kamer" data-k="tb-kamer"><p class="hv-plan__legkop">' + HV.icoon(k.icoon, { maat: 's' }) + h(HV.p(k.naam) + ' · ' + HV.tijd(B.T)) + '</p><div class="hv-rijen">' +
          o.rij({ icoon: 'thermometer', naam: t('Температура', 'Temperatuur'), waarde: tp ? HV.maat(tp.waarde, '°C', 1) : h(t('не вимірюється', 'niet gemeten')) }) +
          (lampen.length ? o.rij({ icoon: 'lightbulb', naam: t('Світло', 'Licht'), waarde: lampen.filter(B.aan).length + ' ' + h(t('з', 'van')) + ' ' + lampen.length }) : '') +
          (bw ? o.rij({ icoon: 'radar', naam: t('Рух', 'Beweging'), waarde: h(bw.actief ? t('був', 'ja') : bw.minuten != null ? HV.duur(bw.minuten) + t(' тому', ' geleden') : t('немає', 'geen')) }) : '') +
          o.rij({ icoon: 'zap', naam: t('Споживання', 'Verbruik'), waarde: HV.maat(Math.round(watt), t('Вт', 'W')) }) + '</div>' +
          o.knop({ tekst: t('Відкрити кімнату зараз', 'Kamer nu openen'), klein: true, actie: 'plan-kamer-nu', gegevens: { kamer: k.id } }) + '</div>';
      }
      voet = '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('Стан відтворено з доби дому й Журналу (симуляція). Керування вимкнене: щоб діяти, поверніться до «зараз».', 'De toestand is nagebouwd uit het etmaal van het huis en het logboek (simulatie). Bediening is uit: ga terug naar ‘nu’ om iets te doen.')) + '</p>' +
        detail +
        (regels.length ? '<p class="hv-plan__legkop">' + h(t('Події поруч у часі', 'Gebeurtenissen rond dat moment')) + '</p><ul class="hv-berichten">' + regels.map(function (r) { return o.bericht(r, { open: HV.ui.lees('bericht', null) === r.id }); }).join('') + '</ul>' : '<p class="hv-tekst hv-tekst--zacht">' + h(t('Записів Журналу в межах 45 хв немає.', 'Geen logboekregels binnen 45 min.')) + '</p>') +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Повернутися до зараз', 'Terug naar nu'), icoon: 'rotate-ccw', soort: 'hoofd', actie: 'plan-tijd-nu' }) + '</div>';
    } else {
      voet = '<p class="hv-tekst hv-tekst--zacht">' + h(t('Потягніть повзунок назад, щоб побачити, як було протягом останньої доби: світло, тепло, двері, рух.', 'Sleep de schuif terug om te zien hoe het de afgelopen dag was: licht, warmte, deuren, beweging.')) + '</p>' +
        '<div class="hv-filter">' + [-1, -3, -8, -12].map(function (x) { return o.chip({ tekst: HV.tijd(w.tijd + x * UUR), icoon: 'clock', actie: 'plan-tijd', gegevens: { waarde: x, fase: 'klaar' }, k: 'tb-snel' + x }); }).join('') + '</div>';
    }
    return '<section class="hv-kaart hv-terugblik' + (B.verleden ? ' is-actief' : '') + '" data-k="terugblik">' + kop + schuif + voet + '</section>';
  }

  // ───────────────────────── Список під планом ─────────────────────────
  function lijstOnder(ctx, vid, laag, veilig, B, kamers) {
    var w = ctx.staat;
    var rijen = kamers.map(function (k) {
      var z = kamerOpLaag(k, laag, B);
      var tekst = (z.hoofd ? z.hoofd.replace(/<[^>]+>/g, '') : '') + (z.sub ? (z.hoofd ? ' · ' : '') + z.sub : '');
      var bediening = '';
      if (!B.verleden && w.gegevens !== 'geen') {
        if (laag === 'licht' && HV.kijk.lampen(k.id).length) bediening = o.schakel({ aan: HV.kijk.lampenAan(k.id).length > 0, icoon: 'lightbulb', toon: 'aan', actie: 'kamer-licht', gegevens: { kamer: k.id }, aria: t('Світло: ', 'Licht: ') + HV.p(k.naam) });
        else if (laag === 'klimaat' && k.doel != null) bediening = o.stapper({ actie: 'kamer-doel', gegevens: { kamer: k.id }, stap: 0.5, label: t('Ціль температури: ', 'Doeltemperatuur: ') + HV.p(k.naam), waarde: HV.maat(k.doel, '°C', 1), k: 'pl-doel-' + k.id });
      }
      var lijf = '<span class="hv-rij__teken hv-plan__lijststaal ' + (z.klas || '') + '">' + HV.icoon(k.icoon, { maat: 's' }) + '</span><span class="hv-rij__naam">' + h(HV.p(k.naam)) + '<span class="hv-rij__sub">' + h(tekst) + '</span></span>';
      return '<div class="hv-planrij" data-k="plr-' + h(k.id) + '">' + (B.verleden
        ? '<button type="button" class="hv-planrij__lijf" data-actie="plan-kamer-t" data-kamer="' + h(k.id) + '">' + lijf + '</button>'
        : '<button type="button" class="hv-planrij__lijf" data-actie="blad" data-blad="kamer:' + h(k.id) + '">' + lijf + HV.icoon('chevron-right', { maat: 's', klas: 'hv-rij__pijl' }) + '</button>') + bediening + '</div>';
    }).join('');
    var apparaten = HV.kijk.alle(function (a) { return verdiepingVan(a) === vid && inLaag(a, laag, veilig); });
    var appRijen = apparaten.map(function (a) {
      var mb = merkBeeld(a, B), k = HV.staat.kamer(a.kamer);
      var lijf = '<span class="hv-rij__teken">' + HV.icoon(mb.icoon, { maat: 's' }) + '</span><span class="hv-rij__naam">' + h(HV.p(a.naam)) + '<span class="hv-rij__sub">' + h(HV.p(k.naam)) + '</span></span><span class="hv-rij__waarde">' + h(mb.woord + (mb.waarde ? ' · ' + mb.waarde : '')) + (mb.staat && mb.staat !== 'onbereikbaar' && mb.staat !== 'wacht' ? ' <span class="hv-plan__lijststaat">' + h(HV.woord[mb.staat]()) + '</span>' : '') + '</span>';
      return B.verleden ? '<div class="hv-rij" data-k="pla-' + h(a.id) + '">' + lijf + '</div>'
        : '<button type="button" class="hv-rij" data-actie="blad" data-blad="apparaat:' + h(a.id) + '" data-k="pla-' + h(a.id) + '">' + lijf + HV.icoon('chevron-right', { maat: 's', klas: 'hv-rij__pijl' }) + '</button>';
    }).join('');
    var laagNaam = HV.p(LAGEN.filter(function (l) { return l.id === laag; })[0].naam);
    return '<div class="hv-plan__lijsten" data-k="planlijsten">' +
      o.blok({ id: 'plan-kamers', titel: t('Кімнати поверху', 'Kamers van de verdieping'), teller: kamers.length, vast: true, inhoud: '<div class="hv-rijen hv-rijen--kaart">' + rijen + '</div>' }) +
      o.blok({ id: 'plan-apparaten', titel: t('Пристрої шару «', 'Apparaten van de laag ‘') + laagNaam + (veilig && laag !== 'beveiliging' ? t(' + безпека', ' + beveiliging') : '') + t('»', '’'), teller: apparaten.length,
        extra: o.knop({ tekst: t('У реєстрі', 'In het register'), icoon: 'list', klein: true, soort: 'stil', actie: 'plan-naar-register', gegevens: { verdieping: vid } }),
        inhoud: apparaten.length ? '<div class="hv-rijen hv-rijen--kaart">' + appRijen + '</div>' : o.leeg({ icoon: 'circle-dashed', titel: t('На цьому поверсі шар порожній', 'Deze laag is leeg op deze verdieping'), tekst: t('Оберіть інший шар або «Усі пристрої».', 'Kies een andere laag of ‘Alle apparaten’.') }) }) +
      '</div>';
  }

  // ───────────────────────── Дії плану ─────────────────────────
  HV.actie('plan-verdieping', function (ctx, g) {
    HV.ui.lees('plan-kamer-t', null) && HV.ui.zet('plan-kamer-t', null);
    HV.ui.zet('plan-verdieping', g.waarde);
    HV.open('kamers-plattegrond-' + g.waarde);
  });
  HV.actie('plan-laag', function (ctx, g) {
    if (g.laag === 'beveiliging') HV.ui.zet('plan-veilig', !HV.ui.lees('plan-veilig', false));
    else HV.ui.zet('plan-laag', g.laag);
  });
  HV.actie('plan-klimaat', function (ctx, g) { HV.ui.zet('plan-klimaat', g.waarde); });
  HV.actie('plan-zoom', function (ctx, g) {
    var nu = Number(HV.ui.lees('plan-zoom', 1)) || 1, r = Number(g.richting);
    var stappen = [1, 1.5, 2, 3], i = stappen.indexOf(nu); if (i < 0) i = 0;
    var nieuw = r === 0 ? 1 : stappen[Math.max(0, Math.min(stappen.length - 1, i + r))];
    centreerVolgende = nieuw > 1 && nieuw !== nu;
    HV.ui.zet('plan-zoom', nieuw);
  });
  HV.actie('plan-kamer-t', function (ctx, g) { HV.ui.zet('plan-kamer-t', HV.ui.lees('plan-kamer-t', null) === g.kamer ? null : g.kamer); });
  HV.actie('plan-kamer-nu', function (ctx, g) { HV.ui.zet('plan-t', 0); HV.ui.zet('plan-kamer-t', null); HV.bladOpen('kamer:' + g.kamer); });
  HV.actie('plan-tijd', function (ctx, g, el) {
    var v = Math.max(-24, Math.min(0, Number(g.waarde)));
    if (g.fase === 'sleep') {
      // під час руху — лише підпис часу, без перерисовки
      var uit = document.querySelector('.hv-terugblik__tijd');
      var T = HV.staat.w.tijd + v * UUR;
      if (uit) uit.textContent = v < 0 ? momentTekst(HV.staat.w, T) : t('зараз · наживо', 'nu · live');
      if (el && el.setAttribute) el.setAttribute('aria-valuetext', v < 0 ? momentTekst(HV.staat.w, T) : t('зараз', 'nu'));
      return;
    }
    if (v >= -0.1) v = 0;
    if (el && el.setAttribute && el.getAttribute('role') === 'slider') el.setAttribute('aria-valuetext', v < 0 ? momentTekst(HV.staat.w, HV.staat.w.tijd + v * UUR) : t('зараз', 'nu'));
    if (v === 0) HV.ui.zet('plan-kamer-t', null);
    if (v < 0 && ctx.route.blad) HV.bladOpen(null);
    HV.ui.zet('plan-t', v);
  });
  HV.actie('plan-tijd-stap', function (ctx, g) {
    var nu = Number(HV.ui.lees('plan-t', 0)) || 0;
    var nieuw = Math.max(-24, Math.min(0, Math.round(nu + Number(g.richting))));
    if (nieuw === 0) HV.ui.zet('plan-kamer-t', null);
    if (nieuw < 0 && ctx.route.blad) HV.bladOpen(null);
    HV.ui.zet('plan-t', nieuw);
  });
  HV.actie('plan-tijd-nu', function () { HV.ui.zet('plan-kamer-t', null); HV.ui.zet('plan-t', 0); });
  HV.actie('plan-naar-register', function (ctx, g) {
    var f = leegFilter(); f.verdieping = g.verdieping;
    HV.ui.zet('app-filter', f);
    HV.open('kamers-apparaten');
  });
  // «Вимкнути світло поверху»: звичайна групова дія через кімнати; один підсумок і «Повернути»
  HV.actie('plan-licht-uit', function (ctx, g) {
    var kamers = ctx.staat.kamers.filter(function (k) { return k.verdieping === g.verdieping && HV.kijk.lampenAan(k.id).length; });
    var dood = HV.kijk.alle(function (a) { return a.soort === 'licht' && a.beschikbaar === 'onbereikbaar' && verdiepingVan(a) === g.verdieping; });
    var lampen = kamers.reduce(function (s, k) { return s + HV.kijk.lampenAan(k.id).length; }, 0);
    var waren = {};
    kamers.forEach(function (k) { waren[k.id] = HV.kijk.lampenAan(k.id).map(function (a) { return a.id; }); });
    Promise.all(kamers.map(function (k) { return HV.doe({ doel: 'kamer:' + k.id, mogelijkheid: 'licht', waarde: false, stil: true, waarom: ['світло поверху', 'licht van de verdieping'] }); })).then(function (uit) {
      var gelukt = kamers.filter(function (k, i) { return uit[i] && uit[i].ok; });
      if (!gelukt.length) return;
      // «Повернути» вмикає саме ті лампи, що світили, — не всю кімнату
      var terugIds = [].concat.apply([], gelukt.map(function (k) { return waren[k.id]; }));
      HV.meld({
        maker: HV.mens(), icoon: 'lightbulb-off',
        titel: HV.p(verdNaam(g.verdieping)) + t(': світло вимкнено', ': licht uit'),
        tekst: lampen + ' ' + HV.meervoud(lampen, ['лампа', 'лампи', 'ламп'], ['lamp', 'lampen']) + (dood.length ? t('; недоступних пропущено: ', '; niet bereikbaar, overgeslagen: ') + dood.map(function (a) { return HV.p(a.naam); }).join(', ') : ''),
        terug: function () { terugIds.forEach(function (id) { HV.doe({ doel: id, mogelijkheid: 'aan', waarde: true, stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); }); }
      });
    });
  });

  // Клавіатура: стрілки переходять між кімнатами плану за напрямом
  document.addEventListener('keydown', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-plan-kamer')) return;
    var richting = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[ev.key];
    if (!richting) return;
    var r0 = el.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2], best = null, bestAfstand = Infinity;
    Array.prototype.forEach.call(el.parentNode.querySelectorAll('[data-plan-kamer]'), function (x) {
      if (x === el) return;
      var r = x.getBoundingClientRect(), dx = r.left + r.width / 2 - c0[0], dy = r.top + r.height / 2 - c0[1];
      var langs = dx * richting[0] + dy * richting[1];
      if (langs <= 4) return;
      var afstand = langs + 2 * Math.abs(dx * richting[1] + dy * richting[0]);
      if (afstand < bestAfstand) { bestAfstand = afstand; best = x; }
    });
    if (best) { ev.preventDefault(); best.focus(); }
  });

  // ═════════════════════════ Реєстр пристроїв ═════════════════════════
  var KLASSEN = [
    { id: 'licht', icoon: 'lightbulb', naam: ['Світло', 'Licht'], soorten: ['licht', 'lichtgroep'] },
    { id: 'zonwering', icoon: 'blinds', naam: ['Штори й жалюзі', 'Zonwering'], soorten: ['gordijn', 'jaloezie'] },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат', 'Klimaat'], soorten: ['thermostaat', 'airco', 'warmtepomp', 'vloerverwarming', 'radiatorkraan', 'ventilatie', 'bevochtiger', 'luchtreiniger', 'boiler'] },
    { id: 'veilig', icoon: 'shield', naam: ['Безпека й доступ', 'Beveiliging en toegang'], soorten: ['slot', 'alarmsysteem', 'camera', 'deurbel', 'garagedeur', 'poort', 'rook', 'co', 'lek'] },
    { id: 'energie', icoon: 'zap', naam: ['Енергія', 'Energie'], soorten: ['p1meter', 'zonnepanelen', 'thuisbatterij', 'laadpaal', 'stopcontact'] },
    { id: 'media', icoon: 'tv', naam: ['Медіа', 'Media'], soorten: ['tv', 'speaker', 'speakergroep', 'irzender'] },
    { id: 'huishouden', icoon: 'washing-machine', naam: ['Побутова техніка', 'Huishoudelijke apparaten'], soorten: ['wasmachine', 'droger', 'vaatwasser', 'oven', 'koelkast', 'koffie', 'stofzuiger'] },
    { id: 'tuin', icoon: 'trees', naam: ['Сад', 'Tuin'], soorten: ['maaier', 'beregening'] },
    { id: 'netwerk', icoon: 'router', naam: ['Мережа й комп’ютери', 'Netwerk en computers'], soorten: ['computer', 'nas', 'printer', 'router'] },
    { id: 'sensoren', icoon: 'radar', naam: ['Датчики й кнопки', 'Sensoren en knoppen'], soorten: ['temperatuur', 'vocht', 'co2', 'beweging', 'aanwezigheid', 'contact', 'lichtsterkte', 'batterij', 'sceneknop'] }
  ];
  var klasseVan = function (a) { for (var i = 0; i < KLASSEN.length; i++) if (KLASSEN[i].soorten.indexOf(a.soort) >= 0) return KLASSEN[i]; return KLASSEN[KLASSEN.length - 1]; };

  // Технічний паспорт пристрою (у демо-паспорті його немає — доповнюємо тут): протокол, сигнал 0–100, батарейка, версія ПЗ.
  var KABEL = ['кабель', 'kabel'], GROEP = ['група', 'groep'], IR = ['ІЧ', 'IR'];
  var PROTOCOL = {
    licht: 'Zigbee', lichtgroep: GROEP, stopcontact: 'Wi-Fi', gordijn: 'Zigbee', jaloezie: 'Zigbee', garagedeur: 'Wi-Fi', poort: 'Wi-Fi', thermostaat: 'Thread', airco: IR,
    warmtepomp: KABEL, vloerverwarming: 'Zigbee', radiatorkraan: 'Zigbee', ventilatie: 'Wi-Fi', bevochtiger: 'Wi-Fi', luchtreiniger: 'Wi-Fi', boiler: KABEL, tv: 'Wi-Fi',
    speaker: 'Wi-Fi', speakergroep: GROEP, stofzuiger: 'Wi-Fi', maaier: 'Wi-Fi', beregening: 'Zigbee', aanwezigheid: 'Thread', wasmachine: 'Wi-Fi', droger: 'Wi-Fi',
    vaatwasser: 'Wi-Fi', oven: 'Wi-Fi', koelkast: 'Wi-Fi', koffie: 'Wi-Fi', computer: KABEL, nas: KABEL, printer: 'Wi-Fi', router: KABEL, irzender: 'Wi-Fi', sceneknop: 'Zigbee',
    slot: 'Thread', alarmsysteem: KABEL, camera: 'Wi-Fi', deurbel: 'Wi-Fi', p1meter: KABEL, zonnepanelen: 'Wi-Fi', thuisbatterij: 'Wi-Fi', laadpaal: KABEL
  };
  var SIGNAAL = { zolderlicht: 0, tempzolder: 18, cameragarage: 27, maaier: 24, poort: 31, radiatorkinder: 41, garagedeur: 52, cameratuin: 46 };
  var BATTERIJ = {
    raamkinder: 12, raamslaap: 64, voordeurcontact: 58, beweginghal: 41, lekbijkeuken: 77, rookkeuken: 92, cobijkeuken: 88, tempwoon: 66, tempslaap: 18, tempkinder: 54,
    tempwerk: 73, tempkeuken: 81, tempzolder: 9, vochtbad: 45, luxwoon: 37, radiatorkinder: 71, sceneknop: 84, voordeurslot: 46, deurbel: 63, batterijraam: 12
  };
  var NIEUW = { torsher: ['1.4.2', '1.5.0'], plafondwoon: ['1.4.2', '1.5.0'], keukenlicht: ['1.4.2', '1.5.0'], stekkermedia: ['3.2.0', '3.3.1'], voordeurslot: ['2.0.7', '2.1.0'], cameratuin: ['5.8.1', '5.9.0'], router: ['7.1.4', '7.2.0'] };
  function techniek(a) {
    var z = zaad(a.id), p = PROTOCOL[a.soort] || 'Zigbee';
    var bedraad = p === KABEL || p === GROEP;
    var basis = (1 + z % 4) + '.' + (z % 9) + '.' + (z % 5);
    var versie = a.st.firmware || (NIEUW[a.id] ? NIEUW[a.id][0] : basis);
    var nieuwste = NIEUW[a.id] ? NIEUW[a.id][1] : versie;
    var signaal = bedraad ? null : (a.id in SIGNAAL ? SIGNAAL[a.id] : 58 + z % 40);
    if (a.beschikbaar === 'onbereikbaar') signaal = 0;
    return {
      protocol: typeof p === 'string' ? p : HV.p(p), bedraad: bedraad, groep: p === GROEP, signaal: signaal,
      batterij: a.id in BATTERIJ ? BATTERIJ[a.id] : (a.batterij != null ? a.batterij : null),
      versie: p === GROEP ? null : versie, nieuwste: nieuwste, update: p !== GROEP && versie !== nieuwste
    };
  }
  // Версія ПЗ живе в стані пристрою (st.firmware), щоб Журнал показував «було → стало»; паспорт доповнюємо під час завантаження.
  (HV.paspoort && HV.paspoort.apparaten || []).forEach(function (a) {
    if (a.leden || PROTOCOL[a.soort] === GROEP || a.st.firmware) return;
    var z = zaad(a.id);
    a.st.firmware = NIEUW[a.id] ? NIEUW[a.id][0] : (1 + z % 4) + '.' + (z % 9) + '.' + (z % 5);
  });
  var signaalWoord = function (s) { return s == null ? null : s >= 70 ? t('сильний', 'sterk') : s >= 45 ? t('добрий', 'goed') : s >= 20 ? t('слабкий', 'zwak') : t('немає', 'geen'); };
  var signaalIcoon = function (s) { return s >= 70 ? 'signal-high' : s >= 45 ? 'signal-medium' : s >= 20 ? 'signal-low' : 'signal-zero'; };
  var batterijIcoon = function (b) { return b < 20 ? 'battery-low' : b < 60 ? 'battery-medium' : 'battery-full'; };
  var STAAT_NAMEN = { onbereikbaar: ['недоступний', 'niet bereikbaar'], verouderd: ['застаріло', 'verouderd'], verondersteld: ['стан припущено', 'toestand verondersteld'], slaapt: ['спить', 'slaapt'] };

  function leegFilter() { return { zoek: '', klassen: [], kamers: [], staat: 'alle', beschikbaar: [], batterij: 'alle', update: false, zwak: false, verdieping: null, sorteer: 'naam' }; }
  function filterNu() { var f = HV.ui.lees('app-filter', null); return f || leegFilter(); }
  function zetFilter(fn) { var f = JSON.parse(JSON.stringify(filterNu())); fn(f); HV.ui.zet('app-filter', f); }
  var aandacht = function (a, x) { return a.beschikbaar === 'onbereikbaar' || a.beschikbaar === 'verouderd' || (x.batterij != null && x.batterij < 20) || x.update || (x.signaal != null && x.signaal < 45); };

  var VOORKEUZES = [
    { id: 'aandacht', icoon: 'triangle-alert', naam: ['Потребують уваги', 'Vragen aandacht'], filter: { aandacht: true } },
    { id: 'bereik', icoon: 'unplug', naam: ['Недоступні й застарілі', 'Onbereikbaar en verouderd'], filter: { beschikbaar: ['onbereikbaar', 'verouderd'] } },
    { id: 'batterij', icoon: 'battery-low', naam: ['Батарейки нижче 20 %', 'Batterij onder 20 %'], filter: { batterij: 'laag' } },
    { id: 'update', icoon: 'circle-arrow-up', naam: ['Є оновлення ПЗ', 'Update beschikbaar'], filter: { update: true } },
    { id: 'zwak', icoon: 'wifi-low', naam: ['Слабкий сигнал', 'Zwak signaal'], filter: { zwak: true } }
  ];

  function past(a, f) {
    var x = techniek(a), k = HV.staat.kamer(a.kamer), kl = klasseVan(a);
    if (f.aandacht && !aandacht(a, x)) return false;
    if (f.zoek) {
      var z = f.zoek.toLowerCase();
      var hooi = [a.naam[0], a.naam[1], k ? k.naam[0] : '', k ? k.naam[1] : '', HV.paspoort.soorten[a.soort].naam[0], HV.paspoort.soorten[a.soort].naam[1], a.id, x.protocol].join(' ').toLowerCase();
      if (hooi.indexOf(z) < 0) return false;
    }
    if (f.klassen && f.klassen.length && f.klassen.indexOf(kl.id) < 0) return false;
    if (f.kamers && f.kamers.length && f.kamers.indexOf(a.kamer) < 0) return false;
    if (f.verdieping && (!k || k.verdieping !== f.verdieping)) return false;
    if (f.staat === 'aan' && !(HV.kijk.isAan(a) && a.beschikbaar !== 'onbereikbaar')) return false;
    if (f.staat === 'uit' && (HV.kijk.isAan(a) || a.beschikbaar === 'onbereikbaar' || HV.paspoort.soorten[a.soort].sensor)) return false;
    if (f.beschikbaar && f.beschikbaar.length && f.beschikbaar.indexOf(a.beschikbaar) < 0) return false;
    if (f.batterij === 'met' && x.batterij == null) return false;
    if (f.batterij === 'laag' && !(x.batterij != null && x.batterij < 20)) return false;
    if (f.update && !x.update) return false;
    if (f.zwak && !(x.signaal != null && x.signaal < 45)) return false;
    return true;
  }
  function actieveDelen(f) {
    // знімні чипи: [{ tekst, sleutel, waarde }]
    var uit = [];
    if (f.aandacht) uit.push({ tekst: t('потребують уваги', 'vragen aandacht'), sleutel: 'aandacht' });
    (f.klassen || []).forEach(function (id) { var kl = KLASSEN.filter(function (x) { return x.id === id; })[0]; if (kl) uit.push({ tekst: HV.p(kl.naam), sleutel: 'klassen', waarde: id }); });
    (f.kamers || []).forEach(function (id) { var k = HV.staat.kamer(id); if (k) uit.push({ tekst: HV.p(k.naam), sleutel: 'kamers', waarde: id }); });
    if (f.verdieping) uit.push({ tekst: HV.p(verdNaam(f.verdieping)), sleutel: 'verdieping' });
    if (f.staat !== 'alle') uit.push({ tekst: f.staat === 'aan' ? t('увімкнені', 'aan') : t('вимкнені', 'uit'), sleutel: 'staat' });
    (f.beschikbaar || []).forEach(function (s) { uit.push({ tekst: HV.p(STAAT_NAMEN[s] || ['на зв’язку', 'bereikbaar']), sleutel: 'beschikbaar', waarde: s }); });
    if (f.batterij !== 'alle') uit.push({ tekst: f.batterij === 'laag' ? t('батарейка нижче 20 %', 'batterij onder 20 %') : t('з батарейкою', 'met batterij'), sleutel: 'batterij' });
    if (f.update) uit.push({ tekst: t('є оновлення', 'update beschikbaar'), sleutel: 'update' });
    if (f.zwak) uit.push({ tekst: t('слабкий сигнал', 'zwak signaal'), sleutel: 'zwak' });
    if (f.zoek) uit.push({ tekst: t('пошук: ', 'zoeken: ') + '«' + f.zoek + '»', sleutel: 'zoek' });
    return uit;
  }
  function naamPaar(f) {
    // назва збереженого вигляду обома мовами
    var uk = [], nl = [];
    if (f.aandacht) { uk.push('потребують уваги'); nl.push('vragen aandacht'); }
    (f.klassen || []).forEach(function (id) { var kl = KLASSEN.filter(function (x) { return x.id === id; })[0]; if (kl) { uk.push(kl.naam[0]); nl.push(kl.naam[1]); } });
    (f.kamers || []).forEach(function (id) { var k = HV.staat.kamer(id); if (k) { uk.push(k.naam[0]); nl.push(k.naam[1]); } });
    if (f.verdieping) { var v = verdNaam(f.verdieping); uk.push(v[0]); nl.push(v[1]); }
    if (f.staat !== 'alle') { uk.push(f.staat === 'aan' ? 'увімкнені' : 'вимкнені'); nl.push(f.staat === 'aan' ? 'aan' : 'uit'); }
    (f.beschikbaar || []).forEach(function (s) { var p = STAAT_NAMEN[s] || ['на зв’язку', 'bereikbaar']; uk.push(p[0]); nl.push(p[1]); });
    if (f.batterij !== 'alle') { uk.push(f.batterij === 'laag' ? 'батарейка < 20 %' : 'з батарейкою'); nl.push(f.batterij === 'laag' ? 'batterij < 20 %' : 'met batterij'); }
    if (f.update) { uk.push('оновлення'); nl.push('updates'); }
    if (f.zwak) { uk.push('слабкий сигнал'); nl.push('zwak signaal'); }
    if (f.zoek) { uk.push('«' + f.zoek + '»'); nl.push('‘' + f.zoek + '’'); }
    var kap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    return [kap(uk.slice(0, 3).join(' · ') || 'Усі пристрої'), kap(nl.slice(0, 3).join(' · ') || 'Alle apparaten')];
  }
  function bewaard() { var l = HV.opslag.lees('apparaten-weergaven', []); return Array.isArray(l) ? l : []; }
  function zelfdeFilter(a, b) { var s = function (f) { var x = {}; for (var k in leegFilter()) x[k] = f[k]; x.aandacht = !!f.aandacht; return JSON.stringify(x); }; return s(a) === s(b); }

  // ───────────────────────── Рендер реєстру ─────────────────────────
  function apparatenScherm(ctx) {
    var w = ctx.staat, f = filterNu();
    var alle = HV.kijk.alle();
    var lijst = alle.filter(function (a) { return past(a, f); });
    var groepeer = HV.ui.lees('app-groep', 'kamer'), weergave = HV.ui.lees('app-weergave', ctx.profiel.breedte >= 1100 ? 'tabel' : 'tegels');
    var kiezen = !!HV.ui.lees('app-kiezen', false), gekozen = HV.ui.lees('app-gekozen', {});
    var tellers = { bereik: 0, batterij: 0, update: 0, zwak: 0, aandacht: 0 };
    alle.forEach(function (a) {
      var x = techniek(a);
      if (a.beschikbaar === 'onbereikbaar' || a.beschikbaar === 'verouderd') tellers.bereik++;
      if (x.batterij != null && x.batterij < 20) tellers.batterij++;
      if (x.update) tellers.update++;
      if (x.signaal != null && x.signaal < 45) tellers.zwak++;
      if (aandacht(a, x)) tellers.aandacht++;
    });

    // речення-підсумок
    var per = { ok: 0, onbereikbaar: 0, verouderd: 0, verondersteld: 0, slaapt: 0 };
    alle.forEach(function (a) { per[a.beschikbaar] = (per[a.beschikbaar] || 0) + 1; });
    var zin = alle.length + ' ' + HV.meervoud(alle.length, ['пристрій', 'пристрої', 'пристроїв'], ['apparaat', 'apparaten']) + ' · ' + t('на зв’язку ', 'bereikbaar ') + per.ok +
      ['onbereikbaar', 'verouderd', 'verondersteld', 'slaapt'].filter(function (s) { return per[s]; }).map(function (s) { return ' · ' + HV.p(STAAT_NAMEN[s]) + ' ' + per[s]; }).join('');

    // картки стану парку
    var gezond = '<div class="hv-register__gezond" role="group" aria-label="' + h(t('Стан пристроїв', 'Staat van de apparaten')) + '">' + [
      { id: 'bereik', icoon: 'unplug', n: tellers.bereik, naam: t('Недоступні й застарілі', 'Onbereikbaar en verouderd') },
      { id: 'batterij', icoon: 'battery-low', n: tellers.batterij, naam: t('Батарейки нижче 20 %', 'Batterij onder 20 %') },
      { id: 'update', icoon: 'circle-arrow-up', n: tellers.update, naam: t('Є оновлення ПЗ', 'Update beschikbaar') },
      { id: 'zwak', icoon: 'wifi-low', n: tellers.zwak, naam: t('Слабкий сигнал', 'Zwak signaal') }
    ].map(function (c) {
      var vk = VOORKEUZES.filter(function (x) { return x.id === c.id; })[0];
      var aan = zelfdeFilter(f, Object.assign(leegFilter(), vk.filter));
      return '<button type="button" class="hv-gezond' + (aan ? ' is-gekozen' : '') + (c.n ? ' is-let-op' : '') + '" aria-pressed="' + (aan ? 'true' : 'false') + '" data-actie="app-voorkeuze" data-id="' + c.id + '" data-k="gz-' + c.id + '">' +
        '<span class="hv-gezond__teken">' + HV.icoon(c.icoon) + '</span><span class="hv-gezond__getal">' + c.n + '</span><span class="hv-gezond__naam">' + h(c.naam) + '</span></button>';
    }).join('') + '</div>';

    // пошук і перемикачі
    var paneel = !!HV.ui.lees('app-paneel', false);
    var zoek = '<div class="hv-register__zoekrij" data-k="zoekrij"><label class="hv-zoekveld">' + HV.icoon('search', { maat: 's' }) +
      '<input id="hv-app-zoek" type="search" autocomplete="off" spellcheck="false" value="' + h(f.zoek) + '" placeholder="' + h(t('Назва, кімната, клас або протокол', 'Naam, kamer, soort of protocol')) + '" aria-label="' + h(t('Пошук пристроїв', 'Apparaten zoeken')) + '"></label>' +
      (f.zoek ? o.icoonknop({ icoon: 'x', aria: t('Очистити пошук', 'Zoekveld wissen'), actie: 'app-zoek-wis' }) : '') +
      o.knop({ tekst: t('Фільтри', 'Filters'), icoon: 'list-filter', klas: paneel ? 'is-open' : '', actie: 'ui', gegevens: { naam: 'app-paneel', waarde: paneel ? '' : '1' }, aria: paneel ? t('Сховати фільтри', 'Filters verbergen') : t('Показати фільтри', 'Filters tonen') }) +
      o.knop({ tekst: kiezen ? t('Готово', 'Klaar') : t('Вибрати', 'Selecteren'), icoon: kiezen ? 'check' : 'list-checks', klas: kiezen ? 'is-open' : '', actie: 'app-kiezen', aria: kiezen ? t('Завершити вибір', 'Selecteren afronden') : t('Вибрати кілька для групової дії', 'Meerdere selecteren voor een groepsactie') }) + '</div>';

    var bewaren = bewaard();
    var weergaven = '<div class="hv-register__weergaven" data-k="weergaven"><span class="hv-register__label">' + HV.icoon('bookmark', { maat: 's' }) + h(t('Вигляди', 'Weergaven')) + '</span><div class="hv-filter">' +
      VOORKEUZES.filter(function (x) { return x.id === 'aandacht'; }).map(function (v) { var aan = zelfdeFilter(f, Object.assign(leegFilter(), v.filter)); return o.chip({ icoon: v.icoon, tekst: HV.p(v.naam) + ' · ' + tellers.aandacht, filter: true, gekozen: aan, actie: 'app-voorkeuze', gegevens: { id: v.id }, k: 'vk-' + v.id }); }).join('') +
      bewaren.map(function (b) {
        var aan = zelfdeFilter(f, b.filter);
        return '<span class="hv-register__bewaard" data-k="bw-' + h(b.id) + '">' + o.chip({ icoon: 'bookmark', tekst: HV.p(b.naam), filter: true, gekozen: aan, actie: 'app-weergave-kies', gegevens: { id: b.id } }) +
          o.icoonknop({ icoon: 'x', maat: 's', aria: t('Видалити вигляд «', 'Weergave verwijderen: ‘') + HV.p(b.naam) + t('»', '’'), actie: 'app-weergave-weg', gegevens: { id: b.id } }) + '</span>';
      }).join('') +
      (actieveDelen(f).length && !bewaren.some(function (b) { return zelfdeFilter(f, b.filter); }) ? o.chip({ icoon: 'bookmark-plus', tekst: t('Зберегти цей вигляд', 'Deze weergave bewaren'), actie: 'app-weergave-bewaar', k: 'bw-nieuw' }) : '') +
      '</div></div>';

    var actief = actieveDelen(f);
    var actiefRij = actief.length ? '<div class="hv-register__actief" data-k="actief"><span class="hv-register__label">' + h(t('Знайдено ', 'Gevonden: ') + lijst.length + t(' з ', ' van ') + alle.length) + '</span><div class="hv-filter">' + actief.map(function (d, i) {
      return o.chip({ html: '<span>' + h(d.tekst) + '</span>' + HV.icoon('x', { maat: 's' }), actie: 'app-filter-weg', gegevens: { sleutel: d.sleutel, waarde: d.waarde }, aria: t('Прибрати фільтр: ', 'Filter weghalen: ') + d.tekst, k: 'af-' + i });
    }).join('') + o.knop({ tekst: t('Скинути все', 'Alles wissen'), soort: 'stil', klein: true, actie: 'app-filter-wis' }) + '</div></div>' : '';

    var filterPaneel = paneel ? filterPaneelHtml(f, alle) : '';

    var hulp = '<div class="hv-register__hulp" data-k="hulp">' +
      o.segment({ label: t('Групувати', 'Groeperen'), waarde: groepeer, actie: 'app-groep', k: 'app-groep', opties: [{ id: 'kamer', label: t('Кімнати', 'Kamers') }, { id: 'klasse', label: t('Класи', 'Soorten') }, { id: 'geen', label: t('Без груп', 'Geen groepen') }] }) +
      o.segment({ label: t('Вигляд', 'Weergave'), waarde: weergave, actie: 'app-weergave', k: 'app-weergave', klas: 'hv-register__weergave', opties: [{ id: 'tegels', label: t('Плитки', 'Tegels'), icoon: 'layout-grid' }, { id: 'tabel', label: t('Таблиця', 'Tabel'), icoon: 'table' }] }) + '</div>';

    // групи
    var groepen = [];
    var sorteer = function (l) {
      var s = f.sorteer || 'naam';
      return l.slice().sort(function (a, b) {
        if (s === 'batterij') { var x = techniek(a).batterij, y = techniek(b).batterij; return (x == null ? 999 : x) - (y == null ? 999 : y); }
        if (s === 'signaal') { var p = techniek(a).signaal, q = techniek(b).signaal; return (p == null ? 999 : p) - (q == null ? 999 : q); }
        if (s === 'gezien') return a.gezien - b.gezien;
        return HV.p(a.naam).localeCompare(HV.p(b.naam), ctx.taal === 'nl' ? 'nl' : 'uk');
      });
    };
    if (groepeer === 'kamer') {
      VERDIEPINGEN.forEach(function (vid) {
        w.kamers.filter(function (k) { return k.verdieping === vid; }).forEach(function (k) {
          var l = lijst.filter(function (a) { return a.kamer === k.id; });
          if (l.length) groepen.push({ id: 'k-' + k.id, titel: HV.p(k.naam), sub: HV.p(verdNaam(vid)), lijst: sorteer(l) });
        });
      });
    } else if (groepeer === 'klasse') {
      KLASSEN.forEach(function (kl) { var l = lijst.filter(function (a) { return klasseVan(a) === kl; }); if (l.length) groepen.push({ id: 'c-' + kl.id, titel: HV.p(kl.naam), lijst: sorteer(l) }); });
    } else groepen.push({ id: 'alle', titel: t('Усі знайдені', 'Alle gevonden'), lijst: sorteer(lijst), vast: true });

    var inhoud = groepen.map(function (g) {
      var ids = g.lijst.map(function (a) { return a.id; });
      var alleGekozen = ids.every(function (id) { return gekozen[id]; });
      var extra = kiezen ? o.knop({ tekst: alleGekozen ? t('Зняти вибір', 'Selectie wissen') : t('Вибрати групу', 'Groep selecteren'), klein: true, soort: 'stil', actie: 'app-kies-groep', gegevens: { ids: ids.join(','), aan: alleGekozen ? '' : '1' } }) : (g.sub ? '<span class="hv-register__sub">' + h(g.sub) + '</span>' : '');
      var lijf = weergave === 'tabel' ? tabel(g.lijst, kiezen, gekozen, groepeer) : '<div class="hv-register__tegels">' + g.lijst.map(function (a) { return tegel(a, kiezen, gekozen, groepeer); }).join('') + '</div>';
      return o.blok({ id: 'reg-' + g.id, titel: g.titel, teller: g.lijst.length, extra: extra, vast: g.vast || kiezen, inhoud: lijf, samenvatting: h(g.lijst.slice(0, 6).map(function (a) { return HV.p(a.naam); }).join(', ') + (g.lijst.length > 6 ? '…' : '')) });
    }).join('');
    if (!lijst.length) inhoud = o.leeg({ icoon: 'search', titel: t('Нічого не знайдено', 'Niets gevonden'), tekst: t('Змініть пошук або приберіть частину фільтрів.', 'Pas de zoekopdracht aan of haal een paar filters weg.'), actie: { tekst: t('Скинути все', 'Alles wissen'), actie: 'app-filter-wis' } });

    return '<div class="hv-register' + (kiezen ? ' is-kiezen' : '') + '" data-k="register">' +
      '<p class="hv-pagina__zin" data-k="regzin">' + h(zin) + '</p>' + gezond + zoek + weergaven + actiefRij + filterPaneel + hulp +
      '<div class="hv-register__lijst" data-k="reglijst">' + inhoud + '</div>' + groepBalk(ctx, kiezen, gekozen) + '</div>';
  }

  function filterPaneelHtml(f, alle) {
    var tel = function (fn) { return alle.filter(fn).length; };
    var groep = function (titel, inhoud) { return '<fieldset class="hv-register__veld"><legend>' + h(titel) + '</legend>' + inhoud + '</fieldset>'; };
    var klassen = '<div class="hv-filter">' + KLASSEN.map(function (kl) {
      var n = tel(function (a) { return klasseVan(a) === kl; });
      return o.chip({ icoon: kl.icoon, tekst: HV.p(kl.naam) + ' · ' + n, filter: true, gekozen: f.klassen.indexOf(kl.id) >= 0, actie: 'app-filter-lijst', gegevens: { sleutel: 'klassen', waarde: kl.id }, k: 'fk-' + kl.id });
    }).join('') + '</div>';
    var kamers = VERDIEPINGEN.map(function (vid) {
      return '<div class="hv-register__verd"><span class="hv-register__sub">' + h(HV.p(verdNaam(vid))) + '</span><div class="hv-filter">' + HV.staat.w.kamers.filter(function (k) { return k.verdieping === vid; }).map(function (k) {
        return o.chip({ icoon: k.icoon, tekst: HV.p(k.naam), filter: true, gekozen: f.kamers.indexOf(k.id) >= 0, actie: 'app-filter-lijst', gegevens: { sleutel: 'kamers', waarde: k.id }, k: 'fr-' + k.id });
      }).join('') + '</div></div>';
    }).join('');
    var beschikbaar = '<div class="hv-filter">' + ['ok', 'onbereikbaar', 'verouderd', 'verondersteld', 'slaapt'].map(function (s) {
      var n = tel(function (a) { return a.beschikbaar === s; });
      return o.chip({ icoon: s === 'ok' ? 'wifi' : s === 'onbereikbaar' ? 'unplug' : s === 'verouderd' ? 'hourglass' : s === 'verondersteld' ? 'circle-dashed' : 'moon', tekst: HV.p(STAAT_NAMEN[s] || ['на зв’язку', 'bereikbaar']) + ' · ' + n, filter: true, gekozen: f.beschikbaar.indexOf(s) >= 0, actie: 'app-filter-lijst', gegevens: { sleutel: 'beschikbaar', waarde: s }, k: 'fb-' + s });
    }).join('') + '</div>';
    return '<section class="hv-kaart hv-register__paneel" data-k="filterpaneel" aria-label="' + h(t('Фільтри', 'Filters')) + '">' +
      groep(t('Клас', 'Soort'), klassen) + groep(t('Кімната', 'Kamer'), kamers) +
      '<div class="hv-register__velden">' +
      groep(t('Стан', 'Toestand'), o.segment({ label: t('Стан', 'Toestand'), waarde: f.staat, actie: 'app-filter-zet', gegevens: { sleutel: 'staat' }, k: 'fs', opties: [{ id: 'alle', label: t('Усі', 'Alle') }, { id: 'aan', label: t('Увімкнені', 'Aan') }, { id: 'uit', label: t('Вимкнені', 'Uit') }] })) +
      groep(t('Батарейки', 'Batterijen'), o.segment({ label: t('Батарейки', 'Batterijen'), waarde: f.batterij, actie: 'app-filter-zet', gegevens: { sleutel: 'batterij' }, k: 'fbat', opties: [{ id: 'alle', label: t('Усі', 'Alle') }, { id: 'met', label: t('З батарейкою', 'Met batterij') }, { id: 'laag', label: t('Нижче 20 %', 'Onder 20 %') }] })) +
      groep(t('Сортувати', 'Sorteren'), o.segment({ label: t('Сортувати', 'Sorteren'), waarde: f.sorteer || 'naam', actie: 'app-filter-zet', gegevens: { sleutel: 'sorteer' }, k: 'fsort', opties: [{ id: 'naam', label: t('Назва', 'Naam') }, { id: 'batterij', label: t('Батарейка', 'Batterij') }, { id: 'signaal', label: t('Сигнал', 'Signaal') }, { id: 'gezien', label: t('Бачили', 'Gezien') }] })) +
      '</div>' +
      groep(t('Зв’язок', 'Verbinding'), beschikbaar + '<div class="hv-filter">' +
        o.chip({ icoon: 'signal-low', tekst: t('Слабкий сигнал', 'Zwak signaal'), filter: true, gekozen: f.zwak, actie: 'app-filter-vlag', gegevens: { sleutel: 'zwak' }, k: 'fz' }) +
        o.chip({ icoon: 'circle-arrow-up', tekst: t('Є оновлення ПЗ', 'Update beschikbaar'), filter: true, gekozen: f.update, actie: 'app-filter-vlag', gegevens: { sleutel: 'update' }, k: 'fu' }) + '</div>') +
      '</section>';
  }

  function metaHtml(a, x) {
    var delen = [];
    delen.push('<span class="hv-meta__deel">' + HV.icoon(x.groep ? 'group' : x.bedraad ? 'cable' : 'radio', { maat: 'maker' }) + h(x.protocol) + '</span>');
    if (x.signaal != null) delen.push('<span class="hv-meta__deel' + (x.signaal < 45 ? ' is-let-op' : '') + '">' + HV.icoon(signaalIcoon(x.signaal), { maat: 'maker' }) + h(signaalWoord(x.signaal)) + '</span>');
    if (x.batterij != null) delen.push('<span class="hv-meta__deel' + (x.batterij < 20 ? ' is-let-op' : '') + '">' + HV.icoon(batterijIcoon(x.batterij), { maat: 'maker' }) + HV.maat(x.batterij, '%') + '</span>');
    if (x.update) delen.push('<span class="hv-meta__deel is-update">' + HV.icoon('circle-arrow-up', { maat: 'maker' }) + h(x.versie + ' → ' + x.nieuwste) + '</span>');
    return '<p class="hv-meta">' + delen.join('') + '</p>';
  }

  function tegel(a, kiezen, gekozen, groepeer) {
    var x = techniek(a);
    if (!kiezen) return '<div class="hv-register__item" data-k="ri-' + h(a.id) + '">' + o.tegel(a, { vorm: '2x1', metKamer: groepeer !== 'kamer' }) + metaHtml(a, x) + '</div>';
    var b = o.beeld(a), aan = !!gekozen[a.id], k = HV.staat.kamer(a.kamer);
    var woord = a.beschikbaar === 'onbereikbaar' ? HV.woord.onbereikbaar() : b.woord;
    return '<div class="hv-register__item" data-k="ri-' + h(a.id) + '"><button type="button" class="hv-kieskaart' + (aan ? ' is-gekozen' : '') + (a.beschikbaar !== 'ok' ? ' is-' + a.beschikbaar : '') + '" aria-pressed="' + (aan ? 'true' : 'false') + '" data-actie="app-kies" data-id="' + h(a.id) + '">' +
      '<span class="hv-kieskaart__vink" aria-hidden="true">' + (aan ? HV.icoon('check', { maat: 's' }) : '') + '</span>' +
      '<span class="hv-kieskaart__teken">' + HV.icoon(a.beschikbaar === 'onbereikbaar' ? 'unplug' : b.icoon, { maat: 's' }) + '</span>' +
      '<span class="hv-kieskaart__tekst"><span class="hv-kieskaart__naam">' + h(HV.p(a.naam)) + '</span><span class="hv-kieskaart__sub">' + h((groepeer !== 'kamer' ? HV.p(k.naam) + ' · ' : '') + (woord || HV.p(HV.paspoort.soorten[a.soort].naam)) + (STAAT_NAMEN[a.beschikbaar] && a.beschikbaar !== 'onbereikbaar' ? ' · ' + HV.p(STAAT_NAMEN[a.beschikbaar]) : '')) + '</span></span></button>' + metaHtml(a, x) + '</div>';
  }

  function tabel(lijst, kiezen, gekozen, groepeer) {
    var kop = [kiezen ? '' : null, t('Назва', 'Naam'), groepeer !== 'kamer' ? t('Кімната', 'Kamer') : null, groepeer !== 'klasse' ? t('Клас', 'Soort') : null, t('Стан', 'Toestand'), t('Зв’язок', 'Verbinding'), t('Батарейка', 'Batterij'), t('ПЗ', 'Software'), t('Бачили', 'Gezien')];
    var kolom = ['kies', 'naam', 'kamer', 'klasse', 'staat', 'verbinding', 'batterij', 'versie', 'gezien'];
    var rijen = lijst.map(function (a) {
      var x = techniek(a), b = o.beeld(a), k = HV.staat.kamer(a.kamer), s = HV.paspoort.soorten[a.soort];
      var staat = a.beschikbaar === 'onbereikbaar' ? HV.woord.onbereikbaar() : a.wacht ? HV.woord.wacht() : (b.woord || '') + (b.waarde ? (b.woord ? ' · ' : '') + b.waarde.replace(/<[^>]+>/g, '') : '');
      var cellen = [
        kiezen ? '<td class="hv-rt__kies"><button type="button" class="hv-rt__vink' + (gekozen[a.id] ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen[a.id] ? 'true' : 'false') + '" aria-label="' + h(t('Вибрати: ', 'Selecteren: ') + HV.p(a.naam)) + '" data-actie="app-kies" data-id="' + h(a.id) + '">' + (gekozen[a.id] ? HV.icoon('check', { maat: 's' }) : '') + '</button></td>' : null,
        '<th scope="row" class="hv-rt__naam"><button type="button" class="hv-rt__open" data-actie="blad" data-blad="apparaat:' + h(a.id) + '"><span class="hv-rt__teken' + (b.aan && a.beschikbaar !== 'onbereikbaar' ? ' is-aan hv-toon-' + (b.toon || s.toon || 'neutraal') : '') + (a.beschikbaar !== 'ok' ? ' is-' + a.beschikbaar : '') + '">' + HV.icoon(a.beschikbaar === 'onbereikbaar' ? 'unplug' : b.icoon, { maat: 's' }) + '</span><span>' + h(HV.p(a.naam)) + '</span></button></th>',
        groepeer !== 'kamer' ? '<td data-kolom="kamer">' + h(HV.p(k.naam)) + '</td>' : null,
        groepeer !== 'klasse' ? '<td data-kolom="klasse">' + h(HV.p(s.naam)) + '</td>' : null,
        '<td data-kolom="staat">' + h(staat) + (STAAT_NAMEN[a.beschikbaar] && a.beschikbaar !== 'onbereikbaar' ? '<span class="hv-rt__eerlijk">' + h(HV.p(STAAT_NAMEN[a.beschikbaar])) + '</span>' : '') + '</td>',
        '<td data-kolom="verbinding"><span class="hv-meta__deel' + (x.signaal != null && x.signaal < 45 ? ' is-let-op' : '') + '">' + (x.signaal != null ? HV.icoon(signaalIcoon(x.signaal), { maat: 'maker' }) : HV.icoon(x.groep ? 'group' : 'cable', { maat: 'maker' })) + h(x.protocol + (x.signaal != null ? ' · ' + signaalWoord(x.signaal) : '')) + '</span></td>',
        '<td data-kolom="batterij">' + (x.batterij != null ? '<span class="hv-meta__deel' + (x.batterij < 20 ? ' is-let-op' : '') + '">' + HV.icoon(batterijIcoon(x.batterij), { maat: 'maker' }) + HV.maat(x.batterij, '%') + '</span>' : '<span class="hv-rt__leeg">—</span>') + '</td>',
        '<td data-kolom="versie">' + (x.versie ? (x.update ? '<span class="hv-meta__deel is-update">' + HV.icoon('circle-arrow-up', { maat: 'maker' }) + h(x.versie + ' → ' + x.nieuwste) + '</span>' : h(x.versie)) : '<span class="hv-rt__leeg">—</span>') + '</td>',
        '<td data-kolom="gezien">' + h(a.beschikbaar === 'onbereikbaar' ? t('о ', 'om ') + HV.tijd(a.gezien) : HV.oud(HV.kijk.leeftijd(a)) + t(' тому', ' geleden')) + '</td>'
      ].filter(function (c) { return c != null; });
      return '<tr class="' + (gekozen[a.id] && kiezen ? 'is-gekozen' : '') + (a.beschikbaar !== 'ok' ? ' is-' + a.beschikbaar : '') + '" data-k="rt-' + h(a.id) + '">' + cellen.join('') + '</tr>';
    }).join('');
    var koppen = kop.map(function (k, i) { return k == null ? null : '<th scope="col" data-kolom="' + kolom[i] + '">' + (i === 0 ? '<span class="hv-vo">' + h(t('Вибір', 'Selectie')) + '</span>' : h(k)) + '</th>'; }).filter(function (k) { return k != null; }).join('');
    return '<div class="hv-register__tabel"><table class="hv-tabel hv-rt"><thead><tr>' + koppen + '</tr></thead><tbody>' + rijen + '</tbody></table></div>';
  }

  // ───────────────────────── Групова дія ─────────────────────────
  var GROEPACTIES = [
    { id: 'aan', icoon: 'power', naam: ['Увімкнути', 'Aanzetten'], mogelijkheid: 'aan', waarde: true },
    { id: 'uit', icoon: 'power-off', naam: ['Вимкнути', 'Uitzetten'], mogelijkheid: 'aan', waarde: false },
    { id: 'update', icoon: 'circle-arrow-up', naam: ['Оновити ПЗ', 'Software bijwerken'], mogelijkheid: 'firmware' }
  ];
  /** Чи може дія стосуватися пристрою: null — так, інакше причина [uk, nl]. */
  function waaromNiet(a, ga) {
    var s = HV.paspoort.soorten[a.soort];
    if (a.beschikbaar === 'onbereikbaar') return ['недоступний', 'niet bereikbaar'];
    if (ga.id === 'update') return techniek(a).update ? null : ['ПЗ уже найновіше', 'software is al actueel'];
    if (s.kritiek) return ['критичний — лише поодинці, з підтвердженням', 'kritiek — alleen apart, met bevestiging'];
    if (a.mog.indexOf('aan') < 0) return ['не має вмикача', 'heeft geen schakelaar'];
    if (HV.gevaar.isZwaar(HV.gevaar.vind(a, 'aan', ga.waarde))) return ['небезпечна дія — лише поодинці, з підтвердженням', 'gevaarlijke actie — alleen apart, met bevestiging'];
    if (!!HV.kijk.isAan(a) === ga.waarde) return [ga.waarde ? 'уже ввімкнено' : 'уже вимкнено', ga.waarde ? 'staat al aan' : 'staat al uit'];
    return null;
  }

  function groepBalk(ctx, kiezen, gekozen) {
    var loop = HV.ui.lees('app-loop', null);
    if (!kiezen && !loop) return '';
    var ids = Object.keys(gekozen).filter(function (id) { return gekozen[id] && HV.staat.w.apparaten[id]; });
    var inhoud;
    if (loop) {
      var deel = loop.totaal ? loop.klaar / loop.totaal * 100 : 100;
      inhoud = '<div class="hv-groepbalk__loop" role="status" aria-live="polite"><p class="hv-groepbalk__titel">' + h(HV.p(loop.naam) + ': ' + (loop.bezig ? t('виконується ', 'bezig ') : t('готово ', 'klaar ')) + loop.klaar + t(' з ', ' van ') + loop.totaal) + '</p>' +
        '<span class="hv-groepbalk__voortgang" aria-hidden="true"><i style="width:' + deel.toFixed(1) + '%"></i></span>' +
        (loop.bezig ? '' : '<p class="hv-groepbalk__uitkomst">' + h(t('Виконано: ', 'Gelukt: ') + loop.ok + (loop.mislukt.length ? t(' · не виконано: ', ' · niet gelukt: ') + loop.mislukt.join(', ') : '') + (loop.overgeslagen.length ? t(' · пропущено: ', ' · overgeslagen: ') + loop.overgeslagen.length : '')) + '</p>') +
        (loop.overgeslagen.length && !loop.bezig ? '<details class="hv-groepbalk__details"><summary>' + h(t('Чому пропущено', 'Waarom overgeslagen')) + '</summary><ul>' + loop.overgeslagen.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul></details>' : '') +
        '</div>' + (loop.bezig ? '' : o.knop({ tekst: t('Закрити', 'Sluiten'), klein: true, actie: 'app-loop-weg' }));
    } else {
      var lijst = ids.map(function (id) { return HV.staat.w.apparaten[id]; });
      inhoud = '<p class="hv-groepbalk__titel">' + h(t('Вибрано: ', 'Geselecteerd: ') + ids.length) + '</p><div class="hv-groepbalk__knoppen">' + GROEPACTIES.map(function (ga) {
        var n = lijst.filter(function (a) { return !waaromNiet(a, ga); }).length;
        return o.knop({ tekst: HV.p(ga.naam) + (ids.length ? ' · ' + n : ''), icoon: ga.icoon, klein: true, uit: !n, actie: 'app-groep-doe', gegevens: { ga: ga.id } });
      }).join('') + o.gevolg(t('Що станеться: дію буде виконано для кожного вибраного пристрою по черзі, поступ видно як «N з M». Пов’язано з: критичні пристрої (замки, ворота, охорона) і небезпечні дії в групу не входять — лише поодинці, з підтвердженням; недоступні буде пропущено й названо. Як повернути: «Повернути» протягом 10 с для вмикання й вимикання; оновлення ПЗ не повертається.', 'Wat er gebeurt: de actie wordt voor elk geselecteerd apparaat na elkaar uitgevoerd, de voortgang staat er als ‘N van M’. Hangt samen met: kritieke apparaten (sloten, poorten, alarm) en gevaarlijke acties horen niet in een groep — alleen apart, met bevestiging; onbereikbare worden overgeslagen en genoemd. Terugdraaien: ‘Ongedaan maken’ binnen 10 s voor aan en uit; een software-update gaat niet terug.'), { kop: t('Групова дія', 'Groepsactie') }) +
        (ids.length ? o.knop({ tekst: t('Зняти вибір', 'Selectie wissen'), klein: true, soort: 'stil', actie: 'app-kies-wis' }) : '') + '</div>';
    }
    return '<div class="hv-groepbalk" data-k="groepbalk" role="region" aria-label="' + h(t('Групова дія', 'Groepsactie')) + '">' + inhoud + '</div>';
  }

  function voerGroepUit(gaId) {
    var ga = GROEPACTIES.filter(function (x) { return x.id === gaId; })[0];
    var gekozen = HV.ui.lees('app-gekozen', {});
    var lijst = Object.keys(gekozen).filter(function (id) { return gekozen[id] && HV.staat.w.apparaten[id]; }).map(function (id) { return HV.staat.w.apparaten[id]; });
    var doen = [], overgeslagen = [];
    lijst.forEach(function (a) { var r = waaromNiet(a, ga); if (r) overgeslagen.push(HV.p(a.naam) + ': ' + HV.p(r)); else doen.push(a); });
    if (!doen.length) return;
    var loop = { naam: ga.naam, totaal: doen.length, klaar: 0, ok: 0, mislukt: [], overgeslagen: overgeslagen, bezig: true };
    var vorige = [];
    HV.ui.zet('app-loop', loop);
    var keten = Promise.resolve();
    doen.forEach(function (a) {
      keten = keten.then(function () {
        var o2 = ga.id === 'update'
          ? { doel: a.id, mogelijkheid: 'firmware', waarde: techniek(a).nieuwste, stil: true, waarom: ['оновлення ПЗ з реєстру', 'software-update vanuit het register'] }
          : { doel: a.id, mogelijkheid: 'aan', waarde: ga.waarde, stil: true, waarom: ['групова дія з реєстру', 'groepsactie vanuit het register'] };
        var was = HV.huidige(a, 'aan');
        return HV.doe(o2).then(function (r) {
          loop.klaar++;
          if (r && r.ok) { loop.ok++; vorige.push([a.id, was]); } else loop.mislukt.push(HV.p(a.naam));
          HV.ui.zet('app-loop', loop);
        });
      });
    });
    keten.then(function () {
      loop.bezig = false;
      HV.ui.zet('app-loop', loop);
      HV.meld({
        maker: HV.mens(), icoon: ga.icoon,
        titel: HV.p(ga.naam) + ': ' + loop.ok + t(' з ', ' van ') + loop.totaal,
        tekst: (loop.mislukt.length ? t('Не виконано: ', 'Niet gelukt: ') + loop.mislukt.join(', ') + '. ' : '') + (overgeslagen.length ? t('Пропущено: ', 'Overgeslagen: ') + overgeslagen.length : ''),
        terug: ga.id === 'update' || !vorige.length ? null : function () { vorige.forEach(function (x) { HV.doe({ doel: x[0], mogelijkheid: 'aan', waarde: x[1], stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); }); },
        hoe: ga.id === 'update' ? t('Як повернути: попередню версію ПЗ ставить виробник; відкату тут немає.', 'Terugdraaien: een vorige softwareversie zet de fabrikant terug; hier kan dat niet.') : null
      });
    });
  }

  // ───────────────────────── Дії реєстру ─────────────────────────
  HV.actie('app-voorkeuze', function (ctx, g) {
    var vk = VOORKEUZES.filter(function (x) { return x.id === g.id; })[0];
    var doel = Object.assign(leegFilter(), vk.filter);
    HV.ui.zet('app-filter', zelfdeFilter(filterNu(), doel) ? leegFilter() : doel);
  });
  HV.actie('app-filter-lijst', function (ctx, g) { zetFilter(function (f) { var l = f[g.sleutel] || []; var i = l.indexOf(g.waarde); if (i >= 0) l.splice(i, 1); else l.push(g.waarde); f[g.sleutel] = l; }); });
  HV.actie('app-filter-zet', function (ctx, g) { zetFilter(function (f) { f[g.sleutel] = g.waarde; }); });
  HV.actie('app-filter-vlag', function (ctx, g) { zetFilter(function (f) { f[g.sleutel] = !f[g.sleutel]; }); });
  HV.actie('app-filter-weg', function (ctx, g) {
    zetFilter(function (f) {
      var leeg = leegFilter();
      if (g.waarde && Array.isArray(f[g.sleutel])) f[g.sleutel] = f[g.sleutel].filter(function (x) { return x !== g.waarde; });
      else if (g.sleutel === 'aandacht') f.aandacht = false;
      else f[g.sleutel] = leeg[g.sleutel];
      if (g.sleutel === 'zoek') { var el = document.getElementById('hv-app-zoek'); if (el) el.value = ''; }
    });
  });
  HV.actie('app-filter-wis', function () { var el = document.getElementById('hv-app-zoek'); if (el) el.value = ''; HV.ui.zet('app-filter', leegFilter()); });
  HV.actie('app-zoek-wis', function () { var el = document.getElementById('hv-app-zoek'); if (el) { el.value = ''; el.focus(); } zetFilter(function (f) { f.zoek = ''; }); });
  HV.actie('app-groep', function (ctx, g) { HV.ui.zet('app-groep', g.waarde); });
  HV.actie('app-weergave', function (ctx, g) { HV.ui.zet('app-weergave', g.waarde); });
  HV.actie('app-weergave-bewaar', function () {
    var f = filterNu(), l = bewaard(), naam = naamPaar(f);
    l.push({ id: 'w' + Date.now().toString(36), naam: naam, filter: JSON.parse(JSON.stringify(f)) });
    HV.opslag.schrijf('apparaten-weergaven', l.slice(-8));
    HV.meld({ icoon: 'bookmark', titel: t('Вигляд збережено', 'Weergave bewaard'), tekst: HV.p(naam) + t(' — лише для вас, на цьому пристрої.', ' — alleen voor jou, op dit apparaat.') });
    HV.teken();
  });
  HV.actie('app-weergave-kies', function (ctx, g) {
    var b = bewaard().filter(function (x) { return x.id === g.id; })[0];
    if (!b) return;
    var el = document.getElementById('hv-app-zoek'); if (el) el.value = b.filter.zoek || '';
    HV.ui.zet('app-filter', zelfdeFilter(filterNu(), b.filter) ? leegFilter() : JSON.parse(JSON.stringify(b.filter)));
  });
  HV.actie('app-weergave-weg', function (ctx, g) {
    var l = bewaard(), weg = l.filter(function (x) { return x.id === g.id; })[0];
    HV.opslag.schrijf('apparaten-weergaven', l.filter(function (x) { return x.id !== g.id; }));
    if (weg) HV.meld({ icoon: 'bookmark', titel: t('Вигляд видалено', 'Weergave verwijderd'), tekst: HV.p(weg.naam), terug: function () { HV.opslag.schrijf('apparaten-weergaven', bewaard().concat([weg])); HV.teken(); } });
    HV.teken();
  });
  HV.actie('app-kiezen', function () { var aan = !HV.ui.lees('app-kiezen', false); if (!aan) HV.ui.zet('app-gekozen', {}); HV.ui.zet('app-kiezen', aan); });
  HV.actie('app-kies', function (ctx, g) { var k = JSON.parse(JSON.stringify(HV.ui.lees('app-gekozen', {}))); if (k[g.id]) delete k[g.id]; else k[g.id] = true; HV.ui.zet('app-gekozen', k); });
  HV.actie('app-kies-groep', function (ctx, g) { var k = JSON.parse(JSON.stringify(HV.ui.lees('app-gekozen', {}))); String(g.ids).split(',').forEach(function (id) { if (g.aan) k[id] = true; else delete k[id]; }); HV.ui.zet('app-gekozen', k); });
  HV.actie('app-kies-wis', function () { HV.ui.zet('app-gekozen', {}); });
  HV.actie('app-groep-doe', function (ctx, g) { voerGroepUit(g.ga); });
  HV.actie('app-loop-weg', function () { HV.ui.zet('app-loop', null); });

  // пошук: поле живе поза перерисовкою (ядро не чіпає значення input)
  document.addEventListener('input', function (ev) {
    if (!ev.target || ev.target.id !== 'hv-app-zoek') return;
    var waarde = ev.target.value;
    zetFilter(function (f) { f.zoek = waarde; });
  });

  // ───────────────────────── Реєстрація ─────────────────────────
  HV.tab('kamers', { id: 'plattegrond', titel: ['План', 'Plattegrond'], adres: '/kamers/plattegrond', render: plattegrond });
  HV.tab('kamers', { id: 'apparaten', titel: ['Пристрої', 'Apparaten'], adres: '/apparaten', render: apparatenScherm });
})(window.HV = window.HV || {});
