// Gezichten van «Thuis» voor de speciale profielen (§3.6 van het plan, §7 van de ontwerptaal): geen navigatie, geen scrollen.
// Каркас профілів і «обличчя» Дому; повні набори облич інших зон додає окремий модуль через HV.gezicht({ id, profiel, render }).
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  var kop = function (ctx, label) { return '<header class="hv-gezicht__kop"><span class="hv-gezicht__bijschrift">' + h(label) + '</span>' + o.versheid(ctx.staat) + '</header>'; };
  var simMerk = function (w) { return '<span class="hv-gezicht__sim">' + HV.icoon('flask-conical', { maat: 'maker' }) + h(t('симуляція', 'simulatie')) + ' ×' + w.snelheid + '</span>'; };
  function toestandWoord(ctx) {
    var w = ctx.staat;
    if (w.nood) return { woord: t('тривога', 'alarm'), toon: 'alarm' };
    if (w.gegevens === 'geen') return { woord: HV.woord.geenVerbinding(), toon: 'oud' };
    var z = HV.huiszin(ctx);
    return z.toon === 'aandacht' ? { woord: t('потрібна увага', 'aandacht nodig'), toon: 'let-op' } : { woord: t('спокійно', 'rustig'), toon: 'rust' };
  }
  function saldo(w) {
    var e = w.energie;
    return { getal: HV.maat(Math.abs(e.net), t('кВт', 'kW'), 1), woord: e.net < -0.05 ? t('віддаємо в мережу', 'leveren aan het net') : t('беремо з мережі', 'nemen van het net'), toon: e.net < -0.05 ? 'net-uit' : 'net-in' };
  }

  // ── horloge: три обличчя (стан, енергія, сповіщення) ──
  HV.gezicht({ id: 'horloge-toestand', profiel: 'horloge', titel: ['Стан', 'Toestand'], render: function (ctx) {
    var w = ctx.staat, s = toestandWoord(ctx), temp = w.apparaten.tempwoon.st.waarde;
    return kop(ctx, t('Дім', 'Thuis')) + '<p class="hv-gezicht__getal">' + HV.tijd(w.tijd) + '</p><p class="hv-gezicht__toestand hv-toon-' + s.toon + '">' + h(s.woord) + ' · ' + HV.getal(temp, 1) + ' °C</p>' +
      '<button type="button" class="hv-knop hv-knop--gewoon hv-gezicht__actie" data-actie="alles-licht-uit">' + h(t('Світло вимкнути', 'Licht uit')) + '</button>';
  } });
  HV.gezicht({ id: 'horloge-energie', profiel: 'horloge', titel: ['Енергія', 'Energie'], render: function (ctx) {
    var s = saldo(ctx.staat);
    return kop(ctx, t('Енергія', 'Energie')) + '<p class="hv-gezicht__getal hv-toon-' + s.toon + '">' + s.getal + '</p><p class="hv-gezicht__toestand">' + h(s.woord) + '</p><p class="hv-gezicht__toestand">' + HV.euro(HV.tarief.prijs(ctx.staat.tijd)) + '</p>';
  } });
  HV.gezicht({ id: 'horloge-meldingen', profiel: 'horloge', titel: ['Сповіщення', 'Meldingen'], render: function (ctx) {
    var nu = ctx.staat.nu;
    return kop(ctx, t('Увага', 'Aandacht')) + '<p class="hv-gezicht__getal">' + nu.length + '</p><p class="hv-gezicht__toestand">' + h(nu.length ? HV.p(nu[0].tekst) : t('нічого не чекає', 'niets wacht')) + '</p>';
  } });

  // ── strook 1920×480 / 1280×400: час │ сальдо й ціна │ потоки │ винятки │ обране; стрічка доби внизу ──
  HV.gezicht({ id: 'strook-thuis', profiel: 'strook', titel: ['Стрічка', 'Strook'], render: function (ctx) {
    var w = ctx.staat, z = HV.huiszin(ctx), s = saldo(w), e = w.energie, kW = t('кВт', 'kW');
    var smal = ctx.profiel.breedte < 1600;
    var stroom = function (naam, toon, v) { return '<li class="hv-toon-' + toon + '"><span>' + h(naam) + '</span><strong>' + HV.maat(v, kW, 1) + '</strong></li>'; };
    var uitz = w.nu.slice(0, 2).map(function (n) { return '<li>' + HV.icoon(n.icoon || 'info', { maat: 's' }) + '<span>' + h(HV.p(n.tekst)) + '</span></li>'; }).join('') || '<li>' + HV.icoon('check', { maat: 's' }) + '<span>' + h(t('Винятків немає', 'Geen uitzonderingen')) + '</span></li>';
    var fav = w.favorieten.slice(0, smal ? 2 : 4).map(function (id) { return o.tegel(w.apparaten[id], { vorm: '2x1' }); }).join('');
    return '<div class="hv-strook"><section class="hv-strook__tijd"><p class="hv-strook__klok">' + HV.tijd(w.tijd) + '</p><p class="hv-strook__datum">' + h(HV.datum(w.tijd)) + ' ' + simMerk(w) + '</p><p class="hv-strook__zin">' + h(z.kort) + '</p></section>' +
      '<section class="hv-strook__saldo hv-toon-' + s.toon + '"><p class="hv-strook__label">' + h(s.woord) + '</p><p class="hv-strook__getal">' + s.getal + '</p><p class="hv-strook__prijs">' + HV.euro(HV.tarief.prijs(w.tijd)) + ' <span>' + h(t('за кВт·год · приклад', 'per kWh · voorbeeld')) + '</span></p></section>' +
      '<section class="hv-strook__stromen"><ul>' + stroom(t('Сонце', 'Zon'), 'zon', e.zon) + stroom(t('Дім', 'Huis'), 'net-in', e.huis) + stroom(t('Батарея', 'Batterij'), 'batterij', Math.abs(e.batterij)) + stroom(t('Авто', 'Auto'), 'auto', e.auto) + '</ul></section>' +
      '<section class="hv-strook__uitz"><ul>' + uitz + '</ul></section>' +
      '<section class="hv-strook__fav">' + fav + '</section></div>' + HV.dagstrook(ctx, { kort: true });
  } });

  // ── vierkant і rond: обличчя кімнати з «−/+» ──
  function kamerGezicht(ctx, rond) {
    var w = ctx.staat, k = HV.staat.kamer('woonkamer'), th = w.apparaten.thermostaat.st;
    var aan = HV.kijk.lampenAan(k.id).length;
    var doel = HV.gewenst(w.apparaten.thermostaat, 'doel');
    var deel = Math.max(0, Math.min(1, (th.temperatuur - 5) / 25));
    var boog = rond ? '<svg class="hv-gezicht__boog hv-toon-warm" viewBox="0 0 100 100" aria-hidden="true"><circle class="hv-ring__baan" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 50 50)"/><circle class="hv-ring__boog hv-toon-warm" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="' + (deel * 75).toFixed(1) + ' 100" transform="rotate(135 50 50)"/></svg>' : '';
    return boog + '<div class="hv-gezicht__binnen">' + kop(ctx, HV.p(k.naam)) + '<p class="hv-gezicht__getal">' + HV.maat(th.temperatuur, '°C', 1) + '</p>' +
      '<p class="hv-gezicht__toestand">' + h((th.verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast')) + t(' · ціль ', ' · doel ')) + HV.getal(doel, 1) + ' °C</p>' +
      '<div class="hv-gezicht__rij">' + o.stapper({ actie: 'stap-doe', gegevens: { doel: 'thermostaat', mogelijkheid: 'doel' }, stap: 0.5, label: t('Ціль температури', 'Doeltemperatuur'), k: 'gz-doel' }) +
      o.schakel({ aan: aan > 0, icoon: 'lightbulb', toon: 'aan', actie: 'kamer-licht', gegevens: { kamer: k.id }, aria: t('Світло: ', 'Licht: ') + HV.p(k.naam) }) + '</div></div>';
  }
  HV.gezicht({ id: 'vierkant-kamer', profiel: 'vierkant', titel: ['Кімната', 'Kamer'], render: function (ctx) { return kamerGezicht(ctx, false); } });
  HV.gezicht({ id: 'rond-kamer', profiel: 'rond', titel: ['Кімната', 'Kamer'], render: function (ctx) { return kamerGezicht(ctx, true); } });

  // ── klein 800×480: два обличчя поруч і до чотирьох кнопок ──
  HV.gezicht({ id: 'klein-thuis', profiel: 'klein', titel: ['Дім і енергія', 'Thuis en energie'], render: function (ctx) {
    var w = ctx.staat, s = toestandWoord(ctx), e = saldo(w), z = HV.huiszin(ctx);
    return '<div class="hv-klein"><section class="hv-klein__vlak">' + kop(ctx, t('Дім', 'Thuis')) + '<p class="hv-gezicht__getal">' + HV.tijd(w.tijd) + '</p><p class="hv-gezicht__toestand hv-toon-' + s.toon + '">' + h(z.kort) + '</p></section>' +
      '<section class="hv-klein__vlak hv-toon-' + e.toon + '">' + kop(ctx, t('Енергія', 'Energie')) + '<p class="hv-gezicht__getal">' + e.getal + '</p><p class="hv-gezicht__toestand">' + h(e.woord) + ' · ' + HV.euro(HV.tarief.prijs(w.tijd)) + '</p></section>' +
      '<div class="hv-klein__knoppen">' + w.scenes.slice(0, 4).map(function (sc) { return o.knop({ tekst: HV.p(sc.naam), icoon: sc.icoon, actie: 'scene', gegevens: { scene: sc.id } }); }).join('') + '</div></div>';
  } });

  // ── deur 480×800: час, погода, виклик; після коду — «Йду» і «Я вдома» ──
  HV.gezicht({ id: 'deur-thuis', profiel: 'deur', titel: ['Двері', 'Deur'], render: function (ctx) {
    var w = ctx.staat, weer = HV.hemel.weer(w), weg = w.huisstand === 'afwezig' || w.huisstand === 'vakantie';
    return '<div class="hv-deur">' + kop(ctx, HV.paspoort.adres) + '<p class="hv-gezicht__getal">' + HV.tijd(w.tijd) + '</p><p class="hv-gezicht__toestand">' + h(HV.datum(w.tijd)) + '</p>' +
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

  // ── inkt: речення, винятки, пронумеровані плитки; чорне й біле, без неба ──
  HV.gezicht({ id: 'inkt-thuis', profiel: 'inkt', titel: ['Чорнило', 'Inkt'], render: function (ctx) {
    var w = ctx.staat, z = HV.huiszin(ctx);
    var uitz = w.nu.slice(0, 2).map(function (n) { return '<li>' + h(HV.p(n.tekst)) + '</li>'; }).join('');
    var tegels = w.favorieten.slice(0, 6).map(function (id, i) {
      var a = w.apparaten[id], b = o.beeld(a);
      return '<div class="hv-inkt__tegel' + (b.aan ? ' is-aan' : '') + '"><span class="hv-inkt__nummer">' + (i + 1) + '</span><span class="hv-inkt__naam">' + h(HV.p(a.naam)) + '</span><span class="hv-inkt__woord">' + h(b.woord) + '</span></div>';
    }).join('');
    return '<div class="hv-inkt"><p class="hv-inkt__zin">' + h(z.kort) + '</p>' + (uitz ? '<ul class="hv-inkt__uitz">' + uitz + '</ul>' : '') + '<div class="hv-inkt__tegels">' + tegels + '</div>' +
      '<p class="hv-inkt__voet">' + h(t('Оновлено о ', 'Bijgewerkt om ') + HV.tijd(w.tijd) + t(' · симуляція · число = фізична кнопка', ' · simulatie · cijfer = fysieke knop')) + '</p></div>';
  } });

  // ── tv 1920×1080: небо на весь екран, речення, ряд карток; фокус-кільце для пульта ──
  HV.gezicht({ id: 'tv-thuis', profiel: 'tv', titel: ['Телевізор', 'Televisie'], render: function (ctx) {
    var w = ctx.staat, z = HV.huiszin(ctx), s = saldo(w), weer = HV.hemel.weer(w);
    var kaart = function (icoon, naam, waarde, sub, naar) { return '<button type="button" class="hv-tv__kaart" data-actie="tv-kaart" data-naar="' + naar + '">' + HV.icoon(icoon, { maat: 'l' }) + '<span class="hv-tv__naam">' + h(naam) + '</span><span class="hv-tv__waarde">' + waarde + '</span><span class="hv-tv__sub">' + h(sub) + '</span></button>'; };
    var th = w.apparaten.thermostaat.st, ev = w.voertuigen[0];
    return '<div class="hv-tv"><p class="hv-tv__datum">' + h(HV.datum(w.tijd)) + ' · ' + HV.tijd(w.tijd) + ' ' + simMerk(w) + '</p><h1 class="hv-tv__zin">' + h(z.kort) + '</h1>' +
      '<div class="hv-tv__rij">' +
      kaart('thermometer', t('Вітальня', 'Woonkamer'), HV.maat(th.temperatuur, '°C', 1), th.verwarmt ? HV.woord.verwarmt() : t('тримає', 'houdt vast'), 'kamers') +
      kaart('zap', t('Енергія', 'Energie'), s.getal, s.woord, 'energie') +
      kaart('shield', t('Безпека', 'Beveiliging'), '<span class="hv-tv__woord">' + h(HV.p(HV.alarmWoord[w.apparaten.alarm.st.stand]).split(': ')[1]) + '</span>', w.apparaten.voordeurslot.st.vergrendeld ? t('двері замкнено', 'deuren op slot') : t('двері відімкнено', 'deur van het slot'), 'beveiliging') +
      kaart('car', t('Авто', 'Auto'), HV.maat(Math.round(ev.lading), '%'), w.apparaten.laadpaal.st.laadt ? HV.woord.laadt() : HV.maatTekst(ev.bereik, t('км', 'km')), 'garage') +
      kaart(weer.icoon, t('Надворі', 'Buiten'), HV.maat(w.weer.temp, '°C'), weer.tekst.split(', ')[1] || '', 'overzicht') +
      '</div></div>';
  } });
  HV.actie('tv-kaart', function (ctx, g) { HV.meld({ icoon: 'tv', titel: t('На телевізорі розділи відкриває пульт', 'Op de televisie opent de afstandsbediening de onderdelen'), tekst: 'huis.tarasevych.com/paneel/tv/demo → ' + g.naar }); });
})(window.HV = window.HV || {});
