// Onderdelen hv-*: functies die HTML-tekenreeksen teruggeven (§9 van de ontwerptaal).
// Усе, що походить із даних, екранується через HV.h. Кожен елемент із дією має data-actie="назва" (делегування подій у schil.js).
// Стан передається аргументами — компоненти нічого не пам'ятають; виняток — згорнуті блоки (HV.opslag).
(function (HV) {
  'use strict';
  var h = HV.h, t = HV.t;
  var o = HV.o = {};

  // ── Register van acties en kleine schermtoestand ──
  HV.acties = {};
  /** Обробник дії: HV.actie('назва', (ctx, gegevens, element, gebeurtenis) => …). gegevens — data-атрибути елемента. Пізніша реєстрація замінює. */
  HV.actie = function (naam, fn) { HV.acties[naam] = fn; };
  /** Дрібний стан екрана (фільтр, вибраний поверх, розгорнутий запис): не належить світу, не зберігається. */
  var ui = {};
  HV.ui = {
    lees: function (naam, standaard) { return naam in ui ? ui[naam] : standaard; },
    zet: function (naam, waarde) { ui[naam] = waarde; if (HV.teken) HV.teken(); }
  };
  // data-actie="ui" data-naam="…" data-waarde="…" — без власного обробника
  HV.actie('ui', function (ctx, g) { HV.ui.zet(g.naam, g.waarde === '' ? false : g.waarde); });

  // ── Iconen ──
  // Власні знаки (не з lucide): дрон 24×24, ШІ-агент 12×12, постійні позначки ризику з гліфом «!», маркери графіків.
  HV.eigenIconen = {
    drone: { vak: '0 0 24 24', binnen: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7 8l3 2.5M17 8l-3 2.5M7 16l3-2.5M17 16l-3-2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.5"/>' },
    agent: { vak: '0 0 12 12', binnen: '<path d="M1.5 1.5h6l3 3v6h-9z"/>' },
    'risico-gevaarlijk': { vak: '0 0 24 24', vol: true, binnen: '<path class="hv-ic__vlak" d="M12 2.5 22.5 21h-21z"/><path class="hv-ic__glyph" d="M12 9.5v5.5M12 17.7v.3"/>' },
    'risico-kritiek': { vak: '0 0 24 24', vol: true, binnen: '<path class="hv-ic__vlak" d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path class="hv-ic__glyph" d="M12 7v6.5M12 16.7v.3"/>' },
    uitroep: { vak: '0 0 24 24', binnen: '<path d="M12 6v8M12 17.6v.4"/>' },
    'merk-vierkant': { vak: '0 0 8 8', vol: true, binnen: '<rect class="hv-ic__vlak" x="0.5" y="0.5" width="7" height="7"/>' },
    'merk-vierkant-leeg': { vak: '0 0 8 8', binnen: '<rect x="1" y="1" width="6" height="6"/>' },
    'merk-cirkel': { vak: '0 0 8 8', vol: true, binnen: '<circle class="hv-ic__vlak" cx="4" cy="4" r="3.5"/>' },
    'merk-halve-cirkel': { vak: '0 0 8 8', vol: true, binnen: '<path class="hv-ic__vlak" d="M0.5 6a3.5 3.5 0 0 1 7 0z"/>' },
    'merk-kruis': { vak: '0 0 8 8', binnen: '<path d="M1 1l6 6M7 1 1 7"/>' },
    'merk-streep': { vak: '0 0 8 8', binnen: '<path d="M0.5 4h7"/>' }
  };

  /** Іконка: назва lucide (kebab-case) або власний знак. opties: { maat:'s'|'m'|'l'|'xl'|'maker'|'merk', klas, titel } */
  HV.icoon = function (naam, opties) {
    var op = opties || {};
    var klas = 'hv-ic hv-ic--' + (op.maat || 'm') + (op.klas ? ' ' + op.klas : '');
    var eigen = HV.eigenIconen[naam];
    var aria = op.titel ? ' role="img" aria-label="' + h(op.titel) + '"' : ' aria-hidden="true"';
    if (eigen) return '<svg class="' + klas + (eigen.vol ? ' hv-ic--vol' : '') + '" viewBox="' + eigen.vak + '"' + aria + '>' + eigen.binnen + '</svg>';
    return '<svg class="' + klas + '" viewBox="0 0 24 24"' + aria + '><use href="#hv-i-' + h(naam) + '"/></svg>';
  };
  var ic = HV.icoon;

  /** data-атрибути з об'єкта: { doel:'torsher' } → data-doel="torsher". */
  HV.attrs = function (gegevens) {
    var uit = '';
    for (var k in gegevens || {}) if (gegevens[k] != null) uit += ' data-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) + '="' + h(gegevens[k]) + '"';
    return uit;
  };
  var actieAttrs = function (actie, gegevens) { return actie ? ' data-actie="' + h(actie) + '"' + HV.attrs(gegevens) : ''; };

  // ── Kleine bouwstenen ──
  /** Кнопка. soort: 'hoofd' (одна основна дія, акцент) | 'gewoon' | 'stil' | 'gevaar'. */
  o.knop = function (p) {
    return '<button type="button" class="hv-knop hv-knop--' + (p.soort || 'gewoon') + (p.klein ? ' hv-knop--klein' : '') + (p.klas ? ' ' + p.klas : '') + '"' + actieAttrs(p.actie, p.gegevens) + (p.uit ? ' aria-disabled="true"' : '') + (p.aria ? ' aria-label="' + h(p.aria) + '"' : '') + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' +
      (p.icoon ? ic(p.icoon, { maat: 's' }) : '') + (p.tekst ? '<span>' + h(p.tekst) + '</span>' : '') + '</button>';
  };
  /** Кнопка лише з іконкою: aria-label обов'язковий. */
  o.icoonknop = function (p) {
    return '<button type="button" class="hv-icoonknop' + (p.klas ? ' ' + p.klas : '') + '"' + actieAttrs(p.actie, p.gegevens) + ' aria-label="' + h(p.aria) + '" title="' + h(p.aria) + '"' + (p.extra || '') + '>' + ic(p.icoon, { maat: p.maat || 'm' }) + (p.teller ? '<span class="hv-icoonknop__teller">' + h(p.teller) + '</span>' : '') + '</button>';
  };

  /** Чип: паперова пігулка «іконка і слово». toon: 'aan'|'warm'|'koud'|'zon'|'batterij'|'auto'|'net-in'|'net-uit'|'ok'|'let-op'|'alarm'|'sim'. */
  o.chip = function (p) {
    var tag = p.actie ? 'button' : 'span';
    var klas = 'hv-chip' + (p.toon ? ' hv-chip--toon hv-toon-' + p.toon : '') + (p.gekozen ? ' is-gekozen' : '') + (p.filter ? ' hv-chip--filter' : '') + (p.klas ? ' ' + p.klas : '');
    return '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="' + klas + '"' + actieAttrs(p.actie, p.gegevens) + (p.filter ? ' aria-pressed="' + (p.gekozen ? 'true' : 'false') + '"' : '') + (p.aria ? ' aria-label="' + h(p.aria) + '"' : '') + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' +
      (p.icoon ? ic(p.icoon, { maat: 's' }) : '') + (p.html != null ? p.html : '<span>' + h(p.tekst) + '</span>') + '</' + tag + '>';
  };

  var MAKER_ICOON = { mens: 'user', knop: 'hand', automatisering: 'diamond', agent: 'agent', simulator: 'flask-conical', dienst: 'cloud', optimalisatie: 'gauge', systeem: 'cpu', scene: null };
  var MAKER_SOORT = { mens: ['людина', 'mens'], knop: ['фізична кнопка', 'fysieke knop'], automatisering: ['автоматизація', 'automatisering'], agent: ['ШІ-агент', 'AI-agent'], simulator: ['симулятор', 'simulator'], dienst: ['зовнішня служба', 'externe dienst'], optimalisatie: ['оптимізатор', 'optimalisatie'], systeem: ['система', 'systeem'], scene: ['сцена', 'scène'] };
  /** Знак автора з іменем: людина, кнопка, автоматизація, агент, симулятор, служба. maker: { soort, naam:[uk,nl] } або рядок soort. */
  o.maker = function (maker, opties) {
    if (!maker) return '';
    var m = typeof maker === 'string' ? { soort: maker } : maker;
    var naam = m.naam ? HV.p(m.naam) : HV.p(MAKER_SOORT[m.soort] || [m.soort, m.soort]);
    var icoon = MAKER_ICOON[m.soort];
    var alleenTeken = opties && opties.alleenTeken;
    return '<span class="hv-maker hv-maker--' + h(m.soort) + '" title="' + h(HV.p(MAKER_SOORT[m.soort] || ['', ''])) + '">' + (icoon ? ic(icoon, { maat: 'maker' }) : '') +
      (alleenTeken && icoon ? '<span class="hv-vo">' + h(naam) + '</span>' : '<span class="hv-maker__naam">' + (m.soort === 'scene' ? t('«', '‘') + h(naam) + t('»', '’') : h(naam)) + '</span>') + '</span>';
  };

  /** Штамп виміру 12/600: значення · вік · джерело. */
  o.stempel = function (p) {
    var delen = [];
    if (p.waarde != null) delen.push('<span>' + p.waarde + '</span>');
    if (p.leeftijd != null) delen.push('<span class="hv-stempel__oud">' + h(HV.oud(p.leeftijd)) + '</span>');
    if (p.bron) delen.push('<span class="hv-stempel__bron">' + ic('flask-conical', { maat: 'maker' }) + h(p.bron) + '</span>');
    return '<p class="hv-stempel' + (p.staat ? ' is-' + p.staat : '') + '">' + delen.join('<span class="hv-punt" aria-hidden="true">·</span>') + '</p>';
  };

  /** Чип актуальності й шляху даних — завжди зі словом. */
  o.versheid = function (w) {
    if (w.gegevens === 'geen') return '<span class="hv-versheid is-geen">' + ic('wifi-off', { maat: 's' }) + '<span>' + h(HV.woord.geenVerbinding()) + '</span></span>';
    if (w.gegevens === 'verouderd') return '<span class="hv-versheid is-verversing">' + ic('refresh-cw', { maat: 's' }) + '<span>' + h(t('оновлення 30 с', 'ververst elke 30 s')) + '</span></span>';
    return '<span class="hv-versheid is-live"><span class="hv-versheid__stip" aria-hidden="true"></span><span>' + h(HV.woord.live()) + '</span></span>';
  };

  /** Чип симуляції з колбою: «Симуляція ×60 · 14:30». kort — лише швидкість і час. */
  o.sim = function (w, opties) {
    var snel = w.pauze ? t('пауза', 'pauze') : '×' + w.snelheid;
    var kort = opties && opties.kort;
    return '<button type="button" class="hv-sim" data-actie="ga" data-naar="instellingen-simulator" aria-label="' + h(t('Симуляція, швидкість ', 'Simulatie, snelheid ') + snel + t(', час дому ', ', huistijd ') + HV.tijd(w.tijd)) + '">' + ic('flask-conical', { maat: 's' }) +
      '<span>' + (kort ? '' : h(t('Симуляція', 'Simulatie')) + ' ') + h(snel) + '</span><span class="hv-punt" aria-hidden="true">·</span><span class="hv-sim__tijd">' + HV.tijd(w.tijd) + '</span></button>';
  };

  /** Знак рівня дії зі словом: чутлива — око, небезпечна — трикутник, критична — восьмикутник. Звичайна — лише слово. */
  o.risico = function (niveau, opties) {
    var n = HV.gevaar.niveaus[niveau] || HV.gevaar.niveaus.gewoon;
    return '<span class="hv-risico hv-risico--' + h(niveau) + '">' + (n.icoon ? ic(n.icoon, { maat: 's' }) : '') + '<span>' + h(HV.p(n.naam)) + (opties && opties.lang ? ' ' + h(t('дія', 'actie')) : '') + '</span></span>';
  };

  /**
   * Підказка-наслідок: кнопка «i» (або «!» для ризику), що відкриває паперову картку з трьома підписаними рядками.
   * tekst — рядок «Що станеться: … Пов'язано з: … Як повернути: …». soort: 'i' | 'uitroep'. vast — залита позначка рівня («Завжди»).
   */
  o.gevolg = function (tekst, opties) {
    var op = opties || {};
    var uitroep = op.soort === 'uitroep';
    var label = uitroep ? t('Пояснення ризику', 'Uitleg van het risico') : t('Що станеться', 'Wat er gebeurt');
    var binnen = op.vast ? ic(op.vast === 'kritiek' ? 'risico-kritiek' : 'risico-gevaarlijk', { maat: 'risico' }) : ic(uitroep ? 'uitroep' : 'info', { maat: 's' });
    return '<button type="button" class="hv-uitleg' + (uitroep ? ' hv-uitleg--uitroep' : '') + (op.vast ? ' hv-uitleg--vast' : '') + '" data-actie="uitleg" data-tekst="' + h(tekst) + '" data-kop="' + h(op.kop || label) + '" aria-label="' + h(label) + '" aria-haspopup="dialog" aria-expanded="false">' + binnen + '</button>';
  };
  /** Розбиває текст підказки на підписані рядки «Що станеться / Пов'язано з / Як повернути». */
  o.gevolgRijen = function (tekst) {
    var delen = String(tekst).split(/(?<=[.!?»’])\s+(?=[А-ЯІЇЄҐA-Z][^:]{2,34}: )/);
    return '<dl class="hv-gevolg__rijen">' + delen.map(function (d) {
      var i = d.indexOf(': ');
      if (i < 0 || i > 36) return '<div><dd>' + h(d) + '</dd></div>';
      return '<div><dt>' + h(d.slice(0, i)) + '</dt><dd>' + h(d.slice(i + 2)) + '</dd></div>';
    }).join('') + '</dl>';
  };

  // ── Schakelaar, segment, stapper ──
  /** Коло-перемикач 40 px із ціллю ≥ 44. staat: 'wacht'|'onbereikbaar'|'verondersteld'|'verouderd'|'slaapt'. Без actie — пасивний знак. */
  o.schakel = function (p) {
    var klas = 'hv-schakel' + (p.aan ? ' is-aan' : '') + (p.toon ? ' hv-toon-' + p.toon : '') + (p.staat ? ' is-' + p.staat : '') + (p.kritiek ? ' hv-schakel--kritiek' : '') + (p.klein ? ' hv-schakel--klein' : '');
    var icoon = p.staat === 'onbereikbaar' ? 'unplug' : p.icoon;
    var teken = '<span class="hv-schakel__teken">' + ic(icoon, { klas: 'hv-schakel__ic' }) + (p.aftel != null ? '<svg class="hv-aftel__ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" pathLength="100" stroke-dasharray="' + Math.round(p.aftel * 100) + ' 100"/></svg>' : '') + '</span>';
    if (!p.actie || p.staat === 'onbereikbaar' || p.kritiek) return '<span class="' + klas + ' is-passief"' + (p.aria ? ' role="img" aria-label="' + h(p.aria) + '"' : ' aria-hidden="true"') + '>' + teken + '</span>';
    return '<button type="button" class="' + klas + '" role="switch" aria-checked="' + (p.aan ? 'true' : 'false') + '" aria-label="' + h(p.aria || '') + '"' + (p.staat === 'wacht' ? ' aria-busy="true"' : '') + actieAttrs(p.actie, p.gegevens) + '>' + teken + '</button>';
  };

  /** Сегмент (одна з кількох): opties [{ id, label, icoon? }]. role=radiogroup, стрілки перемикають. */
  o.segment = function (p) {
    return '<div class="hv-segment' + (p.klas ? ' ' + p.klas : '') + '" role="radiogroup" aria-label="' + h(p.label || '') + '"' + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' + p.opties.map(function (x) {
      var gekozen = String(x.id) === String(p.waarde);
      var g = {}; for (var k in p.gegevens || {}) g[k] = p.gegevens[k]; g.waarde = x.id;
      return '<button type="button" role="radio" aria-checked="' + (gekozen ? 'true' : 'false') + '" tabindex="' + (gekozen || (p.waarde == null && x === p.opties[0]) ? '0' : '-1') + '" class="hv-segment__deel' + (gekozen ? ' is-gekozen' : '') + '"' + (p.uit ? ' aria-disabled="true"' : '') + actieAttrs(p.actie, g) + '>' + (x.icoon ? ic(x.icoon, { maat: 's' }) : '') + '<span>' + h(x.label) + '</span></button>';
    }).join('') + '</div>';
  };
  /** Режим роботи «Пауза · Розумно · Швидко». */
  o.werkmodus = function (p) {
    return o.segment({ label: t('Режим роботи', 'Werkmodus'), waarde: p.waarde, actie: p.actie, gegevens: p.gegevens, uit: p.uit, klas: 'hv-werkmodus', k: p.k, opties: [
      { id: 'pauze', label: t('Пауза', 'Pauze'), icoon: 'pause' }, { id: 'slim', label: t('Розумно', 'Slim'), icoon: 'sparkles' }, { id: 'snel', label: t('Швидко', 'Snel'), icoon: 'zap' }] });
  };

  /** «−/+» довкола числа: два окремі органи з власними підписами. */
  o.stapper = function (p) {
    var g = function (r) { var x = {}; for (var k in p.gegevens || {}) x[k] = p.gegevens[k]; x.richting = r; x.stap = p.stap || 1; return x; };
    return '<span class="hv-stapper"' + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '><button type="button" class="hv-stap" aria-label="' + h((p.label ? p.label + ': ' : '') + t('менше', 'minder')) + '"' + actieAttrs(p.actie, g(-1)) + '>' + ic('minus', { maat: 's' }) + '</button>' +
      (p.waarde != null ? '<span class="hv-stapper__getal">' + p.waarde + '</span>' : '') +
      '<button type="button" class="hv-stap" aria-label="' + h((p.label ? p.label + ': ' : '') + t('більше', 'meer')) + '"' + actieAttrs(p.actie, g(1)) + '>' + ic('plus', { maat: 's' }) + '</button></span>';
  };

  /**
   * Повзунок: доріжка 8 px, бігунок 24 px (ціль ≥ 44), «−/+» і число. Під час руху значення оновлює ядро без перерисовки;
   * обробник data-schuif отримує { waarde, fase:'sleep'|'klaar' }.
   * p: { waarde, min, max, stap, actie, gegevens, toon, label, eenheid, decimalen, gewenst, uit, k }
   */
  o.schuif = function (p) {
    var min = p.min == null ? 0 : p.min, max = p.max == null ? 100 : p.max;
    var deel = function (v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); };
    var tekst = HV.maatTekst(p.waarde, p.eenheid || '%', p.decimalen || 0);
    var g = {}; for (var k in p.gegevens || {}) g[k] = p.gegevens[k];
    return '<div class="hv-schuif' + (p.toon ? ' hv-toon-' + p.toon : '') + (p.uit ? ' is-uit' : '') + (p.klas ? ' ' + p.klas : '') + '" data-k="' + h(p.k || 'schuif-' + p.actie + '-' + (g.doel || '') + '-' + (g.mogelijkheid || '')) + '">' +
      '<button type="button" class="hv-stap" data-actie="schuif-stap" data-richting="-1" aria-label="' + h(p.label + ': ' + t('менше', 'minder')) + '">' + ic('minus', { maat: 's' }) + '</button>' +
      '<div class="hv-schuif__baan" role="slider" tabindex="0" aria-label="' + h(p.label) + '" aria-valuemin="' + min + '" aria-valuemax="' + max + '" aria-valuenow="' + p.waarde + '" aria-valuetext="' + h(tekst) + '"' + (p.uit ? ' aria-disabled="true"' : '') +
      ' data-schuif="' + h(p.actie) + '" data-min="' + min + '" data-max="' + max + '" data-stap="' + (p.stap || 1) + '" data-eenheid="' + h(p.eenheid || '%') + '" data-decimalen="' + (p.decimalen || 0) + '"' + HV.attrs(g) + (p.stijl ? ' style="' + h(p.stijl) + '"' : '') + '>' +
      '<span class="hv-schuif__spoor"><span class="hv-schuif__vulling" style="width:' + deel(p.waarde) + '%"></span></span>' +
      (p.gewenst != null && p.gewenst !== p.waarde ? '<span class="hv-schuif__gewenst" style="left:' + deel(p.gewenst) + '%"></span>' : '') +
      '<span class="hv-schuif__knop" style="left:' + deel(p.waarde) + '%"></span></div>' +
      '<button type="button" class="hv-stap" data-actie="schuif-stap" data-richting="1" aria-label="' + h(p.label + ': ' + t('більше', 'meer')) + '">' + ic('plus', { maat: 's' }) + '</button>' +
      '<output class="hv-schuif__getal">' + HV.maat(p.waarde, p.eenheid || '%', p.decimalen || 0) + '</output></div>';
  };

  /**
   * Диск термостата: дуга 270°, 5–30 °C, крок 0,5. Ціль — бігунок тоном, виміряне — число в центрі. Завжди з «−/+».
   * p: { doel, gemeten, min, max, stap, toon:'warm'|'koud', bezig, actie, gegevens, label }
   */
  o.wijzer = function (p) {
    var min = p.min == null ? 5 : p.min, max = p.max == null ? 30 : p.max, stap = p.stap || 0.5;
    var R = 86, C = 100;
    var punt = function (v) { var hoek = (135 + 270 * Math.max(0, Math.min(1, (v - min) / (max - min)))) * Math.PI / 180; return [C + R * Math.cos(hoek), C + R * Math.sin(hoek)]; };
    var boog = function (van, tot) { var a = punt(van), b = punt(tot); var groot = (tot - van) / (max - min) * 270 > 180 ? 1 : 0; return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + groot + ' 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); };
    var d = punt(p.doel), m = p.gemeten == null ? null : punt(p.gemeten);
    var g = {}; for (var k in p.gegevens || {}) g[k] = p.gegevens[k];
    var woord = p.bezig ? (p.toon === 'koud' ? HV.woord.koelt() : HV.woord.verwarmt()) : t('тримає', 'houdt vast');
    return '<div class="hv-wijzer hv-toon-' + (p.toon || 'warm') + (p.bezig ? ' is-bezig' : '') + '" data-k="' + h(p.k || 'wijzer-' + (g.doel || '')) + '">' +
      '<div class="hv-wijzer__schijf" role="slider" tabindex="0" aria-label="' + h(p.label || t('Ціль температури', 'Doeltemperatuur')) + '" aria-valuemin="' + min + '" aria-valuemax="' + max + '" aria-valuenow="' + p.doel + '" aria-valuetext="' + h(HV.maatTekst(p.doel, '°C', 1)) + '" data-wijzer="' + h(p.actie) + '" data-min="' + min + '" data-max="' + max + '" data-stap="' + stap + '"' + HV.attrs(g) + '>' +
      '<svg viewBox="0 0 200 200" aria-hidden="true"><path class="hv-wijzer__baan" d="' + boog(min, max) + '"/><path class="hv-wijzer__vulling" d="' + boog(min, p.doel) + '"/>' +
      (m ? '<circle class="hv-wijzer__gemeten" cx="' + m[0].toFixed(1) + '" cy="' + m[1].toFixed(1) + '" r="4"/>' : '') +
      '<circle class="hv-wijzer__knop" cx="' + d[0].toFixed(1) + '" cy="' + d[1].toFixed(1) + '" r="12"/></svg>' +
      '<div class="hv-wijzer__midden"><span class="hv-wijzer__getal">' + (p.gemeten == null ? '—' : HV.maat(p.gemeten, '°C', 1)) + '</span><span class="hv-wijzer__woord">' + h(woord) + '</span></div></div>' +
      '<div class="hv-wijzer__doel"><button type="button" class="hv-stap" data-actie="wijzer-stap" data-richting="-1" aria-label="' + h(t('Ціль: нижче', 'Doel: lager')) + '">' + ic('minus', { maat: 's' }) + '</button>' +
      '<span class="hv-wijzer__doelgetal"><span class="hv-wijzer__doellabel">' + h(t('ціль', 'doel')) + '</span> <output>' + HV.maat(p.doel, '°C', 1) + '</output></span>' +
      '<button type="button" class="hv-stap" data-actie="wijzer-stap" data-richting="1" aria-label="' + h(t('Ціль: вище', 'Doel: hoger')) + '">' + ic('plus', { maat: 's' }) + '</button></div></div>';
  };

  // Колір світла — це дані (як фото), а не колір інтерфейсу: тому hsl() тут, а не токен.
  var lichtKleur = function (tint, verzadiging) { return 'hsl(' + Math.round(tint) + ' ' + Math.round(verzadiging) + '% ' + Math.round(88 - verzadiging * 0.38) + '%)'; };
  HV.lichtKleur = lichtKleur;
  var VOORKEUZES = [[['Свічка', 'Kaars'], 28, 90], [['Захід сонця', 'Zonsondergang'], 14, 85], [['Рожевий', 'Roze'], 330, 60], [['Бузковий', 'Lila'], 265, 55], [['Океан', 'Oceaan'], 200, 75], [['Ліс', 'Bos'], 135, 60], [['Лимон', 'Citroen'], 55, 80], [['Білий', 'Wit'], 40, 0]];
  /**
   * Колір трьома способами: «Заготовки · Повзунки · Коло». p: { tint, verzadiging, wijze, actie, gegevens, wijzeActie }
   */
  o.kleur = function (p) {
    var wijze = p.wijze || 'voorkeuzes';
    var g = function (extra) { var x = {}; for (var k in p.gegevens || {}) x[k] = p.gegevens[k]; for (var e in extra) x[e] = extra[e]; return x; };
    var lijf = '';
    if (wijze === 'voorkeuzes') {
      lijf = '<div class="hv-kleur__rooster">' + VOORKEUZES.map(function (v) {
        var gekozen = Math.abs(v[1] - p.tint) < 6 && Math.abs(v[2] - p.verzadiging) < 8;
        return '<button type="button" class="hv-kleur__staal' + (gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '"' + actieAttrs(p.actie, g({ tint: v[1], verzadiging: v[2] })) + '><span class="hv-kleur__vlak" style="background:' + lichtKleur(v[1], v[2]) + '"></span><span class="hv-kleur__naam">' + h(HV.p(v[0])) + '</span></button>';
      }).join('') + '</div>';
    } else if (wijze === 'schuiven') {
      lijf = o.schuif({ label: t('Відтінок', 'Tint'), waarde: Math.round(p.tint), min: 0, max: 359, stap: 5, eenheid: '°', actie: p.actie, gegevens: g({ as: 'tint', verzadiging: p.verzadiging }), klas: 'hv-schuif--tint', k: 'kleur-tint', stijl: '--hv-spoor: linear-gradient(90deg, ' + [0, 60, 120, 180, 240, 300, 359].map(function (x) { return lichtKleur(x, 85); }).join(', ') + ')' }) +
        o.schuif({ label: t('Насиченість', 'Verzadiging'), waarde: Math.round(p.verzadiging), min: 0, max: 100, stap: 5, actie: p.actie, gegevens: g({ as: 'verzadiging', tint: p.tint }), k: 'kleur-verz', stijl: '--hv-spoor: linear-gradient(90deg, ' + lichtKleur(p.tint, 0) + ', ' + lichtKleur(p.tint, 100) + ')', klas: 'hv-schuif--verzadiging' });
    } else {
      // коло: дванадцять відтінків і біле осердя — кожен сектор є кнопкою (клавіатура й дотик, ціль ≥ 44 px)
      var sectoren = '';
      var P = function (r, hoek) { return (100 + r * Math.cos(hoek)).toFixed(1) + ' ' + (100 + r * Math.sin(hoek)).toFixed(1); };
      for (var i = 0; i < 12; i++) {
        var tint = i * 30, verz = 80, r1 = 98, r0 = 46;
        var a0 = (i * 30 - 105) * Math.PI / 180, a1 = (i * 30 - 75) * Math.PI / 180;
        var gekozen = p.verzadiging > 20 && Math.abs(((p.tint - tint + 540) % 360) - 180) < 15;
        sectoren += '<path role="button" tabindex="0" class="hv-kleur__sector' + (gekozen ? ' is-gekozen' : '') + '" aria-label="' + h(t('Відтінок ', 'Tint ') + tint + '°') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '" style="fill:' + lichtKleur(tint, verz) + '" d="M' + P(r0, a0) + 'L' + P(r1, a0) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + P(r1, a1) + 'L' + P(r0, a1) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + P(r0, a0) + 'Z"' + actieAttrs(p.actie, g({ tint: tint, verzadiging: verz })) + '/>';
      }
      var wit = p.verzadiging <= 20;
      lijf = '<svg class="hv-kleur__cirkel" viewBox="0 0 200 200" role="group" aria-label="' + h(t('Коло кольорів', 'Kleurcirkel')) + '">' + sectoren +
        '<circle role="button" tabindex="0" class="hv-kleur__sector hv-kleur__midden' + (wit ? ' is-gekozen' : '') + '" aria-label="' + h(t('Білий', 'Wit')) + '" aria-pressed="' + (wit ? 'true' : 'false') + '" cx="100" cy="100" r="40" style="fill:' + lichtKleur(40, 0) + '"' + actieAttrs(p.actie, g({ tint: 40, verzadiging: 0 })) + '/></svg>';
    }
    return '<div class="hv-kleur" data-k="kleur">' + o.segment({ label: t('Спосіб вибору кольору', 'Manier van kleur kiezen'), waarde: wijze, actie: p.wijzeActie || 'kleur-wijze', gegevens: p.gegevens, opties: [
      { id: 'voorkeuzes', label: t('Заготовки', 'Voorkeuzes') }, { id: 'schuiven', label: t('Повзунки', 'Schuifregelaars') }, { id: 'cirkel', label: t('Коло', 'Kleurcirkel') }] }) + lijf + '</div>';
  };

  /** Відлік: кільце довкола знака й «ще 14 хв». p: { rest (хв), totaal (хв), icoon, klaar } */
  o.aftel = function (p) {
    var deel = p.totaal ? Math.max(0, Math.min(1, p.rest / p.totaal)) : 0;
    return '<span class="hv-aftel' + (p.klaar ? ' is-klaar' : '') + '">' + o.schakel({ aan: !p.klaar, icoon: p.icoon || 'timer', aftel: deel, toon: p.toon || 'aan', aria: p.klaar ? t('завершено', 'klaar') : t('іде', 'loopt') }) +
      '<span class="hv-aftel__tekst">' + h(p.klaar ? t('завершено', 'klaar') : t('ще ', 'nog ') + HV.duur(p.rest)) + '</span></span>';
  };

  /**
   * Дозвіл hv-stand: «Вимкнено · Питати · Завжди» для одного виконавця й однієї дії; знак рівня й «!».
   * Усі три сегменти доступні власникові для будь-якої дії. Інші ролі бачать режим текстом із замком.
   * p: { uitvoerder (id), actie (запис матриці), rol }
   */
  o.stand = function (p) {
    var actie = p.actie, waarde = HV.gevaar.stand(p.uitvoerder, actie.sleutel);
    var zwaar = HV.gevaar.isZwaar(actie);
    var kop = '<div class="hv-stand__kop"><span class="hv-stand__naam">' + h(HV.p(actie.naam)) + '</span>' + o.risico(actie.niveau) +
      (zwaar ? o.gevolg(HV.p(actie.risico), { soort: 'uitroep', vast: waarde === 'altijd' ? actie.niveau : null, kop: t('Ризик', 'Risico') + ': ' + HV.p(actie.naam) }) : '') + '</div>';
    var lijf;
    if (p.rol && p.rol !== 'eigenaar') {
      lijf = '<p class="hv-stand__lees">' + ic('lock', { maat: 's' }) + '<span><strong>' + h(HV.p(HV.gevaar.standNamen[waarde])) + '</strong> · ' + h(t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen')) + '</span></p>';
    } else {
      lijf = '<div class="hv-stand__segmenten" role="group" aria-label="' + h(t('Дозвіл', 'Toestemming') + ': ' + HV.p(actie.naam)) + '">' + ['uit', 'vragen', 'altijd'].map(function (s) {
        var gekozen = s === waarde;
        return '<button type="button" class="hv-stand__deel' + (gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="stand" data-uitvoerder="' + h(p.uitvoerder) + '" data-sleutel="' + h(actie.sleutel) + '" data-waarde="' + s + '">' + (gekozen ? ic('check', { maat: 's' }) : '') + '<span>' + h(HV.p(HV.gevaar.standNamen[s])) + '</span></button>';
      }).join('') + '</div>';
    }
    return '<div class="hv-stand' + (zwaar && waarde === 'altijd' ? ' is-altijd-zwaar' : '') + '" data-k="stand-' + h(p.uitvoerder) + '-' + h(actie.sleutel) + '">' + kop + lijf + '<p class="hv-stand__kaders">' + o.chip({ icoon: 'calendar-clock', tekst: t('без рамок', 'zonder kaders') }) + '</p></div>';
  };

  // ── Apparaat → beeld ──
  var alarmWoord = { uit: ['Охорона: знято', 'Alarm: uit'], schil: ['Охорона: периметр', 'Alarm: schil'], nacht: ['Охорона: нічна', 'Alarm: nachtstand'], volledig: ['Охорона: повна', 'Alarm: volledig'] };
  HV.alarmWoord = alarmWoord;
  /**
   * Як пристрій виглядає на плитці: { aan, woord, waarde (HTML), niveau, toon, icoon, schakel:{mogelijkheid, aan, op, af}, kritiek, passief }.
   * Універсальне для всіх класів паспорта; органи обирає можливість, не бренд.
   */
  o.beeld = function (a) {
    var s = HV.paspoort.soorten[a.soort] || { icoon: 'circle-help', naam: [a.soort, a.soort] };
    var st = a.st, b = { icoon: s.icoon, toon: s.toon || null, aan: false, woord: '', waarde: '', niveau: null, schakel: null, kritiek: !!s.kritiek, passief: !!s.sensor };
    var aanUit = function (v) { return v ? HV.woord.aan() : HV.woord.uit(); };
    switch (a.soort) {
      case 'licht':
        b.aan = !!st.aan; b.woord = aanUit(b.aan); b.schakel = { mogelijkheid: 'aan' };
        if ('helderheid' in st) { b.niveau = st.aan ? st.helderheid : 0; if (st.aan) b.waarde = HV.maat(st.helderheid, '%'); }
        break;
      case 'lichtgroep':
        var leden = a.leden.map(function (id) { return HV.staat.w.apparaten[id]; });
        var n = leden.filter(function (l) { return l.st.aan; }).length;
        b.aan = n > 0; b.woord = n + ' ' + t('з', 'van') + ' ' + leden.length + ' ' + t('увімкнено', 'aan'); b.schakel = { mogelijkheid: 'aan' }; b.niveau = HV.kijk.groepHelderheid(a);
        break;
      case 'stopcontact': b.aan = !!st.aan; b.woord = aanUit(b.aan); b.waarde = st.aan ? HV.maat(st.vermogen, t('Вт', 'W')) : ''; b.schakel = { mogelijkheid: 'aan' }; break;
      case 'gordijn': case 'jaloezie': b.aan = st.positie > 0; b.woord = st.positie === 0 ? HV.woord.dicht() : st.positie === 100 ? HV.woord.open() : t('відчинено на', 'open op'); b.waarde = st.positie > 0 && st.positie < 100 ? HV.maat(st.positie, '%') : ''; b.niveau = st.positie; b.passief = true; break;
      case 'garagedeur': case 'poort': b.aan = !!st.open; b.woord = st.open ? HV.woord.open() : HV.woord.dicht(); b.kritiek = true; b.icoon = a.soort === 'poort' ? 'fence' : 'warehouse'; break;
      case 'slot': b.aan = !st.vergrendeld; b.woord = st.vergrendeld ? HV.woord.vergrendeld() : HV.woord.ontgrendeld(); b.icoon = st.vergrendeld ? 'lock-keyhole' : 'lock-keyhole-open'; break;
      case 'alarmsysteem': b.aan = st.stand !== 'uit'; b.woord = HV.p(alarmWoord[st.stand]); b.icoon = st.stand === 'uit' ? 'shield' : 'shield-check'; break;
      case 'thermostaat': case 'vloerverwarming': case 'radiatorkraan':
        b.aan = !!st.verwarmt; b.woord = st.verwarmt ? HV.woord.verwarmt() : (st.aan === false ? HV.woord.uit() : t('тримає', 'houdt vast'));
        b.waarde = HV.maat(st.temperatuur, '°C', 1) + ' <span class="hv-naar">→</span> ' + HV.maat(st.doel, '°C', 1); b.passief = true; b.stap = { mogelijkheid: 'doel', stap: 0.5 };
        if (a.soort === 'vloerverwarming') { b.passief = false; b.schakel = { mogelijkheid: 'aan' }; b.aan = !!st.aan; }
        break;
      case 'airco': b.aan = !!st.aan; b.woord = st.aan ? HV.woord.koelt() : HV.woord.uit(); b.waarde = st.aan ? HV.maat(st.doel, '°C', 1) : ''; b.schakel = { mogelijkheid: 'aan' }; break;
      case 'warmtepomp': b.aan = !!st.verwarmt; b.woord = st.modus === 'uit' ? HV.woord.uit() : st.verwarmt ? HV.woord.verwarmt() : t('чекає', 'stand-by'); b.waarde = HV.maat(st.aanvoer, '°C', 1); b.passief = true; break;
      case 'boiler': b.aan = !!st.aan; b.woord = st.verwarmt ? HV.woord.verwarmt() : aanUit(st.aan); b.waarde = HV.maat(st.temperatuur, '°C'); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'ventilatie': b.aan = st.stand > 0; b.woord = st.stand === 0 ? HV.woord.uit() : t('швидкість ', 'stand ') + st.stand; b.passief = true; break;
      case 'bevochtiger': b.aan = !!st.aan; b.woord = aanUit(st.aan); b.waarde = HV.maat(st.vocht, '%'); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'luchtreiniger': b.aan = !!st.aan; b.woord = aanUit(st.aan); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'tv': b.aan = !!st.aan; b.woord = aanUit(st.aan); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'speaker': case 'speakergroep': b.aan = !!st.speelt; b.woord = st.speelt ? t('грає', 'speelt') : t('тиша', 'stil'); b.waarde = st.speelt ? HV.maat(st.volume, '%') : ''; b.schakel = { mogelijkheid: 'afspelen' }; b.niveau = st.speelt ? st.volume : 0; b.toonNiveau = 'neutraal'; break;
      case 'stofzuiger': case 'maaier': b.aan = st.stand === 'bezig'; b.woord = HV.p(({ dock: ['на базі', 'in het station'], bezig: ['працює', 'bezig'], pauze: ['пауза', 'pauze'] })[st.stand]); b.waarde = HV.maat(st.lading, '%'); b.schakel = { mogelijkheid: 'robot', op: 'start', af: 'dock' }; break;
      case 'beregening': b.aan = !!st.aan; b.woord = st.aan ? t('поливає', 'sproeit') : st.overgeslagen ? t('пропущено: дощ', 'overgeslagen: regen') : HV.woord.uit(); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'temperatuur': b.woord = ''; b.waarde = HV.maat(st.waarde, '°C', 1); break;
      case 'vocht': case 'batterij': b.waarde = HV.maat(st.waarde, '%'); if (a.soort === 'batterij' && st.waarde < 15) { b.woord = t('замініть батарейку', 'batterij vervangen'); b.toon = 'let-op'; b.aan = true; } break;
      case 'co2': b.waarde = HV.maat(st.waarde, 'ppm'); b.woord = st.waarde > 1200 ? t('провітріть', 'ventileren') : t('добре', 'goed'); break;
      case 'co': b.aan = !!st.alarm; b.woord = st.alarm ? t('тривога', 'alarm') : t('чисто', 'geen koolmonoxide'); if (st.alarm) b.toon = 'alarm'; break;
      case 'lichtsterkte': b.waarde = HV.maat(st.waarde, t('лк', 'lux')); break;
      case 'beweging': b.aan = !!st.actief; b.woord = st.actief ? t('рух зараз', 'beweging nu') : t('рух ', 'beweging ') + HV.duur(st.laatst) + t(' тому', ' geleden'); break;
      case 'aanwezigheid': b.aan = !!st.actief; b.woord = st.actief ? t('хтось є', 'iemand aanwezig') : t('нікого', 'niemand'); break;
      case 'contact': b.aan = !!st.open; b.woord = st.open ? HV.woord.open() : HV.woord.dicht(); b.icoon = st.open ? 'door-open' : 'door-closed'; if (st.open) b.toon = 'let-op'; break;
      case 'lek': case 'rook': b.aan = !!st.alarm; b.woord = st.alarm ? t('тривога', 'alarm') : t('спокійно', 'rustig'); if (st.alarm) b.toon = 'alarm'; break;
      case 'wasmachine': case 'droger': case 'vaatwasser': b.aan = !!st.loopt; b.woord = st.loopt ? t('ще ', 'nog ') + HV.duur(st.rest) : t('готова', 'klaar'); b.passief = true; b.aftel = st.loopt ? Math.min(1, st.rest / 95) : null; break;
      case 'oven': b.aan = !!st.aan; b.woord = st.aan ? HV.woord.verwarmt() : HV.woord.uit(); b.waarde = st.aan ? HV.maat(st.temperatuur, '°C') : ''; b.schakel = { mogelijkheid: 'aan' }; break;
      case 'koelkast': b.aan = false; b.woord = st.deurOpen ? t('дверцята відчинено', 'deur open') : ''; b.waarde = HV.maat(st.temperatuur, '°C', 1); b.passief = true; break;
      case 'koffie': b.aan = !!st.aan; b.woord = st.aan ? t('готує', 'zet koffie') : t('готова', 'klaar'); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'computer': b.aan = !!st.aan; b.woord = st.aan ? t('працює', 'aan') : t('спить', 'slaapt'); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'nas': b.aan = !!st.aan; b.woord = st.aan ? t('працює', 'aan') : HV.woord.uit(); b.waarde = HV.maat(st.vol, '%'); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'printer': b.aan = !!st.aan; b.woord = aanUit(st.aan); b.schakel = { mogelijkheid: 'aan' }; break;
      case 'router': b.aan = true; b.woord = st.clients + ' ' + HV.meervoud(st.clients, ['пристрій', 'пристрої', 'пристроїв'], ['apparaat', 'apparaten']); b.passief = true; break;
      case 'irzender': case 'sceneknop': b.woord = HV.p(st.laatst); b.passief = true; break;
      case 'camera': b.woord = t('кадр із сервера', 'beeld via de server'); break;
      case 'deurbel': b.woord = st.laatst ? t('дзвінок о ', 'aangebeld om ') + HV.tijd(st.laatst) : t('тихо', 'stil'); break;
      case 'p1meter': b.waarde = HV.maat(st.fasen.reduce(function (x, y) { return x + y; }, 0), t('кВт', 'kW'), 2); break;
      case 'zonnepanelen': b.aan = st.vermogen > 0.05; b.waarde = HV.maat(st.vermogen, t('кВт', 'kW'), 1); b.toon = 'zon'; b.passief = true; break;
      case 'thuisbatterij': b.aan = st.vermogen !== 0; b.woord = st.vermogen > 0.02 ? HV.woord.laadt() : st.vermogen < -0.02 ? t('віддає', 'ontlaadt') : t('чекає', 'stand-by'); b.waarde = HV.maat(st.lading, '%'); b.niveau = st.lading; b.passief = true; break;
      case 'laadpaal': b.aan = !!st.laadt; b.woord = st.laadt ? HV.woord.laadt() : st.aangesloten ? t('під’єднано', 'aangesloten') : t('вільна', 'vrij'); b.waarde = st.laadt ? HV.maat(st.vermogen, t('кВт', 'kW'), 1) : ''; b.schakel = { mogelijkheid: 'laden' }; break;
      default: b.woord = HV.p(s.naam);
    }
    return b;
  };

  var STAAT_WOORD = { onbereikbaar: 'onbereikbaar', verouderd: 'verouderd', verondersteld: 'verondersteld', slaapt: 'slaapt' };
  /** Чи видно знак автора на пристрої (10 хв часу дому або пів хвилини справжнього). */
  HV.makerZichtbaar = function (a) { return !!a.maker && (HV.staat.w.tijd - a.maker.tijd < 600000 || Date.now() - a.maker.echt < 30000); };

  /**
   * Плитка пристрою: коло перемикає, тіло відкриває аркуш. Заливка рівня — спостережене, риска — бажане.
   * opties: { vorm:'2x1'|'2x2'|'1x1', metKamer }
   */
  o.tegel = function (a, opties) {
    var op = opties || {}, w = HV.staat.w, b = o.beeld(a);
    var vorm = op.vorm || (b.niveau != null && a.soort === 'licht' ? '2x2' : '2x1');
    var staat = a.wacht ? 'wacht' : (a.beschikbaar !== 'ok' ? a.beschikbaar : (w.gegevens === 'verouderd' ? 'verouderd' : null));
    var dood = a.beschikbaar === 'onbereikbaar';
    // бажане значення під час очікування (риска)
    var gewenstAan = a.wacht && (a.wacht.mogelijkheid === 'aan' || a.wacht.mogelijkheid === 'afspelen' || a.wacht.mogelijkheid === 'laden') ? a.wacht.waarde : null;
    var gewenstNiveau = a.wacht && a.wacht.mogelijkheid === 'helderheid' ? a.wacht.waarde : null;
    var aan = dood ? false : (gewenstAan != null ? gewenstAan : b.aan);
    var naam = HV.p(a.naam);
    var kamer = op.metKamer ? HV.staat.kamer(a.kamer) : null;
    var woord = dood ? HV.woord.onbereikbaar() : a.wacht ? HV.woord.wacht() : b.woord;
    var staatWoord = !dood && !a.wacht && STAAT_WOORD[a.beschikbaar] ? HV.woord[STAAT_WOORD[a.beschikbaar]]() : '';
    var leeftijd = HV.kijk.leeftijd(a);
    var waardeRegel = [];
    if (woord) waardeRegel.push('<span class="hv-tegel__woord">' + h(woord) + '</span>');
    if (b.waarde && !dood) waardeRegel.push('<span class="hv-tegel__getal">' + b.waarde + '</span>');
    if (staatWoord) waardeRegel.push('<span class="hv-tegel__staat">' + h(staatWoord) + '</span>');
    if (dood) waardeRegel.push('<span class="hv-tegel__oud">' + h(t('востаннє ', 'laatst ') + HV.tijd(a.gezien)) + '</span>');
    else if (a.beschikbaar === 'verouderd' || w.gegevens !== 'live') waardeRegel.push('<span class="hv-tegel__oud">' + h(HV.oud(leeftijd)) + '</span>');
    var ariaLijf = naam + (kamer ? ', ' + HV.p(kamer.naam) : '') + ': ' + (woord || '') + (staatWoord ? ', ' + staatWoord : '') + '. ' + t('Відкрити', 'Openen');
    var sch = b.schakel;
    var schakel = o.schakel({
      aan: aan, icoon: b.icoon, toon: b.toon, staat: staat, kritiek: b.kritiek, aftel: a.st.uitOm ? Math.max(0, Math.min(1, (a.st.uitOm - w.tijd) / 3600000)) : b.aftel,
      actie: sch && !b.kritiek ? 'schakel' : null, gegevens: sch ? { doel: a.id, mogelijkheid: sch.mogelijkheid, op: sch.op, af: sch.af } : null,
      aria: naam + (kamer ? ', ' + HV.p(kamer.naam) : '') + (sch ? '' : ': ' + woord)
    });
    var niveau = '';
    if (b.niveau != null && !dood) {
      niveau = '<span class="hv-tegel__niveau' + (b.toonNiveau ? ' hv-toon-' + b.toonNiveau : '') + '" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, b.niveau)) + '%"></i>' + (gewenstNiveau != null ? '<b style="left:' + gewenstNiveau + '%"></b>' : '') + '</span>';
    }
    var stap = '';
    if (vorm === '2x2' && !dood && a.mog.indexOf('helderheid') >= 0) {
      stap = o.stapper({ actie: 'tegel-stap', gegevens: { doel: a.id, mogelijkheid: 'helderheid' }, stap: 10, label: naam, k: 'stap-' + a.id });
    } else if (vorm === '2x2' && !dood && b.stap) {
      stap = o.stapper({ actie: 'tegel-stap', gegevens: { doel: a.id, mogelijkheid: b.stap.mogelijkheid }, stap: b.stap.stap, label: naam, k: 'stap-' + a.id });
    }
    var altijd = HV.gevaar.altijdZwaar().filter(function (x) { return x.actie.soorten && x.actie.soorten.indexOf(a.soort) >= 0; })[0];
    return '<div class="hv-tegel hv-tegel--' + vorm + (aan ? ' is-aan' : '') + (staat ? ' is-' + staat : '') + (b.toon ? ' hv-toon-' + b.toon : '') + (b.kritiek ? ' hv-tegel--kritiek' : '') + '" data-k="tegel-' + h(a.id) + '">' +
      (altijd ? '<span class="hv-tegel__altijd">' + ic(altijd.actie.niveau === 'kritiek' ? 'risico-kritiek' : 'risico-gevaarlijk', { maat: 'risico', titel: t('Десь стоїть «Завжди» для цієї дії', 'Hier staat ergens ‘Altijd’ voor deze actie') }) + '</span>' : '') +
      schakel +
      '<button type="button" class="hv-tegel__lijf" data-actie="blad" data-blad="apparaat:' + h(a.id) + '" aria-label="' + h(ariaLijf) + '">' +
      '<span class="hv-tegel__naam">' + h(naam) + '</span>' + (kamer ? '<span class="hv-tegel__kamer">' + h(HV.p(kamer.naam)) + '</span>' : '') +
      '<span class="hv-tegel__waarde">' + waardeRegel.join('<span class="hv-punt" aria-hidden="true">·</span>') + '</span></button>' +
      (HV.makerZichtbaar(a) && !a.wacht ? '<span class="hv-tegel__maker">' + o.maker(a.maker, { alleenTeken: true }) + '</span>' : '') +
      stap + niveau + '</div>';
  };

  /** Картка кімнати: назва, температура, знак світла з лічильником, до трьох чипів-винятків, «−/+» цілі. */
  o.kamerkaart = function (kamer) {
    var w = HV.staat.w;
    var temp = HV.kijk.temperatuur(kamer.id);
    var lampen = HV.kijk.lampen(kamer.id), aan = HV.kijk.lampenAan(kamer.id);
    var chips = [];
    HV.kijk.inKamer(kamer.id).forEach(function (a) {
      if (chips.length >= 3) return;
      if (a.soort === 'contact' && a.st.open && HV.kijk.isVers(a)) chips.push(o.chip({ icoon: 'door-open', toon: 'let-op', tekst: HV.p(a.naam) + ': ' + HV.woord.open() }));
      else if (a.beschikbaar === 'onbereikbaar') chips.push(o.chip({ icoon: 'unplug', tekst: HV.p(a.naam) + ': ' + HV.woord.onbereikbaar() }));
      else if ((a.soort === 'rook' || a.soort === 'lek' || a.soort === 'co') && a.st.alarm) chips.push(o.chip({ icoon: 'alarm-smoke', toon: 'alarm', tekst: HV.p(a.naam) + ': ' + t('тривога', 'alarm') }));
      else if ((a.soort === 'wasmachine' || a.soort === 'vaatwasser' || a.soort === 'droger') && a.st.loopt) chips.push(o.chip({ icoon: HV.paspoort.soorten[a.soort].icoon, tekst: HV.p(a.naam) + ': ' + HV.duur(a.st.rest) }));
      else if ((a.soort === 'tv' && a.st.aan) || (a.soort === 'speaker' && a.st.speelt)) chips.push(o.chip({ icoon: HV.paspoort.soorten[a.soort].icoon, tekst: a.soort === 'tv' ? t('телевізор увімкнено', 'tv aan') : t('грає музика', 'muziek speelt') }));
    });
    var tempHtml = temp ? (temp.beschikbaar === 'verouderd' ? '<span class="hv-kamerkaart__temp is-verouderd">' + HV.maat(temp.st.waarde, '°C', 1) + '</span>' : '<span class="hv-kamerkaart__temp">' + HV.maat(temp.st.waarde, '°C', 1) + '</span>') : '<span class="hv-kamerkaart__temp is-leeg" aria-label="' + h(HV.woord.onbekend()) + '">—</span>';
    var sub = [];
    if (lampen.length) sub.push(aan.length ? aan.length + ' ' + t('з', 'van') + ' ' + lampen.length + ' ' + HV.meervoud(lampen.length, ['лампи', 'ламп', 'ламп'], ['lamp', 'lampen']) : t('світло вимкнено', 'licht uit'));
    if (temp && temp.beschikbaar === 'verouderd') sub.push(HV.woord.verouderd() + ' ' + HV.oud(HV.kijk.leeftijd(temp)));
    else if (kamer.doel != null) sub.push(t('ціль ', 'doel ') + HV.getal(kamer.doel, 1) + ' °C');
    return '<article class="hv-kamerkaart' + (aan.length ? ' is-licht' : '') + '" data-k="kamer-' + h(kamer.id) + '">' +
      '<button type="button" class="hv-kamerkaart__lijf" data-actie="ga" data-naar="kamers-kamer-' + h(kamer.id) + '" aria-label="' + h(HV.p(kamer.naam) + '. ' + t('Відкрити кімнату', 'Kamer openen')) + '">' +
      '<span class="hv-kamerkaart__kop">' + ic(kamer.icoon, { maat: 's' }) + '<span class="hv-kamerkaart__naam">' + h(HV.p(kamer.naam)) + '</span></span>' + tempHtml +
      '<span class="hv-kamerkaart__sub">' + h(sub.join(' · ')) + '</span></button>' +
      (lampen.length ? o.schakel({ aan: aan.length > 0, icoon: 'lightbulb', toon: 'aan', actie: 'kamer-licht', gegevens: { kamer: kamer.id }, aria: t('Світло: ', 'Licht: ') + HV.p(kamer.naam) }) : '') +
      (chips.length ? '<div class="hv-kamerkaart__chips">' + chips.join('') + '</div>' : '') +
      (kamer.doel != null && w.gegevens !== 'geen' ? '<div class="hv-kamerkaart__doel">' + o.stapper({ actie: 'kamer-doel', gegevens: { kamer: kamer.id }, stap: 0.5, label: t('Ціль температури: ', 'Doeltemperatuur: ') + HV.p(kamer.naam), k: 'doel-' + kamer.id }) + '</div>' : '') +
      '</article>';
  };

  /**
   * Телеметрична картка (авто, дрон, робот): заряд і запас ходу, три числа, силует.
   * p: { id, icoon, naam, stand (слово), lading (0–100), bereik (HTML), getallen:[{ label, waarde }], toon, actie, gegevens, staat }
   */
  o.telemetrie = function (p) {
    return '<article class="hv-telemetrie hv-toon-' + (p.toon || 'batterij') + (p.staat ? ' is-' + p.staat : '') + '" data-k="tele-' + h(p.id) + '">' +
      '<' + (p.actie ? 'button type="button"' + actieAttrs(p.actie, p.gegevens) : 'div') + ' class="hv-telemetrie__lijf">' +
      '<span class="hv-telemetrie__kop"><span class="hv-telemetrie__naam">' + h(p.naam) + '</span><span class="hv-telemetrie__stand">' + h(p.stand || '') + '</span></span>' +
      '<span class="hv-telemetrie__silhouet">' + ic(p.icoon, { maat: 'xl' }) + '</span>' +
      (p.lading != null ? '<span class="hv-telemetrie__lading"><span class="hv-telemetrie__getal">' + HV.maat(Math.round(p.lading), '%') + '</span>' + (p.bereik ? '<span class="hv-telemetrie__bereik">' + p.bereik + '</span>' : '') + '</span>' +
        '<span class="hv-telemetrie__balk" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, p.lading)) + '%"></i>' + (p.doel ? '<b style="left:' + p.doel + '%"></b>' : '') + '</span>' : '') +
      (p.getallen && p.getallen.length ? '<span class="hv-telemetrie__rij">' + p.getallen.slice(0, 3).map(function (g) { return '<span><span class="hv-telemetrie__label">' + h(g.label) + '</span><span class="hv-telemetrie__waarde">' + g.waarde + '</span></span>'; }).join('') + '</span>' : '') +
      '</' + (p.actie ? 'button' : 'div') + '></article>';
  };

  /** Кнопка сцени: коло запускає; «діє» — коли сцена активна. */
  o.scene = function (scene, actief) {
    return '<button type="button" class="hv-scene' + (actief ? ' is-actief' : '') + '" data-actie="scene" data-scene="' + h(scene.id) + '" data-k="scene-' + h(scene.id) + '" aria-label="' + h(t('Сцена ', 'Scène ') + HV.p(scene.naam) + (actief ? ', ' + t('діє', 'actief') : '')) + '">' +
      '<span class="hv-scene__teken">' + ic(scene.icoon) + '</span><span class="hv-scene__naam">' + h(HV.p(scene.naam)) + '</span>' + (actief ? '<span class="hv-scene__actief">' + h(t('діє', 'actief')) + '</span>' : '') + '</button>';
  };

  // ── Blok, held, nu, leeg, skelet ──
  /**
   * Смуга розділу, що згортається й пам'ятає свій стан. Порожній блок зникає (inhoud === '').
   * p: { id, titel, teller, inhoud, uitleg (текст підказки), extra (HTML у заголовку), vast (не згортається), samenvatting (рядок у згорнутому), dicht (типово згорнутий) }
   */
  o.blok = function (p) {
    if (!p.inhoud) return '';
    var geheugen = HV.opslag.lees('blokken', {});
    var open = p.vast ? true : (p.id in geheugen ? geheugen[p.id] : !p.dicht);
    var kan = !p.vast && HV.profielKanInklappen();
    if (!kan) open = true;
    var titel = '<h2 class="hv-blok__naam">' + h(p.titel) + '</h2>' + (p.teller != null ? '<span class="hv-blok__teller">' + h(p.teller) + '</span>' : '');
    var kop = kan
      ? '<button type="button" class="hv-blok__titel" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="blok-' + h(p.id) + '" data-actie="blok" data-blok="' + h(p.id) + '">' + titel + ic('chevron-down', { maat: 's', klas: 'hv-blok__pijl' }) + '</button>'
      : '<div class="hv-blok__titel">' + titel + '</div>';
    return '<section class="hv-blok' + (open ? ' is-open' : ' is-dicht') + (p.klas ? ' ' + p.klas : '') + '" data-k="blok-' + h(p.id) + '">' +
      '<header class="hv-blok__kop">' + kop + (p.uitleg ? o.gevolg(p.uitleg, { kop: p.titel }) : '') + (p.extra ? '<span class="hv-blok__extra">' + p.extra + '</span>' : '') + '</header>' +
      (open ? '<div class="hv-blok__inhoud" id="blok-' + h(p.id) + '">' + p.inhoud + '</div>' : (p.samenvatting ? '<p class="hv-blok__samenvatting" id="blok-' + h(p.id) + '">' + p.samenvatting + '</p>' : '<span id="blok-' + h(p.id) + '" hidden></span>')) +
      '</section>';
  };
  HV.profielKanInklappen = function () { return ['tv', 'strook', 'horloge', 'inkt'].indexOf(HV.profiel ? HV.profiel().id : '') < 0; };

  /** Герой: речення дому на небі, дата й час дому, паперові чипи одним рядом; праворуч — розріз. */
  o.held = function (p) {
    return '<section class="hv-held" data-k="held" aria-label="' + h(t('Як зараз удома', 'Hoe het thuis is')) + '">' +
      '<div class="hv-held__tekst">' + (p.datum ? '<p class="hv-held__datum">' + p.datum + '</p>' : '') +
      '<h1 class="hv-held__zin"><span class="hv-held__vol">' + p.zin + '</span><span class="hv-held__kort">' + (p.kort || p.zin) + '</span></h1>' +
      (p.chips ? '<div class="hv-held__chips" role="list">' + p.chips + '</div>' : '') + '</div>' +
      (p.rechts ? '<div class="hv-held__beeld">' + p.rechts + '</div>' : '') + '</section>';
  };

  /** «Зараз важливо»: до трьох рядків «знак · факт · дія»; четвертий рядок — «Ще N у Журналі». */
  o.nu = function (items) {
    if (!items || !items.length) return '';
    var w = HV.staat.w, max = (HV.bouw.gedrag && HV.bouw.gedrag.nuMax) || 3;
    var volgorde = { alarm: 0, verzoek: 1, aandacht: 2, info: 3 };
    var lijst = items.slice().sort(function (a, b) { return volgorde[a.soort] - volgorde[b.soort]; });
    var rijen = lijst.slice(0, max).map(function (n) {
      var minuten = Math.round((w.tijd - n.sinds) / 60000);
      return '<li class="hv-nu__rij hv-nu__rij--' + h(n.soort) + '" data-k="nu-' + h(n.id) + '">' +
        '<span class="hv-nu__teken">' + ic(n.icoon || 'info') + '</span>' +
        '<div class="hv-nu__feit"><p class="hv-nu__tekst">' + h(HV.p(n.tekst)) + '</p><p class="hv-nu__meta">' + o.maker(n.maker) + (minuten > 0 ? '<span class="hv-punt" aria-hidden="true">·</span><span>' + h(HV.duur(minuten)) + '</span>' : '') + '</p></div>' +
        '<div class="hv-nu__acties">' + (n.acties || []).map(function (x) { var g = {}; for (var k in x.gegevens || {}) g[k] = x.gegevens[k]; g.nu = n.id; return o.knop({ tekst: HV.p(x.label), soort: x.hoofd ? 'gewoon' : 'stil', klein: true, actie: x.naam, gegevens: g }); }).join('') + '</div></li>';
    }).join('');
    var meer = lijst.length > max ? '<li class="hv-nu__meer"><button type="button" class="hv-link" data-actie="ga" data-naar="activiteit">' + h(t('Ще ' + (lijst.length - max) + ' у Журналі', 'Nog ' + (lijst.length - max) + ' in het logboek')) + '</button></li>' : '';
    return '<ul class="hv-nu" data-k="nu">' + rijen + meer + '</ul>';
  };

  /** Порожній стан: що тут буде й одна дія. */
  o.leeg = function (p) {
    return '<div class="hv-leeg">' + (p.icoon ? '<span class="hv-leeg__teken">' + ic(p.icoon, { maat: 'l' }) + '</span>' : '') + '<h3 class="hv-leeg__titel">' + h(p.titel) + '</h3>' + (p.tekst ? '<p class="hv-leeg__tekst">' + h(p.tekst) + '</p>' : '') + (p.actie ? o.knop(p.actie) : '') + (p.stempel ? '<span class="hv-later">' + h(p.stempel) + '</span>' : '') + '</div>';
  };

  /** Скелет за формою вмісту, без блиску; після 5 с — текст «Досі завантажується…». vorm: 'tegels'|'rijen'|'blok' */
  o.skelet = function (vorm, aantal) {
    var n = aantal || 4, delen = '';
    for (var i = 0; i < n; i++) delen += '<span class="hv-skelet__deel hv-skelet__deel--' + h(vorm || 'tegels') + '"></span>';
    return '<div class="hv-skelet" aria-busy="true" aria-label="' + h(t('Завантаження', 'Laden')) + '">' + delen + '<p class="hv-skelet__tekst">' + h(t('Досі завантажується…', 'Laadt nog steeds…')) + '</p></div>';
  };

  // ── Toost en bericht ──
  /** Спливне сповіщення на папері: знак автора, два рядки, «Повернути» 10 с або рядок «Як повернути». */
  o.toost = function (x) {
    return '<div class="hv-toost hv-toost--' + h(x.gewicht) + '" data-k="' + h(x.id) + '" role="' + (x.gewicht === 'alarm' ? 'alert' : 'status') + '">' +
      '<span class="hv-toost__teken">' + ic(x.icoon || (x.gewicht === 'alarm' ? 'alarm-smoke' : x.gewicht === 'belangrijk' ? 'info' : 'check')) + '</span>' +
      '<div class="hv-toost__tekst"><p class="hv-toost__titel">' + h(x.titel) + '</p>' + (x.tekst ? '<p class="hv-toost__regel">' + h(x.tekst) + '</p>' : '') + (x.hoe ? '<p class="hv-toost__regel">' + h(x.hoe) + '</p>' : '') + (x.maker ? '<p class="hv-toost__maker">' + o.maker(x.maker) + '</p>' : '') + '</div>' +
      (x.terug ? '<button type="button" class="hv-knop hv-knop--gewoon hv-knop--klein hv-toost__terug" data-actie="toost-terug" data-toost="' + h(x.id) + '">' + ic('undo-2', { maat: 's' }) + '<span>' + h(t('Повернути', 'Ongedaan maken')) + '</span><span class="hv-toost__tijd" aria-hidden="true"></span></button>' : '') +
      o.icoonknop({ icoon: 'x', maat: 's', aria: t('Закрити сповіщення', 'Melding sluiten'), actie: 'toost-weg', gegevens: { toost: x.id }, klas: 'hv-toost__sluit' }) + '</div>';
  };

  var SOORT_NAAM = { 'huis.alarm': ['тривога', 'alarm'], 'huis.toegang': ['доступ', 'toegang'], 'huis.agent': ['агенти', 'agenten'], 'huis.automatisering': ['автоматика', 'automatisering'], 'huis.apparaat': ['пристрої', 'apparaten'], 'huis.energie': ['енергія', 'energie'], 'huis.voertuig': ['транспорт', 'voertuigen'], 'huis.integratie': ['інтеграції', 'integraties'], 'huis.systeem': ['система', 'systeem'], 'huis.simulatie': ['симуляція', 'simulatie'] };
  HV.meldingSoorten = SOORT_NAAM;
  /** Запис Журналу: «Хто · Що · Чому · Було → стало · Дозволено правилом»; розгортається. */
  o.bericht = function (r, opties) {
    var open = opties && opties.open;
    var details = '';
    if (open) {
      var rijen = [[t('Хто', 'Wie'), o.maker(r.maker)], [t('Що', 'Wat'), h(HV.p(r.wat))]];
      if (r.waarom) rijen.push([t('Чому', 'Waarom'), h(HV.p(r.waarom))]);
      if (r.was || r.werd) rijen.push([t('Було → стало', 'Was → werd'), h((r.was ? HV.p(r.was) : '—') + ' → ' + (r.werd ? HV.p(r.werd) : '—'))]);
      if (r.toegestaan) rijen.push([t('Дозволено правилом', 'Toegestaan door'), h(HV.p(r.toegestaan))]);
      rijen.push([t('Вид', 'Soort'), h(HV.p(SOORT_NAAM[r.soort] || [r.soort, r.soort]))]);
      details = '<dl class="hv-bericht__details">' + rijen.map(function (x) { return '<div><dt>' + h(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>';
    }
    return '<li class="hv-bericht hv-bericht--' + h(r.gewicht) + (r.gelezen ? '' : ' is-ongelezen') + (open ? ' is-open' : '') + '" data-k="' + h(r.id) + '">' +
      '<button type="button" class="hv-bericht__kop" aria-expanded="' + (open ? 'true' : 'false') + '" data-actie="bericht" data-bericht="' + h(r.id) + '">' +
      '<span class="hv-bericht__tijd">' + HV.tijd(r.tijd) + '</span>' +
      '<span class="hv-bericht__wat">' + h(HV.p(r.wat)) + (r.was && r.werd && !open ? ' <span class="hv-bericht__delta">' + h(HV.p(r.was) + ' → ' + HV.p(r.werd)) + '</span>' : '') + '</span>' +
      '<span class="hv-bericht__wie">' + o.maker(r.maker) + (r.sim ? ic('flask-conical', { maat: 'maker', klas: 'hv-bericht__sim', titel: t('симуляція', 'simulatie') }) : '') + '</span>' +
      ic('chevron-down', { maat: 's', klas: 'hv-bericht__pijl' }) + '</button>' + details + '</li>';
  };

  /** Рядок «назва — значення» для списків у аркушах і сторінках. */
  o.rij = function (p) {
    var tag = p.actie ? 'button' : 'div';
    return '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="hv-rij' + (p.klas ? ' ' + p.klas : '') + '"' + actieAttrs(p.actie, p.gegevens) + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' + (p.icoon ? '<span class="hv-rij__teken">' + ic(p.icoon, { maat: 's' }) + '</span>' : '') +
      '<span class="hv-rij__naam">' + h(p.naam) + (p.sub ? '<span class="hv-rij__sub">' + h(p.sub) + '</span>' : '') + '</span>' + (p.waarde != null ? '<span class="hv-rij__waarde">' + p.waarde + '</span>' : '') + (p.actie ? ic('chevron-right', { maat: 's', klas: 'hv-rij__pijl' }) : '') + '</' + tag + '>';
  };
  /** Паперова картка з необов'язковим заголовком. */
  o.kaart = function (p) {
    return '<div class="hv-kaart' + (p.klas ? ' ' + p.klas : '') + '"' + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' + (p.titel ? '<h3 class="hv-kaart__titel">' + h(p.titel) + (p.extra || '') + '</h3>' : '') + p.inhoud + '</div>';
  };
  /** Велике число з малою одиницею й підписом. maat: 'xl'|'l'|'m' */
  o.getal = function (p) {
    return '<div class="hv-getal hv-getal--' + (p.maat || 'l') + (p.toon ? ' hv-toon-' + p.toon : '') + '">' + (p.label ? '<span class="hv-getal__label">' + h(p.label) + '</span>' : '') + '<span class="hv-getal__waarde">' + p.waarde + '</span>' + (p.sub ? '<span class="hv-getal__sub">' + p.sub + '</span>' : '') + '</div>';
  };
  /** Штамп «збирається» / «пізніше». */
  o.later = function (tekst) { return '<span class="hv-later">' + ic('hourglass', { maat: 'maker' }) + h(tekst || t('збирається', 'in opbouw')) + '</span>'; };
})(window.HV = window.HV || {});
