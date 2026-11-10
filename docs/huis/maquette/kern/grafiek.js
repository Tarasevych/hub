// hv-grafiek: eigen SVG zonder bibliotheek — lijn, vlak, staven, toestandsbanen, warmtekaart, ring van stromen.
// Кожен ряд має маркер, власний штрих і прямий підпис (тон ніколи не єдина ознака); під графіком — речення-підсумок
// і «Показати як таблицю». Поле малюється у відсотках (SVG розтягується), підписи — HTML, тому текст не масштабується.
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t;
  var open = {}; // які графіки показано таблицею

  // Типові маркер і штрих за тоном (§4, §6 дизайн-мови).
  var TOON = {
    'net-in': { merk: 'merk-vierkant', streep: '' },
    'net-uit': { merk: 'merk-vierkant-leeg', streep: '6 3' },
    zon: { merk: 'merk-cirkel', streep: '', dik: true },
    batterij: { merk: 'merk-halve-cirkel', streep: '2 3' },
    auto: { merk: 'merk-kruis', streep: '8 3 2 3' },
    warm: { merk: 'merk-streep', streep: '12 4' },
    koud: { merk: 'merk-streep', streep: '4 4' },
    aan: { merk: 'merk-cirkel', streep: '' },
    neutraal: { merk: 'merk-vierkant', streep: '' }
  };
  var merk = function (r) { return HV.icoon(r.merk || (TOON[r.toon] || TOON.neutraal).merk, { maat: 'merk' }); };

  function tabel(kop, rijen) {
    return '<div class="hv-tabel__rol"><table class="hv-tabel"><thead><tr>' + kop.map(function (k) { return '<th scope="col">' + h(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rijen.map(function (r) { return '<tr>' + r.map(function (c, i) { return i === 0 ? '<th scope="row">' + h(c) + '</th>' : '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  HV.tabel = tabel;

  function lijst(reeksen) {
    return '<ul class="hv-grafiek__legenda">' + reeksen.map(function (r) {
      return '<li class="hv-toon-' + h(r.toon || 'neutraal') + '">' + merk(r) + '<span>' + h(r.naam) + (r.geschat ? ' <span class="hv-grafiek__geschat">≈ ' + h(t('оцінено', 'geschat')) + '</span>' : '') + '</span>' + (r.waarde != null ? '<strong>' + r.waarde + '</strong>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function omhulsel(p, soort, veld, legenda, tabelHtml) {
    var alsTabel = !!open[p.id];
    return '<figure class="hv-grafiek hv-grafiek--' + soort + '" data-k="grafiek-' + h(p.id) + '">' +
      (p.titel ? '<div class="hv-grafiek__kop"><h3 class="hv-grafiek__titel">' + h(p.titel) + '</h3>' + (p.eenheid ? '<span class="hv-grafiek__eenheid">' + h(p.eenheid) + '</span>' : '') + '</div>' : '') +
      (alsTabel ? tabelHtml : veld) + (legenda || '') +
      (p.samenvatting ? '<figcaption class="hv-grafiek__zin">' + h(p.samenvatting) + '</figcaption>' : '') +
      (tabelHtml ? '<button type="button" class="hv-link hv-grafiek__wissel" data-actie="grafiek-tabel" data-grafiek="' + h(p.id) + '" aria-pressed="' + (alsTabel ? 'true' : 'false') + '">' + h(alsTabel ? t('Показати графіком', 'Als grafiek tonen') : t('Показати як таблицю', 'Als tabel tonen')) + '</button>' : '') +
      '</figure>';
  }

  function schaal(min, max) {
    // до 4 круглих поділок
    var bereik = max - min || 1;
    var ruw = bereik / 3, macht = Math.pow(10, Math.floor(Math.log(ruw) / Math.LN10));
    var stap = [1, 2, 2.5, 5, 10].map(function (m) { return m * macht; }).filter(function (s) { return s >= ruw; })[0] || ruw;
    var van = Math.floor(min / stap) * stap, tot = Math.ceil(max / stap) * stap, tikken = [];
    for (var v = van; v <= tot + stap / 1000; v += stap) tikken.push(Math.round(v * 1000) / 1000);
    return { min: van, max: tot, tikken: tikken, decimalen: stap < 1 ? (stap < 0.1 ? 2 : 1) : 0 };
  }

  HV.actie('grafiek-tabel', function (ctx, g) { open[g.grafiek] = !open[g.grafiek]; HV.teken(); });

  HV.grafiek = {
    open: open,

    /**
     * Лінії (і області, якщо reeks.vlak). p: { id, titel, eenheid, samenvatting, hoogte, nu (x), x:{ min, max, tikken:[{ x, label }] },
     *   reeksen:[{ naam, toon, punten:[[x,y]…], vlak, geschat, merk, streep }], tabelKop:[…] }
     */
    lijn: function (p) {
      var ys = [];
      p.reeksen.forEach(function (r) { r.punten.forEach(function (q) { ys.push(q[1]); }); });
      var s = schaal(Math.min(0, Math.min.apply(null, ys)), Math.max.apply(null, ys));
      if (p.y) { if (p.y.min != null) s.min = p.y.min; if (p.y.max != null) s.max = p.y.max; }
      var X = function (x) { return (x - p.x.min) / (p.x.max - p.x.min) * 100; };
      var Y = function (y) { return 100 - (y - s.min) / (s.max - s.min) * 100; };
      var paden = '', namen = '';
      p.reeksen.forEach(function (r) {
        var stijl = TOON[r.toon] || TOON.neutraal;
        var d = r.punten.map(function (q, i) { return (i ? 'L' : 'M') + X(q[0]).toFixed(2) + ' ' + Y(q[1]).toFixed(2); }).join('');
        if (r.vlak) paden += '<path class="hv-grafiek__vlak hv-toon-' + h(r.toon) + '" d="' + d + 'L' + X(r.punten[r.punten.length - 1][0]).toFixed(2) + ' ' + Y(0).toFixed(2) + 'L' + X(r.punten[0][0]).toFixed(2) + ' ' + Y(0).toFixed(2) + 'Z"/>';
        paden += '<path class="hv-grafiek__lijn hv-toon-' + h(r.toon) + (stijl.dik ? ' is-dik' : '') + '" d="' + d + '" stroke-dasharray="' + (r.geschat ? '4 4' : (r.streep != null ? r.streep : stijl.streep)) + '"/>';
        var laatste = r.punten[r.punten.length - 1];
        namen += '<span class="hv-grafiek__naam hv-toon-' + h(r.toon) + '" style="left:' + X(laatste[0]).toFixed(1) + '%;top:' + Y(laatste[1]).toFixed(1) + '%">' + merk(r) + '</span>';
      });
      var rooster = s.tikken.map(function (v) { return '<line class="hv-grafiek__' + (v === 0 ? 'nul' : 'raster') + '" x1="0" x2="100" y1="' + Y(v).toFixed(2) + '" y2="' + Y(v).toFixed(2) + '"/>'; }).join('');
      var yLabels = s.tikken.map(function (v) { return '<span class="hv-grafiek__y" style="top:' + Y(v).toFixed(1) + '%">' + HV.getal(v, s.decimalen) + '</span>'; }).join('');
      var xLabels = (p.x.tikken || []).map(function (k) { return '<span class="hv-grafiek__x" style="left:' + X(k.x).toFixed(1) + '%">' + h(k.label) + '</span>'; }).join('');
      var nu = p.nu != null ? '<span class="hv-grafiek__nu" style="left:' + X(p.nu).toFixed(1) + '%"><span>' + h(t('зараз', 'nu')) + '</span></span>' : '';
      var veld = '<div class="hv-grafiek__veld" style="height:' + (p.hoogte || 160) + 'px" role="img" aria-label="' + h((p.titel || '') + '. ' + (p.samenvatting || '')) + '">' +
        '<div class="hv-grafiek__as">' + yLabels + '</div><div class="hv-grafiek__doek"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + rooster + paden + '</svg>' + namen + nu + '<div class="hv-grafiek__xas">' + xLabels + '</div></div></div>';
      var kop = (p.tabelKop || [t('Час', 'Tijd')]).concat(p.reeksen.map(function (r) { return r.naam; }));
      var basis = p.reeksen[0].punten;
      var stapje = Math.max(1, Math.round(basis.length / 12));
      var rijen = basis.filter(function (q, i) { return i % stapje === 0; }).map(function (q, i) {
        return [p.x.format ? p.x.format(q[0]) : String(q[0])].concat(p.reeksen.map(function (r) { var z = r.punten[i * stapje]; return z ? HV.getal(z[1], s.decimalen + 1) : '—'; }));
      });
      return omhulsel(p, 'lijn', veld, lijst(p.reeksen), tabel(kop, rijen));
    },

    /**
     * Стовпці (також під нулем — від'ємна ціна). p: { id, titel, eenheid, samenvatting, hoogte, decimalen,
     *   staven:[{ label, waarde, toon, geschat, vink (найдешевша), nu }], tikken (кожна N-та мітка) }
     */
    staven: function (p) {
      var ws = p.staven.map(function (b) { return b.waarde; });
      var s = schaal(Math.min(0, Math.min.apply(null, ws)), Math.max.apply(null, ws));
      var Y = function (y) { return 100 - (y - s.min) / (s.max - s.min) * 100; };
      var n = p.staven.length, nul = Y(0);
      var staven = p.staven.map(function (b, i) {
        var y = Y(b.waarde), boven = Math.min(y, nul), hoogte = Math.max(0.8, Math.abs(y - nul));
        return '<span class="hv-grafiek__staaf hv-toon-' + h(b.toon || 'net-in') + (b.geschat ? ' is-geschat' : '') + (b.nu ? ' is-nu' : '') + (b.vink ? ' is-vink' : '') + (b.waarde < 0 ? ' is-negatief' : '') + '" style="left:' + (i / n * 100).toFixed(2) + '%;width:' + (100 / n).toFixed(2) + '%;top:' + boven.toFixed(2) + '%;height:' + hoogte.toFixed(2) + '%"><i></i>' + (b.vink ? HV.icoon('check', { maat: 'maker', klas: 'hv-grafiek__vink' }) : '') + '</span>';
      }).join('');
      var elke = p.tikken || Math.ceil(n / 8);
      var xLabels = p.staven.map(function (b, i) { return i % elke === 0 ? '<span class="hv-grafiek__x" style="left:' + ((i + 0.5) / n * 100).toFixed(1) + '%">' + h(b.label) + '</span>' : ''; }).join('');
      var yLabels = s.tikken.map(function (v) { return '<span class="hv-grafiek__y" style="top:' + Y(v).toFixed(1) + '%">' + HV.getal(v, p.decimalen != null ? p.decimalen : s.decimalen) + '</span>'; }).join('');
      var rooster = s.tikken.map(function (v) { return '<span class="hv-grafiek__streep' + (v === 0 ? ' is-nul' : '') + '" style="top:' + Y(v).toFixed(2) + '%"></span>'; }).join('');
      var veld = '<div class="hv-grafiek__veld" style="height:' + (p.hoogte || 160) + 'px" role="img" aria-label="' + h((p.titel || '') + '. ' + (p.samenvatting || '')) + '">' +
        '<div class="hv-grafiek__as">' + yLabels + '</div><div class="hv-grafiek__doek">' + rooster + staven + '<div class="hv-grafiek__xas">' + xLabels + '</div></div></div>';
      var rijen = p.staven.map(function (b) { return [b.label + (b.nu ? ' (' + t('зараз', 'nu') + ')' : ''), HV.getal(b.waarde, p.decimalen != null ? p.decimalen : 2) + (b.vink ? ' ✓ ' + h(t('дешево', 'goedkoop')) : '') + (b.geschat ? ' ≈' : '')]; });
      return omhulsel(p, 'staaf', veld, p.legenda ? lijst(p.legenda) : '', tabel([p.tabelKop || t('Час', 'Tijd'), p.eenheid || ''], rijen));
    },

    /**
     * Смуги станів у часі. p: { id, titel, samenvatting, van, tot, nu, tikken:[{ x, label }],
     *   banen:[{ naam, stukken:[{ van, tot, toon, klas, label }], punten:[{ x, label, icoon }] }] }
     */
    toestanden: function (p) {
      var X = function (x) { return Math.max(0, Math.min(100, (x - p.van) / (p.tot - p.van) * 100)); };
      var banen = p.banen.map(function (b) {
        var stukken = (b.stukken || []).map(function (s) { return '<span class="hv-baan__stuk' + (s.toon ? ' hv-toon-' + h(s.toon) : '') + (s.klas ? ' ' + h(s.klas) : '') + '" style="left:' + X(s.van).toFixed(2) + '%;width:' + Math.max(0.4, X(s.tot) - X(s.van)).toFixed(2) + '%" title="' + h(s.label || '') + '"></span>'; }).join('');
        var punten = (b.punten || []).map(function (q) { return '<span class="hv-baan__punt" style="left:' + X(q.x).toFixed(2) + '%" title="' + h(q.label || '') + '">' + (q.icoon ? HV.icoon(q.icoon, { maat: 'maker' }) : '') + '</span>'; }).join('');
        return '<div class="hv-baan' + (b.klas ? ' ' + h(b.klas) : '') + '"><span class="hv-baan__naam">' + h(b.naam) + '</span><div class="hv-baan__spoor">' + stukken + punten + '</div></div>';
      }).join('');
      var xLabels = (p.tikken || []).map(function (k) { return '<span class="hv-grafiek__x" style="left:' + X(k.x).toFixed(1) + '%">' + h(k.label) + '</span>'; }).join('');
      var nu = p.nu != null ? '<span class="hv-grafiek__nu hv-grafiek__nu--banen" style="--x:' + (X(p.nu) / 100).toFixed(4) + '"><span>' + h(t('зараз', 'nu')) + '</span></span>' : '';
      var veld = '<div class="hv-grafiek__banen" role="img" aria-label="' + h((p.titel || '') + '. ' + (p.samenvatting || '')) + '">' + banen + '<div class="hv-grafiek__banenas"><span class="hv-baan__naam"></span><div class="hv-baan__spoor">' + xLabels + '</div></div>' + nu + '</div>';
      var rijen = [];
      p.banen.forEach(function (b) {
        (b.stukken || []).forEach(function (s) { if (s.label) rijen.push([b.naam, h(s.label), h((p.format ? p.format(s.van) : s.van) + '–' + (p.format ? p.format(s.tot) : s.tot))]); });
        (b.punten || []).forEach(function (q) { rijen.push([b.naam, h(q.label || ''), h(p.format ? p.format(q.x) : String(q.x))]); });
      });
      return omhulsel(p, 'toestand', veld, '', tabel([t('Доріжка', 'Baan'), t('Що', 'Wat'), t('Коли', 'Wanneer')], rijen));
    },

    /** Теплокарта: п'ять щаблів одного тону, число в кожній клітинці. p: { id, titel, rijen:[…], kolommen:[…], waarden:[[…]], decimalen, eenheid } */
    warmtekaart: function (p) {
      var plat = [].concat.apply([], p.waarden).filter(function (v) { return v != null; });
      var min = Math.min.apply(null, plat), max = Math.max.apply(null, plat);
      var trede = function (v) { return v == null ? 0 : 1 + Math.min(4, Math.floor((v - min) / ((max - min) || 1) * 5)); };
      var kop = '<tr><th></th>' + p.kolommen.map(function (k) { return '<th scope="col">' + h(k) + '</th>'; }).join('') + '</tr>';
      var lijf = p.rijen.map(function (r, i) {
        return '<tr><th scope="row">' + h(r) + '</th>' + p.waarden[i].map(function (v) { return '<td class="hv-warmte hv-warmte--' + trede(v) + '">' + (v == null ? '<span class="hv-warmte__leeg" aria-label="' + h(HV.woord.onbekend()) + '">—</span>' : HV.getal(v, p.decimalen || 0)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      return '<figure class="hv-grafiek hv-grafiek--warmte" data-k="grafiek-' + h(p.id) + '">' + (p.titel ? '<div class="hv-grafiek__kop"><h3 class="hv-grafiek__titel">' + h(p.titel) + '</h3>' + (p.eenheid ? '<span class="hv-grafiek__eenheid">' + h(p.eenheid) + '</span>' : '') + '</div>' : '') +
        '<div class="hv-tabel__rol"><table class="hv-warmtekaart"><thead>' + kop + '</thead><tbody>' + lijf + '</tbody></table></div>' + (p.samenvatting ? '<figcaption class="hv-grafiek__zin">' + h(p.samenvatting) + '</figcaption>' : '') + '</figure>';
    },

    /**
     * Кільце потоків (12 px): сегменти підписані словом у легенді. p: { id, titel, samenvatting, midden:{ waarde (HTML), label },
     *   delen:[{ naam, waarde (число), tekst (HTML), toon, geschat }], klein }
     */
    ring: function (p) {
      var totaal = p.delen.reduce(function (s, d) { return s + Math.max(0, d.waarde); }, 0) || 1;
      var begin = 0, kier = p.delen.filter(function (d) { return d.waarde > 0; }).length > 1 ? 1.6 : 0;
      var bogen = p.delen.map(function (d) {
        var deel = Math.max(0, d.waarde) / totaal * 100;
        if (deel <= 0) return '';
        var stijl = TOON[d.toon] || TOON.neutraal;
        var boog = '<circle class="hv-ring__boog hv-toon-' + h(d.toon) + (d.geschat ? ' is-geschat' : '') + '" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="' + Math.max(0.5, deel - kier).toFixed(2) + ' ' + (100 - Math.max(0.5, deel - kier)).toFixed(2) + '" stroke-dashoffset="' + (-begin).toFixed(2) + '" data-streep="' + h(stijl.streep) + '"/>';
        begin += deel;
        return boog;
      }).join('');
      var veld = '<div class="hv-ring' + (p.klein ? ' hv-ring--klein' : '') + '" role="img" aria-label="' + h((p.titel || '') + '. ' + (p.samenvatting || '')) + '"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="hv-ring__baan" cx="50" cy="50" r="42"/><g transform="rotate(-90 50 50)">' + bogen + '</g></svg>' +
        (p.midden ? '<div class="hv-ring__midden"><span class="hv-ring__getal">' + p.midden.waarde + '</span><span class="hv-ring__label">' + h(p.midden.label) + '</span></div>' : '') + '</div>';
      var legenda = lijst(p.delen.map(function (d) { return { naam: d.naam, toon: d.toon, geschat: d.geschat, waarde: d.tekst }; }));
      var rijen = p.delen.map(function (d) { return [d.naam, d.tekst || HV.getal(d.waarde, 1)]; });
      return '<figure class="hv-grafiek hv-grafiek--ring" data-k="grafiek-' + h(p.id) + '">' + (p.titel ? '<div class="hv-grafiek__kop"><h3 class="hv-grafiek__titel">' + h(p.titel) + '</h3></div>' : '') +
        '<div class="hv-grafiek__ringrij">' + veld + (open[p.id] ? tabel([t('Потік', 'Stroom'), t('Зараз', 'Nu')], rijen) : legenda) + '</div>' +
        (p.samenvatting ? '<figcaption class="hv-grafiek__zin">' + h(p.samenvatting) + '</figcaption>' : '') + '</figure>';
    },

    /** Мініграфік у рядку (без осей): лінія з маркером на кінці. punten: [y…] */
    vonk: function (punten, toon) {
      var min = Math.min.apply(null, punten), max = Math.max.apply(null, punten), n = punten.length - 1;
      var d = punten.map(function (y, i) { return (i ? 'L' : 'M') + (i / n * 100).toFixed(1) + ' ' + (100 - (y - min) / ((max - min) || 1) * 100).toFixed(1); }).join('');
      return '<svg class="hv-vonk hv-toon-' + h(toon || 'neutraal') + '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>';
    }
  };
})(window.HV = window.HV || {});
