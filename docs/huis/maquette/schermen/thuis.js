// Thuis / Дім — еталонний екран: небо, речення дому зі спостережених фактів, чипи, розріз, «Зараз важливо», сцени,
// обране, кімнати поверху, зведення енергії, безпеки й гаража, стрічка доби. Адреса на справжньому сайті: /overzicht.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  // знаки режимів дому (§6, maten.gedrag.huisstandTeken): «Ніч» — BedDouble, бо Moon — це фаза неба
  var STAND_ICOON = { thuis: 'house', afwezig: 'log-out', nacht: 'bed-double', vakantie: 'luggage', gasten: 'users' };
  var IN_KAMERS_UK = ['', 'в одній кімнаті', 'у двох кімнатах', 'у трьох кімнатах', 'у чотирьох кімнатах', 'у п’яти кімнатах', 'у шести кімнатах', 'у семи кімнатах', 'у восьми кімнатах', 'у дев’яти кімнатах', 'у десяти кімнатах'];
  var IN_KAMERS_NL = ['', 'in één kamer', 'in twee kamers', 'in drie kamers', 'in vier kamers', 'in vijf kamers', 'in zes kamers', 'in zeven kamers', 'in acht kamers', 'in negen kamers', 'in tien kamers'];
  var link = function (naar, tekst, blad) { return '<span role="link" tabindex="0" class="hv-zinlink" data-actie="' + (blad ? 'blad' : 'ga') + '" ' + (blad ? 'data-blad="' : 'data-naar="') + h(naar) + '">' + h(tekst) + '</span>'; };

  /** Спостережені факти для речення дому. Лише свіже й підтверджене. */
  function feiten(w) {
    var A = w.apparaten, f = {};
    f.kamers = HV.kijk.kamersMetLicht().length;
    f.thuis = HV.kijk.thuis().length;
    f.slot = A.voordeurslot.beschikbaar === 'ok' ? A.voordeurslot.st.vergrendeld : null;
    f.open = HV.kijk.open();
    f.poortOpen = A.garagedeur.st.open || A.poort.st.open;
    var lp = A.laadpaal.st, ev = w.voertuigen[0];
    if (lp.laadt && lp.vermogen > 0) f.laadtTot = w.tijd + Math.max(0, (ev.doel - ev.lading) / 100 * ev.capaciteit / lp.vermogen) * 3600000;
    var was = ['wasmachine', 'vaatwasser', 'droger'].map(function (id) { return A[id]; }).filter(function (a) { return a.st.loopt; })[0];
    if (was) f.was = was;
    f.export = w.energie.net < -0.1 ? -w.energie.net : 0;
    f.verwarmt = A.thermostaat.st.verwarmt;
    f.alarm = A.alarm.st.stand;
    return f;
  }

  /** Речення дому: { vol (HTML із посиланнями), kort (текст ≤ 36 знаків), toon:'rust'|'aandacht'|'oud' }. */
  function huiszin(ctx) {
    var w = ctx.staat, f = feiten(w), nl = ctx.taal === 'nl';
    if (w.gegevens === 'geen') {
      var sinds = HV.tijd(w.gegevensSinds || w.tijd);
      return { toon: 'oud', vol: h(t('Немає зв’язку з домом з ' + sinds + '. Показано останній знімок.', 'Geen verbinding met het huis sinds ' + sinds + '. Je ziet de laatste momentopname.')), kort: t('Немає зв’язку з ' + sinds + '.', 'Geen verbinding sinds ' + sinds + '.') };
    }
    if (w.gegevens === 'verouderd') {
      var om = HV.tijd(w.gegevensSinds || w.tijd);
      return { toon: 'oud', vol: h(t('О ' + om + ' було спокійно; частина даних застаріла.', 'Om ' + om + ' was het rustig; een deel van de gegevens is verouderd.')), kort: t('О ' + om + ' було спокійно.', 'Om ' + om + ' was het rustig.') };
    }
    var delen = [], uitzondering = null, kort;
    // 1. найважливіший виняток: відчинене надто довго
    var raam = f.open.filter(function (x) { return x.minuten >= 10; })[0];
    if (raam) {
      var kamer = HV.staat.kamer(raam.apparaat.kamer), wat = raam.apparaat.raam ? t('вікно', 'het raam') : t('двері', 'de deur');
      var duur = HV.duur(raam.minuten);
      uitzondering = nl
        ? link('kamers-kamer-' + kamer.id, kamer.waar[1].charAt(0).toUpperCase() + kamer.waar[1].slice(1)) + ' staat ' + h(wat) + ' ' + h(duur) + ' open' + (f.verwarmt ? ' terwijl de verwarming aan is' : '') + '.'
        : link('kamers-kamer-' + kamer.id, kamer.waar[0].charAt(0).toUpperCase() + kamer.waar[0].slice(1)) + ' відчинено ' + h(wat) + ' ' + h(duur) + (f.verwarmt ? ', а опалення гріє' : '') + '.';
      kort = nl ? kamer.naam[1] + ': ' + (raam.apparaat.raam ? 'raam' : 'deur') + ' ' + duur + ' open' : kamer.naam[0] + ': ' + wat + ' відчинено ' + duur;
    } else if (f.poortOpen) {
      uitzondering = link('apparaat:garagedeur', t('Ворота гаража', 'De garagedeur'), true) + h(t(' відчинені.', ' staat open.'));
      kort = t('Ворота гаража відчинені.', 'De garagedeur staat open.');
    }
    // 2. світло
    // Посиланням стає лише іменна група («у трьох кімнатах», «двері», «авто»), а не ціле підрядне речення.
    var licht = f.kamers === 0 ? h(t('світло вимкнено', 'het licht is uit')) : h(t('світло ', 'licht aan ')) + link('kamers', f.kamers <= 10 ? (nl ? IN_KAMERS_NL : IN_KAMERS_UK)[f.kamers] : t('у багатьох кімнатах', 'in veel kamers'));
    // 3. двері й охорона
    var deur = f.slot === true ? (nl ? link('beveiliging', 'deuren') + ' op slot' : link('beveiliging', 'двері') + ' замкнено')
      : f.slot === false ? (nl ? 'de ' + link('beveiliging', 'deur') + ' is van het slot' : link('beveiliging', 'двері') + ' відімкнено') : null;
    // 4. найближча подія
    var straks = null;
    if (f.laadtTot) straks = nl ? 'de ' + link('energie-laden', 'auto') + ' laadt tot ' + HV.tijd(f.laadtTot) : link('energie-laden', 'авто') + ' заряджається до ' + HV.tijd(f.laadtTot);
    else if (f.was) straks = h(HV.p(f.was.naam).toLowerCase() + t(' завершить за ', ' is klaar over ') + HV.duur(f.was.st.rest));
    else if (f.export) straks = nl ? 'de ' + link('energie', 'zon') + ' levert ' + HV.getal(f.export, 1) + ' kW aan het net' : link('energie', 'сонце') + ' віддає в мережу ' + HV.getal(f.export, 1) + ' кВт';

    var begin = f.thuis === 0 ? t('Удома нікого', 'Er is niemand thuis') : w.huisstand === 'nacht' ? t('Дім спить', 'Het huis slaapt') : t('Удома спокійно', 'Thuis is het rustig');
    if (uitzondering) {
      delen = [licht.charAt(0) === '<' ? licht : licht, deur, straks].filter(Boolean);
      var rest = delen.join(', ');
      return { toon: 'aandacht', vol: uitzondering + ' ' + hoofdletter(rest) + '.', kort: kort };
    }
    delen = [licht, deur].filter(Boolean);
    var vol = h(begin) + ': ' + delen.join(', ') + '.' + (straks ? ' ' + hoofdletter(straks) + '.' : '');
    kort = begin + (f.slot === true ? t(', двері замкнено.', ', deuren op slot.') : '.');
    return { toon: 'rust', vol: vol, kort: kort };
  }
  // Велика літера на початку рядка, що може починатися з кнопки-посилання.
  function hoofdletter(html) {
    return html.replace(/^(<span[^>]*>)?(.)/, function (m, tag, c) { return (tag || '') + c.toUpperCase(); });
  }

  var DAGDEEL = function (uur) { return uur >= 6 && uur < 12 ? ['Ранок', 'Ochtend'] : uur >= 12 && uur < 18 ? ['День', 'Middag'] : uur >= 18 && uur < 23 ? ['Вечір', 'Avond'] : ['Ніч', 'Nacht']; };
  var FASE_ICOON = { nacht: 'moon', dageraad: 'sunrise', dag: 'sun', schemer: 'sunset' };
  /**
   * Стиснутий рядок героя в шапці телефона — паперова пігулка «Вечір · спокійно · 19:42». Шматки неподільні:
   * час не обрізається ніколи; до 359 px — знак фази й час, 360–699 — «Вечір · 19:42» (стан несе чип важливого).
   */
  HV.heldKort = function (ctx) {
    var w = ctx.staat, z = huiszin(ctx);
    var woord = w.nood ? t('тривога', 'alarm') : z.toon === 'aandacht' ? t('увага', 'let op') : z.toon === 'oud' ? HV.woord.verouderd() : t('спокійно', 'rustig');
    var fase = HV.hemel.bereken(w, HV.thema()).fase;
    return '<span class="hv-kop__pil">' + HV.icoon(FASE_ICOON[fase] || 'sun', { maat: 's' }) + '<span class="hv-kop__fase">' + h(HV.p(DAGDEEL(HV.uur(w.tijd)))) + '</span>' +
      '<span class="hv-kop__woord"><span class="hv-punt">·</span>' + h(woord) + '</span><span class="hv-kop__tijd"><span class="hv-punt">·</span>' + HV.tijd(w.tijd) + '</span></span>';
  };
  HV.huiszin = huiszin;

  function chips(ctx) {
    var w = ctx.staat, uit = [];
    var stand = HV.huisstanden[w.huisstand];
    uit.push(o.chip({ icoon: STAND_ICOON[w.huisstand] || 'house', tekst: HV.p(stand), actie: 'blad', gegevens: { blad: 'huisstand' }, aria: t('Режим дому: ', 'Huisstand: ') + HV.p(stand), k: 'chip-stand' }));
    var thuis = HV.kijk.thuis();
    var initialen = thuis.slice(0, 4).map(function (m) { return '<span class="hv-persoon' + (m.zeker !== 'zeker' ? ' is-' + h(m.zeker) : '') + '" aria-hidden="true">' + h(HV.p(m.naam).charAt(0)) + '</span>'; }).join('');
    uit.push(o.chip({ html: (initialen ? '<span class="hv-personen">' + initialen + '</span>' : HV.icoon('users', { maat: 's' })) + '<span>' + h(thuis.length ? thuis.length + ' ' + t('вдома', 'thuis') : t('нікого вдома', 'niemand thuis')) + '</span>', k: 'chip-thuis', aria: thuis.length ? t('Удома: ', 'Thuis: ') + thuis.map(function (m) { return HV.p(m.naam); }).join(', ') : t('Нікого вдома', 'Niemand thuis') }));
    var weer = HV.hemel.weer(w);
    uit.push(o.chip({ icoon: weer.icoon, tekst: weer.tekst, k: 'chip-weer' }));
    var alarm = w.apparaten.alarm.st.stand;
    uit.push(o.chip({ icoon: alarm === 'uit' ? 'shield' : 'shield-check', tekst: HV.p(HV.alarmWoord[alarm]), actie: 'ga', gegevens: { naar: 'beveiliging' }, k: 'chip-alarm' }));
    var prijs = HV.tarief.prijs(w.tijd);
    uit.push(o.chip({ icoon: 'euro', toon: prijs < 0 ? 'net-uit' : null, html: '<span>' + HV.getal(prijs, 2) + '<span class="hv-chip__sub"> ' + h(t('за кВт·год', 'per kWh')) + '</span></span>', actie: 'ga', gegevens: { naar: 'energie-tarief' }, aria: t('Ціна зараз: ', 'Prijs nu: ') + HV.euro(prijs) + t(' за кВт·год, приклад', ' per kWh, voorbeeld'), k: 'chip-prijs' }));
    var leeg = HV.kijk.alle(function (a) { return a.soort === 'batterij' && a.st.waarde < 15; });
    if (leeg.length) uit.push(o.chip({ icoon: 'battery-low', toon: 'let-op', tekst: t('батарейка ', 'batterij ') + HV.getal(leeg[0].st.waarde) + ' %', actie: 'ga', gegevens: { naar: 'activiteit-onderhoud' }, k: 'chip-batterij' }));
    return uit.map(function (c) { return '<span role="listitem">' + c + '</span>'; }).join('');
  }

  // ── Зведення ──
  function energieKaart(ctx) {
    var w = ctx.staat, e = w.energie, kW = t('кВт', 'kW');
    var prijs = HV.tarief.prijs(w.tijd), goedkoop = HV.tarief.goedkoopst(w.tijd, 12);
    var delen = [
      { naam: t('Сонце', 'Zon'), toon: 'zon', waarde: e.zon, tekst: HV.maat(e.zon, kW, 1) },
      { naam: e.net >= 0 ? t('З мережі', 'Van het net') : t('У мережу', 'Naar het net'), toon: e.net >= 0 ? 'net-in' : 'net-uit', waarde: Math.abs(e.net), tekst: HV.maat(Math.abs(e.net), kW, 1) },
      { naam: e.batterij > 0 ? t('Батарея заряджається', 'Batterij laadt') : t('З батареї', 'Uit de batterij'), toon: 'batterij', waarde: Math.abs(e.batterij), tekst: HV.maat(Math.abs(e.batterij), kW, 1) }
    ];
    if (e.auto > 0) delen.push({ naam: t('Авто', 'Auto'), toon: 'auto', waarde: e.auto, tekst: HV.maat(e.auto, kW, 1) });
    var zin = e.net < -0.05 ? t('Віддаємо в мережу ', 'We leveren ') + HV.getal(-e.net, 1) + ' ' + kW + (ctx.taal === 'nl' ? ' terug' : '') + '.' : t('Беремо з мережі ', 'We nemen ') + HV.getal(Math.max(0, e.net), 1) + ' ' + kW + (ctx.taal === 'nl' ? ' van het net' : '') + '.';
    var dan = prijs < 0 ? t(' Ціна зараз від’ємна.', ' De prijs is nu negatief.') : goedkoop && goedkoop.prijs < prijs - 0.03 ? t(' Дешевше з ', ' Goedkoper vanaf ') + HV.tijd(goedkoop.tijd) + ' (' + HV.euro(goedkoop.prijs) + ').' : '';
    return '<article class="hv-som hv-som--energie" data-k="som-energie"><header class="hv-som__kop"><h3>' + HV.icoon('zap', { maat: 's' }) + h(t('Енергія', 'Energie')) + '</h3>' + o.knop({ tekst: t('Відкрити', 'Openen'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'energie' }, aria: t('Відкрити «Енергію»', '‘Energie’ openen') }) + '</header>' +
      HV.grafiek.ring({ id: 'thuis-energie', klein: true, delen: delen, midden: { waarde: HV.maat(e.huis, kW, 1), label: t('дім зараз', 'huis nu') }, samenvatting: zin + dan }) +
      '<p class="hv-som__voet">' + o.stempel({ waarde: HV.euro(prijs) + ' ' + h(t('за кВт·год · приклад', 'per kWh · voorbeeld')), leeftijd: 2000, bron: t('Симулятор', 'Simulator') }) + '</p></article>';
  }

  function beveiligingKaart(ctx) {
    var w = ctx.staat, A = w.apparaten, open = HV.kijk.open();
    var slot = A.voordeurslot.st.vergrendeld, alarm = A.alarm.st.stand;
    var rijen = o.rij({ icoon: alarm === 'uit' ? 'shield' : 'shield-check', naam: HV.p(HV.alarmWoord[alarm]), actie: 'blad', gegevens: { blad: 'apparaat:alarm' }, k: 'bev-alarm' }) +
      o.rij({ icoon: slot ? 'lock-keyhole' : 'lock-keyhole-open', naam: t('Вхідні двері', 'Voordeur'), waarde: h(slot ? HV.woord.vergrendeld() : HV.woord.ontgrendeld()), actie: 'blad', gegevens: { blad: 'apparaat:voordeurslot' }, k: 'bev-slot' }) +
      o.rij({ icoon: open.length ? 'door-open' : 'door-closed', naam: t('Вікна й двері', 'Ramen en deuren'), waarde: h(open.length ? open.length + ' ' + t('відчинено', 'open') : t('усе зачинено', 'alles dicht')), actie: 'ga', gegevens: { naar: 'beveiliging-sensoren' }, k: 'bev-open' }) +
      (A.deurbel.st.laatst ? o.rij({ icoon: 'bell-ring', naam: t('Дзвінок у двері', 'Deurbel'), waarde: HV.tijd(A.deurbel.st.laatst), actie: 'ga', gegevens: { naar: 'beveiliging-toegang' }, k: 'bev-bel' }) : '') +
      (function () {
        var melders = HV.kijk.alle(function (a) { return a.soort === 'rook' || a.soort === 'co' || a.soort === 'lek'; });
        var alarm = melders.filter(function (a) { return a.st.alarm; }).length;
        return o.rij({ icoon: 'alarm-smoke', naam: t('Датчики диму й води', 'Rook- en watermelders'), waarde: h(alarm ? alarm + ' ' + t('тривога', 'alarm') : t('спокійно', 'rustig') + ' · ' + melders.length), actie: 'ga', gegevens: { naar: 'beveiliging-sensoren' }, k: 'bev-melders' });
      })();
    return '<article class="hv-som" data-k="som-beveiliging"><header class="hv-som__kop"><h3>' + HV.icoon('shield', { maat: 's' }) + h(t('Безпека', 'Beveiliging')) + '</h3></header><div class="hv-rijen">' + rijen + '</div></article>';
  }

  function garageKaart(ctx) {
    var w = ctx.staat, ev = w.voertuigen[0], lp = w.apparaten.laadpaal.st, d = w.drones[0];
    var evStand = ev.plek === 'onderweg' ? t('у дорозі', 'onderweg') : lp.laadt ? HV.woord.laadt() : t('на під’їзді', 'op de oprit');
    var droneStand = ({ dock: ['у базі', 'in dock'], vlucht: ['у польоті', 'in vlucht'], signaalkwijt: ['втрата сигналу', 'signaal kwijt'] })[d.stand];
    return '<article class="hv-som" data-k="som-garage"><header class="hv-som__kop"><h3>' + HV.icoon('car', { maat: 's' }) + h(t('Гараж', 'Garage')) + '</h3></header>' +
      o.telemetrie({ id: 'ev', icoon: 'car', naam: HV.p(ev.naam), stand: evStand, lading: ev.lading, doel: ev.doel, toon: lp.laadt ? 'auto' : 'batterij', bereik: HV.maat(ev.bereik, t('км', 'km')), actie: 'ga', gegevens: { naar: 'garage-voertuigen' },
        getallen: lp.laadt ? [{ label: t('ціль', 'doel'), waarde: HV.maat(ev.doel, '%') }, { label: t('потужність', 'vermogen'), waarde: HV.maat(lp.vermogen, t('кВт', 'kW'), 1) }] : [{ label: t('ціль', 'doel'), waarde: HV.maat(ev.doel, '%') }] }) +
      '<div class="hv-rijen">' + o.rij({ icoon: 'drone', naam: HV.p(d.naam), sub: HV.p(droneStand), waarde: HV.maat(d.lading, '%'), actie: 'ga', gegevens: { naar: 'garage-drones' }, k: 'gar-drone' }) + '</div></article>';
  }

  /** Стрічка доби hv-dagstrook: −18…+6 год; смуга фаз, присутність, двері, ціна, режим, автори. kort — лише фази, присутність і ціна. */
  HV.dagstrook = function (ctx, opties) {
    var w = ctx.staat, kort = opties && opties.kort;
    var van = w.tijd - 18 * 3600000, tot = w.tijd + 6 * 3600000, dag = HV.paspoort.dag;
    var uurVan = Math.floor(van / 3600000) * 3600000;
    var fasen = [], prijs = [];
    for (var x = uurVan; x < tot; x += 3600000) {
      var f = HV.hemel.fase(HV.uur(x + 1800000));
      fasen.push({ van: Math.max(van, x), tot: Math.min(tot, x + 3600000), klas: 'hv-fase--' + (f.deel >= 0.5 ? f.b : f.a) });
      var p = HV.tarief.prijs(x);
      // ціна — три ступені тонами стану (дешево · звичайно · дорого); від’ємна — тон «у мережу»
      prijs.push({ van: Math.max(van, x), tot: Math.min(tot, x + 3600000), klas: p < 0 ? 'hv-warmte--min' : p < 0.22 ? 'hv-prijs--goedkoop' : p < 0.31 ? 'hv-prijs--midden' : 'hv-prijs--duur', label: HV.euro(p), p: p });
    }
    var prijzen = prijs.map(function (x) { return x.p; });
    var perDag = function (fn) { for (var d0 = Math.floor(van / 86400000) * 86400000; d0 < tot; d0 += 86400000) fn(d0); };
    var aanwezig = [], stand = [], deuren = [], makers = [];
    perDag(function (d0) {
      dag.aanwezig.forEach(function (r) { var a = d0 + r[0] * 3600000, b = d0 + r[1] * 3600000; if (b > van && a < w.tijd) aanwezig.push({ van: Math.max(van, a), tot: Math.min(w.tijd, b), toon: 'neutraal', label: t('хтось удома', 'iemand thuis') }); });
      dag.stand.forEach(function (r) { var a = d0 + r[0] * 3600000, b = d0 + r[1] * 3600000; if (b > van && a < w.tijd) stand.push({ van: Math.max(van, a), tot: Math.min(w.tijd, b), klas: 'hv-stand--' + r[2], label: HV.p(HV.huisstanden[r[2]]) }); });
      dag.deuren.forEach(function (u) { var m = d0 + u * 3600000; if (m > van && m < w.tijd) deuren.push({ x: m, label: t('двері', 'deur') }); });
      dag.makers.forEach(function (r) { var m = d0 + r[0] * 3600000; if (m > van && m < w.tijd) makers.push({ x: m, label: r[1], icoon: ({ mens: 'user', automatisering: 'diamond', agent: 'agent', dienst: 'cloud', scene: 'diamond' })[r[1]] }); });
    });
    w.logboek.slice(0, 12).forEach(function (r) { if (r.tijd > van && !r.sim0) makers.push({ x: r.tijd, label: HV.p(r.wat), icoon: ({ mens: 'user', automatisering: 'diamond', agent: 'agent', dienst: 'cloud', simulator: 'flask-conical', knop: 'hand', optimalisatie: 'gauge' })[r.maker.soort] || 'diamond' }); });
    var tikken = [];
    for (var u = Math.ceil(van / (6 * 3600000)) * 6 * 3600000; u < tot; u += 6 * 3600000) tikken.push({ x: u, label: HV.tijd(u) });
    // Ієрархія рядів: небо 20 px; «удома» й «режим» — суцільні тони 12 px; двері — риски; ціна — три ступені з межами праворуч.
    // Ряд авторів — лише на вимогу (opties.makers): на «Домі» знаки злипалися біля «зараз»; повна історія — у Журналі.
    var banen = [{ naam: t('небо', 'hemel'), klas: 'hv-baan--fase', stukken: fasen }, { naam: t('удома', 'thuis'), stukken: aanwezig }];
    if (!kort) banen.push({ naam: t('двері', 'deuren'), punten: deuren });
    banen.push({ naam: t('ціна', 'prijs'), klas: 'hv-baan--prijs', stukken: prijs, rechts: kort ? '' : h(HV.euro(Math.min.apply(null, prijzen)) + ' – ' + HV.euro(Math.max.apply(null, prijzen))) });
    if (!kort) banen.push({ naam: t('режим', 'stand'), klas: 'hv-baan--stand', stukken: stand });
    if (opties && opties.makers) banen.push({ naam: t('автори', 'makers'), punten: makers });
    return '<div class="hv-dagstrook' + (kort ? ' hv-dagstrook--kort' : '') + '" data-k="dagstrook">' + HV.grafiek.toestanden({ id: 'dagstrook', van: van, tot: tot, nu: w.tijd, tikken: tikken, format: HV.tijd, banen: banen,
      samenvatting: kort ? '' : t('Доба дому від −18 до +6 годин. Ціна: світліше — дешевше; майбутнє показано лише для неба й ціни.', 'Het etmaal van het huis van −18 tot +6 uur. Prijs: lichter is goedkoper; de toekomst is alleen voor hemel en prijs getekend.') }) + '</div>';
  };

  function render(ctx) {
    var w = ctx.staat, z = huiszin(ctx);
    var datum = h(HV.datum(w.tijd)) + ' <span class="hv-punt">·</span> <span class="hv-held__tijd">' + HV.tijd(w.tijd) + '</span> <span class="hv-held__huistijd">' + HV.icoon('flask-conical', { maat: 'maker' }) + h(t('небо за часом дому', 'hemel volgt huistijd')) + '</span>';
    var held = o.held({ datum: datum, zin: z.vol, kort: h(z.kort), chips: chips(ctx), rechts: HV.hemel.doorsnede(ctx) });

    var nu = o.blok({ id: 'nu', titel: t('Зараз важливо', 'Nu belangrijk'), teller: w.nu.length, vast: w.nu.some(function (n) { return n.soort === 'alarm'; }), inhoud: o.nu(w.nu), samenvatting: w.nu.length ? h(HV.p(w.nu[0].tekst)) : '', klas: 'hv-blok--nu' });

    var eerste = w.eersteStart ? o.blok({ id: 'eerste', titel: t('Перші кроки', 'Eerste stappen'), teller: 3, inhoud: '<div class="hv-rijen hv-rijen--kaart">' +
      o.rij({ icoon: 'users', naam: t('Запросити мешканців', 'Bewoners uitnodigen'), actie: 'ga', gegevens: { naar: 'instellingen-mensen' } }) +
      o.rij({ icoon: 'bell', naam: t('Увімкнути сповіщення на цьому пристрої', 'Meldingen op dit toestel aanzetten'), actie: 'ga', gegevens: { naar: 'instellingen-meldingen' } }) +
      o.rij({ icoon: 'map', naam: t('Розставити пристрої на плані', 'Apparaten op de plattegrond zetten'), actie: 'ga', gegevens: { naar: 'kamers-plattegrond' } }) + '</div>', klas: 'hv-blok--eerste' }) : '';

    var doorsnede = o.blok({ id: 'doorsnede', titel: t('Дім у розрізі', 'Huis in doorsnede'), inhoud: '<div class="hv-kaart hv-kaart--doorsnede">' + HV.hemel.doorsnede(ctx) + '</div>', klas: 'hv-blok--doorsnede',
      samenvatting: h(t('Світло ', 'Licht aan ') + (HV.kijk.kamersMetLicht().length ? (ctx.taal === 'nl' ? IN_KAMERS_NL : IN_KAMERS_UK)[Math.min(10, HV.kijk.kamersMetLicht().length)] : t('вимкнено всюди', 'nergens'))) });

    var scenes = o.blok({ id: 'scenes', titel: t('Сцени', 'Scènes'), klas: 'hv-blok--scenes',
      uitleg: t('Що станеться: сцена виконає свої кроки одразу; недоступні пристрої буде пропущено й названо. Пов’язано з: небезпечні кроки сцена виконує лише за дозволом «Завжди». Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: de scène voert haar stappen direct uit; onbereikbare apparaten worden overgeslagen en genoemd. Hangt samen met: gevaarlijke stappen doet een scène alleen met de toestemming ‘Altijd’. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'),
      inhoud: '<div class="hv-scenes">' + w.scenes.map(function (s) { return o.scene(s, w.sceneActief === s.id); }).join('') + '</div>' });

    var favorieten = o.blok({ id: 'favorieten', titel: t('Обране', 'Favorieten'), klas: 'hv-blok--favorieten',
      inhoud: w.favorieten.length ? '<div class="hv-tegels">' + w.favorieten.map(function (id) { return o.tegel(w.apparaten[id], { metKamer: true, bediening: true }); }).join('') + '</div>'
        : o.leeg({ icoon: 'lightbulb', titel: t('Обране ще порожнє', 'Nog geen favorieten'), tekst: t('Додайте головне світло, термостат і вхідні двері — вони будуть під рукою на кожному екрані.', 'Voeg de hoofdlamp, de thermostaat en de voordeur toe — ze staan dan op elk scherm bij de hand.'), actie: { tekst: t('Зібрати автоматично', 'Automatisch samenstellen'), actie: 'favorieten-auto' } }) });

    var verdieping = HV.ui.lees('verdieping', 'beneden');
    var kamers = w.kamers.filter(function (k) { return k.verdieping === verdieping; });
    var kamersBlok = o.blok({ id: 'kamers', titel: t('Кімнати', 'Kamers'), teller: kamers.length, klas: 'hv-blok--kamers',
      inhoud: o.segment({ label: t('Поверх', 'Verdieping'), waarde: verdieping, actie: 'ui', gegevens: { naam: 'verdieping' }, klas: 'hv-segment--rol', k: 'verdieping', opties: ['beneden', 'boven', 'zolder', 'buiten'].map(function (id) { return { id: id, label: HV.p(w.verdiepingen.filter(function (v) { return v.id === id; })[0].naam) }; }) }) +
        '<div class="hv-kamers">' + kamers.map(o.kamerkaart).join('') + '</div>' });

    var lampen = HV.kijk.lampenAan().length;
    var zomen = o.blok({ id: 'zomen', titel: t('Зведення', 'Samenvatting'), klas: 'hv-blok--zomen',
      extra: lampen ? o.knop({ tekst: t('Вимкнути все світло', 'Alle lampen uit') + ' · ' + lampen, icoon: 'lightbulb', klein: true, soort: 'stil', actie: 'alles-licht-uit' }) : '',
      inhoud: '<div class="hv-zomen">' + energieKaart(ctx) + beveiligingKaart(ctx) + garageKaart(ctx) + '</div>' });

    var dagstrook = o.blok({ id: 'dagstrook', titel: t('Стрічка доби', 'Dagstrook'), klas: 'hv-blok--dagstrook', inhoud: '<div class="hv-kaart">' + HV.dagstrook(ctx) + '</div>' });

    return '<div class="hv-thuis" data-k="thuis">' + held + '<div class="hv-thuis__rooster">' +
      '<div class="hv-thuis__nu">' + nu + eerste + '</div>' +
      '<div class="hv-thuis__doorsnede">' + doorsnede + '</div>' +
      '<div class="hv-thuis__links">' + scenes + favorieten + '</div>' +
      '<div class="hv-thuis__rechts">' + kamersBlok + '</div>' +
      '<div class="hv-thuis__breed">' + zomen + dagstrook + '</div>' +
      '</div></div>';
  }

  HV.scherm({ id: 'overzicht', sectie: 'thuis', titel: ['Дім', 'Thuis'], icoon: 'house', adres: '/overzicht', render: render });

  HV.actie('alles-licht-uit', function () { HV.doe({ doel: 'alle', mogelijkheid: 'licht', waarde: false }); });
  HV.actie('favorieten-auto', function () {
    HV.staat.wijzig(function (w) { w.favorieten = HV.paspoort.favorieten.slice(); w.eersteStart = false; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Обране зібрано автоматично', 'Favorieten automatisch samengesteld'], soort: 'huis.systeem' });
    HV.meld({ maker: HV.mens(), icoon: 'check', titel: t('Обране зібрано автоматично', 'Favorieten automatisch samengesteld'), tekst: t('Головне світло, термостат, вхідні двері, зарядка.', 'Hoofdlamp, thermostaat, voordeur, laden.') });
  });

  // ── Аркуш режиму дому (hv-huisstand) ──
  var GEVOLG = {
    thuis: ['Що станеться: режим дому стане «Вдома», опалення підніметься до 21 °C. Пов’язано з: охорону режим не знімає — це окрема дія. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: de huisstand wordt ‘Thuis’, de verwarming gaat naar 21 °C. Hangt samen met: de stand zet het alarm niet uit — dat is een aparte actie. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'],
    afwezig: ['Що станеться: світло й медіа вимкнуться, опалення знизиться до 17 °C. Пов’язано з: охорону дім лише запропонує поставити; двері лишаться як є. Як повернути: «Я вдома» або «Повернути» протягом 10 с.', 'Wat er gebeurt: licht en media gaan uit, de verwarming zakt naar 17 °C. Hangt samen met: het huis stelt alleen voor het alarm in te schakelen; deuren blijven zoals ze zijn. Terugdraaien: ‘Ik ben thuis’ of ‘Ongedaan maken’ binnen 10 s.'],
    nacht: ['Що станеться: світло внизу вимкнеться, опалення знизиться до 17,5 °C, небо стане нічним. Пов’язано з: нічники в спальнях лишаться. Як повернути: оберіть «Вдома».', 'Wat er gebeurt: het licht beneden gaat uit, de verwarming zakt naar 17,5 °C, de hemel wordt nacht. Hangt samen met: de nachtlampjes in de slaapkamers blijven aan. Terugdraaien: kies ‘Thuis’.'],
    vakantie: ['Що станеться: світло й медіа вимкнуться, опалення перейде на 15 °C до повернення. Пов’язано з: полив і косарка працюють за розкладом. Як повернути: оберіть «Вдома».', 'Wat er gebeurt: licht en media gaan uit, de verwarming gaat naar 15 °C tot je terug bent. Hangt samen met: beregening en maaier volgen hun rooster. Terugdraaien: kies ‘Thuis’.'],
    gasten: ['Що станеться: режим дому стане «Гості»; сцени й клімат лишаються як є. Пов’язано з: гостьовий код дверей діє лише в цьому режимі. Як повернути: оберіть «Вдома».', 'Wat er gebeurt: de huisstand wordt ‘Gasten’; scènes en klimaat blijven zoals ze zijn. Hangt samen met: de gastcode van de deur werkt alleen in deze stand. Terugdraaien: kies ‘Thuis’.']
  };
  HV.blad({
    soort: 'huisstand', vrij: true, icoon: 'house', titel: ['Режим дому', 'Huisstand'],
    sub: function (ctx) { return HV.p(HV.huisstanden[ctx.staat.huisstand]); },
    render: function (ctx) {
      var w = ctx.staat, weg = w.huisstand === 'afwezig' || w.huisstand === 'vakantie';
      var snel = o.knop({ tekst: weg ? t('Я вдома', 'Ik ben thuis') : t('Йду', 'Ik ga weg'), icoon: weg ? 'log-in' : 'log-out', soort: 'hoofd', actie: 'huisstand', gegevens: { waarde: weg ? 'thuis' : 'afwezig' }, klas: 'hv-knop--breed' });
      var lijst = Object.keys(HV.huisstanden).map(function (id) {
        var gekozen = w.huisstand === id;
        return '<div class="hv-huisstand__rij' + (gekozen ? ' is-gekozen' : '') + '" data-k="stand-' + id + '"><button type="button" class="hv-huisstand__knop" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="huisstand" data-waarde="' + id + '">' + HV.icoon(STAND_ICOON[id]) + '<span>' + h(HV.p(HV.huisstanden[id])) + '</span>' + (gekozen ? HV.icoon('check', { maat: 's' }) : '') + '</button>' + o.gevolg(HV.p(GEVOLG[id]), { kop: HV.p(HV.huisstanden[id]) }) + '</div>';
      }).join('');
      return o.kaart({ inhoud: snel }) + o.kaart({ titel: t('Режими', 'Standen'), inhoud: '<div class="hv-huisstand">' + lijst + '</div>' }) +
        o.kaart({ inhoud: '<p class="hv-tekst">' + HV.icoon('shield', { maat: 's' }) + ' ' + h(t('Охорона: дім лише запропонує поставити. Зняти охорону чи відімкнути двері режим не може.', 'Alarm: het huis stelt alleen voor het in te schakelen. Uitzetten of een deur ontgrendelen kan een stand niet.')) + '</p>' });
    }
  });
})(window.HV = window.HV || {});
