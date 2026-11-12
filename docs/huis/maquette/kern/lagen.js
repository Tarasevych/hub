// Lagen boven de pagina: dialoog voor gevaarlijke acties (hv-gevaar met houdrail), herbevestiging van de aanmelding
// (імітація), Команда (hv-opdracht), підказка-наслідок (hv-gevolg), спливні сповіщення (hv-toost), центр сповіщень
// (hv-meldingen) і аварійний шар (hv-nood). Усі шари живуть в одному корені hv-lagen й успадковують тему, щільність і профіль.
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t, o = HV.o;

  var dlg = null;            // { soort:'gevaar'|'herbevestig'|'opdracht', … }
  var uitleg = null;         // { tekst, kop, anker }
  var vorigeFocus = null;
  var herbevestigdTot = 0;   // справжній час: підтвердження входу діє 5 хв для сеансу
  var HOUD_MS = 1200, AFTEL_S = 3;

  function open(nieuw) {
    if (!dlg) vorigeFocus = document.activeElement;
    dlg = nieuw;
    HV.teken();
  }
  function sluit(uitkomst) {
    var d = dlg;
    if (!d) return;
    if (d.klok) clearInterval(d.klok);
    if (d.houdKlok) clearTimeout(d.houdKlok);
    dlg = null;
    HV.teken();
    var terug = vorigeFocus; vorigeFocus = null;
    setTimeout(function () { if (terug && document.contains(terug)) { try { terug.focus({ preventScroll: true }); } catch (e) { /* фокус лишається */ } } }, 0);
    if (d.los) d.los(uitkomst);
  }

  // ── hv-gevaar ──
  function gevaarHtml(d) {
    var a = d.actie, kritiek = a.niveau === 'kritiek';
    var betrokken = d.apparaat ? HV.p(d.apparaat.naam) + ' · ' + HV.p(HV.staat.kamer(d.apparaat.kamer).naam) : HV.paspoort.adres;
    var lijf;
    if (d.stap === 'herbevestig') {
      lijf = herbevestigLijf(t('Критична дія потребує підтвердження входу.', 'Een kritieke actie vraagt een bevestiging van je aanmelding.'));
    } else {
      var aftel = d.aftel != null;
      // знак бігунка — сам пристрій (замок, ворота), інакше знак рівня; напис — коротке дієслово дії одним рядком
      var railIcoon = d.apparaat ? o.beeld(d.apparaat).icoon : (kritiek ? 'risico-kritiek' : 'risico-gevaarlijk');
      var railTekst = a.houd ? HV.p(a.houd) : t('Утримуйте, щоб підтвердити', 'Houd vast om te bevestigen');
      lijf = '<div class="hv-rail hv-rail--' + a.niveau + '" role="button" tabindex="0" aria-label="' + h(t('Утримуйте 1,2 с: ', 'Houd 1,2 s vast: ') + HV.p(a.naam)) + '" data-k="rail"><span class="hv-rail__vulling" aria-hidden="true"></span>' +
        '<span class="hv-rail__knop" aria-hidden="true">' + HV.icoon(railIcoon, { maat: 's' }) + '</span><span class="hv-rail__tekst">' + h(railTekst) + '</span><span class="hv-rail__tel" aria-hidden="true">' + h(houdTekst(HOUD_MS)) + '</span></div>' +
        '<div class="hv-gevaar__knoppen">' + o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'dialoog-annuleer', k: 'annuleer' }) +
        '<button type="button" class="hv-knop hv-knop--gewoon hv-gevaar__bevestig' + (aftel ? ' is-aftel' : '') + '" data-actie="dialoog-aftel" data-k="aftel" aria-live="polite">' + h(aftel ? t('Виконається через ', 'Wordt uitgevoerd over ') + d.aftel + t(' с — зупинити', ' s — stoppen') : t('Підтвердити', 'Bevestigen')) + '</button></div>' +
        '<p class="hv-gevaar__noot">' + h(t('Утримання рейки й кнопка «Підтвердити» з відліком 3 с рівноправні. Клавіша Escape скасовує.', 'De rail vasthouden en de knop ‘Bevestigen’ met 3 s aftellen zijn gelijkwaardig. Escape annuleert.')) + '</p>';
    }
    return '<div class="hv-dek hv-dek--dialoog" data-actie="dialoog-annuleer" data-k="dek-dialoog"></div>' +
      '<div class="hv-gevaar hv-gevaar--' + a.niveau + '" role="alertdialog" aria-modal="true" aria-labelledby="hv-gevaar-titel" aria-describedby="hv-gevaar-gevolg" data-k="gevaar">' +
      '<header class="hv-gevaar__kop">' + o.risico(a.niveau, { lang: true }) + '<h2 id="hv-gevaar-titel">' + h(HV.p(a.naam)) + '</h2></header>' +
      '<div id="hv-gevaar-gevolg" class="hv-gevaar__gevolg">' + o.gevolgRijen(HV.p(a.gevolg)) + '</div>' +
      '<p class="hv-gevaar__doel"><span>' + h(t('Зачеплено', 'Geraakt')) + '</span> ' + h(betrokken) + (kritiek ? ' <span class="hv-punt" aria-hidden="true">·</span> ' + h(t('рейка й підтвердження входу', 'rail en bevestiging van aanmelding')) : '') + '</p>' + lijf + '</div>';
  }
  function houdTekst(ms) { return HV.getal(Math.max(0, ms / 1000), 1) + ' ' + t('с', 's'); }
  function herbevestigLijf(tekst) {
    return '<div class="hv-herbevestig" data-k="herbevestig"><span class="hv-herbevestig__teken">' + HV.icoon('key-round', { maat: 'l' }) + '</span><div><p class="hv-herbevestig__tekst">' + h(tekst) + '</p>' +
      '<p class="hv-herbevestig__noot">' + h(t('Підтвердження діє 5 хв для цього сеансу. У макеті це імітація: справжній сайт попросить ключ доступу.', 'De bevestiging geldt 5 min voor deze sessie. In de maquette is dit nagebootst: de echte site vraagt je toegangssleutel.')) + '</p></div></div>' +
      '<div class="hv-gevaar__knoppen">' + o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'dialoog-annuleer', k: 'annuleer' }) + o.knop({ tekst: t('Підтвердити вхід', 'Aanmelding bevestigen'), icoon: 'key-round', soort: 'hoofd', actie: 'dialoog-herbevestig', k: 'herbevestig-knop' }) + '</div>';
  }
  function naHoud() {
    var d = dlg;
    if (!d || d.soort !== 'gevaar') return;
    if (d.klok) { clearInterval(d.klok); d.klok = null; d.aftel = null; }
    if (d.actie.niveau === 'kritiek' && Date.now() > herbevestigdTot) { d.stap = 'herbevestig'; HV.teken(); setTimeout(function () { var k = document.querySelector('.hv-gevaar [data-actie="dialoog-herbevestig"]'); if (k) k.focus(); }, 30); return; }
    sluit(true);
  }

  HV.actie('dialoog-annuleer', function () { sluit(false); });
  HV.actie('dialoog-aftel', function () {
    var d = dlg;
    if (!d) return;
    if (d.klok) { clearInterval(d.klok); d.klok = null; d.aftel = null; HV.teken(); return; }
    d.aftel = AFTEL_S;
    d.klok = setInterval(function () { d.aftel -= 1; if (d.aftel <= 0) naHoud(); else HV.teken(); }, 1000);
    HV.teken();
  });
  HV.actie('dialoog-herbevestig', function () {
    herbevestigdTot = Date.now() + 5 * 60000;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Вхід підтверджено повторно', 'Aanmelding opnieuw bevestigd'], waarom: ['діє 5 хв для цього сеансу', 'geldt 5 min voor deze sessie'], soort: 'huis.toegang' });
    sluit(true);
  });

  // ── hv-opdracht ──
  var WERKWOORDEN = [
    { id: 'lichtuit', icoon: 'lightbulb', naam: ['Вимкнути все світло', 'Alle lampen uit'], voer: function () { return HV.doe({ doel: 'alle', mogelijkheid: 'licht', waarde: false }); },
      gevolg: function () { var n = HV.kijk.lampenAan().length, k = HV.kijk.kamersMetLicht().length, weg = HV.kijk.lampen().filter(function (a) { return a.beschikbaar === 'onbereikbaar'; }).length;
        return t('Що станеться: вимкнеться ламп: ' + n + ', кімнат: ' + k + '; недоступних пропущено: ' + weg + '. Пов’язано з: вечірня сцена ввімкне світло лише після наступного запуску. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: lampen die uitgaan: ' + n + ', kamers: ' + k + '; niet bereikbaar, overgeslagen: ' + weg + '. Hangt samen met: de avondscène zet het licht pas bij de volgende start weer aan. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'); } },
    { id: 'welterusten', icoon: 'moon', naam: ['На добраніч', 'Welterusten'], voer: function () { return HV.doe({ doel: 'scene:welterusten', mogelijkheid: 'start', waarde: true }); },
      gevolg: function () { return t('Що станеться: світло внизу й телевізор вимкнуться, приліжкова лампа ввімкнеться, двері замкнуться, опалення знизиться до 17,5 °C. Пов’язано з: охорону сцена не ставить і не знімає. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: het licht beneden en de tv gaan uit, de bedlamp gaat aan, de deur gaat op slot, de verwarming zakt naar 17,5 °C. Hangt samen met: de scène schakelt het alarm niet in en niet uit. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'); } },
    { id: 'weg', icoon: 'log-out', naam: ['Йду', 'Ik ga weg'], voer: function () { return HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: 'afwezig' }); },
      gevolg: function () { return t('Що станеться: світло й медіа вимкнуться, опалення знизиться до 17 °C. Пов’язано з: охорону дім лише запропонує поставити; двері лишаться як є. Як повернути: «Я вдома» або «Повернути» протягом 10 с.', 'Wat er gebeurt: licht en media gaan uit, de verwarming zakt naar 17 °C. Hangt samen met: het huis stelt alleen voor het alarm in te schakelen; deuren blijven zoals ze zijn. Terugdraaien: ‘Ik ben thuis’ of ‘Ongedaan maken’ binnen 10 s.'); } },
    { id: 'thuis', icoon: 'log-in', naam: ['Я вдома', 'Ik ben thuis'], voer: function () { return HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: 'thuis' }); },
      gevolg: function () { return t('Що станеться: режим дому стане «Вдома», опалення підніметься до 21 °C. Пов’язано з: охорону режим не знімає — це окрема дія. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: de huisstand wordt ‘Thuis’, de verwarming gaat naar 21 °C. Hangt samen met: de stand zet het alarm niet uit — dat is een aparte actie. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'); } },
    { id: 'cameras', icoon: 'cctv', naam: ['Камери', 'Camera’s'], ga: 'beveiliging-cameras' },
    { id: 'open', icoon: 'door-open', naam: ['Що відчинено?', 'Wat staat open?'], toon: function () {
      var open = HV.kijk.open(), w = HV.staat.w, rijen = open.map(function (x) { return o.rij({ icoon: 'door-open', naam: HV.p(x.apparaat.naam) + ' · ' + HV.p(HV.staat.kamer(x.apparaat.kamer).naam), waarde: h(HV.duur(x.minuten)), actie: 'opdracht-ga', gegevens: { blad: 'apparaat:' + x.apparaat.id } }); });
      ['garagedeur', 'poort'].forEach(function (id) { if (w.apparaten[id].st.open) rijen.push(o.rij({ icoon: 'warehouse', naam: HV.p(w.apparaten[id].naam), waarde: h(HV.woord.open()), actie: 'opdracht-ga', gegevens: { blad: 'apparaat:' + id } })); });
      if (!w.apparaten.voordeurslot.st.vergrendeld) rijen.push(o.rij({ icoon: 'lock-keyhole-open', naam: HV.p(w.apparaten.voordeurslot.naam), waarde: h(HV.woord.ontgrendeld()), actie: 'opdracht-ga', gegevens: { blad: 'apparaat:voordeurslot' } }));
      return rijen.length ? '<div class="hv-rijen">' + rijen.join('') + '</div>' : o.leeg({ icoon: 'check', titel: t('Усе зачинено й замкнено', 'Alles is dicht en op slot') });
    } }
  ];

  function opdrachtHtml(d) {
    var lijf;
    var zoek = (d.zoek || '').trim().toLowerCase();
    if (d.gekozen) {
      var v = WERKWOORDEN.filter(function (x) { return x.id === d.gekozen; })[0];
      if (v.toon) lijf = '<div class="hv-opdracht__gevolg" data-k="toon"><h3>' + h(HV.p(v.naam)) + '</h3>' + v.toon() + '<div class="hv-knoppen">' + o.knop({ tekst: t('Назад', 'Terug'), actie: 'opdracht-kies', gegevens: { werkwoord: '' } }) + '</div></div>';
      else if (HV.zonderVerbinding()) lijf = '<div class="hv-opdracht__gevolg" data-k="gevolg"><h3>' + h(HV.p(v.naam)) + '</h3><p class="hv-tekst">' + HV.icoon('wifi-off', { maat: 's' }) + ' ' + h(t('Немає зв’язку з домом: команда не виконається. Показано останній знімок, лише перегляд.', 'Geen verbinding met het huis: de opdracht wordt niet uitgevoerd. Je ziet de laatste momentopname, alleen bekijken.')) + '</p><div class="hv-knoppen">' + o.knop({ tekst: t('Назад', 'Terug'), actie: 'opdracht-kies', gegevens: { werkwoord: '' }, k: 'voer' }) + '</div></div>';
      else lijf = '<div class="hv-opdracht__gevolg" data-k="gevolg"><h3>' + h(HV.p(v.naam)) + '</h3>' + o.gevolgRijen(v.gevolg()) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Назад', 'Terug'), actie: 'opdracht-kies', gegevens: { werkwoord: '' } }) + o.knop({ tekst: t('Виконати', 'Uitvoeren'), soort: 'hoofd', actie: 'opdracht-voer', gegevens: { werkwoord: v.id }, k: 'voer' }) + '</div></div>';
    } else if (zoek) {
      var w = HV.staat.w, rijen = [];
      var past = function (paar) { return paar[0].toLowerCase().indexOf(zoek) >= 0 || paar[1].toLowerCase().indexOf(zoek) >= 0; };
      WERKWOORDEN.forEach(function (x) { if (past(x.naam)) rijen.push(o.rij({ icoon: x.icoon, naam: HV.p(x.naam), sub: t('дія', 'actie'), actie: 'opdracht-kies', gegevens: { werkwoord: x.id } })); });
      w.scenes.forEach(function (s) { if (past(s.naam)) rijen.push(o.rij({ icoon: s.icoon, naam: HV.p(s.naam), sub: t('сцена', 'scène'), actie: 'opdracht-ga', gegevens: { scene: s.id } })); });
      w.kamers.forEach(function (k) { if (past(k.naam)) rijen.push(o.rij({ icoon: k.icoon, naam: HV.p(k.naam), sub: t('кімната', 'kamer'), actie: 'opdracht-ga', gegevens: { naar: 'kamers-kamer-' + k.id } })); });
      HV.kijk.alle().forEach(function (a) { if (rijen.length < 14 && past(a.naam)) rijen.push(o.rij({ icoon: o.beeld(a).icoon, naam: HV.p(a.naam), sub: HV.p(HV.staat.kamer(a.kamer).naam), actie: 'opdracht-ga', gegevens: { blad: 'apparaat:' + a.id } })); });
      Object.keys(HV.schermen).forEach(function (id) { var s = HV.schermen[id]; (s.tabs || []).concat([s]).forEach(function (x) { if (rijen.length < 16 && x.titel && past(x.titel)) rijen.push(o.rij({ icoon: s.icoon || 'panel-right', naam: HV.p(x.titel), sub: x === s ? t('розділ', 'onderdeel') : HV.p(s.titel), actie: 'opdracht-ga', gegevens: { naar: x === s ? s.id : s.id + '-' + x.id } })); }); });
      lijf = rijen.length ? '<div class="hv-rijen" data-k="resultaten">' + rijen.join('') + '</div>' : o.leeg({ icoon: 'search', titel: t('Нічого не знайдено', 'Niets gevonden'), tekst: t('Спробуйте назву кімнати, пристрою чи розділу.', 'Probeer de naam van een kamer, apparaat of onderdeel.') });
    } else {
      lijf = '<div class="hv-opdracht__werkwoorden" data-k="werkwoorden">' + WERKWOORDEN.map(function (x) { return '<button type="button" class="hv-opdracht__werkwoord" data-actie="opdracht-kies" data-werkwoord="' + x.id + '">' + HV.icoon(x.icoon, { maat: 'l' }) + '<span>' + h(HV.p(x.naam)) + '</span></button>'; }).join('') + '</div>';
    }
    return '<div class="hv-dek hv-dek--dialoog" data-actie="dialoog-annuleer" data-k="dek-dialoog"></div>' +
      '<div class="hv-opdracht" role="dialog" aria-modal="true" aria-label="' + h(t('Команда', 'Opdracht')) + '" data-k="opdracht">' +
      '<div class="hv-opdracht__zoek">' + HV.icoon('search') + '<input id="hv-opdracht-veld" type="text" autocomplete="off" spellcheck="false" placeholder="' + h(t('Що зробити або знайти?', 'Wat wil je doen of vinden?')) + '" aria-label="' + h(t('Команда або пошук', 'Opdracht of zoeken')) + '">' + o.icoonknop({ icoon: 'x', aria: t('Закрити', 'Sluiten'), actie: 'dialoog-annuleer' }) + '</div>' +
      '<div class="hv-opdracht__lijf">' + lijf + '</div></div>';
  }
  HV.actie('opdracht', function () {
    open({ soort: 'opdracht', zoek: '', gekozen: null });
    setTimeout(function () { var v = document.getElementById('hv-opdracht-veld'); if (v) { v.value = ''; v.focus(); } }, 30);
  });
  HV.actie('opdracht-kies', function (ctx, g) {
    if (!dlg) return;
    var v = WERKWOORDEN.filter(function (x) { return x.id === g.werkwoord; })[0];
    if (v && v.ga) { sluit(false); HV.open(v.ga); return; }
    dlg.gekozen = g.werkwoord || null;
    HV.teken();
    setTimeout(function () { var k = document.querySelector('.hv-opdracht [data-k="voer"]') || document.getElementById('hv-opdracht-veld'); if (k) k.focus(); }, 30);
  });
  HV.actie('opdracht-voer', function (ctx, g) {
    var v = WERKWOORDEN.filter(function (x) { return x.id === g.werkwoord; })[0];
    sluit(false);
    if (v && v.voer) v.voer();
  });
  HV.actie('opdracht-ga', function (ctx, g) {
    sluit(false);
    if (g.scene) HV.doe({ doel: 'scene:' + g.scene, mogelijkheid: 'start', waarde: true });
    else if (g.blad) HV.bladOpen(g.blad);
    else if (g.naar) HV.open(g.naar);
  });

  // ── hv-gevolg ──
  function gevolgHtml() {
    if (!uitleg) return '';
    var doek = document.getElementById('hv-doek');
    var x = 16, y = 16;
    if (uitleg.anker && document.contains(uitleg.anker)) {
      var rd = doek.getBoundingClientRect(), ra = uitleg.anker.getBoundingClientRect();
      var schaal = rd.width / doek.offsetWidth || 1;
      var breedte = Math.min(320, doek.offsetWidth - 32);
      x = Math.max(16, Math.min(doek.offsetWidth - breedte - 16, (ra.left - rd.left) / schaal - breedte / 2 + 12));
      y = (ra.bottom - rd.top) / schaal + 8;
      if (y > doek.offsetHeight - 220) y = Math.max(16, (ra.top - rd.top) / schaal - 228);
    }
    return '<div class="hv-gevolg" role="dialog" aria-labelledby="hv-gevolg-kop" style="--x:' + Math.round(x) + 'px;--y:' + Math.round(y) + 'px" data-k="gevolg">' +
      '<header class="hv-gevolg__kop"><h3 id="hv-gevolg-kop">' + h(uitleg.kop) + '</h3>' + o.icoonknop({ icoon: 'x', maat: 's', aria: t('Закрити підказку', 'Uitleg sluiten'), actie: 'uitleg-sluit', klas: 'hv-gevolg__sluit' }) + '</header>' + o.gevolgRijen(uitleg.tekst) + '</div>';
  }
  function sluitUitleg() {
    if (!uitleg) return false;
    var anker = uitleg.anker;
    uitleg = null;
    HV.teken();
    if (anker && document.contains(anker)) { anker.setAttribute('aria-expanded', 'false'); try { anker.focus({ preventScroll: true }); } catch (e) { /* фокус лишається */ } }
    return true;
  }
  HV.actie('uitleg', function (ctx, g, el) {
    if (uitleg && uitleg.anker === el) { sluitUitleg(); return; }
    uitleg = { tekst: g.tekst, kop: g.kop, anker: el };
    el.setAttribute('aria-expanded', 'true');
    HV.teken();
    setTimeout(function () { var k = document.querySelector('.hv-gevolg__sluit'); if (k) k.focus(); }, 30);
  });
  HV.actie('uitleg-sluit', function () { sluitUitleg(); });

  // ── hv-nood ──
  var NOOD = {
    rook: { icoon: 'alarm-smoke', titel: ['Дим: ', 'Rook: '], wat: ['Датчик диму спрацював', 'De rookmelder is afgegaan'], doe: { wat: 'oven', label: ['Вимкнути духовку', 'Oven uitzetten'] } },
    lek: { icoon: 'droplet', titel: ['Вода: ', 'Water: '], wat: ['Датчик протікання спрацював', 'De lekkagesensor is afgegaan'], doe: { wat: 'was', label: ['Зупинити пральну машину', 'Wasmachine stoppen'] } }
  };
  function noodHtml(w) {
    var n = w.nood;
    if (!n || n.bevestigd) return '';
    var def = NOOD[n.soort] || NOOD.rook, kamer = HV.staat.kamer(n.kamer);
    var thuis = HV.kijk.thuis().map(function (m) { return HV.p(m.naam); });
    var minuten = Math.max(0, Math.round((w.tijd - n.sinds) / 60000));
    return '<div class="hv-nood" role="alertdialog" aria-modal="true" aria-labelledby="hv-nood-titel" aria-describedby="hv-nood-wat" data-k="nood">' +
      '<div class="hv-nood__binnen"><span class="hv-nood__teken">' + HV.icoon(def.icoon, { maat: 'xl' }) + '</span>' +
      '<h2 id="hv-nood-titel">' + h(HV.p(def.titel) + HV.p(kamer.naam).toLowerCase()) + '</h2>' +
      '<p id="hv-nood-wat" class="hv-nood__wat">' + h(HV.p(def.wat) + t(' о ', ' om ') + HV.tijd(n.sinds) + (minuten ? ' · ' + HV.duur(minuten) + t(' тому', ' geleden') : '')) + '</p>' +
      '<p class="hv-nood__thuis">' + h(thuis.length ? t('Удома: ', 'Thuis: ') + thuis.join(', ') : t('Удома нікого немає.', 'Er is niemand thuis.')) + '</p>' +
      '<div class="hv-nood__knoppen">' +
      '<button type="button" class="hv-nood__knop hv-nood__knop--hoofd" data-actie="nood-zie">' + h(t('Бачу — приглушити сирену', 'Gezien — sirene dempen')) + '</button>' +
      '<button type="button" class="hv-nood__knop" data-actie="nood-doe" data-wat="' + def.doe.wat + '">' + h(HV.p(def.doe.label)) + '</button>' +
      '<button type="button" class="hv-nood__knop" data-actie="nood-doe" data-wat="zelfstop">' + h(t('Зупинити самостійні дії', 'Zelfstandige acties stoppen')) + '</button></div>' +
      '<p class="hv-nood__sim">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('Симуляція: жоден справжній пристрій не змінено. Хаб не є сертифікованою пожежною сигналізацією.', 'Simulatie: er is geen echt apparaat veranderd. De hub is geen gecertificeerde brandmeldinstallatie.')) + '</p></div></div>';
  }
  HV.actie('nood-zie', function () {
    HV.staat.wijzig(function (w) {
      var n = w.nood; if (!n) return;
      n.bevestigd = true;
      var def = NOOD[n.soort] || NOOD.rook, kamer = HV.staat.kamer(n.kamer);
      w.nu = w.nu.filter(function (x) { return x.id !== 'nood'; });
      w.nu.push({ id: 'nood', soort: 'alarm', maker: 'simulator', icoon: def.icoon, sinds: n.sinds, tekst: [def.wat[0] + ' ' + kamer.waar[0] + '; сирену приглушено', def.wat[1] + ' ' + kamer.waar[1] + '; sirene gedempt'], acties: [{ naam: 'nood-klaar', hoofd: true, label: ['Датчик заспокоївся', 'De melder is weer rustig'] }] });
    });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Тривогу підтверджено, сирену приглушено', 'Alarm bevestigd, sirene gedempt'], soort: 'huis.alarm', gewicht: 'alarm' });
    HV.hemelSprong();
  });
  HV.actie('nood-doe', function (ctx, g) {
    if (g.wat === 'zelfstop') HV.zelfStop(true);
    else if (g.wat === 'oven') HV.doe({ doel: 'oven', mogelijkheid: 'aan', waarde: false });
    else if (g.wat === 'was') HV.doe({ doel: 'wasmachine', mogelijkheid: 'programma', waarde: 'stop' });
  });
  HV.actie('nood-klaar', function () {
    HV.staat.wijzig(function (w) {
      if (w.nood && w.apparaten[w.nood.bron]) w.apparaten[w.nood.bron].st.alarm = false;
      w.nood = null; w.nu = w.nu.filter(function (x) { return x.id !== 'nood'; });
    });
    HV.logboek.voegToe({ maker: { soort: 'simulator', naam: ['Симулятор', 'Simulator'] }, wat: ['Датчик заспокоївся, тривогу завершено', 'De melder is rustig, alarm voorbij'], soort: 'huis.alarm', gewicht: 'belangrijk' });
    HV.hemelSprong();
  });

  HV.actie('oproep', function (ctx, g) {
    HV.staat.wijzig(function (w) { w.oproep = null; w.nu = w.nu.filter(function (n) { return n.id !== 'oproep'; }); });
    if (g.stap === 'toon') HV.open('beveiliging-toegang');
    else { HV.logboek.voegToe({ maker: HV.mens(), wat: ['Виклик із дверей відхилено', 'Oproep van de deur geweigerd'], soort: 'huis.toegang' }); HV.meld({ maker: HV.mens(), icoon: 'bell-ring', titel: t('Виклик відхилено', 'Oproep geweigerd') }); }
  });

  // ── hv-meldingen (центр сповіщень) ──
  HV.blad({
    soort: 'meldingen', vrij: true, icoon: 'bell', titel: ['Сповіщення', 'Meldingen'],
    sub: function (ctx) { var n = HV.logboek.ongelezen(); return (n ? n + ' ' + t('нових', 'nieuw') : t('усе прочитано', 'alles gelezen')) + ' · ' + t('симуляція', 'simulatie'); },
    render: function (ctx) {
      var w = ctx.staat;
      var gewicht = HV.ui.lees('meld-gewicht', 'alle'), maker = HV.ui.lees('meld-maker', 'alle'), soort = HV.ui.lees('meld-soort', 'alle');
      var groep = { mens: ['mens', 'knop'], zelf: ['automatisering', 'scene', 'optimalisatie', 'systeem', 'dienst'], agent: ['agent'], simulator: ['simulator'] };
      var lijst = w.logboek.filter(function (r) {
        return (gewicht === 'alle' || r.gewicht === gewicht) && (maker === 'alle' || groep[maker].indexOf(r.maker.soort) >= 0) && (soort === 'alle' || r.soort === soort);
      });
      var chips = function (naam, waarde, opties) { return '<div class="hv-filter" role="group" aria-label="' + h(opties.label) + '">' + opties.lijst.map(function (x) { return o.chip({ filter: true, gekozen: waarde === x[0], tekst: x[1], actie: 'ui', gegevens: { naam: naam, waarde: x[0] }, k: naam + '-' + x[0] }); }).join('') + '</div>'; };
      var soorten = [['alle', t('усі види', 'alle soorten')]].concat(Object.keys(HV.meldingSoorten).map(function (k) { return [k, HV.p(HV.meldingSoorten[k])]; }));
      var openId = HV.ui.lees('bericht', null);
      // один ряд ваги; автори й види — за кнопкою «Фільтри», щоб службове не займало пів аркуша
      var meer = HV.ui.lees('meld-meer', false) || maker !== 'alle' || soort !== 'alle';
      var actief = (maker !== 'alle' ? 1 : 0) + (soort !== 'alle' ? 1 : 0);
      var ongelezen = HV.logboek.ongelezen();
      return '<div class="hv-meldingen">' +
        '<div class="hv-meldingen__kop">' + chips('meld-gewicht', gewicht, { label: t('Важливість', 'Gewicht'), lijst: [['alle', t('усе', 'alles')], ['belangrijk', t('важливо', 'belangrijk')], ['alarm', t('тривога', 'alarm')]] }) +
        '<button type="button" class="hv-chip hv-meldingen__filters' + (meer ? ' is-gekozen' : '') + '" aria-expanded="' + (meer ? 'true' : 'false') + '" data-actie="ui" data-naam="meld-meer" data-waarde="' + (meer ? '' : '1') + '">' + HV.icoon('sliders-horizontal', { maat: 's' }) + '<span>' + h(t('Фільтри', 'Filters')) + (actief ? ' · ' + actief : '') + '</span></button></div>' +
        (meer ? '<div class="hv-meldingen__meer">' + chips('meld-maker', maker, { label: t('Автор', 'Maker'), lijst: [['alle', t('усі автори', 'alle makers')], ['mens', t('люди', 'mensen')], ['zelf', t('автоматика', 'automatisch')], ['agent', t('агенти', 'agenten')], ['simulator', t('симулятор', 'simulator')]] }) +
          chips('meld-soort', soort, { label: t('Вид', 'Soort'), lijst: soorten }) + '</div>' : '') +
        (lijst.length ? '<ul class="hv-berichten">' + lijst.slice(0, 60).map(function (r) { return o.bericht(r, { open: openId === r.id, zonderSim: true }); }).join('') + '</ul>'
          : o.leeg({ icoon: 'bell', titel: w.logboek.length ? t('За цим фільтром нічого немає', 'Niets gevonden met dit filter') : t('Сповіщень ще немає', 'Nog geen meldingen'), tekst: t('Сюди потрапляє кожна дія системи, сцени, автоматизації, оптимізатора й агента.', 'Hier komt elke actie van het systeem, een scène, een automatisering, de optimalisatie en een agent.') })) +
        '<div class="hv-meldingen__voet">' + (ongelezen ? o.knop({ tekst: t('Позначити все прочитаним', 'Alles als gelezen markeren') + ' · ' + ongelezen, icoon: 'check', soort: 'stil', actie: 'meld-gelezen' }) : '') +
        o.knop({ tekst: t('Відкрити Журнал', 'Logboek openen'), soort: 'hoofd', klas: 'hv-knop--breed', actie: 'ga', gegevens: { naar: 'activiteit' } }) + '</div></div>';
    }
  });
  HV.actie('meld-gelezen', function () { HV.logboek.leesAlles(); });

  // ── Rail: утримання 1,2 с; відпускання скасовує ──
  function railStart(rail) {
    var d = dlg;
    if (!d || d.soort !== 'gevaar' || d.houdKlok) return;
    var begin = Date.now(), tel = rail.querySelector('.hv-rail__tel');
    rail.setAttribute('data-bezig', '1'); // перерисовка не чіпає рейку, поки її тримають
    rail.classList.add('is-houdt');
    var tik = setInterval(function () { if (tel) tel.textContent = houdTekst(HOUD_MS - (Date.now() - begin)); }, 100);
    d.houdKlok = setTimeout(function () { clearInterval(tik); d.houdKlok = null; rail.classList.remove('is-houdt'); rail.removeAttribute('data-bezig'); naHoud(); }, HOUD_MS);
    var stop = function () {
      window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop);
      clearInterval(tik); if (tel) tel.textContent = houdTekst(HOUD_MS);
      rail.removeAttribute('data-bezig');
      if (d.houdKlok) { clearTimeout(d.houdKlok); d.houdKlok = null; rail.classList.remove('is-houdt'); }
    };
    rail._stop = stop;
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  }

  HV.lagen = {
    dialoog: function () { return dlg; },
    escape: function () { if (uitleg) return sluitUitleg(); if (dlg) { sluit(false); return true; } return false; },
    railStart: railStart,
    railStop: function (rail) { if (rail._stop) rail._stop(); },
    /** Мову змінено: підказка й сповіщення старою мовою закриваються (тривога лишається — її текст перемалюється). */
    taalGewijzigd: function () {
      uitleg = null;
      HV.toosten.slice().forEach(function (x) { if (x.gewicht !== 'alarm') HV.toostWeg(x.id); });
    },
    teken: function (ctx) {
      var html = '';
      if (dlg) html = dlg.soort === 'opdracht' ? opdrachtHtml(dlg) : dlg.soort === 'herbevestig' ? '<div class="hv-dek hv-dek--dialoog" data-actie="dialoog-annuleer" data-k="dek-dialoog"></div><div class="hv-gevaar hv-gevaar--herbevestig" role="alertdialog" aria-modal="true" aria-labelledby="hv-gevaar-titel" data-k="gevaar"><header class="hv-gevaar__kop"><h2 id="hv-gevaar-titel">' + h(dlg.titel) + '</h2></header>' + herbevestigLijf(dlg.tekst) + '</div>' : gevaarHtml(dlg);
      HV.zet(document.getElementById('hv-dialoogplek'), html);
      HV.zet(document.getElementById('hv-gevolgplek'), gevolgHtml());
      HV.zet(document.getElementById('hv-noodplek'), noodHtml(ctx.staat));
      // аварійний шар — модальний: фокус одразу стає на «Бачу — приглушити сирену», після закриття повертається
      var noodNu = !!(ctx.staat.nood && !ctx.staat.nood.bevestigd);
      if (noodNu && !noodWas) {
        noodFocus = document.activeElement;
        setTimeout(function () { var k = document.querySelector('.hv-nood [data-actie="nood-zie"]'); if (k) { try { k.focus({ preventScroll: true }); } catch (e) { k.focus(); } } }, 30);
      } else if (!noodNu && noodWas) {
        var terug = noodFocus; noodFocus = null;
        setTimeout(function () {
          var doel = terug && terug !== document.body && document.contains(terug) ? terug : document.getElementById('hv-inhoud');
          if (doel && !document.querySelector('.hv-gevaar, .hv-opdracht')) { try { doel.focus({ preventScroll: true }); } catch (e) { /* фокус лишається */ } }
        }, 30);
      }
      noodWas = noodNu;
    }
  };
  var noodWas = false, noodFocus = null;

  /** Діалог небезпечної дії. Promise<boolean>. На годиннику, стрічці й чорнилі — «Підтвердьте на телефоні». */
  HV.schil.gevaar = function (p) {
    var profiel = HV.profiel().id;
    if (profiel === 'horloge' || profiel === 'strook' || profiel === 'inkt') {
      HV.meld({ gewicht: 'belangrijk', icoon: 'smartphone', titel: t('Підтвердьте на телефоні', 'Bevestig op je telefoon'), tekst: HV.p(p.actie.naam) });
      return Promise.resolve(false);
    }
    if (HV.zonderVerbinding()) { HV.meldZonderVerbinding(); return Promise.resolve(false); }
    return new Promise(function (los) {
      open({ soort: 'gevaar', actie: p.actie, apparaat: p.apparaat, naam: p.naam, stap: 'houd', aftel: null, los: los });
      setTimeout(function () { var k = document.querySelector('.hv-gevaar [data-k="annuleer"]'); if (k) k.focus(); }, 30);
    });
  };
  /** Повторне підтвердження входу (імітація). Promise<boolean>. */
  HV.schil.herbevestig = function (p) {
    if (HV.zonderVerbinding()) { HV.meldZonderVerbinding(); return Promise.resolve(false); }
    if (Date.now() < herbevestigdTot) return Promise.resolve(true);
    return new Promise(function (los) {
      open({ soort: 'herbevestig', titel: p.titel, tekst: p.tekst, los: los });
      setTimeout(function () { var k = document.querySelector('.hv-gevaar [data-k="annuleer"]'); if (k) k.focus(); }, 30);
    });
  };
  /** Одне сповіщення замість стосу: тривога — першою, інакше найновіше; решта чекає за лічильником «+N». */
  HV.schil.tekenToosten = function () {
    var plek = document.getElementById('hv-toosten'), lijst = HV.toosten;
    if (!plek) return;
    if (!lijst.length) { HV.zet(plek, ''); return; }
    var boven = null;
    for (var i = lijst.length - 1; i >= 0 && !boven; i--) if (lijst[i].gewicht === 'alarm') boven = lijst[i];
    if (!boven) boven = lijst[lijst.length - 1];
    var speciaal = HV.profiel && HV.profiel().speciaal;
    HV.zet(plek, o.toost(boven, { meer: speciaal ? 0 : lijst.length - 1 }));
  };
  HV.actie('toost-meer', function () { HV.bladOpen('meldingen'); });

  // пошук у Команді: поле живе поза перерисовкою
  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'hv-opdracht-veld' && dlg && dlg.soort === 'opdracht') { dlg.zoek = ev.target.value; dlg.gekozen = null; HV.teken(); }
  });
})(window.HV = window.HV || {});
