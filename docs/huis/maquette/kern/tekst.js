// Tekst en opmaak: t(), taal, getallen met decimale komma, eenheden, tijd van het huis.
// Тексти інтерфейсу — завжди парою t('українська', 'nederlands').
(function (HV) {
  'use strict';

  var taal = 'uk';
  HV.taal = function () { return taal; };
  HV.zetTaal = function (x) { taal = x === 'nl' ? 'nl' : 'uk'; };

  /** Пара рядків → рядок поточною мовою. */
  HV.t = function (uk, nl) { return taal === 'nl' ? nl : uk; };
  /** Пара з даних ([uk, nl]) → рядок поточною мовою. */
  HV.p = function (paar) {
    if (paar == null) return '';
    if (typeof paar === 'string') return paar;
    return paar[taal === 'nl' ? 1 : 0];
  };

  var VERVANG = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Екранування тексту для HTML. Усе, що походить із даних, іде через HV.h. */
  HV.h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return VERVANG[c]; }); };

  // ── Getallen ──
  /** 21.5 → «21,5»; від'ємне — зі справжнім мінусом «−». */
  HV.getal = function (n, decimalen) {
    if (n == null || isNaN(n)) return '—';
    var d = decimalen == null ? 0 : decimalen;
    var abs = Math.abs(n).toFixed(d);
    if (parseFloat(abs) === 0) n = 0;
    var delen = abs.split('.');
    delen[0] = delen[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (n < 0 ? '−' : '') + delen.join(',');
  };
  /** Число з малою одиницею після нерозривного пробілу: HTML. */
  HV.maat = function (n, eenheid, decimalen) {
    return '<span class="hv-maat"><span class="hv-maat__getal">' + HV.getal(n, decimalen) + '</span><span class="hv-maat__eenheid"> ' + HV.h(eenheid) + '</span></span>';
  };
  /** Те саме простим текстом (для aria-valuetext, сповіщень, Журналу). */
  HV.maatTekst = function (n, eenheid, decimalen) { return HV.getal(n, decimalen) + ' ' + eenheid; };
  HV.euro = function (n, decimalen) { return '€ ' + HV.getal(n, decimalen == null ? 2 : decimalen); };
  HV.procent = function (n) { return HV.getal(Math.round(n)) + ' %'; };

  /** Множина: uk — три форми (1, 2–4, 5+), nl — дві. */
  HV.meervoud = function (n, uk, nl) {
    if (taal === 'nl') return n === 1 ? nl[0] : nl[1];
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return uk[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return uk[1];
    return uk[2];
  };
  var TEL_UK = ['нуль', 'одна', 'дві', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять', 'десять'];
  var TEL_UK_M = ['нуль', 'одній', 'двох', 'трьох', 'чотирьох', 'п’яти', 'шести', 'семи', 'восьми', 'дев’яти', 'десяти'];
  var TEL_NL = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien'];
  /** Число словом (до десяти); vorm 'waar' — місцевий відмінок для «у трьох кімнатах». */
  HV.telwoord = function (n, vorm) {
    if (n < 0 || n > 10) return String(n);
    if (taal === 'nl') return TEL_NL[n];
    return (vorm === 'waar' ? TEL_UK_M : TEL_UK)[n];
  };

  // ── Tijd van het huis ── (внутрішньо: мілісекунди «місцевого часу дому», читаються через getUTC*)
  var DAG_UK = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
  var DAG_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  var MAAND_UK = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  var MAAND_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  var twee = function (n) { return (n < 10 ? '0' : '') + n; };

  HV.huistijd = function (jaar, maand, dag, uur, minuut) { return Date.UTC(jaar, maand - 1, dag, uur || 0, minuut || 0); };
  HV.tijd = function (ms) { var d = new Date(ms); return twee(d.getUTCHours()) + ':' + twee(d.getUTCMinutes()); };
  HV.uur = function (ms) { var d = new Date(ms); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  HV.datum = function (ms) {
    var d = new Date(ms);
    return taal === 'nl'
      ? DAG_NL[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MAAND_NL[d.getUTCMonth()]
      : DAG_UK[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MAAND_UK[d.getUTCMonth()];
  };
  HV.datumKort = function (ms) { var d = new Date(ms); return taal === 'nl' ? twee(d.getUTCDate()) + '-' + twee(d.getUTCMonth() + 1) : twee(d.getUTCDate()) + '.' + twee(d.getUTCMonth() + 1); };

  /** Тривалість у хвилинах → «42 хв», «2 год 10 хв». */
  HV.duur = function (minuten) {
    var m = Math.max(0, Math.round(minuten));
    if (m < 60) return m + ' ' + HV.t('хв', 'min');
    var u = Math.floor(m / 60), r = m % 60;
    return u + ' ' + HV.t('год', 'u') + (r ? ' ' + r + ' ' + HV.t('хв', 'min') : '');
  };
  /** Вік значення за часом дому: «2 с», «3 хв», «2 год», «3 дн.». */
  HV.oud = function (ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + ' ' + HV.t('с', 's');
    if (s < 3600) return Math.round(s / 60) + ' ' + HV.t('хв', 'min');
    if (s < 86400) return Math.round(s / 3600) + ' ' + HV.t('год', 'u');
    return Math.round(s / 86400) + ' ' + HV.t('дн.', 'd');
  };

  /** Назви спільних станів (§11 дизайн-мови) — одне місце. */
  HV.woord = {
    aan: function () { return HV.t('увімкнено', 'aan'); },
    uit: function () { return HV.t('вимкнено', 'uit'); },
    open: function () { return HV.t('відчинено', 'open'); },
    dicht: function () { return HV.t('зачинено', 'dicht'); },
    vergrendeld: function () { return HV.t('замкнено', 'vergrendeld'); },
    ontgrendeld: function () { return HV.t('відімкнено', 'ontgrendeld'); },
    wacht: function () { return HV.t('очікує', 'wacht'); },
    verouderd: function () { return HV.t('застаріло', 'verouderd'); },
    onbereikbaar: function () { return HV.t('недоступний', 'niet bereikbaar'); },
    verondersteld: function () { return HV.t('стан припущено', 'toestand verondersteld'); },
    slaapt: function () { return HV.t('спить', 'slaapt'); },
    onbekend: function () { return HV.t('невідомо', 'onbekend'); },
    live: function () { return HV.t('наживо', 'live'); },
    geenVerbinding: function () { return HV.t('немає зв’язку', 'geen verbinding'); },
    verwarmt: function () { return HV.t('гріє', 'verwarmt'); },
    koelt: function () { return HV.t('охолоджує', 'koelt'); },
    laadt: function () { return HV.t('заряджається', 'laadt'); }
  };
})(window.HV = window.HV || {});
