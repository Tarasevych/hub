// Gezichten van «Thuis» voor de speciale profielen (§3.6 van het plan, §7 van de ontwerptaal): geen navigatie, geen scrollen.
// Каркас профілів і «обличчя» Дому; повні набори облич інших зон додає окремий модуль через HV.gezicht({ id, profiel, render }).
// Обличчя лежать на папері (§7): підпис і hv-versheid угорі, одне головне число чи слово, рядок стану, одна-дві дії.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  var kop = function (ctx, label, rechts) { return '<header class="hv-gezicht__kop"><span class="hv-gezicht__bijschrift">' + label + '</span>' + (rechts || '') + o.versheid(ctx.staat) + '</header>'; };
  var simMerk = function (w) { return '<span class="hv-gezicht__sim">' + HV.icoon('flask-conical', { maat: 'maker' }) + h(t('симуляція', 'simulatie')) + ' ' + (w.pauze ? h(t('пауза', 'pauze')) : '×' + w.snelheid) + '</span>'; };
  function toestandWoord(ctx) {
    var w = ctx.staat;
    if (w.nood) return { woord: t('тривога', 'alarm'), toon: 'alarm' };
    if (w.gegevens === 'geen') return { woord: HV.woord.geenVerbinding(), toon: 'oud' };
    var z = HV.huiszin(ctx);
    if (z.toon === 'alarm') return { woord: t('тривога', 'alarm'), toon: 'alarm' };
    return z.toon === 'aandacht' ? { woord: t('потрібна увага', 'aandacht nodig'), toon: 'let-op' } : { woord: t('спокійно', 'rustig'), toon: 'rust' };
  }
  function saldo(w) {
    var e = w.energie;
    return { getal: HV.maat(Math.abs(e.net), t('кВт', 'kW'), 1), woord: e.net < -0.05 ? t('у мережу', 'teruglevering') : t('з мережі', 'afname van het net'), toon: e.net < -0.05 ? 'net-uit' : 'net-in' };
  }
  /** Винятки без того, що вже сказано реченням дому (вікно, про яке речення й так говорить). */
  function uitzonderingen(ctx, max) {
    var w = ctx.staat, z = HV.huiszin(ctx);
    var open = HV.kijk.open().map(function (x) { return x.apparaat.id; });
    return w.nu.filter(function (n) { return !(z.toon === 'aandacht' && n.doel && open.indexOf(n.doel) >= 0); }).slice(0, max);
  }
  /** Режим дому, який доречно запропонувати однією кнопкою: увечері — «Ніч», уночі — «Вдома», коли нікого — «Я вдома». */
  function standActie(w) {
    if (w.huisstand === 'nacht') return { waarde: 'thuis', icoon: 'house', tekst: t('Режим «Вдома»', 'Stand ‘Thuis’') };
    if (w.huisstand === 'afwezig' || w.huisstand === 'vakantie') return { waarde: 'thuis', icoon: 'log-in', tekst: t('Я вдома', 'Ik ben thuis') };
    var uur = HV.uur(w.tijd);
    return uur >= 20 || uur < 5 ? { waarde: 'nacht', icoon: 'bed-double', tekst: t('Режим «Ніч»', 'Stand ‘Nacht’') } : { waarde: 'afwezig', icoon: 'log-out', tekst: t('Йду', 'Ik ga weg') };
  }

  // ── horloge: три обличчя (стан, енергія, сповіщення); папір на весь екран; слово стану — головне ──
  HV.gezicht({ id: 'horloge-toestand', profiel: 'horloge', titel: ['Стан', 'Toestand'], render: function (ctx) {
    var w = ctx.staat, s = toestandWoord(ctx), temp = w.apparaten.tempwoon.st.waarde, a = standActie(w);
    return kop(ctx, h(t('Дім', 'Thuis')) + ' <span class="hv-punt">·</span> ' + HV.tijd(w.tijd)) +
      '<p class="hv-gezicht__woord hv-toon-' + s.toon + '">' + h(s.woord) + '</p>' +
      '<p class="hv-gezicht__toestand">' + h(HV.p(HV.huisstanden[w.huisstand]) + ' · ') + HV.getal(temp, 1) + ' °C</p>' +
      '<button type="button" class="hv-knop hv-knop--gewoon hv-gezicht__actie" data-actie="huisstand" data-waarde="' + a.waarde + '">' + HV.icoon(a.icoon, { maat: 's' }) + '<span>' + h(a.tekst) + '</span></button>';
  } });
  HV.gezicht({ id: 'horloge-energie', profiel: 'horloge', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var s = saldo(ctx.staat);
    return kop(ctx, h(t('Енергія', 'Energie'))) + '<p class="hv-gezicht__getal hv-toon-' + s.toon + '">' + s.getal + '</p><p class="hv-gezicht__toestand">' + h(s.woord) + '</p>' +
      '<p class="hv-gezicht__toestand">' + HV.euro(HV.tarief.prijs(ctx.staat.tijd)) + ' ' + h(t('за кВт·год', 'per kWh')) + '</p>';
  } });
  HV.gezicht({ id: 'horloge-meldingen', profiel: 'horloge', titel: ['Тривоги', 'Alarmen'], render: function (ctx) {
    var w = ctx.staat, nu = w.nu, z = HV.huiszin(ctx);
    // на найменшому екрані — коротка форма, як у герої телефона («Спальня: вікно відчинено 42 хв»), а не повне речення
    var volgorde = { alarm: 0, verzoek: 1, aandacht: 2, info: 3 };
    var eerste = nu.slice().sort(function (a, b) { return volgorde[a.soort] - volgorde[b.soort]; })[0];
    var open = HV.kijk.open().map(function (x) { return x.apparaat.id; });
    var kort = !eerste ? t('нічого не чекає', 'niets wacht')
      : eerste.kort ? HV.p(eerste.kort)
      : (z.toon === 'alarm' && eerste.soort === 'alarm') || (z.toon === 'aandacht' && eerste.doel && open.indexOf(eerste.doel) >= 0) ? z.kort
      : HV.p(eerste.tekst);
    return kop(ctx, h(t('Увага', 'Aandacht'))) + '<p class="hv-gezicht__getal">' + nu.length + '</p><p class="hv-gezicht__toestand">' + h(kort) + '</p>';
  } });

  // ── strook 1920×480 / 1280×400: час │ сальдо й ціна │ потоки (кільце) │ винятки │ обране; стрічка доби внизу ──
  HV.gezicht({ id: 'strook-thuis', profiel: 'strook', titel: ['Стрічка', 'Strook'], render: function (ctx) {
    var w = ctx.staat, z = HV.huiszin(ctx), s = saldo(w), e = w.energie, kW = t('кВт', 'kW');
    var smal = ctx.profiel.breedte < 1600;
    var delen = [{ naam: t('Сонце', 'Zon'), toon: 'zon', waarde: e.zon, tekst: HV.maat(e.zon, kW, 1) }, { naam: t('Дім', 'Huis'), toon: 'net-in', waarde: e.huis, tekst: HV.maat(e.huis, kW, 1) },
      { naam: t('Батарея', 'Batterij'), toon: 'batterij', waarde: Math.abs(e.batterij), tekst: HV.maat(Math.abs(e.batterij), kW, 1) }];
    if (e.auto > 0) delen.push({ naam: t('Авто', 'Auto'), toon: 'auto', waarde: e.auto, tekst: HV.maat(e.auto, kW, 1) });
    var lijst = uitzonderingen(ctx, 3);
    var uitz = lijst.map(function (n) { return '<li>' + HV.icoon(n.icoon || 'info') + '<span>' + h(HV.p(n.tekst)) + '</span></li>'; }).join('') || '<li>' + HV.icoon('check') + '<span>' + h(t('Винятків немає', 'Geen uitzonderingen')) + '</span></li>';
    var fav = w.favorieten.slice(0, smal ? 3 : 4).map(function (id) { return o.tegel(w.apparaten[id], { vorm: '2x1' }); }).join('');
    return '<div class="hv-strook">' +
      '<section class="hv-strook__tijd"><div><p class="hv-strook__klok">' + HV.tijd(w.tijd) + '</p><p class="hv-strook__datum">' + h(HV.datum(w.tijd)) + ' ' + simMerk(w) + '</p></div><p class="hv-strook__zin">' + h(z.kort) + '</p></section>' +
      '<section class="hv-strook__saldo hv-toon-' + s.toon + '"><p class="hv-strook__label">' + h(s.woord) + '</p><p class="hv-strook__getal">' + s.getal + '</p><p class="hv-strook__prijs">' + HV.euro(HV.tarief.prijs(w.tijd)) + ' <span>' + h(t('за кВт·год · приклад', 'per kWh · voorbeeld')) + '</span></p></section>' +
      '<section class="hv-strook__stromen">' + HV.grafiek.ring({ id: 'strook-ring', klein: true, titel: t('Потоки зараз', 'Stromen nu'), delen: delen, midden: { waarde: HV.maat(e.huis, kW, 1), label: t('дім', 'huis') } }) + '</section>' +
      '<section class="hv-strook__uitz"><p class="hv-strook__label">' + h(t('Винятки', 'Uitzonderingen')) + '</p><ul>' + uitz + '</ul></section>' +
      '<section class="hv-strook__fav">' + fav + '</section></div>' + HV.dagstrook(ctx, { kort: true });
  } });

  // ── vierkant і rond: обличчя кімнати — диск цілі, «−/+» під ним, «‹ ›» гортають кімнати ──
  function kamersMetKlimaat(w) { return w.kamers.filter(function (k) { return HV.kijk.temperatuur(k.id) && (k.doel != null || HV.kijk.inKamer(k.id, function (a) { return a.soort === 'thermostaat'; }).length); }); }
  function kamerGezicht(ctx, rond) {
    var w = ctx.staat, lijst = kamersMetKlimaat(w);
    var i = Math.min(lijst.length - 1, Number(HV.ui.lees('gz-kamer', 0)) || 0), k = lijst[i] || HV.staat.kamer('woonkamer');
    var th = HV.kijk.inKamer(k.id, function (a) { return a.soort === 'thermostaat'; })[0];
    var temp = HV.kijk.temperatuur(k.id), gemeten = th ? th.st.temperatuur : temp ? temp.st.waarde : null;
    var doel = th ? HV.gewenst(th, 'doel') : (k.doel != null ? k.doel : 20);
    var verwarmt = th ? th.st.verwarmt : gemeten != null && gemeten < doel - 0.2;
    var aan = HV.kijk.lampenAan(k.id).length, lampen = HV.kijk.lampen(k.id).length;
    var licht = lampen ? o.schakel({ aan: aan > 0, icoon: 'lightbulb', toon: 'aan', actie: 'kamer-licht', gegevens: { kamer: k.id }, aria: t('Світло: ', 'Licht: ') + HV.p(k.naam) }) : '';
    var blader = lijst.length > 1 ? '<div class="hv-gezicht__kamers">' + o.icoonknop({ icoon: 'chevron-left', aria: t('Попередня кімната', 'Vorige kamer'), actie: 'ui', gegevens: { naam: 'gz-kamer', waarde: (i + lijst.length - 1) % lijst.length } }) +
      '<span class="hv-gezicht__stippen" aria-hidden="true">' + lijst.map(function (x, n) { return '<i class="' + (n === i ? 'is-actief' : '') + '"></i>'; }).join('') + '</span>' +
      o.icoonknop({ icoon: 'chevron-right', aria: t('Наступна кімната', 'Volgende kamer'), actie: 'ui', gegevens: { naam: 'gz-kamer', waarde: (i + 1) % lijst.length } }) + '</div>' : '';
    var deel = Math.max(0, Math.min(1, ((gemeten == null ? doel : gemeten) - 5) / 25));
    var boog = rond ? '<svg class="hv-gezicht__boog hv-toon-warm" viewBox="0 0 100 100" aria-hidden="true"><circle class="hv-ring__baan" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 50 50)"/><circle class="hv-ring__boog hv-toon-warm" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="' + (deel * 75).toFixed(1) + ' 100" transform="rotate(135 50 50)"/></svg>' : '';
    if (rond) {
      return boog + '<div class="hv-gezicht__binnen">' + kop(ctx, h(HV.p(k.naam))) + '<p class="hv-gezicht__getal">' + (gemeten == null ? '—' : HV.maat(gemeten, '°C', 1)) + '</p>' +
        '<p class="hv-gezicht__toestand">' + h((verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast')) + t(' · ціль ', ' · doel ')) + HV.getal(doel, 1) + ' °C</p>' +
        '<div class="hv-gezicht__rij">' + o.stapper({ actie: 'gz-doel', gegevens: { kamer: k.id }, stap: 0.5, label: t('Ціль температури', 'Doeltemperatuur'), k: 'gz-doel' }) + licht + '</div></div>';
    }
    return '<div class="hv-gezicht__binnen">' + kop(ctx, h(HV.p(k.naam)), licht) +
      o.wijzer({ doel: doel, gemeten: gemeten, toon: 'warm', bezig: verwarmt, actie: 'gz-wijzer', gegevens: { kamer: k.id }, label: t('Ціль температури: ', 'Doeltemperatuur: ') + HV.p(k.naam), k: 'gz-wijzer-' + k.id }) +
      '<p class="hv-gezicht__toestand">' + h(verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast')) + (aan ? ' <span class="hv-punt">·</span> ' + h(t('світло ввімкнено', 'licht aan')) : '') + '</p>' + blader + '</div>';
  }
  /** Ціль кімнати з обличчя: термостат кімнати, якщо він є, інакше ціль кімнати. */
  function zetDoel(kamerId, waarde) {
    var th = HV.kijk.inKamer(kamerId, function (a) { return a.soort === 'thermostaat'; })[0];
    if (th) HV.doe({ doel: th.id, mogelijkheid: 'doel', waarde: waarde });
    else HV.doe({ doel: 'kamer:' + kamerId, mogelijkheid: 'doel', waarde: waarde });
  }
  HV.actie('gz-wijzer', function (ctx, g) { if (g.fase === 'klaar') zetDoel(g.kamer, Number(g.waarde)); });
  HV.actie('gz-doel', function (ctx, g) {
    var th = HV.kijk.inKamer(g.kamer, function (a) { return a.soort === 'thermostaat'; })[0], k = HV.staat.kamer(g.kamer);
    var nu = th ? Number(HV.gewenst(th, 'doel')) : (k.doel != null ? k.doel : 20);
    zetDoel(g.kamer, Math.max(5, Math.min(30, nu + Number(g.richting) * (Number(g.stap) || 0.5))));
  });
  HV.gezicht({ id: 'vierkant-kamer', profiel: 'vierkant', titel: ['Кімната', 'Kamer'], render: function (ctx) { return kamerGezicht(ctx, false); } });
  HV.gezicht({ id: 'rond-kamer', profiel: 'rond', titel: ['Кімната', 'Kamer'], render: function (ctx) { return kamerGezicht(ctx, true); } });

  // ── klein 800×480: два обличчя поруч і до чотирьох кнопок ──
  HV.gezicht({ id: 'klein-thuis', profiel: 'klein', titel: ['Дім і енергія', 'Thuis en energie'], render: function (ctx) {
    var w = ctx.staat, s = toestandWoord(ctx), e = saldo(w), z = HV.huiszin(ctx);
    return '<div class="hv-klein"><section class="hv-klein__vlak">' + kop(ctx, h(t('Дім', 'Thuis'))) + '<p class="hv-gezicht__getal">' + HV.tijd(w.tijd) + '</p><p class="hv-gezicht__toestand hv-toon-' + s.toon + '">' + h(z.kort) + '</p></section>' +
      '<section class="hv-klein__vlak hv-toon-' + e.toon + '">' + kop(ctx, h(t('Енергія', 'Energie'))) + '<p class="hv-gezicht__getal">' + e.getal + '</p><p class="hv-gezicht__toestand">' + h(e.woord) + ' · ' + HV.euro(HV.tarief.prijs(w.tijd)) + '</p></section>' +
      '<div class="hv-klein__knoppen">' + w.scenes.slice(0, 4).map(function (sc) { return o.knop({ tekst: HV.p(sc.naam), icoon: sc.icoon, actie: 'scene', gegevens: { scene: sc.id } }); }).join('') + '</div></div>';
  } });

  // ── deur 480×800: час, погода, виклик; після коду — «Йду» і «Я вдома» ──
  HV.gezicht({ id: 'deur-thuis', profiel: 'deur', titel: ['Двері', 'Deur'], render: function (ctx) {
    var w = ctx.staat, weer = HV.hemel.weer(w), weg = w.huisstand === 'afwezig' || w.huisstand === 'vakantie';
    return '<div class="hv-deur">' + kop(ctx, h(HV.paspoort.adres)) + '<p class="hv-gezicht__getal">' + HV.tijd(w.tijd) + '</p><p class="hv-gezicht__toestand">' + h(HV.datum(w.tijd)) + '</p>' +
      '<p class="hv-deur__weer">' + HV.icoon(weer.icoon, { maat: 'l' }) + '<span>' + h(weer.tekst) + '</span></p>' +
      '<button type="button" class="hv-knop hv-knop--gewoon hv-deur__bel" data-actie="deur-bel">' + HV.icoon('bell-ring', { maat: 'l' }) + '<span>' + h(t('Подзвонити', 'Aanbellen')) + '</span></button>' +
      '<div class="hv-deur__code"><p class="hv-gezicht__bijschrift">' + HV.icoon('lock', { maat: 's' }) + ' ' + h(t('Після коду панелі', 'Na de paneelcode')) + '</p><div class="hv-deur__knoppen">' +
      o.knop({ tekst: t('Йду', 'Ik ga weg'), icoon: 'log-out', actie: 'huisstand', gegevens: { waarde: 'afwezig' }, uit: weg }) + o.knop({ tekst: t('Я вдома', 'Ik ben thuis'), icoon: 'log-in', actie: 'huisstand', gegevens: { waarde: 'thuis' }, uit: w.huisstand === 'thuis' }) + '</div></div>' + simMerk(w) + '</div>';
  } });
  HV.actie('deur-bel', function () {
    HV.staat.wijzig(function (w) { w.apparaten.deurbel.st.laatst = w.tijd; });
    HV.logboek.voegToe({ maker: { soort: 'knop', naam: ['Дверна панель', 'Deurpaneel'] }, wat: ['Дзвінок у двері', 'Er is aangebeld'], soort: 'huis.toegang', gewicht: 'belangrijk' });
    HV.meld({ gewicht: 'belangrijk', icoon: 'bell-ring', titel: t('Дзвінок у двері', 'Er is aangebeld'), tekst: t('Виклик показано на екранах удома.', 'De oproep staat op de schermen in huis.') });
  });

  // ── inkt: речення, винятки зі знаком, пронумеровані плитки на всю вільну висоту; чорне й біле, без неба ──
  HV.gezicht({ id: 'inkt-thuis', profiel: 'inkt', titel: ['Чорнило', 'Inkt'], render: function (ctx) {
    var w = ctx.staat, z = HV.huiszin(ctx);
    var uitz = uitzonderingen(ctx, 2).map(function (n) { return '<li>' + HV.icoon(n.icoon || 'info') + '<span>' + h(HV.p(n.tekst)) + '</span></li>'; }).join('');
    var tegels = w.favorieten.slice(0, 6).map(function (id, i) {
      var a = w.apparaten[id], b = o.beeld(a);
      return '<div class="hv-inkt__tegel' + (b.aan ? ' is-aan' : '') + '"><span class="hv-inkt__nummer">' + (i + 1) + '</span><span class="hv-inkt__naam">' + h(HV.p(a.naam)) + '</span><span class="hv-inkt__woord">' + h(b.woord) + '</span></div>';
    }).join('');
    return '<div class="hv-inkt"><p class="hv-inkt__zin">' + h(z.kort) + '</p>' + (uitz ? '<ul class="hv-inkt__uitz">' + uitz + '</ul>' : '<span></span>') + '<div class="hv-inkt__tegels">' + tegels + '</div>' +
      '<p class="hv-inkt__voet">' + h(t('Оновлено о ', 'Bijgewerkt om ') + HV.tijd(w.tijd) + t(' · симуляція · число = фізична кнопка', ' · simulatie · cijfer = fysieke knop')) + '</p></div>';
  } });

  // ── tv 1920×1080: небо на весь екран, речення, ряд карток; hv-versheid угорі праворуч; фокус починається з першої картки ──
  HV.gezicht({ id: 'tv-thuis', profiel: 'tv', titel: ['Телевізор', 'Televisie'], render: function (ctx) {
    var w = ctx.staat, z = HV.huiszin(ctx), s = saldo(w), weer = HV.hemel.weer(w);
    var kaart = function (icoon, naam, waarde, sub, naar) { return '<button type="button" class="hv-tv__kaart" data-actie="tv-kaart" data-naar="' + naar + '">' + HV.icoon(icoon, { maat: 'l' }) + '<span class="hv-tv__naam">' + h(naam) + '</span><span class="hv-tv__waarde">' + waarde + '</span><span class="hv-tv__sub">' + h(sub) + '</span></button>'; };
    var th = w.apparaten.thermostaat.st, ev = w.voertuigen[0];
    return '<div class="hv-tv"><header class="hv-tv__kop"><p class="hv-tv__datum">' + h(HV.datum(w.tijd)) + ' <span class="hv-punt">·</span> ' + HV.tijd(w.tijd) + ' ' + simMerk(w) + '</p>' + o.versheid(w) + '</header><h1 class="hv-tv__zin">' + h(z.kort) + '</h1>' +
      '<div class="hv-tv__rij">' +
      kaart('thermometer', t('Вітальня', 'Woonkamer'), HV.maat(th.temperatuur, '°C', 1), th.verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast'), 'kamers') +
      kaart('zap', t('Енергія', 'Energie'), s.getal, s.woord, 'energie') +
      kaart('shield', t('Безпека', 'Beveiliging'), '<span class="hv-tv__woord">' + h(HV.p(HV.alarmWoord[w.apparaten.alarm.st.stand]).split(': ')[1]) + '</span>', w.apparaten.voordeurslot.st.vergrendeld ? t('двері замкнено', 'deur op slot') : t('двері відімкнено', 'deur van het slot'), 'beveiliging') +
      kaart('car', t('Авто', 'Auto'), HV.maat(Math.round(ev.lading), '%'), w.apparaten.laadpaal.st.laadt ? HV.woord.laadt() : HV.maatTekst(ev.bereik, t('км', 'km')), 'garage') +
      kaart(weer.icoon, t('Надворі', 'Buiten'), HV.maat(w.weer.temp, '°C'), weer.tekst.split(', ')[1] || '', 'overzicht') +
      '</div></div>';
  } });
  HV.actie('tv-kaart', function (ctx, g) { HV.meld({ icoon: 'tv', titel: t('На телевізорі розділи відкриває пульт', 'Op de televisie opent de afstandsbediening de onderdelen'), tekst: 'huis.tarasevych.com/paneel/tv/demo → ' + g.naar }); });
})(window.HV = window.HV || {});
