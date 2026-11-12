// Handeling: de ENIGE plek waar een actie wordt uitgevoerd.
//
// HV.doe({ doel, mogelijkheid, waarde, door }) проходить ворота у сталому порядку:
//   зв'язок → доступність пристрою → роль людини → рівень ризику (ритуал) → дозвіл виконавця (hv-stand) → виконання.
// Мікростани команди: надіслано → прийнято → підтверджено | не підтверджено. Кожна дія лишає знак автора на пристрої,
// запис у Журналі та спливне сповіщення; де відкат можливий — «Повернути» 10 с.
(function (HV) {
  'use strict';

  var VERTRAGING = { aangenomen: 160, bevestigd: 460, slaapt: 2600, mislukt: 3000 };
  // Скільки висить сповіщення: з «Повернути» — 10 с (стільки діє відкат), важливе — 6 с, звичайне — 4 с; тривога — доки не закриють.
  var TERUG_MS = 10000, BELANGRIJK_MS = 6000, GEWOON_MS = 4000;

  // ── Wie handelt ──
  HV.rol = function () { return HV.opslag.lees('rol', 'eigenaar'); };
  /** Людина за пультом макета: роль → мешканець паспорта. */
  HV.mens = function () {
    var rol = HV.rol();
    var r = HV.paspoort.rollen.filter(function (x) { return x.id === rol; })[0] || HV.paspoort.rollen[0];
    var m = HV.paspoort.mensen.filter(function (x) { return x.id === r.persoon; })[0];
    return { soort: 'mens', id: m.id, naam: m.naam, rol: rol };
  };

  // ── Journaal ──
  HV.logboek = {
    /** Запис: { maker:{soort,naam}, wat:[uk,nl], waarom?, was?, werd?, toegestaan?, soort:'huis.*', gewicht?, doel? } */
    /** Лічильники для проби дії без зв'язку: pogingen — скільки разів щось писало в Журнал, geweigerd — скільки команд відхилено через зв'язок. */
    pogingen: 0, geweigerd: 0,
    /** true лише на час дії пульта симулятора всередині продукту: він керує макетом, а не домом. */
    vrij: false,
    voegToe: function (e) {
      var w = HV.staat.w;
      HV.logboek.pogingen++;
      // без зв'язку людина нічого не могла зробити в домі: запис не зберігається (світ повертає проба в schil.js)
      if (w.gegevens === 'geen' && !HV.logboek.vrij && e.maker && e.maker.soort === 'mens') {
        return { id: 'l-geen', tijd: w.tijd, maker: e.maker, wat: e.wat, waarom: e.waarom || null, was: e.was || null, werd: e.werd || null, soort: e.soort || 'huis.apparaat', gewicht: e.gewicht || 'info', doel: e.doel || null, gelezen: true, sim: true, nietBewaard: true };
      }
      var regel = {
        id: 'l' + (++w.logTeller), tijd: w.tijd, maker: e.maker || { soort: 'simulator', naam: ['Симулятор', 'Simulator'] },
        wat: e.wat, waarom: e.waarom || null, was: e.was || null, werd: e.werd || null, toegestaan: e.toegestaan || null,
        soort: e.soort || 'huis.apparaat', gewicht: e.gewicht || 'info', doel: e.doel || null, gelezen: false, sim: true
      };
      w.logboek.unshift(regel);
      if (w.logboek.length > 300) w.logboek.length = 300;
      return regel;
    },
    ongelezen: function () { return HV.staat.w.logboek.filter(function (r) { return !r.gelezen; }).length; },
    leesAlles: function () { HV.staat.wijzig(function (w) { w.logboek.forEach(function (r) { r.gelezen = true; }); }); }
  };

  // ── Spливні сповіщення (дані; малює schil.js) ──
  var toostTeller = 0;
  HV.toosten = [];
  /**
   * HV.meld({ titel, tekst, gewicht:'info'|'belangrijk'|'alarm', maker, icoon, terug: fn, hoe, duur })
   * titel, tekst і hoe — рядок або пара [uk, nl]. Показується одне сповіщення (найновіше; тривога — першою) й лічильник
   * «+N»; решта чекає за ним. Те саме сповіщення вдруге не додається — лише починає свій час спочатку.
   */
  HV.meld = function (m) {
    var gewicht = m.gewicht || 'info';
    var duur = m.duur != null ? m.duur : gewicht === 'alarm' ? 0 : m.terug ? TERUG_MS : gewicht === 'belangrijk' ? BELANGRIJK_MS : GEWOON_MS;
    var zelfde = m.terug ? null : HV.toosten.filter(function (x) { return !x.terug && x.gewicht === gewicht && HV.p(x.titel) === HV.p(m.titel) && HV.p(x.tekst) === HV.p(m.tekst || ''); })[0];
    if (zelfde) {
      if (zelfde.klok) clearTimeout(zelfde.klok);
      zelfde.sinds = Date.now();
      if (duur) zelfde.klok = setTimeout(function () { HV.toostWeg(zelfde.id); }, duur);
      HV.toosten = HV.toosten.filter(function (x) { return x !== zelfde; }).concat([zelfde]);
      if (HV.schil && HV.schil.tekenToosten) HV.schil.tekenToosten();
      return zelfde;
    }
    var toost = { id: 't' + (++toostTeller), titel: m.titel, tekst: m.tekst || '', gewicht: gewicht, maker: m.maker || null, icoon: m.icoon || null, terug: m.terug || null, hoe: m.hoe || null, sinds: Date.now(), duur: duur };
    HV.toosten.push(toost);
    var max = (HV.bouw.gedrag && HV.bouw.gedrag.toostMax) || 3;
    while (HV.toosten.length > max) {
      var weg = HV.toosten.shift();
      if (weg.klok) clearTimeout(weg.klok);
    }
    if (toost.duur) toost.klok = setTimeout(function () { HV.toostWeg(toost.id); }, toost.duur);
    if (HV.schil && HV.schil.tekenToosten) HV.schil.tekenToosten();
    return toost;
  };
  HV.toostWeg = function (id) {
    HV.toosten = HV.toosten.filter(function (t) { if (t.id === id && t.klok) clearTimeout(t.klok); return t.id !== id; });
    if (HV.schil && HV.schil.tekenToosten) HV.schil.tekenToosten();
  };

  // ── Beschrijven en toepassen ──
  var bool = function (v) { return v === true || v === 'true' || v === 1 || v === '1' || v === 'aan'; };
  function norm(mogelijkheid, waarde) {
    if (['aan', 'open', 'vergrendeld', 'afspelen', 'laden', 'licht'].indexOf(mogelijkheid) >= 0) return bool(waarde);
    if (['helderheid', 'kleurtemp', 'positie', 'kantel', 'doel', 'volume'].indexOf(mogelijkheid) >= 0) return Number(waarde);
    if (mogelijkheid === 'stand' && !isNaN(Number(waarde)) && waarde !== '' && typeof waarde !== 'boolean') return Number(waarde);
    return waarde;
  }

  /** Значення словами для Журналу й сповіщення: [uk, nl]. */
  function beschrijf(a, mogelijkheid, v) {
    var beide = function (s) { return [s, s]; };
    switch (mogelijkheid) {
      case 'aan': case 'afspelen': return v ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'];
      case 'laden': return v ? ['заряджається', 'laadt'] : ['зарядку зупинено', 'laden gestopt'];
      case 'open': return v ? ['відчинено', 'open'] : ['зачинено', 'dicht'];
      case 'vergrendeld': return v ? ['замкнено', 'vergrendeld'] : ['відімкнено', 'ontgrendeld'];
      case 'helderheid': case 'positie': case 'kantel': case 'volume': return beide(HV.getal(v) + ' %');
      case 'kleurtemp': return beide(HV.getal(v) + ' K');
      case 'doel': return beide(HV.getal(v, a && a.soort === 'oven' ? 0 : 1) + ' ' + (a && a.soort === 'bevochtiger' ? '%' : '°C'));
      case 'kleur': return ['колір змінено', 'kleur gewijzigd'];
      case 'alarmstand': return ({ uit: ['знято', 'uit'], schil: ['периметр', 'schil'], nacht: ['нічна', 'nachtstand'], volledig: ['повна', 'volledig'] })[v] || beide(String(v));
      case 'programma': return v === 'start' ? ['програму запущено', 'programma gestart'] : ['програму зупинено', 'programma gestopt'];
      case 'robot': return ({ start: ['працює', 'bezig'], pauze: ['пауза', 'pauze'], dock: ['повертається на базу', 'keert terug naar het station'] })[v] || beide(String(v));
      case 'herstart': return ['перезапуск', 'herstart'];
      case 'aftel': return v ? ['вимкнеться о ' + HV.tijd(v), 'gaat uit om ' + HV.tijd(v)] : ['відлік скасовано', 'aftellen geannuleerd'];
      case 'effect': case 'modus': case 'ventilator': case 'bron':
        return WAARDE_NAAM[v] || beide(String(v));
      case 'stand': return typeof v === 'number' ? (v === 0 ? ['вимкнено', 'uit'] : ['швидкість ' + v, 'stand ' + v]) : (WAARDE_NAAM[v] || beide(String(v)));
      default: return beide(String(v));
    }
  }
  var WAARDE_NAAM = {
    geen: ['без ефекту', 'geen effect'], kaars: ['свічка', 'kaars'], adem: ['дихання', 'ademen'], regenboog: ['веселка', 'regenboog'], stroboscoop: ['стробоскоп', 'stroboscoop'],
    uit: ['вимкнено', 'uit'], verwarmen: ['обігрів', 'verwarmen'], auto: ['авто', 'auto'], koelen: ['охолодження', 'koelen'], drogen: ['осушення', 'drogen'], boiler: ['лише вода', 'alleen water'],
    pauze: ['пауза', 'pauze'], slim: ['розумно', 'slim'], snel: ['швидко', 'snel'], hdmi1: ['вхід 1', 'ingang 1'], hdmi2: ['вхід 2', 'ingang 2'], tv: ['ефір', 'tv-kijken']
  };
  HV.waardeNaam = WAARDE_NAAM;
  HV.beschrijf = beschrijf;
  /** Бажане значення під час очікування підтвердження, інакше спостережене. */
  HV.gewenst = function (a, mogelijkheid) { return a.wacht && a.wacht.mogelijkheid === mogelijkheid ? a.wacht.waarde : huidige(a, mogelijkheid); };

  function huidige(a, mogelijkheid) {
    var st = a.st;
    switch (mogelijkheid) {
      case 'aan': return HV.kijk.isAan(a);
      case 'afspelen': return !!st.speelt;
      case 'laden': return !!st.laadt;
      case 'alarmstand': return st.stand;
      case 'kleur': return { tint: st.tint, verzadiging: st.verzadiging };
      case 'helderheid': return a.leden ? HV.kijk.groepHelderheid(a) : st.helderheid;
      case 'programma': return st.loopt ? 'start' : 'stop';
      case 'robot': return st.stand === 'bezig' ? 'start' : st.stand;
      default: return st[mogelijkheid];
    }
  }
  HV.huidige = huidige;

  /** Спостережений стан змінюється тут — після «підтверджено». */
  function pasToe(a, mogelijkheid, v, w) {
    var st = a.st;
    if (a.leden && (mogelijkheid === 'aan' || mogelijkheid === 'helderheid' || mogelijkheid === 'afspelen' || mogelijkheid === 'volume')) {
      a.leden.forEach(function (id) {
        var lid = w.apparaten[id];
        if (lid.beschikbaar === 'onbereikbaar') return;
        if (mogelijkheid === 'helderheid' && !('helderheid' in lid.st)) return;
        pasToe(lid, mogelijkheid, v, w);
      });
      if (mogelijkheid === 'afspelen') st.speelt = v;
      if (mogelijkheid === 'volume') st.volume = v;
      return;
    }
    switch (mogelijkheid) {
      case 'aan': st.aan = v; if (v) st.sinds = w.tijd; else st.uitOm = null; break;
      case 'afspelen': st.speelt = v; break;
      case 'laden': st.laadt = v; break;
      case 'open': st.open = v; st.sinds = w.tijd; break;
      case 'vergrendeld': st.vergrendeld = v; break;
      case 'alarmstand': st.stand = v; break;
      case 'helderheid': st.helderheid = Math.max(1, Math.min(100, v)); if (!st.aan && 'aan' in st) st.aan = true; break;
      case 'kleurtemp': st.kleurtemp = v; st.verzadiging = 0; if ('aan' in st && !st.aan) st.aan = true; break;
      case 'kleur': st.tint = Number(v.tint); st.verzadiging = Number(v.verzadiging); if ('aan' in st && !st.aan) st.aan = true; break;
      case 'programma': st.loopt = v === 'start'; st.rest = st.loopt ? 95 : 0; st.vermogen = st.loopt ? 560 : 0; break;
      case 'robot': st.stand = v === 'start' ? 'bezig' : v === 'pauze' ? 'pauze' : 'dock'; break;
      case 'herstart': st.herstart = w.tijd; break;
      case 'signaal': st.laatst = v; break;
      case 'aftel': st.uitOm = v; break;
      default: st[mogelijkheid] = v;
    }
  }

  function kopie(x) { return JSON.parse(JSON.stringify(x)); }

  // ── Niet-apparaatdoelen: режим дому, сцена, кімната, усе світло ──
  var STAND_NAAM = { thuis: ['Вдома', 'Thuis'], afwezig: ['Не вдома', 'Afwezig'], nacht: ['Ніч', 'Nacht'], vakantie: ['Відпустка', 'Vakantie'], gasten: ['Гості', 'Gasten'] };
  HV.huisstanden = STAND_NAAM;

  function lampenUit(w, filter) {
    var n = 0, over = 0;
    HV.kijk.alle(function (a) { return a.soort === 'licht' && (!filter || filter(a)); }).forEach(function (a) {
      if (a.beschikbaar === 'onbereikbaar') { over++; return; }
      if (a.st.aan) { a.st.aan = false; n++; }
    });
    return { n: n, over: over };
  }

  /** Виконує складену дію над світом і повертає { wat, was, werd, tekst, betrokken:[ids] }. */
  function samengesteld(d, mogelijkheid, v, w, door) {
    var A = w.apparaten;
    if (d.soort === 'huis' && mogelijkheid === 'stand') {
      var was = w.huisstand;
      w.huisstand = v;
      var extra = ['', ''];
      if (v === 'afwezig' || v === 'vakantie') {
        var r = lampenUit(w);
        ['tv', 'speakerkeuken', 'speakerwoon'].forEach(function (id) { if ('aan' in A[id].st) A[id].st.aan = false; A[id].st.speelt = false; });
        A.thermostaat.st.doel = v === 'vakantie' ? 15 : 17;
        extra = ['світло й медіа вимкнено (' + r.n + '), опалення ' + HV.getal(A.thermostaat.st.doel) + ' °C', 'licht en media uit (' + r.n + '), verwarming ' + HV.getal(A.thermostaat.st.doel) + ' °C'];
      } else if (v === 'nacht') {
        var r2 = lampenUit(w, function (a) { return a.id !== 'kinderlicht' && a.id !== 'slaaplicht'; });
        A.thermostaat.st.doel = 17.5; A.tv.st.aan = false;
        extra = ['світло внизу вимкнено (' + r2.n + '), опалення 17,5 °C', 'licht beneden uit (' + r2.n + '), verwarming 17,5 °C'];
      } else if (v === 'thuis') {
        A.thermostaat.st.doel = 21;
        extra = ['опалення 21 °C', 'verwarming 21 °C'];
      }
      return { wat: ['Режим дому: «' + STAND_NAAM[v][0] + '»', 'Huisstand: ‘' + STAND_NAAM[v][1] + '’'], was: STAND_NAAM[was], werd: STAND_NAAM[v], tekst: extra, soort: 'huis.systeem' };
    }
    if (d.soort === 'scene') {
      var scene = w.scenes.filter(function (s) { return s.id === d.id; })[0];
      var gedaan = 0, overgeslagen = 0, geweigerd = 0;
      var sceneDoor = { soort: 'scene', id: 'scene', naam: scene.naam };
      scene.stappen.forEach(function (stap) {
        var a = A[stap.doel];
        if (!a || a.beschikbaar === 'onbereikbaar') { overgeslagen++; return; }
        var actie = HV.gevaar.vind(a, stap.mogelijkheid, stap.waarde);
        // небезпечний чи критичний крок сцена виконує лише за дозволом hv-stand «Завжди»
        if (HV.gevaar.isZwaar(actie) && HV.gevaar.stand('scene', actie.sleutel) !== 'altijd') { geweigerd++; return; }
        pasToe(a, stap.mogelijkheid, stap.waarde, w);
        a.maker = { soort: 'scene', naam: scene.naam, tijd: w.tijd, echt: Date.now() };
        gedaan++;
      });
      w.sceneActief = scene.id;
      var totaal = scene.stappen.length;
      var tekst = gedaan === totaal ? [gedaan + ' із ' + totaal + ' кроків виконано', gedaan + ' van ' + totaal + ' stappen uitgevoerd']
        : [gedaan + ' із ' + totaal + (overgeslagen ? ', недоступних: ' + overgeslagen : '') + (geweigerd ? ', без дозволу: ' + geweigerd : ''), gedaan + ' van ' + totaal + (overgeslagen ? ', niet bereikbaar: ' + overgeslagen : '') + (geweigerd ? ', zonder toestemming: ' + geweigerd : '')];
      void sceneDoor; void door;
      return { wat: ['Сцена «' + scene.naam[0] + '»', 'Scène ‘' + scene.naam[1] + '’'], tekst: tekst, soort: 'huis.automatisering' };
    }
    if (d.soort === 'kamer') {
      var kamer = HV.staat.kamer(d.id);
      if (mogelijkheid === 'doel') {
        var oud = kamer.doel;
        kamer.doel = v;
        return { wat: [kamer.naam[0] + ': ціль температури', kamer.naam[1] + ': doeltemperatuur'], was: oud == null ? null : [HV.getal(oud, 1) + ' °C', HV.getal(oud, 1) + ' °C'], werd: [HV.getal(v, 1) + ' °C', HV.getal(v, 1) + ' °C'], soort: 'huis.apparaat' };
      }
      if (mogelijkheid === 'licht') {
        var n = 0;
        HV.kijk.lampen(d.id).forEach(function (a) { if (a.beschikbaar !== 'onbereikbaar' && a.st.aan !== v) { a.st.aan = v; n++; a.maker = { soort: door.soort, naam: door.naam, tijd: w.tijd, echt: Date.now() }; } });
        return { wat: [kamer.naam[0] + ': світло ' + (v ? 'увімкнено' : 'вимкнено'), kamer.naam[1] + ': licht ' + (v ? 'aan' : 'uit')], tekst: [n + ' ' + HV.meervoud(n, ['лампа', 'лампи', 'ламп'], ['lamp', 'lampen']), n + ' ' + (n === 1 ? 'lamp' : 'lampen')], soort: 'huis.apparaat' };
      }
    }
    if (d.soort === 'alle' && mogelijkheid === 'licht') {
      var r3 = lampenUit(w);
      return { wat: ['Усе світло вимкнено', 'Alle lampen uit'], tekst: ['вимкнено: ' + r3.n + (r3.over ? '; недоступних пропущено: ' + r3.over : ''), 'uitgezet: ' + r3.n + (r3.over ? '; niet bereikbaar, overgeslagen: ' + r3.over : '')], soort: 'huis.apparaat' };
    }
    if (d.soort === 'alle' && mogelijkheid === 'alles') {
      var r4 = lampenUit(w);
      ['tv', 'speakerkeuken', 'speakerwoon', 'stekkermedia', 'stekkerbureau', 'koffie', 'oven', 'computer', 'printer'].forEach(function (id) { var s = A[id].st; if ('aan' in s) s.aan = false; if ('speelt' in s) s.speelt = false; });
      ['wasmachine', 'droger', 'vaatwasser'].forEach(function (id) { A[id].st.loopt = false; A[id].st.vermogen = 0; });
      return { wat: ['Усе в домі вимкнено', 'Alles in huis uit'], tekst: ['світло (' + r4.n + '), медіа, розетки й техніка', 'licht (' + r4.n + '), media, stekkers en apparaten'], soort: 'huis.apparaat', gewicht: 'belangrijk' };
    }
    return null;
  }

  // ── Без зв'язку з домом ──
  /** Чи діє «лише перегляд»: зв'язку немає (пульт симулятора всередині продукту — виняток на час своєї дії). */
  HV.zonderVerbinding = function () { var w = HV.staat.w; return !!w && w.gegevens === 'geen' && !HV.logboek.vrij; };
  /** Єдине сповіщення-відмова для всього, що без зв'язку не виконується. */
  HV.meldZonderVerbinding = function () {
    return HV.meld({ gewicht: 'belangrijk', icoon: 'wifi-off', titel: HV.t('Не виконано: немає зв’язку з домом', 'Niet uitgevoerd: geen verbinding met het huis'), tekst: HV.t('Показано останній знімок, лише перегляд. Черги команд немає.', 'Je ziet de laatste momentopname, alleen bekijken. Er is geen wachtrij.') });
  };

  // ── Uitvoeren ──
  function weiger(reden, titel, tekst, door) {
    if (reden === 'verbinding') HV.logboek.geweigerd++;
    if (!door || door.soort === 'mens') {
      if (reden === 'verbinding') HV.meldZonderVerbinding();
      else HV.meld({ gewicht: 'belangrijk', icoon: reden === 'rol' ? 'lock' : 'circle-x', titel: titel, tekst: tekst });
    }
    return Promise.resolve({ ok: false, reden: reden });
  }

  function voerUit(o, d, actie, door, toegestaan) {
    var w = HV.staat.w;
    var v = norm(o.mogelijkheid, o.waarde);

    // складені цілі: одна операція зі знімком для «Повернути»
    if (d.soort !== 'apparaat') {
      var voor = kopie({ apparaten: w.apparaten, huisstand: w.huisstand, kamers: w.kamers, sceneActief: w.sceneActief });
      var uitkomst = null;
      HV.staat.wijzig(function (x) { uitkomst = samengesteld(d, o.mogelijkheid, v, x, door); });
      if (!uitkomst) return Promise.resolve({ ok: false, reden: 'onbekend' });
      var regel = HV.logboek.voegToe({ maker: door, wat: uitkomst.wat, waarom: o.waarom || null, was: uitkomst.was, werd: uitkomst.werd, toegestaan: toegestaan, soort: uitkomst.soort, gewicht: uitkomst.gewicht });
      HV.klok.stap(0);
      if (!o.stil) {
        HV.meld({
          maker: door, titel: HV.p(uitkomst.wat), tekst: uitkomst.tekst ? HV.p(uitkomst.tekst) : '',
          terug: function () {
            HV.staat.wijzig(function (x) { x.apparaten = voor.apparaten; x.huisstand = voor.huisstand; x.kamers = voor.kamers; x.sceneActief = voor.sceneActief; });
            HV.logboek.voegToe({ maker: door, wat: ['Повернуто: ' + regel.wat[0], 'Ongedaan gemaakt: ' + regel.wat[1]], soort: regel.soort });
            HV.klok.stap(0);
          }
        });
      }
      return Promise.resolve({ ok: true });
    }

    var a = d.a;
    var wasWaarde = huidige(a, o.mogelijkheid);
    var was = wasWaarde === undefined ? null : beschrijf(a, o.mogelijkheid, wasWaarde);
    var werd = beschrijf(a, o.mogelijkheid, v);
    var echt = Date.now();
    // клас із ходом: після першої відповіді — «виконується» зі словом напряму й спостереженим відсотком
    var gang = GANG[a.soort] && GANG[a.soort].mogelijkheden.indexOf(o.mogelijkheid) >= 0 ? GANG[a.soort] : null;
    var grensS = gang ? ((HV.bouw.gedrag && HV.bouw.gedrag.wachtPerKlasse && HV.bouw.gedrag.wachtPerKlasse[gang.klasse]) || 60) : 10;
    HV.staat.wijzig(function () { a.wacht = { mogelijkheid: o.mogelijkheid, waarde: v, fase: 'verzonden', sinds: echt, grens: grensS }; a.mislukt = null; });

    return new Promise(function (klaar) {
      var slaapt = a.beschikbaar === 'slaapt';
      var mislukt = !!(w.sim && w.sim.geenBevestiging);
      setTimeout(function () { if (a.wacht && a.wacht.sinds === echt) HV.staat.wijzig(function () { a.wacht.fase = 'aangenomen'; }); }, VERTRAGING.aangenomen);
      var bevestig = function () {
        if (!a.wacht || a.wacht.sinds !== echt) { klaar({ ok: true, vervangen: true }); return; } // нова команда замінила цю
        if (mislukt) {
          // «не виконано»: плитка повертає спостережене, контур --fout і рядок «Не виконано» — 60 с або до наступної дії
          HV.staat.wijzig(function () { a.wacht = null; a.mislukt = { echt: Date.now(), tijd: HV.staat.w.tijd }; });
          HV.meld({ gewicht: 'belangrijk', icoon: 'circle-x', titel: HV.p(a.naam) + ': ' + HV.t('не виконано', 'niet uitgevoerd'), tekst: gang ? HV.t('Пристрій не завершив хід за ' + grensS + ' с — показано спостережений стан.', 'Het apparaat kwam niet binnen ' + grensS + ' s op zijn plek — je ziet de waargenomen toestand.') : HV.t('Пристрій не відповів за 10 с — показано спостережений стан.', 'Het apparaat antwoordde niet binnen 10 s — je ziet de waargenomen toestand.') });
          HV.logboek.voegToe({ maker: door, wat: [a.naam[0] + ': не виконано', a.naam[1] + ': niet uitgevoerd'], soort: 'huis.apparaat', gewicht: 'belangrijk', doel: a.id });
          klaar({ ok: false, reden: 'niet-uitgevoerd' });
          return;
        }
        HV.staat.wijzig(function (x) {
          pasToe(a, o.mogelijkheid, v, x);
          a.wacht = null;
          a.maker = { soort: door.soort, naam: door.naam, tijd: x.tijd, echt: Date.now() };
          if (a.beschikbaar === 'ok') a.gezien = x.tijd;
        });
        var regel = HV.logboek.voegToe({ maker: door, wat: [a.naam[0] + ': ' + werd[0], a.naam[1] + ': ' + werd[1]], waarom: o.waarom || null, was: was, werd: werd, toegestaan: toegestaan, soort: 'huis.apparaat', doel: a.id, gewicht: HV.gevaar.isZwaar(actie) ? 'belangrijk' : 'info' });
        HV.klok.stap(0);
        if (!o.stil) {
          var kanTerug = wasWaarde !== undefined && o.mogelijkheid !== 'herstart' && o.mogelijkheid !== 'signaal' && (actie.niveau !== 'gewoon' || door.soort !== 'mens');
          HV.meld({
            maker: door, icoon: HV.paspoort.soorten[a.soort].icoon,
            titel: HV.p(regel.wat),
            tekst: a.beschikbaar === 'verondersteld' ? HV.t('Без зворотного зв’язку: стан припущено.', 'Zonder terugmelding: toestand verondersteld.') : (was ? HV.p(was) + ' → ' + HV.p(werd) : ''),
            terug: kanTerug ? function () { HV.doe({ doel: a.id, mogelijkheid: o.mogelijkheid, waarde: wasWaarde, door: door, stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); } : null,
            hoe: o.mogelijkheid === 'herstart' ? HV.t('Як повернути: відкату немає — мережа повернеться сама.', 'Terugdraaien: kan niet — het netwerk komt vanzelf terug.') : null
          });
        }
        klaar({ ok: true });
      };
      if (!gang) { setTimeout(bevestig, mislukt ? VERTRAGING.mislukt : slaapt ? VERTRAGING.slaapt : VERTRAGING.bevestigd); return; }
      // Хід (макет): після першої відповіді спостережений відсоток росте кроками; підтвердження — коли хід завершено.
      var van = o.mogelijkheid === 'positie' ? Number(wasWaarde) || 0 : 0;
      var naar = o.mogelijkheid === 'positie' ? Number(v) : 100;
      var duur = mislukt ? VERTRAGING.mislukt : gang.ms;
      setTimeout(function () {
        if (!a.wacht || a.wacht.sinds !== echt) { klaar({ ok: true, vervangen: true }); return; }
        var begin = Date.now();
        HV.staat.wijzig(function () { a.wacht.fase = 'bezig'; a.wacht.voortgang = van; });
        var tik = setInterval(function () {
          if (!a.wacht || a.wacht.sinds !== echt) { clearInterval(tik); return; }
          var deel = Math.min(1, (Date.now() - begin) / duur);
          // за збою хід зупиняється на півдорозі — так виглядає справжня відмова
          HV.staat.wijzig(function () { a.wacht.voortgang = van + (naar - van) * (mislukt ? Math.min(deel, 0.4) : deel); });
          if (deel >= 1) { clearInterval(tik); bevestig(); }
        }, 250);
      }, VERTRAGING.bevestigd);
    });
  }
  // Класи з ходом і їхній час до «не виконано» (maten.gedrag.wachtPerKlasse); ms — тривалість ходу в макеті.
  var GANG = {
    gordijn: { klasse: 'gordijnen', mogelijkheden: ['positie'], ms: 2600 },
    jaloezie: { klasse: 'jaloezie', mogelijkheden: ['positie', 'kantel'], ms: 2600 },
    poort: { klasse: 'poort', mogelijkheden: ['open'], ms: 3200 },
    garagedeur: { klasse: 'garagedeur', mogelijkheden: ['open'], ms: 3200 },
    slot: { klasse: 'slot', mogelijkheden: ['vergrendeld'], ms: 1100 },
    klep: { klasse: 'klep', mogelijkheden: ['open'], ms: 1600 }
  };
  HV.gangKlassen = GANG;

  /**
   * Виконати дію. Повертає Promise<{ ok, reden? }>.
   *   doel          — id пристрою | 'huis' | 'alle' | 'scene:<id>' | 'kamer:<id>'
   *   mogelijkheid  — 'aan', 'helderheid', 'kleurtemp', 'kleur', 'effect', 'positie', 'doel', 'stand', 'start', 'licht', …
   *   waarde        — нове значення
   *   door          — виконавець { soort:'mens'|'scene'|'automatisering'|'optimalisatie'|'agent'|'knop', id, naam:[uk,nl] };
   *                   типово — людина за пультом (поточна роль)
   *   stil          — без спливного сповіщення (Журнал пишеться завжди)
   */
  HV.doe = function (o) {
    var w = HV.staat.w;
    var door = o.door || HV.mens();
    var d = HV.gevaar.doelSoort(o.doel);
    var waarde = norm(o.mogelijkheid, o.waarde);
    var actie = HV.gevaar.vind(d.soort === 'apparaat' ? d.a : o.doel, o.mogelijkheid, waarde);
    var naam = d.soort === 'apparaat' ? HV.p(d.a.naam) : HV.p(actie.naam);

    // 1. зв'язок
    if (w.gegevens === 'geen') {
      return weiger('verbinding', HV.t('Не виконано: немає зв’язку з домом', 'Niet uitgevoerd: geen verbinding met het huis'), HV.t('Показано останній знімок, лише перегляд. Черги команд немає.', 'Je ziet de laatste momentopname, alleen bekijken. Er is geen wachtrij.'), door);
    }
    // 2. доступність
    if (d.soort === 'apparaat' && d.a.beschikbaar === 'onbereikbaar') {
      return weiger('onbereikbaar', naam + ': ' + HV.woord.onbereikbaar(), HV.t('Відкрийте пристрій, щоб побачити, що перевірити.', 'Open het apparaat om te zien wat je kunt controleren.'), door);
    }
    if (d.soort !== 'apparaat' && !samengesteldBestaat(d, o.mogelijkheid)) return Promise.resolve({ ok: false, reden: 'onbekend' });

    // 3–4. людина: роль і ритуал рівня
    if (door.soort === 'mens') {
      if (o.zonderRitueel) return voerUit(o, d, actie, door, null);
      var mag = HV.gevaar.rolMag(door.rol || HV.rol(), actie);
      if (!mag.mag) return weiger('rol', HV.t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(mag.reden), HV.t('Попросіть власника або мешканця.', 'Vraag het de eigenaar of een bewoner.'), door);
      if (HV.gevaar.isZwaar(actie)) {
        if (!HV.schil || !HV.schil.gevaar) return voerUit(o, d, actie, door, null);
        return HV.schil.gevaar({ actie: actie, naam: naam, apparaat: d.a || null, waarde: waarde }).then(function (ja) {
          if (!ja) return { ok: false, reden: 'geannuleerd' };
          return voerUit(o, d, actie, door, null);
        });
      }
      return voerUit(o, d, actie, door, null);
    }

    // 5. виконавець без людини: дозвіл hv-stand
    if (w.zelfGestopt) {
      HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + HV.gevaar.actie(actie.sleutel).naam[0], 'Niet uitgevoerd: ' + HV.gevaar.actie(actie.sleutel).naam[1]], waarom: ['самостійні дії зупинено', 'zelfstandige acties zijn gestopt'], soort: 'huis.systeem' });
      HV.staat.wijzig();
      return Promise.resolve({ ok: false, reden: 'gestopt' });
    }
    var uitvoerderId = door.id || door.soort;
    var stand = HV.gevaar.stand(uitvoerderId, actie.sleutel);
    if (o.goedgekeurd) stand = 'altijd';
    if (stand === 'uit') {
      HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + actie.naam[0] + (d.a ? ' — ' + d.a.naam[0] : ''), 'Niet uitgevoerd: ' + actie.naam[1] + (d.a ? ' — ' + d.a.naam[1] : '')], waarom: ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'], soort: door.soort === 'agent' ? 'huis.agent' : 'huis.automatisering' });
      HV.meld({ maker: door, icoon: 'lock', titel: HV.t('Не виконано: дозвіл «Вимкнено»', 'Niet uitgevoerd: toestemming ‘Uit’'), tekst: HV.p(door.naam) + ' · ' + HV.p(actie.naam) });
      HV.staat.wijzig();
      return Promise.resolve({ ok: false, reden: 'stand-uit' });
    }
    if (stand === 'vragen') {
      var id = 'v' + (w.verzoeken.length + 1) + '-' + Date.now() % 10000;
      HV.staat.wijzig(function (x) {
        x.verzoeken.push({ id: id, uitvoerder: uitvoerderId, sleutel: actie.sleutel, doel: o.doel, mogelijkheid: o.mogelijkheid, waarde: waarde, sinds: x.tijd, tot: x.tijd + 5 * 60000, stand: 'wacht', wat: [actie.naam[0] + (d.a ? ': ' + d.a.naam[0] : ''), actie.naam[1] + (d.a ? ': ' + d.a.naam[1] : '')], waarom: o.waarom || null });
        x.nu.push({ id: 'verzoek-' + id, soort: 'verzoek', maker: door.soort, icoon: 'circle-help', verzoek: id, sinds: x.tijd, tekst: [door.naam[0] + ' просить: ' + actie.naam[0].toLowerCase(), door.naam[1] + ' vraagt: ' + actie.naam[1].toLowerCase()], acties: [{ naam: 'verzoek-ja', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'], gegevens: { verzoek: id } }, { naam: 'verzoek-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { verzoek: id } }] });
      });
      HV.logboek.voegToe({ maker: door, wat: ['Запит: ' + actie.naam[0], 'Verzoek: ' + actie.naam[1]], waarom: ['дозвіл «Питати»', 'toestemming ‘Vragen’'], soort: 'huis.agent', gewicht: 'belangrijk' });
      HV.meld({ maker: door, gewicht: 'belangrijk', icoon: 'circle-help', titel: HV.t('Чекає на вас', 'Wacht op jou'), tekst: HV.p(door.naam) + ': ' + HV.p(actie.naam) });
      return Promise.resolve({ ok: false, reden: 'wacht', verzoek: id });
    }
    return voerUit(o, d, actie, door, o.goedgekeurd ? ['схвалено раз: ' + HV.mens().naam[0], 'één keer goedgekeurd: ' + HV.mens().naam[1]] : ['дозвіл «Завжди»', 'toestemming ‘Altijd’']);
  };

  function samengesteldBestaat(d, mogelijkheid) {
    if (d.soort === 'huis') return mogelijkheid === 'stand';
    if (d.soort === 'scene') return !!HV.staat.w.scenes.filter(function (s) { return s.id === d.id; })[0];
    if (d.soort === 'kamer') return !!HV.staat.kamer(d.id) && (mogelijkheid === 'doel' || mogelijkheid === 'licht');
    if (d.soort === 'alle') return mogelijkheid === 'licht' || mogelijkheid === 'alles';
    return false;
  }

  // Чому схвалений запит не виконано — словами для сповіщення й Журналу.
  var NIET = {
    verbinding: ['немає зв’язку з домом', 'geen verbinding met het huis'],
    onbereikbaar: ['пристрій недоступний', 'het apparaat is niet bereikbaar'],
    gestopt: ['самостійні дії зупинено', 'zelfstandige acties zijn gestopt'],
    onbekend: ['дім не прийняв команду', 'het huis nam de opdracht niet aan']
  };
  /**
   * Рішення людини щодо запиту за режимом «Питати». Схвалений запит зникає з «Зараз важливо» лише після того, як дім
   * підтвердив виконання; якщо дію не виконано (немає зв'язку, пристрій недоступний), запит чекає далі, людина бачить
   * причину, а в Журналі з'являється «Не виконано: …».
   */
  HV.verzoek = function (id, ja) {
    var w = HV.staat.w;
    var v = w.verzoeken.filter(function (x) { return x.id === id; })[0];
    if (!v || v.stand !== 'wacht') return Promise.resolve({ ok: false });
    if (HV.zonderVerbinding()) { HV.logboek.geweigerd++; HV.meldZonderVerbinding(); return Promise.resolve({ ok: false, reden: 'verbinding' }); }
    var mens = HV.mens();
    var wie = HV.gevaar.uitvoerder(v.uitvoerder);
    if (!ja) {
      HV.staat.wijzig(function (x) { v.stand = 'afgewezen'; x.nu = x.nu.filter(function (n) { return n.verzoek !== id; }); });
      HV.logboek.voegToe({ maker: mens, wat: ['Відхилено запит: ' + v.wat[0], 'Verzoek afgewezen: ' + v.wat[1]], waarom: [wie.naam[0], wie.naam[1]], soort: 'huis.agent' });
      HV.meld({ maker: mens, titel: HV.t('Запит відхилено', 'Verzoek afgewezen'), tekst: HV.p(v.wat) });
      return Promise.resolve({ ok: true });
    }
    var door = { soort: wie.soort, id: wie.id, naam: wie.naam };
    HV.staat.wijzig(function () { v.stand = 'bezig'; });
    return HV.doe({ doel: v.doel, mogelijkheid: v.mogelijkheid, waarde: v.waarde, door: door, goedgekeurd: true, waarom: v.waarom }).then(function (uitkomst) {
      if (uitkomst && uitkomst.ok) {
        HV.staat.wijzig(function (x) { v.stand = 'goedgekeurd'; x.nu = x.nu.filter(function (n) { return n.verzoek !== id; }); });
        return uitkomst;
      }
      var reden = uitkomst && uitkomst.reden;
      HV.staat.wijzig(function () { v.stand = 'wacht'; });
      // «не підтверджено» пристрій уже пояснив сам (сповіщення й запис «не виконано»); решту причин називаємо тут
      if (reden !== 'niet-uitgevoerd') {
        var waarom = NIET[reden] || NIET.onbekend;
        HV.meld({ gewicht: 'belangrijk', icoon: reden === 'verbinding' ? 'wifi-off' : 'circle-x', maker: door, titel: HV.t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(v.wat), tekst: HV.t('Причина: ', 'Reden: ') + HV.p(waarom) + HV.t('. Запит чекає далі.', '. Het verzoek blijft wachten.') });
        if (reden !== 'verbinding' && reden !== 'gestopt') HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + v.wat[0], 'Niet uitgevoerd: ' + v.wat[1]], waarom: waarom, soort: 'huis.agent', gewicht: 'belangrijk' });
      }
      return uitkomst || { ok: false };
    });
  };

  /** Зупинити чи відновити самостійні дії (автоматизації, агенти, оптимізація). */
  HV.zelfStop = function (stop) {
    var mens = HV.mens();
    HV.staat.wijzig(function (w) { w.zelfGestopt = stop; });
    HV.logboek.voegToe({ maker: mens, wat: stop ? ['Самостійні дії зупинено', 'Zelfstandige acties gestopt'] : ['Самостійні дії відновлено', 'Zelfstandige acties hervat'], soort: 'huis.systeem', gewicht: 'belangrijk' });
    HV.meld({ maker: mens, gewicht: 'belangrijk', titel: stop ? HV.t('Самостійні дії зупинено', 'Zelfstandige acties gestopt') : HV.t('Самостійні дії відновлено', 'Zelfstandige acties hervat'), tekst: HV.t('Автоматизації, агенти й оптимізація.', 'Automatiseringen, agenten en optimalisatie.'), terug: function () { HV.zelfStop(!stop); } });
  };
})(window.HV = window.HV || {});
