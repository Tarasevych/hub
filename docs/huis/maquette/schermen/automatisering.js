// Automatisering / Автоматика — правила «Коли / Якщо / Тоді — Wanneer / Als / Dan», сцени й режими дому, порядок дня.
// Адреси на справжньому сайті: /automatiseringen (список), /automatiseringen/<id> (правило), …/proef, …/verloop, …/versies;
// /scenes, /scenes/<id>, /scenes/standen/<stand>; /automatiseringen/dagorde. Аркуші: ?blad=regelstap:<крок>, regelnieuw,
// regelpauze, regelopslaan, recept:<id>, reeks:<id>, scenenieuw, vertrek.
//
// Рушій правил живе тут же: стан правил — розширення світу (w.auto), тож кожен сценарій симулятора починає з чистого
// паспорта. Кожен крок правила йде через HV.doe від імені виконавця «правило» (власний hv-stand на кожну дію; типово
// «Вимкнено», змінює лише власник). Події запуску за часом і сонцем спрацьовують за часом дому, події стану — на фронті зміни.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  var MIN = 60000, UUR = 3600000, DAG = 86400000;
  var STANDEN = ['thuis', 'afwezig', 'nacht', 'vakantie', 'gasten'];
  var STAND_ICOON = { thuis: 'house', afwezig: 'log-out', nacht: 'bed-double', vakantie: 'luggage', gasten: 'users' };
  var DAGEN = [['Пн', 'ma'], ['Вт', 'di'], ['Ср', 'wo'], ['Чт', 'do'], ['Пт', 'vr'], ['Сб', 'za'], ['Нд', 'zo']];
  var FASE = { concept: ['Чернетка', 'Concept'], meekijken: ['Спостереження', 'Meekijken'], aan: ['Увімкнено', 'Aan'] };

  // ───────────────────────── Hulpjes ─────────────────────────
  var twee = function (n) { return (n < 10 ? '0' : '') + n; };
  function uurTekst(u) { var m = Math.round(u * 60); m = ((m % 1440) + 1440) % 1440; return twee(Math.floor(m / 60)) + ':' + twee(m % 60); }
  function dagBegin(ms) { return ms - (((ms % DAG) + DAG) % DAG); }
  function weekdag(ms) { var d = new Date(ms).getUTCDay(); return d === 0 ? 7 : d; }
  function kopie(x) { return JSON.parse(JSON.stringify(x)); }
  function klein(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function groot(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function app(id) { return HV.staat.w && HV.staat.w.apparaten[id]; }
  function kamer(id) { return HV.staat.kamer(id); }
  function dagWoord(ms, nu) {
    var d = Math.round((dagBegin(ms) - dagBegin(nu)) / DAG);
    if (d === 0) return t('сьогодні', 'vandaag');
    if (d === -1) return t('учора', 'gisteren');
    if (d === 1) return t('завтра', 'morgen');
    return HV.datumKort(ms);
  }
  function wanneerTekst(ms, nu) { return dagWoord(ms, nu) + ' ' + HV.tijd(ms); }
  function sceneVan(id) { var w = HV.staat.w; return w ? w.scenes.filter(function (s) { return s.id === id; })[0] : null; }
  function mensNaam(id) { var m = HV.paspoort.mensen.filter(function (x) { return x.id === id; })[0]; return m ? m.naam : [id, id]; }
  function mensMaker(id) { return { soort: 'mens', id: id, naam: mensNaam(id) }; }
  var AGENT = function (id) { return { soort: 'agent', id: id, naam: id === 'gemini' ? ['Агент Gemini', 'Agent Gemini'] : ['Агент Claude', 'Agent Claude'] }; };
  // Нідерландський артикль для речень: більшість назв пристроїв — de-слова.
  var HET = ['nachtlampje', 'raam', 'alarm', 'licht', 'slot'];
  function lidwoord(nl) { var k = klein(nl); return (HET.indexOf(k.split(' ')[0]) >= 0 ? 'het ' : 'de ') + k; }

  /** Схід і захід сонця для Утрехта (52,09° пн. ш., 5,12° сх. д.) у годинах часу дому; літній час — за правилом ЄС. */
  function laatsteZondag(j, m) { var d = new Date(Date.UTC(j, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
  function zomertijd(d) {
    var m = d.getUTCMonth();
    if (m < 2 || m > 9) return false;
    if (m > 2 && m < 9) return true;
    var z = laatsteZondag(d.getUTCFullYear(), m);
    return m === 2 ? d.getUTCDate() >= z : d.getUTCDate() < z;
  }
  var zonGeheugen = {};
  function zon(ms) {
    var d0 = dagBegin(ms);
    if (zonGeheugen[d0]) return zonGeheugen[d0];
    var d = new Date(d0), j = d.getUTCFullYear();
    var n = Math.round((d0 - Date.UTC(j, 0, 1)) / DAG) + 1;
    var g = 2 * Math.PI / 365 * (n - 1), r = Math.PI / 180, lat = 52.09, lon = 5.12;
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(decl)) - Math.tan(lat * r) * Math.tan(decl)) / r;
    var tz = zomertijd(d) ? 2 : 1;
    zonGeheugen[d0] = { op: (720 - 4 * (lon + ha) - eqt) / 60 + tz, onder: (720 - 4 * (lon - ha) - eqt) / 60 + tz };
    return zonGeheugen[d0];
  }

  // ───────────────────────── Виконавець «правило» ─────────────────────────
  // Кожне правило — окремий виконавець зі своїми дозволами hv-stand. Реєстр виконавців паспорта (сцени, автоматизації,
  // оптимізатор, агенти) не розширюємо — його читають сегменти інших розділів; назву дає обгортка нижче.
  var naamUitvoerder = HV.gevaar.uitvoerder;
  HV.gevaar.uitvoerder = function (id) {
    if (typeof id === 'string' && id.indexOf('regel-') === 0) {
      var r = regel(id.slice(6));
      if (r) return { id: id, soort: 'automatisering', naam: ['Правило «' + r.naam[0] + '»', 'Regel ‘' + r.naam[1] + '’'] };
    }
    if (id === 'overgangen') return { id: id, soort: 'automatisering', naam: ['Переходи режимів', 'Overgangen van standen'] };
    if (typeof id === 'string' && id.indexOf('reeks-') === 0) return { id: id, soort: 'automatisering', naam: ['Послідовність', 'Reeks'] };
    return naamUitvoerder(id);
  };
  function door(r) { return { soort: 'automatisering', id: 'regel-' + r.id, naam: r.naam }; }

  // ───────────────────────── Tekstfragmenten ─────────────────────────
  function dagenTekst(d) {
    if (!d || d.length === 7) return ['щодня', 'elke dag'];
    var s = d.slice().sort().join('');
    if (s === '12345') return ['у будні', 'op werkdagen'];
    if (s === '67') return ['у вихідні', 'in het weekend'];
    return [d.map(function (x) { return DAGEN[x - 1][0]; }).join(', '), d.map(function (x) { return DAGEN[x - 1][1]; }).join(', ')];
  }
  function waarVan(id) { var a = app(id), k = a && kamer(a.kamer); return k ? k.waar : ['', '']; }
  function onderwerp(a) {
    var k = kamer(a.kamer);
    if (a.raam) return ['вікно ' + k.waar[0], 'het raam ' + k.waar[1], 'o'];
    if (a.deur) return ['вхідні двері', 'de voordeur', 'mv'];
    if (a.soort === 'garagedeur' || a.soort === 'poort') return [klein(a.naam[0]), lidwoord(a.naam[1]), 'mv'];
    return [klein(a.naam[0]), lidwoord(a.naam[1]), 'o'];
  }
  var GROOTHEID = { vocht: ['вологість', 'de luchtvochtigheid', '%'], temperatuur: ['температура', 'de temperatuur', '°C'], co2: ['CO₂', 'het CO₂', 'ppm'], lichtsterkte: ['освітленість', 'de lichtsterkte', 'lux'] };
  function duurZin(min) { return HV.duur(min); }

  var WANNEER = {
    tijd: { icoon: 'clock', naam: ['Час', 'Tijd'], zin: function (x) { var d = dagenTekst(x.dagen); return ['о ' + uurTekst(x.uur) + ' ' + d[0], 'het ' + uurTekst(x.uur) + ' is (' + d[1] + ')']; } },
    zon: { icoon: 'sunset', naam: ['Сонце', 'Zon'], zin: function (x) {
      var op = x.wat === 'op', m = Math.abs(x.min || 0);
      if (!x.min) return op ? ['сонце сходить', 'de zon opkomt'] : ['сонце сідає', 'de zon ondergaat'];
      return x.min < 0 ? ['за ' + duurZin(m) + (op ? ' до сходу сонця' : ' до заходу сонця'), 'het ' + duurZin(m) + (op ? ' voor zonsopkomst is' : ' voor zonsondergang is')]
        : ['через ' + duurZin(m) + (op ? ' після сходу сонця' : ' після заходу сонця'), 'het ' + duurZin(m) + (op ? ' na zonsopkomst is' : ' na zonsondergang is')];
    } },
    beweging: { icoon: 'radar', naam: ['Рух', 'Beweging'], zin: function (x) { var w = waarVan(x.doel); return ['рух ' + w[0], 'er beweging is ' + w[1]]; } },
    stil: { icoon: 'circle-slash', naam: ['Не сталося', 'Bleef uit'], zin: function (x) { var w = waarVan(x.doel); return [w[0] + ' немає руху ' + duurZin(x.min), 'er ' + duurZin(x.min) + ' geen beweging is ' + w[1]]; } },
    open: { icoon: 'door-open', naam: ['Відчинено', 'Open'], zin: function (x) { var a = app(x.doel), s = onderwerp(a); return [s[0] + (s[2] === 'mv' ? ' відчинені' : ' відчинене') + ' понад ' + duurZin(x.min), s[1] + ' langer dan ' + duurZin(x.min) + ' open staat']; } },
    drempel: { icoon: 'gauge', naam: ['Поріг', 'Drempel'], zin: function (x) { var a = app(x.doel), g = GROOTHEID[a.soort] || ['значення', 'de waarde', ''], w = waarVan(x.doel); return [g[0] + ' ' + w[0] + ' понад ' + HV.getal(x.boven) + ' ' + g[2], g[1] + ' ' + w[1] + ' boven ' + HV.getal(x.boven) + ' ' + g[2] + ' komt']; } },
    aanwezig: { icoon: 'user-round-check', naam: ['Присутність', 'Aanwezigheid'], zin: function (x) {
      if (x.wie === 'iedereen') return x.komt ? ['усі вдома', 'iedereen thuis is'] : ['усі пішли з дому', 'iedereen vertrokken is'];
      if (x.wie === 'iemand') return x.komt ? ['хтось приходить додому', 'er iemand thuiskomt'] : ['хтось іде з дому', 'er iemand vertrekt'];
      var n = mensNaam(x.wie); return x.komt ? [n[0] + ' приходить додому', n[1] + ' thuiskomt'] : [n[0] + ' йде з дому', n[1] + ' vertrekt'];
    } },
    prijs: { icoon: 'euro', naam: ['Ціна енергії', 'Energieprijs'], zin: function (x) { return ['ціна падає нижче ' + HV.euro(x.onder), 'de prijs onder ' + HV.euro(x.onder) + ' zakt']; } },
    knop: { icoon: 'circle-dot', naam: ['Кнопка', 'Knop'], zin: function (x) { var w = waarVan(x.doel); return ['натиснуто кнопку сцен ' + w[0], 'de scèneknop ' + w[1] + ' wordt ingedrukt']; } },
    stand: { icoon: 'house', naam: ['Режим дому', 'Huisstand'], zin: function (x) { var s = HV.huisstanden[x.stand]; return ['дім переходить у режим «' + s[0] + '»', 'het huis naar de stand ‘' + s[1] + '’ gaat']; } }
  };
  var ALS = {
    donker: { icoon: 'moon', naam: ['Темно', 'Donker'], zin: function () { return ['темно', 'het donker is']; } },
    stand: { icoon: 'house', naam: ['Режим дому', 'Huisstand'], zin: function (x) { var s = HV.huisstanden[x.stand]; return ['режим «' + s[0] + '»', 'de stand ‘' + s[1] + '’ is']; } },
    dicht: { icoon: 'door-closed', naam: ['Зачинено', 'Dicht'], zin: function (x) { var s = onderwerp(app(x.doel)); return [s[0] + (s[2] === 'mv' ? ' зачинені' : ' зачинене'), s[1] + ' dicht is']; } },
    open: { icoon: 'door-open', naam: ['Відчинено', 'Open'], zin: function (x) { var s = onderwerp(app(x.doel)); return [s[0] + (s[2] === 'mv' ? ' відчинені' : ' відчинене'), s[1] + ' open staat']; } },
    aanwezig: { icoon: 'users', naam: ['Присутність', 'Aanwezigheid'], zin: function (x) { return x.wie === 'niemand' ? ['удома нікого', 'er niemand thuis is'] : ['хтось удома', 'er iemand thuis is']; } },
    weer: { icoon: 'cloud-rain', naam: ['Погода', 'Weer'], zin: function () { return ['дощу не обіцяють', 'er geen regen wordt verwacht']; } },
    venster: { icoon: 'clock', naam: ['Проміжок часу', 'Tijdvak'], zin: function (x) { return ['між ' + uurTekst(x.van) + ' і ' + uurTekst(x.tot), 'het tussen ' + uurTekst(x.van) + ' en ' + uurTekst(x.tot) + ' is']; } },
    prijs: { icoon: 'euro', naam: ['Ціна енергії', 'Energieprijs'], zin: function (x) { return ['ціна нижча за ' + HV.euro(x.onder), 'de prijs lager is dan ' + HV.euro(x.onder)]; } },
    temp: { icoon: 'thermometer', naam: ['Температура', 'Temperatuur'], zin: function (x) { var w = waarVan(x.doel); return [w[0] + ' не холодніше ' + HV.getal(x.boven) + ' °C', 'het ' + w[1] + ' minstens ' + HV.getal(x.boven) + ' °C is']; } },
    alarm: { icoon: 'shield', naam: ['Охорона', 'Alarm'], zin: function () { return ['охорону знято', 'het alarm uit staat']; } },
    aangesloten: { icoon: 'plug-zap', naam: ['Авто під’єднане', 'Auto aangesloten'], zin: function () { return ['авто під’єднане', 'de auto is aangesloten']; } }
  };
  function apparaatZin(s) {
    var a = app(s.doel);
    if (!a) return ['пристрій видалено', 'apparaat verwijderd'];
    var n0 = klein(a.naam[0]), n1 = lidwoord(a.naam[1]), v = s.waarde;
    switch (s.mogelijkheid) {
      case 'aan': return v ? ['увімкнути ' + n0, n1 + ' aanzetten'] : ['вимкнути ' + n0, n1 + ' uitzetten'];
      case 'helderheid': return [n0 + ' на ' + v + ' %', n1 + ' op ' + v + ' %'];
      case 'positie': return v === 0 ? ['закрити ' + n0, n1 + ' sluiten'] : v === 100 ? ['відкрити ' + n0, n1 + ' openen'] : [n0 + ' на ' + v + ' %', n1 + ' op ' + v + ' %'];
      case 'doel': return [n0 + ' на ' + HV.getal(v, 1) + ' °C', n1 + ' op ' + HV.getal(v, 1) + ' °C'];
      case 'stand': return Number(v) === 0 ? ['вимкнути ' + n0, n1 + ' uitzetten'] : [n0 + ': швидкість ' + v, n1 + ': stand ' + v];
      case 'vergrendeld': return v ? ['замкнути вхідні двері', 'de voordeur vergrendelen'] : ['відімкнути вхідні двері', 'de voordeur ontgrendelen'];
      case 'open': return v ? ['відчинити ' + n0, n1 + ' openen'] : ['зачинити ' + n0, n1 + ' sluiten'];
      case 'laden': return v ? ['почати зарядку авто', 'de auto gaan laden'] : ['зупинити зарядку', 'het laden stoppen'];
      case 'afspelen': return v ? ['увімкнути музику: ' + n0, 'muziek aan: ' + klein(a.naam[1])] : ['зупинити музику: ' + n0, 'muziek uit: ' + klein(a.naam[1])];
      default: var b = HV.beschrijf(a, s.mogelijkheid, v); return [n0 + ': ' + b[0], n1 + ': ' + b[1]];
    }
  }
  var MELD_WIE = { olena: ['Олену', 'Olena'], taras: ['Тараса', 'Taras'], thuis: ['тих, хто вдома', 'wie thuis is'], iedereen: ['усіх дорослих', 'alle volwassenen'] };
  var DAN = {
    apparaat: { icoon: null, naam: ['Дія над пристроєм', 'Actie op een apparaat'], zin: apparaatZin },
    wacht: { icoon: 'timer', naam: ['Чекати', 'Wachten'], zin: function (x) {
      if (x.grens == null) return ['чекати без межі', 'wachten zonder grens'];
      return x.zonder ? ['чекати ' + duurZin(x.min) + ' без руху', duurZin(x.min) + ' wachten zonder beweging'] : ['чекати ' + duurZin(x.min), duurZin(x.min) + ' wachten'];
    } },
    scene: { icoon: 'sparkles', naam: ['Сцена', 'Scène'], zin: function (x) { var s = sceneVan(x.scene); return s ? ['сцена «' + s.naam[0] + '»', 'scène ‘' + s.naam[1] + '’'] : ['сцену видалено', 'scène verwijderd']; } },
    stand: { icoon: 'house', naam: ['Режим дому', 'Huisstand'], zin: function (x) { var s = HV.huisstanden[x.stand]; return ['режим «' + s[0] + '»', 'stand ‘' + s[1] + '’']; } },
    melding: { icoon: 'bell', naam: ['Сповіщення', 'Melding'], zin: function (x) { var m = MELD_WIE[x.wie] || MELD_WIE.thuis; return ['сповістити ' + m[0], m[1] + ' een melding sturen']; } },
    kamerdoel: { icoon: 'thermometer', naam: ['Температура кімнати', 'Kamertemperatuur'], zin: function (x) { var k = kamer(x.kamer); return ['ціль ' + k.waar[0] + ' — ' + HV.getal(x.waarde, 1) + ' °C', 'doel ' + k.waar[1] + ' op ' + HV.getal(x.waarde, 1) + ' °C']; } }
  };
  function icoonVanStap(sectie, s) {
    if (sectie === 'dan' && s.soort === 'apparaat') { var a = app(s.doel); return a ? HV.paspoort.soorten[a.soort].icoon : 'circle-help'; }
    var lijst = sectie === 'wanneer' ? WANNEER : sectie === 'als' ? ALS : DAN;
    return (lijst[s.soort] && lijst[s.soort].icoon) || 'circle-help';
  }
  // Нідерландський заголовок кроку — іменна група замість підрядного речення («Beweging in de hal», не «Er beweging is…»).
  var KOP_NL = {
    wanneer: {
      tijd: function (x) { return 'Om ' + uurTekst(x.uur) + ', ' + dagenTekst(x.dagen)[1]; },
      zon: function (x) { var m = Math.abs(x.min || 0), op = x.wat === 'op'; return !x.min ? (op ? 'Zonsopkomst' : 'Zonsondergang') : HV.duur(m) + (x.min < 0 ? ' voor ' : ' na ') + (op ? 'zonsopkomst' : 'zonsondergang'); },
      beweging: function (x) { return 'Beweging ' + waarVan(x.doel)[1]; },
      stil: function (x) { return HV.duur(x.min) + ' geen beweging ' + waarVan(x.doel)[1]; },
      open: function (x) { var o2 = onderwerp(app(x.doel)); return groot(o2[1].replace(/^(de|het) /, '')) + ' langer dan ' + HV.duur(x.min) + ' open'; },
      drempel: function (x) { var a = app(x.doel), g = GROOTHEID[a.soort] || ['', 'waarde', '']; return groot(g[1].replace(/^(de|het) /, '')) + ' ' + waarVan(x.doel)[1] + ' boven ' + HV.getal(x.boven) + ' ' + g[2]; },
      aanwezig: function (x) { if (x.wie === 'iedereen') return x.komt ? 'Iedereen thuis' : 'Iedereen vertrokken'; if (x.wie === 'iemand') return x.komt ? 'Iemand komt thuis' : 'Iemand vertrekt'; return mensNaam(x.wie)[1] + (x.komt ? ' komt thuis' : ' vertrekt'); },
      prijs: function (x) { return 'Prijs onder ' + HV.euro(x.onder); },
      knop: function (x) { return 'Scèneknop ' + waarVan(x.doel)[1]; },
      stand: function (x) { return 'Huis gaat naar ‘' + HV.huisstanden[x.stand][1] + '’'; }
    },
    als: {
      donker: function () { return 'Donker'; },
      stand: function (x) { return 'Stand ‘' + HV.huisstanden[x.stand][1] + '’'; },
      dicht: function (x) { return groot(onderwerp(app(x.doel))[1].replace(/^(de|het) /, '')) + ' dicht'; },
      open: function (x) { return groot(onderwerp(app(x.doel))[1].replace(/^(de|het) /, '')) + ' open'; },
      aanwezig: function (x) { return x.wie === 'niemand' ? 'Niemand thuis' : 'Iemand thuis'; },
      weer: function () { return 'Geen regen verwacht'; },
      venster: function (x) { return 'Tussen ' + uurTekst(x.van) + ' en ' + uurTekst(x.tot); },
      prijs: function (x) { return 'Prijs lager dan ' + HV.euro(x.onder); },
      temp: function (x) { return 'Minstens ' + HV.getal(x.boven) + ' °C ' + waarVan(x.doel)[1]; },
      alarm: function () { return 'Alarm uit'; },
      aangesloten: function () { return 'Auto aangesloten'; }
    }
  };
  /** Заголовок кроку в редакторі: [uk, nl]. */
  function kopVan(sectie, s) {
    var z = zinVan(sectie, s), f = KOP_NL[sectie] && KOP_NL[sectie][s.soort];
    return [groot(z[0]), f ? f(s) : groot(z[1])];
  }
  function zinVan(sectie, s) { var lijst = sectie === 'wanneer' ? WANNEER : sectie === 'als' ? ALS : DAN; return lijst[s.soort] ? lijst[s.soort].zin(s) : ['невідомий крок', 'onbekende stap']; }
  function naamVanStap(sectie, s) {
    if (sectie === 'dan' && s.soort === 'apparaat') { var a = app(s.doel); return a ? a.naam : ['Пристрій', 'Apparaat']; }
    var lijst = sectie === 'wanneer' ? WANNEER : sectie === 'als' ? ALS : DAN;
    return lijst[s.soort] ? lijst[s.soort].naam : ['Крок', 'Stap'];
  }

  /** Речення-переказ правила: [uk, nl]. */
  function regelZin(r) {
    var v = werkVan(r);
    var W = v.wanneer.map(function (x) { return zinVan('wanneer', x); });
    var A = v.als.lijst.map(function (x) { return zinVan('als', x); });
    var D = v.dan.map(function (x) { return zinVan('dan', x); });
    var sam = function (lijst, i, sep) { return lijst.map(function (x) { return x[i]; }).join(sep); };
    var asep = v.als.wijze === 'een' ? [' або ', ' of '] : [' і ', ' en '];
    var apre = v.als.wijze === 'geen' ? ['жодне з: ', 'geen van: '] : ['', ''];
    var leeg = ['…', '…'];
    return [
      'Коли ' + (W.length ? sam(W, 0, ' або ') : leeg[0]) + (A.length ? ', якщо ' + apre[0] + sam(A, 0, asep[0]) : '') + ', тоді ' + (D.length ? sam(D, 0, ', ') : leeg[0]) + '.',
      'Wanneer ' + (W.length ? sam(W, 1, ' of ') : leeg[1]) + (A.length ? ', als ' + apre[1] + sam(A, 1, asep[1]) : '') + ', dan ' + (D.length ? sam(D, 1, ', ') : leeg[1]) + '.'
    ];
  }

  // ───────────────────────── Zaad: правила, послідовності, рецепти ─────────────────────────
  var ALLE_STANDEN = STANDEN.slice();
  function maakRegel(p) {
    return {
      id: p.id, naam: p.naam, icoon: p.icoon, kamer: p.kamer, fase: p.fase || 'aan', uit: !!p.uit, pauze: null, quarantaine: !!p.quarantaine,
      namens: p.namens || 'olena', versie: p.versie || 1, maker: p.maker || mensMaker(p.namens || 'olena'),
      wanneer: p.wanneer, als: p.als || { wijze: 'alle', lijst: [] }, dan: p.dan,
      opties: p.opties || { nietVaker: 1, stabiel: 0, naUitval: 'inhalen' }, standen: p.standen || ALLE_STANDEN.slice(),
      laatst: null, runs: [], versies: [], treffers: p.treffers || 0, loopt: null, werk: null, fouten: 0, geschiedenis: p.geschiedenis || []
    };
  }
  function zaaiRegels() {
    return [
      maakRegel({ id: 'nachtlicht', naam: ['Нічне світло в передпокої', 'Nachtlicht in de hal'], icoon: 'lamp-ceiling', kamer: 'hal', namens: 'taras', versie: 7,
        wanneer: [{ soort: 'beweging', doel: 'beweginghal' }],
        als: { wijze: 'alle', lijst: [{ soort: 'donker' }, { soort: 'stand', stand: 'nacht' }, { soort: 'dicht', doel: 'voordeurcontact' }] },
        dan: [{ soort: 'apparaat', doel: 'hallicht', mogelijkheid: 'aan', waarde: true, fout: 'herhalen' }, { soort: 'wacht', min: 2, grens: 2, zonder: true }, { soort: 'apparaat', doel: 'hallicht', mogelijkheid: 'aan', waarde: false, fout: 'doorgaan' }],
        opties: { nietVaker: 1, stabiel: 0, naUitval: 'overslaan' }, standen: ['nacht', 'gasten'],
        geschiedenis: [
          { wie: 'taras', dagen: 3, wat: ['Очікування 3 → 2 хв', 'Wachttijd 3 → 2 min'], terug: function (s) { s.dan[1].min = 3; s.dan[1].grens = 3; } },
          { wie: 'olena', dagen: 9, wat: ['Додано умову «вхідні двері зачинені»', 'Voorwaarde ‘de voordeur dicht is’ toegevoegd'], terug: function (s) { s.als.lijst.pop(); } },
          { wie: 'claude', dagen: 15, wat: ['Пропозиція агента: «Повторити» у разі помилки; прийняв Тарас', 'Voorstel van de agent: ‘Herhalen’ bij een fout; aanvaard door Taras'], terug: function (s) { s.dan[0].fout = 'doorgaan'; } },
          { wie: 'taras', dagen: 21, wat: ['Лише в режимах «Ніч» і «Гості»', 'Alleen in de standen ‘Nacht’ en ‘Gasten’'], terug: function () {} },
          { wie: 'taras', dagen: 26, wat: ['Умова «темно» замість «після 22:00»', 'Voorwaarde ‘donker’ in plaats van ‘na 22:00’'], terug: function (s) { s.als.lijst[0] = { soort: 'venster', van: 22, tot: 7 }; } },
          { wie: 'taras', dagen: 34, wat: ['Очікування 5 → 3 хв', 'Wachttijd 5 → 3 min'], terug: function (s) { s.dan[1].min = 5; s.dan[1].grens = 5; } }
        ] }),
      maakRegel({ id: 'avondlicht', naam: ['Вечірнє світло', 'Avondlicht'], icoon: 'sunset', kamer: 'woonkamer', namens: 'olena', versie: 4,
        wanneer: [{ soort: 'zon', wat: 'onder', min: -15 }],
        als: { wijze: 'alle', lijst: [{ soort: 'aanwezig', wie: 'iemand' }] },
        dan: [{ soort: 'apparaat', doel: 'torsher', mogelijkheid: 'helderheid', waarde: 55, fout: 'doorgaan' }, { soort: 'apparaat', doel: 'ledstrip', mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }, { soort: 'apparaat', doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 0, fout: 'doorgaan' }],
        standen: ['thuis', 'gasten'],
        geschiedenis: [
          { wie: 'olena', dagen: 6, wat: ['Додано: закрити штори', 'Toegevoegd: gordijnen sluiten'], terug: function (s) { s.dan.pop(); } },
          { wie: 'olena', dagen: 18, wat: ['Зсув 0 → −15 хв', 'Verschuiving 0 → −15 min'], terug: function (s) { s.wanneer[0].min = 0; } },
          { wie: 'olena', dagen: 40, wat: ['Торшер 70 → 55 %', 'Staande lamp 70 → 55 %'], terug: function (s) { s.dan[0].waarde = 70; } }
        ] }),
      maakRegel({ id: 'ochtend', naam: ['Ранок у будні', 'Doordeweekse ochtend'], icoon: 'sunrise', kamer: 'keuken', namens: 'olena', versie: 3,
        wanneer: [{ soort: 'tijd', uur: 6.5, dagen: [1, 2, 3, 4, 5] }],
        als: { wijze: 'alle', lijst: [{ soort: 'aanwezig', wie: 'iemand' }] },
        dan: [{ soort: 'scene', scene: 'ochtend', fout: 'doorgaan' }, { soort: 'stand', stand: 'thuis', fout: 'doorgaan' }],
        standen: ['thuis', 'nacht', 'gasten'],
        geschiedenis: [
          { wie: 'olena', dagen: 12, wat: ['Додано: режим «Вдома»', 'Toegevoegd: stand ‘Thuis’'], terug: function (s) { s.dan.pop(); } },
          { wie: 'taras', dagen: 30, wat: ['Час 06:45 → 06:30', 'Tijd 06:45 → 06:30'], terug: function (s) { s.wanneer[0].uur = 6.75; } }
        ] }),
      maakRegel({ id: 'raamverwarming', naam: ['Вікно й опалення', 'Raam en verwarming'], icoon: 'door-open', kamer: 'slaapkamer', namens: 'olena', versie: 2, fase: 'meekijken', treffers: 14,
        wanneer: [{ soort: 'open', doel: 'raamslaap', min: 10 }],
        als: { wijze: 'alle', lijst: [{ soort: 'aanwezig', wie: 'iemand' }] },
        dan: [{ soort: 'kamerdoel', kamer: 'slaapkamer', waarde: 15, fout: 'doorgaan' }, { soort: 'melding', wie: 'thuis', fout: 'doorgaan' }],
        geschiedenis: [{ wie: 'olena', dagen: 7, wat: ['Переведено в «Спостереження»', 'Naar ‘Meekijken’ gezet'], terug: function () {} }] }),
      maakRegel({ id: 'douche', naam: ['Вентиляція після душу', 'Ventileren na het douchen'], icoon: 'fan', kamer: 'badkamer', namens: 'olena', versie: 5,
        wanneer: [{ soort: 'drempel', doel: 'vochtbad', boven: 70 }],
        dan: [{ soort: 'apparaat', doel: 'ventilatie', mogelijkheid: 'stand', waarde: 3, fout: 'herhalen' }, { soort: 'wacht', min: 15, grens: 15 }, { soort: 'apparaat', doel: 'ventilatie', mogelijkheid: 'stand', waarde: 2, fout: 'doorgaan' }],
        opties: { nietVaker: 30, stabiel: 60, naUitval: 'inhalen' },
        geschiedenis: [
          { wie: 'olena', dagen: 4, wat: ['«Стабільно протягом» 0 → 60 с', '‘Stabiel gedurende’ 0 → 60 s'], terug: function (s) { s.opties.stabiel = 0; } },
          { wie: 'taras', dagen: 11, wat: ['Поріг 75 → 70 %', 'Drempel 75 → 70 %'], terug: function (s) { s.wanneer[0].boven = 75; } }
        ] }),
      maakRegel({ id: 'beregening', naam: ['Полив за прогнозом', 'Beregenen op de verwachting'], icoon: 'sprout', kamer: 'tuin', namens: 'olena', versie: 1, fase: 'concept', maker: AGENT('claude'),
        wanneer: [{ soort: 'tijd', uur: 6, dagen: [1, 2, 3, 4, 5, 6, 7] }],
        als: { wijze: 'alle', lijst: [{ soort: 'weer' }] },
        dan: [{ soort: 'apparaat', doel: 'beregening', mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }, { soort: 'wacht', min: 20, grens: 20 }, { soort: 'apparaat', doel: 'beregening', mogelijkheid: 'aan', waarde: false, fout: 'herhalen' }] }),
      maakRegel({ id: 'garagenacht', naam: ['Гараж на ніч', 'Garage voor de nacht'], icoon: 'warehouse', kamer: 'garage', namens: 'olena', versie: 2,
        wanneer: [{ soort: 'tijd', uur: 22, dagen: [1, 2, 3, 4, 5, 6, 7] }],
        als: { wijze: 'alle', lijst: [{ soort: 'open', doel: 'garagedeur' }] },
        dan: [{ soort: 'apparaat', doel: 'garagedeur', mogelijkheid: 'open', waarde: false, fout: 'doorgaan' }, { soort: 'melding', wie: 'olena', fout: 'doorgaan' }],
        geschiedenis: [{ wie: 'olena', dagen: 5, wat: ['Дозвіл кроку: «Питати»', 'Toestemming van de stap: ‘Vragen’'], terug: function () {} }] }),
      maakRegel({ id: 'thuiskomst', naam: ['Прихід додому', 'Thuiskomen'], icoon: 'door-open', kamer: 'hal', namens: 'olena', versie: 3,
        wanneer: [{ soort: 'aanwezig', wie: 'olena', komt: true }],
        als: { wijze: 'alle', lijst: [{ soort: 'alarm' }] },
        dan: [{ soort: 'apparaat', doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: false, fout: 'doorgaan' }, { soort: 'apparaat', doel: 'hallicht', mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }],
        geschiedenis: [
          { wie: 'olena', dagen: 2, wat: ['Додано: відімкнути вхідні двері', 'Toegevoegd: de voordeur ontgrendelen'], terug: function (s) { s.dan.shift(); } },
          { wie: 'olena', dagen: 20, wat: ['Умова «охорону знято»', 'Voorwaarde ‘het alarm uit staat’'], terug: function (s) { s.als.lijst = []; } }
        ] }),
      maakRegel({ id: 'goedkoopladen', naam: ['Дешева зарядка', 'Goedkoop laden'], icoon: 'plug-zap', kamer: 'garage', namens: 'taras', versie: 6,
        wanneer: [{ soort: 'prijs', onder: 0.2 }],
        als: { wijze: 'alle', lijst: [{ soort: 'aangesloten' }, { soort: 'venster', van: 22, tot: 7 }] },
        dan: [{ soort: 'apparaat', doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, fout: 'herhalen' }],
        opties: { nietVaker: 60, stabiel: 0, naUitval: 'inhalen' } }),
      maakRegel({ id: 'zolderlicht', naam: ['Горище: світло о 23:00', 'Zolder: licht om 23:00'], icoon: 'lightbulb', kamer: 'zolder', namens: 'taras', versie: 2, quarantaine: true,
        wanneer: [{ soort: 'tijd', uur: 23, dagen: [1, 2, 3, 4, 5, 6, 7] }],
        als: { wijze: 'alle', lijst: [{ soort: 'temp', doel: 'tempzolder', boven: 10 }] },
        dan: [{ soort: 'apparaat', doel: 'zolderlicht', mogelijkheid: 'aan', waarde: false, fout: 'herhalen' }] })
    ];
  }

  /** Історичні запуски (детерміновано): до 30 днів, «Перебіг» показує 20 останніх. */
  function zaaiRuns(r, w, X) {
    var nu = w.tijd, rnd = (r.id.length * 7919) % 97;
    var kans = function (i) { rnd = (rnd * 31 + i * 17 + 11) % 101; return rnd / 101; };
    var moment = function (k) {
      var tr = r.wanneer[0], d0 = dagBegin(nu) - k * DAG;
      if (tr.soort === 'tijd') return d0 + tr.uur * UUR;
      if (tr.soort === 'zon') { var z = zon(d0); return d0 + ((tr.wat === 'op' ? z.op : z.onder) * UUR) + (tr.min || 0) * MIN; }
      var uren = { beweging: 23.3, drempel: 7.4, aanwezig: 17.1, prijs: 1.9, open: 9.2 }[tr.soort] || 12;
      return d0 + (uren + kans(k) * 1.4 - 0.7) * UUR;
    };
    if (r.fase === 'concept') return;
    for (var k = 0; k < 26; k++) {
      var m = moment(k);
      if (m >= nu - 5 * MIN) continue;
      var uitkomst = 'gedaan';
      var p = kans(k);
      if (r.id === 'zolderlicht') uitkomst = k < 3 ? 'fout' : 'gedaan';
      else if (r.id === 'thuiskomst') uitkomst = 'deels';
      else if (r.fase === 'meekijken') uitkomst = 'meekijken';
      else if (p < 0.18) uitkomst = 'onwaar';
      var run = maakRun(r, m, k % 9 === 4 ? 'handmatig' : 'schema', uitkomst, X);
      r.runs.push(run);
    }
    r.runs.sort(function (a, b) { return b.tijd - a.tijd; });
    if (r.runs[0]) r.laatst = r.runs[0].tijd;
    if (r.id === 'zolderlicht') r.fouten = 3;
  }
  function maakRun(r, tijd, bron, uitkomst, X) {
    var v = werkVan(r);
    var vw = v.als.lijst.map(function (c, i) { return { tekst: kopVan('als', c), staat: uitkomst === 'onwaar' && i === v.als.lijst.length - 1 ? 'onwaar' : 'waar' }; });
    var stappen = uitkomst === 'onwaar' ? [] : v.dan.map(function (s) {
      var u = uitkomst === 'meekijken' ? 'meekijken' : 'gedaan';
      if (uitkomst === 'fout') u = 'fout';
      if (uitkomst === 'deels' && s.soort === 'apparaat' && s.mogelijkheid === 'vergrendeld') u = 'overgeslagen';
      return { tekst: zinVan('dan', s), uitkomst: u, waarde: s.soort === 'apparaat' && app(s.doel) ? HV.beschrijf(app(s.doel), s.mogelijkheid, s.waarde) : null, reden: u === 'overgeslagen' ? ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'] : u === 'fout' ? ['пристрій недоступний', 'apparaat niet bereikbaar'] : null };
    });
    return { id: 'run' + (++X.teller), tijd: tijd, bron: bron, versie: r.versie, uitkomst: uitkomst, aanleiding: r.wanneer[0] ? kopVan('wanneer', r.wanneer[0]) : ['вручну', 'handmatig'], voorwaarden: vw, stappen: stappen };
  }
  function zaaiVersies(r, w) {
    var snap = momentopname(r), nr = r.versie, tijd = w.tijd - 2 * DAG;
    var lijst = [{ nr: nr, tijd: tijd, maker: r.maker.soort === 'agent' ? r.maker : mensMaker(r.namens), wat: r.versie === 1 ? ['Створено', 'Aangemaakt'] : ['Поточна версія', 'Huidige versie'], snap: kopie(snap) }];
    (r.geschiedenis || []).forEach(function (g, i) {
      if (nr <= 1) return;
      lijst[lijst.length - 1].wat = g.wat;
      lijst[lijst.length - 1].maker = g.wie === 'claude' ? AGENT('claude') : mensMaker(g.wie);
      lijst[lijst.length - 1].tijd = w.tijd - g.dagen * DAG - (i * 37) * MIN;
      g.terug(snap);
      nr--;
      lijst.push({ nr: nr, tijd: w.tijd - (g.dagen + 4 + i * 3) * DAG, maker: mensMaker(r.namens), wat: nr === 1 ? ['Створено', 'Aangemaakt'] : ['Зміни без опису', 'Wijzigingen zonder omschrijving'], snap: kopie(snap) });
    });
    while (nr > 1) { nr--; lijst.push({ nr: nr, tijd: w.tijd - (60 + nr * 5) * DAG, maker: mensMaker(r.namens), wat: nr === 1 ? ['Створено', 'Aangemaakt'] : ['Зміни без опису', 'Wijzigingen zonder omschrijving'], snap: kopie(snap) }); }
    r.versies = lijst;
    delete r.geschiedenis;
  }
  function momentopname(r) { return kopie({ naam: r.naam, wanneer: r.wanneer, als: r.als, dan: r.dan, opties: r.opties, standen: r.standen }); }

  var REEKSEN = [
    { id: 'kino', naam: ['Кіновечір', 'Filmavond'], icoon: 'clapperboard', velden: [{ id: 'volume', naam: ['Гучність', 'Volume'], min: 10, max: 60, stap: 5, standaard: 25, eenheid: ['%', '%'] }],
      stappen: function (v) { return [{ soort: 'scene', scene: 'film' }, { soort: 'apparaat', doel: 'tv', mogelijkheid: 'volume', waarde: v.volume }]; } },
    { id: 'luchten', naam: ['Провітрити дім', 'Het huis luchten'], icoon: 'wind', velden: [{ id: 'duur', naam: ['Тривалість', 'Duur'], min: 5, max: 60, stap: 5, standaard: 15, eenheid: ['хв', 'min'] }],
      stappen: function (v) { return [{ soort: 'apparaat', doel: 'ventilatie', mogelijkheid: 'stand', waarde: 3 }, { soort: 'wacht', min: v.duur, grens: v.duur }, { soort: 'apparaat', doel: 'ventilatie', mogelijkheid: 'stand', waarde: 2 }]; } },
    { id: 'vertrekken', naam: ['Виходимо з дому', 'We gaan de deur uit'], icoon: 'log-out', velden: [],
      stappen: function () { return [{ soort: 'apparaat', doel: 'woongroep', mogelijkheid: 'aan', waarde: false }, { soort: 'apparaat', doel: 'tv', mogelijkheid: 'aan', waarde: false }, { soort: 'stand', stand: 'afwezig' }]; } }
  ];
  var RECEPTEN = [
    { id: 'beweging', icoon: 'radar', naam: ['Світло за рухом', 'Licht bij beweging'], vragen: [
      { id: 'kamer', naam: ['Де?', 'Waar?'], opties: [['hal', ['Передпокій', 'Hal']], ['keuken', ['Кухня', 'Keuken']], ['badkamer', ['Ванна', 'Badkamer']]] },
      { id: 'duur', naam: ['Скільки світити?', 'Hoe lang aan?'], opties: [['2', ['2 хв', '2 min']], ['5', ['5 хв', '5 min']], ['10', ['10 хв', '10 min']]] },
      { id: 'donker', naam: ['Лише коли темно?', 'Alleen als het donker is?'], opties: [['ja', ['Так', 'Ja']], ['nee', ['Завжди', 'Altijd']]] }],
      bouw: function (k) { var lamp = { hal: 'hallicht', keuken: 'aanrechtlicht', badkamer: 'badlicht' }[k.kamer]; var sensor = 'beweginghal'; return { wanneer: [{ soort: 'beweging', doel: sensor }], als: { wijze: 'alle', lijst: k.donker === 'ja' ? [{ soort: 'donker' }] : [] }, dan: [{ soort: 'apparaat', doel: lamp, mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }, { soort: 'wacht', min: Number(k.duur), grens: Number(k.duur), zonder: true }, { soort: 'apparaat', doel: lamp, mogelijkheid: 'aan', waarde: false, fout: 'doorgaan' }] }; } },
    { id: 'zonsondergang', icoon: 'sunset', naam: ['Світло із заходом сонця', 'Licht bij zonsondergang'], vragen: [
      { id: 'min', naam: ['Коли?', 'Wanneer?'], opties: [['-30', ['за 30 хв до', '30 min ervoor']], ['0', ['із заходом', 'bij ondergang']], ['15', ['через 15 хв', '15 min erna']]] },
      { id: 'thuis', naam: ['Лише якщо хтось удома?', 'Alleen als er iemand thuis is?'], opties: [['ja', ['Так', 'Ja']], ['nee', ['Завжди', 'Altijd']]] }],
      bouw: function (k) { return { wanneer: [{ soort: 'zon', wat: 'onder', min: Number(k.min) }], als: { wijze: 'alle', lijst: k.thuis === 'ja' ? [{ soort: 'aanwezig', wie: 'iemand' }] : [] }, dan: [{ soort: 'apparaat', doel: 'torsher', mogelijkheid: 'helderheid', waarde: 60, fout: 'doorgaan' }, { soort: 'apparaat', doel: 'tuinlicht', mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }] }; } },
    { id: 'raam', icoon: 'door-open', naam: ['Нагадати про відчинене вікно', 'Herinnering bij een open raam'], vragen: [
      { id: 'doel', naam: ['Яке вікно?', 'Welk raam?'], opties: [['raamslaap', ['Спальня', 'Slaapkamer']], ['raamkinder', ['Дитяча', 'Kinderkamer']]] },
      { id: 'min', naam: ['Через скільки?', 'Na hoe lang?'], opties: [['10', ['10 хв', '10 min']], ['20', ['20 хв', '20 min']], ['30', ['30 хв', '30 min']]] }],
      bouw: function (k) { return { wanneer: [{ soort: 'open', doel: k.doel, min: Number(k.min) }], als: { wijze: 'alle', lijst: [] }, dan: [{ soort: 'melding', wie: 'thuis', fout: 'doorgaan' }] }; } },
    { id: 'laden', icoon: 'plug-zap', naam: ['Дешева зарядка', 'Goedkoop laden'], vragen: [
      { id: 'onder', naam: ['Ціна нижча за', 'Prijs lager dan'], opties: [['0.15', ['€ 0,15', '€ 0,15']], ['0.2', ['€ 0,20', '€ 0,20']], ['0.25', ['€ 0,25', '€ 0,25']]] }],
      bouw: function (k) { return { wanneer: [{ soort: 'prijs', onder: Number(k.onder) }], als: { wijze: 'alle', lijst: [{ soort: 'aangesloten' }] }, dan: [{ soort: 'apparaat', doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, fout: 'herhalen' }] }; } },
    { id: 'vocht', icoon: 'droplets', naam: ['Вентиляція за вологістю', 'Ventileren op vochtigheid'], vragen: [
      { id: 'boven', naam: ['Поріг вологості', 'Drempel'], opties: [['65', ['65 %', '65 %']], ['70', ['70 %', '70 %']], ['80', ['80 %', '80 %']]] }],
      bouw: function (k) { return { wanneer: [{ soort: 'drempel', doel: 'vochtbad', boven: Number(k.boven) }], als: { wijze: 'alle', lijst: [] }, dan: [{ soort: 'apparaat', doel: 'ventilatie', mogelijkheid: 'stand', waarde: 3, fout: 'doorgaan' }, { soort: 'wacht', min: 15, grens: 15 }, { soort: 'apparaat', doel: 'ventilatie', mogelijkheid: 'stand', waarde: 2, fout: 'doorgaan' }] }; } },
    { id: 'aanwezig', icoon: 'moon-star', naam: ['Імітація присутності', 'Aanwezigheid nabootsen'], vragen: [
      { id: 'uur', naam: ['Світло до', 'Licht tot'], opties: [['22.5', ['22:30', '22:30']], ['23', ['23:00', '23:00']], ['23.5', ['23:30', '23:30']]] }],
      bouw: function (k) { return { wanneer: [{ soort: 'zon', wat: 'onder', min: 10 }], als: { wijze: 'alle', lijst: [{ soort: 'aanwezig', wie: 'niemand' }] }, dan: [{ soort: 'apparaat', doel: 'torsher', mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }, { soort: 'wacht', min: Math.round((Number(k.uur) - 17.2) * 60), grens: Math.round((Number(k.uur) - 17.2) * 60) }, { soort: 'apparaat', doel: 'torsher', mogelijkheid: 'aan', waarde: false, fout: 'doorgaan' }], standen: ['afwezig', 'vakantie'] }; } }
  ];
  var BEGRENZINGEN = [
    { id: 'boiler', icoon: 'droplet', naam: ['Бойлер не гарячіше 65 °C', 'Boiler niet heter dan 65 °C'], sub: ['перевіряється на виході до пристрою', 'gecontroleerd vlak voor het apparaat'], aan: true },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Ціль кімнат 15–24 °C', 'Kamerdoel 15–24 °C'], sub: ['правила й агенти не виходять за межі', 'regels en agenten blijven binnen de grenzen'], aan: true },
    { id: 'volume', icoon: 'speaker', naam: ['Після 22:00 гучність до 30 %', 'Na 22:00 volume tot 30 %'], sub: ['стосується автоматики, не людей', 'geldt voor automatiseringen, niet voor mensen'], aan: true },
    { id: 'maaier', icoon: 'trees', naam: ['Косарка лише 09:00–20:00', 'Maaier alleen 09:00–20:00'], sub: ['поза вікном запуск спиняється', 'buiten het venster wordt de start gestopt'], aan: false }
  ];
  var OVERGANGEN = [
    { id: 'weg', icoon: 'log-out', aan: true, min: 10, naar: 'afwezig' },
    { id: 'thuis', icoon: 'log-in', aan: true, naar: 'thuis' },
    { id: 'nacht', icoon: 'bed-double', aan: true, uur: 23, naar: 'nacht' },
    { id: 'ochtend', icoon: 'sunrise', aan: true, uur: 7, naar: 'thuis' }
  ];
  function overgangZin(g) {
    if (g.id === 'weg') return ['Усі пішли → через ' + HV.duur(g.min) + ' «Не вдома»', 'Iedereen weg → na ' + HV.duur(g.min) + ' ‘Afwezig’'];
    if (g.id === 'thuis') return ['Перший удома → «Вдома»', 'De eerste thuis → ‘Thuis’'];
    if (g.id === 'nacht') return [uurTekst(g.uur) + ', якщо хтось удома → «Ніч»', uurTekst(g.uur) + ', als er iemand thuis is → ‘Nacht’'];
    return [uurTekst(g.uur) + ' після «Ніч» → «Вдома»', uurTekst(g.uur) + ' na ‘Nacht’ → ‘Thuis’'];
  }

  /** Розширення світу для автоматики: створюється раз на світ (сценарій симулятора починає з чистого паспорта). */
  function A(w) {
    w = w || HV.staat.w;
    if (!w) return null;
    if (w.auto) return w.auto;
    var X = { teller: 0, regels: [], lopend: [], overslaan: {}, vast: null, wachtOvergang: null, vakantie: null, gastenTot: null,
      begrenzingen: kopie(BEGRENZINGEN), overgangen: kopie(OVERGANGEN), feestZondag: true, vakantieWeekend: true, afvalHerinnering: true,
      dagdeel: { ochtend: 'ochtend', middag: null, avond: 'avond', nacht: 'welterusten' }, dagdeelLaatst: null,
      voorstellen: [], gestopt: [], sceneHandmatig: {} };
    w.auto = X;
    X.regels = zaaiRegels();
    X.regels.forEach(function (r) { zaaiVersies(r, w); zaaiRuns(r, w, X); });
    // демо-дім: власник раніше дав правилам дозвіл «Завжди» на їхні звичайні кроки; «Гараж на ніч» — «Питати»,
    // відмикання дверей у «Прихід додому» лишилося «Вимкнено» (типово) — правило працює неповно.
    X.regels.forEach(function (r) {
      if (r.fase === 'concept') return;
      r.dan.forEach(function (s) {
        var a = actieVan(s);
        if (!a || a.sleutel === 'onbekend') return;
        if (HV.gevaar.isZwaar(a)) return;
        var u = 'regel-' + r.id;
        if (HV.gevaar.stand(u, a.sleutel) !== 'uit') return;
        HV.gevaar.zetStandStil(u, a.sleutel, r.id === 'garagenacht' && a.sleutel === 'ingang.sluiten' ? 'vragen' : 'altijd');
      });
    });
    if (HV.gevaar.stand('overgangen', 'huis.stand') === 'uit') HV.gevaar.zetStandStil('overgangen', 'huis.stand', 'altijd');
    // «Зараз виконується»: душ закінчився 9 хв тому — вентиляція ще працює на 3
    var douche = regel('douche', X);
    if (douche) startTaak({ regel: douche, bron: 'schema', aanleiding: ['вологість у ванній 74 % о ' + HV.tijd(w.tijd - 9 * MIN), 'luchtvochtigheid in de badkamer 74 % om ' + HV.tijd(w.tijd - 9 * MIN)], stil: true, sinds: w.tijd - 9 * MIN, voorgedaan: 1, X: X, w: w });
    X.voorstellen = [
      { id: 'v-avond', soort: 'wijziging', regel: 'avondlicht', maker: AGENT('claude'), tijd: w.tijd - 95 * MIN,
        wat: ['Вмикати світло на 15 хв раніше: за прогнозом хмарно', 'Het licht 15 min eerder aan: de verwachting is bewolkt'],
        pas: function (s) { s.wanneer[0].min = -30; } },
      { id: 'v-werk', soort: 'gewoonte', maker: { soort: 'systeem', naam: ['Звички дому', 'Gewoonten van het huis'] }, tijd: w.tijd - 3 * UUR,
        wat: ['Ви вимикаєте настільну лампу о 18:10 у будні — 5 із 5 днів', 'Je zet de bureaulamp om 18:10 uit op werkdagen — 5 van 5 dagen'] }
    ];
    return X;
  }
  function regel(id, X) { X = X || (HV.staat.w && HV.staat.w.auto) || A(); if (!X) return null; for (var i = 0; i < X.regels.length; i++) if (X.regels[i].id === id) return X.regels[i]; return null; }
  function werkVan(r) { return r.werk || r; }
  function actieVan(s) {
    if (s.soort === 'apparaat') { var a = app(s.doel); return a ? HV.gevaar.vind(a, s.mogelijkheid, s.waarde) : null; }
    if (s.soort === 'scene') return HV.gevaar.vind('scene:' + s.scene, 'start', true);
    if (s.soort === 'stand') return HV.gevaar.vind('huis', 'stand', s.stand);
    if (s.soort === 'kamerdoel') return HV.gevaar.vind('kamer:' + s.kamer, 'doel', s.waarde);
    return null;
  }

  // ───────────────────────── Evaluatie ─────────────────────────
  function wereld(stel) {
    var w = HV.staat.w; stel = stel || {};
    return { w: w, tijd: stel.tijd != null ? stel.tijd : w.tijd, stand: stel.stand || w.huisstand, thuis: stel.thuis != null ? stel.thuis : HV.kijk.thuis().length };
  }
  var oud = function (a) { return !a || a.beschikbaar === 'onbereikbaar' || a.beschikbaar === 'verouderd'; };
  /** Умова зараз: 'waar' | 'onwaar' | 'onbekend' (застаріле — «невідомо», не «хибно»). */
  function toets(c, W) {
    var u = HV.uur(W.tijd), a;
    switch (c.soort) {
      case 'donker': var z = zon(W.tijd); return u < z.op || u >= z.onder ? 'waar' : 'onwaar';
      case 'stand': return W.stand === c.stand ? 'waar' : 'onwaar';
      case 'dicht': a = app(c.doel); if (oud(a)) return 'onbekend'; return !a.st.open ? 'waar' : 'onwaar';
      case 'open': a = app(c.doel); if (oud(a)) return 'onbekend'; return a.st.open ? 'waar' : 'onwaar';
      case 'aanwezig': return (c.wie === 'niemand' ? W.thuis === 0 : W.thuis > 0) ? 'waar' : 'onwaar';
      case 'weer': if (W.w.weer.verouderd) return 'onbekend'; return W.w.weer.neerslag ? 'onwaar' : 'waar';
      case 'venster': return (c.van < c.tot ? u >= c.van && u < c.tot : u >= c.van || u < c.tot) ? 'waar' : 'onwaar';
      case 'prijs': return HV.tarief.prijs(W.tijd) < c.onder ? 'waar' : 'onwaar';
      case 'temp': a = app(c.doel); if (oud(a)) return 'onbekend'; return a.st.waarde >= c.boven ? 'waar' : 'onwaar';
      case 'alarm': a = app('alarm'); return a.st.stand === 'uit' ? 'waar' : 'onwaar';
      case 'aangesloten': return app('laadpaal').st.aangesloten ? 'waar' : 'onwaar';
      default: return 'onbekend';
    }
  }
  /** Загальний висновок умов: { staat, reden (умова, що вирішила) }. */
  function oordeel(r, W) {
    var v = werkVan(r), st = v.als.lijst.map(function (c) { return { c: c, s: toets(c, W) }; });
    var eerste = function (s) { return st.filter(function (x) { return x.s === s; })[0]; };
    if (!st.length) return { staat: 'waar', reden: null };
    if (v.als.wijze === 'een') { if (eerste('waar')) return { staat: 'waar', reden: eerste('waar').c }; if (eerste('onbekend')) return { staat: 'onbekend', reden: eerste('onbekend').c }; return { staat: 'onwaar', reden: st[0].c }; }
    if (v.als.wijze === 'geen') { if (eerste('waar')) return { staat: 'onwaar', reden: eerste('waar').c }; if (eerste('onbekend')) return { staat: 'onbekend', reden: eerste('onbekend').c }; return { staat: 'waar', reden: null }; }
    if (eerste('onwaar')) return { staat: 'onwaar', reden: eerste('onwaar').c };
    if (eerste('onbekend')) return { staat: 'onbekend', reden: eerste('onbekend').c };
    return { staat: 'waar', reden: null };
  }
  var WAARHEID = { waar: ['істинно', 'waar'], onwaar: ['хибно', 'niet waar'], onbekend: ['невідомо', 'onbekend'] };
  function waarheidChip(s) { return '<span class="hv-waarheid is-' + s + '"><span class="hv-waarheid__teken" aria-hidden="true"></span>' + h(HV.p(WAARHEID[s])) + '</span>'; }
  function oordeelZin(r, W) {
    var o2 = oordeel(r, W);
    if (o2.staat === 'waar') return { staat: 'waar', tekst: t('Зараз спрацювала б: так — усі умови виконано', 'Zou nu afgaan: ja — alle voorwaarden kloppen') };
    var z = zinVan('als', o2.reden);
    if (o2.staat === 'onbekend') return { staat: 'onbekend', tekst: t('Зараз спрацювала б: невідомо — немає свіжих даних: ', 'Zou nu afgaan: onbekend — geen verse gegevens: ') + HV.p(z) };
    return { staat: 'onwaar', tekst: t('Зараз спрацювала б: ні — хибна умова: ', 'Zou nu afgaan: nee — deze voorwaarde klopt niet: ') + HV.p(z) };
  }

  // ───────────────────────── Logische toestand (чип hv-chip--logica) ─────────────────────────
  function deelsReden(r) {
    var v = werkVan(r);
    for (var i = 0; i < v.dan.length; i++) {
      var a = actieVan(v.dan[i]);
      if (a && a.sleutel !== 'onbekend' && HV.gevaar.stand('regel-' + r.id, a.sleutel) === 'uit') return zinVan('dan', v.dan[i]);
    }
    return null;
  }
  function logica(r) {
    var w = HV.staat.w;
    if (r.quarantaine) return { id: 'quarantaine', icoon: 'circle-x', toon: 'alarm', tekst: ['на карантині', 'in quarantaine'], sub: ['три збої поспіль', 'drie keer mislukt'] };
    if (r.fase === 'concept') return { id: 'concept', icoon: 'pencil-line', tekst: ['чернетка', 'concept'] };
    if (r.uit) return { id: 'uit', icoon: 'circle-off', tekst: ['вимкнено', 'uit'] };
    if (r.pauze && r.pauze.tot > w.tijd) return { id: 'pauze', icoon: 'pause', tekst: ['призупинено до ' + HV.tijd(r.pauze.tot) + ', ' + r.pauze.wie[0], 'gepauzeerd tot ' + HV.tijd(r.pauze.tot) + ', ' + r.pauze.wie[1]] };
    if (r.fase === 'meekijken') return { id: 'meekijken', icoon: 'eye', tekst: ['спостереження', 'kijkt mee'] };
    if (w.zelfGestopt) return { id: 'gestopt', icoon: 'pause', tekst: ['самостійні дії зупинено', 'zelfstandige acties gestopt'] };
    var d = deelsReden(r);
    if (d) return { id: 'deels', icoon: 'triangle', toon: 'let-op', tekst: ['працює неповно', 'werkt deels'], sub: ['«' + d[0] + '» — дозвіл «Вимкнено»', '‘' + d[1] + '’ — toestemming ‘Uit’'] };
    if (r.loopt) return { id: 'loopt', icoon: 'hourglass', toon: 'rust', tekst: ['виконується', 'bezig'] };
    return { id: 'actief', icoon: 'circle-check', toon: 'rust', tekst: ['працює', 'actief'] };
  }
  function logicaChip(r, metSub) {
    var l = logica(r);
    return o.chip({ icoon: l.icoon, toon: l.toon || null, klas: 'hv-chip--logica is-' + l.id, html: '<span>' + h(HV.p(l.tekst)) + (metSub && l.sub ? ' <span class="hv-chip__sub">· ' + h(HV.p(l.sub)) + '</span>' : '') + '</span>' });
  }
  function zwaarsteNiveau(r) {
    var v = werkVan(r), best = null, rang = { gewoon: 0, gevoelig: 1, gevaarlijk: 2, kritiek: 3 };
    v.dan.forEach(function (s) { var a = actieVan(s); if (a && a.sleutel !== 'onbekend' && (!best || rang[a.niveau] > rang[best])) best = a.niveau; });
    return best;
  }
  function werkt(r) { return logica(r).id === 'actief' || logica(r).id === 'deels' || logica(r).id === 'loopt'; }

  // ───────────────────────── Рушій ─────────────────────────
  /** Запуск правила чи послідовності як «завдання»: кроки по черзі; «Чекати» відкладає решту на час дому. */
  function startTaak(p) {
    var w = p.w || HV.staat.w, X = p.X || A(w), r = p.regel || null;
    var dan = p.dan || werkVan(r).dan;
    var run = r ? maakRunLeeg(r, p, w, X) : null;
    var taak = { id: 'taak' + (++X.teller), regel: r ? r.id : null, reeks: p.reeks || null, naam: r ? r.naam : p.naam, door: r ? door(r) : p.door, dan: kopie(dan), index: 0, tot: null, sinds: p.sinds || w.tijd, run: run, gedaan: [], stil: !!p.stil };
    X.lopend.push(taak);
    if (r) { r.loopt = taak.id; r.runs.unshift(run); r.laatst = taak.sinds; if (r.runs.length > 60) r.runs.length = 60; }
    if (p.voorgedaan) {
      // уже виконані кроки (засів «Зараз виконується»): перший крок пройдено, далі очікування
      for (var i = 0; i < p.voorgedaan; i++) run.stappen.push({ tekst: zinVan('dan', taak.dan[i]), uitkomst: 'gedaan', waarde: null });
      taak.index = p.voorgedaan;
      var s = taak.dan[taak.index];
      if (s && s.soort === 'wacht') { run.stappen.push({ tekst: zinVan('dan', s), uitkomst: 'wacht', waarde: null }); taak.tot = taak.sinds + s.min * MIN; taak.index++; }
      return taak;
    }
    verder(taak);
    return taak;
  }
  function maakRunLeeg(r, p, w, X) {
    var W = wereld();
    return { id: 'run' + (++X.teller), tijd: p.sinds || w.tijd, bron: p.bron, versie: r.versie, uitkomst: 'bezig', aanleiding: p.aanleiding || ['вручну: ' + HV.mens().naam[0], 'handmatig: ' + HV.mens().naam[1]],
      voorwaarden: werkVan(r).als.lijst.map(function (c) { return { tekst: kopVan('als', c), staat: toets(c, W) }; }), stappen: [] };
  }
  function vindTaak(id) { var X = A(); for (var i = 0; i < X.lopend.length; i++) if (X.lopend[i].id === id) return X.lopend[i]; return null; }
  function verder(taak) {
    var w = HV.staat.w, X = A(w);
    if (X.lopend.indexOf(taak) < 0) return;
    if (taak.index >= taak.dan.length) { klaar(taak); return; }
    var s = taak.dan[taak.index];
    if (s.soort === 'wacht') {
      if (taak.run) taak.run.stappen.push({ tekst: zinVan('dan', s), uitkomst: 'wacht', waarde: null });
      taak.tot = w.tijd + (s.grens == null ? 60 : s.min) * MIN;
      taak.index++;
      HV.staat.wijzig();
      return;
    }
    doeStap(taak, s).then(function (res) {
      if (taak.run) taak.run.stappen.push({ tekst: zinVan('dan', s), uitkomst: res.uitkomst, waarde: res.waarde || null, reden: res.reden || null });
      if (res.terug) taak.gedaan.push(res.terug);
      taak.index++;
      if (res.uitkomst === 'fout' && s.fout === 'herhalen' && !res.herhaald) {
        // «У разі помилки: повторити» — одна повторна спроба
        taak.index--;
        s.fout = 'doorgaan';
      }
      verder(taak);
    });
  }
  function doeStap(taak, s) {
    var waarom = taak.regel ? ['правило «' + taak.naam[0] + '»', 'regel ‘' + taak.naam[1] + '’'] : ['послідовність «' + taak.naam[0] + '»', 'reeks ‘' + taak.naam[1] + '’'];
    var mens = taak.door.soort === 'mens';
    var map = function (r) {
      if (r && r.ok) return 'gedaan';
      if (!r) return 'fout';
      if (r.reden === 'stand-uit') return 'overgeslagen';
      if (r.reden === 'wacht') return 'gevraagd';
      if (r.reden === 'gestopt') return 'gestopt';
      if (r.reden === 'geannuleerd' || r.reden === 'rol') return 'overgeslagen';
      return 'fout';
    };
    var REDEN = { overgeslagen: ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'], gevraagd: ['чекає на схвалення', 'wacht op goedkeuring'], gestopt: ['самостійні дії зупинено', 'zelfstandige acties gestopt'], fout: ['не виконано', 'niet uitgevoerd'] };
    if (s.soort === 'apparaat') {
      var a = app(s.doel);
      if (!a) return Promise.resolve({ uitkomst: 'fout', reden: ['пристрій видалено', 'apparaat verwijderd'] });
      var was = HV.huidige(a, s.mogelijkheid);
      return HV.doe({ doel: s.doel, mogelijkheid: s.mogelijkheid, waarde: s.waarde, door: taak.door, stil: true, waarom: waarom }).then(function (r) {
        var u = map(r);
        return { uitkomst: u, waarde: HV.beschrijf(a, s.mogelijkheid, s.waarde), reden: u === 'gedaan' ? null : (a.beschikbaar === 'onbereikbaar' ? ['пристрій недоступний', 'apparaat niet bereikbaar'] : REDEN[u]),
          terug: u === 'gedaan' && was !== undefined ? function () { return HV.doe({ doel: s.doel, mogelijkheid: s.mogelijkheid, waarde: was, door: HV.mens(), stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); } : null };
      });
    }
    if (s.soort === 'kamerdoel') {
      var k = kamer(s.kamer), oudDoel = k.doel;
      return HV.doe({ doel: 'kamer:' + s.kamer, mogelijkheid: 'doel', waarde: s.waarde, door: taak.door, stil: true, waarom: waarom }).then(function (r) {
        var u = map(r);
        return { uitkomst: u, waarde: [HV.getal(s.waarde, 1) + ' °C', HV.getal(s.waarde, 1) + ' °C'], reden: u === 'gedaan' ? null : REDEN[u],
          terug: u === 'gedaan' ? function () { HV.staat.wijzig(function () { k.doel = oudDoel; }); } : null };
      });
    }
    if (s.soort === 'scene') return HV.doe({ doel: 'scene:' + s.scene, mogelijkheid: 'start', waarde: true, door: taak.door, stil: true, waarom: waarom }).then(function (r) { var u = map(r); return { uitkomst: u, reden: u === 'gedaan' ? null : REDEN[u] }; });
    if (s.soort === 'stand') {
      var vorige = HV.staat.w.huisstand;
      return HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: s.stand, door: taak.door, stil: true, waarom: waarom }).then(function (r) {
        var u = map(r);
        return { uitkomst: u, waarde: HV.huisstanden[s.stand], reden: u === 'gedaan' ? null : REDEN[u], terug: u === 'gedaan' ? function () { HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: vorige, door: HV.mens(), stil: true, zonderRitueel: true }); } : null };
      });
    }
    if (s.soort === 'melding') {
      var wie = MELD_WIE[s.wie] || MELD_WIE.thuis;
      HV.logboek.voegToe({ maker: taak.door, wat: ['Сповіщення для: ' + wie[0], 'Melding voor: ' + wie[1]], waarom: waarom, soort: 'huis.automatisering' });
      if (!mens && !taak.stil) HV.meld({ maker: taak.door, icoon: 'bell', titel: HV.p(taak.naam), tekst: t('Сповіщення надіслано: ', 'Melding verstuurd: ') + HV.p(wie) });
      return Promise.resolve({ uitkomst: 'gedaan' });
    }
    return Promise.resolve({ uitkomst: 'gedaan' });
  }
  function klaar(taak) {
    var w = HV.staat.w, X = A(w);
    X.lopend = X.lopend.filter(function (x) { return x !== taak; });
    var r = taak.regel ? regel(taak.regel, X) : null;
    var run = taak.run;
    var tel = { gedaan: 0, rest: 0 };
    if (run) {
      run.stappen.forEach(function (s) { if (s.uitkomst === 'wacht') s.uitkomst = 'gedaan'; if (s.uitkomst === 'gedaan') tel.gedaan++; else tel.rest++; });
      run.uitkomst = run.stappen.some(function (s) { return s.uitkomst === 'fout'; }) ? 'fout' : tel.rest ? 'deels' : 'gedaan';
    }
    if (r) {
      r.loopt = null;
      if (run.uitkomst === 'fout') { r.fouten++; if (r.fouten >= 3 && !r.quarantaine) { r.quarantaine = true; HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: ['Правило «' + r.naam[0] + '» на карантині', 'Regel ‘' + r.naam[1] + '’ in quarantaine'], waarom: ['три збої поспіль', 'drie keer mislukt'], soort: 'huis.automatisering', gewicht: 'belangrijk' }); } }
      else r.fouten = 0;
    }
    var stappen = taak.dan.filter(function (s) { return s.soort !== 'wacht'; }).length;
    var wat = r ? ['Правило «' + r.naam[0] + '»: виконано ' + tel.gedaan + ' із ' + stappen, 'Regel ‘' + r.naam[1] + '’: ' + tel.gedaan + ' van ' + stappen + ' uitgevoerd']
      : ['Послідовність «' + taak.naam[0] + '»: виконано ' + tel.gedaan + ' із ' + stappen, 'Reeks ‘' + taak.naam[1] + '’: ' + tel.gedaan + ' van ' + stappen + ' uitgevoerd'];
    HV.logboek.voegToe({ maker: taak.door, wat: wat, waarom: run ? run.aanleiding : null, toegestaan: r ? ['дозволи правила, версія ' + r.versie, 'toestemmingen van de regel, versie ' + r.versie] : null, soort: 'huis.automatisering', gewicht: run && run.uitkomst === 'fout' ? 'belangrijk' : 'info' });
    var gedaan = taak.gedaan.slice();
    if (!taak.stil) {
      HV.meld({ maker: taak.door, icoon: 'workflow', gewicht: run && run.uitkomst === 'fout' ? 'belangrijk' : 'info', titel: HV.p(wat),
        tekst: tel.rest ? t('Не виконано чи пропущено кроків: ', 'Niet uitgevoerd of overgeslagen: ') + tel.rest : t('Усі кроки виконано.', 'Alle stappen uitgevoerd.'),
        terug: gedaan.length ? function () {
          gedaan.reverse().forEach(function (f) { f(); });
          HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: ' + wat[0], 'Ongedaan gemaakt: ' + wat[1]], soort: 'huis.automatisering' });
          HV.staat.wijzig();
        } : null, hoe: gedaan.length ? null : t('Як повернути: змініть пристрої вручну.', 'Terugdraaien: zet de apparaten handmatig terug.') });
    }
    HV.staat.wijzig();
  }
  function stopTaak(taak, wie) {
    var X = A();
    X.lopend = X.lopend.filter(function (x) { return x !== taak; });
    var r = taak.regel ? regel(taak.regel) : null;
    if (r) r.loopt = null;
    if (taak.run) { taak.run.uitkomst = 'gestopt'; taak.run.stappen.forEach(function (s) { if (s.uitkomst === 'wacht') s.uitkomst = 'gestopt'; }); }
    HV.logboek.voegToe({ maker: wie || HV.mens(), wat: ['Зупинено: ' + taak.naam[0], 'Gestopt: ' + taak.naam[1]], waarom: ['решту кроків не виконано', 'de rest van de stappen is niet uitgevoerd'], soort: 'huis.automatisering' });
    HV.meld({ maker: wie || HV.mens(), icoon: 'square', titel: t('Зупинено: ', 'Gestopt: ') + HV.p(taak.naam), tekst: t('Решту кроків не виконано.', 'De rest van de stappen is niet uitgevoerd.') });
    HV.staat.wijzig();
  }

  /** Чи може правило спрацювати за розкладом зараз (фаза, вимкнення, пауза, режим дому, карантин, частота). */
  function magDraaien(r, w) {
    if (r.fase === 'concept' || r.uit || r.quarantaine) return false;
    if (r.pauze && r.pauze.tot > w.tijd) return false;
    if (r.standen.indexOf(w.huisstand) < 0) return false;
    if (r.loopt) return false;
    if (r.laatst && r.opties.nietVaker && w.tijd - r.laatst < r.opties.nietVaker * MIN && r.runs[0] && r.runs[0].uitkomst !== 'onwaar' && r.runs[0].bron === 'schema') return false;
    return true;
  }
  function trigger(r, aanleiding, moment) {
    var w = HV.staat.w, X = A(w);
    if (!magDraaien(r, w)) return;
    var sleutel = r.id + '@' + Math.round(moment / MIN);
    if (X.overslaan[sleutel]) {
      delete X.overslaan[sleutel];
      HV.logboek.voegToe({ maker: door(r), wat: ['Пропущено раз: «' + r.naam[0] + '»', 'Eén keer overgeslagen: ‘' + r.naam[1] + '’'], waarom: ['«Пропустити раз» у порядку дня', '‘Eén keer overslaan’ in de dagorde'], soort: 'huis.automatisering' });
      return;
    }
    var W = wereld(), oo = oordeel(r, W);
    if (oo.staat !== 'waar') {
      var run = maakRun(r, w.tijd, 'schema', 'onwaar', X);
      run.voorwaarden = werkVan(r).als.lijst.map(function (c) { return { tekst: kopVan('als', c), staat: toets(c, W) }; });
      run.aanleiding = aanleiding;
      r.runs.unshift(run);
      return;
    }
    if (r.fase === 'meekijken') {
      var m = maakRun(r, w.tijd, 'schema', 'meekijken', X);
      m.aanleiding = aanleiding;
      r.runs.unshift(m); r.treffers++; r.laatst = w.tijd;
      return;
    }
    startTaak({ regel: r, bron: 'schema', aanleiding: aanleiding });
  }
  function triggerMoment(tr, d0) {
    if (tr.soort === 'tijd') return !tr.dagen || tr.dagen.indexOf(weekdag(d0)) >= 0 ? d0 + tr.uur * UUR : null;
    if (tr.soort === 'zon') { var z = zon(d0); return d0 + (tr.wat === 'op' ? z.op : z.onder) * UUR + (tr.min || 0) * MIN; }
    return null;
  }
  /** Стан події запуску на фронт: true / false; null — не подія стану. */
  function signaal(tr, w) {
    var a;
    switch (tr.soort) {
      case 'beweging': a = app(tr.doel); return !!(a && a.st.actief);
      case 'stil': a = app(tr.doel); return !!(a && !a.st.actief && (a.st.laatst || 0) >= tr.min);
      case 'open': a = app(tr.doel); return !!(a && a.st.open && w.tijd - (a.st.sinds || w.tijd) >= tr.min * MIN);
      case 'drempel': a = app(tr.doel); return !!(a && a.beschikbaar !== 'verouderd' && a.st.waarde > tr.boven);
      case 'aanwezig':
        if (tr.wie === 'iedereen') return tr.komt ? w.mensen.filter(function (m) { return !m.gast; }).every(function (m) { return m.thuis; }) : HV.kijk.thuis().length === 0;
        if (tr.wie === 'iemand') return tr.komt ? HV.kijk.thuis().length > 0 : false;
        var m = w.mensen.filter(function (x) { return x.id === tr.wie; })[0];
        return !!m && (tr.komt ? m.thuis : !m.thuis);
      case 'prijs': return HV.tarief.prijs(w.tijd) < tr.onder;
      case 'stand': return w.huisstand === tr.stand;
      default: return null;
    }
  }
  var vorigeWereld = null, vorigeTijd = 0, vorigeSignaal = {}, vorigeThuis = 0, bezig = false;
  function momentSignalen(w, X) {
    var s = {};
    X.regels.forEach(function (r) { r.wanneer.forEach(function (tr, i) { var v = signaal(tr, w); if (v !== null) s[r.id + ':' + i] = v; }); });
    return s;
  }
  function stapRushij(w) {
    if (!w || bezig) return;
    var X = A(w);
    if (w !== vorigeWereld) { vorigeWereld = w; vorigeTijd = w.tijd; vorigeSignaal = momentSignalen(w, X); vorigeThuis = HV.kijk.thuis().length; return; }
    bezig = true;
    try {
      var van = vorigeTijd, tot = w.tijd;
      vorigeTijd = tot;
      // 1. очікування в запущених завданнях
      X.lopend.slice().forEach(function (taak) { if (taak.tot && w.tijd >= taak.tot) { taak.tot = null; verder(taak); } });
      // 2. події запуску за часом і сонцем, що минули між двома кроками (не більше 6 год назад: стрибок сценарію не надолужується)
      if (tot > van && tot - van <= 6 * UUR) {
        X.regels.forEach(function (r) {
          r.wanneer.forEach(function (tr) {
            for (var d0 = dagBegin(van); d0 <= dagBegin(tot); d0 += DAG) {
              var m = triggerMoment(tr, d0);
              if (m != null && m > van && m <= tot) trigger(r, kopVan('wanneer', tr), m);
            }
          });
        });
        // переходи режимів за часом
        X.overgangen.forEach(function (g) {
          if (!g.aan || g.uur == null) return;
          for (var d0 = dagBegin(van); d0 <= dagBegin(tot); d0 += DAG) {
            var m = d0 + g.uur * UUR;
            if (m > van && m <= tot) overgang(g, w, X);
          }
        });
        if (X.wachtOvergang && w.tijd >= X.wachtOvergang.om) { var wo = X.wachtOvergang; X.wachtOvergang = null; if (HV.kijk.thuis().length === 0) overgang(wo.g, w, X); }
      }
      // 3. події запуску за станом: на фронті false → true
      var nu = momentSignalen(w, X);
      X.regels.forEach(function (r) {
        r.wanneer.forEach(function (tr, i) {
          var k = r.id + ':' + i;
          if (nu[k] === true && vorigeSignaal[k] === false) trigger(r, kopVan('wanneer', tr), w.tijd);
        });
      });
      vorigeSignaal = nu;
      // присутність → переходи «Усі пішли» / «Перший удома»
      var thuis = HV.kijk.thuis().length;
      if (thuis === 0 && vorigeThuis > 0) { var g = X.overgangen.filter(function (x) { return x.id === 'weg'; })[0]; if (g && g.aan) X.wachtOvergang = { g: g, om: w.tijd + g.min * MIN }; }
      if (thuis > 0 && vorigeThuis === 0) { X.wachtOvergang = null; var g2 = X.overgangen.filter(function (x) { return x.id === 'thuis'; })[0]; if (g2 && g2.aan && (w.huisstand === 'afwezig' || w.huisstand === 'vakantie')) overgang(g2, w, X); }
      vorigeThuis = thuis;
      // 4. вичерпані паузи й фіксація
      X.regels.forEach(function (r) { if (r.pauze && r.pauze.tot <= w.tijd) { r.pauze = null; HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: ['Пауза минула: «' + r.naam[0] + '»', 'Pauze voorbij: ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' }); } });
      if (X.vast && X.vast.tot <= w.tijd) { X.vast = null; HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: ['Фіксацію режиму знято: строк минув', 'Vastzetten van de stand voorbij'], soort: 'huis.automatisering' }); }
    } finally { bezig = false; }
  }
  function overgang(g, w, X) {
    if (w.huisstand === g.naar) return;
    if (g.id === 'nacht' && HV.kijk.thuis().length === 0) return;
    if (g.id === 'ochtend' && w.huisstand !== 'nacht') return;
    var wie = { soort: 'automatisering', id: 'overgangen', naam: ['Переходи режимів', 'Overgangen van standen'] };
    if (X.vast) { HV.logboek.voegToe({ maker: wie, wat: ['Пропущено: ' + HV.p(overgangZin(g)), 'Overgeslagen: ' + HV.p(overgangZin(g))], waarom: ['режим зафіксовано вручну', 'de stand staat handmatig vast'], soort: 'huis.automatisering' }); return; }
    HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: g.naar, door: wie, waarom: overgangZin(g) });
  }
  HV.staat.abonneer(stapRushij);

  // ───────────────────────── Перевірка перед збереженням ─────────────────────────
  function problemen(r) {
    var v = werkVan(r), uit = [], rol = HV.rol();
    if (!v.wanneer.length) uit.push({ zwaar: true, tekst: ['Немає події запуску: правило не запуститься', 'Geen aanleiding: de regel start nooit'] });
    if (!v.dan.filter(function (s) { return s.soort !== 'wacht'; }).length) uit.push({ zwaar: true, tekst: ['Немає жодної дії', 'Er is geen enkele actie'] });
    v.dan.forEach(function (s, i) {
      var nr = i + 1;
      if (s.soort === 'apparaat') {
        var a = app(s.doel);
        if (!a) { uit.push({ zwaar: true, stap: 'd' + i, tekst: ['Крок ' + nr + ': пристрій видалено', 'Stap ' + nr + ': apparaat verwijderd'] }); return; }
        if (a.beschikbaar === 'onbereikbaar') uit.push({ stap: 'd' + i, tekst: ['Крок ' + nr + ': «' + a.naam[0] + '» недоступний', 'Stap ' + nr + ': ‘' + a.naam[1] + '’ is niet bereikbaar'] });
        var ac = actieVan(s);
        if (ac && !HV.gevaar.rolMag(rol, ac).mag) uit.push({ zwaar: true, recht: true, stap: 'd' + i, tekst: ['Крок ' + nr + ': понад ваші права (' + HV.p(HV.gevaar.niveaus[ac.niveau].naam) + ')', 'Stap ' + nr + ': gaat boven je rechten (' + HV.p(HV.gevaar.niveaus[ac.niveau].naam) + ')'] });
        if (ac && HV.gevaar.stand('regel-' + r.id, ac.sleutel) === 'uit') uit.push({ info: true, stap: 'd' + i, tekst: ['Крок ' + nr + ' пропуститься: дозвіл «Вимкнено»', 'Stap ' + nr + ' wordt overgeslagen: toestemming ‘Uit’'] });
        v.wanneer.forEach(function (tr) { if (tr.doel === s.doel) uit.push({ zwaar: true, stap: 'd' + i, tekst: ['Петля: крок ' + nr + ' змінює власну подію запуску', 'Lus: stap ' + nr + ' verandert de eigen aanleiding'] }); });
      }
      if (s.soort === 'wacht' && s.grens == null) uit.push({ zwaar: true, stap: 'd' + i, tekst: ['Крок ' + nr + ': очікування без межі', 'Stap ' + nr + ': wachten zonder grens'] });
      if (s.soort === 'scene' && !sceneVan(s.scene)) uit.push({ zwaar: true, stap: 'd' + i, tekst: ['Крок ' + nr + ': сцену видалено', 'Stap ' + nr + ': scène verwijderd'] });
    });
    return uit;
  }
  /** Конфлікт: інше ввімкнене правило пише в той самий пристрій інше значення. */
  function conflicten(r) {
    var v = werkVan(r), uit = [];
    A().regels.forEach(function (x) {
      if (x === r || x.fase !== 'aan' || x.uit) return;
      x.dan.forEach(function (s2) {
        v.dan.forEach(function (s) {
          if (s.soort === 'apparaat' && s2.soort === 'apparaat' && s.doel === s2.doel && s.mogelijkheid === s2.mogelijkheid && String(s.waarde) !== String(s2.waarde)) {
            if (!uit.some(function (u) { return u.regel === x.id; })) uit.push({ regel: x.id, tekst: ['«' + x.naam[0] + '»: ' + zinVan('dan', s2)[0], '‘' + x.naam[1] + '’: ' + zinVan('dan', s2)[1]] });
          }
        });
      });
    });
    return uit;
  }

  // ───────────────────────── Wijzigen ─────────────────────────
  function bewerk(r, fn) {
    HV.staat.wijzig(function () { if (!r.werk) r.werk = momentopname(r); fn(r.werk); });
  }
  function opslaan(r, ondanks) {
    var w = HV.staat.w, mens = HV.mens();
    if (!r.werk) return;
    var p = problemen(r).filter(function (x) { return x.zwaar; }), c = conflicten(r);
    if (!ondanks && (p.length || c.length)) { HV.bladOpen('regelopslaan'); return; }
    if (p.some(function (x) { return x.recht; })) {
      HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не збережено', 'Niet opgeslagen'), tekst: t('Чому ні: крок понад ваші права. Що перевірити: роль у «Люди й доступ». Що можна натомість: попросіть власника.', 'Waarom niet: een stap gaat boven je rechten. Wat te controleren: je rol onder ‘Mensen en toegang’. Wat wel kan: vraag het de eigenaar.') });
      return;
    }
    var voor = momentopname(r), voorFase = r.fase, voorVersie = r.versie, voorNamens = r.namens;
    var verschil = vergelijk(voor, r.werk);
    HV.staat.wijzig(function () {
      ['naam', 'wanneer', 'als', 'dan', 'opties', 'standen'].forEach(function (k) { r[k] = r.werk[k]; });
      r.versie++;
      r.versies.unshift({ nr: r.versie, tijd: w.tijd, maker: mens, wat: verschil.length ? [verschil.length + ' ' + HV.meervoud(verschil.length, ['зміна', 'зміни', 'змін'], ['wijziging', 'wijzigingen']), verschil.length + ' ' + (verschil.length === 1 ? 'wijziging' : 'wijzigingen')] : ['Без змін у кроках', 'Geen wijziging in de stappen'], snap: momentopname(r) });
      r.werk = null;
      if (r.fase === 'aan' && mens.id !== r.namens) r.fase = 'meekijken';
    });
    var naarMeekijken = voorFase === 'aan' && r.fase === 'meekijken';
    HV.logboek.voegToe({ maker: mens, wat: ['Правило «' + r.naam[0] + '»: версія ' + r.versie, 'Regel ‘' + r.naam[1] + '’: versie ' + r.versie], was: ['версія ' + voorVersie, 'versie ' + voorVersie], werd: ['версія ' + r.versie + (naarMeekijken ? ', спостереження' : ''), 'versie ' + r.versie + (naarMeekijken ? ', meekijken' : '')], waarom: naarMeekijken ? ['редагує не той, хто ввімкнув', 'bewerkt door iemand anders dan wie aanzette'] : null, soort: 'huis.automatisering' });
    HV.meld({ maker: mens, icoon: 'save', titel: t('Збережено: версія ', 'Opgeslagen: versie ') + r.versie,
      tekst: naarMeekijken ? t('Правило перейшло в «Спостереження»: увімкнути знову має той, від чийого імені воно діє, або власник.', 'De regel staat nu op ‘Meekijken’: weer aanzetten doet wie de regel draagt of de eigenaar.') : HV.p(r.naam),
      terug: function () {
        HV.staat.wijzig(function () { ['naam', 'wanneer', 'als', 'dan', 'opties', 'standen'].forEach(function (k) { r[k] = voor[k]; }); r.versie = voorVersie; r.fase = voorFase; r.namens = voorNamens; r.versies.shift(); });
        HV.logboek.voegToe({ maker: mens, wat: ['Повернуто версію ' + voorVersie + ': «' + r.naam[0] + '»', 'Versie ' + voorVersie + ' teruggezet: ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' });
      } });
    if (HV.route().blad) HV.bladOpen(null);
  }
  /** Порівняння двох знімків за кроками: [{ sectie, soort:'plus'|'min', tekst }]. */
  function vergelijk(a, b) {
    var uit = [];
    [['wanneer', 'wanneer'], ['als', 'als'], ['dan', 'dan']].forEach(function (p) {
      var la = (p[0] === 'als' ? a.als.lijst : a[p[0]]).map(function (x) { return HV.p(zinVan(p[1], x)); });
      var lb = (p[0] === 'als' ? b.als.lijst : b[p[0]]).map(function (x) { return HV.p(zinVan(p[1], x)); });
      la.forEach(function (x) { if (lb.indexOf(x) < 0) uit.push({ sectie: p[0], soort: 'min', tekst: x }); });
      lb.forEach(function (x) { if (la.indexOf(x) < 0) uit.push({ sectie: p[0], soort: 'plus', tekst: x }); });
    });
    if (a.als.wijze !== b.als.wijze) uit.push({ sectie: 'als', soort: 'plus', tekst: HV.p(WIJZE[b.als.wijze]) });
    if (JSON.stringify(a.opties) !== JSON.stringify(b.opties)) uit.push({ sectie: 'opties', soort: 'plus', tekst: t('параметри запуску', 'startinstellingen') });
    if (JSON.stringify(a.standen) !== JSON.stringify(b.standen)) uit.push({ sectie: 'opties', soort: 'plus', tekst: t('режими дому', 'huisstanden') });
    return uit;
  }
  var WIJZE = { alle: ['усі умови', 'alle voorwaarden'], een: ['будь-яка умова', 'een van de voorwaarden'], geen: ['жодна умова', 'geen van de voorwaarden'] };

  function zetFase(r, fase) {
    var mens = HV.mens(), rol = HV.rol();
    if (fase === r.fase) return;
    if (fase === 'aan' && rol !== 'eigenaar' && rol !== 'bewoner') {
      HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не ввімкнено', 'Niet aangezet'), tekst: t('Чому ні: вмикає власник або мешканець. Що можна натомість: залиште правило в «Спостереженні».', 'Waarom niet: aanzetten doet de eigenaar of een bewoner. Wat wel kan: laat de regel op ‘Meekijken’ staan.') });
      return;
    }
    if (r.werk && fase !== 'concept') { HV.meld({ gewicht: 'belangrijk', icoon: 'save', titel: t('Спершу збережіть зміни', 'Sla eerst de wijzigingen op'), tekst: t('Стежка діє для збереженої версії.', 'Het pad geldt voor de opgeslagen versie.') }); return; }
    if (fase !== 'concept' && problemen(r).some(function (x) { return x.zwaar; })) {
      HV.meld({ gewicht: 'belangrijk', icoon: 'circle-x', titel: t('Ще не можна', 'Kan nog niet'), tekst: t('Чому ні: у правилі є проблеми. Що перевірити: картка «Проблеми». Що можна натомість: виправте кроки й спробуйте знову.', 'Waarom niet: de regel heeft problemen. Wat te controleren: de kaart ‘Problemen’. Wat wel kan: herstel de stappen en probeer opnieuw.') });
      return;
    }
    var was = r.fase, wasNamens = r.namens;
    HV.staat.wijzig(function () { r.fase = fase; if (fase === 'aan') { r.namens = mens.id; r.uit = false; } });
    HV.logboek.voegToe({ maker: mens, wat: ['Правило «' + r.naam[0] + '»', 'Regel ‘' + r.naam[1] + '’'], was: FASE[was], werd: FASE[fase], waarom: fase === 'aan' ? ['працює від імені: ' + mens.naam[0], 'werkt namens: ' + mens.naam[1]] : null, soort: 'huis.automatisering' });
    HV.meld({ maker: mens, icoon: fase === 'aan' ? 'circle-check' : fase === 'meekijken' ? 'eye' : 'pencil-line', titel: HV.p(r.naam) + ': ' + HV.p(FASE[fase]), tekst: HV.p(FASE[was]) + ' → ' + HV.p(FASE[fase]),
      terug: function () { HV.staat.wijzig(function () { r.fase = was; r.namens = wasNamens; }); HV.logboek.voegToe({ maker: mens, wat: ['Повернуто: «' + r.naam[0] + '» — ' + FASE[was][0], 'Ongedaan: ‘' + r.naam[1] + '’ — ' + FASE[was][1]], soort: 'huis.automatisering' }); } });
  }

  // ───────────────────────── Onderdelen van deze zone ─────────────────────────
  /** hv-traject: «Чернетка → Спостереження → Увімкнено». */
  function traject(r) {
    var stappen = ['concept', 'meekijken', 'aan'], i = stappen.indexOf(r.fase);
    return '<ol class="hv-traject" aria-label="' + h(t('Стежка правила', 'Pad van de regel')) + '" data-k="traject">' + stappen.map(function (f, n) {
      var staat = n < i ? 'is-voorbij' : n === i ? 'is-nu' : '';
      return '<li class="hv-traject__stap ' + staat + '"><button type="button" class="hv-traject__knop" aria-current="' + (n === i ? 'step' : 'false') + '" data-actie="regel-fase" data-regel="' + h(r.id) + '" data-waarde="' + f + '">' +
        '<span class="hv-traject__punt" aria-hidden="true">' + (n < i ? HV.icoon('check', { maat: 's' }) : HV.icoon(f === 'concept' ? 'pencil-line' : f === 'meekijken' ? 'eye' : 'circle-check', { maat: 's' })) + '</span><span class="hv-traject__naam">' + h(HV.p(FASE[f])) + '</span></button></li>';
    }).join('') + '</ol>';
  }
  /** hv-doel: ціль кроку з кімнатою й складом. */
  function doelChip(sectie, s) {
    var id = s.doel, a = id ? app(id) : null, tekst = null;
    if (a) {
      var k = kamer(a.kamer);
      tekst = HV.p(k.naam) + ' · ' + (a.leden ? a.leden.length + ' ' + t('пристрої', 'apparaten') : HV.p(HV.paspoort.soorten[a.soort].naam).toLowerCase());
    } else if (s.kamer) tekst = HV.p(kamer(s.kamer).naam);
    else if (s.soort === 'scene') { var sc = sceneVan(s.scene); tekst = sc ? sc.stappen.length + ' ' + t('кроків', 'stappen') : null; }
    return tekst ? '<span class="hv-doel">' + HV.icoon('map-pin', { maat: 'maker' }) + '<span>' + h(tekst) + '</span></span>' : '';
  }
  function makerRegel(r) {
    return r.maker.soort === 'agent' ? o.maker(r.maker) : o.maker(mensMaker(r.namens));
  }

  /** Рядок правила hv-regel: коло, чип стану, речення, останній запуск, знак автора. */
  function regelRij(r) {
    var w = HV.staat.w, l = logica(r);
    var kanSchakelen = r.fase !== 'concept' && !r.quarantaine;
    var niveau = zwaarsteNiveau(r);
    var schakel = o.schakel({ aan: !r.uit && kanSchakelen && l.id !== 'pauze', icoon: r.icoon, toon: 'neutraal', actie: kanSchakelen ? 'regel-schakel' : null, gegevens: { regel: r.id }, aria: HV.p(r.naam) + ': ' + (r.uit ? t('вимкнено', 'uit') : t('увімкнено', 'aan')), staat: r.loopt ? 'bezig' : null });
    var laatst = r.laatst ? t('останній запуск ', 'laatst ') + wanneerTekst(r.laatst, w.tijd) : t('ще не запускалося', 'nog niet gestart');
    return '<article class="hv-regel is-' + l.id + '" data-k="regel-' + h(r.id) + '"><span class="hv-regel__schakel">' + schakel + '</span>' +
      '<button type="button" class="hv-regel__lijf" data-actie="ga" data-naar="automatiseringen-regel-' + h(r.id) + '">' +
      '<span class="hv-regel__kop"><span class="hv-regel__naam">' + h(HV.p(r.naam)) + '</span>' + logicaChip(r) + '</span>' +
      '<span class="hv-regel__zin">' + h(HV.p(regelZin(r))) + '</span>' +
      '<span class="hv-regel__meta">' + makerRegel(r) + '<span class="hv-punt" aria-hidden="true">·</span><span>' + h(laatst) + '</span>' +
      (r.fase === 'meekijken' ? '<span class="hv-punt" aria-hidden="true">·</span><span>' + h(t('спрацювала б ', 'zou zijn afgegaan: ') + r.treffers + t(' разів за 7 днів', ' keer in 7 dagen')) + '</span>' : '') +
      (niveau && (niveau === 'gevaarlijk' || niveau === 'kritiek') ? '<span class="hv-punt" aria-hidden="true">·</span>' + o.risico(niveau) : '') + '</span></button>' +
      HV.icoon('chevron-right', { maat: 's', klas: 'hv-regel__pijl' }) + '</article>';
  }

  // ───────────────────────── Сторінка «Правила» ─────────────────────────
  var FILTERS = [['alle', ['Усі', 'Alle']], ['werkt', ['Працюють', 'Actief']], ['meekijken', ['Спостереження', 'Meekijken']], ['concept', ['Чернетки', 'Concepten']], ['problemen', ['З проблемами', 'Met problemen']]];
  function pastFilter(r, f, m, k) {
    var l = logica(r).id;
    if (f === 'werkt' && !(l === 'actief' || l === 'deels' || l === 'loopt')) return false;
    if (f === 'meekijken' && r.fase !== 'meekijken') return false;
    if (f === 'concept' && r.fase !== 'concept') return false;
    if (f === 'problemen' && !(l === 'quarantaine' || l === 'deels' || problemen(r).some(function (p) { return !p.info; }))) return false;
    if (m === 'mens' && r.maker.soort === 'agent') return false;
    if (m === 'agent' && r.maker.soort !== 'agent') return false;
    if (k && k !== 'alle' && r.kamer !== k) return false;
    return true;
  }

  function regelsPagina(ctx) {
    var w = ctx.staat, X = A(w);
    var f = HV.ui.lees('aut-filter', 'alle'), m = HV.ui.lees('aut-maker', 'alle'), kf = HV.ui.lees('aut-kamer', 'alle');
    var werkend = X.regels.filter(werkt).length, kijk = X.regels.filter(function (r) { return r.fase === 'meekijken'; }).length, concept = X.regels.filter(function (r) { return r.fase === 'concept'; }).length;
    var vandaag = 0; X.regels.forEach(function (r) { r.runs.forEach(function (x) { if (x.tijd >= dagBegin(w.tijd) && x.uitkomst !== 'onwaar') vandaag++; }); });
    var volgende = volgendeRuns(w, X, 1)[0];

    var held = '<section class="hv-aut-held" data-k="aut-held"><div class="hv-aut-held__tekst">' +
      '<p class="hv-aut-held__zin">' + h(werkend + ' ' + HV.meervoud(werkend, ['правило працює', 'правила працюють', 'правил працюють'], ['regel is actief', 'regels zijn actief'])) +
      (volgende ? h(t('. Далі — «', '. Hierna: ‘') + HV.p(volgende.naam) + t('» о ', '’ om ') + HV.tijd(volgende.tijd) + '.') : '.') + '</p>' +
      '<p class="hv-aut-held__sub">' + h(t('Кожна дія правила — запис у Журналі зі знаком автоматизації; дозволи кожного правила — окремо.', 'Elke actie van een regel komt in het logboek met het teken van de automatisering; elke regel heeft eigen toestemmingen.')) + '</p></div>' +
      '<div class="hv-aut-held__getallen">' + o.getal({ maat: 'm', label: t('працюють', 'actief'), waarde: String(werkend) }) + o.getal({ maat: 'm', label: t('спостереження', 'meekijken'), waarde: String(kijk) }) + o.getal({ maat: 'm', label: t('чернетки', 'concepten'), waarde: String(concept) }) + o.getal({ maat: 'm', label: t('запусків сьогодні', 'starts vandaag'), waarde: String(vandaag) }) + '</div>' +
      '<div class="hv-aut-held__knoppen">' + o.knop({ tekst: t('Нове правило', 'Nieuwe regel'), icoon: 'plus', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'regelnieuw' } }) +
      o.knop({ tekst: t('Призупинити до…', 'Pauzeren tot…'), icoon: 'pause', actie: 'blad', gegevens: { blad: 'regelpauze' } }) + '</div></section>';

    // «Зараз виконується»
    var loopt = X.lopend.map(function (taak) {
      var rest = taak.tot ? Math.max(0, (taak.tot - w.tijd) / MIN) : null;
      var s = taak.dan[Math.max(0, taak.index - 1)];
      return '<div class="hv-aut-loopt" data-k="loopt-' + h(taak.id) + '">' + (rest != null ? o.aftel({ rest: rest, totaal: (s && s.min) || 15, icoon: 'hourglass', toon: 'neutraal' }) : o.schakel({ aan: true, icoon: 'workflow', toon: 'neutraal', staat: 'bezig' })) +
        '<div class="hv-aut-loopt__tekst"><p class="hv-aut-loopt__naam">' + h(HV.p(taak.naam)) + '</p><p class="hv-aut-loopt__sub">' + h(t('крок ', 'stap ') + Math.min(taak.index, taak.dan.length) + t(' із ', ' van ') + taak.dan.length + (s ? ' · ' + HV.p(zinVan('dan', s)) : '')) + '</p></div>' +
        '<div class="hv-aut-loopt__knoppen">' + (taak.tot ? o.knop({ tekst: t('Далі без очікування', 'Verder zonder wachten'), icoon: 'skip-forward', klein: true, actie: 'taak-verder', gegevens: { taak: taak.id } }) : '') + o.knop({ tekst: t('Зупинити', 'Stoppen'), icoon: 'square', klein: true, actie: 'taak-stop', gegevens: { taak: taak.id } }) + '</div></div>';
    }).join('');
    var looptBlok = o.blok({ id: 'aut-loopt', titel: t('Зараз виконується', 'Loopt nu'), teller: X.lopend.length || null, inhoud: loopt ? '<div class="hv-kaart hv-aut-looptlijst">' + loopt + '</div>' : '' });

    // «Несправні»
    var stuk = X.regels.filter(function (r) { var l = logica(r).id; return l === 'quarantaine' || l === 'deels'; });
    var stukBlok = o.blok({ id: 'aut-stuk', titel: t('Несправні', 'Met problemen'), teller: stuk.length || null, inhoud: stuk.length ? '<div class="hv-kaart hv-aut-stuk">' + stuk.map(function (r) {
      var l = logica(r);
      var knop = l.id === 'quarantaine' ? o.knop({ tekst: t('Зняти карантин', 'Uit quarantaine'), klein: true, actie: 'regel-quarantaine', gegevens: { regel: r.id } }) : o.knop({ tekst: t('Дозволи', 'Toestemmingen'), klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen-regel-' + r.id } });
      var waarom = l.id === 'quarantaine' ? t('Три запуски поспіль не виконано: «Світло на горищі» недоступне. Що перевірити: живлення лампи.', 'Drie starts op rij niet uitgevoerd: ‘Zolderlamp’ is niet bereikbaar. Wat te controleren: de stroom van de lamp.') : HV.p(l.sub);
      return '<div class="hv-aut-stuk__rij" data-k="stuk-' + h(r.id) + '"><span class="hv-aut-stuk__teken hv-toon-' + (l.toon || 'let-op') + '">' + HV.icoon(l.icoon) + '</span><div class="hv-aut-stuk__tekst"><p class="hv-aut-stuk__naam">' + h(HV.p(r.naam)) + ' ' + logicaChip(r) + '</p><p class="hv-aut-stuk__sub">' + h(waarom) + '</p></div>' + knop + '</div>';
    }).join('') + '</div>' : '' });

    // «Пропозиції»
    var voorstellen = X.voorstellen.slice(0, 3).map(function (v) {
      var r = v.regel ? regel(v.regel) : null;
      return '<div class="hv-aut-voorstel" data-k="vs-' + h(v.id) + '"><div class="hv-aut-voorstel__kop">' + o.maker(v.maker) + '<span class="hv-aut-voorstel__tijd">' + h(wanneerTekst(v.tijd, w.tijd)) + '</span></div>' +
        '<p class="hv-aut-voorstel__wat">' + h(HV.p(v.wat)) + '</p>' + (r ? '<p class="hv-aut-voorstel__sub">' + h(t('Правило «', 'Regel ‘') + HV.p(r.naam) + t('» · стане чернеткою; увімкнена версія ', '’ · wordt een concept; de actieve versie ') + r.versie + t(' працює далі', ' blijft werken')) + '</p>' : '') +
        '<div class="hv-knoppen">' + (v.soort === 'wijziging' ? o.knop({ tekst: t('Переглянути зміни', 'Wijzigingen bekijken'), icoon: 'git-compare', klein: true, actie: 'voorstel-bekijk', gegevens: { voorstel: v.id } }) : o.knop({ tekst: t('Створити чернетку', 'Concept maken'), icoon: 'pencil-line', klein: true, actie: 'voorstel-gewoonte', gegevens: { voorstel: v.id } })) +
        o.knop({ tekst: t('Відхилити', 'Afwijzen'), soort: 'stil', klein: true, actie: 'voorstel-weg', gegevens: { voorstel: v.id } }) + '</div></div>';
    }).join('');
    var voorstelBlok = o.blok({ id: 'aut-voorstellen', titel: t('Пропозиції', 'Voorstellen'), teller: X.voorstellen.length || null, inhoud: voorstellen ? '<div class="hv-aut-voorstellen">' + voorstellen + '</div>' : '',
      uitleg: t('Що станеться: пропозиція агента чи звички стає чернеткою з порівнянням. Пов’язано з: увімкнена версія правила працює далі. Як повернути: «Відхилити» чи видалити чернетку.', 'Wat er gebeurt: een voorstel van een agent of een gewoonte wordt een concept met vergelijking. Hangt samen met: de actieve versie van de regel blijft werken. Terugdraaien: ‘Afwijzen’ of het concept verwijderen.') });

    // фільтри й список
    var kamers = []; X.regels.forEach(function (r) { if (kamers.indexOf(r.kamer) < 0) kamers.push(r.kamer); });
    var filters = '<div class="hv-aut-filters" data-k="aut-filters">' +
      o.segment({ label: t('Стан', 'Toestand'), waarde: f, actie: 'ui', gegevens: { naam: 'aut-filter' }, klas: 'hv-segment--rol', k: 'aut-f', opties: FILTERS.map(function (x) { return { id: x[0], label: HV.p(x[1]) }; }) }) +
      o.segment({ label: t('Автор', 'Maker'), waarde: m, actie: 'ui', gegevens: { naam: 'aut-maker' }, klas: 'hv-segment--rol', k: 'aut-m', opties: [{ id: 'alle', label: t('Усі автори', 'Alle makers') }, { id: 'mens', label: t('Люди', 'Mensen'), icoon: 'user' }, { id: 'agent', label: t('Агенти', 'Agenten'), icoon: 'bot' }] }) +
      o.segment({ label: t('Кімната', 'Kamer'), waarde: kf, actie: 'ui', gegevens: { naam: 'aut-kamer' }, klas: 'hv-segment--rol', k: 'aut-k', opties: [{ id: 'alle', label: t('Усі кімнати', 'Alle kamers') }].concat(kamers.map(function (k) { return { id: k, label: HV.p(kamer(k).naam) }; })) }) + '</div>';
    var lijst = X.regels.filter(function (r) { return pastFilter(r, f, m, kf); });
    var lijstHtml = lijst.length ? '<div class="hv-regels">' + lijst.map(regelRij).join('') + '</div>'
      : o.leeg({ icoon: 'filter', titel: t('За цим фільтром нічого немає', 'Niets gevonden met dit filter'), actie: { tekst: t('Скинути фільтр', 'Filter wissen'), actie: 'aut-filter-wis' } });
    var lijstBlok = o.blok({ id: 'aut-lijst', titel: t('Правила', 'Regels'), teller: lijst.length + ' / ' + X.regels.length, vast: true, inhoud: filters + lijstHtml });

    var reeksen = o.blok({ id: 'aut-reeksen', titel: t('Послідовності', 'Reeksen'), teller: REEKSEN.length,
      uitleg: t('Що станеться: послідовність виконує кроки «Тоді» без «Коли» — від імені того, хто запускає. Пов’язано з: рівень — як у найнебезпечнішого кроку. Як повернути: «Повернути» у сповіщенні.', 'Wat er gebeurt: een reeks voert de ‘Dan’-stappen uit zonder ‘Wanneer’ — namens wie start. Hangt samen met: het niveau is dat van de gevaarlijkste stap. Terugdraaien: ‘Ongedaan maken’ in de melding.'),
      inhoud: '<div class="hv-kaart hv-rijen">' + REEKSEN.map(function (x) { return o.rij({ icoon: x.icoon, naam: HV.p(x.naam), sub: x.stappen(standaardVelden(x)).map(function (s) { return HV.p(zinVan('dan', s)); }).join(' → '), actie: 'blad', gegevens: { blad: 'reeks:' + x.id }, k: 'reeks-' + x.id }); }).join('') + '</div>' });
    var recepten = o.blok({ id: 'aut-recepten', titel: t('Рецепти', 'Recepten'), teller: RECEPTEN.length, inhoud: '<div class="hv-recepten">' + RECEPTEN.map(function (x) {
      return '<button type="button" class="hv-recept" data-actie="blad" data-blad="recept:' + x.id + '" data-k="recept-' + x.id + '"><span class="hv-recept__teken">' + HV.icoon(x.icoon) + '</span><span class="hv-recept__naam">' + h(HV.p(x.naam)) + '</span><span class="hv-recept__sub">' + h(x.vragen.length + ' ' + HV.meervoud(x.vragen.length, ['запитання', 'запитання', 'запитань'], ['vraag', 'vragen'])) + '</span></button>';
    }).join('') + '</div>' });
    var begrenzing = o.blok({ id: 'aut-begrenzingen', titel: t('Обмеження', 'Begrenzingen'), teller: X.begrenzingen.filter(function (b) { return b.aan; }).length,
      uitleg: t('Що станеться: обмеження перевіряється на виході до пристрою й спиняє будь-яку команду автоматики чи агента поза межею. Пов’язано з: людина за пультом обмежень не має. Як повернути: вимкніть обмеження тут.', 'Wat er gebeurt: een begrenzing wordt vlak voor het apparaat gecontroleerd en stopt elke opdracht van een automatisering of agent buiten de grens. Hangt samen met: een mens aan de bediening is niet begrensd. Terugdraaien: zet de begrenzing hier uit.'),
      inhoud: '<div class="hv-kaart">' + X.begrenzingen.map(function (b) {
        return '<div class="hv-begrenzing" data-k="grens-' + b.id + '">' + o.schakel({ aan: b.aan, icoon: b.icoon, toon: 'neutraal', actie: 'grens-schakel', gegevens: { grens: b.id }, aria: HV.p(b.naam) }) + '<div class="hv-begrenzing__tekst"><p class="hv-begrenzing__naam">' + h(HV.p(b.naam)) + '</p><p class="hv-begrenzing__sub">' + h(HV.p(b.sub)) + '</p></div></div>';
      }).join('') +
      '<p class="hv-aut-noot">' + HV.icoon('scroll-text', { maat: 's' }) + '<span>' + h(t('Сьогодні спинено: 1 — «Гараж на ніч» о 22:00 чекав на схвалення довше за 10 хв.', 'Vandaag gestopt: 1 — ‘Garage voor de nacht’ wachtte om 22:00 langer dan 10 min op goedkeuring.')) + '</span></p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Навчальна тривога', 'Oefenalarm'), icoon: 'siren', klein: true, actie: 'aut-oefen' }) + o.knop({ tekst: t('Показати в реєстрі дозволів', 'In het register tonen'), icoon: 'shield-check', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'instellingen-risico' } }) + '</div></div>' });

    return '<div class="hv-aut" data-k="aut-regels">' + held + '<div class="hv-aut-rooster"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + looptBlok + stukBlok + lijstBlok + '</div>' +
      '<div class="hv-aut-kolom">' + voorstelBlok + reeksen + recepten + begrenzing + '</div></div></div>';
  }
  function standaardVelden(x) { var v = {}; x.velden.forEach(function (f) { v[f.id] = f.standaard; }); return v; }

  /** Найближчі заплановані запуски правил: [{ regel, naam, tijd, tr }]. */
  function volgendeRuns(w, X, dagen) {
    var uit = [];
    X.regels.forEach(function (r) {
      if (r.fase === 'concept' || r.uit) return;
      r.wanneer.forEach(function (tr) {
        for (var d = 0; d <= (dagen || 1); d++) {
          var m = triggerMoment(tr, dagBegin(w.tijd) + d * DAG);
          if (m != null && m > w.tijd && m < w.tijd + ((dagen || 1) + 1) * DAG) uit.push({ regel: r, naam: r.naam, tijd: m, tr: tr });
        }
      });
    });
    return uit.sort(function (a, b) { return a.tijd - b.tijd; });
  }

  // ───────────────────────── Сторінка правила (редактор) ─────────────────────────
  var SECTIES = [['wanneer', 'w', ['Коли', 'Wanneer'], ['Подія запуску', 'Aanleiding']], ['als', 'a', ['Якщо', 'Als'], ['Умова', 'Voorwaarde']], ['dan', 'd', ['Тоді', 'Dan'], ['Дія', 'Actie']]];
  function stapStaat(sectie, s, r, W) {
    if (sectie === 'als') return toets(s, W);
    if (sectie === 'wanneer') { var v = signaal(s, W.w); return v === null ? null : v ? 'waar' : 'onwaar'; }
    return null;
  }
  function flow(r, ctx, opties) {
    var v = werkVan(r), W = wereld(), lezen = opties && opties.lezen, run = opties && opties.run;
    var p = problemen(r);
    return '<div class="hv-flow' + (lezen ? ' is-lezen' : '') + '" data-k="flow">' + SECTIES.map(function (sec) {
      var lijst = sec[0] === 'als' ? v.als.lijst : v[sec[0]];
      var wijze = sec[0] === 'als' && !lezen ? '<div class="hv-flow__wijze">' + o.segment({ label: t('Як поєднати умови', 'Hoe de voorwaarden samengaan'), waarde: v.als.wijze, actie: 'regel-wijze', gegevens: { regel: r.id }, k: 'wijze', opties: [{ id: 'alle', label: t('усі', 'alle') }, { id: 'een', label: t('будь-яка', 'een') }, { id: 'geen', label: t('жодна', 'geen') }] }) + '</div>' : '';
      var stappen = lijst.map(function (s, i) {
        var sleutel = sec[1] + i;
        var staat = run ? null : stapStaat(sec[0], s, r, W);
        var fout = p.filter(function (x) { return x.stap === sleutel && !x.info; }).length;
        var uitkomst = run && sec[0] === 'dan' ? run.stappen.filter(function (x) { return HV.p(x.tekst) === HV.p(zinVan('dan', s)); })[0] : null;
        var uitkomstAls = run && sec[0] === 'als' ? run.voorwaarden[i] : null;
        var ac = sec[0] === 'dan' ? actieVan(s) : null;
        var stand = ac && ac.sleutel !== 'onbekend' ? HV.gevaar.stand('regel-' + r.id, ac.sleutel) : null;
        var rechts = '';
        if (staat) rechts += waarheidChip(staat);
        if (uitkomstAls) rechts += waarheidChip(uitkomstAls.staat);
        if (uitkomst) rechts += uitkomstChip(uitkomst.uitkomst);
        if (ac && !run) rechts += '<span class="hv-flow__stand is-' + stand + '">' + (stand === 'altijd' && HV.gevaar.isZwaar(ac) ? HV.icoon(ac.niveau === 'kritiek' ? 'risico-kritiek' : 'risico-gevaarlijk', { maat: 'risico' }) : HV.icoon(stand === 'uit' ? 'circle-off' : stand === 'vragen' ? 'circle-help' : 'circle-check', { maat: 's' })) + '<span>' + h(HV.p(HV.gevaar.standNamen[stand])) + '</span></span>';
        if (fout) rechts += '<span class="hv-flow__fout">' + HV.icoon('circle-x', { maat: 's' }) + '<span>' + h(t('проблема', 'probleem')) + '</span></span>';
        var naam = HV.p(kopVan(sec[0], s)), sub = stapSub(sec[0], s, W);
        var waarde = uitkomst && uitkomst.waarde ? '<span class="hv-flow__waarde">' + h(t('значення на момент запуску: ', 'waarde bij de start: ') + HV.p(uitkomst.waarde)) + '</span>' : '';
        var binnen = '<span class="hv-flow__nr" aria-hidden="true">' + (i + 1) + '</span><span class="hv-flow__teken">' + HV.icoon(icoonVanStap(sec[0], s)) + '</span>' +
          '<span class="hv-flow__tekst"><span class="hv-flow__naam">' + h(naam) + (ac && ac.niveau !== 'gewoon' ? ' ' + o.risico(ac.niveau) : '') + '</span><span class="hv-flow__sub">' + h(sub) + '</span>' + waarde + doelChip(sec[0], s) + '</span>' +
          (rechts ? '<span class="hv-flow__rechts">' + rechts + '</span>' : '');
        return '<li class="hv-flow__stap' + (staat ? ' is-' + staat : '') + (fout ? ' is-fout' : '') + '" data-k="stap-' + sleutel + '">' + (lezen
          ? '<div class="hv-flow__knop">' + binnen + '</div>'
          : '<button type="button" class="hv-flow__knop" data-actie="blad" data-blad="regelstap:' + sleutel + '" aria-label="' + h(HV.p(sec[3]) + ' ' + (i + 1) + ': ' + sub) + '">' + binnen + HV.icoon('chevron-right', { maat: 's', klas: 'hv-flow__pijl' }) + '</button>') + '</li>';
      }).join('');
      var leeg = !lijst.length ? '<li class="hv-flow__leeg">' + h(sec[0] === 'als' ? t('Без умов: правило діє щоразу, коли настає подія запуску.', 'Zonder voorwaarden: de regel werkt telkens als de aanleiding optreedt.') : t('Порожньо — додайте крок.', 'Leeg — voeg een stap toe.')) + '</li>' : '';
      var plus = lezen ? '' : '<li class="hv-flow__plus">' + o.knop({ tekst: t('Додати: ', 'Toevoegen: ') + HV.p(sec[3]).toLowerCase(), icoon: 'plus', klein: true, soort: 'stil', actie: 'blad', gegevens: { blad: 'regelstap:nieuw' + sec[1] } }) + '</li>';
      return '<section class="hv-flow__sectie hv-flow__sectie--' + sec[0] + '" data-k="sectie-' + sec[0] + '"><header class="hv-flow__label"><span class="hv-flow__woord">' + h(HV.p(sec[2])) + '</span></header>' +
        '<div class="hv-flow__inhoud">' + wijze + '<ol class="hv-flow__lijst">' + stappen + leeg + plus + '</ol></div></section>';
    }).join('') + '</div>';
  }
  /** Другий рядок кроку: вид кроку й живе значення (що зараз показує датчик, коли сьогодні сонце). */
  function stapSub(sectie, s, W) {
    var w = W.w, a = s.doel ? app(s.doel) : null, z = zon(W.tijd);
    var nu = function (x) { return t('зараз ', 'nu ') + x; };
    var soort = HV.p(naamVanStap(sectie, s));
    switch (sectie + ':' + s.soort) {
      case 'wanneer:tijd': return soort + ' · ' + HV.p(dagenTekst(s.dagen));
      case 'wanneer:zon': var m = (s.wat === 'op' ? z.op : z.onder) + (s.min || 0) / 60; return soort + ' · ' + t('сьогодні о ', 'vandaag om ') + uurTekst(m);
      case 'wanneer:beweging': case 'wanneer:stil': return t('Датчик руху · ', 'Bewegingssensor · ') + (a && a.st.actief ? t('рух є', 'beweging') : t('спокій', 'rustig'));
      case 'wanneer:open': return t('Датчик відкриття · ', 'Contactsensor · ') + (a && a.st.open ? HV.woord.open() : HV.woord.dicht());
      case 'wanneer:drempel': return soort + ' · ' + nu(HV.getal(a.st.waarde) + ' ' + (GROOTHEID[a.soort] || ['', '', ''])[2]);
      case 'wanneer:prijs': case 'als:prijs': return soort + ' · ' + nu(HV.euro(HV.tarief.prijs(W.tijd)));
      case 'wanneer:aanwezig': case 'als:aanwezig': return soort + ' · ' + nu(t('удома: ', 'thuis: ') + W.thuis);
      case 'als:donker': return t('Від заходу о ', 'Van zonsondergang om ') + uurTekst(z.onder) + t(' до сходу о ', ' tot opkomst om ') + uurTekst(z.op);
      case 'als:stand': case 'wanneer:stand': return soort + ' · ' + nu(t('«', '‘') + HV.p(HV.huisstanden[W.stand]) + t('»', '’'));
      case 'als:dicht': case 'als:open': return oud(a) ? t('Датчик · ', 'Sensor · ') + HV.woord.onbekend() : t('Датчик · ', 'Sensor · ') + nu(a.st.open ? HV.woord.open() : HV.woord.dicht());
      case 'als:temp': return oud(a) ? soort + ' · ' + HV.woord.verouderd() + ' ' + HV.oud(HV.kijk.leeftijd(a)) + ' — ' + t('значення невідоме', 'waarde onbekend') : soort + ' · ' + nu(HV.getal(a.st.waarde, 1) + ' °C');
      case 'als:weer': return w.weer.verouderd ? t('Прогноз · немає даних', 'Verwachting · geen gegevens') : t('Прогноз · ', 'Verwachting · ') + (w.weer.neerslag ? t('буде дощ', 'regen') : t('сухо', 'droog'));
      case 'als:alarm': return soort + ' · ' + nu(HV.p(HV.alarmWoord[app('alarm').st.stand]).toLowerCase());
      case 'als:aangesloten': return t('Зарядна станція · ', 'Laadpaal · ') + (app('laadpaal').st.aangesloten ? t('під’єднано', 'aangesloten') : t('не під’єднано', 'niet aangesloten'));
      case 'dan:apparaat': return (a ? HV.p(a.naam) + ' · ' : '') + HV.p(FOUT[s.fout || 'doorgaan']);
      case 'dan:wacht': return s.grens == null ? t('Очікування без межі — проблема', 'Wachten zonder grens — probleem') : t('Очікування з межею ', 'Wachten met een grens van ') + HV.duur(s.grens);
      case 'dan:scene': var sc = sceneVan(s.scene); return soort + (sc ? ' · ' + sc.stappen.length + ' ' + HV.meervoud(sc.stappen.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']) : '');
      case 'dan:melding': return t('Сповіщення з діями «Відкрити · Пізніше»', 'Melding met ‘Openen · Later’');
      default: return soort;
    }
  }
  var FOUT = { herhalen: ['у разі помилки — повторити', 'bij een fout herhalen'], doorgaan: ['у разі помилки — продовжити', 'bij een fout doorgaan'], stoppen: ['у разі помилки — зупинити', 'bij een fout stoppen'] };

  /** Шапка підсторінки з кроком шляху назад (без окремого рядка над карткою). */
  function subKop(p) {
    return '<header class="hv-aut-subkop' + (p.actief ? ' is-actief' : '') + '" data-k="subkop"><span class="hv-aut-subkop__teken">' + HV.icoon(p.icoon) + '</span><div class="hv-aut-subkop__tekst">' +
      (p.pad ? '<button type="button" class="hv-aut-subkop__pad" data-actie="ga" data-naar="' + h(p.pad[0]) + '">' + HV.icoon('chevron-left', { maat: 's' }) + '<span>' + h(p.pad[1]) + '</span></button>' : '') +
      '<h1 class="hv-aut-subkop__titel">' + h(p.titel) + '</h1><p class="hv-aut-subkop__sub">' + h(p.sub) + '</p></div>' + (p.extra || '') + '</header>';
  }

  var UITKOMST = { gedaan: ['пройдено', 'gelukt', 'circle-check', 'rust'], overgeslagen: ['пропущено', 'overgeslagen', 'circle-slash', null], onwaar: ['хибно', 'niet waar', 'circle-off', null], fout: ['помилка', 'fout', 'circle-x', 'alarm'],
    gestopt: ['спинено', 'gestopt', 'square', 'let-op'], gevraagd: ['чекає схвалення', 'wacht op goedkeuring', 'circle-help', 'let-op'], meekijken: ['лише в перебіг', 'alleen in verloop', 'eye', null], wacht: ['чекає', 'wacht', 'hourglass', null], bezig: ['виконується', 'bezig', 'hourglass', 'rust'], deels: ['неповно', 'deels', 'triangle', 'let-op'] };
  function uitkomstChip(u) { var x = UITKOMST[u] || UITKOMST.fout; return o.chip({ icoon: x[2], toon: x[3], tekst: HV.p([x[0], x[1]]), klas: 'hv-chip--uitkomst' }); }

  /** Дуга доби з часом сходу й заходу сонця та «зараз». */
  function zonBoog(w, extra) {
    var z = zon(w.tijd), nu = HV.uur(w.tijd);
    var X = function (u) { return 12 + (u / 24) * 296; };
    var Y = function (u) { var x = (u - z.op) / (z.onder - z.op); return u >= z.op && u <= z.onder ? 92 - Math.sin(Math.PI * x) * 64 : 92 + Math.sin(Math.PI * Math.min(1, Math.abs(u < z.op ? (z.op - u) / (24 - z.onder + z.op) : (u - z.onder) / (24 - z.onder + z.op)))) * 18; };
    var pad = '';
    for (var u = 0; u <= 24; u += 0.25) pad += (u === 0 ? 'M' : 'L') + X(u).toFixed(1) + ' ' + Y(u).toFixed(1);
    // маркери — HTML поверх розтягнутого SVG, щоб кола лишалися колами за будь-якої ширини картки
    var merk = function (u, klas) { return '<span class="hv-zonboog__merk hv-zonboog__merk--' + klas + '" style="left:' + (X(u) / 320 * 100).toFixed(2) + '%;top:' + (Y(u) / 112 * 100).toFixed(2) + '%"></span>'; };
    var label = function (u, tekst, klas) { return '<span class="hv-zonboog__label' + (klas ? ' ' + klas : '') + '" style="left:' + (X(u) / 320 * 100).toFixed(1) + '%">' + tekst + '</span>'; };
    // позначка події запуску: лінія в полі й підпис окремим рядком під «зараз»; у правій половині підпис стоїть ліворуч від лінії,
    // тож не виходить за край поля й не ховається під «зараз»
    var doelPct = extra != null ? (X(Math.max(0, Math.min(24, extra))) / 320 * 100).toFixed(2) : '';
    var extraMerk = extra != null ? '<span class="hv-zonboog__doel" style="left:' + doelPct + '%"></span><span class="hv-zonboog__doeltekst' + (+doelPct > 50 ? ' is-links' : '') + '" style="--hv-doel:' + doelPct + '%">' + h(t('подія запуску ', 'aanleiding ') + uurTekst(extra)) + '</span>' : '';
    return '<figure class="hv-zonboog' + (extra != null ? ' heeft-doel' : '') + '" data-k="zonboog"><div class="hv-zonboog__veld"><div class="hv-zonboog__vlak"><svg viewBox="0 0 320 112" preserveAspectRatio="none" aria-hidden="true"><line class="hv-zonboog__horizon" x1="0" y1="92" x2="320" y2="92"/><path class="hv-zonboog__pad" d="' + pad + '"/></svg>' + extraMerk + merk(z.op, 'op') + merk(z.onder, 'onder') + merk(nu, 'nu') + '</div>' +
      label(z.op, HV.icoon('sunrise', { maat: 'maker' }) + uurTekst(z.op)) + label(z.onder, HV.icoon('sunset', { maat: 'maker' }) + uurTekst(z.onder)) + label(nu, h(t('зараз', 'nu')) + ' ' + HV.tijd(w.tijd), 'is-nu') + '</div>' +
      '<figcaption class="hv-zonboog__zin">' + h(t('Сьогодні схід о ', 'Vandaag komt de zon op om ') + uurTekst(z.op) + t(', захід о ', ', ondergang om ') + uurTekst(z.onder) + t('; темно — від заходу до сходу.', '; donker is van ondergang tot opkomst.')) + '</figcaption></figure>';
  }

  function regelKop(r, ctx, sub) {
    var w = ctx.staat, oz = oordeelZin(r, wereld());
    var namens = mensNaam(r.namens);
    return '<section class="hv-regelkop is-' + r.fase + '" data-k="regelkop">' +
      '<div class="hv-regelkop__boven"><span class="hv-regelkop__teken">' + HV.icoon(r.icoon, { maat: 'l' }) + '</span><div class="hv-regelkop__naam"><h1 class="hv-regelkop__titel">' + h(HV.p(r.naam)) + '</h1>' +
      '<p class="hv-regelkop__kamer">' + h(HV.p(kamer(r.kamer).naam)) + (sub ? ' · ' + h(sub) : '') + '</p></div>' + logicaChip(r, true) + '</div>' +
      '<p class="hv-regelzin">' + h(HV.p(regelZin(r))) + '</p>' +
      '<p class="hv-regelkop__oordeel is-' + oz.staat + '">' + waarheidChip(oz.staat) + '<span>' + h(oz.tekst) + '</span></p>' +
      '<p class="hv-regelkop__namens">' + HV.icoon('user', { maat: 's' }) + '<span>' + h(t('Працює від імені: ', 'Werkt namens: ') + HV.p(namens) + t(' · версія ', ' · versie ') + r.versie) + '</span>' +
      o.gevolg(t('Що станеться: правило діє з правами цієї людини; якщо вона втратить доступ, правило перейде в «Спостереження». Пов’язано з: кожен крок проходить ворота дозволів правила. Як повернути: «Перебрати на себе» — правило діятиме від вашого імені.', 'Wat er gebeurt: de regel werkt met de rechten van deze persoon; verliest die de toegang, dan gaat de regel naar ‘Meekijken’. Hangt samen met: elke stap gaat langs de toestemmingen van de regel. Terugdraaien: ‘Overnemen’ — de regel werkt dan namens jou.'), { kop: t('Від імені', 'Namens') }) +
      (r.namens !== HV.mens().id && r.fase !== 'concept' ? o.knop({ tekst: t('Перебрати на себе', 'Overnemen'), klein: true, soort: 'stil', actie: 'regel-overnemen', gegevens: { regel: r.id } }) : '') + '</p>' +
      traject(r) + '</section>';
  }

  function regelPagina(ctx) {
    var w = ctx.staat, X = A(w), r = regel(ctx.route.object, X);
    if (!r) return o.leeg({ icoon: 'workflow', titel: t('Такого правила немає', 'Deze regel bestaat niet'), actie: { tekst: t('До правил', 'Naar de regels'), actie: 'ga', gegevens: { naar: 'automatiseringen' } } });
    var v = werkVan(r);
    var p = problemen(r), c = conflicten(r);
    var vs = HV.ui.lees('aut-voorstel', null), voorstel = vs ? X.voorstellen.filter(function (x) { return x.id === vs && x.regel === r.id; })[0] : null;

    var werkBalk = r.werk ? '<div class="hv-aut-werk" role="status" data-k="werkbalk">' + HV.icoon('pencil-line', { maat: 's' }) + '<span class="hv-aut-werk__tekst">' + h(t('Незбережені зміни: ', 'Niet opgeslagen wijzigingen: ') + vergelijk(momentopname(r), r.werk).length + t(' · збереження створить версію ', ' · opslaan maakt versie ') + (r.versie + 1)) + '</span>' +
      o.knop({ tekst: t('Скасувати зміни', 'Wijzigingen wissen'), klein: true, soort: 'stil', actie: 'regel-wis', gegevens: { regel: r.id } }) + o.knop({ tekst: t('Зберегти', 'Opslaan'), icoon: 'save', klein: true, soort: 'hoofd', actie: 'regel-opslaan', gegevens: { regel: r.id } }) + '</div>' : '';

    var vergelijkKaart = '';
    if (voorstel) {
      var na = momentopname(r); voorstel.pas(na);
      var d = vergelijk(momentopname(r), na);
      vergelijkKaart = '<section class="hv-kaart hv-aut-vergelijk" data-k="vergelijk"><h3 class="hv-kaart__titel">' + h(t('Пропозиція агента — чернетка з порівнянням', 'Voorstel van de agent — concept met vergelijking')) + '</h3>' +
        '<p class="hv-tekst">' + o.maker(voorstel.maker) + '<span>' + h(HV.p(voorstel.wat)) + '</span></p>' + verschilLijst(d) +
        '<p class="hv-aut-noot">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Правка агента не змінює увімкнену версію ', 'Een wijziging van de agent verandert de actieve versie ') + r.versie + t(': вона працює далі, доки людина не збереже нову.', ' niet: die blijft werken tot een mens een nieuwe opslaat.')) + '</span></p>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Взяти в чернетку', 'In het concept zetten'), icoon: 'pencil-line', soort: 'hoofd', klein: true, actie: 'voorstel-neem', gegevens: { voorstel: voorstel.id } }) + o.knop({ tekst: t('Відхилити', 'Afwijzen'), klein: true, actie: 'voorstel-weg', gegevens: { voorstel: voorstel.id } }) + '</div></section>';
    }

    var acties = '<div class="hv-aut-acties" data-k="regelacties">' +
      o.knop({ tekst: t('Пробний прогін', 'Proefdraaien'), icoon: 'flask-conical', actie: 'ga', gegevens: { naar: 'automatiseringen-proef-' + r.id } }) +
      o.knop({ tekst: t('Перебіг', 'Verloop'), icoon: 'history', actie: 'ga', gegevens: { naar: 'automatiseringen-verloop-' + r.id } }) +
      o.knop({ tekst: t('Версії', 'Versies'), icoon: 'git-branch', actie: 'ga', gegevens: { naar: 'automatiseringen-versies-' + r.id } }) +
      (r.fase !== 'concept' ? o.knop({ tekst: t('Виконати дії зараз', 'Acties nu uitvoeren'), icoon: 'play', actie: 'regel-nu', gegevens: { regel: r.id } }) : '') +
      (r.pauze && r.pauze.tot > w.tijd ? o.knop({ tekst: t('Продовжити', 'Hervatten'), icoon: 'play', actie: 'regel-hervat', gegevens: { regel: r.id } }) : '') +
      (r.fase === 'concept' ? o.knop({ tekst: t('Видалити чернетку', 'Concept verwijderen'), icoon: 'trash-2', soort: 'stil', actie: 'regel-verwijder', gegevens: { regel: r.id } }) : '') +
      (r.werk ? o.knop({ tekst: t('Зберегти', 'Opslaan'), icoon: 'save', soort: 'hoofd', actie: 'regel-opslaan', gegevens: { regel: r.id } }) : o.knop({ gedrukt: true, tekst: t('Збережено', 'Opgeslagen') })) + '</div>';

    // права колонка
    var zichtbaarZon = v.als.lijst.some(function (x) { return x.soort === 'donker'; }) || v.wanneer.some(function (x) { return x.soort === 'zon'; });
    var zonTr = v.wanneer.filter(function (x) { return x.soort === 'zon'; })[0];
    var nuKaart = zichtbaarZon ? o.kaart({ titel: t('Крок: сонце й темрява', 'Stap: zon en donker'), inhoud: zonBoog(w, zonTr ? (zonTr.wat === 'op' ? zon(w.tijd).op : zon(w.tijd).onder) + (zonTr.min || 0) / 60 : null) +
      (zonTr ? veld(t('Зсув відносно сонця', 'Verschuiving ten opzichte van de zon'), o.stapper({ label: t('Зсув', 'Verschuiving'), waarde: HV.maat(zonTr.min || 0, t('хв', 'min')), actie: 'regel-stap', gegevens: { regel: r.id, sleutel: 'w' + v.wanneer.indexOf(zonTr), veld: 'min' }, stap: 5 })) : ''), k: 'nu-zon' }) : '';
    var probKaart = o.kaart({ titel: t('Проблеми', 'Problemen') + ' (' + (p.filter(function (x) { return !x.info; }).length + c.length) + ')', k: 'problemen', inhoud: (p.length || c.length) ? '<ul class="hv-aut-problemen">' +
      p.map(function (x) { return '<li class="' + (x.info ? 'is-info' : x.zwaar ? 'is-zwaar' : 'is-let') + '">' + HV.icoon(x.info ? 'info' : x.zwaar ? 'circle-x' : 'triangle', { maat: 's' }) + (x.stap ? '<button type="button" class="hv-link" data-actie="blad" data-blad="regelstap:' + x.stap + '">' + h(HV.p(x.tekst)) + '</button>' : '<span>' + h(HV.p(x.tekst)) + '</span>') + '</li>'; }).join('') +
      c.map(function (x) { return '<li class="is-let">' + HV.icoon('split', { maat: 's' }) + '<button type="button" class="hv-link" data-actie="ga" data-naar="automatiseringen-regel-' + x.regel + '">' + h(t('Конфлікт — ', 'Conflict — ') + HV.p(x.tekst)) + '</button></li>'; }).join('') + '</ul>'
      : '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('circle-check', { maat: 's' }) + '<span>' + h(t('Проблем не знайдено: цілі доступні, очікування мають межу, петель немає.', 'Geen problemen: doelen bereikbaar, wachten heeft een grens, geen lussen.')) + '</span></p>' });
    var opties = v.opties;
    var startKaart = o.kaart({ titel: t('Запуск', 'Starten'), k: 'start', inhoud:
      veld(t('Не частіше ніж', 'Niet vaker dan'), o.stapper({ label: t('Не частіше ніж', 'Niet vaker dan'), waarde: HV.maat(opties.nietVaker, t('хв', 'min')), actie: 'regel-optie', gegevens: { regel: r.id, veld: 'nietVaker' }, stap: 5 })) +
      veld(t('Стабільно протягом', 'Stabiel gedurende'), o.stapper({ label: t('Стабільно протягом', 'Stabiel gedurende'), waarde: HV.maat(opties.stabiel, t('с', 's')), actie: 'regel-optie', gegevens: { regel: r.id, veld: 'stabiel' }, stap: 30 })) +
      veld(t('Після простою', 'Na uitval'), o.segment({ label: t('Після простою', 'Na uitval'), waarde: opties.naUitval, actie: 'regel-naUitval', gegevens: { regel: r.id }, k: 'nauitval', opties: [{ id: 'inhalen', label: t('надолужити', 'inhalen') }, { id: 'overslaan', label: t('пропустити', 'overslaan') }, { id: 'vragen', label: t('запитати', 'vragen') }] }) +
        '<p class="hv-aut-noot">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Чутливе й вище після простою не надолужується ніколи — лише запис «пропущено».', 'Gevoelig en hoger wordt na uitval nooit ingehaald — alleen een regel ‘overgeslagen’.')) + '</span></p>') +
      veld(t('Діє в режимах дому', 'Werkt in de huisstanden'), '<div class="hv-filter">' + STANDEN.map(function (s) { return o.chip({ filter: true, gekozen: v.standen.indexOf(s) >= 0, icoon: STAND_ICOON[s], tekst: HV.p(HV.huisstanden[s]), actie: 'regel-standen', gegevens: { regel: r.id, stand: s }, k: 'rs-' + s }); }).join('') + '</div>') });
    var sleutels = {};
    var standen = v.dan.map(function (s) { var a = actieVan(s); if (!a || a.sleutel === 'onbekend' || sleutels[a.sleutel]) return ''; sleutels[a.sleutel] = 1; return o.stand({ uitvoerder: 'regel-' + r.id, actie: a, rol: ctx.rol }); }).join('');
    var toestemming = o.kaart({ titel: t('Дозволи правила', 'Toestemmingen van de regel'), k: 'toestemming', inhoud: '<p class="hv-aut-noot">' + HV.icoon('shield-check', { maat: 's' }) + '<span>' + h(t('Правило — окремий виконавець. Для кожної дії: «Вимкнено · Питати · Завжди»; змінює лише власник, кожна зміна — запис у Журналі.', 'De regel is een eigen uitvoerder. Per actie: ‘Uit · Vragen · Altijd’; alleen de eigenaar wijzigt, elke wijziging komt in het logboek.')) + '</span></p>' +
      (standen || '<p class="hv-tekst hv-tekst--zacht">' + h(t('Дій над пристроями ще немає.', 'Nog geen acties op apparaten.')) + '</p>') +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Реєстр дозволів', 'Register van toestemmingen'), icoon: 'shield-check', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'instellingen-risico' } }) + '</div>' });
    var runs = r.runs.slice(0, 4);
    var runKaart = o.kaart({ titel: t('Останні запуски', 'Laatste starts'), k: 'runs', inhoud: runs.length ? '<div class="hv-rijen">' + runs.map(function (x) { return o.rij({ icoon: UITKOMST[x.uitkomst] ? UITKOMST[x.uitkomst][2] : 'circle', naam: wanneerTekst(x.tijd, w.tijd), sub: HV.p(UITKOMST[x.uitkomst] ? [UITKOMST[x.uitkomst][0], UITKOMST[x.uitkomst][1]] : ['', '']), actie: 'aut-run', gegevens: { regel: r.id, run: x.id }, k: 'r-' + x.id }); }).join('') + '</div>' : '<p class="hv-tekst hv-tekst--zacht">' + h(t('Чернетка ще не запускалася. Спершу — пробний прогін.', 'Het concept is nog niet gestart. Eerst proefdraaien.')) + '</p>' });

    return '<div class="hv-aut hv-aut-regel" data-k="regel-' + h(r.id) + '">' + regelKop(r, ctx) + werkBalk + vergelijkKaart + acties +
      '<div class="hv-aut-rooster hv-aut-rooster--editor"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + o.kaart({ inhoud: flow(r, ctx), klas: 'hv-aut-flowkaart' }) + '</div>' +
      '<div class="hv-aut-kolom">' + probKaart + nuKaart + toestemming + startKaart + runKaart + '</div></div></div>';
  }
  function verschilLijst(d) {
    if (!d.length) return '<p class="hv-tekst hv-tekst--zacht">' + h(t('Кроки однакові.', 'De stappen zijn gelijk.')) + '</p>';
    var SN = { wanneer: ['Коли', 'Wanneer'], als: ['Якщо', 'Als'], dan: ['Тоді', 'Dan'], opties: ['Запуск', 'Starten'] };
    return '<ul class="hv-verschil">' + d.map(function (x) { return '<li class="is-' + x.soort + '"><span class="hv-verschil__teken" aria-hidden="true">' + (x.soort === 'plus' ? '+' : '−') + '</span><span class="hv-verschil__sectie">' + h(HV.p(SN[x.sectie])) + '</span><span class="hv-verschil__tekst">' + h(groot(x.tekst)) + '</span><span class="hv-vo">' + h(x.soort === 'plus' ? t('додано', 'toegevoegd') : t('прибрано', 'verwijderd')) + '</span></li>'; }).join('') + '</ul>';
  }
  var veld = function (label, html, extra) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };

  // ── Пробний прогін ──
  function proefPagina(ctx) {
    var w = ctx.staat, r = regel(ctx.route.object);
    if (!r) return regelPagina(ctx);
    var stel = { actief: HV.ui.lees('stel-aan', false) };
    var su = HV.ui.lees('stel-uur', 'nu'), ss = HV.ui.lees('stel-stand', 'nu'), st = HV.ui.lees('stel-thuis', 'nu');
    var W = wereld(stel.actief ? { tijd: su === 'nu' ? null : dagBegin(w.tijd) + Number(su) * UUR, stand: ss === 'nu' ? null : ss, thuis: st === 'nu' ? null : Number(st) } : null);
    var v = werkVan(r), oo = oordeel(r, W);
    var voorwaarden = v.als.lijst.map(function (c, i) { var s = toets(c, W); return '<li class="hv-wasword__rij is-' + s + '" data-k="pv-' + i + '"><span class="hv-wasword__teken">' + HV.icoon(icoonVanStap('als', c)) + '</span><span class="hv-wasword__tekst">' + h(HV.p(kopVan('als', c))) + '</span>' + waarheidChip(s) + '</li>'; }).join('');
    var stappen = v.dan.map(function (s, i) {
      var was = '—', wordt = HV.p(zinVan('dan', s)), noot = '', a = s.soort === 'apparaat' ? app(s.doel) : null, ac = actieVan(s);
      if (a) { was = HV.p(HV.beschrijf(a, s.mogelijkheid, HV.huidige(a, s.mogelijkheid))); wordt = HV.p(HV.beschrijf(a, s.mogelijkheid, s.waarde)); }
      if (s.soort === 'stand') { was = HV.p(HV.huisstanden[W.stand]); wordt = HV.p(HV.huisstanden[s.stand]); }
      if (s.soort === 'kamerdoel') { var k = kamer(s.kamer); was = k.doel != null ? HV.getal(k.doel, 1) + ' °C' : '—'; wordt = HV.getal(s.waarde, 1) + ' °C'; }
      if (s.soort === 'wacht') { was = ''; wordt = HV.p(zinVan('dan', s)); }
      var stand = ac && ac.sleutel !== 'onbekend' ? HV.gevaar.stand('regel-' + r.id, ac.sleutel) : null;
      if (a && a.beschikbaar === 'onbereikbaar') noot = t('буде пропущено: пристрій недоступний', 'wordt overgeslagen: apparaat niet bereikbaar');
      else if (stand === 'uit') noot = t('буде пропущено: дозвіл «Вимкнено»', 'wordt overgeslagen: toestemming ‘Uit’');
      else if (stand === 'vragen') noot = t('спершу запит до ', 'eerst een verzoek aan ') + HV.p(mensNaam(r.namens));
      var gelijk = a && String(HV.huidige(a, s.mogelijkheid)) === String(s.waarde);
      if (!noot && gelijk) noot = t('уже так — нічого не зміниться', 'staat al zo — er verandert niets');
      return '<li class="hv-wasword__rij' + (noot ? ' is-noot' : '') + '" data-k="ps-' + i + '"><span class="hv-wasword__teken">' + HV.icoon(icoonVanStap('dan', s)) + '</span><span class="hv-wasword__tekst"><span class="hv-wasword__naam">' + h(HV.p(naamVanStap('dan', s))) + '</span>' +
        (s.soort === 'wacht' ? '<span class="hv-wasword__delta">' + h(groot(wordt)) + '</span>' : '<span class="hv-wasword__delta"><span class="hv-wasword__was">' + h(was) + '</span>' + HV.icoon('arrow-right', { maat: 's' }) + '<span class="hv-wasword__wordt">' + h(wordt) + '</span></span>') +
        (noot ? '<span class="hv-wasword__noot">' + h(noot) + '</span>' : '') + '</span>' + (ac && ac.niveau !== 'gewoon' ? o.risico(ac.niveau) : '') + '</li>';
    }).join('');
    var stelKaart = o.kaart({ titel: t('Уявімо, що…', 'Stel dat…'), k: 'stel', inhoud:
      '<div class="hv-aut-stelrij">' + o.schakel({ aan: stel.actief, icoon: 'flask-conical', toon: 'neutraal', actie: 'ui', gegevens: { naam: 'stel-aan', waarde: stel.actief ? '' : '1' }, aria: t('Уявімо, що…', 'Stel dat…') }) + '<span>' + h(stel.actief ? t('Перевіряємо уявну ситуацію — дім не змінюється.', 'We toetsen een bedachte situatie — het huis verandert niet.') : t('Перевіряємо дім, як він є зараз.', 'We toetsen het huis zoals het nu is.')) + '</span></div>' +
      (stel.actief ? veld(t('Час', 'Tijd'), o.segment({ label: t('Час', 'Tijd'), waarde: su, actie: 'ui', gegevens: { naam: 'stel-uur' }, k: 'stel-uur', klas: 'hv-segment--rol', opties: [{ id: 'nu', label: t('зараз', 'nu') }, { id: '7', label: '07:00' }, { id: '18', label: '18:00' }, { id: '22.5', label: '22:30' }, { id: '3', label: '03:00' }] })) +
        veld(t('Режим дому', 'Huisstand'), o.segment({ label: t('Режим дому', 'Huisstand'), waarde: ss, actie: 'ui', gegevens: { naam: 'stel-stand' }, k: 'stel-stand', klas: 'hv-segment--rol', opties: [{ id: 'nu', label: t('як зараз', 'zoals nu') }].concat(STANDEN.map(function (s) { return { id: s, label: HV.p(HV.huisstanden[s]), icoon: STAND_ICOON[s] }; })) })) +
        veld(t('Присутність', 'Aanwezigheid'), o.segment({ label: t('Присутність', 'Aanwezigheid'), waarde: st, actie: 'ui', gegevens: { naam: 'stel-thuis' }, k: 'stel-thuis', klas: 'hv-segment--rol', opties: [{ id: 'nu', label: t('як зараз', 'zoals nu') }, { id: '0', label: t('нікого', 'niemand') }, { id: '2', label: t('двоє вдома', 'twee thuis') }] })) : '') });
    var oordeelHtml = '<p class="hv-aut-proef__oordeel is-' + oo.staat + '">' + waarheidChip(oo.staat) + '<span>' + h(oo.staat === 'waar' ? t('Умови виконано — ось що станеться:', 'De voorwaarden kloppen — dit gebeurt er:') : oo.staat === 'onbekend' ? t('Не все відомо — за справжнього запуску крок умов вирішить «ні». Що станеться, якби виконали:', 'Niet alles is bekend — bij een echte start zegt de voorwaarde ‘nee’. Wat er zou gebeuren:') : t('Умови хибні — справжній запуск нічого не зробив би. Що станеться, якщо виконати вручну:', 'De voorwaarden kloppen niet — een echte start zou niets doen. Wat er gebeurt bij handmatig uitvoeren:')) + '</span></p>';
    return '<div class="hv-aut hv-aut-proef" data-k="proef-' + h(r.id) + '">' + subKop({ icoon: 'flask-conical', pad: ['automatiseringen-regel-' + r.id, HV.p(r.naam)], titel: t('Пробний прогін', 'Proefdraaien'), sub: r.werk ? t('незбережена версія', 'niet opgeslagen versie') : t('версія ', 'versie ') + r.versie }) +
      '<div class="hv-aut-rooster"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + o.kaart({ titel: t('Умови', 'Voorwaarden'), k: 'proef-als', inhoud: voorwaarden ? '<ol class="hv-wasword">' + voorwaarden + '</ol>' : '<p class="hv-tekst hv-tekst--zacht">' + h(t('Без умов.', 'Zonder voorwaarden.')) + '</p>' }) +
      o.kaart({ titel: t('Було → стане', 'Was → wordt'), k: 'proef-dan', inhoud: oordeelHtml + '<ol class="hv-wasword">' + stappen + '</ol>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Виконати насправді', 'Echt uitvoeren'), icoon: 'play', soort: 'hoofd', actie: 'regel-echt', gegevens: { regel: r.id } }) + o.gevolg(t('Що станеться: кроки виконаються зараз від імені правила, з його дозволами. Пов’язано з: кожен крок — запис у Журналі. Як повернути: «Повернути» у сповіщенні протягом 10 с.', 'Wat er gebeurt: de stappen worden nu uitgevoerd namens de regel, met zijn toestemmingen. Hangt samen met: elke stap komt in het logboek. Terugdraaien: ‘Ongedaan maken’ in de melding binnen 10 s.')) + '</div>' }) + '</div>' +
      '<div class="hv-aut-kolom">' + stelKaart + '</div></div></div>';
  }

  // ── Перебіг ──
  function verloopPagina(ctx) {
    var w = ctx.staat, r = regel(ctx.route.object);
    if (!r) return regelPagina(ctx);
    var aantal = Number(HV.ui.lees('aut-meer', 20));
    var runs = r.runs.filter(function (x) { return x.tijd > w.tijd - 30 * DAG; });
    var gekozen = HV.ui.lees('aut-run', null), run = runs.filter(function (x) { return x.id === gekozen; })[0] || runs[0];
    var lijst = runs.slice(0, aantal).map(function (x) {
      var u = UITKOMST[x.uitkomst] || UITKOMST.fout;
      return '<button type="button" class="hv-runrij' + (run && x.id === run.id ? ' is-gekozen' : '') + '" aria-pressed="' + (run && x.id === run.id ? 'true' : 'false') + '" data-actie="ui" data-naam="aut-run" data-waarde="' + h(x.id) + '" data-k="run-' + h(x.id) + '">' +
        '<span class="hv-runrij__tijd">' + HV.tijd(x.tijd) + '</span><span class="hv-runrij__dag">' + h(dagWoord(x.tijd, w.tijd)) + '</span>' +
        '<span class="hv-runrij__uitkomst hv-toon-' + (u[3] || 'neutraal') + '">' + HV.icoon(u[2], { maat: 's' }) + '<span>' + h(HV.p([u[0], u[1]])) + '</span></span>' +
        '<span class="hv-runrij__bron">' + h(x.bron === 'handmatig' ? t('вручну', 'handmatig') : t('за подією запуску', 'door aanleiding')) + '</span></button>';
    }).join('');
    var meer = runs.length > aantal ? o.knop({ tekst: t('Показати ще', 'Meer tonen') + ' (' + (runs.length - aantal) + ')', klein: true, soort: 'stil', actie: 'ui', gegevens: { naam: 'aut-meer', waarde: aantal + 20 } }) : '';
    var detail = run ? o.kaart({ k: 'run-detail', titel: t('Запуск ', 'Start ') + wanneerTekst(run.tijd, w.tijd) + t(' · версія ', ' · versie ') + run.versie, inhoud:
      '<ol class="hv-waaromketen"><li><span class="hv-waaromketen__label">' + h(t('Що запустило', 'Aanleiding')) + '</span><span class="hv-waaromketen__wat">' + h(groot(HV.p(run.aanleiding))) + '</span></li>' +
      '<li><span class="hv-waaromketen__label">' + h(t('Умова', 'Voorwaarde')) + '</span><span class="hv-waaromketen__wat">' + h(run.voorwaarden.length ? run.voorwaarden.map(function (c) { return HV.p(c.tekst) + ' — ' + HV.p(WAARHEID[c.staat]); }).join('; ') : t('без умов', 'zonder voorwaarden')) + '</span></li>' +
      '<li><span class="hv-waaromketen__label">' + h(t('Дія', 'Actie')) + '</span><span class="hv-waaromketen__wat">' + h(run.stappen.length ? run.stappen.map(function (s) { return HV.p(s.tekst); }).join(' → ') : t('нічого не виконано', 'niets uitgevoerd')) + '</span></li></ol>' +
      '<h4 class="hv-aut-tussenkop">' + h(t('Кроки', 'Stappen')) + '</h4>' +
      (run.stappen.length ? '<ol class="hv-wasword">' + run.stappen.map(function (s, i) { return '<li class="hv-wasword__rij" data-k="rs-' + i + '"><span class="hv-wasword__teken"><span class="hv-flow__nr">' + (i + 1) + '</span></span><span class="hv-wasword__tekst"><span class="hv-wasword__naam">' + h(groot(HV.p(s.tekst))) + '</span>' + (s.waarde ? '<span class="hv-wasword__noot">' + h(t('значення на момент запуску: ', 'waarde bij de start: ') + HV.p(s.waarde)) + '</span>' : '') + (s.reden ? '<span class="hv-wasword__noot">' + h(t('Чому: ', 'Waarom: ') + HV.p(s.reden)) + '</span>' : '') + '</span>' + uitkomstChip(s.uitkomst) + '</li>'; }).join('') + '</ol>'
        : '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('circle-off', { maat: 's' }) + '<span>' + h(run.uitkomst === 'onwaar' ? t('Умова не виконалася — дій не було.', 'De voorwaarde klopte niet — er waren geen acties.') : t('Кроків немає.', 'Geen stappen.')) + '</span></p>') +
      '<h4 class="hv-aut-tussenkop">' + h(t('Правило на момент запуску (лише перегляд)', 'De regel bij de start (alleen bekijken)')) + '</h4>' + flow(r, ctx, { lezen: true, run: run }) }) : o.leeg({ icoon: 'history', titel: t('Запусків ще немає', 'Nog geen starts'), tekst: t('Перебіг зберігається 30 днів.', 'Het verloop wordt 30 dagen bewaard.') });
    return '<div class="hv-aut hv-aut-verloop" data-k="verloop-' + h(r.id) + '">' + subKop({ icoon: 'history', pad: ['automatiseringen-regel-' + r.id, HV.p(r.naam)], titel: t('Перебіг', 'Verloop'), sub: t('запусків за 30 днів: ', 'starts in 30 dagen: ') + runs.length + t(' · строк зберігання 30 днів', ' · bewaard 30 dagen') }) +
      '<div class="hv-aut-rooster hv-aut-rooster--verloop"><div class="hv-aut-kolom">' + o.kaart({ titel: t('Останні запуски', 'Laatste starts'), k: 'runlijst', inhoud: '<div class="hv-runlijst">' + lijst + '</div>' + meer }) + '</div><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + detail + '</div></div></div>';
  }

  // ── Версії ──
  function versiesPagina(ctx) {
    var w = ctx.staat, r = regel(ctx.route.object);
    if (!r) return regelPagina(ctx);
    var gekozen = Number(HV.ui.lees('aut-versie', r.versies[1] ? r.versies[1].nr : r.versie));
    var ver = r.versies.filter(function (x) { return x.nr === gekozen; })[0] || r.versies[0];
    var lijn = '<ol class="hv-versies">' + r.versies.map(function (x) {
      var nu = x.nr === r.versie;
      return '<li class="hv-versies__punt' + (nu ? ' is-nu' : '') + (ver && x.nr === ver.nr ? ' is-gekozen' : '') + '" data-k="v-' + x.nr + '"><button type="button" class="hv-versies__knop" aria-pressed="' + (ver && x.nr === ver.nr ? 'true' : 'false') + '" data-actie="ui" data-naam="aut-versie" data-waarde="' + x.nr + '">' +
        '<span class="hv-versies__nr">' + h(t('версія ', 'versie ') + x.nr) + (nu ? ' · ' + h(t('чинна', 'actief')) : '') + '</span><span class="hv-versies__wat">' + h(HV.p(x.wat)) + '</span><span class="hv-versies__meta">' + o.maker(x.maker) + '<span class="hv-punt">·</span><span>' + h(HV.datumKort(x.tijd) + ' ' + HV.tijd(x.tijd)) + '</span></span></button></li>';
    }).join('') + '</ol>';
    var d = ver ? vergelijk(ver.snap, momentopname(r)) : [];
    var detail = ver ? o.kaart({ k: 'versie-detail', titel: t('Версія ', 'Versie ') + ver.nr + t(' → чинна ', ' → actieve ') + r.versie, inhoud:
      '<p class="hv-tekst">' + h(t('Що змінилося відтоді, як діяла ця версія:', 'Wat er is veranderd sinds deze versie gold:')) + '</p>' + verschilLijst(d) +
      '<h4 class="hv-aut-tussenkop">' + h(t('Речення версії ', 'Zin van versie ') + ver.nr) + '</h4><p class="hv-regelzin hv-regelzin--klein">' + h(HV.p(regelZin({ wanneer: ver.snap.wanneer, als: ver.snap.als, dan: ver.snap.dan }))) + '</p>' +
      (ver.nr !== r.versie ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Відновити версію ' + ver.nr, 'Versie ' + ver.nr + ' herstellen'), icoon: 'rotate-ccw', soort: 'hoofd', actie: 'regel-herstel', gegevens: { regel: r.id, versie: ver.nr } }) +
        o.gevolg(t('Що станеться: буде створено нову версію ', 'Wat er gebeurt: er komt een nieuwe versie ') + (r.versie + 1) + t(' з кроками версії ', ' met de stappen van versie ') + ver.nr + t('; кожен крок перевіряється на ваші права. Пов’язано з: сцени й послідовності в кроках закріплені за версією. Як повернути: «Повернути» протягом 10 с або відновити чинну версію.', '; elke stap wordt getoetst aan jouw rechten. Hangt samen met: scènes en reeksen in de stappen horen bij de versie. Terugdraaien: ‘Ongedaan maken’ binnen 10 s of de huidige versie herstellen.')) + '</div>' : '') }) : '';
    return '<div class="hv-aut hv-aut-versies" data-k="versies-' + h(r.id) + '">' + subKop({ icoon: 'git-branch', pad: ['automatiseringen-regel-' + r.id, HV.p(r.naam)], titel: t('Версії', 'Versies'), sub: t('чинна версія ', 'actieve versie ') + r.versie + ' · ' + r.versies.length + t(' у шкалі', ' in de tijdlijn') }) +
      '<div class="hv-aut-rooster hv-aut-rooster--verloop"><div class="hv-aut-kolom">' + o.kaart({ titel: t('Шкала версій', 'Tijdlijn van versies'), k: 'versielijn', inhoud: lijn }) + '</div><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + detail + '</div></div></div>';
  }

  // ───────────────────────── Аркуші правила ─────────────────────────
  function regelUitRoute(ctx) { var r = regel(ctx.route.object); return r; }
  function stapVan(r, sleutel) {
    var v = werkVan(r), sec = { w: 'wanneer', a: 'als', d: 'dan' }[sleutel.charAt(0)], i = Number(sleutel.slice(1));
    var lijst = sec === 'als' ? v.als.lijst : v[sec];
    return { sectie: sec, i: i, s: lijst[i] };
  }
  var INTENTIES = {
    w: [
      { id: 'tijd', icoon: 'clock', naam: ['Час і сонце', 'Tijd en zon'], sub: ['о певній годині, на сході чи заході', 'op een tijdstip, bij zonsopkomst of -ondergang'], maak: [{ soort: 'tijd', uur: 7, dagen: [1, 2, 3, 4, 5] }, { soort: 'zon', wat: 'onder', min: 0 }] },
      { id: 'aanwezig', icoon: 'user-round-check', naam: ['Присутність', 'Aanwezigheid'], sub: ['хтось прийшов, усі пішли', 'iemand komt, iedereen weg'], maak: [{ soort: 'aanwezig', wie: 'iemand', komt: true }] },
      { id: 'apparaat', icoon: 'radar', naam: ['Пристрої кімнати', 'Apparaten in de kamer'], sub: ['рух, відчинено, поріг датчика', 'beweging, open, drempel van een sensor'], maak: [{ soort: 'beweging', doel: 'beweginghal' }] },
      { id: 'energie', icoon: 'euro', naam: ['Енергія й ціна', 'Energie en prijs'], sub: ['ціна нижча за поріг', 'de prijs onder een drempel'], maak: [{ soort: 'prijs', onder: 0.18 }] },
      { id: 'stand', icoon: 'house', naam: ['Режим і сцена', 'Stand en scène'], sub: ['дім переходить у режим', 'het huis gaat naar een stand'], maak: [{ soort: 'stand', stand: 'nacht' }] },
      { id: 'knop', icoon: 'circle-dot', naam: ['Кнопка', 'Knop'], sub: ['натиск кнопки сцен', 'een druk op de scèneknop'], maak: [{ soort: 'knop', doel: 'sceneknop' }] },
      { id: 'stil', icoon: 'circle-slash', naam: ['Не сталося', 'Bleef uit'], sub: ['немає руху певний час', 'een tijd geen beweging'], maak: [{ soort: 'stil', doel: 'beweginghal', min: 30 }] },
      { id: 'groep', icoon: 'layers', naam: ['Група', 'Groep'], sub: ['будь-яке вікно відчинене', 'een raam staat open'], maak: [{ soort: 'open', doel: 'raamslaap', min: 5 }, { soort: 'open', doel: 'raamkinder', min: 5 }] }
    ],
    a: [
      { id: 'donker', icoon: 'moon', naam: ['Темно', 'Donker'], sub: ['від заходу до сходу сонця', 'van zonsondergang tot -opkomst'], maak: [{ soort: 'donker' }] },
      { id: 'stand', icoon: 'house', naam: ['Режим дому', 'Huisstand'], sub: ['лише в обраному режимі', 'alleen in een gekozen stand'], maak: [{ soort: 'stand', stand: 'thuis' }] },
      { id: 'aanwezig', icoon: 'users', naam: ['Присутність', 'Aanwezigheid'], sub: ['хтось удома чи нікого', 'iemand thuis of niemand'], maak: [{ soort: 'aanwezig', wie: 'iemand' }] },
      { id: 'venster', icoon: 'clock', naam: ['Проміжок часу', 'Tijdvak'], sub: ['між двома годинами', 'tussen twee tijden'], maak: [{ soort: 'venster', van: 22, tot: 7 }] },
      { id: 'dicht', icoon: 'door-closed', naam: ['Двері й вікна', 'Deuren en ramen'], sub: ['зачинено чи відчинено', 'dicht of open'], maak: [{ soort: 'dicht', doel: 'voordeurcontact' }] },
      { id: 'prijs', icoon: 'euro', naam: ['Ціна енергії', 'Energieprijs'], sub: ['ціна нижча за поріг', 'prijs onder een drempel'], maak: [{ soort: 'prijs', onder: 0.2 }] },
      { id: 'weer', icoon: 'cloud-rain', naam: ['Погода', 'Weer'], sub: ['дощу не обіцяють', 'geen regen verwacht'], maak: [{ soort: 'weer' }] }
    ],
    d: [
      { id: 'licht', icoon: 'lightbulb', naam: ['Світло', 'Licht'], sub: ['увімкнути, вимкнути, яскравість', 'aan, uit, helderheid'], maak: [{ soort: 'apparaat', doel: 'torsher', mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }] },
      { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат', 'Klimaat'], sub: ['ціль кімнати, вентиляція', 'kamerdoel, ventilatie'], maak: [{ soort: 'kamerdoel', kamer: 'woonkamer', waarde: 19, fout: 'doorgaan' }] },
      { id: 'scene', icoon: 'sparkles', naam: ['Сцена', 'Scène'], sub: ['запустити сцену', 'een scène starten'], maak: [{ soort: 'scene', scene: 'avond', fout: 'doorgaan' }] },
      { id: 'stand', icoon: 'house', naam: ['Режим дому', 'Huisstand'], sub: ['перейти в режим', 'naar een stand'], maak: [{ soort: 'stand', stand: 'nacht', fout: 'doorgaan' }] },
      { id: 'melding', icoon: 'bell', naam: ['Сповіщення', 'Melding'], sub: ['з діями «Схвалити · Відхилити»', 'met ‘Goedkeuren · Afwijzen’'], maak: [{ soort: 'melding', wie: 'thuis', fout: 'doorgaan' }] },
      { id: 'wacht', icoon: 'timer', naam: ['Чекати', 'Wachten'], sub: ['з межею часу', 'met een tijdsgrens'], maak: [{ soort: 'wacht', min: 5, grens: 5 }] },
      { id: 'veiligheid', icoon: 'lock-keyhole', naam: ['Двері й ворота', 'Deuren en poorten'], sub: ['замкнути, зачинити', 'vergrendelen, sluiten'], maak: [{ soort: 'apparaat', doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: true, fout: 'herhalen' }] }
    ]
  };
  function nieuwStapBlad(ctx, r, sec) {
    var lijst = INTENTIES[sec];
    var kop = sec === 'w' ? t('Що сталося?', 'Wat gebeurde er?') : sec === 'a' ? t('За якої умови?', 'Onder welke voorwaarde?') : t('Що зробити?', 'Wat moet er gebeuren?');
    return '<p class="hv-aut-bladvraag">' + h(kop) + '</p><div class="hv-intenties">' + lijst.map(function (x) {
      return '<button type="button" class="hv-intentie" data-actie="regel-voegtoe" data-regel="' + h(r.id) + '" data-sectie="' + sec + '" data-intentie="' + x.id + '" data-k="int-' + x.id + '"><span class="hv-intentie__teken">' + HV.icoon(x.icoon) + '</span><span class="hv-intentie__naam">' + h(HV.p(x.naam)) + '</span><span class="hv-intentie__sub">' + h(HV.p(x.sub)) + '</span></button>';
    }).join('') + '</div>';
  }
  /** Редактор одного кроку: параметри, стан наживо, дозвіл (для дій), «У разі помилки», «Видалити крок». */
  function stapBlad(ctx, id) {
    var r = regelUitRoute(ctx);
    if (!r) return o.leeg({ icoon: 'workflow', titel: t('Відкрийте правило, щоб редагувати крок', 'Open een regel om een stap te bewerken') });
    if (/^nieuw[wad]$/.test(id)) return nieuwStapBlad(ctx, r, id.charAt(5));
    var x = stapVan(r, id);
    if (!x.s) return o.leeg({ icoon: 'workflow', titel: t('Такого кроку немає', 'Deze stap bestaat niet') });
    var s = x.s, g = function (veld) { return { regel: r.id, sleutel: id, veld: veld }; };
    var W = wereld(), uit = '';
    var seg = function (veld, opties, waarde, label) { return o.segment({ label: label, waarde: waarde, actie: 'regel-zet', gegevens: g(veld), k: 'zet-' + veld, klas: opties.length > 3 ? 'hv-segment--rol' : '', opties: opties }); };
    var stapper = function (veld, label, waarde, stap) { return o.stapper({ label: label, waarde: waarde, actie: 'regel-stap', gegevens: g(veld), stap: stap }); };
    uit += '<p class="hv-regelzin hv-regelzin--klein">' + h(HV.p(x.sectie === 'dan' ? [groot(zinVan(x.sectie, s)[0]), groot(zinVan(x.sectie, s)[1])] : kopVan(x.sectie, s))) + '</p>';
    var staat = stapStaat(x.sectie, s, r, W);
    if (staat) uit += '<p class="hv-aut-staatrij">' + h(t('Зараз: ', 'Nu: ')) + waarheidChip(staat) + '</p>';
    switch (s.soort) {
      case 'tijd':
        uit += veld(t('Година', 'Tijdstip'), stapper('uur', t('Година', 'Tijdstip'), uurTekst(s.uur), 0.25));
        uit += veld(t('Дні тижня', 'Dagen'), '<div class="hv-filter">' + DAGEN.map(function (d, i) { return o.chip({ filter: true, gekozen: s.dagen.indexOf(i + 1) >= 0, tekst: HV.p(d), actie: 'regel-dag', gegevens: { regel: r.id, sleutel: id, dag: i + 1 }, k: 'dag-' + i }); }).join('') + '</div>');
        break;
      case 'zon':
        uit += zonBoog(ctx.staat, (s.wat === 'op' ? zon(ctx.staat.tijd).op : zon(ctx.staat.tijd).onder) + (s.min || 0) / 60);
        uit += veld(t('Подія', 'Moment'), seg('wat', [{ id: 'op', label: t('схід', 'opkomst'), icoon: 'sunrise' }, { id: 'onder', label: t('захід', 'ondergang'), icoon: 'sunset' }], s.wat, t('Подія', 'Moment')));
        uit += veld(t('Зсув', 'Verschuiving'), stapper('min', t('Зсув', 'Verschuiving'), HV.maat(s.min || 0, t('хв', 'min')), 5));
        break;
      case 'open': case 'stil':
        uit += veld(t('Довше ніж', 'Langer dan'), stapper('min', t('Довше ніж', 'Langer dan'), HV.maat(s.min, t('хв', 'min')), 5));
        break;
      case 'drempel':
        uit += veld(t('Поріг', 'Drempel'), stapper('boven', t('Поріг', 'Drempel'), HV.maat(s.boven, (GROOTHEID[app(s.doel).soort] || ['', '', ''])[2]), 5));
        uit += '<p class="hv-aut-noot">' + HV.icoon('gauge', { maat: 's' }) + '<span>' + h(t('Зараз: ', 'Nu: ') + HV.getal(app(s.doel).st.waarde) + ' ' + (GROOTHEID[app(s.doel).soort] || ['', '', ''])[2]) + '</span></p>';
        break;
      case 'aanwezig':
        if (x.sectie === 'wanneer') {
          uit += veld(t('Хто', 'Wie'), seg('wie', [{ id: 'iemand', label: t('будь-хто', 'iemand') }, { id: 'iedereen', label: t('усі', 'iedereen') }, { id: 'olena', label: t('Олена', 'Olena') }, { id: 'taras', label: t('Тарас', 'Taras') }], s.wie, t('Хто', 'Wie')));
          uit += veld(t('Подія', 'Moment'), seg('komt', [{ id: 'ja', label: t('приходить', 'komt thuis'), icoon: 'log-in' }, { id: 'nee', label: t('іде', 'vertrekt'), icoon: 'log-out' }], s.komt ? 'ja' : 'nee', t('Подія', 'Moment')));
        } else uit += veld(t('Хто', 'Wie'), seg('wie', [{ id: 'iemand', label: t('хтось удома', 'iemand thuis') }, { id: 'niemand', label: t('нікого', 'niemand') }], s.wie, t('Хто', 'Wie')));
        break;
      case 'prijs':
        uit += veld(t('Поріг ціни', 'Prijsdrempel'), stapper('onder', t('Поріг ціни', 'Prijsdrempel'), HV.euro(s.onder), 0.01));
        uit += '<p class="hv-aut-noot">' + HV.icoon('euro', { maat: 's' }) + '<span>' + h(t('Зараз ', 'Nu ') + HV.euro(HV.tarief.prijs(ctx.staat.tijd)) + t(' за кВт·год · приклад', ' per kWh · voorbeeld')) + '</span></p>';
        break;
      case 'stand':
        uit += veld(t('Режим', 'Stand'), seg('stand', STANDEN.map(function (z) { return { id: z, label: HV.p(HV.huisstanden[z]), icoon: STAND_ICOON[z] }; }), s.stand, t('Режим', 'Stand')));
        break;
      case 'venster':
        uit += veld(t('Від', 'Van'), stapper('van', t('Від', 'Van'), uurTekst(s.van), 0.5)) + veld(t('До', 'Tot'), stapper('tot', t('До', 'Tot'), uurTekst(s.tot), 0.5));
        break;
      case 'temp':
        uit += veld(t('Не холодніше', 'Minstens'), stapper('boven', t('Не холодніше', 'Minstens'), HV.maat(s.boven, '°C'), 1));
        break;
      case 'donker':
        uit += zonBoog(ctx.staat, null);
        break;
      case 'scene':
        uit += veld(t('Сцена', 'Scène'), seg('scene', ctx.staat.scenes.map(function (z) { return { id: z.id, label: HV.p(z.naam), icoon: z.icoon }; }), s.scene, t('Сцена', 'Scène')));
        break;
      case 'melding':
        uit += veld(t('Кому', 'Aan wie'), seg('wie', [{ id: 'thuis', label: t('хто вдома', 'wie thuis is') }, { id: 'olena', label: t('Олені', 'Olena') }, { id: 'taras', label: t('Тарасу', 'Taras') }, { id: 'iedereen', label: t('усім дорослим', 'alle volwassenen') }], s.wie, t('Кому', 'Aan wie')));
        break;
      case 'kamerdoel':
        uit += veld(t('Кімната', 'Kamer'), seg('kamer', ['woonkamer', 'slaapkamer', 'kinderkamer', 'werkkamer', 'badkamer'].map(function (k) { return { id: k, label: HV.p(kamer(k).naam) }; }), s.kamer, t('Кімната', 'Kamer')));
        uit += veld(t('Ціль', 'Doel'), stapper('waarde', t('Ціль', 'Doel'), HV.maat(s.waarde, '°C', 1), 0.5));
        break;
      case 'wacht':
        uit += veld(t('Тривалість', 'Duur'), stapper('min', t('Тривалість', 'Duur'), HV.maat(s.min, t('хв', 'min')), 1));
        uit += veld(t('Межа очікування', 'Grens van het wachten'), seg('grens', [{ id: 'ja', label: t('з межею', 'met grens') }, { id: 'nee', label: t('без межі', 'zonder grens') }], s.grens == null ? 'nee' : 'ja', t('Межа очікування', 'Grens van het wachten')));
        break;
      case 'apparaat':
        var a = app(s.doel);
        if (a) {
          if (s.mogelijkheid === 'aan' || s.mogelijkheid === 'laden' || s.mogelijkheid === 'afspelen') uit += veld(t('Значення', 'Waarde'), seg('waarde', [{ id: 'true', label: t('увімкнути', 'aan'), icoon: 'power' }, { id: 'false', label: t('вимкнути', 'uit'), icoon: 'circle-off' }], String(!!s.waarde), t('Значення', 'Waarde')));
          if (s.mogelijkheid === 'helderheid' || s.mogelijkheid === 'volume') uit += veld(t('Рівень', 'Niveau'), stapper('waarde', t('Рівень', 'Niveau'), HV.maat(s.waarde, '%'), 5));
          if (s.mogelijkheid === 'positie') uit += veld(t('Положення', 'Stand'), seg('waarde', [{ id: '0', label: t('закрито', 'dicht') }, { id: '50', label: '50 %' }, { id: '100', label: t('відкрито', 'open') }], String(s.waarde), t('Положення', 'Stand')));
          if (s.mogelijkheid === 'stand') uit += veld(t('Швидкість', 'Stand'), seg('waarde', [{ id: '0', label: t('вимк.', 'uit') }, { id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' }], String(s.waarde), t('Швидкість', 'Stand')));
          if (s.mogelijkheid === 'doel') uit += veld(t('Ціль', 'Doel'), stapper('waarde', t('Ціль', 'Doel'), HV.maat(s.waarde, '°C', 1), 0.5));
          if (s.mogelijkheid === 'vergrendeld') uit += veld(t('Замок', 'Slot'), seg('waarde', [{ id: 'true', label: t('замкнути', 'vergrendelen'), icoon: 'lock-keyhole' }, { id: 'false', label: t('відімкнути', 'ontgrendelen'), icoon: 'lock-keyhole-open' }], String(!!s.waarde), t('Замок', 'Slot')));
          if (s.mogelijkheid === 'open') uit += veld(t('Ворота', 'Poort'), seg('waarde', [{ id: 'false', label: t('зачинити', 'sluiten') }, { id: 'true', label: t('відчинити', 'openen') }], String(!!s.waarde), t('Ворота', 'Poort')));
          if (s.soort === 'apparaat' && (s.mogelijkheid === 'aan' || s.mogelijkheid === 'helderheid') && (a.soort === 'licht' || a.soort === 'lichtgroep')) {
            var lampen = HV.kijk.alle(function (b) { return b.soort === 'licht' || b.soort === 'lichtgroep'; }).sort(function (p, q) { return (q.id === s.doel) - (p.id === s.doel); });
            uit += veld(t('Ціль', 'Doel'), o.segment({ label: t('Ціль', 'Doel'), waarde: s.doel, actie: 'regel-zet', gegevens: g('doel'), k: 'zet-doel', klas: 'hv-segment--rol', opties: lampen.map(function (b) { return { id: b.id, label: HV.p(b.naam) + ' · ' + HV.p(kamer(b.kamer).naam) }; }) }));
          }
          uit += '<p class="hv-aut-noot">' + HV.icoon(HV.paspoort.soorten[a.soort].icoon, { maat: 's' }) + '<span>' + h(t('Зараз: ', 'Nu: ') + HV.p(HV.beschrijf(a, s.mogelijkheid, HV.huidige(a, s.mogelijkheid))) + (a.beschikbaar !== 'ok' ? ' · ' + (a.beschikbaar === 'onbereikbaar' ? HV.woord.onbereikbaar() : HV.woord.verouderd()) : '')) + '</span></p>';
        }
        break;
      default: break;
    }
    if (x.sectie === 'dan' && s.soort !== 'wacht') {
      uit += veld(t('У разі помилки', 'Bij een fout'), seg('fout', [{ id: 'herhalen', label: t('повторити', 'herhalen') }, { id: 'doorgaan', label: t('продовжити', 'doorgaan') }, { id: 'stoppen', label: t('зупинити', 'stoppen') }], s.fout || 'doorgaan', t('У разі помилки', 'Bij een fout')));
      var ac = actieVan(s);
      if (ac && ac.sleutel !== 'onbekend') uit += '<div class="hv-veld"><span class="hv-veld__label">' + h(t('Дозвіл правила на цю дію', 'Toestemming van de regel voor deze actie')) + '</span>' + o.stand({ uitvoerder: 'regel-' + r.id, actie: ac, rol: ctx.rol }) + '</div>';
    }
    var p = problemen(r).filter(function (q) { return q.stap === id; });
    if (p.length) uit += '<ul class="hv-aut-problemen">' + p.map(function (q) { return '<li class="' + (q.info ? 'is-info' : 'is-zwaar') + '">' + HV.icoon(q.info ? 'info' : 'circle-x', { maat: 's' }) + '<span>' + h(HV.p(q.tekst)) + '</span></li>'; }).join('') + '</ul>';
    uit += '<div class="hv-knoppen">' + o.knop({ tekst: t('Готово', 'Klaar'), icoon: 'check', soort: 'hoofd', actie: 'blad-sluit' }) + o.knop({ tekst: t('Видалити крок', 'Stap verwijderen'), icoon: 'trash-2', soort: 'stil', actie: 'regel-stapweg', gegevens: { regel: r.id, sleutel: id } }) + '</div>';
    return o.kaart({ inhoud: uit });
  }
  HV.blad({ soort: 'regelstap', vrij: true, icoon: function (ctx, id) { var r = regelUitRoute(ctx); if (!r || !id || /^nieuw/.test(id)) return 'plus'; var x = stapVan(r, id); return x.s ? icoonVanStap(x.sectie, x.s) : 'workflow'; },
    titel: function (ctx, id) { var r = regelUitRoute(ctx); if (!r) return t('Крок', 'Stap'); if (/^nieuw/.test(id || '')) return t('Новий крок', 'Nieuwe stap'); var x = stapVan(r, id || 'w0'); return x.s ? HV.p(naamVanStap(x.sectie, x.s)) : t('Крок', 'Stap'); },
    sub: function (ctx, id) { var r = regelUitRoute(ctx); if (!r || !id) return ''; var sec = { w: ['Коли', 'Wanneer'], a: ['Якщо', 'Als'], d: ['Тоді', 'Dan'] }[/^nieuw/.test(id) ? id.charAt(5) : id.charAt(0)]; return HV.p(r.naam) + ' · ' + HV.p(sec || ['', '']); },
    render: stapBlad });

  HV.blad({ soort: 'regelnieuw', vrij: true, icoon: 'plus', titel: ['Нове правило', 'Nieuwe regel'], sub: function () { return t('почніть із того, що сталося', 'begin met wat er gebeurde'); },
    render: function () {
      var w = HV.staat.w;
      return '<p class="hv-aut-bladvraag">' + h(t('Що сталося?', 'Wat gebeurde er?')) + '</p><div class="hv-intenties">' + INTENTIES.w.map(function (x) {
        return '<button type="button" class="hv-intentie" data-actie="regel-maak" data-intentie="' + x.id + '" data-k="nint-' + x.id + '"><span class="hv-intentie__teken">' + HV.icoon(x.icoon) + '</span><span class="hv-intentie__naam">' + h(HV.p(x.naam)) + '</span><span class="hv-intentie__sub">' + h(HV.p(x.sub)) + '</span></button>';
      }).join('') + '</div><p class="hv-aut-bladvraag">' + h(t('Або з рецепта', 'Of uit een recept')) + '</p><div class="hv-rijen">' + RECEPTEN.map(function (x) { return o.rij({ icoon: x.icoon, naam: HV.p(x.naam), actie: 'blad', gegevens: { blad: 'recept:' + x.id }, k: 'nr-' + x.id }); }).join('') + '</div>' +
        '<p class="hv-aut-noot">' + HV.icoon('pencil-line', { maat: 's' }) + '<span>' + h(t('Нове правило — завжди чернетка: воно нічого не робить, доки його не ввімкнуть.', 'Een nieuwe regel is altijd een concept: hij doet niets tot iemand hem aanzet.') + (w && w.zelfGestopt ? ' ' + t('Самостійні дії зараз зупинено.', 'Zelfstandige acties zijn nu gestopt.') : '')) + '</span></p>';
    } });

  HV.blad({ soort: 'regelpauze', vrij: true, icoon: 'pause', titel: ['Призупинити до…', 'Pauzeren tot…'],
    render: function (ctx) {
      var w = ctx.staat, X = A(w), duur = HV.ui.lees('pauze-duur', 'ochtend');
      var keuze = (HV.ui.lees('pauze-keuze', '') || '').split(',').filter(Boolean);
      var tot = pauzeTot(w, duur);
      var lijst = X.regels.filter(function (r) { return r.fase !== 'concept'; });
      return o.kaart({ inhoud: veld(t('До коли', 'Tot wanneer'), o.segment({ label: t('До коли', 'Tot wanneer'), waarde: duur, actie: 'ui', gegevens: { naam: 'pauze-duur' }, k: 'pauze-duur', opties: [{ id: 'uur', label: t('на 1 год', '1 uur') }, { id: 'ochtend', label: t('до 07:00', 'tot 07:00') }, { id: 'morgen', label: t('до завтра 18:00', 'tot morgen 18:00') }] })) +
        veld(t('Які правила', 'Welke regels'), '<div class="hv-filter">' + lijst.map(function (r) { return o.chip({ filter: true, gekozen: keuze.indexOf(r.id) >= 0, icoon: r.icoon, tekst: HV.p(r.naam), actie: 'pauze-kies', gegevens: { regel: r.id }, k: 'pk-' + r.id }); }).join('') + '</div>') +
        '<p class="hv-aut-noot">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Пауза режимів дозволів не змінює. «Зупинити самостійні дії» для всього дому — у Команді й аварійному шарі.', 'Een pauze verandert geen toestemmingen. ‘Zelfstandige acties stoppen’ voor het hele huis staat in Opdracht en de noodlaag.')) + '</span></p>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Призупинити вибрані', 'Gekozen pauzeren') + ' (' + keuze.length + ') ' + t('до ', 'tot ') + HV.tijd(tot), icoon: 'pause', soort: 'hoofd', actie: 'pauze-doe' }) +
        o.gevolg(t('Що станеться: вибрані правила не спрацюють до ', 'Wat er gebeurt: de gekozen regels gaan niet af tot ') + HV.tijd(tot) + t('. Пов’язано з: ручне керування й сцени працюють як завжди. Як повернути: «Продовжити» на сторінці правила.', '. Hangt samen met: handmatige bediening en scènes werken gewoon. Terugdraaien: ‘Hervatten’ op de pagina van de regel.')) + '</div>' });
    } });
  function pauzeTot(w, duur) {
    var d0 = dagBegin(w.tijd);
    if (duur === 'uur') return w.tijd + UUR;
    if (duur === 'morgen') return d0 + DAG + 18 * UUR;
    var m = d0 + 7 * UUR; return m > w.tijd ? m : m + DAG;
  }

  HV.blad({ soort: 'regelopslaan', vrij: true, icoon: 'save', titel: ['Перед збереженням', 'Voor het opslaan'],
    render: function (ctx) {
      var r = regelUitRoute(ctx);
      if (!r) return o.leeg({ icoon: 'save', titel: t('Відкрийте правило', 'Open een regel') });
      var p = problemen(r).filter(function (x) { return x.zwaar; }), c = conflicten(r);
      return o.kaart({ inhoud: (p.length ? '<h3 class="hv-kaart__titel">' + h(t('Проблеми', 'Problemen')) + '</h3><ul class="hv-aut-problemen">' + p.map(function (x) { return '<li class="is-zwaar">' + HV.icoon('circle-x', { maat: 's' }) + '<span>' + h(HV.p(x.tekst)) + '</span></li>'; }).join('') + '</ul>' : '') +
        (c.length ? '<h3 class="hv-kaart__titel">' + h(t('Конфлікт з іншими правилами', 'Conflict met andere regels')) + '</h3><ul class="hv-aut-problemen">' + c.map(function (x) { return '<li class="is-let">' + HV.icoon('split', { maat: 's' }) + '<span>' + h(HV.p(x.tekst)) + '</span></li>'; }).join('') + '</ul>' +
          '<p class="hv-aut-noot">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Порядок: безпека > вручну > режим > комфорт > економія. Пізніший запуск перезапише попередній.', 'Volgorde: veiligheid > handmatig > stand > comfort > besparing. Een latere start overschrijft de vorige.')) + '</span></p>' : '') +
        '<div class="hv-knoppen">' + (c.length ? o.knop({ tekst: t('Показати обидві', 'Beide tonen'), icoon: 'split', actie: 'ga', gegevens: { naar: 'automatiseringen-regel-' + c[0].regel } }) : '') +
        o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'blad-sluit' }) + o.knop({ tekst: t('Зберегти попри це', 'Toch opslaan'), icoon: 'save', soort: 'hoofd', actie: 'regel-opslaan', gegevens: { regel: r.id, ondanks: '1' } }) + '</div>' });
    } });

  HV.blad({ soort: 'recept', vrij: true, icoon: 'list-checks', titel: function (ctx, id) { var x = RECEPTEN.filter(function (y) { return y.id === id; })[0]; return x ? HV.p(x.naam) : t('Рецепт', 'Recept'); },
    sub: function () { return t('кілька запитань — і чернетка готова', 'een paar vragen — en het concept staat klaar'); },
    render: function (ctx, id) {
      var x = RECEPTEN.filter(function (y) { return y.id === id; })[0];
      if (!x) return '';
      var k = receptKeuze(x);
      var bouw = x.bouw(k), zin = regelZin({ wanneer: bouw.wanneer, als: bouw.als, dan: bouw.dan });
      return o.kaart({ inhoud: x.vragen.map(function (v) { return veld(HV.p(v.naam), o.segment({ label: HV.p(v.naam), waarde: k[v.id], actie: 'ui', gegevens: { naam: 'recept-' + x.id + '-' + v.id }, k: 'rv-' + v.id, opties: v.opties.map(function (op) { return { id: op[0], label: HV.p(op[1]) }; }) })); }).join('') }) +
        o.kaart({ titel: t('Що зробить цей рецепт', 'Wat dit recept doet'), inhoud: '<p class="hv-regelzin hv-regelzin--klein">' + h(HV.p(zin)) + '</p>' +
          '<p class="hv-aut-noot">' + HV.icoon('pencil-line', { maat: 's' }) + '<span>' + h(t('Рецепт створює чернетку: вона нічого не робить, доки ви не переведете її в «Спостереження» чи «Увімкнено».', 'Een recept maakt een concept: het doet niets tot je het op ‘Meekijken’ of ‘Aan’ zet.')) + '</span></p>' +
          '<div class="hv-knoppen">' + o.knop({ tekst: t('Створити чернетку', 'Concept maken'), icoon: 'plus', soort: 'hoofd', actie: 'recept-maak', gegevens: { recept: x.id } }) + '</div>' });
    } });
  function receptKeuze(x) { var k = {}; x.vragen.forEach(function (v) { k[v.id] = HV.ui.lees('recept-' + x.id + '-' + v.id, v.opties[0][0]); }); return k; }

  HV.blad({ soort: 'reeks', vrij: true, icoon: 'list-ordered', titel: function (ctx, id) { var x = REEKSEN.filter(function (y) { return y.id === id; })[0]; return x ? HV.p(x.naam) : t('Послідовність', 'Reeks'); },
    sub: function () { return t('діє від вашого імені', 'werkt namens jou'); },
    render: function (ctx, id) {
      var x = REEKSEN.filter(function (y) { return y.id === id; })[0];
      if (!x) return '';
      var v = reeksWaarden(x), stappen = x.stappen(v);
      var niveau = 'gewoon', rang = { gewoon: 0, gevoelig: 1, gevaarlijk: 2, kritiek: 3 };
      stappen.forEach(function (s) { var a = actieVan(s); if (a && rang[a.niveau] > rang[niveau]) niveau = a.niveau; });
      return '<div class="hv-formulier" role="group" aria-label="' + h(t('Поля послідовності', 'Velden van de reeks')) + '" data-k="reeksform">' + o.kaart({ inhoud: (x.velden.length ? x.velden.map(function (f) { return veld(HV.p(f.naam), o.stapper({ label: HV.p(f.naam), waarde: HV.maat(v[f.id], HV.p(f.eenheid)), actie: 'reeks-veld', gegevens: { reeks: x.id, veld: f.id }, stap: f.stap })); }).join('') : '<p class="hv-tekst hv-tekst--zacht">' + h(t('Без полів — лише кроки.', 'Zonder velden — alleen stappen.')) + '</p>') }) + '</div>' +
        o.kaart({ titel: t('Кроки', 'Stappen'), inhoud: '<ol class="hv-wasword">' + stappen.map(function (s, i) { return '<li class="hv-wasword__rij" data-k="rk-' + i + '"><span class="hv-wasword__teken">' + HV.icoon(icoonVanStap('dan', s)) + '</span><span class="hv-wasword__tekst"><span class="hv-wasword__naam">' + h(groot(HV.p(zinVan('dan', s)))) + '</span></span></li>'; }).join('') + '</ol>' +
          '<p class="hv-aut-staatrij">' + h(t('Рівень послідовності: ', 'Niveau van de reeks: ')) + o.risico(niveau) + '</p>' +
          '<div class="hv-knoppen">' + o.knop({ tekst: t('Запустити', 'Starten'), icoon: 'play', soort: 'hoofd', actie: 'reeks-start', gegevens: { reeks: x.id } }) +
          o.gevolg(t('Що станеться: кроки виконаються по черзі від вашого імені; очікування йде за часом дому. Пов’язано з: кожен крок — запис у Журналі. Як повернути: «Повернути» у сповіщенні після завершення.', 'Wat er gebeurt: de stappen lopen na elkaar namens jou; wachten volgt de huistijd. Hangt samen met: elke stap komt in het logboek. Terugdraaien: ‘Ongedaan maken’ in de melding na afloop.')) + '</div>' });
    } });
  function reeksWaarden(x) { var v = {}; x.velden.forEach(function (f) { v[f.id] = Number(HV.ui.lees('reeks-' + x.id + '-' + f.id, f.standaard)); }); return v; }

  // ───────────────────────── Сцени ─────────────────────────
  function sceneNiveau(s) {
    var a = app(s.doel); if (!a) return null;
    if (s.mogelijkheid === 'aan') return s.waarde ? 100 : 4;
    if (s.mogelijkheid === 'helderheid' || s.mogelijkheid === 'positie' || s.mogelijkheid === 'volume') return Math.max(4, Number(s.waarde));
    if (s.mogelijkheid === 'doel') return Math.max(4, Math.min(100, (Number(s.waarde) - 12) / 12 * 100));
    if (s.mogelijkheid === 'vergrendeld' || s.mogelijkheid === 'afspelen') return s.waarde ? 100 : 4;
    if (s.mogelijkheid === 'kleurtemp') return Math.max(4, (Number(s.waarde) - 2000) / 45);
    return 50;
  }
  function handmatig(scene) {
    var n = 0;
    scene.stappen.forEach(function (s) { var a = app(s.doel); if (!a || a.beschikbaar === 'onbereikbaar') return; if (String(HV.huidige(a, s.mogelijkheid)) !== String(s.waarde)) n++; });
    return n;
  }
  function sceneTegel(scene, w) {
    var actief = w.sceneActief === scene.id;
    var kamers = []; scene.stappen.forEach(function (s) { var a = app(s.doel); if (a && kamers.indexOf(a.kamer) < 0) kamers.push(a.kamer); });
    var zwaar = scene.stappen.some(function (s) { var a = app(s.doel); return a && HV.gevaar.isZwaar(HV.gevaar.vind(a, s.mogelijkheid, s.waarde)); });
    var staven = scene.stappen.filter(function (s) { return s.mogelijkheid !== 'kleurtemp'; }).slice(0, 10).map(function (s) { var n = sceneNiveau(s); return n == null ? '' : '<i style="height:' + Math.round(n) + '%"></i>'; }).join('');
    var hand = actief ? handmatig(scene) : 0;
    return '<article class="hv-scenetegel' + (actief ? ' is-actief' : '') + '" data-k="st-' + h(scene.id) + '">' +
      '<button type="button" class="hv-scenetegel__start" data-actie="aut-scene" data-scene="' + h(scene.id) + '" aria-label="' + h(t('Запустити сцену ', 'Scène starten: ') + HV.p(scene.naam)) + '">' + HV.icoon(scene.icoon, { maat: 'l' }) + '</button>' +
      '<button type="button" class="hv-scenetegel__lijf" data-actie="ga" data-naar="automatiseringen-scene-' + h(scene.id) + '"><span class="hv-scenetegel__naam">' + h(HV.p(scene.naam)) + '</span>' +
      '<span class="hv-scenetegel__sub">' + h(scene.stappen.length + ' ' + HV.meervoud(scene.stappen.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']) + ' · ' + kamers.length + ' ' + HV.meervoud(kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers'])) + '</span>' +
      '<span class="hv-scenetegel__staven" aria-hidden="true">' + staven + '</span></button>' +
      '<div class="hv-scenetegel__chips">' + (actief ? o.chip({ icoon: 'circle-check', toon: 'rust', tekst: t('активна', 'actief') }) : '') + (zwaar ? o.risico('gevaarlijk') : '') +
      (hand ? o.chip({ icoon: 'hand', toon: 'let-op', tekst: t('змінено вручну: ', 'handmatig gewijzigd: ') + hand }) + o.knop({ tekst: t('Застосувати знову', 'Opnieuw toepassen'), klein: true, soort: 'stil', actie: 'aut-scene', gegevens: { scene: scene.id } }) : '') + '</div></article>';
  }
  /** Сцена людиною: небезпечні кроки людина підтверджує сама в hv-gevaar; потім — «10 із 12 підтверджено». */
  function startScene(id, alleenRest) {
    var w = HV.staat.w, scene = sceneVan(id);
    if (!scene) return;
    var zware = scene.stappen.filter(function (s) { var a = app(s.doel); return a && HV.gevaar.isZwaar(HV.gevaar.vind(a, s.mogelijkheid, s.waarde)); });
    var voor = kopie({ apparaten: w.apparaten, huisstand: w.huisstand, kamers: w.kamers, sceneActief: w.sceneActief });
    var verder = function () {
      var p;
      if (alleenRest) {
        var rest = scene.stappen.filter(function (s) { var a = app(s.doel); return a && a.beschikbaar !== 'onbereikbaar' && String(HV.huidige(a, s.mogelijkheid)) !== String(s.waarde); });
        p = Promise.all(rest.map(function (s) { return HV.doe({ doel: s.doel, mogelijkheid: s.mogelijkheid, waarde: s.waarde, stil: true, zonderRitueel: true, waarom: ['повтор для решти сцени «' + scene.naam[0] + '»', 'herhaling voor de rest van scène ‘' + scene.naam[1] + '’'] }); }));
      } else {
        p = HV.doe({ doel: 'scene:' + id, mogelijkheid: 'start', waarde: true, stil: true }).then(function () {
          return Promise.all(zware.map(function (s) { return HV.doe({ doel: s.doel, mogelijkheid: s.mogelijkheid, waarde: s.waarde, stil: true, zonderRitueel: true, waarom: ['через сцену «' + scene.naam[0] + '», підтверджено людиною', 'via scène ‘' + scene.naam[1] + '’, bevestigd door een mens'] }); }));
        });
      }
      p.then(function () {
        var totaal = scene.stappen.length, ok = totaal - handmatig(scene);
        HV.meld({ maker: HV.mens(), icoon: scene.icoon, titel: t('Сцена «', 'Scène ‘') + HV.p(scene.naam) + t('»: ', '’: ') + ok + t(' із ', ' van ') + totaal + t(' підтверджено', ' bevestigd'),
          tekst: ok < totaal ? t('Решта не відповіла або недоступна — можна повторити для решти.', 'De rest antwoordde niet of is niet bereikbaar — herhaal voor de rest.') : t('Усі пристрої підтвердили стан.', 'Alle apparaten bevestigden hun toestand.'),
          terug: function () {
            HV.staat.wijzig(function (x) { x.apparaten = voor.apparaten; x.huisstand = voor.huisstand; x.kamers = voor.kamers; x.sceneActief = voor.sceneActief; });
            HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто сцену «' + scene.naam[0] + '»', 'Scène ‘' + scene.naam[1] + '’ ongedaan gemaakt'], soort: 'huis.automatisering' });
            HV.klok.stap(0);
          } });
        if (ok < totaal) A().sceneHandmatig[id] = totaal - ok;
      });
    };
    if (zware.length && !alleenRest && HV.schil && HV.schil.gevaar) {
      var a0 = app(zware[0].doel), act = HV.gevaar.vind(a0, zware[0].mogelijkheid, zware[0].waarde);
      HV.schil.gevaar({ actie: act, naam: t('Сцена «', 'Scène ‘') + HV.p(scene.naam) + t('»: ', '’: ') + HV.p(act.naam), apparaat: a0, waarde: zware[0].waarde }).then(function (ja) { if (ja) verder(); });
      return;
    }
    verder();
  }

  var DAGDEEL = [['ochtend', ['Ранок', 'Ochtend'], 6, 12], ['middag', ['День', 'Middag'], 12, 18], ['avond', ['Вечір', 'Avond'], 18, 23], ['nacht', ['Ніч', 'Nacht'], 23, 6]];
  function dagdeelNu(w) { var u = HV.uur(w.tijd); return u >= 6 && u < 12 ? 'ochtend' : u >= 12 && u < 18 ? 'middag' : u >= 18 && u < 23 ? 'avond' : 'nacht'; }
  function standGevolg(stand, w) {
    var lampen = HV.kijk.lampenAan().length;
    if (stand === 'afwezig') return ['вимкнуться ' + lampen + ' ' + HV.meervoud(lampen, ['лампа', 'лампи', 'ламп'], ['lamp', 'lampen']) + ' і медіа; опалення 17 °C', lampen + ' ' + (lampen === 1 ? 'lamp' : 'lampen') + ' en media gaan uit; verwarming 17 °C'];
    if (stand === 'vakantie') return ['усе світло й медіа вимкнуться; опалення 15 °C до повернення', 'alle lampen en media uit; verwarming 15 °C tot je terug bent'];
    if (stand === 'nacht') return ['світло внизу вимкнеться, нічники лишаться; опалення 17,5 °C', 'het licht beneden gaat uit, nachtlampjes blijven aan; verwarming 17,5 °C'];
    if (stand === 'gasten') return ['сцени й клімат як є; гостьовий код дверей діє', 'scènes en klimaat blijven; de gastcode van de deur werkt'];
    return ['опалення 21 °C; автоматика за розкладом', 'verwarming 21 °C; automatisering volgens rooster'];
  }
  function regieRij(w, X, zonderVast) {
    var vast = X.vast && X.vast.tot > w.tijd;
    var knop = vast ? o.knop({ tekst: t('Відновити автоматику', 'Automatisering hervatten'), icoon: 'rotate-ccw', klein: true, actie: 'stand-vast', gegevens: { tot: '' } })
      : zonderVast ? '' : o.knop({ tekst: t('Зафіксувати до 22:00', 'Vastzetten tot 22:00'), icoon: 'hand', klein: true, actie: 'stand-vast', gegevens: { tot: '22' } });
    return '<div class="hv-regie' + (vast ? ' is-vast' : '') + '" data-k="regie">' + HV.icoon(vast ? 'hand' : 'workflow', { maat: 's' }) + '<span class="hv-regie__tekst">' + h(vast ? t('Керує зараз: вручну до ', 'Stuurt nu: handmatig tot ') + HV.tijd(X.vast.tot) + ' · ' + HV.p(X.vast.wie) : t('Керує зараз: автоматика — переходи режимів', 'Stuurt nu: automatisering — overgangen van standen')) + '</span>' +
      '<span class="hv-regie__acties">' + knop + o.gevolg(t('Що станеться: переходи режимів не змінюватимуть режим до вказаного часу. Пов’язано з: порядок — безпека > вручну > режим > комфорт > економія. Як повернути: «Відновити автоматику».', 'Wat er gebeurt: overgangen veranderen de stand niet tot het gekozen tijdstip. Hangt samen met: volgorde — veiligheid > handmatig > stand > comfort > besparing. Terugdraaien: ‘Automatisering hervatten’.')) + '</span></div>';
  }
  function scenesPagina(ctx) {
    var w = ctx.staat, X = A(w);
    var kf = HV.ui.lees('sc-kamer', 'alle');
    var kamers = []; w.scenes.forEach(function (s) { s.stappen.forEach(function (st) { var a = app(st.doel); if (a && kamers.indexOf(a.kamer) < 0) kamers.push(a.kamer); }); });
    var lijst = w.scenes.filter(function (s) { return kf === 'alle' || s.stappen.some(function (st) { var a = app(st.doel); return a && a.kamer === kf; }); });
    var actief = sceneVan(w.sceneActief);
    var kop = '<section class="hv-aut-held hv-aut-held--scenes" data-k="sc-held"><div class="hv-aut-held__tekst"><p class="hv-aut-held__zin">' + h(actief ? t('Діє сцена «', 'Actief: scène ‘') + HV.p(actief.naam) + t('»', '’') + (handmatig(actief) ? t(' · змінено вручну: ', ' · handmatig gewijzigd: ') + handmatig(actief) : '') + '. ' : '') + h(t('Режим дому: «', 'Huisstand: ‘') + HV.p(HV.huisstanden[w.huisstand]) + t('».', '’.')) + '</p>' +
      regieRij(w, X) + '</div><div class="hv-aut-held__knoppen">' + o.knop({ tekst: t('Зберегти поточне', 'Huidige stand opslaan'), icoon: 'camera', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'scenenieuw' } }) +
      o.knop({ tekst: t('Вимкнути все світло', 'Alle lampen uit'), icoon: 'lightbulb-off', actie: 'aut-alles', gegevens: { wat: 'licht' } }) +
      o.knop({ tekst: t('Вимкнути все в домі', 'Alles in huis uit'), icoon: 'power', actie: 'aut-alles', gegevens: { wat: 'alles' } }) + '</div></section>';

    var filter = o.segment({ label: t('Кімната', 'Kamer'), waarde: kf, actie: 'ui', gegevens: { naam: 'sc-kamer' }, klas: 'hv-segment--rol', k: 'sc-k', opties: [{ id: 'alle', label: t('Усі кімнати', 'Alle kamers') }].concat(kamers.map(function (k) { return { id: k, label: HV.p(kamer(k).naam) }; })) });
    var tegels = o.blok({ id: 'sc-tegels', titel: t('Сцени', 'Scènes'), teller: lijst.length, vast: true,
      uitleg: t('Що станеться: коло запускає сцену одразу; недоступні пристрої буде пропущено й названо. Пов’язано з: сцена з небезпечним кроком спершу просить підтвердження. Як повернути: «Повернути» у сповіщенні протягом 10 с.', 'Wat er gebeurt: de cirkel start de scène direct; onbereikbare apparaten worden overgeslagen en genoemd. Hangt samen met: een scène met een gevaarlijke stap vraagt eerst om bevestiging. Terugdraaien: ‘Ongedaan maken’ in de melding binnen 10 s.'),
      inhoud: filter + (lijst.length ? '<div class="hv-scenetegels">' + lijst.map(function (s) { return sceneTegel(s, w); }).join('') + '</div>' : o.leeg({ icoon: 'filter', titel: t('За цим фільтром нічого немає', 'Niets gevonden met dit filter'), actie: { tekst: t('Скинути фільтр', 'Filter wissen'), actie: 'ui', gegevens: { naam: 'sc-kamer', waarde: 'alle' } } })) });

    var dd = dagdeelNu(w);
    var dagdeel = o.blok({ id: 'sc-dagdeel', titel: t('Добова сцена', 'Dagdeelscène'), inhoud: '<div class="hv-kaart hv-dagdeel">' +
      '<div class="hv-dagdeel__rij">' + DAGDEEL.map(function (d) {
        var sid = X.dagdeel[d[0]], sc = sid ? sceneVan(sid) : null;
        return '<button type="button" class="hv-dagdeel__deel' + (d[0] === dd ? ' is-nu' : '') + '" data-actie="dagdeel-wissel" data-deel="' + d[0] + '" data-k="dd-' + d[0] + '"><span class="hv-dagdeel__naam">' + h(HV.p(d[1])) + '</span><span class="hv-dagdeel__uren">' + uurTekst(d[2]) + '–' + uurTekst(d[3]) + '</span><span class="hv-dagdeel__scene">' + (sc ? HV.icoon(sc.icoon, { maat: 's' }) + h(HV.p(sc.naam)) : h(t('без сцени', 'geen scène'))) + '</span></button>';
      }).join('') + '</div><p class="hv-aut-noot">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Дотик до частини доби змінює її сцену. Кнопка нижче запускає сцену поточної частини; повторний натиск протягом хвилини гортає до наступної.', 'Een tik op een dagdeel wisselt de scène. De knop hieronder start de scène van nu; nog eens drukken binnen een minuut bladert naar het volgende dagdeel.')) + '</span></p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Запустити добову сцену', 'Dagdeelscène starten'), icoon: 'play', soort: 'hoofd', actie: 'dagdeel-start' }) + '</div></div>' });

    // Режими дому
    var standen = '<div class="hv-standkaarten">' + STANDEN.map(function (s) {
      var nu = w.huisstand === s;
      var regels = X.regels.filter(function (r) { return r.fase === 'aan' && !r.uit && r.standen.indexOf(s) >= 0; }).length;
      return '<article class="hv-standkaart' + (nu ? ' is-nu' : '') + '" data-k="sk-' + s + '"><button type="button" class="hv-standkaart__lijf" data-actie="ga" data-naar="automatiseringen-stand-' + s + '">' +
        '<span class="hv-standkaart__teken">' + HV.icoon(STAND_ICOON[s], { maat: 'l' }) + '</span><span class="hv-standkaart__naam">' + h(HV.p(HV.huisstanden[s])) + (nu ? ' <span class="hv-standkaart__nu">' + h(t('зараз', 'nu')) + '</span>' : '') + '</span>' +
        '<span class="hv-standkaart__gevolg">' + h(groot(HV.p(standGevolg(s, w)))) + '</span><span class="hv-standkaart__meta">' + h(regels + ' ' + HV.meervoud(regels, ['правило діє', 'правила діють', 'правил діють'], ['regel werkt', 'regels werken'])) + '</span></button>' +
        '<div class="hv-standkaart__voet">' + (nu ? o.knop({ gedrukt: true, tekst: t('Діє', 'Actief'), klein: true }) : o.knop({ tekst: s === 'vakantie' ? t('Їдемо…', 'We gaan…') : t('Перейти', 'Overschakelen'), klein: true, actie: s === 'vakantie' ? 'blad' : 'huisstand', gegevens: s === 'vakantie' ? { blad: 'vertrek' } : { waarde: s } })) + '</div></article>';
    }).join('') + '</div>';
    var standBlok = o.blok({ id: 'sc-standen', titel: t('Режими дому', 'Huisstanden'), teller: 5,
      uitleg: t('Що станеться: режим змінює світло, клімат і те, які правила діють. Пов’язано з: режим ніколи не знімає охорону й не відмикає двері. Як повернути: «Повернути» протягом 10 с або оберіть інший режим.', 'Wat er gebeurt: de stand verandert licht, klimaat en welke regels werken. Hangt samen met: een stand zet nooit het alarm uit en ontgrendelt geen deuren. Terugdraaien: ‘Ongedaan maken’ binnen 10 s of kies een andere stand.'),
      inhoud: standen });

    // матриця «автоматизація × режим»
    var rij = X.regels.filter(function (r) { return r.fase !== 'concept'; });
    var matrix = '<div class="hv-tabel__rol"><table class="hv-matrix"><thead><tr><th scope="col">' + h(t('Правило', 'Regel')) + '</th>' + STANDEN.map(function (s) { return '<th scope="col"><span class="hv-matrix__kop">' + HV.icoon(STAND_ICOON[s], { maat: 's' }) + '<span>' + h(HV.p(HV.huisstanden[s])) + '</span></span></th>'; }).join('') + '</tr></thead><tbody>' +
      rij.map(function (r) { return '<tr data-k="mx-' + r.id + '"><th scope="row"><button type="button" class="hv-matrix__regel" data-actie="ga" data-naar="automatiseringen-regel-' + r.id + '">' + HV.icoon(r.icoon, { maat: 's' }) + '<span>' + h(HV.p(r.naam)) + '</span></button></th>' + STANDEN.map(function (s) {
        var aan = r.standen.indexOf(s) >= 0;
        return '<td><button type="button" class="hv-matrix__cel' + (aan ? ' is-aan' : '') + '" aria-pressed="' + (aan ? 'true' : 'false') + '" aria-label="' + h(HV.p(r.naam) + ' · ' + HV.p(HV.huisstanden[s]) + ': ' + (aan ? t('діє', 'werkt') : t('не діє', 'werkt niet'))) + '" data-actie="matrix" data-regel="' + r.id + '" data-stand="' + s + '">' + HV.icoon(aan ? 'check' : 'minus', { maat: 's' }) + '</button></td>';
      }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    var matrixBlok = o.blok({ id: 'sc-matrix', titel: t('Правила × режими', 'Regels × standen'), dicht: false, inhoud: '<div class="hv-kaart">' + matrix + '</div>' });

    var overgangen = o.blok({ id: 'sc-overgangen', titel: t('Переходи', 'Overgangen'), teller: X.overgangen.filter(function (g) { return g.aan; }).length,
      inhoud: '<div class="hv-kaart">' + X.overgangen.map(overgangRij).join('') + '</div>' });

    return '<div class="hv-aut hv-aut-scenes" data-k="aut-scenes">' + kop + '<div class="hv-aut-rooster"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + tegels + standBlok + matrixBlok + '</div><div class="hv-aut-kolom">' + dagdeel + overgangen + '</div></div></div>';
  }
  function overgangRij(g) {
    return '<div class="hv-overgang" data-k="og-' + g.id + '">' + o.schakel({ aan: g.aan, icoon: g.icoon, toon: 'neutraal', actie: 'overgang-schakel', gegevens: { overgang: g.id }, aria: HV.p(overgangZin(g)) }) +
      '<p class="hv-overgang__zin">' + h(HV.p(overgangZin(g))) + '</p>' +
      (g.min != null ? o.stapper({ label: t('Затримка', 'Vertraging'), waarde: HV.maat(g.min, t('хв', 'min')), actie: 'overgang-stap', gegevens: { overgang: g.id, veld: 'min' }, stap: 5 }) : g.uur != null ? o.stapper({ label: t('Година', 'Tijdstip'), waarde: uurTekst(g.uur), actie: 'overgang-stap', gegevens: { overgang: g.id, veld: 'uur' }, stap: 0.5 }) : '') + '</div>';
  }

  function scenePagina(ctx) {
    var w = ctx.staat, X = A(w), scene = sceneVan(ctx.route.object);
    if (!scene) return o.leeg({ icoon: 'sparkles', titel: t('Такої сцени немає', 'Deze scène bestaat niet'), actie: { tekst: t('До сцен', 'Naar de scènes'), actie: 'ga', gegevens: { naar: 'automatiseringen-scenes' } } });
    var proef = X.proef && X.proef.scene === scene.id ? X.proef : null;
    // кроки згруповано: кімната → пристрій (кілька можливостей одного пристрою — один рядок)
    var groepen = {}, perApp = {};
    scene.stappen.forEach(function (s) {
      var a = app(s.doel); if (!a) return;
      if (!perApp[a.id]) { perApp[a.id] = { a: a, stappen: [] }; (groepen[a.kamer] = groepen[a.kamer] || []).push(perApp[a.id]); }
      perApp[a.id].stappen.push(s);
    });
    var waarden = function (a, lijst, nu) { return lijst.filter(function (s) { return !(s.mogelijkheid === 'aan' && s.waarde && lijst.length > 1 && !nu); }).map(function (s) { return HV.p(HV.beschrijf(a, s.mogelijkheid, nu ? HV.huidige(a, s.mogelijkheid) : s.waarde)); }).join(' · '); };
    var aantal = 0, bevestigd = 0;
    var rijen = Object.keys(groepen).map(function (k) {
      var km = kamer(k);
      return '<div class="hv-scenegroep" data-k="sg-' + k + '"><h4 class="hv-aut-tussenkop">' + (km ? HV.icoon(km.icoon, { maat: 's' }) + h(HV.p(km.naam)) : '') + '</h4><ol class="hv-wasword">' + groepen[k].map(function (x) {
        var a = x.a, lijst = x.stappen;
        var gelijk = lijst.every(function (s) { return String(HV.huidige(a, s.mogelijkheid)) === String(s.waarde); });
        var onb = a.beschikbaar === 'onbereikbaar';
        aantal++; if (gelijk && !onb) bevestigd++;
        return '<li class="hv-wasword__rij' + (onb ? ' is-onbekend' : '') + (gelijk ? ' is-gelijk' : '') + '" data-k="ss-' + a.id + '"><span class="hv-wasword__teken">' + HV.icoon(HV.paspoort.soorten[a.soort].icoon) + '</span><span class="hv-wasword__tekst"><span class="hv-wasword__naam">' + h(HV.p(a.naam)) + '</span>' +
          '<span class="hv-wasword__delta"><span class="hv-wasword__was">' + h(t('зараз ', 'nu ') + waarden(a, lijst, true)) + '</span>' + HV.icoon('arrow-right', { maat: 's' }) + '<span class="hv-wasword__wordt is-intentie">' + h(t('буде ', 'wordt ') + waarden(a, lijst, false)) + '</span></span>' +
          (onb ? '<span class="hv-wasword__noot">' + h(t('недоступний — буде пропущено', 'niet bereikbaar — wordt overgeslagen')) + '</span>' : gelijk ? '<span class="hv-wasword__noot">' + HV.icoon('check', { maat: 'maker' }) + ' ' + h(t('уже так', 'staat al zo')) + '</span>' : '') + '</span>' +
          o.icoonknop({ icoon: 'x', aria: t('Прибрати з сцени: ', 'Uit de scène halen: ') + HV.p(a.naam), actie: 'scene-stapweg', gegevens: { scene: scene.id, doel: a.id } }) + '</li>';
      }).join('') + '</ol></div>';
    }).join('');
    var meter = aantal ? '<div class="hv-scenemeter" data-k="scenemeter"><span class="hv-scenemeter__getal">' + bevestigd + '<span>/' + aantal + '</span></span><span class="hv-scenemeter__tekst">' + h(t('пристроїв уже в стані сцени', 'apparaten staan al zoals de scène')) + '</span><span class="hv-scenemeter__balk" aria-hidden="true"><i style="width:' + Math.round(bevestigd / aantal * 100) + '%"></i></span></div>' : '';
    var regels = X.regels.filter(function (r) { return werkVan(r).dan.some(function (s) { return s.soort === 'scene' && s.scene === scene.id; }); });
    var proefBalk = proef ? '<div class="hv-aut-werk is-proef" role="status" data-k="sc-proef">' + HV.icoon('flask-conical', { maat: 's' }) + '<span class="hv-aut-werk__tekst">' + h(t('Перегляд наживо: сцену застосовано на пробу. Без збереження дім повернеться до попереднього стану.', 'Live proberen: de scène is op proef toegepast. Zonder opslaan keert het huis terug naar de vorige stand.')) + '</span>' +
      o.knop({ tekst: t('Повернути як було', 'Terug naar hoe het was'), icoon: 'undo-2', klein: true, actie: 'scene-proef-terug' }) + o.knop({ tekst: t('Залишити', 'Zo laten'), icoon: 'check', soort: 'hoofd', klein: true, actie: 'scene-proef-houd' }) + '</div>' : '';
    var eigen = /^eigen/.test(scene.id);
    return '<div class="hv-aut hv-aut-scene" data-k="scene-' + h(scene.id) + '">' + subKop({ icoon: scene.icoon, actief: w.sceneActief === scene.id, pad: ['automatiseringen-scenes', t('Сцени й режими', 'Scènes en standen')], titel: HV.p(scene.naam), sub: scene.stappen.length + ' ' + HV.meervoud(scene.stappen.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']) + (w.sceneActief === scene.id ? t(' · активна', ' · actief') : '') }) +
      proefBalk + '<div class="hv-aut-acties">' + o.knop({ tekst: t('Запустити', 'Starten'), icoon: 'play', soort: 'hoofd', actie: 'aut-scene', gegevens: { scene: scene.id } }) +
      (proef ? '' : o.knop({ tekst: t('Перегляд наживо', 'Live proberen'), icoon: 'eye', actie: 'scene-proef', gegevens: { scene: scene.id } })) +
      o.knop({ tekst: t('Оновити з поточного стану', 'Bijwerken uit de huidige stand'), icoon: 'camera', actie: 'scene-bijwerken', gegevens: { scene: scene.id } }) +
      (eigen ? o.knop({ tekst: t('Видалити сцену', 'Scène verwijderen'), icoon: 'trash-2', soort: 'stil', actie: 'scene-weg', gegevens: { scene: scene.id } }) : '') + '</div>' +
      '<div class="hv-aut-rooster"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + o.kaart({ titel: t('Зараз → буде', 'Nu → wordt'), k: 'sc-stappen', inhoud: meter + rijen || '<p class="hv-tekst hv-tekst--zacht">' + h(t('Кроків немає.', 'Geen stappen.')) + '</p>' }) + '</div>' +
      '<div class="hv-aut-kolom">' + o.kaart({ titel: t('Де вживається', 'Waar gebruikt'), k: 'sc-gebruik', inhoud: regels.length ? '<div class="hv-rijen">' + regels.map(function (r) { return o.rij({ icoon: r.icoon, naam: HV.p(r.naam), sub: t('правило вживає цю сцену', 'de regel gebruikt deze scène'), actie: 'ga', gegevens: { naar: 'automatiseringen-regel-' + r.id }, k: 'gb-' + r.id }); }).join('') + '</div>' : '<p class="hv-tekst hv-tekst--zacht">' + h(t('Жодне правило не запускає цю сцену.', 'Geen regel start deze scène.')) + '</p>' }) +
      o.kaart({ titel: t('Після запуску', 'Na het starten'), k: 'sc-na', inhoud: '<p class="hv-tekst">' + HV.icoon('circle-check', { maat: 's' }) + '<span>' + h(t('Сповіщення покаже, скільки пристроїв підтвердили стан, наприклад «10 із 12 підтверджено», і запропонує «Повторити для решти». «Повернути» діє 10 с, далі — в записі Журналу.', 'De melding toont hoeveel apparaten hun toestand bevestigden, bijvoorbeeld ‘10 van 12 bevestigd’, en biedt ‘Herhaal voor de rest’. ‘Ongedaan maken’ werkt 10 s, daarna via het logboek.')) + '</span></p>' +
        (X.sceneHandmatig[scene.id] ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Повторити для решти', 'Herhaal voor de rest') + ' (' + X.sceneHandmatig[scene.id] + ')', icoon: 'repeat', actie: 'scene-rest', gegevens: { scene: scene.id } }) + '</div>' : '') }) + '</div></div></div>';
  }

  var SCENE_NAMEN = [['lezen', ['Читання', 'Lezen'], 'book-open'], ['diner', ['Вечеря', 'Diner'], 'utensils'], ['rust', ['Тиша', 'Rust'], 'leaf'], ['werken', ['Робота', 'Werken'], 'laptop']];
  var SN_KAMERS = ['alle', 'woonkamer', 'keuken', 'slaapkamer', 'werkkamer'];
  var SN_SOORTEN = ['licht', 'stopcontact', 'gordijn', 'jaloezie', 'thermostaat', 'tv', 'speaker'];
  function snKandidaten(km) { return HV.kijk.alle(function (a) { return SN_SOORTEN.indexOf(a.soort) >= 0 && (km === 'alle' || a.kamer === km); }); }
  function snStappen(a) {
    var st = [];
    if (a.soort === 'licht') { st.push({ doel: a.id, mogelijkheid: 'aan', waarde: !!a.st.aan }); if (a.st.aan && a.mog.indexOf('helderheid') >= 0) st.push({ doel: a.id, mogelijkheid: 'helderheid', waarde: a.st.helderheid }); }
    else if (a.soort === 'gordijn' || a.soort === 'jaloezie') st.push({ doel: a.id, mogelijkheid: 'positie', waarde: a.st.positie });
    else if (a.soort === 'thermostaat') st.push({ doel: a.id, mogelijkheid: 'doel', waarde: a.st.doel });
    else if (a.soort === 'speaker') st.push({ doel: a.id, mogelijkheid: 'afspelen', waarde: !!a.st.speelt });
    else st.push({ doel: a.id, mogelijkheid: 'aan', waarde: !!a.st.aan });
    return st;
  }
  HV.blad({ soort: 'scenenieuw', vrij: true, icoon: 'camera', titel: ['Зберегти поточне', 'Huidige stand opslaan'], sub: function () { return t('нова сцена зі знімка стану', 'een nieuwe scène uit een momentopname'); },
    render: function (ctx) {
      var km = HV.ui.lees('sn-kamer', 'woonkamer'), nm = HV.ui.lees('sn-naam', 'lezen');
      var uit = (HV.ui.lees('sn-uit', '') || '').split(',').filter(Boolean);
      var lijst = snKandidaten(km);
      var gekozen = lijst.filter(function (a) { return a.beschikbaar !== 'onbereikbaar' && a.beschikbaar !== 'verouderd' && uit.indexOf(a.id) < 0; });
      return o.kaart({ inhoud: veld(t('Назва', 'Naam'), o.segment({ label: t('Назва', 'Naam'), waarde: nm, actie: 'ui', gegevens: { naam: 'sn-naam' }, k: 'sn-naam', klas: 'hv-segment--rol', opties: SCENE_NAMEN.map(function (x) { return { id: x[0], label: HV.p(x[1]), icoon: x[2] }; }) })) +
        veld(t('Ціль', 'Doel'), o.segment({ label: t('Ціль', 'Doel'), waarde: km, actie: 'ui', gegevens: { naam: 'sn-kamer' }, k: 'sn-kamer', klas: 'hv-segment--rol', opties: SN_KAMERS.map(function (k) { return { id: k, label: k === 'alle' ? t('увесь дім', 'het hele huis') : HV.p(kamer(k).naam) }; }) })) }) +
        o.kaart({ titel: t('Що ввійде', 'Wat erin komt') + ' (' + gekozen.length + ')', inhoud: '<ul class="hv-snlijst">' + lijst.map(function (a) {
          var onb = a.beschikbaar === 'onbereikbaar' || a.beschikbaar === 'verouderd';
          var aan = !onb && uit.indexOf(a.id) < 0;
          var waarde = snStappen(a).map(function (s) { return HV.p(HV.beschrijf(a, s.mogelijkheid, s.waarde)); }).join(' · ');
          return '<li class="hv-snrij' + (onb ? ' is-onbekend' : '') + '" data-k="sn-' + a.id + '">' + (onb ? '<span class="hv-snrij__vak" aria-hidden="true">' + HV.icoon('unplug', { maat: 's' }) + '</span>'
            : '<button type="button" class="hv-snrij__vak' + (aan ? ' is-aan' : '') + '" role="checkbox" aria-checked="' + (aan ? 'true' : 'false') + '" aria-label="' + h(HV.p(a.naam)) + '" data-actie="sn-kies" data-doel="' + a.id + '">' + HV.icoon(aan ? 'check' : 'minus', { maat: 's' }) + '</button>') +
            '<span class="hv-snrij__teken">' + HV.icoon(HV.paspoort.soorten[a.soort].icoon, { maat: 's' }) + '</span><span class="hv-snrij__tekst"><span class="hv-snrij__naam">' + h(HV.p(a.naam) + ' · ' + HV.p(kamer(a.kamer).naam)) + '</span><span class="hv-snrij__waarde">' + h(onb ? t('стан невідомий — не ввійде', 'toestand onbekend — komt er niet in') : waarde) + '</span></span></li>';
        }).join('') + '</ul>' +
          '<div class="hv-knoppen">' + o.knop({ tekst: t('Зберегти сцену', 'Scène opslaan'), icoon: 'save', soort: 'hoofd', actie: 'sn-opslaan' }) + o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'blad-sluit' }) + '</div>' });
    } });

  // ── Сторінка режиму ──
  function standPagina(ctx) {
    var w = ctx.staat, X = A(w), s = ctx.route.object;
    if (STANDEN.indexOf(s) < 0) return o.leeg({ icoon: 'house', titel: t('Такого режиму немає', 'Deze stand bestaat niet'), actie: { tekst: t('До режимів', 'Naar de standen'), actie: 'ga', gegevens: { naar: 'automatiseringen-scenes' } } });
    var nu = w.huisstand === s, alarm = app('alarm');
    var regels = X.regels.filter(function (r) { return r.fase !== 'concept'; });
    var gevolg = '<ul class="hv-aut-gevolglijst">' +
      HV.p(standGevolg(s, w)).split('; ').map(function (x) { return '<li>' + HV.icoon('arrow-right', { maat: 's' }) + '<span>' + h(groot(x)) + '</span></li>'; }).join('') +
      '<li>' + HV.icoon('workflow', { maat: 's' }) + '<span>' + h(t('Діятимуть правил: ', 'Regels die werken: ') + regels.filter(function (r) { return r.standen.indexOf(s) >= 0 && r.fase === 'aan'; }).length + t(' із ', ' van ') + regels.length) + '</span></li></ul>';
    var wacht = regels.filter(function (r) { return r.standen.indexOf(s) < 0 && r.fase === 'aan'; });
    var regelLijst = '<div class="hv-rijen">' + regels.map(function (r) {
      var aan = r.standen.indexOf(s) >= 0;
      return '<div class="hv-rij hv-aut-standregel" data-k="sr-' + r.id + '">' + o.schakel({ aan: aan, icoon: r.icoon, toon: 'neutraal', actie: 'matrix', gegevens: { regel: r.id, stand: s }, aria: HV.p(r.naam) }) + '<span class="hv-rij__naam">' + h(HV.p(r.naam)) + '<span class="hv-rij__sub">' + h(aan ? t('діє в цьому режимі', 'werkt in deze stand') : t('на паузі в цьому режимі', 'gepauzeerd in deze stand')) + '</span></span></div>';
    }).join('') + '</div>';
    var wachtNoot = wacht.length ? '<p class="hv-aut-noot">' + HV.icoon('pause', { maat: 's' }) + '<span>' + h(t('Стануть на паузу: ', 'Gaan op pauze: ') + wacht.map(function (r) { return HV.p(r.naam); }).join(', ')) + '</span></p>' : '';
    var overg = X.overgangen.filter(function (g) { return g.naar === s; });
    var vastKeuze = HV.ui.lees('vast-tot', '22');
    var bewaking = '<div class="hv-aut-bewaking" data-k="bewaking">' + HV.icoon(alarm.st.stand === 'uit' ? 'shield' : 'shield-check') + '<div class="hv-aut-bewaking__tekst"><p class="hv-aut-bewaking__naam">' + h(HV.p(HV.alarmWoord[alarm.st.stand]) + t(' — режим цього не змінить', ' — de stand verandert dit niet')) + '</p><p class="hv-aut-bewaking__sub">' + h(t('Режим ніколи не знімає охорону й не відмикає. Поставити — окрема дія; «Завжди» на постановку дає лише власник.', 'Een stand zet nooit het alarm uit en ontgrendelt niets. Inschakelen is een aparte actie; ‘Altijd’ daarvoor geeft alleen de eigenaar.')) + '</p></div>' +
      (alarm.st.stand !== 'volledig' && (s === 'afwezig' || s === 'vakantie' || s === 'nacht') ? o.knop({ tekst: s === 'nacht' ? t('Поставити «нічна»…', '‘Nachtstand’ inschakelen…') : t('Поставити «повна»…', '‘Volledig’ inschakelen…'), icoon: 'shield-check', klein: true, actie: 'aut-alarm', gegevens: { stand: s === 'nacht' ? 'nacht' : 'volledig' } }) : '') + '</div>';
    var extra = '';
    if (s === 'vakantie') extra = o.kaart({ titel: t('Їдемо у відпустку', 'We gaan op vakantie'), k: 'vak', inhoud: '<p class="hv-tekst">' + HV.icoon('luggage', { maat: 's' }) + '<span>' + h(X.vakantie ? t('Відпустка до ', 'Vakantie tot ') + HV.datumKort(X.vakantie.tot) + (X.vakantie.imitatie ? t(' · імітація присутності', ' · aanwezigheid nabootsen') : '') : t('Майстер: дати, охорона, імітація присутності, економний клімат.', 'Wizard: data, alarm, aanwezigheid nabootsen, zuinig klimaat.')) + '</span></p><div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити майстер', 'Wizard openen'), icoon: 'luggage', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'vertrek' } }) + '</div>' });
    if (s === 'gasten') extra = o.kaart({ titel: t('Гості до', 'Gasten tot'), k: 'gasten', inhoud: '<p class="hv-tekst">' + HV.icoon('calendar-days', { maat: 's' }) + '<span>' + h(t('Режим «Гості» вимкнеться сам: ', 'De stand ‘Gasten’ gaat vanzelf uit: ') + HV.datum(X.gastenTot || dagBegin(w.tijd) + 6 * DAG + 12 * UUR) + ', 12:00') + '</span></p>' +
      veld(t('Днів', 'Dagen'), o.stapper({ label: t('Днів', 'Dagen'), waarde: Math.round(((X.gastenTot || dagBegin(w.tijd) + 6 * DAG + 12 * UUR) - dagBegin(w.tijd)) / DAG), actie: 'gasten-stap', gegevens: {}, stap: 1 })) +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Гостьовий код дверей', 'Gastcode voor de deur'), icoon: 'key-round', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'beveiliging-toegang' } }) + '</div>' });
    var standKnop = nu ? o.knop({ gedrukt: true, tekst: t('Діє', 'Actief') }) : o.knop({ tekst: s === 'vakantie' ? t('Їдемо…', 'We gaan…') : t('Перейти в «', 'Naar ‘') + HV.p(HV.huisstanden[s]) + t('»', '’'), icoon: STAND_ICOON[s], soort: 'hoofd', actie: s === 'vakantie' ? 'blad' : 'huisstand', gegevens: s === 'vakantie' ? { blad: 'vertrek' } : { waarde: s } });
    return '<div class="hv-aut hv-aut-stand" data-k="stand-' + s + '">' +
      subKop({ icoon: STAND_ICOON[s], actief: nu, pad: ['automatiseringen-scenes', t('Сцени й режими', 'Scènes en standen')], titel: HV.p(HV.huisstanden[s]), sub: (nu ? t('діє зараз', 'nu actief') : t('не активний', 'niet actief')) + ' · ' + HV.p(standGevolg(s, w)).split('; ')[0], extra: standKnop }) +
      '<div class="hv-aut-rooster"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + o.kaart({ titel: t('Що зміниться', 'Wat er verandert'), k: 'st-gevolg', inhoud: gevolg + wachtNoot + bewaking }) + o.kaart({ titel: t('Правила в цьому режимі', 'Regels in deze stand'), k: 'st-regels', inhoud: regelLijst }) + '</div>' +
      '<div class="hv-aut-kolom">' + extra + o.kaart({ titel: t('Переходи', 'Overgangen'), k: 'st-overg', inhoud: overg.length ? overg.map(overgangRij).join('') : '<p class="hv-tekst hv-tekst--zacht">' + h(t('Автоматичних переходів у цей режим немає — лише вручну.', 'Geen automatische overgangen naar deze stand — alleen handmatig.')) + '</p>' }) +
      o.kaart({ titel: t('Зафіксувати до…', 'Vastzetten tot…'), k: 'st-vast', inhoud: regieRij(w, X, true) + veld(t('До', 'Tot'), o.segment({ label: t('До', 'Tot'), waarde: vastKeuze, actie: 'ui', gegevens: { naam: 'vast-tot' }, k: 'vast-tot', opties: [{ id: '1', label: t('на 1 год', '1 uur') }, { id: '22', label: '22:00' }, { id: '7', label: t('до ранку', 'tot de ochtend') }] })) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Зафіксувати', 'Vastzetten'), icoon: 'hand', actie: 'stand-vast', gegevens: { tot: vastKeuze } }) + '</div>' }) + '</div></div></div>';
  }

  HV.blad({ soort: 'vertrek', vrij: true, icoon: 'luggage', titel: ['Їдемо у відпустку', 'We gaan op vakantie'], sub: function () { return t('режим «Відпустка» з датою повернення', 'stand ‘Vakantie’ met een terugkomdatum'); },
    render: function (ctx) {
      var w = ctx.staat, dagen = Number(HV.ui.lees('vt-dagen', 7));
      var imit = HV.ui.lees('vt-imit', '1') === '1', eco = HV.ui.lees('vt-eco', '1') === '1', alarm = HV.ui.lees('vt-alarm', '1') === '1';
      var tot = dagBegin(w.tijd) + dagen * DAG + 18 * UUR;
      var optie = function (naam, aan, icoon, tekst, sub) { return '<div class="hv-overgang" data-k="vt-' + naam + '">' + o.schakel({ aan: aan, icoon: icoon, toon: 'neutraal', actie: 'ui', gegevens: { naam: 'vt-' + naam, waarde: aan ? '0' : '1' }, aria: tekst }) + '<p class="hv-overgang__zin">' + h(tekst) + '<span class="hv-rij__sub">' + h(sub) + '</span></p></div>'; };
      return o.kaart({ inhoud: veld(t('Скільки днів', 'Hoeveel dagen'), o.stapper({ label: t('Днів', 'Dagen'), waarde: String(dagen), actie: 'vt-dagen', gegevens: {}, stap: 1 })) +
        '<p class="hv-aut-noot">' + HV.icoon('calendar-days', { maat: 's' }) + '<span>' + h(t('Повернення: ', 'Terug: ') + HV.datum(tot) + ', 18:00') + '</span></p>' +
        optie('imit', imit, 'moon-star', t('Імітація присутності', 'Aanwezigheid nabootsen'), t('світло у вітальні ввечері в різний час', 'licht in de woonkamer ’s avonds op wisselende tijden')) +
        optie('eco', eco, 'thermometer', t('Економний клімат', 'Zuinig klimaat'), t('15 °C, за день до повернення — 20 °C', '15 °C, een dag voor terugkomst 20 °C')) +
        optie('alarm', alarm, 'shield-check', t('Поставити охорону «повна»', 'Alarm ‘volledig’ inschakelen'), t('пропозиція: окрема дія, режим сам охорону не ставить', 'voorstel: een aparte actie, de stand zet het alarm niet zelf aan')) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Їдемо', 'We gaan'), icoon: 'luggage', soort: 'hoofd', actie: 'vt-start' }) + o.gevolg(HV.p(['Що станеться: режим стане «Відпустка», світло й медіа вимкнуться, опалення 15 °C до ' + HV.datumKort(tot) + '. Пов’язано з: полив і косарка працюють за розкладом. Як повернути: оберіть «Вдома» або «Повернути» протягом 10 с.', 'Wat er gebeurt: de stand wordt ‘Vakantie’, licht en media gaan uit, verwarming 15 °C tot ' + HV.datumKort(tot) + '. Hangt samen met: beregening en maaier volgen hun rooster. Terugdraaien: kies ‘Thuis’ of ‘Ongedaan maken’ binnen 10 s.'])) + '</div>' });
    } });

  // ───────────────────────── Порядок дня ─────────────────────────
  var AFVAL = [[1, ['Папір', 'Papier'], 'recycle'], [4, ['Органічні відходи', 'Gft'], 'leaf'], [8, ['Пластик і бляшанки', 'Plastic en blik'], 'recycle'], [11, ['Залишкові відходи', 'Restafval'], 'trash-2']];
  var FEESTDAGEN = [[[12, 25], ['Перший день Різдва', 'Eerste kerstdag']], [[12, 26], ['Другий день Різдва', 'Tweede kerstdag']], [[1, 1], ['Новий рік', 'Nieuwjaarsdag']], [[4, 27], ['День короля', 'Koningsdag']]];
  function agendaItems(w, X) {
    var d0 = dagBegin(w.tijd), uit = [];
    // правила за розкладом
    X.regels.forEach(function (r) {
      if (r.fase === 'concept' || r.uit) return;
      r.wanneer.forEach(function (tr) {
        [0, 1].forEach(function (d) {
          var m = triggerMoment(tr, d0 + d * DAG);
          if (m == null) return;
          var sleutel = r.id + '@' + Math.round(m / MIN);
          var past = r.runs.filter(function (x) { return Math.abs(x.tijd - m) < 2 * MIN; })[0];
          uit.push({ id: 'r-' + sleutel.replace(/[^a-z0-9]/g, ''), tijd: m, icoon: r.icoon, soort: 'regel', naam: r.naam, sub: ['від імені: ' + mensNaam(r.namens)[0], 'namens ' + mensNaam(r.namens)[1]], regel: r, sleutel: sleutel, overslaan: !!X.overslaan[sleutel], past: past, meekijken: r.fase === 'meekijken', pauze: r.pauze && r.pauze.tot > m });
        });
      });
    });
    // переходи режимів
    X.overgangen.forEach(function (g) { if (!g.aan || g.uur == null) return; [0, 1].forEach(function (d) { uit.push({ id: 'og-' + g.id + d, tijd: d0 + d * DAG + g.uur * UUR, icoon: STAND_ICOON[g.naar], soort: 'stand', naam: overgangZin(g), sub: ['перехід режиму', 'overgang van stand'] }); }); });
    // сонце
    [0, 1].forEach(function (d) { var z = zon(d0 + d * DAG); var lengte = HV.duur((z.onder - z.op) * 60); uit.push({ id: 'zop' + d, tijd: d0 + d * DAG + z.op * UUR, icoon: 'sunrise', soort: 'zon', naam: ['Схід сонця', 'Zonsopkomst'], sub: ['світловий день ' + lengte, 'daglicht ' + lengte] }); uit.push({ id: 'zon' + d, tijd: d0 + d * DAG + z.onder * UUR, icoon: 'sunset', soort: 'zon', naam: ['Захід сонця', 'Zonsondergang'], sub: ['далі «темно» в умовах правил', 'daarna ‘donker’ in de voorwaarden'] }); });
    // зарядка: найдешевше вікно 3 год уночі
    [0, 1].forEach(function (d) {
      var best = null;
      for (var u = 22; u <= 30; u++) { var m = d0 + d * DAG + u * UUR, p = (HV.tarief.prijs(m) + HV.tarief.prijs(m + UUR) + HV.tarief.prijs(m + 2 * UUR)) / 3; if (!best || p < best.p) best = { m: m, p: p }; }
      if (best && d === 0) uit.push({ id: 'laden' + d, tijd: best.m, icoon: 'plug-zap', soort: 'energie', naam: ['Зарядка авто: ' + HV.tijd(best.m) + '–' + HV.tijd(best.m + 3 * UUR), 'Auto laden: ' + HV.tijd(best.m) + '–' + HV.tijd(best.m + 3 * UUR)], sub: ['у середньому ' + HV.euro(best.p) + ' за кВт·год · приклад', 'gemiddeld ' + HV.euro(best.p) + ' per kWh · voorbeeld'], naar: 'energie-laden' });
    });
    // найдешевша година й від’ємна ціна
    var venster = HV.tarief.venster(w.tijd);
    [0, 1].forEach(function (d) {
      var dag = venster.filter(function (x) { return x.tijd >= d0 + d * DAG && x.tijd < d0 + (d + 1) * DAG; });
      var min = dag.slice().sort(function (a, b) { return a.prijs - b.prijs; })[0];
      if (min) uit.push({ id: 'goedkoop' + d, tijd: min.tijd, icoon: 'euro', soort: 'energie', naam: min.prijs < 0 ? ['Від’ємна ціна: ' + HV.euro(min.prijs), 'Negatieve prijs: ' + HV.euro(min.prijs)] : ['Найдешевша година: ' + HV.euro(min.prijs), 'Goedkoopste uur: ' + HV.euro(min.prijs)], sub: ['ціна за кВт·год · приклад', 'prijs per kWh · voorbeeld'], naar: 'energie-tarief' });
    });
    // сміття (календар із Hub)
    var afv = AFVAL[0];
    uit.push({ id: 'afval-h', tijd: d0 + 20 * UUR, icoon: 'bell', soort: 'afval', naam: ['Нагадування: завтра ' + afv[1][0].toLowerCase() + ' — виставити до 07:30', 'Herinnering: morgen ' + afv[1][1].toLowerCase() + ' — buiten zetten vóór 07:30'], sub: ['календар сміття з Hub', 'afvalkalender uit Hub'], afval: true });
    uit.push({ id: 'afval-o', tijd: d0 + DAG + 7.5 * UUR, icoon: afv[2], soort: 'afval', naam: ['Вивіз: ' + afv[1][0].toLowerCase(), 'Ophaling: ' + afv[1][1].toLowerCase()], sub: ['календар сміття з Hub', 'afvalkalender uit Hub'] });
    // обслуговування й робот
    uit.push({ id: 'filter', tijd: d0 + DAG + 10 * UUR, icoon: 'wrench', soort: 'onderhoud', naam: ['Очищувач повітря: замінити фільтр', 'Luchtreiniger: filter vervangen'], sub: ['строк догляду', 'onderhoudstermijn'], naar: 'activiteit-onderhoud' });
    uit.push({ id: 'stofzuiger', tijd: d0 + DAG + 10.5 * UUR, icoon: 'bot', soort: 'robot', naam: ['Пилосос: прибирання першого поверху', 'Robotstofzuiger: begane grond'], sub: ['розклад робота, коли нікого вдома', 'rooster van de robot, als niemand thuis is'], naar: 'garage-robots' });
    return uit.sort(function (a, b) { return a.tijd - b.tijd; });
  }
  var AGENDA_SOORT = { regel: ['правило', 'regel'], stand: ['режим', 'stand'], zon: ['сонце', 'zon'], energie: ['енергія', 'energie'], afval: ['сміття', 'afval'], onderhoud: ['догляд', 'onderhoud'], robot: ['робот', 'robot'] };
  function dagordePagina(ctx) {
    var w = ctx.staat, X = A(w), d0 = dagBegin(w.tijd);
    var sf = HV.ui.lees('ag-soort', 'alle');
    var items = agendaItems(w, X).filter(function (x) { return sf === 'alle' || x.soort === sf; });
    var nu = w.tijd;
    var komend = items.filter(function (x) { return x.tijd > nu; });
    var volgende = komend.filter(function (x) { return x.soort !== 'zon'; })[0];

    var held = '<section class="hv-aut-held hv-aut-held--dagorde" data-k="ag-held"><div class="hv-aut-held__tekst"><p class="hv-aut-held__zin">' + h(volgende ? t('Далі, о ', 'Hierna, om ') + HV.tijd(volgende.tijd) + ' — ' + klein(HV.p(volgende.naam)) + '.' : t('Сьогодні більше нічого не заплановано.', 'Vandaag staat er niets meer gepland.')) + '</p>' +
      '<p class="hv-aut-held__sub">' + h(t('Що дім зробить сам сьогодні й завтра: правила, переходи режимів, зарядка, сміття й догляд. Календар і списки читаються з Hub.', 'Wat het huis vandaag en morgen zelf doet: regels, overgangen, laden, afval en onderhoud. Agenda en lijsten komen uit Hub.')) + '</p></div>' +
      '<div class="hv-aut-held__getallen">' + o.getal({ maat: 'm', label: t('ще сьогодні', 'nog vandaag'), waarde: String(komend.filter(function (x) { return x.tijd < d0 + DAG && x.soort !== 'zon'; }).length) }) + o.getal({ maat: 'm', label: t('завтра', 'morgen'), waarde: String(items.filter(function (x) { return x.tijd >= d0 + DAG && x.soort !== 'zon'; }).length) }) + o.getal({ maat: 'm', label: t('пропустити раз', 'overslaan'), waarde: String(Object.keys(X.overslaan).length) }) + '</div></section>';

    // стрічка двох діб
    var fasen = [], prijs = [];
    for (var x = d0; x < d0 + 2 * DAG; x += UUR) {
      var f = HV.hemel.fase(HV.uur(x + UUR / 2));
      fasen.push({ van: x, tot: x + UUR, klas: 'hv-fase--' + (f.deel >= 0.5 ? f.b : f.a) });
      var p = HV.tarief.prijs(x);
      prijs.push({ van: x, tot: x + UUR, klas: p < 0 ? 'hv-warmte--min' : p < 0.22 ? 'hv-prijs--goedkoop' : p < 0.31 ? 'hv-prijs--midden' : 'hv-prijs--duur', label: HV.euro(p) });
    }
    var alle = agendaItems(w, X);
    var punt = function (soorten, icoon) { return alle.filter(function (i) { return soorten.indexOf(i.soort) >= 0; }).map(function (i) { return { x: i.tijd, label: HV.p(i.naam), icoon: icoon || i.icoon }; }); };
    var tikken = [], tikStap = ctx.profiel && ctx.profiel.breedte < 700 ? 12 : 6; for (var u = d0; u <= d0 + 2 * DAG; u += tikStap * UUR) tikken.push({ x: u, label: HV.tijd(u) });
    var strook = HV.grafiek.toestanden({ id: 'dagorde', van: d0, tot: d0 + 2 * DAG, nu: w.tijd, tikken: tikken, format: function (ms) { return dagWoord(ms, w.tijd) + ' ' + HV.tijd(ms); },
      banen: [{ naam: t('небо', 'hemel'), klas: 'hv-baan--fase', stukken: fasen }, { naam: t('ціна', 'prijs'), klas: 'hv-baan--prijs', stukken: prijs }, { naam: t('правила', 'regels'), punten: punt(['regel'], 'diamond') }, { naam: t('режим', 'stand'), punten: punt(['stand']) }, { naam: t('побут', 'overig'), punten: punt(['afval', 'onderhoud', 'robot', 'energie']) }],
      samenvatting: t('Сьогодні й завтра: небо, ціна (світліше — дешевше), запуски правил, переходи режимів і побутові події.', 'Vandaag en morgen: hemel, prijs (lichter is goedkoper), starts van regels, overgangen en huishoudelijke zaken.') });
    var strookBlok = o.blok({ id: 'ag-strook', titel: t('Сьогодні й завтра', 'Vandaag en morgen'), inhoud: '<div class="hv-kaart hv-agenda-strook">' + strook + '</div>' });

    // вісь порядку дня
    var filter = o.segment({ label: t('Вид', 'Soort'), waarde: sf, actie: 'ui', gegevens: { naam: 'ag-soort' }, klas: 'hv-segment--rol', k: 'ag-f', opties: [{ id: 'alle', label: t('Усе', 'Alles') }].concat(Object.keys(AGENDA_SOORT).map(function (k) { return { id: k, label: groot(HV.p(AGENDA_SOORT[k])) }; })) });
    var dagHtml = function (d) {
      var van = d0 + d * DAG, tot = van + DAG;
      var lijst = items.filter(function (i) { return i.tijd >= van && i.tijd < tot; });
      var rijen = '', nuGezet = d !== 0;
      lijst.forEach(function (i) {
        if (!nuGezet && i.tijd > nu) { rijen += '<li class="hv-agenda__nu" data-k="ag-nu"><span class="hv-agenda__tijd">' + HV.tijd(nu) + '</span><span class="hv-agenda__nustreep"><span>' + h(t('зараз', 'nu')) + '</span></span></li>'; nuGezet = true; }
        rijen += agendaRij(i, w);
      });
      if (!nuGezet) rijen += '<li class="hv-agenda__nu" data-k="ag-nu"><span class="hv-agenda__tijd">' + HV.tijd(nu) + '</span><span class="hv-agenda__nustreep"><span>' + h(t('зараз', 'nu')) + '</span></span></li>';
      return '<section class="hv-agenda__dag" data-k="ag-dag' + d + '"><h3 class="hv-agenda__dagkop">' + h(groot(d === 0 ? t('сьогодні', 'vandaag') : t('завтра', 'morgen')) + ' · ' + HV.datum(van)) + '</h3><ol class="hv-agenda">' + (rijen || '<li class="hv-agenda__leeg">' + h(t('Нічого не заплановано.', 'Niets gepland.')) + '</li>') + '</ol></section>';
    };
    var as = o.blok({ id: 'ag-as', titel: t('Порядок дня', 'Dagorde'), vast: true, teller: items.filter(function (i) { return i.soort !== 'zon'; }).length, inhoud: filter + '<div class="hv-kaart hv-agenda-kaart">' + dagHtml(0) + dagHtml(1) + '</div>' });

    // тижневий розклад
    var week = weekRooster(w, X);
    var weekBlok = o.blok({ id: 'ag-week', titel: t('Тижневий розклад', 'Weekrooster'), inhoud: '<div class="hv-kaart">' + week +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Змінити розклад клімату', 'Klimaatrooster wijzigen'), icoon: 'thermometer', klein: true, actie: 'ga', gegevens: { naar: 'kamers-klimaat' } }) + '</div></div>',
      uitleg: t('Що станеться: тут лише перегляд; клімат змінюється в «Кімнати → Клімат». Пов’язано з: правила з часом показано знаком. Як повернути: розклад клімату має власні версії.', 'Wat er gebeurt: hier alleen bekijken; het klimaat wijzig je onder ‘Kamers → Klimaat’. Hangt samen met: regels met een tijd staan als teken. Terugdraaien: het klimaatrooster heeft eigen versies.') });

    // свята, канікули, сміття
    var jaar = new Date(w.tijd).getUTCFullYear();
    var feest = FEESTDAGEN.map(function (f) { var m = Date.UTC(jaar, f[0][0] - 1, f[0][1]); if (m < d0) m = Date.UTC(jaar + 1, f[0][0] - 1, f[0][1]); return { tijd: m, naam: f[1] }; }).sort(function (a, b) { return a.tijd - b.tijd; });
    var feestBlok = o.blok({ id: 'ag-feest', titel: t('Свята й канікули', 'Feestdagen en vakanties'), inhoud: '<div class="hv-kaart">' +
      '<div class="hv-overgang" data-k="feest-z">' + o.schakel({ aan: X.feestZondag, icoon: 'calendar-days', toon: 'neutraal', actie: 'ag-schakel', gegevens: { veld: 'feestZondag' }, aria: t('У свята як у неділю', 'Op feestdagen als zondag') }) + '<p class="hv-overgang__zin">' + h(t('У свята як у неділю', 'Op feestdagen als zondag')) + '<span class="hv-rij__sub">' + h(t('правила «у будні» не спрацюють', 'regels ‘op werkdagen’ gaan niet af')) + '</span></p></div>' +
      '<div class="hv-overgang" data-k="feest-v">' + o.schakel({ aan: X.vakantieWeekend, icoon: 'school', toon: 'neutraal', actie: 'ag-schakel', gegevens: { veld: 'vakantieWeekend' }, aria: t('Шкільні канікули як вихідні', 'Schoolvakantie als weekend') }) + '<p class="hv-overgang__zin">' + h(t('Шкільні канікули як вихідні', 'Schoolvakantie als weekend')) + '<span class="hv-rij__sub">' + h(t('Різдвяні: 19.12 – 04.01 · регіон «Середина»', 'Kerstvakantie: 19-12 – 04-01 · regio Midden')) + '</span></p></div>' +
      '<div class="hv-rijen">' + feest.map(function (f) { return o.rij({ icoon: 'party-popper', naam: HV.p(f.naam), waarde: h(HV.datum(f.tijd)), k: 'fd-' + f.tijd }); }).join('') + '</div></div>' });
    var afvalBlok = o.blok({ id: 'ag-afval', titel: t('Сміття', 'Afval'), inhoud: '<div class="hv-kaart">' +
      '<div class="hv-overgang" data-k="afval-h">' + o.schakel({ aan: X.afvalHerinnering, icoon: 'bell', toon: 'neutraal', actie: 'ag-schakel', gegevens: { veld: 'afvalHerinnering' }, aria: t('Нагадувати напередодні о 20:00', 'De avond ervoor om 20:00 herinneren') }) + '<p class="hv-overgang__zin">' + h(t('Нагадувати напередодні о 20:00', 'De avond ervoor om 20:00 herinneren')) + '<span class="hv-rij__sub">' + h(t('тим, хто вдома', 'aan wie thuis is')) + '</span></p></div>' +
      '<div class="hv-rijen">' + AFVAL.map(function (a) { var m = d0 + a[0] * DAG + 7.5 * UUR; return o.rij({ icoon: a[2], naam: HV.p(a[1]), sub: t('виставити до 07:30', 'buiten zetten vóór 07:30'), waarde: h(dagWoord(m, w.tijd) === HV.datumKort(m) ? HV.datum(m) : groot(dagWoord(m, w.tijd))), k: 'af-' + a[0] }); }).join('') + '</div></div>' });

    return '<div class="hv-aut hv-aut-dagorde" data-k="aut-dagorde">' + held + strookBlok + '<div class="hv-aut-rooster"><div class="hv-aut-kolom hv-aut-kolom--hoofd">' + as + '</div><div class="hv-aut-kolom">' + weekBlok + feestBlok + afvalBlok + '</div></div></div>';
  }
  function agendaRij(i, w) {
    var voorbij = i.tijd <= w.tijd;
    var status = '';
    if (i.soort === 'regel') {
      if (voorbij) status = i.past ? uitkomstChip(i.past.uitkomst) : o.chip({ icoon: 'circle-slash', tekst: t('не запускалося', 'niet gestart') });
      else if (i.overslaan) status = o.chip({ icoon: 'skip-forward', toon: 'let-op', tekst: t('пропуститься раз', 'wordt één keer overgeslagen') });
      else if (i.pauze) status = o.chip({ icoon: 'pause', tekst: t('на паузі', 'gepauzeerd') });
      else if (i.meekijken) status = o.chip({ icoon: 'eye', tekst: t('лише спостереження', 'alleen meekijken') });
      else if (i.regel.standen.indexOf(w.huisstand) < 0) status = o.chip({ icoon: 'house', tekst: t('не в цьому режимі', 'niet in deze stand') });
    }
    var knop = '';
    if (i.soort === 'regel' && !voorbij && !i.meekijken) knop = o.knop({ tekst: i.overslaan ? t('Не пропускати', 'Niet overslaan') : t('Пропустити раз', 'Eén keer overslaan'), icoon: i.overslaan ? 'rotate-ccw' : 'skip-forward', klein: true, soort: 'stil', actie: 'ag-overslaan', gegevens: { sleutel: i.sleutel } });
    var lijf = '<span class="hv-agenda__teken hv-agenda__teken--' + i.soort + '">' + HV.icoon(i.icoon, { maat: 's' }) + '</span><span class="hv-agenda__tekst"><span class="hv-agenda__naam">' + h(HV.p(i.naam)) + '</span>' + (i.sub ? '<span class="hv-agenda__sub">' + h(HV.p(AGENDA_SOORT[i.soort]) + ' · ' + HV.p(i.sub)) + '</span>' : '<span class="hv-agenda__sub">' + h(HV.p(AGENDA_SOORT[i.soort])) + '</span>') + (status ? '<span class="hv-agenda__status">' + status + '</span>' : '') + '</span>';
    var naar = i.soort === 'regel' ? 'automatiseringen-regel-' + i.regel.id : i.naar;
    return '<li class="hv-agenda__rij' + (voorbij ? ' is-voorbij' : '') + ' is-' + i.soort + '" data-k="ag-' + h(i.id) + '"><span class="hv-agenda__tijd">' + HV.tijd(i.tijd) + '</span><span class="hv-agenda__punt" aria-hidden="true"></span>' +
      (naar ? '<button type="button" class="hv-agenda__lijf" data-actie="ga" data-naar="' + h(naar) + '">' + lijf + HV.icoon('chevron-right', { maat: 's', klas: 'hv-agenda__pijl' }) + '</button>' : '<div class="hv-agenda__lijf">' + lijf + '</div>') +
      (knop ? '<span class="hv-agenda__knop">' + knop + '</span>' : '') + '</li>';
  }
  /** Тижневий розклад: смуги комфорту клімату (лише перегляд) і знаки правил із часом. */
  function weekRooster(w, X) {
    var vandaag = weekdag(w.tijd);
    var comfort = function (d) { return d <= 5 ? [[6.5, 8.25], [17, 22.5]] : [[8, 23]]; };
    var rijen = DAGEN.map(function (dn, i) {
      var d = i + 1;
      var blokken = comfort(d).map(function (b) { return '<span class="hv-week__blok" style="left:' + (b[0] / 24 * 100).toFixed(2) + '%;width:' + ((b[1] - b[0]) / 24 * 100).toFixed(2) + '%" title="' + h(t('комфорт 21 °C', 'comfort 21 °C') + ' ' + uurTekst(b[0]) + '–' + uurTekst(b[1])) + '"></span>'; }).join('');
      var merken = '';
      X.regels.forEach(function (r) {
        if (r.fase === 'concept' || r.uit) return;
        r.wanneer.forEach(function (tr) {
          if (tr.soort !== 'tijd' || (tr.dagen && tr.dagen.indexOf(d) < 0)) return;
          merken += '<span class="hv-week__merk" style="left:' + (tr.uur / 24 * 100).toFixed(2) + '%" title="' + h(HV.p(r.naam) + ' ' + uurTekst(tr.uur)) + '">' + HV.icoon('diamond', { maat: 'maker' }) + '</span>';
        });
      });
      var nu = d === vandaag ? '<span class="hv-week__nu" style="left:' + (HV.uur(w.tijd) / 24 * 100).toFixed(2) + '%"></span>' : '';
      return '<div class="hv-week__rij' + (d === vandaag ? ' is-vandaag' : '') + '"><span class="hv-week__dag">' + h(HV.p(dn)) + '</span><span class="hv-week__spoor">' + blokken + merken + nu + '</span></div>';
    }).join('');
    var as = '<div class="hv-week__rij hv-week__as"><span class="hv-week__dag"></span><span class="hv-week__spoor">' + [0, 6, 12, 18, 24].map(function (u) { return '<span class="hv-week__uur' + (u === 0 ? ' is-begin' : u === 24 ? ' is-eind' : '') + '" style="left:' + (u / 24 * 100) + '%">' + twee(u % 24 === 0 && u ? 24 : u) + '</span>'; }).join('') + '</span></div>';
    var legenda = '<p class="hv-week__legenda"><span class="hv-week__leg-blok" aria-hidden="true"></span>' + h(t('комфорт 21 °C, решта — 17,5 °C', 'comfort 21 °C, de rest 17,5 °C')) + '<span class="hv-punt">·</span>' + HV.icoon('diamond', { maat: 'maker' }) + h(t('правило з часом', 'regel met een tijd')) + '</p>';
    return '<div class="hv-week" role="img" aria-label="' + h(t('Тижневий розклад клімату й правил', 'Weekrooster van klimaat en regels')) + '">' + rijen + as + '</div>' + legenda;
  }

  // ───────────────────────── Реєстрація ─────────────────────────
  HV.scherm({
    id: 'automatiseringen', sectie: 'automatisering', titel: ['Автоматика', 'Automatisering'], icoon: 'workflow', adres: '/automatiseringen',
    tabs: [
      { id: 'regels', titel: ['Правила', 'Regels'], adres: '/automatiseringen', render: regelsPagina },
      { id: 'scenes', titel: ['Сцени й режими', 'Scènes en standen'], adres: '/scenes', render: scenesPagina },
      { id: 'dagorde', titel: ['Порядок дня', 'Dagorde'], adres: '/automatiseringen/dagorde', render: dagordePagina },
      { id: 'regel', titel: ['Правило', 'Regel'], adres: '/automatiseringen/:object', verborgen: true, render: regelPagina },
      { id: 'proef', titel: ['Пробний прогін', 'Proefdraaien'], adres: '/automatiseringen/:object/proef', verborgen: true, render: proefPagina },
      { id: 'verloop', titel: ['Перебіг', 'Verloop'], adres: '/automatiseringen/:object/verloop', verborgen: true, render: verloopPagina },
      { id: 'versies', titel: ['Версії', 'Versies'], adres: '/automatiseringen/:object/versies', verborgen: true, render: versiesPagina },
      { id: 'scene', titel: ['Сцена', 'Scène'], adres: '/scenes/:object', verborgen: true, render: scenePagina },
      { id: 'stand', titel: ['Режим дому', 'Huisstand'], adres: '/scenes/standen/:object', verborgen: true, render: standPagina }
    ]
  });

  // ───────────────────────── Acties ─────────────────────────
  var R = function (g) { return regel(g.regel); };
  HV.actie('regel-schakel', function (ctx, g) {
    var r = R(g); if (!r) return;
    var mens = HV.mens(), was = r.uit, wasPauze = r.pauze;
    HV.staat.wijzig(function () { if (r.pauze) { r.pauze = null; r.uit = false; } else r.uit = !r.uit; });
    HV.logboek.voegToe({ maker: mens, wat: ['Правило «' + r.naam[0] + '»', 'Regel ‘' + r.naam[1] + '’'], was: was ? ['вимкнено', 'uit'] : wasPauze ? ['призупинено', 'gepauzeerd'] : ['працює', 'actief'], werd: r.uit ? ['вимкнено', 'uit'] : ['працює', 'actief'], soort: 'huis.automatisering' });
    HV.meld({ maker: mens, icoon: r.uit ? 'circle-off' : 'circle-check', titel: HV.p(r.naam) + ': ' + (r.uit ? t('вимкнено', 'uit') : t('працює', 'actief')), tekst: r.uit ? t('Не спрацюватиме, доки не ввімкнете знову.', 'Gaat niet af tot je de regel weer aanzet.') : t('Спрацює за своєю подією запуску.', 'Gaat af op de eigen aanleiding.'),
      terug: function () { HV.staat.wijzig(function () { r.uit = was; r.pauze = wasPauze; }); HV.logboek.voegToe({ maker: mens, wat: ['Повернуто: «' + r.naam[0] + '»', 'Ongedaan: ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' }); } });
  });
  HV.actie('regel-fase', function (ctx, g) { var r = R(g); if (r) zetFase(r, g.waarde); });
  HV.actie('regel-overnemen', function (ctx, g) {
    var r = R(g); if (!r) return;
    var mens = HV.mens(), was = r.namens;
    if (HV.rol() !== 'eigenaar' && HV.rol() !== 'bewoner') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не перебрано', 'Niet overgenomen'), tekst: t('Чому ні: правило може нести власник або мешканець.', 'Waarom niet: een regel dragen kan de eigenaar of een bewoner.') }); return; }
    HV.staat.wijzig(function () { r.namens = mens.id; });
    HV.logboek.voegToe({ maker: mens, wat: ['Правило «' + r.naam[0] + '»: від імені', 'Regel ‘' + r.naam[1] + '’: namens'], was: mensNaam(was), werd: mens.naam, soort: 'huis.automatisering', gewicht: 'belangrijk' });
    HV.meld({ maker: mens, icoon: 'user', titel: t('Правило діє від вашого імені', 'De regel werkt nu namens jou'), tekst: HV.p(mensNaam(was)) + ' → ' + HV.p(mens.naam), terug: function () { HV.staat.wijzig(function () { r.namens = was; }); } });
  });
  HV.actie('regel-nu', function (ctx, g) { var r = R(g); if (!r) return; if (r.loopt) { HV.meld({ icoon: 'hourglass', titel: HV.p(r.naam), tekst: t('Уже виконується.', 'Loopt al.') }); return; } startTaak({ regel: r, bron: 'handmatig' }); });
  HV.actie('regel-echt', function (ctx, g) { var r = R(g); if (!r) return; if (r.loopt) return; startTaak({ regel: r, bron: 'handmatig', aanleiding: ['пробний прогін → «Виконати насправді»: ' + HV.mens().naam[0], 'proefdraaien → ‘Echt uitvoeren’: ' + HV.mens().naam[1]] }); HV.open('automatiseringen-regel-' + r.id); });
  HV.actie('regel-hervat', function (ctx, g) { var r = R(g); if (!r) return; HV.staat.wijzig(function () { r.pauze = null; }); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Продовжено: «' + r.naam[0] + '»', 'Hervat: ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' }); HV.meld({ maker: HV.mens(), icoon: 'play', titel: t('Продовжено: ', 'Hervat: ') + HV.p(r.naam) }); });
  HV.actie('regel-quarantaine', function (ctx, g) {
    var r = R(g); if (!r) return;
    HV.staat.wijzig(function () { r.quarantaine = false; r.fouten = 0; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Карантин знято: «' + r.naam[0] + '»', 'Uit quarantaine: ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'circle-check', titel: t('Карантин знято', 'Uit quarantaine'), tekst: HV.p(r.naam) + t(' спрацює за наступною подією запуску.', ' gaat af bij de volgende aanleiding.'), terug: function () { HV.staat.wijzig(function () { r.quarantaine = true; r.fouten = 3; }); } });
  });
  HV.actie('regel-verwijder', function (ctx, g) {
    var r = R(g); if (!r) return;
    var X = A(), i = X.regels.indexOf(r);
    HV.staat.wijzig(function () { X.regels.splice(i, 1); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Чернетку видалено: «' + r.naam[0] + '»', 'Concept verwijderd: ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'trash-2', titel: t('Чернетку видалено', 'Concept verwijderd'), tekst: HV.p(r.naam), terug: function () { HV.staat.wijzig(function () { X.regels.splice(i, 0, r); }); } });
    HV.open('automatiseringen');
  });
  HV.actie('regel-wis', function (ctx, g) { var r = R(g); if (r) HV.staat.wijzig(function () { r.werk = null; }); });
  HV.actie('regel-opslaan', function (ctx, g) { var r = R(g); if (r) opslaan(r, g.ondanks === '1'); });
  HV.actie('regel-wijze', function (ctx, g) { var r = R(g); if (r) bewerk(r, function (v) { v.als.wijze = g.waarde; }); });
  HV.actie('regel-naUitval', function (ctx, g) { var r = R(g); if (r) bewerk(r, function (v) { v.opties.naUitval = g.waarde; }); });
  HV.actie('regel-optie', function (ctx, g) {
    var r = R(g); if (!r) return;
    bewerk(r, function (v) { var stap = Number(g.stap) || 1, grens = g.veld === 'stabiel' ? [0, 600] : [0, 240]; v.opties[g.veld] = Math.max(grens[0], Math.min(grens[1], (Number(v.opties[g.veld]) || 0) + Number(g.richting) * stap)); });
  });
  HV.actie('regel-standen', function (ctx, g) {
    var r = R(g); if (!r) return;
    bewerk(r, function (v) { var i = v.standen.indexOf(g.stand); if (i >= 0) v.standen.splice(i, 1); else v.standen.push(g.stand); v.standen.sort(function (a, b) { return STANDEN.indexOf(a) - STANDEN.indexOf(b); }); });
  });
  HV.actie('regel-zet', function (ctx, g) {
    var r = R(g); if (!r) return;
    bewerk(r, function (v) {
      var sec = { w: 'wanneer', a: 'als', d: 'dan' }[g.sleutel.charAt(0)], i = Number(g.sleutel.slice(1));
      var s = (sec === 'als' ? v.als.lijst : v[sec])[i];
      if (!s) return;
      var w = g.waarde;
      if (g.veld === 'komt') s.komt = w === 'ja';
      else if (g.veld === 'grens') s.grens = w === 'ja' ? s.min : null;
      else if (g.veld === 'waarde') s.waarde = w === 'true' ? true : w === 'false' ? false : isNaN(Number(w)) ? w : Number(w);
      else s[g.veld] = w;
    });
  });
  HV.actie('regel-stap', function (ctx, g) {
    var r = R(g); if (!r) return;
    bewerk(r, function (v) {
      var sec = { w: 'wanneer', a: 'als', d: 'dan' }[g.sleutel.charAt(0)], i = Number(g.sleutel.slice(1));
      var s = (sec === 'als' ? v.als.lijst : v[sec])[i];
      if (!s) return;
      var stap = Number(g.stap) || 1, nieuw = (Number(s[g.veld]) || 0) + Number(g.richting) * stap;
      var GR = { uur: [0, 23.75], van: [0, 23.5], tot: [0, 23.5], min: s.soort === 'zon' ? [-120, 120] : [1, 240], boven: [0, 2000], onder: [-0.1, 0.6], waarde: s.mogelijkheid === 'doel' || s.soort === 'kamerdoel' ? [5, 30] : [1, 100] };
      var gr = GR[g.veld] || [-1e6, 1e6];
      nieuw = Math.max(gr[0], Math.min(gr[1], Math.round(nieuw * 100) / 100));
      s[g.veld] = nieuw;
      if (g.veld === 'min' && s.soort === 'wacht' && s.grens != null) s.grens = nieuw;
    });
  });
  HV.actie('regel-dag', function (ctx, g) {
    var r = R(g); if (!r) return;
    bewerk(r, function (v) { var s = v.wanneer[Number(g.sleutel.slice(1))]; if (!s) return; var d = Number(g.dag), i = s.dagen.indexOf(d); if (i >= 0) { if (s.dagen.length > 1) s.dagen.splice(i, 1); } else s.dagen.push(d); s.dagen.sort(); });
  });
  HV.actie('regel-stapweg', function (ctx, g) {
    var r = R(g); if (!r) return;
    bewerk(r, function (v) { var sec = { w: 'wanneer', a: 'als', d: 'dan' }[g.sleutel.charAt(0)], i = Number(g.sleutel.slice(1)); (sec === 'als' ? v.als.lijst : v[sec]).splice(i, 1); });
    HV.bladOpen(null);
  });
  HV.actie('regel-voegtoe', function (ctx, g) {
    var r = R(g); if (!r) return;
    var x = INTENTIES[g.sectie].filter(function (y) { return y.id === g.intentie; })[0];
    if (!x) return;
    var sec = { w: 'wanneer', a: 'als', d: 'dan' }[g.sectie], nieuweIndex = 0;
    bewerk(r, function (v) { var lijst = sec === 'als' ? v.als.lijst : v[sec]; nieuweIndex = lijst.length; x.maak.forEach(function (m) { lijst.push(kopie(m)); }); });
    HV.bladOpen('regelstap:' + g.sectie + nieuweIndex);
  });
  function nieuweRegel(p) {
    var X = A(), mens = HV.mens(), n = ++X.teller;
    var r = maakRegel({ id: 'eigen' + n, naam: p.naam, icoon: p.icoon, kamer: p.kamer || 'woonkamer', fase: 'concept', namens: mens.id, versie: 1, maker: p.maker || mens, wanneer: p.wanneer, als: p.als, dan: p.dan, standen: p.standen });
    r.versies = [{ nr: 1, tijd: HV.staat.w.tijd, maker: p.maker || mens, wat: p.wat || ['Створено', 'Aangemaakt'], snap: momentopname(r) }];
    delete r.geschiedenis;
    HV.staat.wijzig(function () { X.regels.unshift(r); });
    HV.logboek.voegToe({ maker: mens, wat: ['Нова чернетка: «' + r.naam[0] + '»', 'Nieuw concept: ‘' + r.naam[1] + '’'], waarom: p.waarom || null, soort: 'huis.automatisering' });
    HV.meld({ maker: mens, icoon: 'pencil-line', titel: t('Чернетку створено', 'Concept gemaakt'), tekst: HV.p(r.naam) + t(' — нічого не робить, доки не ввімкнете.', ' — doet niets tot je het aanzet.'), terug: function () { HV.staat.wijzig(function () { X.regels = X.regels.filter(function (x) { return x !== r; }); }); } });
    HV.open('automatiseringen-regel-' + r.id);
    return r;
  }
  HV.actie('regel-maak', function (ctx, g) {
    var x = INTENTIES.w.filter(function (y) { return y.id === g.intentie; })[0];
    if (!x) return;
    nieuweRegel({ naam: ['Нове правило: ' + x.naam[0].toLowerCase(), 'Nieuwe regel: ' + x.naam[1].toLowerCase()], icoon: x.icoon, wanneer: kopie(x.maak.slice(0, 1)), als: { wijze: 'alle', lijst: [] }, dan: [] });
  });
  HV.actie('recept-maak', function (ctx, g) {
    var x = RECEPTEN.filter(function (y) { return y.id === g.recept; })[0];
    if (!x) return;
    var b = x.bouw(receptKeuze(x));
    nieuweRegel({ naam: x.naam, icoon: x.icoon, kamer: b.dan[0] && app(b.dan[0].doel) ? app(b.dan[0].doel).kamer : 'woonkamer', wanneer: b.wanneer, als: b.als, dan: b.dan, standen: b.standen, wat: ['Створено з рецепта', 'Aangemaakt uit een recept'], waarom: ['рецепт «' + x.naam[0] + '»', 'recept ‘' + x.naam[1] + '’'] });
  });
  HV.actie('voorstel-bekijk', function (ctx, g) { var v = A().voorstellen.filter(function (x) { return x.id === g.voorstel; })[0]; if (!v) return; HV.ui.zet('aut-voorstel', v.id); HV.open('automatiseringen-regel-' + v.regel); });
  HV.actie('voorstel-weg', function (ctx, g) {
    var X = A(), v = X.voorstellen.filter(function (x) { return x.id === g.voorstel; })[0]; if (!v) return;
    HV.staat.wijzig(function () { X.voorstellen = X.voorstellen.filter(function (x) { return x !== v; }); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Пропозицію відхилено', 'Voorstel afgewezen'], waarom: v.wat, soort: v.maker.soort === 'agent' ? 'huis.agent' : 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'x', titel: t('Пропозицію відхилено', 'Voorstel afgewezen'), tekst: HV.p(v.wat), terug: function () { HV.staat.wijzig(function () { X.voorstellen.unshift(v); }); } });
  });
  HV.actie('voorstel-neem', function (ctx, g) {
    var X = A(), v = X.voorstellen.filter(function (x) { return x.id === g.voorstel; })[0]; if (!v) return;
    var r = regel(v.regel); if (!r) return;
    bewerk(r, function (w) { v.pas(w); });
    HV.staat.wijzig(function () { X.voorstellen = X.voorstellen.filter(function (x) { return x !== v; }); });
    HV.ui.zet('aut-voorstel', null);
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Пропозицію агента взято в чернетку: «' + r.naam[0] + '»', 'Voorstel van de agent in het concept: ‘' + r.naam[1] + '’'], waarom: v.wat, soort: 'huis.agent' });
    HV.meld({ maker: HV.mens(), icoon: 'pencil-line', titel: t('Зміни агента в чернетці', 'Wijzigingen van de agent in het concept'), tekst: t('Перевірте й збережіть — версія ', 'Controleer en sla op — versie ') + r.versie + t(' працює далі.', ' blijft werken.') });
  });
  HV.actie('voorstel-gewoonte', function (ctx, g) {
    var X = A(), v = X.voorstellen.filter(function (x) { return x.id === g.voorstel; })[0]; if (!v) return;
    HV.staat.wijzig(function () { X.voorstellen = X.voorstellen.filter(function (x) { return x !== v; }); });
    nieuweRegel({ naam: ['Кабінет: світло о 18:10', 'Werkkamer: licht om 18:10'], icoon: 'briefcase', kamer: 'werkkamer', wanneer: [{ soort: 'tijd', uur: 18 + 10 / 60, dagen: [1, 2, 3, 4, 5] }], als: { wijze: 'alle', lijst: [] }, dan: [{ soort: 'apparaat', doel: 'werklicht', mogelijkheid: 'aan', waarde: false, fout: 'doorgaan' }], waarom: v.wat, wat: ['Створено зі звички', 'Aangemaakt uit een gewoonte'] });
  });
  HV.actie('aut-filter-wis', function () { HV.ui.zet('aut-filter', 'alle'); HV.ui.zet('aut-maker', 'alle'); HV.ui.zet('aut-kamer', 'alle'); });
  HV.actie('aut-run', function (ctx, g) { HV.ui.zet('aut-run', g.run); HV.open('automatiseringen-verloop-' + g.regel); });
  HV.actie('taak-stop', function (ctx, g) { var taak = vindTaak(g.taak); if (taak) stopTaak(taak); });
  HV.actie('taak-verder', function (ctx, g) { var taak = vindTaak(g.taak); if (!taak) return; taak.tot = null; HV.logboek.voegToe({ maker: HV.mens(), wat: ['Очікування пропущено: ' + taak.naam[0], 'Wachten overgeslagen: ' + taak.naam[1]], soort: 'huis.automatisering' }); verder(taak); });
  HV.actie('grens-schakel', function (ctx, g) {
    var X = A(), b = X.begrenzingen.filter(function (x) { return x.id === g.grens; })[0]; if (!b) return;
    if (HV.rol() !== 'eigenaar') { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не змінено', 'Niet gewijzigd'), tekst: t('Обмеження змінює лише власник.', 'Alleen de eigenaar wijzigt begrenzingen.') }); return; }
    HV.staat.wijzig(function () { b.aan = !b.aan; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Обмеження: ' + b.naam[0], 'Begrenzing: ' + b.naam[1]], was: b.aan ? ['вимкнено', 'uit'] : ['діє', 'actief'], werd: b.aan ? ['діє', 'actief'] : ['вимкнено', 'uit'], soort: 'huis.systeem', gewicht: 'belangrijk' });
    HV.meld({ maker: HV.mens(), icoon: 'shield-check', titel: HV.p(b.naam), tekst: b.aan ? t('Обмеження діє.', 'De begrenzing werkt.') : t('Обмеження вимкнено.', 'De begrenzing staat uit.'), terug: function () { HV.staat.wijzig(function () { b.aan = !b.aan; }); } });
  });
  HV.actie('aut-oefen', function () {
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Навчальна тривога: аварійний план «Дим»', 'Oefenalarm: noodplan ‘Rook’'], waarom: ['перевірка плану, без сирени', 'controle van het plan, zonder sirene'], soort: 'huis.simulatie', gewicht: 'belangrijk' });
    HV.meld({ maker: HV.mens(), icoon: 'siren', gewicht: 'belangrijk', titel: t('Навчальна тривога', 'Oefenalarm'), tekst: t('План «Дим»: світло на 100 %, двері відімкнуться лише людиною, сповіщення всім удома. Сирена мовчить.', 'Plan ‘Rook’: licht op 100 %, deuren alleen door een mens open, melding aan iedereen thuis. De sirene zwijgt.') });
  });
  HV.actie('pauze-kies', function (ctx, g) { var k = (HV.ui.lees('pauze-keuze', '') || '').split(',').filter(Boolean); var i = k.indexOf(g.regel); if (i >= 0) k.splice(i, 1); else k.push(g.regel); HV.ui.zet('pauze-keuze', k.join(',')); });
  HV.actie('pauze-doe', function (ctx) {
    var w = ctx.staat, X = A(w), k = (HV.ui.lees('pauze-keuze', '') || '').split(',').filter(Boolean);
    if (!k.length) { HV.meld({ icoon: 'info', titel: t('Оберіть правила', 'Kies regels'), tekst: t('Позначте хоча б одне правило в списку.', 'Vink minstens één regel aan.') }); return; }
    var tot = pauzeTot(w, HV.ui.lees('pauze-duur', 'ochtend')), mens = HV.mens();
    var regels = k.map(function (id) { return regel(id, X); }).filter(Boolean);
    var vorig = regels.map(function (r) { return r.pauze; });
    HV.staat.wijzig(function () { regels.forEach(function (r) { r.pauze = { tot: tot, wie: mens.naam }; }); });
    regels.forEach(function (r) { HV.logboek.voegToe({ maker: mens, wat: ['Призупинено до ' + HV.tijd(tot) + ': «' + r.naam[0] + '»', 'Gepauzeerd tot ' + HV.tijd(tot) + ': ‘' + r.naam[1] + '’'], soort: 'huis.automatisering' }); });
    HV.meld({ maker: mens, icoon: 'pause', titel: t('Призупинено правил: ', 'Regels gepauzeerd: ') + regels.length, tekst: t('До ', 'Tot ') + HV.tijd(tot), terug: function () { HV.staat.wijzig(function () { regels.forEach(function (r, i) { r.pauze = vorig[i]; }); }); } });
    HV.ui.zet('pauze-keuze', '');
    HV.bladOpen(null);
  });
  HV.actie('reeks-veld', function (ctx, g) {
    var x = REEKSEN.filter(function (y) { return y.id === g.reeks; })[0]; if (!x) return;
    var f = x.velden.filter(function (y) { return y.id === g.veld; })[0], v = reeksWaarden(x);
    HV.ui.zet('reeks-' + x.id + '-' + f.id, Math.max(f.min, Math.min(f.max, v[f.id] + Number(g.richting) * f.stap)));
  });
  HV.actie('reeks-start', function (ctx, g) {
    var x = REEKSEN.filter(function (y) { return y.id === g.reeks; })[0]; if (!x) return;
    var mens = HV.mens(), stappen = x.stappen(reeksWaarden(x));
    var zwaar = stappen.filter(function (s) { var a = actieVan(s); return a && HV.gevaar.isZwaar(a); })[0];
    var start = function () { HV.bladOpen(null); startTaak({ door: mens, naam: x.naam, dan: stappen, reeks: x.id, bron: 'handmatig' }); };
    if (zwaar && HV.schil && HV.schil.gevaar) { var a = actieVan(zwaar); HV.schil.gevaar({ actie: a, naam: HV.p(x.naam) + ': ' + HV.p(a.naam), apparaat: app(zwaar.doel) || null, waarde: zwaar.waarde }).then(function (ja) { if (ja) start(); }); return; }
    start();
  });

  // сцени й режими
  HV.actie('aut-scene', function (ctx, g) { startScene(g.scene, false); });
  HV.actie('scene-rest', function (ctx, g) { startScene(g.scene, true); A().sceneHandmatig[g.scene] = 0; });
  HV.actie('aut-alles', function (ctx, g) { HV.doe({ doel: 'alle', mogelijkheid: g.wat === 'alles' ? 'alles' : 'licht', waarde: false }); });
  HV.actie('scene-proef', function (ctx, g) {
    var w = ctx.staat, X = A(w), scene = sceneVan(g.scene); if (!scene) return;
    var voor = kopie({ apparaten: w.apparaten, huisstand: w.huisstand, kamers: w.kamers, sceneActief: w.sceneActief });
    X.proef = { scene: scene.id, voor: voor };
    HV.doe({ doel: 'scene:' + scene.id, mogelijkheid: 'start', waarde: true, stil: true, waarom: ['перегляд наживо', 'live proberen'] });
  });
  HV.actie('scene-proef-terug', function (ctx) {
    var X = A(ctx.staat); if (!X.proef) return;
    var voor = X.proef.voor, naam = sceneVan(X.proef.scene);
    HV.staat.wijzig(function (x) { x.apparaten = voor.apparaten; x.huisstand = voor.huisstand; x.kamers = voor.kamers; x.sceneActief = voor.sceneActief; X.proef = null; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Перегляд наживо завершено: стан повернуто', 'Live proberen klaar: toestand teruggezet'], waarom: naam ? [naam.naam[0], naam.naam[1]] : null, soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'undo-2', titel: t('Повернуто як було', 'Terug naar hoe het was'), tekst: t('Стан дому до перегляду відновлено.', 'De toestand van voor het proberen is hersteld.') });
    HV.klok.stap(0);
  });
  HV.actie('scene-proef-houd', function (ctx) { var X = A(ctx.staat); HV.staat.wijzig(function () { X.proef = null; }); HV.meld({ maker: HV.mens(), icoon: 'check', titel: t('Залишено як є', 'Zo gelaten'), tekst: t('Стан після перегляду лишається.', 'De toestand na het proberen blijft.') }); });
  HV.actie('scene-stapweg', function (ctx, g) {
    var scene = sceneVan(g.scene); if (!scene) return;
    var voor = scene.stappen.slice(), a = app(g.doel);
    HV.staat.wijzig(function () { scene.stappen = scene.stappen.filter(function (s) { return s.doel !== g.doel; }); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Сцена «' + scene.naam[0] + '»: прибрано «' + (a ? a.naam[0] : g.doel) + '»', 'Scène ‘' + scene.naam[1] + '’: ‘' + (a ? a.naam[1] : g.doel) + '’ verwijderd'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'x', titel: t('Прибрано зі сцени', 'Uit de scène gehaald'), tekst: HV.p(scene.naam) + (a ? ' · ' + HV.p(a.naam) : ''), terug: function () { HV.staat.wijzig(function () { scene.stappen = voor; }); } });
  });
  HV.actie('scene-bijwerken', function (ctx, g) {
    var scene = sceneVan(g.scene); if (!scene) return;
    var voor = kopie(scene.stappen), n = 0;
    HV.staat.wijzig(function () { scene.stappen.forEach(function (s) { var a = app(s.doel); if (!a || a.beschikbaar !== 'ok') return; var nu = HV.huidige(a, s.mogelijkheid); if (nu !== undefined && String(nu) !== String(s.waarde) && typeof nu !== 'object') { s.waarde = nu; n++; } }); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Сцена «' + scene.naam[0] + '» оновлена з поточного стану', 'Scène ‘' + scene.naam[1] + '’ bijgewerkt uit de huidige stand'], werd: [n + ' змін', n + ' wijzigingen'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'camera', titel: t('Сцену оновлено', 'Scène bijgewerkt'), tekst: t('Змінено кроків: ', 'Stappen gewijzigd: ') + n, terug: function () { HV.staat.wijzig(function () { scene.stappen = voor; }); } });
  });
  HV.actie('scene-weg', function (ctx, g) {
    var w = ctx.staat, scene = sceneVan(g.scene); if (!scene) return;
    var i = w.scenes.indexOf(scene);
    HV.staat.wijzig(function (x) { x.scenes.splice(i, 1); if (x.sceneActief === scene.id) x.sceneActief = null; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Сцену видалено: «' + scene.naam[0] + '»', 'Scène verwijderd: ‘' + scene.naam[1] + '’'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'trash-2', titel: t('Сцену видалено', 'Scène verwijderd'), tekst: HV.p(scene.naam), terug: function () { HV.staat.wijzig(function (x) { x.scenes.splice(i, 0, scene); }); } });
    HV.open('automatiseringen-scenes');
  });
  HV.actie('sn-kies', function (ctx, g) { var k = (HV.ui.lees('sn-uit', '') || '').split(',').filter(Boolean); var i = k.indexOf(g.doel); if (i >= 0) k.splice(i, 1); else k.push(g.doel); HV.ui.zet('sn-uit', k.join(',')); });
  HV.actie('sn-opslaan', function (ctx) {
    var w = ctx.staat, X = A(w), km = HV.ui.lees('sn-kamer', 'woonkamer'), nm = HV.ui.lees('sn-naam', 'lezen');
    var uit = (HV.ui.lees('sn-uit', '') || '').split(',').filter(Boolean);
    var lijst = snKandidaten(km).filter(function (a) { return a.beschikbaar !== 'onbereikbaar' && a.beschikbaar !== 'verouderd' && uit.indexOf(a.id) < 0; });
    if (!lijst.length) { HV.meld({ icoon: 'info', titel: t('Немає що зберегти', 'Niets om op te slaan'), tekst: t('Позначте хоча б один пристрій.', 'Vink minstens één apparaat aan.') }); return; }
    var naam = SCENE_NAMEN.filter(function (x) { return x[0] === nm; })[0];
    var id = 'eigen' + (++X.teller);
    var kmNaam = km === 'alle' ? null : kamer(km).naam;
    var scene = { id: id, icoon: naam[2], naam: kmNaam ? [naam[1][0] + ' · ' + kmNaam[0], naam[1][1] + ' · ' + kmNaam[1]] : naam[1], stappen: [] };
    lijst.forEach(function (a) { scene.stappen = scene.stappen.concat(snStappen(a)); });
    HV.staat.wijzig(function (x) { x.scenes.push(scene); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Нова сцена: «' + scene.naam[0] + '»', 'Nieuwe scène: ‘' + scene.naam[1] + '’'], werd: [scene.stappen.length + ' кроків', scene.stappen.length + ' stappen'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'camera', titel: t('Сцену збережено', 'Scène opgeslagen'), tekst: HV.p(scene.naam) + ' · ' + scene.stappen.length + t(' кроків', ' stappen'), terug: function () { HV.staat.wijzig(function (x) { x.scenes = x.scenes.filter(function (s) { return s !== scene; }); }); } });
    HV.ui.zet('sn-uit', '');
    HV.open('automatiseringen-scene-' + id);
  });
  HV.actie('dagdeel-wissel', function (ctx, g) {
    var X = A(ctx.staat), opties = [null].concat(ctx.staat.scenes.map(function (s) { return s.id; }));
    var nu = X.dagdeel[g.deel], i = opties.indexOf(nu), was = nu;
    var nieuw = opties[(i + 1) % opties.length];
    HV.staat.wijzig(function () { X.dagdeel[g.deel] = nieuw; });
    var deel = DAGDEEL.filter(function (d) { return d[0] === g.deel; })[0], sc = nieuw ? sceneVan(nieuw) : null;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Добова сцена: ' + deel[1][0].toLowerCase(), 'Dagdeelscène: ' + deel[1][1].toLowerCase()], werd: sc ? sc.naam : ['без сцени', 'geen scène'], soort: 'huis.automatisering' });
    void was;
  });
  HV.actie('dagdeel-start', function (ctx) {
    var w = ctx.staat, X = A(w), volgorde = DAGDEEL.map(function (d) { return d[0]; });
    var deel = dagdeelNu(w);
    if (X.dagdeelLaatst && Date.now() - X.dagdeelLaatst.echt < 60000) deel = volgorde[(volgorde.indexOf(X.dagdeelLaatst.deel) + 1) % volgorde.length];
    var n = 0;
    while (!X.dagdeel[deel] && n < 4) { deel = volgorde[(volgorde.indexOf(deel) + 1) % volgorde.length]; n++; }
    X.dagdeelLaatst = { deel: deel, echt: Date.now() };
    if (X.dagdeel[deel]) startScene(X.dagdeel[deel], false);
  });
  HV.actie('matrix', function (ctx, g) {
    var r = R(g); if (!r) return;
    var i = r.standen.indexOf(g.stand), aan = i < 0, mens = HV.mens();
    HV.staat.wijzig(function () { if (aan) r.standen.push(g.stand); else r.standen.splice(i, 1); r.standen.sort(function (a, b) { return STANDEN.indexOf(a) - STANDEN.indexOf(b); }); });
    HV.logboek.voegToe({ maker: mens, wat: ['«' + r.naam[0] + '» у режимі «' + HV.huisstanden[g.stand][0] + '»', '‘' + r.naam[1] + '’ in de stand ‘' + HV.huisstanden[g.stand][1] + '’'], was: aan ? ['не діє', 'werkt niet'] : ['діє', 'werkt'], werd: aan ? ['діє', 'werkt'] : ['не діє', 'werkt niet'], soort: 'huis.automatisering' });
    HV.meld({ maker: mens, icoon: STAND_ICOON[g.stand], titel: HV.p(r.naam), tekst: HV.p(HV.huisstanden[g.stand]) + ': ' + (aan ? t('діє', 'werkt') : t('не діє', 'werkt niet')), terug: function () { HV.staat.wijzig(function () { var j = r.standen.indexOf(g.stand); if (aan && j >= 0) r.standen.splice(j, 1); if (!aan && j < 0) r.standen.push(g.stand); }); } });
  });
  HV.actie('overgang-schakel', function (ctx, g) {
    var X = A(ctx.staat), o2 = X.overgangen.filter(function (x) { return x.id === g.overgang; })[0]; if (!o2) return;
    HV.staat.wijzig(function () { o2.aan = !o2.aan; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Перехід: ' + overgangZin(o2)[0], 'Overgang: ' + overgangZin(o2)[1]], was: o2.aan ? ['вимкнено', 'uit'] : ['діє', 'actief'], werd: o2.aan ? ['діє', 'actief'] : ['вимкнено', 'uit'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: o2.icoon, titel: HV.p(overgangZin(o2)), tekst: o2.aan ? t('Перехід діє.', 'De overgang werkt.') : t('Перехід вимкнено.', 'De overgang staat uit.'), terug: function () { HV.staat.wijzig(function () { o2.aan = !o2.aan; }); } });
  });
  HV.actie('overgang-stap', function (ctx, g) {
    var X = A(ctx.staat), o2 = X.overgangen.filter(function (x) { return x.id === g.overgang; })[0]; if (!o2) return;
    var stap = Number(g.stap) || 1, was = o2[g.veld];
    HV.staat.wijzig(function () { o2[g.veld] = g.veld === 'uur' ? ((o2.uur + Number(g.richting) * stap) % 24 + 24) % 24 : Math.max(0, Math.min(120, o2.min + Number(g.richting) * stap)); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Перехід: ' + overgangZin(o2)[0], 'Overgang: ' + overgangZin(o2)[1]], was: [String(g.veld === 'uur' ? uurTekst(was) : was + ' хв'), String(g.veld === 'uur' ? uurTekst(was) : was + ' min')], soort: 'huis.automatisering' });
  });
  HV.actie('stand-vast', function (ctx, g) {
    var w = ctx.staat, X = A(w), mens = HV.mens(), was = X.vast;
    if (!g.tot) {
      HV.staat.wijzig(function () { X.vast = null; });
      HV.logboek.voegToe({ maker: mens, wat: ['Автоматику режимів відновлено', 'Automatisering van de standen hervat'], soort: 'huis.automatisering' });
      HV.meld({ maker: mens, icoon: 'rotate-ccw', titel: t('Автоматику відновлено', 'Automatisering hervat'), tekst: t('Переходи режимів знову діють.', 'Overgangen werken weer.'), terug: function () { HV.staat.wijzig(function () { X.vast = was; }); } });
      return;
    }
    var d0 = dagBegin(w.tijd), u = Number(g.tot), tot = u === 1 ? w.tijd + UUR : d0 + u * UUR;
    if (tot <= w.tijd) tot += DAG;
    HV.staat.wijzig(function () { X.vast = { tot: tot, wie: mens.naam, stand: w.huisstand }; });
    HV.logboek.voegToe({ maker: mens, wat: ['Режим «' + HV.huisstanden[w.huisstand][0] + '» зафіксовано до ' + HV.tijd(tot), 'Stand ‘' + HV.huisstanden[w.huisstand][1] + '’ vastgezet tot ' + HV.tijd(tot)], soort: 'huis.automatisering' });
    HV.meld({ maker: mens, icoon: 'hand', titel: t('Зафіксовано до ', 'Vastgezet tot ') + HV.tijd(tot), tekst: t('Переходи режимів чекатимуть.', 'Overgangen wachten.'), terug: function () { HV.staat.wijzig(function () { X.vast = was; }); } });
  });
  HV.actie('aut-alarm', function (ctx, g) { HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: g.stand }); });
  HV.actie('gasten-stap', function (ctx, g) {
    var w = ctx.staat, X = A(w), d0 = dagBegin(w.tijd), nu = X.gastenTot || d0 + 6 * DAG + 12 * UUR;
    var dagen = Math.max(1, Math.min(30, Math.round((nu - d0) / DAG) + Number(g.richting)));
    HV.staat.wijzig(function () { X.gastenTot = d0 + dagen * DAG + 12 * UUR; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Режим «Гості» до ' + HV.datumKort(X.gastenTot), 'Stand ‘Gasten’ tot ' + HV.datumKort(X.gastenTot)], soort: 'huis.automatisering' });
  });
  HV.actie('vt-dagen', function (ctx, g) { HV.ui.zet('vt-dagen', Math.max(1, Math.min(30, Number(HV.ui.lees('vt-dagen', 7)) + Number(g.richting)))); });
  HV.actie('vt-start', function (ctx) {
    var w = ctx.staat, X = A(w), mens = HV.mens(), dagen = Number(HV.ui.lees('vt-dagen', 7));
    var tot = dagBegin(w.tijd) + dagen * DAG + 18 * UUR, imit = HV.ui.lees('vt-imit', '1') === '1', eco = HV.ui.lees('vt-eco', '1') === '1', alarm = HV.ui.lees('vt-alarm', '1') === '1';
    HV.bladOpen(null);
    HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: 'vakantie' }).then(function (r) {
      if (!r || !r.ok) return;
      HV.staat.wijzig(function () { X.vakantie = { tot: tot, imitatie: imit, eco: eco }; });
      HV.logboek.voegToe({ maker: mens, wat: ['Відпустка до ' + HV.datumKort(tot), 'Vakantie tot ' + HV.datumKort(tot)], waarom: [(imit ? 'імітація присутності; ' : '') + (eco ? 'економний клімат' : 'клімат як є'), (imit ? 'aanwezigheid nabootsen; ' : '') + (eco ? 'zuinig klimaat' : 'klimaat zoals het is')], soort: 'huis.automatisering' });
      if (alarm) HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: 'volledig' });
    });
  });
  HV.actie('ag-overslaan', function (ctx, g) {
    var X = A(ctx.staat), aan = !X.overslaan[g.sleutel], id = g.sleutel.split('@')[0], r = regel(id, X), m = Number(g.sleutel.split('@')[1]) * MIN;
    HV.staat.wijzig(function () { if (aan) X.overslaan[g.sleutel] = true; else delete X.overslaan[g.sleutel]; });
    if (r) HV.logboek.voegToe({ maker: HV.mens(), wat: [(aan ? 'Пропустити раз: «' : 'Не пропускати: «') + r.naam[0] + '» о ' + HV.tijd(m), (aan ? 'Eén keer overslaan: ‘' : 'Niet overslaan: ‘') + r.naam[1] + '’ om ' + HV.tijd(m)], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: aan ? 'skip-forward' : 'rotate-ccw', titel: aan ? t('Пропуститься раз', 'Wordt één keer overgeslagen') : t('Пропуск скасовано', 'Overslaan geannuleerd'), tekst: r ? HV.p(r.naam) + ' · ' + HV.tijd(m) : '', terug: function () { HV.staat.wijzig(function () { if (aan) delete X.overslaan[g.sleutel]; else X.overslaan[g.sleutel] = true; }); } });
  });
  HV.actie('ag-schakel', function (ctx, g) {
    var X = A(ctx.staat), was = X[g.veld];
    var NAAM = { feestZondag: ['У свята як у неділю', 'Op feestdagen als zondag'], vakantieWeekend: ['Шкільні канікули як вихідні', 'Schoolvakantie als weekend'], afvalHerinnering: ['Нагадування про сміття', 'Herinnering voor het afval'] }[g.veld];
    HV.staat.wijzig(function () { X[g.veld] = !was; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: NAAM, was: was ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: !was ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'calendar-days', titel: HV.p(NAAM), tekst: !was ? t('Увімкнено.', 'Aan.') : t('Вимкнено.', 'Uit.'), terug: function () { HV.staat.wijzig(function () { X[g.veld] = was; }); } });
  });
  HV.actie('regel-herstel', function (ctx, g) {
    var r = R(g); if (!r) return;
    var ver = r.versies.filter(function (x) { return x.nr === Number(g.versie); })[0]; if (!ver) return;
    var rol = HV.rol();
    var zonderRecht = ver.snap.dan.filter(function (s) { var a = actieVan(s); return a && !HV.gevaar.rolMag(rol, a).mag; });
    if (zonderRecht.length) { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не відновлено', 'Niet hersteld'), tekst: t('Чому ні: крок версії понад ваші права. Що перевірити: роль. Що можна натомість: попросіть власника.', 'Waarom niet: een stap van de versie gaat boven je rechten. Wat te controleren: je rol. Wat wel kan: vraag het de eigenaar.') }); return; }
    HV.staat.wijzig(function () { r.werk = kopie(ver.snap); });
    opslaan(r, true);
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Відновлено версію ' + ver.nr + ' як версію ' + r.versie, 'Versie ' + ver.nr + ' hersteld als versie ' + r.versie], soort: 'huis.automatisering' });
    HV.ui.zet('aut-versie', r.versie);
  });
})(window.HV = window.HV || {});
