// Hemel en doorsnede: de fase van de hemel uit huistijd, weer en huisstand; de doorsnede van het huis met waargenomen ramen.
// Небо несе контекст, а не дані: градієнт із трьох точок фази, без хмаринок і зірок. Кольори — лише токени
// (--hv-hemel-<fase>-<punt>), змішані через color-mix; у JS немає жодного значення кольору.
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t;

  var FASEN = ['nacht', 'dageraad', 'dag', 'schemer'];
  var FASE_NAAM = { nacht: ['ніч', 'nacht'], dageraad: ['світанок', 'dageraad'], dag: ['день', 'dag'], schemer: ['сутінки', 'schemer'] };

  /** Фаза за годинником дому з лінійною сумішшю 30 хв до й після кожної межі: { a, b, deel } (deel — частка b). */
  function fase(uur) {
    var klok = HV.bouw.hemel.klok;
    var half = (klok.mengMinuten || 30) / 60;
    var grenzen = [[klok.dageraad[0], 'nacht', 'dageraad'], [klok.dag[0], 'dageraad', 'dag'], [klok.schemer[0], 'dag', 'schemer'], [klok.nacht[0], 'schemer', 'nacht']];
    for (var i = 0; i < grenzen.length; i++) {
      var g = grenzen[i];
      if (uur >= g[0] - half && uur < g[0] + half) return { a: g[1], b: g[2], deel: (uur - (g[0] - half)) / (2 * half) };
    }
    var nu = uur < klok.dageraad[0] || uur >= klok.nacht[0] ? 'nacht' : uur < klok.dag[0] ? 'dageraad' : uur < klok.schemer[0] ? 'dag' : 'schemer';
    return { a: nu, b: nu, deel: 0 };
  }

  var pct = function (x) { return Math.round(x * 1000) / 10 + '%'; };
  function meng(punt, f, bewolkt, nachtDonker) {
    var kleur = f.deel > 0.001 && f.a !== f.b
      ? 'color-mix(in srgb, var(--hv-hemel-' + f.a + '-' + punt + ') ' + pct(1 - f.deel) + ', var(--hv-hemel-' + f.b + '-' + punt + '))'
      : 'var(--hv-hemel-' + f.a + '-' + punt + ')';
    if (bewolkt > 0.005) kleur = 'color-mix(in srgb, ' + kleur + ' ' + pct(1 - bewolkt) + ', var(--surface2))';
    if (nachtDonker > 0) kleur = 'color-mix(in srgb, ' + kleur + ' ' + pct(1 - nachtDonker) + ', var(--bg))';
    return kleur;
  }

  HV.hemel = {
    fasen: FASEN,
    faseNaam: FASE_NAAM,
    fase: fase,

    /** Обчислює небо для світу: { fase, naam, boven, onder, gloed, gloedDekking, neerslag }. */
    bereken: function (w, thema) {
      var c = HV.bouw.hemel;
      var f = w.huisstand === 'nacht' ? { a: 'nacht', b: 'nacht', deel: 0 } : fase(HV.uur(w.tijd));
      var weg = w.huisstand === 'afwezig' || w.huisstand === 'vakantie';
      var weerOud = w.weer.verouderd;
      var wolk = weerOud ? 0 : (w.weer.mist ? (c.mist || 0.6) : (c.bewolkingMax || 0.4) * w.weer.bewolking);
      var bewolkt = Math.min(c.mengselMax || 0.75, wolk + (weg ? (c.afwezig || 0.55) : 0));
      var nachtDonker = w.huisstand === 'nacht' && thema === 'donker' ? (c.nachtstandDonker || 0.35) : 0;
      var hoofd = f.deel >= 0.5 ? f.b : f.a;
      return {
        fase: hoofd, naam: FASE_NAAM[hoofd],
        boven: meng('boven', f, bewolkt, nachtDonker), onder: meng('onder', f, bewolkt, nachtDonker), gloed: meng('gloed', f, bewolkt, nachtDonker),
        gloedDekking: w.weer.mist || weg || w.huisstand === 'nacht' || weerOud ? 0 : Math.max(0, 1 - w.weer.bewolking),
        neerslag: weerOud ? null : w.weer.neerslag
      };
    },

    /**
     * Ставить небо на корінь полотна. niveau: 'vol' (Дім) | 'stil' (решта сторінок і тихі профілі) | 'geen' (тривога, чорнило).
     * sprong — без переходу (зміна сценарію, теми, швидкість ×60 і ×600).
     */
    pasToe: function (doek, w, opties) {
      var b = this.bereken(w, opties.thema);
      var s = doek.style;
      doek.classList.toggle('is-sprong', !!opties.sprong);
      if (s.getPropertyValue('--hv-hemel-boven') !== b.boven) {
        s.setProperty('--hv-hemel-boven', b.boven);
        s.setProperty('--hv-hemel-onder', b.onder);
        s.setProperty('--hv-hemel-gloed', b.gloed);
      }
      s.setProperty('--hv-hemel-gloed-dekking', String(Math.round(b.gloedDekking * 100) / 100));
      ['vol', 'stil', 'geen'].forEach(function (n) { doek.classList.toggle('hv-hemel--' + n, n === opties.niveau); });
      doek.classList.toggle('is-regen', b.neerslag === 'regen');
      doek.classList.toggle('is-sneeuw', b.neerslag === 'sneeuw');
      doek.setAttribute('data-fase', b.fase);
      return b;
    },

    /** Слово погоди й іконка для чипа: факт опадів дублює чип, а не лише штрих на небі. */
    weer: function (w) {
      if (w.weer.verouderd) return { icoon: 'cloud', tekst: t('погода: немає даних', 'weer: geen gegevens') };
      var woord, icoon;
      if (w.weer.mist) { woord = t('туман', 'mist'); icoon = 'cloud-fog'; }
      else if (w.weer.neerslag === 'regen') { woord = t('дощ', 'regen'); icoon = 'cloud-rain'; }
      else if (w.weer.neerslag === 'sneeuw') { woord = t('сніг', 'sneeuw'); icoon = 'cloud-snow'; }
      else if (w.weer.bewolking > 0.6) { woord = t('хмарно', 'bewolkt'); icoon = 'cloudy'; }
      else if (w.weer.bewolking > 0.25) { woord = t('мінлива хмарність', 'half bewolkt'); icoon = 'cloud-sun'; }
      else { var nacht = this.bereken(w).fase === 'nacht'; woord = t('ясно', 'helder'); icoon = nacht ? 'moon' : 'sun'; }
      return { icoon: icoon, tekst: HV.getal(w.weer.temp) + ' °C, ' + woord };
    },

    /** Стан світла кімнати для вікна розрізу — лише зі спостереженого. */
    venster: function (kamerId) {
      var w = HV.staat.w;
      var lampen = HV.kijk.lampen(kamerId);
      if (!lampen.length) return { staat: 'geen' };
      var bereikbaar = lampen.filter(function (a) { return a.beschikbaar !== 'onbereikbaar'; });
      if (!bereikbaar.length) return { staat: 'onbereikbaar', woord: t('не спостережено', 'niet waargenomen') };
      if (w.gegevens !== 'live') return { staat: 'verouderd', aan: bereikbaar.some(function (a) { return a.st.aan; }), woord: HV.woord.verouderd() };
      var aan = bereikbaar.filter(function (a) { return a.st.aan; });
      var verondersteld = aan.length > 0 && aan.every(function (a) { return a.beschikbaar === 'verondersteld'; });
      if (aan.length) return { staat: verondersteld ? 'verondersteld' : 'aan', aantal: aan.length, woord: t('світло ввімкнено', 'licht aan') };
      return { staat: 'uit', woord: t('темно', 'donker') };
    },

    /**
     * Розріз будинку hv-doorsnede: поверх — рядок, кімната — кнопка (ціль ≥ 44 px); вікно світиться лише за підтвердженого світла.
     * Текстовий відповідник — «Показати списком».
     */
    doorsnede: function (ctx) {
      var w = ctx.staat, zelf = this;
      var alsLijst = HV.ui.lees('doorsnede-lijst', false);
      var cel = function (kamer, extra) {
        var v = zelf.venster(kamer.id);
        var woord = v.woord || t('без світла', 'geen lampen');
        return '<button type="button" class="hv-doorsnede__kamer is-' + v.staat + (extra && extra.klas ? ' ' + extra.klas : '') + '" data-actie="ga" data-naar="kamers-kamer-' + h(kamer.id) + '" aria-label="' + h(HV.p(kamer.naam) + ': ' + woord) + '" title="' + h(HV.p(kamer.naam) + ': ' + woord) + '">' +
          (extra && extra.icoon ? '<span class="hv-doorsnede__ding' + (extra.toon ? ' hv-toon-' + extra.toon : '') + '">' + HV.icoon(extra.icoon, { maat: 's' }) + '</span>' : '<span class="hv-venster" aria-hidden="true">' + (v.staat === 'onbereikbaar' ? HV.icoon('unplug', { maat: 'maker' }) : '') + '</span>') +
          '<span class="hv-doorsnede__naam">' + h(HV.p(kamer.naam)) + '</span></button>';
      };
      if (alsLijst) {
        var rijen = w.kamers.map(function (k) { var v = zelf.venster(k.id); return [HV.p(k.naam), h(v.woord || t('без світла', 'geen lampen'))]; });
        return '<div class="hv-doorsnede hv-doorsnede--lijst" data-k="doorsnede">' + HV.tabel([t('Кімната', 'Kamer'), t('Світло', 'Licht')], rijen) +
          '<button type="button" class="hv-link" data-actie="ui" data-naam="doorsnede-lijst" data-waarde="">' + h(t('Показати розрізом', 'Als doorsnede tonen')) + '</button></div>';
      }
      var laag = function (id) { return w.kamers.filter(function (k) { return k.verdieping === id; }); };
      var naam = function (id) { return HV.p(w.verdiepingen.filter(function (v) { return v.id === id; })[0].naam); };
      var ev = w.voertuigen[0], laadt = w.apparaten.laadpaal.st.laadt;
      var tuin = HV.staat.kamer('tuin'), garage = HV.staat.kamer('garage');
      var auto = ev.plek !== 'onderweg' ? { icoon: 'car', toon: laadt ? 'auto' : null, klas: laadt ? 'is-laadt' : '' } : { icoon: 'warehouse' };
      return '<div class="hv-doorsnede" data-k="doorsnede" role="group" aria-label="' + h(t('Дім у розрізі', 'Huis in doorsnede')) + '">' +
        '<div class="hv-doorsnede__tekening">' +
        '<div class="hv-doorsnede__huis">' +
        '<div class="hv-doorsnede__zolder"><svg class="hv-doorsnede__dak" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 100 50 4 100 100"/></svg><div class="hv-doorsnede__rij">' + laag('zolder').map(function (k) { return cel(k); }).join('') + '</div></div>' +
        '<div class="hv-doorsnede__laag"><div class="hv-doorsnede__rij">' + laag('boven').map(function (k) { return cel(k); }).join('') + '</div></div>' +
        '<div class="hv-doorsnede__laag"><div class="hv-doorsnede__rij">' + laag('beneden').map(function (k) { return cel(k); }).join('') + '</div></div>' +
        '</div>' +
        '<div class="hv-doorsnede__erf"><div class="hv-doorsnede__garage">' + cel(garage, auto) + '</div><div class="hv-doorsnede__tuin">' + cel(tuin, { icoon: 'trees' }) + '</div></div>' +
        '<div class="hv-doorsnede__labels" aria-hidden="true"><span>' + h(naam('zolder')) + '</span><span>' + h(naam('boven')) + '</span><span>' + h(naam('beneden')) + '</span></div>' +
        '</div>' +
        '<button type="button" class="hv-link hv-doorsnede__wissel" data-actie="ui" data-naam="doorsnede-lijst" data-waarde="1">' + h(t('Показати списком', 'Als lijst tonen')) + '</button></div>';
    }
  };
})(window.HV = window.HV || {});
