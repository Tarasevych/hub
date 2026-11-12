// Toestand van de wereld: opslag, abonnementen, toeval met zaad, de huisklok en de simulatiestap.
// Єдине сховище стану макета. Екрани лише читають (HV.staat.w, HV.kijk.*); зміни — через HV.doe (handeling.js),
// сценарії та крок симуляції. Після кожної зміни абоненти отримують один виклик на кадр.
(function (HV) {
  'use strict';

  var w = null;
  var abonnees = [];
  var gepland = false;

  function roep() {
    gepland = false;
    for (var i = 0; i < abonnees.length; i++) { try { abonnees[i](w); } catch (e) { if (window.console) console.error(e); } }
  }
  function meld() {
    if (gepland) return;
    gepland = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(roep); else setTimeout(roep, 16);
  }

  /** Детермінований генератор (mulberry32): те саме зерно — та сама доба. */
  function toeval() {
    w.zaad = (w.zaad + 0x6D2B79F5) | 0;
    var t = w.zaad;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  HV.staat = {
    get w() { return w; },
    lees: function () { return w; },
    apparaat: function (id) { return w.apparaten[id] || null; },
    kamer: function (id) { for (var i = 0; i < w.kamers.length; i++) if (w.kamers[i].id === id) return w.kamers[i]; return null; },
    /** Змінити світ: fn(w). Абоненти дізнаються на наступному кадрі. */
    wijzig: function (fn) { if (fn) fn(w); meld(); },
    abonneer: function (fn) { abonnees.push(fn); return function () { abonnees = abonnees.filter(function (x) { return x !== fn; }); }; },
    toeval: toeval,
    /** Новий світ із паспорта (скидає все, крім швидкості та стану даних, якщо передано `houd`). */
    herstel: function (tijd, houd) {
      var oud = w;
      w = HV.paspoort.bouw(tijd);
      if (houd && oud) { w.snelheid = oud.snelheid; w.pauze = oud.pauze; w.gegevens = oud.gegevens; }
      zaaiLogboek();
      stap(0);
      meld();
      return w;
    }
  };

  // ── Kijkers: afgeleide feiten, alleen uit waargenomen toestand ──
  var vers = function (a) { return a.beschikbaar === 'ok' || a.beschikbaar === 'slaapt'; };
  HV.kijk = {
    alle: function (filter) { return w.volgorde.map(function (id) { return w.apparaten[id]; }).filter(filter || function () { return true; }); },
    inKamer: function (kamerId, filter) { return HV.kijk.alle(function (a) { return a.kamer === kamerId && (!filter || filter(a)); }); },
    soort: function (soort) { return HV.kijk.alle(function (a) { return a.soort === soort; }); },
    /** Чи ввімкнено пристрій (група — якщо ввімкнено хоч одного учасника). */
    isAan: function (a) {
      if (a.leden) return a.leden.some(function (id) { return HV.kijk.isAan(w.apparaten[id]); });
      if ('aan' in a.st) return !!a.st.aan;
      if ('speelt' in a.st) return !!a.st.speelt;
      if ('loopt' in a.st) return !!a.st.loopt;
      if ('laadt' in a.st) return !!a.st.laadt;
      return false;
    },
    /** Лампи з підтвердженим увімкненим світлом (недоступні й застарілі не рахуються). */
    lampenAan: function (kamerId) {
      return HV.kijk.alle(function (a) { return a.soort === 'licht' && a.st.aan && vers(a) && (!kamerId || a.kamer === kamerId); });
    },
    lampen: function (kamerId) { return HV.kijk.alle(function (a) { return a.soort === 'licht' && (!kamerId || a.kamer === kamerId); }); },
    kamersMetLicht: function () {
      var set = {};
      HV.kijk.lampenAan().forEach(function (a) { set[a.kamer] = true; });
      return Object.keys(set);
    },
    /** Відчинені вікна й двері: [{ apparaat, minuten }]. */
    open: function () {
      return HV.kijk.alle(function (a) { return a.soort === 'contact' && a.st.open && vers(a); }).map(function (a) {
        return { apparaat: a, minuten: Math.round((w.tijd - (a.st.sinds || w.tijd)) / 60000) };
      });
    },
    temperatuur: function (kamerId) {
      var s = HV.kijk.inKamer(kamerId, function (a) { return a.soort === 'temperatuur'; })[0];
      return s || null;
    },
    thuis: function () { return w.mensen.filter(function (m) { return m.thuis; }); },
    isVers: vers,
    /** Вік останнього спостереження пристрою в мілісекундах часу дому. */
    leeftijd: function (a) { return Math.max(0, w.tijd - a.gezien); },
    groepHelderheid: function (a) {
      var aan = a.leden.map(function (id) { return w.apparaten[id]; }).filter(function (l) { return l.st.aan && 'helderheid' in l.st; });
      if (!aan.length) return 0;
      return Math.round(aan.reduce(function (s, l) { return s + l.st.helderheid; }, 0) / aan.length);
    }
  };

  // ── Journaal: begin met een paar gebeurtenissen van eerder vandaag ──
  function zaaiLogboek() {
    var t = w.tijd;
    var regels = [
      [-372, 'mens', ['Тарас', 'Taras'], ['Режим дому: «Не вдома»', 'Huisstand: ‘Afwezig’'], ['вийшли останні', 'de laatsten vertrokken'], 'huis.systeem'],
      [-371, 'automatisering', ['«Усі пішли»', '‘Iedereen weg’'], ['Термостат: 21,0 → 17,0 °C', 'Thermostaat: 21,0 → 17,0 °C'], ['режим «Не вдома»', 'stand ‘Afwezig’'], 'huis.automatisering'],
      [-310, 'mens', ['Олена', 'Olena'], ['Режим дому: «Вдома»', 'Huisstand: ‘Thuis’'], ['телефон у домашній мережі', 'telefoon op het thuisnetwerk'], 'huis.systeem'],
      [-114, 'dienst', ['Пошта', 'Bezorgdienst'], ['Дзвінок у двері', 'Er is aangebeld'], null, 'huis.toegang'],
      [-52, 'optimalisatie', ['Оптимізатор енергії', 'Energie-optimalisatie'], ['Батарея: заряджати від сонця', 'Batterij: laden op zon'], ['надлишок 1,2 кВт', 'overschot 1,2 kW'], 'huis.energie'],
      [-38, 'mens', ['Олена', 'Olena'], ['Пральна машина: старт «Бавовна 40°»', 'Wasmachine: start ‘Katoen 40°’'], null, 'huis.apparaat'],
      [-9, 'knop', ['Кнопка сцен', 'Scèneknop'], ['Лампа над столом: увімкнено', 'Lamp boven de tafel: aan'], ['подвійний натиск', 'dubbel gedrukt'], 'huis.apparaat']
    ];
    regels.forEach(function (r) {
      w.logboek.unshift({ id: 'l' + (++w.logTeller), tijd: t + r[0] * 60000, maker: { soort: r[1], naam: r[2] }, wat: r[3], waarom: r[4], soort: r[5], gewicht: r[5] === 'huis.toegang' ? 'belangrijk' : 'info', gelezen: true, sim: true });
    });
  }

  // ── Simulatiestap ──
  function stap(dt) {
    w.tijd += dt * 1000;
    if (w.gegevens !== 'live') return; // без зв'язку чи із застарілими даними спостережене не оновлюється
    var A = w.apparaten;
    var uur = HV.uur(w.tijd);
    var uren = dt / 3600;

    // сонце: схід 07:40, захід 16:55 (Утрехт, листопад); хмарність гасить
    var op = 7.66, onder = 16.92;
    var hoek = uur > op && uur < onder ? Math.sin(Math.PI * (uur - op) / (onder - op)) : 0;
    var zon = 4.2 * 0.84 * hoek * (1 - 0.82 * w.weer.bewolking) * (w.weer.mist ? 0.4 : 1);
    A.zonnepanelen.st.vermogen = Math.round(zon * 100) / 100;

    // техніка з програмою
    ['wasmachine', 'droger', 'vaatwasser'].forEach(function (id) {
      var a = A[id];
      if (!a.st.loopt) return;
      a.st.rest -= dt / 60;
      if (a.st.rest <= 0) {
        a.st.rest = 0; a.st.loopt = false; a.st.vermogen = 0;
        HV.logboek && HV.logboek.voegToe({ maker: { soort: 'simulator', naam: ['Симулятор', 'Simulator'] }, wat: [a.naam[0] + ': програму завершено', a.naam[1] + ': programma klaar'], soort: 'huis.apparaat', doel: id });
        w.nu.push({ id: 'klaar' + id, soort: 'info', maker: 'simulator', icoon: HV.paspoort.soorten[a.soort].icoon, tekst: [a.naam[0] + ': програму завершено', a.naam[1] + ': het programma is klaar'], sinds: w.tijd, acties: [{ naam: 'nu-weg', hoofd: true, label: ['Зрозуміло', 'Begrepen'] }] });
      }
    });
    if (A.koffie.st.aan && w.tijd - (A.koffie.st.sinds || w.tijd) > 4 * 60000) A.koffie.st.aan = false;

    // таймери «вимкнути о…»
    w.volgorde.forEach(function (id) {
      var a = A[id];
      if (a.st.uitOm && a.st.uitOm <= w.tijd) {
        a.st.uitOm = null;
        if (a.st.aan) {
          a.st.aan = false;
          HV.logboek && HV.logboek.voegToe({ maker: { soort: 'automatisering', naam: ['Таймер', 'Timer'] }, wat: [a.naam[0] + ': вимкнено', a.naam[1] + ': uit'], waarom: ['відлік завершено', 'aftellen voorbij'], soort: 'huis.automatisering', doel: id });
        }
      }
    });

    // температура: вітальню веде термостат, решта кімнат повільно йде до своєї цілі
    var buiten = w.weer.temp;
    var th = A.thermostaat.st;
    if (th.modus === 'uit') th.verwarmt = false;
    else if (th.temperatuur < th.doel - 0.15) th.verwarmt = true;
    else if (th.temperatuur >= th.doel + 0.05) th.verwarmt = false;
    th.temperatuur += (th.verwarmt ? 0.7 : -0.22 * (th.temperatuur - buiten) / 11) * uren;
    th.temperatuur = Math.max(buiten, Math.min(26, th.temperatuur));
    A.tempwoon.st.waarde = Math.round(th.temperatuur * 10) / 10;
    var raamOpen = A.raamslaap.st.open;
    [['tempslaap', 'slaapkamer'], ['tempkinder', 'kinderkamer'], ['tempwerk', 'werkkamer'], ['tempkeuken', 'keuken']].forEach(function (p) {
      var s = A[p[0]].st, kamer = HV.staat.kamer(p[1]);
      var doel = kamer.doel || 20.5;
      if (p[1] === 'slaapkamer' && raamOpen) s.waarde += -1.6 * (s.waarde - buiten) / 9 * uren;
      else s.waarde += (doel - s.waarde) * Math.min(1, 0.5 * uren);
      s.waarde = Math.round(s.waarde * 100) / 100;
    });
    var vb = A.vloerbad.st;
    vb.verwarmt = vb.aan && vb.temperatuur < vb.doel - 0.1;
    vb.temperatuur = Math.round((vb.temperatuur + (vb.verwarmt ? 0.5 : -0.1) * uren) * 100) / 100;
    var wp = A.warmtepomp.st;
    wp.verwarmt = wp.modus !== 'uit' && (th.verwarmt || vb.verwarmt);
    wp.vermogen = wp.verwarmt ? 620 + Math.round(toeval() * 40) : 35;

    // споживання дому
    var watt = 190 + Math.round(toeval() * 24);
    w.volgorde.forEach(function (id) {
      var a = A[id];
      if (a.leden || a.beschikbaar === 'onbereikbaar') return;
      if (a.soort === 'licht') { if (a.st.aan) watt += a.watt * ('helderheid' in a.st ? a.st.helderheid / 100 : 1); return; }
      if (a.soort === 'stopcontact') { if (a.st.aan) { watt += a.st.vermogen; a.st.vandaag = Math.round((a.st.vandaag + a.st.vermogen / 1000 * uren) * 1000) / 1000; } return; }
      if (a.soort === 'warmtepomp' || a.soort === 'wasmachine' || a.soort === 'droger' || a.soort === 'vaatwasser') { watt += a.st.vermogen || 0; return; }
      if (a.soort === 'oven') { if (a.st.aan) watt += 2100; return; }
      if (a.soort === 'boiler') { if (a.st.verwarmt) watt += 1800; return; }
      if (a.watt && HV.kijk.isAan(a)) watt += a.watt;
    });
    var huis = watt / 1000;

    // зарядка авто
    var lp = A.laadpaal.st, ev = w.voertuigen[0];
    if (lp.laadt && (!lp.aangesloten || ev.lading >= ev.doel || lp.modus === 'pauze')) lp.laadt = false;
    lp.vermogen = lp.laadt ? (lp.modus === 'snel' ? 11 : 7.4) : 0;
    if (lp.laadt) ev.lading = Math.min(100, ev.lading + lp.vermogen * uren / ev.capaciteit * 100);
    ev.bereik = Math.round(ev.lading * 4.2);
    var auto = lp.vermogen;

    // домашня батарея: надлишок сонця заряджає, нестачу покриває
    var tb = A.thuisbatterij.st;
    var over = zon - huis - auto;
    var bat = 0;
    if (tb.modus !== 'pauze') {
      if (over > 0.05 && tb.lading < 100) bat = Math.min(over, 3);
      else if (over < -0.05 && tb.lading > 12) bat = -Math.min(-over, 3);
    }
    tb.lading = Math.max(0, Math.min(100, tb.lading + bat * uren / 10 * 100));
    tb.vermogen = Math.round(bat * 100) / 100;

    var net = huis + auto + bat - zon;
    var e = w.energie;
    e.zon = zon; e.huis = huis; e.auto = auto; e.batterij = bat; e.net = net;
    if (net > 0) e.vandaagIn += net * uren; else e.vandaagUit += -net * uren;
    e.vandaagZon += zon * uren;
    var delen = [0.46, 0.31, 0.23];
    A.p1meter.st.fasen = delen.map(function (d) { return Math.round(((huis + bat - zon) * d + auto / 3) * 100) / 100; });

    // спостереження: справні пристрої щойно звітували
    w.volgorde.forEach(function (id, i) {
      var a = A[id];
      if (a.beschikbaar === 'ok') a.gezien = w.tijd - ((i * 7) % 23) * 1000;
    });
  }

  // ── Huisklok ──
  var teller = null;
  HV.klok = {
    snelheden: [1, 10, 60, 600],
    nu: function () { return w.tijd; },
    /** Швидкість часу дому: 0 — пауза, інакше ×1, ×10, ×60, ×600. */
    zet: function (snelheid) {
      HV.staat.wijzig(function (x) { if (snelheid === 0) x.pauze = true; else { x.pauze = false; x.snelheid = snelheid; } });
    },
    tik: function (echteSeconden) {
      if (!w || w.pauze) return;
      stap((echteSeconden || 1) * w.snelheid);
      meld();
    },
    stap: function (huisSeconden) { stap(huisSeconden); meld(); },
    start: function () {
      if (teller) return;
      var vorige = Date.now();
      teller = setInterval(function () {
        var nu = Date.now();
        var dt = Math.min(3, (nu - vorige) / 1000);
        vorige = nu;
        if (document.hidden) return; // прихована вкладка: час дому стоїть
        HV.klok.tik(dt);
      }, 1000);
    }
  };
})(window.HV = window.HV || {});
