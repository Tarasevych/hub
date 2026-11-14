// Uurprijzen voor 48 uur (приклад, €/кВт·год з податками) vanaf maandag 9 november 2026, 00:00 huistijd.
// Другий день має від'ємну годину (13:00–14:00): сонячно й вітряно, мережа доплачує за споживання.
(function (HV) {
  'use strict';
  var begin = HV.huistijd(2026, 11, 9, 0, 0);
  var prijzen = [
    // 9 листопада
    0.21, 0.20, 0.19, 0.19, 0.20, 0.23, 0.29, 0.34, 0.36, 0.31, 0.26, 0.22,
    0.19, 0.17, 0.18, 0.21, 0.27, 0.35, 0.39, 0.37, 0.32, 0.28, 0.24, 0.22,
    // 10 листопада
    0.20, 0.19, 0.18, 0.18, 0.19, 0.22, 0.27, 0.31, 0.30, 0.22, 0.14, 0.08,
    0.03, -0.02, 0.04, 0.11, 0.21, 0.31, 0.36, 0.34, 0.30, 0.26, 0.23, 0.21
  ];

  HV.tarief = {
    begin: begin,
    prijzen: prijzen,
    /** Ціна години, в яку потрапляє час дому. Поза таблицею доба повторюється. */
    prijs: function (tijd) {
      var uur = Math.floor((tijd - begin) / 3600000);
      var n = prijzen.length;
      return prijzen[((uur % n) + n) % n];
    },
    /** 48 годин від початку поточної доби: [{ tijd, prijs }]. */
    venster: function (tijd) {
      var dagBegin = tijd - (tijd - begin) % 86400000;
      if (tijd < begin) dagBegin = begin;
      var uit = [];
      for (var i = 0; i < 48; i++) uit.push({ tijd: dagBegin + i * 3600000, prijs: this.prijs(dagBegin + i * 3600000) });
      return uit;
    },
    /** Найближча дешева година після `tijd` (у межах 18 год): { tijd, prijs }. */
    goedkoopst: function (tijd, uren) {
      var beste = null;
      for (var i = 1; i <= (uren || 18); i++) {
        var t = tijd - (tijd % 3600000) + i * 3600000;
        var p = this.prijs(t);
        if (!beste || p < beste.prijs) beste = { tijd: t, prijs: p };
      }
      return beste;
    }
  };
})(window.HV = window.HV || {});
