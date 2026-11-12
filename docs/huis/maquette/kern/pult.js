// Pult: het bedieningspaneel van de maquette, BUITEN het doek van het product.
// Тема, мова, профіль екрана (13 профілів у справжніх пікселях, полотно масштабується під вікно), щільність, роль,
// стан даних, сценарій і швидкість часу дому. Пульт згортається; на вузькому справжньому екрані полотно займає всю ширину.
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t;
  var wortel = null;

  var PROFIEL_NAAM = {
    venster: ['Як вікно', 'Als venster'], telefoon: ['Телефон', 'Telefoon'], wand: ['Настінна панель', 'Wandpaneel'], bureau: ['Комп’ютер', 'Bureau'],
    breed: ['Широкий екран', 'Breed scherm'], ultrabreed: ['Надширокий', 'Ultrabreed'], tv: ['Телевізор', 'Televisie'], strook: ['Стрічка', 'Strook'],
    vierkant: ['Квадратний', 'Vierkant'], rond: ['Круглий', 'Rond'], klein: ['Малий 800×480', 'Klein 800×480'], deur: ['Дверна панель', 'Deurpaneel'],
    horloge: ['Годинник', 'Horloge'], inkt: ['Чорнило', 'Inkt']
  };
  var VOLGORDE = ['venster', 'telefoon', 'wand', 'bureau', 'breed', 'ultrabreed', 'tv', 'strook', 'vierkant', 'rond', 'klein', 'deur', 'horloge', 'inkt'];

  function smal() { return wortel && wortel.clientWidth < 860; }
  function dicht() { var v = HV.opslag.lees('pult-dicht', null); return v == null ? smal() : !!v; }
  function profielKeuze() { return HV.opslag.lees('profiel', null) || 'venster'; }

  function keuze(naam, waarde, opties, label) {
    return '<div class="mq-veld"><span class="mq-veld__label" id="mq-l-' + naam + '">' + h(label) + '</span><div class="mq-keuze mq-keuze--' + opties.length + '" role="group" aria-labelledby="mq-l-' + naam + '">' + opties.map(function (x) {
      return '<button type="button" class="mq-keuze__knop' + (String(x[0]) === String(waarde) ? ' is-gekozen' : '') + '" aria-pressed="' + (String(x[0]) === String(waarde) ? 'true' : 'false') + '" data-pult="' + naam + '" data-waarde="' + h(x[0]) + '"' + (x[2] ? ' lang="' + h(x[2]) + '"' : '') + '>' + h(x[1]) + '</button>';
    }).join('') + '</div></div>';
  }
  function lijst(naam, waarde, opties, label) {
    return '<label class="mq-veld"><span class="mq-veld__label">' + h(label) + '</span><select class="mq-lijst" data-pult="' + naam + '">' + opties.map(function (x) {
      return '<option value="' + h(x[0]) + '"' + (String(x[0]) === String(waarde) ? ' selected' : '') + '>' + h(x[1]) + '</option>';
    }).join('') + '</select></label>';
  }

  function pultHtml() {
    var w = HV.staat.w, pk = profielKeuze(), d = dicht();
    var beelden = pk === 'venster' ? [] : HV.profielBeelden(pk);
    var velden = '';
    if (!d) {
      velden = '<div class="mq-pult__lijf">' +
        keuze('thema', pk === 'inkt' ? 'inkt' : HV.opslag.lees('thema', 'systeem'), [['systeem', t('Як у системі', 'Systeem')], ['licht', t('Світла', 'Licht')], ['donker', t('Темна', 'Donker')], ['inkt', t('Чорнило', 'Inkt')]], t('Тема', 'Thema')) +
        // назва мови — завжди самою цією мовою, з позначкою lang (зчитувач екрана; перевірка «кирилиця в nl-режимі» їх пропускає)
        keuze('taal', HV.taal(), [['uk', 'Українська', 'uk'], ['nl', 'Nederlands', 'nl']], t('Мова', 'Taal')) +
        lijst('profiel', pk, VOLGORDE.map(function (id) { var b = id === 'venster' ? null : HV.profielBeelden(id)[0]; return [id, HV.p(PROFIEL_NAAM[id]) + (b ? ' · ' + b[0] + '×' + b[1] : '')]; }), t('Екран', 'Scherm')) +
        (beelden.length > 1 ? keuze('beeld', HV.opslag.lees('beeld-' + pk, 0), beelden.map(function (b, i) { return [i, b[0] + '×' + b[1]]; }), t('Розмір', 'Formaat')) : '') +
        keuze('dichtheid', HV.opslag.lees('dichtheid', 'auto'), [['auto', t('Від екрана', 'Van scherm')], ['compact', t('Компактна', 'Compact')], ['normaal', t('Звичайна', 'Normaal')], ['ruim', t('Простора', 'Ruim')]], t('Щільність', 'Dichtheid')) +
        keuze('rol', HV.rol(), HV.paspoort.rollen.map(function (r) { return [r.id, HV.p(r.naam)]; }), t('Роль', 'Rol')) +
        keuze('gegevens', w.gegevens, [['live', t('Наживо', 'Live')], ['verouderd', t('Застаріло', 'Verouderd')], ['geen', t('Немає зв’язку', 'Geen verbinding')]], t('Стан даних', 'Gegevens')) +
        lijst('scenario', w.scenario || '', HV.scenarios.lijst.map(function (s) { return [s.id, HV.p(s.naam)]; }), t('Сценарій', 'Scenario')) +
        keuze('snelheid', w.pauze ? 0 : w.snelheid, [[0, t('Пауза', 'Pauze')], [1, '×1'], [10, '×10'], [60, '×60'], [600, '×600']], t('Час дому', 'Huistijd')) +
        '<p class="mq-pult__noot" id="mq-klok"></p>' +
        '<p class="mq-pult__noot">' + h(t('Усе тут — керування макетом, не частина продукту. Пристрої симульовані.', 'Alles hier bedient de maquette en hoort niet bij het product. De apparaten zijn gesimuleerd.')) + '</p></div>';
    }
    return '<div class="mq-pult__kop"><div class="mq-pult__merk"><strong>' + h(t('Живий дім', 'Levend huis')) + '</strong><span>' + h(t('макет · пульт', 'maquette · bediening')) + '</span></div>' +
      '<button type="button" class="mq-pult__wissel" data-pult="dicht" aria-expanded="' + (d ? 'false' : 'true') + '" aria-controls="mq-pult">' + h(d ? t('Показати пульт', 'Bediening tonen') : t('Сховати', 'Verbergen')) + '</button></div>' + velden;
  }

  function tekenPult() {
    var pult = document.getElementById('mq-pult');
    if (!pult) return;
    var actief = document.activeElement, sleutel = actief && pult.contains(actief) ? [actief.getAttribute('data-pult'), actief.getAttribute('data-waarde')] : null;
    pult.innerHTML = pultHtml();
    wortel.classList.toggle('is-pult-dicht', dicht());
    if (sleutel) {
      var terug = pult.querySelector('[data-pult="' + sleutel[0] + '"]' + (sleutel[1] != null ? '[data-waarde="' + sleutel[1] + '"]' : ''));
      if (terug) terug.focus();
    }
  }

  function kies(naam, waarde) {
    switch (naam) {
      case 'dicht': HV.opslag.schrijf('pult-dicht', !dicht()); break;
      case 'thema':
        if (waarde !== 'inkt' && profielKeuze() === 'inkt') HV.opslag.schrijf('profiel', 'venster'); // профіль «Чорнило» має лише свою тему
        HV.opslag.schrijf('thema', waarde);
        HV.hemelSprong(); break;
      case 'taal': HV.opslag.schrijf('taal', waarde); HV.zetTaal(waarde); break;
      case 'profiel': HV.opslag.schrijf('profiel', waarde); HV.hemelSprong(); break;
      case 'beeld': HV.opslag.schrijf('beeld-' + profielKeuze(), Number(waarde)); break;
      case 'dichtheid': HV.opslag.schrijf('dichtheid', waarde); break;
      case 'rol': HV.opslag.schrijf('rol', waarde); break;
      case 'gegevens': HV.staat.wijzig(function (w) { w.gegevens = waarde; w.gegevensSinds = w.tijd; }); break;
      case 'scenario': HV.opslag.schrijf('scenario', waarde); HV.scenarios.start(waarde); break;
      case 'snelheid': HV.opslag.schrijf('snelheid', Number(waarde) || 60); HV.klok.zet(Number(waarde)); HV.hemelSprong(); break;
    }
    tekenPult();
    HV.pult.pas();
    HV.teken();
  }

  HV.pult = {
    /** Будує сторінку макета: пульт, смужку адреси й сцену з полотном. */
    bouw: function (el) {
      wortel = el;
      if (HV.opslag.lees('profiel', null) == null) HV.opslag.schrijf('profiel', el.clientWidth < 860 ? 'venster' : 'bureau');
      el.innerHTML = '<aside class="mq-pult" id="mq-pult" aria-label="' + h(t('Пульт макета', 'Bediening van de maquette')) + '"></aside>' +
        '<section class="mq-toneel" aria-label="' + h(t('Полотно продукту', 'Doek van het product')) + '">' +
        '<div class="mq-adres"><span class="mq-adres__label" id="mq-adres-label"></span><code class="mq-adres__pad" id="mq-adres"></code><span class="mq-adres__maat" id="mq-maat"></span></div>' +
        '<div class="mq-podium" id="mq-podium"><div class="mq-schaal" id="mq-schaal"><div id="hv-doek" class="hv-doek theme-light hv-dicht-normaal"></div></div></div></section>';
      el.addEventListener('click', function (ev) {
        var k = ev.target.closest ? ev.target.closest('button[data-pult]') : null;
        if (k) kies(k.getAttribute('data-pult'), k.getAttribute('data-waarde'));
      });
      el.addEventListener('change', function (ev) {
        var s = ev.target;
        if (s && s.getAttribute && s.getAttribute('data-pult') && s.nodeName === 'SELECT') kies(s.getAttribute('data-pult'), s.value);
      });
    },

    /** Розмір і масштаб полотна: профіль у справжніх пікселях, зменшений так, щоб уміститися в сцену. */
    pas: function () {
      var podium = document.getElementById('mq-podium'), schaalEl = document.getElementById('mq-schaal'), doek = document.getElementById('hv-doek');
      if (!podium || !doek) return;
      if (!document.getElementById('mq-pult').firstChild) tekenPult();
      var pk = profielKeuze();
      wortel.classList.toggle('is-venster', pk === 'venster');
      wortel.classList.toggle('is-smal', smal());
      if (pk === 'venster') {
        schaalEl.style.width = '100%'; schaalEl.style.height = '100%';
        doek.style.width = '100%'; doek.style.height = '100%'; doek.style.transform = 'none';
        HV.pult.schaal = 1;
        return;
      }
      var p = HV.profiel();
      var echtB = p.echt[0], echtH = p.echt[1];
      var ruimB = Math.max(120, podium.clientWidth), ruimH = Math.max(120, podium.clientHeight);
      var pas = Math.min(1, ruimB / echtB, ruimH / echtH);
      schaalEl.style.width = Math.floor(echtB * pas) + 'px'; schaalEl.style.height = Math.floor(echtH * pas) + 'px';
      doek.style.width = p.breedte + 'px'; doek.style.height = p.hoogte + 'px';
      doek.style.transform = 'scale(' + (pas * p.schaal) + ')';
      HV.pult.schaal = pas;
    },

    /** Після кожного малювання: адреса на справжньому сайті, розмір, годинники. */
    werkBij: function (ctx) {
      var a = document.getElementById('mq-adres'), m = document.getElementById('mq-maat'), l = document.getElementById('mq-adres-label'), k = document.getElementById('mq-klok');
      if (!a) return;
      var pad = 'huis.tarasevych.com' + (ctx.profiel.speciaal ? '/paneel/' + ctx.profiel.id + '/demo' : HV.echtAdres());
      if (a.textContent !== pad) a.textContent = pad;
      var label = t('адреса на справжньому сайті', 'adres op de echte site');
      if (l.textContent !== label) l.textContent = label;
      // підписи каркаса пульта ставляться один раз у bouw(); з мовою їх оновлюємо тут, разом з усім іншим
      var pultEl = document.getElementById('mq-pult'), pultNaam = t('Пульт макета', 'Bediening van de maquette');
      if (pultEl && pultEl.getAttribute('aria-label') !== pultNaam) pultEl.setAttribute('aria-label', pultNaam);
      var toneel = wortel.querySelector('.mq-toneel'), toneelNaam = t('Полотно продукту', 'Doek van het product');
      if (toneel && toneel.getAttribute('aria-label') !== toneelNaam) toneel.setAttribute('aria-label', toneelNaam);
      var p = ctx.profiel, maat = p.venster ? HV.p(PROFIEL_NAAM[p.id]) + ' · ' + p.breedte + '×' + p.hoogte : p.echt[0] + '×' + p.echt[1] + (HV.pult.schaal < 0.995 ? ' · ' + Math.round(HV.pult.schaal * 100) + ' %' : '');
      if (m.textContent !== maat) m.textContent = maat;
      if (k) {
        var klok = t('Час дому: ', 'Huistijd: ') + HV.datum(ctx.staat.tijd) + ', ' + HV.tijd(ctx.staat.tijd) + ' · ' + t('небо: ', 'hemel: ') + HV.p(HV.hemel.bereken(ctx.staat, HV.thema()).naam);
        if (k.textContent !== klok) k.textContent = klok;
      }
      var kn = wortel.querySelectorAll('[data-pult="snelheid"], [data-pult="gegevens"]');
      var w = ctx.staat;
      for (var i = 0; i < kn.length; i++) {
        var naam = kn[i].getAttribute('data-pult'), waarde = kn[i].getAttribute('data-waarde');
        var gekozen = naam === 'snelheid' ? String(w.pauze ? 0 : w.snelheid) === waarde : w.gegevens === waarde;
        if (kn[i].classList.contains('is-gekozen') !== gekozen) { kn[i].classList.toggle('is-gekozen', gekozen); kn[i].setAttribute('aria-pressed', gekozen ? 'true' : 'false'); }
      }
      var sc = wortel.querySelector('select[data-pult="scenario"]');
      if (sc && w.scenario && sc.value !== w.scenario) sc.value = w.scenario;
    },
    teken: tekenPult,
    schaal: 1
  };
})(window.HV = window.HV || {});
