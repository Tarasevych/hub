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
   * HV.meld({ titel, tekst, was, werd, gewicht:'info'|'belangrijk'|'alarm', maker, icoon, terug: fn, hoe, duur })
   * titel, tekst і hoe — рядок або пара [uk, nl]; was і werd — пари «було» й «стало» (значення з кінця titel тоді
   * прибирається — один чип зміни замість дубля). Показується одне сповіщення (найновіше; тривога — першою) й лічильник
   * «+N»; решта чекає за ним. Те саме сповіщення вдруге не додається — лише починає свій час спочатку.
   */
  HV.meld = function (m) {
    var gewicht = m.gewicht || 'info';
    var duur = m.duur != null ? m.duur : gewicht === 'alarm' ? 0 : m.terug ? TERUG_MS : gewicht === 'belangrijk' ? BELANGRIJK_MS : GEWOON_MS;
    var zelfde = m.terug ? null : HV.toosten.filter(function (x) { return !x.terug && x.gewicht === gewicht && HV.p(x.titel) === HV.p(m.titel) && HV.p(x.tekst) === HV.p(m.tekst || '') && HV.p(x.werd) === HV.p(m.werd || '') && HV.p(x.was) === HV.p(m.was || ''); })[0];
    if (zelfde) {
      if (zelfde.klok) clearTimeout(zelfde.klok);
      zelfde.sinds = Date.now();
      if (duur) zelfde.klok = setTimeout(function () { HV.toostWeg(zelfde.id); }, duur);
      HV.toosten = HV.toosten.filter(function (x) { return x !== zelfde; }).concat([zelfde]);
      if (HV.schil && HV.schil.tekenToosten) HV.schil.tekenToosten();
      return zelfde;
    }
    // was/werd (пари [uk, nl]) — зміна значення: сповіщення покаже назву без значення й один чип «було → стало», як запис Журналу
    var toost = { id: 't' + (++toostTeller), titel: m.titel, tekst: m.tekst || '', was: m.was || null, werd: m.werd || null, gewicht: gewicht, maker: m.maker || null, icoon: m.icoon || null, terug: m.terug || null, hoe: m.hoe || null, sinds: Date.now(), duur: duur };
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

  /**
   * Чи команда нічого не змінює: спостережене вже дорівнює бажаному («заряджається → заряджається», «увімкнено → увімкнено»).
   * Обережно — лише там, де це напевно так: дім знає стан напевно тільки для пристрою з beschikbaar === 'ok'. Пристрій без
   * зворотного зв'язку (стан припущено), із застарілим станом чи сплячий, разові команди (перезапуск, сигнал), пристрій,
   * що саме виконує іншу команду, і сцена завжди виконуються: «застаріло» означає, що дім не знає, чи двері замкнені, —
   * команда «замкнути» мусить піти.
   */
  function onzeker(a) { return !!a.wacht || a.beschikbaar !== 'ok'; }
  function ongewijzigd(d, mogelijkheid, v, w) {
    if (d.soort === 'huis') return mogelijkheid === 'stand' && w.huisstand === v;
    if (d.soort === 'kamer') {
      var kamer = HV.staat.kamer(d.id);
      if (!kamer) return false;
      if (mogelijkheid === 'doel') return kamer.doel != null && Number(kamer.doel) === Number(v);
      if (mogelijkheid === 'licht') {
        var lampen = HV.kijk.lampen(d.id).filter(function (x) { return x.beschikbaar !== 'onbereikbaar'; });
        return !lampen.some(onzeker) && !lampen.some(function (x) { return !!x.st.aan !== !!v; });
      }
      return false;
    }
    if (d.soort === 'alle') return mogelijkheid === 'licht' && !HV.kijk.alle(function (x) { return x.soort === 'licht' && x.beschikbaar !== 'onbereikbaar' && (x.st.aan || onzeker(x)); }).length;
    if (d.soort !== 'apparaat') return false;
    var a = d.a;
    if (onzeker(a)) return false;
    // лише стани, які ядро знає напевно; власні можливості зон (разові команди на кшталт «натиск», «тестова сторінка») — завжди дія
    if (STAAT_MOG.indexOf(mogelijkheid) < 0) return false;
    if (['modus', 'stand', 'effect', 'ventilator', 'bron'].indexOf(mogelijkheid) >= 0 && typeof v !== 'number' && !WAARDE_NAAM[v]) return false;
    return gelijkBij(a, mogelijkheid, v, w);
  }
  var STAAT_MOG = ['aan', 'afspelen', 'laden', 'open', 'vergrendeld', 'alarmstand', 'helderheid', 'kleurtemp', 'kleur', 'positie', 'kantel', 'doel', 'volume', 'programma', 'robot', 'modus', 'stand', 'effect', 'ventilator', 'bron'];
  function gelijkBij(a, mogelijkheid, v, w) {
    if (a.leden) {
      // група: «уже так» лише коли кожен досяжний учасник із цим органом уже має це значення
      var leden = a.leden.map(function (id) { return w.apparaten[id]; }).filter(function (l) { return l && l.beschikbaar !== 'onbereikbaar' && (mogelijkheid !== 'helderheid' || 'helderheid' in l.st); });
      if (!leden.length || leden.some(onzeker)) return false;
      if (mogelijkheid === 'aan' || mogelijkheid === 'helderheid') return leden.every(function (l) { return gelijkBij(l, mogelijkheid, v, w); });
      if (mogelijkheid === 'afspelen') return !!a.st.speelt === !!v && leden.every(function (l) { return !!l.st.speelt === !!v; });
      if (mogelijkheid === 'volume') return Number(a.st.volume) === Number(v) && leden.every(function (l) { return Number(l.st.volume) === Number(v); });
      return false;
    }
    var nu = huidige(a, mogelijkheid);
    if (nu === undefined || nu === null) return false;
    // яскравість, температура світла й колір заодно вмикають лампу: вимкнена лампа — це зміна
    if (['helderheid', 'kleurtemp', 'kleur'].indexOf(mogelijkheid) >= 0 && 'aan' in a.st && !a.st.aan) return false;
    if (mogelijkheid === 'kleur') return !!v && Number(nu.tint) === Number(v.tint) && Number(nu.verzadiging) === Number(v.verzadiging);
    if (mogelijkheid === 'kleurtemp' && Number(a.st.verzadiging) > 0) return false; // лампа світить кольором: біле світло — це зміна
    if (typeof v === 'boolean') return !!nu === v;
    if (typeof v === 'number') return Number(nu) === v;
    return nu === v;
  }
  /**
   * Слово СТАНУ (а не команди) — для «було» й для «Уже так»: зарядна станція, що стояла, «не заряджається», а не
   * «зарядку зупинено»; робот «на базі», а не «повертається на базу».
   */
  function staatWoord(a, mogelijkheid, v) {
    if (mogelijkheid === 'robot') return ({ start: ['працює', 'bezig'], pauze: ['пауза', 'pauze'], dock: ['на базі', 'in het station'] })[v] || beschrijf(a, mogelijkheid, v);
    if (mogelijkheid === 'programma') return v === 'start' ? ['програма працює', 'het programma loopt'] : ['програма не працює', 'er loopt geen programma'];
    if (mogelijkheid === 'laden' && !v) return ['не заряджається', 'laadt niet'];
    if (mogelijkheid === 'kleur') return ['той самий колір', 'dezelfde kleur'];
    return beschrijf(a, mogelijkheid, v);
  }
  /** Людині — коротке «Уже так» без запису Журналу; виконавцеві без людини — нічого. */
  function alZo(o, d, door) {
    if (door.soort === 'mens' && !o.stil) {
      var v = norm(o.mogelijkheid, o.waarde), m = o.mogelijkheid, wat;
      if (d.soort === 'apparaat') wat = HV.p(d.a.naam) + ': ' + HV.p(staatWoord(d.a, m, v));
      else if (d.soort === 'huis') wat = HV.t('Режим дому: «', 'Huisstand: ‘') + HV.p(STAND_NAAM[v] || [String(v), String(v)]) + HV.t('»', '’');
      else if (d.soort === 'kamer') wat = HV.p(HV.staat.kamer(d.id).naam) + ': ' + (m === 'doel' ? HV.getal(v, 1) + ' °C' : HV.t('світло ', 'licht ') + (v ? HV.woord.aan() : HV.woord.uit()));
      else wat = HV.t('Усе світло вимкнено', 'Alle lampen zijn uit');
      HV.meld({ icoon: 'check', titel: HV.t('Уже так', 'Is al zo'), tekst: wat });
    }
    return Promise.resolve({ ok: true, ongewijzigd: true });
  }

  // ── Niet-apparaatdoelen: режим дому, сцена, кімната, усе світло ──
  var STAND_NAAM = { thuis: ['Вдома', 'Thuis'], afwezig: ['Не вдома', 'Afwezig'], nacht: ['Ніч', 'Nacht'], vakantie: ['Відпустка', 'Vakantie'], gasten: ['Гості', 'Gasten'] };
  HV.huisstanden = STAND_NAAM;

  // ── Що саме станеться: дія словами зі значення ──
  // Двобічні органи — дієсловом напряму; запит «Питати» мусить казати, почне він щось чи зупинить.
  var DOE_WOORD = {
    aan: [['увімкнути', 'aanzetten'], ['вимкнути', 'uitzetten']],
    open: [['відчинити', 'openen'], ['зачинити', 'sluiten']],
    vergrendeld: [['замкнути', 'vergrendelen'], ['відімкнути', 'ontgrendelen']],
    afspelen: [['почати відтворення', 'afspelen starten'], ['зупинити відтворення', 'afspelen stoppen']],
    laden: [['почати зарядку', 'laden starten'], ['зупинити зарядку', 'laden stoppen']]
  };
  /** Перша літера мала — для продовження речення («просить: …», «Запит: …»); скорочення великими літерами не чіпає. */
  function klein(s) {
    s = String(s);
    return s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }
  /**
   * Дія словами: що станеться з ціллю за цього значення — [uk, nl] з великої літери. «Почати зарядку авто» і
   * «Зупинити зарядку авто» — різні тексти однієї дії матриці. Дія може дати власні слова полем doen(a, v) у kern/gevaar.js.
   */
  function actieZin(doel, mogelijkheid, waarde) {
    var d = HV.gevaar.doelSoort(doel), v = norm(mogelijkheid, waarde);
    var actie = HV.gevaar.vind(d.soort === 'apparaat' ? d.a : doel, mogelijkheid, v);
    if (actie.doen) return actie.doen(d.a || null, v);
    if (d.soort === 'apparaat') {
      var a = d.a;
      // дія з назвою-дієсловом саме для цього напряму («Відімкнути двері», «Увімкнути духовку»)
      if (actie.als && actie.sleutel !== 'onbekend') {
        var staart = mogelijkheid === 'alarmstand' && v !== 'uit' ? beschrijf(a, mogelijkheid, v) : null;
        return [actie.naam[0] + ': ' + a.naam[0] + (staart ? ' — ' + staart[0] : ''), actie.naam[1] + ': ' + a.naam[1] + (staart ? ' — ' + staart[1] : '')];
      }
      var woord = DOE_WOORD[mogelijkheid] ? DOE_WOORD[mogelijkheid][v ? 0 : 1] : beschrijf(a, mogelijkheid, v);
      return [a.naam[0] + ': ' + woord[0], a.naam[1] + ': ' + woord[1]];
    }
    if (d.soort === 'huis' && mogelijkheid === 'stand') { var s = STAND_NAAM[v] || [String(v), String(v)]; return ['Режим дому: «' + s[0] + '»', 'Huisstand: ‘' + s[1] + '’']; }
    if (d.soort === 'scene') {
      var scene = HV.staat.w.scenes.filter(function (x) { return x.id === d.id; })[0];
      return scene ? ['Запустити сцену «' + scene.naam[0] + '»', 'Scène ‘' + scene.naam[1] + '’ starten'] : actie.naam;
    }
    if (d.soort === 'kamer') {
      var kamer = HV.staat.kamer(d.id);
      if (kamer && mogelijkheid === 'licht') return [kamer.naam[0] + ': ' + (v ? 'увімкнути світло' : 'вимкнути світло'), kamer.naam[1] + ': ' + (v ? 'licht aanzetten' : 'licht uitzetten')];
      if (kamer && mogelijkheid === 'doel') return [kamer.naam[0] + ': ціль температури ' + HV.getal(v, 1) + ' °C', kamer.naam[1] + ': doeltemperatuur ' + HV.getal(v, 1) + ' °C'];
    }
    return actie.naam;
  }
  HV.actieZin = actieZin;
  /** Чи команда нічого не змінила б: дім напевно вже в цьому стані (те саме правило, що «Уже так» у HV.doe). */
  HV.alZo = function (doel, mogelijkheid, waarde) {
    var d = HV.gevaar.doelSoort(doel);
    if (d.soort !== 'apparaat' && !samengesteldBestaat(d, mogelijkheid)) return false;
    return ongewijzigd(d, mogelijkheid, norm(mogelijkheid, waarde), HV.staat.w);
  };

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
    // «було» — словом стану; для кольору «було» немає (обидва боки звучали б однаково)
    var was = wasWaarde === undefined || o.mogelijkheid === 'kleur' ? null : (['robot', 'programma', 'laden'].indexOf(o.mogelijkheid) >= 0 ? staatWoord(a, o.mogelijkheid, wasWaarde) : beschrijf(a, o.mogelijkheid, wasWaarde));
    var werd = beschrijf(a, o.mogelijkheid, v);
    // «було → стало» лише коли слова справді різні («колір змінено → колір змінено» — не зміна для показу)
    var metDelta = !!was && (was[0] !== werd[0] || was[1] !== werd[1]);
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
        var regel = HV.logboek.voegToe({ maker: door, wat: [a.naam[0] + ': ' + werd[0], a.naam[1] + ': ' + werd[1]], waarom: o.waarom || null, was: metDelta ? was : null, werd: metDelta ? werd : null, toegestaan: toegestaan, soort: 'huis.apparaat', doel: a.id, gewicht: HV.gevaar.isZwaar(actie) ? 'belangrijk' : 'info' });
        HV.klok.stap(0);
        if (!o.stil) {
          var kanTerug = wasWaarde !== undefined && o.mogelijkheid !== 'herstart' && o.mogelijkheid !== 'signaal' && (actie.niveau !== 'gewoon' || door.soort !== 'mens');
          HV.meld({
            maker: door, icoon: HV.paspoort.soorten[a.soort].icoon,
            // як запис Журналу: назва без значення й один чип зміни («Торшер» + «55 % → 35 %»), а не значення двічі
            titel: regel.wat, was: metDelta ? was : null, werd: metDelta ? werd : null,
            tekst: a.beschikbaar === 'verondersteld' ? ['Без зворотного зв’язку: стан припущено.', 'Zonder terugmelding: toestand verondersteld.'] : '',
            // «Повернути» натискає людина: відкат — її дія, а не нова дія виконавця (інакше за «Питати» відкат став би запитом)
            terug: kanTerug ? function () { HV.doe({ doel: a.id, mogelijkheid: o.mogelijkheid, waarde: wasWaarde, door: door.soort === 'mens' ? door : HV.mens(), stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); } : null,
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
   *   tot           — лише для виконавця без людини: якщо дія стане запитом («Питати»), доки цей запит має сенс
   *                   (час дому, наприклад кінець дешевого вікна); після нього ядро закриває запит як «минув».
   *                   Сам строку ядро не ставить.
   *   goedgekeurd   — службове (HV.verzoek): true або { naam:[uk,nl] } — хто схвалив запит раз
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

    // команда, що нічого не змінює: без запису зміни й без «було → стало» з однаковими значеннями
    var zelfde = ongewijzigd(d, o.mogelijkheid, waarde, w);

    // 3–4. людина: роль і ритуал рівня
    if (door.soort === 'mens') {
      if (o.zonderRitueel) return zelfde ? alZo(o, d, door) : voerUit(o, d, actie, door, null);
      var mag = HV.gevaar.rolMag(door.rol || HV.rol(), actie);
      if (!mag.mag) return weiger('rol', HV.t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(mag.reden), HV.t('Попросіть власника або мешканця.', 'Vraag het de eigenaar of een bewoner.'), door);
      if (zelfde) return alZo(o, d, door); // «Уже так» — до ритуалу: підтверджувати нічого
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
    // схвалення людини «Вимкнено» не перекриває: запит існує тільки за «Питати» (за «Завжди» він може чекати лише з
    // власних причин зони — рамки агента; тоді схвалення теж чинне)
    var eenmalig = !!o.goedgekeurd && stand !== 'uit';
    if (eenmalig) stand = 'altijd';
    // що саме мало статися — словами зі значення («почати зарядку авто», а не лише «зарядка авто»)
    var zin = actieZin(o.doel, o.mogelijkheid, waarde);
    // усередині речення («просить: …», «Запит: …») — з малої літери й без другої двокрапки: «відімкнути двері — Замок вхідних дверей»
    var inZin = function (i) { return klein(zin[i]).replace(': ', ' — '); };
    if (stand === 'uit') {
      HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + inZin(0), 'Niet uitgevoerd: ' + inZin(1)], waarom: ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'], soort: door.soort === 'agent' ? 'huis.agent' : 'huis.automatisering' });
      HV.meld({ maker: door, icoon: 'lock', titel: HV.t('Не виконано: дозвіл «Вимкнено»', 'Niet uitgevoerd: toestemming ‘Uit’'), tekst: HV.p(door.naam) + ' · ' + HV.p(zin) });
      HV.staat.wijzig();
      return Promise.resolve({ ok: false, reden: 'stand-uit' });
    }
    // уже так: питати нема про що й виконувати нічого — без запиту й без запису
    if (zelfde) return alZo(o, d, door);
    if (stand === 'vragen') {
      // той самий запит уже чекає (або саме виконується) — другого не створюємо
      var dubbel = w.verzoeken.filter(function (x) { return (x.stand === 'wacht' || x.stand === 'bezig') && x.uitvoerder === uitvoerderId && x.sleutel === actie.sleutel && x.doel === o.doel && x.mogelijkheid === o.mogelijkheid && String(x.waarde) === String(waarde); })[0];
      if (dubbel) return Promise.resolve({ ok: false, reden: 'wacht', verzoek: dubbel.id });
      var id = 'v' + (w.verzoeken.length + 1) + '-' + Date.now() % 10000;
      // Строку ядро запитові не ставить (поля tot немає): «Чекає до» називає лише сам запит. Текст — зі значення: для
      // старту й для зупинки зарядки він різний, людина не схвалює наосліп.
      HV.staat.wijzig(function (x) {
        var verzoek = { id: id, uitvoerder: uitvoerderId, sleutel: actie.sleutel, doel: o.doel, mogelijkheid: o.mogelijkheid, waarde: waarde, sinds: x.tijd, stand: 'wacht', wat: zin, waarom: o.waarom || null };
        if (o.tot && o.tot > x.tijd) verzoek.tot = o.tot; // строк, який назвав сам виконавець (кінець дешевого вікна)
        x.verzoeken.push(verzoek);
        x.nu.push({ id: 'verzoek-' + id, soort: 'verzoek', maker: door.soort, icoon: 'circle-help', verzoek: id, sinds: x.tijd, tekst: [door.naam[0] + ' просить: ' + inZin(0), door.naam[1] + ' vraagt: ' + inZin(1)], acties: [{ naam: 'verzoek-ja', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'], gegevens: { verzoek: id } }, { naam: 'verzoek-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { verzoek: id } }] });
      });
      HV.logboek.voegToe({ maker: door, wat: ['Запит: ' + inZin(0), 'Verzoek: ' + inZin(1)], waarom: ['дозвіл «Питати»', 'toestemming ‘Vragen’'], soort: door.soort === 'agent' ? 'huis.agent' : 'huis.automatisering', gewicht: 'belangrijk' });
      HV.meld({ maker: door, gewicht: 'belangrijk', icoon: 'circle-help', titel: HV.t('Чекає на вас', 'Wacht op jou'), tekst: HV.p(door.naam) + ': ' + HV.p([inZin(0), inZin(1)]) });
      return Promise.resolve({ ok: false, reden: 'wacht', verzoek: id });
    }
    // хто схвалив: людина, що натиснула «Схвалити раз» (для відкладеного запиту — та, що схвалила заздалегідь)
    var keurder = o.goedgekeurd && o.goedgekeurd.naam ? o.goedgekeurd.naam : HV.mens().naam;
    return voerUit(o, d, actie, door, eenmalig ? ['схвалено раз: ' + keurder[0], 'één keer goedgekeurd: ' + keurder[1]] : ['дозвіл «Завжди»', 'toestemming ‘Altijd’']);
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
  var SYSTEEM = { soort: 'systeem', naam: ['Система', 'Systeem'] };
  /** Вид сповіщення запиту — за виконавцем: агент → huis.agent; сцена, автоматизація, оптимізатор → huis.automatisering. · Soort melding volgt de uitvoerder. */
  function soortBij(uitvoerderId) { return HV.gevaar.uitvoerder(uitvoerderId).soort === 'agent' ? 'huis.agent' : 'huis.automatisering'; }
  function vindVerzoek(id) { var l = (HV.staat.w && HV.staat.w.verzoeken) || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  /** Запит без команди пристрою (агент читає дані): ядро лише фіксує рішення. */
  function zonderOpdracht(v) { return !!v.mcp || typeof v.doel !== 'string' || !v.mogelijkheid || v.doel.indexOf('mcp:') === 0; }
  /** Схвалений запит із власним часом виконання (v.om), який ще не настав: чекає годинника дому. */
  function isGepland(v) { return v.stand === 'goedgekeurd' && !!v.gepland && !v.uitkomst; }
  /** Запит ще відкритий: чекає рішення або схвалений і чекає свого часу. */
  function isOpen(v) { return v.stand === 'wacht' || isGepland(v); }

  /**
   * Рішення людини щодо запиту за режимом «Питати»: HV.verzoek(id, ja, opties?) → Promise<{ ok, reden?, gepland? }>.
   * Ворота стоять ТУТ, щоб їх не оминала жодна кнопка («Зараз важливо», картка Журналу, черга агентів):
   *   зв'язок → хто вирішує (HV.gevaar.magBeslissen: небезпечні й критичні — лише власник, решта — власник або мешканець;
   *   інакше відмова «Вирішує власник», запит лишається wacht) → чинний дозвіл (за «Вимкнено» запит знімається) →
   *   ритуал рівня для людини (небезпечна — рейка, критична — рейка й підтвердження входу; «Уже так» — без ритуалу).
   * Схвалене дорівнює виконаному: запит із власним часом (v.om, «Зарядити авто о 02:00») після схвалення чекає цього
   * часу й виконується годинником дому; решта виконується одразу. Схвалений запит зникає з «Зараз важливо» лише після
   * того, як дім підтвердив виконання; якщо дію не виконано (немає зв'язку, пристрій недоступний), запит чекає далі,
   * людина бачить причину, а в Журналі з'являється «Не виконано: …». Рішення людини — окремий запис Журналу.
   * opties.naPoort(v) — викликається, коли всі ворота пройдено, перед виконанням (для власних записів зони).
   */
  HV.verzoek = function (id, ja, opties) {
    var w = HV.staat.w, op = opties || {};
    var v = vindVerzoek(id);
    if (!v || v.stand !== 'wacht') return Promise.resolve({ ok: false });
    if (HV.zonderVerbinding()) { HV.logboek.geweigerd++; HV.meldZonderVerbinding(); return Promise.resolve({ ok: false, reden: 'verbinding' }); }
    var mens = HV.mens();
    var wie = HV.gevaar.uitvoerder(v.uitvoerder);
    var actie = HV.gevaar.actie(v.sleutel);
    // (а) хто вирішує: гість і дитина — ніколи; мешканець схвалює звичайне й чутливе, відхилити може будь-що
    var magJa = HV.gevaar.magBeslissen(mens.rol, actie), magNee = magJa || mens.rol === 'bewoner';
    if (ja ? !magJa : !magNee) {
      HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: HV.t('Вирішує власник', 'De eigenaar beslist'),
        tekst: mens.rol === 'bewoner' ? HV.t('Небезпечні й критичні дії схвалює лише власник.', 'Gevaarlijke en kritieke acties keurt alleen de eigenaar goed.') : HV.t('Запити виконавців вирішує власник або мешканець.', 'Verzoeken van uitvoerders beslist de eigenaar of een bewoner.') });
      return Promise.resolve({ ok: false, reden: 'rol' });
    }
    // Запит існує лише за «Питати». Якщо дозвіл цієї дії для цього виконавця вже «Вимкнено», схвалити його неможливо
    // з жодної кнопки: запит знімається сам (запис у Журналі), людина бачить чому.
    var dicht = function () {
      vervalt(v, 'stand-uit');
      HV.meld({ gewicht: 'belangrijk', icoon: 'lock', maker: mens, titel: HV.t('Не схвалено: дозвіл «Вимкнено»', 'Niet goedgekeurd: toestemming ‘Uit’'), tekst: HV.p(wie.naam) + ' · ' + HV.p(v.wat) + HV.t('. Запит знято.', '. Het verzoek is vervallen.') });
      return { ok: false, reden: 'stand-uit' };
    };
    if (ja && HV.gevaar.stand(v.uitvoerder, v.sleutel) === 'uit') return Promise.resolve(dicht());
    if (!ja) {
      HV.staat.wijzig(function (x) { v.stand = 'afgewezen'; x.nu = x.nu.filter(function (n) { return n.verzoek !== id; }); });
      HV.logboek.voegToe({ maker: mens, wat: ['Відхилено запит: ' + v.wat[0], 'Verzoek afgewezen: ' + v.wat[1]], waarom: [wie.naam[0], wie.naam[1]], soort: soortBij(v.uitvoerder) });
      HV.meld({ maker: mens, titel: HV.t('Запит відхилено', 'Verzoek afgewezen'), tekst: HV.p(v.wat) });
      return Promise.resolve({ ok: true });
    }
    var door = { soort: wie.soort, id: wie.id, naam: wie.naam };
    var los = zonderOpdracht(v);
    var d = los ? null : HV.gevaar.doelSoort(v.doel), waarde = los ? v.waarde : norm(v.mogelijkheid, v.waarde);
    var besluit = function (waarom) { HV.logboek.voegToe({ maker: mens, wat: ['Схвалено раз: ' + v.wat[0], 'Eén keer goedgekeurd: ' + v.wat[1]], waarom: waarom || wie.naam, soort: soortBij(v.uitvoerder) }); };

    var uitvoeren = function () {
      if (op.naPoort) op.naPoort(v);
      // запит без команди пристрою: дім нічого не змінює — рішення й дія агента стають двома записами
      if (los) {
        HV.staat.wijzig(function (x) { v.stand = 'goedgekeurd'; v.uitkomst = 'uitgevoerd'; x.nu = x.nu.filter(function (n) { return n.verzoek !== id; }); });
        besluit();
        HV.logboek.voegToe({ maker: door, wat: v.wat, toegestaan: ['схвалено раз: ' + mens.naam[0], 'één keer goedgekeurd: ' + mens.naam[1]], soort: soortBij(v.uitvoerder) });
        HV.meld({ maker: mens, icoon: 'check', titel: HV.t('Схвалено раз', 'Eén keer goedgekeurd'), tekst: HV.p(v.wat) });
        return Promise.resolve({ ok: true });
      }
      // запит називає власний час («о 02:00»): схвалене виконається саме тоді, а не в мить схвалення
      if (v.om && v.om > HV.staat.w.tijd) {
        HV.staat.wijzig(function (x) { v.stand = 'goedgekeurd'; v.uitkomst = null; v.gepland = { om: v.om, tijd: x.tijd, wie: mens.naam }; x.nu = x.nu.filter(function (n) { return n.verzoek !== id; }); });
        besluit([wie.naam[0] + ' · виконається о ' + HV.tijd(v.om), wie.naam[1] + ' · wordt om ' + HV.tijd(v.om) + ' uitgevoerd']);
        HV.meld({ maker: mens, icoon: 'calendar-clock', titel: HV.t('Схвалено: виконається о ', 'Goedgekeurd: wordt uitgevoerd om ') + HV.tijd(v.om), tekst: HV.p(v.wat) });
        return Promise.resolve({ ok: true, gepland: v.om });
      }
      besluit();
      HV.staat.wijzig(function () { v.stand = 'bezig'; });
      return HV.doe({ doel: v.doel, mogelijkheid: v.mogelijkheid, waarde: v.waarde, door: door, goedgekeurd: { naam: mens.naam }, waarom: v.waarom }).then(function (uitkomst) {
        if (uitkomst && uitkomst.ok) {
          HV.staat.wijzig(function (x) { v.stand = 'goedgekeurd'; v.uitkomst = uitkomst.ongewijzigd ? 'alzo' : 'uitgevoerd'; x.nu = x.nu.filter(function (n) { return n.verzoek !== id; }); });
          // дім уже в цьому стані: зміни немає, запит закрито (рішення людини вже є в Журналі)
          if (uitkomst.ongewijzigd) {
            HV.logboek.voegToe({ maker: SYSTEEM, wat: ['Запит закрито: ' + v.wat[0], 'Verzoek gesloten: ' + v.wat[1]], waarom: ['уже так: змін не було', 'was al zo: niets gewijzigd'], soort: soortBij(v.uitvoerder) });
            HV.meld({ maker: mens, icoon: 'check', titel: HV.t('Уже так', 'Is al zo'), tekst: HV.p(v.wat) + HV.t(' · запит закрито', ' · verzoek gesloten') });
          }
          return uitkomst;
        }
        var reden = uitkomst && uitkomst.reden;
        // дозвіл вимкнули, поки запит виконувався: запит знято
        if (reden === 'stand-uit') { HV.staat.wijzig(function () { v.stand = 'wacht'; }); vervalt(v, 'stand-uit'); return uitkomst; }
        HV.staat.wijzig(function () { v.stand = 'wacht'; v.uitkomst = 'niet'; });
        // «не підтверджено» пристрій уже пояснив сам (сповіщення й запис «не виконано»); решту причин називаємо тут
        if (reden !== 'niet-uitgevoerd') {
          var waarom = NIET[reden] || NIET.onbekend;
          HV.meld({ gewicht: 'belangrijk', icoon: reden === 'verbinding' ? 'wifi-off' : 'circle-x', maker: door, titel: HV.t('Не виконано: ', 'Niet uitgevoerd: ') + HV.p(v.wat), tekst: HV.t('Причина: ', 'Reden: ') + HV.p(waarom) + HV.t('. Запит чекає далі.', '. Het verzoek blijft wachten.') });
          if (reden !== 'verbinding' && reden !== 'gestopt') HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + v.wat[0], 'Niet uitgevoerd: ' + v.wat[1]], waarom: waarom, soort: soortBij(v.uitvoerder), gewicht: 'belangrijk' });
        }
        return uitkomst || { ok: false };
      });
    };

    // (б) ритуал рівня: схвалення — дія людини, тож небезпечне проходить рейку, критичне — ще й підтвердження входу.
    // Коли дім уже в цьому стані, підтверджувати нічого («Уже так» — до ритуалу, як у HV.doe).
    var zelfde = !los && (d.soort === 'apparaat' || samengesteldBestaat(d, v.mogelijkheid)) && ongewijzigd(d, v.mogelijkheid, waarde, w);
    if (HV.gevaar.isZwaar(actie) && !zelfde && HV.schil && HV.schil.gevaar) {
      return HV.schil.gevaar({ actie: actie, apparaat: (d && d.a) || null, naam: HV.p(v.wat), waarde: waarde }).then(function (bevestigd) {
        if (!bevestigd) return { ok: false, reden: 'geannuleerd' };
        // поки тривав ритуал, запит могли зняти чи вирішити, а дозвіл — вимкнути
        if (vindVerzoek(id) !== v || v.stand !== 'wacht') return { ok: false };
        if (HV.gevaar.stand(v.uitvoerder, v.sleutel) === 'uit') return dicht();
        return uitvoeren();
      });
    }
    return uitvoeren();
  };

  // ── Запит і зміна дозволу, строк запиту, зняття запиту ──
  // Запит існує лише за «Питати». Власник перемкнув дозвіл цієї дії для цього виконавця:
  //   на «Вимкнено» — відкриті запити знімаються самі (запис «Запит знято: …», чому — «дозвіл вимкнено»),
  //                    зникають із «Зараз важливо» і з черги «Чекає на вас»;
  //   на «Завжди»   — запити, що чекають, виконуються за новим дозволом (запис дії з «Дозволено правилом: дозвіл „Завжди“»);
  //                    запит із власним часом (v.om) — у свій час.
  // Запит знімається й сам: коли минув строк, який він сам назвав (v.tot — ядро строків не ставить), коли дім уже в цьому
  // стані («уже так»: схвалення нічого б не змінило) і коли його зняв автор (HV.verzoekIntrekken).
  function wachtenden(uitvoerder, sleutel, ookGepland) {
    return ((HV.staat.w && HV.staat.w.verzoeken) || []).filter(function (v) { return (v.stand === 'wacht' || (ookGepland && isGepland(v))) && (!uitvoerder || v.uitvoerder === uitvoerder) && (!sleutel || v.sleutel === sleutel); });
  }
  /**
   * Зняти відкритий запит. Стан — «verlopen» (його знають усі списки «вирішено»); причина — у v.vervallen:
   * { reden: 'stand-uit' | 'tijd' | 'alzo' | 'ingetrokken', tijd, tekst? } (tekst — пара [uk, nl] із поясненням).
   */
  function vervalt(v, reden, tekst) {
    var wie = HV.gevaar.uitvoerder(v.uitvoerder), soort = reden || 'stand-uit';
    HV.staat.wijzig(function (x) {
      v.stand = 'verlopen'; v.vervallen = { reden: soort, tijd: x.tijd, tekst: tekst || null }; if (v.gepland) v.gepland.bezig = false;
      x.nu = x.nu.filter(function (n) { return n.verzoek !== v.id; });
    });
    var regel;
    if (soort === 'tijd') regel = { maker: SYSTEEM, wat: ['Запит минув: ' + v.wat[0], 'Verzoek verlopen: ' + v.wat[1]], waarom: ['чекав до ' + HV.tijd(v.tot) + ' · ' + wie.naam[0], 'wachtte tot ' + HV.tijd(v.tot) + ' · ' + wie.naam[1]] };
    else if (soort === 'alzo') regel = { maker: SYSTEEM, wat: ['Запит знято: ' + v.wat[0], 'Verzoek vervallen: ' + v.wat[1]], waarom: ['уже так' + (tekst ? ': ' + tekst[0] : '') + ' · ' + wie.naam[0], 'is al zo' + (tekst ? ': ' + tekst[1] : '') + ' · ' + wie.naam[1]] };
    else if (soort === 'ingetrokken') regel = { maker: { soort: wie.soort, naam: wie.naam }, wat: ['Запит знято: ' + v.wat[0], 'Verzoek ingetrokken: ' + v.wat[1]], waarom: tekst || ['запит більше не потрібен', 'het verzoek is niet meer nodig'] };
    else regel = { maker: SYSTEEM, wat: ['Запит знято: ' + v.wat[0], 'Verzoek vervallen: ' + v.wat[1]], waarom: ['дозвіл вимкнено · ' + wie.naam[0], 'toestemming uitgezet · ' + wie.naam[1]] };
    regel.soort = 'huis.agent';
    HV.logboek.voegToe(regel);
  }
  /**
   * Автор знімає власний запит, що втратив сенс (вікно дешевої ціни минуло, авто вже заряджене): HV.verzoekIntrekken(id, reden).
   * reden — пара [uk, nl]. Запит дістає стан verlopen, у Журналі — «Запит знято: …» із причиною від імені автора, рядок
   * зникає з «Зараз важливо». Діє для запиту, що чекає, і для схваленого, який ще чекає свого часу. Повертає true, якщо знято.
   */
  HV.verzoekIntrekken = function (id, reden) {
    var v = vindVerzoek(id);
    if (!v || !isOpen(v)) return false;
    vervalt(v, 'ingetrokken', reden || null);
    return true;
  };
  /** Виконати запит, що чекав: дозвіл тепер «Завжди». */
  function voerWachtendeUit(v) {
    var wie = HV.gevaar.uitvoerder(v.uitvoerder), door = { soort: wie.soort, id: wie.id, naam: wie.naam };
    var waarom = ['запит чекав; дозвіл тепер «Завжди»', 'het verzoek wachtte; de toestemming is nu ‘Altijd’'];
    var sluit = function (stand, uitkomst) { HV.staat.wijzig(function (x) { v.stand = stand; v.uitkomst = uitkomst; v.viaStand = 'altijd'; x.nu = x.nu.filter(function (n) { return n.verzoek !== v.id; }); }); };
    // запит без команди пристрою (читання даних агентом): ядро лише фіксує, що дію дозволено
    if (zonderOpdracht(v)) {
      sluit('goedgekeurd', 'uitgevoerd');
      HV.logboek.voegToe({ maker: door, wat: v.wat, waarom: waarom, toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: soortBij(v.uitvoerder) });
      return Promise.resolve({ ok: true });
    }
    // запит із власним часом виконується у свій час, а не в мить зміни дозволу
    if (v.om && v.om > HV.staat.w.tijd) {
      HV.staat.wijzig(function (x) { v.stand = 'goedgekeurd'; v.uitkomst = null; v.viaStand = 'altijd'; v.gepland = { om: v.om, tijd: x.tijd, wie: null }; x.nu = x.nu.filter(function (n) { return n.verzoek !== v.id; }); });
      HV.logboek.voegToe({ maker: SYSTEEM, wat: ['Запит заплановано: ' + v.wat[0], 'Verzoek ingepland: ' + v.wat[1]], waarom: ['дозвіл тепер «Завжди»; виконається о ' + HV.tijd(v.om), 'de toestemming is nu ‘Altijd’; wordt om ' + HV.tijd(v.om) + ' uitgevoerd'], soort: soortBij(v.uitvoerder) });
      return Promise.resolve({ ok: true, gepland: v.om });
    }
    // рішення від людини більше не потрібне: рядок у «Зараз важливо» зникає одразу, запит — «виконується»
    HV.staat.wijzig(function (x) { v.stand = 'bezig'; x.nu = x.nu.filter(function (n) { return n.verzoek !== v.id; }); });
    return HV.doe({ doel: v.doel, mogelijkheid: v.mogelijkheid, waarde: v.waarde, door: door, waarom: waarom }).then(function (r) {
      if (r && r.ok) {
        sluit('goedgekeurd', r.ongewijzigd ? 'alzo' : 'uitgevoerd');
        if (r.ongewijzigd) HV.logboek.voegToe({ maker: SYSTEEM, wat: ['Запит закрито: ' + v.wat[0], 'Verzoek gesloten: ' + v.wat[1]], waarom: ['дозвіл тепер «Завжди»; уже так, змін не було', 'de toestemming is nu ‘Altijd’; was al zo, niets gewijzigd'], soort: soortBij(v.uitvoerder) });
        return r;
      }
      // не виконано (пристрій недоступний, самостійні дії зупинено…): за «Завжди» запитів не буває — запит закрито з причиною
      var reden = r && r.reden;
      sluit('verlopen', 'niet');
      if (reden !== 'niet-uitgevoerd' && reden !== 'gestopt' && reden !== 'stand-uit') HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + v.wat[0], 'Niet uitgevoerd: ' + v.wat[1]], waarom: NIET[reden] || NIET.onbekend, soort: soortBij(v.uitvoerder), gewicht: 'belangrijk' });
      return r || { ok: false };
    });
  }
  /** Настав час схваленого запиту (v.gepland.om): дія виконується годинником дому. */
  function voerGeplandUit(v) {
    var wie = HV.gevaar.uitvoerder(v.uitvoerder), door = { soort: wie.soort, id: wie.id, naam: wie.naam };
    var viaStand = v.viaStand === 'altijd';
    v.gepland.bezig = true;
    var sluit = function (uitkomst) { HV.staat.wijzig(function () { v.uitkomst = uitkomst; if (v.gepland) v.gepland.bezig = false; if (uitkomst === 'niet' && viaStand) v.stand = 'verlopen'; }); };
    return HV.doe({ doel: v.doel, mogelijkheid: v.mogelijkheid, waarde: v.waarde, door: door, goedgekeurd: viaStand ? false : { naam: v.gepland.wie || HV.mens().naam }, waarom: v.waarom }).then(function (r) {
      if (r && r.ok) {
        sluit(r.ongewijzigd ? 'alzo' : 'uitgevoerd');
        if (r.ongewijzigd) HV.logboek.voegToe({ maker: SYSTEEM, wat: ['Запит закрито: ' + v.wat[0], 'Verzoek gesloten: ' + v.wat[1]], waarom: ['уже так: змін не було', 'was al zo: niets gewijzigd'], soort: soortBij(v.uitvoerder) });
        return r;
      }
      var reden = r && r.reden;
      sluit('niet');
      // «не підтверджено», «самостійні дії зупинено» й «Вимкнено» уже пояснено записом самої дії
      if (reden !== 'niet-uitgevoerd' && reden !== 'gestopt' && reden !== 'stand-uit' && reden !== 'wacht') HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + v.wat[0], 'Niet uitgevoerd: ' + v.wat[1]], waarom: NIET[reden] || NIET.onbekend, soort: soortBij(v.uitvoerder), gewicht: 'belangrijk' });
      return r || { ok: false };
    });
  }
  /**
   * Дозвіл змінено (HV.gevaar.zetStand викликає це сам). Повертає Promise<{ vervallen, uitgevoerd }> — скільки запитів
   * знято й скільки виконано.
   */
  HV.verzoekenNaStand = function (uitvoerder, sleutel, waarde) {
    var lijst = wachtenden(uitvoerder, sleutel, waarde === 'uit');
    if (!lijst.length || (waarde !== 'uit' && waarde !== 'altijd')) return Promise.resolve({ vervallen: 0, uitgevoerd: 0 });
    var wie = HV.gevaar.uitvoerder(uitvoerder), actie = HV.gevaar.actie(sleutel);
    if (waarde === 'uit') {
      lijst.forEach(function (v) { vervalt(v, 'stand-uit'); });
      HV.meld({ icoon: 'lock', maker: SYSTEEM, titel: HV.t('Запит знято: дозвіл вимкнено', 'Verzoek vervallen: toestemming uitgezet'), tekst: HV.p(wie.naam) + ' · ' + (lijst.length === 1 ? HV.p(lijst[0].wat) : HV.p(actie.naam) + ' · ' + lijst.length) });
      return Promise.resolve({ vervallen: lijst.length, uitgevoerd: 0 });
    }
    return Promise.all(lijst.map(voerWachtendeUit)).then(function (rs) {
      return { vervallen: 0, uitgevoerd: rs.filter(function (r) { return r && r.ok; }).length };
    });
  };
  /**
   * Що зробить «Завжди» із запитами, які зараз чекають на цю дію цього виконавця, — одним рядком [uk, nl] для підказки
   * біля перемикача й діалогу підтвердження; null, коли таких запитів немає.
   */
  HV.verzoekenBijAltijd = function (uitvoerder, sleutel) {
    var lijst = wachtenden(uitvoerder, sleutel);
    if (!lijst.length) return null;
    var nu = HV.staat.w.tijd, later = lijst.some(function (v) { return v.om && v.om > nu; });
    var namen = function (i) { return lijst.map(function (v) { return v.wat[i]; }).join('; '); };
    return ['Запитів, що чекають: ' + lijst.length + ' — «Завжди» виконає ' + (later ? 'без запитання, у названий час' : 'одразу') + ': ' + namen(0),
      'Wachtende verzoeken: ' + lijst.length + ' — ‘Altijd’ voert ' + (later ? 'zonder te vragen uit, op het genoemde tijdstip' : 'meteen uit') + ': ' + namen(1)];
  };
  /**
   * Стан запиту одним висловом [uk, nl] — для карток і списків «вирішено» всіх зон: знятий запит не «минув», а виконаний
   * перемиканням на «Завжди» ніхто не «схвалював».
   */
  HV.verzoekWoord = function (v) {
    var om = v.gepland ? HV.tijd(v.gepland.om) : '';
    if (v.stand === 'wacht') return v.uitkomst === 'niet' ? ['чекає · не виконано', 'wacht · niet uitgevoerd'] : ['чекає', 'wacht'];
    if (v.stand === 'bezig') return ['виконується', 'wordt uitgevoerd'];
    if (v.stand === 'afgewezen') return ['відхилено', 'afgewezen'];
    if (v.stand === 'goedgekeurd') {
      if (v.viaStand === 'altijd') {
        if (isGepland(v)) return ['за дозволом «Завжди» · виконається о ' + om, 'met toestemming ‘Altijd’ · wordt om ' + om + ' uitgevoerd'];
        if (v.uitkomst === 'alzo') return ['за дозволом «Завжди» · уже так', 'met toestemming ‘Altijd’ · was al zo'];
        return ['виконано за дозволом «Завжди»', 'uitgevoerd met toestemming ‘Altijd’'];
      }
      if (isGepland(v)) return ['схвалено · виконається о ' + om, 'goedgekeurd · wordt om ' + om + ' uitgevoerd'];
      if (v.uitkomst === 'alzo') return ['схвалено · уже так', 'goedgekeurd · was al zo'];
      if (v.uitkomst === 'niet') return ['схвалено · не виконано', 'goedgekeurd · niet uitgevoerd'];
      return v.uitkomst === 'uitgevoerd' ? ['схвалено · виконано', 'goedgekeurd · uitgevoerd'] : ['схвалено', 'goedgekeurd'];
    }
    // verlopen: знято з причини або справді минув власний строк запиту
    var r = v.vervallen ? v.vervallen.reden : null, uitleg = v.vervallen && v.vervallen.tekst;
    if (r === 'stand-uit') return ['знято: дозвіл вимкнено', 'vervallen: toestemming uitgezet'];
    if (r === 'alzo') return ['знято: уже так', 'vervallen: was al zo'];
    if (r === 'ingetrokken') return uitleg ? ['знято: ' + uitleg[0], 'ingetrokken: ' + uitleg[1]] : ['знято автором', 'ingetrokken'];
    if (v.viaStand === 'altijd' && v.uitkomst === 'niet') return ['не виконано за дозволом «Завжди»', 'niet uitgevoerd met toestemming ‘Altijd’'];
    return v.tot ? ['минув о ' + HV.tijd(v.tot), 'verlopen om ' + HV.tijd(v.tot)] : ['минув', 'verlopen'];
  };
  // Кожен кадр ядро перевіряє відкриті запити:
  //   дозвіл став «Вимкнено» й без руки власника в цю мить (zetStandStil, строк рамок, який він сам поставив) — запит знято;
  //   минув строк, який назвав сам запит (v.tot), — «минув»;
  //   дім уже в стані, якого просить запит, — «уже так», запит знято (схвалення нічого б не змінило);
  //   настав час схваленого запиту (v.gepland.om) — дія виконується.
  // За «Завжди» запит може чекати з власних причин зони (рамки агента), тому тут він не виконується — лише за прямою
  // зміною дозволу. Без зв'язку з домом нічого з цього не робиться: показано останній знімок.
  if (HV.staat && HV.staat.abonneer) {
    HV.staat.abonneer(function (w) {
      if (!w || !w.verzoeken || !w.verzoeken.length || HV.zonderVerbinding()) return;
      w.verzoeken.slice().forEach(function (v) {
        if (!isOpen(v)) return;
        if (v.sleutel && v.sleutel !== 'onbekend' && HV.gevaar.stand(v.uitvoerder, v.sleutel) === 'uit') { vervalt(v, 'stand-uit'); return; }
        if (v.stand === 'wacht') {
          if (v.tot && w.tijd >= v.tot) { vervalt(v, 'tijd'); return; }
          if (zonderOpdracht(v)) return;
          var d = HV.gevaar.doelSoort(v.doel), waarde = norm(v.mogelijkheid, v.waarde);
          if (d.soort === 'apparaat' && ongewijzigd(d, v.mogelijkheid, waarde, w)) vervalt(v, 'alzo', staatWoord(d.a, v.mogelijkheid, waarde));
        } else if (!v.gepland.bezig && w.tijd >= v.gepland.om) voerGeplandUit(v);
      });
    });
  }

  /** Зупинити чи відновити самостійні дії (автоматизації, агенти, оптимізація). */
  HV.zelfStop = function (stop) {
    var mens = HV.mens();
    HV.staat.wijzig(function (w) { w.zelfGestopt = stop; });
    HV.logboek.voegToe({ maker: mens, wat: stop ? ['Самостійні дії зупинено', 'Zelfstandige acties gestopt'] : ['Самостійні дії відновлено', 'Zelfstandige acties hervat'], soort: 'huis.systeem', gewicht: 'belangrijk' });
    HV.meld({ maker: mens, gewicht: 'belangrijk', titel: stop ? HV.t('Самостійні дії зупинено', 'Zelfstandige acties gestopt') : HV.t('Самостійні дії відновлено', 'Zelfstandige acties hervat'), tekst: HV.t('Автоматизації, агенти й оптимізація.', 'Automatiseringen, agenten en optimalisatie.'), terug: function () { HV.zelfStop(!stop); } });
  };
})(window.HV = window.HV || {});
