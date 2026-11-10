// Schil: registers van schermen en gezichten, de router op location.hash, de glazen kop en onderbalk, tabbladen,
// het tekenen (met behoud van focus en scrollpositie) en de afhandeling van gebeurtenissen.
// Оболонка макета. Маршрут — простий location.hash: #<scherm>[-<tab>][-<object>][-blad-<soort>[-<id>[-<deel>]]];
// ідентифікатори — лише малі латинські літери й цифри. На справжньому сайті це /<розділ>/<вкладка>?blad=<вид>:<id>&deel=…
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t, o = HV.o;

  // ───────────────────────── Registers ─────────────────────────
  HV.schermen = {};
  /**
   * HV.scherm({ id, sectie, titel:[uk,nl], icoon, adres, tabs:[{ id, titel, adres, render(ctx), verborgen? }], render(ctx) })
   * Пізніша реєстрація з тим самим id ЗАМІНЮЄ заглушку: поля екрана перезаписуються, вкладки зливаються за id
   * (нова замінює однойменну, решта лишається на місці, невідома додається в кінець).
   */
  HV.scherm = function (def) {
    var oud = HV.schermen[def.id];
    if (!oud) { HV.schermen[def.id] = def; def.tabs = def.tabs || []; return def; }
    var tabs = oud.tabs || [];
    (def.tabs || []).forEach(function (tab) {
      var i = tabs.map(function (x) { return x.id; }).indexOf(tab.id);
      if (i >= 0) tabs[i] = tab; else tabs.push(tab);
    });
    for (var k in def) if (k !== 'tabs') oud[k] = def[k];
    if (!('voorlopig' in def)) oud.voorlopig = false;
    oud.tabs = tabs;
    return oud;
  };
  /** Замінити чи додати одну вкладку екрана: HV.tab('energie', { id:'tarief', titel, adres, render(ctx) }). */
  HV.tab = function (schermId, tab) { return HV.scherm({ id: schermId, tabs: [tab], voorlopig: (HV.schermen[schermId] || {}).voorlopig }); };

  /** Розділи навігації. plek: 'hoofd' — шапка й нижня панель; 'bel' — дзвоник; 'tandwiel' — шестерня; 'meer' — лише аркуш «Ще». */
  HV.secties = [
    { id: 'thuis', scherm: 'overzicht', titel: ['Дім', 'Thuis'], icoon: 'house', plek: 'hoofd', telefoon: true },
    { id: 'kamers', scherm: 'kamers', titel: ['Кімнати', 'Kamers'], icoon: 'layout-grid', plek: 'hoofd', telefoon: true },
    { id: 'energie', scherm: 'energie', titel: ['Енергія', 'Energie'], icoon: 'zap', plek: 'hoofd', telefoon: true },
    { id: 'beveiliging', scherm: 'beveiliging', titel: ['Безпека', 'Beveiliging'], icoon: 'shield', plek: 'hoofd', telefoon: true },
    { id: 'garage', scherm: 'garage', titel: ['Гараж', 'Garage'], icoon: 'car', plek: 'hoofd' },
    { id: 'automatisering', scherm: 'automatiseringen', titel: ['Автоматика', 'Automatisering'], icoon: 'workflow', plek: 'hoofd' },
    { id: 'logboek', scherm: 'activiteit', titel: ['Журнал', 'Logboek'], icoon: 'bell', plek: 'bel' },
    { id: 'systeem', scherm: 'instellingen', titel: ['Система', 'Systeem'], icoon: 'settings', plek: 'tandwiel' },
    { id: 'paneel', scherm: 'paneel', titel: ['Екран', 'Paneel'], icoon: 'tablet-smartphone', plek: 'meer' }
  ];

  HV.gezichten = [];
  /** Обличчя спеціального профілю: HV.gezicht({ id, profiel, titel:[uk,nl], render(ctx) }). Той самий id замінює. */
  HV.gezicht = function (def) {
    for (var i = 0; i < HV.gezichten.length; i++) if (HV.gezichten[i].id === def.id) { HV.gezichten[i] = def; return; }
    HV.gezichten.push(def);
  };

  // ───────────────────────── Route ─────────────────────────
  var route = { scherm: 'overzicht', tab: null, object: null, blad: null };
  var SCHOON = /[^a-z0-9-]/g;

  function ontleed(hash) {
    var delen = String(hash || '').replace(/^#/, '').toLowerCase().replace(SCHOON, '').split('-').filter(Boolean);
    var r = { scherm: 'overzicht', tab: null, object: null, blad: null };
    var i = delen.indexOf('blad');
    var pad = i >= 0 ? delen.slice(0, i) : delen;
    var blad = i >= 0 ? delen.slice(i + 1) : [];
    if (pad[0]) r.scherm = pad[0];
    var s = HV.schermen[r.scherm];
    if (pad[1]) {
      if (s && (s.tabs || []).some(function (x) { return x.id === pad[1]; })) { r.tab = pad[1]; r.object = pad[2] || null; }
      else r.object = pad[1];
    }
    if (blad[0]) r.blad = { type: blad[0], id: blad[1] || null, deel: blad[2] || null };
    return r;
  }
  function maakHash(r) {
    var delen = [r.scherm];
    if (r.tab) delen.push(r.tab);
    if (r.object) delen.push(r.object);
    if (r.blad) { delen.push('blad', r.blad.type); if (r.blad.id) { delen.push(r.blad.id); if (r.blad.deel) delen.push(r.blad.deel); } }
    return delen.join('-');
  }
  function zetRoute(r, vervang) {
    var vorige = route;
    route = r;
    var hash = '#' + maakHash(r);
    try {
      if (window.location.hash !== hash) {
        if (vervang && window.history && window.history.replaceState) window.history.replaceState(null, '', hash);
        else window.location.hash = hash;
      }
    } catch (e) { /* без адреси маршрут живе в пам'яті */ }
    if (vorige.scherm !== r.scherm || vorige.tab !== r.tab || vorige.object !== r.object) naPagina = true;
    HV.teken();
  }

  HV.route = function () { return route; };
  /** Перейти: 'kamers', 'energie-tarief', 'kamers-kamer-woonkamer'. Відкритий аркуш закривається. */
  HV.open = function (adres) { zetRoute(ontleed(adres)); };
  /** Відкрити аркуш на поточній сторінці: 'apparaat:torsher', 'meldingen', 'kamer:woonkamer'; null — закрити. */
  HV.bladOpen = function (id, deel) {
    var r = { scherm: route.scherm, tab: route.tab, object: route.object, blad: null };
    if (id) { var p = String(id).split(':'); r.blad = { type: p[0], id: p[1] || null, deel: deel || null }; }
    if (id && !route.blad) opener = document.activeElement;
    zetRoute(r, !!route.blad && !!id);
  };
  /** Адреса на справжньому сайті для поточного маршруту (граматика /розділ/вкладка?blad=…). */
  HV.echtAdres = function () {
    var s = HV.schermen[route.scherm];
    if (!s) return '/' + route.scherm;
    var tab = huidigeTab(s);
    var pad = tab && tab.adres ? tab.adres : s.adres;
    if (route.object) pad = pad.indexOf(':object') >= 0 ? pad.replace(':object', route.object) : pad + '/' + route.object;
    pad = pad.replace('/:object', '');
    if (route.blad) pad += '?blad=' + route.blad.type + (route.blad.id ? ':' + route.blad.id : '') + (route.blad.deel ? '&deel=' + route.blad.deel : '');
    return pad;
  };
  function huidigeTab(s) {
    var tabs = s.tabs || [];
    if (!tabs.length) return null;
    for (var i = 0; i < tabs.length; i++) if (tabs[i].id === route.tab) return tabs[i];
    for (var j = 0; j < tabs.length; j++) if (!tabs[j].verborgen) return tabs[j];
    return tabs[0];
  }

  // ───────────────────────── Profiel, thema, context ─────────────────────────
  var SPECIAAL = ['horloge', 'tv', 'strook', 'vierkant', 'rond', 'klein', 'deur', 'inkt'];
  /** Поточний профіль екрана: { id, breedte, hoogte, speciaal, dichtheid, hemel, glas, gevaar, schaal }. */
  HV.profiel = function () {
    var keuze = HV.opslag.lees('profiel', null) || 'venster';
    var lijst = HV.bouw.profielen || [];
    var doek = document.getElementById('hv-doek');
    if (keuze === 'venster') {
      var b = doek ? doek.clientWidth : 1280;
      var id = b < 700 ? 'telefoon' : b < 1100 ? 'wand' : b < 1800 ? 'bureau' : b < 2400 ? 'breed' : 'ultrabreed';
      var p0 = lijst.filter(function (x) { return x.id === id; })[0] || {};
      return { id: id, venster: true, breedte: b, hoogte: doek ? doek.clientHeight : 800, speciaal: false, dichtheid: id === 'wand' ? 'normaal' : p0.dichtheid || 'normaal', hemel: 'vol', glas: 'ja', gevaar: 'rail', schaal: 1 };
    }
    var p = lijst.filter(function (x) { return x.id === keuze; })[0];
    if (!p) return { id: 'telefoon', breedte: 390, hoogte: 844, speciaal: false, dichtheid: 'normaal', hemel: 'vol', glas: 'ja', gevaar: 'rail', schaal: 1 };
    var beelden = HV.profielBeelden(p.id);
    var beeld = beelden[Math.min(beelden.length - 1, HV.opslag.lees('beeld-' + p.id, 0))];
    var schaal = p.id === 'tv' ? 1.5 : 1;
    // за звичайною адресою настінна панель має звичайну щільність; у макеті показуємо її як панель — просторо
    return { id: p.id, breedte: Math.round(beeld[0] / schaal), hoogte: Math.round(beeld[1] / schaal), echt: beeld, speciaal: SPECIAAL.indexOf(p.id) >= 0, dichtheid: p.dichtheid || 'normaal', hemel: p.hemel || 'vol', glas: p.glas || 'ja', gevaar: p.gevaar || 'rail', thema: p.thema || null, schaal: schaal };
  };
  /** Розміри профілю в справжніх пікселях (макет додає 1440×900 для bureau й 240×240 для horloge). */
  HV.profielBeelden = function (id) {
    var p = (HV.bouw.profielen || []).filter(function (x) { return x.id === id; })[0];
    var beelden = p ? p.beeld.slice() : [[390, 844]];
    if (id === 'bureau') beelden.unshift([1440, 900]);
    if (id === 'horloge') beelden.unshift([240, 240]);
    if (id === 'strook' || id === 'vierkant' || id === 'rond') beelden.sort(function (a, b) { return id === 'strook' ? b[0] - a[0] : a[0] - b[0]; });
    return beelden;
  };
  HV.thema = function () {
    var p = HV.opslag.lees('profiel', 'venster');
    if (p === 'inkt') return 'inkt';
    var keuze = HV.opslag.lees('thema', 'systeem');
    if (keuze !== 'systeem') return keuze;
    var wortel = document.documentElement.getAttribute('data-theme');
    if (wortel === 'dark') return 'donker';
    if (wortel === 'light') return 'licht';
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'donker' : 'licht'; } catch (e) { return 'licht'; }
  };
  HV.dichtheid = function () { var k = HV.opslag.lees('dichtheid', 'auto'); return k === 'auto' ? HV.profiel().dichtheid : k; };

  /** Контекст для render і обробників дій. */
  HV.ctx = function () {
    return {
      t: HV.t, h: HV.h, p: HV.p, staat: HV.staat.w, profiel: HV.profiel(), rol: HV.rol(), taal: HV.taal(), dichtheid: HV.dichtheid(), route: route,
      open: HV.open, blad: HV.bladOpen, meld: HV.meld, doe: HV.doe
    };
  };

  // ───────────────────────── DOM-verschil ─────────────────────────
  var sleutel = function (n) { return n.nodeType === 1 ? (n.getAttribute('data-k') || n.id || null) : null; };
  function gelijk(a, b) { return a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.nodeName === b.nodeName && sleutel(a) === sleutel(b))); }
  function werkBij(oud, nieuw) {
    if (oud.nodeType === 3 || oud.nodeType === 8) { if (oud.nodeValue !== nieuw.nodeValue) oud.nodeValue = nieuw.nodeValue; return; }
    if (oud.hasAttribute('data-bezig')) return; // орган у руці користувача: не чіпати
    var i, a;
    var na = nieuw.attributes, oa = oud.attributes;
    for (i = oa.length - 1; i >= 0; i--) { a = oa[i]; if (!nieuw.hasAttribute(a.name) && a.name !== 'data-bezig') oud.removeAttribute(a.name); }
    for (i = 0; i < na.length; i++) { a = na[i]; if (oud.getAttribute(a.name) !== a.value) oud.setAttribute(a.name, a.value); }
    if (oud.nodeName === 'INPUT' || oud.nodeName === 'TEXTAREA') return;
    kinderen(oud, nieuw);
  }
  function kinderen(oud, nieuw) {
    var o1 = oud.firstChild;
    var lijst = Array.prototype.slice.call(nieuw.childNodes);
    for (var i = 0; i < lijst.length; i++) {
      var n = lijst[i];
      if (o1 && gelijk(o1, n)) { werkBij(o1, n); o1 = o1.nextSibling; continue; }
      var k = sleutel(n), gevonden = null;
      if (k) { for (var z = o1 ? o1.nextSibling : null; z; z = z.nextSibling) if (gelijk(z, n)) { gevonden = z; break; } }
      if (gevonden) { oud.insertBefore(gevonden, o1); werkBij(gevonden, n); }
      else oud.insertBefore(n, o1);
    }
    while (o1) { var weg = o1; o1 = o1.nextSibling; oud.removeChild(weg); }
  }
  /** Замінює вміст елемента новим HTML, зберігаючи наявні вузли (фокус, прокручування, переходи). */
  HV.zet = function (el, html) {
    if (!el) return;
    var sjabloon = document.createElement('template');
    sjabloon.innerHTML = html;
    kinderen(el, sjabloon.content);
  };

  // ───────────────────────── Tekenen ─────────────────────────
  var gepland = false, naPagina = true, opener = null, vorigBlad = null, sprong = true;
  HV.sleept = false;
  HV.teken = function () {
    if (gepland) return;
    gepland = true;
    window.requestAnimationFrame(function () { gepland = false; if (!HV.sleept) teken(); });
  };
  /** Наступне оновлення неба — без переходу (сценарій, тема, профіль). */
  HV.hemelSprong = function () { sprong = true; };

  function navPunt(s, klas) {
    var actief = HV.schermen[route.scherm] && HV.schermen[route.scherm].sectie === s.id;
    return '<button type="button" class="' + klas + (actief ? ' is-actief' : '') + '" data-actie="ga" data-naar="' + s.scherm + '"' + (actief ? ' aria-current="page"' : '') + ' data-k="nav-' + s.id + '">' + HV.icoon(s.icoon) + '<span>' + h(HV.p(s.titel)) + '</span></button>';
  }

  function kopHtml(ctx) {
    var w = ctx.staat;
    var hoofd = HV.secties.filter(function (s) { return s.plek === 'hoofd'; });
    var ongelezen = HV.logboek.ongelezen();
    var zwaar = HV.gevaar.altijdZwaar().length;
    var stand = HV.huisstanden[w.huisstand];
    var zin = HV.heldKort ? HV.heldKort(ctx) : '';
    return '<div class="hv-kop__binnen">' +
      '<button type="button" class="hv-kop__huis" data-actie="blad" data-blad="huisstand" aria-label="' + h(HV.paspoort.adres + ', ' + t('режим дому: ', 'huisstand: ') + HV.p(stand)) + '"><span class="hv-kop__naam">' + h(HV.paspoort.adres) + '</span><span class="hv-kop__stand">' + h(HV.p(stand)) + HV.icoon('chevron-down', { maat: 's' }) + '</span></button>' +
      '<p class="hv-kop__zin" aria-hidden="true">' + zin + '</p>' +
      '<nav class="hv-kop__nav" aria-label="' + h(t('Розділи', 'Onderdelen')) + '">' + hoofd.map(function (s) { return navPunt(s, 'hv-nav__punt'); }).join('') + '</nav>' +
      '<div class="hv-kop__rechts">' +
      '<button type="button" class="hv-kop__opdracht" data-actie="opdracht">' + HV.icoon('search', { maat: 's' }) + '<span>' + h(t('Команда', 'Opdracht')) + '</span></button>' +
      (zwaar ? '<button type="button" class="hv-kop__risico" data-actie="ga" data-naar="instellingen-risico" aria-label="' + h(t('Дозволів «Завжди» для небезпечних дій: ', 'Toestemmingen ‘Altijd’ voor gevaarlijke acties: ') + zwaar) + '">' + HV.icoon('risico-gevaarlijk', { maat: 'risico' }) + '<span>' + zwaar + '</span></button>' : '') +
      o.sim(w, { kort: true }) + o.versheid(w) +
      o.icoonknop({ icoon: 'bell', aria: t('Сповіщення', 'Meldingen') + (ongelezen ? ': ' + ongelezen + ' ' + t('нових', 'nieuw') : ''), actie: 'blad', gegevens: { blad: 'meldingen' }, teller: ongelezen || null, klas: 'hv-kop__bel' }) +
      o.icoonknop({ icoon: 'settings', aria: t('Система', 'Systeem'), actie: 'ga', gegevens: { naar: 'instellingen' }, klas: 'hv-kop__tandwiel' + (HV.schermen[route.scherm] && HV.schermen[route.scherm].sectie === 'systeem' ? ' is-actief' : '') }) +
      '</div></div>';
  }

  function onderbalkHtml() {
    var punten = HV.secties.filter(function (s) { return s.telefoon; }).map(function (s) { return navPunt(s, 'hv-onderbalk__punt'); }).join('');
    var s = HV.schermen[route.scherm];
    var inMeer = s && HV.secties.some(function (x) { return x.id === s.sectie && !x.telefoon; });
    return '<div class="hv-onderbalk__rij">' + punten + '<button type="button" class="hv-onderbalk__punt' + (inMeer ? ' is-actief' : '') + '" data-actie="blad" data-blad="meer" data-k="nav-meer">' + HV.icoon('ellipsis') + '<span>' + h(t('Ще', 'Meer')) + '</span></button></div>';
  }

  function strookHtml(ctx) {
    var w = ctx.staat;
    if (w.gegevens === 'geen') return '<div class="hv-verbinding is-geen" role="status" data-k="verbinding">' + HV.icoon('wifi-off', { maat: 's' }) + '<span>' + h(t('Немає зв’язку з домом з ', 'Geen verbinding met het huis sinds ') + HV.tijd(w.gegevensSinds || w.tijd) + t(' · показано останній знімок, лише перегляд', ' · laatste momentopname, alleen bekijken')) + '</span></div>';
    if (w.gegevens === 'verouderd') return '<div class="hv-verbinding is-verouderd" role="status" data-k="verbinding">' + HV.icoon('refresh-cw', { maat: 's' }) + '<span>' + h(t('Потік мовчить: дані оновлюються раз на 30 с і можуть бути застарілі.', 'De stroom zwijgt: gegevens verversen elke 30 s en kunnen verouderd zijn.')) + '</span></div>';
    if (w.zelfGestopt) return '<div class="hv-verbinding is-gestopt" role="status" data-k="verbinding">' + HV.icoon('pause', { maat: 's' }) + '<span>' + h(t('Самостійні дії зупинено: автоматизації, агенти й оптимізація чекають.', 'Zelfstandige acties zijn gestopt: automatiseringen, agenten en optimalisatie wachten.')) + '</span>' + o.knop({ tekst: t('Відновити', 'Hervatten'), klein: true, actie: 'zelfstop', gegevens: { stop: '' } }) + '</div>';
    return '';
  }

  function paginaHtml(ctx) {
    var s = HV.schermen[route.scherm];
    if (!s) {
      return '<div class="hv-pagina__lijf">' + o.leeg({ icoon: 'circle-help', titel: t('Не знайдено', 'Niet gevonden'), tekst: t('Такої сторінки в домі немає.', 'Deze pagina bestaat niet in dit huis.'), actie: { tekst: t('До огляду дому', 'Naar het overzicht'), soort: 'hoofd', actie: 'ga', gegevens: { naar: 'overzicht' } } }) + '</div>';
    }
    var tab = huidigeTab(s);
    var zichtbaar = (s.tabs || []).filter(function (x) { return !x.verborgen; });
    var kop = '';
    if (s.id !== 'overzicht') {
      var terug = tab && tab.verborgen;
      kop = '<div class="hv-pagina__kop" data-k="paginakop">' +
        (terug ? '<button type="button" class="hv-terug" data-actie="ga" data-naar="' + s.id + '">' + HV.icoon('chevron-left', { maat: 's' }) + '<span>' + h(HV.p(s.titel)) + '</span></button>' : '<h1 class="hv-pagina__titel">' + h(HV.p(s.titel)) + '</h1>') +
        (zichtbaar.length > 1 && !terug ? '<div class="hv-tabs" role="tablist" aria-label="' + h(HV.p(s.titel)) + '">' + zichtbaar.map(function (x) {
          var actief = tab && tab.id === x.id;
          return '<button type="button" role="tab" id="tab-' + x.id + '" aria-selected="' + (actief ? 'true' : 'false') + '" tabindex="' + (actief ? '0' : '-1') + '" class="hv-tab' + (actief ? ' is-actief' : '') + '" data-actie="ga" data-naar="' + s.id + '-' + x.id + '" data-k="tab-' + x.id + '">' + h(HV.p(x.titel)) + '</button>';
        }).join('') + '</div>' : '') + '</div>';
    }
    var lijf;
    try { lijf = tab ? tab.render(ctx) : s.render(ctx); }
    catch (e) {
      if (window.console) console.error('[maquette] scherm ' + s.id + (tab ? '/' + tab.id : '') + ': ' + (e && e.stack ? e.stack : e));
      lijf = o.leeg({ icoon: 'circle-x', titel: t('Цей екран не вдалося показати', 'Dit scherm kon niet worden getoond'), tekst: String(e && e.message ? e.message : e) });
    }
    return kop + '<div class="hv-pagina__lijf hv-scherm-' + s.id + (tab ? ' hv-tab-' + tab.id : '') + '"' + (tab && zichtbaar.length > 1 && !tab.verborgen ? ' role="tabpanel" aria-labelledby="tab-' + tab.id + '"' : '') + ' data-k="lijf-' + s.id + '-' + (tab ? tab.id : '') + '-' + (route.object || '') + '">' + lijf + '</div>';
  }

  function gezichtHtml(ctx) {
    var p = ctx.profiel;
    var lijst = HV.gezichten.filter(function (g) { return g.profiel === p.id; });
    if (!lijst.length) return o.leeg({ icoon: 'tablet-smartphone', titel: t('Для цього профілю ще немає обличчя', 'Voor dit profiel is er nog geen wijzerplaat') });
    var i = Math.min(lijst.length - 1, Number(HV.ui.lees('gezicht-' + p.id, 0)) || 0);
    var g = lijst[i], lijf;
    try { lijf = g.render(ctx); } catch (e) { if (window.console) console.error('[maquette] gezicht ' + g.id + ': ' + (e && e.stack ? e.stack : e)); lijf = o.leeg({ icoon: 'circle-x', titel: String(e && e.message ? e.message : e) }); }
    var blader = '';
    if (lijst.length > 1) {
      blader = '<div class="hv-gezicht__blader">' + o.icoonknop({ icoon: 'chevron-left', aria: t('Попереднє обличчя', 'Vorige wijzerplaat'), actie: 'ui', gegevens: { naam: 'gezicht-' + p.id, waarde: (i + lijst.length - 1) % lijst.length } }) +
        '<span class="hv-gezicht__stippen" aria-hidden="true">' + lijst.map(function (x, n) { return '<i class="' + (n === i ? 'is-actief' : '') + '"></i>'; }).join('') + '</span>' +
        o.icoonknop({ icoon: 'chevron-right', aria: t('Наступне обличчя', 'Volgende wijzerplaat'), actie: 'ui', gegevens: { naam: 'gezicht-' + p.id, waarde: (i + 1) % lijst.length } }) + '</div>';
    }
    return '<div class="hv-gezicht hv-gezicht--' + h(g.id) + '" data-k="gezicht-' + h(g.id) + '">' + lijf + '</div>' + blader;
  }

  function teken() {
    var doek = document.getElementById('hv-doek');
    if (!doek || !HV.staat.w) return;
    HV.zetTaal(HV.opslag.lees('taal', 'uk'));
    var ctx = HV.ctx(), w = ctx.staat, p = ctx.profiel;
    var thema = HV.thema();
    var s = HV.schermen[route.scherm];

    // klassen op de wortel van het doek
    var klassen = ['hv-doek', thema === 'donker' ? 'theme-dark' : thema === 'inkt' ? 'theme-inkt' : 'theme-light', 'hv-dicht-' + ctx.dichtheid, 'hv-profiel-' + p.id, 'hv-rol-' + ctx.rol];
    if (p.speciaal) klassen.push('is-speciaal');
    if (w.nood && !w.nood.bevestigd) klassen.push('is-nood');
    if (route.blad && !p.speciaal) klassen.push('heeft-laag');
    if (HV.lagen && HV.lagen.dialoog()) klassen.push('heeft-dialoog');
    if (doek.classList.contains('is-gerold')) klassen.push('is-gerold');
    if (doek.classList.contains('is-sprong')) klassen.push('is-sprong');
    ['hv-hemel--vol', 'hv-hemel--stil', 'hv-hemel--geen', 'is-regen', 'is-sneeuw'].forEach(function (k) { if (doek.classList.contains(k)) klassen.push(k); });
    var klasse = klassen.join(' ');
    if (doek.className !== klasse) doek.className = klasse;
    doek.setAttribute('lang', ctx.taal);

    // hemel
    var niveau = (w.nood && !w.nood.bevestigd) || thema === 'inkt' || p.hemel === 'geen' ? 'geen' : (p.hemel === 'stil' || (!p.speciaal && route.scherm !== 'overzicht')) ? 'stil' : 'vol';
    HV.hemel.pasToe(doek, w, { thema: thema, niveau: niveau, sprong: sprong || w.snelheid >= 60 });
    sprong = false;

    // schil
    if (p.speciaal) {
      HV.zet(document.getElementById('hv-kop'), '');
      HV.zet(document.getElementById('hv-onderbalk'), '');
      HV.zet(document.getElementById('hv-pagina'), gezichtHtml(ctx));
    } else {
      HV.zet(document.getElementById('hv-kop'), kopHtml(ctx));
      HV.zet(document.getElementById('hv-onderbalk'), onderbalkHtml(ctx) + '<button type="button" class="hv-opdrachtknop" data-actie="opdracht" aria-label="' + h(t('Команда', 'Opdracht')) + '">' + HV.icoon('search', { maat: 'l' }) + '</button>');
      HV.zet(document.getElementById('hv-pagina'), strookHtml(ctx) + paginaHtml(ctx));
    }
    var inhoud = document.getElementById('hv-inhoud');
    if (naPagina) { inhoud.scrollTop = 0; naPagina = false; doek.classList.remove('is-gerold'); }

    // blad
    var bladSleutel = route.blad ? route.blad.type + ':' + (route.blad.id || '') : null;
    var bladHtml = route.blad && !p.speciaal ? HV.bladHtml(ctx, route.blad) : '';
    HV.zet(document.getElementById('hv-laagplek'), bladHtml ? '<div class="hv-dek hv-dek--laag" data-actie="blad-sluit" data-k="dek"></div>' + bladHtml : '');
    if (bladSleutel !== vorigBlad) {
      if (bladSleutel) { var titel = document.getElementById('hv-laag-titel'); if (titel) { try { titel.focus({ preventScroll: true }); } catch (e) { titel.focus(); } } }
      else if (opener && document.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) { /* фокус лишається */ } opener = null; }
      vorigBlad = bladSleutel;
    }

    if (HV.lagen) HV.lagen.teken(ctx);
    if (HV.pult && HV.pult.werkBij) HV.pult.werkBij(ctx);
    if (s && document.title !== undefined && !HV.bouw.artefact) { /* назва вкладки браузера лишається сталою */ }
  }

  // ───────────────────────── Gebeurtenissen ─────────────────────────
  function gegevensVan(el) { var g = {}; for (var k in el.dataset) g[k] = el.dataset[k]; return g; }
  function roep(naam, el, ev, extra) {
    var fn = HV.acties[naam];
    if (!fn) { if (window.console) console.error('[maquette] geen afhandeling voor data-actie="' + naam + '"'); return; }
    var g = gegevensVan(el);
    for (var k in extra || {}) g[k] = extra[k];
    try { fn(HV.ctx(), g, el, ev); } catch (e) { if (window.console) console.error('[maquette] actie ' + naam + ': ' + (e && e.stack ? e.stack : e)); }
  }

  function klik(ev) {
    var el = ev.target.closest ? ev.target.closest('[data-actie]') : null;
    if (!el || !document.getElementById('hv-doek').contains(el)) return;
    if (el.getAttribute('aria-disabled') === 'true') return;
    roep(el.getAttribute('data-actie'), el, ev);
  }

  // Schuif: tijdens het slepen werkt de kern de waarde bij zonder het scherm opnieuw te tekenen.
  function schuifZet(baan, v, fase) {
    var min = Number(baan.dataset.min), max = Number(baan.dataset.max);
    var deel = Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
    var wortel = baan.parentNode;
    baan.querySelector('.hv-schuif__vulling').style.width = deel + '%';
    baan.querySelector('.hv-schuif__knop').style.left = deel + '%';
    baan.setAttribute('aria-valuenow', v);
    baan.setAttribute('aria-valuetext', HV.maatTekst(v, baan.dataset.eenheid, Number(baan.dataset.decimalen)));
    var uit = wortel.querySelector('.hv-schuif__getal');
    if (uit) uit.innerHTML = HV.maat(v, baan.dataset.eenheid, Number(baan.dataset.decimalen));
    roep(baan.dataset.schuif, baan, null, { waarde: v, fase: fase });
  }
  function rond(v, baan) {
    var stap = Number(baan.dataset.stap) || 1, min = Number(baan.dataset.min), max = Number(baan.dataset.max);
    v = Math.round(v / stap) * stap;
    return Math.max(min, Math.min(max, Math.round(v * 100) / 100));
  }
  function schuifSleep(ev, baan) {
    if (baan.getAttribute('aria-disabled') === 'true') return;
    ev.preventDefault();
    var wortel = baan.parentNode;
    var min = Number(baan.dataset.min), max = Number(baan.dataset.max);
    var waarde = function (e) { var r = baan.getBoundingClientRect(); return rond(min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min), baan); };
    HV.sleept = true; wortel.setAttribute('data-bezig', '1'); wortel.classList.add('is-sleept');
    try { baan.setPointerCapture(ev.pointerId); } catch (e) { /* без захоплення теж працює */ }
    var laatste = waarde(ev);
    schuifZet(baan, laatste, 'sleep');
    var beweeg = function (e) { var v = waarde(e); if (v !== laatste) { laatste = v; schuifZet(baan, v, 'sleep'); } };
    var los = function () {
      baan.removeEventListener('pointermove', beweeg); baan.removeEventListener('pointerup', los); baan.removeEventListener('pointercancel', los);
      HV.sleept = false; wortel.removeAttribute('data-bezig'); wortel.classList.remove('is-sleept');
      schuifZet(baan, laatste, 'klaar');
      HV.teken();
    };
    baan.addEventListener('pointermove', beweeg); baan.addEventListener('pointerup', los); baan.addEventListener('pointercancel', los);
    baan.focus();
  }

  // Wijzer (thermostaat): hoek → waarde; ook zonder opnieuw tekenen.
  function wijzerZet(schijf, v, fase) {
    var min = Number(schijf.dataset.min), max = Number(schijf.dataset.max), R = 86, C = 100;
    var punt = function (x) { var hoek = (135 + 270 * Math.max(0, Math.min(1, (x - min) / (max - min)))) * Math.PI / 180; return [C + R * Math.cos(hoek), C + R * Math.sin(hoek)]; };
    var a = punt(min), d = punt(v), groot = (v - min) / (max - min) * 270 > 180 ? 1 : 0;
    var knop = schijf.querySelector('.hv-wijzer__knop'), vulling = schijf.querySelector('.hv-wijzer__vulling');
    knop.setAttribute('cx', d[0].toFixed(1)); knop.setAttribute('cy', d[1].toFixed(1));
    vulling.setAttribute('d', 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + groot + ' 1 ' + d[0].toFixed(1) + ' ' + d[1].toFixed(1));
    schijf.setAttribute('aria-valuenow', v); schijf.setAttribute('aria-valuetext', HV.maatTekst(v, '°C', 1));
    var uit = schijf.parentNode.querySelector('.hv-wijzer__doelgetal output');
    if (uit) uit.innerHTML = HV.maat(v, '°C', 1);
    roep(schijf.dataset.wijzer, schijf, null, { waarde: v, fase: fase });
  }
  function wijzerSleep(ev, schijf) {
    ev.preventDefault();
    var min = Number(schijf.dataset.min), max = Number(schijf.dataset.max), wortel = schijf.parentNode;
    var waarde = function (e) {
      var r = schijf.getBoundingClientRect();
      var graden = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
      var hoek = (graden - 135 + 720) % 360;
      if (hoek > 270) hoek = hoek > 315 ? 0 : 270;
      return rond(min + hoek / 270 * (max - min), schijf);
    };
    HV.sleept = true; wortel.setAttribute('data-bezig', '1');
    try { schijf.setPointerCapture(ev.pointerId); } catch (e) { /* без захоплення теж працює */ }
    var laatste = waarde(ev);
    wijzerZet(schijf, laatste, 'sleep');
    var beweeg = function (e) { var v = waarde(e); if (v !== laatste) { laatste = v; wijzerZet(schijf, v, 'sleep'); } };
    var los = function () {
      schijf.removeEventListener('pointermove', beweeg); schijf.removeEventListener('pointerup', los); schijf.removeEventListener('pointercancel', los);
      HV.sleept = false; wortel.removeAttribute('data-bezig');
      wijzerZet(schijf, laatste, 'klaar'); HV.teken();
    };
    schijf.addEventListener('pointermove', beweeg); schijf.addEventListener('pointerup', los); schijf.addEventListener('pointercancel', los);
    schijf.focus();
  }

  function aanwijzer(ev) {
    if (ev.button != null && ev.button !== 0) return;
    var doel = ev.target.closest ? ev.target : ev.target.parentNode;
    var baan = doel.closest('[data-schuif]');
    if (baan) { schuifSleep(ev, baan); return; }
    var schijf = doel.closest('[data-wijzer]');
    if (schijf) { wijzerSleep(ev, schijf); return; }
    var rail = doel.closest('.hv-rail');
    if (rail && HV.lagen) HV.lagen.railStart(rail, ev);
  }

  function focusbaar(wortel) {
    return Array.prototype.slice.call(wortel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(function (e) { return !e.disabled && e.offsetParent !== null; });
  }

  function toets(ev) {
    var el = ev.target, doek = document.getElementById('hv-doek');
    if (!doek || !doek.contains(el)) return;
    var sleutelNaam = ev.key;
    // Escape: закриває верхній шар
    if (sleutelNaam === 'Escape') {
      if (HV.lagen && HV.lagen.escape()) { ev.preventDefault(); return; }
      if (route.blad) { ev.preventDefault(); HV.bladOpen(null); }
      return;
    }
    // утримання фокуса в модальному шарі
    if (sleutelNaam === 'Tab') {
      var modaal = doek.querySelector('.hv-gevaar, .hv-opdracht, .hv-nood') || (route.blad && window.getComputedStyle(doek.querySelector('.hv-dek--laag') || doek).display !== 'none' && doek.querySelector('.hv-dek--laag') ? doek.querySelector('.hv-laag') : null);
      if (modaal) {
        var lijst = focusbaar(modaal);
        if (!lijst.length) return;
        var eerste = lijst[0], laatste = lijst[lijst.length - 1];
        if (!modaal.contains(el)) { ev.preventDefault(); eerste.focus(); }
        else if (ev.shiftKey && el === eerste) { ev.preventDefault(); laatste.focus(); }
        else if (!ev.shiftKey && el === laatste) { ev.preventDefault(); eerste.focus(); }
      }
      return;
    }
    // schuif en wijzer
    var as = el.getAttribute && el.getAttribute('role') === 'slider' ? el : null;
    if (as && as.getAttribute('aria-disabled') !== 'true') {
      var min = Number(as.dataset.min), max = Number(as.dataset.max), stap = Number(as.dataset.stap) || 1, nu = Number(as.getAttribute('aria-valuenow'));
      var nieuw = null;
      if (sleutelNaam === 'ArrowRight' || sleutelNaam === 'ArrowUp') nieuw = nu + stap;
      else if (sleutelNaam === 'ArrowLeft' || sleutelNaam === 'ArrowDown') nieuw = nu - stap;
      else if (sleutelNaam === 'PageUp') nieuw = nu + stap * 10;
      else if (sleutelNaam === 'PageDown') nieuw = nu - stap * 10;
      else if (sleutelNaam === 'Home') nieuw = min;
      else if (sleutelNaam === 'End') nieuw = max;
      if (nieuw != null) {
        ev.preventDefault();
        nieuw = rond(nieuw, as);
        if (as.dataset.schuif) schuifZet(as, nieuw, 'klaar'); else wijzerZet(as, nieuw, 'klaar');
        HV.teken();
      }
      return;
    }
    // tablist і radiogroup: стрілки
    var rol = el.getAttribute && el.getAttribute('role');
    if ((rol === 'tab' || rol === 'radio') && (sleutelNaam === 'ArrowRight' || sleutelNaam === 'ArrowLeft' || sleutelNaam === 'ArrowDown' || sleutelNaam === 'ArrowUp' || sleutelNaam === 'Home' || sleutelNaam === 'End')) {
      var groep = el.parentNode, broers = Array.prototype.slice.call(groep.querySelectorAll('[role="' + rol + '"]'));
      var i = broers.indexOf(el);
      var j = sleutelNaam === 'Home' ? 0 : sleutelNaam === 'End' ? broers.length - 1 : (i + (sleutelNaam === 'ArrowRight' || sleutelNaam === 'ArrowDown' ? 1 : -1) + broers.length) % broers.length;
      ev.preventDefault();
      broers[j].focus();
      broers[j].click();
      return;
    }
    // елементи з роллю кнопки, що не є <button> (сектори кола кольорів)
    if ((sleutelNaam === 'Enter' || (sleutelNaam === ' ' && rol === 'button')) && (rol === 'button' || rol === 'link') && el.nodeName !== 'BUTTON') {
      ev.preventDefault();
      if (el.classList.contains('hv-rail')) { if (!ev.repeat && HV.lagen) HV.lagen.railStart(el, ev); }
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }
  function toetsOp(ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('hv-rail') && HV.lagen) HV.lagen.railStop(ev.target);
  }

  // ───────────────────────── Ingebouwde acties ─────────────────────────
  HV.actie('ga', function (ctx, g) { HV.open(g.naar); if (g.nu) HV.staat.wijzig(function (w) { w.nu = w.nu.filter(function (n) { return n.id !== g.nu; }); }); });
  HV.actie('blad', function (ctx, g, el) { opener = el; HV.bladOpen(g.blad, g.deel); });
  HV.actie('blad-sluit', function () { HV.bladOpen(null); });
  HV.actie('blad-deel', function (ctx, g) { var b = route.blad; if (b) zetRoute({ scherm: route.scherm, tab: route.tab, object: route.object, blad: { type: b.type, id: b.id, deel: g.deel === 'bediening' ? null : g.deel } }, true); });
  HV.actie('spring', function () { var i = document.getElementById('hv-inhoud'); if (i) i.focus(); });

  HV.actie('schakel', function (ctx, g) {
    var a = HV.staat.apparaat(g.doel), m = g.mogelijkheid;
    var nu = a.wacht && a.wacht.mogelijkheid === m ? a.wacht.waarde : HV.huidige(a, m);
    var waarde = m === 'robot' ? (nu === 'start' ? (g.af || 'dock') : (g.op || 'start')) : !nu;
    HV.doe({ doel: a.id, mogelijkheid: m, waarde: waarde });
  });
  HV.actie('tegel-stap', function (ctx, g) {
    var a = HV.staat.apparaat(g.doel), m = g.mogelijkheid, stap = Number(g.stap) || 10;
    var nu = Number(a.wacht && a.wacht.mogelijkheid === m ? a.wacht.waarde : (m === 'helderheid' && !HV.kijk.isAan(a) ? 0 : HV.huidige(a, m)));
    var grens = m === 'doel' ? [5, 30] : [1, 100];
    var nieuw = Math.max(grens[0], Math.min(grens[1], Math.round((nu + Number(g.richting) * stap) / stap) * stap));
    if (m === 'helderheid' && nieuw <= 1 && Number(g.richting) < 0) HV.doe({ doel: a.id, mogelijkheid: 'aan', waarde: false });
    else if (nieuw !== nu) HV.doe({ doel: a.id, mogelijkheid: m, waarde: nieuw });
  });
  HV.actie('kamer-licht', function (ctx, g) { HV.doe({ doel: 'kamer:' + g.kamer, mogelijkheid: 'licht', waarde: HV.kijk.lampenAan(g.kamer).length === 0 }); });
  HV.actie('kamer-doel', function (ctx, g) { var k = HV.staat.kamer(g.kamer); HV.doe({ doel: 'kamer:' + g.kamer, mogelijkheid: 'doel', waarde: Math.max(5, Math.min(30, (k.doel || 20) + Number(g.richting) * (Number(g.stap) || 0.5))) }); });
  HV.actie('scene', function (ctx, g) { HV.doe({ doel: 'scene:' + g.scene, mogelijkheid: 'start', waarde: true }); });
  HV.actie('huisstand', function (ctx, g) { HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: g.waarde }); });
  HV.actie('zelfstop', function (ctx, g) { HV.zelfStop(!!g.stop); });
  HV.actie('blok', function (ctx, g, el) {
    var geheugen = HV.opslag.lees('blokken', {});
    geheugen[g.blok] = el.getAttribute('aria-expanded') !== 'true';
    HV.opslag.schrijf('blokken', geheugen);
    HV.teken();
  });
  HV.actie('bericht', function (ctx, g) {
    HV.ui.zet('bericht', HV.ui.lees('bericht', null) === g.bericht ? null : g.bericht);
    HV.staat.wijzig(function (w) { w.logboek.forEach(function (r) { if (r.id === g.bericht) r.gelezen = true; }); });
  });
  HV.actie('stand', function (ctx, g) { HV.gevaar.zetStand(g.uitvoerder, g.sleutel, g.waarde).then(function () { HV.teken(); }); });
  HV.actie('nu-weg', function (ctx, g) { HV.staat.wijzig(function (w) { w.nu = w.nu.filter(function (n) { return n.id !== g.nu; }); }); });
  HV.actie('nu-doe', function (ctx, g) {
    HV.doe({ doel: g.doel, mogelijkheid: g.mogelijkheid, waarde: g.waarde }).then(function (r) {
      if (r && r.ok) HV.staat.wijzig(function (w) { w.nu = w.nu.filter(function (n) { return n.id !== g.nu; }); });
    });
  });
  HV.actie('verzoek-ja', function (ctx, g) { HV.verzoek(g.verzoek, true); });
  HV.actie('verzoek-nee', function (ctx, g) { HV.verzoek(g.verzoek, false); });
  HV.actie('toost-weg', function (ctx, g) { HV.toostWeg(g.toost); });
  HV.actie('toost-terug', function (ctx, g) {
    var x = HV.toosten.filter(function (k) { return k.id === g.toost; })[0];
    HV.toostWeg(g.toost);
    if (x && x.terug) { x.terug(); HV.meld({ icoon: 'undo-2', titel: t('Повернуто', 'Ongedaan gemaakt'), tekst: x.titel }); }
  });
  HV.actie('schuif-stap', function (ctx, g, el) {
    var baan = el.parentNode.querySelector('[data-schuif]');
    if (!baan || baan.getAttribute('aria-disabled') === 'true') return;
    var v = rond(Number(baan.getAttribute('aria-valuenow')) + Number(g.richting) * (Number(baan.dataset.stap) || 1) * (Number(baan.dataset.max) - Number(baan.dataset.min) > 50 ? 5 : 1), baan);
    schuifZet(baan, v, 'klaar');
    HV.teken();
  });
  HV.actie('wijzer-stap', function (ctx, g, el) {
    var schijf = el.closest('.hv-wijzer').querySelector('[data-wijzer]');
    wijzerZet(schijf, rond(Number(schijf.getAttribute('aria-valuenow')) + Number(g.richting) * (Number(schijf.dataset.stap) || 0.5), schijf), 'klaar');
    HV.teken();
  });

  // ───────────────────────── Vrije bladen van de schil ─────────────────────────
  HV.blad({
    soort: 'meer', vrij: true, icoon: 'ellipsis', titel: ['Ще', 'Meer'],
    render: function () {
      return o.kaart({ inhoud: '<div class="hv-rijen">' + HV.secties.filter(function (s) { return !s.telefoon; }).map(function (s) { return o.rij({ icoon: s.icoon, naam: HV.p(s.titel), actie: 'ga', gegevens: { naar: s.scherm }, k: 'meer-' + s.id }); }).join('') + '</div>' });
    }
  });

  // ───────────────────────── Start ─────────────────────────
  HV.schil = {};
  HV.naScenario = function () { sprong = true; naPagina = true; HV.teken(); };

  HV.start = function () {
    if (HV.gestart) return;
    HV.gestart = true;
    HV.zetTaal(HV.opslag.lees('taal', 'uk'));
    HV.pult.bouw(document.getElementById('mq-wortel'));
    var doek = document.getElementById('hv-doek');
    doek.innerHTML = '<div class="hv-hemel" aria-hidden="true"><div class="hv-hemel__gloed"></div><div class="hv-hemel__neerslag"></div></div>' +
      '<button type="button" class="hv-spring" data-actie="spring">' + h(t('Перейти до вмісту', 'Naar de inhoud')) + '</button>' +
      '<header class="hv-kop" id="hv-kop"></header>' +
      '<main class="hv-inhoud" id="hv-inhoud" tabindex="-1"><div class="hv-pagina" id="hv-pagina"></div></main>' +
      '<nav class="hv-onderbalk" id="hv-onderbalk" aria-label="' + h(t('Розділи', 'Onderdelen')) + '"></nav>' +
      '<div class="hv-lagen" id="hv-lagen"><div id="hv-laagplek"></div><div id="hv-gevolgplek"></div><div id="hv-dialoogplek"></div><div class="hv-toosten" id="hv-toosten" aria-live="polite" aria-relevant="additions"></div><div id="hv-noodplek"></div></div>';

    // wereld: scenario uit de voorkeuren (of de zonnige middag)
    HV.staat.herstel(null, false);
    HV.staat.w.snelheid = Number(HV.opslag.lees('snelheid', 60)) || 60;
    HV.scenarios.start(HV.opslag.lees('scenario', 'avond'), true);
    route = ontleed(window.location.hash);

    doek.addEventListener('click', klik);
    doek.addEventListener('pointerdown', aanwijzer);
    document.addEventListener('keydown', toets);
    document.addEventListener('keyup', toetsOp);
    document.getElementById('hv-inhoud').addEventListener('scroll', function () {
      var rol = this.scrollTop > 72;
      if (doek.classList.contains('is-gerold') !== rol) doek.classList.toggle('is-gerold', rol);
    }, { passive: true });
    window.addEventListener('hashchange', function () {
      var r = ontleed(window.location.hash);
      if (maakHash(r) !== maakHash(route)) { if (r.scherm !== route.scherm || r.tab !== route.tab || r.object !== route.object) naPagina = true; route = r; HV.teken(); }
    });
    window.addEventListener('resize', function () { if (HV.pult.pas) HV.pult.pas(); HV.teken(); });
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var wissel = function () { sprong = true; HV.teken(); };
      if (mq.addEventListener) mq.addEventListener('change', wissel); else if (mq.addListener) mq.addListener(wissel);
      if (window.MutationObserver) new MutationObserver(wissel).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) { /* тема лишається як є */ }

    HV.staat.abonneer(function () { HV.teken(); });
    HV.pult.pas();
    teken();
    HV.klok.start();
  };
})(window.HV = window.HV || {});
