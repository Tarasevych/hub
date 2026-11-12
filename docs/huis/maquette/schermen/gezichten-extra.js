// Gezichten van de onderdelen buiten «Thuis» voor de speciale profielen (§3.6 van het plan, §7 van de ontwerptaal) en het
// scherm «Paneel» — de kiosk /paneel/<profiel>/<id> met rustscherm, nachtdimmen en inbrandbescherming.
// Обличчя розділів поза Домом: енергія (сальдо, ціна, потоки), безпека (охорона, входи, камери), клімат кімнат (диск),
// гараж (заряд авто), сцени — для strook, vierkant, rond, klein, horloge, deur, inkt і tv. Обличчя Дому лежать у gezichten.js;
// тут їх не повторюємо, а доповнюємо: наші обличчя стають після облич Дому (порядок вирівнюється перед стартом).
// Кожна дія — через HV.doe (ворота, ритуал, «Повернути», Журнал); налаштування кіоску — запис у Журналі й «Повернути».
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  // ───────────────────────── Реєстр наших облич ─────────────────────────
  var EIGEN = {};
  function gezicht(def) { EIGEN[def.id] = true; HV.gezicht(def); }

  // ───────────────────────── Спільні дрібниці ─────────────────────────
  var punt = '<span class="hv-punt" aria-hidden="true">·</span>';
  var kW = function () { return t('кВт', 'kW'); };
  var kop = function (ctx, label, rechts) { return '<header class="hv-gezicht__kop"><span class="hv-gezicht__bijschrift">' + label + '</span>' + (rechts || '') + o.versheid(ctx.staat) + '</header>'; };
  var simMerk = function (w) { return '<span class="hv-gezicht__sim">' + HV.icoon('flask-conical', { maat: 'maker' }) + h(t('симуляція', 'simulatie')) + ' ' + (w.pauze ? h(t('пауза', 'pauze')) : '×' + w.snelheid) + '</span>'; };
  var knop = function (p) { return o.knop(p); };
  /** Кнопка-стан: поточний вибір — натиснута з галочкою (без дії), решта — звичайні. */
  var keuze = function (p, gekozen) { return gekozen ? o.knop({ tekst: p.tekst, icoon: p.icoon, gedrukt: true, klas: p.klas, k: p.k }) : o.knop(p); };
  var A = function (w) { return w.apparaten; };
  var hoofd = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  // ───────────────────────── Дані зон ─────────────────────────
  /** Енергія: сальдо, ціна зараз і найближче дешеве вікно, сума за сьогодні (приклад). */
  function energie(w) {
    var e = w.energie, nu = HV.tarief.prijs(w.tijd), goed = HV.tarief.goedkoopst(w.tijd, 18), bat = A(w).thuisbatterij.st;
    var uit = e.net < -0.05;
    var niveau = nu < 0 ? 'min' : nu < 0.22 ? 'goedkoop' : nu < 0.31 ? 'midden' : 'duur';
    var niveauWoord = { min: t('від’ємна ціна', 'negatieve prijs'), goedkoop: t('дешево', 'goedkoop'), midden: t('звичайна ціна', 'gewone prijs'), duur: t('дорого', 'duur') }[niveau];
    var kosten = e.vandaagIn * 0.27 - e.vandaagUit * 0.08;
    var batWoord = e.batterij > 0.05 ? t('заряджається', 'laadt') : e.batterij < -0.05 ? t('віддає в дім', 'levert aan huis') : t('чекає', 'wacht');
    return {
      e: e, nu: nu, goed: goed, bat: bat, batWoord: batWoord, kosten: kosten, niveau: niveau, niveauWoord: niveauWoord,
      getal: HV.maat(Math.abs(e.net), kW(), 1), getalTekst: HV.maatTekst(Math.abs(e.net), kW(), 1),
      woord: uit ? t('у мережу', 'teruglevering') : t('з мережі', 'afname van het net'), toon: uit ? 'net-uit' : 'net-in',
      later: goed && goed.prijs < nu - 0.04 ? t('дешевше о ', 'goedkoper om ') + HV.tijd(goed.tijd) + ' — ' + HV.euro(goed.prijs) : t('зараз найдешевше до ранку', 'nu het goedkoopst tot de ochtend'),
      zin: uit ? t('Віддаємо в мережу ', 'We leveren ') + HV.maatTekst(-e.net, kW(), 1) + t('.', ' terug aan het net.') : t('Дім бере з мережі ', 'Het huis neemt ') + HV.maatTekst(e.net, kW(), 1) + t(', ціна ', ' van het net, prijs ') + HV.euro(nu) + '.'
    };
  }
  /** Ціна 24 год від поточної години: власний SVG — стовпці з тоном ступеня, позначка «зараз», найдешевша година. */
  function prijsBand(w, opties) {
    var op = opties || {}, uren = op.uren || 24, start = w.tijd - (w.tijd % 3600000), lijst = [];
    for (var i = 0; i < uren; i++) lijst.push({ tijd: start + i * 3600000, prijs: HV.tarief.prijs(start + i * 3600000) });
    var max = Math.max(0.4, Math.max.apply(null, lijst.map(function (x) { return x.prijs; }))), min = Math.min(0, Math.min.apply(null, lijst.map(function (x) { return x.prijs; })));
    var H = op.hoogte || 40, B = 1000, stap = B / uren, nul = H * max / (max - min);
    var goed = lijst.reduce(function (a, b) { return b.prijs < a.prijs ? b : a; });
    var staven = lijst.map(function (x, n) {
      var y = x.prijs >= 0 ? nul - x.prijs / (max - min) * H : nul, hgt = Math.max(1.5, Math.abs(x.prijs) / (max - min) * H);
      var klas = x.prijs < 0 ? 'is-min' : x.prijs < 0.22 ? 'is-goedkoop' : x.prijs < 0.31 ? 'is-midden' : 'is-duur';
      return '<rect class="hv-gzx-prijs__staaf ' + klas + (n === 0 ? ' is-nu' : '') + (x === goed ? ' is-best' : '') + '" x="' + (n * stap + 1.5).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (stap - 3).toFixed(1) + '" height="' + hgt.toFixed(1) + '"><title>' + h(HV.tijd(x.tijd) + ' · ' + HV.euro(x.prijs)) + '</title></rect>';
    }).join('');
    var labels = op.labels === false ? '' : '<div class="hv-gzx-prijs__as" aria-hidden="true">' + lijst.filter(function (x, n) { return n % (op.elke || 6) === 0; }).map(function (x) { return '<span>' + HV.tijd(x.tijd) + '</span>'; }).join('') + '</div>';
    return '<figure class="hv-gzx-prijs' + (op.klas ? ' ' + op.klas : '') + '" role="img" aria-label="' + h(t('Ціна на ', 'Prijs voor ') + uren + t(' год: зараз ', ' uur: nu ') + HV.euro(lijst[0].prijs) + t(', найдешевше о ', ', het goedkoopst om ') + HV.tijd(goed.tijd) + ' — ' + HV.euro(goed.prijs)) + '">' +
      '<svg viewBox="0 0 ' + B + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><line class="hv-gzx-prijs__nul" x1="0" x2="' + B + '" y1="' + nul.toFixed(1) + '" y2="' + nul.toFixed(1) + '"/>' + staven + '</svg>' + labels + '</figure>';
  }

  var ALARM_KORT = { uit: ['знято', 'uit'], schil: ['периметр', 'schil'], nacht: ['нічна', 'nacht'], volledig: ['повна', 'volledig'] };
  var ALARM_ICOON = { uit: 'shield-off', schil: 'shield-half', nacht: 'shield-ellipsis', volledig: 'shield-check' };
  /** Входи: замок, ворота, двері й вікна — лише зі спостереженого. */
  function ingangen(w) {
    var a = A(w), lijst = [];
    var slot = a.voordeurslot;
    lijst.push({ id: 'voordeurslot', icoon: slot.st.vergrendeld ? 'lock-keyhole' : 'lock-keyhole-open', naam: t('Вхідні двері', 'Voordeur'), dicht: !!slot.st.vergrendeld, woord: slot.st.vergrendeld ? HV.woord.vergrendeld() : HV.woord.ontgrendeld(), wacht: !!slot.wacht, soort: 'slot' });
    ['garagedeur', 'poort'].forEach(function (id) {
      var x = a[id];
      lijst.push({ id: id, icoon: id === 'poort' ? 'fence' : 'warehouse', naam: HV.p(x.naam), dicht: !x.st.open, woord: x.st.open ? HV.woord.open() : HV.woord.dicht(), wacht: !!x.wacht, soort: 'poort' });
    });
    var ramen = HV.kijk.alle(function (x) { return x.soort === 'contact' && x.raam; });
    var open = ramen.filter(function (x) { return x.st.open; });
    lijst.push({ id: 'ramen', icoon: open.length ? 'app-window' : 'app-window', naam: t('Вікна', 'Ramen'), dicht: !open.length, woord: open.length ? open.length + ' ' + t('відчинено', 'open') + ' · ' + open.map(function (x) { return HV.p(HV.staat.kamer(x.kamer).naam).toLowerCase(); }).join(', ') : t('усі зачинено', 'alle dicht'), soort: 'raam' });
    return lijst;
  }
  function beveiliging(w) {
    var stand = A(w).alarm.st.stand, lijst = ingangen(w), open = lijst.filter(function (x) { return !x.dicht; });
    var bel = A(w).deurbel.st.laatst;
    return {
      stand: stand, woord: HV.p(ALARM_KORT[stand] || ALARM_KORT.uit), icoon: ALARM_ICOON[stand] || 'shield', toon: stand === 'uit' ? 'neutraal' : 'rust',
      lijst: lijst, open: open, bel: bel,
      toestand: open.length ? open.map(function (x) { return x.naam + ': ' + x.woord; }).join(' · ') : t('двері замкнено, вікна й ворота зачинено', 'deur op slot, ramen en poorten dicht'),
      zin: (stand === 'uit' ? t('Охорону знято', 'Het alarm staat uit') : t('Охорона: ', 'Alarm: ') + HV.p(ALARM_KORT[stand])) + (open.length ? t('; відчинено: ', '; open: ') + open.map(function (x) { return x.naam.toLowerCase(); }).join(', ') + '.' : t('; усе зачинено.', '; alles is dicht.'))
    };
  }
  /** Наступний доречний рівень охорони: нікого — повна, вечір і ніч — нічна, інакше — периметр. */
  function volgendeAlarm(w) {
    if (w.huisstand === 'afwezig' || w.huisstand === 'vakantie' || !HV.kijk.thuis().length) return 'volledig';
    var uur = HV.uur(w.tijd);
    return uur >= 21 || uur < 6 || w.huisstand === 'nacht' ? 'nacht' : 'schil';
  }

  function kamersMetKlimaat(w) { return w.kamers.filter(function (k) { return HV.kijk.temperatuur(k.id) && (k.doel != null || HV.kijk.inKamer(k.id, function (a) { return a.soort === 'thermostaat'; }).length); }); }
  function klimaatKamer(w, k) {
    var th = HV.kijk.inKamer(k.id, function (a) { return a.soort === 'thermostaat'; })[0];
    var temp = HV.kijk.temperatuur(k.id), gemeten = th ? th.st.temperatuur : temp ? temp.st.waarde : null;
    var doel = th ? Number(HV.gewenst(th, 'doel')) : (k.doel != null ? k.doel : 20);
    var verwarmt = th ? !!th.st.verwarmt : gemeten != null && gemeten < doel - 0.2;
    var vocht = HV.kijk.inKamer(k.id, function (a) { return a.soort === 'vocht' || a.soort === 'bevochtiger'; })[0];
    return { k: k, th: th, gemeten: gemeten, doel: doel, verwarmt: verwarmt, oud: temp && temp.beschikbaar === 'verouderd', vocht: vocht ? (vocht.st.vocht != null ? vocht.st.vocht : vocht.st.waarde) : null,
      woord: verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast'), licht: HV.kijk.lampenAan(k.id).length, lampen: HV.kijk.lampen(k.id).length };
  }
  function gekozenKamer(w) {
    var lijst = kamersMetKlimaat(w), i = Math.min(lijst.length - 1, Number(HV.ui.lees('gzx-kamer', 0)) || 0);
    return { lijst: lijst, i: i, x: klimaatKamer(w, lijst[i] || HV.staat.kamer('woonkamer')) };
  }
  function klimaatZin(w) {
    var wp = A(w).warmtepomp.st, woon = klimaatKamer(w, HV.staat.kamer('woonkamer'));
    return t('Удома ', 'Binnen ') + HV.maatTekst(woon.gemeten, '°C', 1) + t(', надворі ', ', buiten ') + HV.maatTekst(w.weer.temp, '°C') + (wp.verwarmt ? t('; тепловий насос гріє.', '; de warmtepomp verwarmt.') : t('; насос відпочиває.', '; de warmtepomp rust.'));
  }

  /** Електромобіль і зарядна станція. */
  function auto(w) {
    var ev = w.voertuigen[0], lp = A(w).laadpaal, st = lp.st;
    var laadt = !!st.laadt, kw = st.vermogen || (st.modus === 'snel' ? 11 : 7.4);
    var uren = Math.max(0, (ev.doel - ev.lading) / 100 * ev.capaciteit / kw);
    var klaar = w.tijd + uren * 3600000;
    var modus = HV.gewenst(lp, 'modus');
    var wachtLaden = lp.wacht && lp.wacht.mogelijkheid === 'laden';
    return {
      ev: ev, lp: lp, laadt: laadt, kw: kw, klaar: klaar, modus: modus, wacht: wachtLaden, vol: ev.lading >= ev.doel - 0.5,
      woord: !ev.aangesloten && !st.aangesloten ? t('не під’єднано', 'niet aangesloten') : laadt ? HV.woord.laadt() : ev.lading >= ev.doel - 0.5 ? t('заряджено до цілі', 'geladen tot het doel') : st.modus === 'pauze' ? t('пауза', 'pauze') : t('чекає дешевої години', 'wacht op een goedkoop uur'),
      zin: t('Авто ', 'De auto staat op ') + Math.round(ev.lading) + ' %' + (laadt ? t(', заряджається до ', ', laadt tot ') + ev.doel + ' %' + t(' о ', ' om ') + HV.tijd(klaar) + '.' : t(', запас ', ', bereik ') + ev.bereik + t(' км.', ' km.')),
      eind: laadt ? t('до ', 'tot ') + ev.doel + ' %' + t(' о ', ' om ') + HV.tijd(klaar) : ev.bereik + t(' км запасу', ' km bereik')
    };
  }
  var MODI = function () { return [{ id: 'pauze', icoon: 'pause', tekst: t('Пауза', 'Pauze') }, { id: 'slim', icoon: 'sparkles', tekst: t('Розумно', 'Slim') }, { id: 'snel', icoon: 'zap', tekst: t('Швидко', 'Snel') }]; };
  function laadKnop(x, p) {
    var op = p || {};
    if (x.vol && !x.laadt) return o.knop({ tekst: t('Заряджено', 'Vol genoeg'), icoon: 'battery-full', gedrukt: true, klas: op.klas, k: 'gzx-laad' });
    return o.knop({ tekst: x.laadt ? t('Зупинити зарядку', 'Laden stoppen') : t('Заряджати зараз', 'Nu laden'), icoon: x.laadt ? 'circle-stop' : 'plug-zap', soort: op.soort || 'gewoon', actie: 'gzx-laden', klas: op.klas, k: 'gzx-laad' });
  }
  function tweewielers(w) { return w.voertuigen.filter(function (v) { return v.soort !== 'auto'; }); }

  /** Сцени: доречна зараз — за часом дому. */
  function sceneNu(w) {
    var uur = HV.uur(w.tijd), id = uur >= 5 && uur < 10 ? 'ochtend' : uur >= 21 || uur < 5 ? 'welterusten' : uur >= 17 ? 'avond' : 'gasten';
    return w.scenes.filter(function (s) { return s.id === id; })[0] || w.scenes[0];
  }
  var STANDEN = ['thuis', 'afwezig', 'nacht', 'vakantie', 'gasten'];
  var STAND_ICOON = { thuis: 'house', afwezig: 'log-out', nacht: 'bed-double', vakantie: 'plane', gasten: 'users' };

  // ───────────────────────── Камера: власний SVG-кадр (знімок через сервер — у справжньому домі) ─────────────────────────
  var CAMERAS = ['cameravoor', 'cameratuin', 'cameragarage'];
  function camBeeld(w, id, opties) {
    var op = opties || {}, a = A(w)[id], fase = HV.hemel.bereken(w, HV.thema()).fase, nacht = fase === 'nacht' || fase === 'schemer';
    var persoon = id === 'cameravoor' && !!w.oproep;
    var scene = {
      cameravoor: '<rect class="hv-gzx-cam__muur" x="0" y="6" width="160" height="46"/><rect class="hv-gzx-cam__deur" x="48" y="18" width="22" height="34" rx="1"/><circle class="hv-gzx-cam__lamp" cx="76" cy="22" r="2.2"/><path class="hv-gzx-cam__grond" d="M0 52h160v38H0z"/><path class="hv-gzx-cam__pad" d="M50 52h18l26 38H30z"/>' + (persoon ? '<g class="hv-gzx-cam__persoon"><circle cx="64" cy="54" r="5"/><path d="M55 80c0-12 4-19 9-19s9 7 9 19z"/></g>' : ''),
      cameratuin: '<path class="hv-gzx-cam__grond" d="M0 56h160v34H0z"/><path class="hv-gzx-cam__hek" d="M0 50h160M0 44h160M8 40v16M28 40v16M48 40v16M68 40v16M88 40v16M108 40v16M128 40v16M148 40v16"/><circle class="hv-gzx-cam__boom" cx="34" cy="30" r="14"/><rect class="hv-gzx-cam__stam" x="32" y="40" width="4" height="16"/><circle class="hv-gzx-cam__boom" cx="122" cy="34" r="10"/><rect class="hv-gzx-cam__stam" x="120" y="42" width="4" height="14"/>',
      cameragarage: '<rect class="hv-gzx-cam__muur" x="0" y="0" width="160" height="62"/><path class="hv-gzx-cam__grond" d="M0 62h160v28H0z"/><path class="hv-gzx-cam__auto" d="M40 70c2-10 8-16 18-17h40c10 1 16 7 20 17v8H40z"/><circle class="hv-gzx-cam__wiel" cx="56" cy="78" r="5"/><circle class="hv-gzx-cam__wiel" cx="104" cy="78" r="5"/><rect class="hv-gzx-cam__paal" x="136" y="30" width="10" height="32" rx="2"/>'
    }[id] || '';
    var naam = HV.p(a.naam);
    var tag = op.actie ? 'button type="button" data-actie="' + op.actie + '"' + HV.attrs(op.gegevens) + ' aria-label="' + h(naam + (persoon ? t(': біля дверей людина', ': iemand bij de deur') : '')) + '"' : 'figure aria-label="' + h(naam) + '"';
    return '<' + tag + ' class="hv-gzx-cam' + (nacht ? ' is-nacht' : '') + (persoon ? ' is-persoon' : '') + (op.klas ? ' ' + op.klas : '') + '"' + (op.k ? ' data-k="' + h(op.k) + '"' : '') + '>' +
      '<svg class="hv-gzx-cam__beeld" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect class="hv-gzx-cam__lucht" width="160" height="90"/>' + scene + '</svg>' +
      '<span class="hv-gzx-cam__kop"><span class="hv-gzx-cam__live"><i></i>' + h(t('кадр', 'beeld')) + ' ' + HV.tijd(w.tijd) + '</span></span>' +
      '<span class="hv-gzx-cam__naam">' + h(naam) + (persoon ? ' · ' + h(t('людина', 'persoon')) : '') + '</span></' + (op.actie ? 'button' : 'figure') + '>';
  }

  // ───────────────────────── Кільце-дуга (власний SVG) ─────────────────────────
  /** Дуга 270° (диск-шкала): deel 0–1, тон класу. */
  function boogSvg(deel, toon, klas) {
    var d = Math.max(0, Math.min(1, deel));
    return '<svg class="hv-gzx-boog ' + (klas || '') + ' hv-toon-' + toon + '" viewBox="0 0 100 100" aria-hidden="true"><circle class="hv-gzx-boog__baan" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 50 50)"/>' +
      '<circle class="hv-gzx-boog__vulling" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="' + (d * 75).toFixed(1) + ' 100" transform="rotate(135 50 50)"/></svg>';
  }

  // ═════════════════════════ STROOK 1920×480 / 1280×400 ═════════════════════════
  // П'ять зон на всю висоту, як обличчя Дому: час і речення зони │ три зони зони │ керування; унизу стрічка (ціна чи доба).
  function strookTijd(ctx, zin, icoon, label) {
    var w = ctx.staat;
    return '<section class="hv-strook__tijd"><div><p class="hv-strook__klok">' + HV.tijd(w.tijd) + '</p><p class="hv-strook__datum">' + h(HV.datum(w.tijd)) + ' ' + simMerk(w) + '</p></div>' +
      '<div class="hv-gzx-strook__zone"><p class="hv-gzx-strook__onderdeel">' + HV.icoon(icoon, { maat: 's' }) + '<span>' + h(label) + '</span></p><p class="hv-strook__zin">' + h(zin) + '</p></div></section>';
  }
  function strookVak(klas, label, inhoud, voet) {
    return '<section class="hv-gzx-vak ' + (klas || '') + '"><p class="hv-strook__label">' + label + '</p><div class="hv-gzx-vak__lijf">' + inhoud + '</div>' + (voet ? '<div class="hv-gzx-vak__voet">' + voet + '</div>' : '<span></span>') + '</section>';
  }
  function strook(klas, delen, band) { return '<div class="hv-strook hv-gzx-strook ' + klas + '">' + delen.join('') + '</div>' + band; }
  var smal = function (ctx) { return ctx.profiel.breedte < 1600; };

  gezicht({ id: 'strook-energie', profiel: 'strook', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var w = ctx.staat, x = energie(w), e = x.e, s = auto(w);
    var stromen = [[t('Сонце', 'Zon'), 'zon', 'sun', e.zon], [t('Дім', 'Huis'), 'net-in', 'house', e.huis], [t('Батарея', 'Batterij'), 'batterij', e.batterij >= 0 ? 'battery-charging' : 'battery-medium', e.batterij], [t('Авто', 'Auto'), 'auto', 'car', e.auto]];
    var rijen = stromen.map(function (r) { return '<li class="hv-toon-' + r[1] + '">' + HV.icoon(r[2], { maat: 's' }) + '<span>' + h(r[0]) + '</span><b>' + HV.maat(Math.abs(r[3]), kW(), 1) + '</b></li>'; }).join('');
    var vandaag = '<dl class="hv-gzx-som"><div><dt>' + h(t('з мережі', 'van het net')) + '</dt><dd>' + HV.maat(e.vandaagIn, t('кВт·год', 'kWh'), 1) + '</dd></div><div><dt>' + h(t('у мережу', 'teruggeleverd')) + '</dt><dd>' + HV.maat(e.vandaagUit, t('кВт·год', 'kWh'), 1) + '</dd></div><div><dt>' + h(t('сонце', 'zon')) + '</dt><dd>' + HV.maat(e.vandaagZon, t('кВт·год', 'kWh'), 1) + '</dd></div><div><dt>' + h(t('вартість · приклад', 'kosten · voorbeeld')) + '</dt><dd>' + h(HV.euro(x.kosten)) + '</dd></div></dl>';
    var delen = [
      strookTijd(ctx, x.zin, 'zap', t('Енергія', 'Energie')),
      strookVak('hv-gzx-vak--saldo hv-toon-' + x.toon, h(x.woord), '<p class="hv-strook__getal">' + x.getal + '</p>', '<p class="hv-gzx-vak__sub">' + h(t('батарея ', 'batterij ') + Math.round(x.bat.lading) + ' % · ' + x.batWoord) + '</p>'),
      strookVak('hv-gzx-vak--prijs hv-gzx-prijsniveau--' + x.niveau, h(t('Ціна зараз', 'Prijs nu')) + punt + h(x.niveauWoord), '<p class="hv-strook__prijs">' + h(HV.euro(x.nu)) + '<span>' + h(t('за кВт·год · приклад', 'per kWh · voorbeeld')) + '</span></p>', '<p class="hv-gzx-vak__sub">' + HV.icoon('clock-3', { maat: 's' }) + h(x.later) + '</p>'),
      smal(ctx) ? '' : strookVak('hv-gzx-vak--stromen', h(t('Потоки зараз', 'Stromen nu')), '<ul class="hv-gzx-stromen">' + rijen + '</ul>', vandaag),
      strookVak('hv-gzx-vak--laden hv-toon-auto', h(t('Авто', 'Auto')) + punt + h(s.woord), '<p class="hv-gzx-vak__groot">' + HV.maat(Math.round(s.ev.lading), '%') + '<span class="hv-gzx-vak__naar">→ ' + s.ev.doel + ' %</span></p>' + balk(s.ev.lading, s.ev.doel, 'auto'),
        o.segment({ label: t('Режим зарядки', 'Laadstand'), waarde: s.modus, actie: 'gzx-laadmodus', opties: MODI().map(function (m) { return { id: m.id, label: m.tekst, icoon: m.icoon }; }), k: 'gzx-modus' }) + laadKnop(s, { klas: 'hv-gzx-breed' }))
    ];
    return strook('hv-gzx-strook--energie', delen, '<div class="hv-gzx-band"><p class="hv-gzx-band__label">' + h(t('ціна 24 год', 'prijs 24 uur')) + '</p>' + prijsBand(w, { uren: 24, hoogte: 40, elke: smal(ctx) ? 6 : 3 }) + '</div>');
  } });
  function balk(waarde, doel, toon) {
    return '<span class="hv-gzx-balk hv-toon-' + toon + '" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, waarde)).toFixed(1) + '%"></i>' + (doel != null ? '<b style="left:' + doel + '%"></b>' : '') + '</span>';
  }

  gezicht({ id: 'strook-beveiliging', profiel: 'strook', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    var w = ctx.staat, b = beveiliging(w), cam = HV.ui.lees('gzx-cam', 'cameravoor');
    var standen = o.segment({ label: t('Рівень охорони', 'Alarmstand'), waarde: b.stand, actie: 'gzx-alarm', klas: 'hv-gzx-standen', opties: ['uit', 'schil', 'nacht', 'volledig'].map(function (s) { return { id: s, label: HV.p(ALARM_KORT[s]), icoon: ALARM_ICOON[s] }; }), k: 'gzx-alarm' });
    var rijen = b.lijst.map(function (x) { return ingangRij(x); }).join('');
    var cams = smal(ctx) ? [cam] : [cam].concat(CAMERAS.filter(function (x) { return x !== cam; }));
    var delen = [
      strookTijd(ctx, b.zin, 'shield', t('Безпека', 'Beveiliging')),
      strookVak('hv-gzx-vak--alarm hv-toon-' + b.toon, h(t('Охорона', 'Alarm')), '<p class="hv-gzx-vak__woord">' + HV.icoon(b.icoon, { maat: 'l' }) + '<span>' + h(b.woord) + '</span></p>', standen),
      strookVak('hv-gzx-vak--ingangen', h(t('Входи', 'Toegangen')) + (b.open.length ? punt + h(b.open.length + ' ' + t('відчинено', 'open')) : ''), '<ul class="hv-gzx-ingangen">' + rijen + '</ul>', o.knop({ tekst: t('Замкнути все', 'Alles dicht'), icoon: 'lock', actie: 'gzx-dicht', uit: !b.open.length, klas: 'hv-gzx-breed', k: 'gzx-dicht' })),
      '<section class="hv-gzx-vak hv-gzx-vak--cams' + (cams.length > 1 ? ' is-drie' : '') + '"><p class="hv-strook__label">' + h(t('Камери', 'Camera’s')) + punt + h(t('кадр раз на 10 с', 'beeld elke 10 s')) + '</p><div class="hv-gzx-cams">' +
        cams.map(function (id) { return camBeeld(w, id, { actie: 'gzx-cam', gegevens: { cam: cams.length > 1 ? id : CAMERAS[(CAMERAS.indexOf(id) + 1) % CAMERAS.length] }, k: 'cam-' + id, klas: cams.length > 1 && cam === id ? 'is-gekozen' : '' }); }).join('') + '</div></section>'
    ];
    return strook('hv-gzx-strook--beveiliging', delen, HV.dagstrook(ctx, { kort: true }));
  } });
  function ingangRij(x) {
    var dicht = x.soort === 'slot' ? { tekst: t('Замкнути', 'Vergrendelen'), waarde: 'true' } : x.soort === 'poort' ? { tekst: t('Зачинити', 'Sluiten'), waarde: 'false' } : null;
    var knopHtml = !dicht ? '' : x.dicht ? '<span class="hv-gzx-ingang__ok">' + HV.icoon('check', { maat: 's' }) + '</span>' : o.knop({ tekst: dicht.tekst, klein: true, actie: 'gzx-ingang', gegevens: { doel: x.id, waarde: dicht.waarde }, k: 'gzx-ing-' + x.id });
    return '<li class="hv-gzx-ingang' + (x.dicht ? '' : ' is-open') + (x.wacht ? ' is-wacht' : '') + '">' + HV.icoon(x.icoon, { maat: 's' }) + '<span class="hv-gzx-ingang__naam">' + h(x.naam) + '<small>' + h(x.wacht ? HV.woord.wacht() : x.woord) + '</small></span>' + knopHtml + '</li>';
  }

  gezicht({ id: 'strook-klimaat', profiel: 'strook', titel: ['Клімат', 'Klimaat'], render: function (ctx) {
    var w = ctx.staat, lijst = kamersMetKlimaat(w).slice(0, smal(ctx) ? 2 : 3), wp = A(w).warmtepomp.st;
    var vakken = lijst.map(function (k) {
      var x = klimaatKamer(w, k);
      return strookVak('hv-gzx-vak--kamer hv-toon-warm' + (x.verwarmt ? ' is-bezig' : ''), h(HV.p(k.naam)) + punt + h(x.woord),
        '<p class="hv-strook__getal">' + (x.gemeten == null ? '—' : HV.maat(x.gemeten, '°C', 1)) + '</p>' + (x.vocht != null ? '<p class="hv-gzx-vak__sub">' + HV.icoon('droplets', { maat: 's' }) + h(t('вологість ', 'vocht ') + Math.round(x.vocht) + ' %') + '</p>' : ''),
        '<div class="hv-gzx-doel"><span>' + h(t('ціль', 'doel')) + '</span>' + o.stapper({ actie: 'gz-doel', gegevens: { kamer: k.id }, stap: 0.5, label: t('Ціль: ', 'Doel: ') + HV.p(k.naam), waarde: HV.maat(x.doel, '°C', 1), k: 'gzx-doel-' + k.id }) + '</div>');
    });
    var buiten = strookVak('hv-gzx-vak--buiten', h(t('Тепловий насос', 'Warmtepomp')) + punt + h(wp.verwarmt ? HV.woord.verwarmt() : t('відпочиває', 'rust')),
      '<dl class="hv-gzx-som"><div><dt>' + h(t('надворі', 'buiten')) + '</dt><dd>' + HV.maat(w.weer.temp, '°C') + '</dd></div><div><dt>' + h(t('подача', 'aanvoer')) + '</dt><dd>' + HV.maat(wp.aanvoer, '°C', 1) + '</dd></div><div><dt>COP</dt><dd>' + HV.getal(wp.cop, 1) + '</dd></div><div><dt>' + h(t('споживає', 'verbruik')) + '</dt><dd>' + HV.maat(wp.vermogen / 1000, kW(), 2) + '</dd></div></dl>',
      o.knop({ tekst: t('Усім кімнатам −1 °C', 'Alle kamers −1 °C'), icoon: 'thermometer-snowflake', actie: 'gzx-alle-doel', gegevens: { richting: -1 }, klas: 'hv-gzx-breed', k: 'gzx-alle-doel' }));
    return strook('hv-gzx-strook--klimaat', [strookTijd(ctx, klimaatZin(w), 'thermometer', t('Клімат', 'Klimaat'))].concat(vakken, [buiten]), HV.dagstrook(ctx, { kort: true }));
  } });

  gezicht({ id: 'strook-garage', profiel: 'strook', titel: ['Гараж', 'Garage'], render: function (ctx) {
    var w = ctx.staat, s = auto(w), deur = A(w).garagedeur, open = !!deur.st.open;
    var fietsen = tweewielers(w).map(function (v) { return '<li><span>' + HV.icoon(v.icoon, { maat: 's' }) + h(HV.p(v.naam)) + '</span><b>' + HV.maat(Math.round(v.lading), '%') + '</b>' + balk(v.lading, null, 'batterij') + '</li>'; }).join('');
    var delen = [
      strookTijd(ctx, s.zin, 'car', t('Гараж', 'Garage')),
      strookVak('hv-gzx-vak--auto hv-toon-auto' + (s.laadt ? ' is-bezig' : ''), h(HV.p(s.ev.naam)) + punt + h(s.woord), '<p class="hv-strook__getal">' + HV.maat(Math.round(s.ev.lading), '%') + '</p>' + balk(s.ev.lading, s.ev.doel, 'auto'), '<p class="hv-gzx-vak__sub">' + HV.icoon('route', { maat: 's' }) + h(s.ev.bereik + t(' км запасу · ціль ', ' km bereik · doel ') + s.ev.doel + ' %') + '</p>'),
      strookVak('hv-gzx-vak--laden', h(t('Зарядка', 'Laden')) + punt + (s.laadt ? HV.maat(s.kw, kW(), 1) : h(t('стоїть', 'staat stil'))), '<p class="hv-gzx-vak__groot">' + (s.laadt ? h(HV.tijd(s.klaar)) + '<span class="hv-gzx-vak__naar">' + h(t('буде ', 'klaar ') + s.ev.doel + ' %') + '</span>' : h(s.vol ? t('готово', 'klaar') : t('о ', 'om ') + HV.tijd(HV.tarief.goedkoopst(w.tijd, 12).tijd)) + '<span class="hv-gzx-vak__naar">' + h(s.vol ? t('ціль досягнуто', 'doel bereikt') : t('найдешевша година', 'goedkoopste uur')) + '</span>') + '</p>',
        o.segment({ label: t('Режим зарядки', 'Laadstand'), waarde: s.modus, actie: 'gzx-laadmodus', opties: MODI().map(function (m) { return { id: m.id, label: m.tekst, icoon: m.icoon }; }), k: 'gzx-modus' }) + laadKnop(s, { klas: 'hv-gzx-breed' })),
      strookVak('hv-gzx-vak--deur' + (open ? ' is-open' : ''), h(t('Гаражні ворота', 'Garagedeur')), '<p class="hv-gzx-vak__woord">' + HV.icoon('warehouse', { maat: 'l' }) + '<span>' + h(deur.wacht ? HV.woord.wacht() : open ? HV.woord.open() : HV.woord.dicht()) + '</span></p>' + (smal(ctx) ? '' : camBeeld(w, 'cameragarage', { klas: 'hv-gzx-cam--klein', k: 'cam-garage' })),
        o.knop({ tekst: open ? t('Зачинити', 'Sluiten') : t('Відчинити', 'Openen'), icoon: open ? 'arrow-down-to-line' : 'arrow-up-from-line', actie: 'gzx-ingang', gegevens: { doel: 'garagedeur', waarde: open ? 'false' : 'true' }, klas: 'hv-gzx-breed', k: 'gzx-garagedeur' })),
      smal(ctx) ? '' : strookVak('hv-gzx-vak--fietsen', h(t('Двоколісні', 'Tweewielers')), '<ul class="hv-gzx-fietsen">' + fietsen + '</ul>', '<p class="hv-gzx-vak__sub">' + HV.icoon('drone', { maat: 's' }) + h(w.drones.map(function (d) { return HV.p(d.naam) + ' ' + Math.round(d.lading) + ' %'; }).join(' · ')) + '</p>')
    ];
    return strook('hv-gzx-strook--garage', delen, HV.dagstrook(ctx, { kort: true }));
  } });

  gezicht({ id: 'strook-scenes', profiel: 'strook', titel: ['Сцени', 'Scènes'], render: function (ctx) {
    var w = ctx.staat, actief = w.sceneActief, sc = w.scenes.filter(function (s) { return s.id === actief; })[0];
    var zin = sc ? t('Діє сцена «', 'Scène ‘') + HV.p(sc.naam) + t('»; режим «', '’ is actief; stand ‘') + HV.p(HV.huisstanden[w.huisstand]) + t('».', '’.') : t('Режим «', 'Stand ‘') + HV.p(HV.huisstanden[w.huisstand]) + t('»; сцена не діє.', '’; geen scène actief.');
    var tegels = w.scenes.map(function (s) { return sceneTegel(s, s.id === actief); }).join('');
    var standen = STANDEN.slice(0, smal(ctx) ? 3 : 5).map(function (s) { return keuze({ tekst: HV.p(HV.huisstanden[s]), icoon: STAND_ICOON[s], actie: 'huisstand', gegevens: { waarde: s }, k: 'gzx-stand-' + s }, w.huisstand === s); }).join('');
    var delen = [
      strookTijd(ctx, zin, 'sparkles', t('Сцени', 'Scènes')),
      '<section class="hv-gzx-vak hv-gzx-vak--scenes"><p class="hv-strook__label">' + h(t('Сцени', 'Scènes')) + punt + h(t('дотик запускає', 'tik start')) + '</p><div class="hv-gzx-scenes">' + tegels + '</div></section>',
      strookVak('hv-gzx-vak--standen', h(t('Режим дому', 'Huisstand')), '<div class="hv-gzx-standen">' + standen + '</div>', o.knop({ tekst: t('Вимкнути все світло', 'Alle lampen uit'), icoon: 'lightbulb-off', actie: 'gzx-licht-uit', klas: 'hv-gzx-breed', k: 'gzx-licht-uit' }))
    ];
    return strook('hv-gzx-strook--scenes', delen, HV.dagstrook(ctx, { kort: true }));
  } });
  function sceneTegel(s, actief) {
    return '<button type="button" class="hv-gzx-scene' + (actief ? ' is-actief' : '') + '" data-actie="scene" data-scene="' + h(s.id) + '" data-k="gzx-scene-' + h(s.id) + '" aria-pressed="' + (actief ? 'true' : 'false') + '">' +
      '<span class="hv-gzx-scene__teken">' + HV.icoon(s.icoon) + '</span><span class="hv-gzx-scene__naam">' + h(HV.p(s.naam)) + '</span><span class="hv-gzx-scene__sub">' + h(actief ? t('діє', 'actief') : s.stappen.length + ' ' + HV.meervoud(s.stappen.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen'])) + '</span></button>';
  }

  // ═════════════════════════ KLEIN 800×480: два обличчя поруч і до чотирьох кнопок ═════════════════════════
  function klein(vlak1, vlak2, knoppen) { return '<div class="hv-klein hv-gzx-klein">' + vlak1 + vlak2 + '<div class="hv-klein__knoppen">' + knoppen.join('') + '</div></div>'; }
  function vlak(ctx, label, inhoud, klas) { return '<section class="hv-klein__vlak ' + (klas || '') + '">' + kop(ctx, h(label)) + inhoud + '</section>'; }

  gezicht({ id: 'klein-energie', profiel: 'klein', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var w = ctx.staat, x = energie(w), s = auto(w);
    return klein(
      vlak(ctx, t('Сальдо', 'Saldo'), '<p class="hv-gezicht__getal hv-toon-' + x.toon + '">' + x.getal + '</p><p class="hv-gezicht__toestand">' + h(x.woord + ' · ' + t('батарея ', 'batterij ') + Math.round(x.bat.lading) + ' %') + '</p>', 'hv-toon-' + x.toon),
      vlak(ctx, t('Ціна', 'Prijs') + ' · ' + x.niveauWoord, '<p class="hv-gezicht__getal">' + h(HV.euro(x.nu)) + '</p><p class="hv-gezicht__toestand">' + h(x.later) + '</p>' + prijsBand(w, { uren: 12, hoogte: 32, elke: 4 }), 'hv-gzx-prijsniveau--' + x.niveau),
      MODI().map(function (m) { return keuze({ tekst: m.tekst, icoon: m.icoon, actie: 'gzx-laadmodus', gegevens: { waarde: m.id }, k: 'gzx-m-' + m.id }, s.modus === m.id); }).concat([laadKnop(s)]));
  } });

  gezicht({ id: 'klein-beveiliging', profiel: 'klein', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    var w = ctx.staat, b = beveiliging(w);
    var knoppen = ['schil', 'nacht', 'volledig'].map(function (s) { return keuze({ tekst: HV.p(ALARM_KORT[s]), icoon: ALARM_ICOON[s], actie: 'gzx-alarm', gegevens: { waarde: s }, k: 'gzx-a-' + s }, b.stand === s); });
    knoppen.push(b.stand !== 'uit' ? o.knop({ tekst: t('Зняти охорону', 'Alarm uit'), icoon: 'shield-off', actie: 'gzx-alarm', gegevens: { waarde: 'uit' }, k: 'gzx-a-uit' }) : o.knop({ tekst: t('Замкнути все', 'Alles dicht'), icoon: 'lock', actie: 'gzx-dicht', uit: !b.open.length, k: 'gzx-dicht' }));
    return klein(
      vlak(ctx, t('Охорона', 'Alarm'), '<p class="hv-gezicht__woord hv-gzx-woord">' + HV.icoon(b.icoon, { maat: 'xl' }) + '<span>' + h(b.woord) + '</span></p><p class="hv-gezicht__toestand">' + h(b.toestand) + '</p>', 'hv-toon-' + b.toon),
      vlak(ctx, t('Біля входу', 'Bij de voordeur'), camBeeld(w, 'cameravoor', { klas: 'hv-gzx-cam--vlak', k: 'cam-klein' }) + '<p class="hv-gzx-regel">' + HV.icoon('bell-ring', { maat: 's' }) + h(b.bel ? t('дзвонили о ', 'aangebeld om ') + HV.tijd(b.bel) : t('сьогодні тихо', 'vandaag stil')) + '</p>'),
      knoppen);
  } });

  gezicht({ id: 'klein-klimaat', profiel: 'klein', titel: ['Клімат', 'Klimaat'], render: function (ctx) {
    var w = ctx.staat, g = gekozenKamer(w), x = g.x;
    var rijen = g.lijst.slice(0, 5).map(function (k, n) {
      var y = klimaatKamer(w, k);
      return '<button type="button" class="hv-gzx-kamerrij' + (n === g.i ? ' is-gekozen' : '') + '" data-actie="ui" data-naam="gzx-kamer" data-waarde="' + n + '" aria-pressed="' + (n === g.i ? 'true' : 'false') + '" data-k="gzx-kr-' + k.id + '"><span>' + h(HV.p(k.naam)) + '</span><b>' + (y.gemeten == null ? '—' : HV.maat(y.gemeten, '°C', 1)) + '</b><small>' + h(t('ціль ', 'doel ') + HV.getal(y.doel, 1)) + '</small></button>';
    }).join('');
    return '<div class="hv-klein hv-gzx-klein hv-gzx-klein--klimaat">' +
      vlak(ctx, HV.p(x.k.naam), o.wijzer({ doel: x.doel, gemeten: x.gemeten, toon: 'warm', bezig: x.verwarmt, actie: 'gz-wijzer', gegevens: { kamer: x.k.id }, label: t('Ціль температури: ', 'Doeltemperatuur: ') + HV.p(x.k.naam), k: 'gzx-wijzer-' + x.k.id }), 'hv-gzx-klein__wijzer') +
      vlak(ctx, t('Кімнати', 'Kamers'), '<div class="hv-gzx-kamerlijst">' + rijen + '</div><p class="hv-gezicht__toestand">' + h(klimaatZin(w)) + '</p>') + '</div>';
  } });

  gezicht({ id: 'klein-garage', profiel: 'klein', titel: ['Гараж', 'Garage'], render: function (ctx) {
    var w = ctx.staat, s = auto(w), deur = A(w).garagedeur, open = !!deur.st.open;
    return klein(
      vlak(ctx, HV.p(s.ev.naam), '<p class="hv-gezicht__getal">' + HV.maat(Math.round(s.ev.lading), '%') + '</p>' + balk(s.ev.lading, s.ev.doel, 'auto') + '<p class="hv-gezicht__toestand">' + h(s.woord + ' · ' + s.eind) + '</p>', 'hv-toon-auto'),
      vlak(ctx, t('Гаражні ворота', 'Garagedeur'), '<p class="hv-gezicht__woord hv-gzx-woord">' + HV.icoon('warehouse', { maat: 'xl' }) + '<span>' + h(deur.wacht ? HV.woord.wacht() : open ? HV.woord.open() : HV.woord.dicht()) + '</span></p><ul class="hv-gzx-fietsen">' + tweewielers(w).slice(0, 3).map(function (v) { return '<li><span>' + HV.icoon(v.icoon, { maat: 's' }) + h(HV.p(v.naam)) + '</span><b>' + HV.maat(Math.round(v.lading), '%') + '</b>' + balk(v.lading, null, 'batterij') + '</li>'; }).join('') + '</ul>'),
      [keuze({ tekst: t('Розумно', 'Slim'), icoon: 'sparkles', actie: 'gzx-laadmodus', gegevens: { waarde: 'slim' }, k: 'gzx-m-slim' }, s.modus === 'slim'),
        keuze({ tekst: t('Швидко', 'Snel'), icoon: 'zap', actie: 'gzx-laadmodus', gegevens: { waarde: 'snel' }, k: 'gzx-m-snel' }, s.modus === 'snel'),
        laadKnop(s),
        o.knop({ tekst: open ? t('Зачинити ворота', 'Deur sluiten') : t('Відчинити ворота', 'Deur openen'), icoon: 'warehouse', actie: 'gzx-ingang', gegevens: { doel: 'garagedeur', waarde: open ? 'false' : 'true' }, k: 'gzx-garagedeur' })]);
  } });

  gezicht({ id: 'klein-scenes', profiel: 'klein', titel: ['Сцени', 'Scènes'], render: function (ctx) {
    var w = ctx.staat;
    return '<div class="hv-klein hv-gzx-klein hv-gzx-klein--scenes"><section class="hv-klein__vlak hv-gzx-klein__breed">' + kop(ctx, h(t('Сцени', 'Scènes'))) + '<div class="hv-gzx-scenes">' + w.scenes.map(function (s) { return sceneTegel(s, s.id === w.sceneActief); }).join('') + '</div></section>' +
      '<div class="hv-klein__knoppen">' + ['thuis', 'afwezig', 'nacht', 'gasten'].map(function (s) { return keuze({ tekst: HV.p(HV.huisstanden[s]), icoon: STAND_ICOON[s], actie: 'huisstand', gegevens: { waarde: s }, k: 'gzx-stand-' + s }, w.huisstand === s); }).join('') + '</div></div>';
  } });

  // ═════════════════════════ VIERKANT і ROND 480–720 ═════════════════════════
  // vierkант: папір на всю площу (як обличчя кімнати) — підпис, головне, стан, дії. rond: дуга по обідку, усе в колі 62 %.
  // klas 'hv-gzx-vk--stapel': дії двома рядами на всю ширину (перемикач режиму, під ним кнопка) — напис кнопки не ламається.
  function vierkant(ctx, label, midden, toestand, acties, klas) {
    return '<div class="hv-gezicht__binnen hv-gzx-vk' + (klas ? ' ' + klas : '') + '">' + kop(ctx, h(label)) + '<div class="hv-gzx-vk__midden">' + midden + '</div><p class="hv-gezicht__toestand">' + h(toestand) + '</p><div class="hv-gzx-vk__acties">' + acties + '</div></div>';
  }
  function rond(ctx, deel, toon, label, midden, toestand, acties, klas) {
    return '<span class="hv-gzx-rond__papier" aria-hidden="true"></span>' + boogSvg(deel, toon, 'hv-gzx-boog--rand ' + (klas || '')) + '<div class="hv-gezicht__binnen hv-gzx-rond">' + kop(ctx, h(label)) + midden + '<p class="hv-gezicht__toestand">' + h(toestand) + '</p><div class="hv-gezicht__rij hv-gzx-rond__acties">' + acties + '</div></div>';
  }
  /** Шкала сальдо: −5…+5 кВт, нуль угорі; дуга від нуля в бік напряму. */
  function saldoSchaal(x) {
    var v = Math.max(-5, Math.min(5, x.e.net)), R = 44, hoek = function (k) { var a = (-90 + k * 135) * Math.PI / 180; return [50 + R * Math.cos(a), 50 + R * Math.sin(a)]; };
    var a = hoek(0), b = hoek(v / 5), groot = 0, zw = v >= 0 ? 1 : 0;
    return '<svg class="hv-gzx-schaal hv-toon-' + x.toon + '" viewBox="0 0 100 100" aria-hidden="true"><circle class="hv-gzx-boog__baan" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 50 50)"/>' +
      (Math.abs(v) > 0.02 ? '<path class="hv-gzx-schaal__vulling" d="M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + groot + ' ' + zw + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + '"/>' : '') +
      '<line class="hv-gzx-schaal__nul" x1="50" y1="2" x2="50" y2="12"/></svg>';
  }

  gezicht({ id: 'vierkant-energie', profiel: 'vierkant', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var w = ctx.staat, x = energie(w), s = auto(w);
    return vierkant(ctx, t('Енергія', 'Energie') + ' · ' + x.woord, '<div class="hv-gzx-meter">' + saldoSchaal(x) + '<div class="hv-gzx-meter__midden"><span class="hv-gezicht__getal hv-toon-' + x.toon + '">' + x.getal + '</span><span class="hv-gzx-meter__sub">' + h(HV.euro(x.nu) + ' · ' + x.niveauWoord) + '</span></div><span class="hv-gzx-meter__in">' + h(t('з мережі', 'afname')) + '</span><span class="hv-gzx-meter__uit">' + h(t('у мережу', 'teruglevering')) + '</span></div>',
      x.later, laadKnop(s, { klas: 'hv-gzx-breed' }));
  } });
  gezicht({ id: 'rond-energie', profiel: 'rond', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var w = ctx.staat, x = energie(w), s = auto(w);
    return rond(ctx, Math.min(1, Math.abs(x.e.net) / 8), x.toon, t('Енергія', 'Energie'), '<p class="hv-gezicht__getal hv-toon-' + x.toon + '">' + x.getal + '</p>', x.woord + ' · ' + HV.euro(x.nu), laadKnop(s));
  } });

  gezicht({ id: 'vierkant-beveiliging', profiel: 'vierkant', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    var w = ctx.staat, b = beveiliging(w), volgende = volgendeAlarm(w);
    var acties = o.knop({ tekst: t('Замкнути все', 'Alles dicht'), icoon: 'lock', actie: 'gzx-dicht', uit: !b.open.length, k: 'gzx-dicht' }) +
      (b.stand === 'uit' ? o.knop({ tekst: t('Охорона: ', 'Alarm: ') + HV.p(ALARM_KORT[volgende]), icoon: ALARM_ICOON[volgende], actie: 'gzx-alarm', gegevens: { waarde: volgende }, k: 'gzx-a-aan' }) : o.knop({ tekst: t('Зняти охорону', 'Alarm uit'), icoon: 'shield-off', actie: 'gzx-alarm', gegevens: { waarde: 'uit' }, k: 'gzx-a-uit' }));
    return vierkant(ctx, t('Безпека', 'Beveiliging'), '<p class="hv-gzx-schild hv-toon-' + b.toon + '">' + HV.icoon(b.icoon, { maat: 'xl' }) + '<span class="hv-gezicht__woord">' + h(b.woord) + '</span></p><ul class="hv-gzx-ingangen hv-gzx-ingangen--kort">' + b.lijst.map(function (x) { return '<li class="' + (x.dicht ? '' : 'is-open') + '">' + HV.icoon(x.dicht ? 'check' : 'triangle-alert', { maat: 's' }) + '<span>' + h(x.naam) + '</span></li>'; }).join('') + '</ul>', b.open.length ? b.toestand : t('усе зачинено', 'alles dicht'), acties);
  } });
  gezicht({ id: 'rond-beveiliging', profiel: 'rond', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    var w = ctx.staat, b = beveiliging(w), dicht = b.lijst.filter(function (x) { return x.dicht; }).length;
    return rond(ctx, dicht / b.lijst.length, b.open.length ? 'let-op' : 'rust', t('Охорона', 'Alarm'), '<p class="hv-gzx-schild hv-toon-' + b.toon + '">' + HV.icoon(b.icoon, { maat: 'l' }) + '<span class="hv-gezicht__woord">' + h(b.woord) + '</span></p>',
      b.open.length ? b.open.length + ' ' + t('відчинено', 'open') : t('усе зачинено', 'alles dicht'),
      o.knop({ tekst: t('Замкнути все', 'Alles dicht'), icoon: 'lock', actie: 'gzx-dicht', uit: !b.open.length, k: 'gzx-dicht' }));
  } });

  gezicht({ id: 'vierkant-garage', profiel: 'vierkant', titel: ['Авто', 'Auto'], render: function (ctx) {
    var w = ctx.staat, s = auto(w);
    return vierkant(ctx, HV.p(s.ev.naam), '<div class="hv-gzx-meter">' + boogSvg(s.ev.lading / 100, 'auto', 'hv-gzx-boog--meter') + '<div class="hv-gzx-meter__midden"><span class="hv-gezicht__getal">' + HV.maat(Math.round(s.ev.lading), '%') + '</span><span class="hv-gzx-meter__sub">' + h(s.ev.bereik + t(' км', ' km')) + '</span></div></div>',
      s.woord + ' · ' + s.eind, o.segment({ label: t('Режим зарядки', 'Laadstand'), waarde: s.modus, actie: 'gzx-laadmodus', opties: MODI().map(function (m) { return { id: m.id, label: m.tekst }; }), k: 'gzx-modus' }) + laadKnop(s, { klas: 'hv-gzx-breed' }), 'hv-gzx-vk--stapel');
  } });
  gezicht({ id: 'rond-garage', profiel: 'rond', titel: ['Авто', 'Auto'], render: function (ctx) {
    var w = ctx.staat, s = auto(w);
    return rond(ctx, s.ev.lading / 100, 'auto', HV.p(s.ev.naam), '<p class="hv-gezicht__getal">' + HV.maat(Math.round(s.ev.lading), '%') + '</p>', s.woord + ' · ' + s.eind, laadKnop(s));
  } });

  gezicht({ id: 'vierkant-scenes', profiel: 'vierkant', titel: ['Сцени', 'Scènes'], render: function (ctx) {
    var w = ctx.staat, sc = w.scenes.filter(function (s) { return s.id === w.sceneActief; })[0];
    return vierkant(ctx, t('Сцени', 'Scènes'), '<div class="hv-gzx-scenes hv-gzx-scenes--vier">' + w.scenes.slice(0, 4).map(function (s) { return sceneTegel(s, s.id === w.sceneActief); }).join('') + '</div>',
      sc ? t('діє «', 'actief: ‘') + HV.p(sc.naam) + t('»', '’') : t('режим «', 'stand ‘') + HV.p(HV.huisstanden[w.huisstand]) + t('»', '’'), o.knop({ tekst: t('Вимкнути все світло', 'Alle lampen uit'), icoon: 'lightbulb-off', actie: 'gzx-licht-uit', klas: 'hv-gzx-breed', k: 'gzx-licht-uit' }));
  } });
  gezicht({ id: 'rond-scenes', profiel: 'rond', titel: ['Сцена', 'Scène'], render: function (ctx) {
    var w = ctx.staat, s = sceneNu(w), actief = w.sceneActief === s.id;
    return rond(ctx, actief ? 1 : 0, 'aan', t('Сцена зараз', 'Scène nu'), '<p class="hv-gzx-schild hv-toon-aan">' + HV.icoon(s.icoon, { maat: 'l' }) + '<span class="hv-gezicht__woord">' + h(HV.p(s.naam)) + '</span></p>',
      actief ? t('діє', 'actief') : s.stappen.length + ' ' + HV.meervoud(s.stappen.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']),
      keuze({ tekst: actief ? t('Діє', 'Actief') : t('Запустити', 'Starten'), icoon: 'play', actie: 'scene', gegevens: { scene: s.id }, k: 'gzx-rond-scene' }, actief), 'hv-gzx-boog--aan');
  } });

  // ═════════════════════════ HORLOGE 200–400 ═════════════════════════
  // Та сама анатомія, що в обличь Дому: підпис · слово чи число · рядок стану · одна дія · «‹ ● ›».
  function horloge(ctx, label, hoofdHtml, toestand, actie) {
    return kop(ctx, h(label)) + hoofdHtml + '<p class="hv-gezicht__toestand">' + h(toestand) + '</p>' + actie;
  }
  var hActie = function (p) { return '<button type="button" class="hv-knop hv-knop--gewoon hv-gezicht__actie" data-actie="' + p.actie + '"' + HV.attrs(p.gegevens) + (p.uit ? ' aria-disabled="true"' : '') + '>' + HV.icoon(p.icoon, { maat: 's' }) + '<span>' + h(p.tekst) + '</span></button>'; };

  gezicht({ id: 'horloge-beveiliging', profiel: 'horloge', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    var w = ctx.staat, b = beveiliging(w), volgende = volgendeAlarm(w);
    var actie = b.open.length ? hActie({ actie: 'gzx-dicht', icoon: 'lock', tekst: t('Замкнути все', 'Alles dicht') })
      : b.stand === 'uit' ? hActie({ actie: 'gzx-alarm', gegevens: { waarde: volgende }, icoon: ALARM_ICOON[volgende], tekst: t('Охорона: ', 'Alarm: ') + HV.p(ALARM_KORT[volgende]) })
      : hActie({ actie: 'gzx-alarm', gegevens: { waarde: 'uit' }, icoon: 'smartphone', tekst: t('Зняти охорону', 'Alarm uit') });
    return horloge(ctx, t('Охорона', 'Alarm'), '<p class="hv-gezicht__woord hv-toon-' + (b.open.length ? 'let-op' : b.toon) + '">' + h(b.woord) + '</p>', b.open.length ? b.open.length + ' ' + t('відчинено', 'open') : t('усе зачинено', 'alles dicht'), actie);
  } });
  gezicht({ id: 'horloge-klimaat', profiel: 'horloge', titel: ['Клімат', 'Klimaat'], render: function (ctx) {
    var w = ctx.staat, x = klimaatKamer(w, HV.staat.kamer('woonkamer'));
    return horloge(ctx, HV.p(x.k.naam), '<p class="hv-gezicht__getal">' + HV.maat(x.gemeten, '°C', 1) + '</p>', x.woord + t(' · ціль ', ' · doel ') + HV.getal(x.doel, 1) + ' °C',
      '<div class="hv-gezicht__actie hv-gzx-horloge__stapper">' + o.stapper({ actie: 'gz-doel', gegevens: { kamer: x.k.id }, stap: 0.5, label: t('Ціль температури', 'Doeltemperatuur'), waarde: HV.maat(x.doel, '°C', 1), k: 'gzx-h-doel' }) + '</div>');
  } });
  gezicht({ id: 'horloge-auto', profiel: 'horloge', titel: ['Авто', 'Auto'], render: function (ctx) {
    var w = ctx.staat, s = auto(w);
    return horloge(ctx, t('Авто', 'Auto'), '<p class="hv-gezicht__getal hv-toon-auto">' + HV.maat(Math.round(s.ev.lading), '%') + '</p>', s.laadt ? t('до ', 'tot ') + s.ev.doel + ' %' + t(' о ', ' om ') + HV.tijd(s.klaar) : s.ev.bereik + t(' км', ' km') + ' · ' + s.woord,
      s.vol && !s.laadt ? '<button type="button" class="hv-knop hv-knop--gewoon hv-gezicht__actie" aria-pressed="true" aria-disabled="true">' + HV.icoon('check', { maat: 's' }) + '<span>' + h(t('Заряджено', 'Vol genoeg')) + '</span></button>' : hActie({ actie: 'gzx-laden', icoon: s.laadt ? 'circle-stop' : 'plug-zap', tekst: s.laadt ? t('Зупинити', 'Stoppen') : t('Заряджати', 'Laden') }));
  } });
  gezicht({ id: 'horloge-scene', profiel: 'horloge', titel: ['Сцена', 'Scène'], render: function (ctx) {
    var w = ctx.staat, s = sceneNu(w), actief = w.sceneActief === s.id;
    return horloge(ctx, t('Сцена', 'Scène'), '<p class="hv-gezicht__woord">' + h(HV.p(s.naam)) + '</p>', actief ? t('діє зараз', 'nu actief') : t('доречна зараз', 'past nu'),
      actief ? hActie({ actie: 'gzx-licht-uit', icoon: 'lightbulb-off', tekst: t('Вимкнути світло', 'Lampen uit') }) : hActie({ actie: 'scene', gegevens: { scene: s.id }, icoon: 'play', tekst: t('Запустити', 'Starten') }));
  } });

  // ═════════════════════════ DEUR 480×800: hv-pincode, «Йду / Я вдома», двері ═════════════════════════
  // До коду — час, погода, виклик і «Ввести код». Приймається особистий код мешканця або гостьовий зі строком (не код панелі).
  // Після коду — «Йду», «Я вдома», двері; екран замикається через 30 с без дотику або кнопкою. П'ять помилок — пауза 5 хв.
  var CODES = { '2468': 'olena', '1357': 'taras', '9090': 'iryna' };
  var DEUR_MS = 30000;
  function deurStaat() { var d = HV.ui.lees('gzx-deur', null); if (!d) { d = { stap: 'rust', invoer: '', fouten: 0, wie: null, sinds: 0, pauzeTot: 0, melding: null, sos: 0 }; HV.ui.zet('gzx-deur', d); } return d; }
  function persoon(id) { return HV.staat.w.mensen.filter(function (m) { return m.id === id; })[0]; }
  function rolVan(id) { var r = HV.paspoort.rollen.filter(function (x) { return x.persoon === id; })[0]; return r ? r.id : (persoon(id) && persoon(id).gast ? 'gast' : 'bewoner'); }

  gezicht({ id: 'deur-toegang', profiel: 'deur', titel: ['Вхід', 'Toegang'], render: function (ctx) {
    var w = ctx.staat, d = deurStaat(), weer = HV.hemel.weer(w), nu = Date.now();
    if (d.stap === 'open' && nu - d.sinds > DEUR_MS) { d.stap = 'rust'; d.wie = null; d.melding = t('Екран замкнено: 30 с без дотику', 'Scherm vergrendeld: 30 s zonder aanraking'); }
    var pauze = d.pauzeTot > w.tijd;
    var boven = kop(ctx, h(HV.paspoort.adres)) + '<p class="hv-gezicht__getal">' + HV.tijd(w.tijd) + '</p><p class="hv-deur__weer">' + HV.icoon(weer.icoon, { maat: 'l' }) + '<span>' + h(weer.tekst) + '</span></p>';
    var lijf;
    if (d.sos) {
      var rest = Math.max(0, 5 - Math.floor((nu - d.sos) / 1000));
      lijf = '<div class="hv-gzx-sos" role="alertdialog" aria-labelledby="gzx-sos-titel"><p class="hv-gzx-sos__teken">' + HV.icoon('siren', { maat: 'xl' }) + '</p><h2 id="gzx-sos-titel">' + h(t('Справді тривога?', 'Echt alarm?')) + '</h2><p>' + h(t('Сирена ввімкнеться, дорослі отримають сповіщення.', 'De sirene gaat aan en de volwassenen krijgen een melding.')) + '</p>' +
        '<button type="button" class="hv-knop hv-knop--gevaar hv-gzx-breed" data-actie="gzx-deur" data-stap="sos-ja"' + (rest > 0 ? ' aria-disabled="true"' : '') + '>' + HV.icoon('siren', { maat: 's' }) + '<span>' + h(rest > 0 ? t('Так, тривога — через ', 'Ja, alarm — over ') + rest + ' с' : t('Так, тривога', 'Ja, alarm')) + '</span></button>' +
        o.knop({ tekst: t('Скасувати', 'Annuleren'), icoon: 'x', actie: 'gzx-deur', gegevens: { stap: 'sos-nee' }, klas: 'hv-gzx-breed', k: 'gzx-sos-nee' }) + '</div>';
    } else if (d.stap === 'code') {
      var stippen = ''; for (var i = 0; i < 4; i++) stippen += '<i class="' + (i < d.invoer.length ? 'is-vol' : '') + '"></i>';
      var toetsen = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'wis', '0', 'ok'].map(function (c) {
        if (c === 'wis') return '<button type="button" class="hv-gzx-toets hv-gzx-toets--stil" data-actie="gzx-deur" data-stap="wis" aria-label="' + h(t('Стерти цифру', 'Cijfer wissen')) + '">' + HV.icoon('delete', { maat: 'm' }) + '</button>';
        if (c === 'ok') return '<button type="button" class="hv-gzx-toets hv-gzx-toets--stil" data-actie="gzx-deur" data-stap="annuleer" aria-label="' + h(t('Скасувати', 'Annuleren')) + '">' + HV.icoon('x', { maat: 'm' }) + '</button>';
        return '<button type="button" class="hv-gzx-toets" data-actie="gzx-deur" data-stap="cijfer" data-cijfer="' + c + '"' + (pauze ? ' aria-disabled="true"' : '') + '>' + c + '</button>';
      }).join('');
      lijf = '<div class="hv-pincode hv-gzx-pincode"><p class="hv-pincode__titel">' + h(pauze ? t('Пауза після п’яти помилок до ', 'Pauze na vijf fouten tot ') + HV.tijd(d.pauzeTot) : t('Особистий або гостьовий код', 'Persoonlijke code of gastcode')) + '</p>' +
        '<p class="hv-pincode__stippen' + (d.melding ? ' is-fout' : '') + '" aria-live="polite" aria-label="' + h(t('Введено цифр: ', 'Ingevoerde cijfers: ') + d.invoer.length) + '">' + stippen + '</p>' +
        '<p class="hv-pincode__melding" role="status">' + h(d.melding || (d.fouten ? t('Хибний код · спроба ', 'Onjuiste code · poging ') + (d.fouten + 1) + t(' з 5', ' van 5') : t('Симуляція: 2468 — Олена, 1357 — Тарас, 9090 — гість', 'Simulatie: 2468 — Olena, 1357 — Taras, 9090 — gast'))) + '</p>' +
        '<div class="hv-pincode__toetsen">' + toetsen + '</div></div>';
    } else if (d.stap === 'open') {
      var m = persoon(d.wie), rol = rolVan(d.wie), weg = w.huisstand === 'afwezig' || w.huisstand === 'vakantie';
      var slot = A(w).voordeurslot, dicht = !!slot.st.vergrendeld;
      var rest2 = Math.max(0, Math.ceil((DEUR_MS - (nu - d.sinds)) / 1000));
      lijf = '<div class="hv-gzx-deur__na"><p class="hv-gzx-deur__wie">' + HV.icoon(rol === 'gast' ? 'user-round' : 'user', { maat: 's' }) + '<span>' + h((rol === 'gast' ? t('Гість · ', 'Gast · ') : t('Вітаю, ', 'Hallo, ')) + HV.p(m.naam)) + '</span>' +
        '<span class="hv-gzx-deur__aftel" aria-label="' + h(t('Замкнеться через ', 'Vergrendelt over ') + rest2 + ' с') + '"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="' + Math.round(rest2 / 30 * 100) + ' 100" transform="rotate(-90 18 18)"/></svg><b>' + rest2 + '</b></span></p>' +
        '<div class="hv-deur__knoppen">' + keuze({ tekst: t('Йду', 'Ik ga weg'), icoon: 'log-out', actie: 'gzx-deur-doe', gegevens: { wat: 'afwezig' }, k: 'gzx-weg' }, weg) + keuze({ tekst: t('Я вдома', 'Ik ben thuis'), icoon: 'log-in', actie: 'gzx-deur-doe', gegevens: { wat: 'thuis' }, k: 'gzx-thuis' }, w.huisstand === 'thuis') + '</div>' +
        '<div class="hv-gzx-deur__slot"><span>' + HV.icoon(dicht ? 'lock-keyhole' : 'lock-keyhole-open', { maat: 'm' }) + h(t('Вхідні двері: ', 'Voordeur: ') + (slot.wacht ? HV.woord.wacht() : dicht ? HV.woord.vergrendeld() : HV.woord.ontgrendeld())) + '</span>' +
        (dicht ? o.knop({ tekst: t('Відімкнути', 'Ontgrendelen'), icoon: 'lock-keyhole-open', actie: 'gzx-deur-doe', gegevens: { wat: 'open' }, k: 'gzx-ontgrendel' }) : o.knop({ tekst: t('Замкнути', 'Vergrendelen'), icoon: 'lock-keyhole', actie: 'gzx-deur-doe', gegevens: { wat: 'dicht' }, k: 'gzx-vergrendel' })) + '</div>' +
        o.knop({ tekst: t('Замкнути екран', 'Scherm vergrendelen'), icoon: 'lock', soort: 'stil', actie: 'gzx-deur', gegevens: { stap: 'vergrendel' }, klas: 'hv-gzx-breed', k: 'gzx-scherm-dicht' }) + '</div>';
    } else {
      lijf = '<div class="hv-gzx-deur__voor"><button type="button" class="hv-knop hv-knop--gewoon hv-deur__bel" data-actie="deur-bel">' + HV.icoon('bell-ring', { maat: 'l' }) + '<span>' + h(t('Подзвонити', 'Aanbellen')) + '</span></button>' +
        (d.melding ? '<p class="hv-gzx-deur__melding" role="status">' + HV.icoon('lock', { maat: 's' }) + h(d.melding) + '</p>' : '<span></span>') + '</div>';
    }
    var onder = d.stap === 'rust' && !d.sos ? '<div class="hv-gzx-deur__onder">' + o.knop({ tekst: t('Ввести код', 'Code invoeren'), icoon: 'key-round', soort: 'hoofd', actie: 'gzx-deur', gegevens: { stap: 'code' }, klas: 'hv-gzx-breed', k: 'gzx-code' }) +
      o.icoonknop({ icoon: 'siren', aria: t('Тривожна кнопка', 'Noodknop'), actie: 'gzx-deur', gegevens: { stap: 'sos' }, klas: 'hv-gzx-sosknop' }) + '</div>' : '';
    return '<div class="hv-deur hv-gzx-deur is-' + d.stap + '">' + boven + lijf + onder + simMerk(w) + '</div>';
  } });

  // ═════════════════════════ INKT: чорне й біле, кнопки-номери, оновлення не частіше разу на хвилину ═════════════════════════
  var inktGeheugen = {}, inktVrijTot = 0, inktVerverst = null; // inktVerverst — час дому останнього ручного оновлення
  function inkt(ctx, id, bouwer) {
    var nu = Date.now(), sleutel = id + '|' + ctx.taal, x = inktGeheugen[sleutel];
    if (x && nu - x.echt < 60000 && nu > inktVrijTot) return x.html;
    var w = ctx.staat, html = bouwer(ctx);
    html = '<div class="hv-inkt hv-gzx-inkt">' + html + '<p class="hv-inkt__voet">' + h(t('Оновлено о ', 'Bijgewerkt om ') + HV.tijd(w.tijd) + t(' · не частіше разу на хвилину · симуляція · число = фізична кнопка', ' · hooguit eens per minuut · simulatie · cijfer = fysieke knop')) + '</p></div>';
    inktGeheugen[sleutel] = { echt: nu, html: html };
    return html;
  }
  function inktTegel(n, naam, woord, p) {
    var op = p || {};
    return '<button type="button" class="hv-inkt__tegel hv-gzx-inkt__tegel' + (op.aan ? ' is-aan' : '') + '" data-actie="' + op.actie + '"' + HV.attrs(op.gegevens) + ' data-nummer="' + n + '"' + (op.uit ? ' aria-disabled="true"' : '') + ' aria-keyshortcuts="' + n + '"><span class="hv-inkt__nummer">' + n + '</span><span class="hv-inkt__naam">' + h(naam) + '</span><span class="hv-inkt__woord">' + h(woord) + '</span></button>';
  }
  function inktGetallen(lijst) { return '<dl class="hv-gzx-inkt__getallen">' + lijst.map(function (x) { return '<div><dt>' + h(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>'; }

  gezicht({ id: 'inkt-energie', profiel: 'inkt', titel: ['Енергія', 'Energie'], render: function (ctx) {
    return inkt(ctx, 'energie', function () {
      var w = ctx.staat, x = energie(w), s = auto(w);
      return '<p class="hv-inkt__zin">' + h(x.zin) + '</p>' + inktGetallen([[x.woord, x.getal], [t('ціна зараз', 'prijs nu'), h(HV.euro(x.nu))], [t('найдешевше о ', 'goedkoopst om ') + HV.tijd(x.goed.tijd), h(HV.euro(x.goed.prijs))], [t('батарея', 'batterij'), HV.maat(Math.round(x.bat.lading), '%')], [t('сьогодні · приклад', 'vandaag · voorbeeld'), h(HV.euro(x.kosten))]]) +
        '<div class="hv-inkt__tegels">' + inktTegel(1, t('Авто ', 'Auto ') + Math.round(s.ev.lading) + ' %', s.vol && !s.laadt ? t('заряджено', 'vol genoeg') : s.laadt ? t('заряджається · зупинити', 'laadt · stoppen') : t('заряджати зараз', 'nu laden'), { actie: 'gzx-laden', aan: s.laadt, uit: s.vol && !s.laadt }) +
        inktTegel(2, t('Розумно', 'Slim'), t('заряджати за ціною', 'laden op prijs'), { actie: 'gzx-laadmodus', gegevens: { waarde: 'slim' }, aan: s.modus === 'slim' }) + inktTegel(3, t('Швидко', 'Snel'), t('11 кВт одразу', 'meteen 11 kW'), { actie: 'gzx-laadmodus', gegevens: { waarde: 'snel' }, aan: s.modus === 'snel' }) +
        inktTegel(4, t('Оновити', 'Verversen'), inktVerverst ? t('оновлено о ', 'ververst om ') + HV.tijd(inktVerverst) : t('екран зараз', 'scherm nu'), { actie: 'gzx-inkt-ververs' }) + '</div>';
    });
  } });
  gezicht({ id: 'inkt-beveiliging', profiel: 'inkt', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    return inkt(ctx, 'beveiliging', function () {
      var w = ctx.staat, b = beveiliging(w);
      return '<p class="hv-inkt__zin">' + h(b.zin) + '</p><ul class="hv-inkt__uitz">' + b.lijst.map(function (x) { return '<li>' + HV.icoon(x.dicht ? 'check' : 'triangle-alert') + '<span>' + h(x.naam + ': ' + x.woord) + '</span></li>'; }).join('') + '</ul>' +
        '<div class="hv-inkt__tegels">' + inktTegel(1, t('Замкнути все', 'Alles dicht'), b.open.length ? b.open.length + ' ' + t('відчинено', 'open') : t('усе зачинено', 'alles dicht'), { actie: 'gzx-dicht', uit: !b.open.length }) +
        ['schil', 'nacht', 'volledig'].map(function (s, n) { return inktTegel(n + 2, t('Охорона: ', 'Alarm: ') + HV.p(ALARM_KORT[s]), b.stand === s ? t('діє', 'actief') : t('увімкнути', 'inschakelen'), { actie: 'gzx-alarm', gegevens: { waarde: s }, aan: b.stand === s }); }).join('') + '</div>';
    });
  } });
  gezicht({ id: 'inkt-klimaat', profiel: 'inkt', titel: ['Клімат', 'Klimaat'], render: function (ctx) {
    return inkt(ctx, 'klimaat', function () {
      var w = ctx.staat, lijst = kamersMetKlimaat(w).slice(0, 3);
      var getallen = lijst.map(function (k) { var x = klimaatKamer(w, k); return [HV.p(k.naam) + t(' · ціль ', ' · doel ') + HV.getal(x.doel, 1), x.gemeten == null ? '—' : HV.maat(x.gemeten, '°C', 1)]; });
      getallen.push([t('надворі', 'buiten'), HV.maat(w.weer.temp, '°C')]);
      var woon = klimaatKamer(w, HV.staat.kamer('woonkamer'));
      return '<p class="hv-inkt__zin">' + h(klimaatZin(w)) + '</p>' + inktGetallen(getallen) +
        '<div class="hv-inkt__tegels">' + inktTegel(1, t('Вітальня −0,5', 'Woonkamer −0,5'), t('ціль ', 'doel ') + HV.getal(woon.doel - 0.5, 1) + ' °C', { actie: 'gz-doel', gegevens: { kamer: 'woonkamer', richting: -1, stap: 0.5 } }) +
        inktTegel(2, t('Вітальня +0,5', 'Woonkamer +0,5'), t('ціль ', 'doel ') + HV.getal(woon.doel + 0.5, 1) + ' °C', { actie: 'gz-doel', gegevens: { kamer: 'woonkamer', richting: 1, stap: 0.5 } }) +
        inktTegel(3, t('Усі −1 °C', 'Alle −1 °C'), t('усі кімнати', 'alle kamers'), { actie: 'gzx-alle-doel', gegevens: { richting: -1 } }) + inktTegel(4, t('Усі +1 °C', 'Alle +1 °C'), t('усі кімнати', 'alle kamers'), { actie: 'gzx-alle-doel', gegevens: { richting: 1 } }) + '</div>';
    });
  } });
  gezicht({ id: 'inkt-garage', profiel: 'inkt', titel: ['Гараж', 'Garage'], render: function (ctx) {
    return inkt(ctx, 'garage', function () {
      var w = ctx.staat, s = auto(w), deur = A(w).garagedeur;
      return '<p class="hv-inkt__zin">' + h(s.zin) + '</p>' + inktGetallen([[t('заряд', 'lading'), HV.maat(Math.round(s.ev.lading), '%')], [t('запас', 'bereik'), HV.maat(s.ev.bereik, t('км', 'km'))], [t('ворота', 'garagedeur'), h(deur.st.open ? HV.woord.open() : HV.woord.dicht())]].concat(tweewielers(w).slice(0, 1).map(function (v) { return [HV.p(v.naam), HV.maat(Math.round(v.lading), '%')]; }))) +
        '<div class="hv-inkt__tegels">' + inktTegel(1, t('Зарядка', 'Laden'), s.laadt ? t('зупинити', 'stoppen') : t('почати', 'starten'), { actie: 'gzx-laden', aan: s.laadt, uit: s.vol && !s.laadt }) +
        inktTegel(2, t('Розумно', 'Slim'), t('за ціною', 'op prijs'), { actie: 'gzx-laadmodus', gegevens: { waarde: 'slim' }, aan: s.modus === 'slim' }) +
        inktTegel(3, t('Пауза', 'Pauze'), t('не заряджати', 'niet laden'), { actie: 'gzx-laadmodus', gegevens: { waarde: 'pauze' }, aan: s.modus === 'pauze' }) +
        inktTegel(4, t('Ворота', 'Garagedeur'), deur.st.open ? t('зачинити', 'sluiten') : t('лише зачинення', 'alleen sluiten'), { actie: 'gzx-ingang', gegevens: { doel: 'garagedeur', waarde: 'false' }, uit: !deur.st.open }) + '</div>';
    });
  } });
  gezicht({ id: 'inkt-scenes', profiel: 'inkt', titel: ['Сцени', 'Scènes'], render: function (ctx) {
    return inkt(ctx, 'scenes', function () {
      var w = ctx.staat;
      var sc = w.scenes.filter(function (s) { return s.id === w.sceneActief; })[0];
      return '<p class="hv-inkt__zin">' + h(t('Режим «', 'Stand ‘') + HV.p(HV.huisstanden[w.huisstand]) + t('». Сцени — одним натиском.', '’. Scènes met één druk.')) + '</p>' +
        inktGetallen([[t('сцена діє', 'actieve scène'), h(sc ? HV.p(sc.naam) : '—')], [t('світло', 'lampen aan'), HV.kijk.lampenAan().length + ''], [t('удома', 'thuis'), HV.kijk.thuis().length + ' ' + h(HV.meervoud(HV.kijk.thuis().length, ['особа', 'особи', 'осіб'], ['persoon', 'personen']))], [t('режим дому', 'huisstand'), h(HV.p(HV.huisstanden[w.huisstand]))]]) +
        '<div class="hv-inkt__tegels hv-gzx-inkt__tegels--zes">' + w.scenes.map(function (s, n) { return inktTegel(n + 1, HV.p(s.naam), w.sceneActief === s.id ? t('діє', 'actief') : t('запустити', 'starten'), { actie: 'scene', gegevens: { scene: s.id }, aan: w.sceneActief === s.id }); }).join('') +
        inktTegel(w.scenes.length + 1, t('Усе світло', 'Alle lampen'), t('вимкнути', 'uitzetten'), { actie: 'gzx-licht-uit' }) + '</div>';
    });
  } });
  /** «Оновити»: екран перемальовується одразу; відгук — підпис плитки «оновлено о ГГ:ХВ» і коротке сповіщення (лише перегляд). */
  HV.actie('gzx-inkt-ververs', function () {
    var w = HV.staat.w;
    inktGeheugen = {}; inktVrijTot = Date.now() + 1500; inktVerverst = w.tijd;
    HV.meld({ icoon: 'refresh-cw', titel: t('Екран оновлено о ', 'Scherm ververst om ') + HV.tijd(w.tijd), tekst: t('Далі — само, раз на хвилину.', 'Daarna vanzelf, eens per minuut.') });
    HV.teken();
  }, { kijk: true });

  // ═════════════════════════ TV 1920×1080 (логічно 1280×720, масштаб ×1,5): пульт, фокус-кільце ═════════════════════════
  function tv(ctx, zin, rij, extra) {
    var w = ctx.staat;
    return '<div class="hv-tv hv-gzx-tv"><header class="hv-tv__kop"><p class="hv-tv__datum">' + h(HV.datum(w.tijd)) + ' ' + punt + ' ' + HV.tijd(w.tijd) + ' ' + simMerk(w) + '</p>' + o.versheid(w) + '</header>' +
      '<h1 class="hv-gzx-tv__zin">' + h(zin) + '</h1><div class="hv-gzx-tv__extra">' + (extra || '') + '</div><div class="hv-gzx-tv__rij">' + rij + '</div>' +
      '<p class="hv-gzx-tv__hint">' + HV.icoon('tv', { maat: 's' }) + h(t('Стрілки — вибір, OK — дія, «Назад» — обличчя Дому', 'Pijlen — kiezen, OK — actie, ‘Terug’ — wijzerplaat Thuis')) + '</p></div>';
  }
  function tvKaart(p) {
    var tag = p.actie ? 'button type="button" data-actie="' + p.actie + '"' + HV.attrs(p.gegevens) + (p.uit ? ' aria-disabled="true"' : '') + (p.gedrukt != null ? ' aria-pressed="' + (p.gedrukt ? 'true' : 'false') + '"' : '') : 'div';
    return '<' + tag + ' class="hv-tv__kaart hv-gzx-tv__kaart' + (p.klas ? ' ' + p.klas : '') + (p.gedrukt ? ' is-gekozen' : '') + '"' + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' + HV.icoon(p.icoon, { maat: 'l' }) + '<span class="hv-tv__naam">' + h(p.naam) + '</span><span class="hv-tv__waarde">' + p.waarde + '</span><span class="hv-tv__sub">' + h(p.sub || '') + '</span></' + (p.actie ? 'button' : 'div') + '>';
  }

  gezicht({ id: 'tv-energie', profiel: 'tv', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var w = ctx.staat, x = energie(w), s = auto(w);
    // сальдо, ціна й батарея — лише показники (не кнопки): пульт стає одразу на дві дії зарядки
    return tv(ctx, x.zin, tvKaart({ icoon: 'zap', naam: hoofd(x.woord), waarde: x.getal, sub: t('дім ', 'huis ') + HV.maatTekst(x.e.huis, kW(), 1), klas: 'hv-toon-' + x.toon, k: 'tv-saldo' }) +
      tvKaart({ icoon: 'euro', naam: t('Ціна зараз', 'Prijs nu'), waarde: h(HV.euro(x.nu)), sub: x.niveauWoord, k: 'tv-prijs' }) +
      tvKaart({ icoon: 'battery-medium', naam: t('Батарея', 'Batterij'), waarde: HV.maat(Math.round(x.bat.lading), '%'), sub: x.batWoord, k: 'tv-bat' }) +
      tvKaart({ icoon: s.laadt ? 'circle-stop' : 'plug-zap', naam: t('Авто · ', 'Auto · ') + Math.round(s.ev.lading) + ' %', waarde: '<span class="hv-tv__woord hv-gzx-tv__actiewoord">' + h(s.vol && !s.laadt ? t('готово', 'klaar') : s.laadt ? t('Зупинити', 'Stoppen') : t('Заряджати', 'Laden')) + '</span>', sub: s.eind, actie: s.vol && !s.laadt ? null : 'gzx-laden', k: 'tv-laden' }) +
      tvKaart({ icoon: 'sparkles', naam: t('Режим зарядки', 'Laadstand'), waarde: '<span class="hv-tv__woord hv-gzx-tv__actiewoord">' + h(MODI().filter(function (m) { return m.id === s.modus; })[0].tekst) + '</span>', sub: t('OK — змінити', 'OK — wisselen'), actie: 'gzx-laadmodus', gegevens: { waarde: s.modus === 'slim' ? 'snel' : s.modus === 'snel' ? 'pauze' : 'slim' }, k: 'tv-modus' }),
      '<div class="hv-gzx-tv__band">' + prijsBand(w, { uren: 24, hoogte: 36, elke: 3 }) + '</div>');
  } });

  gezicht({ id: 'tv-beveiliging', profiel: 'tv', titel: ['Безпека', 'Beveiliging'], render: function (ctx) {
    var w = ctx.staat, b = beveiliging(w), volgende = volgendeAlarm(w);
    var cams = '<div class="hv-gzx-tv__cams">' + CAMERAS.map(function (id) { return camBeeld(w, id, { actie: 'gzx-cam', gegevens: { cam: id }, k: 'tv-cam-' + id, klas: HV.ui.lees('gzx-cam', 'cameravoor') === id ? 'is-gekozen' : '' }); }).join('') + '</div>';
    return tv(ctx, b.zin, tvKaart({ icoon: b.icon || b.icoon, naam: t('Охорона', 'Alarm'), waarde: '<span class="hv-tv__woord">' + h(b.woord) + '</span>', sub: b.stand === 'uit' ? t('OK — ', 'OK — ') + HV.p(ALARM_KORT[volgende]) : t('зняти — на телефоні', 'uitzetten — op je telefoon'), actie: 'gzx-alarm', gegevens: { waarde: b.stand === 'uit' ? volgende : 'uit' }, k: 'tv-alarm' }) +
      tvKaart({ icoon: 'lock', naam: t('Входи', 'Toegangen'), waarde: '<span class="hv-tv__woord">' + h(b.open.length ? b.open.length + ' ' + t('відчинено', 'open') : t('зачинено', 'dicht')) + '</span>', sub: b.open.length ? t('OK — замкнути все', 'OK — alles dicht') : t('двері замкнено', 'deur op slot'), actie: 'gzx-dicht', uit: !b.open.length, k: 'tv-dicht' }) +
      tvKaart({ icoon: 'bell-ring', naam: t('Дзвінок', 'Deurbel'), waarde: '<span class="hv-tv__woord">' + h(b.bel ? HV.tijd(b.bel) : t('тихо', 'stil')) + '</span>', sub: t('OK — перевірити', 'OK — testen'), actie: 'deur-bel', k: 'tv-bel' }), cams);
  } });

  gezicht({ id: 'tv-klimaat', profiel: 'tv', titel: ['Клімат', 'Klimaat'], render: function (ctx) {
    var w = ctx.staat;
    var kaarten = kamersMetKlimaat(w).slice(0, 4).map(function (k) {
      var x = klimaatKamer(w, k);
      return '<div class="hv-tv__kaart hv-gzx-tv__kaart hv-gzx-tv__kamer hv-toon-warm" data-k="tv-k-' + k.id + '">' + HV.icoon(k.icoon || 'thermometer', { maat: 'l' }) + '<span class="hv-tv__naam">' + h(HV.p(k.naam) + ' · ' + x.woord) + '</span><span class="hv-tv__waarde">' + (x.gemeten == null ? '—' : HV.maat(x.gemeten, '°C', 1)) + '</span>' +
        '<span class="hv-gzx-doel">' + o.stapper({ actie: 'gz-doel', gegevens: { kamer: k.id }, stap: 0.5, label: t('Ціль: ', 'Doel: ') + HV.p(k.naam), waarde: HV.maat(x.doel, '°C', 1), k: 'tv-doel-' + k.id }) + '</span></div>';
    }).join('');
    return tv(ctx, klimaatZin(w), kaarten + tvKaart({ icoon: HV.hemel.weer(w).icoon, naam: t('Надворі', 'Buiten'), waarde: HV.maat(w.weer.temp, '°C'), sub: HV.hemel.weer(w).tekst.split(', ')[1] || '' }));
  } });

  gezicht({ id: 'tv-garage', profiel: 'tv', titel: ['Гараж', 'Garage'], render: function (ctx) {
    var w = ctx.staat, s = auto(w), deur = A(w).garagedeur, open = !!deur.st.open;
    return tv(ctx, s.zin, tvKaart({ icoon: s.laadt ? 'circle-stop' : 'plug-zap', naam: t('Зарядка', 'Laden'), waarde: '<span class="hv-tv__woord hv-gzx-tv__actiewoord">' + h(s.vol && !s.laadt ? t('готово', 'klaar') : s.laadt ? t('Зупинити', 'Stoppen') : t('Почати', 'Starten')) + '</span>', sub: s.laadt ? HV.maatTekst(s.kw, kW(), 1) : t('найдешевше о ', 'goedkoopst om ') + HV.tijd(HV.tarief.goedkoopst(w.tijd, 12).tijd), actie: s.vol && !s.laadt ? null : 'gzx-laden', k: 'tv-laden' }) +
      tvKaart({ icoon: 'sparkles', naam: t('Режим зарядки', 'Laadstand'), waarde: '<span class="hv-tv__woord hv-gzx-tv__actiewoord">' + h(MODI().filter(function (m) { return m.id === s.modus; })[0].tekst) + '</span>', sub: t('OK — наступний режим', 'OK — volgende stand'), actie: 'gzx-laadmodus', gegevens: { waarde: s.modus === 'slim' ? 'snel' : s.modus === 'snel' ? 'pauze' : 'slim' }, k: 'tv-modus' }) +
      tvKaart({ icoon: 'warehouse', naam: t('Гаражні ворота', 'Garagedeur'), waarde: '<span class="hv-tv__woord">' + h(open ? HV.woord.open() : HV.woord.dicht()) + '</span>', sub: open ? t('OK — зачинити', 'OK — sluiten') : t('відчинити — на телефоні', 'openen — op je telefoon'), actie: 'gzx-ingang', gegevens: { doel: 'garagedeur', waarde: open ? 'false' : 'true' }, k: 'tv-deur' }),
      '<div class="hv-gzx-tv__laad"><div class="hv-gzx-tv__laadkop"><span>' + h(HV.p(s.ev.naam)) + '</span><b>' + HV.maat(Math.round(s.ev.lading), '%') + '</b><span>' + h(t('ціль ', 'doel ') + s.ev.doel + ' % · ' + s.ev.bereik + t(' км', ' km')) + '</span></div>' + balk(s.ev.lading, s.ev.doel, 'auto') +
        '<ul class="hv-gzx-tv__fietsen">' + tweewielers(w).map(function (v) { return '<li>' + HV.icoon(v.icoon, { maat: 's' }) + '<span>' + h(HV.p(v.naam)) + '</span><b>' + HV.maat(Math.round(v.lading), '%') + '</b></li>'; }).join('') + '</ul></div>');
  } });

  gezicht({ id: 'tv-scenes', profiel: 'tv', titel: ['Сцени', 'Scènes'], render: function (ctx) {
    var w = ctx.staat;
    return tv(ctx, t('Режим «', 'Stand ‘') + HV.p(HV.huisstanden[w.huisstand]) + t('». Оберіть сцену пультом.', '’. Kies een scène met de afstandsbediening.'),
      w.scenes.map(function (s) { var actief = w.sceneActief === s.id; return tvKaart({ icoon: s.icoon, naam: t('Сцена', 'Scène'), waarde: '<span class="hv-tv__woord hv-gzx-tv__actiewoord">' + h(HV.p(s.naam)) + '</span>', sub: actief ? t('діє', 'actief') : s.stappen.length + ' ' + HV.meervoud(s.stappen.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']), actie: 'scene', gegevens: { scene: s.id }, gedrukt: actief, k: 'tv-s-' + s.id }); }).join('') +
      tvKaart({ icoon: 'lightbulb-off', naam: t('Світло', 'Licht'), waarde: '<span class="hv-tv__woord hv-gzx-tv__actiewoord">' + h(t('Усе вимкнути', 'Alles uit')) + '</span>', sub: HV.kijk.lampenAan().length + ' ' + t('світять', 'aan'), actie: 'gzx-licht-uit', k: 'tv-licht' }));
  } });

  // ───────────────────────── Дії облич ─────────────────────────
  HV.actie('gzx-laden', function () { var lp = HV.staat.apparaat('laadpaal'); HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: !HV.gewenst(lp, 'laden') }); });
  HV.actie('gzx-laadmodus', function (ctx, g) { HV.doe({ doel: 'laadpaal', mogelijkheid: 'modus', waarde: g.waarde }); });
  HV.actie('gzx-alarm', function (ctx, g) { if (HV.staat.apparaat('alarm').st.stand !== g.waarde) HV.doe({ doel: 'alarm', mogelijkheid: 'alarmstand', waarde: g.waarde }); });
  HV.actie('gzx-ingang', function (ctx, g) { HV.doe({ doel: g.doel, mogelijkheid: g.doel === 'voordeurslot' ? 'vergrendeld' : 'open', waarde: g.waarde === 'true' }); });
  HV.actie('gzx-cam', function (ctx, g) { HV.ui.zet('gzx-cam', g.cam); });
  HV.actie('gzx-licht-uit', function () { HV.doe({ doel: 'alle', mogelijkheid: 'licht', waarde: false }); });
  /** «Замкнути все»: замок, гаражні ворота й вхідні ворота — кожне окремою дією з власним записом у Журналі. */
  HV.actie('gzx-dicht', function () {
    var w = HV.staat.w, a = w.apparaten, stappen = [];
    if (!a.voordeurslot.st.vergrendeld) stappen.push({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: true });
    ['garagedeur', 'poort'].forEach(function (id) { if (a[id].st.open) stappen.push({ doel: id, mogelijkheid: 'open', waarde: false }); });
    var ramen = HV.kijk.alle(function (x) { return x.soort === 'contact' && x.raam && x.st.open; });
    if (!stappen.length) { HV.meld({ icoon: 'lock', titel: t('Усе вже замкнено', 'Alles is al dicht'), tekst: ramen.length ? t('Вікна зачиняють руками: ', 'Ramen sluit je met de hand: ') + ramen.map(function (x) { return HV.p(HV.staat.kamer(x.kamer).naam); }).join(', ') : '' }); return; }
    stappen.reduce(function (p, s) { return p.then(function () { return HV.doe(s); }); }, Promise.resolve());
  });
  /** Ціль усіх кімнат із термостатом чи ціллю: ±1 °C, кожна — окремою дією. */
  HV.actie('gzx-alle-doel', function (ctx, g) {
    var w = HV.staat.w, r = Number(g.richting) || -1;
    kamersMetKlimaat(w).forEach(function (k) {
      var x = klimaatKamer(w, k), v = Math.max(5, Math.min(30, x.doel + r));
      if (x.th) HV.doe({ doel: x.th.id, mogelijkheid: 'doel', waarde: v, stil: true });
      else HV.doe({ doel: 'kamer:' + k.id, mogelijkheid: 'doel', waarde: v, stil: true });
    });
    HV.meld({ icoon: 'thermometer', titel: t('Ціль усіх кімнат ', 'Doel van alle kamers ') + (r > 0 ? '+1' : '−1') + ' °C', tekst: t('Кожну зміну записано в Журнал.', 'Elke wijziging staat in het logboek.') });
  });

  // ── deur ──
  HV.actie('gzx-deur', function (ctx, g) {
    var d = deurStaat(), w = HV.staat.w;
    d.melding = null;
    switch (g.stap) {
      case 'code': d.stap = 'code'; d.invoer = ''; break;
      case 'annuleer': d.stap = 'rust'; d.invoer = ''; break;
      case 'wis': d.invoer = d.invoer.slice(0, -1); break;
      case 'vergrendel': d.stap = 'rust'; d.wie = null; d.melding = t('Екран замкнено', 'Scherm vergrendeld'); break;
      case 'sos': d.sos = Date.now(); setTimeout(function () { HV.teken(); }, 5100); break;
      case 'sos-nee': d.sos = 0; HV.logboek.voegToe({ maker: PANEEL, wat: ['Тривожну кнопку скасовано', 'Noodknop geannuleerd'], soort: 'huis.alarm' }); break;
      case 'sos-ja':
        if (Date.now() - d.sos < 5000) return;
        d.sos = 0;
        HV.logboek.voegToe({ maker: PANEEL, wat: ['Тривожна кнопка: тривога з дверної панелі', 'Noodknop: alarm vanaf het deurpaneel'], soort: 'huis.alarm', gewicht: 'alarm' });
        HV.staat.wijzig(function (x) { x.nu = x.nu.filter(function (n) { return n.id !== 'gzx-sos'; }); x.nu.push({ id: 'gzx-sos', soort: 'alarm', maker: 'knop', icoon: 'siren', sinds: x.tijd, tekst: ['Тривожна кнопка на дверній панелі', 'Noodknop op het deurpaneel'], acties: [{ naam: 'nu-weg', hoofd: true, label: ['Зрозуміло', 'Begrepen'] }] }); });
        HV.meld({ gewicht: 'alarm', icoon: 'siren', maker: PANEEL, titel: t('Тривогу піднято з дверей', 'Alarm vanaf de deur'), tekst: t('Сирена й сповіщення дорослим · симуляція', 'Sirene en melding aan de volwassenen · simulatie') });
        break;
      case 'cijfer':
        if (d.pauzeTot > w.tijd || d.invoer.length >= 8) return;
        d.invoer += g.cijfer;
        if (d.invoer.length >= 4) {
          var wie = CODES[d.invoer];
          if (wie) {
            d.stap = 'open'; d.wie = wie; d.sinds = Date.now(); d.invoer = ''; d.fouten = 0;
            HV.logboek.voegToe({ maker: { soort: 'mens', naam: persoon(wie).naam }, wat: ['Дверна панель: вхід за кодом', 'Deurpaneel: aangemeld met code'], waarom: rolVan(wie) === 'gast' ? ['гостьовий код', 'gastcode'] : ['особистий код', 'persoonlijke code'], soort: 'huis.toegang' });
          } else {
            d.fouten++; d.invoer = '';
            if (d.fouten >= 5) {
              d.pauzeTot = w.tijd + 5 * 60000; d.fouten = 0;
              d.melding = t('П’ять помилок: пауза 5 хв', 'Vijf fouten: 5 min pauze');
              HV.logboek.voegToe({ maker: PANEEL, wat: ['Дверна панель: п’ять хибних кодів, пауза 5 хв', 'Deurpaneel: vijf onjuiste codes, 5 min pauze'], soort: 'huis.toegang', gewicht: 'belangrijk' });
              HV.meld({ gewicht: 'belangrijk', icoon: 'shield-alert', maker: PANEEL, titel: t('П’ять хибних кодів на дверях', 'Vijf onjuiste codes bij de deur'), tekst: t('Панель чекає 5 хв.', 'Het paneel wacht 5 min.') });
            } else d.melding = t('Хибний код', 'Onjuiste code');
          }
        }
        break;
    }
    HV.ui.zet('gzx-deur', d);
  });
  var PANEEL = { soort: 'knop', naam: ['Дверна панель', 'Deurpaneel'] };
  HV.actie('gzx-deur-doe', function (ctx, g) {
    var d = deurStaat();
    if (d.stap !== 'open' || !d.wie) return;
    d.sinds = Date.now();
    var m = persoon(d.wie), door = { soort: 'mens', id: m.id, naam: m.naam, rol: rolVan(d.wie) };
    if (g.wat === 'afwezig' || g.wat === 'thuis') HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: g.wat, door: door, waarom: ['дверна панель', 'deurpaneel'] });
    else HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: g.wat !== 'open', door: door, waarom: ['дверна панель', 'deurpaneel'] });
    HV.ui.zet('gzx-deur', d);
  });

  // ═════════════════════════ PANEEL: кіоск /paneel/<profiel>/<id> ═════════════════════════
  var PROFIELEN = [
    { id: 'strook', icoon: 'rectangle-horizontal', naam: ['Стрічка', 'Strook'], uitleg: ['Час, сальдо, потоки, винятки й обране; стрічка доби внизу.', 'Tijd, saldo, stromen, uitzonderingen en favorieten; het etmaal onderaan.'] },
    { id: 'vierkant', icoon: 'square', naam: ['Квадратний', 'Vierkant'], uitleg: ['Обличчя кімнати з диском і «−/+».', 'Wijzerplaat van de kamer met schijf en ‘−/+’.'] },
    { id: 'rond', icoon: 'circle', naam: ['Круглий', 'Rond'], uitleg: ['Одне значення в колі, дуга по обідку.', 'Eén waarde in de cirkel, boog langs de rand.'] },
    { id: 'klein', icoon: 'tablet-smartphone', naam: ['Малий 800×480', 'Klein 800×480'], uitleg: ['Два обличчя поруч і до чотирьох кнопок.', 'Twee wijzerplaten naast elkaar en tot vier knoppen.'] },
    { id: 'deur', icoon: 'door-closed', naam: ['Дверна панель', 'Deurpaneel'], uitleg: ['До коду — час, погода, виклик; після коду — «Йду», «Я вдома», двері.', 'Vóór de code: tijd, weer, aanbellen; na de code: ‘Ik ga weg’, ‘Ik ben thuis’, de deur.'] },
    { id: 'horloge', icoon: 'watch', naam: ['Годинник', 'Horloge'], uitleg: ['Одне слово чи число, одна дія, «‹ ›».', 'Eén woord of getal, één actie, ‘‹ ›’.'] },
    { id: 'inkt', icoon: 'book-open-text', naam: ['Чорнило', 'Inkt'], uitleg: ['Чорне й біле, кнопки-номери, оновлення раз на хвилину.', 'Zwart en wit, cijferknoppen, eens per minuut ververst.'] },
    { id: 'tv', icoon: 'tv', naam: ['Телевізор', 'Televisie'], uitleg: ['Пульт: стрілки, OK, «Назад»; масштаб ×1,5.', 'Afstandsbediening: pijlen, OK, ‘Terug’; schaal ×1,5.'] }
  ];
  var KIOSK_STANDAARD = { rust: 2, nacht: 'rooster', helderheid: 30, inbrand: true, terug: 5, aanwezigheid: false, herstart: true };
  function kiosk() { var k = HV.opslag.lees('gzx-kiosk', null) || {}; var uit = {}; for (var s in KIOSK_STANDAARD) uit[s] = s in k ? k[s] : KIOSK_STANDAARD[s]; return uit; }
  var KIOSK_NAAM = {
    rust: ['Заставка', 'Rustscherm'], nacht: ['Нічне затемнення', 'Nachtdimmen'], helderheid: ['Яскравість уночі', 'Helderheid ’s nachts'], inbrand: ['Захист від вигоряння', 'Inbrandbescherming'],
    terug: ['Повернення до обличчя «Дім»', 'Terug naar wijzerplaat ‘Thuis’'], aanwezigheid: ['Присутність, режим і замки на екрані', 'Aanwezigheid, stand en sloten op het scherm'], herstart: ['Перезавантаження о 04:00', 'Herstart om 04:00']
  };
  function kioskWoord(s, v) {
    if (s === 'rust') return v ? [v + ' хв', v + ' min'] : ['ніколи', 'nooit'];
    if (s === 'terug') return v ? (v < 1 ? ['60 с', '60 s'] : [v + ' хв', v + ' min']) : ['ніколи', 'nooit'];
    if (s === 'nacht') return { uit: ['вимкнено', 'uit'], rooster: ['23:00–06:30', '23:00–06:30'], stand: ['з режимом «Ніч»', 'met stand ‘Nacht’'] }[v];
    if (s === 'helderheid') return [v + ' %', v + ' %'];
    return v ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'];
  }
  HV.actie('gzx-kiosk-zet', function (ctx, g) {
    var k = kiosk(), s = g.sleutel, oud = k[s];
    var nieuw = g.waarde !== undefined ? g.waarde : null;
    if (s === 'rust' || s === 'terug' || s === 'helderheid') nieuw = Number(nieuw);
    if (s === 'inbrand' || s === 'aanwezigheid' || s === 'herstart') nieuw = !oud;
    if (nieuw === oud) return;
    var zet = function (v) { var x = HV.opslag.lees('gzx-kiosk', null) || {}; x[s] = v; HV.opslag.schrijf('gzx-kiosk', x); };
    zet(nieuw);
    var naam = KIOSK_NAAM[s], was = kioskWoord(s, oud), werd = kioskWoord(s, nieuw);
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Кіоск: ' + naam[0].toLowerCase(), 'Kiosk: ' + naam[1].toLowerCase()], was: was, werd: werd, soort: 'huis.systeem' });
    // назва без значення й один чип «було → стало» (HV.meld із was/werd), а не значення двічі
    HV.meld({ maker: HV.mens(), icoon: 'tablet-smartphone', titel: [naam[0] + ': ' + werd[0], naam[1] + ': ' + werd[1]], was: was, werd: werd, terug: function () { zet(oud); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: кіоск, ' + naam[0].toLowerCase(), 'Ongedaan gemaakt: kiosk, ' + naam[1].toLowerCase()], soort: 'huis.systeem' }); HV.teken(); } });
    HV.teken();
  });
  HV.actie('gzx-kiosk-open', function (ctx, g) {
    var lijst = HV.gezichten.filter(function (x) { return x.profiel === g.profiel; });
    var i = Math.max(0, lijst.map(function (x) { return x.id; }).indexOf(g.gezicht));
    HV.opslag.schrijf('profiel', g.profiel);
    HV.ui.zet('gezicht-' + g.profiel, i);
    rust.aanraking = Date.now();
    HV.hemelSprong();
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Кіоск відкрито: /paneel/' + g.profiel + '/demo', 'Kiosk geopend: /paneel/' + g.profiel + '/demo'], soort: 'huis.systeem' });
    if (HV.pult && HV.pult.pas) HV.pult.pas();
    HV.teken();
  });
  HV.actie('gzx-rust-nu', function () { rust.geforceerd = 'rust'; rust.wakker = 0; tekenRust(); });
  HV.actie('gzx-nacht-nu', function () { rust.geforceerd = 'nacht'; rust.wakker = 0; tekenRust(); });
  HV.actie('gzx-inbrand-nu', function () { rust.verschuif = (rust.verschuif + 1) % 4; rust.verschoven = Date.now(); pasVerschuiving(); HV.teken(); });

  // ── сполучення: код із 6 цифр і QR на самому екрані ──
  function koppelCode() {
    var k = HV.opslag.lees('gzx-koppel', null);
    if (!k || Date.now() - k.sinds > 10 * 60000) { k = { code: String(100000 + Math.floor(Math.random() * 900000)), sinds: Date.now(), stand: 'wacht' }; HV.opslag.schrijf('gzx-koppel', k); }
    return k;
  }
  /** Візерунок, схожий на QR (не справжній код): три мітки кутів і модулі з цифр коду. */
  function qrSvg(code) {
    var n = 21, cel = '', zaad = Number(code) || 1;
    var rnd = function () { zaad = (zaad * 1103515245 + 12345) % 2147483648; return zaad / 2147483648; };
    var hoek = function (x, y) { return '<rect x="' + x + '" y="' + y + '" width="7" height="7" class="hv-gzx-qr__hoek"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" class="hv-gzx-qr__gat"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3"/>'; };
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if ((x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)) continue;
      if (rnd() > 0.52) cel += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    }
    return '<svg class="hv-gzx-qr" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" role="img" aria-label="' + h(t('Візерунок для сполучення (імітація QR)', 'Koppelpatroon (nagebootste QR)')) + '"><rect class="hv-gzx-qr__vlak" x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '"/>' + hoek(0, 0) + hoek(n - 7, 0) + hoek(0, n - 7) + cel + '</svg>';
  }
  HV.actie('gzx-koppel', function (ctx, g) {
    var k = koppelCode();
    if (g.stap === 'nieuw') { HV.opslag.schrijf('gzx-koppel', null); k = koppelCode(); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Новий код сполучення екрана', 'Nieuwe koppelcode voor het scherm'], soort: 'huis.systeem' }); HV.meld({ icoon: 'refresh-cw', titel: t('Новий код: ', 'Nieuwe code: ') + k.code.slice(0, 3) + ' ' + k.code.slice(3), tekst: t('Попередній більше не діє.', 'De vorige werkt niet meer.') }); }
    else if (g.stap === 'bevestig') {
      HV.schil.herbevestig({ titel: t('Підтвердьте, що це ви', 'Bevestig dat jij het bent'), tekst: t('Сполучення екрана дає йому сеанс із роллю «панель».', 'Koppelen geeft het scherm een sessie met de rol ‘paneel’.') }).then(function (ja) {
        if (!ja) return;
        k.stand = 'gekoppeld'; HV.opslag.schrijf('gzx-koppel', k);
        HV.logboek.voegToe({ maker: HV.mens(), wat: ['Екран сполучено: роль «панель»', 'Scherm gekoppeld: rol ‘paneel’'], waarom: ['код ' + k.code, 'code ' + k.code], soort: 'huis.systeem', gewicht: 'belangrijk' });
        HV.meld({ maker: HV.mens(), icoon: 'link-2', titel: t('Екран сполучено', 'Scherm gekoppeld'), tekst: t('Відкрийте кіоск — профіль задає адреса.', 'Open de kiosk — het profiel volgt uit het adres.'), terug: function () { k.stand = 'wacht'; HV.opslag.schrijf('gzx-koppel', k); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Сполучення екрана скасовано', 'Koppeling van het scherm ingetrokken'], soort: 'huis.systeem' }); HV.teken(); } });
        HV.teken();
      });
      return;
    } else if (g.stap === 'intrekken') {
      HV.opslag.schrijf('gzx-koppel', null);
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Сполучення екрана відкликано', 'Koppeling van het scherm ingetrokken'], soort: 'huis.systeem', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'unlink', titel: t('Сполучення відкликано', 'Koppeling ingetrokken'), tekst: t('Екран показує новий код.', 'Het scherm toont een nieuwe code.') });
    }
    HV.teken();
  });

  /** Мініатюра обличчя: справжня розмітка профілю в масштабі (те саме, що на екрані), лише для перегляду. */
  function rustHtml(ctx, opties) {
    var w = ctx.staat, z = HV.huiszin ? HV.huiszin(ctx) : { kort: '' }, k = kiosk(), weer = HV.hemel.weer(w), op = opties || {};
    var chips = [o.chip({ icoon: weer.icoon, tekst: weer.tekst }), o.chip({ icoon: 'thermometer', tekst: t('удома ', 'binnen ') + HV.maatTekst(w.apparaten.tempwoon.st.waarde, '°C', 1) }), o.chip({ icoon: 'zap', tekst: HV.euro(HV.tarief.prijs(w.tijd)) + t(' за кВт·год', ' per kWh') })];
    if (k.aanwezigheid) chips[2] = o.chip({ icoon: w.apparaten.voordeurslot.st.vergrendeld ? 'lock-keyhole' : 'lock-keyhole-open', tekst: HV.p(HV.huisstanden[w.huisstand]) + ' · ' + (w.apparaten.voordeurslot.st.vergrendeld ? HV.woord.vergrendeld() : HV.woord.ontgrendeld()) });
    return '<div class="hv-gzx-rust__lijf"' + (op.stijl ? ' style="' + op.stijl + '"' : '') + '><p class="hv-gzx-rust__klok">' + HV.tijd(w.tijd) + '</p><p class="hv-gzx-rust__datum">' + h(HV.datum(w.tijd)) + '</p>' +
      '<p class="hv-gzx-rust__zin">' + h(k.aanwezigheid ? z.kort : t('Дім на зв’язку.', 'Het huis is verbonden.')) + '</p><div class="hv-gzx-rust__chips">' + chips.join('') + '</div></div>';
  }

  function kioskTab(ctx) {
    var huidig = HV.opslag.lees('profiel', 'venster');
    var kaarten = PROFIELEN.map(function (p) {
      var lijst = HV.gezichten.filter(function (g) { return g.profiel === p.id; });
      var maat = HV.profielBeelden(p.id).map(function (b) { return b[0] + '×' + b[1]; }).join(' · ');
      return '<article class="hv-kaart hv-gzx-pk" data-k="gzx-pk-' + p.id + '"><header class="hv-gzx-pk__kop"><span class="hv-gzx-pk__teken">' + HV.icoon(p.icoon) + '</span><div><h3>' + h(HV.p(p.naam)) + '</h3><p>' + h(maat) + ' · /paneel/' + p.id + '/demo</p></div></header>' +
        '<p class="hv-gzx-pk__uitleg">' + h(HV.p(p.uitleg)) + '</p><div class="hv-gzx-pk__gezichten" role="list">' + lijst.map(function (g) { return o.chip({ tekst: HV.p(g.titel), actie: 'gzx-kiosk-open', gegevens: { profiel: p.id, gezicht: g.id }, klas: EIGEN[g.id] ? '' : 'is-thuis', aria: t('Відкрити кіоск: ', 'Kiosk openen: ') + HV.p(p.naam) + ' — ' + HV.p(g.titel) }); }).join('') + '</div>' +
        o.knop({ tekst: huidig === p.id ? t('Відкрито', 'Geopend') : t('Відкрити кіоск', 'Kiosk openen'), aria: (huidig === p.id ? t('Відкрито: ', 'Geopend: ') : t('Відкрити кіоск: ', 'Kiosk openen: ')) + HV.p(p.naam), icoon: 'maximize-2', soort: 'gewoon', klein: true, actie: 'gzx-kiosk-open', gegevens: { profiel: p.id, gezicht: lijst[0] ? lijst[0].id : '' }, k: 'gzx-open-' + p.id }) + '</article>';
    }).join('');
    var aantal = HV.gezichten.length;
    return '<div class="hv-gzx-paneel">' +
      '<section class="hv-gzx-intro"><div class="hv-gzx-intro__tekst"><p class="hv-gzx-intro__adres">huis.tarasevych.com/paneel/&lt;profiel&gt;/&lt;id&gt;</p><h2>' + h(t('Кіоск зовнішнього екрана', 'De kiosk van een extern scherm')) + '</h2>' +
      '<p>' + h(t('Без обрамлення платформи: лише обличчя профілю. Екран не засинає, через 2 хв спокою показує небо й годинник, уночі темнішає, раз на 10 хв зсувається на 2 px. Пульт макета вгорі перемикає профіль так само, як адреса.', 'Zonder de rand van het platform: alleen de wijzerplaat van het profiel. Het scherm slaapt niet, toont na 2 min rust de hemel en de klok, wordt ’s nachts donkerder en schuift elke 10 min 2 px op. De bediening van de maquette wisselt het profiel net als het adres.')) + '</p>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Показати заставку', 'Rustscherm tonen'), icoon: 'monitor-pause', soort: 'hoofd', actie: 'gzx-rust-nu', k: 'gzx-rust-nu' }) + o.knop({ tekst: t('Нічне затемнення', 'Nachtdimmen tonen'), icoon: 'moon', actie: 'gzx-nacht-nu', k: 'gzx-nacht-nu' }) + '</div>' +
      '<p class="hv-gzx-intro__tel">' + h(aantal + ' ' + t('облич на ', 'wijzerplaten op ') + PROFIELEN.length + t(' профілях · симуляція', ' profielen · simulatie')) + '</p></div>' +
      '<div class="hv-gzx-intro__voorbeeld" aria-hidden="true"><div class="hv-gzx-rust hv-gzx-rust--voorbeeld">' + rustHtml(ctx) + '</div></div></section>' +
      o.blok({ id: 'gzx-profielen', titel: t('Профілі й обличчя', 'Profielen en wijzerplaten'), teller: PROFIELEN.length, vast: true, inhoud: '<div class="hv-gzx-pk-rooster">' + kaarten + '</div>' }) + '</div>';
  }

  function rustTab(ctx) {
    var k = kiosk();
    var seg = function (s, opties) { return o.segment({ label: HV.p(KIOSK_NAAM[s]), waarde: k[s], actie: 'gzx-kiosk-zet', gegevens: { sleutel: s }, opties: opties, k: 'gzx-seg-' + s }); };
    var schak = function (s, icoon) { return o.schakel({ aan: !!k[s], icoon: icoon, toon: 'aan', actie: 'gzx-kiosk-zet', gegevens: { sleutel: s }, aria: HV.p(KIOSK_NAAM[s]) }); };
    var rij = function (icoon, s, sub, orgaan, extra) { return '<div class="hv-gzx-instel" data-k="gzx-in-' + s + '"><span class="hv-gzx-instel__teken">' + HV.icoon(icoon, { maat: 's' }) + '</span><div class="hv-gzx-instel__tekst"><p class="hv-gzx-instel__naam">' + h(HV.p(KIOSK_NAAM[s])) + (extra || '') + '</p><p class="hv-gzx-instel__sub">' + h(sub) + '</p></div><div class="hv-gzx-instel__orgaan">' + orgaan + '</div></div>'; };
    var risico = o.gevolg(t('Що може статися: з вулиці чи коридору видно, що вдома нікого немає і що охорону знято. Хто зможе це бачити: кожен, хто бачить екран, зокрема гості. Як вимкнути: цей самий перемикач.', 'Wat er kan gebeuren: vanaf de straat of de gang is te zien dat er niemand thuis is en dat het alarm uit staat. Wie dit kan zien: iedereen die het scherm ziet, ook gasten. Uitzetten: dezelfde schakelaar.'), { soort: 'uitroep', kop: t('Ризик: присутність на спільному екрані', 'Risico: aanwezigheid op een gedeeld scherm') });
    var instellingen = rij('monitor-pause', 'rust', t('Небо, годинник, речення й три чипи після спокою. Телевізор — 10 хв, чорнило й годинник — без заставки.', 'Hemel, klok, zin en drie chips na rust. Televisie 10 min; inkt en horloge zonder rustscherm.'), seg('rust', [{ id: 1, label: '1 ' + t('хв', 'min') }, { id: 2, label: '2 ' + t('хв', 'min') }, { id: 5, label: '5 ' + t('хв', 'min') }, { id: 0, label: t('ніколи', 'nooit') }])) +
      rij('moon', 'nacht', t('Уночі екран темнішає; дотик будить на 30 с і нічого не натискає.', '’s Nachts wordt het scherm donkerder; een tik wekt het 30 s en drukt niets in.'), seg('nacht', [{ id: 'uit', label: t('вимкнено', 'uit') }, { id: 'rooster', label: '23:00–06:30' }, { id: 'stand', label: t('з «Ніч»', 'met ‘Nacht’') }])) +
      '<div class="hv-gzx-instel hv-gzx-instel--schuif" data-k="gzx-in-helderheid"><span class="hv-gzx-instel__teken">' + HV.icoon('sun-dim', { maat: 's' }) + '</span><div class="hv-gzx-instel__tekst"><p class="hv-gzx-instel__naam">' + h(HV.p(KIOSK_NAAM.helderheid)) + '</p></div><div class="hv-gzx-instel__orgaan">' + o.schuif({ label: HV.p(KIOSK_NAAM.helderheid), waarde: k.helderheid, min: 10, max: 80, stap: 5, actie: 'gzx-helderheid', toon: 'aan', k: 'gzx-helderheid' }) + '</div></div>' +
      rij('move', 'inbrand', t('Зсув на 2 px кожні 10 хв; на OLED — темне тло без нерухомих світлих смуг. Зараз: ', 'Elke 10 min 2 px opschuiven; op OLED een donkere achtergrond zonder vaste lichte banen. Nu: ') + ['0, 0', '2, 0', '2, 2', '0, 2'][rust.verschuif] + ' px', schak('inbrand', 'move') + o.knop({ tekst: t('Зсунути', 'Opschuiven'), klein: true, actie: 'gzx-inbrand-nu', uit: !k.inbrand, k: 'gzx-inbrand-nu' })) +
      rij('house', 'terug', t('Обличчя «Дім» повертається само після спокою.', 'De wijzerplaat ‘Thuis’ komt na rust vanzelf terug.'), seg('terug', [{ id: 0.99, label: '60 ' + t('с', 's') }, { id: 5, label: '5 ' + t('хв', 'min') }, { id: 0, label: t('ніколи', 'nooit') }])) +
      rij('eye', 'aanwezigheid', t('Типово вимкнено: до коду прохідні екрани показують лише час, погоду й виклик.', 'Standaard uit: vóór de code tonen schermen in de doorloop alleen tijd, weer en aanbellen.'), schak('aanwezigheid', 'eye'), risico) +
      rij('rotate-cw', 'herstart', t('Щоночі о 04:00 кіоск перезавантажується; потік мовчить 2 хв — «немає зв’язку».', 'Elke nacht om 04:00 herstart de kiosk; zwijgt de stroom 2 min, dan ‘geen verbinding’.'), schak('herstart', 'rotate-cw'));
    return '<div class="hv-gzx-paneel hv-gzx-paneel--rust">' +
      o.blok({ id: 'gzx-gedrag', titel: t('Поведінка кіоску', 'Gedrag van de kiosk'), vast: true, inhoud: '<div class="hv-kaart hv-gzx-instellingen">' + instellingen + '</div>' }) +
      o.blok({ id: 'gzx-voorbeeld', titel: t('Заставка й ніч', 'Rustscherm en nacht'), vast: true, inhoud: '<div class="hv-gzx-voorbeelden"><figure class="hv-gzx-vb"><div class="hv-gzx-rust hv-gzx-rust--voorbeeld">' + rustHtml(ctx) + '</div><figcaption>' + h(t('Заставка: небо за часом дому', 'Rustscherm: hemel volgt huistijd')) + '</figcaption></figure>' +
        '<figure class="hv-gzx-vb"><div class="hv-gzx-rust hv-gzx-rust--voorbeeld is-nacht" style="--hv-gzx-helder:' + (k.helderheid / 100) + '">' + rustHtml(ctx) + '</div><figcaption>' + h(t('Ніч: яскравість ', 'Nacht: helderheid ') + k.helderheid + ' %') + '</figcaption></figure></div>' +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Показати заставку на цьому екрані', 'Rustscherm op dit scherm tonen'), icoon: 'monitor-pause', actie: 'gzx-rust-nu', k: 'gzx-rust-nu2' }) + o.knop({ tekst: t('Показати ніч', 'Nacht tonen'), icoon: 'moon', actie: 'gzx-nacht-nu', k: 'gzx-nacht-nu2' }) + '</div>' }) + '</div>';
  }
  HV.actie('gzx-helderheid', function (ctx, g) { if (g.fase === 'klaar') HV.acties['gzx-kiosk-zet'](ctx, { sleutel: 'helderheid', waarde: g.waarde }); });

  function koppelTab(ctx) {
    var k = koppelCode(), rest = Math.max(0, 10 * 60000 - (Date.now() - k.sinds)), min = Math.floor(rest / 60000), sec = Math.floor(rest % 60000 / 1000);
    var gekoppeld = k.stand === 'gekoppeld';
    var stappen = [[t('Відкрийте на особистому пристрої', 'Open op een persoonlijk apparaat'), t('Система → Екрани → «Сполучити новий екран».', 'Systeem → Schermen → ‘Nieuw scherm koppelen’.')], [t('Введіть код або наведіть камеру', 'Voer de code in of richt de camera'), t('Код діє 10 хв і лише один раз.', 'De code werkt 10 min en maar één keer.')], [t('Підтвердьте вхід', 'Bevestig je aanmelding'), t('Екран отримає сеанс із роллю «панель» — без облікового запису людини.', 'Het scherm krijgt een sessie met de rol ‘paneel’ — zonder account van een persoon.')]];
    return '<div class="hv-gzx-paneel"><section class="hv-gzx-koppel' + (gekoppeld ? ' is-gekoppeld' : '') + '"><div class="hv-gzx-koppel__scherm"><p class="hv-gzx-koppel__label">' + h(gekoppeld ? t('Цей екран сполучено', 'Dit scherm is gekoppeld') : t('Код сполучення', 'Koppelcode')) + '</p>' +
      (gekoppeld ? '<p class="hv-gzx-koppel__ok">' + HV.icoon('circle-check', { maat: 'xl' }) + '</p>' : '<p class="hv-gzx-koppel__code" aria-label="' + h(k.code.split('').join(' ')) + '">' + k.code.slice(0, 3) + '<span> </span>' + k.code.slice(3) + '</p>' + qrSvg(k.code)) +
      '<p class="hv-gzx-koppel__tijd">' + h(gekoppeld ? t('Роль «панель» · huis.tarasevych.com', 'Rol ‘paneel’ · huis.tarasevych.com') : t('діє ще ', 'nog geldig ') + min + ':' + (sec < 10 ? '0' : '') + sec) + '</p></div>' +
      '<div class="hv-gzx-koppel__tekst"><h2>' + h(gekoppeld ? t('Готово: оберіть, що показувати', 'Klaar: kies wat het toont') : t('Сполучіть цей екран із домом', 'Koppel dit scherm aan het huis')) + '</h2><ol class="hv-gzx-stappen">' + stappen.map(function (s, n) { return '<li class="' + (gekoppeld || n < 2 ? 'is-klaar' : '') + '"><b>' + (n + 1) + '</b><div><p>' + h(s[0]) + '</p><small>' + h(s[1]) + '</small></div></li>'; }).join('') + '</ol>' +
      '<div class="hv-knoppen">' + (gekoppeld ? o.knop({ tekst: t('Відкрити кіоск', 'Kiosk openen'), icoon: 'maximize-2', soort: 'hoofd', actie: 'ga', gegevens: { naar: 'paneel-kiosk' }, k: 'gzx-k-open' }) + o.knop({ tekst: t('Відкликати', 'Intrekken'), icoon: 'unlink', actie: 'gzx-koppel', gegevens: { stap: 'intrekken' }, k: 'gzx-k-in' })
        : o.knop({ tekst: t('Підтвердити як власник', 'Bevestigen als eigenaar'), icoon: 'shield-check', soort: 'hoofd', actie: 'gzx-koppel', gegevens: { stap: 'bevestig' }, k: 'gzx-k-bev' }) + o.knop({ tekst: t('Новий код', 'Nieuwe code'), icoon: 'refresh-cw', actie: 'gzx-koppel', gegevens: { stap: 'nieuw' }, k: 'gzx-k-nieuw' })) +
      o.knop({ tekst: t('Усі екрани дому', 'Alle schermen van het huis'), icoon: 'monitor-smartphone', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-schermen' }, k: 'gzx-k-alle' }) + '</div>' +
      '<p class="hv-gzx-koppel__noot">' + o.gevolg(t('Що станеться: екран отримає сеанс із роллю «панель» і покаже обличчя профілю. Пов’язано з: тривога диму й дзвінок у двері дійдуть і до нього. Як повернути: «Відкликати» — екран знову покаже код.', 'Wat er gebeurt: het scherm krijgt een sessie met de rol ‘paneel’ en toont de wijzerplaat van het profiel. Hangt samen met: rookalarm en de deurbel komen er ook op. Terugdraaien: ‘Intrekken’ — het scherm toont weer een code.')) + '<span>' + h(t('Панель виконує звичайне; чутливе — з особистим кодом; критичне — лише перегляд або підтвердження на телефоні.', 'Een paneel doet het gewone; gevoelig met een persoonlijke code; kritiek alleen bekijken of bevestigen op de telefoon.')) + '</span></p></div></section></div>';
  }

  HV.scherm({ id: 'paneel', sectie: 'paneel', titel: ['Екран', 'Paneel'], icoon: 'tablet-smartphone', adres: '/paneel', tabs: [
    { id: 'kiosk', titel: ['Кіоск', 'Kiosk'], adres: '/paneel', render: kioskTab },
    { id: 'rust', titel: ['Заставка й ніч', 'Rust en nacht'], adres: '/paneel/rust', render: rustTab },
    { id: 'koppelen', titel: ['Сполучення', 'Koppelen'], adres: '/paneel/koppelen', render: koppelTab }
  ] });

  // ═════════════════════════ Кіоск у роботі: заставка, нічне затемнення, зсув, виклик із дверей ═════════════════════════
  var rust = { aanraking: Date.now(), geforceerd: null, wakker: 0, verschuif: 0, verschoven: Date.now(), oproepGezien: null, oproepWeg: null, element: null };
  var GEEN_RUST = { inkt: true, horloge: true };
  function nachtNu(w, k) {
    if (k.nacht === 'stand') return w.huisstand === 'nacht';
    if (k.nacht === 'rooster') { var u = HV.uur(w.tijd); return u >= 23 || u < 6.5; }
    return false;
  }
  function pasVerschuiving() {
    var p = document.getElementById('hv-pagina'); if (!p) return;
    var prof = HV.profiel(), k = kiosk(), d = [[0, 0], [2, 0], [2, 2], [0, 2]][rust.verschuif];
    var aan = prof.speciaal && k.inbrand && prof.id !== 'inkt';
    var waarde = aan && (d[0] || d[1]) ? d[0] + 'px ' + d[1] + 'px' : '';
    if (p.style.translate !== waarde) p.style.translate = waarde;
  }
  function tekenRust() {
    var doek = document.getElementById('hv-doek'); if (!doek || !HV.staat.w) return;
    if (!rust.element || !doek.contains(rust.element)) {
      rust.element = document.createElement('div');
      rust.element.id = 'hv-gzx-rustplek';
      doek.insertBefore(rust.element, document.getElementById('hv-lagen'));
    }
    var ctx = HV.ctx(), w = ctx.staat, p = ctx.profiel, k = kiosk(), nu = Date.now();
    var stil = nu - rust.aanraking, html = '';
    var rustNa = p.id === 'tv' ? 10 : k.rust;
    // щабель 3 драбини: виклик із дверей — весь екран малих профілів на 60 с або до відповіді
    if (p.speciaal && w.oproep && !w.nood && p.id !== 'inkt' && p.id !== 'deur') {
      if (rust.oproepGezien !== w.oproep.sinds) { rust.oproepGezien = w.oproep.sinds; rust.oproepEcht = nu; rust.oproepWeg = null; }
      if (rust.oproepWeg !== w.oproep.sinds && nu - rust.oproepEcht < 60000) html = oproepHtml(ctx);
    }
    var nacht = (p.speciaal && !GEEN_RUST[p.id] && nachtNu(w, k)) || rust.geforceerd === 'nacht';
    var wakker = nu - rust.wakker < 30000;
    if (!html && !w.nood) {
      var toonRust = rust.geforceerd === 'rust' || (p.speciaal && !GEEN_RUST[p.id] && rustNa > 0 && stil > rustNa * 60000);
      if (toonRust || (nacht && !wakker)) {
        html = '<div class="hv-gzx-rust' + (nacht ? ' is-nacht' : '') + (toonRust ? '' : ' is-dim') + '" role="button" tabindex="0" data-actie="gzx-wek" aria-label="' + h(t('Заставка: торкніться, щоб розбудити екран', 'Rustscherm: tik om het scherm te wekken')) + '" style="--hv-gzx-helder:' + (k.helderheid / 100) + '">' +
          (toonRust ? rustHtml(ctx, { stijl: k.inbrand && p.speciaal ? 'translate:' + [[0, 0], [2, 0], [2, 2], [0, 2]][rust.verschuif].map(function (x) { return x * 3; }).join('px ') + 'px' : '' }) : '') +
          '<p class="hv-gzx-rust__hint">' + HV.icoon('hand', { maat: 's' }) + h(nacht && !toonRust ? t('ніч · дотик будить на 30 с', 'nacht · een tik wekt 30 s') : t('дотик — повернутися', 'tik om terug te gaan')) + '</p></div>';
      }
    }
    // автоповернення на перше обличчя після спокою (лише профілі з кількома обличчями)
    if (p.speciaal && k.terug && stil > k.terug * 60000 && Number(HV.ui.lees('gezicht-' + p.id, 0)) > 0 && !rust.terugGedaan) { rust.terugGedaan = true; HV.ui.zet('gezicht-' + p.id, 0); }
    // захист від вигоряння: крок зсуву кожні 10 хв
    if (k.inbrand && nu - rust.verschoven > 10 * 60000) { rust.verschuif = (rust.verschuif + 1) % 4; rust.verschoven = nu; }
    pasVerschuiving();
    if (rust.html !== html) { rust.html = html; HV.zet(rust.element, html); }
  }
  function oproepHtml(ctx) {
    var w = ctx.staat, p = ctx.profiel, klein = p.id === 'horloge';
    return '<div class="hv-gzx-oproep' + (klein ? ' is-klein' : '') + '" role="alertdialog" aria-labelledby="gzx-oproep-titel"><div class="hv-gzx-oproep__binnen">' +
      (klein ? '' : camBeeld(w, 'cameravoor', { klas: 'hv-gzx-oproep__beeld', k: 'oproep-beeld' })) +
      '<div class="hv-gzx-oproep__tekst"><p class="hv-gzx-oproep__label">' + HV.icoon('bell-ring', { maat: 's' }) + h(t('Виклик із дверей', 'Oproep van de deur')) + '</p><h2 id="gzx-oproep-titel">' + h(t('Хтось біля дверей', 'Er staat iemand voor de deur')) + '</h2>' +
      '<p class="hv-gzx-oproep__sub">' + h(t('дзвонить · ', 'belt aan · ') + HV.oud(w.tijd - w.oproep.sinds)) + '</p>' +
      '<div class="hv-gzx-oproep__knoppen">' + o.knop({ tekst: t('Відповісти', 'Opnemen'), icoon: 'message-square', soort: 'hoofd', actie: 'gzx-oproep', gegevens: { stap: 'opnemen' }, k: 'gzx-o-ja' }) + o.knop({ tekst: t('Приглушити', 'Dempen'), icoon: 'bell-off', actie: 'gzx-oproep', gegevens: { stap: 'weg' }, k: 'gzx-o-weg' }) + '</div></div></div></div>';
  }
  HV.actie('gzx-wek', function () { rust.geforceerd = null; rust.aanraking = Date.now(); rust.wakker = Date.now(); rust.terugGedaan = false; tekenRust(); });
  HV.actie('gzx-oproep', function (ctx, g) {
    var w = HV.staat.w; if (!w.oproep) return;
    rust.oproepWeg = w.oproep.sinds;
    if (g.stap === 'opnemen') {
      HV.staat.wijzig(function (x) { if (x.oproep) x.oproep.stand = 'gesprek'; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Виклик із дверей прийнято на екрані', 'Oproep van de deur aangenomen op het scherm'], soort: 'huis.toegang' });
      HV.meld({ maker: HV.mens(), icoon: 'message-square', titel: t('Розмова з дверима', 'In gesprek met de deur'), tekst: t('Звук і кадр — на цьому екрані · симуляція', 'Geluid en beeld op dit scherm · simulatie') });
    } else {
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Виклик приглушено на екрані', 'Oproep gedempt op het scherm'], soort: 'huis.toegang' });
      HV.meld({ maker: HV.mens(), icoon: 'bell-off', titel: t('Виклик приглушено', 'Oproep gedempt'), tekst: t('Виклик лишається в «Зараз важливо».', 'De oproep blijft bij ‘Nu belangrijk’.') });
    }
    tekenRust();
  });

  /** Стан кіоску для пульта макета й перевірок: скільки спокою, що показано; stil(ms) — імітувати спокій. */
  HV.kiosk = {
    toestand: function () { return { stil: Date.now() - rust.aanraking, laag: rust.html ? (rust.html.indexOf('hv-gzx-oproep') >= 0 ? 'oproep' : rust.html.indexOf('is-dim') >= 0 ? 'nacht' : 'rust') : null, verschuif: rust.verschuif }; },
    stil: function (ms) { rust.aanraking = Date.now() - (ms || 0); rust.wakker = 0; tekenRust(); }
  };

  // ── телевізор: просторова навігація пультом; «Назад» — до обличчя Дому ──
  function tvToets(ev) {
    var p = HV.profiel();
    if (p.id !== 'tv' && p.id !== 'inkt') return;
    var doek = document.getElementById('hv-doek'); if (!doek) return;
    if (HV.lagen && HV.lagen.dialoog()) return;
    if (p.id === 'inkt') {
      // фізичні кнопки 1–8 збігаються з номерами плиток
      if (/^[1-8]$/.test(ev.key)) { var tegel = doek.querySelector('.hv-gezicht [data-nummer="' + ev.key + '"]'); if (tegel) { ev.preventDefault(); tegel.click(); } }
      return;
    }
    var el = document.activeElement, rol = el && el.getAttribute ? el.getAttribute('role') : null;
    if (ev.key === 'Escape' || ev.key === 'Backspace' || ev.key === 'BrowserBack') {
      if (Number(HV.ui.lees('gezicht-tv', 0)) > 0) { ev.preventDefault(); HV.ui.zet('gezicht-tv', 0); setTimeout(function () { var k = doek.querySelector('.hv-gezicht button'); if (k) k.focus(); }, 60); }
      return;
    }
    var richting = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[ev.key];
    if (!richting || rol === 'slider') return;
    var kandidaten = Array.prototype.slice.call(doek.querySelectorAll('#hv-pagina button:not([aria-disabled="true"]), #hv-gzx-rustplek [tabindex="0"], #hv-gzx-rustplek button')).filter(function (x) { return x.offsetParent !== null; });
    if (!kandidaten.length) return;
    ev.preventDefault();
    if (!el || !doek.contains(el) || kandidaten.indexOf(el) < 0) { kandidaten[0].focus(); return; }
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, beste = null, score = Infinity;
    kandidaten.forEach(function (x) {
      if (x === el) return;
      var q = x.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      var voor = dx * richting[0] + dy * richting[1];
      if (voor <= 4) return;
      var zij = Math.abs(dx * richting[1]) + Math.abs(dy * richting[0]);
      var s = voor + zij * 2.2;
      if (s < score) { score = s; beste = x; }
    });
    if (beste) beste.focus();
  }

  // ── start: наші обличчя — після облич Дому; таймер кіоску й слухачі дотику ──
  var oudStart = HV.start;
  HV.start = function () {
    var eigen = HV.gezichten.filter(function (g) { return EIGEN[g.id]; }), ander = HV.gezichten.filter(function (g) { return !EIGEN[g.id]; });
    HV.gezichten.length = 0;
    ander.concat(eigen).forEach(function (g) { HV.gezichten.push(g); });
    // обличчя Дому на телевізорі: місця вистачає на повне речення дому — перша частина великим, решта рядком нижче.
    // Розмітки обличчя не повторюємо: міняємо лише заголовок із коротким реченням; якщо його там немає — лишаємо як є.
    // Тривога лишається короткою: її читають здалеку.
    var thuisTv = HV.gezichten.filter(function (g) { return g.id === 'tv-thuis'; })[0];
    if (thuisTv && !thuisTv.gzxVol) {
      var thuisRender = thuisTv.render;
      thuisTv.gzxVol = true;
      thuisTv.render = function (ctx) {
        var html = thuisRender(ctx), z = HV.huiszin ? HV.huiszin(ctx) : null;
        if (!z || !z.vol || z.toon === 'alarm') return html;
        var kort = '<h1 class="hv-tv__zin">' + h(z.kort) + '</h1>', plek = html.indexOf(kort);
        if (plek < 0) return html;
        var vol = z.vol.replace(/<[^>]+>/g, ''), deel = /^(.+?[.!?])\s+(.+)$/.exec(vol);
        return html.slice(0, plek) + '<h1 class="hv-tv__zin hv-gzx-tv__vol"><span>' + (deel ? deel[1] : vol) + '</span>' + (deel ? ' <span class="hv-gzx-tv__rest">' + deel[2] + '</span>' : '') + '</h1>' + html.slice(plek + kort.length);
      };
    }
    // картки телевізора на обличчі Дому відкривають відповідне обличчя зони (замість підказки)
    var naar = { energie: 'tv-energie', beveiliging: 'tv-beveiliging', kamers: 'tv-klimaat', garage: 'tv-garage', overzicht: 'tv-klimaat' };
    HV.actie('tv-kaart', function (ctx, g) {
      var lijst = HV.gezichten.filter(function (x) { return x.profiel === 'tv'; }), i = lijst.map(function (x) { return x.id; }).indexOf(naar[g.naar]);
      if (i < 0) return;
      HV.ui.zet('gezicht-tv', i);
      setTimeout(function () { var k = document.querySelector('#hv-pagina .hv-gezicht button'); if (k) k.focus(); }, 60);
    });
    var r = oudStart.apply(this, arguments);
    var aangeraakt = function (ev) {
      rust.aanraking = Date.now(); rust.terugGedaan = false;
      if (HV.profiel().id === 'inkt' && ev && ev.type === 'click') inktVrijTot = Date.now() + 5000;
      var d = HV.ui.lees('gzx-deur', null); if (d && d.stap === 'open') d.sinds = Date.now();
      if (rust.html && ev && ev.type === 'keydown' && rust.html.indexOf('gzx-wek') >= 0) { HV.acties['gzx-wek'](); ev.preventDefault(); }
    };
    document.addEventListener('pointerdown', aangeraakt, true);
    document.addEventListener('keydown', aangeraakt, true);
    document.addEventListener('click', aangeraakt, true);
    document.addEventListener('keydown', tvToets);
    setInterval(function () {
      tekenRust();
      var d = HV.ui.lees('gzx-deur', null);
      if (d && (d.stap === 'open' || d.sos) && HV.profiel().id === 'deur') HV.teken();
      if (HV.profiel().id === 'inkt' && Date.now() - Math.max.apply(null, Object.keys(inktGeheugen).map(function (s) { return inktGeheugen[s].echt; }).concat([0])) >= 60000) HV.teken();
      if (!HV.profiel().speciaal && HV.route().scherm === 'paneel' && HV.route().tab === 'koppelen') HV.teken();
    }, 1000);
    tekenRust();
    return r;
  };
})(window.HV = window.HV || {});
