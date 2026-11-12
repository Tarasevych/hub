// Bladen: register van bedieningsbladen en het geraamte van een blad (hv-laag).
// Аркуш пристрою має три частини: Керування · Історія · Налаштування. На телефоні він виїжджає знизу, на комп'ютері стоїть
// праворуч. Скляна лише оболонка; вміст лежить на паперових блоках. Пізніша реєстрація з тим самим soort ЗАМІНЮЄ попередню;
// для пристрою береться останній зареєстрований аркуш, чий past(apparaat) повертає true.
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t, o = HV.o;

  HV.bladen = [];
  /**
   * HV.blad({ soort, past(apparaat), titel(apparaat), delen:{ bediening(ctx,a), geschiedenis(ctx,a), instellingen(ctx,a) } })
   * Вільний аркуш (не пристрій): HV.blad({ soort, vrij:true, titel(ctx,id), icoon, render(ctx,id), breed? }) → ctx.blad('soort') або ctx.blad('soort:id').
   */
  HV.blad = function (def) {
    for (var i = 0; i < HV.bladen.length; i++) if (HV.bladen[i].soort === def.soort) { HV.bladen.splice(i, 1); break; }
    HV.bladen.push(def);
  };
  HV.bladVoor = function (a) {
    for (var i = HV.bladen.length - 1; i >= 0; i--) { var b = HV.bladen[i]; if (!b.vrij && b.past && b.past(a)) return b; }
    return null;
  };
  HV.bladVrij = function (soort) {
    for (var i = HV.bladen.length - 1; i >= 0; i--) if (HV.bladen[i].vrij && HV.bladen[i].soort === soort) return HV.bladen[i];
    return null;
  };

  var DELEN = [['bediening', ['Керування', 'Bediening']], ['geschiedenis', ['Історія', 'Geschiedenis']], ['instellingen', ['Налаштування', 'Instellingen']]];

  // «Що перевірити» для недоступного пристрою — 2–3 кроки за типом.
  var CONTROLE = {
    licht: [['Чи ввімкнено настінний вимикач', 'Of de wandschakelaar aan staat'], ['Чи лампа вкручена й не перегоріла', 'Of de lamp vastzit en niet kapot is']],
    stopcontact: [['Чи не вибило запобіжник у щитку', 'Of de zekering in de meterkast niet is gesprongen']],
    standaard: [['Чи має пристрій живлення', 'Of het apparaat stroom heeft'], ['Чи він у межах мережі', 'Of het binnen bereik van het netwerk is'], ['Чи працює вузол зв’язку', 'Of de hub werkt']]
  };

  // ── Standaarddelen (voor elk blad beschikbaar via HV.bladDelen) ──
  function watTeControleren(ctx, a) {
    var stappen = (CONTROLE[a.soort] || []).concat(CONTROLE.standaard).slice(0, 3);
    return o.kaart({ titel: t('Що перевірити', 'Wat te controleren'), klas: 'hv-kaart--onbereikbaar', inhoud:
      '<p class="hv-tekst">' + HV.icoon('unplug', { maat: 's' }) + ' ' + h(t('Пристрій недоступний. Востаннє: ', 'Het apparaat is niet bereikbaar. Laatst: ') + (HV.kijk.isAan(a) ? HV.woord.aan() : HV.woord.uit()) + ', ' + HV.tijd(a.gezien)) + '</p>' +
      '<ol class="hv-stappen">' + stappen.map(function (s) { return '<li>' + h(HV.p(s)) + '</li>'; }).join('') + '</ol>' +
      o.knop({ tekst: t('Перевірити зараз', 'Nu controleren'), icoon: 'refresh-cw', actie: 'controleer', gegevens: { doel: a.id } }) });
  }

  function geschiedenis(ctx, a) {
    var w = ctx.staat;
    var regels = w.logboek.filter(function (r) { return r.doel === a.id; });
    var openId = HV.ui.lees('bericht', null);
    // стрічка стану за добу: детермінована від назви пристрою (макет), позначена як симуляція
    var zaad = 0; for (var i = 0; i < a.id.length; i++) zaad = (zaad * 31 + a.id.charCodeAt(i)) % 9973;
    var van = w.tijd - 24 * 3600000, stukken = [];
    if ('aan' in a.st || 'speelt' in a.st || 'loopt' in a.st) {
      for (var k = 0; k < 4; k++) { var b = van + ((zaad * (k + 3)) % 20) * 3600000 + k * 1800000; stukken.push({ van: b, tot: Math.min(w.tijd, b + (1 + (zaad + k) % 3) * 2700000), toon: HV.paspoort.soorten[a.soort].toon || 'aan', label: HV.woord.aan() }); }
      if (HV.kijk.isAan(a)) stukken.push({ van: w.tijd - 40 * 60000, tot: w.tijd, toon: HV.paspoort.soorten[a.soort].toon || 'aan', label: HV.woord.aan() });
    }
    var tikken = [0, 6, 12, 18, 24].map(function (u) { return { x: van + u * 3600000, label: HV.tijd(van + u * 3600000) }; });
    var strook = stukken.length ? HV.grafiek.toestanden({ id: 'hist-' + a.id, titel: t('Остання доба', 'Laatste etmaal'), van: van, tot: w.tijd, nu: w.tijd, tikken: tikken, format: HV.tijd, samenvatting: t('Симульована історія стану.', 'Gesimuleerde toestandsgeschiedenis.'), banen: [{ naam: HV.woord.aan(), stukken: stukken }] }) : '';
    var lijst = regels.length
      ? '<ul class="hv-berichten">' + regels.slice(0, 30).map(function (r) { return o.bericht(r, { open: openId === r.id }); }).join('') + '</ul>'
      : o.leeg({ icoon: 'history', titel: t('Ще немає записів', 'Nog geen regels'), tekst: t('Кожна дія з цим пристроєм з’явиться тут зі знаком автора.', 'Elke actie met dit apparaat komt hier te staan, met wie het deed.') });
    return (strook ? o.kaart({ inhoud: strook }) : '') + o.kaart({ titel: t('Дії', 'Acties'), inhoud: lijst });
  }

  function instellingen(ctx, a) {
    var kamer = HV.staat.kamer(a.kamer), soort = HV.paspoort.soorten[a.soort];
    var uitvoerder = HV.ui.lees('stand-uitvoerder', 'scene');
    var acties = HV.gevaar.acties.filter(function (x) { return x.soorten && x.soorten.indexOf(a.soort) >= 0; });
    // обидві назви показано завжди — кожну своєю мовою, з позначкою lang
    var rijen = o.rij({ naam: t('Назва українською', 'Naam in het Oekraïens'), waarde: '<span lang="uk">' + h(a.naam[0]) + '</span>' }) + o.rij({ naam: t('Назва нідерландською', 'Naam in het Nederlands'), waarde: '<span lang="nl">' + h(a.naam[1]) + '</span>' }) +
      o.rij({ naam: t('Кімната', 'Kamer'), waarde: h(HV.p(kamer.naam)) }) + o.rij({ naam: t('Тип', 'Soort'), waarde: h(HV.p(soort.naam)) }) +
      o.rij({ naam: t('Джерело', 'Bron'), waarde: HV.icoon('flask-conical', { maat: 's' }) + ' ' + h(t('Симулятор', 'Simulator')) }) +
      (a.batterij != null ? o.rij({ naam: t('Батарейка', 'Batterij'), waarde: HV.maat(a.batterij, '%') }) : '');
    var standen = acties.length ? o.kaart({ titel: t('Дозволи для цього пристрою', 'Toestemmingen voor dit apparaat'), extra: o.gevolg(t('Що станеться: обраний виконавець зможе виконувати дію сам («Завжди»), лише після вашого схвалення («Питати») або не зможе зовсім («Вимкнено»). Пов’язано з: кожна зміна дозволу й кожна дія за ним — запис у Журналі. Як повернути: оберіть «Вимкнено».', 'Wat er gebeurt: de gekozen uitvoerder mag de actie zelf doen (‘Altijd’), alleen na jouw goedkeuring (‘Vragen’) of helemaal niet (‘Uit’). Hangt samen met: elke wijziging en elke actie op basis hiervan komt in het logboek. Terugdraaien: kies ‘Uit’.')), inhoud:
      o.segment({ label: t('Виконавець', 'Uitvoerder'), waarde: uitvoerder, actie: 'ui', gegevens: { naam: 'stand-uitvoerder' }, klas: 'hv-segment--rol', opties: HV.gevaar.uitvoerders().map(function (u) { return { id: u.id, label: HV.p(u.naam) }; }) }) +
      acties.map(function (x) { return o.stand({ uitvoerder: uitvoerder, actie: x, rol: ctx.rol }); }).join('') }) : '';
    return o.kaart({ inhoud: '<div class="hv-rijen">' + rijen + '</div>' }) + standen +
      o.kaart({ titel: t('Небезпечна зона', 'Gevarenzone'), inhoud: '<p class="hv-tekst hv-tekst--zacht">' + h(t('«На обслуговуванні до…», «Приховати», «Замінити», «Видалити».', '‘In onderhoud tot…’, ‘Verbergen’, ‘Vervangen’, ‘Verwijderen’.')) + '</p>' + o.later(t('пізніше', 'later')) });
  }

  // Органи за можливістю (а не за брендом): універсальне «Керування» для класів без власного аркуша.
  var MODI = {
    thermostaat: [['uit', ['Вимкнено', 'Uit']], ['verwarmen', ['Обігрів', 'Verwarmen']], ['auto', ['Авто', 'Auto']]],
    airco: [['koelen', ['Охолодження', 'Koelen']], ['verwarmen', ['Обігрів', 'Verwarmen']], ['drogen', ['Осушення', 'Drogen']]],
    warmtepomp: [['uit', ['Вимкнено', 'Uit']], ['verwarmen', ['Обігрів', 'Verwarmen']], ['boiler', ['Лише вода', 'Alleen water']]]
  };
  function algemeen(ctx, a) {
    var b = o.beeld(a), st = a.st, uit = '', naam = HV.p(a.naam);
    var heeft = function (m) { return a.mog.indexOf(m) >= 0; };
    var sch = b.schakel;
    uit += '<div class="hv-bediening__hoofd">' + o.schakel({ aan: a.beschikbaar === 'onbereikbaar' ? false : a.wacht && sch && a.wacht.mogelijkheid === sch.mogelijkheid ? a.wacht.waarde : b.aan, icoon: b.icoon, toon: b.toon, kritiek: b.kritiek, staat: a.wacht ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : null), actie: sch && !b.kritiek ? 'schakel' : null, gegevens: sch ? { doel: a.id, mogelijkheid: sch.mogelijkheid, op: sch.op, af: sch.af } : null, aria: naam }) +
      '<div><p class="hv-bediening__woord">' + h(a.wacht ? HV.woord.wacht() : b.woord) + '</p>' + (b.waarde ? '<p class="hv-bediening__getal">' + b.waarde + '</p>' : '') + '</div></div>';
    var schuif = function (m, label, eenheid, min, max, stap) { return o.schuif({ label: label, waarde: st[m], min: min, max: max, stap: stap, eenheid: eenheid, toon: 'neutraal', actie: 'schuif-doe', gegevens: { doel: a.id, mogelijkheid: m } }); };
    var veld = function (label, html) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + '</span>' + html + '</div>'; };
    if (heeft('positie')) uit += veld(t('Положення', 'Positie'), schuif('positie', t('Положення', 'Positie'), '%', 0, 100, 5));
    if (heeft('kantel')) uit += veld(t('Нахил ламелей', 'Kantelstand'), schuif('kantel', t('Нахил ламелей', 'Kantelstand'), '%', 0, 100, 5));
    if (heeft('volume')) uit += veld(t('Гучність', 'Volume'), schuif('volume', t('Гучність', 'Volume'), '%', 0, 100, 2));
    if (heeft('doel')) {
      var dec = a.soort === 'oven' || a.soort === 'bevochtiger' || a.soort === 'boiler' ? 0 : 1, stap = a.soort === 'oven' ? 10 : dec ? 0.5 : 1;
      var eenheid = a.soort === 'bevochtiger' ? '%' : '°C';
      uit += veld(t('Ціль', 'Doel'), o.stapper({ actie: 'stap-doe', gegevens: { doel: a.id, mogelijkheid: 'doel' }, stap: stap, label: t('Ціль', 'Doel'), waarde: HV.maat(a.wacht && a.wacht.mogelijkheid === 'doel' ? a.wacht.waarde : st.doel, eenheid, dec), k: 'doel-' + a.id }));
    }
    if (heeft('modus')) {
      if (MODI[a.soort]) uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим', 'Stand'), waarde: st.modus, actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'modus' }, opties: MODI[a.soort].map(function (m) { return { id: m[0], label: HV.p(m[1]) }; }) }));
      else uit += veld(t('Режим роботи', 'Werkmodus'), o.werkmodus({ waarde: st.modus, actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'modus' } }));
    }
    if (heeft('stand')) uit += veld(t('Швидкість', 'Stand'), o.segment({ label: t('Швидкість', 'Stand'), waarde: st.stand, actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'stand' }, opties: (a.soort === 'ventilatie' ? [0, 1, 2, 3] : [1, 2, 3]).map(function (n) { return { id: n, label: n === 0 ? t('Вимк.', 'Uit') : String(n) }; }) }));
    if (heeft('open')) {
      uit += '<div class="hv-knoppen">' + o.knop({ tekst: t('Відчинити', 'Openen'), icoon: 'door-open', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'open', waarde: 'true' }, gedrukt: st.open }) + o.knop({ tekst: t('Зачинити', 'Sluiten'), icoon: 'door-closed', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'open', waarde: 'false' }, gedrukt: !st.open }) + '</div>' +
        '<p class="hv-tekst hv-tekst--zacht">' + o.risico('kritiek', { lang: true }) + ' ' + h(t('Відчинення — через рейку утримання й підтвердження входу.', 'Openen gaat via de houdrail en een bevestiging van je aanmelding.')) + '</p>';
    }
    if (heeft('vergrendeld')) {
      uit += '<div class="hv-knoppen">' + o.knop({ tekst: t('Замкнути', 'Vergrendelen'), icoon: 'lock-keyhole', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld', waarde: 'true' }, gedrukt: st.vergrendeld }) + o.knop({ tekst: t('Відімкнути', 'Ontgrendelen'), icoon: 'lock-keyhole-open', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'vergrendeld', waarde: 'false' }, gedrukt: !st.vergrendeld }) + '</div>' +
        '<p class="hv-tekst hv-tekst--zacht">' + o.risico('kritiek', { lang: true }) + ' ' + h(t('Відмикання — через рейку утримання й підтвердження входу.', 'Ontgrendelen gaat via de houdrail en een bevestiging van je aanmelding.')) + '</p>';
    }
    if (heeft('alarmstand')) uit += veld(t('Охорона', 'Alarm'), o.segment({ label: t('Охорона', 'Alarm'), waarde: st.stand, actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'alarmstand' }, klas: 'hv-segment--rol', opties: [{ id: 'uit', label: t('Знято', 'Uit') }, { id: 'schil', label: t('Периметр', 'Schil') }, { id: 'nacht', label: t('Нічна', 'Nachtstand') }, { id: 'volledig', label: t('Повна', 'Volledig') }] }));
    if (heeft('programma')) uit += '<div class="hv-knoppen">' + (st.loopt ? o.knop({ tekst: t('Зупинити програму', 'Programma stoppen'), icoon: 'square', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'programma', waarde: 'stop' } }) : o.knop({ tekst: t('Запустити «', 'Start ‘') + HV.p(st.programma) + t('»', '’'), icoon: 'play', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'programma', waarde: 'start' } })) + '</div>';
    if (heeft('robot')) uit += '<div class="hv-knoppen">' + o.knop({ tekst: t('Почати', 'Starten'), icoon: 'play', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'robot', waarde: 'start' } }) + o.knop({ tekst: t('Пауза', 'Pauze'), icoon: 'pause', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'robot', waarde: 'pauze' } }) + o.knop({ tekst: t('На базу', 'Naar station'), icoon: 'house', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'robot', waarde: 'dock' } }) + '</div>';
    if (heeft('herstart')) uit += '<div class="hv-knoppen">' + o.knop({ tekst: t('Перезапустити', 'Herstarten'), icoon: 'triangle', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'herstart', waarde: '1' } }) + '</div>';
    var eigen = HV.bladVoor(a);
    return o.kaart({ inhoud: uit }) + (eigen && eigen.soort === 'algemeen' ? '<p class="hv-laag__noot">' + o.later() + ' ' + h(t('Повний аркуш цього типу ще збирається; основні органи вже працюють.', 'Het volledige blad voor dit soort is nog in opbouw; de basisbediening werkt al.')) + '</p>' : '');
  }

  HV.bladDelen = { geschiedenis: geschiedenis, instellingen: instellingen, watTeControleren: watTeControleren, algemeen: algemeen };

  HV.blad({ soort: 'algemeen', past: function () { return true; }, delen: { bediening: algemeen } });

  // ── Kleine acties die elk blad kan gebruiken ──
  HV.actie('doe', function (ctx, g) { HV.doe({ doel: g.doel, mogelijkheid: g.mogelijkheid, waarde: g.waarde }); });
  HV.actie('schuif-doe', function (ctx, g) { if (g.fase === 'klaar') HV.doe({ doel: g.doel, mogelijkheid: g.mogelijkheid, waarde: g.waarde }); });
  HV.actie('stap-doe', function (ctx, g) {
    var a = HV.staat.apparaat(g.doel);
    var nu = a.wacht && a.wacht.mogelijkheid === g.mogelijkheid ? a.wacht.waarde : HV.huidige(a, g.mogelijkheid);
    var stap = Number(g.stap) || 1;
    var grens = g.mogelijkheid === 'doel' ? (a.soort === 'oven' ? [50, 250] : a.soort === 'bevochtiger' ? [30, 70] : a.soort === 'boiler' ? [40, 65] : a.soort === 'koelkast' ? [2, 8] : [5, 30]) : [0, 100];
    var nieuw = Math.max(grens[0], Math.min(grens[1], Math.round((Number(nu) + Number(g.richting) * stap) / stap) * stap));
    if (nieuw !== nu) HV.doe({ doel: a.id, mogelijkheid: g.mogelijkheid, waarde: nieuw });
  });
  HV.actie('controleer', function (ctx, g) {
    var a = HV.staat.apparaat(g.doel);
    HV.meld({ icoon: 'refresh-cw', titel: HV.p(a.naam), tekst: t('Перевіряємо зв’язок…', 'Verbinding wordt gecontroleerd…') });
    setTimeout(function () { HV.meld({ gewicht: 'belangrijk', icoon: 'unplug', titel: HV.p(a.naam) + ': ' + HV.woord.onbereikbaar(), tekst: t('Відповіді немає. Перевірте кроки зі списку.', 'Geen antwoord. Loop de stappen uit de lijst na.') }); }, 1200);
  });

  /**
   * HTML аркуша для маршруту { type, id, deel }. Повертає '' якщо аркуша немає.
   */
  HV.bladHtml = function (ctx, r) {
    if (!r) return '';
    var w = ctx.staat, titel, sub = '', icoon, lijf, tabs = '', voet = '', breed = false;
    if (r.type === 'apparaat') {
      var a = w.apparaten[r.id];
      if (!a) return '';
      var def = HV.bladVoor(a), soort = HV.paspoort.soorten[a.soort], kamer = HV.staat.kamer(a.kamer);
      var deel = r.deel || 'bediening';
      titel = def.titel ? def.titel(a) : HV.p(a.naam);
      sub = HV.p(kamer.naam) + ' · ' + HV.p(soort.naam);
      icoon = o.beeld(a).icoon;
      tabs = '<div class="hv-tabs hv-tabs--laag" role="tablist" aria-label="' + h(t('Частини аркуша', 'Delen van het blad')) + '">' + DELEN.map(function (d) {
        return '<button type="button" role="tab" id="laag-tab-' + d[0] + '" aria-selected="' + (deel === d[0] ? 'true' : 'false') + '" tabindex="' + (deel === d[0] ? '0' : '-1') + '" class="hv-tab' + (deel === d[0] ? ' is-actief' : '') + '" data-actie="blad-deel" data-deel="' + d[0] + '">' + h(HV.p(d[1])) + '</button>';
      }).join('') + '</div>';
      var maak = (def.delen && def.delen[deel]) || HV.bladDelen[deel] || algemeen;
      if (deel === 'bediening' && a.beschikbaar === 'onbereikbaar') lijf = watTeControleren(ctx, a);
      else if (deel === 'bediening' && w.gegevens === 'geen') lijf = o.kaart({ inhoud: '<p class="hv-tekst">' + HV.icoon('wifi-off', { maat: 's' }) + ' ' + h(t('Немає зв’язку з домом: показано останній знімок, керування вимкнене.', 'Geen verbinding met het huis: je ziet de laatste momentopname, bediening is uit.')) + '</p>' });
      else lijf = maak(ctx, a);
      var b = o.beeld(a);
      voet = o.stempel({ waarde: h(a.beschikbaar === 'onbereikbaar' ? HV.woord.onbereikbaar() : b.woord || HV.p(soort.naam)), leeftijd: HV.kijk.leeftijd(a), bron: t('Симулятор', 'Simulator'), staat: a.beschikbaar !== 'ok' ? a.beschikbaar : null }) +
        (HV.makerZichtbaar(a) ? '<p class="hv-laag__maker">' + h(t('Остання зміна: ', 'Laatste wijziging: ')) + o.maker(a.maker) + '</p>' : '');
      lijf = '<div class="hv-laag__paneel" role="tabpanel" aria-labelledby="laag-tab-' + deel + '">' + lijf + '</div>';
    } else {
      var vrij = HV.bladVrij(r.type);
      if (!vrij) return '';
      titel = vrij.titel ? (typeof vrij.titel === 'function' ? vrij.titel(ctx, r.id) : HV.p(vrij.titel)) : '';
      sub = vrij.sub ? vrij.sub(ctx, r.id) : '';
      icoon = typeof vrij.icoon === 'function' ? vrij.icoon(ctx, r.id) : vrij.icoon;
      breed = !!vrij.breed;
      lijf = '<div class="hv-laag__paneel">' + vrij.render(ctx, r.id, r.deel) + '</div>';
    }
    // на телефоні аркуш модальний (під ним затемнення); від 900 px він стоїть поруч зі сторінкою й нічого не перекриває
    var modaal = (ctx.profiel.breedte || 0) < 900;
    return '<aside class="hv-laag' + (breed ? ' hv-laag--breed' : '') + '" role="dialog" aria-modal="' + (modaal ? 'true' : 'false') + '" aria-labelledby="hv-laag-titel" data-k="laag-' + h(r.type + '-' + (r.id || '')) + '">' +
      '<div class="hv-laag__greep" aria-hidden="true"></div>' +
      '<header class="hv-laag__kop">' + (icoon ? '<span class="hv-laag__teken">' + HV.icoon(icoon) + '</span>' : '') +
      '<div class="hv-laag__naam"><h2 id="hv-laag-titel" tabindex="-1">' + h(titel) + '</h2>' + (sub ? '<p>' + h(sub) + '</p>' : '') + '</div>' +
      o.icoonknop({ icoon: 'x', aria: t('Закрити аркуш', 'Blad sluiten'), actie: 'blad-sluit', klas: 'hv-laag__sluit' }) + '</header>' +
      tabs + '<div class="hv-laag__inhoud">' + lijf + '</div>' + (voet ? '<footer class="hv-laag__voet">' + voet + '</footer>' : '') + '</aside>';
  };
})(window.HV = window.HV || {});
