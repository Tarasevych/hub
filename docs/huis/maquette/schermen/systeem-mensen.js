// Systeem / Система — зона «systeem-mensen»: вкладки «Дім», «Люди й доступ», «Приватність», «Дозволи й небезпечні дії»
// і «Сповіщення». Адреси на справжньому сайті: /instellingen/woning, /instellingen/mensen[/<persoon>], /instellingen/privacy,
// /instellingen/risico, /instellingen/meldingen; аркуші ?blad=smkaders:<uitvoerder>, ?blad=smkamer:<kamer>, ?blad=smuitnodigen.
//
// Рішення власника (§3.8 плану, §10 дизайн-мови): для КОЖНОЇ дії реєстру HV.gevaar — усі три режими «Вимкнено · Питати · Завжди»
// окремо для кожного виконавця; типово «Вимкнено»; змінює лише власник; стель і примусових строків немає; рамки — за бажанням.
// Кожна зміна — запис Журналу (HV.logboek) і сповіщення; дії з пристроями — лише через HV.doe.
//
// Ядро не має цілі «налаштування» в HV.doe, тому зміна налаштування йде через stel(): роль → (ритуал hv-gevaar для ризикованого) →
// зміна стану світу → запис Журналу → сповіщення з «Повернути». Рамки дозволів і права ролей/кімнат діють насправді:
// модуль обгортає HV.doe та HV.gevaar.rolMag (див. «Обгортки ядра» внизу), не змінюючи їхніх контрактів.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var P = function (x) { return HV.p(x); };
  var DAG = 86400000, UUR = 3600000;

  // ───────────────────────── Довідники ─────────────────────────
  var ROL_NAAM = { eigenaar: ['Власник', 'Eigenaar'], bewoner: ['Мешканець', 'Bewoner'], kind: ['Дитина', 'Kind'], gast: ['Гість', 'Gast'] };
  var ROL_ICOON = { eigenaar: 'crown', bewoner: 'house', kind: 'baby', gast: 'luggage' };
  var ROL_ZIN = {
    eigenaar: ['Усе, включно з дозволами виконавців, людьми й налаштуваннями системи.', 'Alles, ook de toestemmingen van uitvoerders, mensen en systeeminstellingen.'],
    bewoner: ['Керує всім домом; замки й охорона — з підтвердженням входу; дозволів не змінює.', 'Bedient het hele huis; sloten en alarm met bevestiging van aanmelding; wijzigt geen toestemmingen.'],
    kind: ['Свої кімнати й дозволені сцени; енергію лише бачить; без замків і камер.', 'Eigen kamers en toegestane scènes; ziet de energie alleen; geen sloten en camera’s.'],
    gast: ['Вибрані кімнати й сцени на строк; без камер, енергії й гаража.', 'Gekozen kamers en scènes voor een termijn; geen camera’s, energie en garage.']
  };
  var ROLLEN = ['eigenaar', 'bewoner', 'kind', 'gast'];

  // Області прав ролей. vast — визначає платформа (показано, не змінюється).
  var GEBIEDEN = [
    { id: 'licht', icoon: 'lightbulb', naam: ['Світло, штори й розетки', 'Licht, gordijnen en stekkers'] },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат і тепло', 'Klimaat en warmte'] },
    { id: 'media', icoon: 'speaker', naam: ['Медіа', 'Media'] },
    { id: 'scenes', icoon: 'sparkles', naam: ['Сцени й режим дому', 'Scènes en huisstand'] },
    { id: 'apparatuur', icoon: 'washing-machine', naam: ['Техніка й мережа', 'Apparatuur en netwerk'] },
    { id: 'energie', icoon: 'zap', naam: ['Енергія й зарядка', 'Energie en laden'] },
    { id: 'garage', icoon: 'car', naam: ['Гараж, роботи й дрони', 'Garage, robots en drones'] },
    { id: 'camera', icoon: 'cctv', naam: ['Камери', 'Camera’s'] },
    { id: 'toegang', icoon: 'lock-keyhole', naam: ['Замки, ворота й охорона', 'Sloten, poorten en alarm'] },
    { id: 'rechten', vast: true, icoon: 'shield-check', naam: ['Дозволи виконавців', 'Toestemmingen van uitvoerders'] },
    { id: 'verzoeken', vast: true, icoon: 'circle-help', naam: ['Запити агентів', 'Verzoeken van agenten'] },
    { id: 'systeem', vast: true, icoon: 'settings', naam: ['Люди й налаштування', 'Mensen en instellingen'] }
  ];
  var RECHT = [
    { id: 'geen', icoon: 'minus', naam: ['Немає', 'Geen'], uitleg: ['не бачить і не керує', 'ziet en bedient niets'] },
    { id: 'zien', icoon: 'eye', naam: ['Бачить', 'Ziet'], uitleg: ['лише перегляд', 'alleen bekijken'] },
    { id: 'bedienen', icoon: 'hand', naam: ['Керує', 'Bedient'], uitleg: ['звичайні й чутливі дії', 'gewone en gevoelige acties'] },
    { id: 'alles', icoon: 'check-check', naam: ['Усе', 'Alles'], uitleg: ['і небезпечні — з ритуалом', 'ook gevaarlijke — met ritueel'] }
  ];
  var STANDAARD_RECHTEN = {
    bewoner: { licht: 'alles', klimaat: 'alles', media: 'alles', scenes: 'alles', apparatuur: 'alles', energie: 'alles', garage: 'alles', camera: 'alles', toegang: 'alles' },
    kind: { licht: 'bedienen', klimaat: 'bedienen', media: 'bedienen', scenes: 'bedienen', apparatuur: 'zien', energie: 'zien', garage: 'geen', camera: 'geen', toegang: 'geen' },
    gast: { licht: 'bedienen', klimaat: 'zien', media: 'bedienen', scenes: 'bedienen', apparatuur: 'geen', energie: 'geen', garage: 'geen', camera: 'geen', toegang: 'geen' }
  };
  var VAST_RECHT = {
    rechten: { eigenaar: ['змінює', 'wijzigt'], bewoner: ['бачить', 'ziet'], kind: ['—', '—'], gast: ['—', '—'] },
    verzoeken: { eigenaar: ['усі рівні', 'alle niveaus'], bewoner: ['звичайні й чутливі', 'gewone en gevoelige'], kind: ['—', '—'], gast: ['—', '—'] },
    systeem: { eigenaar: ['усе', 'alles'], bewoner: ['бачить', 'ziet'], kind: ['—', '—'], gast: ['—', '—'] }
  };

  // Ключ дії → область прав і клас для групування реєстру.
  function gebiedVan(actie) {
    var s = actie.sleutel || '';
    var kop = s.split('.')[0];
    if (['licht', 'stopcontact', 'zonwering'].indexOf(kop) >= 0 || s === 'alle.licht' || s === 'kamer.licht') return 'licht';
    if (['klimaat', 'warmtepomp', 'boiler', 'ventilatie'].indexOf(kop) >= 0 || s === 'kamer.doel') return 'klimaat';
    if (kop === 'media') return 'media';
    if (kop === 'scene' || s === 'huis.stand') return 'scenes';
    if (['oven', 'koelkast', 'koffie', 'programma', 'apparatuur', 'computer', 'voeding', 'router', 'beregening'].indexOf(kop) >= 0 || s === 'huis.allesuit') return 'apparatuur';
    if (['thuisbatterij', 'laadpaal', 'zonnepanelen'].indexOf(kop) >= 0) return 'energie';
    if (['maaier', 'robot', 'drone', 'garage'].indexOf(kop) >= 0) return 'garage';
    if (['slot', 'alarm', 'ingang', 'melder'].indexOf(kop) >= 0) return 'toegang';
    if (kop === 'camera') return 'camera';
    return null;
  }
  var KLASSEN = [
    { id: 'toegang', icoon: 'shield', naam: ['Двері, ворота й охорона', 'Deuren, poorten en alarm'] },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат і тепло', 'Klimaat en warmte'] },
    { id: 'apparatuur', icoon: 'plug-zap', naam: ['Техніка й мережа', 'Apparatuur en netwerk'] },
    { id: 'energie', icoon: 'zap', naam: ['Енергія й зарядка', 'Energie en laden'] },
    { id: 'garage', icoon: 'car', naam: ['Сад, транспорт, роботи й дрони', 'Tuin, voertuigen, robots en drones'] },
    { id: 'scenes', icoon: 'house', naam: ['Дім і сцени', 'Huis en scènes'] },
    { id: 'licht', icoon: 'lightbulb', naam: ['Світло, штори й розетки', 'Licht, gordijnen en stekkers'] },
    { id: 'media', icoon: 'speaker', naam: ['Медіа', 'Media'] },
    { id: 'camera', icoon: 'cctv', naam: ['Камери', 'Camera’s'] },
    { id: 'agent', icoon: 'bot', naam: ['Інструменти агентів', 'Hulpmiddelen van agenten'] }
  ];
  function klasseVan(actie) { return gebiedVan(actie) || 'agent'; }
  var NIVEAU_RANG = { kritiek: 0, gevaarlijk: 1, gevoelig: 2, gewoon: 3 };
  var NIVEAU_GROEP = {
    kritiek: { icoon: 'octagon', naam: ['Критичні дії', 'Kritieke acties'] },
    gevaarlijk: { icoon: 'triangle', naam: ['Небезпечні дії', 'Gevaarlijke acties'] },
    gevoelig: { icoon: 'eye', naam: ['Чутливі дії', 'Gevoelige acties'] },
    gewoon: { icoon: 'circle', naam: ['Звичайні дії', 'Gewone acties'] }
  };
  var UITVOERDER_ICOON = { scene: 'sparkles', automatisering: 'diamond', optimalisatie: 'gauge', agent: 'bot' };
  // Типовий стан — тиха риска (як «Немає» у правах ролей); винятки — знак у колі.
  var STAND_ICOON = { uit: 'minus', vragen: 'circle-help', altijd: 'circle-check' };

  // ───────────────────────── Стан зони (живе у світі: сценарій починає зі свіжого) ─────────────────────────
  function kopie(x) { return JSON.parse(JSON.stringify(x)); }
  function dagBegin(ms) { return ms - (((ms % DAG) + DAG) % DAG); }

  function S(w) {
    w = w || HV.staat.w;
    if (!w) return null;
    if (w.sm) return w.sm;
    var nu = w.tijd;
    var sm = {
      woning: { naam: HV.paspoort.naam.slice(), straat: HV.paspoort.adres, postcode: '3581 AB', plaats: HV.paspoort.plaats.slice(), tijdzone: 'ams', taal: 'uk', weekstart: 'ma', temp: 'c', afstand: 'km', energie: 'kwh', weer: 'knmi', afval: true },
      mensen: {},
      uitnodigingen: [{ id: 'u1', naam: ['Марта', 'Marta'], rol: 'gast', kamers: ['woonkamer', 'keuken', 'logeerkamer', 'badkamer', 'hal'], termijn: 7, sinds: nu - 26 * UUR, tot: nu + 6 * DAG, stand: 'verstuurd' }],
      rechten: kopie(STANDAARD_RECHTEN),
      nieuweKamers: [],
      privacy: {
        camera: false, microfoon: false, locatie: false, prive: ['slaapkamer'], agentLocatie: 'algemeen',
        zicht: { olena: 'zelf', taras: 'zelf', marko: 'volwassenen', solomija: 'volwassenen', iryna: 'zelf', ev: 'volwassenen', benzine: 'volwassenen', fietsolena: 'zelf', fietstaras: 'zelf', step: 'volwassenen', bromfiets: 'volwassenen' },
        bewaar: { buiten: 14, binnen: 7, bezoek: 14, beveiliging: 90, apparaten: 365, locatie: 7 },
        export: null,
        gekeken: [
          { tijd: nu - 3 * UUR, wie: ['Агент Claude', 'Agent Claude'], wat: ['знімок дому: «хтось удома»', 'momentopname: ‘er is iemand thuis’'], icoon: 'bot' },
          { tijd: nu - 26 * UUR, wie: ['Тарас', 'Taras'], wat: ['Журнал за тиждень', 'logboek van de week'], icoon: 'user' },
          { tijd: nu - 50 * UUR, wie: ['Олена', 'Olena'], wat: ['камера біля входу, 2 хв', 'camera voordeur, 2 min'], icoon: 'user' }
        ]
      },
      kaders: {},
      meldingen: {
        kanalen: { app: true, push: false, mail: false, paneel: false, licht: false, trillen: false },
        stil: { aan: true, van: 22, tot: 7, dagen: 'elke' },
        soorten: { 'huis.alarm': 'alles', 'huis.toegang': 'alles', 'huis.agent': 'alles', 'huis.automatisering': 'belangrijk', 'huis.apparaat': 'belangrijk', 'huis.energie': 'belangrijk', 'huis.voertuig': 'belangrijk', 'huis.systeem': 'alles', 'huis.simulatie': 'niets' },
        herhaal: true, test: null
      }
    };
    w.mensen.forEach(function (m) {
      var basis = { kamers: null, tot: null, code: null, ingetrokken: false, bronnen: { wifi: true, zone: false, code: true, hand: true }, toestemming: { aanwezigheid: true, locatie: false, camera: false, wolk: false } };
      if (m.rol === 'eigenaar') basis.code = { gezet: nu - 40 * DAG };
      if (m.rol === 'bewoner') basis.code = { gezet: nu - 12 * DAG };
      if (m.rol === 'kind') { basis.kamers = ['kinderkamer', 'woonkamer', 'keuken', 'badkamer', 'hal', 'tuin']; basis.bronnen = { wifi: true, zone: false, code: false, hand: true }; basis.toestemming.aanwezigheid = false; }
      if (m.rol === 'gast') { basis.kamers = ['logeerkamer', 'woonkamer', 'keuken', 'badkamer', 'hal']; basis.tot = nu + 2 * DAG + 5 * UUR; basis.bronnen = { wifi: true, zone: false, code: true, hand: false }; basis.toestemming.aanwezigheid = false; }
      sm.mensen[m.id] = basis;
    });
    w.sm = sm;
    return sm;
  }
  HV.systeemMensen = { staat: S };

  // ───────────────────────── Хто дивиться і що може ─────────────────────────
  function rol() { return HV.rol(); }
  function isEigenaar() { return rol() === 'eigenaar'; }
  /** «Перегляд очима»: власник може подивитися на сторінку як гість чи агент — лише читання. */
  function ogen() { return isEigenaar() ? HV.ui.lees('sm-ogen', 'eigenaar') : rol(); }
  function magWijzigen() { return isEigenaar() && ogen() === 'eigenaar'; }
  function persoon(id) { var w = HV.staat.w; return w.mensen.filter(function (m) { return m.id === id; })[0] || null; }
  function eigenaars() { return HV.staat.w.mensen.filter(function (m) { return m.rol === 'eigenaar' && !S().mensen[m.id].ingetrokken; }); }
  function kamerNaam(id) { var k = HV.staat.kamer(id); return k ? P(k.naam) : id; }
  function alleKamers() { return HV.staat.w.kamers; }

  function weigerRol(tekst) {
    HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не змінено', 'Niet gewijzigd'), tekst: tekst || t('Змінює лише власник.', 'Alleen de eigenaar kan dit wijzigen.') });
    return false;
  }

  // «збережено» на 3 с біля органа (§10 дизайн-мови)
  var meldingen = {};
  function markeer(k, soort) {
    meldingen[k] = { soort: soort, tot: Date.now() + 3000 };
    setTimeout(function () { HV.teken(); }, 3100);
  }
  function markering(k) { var m = meldingen[k]; return m && Date.now() < m.tot ? m.soort : null; }
  function opgeslagen(k) {
    var m = markering(k);
    if (m === 'ok') return '<span class="hv-sm-ok" role="status">' + HV.icoon('check', { maat: 's' }) + h(t('збережено', 'opgeslagen')) + '</span>';
    if (m === 'fout') return '<span class="hv-sm-ok is-fout" role="status">' + HV.icoon('circle-x', { maat: 's' }) + h(t('не збережено: скасовано', 'niet opgeslagen: geannuleerd')) + '</span>';
    return '';
  }

  // Шлях у стані зони: 'privacy.camera', 'mensen.marko.kamers'.
  function lees(pad) { var x = S(); pad.split('.').forEach(function (d) { x = x == null ? undefined : x[d]; }); return x; }
  function schrijf(sm, pad, waarde) {
    var delen = pad.split('.'), x = sm;
    for (var i = 0; i < delen.length - 1; i++) { if (x[delen[i]] == null) x[delen[i]] = {}; x = x[delen[i]]; }
    x[delen[delen.length - 1]] = waarde;
  }

  /**
   * Змінити налаштування: роль → ритуал (за потреби) → стан → Журнал → сповіщення з «Повернути».
   * p: { pad, waarde, wat:[uk,nl], was:[uk,nl], werd:[uk,nl], soort, gewicht, wie:'eigenaar'|'iedereen'|'zelf', zelf, gevaar:{niveau,naam,gevolg},
   *      na(w, waarde) — побічна дія у світі (і для «Повернути»), icoon, k (ключ органа для «збережено») }
   */
  function stel(p) {
    var wie = p.wie || 'eigenaar';
    if (wie === 'eigenaar' && !isEigenaar()) return Promise.resolve(weigerRol());
    if (wie === 'zelf' && !isEigenaar() && HV.mens().id !== p.zelf) return Promise.resolve(weigerRol(t('Це налаштування іншої людини.', 'Dit is een instelling van iemand anders.')));
    if (ogen() !== 'eigenaar' && isEigenaar()) return Promise.resolve(weigerRol(t('Зараз увімкнено перегляд очима іншої ролі — лише читання.', 'Je bekijkt de pagina nu als een andere rol — alleen lezen.')));
    var oud = kopie(lees(p.pad) === undefined ? null : lees(p.pad));
    var doen = function () {
      HV.staat.wijzig(function (w) { schrijf(S(w), p.pad, p.waarde); if (p.na) p.na(w, p.waarde); });
      var regel = HV.logboek.voegToe({ maker: HV.mens(), wat: p.wat, waarom: p.waarom || null, was: p.was || null, werd: p.werd || null, soort: p.soort || 'huis.systeem', gewicht: p.gewicht || 'info' });
      if (p.k) markeer(p.k, 'ok');
      HV.meld({
        maker: HV.mens(), icoon: p.icoon || 'check', gewicht: p.gewicht === 'belangrijk' ? 'belangrijk' : 'info',
        titel: P(p.wat), tekst: p.was && p.werd ? P(p.was) + ' → ' + P(p.werd) : (p.tekst ? P(p.tekst) : ''),
        terug: p.zonderTerug ? null : function () {
          HV.staat.wijzig(function (w) { schrijf(S(w), p.pad, oud); if (p.na) p.na(w, oud); });
          HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: ' + regel.wat[0], 'Ongedaan gemaakt: ' + regel.wat[1]], was: p.werd || null, werd: p.was || null, soort: regel.soort });
        }
      });
      return { ok: true };
    };
    if (p.gevaar && HV.schil && HV.schil.gevaar) {
      return HV.schil.gevaar({ actie: { sleutel: 'instelling', niveau: p.gevaar.niveau, naam: p.gevaar.naam, gevolg: p.gevaar.gevolg }, naam: P(p.gevaar.naam) }).then(function (ja) {
        if (!ja) { if (p.k) markeer(p.k, 'fout'); HV.teken(); return { ok: false, reden: 'geannuleerd' }; }
        return doen();
      });
    }
    return Promise.resolve(doen());
  }

  // ───────────────────────── Спільні будівельні блоки сторінок ─────────────────────────
  /** Герой вкладки на папері: знак, речення, чипи, дії. */
  function kop(p) {
    return '<header class="hv-sm-kop' + (p.toon ? ' hv-toon-' + p.toon : '') + '" data-k="sm-kop-' + h(p.id) + '">' +
      '<span class="hv-sm-kop__teken">' + HV.icoon(p.icoon, { maat: 'l' }) + '</span>' +
      '<div class="hv-sm-kop__tekst"><p class="hv-sm-kop__boven">' + h(p.boven) + '</p><h1 class="hv-sm-kop__zin">' + h(p.zin) + '</h1>' +
      (p.sub ? '<p class="hv-sm-kop__sub">' + p.sub + '</p>' : '') + '</div>' +
      (p.chips ? '<div class="hv-sm-kop__chips">' + p.chips + '</div>' : '') +
      (p.acties ? '<div class="hv-sm-kop__acties">' + p.acties + '</div>' : '') + '</header>';
  }
  /** Паперова картка з шапкою «знак · назва · праворуч». */
  function kaart(p) {
    return '<section class="hv-sm-kaart' + (p.klas ? ' ' + p.klas : '') + '" data-k="sm-k-' + h(p.id) + '"' + (p.label ? ' aria-label="' + h(p.label) + '"' : '') + '>' +
      '<header class="hv-sm-kaart__kop"><h2 class="hv-sm-kaart__titel">' + (p.icoon ? '<span class="hv-sm-kaart__teken' + (p.toon ? ' hv-toon-' + p.toon : '') + '">' + HV.icoon(p.icoon, { maat: 's' }) + '</span>' : '') + '<span>' + h(p.titel) + '</span>' +
      (p.teller != null ? '<span class="hv-sm-teller">' + h(p.teller) + '</span>' : '') + '</h2>' +
      (p.uitleg ? o.gevolg(p.uitleg, { kop: p.titel }) : '') + (p.rechts ? '<div class="hv-sm-kaart__rechts">' + p.rechts + '</div>' : '') + '</header>' +
      (p.zin ? '<p class="hv-sm-kaart__zin">' + p.zin + '</p>' : '') + p.inhoud + '</section>';
  }
  /** Рядок налаштування: знак, назва з поясненням, орган праворуч (на телефоні — під назвою). */
  function regel(p) {
    var kort = /^<span class="hv-sm-(schakel|lees)/.test(p.orgaan || '');
    return '<div class="hv-sm-regel' + (kort ? ' hv-sm-regel--kort' : '') + (p.klas ? ' ' + p.klas : '') + '" data-k="sm-r-' + h(p.k) + '">' + (p.voor || '') +
      (p.icoon ? '<span class="hv-sm-regel__teken' + (p.toon ? ' hv-toon-' + p.toon : '') + '">' + HV.icoon(p.icoon, { maat: 's' }) + '</span>' : '') +
      '<div class="hv-sm-regel__tekst"><p class="hv-sm-regel__naam">' + h(p.naam) + (p.merk || '') + '</p>' + (p.sub ? '<p class="hv-sm-regel__sub">' + p.sub + '</p>' : '') + '</div>' +
      '<div class="hv-sm-regel__orgaan">' + (p.orgaan || '') + opgeslagen(p.k) + '</div></div>';
  }
  /** Перемикач налаштування: коло (форма перемикання) і слово стану поруч. */
  function schakelaar(p) {
    var lezen = p.lezen || !magWijzigenVoor(p.wie, p.zelf);
    return '<span class="hv-sm-schakel' + (p.aan ? ' is-aan' : '') + '">' +
      o.schakel({ aan: p.aan, icoon: p.icoon || (p.aan ? 'check' : 'minus'), toon: p.toon || 'aan', actie: lezen ? null : p.actie, gegevens: p.gegevens, aria: p.aria, klein: true }) +
      '<span class="hv-sm-schakel__woord">' + h(p.aan ? (p.woordAan || t('Увімкнено', 'Aan')) : (p.woordUit || t('Вимкнено', 'Uit'))) + '</span></span>';
  }
  function magWijzigenVoor(wie, zelf) {
    if (ogen() !== rol()) return false;
    if (wie === 'zelf') return isEigenaar() || HV.mens().id === zelf;
    if (wie === 'iedereen') return true;
    return isEigenaar();
  }
  function segment(p) {
    if (p.lezen || !magWijzigenVoor(p.wie, p.zelf)) {
      var x = p.opties.filter(function (y) { return String(y.id) === String(p.waarde); })[0];
      return '<span class="hv-sm-lees">' + HV.icoon('lock', { maat: 's' }) + '<strong>' + h(x ? x.label : '—') + '</strong></span>';
    }
    return o.segment({ label: p.label, waarde: p.waarde, actie: p.actie, gegevens: p.gegevens, opties: p.opties, klas: 'hv-sm-segment' + (p.klas ? ' ' + p.klas : ''), k: p.k });
  }
  function leesBanner(ctx) {
    var r = ogen();
    if (r === 'eigenaar') return '';
    var zin = r === 'agent'
      ? t('Так цю сторінку бачить агент: лише читання. Органа для зміни дозволів, ролей чи рамок в агента немає.', 'Zo ziet een agent deze pagina: alleen lezen. Een agent heeft geen orgaan om toestemmingen, rollen of kaders te wijzigen.')
      : t('Лише перегляд: ви увійшли як «' + ROL_NAAM[r][0] + '». Змінює лише власник.', 'Alleen bekijken: je bent aangemeld als ‘' + ROL_NAAM[r][1] + '’. Alleen de eigenaar kan dit wijzigen.');
    return '<p class="hv-sm-banner" role="status" data-k="sm-banner">' + HV.icoon(r === 'agent' ? 'bot' : 'lock', { maat: 's' }) + '<span>' + h(zin) + '</span>' +
      (isEigenaar() ? o.knop({ tekst: t('Повернутися до свого вигляду', 'Terug naar mijn weergave'), klein: true, soort: 'stil', actie: 'ui', gegevens: { naam: 'sm-ogen', waarde: 'eigenaar' } }) : '') + '</p>';
  }
  function avatar(m, maat) {
    var naam = P(m.naam);
    return '<span class="hv-sm-avatar hv-sm-avatar--' + h(m.rol) + (maat ? ' hv-sm-avatar--' + maat : '') + '" aria-hidden="true">' + h(naam.charAt(0)) + '</span>';
  }
  function aanwezigWoord(m) {
    if (m.zeker === 'onbekend') return t('невідомо, де', 'onbekend waar');
    var w = m.thuis ? t('вдома', 'thuis') : t('не вдома', 'niet thuis');
    return m.zeker === 'waarschijnlijk' ? w + t(' · ймовірно', ' · waarschijnlijk') : w;
  }
  function termijnTekst(ms) {
    var w = HV.staat.w, rest = Math.round((ms - w.tijd) / 60000);
    if (rest <= 0) return t('строк минув', 'termijn verlopen');
    if (rest >= 1440) { var d = Math.floor(rest / 1440), u = Math.floor((rest % 1440) / 60); return t('ще ', 'nog ') + d + ' ' + HV.meervoud(d, ['день', 'дні', 'днів'], ['dag', 'dagen']) + (u ? ' ' + u + ' ' + t('год', 'u') : ''); }
    return t('ще ', 'nog ') + HV.duur(rest);
  }

  // ═════════════════════════ 1. Дім / Woning ═════════════════════════
  var TIJDZONES = [{ id: 'ams', uk: 'Амстердам (UTC+1)', nl: 'Amsterdam (UTC+1)', verschil: 0 }, { id: 'kyiv', uk: 'Київ (UTC+2)', nl: 'Kyiv (UTC+2)', verschil: 1 }];
  var AFVAL = [
    { id: 'gft', icoon: 'leaf', naam: ['Органіка', 'GFT'], dag: 3, elke: 1 },
    { id: 'pmd', icoon: 'recycle', naam: ['Пластик і банки', 'PMD'], dag: 5, elke: 1 },
    { id: 'papier', icoon: 'newspaper', naam: ['Папір', 'Papier'], dag: 2, elke: 2 },
    { id: 'rest', icoon: 'trash-2', naam: ['Залишкове сміття', 'Restafval'], dag: 4, elke: 2 }
  ];
  function volgendeAfval(x, nu) {
    var dag0 = dagBegin(nu), wd = new Date(dag0).getUTCDay();
    for (var i = 0; i < 21; i++) {
      var d = dag0 + i * DAG, dw = (wd + i) % 7;
      var week = Math.floor(d / (7 * DAG));
      if (dw === x.dag && week % x.elke === 0 && (i > 0 || HV.uur(nu) < 8)) return d;
    }
    return dag0 + 7 * DAG;
  }
  var KAMER_ICONEN = ['sofa', 'bed', 'baby', 'bath', 'cooking-pot', 'briefcase', 'dumbbell', 'gamepad-2', 'shirt', 'flower-2'];
  // Назви знаків для читача екрана й підказки (aria-label, title) — не технічні назви lucide.
  var KAMER_ICOON_NAAM = {
    sofa: ['Диван', 'Bank'], bed: ['Ліжко', 'Bed'], baby: ['Дитина', 'Kind'], bath: ['Ванна', 'Bad'], 'cooking-pot': ['Каструля', 'Kookpan'], briefcase: ['Портфель', 'Aktetas'],
    dumbbell: ['Гантеля', 'Halter'], 'gamepad-2': ['Ігри', 'Spellen'], shirt: ['Одяг', 'Kleding'], 'flower-2': ['Квітка', 'Bloem'],
    'door-closed': ['Двері', 'Deur'], 'washing-machine': ['Пральна машина', 'Wasmachine'], 'hard-drive': ['Сховище', 'Opslag'], luggage: ['Валіза', 'Koffer'], trees: ['Дерева', 'Bomen'], warehouse: ['Гараж', 'Garage']
  };
  function kamerIcoonNaam(ic) { return P(KAMER_ICOON_NAAM[ic] || ['Поточний знак', 'Huidig teken']); }

  function woning(ctx) {
    var w = ctx.staat, sm = S(w), wo = sm.woning;
    var tz = TIJDZONES.filter(function (x) { return x.id === wo.tijdzone; })[0];
    var aantalKamers = w.kamers.length, aantalApp = w.volgorde.length;
    var lezen = !magWijzigen();
    var held = kop({ id: 'woning', icoon: 'house', toon: 'zon', boven: t('Система · Дім', 'Systeem · Woning'),
      zin: P(wo.naam), sub: h(wo.straat + ' · ' + wo.postcode + ' ' + P(wo.plaats)) + ' <span class="hv-punt" aria-hidden="true">·</span> ' + h(t('Нідерланди', 'Nederland')),
      chips: o.chip({ icoon: 'clock', tekst: t('час дому ', 'huistijd ') + HV.tijd(w.tijd) + ' · ' + (HV.taal() === 'nl' ? tz.nl : tz.uk) }) +
        o.chip({ icoon: 'layers', tekst: w.verdiepingen.length + ' ' + HV.meervoud(w.verdiepingen.length, ['рівень', 'рівні', 'рівнів'], ['niveau', 'niveaus']) + ' · ' + aantalKamers + ' ' + HV.meervoud(aantalKamers, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']) }) +
        o.chip({ icoon: 'cpu', tekst: aantalApp + ' ' + HV.meervoud(aantalApp, ['пристрій', 'пристрої', 'пристроїв'], ['apparaat', 'apparaten']) }) + o.sim(w, { kort: false }),
      acties: o.knop({ tekst: t('Додати кімнату', 'Kamer toevoegen'), icoon: 'plus', soort: 'hoofd', actie: lezen ? null : 'sm-kamer-nieuw', gegevens: { verdieping: 'beneden' }, uit: lezen }) +
        o.knop({ tekst: t('Кімнати на плані', 'Kamers op de plattegrond'), icoon: 'map', soort: 'stil', actie: 'ga', gegevens: { naar: 'kamers-plattegrond' } }) });

    var veld = function (id, label, waarde, auto) {
      return '<label class="hv-sm-invoer" data-k="sm-in-' + id + '"><span class="hv-sm-invoer__label">' + h(label) + '</span>' +
        '<input class="hv-sm-invoer__veld" type="text" data-sm-veld="' + id + '" value="' + h(waarde) + '"' + (lezen ? ' readonly aria-readonly="true"' : '') + (auto ? ' autocomplete="' + auto + '"' : '') + ' spellcheck="false">' + opgeslagen('veld-' + id) + '</label>';
    };
    var adres = kaart({ id: 'adres', icoon: 'map-pin', titel: t('Адреса й назва', 'Adres en naam'),
      uitleg: t('Що станеться: адресу покаже аварійний шар (дим, газ, вода) поруч із «Наберіть 112», а шапка — назву вулиці. Пов’язано з: «Безпека → Здоров’я системи» перевіряє, що адресу задано. Як повернути: «Повернути» в сповіщенні або впишіть стару адресу.', 'Wat er gebeurt: het noodscherm (rook, gas, water) toont dit adres naast ‘Bel 112’, de kopregel toont de straat. Hangt samen met: ‘Beveiliging → Systeemgezondheid’ controleert of er een adres is. Terugdraaien: ‘Ongedaan maken’ in de melding of typ het oude adres.'),
      inhoud: '<div class="hv-sm-invoeren">' + veld('naam', t('Назва дому', 'Naam van het huis'), P(wo.naam)) + veld('straat', t('Вулиця й номер', 'Straat en nummer'), wo.straat, 'street-address') +
        veld('postcode', t('Поштовий індекс', 'Postcode'), wo.postcode, 'postal-code') + veld('plaats', t('Місто', 'Plaats'), P(wo.plaats), 'address-level2') + '</div>' +
        '<div class="hv-sm-noodvoorbeeld" data-k="sm-nood"><span class="hv-sm-noodvoorbeeld__teken">' + HV.icoon('siren', { maat: 's' }) + '</span><div><p class="hv-sm-noodvoorbeeld__kop">' + h(t('Так адреса стоїть в аварійному шарі', 'Zo staat het adres op het noodscherm')) + '</p>' +
        '<p class="hv-sm-noodvoorbeeld__adres">' + h(wo.straat) + '<br>' + h(wo.postcode + ' ' + P(wo.plaats)) + '</p></div></div>' });

    var nu = w.tijd, gem = w.apparaten.thermostaat ? w.apparaten.thermostaat.st.temperatuur || 21 : 21;
    var tempTekst = wo.temp === 'f' ? HV.getal(gem * 9 / 5 + 32, 1) + ' °F' : HV.getal(gem, 1) + ' °C';
    var ev = w.voertuigen.filter(function (v) { return v.id === 'ev'; })[0];
    var bereik = ev ? (wo.afstand === 'mi' ? Math.round(ev.bereik * 0.621) + t(' миль', ' mijl') : ev.bereik + t(' км', ' km')) : '—';
    var tijd = kaart({ id: 'tijd', icoon: 'globe', titel: t('Час, мова й одиниці', 'Tijd, taal en eenheden'),
      uitleg: t('Що станеться: дім рахує розклади, тихі години й порядок дня за цим поясом; одиниці змінюють підписи на цій сторінці й у нових екранах. Пов’язано з: симулятор має власний «час дому». Як повернути: оберіть попереднє значення.', 'Wat er gebeurt: het huis rekent roosters, stille uren en de dagorde in deze zone; eenheden veranderen de labels op deze pagina en in nieuwe schermen. Hangt samen met: de simulator heeft een eigen ‘huistijd’. Terugdraaien: kies de vorige waarde.'),
      inhoud: '<div class="hv-sm-regels">' +
        regel({ k: 'tz', icoon: 'clock', naam: t('Часовий пояс', 'Tijdzone'), sub: h(t('Зараз у домі ', 'Nu in huis ') + HV.tijd(nu + tz.verschil * UUR) + ' · ' + HV.datum(nu)),
          orgaan: segment({ label: t('Часовий пояс', 'Tijdzone'), waarde: wo.tijdzone, actie: 'sm-stel', gegevens: { pad: 'woning.tijdzone', soort: 'tz' }, opties: TIJDZONES.map(function (x) { return { id: x.id, label: HV.taal() === 'nl' ? x.nl : x.uk }; }) }) }) +
        regel({ k: 'taal', icoon: 'languages', naam: t('Мова дому', 'Taal van het huis'), sub: h(t('оголошення в колонках, речення дому на стіні й у підсумку дня', 'omroepen via de speakers, de huiszin op het wandscherm en in het dagoverzicht')),
          orgaan: segment({ label: t('Мова дому', 'Taal van het huis'), waarde: wo.taal, actie: 'sm-stel', gegevens: { pad: 'woning.taal', soort: 'taal' }, opties: [{ id: 'uk', label: t('Українська', 'Oekraïens') }, { id: 'nl', label: t('Нідерландська', 'Nederlands') }] }) }) +
        regel({ k: 'week', icoon: 'calendar-days', naam: t('Тиждень починається', 'De week begint op'), sub: h(t('для звітів, розкладів і календаря сміття', 'voor rapporten, roosters en de afvalkalender')),
          orgaan: segment({ label: t('Перший день тижня', 'Eerste dag van de week'), waarde: wo.weekstart, actie: 'sm-stel', gegevens: { pad: 'woning.weekstart', soort: 'week' }, opties: [{ id: 'ma', label: t('понеділок', 'maandag') }, { id: 'zo', label: t('неділя', 'zondag') }] }) }) +
        regel({ k: 'temp', icoon: 'thermometer', naam: t('Температура', 'Temperatuur'), sub: h(t('вітальня зараз: ', 'woonkamer nu: ') + tempTekst),
          orgaan: segment({ label: t('Одиниця температури', 'Eenheid van temperatuur'), waarde: wo.temp, actie: 'sm-stel', gegevens: { pad: 'woning.temp', soort: 'temp' }, opties: [{ id: 'c', label: '°C' }, { id: 'f', label: '°F' }] }) }) +
        regel({ k: 'afstand', icoon: 'route', naam: t('Відстань', 'Afstand'), sub: h(t('запас ходу авто: ', 'bereik van de auto: ') + bereik),
          orgaan: segment({ label: t('Одиниця відстані', 'Eenheid van afstand'), waarde: wo.afstand, actie: 'sm-stel', gegevens: { pad: 'woning.afstand', soort: 'afstand' }, opties: [{ id: 'km', label: t('км', 'km') }, { id: 'mi', label: t('милі', 'mijl') }] }) }) +
        regel({ k: 'valuta', icoon: 'euro', naam: t('Валюта й ціни', 'Valuta en prijzen'), sub: h(t('євро з комою; суми в симуляції — зі словом «приклад»', 'euro met komma; bedragen in de simulatie met het woord ‘voorbeeld’')), orgaan: '<span class="hv-sm-lees">' + HV.icoon('lock', { maat: 's' }) + '<strong>€ 0,24</strong></span>' }) +
        '</div>' });

    // Поверхи й кімнати
    var verdBlokken = ['zolder', 'boven', 'beneden', 'buiten'].map(function (vid) {
      var v = w.verdiepingen.filter(function (x) { return x.id === vid; })[0];
      if (!v) return '';
      var kamers = w.kamers.filter(function (k) { return k.verdieping === vid; });
      return '<div class="hv-sm-verd" data-k="sm-verd-' + vid + '"><div class="hv-sm-verd__kop"><span class="hv-sm-verd__niveau">' + h(vid === 'buiten' ? t('надворі', 'buiten') : t('рівень ', 'niveau ') + v.niveau) + '</span><h3 class="hv-sm-verd__naam">' + h(P(v.naam)) + '</h3><span class="hv-sm-teller">' + kamers.length + '</span>' +
        (lezen ? '' : o.icoonknop({ icoon: 'plus', aria: t('Додати кімнату: ', 'Kamer toevoegen: ') + P(v.naam), actie: 'sm-kamer-nieuw', gegevens: { verdieping: vid }, klas: 'hv-sm-verd__plus' })) + '</div>' +
        '<div class="hv-sm-kamers">' + kamers.map(function (k) {
          var n = HV.kijk.inKamer(k.id).length, prive = sm.privacy.prive.indexOf(k.id) >= 0;
          var temp = HV.kijk.temperatuur(k.id);
          return '<button type="button" class="hv-sm-kamer" data-actie="blad" data-blad="smkamer:' + h(k.id) + '" data-k="sm-kamer-' + h(k.id) + '">' +
            '<span class="hv-sm-kamer__teken">' + HV.icoon(k.icoon, { maat: 's' }) + '</span><span class="hv-sm-kamer__naam">' + h(P(k.naam)) + '</span>' +
            '<span class="hv-sm-kamer__sub"><span class="hv-nb">' + h(n + ' ' + HV.meervoud(n, ['пристрій', 'пристрої', 'пристроїв'], ['apparaat', 'apparaten'])) + '</span>' + (temp && temp.st && temp.st.waarde != null ? ' <span class="hv-nb">· ' + HV.maat(temp.st.waarde, '°C', 1) + '</span>' : '') + '</span>' +
            (prive ? '<span class="hv-sm-kamer__merk">' + HV.icoon('eye-off', { maat: 'maker' }) + h(t('приватна', 'privé')) + '</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }).join('');
    var plan = kaart({ id: 'plan', icoon: 'layers', titel: t('Поверхи й кімнати', 'Verdiepingen en kamers'), teller: aantalKamers,
      uitleg: t('Що станеться: нова кімната з’явиться в «Кімнатах», на плані й у правах людей; перенесена — на іншому поверсі. Пов’язано з: пристрої лишаються у своїй кімнаті. Як повернути: «Повернути» в сповіщенні; порожню нову кімнату можна вилучити.', 'Wat er gebeurt: een nieuwe kamer verschijnt in ‘Kamers’, op de plattegrond en in de rechten van mensen; een verplaatste staat op een andere verdieping. Hangt samen met: apparaten blijven in hun kamer. Terugdraaien: ‘Ongedaan maken’ in de melding; een lege nieuwe kamer kun je verwijderen.'),
      inhoud: '<div class="hv-sm-verdiepingen">' + verdBlokken + '</div>' });

    var afval = kaart({ id: 'afval', icoon: 'trash-2', titel: t('Календар сміття', 'Afvalkalender'),
      rechts: schakelaar({ aan: wo.afval, actie: 'sm-schakel', gegevens: { pad: 'woning.afval', soort: 'afval' }, aria: t('Нагадувати напередодні о 20:00', 'De avond ervoor om 20:00 herinneren'), woordAan: t('нагадує', 'herinnert'), woordUit: t('не нагадує', 'herinnert niet') }),
      zin: h(t('Нагадування напередодні о 20:00 — у застосунку й на стіні. Дати — приклад для Утрехта.', 'Een herinnering de avond ervoor om 20:00 — in de app en op het wandscherm. Data zijn een voorbeeld voor Utrecht.')),
      inhoud: '<ul class="hv-sm-afval">' + AFVAL.map(function (x) { return { x: x, d: volgendeAfval(x, nu) }; }).sort(function (a, b) { return a.d - b.d; }).map(function (r) {
        var dagen = Math.round((r.d - dagBegin(nu)) / DAG);
        return '<li class="hv-sm-afval__rij" data-k="sm-afval-' + r.x.id + '"><span class="hv-sm-afval__teken">' + HV.icoon(r.x.icoon, { maat: 's' }) + '</span><span class="hv-sm-afval__naam">' + h(P(r.x.naam)) + '</span><span class="hv-sm-afval__wanneer">' + h(dagen === 0 ? t('сьогодні', 'vandaag') : dagen === 1 ? t('завтра', 'morgen') : HV.datum(r.d)) + '</span></li>';
      }).join('') + '</ul>' + opgeslagen('afval') });

    var weer = w.weer;
    var weerKaart = kaart({ id: 'weer', icoon: 'cloud-sun', titel: t('Джерело погоди', 'Weerbron'),
      zin: h(t('Зараз: ', 'Nu: ') + HV.getal(weer.temp) + ' °C · ' + t('вітер ', 'wind ') + weer.wind + ' ' + t('м/с', 'm/s') + ' · ' + t('хмарність ', 'bewolking ') + Math.round(weer.bewolking * 100) + ' %'),
      inhoud: '<div class="hv-sm-regels">' + regel({ k: 'weer', icoon: 'satellite-dish', naam: t('Звідки береться прогноз', 'Waar de verwachting vandaan komt'), sub: h(t('прогноз опадів і сонця для поливу, штор і зарядки', 'verwachting van neerslag en zon voor beregening, gordijnen en laden')),
        orgaan: segment({ label: t('Джерело погоди', 'Weerbron'), waarde: wo.weer, actie: 'sm-stel', gegevens: { pad: 'woning.weer', soort: 'weer' }, opties: [{ id: 'knmi', label: 'KNMI' }, { id: 'station', label: t('Метеостанція на даху', 'Weerstation op het dak') }] }) }) + '</div>' +
        (wo.weer === 'station' ? '<p class="hv-sm-noot">' + HV.icoon('info', { maat: 's' }) + '<span>' + h(t('Метеостанції в паспорті дому ще немає: поки її не додано, дім бере дані KNMI й позначає їх «запасне джерело».', 'Er staat nog geen weerstation in het paspoort van het huis: tot het er is, gebruikt het huis KNMI en markeert dat als ‘reservebron’.')) + '</span></p>' : '') });

    var demo = kaart({ id: 'demo', icoon: 'flask-conical', toon: 'sim', titel: t('Демо-дім і справжня оселя', 'Demowoning en het echte huis'),
      zin: h(t('Усе на цій сторінці належить оселі-симуляції. Справжня оселя почне з «Вимкнено» в усіх дозволах; перенесення — окремим майстром.', 'Alles op deze pagina hoort bij het simulatiehuis. Het echte huis begint met ‘Uit’ in alle toestemmingen; overnemen gaat met een aparte wizard.')),
      inhoud: '<div class="hv-knoppen">' + o.knop({ tekst: t('Симулятор і сценарії', 'Simulator en scenario’s'), icoon: 'flask-conical', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-simulator' } }) + o.later(t('«Перенести з симуляції» — пізніше', '‘Overnemen uit simulatie’ — later')) + '</div>' });

    return '<div class="hv-sm hv-sm-woning" data-k="sm-woning">' + leesBanner(ctx) + held +
      '<div class="hv-sm-rooster"><div class="hv-sm-kolom">' + adres + tijd + weerKaart + '</div><div class="hv-sm-kolom">' + plan + afval + demo + '</div></div></div>';
  }

  // Аркуш кімнати: назва, поверх, знак, приватність, ціль температури (через HV.doe).
  HV.blad({
    soort: 'smkamer', vrij: true,
    icoon: function (ctx, id) { var k = HV.staat.kamer(id); return k ? k.icoon : 'layout-grid'; },
    titel: function (ctx, id) { var k = HV.staat.kamer(id); return k ? P(k.naam) : t('Кімната', 'Kamer'); },
    sub: function (ctx, id) { var k = HV.staat.kamer(id); if (!k) return ''; var v = HV.staat.w.verdiepingen.filter(function (x) { return x.id === k.verdieping; })[0]; return v ? P(v.naam) : ''; },
    render: function (ctx, id) {
      var w = ctx.staat, sm = S(w), k = HV.staat.kamer(id);
      if (!k) return o.leeg({ icoon: 'layout-grid', titel: t('Такої кімнати немає', 'Deze kamer bestaat niet'), actie: { tekst: t('До налаштувань дому', 'Naar de woning'), actie: 'ga', gegevens: { naar: 'instellingen-woning' } } });
      var lezen = !magWijzigen();
      var nieuw = sm.nieuweKamers.indexOf(k.id) >= 0, apparaten = HV.kijk.inKamer(k.id);
      var prive = sm.privacy.prive.indexOf(k.id) >= 0;
      var verd = segment({ label: t('Поверх', 'Verdieping'), waarde: k.verdieping, actie: 'sm-kamer', gegevens: { kamer: k.id, veld: 'verdieping' }, klas: 'hv-sm-segment--breed',
        opties: ['zolder', 'boven', 'beneden', 'buiten'].map(function (vid) { var v = w.verdiepingen.filter(function (x) { return x.id === vid; })[0]; return { id: vid, label: P(v.naam) }; }) });
      var iconen = '<div class="hv-sm-iconen" role="radiogroup" aria-label="' + h(t('Знак кімнати', 'Teken van de kamer')) + '">' + KAMER_ICONEN.concat(KAMER_ICONEN.indexOf(k.icoon) < 0 ? [k.icoon] : []).map(function (ic) {
        var gek = ic === k.icoon;
        var icNaam = kamerIcoonNaam(ic);
        return lezen ? (gek ? '<span class="hv-sm-icoon is-gekozen" role="img" aria-label="' + h(icNaam) + '" title="' + h(icNaam) + '">' + HV.icoon(ic) + '</span>' : '') : '<button type="button" role="radio" aria-checked="' + gek + '" class="hv-sm-icoon' + (gek ? ' is-gekozen' : '') + '" data-actie="sm-kamer" data-kamer="' + h(k.id) + '" data-veld="icoon" data-waarde="' + h(ic) + '" aria-label="' + h(icNaam) + '" title="' + h(icNaam) + '">' + HV.icoon(ic) + '</button>';
      }).join('') + '</div>';
      var doelOrgaan = k.doel != null
        ? o.stapper({ actie: lezen ? null : 'sm-kamer-doel', gegevens: { kamer: k.id }, stap: 0.5, label: t('Ціль температури', 'Doeltemperatuur'), waarde: HV.maat(k.doel, '°C', 1), k: 'sm-doel-' + k.id })
        : '<span class="hv-sm-lees">' + h(t('без цілі', 'zonder doel')) + '</span>';
      return '<div class="hv-sm hv-sm-blad" data-k="sm-kamerblad-' + h(k.id) + '">' +
        o.kaart({ inhoud: '<label class="hv-sm-invoer" data-k="sm-in-kamernaam"><span class="hv-sm-invoer__label">' + h(t('Назва кімнати', 'Naam van de kamer')) + '</span><input class="hv-sm-invoer__veld" type="text" data-sm-veld="kamer:' + h(k.id) + '" value="' + h(P(k.naam)) + '"' + (lezen ? ' readonly' : '') + ' spellcheck="false">' + opgeslagen('veld-kamer:' + k.id) + '</label>' +
          '<div class="hv-sm-veldkop">' + h(t('Поверх', 'Verdieping')) + '</div>' + verd + opgeslagen('kamer-verdieping-' + k.id) +
          '<div class="hv-sm-veldkop">' + h(t('Знак', 'Teken')) + '</div>' + iconen }) +
        o.kaart({ inhoud: '<div class="hv-sm-regels">' +
          regel({ k: 'kdoel', icoon: 'thermometer', naam: t('Ціль температури', 'Doeltemperatuur'), sub: h(t('надсилається термостату кімнати як дія з журналом', 'gaat naar de thermostaat van de kamer, als actie in het logboek')), orgaan: doelOrgaan }) +
          regel({ k: 'kprive-' + k.id, icoon: 'eye-off', naam: t('Приватна кімната', 'Privékamer'), sub: h(t('інші ролі й агенти не бачать її станів та історії', 'andere rollen en agenten zien haar toestand en geschiedenis niet')),
            orgaan: schakelaar({ aan: prive, actie: 'sm-prive', gegevens: { kamer: k.id }, aria: t('Приватна кімната', 'Privékamer'), woordAan: t('приватна', 'privé'), woordUit: t('для всіх', 'voor iedereen') }) }) + '</div>' }) +
        o.kaart({ titel: t('Пристрої тут', 'Apparaten hier'), inhoud: apparaten.length ? '<div class="hv-rijen">' + apparaten.slice(0, 8).map(function (a) { return o.rij({ icoon: (HV.paspoort.soorten[a.soort] || {}).icoon || 'circle', naam: P(a.naam), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }); }).join('') + '</div>' + (apparaten.length > 8 ? '<p class="hv-sm-noot">' + h(t('і ще ', 'en nog ') + (apparaten.length - 8)) + '</p>' : '')
          : o.leeg({ icoon: 'cpu', titel: t('Пристроїв ще немає', 'Nog geen apparaten'), tekst: t('Пристрій додає майстер у «Інтеграціях».', 'Een apparaat voeg je toe met de wizard onder ‘Integraties’.') }) }) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити кімнату', 'Kamer openen'), icoon: 'arrow-right', soort: 'hoofd', actie: 'ga', gegevens: { naar: 'kamers-kamer-' + k.id } }) +
        (nieuw && !apparaten.length && !lezen ? o.knop({ tekst: t('Вилучити порожню кімнату', 'Lege kamer verwijderen'), icoon: 'trash-2', soort: 'stil', actie: 'sm-kamer-weg', gegevens: { kamer: k.id } }) : '') + '</div></div>';
    }
  });

  // ═════════════════════════ 2. Люди й доступ / Mensen en toegang ═════════════════════════
  function mensen(ctx) {
    if (ctx.route.object) return persoonPagina(ctx, ctx.route.object);
    var w = ctx.staat, sm = S(w);
    var lezen = !magWijzigen();
    var actief = w.mensen.filter(function (m) { return !sm.mensen[m.id] || !sm.mensen[m.id].ingetrokken; });
    var thuis = actief.filter(function (m) { return m.thuis; }).length;
    var wacht = sm.uitnodigingen.filter(function (u) { return u.stand === 'verstuurd'; });
    var gasten = actief.filter(function (m) { return m.rol === 'gast'; });
    var held = kop({ id: 'mensen', icoon: 'users', toon: 'koud', boven: t('Система · Люди й доступ', 'Systeem · Mensen en toegang'),
      zin: t('У домі ', 'In huis: ') + actief.length + ' ' + HV.meervoud(actief.length, ['людина', 'людини', 'людей'], ['persoon', 'mensen']) + t(', удома зараз ', ', nu thuis: ') + thuis,
      sub: h(t('Ролі визначають, що можна; кімнати й строк звужують. Агент ніколи не має більше прав, ніж людина, від імені якої діє.', 'Rollen bepalen wat mag; kamers en termijn maken het smaller. Een agent heeft nooit meer rechten dan de persoon namens wie hij werkt.')),
      chips: ROLLEN.map(function (r) { var n = actief.filter(function (m) { return m.rol === r; }).length; return n ? o.chip({ icoon: ROL_ICOON[r], tekst: P(ROL_NAAM[r]) + ' · ' + n }) : ''; }).join('') +
        (gasten.length ? o.chip({ icoon: 'timer', toon: 'let-op', tekst: t('гість: ', 'gast: ') + termijnTekst(sm.mensen[gasten[0].id].tot || w.tijd) }) : '') +
        (wacht.length ? o.chip({ icoon: 'mail', tekst: t('запрошень очікує: ', 'uitnodigingen open: ') + wacht.length }) : ''),
      acties: o.knop({ tekst: t('Запросити людину', 'Iemand uitnodigen'), icoon: 'user-plus', soort: 'hoofd', actie: lezen ? null : 'sm-uitnodigen', uit: lezen }) });

    var lijst = kaart({ id: 'lijst', icoon: 'users', titel: t('Люди', 'Mensen'), teller: w.mensen.length,
      inhoud: '<ul class="hv-sm-mensen">' + w.mensen.map(function (m) {
        var x = sm.mensen[m.id] || {};
        var kamers = x.kamers ? x.kamers.length + ' ' + HV.meervoud(x.kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']) : t('усі кімнати', 'alle kamers');
        var status = x.ingetrokken ? '<span class="hv-sm-status is-uit">' + HV.icoon('ban', { maat: 's' }) + h(t('доступ відкликано', 'toegang ingetrokken')) + '</span>'
          : x.tot ? '<span class="hv-sm-status' + (x.tot < w.tijd ? ' is-uit' : ' is-let-op') + '">' + HV.icoon('timer', { maat: 's' }) + h(termijnTekst(x.tot)) + '</span>' : '';
        return '<li data-k="sm-mens-' + h(m.id) + '"><button type="button" class="hv-sm-mens' + (x.ingetrokken ? ' is-ingetrokken' : '') + '" data-actie="ga" data-naar="instellingen-mensen-' + h(m.id) + '">' + avatar(m) +
          '<span class="hv-sm-mens__tekst"><span class="hv-sm-mens__naam">' + h(P(m.naam)) + (HV.mens().id === m.id ? '<span class="hv-sm-ik">' + h(t('це ви', 'dit ben jij')) + '</span>' : '') + '</span>' +
          '<span class="hv-sm-mens__sub"><span class="hv-sm-aanwezig' + (m.thuis ? ' is-thuis' : '') + (m.zeker !== 'zeker' ? ' is-onzeker' : '') + '"></span>' + h(aanwezigWoord(m)) + ' · ' + h(kamers) + '</span></span>' +
          '<span class="hv-sm-mens__rechts"><span class="hv-sm-rol hv-sm-rol--' + h(m.rol) + '">' + HV.icoon(ROL_ICOON[m.rol], { maat: 's' }) + h(P(ROL_NAAM[m.rol])) + '</span>' + status + '</span>' +
          HV.icoon('chevron-right', { maat: 's', klas: 'hv-sm-mens__pijl' }) + '</button></li>';
      }).join('') + '</ul>' });

    var uitn = kaart({ id: 'uitnodigingen', icoon: 'mail', titel: t('Запрошення', 'Uitnodigingen'), teller: wacht.length || null,
      uitleg: t('Що станеться: людина отримає посилання; доступ почнеться лише після входу з її обліковим записом. Пов’язано з: кожне запрошення — запис «Доступ до дому» в Журналі. Як повернути: «Відкликати» — посилання перестане діяти одразу.', 'Wat er gebeurt: de persoon krijgt een link; toegang begint pas na aanmelden met een eigen account. Hangt samen met: elke uitnodiging is een regel ‘Toegang tot het huis’ in het logboek. Terugdraaien: ‘Intrekken’ — de link werkt meteen niet meer.'),
      inhoud: sm.uitnodigingen.length ? '<ul class="hv-sm-uitn">' + sm.uitnodigingen.map(function (u) {
        var stand = { verstuurd: ['надіслано', 'verstuurd'], ingetrokken: ['відкликано', 'ingetrokken'], aanvaard: ['прийнято', 'aanvaard'] }[u.stand];
        return '<li class="hv-sm-uitn__rij is-' + u.stand + '" data-k="sm-uitn-' + u.id + '"><span class="hv-sm-uitn__teken">' + HV.icoon(u.stand === 'aanvaard' ? 'user-check' : u.stand === 'ingetrokken' ? 'mail-x' : 'mail', { maat: 's' }) + '</span>' +
          '<div class="hv-sm-uitn__tekst"><p class="hv-sm-uitn__naam">' + h(P(u.naam)) + ' · ' + h(P(ROL_NAAM[u.rol])) + '</p><p class="hv-sm-uitn__sub">' + h(P(stand) + ' ' + HV.oud(w.tijd - u.sinds) + t(' тому', ' geleden') + ' · ' + u.kamers.length + ' ' + HV.meervoud(u.kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']) + (u.tot ? ' · ' + t('доступ до ', 'toegang tot ') + HV.datumKort(u.tot) : '')) + '</p></div>' +
          (u.stand === 'verstuurd' && !lezen ? '<div class="hv-sm-uitn__acties">' + o.knop({ tekst: t('Прийнято (симуляція)', 'Aanvaard (simulatie)'), icoon: 'flask-conical', klein: true, soort: 'stil', actie: 'sm-uitn', gegevens: { id: u.id, doe: 'aanvaard' } }) +
            o.knop({ tekst: t('Надіслати ще раз', 'Opnieuw sturen'), icoon: 'send', klein: true, soort: 'stil', actie: 'sm-uitn', gegevens: { id: u.id, doe: 'opnieuw' } }) + o.knop({ tekst: t('Відкликати', 'Intrekken'), icoon: 'x', klein: true, actie: 'sm-uitn', gegevens: { id: u.id, doe: 'intrekken' } }) + '</div>' : '') + '</li>';
      }).join('') + '</ul>' : o.leeg({ icoon: 'mail', titel: t('Запрошень немає', 'Geen uitnodigingen'), tekst: t('Запросіть мешканця, дитину чи гостя на строк.', 'Nodig een bewoner, kind of gast voor een termijn uit.'), actie: lezen ? null : { tekst: t('Запросити', 'Uitnodigen'), icoon: 'user-plus', actie: 'sm-uitnodigen' } }) });

    var aanwezig = kaart({ id: 'aanwezig', icoon: 'radar', titel: t('Як дім знає, хто вдома', 'Hoe het huis weet wie er thuis is'),
      zin: h(t('Дім поєднує кілька ознак і завжди каже, наскільки впевнений. Надійного сигналу «вдома» немає, тому присутність лише посилює захист і ніколи його не знімає.', 'Het huis combineert een paar signalen en zegt altijd hoe zeker het is. Een betrouwbaar signaal ‘thuis’ bestaat niet; aanwezigheid versterkt de beveiliging alleen en zet haar nooit uit.')),
      inhoud: '<div class="hv-sm-bronnen">' + [['wifi', ['Телефон у домашньому Wi-Fi', 'Telefoon op het wifi thuis'], ['впевнено, але із запізненням до 5 хв', 'zeker, maar tot 5 min vertraging']], ['map-pinned', ['Геозона телефона', 'Geozone van de telefoon'], ['потрібен дозвіл «Місцезнаходження»', 'vraagt de toestemming ‘Locatie’']], ['key-round', ['Особистий код на дверях', 'Persoonlijke code bij de deur'], ['точно в момент входу', 'precies bij binnenkomst']], ['hand', ['Вручну: «Я вдома» · «Йду»', 'Handmatig: ‘Ik ben thuis’ · ‘Ik ga weg’'], ['найвища вага, діє до наступної ознаки', 'zwaarst, geldt tot het volgende signaal']]].map(function (b) {
        return '<div class="hv-sm-bron" data-k="sm-bron-' + b[0] + '"><span class="hv-sm-bron__teken">' + HV.icoon(b[0], { maat: 's' }) + '</span><p class="hv-sm-bron__naam">' + h(P(b[1])) + '</p><p class="hv-sm-bron__sub">' + h(P(b[2])) + '</p></div>';
      }).join('') + '</div>' });

    return '<div class="hv-sm hv-sm-mensen-pag" data-k="sm-mensen">' + leesBanner(ctx) + held +
      '<div class="hv-sm-rooster"><div class="hv-sm-kolom">' + lijst + '</div><div class="hv-sm-kolom">' + uitn + aanwezig + '</div></div>' + rolMatrix(ctx) + '</div>';
  }

  /** Матриця «роль × область»: власник змінює клітинки інших ролей; зміни діють на HV.doe (обгортка rolMag). */
  function rolMatrix(ctx) {
    var sm = S(), lezen = !magWijzigen();
    var open = HV.ui.lees('sm-rol-open', null); // 'gebied|rol'
    var breed = ctx.profiel.id === 'bureau' || ctx.profiel.id === 'breed' || ctx.profiel.id === 'ultrabreed';
    var cel = function (g, r) {
      if (r === 'eigenaar') return '<span class="hv-sm-rcel is-alles is-vast">' + HV.icoon('crown', { maat: 's' }) + h(t('усе', 'alles')) + '</span>';
      if (g.vast) return '<span class="hv-sm-rcel is-vast">' + h(P(VAST_RECHT[g.id][r])) + '</span>';
      var v = sm.rechten[r][g.id], d = RECHT.filter(function (x) { return x.id === v; })[0];
      var isOpen = open === g.id + '|' + r;
      var binnen = HV.icoon(d.icoon, { maat: 's' }) + '<span>' + h(P(d.naam)) + '</span>';
      if (lezen) return '<span class="hv-sm-rcel is-' + v + '">' + binnen + '</span>';
      return '<button type="button" class="hv-sm-rcel is-' + v + (isOpen ? ' is-open' : '') + '" aria-expanded="' + isOpen + '" data-actie="ui" data-naam="sm-rol-open" data-waarde="' + (isOpen ? '' : g.id + '|' + r) + '" aria-label="' + h(P(g.naam) + ' · ' + P(ROL_NAAM[r]) + ': ' + P(d.naam)) + '">' + binnen + '</button>';
    };
    var editor = function (g, r) {
      var v = sm.rechten[r][g.id];
      return '<div class="hv-sm-reditor" data-k="sm-reditor-' + g.id + '-' + r + '"><p class="hv-sm-reditor__kop">' + HV.icoon(ROL_ICOON[r], { maat: 's' }) + h(P(ROL_NAAM[r]) + ' · ' + P(g.naam)) + '</p>' +
        o.segment({ label: P(g.naam) + ' · ' + P(ROL_NAAM[r]), waarde: v, actie: 'sm-recht', gegevens: { gebied: g.id, rol: r }, klas: 'hv-sm-segment hv-sm-segment--breed', opties: RECHT.map(function (x) { return { id: x.id, label: P(x.naam), icoon: x.icoon }; }) }) +
        '<p class="hv-sm-reditor__uitleg">' + h(P(RECHT.filter(function (x) { return x.id === v; })[0].uitleg)) + (g.id === 'camera' ? h(t(' · перегляд кадрів перевіряє розділ «Безпека».', ' · het bekijken van beelden controleert ‘Beveiliging’.')) : '') + '</p>' + opgeslagen('recht-' + g.id + '-' + r) + '</div>';
    };
    var inhoud;
    if (breed) {
      inhoud = '<div class="hv-sm-tabelvak"><table class="hv-sm-rtabel"><thead><tr><th scope="col">' + h(t('Область', 'Gebied')) + '</th>' + ROLLEN.map(function (r) {
        return '<th scope="col"><span class="hv-sm-rol hv-sm-rol--' + r + '">' + HV.icoon(ROL_ICOON[r], { maat: 's' }) + h(P(ROL_NAAM[r])) + '</span></th>';
      }).join('') + '</tr></thead><tbody>' + GEBIEDEN.map(function (g) {
        var rij = '<tr data-k="sm-rrij-' + g.id + '"' + (g.vast ? ' class="is-vast"' : '') + '><th scope="row"><span class="hv-sm-rnaam">' + HV.icoon(g.icoon, { maat: 's' }) + h(P(g.naam)) + (g.vast ? HV.icoon('lock', { maat: 'maker', klas: 'hv-sm-rnaam__slot' }) : '') + '</span></th>' + ROLLEN.map(function (r) { return '<td>' + cel(g, r) + '</td>'; }).join('') + '</tr>';
        var r2 = open && open.split('|')[0] === g.id ? open.split('|')[1] : null;
        if (r2) rij += '<tr class="hv-sm-rtabel__open" data-k="sm-ropen-' + g.id + '"><td colspan="5">' + editor(g, r2) + '</td></tr>';
        return rij;
      }).join('') + '</tbody></table></div>';
    } else {
      var kies = HV.ui.lees('sm-rol-kies', 'kind');
      inhoud = '<div class="hv-filter hv-sm-pillen" role="group" aria-label="' + h(t('Роль', 'Rol')) + '">' + ROLLEN.map(function (r) {
        return o.chip({ icoon: ROL_ICOON[r], tekst: P(ROL_NAAM[r]), filter: true, gekozen: kies === r, actie: 'ui', gegevens: { naam: 'sm-rol-kies', waarde: r }, k: 'sm-rk-' + r });
      }).join('') + '</div><p class="hv-sm-kaart__zin">' + h(P(ROL_ZIN[kies])) + '</p><div class="hv-sm-rlijst">' + GEBIEDEN.map(function (g) {
        var orgaan;
        if (kies === 'eigenaar') orgaan = '<span class="hv-sm-rcel is-alles is-vast">' + HV.icoon('crown', { maat: 's' }) + h(t('усе', 'alles')) + '</span>';
        else if (g.vast) orgaan = '<span class="hv-sm-rcel is-vast">' + h(P(VAST_RECHT[g.id][kies])) + '</span>';
        else orgaan = segment({ label: P(g.naam), waarde: sm.rechten[kies][g.id], actie: 'sm-recht', gegevens: { gebied: g.id, rol: kies }, klas: 'hv-sm-segment--breed', opties: RECHT.map(function (x) { return { id: x.id, label: P(x.naam) }; }) });
        return '<div class="hv-sm-rlijst__rij" data-k="sm-rl-' + g.id + '"><p class="hv-sm-rnaam">' + HV.icoon(g.icoon, { maat: 's' }) + h(P(g.naam)) + (g.vast ? HV.icoon('lock', { maat: 'maker', klas: 'hv-sm-rnaam__slot' }) : '') + '</p>' + orgaan + opgeslagen('recht-' + g.id + '-' + kies) + '</div>';
      }).join('') + '</div>';
    }
    var gewijzigd = 0;
    ['bewoner', 'kind', 'gast'].forEach(function (r) { Object.keys(STANDAARD_RECHTEN[r]).forEach(function (g) { if (sm.rechten[r][g] !== STANDAARD_RECHTEN[r][g]) gewijzigd++; }); });
    return kaart({ id: 'rolmatrix', klas: 'hv-sm-kaart--vol', icoon: 'grid-3x3', titel: t('Що може кожна роль', 'Wat elke rol mag'),
      uitleg: t('Що станеться: зміна клітинки діє одразу на всі дії людей цієї ролі — і на екранах, і в Команді. Пов’язано з: небезпечні й критичні дії й далі просять рейку утримання й підтвердження входу; кімнати людини звужують права ще більше. Як повернути: «Повернути» в сповіщенні або «Скинути до типових».', 'Wat er gebeurt: een gewijzigde cel geldt meteen voor alle acties van mensen met deze rol — op schermen en in de Opdracht. Hangt samen met: gevaarlijke en kritieke acties vragen nog steeds de houdrail en bevestiging van aanmelding; de kamers van een persoon maken het nog smaller. Terugdraaien: ‘Ongedaan maken’ in de melding of ‘Standaard herstellen’.'),
      rechts: (gewijzigd && !lezen ? o.knop({ tekst: t('Скинути до типових', 'Standaard herstellen'), icoon: 'rotate-ccw', klein: true, soort: 'stil', actie: 'sm-recht-herstel' }) : '') + (gewijzigd ? '<span class="hv-sm-teller">' + h(t('змінено: ', 'gewijzigd: ') + gewijzigd) + '</span>' : ''),
      zin: h(t('Власник має все й змінює решту. Клітинка — рівень доступу: «Немає · Бачить · Керує · Усе». Рядки з замком визначає платформа.', 'De eigenaar heeft alles en wijzigt de rest. Een cel is het toegangsniveau: ‘Geen · Ziet · Bedient · Alles’. Rijen met een slot bepaalt het platform.')),
      inhoud: inhoud });
  }

  /** Сторінка людини /instellingen/mensen/<persoon>. */
  function persoonPagina(ctx, id) {
    var w = ctx.staat, sm = S(w), m = persoon(id);
    if (!m) return o.leeg({ icoon: 'user-x', titel: t('Такої людини немає', 'Deze persoon bestaat niet'), actie: { tekst: t('До людей', 'Naar de mensen'), icoon: 'arrow-left', actie: 'ga', gegevens: { naar: 'instellingen-mensen' } } });
    var x = sm.mensen[m.id];
    var lezen = !magWijzigen(), ik = HV.mens().id === m.id;
    var laatsteEigenaar = m.rol === 'eigenaar' && eigenaars().length <= 1;
    var terug = '<div class="hv-sm-terug">' + o.knop({ tekst: t('Усі люди', 'Alle mensen'), icoon: 'arrow-left', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'instellingen-mensen' } }) + '</div>';
    var held = '<header class="hv-sm-kop hv-sm-kop--mens hv-toon-koud" data-k="sm-kop-mens-' + h(m.id) + '">' + avatar(m, 'groot') +
      '<div class="hv-sm-kop__tekst"><p class="hv-sm-kop__boven">' + h(t('Людина', 'Persoon')) + (ik ? ' · ' + h(t('це ви', 'dit ben jij')) : '') + '</p><h1 class="hv-sm-kop__zin">' + h(P(m.naam)) + '</h1>' +
      '<p class="hv-sm-kop__sub"><span class="hv-sm-rol hv-sm-rol--' + h(m.rol) + '">' + HV.icoon(ROL_ICOON[m.rol], { maat: 's' }) + h(P(ROL_NAAM[m.rol])) + '</span> <span class="hv-sm-aanwezig' + (m.thuis ? ' is-thuis' : '') + '"></span>' + h(aanwezigWoord(m)) +
      (x.ingetrokken ? ' · <strong>' + h(t('доступ відкликано', 'toegang ingetrokken')) + '</strong>' : '') + '</p></div></header>';

    var rolKaart = kaart({ id: 'rol', icoon: 'id-card', titel: t('Роль', 'Rol'),
      inhoud: segment({ label: t('Роль', 'Rol'), waarde: m.rol, actie: 'sm-rol', gegevens: { persoon: m.id }, klas: 'hv-sm-segment--breed', lezen: laatsteEigenaar,
        opties: ROLLEN.map(function (r) { return { id: r, label: P(ROL_NAAM[r]), icoon: ROL_ICOON[r] }; }) }) + opgeslagen('rol-' + m.id) +
        '<p class="hv-sm-kaart__zin">' + h(P(ROL_ZIN[m.rol])) + '</p>' +
        (laatsteEigenaar ? '<p class="hv-sm-noot">' + HV.icoon('crown', { maat: 's' }) + '<span>' + h(t('Це єдиний власник: роль не можна змінити, доки немає другого власника.', 'Dit is de enige eigenaar: de rol kan niet veranderen zolang er geen tweede eigenaar is.')) + '</span></p>' : '') });

    var alle = !x.kamers;
    var kamerChips = '<div class="hv-filter hv-sm-pillen" role="group" aria-label="' + h(t('Кімнати', 'Kamers')) + '">' +
      o.chip({ icoon: 'house', tekst: t('Усі кімнати', 'Alle kamers'), filter: true, gekozen: alle, actie: lezen ? null : 'sm-mens-kamer', gegevens: { persoon: m.id, kamer: '*' }, k: 'sm-mk-alle' }) +
      alleKamers().map(function (k) { var aan = alle || x.kamers.indexOf(k.id) >= 0; return o.chip({ icoon: k.icoon, tekst: P(k.naam), filter: true, gekozen: aan && !alle, klas: aan ? 'is-binnen' : '', actie: lezen ? null : 'sm-mens-kamer', gegevens: { persoon: m.id, kamer: k.id }, k: 'sm-mk-' + k.id }); }).join('') + '</div>';
    var kamerKaart = kaart({ id: 'kamers', icoon: 'door-open', titel: t('Кімнати', 'Kamers'), teller: alle ? t('усі', 'alle') : x.kamers.length,
      uitleg: t('Що станеться: дії людини поза цими кімнатами не виконаються — з поясненням «кімната недоступна». Пов’язано з: роль задає, що саме можна в дозволених кімнатах. Як повернути: «Усі кімнати».', 'Wat er gebeurt: acties van deze persoon buiten deze kamers worden niet uitgevoerd — met de uitleg ‘kamer niet toegankelijk’. Hangt samen met: de rol bepaalt wat er in de toegestane kamers mag. Terugdraaien: ‘Alle kamers’.'),
      inhoud: kamerChips + opgeslagen('kamers-' + m.id) });

    var termijn = x.tot ? kaart({ id: 'termijn', icoon: 'timer', toon: x.tot < w.tijd ? 'alarm' : 'let-op', titel: t('Строк доступу', 'Termijn van toegang'),
      zin: h(x.tot < w.tijd ? t('Строк минув ', 'Termijn verlopen op ') + HV.datum(x.tot) + ', ' + HV.tijd(x.tot) + t(': дії недоступні.', ': acties zijn niet beschikbaar.') : t('Доступ до ', 'Toegang tot ') + HV.datum(x.tot) + ', ' + HV.tijd(x.tot) + ' · ' + termijnTekst(x.tot)),
      inhoud: (x.tot > w.tijd ? '<div class="hv-sm-aftelrij">' + o.aftel({ rest: Math.max(0, (x.tot - w.tijd) / 60000), totaal: 7 * 1440, icoon: 'timer', toon: 'warm' }) + '</div>' : '') +
        (lezen ? '' : '<div class="hv-knoppen">' + [[1, t('+1 день', '+1 dag')], [3, t('+3 дні', '+3 dagen')], [7, t('+7 днів', '+7 dagen')]].map(function (d) { return o.knop({ tekst: d[1], icoon: 'calendar-plus', klein: true, actie: 'sm-termijn', gegevens: { persoon: m.id, dagen: d[0] } }); }).join('') +
          (x.tot > w.tijd ? o.knop({ tekst: t('Завершити зараз', 'Nu beëindigen'), icoon: 'square', klein: true, soort: 'stil', actie: 'sm-termijn', gegevens: { persoon: m.id, dagen: 0 } }) : '') + '</div>') + opgeslagen('termijn-' + m.id) })
      : kaart({ id: 'termijn', icoon: 'infinity', titel: t('Строк доступу', 'Termijn van toegang'), zin: h(t('Безстроково. Строк додають гостям і обслузі.', 'Zonder termijn. Gasten en hulp krijgen een termijn.')),
        inhoud: lezen || m.rol === 'eigenaar' ? '' : '<div class="hv-knoppen">' + o.knop({ tekst: t('Задати строк 7 днів', 'Termijn van 7 dagen'), icoon: 'calendar-clock', klein: true, actie: 'sm-termijn', gegevens: { persoon: m.id, dagen: 7 } }) + '</div>' });

    var bronLezen = !(isEigenaar() || ik) || ogen() !== rol();
    var bronnen = kaart({ id: 'bronnen', icoon: 'radar', titel: t('Як дім знає, що ' + (ik ? 'ви' : P(m.naam)) + ' вдома', 'Hoe het huis weet dat ' + (ik ? 'jij' : P(m.naam)) + ' thuis ' + (ik ? 'bent' : 'is')),
      rechts: segment({ label: t('Позначити вручну', 'Handmatig markeren'), waarde: m.thuis ? 'thuis' : 'weg', actie: 'sm-aanwezig', gegevens: { persoon: m.id }, wie: 'zelf', zelf: m.id, opties: [{ id: 'thuis', label: t('Вдома', 'Thuis'), icoon: 'log-in' }, { id: 'weg', label: t('Не вдома', 'Weg'), icoon: 'log-out' }] }),
      inhoud: '<div class="hv-sm-regels">' + [['wifi', 'wifi', ['Телефон у домашньому Wi-Fi', 'Telefoon op het wifi thuis']], ['zone', 'map-pinned', ['Геозона телефона', 'Geozone van de telefoon']], ['code', 'key-round', ['Особистий код на дверях', 'Persoonlijke code bij de deur']], ['hand', 'hand', ['Кнопки «Я вдома» й «Йду»', 'Knoppen ‘Ik ben thuis’ en ‘Ik ga weg’']]].map(function (b) {
        var aan = !!x.bronnen[b[0]];
        var sub = b[0] === 'zone' && !S().privacy.locatie ? '<span class="hv-sm-let">' + h(t('не діє: дозвіл «Місцезнаходження» вимкнено', 'werkt niet: toestemming ‘Locatie’ staat uit')) + '</span>' : '';
        return regel({ k: 'bron-' + m.id + '-' + b[0], icoon: b[1], naam: P(b[2]), sub: sub, orgaan: schakelaar({ aan: aan, lezen: bronLezen, actie: 'sm-schakel', gegevens: { pad: 'mensen.' + m.id + '.bronnen.' + b[0], soort: 'bron', wie: 'zelf', zelf: m.id }, aria: P(b[2]) }) });
      }).join('') + '</div>' });

    var TOE = [
      ['aanwezigheid', 'house', ['Агенти можуть знати, що я вдома', 'Agenten mogen weten dat ik thuis ben'], ['лише узагальнено: «хтось удома»', 'alleen algemeen: ‘er is iemand thuis’']],
      ['locatie', 'map-pin', ['Точне місце для інших дорослих', 'Precieze locatie voor andere volwassenen'], ['видно в «Гараж → Мапа»', 'zichtbaar in ‘Garage → Kaart’']],
      ['camera', 'cctv', ['Камери в домі, коли я вдома', 'Camera’s binnen terwijl ik thuis ben'], ['типово вимкнено: «Приватність удома»', 'standaard uit: ‘Privé thuis’']],
      ['wolk', 'cloud', ['Мої дані хмарній моделі', 'Mijn gegevens naar een cloudmodel'], ['лише після аркуша «Що буде надіслано»', 'pas na het blad ‘Wat wordt verzonden’']]
    ];
    var toestemming = kaart({ id: 'toestemming', icoon: 'hand-heart', titel: t('Згоди', 'Toestemmingen'),
      zin: h(t('Згоду дає лише сама людина (для дитини — власник). Кожна зміна — запис у Журналі.', 'Toestemming geeft alleen de persoon zelf (voor een kind de eigenaar). Elke wijziging komt in het logboek.')),
      inhoud: '<div class="hv-sm-regels">' + TOE.map(function (z) {
        return regel({ k: 'toe-' + m.id + '-' + z[0], icoon: z[1], naam: P(z[2]), sub: h(P(z[3])), orgaan: schakelaar({ aan: !!x.toestemming[z[0]], lezen: bronLezen, actie: 'sm-schakel', gegevens: { pad: 'mensen.' + m.id + '.toestemming.' + z[0], soort: 'toestemming', wie: 'zelf', zelf: m.id }, aria: P(z[2]) }) });
      }).join('') + '</div>' });

    var code = kaart({ id: 'code', icoon: 'key-round', titel: t('Особистий код', 'Persoonlijke code'),
      uitleg: t('Що станеться: код ідентифікує людину на панелі в домі; у Журналі стоїть її знак. Пов’язано з: кодом можна лише зняти охорону й приглушити дим — двері він не відмикає й «Завжди» не вмикає. Як повернути: «Відкликати» — код перестане діяти одразу.', 'Wat er gebeurt: de code herkent de persoon op een paneel in huis; in het logboek staat haar teken. Hangt samen met: met de code kun je alleen het alarm uitzetten en rook dempen — de deur gaat er niet mee open en ‘Altijd’ niet aan. Terugdraaien: ‘Intrekken’ — de code werkt meteen niet meer.'),
      inhoud: '<div class="hv-sm-code"><span class="hv-sm-code__stippen" aria-hidden="true">' + (x.code ? '●●●●●●' : '○○○○○○') + '</span><p class="hv-sm-code__tekst">' + h(x.code ? t('Задано ', 'Ingesteld op ') + HV.datumKort(x.code.gezet) + t(' · щонайменше 6 цифр · 3 помилки — сповіщення дорослим', ' · minstens 6 cijfers · 3 fouten — melding aan volwassenen') : t('Коду немає: на панелі в домі людина діє лише кодом панелі.', 'Geen code: op een paneel in huis werkt deze persoon alleen met de paneelcode.')) + '</p></div>' +
        (x.code && x.code.nieuw && Date.now() - x.code.nieuw.echt < 20000 && (isEigenaar() || ik) ? '<p class="hv-sm-code__eenmalig" role="status">' + HV.icoon('eye', { maat: 's' }) + h(t('Новий код (показано один раз): ', 'Nieuwe code (één keer getoond): ')) + '<strong>' + h(x.code.nieuw.cijfers) + '</strong></p>' : '') +
        (bronLezen ? '' : '<div class="hv-knoppen">' + o.knop({ tekst: x.code ? t('Змінити код', 'Code wijzigen') : t('Задати код', 'Code instellen'), icoon: 'key-round', klein: true, actie: 'sm-code', gegevens: { persoon: m.id, doe: 'zet' } }) +
          (x.code ? o.knop({ tekst: t('Відкликати', 'Intrekken'), icoon: 'x', klein: true, soort: 'stil', actie: 'sm-code', gegevens: { persoon: m.id, doe: 'weg' } }) : '') + '</div>') });

    var ziet = kaart({ id: 'ziet', icoon: 'eye', titel: t('Що бачить ' + P(m.naam), 'Wat ' + P(m.naam) + ' ziet'),
      inhoud: '<ul class="hv-sm-ziet">' + GEBIEDEN.filter(function (g) { return !g.vast; }).map(function (g) {
        var v = m.rol === 'eigenaar' ? 'alles' : S().rechten[m.rol][g.id], d = RECHT.filter(function (r) { return r.id === v; })[0];
        return '<li class="hv-sm-ziet__rij is-' + v + '" data-k="sm-ziet-' + g.id + '">' + HV.icoon(g.icoon, { maat: 's' }) + '<span>' + h(P(g.naam)) + '</span><strong>' + HV.icoon(d.icoon, { maat: 's' }) + h(P(d.naam)) + '</strong></li>';
      }).join('') + '</ul><p class="hv-sm-noot">' + HV.icoon('door-open', { maat: 's' }) + '<span>' + h(alle ? t('У всіх кімнатах.', 'In alle kamers.') : t('Лише в кімнатах: ', 'Alleen in de kamers: ') + x.kamers.map(kamerNaam).join(', ') + '.') + '</span></p>' });

    var gevaar = kaart({ id: 'gevaar', icoon: 'triangle-alert', toon: 'alarm', klas: 'hv-sm-kaart--gevaar', titel: t('Доступ і сеанси', 'Toegang en sessies'),
      inhoud: '<div class="hv-sm-regels">' + regel({ k: 'sessies', icoon: 'monitor-smartphone', naam: t('Сеанси й ключі доступу', 'Sessies en toegangssleutels'), sub: h(t('керуються на id.tarasevych.com', 'beheer je op id.tarasevych.com')), orgaan: o.knop({ tekst: t('Відкрити', 'Openen'), icoon: 'external-link', klein: true, soort: 'stil', actie: 'sm-sessies', gegevens: { persoon: m.id } }) }) +
        regel({ k: 'intrekken', icoon: x.ingetrokken ? 'user-check' : 'user-x', naam: x.ingetrokken ? t('Відновити доступ', 'Toegang herstellen') : t('Відкликати доступ', 'Toegang intrekken'),
          sub: h(laatsteEigenaar ? t('Останнього власника вилучити не можна.', 'De laatste eigenaar kan niet worden verwijderd.') : x.ingetrokken ? t('Історія збережена; людина знову зможе увійти.', 'De geschiedenis blijft; de persoon kan weer aanmelden.') : t('Критична дія: рейка й підтвердження входу. Історія лишається в Журналі.', 'Kritieke actie: rail en bevestiging van aanmelding. De geschiedenis blijft in het logboek.')),
          merk: x.ingetrokken ? '' : ' ' + o.risico('kritiek'),
          orgaan: lezen || laatsteEigenaar || ik ? '' : o.knop({ tekst: x.ingetrokken ? t('Відновити', 'Herstellen') : t('Відкликати…', 'Intrekken…'), icoon: x.ingetrokken ? 'user-check' : 'user-x', klein: true, soort: x.ingetrokken ? 'gewoon' : 'gevaar', actie: 'sm-intrekken', gegevens: { persoon: m.id } }) }) + '</div>' });

    return '<div class="hv-sm hv-sm-persoon" data-k="sm-persoon-' + h(m.id) + '">' + leesBanner(ctx) + terug + held +
      '<div class="hv-sm-rooster"><div class="hv-sm-kolom">' + rolKaart + kamerKaart + termijn + ziet + '</div><div class="hv-sm-kolom">' + bronnen + toestemming + code + gevaar + '</div></div></div>';
  }

  // Майстер запрошення: хто → роль → кімнати → строк і перегляд «Що побачить…».
  var VOORBEELD_NAMEN = [['Марта', 'Marta'], ['Майстер Пим', 'Monteur Pim'], ['Сусідка Анне', 'Buurvrouw Anne']];
  function uitnStaat() { return HV.ui.lees('sm-uitn', null) || { stap: 1, naam: VOORBEELD_NAMEN[0].slice(), rol: 'gast', kamers: ['woonkamer', 'keuken', 'hal', 'badkamer', 'logeerkamer'], termijn: 3 }; }
  HV.blad({
    soort: 'smuitnodigen', vrij: true, icoon: 'user-plus', titel: ['Запросити людину', 'Iemand uitnodigen'],
    sub: function () { var u = uitnStaat(); return t('Крок ', 'Stap ') + u.stap + t(' із 4', ' van 4'); },
    render: function (ctx) {
      var u = uitnStaat(), lijf = '';
      var stappen = [t('Хто', 'Wie'), t('Роль', 'Rol'), t('Кімнати', 'Kamers'), t('Строк і перегляд', 'Termijn en voorbeeld')];
      var balk = '<ol class="hv-sm-stappen" aria-label="' + h(t('Кроки', 'Stappen')) + '">' + stappen.map(function (s, i) { return '<li class="' + (i + 1 === u.stap ? 'is-nu' : i + 1 < u.stap ? 'is-klaar' : '') + '"' + (i + 1 === u.stap ? ' aria-current="step"' : '') + '><span>' + (i + 1 < u.stap ? HV.icoon('check', { maat: 's' }) : (i + 1)) + '</span>' + h(s) + '</li>'; }).join('') + '</ol>';
      if (u.stap === 1) {
        lijf = '<label class="hv-sm-invoer" data-k="sm-in-uitn"><span class="hv-sm-invoer__label">' + h(t('Ім’я', 'Naam')) + '</span><input class="hv-sm-invoer__veld" type="text" data-sm-veld="uitn-naam" value="' + h(P(u.naam)) + '" spellcheck="false"></label>' +
          '<p class="hv-sm-veldkop">' + h(t('Або оберіть', 'Of kies')) + '</p><div class="hv-filter hv-sm-pillen">' + VOORBEELD_NAMEN.map(function (n, i) { return o.chip({ icoon: 'user', tekst: P(n), filter: true, gekozen: P(u.naam) === P(n), actie: 'sm-uitn-zet', gegevens: { veld: 'naam', waarde: i }, k: 'sm-un-' + i }); }).join('') + '</div>' +
          '<p class="hv-sm-noot">' + HV.icoon('shield', { maat: 's' }) + '<span>' + h(t('Посилання діє 48 год і лише для одного входу. Пароль і ключ людина створює сама на id.tarasevych.com.', 'De link werkt 48 u en voor één aanmelding. Wachtwoord en sleutel maakt de persoon zelf op id.tarasevych.com.')) + '</span></p>';
      } else if (u.stap === 2) {
        lijf = '<div class="hv-sm-rolkeus" role="radiogroup" aria-label="' + h(t('Роль', 'Rol')) + '">' + ROLLEN.map(function (r) {
          var gek = u.rol === r;
          return '<button type="button" role="radio" aria-checked="' + gek + '" class="hv-sm-rolkaart' + (gek ? ' is-gekozen' : '') + '" data-actie="sm-uitn-zet" data-veld="rol" data-waarde="' + r + '" data-k="sm-rk2-' + r + '"><span class="hv-sm-rol hv-sm-rol--' + r + '">' + HV.icoon(ROL_ICOON[r], { maat: 's' }) + h(P(ROL_NAAM[r])) + '</span><span class="hv-sm-rolkaart__zin">' + h(P(ROL_ZIN[r])) + '</span>' + (r === 'eigenaar' || r === 'bewoner' ? '<span class="hv-sm-rolkaart__merk">' + o.risico('gevaarlijk') + '</span>' : '') + '</button>';
        }).join('') + '</div>';
      } else if (u.stap === 3) {
        lijf = '<p class="hv-sm-kaart__zin">' + h(t('Де людина зможе керувати. Решта кімнат для неї не існує.', 'Waar de persoon mag bedienen. De andere kamers bestaan voor haar niet.')) + '</p><div class="hv-filter hv-sm-pillen">' + alleKamers().map(function (k) {
          return o.chip({ icoon: k.icoon, tekst: P(k.naam), filter: true, gekozen: u.kamers.indexOf(k.id) >= 0, actie: 'sm-uitn-zet', gegevens: { veld: 'kamer', waarde: k.id }, k: 'sm-uk-' + k.id });
        }).join('') + '</div>';
      } else {
        var w = ctx.staat;
        lijf = '<p class="hv-sm-veldkop">' + h(t('Строк доступу', 'Termijn van toegang')) + '</p>' + o.segment({ label: t('Строк доступу', 'Termijn van toegang'), waarde: u.termijn, actie: 'sm-uitn-zet', gegevens: { veld: 'termijn' }, klas: 'hv-sm-segment hv-sm-segment--breed', opties: [{ id: 1, label: t('24 год', '24 u') }, { id: 3, label: t('3 дні', '3 dagen') }, { id: 7, label: t('7 днів', '7 dagen') }, { id: 30, label: t('30 днів', '30 dagen') }, { id: 0, label: t('без строку', 'geen termijn') }] }) +
          '<div class="hv-sm-voorbeeld" data-k="sm-voorbeeld"><p class="hv-sm-voorbeeld__kop">' + HV.icoon('eye', { maat: 's' }) + h(t('Що побачить ' + P(u.naam), 'Wat ' + P(u.naam) + ' ziet')) + '</p><ul class="hv-sm-ziet">' + GEBIEDEN.filter(function (g) { return !g.vast; }).map(function (g) {
            var v = u.rol === 'eigenaar' ? 'alles' : S().rechten[u.rol][g.id], d = RECHT.filter(function (r) { return r.id === v; })[0];
            return '<li class="hv-sm-ziet__rij is-' + v + '">' + HV.icoon(g.icoon, { maat: 's' }) + '<span>' + h(P(g.naam)) + '</span><strong>' + HV.icoon(d.icoon, { maat: 's' }) + h(P(d.naam)) + '</strong></li>';
          }).join('') + '</ul><p class="hv-sm-noot">' + HV.icoon('door-open', { maat: 's' }) + '<span>' + h(u.kamers.map(kamerNaam).join(', ') || t('жодної кімнати', 'geen enkele kamer')) + (u.termijn ? ' · ' + t('до ', 'tot ') + HV.datum(w.tijd + u.termijn * DAG) : '') + '</span></p></div>' +
          '<div class="hv-sm-gevolgvak">' + o.gevolgRijen(t('Що станеться: ' + P(u.naam) + ' отримає посилання на 48 год; доступ почнеться після входу. Пов’язано з: запис «Доступ до дому» в Журналі отримають усі власники. Як повернути: «Відкликати» в списку запрошень.', 'Wat er gebeurt: ' + P(u.naam) + ' krijgt een link voor 48 u; de toegang begint na het aanmelden. Hangt samen met: alle eigenaars krijgen een regel ‘Toegang tot het huis’ in het logboek. Terugdraaien: ‘Intrekken’ in de lijst met uitnodigingen.')) + '</div>';
      }
      var knoppen = '<div class="hv-knoppen hv-sm-wizardknoppen">' + (u.stap > 1 ? o.knop({ tekst: t('Назад', 'Terug'), icoon: 'arrow-left', actie: 'sm-uitn-stap', gegevens: { stap: u.stap - 1 } }) : o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'sm-uitn-stop' })) +
        (u.stap < 4 ? o.knop({ tekst: t('Далі', 'Verder'), icoon: 'arrow-right', soort: 'hoofd', actie: 'sm-uitn-stap', gegevens: { stap: u.stap + 1 }, uit: u.stap === 3 && !u.kamers.length }) : o.knop({ tekst: t('Надіслати запрошення', 'Uitnodiging versturen'), icoon: 'send', soort: 'hoofd', actie: 'sm-uitn-stuur', k: 'sm-stuur' })) + '</div>';
      return '<div class="hv-sm hv-sm-blad hv-sm-wizard" data-k="sm-wizard">' + balk + o.kaart({ inhoud: lijf }) + knoppen + '</div>';
    }
  });

  // ═════════════════════════ 3. Приватність / Privacy ═════════════════════════
  var DRIE = [
    { id: 'camera', icoon: 'camera', naam: ['Камера', 'Camera'],
      wat: ['Сканування коду сполучення екрана, відео у відповідь на дзвінок у двері.', 'De koppelcode van een scherm scannen, video terug bij de deurbel.'],
      gevolg: ['Що станеться: сайт зможе вмикати камеру цього пристрою — лише після вашого дотику й з позначкою «камера активна». Пов’язано з: дзвінок у двері покаже вас гостю; кадри не зберігаються. Як повернути: вимкніть цей перемикач — діє одразу.', 'Wat er gebeurt: de site kan de camera van dit toestel aanzetten — alleen na jouw tik en met de markering ‘camera actief’. Hangt samen met: bij de deurbel ziet de gast jou; beelden worden niet bewaard. Terugdraaien: zet deze schakelaar uit — werkt meteen.'],
      risico: ['Що може статися: камера пристрою покаже кімнату, у якій ви стоїте. Хто зможе це запускати: лише ви дотиком на цьому пристрої; агенти й автоматизації — ніколи. Як вимкнути: цей перемикач або налаштування браузера.', 'Wat er kan gebeuren: de camera van het toestel toont de kamer waarin je staat. Wie dit kan starten: alleen jij met een tik op dit toestel; agenten en automatiseringen nooit. Uitzetten: deze schakelaar of de instellingen van de browser.'] },
    { id: 'microfoon', icoon: 'mic', naam: ['Мікрофон', 'Microfoon'],
      wat: ['Голосові команди помічникові й розмова через дзвінок у двері.', 'Spraakopdrachten aan de assistent en praten via de deurbel.'],
      gevolg: ['Що станеться: сайт зможе слухати після натиску на кнопку мікрофона; запис не зберігається, текст команди — у Журналі. Пов’язано з: голосом небезпечне й критичне не виконується — запит іде на екран. Як повернути: вимкніть цей перемикач.', 'Wat er gebeurt: de site kan luisteren na een druk op de microfoonknop; er wordt niets opgenomen, de tekst van de opdracht staat in het logboek. Hangt samen met: gevaarlijke en kritieke acties gaan niet met spraak — het verzoek komt op het scherm. Terugdraaien: zet deze schakelaar uit.'],
      risico: ['Що може статися: розмову поруч почують як команду. Хто зможе це запускати: лише людина натиском кнопки; агенти — ніколи. Як вимкнути: цей перемикач.', 'Wat er kan gebeuren: een gesprek in de buurt wordt als opdracht gehoord. Wie dit kan starten: alleen een mens met een druk op de knop; agenten nooit. Uitzetten: deze schakelaar.'] },
    { id: 'locatie', icoon: 'map-pin', naam: ['Місцезнаходження', 'Locatie'],
      wat: ['Геозона телефона для «хтось удома» і місце транспорту на мапі.', 'De geozone van de telefoon voor ‘er is iemand thuis’ en de plek van voertuigen op de kaart.'],
      gevolg: ['Що станеться: дім знатиме, коли ви поруч, і покаже місце транспорту тим, кому ви дозволили нижче. Пов’язано з: агентам — лише узагальнено «хтось удома». Як повернути: вимкніть перемикач — історію місць можна видалити.', 'Wat er gebeurt: het huis weet wanneer je in de buurt bent en toont de plek van voertuigen aan wie je hieronder toestaat. Hangt samen met: agenten krijgen alleen algemeen ‘er is iemand thuis’. Terugdraaien: zet de schakelaar uit — de plaatsgeschiedenis kun je wissen.'],
      risico: ['Що може статися: хтось у домі бачитиме, де ви зараз. Хто зможе це бачити: люди з переліку «Хто бачить місце». Як вимкнути: цей перемикач або «Ніхто» в переліку.', 'Wat er kan gebeuren: iemand in huis ziet waar je nu bent. Wie dit kan zien: de mensen uit ‘Wie ziet de locatie’. Uitzetten: deze schakelaar of ‘Niemand’ in de lijst.'] }
  ];
  var ZICHT = [{ id: 'niemand', label: ['Ніхто', 'Niemand'] }, { id: 'zelf', label: ['Лише сам', 'Alleen zelf'] }, { id: 'volwassenen', label: ['Дорослі', 'Volwassenen'] }, { id: 'iedereen', label: ['Усі в домі', 'Iedereen thuis'] }];
  var BEWAAR = [
    { id: 'buiten', icoon: 'cctv', naam: ['Кліпи камер надворі', 'Clips van buitencamera’s'], opties: [7, 14, 28, 90], advies: 28, eenheid: 'dag' },
    { id: 'binnen', icoon: 'video', naam: ['Кліпи камер у домі', 'Clips van binnencamera’s'], opties: [0, 3, 7, 14], advies: 7, eenheid: 'dag' },
    { id: 'bezoek', icoon: 'bell-ring', naam: ['Знімки відвідувачів', 'Foto’s van bezoekers'], opties: [7, 14, 30], advies: 14, eenheid: 'dag' },
    { id: 'beveiliging', icoon: 'shield', naam: ['Події безпеки', 'Beveiligingsgebeurtenissen'], opties: [30, 90, 365], advies: 365, eenheid: 'dag' },
    { id: 'apparaten', icoon: 'history', naam: ['Історія пристроїв', 'Geschiedenis van apparaten'], opties: [30, 365, 730], advies: 730, eenheid: 'dag' },
    { id: 'locatie', icoon: 'map-pin', naam: ['Історія місць', 'Plaatsgeschiedenis'], opties: [1, 7, 30], advies: 30, eenheid: 'dag' }
  ];
  function dagenTekst(n) { return n === 0 ? t('не зберігати', 'niet bewaren') : n + ' ' + HV.meervoud(n, ['день', 'дні', 'днів'], ['dag', 'dagen']); }

  function privacy(ctx) {
    var w = ctx.staat, sm = S(w), pr = sm.privacy;
    var lezen = !magWijzigen();
    var aan = DRIE.filter(function (d) { return pr[d.id]; });
    var held = kop({ id: 'privacy', icoon: 'shield-half', toon: aan.length ? 'let-op' : 'ok', boven: t('Система · Приватність', 'Systeem · Privacy'),
      zin: aan.length ? t('Увімкнено: ', 'Aan: ') + aan.map(function (d) { return P(d.naam).toLowerCase(); }).join(', ') : t('Камера, мікрофон і місце вимкнені', 'Camera, microfoon en locatie staan uit'),
      sub: h(t('Дані живуть на сервері вдома; сайт показує їх через захищений тунель. Хмарній моделі — лише узагальнено й за згодою кожного дорослого.', 'Gegevens leven op de server thuis; de site toont ze via een beveiligde tunnel. Een cloudmodel krijgt alleen iets algemeens en met toestemming van elke volwassene.')),
      chips: o.chip({ icoon: 'eye-off', tekst: t('приватних кімнат: ', 'privékamers: ') + pr.prive.length }) + o.chip({ icoon: 'scale', tekst: t('AVG: права особи щодо даних', 'AVG: rechten van de persoon') }) + o.chip({ icoon: 'history', tekst: t('аудит лише на додавання', 'controlespoor alleen toevoegen') }) });

    var drie = '<div class="hv-sm-drie" data-k="sm-drie">' + DRIE.map(function (d) {
      var isAan = !!pr[d.id];
      return '<article class="hv-sm-toegang' + (isAan ? ' is-aan' : '') + '" data-k="sm-drie-' + d.id + '"><div class="hv-sm-toegang__kop"><span class="hv-sm-toegang__teken">' + HV.icoon(d.icoon) + '</span><h3>' + h(P(d.naam)) + '</h3>' +
        o.gevolg(P(d.risico), { soort: 'uitroep', vast: isAan ? 'gevaarlijk' : null, kop: t('Ризик', 'Risico') + ': ' + P(d.naam) }) + '</div>' +
        '<p class="hv-sm-toegang__wat">' + h(P(d.wat)) + '</p><div class="hv-sm-toegang__voet">' +
        schakelaar({ aan: isAan, icoon: isAan ? d.icoon : 'minus', toon: 'warm', actie: 'sm-drie', gegevens: { id: d.id }, aria: P(d.naam), woordAan: t('Увімкнено', 'Aan'), woordUit: t('Вимкнено', 'Uit') }) +
        (isAan ? o.risico('gevaarlijk') : '<span class="hv-sm-typisch">' + h(t('типово', 'standaard')) + '</span>') + opgeslagen('drie-' + d.id) + '</div></article>';
    }).join('') + '</div>';

    var mensRijen = w.mensen.map(function (m) {
      return regel({ k: 'zicht-' + m.id, klas: 'hv-sm-regel--mens', voor: avatar(m, 'klein'), naam: P(m.naam), merk: ' <span class="hv-sm-rol hv-sm-rol--' + h(m.rol) + ' hv-sm-rol--klein">' + h(P(ROL_NAAM[m.rol])) + '</span>',
        orgaan: segment({ label: t('Хто бачить місце: ', 'Wie ziet de locatie: ') + P(m.naam), waarde: pr.zicht[m.id] || 'zelf', actie: 'sm-stel', gegevens: { pad: 'privacy.zicht.' + m.id, soort: 'zicht', naam: m.id }, opties: ZICHT.map(function (z) { return { id: z.id, label: P(z.label) }; }) }) });
    }).join('');
    var voertuigRijen = w.voertuigen.map(function (v) {
      return regel({ k: 'zicht-' + v.id, icoon: v.icoon, naam: P(v.naam),
        orgaan: segment({ label: t('Хто бачить місце: ', 'Wie ziet de locatie: ') + P(v.naam), waarde: pr.zicht[v.id] || 'volwassenen', actie: 'sm-stel', gegevens: { pad: 'privacy.zicht.' + v.id, soort: 'zicht', naam: v.id }, opties: ZICHT.map(function (z) { return { id: z.id, label: P(z.label) }; }) }) });
    }).join('');
    var zicht = kaart({ id: 'zicht', icoon: 'map-pinned', titel: t('Хто бачить місце людей і транспорту', 'Wie de locatie van mensen en voertuigen ziet'),
      zin: pr.locatie ? h(t('Місце видно лише тим, кого обрано. «Лише сам» — бачить тільки сама людина.', 'De locatie is alleen zichtbaar voor wie gekozen is. ‘Alleen zelf’ — alleen de persoon zelf ziet het.'))
        : '<span class="hv-sm-let">' + HV.icoon('map-pin-off', { maat: 's' }) + h(t('Місце зараз не збирається: перемикач «Місцезнаходження» вимкнено. Вибір нижче почне діяти, щойно його ввімкнуть.', 'De locatie wordt nu niet verzameld: de schakelaar ‘Locatie’ staat uit. De keuze hieronder werkt zodra hij aan gaat.')) + '</span>',
      inhoud: '<p class="hv-sm-veldkop">' + h(t('Люди', 'Mensen')) + '</p><div class="hv-sm-regels">' + mensRijen + '</div><p class="hv-sm-veldkop">' + h(t('Транспорт', 'Voertuigen')) + '</p><div class="hv-sm-regels">' + voertuigRijen + '</div>' +
        '<div class="hv-sm-regels">' + regel({ k: 'agentlocatie', icoon: 'bot', naam: t('Агентам про присутність', 'Agenten over aanwezigheid'), sub: h(t('точні дані — лише локальній моделі вдома', 'precieze gegevens alleen aan een lokaal model thuis')),
          merk: pr.agentLocatie === 'precies' ? ' ' + o.gevolg(t('Що може статися: хмарна модель знатиме, хто саме й коли вдома. Хто зможе це бачити: кожен агент із дозволом на читання. Як вимкнути: оберіть «Узагальнено».', 'Wat er kan gebeuren: een cloudmodel weet wie precies wanneer thuis is. Wie dit kan zien: elke agent met leestoestemming. Uitzetten: kies ‘Algemeen’.'), { soort: 'uitroep', vast: 'gevaarlijk', kop: t('Ризик', 'Risico') }) : '',
          orgaan: segment({ label: t('Агентам про присутність', 'Agenten over aanwezigheid'), waarde: pr.agentLocatie, actie: 'sm-stel', gegevens: { pad: 'privacy.agentLocatie', soort: 'agentlocatie' }, opties: [{ id: 'niets', label: t('Нічого', 'Niets') }, { id: 'algemeen', label: t('Узагальнено', 'Algemeen') }, { id: 'precies', label: t('Точно', 'Precies') }] }) }) + '</div>' });

    var prive = kaart({ id: 'prive', icoon: 'eye-off', titel: t('Приватні кімнати', 'Privékamers'), teller: pr.prive.length,
      zin: h(t('Інші ролі й агенти не бачать станів та історії цих кімнат; власник бачить, що кімната приватна.', 'Andere rollen en agenten zien de toestand en geschiedenis van deze kamers niet; de eigenaar ziet dat de kamer privé is.')),
      inhoud: '<div class="hv-filter hv-sm-pillen">' + alleKamers().map(function (k) {
        var p = pr.prive.indexOf(k.id) >= 0;
        return o.chip({ icoon: p ? 'eye-off' : k.icoon, tekst: P(k.naam), filter: true, gekozen: p, actie: lezen ? null : 'sm-prive', gegevens: { kamer: k.id }, k: 'sm-pk-' + k.id });
      }).join('') + '</div>' + opgeslagen('prive') });

    var bewaar = kaart({ id: 'bewaar', icoon: 'archive', titel: t('Строки зберігання', 'Bewaartermijnen'),
      uitleg: t('Що станеться: старші записи видаляються щоночі о 03:00. Пов’язано з: AVG радить для камер надворі не більше 28 днів — довше позначено «!». Як повернути: оберіть коротший строк; уже видалене не повертається.', 'Wat er gebeurt: oudere opnamen worden elke nacht om 03:00 gewist. Hangt samen met: de AVG raadt voor buitencamera’s hoogstens 28 dagen aan — langer krijgt een ‘!’. Terugdraaien: kies een kortere termijn; wat al gewist is, komt niet terug.'),
      inhoud: '<div class="hv-sm-regels">' + BEWAAR.map(function (b) {
        var v = pr.bewaar[b.id], over = v > b.advies;
        return regel({ k: 'bewaar-' + b.id, icoon: b.icoon, naam: P(b.naam), sub: h(t('радимо до ', 'advies tot ') + dagenTekst(b.advies)),
          merk: over ? ' ' + o.gevolg(t('Що може статися: записи зберігаються довше, ніж радить AVG, і розкривають розпорядок родини й сусідів. Хто зможе це бачити: усі, хто має доступ до камер. Як вимкнути: оберіть строк до ', 'Wat er kan gebeuren: opnamen blijven langer dan de AVG aanraadt en tonen het ritme van het gezin en de buren. Wie dit kan zien: iedereen met toegang tot de camera’s. Uitzetten: kies een termijn tot ') + dagenTekst(b.advies) + '.', { soort: 'uitroep', vast: 'gevaarlijk', kop: t('Ризик', 'Risico') }) : '',
          orgaan: segment({ label: P(b.naam), waarde: v, actie: 'sm-stel', gegevens: { pad: 'privacy.bewaar.' + b.id, soort: 'bewaar', naam: b.id }, opties: b.opties.map(function (n) { return { id: n, label: n === 0 ? t('ні', 'nee') : n + (HV.taal() === 'nl' ? ' d' : ' дн') }; }) }) });
      }).join('') +
        regel({ k: 'bewaar-logboek', icoon: 'scroll-text', naam: t('Журнал і аудит', 'Logboek en controlespoor'), sub: h(t('записи лише додаються; не редагуються й не видаляються', 'regels worden alleen toegevoegd; niet bewerkt en niet gewist')), orgaan: '<span class="hv-sm-lees">' + HV.icoon('lock', { maat: 's' }) + '<strong>' + h(t('без строку', 'zonder termijn')) + '</strong></span>' }) +
        regel({ k: 'bewaar-spraak', icoon: 'mic-off', naam: t('Голос', 'Spraak'), sub: h(t('звук не зберігається ніколи; лише текст команди', 'geluid wordt nooit bewaard; alleen de tekst van de opdracht')), orgaan: '<span class="hv-sm-lees">' + HV.icoon('lock', { maat: 's' }) + '<strong>' + h(t('не зберігається', 'niet bewaard')) + '</strong></span>' }) + '</div>' });

    var ik = HV.mens();
    var ex = pr.export;
    var exportStand = !ex ? '' : ex.klaar ? '<p class="hv-sm-export is-klaar" role="status">' + HV.icoon('file-check', { maat: 's' }) + h(t('Готово: ', 'Klaar: ') + ex.naam) + '</p>'
      : '<p class="hv-sm-export" role="status">' + HV.icoon('loader', { maat: 's' }) + h(t('Збирається архів… ', 'Archief wordt gemaakt… ') + Math.min(99, Math.round((Date.now() - ex.echt) / 25)) + ' %') + '</p>';
    var avg = kaart({ id: 'avg', icoon: 'scale', titel: t('Мої дані · права за AVG', 'Mijn gegevens · rechten volgens de AVG'),
      zin: h(P(ik.naam) + t(': отримати копію, виправити, видалити й побачити, хто дивився.', ': een kopie krijgen, corrigeren, wissen en zien wie keek.')),
      inhoud: '<div class="hv-knoppen">' + o.knop({ tekst: ex && ex.klaar ? t('Завантажити архів', 'Archief downloaden') : t('Експортувати мої дані', 'Mijn gegevens exporteren'), icoon: ex && ex.klaar ? 'download' : 'file-down', actie: ex && !ex.klaar ? null : 'sm-export', uit: !!(ex && !ex.klaar) }) +
        o.knop({ tekst: t('Видалити мої дані…', 'Mijn gegevens wissen…'), icoon: 'trash-2', soort: 'gevaar', actie: 'sm-wis' }) + '</div>' + exportStand +
        '<p class="hv-sm-veldkop">' + h(t('Хто дивився мої дані', 'Wie keek naar mijn gegevens')) + '</p><ul class="hv-sm-gekeken">' + pr.gekeken.slice(0, 5).map(function (g, i) {
          return '<li data-k="sm-gk-' + i + '"><span class="hv-sm-gekeken__teken">' + HV.icoon(g.icoon, { maat: 's' }) + '</span><span class="hv-sm-gekeken__wie">' + h(P(g.wie)) + '</span><span class="hv-sm-gekeken__wat">' + h(P(g.wat)) + '</span><span class="hv-sm-gekeken__tijd">' + h(HV.oud(w.tijd - g.tijd) + t(' тому', ' geleden')) + '</span></li>';
        }).join('') + '</ul>' + '<div class="hv-knoppen">' + o.knop({ tekst: t('Увесь аудит у Журналі', 'Het hele controlespoor in het logboek'), icoon: 'history', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'activiteit-geschiedenis' } }) + '</div>' });

    var REG = [
      [['Присутність', 'Aanwezigheid'], ['сценарії й охорона', 'scenario’s en beveiliging'], ['сервер удома', 'server thuis'], ['7 днів', '7 dagen']],
      [['Стани пристроїв', 'Toestand van apparaten'], ['керування й історія', 'bediening en geschiedenis'], ['сервер удома', 'server thuis'], ['365 днів', '365 dagen']],
      [['Кліпи камер', 'Cameraclips'], ['безпека', 'beveiliging'], ['сервер удома', 'server thuis'], ['14 днів', '14 dagen']],
      [['Узагальнений знімок', 'Algemene momentopname'], ['відповіді агентів', 'antwoorden van agenten'], ['хмарна модель (за згодою)', 'cloudmodel (met toestemming)'], ['не зберігається', 'niet bewaard']],
      [['Журнал і аудит', 'Logboek en controlespoor'], ['підзвітність', 'verantwoording'], ['сервер удома', 'server thuis'], ['без строку', 'zonder termijn']]
    ];
    var register = kaart({ id: 'register', icoon: 'table-2', titel: t('Реєстр обробки даних', 'Register van verwerkingen'),
      inhoud: '<div class="hv-sm-tabelvak"><table class="hv-sm-reg"><thead><tr><th scope="col">' + h(t('Дані', 'Gegevens')) + '</th><th scope="col">' + h(t('Навіщо', 'Waarvoor')) + '</th><th scope="col">' + h(t('Де', 'Waar')) + '</th><th scope="col">' + h(t('Скільки', 'Hoe lang')) + '</th></tr></thead><tbody>' +
        REG.map(function (r, i) { return '<tr data-k="sm-reg-' + i + '">' + r.map(function (c, j) { return j === 0 ? '<th scope="row">' + h(P(c)) + '</th>' : '<td>' + h(P(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' });

    var stroom = kaart({ id: 'stroom', icoon: 'waypoints', titel: t('Куди йдуть дані', 'Waar gegevens heen gaan'), inhoud: stroomSvg(pr) });

    return '<div class="hv-sm hv-sm-privacy" data-k="sm-privacy">' + leesBanner(ctx) + held + drie +
      '<div class="hv-sm-rooster"><div class="hv-sm-kolom">' + zicht + prive + '</div><div class="hv-sm-kolom">' + stroom + bewaar + avg + register + '</div></div></div>';
  }
  /** Схема «Куди йдуть дані»: власний SVG у токенах; пунктир — лише за згодою. */
  function stroomSvg(pr) {
    var knoop = function (x, y, b, icoonTekst, kop, sub, klas) {
      return '<g class="hv-sm-stroom__knoop' + (klas ? ' ' + klas : '') + '"><rect x="' + x + '" y="' + y + '" width="' + b + '" height="56" rx="12"/><text x="' + (x + 14) + '" y="' + (y + 24) + '" class="hv-sm-stroom__kop">' + h(kop) + '</text><text x="' + (x + 14) + '" y="' + (y + 42) + '" class="hv-sm-stroom__sub">' + h(sub) + '</text></g>';
    };
    var lijn = function (d, klas) { return '<path class="hv-sm-stroom__lijn' + (klas ? ' ' + klas : '') + '" d="' + d + '"/>'; };
    var wolk = pr.agentLocatie !== 'niets';
    return '<figure class="hv-sm-stroom" data-k="sm-stroom"><svg viewBox="0 0 660 210" role="img" aria-label="' + h(t('Пристрої передають дані серверу вдома; сайт бачить їх через тунель; хмарна модель отримує лише узагальнений знімок за згодою.', 'Apparaten geven gegevens aan de server thuis; de site ziet ze via de tunnel; een cloudmodel krijgt alleen een algemene momentopname met toestemming.')) + '">' +
      lijn('M160 50 H200') + lijn('M400 50 H440') + lijn('M300 78 V140', wolk ? 'is-toestemming' : 'is-uit') +
      knoop(4, 22, 156, '', t('Пристрої', 'Apparaten'), t('Zigbee, Wi-Fi, P1', 'Zigbee, wifi, P1')) +
      knoop(200, 22, 200, '', t('Сервер удома', 'Server thuis'), t('усі дані й Журнал', 'alle gegevens en logboek'), 'is-hoofd') +
      knoop(440, 22, 216, '', 'huis.tarasevych.com', t('тунель, без копії', 'tunnel, zonder kopie')) +
      knoop(200, 140, 200, '', t('Хмарна модель', 'Cloudmodel'), wolk ? t('узагальнено, за згодою', 'algemeen, met toestemming') : t('нічого не надсилається', 'er gaat niets heen'), wolk ? 'is-toestemming' : 'is-uit') +
      '</svg><figcaption>' + h(t('Суцільна лінія — завжди; пунктир — лише за згодою; сіре — вимкнено.', 'Doorgetrokken lijn — altijd; stippellijn — alleen met toestemming; grijs — uit.')) + '</figcaption></figure>';
  }

  // ═════════════════════════ 4. Дозволи й небезпечні дії / Toestemmingen en risicovolle acties ═════════════════════════
  /** Виконавці реєстру: паспорт (сцени, автоматизації, оптимізатор, агенти) і ті, кому інші зони вже дали дозвіл (окремі правила автоматики). */
  function uitvoerders(metExtra) {
    var basis = HV.gevaar.uitvoerders().slice(), ids = basis.map(function (u) { return u.id; });
    if (metExtra === false) return basis;
    Object.keys(HV.gevaar.standen()).forEach(function (id) { if (ids.indexOf(id) < 0) { basis.push(HV.gevaar.uitvoerder(id)); ids.push(id); } });
    return basis;
  }
  function extraUitvoerders() { var n = HV.gevaar.uitvoerders().length; return uitvoerders().slice(n); }
  function isUitvoerder(id) { return uitvoerders().some(function (u) { return u.id === id; }); }
  function tabelUitvoerders() { return uitvoerders(HV.ui.lees('sm-regels', false) ? true : false); }
  function alleActies() {
    return HV.gevaar.acties.slice().sort(function (a, b) { return (NIVEAU_RANG[a.niveau] - NIVEAU_RANG[b.niveau]) || (KLASSEN.map(function (k) { return k.id; }).indexOf(klasseVan(a)) - KLASSEN.map(function (k) { return k.id; }).indexOf(klasseVan(b))); });
  }
  function zichtbareActies() {
    var niveau = HV.ui.lees('sm-niveau', 'alle'), alleenActief = HV.ui.lees('sm-actief', false), u = gekozenUitvoerder();
    // «лише не «Вимкнено»» рахує саме тих виконавців, яких видно: вибраного або стовпці таблиці
    var us = u !== 'alle' ? [u] : tabelUitvoerders().map(function (x) { return x.id; });
    return alleActies().filter(function (a) {
      if (niveau !== 'alle' && a.niveau !== niveau) return false;
      if (alleenActief && !us.some(function (x) { return HV.gevaar.stand(x, a.sleutel) !== 'uit'; })) return false;
      return true;
    });
  }
  function groepen(acties) {
    var wijze = HV.ui.lees('sm-groep', 'niveau');
    var uit = [];
    if (wijze === 'klasse') {
      KLASSEN.forEach(function (k) { var l = acties.filter(function (a) { return klasseVan(a) === k.id; }); if (l.length) uit.push({ id: 'k-' + k.id, icoon: k.icoon, naam: k.naam, acties: l }); });
    } else {
      ['kritiek', 'gevaarlijk', 'gevoelig', 'gewoon'].forEach(function (n) { var l = acties.filter(function (a) { return a.niveau === n; }); if (l.length) uit.push({ id: 'n-' + n, niveau: n, icoon: NIVEAU_GROEP[n].icoon, naam: NIVEAU_GROEP[n].naam, acties: l }); });
    }
    return uit;
  }
  function risicoTekst(actie, u) {
    var wie = HV.gevaar.uitvoerder(u), k = S().kaders[u];
    var tekst = P(actie.risico || ['', '']);
    var naam = HV.taal() === 'nl' ? '‘' + wie.naam[1] + '’' : '«' + wie.naam[0] + '»';
    tekst = tekst.replace(/цей виконавець|цей агент/, naam).replace(/deze uitvoerder|deze agent/, naam);
    if (k && heeftKaders(k)) tekst = tekst.replace(/(без запиту|zonder te vragen|без вашого схвалення|zonder jouw goedkeuring)/, '$1 (' + kadersTekst(k) + ')');
    return tekst;
  }
  function heeftKaders(k) { return !!(k && (k.tot || (k.kamers && k.kamers.length) || k.uren || k.budget)); }
  function urenTekst(u) { var f = function (x) { return (x < 10 ? '0' : '') + x + ':00'; }; return f(u[0]) + '–' + f(u[1]); }
  function kadersTekst(k) {
    if (!k) return t('без рамок', 'zonder kaders');
    var d = [];
    if (k.verlopen) d.push(t('строк минув ', 'termijn verlopen op ') + HV.datumKort(k.verlopen));
    else if (k.tot) d.push(t('до ', 'tot ') + HV.datumKort(k.tot));
    if (k.kamers && k.kamers.length) d.push(k.kamers.length + ' ' + HV.meervoud(k.kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']));
    if (k.uren) d.push(urenTekst(k.uren));
    if (k.budget) d.push(k.budget + t(' дій на добу', ' acties per dag'));
    return d.length ? d.join(' · ') : t('без рамок', 'zonder kaders');
  }
  function gebruikt(u, w) {
    var begin = dagBegin(w.tijd);
    return w.logboek.filter(function (r) { return r.tijd >= begin && r.toegestaan && r.maker && (r.maker.id === u || (!r.maker.id && r.maker.soort === u)); }).length;
  }
  function telStanden(us, acties) {
    var c = { uit: 0, vragen: 0, altijd: 0, zwaar: 0 };
    us.forEach(function (u) { acties.forEach(function (a) { var s = HV.gevaar.stand(u, a.sleutel); c[s]++; if (s === 'altijd' && HV.gevaar.isZwaar(a)) c.zwaar++; }); });
    return c;
  }

  // ── Знаки режимів. Типовий «Вимкнено» — тиха риска без слова; «Питати» й «Завжди» — кольорова позначка зі словом. ──
  function zwaarKlas(s, actie) { return s === 'altijd' && actie && HV.gevaar.isZwaar(actie) ? ' is-zwaar' + (actie.niveau === 'kritiek' ? ' is-kritiek' : '') : ''; }
  function risicoTeken(actie, maat) { return HV.icoon(actie.niveau === 'kritiek' ? 'risico-kritiek' : 'risico-gevaarlijk', { maat: maat || 'risico' }); }
  /** Пасивна позначка режиму: клітинка таблиці й рядок «лише читання». metWoord — слово «Вимкнено» для читача екрана. */
  function standMerk(s, actie, metWoord) {
    if (s === 'uit') return '<span class="hv-sm-merk is-uit">' + HV.icoon(STAND_ICOON.uit, { maat: 's' }) + (metWoord ? '<span class="hv-vo">' + h(P(HV.gevaar.standNamen.uit)) + '</span>' : '') + '</span>';
    var zw = zwaarKlas(s, actie);
    return '<span class="hv-sm-merk is-' + s + zw + '">' + (zw ? risicoTeken(actie) : HV.icoon(STAND_ICOON[s], { maat: 's' })) + '<span>' + h(P(HV.gevaar.standNamen[s])) + '</span></span>';
  }
  /**
   * Компактний сегмент трьох режимів: три цілі по 44 px. У вузькій колонці — лише знаки (слово лишається для читача екрана,
   * а для винятку стоїть під назвою дії); від 700 px — знак і слово. waarde === null — «змішано», жоден не вибрано.
   * p: { label, waarde, actie, gegevens, voor (дія реєстру — для позначки небезпечного «Завжди»), wacht, fout }
   */
  function keuzes(p) {
    return '<div class="hv-sm-keuzes" role="group" aria-label="' + h(p.label) + '">' + ['uit', 'vragen', 'altijd'].map(function (s) {
      var gek = p.waarde === s;
      var g = {}; for (var x in p.gegevens) g[x] = p.gegevens[x]; g.waarde = s;
      return '<button type="button" class="hv-sm-keuze is-' + s + (gek ? ' is-gekozen' : '') + zwaarKlas(s, p.voor) + (p.wacht && s === 'altijd' ? ' is-wacht' : '') + (p.fout && s === 'altijd' ? ' is-fout' : '') + '" aria-pressed="' + gek + '" title="' + h(P(HV.gevaar.standNamen[s])) + '"' + HV.attrs(g) + ' data-actie="' + p.actie + '">' +
        HV.icoon(STAND_ICOON[s], { maat: 's' }) + '<span class="hv-sm-keuze__woord">' + h(P(HV.gevaar.standNamen[s])) + '</span></button>';
    }).join('') + '</div>';
  }
  /** Гуртовий орган («Для всієї групи», «Для всіх показаних дій», «Для всіх виконавців»): тихий рядок; змішано — жоден сегмент не вибрано. */
  function bulk(p) {
    if (!magWijzigen()) return '';
    var waarden = p.paren.map(function (x) { return HV.gevaar.stand(x[0], x[1]); });
    var een = waarden.length && waarden.every(function (v) { return v === waarden[0]; }) ? waarden[0] : null;
    return '<div class="hv-sm-bulk" data-k="sm-groep-' + h(p.k) + '"><span class="hv-sm-bulk__label">' + h(p.label) + (een ? '' : '<span class="hv-sm-bulk__gemengd">' + h(t('змішано', 'gemengd')) + '</span>') + '</span>' +
      keuzes({ label: p.label, waarde: een, actie: 'sm-groep', gegevens: p.gegevens }) + '</div>';
  }
  /** Лічильники групи: «Завжди: N» (нуль — тихо; небезпечне — з позначкою) і «Питати: N», коли є. */
  function groepSom(c) {
    return '<span class="hv-sm-som">' +
      '<span class="hv-sm-teller' + (c.zwaar ? ' is-zwaar' : c.altijd ? ' is-altijd' : ' is-stil') + '">' + (c.zwaar ? HV.icoon('risico-gevaarlijk', { maat: 'maker' }) : '') + h(t('Завжди: ', 'Altijd: ') + c.altijd) + '</span>' +
      (c.vragen ? '<span class="hv-sm-teller is-vragen">' + h(t('Питати: ', 'Vragen: ') + c.vragen) + '</span>' : '') + '</span>';
  }
  function groepTeken(g) { return '<span class="hv-sm-groepteken' + (g.niveau ? ' hv-risico--' + g.niveau : '') + '">' + HV.icoon(g.icoon, { maat: 's' }) + '</span>'; }
  /** Групи типово згорнуті (видно лише лічильники); одна група чи фільтр «лише не «Вимкнено»» — розгорнуто. Вибір людини пам'ятається. */
  function groepIsOpen(g, aantal) {
    if (!HV.profielKanInklappen()) return true;
    var v = HV.ui.lees('sm-g-' + g.id, null);
    if (v === '1') return true;
    if (v === '0') return false;
    return aantal === 1 || !!HV.ui.lees('sm-actief', false);
  }

  /**
   * Рядок дозволу 56 px: назва (дотик розкриває ризик, наслідок і рамки) і компактний сегмент режимів.
   * Під назвою — лише те, що відрізняється від типового: «Питати», «Завжди», стан збереження; у групуванні за класом — рівень.
   * op: { metUitvoerder (рядок називає виконавця, а не дію), vast (не розкривається), metNiveau, gekozen }
   */
  function standRij(u, actie, op) {
    op = op || {};
    var w = HV.staat.w, sm = S(w);
    var waarde = HV.gevaar.stand(u, actie.sleutel), zwaar = HV.gevaar.isZwaar(actie), zwaarAltijd = zwaar && waarde === 'altijd';
    var sk = u + '|' + actie.sleutel;
    var wacht = HV.ui.lees('sm-wacht', null) === sk;
    var mark = markering('stand-' + sk);
    var wie = HV.gevaar.uitvoerder(u), k = sm.kaders[u];
    var lezen = !magWijzigen();
    var open = !op.vast && HV.ui.lees('sm-rij', null) === sk;
    var wieHtml = '<span class="hv-sm-rij__wie">' + HV.icoon(UITVOERDER_ICOON[wie.soort] || 'bot', { maat: 's' }) + '<span>' + h(P(wie.naam)) + '</span></span>';

    var sub = '';
    if (op.metNiveau && actie.niveau !== 'gewoon') sub += o.risico(actie.niveau);
    // «лише читання»: слово стану вже стоїть у позначці праворуч — під назвою повторюємо тільки небезпечне «Завжди»
    if (waarde !== 'uit' && (zwaarAltijd || !lezen)) sub += '<span class="hv-sm-rij__staat is-' + waarde + zwaarKlas(waarde, actie) + '">' + (zwaarAltijd ? risicoTeken(actie, 'maker') : '') + h(zwaarAltijd ? t('Завжди, без запиту', 'Altijd, zonder te vragen') : P(HV.gevaar.standNamen[waarde])) + '</span>';
    if (op.vast && (heeftKaders(k) || (k && k.verlopen))) sub += '<span class="hv-sm-rij__kader">' + h(kadersTekst(k)) + '</span>';
    if (wacht) sub += '<span class="hv-sm-standstatus">' + HV.icoon('key-round', { maat: 's' }) + h(t('чекає підтвердження входу', 'wacht op aanmelding')) + '</span>';
    else if (mark === 'ok') sub += '<span class="hv-sm-standstatus is-ok">' + HV.icoon('check', { maat: 's' }) + h(t('збережено', 'opgeslagen')) + '</span>';
    else if (mark === 'fout') sub += '<span class="hv-sm-standstatus is-fout">' + HV.icoon('circle-x', { maat: 's' }) + h(t('не збережено: підтвердження скасовано', 'niet opgeslagen: bevestiging geannuleerd')) + '</span>';

    var naam = '<span class="hv-sm-rij__naam">' + (op.metUitvoerder ? wieHtml : '<span>' + h(P(actie.naam)) + '</span>') + (op.vast ? '' : HV.icoon('chevron-down', { maat: 's', klas: 'hv-sm-rij__pijl' })) + '</span>';
    var binnen = naam + (sub ? '<span class="hv-sm-rij__sub">' + sub + '</span>' : '');
    var kopHtml = op.vast ? '<div class="hv-sm-rij__kop">' + binnen + '</div>'
      : '<button type="button" class="hv-sm-rij__kop" aria-expanded="' + open + '" data-actie="ui" data-naam="sm-rij" data-waarde="' + (open ? '' : h(sk)) + '">' + binnen + '</button>';

    var orgaan = lezen ? '<span class="hv-sm-rij__lees">' + standMerk(waarde, actie, true) + '</span>'
      : keuzes({ label: t('Дозвіл', 'Toestemming') + ': ' + P(actie.naam) + ' · ' + P(wie.naam), waarde: waarde, actie: 'sm-stand', gegevens: { uitvoerder: u, sleutel: actie.sleutel }, voor: actie, wacht: wacht, fout: mark === 'fout' });

    var meer = '';
    if (open) {
      var pauze = w.zelfGestopt && wie.soort !== 'scene' ? '<p class="hv-sm-pauze">' + HV.icoon('pause', { maat: 's' }) + '<span>' + h(t('Самостійні дії зупинено — режим збережено, але нічого не виконується', 'Zelfstandige acties gestopt — de stand blijft, maar er wordt niets uitgevoerd')) + '</span></p>' : '';
      var uitleg = zwaar
        ? '<div class="hv-sm-risicovak' + (zwaarAltijd ? ' is-actief' + (actie.niveau === 'kritiek' ? ' is-kritiek' : '') : '') + '"><p class="hv-sm-risicovak__kop">' + (zwaarAltijd ? risicoTeken(actie) : '<span class="hv-sm-risicovak__teken">' + HV.icoon('uitroep', { maat: 's' }) + '</span>') + '<strong>' + h(t('Ризик', 'Risico')) + '</strong>' + o.risico(actie.niveau, { lang: true }) + '</p>' + o.gevolgRijen(risicoTekst(actie, u)) + '</div>'
        : (actie.niveau !== 'gewoon' ? '<p class="hv-sm-rij__niveau">' + o.risico(actie.niveau, { lang: true }) + '</p>' : '') + (actie.gevolg ? o.gevolgRijen(P(actie.gevolg)) : '<p class="hv-sm-rij__gewoon">' + h(t('Звичайна дія: людина виконує одразу; «Повернути» — 10 с у сповіщенні.', 'Gewone actie: een mens voert meteen uit; ‘Ongedaan maken’ 10 s in de melding.')) + '</p>');
      var kadersChip = lezen ? o.chip({ icoon: 'calendar-clock', tekst: t('Рамки: ', 'Kaders: ') + kadersTekst(k) })
        : o.chip({ icoon: k && k.verlopen ? 'calendar-x' : 'calendar-clock', tekst: t('Рамки: ', 'Kaders: ') + kadersTekst(k), actie: 'blad', gegevens: { blad: 'smkaders:' + u }, toon: k && k.verlopen ? 'let-op' : null, aria: t('Рамки виконавця: ', 'Kaders van de uitvoerder: ') + kadersTekst(k) });
      meer = '<div class="hv-sm-rij__meer">' + uitleg + pauze +
        '<p class="hv-sm-rij__kaders">' + kadersChip + (lezen ? '<span class="hv-sm-rij__slot">' + HV.icoon('lock', { maat: 's' }) + h(t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen')) + '</span>' : '') + '</p></div>';
    }
    return '<div class="hv-sm-rij is-' + waarde + zwaarKlas(waarde, actie) + (open ? ' is-open' : '') + (op.gekozen ? ' is-gekozen' : '') + '" data-k="sm-stand-' + h(u) + '-' + h(actie.sleutel) + '">' + kopHtml + orgaan + meer + '</div>';
  }

  function isBreed() { var id = HV.profiel ? HV.profiel().id : ''; return id === 'bureau' || id === 'breed' || id === 'ultrabreed'; }
  /** Вибраний виконавець: від bureau типово «усі» (таблиця), у вужчих профілях — перший із переліку. */
  function gekozenUitvoerder() {
    var us = uitvoerders(), breed = isBreed();
    var gekozen = HV.ui.lees('sm-uitvoerder', breed ? 'alle' : us[0].id);
    if (!breed && gekozen === 'alle') gekozen = us[0].id;
    if (gekozen !== 'alle' && !us.some(function (u) { return u.id === gekozen; })) gekozen = us[0].id;
    return gekozen;
  }

  function risico(ctx) {
    var w = ctx.staat, sm = S(w);
    var us = uitvoerders();
    var breed = isBreed();
    var gekozen = gekozenUitvoerder();
    var lezen = !magWijzigen();
    var acties = alleActies(), zicht = zichtbareActies();
    var c = telStanden(us.map(function (u) { return u.id; }), acties);
    var zwaar = HV.gevaar.altijdZwaar();
    var kritiekAltijd = zwaar.filter(function (z) { return z.actie.niveau === 'kritiek'; }).length;

    var held = kop({ id: 'risico', icoon: zwaar.length ? (kritiekAltijd ? 'risico-kritiek' : 'risico-gevaarlijk') : 'shield-check', toon: zwaar.length ? (kritiekAltijd ? 'alarm' : 'let-op') : 'ok', boven: t('Система · Дозволи й небезпечні дії', 'Systeem · Toestemmingen en risicovolle acties'),
      zin: zwaar.length ? t('«Завжди» для небезпечних і критичних: ', '‘Altijd’ voor gevaarlijke en kritieke acties: ') + zwaar.length : c.altijd + c.vragen ? t('Небезпечне й критичне без вас не виконується', 'Gevaarlijk en kritiek gebeurt niet zonder jou') : t('Без вас дім нічого не робить', 'Zonder jou doet het huis niets'),
      sub: h(t(acties.length + ' дій × ' + us.length + ' виконавців. Типово всюди «Вимкнено». Змінює лише власник; агент дозволів не змінює — органа для цього немає.', acties.length + ' acties × ' + us.length + ' uitvoerders. Standaard overal ‘Uit’. Alleen de eigenaar wijzigt; een agent wijzigt geen toestemmingen — daar is geen orgaan voor.')),
      chips: o.chip({ icoon: STAND_ICOON.altijd, tekst: t('Завжди: ', 'Altijd: ') + c.altijd }) + o.chip({ icoon: STAND_ICOON.vragen, tekst: t('Питати: ', 'Vragen: ') + c.vragen }) +
        '<span class="hv-sm-kop__rest">' + h(t('решта ', 'de overige ') + c.uit + t(' — «Вимкнено»', ' staan ‘Uit’')) + '</span>' +
        (w.zelfGestopt ? o.chip({ icoon: 'pause', toon: 'let-op', tekst: t('Самостійні дії зупинено', 'Zelfstandige acties gestopt') }) : ''),
      acties: (w.zelfGestopt
        ? o.knop({ tekst: t('Відновити самостійні дії', 'Zelfstandige acties hervatten'), icoon: 'play', soort: 'hoofd', actie: lezen ? null : 'sm-zelf', gegevens: { stop: 'nee' }, uit: lezen })
        : o.knop({ tekst: t('Зупинити самостійні дії', 'Zelfstandige acties stoppen'), icoon: 'octagon-pause', soort: 'gewoon', actie: rol() === 'eigenaar' || rol() === 'bewoner' ? 'sm-zelf' : null, gegevens: { stop: 'ja' }, uit: !(rol() === 'eigenaar' || rol() === 'bewoner') })) +
        (isEigenaar() ? o.segment({ label: t('Перегляд очима', 'Bekijken als'), waarde: ogen(), actie: 'ui', gegevens: { naam: 'sm-ogen' }, klas: 'hv-sm-ogen', opties: [{ id: 'eigenaar', label: t('Власник', 'Eigenaar'), icoon: 'crown' }, { id: 'gast', label: t('Гість', 'Gast'), icoon: 'luggage' }, { id: 'agent', label: t('Агент', 'Agent'), icoon: 'bot' }] }) : '') });

    // Самостійні дії зупинено: одне пояснення на всю сторінку (а не в кожному рядку)
    var pauze = w.zelfGestopt ? '<p class="hv-sm-banner is-let-op" data-k="sm-pauze">' + HV.icoon('pause', { maat: 's' }) + '<span>' + h(t('Самостійні дії зупинено: режими збережено, але автоматизації, оптимізатор і агенти нічого не виконують. Сцени, які запускає людина, працюють.', 'Zelfstandige acties gestopt: de standen blijven, maar automatiseringen, optimalisatie en agenten voeren niets uit. Scènes die een mens start, werken.')) + '</span></p>' : '';

    // «!» зведення: де стоїть «Завжди» для небезпечного
    var zwaarLijst = zwaar.length ? kaart({ id: 'zwaar', icoon: 'risico-gevaarlijk', toon: 'let-op', klas: 'hv-sm-kaart--zwaar', titel: t('Тут стоїть «Завжди» для небезпечного', 'Hier staat ‘Altijd’ voor iets gevaarlijks'), teller: zwaar.length,
      inhoud: '<ul class="hv-sm-zwaar">' + zwaar.map(function (z, i) {
        var wie = HV.gevaar.uitvoerder(z.uitvoerder);
        // «!» — одна позначка на рядок: вона ж і відкриває пояснення ризику
        return '<li class="' + (z.actie.niveau === 'kritiek' ? 'is-kritiek' : 'is-gevaarlijk') + '" data-k="sm-zw-' + i + '">' + o.gevolg(risicoTekst(z.actie, z.uitvoerder), { soort: 'uitroep', vast: z.actie.niveau, kop: t('Ризик', 'Risico') + ': ' + P(z.actie.naam) }) +
          '<span class="hv-sm-zwaar__wat"><strong>' + h(P(z.actie.naam)) + '</strong> · ' + h(P(wie.naam)) + '<span class="hv-sm-zwaar__sub">' + h(kadersTekst(sm.kaders[z.uitvoerder])) + '</span></span>' +
          (lezen ? '' : o.knop({ tekst: t('Питати', 'Vragen'), klein: true, soort: 'stil', actie: 'sm-stand', gegevens: { uitvoerder: z.uitvoerder, sleutel: z.actie.sleutel, waarde: 'vragen' } })) + '</li>';
      }).join('') + '</ul>' }) : '';

    // Фільтри
    var pillen = '<div class="hv-filter hv-sm-pillen hv-sm-uitvoerders" role="group" aria-label="' + h(t('Виконавець', 'Uitvoerder')) + '">' +
      (breed ? o.chip({ icoon: 'table-2', tekst: t('Усі виконавці', 'Alle uitvoerders'), filter: true, gekozen: gekozen === 'alle', actie: 'ui', gegevens: { naam: 'sm-uitvoerder', waarde: 'alle' }, k: 'sm-u-alle' }) : '') +
      us.map(function (u, i) {
        if (i >= HV.gevaar.uitvoerders().length && !HV.ui.lees('sm-regels', false) && gekozen !== u.id) return '';
        var n = acties.filter(function (a) { return HV.gevaar.stand(u.id, a.sleutel) === 'altijd' && HV.gevaar.isZwaar(a); }).length;
        return (i === HV.gevaar.uitvoerders().length ? '<span class="hv-sm-scheiding" aria-hidden="true"></span>' : '') + o.chip({ icoon: UITVOERDER_ICOON[u.soort] || 'bot', html: '<span>' + h(P(u.naam)) + '</span>' + (n ? '<span class="hv-sm-chipmerk">' + HV.icoon('risico-gevaarlijk', { maat: 'maker' }) + n + '</span>' : ''), filter: true, gekozen: gekozen === u.id, actie: 'ui', gegevens: { naam: 'sm-uitvoerder', waarde: u.id }, k: 'sm-u-' + u.id, klas: i >= HV.gevaar.uitvoerders().length ? 'hv-sm-chip--regel' : '' });
      }).join('') + '</div>';
    var niveau = HV.ui.lees('sm-niveau', 'alle');
    var filters = '<div class="hv-sm-filters" data-k="sm-filters">' + pillen +
      '<div class="hv-sm-filters__rij"><div class="hv-filter hv-sm-pillen hv-sm-niveaus" role="group" aria-label="' + h(t('Рівень ризику', 'Risiconiveau')) + '">' + [['alle', t('Усі рівні', 'Alle niveaus'), null], ['kritiek', t('критичні', 'kritiek'), 'octagon'], ['gevaarlijk', t('небезпечні', 'gevaarlijk'), 'triangle'], ['gevoelig', t('чутливі', 'gevoelig'), 'eye'], ['gewoon', t('звичайні', 'gewoon'), 'circle']].map(function (n) {
        return o.chip({ icoon: n[2], tekst: n[1], filter: true, gekozen: niveau === n[0], actie: 'ui', gegevens: { naam: 'sm-niveau', waarde: n[0] }, k: 'sm-n-' + n[0] });
      }).join('') + (extraUitvoerders().length ? o.chip({ icoon: 'columns-3', tekst: t('окремі правила: ', 'aparte regels: ') + extraUitvoerders().length, filter: true, gekozen: !!HV.ui.lees('sm-regels', false), actie: 'ui', gegevens: { naam: 'sm-regels', waarde: HV.ui.lees('sm-regels', false) ? '' : '1' }, k: 'sm-regels' }) : '') + o.chip({ icoon: 'filter', tekst: t('лише не «Вимкнено»', 'alleen niet ‘Uit’'), filter: true, gekozen: !!HV.ui.lees('sm-actief', false), actie: 'ui', gegevens: { naam: 'sm-actief', waarde: HV.ui.lees('sm-actief', false) ? '' : '1' }, k: 'sm-actief' }) + '</div>' +
      o.segment({ label: t('Групувати', 'Groeperen'), waarde: HV.ui.lees('sm-groep', 'niveau'), actie: 'ui', gegevens: { naam: 'sm-groep' }, klas: 'hv-sm-segment', opties: [{ id: 'niveau', label: t('за рівнем', 'per niveau') }, { id: 'klasse', label: t('за класом', 'per soort') }] }) + '</div></div>';

    var inhoud = gekozen === 'alle' ? tabel(ctx, zicht, tabelUitvoerders()) : lijst(ctx, zicht, gekozen);
    var leeg = !zicht.length ? o.leeg({ icoon: 'filter-x', titel: t('Нічого не знайдено', 'Niets gevonden'), tekst: t('Зніміть фільтр «лише не «Вимкнено»» або оберіть інший рівень.', 'Zet het filter ‘alleen niet ‘Uit’’ uit of kies een ander niveau.'), actie: { tekst: t('Скинути фільтри', 'Filters wissen'), actie: 'sm-filters-weg' } }) : '';

    var uitleg = kaart({ id: 'wat', icoon: 'info', titel: t('Як читати реєстр', 'Zo lees je het register'),
      inhoud: '<dl class="hv-sm-legenda">' +
        '<div><dt>' + standMerk('uit') + h(t('Вимкнено', 'Uit')) + '</dt><dd>' + h(t('типовий стан: виконавець не може цього зовсім; спроба — запис у Журналі', 'de standaard: de uitvoerder kan dit helemaal niet; een poging komt in het logboek')) + '</dd></div>' +
        '<div><dt>' + HV.icoon(STAND_ICOON.vragen, { maat: 's', klas: 'hv-sm-legenda__vragen' }) + h(t('Питати', 'Vragen')) + '</dt><dd>' + h(t('запит у «Чекає на вас»; без схвалення за 5 хв — не виконано', 'een verzoek in ‘Wacht op jou’; zonder goedkeuring binnen 5 min — niet uitgevoerd')) + '</dd></div>' +
        '<div><dt>' + HV.icoon(STAND_ICOON.altijd, { maat: 's', klas: 'hv-sm-legenda__altijd' }) + h(t('Завжди', 'Altijd')) + '</dt><dd>' + h(t('виконується сам у межах рамок; кожна дія — у Журналі з «Повернути»', 'gebeurt zelf binnen de kaders; elke actie in het logboek met ‘Ongedaan maken’')) + '</dd></div>' +
        '<div><dt>' + HV.icoon('risico-gevaarlijk', { maat: 'risico' }) + h(t('Позначка', 'Markering')) + '</dt><dd>' + h(t('«Завжди» для небезпечного чи критичного; не закривається, доки діє', '‘Altijd’ voor iets gevaarlijks of kritieks; blijft staan zolang het geldt')) + '</dd></div></dl>' +
        '<p class="hv-sm-noot">' + HV.icoon('key-round', { maat: 's' }) + '<span>' + h(t('«Завжди» для небезпечної чи критичної дії вмикає лише власник після підтвердження входу (діє 5 хв для сеансу). Людина й далі проходить свій ритуал: рейку утримання й підтвердження входу.', '‘Altijd’ voor een gevaarlijke of kritieke actie zet alleen de eigenaar aan na bevestiging van aanmelding (5 min per sessie). Een mens doorloopt nog steeds het eigen ritueel: houdrail en bevestiging van aanmelding.')) + '</span></p>' });

    return '<div class="hv-sm hv-sm-risico" data-k="sm-risico">' + leesBanner(ctx) + held + pauze + zwaarLijst + filters + (leeg || inhoud) + uitleg + '</div>';
  }

  /** Зведення стовпця в рядку групи: усе «Вимкнено» — риска; інакше — скільки «Завжди» й «Питати». */
  function kolomSom(c, u) {
    if (!c.altijd && !c.vragen) return '<span class="hv-sm-kolomsom is-leeg">' + HV.icoon(STAND_ICOON.uit, { maat: 's' }) + '<span class="hv-vo">' + h(P(u.naam) + ': ' + t('усе «Вимкнено»', 'alles ‘Uit’')) + '</span></span>';
    var woorden = (c.altijd ? t('Завжди: ', 'Altijd: ') + c.altijd : '') + (c.altijd && c.vragen ? ' · ' : '') + (c.vragen ? t('Питати: ', 'Vragen: ') + c.vragen : '');
    return '<span class="hv-sm-kolomsom" title="' + h(P(u.naam) + ' — ' + woorden) + '"><span class="hv-vo">' + h(P(u.naam) + ' — ' + woorden) + '</span>' +
      (c.altijd ? '<span class="hv-sm-kolomsom__deel is-altijd' + (c.zwaar ? ' is-zwaar' : '') + '" aria-hidden="true">' + HV.icoon(c.zwaar ? 'risico-gevaarlijk' : STAND_ICOON.altijd, { maat: c.zwaar ? 'maker' : 's' }) + c.altijd + '</span>' : '') +
      (c.vragen ? '<span class="hv-sm-kolomsom__deel is-vragen" aria-hidden="true">' + HV.icoon(STAND_ICOON.vragen, { maat: 's' }) + c.vragen + '</span>' : '') + '</span>';
  }

  /**
   * Від bureau: таблиця «дія × виконавець». Група згорнута — один рядок зі зведенням кожного стовпця; розгорнута — рядки дій:
   * «Вимкнено» — тиха риска, «Питати» й «Завжди» — кольорові позначки зі словом. Клітинка розгортає рядок режимів під собою.
   */
  function tabel(ctx, zicht, us) {
    var open = HV.ui.lees('sm-open', null), cel = HV.ui.lees('sm-cel', null), kolom = HV.ui.lees('sm-kolom', null);
    var lezen = !magWijzigen(), kan = HV.profielKanInklappen();
    var n = us.length + 1, ids = us.map(function (u) { return u.id; });
    var metNiveau = HV.ui.lees('sm-groep', 'niveau') === 'klasse';
    var kop = '<thead><tr><th scope="col" class="hv-sm-matrix__actiekop">' + h(t('Дія', 'Actie')) + '</th>' + us.map(function (u) {
      var aan = kolom === u.id;
      return '<th scope="col" class="hv-sm-matrix__uitv' + (aan ? ' is-open' : '') + '">' + (lezen ? '<span class="hv-sm-matrix__uknop">' : '<button type="button" class="hv-sm-matrix__uknop" aria-expanded="' + aan + '" data-actie="ui" data-naam="sm-kolom" data-waarde="' + (aan ? '' : u.id) + '" aria-label="' + h(t('Стовпець: ', 'Kolom: ') + P(u.naam)) + '">') +
        HV.icoon(UITVOERDER_ICOON[u.soort] || 'bot', { maat: 's' }) + '<span>' + h(P(u.naam)) + '</span>' + (lezen ? '</span>' : HV.icoon('chevron-down', { maat: 's', klas: 'hv-sm-matrix__pijl' }) + '</button>') + '</th>';
    }).join('') + '</tr>';
    if (kolom && !lezen && ids.indexOf(kolom) >= 0) {
      var ku = HV.gevaar.uitvoerder(kolom);
      kop += '<tr class="hv-sm-matrix__kolombalk" data-k="sm-kolombalk"><td colspan="' + n + '"><div class="hv-sm-kolombalk"><span class="hv-sm-kolombalk__wie">' + HV.icoon(UITVOERDER_ICOON[ku.soort] || 'bot', { maat: 's' }) + '<strong>' + h(P(ku.naam)) + '</strong></span>' +
        bulk({ k: 'kolom-' + kolom, label: t('Для всіх показаних дій', 'Voor alle getoonde acties'), paren: zicht.map(function (a) { return [kolom, a.sleutel]; }), gegevens: { bereik: 'kolom', uitvoerder: kolom } }) +
        o.chip({ icoon: 'calendar-clock', tekst: t('Рамки: ', 'Kaders: ') + kadersTekst(S().kaders[kolom]), actie: 'blad', gegevens: { blad: 'smkaders:' + kolom } }) + '</div></td></tr>';
    }
    kop += '</thead>';
    var gr = groepen(zicht);
    var lijf = gr.map(function (g) {
      var c = telStanden(ids, g.acties);
      var groepOpen = groepIsOpen(g, gr.length);
      var binnen = (kan ? HV.icoon('chevron-down', { maat: 's', klas: 'hv-sm-matrix__pijl' }) : '') + groepTeken(g) +
        '<span class="hv-sm-matrix__groeptekst"><span class="hv-sm-matrix__groepnaam"><span>' + h(P(g.naam)) + '</span><span class="hv-sm-teller">' + g.acties.length + '</span></span>' + groepSom(c) + '</span>';
      var rijen = '<tr class="hv-sm-matrix__groep' + (groepOpen ? ' is-open' : '') + '" data-k="sm-g-' + g.id + '"><th scope="row">' +
        (kan ? '<button type="button" class="hv-sm-matrix__groepknop" aria-expanded="' + groepOpen + '" data-actie="ui" data-naam="sm-g-' + g.id + '" data-waarde="' + (groepOpen ? '0' : '1') + '">' + binnen + '</button>' : '<div class="hv-sm-matrix__groepknop">' + binnen + '</div>') + '</th>' +
        us.map(function (u) { return '<td>' + kolomSom(telStanden([u.id], g.acties), u) + '</td>'; }).join('') + '</tr>';
      if (!groepOpen) return rijen;
      if (!lezen) {
        var paren = []; g.acties.forEach(function (a) { ids.forEach(function (id) { paren.push([id, a.sleutel]); }); });
        rijen += '<tr class="hv-sm-matrix__groepbalk" data-k="sm-gb-' + g.id + '"><td colspan="' + n + '"><div class="hv-sm-matrix__plak">' +
          bulk({ k: 'g-' + g.id, label: t('Для всієї групи й усіх виконавців', 'Voor de hele groep en alle uitvoerders'), paren: paren, gegevens: { bereik: 'groep', groep: g.id, uitvoerder: 'alle' } }) + '</div></td></tr>';
      }
      g.acties.forEach(function (a) {
        var zw = HV.gevaar.isZwaar(a), isOpen = open === a.sleutel;
        rijen += '<tr class="hv-sm-matrix__rij' + (isOpen ? ' is-open' : '') + '" data-k="sm-rij-' + h(a.sleutel) + '"><th scope="row"><div class="hv-sm-matrix__th"><button type="button" class="hv-sm-matrix__actie" aria-expanded="' + isOpen + '" data-actie="sm-open" data-sleutel="' + h(a.sleutel) + '" data-cel="">' +
          '<span class="hv-sm-matrix__actienaam">' + h(P(a.naam)) + '</span>' + (metNiveau && a.niveau !== 'gewoon' ? '<span class="hv-sm-matrix__actiesub">' + o.risico(a.niveau) + '</span>' : '') + '</button>' + (zw ? o.gevolg(P(a.risico), { soort: 'uitroep', kop: t('Ризик', 'Risico') + ': ' + P(a.naam) }) : '') + '</div></th>' +
          us.map(function (u) {
            var s = HV.gevaar.stand(u.id, a.sleutel), gek = isOpen && cel === u.id;
            var label = P(a.naam) + ' · ' + P(u.naam) + ': ' + P(HV.gevaar.standNamen[s]);
            return '<td><button type="button" class="hv-sm-cel is-' + s + (gek ? ' is-gekozen' : '') + zwaarKlas(s, a) + '" aria-expanded="' + gek + '" data-actie="sm-open" data-sleutel="' + h(a.sleutel) + '" data-cel="' + h(u.id) + '" aria-label="' + h(label) + '" title="' + h(P(u.naam) + ': ' + P(HV.gevaar.standNamen[s])) + '">' + standMerk(s, a) + '</button></td>';
          }).join('') + '</tr>';
        if (isOpen) rijen += '<tr class="hv-sm-matrix__uitklap" data-k="sm-uk-' + h(a.sleutel) + '"><td colspan="' + n + '">' + uitklap(a, us, cel) + '</td></tr>';
      });
      return rijen;
    }).join('');
    return '<div class="hv-sm-tabelvak hv-sm-matrixvak" data-k="sm-matrixvak"><table class="hv-sm-matrix" style="--kolommen:' + us.length + '">' + kop + '<tbody>' + lijf + '</tbody></table></div>';
  }
  /** Розгорнутий рядок дії: наслідок і ризик, «Для всіх виконавців» і рядок режимів кожного виконавця (обраний — перший). */
  function uitklap(a, us, cel) {
    var zw = HV.gevaar.isZwaar(a);
    var gekozen = cel ? us.filter(function (u) { return u.id === cel; }) : [];
    var rest = us.filter(function (u) { return u.id !== cel; });
    return '<div class="hv-sm-uitklap" data-k="sm-uitklap">' +
      '<div class="hv-sm-uitklap__links"><div class="hv-sm-uitklap__wat"><p class="hv-sm-uitklap__kop">' + o.risico(a.niveau, { lang: true }) + '<strong>' + h(P(a.naam)) + '</strong></p>' +
      (a.gevolg ? o.gevolgRijen(P(a.gevolg)) : '<p class="hv-sm-rij__gewoon">' + h(t('Звичайна дія: людина виконує одразу; «Повернути» — 10 с у сповіщенні.', 'Gewone actie: een mens voert meteen uit; ‘Ongedaan maken’ 10 s in de melding.')) + '</p>') + '</div>' +
      '<div class="hv-sm-uitklap__alle">' + bulk({ k: 'rij-' + a.sleutel, label: t('Для всіх виконавців', 'Voor alle uitvoerders'), paren: us.map(function (u) { return [u.id, a.sleutel]; }), gegevens: { bereik: 'rij', sleutel: a.sleutel, uitvoerder: 'alle' } }) +
      (zw ? '<p class="hv-sm-noot">' + HV.icoon('key-round', { maat: 's' }) + '<span>' + h(t('«Завжди» тут — після підтвердження входу; позначка «!» стоятиме біля дії й у шапці.', '‘Altijd’ hier — na bevestiging van aanmelding; de ‘!’ blijft bij de actie en in de kopregel staan.')) + '</span></p>' : '') + '</div></div>' +
      '<div class="hv-sm-uitklap__rechts hv-sm-rijen">' + gekozen.concat(rest).map(function (u) { return standRij(u.id, a, { metUitvoerder: true, vast: true, gekozen: u.id === cel }); }).join('') + '</div></div>';
  }
  /** Телефон і один виконавець: картка виконавця, далі групи (типово згорнуті, з лічильниками) з рядками дозволів по 56 px. */
  function lijst(ctx, zicht, u) {
    var wie = HV.gevaar.uitvoerder(u), sm = S();
    var lezen = !magWijzigen(), kan = HV.profielKanInklappen();
    var k = sm.kaders[u], w = ctx.staat;
    var metNiveau = HV.ui.lees('sm-groep', 'niveau') === 'klasse';
    var kopU = '<div class="hv-sm-uitvkop" data-k="sm-uitvkop-' + h(u) + '"><span class="hv-sm-uitvkop__teken">' + HV.icoon(UITVOERDER_ICOON[wie.soort] || 'bot') + '</span><div class="hv-sm-uitvkop__tekst"><h2>' + h(P(wie.naam)) + '</h2><p>' +
      h(({ scene: t('сцени виконують небезпечні кроки лише за «Завжди»', 'scènes voeren gevaarlijke stappen alleen uit bij ‘Altijd’'), automatisering: t('правила «Коли / Якщо / Тоді»', 'regels ‘Wanneer / Als / Dan’'), optimalisatie: t('зарядка, батарея й тепло за ціною', 'laden, batterij en warmte op prijs') })[wie.soort] || t('ШІ-агент через MCP; діє від імені власника, що його під’єднав', 'AI-agent via MCP; werkt namens de eigenaar die hem koppelde')) +
      ' · ' + h(t('сьогодні дій: ', 'acties vandaag: ') + gebruikt(u, w) + (k && k.budget ? ' / ' + k.budget : '')) + '</p></div>' +
      (lezen ? o.chip({ icoon: 'calendar-clock', tekst: t('Рамки: ', 'Kaders: ') + kadersTekst(k) }) : o.knop({ tekst: t('Рамки: ', 'Kaders: ') + kadersTekst(k), icoon: 'calendar-clock', klein: true, soort: 'stil', actie: 'blad', gegevens: { blad: 'smkaders:' + u } })) + '</div>' +
      bulk({ k: 'kolom-' + u, label: t('Для всіх показаних дій', 'Voor alle getoonde acties'), paren: zicht.map(function (a) { return [u, a.sleutel]; }), gegevens: { bereik: 'kolom', uitvoerder: u } });
    // Ключ до знаків сегмента — лише там, де слова сховано (вузька колонка)
    var sleutel = lezen ? '' : '<p class="hv-sm-sleutel" data-k="sm-sleutel">' + ['uit', 'vragen', 'altijd'].map(function (s) { return '<span class="is-' + s + '">' + HV.icoon(STAND_ICOON[s], { maat: 's' }) + h(P(HV.gevaar.standNamen[s])) + '</span>'; }).join('') + '</p>';
    var gr = groepen(zicht);
    var secties = gr.map(function (g) {
      var c = telStanden([u], g.acties), open = groepIsOpen(g, gr.length);
      var binnen = groepTeken(g) + '<span class="hv-sm-sectie__tekst"><span class="hv-sm-sectie__naam"><span>' + h(P(g.naam)) + '</span><span class="hv-sm-teller">' + g.acties.length + '</span></span>' + groepSom(c) + '</span>';
      return '<section class="hv-sm-sectie' + (open ? ' is-open' : '') + '" data-k="sm-sec-' + h(u) + '-' + g.id + '"><h2 class="hv-sm-sectie__kop">' +
        (kan ? '<button type="button" class="hv-sm-sectie__knop" aria-expanded="' + open + '" data-actie="ui" data-naam="sm-g-' + g.id + '" data-waarde="' + (open ? '0' : '1') + '">' + binnen + HV.icoon('chevron-down', { maat: 's', klas: 'hv-sm-sectie__pijl' }) + '</button>' : '<span class="hv-sm-sectie__knop">' + binnen + '</span>') + '</h2>' +
        (open ? '<div class="hv-sm-sectie__lijf">' + bulk({ k: 'g-' + u + '-' + g.id, label: t('Для всієї групи', 'Voor de hele groep'), paren: g.acties.map(function (a) { return [u, a.sleutel]; }), gegevens: { bereik: 'groep', groep: g.id, uitvoerder: u } }) +
          '<div class="hv-sm-rijen">' + g.acties.map(function (a) { return standRij(u, a, { metNiveau: metNiveau }); }).join('') + '</div></div>' : '') + '</section>';
    }).join('');
    return '<div class="hv-sm-lijst" data-k="sm-lijst">' + o.kaart({ klas: 'hv-sm-uitvkaart', inhoud: kopU + sleutel }) + '<div class="hv-sm-blokken">' + secties + '</div></div>';
  }

  // Аркуш рамок виконавця
  HV.blad({
    soort: 'smkaders', vrij: true, icoon: 'calendar-clock',
    titel: function (ctx, id) { return isUitvoerder(id) ? t('Рамки · ', 'Kaders · ') + P(HV.gevaar.uitvoerder(id).naam) : t('Рамки', 'Kaders'); },
    sub: function (ctx, id) { return isUitvoerder(id) ? kadersTekst(S().kaders[id]) : ''; },
    render: function (ctx, id) {
      // Пряме посилання з ідентифікатором, якого немає в реєстрі: «Не знайдено» замість органів для заглушки
      if (!isUitvoerder(id)) return o.leeg({ icoon: 'bot-off', titel: t('Такого виконавця немає', 'Deze uitvoerder bestaat niet'), tekst: t('Рамки задають для сцен, автоматизацій, оптимізатора й під’єднаних агентів із реєстру дозволів.', 'Kaders stel je in voor scènes, automatiseringen, de optimalisatie en gekoppelde agenten uit het register.'), actie: { tekst: t('До реєстру дозволів', 'Naar het register'), icoon: 'table-2', actie: 'ga', gegevens: { naar: 'instellingen-risico' } } });
      var w = ctx.staat, sm = S(w), k = sm.kaders[id] || {};
      var lezen = !magWijzigen();
      var termijn = k.tot ? Math.max(1, Math.round((k.tot - (k.sinds || w.tijd)) / DAG)) : 0;
      var uren = k.uren ? k.uren.join('-') : 'altijd';
      var kamers = k.kamers || [];
      var alleKamersAan = !kamers.length;
      var veld = function (titel, sub, orgaan, key) { return '<div class="hv-sm-kader" data-k="sm-kader-' + key + '"><p class="hv-sm-veldkop">' + h(titel) + '</p>' + (sub ? '<p class="hv-sm-kader__sub">' + sub + '</p>' : '') + orgaan + opgeslagen('kader-' + id + '-' + key) + '</div>'; };
      return '<div class="hv-sm hv-sm-blad" data-k="sm-kaders-' + h(id) + '">' +
        '<p class="hv-sm-kaart__zin">' + h(t('Рамки необов’язкові й діють лише на «Завжди»: поза ними дія йде як «Питати». Задає їх тільки власник.', 'Kaders zijn optioneel en gelden alleen voor ‘Altijd’: daarbuiten gaat de actie als ‘Vragen’. Alleen de eigenaar stelt ze in.')) + '</p>' +
        (k.verlopen ? '<p class="hv-sm-banner is-let-op">' + HV.icoon('calendar-x', { maat: 's' }) + '<span>' + h(t('Строк минув ', 'Termijn verlopen op ') + HV.datumKort(k.verlopen) + t(': усі дозволи цього виконавця повернулися до «Вимкнено».', ': alle toestemmingen van deze uitvoerder staan weer op ‘Uit’.')) + '</span></p>' : '') +
        o.kaart({ inhoud:
          veld(t('Строк', 'Termijn'), k.tot && !k.verlopen ? h(t('до ', 'tot ') + HV.datum(k.tot) + ', ' + HV.tijd(k.tot) + ' · ' + termijnTekst(k.tot) + t(' · потім усе «Вимкнено»', ' · daarna alles ‘Uit’')) : h(t('без строку', 'zonder termijn')),
            segment({ label: t('Строк', 'Termijn'), waarde: k.verlopen ? 0 : termijn, actie: 'sm-kader', gegevens: { uitvoerder: id, veld: 'termijn' }, klas: 'hv-sm-segment--breed', opties: [{ id: 0, label: t('без строку', 'geen') }, { id: 1, label: t('1 день', '1 dag') }, { id: 7, label: t('7 днів', '7 dagen') }, { id: 30, label: t('30 днів', '30 dagen') }] }), 'termijn') +
          veld(t('Години', 'Uren'), h(t('поза годинами «Завжди» стає «Питати»', 'buiten de uren wordt ‘Altijd’ ‘Vragen’')),
            segment({ label: t('Години', 'Uren'), waarde: uren, actie: 'sm-kader', gegevens: { uitvoerder: id, veld: 'uren' }, klas: 'hv-sm-segment--breed', opties: [{ id: 'altijd', label: t('цілодобово', 'hele dag') }, { id: '7-23', label: '07:00–23:00' }, { id: '8-20', label: '08:00–20:00' }, { id: '22-7', label: t('вночі', '’s nachts') }] }), 'uren') +
          veld(t('Бюджет дій', 'Actiebudget'), h(t('сьогодні використано: ', 'vandaag gebruikt: ') + gebruikt(id, w) + t(' · вичерпано — далі «Питати»', ' · op — daarna ‘Vragen’')),
            segment({ label: t('Бюджет дій', 'Actiebudget'), waarde: k.budget || 0, actie: 'sm-kader', gegevens: { uitvoerder: id, veld: 'budget' }, klas: 'hv-sm-segment--breed', opties: [{ id: 0, label: t('без ліміту', 'onbeperkt') }, { id: 10, label: t('10 на добу', '10 per dag') }, { id: 60, label: t('60 на добу', '60 per dag') }, { id: 200, label: t('200 на добу', '200 per dag') }] }), 'budget') +
          veld(t('Кімнати', 'Kamers'), h(alleKamersAan ? t('усі кімнати', 'alle kamers') : t('лише обрані: ', 'alleen gekozen: ') + kamers.length),
            '<div class="hv-filter hv-sm-pillen">' + o.chip({ icoon: 'house', tekst: t('Усі', 'Alle'), filter: true, gekozen: alleKamersAan, actie: lezen ? null : 'sm-kader', gegevens: { uitvoerder: id, veld: 'kamer', waarde: '*' }, k: 'sm-kk-alle' }) + alleKamers().map(function (km) {
              return o.chip({ icoon: km.icoon, tekst: P(km.naam), filter: true, gekozen: kamers.indexOf(km.id) >= 0, actie: lezen ? null : 'sm-kader', gegevens: { uitvoerder: id, veld: 'kamer', waarde: km.id }, k: 'sm-kk-' + km.id });
            }).join('') + '</div>', 'kamers') }) +
        '<div class="hv-knoppen">' + (heeftKaders(k) && !lezen ? o.knop({ tekst: t('Без рамок', 'Zonder kaders'), icoon: 'eraser', soort: 'stil', actie: 'sm-kader', gegevens: { uitvoerder: id, veld: 'alles' } }) : '') +
        o.knop({ tekst: t('До реєстру', 'Naar het register'), icoon: 'table-2', actie: 'sm-naar-uitvoerder', gegevens: { uitvoerder: id } }) + '</div></div>';
    }
  });

  // ═════════════════════════ 5. Сповіщення / Meldingen ═════════════════════════
  var KANALEN = [
    { id: 'app', icoon: 'app-window', naam: ['Застосунок', 'App'], eerlijk: ['працює, поки вкладка відкрита', 'werkt zolang het tabblad open is'], stand: 'ok' },
    { id: 'push', icoon: 'smartphone', naam: ['Сповіщення на пристрій', 'Meldingen op het toestel'], eerlijk: ['етап 4; на айфоні — лише встановлений застосунок, не пробиває «Не турбувати»', 'fase 4; op een iPhone alleen de geïnstalleerde app, gaat niet door ‘Niet storen’'], stand: 'later' },
    { id: 'mail', icoon: 'mail', naam: ['Пошта', 'E-mail'], eerlijk: ['етап 4; повільна, не будить', 'fase 4; traag, maakt niet wakker'], stand: 'later' },
    { id: 'paneel', icoon: 'tablet', naam: ['Звук панелі', 'Geluid van het paneel'], eerlijk: ['етап 4; дозвіл береться дотиком під час сполучення', 'fase 4; toestemming met een tik bij het koppelen'], stand: 'later' },
    { id: 'licht', icoon: 'lightbulb', naam: ['Світло', 'Licht'], eerlijk: ['для тривог: усі лампи 100 %, блимання не частіше 1 Гц', 'bij alarm: alle lampen 100 %, knipperen hoogstens 1 Hz'], stand: 'ok' },
    { id: 'trillen', icoon: 'vibrate', naam: ['Вібрація телефона', 'Trillen van de telefoon'], eerlijk: ['лише Андроїд у відкритому застосунку', 'alleen Android in de geopende app'], stand: 'ok' }
  ];
  var SOORTEN = [
    { id: 'huis.alarm', icoon: 'siren', naam: ['Тривога: дим, газ, вода, вторгнення', 'Alarm: rook, gas, water, inbraak'], vast: true },
    { id: 'huis.toegang', icoon: 'key-round', naam: ['Доступ до дому', 'Toegang tot het huis'], vast: true },
    { id: 'huis.agent', icoon: 'bot', naam: ['Агенти й запити', 'Agenten en verzoeken'] },
    { id: 'huis.automatisering', icoon: 'workflow', naam: ['Автоматика й сцени', 'Automatisering en scènes'] },
    { id: 'huis.apparaat', icoon: 'cpu', naam: ['Пристрої', 'Apparaten'] },
    { id: 'huis.energie', icoon: 'zap', naam: ['Енергія й ціни', 'Energie en prijzen'] },
    { id: 'huis.voertuig', icoon: 'car', naam: ['Транспорт і дрони', 'Voertuigen en drones'] },
    { id: 'huis.systeem', icoon: 'settings', naam: ['Система', 'Systeem'] },
    { id: 'huis.simulatie', icoon: 'flask-conical', naam: ['Симуляція', 'Simulatie'] }
  ];
  function isStilNu(st, w) { if (!st.aan) return false; var u = HV.uur(w.tijd); return st.van < st.tot ? u >= st.van && u < st.tot : u >= st.van || u < st.tot; }
  function uurTekst(n) { return (n < 10 ? '0' : '') + n + ':00'; }

  function meldingenTab(ctx) {
    var w = ctx.staat, sm = S(w), me = sm.meldingen;
    var ik = HV.mens();
    var actief = KANALEN.filter(function (k) { return me.kanalen[k.id] && k.stand === 'ok'; });
    var kritiekeKanalen = actief.length;
    var stil = isStilNu(me.stil, w);
    var held = kop({ id: 'meldingen', icoon: stil ? 'moon' : 'bell-ring', toon: stil ? 'koud' : 'aan', boven: t('Система · Сповіщення', 'Systeem · Meldingen'),
      zin: stil ? t('Зараз тихі години до ', 'Nu stille uren tot ') + uurTekst(me.stil.tot) : t('Сповіщення приходять звичайно', 'Meldingen komen gewoon binnen'),
      sub: h(P(ik.naam) + t(': ваші канали, тихі години й що надсилати. Тривоги й «Доступ до дому» не приглушуються ніколи.', ': je kanalen, stille uren en wat er komt. Alarmen en ‘Toegang tot het huis’ worden nooit gedempt.')),
      chips: actief.map(function (k) { return o.chip({ icoon: k.icoon, tekst: P(k.naam) }); }).join('') + (me.stil.aan ? o.chip({ icoon: 'moon', tekst: uurTekst(me.stil.van) + '–' + uurTekst(me.stil.tot) }) : ''),
      acties: o.knop({ tekst: t('Надіслати пробне', 'Proefmelding sturen'), icoon: 'send', soort: 'hoofd', actie: 'sm-test' }) + o.knop({ tekst: t('Правила доставки', 'Bezorgregels'), icoon: 'list-checks', soort: 'stil', actie: 'ga', gegevens: { naar: 'activiteit-regels' } }) });

    var kanalen = kaart({ id: 'kanalen', icoon: 'radio-tower', titel: t('Канали', 'Kanalen'), teller: actief.length,
      zin: h(t('Чесний стан кожного каналу: що вже працює, а що з’явиться пізніше. Вибір «пізніше» запам’ятовується й увімкнеться сам на етапі 4.', 'De eerlijke stand van elk kanaal: wat nu werkt en wat later komt. Een keuze voor ‘later’ wordt onthouden en gaat vanzelf aan in fase 4.')),
      inhoud: '<div class="hv-sm-regels">' + KANALEN.map(function (k) {
        var aan = !!me.kanalen[k.id];
        return regel({ k: 'kanaal-' + k.id, icoon: k.icoon, naam: P(k.naam), sub: h(P(k.eerlijk)), merk: k.stand === 'later' ? ' ' + o.later(t('пізніше', 'later')) : '',
          orgaan: k.id === 'app' ? '<span class="hv-sm-lees">' + HV.icoon('lock', { maat: 's' }) + '<strong>' + h(t('завжди', 'altijd')) + '</strong></span>'
            : schakelaar({ aan: aan, wie: 'zelf', zelf: ik.id, actie: 'sm-schakel', gegevens: { pad: 'meldingen.kanalen.' + k.id, soort: 'kanaal', wie: 'zelf', zelf: ik.id }, aria: P(k.naam), woordAan: k.stand === 'later' ? t('буде', 'straks') : t('Увімкнено', 'Aan') }) });
      }).join('') + '</div>' });

    var dagen = [{ id: 'elke', label: t('щодня', 'elke dag') }, { id: 'werk', label: t('будні', 'werkdagen') }, { id: 'weekend', label: t('вихідні', 'weekend') }];
    var stilKaart = kaart({ id: 'stil', icoon: 'moon', titel: t('Тихі години', 'Stille uren'),
      rechts: schakelaar({ aan: me.stil.aan, wie: 'zelf', zelf: ik.id, actie: 'sm-schakel', gegevens: { pad: 'meldingen.stil.aan', soort: 'stil', wie: 'zelf', zelf: ik.id }, aria: t('Тихі години', 'Stille uren') }),
      zin: h(stil ? t('Зараз тихо: телефон мовчить, важливе чекає ранку.', 'Nu stil: de telefoon zwijgt, belangrijke meldingen wachten tot de ochtend.') : me.stil.aan ? t('Тиша почнеться о ', 'De stilte begint om ') + uurTekst(me.stil.van) + '.' : t('Тихі години вимкнено.', 'Stille uren staan uit.')),
      inhoud: '<div class="hv-sm-uren' + (me.stil.aan ? '' : ' is-uit') + '">' +
        '<div class="hv-sm-uur"><span class="hv-sm-veldkop">' + h(t('Від', 'Van')) + '</span>' + o.stapper({ actie: 'sm-uur', gegevens: { veld: 'van' }, stap: 1, label: t('Початок тиші', 'Begin van de stilte'), waarde: uurTekst(me.stil.van), k: 'sm-uur-van' }) + '</div>' +
        '<div class="hv-sm-uur"><span class="hv-sm-veldkop">' + h(t('До', 'Tot')) + '</span>' + o.stapper({ actie: 'sm-uur', gegevens: { veld: 'tot' }, stap: 1, label: t('Кінець тиші', 'Einde van de stilte'), waarde: uurTekst(me.stil.tot), k: 'sm-uur-tot' }) + '</div>' +
        '<div class="hv-sm-uur hv-sm-uur--dagen"><span class="hv-sm-veldkop">' + h(t('Дні', 'Dagen')) + '</span>' + segment({ label: t('Дні', 'Dagen'), waarde: me.stil.dagen, actie: 'sm-stel', gegevens: { pad: 'meldingen.stil.dagen', soort: 'dagen' }, wie: 'zelf', zelf: ik.id, opties: dagen }) + '</div>' +
        '</div>' + urenBalk(me.stil, w) + opgeslagen('uur') +
        '<p class="hv-sm-noot">' + HV.icoon('siren', { maat: 's' }) + '<span>' + h(t('Тривоги (дим, газ, вода, вторгнення) і «Доступ до дому» проходять завжди зі звуком.', 'Alarmen (rook, gas, water, inbraak) en ‘Toegang tot het huis’ komen altijd met geluid door.')) + '</span></p>' });

    var NIV = [{ id: 'alles', label: t('Усе', 'Alles') }, { id: 'belangrijk', label: t('Важливе', 'Belangrijk') }, { id: 'niets', label: t('Нічого', 'Niets') }];
    var soorten = kaart({ id: 'soorten', icoon: 'list-filter', titel: t('Що надсилати', 'Wat er binnenkomt'),
      zin: h(t('Записи Журналу пишуться завжди; тут — лише що з’являється як сповіщення.', 'Het logboek schrijft altijd; hier kies je alleen wat als melding verschijnt.')),
      inhoud: '<div class="hv-sm-regels">' + SOORTEN.map(function (s) {
        return regel({ k: 'soort-' + s.id, icoon: s.icoon, naam: P(s.naam), sub: s.vast ? h(t('не приглушується', 'wordt niet gedempt')) : '',
          orgaan: s.vast ? '<span class="hv-sm-lees">' + HV.icoon('lock', { maat: 's' }) + '<strong>' + h(t('Усе', 'Alles')) + '</strong></span>' : segment({ label: P(s.naam), waarde: me.soorten[s.id], actie: 'sm-stel', gegevens: { pad: 'meldingen.soorten.' + s.id, soort: 'meldsoort', naam: s.id }, wie: 'zelf', zelf: ik.id, opties: NIV }) });
      }).join('') + '</div>' });

    var tekort = kritiekeKanalen < 2;
    var kritiek = kaart({ id: 'kritiek', icoon: 'siren', toon: tekort ? 'let-op' : 'ok', titel: t('Критичні сповіщення', 'Kritieke meldingen'),
      rechts: tekort ? o.gevolg(t('Що може статися: про дим чи воду вночі ви дізнаєтеся лише з відкритої вкладки. Хто зможе це запускати: датчики диму, CO, газу й води. Як вимкнути ризик: увімкніть ще один канал — «Світло» чи «Вібрація».', 'Wat er kan gebeuren: je hoort ’s nachts alleen via een geopend tabblad van rook of water. Wie dit kan starten: rook-, CO-, gas- en watermelders. Risico weg: zet nog een kanaal aan — ‘Licht’ of ‘Trillen’.'), { soort: 'uitroep', vast: 'gevaarlijk', kop: t('Ризик', 'Risico') }) : '',
      zin: h(t('Для диму, CO, газу й води потрібні щонайменше два канали. Зараз діє: ', 'Rook, CO, gas en water vragen minstens twee kanalen. Nu actief: ') + kritiekeKanalen + '.'),
      inhoud: '<div class="hv-sm-regels">' + regel({ k: 'herhaal', icoon: 'repeat', naam: t('Повторювати кожні 2 хв, доки ніхто не відповів', 'Elke 2 min herhalen tot iemand reageert'), sub: h(t('«Я займаюся» зупиняє повтори для всіх', '‘Ik pak het op’ stopt de herhaling voor iedereen')),
        orgaan: schakelaar({ aan: me.herhaal, actie: 'sm-schakel', gegevens: { pad: 'meldingen.herhaal', soort: 'herhaal' }, aria: t('Повторювати', 'Herhalen') }) }) +
        regel({ k: 'hub', icoon: 'info', naam: t('Хаб не замінює звук датчика', 'De hub vervangt het geluid van de melder niet'), sub: h(t('сирена й звук самого датчика працюють без хаба й без інтернету', 'de sirene en het geluid van de melder zelf werken zonder hub en zonder internet')) }) + '</div>' });

    var test = me.test;
    var testKaart = kaart({ id: 'test', icoon: 'send', titel: t('Перевірка доставки', 'Controle van de bezorging'),
      zin: test ? h(t('Пробне сповіщення о ', 'Proefmelding om ') + HV.tijd(test.tijd)) : h(t('Надішліть пробне сповіщення — кожен канал покаже, чи дійшло.', 'Stuur een proefmelding — elk kanaal laat zien of het aankwam.')),
      inhoud: (test ? '<ol class="hv-sm-test">' + test.kanalen.map(function (k) {
        var kd = KANALEN.filter(function (x) { return x.id === k.id; })[0];
        var woord = { wacht: ['надсилається…', 'wordt verstuurd…'], bezorgd: ['доставлено', 'bezorgd'], later: ['ще не існує — етап 4', 'bestaat nog niet — fase 4'], stil: ['без звуку: тихі години', 'zonder geluid: stille uren'] }[k.stand];
        return '<li class="hv-sm-test__rij is-' + k.stand + '" data-k="sm-test-' + k.id + '">' + HV.icoon(kd.icoon, { maat: 's' }) + '<span>' + h(P(kd.naam)) + '</span><strong>' + HV.icoon(k.stand === 'bezorgd' ? 'check' : k.stand === 'wacht' ? 'loader' : k.stand === 'stil' ? 'moon' : 'hourglass', { maat: 's' }) + h(P(woord)) + '</strong></li>';
      }).join('') + '</ol>' : '') + '<div class="hv-knoppen">' + o.knop({ tekst: test ? t('Надіслати ще раз', 'Opnieuw sturen') : t('Надіслати пробне сповіщення', 'Proefmelding sturen'), icoon: 'send', actie: 'sm-test' }) + '</div>' });

    return '<div class="hv-sm hv-sm-meldingen" data-k="sm-meldingen">' + leesBanner(ctx) + held +
      '<div class="hv-sm-rooster"><div class="hv-sm-kolom">' + kanalen + kritiek + testKaart + '</div><div class="hv-sm-kolom">' + stilKaart + soorten + '</div></div></div>';
  }
  /** Доба смугою: тихі години затінено, «зараз» — риска. Власний SVG. */
  function urenBalk(st, w) {
    var stukken = [];
    if (st.aan) { if (st.van < st.tot) stukken.push([st.van, st.tot]); else { stukken.push([st.van, 24]); stukken.push([0, st.tot]); } }
    var nu = HV.uur(w.tijd);
    return '<figure class="hv-sm-balk" data-k="sm-balk"><svg viewBox="0 0 240 28" preserveAspectRatio="none" role="img" aria-label="' + h(st.aan ? t('Тихі години ', 'Stille uren ') + uurTekst(st.van) + '–' + uurTekst(st.tot) : t('Тихих годин немає', 'Geen stille uren')) + '">' +
      '<rect class="hv-sm-balk__spoor" x="0" y="8" width="240" height="12" rx="6"/>' + stukken.map(function (s) { return '<rect class="hv-sm-balk__stil" x="' + (s[0] * 10) + '" y="8" width="' + ((s[1] - s[0]) * 10) + '" height="12" rx="' + (s[1] - s[0] < 1 ? 2 : 6) + '"/>'; }).join('') +
      '<rect class="hv-sm-balk__nu" x="' + (nu * 10 - 1).toFixed(1) + '" y="2" width="2" height="24" rx="1"/></svg>' +
      '<figcaption class="hv-sm-balk__as"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></figcaption></figure>';
  }

  // ───────────────────────── Реєстрація вкладок ─────────────────────────
  HV.tab('instellingen', { id: 'woning', titel: ['Дім', 'Woning'], adres: '/instellingen/woning', render: woning });
  HV.tab('instellingen', { id: 'mensen', titel: ['Люди й доступ', 'Mensen en toegang'], adres: '/instellingen/mensen', render: mensen });
  HV.tab('instellingen', { id: 'privacy', titel: ['Приватність', 'Privacy'], adres: '/instellingen/privacy', render: privacy });
  HV.tab('instellingen', { id: 'risico', titel: ['Дозволи й небезпечні дії', 'Toestemmingen en risicovolle acties'], adres: '/instellingen/risico', render: risico });
  HV.tab('instellingen', { id: 'meldingen', titel: ['Сповіщення', 'Meldingen'], adres: '/instellingen/meldingen', render: meldingenTab });

  // ═════════════════════════ Дії ═════════════════════════
  var WOORDEN = {
    tz: function (v) { var x = TIJDZONES.filter(function (z) { return z.id === v; })[0]; return x ? [x.uk, x.nl] : [v, v]; },
    taal: function (v) { return v === 'nl' ? ['нідерландська', 'Nederlands'] : ['українська', 'Oekraïens']; },
    week: function (v) { return v === 'zo' ? ['неділя', 'zondag'] : ['понеділок', 'maandag']; },
    temp: function (v) { return v === 'f' ? ['°F', 'graden Fahrenheit'] : ['°C', 'graden Celsius']; },
    afstand: function (v) { return v === 'mi' ? ['милі', 'mijl'] : ['кілометри', 'kilometer']; },
    weer: function (v) { return v === 'station' ? ['метеостанція на даху', 'weerstation op het dak'] : ['KNMI', 'het KNMI']; },
    zicht: function (v) { var z = ZICHT.filter(function (x) { return x.id === v; })[0]; return z ? z.label : [v, v]; },
    agentlocatie: function (v) { return { niets: ['нічого', 'niets'], algemeen: ['узагальнено', 'algemeen'], precies: ['точно', 'precies'] }[v]; },
    bewaar: function (v) { var n = Number(v); return n === 0 ? ['не зберігати', 'niet bewaren'] : [n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дні' : 'днів'), n + (n === 1 ? ' dag' : ' dagen')]; },
    dagen: function (v) { return { elke: ['щодня', 'elke dag'], werk: ['будні', 'werkdagen'], weekend: ['вихідні', 'weekend'] }[v]; },
    meldsoort: function (v) { return { alles: ['усе', 'alles'], belangrijk: ['важливе', 'belangrijk'], niets: ['нічого', 'niets'] }[v]; }
  };
  var ONDERWERP = {
    tz: ['Часовий пояс дому', 'Tijdzone van het huis'], taal: ['Мова дому', 'Taal van het huis'], week: ['Перший день тижня', 'Eerste dag van de week'], temp: ['Одиниця температури', 'Eenheid van temperatuur'],
    afstand: ['Одиниця відстані', 'Eenheid van afstand'], weer: ['Джерело погоди', 'Weerbron'], agentlocatie: ['Агентам про присутність', 'Agenten over aanwezigheid'], dagen: ['Дні тихих годин', 'Dagen van de stille uren']
  };
  function onderwerp(g) {
    if (g.soort === 'zicht') { var m = persoon(g.naam), v = HV.staat.w.voertuigen.filter(function (x) { return x.id === g.naam; })[0]; var n = m ? m.naam : v ? v.naam : [g.naam, g.naam]; return ['Хто бачить місце: ' + n[0], 'Wie de locatie ziet: ' + n[1]]; }
    if (g.soort === 'bewaar') { var b = BEWAAR.filter(function (x) { return x.id === g.naam; })[0]; return ['Строк зберігання: ' + b.naam[0], 'Bewaartermijn: ' + b.naam[1]]; }
    if (g.soort === 'meldsoort') { var s = SOORTEN.filter(function (x) { return x.id === g.naam; })[0]; return ['Сповіщення: ' + s.naam[0], 'Meldingen: ' + s.naam[1]]; }
    return ONDERWERP[g.soort] || [g.pad, g.pad];
  }
  HV.actie('sm-stel', function (ctx, g) {
    var waarde = isNaN(Number(g.waarde)) || g.waarde === '' ? g.waarde : Number(g.waarde);
    if (g.soort === 'tz' || g.soort === 'taal' || g.soort === 'week' || g.soort === 'temp' || g.soort === 'afstand' || g.soort === 'weer' || g.soort === 'agentlocatie' || g.soort === 'zicht' || g.soort === 'dagen' || g.soort === 'meldsoort') waarde = String(g.waarde);
    var oud = lees(g.pad);
    if (String(oud) === String(waarde)) return;
    var woord = WOORDEN[g.soort] || function (v) { return [String(v), String(v)]; };
    var wie = ['dagen', 'meldsoort'].indexOf(g.soort) >= 0 ? 'zelf' : 'eigenaar';
    var p = { pad: g.pad, waarde: waarde, wat: onderwerp(g), was: woord(oud), werd: woord(waarde), k: g.soort === 'zicht' ? 'zicht-' + g.naam : g.soort === 'bewaar' ? 'bewaar-' + g.naam : g.soort === 'meldsoort' ? 'soort-' + g.naam : g.soort === 'dagen' ? 'uur' : g.soort, soort: g.soort === 'zicht' || g.soort === 'agentlocatie' || g.soort === 'bewaar' ? 'huis.toegang' : 'huis.systeem', wie: wie, zelf: HV.mens().id, icoon: 'settings-2' };
    if (g.soort === 'agentlocatie' && waarde === 'precies') { p.gevaar = { niveau: 'gevaarlijk', naam: ['Точна присутність для агентів', 'Precieze aanwezigheid voor agenten'], gevolg: ['Що станеться: хмарна модель отримуватиме, хто саме й коли вдома. Пов’язано з: кожен агент із дозволом на читання. Як повернути: оберіть «Узагальнено» — діє одразу.', 'Wat er gebeurt: een cloudmodel krijgt wie precies wanneer thuis is. Hangt samen met: elke agent met leestoestemming. Terugdraaien: kies ‘Algemeen’ — werkt meteen.'] }; p.gewicht = 'belangrijk'; }
    if (g.soort === 'bewaar') { var b = BEWAAR.filter(function (x) { return x.id === g.naam; })[0]; if (waarde > b.advies) p.gewicht = 'belangrijk'; }
    stel(p);
  });
  HV.actie('sm-schakel', function (ctx, g) {
    var oud = !!lees(g.pad), nieuw = !oud;
    var titels = {
      afval: ['Нагадування про сміття', 'Herinnering voor het afval'], bron: ['Ознака присутності', 'Signaal van aanwezigheid'], toestemming: ['Згода', 'Toestemming'],
      kanaal: ['Канал сповіщень', 'Meldingskanaal'], stil: ['Тихі години', 'Stille uren'], herhaal: ['Повтор критичних сповіщень', 'Herhalen van kritieke meldingen']
    };
    var delen = g.pad.split('.');
    var wat = titels[g.soort] || [g.pad, g.pad];
    if (g.soort === 'bron' || g.soort === 'toestemming') { var m = persoon(delen[1]); wat = [wat[0] + ' · ' + m.naam[0] + ': ' + delen[3], wat[1] + ' · ' + m.naam[1] + ': ' + delen[3]]; }
    if (g.soort === 'kanaal') { var kd = KANALEN.filter(function (k) { return k.id === delen[2]; })[0]; wat = [wat[0] + ': ' + kd.naam[0], wat[1] + ': ' + kd.naam[1]]; }
    var p = { pad: g.pad, waarde: nieuw, wat: wat, was: oud ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: nieuw ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], k: g.soort === 'afval' ? 'afval' : g.soort === 'stil' ? 'uur' : g.soort === 'kanaal' ? 'kanaal-' + delen[2] : g.soort === 'herhaal' ? 'herhaal' : (g.soort === 'bron' ? 'bron-' : 'toe-') + delen[1] + '-' + delen[3],
      wie: g.wie || 'eigenaar', zelf: g.zelf, soort: g.soort === 'toestemming' || g.soort === 'bron' ? 'huis.toegang' : 'huis.systeem' };
    if (g.soort === 'toestemming' && nieuw && (delen[3] === 'wolk' || delen[3] === 'locatie')) p.gevaar = { niveau: 'gevaarlijk', naam: delen[3] === 'wolk' ? ['Мої дані хмарній моделі', 'Mijn gegevens naar een cloudmodel'] : ['Точне місце для інших дорослих', 'Precieze locatie voor andere volwassenen'], gevolg: delen[3] === 'wolk' ? ['Що станеться: перед кожним новим типом даних з’явиться аркуш «Що буде надіслано». Пов’язано з: дозволи агентів на читання. Як повернути: вимкніть згоду — діє одразу.', 'Wat er gebeurt: vóór elk nieuw soort gegevens verschijnt het blad ‘Wat wordt verzonden’. Hangt samen met: de leestoestemmingen van agenten. Terugdraaien: zet de toestemming uit — werkt meteen.'] : ['Що станеться: інші дорослі бачитимуть ваше точне місце на мапі. Пов’язано з: перемикач «Місцезнаходження» в «Приватності». Як повернути: вимкніть згоду.', 'Wat er gebeurt: andere volwassenen zien je precieze plek op de kaart. Hangt samen met: de schakelaar ‘Locatie’ onder ‘Privacy’. Terugdraaien: zet de toestemming uit.'] };
    stel(p);
  });
  HV.actie('sm-drie', function (ctx, g) {
    var d = DRIE.filter(function (x) { return x.id === g.id; })[0], oud = !!S().privacy[d.id], nieuw = !oud;
    stel({ pad: 'privacy.' + d.id, waarde: nieuw, wat: ['Приватність: ' + d.naam[0].toLowerCase(), 'Privacy: ' + d.naam[1].toLowerCase()], was: oud ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: nieuw ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'],
      k: 'drie-' + d.id, soort: 'huis.toegang', gewicht: nieuw ? 'belangrijk' : 'info', icoon: d.icoon,
      gevaar: nieuw ? { niveau: 'gevaarlijk', naam: ['Увімкнути: ' + d.naam[0].toLowerCase(), d.naam[1] + ' aanzetten'], gevolg: d.gevolg } : null });
  });
  HV.actie('sm-prive', function (ctx, g) {
    var l = S().privacy.prive, is = l.indexOf(g.kamer) >= 0, k = HV.staat.kamer(g.kamer);
    var nieuw = is ? l.filter(function (x) { return x !== g.kamer; }) : l.concat([g.kamer]);
    stel({ pad: 'privacy.prive', waarde: nieuw, wat: ['Приватна кімната: ' + k.naam[0], 'Privékamer: ' + k.naam[1]], was: is ? ['приватна', 'privé'] : ['для всіх', 'voor iedereen'], werd: is ? ['для всіх', 'voor iedereen'] : ['приватна', 'privé'], k: ctx.route.blad ? 'kprive-' + g.kamer : 'prive', soort: 'huis.toegang', icoon: 'eye-off' });
  });

  // Woning: текстові поля (на «change», не на кожну літеру)
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute || !el.hasAttribute('data-sm-veld')) return;
    var veld = el.getAttribute('data-sm-veld'), waarde = String(el.value || '').trim().slice(0, 60);
    if (veld === 'uitn-naam') { var u = uitnStaat(); u.naam = [waarde || u.naam[0], waarde || u.naam[1]]; HV.ui.zet('sm-uitn', u); return; }
    if (!waarde) { HV.teken(); return; }
    if (veld.indexOf('kamer:') === 0) {
      var id = veld.slice(6), k = HV.staat.kamer(id);
      if (!k || P(k.naam) === waarde) return;
      var i = HV.taal() === 'nl' ? 1 : 0, oudNaam = k.naam.slice();
      var nieuwNaam = oudNaam.slice(); nieuwNaam[i] = waarde; if (oudNaam[0] === oudNaam[1] || S().nieuweKamers.indexOf(id) >= 0) nieuwNaam = [waarde, waarde];
      if (!isEigenaar()) { weigerRol(); HV.teken(); return; }
      HV.staat.wijzig(function () { k.naam = nieuwNaam; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Кімнату перейменовано', 'Kamer hernoemd'], was: oudNaam, werd: nieuwNaam, soort: 'huis.systeem' });
      markeer('veld-kamer:' + id, 'ok');
      HV.meld({ maker: HV.mens(), icoon: 'pencil', titel: t('Кімнату перейменовано', 'Kamer hernoemd'), tekst: P(oudNaam) + ' → ' + waarde, terug: function () { HV.staat.wijzig(function () { k.naam = oudNaam; }); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: назву кімнати', 'Ongedaan gemaakt: naam van de kamer'], soort: 'huis.systeem' }); } });
      return;
    }
    var wo = S().woning;
    var paden = { naam: 'woning.naam', straat: 'woning.straat', postcode: 'woning.postcode', plaats: 'woning.plaats' };
    if (!paden[veld]) return;
    var oud = wo[veld], paar = Array.isArray(oud);
    var nieuw = paar ? (HV.taal() === 'nl' ? [oud[0], waarde] : [waarde, oud[1]]) : waarde;
    if ((paar ? P(oud) : oud) === waarde) return;
    var namen = { naam: ['Назва дому', 'Naam van het huis'], straat: ['Адреса дому', 'Adres van het huis'], postcode: ['Поштовий індекс', 'Postcode'], plaats: ['Місто', 'Plaats'] };
    stel({ pad: paden[veld], waarde: nieuw, wat: namen[veld], was: paar ? oud : [oud, oud], werd: paar ? nieuw : [waarde, waarde], k: 'veld-' + veld, icoon: 'pencil',
      na: veld === 'straat' ? function (w, v) { HV.paspoort.adres = v; } : veld === 'naam' ? function (w, v) { HV.paspoort.naam = v.slice(); } : veld === 'plaats' ? function (w, v) { HV.paspoort.plaats = v.slice(); } : null }).then(function (r) { if (!r || !r.ok) { el.value = paar ? P(oud) : oud; HV.teken(); } });
  });

  HV.actie('sm-kamer-nieuw', function (ctx, g) {
    if (!isEigenaar()) return weigerRol();
    var w = HV.staat.w, sm = S(w), n = 1;
    while (HV.staat.kamer('nieuw' + n)) n++;
    var id = 'nieuw' + n, verd = g.verdieping || 'beneden';
    var naam = ['Нова кімната ' + n, 'Nieuwe kamer ' + n];
    HV.staat.wijzig(function (x) { x.kamers.push({ id: id, verdieping: verd, icoon: 'flower-2', naam: naam, waar: ['у кімнаті «' + naam[0] + '»', 'in ‘' + naam[1] + '’'] }); S(x).nieuweKamers.push(id); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Додано кімнату «' + naam[0] + '»', 'Kamer ‘' + naam[1] + '’ toegevoegd'], soort: 'huis.systeem' });
    HV.meld({ maker: HV.mens(), icoon: 'plus', titel: t('Кімнату додано', 'Kamer toegevoegd'), tekst: P(naam), terug: function () { verwijderKamer(id); } });
    void sm;
    ctx.blad('smkamer:' + id);
  });
  function verwijderKamer(id) {
    HV.staat.wijzig(function (x) { x.kamers = x.kamers.filter(function (k) { return k.id !== id; }); var s = S(x); s.nieuweKamers = s.nieuweKamers.filter(function (k) { return k !== id; }); s.privacy.prive = s.privacy.prive.filter(function (k) { return k !== id; }); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Кімнату вилучено', 'Kamer verwijderd'], soort: 'huis.systeem' });
    var r = HV.route();
    if (r.blad && r.blad.type === 'smkamer' && r.blad.id === id) HV.bladOpen(null);
  }
  HV.actie('sm-kamer-weg', function (ctx, g) {
    if (!isEigenaar()) return weigerRol();
    var k = HV.staat.kamer(g.kamer);
    if (!k || HV.kijk.inKamer(k.id).length) return;
    var kop2 = kopie(k);
    verwijderKamer(k.id);
    HV.meld({ maker: HV.mens(), icoon: 'trash-2', titel: t('Кімнату вилучено', 'Kamer verwijderd'), tekst: P(kop2.naam), terug: function () { HV.staat.wijzig(function (x) { x.kamers.push(kop2); S(x).nieuweKamers.push(kop2.id); }); } });
  });
  HV.actie('sm-kamer', function (ctx, g) {
    var k = HV.staat.kamer(g.kamer);
    if (!k) return;
    var veld = g.veld, oud = k[veld], waarde = g.waarde;
    if (oud === waarde) return;
    var namen = { verdieping: ['Поверх кімнати «' + k.naam[0] + '»', 'Verdieping van ‘' + k.naam[1] + '’'], icoon: ['Знак кімнати «' + k.naam[0] + '»', 'Teken van ‘' + k.naam[1] + '’'] };
    var vn = function (id) { var v = HV.staat.w.verdiepingen.filter(function (x) { return x.id === id; })[0]; return v ? v.naam : [id, id]; };
    var icn = function (ic) { return KAMER_ICOON_NAAM[ic] || ['інший знак', 'ander teken']; };
    if (!isEigenaar()) return weigerRol();
    HV.staat.wijzig(function () { k[veld] = waarde; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: namen[veld], was: veld === 'verdieping' ? vn(oud) : icn(oud), werd: veld === 'verdieping' ? vn(waarde) : icn(waarde), soort: 'huis.systeem' });
    markeer('kamer-' + veld + '-' + k.id, 'ok');
    HV.meld({ maker: HV.mens(), icoon: veld === 'icoon' ? waarde : 'layers', titel: P(namen[veld]), tekst: veld === 'verdieping' ? P(vn(oud)) + ' → ' + P(vn(waarde)) : '', terug: function () { HV.staat.wijzig(function () { k[veld] = oud; }); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: ' + namen[veld][0], 'Ongedaan gemaakt: ' + namen[veld][1]], soort: 'huis.systeem' }); } });
  });
  // Ціль кімнати — справжня дія через HV.doe (ворота, Журнал, «Повернути» дає ядро)
  HV.actie('sm-kamer-doel', function (ctx, g) {
    var k = HV.staat.kamer(g.kamer);
    if (!k || k.doel == null) return;
    var nieuw = Math.max(5, Math.min(30, k.doel + Number(g.richting) * Number(g.stap || 0.5)));
    ctx.doe({ doel: 'kamer:' + k.id, mogelijkheid: 'doel', waarde: nieuw });
  });

  // ── Люди ──
  HV.actie('sm-rol', function (ctx, g) {
    var m = persoon(g.persoon);
    if (!m || m.rol === g.waarde) return;
    if (m.rol === 'eigenaar' && eigenaars().length <= 1) return weigerRol(t('Останнього власника змінити не можна.', 'De laatste eigenaar kan niet wijzigen.'));
    if (!isEigenaar()) return weigerRol();
    var oud = m.rol, nieuw = g.waarde;
    var doen = function () {
      HV.staat.wijzig(function () { m.rol = nieuw; m.gast = nieuw === 'gast'; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Роль: ' + m.naam[0], 'Rol: ' + m.naam[1]], was: ROL_NAAM[oud], werd: ROL_NAAM[nieuw], soort: 'huis.toegang', gewicht: 'belangrijk' });
      markeer('rol-' + m.id, 'ok');
      HV.meld({ maker: HV.mens(), icoon: ROL_ICOON[nieuw], gewicht: 'belangrijk', titel: t('Доступ до дому: роль змінено', 'Toegang tot het huis: rol gewijzigd'), tekst: P(m.naam) + ': ' + P(ROL_NAAM[oud]) + ' → ' + P(ROL_NAAM[nieuw]),
        terug: function () { HV.staat.wijzig(function () { m.rol = oud; m.gast = oud === 'gast'; }); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто: роль ' + m.naam[0], 'Ongedaan gemaakt: rol van ' + m.naam[1]], was: ROL_NAAM[nieuw], werd: ROL_NAAM[oud], soort: 'huis.toegang' }); } });
    };
    // підвищення до власника чи мешканця — небезпечне: людина отримає замки й охорону
    if ((nieuw === 'eigenaar' || nieuw === 'bewoner') && ['kind', 'gast'].indexOf(oud) >= 0 || nieuw === 'eigenaar') {
      HV.schil.gevaar({ actie: { sleutel: 'rol', niveau: nieuw === 'eigenaar' ? 'kritiek' : 'gevaarlijk', naam: ['Роль «' + ROL_NAAM[nieuw][0] + '» для ' + m.naam[0], 'Rol ‘' + ROL_NAAM[nieuw][1] + '’ voor ' + m.naam[1]],
        gevolg: nieuw === 'eigenaar' ? ['Що станеться: ' + m.naam[0] + ' зможе змінювати дозволи, ролі й рамки, як ви. Пов’язано з: замки, охорона, агенти. Як повернути: змінити роль назад може будь-який власник.', 'Wat er gebeurt: ' + m.naam[1] + ' kan toestemmingen, rollen en kaders wijzigen, net als jij. Hangt samen met: sloten, alarm, agenten. Terugdraaien: elke eigenaar kan de rol terugzetten.']
          : ['Що станеться: ' + m.naam[0] + ' керуватиме замками й охороною з підтвердженням входу. Пов’язано з: кімнати людини лишаються, як задано. Як повернути: оберіть іншу роль.', 'Wat er gebeurt: ' + m.naam[1] + ' bedient sloten en alarm met bevestiging van aanmelding. Hangt samen met: de kamers van de persoon blijven zoals ingesteld. Terugdraaien: kies een andere rol.'] }, naam: P(m.naam) })
        .then(function (ja) { if (ja) doen(); else { markeer('rol-' + m.id, 'fout'); HV.teken(); } });
      return;
    }
    doen();
  });
  HV.actie('sm-mens-kamer', function (ctx, g) {
    var m = persoon(g.persoon), x = S().mensen[g.persoon];
    if (!m) return;
    var oud = x.kamers ? x.kamers.slice() : null, nieuw;
    if (g.kamer === '*') nieuw = null;
    else {
      var basis = oud || alleKamers().map(function (k) { return k.id; });
      nieuw = basis.indexOf(g.kamer) >= 0 ? basis.filter(function (k) { return k !== g.kamer; }) : basis.concat([g.kamer]);
      if (nieuw.length === alleKamers().length) nieuw = null;
    }
    var tekst = function (l) { return l ? [l.length + ' кімн.', l.length + ' kamers'] : ['усі кімнати', 'alle kamers']; };
    stel({ pad: 'mensen.' + g.persoon + '.kamers', waarde: nieuw, wat: ['Кімнати: ' + m.naam[0], 'Kamers: ' + m.naam[1]], was: tekst(oud), werd: tekst(nieuw), k: 'kamers-' + g.persoon, soort: 'huis.toegang', icoon: 'door-open' });
  });
  HV.actie('sm-termijn', function (ctx, g) {
    var m = persoon(g.persoon), x = S().mensen[g.persoon], w = HV.staat.w;
    if (!m) return;
    var d = Number(g.dagen), oud = x.tot;
    var nieuw = d === 0 ? w.tijd : Math.max(oud && oud > w.tijd ? oud : w.tijd, w.tijd) + d * DAG;
    var f = function (v) { return v ? [HV.datumKort(v) + ' ' + HV.tijd(v), HV.datumKort(v) + ' ' + HV.tijd(v)] : ['безстроково', 'zonder termijn']; };
    stel({ pad: 'mensen.' + g.persoon + '.tot', waarde: nieuw, wat: [d === 0 ? 'Доступ завершено: ' + m.naam[0] : 'Строк доступу: ' + m.naam[0], d === 0 ? 'Toegang beëindigd: ' + m.naam[1] : 'Termijn van toegang: ' + m.naam[1]], was: f(oud), werd: f(nieuw), k: 'termijn-' + g.persoon, soort: 'huis.toegang', gewicht: 'belangrijk', icoon: 'timer' });
  });
  HV.actie('sm-aanwezig', function (ctx, g) {
    var m = persoon(g.persoon);
    if (!m) return;
    var thuis = g.waarde === 'thuis';
    if (m.thuis === thuis && m.zeker === 'zeker') return;
    if (!isEigenaar() && HV.mens().id !== m.id) return weigerRol(t('Позначити може сама людина або власник.', 'Markeren kan de persoon zelf of de eigenaar.'));
    var oud = { thuis: m.thuis, zeker: m.zeker, sinds: m.sinds };
    HV.staat.wijzig(function (w) { m.thuis = thuis; m.zeker = 'zeker'; m.sinds = w.tijd; });
    HV.logboek.voegToe({ maker: HV.mens(), wat: [m.naam[0] + ': позначено вручну', m.naam[1] + ': handmatig gemarkeerd'], was: oud.thuis ? ['вдома', 'thuis'] : ['не вдома', 'niet thuis'], werd: thuis ? ['вдома', 'thuis'] : ['не вдома', 'niet thuis'], soort: 'huis.toegang' });
    HV.meld({ maker: HV.mens(), icoon: thuis ? 'log-in' : 'log-out', titel: P(m.naam) + ': ' + (thuis ? t('вдома', 'thuis') : t('не вдома', 'niet thuis')), tekst: t('Позначено вручну; діє до наступної ознаки.', 'Handmatig gemarkeerd; geldt tot het volgende signaal.'),
      terug: function () { HV.staat.wijzig(function () { m.thuis = oud.thuis; m.zeker = oud.zeker; m.sinds = oud.sinds; }); } });
  });
  HV.actie('sm-code', function (ctx, g) {
    var m = persoon(g.persoon), x = S().mensen[g.persoon];
    if (!m) return;
    if (!isEigenaar() && HV.mens().id !== m.id) return weigerRol();
    if (g.doe === 'weg') {
      var oud = x.code;
      HV.staat.wijzig(function () { x.code = null; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Особистий код відкликано: ' + m.naam[0], 'Persoonlijke code ingetrokken: ' + m.naam[1]], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'key-round', gewicht: 'belangrijk', titel: t('Код відкликано', 'Code ingetrokken'), tekst: P(m.naam), terug: function () { HV.staat.wijzig(function () { x.code = oud; }); } });
      return;
    }
    // новий код: шість цифр, показано один раз; зміна коду — небезпечна дія з рейкою (код відкриває чутливе на панелі)
    HV.schil.gevaar({ actie: { sleutel: 'code', niveau: 'gevaarlijk', naam: [x.code ? 'Змінити особистий код' : 'Задати особистий код', x.code ? 'Persoonlijke code wijzigen' : 'Persoonlijke code instellen'],
      gevolg: ['Що станеться: з’явиться новий код із 6 цифр — його покажуть один раз; старий перестане діяти. Пов’язано з: панелі в домі; у Журналі стоятиме знак ' + m.naam[0] + '. Як повернути: «Відкликати».', 'Wat er gebeurt: er komt een nieuwe code van 6 cijfers — één keer getoond; de oude werkt niet meer. Hangt samen met: panelen in huis; in het logboek staat het teken van ' + m.naam[1] + '. Terugdraaien: ‘Intrekken’.'] }, naam: P(m.naam) }).then(function (ja) {
      if (!ja) return;
      var cijfers = ''; for (var i = 0; i < 6; i++) cijfers += Math.floor(Math.random() * 10);
      HV.staat.wijzig(function (w) { x.code = { gezet: w.tijd, nieuw: { cijfers: cijfers.slice(0, 3) + ' ' + cijfers.slice(3), echt: Date.now() } }; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Особистий код задано: ' + m.naam[0], 'Persoonlijke code ingesteld: ' + m.naam[1]], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'key-round', gewicht: 'belangrijk', titel: t('Доступ до дому: новий код', 'Toegang tot het huis: nieuwe code'), tekst: P(m.naam) });
      setTimeout(function () { HV.teken(); }, 20100);
    });
  });
  HV.actie('sm-intrekken', function (ctx, g) {
    var m = persoon(g.persoon), x = S().mensen[g.persoon];
    if (!m || !isEigenaar()) return weigerRol();
    if (m.rol === 'eigenaar' && eigenaars().length <= 1) return weigerRol(t('Останнього власника вилучити не можна.', 'De laatste eigenaar kan niet worden verwijderd.'));
    if (x.ingetrokken) {
      HV.staat.wijzig(function () { x.ingetrokken = false; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Доступ відновлено: ' + m.naam[0], 'Toegang hersteld: ' + m.naam[1]], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'user-check', gewicht: 'belangrijk', titel: t('Доступ відновлено', 'Toegang hersteld'), tekst: P(m.naam) });
      return;
    }
    HV.schil.gevaar({ actie: { sleutel: 'persoon.verwijderen', niveau: 'kritiek', naam: ['Відкликати доступ: ' + m.naam[0], 'Toegang intrekken: ' + m.naam[1]],
      gevolg: ['Що станеться: ' + m.naam[0] + ' вийде з усіх сеансів, особистий код і запрошення перестануть діяти. Пов’язано з: агенти, під’єднані цією людиною, призупиняться. Як повернути: «Відновити доступ» на цій сторінці.', 'Wat er gebeurt: ' + m.naam[1] + ' wordt overal afgemeld, de persoonlijke code en uitnodigingen werken niet meer. Hangt samen met: agenten die deze persoon koppelde, pauzeren. Terugdraaien: ‘Toegang herstellen’ op deze pagina.'] }, naam: P(m.naam) }).then(function (ja) {
      if (!ja) return;
      HV.staat.wijzig(function () { x.ingetrokken = true; x.code = null; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Доступ відкликано: ' + m.naam[0], 'Toegang ingetrokken: ' + m.naam[1]], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'user-x', gewicht: 'belangrijk', titel: t('Доступ до дому: відкликано', 'Toegang tot het huis: ingetrokken'), tekst: P(m.naam) });
    });
  });
  HV.actie('sm-sessies', function (ctx, g) {
    var m = persoon(g.persoon);
    HV.meld({ icoon: 'monitor-smartphone', titel: t('Сеанси й ключі: id.tarasevych.com', 'Sessies en sleutels: id.tarasevych.com'), tekst: (m ? P(m.naam) + ' · ' : '') + t('у макеті ця служба не відкривається; на справжньому сайті відкриється в новій вкладці.', 'in de maquette gaat deze dienst niet open; op de echte site opent hij in een nieuw tabblad.') });
  });
  HV.actie('sm-recht', function (ctx, g) {
    var oud = S().rechten[g.rol][g.gebied];
    if (oud === g.waarde) return;
    var gb = GEBIEDEN.filter(function (x) { return x.id === g.gebied; })[0], nm = function (v) { return RECHT.filter(function (r) { return r.id === v; })[0].naam; };
    stel({ pad: 'rechten.' + g.rol + '.' + g.gebied, waarde: g.waarde, wat: ['Права ролі «' + ROL_NAAM[g.rol][0] + '»: ' + gb.naam[0], 'Rechten van ‘' + ROL_NAAM[g.rol][1] + '’: ' + gb.naam[1]], was: nm(oud), werd: nm(g.waarde), k: 'recht-' + g.gebied + '-' + g.rol, soort: 'huis.toegang', gewicht: 'belangrijk', icoon: ROL_ICOON[g.rol],
      gevaar: g.waarde === 'alles' && ['camera', 'toegang'].indexOf(g.gebied) >= 0 && g.rol !== 'bewoner' ? { niveau: 'gevaarlijk', naam: ['«Усе» для ролі «' + ROL_NAAM[g.rol][0] + '»: ' + gb.naam[0].toLowerCase(), '‘Alles’ voor ‘' + ROL_NAAM[g.rol][1] + '’: ' + gb.naam[1].toLowerCase()],
        gevolg: ['Що станеться: люди цієї ролі зможуть і небезпечні дії області — з рейкою й підтвердженням входу. Пов’язано з: кімнати людини й строк гостя. Як повернути: оберіть «Керує» чи «Немає».', 'Wat er gebeurt: mensen met deze rol kunnen ook gevaarlijke acties in dit gebied — met de rail en bevestiging van aanmelding. Hangt samen met: de kamers van de persoon en de termijn van een gast. Terugdraaien: kies ‘Bedient’ of ‘Geen’.'] } : null });
  });
  HV.actie('sm-recht-herstel', function () {
    stel({ pad: 'rechten', waarde: kopie(STANDAARD_RECHTEN), wat: ['Права ролей скинуто до типових', 'Rechten van rollen naar standaard'], soort: 'huis.toegang', gewicht: 'belangrijk', icoon: 'rotate-ccw' });
  });

  // Запрошення
  HV.actie('sm-uitnodigen', function (ctx) { if (!isEigenaar()) return weigerRol(); HV.ui.zet('sm-uitn', null); ctx.blad('smuitnodigen'); });
  HV.actie('sm-uitn-stap', function (ctx, g) { var u = uitnStaat(); u.stap = Math.max(1, Math.min(4, Number(g.stap))); HV.ui.zet('sm-uitn', u); });
  HV.actie('sm-uitn-stop', function (ctx) { HV.ui.zet('sm-uitn', null); ctx.blad(null); });
  HV.actie('sm-uitn-zet', function (ctx, g) {
    var u = uitnStaat();
    if (g.veld === 'naam') u.naam = VOORBEELD_NAMEN[Number(g.waarde)].slice();
    if (g.veld === 'rol') u.rol = g.waarde;
    if (g.veld === 'termijn') u.termijn = Number(g.waarde);
    if (g.veld === 'kamer') u.kamers = u.kamers.indexOf(g.waarde) >= 0 ? u.kamers.filter(function (k) { return k !== g.waarde; }) : u.kamers.concat([g.waarde]);
    HV.ui.zet('sm-uitn', u);
  });
  HV.actie('sm-uitn-stuur', function (ctx) {
    if (!isEigenaar()) return weigerRol();
    var u = uitnStaat(), w = HV.staat.w;
    var stuur = function () {
      var id = 'u' + (S().uitnodigingen.length + 1) + '-' + (Date.now() % 1000);
      HV.staat.wijzig(function (x) { S(x).uitnodigingen.unshift({ id: id, naam: u.naam.slice(), rol: u.rol, kamers: u.kamers.slice(), termijn: u.termijn, sinds: x.tijd, tot: u.termijn ? x.tijd + u.termijn * DAG : null, stand: 'verstuurd' }); });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Запрошення: ' + u.naam[0] + ' (' + ROL_NAAM[u.rol][0].toLowerCase() + ')', 'Uitnodiging: ' + u.naam[1] + ' (' + ROL_NAAM[u.rol][1].toLowerCase() + ')'], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'send', gewicht: 'belangrijk', titel: t('Доступ до дому: запрошення надіслано', 'Toegang tot het huis: uitnodiging verstuurd'), tekst: P(u.naam) + ' · ' + P(ROL_NAAM[u.rol]),
        terug: function () { HV.staat.wijzig(function (x) { var r = S(x).uitnodigingen.filter(function (y) { return y.id === id; })[0]; if (r) r.stand = 'ingetrokken'; }); HV.logboek.voegToe({ maker: HV.mens(), wat: ['Запрошення відкликано', 'Uitnodiging ingetrokken'], soort: 'huis.toegang' }); } });
      HV.ui.zet('sm-uitn', null);
      ctx.blad(null);
      void w;
    };
    if (u.rol === 'eigenaar' || u.rol === 'bewoner') {
      HV.schil.gevaar({ actie: { sleutel: 'uitnodiging', niveau: u.rol === 'eigenaar' ? 'kritiek' : 'gevaarlijk', naam: ['Запросити ' + u.naam[0] + ' як «' + ROL_NAAM[u.rol][0] + '»', u.naam[1] + ' uitnodigen als ‘' + ROL_NAAM[u.rol][1] + '’'],
        gevolg: ['Що станеться: після входу ' + u.naam[0] + ' керуватиме замками й охороною' + (u.rol === 'eigenaar' ? ' і змінюватиме дозволи' : '') + '. Пов’язано з: запис «Доступ до дому» для всіх власників. Як повернути: «Відкликати» в списку запрошень.', 'Wat er gebeurt: na het aanmelden bedient ' + u.naam[1] + ' sloten en alarm' + (u.rol === 'eigenaar' ? ' en wijzigt toestemmingen' : '') + '. Hangt samen met: een regel ‘Toegang tot het huis’ voor alle eigenaars. Terugdraaien: ‘Intrekken’ in de lijst met uitnodigingen.'] }, naam: P(u.naam) })
        .then(function (ja) { if (ja) stuur(); });
      return;
    }
    stuur();
  });
  HV.actie('sm-uitn', function (ctx, g) {
    if (!isEigenaar()) return weigerRol();
    var sm = S(), u = sm.uitnodigingen.filter(function (x) { return x.id === g.id; })[0];
    if (!u) return;
    if (g.doe === 'intrekken') {
      HV.staat.wijzig(function () { u.stand = 'ingetrokken'; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Запрошення відкликано: ' + u.naam[0], 'Uitnodiging ingetrokken: ' + u.naam[1]], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: HV.mens(), icoon: 'mail-x', titel: t('Запрошення відкликано', 'Uitnodiging ingetrokken'), tekst: P(u.naam), terug: function () { HV.staat.wijzig(function () { u.stand = 'verstuurd'; }); } });
    } else if (g.doe === 'opnieuw') {
      HV.staat.wijzig(function (w) { u.sinds = w.tijd; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Запрошення надіслано ще раз: ' + u.naam[0], 'Uitnodiging opnieuw verstuurd: ' + u.naam[1]], soort: 'huis.toegang' });
      HV.meld({ maker: HV.mens(), icoon: 'send', titel: t('Надіслано ще раз', 'Opnieuw verstuurd'), tekst: P(u.naam) + t(' · посилання діє 48 год', ' · de link werkt 48 u') });
    } else if (g.doe === 'aanvaard') {
      var basisId = u.naam[1].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'gast', id = basisId, n = 2;
      while (persoon(id)) id = basisId + (n++);
      HV.staat.wijzig(function (w) {
        u.stand = 'aanvaard';
        w.mensen.push({ id: id, naam: u.naam.slice(), rol: u.rol, thuis: false, sinds: w.tijd, zeker: 'onbekend', gast: u.rol === 'gast' });
        S(w).mensen[id] = { kamers: u.kamers.length === alleKamers().length ? null : u.kamers.slice(), tot: u.tot, code: null, ingetrokken: false, bronnen: { wifi: false, zone: false, code: false, hand: true }, toestemming: { aanwezigheid: false, locatie: false, camera: false, wolk: false } };
        S(w).privacy.zicht[id] = 'zelf';
      });
      HV.logboek.voegToe({ maker: { soort: 'simulator', naam: ['Симулятор', 'Simulator'] }, wat: [u.naam[0] + ' прийняла запрошення', u.naam[1] + ' heeft de uitnodiging aanvaard'], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: { soort: 'simulator', naam: ['Симулятор', 'Simulator'] }, icoon: 'user-check', gewicht: 'belangrijk', titel: t('Доступ до дому: нова людина', 'Toegang tot het huis: nieuwe persoon'), tekst: P(u.naam) + ' · ' + P(ROL_NAAM[u.rol]) });
    }
  });

  // Приватність: експорт і видалення
  HV.actie('sm-export', function () {
    var sm = S(), ex = sm.privacy.export, ik = HV.mens();
    if (ex && ex.klaar) {
      // справжній файл: що дім знає про цю людину (зріз симуляції)
      var w = HV.staat.w;
      var dani = { persoon: ik.id, naam: ik.naam, rol: ik.rol, huistijd: new Date(w.tijd).toISOString(), toegang: sm.mensen[ik.id], privacy: { camera: sm.privacy.camera, microfoon: sm.privacy.microfoon, locatie: sm.privacy.locatie, zicht: sm.privacy.zicht[ik.id] }, logboek: w.logboek.filter(function (r) { return r.maker && r.maker.id === ik.id; }).slice(0, 200).map(function (r) { return { tijd: new Date(r.tijd).toISOString(), wat: r.wat, was: r.was, werd: r.werd }; }) };
      try {
        var blob = new Blob([JSON.stringify(dani, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = ex.naam; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      } catch (e) { /* без завантажень архів лишається на сервері */ }
      HV.logboek.voegToe({ maker: ik, wat: ['Архів моїх даних завантажено', 'Archief van mijn gegevens gedownload'], soort: 'huis.toegang' });
      HV.staat.wijzig();
      return;
    }
    HV.staat.wijzig(function () { sm.privacy.export = { echt: Date.now(), klaar: false, naam: 'mijn-gegevens-' + ik.id + '.json' }; });
    HV.logboek.voegToe({ maker: ik, wat: ['Експорт моїх даних (AVG)', 'Export van mijn gegevens (AVG)'], waarom: ['файл розкриває розпорядок родини', 'het bestand toont het ritme van het gezin'], soort: 'huis.toegang' });
    var tik = setInterval(function () { HV.teken(); }, 400);
    setTimeout(function () {
      clearInterval(tik);
      HV.staat.wijzig(function (w) { if (w.sm && w.sm.privacy.export) w.sm.privacy.export.klaar = true; });
      HV.meld({ maker: ik, icoon: 'file-check', titel: t('Архів готовий', 'Archief klaar'), tekst: t('Файл містить ваші налаштування й записи Журналу.', 'Het bestand bevat je instellingen en logboekregels.') });
    }, 2500);
  });
  HV.actie('sm-wis', function () {
    var ik = HV.mens();
    HV.schil.gevaar({ actie: { sleutel: 'gegevens.wissen', niveau: 'kritiek', naam: ['Видалити мої дані', 'Mijn gegevens wissen'],
      gevolg: ['Що станеться: історія ваших місць, присутності й знімків з вами буде видалена; Журнал і аудит лишаються (лише додавання). Пов’язано з: звіти «хто вдома» за минуле стануть порожніми. Як повернути: ніяк — видалене не відновлюється.', 'Wat er gebeurt: je plaatsgeschiedenis, aanwezigheid en beelden met jou worden gewist; logboek en controlespoor blijven (alleen toevoegen). Hangt samen met: rapporten ‘wie is thuis’ van vroeger worden leeg. Terugdraaien: niet mogelijk — gewist blijft gewist.'] }, naam: P(ik.naam) }).then(function (ja) {
      if (!ja) return;
      HV.staat.wijzig(function (w) { S(w).privacy.gekeken = S(w).privacy.gekeken.filter(function (g) { return g.icoon !== 'user'; }); });
      HV.logboek.voegToe({ maker: ik, wat: ['Мої дані видалено (AVG)', 'Mijn gegevens gewist (AVG)'], waarom: ['право на видалення', 'recht op vergetelheid'], soort: 'huis.toegang', gewicht: 'belangrijk' });
      HV.meld({ maker: ik, icoon: 'trash-2', gewicht: 'belangrijk', titel: t('Дані видалено', 'Gegevens gewist'), tekst: t('Місця, присутність і знімки. Журнал лишається.', 'Plaatsen, aanwezigheid en beelden. Het logboek blijft.') });
    });
  });

  // ── Дозволи ──
  HV.actie('sm-stand', function (ctx, g) {
    if (!magWijzigen()) return weigerRol();
    var actie = HV.gevaar.actie(g.sleutel), sk = g.uitvoerder + '|' + g.sleutel;
    if (HV.gevaar.stand(g.uitvoerder, g.sleutel) === g.waarde) return;
    var zwaar = HV.gevaar.isZwaar(actie) && g.waarde === 'altijd';
    if (zwaar) HV.ui.zet('sm-wacht', sk);
    HV.gevaar.zetStand(g.uitvoerder, g.sleutel, g.waarde).then(function (r) {
      if (zwaar) HV.ui.zet('sm-wacht', null);
      markeer('stand-' + sk, r && r.ok ? 'ok' : 'fout');
      HV.teken();
    });
  });
  // Гуртове керування: рядок (усі виконавці однієї дії), стовпець (усі показані дії виконавця), група (рівень чи клас).
  HV.actie('sm-groep', function (ctx, g) {
    if (!magWijzigen()) return weigerRol();
    var us = g.uitvoerder && g.uitvoerder !== 'alle' ? [g.uitvoerder] : tabelUitvoerders().map(function (u) { return u.id; });
    var acties;
    if (g.bereik === 'rij') acties = [HV.gevaar.actie(g.sleutel)];
    else if (g.bereik === 'kolom') acties = zichtbareActies();
    else acties = (groepen(zichtbareActies()).filter(function (x) { return x.id === g.groep; })[0] || { acties: [] }).acties;
    var paren = [];
    acties.forEach(function (a) { us.forEach(function (u) { if (HV.gevaar.stand(u, a.sleutel) !== g.waarde) paren.push([u, a]); }); });
    if (!paren.length) return;
    var zwaar = paren.filter(function (p) { return g.waarde === 'altijd' && HV.gevaar.isZwaar(p[1]); });
    var voer = function () {
      var n = 0;
      return paren.reduce(function (vorige, p) { return vorige.then(function (doorgaan) { if (doorgaan === false) return false; return HV.gevaar.zetStand(p[0], p[1].sleutel, g.waarde).then(function (r) { if (r && r.ok) { n++; markeer('stand-' + p[0] + '|' + p[1].sleutel, 'ok'); return true; } return false; }); }); }, Promise.resolve(true))
        .then(function () {
          HV.meld({ maker: HV.mens(), icoon: 'shield-check', titel: t('Гуртово: «', 'In één keer: ‘') + P(HV.gevaar.standNamen[g.waarde]) + t('»', '’'), tekst: t('Змінено дозволів: ', 'Toestemmingen gewijzigd: ') + n + t(' · кожен — окремий запис у Журналі', ' · elk een eigen regel in het logboek') });
          HV.teken();
        });
    };
    if (zwaar.length) {
      var kritiek = zwaar.some(function (p) { return p[1].niveau === 'kritiek'; });
      var namen = zwaar.slice(0, 6).map(function (p) { return [p[1].naam[0] + ' (' + HV.gevaar.uitvoerder(p[0]).naam[0] + ')', p[1].naam[1] + ' (' + HV.gevaar.uitvoerder(p[0]).naam[1] + ')']; });
      var meer = zwaar.length > 6 ? [' і ще ' + (zwaar.length - 6), ' en nog ' + (zwaar.length - 6)] : ['', ''];
      HV.schil.gevaar({ actie: { sleutel: 'groep.altijd', niveau: kritiek ? 'kritiek' : 'gevaarlijk', naam: ['«Завжди» для ' + zwaar.length + ' небезпечних дій', '‘Altijd’ voor ' + zwaar.length + ' gevaarlijke acties'],
        gevolg: ['Що станеться: без запиту виконуватимуться: ' + namen.map(function (x) { return x[0]; }).join('; ') + meer[0] + '. Пов’язано з: позначка «!» з’явиться біля кожної дії й у шапці; кожна зміна — окремий запис Журналу. Як повернути: оберіть «Питати» чи «Вимкнено» для групи.', 'Wat er gebeurt: zonder te vragen gebeuren: ' + namen.map(function (x) { return x[1]; }).join('; ') + meer[1] + '. Hangt samen met: de ‘!’ verschijnt bij elke actie en in de kopregel; elke wijziging is een eigen regel in het logboek. Terugdraaien: kies ‘Vragen’ of ‘Uit’ voor de groep.'] }, naam: '' })
        .then(function (ja) { if (ja) voer(); });
      return;
    }
    voer();
  });
  HV.actie('sm-open', function (ctx, g) {
    var open = HV.ui.lees('sm-open', null), cel = HV.ui.lees('sm-cel', null);
    var nieuweCel = g.cel || null;
    if (open === g.sleutel && cel === nieuweCel) { HV.ui.zet('sm-open', null); HV.ui.zet('sm-cel', null); return; }
    HV.ui.zet('sm-cel', nieuweCel);
    HV.ui.zet('sm-open', g.sleutel);
  });
  HV.actie('sm-filters-weg', function () { HV.ui.zet('sm-actief', false); HV.ui.zet('sm-niveau', 'alle'); });
  HV.actie('sm-naar-uitvoerder', function (ctx, g) { HV.ui.zet('sm-uitvoerder', g.uitvoerder); ctx.open('instellingen-risico'); });
  HV.actie('sm-zelf', function (ctx, g) {
    if (g.stop === 'ja') { if (rol() !== 'eigenaar' && rol() !== 'bewoner') return weigerRol(t('Зупинити може власник або мешканець.', 'Stoppen kan de eigenaar of een bewoner.')); HV.zelfStop(true); return; }
    if (!isEigenaar()) return weigerRol(t('Відновлює лише власник.', 'Alleen de eigenaar hervat.'));
    HV.schil.herbevestig({ titel: t('Відновити самостійні дії', 'Zelfstandige acties hervatten'), tekst: t('Автоматизації, агенти й оптимізатор знову діятимуть за своїми дозволами.', 'Automatiseringen, agenten en optimalisatie handelen weer volgens hun toestemmingen.') }).then(function (ja) { if (ja) HV.zelfStop(false); });
  });
  HV.actie('sm-kader', function (ctx, g) {
    if (!isEigenaar()) return weigerRol();
    if (!isUitvoerder(g.uitvoerder)) return;
    var w = HV.staat.w, sm = S(w), u = g.uitvoerder, oud = kopie(sm.kaders[u] || {}), k = kopie(oud);
    var wie = HV.gevaar.uitvoerder(u);
    if (g.veld === 'termijn') { var d = Number(g.waarde); k.verlopen = null; if (d) { k.sinds = w.tijd; k.tot = w.tijd + d * DAG; } else { k.tot = null; k.sinds = null; } }
    if (g.veld === 'uren') k.uren = g.waarde === 'altijd' ? null : g.waarde.split('-').map(Number);
    if (g.veld === 'budget') k.budget = Number(g.waarde) || null;
    if (g.veld === 'kamer') { if (g.waarde === '*') k.kamers = null; else { var l = k.kamers || []; l = l.indexOf(g.waarde) >= 0 ? l.filter(function (x) { return x !== g.waarde; }) : l.concat([g.waarde]); k.kamers = l.length ? l : null; } }
    if (g.veld === 'alles') k = {};
    var was = kadersTekst(heeftKaders(oud) || oud.verlopen ? oud : null), werd = kadersTekst(heeftKaders(k) ? k : null);
    stel({ pad: 'kaders.' + u, waarde: k, wat: ['Рамки: ' + wie.naam[0], 'Kaders: ' + wie.naam[1]], was: [was, was], werd: [werd, werd], k: 'kader-' + u + '-' + (g.veld === 'kamer' ? 'kamers' : g.veld), soort: 'huis.systeem', icoon: 'calendar-clock' });
  });

  // ── Сповіщення ──
  HV.actie('sm-uur', function (ctx, g) {
    var st = S().meldingen.stil, oud = st[g.veld], nieuw = (oud + Number(g.richting) + 24) % 24;
    stel({ pad: 'meldingen.stil.' + g.veld, waarde: nieuw, wat: [g.veld === 'van' ? 'Початок тихих годин' : 'Кінець тихих годин', g.veld === 'van' ? 'Begin van de stille uren' : 'Einde van de stille uren'], was: [uurTekst(oud), uurTekst(oud)], werd: [uurTekst(nieuw), uurTekst(nieuw)], k: 'uur', wie: 'zelf', zelf: HV.mens().id, icoon: 'moon' });
  });
  HV.actie('sm-test', function () {
    var w = HV.staat.w, sm = S(w), me = sm.meldingen, stil = isStilNu(me.stil, w), ik = HV.mens();
    var kanalen = KANALEN.filter(function (k) { return k.id === 'app' || me.kanalen[k.id]; }).map(function (k) { return { id: k.id, stand: 'wacht', doel: k.stand === 'later' ? 'later' : stil && k.id !== 'licht' ? 'stil' : 'bezorgd' }; });
    var id = Date.now();
    HV.staat.wijzig(function () { me.test = { id: id, tijd: w.tijd, kanalen: kanalen }; });
    HV.logboek.voegToe({ maker: ik, wat: ['Пробне сповіщення', 'Proefmelding'], waarom: ['перевірка доставки', 'controle van de bezorging'], soort: 'huis.systeem' });
    kanalen.forEach(function (k, i) {
      setTimeout(function () {
        if (!HV.staat.w.sm || !HV.staat.w.sm.meldingen.test || HV.staat.w.sm.meldingen.test.id !== id) return;
        HV.staat.wijzig(function () { k.stand = k.doel; });
        if (k.id === 'app') HV.meld({ icoon: 'bell-ring', titel: t('Пробне сповіщення', 'Proefmelding'), tekst: t('Так виглядає сповіщення в застосунку.', 'Zo ziet een melding in de app eruit.'), maker: { soort: 'systeem', naam: ['Система', 'Systeem'] } });
      }, 500 + i * 450);
    });
  });

  // ═════════════════════════ Обгортки ядра ═════════════════════════
  // 1) Права ролей: матриця «роль × область» перевизначає рішення ядра для мешканця, дитини й гостя.
  if (HV.gevaar && HV.gevaar.rolMag) {
    var rolMagKern = HV.gevaar.rolMag;
    HV.gevaar.rolMag = function (r, actie) {
      var basis = rolMagKern.call(HV.gevaar, r, actie);
      try {
        if (r === 'eigenaar' || !HV.staat || !HV.staat.w) return basis;
        var sm = S(HV.staat.w), gb = gebiedVan(actie);
        if (!gb || !sm.rechten[r] || !sm.rechten[r][gb]) return basis;
        var v = sm.rechten[r][gb], gn = GEBIEDEN.filter(function (x) { return x.id === gb; })[0].naam;
        if (v === 'alles') return { mag: true };
        if (v === 'bedienen') return HV.gevaar.isZwaar(actie) ? { mag: false, reden: ['небезпечні дії області «' + gn[0] + '» ролі «' + ROL_NAAM[r][0] + '» не дозволено', 'gevaarlijke acties in ‘' + gn[1] + '’ zijn niet toegestaan voor ‘' + ROL_NAAM[r][1] + '’'] } : { mag: true };
        return { mag: false, reden: v === 'zien' ? ['роль «' + ROL_NAAM[r][0] + '» лише бачить «' + gn[0] + '»', 'de rol ‘' + ROL_NAAM[r][1] + '’ ziet ‘' + gn[1] + '’ alleen'] : ['роль «' + ROL_NAAM[r][0] + '» не має доступу до «' + gn[0] + '»', 'de rol ‘' + ROL_NAAM[r][1] + '’ heeft geen toegang tot ‘' + gn[1] + '’'] };
      } catch (e) { return basis; }
    };
  }
  // 2) HV.doe: кімнати й строк людини; рамки виконавців (поза рамками «Завжди» діє як «Питати»).
  function kamerVanDoel(doel) {
    if (typeof doel === 'string' && doel.indexOf('kamer:') === 0) return doel.slice(6);
    var a = typeof doel === 'object' ? doel : HV.staat.w.apparaten[doel];
    return a && a.kamer ? a.kamer : null;
  }
  function buitenKaders(k, o2, u, w) {
    if (k.uren) {
      var uur = HV.uur(w.tijd), van = k.uren[0], tot = k.uren[1];
      var binnen = van < tot ? uur >= van && uur < tot : uur >= van || uur < tot;
      if (!binnen) return ['поза годинами рамок ' + urenTekst(k.uren), 'buiten de uren van de kaders ' + urenTekst(k.uren)];
    }
    var km = kamerVanDoel(o2.doel);
    if (k.kamers && k.kamers.length && km && k.kamers.indexOf(km) < 0) { var kn = HV.staat.kamer(km); return ['кімната «' + (kn ? kn.naam[0] : km) + '» поза рамками', 'kamer ‘' + (kn ? kn.naam[1] : km) + '’ valt buiten de kaders']; }
    if (k.budget) { var n = gebruikt(u, w); if (n >= k.budget) return ['бюджет дій вичерпано: ' + n + ' із ' + k.budget, 'actiebudget op: ' + n + ' van ' + k.budget]; }
    return null;
  }
  if (HV.doe) {
    var doeKern = HV.doe;
    HV.doe = function (opd) {
      try {
        var w = HV.staat.w, sm = w && w.sm;
        if (sm && opd) {
          var door = opd.door || null;
          if (!door || door.soort === 'mens') {
            // людина: відкликаний доступ, строк гостя, дозволені кімнати
            var mid = door && door.id ? door.id : HV.mens().id, x = sm.mensen[mid], wie = persoon(mid);
            if (x && wie && !opd.zonderRitueel) {
              var reden = null;
              if (x.ingetrokken) reden = ['доступ відкликано', 'toegang ingetrokken'];
              else if (x.tot && w.tijd > x.tot) reden = ['строк доступу минув', 'termijn van toegang verlopen'];
              else if (x.kamers) { var km = kamerVanDoel(opd.doel); if (km && x.kamers.indexOf(km) < 0) { var kk = HV.staat.kamer(km); reden = ['кімната «' + (kk ? kk.naam[0] : km) + '» недоступна для ' + wie.naam[0], 'kamer ‘' + (kk ? kk.naam[1] : km) + '’ is niet toegankelijk voor ' + wie.naam[1]]; } }
              if (reden) {
                HV.logboek.voegToe({ maker: HV.mens(), wat: ['Не виконано: ' + reden[0], 'Niet uitgevoerd: ' + reden[1]], soort: 'huis.toegang' });
                HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: ', 'Niet uitgevoerd: ') + P(reden), tekst: t('Права змінює власник у «Системі → Люди й доступ».', 'De eigenaar wijzigt rechten onder ‘Systeem → Mensen en toegang’.') });
                HV.staat.wijzig();
                return Promise.resolve({ ok: false, reden: 'toegang' });
              }
            }
            // сцена, запущена людиною: небезпечні кроки поза рамками сцен не виконуються
            if (typeof opd.doel === 'string' && opd.doel.indexOf('scene:') === 0 && sm.kaders.scene && heeftKaders(sm.kaders.scene)) {
              var bs = buitenKaders(sm.kaders.scene, opd, 'scene', w);
              if (bs) {
                var st = HV.gevaar.standen().scene || {}, terug = [];
                Object.keys(st).forEach(function (s) { if (st[s] === 'altijd' && HV.gevaar.isZwaar(HV.gevaar.actie(s))) { terug.push(s); HV.gevaar.zetStandStil('scene', s, 'uit'); } });
                var r0;
                try { r0 = doeKern(opd); } finally { terug.forEach(function (s) { HV.gevaar.zetStandStil('scene', s, 'altijd'); }); }
                if (terug.length) HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: ['Сцена: небезпечні кроки пропущено', 'Scène: gevaarlijke stappen overgeslagen'], waarom: bs, soort: 'huis.automatisering' });
                return r0;
              }
            }
          } else if (!opd.goedgekeurd) {
            var u = door.id || door.soort, k = sm.kaders[u];
            if (k && heeftKaders(k)) {
              var waarde = opd.waarde === 'true' ? true : opd.waarde === 'false' ? false : opd.waarde;
              var d = HV.gevaar.doelSoort(opd.doel);
              var actie = HV.gevaar.vind(d.soort === 'apparaat' ? d.a : opd.doel, opd.mogelijkheid, waarde);
              if (HV.gevaar.stand(u, actie.sleutel) === 'altijd') {
                var buiten = buitenKaders(k, opd, u, w);
                if (buiten) {
                  HV.gevaar.zetStandStil(u, actie.sleutel, 'vragen');
                  var r;
                  try { r = doeKern(opd); } finally { HV.gevaar.zetStandStil(u, actie.sleutel, 'altijd'); }
                  HV.logboek.voegToe({ maker: door, wat: ['«Завжди» діє як «Питати»: ' + actie.naam[0], '‘Altijd’ werkt als ‘Vragen’: ' + actie.naam[1]], waarom: buiten, soort: door.soort === 'agent' ? 'huis.agent' : 'huis.automatisering' });
                  return r;
                }
              }
            }
          }
        }
      } catch (e) { /* обгортка ніколи не зупиняє ядро */ }
      return doeKern.apply(this, arguments);
    };
  }
  // 3) Строк рамок: коли минає, усі дозволи виконавця повертаються до «Вимкнено» — запис від автора «система».
  if (HV.staat && HV.staat.abonneer) {
    var bezig = false;
    HV.staat.abonneer(function () {
      var w = HV.staat.w, sm = w && w.sm;
      if (!sm || bezig) return;
      Object.keys(sm.kaders).forEach(function (u) {
        var k = sm.kaders[u];
        if (!k || !k.tot || k.verlopen || w.tijd < k.tot) return;
        bezig = true;
        k.verlopen = k.tot;
        var st = HV.gevaar.standen()[u] || {}, wie = HV.gevaar.uitvoerder(u), n = 0;
        Object.keys(st).forEach(function (s) {
          if (st[s] === 'uit') return;
          var was = st[s], a = HV.gevaar.actie(s);
          HV.gevaar.zetStandStil(u, s, 'uit'); n++;
          HV.logboek.voegToe({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, wat: ['Строк дозволу минув: «' + a.naam[0] + '» для «' + wie.naam[0] + '»', 'Termijn verlopen: ‘' + a.naam[1] + '’ voor ‘' + wie.naam[1] + '’'], was: HV.gevaar.standNamen[was], werd: HV.gevaar.standNamen.uit, soort: 'huis.systeem' });
        });
        HV.meld({ maker: { soort: 'systeem', naam: ['Система', 'Systeem'] }, icoon: 'calendar-x', gewicht: 'belangrijk', titel: t('Строк рамок минув: ', 'Termijn van de kaders verlopen: ') + P(wie.naam), tekst: t('Дозволів повернуто до «Вимкнено»: ', 'Toestemmingen terug naar ‘Uit’: ') + n });
        bezig = false;
        setTimeout(function () { HV.teken(); }, 0);
      });
    });
  }
})(window.HV = window.HV || {});
