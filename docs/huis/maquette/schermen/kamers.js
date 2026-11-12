// Kamers / Кімнати — еталонний модуль: вкладка «Зараз» (кімнати за поверхами) і сторінка кімнати.
// Адреси на справжньому сайті: /kamers і /kamers/<kamer>; швидкий аркуш кімнати — ?blad=kamer:<kamer>.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;

  var KLIMAAT = ['thermostaat', 'airco', 'vloerverwarming', 'radiatorkraan', 'warmtepomp', 'ventilatie', 'bevochtiger', 'luchtreiniger', 'boiler'];
  var MEDIA = ['tv', 'speaker', 'speakergroep'];
  var LICHT = ['licht', 'lichtgroep'];

  function nu(ctx) {
    var w = ctx.staat;
    var metLicht = HV.kijk.kamersMetLicht().length, open = HV.kijk.open().length;
    var kop = '<p class="hv-pagina__zin">' + h(metLicht ? t('Світло в кімнатах: ', 'Licht aan in kamers: ') + metLicht : t('Світло вимкнено всюди', 'Het licht is overal uit')) + ' <span class="hv-punt">·</span> ' + h(open ? t('відчинено вікон і дверей: ', 'ramen en deuren open: ') + open : t('вікна й двері зачинено', 'ramen en deuren dicht')) + '</p>';
    var blokken = ['beneden', 'boven', 'zolder', 'buiten'].map(function (id) { return w.verdiepingen.filter(function (v) { return v.id === id; })[0]; }).map(function (v) {
      var kamers = w.kamers.filter(function (k) { return k.verdieping === v.id; });
      // поверх із однією-двома кімнатами — короткий блок: на комп’ютері два такі стоять поруч в одному рядку
      return o.blok({ id: 'verd-' + v.id, titel: HV.p(v.naam), teller: kamers.length, klas: kamers.length <= 2 ? 'hv-blok--kort' : '', inhoud: '<div class="hv-kamers">' + kamers.map(o.kamerkaart).join('') + '</div>',
        samenvatting: h(kamers.map(function (k) { return HV.p(k.naam); }).join(', ')) });
    }).join('');
    return '<div class="hv-kamerlijst" data-k="kamerlijst">' + kop + '<div class="hv-verdiepingen">' + blokken + '</div></div>';
  }

  // «Що тут діє само»: приклади автоматизацій кімнати (повний редактор — розділ «Автоматика»).
  var ZELF = {
    woonkamer: [[['Вечірнє світло', 'Avondlicht'], ['після заходу сонця, якщо хтось удома', 'na zonsondergang, als er iemand thuis is'], 'aan']],
    hal: [[['Світло за рухом', 'Licht bij beweging'], ['рух у передпокої після сутінок', 'beweging in de hal na de schemering'], 'aan']],
    slaapkamer: [[['Вікно й опалення', 'Raam en verwarming'], ['вікно відчинене понад 10 хв — знизити ціль', 'raam langer dan 10 min open — doel verlagen'], 'meekijken']],
    badkamer: [[['Вентиляція після душу', 'Ventileren na het douchen'], ['вологість понад 70 %', 'luchtvochtigheid boven 70 %'], 'aan']],
    tuin: [[['Полив за прогнозом', 'Beregenen op de verwachting'], ['о 06:00, якщо не обіцяють дощ', 'om 06:00, als er geen regen wordt verwacht'], 'concept']]
  };
  var FASE = { aan: ['Увімкнено', 'Aan'], meekijken: ['Спостереження', 'Meekijken'], concept: ['Чернетка', 'Concept'] };

  function kamer(ctx) {
    var w = ctx.staat, k = HV.staat.kamer(ctx.route.object);
    if (!k) return o.leeg({ icoon: 'layout-grid', titel: t('Такої кімнати немає', 'Deze kamer bestaat niet'), actie: { tekst: t('До кімнат', 'Naar de kamers'), actie: 'ga', gegevens: { naar: 'kamers' } } });
    var alles = HV.kijk.inKamer(k.id);
    var verd = w.verdiepingen.filter(function (v) { return v.id === k.verdieping; })[0];
    var van = function (soorten) { return alles.filter(function (a) { return soorten.indexOf(a.soort) >= 0; }); };
    var sensoren = alles.filter(function (a) { return HV.paspoort.soorten[a.soort].sensor && a.soort !== 'camera'; });

    // шапка кімнати: назва, поверх, чипи датчиків
    var chips = sensoren.slice(0, 6).map(function (a) {
      var b = o.beeld(a);
      var tekst = HV.p(a.naam) + ': ' + (b.waarde ? '' : b.woord);
      return o.chip({ icoon: b.icoon, toon: b.toon || null, html: '<span>' + h(tekst) + (b.waarde || '') + (a.beschikbaar === 'verouderd' ? ' <span class="hv-chip__sub">' + h(HV.woord.verouderd() + ' ' + HV.oud(HV.kijk.leeftijd(a))) + '</span>' : '') + '</span>', actie: 'blad', gegevens: { blad: 'apparaat:' + a.id }, k: 'sensor-' + a.id, klas: a.beschikbaar === 'verouderd' ? 'is-verouderd' : '' });
    }).join('');
    var kop = '<header class="hv-kamerkop" data-k="kamerkop"><span class="hv-kamerkop__teken">' + HV.icoon(k.icoon, { maat: 'l' }) + '</span><div><h1 class="hv-pagina__titel">' + h(HV.p(k.naam)) + '</h1><p class="hv-kamerkop__sub">' + h(HV.p(verd.naam)) + (k.doel != null ? ' · ' + h(t('ціль ', 'doel ') + HV.getal(k.doel, 1) + ' °C') : '') + '</p></div></header>' +
      (chips ? '<div class="hv-kamerkop__chips">' + chips + '</div>' : '');

    // плитки сторінки кімнати: орган рівня (яскравість, ціль, штори, гучність) — плитка з керуванням (§7)
    var tegels = function (lijst, vorm) { return lijst.length ? '<div class="hv-tegels">' + lijst.map(function (a) { return o.tegel(a, vorm ? { vorm: vorm } : { bediening: true }); }).join('') + '</div>' : ''; };

    var klimaat = o.blok({ id: 'k-klimaat', titel: t('Клімат', 'Klimaat'), inhoud: tegels(van(KLIMAAT)) });
    var scenes = w.scenes.filter(function (s) { return s.stappen.some(function (st) { return w.apparaten[st.doel] && w.apparaten[st.doel].kamer === k.id; }); });
    var scenesBlok = o.blok({ id: 'k-scenes', titel: t('Сцени', 'Scènes'), inhoud: scenes.length ? '<div class="hv-scenes">' + scenes.map(function (s) { return o.scene(s, w.sceneActief === s.id); }).join('') + '</div>' : '' });
    var lampen = HV.kijk.lampen(k.id), aan = HV.kijk.lampenAan(k.id);
    var licht = o.blok({ id: 'k-licht', titel: t('Світло', 'Licht'), teller: lampen.length ? aan.length + ' ' + t('з', 'van') + ' ' + lampen.length : null,
      extra: lampen.length ? o.knop({ tekst: aan.length ? t('Усе вимкнути', 'Alles uit') : t('Усе ввімкнути', 'Alles aan'), klein: true, soort: 'stil', actie: 'kamer-licht', gegevens: { kamer: k.id } }) : '',
      inhoud: tegels(van(LICHT)) });
    var media = o.blok({ id: 'k-media', titel: t('Медіа', 'Media'), inhoud: tegels(van(MEDIA)) });
    var rest = alles.filter(function (a) { return KLIMAAT.concat(MEDIA, LICHT).indexOf(a.soort) < 0 && !HV.paspoort.soorten[a.soort].sensor; });
    var camera = alles.filter(function (a) { return a.soort === 'camera'; });
    var restBlok = o.blok({ id: 'k-rest', titel: t('Решта', 'Overig'), inhoud: tegels(rest.concat(camera), '2x1') });
    var sensorBlok = o.blok({ id: 'k-sensoren', titel: t('Датчики', 'Sensoren'), teller: sensoren.length || null, dicht: true, inhoud: tegels(sensoren, '2x1'), samenvatting: h(sensoren.map(function (a) { return HV.p(a.naam); }).join(', ')) });
    var zelf = (ZELF[k.id] || []);
    var zelfBlok = o.blok({ id: 'k-zelf', titel: t('Що тут діє само', 'Wat hier vanzelf gebeurt'), teller: zelf.length || null,
      uitleg: t('Що станеться: ці правила діють без вас, коли їхня умова виконується. Пов’язано з: кожна дія правила — запис у Журналі зі знаком автоматизації. Як повернути: вимкніть правило в розділі «Автоматика».', 'Wat er gebeurt: deze regels werken zonder jou zodra hun voorwaarde klopt. Hangt samen met: elke actie van een regel komt in het logboek met het teken van de automatisering. Terugdraaien: zet de regel uit onder ‘Automatisering’.'),
      inhoud: zelf.length ? '<div class="hv-rijen hv-rijen--kaart">' + zelf.map(function (z, i) {
        return '<div class="hv-rij hv-regel" data-k="zelf-' + i + '"><span class="hv-rij__teken">' + HV.icoon('diamond', { maat: 's' }) + '</span><span class="hv-rij__naam">' + h(HV.p(z[0])) + '<span class="hv-rij__sub">' + h(HV.p(z[1])) + '</span></span><span class="hv-rij__waarde">' + o.chip({ tekst: HV.p(FASE[z[2]]), toon: z[2] === 'aan' ? 'ok' : null }) + '</span></div>';
      }).join('') + '</div>' : '' });

    // на комп’ютері — дві колонки: ліворуч клімат, датчики, сцени й правила; праворуч світло, медіа й решта
    var links = klimaat + sensorBlok + scenesBlok + zelfBlok, rechts = licht + media + restBlok;
    var inhoud = links || rechts ? '<div class="hv-kamer__kolommen"><div class="hv-kamer__kolom">' + links + '</div><div class="hv-kamer__kolom">' + rechts + '</div></div>' : '';
    return '<div class="hv-kamer" data-k="kamer-' + h(k.id) + '">' + kop + (inhoud || o.leeg({ icoon: k.icoon, titel: t('У цій кімнаті ще немає пристроїв', 'In deze kamer staan nog geen apparaten'), tekst: t('Додайте пристрій або перенесіть його сюди з іншої кімнати.', 'Voeg een apparaat toe of verplaats er een hierheen.') })) + '</div>';
  }

  HV.scherm({
    id: 'kamers', sectie: 'kamers', titel: ['Кімнати', 'Kamers'], icoon: 'layout-grid', adres: '/kamers',
    tabs: [
      { id: 'nu', titel: ['Зараз', 'Nu'], adres: '/kamers', render: nu },
      { id: 'kamer', titel: ['Кімната', 'Kamer'], adres: '/kamers/:object', verborgen: true, render: kamer }
    ]
  });

  // Швидкий аркуш кімнати: рівень світла, плитки, «Відкрити кімнату».
  HV.blad({
    soort: 'kamer', vrij: true,
    icoon: function (ctx, id) { var k = HV.staat.kamer(id); return k ? k.icoon : 'layout-grid'; },
    titel: function (ctx, id) { var k = HV.staat.kamer(id); return k ? HV.p(k.naam) : ''; },
    sub: function (ctx, id) { var s = HV.kijk.temperatuur(id); return s ? HV.maatTekst(s.st.waarde, '°C', 1) : ''; },
    render: function (ctx, id) {
      var k = HV.staat.kamer(id);
      if (!k) return '';
      var lijst = HV.kijk.inKamer(id, function (a) { return !HV.paspoort.soorten[a.soort].sensor; }).slice(0, 8);
      return o.kaart({ inhoud: '<div class="hv-tegels">' + lijst.map(function (a) { return o.tegel(a, { vorm: '2x1' }); }).join('') + '</div>' }) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити кімнату', 'Kamer openen'), soort: 'hoofd', actie: 'ga', gegevens: { naar: 'kamers-kamer-' + id } }) + '</div>';
    }
  });
})(window.HV = window.HV || {});
