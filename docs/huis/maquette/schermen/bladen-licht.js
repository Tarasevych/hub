// Bladen voor licht — еталонні аркуші керування: лампа (яскравість, температура світла, колір, ефекти, відлік),
// група світла (учасники, «частково») і розетка (потужність, витрата, вартість). Взірець для аркушів інших типів:
// HV.blad({ soort, past(apparaat), delen:{ bediening } }); «Історія» й «Налаштування» дає каркас (HV.bladDelen).
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  var veld = function (label, html, extra) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };
  var TEMP = [[2700, ['Тепле', 'Warm']], [3000, ['М’яке', 'Zacht']], [4000, ['Нейтральне', 'Neutraal']], [5500, ['Денне', 'Daglicht']]];
  var EFFECT = [['geen', ['Без ефекту', 'Geen']], ['kaars', ['Свічка', 'Kaars']], ['adem', ['Дихання', 'Ademen']], ['regenboog', ['Веселка', 'Regenboog']], ['stroboscoop', ['Стробоскоп', 'Stroboscoop']]];

  function hoofd(a, b, getal) {
    var sch = b.schakel;
    var aan = a.wacht && sch && a.wacht.mogelijkheid === sch.mogelijkheid ? a.wacht.waarde : b.aan;
    return '<div class="hv-bediening__hoofd" data-k="hoofd">' + o.schakel({ aan: aan, icoon: b.icoon, toon: b.toon, staat: a.wacht ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : null), actie: 'schakel', gegevens: { doel: a.id, mogelijkheid: sch.mogelijkheid }, aria: HV.p(a.naam) }) +
      '<div><p class="hv-bediening__woord">' + h(a.wacht ? HV.woord.wacht() : (aan ? HV.woord.aan() : HV.woord.uit())) + '</p>' + (getal ? '<p class="hv-bediening__getal" id="blad-getal">' + getal + '</p>' : '') + '</div></div>';
  }
  function waarom(a) {
    if (!HV.makerZichtbaar(a)) return '';
    return '<p class="hv-waarom" data-k="waarom">' + h((HV.kijk.isAan(a) ? t('Увімкнено', 'Aan') : t('Змінено', 'Gewijzigd')) + ': ') + o.maker(a.maker) + '</p>';
  }

  // ── Лампа ──
  function lamp(ctx, a) {
    var w = ctx.staat, st = a.st, b = o.beeld(a);
    var heeft = function (m) { return a.mog.indexOf(m) >= 0; };
    var uit = hoofd(a, b, heeft('helderheid') ? HV.maat(HV.gewenst(a, 'helderheid'), '%') : '');
    if (heeft('helderheid')) {
      uit += veld(t('Яскравість', 'Helderheid'), o.schuif({ label: t('Яскравість', 'Helderheid'), waarde: HV.gewenst(a, 'helderheid'), min: 1, max: 100, stap: 1, toon: 'aan', actie: 'licht-schuif', gegevens: { doel: a.id, mogelijkheid: 'helderheid' }, gewenst: a.wacht && a.wacht.mogelijkheid === 'helderheid' ? st.helderheid : null }));
    }
    if (heeft('kleurtemp')) {
      var kt = HV.gewenst(a, 'kleurtemp');
      uit += veld(t('Температура світла', 'Lichttemperatuur'),
        '<div class="hv-filter" role="group" aria-label="' + h(t('Заготовки температури світла', 'Voorkeuzes voor lichttemperatuur')) + '">' + TEMP.map(function (x) { return o.chip({ filter: true, gekozen: Math.abs(kt - x[0]) < 150 && !(st.verzadiging > 0), tekst: HV.p(x[1]), actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'kleurtemp', waarde: x[0] }, k: 'kt-' + x[0] }); }).join('') + '</div>' +
        o.schuif({ label: t('Температура світла', 'Lichttemperatuur'), waarde: kt, min: 2200, max: 6500, stap: 100, eenheid: 'K', toon: 'neutraal', klas: 'hv-schuif--warmkoud', actie: 'licht-schuif', gegevens: { doel: a.id, mogelijkheid: 'kleurtemp' } }));
    }
    if (heeft('kleur')) {
      uit += veld(t('Колір', 'Kleur'), o.kleur({ tint: st.tint, verzadiging: st.verzadiging, wijze: HV.ui.lees('kleur-wijze', 'voorkeuzes'), actie: 'licht-kleur', gegevens: { doel: a.id } }));
    }
    if (heeft('effect')) {
      uit += veld(t('Ефекти', 'Effecten'), o.segment({ label: t('Ефект', 'Effect'), waarde: HV.gewenst(a, 'effect') || 'geen', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'effect' }, klas: 'hv-segment--rol', opties: EFFECT.map(function (x) { return { id: x[0], label: HV.p(x[1]), icoon: x[0] === 'stroboscoop' ? 'eye' : null }; }) }),
        ' ' + o.gevolg(t('Що станеться: лампа почне змінювати яскравість чи колір сама. Пов’язано з: «Стробоскоп» — чутлива дія, бо може заважати людям у кімнаті. Як повернути: оберіть «Без ефекту».', 'Wat er gebeurt: de lamp verandert zelf van helderheid of kleur. Hangt samen met: ‘Stroboscoop’ is een gevoelige actie, want het kan mensen in de kamer hinderen. Terugdraaien: kies ‘Geen’.'), { kop: t('Ефекти', 'Effecten') }));
    }
    // відлік «вимкнути через…»
    var uitOm = st.uitOm;
    var knoppen = [15, 30, 60].map(function (m) { return o.chip({ filter: true, tekst: HV.duur(m), actie: 'licht-aftel', gegevens: { doel: a.id, minuten: m }, k: 'aftel-' + m }); }).join('') + o.chip({ filter: true, tekst: t('о 23:00', 'om 23:00'), actie: 'licht-aftel', gegevens: { doel: a.id, om: 23 }, k: 'aftel-23' });
    uit += veld(t('Вимкнути через', 'Uit over'), (uitOm
      ? '<div class="hv-aftelrij" data-k="aftelrij">' + o.aftel({ rest: (uitOm - w.tijd) / 60000, totaal: 60, icoon: 'timer' }) + '<span class="hv-aftelrij__om">' + h(t('о ', 'om ') + HV.tijd(uitOm)) + '</span>' + o.knop({ tekst: t('Скасувати відлік', 'Aftellen stoppen'), klein: true, soort: 'stil', actie: 'licht-aftel', gegevens: { doel: a.id, minuten: 0 } }) + '</div>'
      : '<div class="hv-filter">' + knoppen + '</div>'));
    return o.kaart({ inhoud: uit }) + waarom(a) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Знайти лампу', 'Lamp zoeken'), icoon: 'search', soort: 'stil', actie: 'licht-zoek', gegevens: { doel: a.id } }) + '</div>';
  }

  HV.blad({ soort: 'licht', past: function (a) { return a.soort === 'licht'; }, delen: { bediening: lamp } });

  HV.actie('licht-schuif', function (ctx, g) {
    // під час руху — лише число в шапці аркуша; команда йде, коли бігунок відпущено
    if (g.mogelijkheid === 'helderheid') { var el = document.getElementById('blad-getal'); if (el) el.innerHTML = HV.maat(g.waarde, '%'); }
    if (g.fase === 'klaar') HV.doe({ doel: g.doel, mogelijkheid: g.mogelijkheid, waarde: g.waarde });
  });
  HV.actie('licht-kleur', function (ctx, g) {
    if (g.fase === 'sleep') return;
    var a = HV.staat.apparaat(g.doel);
    var tint = g.as === 'tint' ? g.waarde : g.tint != null ? g.tint : a.st.tint;
    var verz = g.as === 'verzadiging' ? g.waarde : g.verzadiging != null ? g.verzadiging : a.st.verzadiging;
    HV.doe({ doel: g.doel, mogelijkheid: 'kleur', waarde: { tint: Number(tint), verzadiging: Number(verz) } });
  });
  HV.actie('kleur-wijze', function (ctx, g) { HV.ui.zet('kleur-wijze', g.waarde); });
  HV.actie('licht-aftel', function (ctx, g) {
    var w = ctx.staat, om = 0;
    if (g.om) { var d = new Date(w.tijd); om = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(g.om), 0); if (om <= w.tijd) om += 86400000; }
    else if (Number(g.minuten) > 0) om = w.tijd + Number(g.minuten) * 60000;
    var a = HV.staat.apparaat(g.doel);
    if (om && !HV.kijk.isAan(a)) { HV.meld({ icoon: 'timer', titel: HV.p(a.naam), tekst: t('Лампа вимкнена — відлік не потрібен.', 'De lamp is uit — aftellen is niet nodig.') }); return; }
    HV.doe({ doel: g.doel, mogelijkheid: 'aftel', waarde: om || null });
  });
  HV.actie('licht-zoek', function (ctx, g) {
    var a = HV.staat.apparaat(g.doel);
    HV.logboek.voegToe({ maker: HV.mens(), wat: [a.naam[0] + ': блимнула тричі', a.naam[1] + ': knipperde drie keer'], soort: 'huis.apparaat', doel: a.id });
    HV.meld({ maker: HV.mens(), icoon: 'lightbulb', titel: HV.p(a.naam), tekst: t('Лампа блимнула тричі й повернулася до свого стану.', 'De lamp knipperde drie keer en staat weer zoals ze stond.') });
    HV.staat.wijzig();
  });

  // ── Група світла ──
  function groep(ctx, a) {
    var w = ctx.staat, b = o.beeld(a);
    var leden = a.leden.map(function (id) { return w.apparaten[id]; });
    var aan = leden.filter(function (l) { return l.st.aan; }).length;
    var uit = hoofd(a, b, aan ? HV.maat(HV.gewenst(a, 'helderheid'), '%') : '');
    uit += '<p class="hv-tekst hv-tekst--zacht">' + h(aan === 0 ? t('Усі лампи групи вимкнено.', 'Alle lampen van de groep zijn uit.') : aan === leden.length ? t('Усі лампи групи ввімкнено.', 'Alle lampen van de groep zijn aan.') : t('Частково: ', 'Gedeeltelijk: ') + aan + ' ' + t('з', 'van') + ' ' + leden.length + '.') + '</p>';
    uit += veld(t('Яскравість групи', 'Helderheid van de groep'), o.schuif({ label: t('Яскравість групи', 'Helderheid van de groep'), waarde: Math.max(1, HV.gewenst(a, 'helderheid') || 1), min: 1, max: 100, stap: 1, toon: 'aan', actie: 'licht-schuif', gegevens: { doel: a.id, mogelijkheid: 'helderheid' }, uit: aan === 0 }));
    return o.kaart({ inhoud: uit }) + o.kaart({ titel: t('Учасники', 'Leden'), inhoud: '<div class="hv-tegels">' + leden.map(function (l) { return o.tegel(l, { vorm: '2x1' }); }).join('') + '</div>' }) + waarom(a);
  }
  HV.blad({ soort: 'lichtgroep', past: function (a) { return a.soort === 'lichtgroep'; }, delen: { bediening: groep } });

  // ── Розетка ──
  function stekker(ctx, a) {
    var w = ctx.staat, st = a.st, b = o.beeld(a);
    var uit = hoofd(a, b, st.aan ? HV.maat(st.vermogen, t('Вт', 'W')) : '');
    var prijs = HV.tarief.prijs(w.tijd);
    uit += '<div class="hv-getallen">' + o.getal({ maat: 'm', label: t('Сьогодні', 'Vandaag'), waarde: HV.maat(st.vandaag, t('кВт·год', 'kWh'), 2) }) +
      o.getal({ maat: 'm', label: t('Вартість сьогодні', 'Kosten vandaag'), waarde: HV.euro(st.vandaag * 0.27), sub: h(t('приклад', 'voorbeeld')) }) +
      o.getal({ maat: 'm', label: t('Ціна зараз', 'Prijs nu'), waarde: HV.euro(prijs), sub: h(t('за кВт·год', 'per kWh')) }) + '</div>';
    // потужність за останні 6 годин: детерміновано від назви (макет)
    var punten = [], zaad = a.id.length * 7;
    for (var i = 0; i <= 36; i++) { var x = w.tijd - (36 - i) * 600000; var golf = Math.sin((i + zaad) / 4) * 0.25 + Math.sin((i + zaad) / 1.7) * 0.08; punten.push([x, Math.max(0, Math.round((i === 36 ? (st.aan ? st.vermogen : 0) : (a.id === 'stekkermedia' ? 60 : 110) * (0.75 + golf))))]); }
    var tikken = [0, 2, 4, 6].map(function (u) { var x = w.tijd - (6 - u) * 3600000; return { x: x, label: HV.tijd(x) }; });
    var grafiek = HV.grafiek.lijn({ id: 'vermogen-' + a.id, titel: t('Потужність, 6 годин', 'Vermogen, 6 uur'), eenheid: t('Вт', 'W'), hoogte: 120, nu: w.tijd, x: { min: w.tijd - 6 * 3600000, max: w.tijd, tikken: tikken, format: HV.tijd },
      reeksen: [{ naam: HV.p(a.naam), toon: 'net-in', vlak: true, punten: punten }], samenvatting: t('Симульований ряд; останнє значення — виміряне зараз.', 'Gesimuleerde reeks; de laatste waarde is nu gemeten.') });
    return o.kaart({ inhoud: uit }) + o.kaart({ inhoud: grafiek }) + waarom(a);
  }
  HV.blad({ soort: 'stopcontact', past: function (a) { return a.soort === 'stopcontact'; }, delen: { bediening: stekker } });
})(window.HV = window.HV || {});
