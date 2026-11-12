// Opslag van voorkeuren: de enige plek die localStorage aanraakt, altijd in try/catch.
// Сховище може бути порожнім або заблокованим (приватне вікно, попередній перегляд) — макет мусить працювати й без нього.
(function (HV) {
  'use strict';
  var SLEUTEL = 'huis-maquette-voorkeuren';
  var geheugen = null;

  function laad() {
    if (geheugen) return geheugen;
    geheugen = {};
    try {
      var ruw = window.localStorage.getItem(SLEUTEL);
      if (ruw) geheugen = JSON.parse(ruw) || {};
    } catch (e) { geheugen = {}; }
    return geheugen;
  }

  HV.opslag = {
    lees: function (naam, standaard) { var v = laad()[naam]; return v === undefined ? standaard : v; },
    schrijf: function (naam, waarde) {
      laad()[naam] = waarde;
      try { window.localStorage.setItem(SLEUTEL, JSON.stringify(geheugen)); } catch (e) { /* лишається в пам'яті сторінки */ }
    }
  };
})(window.HV = window.HV || {});
