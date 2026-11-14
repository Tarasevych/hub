// Bladen voor de overige apparaten — власні аркуші керування для решти типів демо-дому (зона «bladen-overig»):
// штори й жалюзі (полотно, нахил, «▲ ■ ▼»), гаражні й вхідні ворота (знак із ритуалом, зачинення з відліком 5 с),
// датчики (значення, шкала, графік доби, пороги, батарея, сигнал), техніка з програмою (кільце ходу, «Чекає дешевої години»),
// духовка, холодильник, кавоварка, комп'ютер, мережеве сховище, принтер, маршрутизатор, ІЧ-пульт і кнопка сцен.
// Кожен аркуш: Керування · Історія · Налаштування; кожна дія — через HV.doe (ворота, ризик, Журнал, «Повернути»).
// Для датчиків відкриття й руху аркуш «Безпеки» (veiligsensor) лишається першим блоком — ми лише додаємо аналітику.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var UUR = 3600000, MIN = 60000, DAG = 86400000;

  // ───────────────────────── 1. Дрібні помічники ─────────────────────────
  var W = function () { return HV.staat.w; };
  var A = function (id) { return HV.staat.w.apparaten[id] || null; };
  var naamVan = function (a) { return HV.p(a.naam); };
  var heeft = function (a, m) { return a.mog.indexOf(m) >= 0; };
  var gewenst = function (a, m) { return HV.gewenst(a, m); };
  var klem = function (v, min, max) { return Math.max(min, Math.min(max, v)); };
  var rond = function (v, dec) { var f = Math.pow(10, dec || 0); return Math.round(v * f) / f; };

  /** Детерміноване зерно з id пристрою (макет: однаковий вигляд після перезавантаження). */
  function zaadVan(id) { var z = 7; for (var i = 0; i < id.length; i++) z = (z * 31 + id.charCodeAt(i)) % 9973; return z; }
  /** Плавний «шум» для симульованих рядів. */
  function golf(z, i) { return Math.sin((i + z) / 3.3) * 0.55 + Math.sin((i * 1.7 + z) / 1.9) * 0.25 + Math.sin((i + z * 3) / 11) * 0.7; }
  /** Поділки осі часу: n рівних кроків від `van` до `tot`. */
  function tikken(van, tot, n, fmt) { var uit = []; for (var i = 0; i <= n; i++) { var x = van + (tot - van) * i / n; uit.push({ x: x, label: (fmt || HV.tijd)(x) }); } return uit; }
  var dagLabel = function (x) { var d = new Date(x); return d.getUTCDate() + '.' + (d.getUTCMonth() + 1 < 10 ? '0' : '') + (d.getUTCMonth() + 1); };
  /** Початок доби дому (00:00) для часу x. */
  var middernacht = function (x) { return x - (x % DAG); };
  var isDag = function (x) { var u = HV.uur(x); return u > 7.66 && u < 16.92; };

  var veld = function (label, html, extra) { return '<div class="hv-veld"><span class="hv-veld__label">' + h(label) + (extra || '') + '</span>' + html + '</div>'; };
  var blad = function (html) { return '<div class="hv-bo">' + html + '</div>'; };
  var knoppen = function (html, klas) { return '<div class="hv-knoppen' + (klas ? ' ' + klas : '') + '">' + html + '</div>'; };

  /** Рядок «Змінено: автор», коли знак автора ще видно. */
  function waarom(a) {
    if (!HV.makerZichtbaar(a)) return '';
    return '<p class="hv-waarom" data-k="waarom">' + h(t('Остання зміна: ', 'Laatste wijziging: ')) + o.maker(a.maker) + '</p>';
  }

  /** Знак пристрою зі станом очікування: коло (або квадрат ритуалу), якщо є перемикач; інакше пасивний знак. */
  function teken(a, b) {
    var sch = b.schakel;
    var aan = a.wacht && sch && a.wacht.mogelijkheid === sch.mogelijkheid ? a.wacht.waarde : b.aan;
    var staat = a.wacht ? (a.wacht.fase === 'bezig' ? 'bezig' : 'wacht') : (a.beschikbaar !== 'ok' ? a.beschikbaar : null);
    return o.schakel({ aan: !!aan, icoon: b.icoon, toon: b.toon, staat: staat, ritueel: sch ? HV.ritueelVan(a, sch) : null,
      actie: sch ? 'schakel' : null, gegevens: sch ? { doel: a.id, mogelijkheid: sch.mogelijkheid, op: sch.op, af: sch.af } : null, aria: naamVan(a) });
  }

  /**
   * Голова аркуша: знак, слово стану, велике число й рядок пояснення. p: { teken, woord, getal (HTML), sub (HTML), chips (HTML) }
   */
  function kop(p) {
    return '<div class="hv-bo-kop" data-k="bo-kop">' + '<div class="hv-bo-kop__teken">' + p.teken + '</div>' +
      '<div class="hv-bo-kop__tekst"><p class="hv-bo-kop__woord">' + h(p.woord || '') + '</p>' +
      (p.getal ? '<p class="hv-bo-kop__getal">' + p.getal + '</p>' : p.groot ? '<p class="hv-bo-kop__getal hv-bo-kop__getal--woord">' + h(p.groot) + '</p>' : '') + (p.sub ? '<p class="hv-bo-kop__sub">' + p.sub + '</p>' : '') + '</div>' +
      (p.chips ? '<div class="hv-bo-kop__chips">' + p.chips + '</div>' : '') + '</div>';
  }

  /** Смуга рівня (батарея, диск, бак, чорнило). p: { label, waarde (0–100), tekst (HTML), sub, laag (поріг), toon, k } */
  function balk(p) {
    var laag = (p.laag != null && p.waarde <= p.laag) || (p.hoog != null && p.waarde >= p.hoog);
    return '<div class="hv-bo-balk' + (laag ? ' is-laag' : '') + (p.toon ? ' hv-toon-' + p.toon : '') + '"' + (p.k ? ' data-k="' + h(p.k) + '"' : '') + '>' +
      '<div class="hv-bo-balk__kop"><span class="hv-bo-balk__label">' + (p.icoon ? HV.icoon(p.icoon, { maat: 's' }) : '') + h(p.label) + '</span><span class="hv-bo-balk__waarde">' + (laag ? HV.icoon('triangle-alert', { maat: 's' }) : '') + (p.tekst || HV.maat(Math.round(p.waarde), '%')) + '</span></div>' +
      '<span class="hv-bo-balk__spoor" role="img" aria-label="' + h(p.label + ': ' + Math.round(p.waarde) + ' %') + '"><i style="width:' + klem(p.waarde, 0, 100).toFixed(1) + '%"></i></span>' +
      (p.sub ? '<span class="hv-bo-balk__sub">' + h(p.sub) + '</span>' : '') + '</div>';
  }

  /** Якість сигналу: 0–4 рисок і слово. */
  function signaalSterkte(a) {
    if (a.beschikbaar === 'onbereikbaar') return 0;
    var z = zaadVan(a.id);
    if (KABEL[a.soort]) return 4;
    return a.beschikbaar === 'verouderd' ? 1 : 2 + (z % 3);
  }
  function signaal(a) {
    var n = signaalSterkte(a);
    var woord = KABEL[a.soort] ? t('дротове', 'bekabeld') : [t('немає', 'geen'), t('слабкий', 'zwak'), t('задовільний', 'redelijk'), t('добрий', 'goed'), t('сильний', 'sterk')][n];
    var staven = [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < n ? 'is-aan' : '') + '" style="height:' + (35 + i * 21) + '%"></i>'; }).join('');
    return '<span class="hv-bo-signaal' + (n <= 1 ? ' is-zwak' : '') + '"><span class="hv-bo-signaal__staven" role="img" aria-label="' + h(t('Сигнал: ', 'Signaal: ') + woord) + '">' + staven + '</span><span>' + h(woord) + '</span></span>';
  }

  // Як пристрій під'єднано (макет) і що перевірити, якщо зв'язок зникне — 2–3 кроки за типом.
  var KABEL = { computer: true, nas: true, router: true };
  var PROTOCOL = { temperatuur: 'Zigbee', vocht: 'Zigbee', co2: 'Zigbee', beweging: 'Zigbee', aanwezigheid: 'Thread', contact: 'Zigbee', lichtsterkte: 'Zigbee', batterij: 'Zigbee', sceneknop: 'Zigbee',
    gordijn: 'Zigbee', jaloezie: 'Zigbee', garagedeur: 'Wi-Fi', poort: 'Wi-Fi', wasmachine: 'Wi-Fi', droger: 'Wi-Fi', vaatwasser: 'Wi-Fi', oven: 'Wi-Fi', koelkast: 'Wi-Fi', koffie: 'Wi-Fi', printer: 'Wi-Fi', irzender: 'Wi-Fi' };
  var CONTROLE = {
    gordijn: [['Чи заряджено мотор штор (кабель знизу карниза)', 'Of de gordijnmotor is opgeladen (kabel onder de rail)'], ['Чи не заблоковано полотно предметом', 'Of er niets het doek blokkeert']],
    jaloezie: [['Чи заряджено мотор жалюзі', 'Of de motor van de jaloezie is opgeladen'], ['Чи не заклинило ламелі на шнурі', 'Of de lamellen niet klemmen aan het koord']],
    garagedeur: [['Чи чистий датчик перешкоди внизу проєму', 'Of de obstakelsensor onder in de opening schoon is'], ['Чи не ввімкнено ручне розчеплення приводу', 'Of de handmatige ontkoppeling van de aandrijving niet aan staat']],
    poort: [['Чи вільна рейка воріт від листя й снігу', 'Of de rail van de poort vrij is van bladeren en sneeuw'], ['Чи чисті фотоелементи на стовпах', 'Of de fotocellen op de palen schoon zijn']],
    temperatuur: [['Чи не сіла батарейка датчика', 'Of de batterij van de sensor niet leeg is']], vocht: [['Чи не сіла батарейка датчика', 'Of de batterij van de sensor niet leeg is']],
    co2: [['Чи вставлено датчик у розетку', 'Of de sensor in het stopcontact zit']], lichtsterkte: [['Чи не закрито датчик шторою', 'Of het gordijn de sensor niet afdekt']],
    beweging: [['Чи не сіла батарейка датчика', 'Of de batterij van de sensor niet leeg is'], ['Чи не перекрито лінзу', 'Of de lens niet is afgedekt']],
    aanwezigheid: [['Чи має датчик живлення через кабель', 'Of de sensor stroom krijgt via de kabel']], contact: [['Чи стоїть магніт навпроти датчика (до 1 см)', 'Of de magneet tegenover de sensor zit (tot 1 cm)'], ['Чи не сіла батарейка', 'Of de batterij niet leeg is']],
    batterij: [['Чи правильно вставлено нову батарейку (плюс догори)', 'Of de nieuwe batterij goed zit (plus boven)']], sceneknop: [['Чи не сіла батарейка кнопки', 'Of de batterij van de knop niet leeg is']],
    wasmachine: [['Чи ввімкнено на приладі «Дистанційний старт»', 'Of ‘Op afstand starten’ op het apparaat aan staat'], ['Чи зачинено дверцята', 'Of de deur dicht is']], droger: [['Чи ввімкнено на приладі «Дистанційний старт»', 'Of ‘Op afstand starten’ op het apparaat aan staat'], ['Чи не повний бак конденсату', 'Of het condensreservoir niet vol is']],
    vaatwasser: [['Чи ввімкнено на приладі «Дистанційний старт»', 'Of ‘Op afstand starten’ op het apparaat aan staat'], ['Чи є таблетка в дозаторі', 'Of er een tablet in het bakje zit']],
    oven: [['Чи дозволено на духовці керування з телефона', 'Of bediening via de telefoon op de oven is toegestaan']], koelkast: [['Чи щільно зачинено дверцята', 'Of de deur goed dicht is']], koffie: [['Чи є вода в баку', 'Of er water in het reservoir zit']],
    computer: [['Чи ввімкнено пробудження через мережу в налаштуваннях', 'Of wekken via het netwerk in de instellingen aan staat'], ['Чи під’єднано мережевий кабель', 'Of de netwerkkabel is aangesloten']],
    nas: [['Чи світиться індикатор живлення на сховищі', 'Of het stroomlampje op de opslag brandt'], ['Чи під’єднано мережевий кабель', 'Of de netwerkkabel is aangesloten']],
    printer: [['Чи принтер у тій самій мережі Wi-Fi', 'Of de printer op hetzelfde wifi-netwerk zit']], router: [['Чи світиться індикатор інтернету на маршрутизаторі', 'Of het internetlampje op de router brandt'], ['Чи під’єднано кабель провайдера', 'Of de kabel van de provider is aangesloten']],
    irzender: [['Чи бачить пульт пристрої (без перешкод на лінії)', 'Of de zender de apparaten ziet (niets ertussen)']]
  };

  /** Картка «Діагностика»: протокол, сигнал, звіт, батарея, що перевірити, «Перевірити зв'язок». */
  function diagnose(ctx, a, extra) {
    var bat = batterijVan(a);
    var rijen = o.rij({ icoon: KABEL[a.soort] ? 'cable' : 'radio-tower', naam: t('Зв’язок', 'Verbinding'), waarde: h(KABEL[a.soort] ? t('мережевий кабель', 'netwerkkabel') : PROTOCOL[a.soort] || 'Wi-Fi') }) +
      o.rij({ icoon: 'signal', naam: t('Якість сигналу', 'Signaalkwaliteit'), waarde: signaal(a) }) +
      o.rij({ icoon: 'clock', naam: t('Останній звіт', 'Laatste melding'), waarde: h(HV.oud(HV.kijk.leeftijd(a)) + t(' тому', ' geleden')) }) +
      (bat != null ? o.rij({ icoon: bat < 15 ? 'battery-low' : 'battery-medium', naam: t('Батарейка', 'Batterij'), waarde: HV.maat(bat, '%') }) : o.rij({ icoon: 'plug', naam: t('Живлення', 'Voeding'), waarde: h(t('від мережі', 'via het stopcontact')) })) +
      (extra || '');
    var stappen = (CONTROLE[a.soort] || []).concat([['Чи працює вузол зв’язку', 'Of de hub werkt']]).slice(0, 3);
    return o.kaart({ titel: t('Діагностика', 'Diagnose'), k: 'bo-diagnose', inhoud: '<div class="hv-rijen">' + rijen + '</div>' +
      '<p class="hv-bo-noot">' + h(t('Якщо зв’язок зникне, перевірте:', 'Als de verbinding wegvalt, controleer:')) + '</p><ol class="hv-stappen">' + stappen.map(function (s) { return '<li>' + h(HV.p(s)) + '</li>'; }).join('') + '</ol>' +
      knoppen(o.knop({ tekst: t('Перевірити зв’язок', 'Verbinding testen'), icoon: 'refresh-cw', actie: 'bo-verbinding', gegevens: { doel: a.id } })) });
  }

  /** Батарейка пристрою: з паспорта, а для датчиків без запису — детерміновано (макет). */
  function batterijVan(a) {
    if (a.soort === 'batterij') return a.st.waarde;
    if (a.st.batterij != null) return a.st.batterij;
    if (a.batterij != null) return a.batterij;
    if (['temperatuur', 'vocht', 'beweging', 'contact', 'lichtsterkte', 'gordijn', 'jaloezie'].indexOf(a.soort) >= 0) return 48 + (zaadVan(a.id) * 7) % 50;
    return null;
  }

  /** Рядки «Де вживається»: [icoon, naam, sub, actie, doel]. */
  function gebruik(lijst) {
    if (!lijst || !lijst.length) return '';
    return o.kaart({ titel: t('Де вживається', 'Waar gebruikt'), k: 'bo-gebruik', inhoud: '<div class="hv-rijen">' + lijst.map(function (r) {
      return o.rij({ icoon: r[0], naam: HV.p(r[1]), sub: HV.p(r[2]), actie: r[3], gegevens: r[3] === 'blad' ? { blad: r[4] } : { naar: r[4] } });
    }).join('') + '</div>' });
  }

  /** Поточна мова як нижній регістр першої літери для вставки в речення. */
  var klein = function (s) { return s.charAt(0).toLowerCase() + s.slice(1); };
  var hoofdletter = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  /**
   * Налаштування пристрою через HV.doe з власною можливістю (поріг, режим, призначення…).
   * Ядро описує невідому можливість лише як String(waarde) однією мовою; тому дію виконує HV.doe (ворота, роль, ризик,
   * Журнал), а запис Журналу ми одразу переписуємо двома мовами й показуємо власне сповіщення з «Повернути».
   * opties: { stil, zonderTerug, oud, icoon, waarom, na(a) }
   */
  function zet(a, mog, waarde, label, fmt, opties) {
    var op = opties || {};
    var oud = op.oud !== undefined ? op.oud : a.st[mog];
    return HV.doe({ doel: a.id, mogelijkheid: mog, waarde: waarde, stil: true, waarom: op.waarom }).then(function (r) {
      if (!r || !r.ok) return r;
      var werd = fmt(waarde), was = oud === undefined || oud === null ? null : fmt(oud);
      HV.staat.wijzig(function (w) {
        if (op.na) op.na(a, w);
        var regel = w.logboek.filter(function (x) { return x.doel === a.id; })[0];
        if (regel) { regel.wat = [a.naam[0] + ': ' + klein(label[0]) + ' — ' + werd[0], a.naam[1] + ': ' + klein(label[1]) + ' — ' + werd[1]]; regel.werd = werd; regel.was = was; }
      });
      if (!op.stil) {
        HV.meld({ maker: HV.mens(), icoon: op.icoon || (HV.paspoort.soorten[a.soort] || {}).icoon, titel: naamVan(a) + ': ' + klein(HV.p(label)), tekst: (was ? HV.p(was) + ' → ' : '') + HV.p(werd),
          terug: was && !op.zonderTerug ? function () { zet(a, mog, oud, label, fmt, { stil: true, zonderTerug: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); } : null });
      }
      return r;
    });
  }
  var aanUitFmt = function (v) { return v === true || v === 'true' ? ['увімкнено', 'aan'] : ['вимкнено', 'uit']; };
  var bool = function (v) { return v === true || v === 'true' || v === '1'; };

  // ───────────────────────── 2. Спільні графічні складники ─────────────────────────
  /**
   * Шкала якості з зонами й маркером значення. p: { min, max, zones:[[tot, [uk,nl], toon]], waarde, wortel, eenheid, dec, gewenst }
   */
  function schaal(p) {
    var pos = function (v) { var d = p.wortel ? (Math.sqrt(Math.max(0, v - p.min)) / Math.sqrt(p.max - p.min)) : (v - p.min) / (p.max - p.min); return klem(d * 100, 0, 100); };
    var van = p.min, zones = '', grenzen = '';
    p.zones.forEach(function (z) {
      var tot = Math.min(z[0], p.max);
      if (tot <= van) return;
      zones += '<span class="hv-bo-schaal__zone hv-bo-zone--' + z[2] + '" style="left:' + pos(van).toFixed(2) + '%;width:' + (pos(tot) - pos(van)).toFixed(2) + '%"></span>';
      if (tot < p.max) grenzen += '<span style="left:' + pos(tot).toFixed(2) + '%">' + h(HV.getal(tot)) + '</span>';
      van = tot;
    });
    var huidig = p.zones.filter(function (z) { return p.waarde < z[0]; })[0] || p.zones[p.zones.length - 1];
    return '<div class="hv-bo-schaal" data-k="bo-schaal" role="img" aria-label="' + h(t('Шкала: ', 'Schaal: ') + HV.maatTekst(p.waarde, p.eenheid, p.dec) + ' — ' + HV.p(huidig[1])) + '">' +
      '<div class="hv-bo-schaal__kop"><span class="hv-bo-schaal__woord" style="--x:' + (pos(p.waarde) / 100).toFixed(4) + '">' + h(HV.p(huidig[1])) + '</span></div>' +
      '<div class="hv-bo-schaal__baan">' + zones + '<span class="hv-bo-schaal__merk" style="left:' + pos(p.waarde).toFixed(2) + '%"></span></div>' +
      '<div class="hv-bo-schaal__as"><span class="is-begin">' + h(HV.getal(p.min)) + '</span>' + grenzen + '<span class="is-eind">' + h(HV.getal(p.max) + ' ' + p.eenheid) + '</span></div></div>';
  }

  /** Три числа в ряд: мінімум · середнє · максимум (або будь-які). getallen: [{ label, waarde (HTML), sub }] */
  function getallen(lijst) {
    return '<div class="hv-bo-getallen">' + lijst.map(function (g) { return o.getal({ maat: 'm', label: g.label, waarde: g.waarde, sub: g.sub }); }).join('') + '</div>';
  }

  /** Кільце ходу програми (SVG): deel 0–1, в центрі — HTML. */
  function ring(deel, midden, toon, aria) {
    var d = klem(deel, 0, 1) * 100;
    return '<div class="hv-bo-ring hv-toon-' + (toon || 'aan') + '" role="img" aria-label="' + h(aria || '') + '"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="hv-bo-ring__baan" cx="60" cy="60" r="52"/>' +
      '<circle class="hv-bo-ring__vulling" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="' + d.toFixed(1) + ' 100" transform="rotate(-90 60 60)"/></svg><div class="hv-bo-ring__midden">' + midden + '</div></div>';
  }

  /**
   * Лінійний графік із власним діапазоном осі Y. Ядро (HV.grafiek.lijn) з p.y змінює межі, але поділки й підписи
   * лишає від діапазону «від нуля» — вони опиняються поза полем. Тут прибираємо їх і ставимо власні в межах.
   */
  function lijn(p) {
    var html = HV.grafiek.lijn(p);
    if (!p.y || p.y.min == null || p.y.max == null) return html;
    var min = p.y.min, max = p.y.max, bereik = max - min, ruw = bereik / 3, macht = Math.pow(10, Math.floor(Math.log(ruw) / Math.LN10));
    var stap = [1, 2, 2.5, 5, 10].map(function (m) { return m * macht; }).filter(function (x) { return x >= ruw; })[0] || ruw;
    var dec = stap < 1 ? 1 : 0, Y = function (v) { return 100 - (v - min) / bereik * 100; }, labels = '', lijnen = '';
    for (var v = Math.ceil(min / stap) * stap; v <= max + 1e-9; v += stap) {
      labels += '<span class="hv-grafiek__y" style="top:' + Y(v).toFixed(1) + '%">' + HV.getal(v, dec) + '</span>';
      lijnen += '<line class="hv-grafiek__raster" x1="0" x2="100" y1="' + Y(v).toFixed(2) + '" y2="' + Y(v).toFixed(2) + '"/>';
    }
    html = html.replace(/<span class="hv-grafiek__y" style="top:[^"]*">[^<]*<\/span>/g, '').replace(/<line class="hv-grafiek__(?:raster|nul)"[^>]*\/>/g, '');
    return html.replace('<div class="hv-grafiek__as">', '<div class="hv-grafiek__as">' + labels).replace('preserveAspectRatio="none" aria-hidden="true">', 'preserveAspectRatio="none" aria-hidden="true">' + lijnen);
  }

  // ───────────────────────── 3. Датчики ─────────────────────────
  var SENSOR = {
    temperatuur: { eenheid: '°C', dec: 1, stap: 0.5, min: 10, max: 30, laag: 17, hoog: 25, amp: 0.12, icoon: 'thermometer',
      vorm: function (u) { return -0.7 * Math.cos((u - 16) / 24 * 2 * Math.PI); },
      zones: [[17, ['прохолодно', 'koel'], 'koud'], [19, ['свіжо', 'fris'], 'neutraal'], [23, ['комфортно', 'behaaglijk'], 'ok'], [26, ['тепло', 'warm'], 'warm'], [99, ['спекотно', 'heet'], 'let-op']] },
    vocht: { eenheid: '%', dec: 0, stap: 5, min: 0, max: 100, laag: 35, hoog: 70, amp: 1.6, icoon: 'droplets',
      vorm: function (u) { return 22 * Math.exp(-Math.pow((u - 7.3) / 0.6, 2)) + 16 * Math.exp(-Math.pow((u - 21.5) / 0.5, 2)); },
      zones: [[30, ['сухо', 'droog'], 'let-op'], [40, ['сухувато', 'wat droog'], 'neutraal'], [60, ['комфортно', 'behaaglijk'], 'ok'], [70, ['волого', 'vochtig'], 'neutraal'], [101, ['надто волого', 'te vochtig'], 'let-op']] },
    co2: { eenheid: 'ppm', dec: 0, stap: 100, min: 400, max: 2000, laag: null, hoog: 1200, amp: 18, basis: 450, icoon: 'cloud',
      vorm: function (u) { if (u >= 23) return 120 + (u - 23) * 90; if (u < 7) return 210 + u * 95; if (u < 9) return 875 * (1 - (u - 7) / 2) * 0.7; return 30 * Math.sin(u); },
      zones: [[800, ['свіже', 'fris'], 'ok'], [1200, ['помірно', 'matig'], 'neutraal'], [1600, ['провітріть', 'ventileren'], 'let-op'], [2001, ['задушливо', 'benauwd'], 'alarm']] },
    lichtsterkte: { eenheid: 'lux', dec: 0, stap: 10, min: 0, max: 1000, laag: 50, hoog: null, amp: 6, wortel: true, basis: 2, icoon: 'sun-dim',
      vorm: function (u) { var zon = u > 7.66 && u < 16.92 ? Math.sin(Math.PI * (u - 7.66) / 9.26) * 420 : 0; var lamp = u > 17 && u < 23 ? 110 : 0; return zon + lamp; },
      zones: [[10, ['темно', 'donker'], 'neutraal'], [50, ['сутінки', 'schemer'], 'koud'], [300, ['м’яке світло', 'zacht licht'], 'ok'], [1001, ['ясно', 'helder'], 'zon']] }
  };
  var drempel = function (a, veldNaam) { var s = SENSOR[a.soort]; var v = a.st[veldNaam]; return v != null ? v : veldNaam === 'drempelLaag' ? s.laag : s.hoog; };
  var meldAan = function (a, veldNaam) { var v = a.st[veldNaam]; return v == null ? veldNaam === 'meldHoog' : !!v; };
  var waardeNu = function (a) { return a.st.waarde; };

  /** Ряд за останню добу (крок 30 хв); останнє значення — виміряне зараз. */
  function dagReeks(a, waarde) {
    var s = SENSOR[a.soort], w = W(), z = zaadVan(a.id), n = 48, punten = [];
    var nuVorm = s.vorm(HV.uur(w.tijd));
    for (var i = 0; i <= n; i++) {
      var x = w.tijd - (n - i) * 30 * MIN;
      // температура й вологість — зсув усього ряду до виміру; освітленість і CO₂ мають «нуль» доби, тому зсув згасає в минуле
      var y = s.basis != null
        ? s.basis + s.vorm(HV.uur(x)) + (waarde - s.basis - nuVorm) * Math.exp(-(n - i) / 5) + (i === n ? 0 : golf(z, i) * s.amp)
        : waarde + (s.vorm(HV.uur(x)) - nuVorm) + (i === n ? 0 : golf(z, i) * s.amp);
      if (a.soort === 'lichtsterkte') y = Math.max(0, y);
      if (a.soort === 'vocht') y = klem(y, 20, 98);
      if (a.soort === 'co2') y = Math.max(410, y);
      punten.push([x, rond(y, s.dec)]);
    }
    return punten;
  }
  function statistiek(punten) {
    var ys = punten.map(function (p) { return p[1]; });
    return { min: Math.min.apply(null, ys), max: Math.max.apply(null, ys), gem: ys.reduce(function (x, y) { return x + y; }, 0) / ys.length };
  }
  function sensorWoord(a) {
    var s = SENSOR[a.soort], v = waardeNu(a);
    return (s.zones.filter(function (z) { return v < z[0]; })[0] || s.zones[s.zones.length - 1]);
  }

  /** Тренд за годину: стрілка й зміна. */
  function trend(a, punten) {
    var s = SENSOR[a.soort], nu = punten[punten.length - 1][1], toen = punten[punten.length - 3][1];
    var d = rond(nu - toen, s.dec), drempelT = s.dec ? 0.2 : s.stap / 2;
    var icoon = d > drempelT ? 'trending-up' : d < -drempelT ? 'trending-down' : 'move-right';
    var woord = d > drempelT ? t('росте', 'stijgt') : d < -drempelT ? t('спадає', 'daalt') : t('стабільно', 'stabiel');
    return o.chip({ icoon: icoon, tekst: woord + (Math.abs(d) > drempelT ? ' ' + (d > 0 ? '+' : '−') + HV.getal(Math.abs(d), s.dec) + ' ' + s.eenheid + t(' за годину', ' per uur') : '') });
  }

  // Що пов'язано з датчиком (рядки «Де вживається»).
  var GEBRUIK = {
    tempwoon: [['thermometer', ['Термостат вітальні', 'Thermostaat woonkamer'], ['вимір, за яким гріє тепловий насос', 'meting waarop de warmtepomp stookt'], 'blad', 'apparaat:thermostaat']],
    tempslaap: [['snowflake', ['Кондиціонер спальні', 'Airco slaapkamer'], ['вмикає охолодження вище порогу', 'start koelen boven de grens'], 'blad', 'apparaat:airco']],
    tempkinder: [['heater', ['Радіаторний клапан дитячої', 'Radiatorkraan kinderkamer'], ['вимір для клапана', 'meting voor de kraan'], 'blad', 'apparaat:radiatorkinder']],
    tempzolder: [['hard-drive', ['Мережеве сховище на горищі', 'Netwerkopslag op zolder'], ['стежить, щоб диски не перегрілися', 'bewaakt dat de schijven niet te warm worden'], 'blad', 'apparaat:nas']],
    vochtbad: [['fan', ['Правило «Ванна: витяжка після душу»', 'Regel ‘Badkamer: afzuigen na het douchen’'], ['вище порогу — вентиляція на швидкість 3', 'boven de grens — ventilatie op stand 3'], 'ga', 'automatiseringen-regels']],
    co2slaap: [['wind', ['Правило «Свіже повітря вночі»', 'Regel ‘Frisse lucht ’s nachts’'], ['вище порогу — вентиляція на швидкість 2', 'boven de grens — ventilatie op stand 2'], 'ga', 'automatiseringen-regels'], ['fan', ['Вентиляція дому', 'Ventilatie'], ['отримує команду від правила', 'krijgt de opdracht van de regel'], 'blad', 'apparaat:ventilatie']],
    luxwoon: [['sunset', ['Сцена «Вечір»', 'Scène ‘Avond’'], ['запускається, коли стає темно', 'start als het donker wordt'], 'ga', 'automatiseringen-scenes'], ['blinds', ['Штори вітальні', 'Gordijnen woonkamer'], ['зачиняються після заходу сонця', 'gaan dicht na zonsondergang'], 'blad', 'apparaat:gordijnwoon']],
    beweginghal: [['lightbulb', ['Правило «Нічне світло в передпокої»', 'Regel ‘Nachtlicht in de hal’'], ['рух уночі — світло на 2 хв', 'beweging ’s nachts — licht 2 min aan'], 'ga', 'automatiseringen-regels'], ['shield', ['Охорона: зона «Усередині»', 'Alarm: zone ‘Binnen’'], ['піднімає тривогу в режимі «Повна»', 'slaat alarm in de stand ‘Volledig’'], 'ga', 'beveiliging-stand']],
    aanwezigwerk: [['lamp-desk', ['Правило «Кабінет: світло, поки хтось є»', 'Regel ‘Werkkamer: licht zolang er iemand is’'], ['гасить настільну лампу через 5 хв тиші', 'zet de bureaulamp uit na 5 min stilte'], 'ga', 'automatiseringen-regels'], ['plug', ['Розетка стола', 'Stekker bureau'], ['вимикає монітори, коли нікого', 'zet de monitoren uit als er niemand is'], 'blad', 'apparaat:stekkerbureau']],
    raamslaap: [['snowflake', ['Кондиціонер спальні', 'Airco slaapkamer'], ['ставиться на паузу, поки вікно відчинене', 'pauzeert zolang het raam open is'], 'blad', 'apparaat:airco']],
    raamkinder: [['heater', ['Радіаторний клапан дитячої', 'Radiatorkraan kinderkamer'], ['закривається, поки вікно відчинене', 'gaat dicht zolang het raam open is'], 'blad', 'apparaat:radiatorkinder']],
    voordeurcontact: [['shield', ['Охорона: зона «Периметр»', 'Alarm: zone ‘Schil’'], ['відлік входу 30 с', 'inlooptijd 30 s'], 'ga', 'beveiliging-stand'], ['lightbulb', ['Світло в передпокої', 'Lamp in de hal'], ['вмикається, коли двері відчиняють увечері', 'gaat aan als de deur ’s avonds opengaat'], 'blad', 'apparaat:hallicht']]
  };

  function drempelRij(a, veldNaam, label) {
    var s = SENSOR[a.soort], v = drempel(a, veldNaam), aan = meldAan(a, veldNaam === 'drempelHoog' ? 'meldHoog' : 'meldLaag');
    return '<div class="hv-bo-drempel' + (aan ? '' : ' is-uit') + '" data-k="bo-' + veldNaam + '">' +
      o.schakel({ aan: aan, icoon: aan ? 'bell-ring' : 'bell-off', toon: 'neutraal', klein: true, actie: 'bo-melden', gegevens: { doel: a.id, veld: veldNaam === 'drempelHoog' ? 'meldHoog' : 'meldLaag' }, aria: label }) +
      '<span class="hv-bo-drempel__tekst"><span>' + h(label) + '</span><span class="hv-bo-drempel__sub">' + h(aan ? t('сповіщення увімкнено', 'melding aan') : t('лише в історії', 'alleen in de geschiedenis')) + '</span></span>' +
      o.stapper({ actie: 'bo-drempel', gegevens: { doel: a.id, veld: veldNaam }, stap: s.stap, label: label, waarde: HV.maat(v, s.eenheid, s.dec), k: 'bo-stap-' + veldNaam }) + '</div>';
  }

  function sensorBediening(ctx, a) {
    var s = SENSOR[a.soort], v = waardeNu(a), punten = dagReeks(a, v), st = statistiek(punten), zone = sensorWoord(a);
    var verouderd = a.beschikbaar === 'verouderd';
    var hoog = drempel(a, 'drempelHoog'), laag = drempel(a, 'drempelLaag');
    var boven = hoog != null && v > hoog, onder = laag != null && v < laag;
    var uit = kop({ teken: o.schakel({ aan: false, icoon: s.icoon, staat: verouderd ? 'verouderd' : null, aria: naamVan(a) }), woord: HV.p(zone[1]) + (verouderd ? ' · ' + HV.woord.verouderd() : ''),
      getal: HV.maat(v, s.eenheid, s.dec), sub: h(t('мін ', 'min ') + HV.getal(st.min, s.dec) + ' · ' + t('макс ', 'max ') + HV.getal(st.max, s.dec) + t(' за добу', ' dit etmaal')),
      chips: trend(a, punten) + (boven || onder ? o.chip({ icoon: 'triangle-alert', toon: 'let-op', tekst: boven ? t('вище порогу', 'boven de grens') : t('нижче порогу', 'onder de grens') }) : '') });
    uit += schaal({ min: s.min, max: s.max, zones: s.zones, waarde: klem(v, s.min, s.max), wortel: s.wortel, eenheid: s.eenheid, dec: s.dec });
    var kaarten = o.kaart({ inhoud: uit }) +
      (verouderd ? o.kaart({ klas: 'hv-kaart--onbereikbaar', inhoud: '<p class="hv-tekst">' + HV.icoon('clock', { maat: 's' }) + ' ' + h(t('Дані застаріли: останнє значення ' + HV.oud(HV.kijk.leeftijd(a)) + ' тому. Число може не відповідати дійсності.', 'Verouderde gegevens: de laatste waarde is van ' + HV.oud(HV.kijk.leeftijd(a)) + ' geleden. Het getal kan afwijken.')) + '</p>' +
        knoppen(o.knop({ tekst: t('Запитати значення', 'Waarde opvragen'), icoon: 'refresh-cw', actie: 'bo-verbinding', gegevens: { doel: a.id } })) }) : '');
    var reeksen = [{ naam: naamVan(a), toon: a.soort === 'temperatuur' ? 'warm' : a.soort === 'lichtsterkte' ? 'zon' : 'neutraal', vlak: a.soort !== 'temperatuur', punten: punten }];
    if (hoog != null) reeksen.push({ naam: t('поріг ', 'grens ') + HV.getal(hoog, s.dec), toon: 'net-uit', punten: [[punten[0][0], hoog], [punten[punten.length - 1][0], hoog]] });
    if (laag != null && a.soort !== 'vocht') reeksen.push({ naam: t('поріг ', 'grens ') + HV.getal(laag, s.dec), toon: 'koud', punten: [[punten[0][0], laag], [punten[punten.length - 1][0], laag]] });
    var w = ctx.staat;
    var yMin = Math.min(st.min, laag != null && a.soort !== 'vocht' ? laag : st.min), yMax = Math.max(st.max, hoog != null ? hoog : st.max), marge = (yMax - yMin) * 0.15 || 1;
    var yAs = a.soort === 'lichtsterkte' ? null : { min: Math.floor((yMin - marge) / s.stap) * s.stap, max: Math.ceil((yMax + marge) / s.stap) * s.stap };
    kaarten += o.kaart({ k: 'bo-grafiek', inhoud: lijn({ id: 'bo-dag-' + a.id, titel: t('Остання доба', 'Laatste etmaal'), eenheid: s.eenheid, hoogte: 140, nu: w.tijd, y: yAs,
      x: { min: punten[0][0], max: w.tijd, tikken: tikken(punten[0][0], w.tijd, 4), format: HV.tijd }, reeksen: reeksen,
      samenvatting: t('Середнє за добу ' + HV.getal(st.gem, s.dec) + ' ' + s.eenheid + '. Симульований ряд; останнє значення виміряне зараз.', 'Gemiddeld ' + HV.getal(st.gem, s.dec) + ' ' + s.eenheid + ' dit etmaal. Gesimuleerde reeks; de laatste waarde is nu gemeten.') }) });
    var rijen = (hoog != null ? drempelRij(a, 'drempelHoog', t('Сповістити, якщо вище', 'Melden als hoger dan')) : '') + (laag != null ? drempelRij(a, 'drempelLaag', a.soort === 'lichtsterkte' ? t('«Темно», якщо нижче', '‘Donker’ als lager dan') : t('Сповістити, якщо нижче', 'Melden als lager dan')) : '');
    kaarten += o.kaart({ titel: t('Пороги й сповіщення', 'Grenzen en meldingen'), k: 'bo-drempels', extra: o.gevolg(t('Що станеться: коли значення перетне поріг, дім надішле сповіщення, а правила, що спираються на цей датчик, отримають подію. Пов’язано з: «Де вживається» нижче. Як повернути: «−/+» або «Повернути» у сповіщенні.', 'Wat er gebeurt: als de waarde de grens passeert, stuurt het huis een melding en krijgen regels die op deze sensor leunen een gebeurtenis. Hangt samen met: ‘Waar gebruikt’ hieronder. Terugdraaien: ‘−/+’ of ‘Ongedaan maken’ in de melding.'), { kop: t('Пороги', 'Grenzen') }), inhoud: '<div class="hv-bo-drempels">' + rijen + '</div>' });
    kaarten += o.kaart({ titel: t('Батарея і зв’язок', 'Batterij en verbinding'), k: 'bo-voeding', inhoud: voedingInhoud(a) });
    return blad(kaarten + gebruik(GEBRUIK[a.id]) + waarom(a));
  }

  function voedingInhoud(a) {
    var bat = batterijVan(a);
    var dagen = bat != null ? Math.max(3, Math.round(bat * 4.2)) : null;
    return (bat != null ? balk({ label: t('Батарейка', 'Batterij'), icoon: bat < 15 ? 'battery-low' : 'battery-medium', waarde: bat, laag: 15, sub: bat < 15 ? t('Замініть найближчим часом.', 'Vervang binnenkort.') : t('Вистачить приблизно на ' + dagen + ' днів.', 'Gaat nog ongeveer ' + dagen + ' dagen mee.') }) : '') +
      '<div class="hv-rijen">' + o.rij({ icoon: 'signal', naam: t('Сигнал', 'Signaal'), sub: PROTOCOL[a.soort] || 'Wi-Fi', waarde: signaal(a) }) + o.rij({ icoon: 'clock', naam: t('Останній звіт', 'Laatste melding'), waarde: h(HV.oud(HV.kijk.leeftijd(a)) + t(' тому', ' geleden')) }) + '</div>';
  }

  /** Тиждень: мінімум і максимум по днях (для «Історії»). */
  function weekGrafiek(a) {
    var s = SENSOR[a.soort], w = W(), z = zaadVan(a.id), v = waardeNu(a), mins = [], maxs = [];
    var vandaag = middernacht(w.tijd);
    for (var d = 6; d >= 0; d--) {
      var x = vandaag - d * DAG + 12 * UUR, g = golf(z, d * 5);
      var basis = v + g * s.amp * 4;
      var span = a.soort === 'temperatuur' ? 1.4 : a.soort === 'vocht' ? 26 : a.soort === 'co2' ? 620 : 520;
      mins.push([x, rond(Math.max(a.soort === 'lichtsterkte' ? 0 : s.min, basis - span * (0.45 + 0.1 * Math.sin(d + z))), s.dec)]);
      maxs.push([x, rond(Math.min(s.max * 1.2, basis + span * (0.55 + 0.1 * Math.cos(d + z))), s.dec)]);
    }
    var alle = mins.concat(maxs).map(function (q) { return q[1]; }), lo = Math.min.apply(null, alle), hi = Math.max.apply(null, alle), m = (hi - lo) * 0.12 || 1;
    return lijn({ y: a.soort === 'lichtsterkte' ? null : { min: Math.floor(lo - m), max: Math.ceil(hi + m) }, id: 'bo-week-' + a.id, titel: t('Тиждень: межі доби', 'Week: grenzen per dag'), eenheid: s.eenheid, hoogte: 130,
      x: { min: mins[0][0], max: mins[6][0], tikken: mins.map(function (p) { return { x: p[0], label: dagLabel(p[0]) }; }), format: dagLabel },
      reeksen: [{ naam: t('максимум', 'maximum'), toon: 'warm', punten: maxs }, { naam: t('мінімум', 'minimum'), toon: 'koud', punten: mins }],
      samenvatting: t('Найвище й найнижче значення кожної доби за сім днів (симуляція).', 'Hoogste en laagste waarde per dag over zeven dagen (simulatie).') });
  }

  // ── Рух і присутність: події доби ──
  /** Події руху за останню добу (час), детерміновано з розкладу присутності в паспорті. */
  function bewegingen(a) {
    var w = W(), z = zaadVan(a.id), van = w.tijd - DAG, uit = [];
    var aanwezig = HV.paspoort.dag.aanwezig;
    var laatst = a.st.actief ? w.tijd : w.tijd - (a.st.laatst || 0) * MIN;
    for (var x = van, i = 0; x < laatst - 2 * MIN; i++) {
      var u = HV.uur(x), thuis = aanwezig.some(function (r) { return u >= r[0] && u < r[1]; }), nacht = u < 6.3 || u > 23.2;
      var stap = thuis ? (nacht ? 95 : 14 + Math.abs(golf(z, i)) * 26) : 240;
      if (thuis && (!nacht || i % 3 === 0)) uit.push(x);
      x += stap * MIN;
    }
    uit.push(laatst);
    return uit.filter(function (x) { return x >= van && x <= w.tijd; });
  }
  function bewegingBlok(ctx, a) {
    var w = ctx.staat, gebeurd = bewegingen(a), van = w.tijd - DAG, vandaag = middernacht(w.tijd);
    var perUur = {}; gebeurd.forEach(function (x) { var k = Math.floor((x - van) / UUR); perUur[k] = (perUur[k] || 0) + 1; });
    var stukken = Object.keys(perUur).map(function (k) { var b = van + Number(k) * UUR; return { van: b, tot: Math.min(w.tijd, b + UUR), toon: 'aan', klas: perUur[k] > 2 ? 'is-druk' : '', label: perUur[k] + ' ' + t('спрац.', 'keer') }; });
    var stilste = 0; for (var i = 1; i < gebeurd.length; i++) stilste = Math.max(stilste, gebeurd[i] - gebeurd[i - 1]);
    var nVandaag = gebeurd.filter(function (x) { return x >= vandaag; }).length;
    var grafiek = HV.grafiek.toestanden({ id: 'bo-rust-' + a.id, titel: t('Активність за добу', 'Activiteit dit etmaal'), van: van, tot: w.tijd, nu: w.tijd, tikken: tikken(van, w.tijd, 4), format: HV.tijd,
      banen: [{ naam: t('Рух', 'Beweging'), stukken: stukken }], samenvatting: t('Темніші години — частіші спрацювання. Симульовано з розкладу присутності.', 'Donkerdere uren — vaker beweging. Gesimuleerd uit het aanwezigheidsrooster.') });
    return { grafiek: grafiek, n: nVandaag, stilste: stilste };
  }

  function bewegingBediening(ctx, a) {
    var blok = bewegingBlok(ctx, a), veilig = veiligBlad();
    var actief = !!a.st.actief;
    var eigen = kop({ teken: o.schakel({ aan: actief, icoon: 'radar', toon: 'aan', aria: naamVan(a) }), woord: actief ? t('Рух зараз', 'Beweging nu') : t('Тихо', 'Stil'),
      getal: actief ? '' : h(HV.duur(a.st.laatst || 0)), sub: h(actief ? t('датчик бачить рух у ' + HV.p(HV.staat.kamer(a.kamer).waar), 'de sensor ziet beweging ' + HV.p(HV.staat.kamer(a.kamer).waar)) : t('від останнього руху', 'sinds de laatste beweging')),
      chips: o.chip({ icoon: 'activity', tekst: blok.n + ' ' + t('спрацювань сьогодні', 'keer vandaag') }) });
    var top = veilig ? veilig.delen.bediening(ctx, a) : o.kaart({ inhoud: eigen });
    var gevoelig = a.st.gevoeligheid || 'midden', vertraging = String(a.st.vertraging || 60);
    return blad(top + (veilig ? o.kaart({ inhoud: eigen }) : '') + o.kaart({ k: 'bo-activiteit', inhoud: blok.grafiek + getallen([
      { label: t('Сьогодні', 'Vandaag'), waarde: h(String(blok.n)), sub: h(t('спрацювань', 'meldingen')) },
      { label: t('Найдовша тиша', 'Langste stilte'), waarde: h(HV.duur(blok.stilste / MIN)) },
      { label: t('Скидання', 'Terugval'), waarde: h(Number(vertraging) >= 60 ? HV.duur(Number(vertraging) / 60) : vertraging + ' ' + t('с', 's')) }]) }) +
      o.kaart({ titel: t('Як реагує', 'Hoe hij reageert'), k: 'bo-gevoelig', extra: o.gevolg(t('Що станеться: вища чутливість ловить дрібні рухи, але й домашніх тварин; довша затримка довше тримає світло. Пов’язано з: правила й охорона, що слухають цей датчик. Як повернути: оберіть попереднє значення.', 'Wat er gebeurt: een hogere gevoeligheid ziet kleine bewegingen, maar ook huisdieren; een langere terugval houdt het licht langer aan. Hangt samen met: regels en het alarm die naar deze sensor luisteren. Terugdraaien: kies de vorige waarde.'), { kop: t('Чутливість', 'Gevoeligheid') }), inhoud:
        veld(t('Чутливість', 'Gevoeligheid'), o.segment({ label: t('Чутливість', 'Gevoeligheid'), waarde: gevoelig, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'gevoeligheid' }, opties: [{ id: 'laag', label: t('Низька', 'Laag') }, { id: 'midden', label: t('Середня', 'Midden') }, { id: 'hoog', label: t('Висока', 'Hoog') }] })) +
        veld(t('Затримка скидання', 'Terugvaltijd'), o.segment({ label: t('Затримка скидання', 'Terugvaltijd'), waarde: vertraging, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'vertraging' }, opties: [{ id: '30', label: '30 ' + t('с', 's') }, { id: '60', label: '1 ' + t('хв', 'min') }, { id: '180', label: '3 ' + t('хв', 'min') }] })) +
        knoppen(o.knop({ tekst: t('Режим перевірки', 'Testmodus'), icoon: 'scan-eye', actie: 'bo-sensortest', gegevens: { doel: a.id } })) }) +
      (veilig ? '' : o.kaart({ titel: t('Батарея і зв’язок', 'Batterij en verbinding'), inhoud: voedingInhoud(a) })) + gebruik(GEBRUIK[a.id]) + waarom(a));
  }

  /** Інтервали зайнятості кабінету сьогодні (з розкладу Олени в паспорті). */
  function bezetting(a) {
    var w = W(), vandaag = middernacht(w.tijd), uit = [];
    var blokken = [[9.42, 12.17], [12.83, 24]];
    blokken.forEach(function (b) {
      var van = vandaag + b[0] * UUR, tot = b[1] < 24 ? Math.min(w.tijd, vandaag + b[1] * UUR) : (a.st.actief ? w.tijd : w.tijd - (Number(a.st.timeout) || 5) * MIN);
      if (tot > van && van < w.tijd) uit.push([van, tot]);
    });
    return uit;
  }
  function aanwezigBediening(ctx, a) {
    var w = ctx.staat, actief = !!a.st.actief, vandaag = middernacht(w.tijd);
    var blokken = bezetting(a), totaal = blokken.reduce(function (s, b) { return s + (b[1] - b[0]); }, 0);
    var sinds = actief && blokken.length ? blokken[blokken.length - 1][0] : null;
    var timeout = String(a.st.timeout || 5), gevoelig = a.st.gevoeligheid || 'midden';
    var zones = [['bureau', ['Стіл', 'Bureau']], ['fauteuil', ['Крісло', 'Fauteuil']], ['deur', ['Біля дверей', 'Bij de deur']]];
    var zoneNu = actief ? 'bureau' : null;
    var uit = kop({ teken: o.schakel({ aan: actief, icoon: 'person-standing', toon: 'aan', aria: naamVan(a) }), woord: actief ? t('Хтось є', 'Iemand aanwezig') : t('Нікого', 'Niemand'),
      getal: sinds ? h(HV.duur((w.tijd - sinds) / MIN)) : '', sub: h(sinds ? t('без перерви з ', 'onafgebroken sinds ') + HV.tijd(sinds) : t('кімната порожня', 'de kamer is leeg')),
      chips: zones.map(function (z) { return o.chip({ icoon: z[0] === zoneNu ? 'map-pin' : null, toon: z[0] === zoneNu ? 'aan' : null, tekst: HV.p(z[1]) }); }).join('') });
    var grafiek = HV.grafiek.toestanden({ id: 'bo-bezet-' + a.id, titel: t('Зайнятість сьогодні', 'Bezetting vandaag'), van: vandaag, tot: w.tijd, nu: w.tijd, tikken: tikken(vandaag, w.tijd, 4), format: HV.tijd,
      banen: [{ naam: HV.p(HV.staat.kamer(a.kamer).naam), stukken: blokken.map(function (b) { return { van: b[0], tot: b[1], toon: 'aan', label: HV.tijd(b[0]) + '–' + HV.tijd(b[1]) }; }) }],
      samenvatting: t('Разом ' + HV.duur(totaal / MIN) + ' присутності сьогодні. Датчик бачить і нерухому людину.', 'Samen ' + HV.duur(totaal / MIN) + ' aanwezig vandaag. De sensor ziet ook iemand die stilzit.') });
    return blad(o.kaart({ inhoud: uit }) + o.kaart({ k: 'bo-bezet', inhoud: grafiek }) +
      o.kaart({ titel: t('Як визначає присутність', 'Hoe hij aanwezigheid bepaalt'), k: 'bo-aanwezig-inst', extra: o.gevolg(t('Що станеться: «Нікого через» — скільки тиші потрібно, щоб кімната стала порожньою; від цього залежить, коли згасне світло. Пов’язано з: правило «Кабінет: світло, поки хтось є». Як повернути: оберіть попереднє значення.', 'Wat er gebeurt: ‘Niemand na’ — hoeveel stilte nodig is voordat de kamer leeg is; daarvan hangt af wanneer het licht uitgaat. Hangt samen met: regel ‘Werkkamer: licht zolang er iemand is’. Terugdraaien: kies de vorige waarde.'), { kop: t('Присутність', 'Aanwezigheid') }), inhoud:
        veld(t('Нікого через', 'Niemand na'), o.segment({ label: t('Нікого через', 'Niemand na'), waarde: timeout, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'timeout' }, opties: [{ id: '1', label: '1 ' + t('хв', 'min') }, { id: '5', label: '5 ' + t('хв', 'min') }, { id: '15', label: '15 ' + t('хв', 'min') }] })) +
        veld(t('Чутливість', 'Gevoeligheid'), o.segment({ label: t('Чутливість', 'Gevoeligheid'), waarde: gevoelig, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'gevoeligheid' }, opties: [{ id: 'laag', label: t('Низька', 'Laag') }, { id: 'midden', label: t('Середня', 'Midden') }, { id: 'hoog', label: t('Висока', 'Hoog') }] })) +
        knoppen(o.knop({ tekst: t('Режим перевірки', 'Testmodus'), icoon: 'scan-eye', actie: 'bo-sensortest', gegevens: { doel: a.id } })) }) +
      o.kaart({ titel: t('Живлення і зв’язок', 'Voeding en verbinding'), inhoud: '<div class="hv-rijen">' + o.rij({ icoon: 'plug', naam: t('Живлення', 'Voeding'), waarde: h(t('кабель, 5 В', 'kabel, 5 V')) }) + o.rij({ icoon: 'signal', naam: t('Сигнал', 'Signaal'), sub: 'Thread', waarde: signaal(a) }) + '</div>' }) +
      gebruik(GEBRUIK[a.id]) + waarom(a));
  }

  // ── Датчик відкриття ──
  /** Відкриття за добу: [van, tot] (з дверей розкладу паспорта або провітрювання вікна). */
  function openingen(a) {
    var w = W(), vandaag = middernacht(w.tijd), uit = [];
    if (a.deur) HV.paspoort.dag.deuren.forEach(function (u) { var x = vandaag + u * UUR; if (x < w.tijd) uit.push([x, x + (0.6 + (u * 7 % 3) * 0.4) * MIN]); });
    else { [[7.15, 7.42], [12.9, 13.05]].forEach(function (b) { var x = vandaag + b[0] * UUR; if (x < w.tijd) uit.push([x, Math.min(w.tijd, vandaag + b[1] * UUR)]); }); }
    if (a.st.open) uit.push([a.st.sinds || w.tijd - 4 * MIN, w.tijd]);
    return uit;
  }
  function contactBediening(ctx, a) {
    var w = ctx.staat, veilig = veiligBlad(), vandaag = middernacht(w.tijd), lijst = openingen(a);
    var totaal = lijst.reduce(function (s, b) { return s + (b[1] - b[0]); }, 0);
    var teLang = String(a.st.teLang || (a.deur ? 5 : 30));
    var eigen = !veilig ? kop({ teken: o.schakel({ aan: !!a.st.open, icoon: a.st.open ? 'door-open' : 'door-closed', aria: naamVan(a) }), woord: a.st.open ? HV.woord.open() : HV.woord.dicht(), sub: h(lijst.length + ' ' + t('відкриттів сьогодні', 'keer geopend vandaag')) }) : '';
    var grafiek = HV.grafiek.toestanden({ id: 'bo-open-' + a.id, titel: t('Відчинено сьогодні', 'Open vandaag'), van: vandaag, tot: w.tijd, nu: w.tijd, tikken: tikken(vandaag, w.tijd, 4), format: HV.tijd,
      banen: [{ naam: naamVan(a), stukken: lijst.map(function (b) { return { van: b[0], tot: b[1], toon: 'let-op', label: HV.tijd(b[0]) + '–' + HV.tijd(b[1]) }; }) }],
      samenvatting: t(lijst.length + ' разів, разом ' + HV.duur(totaal / MIN) + '.', lijst.length + ' keer, samen ' + HV.duur(totaal / MIN) + '.') });
    return blad((veilig ? veilig.delen.bediening(ctx, a) : o.kaart({ inhoud: eigen })) +
      o.kaart({ k: 'bo-openingen', inhoud: grafiek + getallen([{ label: t('Відкриттів', 'Keer open'), waarde: h(String(lijst.length)) }, { label: t('Разом', 'Samen'), waarde: h(HV.duur(totaal / MIN)) }, { label: t('Востаннє', 'Laatst'), waarde: h(lijst.length ? HV.tijd(lijst[lijst.length - 1][0]) : '—') }]) }) +
      o.kaart({ titel: t('Нагадування', 'Herinnering'), k: 'bo-telang', extra: o.gevolg(t('Що станеться: якщо ' + (a.raam ? 'вікно' : 'двері') + ' лишаться відчиненими довше, дім надішле сповіщення дорослим. Пов’язано з: опалення в кімнаті ставиться на паузу. Як повернути: оберіть «Вимк.».', 'Wat er gebeurt: blijft ' + (a.raam ? 'het raam' : 'de deur') + ' langer open, dan stuurt het huis een melding aan de volwassenen. Hangt samen met: de verwarming in de kamer pauzeert. Terugdraaien: kies ‘Uit’.'), { kop: t('Нагадування', 'Herinnering') }), inhoud:
        veld(t('Сповістити, якщо відчинено довше', 'Melden als langer open dan'), o.segment({ label: t('Сповістити, якщо відчинено довше', 'Melden als langer open dan'), waarde: teLang, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'teLang' }, opties: [{ id: '0', label: t('Вимк.', 'Uit') }, { id: '5', label: '5 ' + t('хв', 'min') }, { id: '30', label: '30 ' + t('хв', 'min') }, { id: '60', label: '1 ' + t('год', 'u') }] })) }) +
      (veilig ? '' : o.kaart({ titel: t('Батарея і зв’язок', 'Batterij en verbinding'), inhoud: voedingInhoud(a) })) + gebruik(GEBRUIK[a.id]) + waarom(a));
  }
  /** Аркуш «Безпеки» для датчиків відкриття й руху (зона «Безпека»), якщо його зареєстровано. */
  function veiligBlad() { for (var i = 0; i < HV.bladen.length; i++) if (HV.bladen[i].soort === 'veiligsensor' && HV.bladen[i].delen && HV.bladen[i].delen.bediening) return HV.bladen[i]; return null; }

  // ── Батарейка як окремий датчик ──
  function batterijBediening(ctx, a) {
    var w = ctx.staat, v = a.st.waarde, laag = v < 15;
    var dagen = Math.max(1, Math.round(v * 0.75));
    var punten = [], van = w.tijd - 90 * DAG;
    for (var i = 0; i <= 30; i++) { var x = van + i * 3 * DAG, d = i / 30; punten.push([x, rond(i === 30 ? v : 100 - (100 - v) * (0.55 * d + 0.45 * Math.pow(d, 3)) + golf(7, i) * 0.6, 0)]); }
    var bron = A('raamkinder');
    var uit = kop({ teken: o.schakel({ aan: laag, icoon: laag ? 'battery-low' : 'battery-medium', toon: laag ? 'let-op' : null, aria: naamVan(a) }), woord: laag ? t('Замініть батарейку', 'Vervang de batterij') : t('У нормі', 'In orde'),
      getal: HV.maat(v, '%'), sub: h(t('≈ ' + dagen + ' днів до розряду', '≈ ' + dagen + ' dagen tot leeg')), chips: o.chip({ icoon: 'zap', tekst: t('літієва таблетка 3 В', 'lithium-knoopcel 3 V') }) });
    uit += balk({ label: t('Заряд', 'Lading'), waarde: v, laag: 15, sub: t('Нижче 15 % датчик може пропускати відкриття вікна.', 'Onder 15 % kan de sensor het openen van het raam missen.') });
    return blad(o.kaart({ inhoud: uit }) +
      o.kaart({ k: 'bo-ontlading', inhoud: HV.grafiek.lijn({ id: 'bo-ontlading-' + a.id, titel: t('Розряд за 90 днів', 'Ontlading in 90 dagen'), eenheid: '%', hoogte: 130, y: { min: 0, max: 100 }, x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 3, dagLabel), format: dagLabel },
        reeksen: [{ naam: t('заряд', 'lading'), toon: 'batterij', vlak: true, punten: punten }], samenvatting: t('Наприкінці розряд прискорюється — типово для літієвих батарейок.', 'Aan het eind gaat het sneller — normaal voor lithiumcellen.') }) }) +
      o.kaart({ titel: t('Заміна', 'Vervangen'), k: 'bo-vervang', extra: o.gevolg(t('Що станеться: дім запише заміну в Журнал, обнулить прогноз і прибере нагадування з «Обслуговування». Пов’язано з: датчик вікна в дитячій. Як повернути: «Повернути» у сповіщенні.', 'Wat er gebeurt: het huis zet de vervanging in het logboek, zet de voorspelling terug en haalt de herinnering uit ‘Onderhoud’. Hangt samen met: de raamsensor in de kinderkamer. Terugdraaien: ‘Ongedaan maken’ in de melding.'), { kop: t('Заміна', 'Vervangen') }), inhoud:
        '<ol class="hv-stappen"><li>' + h(t('Зніміть кришку датчика монетою.', 'Open het deksel van de sensor met een munt.')) + '</li><li>' + h(t('Вставте нову батарейку плюсом догори.', 'Plaats de nieuwe batterij met de plus boven.')) + '</li><li>' + h(t('Натисніть «Батарейку замінено».', 'Tik op ‘Batterij vervangen’.')) + '</li></ol>' +
        knoppen(o.knop({ tekst: t('Батарейку замінено', 'Batterij vervangen'), icoon: 'battery-full', soort: 'hoofd', actie: 'bo-batterij', gegevens: { doel: a.id } }) + (bron ? o.knop({ tekst: HV.p(bron.naam) + ' · ' + HV.p(HV.staat.kamer(bron.kamer).naam), icoon: 'door-closed', soort: 'stil', actie: 'blad', gegevens: { blad: 'apparaat:' + bron.id } }) : '')) }) +
      waarom(a));
  }

  // ───────────────────────── 4. Штори й жалюзі ─────────────────────────
  /** Положення для малюнка: під час ходу — спостережений відсоток, інакше — стан. */
  function zichtbarePositie(a, mog) {
    if (a.wacht && a.wacht.mogelijkheid === mog && a.wacht.fase === 'bezig' && a.wacht.voortgang != null) return a.wacht.voortgang;
    return Number(a.st[mog]) || 0;
  }
  /** Вікно зі шторами: дві половини полотна з’їжджаються до центру. */
  function gordijnBeeld(a) {
    var p = zichtbarePositie(a, 'positie'), doel = a.wacht && a.wacht.mogelijkheid === 'positie' ? Number(a.wacht.waarde) : null;
    var breed = function (pos) { return 8 + (1 - pos / 100) * 84; };
    var b = breed(p), plooien = function (x0, x1) { var s = ''; for (var x = x0 + 5; x < x1 - 2; x += 7) s += '<path class="hv-bo-raam__plooi" d="M' + x.toFixed(1) + ' 16 V 112"/>'; return s; };
    var dag = isDag(W().tijd);
    return '<svg class="hv-bo-raam' + (dag ? '' : ' is-nacht') + '" viewBox="0 0 200 124" role="img" aria-label="' + h(t('Штори: відчинено на ', 'Gordijnen: open op ') + Math.round(p) + ' %') + '">' +
      '<rect class="hv-bo-raam__glas" x="12" y="14" width="176" height="100" rx="3"/>' + (dag ? '<circle class="hv-bo-raam__zon" cx="150" cy="40" r="11"/>' : '<circle class="hv-bo-raam__maan" cx="150" cy="38" r="8"/>') +
      '<path class="hv-bo-raam__kozijn" d="M100 14 V114 M12 64 H188"/><rect class="hv-bo-raam__lijst" x="12" y="14" width="176" height="100" rx="3"/>' +
      '<path class="hv-bo-raam__roede" d="M4 10 H196"/>' +
      '<rect class="hv-bo-raam__doek" x="8" y="12" width="' + b.toFixed(1) + '" height="104" rx="2"/>' + plooien(8, 8 + b) +
      '<rect class="hv-bo-raam__doek" x="' + (192 - b).toFixed(1) + '" y="12" width="' + b.toFixed(1) + '" height="104" rx="2"/>' + plooien(192 - b, 192) +
      (doel != null ? '<path class="hv-bo-raam__doel" d="M' + (8 + breed(doel)).toFixed(1) + ' 8 V120 M' + (192 - breed(doel)).toFixed(1) + ' 8 V120"/>' : '') + '</svg>';
  }
  /** Вікно з жалюзі: полотно опускається згори, ламелі товщають, коли закриті. */
  function jaloezieBeeld(a) {
    var p = zichtbarePositie(a, 'positie'), k = zichtbarePositie(a, 'kantel');
    var dag = isDag(W().tijd), onder = 14 + (1 - p / 100) * 100, lamellen = '';
    var dik = 1.2 + 4.6 * (1 - k / 100);
    for (var y = 18; y < onder - 2; y += 7) lamellen += '<rect class="hv-bo-raam__lamel" x="14" y="' + y.toFixed(1) + '" width="172" height="' + dik.toFixed(1) + '" rx="0.8"/>';
    return '<svg class="hv-bo-raam' + (dag ? '' : ' is-nacht') + '" viewBox="0 0 200 124" role="img" aria-label="' + h(t('Жалюзі: відчинено на ', 'Jaloezie: open op ') + Math.round(p) + ' %, ' + t('нахил ', 'kanteling ') + Math.round(k) + ' %') + '">' +
      '<rect class="hv-bo-raam__glas" x="12" y="14" width="176" height="100" rx="3"/>' + (dag ? '<circle class="hv-bo-raam__zon" cx="150" cy="86" r="11"/>' : '<circle class="hv-bo-raam__maan" cx="150" cy="86" r="8"/>') +
      '<path class="hv-bo-raam__kozijn" d="M100 14 V114"/>' + lamellen +
      '<rect class="hv-bo-raam__rail" x="12" y="' + (onder - 2).toFixed(1) + '" width="176" height="4" rx="1"/><rect class="hv-bo-raam__kast" x="8" y="6" width="184" height="10" rx="2"/>' +
      '<rect class="hv-bo-raam__lijst" x="12" y="14" width="176" height="100" rx="3"/></svg>';
  }

  var GORDIJN_STANDEN = [[0, ['Зачинено', 'Dicht']], [30, ['Приватно', 'Privé']], [60, ['Наполовину', 'Half']], [100, ['Відчинено', 'Open']]];
  var KANTEL_STANDEN = [[0, ['Закрито', 'Dicht']], [35, ['Розсіяне', 'Diffuus']], [70, ['Світло', 'Licht']], [100, ['Відкрито', 'Open']]];

  function zonweringBediening(ctx, a) {
    var jal = a.soort === 'jaloezie', st = a.st, bezig = a.wacht && a.wacht.fase === 'bezig';
    var pos = Math.round(zichtbarePositie(a, 'positie')), doel = gewenst(a, 'positie');
    var woord = bezig ? (a.wacht.mogelijkheid === 'kantel' ? t('повертає ламелі', 'kantelt de lamellen') : Number(a.wacht.waarde) >= Number(st.positie) ? t('відчиняється', 'gaat open') : t('зачиняється', 'gaat dicht')) : a.wacht ? HV.woord.wacht() : pos === 0 ? HV.woord.dicht() : pos === 100 ? HV.woord.open() : t('відчинено на', 'open op');
    var beeld = '<div class="hv-bo-beeld" data-k="bo-beeld">' + (jal ? jaloezieBeeld(a) : gordijnBeeld(a)) + '</div>';
    var uit = kop({ teken: o.schakel({ aan: pos > 0, icoon: 'blinds', toon: 'neutraal', staat: bezig ? 'bezig' : a.wacht ? 'wacht' : null, aria: naamVan(a) }), woord: (pos > 0 && pos < 100) || bezig || a.wacht ? woord : t('Зараз', 'Nu'), getal: pos > 0 && pos < 100 || bezig ? HV.maat(pos, '%') : '', groot: hoofdletter(woord),
      sub: h(bezig ? t('ціль ', 'doel ') + Math.round(Number(a.wacht.waarde)) + ' %' : jal ? t('нахил ламелей ', 'kanteling ') + Math.round(Number(st.kantel) || 0) + ' %' : t('полотно ', 'doek ') + (pos === 100 ? t('зібрано біля стін', 'opzij geschoven') : pos === 0 ? t('закриває вікно', 'dekt het raam af') : t('частково', 'gedeeltelijk'))) });
    uit += beeld;
    // ▲ ■ ▼ — три рівні дії; «Стоп» активний лише під час ходу
    uit += '<div class="hv-bo-trio" data-k="bo-trio">' +
      o.knop({ tekst: t('Відчинити', 'Openen'), icoon: 'chevrons-up', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'positie', waarde: 100 }, gedrukt: !a.wacht && pos === 100 }) +
      o.knop({ tekst: t('Стоп', 'Stop'), icoon: 'square', actie: 'bo-stop', gegevens: { doel: a.id }, uit: !bezig, aria: t('Зупинити полотно', 'Doek stoppen') }) +
      o.knop({ tekst: t('Зачинити', 'Sluiten'), icoon: 'chevrons-down', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'positie', waarde: 0 }, gedrukt: !a.wacht && pos === 0 }) + '</div>';
    uit += veld(t('Положення', 'Positie'), o.schuif({ label: t('Положення', 'Positie'), waarde: Number(doel) || 0, min: 0, max: 100, stap: 5, toon: 'neutraal', actie: 'schuif-doe', gegevens: { doel: a.id, mogelijkheid: 'positie' }, gewenst: a.wacht && a.wacht.mogelijkheid === 'positie' ? Number(st.positie) : null }) +
      o.segment({ label: t('Заготовки положення', 'Voorkeuzes voor de positie'), waarde: (GORDIJN_STANDEN.filter(function (x) { return x[0] === Number(doel); })[0] || [null])[0], actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'positie' }, klas: 'hv-segment--vier', k: 'bo-pos-seg', opties: GORDIJN_STANDEN.map(function (x) { return { id: x[0], label: HV.p(x[1]) }; }) }));
    if (jal) {
      var kd = gewenst(a, 'kantel');
      uit += veld(t('Нахил ламелей', 'Kanteling van de lamellen'), o.schuif({ label: t('Нахил ламелей', 'Kanteling'), waarde: Number(kd) || 0, min: 0, max: 100, stap: 5, toon: 'neutraal', actie: 'schuif-doe', gegevens: { doel: a.id, mogelijkheid: 'kantel' }, gewenst: a.wacht && a.wacht.mogelijkheid === 'kantel' ? Number(st.kantel) : null }) +
        o.segment({ label: t('Заготовки нахилу', 'Voorkeuzes voor de kanteling'), waarde: (KANTEL_STANDEN.filter(function (x) { return x[0] === Number(kd); })[0] || [null])[0], actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'kantel' }, klas: 'hv-segment--vier', k: 'bo-kantel-seg', opties: KANTEL_STANDEN.map(function (x) { return { id: x[0], label: HV.p(x[1]) }; }) }));
    }
    var auto = st.automatisch == null ? true : bool(st.automatisch);
    var lux = A('luxwoon');
    var autoKaart = o.kaart({ titel: t('Сам по собі', 'Vanzelf'), k: 'bo-zon', extra: o.gevolg(t('Що станеться: ' + (jal ? 'жалюзі' : 'штори') + ' зачиняться самі після заходу сонця й відчиняться о 07:30, якщо хтось удома. Пов’язано з: датчик освітленості вітальні, режим «Відпустка». Як повернути: вимкніть перемикач.', 'Wat er gebeurt: ' + (jal ? 'de jaloezie gaat' : 'de gordijnen gaan') + ' zelf dicht na zonsondergang en om 07:30 open als er iemand thuis is. Hangt samen met: de lichtsensor in de woonkamer, de stand ‘Vakantie’. Terugdraaien: zet de schakelaar uit.'), { kop: t('Сам по собі', 'Vanzelf') }), inhoud:
      '<div class="hv-bo-schakelrij">' + o.schakel({ aan: auto, icoon: 'sunset', toon: 'neutraal', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'automatisch', standaard: 'true' }, aria: t('За сонцем', 'Op de zon') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(t('За сонцем', 'Op de zon')) + '</span><span>' + h(auto ? t('зачинити після заходу, відчинити о 07:30', 'dicht na zonsondergang, open om 07:30') : t('лише вручну й сценами', 'alleen met de hand en met scènes')) + '</span></span></div>' +
      (lux ? '<p class="hv-bo-noot">' + HV.icoon('sun-dim', { maat: 's' }) + h(t(' Зараз надворі ', ' Nu buiten ') + HV.getal(lux.st.waarde) + ' lux · ' + t('захід о 16:55', 'zonsondergang 16:55')) + '</p>' : '') });
    return blad(o.kaart({ inhoud: uit }) + autoKaart + waarom(a) + knoppen(o.knop({ tekst: t('Калібрувати хід', 'Looproute kalibreren'), icoon: 'ruler', soort: 'stil', actie: 'bo-kalibreer', gegevens: { doel: a.id } })));
  }
  function zonweringGeschiedenis(ctx, a) {
    var w = ctx.staat, van = w.tijd - DAG, z = zaadVan(a.id), punten = [];
    var vorm = function (x) { var u = HV.uur(x); return u >= 7.5 && u < 16.95 ? 100 : 0; };
    for (var i = 0; i <= 48; i++) { var x = van + i * 30 * MIN; punten.push([x, i === 48 ? Number(a.st.positie) || 0 : (a.soort === 'jaloezie' && vorm(x) ? 40 + (z % 3) * 10 : vorm(x))]); }
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.lijn({ id: 'bo-pos-' + a.id, titel: t('Положення за добу', 'Positie dit etmaal'), eenheid: '%', hoogte: 120, y: { min: 0, max: 100 }, nu: w.tijd,
      x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 4), format: HV.tijd }, reeksen: [{ naam: t('відчинено', 'open'), toon: 'neutraal', vlak: true, punten: punten }],
      samenvatting: t('Відчиняються зранку, зачиняються після заходу сонця (симуляція).', 'Gaan ’s ochtends open en na zonsondergang dicht (simulatie).') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  // ───────────────────────── 5. Гаражні й вхідні ворота ─────────────────────────
  /** Частка відчинення 0–1 для малюнка (під час ходу — за спостереженим поступом). */
  function openDeel(a) {
    if (a.wacht && a.wacht.mogelijkheid === 'open' && a.wacht.fase === 'bezig' && a.wacht.voortgang != null) { var f = a.wacht.voortgang / 100; return a.wacht.waarde ? f : 1 - f; }
    if (a.st.deels != null && a.st.open) return a.st.deels / 100;
    return a.st.open ? 1 : 0;
  }
  function garageBeeld(a) {
    var f = openDeel(a), hoog = 84 * (1 - f), panelen = '';
    for (var y = 40; y < 40 + hoog - 1; y += 21) panelen += '<rect class="hv-bo-deur__paneel" x="38" y="' + y.toFixed(1) + '" width="124" height="' + Math.min(20, 40 + hoog - y).toFixed(1) + '" rx="1.5"/>';
    return '<svg class="hv-bo-deur" viewBox="0 0 200 136" role="img" aria-label="' + h(t('Гаражні ворота: відчинено на ', 'Garagedeur: open op ') + Math.round(f * 100) + ' %') + '">' +
      '<path class="hv-bo-deur__huis" d="M14 128 V40 L100 8 L186 40 V128"/><rect class="hv-bo-deur__opening" x="36" y="38" width="128" height="88" rx="2"/>' +
      '<path class="hv-bo-deur__auto" d="M58 118 h84 v-12 l-10 -12 h-52 l-12 12 z"/><circle class="hv-bo-deur__wiel" cx="74" cy="119" r="6"/><circle class="hv-bo-deur__wiel" cx="126" cy="119" r="6"/>' +
      panelen + '<path class="hv-bo-deur__grond" d="M4 128 H196"/></svg>';
  }
  function poortBeeld(a) {
    var f = openDeel(a), x0 = 22 + f * 150, spijlen = '';
    for (var x = x0 + 6; x < x0 + 154; x += 11) spijlen += '<path class="hv-bo-deur__spijl" d="M' + x.toFixed(1) + ' 46 V102"/>';
    return '<svg class="hv-bo-deur" viewBox="0 0 260 124" role="img" aria-label="' + h(t('Вхідні ворота: відчинено на ', 'Toegangspoort: open op ') + Math.round(f * 100) + ' %') + '">' +
      '<defs><clipPath id="bo-poort-clip"><rect x="22" y="30" width="236" height="90"/></clipPath></defs>' +
      '<path class="hv-bo-deur__pad" d="M60 120 L84 102 H116 L140 120 Z"/>' +
      '<g clip-path="url(#bo-poort-clip)"><rect class="hv-bo-deur__poort" x="' + x0.toFixed(1) + '" y="42" width="156" height="64" rx="2"/>' + spijlen + '</g>' +
      '<rect class="hv-bo-deur__paal" x="12" y="30" width="10" height="80" rx="2"/><rect class="hv-bo-deur__paal" x="178" y="30" width="10" height="80" rx="2"/>' +
      '<circle class="hv-bo-deur__foto" cx="17" cy="92" r="2.4"/><circle class="hv-bo-deur__foto" cx="183" cy="92" r="2.4"/><path class="hv-bo-deur__grond" d="M2 110 H258"/><path class="hv-bo-deur__rail" d="M22 106 H256"/></svg>';
  }

  /** Рядок «дія · рівень · наслідок» (для воріт, де рівень залежить від напряму). */
  function niveauRij(naam, sub, niveau, gevolg) {
    return '<div class="hv-bo-niveau"><span class="hv-bo-niveau__naam"><span>' + h(naam) + '</span><span class="hv-bo-niveau__sub">' + h(sub) + '</span></span>' + o.risico(niveau) + o.gevolg(gevolg, { kop: naam }) + '</div>';
  }
  var sluitKlok = {};
  function ingangBediening(ctx, a) {
    var w = ctx.staat, st = a.st, garage = a.soort === 'garagedeur', bezig = a.wacht && a.wacht.fase === 'bezig';
    var b = o.beeld(a), f = openDeel(a);
    var aftel = HV.ui.lees('bo-sluit-' + a.id, null), rest = aftel ? Math.max(0, Math.ceil((aftel - Date.now()) / 1000)) : null;
    var deels = st.open && st.deels != null && st.deels < 100;
    var woord = bezig ? (a.wacht.waarde ? t('відчиняється', 'gaat open') : t('зачиняється', 'gaat dicht')) : a.wacht ? HV.woord.wacht() : rest != null ? t('зачинення через ' + rest + ' с', 'sluit over ' + rest + ' s') : deels ? t('зупинено частково', 'gedeeltelijk gestopt') : st.open ? HV.woord.open() : HV.woord.dicht();
    var sinds = st.sinds ? HV.duur((w.tijd - st.sinds) / MIN) : null;
    var uit = kop({ teken: teken(a, b), woord: bezig || deels || a.wacht ? woord : t('Зараз', 'Nu'), getal: bezig || deels ? HV.maat(Math.round(f * 100), '%') : '', groot: hoofdletter(woord),
      sub: h(st.open && sinds ? t('відчинено вже ' + sinds, 'al ' + sinds + ' open') : !st.open && sinds ? t('зачинено ' + sinds + ' тому', 'al ' + sinds + ' dicht') : t('датчик кінцевого положення підтверджує', 'de eindschakelaar bevestigt')),
      chips: o.risico(st.open ? 'gevoelig' : 'kritiek') });
    uit += '<div class="hv-bo-beeld hv-bo-beeld--deur" data-k="bo-beeld">' + (garage ? garageBeeld(a) : poortBeeld(a)) + (rest != null ? '<span class="hv-bo-beeld__aftel" aria-live="polite">' + h(String(rest)) + '</span>' : '') + '</div>';
    var openKnop = o.knop({ tekst: t('Відчинити…', 'Openen…'), icoon: 'arrow-up-from-line', soort: st.open ? 'gewoon' : 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'open', waarde: 'true' }, gedrukt: !a.wacht && st.open && !deels });
    var sluitKnop = rest != null ? o.knop({ tekst: t('Скасувати', 'Annuleren'), aria: t('Скасувати зачинення', 'Sluiten annuleren'), icoon: 'x', soort: 'hoofd', actie: 'bo-sluit-stop', gegevens: { doel: a.id } })
      : o.knop({ tekst: t('Зачинити', 'Sluiten'), icoon: 'arrow-down-to-line', soort: st.open ? 'hoofd' : 'gewoon', actie: 'bo-sluit', gegevens: { doel: a.id }, gedrukt: !a.wacht && !st.open });
    uit += '<div class="hv-bo-trio hv-bo-trio--twee" data-k="bo-ingang-knoppen">' + openKnop + (bezig ? o.knop({ tekst: t('Стоп', 'Stop'), icoon: 'square', actie: 'bo-stop', gegevens: { doel: a.id } }) : '') + sluitKnop + '</div>';
    uit += '<div class="hv-bo-niveaus" data-k="bo-niveaus">' +
      niveauRij(t('Відчинити', 'Openen'), t('рейка утримання й підтвердження входу', 'houdrail en bevestiging van je aanmelding'), 'kritiek', HV.p(HV.gevaar.actie('ingang.openen').gevolg)) +
      niveauRij(t('Зачинити', 'Sluiten'), t('відлік 5 с, датчик перешкоди підтверджено', '5 s aftellen, obstakelsensor bevestigd'), 'gevoelig', t('Що станеться: перед рухом іде відлік 5 с; якщо датчик побачить перешкоду, ворота зупиняться й відчиняться. Пов’язано з: кадр зони руху нижче. Як повернути: «Скасувати зачинення» під час відліку або «Відчинити…».', 'Wat er gebeurt: vóór het bewegen telt het 5 s af; ziet de sensor een obstakel, dan stopt de poort en gaat weer open. Hangt samen met: het beeld van het bewegingsgebied hieronder. Terugdraaien: ‘Sluiten annuleren’ tijdens het aftellen of ‘Openen…’.')) + '</div>';
    var cam = garage ? 'cameragarage' : 'cameravoor';
    var zone = o.kaart({ titel: t('Зона руху', 'Bewegingsgebied'), k: 'bo-zone', inhoud: '<div class="hv-bo-zone"><span class="hv-bo-zone__kader">' + HV.icoon('cctv', { maat: 'l' }) + '<span>' + h(t('кадр зони з сервера', 'beeld van het gebied via de server')) + '</span></span>' +
      '<div class="hv-rijen">' + o.rij({ icoon: 'scan-line', naam: t('Датчик перешкоди', 'Obstakelsensor'), waarde: '<span class="hv-bo-ok">' + HV.icoon('check', { maat: 's' }) + h(t('вільно', 'vrij')) + '</span>' }) +
      o.rij({ icoon: 'lightbulb', naam: t('Світло під час руху', 'Licht tijdens het bewegen'), waarde: h(t('блимає', 'knippert')) }) + '</div></div>' +
      knoppen(o.knop({ tekst: t('Відкрити камеру', 'Camera openen'), icoon: 'cctv', soort: 'stil', actie: 'blad', gegevens: { blad: 'apparaat:' + cam } })) });
    var auto = String(st.autoSluiten || 0);
    var instel = o.kaart({ titel: t('Автозачинення', 'Automatisch sluiten'), k: 'bo-auto', extra: o.gevolg(t('Що станеться: якщо ворота лишаться відчиненими довше, дім зачинить їх сам — так само з відліком 5 с і перевіркою перешкоди. Пов’язано з: режим дому «Не вдома». Як повернути: оберіть «Вимк.».', 'Wat er gebeurt: blijft de poort langer open, dan sluit het huis haar zelf — ook met 5 s aftellen en een obstakelcontrole. Hangt samen met: de huisstand ‘Afwezig’. Terugdraaien: kies ‘Uit’.'), { kop: t('Автозачинення', 'Automatisch sluiten') }), inhoud:
      veld(t('Зачинити, якщо відчинено довше', 'Sluiten als langer open dan'), o.segment({ label: t('Автозачинення', 'Automatisch sluiten'), waarde: auto, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'autoSluiten' }, opties: [{ id: '0', label: t('Вимк.', 'Uit') }, { id: '5', label: '5 ' + t('хв', 'min') }, { id: '10', label: '10 ' + t('хв', 'min') }, { id: '30', label: '30 ' + t('хв', 'min') }] })) });
    return blad(o.kaart({ inhoud: uit }) + zone + instel + waarom(a));
  }
  function ingangGeschiedenis(ctx, a) {
    var w = ctx.staat, vandaag = middernacht(w.tijd), stukken = [];
    var momenten = a.soort === 'garagedeur' ? [[7.92, 8.05], [8.2, 8.27], [15.5, 15.58]] : [[8.18, 8.23], [12.6, 12.64], [15.48, 15.53]];
    momenten.forEach(function (m) { var x = vandaag + m[0] * UUR; if (x < w.tijd) stukken.push({ van: x, tot: Math.min(w.tijd, vandaag + m[1] * UUR), toon: 'let-op', label: HV.tijd(x) + '–' + HV.tijd(vandaag + m[1] * UUR) }); });
    if (a.st.open) stukken.push({ van: a.st.sinds || w.tijd - 5 * MIN, tot: w.tijd, toon: 'let-op', label: t('відчинено зараз', 'nu open') });
    var duur = stukken.reduce(function (s, x) { return s + (x.tot - x.van); }, 0);
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.toestanden({ id: 'bo-ingang-' + a.id, titel: t('Відчинено сьогодні', 'Open vandaag'), van: vandaag, tot: w.tijd, nu: w.tijd, tikken: tikken(vandaag, w.tijd, 4), format: HV.tijd,
      banen: [{ naam: naamVan(a), stukken: stukken }], samenvatting: t(stukken.length + ' разів, разом ' + HV.duur(duur / MIN) + '.', stukken.length + ' keer, samen ' + HV.duur(duur / MIN) + '.') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  // ───────────────────────── 6. Техніка з програмою ─────────────────────────
  // [id, назва, хвилин, кВт·год]
  var PROGRAMMA = {
    wasmachine: [['katoen40', ['Бавовна 40°', 'Katoen 40°'], 95, 0.9], ['synth30', ['Синтетика 30°', 'Synthetisch 30°'], 70, 0.6], ['fijn30', ['Делікатне 30°', 'Fijne was 30°'], 50, 0.4], ['snel15', ['Швидке 15 хв', 'Snel 15 min'], 15, 0.2], ['eco4060', ['Економне 40–60°', 'Eco 40–60°'], 180, 0.7]],
    droger: [['kast', ['Шафа', 'Kastdroog'], 120, 1.6], ['strijk', ['Під праску', 'Strijkdroog'], 90, 1.2], ['wol', ['Вовна', 'Wol'], 60, 0.6], ['opfris', ['Освіжити', 'Opfrissen'], 20, 0.2]],
    vaatwasser: [['eco', ['Економний', 'Eco'], 210, 0.8], ['auto', ['Авто 45–65°', 'Auto 45–65°'], 140, 1.1], ['intens', ['Інтенсивний 70°', 'Intensief 70°'], 120, 1.5], ['snel', ['Швидкий 30 хв', 'Snel 30 min'], 30, 0.7]]
  };
  var FASEN = {
    wasmachine: [[0.55, ['Прання', 'Wassen']], [0.85, ['Полоскання', 'Spoelen']], [1, ['Віджим', 'Centrifugeren']]],
    droger: [[0.85, ['Сушіння', 'Drogen']], [1, ['Охолодження', 'Afkoelen']]],
    vaatwasser: [[0.15, ['Замочування', 'Voorspoelen']], [0.55, ['Миття', 'Wassen']], [0.8, ['Полоскання', 'Spoelen']], [1, ['Сушіння', 'Drogen']]]
  };
  function programmaVan(a) {
    var lijst = PROGRAMMA[a.soort];
    var id = a.st.keuze;
    return lijst.filter(function (p) { return p[0] === id; })[0] || lijst.filter(function (p) { return p[1][0] === (a.st.programma || [])[0]; })[0] || lijst[0];
  }
  var planVan = function (a) { return a.st.plan ? Number(a.st.plan) : null; };

  /** Відкладений старт: прилад сам стартує в заплановану годину (його власна функція), від імені того, хто планував. */
  var planWacht = false;
  function bewaakPlannen() {
    if (planWacht) return;
    planWacht = true;
    HV.staat.abonneer(function (w) {
      ['wasmachine', 'droger', 'vaatwasser'].forEach(function (id) {
        var a = w.apparaten[id];
        if (!a || !a.st.plan || a.st.loopt || a.wacht || Number(a.st.plan) > w.tijd) return;
        var wie = a.st.planDoor || HV.mens();
        a.st.plan = null;
        startProgramma(a, { door: wie, waarom: ['відкладений старт у дешеву годину', 'uitgestelde start in een goedkoop uur'], stil: false });
      });
    });
  }
  function startProgramma(a, op) {
    var p = programmaVan(a);
    return HV.doe({ doel: a.id, mogelijkheid: 'programma', waarde: 'start', door: op && op.door, waarom: op && op.waarom }).then(function (r) {
      if (r && r.ok) HV.staat.wijzig(function () { a.st.rest = p[2]; a.st.duur = p[2]; a.st.vermogen = a.soort === 'droger' ? 820 : a.soort === 'vaatwasser' ? 1350 : 480; a.st.plan = null; a.st.gestart = HV.staat.w.tijd; });
      return r;
    });
  }

  function programmaBediening(ctx, a) {
    var w = ctx.staat, st = a.st, p = programmaVan(a), loopt = !!st.loopt, plan = planVan(a);
    bewaakPlannen();
    var duur = st.duur || p[2], rest = loopt ? st.rest : 0, deel = loopt ? 1 - rest / duur : 0;
    var fasen = FASEN[a.soort], fase = fasen.filter(function (f) { return deel < f[0]; })[0] || fasen[fasen.length - 1];
    var prijs = HV.tarief.prijs(w.tijd), goed = HV.tarief.goedkoopst(w.tijd, 12);
    var icoon = HV.paspoort.soorten[a.soort].icoon;
    var midden = loopt ? '<span class="hv-bo-ring__getal">' + h(HV.duur(rest)) + '</span><span class="hv-bo-ring__label">' + h(t('лишилося', 'nog')) + '</span>'
      : plan ? '<span class="hv-bo-ring__getal">' + h(HV.tijd(plan)) + '</span><span class="hv-bo-ring__label">' + h(t('старт', 'start')) + '</span>'
        : HV.icoon(icoon, { maat: 'l', klas: 'hv-bo-ring__ic' }) + '<span class="hv-bo-ring__label">' + h(t('готова', 'klaar')) + '</span>';
    var faseRij = '<ol class="hv-bo-fasen" aria-label="' + h(t('Фази програми', 'Fasen van het programma')) + '">' + fasen.map(function (f) {
      var klaar = loopt && deel >= f[0], nu = loopt && f === fase;
      return '<li class="' + (nu ? 'is-nu' : klaar ? 'is-klaar' : '') + '">' + (klaar ? HV.icoon('check', { maat: 's' }) : nu ? HV.icoon('loader', { maat: 's' }) : '') + '<span>' + h(HV.p(f[1])) + '</span></li>';
    }).join('') + '</ol>';
    var held = '<div class="hv-bo-programma" data-k="bo-programma">' + ring(deel, midden, 'aan', loopt ? t('Залишилося ', 'Nog ') + HV.duur(rest) : t('Не працює', 'Niet actief')) +
      '<div class="hv-bo-programma__tekst"><p class="hv-bo-kop__woord">' + h(loopt ? HV.p(fase[1]) : plan ? t('Чекає дешевої години', 'Wacht op een goedkoop uur') : a.wacht ? HV.woord.wacht() : t('Готова до запуску', 'Klaar om te starten')) + '</p>' +
      '<p class="hv-bo-programma__naam">' + h(HV.p(p[1])) + '</p>' +
      '<p class="hv-bo-kop__sub">' + h(loopt ? t('завершення о ', 'klaar om ') + HV.tijd(w.tijd + rest * MIN) : plan ? t('о ', 'om ') + HV.tijd(plan) + ' · ' + HV.euro(HV.tarief.prijs(plan)) + t(' за кВт·год', ' per kWh') : HV.duur(p[2]) + ' · ≈ ' + HV.getal(p[3], 1) + t(' кВт·год', ' kWh')) + '</p></div></div>';
    var uit = held + (loopt ? faseRij : '');
    uit += getallen(loopt ? [{ label: t('Потужність', 'Vermogen'), waarde: HV.maat(st.vermogen, t('Вт', 'W')) }, { label: t('Цикл', 'Cyclus'), waarde: HV.maat(p[3], t('кВт·год', 'kWh'), 1) }, { label: t('Вартість', 'Kosten'), waarde: h(HV.euro(p[3] * prijs)), sub: h(t('за ціною зараз', 'tegen de prijs van nu')) }]
      : [{ label: t('Ціна зараз', 'Prijs nu'), waarde: h(HV.euro(prijs)), sub: h(t('за кВт·год', 'per kWh')) }, { label: t('Найдешевше', 'Goedkoopst'), waarde: h(HV.tijd(goed.tijd)), sub: h(HV.euro(goed.prijs)) }, { label: t('Цикл зараз', 'Cyclus nu'), waarde: h(HV.euro(p[3] * prijs)) }]);
    if (!loopt) {
      uit += veld(t('Програма', 'Programma'), '<div class="hv-bo-keuzes" role="radiogroup" aria-label="' + h(t('Програма', 'Programma')) + '">' + PROGRAMMA[a.soort].map(function (x) {
        var gekozen = x[0] === p[0];
        return '<button type="button" role="radio" aria-checked="' + gekozen + '" class="hv-bo-keuze' + (gekozen ? ' is-gekozen' : '') + '" data-actie="bo-programma" data-doel="' + h(a.id) + '" data-waarde="' + h(x[0]) + '"><span class="hv-bo-keuze__naam">' + h(HV.p(x[1])) + '</span><span class="hv-bo-keuze__sub"><span>' + h(HV.duur(x[2])) + '</span><span>' + h(HV.getal(x[3], 1) + t(' кВт·год', ' kWh')) + '</span></span></button>';
      }).join('') + '</div>');
      var besparing = (prijs - goed.prijs) * p[3];
      if (plan) {
        uit += '<div class="hv-bo-plan" data-k="bo-plan">' + HV.icoon('calendar-clock') + '<div><p><strong>' + h(t('Чекає дешевої години', 'Wacht op een goedkoop uur')) + '</strong></p><p>' + h(t('Старт о ', 'Start om ') + HV.tijd(plan) + ' · ' + t('ціна ', 'prijs ') + HV.euro(HV.tarief.prijs(plan)) + ' · ' + t('заощадить ', 'bespaart ') + HV.euro(Math.max(0, (prijs - HV.tarief.prijs(plan)) * p[3]))) + '</p></div></div>' +
          knoppen(o.knop({ tekst: t('Запустити зараз', 'Nu starten'), icoon: 'play', soort: 'hoofd', actie: 'bo-start', gegevens: { doel: a.id } }) + o.knop({ tekst: t('Скасувати план', 'Plan annuleren'), icoon: 'x', actie: 'bo-plan', gegevens: { doel: a.id, waarde: 0 } }));
      } else {
        uit += knoppen(o.knop({ tekst: t('Запустити зараз', 'Nu starten'), icoon: 'play', soort: 'hoofd', actie: 'bo-start', gegevens: { doel: a.id } }) +
          o.knop({ tekst: t('О ' + HV.tijd(goed.tijd) + ' дешевше', 'Om ' + HV.tijd(goed.tijd) + ' goedkoper'), icoon: 'calendar-clock', actie: 'bo-plan', gegevens: { doel: a.id, waarde: goed.tijd } })) +
          '<p class="hv-bo-regel">' + o.risico('gevoelig') + h(besparing > 0.005 ? t(' Відкладений старт заощадить ' + HV.euro(besparing) + '. ', ' Uitgesteld starten bespaart ' + HV.euro(besparing) + '. ') : t(' Зараз уже дешева година. ', ' Het is nu al een goedkoop uur. ')) +
          o.gevolg(t('Що станеться: прилад почне програму «' + p[1][0] + '» одразу або в найдешевшу годину сам. Пов’язано з: тариф на 48 годин, сонячні панелі. Як повернути: «Зупинити програму» або «Повернути» протягом 10 с; план — «Скасувати план».', 'Wat er gebeurt: het apparaat start programma ‘' + p[1][1] + '’ meteen, of zelf in het goedkoopste uur. Hangt samen met: het tarief voor 48 uur, de zonnepanelen. Terugdraaien: ‘Programma stoppen’ of ‘Ongedaan maken’ binnen 10 s; een plan — ‘Plan annuleren’.'), { kop: t('Запустити програму', 'Programma starten') }) + '</p>';
      }
    } else {
      uit += knoppen(o.knop({ tekst: t('Зупинити програму', 'Programma stoppen'), icoon: 'square', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'programma', waarde: 'stop' } }));
    }
    var melden = st.melden == null ? true : bool(st.melden);
    var extra = o.kaart({ titel: t('Прилад', 'Apparaat'), k: 'bo-toestel', inhoud: '<div class="hv-rijen">' +
      o.rij({ icoon: 'smartphone', naam: t('Дистанційний старт', 'Op afstand starten'), sub: t('дозволено на самому приладі', 'toegestaan op het apparaat zelf'), waarde: '<span class="hv-bo-ok">' + HV.icoon('check', { maat: 's' }) + h(t('так', 'ja')) + '</span>' }) +
      o.rij({ icoon: loopt ? 'lock' : 'lock-open', naam: t('Дверцята', 'Deur'), waarde: h(loopt ? t('заблоковано на час програми', 'vergrendeld tijdens het programma') : t('зачинено', 'dicht')) }) + '</div>' +
      '<div class="hv-bo-schakelrij">' + o.schakel({ aan: melden, icoon: melden ? 'bell-ring' : 'bell-off', toon: 'neutraal', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'melden', standaard: 'true' }, aria: t('Сповістити, коли завершиться', 'Melden als het klaar is') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(t('Сповістити, коли завершиться', 'Melden als het klaar is')) + '</span><span>' + h(melden ? t('у «Зараз важливо» й на телефон', 'in ‘Nu belangrijk’ en op de telefoon') : t('лише запис у Журналі', 'alleen een regel in het logboek')) + '</span></span></div>' });
    return blad(o.kaart({ inhoud: uit }) + extra + waarom(a));
  }
  function programmaGeschiedenis(ctx, a) {
    var w = ctx.staat, vandaag = middernacht(w.tijd), staven = [];
    var z = zaadVan(a.id);
    for (var d = 13; d >= 0; d--) { var n = (z + d * 3) % (a.soort === 'vaatwasser' ? 3 : 4); staven.push({ label: dagLabel(vandaag - d * DAG), waarde: d === 0 ? (a.st.loopt ? 1 : 0) + (n % 2) : n % 3, toon: 'aan', nu: d === 0 }); }
    var totaal = staven.reduce(function (s, x) { return s + x.waarde; }, 0);
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.staven({ id: 'bo-cycli-' + a.id, titel: t('Цикли за два тижні', 'Cycli in twee weken'), eenheid: t('циклів', 'cycli'), decimalen: 0, tikken: 3, hoogte: 120, staven: staven,
      samenvatting: t('Разом ' + totaal + ' циклів, ≈ ' + HV.getal(totaal * programmaVan(a)[3], 1) + ' кВт·год (симуляція).', 'Samen ' + totaal + ' cycli, ≈ ' + HV.getal(totaal * programmaVan(a)[3], 1) + ' kWh (simulatie).') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  // ───────────────────────── 7. Духовка, холодильник, кавоварка ─────────────────────────
  var OVEN_MODI = [['boven-onder', ['Верх і низ', 'Boven- en onderwarmte'], 'square'], ['hetelucht', ['Конвекція', 'Hetelucht'], 'fan'], ['grill', ['Гриль', 'Grill'], 'flame'], ['ontdooien', ['Розморожування', 'Ontdooien'], 'snowflake']];
  /** Розрахункова температура в камері (макет): розігрів до цілі за ≈ 10 хв, остигання ≈ 30 хв. */
  function ovenTemp(a) {
    var w = W(), st = a.st;
    if (st.aan) return rond(22 + (st.doel - 22) * (1 - Math.exp(-Math.max(0, w.tijd - (st.sinds || w.tijd)) / (4 * MIN))), 0);
    return st.temperatuur;
  }
  function ovenBediening(ctx, a) {
    var w = ctx.staat, st = a.st, b = o.beeld(a), temp = ovenTemp(a), doel = Number(gewenst(a, 'doel'));
    var aan = !!st.aan, klaar = aan && temp >= doel - 3;
    var modus = st.modus || 'hetelucht';
    var uit = kop({ teken: teken(a, b), woord: a.wacht ? HV.woord.wacht() : aan ? (klaar ? t('Розігріто — можна ставити', 'Op temperatuur — erin ermee') : t('Розігрівається', 'Warmt op')) : t('Вимкнено', 'Uit'),
      getal: HV.maat(temp, '°C'), sub: h(t('ціль ', 'doel ') + HV.getal(doel) + ' °C' + (aan && !klaar ? t(' · ще ≈ ', ' · nog ≈ ') + HV.duur(Math.max(1, 10 - (w.tijd - (st.sinds || w.tijd)) / MIN)) : '')),
      chips: o.risico(aan ? 'gewoon' : 'gevaarlijk') });
    uit += '<div class="hv-bo-thermo" data-k="bo-thermo"><span class="hv-bo-thermo__spoor"><i style="width:' + klem((temp - 20) / (250 - 20) * 100, 0, 100).toFixed(1) + '%"></i><b style="left:' + klem((doel - 20) / (250 - 20) * 100, 0, 100).toFixed(1) + '%"></b></span>' +
      '<span class="hv-bo-thermo__as"><span>20 °C</span><span>250 °C</span></span></div>';
    uit += veld(t('Ціль', 'Doel'), o.stapper({ actie: 'stap-doe', gegevens: { doel: a.id, mogelijkheid: 'doel' }, stap: 10, label: t('Температура духовки', 'Oventemperatuur'), waarde: HV.maat(doel, '°C'), k: 'bo-ovendoel' }), ' ' + o.risico('gevoelig'));
    uit += veld(t('Режим', 'Stand'), o.segment({ label: t('Режим духовки', 'Ovenstand'), waarde: modus, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'modus' }, klas: 'hv-segment--rol', opties: OVEN_MODI.map(function (m) { return { id: m[0], label: HV.p(m[1]), icoon: m[2] }; }) }));
    uit += aan
      ? knoppen(o.knop({ tekst: t('Вимкнути', 'Uitzetten'), icoon: 'power', soort: 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'false' } }))
      : knoppen(o.knop({ tekst: t('Розігріти до ' + HV.getal(doel) + ' °C…', 'Opwarmen tot ' + HV.getal(doel) + ' °C…'), icoon: 'flame', soort: 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'true' } })) +
        '<p class="hv-bo-regel">' + o.risico('gevaarlijk') + h(t(' Нагрів — рейка утримання. ', ' Opwarmen — met de houdrail. ')) + o.gevolg(HV.p(HV.gevaar.actie('oven.aan').gevolg), { kop: t('Увімкнути духовку', 'Oven aanzetten') }) + '</p>';
    var uitOm = st.uitOm;
    uit += veld(t('Вимкнути через', 'Uit over'), uitOm ? '<div class="hv-aftelrij">' + o.aftel({ rest: (uitOm - w.tijd) / MIN, totaal: 60, icoon: 'timer', toon: 'warm' }) + '<span class="hv-aftelrij__om">' + h(t('о ', 'om ') + HV.tijd(uitOm)) + '</span>' + o.knop({ tekst: t('Скасувати', 'Annuleren'), klein: true, soort: 'stil', actie: 'bo-aftel', gegevens: { doel: a.id, minuten: 0 } }) + '</div>'
      : '<div class="hv-filter">' + [15, 30, 45, 60].map(function (m) { return o.chip({ filter: true, tekst: HV.duur(m), actie: 'bo-aftel', gegevens: { doel: a.id, minuten: m }, k: 'bo-aftel-' + m }); }).join('') + '</div>');
    var slot = st.kinderslot == null ? false : bool(st.kinderslot);
    var rook = A('rookkeuken');
    var veilig = o.kaart({ titel: t('Безпека', 'Veiligheid'), k: 'bo-ovenveilig', inhoud: '<div class="hv-bo-schakelrij">' + o.schakel({ aan: slot, icoon: slot ? 'lock' : 'lock-open', toon: 'neutraal', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'kinderslot', standaard: 'false' }, aria: t('Блокування від дітей', 'Kinderslot') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(t('Блокування від дітей', 'Kinderslot')) + '</span><span>' + h(slot ? t('кнопки на приладі не працюють', 'de knoppen op het apparaat werken niet') : t('кнопки на приладі працюють', 'de knoppen op het apparaat werken')) + '</span></span></div>' +
      '<div class="hv-rijen">' + o.rij({ icoon: 'timer-off', naam: t('Автовимкнення', 'Automatisch uit'), waarde: h(t('через 3 год без дій', 'na 3 u zonder bediening')) }) +
      (rook ? o.rij({ icoon: 'alarm-smoke', naam: HV.p(rook.naam) + ' · ' + HV.p(HV.staat.kamer(rook.kamer).naam), sub: rook.st.alarm ? t('тривога', 'alarm') : t('спокійно', 'rustig'), actie: 'blad', gegevens: { blad: 'apparaat:' + rook.id } }) : '') + '</div>' });
    return blad(o.kaart({ inhoud: uit }) + veilig + waarom(a));
  }
  function ovenGeschiedenis(ctx, a) {
    var w = ctx.staat, van = w.tijd - 6 * UUR, punten = [];
    for (var i = 0; i <= 36; i++) {
      var x = van + i * 10 * MIN, u = HV.uur(x), y = 22;
      if (u >= 18.3 - 24 && u < 19.2 - 24) y = 200; // вчорашня вечеря поза вікном
      if (i === 36) y = ovenTemp(a); else if (a.st.aan && x >= (a.st.sinds || w.tijd)) y = rond(22 + (a.st.doel - 22) * (1 - Math.exp(-(x - a.st.sinds) / (4 * MIN))), 0);
      else if (u >= 12.1 && u < 12.7) y = rond(22 + 178 * (1 - Math.exp(-(u - 12.1) * 60 / 4)), 0); else if (u >= 12.7 && u < 13.6) y = rond(22 + 178 * Math.exp(-(u - 12.7) * 60 / 30), 0);
      punten.push([x, y]);
    }
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.lijn({ id: 'bo-oven-' + a.id, titel: t('Температура в камері, 6 годин', 'Temperatuur in de oven, 6 uur'), eenheid: '°C', hoogte: 130, nu: w.tijd,
      x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 3), format: HV.tijd }, reeksen: [{ naam: t('камера', 'ovenruimte'), toon: 'warm', vlak: true, punten: punten }],
      samenvatting: t('Обід о 12:06: розігрів за ≈ 10 хв, остигання ≈ 30 хв (симуляція).', 'Lunch om 12:06: opwarmen in ≈ 10 min, afkoelen ≈ 30 min (simulatie).') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  function koelkastBediening(ctx, a) {
    var st = a.st, doel = Number(gewenst(a, 'doel')), vdoel = st.vriezerDoel != null ? Number(st.vriezerDoel) : -18;
    var snel = bool(st.supervries), vak = bool(st.vakantie), deur = !!st.deurOpen;
    var vak2 = function (titel, waarde, d, actie, gegevens, stap, label) {
      return '<div class="hv-bo-vak"><span class="hv-bo-vak__tekst"><span class="hv-bo-vak__titel">' + h(titel) + '</span><span class="hv-bo-vak__getal">' + HV.maat(waarde, '°C', 1) + '</span></span>' +
        '<span class="hv-bo-vak__doelrij"><span class="hv-bo-vak__doel">' + h(t('ціль', 'doel')) + '</span>' + o.stapper({ actie: actie, gegevens: gegevens, stap: stap, label: label, waarde: HV.maat(d, '°C', d % 1 ? 1 : 0), k: 'bo-' + label }) + '</span></div>';
    };
    var uit = kop({ teken: o.schakel({ aan: false, icoon: 'refrigerator', toon: 'koud', aria: naamVan(a) }), woord: deur ? t('Дверцята відчинено', 'Deur open') : t('Холодить як треба', 'Koelt zoals het hoort'),
      sub: h(t('компресор ', 'compressor ') + (zaadVan(a.id) % 2 ? t('працює', 'draait') : t('відпочиває', 'rust')) + ' · ' + t('відкривали сьогодні ', 'vandaag geopend ') + '23' + t(' рази', ' keer')),
      chips: deur ? o.chip({ icoon: 'door-open', toon: 'let-op', tekst: t('зачиніть дверцята', 'sluit de deur') }) : o.chip({ icoon: 'door-closed', tekst: t('дверцята зачинено', 'deur dicht') }) });
    uit += '<div class="hv-bo-vakken">' + vak2(t('Холодильник', 'Koelkast'), st.temperatuur, doel, 'stap-doe', { doel: a.id, mogelijkheid: 'doel' }, 0.5, t('Ціль холодильника', 'Doel koelkast')) +
      vak2(t('Морозилка', 'Vriezer'), st.vriezer, vdoel, 'bo-vriezer', { doel: a.id }, 1, t('Ціль морозилки', 'Doel vriezer')) + '</div>';
    uit += '<p class="hv-bo-regel">' + o.risico('gevoelig') + h(t(' Зміна цілі — чутлива дія. ', ' Het doel wijzigen is een gevoelige actie. ')) + o.gevolg(t('Що станеться: холодильник почне тримати нову температуру за ≈ 2 год. Пов’язано з: продукти псуються швидше вище 7 °C. Як повернути: «−/+» або «Повернути» протягом 10 с.', 'Wat er gebeurt: de koelkast houdt de nieuwe temperatuur aan binnen ≈ 2 uur. Hangt samen met: eten bederft sneller boven 7 °C. Terugdraaien: ‘−/+’ of ‘Ongedaan maken’ binnen 10 s.'), { kop: t('Ціль холодильника', 'Doel koelkast') }) + '</p>';
    var standen = o.kaart({ titel: t('Режими', 'Standen'), k: 'bo-koelstanden', inhoud:
      '<div class="hv-bo-schakelrij">' + o.schakel({ aan: snel, icoon: 'snowflake', toon: 'koud', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'supervries', standaard: 'false' }, aria: t('Посилене заморожування', 'Supervriezen') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(t('Посилене заморожування', 'Supervriezen')) + '</span><span>' + h(snel ? t('−24 °C на 24 год, потім саме вимкнеться', '−24 °C voor 24 u, daarna vanzelf uit') : t('увімкніть за годину до великої закупки', 'zet aan een uur vóór een grote boodschap')) + '</span></span></div>' +
      '<div class="hv-bo-schakelrij">' + o.schakel({ aan: vak, icoon: 'luggage', toon: 'neutraal', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'vakantie', standaard: 'false' }, aria: t('Режим відпустки', 'Vakantiestand') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(t('Режим відпустки', 'Vakantiestand')) + '</span><span>' + h(vak ? t('холодильник 15 °C, морозилка без змін', 'koelkast 15 °C, vriezer ongewijzigd') : t('для порожнього холодильника', 'voor een lege koelkast')) + '</span></span></div>' });
    return blad(o.kaart({ inhoud: uit }) + standen + waarom(a));
  }
  function koelkastGeschiedenis(ctx, a) {
    var w = ctx.staat, van = w.tijd - DAG, z = zaadVan(a.id), koel = [], vries = [];
    for (var i = 0; i <= 48; i++) {
      var x = van + i * 30 * MIN, u = HV.uur(x), deur = (u > 7 && u < 8.5) || (u > 12 && u < 13) || (u > 18 && u < 19.5) ? 0.9 : 0;
      koel.push([x, i === 48 ? a.st.temperatuur : rond(a.st.doel + 0.3 * Math.sin((i + z) / 1.6) + deur, 1)]);
      vries.push([x, i === 48 ? a.st.vriezer : rond((a.st.vriezerDoel != null ? Number(a.st.vriezerDoel) : -18) - 0.4 + 0.5 * Math.sin((i + z) / 2.2) + deur * 0.4, 1)]);
    }
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.lijn({ id: 'bo-koel-' + a.id, titel: t('Температури за добу', 'Temperaturen dit etmaal'), eenheid: '°C', hoogte: 140, nu: w.tijd,
      x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 4), format: HV.tijd }, reeksen: [{ naam: t('холодильник', 'koelkast'), toon: 'koud', punten: koel }, { naam: t('морозилка', 'vriezer'), toon: 'neutraal', punten: vries }],
      samenvatting: t('Сплески — коли відчиняли дверцята: сніданок, обід, вечеря.', 'Pieken — als de deur openging: ontbijt, lunch, avondeten.') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  var DRANKEN = [['espresso', ['Еспресо', 'Espresso'], 'coffee'], ['lungo', ['Лунго', 'Lungo'], 'cup-soda'], ['cappuccino', ['Капучино', 'Cappuccino'], 'milk'], ['water', ['Гаряча вода', 'Heet water'], 'droplet']];
  function koffieBediening(ctx, a) {
    var st = a.st, b = o.beeld(a), drank = st.drank || 'lungo', sterkte = st.sterkte || 'midden';
    var d = DRANKEN.filter(function (x) { return x[0] === drank; })[0] || DRANKEN[1];
    var aan = HV.kijk.isAan(a);
    var uit = kop({ teken: teken(a, b), woord: a.wacht ? HV.woord.wacht() : aan ? t('Готує «' + d[1][0] + '»', 'Zet ‘' + d[1][1] + '’') : t('Готова', 'Klaar'),
      sub: h(t('сьогодні ', 'vandaag ') + (3 + (aan ? 1 : 0)) + ' ' + t('чашки', 'kopjes') + ' · ' + t('нагрів ≈ 40 с', 'opwarmen ≈ 40 s')), chips: o.risico('gevoelig') });
    uit += veld(t('Напій', 'Drank'), o.segment({ label: t('Напій', 'Drank'), waarde: drank, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'drank' }, klas: 'hv-segment--rol', opties: DRANKEN.map(function (x) { return { id: x[0], label: HV.p(x[1]), icoon: x[2] }; }) }));
    uit += veld(t('Міцність', 'Sterkte'), o.segment({ label: t('Міцність', 'Sterkte'), waarde: sterkte, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'sterkte' }, opties: [{ id: 'mild', label: t('Легка', 'Mild') }, { id: 'midden', label: t('Середня', 'Normaal') }, { id: 'sterk', label: t('Міцна', 'Sterk') }] }));
    uit += knoppen(o.knop({ tekst: aan ? t('Готує…', 'Bezig…') : t('Зварити «' + d[1][0] + '»', '‘' + d[1][1] + '’ zetten'), icoon: d[2], soort: 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'true' }, uit: aan }) +
      (aan ? o.knop({ tekst: t('Зупинити', 'Stoppen'), icoon: 'square', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'false' } }) : '')) +
      '<p class="hv-bo-regel">' + o.risico('gevoelig') + h(t(' Нагрів води — чутлива дія. ', ' Water opwarmen is een gevoelige actie. ')) + o.gevolg(t('Що станеться: кавоварка нагріє воду й зварить напій у чашку, що стоїть під носиком; через 4 хв вимкнеться сама. Пов’язано з: сцена «Ранок». Як повернути: «Зупинити».', 'Wat er gebeurt: de machine warmt water op en zet de drank in het kopje onder de uitloop; na 4 min gaat ze vanzelf uit. Hangt samen met: scène ‘Ochtend’. Terugdraaien: ‘Stoppen’.'), { kop: t('Зварити', 'Zetten') }) + '</p>';
    var water = Number(st.water) || 0, bonen = st.bonen != null ? Number(st.bonen) : 55, kalk = st.ontkalk != null ? Number(st.ontkalk) : 42;
    var onderhoud = o.kaart({ titel: t('Вода, зерна, догляд', 'Water, bonen, onderhoud'), k: 'bo-koffie-zorg', inhoud: balk({ label: t('Бак води', 'Waterreservoir'), icoon: 'droplet', waarde: water, laag: 20, sub: t('≈ ' + Math.round(water / 12) + ' чашок', '≈ ' + Math.round(water / 12) + ' kopjes') }) +
      balk({ label: t('Зерна', 'Bonen'), icoon: 'bean', waarde: bonen, laag: 15 }) +
      balk({ label: t('До видалення накипу', 'Tot ontkalken'), icoon: 'sparkles', waarde: kalk / 200 * 100, tekst: h(kalk + ' ' + t('чашки', 'kopjes')), laag: 10 }) +
      knoppen(o.knop({ tekst: t('Видалити накип', 'Ontkalken'), icoon: 'sparkles', actie: 'bo-onderhoud', gegevens: { doel: a.id, veld: 'ontkalk', waarde: 200 } }) + o.knop({ tekst: t('Бак наповнено', 'Reservoir gevuld'), icoon: 'droplet', soort: 'stil', actie: 'bo-onderhoud', gegevens: { doel: a.id, veld: 'water', waarde: 100 } })) });
    return blad(o.kaart({ inhoud: uit }) + onderhoud + waarom(a));
  }

  // ───────────────────────── 8. Комп'ютер, сховище, принтер, маршрутизатор ─────────────────────────
  function vermogenGrafiek(a, id, titel, basis, aanFn, samenvatting) {
    var w = W(), van = w.tijd - 6 * UUR, z = zaadVan(a.id), punten = [];
    for (var i = 0; i <= 36; i++) { var x = van + i * 10 * MIN; punten.push([x, Math.max(0, Math.round(aanFn(x, i) ? basis * (0.8 + 0.35 * Math.abs(golf(z, i))) : basis * 0.03))]); }
    return HV.grafiek.lijn({ id: id, titel: titel, eenheid: t('Вт', 'W'), hoogte: 120, nu: w.tijd, x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 3), format: HV.tijd },
      reeksen: [{ naam: t('потужність', 'vermogen'), toon: 'net-in', vlak: true, punten: punten }], samenvatting: samenvatting });
  }

  function computerBediening(ctx, a) {
    var w = ctx.staat, st = a.st, b = o.beeld(a), aan = HV.kijk.isAan(a);
    var opgestart = st.sinds || (w.tijd - (3 * 60 + 12) * MIN);
    var uit = kop({ teken: teken(a, b), woord: a.wacht ? HV.woord.wacht() : aan ? t('Працює', 'Aan') : t('Спить', 'Slaapt'),
      getal: aan ? HV.maat(a.watt, t('Вт', 'W')) : HV.maat(2, t('Вт', 'W')), sub: h(aan ? t('увімкнено ' + HV.duur((w.tijd - opgestart) / MIN) + ' тому', 'al ' + HV.duur((w.tijd - opgestart) / MIN) + ' aan') : t('прокинеться за сигналом із мережі', 'wordt wakker op een signaal via het netwerk')),
      chips: aan ? o.chip({ icoon: 'user', tekst: t('у системі: Олена', 'aangemeld: Olena') }) : '' });
    if (aan) uit += getallen([{ label: t('Процесор', 'Processor'), waarde: HV.maat(18, '%'), sub: h('CPU') }, { label: t('Пам’ять', 'Geheugen'), waarde: HV.maat(54, '%') }, { label: t('Температура', 'Temperatuur'), waarde: HV.maat(47, '°C') }]);
    uit += knoppen(aan
      ? o.knop({ tekst: t('Перевести в сон', 'Laten slapen'), icoon: 'moon', soort: 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'false' } }) + o.knop({ tekst: t('Заблокувати екран', 'Scherm vergrendelen'), icoon: 'lock', actie: 'bo-signaal', gegevens: { doel: a.id, wat: 'vergrendel' } })
      : o.knop({ tekst: t('Розбудити', 'Wekken'), icoon: 'sunrise', soort: 'hoofd', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'true' } })) +
      (aan ? '<p class="hv-bo-regel">' + o.risico('gevoelig') + h(t(' Сон — чутлива дія. ', ' Laten slapen is een gevoelige actie. ')) + o.gevolg(t('Що станеться: комп’ютер засне; незбережену роботу програми зазвичай зберігають самі, але завантаження й дзвінки перерветься. Пов’язано з: розетка стола вимкне монітори через 5 хв. Як повернути: «Розбудити» — сигнал через мережу, ≈ 10 с.', 'Wat er gebeurt: de computer gaat slapen; programma’s bewaren meestal zelf, maar downloads en gesprekken breken af. Hangt samen met: de bureaustekker zet de monitoren na 5 min uit. Terugdraaien: ‘Wekken’ — een signaal via het netwerk, ≈ 10 s.'), { kop: t('Перевести в сон', 'Laten slapen') }) + '</p>' : '<p class="hv-bo-regel">' + o.risico('gewoon') + h(t(' Розбудити — звичайна дія, ≈ 10 с.', ' Wekken is een gewone actie, ≈ 10 s.')) + '</p>');
    var wol = st.wol == null ? true : bool(st.wol);
    var net = o.kaart({ titel: t('Мережа', 'Netwerk'), k: 'bo-pc-net', inhoud: '<div class="hv-rijen">' + o.rij({ icoon: 'network', naam: t('Адреса', 'Adres'), waarde: '<code>192.168.1.24</code>' }) + o.rij({ icoon: 'cable', naam: t('Під’єднання', 'Verbinding'), waarde: h(t('кабель, 1 Гбіт/с', 'kabel, 1 Gbit/s')) }) + '</div>' +
      '<div class="hv-bo-schakelrij">' + o.schakel({ aan: wol, icoon: 'sunrise', toon: 'neutraal', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'wol', standaard: 'true' }, aria: t('Пробудження через мережу', 'Wekken via het netwerk') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(t('Пробудження через мережу', 'Wekken via het netwerk')) + '</span><span>' + h(wol ? t('кнопка «Розбудити» працює', 'de knop ‘Wekken’ werkt') : t('розбудити можна лише кнопкою на корпусі', 'alleen wakker te maken met de knop op de kast')) + '</span></span></div>' });
    return blad(o.kaart({ inhoud: uit }) + o.kaart({ k: 'bo-pc-grafiek', inhoud: vermogenGrafiek(a, 'bo-pc-' + a.id, t('Потужність, 6 годин', 'Vermogen, 6 uur'), a.watt, function (x, i) { return i === 36 ? aan : HV.uur(x) > 9.4; }, aan ? t('Ранок — сон, з 09:25 — робота (симуляція).', 'Ochtend — slaap, vanaf 09:25 — werk (simulatie).') : t('Зараз спить: ≈ 2 Вт у режимі сну.', 'Slaapt nu: ≈ 2 W in slaapstand.')) }) + net + waarom(a));
  }

  function nasBediening(ctx, a) {
    var w = ctx.staat, st = a.st, b = o.beeld(a), aan = HV.kijk.isAan(a);
    var laatste = st.laatsteKopie || (middernacht(w.tijd) + 2 * UUR + 14 * MIN);
    var volgende = middernacht(w.tijd) + DAG + 2 * UUR;
    var uit = kop({ teken: teken(a, b), woord: a.wacht ? HV.woord.wacht() : aan ? t('Працює', 'Aan') : t('Вимкнено', 'Uit'), getal: HV.maat(st.vol, '%'), sub: h(t('зайнято на основному томі', 'bezet op het hoofdvolume')),
      chips: o.chip({ icoon: 'shield-alert', tekst: t('критичне живлення', 'kritieke voeding') }) });
    uit += balk({ label: t('Фото й документи · 8 ТБ', 'Foto’s en documenten · 8 TB'), icoon: 'folder', waarde: st.vol, hoog: 90, sub: t('≈ 14 місяців до заповнення', '≈ 14 maanden tot vol') }) +
      balk({ label: t('Записи камер · 4 ТБ', 'Camera-opnamen · 4 TB'), icoon: 'cctv', waarde: 74, hoog: 90, sub: t('найстаріші записи стираються через 30 днів', 'oudste opnamen worden na 30 dagen gewist') });
    var schijven = '<div class="hv-rijen">' + [[1, 38], [2, 37]].map(function (d) { return o.rij({ icoon: 'hard-drive', naam: t('Диск ' + d[0], 'Schijf ' + d[0]), sub: t('справний · 2 роки 4 міс.', 'gezond · 2 jaar 4 mnd'), waarde: HV.maat(d[1], '°C') }); }).join('') + '</div>';
    var diensten = '<div class="hv-rijen">' +
      o.rij({ icoon: 'cctv', naam: t('Записи камер', 'Camera-opnamen'), sub: t('3 камери пишуть безперервно', '3 camera’s nemen doorlopend op'), waarde: '<span class="hv-bo-ok">' + HV.icoon('check', { maat: 's' }) + h(aan ? t('працює', 'actief') : t('зупинено', 'gestopt')) + '</span>' }) +
      o.rij({ icoon: 'archive', naam: t('Резервна копія', 'Reservekopie'), sub: t('остання ', 'laatste ') + HV.tijd(laatste) + ' · ' + t('наступна ', 'volgende ') + HV.tijd(volgende), waarde: '<span class="hv-bo-ok">' + HV.icoon('check', { maat: 's' }) + h(t('успішно', 'gelukt')) + '</span>' }) +
      o.rij({ icoon: 'film', naam: t('Медіасервер', 'Mediaserver'), sub: t('для телевізора й колонок', 'voor de tv en de speakers'), waarde: h(aan ? t('працює', 'actief') : t('зупинено', 'gestopt')) }) + '</div>';
    var knop = knoppen(o.knop({ tekst: t('Створити копію зараз', 'Nu een reservekopie maken'), icoon: 'archive', soort: 'hoofd', actie: 'bo-kopie', gegevens: { doel: a.id }, uit: !aan }) +
      (aan ? o.knop({ tekst: t('Вимкнути живлення…', 'Stroom uitzetten…'), icoon: 'power-off', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'false' } }) : o.knop({ tekst: t('Увімкнути', 'Aanzetten'), icoon: 'power', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: 'true' } }))) +
      '<p class="hv-bo-regel">' + o.risico('gevaarlijk') + h(t(' Вимкнення живлення — рейка утримання. ', ' Stroom uitzetten — met de houdrail. ')) + o.gevolg(HV.p(HV.gevaar.actie('voeding.uit').gevolg), { kop: t('Вимкнути живлення', 'Stroom uitzetten') }) + '</p>';
    return blad(o.kaart({ inhoud: uit + knop }) + o.kaart({ titel: t('Служби', 'Diensten'), k: 'bo-nas-diensten', inhoud: diensten }) + o.kaart({ titel: t('Диски', 'Schijven'), k: 'bo-nas-schijven', inhoud: schijven }) + waarom(a));
  }
  function nasGeschiedenis(ctx, a) {
    var w = ctx.staat, van = w.tijd - 30 * DAG, punten = [];
    for (var i = 0; i <= 30; i++) punten.push([van + i * DAG, rond(a.st.vol - (30 - i) * 0.09 + (i % 7 === 6 ? 0.2 : 0), 1)]);
    punten[30][1] = a.st.vol;
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.lijn({ id: 'bo-nasvol-' + a.id, titel: t('Заповнення за 30 днів', 'Bezetting in 30 dagen'), eenheid: '%', hoogte: 120, x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 3, dagLabel), format: dagLabel },
      reeksen: [{ naam: t('основний том', 'hoofdvolume'), toon: 'neutraal', vlak: true, punten: punten }], samenvatting: t('≈ 0,1 % на день: переважно фото з телефонів.', '≈ 0,1 % per dag: vooral foto’s van de telefoons.') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  var INKT = [['cyaan', ['Блакитне', 'Cyaan'], 62], ['magenta', ['Пурпурове', 'Magenta'], 48], ['geel', ['Жовте', 'Geel'], 14], ['zwart', ['Чорне', 'Zwart'], 81]];
  function printerBediening(ctx, a) {
    var st = a.st, b = o.beeld(a), aan = HV.kijk.isAan(a), rij = Number(st.wachtrij) || 0, papier = st.papier != null ? Number(st.papier) : 64;
    var uit = kop({ teken: teken(a, b), woord: a.wacht ? HV.woord.wacht() : aan ? (rij ? t('Друкує', 'Print') : t('Готовий', 'Gereed')) : t('Спить', 'Slaapt'),
      getal: rij ? h(String(rij)) : '', sub: h(rij ? t('сторінок у черзі', 'pagina’s in de wachtrij') : t('черга порожня', 'de wachtrij is leeg')),
      chips: INKT.some(function (x) { return x[2] < 15; }) ? o.chip({ icoon: 'triangle-alert', toon: 'let-op', tekst: t('мало жовтого чорнила', 'weinig gele inkt') }) : '' });
    uit += knoppen(o.knop({ tekst: t('Тестова сторінка', 'Testpagina'), icoon: 'printer', soort: 'hoofd', actie: 'bo-afdruk', gegevens: { doel: a.id } }) +
      (rij ? o.knop({ tekst: t('Очистити чергу', 'Wachtrij legen'), icoon: 'list-x', actie: 'bo-onderhoud', gegevens: { doel: a.id, veld: 'wachtrij', waarde: 0 } }) : '') +
      o.knop({ tekst: aan ? t('Приспати', 'Laten slapen') : t('Розбудити', 'Wekken'), icoon: aan ? 'moon' : 'sunrise', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'aan', waarde: aan ? 'false' : 'true' } }));
    var inkt = o.kaart({ titel: t('Чорнило й папір', 'Inkt en papier'), k: 'bo-inkt', inhoud: '<div class="hv-bo-inkt">' + INKT.map(function (x) { return balk({ label: HV.p(x[1]), waarde: x[2], laag: 15 }); }).join('') + '</div>' +
      balk({ label: t('Лоток паперу', 'Papierlade'), icoon: 'file', waarde: papier / 150 * 100, tekst: h(papier + ' ' + t('з', 'van') + ' 150'), laag: 10 }) +
      knoppen(o.knop({ tekst: t('Папір додано', 'Papier bijgevuld'), icoon: 'file-plus', soort: 'stil', actie: 'bo-onderhoud', gegevens: { doel: a.id, veld: 'papier', waarde: 150 } })) });
    return blad(o.kaart({ inhoud: uit }) + inkt + waarom(a));
  }
  function printerGeschiedenis(ctx, a) {
    var w = ctx.staat, vandaag = middernacht(w.tijd), z = zaadVan(a.id), staven = [];
    for (var d = 13; d >= 0; d--) staven.push({ label: dagLabel(vandaag - d * DAG), waarde: Math.max(0, Math.round(6 + golf(z, d * 2) * 7)), toon: 'neutraal', nu: d === 0 });
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.staven({ id: 'bo-paginas-' + a.id, titel: t('Сторінок за день', 'Pagina’s per dag'), eenheid: t('стор.', 'p.'), decimalen: 0, tikken: 3, hoogte: 110, staven: staven,
      samenvatting: t('Більше друкують у будні — шкільні завдання (симуляція).', 'Op doordeweekse dagen meer — huiswerk (simulatie).') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  var NETNAAM = 'Wilgenlaan-12', GASTNAAM = 'Wilgenlaan-gast';
  function routerBediening(ctx, a) {
    var w = ctx.staat, st = a.st, herstart = st.herstart && w.tijd - st.herstart < 3 * MIN;
    var gast = bool(st.gastnet);
    var klanten = HV.kijk.alle(function (x) { return PROTOCOL[x.soort] === 'Wi-Fi' || KABEL[x.soort]; }).filter(function (x) { return x.id !== 'router'; }).slice(0, 6);
    var uit = kop({ teken: o.schakel({ aan: true, icoon: 'router', toon: 'aan', staat: a.wacht ? 'wacht' : herstart ? 'bezig' : null, aria: naamVan(a) }), woord: herstart ? t('Перезапускається', 'Herstart') : t('Мережа працює', 'Netwerk werkt'),
      getal: h(String(st.clients)), sub: h(HV.meervoud(st.clients, ['пристрій у мережі', 'пристрої в мережі', 'пристроїв у мережі'], ['apparaat in het netwerk', 'apparaten in het netwerk'])),
      chips: o.chip({ icoon: 'globe', toon: 'ok', tekst: t('інтернет є', 'internet werkt') }) + o.chip({ icoon: 'clock', tekst: t('без перерви 12 днів', '12 dagen zonder onderbreking') }) });
    uit += getallen([{ label: t('Завантаження', 'Download'), waarde: HV.maat(486, t('Мбіт/с', 'Mbit/s')) }, { label: t('Віддача', 'Upload'), waarde: HV.maat(47, t('Мбіт/с', 'Mbit/s')) }, { label: t('Затримка', 'Vertraging'), waarde: HV.maat(9, t('мс', 'ms')) }]);
    uit += '<div class="hv-bo-banden">' + o.chip({ icoon: 'wifi', tekst: '2,4 ' + t('ГГц', 'GHz') + ' · 14' }) + o.chip({ icoon: 'wifi', tekst: '5 ' + t('ГГц', 'GHz') + ' · 9' }) + o.chip({ icoon: 'network', tekst: t('мережа ', 'netwerk ') + NETNAAM }) + '</div>';
    uit += knoppen(o.knop({ tekst: t('Перезапустити…', 'Herstarten…'), icoon: 'rotate-ccw', actie: 'doe', gegevens: { doel: a.id, mogelijkheid: 'herstart', waarde: '1' }, uit: herstart })) +
      '<p class="hv-bo-regel">' + o.risico('gevaarlijk') + h(t(' Перезапуск — рейка утримання. ', ' Herstarten — met de houdrail. ')) + o.gevolg(HV.p(HV.gevaar.actie('router.herstart').gevolg), { kop: t('Перезапустити', 'Herstarten') }) + '</p>';
    var lijst = o.kaart({ titel: t('Хто в мережі', 'Wie er op het netwerk zit'), k: 'bo-klanten', extra: '<span class="hv-blok__teller">' + st.clients + '</span>', inhoud: '<div class="hv-rijen">' +
      o.rij({ icoon: 'smartphone', naam: t('Телефон Олени', 'Telefoon van Olena'), sub: '5 ' + t('ГГц', 'GHz') + ' · ' + t('удома', 'thuis'), waarde: h('Wi-Fi') }) +
      klanten.map(function (x) { return o.rij({ icoon: (HV.paspoort.soorten[x.soort] || {}).icoon || 'circle', naam: HV.p(x.naam), sub: HV.p(HV.staat.kamer(x.kamer).naam), waarde: h(KABEL[x.soort] ? t('кабель', 'kabel') : 'Wi-Fi'), actie: 'blad', gegevens: { blad: 'apparaat:' + x.id } }); }).join('') +
      '</div><p class="hv-bo-noot">' + h(t('Ще ' + (st.clients - klanten.length - 1) + ' пристроїв — датчики через вузол зв’язку й телефони.', 'Nog ' + (st.clients - klanten.length - 1) + ' apparaten — sensoren via de hub en telefoons.')) + '</p>' });
    var gastKaart = o.kaart({ titel: t('Гостьова мережа', 'Gastnetwerk'), k: 'bo-gast', extra: o.gevolg(t('Що станеться: з’явиться окрема мережа для гостей; вони матимуть інтернет, але не бачитимуть пристроїв дому. Пов’язано з: роль «Гість» у «Люди й доступ». Як повернути: вимкніть перемикач.', 'Wat er gebeurt: er komt een apart netwerk voor gasten; zij krijgen internet, maar zien de apparaten van het huis niet. Hangt samen met: de rol ‘Gast’ in ‘Mensen en toegang’. Terugdraaien: zet de schakelaar uit.'), { kop: t('Гостьова мережа', 'Gastnetwerk') }), inhoud:
      '<div class="hv-bo-schakelrij">' + o.schakel({ aan: gast, icoon: 'wifi', toon: 'aan', actie: 'bo-wissel', gegevens: { doel: a.id, veld: 'gastnet', standaard: 'false' }, aria: t('Гостьова мережа', 'Gastnetwerk') }) +
      '<span class="hv-bo-schakelrij__tekst"><span>' + h(gast ? t('Увімкнено', 'Aan') : t('Вимкнено', 'Uit')) + '</span><span>' + h(gast ? t('гості під’єднуються за кодом нижче', 'gasten verbinden met de code hieronder') : t('увімкніть перед приходом гостей', 'zet aan vóór de gasten komen')) + '</span></span></div>' +
      (gast ? '<div class="hv-bo-qr">' + qr(GASTNAAM) + '<div><p class="hv-bo-noot">' + h(t('Наведіть камеру телефона — під’єднання без пароля вручну.', 'Richt de camera van de telefoon — verbinden zonder het wachtwoord te typen.')) + '</p><p><code>' + h(GASTNAAM) + '</code></p></div></div>' : '') });
    return blad(o.kaart({ inhoud: uit }) + lijst + gastKaart + waarom(a));
  }
  /** Детермінований візерунок QR-коду для мережі гостей (макет, не справжнє кодування). */
  function qr(tekst) {
    var n = 21, z = zaadVan(tekst), cellen = '';
    var oog = function (x, y) { return (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7); };
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var aan;
      if (oog(x, y)) { var lx = x >= n - 7 ? x - (n - 7) : x, ly = y >= n - 7 ? y - (n - 7) : y; aan = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4); }
      else aan = ((x * 7 + y * 13 + z + x * y) % 5) < 2;
      if (aan) cellen += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    }
    return '<svg class="hv-bo-qr__code" viewBox="-1 -1 23 23" role="img" aria-label="' + h(t('QR-код гостьової мережі', 'QR-code van het gastnetwerk')) + '">' + cellen + '</svg>';
  }
  function routerGeschiedenis(ctx, a) {
    var w = ctx.staat, van = w.tijd - DAG, z = zaadVan(a.id), af = [], op = [];
    for (var i = 0; i <= 48; i++) {
      var x = van + i * 30 * MIN, u = HV.uur(x), avond = u > 18 && u < 23 ? 1 : 0, werk = u > 9 && u < 17 ? 0.5 : 0;
      af.push([x, Math.round(12 + avond * 140 + werk * 60 + Math.abs(golf(z, i)) * 30)]);
      op.push([x, Math.round(3 + werk * 18 + avond * 6 + Math.abs(golf(z + 5, i)) * 6)]);
    }
    return blad(o.kaart({ k: 'bo-hist', inhoud: HV.grafiek.lijn({ id: 'bo-verkeer-' + a.id, titel: t('Трафік за добу', 'Verkeer dit etmaal'), eenheid: t('Мбіт/с', 'Mbit/s'), hoogte: 130, nu: w.tijd, x: { min: van, max: w.tijd, tikken: tikken(van, w.tijd, 4), format: HV.tijd },
      reeksen: [{ naam: t('завантаження', 'download'), toon: 'net-in', vlak: true, punten: af }, { naam: t('віддача', 'upload'), toon: 'net-uit', punten: op }],
      samenvatting: t('Увечері найбільше — фільми; удень — відеодзвінки з кабінету (симуляція).', '’s Avonds het meest — films; overdag — videogesprekken uit de werkkamer (simulatie).') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }

  // ───────────────────────── 9. ІЧ-пульт і кнопка сцен ─────────────────────────
  var IR_DOELEN = [['airco', ['Кондиціонер', 'Airco'], 'snowflake'], ['tv', ['Телевізор', 'Televisie'], 'tv']];
  var AIRCO_MODI = ['koelen', 'verwarmen', 'drogen'];
  var VENTILATOR = ['auto', '1', '2', '3'];
  var ventNaam = function (v) { return v === 'auto' ? ['авто', 'auto'] : ['швидкість ' + v, 'stand ' + v]; };
  function irToets(p) {
    return '<button type="button" class="hv-bo-toets' + (p.klas ? ' ' + p.klas : '') + '" data-actie="bo-ir" data-doel="' + h(p.doel) + '" data-toets="' + h(p.toets) + '" aria-label="' + h(p.aria) + '">' + HV.icoon(p.icoon) + (p.tekst ? '<span>' + h(p.tekst) + '</span>' : '') + '</button>';
  }
  function irBediening(ctx, a) {
    var st = a.st, keuze = HV.ui.lees('bo-ir-doel', 'airco'), doel = A(keuze);
    var uit = kop({ teken: o.schakel({ aan: !!a.wacht, icoon: 'radio-tower', toon: 'neutraal', staat: a.wacht ? 'wacht' : null, aria: naamVan(a) }), woord: a.wacht ? t('Надсилає сигнал', 'Verstuurt een signaal') : t('Готовий', 'Gereed'),
      sub: t('останній сигнал: ', 'laatste signaal: ') + '<strong>' + h(HV.p(st.laatst)) + '</strong>', chips: o.chip({ icoon: 'eye-off', tekst: t('без зворотного зв’язку', 'zonder terugmelding') }) });
    uit += veld(t('Керований пристрій', 'Bediend apparaat'), o.segment({ label: t('Керований пристрій', 'Bediend apparaat'), waarde: keuze, actie: 'ui', gegevens: { naam: 'bo-ir-doel' }, opties: IR_DOELEN.map(function (d) { return { id: d[0], label: HV.p(d[1]), icoon: d[2] }; }) }));
    var pad = '';
    if (keuze === 'airco') {
      var s = doel.st;
      pad = '<div class="hv-bo-pult__scherm"><span>' + h(s.aan ? HV.p(HV.waardeNaam[s.modus] || [s.modus, s.modus]) : t('вимкнено', 'uit')) + '</span><strong>' + HV.maat(s.doel, '°C') + '</strong><span>' + h(t('вентилятор: ', 'ventilator: ') + HV.p(ventNaam(String(s.ventilator)))) + '</span></div>' +
        '<div class="hv-bo-pult__toetsen hv-bo-pult__toetsen--vier">' + irToets({ doel: 'airco', toets: 'aan', icoon: 'power', tekst: s.aan ? t('Вимкнути', 'Uit') : t('Увімкнути', 'Aan'), aria: t('Живлення кондиціонера', 'Aan/uit airco'), klas: 'is-hoofd' }) +
        irToets({ doel: 'airco', toets: 'modus', icoon: 'repeat', tekst: t('Режим', 'Stand'), aria: t('Наступний режим', 'Volgende stand') }) +
        irToets({ doel: 'airco', toets: 'min', icoon: 'minus', tekst: t('Холодніше', 'Kouder'), aria: t('Ціль нижче на 1 °C', 'Doel 1 °C lager') }) +
        irToets({ doel: 'airco', toets: 'plus', icoon: 'plus', tekst: t('Тепліше', 'Warmer'), aria: t('Ціль вище на 1 °C', 'Doel 1 °C hoger') }) +
        irToets({ doel: 'airco', toets: 'ventilator', icoon: 'fan', tekst: t('Вентилятор', 'Ventilator'), aria: t('Швидкість вентилятора', 'Ventilatorstand') }) + '</div>';
    } else {
      var tv = doel.st;
      pad = '<div class="hv-bo-pult__scherm"><span>' + h(tv.aan ? t('увімкнено', 'aan') : t('вимкнено', 'uit')) + '</span><strong>' + h(HV.p(HV.waardeNaam[tv.bron] || [tv.bron, tv.bron])) + '</strong><span>' + h(t('гучність ', 'volume ') + tv.volume + ' %') + '</span></div>' +
        '<div class="hv-bo-pult__toetsen">' + irToets({ doel: 'tv', toets: 'aan', icoon: 'power', tekst: tv.aan ? t('Вимкнути', 'Uit') : t('Увімкнути', 'Aan'), aria: t('Живлення телевізора', 'Aan/uit tv'), klas: 'is-hoofd' }) +
        irToets({ doel: 'tv', toets: 'bron', icoon: 'tv', tekst: t('Джерело', 'Bron'), aria: t('Наступне джерело', 'Volgende bron') }) +
        irToets({ doel: 'tv', toets: 'stil', icoon: 'volume-x', tekst: t('Без звуку', 'Dempen'), aria: t('Вимкнути звук', 'Geluid dempen') }) +
        irToets({ doel: 'tv', toets: 'vol-', icoon: 'volume-1', tekst: t('Тихіше', 'Zachter'), aria: t('Гучність нижче', 'Volume lager') }) +
        irToets({ doel: 'tv', toets: 'vol+', icoon: 'volume-2', tekst: t('Гучніше', 'Harder'), aria: t('Гучність вище', 'Volume hoger') }) +
        irToets({ doel: 'tv', toets: 'kan-', icoon: 'chevron-down', tekst: t('Канал −', 'Kanaal −'), aria: t('Попередній канал', 'Vorig kanaal') }) +
        irToets({ doel: 'tv', toets: 'kan+', icoon: 'chevron-up', tekst: t('Канал +', 'Kanaal +'), aria: t('Наступний канал', 'Volgend kanaal') }) + '</div>';
    }
    uit += '<div class="hv-bo-pult" data-k="bo-pult">' + pad + '</div>';
    uit += '<p class="hv-bo-regel">' + HV.icoon('info', { maat: 's' }) + h(t(' Пульт не чує відповіді: стан ' + (keuze === 'airco' ? 'кондиціонера' : 'телевізора') + ' припущено з останньої команди.', ' De zender hoort geen antwoord: de toestand van ' + (keuze === 'airco' ? 'de airco' : 'de tv') + ' is afgeleid uit de laatste opdracht.')) + '</p>';
    var correctie = o.kaart({ titel: t('Виправити стан', 'Toestand corrigeren'), k: 'bo-correctie', extra: o.gevolg(t('Що станеться: дім лише запам’ятає справжній стан, сигнал не надсилається. Пов’язано з: правила й плитки, що покладаються на цей стан. Як повернути: оберіть інше значення.', 'Wat er gebeurt: het huis onthoudt alleen de echte toestand, er gaat geen signaal uit. Hangt samen met: regels en tegels die op deze toestand leunen. Terugdraaien: kies de andere waarde.'), { kop: t('Виправити стан', 'Toestand corrigeren') }), inhoud:
      '<p class="hv-bo-noot">' + h(t('Якщо хтось увімкнув ' + (keuze === 'airco' ? 'кондиціонер' : 'телевізор') + ' рідним пультом, скажіть дому, як насправді:', 'Zette iemand ' + (keuze === 'airco' ? 'de airco' : 'de tv') + ' aan met de eigen afstandsbediening, vertel het huis hoe het echt is:')) + '</p>' +
      o.segment({ label: t('Справжній стан', 'Echte toestand'), waarde: doel.st.aan ? 'aan' : 'uit', actie: 'bo-correctie', gegevens: { doel: doel.id }, opties: [{ id: 'aan', label: t('Насправді ввімкнено', 'Staat echt aan') }, { id: 'uit', label: t('Насправді вимкнено', 'Staat echt uit') }] }) });
    var leren = o.kaart({ titel: t('Кнопки пульта', 'Knoppen van de zender'), k: 'bo-leren', inhoud: '<div class="hv-rijen">' + IR_DOELEN.map(function (d) { return o.rij({ icoon: d[2], naam: HV.p(d[1]), sub: d[0] === 'airco' ? t('5 кнопок із бібліотеки виробника', '5 knoppen uit de bibliotheek van de fabrikant') : t('7 кнопок із бібліотеки виробника', '7 knoppen uit de bibliotheek van de fabrikant'), actie: 'blad', gegevens: { blad: 'apparaat:' + d[0] } }); }).join('') + '</div>' +
      '<p class="hv-bo-noot">' + o.later(t('пізніше', 'later')) + ' ' + h(t('Навчання власних кнопок з’явиться разом зі справжнім адаптером.', 'Eigen knoppen aanleren komt met de echte adapter.')) + '</p>' });
    return blad(o.kaart({ inhoud: uit }) + correctie + leren + waarom(a));
  }

  var GEBAREN = [['kort', ['Один натиск', 'Eén keer drukken'], ['одинарний натиск', 'enkel gedrukt'], 'circle-dot'], ['dubbel', ['Подвійний натиск', 'Dubbel drukken'], ['подвійний натиск', 'dubbel gedrukt'], 'circle-dot-dashed'], ['lang', ['Довге утримання', 'Lang vasthouden'], ['довге утримання', 'lang vastgehouden'], 'hand']];
  var STANDAARD_KNOP = 'kort:avond;dubbel:keukenlicht;lang:welterusten';
  function toewijzing(a) { var uit = {}; String(a.st.toewijzing || STANDAARD_KNOP).split(';').forEach(function (d) { var p = d.split(':'); if (p[0]) uit[p[0]] = p[1] || 'geen'; }); return uit; }
  function doelOpties(w) {
    return [{ id: 'geen', naam: ['Нічого', 'Niets'], icoon: 'circle-off' }].concat(w.scenes.map(function (s) { return { id: s.id, naam: s.naam, icoon: s.icoon, scene: true }; }))
      .concat([{ id: 'keukenlicht', naam: ['Лампа над столом', 'Lamp boven de tafel'], icoon: 'lightbulb' }, { id: 'hallicht', naam: ['Світло в передпокої', 'Lamp in de hal'], icoon: 'lightbulb' }]);
  }
  var toewijzingFmt = function (v) {
    var w = W(), map = {}; String(v).split(';').forEach(function (d) { var p = d.split(':'); map[p[0]] = p[1]; });
    var naam = function (id) { var x = doelOpties(w).filter(function (y) { return y.id === id; })[0]; return x ? x.naam : ['—', '—']; };
    return [GEBAREN.map(function (g) { return g[2][0] + ' — ' + naam(map[g[0]])[0]; }).join(', '), GEBAREN.map(function (g) { return g[2][1] + ' — ' + naam(map[g[0]])[1]; }).join(', ')];
  };
  function knopBediening(ctx, a) {
    var w = ctx.staat, st = a.st, map = toewijzing(a), opties = doelOpties(w);
    var laatstOm = st.laatstOm || (w.tijd - 9 * MIN);
    var uit = kop({ teken: o.schakel({ aan: false, icoon: 'circle-dot', toon: 'neutraal', aria: naamVan(a) }), woord: t('Остання дія', 'Laatste druk'), groot: hoofdletter(HV.p(st.laatst)),
      sub: h(HV.tijd(laatstOm) + ' · ' + HV.oud(w.tijd - laatstOm) + t(' тому', ' geleden')), chips: o.chip({ icoon: (a.batterij || 0) < 15 ? 'battery-low' : 'battery-medium', tekst: t('батарейка ', 'batterij ') + a.batterij + ' %' }) });
    var rijen = GEBAREN.map(function (g) {
      var gekozen = map[g[0]] || 'geen';
      return '<div class="hv-bo-gebaar" data-k="bo-gebaar-' + g[0] + '"><div class="hv-bo-gebaar__kop">' + HV.icoon(g[3], { maat: 's' }) + '<span>' + h(HV.p(g[1])) + '</span>' +
        o.knop({ tekst: t('Натиснути', 'Drukken'), icoon: 'hand', klein: true, soort: 'stil', actie: 'bo-knop-druk', gegevens: { doel: a.id, gebaar: g[0] }, aria: t('Перевірити: ', 'Testen: ') + HV.p(g[1]) }) + '</div>' +
        '<div class="hv-filter hv-bo-gebaar__doelen" role="radiogroup" aria-label="' + h(HV.p(g[1])) + '">' + opties.map(function (x) {
          return o.chip({ filter: true, icoon: x.icoon, tekst: HV.p(x.naam), gekozen: x.id === gekozen, actie: 'bo-toewijs', gegevens: { doel: a.id, gebaar: g[0], waarde: x.id } });
        }).join('') + '</div></div>';
    }).join('');
    return blad(o.kaart({ inhoud: uit }) +
      o.kaart({ titel: t('Що робить кожен натиск', 'Wat elke druk doet'), k: 'bo-gebaren', extra: o.gevolg(t('Що станеться: натиск фізичної кнопки виконає обране від імені того, хто натиснув, — як дотик до екрана. Пов’язано з: небезпечні кроки сцени без дозволу пропускаються. Як повернути: оберіть інше або «Нічого».', 'Wat er gebeurt: een druk op de fysieke knop voert het gekozene uit namens wie drukt — als een tik op het scherm. Hangt samen met: gevaarlijke stappen van een scène zonder toestemming worden overgeslagen. Terugdraaien: kies iets anders of ‘Niets’.'), { kop: t('Призначення', 'Toewijzing') }), inhoud: rijen }) +
      o.kaart({ titel: t('Батарея і зв’язок', 'Batterij en verbinding'), inhoud: voedingInhoud(a) }) + waarom(a));
  }

  // ───────────────────────── 10. Налаштування й історія — склад ─────────────────────────
  function paspoort(a, rijen) {
    return o.kaart({ titel: t('Пристрій', 'Apparaat'), k: 'bo-paspoort', inhoud: '<div class="hv-rijen">' + rijen.map(function (r) { return o.rij({ icoon: r[0], naam: HV.p(r[1]), waarde: h(HV.p(r[2])) }); }).join('') + '</div>' });
  }
  var PASPOORT = {
    gordijn: [['blinds', ['Мотор', 'Motor'], ['карнизний, акумулятор 6 міс.', 'railmotor, accu 6 mnd']], ['ruler', ['Ширина ходу', 'Looplengte'], ['2,4 м, калібровано', '2,4 m, gekalibreerd']]],
    jaloezie: [['blinds', ['Мотор', 'Motor'], ['у верхньому коробі', 'in de bovenbak']], ['rotate-3d', ['Нахил', 'Kanteling'], ['0–100 %, крок 5 %', '0–100 %, stap 5 %']]],
    garagedeur: [['warehouse', ['Привід', 'Aandrijving'], ['секційні ворота, ланцюг', 'sectionaaldeur, ketting']], ['scan-line', ['Захист', 'Beveiliging'], ['датчик перешкоди й кінцеві вимикачі', 'obstakelsensor en eindschakelaars']], ['timer', ['Хід', 'Looptijd'], ['≈ 14 с', '≈ 14 s']]],
    poort: [['fence', ['Привід', 'Aandrijving'], ['відкатні ворота, 4 м', 'schuifpoort, 4 m']], ['scan-line', ['Захист', 'Beveiliging'], ['фотоелементи на стовпах', 'fotocellen op de palen']], ['timer', ['Хід', 'Looptijd'], ['≈ 18 с', '≈ 18 s']]],
    wasmachine: [['washing-machine', ['Завантаження', 'Belading'], ['8 кг, 1400 об/хв', '8 kg, 1400 tpm']]], droger: [['wind', ['Тип', 'Soort'], ['тепловий насос, 8 кг', 'warmtepomp, 8 kg']]], vaatwasser: [['utensils', ['Місткість', 'Inhoud'], ['14 комплектів', '14 couverts']]],
    oven: [['microwave', ['Камера', 'Ovenruimte'], ['71 л, до 250 °C', '71 l, tot 250 °C']]], koelkast: [['refrigerator', ['Об’єм', 'Inhoud'], ['холодильник 240 л, морозилка 90 л', 'koelkast 240 l, vriezer 90 l']]], koffie: [['coffee', ['Тип', 'Soort'], ['автоматична, з кавомолкою', 'volautomaat met molen']]],
    computer: [['monitor', ['Тип', 'Soort'], ['настільний, 2 монітори', 'desktop, 2 monitoren']]], nas: [['hard-drive', ['Диски', 'Schijven'], ['2 × 8 ТБ, дзеркало', '2 × 8 TB, gespiegeld']]], printer: [['printer', ['Тип', 'Soort'], ['струменевий, кольоровий', 'inkjet, kleur']]],
    router: [['router', ['Мережа', 'Netwerk'], ['Wi-Fi 6, 2 діапазони', 'Wi-Fi 6, 2 banden']]], irzender: [['radio-tower', ['Дальність', 'Bereik'], ['кімната, 360°', 'kamer, 360°']]], sceneknop: [['circle-dot', ['Жести', 'Gebaren'], ['1, 2 натиски й утримання', '1, 2 keer en vasthouden']]]
  };
  function instellingen(ctx, a) {
    var eigen = PASPOORT[a.soort] ? paspoort(a, PASPOORT[a.soort]) : '';
    var ritueel = '';
    if (a.soort === 'garagedeur' || a.soort === 'poort') ritueel = o.kaart({ titel: t('Рівні дій', 'Niveaus van acties'), k: 'bo-niveaus', inhoud: '<div class="hv-rijen">' +
      o.rij({ icoon: 'door-open', naam: t('Відчинити', 'Openen'), waarde: o.risico('kritiek') }) + o.rij({ icoon: 'door-closed', naam: t('Зачинити', 'Sluiten'), waarde: o.risico('gevoelig') }) + o.rij({ icoon: 'square', naam: t('Стоп', 'Stop'), waarde: h(t('безпечний бік', 'veilige kant')) }) + '</div>' +
      knoppen(o.knop({ tekst: t('Показати в реєстрі', 'In register tonen'), icoon: 'shield-check', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-risico' } })) });
    return blad(eigen + ritueel + diagnose(ctx, a) + HV.bladDelen.instellingen(ctx, a));
  }
  function sensorInstellingen(ctx, a) {
    var s = SENSOR[a.soort];
    var ijk = a.st.ijking != null ? Number(a.st.ijking) : 0;
    var interval = String(a.st.interval || 60);
    var eigen = s ? o.kaart({ titel: t('Вимір', 'Meting'), k: 'bo-meting', extra: o.gevolg(t('Що станеться: поправка додається до кожного виміру; частіші звіти швидше садять батарейку. Пов’язано з: пороги й правила. Як повернути: поправка 0, звіт щохвилини.', 'Wat er gebeurt: de correctie telt bij elke meting op; vaker melden maakt de batterij sneller leeg. Hangt samen met: grenzen en regels. Terugdraaien: correctie 0, elke minuut melden.'), { kop: t('Вимір', 'Meting') }), inhoud:
      veld(t('Поправка', 'Correctie'), o.stapper({ actie: 'bo-ijking', gegevens: { doel: a.id }, stap: a.soort === 'temperatuur' ? 0.1 : 1, label: t('Поправка', 'Correctie'), waarde: HV.maat(ijk, s.eenheid, a.soort === 'temperatuur' ? 1 : 0), k: 'bo-ijk' })) +
      veld(t('Як часто звітувати', 'Hoe vaak melden'), o.segment({ label: t('Як часто звітувати', 'Hoe vaak melden'), waarde: interval, actie: 'bo-keuze', gegevens: { doel: a.id, veld: 'interval' }, opties: [{ id: '30', label: '30 ' + t('с', 's') }, { id: '60', label: '1 ' + t('хв', 'min') }, { id: '300', label: '5 ' + t('хв', 'min') }] })) }) : '';
    return blad(eigen + diagnose(ctx, a) + HV.bladDelen.instellingen(ctx, a));
  }
  function sensorGeschiedenis(ctx, a) { return blad(o.kaart({ k: 'bo-week', inhoud: weekGrafiek(a) }) + HV.bladDelen.geschiedenis(ctx, a)); }
  function bewegingGeschiedenis(ctx, a) {
    var w = ctx.staat, vandaag = middernacht(w.tijd), z = zaadVan(a.id), staven = [];
    for (var d = 6; d >= 0; d--) staven.push({ label: dagLabel(vandaag - d * DAG), waarde: d === 0 ? bewegingBlok(ctx, a).n : Math.round(34 + golf(z, d * 3) * 12), toon: 'aan', nu: d === 0 });
    return blad(o.kaart({ k: 'bo-week', inhoud: HV.grafiek.staven({ id: 'bo-bewweek-' + a.id, titel: t('Спрацювань за день', 'Meldingen per dag'), eenheid: t('разів', 'keer'), decimalen: 0, tikken: 1, hoogte: 110, staven: staven,
      samenvatting: t('Сьогоднішня доба ще не завершилася.', 'Vandaag is nog niet voorbij.') }) }) + HV.bladDelen.geschiedenis(ctx, a));
  }
  function standaardGeschiedenis(ctx, a) { return blad(HV.bladDelen.geschiedenis(ctx, a)); }

  // ───────────────────────── 11. Реєстрація ─────────────────────────
  function registreer(soort, bediening, geschiedenis, instel) {
    HV.blad({ soort: soort, past: function (a) { return a.soort === soort; }, delen: { bediening: bediening, geschiedenis: geschiedenis || standaardGeschiedenis, instellingen: instel || instellingen } });
  }
  ['temperatuur', 'vocht', 'co2', 'lichtsterkte'].forEach(function (s) { registreer(s, sensorBediening, sensorGeschiedenis, sensorInstellingen); });
  registreer('beweging', bewegingBediening, bewegingGeschiedenis, sensorInstellingen);
  registreer('aanwezigheid', aanwezigBediening, bewegingGeschiedenis, sensorInstellingen);
  registreer('contact', contactBediening, bewegingGeschiedenis, sensorInstellingen);
  registreer('batterij', batterijBediening, standaardGeschiedenis, sensorInstellingen);
  registreer('gordijn', zonweringBediening, zonweringGeschiedenis);
  registreer('jaloezie', zonweringBediening, zonweringGeschiedenis);
  registreer('garagedeur', ingangBediening, ingangGeschiedenis);
  registreer('poort', ingangBediening, ingangGeschiedenis);
  ['wasmachine', 'droger', 'vaatwasser'].forEach(function (s) { registreer(s, programmaBediening, programmaGeschiedenis); });
  registreer('oven', ovenBediening, ovenGeschiedenis);
  registreer('koelkast', koelkastBediening, koelkastGeschiedenis);
  registreer('koffie', koffieBediening);
  registreer('computer', computerBediening);
  registreer('nas', nasBediening, nasGeschiedenis);
  registreer('printer', printerBediening, printerGeschiedenis);
  registreer('router', routerBediening, routerGeschiedenis);
  registreer('irzender', irBediening);
  registreer('sceneknop', knopBediening, standaardGeschiedenis, sensorInstellingen);

  // ───────────────────────── 12. Дії ─────────────────────────
  var app = function (g) { return HV.staat.apparaat(g.doel); };

  // Значення налаштувань словами для Журналу: [uk, nl].
  var KEUZE_FMT = {
    gevoeligheid: function (v) { return ({ laag: ['низька', 'laag'], midden: ['середня', 'midden'], hoog: ['висока', 'hoog'] })[v] || [v, v]; },
    vertraging: function (v) { return Number(v) >= 60 ? [HV.getal(v / 60) + ' хв', HV.getal(v / 60) + ' min'] : [v + ' с', v + ' s']; },
    timeout: function (v) { return [v + ' хв', v + ' min']; },
    teLang: function (v) { return Number(v) ? (Number(v) >= 60 ? ['1 год', '1 u'] : [v + ' хв', v + ' min']) : ['вимкнено', 'uit']; },
    autoSluiten: function (v) { return Number(v) ? [v + ' хв', v + ' min'] : ['вимкнено', 'uit']; },
    interval: function (v) { return Number(v) >= 60 ? [HV.getal(v / 60) + ' хв', HV.getal(v / 60) + ' min'] : [v + ' с', v + ' s']; },
    modus: function (v) { var m = OVEN_MODI.filter(function (x) { return x[0] === v; })[0]; return m ? [m[1][0].toLowerCase(), m[1][1].toLowerCase()] : [v, v]; },
    drank: function (v) { var d = DRANKEN.filter(function (x) { return x[0] === v; })[0]; return d ? d[1] : [v, v]; },
    sterkte: function (v) { return ({ mild: ['легка', 'mild'], midden: ['середня', 'normaal'], sterk: ['міцна', 'sterk'] })[v] || [v, v]; }
  };
  var KEUZE_LABEL = { gevoeligheid: ['Чутливість', 'Gevoeligheid'], vertraging: ['Затримка скидання', 'Terugvaltijd'], timeout: ['Нікого через', 'Niemand na'], teLang: ['Нагадати, якщо відчинено довше', 'Herinneren als langer open dan'],
    autoSluiten: ['Автозачинення', 'Automatisch sluiten'], interval: ['Звіт', 'Melden'], modus: ['Режим', 'Stand'], drank: ['Напій', 'Drank'], sterkte: ['Міцність', 'Sterkte'] };
  HV.actie('bo-keuze', function (ctx, g) {
    var a = app(g); if (!a || String(a.st[g.veld]) === String(g.waarde)) return;
    zet(a, g.veld, g.waarde, KEUZE_LABEL[g.veld] || [g.veld, g.veld], KEUZE_FMT[g.veld] || function (v) { return [String(v), String(v)]; }, { oud: a.st[g.veld] != null ? a.st[g.veld] : null });
  });

  var WISSEL_LABEL = { automatisch: ['За сонцем', 'Op de zon'], melden: ['Сповістити, коли завершиться', 'Melden als het klaar is'], kinderslot: ['Блокування від дітей', 'Kinderslot'], supervries: ['Посилене заморожування', 'Supervriezen'],
    vakantie: ['Режим відпустки', 'Vakantiestand'], wol: ['Пробудження через мережу', 'Wekken via het netwerk'], gastnet: ['Гостьова мережа', 'Gastnetwerk'] };
  HV.actie('bo-wissel', function (ctx, g) {
    var a = app(g); if (!a) return;
    var nu = a.st[g.veld] == null ? bool(g.standaard) : bool(a.st[g.veld]);
    zet(a, g.veld, String(!nu), WISSEL_LABEL[g.veld] || [g.veld, g.veld], aanUitFmt, { oud: String(nu) });
  });

  HV.actie('bo-drempel', function (ctx, g) {
    var a = app(g), s = SENSOR[a.soort]; if (!a || !s) return;
    var nu = drempel(a, g.veld), stap = Number(g.stap) || s.stap;
    var nieuw = rond(klem(Number(nu) + Number(g.richting) * stap, s.min, s.max), s.dec);
    if (nieuw === nu) return;
    zet(a, g.veld, nieuw, g.veld === 'drempelHoog' ? ['Поріг «вище»', 'Grens ‘hoger’'] : ['Поріг «нижче»', 'Grens ‘lager’'], function (v) { return [HV.getal(v, s.dec) + ' ' + s.eenheid, HV.getal(v, s.dec) + ' ' + s.eenheid]; }, { oud: nu, icoon: 'bell-ring' });
  });
  HV.actie('bo-melden', function (ctx, g) {
    var a = app(g); if (!a) return;
    var nu = meldAan(a, g.veld);
    zet(a, g.veld, String(!nu), g.veld === 'meldHoog' ? ['Сповіщення «вище порогу»', 'Melding ‘boven de grens’'] : ['Сповіщення «нижче порогу»', 'Melding ‘onder de grens’'], aanUitFmt, { oud: String(nu), icoon: nu ? 'bell-off' : 'bell-ring' });
  });
  HV.actie('bo-ijking', function (ctx, g) {
    var a = app(g), s = SENSOR[a.soort]; if (!a || !s) return;
    var stap = Number(g.stap) || 0.1, nu = a.st.ijking != null ? Number(a.st.ijking) : 0, nieuw = rond(klem(nu + Number(g.richting) * stap, -5, 5), 1);
    zet(a, 'ijking', nieuw, ['Поправка виміру', 'Correctie van de meting'], function (v) { return [(v > 0 ? '+' : '') + HV.getal(v, 1) + ' ' + s.eenheid, (v > 0 ? '+' : '') + HV.getal(v, 1) + ' ' + s.eenheid]; }, { oud: nu });
  });

  HV.actie('bo-verbinding', function (ctx, g) {
    var a = app(g); if (!a) return;
    if (a.beschikbaar === 'onbereikbaar') { HV.acties.controleer(ctx, g); return; }
    HV.meld({ icoon: 'refresh-cw', titel: naamVan(a), tekst: t('Перевіряємо зв’язок…', 'Verbinding wordt getest…') });
    setTimeout(function () {
      var n = signaalSterkte(a), ms = 120 + (zaadVan(a.id) % 9) * 40;
      HV.logboek.voegToe({ maker: HV.mens(), wat: [a.naam[0] + ': перевірка зв’язку — відповідь за ' + ms + ' мс', a.naam[1] + ': verbindingstest — antwoord in ' + ms + ' ms'], soort: 'huis.apparaat', doel: a.id });
      HV.staat.wijzig(function (w) { if (a.beschikbaar === 'verouderd') { a.beschikbaar = 'ok'; } a.gezien = w.tijd; });
      HV.meld({ icoon: 'signal', titel: naamVan(a) + ': ' + t('зв’язок у порядку', 'verbinding in orde'), tekst: t('Відповідь за ' + ms + ' мс · сигнал ', 'Antwoord in ' + ms + ' ms · signaal ') + n + '/4' });
    }, 900);
  });

  HV.actie('bo-sensortest', function (ctx, g) {
    var a = app(g); if (!a) return;
    HV.meld({ icoon: 'scan-eye', titel: naamVan(a) + ': ' + t('режим перевірки', 'testmodus'), tekst: t('Пройдіться перед датчиком — індикатор блимне на кожен рух.', 'Loop voor de sensor langs — het lampje knippert bij elke beweging.') });
    setTimeout(function () {
      HV.staat.wijzig(function (w) { a.st.actief = true; a.st.laatst = 0; a.gezien = w.tijd; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: [a.naam[0] + ': перевірка — рух зафіксовано', a.naam[1] + ': test — beweging gezien'], soort: 'huis.apparaat', doel: a.id });
      HV.meld({ icoon: 'check', titel: naamVan(a) + ': ' + t('рух зафіксовано', 'beweging gezien'), tekst: t('Датчик працює. Режим перевірки вимкнеться сам за хвилину.', 'De sensor werkt. De testmodus gaat over een minuut vanzelf uit.') });
    }, 1600);
  });

  HV.actie('bo-batterij', function (ctx, g) {
    var a = app(g); if (!a) return;
    zet(a, 'waarde', 100, ['Батарейку замінено', 'Batterij vervangen'], function (v) { return [v + ' %', v + ' %']; }, { oud: a.st.waarde, icoon: 'battery-full' });
  });

  // Штори, жалюзі, ворота: «Стоп» — нова команда «лишитися тут» замінює хід
  HV.actie('bo-stop', function (ctx, g) {
    var a = app(g); if (!a) return;
    if (!a.wacht || a.wacht.fase !== 'bezig') { HV.meld({ icoon: 'square', titel: naamVan(a), tekst: t('Зараз нічого не рухається.', 'Er beweegt nu niets.') }); return; }
    var mog = a.wacht.mogelijkheid, hier = Math.round(a.wacht.voortgang);
    if (mog === 'open') {
      var deel = Math.round((a.wacht.waarde ? hier : 100 - hier));
      zet(a, 'stop', deel, ['Зупинено посеред ходу', 'Gestopt halverwege'], function (v) { return ['відчинено на ' + v + ' %', 'open op ' + v + ' %']; },
        { zonderTerug: true, icoon: 'square', na: function (x) { x.st.open = deel > 0; x.st.deels = deel; x.st.sinds = HV.staat.w.tijd; } });
      return;
    }
    HV.doe({ doel: a.id, mogelijkheid: mog, waarde: Math.round(hier / 5) * 5 });
  });

  // Ворота: зачинення з відліком 5 с; скасування до кінця відліку
  HV.actie('bo-sluit', function (ctx, g) {
    var a = app(g); if (!a) return;
    if (!a.st.open) return;
    // роль перевіряємо до відліку, щоб не рахувати 5 с даремно (самі ворота все одно проходить HV.doe)
    var mag = HV.gevaar.rolMag(HV.rol(), HV.gevaar.actie('ingang.sluiten'));
    if (!mag.mag) { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(mag.reden), tekst: t('Попросіть власника або мешканця.', 'Vraag het de eigenaar of een bewoner.') }); return; }
    var tot = Date.now() + 5000;
    HV.ui.zet('bo-sluit-' + a.id, tot);
    clearInterval(sluitKlok[a.id]);
    sluitKlok[a.id] = setInterval(function () {
      var nu = HV.ui.lees('bo-sluit-' + a.id, null);
      if (nu !== tot) { clearInterval(sluitKlok[a.id]); return; }
      if (Date.now() >= tot) {
        clearInterval(sluitKlok[a.id]); HV.ui.zet('bo-sluit-' + a.id, null);
        HV.doe({ doel: a.id, mogelijkheid: 'open', waarde: false, waarom: ['відлік 5 с, перешкод немає', '5 s afgeteld, geen obstakel'] }).then(function (r) { if (r && r.ok) HV.staat.wijzig(function () { a.st.deels = null; }); });
      } else HV.teken();
    }, 250);
  });
  HV.actie('bo-sluit-stop', function (ctx, g) {
    var a = app(g); clearInterval(sluitKlok[g.doel]); HV.ui.zet('bo-sluit-' + g.doel, null);
    if (a) HV.meld({ icoon: 'x', titel: naamVan(a) + ': ' + t('зачинення скасовано', 'sluiten geannuleerd'), tekst: t('Ворота не рушили.', 'De poort heeft niet bewogen.') });
  });

  HV.actie('bo-kalibreer', function (ctx, g) {
    var a = app(g); if (!a) return;
    HV.meld({ icoon: 'ruler', titel: naamVan(a) + ': ' + t('калібрування', 'kalibreren'), tekst: t('Полотно пройде до кінця й назад, щоб виміряти хід.', 'Het doek loopt helemaal door en terug om de looproute te meten.') });
    var terug = Number(a.st.positie) || 0;
    HV.doe({ doel: a.id, mogelijkheid: 'positie', waarde: terug >= 50 ? 0 : 100, waarom: ['калібрування ходу', 'looproute kalibreren'], stil: true }).then(function (r) {
      if (r && r.ok) HV.doe({ doel: a.id, mogelijkheid: 'positie', waarde: terug, waarom: ['калібрування ходу', 'looproute kalibreren'], stil: true }).then(function (r2) {
        if (r2 && r2.ok) HV.meld({ icoon: 'check', titel: naamVan(a) + ': ' + t('калібровано', 'gekalibreerd'), tekst: t('Хід виміряно, полотно повернулося на ', 'Looproute gemeten, het doek staat weer op ') + terug + ' %.' });
      });
    });
  });

  // Техніка: програма, старт, план
  HV.actie('bo-programma', function (ctx, g) {
    var a = app(g); if (!a) return;
    var p = PROGRAMMA[a.soort].filter(function (x) { return x[0] === g.waarde; })[0];
    if (!p || programmaVan(a)[0] === p[0]) return;
    zet(a, 'keuze', p[0], ['Програма', 'Programma'], function (id) { var x = PROGRAMMA[a.soort].filter(function (y) { return y[0] === id; })[0]; return x ? x[1] : [id, id]; },
      { oud: programmaVan(a)[0], na: function (x) { x.st.programma = p[1]; } });
  });
  HV.actie('bo-start', function (ctx, g) { var a = app(g); if (a) startProgramma(a); });
  HV.actie('bo-plan', function (ctx, g) {
    var a = app(g); if (!a) return;
    var tijd = Number(g.waarde) || 0;
    bewaakPlannen();
    zet(a, 'plan', tijd || null, ['Відкладений старт', 'Uitgestelde start'], function (v) { return v ? ['о ' + HV.tijd(v), 'om ' + HV.tijd(v)] : ['скасовано', 'geannuleerd']; },
      { oud: a.st.plan || null, icoon: 'calendar-clock', na: function (x) { x.st.planDoor = tijd ? HV.mens() : null; } });
  });

  HV.actie('bo-aftel', function (ctx, g) {
    var a = app(g); if (!a) return;
    var m = Number(g.minuten) || 0;
    if (m && !HV.kijk.isAan(a)) { HV.meld({ icoon: 'timer', titel: naamVan(a), tekst: t('Прилад вимкнений — відлік не потрібен.', 'Het apparaat is uit — aftellen is niet nodig.') }); return; }
    HV.doe({ doel: a.id, mogelijkheid: 'aftel', waarde: m ? ctx.staat.tijd + m * MIN : null });
  });

  HV.actie('bo-vriezer', function (ctx, g) {
    var a = app(g); if (!a) return;
    var nu = a.st.vriezerDoel != null ? Number(a.st.vriezerDoel) : -18, nieuw = klem(nu + Number(g.richting) * (Number(g.stap) || 1), -24, -16);
    if (nieuw === nu) return;
    zet(a, 'vriezerDoel', nieuw, ['Ціль морозилки', 'Doel vriezer'], function (v) { return [HV.getal(v) + ' °C', HV.getal(v) + ' °C']; }, { oud: nu, icoon: 'snowflake' });
  });

  var ONDERHOUD_LABEL = { ontkalk: ['Накип видалено', 'Ontkalkt'], water: ['Бак води', 'Waterreservoir'], papier: ['Лоток паперу', 'Papierlade'], wachtrij: ['Черга друку', 'Wachtrij'] };
  HV.actie('bo-onderhoud', function (ctx, g) {
    var a = app(g); if (!a) return;
    var v = Number(g.waarde);
    var fmt = g.veld === 'ontkalk' ? function (x) { return [x + ' чашок до наступного', x + ' kopjes tot de volgende']; } : g.veld === 'papier' ? function (x) { return [x + ' аркушів', x + ' vellen']; } : g.veld === 'wachtrij' ? function (x) { return [x + ' стор.', x + ' p.']; } : function (x) { return [x + ' %', x + ' %']; };
    zet(a, g.veld, v, ONDERHOUD_LABEL[g.veld] || [g.veld, g.veld], fmt, { oud: a.st[g.veld] != null ? a.st[g.veld] : null, zonderTerug: g.veld === 'ontkalk' });
  });

  HV.actie('bo-kopie', function (ctx, g) {
    var a = app(g); if (!a) return;
    zet(a, 'laatsteKopie', ctx.staat.tijd, ['Резервна копія', 'Reservekopie'], function (v) { return v ? ['запущено о ' + HV.tijd(v), 'gestart om ' + HV.tijd(v)] : ['—', '—']; }, { zonderTerug: true, icoon: 'archive', oud: null });
  });

  HV.actie('bo-afdruk', function (ctx, g) {
    var a = app(g); if (!a) return;
    var druk = function () { zet(a, 'afdruk', ctx.staat.tijd, ['Тестова сторінка', 'Testpagina'], function () { return ['надіслано до друку', 'naar de printer gestuurd']; }, { zonderTerug: true, icoon: 'printer', oud: null }); };
    if (!HV.kijk.isAan(a)) HV.doe({ doel: a.id, mogelijkheid: 'aan', waarde: true, stil: true, waarom: ['тестова сторінка', 'testpagina'] }).then(function (r) { if (r && r.ok) druk(); });
    else druk();
  });

  HV.actie('bo-signaal', function (ctx, g) {
    var a = app(g); if (!a) return;
    zet(a, 'signaalPc', g.wat, ['Екран', 'Scherm'], function () { return ['заблоковано', 'vergrendeld']; }, { zonderTerug: true, icoon: 'lock', oud: null });
  });

  // ІЧ-пульт: кнопка → дія на керованому пристрої (якщо в нього є стан) і запис сигналу на пульті
  var IR_SIGNAAL = {
    'airco:aan': function (d) { return d.st.aan ? ['Кондиціонер: вимкнути', 'Airco: uit'] : ['Кондиціонер: увімкнути', 'Airco: aan']; }, 'airco:modus': function () { return ['Кондиціонер: режим', 'Airco: stand']; },
    'airco:min': function () { return ['Кондиціонер: холодніше', 'Airco: kouder']; }, 'airco:plus': function () { return ['Кондиціонер: тепліше', 'Airco: warmer']; }, 'airco:ventilator': function () { return ['Кондиціонер: вентилятор', 'Airco: ventilator']; },
    'tv:aan': function (d) { return d.st.aan ? ['Телевізор: вимкнути', 'Televisie: uit'] : ['Телевізор: увімкнути', 'Televisie: aan']; }, 'tv:bron': function () { return ['Телевізор: джерело', 'Televisie: bron']; }, 'tv:stil': function () { return ['Телевізор: без звуку', 'Televisie: dempen']; },
    'tv:vol-': function () { return ['Телевізор: тихіше', 'Televisie: zachter']; }, 'tv:vol+': function () { return ['Телевізор: гучніше', 'Televisie: harder']; }, 'tv:kan-': function () { return ['Телевізор: канал −', 'Televisie: kanaal −']; }, 'tv:kan+': function () { return ['Телевізор: канал +', 'Televisie: kanaal +']; }
  };
  HV.actie('bo-ir', function (ctx, g) {
    var ir = A('irzender'), d = A(g.doel); if (!ir || !d) return;
    var sleutel = g.doel + ':' + g.toets, signaal = IR_SIGNAAL[sleutel] ? IR_SIGNAAL[sleutel](d) : [sleutel, sleutel];
    var waarom = ['через ІЧ-пульт', 'via de IR-zender'];
    var volg = null;
    if (sleutel === 'airco:aan' || sleutel === 'tv:aan') volg = { mogelijkheid: 'aan', waarde: !d.st.aan };
    else if (sleutel === 'airco:modus') volg = { mogelijkheid: 'modus', waarde: AIRCO_MODI[(AIRCO_MODI.indexOf(d.st.modus) + 1) % AIRCO_MODI.length] };
    else if (sleutel === 'airco:min' || sleutel === 'airco:plus') { var nd = klem(Number(d.st.doel) + (g.toets === 'plus' ? 1 : -1), 16, 30); if (nd !== Number(d.st.doel)) volg = { mogelijkheid: 'doel', waarde: nd }; }
    else if (sleutel === 'tv:vol-' || sleutel === 'tv:vol+') { var nv = klem(Number(d.st.volume) + (g.toets === 'vol+' ? 2 : -2), 0, 100); if (nv !== Number(d.st.volume)) volg = { mogelijkheid: 'volume', waarde: nv }; }
    else if (sleutel === 'tv:bron') { var bronnen = ['hdmi1', 'hdmi2', 'tv']; volg = { mogelijkheid: 'bron', waarde: bronnen[(bronnen.indexOf(d.st.bron) + 1) % bronnen.length] }; }
    var signaalNa = function (stil) { zet(ir, 'signaal', signaal, ['Сигнал', 'Signaal'], function (v) { return Array.isArray(v) ? v : [String(v), String(v)]; }, { stil: stil, zonderTerug: true, oud: ir.st.laatst, icoon: 'radio-tower' }); };
    if (sleutel === 'airco:ventilator') {
      var nvst = VENTILATOR[(VENTILATOR.indexOf(String(d.st.ventilator)) + 1) % VENTILATOR.length];
      zet(d, 'ventilator', nvst, ['Вентилятор', 'Ventilator'], ventNaam, { oud: String(d.st.ventilator), waarom: waarom, icoon: 'fan' }).then(function (r) { if (r && r.ok) signaalNa(true); });
      return;
    }
    if (volg) HV.doe({ doel: d.id, mogelijkheid: volg.mogelijkheid, waarde: volg.waarde, waarom: waarom }).then(function (r) { if (r && r.ok) signaalNa(true); });
    else signaalNa(false);
  });
  HV.actie('bo-correctie', function (ctx, g) {
    var d = app(g); if (!d) return;
    var aan = g.waarde === 'aan';
    if (!!d.st.aan === aan) return;
    zet(d, 'correctie', g.waarde, ['Стан виправлено вручну', 'Toestand met de hand gecorrigeerd'], function (v) { return v === 'aan' ? ['увімкнено', 'aan'] : ['вимкнено', 'uit']; },
      { oud: d.st.aan ? 'aan' : 'uit', zonderTerug: true, icoon: 'pencil', waarom: ['без сигналу, лише запам’ятати', 'zonder signaal, alleen onthouden'], na: function (x) { x.st.aan = aan; } });
  });

  // Кнопка сцен: призначення й перевірочний натиск
  HV.actie('bo-toewijs', function (ctx, g) {
    var a = app(g); if (!a) return;
    var map = toewijzing(a); if (map[g.gebaar] === g.waarde) return;
    var oud = GEBAREN.map(function (x) { return x[0] + ':' + (map[x[0]] || 'geen'); }).join(';');
    map[g.gebaar] = g.waarde;
    zet(a, 'toewijzing', GEBAREN.map(function (x) { return x[0] + ':' + (map[x[0]] || 'geen'); }).join(';'), ['Призначення кнопки', 'Toewijzing van de knop'], toewijzingFmt, { oud: oud, icoon: 'circle-dot' });
  });
  HV.actie('bo-knop-druk', function (ctx, g) {
    var a = app(g); if (!a) return;
    var gebaar = GEBAREN.filter(function (x) { return x[0] === g.gebaar; })[0], doel = toewijzing(a)[g.gebaar] || 'geen';
    var waarom = ['фізична кнопка: ' + gebaar[2][0], 'fysieke knop: ' + gebaar[2][1]];
    var noteer = function () { zet(a, 'druk', gebaar[2], ['Натиск', 'Druk'], function (v) { return Array.isArray(v) ? v : [String(v), String(v)]; }, { stil: true, zonderTerug: true, oud: a.st.laatst, na: function (x, w) { x.st.laatst = gebaar[2]; x.st.laatstOm = w.tijd; } }); };
    if (doel === 'geen') { noteer(); HV.meld({ icoon: 'circle-dot', titel: naamVan(a) + ': ' + HV.p(gebaar[2]), tekst: t('Нічого не призначено.', 'Er is niets toegewezen.') }); return; }
    var scene = ctx.staat.scenes.filter(function (s) { return s.id === doel; })[0];
    var p = scene ? HV.doe({ doel: 'scene:' + doel, mogelijkheid: 'start', waarde: true, waarom: waarom }) : HV.doe({ doel: doel, mogelijkheid: 'aan', waarde: !HV.kijk.isAan(A(doel)), waarom: waarom });
    p.then(function (r) { if (r && r.ok) noteer(); });
  });
})(window.HV = window.HV || {});
