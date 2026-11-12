// Energie / Енергія — розділ повністю: Зараз · Тариф · Сонце й батарея · Зарядка · Тепло · Звіти.
// Аркуші пристроїв: P1-лічильник, сонячні панелі, домашня батарея, зарядна станція. Вільні аркуші: фази, оптимізатор,
// година ціни (склад ціни), блок порядку доби, план зарядки, довідник ставок, стан джерел.
// Компонент hv-laadplan (HV.o.laadplan) належить Енергії; «Гараж» вбудовує його без змін.
// Правила зони: виміряне — суцільно; оцінене — пунктир і «≈»; кожна сума в євро в симуляції — зі словом «приклад».
// Кожна команда пристрою — через HV.doe (ворота, ризик, Журнал, «Повернути»). Зміни плану доби (не команди пристрою)
// пишуться в Журнал і мають «Повернути» так само, як у ядрі (див. favorieten-auto).
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var UUR = 3600000, DAG = 86400000;
  var OPT = { soort: 'optimalisatie', id: 'optimalisatie', naam: ['Оптимізатор енергії', 'Energie-optimalisatie'] };

  // ───────────────────────── Uitbreiding van de gevaarmatrix ─────────────────────────
  // Дії Енергії, яких немає в ядрі. Додаються в спільний масив HV.gevaar.acties (той самий об'єкт, що читає HV.gevaar.vind),
  // перед загальними рядками; небезпечні — з текстами наслідку й ризику (статична перевірка їх читає).
  (function () {
    var G = HV.gevaar;
    if (!G || !G.acties) return;
    var nieuw = [
      { sleutel: 'zonnepanelen.begrenzen', soorten: ['zonnepanelen'], mogelijkheid: 'modus', als: function (a, v) { return v === 'begrensd'; }, niveau: 'gevaarlijk',
        naam: ['Обмежити віддачу в мережу', 'Teruglevering begrenzen'],
        gevolg: ['Що станеться: інвертор зрізатиме виробіток так, щоб у мережу йшло 0 кВт; надлишок сонця пропаде, якщо батарея й авто не візьмуть його. Пов’язано з: заощадження на платі за віддачу, але втрата частини сонця. Як повернути: «Без обмеження» — один дотик.', 'Wat er gebeurt: de omvormer knijpt de opbrengst af zodat er 0 kW naar het net gaat; overschot gaat verloren als batterij en auto het niet opnemen. Hangt samen met: je bespaart terugleverkosten maar verliest een deel van de zon. Terugdraaien: ‘Onbegrensd’ — één tik.'],
        risico: ['Що може статися: сонце зрізатиметься навіть тоді, коли віддача вигідна. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de zon wordt afgeknepen ook als terugleveren loont. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
      { sleutel: 'zonnepanelen.vrij', soorten: ['zonnepanelen'], mogelijkheid: 'modus', niveau: 'gewoon', naam: ['Зняти обмеження віддачі', 'Begrenzing opheffen'] },
      { sleutel: 'thuisbatterij.diep', soorten: ['thuisbatterij'], mogelijkheid: 'modus', als: function (a, v) { return v === 'diep'; }, niveau: 'gevaarlijk',
        naam: ['Розрядити нижче резерву', 'Onder de reserve ontladen'],
        gevolg: ['Що станеться: батарея віддаватиме енергію в дім нижче резерву, до 12 %. Пов’язано з: за відключення електрики запасу на холодильник і маршрутизатор не лишиться. Як повернути: оберіть «Розумно» — резерв знову діє.', 'Wat er gebeurt: de batterij levert aan het huis tot onder de reserve, tot 12 %. Hangt samen met: bij een stroomstoring is er geen buffer meer voor koelkast en router. Terugdraaien: kies ‘Slim’ — de reserve geldt weer.'],
        risico: ['Що може статися: дім лишиться без запасу саме тоді, коли зникне електрика. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: het huis heeft geen buffer meer precies als de stroom uitvalt. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
      { sleutel: 'thuisbatterij.bron', soorten: ['thuisbatterij'], mogelijkheid: 'bron', niveau: 'gevoelig', naam: ['Спосіб розумного режиму батареї', 'Werkwijze van de slimme batterij'] },
      { sleutel: 'thuisbatterij.reserve', soorten: ['thuisbatterij'], mogelijkheid: 'reserve', niveau: 'gewoon', naam: ['Резерв батареї', 'Reserve van de batterij'] },
      { sleutel: 'laadpaal.modus', soorten: ['laadpaal'], mogelijkheid: 'modus', niveau: 'gevoelig', naam: ['Режим зарядки', 'Laadstand'] },
      { sleutel: 'laadpaal.bron', soorten: ['laadpaal'], mogelijkheid: 'bron', niveau: 'gevoelig', naam: ['Спосіб розумної зарядки', 'Werkwijze van slim laden'] },
      { sleutel: 'laadpaal.doel', soorten: ['laadpaal'], mogelijkheid: 'laaddoel', niveau: 'gewoon', naam: ['Ціль зарядки', 'Laaddoel'] },
      { sleutel: 'laadpaal.vertrek', soorten: ['laadpaal'], mogelijkheid: 'vertrek', niveau: 'gewoon', naam: ['Час виїзду', 'Vertrektijd'] }
    ];
    var sleutels = G.acties.map(function (x) { return x.sleutel; });
    var plek = sleutels.indexOf('thuisbatterij.modus');
    if (plek < 0) plek = G.acties.length;
    nieuw.filter(function (x) { return sleutels.indexOf(x.sleutel) < 0; }).forEach(function (x, i) { G.acties.splice(plek + i, 0, x); });
    // назви значень для Журналу й сповіщень (той самий словник, що читає HV.beschrijf для «modus» і «bron»)
    var WN = HV.waardeNaam || {};
    WN.begrensd = ['віддачу обмежено до 0 кВт', 'teruglevering begrensd tot 0 kW'];
    WN.vrij = ['без обмеження віддачі', 'teruglevering onbegrensd'];
    WN.diep = ['розряд нижче резерву', 'ontladen onder de reserve'];
    WN.goedkoop = ['дешеві години', 'goedkope uren'];
    WN.zon = ['лише сонце', 'alleen zon'];
    WN.minzon = ['мінімум і сонце', 'minimum en zon'];
    WN.nulmeter = ['нуль на лічильнику', 'nul op de meter'];
  })();

  // ───────────────────────── Kleine hulpmiddelen ─────────────────────────
  var kW = function () { return t('кВт', 'kW'); };
  var kWh = function () { return t('кВт·год', 'kWh'); };
  var isNl = function () { return HV.taal() === 'nl'; };
  /** Сума в євро зі словом «приклад» біля числа. */
  var euro = function (n, dec) { return '<span class="hv-en-euro">' + h(HV.euro(n, dec).replace(/ /g, '\u00a0')) + '<span class="hv-en-vb">' + h(t('приклад', 'voorbeeld')) + '</span></span>'; };
  /** Оцінене число: «≈» і пунктирне підкреслення. */
  var ong = function (html) { return '<span class="hv-en-ong" title="' + h(t('оцінено', 'geschat')) + '">≈ ' + html + '</span>'; };
  /** Нідерландський оригінал терміна з рахунку — лише в українському тексті, у дужках. */
  var orig = function (woord) { return isNl() ? '' : ' <span class="hv-en-orig" lang="nl">(' + h(woord) + ')</span>'; };
  var veld = function (label, html, extra) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };
  var kop = function (icoon, titel, extra, toon) { return '<header class="hv-en-kop' + (toon ? ' hv-toon-' + toon : '') + '"><h3>' + HV.icoon(icoon, { maat: 's' }) + '<span>' + h(titel) + '</span></h3>' + (extra ? '<span class="hv-en-kop__rechts">' + extra + '</span>' : '') + '</header>'; };
  var kaart = function (klas, inhoud, k) { return '<section class="hv-kaart hv-en-kaart ' + (klas || '') + '"' + (k ? ' data-k="' + h(k) + '"' : '') + '>' + inhoud + '</section>'; };
  /** Детермінований «шум» 0…1 для звітів і минулого (той самий день — ті самі числа). */
  var ruis = function (i, s) { var x = Math.sin(i * 12.9898 + (s || 1) * 78.233) * 43758.5453; return x - Math.floor(x); };
  var klem = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var uurVan = function (ms) { return ms - (((ms % UUR) + UUR) % UUR); };
  var dagVan = function (ms) { return ms - (((ms % DAG) + DAG) % DAG); };
  var tijdNaar = function (hhmm) { var p = String(hhmm || '07:30').split(':'); return Number(p[0]) * UUR + Number(p[1] || 0) * 60000; };
  var hhmm = function (ms) { return HV.tijd(((ms % DAG) + DAG) % DAG); };

  // ───────────────────────── Modellen (симулятор) ─────────────────────────
  /** Сонце за часом дому — та сама формула, що в кроці симуляції (схід 07:40, захід 16:55). */
  function zonKw(tijd, bewolking, mist) {
    var u = HV.uur(tijd), op = 7.66, onder = 16.92;
    var hoek = u > op && u < onder ? Math.sin(Math.PI * (u - op) / (onder - op)) : 0;
    return 4.2 * 0.84 * hoek * (1 - 0.82 * (bewolking == null ? 0.55 : bewolking)) * (mist ? 0.4 : 1);
  }
  /** Типовий профіль дому без авто (кВт): база, ранок, обід, вечір, насос уночі. */
  function huisKw(tijd) {
    var u = HV.uur(tijd), b = 0.24 + 0.05 * Math.sin(u * 1.7);
    if (u >= 6.5 && u < 8.5) b += 0.7;
    if (u >= 12 && u < 13) b += 0.35;
    if (u >= 17 && u < 21.5) b += 1.0 + 0.3 * Math.sin(u * 2.1);
    if (u < 6 || u >= 22) b += 0.45;
    return Math.max(0.18, b);
  }

  // ───────────────────────── Prijzen ─────────────────────────
  var BELASTING = 0.1088, OPSLAG = 0.02, BTW = 0.21, VERGOEDING = 0.06, TERUGLEVERKOSTEN = 0.03;
  var beurs = function (p) { return p / (1 + BTW) - BELASTING - OPSLAG; };
  function venster(w) { return HV.tarief.venster(w.tijd); }
  function nuIndex(w, v) { return klem(Math.floor((w.tijd - v[0].tijd) / UUR), 0, v.length - 1); }
  function kwartielen(v) {
    var s = v.map(function (x) { return x.prijs; }).sort(function (a, b) { return a - b; });
    var som = s.reduce(function (a, b) { return a + b; }, 0);
    return { q1: s[Math.floor(s.length / 4) - 1], q3: s[Math.ceil(s.length * 3 / 4)], min: s[0], max: s[s.length - 1], gem: som / s.length };
  }
  function niveau(p, q) { return p < 0 ? 'negatief' : p <= q.q1 ? 'goedkoop' : p >= q.q3 ? 'duur' : 'normaal'; }
  var NIVEAU = {
    negatief: { icoon: 'arrow-down-to-line', woord: ['від’ємна', 'negatief'], zin: ['від’ємна', 'negatief'], toon: 'net-uit' },
    goedkoop: { icoon: 'arrow-down', woord: ['дешево', 'goedkoop'], zin: ['низька', 'laag'], toon: 'ok' },
    normaal: { icoon: 'minus', woord: ['звичайно', 'normaal'], zin: ['звичайна', 'gemiddeld'], toon: null },
    duur: { icoon: 'arrow-up', woord: ['дорого', 'duur'], zin: ['висока', 'hoog'], toon: 'let-op' }
  };
  function niveauChip(p, q, k) { var n = NIVEAU[niveau(p, q)]; return o.chip({ icoon: n.icoon, toon: n.toon, tekst: HV.p(n.woord), k: k }); }
  /** Дешеві вікна: щонайменше дві поспіль години в нижній чверті цін 48 год. */
  function goedkopeVensters(v, q) {
    var uit = [], begin = -1;
    for (var i = 0; i <= v.length; i++) {
      var goed = i < v.length && v[i].prijs <= q.q1;
      if (goed && begin < 0) begin = i;
      if (!goed && begin >= 0) {
        if (i - begin >= 2) uit.push({ van: begin, tot: i, min: Math.min.apply(null, v.slice(begin, i).map(function (x) { return x.prijs; })), gem: v.slice(begin, i).reduce(function (s, x) { return s + x.prijs; }, 0) / (i - begin) });
        begin = -1;
      }
    }
    return uit;
  }
  function dagWoord(w, ms) {
    var d = Math.round((dagVan(ms) - dagVan(w.tijd)) / DAG);
    return d === 0 ? t('сьогодні', 'vandaag') : d === 1 ? t('завтра', 'morgen') : d === -1 ? t('учора', 'gisteren') : HV.datumKort(ms);
  }
  function vensterTekst(v, x) { return HV.tijd(v[x.van].tijd) + '–' + HV.tijd(v[x.van].tijd + (x.tot - x.van) * UUR); }
  function volgendVenster(w, v, q) {
    var ni = nuIndex(w, v);
    return goedkopeVensters(v, q).filter(function (x) { return x.tot > ni; })[0] || null;
  }

  // ───────────────────────── Toestand van de zone in de wereld ─────────────────────────
  // Стан Енергії, якого немає в паспорті, додається до світу під час роботи (w.enPlan) — без змін у gegevens/.
  function plan(w) { if (!w.enPlan) w.enPlan = { blokken: {} }; return w.enPlan; }
  var reserveVan = function (st) { var r = parseInt(st.reserve, 10); return isNaN(r) ? 10 : r; };
  var laadDoelVan = function (w) { var r = parseInt(w.apparaten.laadpaal.st.laaddoel, 10); return isNaN(r) ? w.voertuigen[0].doel : r; };

  // Ряд вимірів наживо (одна точка на хвилину часу дому) — для сальдо за 10 хв і графіків «виміряне».
  var reeks = [];
  var laatsteUur = null;
  function zaai(w) {
    var A = w.apparaten;
    if (A.laadpaal.st.laaddoel === undefined) A.laadpaal.st.laaddoel = w.voertuigen[0].doel + ' %';
    if (A.laadpaal.st.vertrek === undefined) A.laadpaal.st.vertrek = '07:30';
    if (A.laadpaal.st.bron === undefined) A.laadpaal.st.bron = 'goedkoop';
    if (A.thuisbatterij.st.bron === undefined) A.thuisbatterij.st.bron = 'zon';
    if (A.thuisbatterij.st.reserve === undefined) A.thuisbatterij.st.reserve = '10 %';
    if (A.zonnepanelen.st.modus === undefined) A.zonnepanelen.st.modus = 'vrij';
    if (A.boiler.st.modus === undefined) A.boiler.st.modus = 'slim';
  }
  /** Межі, яких крок симуляції ядра не знає: резерв батареї, обмеження віддачі інвертора; ціль зарядки → авто. */
  function begrens(w) {
    var A = w.apparaten, e = w.energie, tb = A.thuisbatterij.st, zp = A.zonnepanelen.st;
    var ld = laadDoelVan(w);
    if (w.voertuigen[0].doel !== ld) w.voertuigen[0].doel = ld;
    if (w.gegevens !== 'live') return;
    if (tb.modus !== 'diep' && tb.vermogen < 0 && tb.lading <= reserveVan(tb)) { e.net += -tb.vermogen; e.batterij = 0; tb.vermogen = 0; }
    if (zp.modus === 'begrensd' && e.net < -0.001) {
      var weg = Math.min(-e.net, e.zon);
      e.zon -= weg; e.net += weg; zp.vermogen = Math.round(e.zon * 100) / 100;
    }
  }
  /** Оптимізатор зарядки: на межі години діє за планом — лише якщо дозвіл не «Вимкнено» (ворота HV.doe вирішують решту). */
  function optimaliseer(w) {
    var uur = Math.floor(w.tijd / UUR);
    if (uur === laatsteUur) return;
    var eerste = laatsteUur === null || Math.abs(uur - laatsteUur) > 48;
    laatsteUur = uur;
    if (eerste || w.gegevens !== 'live') return;
    var lp = w.apparaten.laadpaal;
    if (lp.st.modus !== 'slim' || !lp.st.aangesloten || lp.wacht) return;
    if (HV.gevaar.stand('optimalisatie', 'laadpaal.laden') === 'uit') return;
    var li = laadInfo(w), binnen = li.plan && w.tijd >= li.plan.van && w.tijd < li.plan.tot;
    if (binnen && !lp.st.laadt && !w.verzoeken.some(function (x) { return x.stand === 'wacht' && x.doel === 'laadpaal'; })) {
      setTimeout(function () { HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, door: OPT, waarom: ['дешеве вікно плану зарядки', 'goedkoop venster van het laadplan'] }); }, 0);
    } else if (!binnen && lp.st.laadt && lp.maker && lp.maker.soort === 'optimalisatie') {
      setTimeout(function () { HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: false, door: OPT, waarom: ['вікно плану зарядки минуло', 'venster van het laadplan voorbij'] }); }, 0);
    }
  }
  if (HV.staat && HV.staat.abonneer) {
    HV.staat.abonneer(function (w) {
      if (!w || !w.apparaten || !w.apparaten.laadpaal) return;
      zaai(w);
      begrens(w);
      var laatste = reeks[reeks.length - 1];
      if (laatste && (w.tijd < laatste.t || w.tijd - laatste.t > 6 * UUR)) reeks = [];
      laatste = reeks[reeks.length - 1];
      if (!laatste || w.tijd - laatste.t >= 60000) {
        reeks.push({ t: w.tijd, net: w.energie.net, zon: w.energie.zon, huis: w.energie.huis + w.energie.auto, bat: w.energie.batterij });
        if (reeks.length > 1500) reeks.shift();
      }
      optimaliseer(w);
    });
  }

  // ───────────────────────── Laadplan (hv-laadplan) ─────────────────────────
  /** Розрахунок плану зарядки: потрібна енергія, найдешевше вікно до виїзду, ціна втручання «Зарядити зараз». */
  function laadInfo(w) {
    var lp = w.apparaten.laadpaal, st = lp.st, ev = w.voertuigen[0];
    var doel = laadDoelVan(w), bron = st.bron || 'goedkoop', vertrek = st.vertrek || '07:30';
    var nodig = Math.max(0, (doel - ev.lading) / 100 * ev.capaciteit);
    var P = 7.4, uren = Math.ceil(nodig / P - 1e-9);
    var vertrekT = dagVan(w.tijd) + tijdNaar(vertrek);
    if (vertrekT <= w.tijd) vertrekT += DAG;
    var nuUur = uurVan(w.tijd);
    var kosten = function (van, vermogen) {
      var rest = nodig, som = 0, k = 0;
      while (rest > 0.0001 && k < 30) { var deel = Math.min(rest, vermogen); som += deel * HV.tarief.prijs(van + k * UUR); rest -= deel; k++; }
      return som;
    };
    var info = { doel: doel, bron: bron, vertrek: vertrek, vertrekT: vertrekT, nodig: nodig, uren: uren, plan: null, kostenNu: 0, meer: 0, telaat: false, ev: ev, st: st };
    if (nodig <= 0.01) return info;
    var kandidaten = [];
    if (bron === 'zon') {
      // лише сонце: години 10–15 найближчого світлового дня
      for (var d = 0; d < 3 && !kandidaten.length; d++) {
        var s = dagVan(w.tijd) + d * DAG + 10 * UUR;
        if (s + uren * UUR > w.tijd && uren <= 5) kandidaten.push({ van: Math.max(s, nuUur), tot: Math.max(s, nuUur) + uren * UUR, kosten: nodig * VERGOEDING });
      }
    } else {
      for (var v = nuUur; v + uren * UUR <= vertrekT + 1; v += UUR) kandidaten.push({ van: v, tot: v + uren * UUR, kosten: kosten(v, P) });
      if (bron === 'minzon' && kandidaten.length) kandidaten.forEach(function (x) { var u = HV.uur(x.van); if (u >= 10 && u < 15) x.kosten *= 0.4; });
    }
    if (!kandidaten.length) kandidaten.push({ van: nuUur, tot: nuUur + uren * UUR, kosten: kosten(nuUur, P) });
    var beste = kandidaten.reduce(function (a, b) { return b.kosten < a.kosten - 1e-9 ? b : a; });
    info.plan = beste;
    info.telaat = beste.tot > vertrekT;
    info.kostenNu = kosten(nuUur, 11);
    info.meer = Math.max(0, info.kostenNu - beste.kosten);
    info.duurNu = nodig / 11 * 60;
    return info;
  }

  function laadStaat(w, li) {
    var st = li.st;
    if (st.laadt) return { woord: t('заряджається', 'laadt'), icoon: 'battery-charging', toon: 'auto' };
    if (!st.aangesloten) return { woord: t('кабель не під’єднано', 'kabel niet aangesloten'), icoon: 'unplug', toon: null };
    if (li.nodig <= 0.01) return { woord: t('готово', 'klaar'), icoon: 'circle-check-big', toon: 'ok' };
    if (st.modus === 'pauze') return { woord: t('пауза', 'pauze'), icoon: 'pause', toon: null };
    return { woord: t('план', 'gepland'), icoon: 'calendar-clock', toon: null };
  }

  /**
   * hv-laadplan: режим роботи, спосіб, ціль, виїзд, вікно над малою стрічкою цін, ціна втручання, дозвіл оптимізатора.
   * opties: { compact } — для вбудовування (Гараж): без сесій і без пояснення меж.
   */
  o.laadplan = function (ctx, opties) {
    var w = ctx.staat, A = w.apparaten, lp = A.laadpaal, st = lp.st, li = laadInfo(w), ev = li.ev;
    var stand = HV.gevaar.stand('optimalisatie', 'laadpaal.laden');
    var schaduw = !!HV.ui.lees('en-schaduw', false);
    var ls = laadStaat(w, li);
    var modus = HV.gewenst(lp, 'modus');
    var toonPlan = li.plan && (stand !== 'uit' || schaduw);
    // мала стрічка цін від поточної години до виїзду + 2 год
    var van = uurVan(w.tijd), tot = Math.max(li.vertrekT + 2 * UUR, li.plan ? li.plan.tot + UUR : 0, van + 12 * UUR);
    var uren = [];
    for (var x = van; x < tot && uren.length < 30; x += UUR) uren.push({ tijd: x, prijs: HV.tarief.prijs(x) });
    var strook = prijsStrook(ctx, { id: 'laadplan', v: uren, hoogte: 96, klein: true, band: toonPlan ? { van: li.plan.van, tot: li.plan.tot, label: stand === 'altijd' ? t('план', 'plan') : stand === 'vragen' ? t('план · чекає схвалення', 'plan · wacht op goedkeuring') : t('зробив би', 'zou doen'), schaduw: stand === 'uit' } : null, vertrek: li.vertrekT });

    var kopRij = '<div class="hv-en-laadkop">' + o.chip({ icoon: ls.icoon, toon: ls.toon, tekst: ls.woord, k: 'lp-staat' }) +
      '<span class="hv-en-laadkop__ev">' + HV.icoon('car', { maat: 's' }) + HV.maat(Math.round(ev.lading), '%') + ' <span class="hv-naar">→</span> ' + HV.maat(li.doel, '%') + '</span></div>';

    var modusVeld = veld(t('Режим роботи', 'Werkmodus'), o.werkmodus({ waarde: modus, actie: 'doe', gegevens: { doel: 'laadpaal', mogelijkheid: 'modus' }, k: 'lp-modus' }),
      ' ' + o.gevolg(t('Що станеться: «Розумно» — авто заряджатиметься в найдешевші години до виїзду; «Швидко» — одразу на 11 кВт; «Пауза» — зарядка стоїть. Пов’язано з: план батареї зсувається, щоб не збігтися із зарядкою на одній фазі. Як повернути: оберіть інший режим — один дотик.', 'Wat er gebeurt: ‘Slim’ — de auto laadt in de goedkoopste uren vóór vertrek; ‘Snel’ — meteen op 11 kW; ‘Pauze’ — het laden staat stil. Hangt samen met: het batterijplan schuift op om niet samen te vallen met laden op dezelfde fase. Terugdraaien: kies een andere stand — één tik.'), { kop: t('Режим зарядки', 'Laadstand') }));
    var bronVeld = modus === 'slim' ? veld(t('Спосіб', 'Werkwijze'), o.segment({ label: t('Спосіб розумної зарядки', 'Werkwijze van slim laden'), waarde: HV.gewenst(lp, 'bron') || 'goedkoop', actie: 'doe', gegevens: { doel: 'laadpaal', mogelijkheid: 'bron' }, klas: 'hv-segment--rol', k: 'lp-bron', opties: [
      { id: 'goedkoop', label: t('Дешеві години', 'Goedkope uren'), icoon: 'arrow-down' }, { id: 'zon', label: t('Лише сонце', 'Alleen zon'), icoon: 'sun' }, { id: 'minzon', label: t('Мінімум і сонце', 'Minimum en zon'), icoon: 'sun-dim' }] })) : '';

    var doelVeld = veld(t('Ціль заряду', 'Laaddoel'), o.schuif({ label: t('Ціль заряду', 'Laaddoel'), waarde: li.doel, min: 20, max: 100, stap: 5, eenheid: '%', toon: 'auto', actie: 'en-laaddoel', gegevens: { doel: 'laadpaal' }, k: 'lp-doel' }));
    var vertrekVeld = veld(t('Виїзд', 'Vertrek'), '<div class="hv-en-rij2">' + o.stapper({ actie: 'en-vertrek', stap: 30, label: t('Час виїзду', 'Vertrektijd'), waarde: h(li.vertrek), k: 'lp-vertrek' }) +
      '<span class="hv-tekst hv-tekst--zacht">' + h(dagWoord(w, li.vertrekT) + ', ' + t('готово до ', 'klaar vóór ') + HV.tijd(li.vertrekT) + t(' на ', ' op ') + li.doel + ' %') + '</span></div>');

    var planRegel;
    if (li.nodig <= 0.01) planRegel = '<p class="hv-en-planregel">' + HV.icoon('circle-check-big', { maat: 's' }) + '<span>' + h(t('Ціль досягнуто — заряджати не треба.', 'Het doel is bereikt — laden is niet nodig.')) + '</span></p>';
    else if (!toonPlan) planRegel = '<p class="hv-en-planregel is-uit">' + HV.icoon('lock', { maat: 's' }) + '<span>' + h(t('Дозвіл оптимізатора «Вимкнено»: план не виконується. Увімкніть «Показувати, що зробив би», щоб побачити його.', 'Toestemming van de optimalisatie is ‘Uit’: het plan wordt niet uitgevoerd. Zet ‘Schaduwplan tonen’ aan om het te zien.')) + '</span></p>';
    else planRegel = '<p class="hv-en-planregel' + (stand === 'uit' ? ' is-schaduw' : '') + '">' + HV.icoon(li.bron === 'zon' ? 'sun' : 'calendar-clock', { maat: 's' }) + '<span><strong>' + h(dagWoord(w, li.plan.van) + ' ' + HV.tijd(li.plan.van) + '–' + HV.tijd(li.plan.tot)) + '</strong> · ' + HV.maat(li.nodig, kWh(), 1) + ' · ' + ong(euro(li.plan.kosten)) +
      (li.telaat ? ' · <span class="hv-en-let">' + HV.icoon('triangle-alert', { maat: 's' }) + h(t('до виїзду не встигне', 'niet klaar vóór vertrek')) + '</span>' : '') + '</span></p>';

    var nuKnop = st.laadt
      ? o.knop({ tekst: t('Зупинити зарядку', 'Laden stoppen'), icoon: 'square', actie: 'en-laad', gegevens: { aan: '' }, k: 'lp-stop' })
      : o.knop({ tekst: t('Зарядити зараз', 'Nu laden'), icoon: 'zap', soort: 'hoofd', actie: 'en-laad', gegevens: { aan: '1' }, uit: !st.aangesloten || li.nodig <= 0.01, k: 'lp-nu' });
    var meer = !st.laadt && li.plan && li.nodig > 0.01 ? '<span class="hv-en-meer">+ ' + euro(li.meer) + '<span class="hv-en-meer__sub">' + h(t('проти плану · ≈ ', 'tegenover het plan · ≈ ') + HV.duur(li.duurNu)) + '</span></span>' : '';

    var grens = opties && opties.compact ? '' : '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('shield-check', { maat: 's' }) + '<span>' + h(t('Межа самої станції 16 А · без зв’язку з хабом 6 А. Хаб не захищає запобіжник — це роблять автомат у щитку й межа станції.', 'Grens van de laadpaal zelf 16 A · zonder verbinding met de hub 6 A. De hub beveiligt de hoofdzekering niet — dat doen de groepenkast en de grens van de laadpaal.')) + '</span></p>';

    var dozvil = veld(t('Дозвіл оптимізатора', 'Toestemming van de optimalisatie'), o.stand({ uitvoerder: 'optimalisatie', actie: HV.gevaar.actie('laadpaal.laden'), rol: ctx.rol }) +
      '<div class="hv-filter">' + o.chip({ filter: true, gekozen: schaduw, icoon: 'eye', tekst: t('Показувати, що зробив би', 'Schaduwplan tonen'), actie: 'ui', gegevens: { naam: 'en-schaduw', waarde: schaduw ? '' : '1' }, k: 'lp-schaduw' }) +
      o.chip({ icoon: 'list', tekst: t('Показати в реєстрі', 'In register tonen'), actie: 'ga', gegevens: { naar: 'instellingen-risico' }, k: 'lp-register' }) + '</div>');

    var acties = '<div class="hv-knoppen hv-en-laadacties">' + nuKnop + meer + '</div>' +
      (li.plan && li.nodig > 0.01 && !st.laadt ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Виконати план оптимізатором', 'Plan laten uitvoeren door de optimalisatie'), icoon: 'gauge', soort: 'stil', actie: 'en-opt-laad', k: 'lp-opt' }) + '</div>' : '');

    return '<div class="hv-en-laadplan" data-k="laadplan">' + kopRij + modusVeld + bronVeld + doelVeld + vertrekVeld +
      '<div class="hv-veld"><span class="hv-veld__label">' + h(t('Вікно зарядки над цінами', 'Laadvenster boven de prijzen')) + '</span>' + strook + planRegel + '</div>' +
      dozvil + grens + acties + '</div>';
  };

  // ───────────────────────── Prijsstrook (hv-grafiek --prijs) ─────────────────────────
  /**
   * Стрічка цін: стовпчик на годину; дешеві вікна — дужка з підписом; найдорожча чверть — риска й слово «дорого»;
   * від’ємна ціна — під віссю; «зараз» — риска акценту; перехід доби — розділювач. cursor: повзунок години поверх поля.
   * p: { id, v, hoogte, klein, cursor, band:{ van, tot, label, schaduw }, vertrek }
   */
  function prijsStrook(ctx, p) {
    var w = ctx.staat, alle = venster(w), q = kwartielen(alle);
    var v = p.v || alle, n = v.length;
    var basis = HV.ui.lees('en-basis', 'vol');
    var waarde = function (x) { return basis === 'beurs' ? beurs(x.prijs) : x.prijs; };
    var ws = v.map(waarde);
    var lo = Math.min(0, Math.min.apply(null, ws)), hi = Math.max(0.05, Math.max.apply(null, ws));
    var stap = hi - lo > 0.3 ? 0.1 : 0.05;
    var min = Math.floor(lo / stap - 1e-9) * stap, max = Math.ceil(hi / stap - 1e-9) * stap;
    var Y = function (y) { return (max - y) / (max - min) * 100; };
    var nul = Y(0);
    var X = function (ms) { return (ms - v[0].tijd) / (n * UUR) * 100; };
    var gekozen = p.cursor ? klem(Number(HV.ui.lees('en-uur', nuIndex(w, alle))), 0, n - 1) : -1;
    var staven = v.map(function (x, i) {
      var y = Y(waarde(x)), top = Math.min(y, nul), hoogte = Math.max(0.9, Math.abs(y - nul));
      var niv = niveau(x.prijs, q), verleden = x.tijd + UUR <= w.tijd, nu = w.tijd >= x.tijd && w.tijd < x.tijd + UUR;
      return '<span class="hv-en-staaf is-' + niv + (verleden ? ' is-verleden' : '') + (nu ? ' is-nu' : '') + (i === gekozen ? ' is-gekozen' : '') + '" style="left:' + (i / n * 100).toFixed(3) + '%;width:' + (100 / n).toFixed(3) + '%;top:' + top.toFixed(2) + '%;height:' + hoogte.toFixed(2) + '%"><i></i></span>';
    }).join('');
    // дужки дешевих вікон
    var vensters = goedkopeVensters(v, q).map(function (x) {
      return '<span class="hv-en-venster" style="left:' + (x.van / n * 100).toFixed(2) + '%;width:' + ((x.tot - x.van) / n * 100).toFixed(2) + '%"><span class="hv-en-venster__lang">' + h(vensterTekst(v, x)) + '</span><span class="hv-en-venster__kort">' + h(HV.tijd(v[x.van].tijd).slice(0, 2) + '–' + HV.tijd(v[x.van].tijd + (x.tot - x.van) * UUR).slice(0, 2)) + '</span></span>';
    }).join('');
    var band = p.band ? '<span class="hv-en-band' + (p.band.schaduw ? ' is-schaduw' : '') + '" style="left:' + klem(X(p.band.van), 0, 100).toFixed(2) + '%;width:' + Math.max(0.5, klem(X(p.band.tot), 0, 100) - klem(X(p.band.van), 0, 100)).toFixed(2) + '%"><span>' + h(p.band.label) + '</span></span>' : '';
    var vertrek = p.vertrek && X(p.vertrek) > 0 && X(p.vertrek) < 100 ? '<span class="hv-en-vertrek" style="left:' + X(p.vertrek).toFixed(2) + '%">' + HV.icoon('car', { maat: 'maker' }) + '<span>' + HV.tijd(p.vertrek) + '</span></span>' : '';
    var dagen = v.map(function (x, i) { return i > 0 && (x.tijd % DAG) === 0 ? '<span class="hv-en-dagscheiding" style="left:' + (i / n * 100).toFixed(2) + '%"><span>' + h(dagWoord(w, x.tijd)) + '</span></span>' : ''; }).join('');
    var elke = p.klein ? (n > 16 ? 6 : 3) : 6;
    var xLabels = v.map(function (x, i) { return i % elke === 0 ? '<span class="hv-grafiek__x' + (i === 0 ? ' is-begin' : '') + (i % (elke * 2) ? ' is-tussen' : '') + '" style="left:' + (i / n * 100).toFixed(2) + '%">' + HV.tijd(x.tijd) + '</span>' : ''; }).join('');
    var tikken = [];
    for (var y0 = min; y0 <= max + 1e-9; y0 += stap) tikken.push(Math.round(y0 * 100) / 100);
    var yLabels = tikken.map(function (y1) { return '<span class="hv-grafiek__y" style="top:' + Y(y1).toFixed(2) + '%">' + HV.getal(y1, 2) + '</span>'; }).join('');
    var rooster = tikken.map(function (y1) { return '<span class="hv-grafiek__streep' + (Math.abs(y1) < 1e-9 ? ' is-nul' : '') + '" style="top:' + Y(y1).toFixed(2) + '%"></span>'; }).join('');
    var nuLijn = X(w.tijd) >= 0 && X(w.tijd) <= 100 ? '<span class="hv-grafiek__nu" style="left:' + X(w.tijd).toFixed(2) + '%"><span>' + h(t('зараз', 'nu')) + '</span></span>' : '';
    var cursor = '';
    if (p.cursor) {
      var d = gekozen / (n - 1) * 100;
      cursor = '<div class="hv-en-cursorbaan" style="left:' + (50 / n).toFixed(3) + '%;right:' + (50 / n).toFixed(3) + '%" role="slider" tabindex="0" aria-label="' + h(t('Година на стрічці цін', 'Uur op de prijsstrook')) + '" aria-valuemin="0" aria-valuemax="' + (n - 1) + '" aria-valuenow="' + gekozen + '" aria-valuetext="' + h(cursorTekst(w, v, gekozen, true)) + '" data-schuif="en-uur" data-min="0" data-max="' + (n - 1) + '" data-stap="1" data-eenheid="" data-decimalen="0">' +
        '<span class="hv-schuif__vulling" style="width:' + d.toFixed(2) + '%"></span><span class="hv-schuif__knop hv-en-cursor__lijn" style="left:' + d.toFixed(2) + '%"></span></div>';
    }
    var samenvatting = t('Ціна за годинами з податками; від’ємна ціна стоїть під віссю. Дужка — дешеве вікно, риска над стовпчиком — найдорожча чверть.', 'Prijs per uur met belastingen; een negatieve prijs staat onder de as. Een haak is een goedkoop venster, een streepje boven de kolom het duurste kwart.');
    var tabel = HV.tabel([t('Година', 'Uur'), t('€ за кВт·год', '€ per kWh'), t('Рівень', 'Niveau')], v.map(function (x) { return [dagWoord(w, x.tijd) + ' ' + HV.tijd(x.tijd), HV.getal(waarde(x), 3), h(HV.p(NIVEAU[niveau(x.prijs, q)].woord))]; }));
    var alsTabel = !!HV.grafiek.open['en-' + p.id];
    var veldHtml = '<div class="hv-en-prijs' + (p.klein ? ' is-klein' : '') + (p.band ? ' heeft-band' : '') + (p.cursor ? ' heeft-cursor' : '') + '" style="--hoogte:' + (p.hoogte || 180) + 'px">' +
      '<div class="hv-grafiek__as">' + yLabels + '</div><div class="hv-en-prijs__doek" role="img" aria-label="' + h(samenvatting) + '">' + rooster + vensters + band + staven + dagen + nuLijn + vertrek + '<div class="hv-grafiek__xas">' + xLabels + '</div>' + cursor + '</div></div>';
    return '<figure class="hv-grafiek hv-en-prijsfig" data-k="en-prijs-' + h(p.id) + '">' + (alsTabel ? tabel : veldHtml) +
      (p.klein ? '' : '<figcaption class="hv-grafiek__zin">' + h(samenvatting) + (basis === 'beurs' ? ' ' + h(t('Показано біржову ціну без податків.', 'Getoond: de beursprijs zonder belastingen.')) : '') + '</figcaption>') +
      '<button type="button" class="hv-link hv-grafiek__wissel" data-actie="grafiek-tabel" data-grafiek="en-' + h(p.id) + '" aria-pressed="' + (alsTabel ? 'true' : 'false') + '">' + h(alsTabel ? t('Показати графіком', 'Als grafiek tonen') : t('Показати як таблицю', 'Als tabel tonen')) + '</button></figure>';
  }
  function cursorTekst(w, v, i, kaal) {
    var x = v[i], q = kwartielen(venster(w)), n = NIVEAU[niveau(x.prijs, q)];
    var tekst = dagWoord(w, x.tijd) + ' ' + HV.tijd(x.tijd) + '–' + HV.tijd(x.tijd + UUR) + ' · ' + HV.euro(x.prijs) + ' · ' + HV.p(n.woord);
    if (kaal) return tekst;
    return '<span class="hv-en-cursor__tijd">' + h(dagWoord(w, x.tijd) + ' ' + HV.tijd(x.tijd) + '–' + HV.tijd(x.tijd + UUR)) + '</span><span class="hv-en-cursor__prijs">' + h(HV.euro(x.prijs)) + '</span>' + o.chip({ icoon: n.icoon, toon: n.toon, tekst: HV.p(n.woord) });
  }

  // ───────────────────────── Stromen (hv-grafiek --stroom) ─────────────────────────
  function stromen(w) {
    var e = w.energie, A = w.apparaten;
    var wp = Math.max(0, (A.warmtepomp.st.vermogen || 0) / 1000), huis = Math.max(0, e.huis);
    return {
      zon: Math.max(0, e.zon), netIn: Math.max(0, e.net), netUit: Math.max(0, -e.net), batUit: Math.max(0, -e.batterij), batIn: Math.max(0, e.batterij),
      auto: Math.max(0, e.auto), wp: Math.min(wp, huis), rest: Math.max(0, huis - wp), totaal: huis + Math.max(0, e.auto), net: e.net, bat: e.batterij
    };
  }
  var dikte = function (kw) { return kw < 0.05 ? 0 : kw < 0.5 ? 2 : kw < 1.5 ? 3.5 : kw < 4 ? 5 : 7; };
  function stroomKnopen(w, s) {
    var A = w.apparaten, tb = A.thuisbatterij.st;
    return [
      { id: 'zon', kant: 'l', y: 17, icoon: 'sun', toon: 'zon', naam: t('Сонце', 'Zon'), kw: s.zon, woord: s.zon > 0.05 ? t('виробляє', 'wekt op') : t('спить', 'rust'), blad: 'apparaat:zonnepanelen', terug: false },
      { id: 'net', kant: 'l', y: 50, icoon: 'utility-pole', toon: s.netUit > 0.05 ? 'net-uit' : 'net-in', naam: t('Мережа', 'Net'), kw: s.netIn > 0.05 ? s.netIn : s.netUit, woord: s.netIn > 0.05 ? t('беремо', 'afname') : s.netUit > 0.05 ? t('віддаємо', 'teruglevering') : t('у нулі', 'op nul'), blad: 'apparaat:p1meter', terug: s.netUit > 0.05 },
      { id: 'batterij', kant: 'l', y: 83, icoon: s.batIn > 0.05 ? 'battery-charging' : 'battery-medium', toon: 'batterij', naam: t('Батарея', 'Batterij') + ' ' + Math.round(tb.lading) + ' %', kw: s.batIn > 0.05 ? s.batIn : s.batUit, woord: s.batIn > 0.05 ? t('заряджається', 'laadt') : s.batUit > 0.05 ? t('віддає', 'levert') : t('чекає', 'stand-by'), blad: 'apparaat:thuisbatterij', terug: s.batIn > 0.05 },
      { id: 'auto', kant: 'r', y: 17, icoon: 'car', toon: 'auto', naam: t('Авто', 'Auto'), kw: s.auto, woord: s.auto > 0.05 ? t('заряджається', 'laadt') : t('не заряджається', 'laadt niet'), blad: 'laadplan:oprit' },
      { id: 'warmtepomp', kant: 'r', y: 50, icoon: 'heater', toon: 'warm', naam: t('Тепловий насос', 'Warmtepomp'), kw: s.wp, woord: A.warmtepomp.st.verwarmt ? t('гріє', 'verwarmt') : t('чекає', 'stand-by'), blad: 'apparaat:warmtepomp' },
      { id: 'rest', kant: 'r', y: 83, icoon: 'house', toon: 'neutraal', naam: t('Решта дому', 'Rest van het huis'), kw: s.rest, woord: t('світло, техніка', 'licht, apparaten'), blad: 'fasen' }
    ];
  }
  function knoopHtml(k, oud) {
    return '<button type="button" class="hv-en-knoop hv-en-knoop--' + k.kant + ' hv-toon-' + k.toon + (k.kw < 0.05 ? ' is-stil' : '') + (oud ? ' is-oud' : '') + '" style="top:' + k.y + '%" data-actie="blad" data-blad="' + h(k.blad) + '" data-k="knoop-' + k.id + '" aria-label="' + h(k.naam + ': ' + HV.getal(k.kw, 1) + ' ' + kW() + ', ' + k.woord) + '">' +
      '<span class="hv-en-knoop__teken">' + HV.icoon(k.icoon, { maat: 's' }) + '</span><span class="hv-en-knoop__tekst"><span class="hv-en-knoop__naam">' + h(k.naam) + '</span>' +
      '<span class="hv-en-knoop__getal">' + HV.maat(k.kw, kW(), 1) + '</span><span class="hv-en-knoop__woord">' + h(k.woord) + '</span></span></button>';
  }
  /** Потоки наживо: широко — схема «джерела → дім → споживачі», вузько — «нитка» Звідки / Куди. */
  function stroomHtml(ctx) {
    var w = ctx.staat, s = stromen(w), knopen = stroomKnopen(w, s), oud = w.gegevens !== 'live';
    var W = 640, H = 300;
    var paden = knopen.map(function (k) {
      var y = k.y * H / 100, links = k.kant === 'l';
      var van = links ? [178, y] : [372, H / 2], naar = links ? [268, H / 2] : [462, y];
      var mx = (van[0] + naar[0]) / 2;
      var d = 'M' + van[0] + ' ' + van[1].toFixed(1) + 'C' + mx + ' ' + van[1].toFixed(1) + ' ' + mx + ' ' + naar[1].toFixed(1) + ' ' + naar[0] + ' ' + naar[1].toFixed(1);
      var dk = dikte(k.kw);
      if (!dk) return '<path class="hv-en-stroom__stil" d="' + d + '"/>';
      return '<g class="hv-toon-' + k.toon + '"><path class="hv-en-stroom__spoor" d="' + d + '" style="stroke-width:' + dk + 'px"/>' +
        (oud ? '' : '<path class="hv-en-stroom__vloei' + (k.terug ? ' is-terug' : '') + '" d="' + d + '" style="stroke-width:' + Math.max(1.5, dk - 1.5) + 'px"/>') + '</g>';
    }).join('');
    var huis = '<button type="button" class="hv-en-knoop hv-en-knoop--huis' + (oud ? ' is-oud' : '') + '" data-actie="blad" data-blad="fasen" data-k="knoop-huis" aria-label="' + h(t('Дім споживає ', 'Het huis gebruikt ') + HV.getal(s.totaal, 1) + ' ' + kW()) + '">' +
      '<span class="hv-en-knoop__teken">' + HV.icoon('house', { maat: 's' }) + '</span><span class="hv-en-knoop__naam">' + h(t('Дім', 'Huis')) + '</span><span class="hv-en-knoop__getal">' + HV.maat(s.totaal, kW(), 1) + '</span></button>';
    var schema = '<div class="hv-en-schema" style="--verhouding:' + (W / H).toFixed(4) + '"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + paden + '</svg>' + knopen.map(function (k) { return knoopHtml(k, oud); }).join('') + huis + '</div>';

    // нитка: дві смуги з тими самими тонами, знизу — рядки зі словом
    var bronnen = [['zon', s.zon], ['net', s.netIn], ['batterij', s.batUit]].filter(function (x) { return x[1] > 0.02; });
    var doelen = [['rest', s.rest], ['warmtepomp', s.wp], ['auto', s.auto], ['batterij', s.batIn], ['net', s.netUit]].filter(function (x) { return x[1] > 0.02; });
    var byId = {}; knopen.forEach(function (k) { byId[k.id] = k; });
    var toonVan = function (id, uit) { return id === 'net' ? (uit ? 'net-uit' : 'net-in') : byId[id].toon; };
    var naamVan = function (id, uit) { return id === 'net' ? (uit ? t('У мережу', 'Naar het net') : t('З мережі', 'Van het net')) : id === 'batterij' ? (uit ? t('У батарею', 'In de batterij') : t('З батареї', 'Uit de batterij')) : byId[id].naam; };
    var balk = function (lijst, uit) {
      var som = lijst.reduce(function (a, x) { return a + x[1]; }, 0) || 1;
      return '<span class="hv-en-draad__balk' + (oud ? ' is-oud' : '') + '">' + lijst.map(function (x) { return '<i class="hv-toon-' + toonVan(x[0], uit) + '" style="flex-grow:' + (x[1] / som).toFixed(4) + '"></i>'; }).join('') + '</span>';
    };
    var rijen = function (lijst, uit) {
      return lijst.map(function (x) {
        return '<button type="button" class="hv-en-draad__rij hv-toon-' + toonVan(x[0], uit) + '" data-actie="blad" data-blad="' + h(byId[x[0]].blad) + '" data-k="draad-' + (uit ? 'u' : 'b') + x[0] + '">' + HV.icoon(byId[x[0]].icoon, { maat: 's' }) + '<span>' + h(naamVan(x[0], uit)) + '</span><strong>' + HV.maat(x[1], kW(), 1) + '</strong></button>';
      }).join('');
    };
    var draad = '<div class="hv-en-draad">' +
      '<div class="hv-en-draad__groep"><p class="hv-en-draad__kop">' + h(t('Звідки', 'Waar vandaan')) + '</p>' + balk(bronnen, false) + '<div class="hv-en-draad__rijen">' + rijen(bronnen, false) + '</div></div>' +
      '<div class="hv-en-draad__groep"><p class="hv-en-draad__kop">' + h(t('Куди', 'Waarheen')) + '</p>' + balk(doelen, true) + '<div class="hv-en-draad__rijen">' + rijen(doelen, true) + '</div></div></div>';
    return '<div class="hv-en-stroom" data-k="en-stroom">' + schema + draad + '</div>';
  }

  // ───────────────────────── Saldo, boog, fasen ─────────────────────────
  /** Дуга 270° (hv-ring): deel 0…1; schaduw — прогноз; streep — зарубка (бюджет). */
  function boog(p) {
    var R = 42, C = 50, begin = 135, span = 270;
    var punt = function (f) { var a = (begin + span * f) * Math.PI / 180; return (C + R * Math.cos(a)).toFixed(2) + ' ' + (C + R * Math.sin(a)).toFixed(2); };
    var pad = function (f) { f = klem(f, 0.001, 0.999); return 'M' + punt(0) + 'A' + R + ' ' + R + ' 0 ' + (span * f > 180 ? 1 : 0) + ' 1 ' + punt(f); };
    var zarubka = p.streep != null ? (function () { var a = (begin + span * klem(p.streep, 0, 1)) * Math.PI / 180; return '<line class="hv-en-boog__streep" x1="' + (C + 34 * Math.cos(a)).toFixed(2) + '" y1="' + (C + 34 * Math.sin(a)).toFixed(2) + '" x2="' + (C + 50 * Math.cos(a)).toFixed(2) + '" y2="' + (C + 50 * Math.sin(a)).toFixed(2) + '"/>'; })() : '';
    return '<div class="hv-en-boog hv-toon-' + (p.toon || 'zon') + (p.klein ? ' is-klein' : '') + '" role="img" aria-label="' + h(p.aria || '') + '"><svg viewBox="0 0 100 100" aria-hidden="true"><path class="hv-en-boog__baan" d="' + pad(0.999) + '"/>' +
      (p.schaduw ? '<path class="hv-en-boog__schaduw" d="' + pad(Math.min(0.999, p.schaduw)) + '"/>' : '') +
      (p.deel > 0.004 ? '<path class="hv-en-boog__vulling" d="' + pad(Math.min(0.999, p.deel)) + '"/>' : '') + zarubka + '</svg>' +
      '<div class="hv-en-boog__midden"><span class="hv-en-boog__getal">' + p.midden + '</span></div><span class="hv-en-boog__label">' + h(p.label) + '</span></div>';
  }

  function saldoHtml(ctx) {
    var w = ctx.staat, e = w.energie, s = stromen(w);
    var neemt = e.net >= 0.05, levert = e.net <= -0.05;
    var eigen = s.totaal > 0.01 ? klem((s.zon + s.batUit - s.netUit) / (s.totaal + s.batIn), 0, 1) : 0;
    // ряд за 10 хв: виміряне з потоку; чого ще немає — оцінка з моделі, пунктиром
    var van = w.tijd - 10 * 60000;
    var gemeten = reeks.filter(function (x) { return x.t >= van; }).map(function (x) { return [x.t, x.net]; });
    var reeksen = [];
    var eersteGemeten = gemeten.length ? gemeten[0][0] : w.tijd;
    if (eersteGemeten - van > 90000) {
      var schat = [];
      for (var x = van; x <= eersteGemeten; x += 60000) schat.push([x, huisKw(x) + e.auto - zonKw(x, w.weer.bewolking, w.weer.mist) + e.batterij]);
      if (schat.length < 2) schat.push([eersteGemeten, e.net]);
      reeksen.push({ naam: t('Оцінка', 'Schatting'), toon: 'neutraal', geschat: true, punten: schat });
    }
    if (gemeten.length >= 2) reeksen.push({ naam: t('Сальдо', 'Saldo'), toon: e.net >= 0 ? 'net-in' : 'net-uit', streep: '', punten: gemeten });
    if (!reeksen.length) reeksen.push({ naam: t('Сальдо', 'Saldo'), toon: 'net-in', punten: [[van, e.net], [w.tijd, e.net]] });
    var lijn = HV.grafiek.lijn({ id: 'en-saldo10', titel: t('Сальдо за 10 хв', 'Saldo, 10 min'), eenheid: kW(), hoogte: 96, x: { min: van, max: w.tijd, tikken: [{ x: van, label: HV.tijd(van) }, { x: w.tijd, label: HV.tijd(w.tijd) }], format: HV.tijd },
      reeksen: reeksen, samenvatting: t('Вище нуля — беремо з мережі, нижче — віддаємо. Пунктир — оцінка, поки потік ще не дав вимірів.', 'Boven nul nemen we af, onder nul leveren we terug. Gestippeld is een schatting zolang de stroom nog geen metingen gaf.') });
    var woord = neemt ? t('беремо', 'afname') : levert ? t('віддаємо', 'teruglevering') : t('у нулі', 'op nul');
    return kaart('hv-en-saldo hv-en-o3', kop('arrow-left-right', t('Сальдо', 'Saldo'), o.knop({ tekst: t('Лічильник', 'Meter'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:p1meter' } })) +
      '<div class="hv-en-saldo__rij">' + boog({ deel: eigen, toon: 'zon', midden: HV.maat(Math.round(eigen * 100), '%'), label: t('власна енергія', 'eigen energie'), aria: t('Частка власної енергії зараз: ', 'Aandeel eigen energie nu: ') + Math.round(eigen * 100) + ' %' }) +
      '<div class="hv-en-saldo__getal hv-toon-' + (levert ? 'net-uit' : 'net-in') + '"><span class="hv-en-saldo__woord">' + HV.icoon(levert ? 'arrow-up-right' : neemt ? 'arrow-down-left' : 'minus', { maat: 's' }) + h(woord) + '</span>' +
      '<span class="hv-en-saldo__waarde">' + HV.maat(Math.abs(e.net), kW(), 2) + '</span>' + o.stempel({ waarde: h(t('P1-лічильник', 'P1-meter')), leeftijd: HV.kijk.leeftijd(w.apparaten.p1meter) }) + '</div></div>' + lijn, 'en-saldo');
  }

  var MAX_A = 25, DOEL_A = 20;
  function fasenHtml(w, groot) {
    var f = (w.apparaten.p1meter.st.fasen || [0, 0, 0]);
    var amp = f.map(function (kw) { return kw * 1000 / 230; });
    var pos = function (a) { return 50 + klem(a / MAX_A, -1, 1) * 50; };
    var rijen = amp.map(function (a, i) {
      var breed = Math.abs(pos(a) - 50);
      var spanning = 230 + Math.round((Math.sin(w.tijd / 600000 + i * 2) * 2.4 - a * 0.06) * 10) / 10;
      return '<div class="hv-en-fase" data-k="fase-' + i + '"><span class="hv-en-fase__naam">L' + (i + 1) + '</span>' +
        '<span class="hv-en-fase__spoor"><span class="hv-en-fase__balk hv-toon-' + (a >= 0 ? 'net-in' : 'net-uit') + '" style="' + (a >= 0 ? 'left:50%' : 'right:50%') + ';width:' + breed.toFixed(2) + '%"></span>' +
        '<span class="hv-en-fase__doel" style="left:' + pos(DOEL_A) + '%"></span><span class="hv-en-fase__doel" style="left:' + pos(-DOEL_A) + '%"></span><span class="hv-en-fase__nul"></span></span>' +
        '<span class="hv-en-fase__getal">' + HV.maat(a, t('А', 'A'), 1) + (groot ? '<span class="hv-en-fase__v">' + HV.maat(spanning, t('В', 'V'), 1) + '</span>' : '') + '</span></div>';
    }).join('');
    var max = Math.max.apply(null, amp.map(Math.abs));
    return '<div class="hv-en-fasen" data-k="en-fasen">' + rijen +
      '<div class="hv-en-fase hv-en-fase--as" aria-hidden="true"><span></span><span class="hv-en-fase__as"><span>' + h(t('← віддача', '← teruglevering')) + '</span><span>' + h(t('споживання →', 'afname →')) + '</span></span><span></span></div>' +
      '<p class="hv-en-fasen__legenda"><span class="hv-en-fasen__merk is-doel"></span>' + h(t('ціль оптимізатора ' + DOEL_A + ' А', 'doel van de optimalisatie ' + DOEL_A + ' A')) + '<span class="hv-en-fasen__merk is-zekering"></span>' + h(t('запобіжник ' + MAX_A + ' А — край шкали', 'hoofdzekering ' + MAX_A + ' A — rand van de schaal')) + '</p>' +
      '<p class="hv-tekst hv-tekst--zacht">' + h(t('Найбільша фаза: ', 'Zwaarste fase: ') + HV.getal(max, 1) + ' ' + t('А з ', 'A van ') + MAX_A) + '</p></div>';
  }

  // ───────────────────────── Plan van de dag (порядок доби) ─────────────────────────
  var BAAN = {
    zon: { naam: ['Сонце', 'Zon'], icoon: 'sun', toon: 'zon' },
    batterij: { naam: ['Батарея', 'Batterij'], icoon: 'battery-medium', toon: 'batterij', sleutel: 'thuisbatterij.modus', apparaat: 'thuisbatterij' },
    auto: { naam: ['Авто', 'Auto'], icoon: 'car', toon: 'auto', sleutel: 'laadpaal.laden', apparaat: 'laadpaal' },
    water: { naam: ['Гаряча вода', 'Warm water'], icoon: 'shower-head', toon: 'warm', sleutel: 'boiler', apparaat: 'boiler' },
    techniek: { naam: ['Техніка', 'Apparaten'], icoon: 'washing-machine', toon: 'aan', sleutel: 'programma.start', apparaat: 'vaatwasser' },
    warmte: { naam: ['Тепловий насос', 'Warmtepomp'], icoon: 'heater', toon: 'warm', sleutel: 'warmtepomp.modus', apparaat: 'warmtepomp' }
  };
  function planBlokken(w) {
    var v = venster(w), d0 = v[0].tijd, li = laadInfo(w);
    var lijst = [
      { id: 'batladen1', baan: 'batterij', van: d0 + 10 * UUR, tot: d0 + 15 * UUR, wat: ['Батарея: заряд від сонця', 'Batterij: laden op zon'], kwh: 4.8 },
      { id: 'batlever1', baan: 'batterij', van: d0 + 17 * UUR, tot: d0 + 21 * UUR, wat: ['Батарея: живить дім у дорогі години', 'Batterij: voedt het huis in dure uren'], kwh: -5.2 },
      { id: 'batladen2', baan: 'batterij', van: d0 + 34 * UUR, tot: d0 + 38 * UUR, wat: ['Батарея: заряд у від’ємну ціну', 'Batterij: laden bij negatieve prijs'], kwh: 6.4 },
      { id: 'batlever2', baan: 'batterij', van: d0 + 41 * UUR, tot: d0 + 45 * UUR, wat: ['Батарея: живить дім у дорогі години', 'Batterij: voedt het huis in dure uren'], kwh: -5.6 },
      { id: 'boiler1', baan: 'water', van: d0 + 13 * UUR, tot: d0 + 14 * UUR, wat: ['Бойлер: нагрів до 55 °C', 'Boiler: opwarmen tot 55 °C'], kwh: 1.8 },
      { id: 'boiler2', baan: 'water', van: d0 + 37 * UUR, tot: d0 + 38 * UUR, wat: ['Бойлер: нагрів до 60 °C від легіонели', 'Boiler: opwarmen tot 60 °C tegen legionella'], kwh: 2.2 },
      { id: 'was', baan: 'techniek', van: d0 + 13 * UUR + 52 * 60000, tot: d0 + 15 * UUR + 27 * 60000, wat: ['Пральна машина: «Бавовна 40°»', 'Wasmachine: ‘Katoen 40°’'], kwh: 0.9, apparaat: 'wasmachine' },
      { id: 'vaat', baan: 'techniek', van: d0 + 37 * UUR, tot: d0 + 39 * UUR, wat: ['Посудомийна машина: «Економний»', 'Vaatwasser: ‘Eco’'], kwh: 0.8, apparaat: 'vaatwasser' },
      { id: 'wpvoor', baan: 'warmte', van: d0 + 26 * UUR, tot: d0 + 29 * UUR, wat: ['Тепловий насос: прогрів дому вночі', 'Warmtepomp: het huis ’s nachts voorverwarmen'], kwh: 2.1 }
    ];
    if (li.plan) lijst.push({ id: 'auto', baan: 'auto', van: li.plan.van, tot: li.plan.tot, wat: ['Авто: зарядка до ' + li.doel + ' %', 'Auto: laden tot ' + li.doel + ' %'], kwh: li.nodig });
    var eigen = plan(w).blokken;
    return lijst.map(function (b) {
      var x = eigen[b.id] || {};
      var blok = { id: b.id, baan: b.baan, van: x.van != null ? x.van : b.van, tot: x.tot != null ? x.tot : b.tot, wat: b.wat, kwh: b.kwh, apparaat: b.apparaat || BAAN[b.baan].apparaat, verschoven: x.van != null, geannuleerd: !!x.geannuleerd, goedgekeurd: !!x.goedgekeurd };
      var stand = HV.gevaar.stand('optimalisatie', BAAN[b.baan].sleutel);
      blok.status = blok.geannuleerd ? 'geannuleerd' : blok.tot <= w.tijd ? 'gedaan' : blok.van <= w.tijd ? 'bezig' : (stand === 'vragen' && !blok.goedgekeurd) ? 'wacht' : stand === 'uit' && b.baan !== 'techniek' ? 'schaduw' : 'gepland';
      var uren = 0, som = 0;
      for (var u = uurVan(blok.van); u < blok.tot; u += UUR) { som += HV.tarief.prijs(u); uren++; }
      blok.prijs = uren ? som / uren : 0;
      blok.kosten = Math.abs(blok.kwh) * blok.prijs * (blok.kwh < 0 ? -1 : 1);
      blok.stand = stand;
      return blok;
    });
  }
  var STATUS = {
    gedaan: ['виконано', 'uitgevoerd'], bezig: ['виконується', 'bezig'], gepland: ['заплановано', 'gepland'], wacht: ['очікує схвалення', 'wacht op goedkeuring'],
    geannuleerd: ['скасовано', 'geannuleerd'], schaduw: ['зробив би · дозвіл «Вимкнено»', 'zou doen · toestemming ‘Uit’']
  };
  function dagordeHtml(ctx) {
    var w = ctx.staat, v = venster(w), n = v.length, d0 = v[0].tijd, blokken = planBlokken(w);
    var X = function (ms) { return klem((ms - d0) / (n * UUR) * 100, 0, 100); };
    var banen = ['zon', 'batterij', 'auto', 'water', 'techniek', 'warmte'].map(function (id) {
      var b = BAAN[id], stukken;
      if (id === 'zon') {
        stukken = '';
        for (var i = 0; i < n; i++) {
          var mid = v[i].tijd + UUR / 2, kw = zonKw(mid, i < 24 ? w.weer.bewolking : 0.3, false);
          if (kw < 0.05) continue;
          stukken += '<span class="hv-en-baan__zon' + (v[i].tijd + UUR <= w.tijd ? '' : ' is-prognose') + '" style="left:' + X(v[i].tijd).toFixed(2) + '%;width:' + (100 / n).toFixed(2) + '%;--deel:' + Math.min(1, kw / 2.4).toFixed(3) + '"></span>';
        }
      } else {
        stukken = blokken.filter(function (x) { return x.baan === id; }).map(function (x) {
          return '<span class="hv-en-blok hv-toon-' + b.toon + ' is-' + x.status + '" style="left:' + X(x.van).toFixed(2) + '%;width:' + Math.max(0.6, X(x.tot) - X(x.van)).toFixed(2) + '%" title="' + h(HV.p(x.wat) + ' · ' + HV.p(STATUS[x.status])) + '">' + (x.status === 'wacht' ? HV.icoon('hourglass', { maat: 'maker' }) : '') + '</span>';
        }).join('');
      }
      return '<div class="hv-en-baan"><span class="hv-en-baan__naam">' + HV.icoon(b.icoon, { maat: 's' }) + '<span>' + h(HV.p(b.naam)) + '</span></span><span class="hv-en-baan__spoor">' + stukken + '</span></div>';
    }).join('');
    var nu = '<span class="hv-en-dagorde__nu" style="--x:' + (X(w.tijd) / 100).toFixed(4) + '"></span><span class="hv-en-dagorde__dag" style="--x:0.5"><span>' + h(dagWoord(w, d0 + DAG)) + '</span></span>';
    var tikken = [0, 6, 12, 18, 24, 30, 36, 42].map(function (u) { return '<span class="hv-grafiek__x' + (u === 0 ? ' is-begin' : '') + (u % 12 ? ' is-tussen' : '') + '" style="left:' + (u / n * 100).toFixed(2) + '%">' + HV.tijd(d0 + u * UUR) + '</span>'; }).join('');
    var legenda = '<ul class="hv-en-legenda"><li><span class="hv-en-blok is-gedaan hv-toon-neutraal"></span>' + h(t('виконано — суцільно', 'uitgevoerd — doorgetrokken')) + '</li><li><span class="hv-en-blok is-gepland hv-toon-neutraal"></span>' + h(t('заплановано — пунктир', 'gepland — gestippeld')) + '</li><li><span class="hv-en-blok is-wacht hv-toon-neutraal"></span>' + h(t('несхвалене — контур і «очікує»', 'niet goedgekeurd — omtrek en ‘wacht’')) + '</li></ul>';
    var rijen = blokken.filter(function (x) { return x.tot > w.tijd - 2 * UUR; }).sort(function (a, b) { return a.van - b.van; }).map(function (x) {
      var b = BAAN[x.baan];
      return o.rij({ icoon: b.icoon, naam: HV.p(x.wat), sub: dagWoord(w, x.van) + ' ' + HV.tijd(x.van) + '–' + HV.tijd(x.tot) + ' · ' + HV.p(STATUS[x.status]) + (x.verschoven ? ' · ' + t('перенесено', 'verschoven') : ''), waarde: x.kwh ? HV.maat(Math.abs(x.kwh), kWh(), 1) : '', actie: 'blad', gegevens: { blad: 'planblok:' + x.id }, k: 'planrij-' + x.id, klas: 'hv-en-planrij is-' + x.status });
    }).join('');
    return '<div class="hv-en-dagorde" data-k="en-dagorde"><div class="hv-en-dagorde__veld">' + banen + nu + '<div class="hv-en-baan hv-en-baan--as"><span></span><span class="hv-en-baan__spoor">' + tikken + '</span></div></div>' + legenda +
      '<div class="hv-rijen hv-en-planrijen">' + rijen + '</div></div>';
  }

  // ───────────────────────── Teksten van «Nu» ─────────────────────────
  function zin(ctx) {
    var w = ctx.staat, e = w.energie, v = venster(w), q = kwartielen(v), p = HV.tarief.prijs(w.tijd), nv = NIVEAU[niveau(p, q)];
    if (w.gegevens === 'geen') return t('Немає зв’язку з лічильником: показано останній знімок, потоки заштриховано.', 'Geen verbinding met de meter: je ziet de laatste momentopname, de stromen zijn gearceerd.');
    if (w.gegevens === 'verouderd') return t('Лічильник мовчить: числа з віком, потоки заштриховано.', 'De meter zwijgt: getallen met hun leeftijd, de stromen zijn gearceerd.');
    var nl = isNl();
    var eerste = e.net >= 0.05 ? (nl ? 'We nemen ' + HV.getal(e.net, 1) + ' kW van het net' : 'Беремо з мережі ' + HV.getal(e.net, 1) + ' кВт')
      : e.net <= -0.05 ? (nl ? 'We leveren ' + HV.getal(-e.net, 1) + ' kW terug' : 'Віддаємо в мережу ' + HV.getal(-e.net, 1) + ' кВт') : (nl ? 'Het net staat op nul' : 'Мережа в нулі');
    var delen = [];
    if (e.zon > 0.05) delen.push(nl ? 'de zon geeft ' + HV.getal(e.zon, 1) + ' kW' : 'сонце дає ' + HV.getal(e.zon, 1) + ' кВт');
    if (e.auto > 0.05) delen.push(nl ? 'de auto laadt op ' + HV.getal(e.auto, 1) + ' kW' : 'авто заряджається на ' + HV.getal(e.auto, 1) + ' кВт');
    if (e.batterij > 0.05) delen.push(nl ? 'de batterij laadt' : 'батарея заряджається');
    else if (e.batterij < -0.05) delen.push(nl ? 'de batterij levert ' + HV.getal(-e.batterij, 1) + ' kW' : 'батарея віддає ' + HV.getal(-e.batterij, 1) + ' кВт');
    var vv = volgendVenster(w, v, q);
    var prijs = (nl ? 'De prijs is nu ' : 'Ціна зараз ') + HV.p(nv.zin) + ' — ' + HV.euro(p) + (vv && vv.van > nuIndex(w, v) ? (nl ? '; goedkoop venster ' : '; дешеве вікно ') + (dagWoord(w, v[vv.van].tijd) + ' ' + vensterTekst(v, vv)) : vv ? (nl ? '; dit is een goedkoop venster' : '; це дешеве вікно') : '') + '.';
    return eerste + (delen.length ? ': ' + delen.join(', ') : '') + '. ' + prijs;
  }

  function prijsNuHtml(ctx) {
    var w = ctx.staat, v = venster(w), q = kwartielen(v), p = HV.tarief.prijs(w.tijd), vv = volgendVenster(w, v, q);
    var ni = nuIndex(w, v), sub = v.slice(Math.max(0, ni - 2), Math.min(v.length, ni + 22));
    return kaart('hv-en-prijsnu hv-en-o2', kop('euro', t('Ціна зараз', 'Prijs nu'), o.knop({ tekst: t('Тариф', 'Tarief'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'energie-tarief' } })) +
      '<div class="hv-en-prijsnu__rij"><span class="hv-en-prijsnu__getal">' + h(HV.euro(p)) + '<span class="hv-en-prijsnu__eenheid">' + h(t(' за кВт·год', ' per kWh')) + '</span></span>' + niveauChip(p, q, 'pn-niveau') + '<span class="hv-en-vb hv-en-vb--los">' + h(t('приклад', 'voorbeeld')) + '</span></div>' +
      prijsStrook(ctx, { id: 'nu', v: sub, hoogte: 88, klein: true }) +
      '<p class="hv-en-prijsnu__venster">' + HV.icoon('clock', { maat: 's' }) + '<span>' + (vv ? h((vv.van <= ni ? t('Зараз дешеве вікно до ', 'Nu een goedkoop venster tot ') + HV.tijd(v[vv.tot - 1].tijd + UUR) : t('Дешевше: ', 'Goedkoper: ') + dagWoord(w, v[vv.van].tijd) + ' ' + vensterTekst(v, vv)) + ' · ' + t('від ', 'vanaf ') + HV.euro(vv.min)) : h(t('Дешевих вікон до кінця доби немає.', 'Geen goedkope vensters meer vandaag.'))) + '</span></p>', 'en-prijsnu');
  }

  function vandaagHtml(ctx) {
    var w = ctx.staat, e = w.energie, v = venster(w), q = kwartielen(v);
    var netto = e.vandaagIn - e.vandaagUit;
    var kosten = netto * q.gem;
    var eigen = e.vandaagZon > 0.05 ? klem((e.vandaagZon - e.vandaagUit) / e.vandaagZon, 0, 1) : 0;
    var verbruik = e.vandaagIn + e.vandaagZon - e.vandaagUit;
    var einde = HV.huistijd(2027, 1, 1, 0, 0), dagen = Math.max(0, Math.ceil((einde - w.tijd) / DAG));
    return kaart('hv-en-vandaag hv-en-o4', kop('calendar-days', t('Сьогодні', 'Vandaag'), o.knop({ tekst: t('Звіти', 'Rapporten'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'energie-rapporten' } })) +
      '<div class="hv-en-vandaag__kosten">' + o.getal({ maat: 'l', label: t('Вартість сьогодні', 'Kosten vandaag'), waarde: euro(kosten), sub: h(t('за середньою ціною доби', 'tegen de gemiddelde dagprijs')) }) + '</div>' +
      '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Спожито', 'Verbruikt'), waarde: HV.maat(verbruik, kWh(), 1) }) +
      o.getal({ maat: 'm', label: t('З мережі', 'Van het net'), waarde: HV.maat(e.vandaagIn, kWh(), 1), toon: 'net-in' }) +
      o.getal({ maat: 'm', label: t('У мережу', 'Naar het net'), waarde: HV.maat(e.vandaagUit, kWh(), 1), toon: 'net-uit' }) +
      o.getal({ maat: 'm', label: t('Сонце', 'Zon'), waarde: HV.maat(e.vandaagZon, kWh(), 1), toon: 'zon' }) +
      o.getal({ maat: 'm', label: t('Власне спожито', 'Zelf verbruikt'), waarde: HV.maat(Math.round(eigen * 100), '%'), sub: h(t('від сонця', 'van de zon')) }) + '</div>' +
      o.rij({ icoon: 'calendar-clock', naam: t('До кінця взаємозаліку', 'Tot het einde van salderen'), sub: t('з 1 січня 2027 віддача рахується окремо', 'vanaf 1 januari 2027 telt teruglevering apart'), waarde: h(dagen + ' ' + HV.meervoud(dagen, ['день', 'дні', 'днів'], ['dag', 'dagen'])), actie: 'ga', gegevens: { naar: 'energie-rapporten' }, k: 'saldeer' }), 'en-vandaag');
  }

  function regieHtml(ctx) {
    var w = ctx.staat, A = w.apparaten;
    var rij = function (id, sleutel, modusWoord, blad) {
      var a = A[id], stand = HV.gevaar.stand('optimalisatie', sleutel);
      var wie = HV.makerZichtbaar(a) ? o.maker(a.maker) : stand === 'altijd' ? o.maker(OPT) : stand === 'vragen' ? '<span class="hv-en-regie__wie">' + o.maker(OPT, { alleenTeken: true }) + h(t('пропонує', 'stelt voor')) + '</span>' : o.maker({ soort: 'mens', naam: ['ви', 'jij'] });
      return o.rij({ icoon: HV.paspoort.soorten[a.soort].icoon, naam: HV.p(a.naam), sub: modusWoord + ' · ' + t('дозвіл: ', 'toestemming: ') + HV.p(HV.gevaar.standNamen[stand]), waarde: wie, actie: 'blad', gegevens: { blad: blad || 'apparaat:' + id }, k: 'regie-' + id });
    };
    var mw = function (a, m) { return HV.p((HV.waardeNaam || {})[HV.huidige(a, m)] || [String(HV.huidige(a, m)), String(HV.huidige(a, m))]); };
    return kaart('hv-en-regie hv-en-o6', kop('gauge', t('Хто чим керує', 'Wie stuurt wat'), o.knop({ tekst: t('Оптимізатор', 'Optimalisatie'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'optimalisatie' } })) +
      '<div class="hv-rijen">' + rij('thuisbatterij', 'thuisbatterij.modus', mw(A.thuisbatterij, 'modus')) + rij('laadpaal', 'laadpaal.laden', mw(A.laadpaal, 'modus'), 'laadplan:oprit') +
      rij('boiler', 'boiler', mw(A.boiler, 'modus')) + rij('warmtepomp', 'warmtepomp.modus', mw(A.warmtepomp, 'modus')) + rij('zonnepanelen', 'zonnepanelen.begrenzen', mw(A.zonnepanelen, 'modus')) + '</div>', 'en-regie');
  }

  function adviezen(w) {
    var v = venster(w), q = kwartielen(v), neg = v.filter(function (x) { return x.prijs < 0 && x.tijd > w.tijd; })[0];
    var lijst = [];
    if (neg) lijst.push({ id: 'neg', icoon: 'washing-machine', tekst: (isNl() ? 'Zet de vaatwasser en de was op ' : 'Поставте посудомийку й прання на ') + dagWoord(w, neg.tijd) + ' ' + HV.tijd(neg.tijd) + (isNl() ? ': de prijs is dan negatief (' : ': ціна тоді від’ємна (') + HV.euro(neg.prijs) + ').', jaar: 38, knop: t('Перенести', 'Verschuiven'), actie: 'blad', gegevens: { blad: 'planblok:vaat' } });
    lijst.push({ id: 'bat', icoon: 'battery-charging', tekst: (isNl() ? 'Laad de batterij in de nacht voor ' : 'Заряджайте батарею вночі по ') + HV.euro(q.min > 0 ? q.min : 0.18) + (isNl() ? ' en gebruik haar om 18:00 tegen ' : ' і віддавайте в дім о 18:00 замість ') + HV.euro(q.max) + '.', jaar: 96, knop: t('Батарея', 'Batterij'), actie: 'blad', gegevens: { blad: 'apparaat:thuisbatterij' } });
    lijst.push({ id: 'basis', icoon: 'plug', tekst: t('Фонове споживання ≈ 190 Вт удень і вночі. Вимкнені на ніч медіа й принтер дадуть менше.', 'Sluipverbruik ≈ 190 W dag en nacht. Media en printer ’s nachts uit geeft minder.'), jaar: 64, knop: t('Звіти', 'Rapporten'), actie: 'ga', gegevens: { naar: 'energie-rapporten' } });
    return lijst.slice(0, 3);
  }
  function adviesHtml(ctx) {
    return '<ul class="hv-en-advies" data-k="en-advies">' + adviezen(ctx.staat).map(function (a) {
      return '<li class="hv-en-advies__rij" data-k="advies-' + a.id + '"><span class="hv-en-advies__teken">' + HV.icoon(a.icoon, { maat: 's' }) + '</span><div class="hv-en-advies__tekst"><p>' + h(a.tekst) + '</p><p class="hv-en-advies__euro">' + ong(euro(a.jaar, 0)) + ' ' + h(t('на рік', 'per jaar')) + '</p></div>' +
        o.knop({ tekst: a.knop, klein: true, actie: a.actie, gegevens: a.gegevens }) + '</li>';
    }).join('') + '</ul>';
  }

  // ───────────────────────── Tab: Nu ─────────────────────────
  function tabNu(ctx) {
    var w = ctx.staat;
    var nuItems = (w.nu || []).filter(function (n) { return n.maker === 'optimalisatie' || /^en-/.test(n.id); });
    var stroom = kaart('hv-en-stroomkaart hv-en-o1', kop('activity', t('Потоки наживо', 'Stromen live'), '<span class="hv-en-eenheid">' + h(kW()) + '</span>' + o.versheid(w)) + stroomHtml(ctx) +
      '<p class="hv-grafiek__zin">' + h(t('Товщина лінії — потужність у чотири сходинки; риски рухаються за напрямком потоку. Дотик до вузла відкриває пристрій.', 'De lijndikte is het vermogen in vier treden; de streepjes bewegen in de richting van de stroom. Tik op een knoop om het apparaat te openen.')) + '</p>', 'en-stroomkaart');
    var fasen = kaart('hv-en-fasenkaart hv-en-o5', kop('gauge', t('Фази L1–L3', 'Fasen L1–L3'), o.knop({ tekst: t('Докладно', 'Details'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'fasen' } })) + fasenHtml(w, false), 'en-fasenkaart');
    var belangrijk = nuItems.length ? o.blok({ id: 'en-nu', titel: t('Зараз важливо', 'Nu belangrijk'), teller: nuItems.length, inhoud: o.nu(nuItems), klas: 'hv-blok--nu' }) : '';
    var advies = o.blok({ id: 'en-advies', titel: t('Поради', 'Advies'), teller: adviezen(w).length, inhoud: adviesHtml(ctx),
      uitleg: t('Що станеться: порада лише показує оцінку в євро на рік і веде до місця, де це змінити. Пов’язано з: оцінки рахуються з цін і профілю дому за останні тижні. Як повернути: нічого не змінюється, доки ви не дієте самі.', 'Wat er gebeurt: een advies toont alleen een schatting in euro per jaar en brengt je naar de plek om het te wijzigen. Hangt samen met: schattingen komen uit de prijzen en het profiel van het huis van de afgelopen weken. Terugdraaien: er verandert niets tot je zelf iets doet.') });
    var dag = HV.dagstrook ? o.blok({ id: 'en-dagstrook', titel: t('Стрічка доби', 'Dagstrook'), inhoud: '<div class="hv-kaart">' + HV.dagstrook(ctx) + '</div>', dicht: false }) : '';
    return '<div class="hv-en" data-k="en-nu">' +
      '<p class="hv-en-zin" data-k="en-zin">' + HV.icoon('zap', { maat: 's' }) + '<span>' + h(zin(ctx)) + '</span></p>' +
      '<div class="hv-en-rooster hv-en-rooster--twee">' +
      '<div class="hv-en-kolom hv-en-kolom--mix">' + stroom + fasen + regieHtml(ctx) + '</div>' +
      '<div class="hv-en-kolom hv-en-kolom--mix">' + prijsNuHtml(ctx) + saldoHtml(ctx) + vandaagHtml(ctx) + '</div>' +
      '</div>' + belangrijk + advies + dag + '</div>';
  }

  // ───────────────────────── Tab: Tarief ─────────────────────────
  function tabTarief(ctx) {
    var w = ctx.staat, v = venster(w), q = kwartielen(v), p = HV.tarief.prijs(w.tijd), ni = nuIndex(w, v);
    var gekozen = klem(Number(HV.ui.lees('en-uur', ni)), 0, v.length - 1);
    var basis = HV.ui.lees('en-basis', 'vol');
    var gem = function (a, b) { var s = v.slice(a, b); return s.reduce(function (x, y) { return x + y.prijs; }, 0) / s.length; };
    var vensters = goedkopeVensters(v, q);
    var kopRij = '<div class="hv-en-tariefkop"><div class="hv-en-prijsnu__rij"><span class="hv-en-prijsnu__getal">' + h(HV.euro(p)) + '<span class="hv-en-prijsnu__eenheid">' + h(t(' за кВт·год зараз', ' per kWh nu')) + '</span></span>' + niveauChip(p, q, 'tk-niveau') + '<span class="hv-en-vb hv-en-vb--los">' + h(t('приклад', 'voorbeeld')) + '</span></div>' +
      o.segment({ label: t('Яку ціну показати', 'Welke prijs tonen'), waarde: basis, actie: 'ui', gegevens: { naam: 'en-basis' }, k: 'en-basis', opties: [{ id: 'vol', label: t('Повна ціна', 'Volledige prijs') }, { id: 'beurs', label: t('Біржа', 'Beurs') }] }) +
      o.gevolg(t('Що станеться: «Повна ціна» показує, що ви платите за кВт·год із податками й ПДВ; «Біржа» — лише біржову ціну години. Пов’язано з: рішення оптимізатора завжди рахуються з повної ціни. Як повернути: оберіть «Повна ціна».', 'Wat er gebeurt: ‘Volledige prijs’ toont wat je per kWh betaalt met belastingen en btw; ‘Beurs’ alleen de beursprijs van het uur. Hangt samen met: de optimalisatie rekent altijd met de volledige prijs. Terugdraaien: kies ‘Volledige prijs’.'), { kop: t('Повна ціна чи біржа', 'Volledige prijs of beurs') }) + '</div>';
    var cursor = '<div class="hv-en-cursor" data-k="en-cursor">' + o.icoonknop({ icoon: 'chevron-left', aria: t('Попередня година', 'Vorig uur'), actie: 'en-uur-stap', gegevens: { richting: -1 } }) +
      '<div class="hv-en-cursor__tekst" id="en-cursor-tekst">' + cursorTekst(w, v, gekozen) + '</div>' +
      o.icoonknop({ icoon: 'chevron-right', aria: t('Наступна година', 'Volgend uur'), actie: 'en-uur-stap', gegevens: { richting: 1 } }) +
      o.knop({ tekst: t('Склад ціни', 'Prijsopbouw'), icoon: 'receipt', klein: true, actie: 'blad', gegevens: { blad: 'uur:' + gekozen }, k: 'en-opbouw' }) + '</div>';
    var strook = kaart('hv-en-tarief', kop('chart-column', t('Ціна на 48 годин', 'Prijs voor 48 uur'), '<span class="hv-en-eenheid">' + h(t('€ за кВт·год', '€ per kWh')) + '</span>') + kopRij +
      prijsStrook(ctx, { id: 'tarief48', hoogte: 200, cursor: true }) + cursor +
      '<ul class="hv-en-legenda"><li><span class="hv-en-staafje is-goedkoop"></span>' + h(t('дешево — нижня чверть', 'goedkoop — onderste kwart')) + '</li><li><span class="hv-en-staafje is-duur"></span>' + h(t('дорого — найдорожча чверть, риска згори', 'duur — duurste kwart, streepje erboven')) + '</li><li><span class="hv-en-staafje is-negatief"></span>' + h(t('від’ємна — під віссю', 'negatief — onder de as')) + '</li><li><span class="hv-en-staafje is-nu"></span>' + h(t('зараз — рамка й риска', 'nu — kader en streep')) + '</li></ul>', 'en-tarief');
    var dagorde = kaart('hv-en-dagordekaart', kop('calendar-clock', t('Порядок доби', 'Dagorde'), o.knop({ tekst: t('Оптимізатор', 'Optimalisatie'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'optimalisatie' } })) +
      '<p class="hv-tekst hv-tekst--zacht">' + h(t('Що заплановано на дешеві години — на тій самій осі, що й ціни. Дотик до рядка відкриває запуск.', 'Wat op de goedkope uren gepland staat — op dezelfde as als de prijzen. Tik op een regel om de start te openen.')) + '</p>' + dagordeHtml(ctx), 'en-dagorde');
    var vandaag = gem(0, 24), morgen = gem(24, 48);
    var gemiddeld = kaart('hv-en-gem', kop('scale', t('Середня ціна', 'Gemiddelde prijs'), o.knop({ tekst: t('Ставки', 'Tarieven'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'tarieven' } })) +
      '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Сьогодні', 'Vandaag'), waarde: euro(vandaag) }) + o.getal({ maat: 'm', label: t('Завтра', 'Morgen'), waarde: euro(morgen), sub: h(morgen < vandaag ? t('дешевше на ', 'goedkoper met ') + HV.euro(vandaag - morgen) : t('дорожче на ', 'duurder met ') + HV.euro(morgen - vandaag)) }) +
      o.getal({ maat: 'm', label: t('Найнижча', 'Laagste'), waarde: euro(q.min), toon: q.min < 0 ? 'net-uit' : null }) + o.getal({ maat: 'm', label: t('Найвища', 'Hoogste'), waarde: euro(q.max) }) + '</div>' +
      '<div class="hv-rijen">' + vensters.map(function (x, i) { return o.rij({ icoon: 'arrow-down', naam: t('Дешеве вікно ', 'Goedkoop venster ') + dagWoord(w, v[x.van].tijd) + ' ' + vensterTekst(v, x), sub: t('середня ', 'gemiddeld ') + HV.euro(x.gem), waarde: h(t('від ', 'vanaf ') + HV.euro(x.min)), actie: 'ui', gegevens: { naam: 'en-uur', waarde: x.van }, k: 'venster-' + i }); }).join('') + '</div>', 'en-gem');
    return '<div class="hv-en" data-k="en-tarief">' + '<div class="hv-en-rooster">' + strook + dagorde + gemiddeld + '</div></div>';
  }

  // ───────────────────────── Tab: Zon en batterij ─────────────────────────
  function zonGrafiek(w, id, hoogte) {
    var d0 = dagVan(w.tijd), van = d0 + 7 * UUR, tot = d0 + 18 * UUR, gemeten = [], prognose = [];
    for (var x = van; x <= tot; x += 15 * 60000) {
      var kw = zonKw(x, w.weer.bewolking, w.weer.mist) * (w.apparaten.zonnepanelen.st.modus === 'begrensd' ? 0.85 : 1);
      if (x <= w.tijd) gemeten.push([x, kw]); else { if (!prognose.length && gemeten.length) prognose.push(gemeten[gemeten.length - 1]); prognose.push([x, zonKw(x, Math.max(0.2, w.weer.bewolking - 0.1), false)]); }
    }
    var reeksen = [];
    if (gemeten.length > 1) reeksen.push({ naam: t('Виміряно', 'Gemeten'), toon: 'zon', vlak: true, punten: gemeten });
    if (prognose.length > 1) reeksen.push({ naam: t('Прогноз', 'Verwachting'), toon: 'zon', geschat: true, punten: prognose });
    var morgen = [];
    for (var m = van; m <= tot; m += 30 * 60000) morgen.push([m, zonKw(m + DAG, 0.3, false)]);
    if (!reeksen.length) reeksen.push({ naam: t('Прогноз', 'Verwachting'), toon: 'zon', geschat: true, punten: [[van, 0], [tot, 0]] });
    reeksen.push({ naam: t('Завтра', 'Morgen'), toon: 'neutraal', geschat: true, punten: morgen });
    return HV.grafiek.lijn({ id: id, titel: t('Виробіток сонця: сьогодні й завтра', 'Opbrengst van de zon: vandaag en morgen'), eenheid: kW(), hoogte: hoogte || 160, nu: w.tijd >= van && w.tijd <= tot ? w.tijd : null, y: { min: 0 },
      x: { min: van, max: tot, tikken: [8, 12, 16].map(function (u) { return { x: d0 + u * UUR, label: HV.tijd(d0 + u * UUR) }; }), format: HV.tijd },
      reeksen: reeksen, samenvatting: t('Суцільна площа — виміряне сьогодні; пунктир — прогноз за хмарністю (оцінено), тонкий темний — завтра. Пік панелей — 4,2 кВт.', 'Het volle vlak is vandaag gemeten; gestippeld is de verwachting op basis van bewolking (geschat), donker gestippeld is morgen. Piek van de panelen: 4,2 kW.') });
  }
  function zonVerdeling(w) {
    var e = w.energie, zon = Math.max(0.01, e.vandaagZon), uit = Math.min(zon, e.vandaagUit);
    var bat = Math.min(zon - uit, 2.1), auto = 0, huis = Math.max(0, zon - uit - bat - auto);
    return { zon: zon, huis: huis, bat: bat, auto: auto, net: uit };
  }
  function tabZon(ctx) {
    var w = ctx.staat, A = w.apparaten, zp = A.zonnepanelen, e = w.energie, z = zonVerdeling(w);
    var verbruikt = Math.max(0.01, e.vandaagIn + z.zon - z.net);
    var eigen = (z.zon - z.net) / z.zon, zelf = klem((z.zon - z.net) / verbruikt, 0, 1);
    var prognoseRest = 0;
    for (var x = w.tijd; x < dagVan(w.tijd) + 18 * UUR; x += 15 * 60000) prognoseRest += zonKw(x, Math.max(0.2, w.weer.bewolking - 0.1), false) / 4;
    var opbrengst = kaart('hv-en-opwek', kop('sun', t('Виробіток і прогноз', 'Opbrengst en verwachting'), o.knop({ tekst: t('Панелі', 'Panelen'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:zonnepanelen' } }), 'zon') +
      '<div class="hv-getallen hv-getallen--eerst">' + o.getal({ maat: 'l', label: t('Зараз', 'Nu'), waarde: HV.maat(zp.st.vermogen, kW(), 2), toon: 'zon', sub: h(t('з 4,2 кВт піку', 'van 4,2 kW piek')) }) +
      o.getal({ maat: 'm', label: t('Сьогодні', 'Vandaag'), waarde: HV.maat(e.vandaagZon, kWh(), 1) }) +
      o.getal({ maat: 'm', label: t('Ще до заходу', 'Nog tot zonsondergang'), waarde: ong(HV.maat(prognoseRest, kWh(), 1)) }) +
      o.getal({ maat: 'm', label: t('Завтра', 'Morgen'), waarde: ong(HV.maat(9.4, kWh(), 1)), sub: h(t('прогноз KNMI · менше хмар', 'verwachting KNMI · minder bewolking')) }) + '</div>' + zonGrafiek(w, 'en-zon') +
      (zp.st.modus === 'begrensd' ? '<p class="hv-en-let">' + HV.icoon('triangle-alert', { maat: 's' }) + h(t('Віддачу обмежено: надлишок сонця зрізається.', 'Teruglevering begrensd: overschot van de zon wordt afgeknepen.')) + '</p>' : ''), 'en-opwek');
    var ringen = kaart('hv-en-ringen hv-en-o3', kop('circle-gauge', t('Чия енергія', 'Wiens energie')) + '<div class="hv-en-ringen__rij">' +
      boog({ deel: eigen, toon: 'zon', midden: HV.maat(Math.round(eigen * 100), '%'), label: t('власне споживання', 'eigen verbruik'), aria: t('Власне споживання сонця: ', 'Eigen verbruik van de zon: ') + Math.round(eigen * 100) + ' %' }) +
      boog({ deel: zelf, toon: 'batterij', midden: HV.maat(Math.round(zelf * 100), '%'), label: t('самозабезпечення', 'zelfvoorzienend'), aria: t('Самозабезпечення: ', 'Zelfvoorzienend: ') + Math.round(zelf * 100) + ' %' }) + '</div>' +
      '<p class="hv-grafiek__zin">' + h(t('Власне споживання — яка частка сонця лишилася вдома. Самозабезпечення — яку частку потреб дому покрило своє сонце.', 'Eigen verbruik — welk deel van de zon thuis bleef. Zelfvoorzienend — welk deel van de behoefte van het huis de eigen zon dekte.')) + '</p>', 'en-ringen');
    var delen = [{ naam: t('Дім', 'Huis'), kw: z.huis, toon: 'neutraal' }, { naam: t('Батарея', 'Batterij'), kw: z.bat, toon: 'batterij' }, { naam: t('Авто', 'Auto'), kw: z.auto, toon: 'auto' }, { naam: t('Мережа', 'Net'), kw: z.net, toon: 'net-uit' }];
    var waarheen = kaart('hv-en-waarheen hv-en-o4', kop('route', t('Куди пішло сонце', 'Waar de zon heen ging')) +
      '<span class="hv-en-draad__balk hv-en-draad__balk--groot">' + delen.filter(function (d) { return d.kw > 0.01; }).map(function (d) { return '<i class="hv-toon-' + d.toon + '" style="flex-grow:' + (d.kw / z.zon).toFixed(4) + '"></i>'; }).join('') + '</span>' +
      '<ul class="hv-grafiek__legenda hv-en-legenda--kolom">' + delen.map(function (d) { return '<li class="hv-toon-' + d.toon + '">' + HV.icoon(d.toon === 'net-uit' ? 'merk-vierkant-leeg' : d.toon === 'batterij' ? 'merk-halve-cirkel' : d.toon === 'auto' ? 'merk-kruis' : 'merk-vierkant', { maat: 'merk' }) + '<span>' + h(d.naam) + '</span><strong>' + HV.maat(d.kw, kWh(), 1) + ' · ' + Math.round(d.kw / z.zon * 100) + ' %</strong></li>'; }).join('') + '</ul>', 'en-waarheen');
    var begrenzing = kaart('hv-en-begrenzing hv-en-o5', kop('shield-check', t('Віддача в мережу', 'Teruglevering')) +
      veld(t('Інвертор', 'Omvormer'), o.segment({ label: t('Обмеження віддачі', 'Begrenzing van de teruglevering'), waarde: HV.gewenst(zp, 'modus') || 'vrij', actie: 'doe', gegevens: { doel: 'zonnepanelen', mogelijkheid: 'modus' }, k: 'en-begrens', opties: [{ id: 'vrij', label: t('Без обмеження', 'Onbegrensd') }, { id: 'begrensd', label: t('До 0 кВт', 'Tot 0 kW'), icoon: 'triangle' }] }),
        ' ' + o.risico('gevaarlijk') + ' ' + o.gevolg(HV.p(HV.gevaar.actie('zonnepanelen.begrenzen').gevolg), { kop: t('Обмежити віддачу', 'Teruglevering begrenzen') })) +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Обмеження — небезпечна дія: її виконання проходить рейку утримання. Плата за віддачу ', 'Begrenzen is een gevaarlijke actie: uitvoeren gaat via de houdrail. Terugleverkosten ')) + orig('terugleverkosten') + h(t(' зараз ≈ € 0,03 за кВт·год (приклад).', ' nu ≈ € 0,03 per kWh (voorbeeld).')) + '</span></p>', 'en-begrenzing');
    return '<div class="hv-en" data-k="en-zon"><div class="hv-en-rooster hv-en-rooster--gelijk">' +
      '<div class="hv-en-breed">' + opbrengst + '</div>' +
      '<div class="hv-en-kolom hv-en-kolom--mix">' + ringen + waarheen + '</div>' +
      '<div class="hv-en-kolom hv-en-kolom--mix">' + batterijKaart(ctx) + begrenzing + '</div></div></div>';
  }

  // ───────────────────────── Batterij ─────────────────────────
  function batterijLijn(w) {
    var tb = w.apparaten.thuisbatterij.st, res = reserveVan(tb), nu = w.tijd, van = nu - 12 * UUR, tot = nu + 12 * UUR;
    var tempo = function (ms) { var u = HV.uur(ms); return u >= 10 && u < 15 ? 7 : u >= 17 && u < 21 ? -9 : u >= 2 && u < 5 ? 3 : -0.6; };
    var verleden = [[nu, tb.lading]], toekomst = [[nu, tb.lading]], soc = tb.lading;
    for (var x = nu - 30 * 60000; x >= van; x -= 30 * 60000) { soc = klem(soc - tempo(x) / 2, res, 100); verleden.unshift([x, soc]); }
    soc = tb.lading;
    for (var y = nu + 30 * 60000; y <= tot; y += 30 * 60000) { soc = klem(soc + tempo(y) / 2, tb.modus === 'diep' ? 12 : res, 100); toekomst.push([y, soc]); }
    return HV.grafiek.lijn({ id: 'en-batterij', titel: t('Заряд батареї, ±12 год', 'Lading van de batterij, ±12 uur'), eenheid: '%', hoogte: 130, nu: nu, y: { min: 0, max: 100 },
      x: { min: van, max: tot, tikken: [0, 6, 12, 18, 24].map(function (u) { return { x: van + u * UUR, label: HV.tijd(van + u * UUR) }; }), format: HV.tijd },
      reeksen: [{ naam: t('Факт', 'Feit'), toon: 'batterij', vlak: true, streep: '', punten: verleden }, { naam: t('План', 'Plan'), toon: 'batterij', geschat: true, punten: toekomst }],
      samenvatting: t('Ліворуч від «зараз» — факт суцільно, праворуч — план пунктиром. Резерв ', 'Links van ‘nu’ het feit, rechts het plan gestippeld. Reserve ') + res + ' %.' });
  }
  function batterijKaart(ctx, inBlad) {
    var w = ctx.staat, a = w.apparaten.thuisbatterij, st = a.st, res = reserveVan(st), modus = HV.gewenst(a, 'modus');
    var woord = st.vermogen > 0.02 ? t('заряджається', 'laadt') : st.vermogen < -0.02 ? t('віддає в дім', 'levert aan het huis') : t('чекає', 'stand-by');
    var balk = '<span class="hv-en-batbalk" aria-hidden="true"><span class="hv-en-batbalk__reserve" style="width:' + res + '%"></span><span class="hv-en-batbalk__vulling" style="width:' + klem(st.lading, 0, 100).toFixed(1) + '%"></span></span>';
    var kopHtml = '<div class="hv-en-bathoofd">' + o.getal({ maat: 'xl', waarde: HV.maat(Math.round(st.lading), '%'), toon: 'batterij', label: woord }) +
      '<div class="hv-en-bathoofd__rechts">' + balk + '<p class="hv-en-tekst is-zacht">' + HV.maat(st.lading / 10, kWh(), 1) + ' ' + h(t('з 10', 'van 10')) + ' · ' + HV.maat(Math.abs(st.vermogen), kW(), 1) + ' · ' + h(t('резерв ', 'reserve ') + res + ' %') + '</p></div></div>';
    var modusVeld = veld(t('Режим роботи', 'Werkmodus'), o.werkmodus({ waarde: modus === 'diep' ? null : modus, actie: 'doe', gegevens: { doel: 'thuisbatterij', mogelijkheid: 'modus' }, k: 'bat-modus' }) +
      (modus === 'diep' ? '<p class="hv-en-let">' + HV.icoon('triangle-alert', { maat: 's' }) + h(t('Зараз: розряд нижче резерву, до 12 %.', 'Nu: ontladen onder de reserve, tot 12 %.')) + '</p>' : ''),
      ' ' + o.gevolg(t('Що станеться: «Розумно» передає батарею оптимізаторові; «Швидко» — заряджати з мережі на 3 кВт зараз; «Пауза» — батарея не заряджається й не віддає. Пов’язано з: план зарядки авто, щоб не перевантажити фазу. Як повернути: оберіть інший режим — «Повернути» 10 с, далі з Журналу.', 'Wat er gebeurt: ‘Slim’ geeft de batterij aan de optimalisatie; ‘Snel’ — nu op 3 kW laden van het net; ‘Pauze’ — de batterij laadt noch levert. Hangt samen met: het laadplan van de auto, om een fase niet te overbelasten. Terugdraaien: kies een andere stand — ‘Ongedaan maken’ 10 s, daarna via het logboek.'), { kop: t('Режим батареї', 'Stand van de batterij') }));
    var bronVeld = modus === 'slim' ? veld(t('Спосіб', 'Werkwijze'), o.segment({ label: t('Спосіб розумного режиму', 'Werkwijze van slim'), waarde: HV.gewenst(a, 'bron') || 'zon', actie: 'doe', gegevens: { doel: 'thuisbatterij', mogelijkheid: 'bron' }, klas: 'hv-segment--rol', k: 'bat-bron', opties: [
      { id: 'zon', label: t('Лише сонце', 'Alleen zon'), icoon: 'sun' }, { id: 'goedkoop', label: t('Дешеві години', 'Goedkope uren'), icoon: 'arrow-down' }, { id: 'nulmeter', label: t('Нуль на лічильнику', 'Nul op de meter'), icoon: 'gauge' }] })) : '';
    var reserveVeld = veld(t('Резерв на відключення', 'Reserve voor een stroomstoring'), '<div class="hv-en-rij2">' + o.stapper({ actie: 'en-reserve', stap: 5, label: t('Резерв', 'Reserve'), waarde: HV.maat(res, '%'), k: 'bat-reserve' }) +
      '<span class="hv-tekst hv-tekst--zacht">' + h(t('Нижче резерву батарея не віддає — запас на холодильник і маршрутизатор.', 'Onder de reserve levert de batterij niet — buffer voor koelkast en router.')) + '</span></div>');
    var diep = '<div class="hv-knoppen">' + o.knop({ tekst: t('Розрядити нижче резерву', 'Onder de reserve ontladen'), icoon: 'battery-low', actie: 'doe', gegevens: { doel: 'thuisbatterij', mogelijkheid: 'modus', waarde: 'diep' }, gedrukt: modus === 'diep', k: 'bat-diep' }) + o.risico('gevaarlijk') + o.gevolg(HV.p(HV.gevaar.actie('thuisbatterij.diep').gevolg), { kop: t('Розрядити нижче резерву', 'Onder de reserve ontladen') }) + '</div>';
    var dozvil = veld(t('Дозвіл оптимізатора', 'Toestemming van de optimalisatie'), o.stand({ uitvoerder: 'optimalisatie', actie: HV.gevaar.actie('thuisbatterij.modus'), rol: ctx.rol }) + o.stand({ uitvoerder: 'optimalisatie', actie: HV.gevaar.actie('thuisbatterij.diep'), rol: ctx.rol }));
    var inhoud = kopHtml + modusVeld + bronVeld + reserveVeld + diep + dozvil + batterijLijn(w);
    if (inBlad) return o.kaart({ inhoud: inhoud });
    return kaart('hv-en-batterij hv-en-o2', kop('battery-medium', t('Домашня батарея', 'Thuisbatterij'), o.knop({ tekst: t('Аркуш', 'Blad'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:thuisbatterij' } }), 'batterij') + inhoud, 'en-batterij');
  }

  // ───────────────────────── Tab: Laden ─────────────────────────
  function stationHtml(ctx) {
    var w = ctx.staat, lp = w.apparaten.laadpaal, st = lp.st, li = laadInfo(w), ls = laadStaat(w, li);
    var aan = lp.wacht && lp.wacht.mogelijkheid === 'laden' ? lp.wacht.waarde : !!st.laadt;
    return '<div class="hv-bediening__hoofd hv-en-station">' + o.schakel({ aan: aan, icoon: 'plug-zap', toon: 'auto', staat: lp.wacht ? 'wacht' : null, actie: 'schakel', gegevens: { doel: 'laadpaal', mogelijkheid: 'laden' }, aria: t('Зарядка авто', 'Auto laden') }) +
      '<div><p class="hv-bediening__woord">' + h((lp.wacht ? HV.woord.wacht() : ls.woord) + (st.laadt ? ' · ' + (st.modus === 'snel' ? t('3 фази · 16 А', '3 fasen · 16 A') : t('1 фаза · 32 А', '1 fase · 32 A')) : '')) + '</p><p class="hv-bediening__getal">' + (st.laadt ? HV.maat(st.vermogen, kW(), 1) : h(st.aangesloten ? t('під’єднано', 'aangesloten') : t('вільна', 'vrij'))) + '</p></div></div>';
  }
  function sessies(w) {
    var d0 = dagVan(w.tijd);
    return [1, 2, 3, 5, 6].map(function (d, i) {
      var kwh = 8 + Math.round(ruis(i, 3) * 140) / 10, zon = Math.round(ruis(i, 7) * 60);
      return { van: d0 - d * DAG + (1 + Math.round(ruis(i, 5) * 3)) * UUR, kwh: kwh, prijs: 0.16 + ruis(i, 9) * 0.06, zon: zon, modus: i === 2 ? 'snel' : 'slim' };
    });
  }
  function tabLaden(ctx) {
    var w = ctx.staat, ev = w.voertuigen[0], lp = w.apparaten.laadpaal, li = laadInfo(w);
    var station = kaart('hv-en-stationkaart hv-en-o1', kop('plug-zap', t('Станція «Під’їзд»', 'Laadpaal ‘Oprit’'), o.knop({ tekst: t('Аркуш', 'Blad'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:laadpaal' } }), 'auto') + stationHtml(ctx) +
      o.telemetrie({ id: 'en-ev', icoon: 'car', naam: HV.p(ev.naam), stand: lp.st.laadt ? t('заряджається', 'laadt') : t('на під’їзді', 'op de oprit'), lading: ev.lading, doel: li.doel, toon: lp.st.laadt ? 'auto' : 'batterij', bereik: HV.maat(ev.bereik, t('км', 'km')),
        getallen: [{ label: t('ціль', 'doel'), waarde: HV.maat(li.doel, '%') }, { label: t('потрібно', 'nodig'), waarde: HV.maat(li.nodig, kWh(), 1) }, { label: t('виїзд', 'vertrek'), waarde: h(li.vertrek) }], actie: 'ga', gegevens: { naar: 'garage-voertuigen' } }), 'en-station');
    var plan = kaart('hv-en-plankaart hv-en-o2', kop('calendar-clock', t('План зарядки', 'Laadplan'), o.knop({ tekst: t('Окремим аркушем', 'Als blad'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'laadplan:oprit' } }), 'auto') + o.laadplan(ctx), 'en-plan');
    var lijst = sessies(w);
    var sess = kaart('hv-en-sessies hv-en-o3', kop('history', t('Сесії зарядки', 'Laadsessies')) + '<div class="hv-rijen">' + lijst.map(function (s, i) {
      return o.rij({ icoon: s.modus === 'snel' ? 'zap' : 'sparkles', naam: HV.datum(s.van) + ', ' + HV.tijd(s.van), sub: HV.p(HV.waardeNaam[s.modus]) + ' · ' + t('сонце ', 'zon ') + s.zon + ' %', waarde: HV.maat(s.kwh, kWh(), 1) + ' · ' + euro(s.kwh * s.prijs), k: 'sessie-' + i });
    }).join('') + '</div>' + '<p class="hv-tekst hv-tekst--zacht">' + h(t('Сесії від симулятора; сума — за ціною годин зарядки.', 'Sessies van de simulator; het bedrag volgt de prijs van de laaduren.')) + '</p>', 'en-sessies');
    return '<div class="hv-en" data-k="en-laden"><div class="hv-en-rooster hv-en-rooster--twee"><div class="hv-en-kolom hv-en-kolom--mix">' + plan + '</div><div class="hv-en-kolom hv-en-kolom--mix">' + station + sess + '</div></div></div>';
  }

  // ───────────────────────── Tab: Warmte ─────────────────────────
  var WP_MODI = [['uit', ['Вимкнено', 'Uit']], ['verwarmen', ['Обігрів', 'Verwarmen']], ['boiler', ['Лише вода', 'Alleen water']]];
  function tabWarmte(ctx) {
    var w = ctx.staat, A = w.apparaten, wp = A.warmtepomp, st = wp.st, b = A.boiler;
    var eenheid = HV.ui.lees('en-gaseenheid', 'm3');
    var d0 = dagVan(w.tijd), van = w.tijd - 24 * UUR, inPunten = [], uitPunten = [];
    for (var x = van; x <= w.tijd; x += 30 * 60000) {
      var u = HV.uur(x), kwIn = (u < 6 || u >= 22 ? 0.75 : u >= 6 && u < 9 ? 0.9 : u >= 17 && u < 22 ? 0.7 : 0.3) + 0.08 * Math.sin(x / 2700000);
      var cop = 3.6 + 0.6 * Math.sin((u - 14) / 24 * 2 * Math.PI) * -1;
      if (x + 30 * 60000 > w.tijd) { kwIn = st.vermogen / 1000; cop = st.cop; }
      inPunten.push([x, kwIn]); uitPunten.push([x, kwIn * cop]);
    }
    var gemCop = uitPunten.reduce(function (s, p) { return s + p[1]; }, 0) / Math.max(0.01, inPunten.reduce(function (s, p) { return s + p[1]; }, 0));
    var grafiek = HV.grafiek.lijn({ id: 'en-wp', titel: t('Електрика на вході й тепло на виході, 24 год', 'Elektriciteit erin en warmte eruit, 24 uur'), eenheid: kW(), hoogte: 150,
      x: { min: van, max: w.tijd, tikken: [0, 6, 12, 18, 24].map(function (u) { return { x: van + u * UUR, label: HV.tijd(van + u * UUR) }; }), format: HV.tijd },
      reeksen: [{ naam: t('Тепло', 'Warmte'), toon: 'warm', streep: '', punten: uitPunten }, { naam: t('Електрика', 'Elektriciteit'), toon: 'neutraal', punten: inPunten }],
      samenvatting: t('Середній коефіцієнт перетворення (COP) за добу ', 'Gemiddelde COP over het etmaal ') + HV.getal(gemCop, 1) + t(': з 1 кВт·год електрики — ', ': uit 1 kWh elektriciteit komt ') + HV.getal(gemCop, 1) + t(' кВт·год тепла.', ' kWh warmte.') });
    var pomp = kaart('hv-en-wpkaart', kop('heater', t('Тепловий насос', 'Warmtepomp'), o.knop({ tekst: t('Аркуш', 'Blad'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:warmtepomp' } }), 'warm') +
      '<div class="hv-getallen hv-getallen--eerst">' + o.getal({ maat: 'l', label: st.verwarmt ? t('гріє', 'verwarmt') : st.modus === 'uit' ? t('вимкнено', 'uit') : t('чекає', 'stand-by'), waarde: HV.maat(st.vermogen, t('Вт', 'W')), toon: 'warm' }) +
      o.getal({ maat: 'm', label: t('Подача', 'Aanvoer'), waarde: HV.maat(st.aanvoer, '°C', 1) }) + o.getal({ maat: 'm', label: t('Зворот', 'Retour'), waarde: HV.maat(st.retour, '°C', 1) }) +
      o.getal({ maat: 'm', label: 'COP', waarde: HV.getal(st.cop, 1), sub: h(t('зараз', 'nu')) }) + '</div>' +
      veld(t('Режим', 'Stand'), o.segment({ label: t('Режим теплового насоса', 'Stand van de warmtepomp'), waarde: HV.gewenst(wp, 'modus'), actie: 'doe', gegevens: { doel: 'warmtepomp', mogelijkheid: 'modus' }, k: 'wp-modus', opties: WP_MODI.map(function (m) { return { id: m[0], label: HV.p(m[1]), icoon: m[0] === 'uit' ? 'triangle' : null }; }) }),
        ' ' + o.gevolg(HV.p(HV.gevaar.actie('warmtepomp.uit').gevolg), { kop: t('Вимкнути тепловий насос', 'Warmtepomp uitzetten') })) +
      '<p class="hv-en-tekst is-zacht">' + o.risico('gevaarlijk') + ' ' + h(t('«Вимкнено» — через рейку утримання: дім вихолоне.', '‘Uit’ gaat via de houdrail: het huis koelt af.')) + '</p>' + grafiek, 'en-wp');
    var bst = b.st, bAan = b.wacht && b.wacht.mogelijkheid === 'aan' ? b.wacht.waarde : !!bst.aan;
    var boiler = kaart('hv-en-boiler', kop('shower-head', t('Гаряча вода', 'Warm water'), o.knop({ tekst: t('Аркуш', 'Blad'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:boiler' } }), 'warm') +
      '<div class="hv-bediening__hoofd">' + o.schakel({ aan: bAan, icoon: 'droplet', toon: 'warm', staat: b.wacht ? 'wacht' : null, actie: 'schakel', gegevens: { doel: 'boiler', mogelijkheid: 'aan' }, aria: HV.p(b.naam) }) +
      '<div><p class="hv-bediening__woord">' + h(b.wacht ? HV.woord.wacht() : bst.aan ? t('увімкнено', 'aan') : t('вимкнено', 'uit')) + '</p><p class="hv-bediening__getal">' + HV.maat(bst.temperatuur, '°C') + ' <span class="hv-naar">→</span> ' + HV.maat(HV.gewenst(b, 'doel'), '°C') + '</p></div></div>' +
      veld(t('Ціль', 'Doel'), o.stapper({ actie: 'stap-doe', gegevens: { doel: 'boiler', mogelijkheid: 'doel' }, stap: 1, label: t('Ціль бойлера', 'Doel van de boiler'), waarde: HV.maat(HV.gewenst(b, 'doel'), '°C'), k: 'boiler-doel' })) +
      veld(t('Режим роботи', 'Werkmodus'), o.werkmodus({ waarde: HV.gewenst(b, 'modus') || 'slim', actie: 'doe', gegevens: { doel: 'boiler', mogelijkheid: 'modus' }, k: 'boiler-modus' }), ' ' + o.gevolg(t('Що станеться: «Розумно» — бойлер гріє в дешеву годину чи від надлишку сонця; «Швидко» — гріє зараз; «Пауза» — не гріє до наступної зміни. Пов’язано з: раз на тиждень — прогрів до 60 °C від легіонели, його пауза не скасовує. Як повернути: оберіть інший режим.', 'Wat er gebeurt: ‘Slim’ — de boiler warmt op in een goedkoop uur of op overschot van de zon; ‘Snel’ — nu opwarmen; ‘Pauze’ — niet opwarmen tot de volgende wijziging. Hangt samen met: eens per week opwarmen tot 60 °C tegen legionella, dat slaat pauze niet over. Terugdraaien: kies een andere stand.'), { kop: t('Режим бойлера', 'Werkmodus van de boiler') })) +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Прогріти до 60 °C від легіонели', 'Opwarmen tot 60 °C tegen legionella'), icoon: 'thermometer-sun', actie: 'en-legionella', k: 'boiler-60' }) + '</div>', 'en-boiler');
    var dagen = [6, 5, 4, 3, 2, 1, 0].map(function (d) { return d0 - d * DAG; });
    var gas = dagen.map(function (x, i) { return 0.28 + ruis(i, 11) * 0.3; });
    var factor = eenheid === 'kwh' ? 9.77 : 1;
    var gasKaart = kaart('hv-en-gas', kop('flame', t('Газ', 'Gas'), o.segment({ label: t('Одиниця газу', 'Eenheid van gas'), waarde: eenheid, actie: 'ui', gegevens: { naam: 'en-gaseenheid' }, k: 'en-gaseenheid', opties: [{ id: 'm3', label: t('м³', 'm³') }, { id: 'kwh', label: kWh() }] })) +
      HV.grafiek.staven({ id: 'en-gas', titel: t('Газ за 7 днів', 'Gas, 7 dagen'), eenheid: eenheid === 'kwh' ? kWh() : t('м³', 'm³'), hoogte: 120, decimalen: eenheid === 'kwh' ? 1 : 2, tikken: 1, tabelKop: t('День', 'Dag'),
        staven: dagen.map(function (x, i) { return { label: HV.datumKort(x), waarde: gas[i] * factor * (i === 6 ? HV.uur(w.tijd) / 24 : 1), toon: 'warm', geschat: i === 6, nu: i === 6 }; }),
        samenvatting: t('Газ лише для плити: опалює тепловий насос. Сьогоднішній стовпчик — оцінка до кінця доби.', 'Gas alleen voor het fornuis: de warmtepomp verwarmt. De kolom van vandaag is een schatting tot het einde van de dag.') }), 'en-gas');
    var water = dagen.map(function (x, i) { return 118 + Math.round(ruis(i, 13) * 70); });
    var waterKaart = kaart('hv-en-water', kop('droplets', t('Вода', 'Water')) +
      HV.grafiek.staven({ id: 'en-water', titel: t('Вода за 7 днів', 'Water, 7 dagen'), eenheid: t('л', 'l'), hoogte: 120, decimalen: 0, tikken: 1, tabelKop: t('День', 'Dag'),
        staven: dagen.map(function (x, i) { return { label: HV.datumKort(x), waarde: water[i] * (i === 6 ? HV.uur(w.tijd) / 24 : 1), toon: 'koud', geschat: i === 6, nu: i === 6 }; }),
        samenvatting: t('Нічний мінімум 0 л/год: витоку не видно.', 'Nachtelijk minimum 0 l/u: geen lek te zien.') }) +
      o.rij({ icoon: 'shield-check', naam: t('Нічний мінімум води', 'Nachtelijk minimum water'), sub: t('ознака витоку, якщо не нуль', 'teken van een lek als het niet nul is'), waarde: HV.maat(0, t('л/год', 'l/u')), k: 'water-min' }), 'en-water');
    return '<div class="hv-en" data-k="en-warmte"><div class="hv-en-rooster hv-en-rooster--gelijk"><div class="hv-en-breed">' + pomp + '</div><div class="hv-en-kolom">' + boiler + '</div><div class="hv-en-kolom">' + gasKaart + waterKaart + '</div></div></div>';
  }

  // ───────────────────────── Tab: Rapporten ─────────────────────────
  var JAAR_ZON = [60, 110, 250, 380, 480, 520, 510, 440, 310, 180, 80, 50];
  var JAAR_VERBRUIK = [520, 470, 430, 350, 300, 280, 290, 300, 330, 400, 470, 540];
  var MAAND_KORT = [['січ', 'jan'], ['лют', 'feb'], ['бер', 'mrt'], ['кві', 'apr'], ['тра', 'mei'], ['чер', 'jun'], ['лип', 'jul'], ['сер', 'aug'], ['вер', 'sep'], ['жов', 'okt'], ['лис', 'nov'], ['гру', 'dec']];
  function rapport(w, periode, zaad, factor) {
    var rijen = [], d0 = dagVan(w.tijd), f = factor || 1;
    var maak = function (label, verbruik, zon) {
      var eigen = Math.min(verbruik, zon * 0.55), rest = zon - eigen, laad = Math.min(rest, zon * 0.2), uit = Math.max(0, rest - laad), bat = laad * 0.9;
      var netIn = Math.max(0, verbruik - eigen - bat);
      rijen.push({ label: label, netIn: netIn * f, zon: eigen * f, bat: bat * f, uit: uit * f, laad: laad * f, verbruik: verbruik * f });
    };
    if (periode === 'dag') for (var u = 0; u < 24; u++) { var x = d0 + u * UUR; maak(String(u), huisKw(x + UUR / 2) + (u >= 2 && u < 4 ? 5.1 : 0) + ruis(u, zaad) * 0.2, zonKw(x + UUR / 2, 0.5, false)); }
    if (periode === 'week') for (var d = 6; d >= 0; d--) maak(HV.datumKort(d0 - d * DAG), 14 + ruis(d, zaad) * 8, 3 + ruis(d + 9, zaad) * 6);
    if (periode === 'maand') for (var m = 29; m >= 0; m--) maak(String(new Date(d0 - m * DAG).getUTCDate()), 14 + ruis(m, zaad) * 8, 2.5 + ruis(m + 40, zaad) * 6);
    if (periode === 'jaar') for (var j = 0; j < 12; j++) maak(HV.p(MAAND_KORT[j]), JAAR_VERBRUIK[j] * (0.95 + ruis(j, zaad) * 0.1), JAAR_ZON[j] * (0.92 + ruis(j + 3, zaad) * 0.16));
    var som = function (k) { return rijen.reduce(function (s, r) { return s + r[k]; }, 0); };
    return { rijen: rijen, verbruik: som('verbruik'), netIn: som('netIn'), uit: som('uit'), zon: som('zon') + som('laad') + som('uit'), eigen: som('zon') + som('laad') };
  }
  /** Джерела по годинах (--spiegel): угору спожите (мережа, своє сонце, батарея), униз віддача й заряд; примарні — порівняння. */
  function spiegel(r, vergelijk, eenheid) {
    var n = r.rijen.length;
    var op = Math.max.apply(null, r.rijen.map(function (x) { return x.netIn + x.zon + x.bat; }).concat(vergelijk ? vergelijk.rijen.map(function (x) { return x.verbruik; }) : []));
    var af = Math.max(0.001, Math.max.apply(null, r.rijen.map(function (x) { return x.uit + x.laad; })));
    var totaal = op + af, nul = op / totaal * 100;
    var Y = function (v) { return nul - v / totaal * 100; };
    var kolommen = r.rijen.map(function (x, i) {
      var segment = function (a, b, toon, extra) { var y1 = Y(b), y0 = Y(a); return '<span class="hv-en-spiegel__deel hv-toon-' + toon + (extra || '') + '" style="top:' + Math.min(y0, y1).toFixed(2) + '%;height:' + Math.max(0.3, Math.abs(y0 - y1)).toFixed(2) + '%"></span>'; };
      var s = segment(0, x.zon, 'zon') + segment(x.zon, x.zon + x.bat, 'batterij') + segment(x.zon + x.bat, x.zon + x.bat + x.netIn, 'net-in') + segment(-x.uit, 0, 'net-uit', ' is-onder') + segment(-x.uit - x.laad, -x.uit, 'batterij', ' is-onder is-laad');
      var geest = vergelijk && vergelijk.rijen[i] ? '<span class="hv-en-spiegel__geest" style="top:' + Y(vergelijk.rijen[i].verbruik).toFixed(2) + '%;height:' + (nul - Y(vergelijk.rijen[i].verbruik)).toFixed(2) + '%"></span>' : '';
      return '<span class="hv-en-spiegel__kolom" style="left:' + (i / n * 100).toFixed(3) + '%;width:' + (100 / n).toFixed(3) + '%">' + geest + s + '</span>';
    }).join('');
    var elke = n > 24 ? 5 : n > 12 ? 4 : n > 7 ? 2 : 1;
    var xLabels = r.rijen.map(function (x, i) { return i % elke === 0 ? '<span class="hv-grafiek__x" style="left:' + ((i + 0.5) / n * 100).toFixed(2) + '%">' + h(x.label) + '</span>' : ''; }).join('');
    var tik = function (v) { return '<span class="hv-grafiek__y" style="top:' + Y(v).toFixed(2) + '%">' + HV.getal(v, op < 10 ? 1 : 0) + '</span>'; };
    var yLabels = tik(op) + tik(0) + tik(-af);
    var rooster = '<span class="hv-grafiek__streep is-nul" style="top:' + nul.toFixed(2) + '%"></span><span class="hv-grafiek__streep" style="top:0%"></span>';
    var tabel = HV.tabel([t('Період', 'Periode'), t('З мережі', 'Van het net'), t('Своє сонце', 'Eigen zon'), t('З батареї', 'Uit de batterij'), t('У мережу', 'Naar het net')], r.rijen.map(function (x) { return [x.label, HV.getal(x.netIn, 1), HV.getal(x.zon, 1), HV.getal(x.bat, 1), HV.getal(x.uit, 1)]; }));
    var alsTabel = !!HV.grafiek.open['en-spiegel'];
    var legenda = '<ul class="hv-grafiek__legenda">' + [['net-in', t('з мережі', 'van het net'), 'merk-vierkant'], ['zon', t('своє сонце', 'eigen zon'), 'merk-cirkel'], ['batterij', t('батарея', 'batterij'), 'merk-halve-cirkel'], ['net-uit', t('у мережу — під віссю', 'naar het net — onder de as'), 'merk-vierkant-leeg']].map(function (l) { return '<li class="hv-toon-' + l[0] + '">' + HV.icoon(l[2], { maat: 'merk' }) + '<span>' + h(l[1]) + '</span></li>'; }).join('') +
      (vergelijk ? '<li class="hv-toon-neutraal"><span class="hv-en-geestmerk"></span><span>' + h(t('порівняння — контур', 'vergelijking — omtrek')) + '</span></li>' : '') + '</ul>';
    return '<figure class="hv-grafiek" data-k="en-spiegel"><div class="hv-grafiek__kop"><h3 class="hv-grafiek__titel">' + h(t('Джерела за періодом', 'Bronnen per periode')) + '</h3><span class="hv-grafiek__eenheid">' + h(eenheid) + '</span></div>' +
      (alsTabel ? tabel : '<div class="hv-en-spiegel"><div class="hv-grafiek__as">' + yLabels + '</div><div class="hv-en-spiegel__doek" role="img" aria-label="' + h(t('Угору — спожите за джерелом, униз — віддача й заряд батареї.', 'Omhoog verbruik per bron, omlaag teruglevering en laden van de batterij.')) + '">' + rooster + kolommen + '<div class="hv-grafiek__xas">' + xLabels + '</div></div></div>') +
      legenda + '<figcaption class="hv-grafiek__zin">' + h(t('Угору — спожите за джерелом, униз — віддача й заряд батареї. Енергія за період, кВт·год; потужність тут не змішується.', 'Omhoog verbruik per bron, omlaag teruglevering en laden van de batterij. Energie per periode in kWh; vermogen wordt hier niet gemengd.')) + '</figcaption>' +
      '<button type="button" class="hv-link hv-grafiek__wissel" data-actie="grafiek-tabel" data-grafiek="en-spiegel" aria-pressed="' + (alsTabel ? 'true' : 'false') + '">' + h(alsTabel ? t('Показати графіком', 'Als grafiek tonen') : t('Показати як таблицю', 'Als tabel tonen')) + '</button></figure>';
  }
  function saldeer(aandeel) {
    var opwek = 3900, verbruik = 4600, prijs = 0.27;
    var eigen = opwek * aandeel / 100, terug = opwek - eigen, afname = verbruik - eigen;
    var met = Math.max(0, afname - terug) * prijs + terug * TERUGLEVERKOSTEN;
    var zonder = afname * prijs - terug * VERGOEDING + terug * TERUGLEVERKOSTEN;
    return { met: met, zonder: zonder, terug: terug, afname: afname };
  }
  function tabRapporten(ctx) {
    var w = ctx.staat, periode = HV.ui.lees('en-periode', 'week'), vgl = HV.ui.lees('en-vergelijk', 'vorige');
    var r = rapport(w, periode, 1, 1);
    var ander = vgl === 'geen' ? null : rapport(w, periode, vgl === 'vorige' ? 2 : 5, vgl === 'vorige' ? 0.9 : 1.06);
    var gemPrijs = 0.24;
    var kosten = (r.netIn - r.uit) * gemPrijs, verschil = ander ? (r.verbruik - ander.verbruik) / ander.verbruik * 100 : 0;
    var aandeel = Number(HV.ui.lees('en-aandeel', 35));
    var s = saldeer(aandeel), s10 = saldeer(Math.min(90, aandeel + 10));
    var periodes = [{ id: 'dag', label: t('День', 'Dag') }, { id: 'week', label: t('Тиждень', 'Week') }, { id: 'maand', label: t('Місяць', 'Maand') }, { id: 'jaar', label: t('Рік', 'Jaar') }];
    var keuze = '<div class="hv-en-keuze">' + o.segment({ label: t('Період', 'Periode'), waarde: periode, actie: 'ui', gegevens: { naam: 'en-periode' }, klas: 'hv-segment--vier', k: 'en-periode', opties: periodes }) +
      o.segment({ label: t('Порівняти з', 'Vergelijken met'), waarde: vgl, actie: 'ui', gegevens: { naam: 'en-vergelijk' }, klas: 'hv-segment--rol', k: 'en-vergelijk', opties: [{ id: 'vorige', label: t('Попередній', 'Vorige') }, { id: 'jaar', label: t('Рік тому', 'Jaar terug') }, { id: 'geen', label: t('Без порівняння', 'Geen') }] }) + '</div>';
    var tegels = '<div class="hv-getallen hv-getallen--eerst">' + o.getal({ maat: 'l', label: t('Спожито', 'Verbruikt'), waarde: HV.maat(r.verbruik, kWh(), r.verbruik < 100 ? 1 : 0), sub: ander ? o.chip({ icoon: verschil > 0 ? 'trending-up' : 'trending-down', toon: verschil > 0 ? 'let-op' : 'ok', tekst: (verschil > 0 ? '+' : '−') + HV.getal(Math.abs(verschil), 0) + ' % ' + (vgl === 'vorige' ? t('до попереднього', 't.o.v. vorige') : t('до року тому', 't.o.v. vorig jaar')) }) : '' }) +
      o.getal({ maat: 'm', label: t('Вироблено сонцем', 'Opgewekt door de zon'), waarde: HV.maat(r.zon, kWh(), 0), toon: 'zon' }) +
      o.getal({ maat: 'm', label: t('Віддано в мережу', 'Teruggeleverd'), waarde: HV.maat(r.uit, kWh(), 0), toon: 'net-uit' }) +
      o.getal({ maat: 'm', label: t('Вартість', 'Kosten'), waarde: euro(kosten), sub: h(t('з взаємозаліком 2026', 'met salderen 2026')) }) +
      o.getal({ maat: 'm', label: t('Власне сонце', 'Eigen zon'), waarde: HV.maat(Math.round(r.eigen / Math.max(1, r.zon) * 100), '%') }) + '</div>';
    var bron = kaart('hv-en-rapport', kop('chart-column', t('Період і порівняння', 'Periode en vergelijking'), o.knop({ tekst: t('Вивантажити CSV', 'CSV exporteren'), icoon: 'download', soort: 'stil', klein: true, actie: 'en-export', gegevens: { periode: periode } })) + keuze + tegels + spiegel(r, ander, kWh()), 'en-rapport');
    var groepen = [[t('Тепловий насос', 'Warmtepomp'), 0.31, 'heater'], [t('Авто', 'Auto'), 0.24, 'car'], [t('Кухня', 'Keuken'), 0.14, 'cooking-pot'], [t('Прання й сушіння', 'Was en droger'), 0.09, 'washing-machine'], [t('Медіа й кабінет', 'Media en werkkamer'), 0.08, 'monitor'], [t('Світло', 'Licht'), 0.04, 'lightbulb'], [t('Фонове споживання', 'Sluipverbruik'), 0.1, 'plug']];
    var verbruikers = kaart('hv-en-verbruikers', kop('list', t('Хто скільки спожив', 'Wie hoeveel verbruikte')) + '<ul class="hv-en-balken">' + groepen.map(function (g, i) {
      return '<li data-k="vb-' + i + '">' + HV.icoon(g[2], { maat: 's' }) + '<span class="hv-en-balken__naam">' + h(g[0]) + '</span><span class="hv-en-balken__spoor"><i style="width:' + (g[1] / 0.31 * 100).toFixed(1) + '%"></i></span><strong>' + HV.maat(r.verbruik * g[1], kWh(), r.verbruik < 100 ? 1 : 0) + '</strong></li>';
    }).join('') + '</ul><p class="hv-tekst hv-tekst--zacht">' + h(t('Розетки й групи з власним лічильником; решта — оцінка «фонове й невідстежене».', 'Stekkers en groepen met een eigen meter; de rest is een schatting ‘sluip en onbekend’.')) + '</p>', 'en-verbruikers');
    var maxS = Math.max(s.met, s.zonder, 1);
    var paar = function (label, bedrag, klas) { return '<div class="hv-en-paar__kolom ' + klas + '"><span class="hv-en-paar__balk" style="height:' + Math.max(4, bedrag / maxS * 132).toFixed(0) + 'px"></span><strong>' + euro(bedrag, 0) + '</strong><span>' + h(label) + '</span></div>'; };
    var na = kaart('hv-en-salderen', kop('scale', t('2027: без взаємозаліку', '2027: zonder salderen')) +
      '<p class="hv-en-tekst">' + h(t('З 1 січня 2027 взаємозалік', 'Vanaf 1 januari 2027 stopt de salderingsregeling')) + orig('saldering') + h(t(' скасовано: віддане в мережу більше не віднімається від спожитого, за віддачу платять мало, а плата за віддачу', '. Wat je teruglevert wordt niet meer verrekend met je verbruik; je krijgt een kleine vergoeding, en de terugleverkosten')) + orig('terugleverkosten') + h(t(' лишається.', ' blijven.')) + '</p>' +
      veld(t('Частка власного споживання сонця', 'Aandeel eigen verbruik van de zon'), o.schuif({ label: t('Частка власного споживання', 'Aandeel eigen verbruik'), waarde: aandeel, min: 20, max: 90, stap: 5, eenheid: '%', toon: 'zon', actie: 'en-aandeel', k: 'en-aandeel' })) +
      '<div class="hv-en-paar">' + paar(t('2026 із взаємозаліком', '2026 met salderen'), s.met, 'is-met') + paar(t('2027 без нього', '2027 zonder'), s.zonder, 'is-zonder') + '</div>' +
      '<p class="hv-en-planregel">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Різниця на рік ', 'Verschil per jaar ')) + ong(euro(s.zonder - s.met, 0)) + h(t('. Кожні +10 % власного споживання дають ', '. Elke +10 % eigen verbruik scheelt ')) + ong(euro(s.zonder - s10.zonder, 0)) + h(t(' на рік: батарея, авто й бойлер у сонячні години.', ' per jaar: batterij, auto en boiler in de zonne-uren.')) + '</span></p>', 'en-salderen');
    var dagVanMaand = new Date(w.tijd).getUTCDate(), budget = 110, besteed = 3.6 * dagVanMaand, prognose = besteed / dagVanMaand * 30;
    var budgetKaart = kaart('hv-en-budget', kop('wallet', t('Бюджет місяця', 'Budget van de maand')) + '<div class="hv-en-saldo__rij">' +
      boog({ deel: besteed / budget, schaduw: prognose / budget, streep: 1, toon: prognose > budget ? 'warm' : 'net-in', midden: h(HV.euro(besteed, 0)), label: t('з ', 'van ') + HV.euro(budget, 0), aria: t('Витрачено ', 'Besteed ') + HV.euro(besteed, 0) + t(' з бюджету ', ' van het budget ') + HV.euro(budget, 0) }) +
      '<div class="hv-en-budget__tekst">' + o.getal({ maat: 'm', label: t('Прогноз на місяць', 'Verwachting voor de maand'), waarde: ong(euro(prognose, 0)), sub: h(prognose > budget ? t('вище бюджету', 'boven het budget') : t('у межах бюджету', 'binnen het budget')) }) +
      '<p class="hv-en-tekst is-zacht">' + h(t('Аванс', 'Termijnbedrag')) + orig('termijnbedrag') + h(t(' € 115 на місяць (приклад). Тінь дуги — прогноз, риска — бюджет.', ' € 115 per maand (voorbeeld). De schaduw van de boog is de verwachting, het streepje het budget.')) + '</p></div></div>', 'en-budget');
    return '<div class="hv-en" data-k="en-rapporten"><div class="hv-en-rooster hv-en-rooster--gelijk"><div class="hv-en-breed">' + bron + '</div><div class="hv-en-kolom">' + na + '</div><div class="hv-en-kolom">' + verbruikers + budgetKaart + '</div></div></div>';
  }

  // ───────────────────────── Registratie: scherm en tabbladen ─────────────────────────
  HV.scherm({
    id: 'energie', sectie: 'energie', titel: ['Енергія', 'Energie'], icoon: 'zap', adres: '/energie',
    tabs: [
      { id: 'nu', titel: ['Зараз', 'Nu'], adres: '/energie', render: tabNu },
      { id: 'tarief', titel: ['Тариф', 'Tarief'], adres: '/energie/tarief', render: tabTarief },
      { id: 'zon', titel: ['Сонце й батарея', 'Zon en batterij'], adres: '/energie/zon', render: tabZon },
      { id: 'laden', titel: ['Зарядка', 'Laden'], adres: '/energie/laden', render: tabLaden },
      { id: 'warmte', titel: ['Тепло', 'Warmte'], adres: '/energie/warmte', render: tabWarmte },
      { id: 'rapporten', titel: ['Звіти', 'Rapporten'], adres: '/energie/rapporten', render: tabRapporten }
    ]
  });

  // ───────────────────────── Bladen van apparaten ─────────────────────────
  function p1Blad(ctx, a) {
    var w = ctx.staat, e = w.energie, van = w.tijd - 6 * UUR;
    var gemeten = reeks.filter(function (x) { return x.t >= van; }).map(function (x) { return [x.t, x.net]; });
    var schat = [];
    var grens = gemeten.length ? gemeten[0][0] : w.tijd;
    for (var x = van; x <= grens; x += 15 * 60000) schat.push([x, huisKw(x) + (HV.uur(x) >= 2 && HV.uur(x) < 4 ? 7.4 : 0) - zonKw(x, w.weer.bewolking, false)]);
    if (schat.length < 2) schat.push([grens, e.net]);
    var reeksen = [{ naam: t('Оцінка до потоку', 'Schatting vóór de stroom'), toon: 'neutraal', geschat: true, punten: schat }];
    if (gemeten.length > 1) reeksen.push({ naam: t('Виміряно', 'Gemeten'), toon: 'net-in', punten: gemeten });
    var hoofd = '<div class="hv-bediening__hoofd">' + o.schakel({ aan: e.net > 0, icoon: 'gauge', toon: e.net >= 0 ? 'net-in' : 'net-uit', aria: HV.p(a.naam) }) +
      '<div><p class="hv-bediening__woord">' + h(e.net >= 0.05 ? t('беремо з мережі', 'afname van het net') : e.net <= -0.05 ? t('віддаємо в мережу', 'teruglevering') : t('у нулі', 'op nul')) + '</p><p class="hv-bediening__getal">' + HV.maat(Math.abs(e.net), kW(), 2) + '</p></div></div>';
    var standen = '<div class="hv-rijen">' + o.rij({ icoon: 'arrow-down-left', naam: t('Спожито, тариф 1 (ніч)', 'Afname, tarief 1 (dal)'), waarde: HV.maat(8412.6 + e.vandaagIn * 0.4, kWh(), 1) }) +
      o.rij({ icoon: 'arrow-down-left', naam: t('Спожито, тариф 2 (день)', 'Afname, tarief 2 (normaal)'), waarde: HV.maat(7105.3 + e.vandaagIn * 0.6, kWh(), 1) }) +
      o.rij({ icoon: 'arrow-up-right', naam: t('Віддано, тариф 1', 'Teruglevering, tarief 1'), waarde: HV.maat(1290.4 + e.vandaagUit * 0.2, kWh(), 1) }) +
      o.rij({ icoon: 'arrow-up-right', naam: t('Віддано, тариф 2', 'Teruglevering, tarief 2'), waarde: HV.maat(3876.9 + e.vandaagUit * 0.8, kWh(), 1) }) +
      o.rij({ icoon: 'flame', naam: t('Газ', 'Gas'), waarde: HV.maat(2140.37, t('м³', 'm³'), 2) }) + '</div>';
    return o.kaart({ inhoud: hoofd + fasenHtml(w, true) }) +
      o.kaart({ titel: t('Покази лічильника', 'Meterstanden'), inhoud: standen + o.stempel({ waarde: h(t('протокол P1 · раз на 1 с', 'P1-protocol · elke 1 s')), leeftijd: HV.kijk.leeftijd(a), bron: t('Симулятор', 'Simulator') }) }) +
      o.kaart({ inhoud: HV.grafiek.lijn({ id: 'en-p1', titel: t('Сальдо, 6 годин', 'Saldo, 6 uur'), eenheid: kW(), hoogte: 130, nu: w.tijd, x: { min: van, max: w.tijd, tikken: [0, 2, 4, 6].map(function (u) { return { x: van + u * UUR, label: HV.tijd(van + u * UUR) }; }), format: HV.tijd }, reeksen: reeksen, samenvatting: t('Вище нуля — беремо, нижче — віддаємо. Пунктир — оцінка за моделлю дому до початку потоку.', 'Boven nul afname, onder nul teruglevering. Gestippeld: schatting uit het huismodel van vóór de stroom.') }) }) +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Фази', 'Fasen'), icoon: 'gauge', actie: 'blad', gegevens: { blad: 'fasen' } }) + o.knop({ tekst: t('Стан джерел', 'Staat van bronnen'), icoon: 'cable', actie: 'blad', gegevens: { blad: 'bronnen' } }) + o.knop({ tekst: t('Перевірити знак', 'Teken controleren'), icoon: 'arrow-left-right', soort: 'stil', actie: 'en-teken' }) + '</div>';
  }
  HV.blad({ soort: 'p1meter', past: function (a) { return a.soort === 'p1meter'; }, delen: { bediening: p1Blad } });

  function zonBlad(ctx, a) {
    var w = ctx.staat, st = a.st;
    var hoofd = '<div class="hv-bediening__hoofd">' + o.schakel({ aan: st.vermogen > 0.05, icoon: 'sun', toon: 'zon', aria: HV.p(a.naam) }) +
      '<div><p class="hv-bediening__woord">' + h(st.vermogen > 0.05 ? t('виробляє', 'wekt op') : t('не виробляє', 'wekt niet op')) + '</p><p class="hv-bediening__getal">' + HV.maat(st.vermogen, kW(), 2) + ' <span class="hv-naar">/</span> ' + HV.maat(a.piek, kW(), 1) + '</p></div></div>';
    var strings = '<div class="hv-rijen">' + o.rij({ icoon: 'sun', naam: t('Рядок А · південь, 8 панелей', 'String A · zuid, 8 panelen'), waarde: HV.maat(st.vermogen * 0.62, kW(), 2) }) +
      o.rij({ icoon: 'sun-dim', naam: t('Рядок Б · захід, 6 панелей', 'String B · west, 6 panelen'), waarde: HV.maat(st.vermogen * 0.38, kW(), 2) }) +
      o.rij({ icoon: 'thermometer', naam: t('Інвертор', 'Omvormer'), waarde: HV.maat(24 + st.vermogen * 6, '°C', 0) }) + '</div>';
    var begr = veld(t('Обмеження віддачі', 'Begrenzing van de teruglevering'), o.segment({ label: t('Обмеження віддачі', 'Begrenzing van de teruglevering'), waarde: HV.gewenst(a, 'modus') || 'vrij', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, k: 'zp-begrens', opties: [{ id: 'vrij', label: t('Без обмеження', 'Onbegrensd') }, { id: 'begrensd', label: t('До 0 кВт', 'Tot 0 kW'), icoon: 'triangle' }] }),
      ' ' + o.risico('gevaarlijk') + ' ' + o.gevolg(HV.p(HV.gevaar.actie('zonnepanelen.begrenzen').gevolg), { kop: t('Обмежити віддачу', 'Teruglevering begrenzen') }));
    return o.kaart({ inhoud: hoofd + begr }) + o.kaart({ inhoud: zonGrafiek(w, 'en-zonblad', 130) }) + o.kaart({ titel: t('Рядки й інвертор', 'Strings en omvormer'), inhoud: strings });
  }
  HV.blad({ soort: 'zonnepanelen', past: function (a) { return a.soort === 'zonnepanelen'; }, delen: { bediening: zonBlad } });

  HV.blad({ soort: 'thuisbatterij', past: function (a) { return a.soort === 'thuisbatterij'; }, delen: { bediening: function (ctx) { return batterijKaart(ctx, true); } } });

  HV.blad({ soort: 'laadpaal', past: function (a) { return a.soort === 'laadpaal'; }, delen: { bediening: function (ctx) { return o.kaart({ inhoud: stationHtml(ctx) }) + o.kaart({ titel: t('План зарядки', 'Laadplan'), inhoud: o.laadplan(ctx) }); } } });

  // ───────────────────────── Vrije bladen ─────────────────────────
  HV.blad({ soort: 'laadplan', vrij: true, icoon: 'calendar-clock', titel: ['План зарядки · станція «Під’їзд»', 'Laadplan · laadpaal ‘Oprit’'],
    sub: function (ctx) { var li = laadInfo(ctx.staat); return laadStaat(ctx.staat, li).woord + ' · ' + Math.round(li.ev.lading) + ' % → ' + li.doel + ' %'; },
    render: function (ctx) { return o.kaart({ inhoud: o.laadplan(ctx) }); } });

  HV.blad({ soort: 'fasen', vrij: true, icoon: 'gauge', titel: ['Фази', 'Fasen'],
    sub: function (ctx) { return t('струм L1–L3 і напруга', 'stroom L1–L3 en spanning'); },
    render: function (ctx) {
      return o.kaart({ inhoud: fasenHtml(ctx.staat, true) }) +
        o.kaart({ inhoud: '<p class="hv-tekst">' + HV.icoon('shield-check', { maat: 's' }) + '<span>' + h(t('Хаб не захищає запобіжник: показ лічильника надходить раз на 1–10 с, команда йде довше. Захищають автомат у щитку й обмеження струму на станції.', 'De hub beveiligt de hoofdzekering niet: de meter meldt elke 1–10 s, een opdracht duurt langer. Dat doen de groepenkast en de stroomgrens van de laadpaal.')) + '</span></p>' +
          '<p class="hv-tekst hv-tekst--zacht">' + h(t('Ціль оптимізатора 20 А розводить навантаження в часі; напруга в нормі 207–253 В.', 'Het doel van 20 A spreidt de belasting in de tijd; de spanning hoort tussen 207 en 253 V.')) + '</p>' }) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Оптимізатор', 'Optimalisatie'), icoon: 'gauge', actie: 'blad', gegevens: { blad: 'optimalisatie' } }) + o.knop({ tekst: t('Лічильник', 'Meter'), icoon: 'cable', actie: 'blad', gegevens: { blad: 'apparaat:p1meter' } }) + '</div>';
    } });

  var OPT_ACTIES = ['laadpaal.laden', 'laadpaal.modus', 'thuisbatterij.modus', 'thuisbatterij.diep', 'boiler', 'warmtepomp.modus', 'warmtepomp.uit', 'programma.start', 'zonnepanelen.begrenzen'];
  HV.blad({ soort: 'optimalisatie', vrij: true, icoon: 'gauge', titel: ['Оптимізація', 'Optimalisatie'],
    sub: function (ctx) { return ctx.staat.zelfGestopt ? t('самостійні дії зупинено', 'zelfstandige acties gestopt') : t('планує й радить; дозволи — ваші', 'plant en adviseert; de toestemmingen zijn van jou'); },
    render: function (ctx) {
      var w = ctx.staat;
      var besluiten = w.logboek.filter(function (r) { return r.maker && r.maker.soort === 'optimalisatie'; }).slice(0, 8);
      var openId = HV.ui.lees('bericht', null);
      return o.kaart({ inhoud: '<p class="hv-tekst">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Оптимізатор планує зарядку, батарею, гарячу воду й техніку на дешеві години. Для кожної дії ви обираєте: «Вимкнено» — нічого не робить; «Питати» — подає план на схвалення; «Завжди» — виконує сам і пише в Журнал.', 'De optimalisatie plant laden, batterij, warm water en apparaten op goedkope uren. Per actie kies je: ‘Uit’ — doet niets; ‘Vragen’ — legt het plan ter goedkeuring voor; ‘Altijd’ — voert zelf uit en schrijft in het logboek.')) + '</span></p>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Перерахувати й діяти зараз', 'Nu doorrekenen en handelen'), icoon: 'refresh-cw', soort: 'hoofd', actie: 'en-opt-nu' }) +
        o.knop({ tekst: w.zelfGestopt ? t('Відновити самостійні дії', 'Zelfstandige acties hervatten') : t('Зупинити самостійні дії', 'Zelfstandige acties stoppen'), icoon: w.zelfGestopt ? 'play' : 'pause', actie: 'zelfstop', gegevens: { stop: w.zelfGestopt ? '' : '1' } }) + '</div>' }) +
        o.kaart({ titel: t('Дозволи оптимізатора', 'Toestemmingen van de optimalisatie'), extra: o.gevolg(t('Що станеться: «Завжди» дає оптимізаторові діяти без запиту в межах обмежень. Пов’язано з: кожна зміна дозволу й кожна дія — запис у Журналі; агенти цих дозволів не змінюють. Як повернути: оберіть «Вимкнено» тут або в реєстрі.', 'Wat er gebeurt: ‘Altijd’ laat de optimalisatie zonder vragen handelen binnen de begrenzingen. Hangt samen met: elke wijziging en elke actie komt in het logboek; agenten wijzigen deze toestemmingen niet. Terugdraaien: kies ‘Uit’ hier of in het register.'), { kop: t('Дозволи', 'Toestemmingen') }),
          inhoud: OPT_ACTIES.map(function (s) { return o.stand({ uitvoerder: 'optimalisatie', actie: HV.gevaar.actie(s), rol: ctx.rol }); }).join('') + '<div class="hv-knoppen">' + o.knop({ tekst: t('Показати в реєстрі', 'In register tonen'), icoon: 'list', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-risico' } }) + '</div>' }) +
        o.kaart({ titel: t('Цілі й обмеження', 'Doelen en begrenzingen'), inhoud: '<div class="hv-rijen">' +
          o.rij({ icoon: 'gauge', naam: t('Ціль струму фази', 'Doel voor de fasestroom'), waarde: h(DOEL_A + t(' А з ', ' A van ') + MAX_A) }) +
          o.rij({ icoon: 'battery-low', naam: t('Найменший заряд батареї', 'Laagste lading van de batterij'), waarde: HV.maat(reserveVan(w.apparaten.thuisbatterij.st), '%'), actie: 'blad', gegevens: { blad: 'apparaat:thuisbatterij' } }) +
          o.rij({ icoon: 'refrigerator', naam: t('Не чіпати: холодильник, сховище, маршрутизатор', 'Niet aanraken: koelkast, opslag, router'), waarde: h(t('недоторканні', 'onaantastbaar')) }) +
          o.rij({ icoon: 'sun', naam: t('Надлишок сонця: батарея → авто → бойлер → мережа', 'Overschot van de zon: batterij → auto → boiler → net') }) + '</div>' }) +
        o.kaart({ titel: t('Рішення й заощадження', 'Besluiten en besparing'), inhoud: '<p class="hv-en-planregel">' + HV.icoon('piggy-bank', { maat: 's' }) + '<span>' + h(t('За листопад ', 'In november ')) + ong(euro(14.2)) + h(t(' завдяки зсуву в дешеві години.', ' door te verschuiven naar goedkope uren.')) + '</span></p>' +
          (besluiten.length ? '<ul class="hv-berichten">' + besluiten.map(function (r) { return o.bericht(r, { open: openId === r.id }); }).join('') + '</ul>' : o.leeg({ icoon: 'history', titel: t('Ще немає рішень', 'Nog geen besluiten'), tekst: t('Кожна дія чи відмова оптимізатора з’явиться тут.', 'Elke actie of weigering van de optimalisatie komt hier.') })) });
    } });

  HV.blad({ soort: 'uur', vrij: true, icoon: 'receipt', titel: ['Склад ціни', 'Prijsopbouw'],
    sub: function (ctx, id) { var w = ctx.staat, v = venster(w), x = v[klem(Number(id) || 0, 0, v.length - 1)]; return dagWoord(w, x.tijd) + ' ' + HV.tijd(x.tijd) + '–' + HV.tijd(x.tijd + UUR); },
    render: function (ctx, id) {
      var w = ctx.staat, v = venster(w), i = klem(Number(id) || 0, 0, v.length - 1), x = v[i], q = kwartielen(v);
      var b = beurs(x.prijs), btw = (b + OPSLAG + BELASTING) * BTW;
      var stappen = [[t('Біржова ціна години', 'Beursprijs van het uur'), b], [t('Націнка постачальника', 'Inkoopvergoeding'), OPSLAG], [t('Податок на енергію', 'Energiebelasting'), BELASTING], [t('ПДВ 21 %', 'Btw 21 %'), btw]];
      var som0 = 0, punten = [0].concat(stappen.map(function (s1) { som0 += s1[1]; return som0; }));
      var lo = Math.min.apply(null, punten.concat([x.prijs])), hi = Math.max.apply(null, punten.concat([x.prijs]));
      if (hi - lo < 0.01) hi = lo + 0.01;
      var X = function (v1) { return (v1 - lo) / (hi - lo) * 100; };
      var loop = 0;
      var rijen = stappen.map(function (s, k) {
        var van = loop, tot = loop + s[1]; loop = tot;
        return '<li data-k="op-' + k + '"><span class="hv-en-waterval__naam">' + h(s[0]) + '</span><span class="hv-en-waterval__spoor"><i class="' + (s[1] < 0 ? 'is-negatief' : '') + '" style="left:' + X(Math.min(van, tot)).toFixed(2) + '%;width:' + Math.max(0.6, Math.abs(X(tot) - X(van))).toFixed(2) + '%"></i></span><strong>' + h(HV.euro(s[1], 3)) + '</strong></li>';
      }).join('') + '<li class="is-totaal"><span class="hv-en-waterval__naam">' + h(t('Разом за кВт·год', 'Totaal per kWh')) + '</span><span class="hv-en-waterval__spoor"><i class="is-totaal" style="left:' + X(Math.min(0, x.prijs)).toFixed(2) + '%;width:' + Math.max(0.6, Math.abs(X(x.prijs) - X(0))).toFixed(2) + '%"></i></span><strong>' + euro(x.prijs, 3) + '</strong></li>';
      return o.kaart({ inhoud: '<div class="hv-en-prijsnu__rij"><span class="hv-en-prijsnu__getal">' + h(HV.euro(x.prijs)) + '</span>' + niveauChip(x.prijs, q) + '</div><ul class="hv-en-waterval">' + rijen + '</ul>' +
        '<p class="hv-grafiek__zin">' + h(x.prijs < 0 ? t('Біржова ціна така низька, що навіть із податками ви отримуєте гроші за спожите.', 'De beursprijs is zo laag dat je zelfs met belastingen geld krijgt voor wat je verbruikt.') : t('Податки й ПДВ — більша частина ціни; біржа визначає різницю між годинами.', 'Belastingen en btw zijn het grootste deel van de prijs; de beurs bepaalt het verschil tussen de uren.')) + '</p>' }) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Попередня', 'Vorige'), icoon: 'chevron-left', actie: 'blad', gegevens: { blad: 'uur:' + Math.max(0, i - 1) } }) + o.knop({ tekst: t('Наступна', 'Volgende'), icoon: 'chevron-right', actie: 'blad', gegevens: { blad: 'uur:' + Math.min(v.length - 1, i + 1) } }) + o.knop({ tekst: t('Довідник ставок', 'Tarieven en heffingen'), icoon: 'list', soort: 'stil', actie: 'blad', gegevens: { blad: 'tarieven' } }) + '</div>';
    } });

  HV.blad({ soort: 'tarieven', vrij: true, icoon: 'list', titel: ['Довідник ставок', 'Tarieven en heffingen'],
    sub: function () { return t('перевірено 01.11.2026 · Олена', 'gecontroleerd 01-11-2026 · Olena'); },
    render: function (ctx) {
      var rij = function (naam, waarde, sub) { return o.rij({ naam: naam, sub: sub, waarde: waarde }); };
      return o.kaart({ inhoud: '<div class="hv-rijen">' + rij(t('Податок на енергію', 'Energiebelasting'), euro(BELASTING, 4), t('чинна з 01.01.2026 · Податкова служба', 'geldig vanaf 01-01-2026 · Belastingdienst')) +
        rij(t('Націнка постачальника', 'Inkoopvergoeding'), euro(OPSLAG, 3), t('договір, динамічний тариф', 'contract, dynamisch tarief')) + rij(t('ПДВ', 'Btw'), h('21 %'), t('чинна з 01.01.2019', 'geldig vanaf 01-01-2019')) +
        rij(t('Плата за віддачу', 'Terugleverkosten'), euro(TERUGLEVERKOSTEN, 3), t('за кВт·год віддачі', 'per kWh teruglevering')) + rij(t('Плата за віддане з 2027', 'Terugleververgoeding vanaf 2027'), euro(VERGOEDING, 3), t('оцінка постачальника', 'schatting van de leverancier')) +
        rij(t('Сталі платежі мережі', 'Vaste netbeheerkosten'), euro(1.18, 2), t('за добу', 'per dag')) + rij(t('Знижка на податок', 'Vermindering energiebelasting'), euro(-1.73, 2), t('за добу', 'per dag')) + '</div>' +
        '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('circle-check-big', { maat: 's' }) + '<span>' + h(t('Ставки перевірено 9 днів тому. Старші за 90 днів дають попередження біля сум.', 'Tarieven 9 dagen geleden gecontroleerd. Ouder dan 90 dagen geeft een waarschuwing bij bedragen.')) + '</span></p>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Позначити як перевірені', 'Als gecontroleerd markeren'), icoon: 'check', actie: 'en-tarieven' }) + '</div>' });
    } });

  HV.blad({ soort: 'bronnen', vrij: true, icoon: 'cable', titel: ['Стан джерел', 'Staat van bronnen'],
    sub: function (ctx) { return ctx.staat.gegevens === 'live' ? t('усе наживо', 'alles live') : t('є застарілі', 'deels verouderd'); },
    render: function (ctx) {
      var w = ctx.staat, A = w.apparaten;
      var rij = function (a, protocol, keten) { return o.rij({ icoon: HV.paspoort.soorten[a.soort].icoon, naam: HV.p(a.naam), sub: protocol + ' · ' + keten, waarde: o.stempel({ waarde: h(w.gegevens === 'live' ? HV.woord.live() : HV.woord.verouderd()), leeftijd: HV.kijk.leeftijd(a) }), k: 'bron-' + a.id }); };
      return o.kaart({ titel: t('Джерела Енергії', 'Bronnen van Energie'), inhoud: '<div class="hv-rijen">' +
        rij(A.p1meter, t('P1 через Wi-Fi', 'P1 via wifi'), t('лічильник → хаб → сайт', 'meter → hub → site')) + rij(A.zonnepanelen, 'Modbus', t('інвертор → хаб', 'omvormer → hub')) +
        rij(A.thuisbatterij, 'Modbus', t('батарея → хаб', 'batterij → hub')) + rij(A.laadpaal, 'OCPP', t('станція → хаб', 'laadpaal → hub')) + rij(A.warmtepomp, 'Modbus', t('насос → хаб', 'warmtepomp → hub')) + '</div>' +
        '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('flask-conical', { maat: 's' }) + '<span>' + h(t('У макеті всі джерела дає симулятор; ціни — таблиця на 48 годин.', 'In de maquette komen alle bronnen uit de simulator; de prijzen uit een tabel van 48 uur.')) + '</span></p>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Перевірити знак батареї', 'Teken van de batterij controleren'), icoon: 'arrow-left-right', actie: 'en-teken' }) + o.knop({ tekst: t('Інтеграції', 'Integraties'), icoon: 'cable', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-integraties' } }) + '</div>' });
    } });

  HV.blad({ soort: 'planblok', vrij: true, icoon: 'calendar-clock', titel: function (ctx, id) { var b = planBlokken(ctx.staat).filter(function (x) { return x.id === id; })[0]; return b ? HV.p(b.wat) : t('Запланований запуск', 'Geplande start'); },
    sub: function (ctx, id) { var w = ctx.staat, b = planBlokken(w).filter(function (x) { return x.id === id; })[0]; return b ? dagWoord(w, b.van) + ' ' + HV.tijd(b.van) + '–' + HV.tijd(b.tot) + ' · ' + HV.p(STATUS[b.status]) : ''; },
    render: function (ctx, id) {
      var w = ctx.staat, b = planBlokken(w).filter(function (x) { return x.id === id; })[0];
      if (!b) return o.leeg({ icoon: 'calendar-clock', titel: t('Такого запуску немає', 'Deze start bestaat niet'), actie: { tekst: t('До тарифу', 'Naar het tarief'), actie: 'ga', gegevens: { naar: 'energie-tarief' } } });
      var baan = BAAN[b.baan], open = b.status === 'gepland' || b.status === 'wacht' || b.status === 'schaduw';
      var info = '<div class="hv-getallen hv-getallen--eerst">' + o.getal({ maat: 'm', label: t('Коли', 'Wanneer'), waarde: h(HV.tijd(b.van) + '–' + HV.tijd(b.tot)), sub: h(dagWoord(w, b.van)) }) +
        o.getal({ maat: 'm', label: t('Енергія', 'Energie'), waarde: HV.maat(Math.abs(b.kwh), kWh(), 1), sub: h(b.kwh < 0 ? t('віддає в дім', 'levert aan het huis') : t('бере', 'neemt')) }) +
        o.getal({ maat: 'm', label: t('Середня ціна', 'Gemiddelde prijs'), waarde: euro(b.prijs) }) + o.getal({ maat: 'm', label: b.kwh < 0 ? t('Заощаджує', 'Bespaart') : t('Коштує', 'Kost'), waarde: ong(euro(Math.abs(b.kosten))) }) + '</div>';
      var status = '<p class="hv-en-planregel">' + HV.icoon(b.status === 'wacht' ? 'hourglass' : b.status === 'gedaan' ? 'circle-check-big' : 'calendar-clock', { maat: 's' }) + '<span>' + h(HV.p(STATUS[b.status]) + (b.verschoven ? ' · ' + t('перенесено вами', 'door jou verschoven') : '')) + '</span>' + o.maker(b.verschoven ? HV.mens() : OPT) + '</p>';
      var knoppen = '';
      if (open) {
        knoppen += o.knop({ tekst: t('Перенести на найдешевше', 'Naar het goedkoopste verschuiven'), icoon: 'arrow-down', actie: 'en-blok', gegevens: { blok: b.id, wat: 'schuif' } });
        if (b.status === 'wacht') knoppen += o.knop({ tekst: t('Схвалити', 'Goedkeuren'), icoon: 'check', soort: 'hoofd', actie: 'en-blok', gegevens: { blok: b.id, wat: 'ja' } });
        knoppen += o.knop({ tekst: t('Скасувати запуск', 'Start annuleren'), icoon: 'x', soort: 'stil', actie: 'en-blok', gegevens: { blok: b.id, wat: 'nee' } });
      }
      if (b.verschoven || b.geannuleerd) knoppen += o.knop({ tekst: t('Повернути план оптимізатора', 'Plan van de optimalisatie terugzetten'), icoon: 'undo-2', soort: 'stil', actie: 'en-blok', gegevens: { blok: b.id, wat: 'herstel' } });
      var nu = b.status !== 'gedaan' && b.status !== 'bezig' ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Запустити зараз', 'Nu starten'), icoon: 'play', actie: 'en-blok', gegevens: { blok: b.id, wat: 'nu' } }) + o.gevolg(t('Що станеться: пристрій почне зараз за поточною ціною, план цього блока знято. Пов’язано з: оптимізатор перерахує решту доби. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: het apparaat start nu tegen de huidige prijs, het plan voor dit blok vervalt. Hangt samen met: de optimalisatie rekent de rest van de dag opnieuw. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'), { kop: t('Запустити зараз', 'Nu starten') }) + '</div>' : '';
      return o.kaart({ inhoud: info + status + (knoppen ? '<div class="hv-knoppen">' + knoppen + '</div>' : '') + nu }) +
        o.kaart({ titel: t('Дозвіл оптимізатора', 'Toestemming van de optimalisatie'), inhoud: o.stand({ uitvoerder: 'optimalisatie', actie: HV.gevaar.actie(baan.sleutel), rol: ctx.rol }) });
    } });

  // ───────────────────────── Acties ─────────────────────────
  HV.actie('en-uur', function (ctx, g) {
    var w = HV.staat.w, v = venster(w), i = klem(Math.round(Number(g.waarde)), 0, v.length - 1);
    if (g.fase === 'sleep') {
      var el = document.getElementById('en-cursor-tekst');
      if (el) el.innerHTML = cursorTekst(w, v, i);
      return;
    }
    HV.ui.zet('en-uur', i);
  });
  HV.actie('en-uur-stap', function (ctx, g) {
    var w = HV.staat.w, v = venster(w);
    HV.ui.zet('en-uur', klem(Number(HV.ui.lees('en-uur', nuIndex(w, v))) + Number(g.richting), 0, v.length - 1));
  });
  HV.actie('en-laaddoel', function (ctx, g) {
    if (g.fase !== 'klaar') return;
    HV.doe({ doel: 'laadpaal', mogelijkheid: 'laaddoel', waarde: Math.round(Number(g.waarde)) + ' %' });
  });
  HV.actie('en-vertrek', function (ctx, g) {
    var w = HV.staat.w, st = w.apparaten.laadpaal.st;
    var m = (tijdNaar(st.vertrek || '07:30') / 60000 + Number(g.richting) * (Number(g.stap) || 30) + 1440) % 1440;
    HV.doe({ doel: 'laadpaal', mogelijkheid: 'vertrek', waarde: hhmm(m * 60000) });
  });
  HV.actie('en-laad', function (ctx, g) {
    var aan = !!g.aan;
    HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: aan, waarom: aan ? ['зарядити зараз, поза планом', 'nu laden, buiten het plan'] : ['зупинено вручну', 'handmatig gestopt'] });
  });
  HV.actie('en-opt-laad', function () {
    HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, door: OPT, waarom: ['план зарядки, на прохання людини', 'laadplan, op verzoek van de bewoner'] });
  });
  HV.actie('en-reserve', function (ctx, g) {
    var a = HV.staat.apparaat('thuisbatterij');
    var nu = reserveVan(a.wacht && a.wacht.mogelijkheid === 'reserve' ? { reserve: a.wacht.waarde } : a.st);
    var nieuw = klem(nu + Number(g.richting) * (Number(g.stap) || 5), 0, 60);
    if (nieuw !== nu) HV.doe({ doel: 'thuisbatterij', mogelijkheid: 'reserve', waarde: nieuw + ' %', waarom: ['резерв на відключення', 'reserve voor een stroomstoring'] });
  });
  HV.actie('en-legionella', function () {
    HV.doe({ doel: 'boiler', mogelijkheid: 'doel', waarde: 60, waarom: ['прогрів від легіонели', 'opwarmen tegen legionella'] });
  });
  HV.actie('en-aandeel', function (ctx, g) { if (g.fase === 'klaar') HV.ui.zet('en-aandeel', Math.round(Number(g.waarde))); });
  /** Оптимізатор діє зараз: одна наступна дія за ціною й станом — через ворота HV.doe (дозвіл вирішує). */
  HV.actie('en-opt-nu', function () {
    var w = HV.staat.w, v = venster(w), q = kwartielen(v), p = HV.tarief.prijs(w.tijd), li = laadInfo(w), A = w.apparaten;
    var stap;
    if (p < 0 && !A.boiler.st.aan) stap = { doel: 'boiler', mogelijkheid: 'aan', waarde: true, waarom: ['від’ємна ціна', 'negatieve prijs'] };
    else if (li.plan && w.tijd >= li.plan.van && w.tijd < li.plan.tot && !A.laadpaal.st.laadt) stap = { doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, waarom: ['дешеве вікно плану зарядки', 'goedkoop venster van het laadplan'] };
    else if (p >= q.q3 && A.thuisbatterij.st.modus !== 'slim') stap = { doel: 'thuisbatterij', mogelijkheid: 'modus', waarde: 'slim', waarom: ['дорога година: батарея живить дім', 'duur uur: de batterij voedt het huis'] };
    else if (p <= q.q1 && A.thuisbatterij.st.modus !== 'snel' && A.thuisbatterij.st.lading < 90) stap = { doel: 'thuisbatterij', mogelijkheid: 'modus', waarde: 'snel', waarom: ['дешева година: заряд батареї', 'goedkoop uur: batterij laden'] };
    else stap = { doel: 'thuisbatterij', mogelijkheid: 'modus', waarde: A.thuisbatterij.st.modus === 'slim' ? 'pauze' : 'slim', waarom: ['звичайна ціна: батарею зберегти на вечір', 'normale prijs: de batterij sparen voor de avond'] };
    stap.door = OPT;
    HV.doe(stap);
  });
  HV.actie('en-teken', function () {
    var mens = HV.mens();
    HV.logboek.voegToe({ maker: mens, wat: ['Знак батареї перевірено: правильний', 'Teken van de batterij gecontroleerd: klopt'], waarom: ['баланс сходиться з точністю 0,02 кВт', 'de balans klopt op 0,02 kW'], soort: 'huis.energie', doel: 'thuisbatterij' });
    HV.meld({ maker: mens, icoon: 'arrow-left-right', titel: t('Знак батареї правильний', 'Teken van de batterij klopt'), tekst: t('Сонце + мережа + батарея = дім: баланс сходиться.', 'Zon + net + batterij = huis: de balans klopt.') });
    HV.staat.wijzig();
  });
  HV.actie('en-tarieven', function () {
    var mens = HV.mens();
    HV.logboek.voegToe({ maker: mens, wat: ['Ставки енергії позначено як перевірені', 'Energietarieven als gecontroleerd gemarkeerd'], soort: 'huis.energie' });
    HV.meld({ maker: mens, icoon: 'check', titel: t('Ставки перевірено', 'Tarieven gecontroleerd'), tekst: t('Дата перевірки: сьогодні.', 'Datum van controle: vandaag.') });
    HV.staat.wijzig();
  });
  HV.actie('en-export', function (ctx, g) {
    var w = HV.staat.w, r = rapport(w, g.periode || 'week', 1, 1);
    var regels = [['periode', 'van_net_kwh', 'eigen_zon_kwh', 'uit_batterij_kwh', 'naar_net_kwh']].concat(r.rijen.map(function (x) { return [x.label, x.netIn.toFixed(2), x.zon.toFixed(2), x.bat.toFixed(2), x.uit.toFixed(2)]; }));
    var csv = regels.map(function (x) { return x.join(';'); }).join('\n');
    try {
      var blob = new Blob([csv], { type: 'text/csv' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'energie-' + (g.periode || 'week') + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) { /* без завантаження — запис у Журналі все одно є */ }
    var mens = HV.mens();
    HV.logboek.voegToe({ maker: mens, wat: ['Звіт енергії вивантажено (CSV)', 'Energierapport geëxporteerd (CSV)'], waarom: [r.rijen.length + ' рядків', r.rijen.length + ' regels'], soort: 'huis.energie' });
    HV.meld({ maker: mens, icoon: 'download', titel: t('Звіт вивантажено', 'Rapport geëxporteerd'), tekst: t('Файл CSV: ', 'CSV-bestand: ') + r.rijen.length + t(' рядків', ' regels') });
    HV.staat.wijzig();
  });
  /** Блок порядку доби: перенести, схвалити, скасувати, повернути план або запустити зараз (команда пристрою — через HV.doe). */
  HV.actie('en-blok', function (ctx, g) {
    var w = HV.staat.w, b = planBlokken(w).filter(function (x) { return x.id === g.blok; })[0];
    if (!b) return;
    var mens = HV.mens(), eigen = plan(w).blokken, voor = eigen[b.id] ? JSON.parse(JSON.stringify(eigen[b.id])) : null;
    var zet = function (nieuw, wat, was, werd) {
      HV.staat.wijzig(function (x) { var p = plan(x).blokken; if (nieuw) p[b.id] = nieuw; else delete p[b.id]; });
      var regel = HV.logboek.voegToe({ maker: mens, wat: wat, was: was, werd: werd, soort: 'huis.energie' });
      HV.meld({ maker: mens, icoon: 'calendar-clock', titel: HV.p(wat), tekst: was && werd ? HV.p(was) + ' → ' + HV.p(werd) : '', terug: function () {
        HV.staat.wijzig(function (x) { var p = plan(x).blokken; if (voor) p[b.id] = voor; else delete p[b.id]; });
        HV.logboek.voegToe({ maker: mens, wat: ['Повернуто: ' + regel.wat[0], 'Ongedaan gemaakt: ' + regel.wat[1]], soort: 'huis.energie' });
      } });
    };
    var tijdTekst = function (van, tot) { var s = HV.tijd(van) + '–' + HV.tijd(tot); return [s, s]; };
    if (g.wat === 'schuif') {
      var lengte = b.tot - b.van, beste = null;
      for (var s = uurVan(Math.max(w.tijd + UUR, b.van - 12 * UUR)); s <= b.van + 12 * UUR; s += UUR) {
        var som = 0; for (var u = s; u < s + lengte; u += UUR) som += HV.tarief.prijs(u);
        if (!beste || som < beste.som - 1e-9) beste = { van: s, som: som };
      }
      if (!beste || beste.van === b.van) { HV.meld({ icoon: 'check', titel: t('Уже найдешевше', 'Al het goedkoopst'), tekst: HV.p(b.wat) }); return; }
      zet({ van: beste.van, tot: beste.van + lengte, goedgekeurd: !!(voor && voor.goedgekeurd) }, ['Перенесено: ' + b.wat[0], 'Verschoven: ' + b.wat[1]], tijdTekst(b.van, b.tot), tijdTekst(beste.van, beste.van + lengte));
    } else if (g.wat === 'ja') {
      var x1 = voor || {}; x1.goedgekeurd = true;
      zet(x1, ['Схвалено план: ' + b.wat[0], 'Plan goedgekeurd: ' + b.wat[1]], ['очікує', 'wacht'], ['схвалено', 'goedgekeurd']);
    } else if (g.wat === 'nee') {
      var x2 = voor || {}; x2.geannuleerd = true;
      zet(x2, ['Скасовано запуск: ' + b.wat[0], 'Start geannuleerd: ' + b.wat[1]], STATUS[b.status], STATUS.geannuleerd);
    } else if (g.wat === 'herstel') {
      zet(null, ['Повернуто план оптимізатора: ' + b.wat[0], 'Plan van de optimalisatie terug: ' + b.wat[1]], null, null);
    } else if (g.wat === 'nu') {
      var cmd = { batterij: { doel: 'thuisbatterij', mogelijkheid: 'modus', waarde: b.kwh < 0 ? 'slim' : 'snel' }, auto: { doel: 'laadpaal', mogelijkheid: 'laden', waarde: true }, water: { doel: 'boiler', mogelijkheid: 'aan', waarde: true },
        techniek: { doel: b.apparaat || 'vaatwasser', mogelijkheid: 'programma', waarde: 'start' }, warmte: { doel: 'warmtepomp', mogelijkheid: 'modus', waarde: 'verwarmen' } }[b.baan];
      cmd.waarom = ['запуск зараз замість плану', 'nu starten in plaats van het plan'];
      HV.doe(cmd).then(function (r) { if (r && r.ok) HV.staat.wijzig(function (x) { var p = plan(x).blokken; p[b.id] = p[b.id] || {}; p[b.id].geannuleerd = true; }); });
    }
  });
})(window.HV = window.HV || {});
