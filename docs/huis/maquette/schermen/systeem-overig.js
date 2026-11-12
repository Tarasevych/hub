// Systeem — overige tabbladen: Schermen · Integraties · Simulator · Gegevens · Geheimen · Diagnose · Toegankelijkheid ·
// Toonzaal · Rekenhulp · Onderdelen. Розділ «Система» під /instellingen/…: зовнішні екрани зі сполученням кодом, джерела
// й майстер нового пристрою, симулятор (час, сценарії, «Світ», «Траси», збої), зберігання, секрети без значень,
// діагностика ланцюжка зв'язку, доступність, вітрина, калькулятор окупності й живий довідник компонентів hv-*.
//
// Налаштування системи живуть у сховищі зони (X), а не у світі: перезапуск сценарію світ перебудовує, а екрани,
// секрети, траси й збої лишаються. Усе, що змінює світ чи систему, лишає запис у Журналі, сповіщення й «Повернути».
// Команди пристроям ідуть лише через HV.doe; обгортка нижче лише записує їх (діагностика, траси) і додає затримку збою.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o, ic = HV.icoon;

  // ───────────────────────── Сховище зони ─────────────────────────
  var REEL = function () { return Date.now(); };
  var X = {
    schermen: [
      { id: 'keuken', naam: ['Панель на кухні', 'Paneel keuken'], profiel: 'wand', kamer: 'keuken', dichtheid: 'ruim', thema: 'auto', online: true, gezien: 12, sinds: '2026-09-12', zuinig: false },
      { id: 'hal', naam: ['Панель біля дверей', 'Paneel bij de deur'], profiel: 'deur', kamer: 'hal', dichtheid: 'ruim', thema: 'auto', online: true, gezien: 4, sinds: '2026-09-12', zuinig: false },
      { id: 'woonkamer', naam: ['Телевізор у вітальні', 'Televisie woonkamer'], profiel: 'tv', kamer: 'woonkamer', dichtheid: 'ruim', thema: 'donker', online: true, gezien: 31, sinds: '2026-10-03', zuinig: false },
      { id: 'werkkamer', naam: ['Стрічка над столом', 'Strook boven het bureau'], profiel: 'strook', kamer: 'werkkamer', dichtheid: 'compact', thema: 'auto', online: true, gezien: 9, sinds: '2026-10-21', zuinig: true },
      { id: 'slaapkamer', naam: ['Круглий годинник біля ліжка', 'Ronde klok bij het bed'], profiel: 'rond', kamer: 'slaapkamer', dichtheid: 'normaal', thema: 'donker', online: true, gezien: 22, sinds: '2026-10-21', zuinig: false },
      { id: 'koelkast', naam: ['Чорнило на холодильнику', 'Inkt op de koelkast'], profiel: 'inkt', kamer: 'keuken', dichtheid: 'normaal', thema: 'auto', online: false, gezien: 7380, sinds: '2026-08-02', zuinig: true },
      { id: 'olena', naam: ['Годинник Олени', 'Horloge van Olena'], profiel: 'horloge', kamer: null, dichtheid: 'compact', thema: 'donker', online: true, gezien: 48, sinds: '2026-11-01', zuinig: false }
    ],
    koppel: null,            // { code, tot (справжній час), stap:'wacht'|'zoekt'|'gevonden', kamer, profiel }
    integratie: { herstart: 0, melden: {}, wizard: null },
    sim: { vertraging: 0, geenBevestiging: false, adapter: 'goed', extern: false, start600: null },
    wereld: {},              // ручні значення: sleutel → { naam, was, werd, herstel }
    virtueel: [],            // віртуальні пристрої (переживають перезапуск сценарію)
    sporen: {
      lijst: [
        { id: 's1', naam: ['Вечірній прихід', 'Thuiskomst in de avond'], scenario: 'terugkeer', duur: 12000, opgeslagen: true, acties: [
          { dt: 1500, doel: 'hallicht', mogelijkheid: 'aan', waarde: true }, { dt: 4200, doel: 'torsher', mogelijkheid: 'aan', waarde: true },
          { dt: 7400, doel: 'garagedeur', mogelijkheid: 'open', waarde: false }, { dt: 10600, doel: 'thermostaat', mogelijkheid: 'doel', waarde: 21.5 }] },
        { id: 's2', naam: ['Ранок без кави', 'Ochtend zonder koffie'], scenario: 'ochtend', duur: 8000, opgeslagen: false, acties: [
          { dt: 1200, doel: 'koffie', mogelijkheid: 'aan', waarde: false }, { dt: 3600, doel: 'speakerkeuken', mogelijkheid: 'afspelen', waarde: false },
          { dt: 6200, doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 60 }] }
      ],
      opname: null, speelt: null, teller: 2
    },
    opdrachten: [],          // останні команди HV.doe (діагностика): { id, doel, mogelijkheid, waarde, door, echt, tijd, fase, ms }
    diag: { controle: null, deel: 'toestanden', route: 'tunnel' },
    bewaar: { ruw: 14, toestanden: 400, gebeurtenissen: 400, routes: 30 },
    geheimen: [
      { id: 'mcpclaude', code: 'MCP_CLAUDE_SLEUTEL', naam: ['Ключ агента Claude', 'Sleutel van agent Claude'], datum: '2026-09-14', waar: [['Агенти', 'Agenten', 'automatiseringen-agenten'], ['MCP-з’єднувач', 'MCP-koppeling', 'automatiseringen-agenten']], gebruikt: 1 },
      { id: 'mcpgemini', code: 'MCP_GEMINI_SLEUTEL', naam: ['Ключ агента Gemini', 'Sleutel van agent Gemini'], datum: '2026-09-14', waar: [['Агенти', 'Agenten', 'automatiseringen-agenten']], gebruikt: 1 },
      { id: 'knmi', code: 'KNMI_WEER_SLEUTEL', naam: ['Ключ служби погоди KNMI', 'Sleutel van de KNMI-weerdienst'], datum: '2026-08-30', waar: [['Погода дому', 'Weer van het huis', 'instellingen-woning']], gebruikt: 1 },
      { id: 'push', code: 'PUSH_VAPID_SLEUTEL', naam: ['Ключ сповіщень на пристрій', 'Sleutel voor meldingen op het toestel'], datum: '2026-07-01', waar: [['Сповіщення', 'Meldingen', 'instellingen-meldingen']], gebruikt: 1 },
      { id: 'tunnel', code: 'TUNNEL_TOKEN', naam: ['Ключ тунелю до сайту', 'Sleutel van de tunnel naar de site'], datum: '2026-05-20', waar: [['Діагностика', 'Diagnose', 'instellingen-diagnose']], gebruikt: 1 },
      { id: 'post', code: 'SMTP_WACHTWOORD', naam: ['Пароль пошти сповіщень', 'Wachtwoord van de meldingsmail'], datum: '2026-03-11', waar: [['Сповіщення', 'Meldingen', 'instellingen-meldingen']], gebruikt: 1 },
      { id: 'ha', code: 'HA_BRUG_TOKEN', naam: ['Ключ моста Home Assistant', 'Sleutel van de Home Assistant-brug'], datum: '2026-10-02', waar: [['Інтеграції', 'Integraties', 'instellingen-integraties']], gebruikt: 0 }
    ],
    herinnering: true,
    toonzaal: { auto: null, stap: 0 },
    planner: { zon: 4.2, batterij: 10, warmtepomp: 'ja', verbruik: 3400, gas: 1100, prijs: 0.27, saldering: 'zonder', varianten: [] },
    zaal: { schakel: true, segment: 'slim', stapper: 21, schuif: 60, kleur: 'voorkeuzes' },
    stroom: { pauze: null, filter: 'alle' }
  };
  var TOEGANG_VAN = { eigenaar: 3, bewoner: 2, kind: 1, gast: 0 };
  var EPOCH = function () { return HV.paspoort.epoch; };
  var SIM = { soort: 'simulator', naam: ['Симулятор', 'Simulator'] };
  var SIM_HAND = { soort: 'simulator', naam: ['Симулятор · ручне', 'Simulator · handmatig'] };
  var SYSTEEM = { soort: 'systeem', naam: ['Система', 'Systeem'] };

  // ───────────────────────── Дрібні помічники ─────────────────────────
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var echteTijd = function () { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  var datumVan = function (iso) { var d = iso.split('-'); return HV.huistijd(Number(d[0]), Number(d[1]), Number(d[2]), 12, 0); };
  var dagenTussen = function (a, b) { return Math.round((b - a) / 86400000); };
  var tel = function (n, uk, nl) { return n + ' ' + HV.meervoud(n, uk, nl); };
  var kaart = function (k, inhoud, klas) { return '<div class="hv-kaart hv-so-kaart' + (klas ? ' ' + klas : '') + '" data-k="' + h(k) + '">' + inhoud + '</div>'; };
  /** Заголовок картки: кругла іконка, назва, праворуч — чипи й дії. */
  var kop = function (icoon, titel, rechts, sub) {
    return '<div class="hv-so-kaartkop"><div class="hv-so-kaartkop__titel">' + ic(icoon) + '<div><h3>' + h(titel) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div></div>' + (rechts ? '<div class="hv-so-kaartkop__rechts">' + rechts + '</div>' : '') + '</div>';
  };
  var noot = function (icoon, tekst) { return '<p class="hv-so-noot">' + ic(icoon, { maat: 's' }) + '<span>' + h(tekst) + '</span></p>'; };
  var knoppen = function () { return '<div class="hv-knoppen hv-so-knoppen">' + Array.prototype.slice.call(arguments).filter(Boolean).join('') + '</div>'; };
  var veld = function (label, inhoud, extra) { return '<div class="hv-so-veld"><span class="hv-so-veld__label">' + h(label) + (extra || '') + '</span>' + inhoud + '</div>'; };
  var mag = function (min) { return (TOEGANG_VAN[HV.rol()] || 0) >= min; };
  var slotRegel = function (min) {
    if (mag(min)) return '';
    return '<p class="hv-so-slot">' + ic('lock', { maat: 's' }) + '<span>' + h(min >= 3 ? t('Лише перегляд: змінює власник.', 'Alleen bekijken: de eigenaar wijzigt dit.') : t('Лише перегляд: змінює власник або мешканець.', 'Alleen bekijken: de eigenaar of een bewoner wijzigt dit.')) + '</span></p>';
  };

  /**
   * Дія системи (не пристрою): роль → (ритуал небезпечної дії) → застосування → Журнал → сповіщення з «Повернути».
   * p: { wat:[uk,nl], was, werd, waarom, tekst, pas(), terug(), min (рівень ролі 0–3), gevaar (дія з gevolg), icoon, soort, gewicht, maker, stil, hoe }
   */
  function sysDoe(p) {
    if (p.min != null && !mag(p.min)) {
      HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не виконано: немає доступу', 'Niet uitgevoerd: geen toegang'), tekst: p.min >= 3 ? t('Це змінює лише власник.', 'Alleen de eigenaar kan dit wijzigen.') : t('Це змінює власник або мешканець.', 'De eigenaar of een bewoner kan dit wijzigen.') });
      return Promise.resolve({ ok: false, reden: 'rol' });
    }
    var maker = p.maker || HV.mens();
    var uitvoeren = function () {
      p.pas();
      HV.logboek.voegToe({ maker: maker, wat: p.wat, waarom: p.waarom || null, was: p.was || null, werd: p.werd || null, soort: p.soort || 'huis.systeem', gewicht: p.gewicht || 'info' });
      HV.staat.wijzig();
      if (!p.stil) {
        HV.meld({
          maker: maker, icoon: p.icoon || 'settings', gewicht: p.gewicht === 'belangrijk' ? 'belangrijk' : 'info', titel: HV.p(p.wat),
          tekst: p.tekst != null ? p.tekst : (p.was && p.werd ? HV.p(p.was) + ' → ' + HV.p(p.werd) : ''), hoe: p.hoe || null,
          terug: p.terug ? function () {
            p.terug();
            HV.logboek.voegToe({ maker: maker, wat: ['Повернуто: ' + p.wat[0], 'Ongedaan gemaakt: ' + p.wat[1]], soort: p.soort || 'huis.systeem' });
            HV.staat.wijzig();
          } : null
        });
      }
      return { ok: true };
    };
    if (p.gevaar && HV.schil && HV.schil.gevaar) {
      return HV.schil.gevaar({ actie: p.gevaar, naam: HV.p(p.gevaar.naam) }).then(function (ja) { return ja ? uitvoeren() : { ok: false, reden: 'geannuleerd' }; });
    }
    return Promise.resolve(uitvoeren());
  }

  // ───────────────────────── Обгортка HV.doe: запис команд, затримка збою, траси ─────────────────────────
  // Ядро не має точки спостереження за командами; обгортка лише записує і (за збою «Затримка») відкладає виклик.
  var kernDoe = HV.doe;
  var opdrachtTeller = 0;
  HV.doe = function (opdracht) {
    var w = HV.staat.w;
    var rec = { id: 'c' + (++opdrachtTeller), doel: opdracht.doel, mogelijkheid: opdracht.mogelijkheid, waarde: opdracht.waarde, door: opdracht.door || HV.mens(), echt: REEL(), tijd: w ? w.tijd : 0, fase: 'verzonden', ms: null };
    X.opdrachten.unshift(rec);
    if (X.opdrachten.length > 40) X.opdrachten.length = 40;
    var opname = X.sporen.opname;
    if (opname && (!opdracht.door || opdracht.door.soort === 'mens') && !opdracht.spoor) {
      opname.acties.push({ dt: REEL() - opname.echt, doel: opdracht.doel, mogelijkheid: opdracht.mogelijkheid, waarde: opdracht.waarde });
    }
    var vertraging = X.sim.vertraging * 1000;
    var a = w && typeof opdracht.doel === 'string' ? w.apparaten[opdracht.doel] : null;
    var belofte;
    if (vertraging > 0 && w && w.gegevens !== 'geen') {
      // збій «Затримка»: команда чекає в черзі адаптера; плитка показує «очікує» (бажане — риска)
      var zwaar = a ? HV.gevaar.isZwaar(HV.gevaar.vind(a, opdracht.mogelijkheid, opdracht.waarde)) : false;
      if (a && !zwaar && a.beschikbaar !== 'onbereikbaar') HV.staat.wijzig(function () { a.wacht = { mogelijkheid: opdracht.mogelijkheid, waarde: opdracht.waarde, fase: 'verzonden', sinds: 'so-' + rec.id, grens: 10 }; });
      belofte = new Promise(function (los) {
        setTimeout(function () {
          if (a && a.wacht && a.wacht.sinds === 'so-' + rec.id) a.wacht = null;
          los(kernDoe(opdracht));
        }, vertraging);
      });
    } else belofte = kernDoe(opdracht);
    return Promise.resolve(belofte).then(function (u) {
      rec.fase = u && u.ok ? 'bevestigd' : (u && u.reden) || 'geweigerd';
      rec.ms = REEL() - rec.echt;
      return u;
    });
  };

  // ───────────────────────── Світ після перезапуску сценарію ─────────────────────────
  // Збої й віртуальні пристрої — налаштування симулятора; світ, який будує сценарій, отримує їх знову.
  function pasSimToe(w) {
    if (!w) return;
    if (!w.sim) w.sim = {};
    w.sim.geenBevestiging = X.sim.geenBevestiging;
    X.virtueel.forEach(function (v) {
      if (w.apparaten[v.id]) return;
      var a = JSON.parse(JSON.stringify(v));
      a.gezien = w.tijd;
      w.apparaten[a.id] = a;
      w.volgorde.push(a.id);
    });
  }
  var vorigNaScenario = HV.naScenario;
  HV.naScenario = function (s) {
    // ручні значення світу належали старому світу: ціну повертаємо, решту сценарій уже переписав
    Object.keys(X.wereld).forEach(function (k) { if (X.wereld[k].prijs) X.wereld[k].herstel(); });
    X.wereld = {};
    X.sim.adapter = s && s.id === 'storing' ? 'offline' : 'goed';
    pasSimToe(HV.staat.w);
    if (vorigNaScenario) vorigNaScenario(s);
  };
  HV.staat.abonneer(function (w) {
    if (!w) return;
    if (!w.sim || w.sim.geenBevestiging !== X.sim.geenBevestiging) pasSimToe(w);
    // ×600 стає на паузу після 30 діб дому
    if (!w.pauze && w.snelheid === 600) {
      if (X.sim.start600 == null) X.sim.start600 = w.tijd;
      else if (w.tijd - X.sim.start600 > 30 * 86400000) {
        X.sim.start600 = null;
        HV.klok.zet(0);
        HV.logboek.voegToe({ maker: SIM, wat: ['Час дому зупинено: ×600 пройшов 30 діб', 'Huistijd gepauzeerd: ×600 liep 30 dagen'], soort: 'huis.simulatie', gewicht: 'belangrijk' });
      }
    } else X.sim.start600 = null;
    pasToegankelijkheidToe();
  });

  // ───────────────────────── Імена профілів ─────────────────────────
  var PROFIEL = {
    telefoon: { naam: ['Телефон', 'Telefoon'], icoon: 'smartphone' }, wand: { naam: ['Настінна панель', 'Wandpaneel'], icoon: 'tablet' },
    bureau: { naam: ['Комп’ютер', 'Bureau'], icoon: 'monitor' }, breed: { naam: ['Широкий екран', 'Breed scherm'], icoon: 'monitor' },
    tv: { naam: ['Телевізор', 'Televisie'], icoon: 'tv' }, strook: { naam: ['Стрічка', 'Strook'], icoon: 'rectangle-horizontal' },
    vierkant: { naam: ['Квадратний', 'Vierkant'], icoon: 'square' }, rond: { naam: ['Круглий', 'Rond'], icoon: 'circle' },
    klein: { naam: ['Малий 800×480', 'Klein 800×480'], icoon: 'tablet-smartphone' }, deur: { naam: ['Дверна панель', 'Deurpaneel'], icoon: 'door-closed' },
    horloge: { naam: ['Годинник', 'Horloge'], icoon: 'watch' }, inkt: { naam: ['Чорнило', 'Inkt'], icoon: 'book-open-text' }
  };
  var DICHT = { compact: ['Компактна', 'Compact'], normaal: ['Звичайна', 'Normaal'], ruim: ['Простора', 'Ruim'], auto: ['Від екрана', 'Van scherm'] };
  var THEMA = { auto: ['Як у системі', 'Systeem'], licht: ['Світла', 'Licht'], donker: ['Темна', 'Donker'] };
  var beeldVan = function (id) { var b = (HV.profielBeelden ? HV.profielBeelden(id) : [[800, 1280]])[0] || [800, 1280]; return b; };
  var kamerNaam = function (id) { var k = id ? HV.staat.kamer(id) : null; return k ? HV.p(k.naam) : t('особистий', 'persoonlijk'); };
  var scherm = function (id) { return X.schermen.filter(function (s) { return s.id === id; })[0] || null; };

  /** Мініатюра профілю: рамка в справжніх пропорціях і схема того, що на ньому живе. */
  function miniatuur(id, opties) {
    var b = beeldVan(id), speciaal = ['horloge', 'tv', 'strook', 'vierkant', 'rond', 'klein', 'deur', 'inkt'].indexOf(id) >= 0;
    var vorm = id === 'rond' || id === 'horloge' ? ' is-rond' : '';
    var binnen;
    if (id === 'rond' || id === 'horloge') binnen = '<span class="hv-so-mini__wijzer"></span><span class="hv-so-mini__regel is-kort"></span>';
    else if (id === 'strook') binnen = '<span class="hv-so-mini__cel"></span><span class="hv-so-mini__cel"></span><span class="hv-so-mini__cel"></span><span class="hv-so-mini__cel"></span>';
    else if (id === 'inkt') binnen = '<span class="hv-so-mini__regel"></span><span class="hv-so-mini__regel is-kort"></span><span class="hv-so-mini__regel"></span>';
    else if (speciaal) binnen = '<span class="hv-so-mini__groot"></span><span class="hv-so-mini__rij"><i></i><i></i><i></i></span>';
    else binnen = '<span class="hv-so-mini__kop"></span><span class="hv-so-mini__hemel"></span><span class="hv-so-mini__rij"><i></i><i></i></span><span class="hv-so-mini__rij"><i></i><i></i></span>';
    return '<span class="hv-so-mini hv-so-mini--' + h(id) + vorm + (opties && opties.uit ? ' is-uit' : '') + '" style="aspect-ratio:' + b[0] + ' / ' + b[1] + '" aria-hidden="true">' + binnen + '</span>';
  }

  // ═════════════════════════ 1. Екрани ═════════════════════════
  function schermKaart(s) {
    var p = PROFIEL[s.profiel] || PROFIEL.wand, b = beeldVan(s.profiel);
    var stand = s.online
      ? o.chip({ icoon: 'wifi', toon: 'ok', tekst: t('на зв’язку', 'verbonden') })
      : o.chip({ icoon: 'wifi-off', toon: 'let-op', tekst: t('не на зв’язку', 'niet verbonden') });
    return '<article class="hv-so-scherm' + (s.online ? '' : ' is-uit') + '" data-k="so-scherm-' + h(s.id) + '">' +
      '<button type="button" class="hv-so-scherm__lijf" data-actie="blad" data-blad="soscherm:' + h(s.id) + '" aria-label="' + h(HV.p(s.naam) + ', ' + HV.p(p.naam) + ', ' + kamerNaam(s.kamer) + '. ' + t('Відкрити', 'Openen')) + '">' +
      '<span class="hv-so-scherm__beeld">' + miniatuur(s.profiel, { uit: !s.online }) + '</span>' +
      '<span class="hv-so-scherm__tekst"><span class="hv-so-scherm__naam">' + h(HV.p(s.naam)) + '</span>' +
      '<span class="hv-so-scherm__sub">' + h(HV.p(p.naam) + ' · ' + b[0] + '×' + b[1] + ' · ' + kamerNaam(s.kamer)) + '</span>' +
      '<span class="hv-so-scherm__pad"><code>/scherm/' + h(s.profiel) + '/' + h(s.id) + '</code></span></span>' +
      ic('chevron-right', { maat: 's', klas: 'hv-so-scherm__pijl' }) + '</button>' +
      '<div class="hv-so-scherm__chips">' + stand + o.chip({ icoon: 'rows-3', tekst: HV.p(DICHT[s.dichtheid]) }) + o.chip({ icoon: s.thema === 'donker' ? 'moon' : s.thema === 'licht' ? 'sun' : 'sun-moon', tekst: HV.p(THEMA[s.thema]) }) +
      (s.zuinig ? o.chip({ icoon: 'leaf', tekst: t('полегшений вигляд', 'zuinige weergave') }) : '') +
      '<span class="hv-so-scherm__oud">' + h(s.online ? t('кадр ', 'beeld ') + HV.oud(s.gezien * 1000) : t('востаннє ', 'laatst ') + HV.oud(s.gezien * 1000)) + '</span></div></article>';
  }

  function koppelKaart(ctx) {
    var k = X.koppel;
    if (!k) {
      return kaart('so-koppel', kop('link-2', t('Сполучити новий екран', 'Nieuw scherm koppelen'), '', h(t('Код із 6 цифр створює сеанс екрана з роллю «панель» — без облікового запису людини.', 'Een code van 6 cijfers maakt een schermsessie met de rol ‘paneel’ — zonder account van een persoon.'))) +
        '<ol class="hv-so-stappenrij"><li><span>1</span>' + h(t('На екрані відкрийте huis.tarasevych.com/koppelen', 'Open op het scherm huis.tarasevych.com/koppelen')) + '</li><li><span>2</span>' + h(t('Введіть код, який дасть ця сторінка', 'Vul de code van deze pagina in')) + '</li><li><span>3</span>' + h(t('Оберіть кімнату й профіль', 'Kies kamer en profiel')) + '</li></ol>' +
        slotRegel(3) + knoppen(o.knop({ tekst: t('Отримати код', 'Code maken'), icoon: 'qr-code', soort: 'hoofd', actie: 'so-koppel-start' })) +
        noot('shield-check', t('Панель виконує звичайне; чутливе — з особистим кодом; критичне — лише перегляд.', 'Een paneel doet het gewone; gevoelig met een persoonlijke code; kritiek alleen bekijken.')), 'hv-so-koppel');
    }
    var rest = Math.max(0, Math.round((k.tot - REEL()) / 1000));
    var cijfers = k.code.split('').map(function (c, i) { return (i === 3 ? '<span class="hv-so-code__kier" aria-hidden="true"></span>' : '') + '<span class="hv-so-code__cijfer">' + c + '</span>'; }).join('');
    var lijf;
    if (rest <= 0) {
      lijf = '<p class="hv-so-koppel__status is-verlopen">' + ic('timer-off', { maat: 's' }) + h(t('Код більше не діє. Отримайте новий.', 'De code is verlopen. Maak een nieuwe.')) + '</p>' +
        knoppen(o.knop({ tekst: t('Новий код', 'Nieuwe code'), icoon: 'refresh-cw', soort: 'hoofd', actie: 'so-koppel-start' }), o.knop({ tekst: t('Скасувати', 'Annuleren'), soort: 'stil', actie: 'so-koppel-stop' }));
    } else if (k.stap === 'gevonden') {
      lijf = '<div class="hv-so-gevonden">' + miniatuur(k.profiel) + '<div><p class="hv-so-gevonden__naam">' + h(t('Знайдено: планшет 1024×768', 'Gevonden: tablet 1024×768')) + '</p><p class="hv-so-gevonden__sub">' + h(t('Ввів код щойно · браузер Chromium · через тунель', 'Code net ingevoerd · Chromium-browser · via tunnel')) + '</p></div></div>' +
        veld(t('Кімната', 'Kamer'), o.segment({ label: t('Кімната нового екрана', 'Kamer van het nieuwe scherm'), waarde: k.kamer, actie: 'so-koppel-kamer', opties: ['hal', 'keuken', 'woonkamer', 'werkkamer', 'slaapkamer'].map(function (id) { return { id: id, label: kamerNaam(id) }; }), klas: 'hv-so-segment-breed' })) +
        veld(t('Профіль', 'Profiel'), o.segment({ label: t('Профіль нового екрана', 'Profiel van het nieuwe scherm'), waarde: k.profiel, actie: 'so-koppel-profiel', opties: ['wand', 'klein', 'vierkant', 'deur'].map(function (id) { return { id: id, label: HV.p(PROFIEL[id].naam), icoon: PROFIEL[id].icoon }; }), klas: 'hv-so-segment-breed' })) +
        '<p class="hv-so-gevolg">' + o.gevolg(t('Що станеться: екран отримає сеанс із роллю «панель» і покаже обличчя профілю. Пов’язано з: тривога диму й дзвінок у двері дійдуть і до нього. Як повернути: аркуш екрана → «Від’єднати».', 'Wat er gebeurt: het scherm krijgt een sessie met de rol ‘paneel’ en toont de wijzerplaat van het profiel. Hangt samen met: rookalarm en de deurbel komen er ook op. Terugdraaien: blad van het scherm → ‘Ontkoppelen’.')) + '<span>' + h(t('Що станеться після додавання', 'Wat er gebeurt na toevoegen')) + '</span></p>' +
        knoppen(o.knop({ tekst: t('Додати екран', 'Scherm toevoegen'), icoon: 'plus', soort: 'hoofd', actie: 'so-koppel-voeg' }), o.knop({ tekst: t('Скасувати', 'Annuleren'), soort: 'stil', actie: 'so-koppel-stop' }));
    } else {
      lijf = '<div class="hv-so-code" role="group" aria-label="' + h(t('Код сполучення ', 'Koppelcode ') + k.code.split('').join(' ')) + '">' + cijfers + '</div>' +
        '<div class="hv-so-koppel__aftel">' + o.aftel({ rest: Math.ceil(rest / 60), totaal: 10, icoon: 'hourglass' }) + '<span class="hv-so-koppel__sec">' + h(Math.floor(rest / 60) + ':' + pad2(rest % 60)) + '</span></div>' +
        '<p class="hv-so-koppel__status">' + (k.stap === 'zoekt' ? ic('loader', { maat: 's', klas: 'hv-so-draai' }) + h(t('Екран вводить код…', 'Het scherm voert de code in…')) : ic('radar', { maat: 's' }) + h(t('Чекаємо на екран. Код діє 10 хв справжнього часу.', 'Wachten op het scherm. De code geldt 10 min echte tijd.'))) + '</p>' +
        knoppen(o.knop({ tekst: t('Імітувати введення на екрані', 'Invoer op het scherm nabootsen'), icoon: 'tablet', soort: 'hoofd', actie: 'so-koppel-sim', uit: k.stap === 'zoekt' }), o.knop({ tekst: t('Новий код', 'Nieuwe code'), icoon: 'refresh-cw', actie: 'so-koppel-start' }), o.knop({ tekst: t('Скасувати', 'Annuleren'), soort: 'stil', actie: 'so-koppel-stop' }));
    }
    return kaart('so-koppel', kop('link-2', t('Сполучення кодом', 'Koppelen met een code'), o.chip({ icoon: 'flask-conical', toon: 'sim', tekst: t('у макеті — імітація екрана', 'in de maquette nagebootst') })) + lijf, 'hv-so-koppel is-actief');
  }

  function voorbeeldKaart(ctx) {
    var gekozen = HV.ui.lees('so-voorbeeld', 'wand');
    var b = beeldVan(gekozen), p = HV.profielBeelden ? (HV.bouw.profielen || []).filter(function (x) { return x.id === gekozen; })[0] || {} : {};
    var eigen = {
      wand: ['Повна сторінка «Дім» з небом; плитки 2×2 і великі цілі дотику.', 'Volledige pagina ‘Thuis’ met hemel; tegels 2×2 en grote aanraakdoelen.'],
      deur: ['Хто біля дверей, замок, охорона й погода на вихід.', 'Wie er voor de deur staat, slot, alarm en het weer voor vertrek.'],
      tv: ['Огляд на відстані: великі числа, керування стрілками пульта.', 'Overzicht op afstand: grote getallen, bediening met de pijltjes van de afstandsbediening.'],
      strook: ['Одна смуга фактів: температура, енергія, наступна подія.', 'Eén strook met feiten: temperatuur, energie, volgende gebeurtenis.'],
      rond: ['Годинник із кільцем доби й одним важливим фактом.', 'Klok met een ring van de dag en één belangrijk feit.'],
      vierkant: ['Чотири зони: світло, клімат, двері, сцена.', 'Vier zones: licht, klimaat, deur, scène.'],
      klein: ['Компактна панель 800×480: сцени й кімнати.', 'Compact paneel 800×480: scènes en kamers.'],
      horloge: ['Один факт і одна дія; небезпечне — «Підтвердьте на телефоні».', 'Eén feit en één actie; gevaarlijk — ‘Bevestig op je telefoon’.'],
      inkt: ['Чорно-біле, без неба й руху; оновлення раз на 5 хв.', 'Zwart-wit, zonder hemel en beweging; ververst elke 5 min.']
    };
    var lijst = ['wand', 'deur', 'tv', 'strook', 'rond', 'vierkant', 'klein', 'horloge', 'inkt'];
    var feiten = [
      [t('Розмір', 'Formaat'), b[0] + '×' + b[1]],
      [t('Щільність', 'Dichtheid'), HV.p(DICHT[p.dichtheid || 'normaal'] || DICHT.normaal)],
      [t('Небо', 'Hemel'), HV.p({ vol: ['повне', 'vol'], stil: ['тихе', 'stil'], geen: ['вимкнене', 'uit'] }[p.hemel || 'vol'] || ['повне', 'vol'])],
      [t('Небезпечна дія', 'Gevaarlijke actie'), HV.p((p.gevaar || 'rail') === 'rail' ? ['рейка утримання', 'houdrail'] : ['підтвердити на телефоні', 'bevestigen op de telefoon'])]
    ];
    return kaart('so-voorbeeld', kop('scan-eye', t('Попередній перегляд профілю', 'Voorbeeld van een profiel'), o.chip({ icoon: 'ruler', tekst: b[0] + '×' + b[1] })) +
      '<div class="hv-so-profielen" role="radiogroup" aria-label="' + h(t('Профіль для перегляду', 'Profiel om te bekijken')) + '">' + lijst.map(function (id) {
        var gek = id === gekozen;
        return '<button type="button" role="radio" aria-checked="' + (gek ? 'true' : 'false') + '" tabindex="' + (gek ? '0' : '-1') + '" class="hv-so-profiel' + (gek ? ' is-gekozen' : '') + '" data-actie="ui" data-naam="so-voorbeeld" data-waarde="' + id + '">' + miniatuur(id) + '<span>' + h(HV.p(PROFIEL[id].naam)) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="hv-so-voorbeeld"><div class="hv-so-voorbeeld__beeld">' + miniatuur(gekozen) + '</div><div class="hv-so-voorbeeld__tekst"><p class="hv-so-voorbeeld__zin">' + h(HV.p(eigen[gekozen])) + '</p>' +
      '<dl class="hv-so-feiten">' + feiten.map(function (f) { return '<div><dt>' + h(f[0]) + '</dt><dd>' + h(f[1]) + '</dd></div>'; }).join('') + '</dl>' +
      knoppen(o.knop({ tekst: t('Показати на полотні', 'Op het doek tonen'), icoon: 'scan-eye', soort: 'hoofd', actie: 'so-profiel-toon', gegevens: { profiel: gekozen } })) +
      noot('info', t('Полотно перемкнеться на цей профіль; «Повернути» у сповіщенні або пульт макета повернуть попередній.', 'Het doek schakelt naar dit profiel; ‘Ongedaan maken’ in de melding of de bediening van de maquette zet het vorige terug.')) + '</div></div>', 'hv-so-voorbeeldkaart');
  }

  function schermenTab(ctx) {
    var online = X.schermen.filter(function (s) { return s.online; }).length;
    var uit = X.schermen.length - online;
    var held = '<section class="hv-so-held" data-k="so-held-schermen"><div class="hv-so-held__getal"><span class="hv-so-held__n">' + X.schermen.length + '</span><span class="hv-so-held__woord">' + h(HV.meervoud(X.schermen.length, ['екран', 'екрани', 'екранів'], ['scherm', 'schermen'])) + '</span></div>' +
      '<div class="hv-so-held__tekst"><p class="hv-so-held__zin">' + h(uit ? t(online + ' на зв’язку; «' + HV.p(X.schermen.filter(function (s) { return !s.online; })[0].naam) + '» мовчить ' + HV.oud(X.schermen.filter(function (s) { return !s.online; })[0].gezien * 1000) + '.', online + ' verbonden; ‘' + HV.p(X.schermen.filter(function (s) { return !s.online; })[0].naam) + '’ zwijgt ' + HV.oud(X.schermen.filter(function (s) { return !s.online; })[0].gezien * 1000) + '.') : t('Усі екрани на зв’язку.', 'Alle schermen zijn verbonden.')) + '</p>' +
      '<div class="hv-so-held__chips">' + o.chip({ icoon: 'users', tekst: t('24 екрани на оселю — межа', '24 schermen per woning — grens') }) + o.chip({ icoon: 'route', tekst: t('через тунель', 'via tunnel') }) + o.chip({ icoon: 'bell-ring', tekst: t('тривога доходить до всіх', 'alarm bereikt alle schermen') }) + '</div></div>' +
      '<div class="hv-so-held__acties">' + o.knop({ tekst: t('Сполучити екран', 'Scherm koppelen'), icoon: 'plus', soort: 'hoofd', actie: 'so-koppel-start' }) + o.knop({ tekst: t('Перевірити тривогу', 'Alarm testen'), icoon: 'siren', actie: 'so-scherm-test' }) + '</div></section>';
    var lijst = '<div class="hv-so-schermen" data-k="so-schermlijst">' + X.schermen.map(schermKaart).join('') + '</div>';
    return '<div class="hv-so" data-k="so-schermen">' + held + '<div class="hv-so-raster">' +
      '<div class="hv-so-kolom">' + o.blok({ id: 'so-schermlijst', titel: t('Екрани дому', 'Schermen van het huis'), teller: X.schermen.length, inhoud: lijst, uitleg: t('Що станеться: кожен екран — пристрій зі своїм профілем, кімнатою й щільністю. Пов’язано з: аварійний шар і дзвінок у двері показуються на всіх. Як повернути: аркуш екрана → «Від’єднати».', 'Wat er gebeurt: elk scherm is een apparaat met een eigen profiel, kamer en dichtheid. Hangt samen met: de noodlaag en de deurbel verschijnen op alle schermen. Terugdraaien: blad van het scherm → ‘Ontkoppelen’.') }) + '</div>' +
      '<div class="hv-so-kolom">' + koppelKaart(ctx) + voorbeeldKaart(ctx) + '</div></div></div>';
  }

  // аркуш екрана
  HV.blad({
    soort: 'soscherm', vrij: true, icoon: function (ctx, id) { var s = scherm(id); return s ? (PROFIEL[s.profiel] || PROFIEL.wand).icoon : 'tablet'; },
    titel: function (ctx, id) { var s = scherm(id); return s ? HV.p(s.naam) : t('Екран', 'Scherm'); },
    sub: function (ctx, id) { var s = scherm(id); return s ? HV.p((PROFIEL[s.profiel] || PROFIEL.wand).naam) + ' · ' + kamerNaam(s.kamer) : ''; },
    render: function (ctx, id) {
      var s = scherm(id);
      if (!s) return o.leeg({ icoon: 'tablet', titel: t('Екран від’єднано', 'Scherm ontkoppeld'), tekst: t('Його більше немає в переліку.', 'Het staat niet meer in de lijst.') });
      var b = beeldVan(s.profiel);
      var kamers = ['hal', 'keuken', 'woonkamer', 'werkkamer', 'slaapkamer', 'kinderkamer'];
      return '<div class="hv-so-blad">' +
        o.kaart({ inhoud: '<div class="hv-so-blad__voorbeeld">' + miniatuur(s.profiel, { uit: !s.online }) + '<dl class="hv-so-feiten">' +
          '<div><dt>' + h(t('Адреса', 'Adres')) + '</dt><dd><code>/scherm/' + h(s.profiel) + '/' + h(s.id) + '</code></dd></div>' +
          '<div><dt>' + h(t('Розмір', 'Formaat')) + '</dt><dd>' + b[0] + '×' + b[1] + '</dd></div>' +
          '<div><dt>' + h(t('Сполучено', 'Gekoppeld')) + '</dt><dd>' + h(HV.datumKort(datumVan(s.sinds))) + '</dd></div>' +
          '<div><dt>' + h(t('Зв’язок', 'Verbinding')) + '</dt><dd>' + h(s.online ? t('на зв’язку · кадр ', 'verbonden · beeld ') + HV.oud(s.gezien * 1000) : t('мовчить ', 'zwijgt ') + HV.oud(s.gezien * 1000)) + '</dd></div></dl></div>' }) +
        o.kaart({ titel: t('Вигляд', 'Weergave'), inhoud:
          veld(t('Кімната', 'Kamer'), o.segment({ label: t('Кімната екрана', 'Kamer van het scherm'), waarde: s.kamer || '', actie: 'so-scherm-zet', gegevens: { scherm: s.id, veld: 'kamer' }, opties: [{ id: '', label: t('Особистий', 'Persoonlijk') }].concat(kamers.map(function (k) { return { id: k, label: kamerNaam(k) }; })), klas: 'hv-so-segment-breed', uit: !mag(3) })) +
          veld(t('Щільність', 'Dichtheid'), o.segment({ label: t('Щільність екрана', 'Dichtheid van het scherm'), waarde: s.dichtheid, actie: 'so-scherm-zet', gegevens: { scherm: s.id, veld: 'dichtheid' }, opties: ['compact', 'normaal', 'ruim'].map(function (d) { return { id: d, label: HV.p(DICHT[d]) }; }), uit: !mag(3) })) +
          veld(t('Тема', 'Thema'), o.segment({ label: t('Тема екрана', 'Thema van het scherm'), waarde: s.thema, actie: 'so-scherm-zet', gegevens: { scherm: s.id, veld: 'thema' }, opties: ['auto', 'licht', 'donker'].map(function (d) { return { id: d, label: HV.p(THEMA[d]), icoon: d === 'donker' ? 'moon' : d === 'licht' ? 'sun' : 'sun-moon' }; }), uit: !mag(3) })) +
          '<div class="hv-so-schakelrij">' + o.schakel({ aan: s.zuinig, icoon: 'leaf', toon: 'aan', actie: 'so-scherm-zuinig', gegevens: { scherm: s.id }, aria: t('Полегшений вигляд', 'Zuinige weergave') }) +
          '<div><p class="hv-so-schakelrij__naam">' + h(t('Полегшений вигляд', 'Zuinige weergave')) + '</p><p class="hv-so-schakelrij__sub">' + h(t('Без розмиття скла й переходів неба; панель вмикає його й сама, якщо кадри повільні.', 'Zonder glaswaas en hemelovergangen; het paneel zet het ook zelf aan als beelden traag zijn.')) + '</p></div></div>' + slotRegel(3) }) +
        o.kaart({ titel: t('Дії', 'Acties'), inhoud: knoppen(
          o.knop({ tekst: t('Показати на полотні', 'Op het doek tonen'), icoon: 'scan-eye', actie: 'so-profiel-toon', gegevens: { profiel: s.profiel } }),
          o.knop({ tekst: t('Перезапустити', 'Herstarten'), icoon: 'rotate-ccw', actie: 'so-scherm-herstart', gegevens: { scherm: s.id } }),
          o.knop({ tekst: t('Від’єднати', 'Ontkoppelen'), icoon: 'unlink', soort: 'stil', actie: 'so-scherm-weg', gegevens: { scherm: s.id } })) +
          noot('info', t('Від’єднаний екран одразу втрачає сеанс; повторне сполучення — новим кодом.', 'Een ontkoppeld scherm verliest meteen zijn sessie; opnieuw koppelen gaat met een nieuwe code.')) }) +
        '</div>';
    }
  });

  // ── дії: екрани ──
  var koppelKlok = null;
  function koppelTik() {
    if (koppelKlok) clearInterval(koppelKlok);
    koppelKlok = setInterval(function () {
      if (!X.koppel) { clearInterval(koppelKlok); koppelKlok = null; return; }
      HV.teken();
      if (REEL() > X.koppel.tot + 1500) { clearInterval(koppelKlok); koppelKlok = null; }
    }, 1000);
  }
  HV.actie('so-koppel-start', function (ctx) {
    if (!mag(3)) { sysDoe({ min: 3, wat: ['', ''], pas: function () {} }); return; }
    var code = ''; for (var i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
    X.koppel = { code: code, tot: REEL() + 10 * 60000, stap: 'wacht', kamer: 'hal', profiel: 'wand' };
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Створено код сполучення екрана', 'Koppelcode voor een scherm gemaakt'], waarom: ['діє 10 хв справжнього часу', 'geldt 10 min echte tijd'], soort: 'huis.systeem' });
    HV.staat.wijzig();
    koppelTik();
    if (ctx.route.tab !== 'schermen') ctx.open('instellingen-schermen');
  });
  HV.actie('so-koppel-stop', function () { X.koppel = null; HV.teken(); });
  HV.actie('so-koppel-sim', function () {
    if (!X.koppel || X.koppel.stap !== 'wacht') return;
    X.koppel.stap = 'zoekt'; HV.teken();
    setTimeout(function () { if (X.koppel && X.koppel.stap === 'zoekt') { X.koppel.stap = 'gevonden'; HV.teken(); } }, 1400);
  });
  HV.actie('so-koppel-kamer', function (ctx, g) { if (X.koppel) { X.koppel.kamer = g.waarde; HV.teken(); } });
  HV.actie('so-koppel-profiel', function (ctx, g) { if (X.koppel) { X.koppel.profiel = g.waarde; HV.teken(); } });
  HV.actie('so-koppel-voeg', function () {
    var k = X.koppel;
    if (!k) return;
    var id = 'scherm' + (X.schermen.length + 1);
    var nieuw = { id: id, naam: ['Панель: ' + HV.staat.kamer(k.kamer).naam[0], 'Paneel: ' + HV.staat.kamer(k.kamer).naam[1]], profiel: k.profiel, kamer: k.kamer, dichtheid: 'ruim', thema: 'auto', online: true, gezien: 1, sinds: '2026-11-10', zuinig: false };
    sysDoe({ min: 3, icoon: 'tablet', wat: ['Екран додано: ' + nieuw.naam[0], 'Scherm toegevoegd: ' + nieuw.naam[1]], waarom: ['сполучено кодом', 'gekoppeld met een code'], tekst: HV.p(PROFIEL[k.profiel].naam) + ' · ' + kamerNaam(k.kamer),
      pas: function () { X.schermen.push(nieuw); X.koppel = null; },
      terug: function () { X.schermen = X.schermen.filter(function (s) { return s.id !== id; }); } });
  });
  HV.actie('so-scherm-zet', function (ctx, g) {
    var s = scherm(g.scherm); if (!s) return;
    var veldNaam = g.veld, was = s[veldNaam], werd = g.waarde === '' ? null : g.waarde;
    if (was === werd) return;
    var woord = function (v) { return veldNaam === 'kamer' ? [v ? HV.staat.kamer(v).naam[0] : 'особистий', v ? HV.staat.kamer(v).naam[1] : 'persoonlijk'] : veldNaam === 'dichtheid' ? DICHT[v] : THEMA[v]; };
    var label = { kamer: ['кімната', 'kamer'], dichtheid: ['щільність', 'dichtheid'], thema: ['тема', 'thema'] }[veldNaam];
    sysDoe({ min: 3, icoon: 'tablet', wat: [s.naam[0] + ': ' + label[0], s.naam[1] + ': ' + label[1]], was: woord(was), werd: woord(werd),
      pas: function () { s[veldNaam] = werd; }, terug: function () { s[veldNaam] = was; } });
  });
  HV.actie('so-scherm-zuinig', function (ctx, g) {
    var s = scherm(g.scherm); if (!s) return;
    var was = s.zuinig;
    sysDoe({ min: 3, icoon: 'leaf', wat: [s.naam[0] + ': полегшений вигляд', s.naam[1] + ': zuinige weergave'], was: was ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: was ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'],
      pas: function () { s.zuinig = !was; }, terug: function () { s.zuinig = was; } });
  });
  HV.actie('so-scherm-herstart', function (ctx, g) {
    var s = scherm(g.scherm); if (!s) return;
    sysDoe({ min: 2, icoon: 'rotate-ccw', wat: [s.naam[0] + ': перезапуск', s.naam[1] + ': herstart'], hoe: t('Як повернути: відкату немає — екран повернеться за 20 с.', 'Terugdraaien: kan niet — het scherm is na 20 s terug.'),
      pas: function () { s.online = false; setTimeout(function () { s.online = true; s.gezien = 1; HV.logboek.voegToe({ maker: SYSTEEM, wat: [s.naam[0] + ': знову на зв’язку', s.naam[1] + ': weer verbonden'], soort: 'huis.systeem' }); HV.staat.wijzig(); }, 2500); } });
  });
  HV.actie('so-scherm-weg', function (ctx, g) {
    var s = scherm(g.scherm); if (!s) return;
    var plek = X.schermen.indexOf(s);
    sysDoe({ min: 3, icoon: 'unlink', gewicht: 'belangrijk', wat: ['Екран від’єднано: ' + s.naam[0], 'Scherm ontkoppeld: ' + s.naam[1]], waarom: ['сеанс екрана скасовано', 'schermsessie ingetrokken'],
      pas: function () { X.schermen.splice(plek, 1); HV.bladOpen(null); }, terug: function () { X.schermen.splice(plek, 0, s); } });
  });
  HV.actie('so-scherm-test', function () {
    var n = X.schermen.filter(function (s) { return s.online; }).length;
    sysDoe({ min: 2, icoon: 'siren', wat: ['Перевірка тривоги на екранах', 'Alarmtest op de schermen'], waarom: ['навчальна, без сирени', 'oefening, zonder sirene'], tekst: t('Дійшло: ' + n + ' з ' + X.schermen.length + '; «Чорнило на холодильнику» не відповіло.', 'Aangekomen: ' + n + ' van ' + X.schermen.length + '; ‘Inkt op de koelkast’ gaf geen antwoord.'), pas: function () {} });
  });
  HV.actie('so-profiel-toon', function (ctx, g) {
    var was = HV.opslag.lees('profiel', 'venster'), werd = g.profiel;
    var zet = function (p) { HV.opslag.schrijf('profiel', p); if (HV.hemelSprong) HV.hemelSprong(); if (HV.pult && HV.pult.teken) HV.pult.teken(); if (HV.pult && HV.pult.pas) HV.pult.pas(); HV.teken(); };
    HV.bladOpen(null);
    zet(werd);
    HV.meld({ icoon: 'scan-eye', titel: t('Полотно: ', 'Doek: ') + HV.p((PROFIEL[werd] || PROFIEL.wand).naam), tekst: t('Попередній перегляд профілю.', 'Voorbeeld van het profiel.'), terug: function () { zet(was); } });
  });

  // ═════════════════════════ 2. Інтеграції ═════════════════════════
  var CATALOGUS = [
    { id: 'homeassistant', naam: 'Home Assistant', icoon: 'house', wat: ['Міст до наявного дому: сутності, стани й дії без зміни поведінки.', 'Brug naar een bestaand huis: entiteiten, toestanden en acties zonder ander gedrag.'], etap: 12, pad: ['лише читання → керування', 'alleen lezen → bediening'] },
    { id: 'zigbee', naam: 'Zigbee2MQTT', icoon: 'radio', wat: ['Датчики, лампи й розетки Zigbee через брокер MQTT.', 'Zigbee-sensoren, lampen en stekkers via een MQTT-broker.'], etap: 12, pad: ['виявлення й сполучення', 'ontdekken en koppelen'] },
    { id: 'matter', naam: 'Matter', icoon: 'network', wat: ['Пристрої Matter і Thread: сполучення кодом із коробки.', 'Matter- en Thread-apparaten: koppelen met de code van de doos.'], etap: 12, pad: ['код сполучення', 'koppelcode'] },
    { id: 'hue', naam: 'Philips Hue', icoon: 'lightbulb', wat: ['Міст Hue: лампи, групи й сцени; натиск кнопки на мості.', 'Hue-brug: lampen, groepen en scènes; druk op de knop van de brug.'], etap: 12, pad: ['кнопка на мості', 'knop op de brug'] },
    { id: 'shelly', naam: 'Shelly', icoon: 'plug', wat: ['Реле й розетки в локальній мережі, без хмари.', 'Relais en stekkers in het lokale netwerk, zonder cloud.'], etap: 12, pad: ['локальна мережа', 'lokaal netwerk'] },
    { id: 'p1', naam: 'HomeWizard P1', icoon: 'gauge', wat: ['Лічильник P1: споживання, повернення й фази L1–L3.', 'P1-meter: verbruik, teruglevering en fasen L1–L3.'], etap: 12, pad: ['локальна мережа', 'lokaal netwerk'] },
    { id: 'sonos', naam: 'Sonos', icoon: 'speaker', wat: ['Колонки й групи: відтворення, гучність, мультирум.', 'Speakers en groepen: afspelen, volume, multiroom.'], etap: 12, pad: ['локальна мережа', 'lokaal netwerk'] },
    { id: 'esphome', naam: 'ESPHome', icoon: 'cpu', wat: ['Власні плати з датчиками; маніфест зі схеми.', 'Eigen bordjes met sensoren; manifest uit het schema.'], etap: 12, pad: ['ключ шифрування', 'versleutelingssleutel'] },
    { id: 'knmi', naam: 'KNMI', icoon: 'cloud-sun', wat: ['Погода й попередження для Утрехта; кеш на сервері.', 'Weer en waarschuwingen voor Utrecht; cache op de server.'], etap: 4, pad: ['ключ служби', 'sleutel van de dienst'] },
    { id: 'mqtt', naam: 'MQTT', icoon: 'waypoints', wat: ['Загальний брокер для власних пристроїв і скриптів.', 'Algemene broker voor eigen apparaten en scripts.'], etap: 12, pad: ['адреса брокера й ключ', 'adres van de broker en sleutel'] }
  ];
  var ADAPTER_STAND = {
    goed: { naam: ['справний', 'gezond'], toon: 'ok', icoon: 'circle-check', zin: ['Події йдуть рівно, команди підтверджуються за 0,4 с.', 'Gebeurtenissen komen gelijkmatig, opdrachten worden binnen 0,4 s bevestigd.'] },
    verzwakt: { naam: ['послаблений', 'verzwakt'], toon: 'let-op', icoon: 'triangle-alert', zin: ['Потік мовчить: дані йдуть опитуванням раз на 30 с.', 'De stroom zwijgt: gegevens komen elke 30 s via opvragen.'] },
    auth: { naam: ['потрібен вхід', 'aanmelding nodig'], toon: 'let-op', icoon: 'key-round', zin: ['Ключ доступу джерела більше не діє; читання й керування зупинено.', 'De toegangssleutel van de bron geldt niet meer; lezen en bedienen staan stil.'] },
    limiet: { naam: ['ліміт запитів', 'limiet bereikt'], toon: 'let-op', icoon: 'gauge', zin: ['Джерело просить зачекати; команди стоять у черзі 60 с.', 'De bron vraagt te wachten; opdrachten staan 60 s in de wachtrij.'] },
    offline: { naam: ['не відповідає', 'reageert niet'], toon: 'alarm', icoon: 'unplug', zin: ['Адаптер мовчить: показано останній знімок, лише перегляд.', 'De adapter zwijgt: laatste momentopname, alleen bekijken.'] }
  };
  HV.soAdapterStand = ADAPTER_STAND;

  function gezondheid(ctx, kort, inBlad) {
    var w = ctx.staat, st = ADAPTER_STAND[X.sim.adapter] || ADAPTER_STAND.goed;
    var apparaten = w.volgorde.length;
    var weg = HV.kijk.alle(function (a) { return a.beschikbaar === 'onbereikbaar'; }).length;
    var getallen = [
      [t('Пристроїв', 'Apparaten'), String(apparaten)],
      [t('Строк підтвердження', 'Bevestigingstermijn'), '3 ' + t('с', 's')],
      [t('Подій за хвилину', 'Gebeurtenissen per minuut'), X.sim.adapter === 'goed' ? String(38 + (w.snelheid > 10 ? 0 : 6)) : X.sim.adapter === 'offline' ? '0' : '2'],
      [t('Недоступних', 'Niet bereikbaar'), String(weg)]
    ];
    return '<div class="hv-so-gezond hv-toon-' + st.toon + '" data-k="so-gezond">' +
      '<div class="hv-so-gezond__kop"><span class="hv-so-gezond__teken">' + ic('flask-conical') + '</span><div><p class="hv-so-gezond__naam">' + h(t('Симулятор · демо-дім', 'Simulator · demowoning')) + '</p>' +
      '<p class="hv-so-gezond__stand">' + ic(st.icoon, { maat: 's' }) + '<span>' + h(HV.p(st.naam)) + '</span></p></div></div>' +
      '<p class="hv-so-gezond__zin">' + h(HV.p(st.zin)) + '</p>' +
      (kort ? '' : '<dl class="hv-so-getallen">' + getallen.map(function (g) { return '<div><dt>' + h(g[0]) + '</dt><dd>' + h(g[1]) + '</dd></div>'; }).join('') + '</dl>') +
      knoppen(X.sim.adapter === 'goed'
        ? o.knop({ tekst: t('Перезапустити адаптер', 'Adapter herstarten'), icoon: 'rotate-ccw', klein: true, actie: 'so-adapter-herstart' })
        : o.knop({ tekst: t('Відновити зв’язок', 'Verbinding herstellen'), icoon: 'refresh-cw', soort: 'hoofd', klein: true, actie: 'so-adapter', gegevens: { waarde: 'goed' } }),
        // у самому аркуші адаптера посилання на цей аркуш не показуємо
        inBlad ? '' : o.knop({ tekst: t('Аркуш адаптера', 'Blad van de adapter'), icoon: 'panel-right-open', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'soadapter:simulator' } })) + '</div>';
  }

  function integratiesTab(ctx) {
    var w = ctx.staat;
    var nieuw = X.integratie.wizard && X.integratie.wizard.klaar ? 0 : 3;
    var banner = nieuw ? '<div class="hv-so-banner" data-k="so-banner" role="status">' + ic('package-plus') + '<div class="hv-so-banner__tekst"><p class="hv-so-banner__titel">' + h(t('Знайдено 3 нові пристрої', '3 nieuwe apparaten gevonden')) + '</p><p class="hv-so-banner__sub">' + h(t('Симулятор · кухня й гараж · виявлено ' + HV.tijd(w.tijd - 6 * 60000), 'Simulator · keuken en garage · ontdekt om ' + HV.tijd(w.tijd - 6 * 60000))) + '</p></div>' +
      o.knop({ tekst: t('Додати', 'Toevoegen'), icoon: 'plus', soort: 'hoofd', actie: 'so-wizard-open' }) + '</div>' : '';
    var bron = kaart('so-bron', kop('flask-conical', t('Джерело зараз', 'Bron nu'), o.chip({ icoon: 'flask-conical', toon: 'sim', tekst: t('демо-дім', 'demowoning') }), h(t('Походження — властивість оселі: справжній адаптер у демо-дім не під’єднується.', 'Herkomst is een eigenschap van de woning: een echte adapter komt nooit in de demowoning.'))) + gezondheid(ctx) +
      noot('info', t('Фраза «жоден справжній пристрій не змінено» в демо-домі завжди правдива: змішаного дому немає.', 'De zin ‘geen echt apparaat is gewijzigd’ is in de demowoning altijd waar: een gemengd huis bestaat niet.')));
    var catalogus = '<div class="hv-so-catalogus" data-k="so-catalogus">' + CATALOGUS.map(function (c) {
      var melden = !!X.integratie.melden[c.id];
      return '<article class="hv-so-bronkaart" data-k="so-bk-' + c.id + '"><button type="button" class="hv-so-bronkaart__lijf" data-actie="blad" data-blad="soadapter:' + c.id + '" aria-label="' + h(c.naam + '. ' + t('Відкрити опис', 'Beschrijving openen')) + '">' +
        '<span class="hv-so-bronkaart__teken">' + ic(c.icoon) + '</span><span class="hv-so-bronkaart__naam">' + h(c.naam) + '</span>' +
        '<span class="hv-so-bronkaart__wat">' + h(HV.p(c.wat)) + '</span></button>' +
        '<div class="hv-so-bronkaart__voet">' + o.later(t('пізніше · етап ' + c.etap, 'later · fase ' + c.etap)) +
        o.chip({ icoon: melden ? 'bell-ring' : 'bell', tekst: melden ? t('сповіщу', 'ik meld het') : t('сповістити', 'melden'), actie: 'so-bron-melden', gegevens: { bron: c.id }, gekozen: melden, filter: true, aria: t('Сповістити, коли буде готово: ', 'Melden als het klaar is: ') + c.naam }) + '</div></article>';
    }).join('') + '</div>';
    return '<div class="hv-so" data-k="so-integraties">' + banner +
      '<div class="hv-so-raster"><div class="hv-so-kolom">' + bron + '</div><div class="hv-so-kolom">' +
      kaart('so-wizardkaart', kop('wand-sparkles', t('Майстер нового пристрою', 'Wizard voor een nieuw apparaat'), o.later(t('каркас · етап 8', 'geraamte · fase 8'))) +
        '<ol class="hv-so-stapbalk">' + WIZARD_STAPPEN.map(function (s, i) { return '<li><span>' + (i + 1) + '</span>' + h(HV.p(s)) + '</li>'; }).join('') + '</ol>' +
        knoppen(o.knop({ tekst: t('Відкрити майстер', 'Wizard openen'), icoon: 'wand-sparkles', actie: 'so-wizard-open' })) +
        noot('flask-conical', t('У демо-домі майстер працює із симулятором; справжні джерела — зі штампом «пізніше».', 'In de demowoning werkt de wizard met de simulator; echte bronnen dragen het stempel ‘later’.'))) + '</div></div>' +
      o.blok({ id: 'so-catalogus', titel: t('Справжні джерела', 'Echte bronnen'), teller: CATALOGUS.length, inhoud: catalogus, uitleg: t('Що станеться: адаптер джерела під’єднається до справжнього дому, не до демо. Пов’язано з: майстер «Перенести налаштування» переносить кімнати й сцени чернетками. Як повернути: аркуш адаптера → «Вимкнути».', 'Wat er gebeurt: de adapter van de bron koppelt aan het echte huis, niet aan de demo. Hangt samen met: de wizard ‘Instellingen overnemen’ neemt kamers en scènes over als concept. Terugdraaien: blad van de adapter → ‘Uitzetten’.') }) + '</div>';
  }

  // аркуш адаптера: маніфест, справність, «що зникне, якщо вимкнути»
  HV.blad({
    soort: 'soadapter', vrij: true, icoon: function (ctx, id) { var c = CATALOGUS.filter(function (x) { return x.id === id; })[0]; return c ? c.icoon : 'flask-conical'; },
    titel: function (ctx, id) { var c = CATALOGUS.filter(function (x) { return x.id === id; })[0]; return c ? c.naam : t('Симулятор', 'Simulator'); },
    sub: function (ctx, id) { return id === 'simulator' ? t('адаптер демо-дому', 'adapter van de demowoning') : t('справжнє джерело · пізніше', 'echte bron · later'); },
    render: function (ctx, id) {
      var c = CATALOGUS.filter(function (x) { return x.id === id; })[0];
      if (!c) {
        var w = ctx.staat;
        return '<div class="hv-so-blad">' + o.kaart({ inhoud: gezondheid(ctx, false, true) }) +
          o.kaart({ titel: t('Маніфест', 'Manifest'), inhoud: '<dl class="hv-so-feiten">' +
            [[t('Назва', 'Naam'), 'huis-sim'], [t('Походження', 'Herkomst'), t('симуляція', 'simulatie')], [t('Шлях', 'Pad'), t('у процесі сервера', 'in het serverproces')], [t('Строк підтвердження', 'Bevestigingstermijn'), '3 ' + t('с', 's')], [t('Зерно', 'Zaad'), String(w.zaad >>> 0).slice(0, 8)], [t('Спроб після збою', 'Pogingen na storing'), '3 · 5 ' + t('с', 's') + ' · 45 ' + t('с', 's')]]
              .map(function (f) { return '<div><dt>' + h(f[0]) + '</dt><dd>' + h(f[1]) + '</dd></div>'; }).join('') + '</dl>' }) +
          o.kaart({ titel: t('Що зникне, якщо вимкнути', 'Wat verdwijnt als je uitzet'), inhoud: '<ul class="hv-so-lijst">' +
            [t('усі ' + w.volgorde.length + ' пристроїв демо-дому стануть недоступні', 'alle ' + w.volgorde.length + ' apparaten van de demowoning worden onbereikbaar'), t('сценарії, «Світ» і «Траси» зупиняться', 'scenario’s, ‘Wereld’ en ‘Sporen’ stoppen'), t('стрічка доби лишиться з минулого зерна', 'de dagstrook blijft van het vorige zaad')].map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul>' +
            knoppen(o.knop({ tekst: t('Імітувати збій', 'Storing nabootsen'), icoon: 'unplug', actie: 'so-adapter', gegevens: { waarde: 'offline' } }), o.knop({ tekst: t('До збоїв симулятора', 'Naar storingen van de simulator'), icoon: 'flask-conical', soort: 'stil', actie: 'ga', gegevens: { naar: 'instellingen-simulator' } })) }) + '</div>';
      }
      var melden = !!X.integratie.melden[c.id];
      return '<div class="hv-so-blad">' + o.kaart({ inhoud: '<p class="hv-so-blad__zin">' + h(HV.p(c.wat)) + '</p>' + '<p>' + o.later(t('пізніше · етап ' + c.etap, 'later · fase ' + c.etap)) + '</p>' }) +
        o.kaart({ titel: t('Як він під’єднуватиметься', 'Hoe hij gaat koppelen'), inhoud: '<ol class="hv-stappen">' +
          [t('Джерело в майстрі нового пристрою', 'Bron in de wizard voor een nieuw apparaat'), HV.p(c.pad), t('Що знайдено: рівень кожної дії', 'Wat er is gevonden: het niveau van elke actie'), t('Кімната й назви українською та нідерландською', 'Kamer en namen in het Oekraïens en Nederlands')].map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ol>' +
          noot('shield-check', t('Нові пристрої приходять із дозволами «Вимкнено» для всіх виконавців.', 'Nieuwe apparaten komen binnen met toestemming ‘Uit’ voor alle uitvoerders.')) }) +
        o.kaart({ titel: t('Сповіщення', 'Melding'), inhoud: '<div class="hv-so-schakelrij">' + o.schakel({ aan: melden, icoon: 'bell-ring', toon: 'aan', actie: 'so-bron-melden', gegevens: { bron: c.id }, aria: t('Сповістити, коли буде готово', 'Melden als het klaar is') }) +
          '<div><p class="hv-so-schakelrij__naam">' + h(t('Сповістити, коли буде готово', 'Melden als het klaar is')) + '</p><p class="hv-so-schakelrij__sub">' + h(t('Запис у Журналі й сповіщення на всі ваші пристрої.', 'Een regel in het logboek en een melding op al je toestellen.')) + '</p></div></div>' }) + '</div>';
    }
  });

  // ── майстер нового пристрою (каркас) ──
  var WIZARD_STAPPEN = [['Джерело', 'Bron'], ['Сполучення', 'Koppelen'], ['Що знайдено', 'Wat er is gevonden'], ['Кімната й назви', 'Kamer en namen'], ['Що з ним робити?', 'Wat wil je ermee doen?']];
  var GEVONDEN = [
    { id: 'waterkoker', soort: 'stopcontact', icoon: 'plug', naam: ['Чайник', 'Waterkoker'], wat: ['Розетка: стан, потужність', 'Stekker: toestand, vermogen'], niveau: 'gewoon', mog: ['aan', 'vermogen'], st: { aan: false, vermogen: 0, vandaag: 0 }, kamer: 'keuken' },
    { id: 'lekgootsteen', soort: 'lek', icoon: 'droplet', naam: ['Протікання під мийкою', 'Lekkage onder de gootsteen'], wat: ['Датчик протікання: лише читання', 'Lekkagesensor: alleen lezen'], niveau: 'gewoon', mog: [], st: { alarm: false }, kamer: 'keuken' },
    { id: 'tempgarage', soort: 'temperatuur', icoon: 'thermometer', naam: ['Температура в гаражі', 'Temperatuur garage'], wat: ['Датчик температури: лише читання', 'Temperatuursensor: alleen lezen'], niveau: 'gewoon', mog: [], st: { waarde: 8.4 }, kamer: 'garage', eenheid: '°C' },
    { id: 'klep', soort: 'klep', icoon: 'circle-gauge', naam: ['Клапан води', 'Waterklep'], wat: ['Клапан: відкрити й закрити — дія небезпечна', 'Klep: openen en sluiten — gevaarlijke actie'], niveau: 'gevaarlijk', nietOndersteund: true }
  ];
  function wizardHtml(ctx) {
    var z = X.integratie.wizard || (X.integratie.wizard = { stap: 1, bron: 'simulator', aftel: null, gekozen: { waterkoker: true, lekgootsteen: true, tempgarage: true }, recepten: { weg: true, kookt: false, nacht: false } });
    var balk = '<ol class="hv-so-stapbalk is-voortgang" aria-label="' + h(t('Кроки майстра', 'Stappen van de wizard')) + '">' + WIZARD_STAPPEN.map(function (s, i) {
      var n = i + 1;
      return '<li class="' + (n < z.stap ? 'is-klaar' : n === z.stap ? 'is-nu' : '') + '"' + (n === z.stap ? ' aria-current="step"' : '') + '><span>' + (n < z.stap ? ic('check', { maat: 's' }) : n) + '</span>' + h(HV.p(s)) + '</li>';
    }).join('') + '</ol>';
    var lijf = '', verder = null, terug = z.stap > 1 ? o.knop({ tekst: t('Назад', 'Terug'), icoon: 'chevron-left', soort: 'stil', actie: 'so-wizard-stap', gegevens: { stap: z.stap - 1 } }) : '';
    if (z.klaar) {
      return balk + o.leeg({ icoon: 'badge-check', titel: t('Додано 3 пристрої', '3 apparaten toegevoegd'), tekst: t('Вони вже в кімнатах «Кухня» й «Гараж»; дозволи для всіх виконавців — «Вимкнено».', 'Ze staan al in ‘Keuken’ en ‘Garage’; toestemmingen voor alle uitvoerders staan op ‘Uit’.'), actie: { tekst: t('До кухні', 'Naar de keuken'), icoon: 'cooking-pot', soort: 'hoofd', actie: 'ga', gegevens: { naar: 'kamers-kamer-keuken' } } });
    }
    if (z.stap === 1) {
      lijf = '<div class="hv-so-keuzes" role="radiogroup" aria-label="' + h(t('Джерело', 'Bron')) + '">' +
        '<button type="button" role="radio" aria-checked="true" class="hv-so-keuze is-gekozen" data-actie="so-wizard-stap" data-stap="1">' + ic('flask-conical') + '<span><strong>' + h(t('Симулятор', 'Simulator')) + '</strong><small>' + h(t('3 пристрої чекають на сполучення', '3 apparaten wachten op koppelen')) + '</small></span></button>' +
        CATALOGUS.slice(0, 4).map(function (c) { return '<button type="button" role="radio" aria-checked="false" class="hv-so-keuze is-later" data-actie="blad" data-blad="soadapter:' + c.id + '">' + ic(c.icoon) + '<span><strong>' + h(c.naam) + '</strong><small>' + h(t('пізніше · етап ', 'later · fase ') + c.etap) + '</small></span></button>'; }).join('') + '</div>';
      verder = o.knop({ tekst: t('Далі', 'Verder'), icoon: 'chevron-right', soort: 'hoofd', actie: 'so-wizard-stap', gegevens: { stap: 2 } });
    } else if (z.stap === 2) {
      var rest = z.aftel ? Math.max(0, Math.ceil((z.aftel - REEL()) / 1000)) : 24;
      lijf = '<div class="hv-so-aftelgroot">' + o.aftel({ rest: Math.max(0.1, rest / 60), totaal: 24 / 60, icoon: 'radio', klaar: z.verbonden }) + '<div><p class="hv-so-aftelgroot__tekst">' + h(z.verbonden ? t('Сполучено: міст симулятора відповів.', 'Gekoppeld: de brug van de simulator antwoordde.') : t('Натисніть кнопку на мості', 'Druk op de knop van de bridge')) + '</p>' +
        '<p class="hv-so-aftelgroot__sub">' + h(z.verbonden ? t('Знайдено 4 пристрої.', '4 apparaten gevonden.') : z.aftel ? t('Залишилось ' + rest + ' с — фізична дія на пристрої.', 'Nog ' + rest + ' s — een fysieke handeling op het apparaat.') : t('Після натиску відлік 24 с.', 'Na het drukken telt het 24 s af.')) + '</p></div></div>' +
        (z.verbonden ? '' : knoppen(o.knop({ tekst: z.aftel ? t('Натиснуто на мості', 'Gedrukt op de brug') : t('Почати відлік', 'Aftellen starten'), icoon: z.aftel ? 'hand' : 'timer', actie: 'so-wizard-koppel' })));
      verder = o.knop({ tekst: t('Далі', 'Verder'), icoon: 'chevron-right', soort: 'hoofd', actie: 'so-wizard-stap', gegevens: { stap: 3 }, uit: !z.verbonden });
    } else if (z.stap === 3) {
      lijf = '<ul class="hv-so-gevonden-lijst">' + GEVONDEN.map(function (g) {
        var aan = !!z.gekozen[g.id];
        return '<li class="' + (g.nietOndersteund ? 'is-later' : '') + '">' + (g.nietOndersteund ? '<span class="hv-so-vinkje is-uit" aria-hidden="true">' + ic('minus', { maat: 's' }) + '</span>' : '<button type="button" class="hv-so-vinkje' + (aan ? ' is-aan' : '') + '" role="checkbox" aria-checked="' + (aan ? 'true' : 'false') + '" aria-label="' + h(HV.p(g.naam)) + '" data-actie="so-wizard-kies" data-id="' + g.id + '">' + (aan ? ic('check', { maat: 's' }) : '') + '</button>') +
          '<span class="hv-so-gevonden-lijst__teken">' + ic(g.icoon) + '</span><span class="hv-so-gevonden-lijst__tekst"><strong>' + h(HV.p(g.naam)) + '</strong><small>' + h(HV.p(g.wat)) + '</small></span>' +
          (g.niveau !== 'gewoon' ? o.risico(g.niveau) : '') + (g.nietOndersteund ? o.later(t('клас · етап 8', 'klasse · fase 8')) : '') + '</li>';
      }).join('') + '</ul>';
      verder = o.knop({ tekst: t('Далі', 'Verder'), icoon: 'chevron-right', soort: 'hoofd', actie: 'so-wizard-stap', gegevens: { stap: 4 }, uit: !Object.keys(z.gekozen).some(function (k) { return z.gekozen[k]; }) });
    } else if (z.stap === 4) {
      lijf = GEVONDEN.filter(function (g) { return z.gekozen[g.id] && !g.nietOndersteund; }).map(function (g) {
        return '<div class="hv-so-naamrij">' + ic(g.icoon) + '<div><p class="hv-so-naamrij__naam">' + h(g.naam[0]) + ' <span class="hv-so-naamrij__nl">/ ' + h(g.naam[1]) + '</span></p>' +
          o.segment({ label: t('Кімната: ', 'Kamer: ') + HV.p(g.naam), waarde: (z.kamers && z.kamers[g.id]) || g.kamer, actie: 'so-wizard-kamer', gegevens: { id: g.id }, opties: ['keuken', 'bijkeuken', 'garage', 'hal'].map(function (k) { return { id: k, label: kamerNaam(k) }; }), klas: 'hv-so-segment-breed' }) + '</div></div>';
      }).join('') + noot('languages', t('Назви — двома мовами одразу; псевдоніми для Команди додаються на сторінці пристрою.', 'Namen meteen in twee talen; aliassen voor de Opdracht voeg je toe op de apparaatpagina.'));
      verder = o.knop({ tekst: t('Далі', 'Verder'), icoon: 'chevron-right', soort: 'hoofd', actie: 'so-wizard-stap', gegevens: { stap: 5 } });
    } else {
      var recept = function (id, tekst) { var aan = !!z.recepten[id]; return '<li><button type="button" class="hv-so-vinkje' + (aan ? ' is-aan' : '') + '" role="checkbox" aria-checked="' + (aan ? 'true' : 'false') + '" aria-label="' + h(tekst) + '" data-actie="so-wizard-recept" data-id="' + id + '">' + (aan ? ic('check', { maat: 's' }) : '') + '</button><span>' + h(tekst) + '</span></li>'; };
      lijf = '<ul class="hv-so-recepten">' + recept('weg', t('Вимикати чайник, коли нікого немає', 'De waterkoker uitzetten als niemand thuis is')) + recept('kookt', t('Сповіщати, коли закипів', 'Melden als het water kookt')) + recept('nacht', t('Додати до сцени «На добраніч»', 'Toevoegen aan de scène ‘Welterusten’')) + '</ul>' +
        '<div class="hv-so-gevolgkaart">' + o.gevolgRijen(t('Що станеться: пристрої з’являться в кімнатах «Кухня» й «Гараж», у зведенні енергії та в дії «Вимкнути все». Пов’язано з: агенти побачать їх, усі дозволи — «Вимкнено». Як повернути: сторінка пристрою → «Вилучити».', 'Wat er gebeurt: de apparaten verschijnen in ‘Keuken’ en ‘Garage’, in het energieoverzicht en in ‘Alles uit’. Hangt samen met: agenten zien ze, alle toestemmingen staan op ‘Uit’. Terugdraaien: apparaatpagina → ‘Verwijderen’.')) + '</div>';
      verder = o.knop({ tekst: t('Додати пристрої', 'Apparaten toevoegen'), icoon: 'plus', soort: 'hoofd', actie: 'so-wizard-klaar' });
    }
    return balk + '<div class="hv-so-wizard__lijf" data-k="so-wizard-' + z.stap + '">' + lijf + '</div>' + knoppen(terug, verder);
  }
  HV.blad({ soort: 'sowizard', vrij: true, breed: true, icoon: 'wand-sparkles', titel: ['Новий пристрій', 'Nieuw apparaat'], sub: function () { return t('симулятор · демо-дім', 'simulator · demowoning'); }, render: function (ctx) { return '<div class="hv-so-blad hv-so-wizard">' + o.kaart({ inhoud: wizardHtml(ctx) }) + '</div>'; } });

  HV.actie('so-wizard-open', function (ctx) {
    if (X.integratie.wizard && X.integratie.wizard.klaar) X.integratie.wizard = null;
    if (ctx.route.tab !== 'integraties') ctx.open('instellingen-integraties');
    HV.bladOpen('sowizard');
  });
  HV.actie('so-wizard-stap', function (ctx, g) { var z = X.integratie.wizard; if (!z) return; z.stap = Math.max(1, Math.min(5, Number(g.stap) || 1)); HV.teken(); });
  var wizardKlok = null;
  HV.actie('so-wizard-koppel', function () {
    var z = X.integratie.wizard; if (!z) return;
    if (z.aftel) { z.verbonden = true; z.aftel = null; clearInterval(wizardKlok); HV.teken(); return; }
    z.aftel = REEL() + 24000;
    clearInterval(wizardKlok);
    wizardKlok = setInterval(function () {
      if (!z.aftel) { clearInterval(wizardKlok); return; }
      if (REEL() > z.aftel) { z.aftel = null; clearInterval(wizardKlok); HV.meld({ gewicht: 'belangrijk', icoon: 'timer-off', titel: t('Сполучення не вдалося', 'Koppelen mislukt'), tekst: t('Кнопку на мості не натиснуто за 24 с. Спробуйте ще раз.', 'De knop op de brug is niet binnen 24 s ingedrukt. Probeer het opnieuw.') }); }
      HV.teken();
    }, 1000);
    HV.teken();
  });
  HV.actie('so-wizard-kies', function (ctx, g) { var z = X.integratie.wizard; if (!z) return; z.gekozen[g.id] = !z.gekozen[g.id]; HV.teken(); });
  HV.actie('so-wizard-kamer', function (ctx, g) { var z = X.integratie.wizard; if (!z) return; z.kamers = z.kamers || {}; z.kamers[g.id] = g.waarde; HV.teken(); });
  HV.actie('so-wizard-recept', function (ctx, g) { var z = X.integratie.wizard; if (!z) return; z.recepten[g.id] = !z.recepten[g.id]; HV.teken(); });
  HV.actie('so-wizard-klaar', function () {
    var z = X.integratie.wizard; if (!z) return;
    var nieuw = GEVONDEN.filter(function (g) { return z.gekozen[g.id] && !g.nietOndersteund; }).map(function (g) {
      var a = { id: g.id, soort: g.soort, kamer: (z.kamers && z.kamers[g.id]) || g.kamer, naam: g.naam.slice(), mog: g.mog.slice(), st: JSON.parse(JSON.stringify(g.st)), beschikbaar: 'ok', bron: 'Симулятор', virtueel: true };
      if (g.eenheid) { a.eenheid = g.eenheid; a.hoofd = true; }
      if (g.soort === 'stopcontact') a.watt = 2200;
      return a;
    });
    sysDoe({ min: 3, icoon: 'package-plus', wat: ['Додано пристроїв: ' + nieuw.length, 'Apparaten toegevoegd: ' + nieuw.length], waarom: ['майстер нового пристрою · симулятор', 'wizard voor een nieuw apparaat · simulator'], soort: 'huis.integratie',
      tekst: nieuw.map(function (a) { return HV.p(a.naam); }).join(', '),
      pas: function () { nieuw.forEach(function (a) { X.virtueel.push(a); }); pasSimToe(HV.staat.w); z.klaar = true; },
      terug: function () { nieuw.forEach(function (a) { verwijderApparaat(a.id); }); z.klaar = false; z.stap = 5; } });
  });
  function verwijderApparaat(id) {
    X.virtueel = X.virtueel.filter(function (v) { return v.id !== id; });
    HV.staat.wijzig(function (w) { delete w.apparaten[id]; w.volgorde = w.volgorde.filter(function (x) { return x !== id; }); w.favorieten = (w.favorieten || []).filter(function (x) { return x !== id; }); });
  }
  HV.actie('so-bron-melden', function (ctx, g) {
    var c = CATALOGUS.filter(function (x) { return x.id === g.bron; })[0]; if (!c) return;
    var was = !!X.integratie.melden[c.id];
    sysDoe({ min: 2, icoon: was ? 'bell-off' : 'bell-ring', soort: 'huis.integratie', wat: [c.naam + ': сповістити про готовність', c.naam + ': melden als het klaar is'], was: was ? ['так', 'ja'] : ['ні', 'nee'], werd: was ? ['ні', 'nee'] : ['так', 'ja'],
      pas: function () { X.integratie.melden[c.id] = !was; }, terug: function () { X.integratie.melden[c.id] = was; } });
  });
  HV.actie('so-adapter-herstart', function () {
    sysDoe({ min: 2, icoon: 'rotate-ccw', soort: 'huis.integratie', wat: ['Адаптер симулятора перезапущено', 'Adapter van de simulator herstart'], hoe: t('Як повернути: не потрібно — адаптер повернувся за 2 с.', 'Terugdraaien: niet nodig — de adapter was na 2 s terug.'),
      pas: function () { X.integratie.herstart = REEL(); } });
  });
  HV.actie('so-adapter', function (ctx, g) { zetAdapter(g.waarde); });

  // ═════════════════════════ 3. Симулятор ═════════════════════════
  // Зона сценарію з реєстру (для фільтра) і що він змінює.
  var SCENARIO_ZONE = {
    ochtend: 'achtergrond', avond: 'achtergrond', nacht: 'achtergrond', zonnigemiddag: 'energie', negatieveprijs: 'energie',
    niemandthuis: 'veiligheid', deurbel: 'veiligheid', rook: 'veiligheid', lek: 'veiligheid', dakinspectie: 'garage', signaalverlies: 'garage', terugkeer: 'garage',
    agentverzoek: 'agenten', storing: 'systeem', eerstestart: 'systeem'
  };
  var ZONES = { achtergrond: { naam: ['Тло', 'Achtergrond'], icoon: 'sun' }, energie: { naam: ['Енергія', 'Energie'], icoon: 'zap' }, veiligheid: { naam: ['Безпека', 'Veiligheid'], icoon: 'shield' }, garage: { naam: ['Гараж', 'Garage'], icoon: 'car' }, agenten: { naam: ['Агенти', 'Agenten'], icoon: 'bot' }, systeem: { naam: ['Система', 'Systeem'], icoon: 'cpu' } };
  var SCENARIO_ICOON = { ochtend: 'sunrise', zonnigemiddag: 'sun', avond: 'sunset', nacht: 'moon', niemandthuis: 'log-out', deurbel: 'bell-ring', rook: 'alarm-smoke', lek: 'droplet', storing: 'wifi-off', agentverzoek: 'bot', eerstestart: 'sparkles', dakinspectie: 'drone', signaalverlies: 'radio-tower', terugkeer: 'car', negatieveprijs: 'euro' };

  /** hv-klok: час дому з підписом, справжній час, пауза й швидкість, «Зрівняти з годинником». */
  function klok(ctx, kort) {
    var w = ctx.staat, snel = w.pauze ? 0 : w.snelheid;
    var dag = HV.datum(w.tijd);
    var stil = !w.pauze && w.snelheid >= 10;
    return '<section class="hv-so-klok' + (w.pauze ? ' is-pauze' : '') + '" data-k="so-klok" aria-label="' + h(t('Час дому', 'Huistijd')) + '">' +
      '<div class="hv-so-klok__tijden"><div class="hv-so-klok__huis"><span class="hv-so-klok__label">' + ic('flask-conical', { maat: 's' }) + h(t('час дому', 'huistijd')) + '</span>' +
      '<span class="hv-so-klok__getal">' + HV.tijd(w.tijd) + '</span><span class="hv-so-klok__dag">' + h(dag) + '</span></div>' +
      '<div class="hv-so-klok__echt"><span class="hv-so-klok__label">' + ic('clock-4', { maat: 's' }) + h(t('справжній час', 'echte tijd')) + '</span><span class="hv-so-klok__klein">' + echteTijd() + '</span>' +
      '<span class="hv-so-klok__dag">' + h(w.pauze ? t('час дому стоїть', 'huistijd staat stil') : t('1 с = ', '1 s = ') + (snel >= 60 ? HV.duur(snel / 60) : snel + ' ' + t('с', 's')) + t(' дому', ' huistijd')) + '</span></div></div>' +
      '<div class="hv-so-klok__bediening">' + o.segment({ label: t('Швидкість часу дому', 'Snelheid van de huistijd'), waarde: snel, actie: 'so-snelheid', klas: 'hv-so-snelheid', k: 'so-snelheid', opties: [
        { id: 0, label: t('Пауза', 'Pauze'), icoon: 'pause' }, { id: 1, label: '×1' }, { id: 10, label: '×10' }, { id: 60, label: '×60' }, { id: 600, label: '×600' }] }) +
      (kort ? '' : knoppen(o.knop({ tekst: t('Зрівняти з годинником', 'Gelijkzetten met de klok'), icoon: 'clock-4', klein: true, actie: 'so-gelijk' }), o.knop({ tekst: t('+1 година', '+1 uur'), icoon: 'fast-forward', soort: 'stil', klein: true, actie: 'so-stap', gegevens: { sec: 3600 } }))) + '</div>' +
      (stil || w.snelheid === 600 ? '<div class="hv-so-klok__noten">' + (stil ? o.chip({ icoon: 'bell-off', tekst: t('від ×10 зовнішні канали мовчать', 'vanaf ×10 zwijgen externe kanalen') }) : '') + (w.snelheid === 600 && !w.pauze ? o.chip({ icoon: 'timer', tekst: t('×600 стане на паузу після 30 діб', '×600 pauzeert na 30 dagen') }) : '') + '</div>' : '') + '</section>';
  }

  /** hv-scenario: рядок сценарію — знак, назва, що змінює, момент, «іде», запуск. */
  function scenarioRij(s, actief) {
    var z = ZONES[SCENARIO_ZONE[s.id]] || ZONES.achtergrond;
    return '<li class="hv-so-scenario' + (actief ? ' is-actief' : '') + '" data-k="so-sc-' + h(s.id) + '">' +
      '<button type="button" class="hv-so-scenario__lijf" data-actie="blad" data-blad="soscenario:' + h(s.id) + '" aria-label="' + h(HV.p(s.naam) + (actief ? ', ' + t('іде', 'loopt') : '') + '. ' + t('Подробиці', 'Details')) + '">' +
      '<span class="hv-so-scenario__teken">' + ic(SCENARIO_ICOON[s.id] || 'flask-conical') + '</span>' +
      '<span class="hv-so-scenario__tekst"><span class="hv-so-scenario__naam">' + h(HV.p(s.naam)) + (actief ? '<span class="hv-so-scenario__loopt"><i aria-hidden="true"></i>' + h(t('іде', 'loopt')) + '</span>' : '') + '</span>' +
      '<span class="hv-so-scenario__wat">' + h(HV.p(s.wat)) + '</span>' +
      '<span class="hv-so-scenario__meta">' + ic(z.icoon, { maat: 'maker' }) + h(HV.p(z.naam) + ' · ' + HV.datumKort(s.tijd) + ' ' + HV.tijd(s.tijd)) + '</span></span></button>' +
      o.icoonknop({ icoon: actief ? 'rotate-ccw' : 'play', aria: (actief ? t('Почати знову: ', 'Opnieuw starten: ') : t('Запустити: ', 'Starten: ')) + HV.p(s.naam), actie: 'so-scenario', gegevens: { scenario: s.id }, klas: 'hv-so-scenario__start' }) + '</li>';
  }

  function scenariosBlok(ctx) {
    var w = ctx.staat, filter = HV.ui.lees('so-sc-zone', 'alle');
    var lijst = HV.scenarios.lijst.filter(function (s) { return filter === 'alle' || SCENARIO_ZONE[s.id] === filter; });
    var filters = '<div class="hv-filter hv-so-filter" role="group" aria-label="' + h(t('Зона сценарію', 'Zone van het scenario')) + '">' + o.chip({ tekst: t('Усі', 'Alle'), filter: true, gekozen: filter === 'alle', actie: 'ui', gegevens: { naam: 'so-sc-zone', waarde: 'alle' } }) +
      Object.keys(ZONES).map(function (z) { return o.chip({ icoon: ZONES[z].icoon, tekst: HV.p(ZONES[z].naam), filter: true, gekozen: filter === z, actie: 'ui', gegevens: { naam: 'so-sc-zone', waarde: z } }); }).join('') + '</div>';
    var eigen = X.sporen.lijst.filter(function (s) { return s.opgeslagen; });
    var eigenHtml = eigen.length && (filter === 'alle') ? '<h4 class="hv-so-tussenkop">' + h(t('Мої сценарії з трас', 'Mijn scenario’s uit sporen')) + '</h4><ul class="hv-so-scenarios">' + eigen.map(function (s) {
      var speelt = X.sporen.speelt && X.sporen.speelt.id === s.id;
      return '<li class="hv-so-scenario' + (speelt ? ' is-actief' : '') + '" data-k="so-esc-' + s.id + '"><button type="button" class="hv-so-scenario__lijf" data-actie="ga" data-naar="instellingen-simulator-sporen" aria-label="' + h(HV.p(s.naam) + '. ' + t('До трас', 'Naar sporen')) + '"><span class="hv-so-scenario__teken">' + ic('route') + '</span><span class="hv-so-scenario__tekst"><span class="hv-so-scenario__naam">' + h(HV.p(s.naam)) + (speelt ? '<span class="hv-so-scenario__loopt"><i aria-hidden="true"></i>' + h(t('відтворюється', 'speelt af')) + '</span>' : '') + '</span><span class="hv-so-scenario__wat">' + h(tel(s.acties.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']) + ' · ' + HV.getal(s.duur / 1000, 0) + ' ' + t('с', 's') + ' · ' + t('основа: ', 'basis: ') + HV.p((HV.scenarios.vind(s.scenario) || { naam: ['—', '—'] }).naam)) + '</span></span></button>' +
        o.icoonknop({ icoon: 'play', aria: t('Відтворити: ', 'Afspelen: ') + HV.p(s.naam), actie: 'so-spoor-speel', gegevens: { spoor: s.id }, klas: 'hv-so-scenario__start' }) + '</li>';
    }).join('') + '</ul>' : '';
    return o.blok({ id: 'so-scenarios', titel: t('Сценарії', 'Scenario’s'), teller: HV.scenarios.lijst.length, samenvatting: h(w.scenario ? t('Іде: ', 'Loopt: ') + HV.p(HV.scenarios.vind(w.scenario).naam) : t('Жоден не запущено', 'Geen gestart')),
      uitleg: t('Що станеться: світ перебудується з паспорта дому, час дому стане на момент сценарію, швидкість лишиться. Пов’язано з: дозволи «Вимкнено · Питати · Завжди» повертаються до типових. Як повернути: «Повернути» у сповіщенні запускає попередній сценарій.', 'Wat er gebeurt: de wereld wordt opnieuw opgebouwd uit het paspoort, de huistijd springt naar het moment van het scenario, de snelheid blijft. Hangt samen met: toestemmingen ‘Uit · Vragen · Altijd’ gaan terug naar standaard. Terugdraaien: ‘Ongedaan maken’ in de melding start het vorige scenario.'),
      inhoud: filters + '<ul class="hv-so-scenarios" data-k="so-sc-lijst">' + lijst.map(function (s) { return scenarioRij(s, w.scenario === s.id); }).join('') + '</ul>' + eigenHtml });
  }

  /** hv-simstoring: збої як звичайні перемикачі, без hv-stand. */
  function storingenBlok(ctx) {
    var w = ctx.staat, s = X.sim;
    var adapterOpties = ['goed', 'verzwakt', 'auth', 'limiet', 'offline'].map(function (id) { return { id: id, label: HV.p(ADAPTER_STAND[id].naam) }; });
    var actief = (s.vertraging ? 1 : 0) + (s.geenBevestiging ? 1 : 0) + (s.adapter !== 'goed' ? 1 : 0);
    return o.blok({ id: 'so-storingen', titel: t('Збої', 'Storingen'), teller: actief || null, samenvatting: h(actief ? tel(actief, ['збій увімкнено', 'збої ввімкнено', 'збоїв увімкнено'], ['storing aan', 'storingen aan']) : t('усе справне', 'alles gezond')),
      uitleg: t('Що станеться: симулятор поводиться як справжній збій — плитки показують «очікує», «не виконано» чи «немає зв’язку». Пов’язано з: Журнал і діагностика бачать ті самі збої. Як повернути: вимкніть перемикач; стан адаптера — «справний».', 'Wat er gebeurt: de simulator gedraagt zich als een echte storing — tegels tonen ‘wacht’, ‘niet uitgevoerd’ of ‘geen verbinding’. Hangt samen met: logboek en diagnose zien dezelfde storingen. Terugdraaien: zet de schakelaar uit; stand van de adapter — ‘gezond’.'),
      inhoud: '<div class="hv-so-storingen" data-k="so-storingen-lijf">' +
        '<div class="hv-so-storing"><span class="hv-so-storing__teken">' + ic('hourglass') + '</span><div class="hv-so-storing__tekst"><p class="hv-so-storing__naam">' + h(t('Затримка команд', 'Vertraging van opdrachten')) + '</p><p class="hv-so-storing__sub">' + h(t('Команда чекає в черзі адаптера перед виконанням.', 'Een opdracht wacht in de wachtrij van de adapter.')) + '</p></div>' +
          o.stapper({ actie: 'so-vertraging', stap: 1, label: t('Затримка', 'Vertraging'), waarde: HV.maat(s.vertraging, t('с', 's')), k: 'so-vertraging' }) + '</div>' +
        '<div class="hv-so-storing"><span class="hv-so-storing__teken">' + ic('circle-x') + '</span><div class="hv-so-storing__tekst"><p class="hv-so-storing__naam">' + h(t('Без підтвердження', 'Zonder bevestiging')) + '</p><p class="hv-so-storing__sub">' + h(t('Пристрій мовчить: за 10 с плитка покаже «не виконано».', 'Het apparaat zwijgt: na 10 s toont de tegel ‘niet uitgevoerd’.')) + '</p></div>' +
          o.schakel({ aan: s.geenBevestiging, icoon: 'circle-x', toon: 'aan', actie: 'so-geenbevestiging', aria: t('Без підтвердження', 'Zonder bevestiging') }) + '</div>' +
        '<div class="hv-so-storing hv-so-storing--breed"><span class="hv-so-storing__teken">' + ic('plug-2') + '</span><div class="hv-so-storing__tekst"><p class="hv-so-storing__naam">' + h(t('Стан адаптера', 'Stand van de adapter')) + '</p><p class="hv-so-storing__sub">' + h(HV.p((ADAPTER_STAND[s.adapter] || ADAPTER_STAND.goed).zin)) + '</p></div>' +
          o.segment({ label: t('Стан адаптера', 'Stand van de adapter'), waarde: s.adapter, actie: 'so-adapter', opties: adapterOpties, klas: 'hv-so-segment-breed', k: 'so-adapter' }) + '</div>' +
        '</div>' + (w.gegevens !== 'live' ? noot('wifi-off', t('Зараз дім показує «' + (w.gegevens === 'geen' ? 'немає зв’язку' : 'оновлення 30 с') + '» — так виглядає збій для мешканців.', 'Het huis toont nu ‘' + (w.gegevens === 'geen' ? 'geen verbinding' : 'ververst elke 30 s') + '’ — zo ziet een storing er voor bewoners uit.')) : '') });
  }

  function huisBlok(ctx) {
    var w = ctx.staat;
    var virt = X.virtueel.length;
    return o.blok({ id: 'so-huis', titel: t('Дім', 'Woning'), samenvatting: h(HV.p(HV.paspoort.naam)),
      inhoud: '<div class="hv-so-huis">' + '<div class="hv-so-huis__kop">' + ic('house') + '<div><p class="hv-so-huis__naam">' + h(HV.p(HV.paspoort.naam)) + '</p><p class="hv-so-huis__sub">' + h(HV.p(HV.paspoort.plaats) + ' · ' + t('зерно ', 'zaad ') + '20261109 · ' + tel(w.volgorde.length, ['пристрій', 'пристрої', 'пристроїв'], ['apparaat', 'apparaten']) + (virt ? ' · ' + t('віртуальних ', 'virtueel ') + virt : '')) + '</p></div></div>' +
        '<div class="hv-so-schakelrij">' + o.schakel({ aan: X.sim.extern, icoon: 'send', toon: 'aan', actie: 'so-extern', aria: t('Зовнішні сповіщення з демо-дому', 'Externe meldingen uit de demowoning') }) +
        '<div><p class="hv-so-schakelrij__naam">' + h(t('Зовнішні сповіщення', 'Externe meldingen')) + ' ' + o.gevolg(t('Що може статися: пошта й сповіщення на телефон підуть від вигаданих подій демо-дому. Хто зможе це запускати: будь-який сценарій і агент. Як вимкнути: цей перемикач.', 'Wat er kan gebeuren: e-mail en telefoonmeldingen gaan uit over verzonnen gebeurtenissen van de demowoning. Wie dit kan starten: elk scenario en elke agent. Uitzetten: deze schakelaar.'), { soort: 'uitroep', kop: t('Ризик', 'Risico') }) + '</p>' +
        '<p class="hv-so-schakelrij__sub">' + h(X.sim.extern ? t('Увімкнено: події демо-дому виходять назовні.', 'Aan: gebeurtenissen van de demowoning gaan naar buiten.') : t('Заблоковано на сервері, доки не ввімкнено.', 'Geblokkeerd op de server tot je dit aanzet.')) + '</p></div></div>' +
        knoppen(o.knop({ tekst: t('Скинути симуляцію', 'Simulatie wissen'), icoon: 'eraser', actie: 'so-wissen' }), o.knop({ tekst: t('Перенести налаштування', 'Instellingen overnemen'), icoon: 'arrow-right-left', soort: 'stil', actie: 'blad', gegevens: { blad: 'sooverzetten' } })) + slotRegel(3) + '</div>' });
  }

  /** hv-stroomlog: живий потік подій з паузою, фільтром автора й знаком автора. */
  function stroomBlok(ctx) {
    var w = ctx.staat, S = X.stroom;
    var bron = S.pauze || w.logboek;
    var lijst = bron.filter(function (r) { return S.filter === 'alle' || (r.maker && r.maker.soort === S.filter); }).slice(0, 12);
    var filters = [['alle', ['Усі', 'Alle'], null], ['mens', ['Люди', 'Mensen'], 'user'], ['simulator', ['Симулятор', 'Simulator'], 'flask-conical'], ['automatisering', ['Автоматика', 'Automatisering'], 'diamond'], ['agent', ['Агенти', 'Agenten'], 'bot'], ['systeem', ['Система', 'Systeem'], 'cpu']];
    return o.blok({ id: 'so-stroom', titel: t('Потік подій', 'Stroom van gebeurtenissen'), teller: S.pauze ? t('пауза', 'pauze') : null, samenvatting: lijst[0] ? h(HV.tijd(lijst[0].tijd) + ' · ' + HV.p(lijst[0].wat)) : '',
      extra: o.chip({ icoon: S.pauze ? 'play' : 'pause', tekst: S.pauze ? t('Продовжити', 'Doorgaan') : t('Пауза', 'Pauze'), actie: 'so-stroom-pauze', k: 'so-stroom-pauze' }),
      inhoud: '<div class="hv-filter hv-so-filter" role="group" aria-label="' + h(t('Автор події', 'Maker van de gebeurtenis')) + '">' + filters.map(function (f) { return o.chip({ icoon: f[2], tekst: HV.p(f[1]), filter: true, gekozen: S.filter === f[0], actie: 'so-stroom-filter', gegevens: { waarde: f[0] } }); }).join('') + '</div>' +
        (lijst.length ? '<ol class="hv-so-stroom" data-k="so-stroomlijst" aria-live="off">' + lijst.map(function (r) {
          return '<li class="hv-so-stroom__rij hv-so-stroom__rij--' + h(r.gewicht || 'info') + '" data-k="so-st-' + h(r.id) + '"><time>' + HV.tijd(r.tijd) + '</time>' + o.maker(r.maker, { alleenTeken: true }) + '<span class="hv-so-stroom__wat">' + h(HV.p(r.wat)) + '</span>' + (r.was && r.werd ? '<span class="hv-so-stroom__delta">' + h(HV.p(r.was) + ' → ' + HV.p(r.werd)) + '</span>' : '') + '</li>';
        }).join('') + '</ol>' : o.leeg({ icoon: 'list', titel: t('Подій немає', 'Geen gebeurtenissen'), tekst: t('Змініть фільтр або запустіть сценарій.', 'Wijzig het filter of start een scenario.') })) +
        knoppen(o.knop({ tekst: t('Увесь Журнал', 'Het hele logboek'), icoon: 'history', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'activiteit-geschiedenis' } })) });
  }

  // ── «Світ»: ручні значення фактичного боку ──
  function wereldZet(sleutel, naam, lees, schrijf, werd, opties) {
    var was = lees();
    if (JSON.stringify(was) === JSON.stringify(werd)) return;
    var bestaand = X.wereld[sleutel];
    var oorspronkelijk = bestaand ? bestaand.was : was;
    var woord = (opties && opties.woord) || function (v) { return [String(v), String(v)]; };
    HV.staat.wijzig(function () { schrijf(werd); });
    X.wereld[sleutel] = { naam: naam, was: oorspronkelijk, werd: werd, prijs: !!(opties && opties.prijs), herstel: function () { HV.staat.wijzig(function () { schrijf(oorspronkelijk); }); } };
    if (werd === oorspronkelijk || JSON.stringify(werd) === JSON.stringify(oorspronkelijk)) delete X.wereld[sleutel];
    HV.logboek.voegToe({ maker: SIM_HAND, wat: naam, was: woord(was), werd: woord(werd), waarom: ['ручне значення світу', 'handmatige waarde van de wereld'], soort: (opties && opties.soort) || 'huis.simulatie', gewicht: opties && opties.gewicht });
    HV.klok.stap(0);
    if (!(opties && opties.stil)) HV.meld({ maker: SIM_HAND, icoon: 'flask-conical', titel: HV.p(naam), tekst: HV.p(woord(was)) + ' → ' + HV.p(woord(werd)), terug: function () { HV.staat.wijzig(function () { schrijf(was); }); if (X.wereld[sleutel] && JSON.stringify(was) === JSON.stringify(X.wereld[sleutel].was)) delete X.wereld[sleutel]; HV.logboek.voegToe({ maker: SIM_HAND, wat: ['Повернуто: ' + naam[0], 'Ongedaan gemaakt: ' + naam[1]], soort: 'huis.simulatie' }); HV.klok.stap(0); } });
  }
  var handBadge = function (sleutel) { return X.wereld[sleutel] ? '<span class="hv-so-hand">' + ic('hand', { maat: 'maker' }) + h(t('ручне', 'handmatig')) + '</span>' : ''; };
  var NEERSLAG = { geen: ['без опадів', 'droog'], regen: ['дощ', 'regen'], sneeuw: ['сніг', 'sneeuw'], mist: ['туман', 'mist'] };
  var PLEK = { oprit: ['на під’їзді', 'op de oprit'], garage: ['у гаражі', 'in de garage'], onderweg: ['у дорозі', 'onderweg'] };

  function wereldRij(icoon, naam, sleutel, orgaan, sub) {
    return '<div class="hv-so-wereldrij" data-k="so-w-' + h(sleutel) + '"><span class="hv-so-wereldrij__teken">' + ic(icoon) + '</span><div class="hv-so-wereldrij__tekst"><p class="hv-so-wereldrij__naam">' + h(naam) + handBadge(sleutel) + '</p>' + (sub ? '<p class="hv-so-wereldrij__sub">' + h(sub) + '</p>' : '') + '</div><div class="hv-so-wereldrij__orgaan">' + orgaan + '</div></div>';
  }

  function wereldTab(ctx) {
    var w = ctx.staat, A = w.apparaten, aantal = Object.keys(X.wereld).length;
    var prijsNu = HV.tarief.prijs(w.tijd);
    var weer = wereldRij('thermometer', t('Температура надворі', 'Buitentemperatuur'), 'temp', o.stapper({ actie: 'so-w-stap', gegevens: { sleutel: 'temp' }, stap: 1, label: t('Температура надворі', 'Buitentemperatuur'), waarde: HV.maat(w.weer.temp, '°C', 0) })) +
      wereldRij('wind', t('Вітер', 'Wind'), 'wind', o.stapper({ actie: 'so-w-stap', gegevens: { sleutel: 'wind' }, stap: 1, label: t('Вітер', 'Wind'), waarde: HV.maat(w.weer.wind, t('м/с', 'm/s'), 0) })) +
      wereldRij('cloud', t('Хмарність', 'Bewolking'), 'bewolking', o.schuif({ label: t('Хмарність', 'Bewolking'), waarde: Math.round(w.weer.bewolking * 100), min: 0, max: 100, stap: 5, actie: 'so-w-schuif', gegevens: { sleutel: 'bewolking' }, k: 'so-w-bewolking' }), t('Сонячні панелі зараз: ', 'Zonnepanelen nu: ') + HV.maatTekst(A.zonnepanelen.st.vermogen, t('кВт', 'kW'), 1)) +
      wereldRij('cloud-rain', t('Опади', 'Neerslag'), 'neerslag', o.segment({ label: t('Опади', 'Neerslag'), waarde: w.weer.mist ? 'mist' : (w.weer.neerslag || 'geen'), actie: 'so-w-neerslag', opties: Object.keys(NEERSLAG).map(function (k) { return { id: k, label: HV.p(NEERSLAG[k]) }; }), klas: 'hv-so-segment-breed' })) +
      wereldRij('euro', t('Ціна години ', 'Prijs van het uur ') + HV.tijd(w.tijd - w.tijd % 3600000), 'prijs', o.stapper({ actie: 'so-w-stap', gegevens: { sleutel: 'prijs' }, stap: 1, label: t('Ціна години', 'Prijs van het uur'), waarde: HV.euro(prijsNu) }), t('за кВт·год · від’ємна — мережа доплачує', 'per kWh · negatief — het net betaalt'));
    var mensen = w.mensen.map(function (m) {
      return wereldRij(m.thuis ? 'house' : 'map-pin', HV.p(m.naam), 'mens-' + m.id, o.segment({ label: t('Де ', 'Waar is ') + HV.p(m.naam), waarde: m.thuis ? 'thuis' : 'weg', actie: 'so-w-mens', gegevens: { mens: m.id }, opties: [{ id: 'thuis', label: t('вдома', 'thuis'), icoon: 'house' }, { id: 'weg', label: t('не вдома', 'weg'), icoon: 'log-out' }] }), HV.p(({ eigenaar: ['власник', 'eigenaar'], bewoner: ['мешканець', 'bewoner'], kind: ['дитина', 'kind'], gast: ['гість', 'gast'] })[m.rol]) + ' · ' + t('з ', 'sinds ') + HV.tijd(m.sinds));
    }).join('');
    var ev = w.voertuigen[0];
    var auto = wereldRij('car', HV.p(ev.naam), 'ev-plek', o.segment({ label: t('Де авто', 'Waar de auto is'), waarde: ev.plek, actie: 'so-w-auto', opties: Object.keys(PLEK).map(function (k) { return { id: k, label: HV.p(PLEK[k]) }; }), klas: 'hv-so-segment-breed' })) +
      wereldRij('battery-charging', t('Заряд авто', 'Lading van de auto'), 'ev-lading', o.schuif({ label: t('Заряд авто', 'Lading van de auto'), waarde: Math.round(ev.lading), min: 0, max: 100, stap: 1, actie: 'so-w-schuif', gegevens: { sleutel: 'evlading' }, toon: 'batterij', k: 'so-w-evlading' }), t('запас ходу ', 'bereik ') + HV.maatTekst(ev.bereik, t('км', 'km'), 0));
    var contacten = HV.kijk.alle(function (a) { return a.soort === 'contact'; }).map(function (a) {
      return wereldRij(a.st.open ? 'door-open' : 'door-closed', HV.p(a.naam) + ' · ' + kamerNaam(a.kamer), 'c-' + a.id, o.schakel({ aan: !!a.st.open, icoon: a.st.open ? 'door-open' : 'door-closed', toon: 'let-op', actie: 'so-w-contact', gegevens: { doel: a.id }, aria: HV.p(a.naam) + ' · ' + kamerNaam(a.kamer) + ': ' + (a.st.open ? HV.woord.open() : HV.woord.dicht()) }), a.st.open ? HV.woord.open() + ' · ' + HV.duur(Math.round((w.tijd - (a.st.sinds || w.tijd)) / 60000)) : HV.woord.dicht());
    }).join('');
    var sensoren = [['co2slaap', 'cloud', 100, 'ppm', 0], ['vochtbad', 'droplets', 5, '%', 0], ['luxwoon', 'sun-dim', 50, t('лк', 'lux'), 0]].map(function (r) {
      var a = A[r[0]]; if (!a) return '';
      return wereldRij(r[1], HV.p(a.naam) + ' · ' + kamerNaam(a.kamer), 's-' + a.id, o.stapper({ actie: 'so-w-sensor', gegevens: { doel: a.id, stap: r[2] }, stap: r[2], label: HV.p(a.naam), waarde: HV.maat(a.st.waarde, r[3], r[4]) }));
    }).join('') + wereldRij('radar', HV.p(A.beweginghal.naam) + ' · ' + kamerNaam('hal'), 'b-beweginghal', o.schakel({ aan: !!A.beweginghal.st.actief, icoon: 'radar', toon: 'aan', actie: 'so-w-beweging', aria: t('Рух у передпокої', 'Beweging in de hal') }));
    var alarmen = ['rookkeuken', 'lekbijkeuken'].map(function (id) {
      var a = A[id];
      return wereldRij(a.soort === 'rook' ? 'alarm-smoke' : 'droplet', HV.p(a.naam) + ' · ' + kamerNaam(a.kamer), 'a-' + id, o.schakel({ aan: !!a.st.alarm, icoon: a.soort === 'rook' ? 'alarm-smoke' : 'droplet', toon: 'alarm', actie: 'so-w-alarm', gegevens: { doel: id }, aria: HV.p(a.naam) + ': ' + (a.st.alarm ? t('тривога', 'alarm') : t('спокійно', 'rustig')) }), a.st.alarm ? t('тривога · аварійний шар на всіх екранах', 'alarm · noodlaag op alle schermen') : t('спокійно', 'rustig'));
    }).join('');
    var virt = X.virtueel.length ? X.virtueel.map(function (v) {
      var a = A[v.id]; if (!a) return '';
      return '<div class="hv-so-wereldrij" data-k="so-v-' + h(v.id) + '"><span class="hv-so-wereldrij__teken">' + ic(o.beeld(a).icoon) + '</span><div class="hv-so-wereldrij__tekst"><p class="hv-so-wereldrij__naam">' + h(HV.p(a.naam)) + '</p><p class="hv-so-wereldrij__sub">' + h(kamerNaam(a.kamer) + ' · ' + HV.p(HV.paspoort.soorten[a.soort].naam)) + '</p></div><div class="hv-so-wereldrij__orgaan">' +
        o.knop({ tekst: t('Відкрити', 'Openen'), klein: true, soort: 'stil', actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } }) + o.knop({ tekst: t('Вилучити', 'Verwijderen'), icoon: 'trash-2', klein: true, actie: 'so-virtueel-weg', gegevens: { doel: a.id } }) + '</div></div>';
    }).join('') : '';
    var kopHtml = '<div class="hv-so-wereldkop" data-k="so-wereldkop">' + o.knop({ tekst: t('Віртуальний пристрій', 'Virtueel apparaat'), icoon: 'plus', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'sovirtueel' } }) +
      o.knop({ tekst: t('Повернути до сценарію', 'Terug naar scenario'), icoon: 'undo-2', actie: 'so-w-terug', uit: !aantal }) +
      o.chip({ icoon: 'hand', toon: aantal ? 'let-op' : null, tekst: t('ручних значень: ', 'handmatige waarden: ') + aantal }) + '</div>';
    var b = function (id, titel, icoon, inhoud, teller) { return o.blok({ id: id, titel: titel, teller: teller, inhoud: '<div class="hv-so-wereld">' + inhoud + '</div>' }); };
    return kopHtml + noot('flask-conical', t('Ручне значення тримається до наступного кроку генератора або до «Повернути до сценарію»; автор у Журналі — «Симулятор · ручне».', 'Een handmatige waarde blijft staan tot de volgende stap van de generator of tot ‘Terug naar scenario’; maker in het logboek — ‘Simulator · handmatig’.')) +
      '<div class="hv-so-raster">' + '<div class="hv-so-kolom">' + b('so-w-weer', t('Погода й ціна', 'Weer en prijs'), 'cloud-sun', weer) + b('so-w-mensen', t('Люди', 'Mensen'), 'users', mensen, HV.kijk.thuis().length + ' ' + t('вдома', 'thuis')) + b('so-w-auto', t('Авто', 'Auto'), 'car', auto) + '</div>' +
      '<div class="hv-so-kolom">' + b('so-w-ramen', t('Вікна й двері', 'Ramen en deuren'), 'door-open', contacten) + b('so-w-sensoren', t('Датчики', 'Sensoren'), 'gauge', sensoren) + b('so-w-alarm', t('Датчики безпеки', 'Veiligheidssensoren'), 'alarm-smoke', alarmen) + (virt ? b('so-w-virtueel', t('Віртуальні пристрої', 'Virtuele apparaten'), 'package-plus', virt, X.virtueel.length) : '') + '</div></div>';
  }

  // ── «Траси»: запис, відтворення, збереження як сценарій ──
  function spoorTijdlijn(s, speel) {
    var duur = Math.max(s.duur, 1000);
    var tikken = s.acties.map(function (a, i) {
      var x = Math.max(1, Math.min(99, a.dt / duur * 100));
      var klaar = speel && speel.i > i;
      return '<span class="hv-so-tijdlijn__punt' + (klaar ? ' is-klaar' : '') + '" style="left:' + x.toFixed(1) + '%" aria-hidden="true"></span>';
    }).join('');
    var voortgang = speel ? Math.min(100, (REEL() - speel.echt) / duur * 100) : 0;
    return '<div class="hv-so-tijdlijn" aria-hidden="true"><span class="hv-so-tijdlijn__baan"></span>' + (speel ? '<span class="hv-so-tijdlijn__vulling" style="width:' + voortgang.toFixed(1) + '%"></span>' : '') + tikken + '</div>';
  }
  function stapTekst(a) {
    var w = HV.staat.w, ap = w.apparaten[a.doel];
    var naam = ap ? HV.p(ap.naam) : String(a.doel);
    var woord = HV.p(HV.beschrijf(ap, a.mogelijkheid, a.waarde));
    return naam + ': ' + woord;
  }
  function sporenTab(ctx) {
    var S = X.sporen, w = ctx.staat;
    var opname = S.opname;
    var recorder = '<section class="hv-so-recorder' + (opname ? ' is-opname' : '') + '" data-k="so-recorder">' +
      '<div class="hv-so-recorder__knop">' + (opname
        ? '<button type="button" class="hv-so-rec is-aan" data-actie="so-spoor-opname" aria-label="' + h(t('Зупинити запис', 'Opname stoppen')) + '">' + ic('square') + '</button>'
        : '<button type="button" class="hv-so-rec" data-actie="so-spoor-opname" aria-label="' + h(t('Записати трасу', 'Spoor opnemen')) + '"><span class="hv-so-rec__stip" aria-hidden="true"></span></button>') + '</div>' +
      '<div class="hv-so-recorder__tekst"><p class="hv-so-recorder__titel">' + h(opname ? t('Іде запис · ', 'Opname loopt · ') + HV.getal((REEL() - opname.echt) / 1000, 0) + ' ' + t('с', 's') : t('Записати трасу', 'Spoor opnemen')) + '</p>' +
      '<p class="hv-so-recorder__sub">' + h(opname ? tel(opname.acties.length, ['дію записано', 'дії записано', 'дій записано'], ['actie opgenomen', 'acties opgenomen']) + t(' — керуйте домом як завжди.', ' — bedien het huis zoals altijd.') : t('Ваші дії з пристроями ляжуть у трасу разом зі сценарієм-основою «' + (w.scenario ? HV.p(HV.scenarios.vind(w.scenario).naam) : '—') + '».', 'Je acties met apparaten komen in het spoor, met als basis het scenario ‘' + (w.scenario ? HV.p(HV.scenarios.vind(w.scenario).naam) : '—') + '’.')) + '</p></div>' +
      (opname ? o.knop({ tekst: t('Зупинити й зберегти', 'Stoppen en bewaren'), icoon: 'save', soort: 'hoofd', actie: 'so-spoor-opname' }) : o.knop({ tekst: t('Почати запис', 'Opname starten'), icoon: 'disc', soort: 'hoofd', actie: 'so-spoor-opname' })) + '</section>';
    var lijst = S.lijst.map(function (s) {
      var speel = S.speelt && S.speelt.id === s.id ? S.speelt : null;
      var open = HV.ui.lees('so-spoor-open', S.lijst[0] && S.lijst[0].id) === s.id;
      var basis = HV.scenarios.vind(s.scenario);
      return '<article class="hv-so-spoor' + (speel ? ' is-speelt' : '') + '" data-k="so-spoor-' + s.id + '">' +
        '<header class="hv-so-spoor__kop"><button type="button" class="hv-so-spoor__titel" data-actie="ui" data-naam="so-spoor-open" data-waarde="' + (open ? '' : s.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + ic('route') + '<span><strong>' + h(HV.p(s.naam)) + '</strong><small>' + h(tel(s.acties.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']) + ' · ' + HV.getal(s.duur / 1000, 0) + ' ' + t('с', 's') + ' · ' + t('основа: ', 'basis: ') + (basis ? HV.p(basis.naam) : '—')) + '</small></span>' + ic('chevron-down', { maat: 's', klas: 'hv-so-spoor__pijl' }) + '</button>' +
        (s.opgeslagen ? o.chip({ icoon: 'bookmark-check', toon: 'ok', tekst: t('сценарій', 'scenario') }) : '') + '</header>' +
        spoorTijdlijn(s, speel) +
        (open ? '<ol class="hv-so-spoor__stappen">' + s.acties.map(function (a, i) { var klaar = speel && speel.i > i; return '<li class="' + (klaar ? 'is-klaar' : '') + '"><time>+' + HV.getal(a.dt / 1000, 1) + ' ' + t('с', 's') + '</time><span>' + h(stapTekst(a)) + '</span>' + (klaar ? ic('check', { maat: 's' }) : '') + '</li>'; }).join('') + '</ol>' : '') +
        knoppen(speel ? o.knop({ tekst: t('Зупинити', 'Stoppen'), icoon: 'circle-stop', soort: 'hoofd', klein: true, actie: 'so-spoor-stop' }) : o.knop({ tekst: t('Відтворити', 'Afspelen'), icoon: 'play', soort: 'hoofd', klein: true, actie: 'so-spoor-speel', gegevens: { spoor: s.id } }),
          s.opgeslagen ? o.knop({ tekst: t('Збережено як сценарій', 'Bewaard als scenario'), klein: true, gedrukt: true }) : o.knop({ tekst: t('Зберегти як сценарій', 'Opslaan als scenario'), icoon: 'bookmark-plus', klein: true, actie: 'so-spoor-bewaar', gegevens: { spoor: s.id } }),
          o.knop({ tekst: t('Вилучити', 'Verwijderen'), icoon: 'trash-2', soort: 'stil', klein: true, actie: 'so-spoor-weg', gegevens: { spoor: s.id } })) + '</article>';
    }).join('');
    return recorder + noot('info', t('Відтворення стартує зі сценарію-основи й повторює кроки від вашого імені з позначкою «траса»; небезпечні й критичні кроки пропускаються — для них потрібен ритуал.', 'Afspelen begint bij het basisscenario en herhaalt de stappen namens jou met het label ‘spoor’; gevaarlijke en kritieke stappen worden overgeslagen — die vragen een ritueel.')) +
      o.blok({ id: 'so-sporen', titel: t('Траси', 'Sporen'), teller: S.lijst.length, inhoud: S.lijst.length ? '<div class="hv-so-sporen">' + lijst + '</div>' : o.leeg({ icoon: 'route', titel: t('Трас ще немає', 'Nog geen sporen'), tekst: t('Запишіть першу: натисніть кнопку запису й покеруйте домом.', 'Neem de eerste op: druk op opnemen en bedien het huis.') }) });
  }

  function simulatorTab(ctx) {
    var deel = ctx.route.object === 'wereld' || ctx.route.object === 'sporen' ? ctx.route.object : 'tijd';
    var nav = '<nav class="hv-so-subnav" aria-label="' + h(t('Частини симулятора', 'Delen van de simulator')) + '">' + [['tijd', ['Час і сценарії', 'Tijd en scenario’s'], 'clock-4', 'instellingen-simulator'], ['wereld', ['Світ', 'Wereld'], 'globe', 'instellingen-simulator-wereld'], ['sporen', ['Траси', 'Sporen'], 'route', 'instellingen-simulator-sporen']].map(function (x) {
      var actief = x[0] === deel;
      return '<button type="button" class="hv-so-subnav__punt' + (actief ? ' is-actief' : '') + '"' + (actief ? ' aria-current="page"' : '') + ' data-actie="ga" data-naar="' + x[3] + '" data-k="so-sub-' + x[0] + '">' + ic(x[2], { maat: 's' }) + '<span>' + h(HV.p(x[1])) + '</span></button>';
    }).join('') + '</nav>';
    var lijf;
    if (deel === 'wereld') lijf = wereldTab(ctx);
    else if (deel === 'sporen') lijf = sporenTab(ctx);
    else lijf = '<div class="hv-so-raster hv-so-raster--breed-links"><div class="hv-so-kolom">' + scenariosBlok(ctx) + '</div><div class="hv-so-kolom">' + storingenBlok(ctx) + huisBlok(ctx) + stroomBlok(ctx) + '</div></div>';
    return '<div class="hv-so hv-so-sim" data-k="so-simulator">' + klok(ctx, deel !== 'tijd') + nav + '<div class="hv-so-simlijf" data-k="so-simlijf-' + deel + '">' + lijf + '</div></div>';
  }

  // аркуш сценарію: що змінює, наслідок, запуск
  HV.blad({
    soort: 'soscenario', vrij: true, icoon: function (ctx, id) { return SCENARIO_ICOON[id] || 'flask-conical'; },
    titel: function (ctx, id) { var s = HV.scenarios.vind(id); return s ? HV.p(s.naam) : t('Сценарій', 'Scenario'); },
    sub: function (ctx, id) { var z = ZONES[SCENARIO_ZONE[id]]; return z ? t('зона: ', 'zone: ') + HV.p(z.naam) : ''; },
    render: function (ctx, id) {
      var s = HV.scenarios.vind(id), w = ctx.staat;
      if (!s) return o.leeg({ icoon: 'flask-conical', titel: t('Сценарію немає', 'Geen scenario') });
      var actief = w.scenario === s.id;
      return '<div class="hv-so-blad">' + o.kaart({ inhoud: '<p class="hv-so-blad__zin">' + h(HV.p(s.wat)) + '</p><dl class="hv-so-feiten">' +
        '<div><dt>' + h(t('Момент', 'Moment')) + '</dt><dd>' + h(HV.datum(s.tijd) + ', ' + HV.tijd(s.tijd)) + '</dd></div>' +
        '<div><dt>' + h(t('Зона', 'Zone')) + '</dt><dd>' + h(HV.p((ZONES[SCENARIO_ZONE[s.id]] || ZONES.achtergrond).naam)) + '</dd></div>' +
        '<div><dt>' + h(t('Стан', 'Stand')) + '</dt><dd>' + h(actief ? t('іде зараз', 'loopt nu') : t('не запущено', 'niet gestart')) + '</dd></div></dl>' }) +
        o.kaart({ titel: t('Що станеться', 'Wat er gebeurt'), inhoud: o.gevolgRijen(t('Що станеться: світ перебудується з паспорта дому й стане на ' + HV.tijd(s.tijd) + '; далі живе сам. Пов’язано з: дозволи повертаються до типових, ручні значення світу скидаються. Як повернути: «Повернути» у сповіщенні запускає попередній сценарій.', 'Wat er gebeurt: de wereld wordt opnieuw opgebouwd uit het paspoort en springt naar ' + HV.tijd(s.tijd) + '; daarna leeft ze zelf. Hangt samen met: toestemmingen gaan terug naar standaard, handmatige waarden van de wereld vervallen. Terugdraaien: ‘Ongedaan maken’ in de melding start het vorige scenario.')) }) +
        knoppen(o.knop({ tekst: actief ? t('Почати знову', 'Opnieuw starten') : t('Запустити', 'Starten'), icoon: actief ? 'rotate-ccw' : 'play', soort: 'hoofd', actie: 'so-scenario', gegevens: { scenario: s.id } }),
          actief ? o.knop({ tekst: t('Зупинити: звичайний день', 'Stoppen: gewone dag'), icoon: 'circle-stop', actie: 'so-scenario-stop' }) : '') + '</div>';
    }
  });

  // діалог «Додати віртуальний пристрій»
  var VIRTUEEL_SOORTEN = [
    { soort: 'licht', naam: ['Лампа', 'Lamp'], mog: ['aan', 'helderheid'], st: { aan: false, helderheid: 70 }, watt: 8 },
    { soort: 'stopcontact', naam: ['Розетка', 'Stekker'], mog: ['aan', 'vermogen'], st: { aan: false, vermogen: 0, vandaag: 0 } },
    { soort: 'temperatuur', naam: ['Датчик температури', 'Temperatuursensor'], mog: [], st: { waarde: 19.5 }, eenheid: '°C' },
    { soort: 'contact', naam: ['Датчик відкриття', 'Contactsensor'], mog: [], st: { open: false }, raam: true },
    { soort: 'beweging', naam: ['Датчик руху', 'Bewegingssensor'], mog: [], st: { actief: false, laatst: 30 } }
  ];
  HV.blad({
    soort: 'sovirtueel', vrij: true, icoon: 'package-plus', titel: ['Віртуальний пристрій', 'Virtueel apparaat'], sub: function () { return t('лише в демо-домі', 'alleen in de demowoning'); },
    render: function (ctx) {
      var keuze = HV.ui.lees('so-v-soort', 'licht'), kamer = HV.ui.lees('so-v-kamer', 'woonkamer');
      var s = VIRTUEEL_SOORTEN.filter(function (x) { return x.soort === keuze; })[0] || VIRTUEEL_SOORTEN[0];
      return '<div class="hv-so-blad">' + o.kaart({ titel: t('Тип', 'Soort'), inhoud: '<div class="hv-so-keuzes hv-so-keuzes--rooster" role="radiogroup" aria-label="' + h(t('Тип пристрою', 'Soort apparaat')) + '">' + VIRTUEEL_SOORTEN.map(function (x) {
        var gek = x.soort === keuze;
        return '<button type="button" role="radio" aria-checked="' + (gek ? 'true' : 'false') + '" class="hv-so-keuze' + (gek ? ' is-gekozen' : '') + '" data-actie="ui" data-naam="so-v-soort" data-waarde="' + x.soort + '">' + ic(HV.paspoort.soorten[x.soort].icoon) + '<span><strong>' + h(HV.p(x.naam)) + '</strong></span></button>';
      }).join('') + '</div>' }) +
        o.kaart({ titel: t('Кімната', 'Kamer'), inhoud: o.segment({ label: t('Кімната', 'Kamer'), waarde: kamer, actie: 'so-v-kamer', opties: HV.staat.w.kamers.map(function (k) { return { id: k.id, label: HV.p(k.naam) }; }), klas: 'hv-so-segment-breed' }) }) +
        '<div class="hv-so-gevolgkaart">' + o.gevolgRijen(t('Що станеться: «' + s.naam[0] + '» з’явиться в кімнаті й поводитиметься як справжній клас. Пов’язано з: дозволи для всіх виконавців — «Вимкнено». Як повернути: «Світ» → «Віртуальні пристрої» → «Вилучити».', 'Wat er gebeurt: ‘' + s.naam[1] + '’ verschijnt in de kamer en gedraagt zich als de echte klasse. Hangt samen met: toestemmingen voor alle uitvoerders staan op ‘Uit’. Terugdraaien: ‘Wereld’ → ‘Virtuele apparaten’ → ‘Verwijderen’.')) + '</div>' +
        knoppen(o.knop({ tekst: t('Додати пристрій', 'Apparaat toevoegen'), icoon: 'plus', soort: 'hoofd', actie: 'so-virtueel-voeg', gegevens: { soort: s.soort, kamer: kamer } })) + '</div>';
    }
  });
  HV.actie('so-v-kamer', function (ctx, g) { HV.ui.zet('so-v-kamer', g.waarde); });

  // аркуш «Перенести налаштування» (вихід із демо): таблиця «демо-пристрій → справжній»
  HV.blad({
    soort: 'sooverzetten', vrij: true, breed: true, icoon: 'arrow-right-left', titel: ['Перенести налаштування', 'Instellingen overnemen'], sub: function () { return t('вихід із демо-дому · етап 12', 'uit de demowoning · fase 12'); },
    render: function (ctx) {
      var w = ctx.staat;
      var rijen = ['torsher', 'keukenlicht', 'thermostaat', 'voordeurslot', 'stekkermedia', 'p1meter'].map(function (id) { var a = w.apparaten[id]; return [HV.p(a.naam) + ' · ' + kamerNaam(a.kamer), '<span class="hv-so-vervang">' + ic('circle-dashed', { maat: 's' }) + h(t('справжній — оберіть пізніше', 'echt — later kiezen')) + '</span>', h(HV.p(HV.paspoort.soorten[a.soort].naam))]; });
      return '<div class="hv-so-blad">' + o.kaart({ inhoud: '<p class="hv-so-blad__zin">' + h(t('Кімнати, план, сцени й автоматизації переносяться чернетками в стані «Спостереження». Дозволи, права агентів, коди й історія — ні.', 'Kamers, plattegrond, scènes en automatiseringen gaan mee als concept in de stand ‘Meekijken’. Toestemmingen, rechten van agenten, codes en geschiedenis niet.')) + '</p><p>' + o.later(t('пізніше · етап 12', 'later · fase 12')) + '</p>' }) +
        o.kaart({ titel: t('Демо-пристрій → справжній', 'Demo-apparaat → echt'), inhoud: HV.tabel([t('Демо-пристрій', 'Demo-apparaat'), t('Справжній', 'Echt'), t('Клас', 'Klasse')], rijen) }) +
        knoppen(o.knop({ tekst: t('До джерел', 'Naar bronnen'), icoon: 'cable', soort: 'hoofd', actie: 'ga', gegevens: { naar: 'instellingen-integraties' } })) + '</div>';
    }
  });

  // ── дії симулятора ──
  function zetSnelheid(v) {
    var w = HV.staat.w, was = w.pauze ? 0 : w.snelheid;
    if (was === v) return;
    var woord = function (x) { return x === 0 ? ['пауза', 'pauze'] : ['×' + x, '×' + x]; };
    var zet = function (x) { HV.klok.zet(x); if (x) HV.opslag.schrijf('snelheid', x); if (HV.hemelSprong) HV.hemelSprong(); if (HV.pult && HV.pult.teken) HV.pult.teken(); };
    sysDoe({ min: 2, icoon: v === 0 ? 'pause' : 'fast-forward', soort: 'huis.simulatie', maker: HV.mens(), wat: ['Швидкість часу дому', 'Snelheid van de huistijd'], was: woord(was), werd: woord(v),
      pas: function () { zet(v); }, terug: function () { zet(was); } });
  }
  HV.actie('so-snelheid', function (ctx, g) { zetSnelheid(Number(g.waarde)); });
  HV.actie('so-gelijk', function () {
    var w = HV.staat.w, was = w.tijd, wasSnel = w.pauze ? 0 : w.snelheid;
    var d = new Date(), werd = HV.huistijd(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
    sysDoe({ min: 2, icoon: 'clock-4', soort: 'huis.simulatie', wat: ['Час дому зрівняно з годинником', 'Huistijd gelijkgezet met de klok'], was: [HV.tijd(was), HV.tijd(was)], werd: [HV.tijd(werd), HV.tijd(werd)], tekst: t('Швидкість ×1: час дому йде як справжній.', 'Snelheid ×1: de huistijd loopt als de echte.'),
      pas: function () { HV.staat.w.tijd = werd; HV.klok.zet(1); HV.klok.stap(0); if (HV.hemelSprong) HV.hemelSprong(); if (HV.pult && HV.pult.teken) HV.pult.teken(); },
      terug: function () { HV.staat.w.tijd = was; HV.klok.zet(wasSnel); HV.klok.stap(0); if (HV.hemelSprong) HV.hemelSprong(); } });
  });
  HV.actie('so-stap', function (ctx, g) {
    var sec = Number(g.sec) || 3600;
    sysDoe({ min: 2, icoon: 'fast-forward', soort: 'huis.simulatie', stil: true, wat: ['Час дому: крок +' + Math.round(sec / 60) + ' хв', 'Huistijd: stap +' + Math.round(sec / 60) + ' min'], pas: function () { HV.klok.stap(sec); if (HV.hemelSprong) HV.hemelSprong(); } });
  });
  HV.actie('so-scenario', function (ctx, g) {
    if (!mag(2)) { sysDoe({ min: 2, wat: ['', ''], pas: function () {} }); return; }
    var vorige = HV.staat.w.scenario, s = HV.scenarios.vind(g.scenario);
    if (!s) return;
    stopSpoor();
    HV.opslag.schrijf('scenario', s.id);
    HV.scenarios.start(s.id);
    if (HV.pult && HV.pult.teken) HV.pult.teken();
    HV.bladOpen(null);
    HV.meld({ maker: SIM, icoon: SCENARIO_ICOON[s.id] || 'flask-conical', titel: t('Сценарій: ', 'Scenario: ') + HV.p(s.naam), tekst: HV.p(s.wat), terug: vorige && vorige !== s.id ? function () { HV.opslag.schrijf('scenario', vorige); HV.scenarios.start(vorige); if (HV.pult && HV.pult.teken) HV.pult.teken(); } : null });
  });
  HV.actie('so-scenario-stop', function () {
    var vorige = HV.staat.w.scenario;
    sysDoe({ min: 2, icoon: 'circle-stop', soort: 'huis.simulatie', maker: SIM, wat: ['Сценарій зупинено: звичайний день', 'Scenario gestopt: gewone dag'], tekst: t('Світ із паспорта, понеділок 14:30.', 'Wereld uit het paspoort, maandag 14:30.'),
      pas: function () { HV.gevaar.herstelStanden(); var w = HV.staat.herstel(EPOCH(), true); w.scenario = null; HV.naScenario && HV.naScenario(null); HV.bladOpen(null); },
      terug: function () { if (vorige) HV.scenarios.start(vorige, true); } });
  });
  HV.actie('so-vertraging', function (ctx, g) {
    var was = X.sim.vertraging, werd = Math.max(0, Math.min(10, was + Number(g.richting)));
    if (was === werd) return;
    sysDoe({ min: 2, icoon: 'hourglass', soort: 'huis.simulatie', maker: SIM, wat: ['Збій: затримка команд', 'Storing: vertraging van opdrachten'], was: [was + ' с', was + ' s'], werd: [werd + ' с', werd + ' s'],
      pas: function () { X.sim.vertraging = werd; }, terug: function () { X.sim.vertraging = was; } });
  });
  HV.actie('so-geenbevestiging', function () {
    var was = X.sim.geenBevestiging;
    sysDoe({ min: 2, icoon: 'circle-x', soort: 'huis.simulatie', maker: SIM, wat: ['Збій: без підтвердження', 'Storing: zonder bevestiging'], was: was ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: was ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'],
      pas: function () { X.sim.geenBevestiging = !was; pasSimToe(HV.staat.w); }, terug: function () { X.sim.geenBevestiging = was; pasSimToe(HV.staat.w); } });
  });
  function zetAdapter(werd) {
    var was = X.sim.adapter, wasGegevens = HV.staat.w.gegevens;
    if (was === werd || !ADAPTER_STAND[werd]) return;
    var gegevens = werd === 'goed' ? 'live' : werd === 'verzwakt' || werd === 'limiet' ? 'verouderd' : 'geen';
    sysDoe({ min: 2, icoon: ADAPTER_STAND[werd].icoon, soort: 'huis.integratie', maker: SIM, gewicht: werd === 'goed' ? 'info' : 'belangrijk', wat: ['Стан адаптера симулятора', 'Stand van de simulatoradapter'], was: ADAPTER_STAND[was].naam, werd: ADAPTER_STAND[werd].naam,
      pas: function () { X.sim.adapter = werd; HV.staat.w.gegevens = gegevens; HV.staat.w.gegevensSinds = HV.staat.w.tijd; if (HV.pult && HV.pult.teken) HV.pult.teken(); },
      terug: function () { X.sim.adapter = was; HV.staat.w.gegevens = wasGegevens; if (HV.pult && HV.pult.teken) HV.pult.teken(); } });
  }
  HV.actie('so-extern', function () {
    var was = X.sim.extern;
    var gevaar = was ? null : { sleutel: 'sim.extern', niveau: 'gevaarlijk', naam: ['Увімкнути зовнішні сповіщення демо-дому', 'Externe meldingen van de demowoning aanzetten'],
      gevolg: ['Що станеться: пошта й сповіщення на телефон підуть від вигаданих подій демо-дому. Пов’язано з: сценарії «Дим на кухні» й «Протікання» надішлють тривогу. Як повернути: вимкніть перемикач — один дотик.', 'Wat er gebeurt: e-mail en telefoonmeldingen gaan uit over verzonnen gebeurtenissen van de demowoning. Hangt samen met: de scenario’s ‘Rook in de keuken’ en ‘Lekkage’ sturen een alarm. Terugdraaien: zet de schakelaar uit — één tik.'] };
    sysDoe({ min: 3, gevaar: gevaar, icoon: 'send', soort: 'huis.simulatie', gewicht: was ? 'info' : 'belangrijk', wat: ['Зовнішні сповіщення демо-дому', 'Externe meldingen van de demowoning'], was: was ? ['увімкнено', 'aan'] : ['заблоковано', 'geblokkeerd'], werd: was ? ['заблоковано', 'geblokkeerd'] : ['увімкнено', 'aan'],
      pas: function () { X.sim.extern = !was; }, terug: function () { X.sim.extern = was; } });
  });
  HV.actie('so-wissen', function () {
    var gevaar = { sleutel: 'sim.wissen', niveau: 'gevaarlijk', naam: ['Скинути симуляцію', 'Simulatie wissen'],
      gevolg: ['Що станеться: демо-дім повернеться до паспорта: світ, Журнал, траси, віртуальні пристрої й ручні значення зникнуть. Пов’язано з: екрани й секрети лишаться. Як повернути: відкату немає — запустіть потрібний сценарій знову.', 'Wat er gebeurt: de demowoning gaat terug naar het paspoort: wereld, logboek, sporen, virtuele apparaten en handmatige waarden verdwijnen. Hangt samen met: schermen en geheimen blijven. Terugdraaien: kan niet — start het gewenste scenario opnieuw.'] };
    sysDoe({ min: 3, gevaar: gevaar, icoon: 'eraser', soort: 'huis.simulatie', gewicht: 'belangrijk', wat: ['Симуляцію скинуто', 'Simulatie gewist'], hoe: t('Як повернути: відкату немає — запустіть сценарій знову.', 'Terugdraaien: kan niet — start opnieuw een scenario.'),
      pas: function () {
        stopSpoor(); X.sporen.opname = null; X.sporen.lijst = []; X.virtueel = []; X.wereld = {}; X.sim.vertraging = 0; X.sim.geenBevestiging = false; X.sim.adapter = 'goed'; X.sim.extern = false; X.stroom.pauze = null;
        HV.gevaar.herstelStanden(); var w = HV.staat.herstel(EPOCH(), true); w.scenario = null; w.gegevens = 'live'; pasSimToe(w);
      } });
  });
  HV.actie('so-stroom-pauze', function () { X.stroom.pauze = X.stroom.pauze ? null : HV.staat.w.logboek.slice(0, 40); HV.teken(); });
  HV.actie('so-stroom-filter', function (ctx, g) { X.stroom.filter = g.waarde; HV.teken(); });

  // Світ
  HV.actie('so-w-stap', function (ctx, g) {
    var w = HV.staat.w, r = Number(g.richting);
    if (g.sleutel === 'temp') wereldZet('temp', ['Температура надворі', 'Buitentemperatuur'], function () { return w.weer.temp; }, function (v) { HV.staat.w.weer.temp = v; }, Math.max(-15, Math.min(38, w.weer.temp + r)), { woord: function (v) { return [HV.getal(v) + ' °C', HV.getal(v) + ' °C']; } });
    else if (g.sleutel === 'wind') wereldZet('wind', ['Вітер', 'Wind'], function () { return w.weer.wind; }, function (v) { HV.staat.w.weer.wind = v; }, Math.max(0, Math.min(30, w.weer.wind + r)), { woord: function (v) { return [v + ' м/с', v + ' m/s']; } });
    else if (g.sleutel === 'prijs') {
      var i = (((Math.floor((w.tijd - HV.tarief.begin) / 3600000)) % HV.tarief.prijzen.length) + HV.tarief.prijzen.length) % HV.tarief.prijzen.length;
      wereldZet('prijs', ['Ціна години ' + HV.tijd(w.tijd - w.tijd % 3600000), 'Prijs van het uur ' + HV.tijd(w.tijd - w.tijd % 3600000)], function () { return HV.tarief.prijzen[i]; }, function (v) { HV.tarief.prijzen[i] = v; }, Math.round((HV.tarief.prijzen[i] + r * 0.05) * 100) / 100, { prijs: true, soort: 'huis.energie', woord: function (v) { return [HV.euro(v), HV.euro(v)]; } });
    }
  });
  HV.actie('so-w-schuif', function (ctx, g) {
    if (g.fase !== 'klaar') return;
    var w = HV.staat.w, v = Number(g.waarde);
    if (g.sleutel === 'bewolking') wereldZet('bewolking', ['Хмарність', 'Bewolking'], function () { return Math.round(w.weer.bewolking * 100); }, function (x) { HV.staat.w.weer.bewolking = x / 100; }, v, { woord: function (x) { return [x + ' %', x + ' %']; } });
    else if (g.sleutel === 'evlading') wereldZet('ev-lading', ['Заряд авто', 'Lading van de auto'], function () { return Math.round(w.voertuigen[0].lading); }, function (x) { HV.staat.w.voertuigen[0].lading = x; }, v, { soort: 'huis.voertuig', woord: function (x) { return [x + ' %', x + ' %']; } });
  });
  HV.actie('so-w-neerslag', function (ctx, g) {
    var w = HV.staat.w;
    wereldZet('neerslag', ['Опади', 'Neerslag'], function () { return w.weer.mist ? 'mist' : (w.weer.neerslag || 'geen'); }, function (v) { var x = HV.staat.w.weer; x.mist = v === 'mist'; x.neerslag = v === 'regen' || v === 'sneeuw' ? v : null; if (HV.hemelSprong) HV.hemelSprong(); }, g.waarde, { woord: function (v) { return NEERSLAG[v]; } });
  });
  HV.actie('so-w-mens', function (ctx, g) {
    var w = HV.staat.w, m = w.mensen.filter(function (x) { return x.id === g.mens; })[0]; if (!m) return;
    wereldZet('mens-' + m.id, [m.naam[0] + ': де зараз', m.naam[1] + ': waar nu'], function () { return m.thuis ? 'thuis' : 'weg'; }, function (v) { var x = HV.staat.w.mensen.filter(function (y) { return y.id === m.id; })[0]; if (x) { x.thuis = v === 'thuis'; x.sinds = HV.staat.w.tijd; x.zeker = 'zeker'; } }, g.waarde, { woord: function (v) { return v === 'thuis' ? ['вдома', 'thuis'] : ['не вдома', 'weg']; } });
  });
  HV.actie('so-w-auto', function (ctx, g) {
    var w = HV.staat.w;
    wereldZet('ev-plek', ['Де авто', 'Waar de auto is'], function () { return w.voertuigen[0].plek; }, function (v) { var ev = HV.staat.w.voertuigen[0]; ev.plek = v; var lp = HV.staat.w.apparaten.laadpaal.st; lp.aangesloten = v === 'oprit' || v === 'garage'; if (!lp.aangesloten) lp.laadt = false; }, g.waarde, { soort: 'huis.voertuig', woord: function (v) { return PLEK[v]; } });
  });
  HV.actie('so-w-contact', function (ctx, g) {
    var a = HV.staat.w.apparaten[g.doel]; if (!a) return;
    wereldZet('c-' + a.id, [a.naam[0] + ' · ' + HV.staat.kamer(a.kamer).naam[0], a.naam[1] + ' · ' + HV.staat.kamer(a.kamer).naam[1]], function () { return !!a.st.open; }, function (v) { var x = HV.staat.w.apparaten[a.id]; x.st.open = v; x.st.sinds = HV.staat.w.tijd; x.gezien = HV.staat.w.tijd; }, !a.st.open, { soort: 'huis.apparaat', woord: function (v) { return v ? ['відчинено', 'open'] : ['зачинено', 'dicht']; } });
  });
  HV.actie('so-w-sensor', function (ctx, g) {
    var a = HV.staat.w.apparaten[g.doel]; if (!a) return;
    var stap = Number(g.stap) || 1, werd = Math.max(0, a.st.waarde + Number(g.richting) * stap);
    var eenheid = a.soort === 'co2' ? 'ppm' : a.soort === 'vocht' ? '%' : 'lux';
    wereldZet('s-' + a.id, [a.naam[0] + ' · ' + HV.staat.kamer(a.kamer).naam[0], a.naam[1] + ' · ' + HV.staat.kamer(a.kamer).naam[1]], function () { return a.st.waarde; }, function (v) { var x = HV.staat.w.apparaten[a.id]; x.st.waarde = v; x.gezien = HV.staat.w.tijd; }, werd, { soort: 'huis.apparaat', woord: function (v) { return [HV.getal(v) + ' ' + (eenheid === 'lux' ? 'лк' : eenheid), HV.getal(v) + ' ' + eenheid]; } });
  });
  HV.actie('so-w-beweging', function () {
    var a = HV.staat.w.apparaten.beweginghal;
    wereldZet('b-beweginghal', ['Рух у передпокої', 'Beweging in de hal'], function () { return !!a.st.actief; }, function (v) { var x = HV.staat.w.apparaten.beweginghal; x.st.actief = v; if (!v) x.st.laatst = 1; x.gezien = HV.staat.w.tijd; }, !a.st.actief, { soort: 'huis.apparaat', woord: function (v) { return v ? ['рух зараз', 'beweging nu'] : ['спокійно', 'rustig']; } });
  });
  HV.actie('so-w-alarm', function (ctx, g) {
    var a = HV.staat.w.apparaten[g.doel]; if (!a) return;
    var kamer = HV.staat.kamer(a.kamer);
    wereldZet('a-' + a.id, [a.naam[0] + ' · ' + kamer.naam[0], a.naam[1] + ' · ' + kamer.naam[1]], function () { return !!a.st.alarm; }, function (v) {
      var w = HV.staat.w, x = w.apparaten[a.id];
      x.st.alarm = v; x.st.sinds = w.tijd; x.gezien = w.tijd;
      if (v) w.nood = { soort: a.soort, kamer: a.kamer, sinds: w.tijd, bron: a.id, bevestigd: false };
      else if (w.nood && w.nood.bron === a.id) w.nood = null;
    }, !a.st.alarm, { soort: 'huis.alarm', gewicht: !a.st.alarm ? 'alarm' : 'info', woord: function (v) { return v ? ['тривога', 'alarm'] : ['спокійно', 'rustig']; } });
  });
  HV.actie('so-w-terug', function () {
    var n = Object.keys(X.wereld).length;
    if (!n) return;
    var bewaard = X.wereld;
    Object.keys(bewaard).forEach(function (k) { bewaard[k].herstel(); });
    X.wereld = {};
    HV.logboek.voegToe({ maker: SIM, wat: ['Світ повернуто до сценарію', 'Wereld terug naar het scenario'], waarom: ['ручних значень: ' + n, 'handmatige waarden: ' + n], soort: 'huis.simulatie' });
    HV.klok.stap(0);
    HV.meld({ maker: SIM, icoon: 'undo-2', titel: t('Світ повернуто до сценарію', 'Wereld terug naar het scenario'), tekst: t('Скинуто ручних значень: ', 'Handmatige waarden gewist: ') + n });
  });
  HV.actie('so-virtueel-voeg', function (ctx, g) {
    var s = VIRTUEEL_SOORTEN.filter(function (x) { return x.soort === g.soort; })[0]; if (!s) return;
    var n = X.virtueel.filter(function (v) { return v.soort === s.soort; }).length + 1;
    var id = 'virt' + s.soort + n;
    var a = { id: id, soort: s.soort, kamer: g.kamer, naam: ['Віртуальн' + (s.soort === 'licht' || s.soort === 'stopcontact' ? 'а ' : 'ий ') + s.naam[0].toLowerCase() + ' ' + n, 'Virtuele ' + s.naam[1].toLowerCase() + ' ' + n], mog: s.mog.slice(), st: JSON.parse(JSON.stringify(s.st)), beschikbaar: 'ok', bron: 'Симулятор', virtueel: true };
    if (s.watt) a.watt = s.watt;
    if (s.eenheid) { a.eenheid = s.eenheid; a.hoofd = true; }
    if (s.raam) a.raam = true;
    sysDoe({ min: 2, icoon: 'package-plus', soort: 'huis.simulatie', maker: SIM_HAND, wat: ['Віртуальний пристрій: ' + a.naam[0], 'Virtueel apparaat: ' + a.naam[1]], tekst: kamerNaam(g.kamer),
      pas: function () { X.virtueel.push(a); pasSimToe(HV.staat.w); HV.bladOpen(null); }, terug: function () { verwijderApparaat(id); } });
  });
  HV.actie('so-virtueel-weg', function (ctx, g) {
    var v = X.virtueel.filter(function (x) { return x.id === g.doel; })[0]; if (!v) return;
    sysDoe({ min: 2, icoon: 'trash-2', soort: 'huis.simulatie', maker: SIM_HAND, wat: ['Вилучено: ' + v.naam[0], 'Verwijderd: ' + v.naam[1]],
      pas: function () { verwijderApparaat(v.id); }, terug: function () { X.virtueel.push(v); pasSimToe(HV.staat.w); } });
  });

  // Траси
  var spoorKlokken = [];
  function stopSpoor() {
    spoorKlokken.forEach(clearTimeout); spoorKlokken = [];
    X.sporen.speelt = null;
  }
  HV.actie('so-spoor-opname', function () {
    var S = X.sporen, w = HV.staat.w;
    if (!S.opname) {
      if (!mag(2)) { sysDoe({ min: 2, wat: ['', ''], pas: function () {} }); return; }
      S.opname = { echt: REEL(), scenario: w.scenario || 'avond', acties: [] };
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Траса: запис почато', 'Spoor: opname gestart'], soort: 'huis.simulatie' });
      HV.staat.wijzig();
      var tik = setInterval(function () { if (!X.sporen.opname) { clearInterval(tik); return; } HV.teken(); }, 1000);
      return;
    }
    var op = S.opname; S.opname = null;
    if (!op.acties.length) { HV.meld({ icoon: 'disc', titel: t('Нічого не записано', 'Niets opgenomen'), tekst: t('Під час запису не було жодної дії з пристроями.', 'Tijdens de opname was er geen enkele actie met apparaten.') }); HV.teken(); return; }
    var nr = ++S.teller;
    var spoor = { id: 's' + nr + '-' + (REEL() % 1000), naam: ['Траса ' + nr, 'Spoor ' + nr], scenario: op.scenario, duur: Math.max(REEL() - op.echt, op.acties[op.acties.length - 1].dt + 800), opgeslagen: false, acties: op.acties };
    sysDoe({ min: 2, icoon: 'save', soort: 'huis.simulatie', wat: ['Траса збережена: ' + spoor.naam[0], 'Spoor bewaard: ' + spoor.naam[1]], tekst: tel(spoor.acties.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']),
      pas: function () { S.lijst.unshift(spoor); HV.ui.zet('so-spoor-open', spoor.id); }, terug: function () { S.lijst = S.lijst.filter(function (x) { return x !== spoor; }); } });
  });
  HV.actie('so-spoor-speel', function (ctx, g) {
    var s = X.sporen.lijst.filter(function (x) { return x.id === g.spoor; })[0]; if (!s) return;
    if (!mag(2)) { sysDoe({ min: 2, wat: ['', ''], pas: function () {} }); return; }
    stopSpoor();
    HV.scenarios.start(s.scenario, true);
    var speel = X.sporen.speelt = { id: s.id, i: 0, echt: REEL(), overgeslagen: 0 };
    HV.logboek.voegToe({ maker: SIM, wat: ['Траса: відтворення «' + s.naam[0] + '»', 'Spoor: afspelen ‘' + s.naam[1] + '’'], waarom: ['основа — сценарій', 'basis — scenario'], soort: 'huis.simulatie' });
    HV.meld({ maker: SIM, icoon: 'play', titel: t('Відтворення траси', 'Spoor afspelen'), tekst: HV.p(s.naam) + ' · ' + tel(s.acties.length, ['крок', 'кроки', 'кроків'], ['stap', 'stappen']) });
    s.acties.forEach(function (a, i) {
      spoorKlokken.push(setTimeout(function () {
        if (X.sporen.speelt !== speel) return;
        var ap = HV.staat.w.apparaten[a.doel];
        var zwaar = ap ? HV.gevaar.isZwaar(HV.gevaar.vind(ap, a.mogelijkheid, a.waarde)) : true;
        if (zwaar) speel.overgeslagen++;
        else HV.doe({ doel: a.doel, mogelijkheid: a.mogelijkheid, waarde: a.waarde, zonderRitueel: true, stil: true, spoor: true, waarom: ['траса «' + s.naam[0] + '»', 'spoor ‘' + s.naam[1] + '’'] });
        speel.i = i + 1;
        HV.teken();
      }, a.dt));
    });
    spoorKlokken.push(setTimeout(function () {
      if (X.sporen.speelt !== speel) return;
      X.sporen.speelt = null;
      HV.logboek.voegToe({ maker: SIM, wat: ['Траса відтворена: ' + s.naam[0], 'Spoor afgespeeld: ' + s.naam[1]], waarom: speel.overgeslagen ? ['пропущено небезпечних кроків: ' + speel.overgeslagen, 'gevaarlijke stappen overgeslagen: ' + speel.overgeslagen] : null, soort: 'huis.simulatie' });
      HV.meld({ maker: SIM, icoon: 'badge-check', titel: t('Трасу відтворено', 'Spoor afgespeeld'), tekst: HV.p(s.naam) + (speel.overgeslagen ? t(' · пропущено: ', ' · overgeslagen: ') + speel.overgeslagen : '') });
      HV.staat.wijzig();
    }, Math.max(s.duur, s.acties.length ? s.acties[s.acties.length - 1].dt + 3600 : 0) + 300));
    var bal = setInterval(function () { if (X.sporen.speelt !== speel) { clearInterval(bal); return; } HV.teken(); }, 250);
    if (ctx.route.object !== 'sporen' && ctx.route.tab === 'simulator') ctx.open('instellingen-simulator-sporen');
  });
  HV.actie('so-spoor-stop', function () {
    var s = X.sporen.speelt; if (!s) return;
    stopSpoor();
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Відтворення траси зупинено', 'Afspelen van het spoor gestopt'], soort: 'huis.simulatie' });
    HV.staat.wijzig();
  });
  HV.actie('so-spoor-bewaar', function (ctx, g) {
    var s = X.sporen.lijst.filter(function (x) { return x.id === g.spoor; })[0]; if (!s) return;
    sysDoe({ min: 2, icoon: 'bookmark-plus', soort: 'huis.simulatie', wat: ['Трасу збережено як сценарій: ' + s.naam[0], 'Spoor bewaard als scenario: ' + s.naam[1]], tekst: t('З’явилася в «Час і сценарії» → «Мої сценарії з трас».', 'Staat nu in ‘Tijd en scenario’s’ → ‘Mijn scenario’s uit sporen’.'),
      pas: function () { s.opgeslagen = true; }, terug: function () { s.opgeslagen = false; } });
  });
  HV.actie('so-spoor-weg', function (ctx, g) {
    var S = X.sporen, s = S.lijst.filter(function (x) { return x.id === g.spoor; })[0]; if (!s) return;
    var plek = S.lijst.indexOf(s);
    sysDoe({ min: 2, icoon: 'trash-2', soort: 'huis.simulatie', wat: ['Трасу вилучено: ' + s.naam[0], 'Spoor verwijderd: ' + s.naam[1]],
      pas: function () { if (S.speelt && S.speelt.id === s.id) stopSpoor(); S.lijst.splice(plek, 1); }, terug: function () { S.lijst.splice(plek, 0, s); } });
  });

  // ═════════════════════════ 4. Дані й зберігання ═════════════════════════
  var OPSLAG = [
    { id: 'ruw', icoon: 'activity', naam: ['Сирі виміри', 'Ruwe metingen'], echt: function () { return X.bewaar.ruw + ' ' + HV.meervoud(X.bewaar.ruw, ['день', 'дні', 'днів'], ['dag', 'dagen']); }, keuzes: [7, 14, 30], demo: 200000, basis: 61240, per: 0.9, mb: 0.11 },
    { id: 'samen', icoon: 'layers', naam: ['Згортки: 5 хв / година / доба', 'Samenvattingen: 5 min / uur / dag'], echt: function () { return t('90 днів / 10 років / безстроково', '90 dagen / 10 jaar / onbeperkt'); }, demo: 500000, basis: 18420, per: 0.08, mb: 0.05 },
    { id: 'toestanden', icoon: 'toggle-right', naam: ['Історія станів', 'Toestandsgeschiedenis'], echt: function () { return X.bewaar.toestanden + ' ' + t('днів', 'dagen'); }, keuzes: [90, 180, 400], demo: 200000, basis: 22870, per: 0.21, mb: 0.09 },
    { id: 'gebeurtenissen', icoon: 'list', naam: ['Журнал подій', 'Logboek van gebeurtenissen'], echt: function () { return X.bewaar.gebeurtenissen + ' ' + t('днів', 'dagen'); }, keuzes: [90, 180, 400], demo: 50000, basis: 1240, logboek: true, mb: 0.4 },
    { id: 'audit', icoon: 'shield-check', naam: ['Аудит дій (лише додається)', 'Audit van acties (alleen toevoegen)'], echt: function () { return t('2 роки', '2 jaar'); }, demo: 20000, basis: 486, audit: true, mb: 0.6 },
    { id: 'runs', icoon: 'workflow', naam: ['Сліди запусків', 'Sporen van runs'], echt: function () { return t('30 днів, не менше 20 на правило', '30 dagen, minstens 20 per regel'); }, demo: 20, demoTekst: ['20 останніх на правило', 'laatste 20 per regel'], basis: 14, mb: 0.2 },
    { id: 'routes', icoon: 'map-pin', naam: ['Маршрути й місце', 'Routes en locatie'], echt: function () { return X.bewaar.routes + ' ' + t('днів', 'dagen'); }, keuzes: [7, 14, 30], demo: 30, demoTekst: ['≤ 30 діб дому', '≤ 30 dagen huistijd'], basis: 3, mb: 0.02 }
  ];
  function opslagAantal(r, w) {
    var minuten = Math.max(0, (w.tijd - EPOCH()) / 60000);
    if (r.logboek) return r.basis + w.logboek.length;
    if (r.audit) return r.basis + w.logboek.filter(function (x) { return x.maker && (x.maker.soort === 'mens' || x.maker.soort === 'agent'); }).length;
    if (r.id === 'runs' || r.id === 'routes') return Math.min(r.demo, r.basis + Math.floor(minuten / 600));
    return Math.min(r.demo, Math.round(r.basis + minuten * (r.per || 0) * (w.snelheid > 10 && r.id === 'ruw' ? 0 : 1) * 10));
  }
  function gegevensTab(ctx) {
    var w = ctx.staat, nietOpgeslagen = !w.pauze && w.snelheid > 10;
    var rijen = OPSLAG.map(function (r) {
      var n = opslagAantal(r, w), deel = Math.min(100, n / r.demo * 100);
      return '<tr data-k="so-op-' + r.id + '"><th scope="row"><span class="hv-so-opslag__naam">' + ic(r.icoon, { maat: 's' }) + h(HV.p(r.naam)) + '</span></th>' +
        '<td>' + (r.keuzes ? o.segment({ label: t('Строк зберігання: ', 'Bewaartermijn: ') + HV.p(r.naam), waarde: X.bewaar[r.id], actie: 'so-bewaar', gegevens: { reeks: r.id }, opties: r.keuzes.map(function (k) { return { id: k, label: k + ' ' + t('дн', 'd') }; }), klas: 'hv-so-segment-klein', uit: !mag(3) }) : '<span class="hv-so-opslag__vast">' + h(r.echt()) + '</span>') + '</td>' +
        '<td><span class="hv-so-opslag__demo">' + h(r.demoTekst ? HV.p(r.demoTekst) : '≤ ' + HV.getal(r.demo)) + '</span></td>' +
        '<td><span class="hv-so-opslag__nu"><span class="hv-so-opslag__getal">' + HV.getal(n) + '</span><span class="hv-so-balk" aria-hidden="true"><i style="width:' + deel.toFixed(1) + '%"></i></span><span class="hv-so-opslag__deel">' + HV.getal(Math.round(deel)) + ' %</span></span></td></tr>';
    }).join('');
    var tabel = '<div class="hv-tabel__rol"><table class="hv-tabel hv-so-opslag"><thead><tr><th scope="col">' + h(t('Дані', 'Gegevens')) + '</th><th scope="col">' + h(t('Справжній дім · строк', 'Echt huis · termijn')) + '</th><th scope="col">' + h(t('Демо-дім · межа', 'Demowoning · grens')) + '</th><th scope="col">' + h(t('Зараз записів', 'Nu regels')) + '</th></tr></thead><tbody>' + rijen + '</tbody></table></div>';
    var mb = OPSLAG.map(function (r) { return opslagAantal(r, w) * r.mb / 1000; });
    var totaal = mb.reduce(function (a, b) { return a + b; }, 0);
    var ring = HV.grafiek.ring({ id: 'so-opslag-ring', titel: t('Обсяг бази демо-дому', 'Omvang van de database van de demowoning'), midden: { waarde: HV.maat(totaal, t('МБ', 'MB'), 1), label: t('усього', 'totaal') },
      samenvatting: t('Найбільше займають аудит і журнал подій; сирі виміри понад ×10 не пишуться.', 'Audit en logboek nemen het meest in; ruwe metingen boven ×10 worden niet opgeslagen.'),
      delen: [{ naam: t('Виміри й згортки', 'Metingen en samenvattingen'), waarde: mb[0] + mb[1], tekst: HV.maat(mb[0] + mb[1], t('МБ', 'MB'), 1), toon: 'net-in' }, { naam: t('Стани', 'Toestanden'), waarde: mb[2], tekst: HV.maat(mb[2], t('МБ', 'MB'), 1), toon: 'koud' },
        { naam: t('Журнал і аудит', 'Logboek en audit'), waarde: mb[3] + mb[4], tekst: HV.maat(mb[3] + mb[4], t('МБ', 'MB'), 1), toon: 'warm' }, { naam: t('Сліди й місце', 'Sporen en locatie'), waarde: mb[5] + mb[6], tekst: HV.maat(mb[5] + mb[6], t('МБ', 'MB'), 2), toon: 'zon' }] });
    var banner = nietOpgeslagen ? '<div class="hv-so-banner hv-so-banner--let-op" role="status" data-k="so-nietop">' + ic('database-zap') + '<div class="hv-so-banner__tekst"><p class="hv-so-banner__titel">' + h(t('Сирі виміри зараз не записуються', 'Ruwe metingen worden nu niet opgeslagen')) + '</p><p class="hv-so-banner__sub">' + h(t('Час дому йде ×' + w.snelheid + '; понад ×10 пишуться лише згортки, стани й Журнал.', 'De huistijd loopt ×' + w.snelheid + '; boven ×10 komen alleen samenvattingen, toestanden en het logboek erin.')) + '</p></div>' + o.knop({ tekst: t('Поставити ×1', 'Op ×1 zetten'), actie: 'so-snelheid', gegevens: { waarde: 1 } }) + '</div>' : '';
    return '<div class="hv-so" data-k="so-gegevens">' + banner +
      '<div class="hv-so-raster hv-so-raster--breed-links"><div class="hv-so-kolom">' +
      o.blok({ id: 'so-opslag', titel: t('Що зберігається й скільки', 'Wat er wordt bewaard en hoeveel'), teller: OPSLAG.length, inhoud: kaart('so-opslagkaart', tabel + noot('database', t('Справжній дім: близько 130 тис. рядків на добу, усталено менше 1,5 ГБ. Розділів таблиць немає — старе видаляється вночі пакетами.', 'Echt huis: ongeveer 130 duizend regels per dag, stabiel onder 1,5 GB. Geen tabelpartities — oud wordt ’s nachts in pakketten verwijderd.')) + slotRegel(3)),
        uitleg: t('Що станеться: коротший строк — менше історії для графіків і «Перегляду минулого». Пов’язано з: аудит дій має сталий строк 2 роки й лише додається. Як повернути: оберіть попередній строк; уже видалене не повернеться.', 'Wat er gebeurt: een kortere termijn — minder geschiedenis voor grafieken en ‘Terugblik’. Hangt samen met: de audit van acties heeft een vaste termijn van 2 jaar en wordt alleen aangevuld. Terugdraaien: kies de vorige termijn; wat al is verwijderd komt niet terug.') }) + '</div>' +
      '<div class="hv-so-kolom">' + kaart('so-omvang', ring) +
      kaart('so-export', kop('download', t('Вивантаження', 'Exporteren'), '', h(t('Файл huis-export.json: Журнал, налаштування системи й траси — без секретів.', 'Bestand huis-export.json: logboek, systeeminstellingen en sporen — zonder geheimen.'))) +
        knoppen(o.knop({ tekst: t('Вивантажити дані', 'Gegevens exporteren'), icoon: 'download', soort: 'hoofd', actie: 'so-export' }), o.knop({ tekst: t('Очистити історію демо-дому', 'Geschiedenis van de demowoning wissen'), icoon: 'eraser', soort: 'stil', actie: 'so-wis-historie' })) +
        noot('lock', t('Аудит справжнього дому не очищується ніким: роль бази має лише право додавати.', 'De audit van een echt huis wist niemand: de databaserol mag alleen toevoegen.'))) + '</div></div></div>';
  }
  HV.actie('so-bewaar', function (ctx, g) {
    var r = OPSLAG.filter(function (x) { return x.id === g.reeks; })[0]; if (!r) return;
    var was = X.bewaar[r.id], werd = Number(g.waarde);
    if (was === werd) return;
    sysDoe({ min: 3, icoon: 'database', wat: ['Строк зберігання: ' + r.naam[0].toLowerCase(), 'Bewaartermijn: ' + r.naam[1].toLowerCase()], was: [was + ' днів', was + ' dagen'], werd: [werd + ' днів', werd + ' dagen'],
      pas: function () { X.bewaar[r.id] = werd; }, terug: function () { X.bewaar[r.id] = was; } });
  });
  HV.actie('so-export', function () {
    var w = HV.staat.w;
    var inhoud = JSON.stringify({ woning: HV.p(HV.paspoort.naam), huistijd: new Date(w.tijd).toISOString(), logboek: w.logboek.map(function (r) { return { tijd: new Date(r.tijd).toISOString(), maker: r.maker && r.maker.soort, wat: HV.p(r.wat), was: r.was ? HV.p(r.was) : null, werd: r.werd ? HV.p(r.werd) : null, soort: r.soort }; }), schermen: X.schermen.map(function (s) { return { id: s.id, profiel: s.profiel, kamer: s.kamer, dichtheid: s.dichtheid }; }), bewaar: X.bewaar, sporen: X.sporen.lijst.map(function (s) { return { naam: HV.p(s.naam), stappen: s.acties.length }; }), geheimen: X.geheimen.map(function (g) { return { naam: g.code, datum: g.datum }; }) }, null, 2);
    var gelukt = false;
    try {
      var blob = new Blob([inhoud], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'huis-export.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      gelukt = true;
    } catch (e) { gelukt = false; }
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Дані вивантажено', 'Gegevens geëxporteerd'], waarom: ['файл huis-export.json, без секретів', 'bestand huis-export.json, zonder geheimen'], soort: 'huis.systeem' });
    HV.staat.wijzig();
    HV.meld({ maker: HV.mens(), icoon: 'download', titel: gelukt ? t('Файл вивантажено', 'Bestand geëxporteerd') : t('Вивантаження не вдалося', 'Exporteren mislukt'), tekst: 'huis-export.json · ' + HV.getal(Math.round(inhoud.length / 1024)) + ' ' + t('КБ', 'kB') });
  });
  HV.actie('so-wis-historie', function () {
    var bewaard = HV.staat.w.logboek.slice();
    var gevaar = { sleutel: 'gegevens.wissen', niveau: 'gevaarlijk', naam: ['Очистити історію демо-дому', 'Geschiedenis van de demowoning wissen'],
      gevolg: ['Що станеться: Журнал демо-дому стане порожнім; графіки й «Перегляд минулого» почнуться з цієї хвилини. Пов’язано з: аудит справжнього дому це не зачіпає. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: het logboek van de demowoning wordt leeg; grafieken en ‘Terugblik’ beginnen vanaf nu. Hangt samen met: de audit van een echt huis blijft onaangeroerd. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.'] };
    sysDoe({ min: 3, gevaar: gevaar, icoon: 'eraser', gewicht: 'belangrijk', wat: ['Історію демо-дому очищено', 'Geschiedenis van de demowoning gewist'], tekst: tel(bewaard.length, ['запис', 'записи', 'записів'], ['regel', 'regels']),
      pas: function () { HV.staat.w.logboek = []; }, terug: function () { HV.staat.w.logboek = bewaard.concat(HV.staat.w.logboek); } });
  });

  // ═════════════════════════ 5. Секрети ═════════════════════════
  function geheimStaat(g, w) {
    var dagen = dagenTussen(datumVan(g.datum), w.tijd);
    if (!g.gebruikt) return { toon: 'neutraal', woord: ['ще не вжито', 'nog niet gebruikt'], icoon: 'circle-dashed', dagen: dagen };
    if (dagen > 180) return { toon: 'let-op', woord: ['пора оновити', 'tijd om te vernieuwen'], icoon: 'triangle-alert', dagen: dagen };
    if (dagen > 150) return { toon: 'let-op', woord: ['оновити за ' + (180 - dagen) + ' дн', 'vernieuwen over ' + (180 - dagen) + ' d'], icoon: 'clock-4', dagen: dagen };
    return { toon: 'ok', woord: ['діє', 'geldig'], icoon: 'circle-check', dagen: dagen };
  }
  function geheimenTab(ctx) {
    var w = ctx.staat;
    var oud = X.geheimen.filter(function (g) { return geheimStaat(g, w).toon === 'let-op'; }).length;
    var rijen = X.geheimen.map(function (g) {
      var st = geheimStaat(g, w);
      return '<article class="hv-so-geheim" data-k="so-gh-' + g.id + '"><div class="hv-so-geheim__kop"><span class="hv-so-geheim__teken">' + ic('key-round') + '</span><div class="hv-so-geheim__naam"><p>' + h(HV.p(g.naam)) + '</p><code>' + h(g.code) + '</code></div>' +
        o.chip({ icoon: st.icoon, toon: st.toon === 'neutraal' ? null : st.toon, tekst: HV.p(st.woord) }) + '</div>' +
        '<dl class="hv-so-geheim__feiten"><div><dt>' + h(t('Оновлено', 'Vernieuwd')) + '</dt><dd>' + h(HV.datumKort(datumVan(g.datum)) + ' · ' + st.dagen + ' ' + t('дн тому', 'd geleden')) + '</dd></div>' +
        '<div><dt>' + h(t('Значення', 'Waarde')) + '</dt><dd class="hv-so-geheim__waarde">' + ic('lock', { maat: 's' }) + '<span aria-hidden="true">••••••••</span><span>' + h(t('у сховищі платформи', 'in de kluis van het platform')) + '</span></dd></div>' +
        '<div><dt>' + h(t('Де вжито', 'Waar gebruikt')) + '</dt><dd class="hv-so-geheim__waar">' + g.waar.map(function (x) { return o.chip({ icoon: 'arrow-up-right', tekst: t(x[0], x[1]), actie: 'ga', gegevens: { naar: x[2] } }); }).join('') + '</dd></div></dl>' +
        knoppen(o.knop({ tekst: t('Оновити', 'Vernieuwen'), icoon: 'refresh-cw', klein: true, actie: 'so-geheim-roteer', gegevens: { geheim: g.id }, uit: !mag(3) })) + '</article>';
    }).join('');
    return '<div class="hv-so" data-k="so-geheimen">' +
      '<section class="hv-so-held" data-k="so-held-geheimen"><div class="hv-so-held__getal"><span class="hv-so-held__n">' + X.geheimen.length + '</span><span class="hv-so-held__woord">' + h(HV.meervoud(X.geheimen.length, ['секрет', 'секрети', 'секретів'], ['geheim', 'geheimen'])) + '</span></div>' +
      '<div class="hv-so-held__tekst"><p class="hv-so-held__zin">' + h(oud ? t('Значень тут немає ніколи. ' + oud + ' ' + HV.meervoud(oud, ['секрет', 'секрети', 'секретів'], []) + ' час оновити.', 'Waarden staan hier nooit. ' + oud + ' ' + (oud === 1 ? 'geheim is' : 'geheimen zijn') + ' aan vernieuwing toe.') : t('Значень тут немає ніколи; усі секрети чинні.', 'Waarden staan hier nooit; alle geheimen zijn geldig.')) + '</p>' +
      '<div class="hv-so-held__chips">' + o.chip({ icoon: 'lock', tekst: t('лише назва, дата й де вжито', 'alleen naam, datum en waar gebruikt') }) + o.chip({ icoon: 'calendar-clock', tekst: t('ротація кожні 180 днів', 'vernieuwen elke 180 dagen') }) + '</div></div>' +
      '<div class="hv-so-held__acties">' + o.knop({ tekst: t('Додати секрет', 'Geheim toevoegen'), icoon: 'plus', soort: 'hoofd', actie: 'blad', gegevens: { blad: 'sogeheim' } }) + '</div></section>' +
      '<div class="hv-so-geheimen" data-k="so-geheimlijst">' + rijen + '</div>' +
      kaart('so-herinnering', '<div class="hv-so-schakelrij">' + o.schakel({ aan: X.herinnering, icoon: 'calendar-clock', toon: 'aan', actie: 'so-herinnering', aria: t('Нагадувати про ротацію', 'Herinneren aan vernieuwen') }) +
        '<div><p class="hv-so-schakelrij__naam">' + h(t('Нагадувати про ротацію', 'Herinneren aan vernieuwen')) + '</p><p class="hv-so-schakelrij__sub">' + h(t('Сповіщення за 30 днів до 180-го дня кожного секрету.', 'Een melding 30 dagen vóór de 180e dag van elk geheim.')) + '</p></div></div>' + slotRegel(3)) + '</div>';
  }
  var GEHEIM_VOORSTEL = [
    { code: 'P1_LOKAAL_SLEUTEL', naam: ['Ключ лічильника P1', 'Sleutel van de P1-meter'], waar: [['Енергія', 'Energie', 'energie']] },
    { code: 'HUE_BRUG_SLEUTEL', naam: ['Ключ моста Philips Hue', 'Sleutel van de Philips Hue-brug'], waar: [['Інтеграції', 'Integraties', 'instellingen-integraties']] },
    { code: 'MQTT_WACHTWOORD', naam: ['Пароль брокера MQTT', 'Wachtwoord van de MQTT-broker'], waar: [['Інтеграції', 'Integraties', 'instellingen-integraties']] }
  ];
  HV.blad({
    soort: 'sogeheim', vrij: true, icoon: 'key-round', titel: ['Додати секрет', 'Geheim toevoegen'], sub: function () { return t('лише запис про секрет', 'alleen een verwijzing naar het geheim'); },
    render: function () {
      var keuze = HV.ui.lees('so-geheim-keuze', GEHEIM_VOORSTEL[0].code);
      return '<div class="hv-so-blad">' + o.kaart({ inhoud: '<p class="hv-so-blad__zin">' + h(t('Значення вводять у сховищі платформи; дім бачить лише назву, дату й де вжито.', 'De waarde voer je in de kluis van het platform in; het huis ziet alleen naam, datum en waar het wordt gebruikt.')) + '</p>' }) +
        o.kaart({ titel: t('Для чого', 'Waarvoor'), inhoud: '<div class="hv-so-keuzes" role="radiogroup" aria-label="' + h(t('Секрет', 'Geheim')) + '">' + GEHEIM_VOORSTEL.map(function (g) {
          var gek = g.code === keuze, bestaat = X.geheimen.some(function (x) { return x.code === g.code; });
          return '<button type="button" role="radio" aria-checked="' + (gek ? 'true' : 'false') + '" class="hv-so-keuze' + (gek ? ' is-gekozen' : '') + (bestaat ? ' is-later' : '') + '" data-actie="ui" data-naam="so-geheim-keuze" data-waarde="' + g.code + '">' + ic('key-round') + '<span><strong>' + h(HV.p(g.naam)) + '</strong><small>' + h(bestaat ? t('уже додано', 'al toegevoegd') : g.code) + '</small></span></button>';
        }).join('') + '</div>' }) +
        knoppen(o.knop({ tekst: t('Створити запис', 'Verwijzing maken'), icoon: 'plus', soort: 'hoofd', actie: 'so-geheim-voeg', gegevens: { code: keuze } })) + '</div>';
    }
  });
  HV.actie('so-geheim-voeg', function (ctx, g) {
    var v = GEHEIM_VOORSTEL.filter(function (x) { return x.code === g.code; })[0]; if (!v) return;
    if (X.geheimen.some(function (x) { return x.code === v.code; })) { HV.meld({ icoon: 'key-round', titel: t('Такий секрет уже є', 'Dit geheim bestaat al'), tekst: v.code }); return; }
    var d = new Date(HV.staat.w.tijd), iso = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    var nieuw = { id: 'g' + REEL() % 100000, code: v.code, naam: v.naam, datum: iso, waar: v.waar, gebruikt: 0 };
    sysDoe({ min: 3, icoon: 'key-round', wat: ['Секрет додано: ' + v.naam[0], 'Geheim toegevoegd: ' + v.naam[1]], waarom: ['значення — у сховищі платформи', 'waarde in de kluis van het platform'],
      pas: function () { X.geheimen.push(nieuw); HV.bladOpen(null); }, terug: function () { X.geheimen = X.geheimen.filter(function (x) { return x !== nieuw; }); } });
  });
  HV.actie('so-geheim-roteer', function (ctx, g) {
    var x = X.geheimen.filter(function (y) { return y.id === g.geheim; })[0]; if (!x) return;
    var was = x.datum, d = new Date(HV.staat.w.tijd), werd = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    sysDoe({ min: 3, icoon: 'refresh-cw', wat: ['Секрет оновлено: ' + x.naam[0], 'Geheim vernieuwd: ' + x.naam[1]], was: [was, was], werd: [werd, werd], waarom: ['нове значення — у сховищі платформи', 'nieuwe waarde in de kluis van het platform'],
      pas: function () { x.datum = werd; }, terug: function () { x.datum = was; } });
  });
  HV.actie('so-herinnering', function () {
    var was = X.herinnering;
    sysDoe({ min: 3, icoon: 'calendar-clock', wat: ['Нагадування про ротацію секретів', 'Herinnering aan het vernieuwen van geheimen'], was: was ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], werd: was ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'],
      pas: function () { X.herinnering = !was; }, terug: function () { X.herinnering = was; } });
  });

  // ═════════════════════════ 6. Діагностика ═════════════════════════
  var FOUTCODES = [
    ['HV_STROOM_STIL', ['Потік мовчить 45 с — перехід на опитування раз на 30 с.', 'De stroom zwijgt 45 s — over op opvragen elke 30 s.']],
    ['HV_ACK_TIMEOUT', ['Не підтверджено за строк класу — стан повернуто.', 'Niet bevestigd binnen de termijn van de klasse — teruggezet.']],
    ['HV_ADP_OFFLINE', ['Адаптер не відповідає — показано останній знімок.', 'De adapter reageert niet — laatste momentopname.']],
    ['HV_ADP_AUTH', ['Ключ доступу джерела не діє — потрібен вхід.', 'De toegangssleutel van de bron geldt niet — aanmelding nodig.']],
    ['HV_ADP_LIMIET', ['Джерело просить зачекати — команди в черзі.', 'De bron vraagt te wachten — opdrachten in de wachtrij.']],
    ['HV_BRON_LEZEN', ['Не виконано: джерело лише для читання.', 'Niet uitgevoerd: bron is alleen-lezen.']],
    ['HV_STAND_UIT', ['Не виконано: дозвіл виконавця «Вимкнено».', 'Niet uitgevoerd: toestemming van de uitvoerder ‘Uit’.']]
  ];
  function ketenStaat(ctx) {
    var w = ctx.staat, s = X.sim, v = s.vertraging * 1000;
    var lokaal = X.diag.route === 'lokaal';
    var adapterOk = s.adapter === 'goed', geen = w.gegevens === 'geen';
    return [
      { id: 'browser', icoon: 'monitor-smartphone', naam: ['Цей браузер', 'Deze browser'], stand: 'goed', ms: 4, woord: ['сеанс діє', 'sessie geldig'] },
      { id: 'route', icoon: lokaal ? 'house' : 'route', naam: lokaal ? ['Локальний шлях', 'Lokale route'] : ['Тунель', 'Tunnel'], stand: 'goed', ms: lokaal ? 3 : 38, woord: lokaal ? ['у домашній мережі', 'in het thuisnetwerk'] : ['через тунель', 'via tunnel'] },
      { id: 'server', icoon: 'server', naam: ['Сервер дому', 'Server van het huis'], stand: 'goed', ms: 6, woord: ['потік наживо', 'stroom live'] },
      { id: 'adapter', icoon: 'flask-conical', naam: ['Адаптер «Симулятор»', 'Adapter ‘Simulator’'], stand: adapterOk ? (v ? 'traag' : 'goed') : geen ? 'fout' : 'traag', ms: geen ? null : 18 + v, woord: (ADAPTER_STAND[s.adapter] || ADAPTER_STAND.goed).naam },
      { id: 'apparaten', icoon: 'lightbulb', naam: ['Пристрої', 'Apparaten'], stand: geen ? 'fout' : s.geenBevestiging ? 'traag' : 'goed', ms: geen ? null : s.geenBevestiging ? 10000 : 420, woord: geen ? ['невідомо', 'onbekend'] : s.geenBevestiging ? ['не підтверджують', 'bevestigen niet'] : [w.volgorde.length + ' на зв’язку', w.volgorde.length + ' verbonden'] }
    ];
  }
  /** hv-verbindingsketen: ланцюжок зв'язку з затримкою й станом кожної ланки. */
  function keten(ctx) {
    var c = X.diag.controle;
    var ketting = ketenStaat(ctx);
    return '<ol class="hv-so-keten" data-k="so-keten" aria-label="' + h(t('Ланцюжок зв’язку', 'Verbindingsketen')) + '">' + ketting.map(function (l, i) {
      var gecontroleerd = c && c.stap > i, bezig = c && c.stap === i;
      var woord = l.stand === 'goed' ? t('справно', 'gezond') : l.stand === 'traag' ? t('повільно', 'traag') : t('збій', 'storing');
      return '<li class="hv-so-keten__schakel is-' + l.stand + (bezig ? ' is-bezig' : '') + '" data-k="so-ks-' + l.id + '"><span class="hv-so-keten__teken">' + ic(bezig ? 'loader' : l.icoon, { klas: bezig ? 'hv-so-draai' : '' }) + '</span>' +
        '<span class="hv-so-keten__naam">' + h(HV.p(l.naam)) + '</span><span class="hv-so-keten__woord">' + h(HV.p(l.woord)) + '</span>' +
        '<span class="hv-so-keten__ms">' + (l.ms == null ? '—' : l.ms >= 1000 ? HV.getal(l.ms / 1000, 0) + ' ' + t('с', 's') : l.ms + ' ' + t('мс', 'ms')) + '</span>' +
        '<span class="hv-so-keten__stand">' + ic(l.stand === 'goed' ? 'circle-check' : l.stand === 'traag' ? 'triangle-alert' : 'circle-x', { maat: 's' }) + h(woord) + (gecontroleerd ? ' · ' + t('перевірено', 'gecontroleerd') : '') + '</span></li>';
    }).join('') + '</ol>';
  }
  function diagnoseTab(ctx) {
    var w = ctx.staat, s = X.sim, expert = !!HV.opslag.lees('so-expert', false);
    var v = s.vertraging * 1000, geen = w.gegevens === 'geen';
    var ketting = ketenStaat(ctx), fout = ketting.filter(function (l) { return l.stand !== 'goed'; });
    var p50 = geen ? null : 66 + v + (s.geenBevestiging ? 0 : 0), p95 = geen ? null : 180 + v * 1.2;
    var punten = []; for (var i = 0; i <= 30; i++) { var golf = Math.sin(i * 0.7) * 14 + ((i * 37) % 11) * 3; punten.push([i, geen && i > 26 ? 0 : Math.round(60 + golf + (i > 22 ? v / 10 : 0))]); }
    var weg = HV.kijk.alle(function (a) { return a.beschikbaar !== 'ok'; });
    var deel = X.diag.deel;
    var lijf;
    if (deel === 'acties') {
      lijf = X.opdrachten.length ? '<ol class="hv-so-opdrachten">' + X.opdrachten.slice(0, 12).map(function (c) {
        var a = w.apparaten[c.doel], naam = a ? HV.p(a.naam) : String(c.doel);
        var fase = c.fase === 'bevestigd' ? ['підтверджено', 'bevestigd', 'ok', 'circle-check'] : c.fase === 'verzonden' ? ['надіслано', 'verzonden', 'info', 'send'] : c.fase === 'niet-uitgevoerd' ? ['не підтверджено', 'niet bevestigd', 'let-op', 'circle-x'] : c.fase === 'wacht' ? ['чекає на вас', 'wacht op jou', 'let-op', 'circle-help'] : c.fase === 'geannuleerd' ? ['скасовано', 'geannuleerd', null, 'x'] : ['відхилено', 'geweigerd', 'let-op', 'ban'];
        return '<li data-k="so-cmd-' + c.id + '"><time>' + HV.tijd(c.tijd) + '</time>' + o.maker(c.door, { alleenTeken: true }) + '<span class="hv-so-opdrachten__wat">' + h(naam + ' · ' + c.mogelijkheid + (c.waarde != null && typeof c.waarde !== 'object' ? ' → ' + c.waarde : '')) + '</span>' +
          o.chip({ icoon: fase[3], toon: fase[2], tekst: HV.p([fase[0], fase[1]]) }) + '<span class="hv-so-opdrachten__ms">' + (c.ms != null ? HV.getal(c.ms) + ' ' + t('мс', 'ms') : '…') + '</span></li>';
      }).join('') + '</ol>' : o.leeg({ icoon: 'send', titel: t('Команд ще не було', 'Nog geen opdrachten'), tekst: t('Увімкніть будь-яку лампу — команда з’явиться тут із мікростанами.', 'Zet een lamp aan — de opdracht verschijnt hier met haar tussenstappen.'), actie: { tekst: t('До кімнат', 'Naar kamers'), icoon: 'layout-grid', actie: 'ga', gegevens: { naar: 'kamers' } } });
    } else if (deel === 'gebeurtenissen') {
      lijf = '<ul class="hv-berichten">' + w.logboek.slice(0, 10).map(function (r) { return o.bericht(r, { open: HV.ui.lees('bericht', null) === r.id }); }).join('') + '</ul>';
    } else {
      lijf = weg.length ? '<div class="hv-rijen">' + weg.map(function (a) {
        return o.rij({ icoon: a.beschikbaar === 'onbereikbaar' ? 'unplug' : a.beschikbaar === 'slaapt' ? 'moon' : a.beschikbaar === 'verondersteld' ? 'circle-dashed' : 'clock-4', naam: HV.p(a.naam) + ' · ' + kamerNaam(a.kamer), sub: HV.woord[a.beschikbaar] ? HV.woord[a.beschikbaar]() : a.beschikbaar, waarde: h(HV.oud(HV.kijk.leeftijd(a))), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id } });
      }).join('') + '</div>' : o.leeg({ icoon: 'badge-check', titel: t('Усі пристрої звітують', 'Alle apparaten melden zich') });
    }
    var cijfers = [
      { label: t('Затримка p50', 'Vertraging p50'), waarde: p50 == null ? '—' : HV.maat(p50, t('мс', 'ms')), toon: v ? 'let-op' : null },
      { label: t('Затримка p95', 'Vertraging p95'), waarde: p95 == null ? '—' : HV.maat(Math.round(p95), t('мс', 'ms')) },
      { label: t('Кадрів за хвилину', 'Frames per minuut'), waarde: geen ? '0' : String(w.gegevens === 'verouderd' ? 2 : 240) },
      { label: t('Не звітують', 'Melden zich niet'), waarde: String(weg.length) }
    ];
    return '<div class="hv-so" data-k="so-diagnose">' +
      '<section class="hv-so-held' + (fout.length ? ' is-let-op' : '') + '" data-k="so-held-diag"><div class="hv-so-held__getal"><span class="hv-so-held__n">' + ic(fout.length ? 'triangle-alert' : 'stethoscope', { maat: 'xl' }) + '</span><span class="hv-so-held__woord">' + h(fout.length ? t('увага', 'let op') : t('справно', 'gezond')) + '</span></div>' +
      '<div class="hv-so-held__tekst"><p class="hv-so-held__zin">' + h(fout.length ? t('Повільна ланка: ' + HV.p(fout[0].naam).toLowerCase() + '. ', 'Trage schakel: ' + HV.p(fout[0].naam).toLowerCase() + '. ') + HV.p((ADAPTER_STAND[s.adapter] || ADAPTER_STAND.goed).zin) : t('Ланцюжок від браузера до пристроїв справний; потік наживо.', 'De keten van browser tot apparaten is gezond; de stroom is live.')) + '</p>' +
      '<div class="hv-so-held__chips">' + o.versheid(w) + o.chip({ icoon: 'route', tekst: X.diag.route === 'lokaal' ? t('локально', 'lokaal') : t('через тунель', 'via tunnel') }) + o.chip({ icoon: 'heart-pulse', tekst: t('сигнал життя 15 с', 'levenssignaal 15 s') }) + '</div></div>' +
      '<div class="hv-so-held__acties">' + o.knop({ tekst: X.diag.controle && X.diag.controle.stap < 5 ? t('Перевіряється…', 'Wordt gecontroleerd…') : t('Перевірити зараз', 'Nu controleren'), icoon: 'stethoscope', soort: 'hoofd', actie: 'so-diag-controle', uit: !!(X.diag.controle && X.diag.controle.stap < 5) }) + o.knop({ tekst: t('Скопіювати звіт', 'Rapport kopiëren'), icoon: 'copy', actie: 'so-diag-kopie' }) + '</div></section>' +
      kaart('so-ketenkaart', kop('waypoints', t('Ланцюжок зв’язку', 'Verbindingsketen'), o.segment({ label: t('Шлях', 'Route'), waarde: X.diag.route, actie: 'so-diag-route', opties: [{ id: 'tunnel', label: t('Тунель', 'Tunnel'), icoon: 'route' }, { id: 'lokaal', label: t('Локально', 'Lokaal'), icoon: 'house' }] })) + keten(ctx) +
        (X.diag.route === 'tunnel' ? noot('triangle-alert', t('Без локального шляху панелі без інтернету тривогу не покажуть. Локальний шлях — етап 11.', 'Zonder lokale route tonen panelen zonder internet geen alarm. Lokale route — fase 11.')) : '')) +
      '<div class="hv-so-raster"><div class="hv-so-kolom">' +
      kaart('so-cijfers', '<div class="hv-so-cijfers">' + cijfers.map(function (c) { return o.getal({ maat: 'm', label: c.label, waarde: c.waarde, toon: c.toon }); }).join('') + '</div>' +
        HV.grafiek.lijn({ id: 'so-latentie', titel: t('Затримка за 30 хв', 'Vertraging in 30 min'), eenheid: t('мс', 'ms'), x: { min: 0, max: 30, tikken: [{ x: 0, label: t('−30 хв', '−30 min') }, { x: 15, label: t('−15 хв', '−15 min') }, { x: 30, label: t('зараз', 'nu') }], format: function (x) { return '−' + (30 - x) + ' ' + t('хв', 'min'); } },
          reeksen: [{ naam: t('медіана', 'mediaan'), toon: 'koud', punten: punten }], samenvatting: geen ? t('Останні хвилини — без даних: адаптер мовчить.', 'De laatste minuten zonder gegevens: de adapter zwijgt.') : t('Затримка рівна; піки — під час перезапуску сценарію.', 'De vertraging is gelijkmatig; pieken bij het herstarten van een scenario.') })) + '</div>' +
      '<div class="hv-so-kolom">' + kaart('so-diagdelen', o.segment({ label: t('Що показати', 'Wat tonen'), waarde: deel, actie: 'so-diag-deel', opties: [{ id: 'toestanden', label: t('Стани', 'Toestanden'), icoon: 'toggle-right' }, { id: 'acties', label: t('Дії', 'Acties'), icoon: 'send' }, { id: 'gebeurtenissen', label: t('Події', 'Gebeurtenissen'), icoon: 'list' }], klas: 'hv-so-segment-breed' }) + '<div class="hv-so-diaglijf" data-k="so-diaglijf-' + deel + '">' + lijf + '</div>') +
      kaart('so-expert', '<div class="hv-so-schakelrij">' + o.schakel({ aan: expert, icoon: 'code-xml', toon: 'aan', actie: 'so-expert', aria: t('Для знавців', 'Expertweergave') }) + '<div><p class="hv-so-schakelrij__naam">' + h(t('Для знавців', 'Expertweergave')) + '</p><p class="hv-so-schakelrij__sub">' + h(t('Коди помилок і технічні подробиці ланцюжка.', 'Foutcodes en technische details van de keten.')) + '</p></div></div>' +
        (expert ? HV.tabel([t('Код', 'Code'), t('Що означає', 'Wat het betekent')], FOUTCODES.map(function (f) { return [f[0], h(HV.p(f[1]))]; })) + '<p class="hv-so-code-regel"><code>' + h('POST /api/huis/stroom; frames/s=' + (geen ? '0' : '4') + '; ring=2000; ack=' + (3 + s.vertraging) + 's') + '</code></p>' : '')) + '</div></div></div>';
  }
  HV.actie('so-diag-deel', function (ctx, g) { X.diag.deel = g.waarde; HV.teken(); });
  HV.actie('so-diag-route', function (ctx, g) {
    if (g.waarde === 'lokaal') { HV.meld({ icoon: 'house', titel: t('Локальний шлях — пізніше', 'Lokale route — later'), tekst: t('Потрібні локальне ім’я й сертифікат через перевірку імені; етап 11. Показано, як виглядатиме ланцюжок.', 'Lokale naam en certificaat via naamcontrole nodig; fase 11. Je ziet hoe de keten eruit gaat zien.') }); }
    X.diag.route = g.waarde; HV.teken();
  });
  HV.actie('so-expert', function () { HV.opslag.schrijf('so-expert', !HV.opslag.lees('so-expert', false)); HV.teken(); });
  HV.actie('so-diag-controle', function (ctx) {
    if (X.diag.controle && X.diag.controle.stap < 5) return;
    var c = X.diag.controle = { stap: 0 };
    var volgende = function () {
      if (X.diag.controle !== c) return;
      c.stap++;
      HV.teken();
      if (c.stap < 5) { setTimeout(volgende, 380); return; }
      var fout = ketenStaat(HV.ctx()).filter(function (l) { return l.stand !== 'goed'; });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Самоперевірка зв’язку', 'Zelftest van de verbinding'], waarom: fout.length ? ['проблемна ланка: ' + fout[0].naam[0], 'probleemschakel: ' + fout[0].naam[1]] : ['усі 5 ланок справні', 'alle 5 schakels gezond'], soort: 'huis.systeem', gewicht: fout.length ? 'belangrijk' : 'info' });
      HV.meld({ maker: HV.mens(), icoon: fout.length ? 'triangle-alert' : 'badge-check', gewicht: fout.length ? 'belangrijk' : 'info', titel: fout.length ? t('Знайдено повільну ланку', 'Trage schakel gevonden') : t('Зв’язок справний', 'Verbinding gezond'), tekst: fout.length ? HV.p(fout[0].naam) + ' · ' + HV.p(fout[0].woord) : t('5 з 5 ланок відповіли вчасно.', '5 van 5 schakels antwoordden op tijd.') });
      HV.staat.wijzig();
    };
    HV.teken();
    setTimeout(volgende, 380);
  });
  HV.actie('so-diag-kopie', function (ctx) {
    var regels = ketenStaat(ctx).map(function (l) { return HV.p(l.naam) + ': ' + HV.p(l.woord) + (l.ms != null ? ' · ' + l.ms + ' ms' : ''); });
    var tekst = HV.p(HV.paspoort.naam) + ' · ' + HV.datum(ctx.staat.tijd) + ' ' + HV.tijd(ctx.staat.tijd) + '\n' + regels.join('\n');
    var klaar = function (ok) { HV.meld({ icoon: 'copy', titel: ok ? t('Звіт скопійовано', 'Rapport gekopieerd') : t('Звіт готовий', 'Rapport klaar'), tekst: ok ? t('5 ланок і стан адаптера — у буфері обміну.', '5 schakels en de stand van de adapter staan op het klembord.') : t('Буфер обміну недоступний у цьому вікні.', 'Het klembord is in dit venster niet beschikbaar.') }); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tekst).then(function () { klaar(true); }, function () { klaar(false); }); else klaar(false); } catch (e) { klaar(false); }
  });

  // ═════════════════════════ 7. Доступність ═════════════════════════
  var TOEG = {
    tekst: { opslag: 'so-tekst', standaard: '100', naam: ['Розмір тексту', 'Tekstgrootte'], opties: [['100', '100 %'], ['115', '115 %'], ['130', '130 %']] },
    beweging: { opslag: 'so-beweging', standaard: 'systeem', naam: ['Рух', 'Beweging'], opties: [['systeem', ['Як у системі', 'Als het systeem']], ['minder', ['Менше руху', 'Minder beweging']]] },
    contrast: { opslag: 'so-contrast', standaard: 'gewoon', naam: ['Контраст', 'Contrast'], opties: [['gewoon', ['Звичайний', 'Normaal']], ['hoog', ['Підвищений', 'Verhoogd']]] },
    zuinig: { opslag: 'so-zuinig', standaard: 'uit', naam: ['Полегшений вигляд', 'Zuinige weergave'], opties: [['uit', ['Вимкнено', 'Uit']], ['aan', ['Увімкнено', 'Aan']]] }
  };
  var optieNaam = function (x) { return typeof x[1] === 'string' ? [x[1], x[1]] : x[1]; };
  function pasToegankelijkheidToe() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var doek = document.getElementById('hv-doek');
    if (!doek || !doek.setAttribute) return;
    Object.keys(TOEG).forEach(function (k) {
      var v = String(HV.opslag.lees(TOEG[k].opslag, TOEG[k].standaard)), attr = 'data-so-' + k;
      if (doek.getAttribute(attr) !== v) doek.setAttribute(attr, v);
    });
  }
  setTimeout(pasToegankelijkheidToe, 0);

  function toegankelijkheidTab(ctx) {
    var dicht = HV.opslag.lees('dichtheid', 'auto');
    var rij = function (sleutel, icoon, sub) {
      var d = TOEG[sleutel], v = String(HV.opslag.lees(d.opslag, d.standaard));
      return '<div class="hv-so-toegrij" data-k="so-t-' + sleutel + '"><span class="hv-so-toegrij__teken">' + ic(icoon) + '</span><div class="hv-so-toegrij__tekst"><p class="hv-so-toegrij__naam">' + h(HV.p(d.naam)) + '</p><p class="hv-so-toegrij__sub">' + h(sub) + '</p></div>' +
        o.segment({ label: HV.p(d.naam), waarde: v, actie: 'so-toeg', gegevens: { sleutel: sleutel }, opties: d.opties.map(function (x) { return { id: x[0], label: HV.p(optieNaam(x)) }; }), klas: 'hv-so-segment-breed' }) + '</div>';
    };
    var dichtRij = '<div class="hv-so-toegrij" data-k="so-t-dicht"><span class="hv-so-toegrij__teken">' + ic('rows-3') + '</span><div class="hv-so-toegrij__tekst"><p class="hv-so-toegrij__naam">' + h(t('Щільність', 'Dichtheid')) + '</p><p class="hv-so-toegrij__sub">' + h(t('Простора — цілі 56 px і рядки 80 px; компактна — більше на екрані.', 'Ruim — doelen van 56 px en regels van 80 px; compact — meer op het scherm.')) + '</p></div>' +
      o.segment({ label: t('Щільність', 'Dichtheid'), waarde: dicht, actie: 'so-dichtheid', opties: ['auto', 'compact', 'normaal', 'ruim'].map(function (d) { return { id: d, label: HV.p(DICHT[d]) }; }), klas: 'hv-so-segment-breed' }) + '</div>';
    var proef = '<div class="hv-so-proef" data-k="so-proef" aria-label="' + h(t('Зразок', 'Voorbeeld')) + '"><p class="hv-so-proef__kop">' + h(t('Так виглядатиме дім', 'Zo ziet het huis eruit')) + '</p>' +
      '<div class="hv-tegels hv-so-proef__tegels">' + o.tegel(ctx.staat.apparaten.torsher, { vorm: '2x1' }).replace(/data-actie="[a-z-]+"/g, 'data-actie="so-zaal" data-oorspr="tegel"') + o.tegel(ctx.staat.apparaten.thermostaat, { vorm: '2x1' }).replace(/data-actie="[a-z-]+"/g, 'data-actie="so-zaal" data-oorspr="tegel"') + '</div>' +
      '<p class="hv-so-proef__tekst">' + h(t('Речення дому, підписи й числа масштабуються разом; цілі дотику лишаються не меншими за 44 px.', 'Huiszin, labels en getallen schalen mee; aanraakdoelen blijven minstens 44 px.')) + '</p></div>';
    var later = '<div class="hv-so-toegrij is-later"><span class="hv-so-toegrij__teken">' + ic('hand') + '</span><div class="hv-so-toegrij__tekst"><p class="hv-so-toegrij__naam">' + h(t('Довше утримання рейки', 'Rail langer vasthouden')) + ' ' + o.later(t('етап 11', 'fase 11')) + '</p><p class="hv-so-toegrij__sub">' + h(t('Зараз 1,2 с і рівноправна кнопка «Підтвердити» з відліком 3 с.', 'Nu 1,2 s en een gelijkwaardige knop ‘Bevestigen’ met 3 s aftellen.')) + '</p></div></div>' +
      '<div class="hv-so-toegrij is-later"><span class="hv-so-toegrij__teken">' + ic('square-dashed') + '</span><div class="hv-so-toegrij__tekst"><p class="hv-so-toegrij__naam">' + h(t('Простий режим', 'Eenvoudige modus')) + ' ' + o.later(t('етап 11', 'fase 11')) + '</p><p class="hv-so-toegrij__sub">' + h(t('Шість великих дій і речення дому — для дітей і гостей.', 'Zes grote acties en de huiszin — voor kinderen en gasten.')) + '</p></div></div>';
    return '<div class="hv-so" data-k="so-toeg"><div class="hv-so-raster hv-so-raster--breed-links"><div class="hv-so-kolom">' +
      o.blok({ id: 'so-toeg', titel: t('Як бачити й керувати', 'Zien en bedienen'), vast: true, inhoud: kaart('so-toegkaart', dichtRij + rij('tekst', 'type', t('Збільшує текст на всіх сторінках цього пристрою.', 'Maakt de tekst groter op alle pagina’s van dit toestel.')) + rij('beweging', 'move', t('Без переходів неба, пульсу очікування й анімацій; відлік і «Повернути» лишаються.', 'Zonder hemelovergangen, wachtpuls en animaties; aftellen en ‘Ongedaan maken’ blijven.')) +
        rij('contrast', 'contrast', t('Без неба й скла; приглушений текст стає основним, лінії — чіткими.', 'Zonder hemel en glas; gedempte tekst wordt hoofdtekst, lijnen worden scherp.')) + rij('zuinig', 'leaf', t('Суцільні шапка й аркуші замість скла; для слабких екранів.', 'Massieve kop en bladen in plaats van glas; voor trage schermen.')) + later),
        uitleg: t('Що станеться: налаштування діє на цьому пристрої для вас і не змінює інших. Пов’язано з: щільність окремого екрана — в «Екранах». Як повернути: оберіть попереднє значення або «Повернути» у сповіщенні.', 'Wat er gebeurt: de instelling geldt op dit toestel voor jou en verandert niets voor anderen. Hangt samen met: de dichtheid van een los scherm staat bij ‘Schermen’. Terugdraaien: kies de vorige waarde of ‘Ongedaan maken’ in de melding.') }) + '</div>' +
      '<div class="hv-so-kolom">' + kaart('so-proefkaart', proef) +
      kaart('so-toeginfo', kop('accessibility', t('Що вміє кожен екран', 'Wat elk scherm kan')) + '<ul class="hv-so-lijst">' +
        [t('Ціль дотику не менша за 44 px; на пульті ТБ — фокус 3 px.', 'Aanraakdoel minstens 44 px; op de tv-afstandsbediening een focus van 3 px.'), t('Колір ніколи не єдина ознака: знак, слово й штрих.', 'Kleur is nooit het enige teken: symbool, woord en arcering.'), t('Кожен графік має «Показати як таблицю».', 'Elke grafiek heeft ‘Als tabel tonen’.'), t('Небезпечна дія: рейка утримання або кнопка з відліком.', 'Gevaarlijke actie: houdrail of een knop met aftellen.')].map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul>') + '</div></div></div>';
  }
  HV.actie('so-toeg', function (ctx, g) {
    var d = TOEG[g.sleutel]; if (!d) return;
    var was = String(HV.opslag.lees(d.opslag, d.standaard)), werd = String(g.waarde);
    if (was === werd) return;
    var naam = function (v) { var x = d.opties.filter(function (y) { return y[0] === v; })[0]; return x ? optieNaam(x) : [v, v]; };
    sysDoe({ icoon: 'accessibility', wat: [d.naam[0] + ' на цьому пристрої', d.naam[1] + ' op dit toestel'], was: naam(was), werd: naam(werd),
      pas: function () { HV.opslag.schrijf(d.opslag, werd); pasToegankelijkheidToe(); if (g.sleutel === 'contrast' && HV.hemelSprong) HV.hemelSprong(); },
      terug: function () { HV.opslag.schrijf(d.opslag, was); pasToegankelijkheidToe(); } });
  });
  HV.actie('so-dichtheid', function (ctx, g) {
    var was = HV.opslag.lees('dichtheid', 'auto'), werd = g.waarde;
    if (was === werd) return;
    var zet = function (v) { HV.opslag.schrijf('dichtheid', v); if (HV.pult && HV.pult.teken) HV.pult.teken(); };
    sysDoe({ icoon: 'rows-3', wat: ['Щільність на цьому пристрої', 'Dichtheid op dit toestel'], was: DICHT[was], werd: DICHT[werd], pas: function () { zet(werd); }, terug: function () { zet(was); } });
  });

  // ═════════════════════════ 8. Вітрина ═════════════════════════
  var TOCHTEN = [
    { id: 'avond', scenario: 'avond', naar: 'overzicht', icoon: 'sunset', naam: ['Вечір удома', 'Avond thuis'], zin: ['Небо сутінків, вікно спальні й запит агента — усе на одній сторінці.', 'Schemerhemel, het slaapkamerraam en een agentverzoek — alles op één pagina.'] },
    { id: 'rook', scenario: 'rook', naar: 'overzicht', icoon: 'alarm-smoke', naam: ['Дим на кухні', 'Rook in de keuken'], zin: ['Аварійний шар перекриває все: дві великі дії й «Зупинити самостійні дії».', 'De noodlaag dekt alles af: twee grote acties en ‘Zelfstandige acties stoppen’.'] },
    { id: 'agent', scenario: 'agentverzoek', naar: 'automatiseringen-agenten', icoon: 'bot', naam: ['Агент просить', 'De agent vraagt'], zin: ['Режим «Питати»: запит чекає власника, «Схвалити раз» або «Відхилити».', 'Stand ‘Vragen’: het verzoek wacht op de eigenaar, ‘Eén keer goedkeuren’ of ‘Afwijzen’.'] },
    { id: 'prijs', scenario: 'negatieveprijs', naar: 'energie-tarief', icoon: 'euro', naam: ['Від’ємна ціна', 'Negatieve prijs'], zin: ['Мережа доплачує: стовпець під нулем і порада заряджати зараз.', 'Het net betaalt: een staaf onder nul en het advies nu te laden.'] },
    { id: 'drone', scenario: 'dakinspectie', naar: 'garage-drones', icoon: 'drone', naam: ['Дрон над дахом', 'Drone boven het dak'], zin: ['Кабіна з телеметрією й зонами польоту довідково.', 'Cockpit met telemetrie en vliegzones ter informatie.'] },
    { id: 'deur', scenario: 'deurbel', naar: 'beveiliging-toegang', icoon: 'bell-ring', naam: ['Дзвінок у двері', 'Er wordt aangebeld'], zin: ['Виклик на всіх екранах, кадр із сервера й відповідь.', 'Oproep op alle schermen, beeld via de server en antwoorden.'] },
    { id: 'storing', scenario: 'storing', naar: 'instellingen-diagnose', icoon: 'wifi-off', naam: ['Немає зв’язку', 'Geen verbinding'], zin: ['Останній знімок, лише перегляд, і де саме обірвався ланцюжок.', 'Laatste momentopname, alleen bekijken, en waar de keten brak.'] },
    { id: 'thuis', scenario: 'terugkeer', naar: 'garage', icoon: 'car', naam: ['Повернення додому', 'Thuiskomst'], zin: ['Ворота гаража відчинені, зарядка почалась, «Зачинити» з відліком.', 'Garagedeur open, laden begonnen, ‘Sluiten’ met aftellen.'] }
  ];
  var toonzaalKlok = null;
  function toonTocht(tocht, stil) {
    HV.opslag.schrijf('scenario', tocht.scenario);
    HV.scenarios.start(tocht.scenario, stil);
    if (HV.pult && HV.pult.teken) HV.pult.teken();
    HV.open(tocht.naar);
  }
  function toonzaalTab(ctx) {
    var auto = X.toonzaal.auto;
    var kaarten = TOCHTEN.map(function (x, i) {
      var nu = auto && X.toonzaal.stap === i;
      return '<article class="hv-so-tocht' + (nu ? ' is-nu' : '') + '" data-k="so-tocht-' + x.id + '"><span class="hv-so-tocht__teken">' + ic(x.icoon, { maat: 'l' }) + '</span><div class="hv-so-tocht__tekst"><h3>' + h(HV.p(x.naam)) + '</h3><p>' + h(HV.p(x.zin)) + '</p></div>' +
        o.knop({ tekst: t('Показати', 'Tonen'), icoon: 'play', klein: true, soort: 'hoofd', actie: 'so-tocht', gegevens: { tocht: x.id } }) + '</article>';
    }).join('');
    var gezichten = ['wand', 'deur', 'tv', 'strook', 'rond', 'vierkant', 'klein', 'horloge', 'inkt'].map(function (id) {
      return '<button type="button" class="hv-so-gezicht" data-actie="so-profiel-toon" data-profiel="' + id + '" data-k="so-gz-' + id + '">' + miniatuur(id) + '<span>' + h(HV.p(PROFIEL[id].naam)) + '</span></button>';
    }).join('');
    return '<div class="hv-so" data-k="so-toonzaal">' +
      '<section class="hv-so-held hv-so-held--toonzaal" data-k="so-held-toonzaal"><div class="hv-so-held__getal"><span class="hv-so-held__n">' + ic('presentation', { maat: 'xl' }) + '</span><span class="hv-so-held__woord">' + h(t('вітрина', 'toonzaal')) + '</span></div>' +
      '<div class="hv-so-held__tekst"><p class="hv-so-held__zin">' + h(auto ? t('Автопоказ іде: ' + (X.toonzaal.stap + 1) + ' з ' + TOCHTEN.length + ' — «' + HV.p(TOCHTEN[X.toonzaal.stap].naam) + '».', 'Automatische rondleiding: ' + (X.toonzaal.stap + 1) + ' van ' + TOCHTEN.length + ' — ‘' + HV.p(TOCHTEN[X.toonzaal.stap].naam) + '’.') : t('Вісім історій дому за хвилину кожна: сценарій запускається, сторінка відкривається сама.', 'Acht verhalen van het huis in een minuut elk: het scenario start, de pagina opent vanzelf.')) + '</p>' +
      '<div class="hv-so-held__chips">' + o.chip({ icoon: 'flask-conical', toon: 'sim', tekst: t('лише симуляція', 'alleen simulatie') }) + o.chip({ icoon: 'timer', tekst: t('крок автопоказу — 25 с', 'stap van de rondleiding — 25 s') }) + '</div></div>' +
      '<div class="hv-so-held__acties">' + (auto ? o.knop({ tekst: t('Зупинити автопоказ', 'Rondleiding stoppen'), icoon: 'circle-stop', soort: 'hoofd', actie: 'so-toonzaal-auto' }) : o.knop({ tekst: t('Автопоказ', 'Automatische rondleiding'), icoon: 'play', soort: 'hoofd', actie: 'so-toonzaal-auto' })) + '</div></section>' +
      o.blok({ id: 'so-tochten', titel: t('Історії', 'Verhalen'), teller: TOCHTEN.length, inhoud: '<div class="hv-so-tochten">' + kaarten + '</div>' }) +
      o.blok({ id: 'so-gezichten', titel: t('Обличчя екранів', 'Wijzerplaten van schermen'), teller: 9, inhoud: '<div class="hv-so-gezichten">' + gezichten + '</div>' + noot('info', t('Обличчя відкривається на полотні; повернути — «Повернути» у сповіщенні або пульт макета.', 'De wijzerplaat opent op het doek; terug met ‘Ongedaan maken’ in de melding of de bediening van de maquette.')) }) + '</div>';
  }
  HV.actie('so-tocht', function (ctx, g) {
    var x = TOCHTEN.filter(function (y) { return y.id === g.tocht; })[0]; if (!x) return;
    var vorige = HV.staat.w.scenario, route = 'instellingen-showroom';
    toonTocht(x, false);
    HV.meld({ maker: SIM, icoon: x.icoon, titel: HV.p(x.naam), tekst: HV.p(x.zin), terug: vorige ? function () { HV.opslag.schrijf('scenario', vorige); HV.scenarios.start(vorige, true); HV.open(route); } : null });
  });
  HV.actie('so-toonzaal-auto', function () {
    if (X.toonzaal.auto) {
      clearInterval(toonzaalKlok); toonzaalKlok = null; X.toonzaal.auto = null;
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Автопоказ вітрини зупинено', 'Rondleiding van de toonzaal gestopt'], soort: 'huis.simulatie' });
      HV.open('instellingen-showroom');
      return;
    }
    X.toonzaal.auto = REEL(); X.toonzaal.stap = 0;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Автопоказ вітрини почато', 'Rondleiding van de toonzaal gestart'], waarom: [TOCHTEN.length + ' історій по 25 с', TOCHTEN.length + ' verhalen van 25 s'], soort: 'huis.simulatie' });
    toonTocht(TOCHTEN[0], true);
    HV.meld({ maker: SIM, icoon: 'presentation', titel: t('Автопоказ іде', 'Rondleiding loopt'), tekst: t('Зупинити — у «Система» → «Вітрина».', 'Stoppen via ‘Systeem’ → ‘Toonzaal’.') });
    clearInterval(toonzaalKlok);
    toonzaalKlok = setInterval(function () {
      if (!X.toonzaal.auto) { clearInterval(toonzaalKlok); return; }
      X.toonzaal.stap = (X.toonzaal.stap + 1) % TOCHTEN.length;
      toonTocht(TOCHTEN[X.toonzaal.stap], true);
    }, 25000);
  });

  // ═════════════════════════ 9. Калькулятор ═════════════════════════
  function bereken(p) {
    var opbrengst = p.zon * 875;                                    // кВт·год на рік (Нідерланди)
    var eigenDeel = Math.min(0.85, 0.3 + (p.batterij ? Math.min(0.42, p.batterij * 0.034) : 0) + (p.warmtepomp === 'ja' ? 0.06 : 0));
    var eigen = Math.min(opbrengst * eigenDeel, p.verbruik + (p.warmtepomp === 'ja' ? p.gas * 9.77 * 0.9 / 4 : 0));
    var terug = Math.max(0, opbrengst - eigen);
    var vergoeding = p.saldering === 'met' ? p.prijs : 0.06;       // з 2027 — без сальдування
    var zonWinst = eigen * p.prijs + terug * vergoeding;
    var wpStroom = p.warmtepomp === 'ja' ? p.gas * 9.77 * 0.9 / 4 : 0; // кВт·год на рік при COP 4
    var wpWinst = p.warmtepomp === 'ja' ? p.gas * 1.35 - wpStroom * p.prijs : 0;
    var investering = p.zon * 1250 + p.batterij * 650 + (p.warmtepomp === 'ja' ? 9500 - 3000 : 0);
    var jaar = zonWinst + wpWinst;
    return { opbrengst: opbrengst, eigen: eigen, terug: terug, eigenDeel: eigen / Math.max(1, opbrengst), zonWinst: zonWinst, wpWinst: wpWinst, wpStroom: wpStroom, investering: investering, jaar: jaar, terugverdien: jaar > 0 ? investering / jaar : null };
  }
  function plannerTab(ctx) {
    var p = X.planner, r = bereken(p);
    var invoer = function (sleutel, icoon, naam, waarde, stap, sub) {
      return '<div class="hv-so-invoer" data-k="so-pl-' + sleutel + '"><span class="hv-so-invoer__teken">' + ic(icoon) + '</span><div class="hv-so-invoer__tekst"><p>' + h(naam) + '</p>' + (sub ? '<small>' + h(sub) + '</small>' : '') + '</div>' + o.stapper({ actie: 'so-planner', gegevens: { sleutel: sleutel }, stap: stap, label: naam, waarde: waarde }) + '</div>';
    };
    var jaren = [];
    for (var j = 0; j <= 15; j++) jaren.push({ label: String(2026 + j), waarde: Math.round(-r.investering + r.jaar * j), toon: -r.investering + r.jaar * j >= 0 ? 'zon' : 'net-in', vink: r.terugverdien != null && j === Math.ceil(r.terugverdien) });
    var grafiek = HV.grafiek.staven({ id: 'so-planner-cumulatief', titel: t('Гроші за 15 років', 'Geld over 15 jaar'), eenheid: '€', decimalen: 0, tikken: 3, staven: jaren,
      samenvatting: r.terugverdien != null ? t('Окупиться за ' + HV.getal(r.terugverdien, 1) + ' р.; далі щороку ' + HV.euro(r.jaar, 0) + '.', 'Terugverdiend in ' + HV.getal(r.terugverdien, 1) + ' jaar; daarna elk jaar ' + HV.euro(r.jaar, 0) + '.') : t('За цих умов витрати не окупаються.', 'Onder deze voorwaarden verdienen de kosten zich niet terug.') });
    var varianten = p.varianten.length ? HV.tabel([t('Варіант', 'Variant'), t('Вкладення', 'Investering'), t('Щороку', 'Per jaar'), t('Окупність', 'Terugverdientijd'), ''], p.varianten.map(function (v, i) {
      var b = bereken(v);
      return [t('Варіант ', 'Variant ') + (i + 1) + ' · ' + HV.getal(v.zon, 1) + ' ' + t('кВт', 'kW') + ' · ' + v.batterij + ' ' + t('кВт·год', 'kWh') + (v.warmtepomp === 'ja' ? ' · ' + t('ТН', 'WP') : ''), HV.euro(b.investering, 0), HV.euro(b.jaar, 0), b.terugverdien != null ? HV.getal(b.terugverdien, 1) + ' ' + t('р.', 'jr') : '—',
        o.knop({ tekst: t('Вилучити', 'Verwijderen'), icoon: 'trash-2', soort: 'stil', klein: true, actie: 'so-planner-weg', gegevens: { i: i } })];
    })) : '';
    return '<div class="hv-so" data-k="so-planner"><div class="hv-so-raster"><div class="hv-so-kolom">' +
      o.blok({ id: 'so-pl-invoer', titel: t('Що є в домі', 'Wat het huis heeft'), vast: true, inhoud: kaart('so-pl-invoerkaart',
        invoer('zon', 'sun', t('Сонячні панелі', 'Zonnepanelen'), HV.maat(p.zon, t('кВт', 'kW'), 1), 0.4, t('у демо-домі 4,2 кВт', 'in de demowoning 4,2 kW')) +
        invoer('batterij', 'battery', t('Домашня батарея', 'Thuisbatterij'), HV.maat(p.batterij, t('кВт·год', 'kWh'), 0), 1) +
        invoer('verbruik', 'plug', t('Споживання на рік', 'Verbruik per jaar'), HV.maat(p.verbruik, t('кВт·год', 'kWh'), 0), 200) +
        invoer('gas', 'flame', t('Газ на рік', 'Gas per jaar'), HV.maat(p.gas, t('м³', 'm³'), 0), 100) +
        invoer('prijs', 'euro', t('Ціна електрики', 'Stroomprijs'), HV.euro(p.prijs), 0.01, t('за кВт·год', 'per kWh')) +
        veld(t('Тепловий насос', 'Warmtepomp'), o.segment({ label: t('Тепловий насос', 'Warmtepomp'), waarde: p.warmtepomp, actie: 'so-planner-keuze', gegevens: { sleutel: 'warmtepomp' }, opties: [{ id: 'nee', label: t('Без нього', 'Zonder') }, { id: 'ja', label: t('Замість газу', 'In plaats van gas'), icoon: 'heater' }] })) +
        veld(t('Сальдування', 'Saldering'), o.segment({ label: t('Сальдування', 'Saldering'), waarde: p.saldering, actie: 'so-planner-keuze', gegevens: { sleutel: 'saldering' }, opties: [{ id: 'met', label: t('До 2027', 'Tot 2027') }, { id: 'zonder', label: t('З 2027 — без нього', 'Vanaf 2027 — zonder') }] }))) }) + '</div>' +
      '<div class="hv-so-kolom">' + kaart('so-pl-uitkomst', '<div class="hv-so-cijfers">' +
        o.getal({ maat: 'l', label: t('Окупність', 'Terugverdientijd'), waarde: r.terugverdien != null ? HV.maat(r.terugverdien, t('р.', 'jr'), 1) : '—', toon: r.terugverdien != null && r.terugverdien < 10 ? 'zon' : null }) +
        o.getal({ maat: 'l', label: t('Щороку', 'Per jaar'), waarde: HV.euro(r.jaar, 0) }) +
        o.getal({ maat: 'm', label: t('Вкладення', 'Investering'), waarde: HV.euro(r.investering, 0), sub: h(p.warmtepomp === 'ja' ? t('з дотацією 3000 € на насос', 'met 3000 € subsidie op de pomp') : '') }) +
        o.getal({ maat: 'm', label: t('Своє сонце', 'Eigen zon'), waarde: HV.procent(r.eigenDeel * 100), sub: h(HV.maatTekst(Math.round(r.eigen), t('кВт·год', 'kWh'), 0) + t(' з ', ' van ') + HV.maatTekst(Math.round(r.opbrengst), t('кВт·год', 'kWh'), 0)) }) + '</div>' + grafiek +
        knoppen(o.knop({ tekst: t('Зберегти варіант', 'Variant bewaren'), icoon: 'bookmark-plus', actie: 'so-planner-bewaar', uit: p.varianten.length >= 3 }), o.knop({ tekst: t('Як у демо-домі', 'Zoals de demowoning'), icoon: 'house', soort: 'stil', actie: 'so-planner-demo' })) +
        noot('info', t('Оцінка, не порада: ціни прикладні, вироблення 875 кВт·год на кВт, тепловий насос із COP 4.', 'Een schatting, geen advies: prijzen zijn voorbeelden, opbrengst 875 kWh per kW, warmtepomp met COP 4.'))) +
      (varianten ? kaart('so-pl-varianten', kop('columns-3', t('Порівняння варіантів', 'Varianten vergelijken'), o.chip({ tekst: p.varianten.length + ' / 3' })) + varianten) : '') + '</div></div></div>';
  }
  var PLANNER_GRENS = { zon: [0, 12, 1], batterij: [0, 20, 0], verbruik: [1000, 9000, 0], gas: [0, 3000, 0], prijs: [0.05, 0.6, 2] };
  HV.actie('so-planner', function (ctx, g) {
    var k = g.sleutel, gr = PLANNER_GRENS[k]; if (!gr) return;
    var v = X.planner[k] + Number(g.richting) * Number(g.stap);
    X.planner[k] = Math.round(Math.max(gr[0], Math.min(gr[1], v)) * Math.pow(10, gr[2])) / Math.pow(10, gr[2]);
    HV.teken();
  });
  HV.actie('so-planner-keuze', function (ctx, g) { X.planner[g.sleutel] = g.waarde; HV.teken(); });
  // «Як у демо-домі»: кнопка завжди відповідає — або повертає значення (з «Повернути»), або каже, що вони вже такі.
  var PLANNER_DEMO = { zon: 4.2, batterij: 10, warmtepomp: 'ja', verbruik: 3400, gas: 1100, prijs: 0.27, saldering: 'zonder' };
  HV.actie('so-planner-demo', function () {
    var p = X.planner, velden = Object.keys(PLANNER_DEMO), was = {};
    var anders = velden.filter(function (k) { return p[k] !== PLANNER_DEMO[k]; });
    if (!anders.length) {
      HV.meld({ icoon: 'house', titel: t('Уже як у демо-домі', 'Al zoals de demowoning'), tekst: t('Змініть значення ліворуч, щоб порівняти інший варіант.', 'Wijzig een waarde links om een andere variant te vergelijken.') });
      return;
    }
    velden.forEach(function (k) { was[k] = p[k]; p[k] = PLANNER_DEMO[k]; });
    HV.meld({ icoon: 'house', titel: t('Значення демо-дому повернено', 'Waarden van de demowoning teruggezet'), tekst: t('Змінено полів: ', 'Gewijzigde velden: ') + anders.length + t('. Збережені варіанти лишилися.', '. Bewaarde varianten zijn gebleven.'),
      terug: function () { velden.forEach(function (k) { p[k] = was[k]; }); HV.teken(); } });
    HV.teken();
  }, { kijk: true });
  HV.actie('so-planner-bewaar', function () {
    var p = X.planner; if (p.varianten.length >= 3) return;
    var kopie = { zon: p.zon, batterij: p.batterij, warmtepomp: p.warmtepomp, verbruik: p.verbruik, gas: p.gas, prijs: p.prijs, saldering: p.saldering };
    p.varianten.push(kopie);
    HV.meld({ icoon: 'bookmark-plus', titel: t('Варіант збережено', 'Variant bewaard'), tekst: t('Порівняння — під результатом.', 'De vergelijking staat onder de uitkomst.'), terug: function () { p.varianten = p.varianten.filter(function (x) { return x !== kopie; }); HV.teken(); } });
    HV.teken();
  });
  HV.actie('so-planner-weg', function (ctx, g) { X.planner.varianten.splice(Number(g.i), 1); HV.teken(); });

  // ═════════════════════════ 10. Складники — живий довідник hv-* ═════════════════════════
  // Кожен зразок — справжній компонент ядра чи зони; його дії перенаправлено на «so-zaal»: довідник показує,
  // що спрацює в продукті, але нічого не змінює. Графіки, «i» і згортання лишаються справжніми.
  var ZAAL_ECHT = ['grafiek-tabel', 'uitleg', 'uitleg-sluit', 'blok', 'bericht', 'so-zaal-kleur', 'so-zaal-echt', 'so-zaal-ga'];
  function zaal(html, onderdeel) {
    return String(html)
      .replace(/data-actie="([a-z0-9-]+)"/g, function (m, a) { return ZAAL_ECHT.indexOf(a) >= 0 ? m : 'data-actie="so-zaal" data-oorspr="' + a + '" data-onderdeel="' + h(onderdeel) + '"'; })
      .replace(/data-(schuif|wijzer)="([a-z0-9-]+)"/g, 'data-$1="so-zaal-schuif"');
  }
  var STATEN = {
    rust: ['спокій', 'rust'], hover: ['наведення', 'aanwijzen'], focus: ['фокус', 'focus'], druk: ['натиск', 'indrukken'], wacht: ['очікує', 'wacht'], bezig: ['виконується', 'bezig'],
    mislukt: ['не виконано', 'niet uitgevoerd'], verouderd: ['застаріле', 'verouderd'], onbereikbaar: ['недоступне', 'niet bereikbaar'], verondersteld: ['стан припущено', 'toestand verondersteld'],
    sim: ['симуляція', 'simulatie'], uit: ['вимкнено · немає доступу', 'uit · geen toegang'], slaapt: ['спить', 'slaapt'], aan: ['увімкнено', 'aan'], ritueel: ['з ритуалом', 'met ritueel']
  };
  var zaalTeller = 0;
  function proef(id, wijzig) {
    var a = JSON.parse(JSON.stringify(HV.staat.w.apparaten[id]));
    a.id = 'zaal' + (++zaalTeller);
    if (wijzig) wijzig(a);
    return a;
  }
  /** Зразок: staat — ключ зі STATEN або власна пара [uk, nl]; klas — 'hover' | 'focus' | 'druk' | 'uit' | 'vol' (на всю ширину картки). */
  function staal(staat, html, klas) {
    return '<div class="hv-so-staal' + (klas ? ' hv-so-staal--' + klas : '') + '"><span class="hv-so-staal__label">' + h(HV.p(Array.isArray(staat) ? staat : STATEN[staat] || [staat, staat])) + '</span><div class="hv-so-staal__vak">' + html + (klas === 'uit' ? '<span class="hv-so-staal__slot">' + ic('lock', { maat: 's' }) + h(t('немає доступу', 'geen toegang')) + '</span>' : '') + '</div></div>';
  }
  /**
   * Картка складника. extra: { waar:[uk,nl] — де компонент живе в макеті, klas — його назва в зоні, naar — маршрут «Відкрити в розділі»,
   * echt:{ tekst, wat } — кнопка, що відкриває справжній шар ядра поверх довідника }.
   */
  function zaalKaart(id, naam, wat, stalen, breed, extra) {
    var voet = '';
    if (extra) {
      voet = '<footer class="hv-so-zaalkaart__voet">' +
        (extra.waar ? '<p class="hv-so-zaalkaart__bron">' + ic('map-pin', { maat: 's' }) + '<span>' + h(HV.p(extra.waar)) + (extra.klas ? ' · <code>' + h(extra.klas) + '</code>' : '') + '</span></p>' : '') +
        (extra.echt ? o.knop({ tekst: extra.echt.tekst, icoon: 'square-arrow-out-up-right', klein: true, actie: 'so-zaal-echt', gegevens: { wat: extra.echt.wat } }) : '') +
        (extra.naar ? o.knop({ tekst: t('Відкрити в розділі', 'In het onderdeel openen'), icoon: 'arrow-right', soort: 'stil', klein: true, actie: 'so-zaal-ga', gegevens: { naar: extra.naar } }) : '') + '</footer>';
    }
    return '<section class="hv-kaart hv-so-zaalkaart' + (breed ? ' is-breed' : '') + '" data-k="so-zaal-' + id + '" aria-labelledby="so-zaal-t-' + id + '"><header class="hv-so-zaalkaart__kop"><h3 id="so-zaal-t-' + id + '"><code>' + h(naam) + '</code></h3><p>' + h(wat) + '</p></header>' +
      '<div class="hv-so-stalen' + (breed ? ' is-breed' : '') + '">' + stalen.join('') + '</div>' + voet + '</section>';
  }

  // ── 10a. Шари ядра в довіднику: псевдонім кореня зі справжніми правилами стилю ──
  // Аркуш (hv-laag), діалог небезпечної дії (hv-gevaar), Команда (hv-opdracht) й аварійний шар (hv-nood) живуть у корені
  // hv-lagen, і ядро шукає їх за кореневим класом (пастка фокуса, Escape, повернення фокуса). Зразок на сторінці не може
  // носити той самий клас — клавіатура застрягла б у зразку. Тому корінь зразка має псевдонім hv-so-<назва>, а правила для
  // псевдоніма виводяться зі справжніх правил ядра під час першого показу довідника: зразок малюють ті самі декларації
  // (разом із контейнерними запитами), а не їхня копія. Дочірні класи (hv-gevaar__kop, hv-rail, hv-nood__knop…) — справжні.
  var SCHIJN_RE = /\.hv-(laag|gevaar|opdracht|nood)(?![\w-])/;
  var SCHIJN_ALLE = new RegExp(SCHIJN_RE.source, 'g');
  var schijnKlaar = false;
  function selectorDelen(s) { // коми верхнього рівня, поза дужками :is() і :not()
    var uit = [], diep = 0, begin = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '(') diep++; else if (c === ')') diep--;
      else if (c === ',' && !diep) { uit.push(s.slice(begin, i)); begin = i + 1; }
    }
    uit.push(s.slice(begin));
    return uit;
  }
  function schijnRegels(regels) {
    var uit = [];
    for (var i = 0; i < regels.length; i++) {
      var r = regels[i];
      if (r.selectorText != null && r.style) {
        if (!SCHIJN_RE.test(r.selectorText)) continue;
        // зі списку селекторів беремо лише ті, що стосуються шару: решта вже має своє правило й свій порядок каскаду
        var sel = selectorDelen(r.selectorText).filter(function (x) { return SCHIJN_RE.test(x); }).map(function (x) { return x.replace(SCHIJN_ALLE, '.hv-so-$1').trim(); });
        uit.push(sel.join(', ') + ' { ' + r.style.cssText + ' }');
      } else if (r.cssRules && r.cssRules.length) {
        var binnen = schijnRegels(r.cssRules), tekst = r.cssText || '';
        if (binnen.length && tekst.indexOf('{') > 0) uit.push(tekst.slice(0, tekst.indexOf('{')) + '{\n' + binnen.join('\n') + '\n}');
      }
    }
    return uit;
  }
  function zorgSchijn() {
    if (schijnKlaar || typeof document === 'undefined') return;
    schijnKlaar = true;
    var regels = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      var lijst = null;
      try { lijst = document.styleSheets[i].cssRules; } catch (e) { lijst = null; } // чужий аркуш стилів недоступний
      if (lijst) regels = regels.concat(schijnRegels(lijst));
    }
    if (!regels.length) return;
    var stijl = document.createElement('style');
    stijl.setAttribute('data-hv-so-schijn', '');
    stijl.textContent = regels.join('\n');
    (document.head || document.documentElement).appendChild(stijl);
  }

  // ── 10b. Зональні компоненти: справжня розмітка з render() розділу, а не копія ──
  // Компонент, що належить зоні (план, мапа, режим охорони, пропозиція помічника…), довідник не перемальовує: він викликає
  // render() потрібної вкладки чи вільного аркуша, бере з результату вузол компонента й додає йому клас-псевдонім із назвою
  // плану (hv-landkaart, hv-alarmstand…). Стан, якого зараз немає в домі (виклик із дверей, політ дрона), на час малювання
  // підставляється у світ і одразу повертається; світ, Журнал і сповіщення при цьому не змінюються.
  var zoneCache = { sleutel: '', gezien: 0, uit: {} };
  function uitZone(naam, maak) {
    if (naam in zoneCache.uit) return zoneCache.uit[naam];
    var html = '';
    try { html = maak() || ''; } catch (e) { html = ''; }
    zoneCache.uit[naam] = html;
    return html;
  }
  function kopieVan(x) { return JSON.parse(JSON.stringify(x)); }
  /** Тимчасово замінює поля об'єкта на час fn() і повертає все, як було (також коли fn кидає помилку). */
  function metTijdelijk(obj, velden, fn) {
    var oud = {}, had = {};
    Object.keys(velden).forEach(function (k) { had[k] = Object.prototype.hasOwnProperty.call(obj, k); oud[k] = obj[k]; obj[k] = velden[k]; });
    try { return fn(); } finally { Object.keys(velden).forEach(function (k) { if (had[k]) obj[k] = oud[k]; else delete obj[k]; }); }
  }
  /** Те саме для цілого об'єкта: після fn() він точно такий, як був — і без полів, які дописала зона під час малювання. */
  function metKopie(obj, velden, fn) {
    var oud = kopieVan(obj);
    Object.keys(velden).forEach(function (k) { obj[k] = velden[k]; });
    try { return fn(); } finally { Object.keys(obj).forEach(function (k) { delete obj[k]; }); Object.keys(oud).forEach(function (k) { obj[k] = oud[k]; }); }
  }
  function zoneCtx(ctx, scherm, tab, object) {
    var c = {};
    Object.keys(ctx).forEach(function (k) { c[k] = ctx[k]; });
    c.route = { scherm: scherm, tab: tab, object: object || null, blad: null };
    return c;
  }
  function tabHtml(ctx, scherm, tab, object) {
    var s = HV.schermen[scherm];
    if (!s) return '';
    var tb = (s.tabs || []).filter(function (x) { return x.id === tab; })[0] || s;
    return tb.render ? tb.render(zoneCtx(ctx, scherm, tab, object)) : '';
  }
  function bladVrijHtml(ctx, soort, id) { var b = HV.bladVrij(soort); return b ? b.render(ctx, id) : ''; }
  /** Вузли selector із розмітки. op: { alias — клас-псевдонім плану, aantal — скільки вузлів, snoei:{ selector: скільки лишити }, wikkel — клас батьківського списку }. */
  function knip(html, selector, op) {
    op = op || {};
    if (!html || typeof document === 'undefined') return '';
    var sjabloon = document.createElement('template');
    sjabloon.innerHTML = html;
    var lijst = Array.prototype.slice.call(sjabloon.content.querySelectorAll(selector), 0, op.aantal || 1);
    var uit = lijst.map(function (el) {
      if (op.alias) el.classList.add(op.alias);
      Object.keys(op.snoei || {}).forEach(function (q) {
        Array.prototype.slice.call(el.querySelectorAll(q), op.snoei[q]).forEach(function (x) { x.parentNode.removeChild(x); });
      });
      return el.outerHTML;
    }).join('');
    return uit && op.wikkel ? '<div class="' + op.wikkel + '">' + uit + '</div>' : uit;
  }
  /** Обгортка зонального зразка; порожній результат — чесний порожній стан із назвою місця, де компонент живе. */
  function zone(html, maat, waar) {
    if (!html) return o.leeg({ icoon: 'component', titel: t('Зараз цього стану в домі немає', 'Deze toestand is er nu niet in huis'), tekst: waar ? HV.p(waar) : '' });
    return '<div class="hv-so-zone' + (maat ? ' hv-so-zone--' + maat : '') + '">' + html + '</div>';
  }
  // Дотик у довіднику міг змінити стан зони (розгорнутий запис, «Показати як таблицю») — знімки зон беруться наново.
  if (typeof document !== 'undefined') document.addEventListener('click', function (ev) { if (ev.target && ev.target.closest && ev.target.closest('.hv-so-zaal')) zoneCache.uit = {}; }, true);

  // План малюється в пікселях під ширину свого вікна (зона сама міряє .hv-plan__venster). Перший знімок зроблено ще без
  // вічка в довіднику, тож після показу звіряємо ширину й за потреби беремо знімок наново — так само робить сама зона.
  var planBreedte = null, planGepland = false, planPogingen = 0;
  function planControle() {
    if (planGepland || typeof window === 'undefined') return;
    planGepland = true;
    var stap = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    stap(function () {
      planGepland = false;
      var el = document.querySelector('.hv-so-zaal .hv-plan__venster');
      if (!el || !el.clientWidth) return;
      if (planBreedte != null && Math.abs(el.clientWidth - planBreedte) <= 3) { planPogingen = 0; return; }
      if (planPogingen++ >= 3) return; // ширина не встигає за знімком — не крутимо перерисовку
      planBreedte = el.clientWidth;
      delete zoneCache.uit.plan;
      HV.teken();
    });
  }

  // ── 10c. Зразки шарів ядра ──
  function hemelStaal(fase, binnen) {
    return '<div class="hv-so-hemelstaal' + (fase ? ' hv-so-hemelstaal--' + fase : '') + '"><div class="hv-hemel" aria-hidden="true"><div class="hv-hemel__gloed"></div></div>' + (binnen || '') + '</div>';
  }
  function laagStaal(ctx, id) {
    return HV.bladHtml(ctx, { type: 'apparaat', id: id, deel: 'bediening' })
      .replace('<aside class="hv-laag', '<aside class="hv-so-laag').replace(/role="dialog" aria-modal="(true|false)"/, 'role="group"')
      .replace(/hv-laag-titel/g, 'so-zaal-laag-titel').replace(/laag-tab-/g, 'so-zaal-laag-tab-');
  }
  var houdSec = function (s) { return HV.getal(s, 1) + ' ' + t('с', 's'); };
  /** Рейка утримання в одному зі станів: rust · houdt (половина) · klaar (заповнена) · terug (відпущено раніше). */
  function railStaal(a, icoon, staat) {
    var tekst = a.houd ? HV.p(a.houd) : t('Утримуйте, щоб підтвердити', 'Houd vast om te bevestigen');
    var rest = staat === 'houdt' ? 0.5 : staat === 'klaar' ? 0 : 1.2;
    var woord = HV.p({ rust: ['спокій', 'rust'], houdt: ['утримання', 'vasthouden'], klaar: ['виконано', 'uitgevoerd'], terug: ['скасовано', 'geannuleerd'] }[staat]);
    return '<div class="hv-rail hv-rail--' + a.niveau + (staat === 'houdt' ? ' is-houdt hv-so-rail--half' : staat === 'klaar' ? ' is-houdt' : '') + '" role="img" aria-label="' + h(t('Рейка утримання, ', 'Houdrail, ') + woord + ': ' + tekst + ', ' + houdSec(rest)) + '">' +
      '<span class="hv-rail__vulling" aria-hidden="true"></span><span class="hv-rail__knop" aria-hidden="true">' + ic(staat === 'klaar' ? 'check' : icoon, { maat: 's' }) + '</span>' +
      '<span class="hv-rail__tekst" aria-hidden="true">' + h(tekst) + '</span><span class="hv-rail__tel" aria-hidden="true">' + h(houdSec(rest)) + '</span></div>';
  }
  /** Діалог небезпечної дії: stap — 'houd' (рейка й «Підтвердити») | 'aftel' (відлік 3 с) | 'herbevestig' (підтвердження входу). */
  function gevaarStaal(sleutel, apparaatId, stap) {
    var a = HV.gevaar.actie(sleutel), ap = HV.staat.w.apparaten[apparaatId];
    if (!a || !ap) return '';
    var kritiek = a.niveau === 'kritiek', lijf;
    if (stap === 'herbevestig') {
      lijf = '<div class="hv-herbevestig"><span class="hv-herbevestig__teken">' + ic('key-round', { maat: 'l' }) + '</span><div><p class="hv-herbevestig__tekst">' + h(t('Критична дія потребує підтвердження входу.', 'Een kritieke actie vraagt een bevestiging van je aanmelding.')) + '</p>' +
        '<p class="hv-herbevestig__noot">' + h(t('Підтвердження діє 5 хв для цього сеансу.', 'De bevestiging geldt 5 min voor deze sessie.')) + '</p></div></div>' +
        '<div class="hv-gevaar__knoppen">' + o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'dialoog-annuleer' }) + o.knop({ tekst: t('Підтвердити вхід', 'Aanmelding bevestigen'), icoon: 'key-round', soort: 'hoofd', actie: 'dialoog-herbevestig' }) + '</div>';
    } else {
      lijf = railStaal(a, o.beeld(ap).icoon, 'rust') +
        '<div class="hv-gevaar__knoppen">' + o.knop({ tekst: t('Скасувати', 'Annuleren'), actie: 'dialoog-annuleer' }) +
        '<button type="button" class="hv-knop hv-knop--gewoon hv-gevaar__bevestig' + (stap === 'aftel' ? ' is-aftel' : '') + '" data-actie="dialoog-aftel">' + h(stap === 'aftel' ? t('Виконається через 2 с — зупинити', 'Wordt uitgevoerd over 2 s — stoppen') : t('Підтвердити', 'Bevestigen')) + '</button></div>';
    }
    return '<div class="hv-so-gevaar hv-gevaar--' + a.niveau + '" role="group" aria-label="' + h(t('Зразок діалогу: ', 'Voorbeeld van de dialoog: ') + HV.p(a.naam)) + '">' +
      '<header class="hv-gevaar__kop">' + o.risico(a.niveau, { lang: true }) + '<h2>' + h(HV.p(a.naam)) + '</h2></header>' +
      '<div class="hv-gevaar__gevolg">' + o.gevolgRijen(HV.p(a.gevolg)) + '</div>' +
      '<p class="hv-gevaar__doel"><span>' + h(t('Зачеплено', 'Geraakt')) + '</span> ' + h(HV.p(ap.naam) + ' · ' + HV.p(HV.staat.kamer(ap.kamer).naam)) + (kritiek ? ' <span class="hv-punt" aria-hidden="true">·</span> ' + h(t('рейка й підтвердження входу', 'rail en bevestiging van aanmelding')) : '') + '</p>' + lijf + '</div>';
  }
  var NOOD_STAAL = {
    rook: { icoon: 'alarm-smoke', kamer: 'keuken', titel: ['Дим: ', 'Rook: '], wat: ['Датчик диму спрацював', 'De rookmelder is afgegaan'], doe: ['Вимкнути духовку', 'Oven uitzetten'] },
    lek: { icoon: 'droplet', kamer: 'bijkeuken', titel: ['Вода: ', 'Water: '], wat: ['Датчик протікання спрацював', 'De lekkagesensor is afgegaan'], doe: ['Зупинити пральну машину', 'Wasmachine stoppen'] }
  };
  function noodStaal(soort) {
    var n = NOOD_STAAL[soort], w = HV.staat.w, thuis = HV.kijk.thuis().map(function (m) { return HV.p(m.naam); });
    var titel = HV.p(n.titel) + HV.p(HV.staat.kamer(n.kamer).naam).toLowerCase();
    var knop = function (tekst, hoofd) { return '<button type="button" class="hv-nood__knop' + (hoofd ? ' hv-nood__knop--hoofd' : '') + '" data-actie="' + (hoofd ? 'nood-zie' : 'nood-doe') + '">' + h(tekst) + '</button>'; };
    return '<div class="hv-so-nood" role="group" aria-label="' + h(t('Зразок аварійного шару: ', 'Voorbeeld van de noodlaag: ') + titel) + '"><div class="hv-nood__binnen"><span class="hv-nood__teken">' + ic(n.icoon, { maat: 'xl' }) + '</span>' +
      '<h2>' + h(titel) + '</h2><p class="hv-nood__wat">' + h(HV.p(n.wat) + t(' о ', ' om ') + HV.tijd(w.tijd - 120000) + ' · ' + HV.duur(2) + t(' тому', ' geleden')) + '</p>' +
      '<p class="hv-nood__thuis">' + h(thuis.length ? t('Удома: ', 'Thuis: ') + thuis.join(', ') : t('Удома нікого немає.', 'Er is niemand thuis.')) + '</p>' +
      '<div class="hv-nood__knoppen">' + knop(t('Бачу — приглушити сирену', 'Gezien — sirene dempen'), true) + knop(HV.p(n.doe)) + knop(t('Зупинити самостійні дії', 'Zelfstandige acties stoppen')) + '</div>' +
      '<p class="hv-nood__sim">' + ic('flask-conical', { maat: 's' }) + h(t('Симуляція: жоден справжній пристрій не змінено.', 'Simulatie: er is geen echt apparaat veranderd.')) + '</p></div></div>';
  }
  var OPDRACHT_STAAL = [['lightbulb', ['Вимкнути все світло', 'Alle lampen uit']], ['moon', ['На добраніч', 'Welterusten']], ['log-out', ['Йду', 'Ik ga weg']], ['log-in', ['Я вдома', 'Ik ben thuis']], ['cctv', ['Камери', 'Camera’s']], ['door-open', ['Що відчинено?', 'Wat staat open?']]];
  function opdrachtStaal(gevolg) {
    var lijf = gevolg
      ? '<div class="hv-opdracht__gevolg"><h3>' + h(HV.p(OPDRACHT_STAAL[1][1])) + '</h3>' + o.gevolgRijen(t('Що станеться: світло внизу й телевізор вимкнуться, двері замкнуться, опалення знизиться до 17,5 °C. Пов’язано з: охорону сцена не ставить і не знімає. Як повернути: «Повернути» протягом 10 с.', 'Wat er gebeurt: het licht beneden en de televisie gaan uit, de deuren gaan op slot, de verwarming zakt naar 17,5 °C. Hangt samen met: de scène schakelt het alarm niet in of uit. Terugdraaien: ‘Ongedaan maken’ binnen 10 s.')) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Назад', 'Terug'), actie: 'opdracht-kies' }) + o.knop({ tekst: t('Виконати', 'Uitvoeren'), soort: 'hoofd', actie: 'opdracht-voer' }) + '</div></div>'
      : '<div class="hv-opdracht__werkwoorden">' + OPDRACHT_STAAL.map(function (x) { return '<button type="button" class="hv-opdracht__werkwoord" data-actie="opdracht-kies">' + ic(x[0], { maat: 'l' }) + '<span>' + h(HV.p(x[1])) + '</span></button>'; }).join('') + '</div>';
    return '<div class="hv-so-opdracht" role="group" aria-label="' + h(t('Зразок Команди', 'Voorbeeld van Opdracht')) + '"><div class="hv-opdracht__zoek">' + ic('search') +
      '<input type="text" readonly tabindex="-1" placeholder="' + h(t('Що зробити або знайти?', 'Wat wil je doen of vinden?')) + '" aria-label="' + h(t('Поле Команди — зразок', 'Veld van Opdracht — voorbeeld')) + '">' +
      o.icoonknop({ icoon: 'x', aria: t('Закрити', 'Sluiten'), actie: 'dialoog-annuleer' }) + '</div><div class="hv-opdracht__lijf">' + lijf + '</div></div>';
  }

  // ── 10d. Зональні зразки зі станом, якого зараз може не бути в домі ──
  function pincodeStaal(ctx, invoer, melding) {
    var g = (HV.gezichten || []).filter(function (x) { return x.id === 'deur-toegang'; })[0];
    if (!g) return '';
    var d = HV.ui.lees('gzx-deur', null);
    if (!d) { g.render(ctx); d = HV.ui.lees('gzx-deur', null); }
    if (!d) return '';
    return metKopie(d, { stap: 'code', invoer: invoer, melding: melding || null, fouten: melding ? 1 : 0, sos: 0, pauzeTot: 0 }, function () { return knip(g.render(ctx), '.hv-pincode'); });
  }
  function voorstelStaal(ctx) {
    var w = ctx.staat;
    if (!w.ast) tabHtml(ctx, 'automatiseringen', 'assistent');
    var X = w.ast, a = w.apparaten.torsher;
    if (!X || !X.voorstellen || !X.gesprek || !a) return '';
    var v = { id: 'sozaal', titel: ['Вимкнути світло: вітальня', 'Licht uit: woonkamer'], sleutel: 'licht', niveau: 'gewoon', icoon: 'lightbulb', kop: ['1 лампа, 1 кімната', '1 lamp, 1 kamer'],
      stappen: [{ doel: a.id, mogelijkheid: 'aan', waarde: false, naam: a.naam, kamer: HV.staat.kamer(a.kamer).naam, was: HV.beschrijf(a, 'aan', true), wordt: HV.beschrijf(a, 'aan', false), overslaan: null }],
      samengesteld: null, begrepen: ['вітальня, світло — вимкнути', 'woonkamer, licht — uit'], bronnen: [a.id], stand: 'nieuw', tijd: w.tijd };
    X.voorstellen.sozaal = v;
    X.gesprek.push({ id: 'gsozaal', wie: 'assistent', tijd: w.tijd, kaart: { soort: 'voorstel', voorstel: 'sozaal', taal: ctx.taal } });
    try { return knip(tabHtml(ctx, 'automatiseringen', 'assistent'), '.hv-ast-voorstel', { alias: 'hv-voorstel' }); }
    finally { X.gesprek.pop(); delete X.voorstellen.sozaal; }
  }
  /** Ланцюжок «Чому?» зі справжнього аркуша; якщо Журнал ще порожній (перший запуск) — для одного зразкового запису. */
  function waaromKeten(ctx, id) {
    var w = ctx.staat, knipHet = function (x) { return knip(bladVrijHtml(ctx, 'waarom', x), '.hv-kaart'); };
    if (id) return knipHet(id);
    var proef = { id: 'sozaal', tijd: w.tijd - 600000, maker: { soort: 'knop', naam: ['Кнопка сцен', 'Scèneknop'] }, wat: ['Лампа над столом: увімкнено', 'Lamp boven de tafel: aan'], waarom: ['подвійний натиск', 'dubbel gedrukt'], soort: 'huis.apparaat', gewicht: 'info', gelezen: true, sim: true };
    return metTijdelijk(w, { logboek: [proef] }, function () { return knipHet('sozaal'); });
  }
  function verzoekStaal(ctx) {
    var w = ctx.staat, wacht = (w.verzoeken || []).some(function (v) { return v.stand === 'wacht'; });
    var knipHet = function () { return knip(tabHtml(ctx, 'activiteit', 'meldingen'), '.hv-verzoek'); };
    if (wacht || !w.verzoeken) return knipHet();
    var proef = { id: 'sozaal', uitvoerder: 'claude', sleutel: 'laadpaal.laden', doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, sinds: w.tijd - 60000, tot: w.tijd + 240000, stand: 'wacht',
      wat: ['Зарядити авто о 02:00', 'De auto om 02:00 laden'], waarom: ['найдешевші години: 02:00–05:00', 'de goedkoopste uren: 02:00–05:00'], wordt: ['Авто: 64 % → 80 % до 05:10', 'Auto: 64 % → 80 % om 05:10'] };
    return metTijdelijk(w, { verzoeken: w.verzoeken.concat([proef]) }, knipHet);
  }
  function vluchtbalkStaal(ctx, inLucht) {
    var lijst = ctx.staat.drones || [], d = lijst[0];
    if (!d) return '';
    var vliegt = lijst.filter(function (x) { return x.stand === 'vlucht' || x.stand === 'signaalkwijt'; })[0];
    var knipHet = function () { return knip(tabHtml(ctx, 'garage', 'drones', 'vlucht'), '.hv-vluchtbalk'); };
    // кабіна показує дрон, що летить; іншого стану на час малювання надаємо самі й повертаємо об'єкт точно таким, як був
    if (inLucht) {
      if (vliegt) return knipHet();
      // позиція задана явно: без неї зона вважала б політ початком сценарію й завела б запис польоту
      return metKopie(d, { stand: 'vlucht', fase: 'opstijgen', link: true, x: 39, y: 21, h: 18, v: 3, kop: 305, vluchtS: 95, punt: 0, zweefRest: 0, missie: 'perceel', gps: 17, fotos: 3, signaal: 92, klaar: false, laagGemeld: false, kwijtS: 0, gezienEcht: REEL() }, knipHet);
    }
    return vliegt ? metKopie(vliegt, { stand: 'dock', link: true, fase: null }, knipHet) : knipHet();
  }
  function oproepStaal(ctx) {
    // аркуш виклику цілком: кадр і стан (hv-bev-oproep) та картки швидкої відповіді й дій поруч із ним
    var w = ctx.staat, knipHet = function () { var html = bladVrijHtml(ctx, 'oproep'); return html.indexOf('class="hv-bev-oproep"') >= 0 ? html.replace('class="hv-bev-oproep"', 'class="hv-bev-oproep hv-oproep"') : ''; };
    return w.oproep ? knipHet() : metTijdelijk(w, { oproep: { sinds: w.tijd - 40000, stand: 'belt' } }, knipHet);
  }
  // Сорок дев'ять назв плану §3.9: довідник сам перевіряє, що кожна має картку.
  var PLAN_39 = ('hv-hemel hv-held hv-doorsnede hv-tegel hv-kamerkaart hv-telemetrie hv-laag hv-blok hv-chip hv-nu hv-leeg hv-skelet ' +
    'hv-dagstrook hv-grafiek hv-tabel hv-plan hv-landkaart hv-stempel hv-versheid hv-sim hv-maker hv-waarom ' +
    'hv-schakel hv-schuif hv-wijzer hv-kleur hv-aftel hv-werkmodus hv-laadplan hv-scene hv-huisstand hv-alarmstand ' +
    'hv-risico hv-stand hv-gevaar hv-rail hv-gevolg hv-nood hv-pincode ' +
    'hv-toost hv-bericht hv-meldingen hv-opdracht hv-voorstel hv-verzoek hv-agentkaart hv-regel hv-vluchtbalk hv-oproep').split(' ');

  function onderdelenLijst(ctx) {
    var w = ctx.staat, nu = Date.now();
    zaalTeller = 0;
    zorgSchijn();
    // знімки зон живуть, доки не змінилися мова, роль, профіль, сценарій чи режим — і доки довідник лишається на екрані
    var sleutel = [ctx.taal, ctx.rol, ctx.profiel.id, ctx.dichtheid, w.scenario, w.huisstand, w.gegevens].join('|');
    if (sleutel !== zoneCache.sleutel || nu - zoneCache.gezien > 4000) zoneCache.uit = {};
    zoneCache.sleutel = sleutel; zoneCache.gezien = nu;
    var tegel = function (a, vorm) { return '<div class="hv-tegels hv-so-staal__tegels">' + o.tegel(a, { vorm: vorm || '2x1' }) + '</div>'; };
    var fakeW = function (gegevens, pauze, snelheid) { return { gegevens: gegevens, pauze: !!pauze, snelheid: snelheid || 60, tijd: w.tijd }; };
    var staalNoot = function (tekst) { return '<p class="hv-so-staal__noot">' + h(tekst) + '</p>'; };
    // ── дані для нових груп ──
    var hemelNu = HV.hemel.bereken(w, HV.thema ? HV.thema() : 'licht'), weer = HV.hemel.weer(w), zin = HV.huiszin(ctx);
    var held = function () {
      return o.held({ datum: h(HV.datum(w.tijd)) + ' <span class="hv-punt">·</span> <span class="hv-held__tijd">' + HV.tijd(w.tijd) + '</span>', zin: zin.vol, kort: h(zin.kort),
        chips: o.chip({ icoon: weer.icoon, tekst: weer.tekst }) + o.chip({ icoon: 'users', tekst: t('удома: ', 'thuis: ') + HV.kijk.thuis().length }) + o.chip({ icoon: 'lightbulb', toon: 'aan', tekst: t('світло: ', 'licht: ') + HV.kijk.lampenAan().length }) })
        .replace('<h1 ', '<p ').replace('</h1>', '</p>'); // у довіднику речення героя — не заголовок сторінки
    };
    var rijenBlok = '<div class="hv-rijen hv-rijen--kaart">' + o.rij({ icoon: 'lightbulb', naam: t('Світло', 'Licht'), waarde: h(String(HV.kijk.lampenAan().length)) }) + o.rij({ icoon: 'thermometer', naam: t('Вітальня', 'Woonkamer'), waarde: HV.maat((HV.kijk.temperatuur('woonkamer') || { st: {} }).st.waarde, '°C', 1) }) + '</div>';
    var tabelKamers = HV.tabel([t('Кімната', 'Kamer'), t('Температура', 'Temperatuur'), t('Світло', 'Licht')], ['woonkamer', 'keuken', 'slaapkamer', 'werkkamer'].map(function (id) {
      var tm = HV.kijk.temperatuur(id), v = HV.hemel.venster(id);
      return [HV.p(HV.staat.kamer(id).naam), tm && tm.st.waarde != null ? HV.maat(tm.st.waarde, '°C', 1) : '—', h(v.woord || t('без світла', 'geen lampen'))];
    }));
    var ketenId = (w.logboek.filter(function (r) { return r.keten; })[0] || w.logboek[0] || {}).id;
    var waaromRegel = function (woord, maker) { return '<p class="hv-waarom">' + h(woord) + o.maker(maker) + '</p>'; };
    var slotActie = HV.gevaar.actie('slot.ontgrendelen'), ovenActie = HV.gevaar.actie('oven.aan');
    var groepen = [
      { id: 'basis', naam: ['Основа', 'Basis'], lijst: [
        ['hv-knop', t('Кнопка: одна основна дія на картку, звичайна, тиха; «натиснута» — поточний стан.', 'Knop: één hoofdactie per kaart, gewoon, stil; ‘ingedrukt’ — de huidige stand.'), [
          staal('rust', o.knop({ tekst: t('Основна', 'Hoofd'), soort: 'hoofd', icoon: 'check', actie: 'x' })), staal('rust', o.knop({ tekst: t('Звичайна', 'Gewoon'), actie: 'x' })), staal('rust', o.knop({ tekst: t('Тиха', 'Stil'), soort: 'stil', actie: 'x' })),
          staal('hover', o.knop({ tekst: t('Звичайна', 'Gewoon'), actie: 'x' }), 'hover'), staal('focus', o.knop({ tekst: t('Звичайна', 'Gewoon'), actie: 'x' }), 'focus'), staal('druk', o.knop({ tekst: t('Звичайна', 'Gewoon'), actie: 'x' }), 'druk'),
          staal('wacht', '<span class="hv-so-wachtrand">' + o.knop({ tekst: t('Очікує', 'Wacht'), icoon: 'hourglass', actie: 'x' }) + '</span>'), staal('aan', o.knop({ tekst: t('Замкнено', 'Vergrendeld'), gedrukt: true })), staal('uit', o.knop({ tekst: t('Недоступна', 'Niet beschikbaar'), actie: 'x', uit: true }), 'uit')]],
        ['hv-icoonknop', t('Кнопка лише з іконкою: підпис для читача екрана обов’язковий; лічильник — паперовий.', 'Knop met alleen een icoon: label voor de schermlezer verplicht; teller op papier.'), [
          staal('rust', o.icoonknop({ icoon: 'bell', aria: t('Сповіщення', 'Meldingen'), actie: 'x' })), staal('rust', o.icoonknop({ icoon: 'bell', aria: t('Сповіщення', 'Meldingen'), actie: 'x', teller: 3 })), staal('hover', o.icoonknop({ icoon: 'settings', aria: t('Система', 'Systeem'), actie: 'x' }), 'hover'), staal('focus', o.icoonknop({ icoon: 'settings', aria: t('Система', 'Systeem'), actie: 'x' }), 'focus')]],
        ['hv-chip', t('Паперова пігулка «іконка і слово»: тиха, тонова, фільтр.', 'Papieren pil ‘icoon en woord’: stil, met toon, filter.'), [
          staal('rust', o.chip({ icoon: 'house', tekst: t('тиха', 'stil') })), staal('rust', o.chip({ icoon: 'circle-check', toon: 'ok', tekst: t('справно', 'gezond') })), staal('rust', o.chip({ icoon: 'triangle-alert', toon: 'let-op', tekst: t('увага', 'let op') })), staal('rust', o.chip({ icoon: 'alarm-smoke', toon: 'alarm', tekst: t('тривога', 'alarm') })),
          staal('sim', o.chip({ icoon: 'flask-conical', toon: 'sim', tekst: t('симуляція', 'simulatie') })), staal('rust', o.chip({ icoon: 'sun', toon: 'zon', tekst: '2,1 ' + t('кВт', 'kW') })), staal('rust', o.chip({ icoon: 'battery', toon: 'batterij', tekst: '62 %' })), staal('rust', o.chip({ icoon: 'plug-zap', toon: 'auto', tekst: '7,4 ' + t('кВт', 'kW') })),
          staal('aan', o.chip({ tekst: t('фільтр вибрано', 'filter gekozen'), filter: true, gekozen: true, actie: 'x' })), staal('rust', o.chip({ tekst: t('фільтр', 'filter'), filter: true, actie: 'x' })), staal('hover', o.chip({ tekst: t('фільтр', 'filter'), filter: true, actie: 'x' }), 'hover')]],
        ['hv-segment', t('Одне з кількох: стрілки перемикають; вибране — галочкою й тоном.', 'Eén uit meerdere: pijltjes schakelen; gekozen met vinkje en toon.'), [
          staal('rust', o.segment({ label: t('Режим', 'Stand'), waarde: 'b', actie: 'x', opties: [{ id: 'a', label: t('Вдома', 'Thuis') }, { id: 'b', label: t('Ніч', 'Nacht') }, { id: 'c', label: t('Гості', 'Gasten') }] })), staal('uit', o.segment({ label: t('Режим', 'Stand'), waarde: 'a', actie: 'x', uit: true, opties: [{ id: 'a', label: t('Вдома', 'Thuis') }, { id: 'b', label: t('Ніч', 'Nacht') }] }), 'uit')], true],
        ['hv-werkmodus', t('Режим роботи «Пауза · Розумно · Швидко» для зарядки й батареї.', 'Werkmodus ‘Pauze · Slim · Snel’ voor laden en batterij.'), [staal('rust', o.werkmodus({ waarde: 'slim', actie: 'x' })), staal('uit', o.werkmodus({ waarde: 'pauze', actie: 'x', uit: true }), 'uit')], true],
        ['hv-stapper', t('«−/+» довкола числа: два органи з власними підписами.', '‘−/+’ rond een getal: twee organen met een eigen label.'), [staal('rust', o.stapper({ actie: 'x', label: t('Ціль', 'Doel'), waarde: HV.maat(21, '°C', 1) })), staal('focus', o.stapper({ actie: 'x', label: t('Ціль', 'Doel'), waarde: HV.maat(21, '°C', 1) }), 'focus')], true]
      ] },
      { id: 'schil', naam: ['Небо й каркас', 'Hemel en schil'], lijst: [
        ['hv-hemel', t('Небо за часом дому: чотири фази з м’яким переходом. На «Домі» воно повне, на решті сторінок — тихе; на небі — лише колір тексту.', 'Hemel volgens de huistijd: vier fasen met een zachte overgang. Op ‘Thuis’ vol, op de andere pagina’s stil; op de hemel alleen de tekstkleur.'), [
          staal(['зараз · ' + hemelNu.naam[0], 'nu · ' + hemelNu.naam[1]], hemelStaal(''))].concat(HV.hemel.fasen.map(function (f) { return staal(HV.hemel.faseNaam[f], hemelStaal(f)); })).concat([
          staal(['тихе небо сторінок', 'stille hemel van pagina’s'], hemelStaal('stil'))]), false, { waar: ['Дім', 'Thuis'], naar: 'overzicht' }],
        ['hv-held', t('Герой: речення дому на небі, дата й час дому, паперові чипи. У вузькій колонці сам переходить на коротке речення.', 'Held: de zin van het huis op de hemel, datum en huistijd, papieren chips. In een smalle kolom schakelt hij zelf naar de korte zin.'), [
          // на вузькому полотні обидва зразки були б однакові — лишається один, з коротким реченням
          (ctx.profiel.breedte || 0) >= 700 ? staal(['широка колонка · повне речення', 'brede kolom · volledige zin'], hemelStaal('held', held()), 'vol') : '', staal(['вузька колонка · коротке речення', 'smalle kolom · korte zin'], hemelStaal('held', held()))], true, { waar: ['Дім', 'Thuis'], naar: 'overzicht' }],
        ['hv-doorsnede', t('Дім у розрізі: поверх — рядок, кімната — кнопка; вікно світиться лише за підтвердженого світла.', 'Huis in doorsnede: een verdieping is een rij, een kamer een knop; een raam licht alleen op bij bevestigd licht.'), [
          staal('rust', zone('<div class="hv-kaart hv-kaart--doorsnede">' + HV.hemel.doorsnede(ctx) + '</div>', 'midden'), 'vol')], true, { waar: ['Дім', 'Thuis'], naar: 'overzicht' }],
        ['hv-laag', t('Аркуш керування: скляна оболонка, вміст на папері; три частини «Керування · Історія · Налаштування». На телефоні виїжджає знизу, на комп’ютері стоїть праворуч.', 'Bedieningsblad: glazen omhulsel, inhoud op papier; drie delen ‘Bediening · Geschiedenis · Instellingen’. Op de telefoon schuift het van onderen in, op de computer staat het rechts.'), [
          staal('rust', zone(uitZone('laag', function () { return laagStaal(ctx, 'torsher'); }), 'midden'), 'vol')], true, { echt: { tekst: t('Відкрити справжній аркуш', 'Het echte blad openen'), wat: 'laag' } }],
        ['hv-blok', t('Блок сторінки: назва, лічильник, «i» і згортання; згорнутий показує підсумок одним рядком.', 'Paginablok: naam, teller, ‘i’ en inklappen; ingeklapt toont het één regel samenvatting.'), [
          staal(['розгорнутий', 'open'], o.blok({ id: 'so-zaal-blok-open', titel: t('Зведення', 'Overzicht'), teller: 2, inhoud: rijenBlok, samenvatting: h(t('світло й температура', 'licht en temperatuur')),
            uitleg: t('Що станеться: блок згорнеться до одного рядка. Пов’язано з: вибір запам’ятовується на цьому пристрої. Як повернути: торкніться назви ще раз.', 'Wat er gebeurt: het blok klapt in tot één regel. Hangt samen met: de keuze wordt op dit toestel onthouden. Terugdraaien: tik nog een keer op de naam.') })),
          staal(['згорнутий', 'ingeklapt'], o.blok({ id: 'so-zaal-blok-dicht', titel: t('Стрічка доби', 'Dagstrook'), teller: 5, dicht: true, inhoud: rijenBlok, samenvatting: h(t('останні 18 годин і наступні 6', 'de laatste 18 uur en de volgende 6')) })),
          staal(['без згортання', 'niet inklapbaar'], o.blok({ id: 'so-zaal-blok-vast', titel: t('Зараз важливо', 'Nu belangrijk'), teller: 1, vast: true, inhoud: rijenBlok }))], true]
      ] },
      { id: 'bediening', naam: ['Керування', 'Bediening'], lijst: [
        ['hv-schakel', t('Коло перемикає; квадрат із подвійною рамкою — дія з ритуалом.', 'Een cirkel schakelt; een vierkant met dubbele rand — een actie met ritueel.'), [
          staal('rust', o.schakel({ aan: false, icoon: 'lightbulb', actie: 'x', aria: 'uit' })), staal('aan', o.schakel({ aan: true, icoon: 'lightbulb', toon: 'aan', actie: 'x', aria: 'aan' })), staal('hover', o.schakel({ aan: false, icoon: 'lightbulb', actie: 'x', aria: 'uit' }), 'hover'), staal('focus', o.schakel({ aan: true, icoon: 'lightbulb', toon: 'aan', actie: 'x', aria: 'aan' }), 'focus'),
          staal('wacht', o.schakel({ aan: true, icoon: 'lightbulb', toon: 'aan', staat: 'wacht', actie: 'x', aria: 'wacht' })), staal('bezig', o.schakel({ aan: true, icoon: 'blinds', staat: 'bezig', actie: 'x', aria: 'bezig' })), staal('onbereikbaar', o.schakel({ icoon: 'lightbulb', staat: 'onbereikbaar', actie: 'x', aria: 'weg' })),
          staal('verondersteld', o.schakel({ aan: false, icoon: 'snowflake', toon: 'koud', staat: 'verondersteld', actie: 'x', aria: 'aangenomen' })), staal('verouderd', o.schakel({ aan: true, icoon: 'lightbulb', toon: 'aan', staat: 'verouderd', actie: 'x', aria: 'oud' })), staal('slaapt', o.schakel({ aan: false, icoon: 'heater', staat: 'slaapt', actie: 'x', aria: 'slaapt' })),
          staal('ritueel', o.schakel({ aan: false, icoon: 'lock-keyhole', ritueel: 'kritiek', actie: 'x', aria: t('Замок', 'Slot') })), staal('ritueel', o.schakel({ aan: false, icoon: 'microwave', ritueel: 'gevaarlijk', actie: 'x', aria: t('Духовка', 'Oven') }))]],
        ['hv-schuif', t('Повзунок: доріжка 8 px, бігунок 24 px, «−/+» і число; риска — бажане.', 'Schuif: baan van 8 px, knop van 24 px, ‘−/+’ en getal; streep — gewenst.'), [
          staal('rust', o.schuif({ label: t('Яскравість', 'Helderheid'), waarde: 60, actie: 'x', toon: 'aan', k: 'zs1' })), staal('wacht', o.schuif({ label: t('Яскравість', 'Helderheid'), waarde: 40, gewenst: 75, actie: 'x', toon: 'aan', k: 'zs2' })), staal('uit', o.schuif({ label: t('Гучність', 'Volume'), waarde: 30, actie: 'x', uit: true, k: 'zs3' }), 'uit')], true],
        ['hv-wijzer', t('Диск термостата: ціль — бігунок, виміряне — число в центрі; «−/+» під диском.', 'Thermostaatschijf: doel als knop, meting als getal in het midden; ‘−/+’ eronder.'), [
          staal('bezig', o.wijzer({ doel: 21, gemeten: 20.4, toon: 'warm', bezig: true, actie: 'x', k: 'zw1' })), staal('rust', o.wijzer({ doel: 19, gemeten: 22.1, toon: 'koud', actie: 'x', k: 'zw2' }))], true],
        ['hv-kleur', t('Колір трьома способами: готові, повзунки, коло.', 'Kleur op drie manieren: voorkeuze, schuiven, cirkel.'), [staal('rust', o.kleur({ tint: 32, verzadiging: 85, wijze: X.zaal.kleur, actie: 'x', wijzeActie: 'so-zaal-kleur' }))], true],
        ['hv-aftel', t('Кільце відліку довкола знака й «ще 14 хв».', 'Aftelring rond het teken en ‘nog 14 min’.'), [staal('bezig', o.aftel({ rest: 14, totaal: 40, icoon: 'timer' })), staal('rust', o.aftel({ rest: 0, totaal: 40, icoon: 'timer', klaar: true }))]],
        ['hv-laadplan', t('План зарядки: режим роботи, ціль і виїзд, вікно над стрічкою цін, дозвіл оптимізатора.', 'Laadplan: werkmodus, doel en vertrek, venster boven de prijsstrook, toestemming van de optimalisatie.'), [
          staal('rust', zone(uitZone('laadplan', function () { return o.laadplan ? o.laadplan(ctx).replace('class="hv-en-laadplan"', 'class="hv-en-laadplan hv-laadplan"') : ''; }), 'midden', ['Енергія → Зарядка', 'Energie → Laden']), 'vol')], true, { waar: ['Енергія → Зарядка', 'Energie → Laden'], klas: 'hv-en-laadplan', naar: 'energie-laden' }],
        ['hv-huisstand', t('Режим дому: один із п’яти, поточний — з галочкою; «i» біля кожного каже, що зміниться.', 'Huisstand: één van vijf, de huidige met een vinkje; de ‘i’ bij elke stand zegt wat er verandert.'), [
          staal(['поточний режим — з галочкою', 'huidige stand — met vinkje'], zone(uitZone('huisstand', function () { return knip(bladVrijHtml(ctx, 'huisstand'), '.hv-huisstand'); }), 'smal', ['Дім → Режим дому', 'Thuis → Huisstand']))], true, { waar: ['Дім → Режим дому', 'Thuis → Huisstand'], naar: 'overzicht' }],
        ['hv-alarmstand', t('Режим охорони: чотири режими від «Знято» до «Повна»; причина «не готово» — словами. Зняття охорони — критична дія.', 'Alarmstand: vier standen van ‘Uit’ tot ‘Volledig’; de reden ‘niet gereed’ staat er in woorden. Uitzetten is een kritieke actie.'), [
          staal(['поточний режим — з галочкою', 'huidige stand — met vinkje'], zone(uitZone('alarmstand', function () { return knip(tabHtml(ctx, 'beveiliging', 'stand'), '.hv-bev-standen', { alias: 'hv-alarmstand' }); }), 'smal', ['Безпека → Режим', 'Beveiliging → Stand']))], true, { waar: ['Безпека → Режим', 'Beveiliging → Stand'], klas: 'hv-bev-standen', naar: 'beveiliging' }]
      ] },
      { id: 'tegels', naam: ['Плитки й картки', 'Tegels en kaarten'], lijst: [
        ['hv-tegel', t('Плитка пристрою в усіх спільних станах: коло перемикає, тіло веде в аркуш.', 'Apparaattegel in alle gedeelde toestanden: de cirkel schakelt, het lijf opent het blad.'), [
          staal('rust', tegel(proef('torsher', function (a) { a.st.aan = false; }))), staal('aan', tegel(proef('torsher', function (a) { a.st.aan = true; }))), staal('hover', tegel(proef('keukenlicht')), 'hover'), staal('focus', tegel(proef('keukenlicht')), 'focus'), staal('druk', tegel(proef('keukenlicht')), 'druk'),
          staal('wacht', tegel(proef('torsher', function (a) { a.st.aan = false; a.wacht = { mogelijkheid: 'aan', waarde: true, fase: 'verzonden', sinds: 1, grens: 10 }; }))),
          staal('bezig', tegel(proef('gordijnwoon', function (a) { a.st.positie = 100; a.wacht = { mogelijkheid: 'positie', waarde: 0, fase: 'bezig', voortgang: 46, sinds: 1, grens: 60 }; }))),
          staal('mislukt', tegel(proef('keukenlicht', function (a) { a.mislukt = { echt: nu, tijd: w.tijd }; }))),
          staal('verouderd', tegel(proef('tempzolder'))), staal('onbereikbaar', tegel(proef('zolderlicht'))), staal('verondersteld', tegel(proef('airco'))), staal('slaapt', tegel(proef('radiatorkinder'))),
          staal('ritueel', tegel(proef('voordeurslot', function (a) { a.st.vergrendeld = true; }))), staal('sim', tegel(proef('stekkermedia')) + o.stempel({ waarde: '46 ' + t('Вт', 'W'), leeftijd: 4000, bron: t('Симулятор', 'Simulator') })),
          staal('uit', tegel(proef('tv')), 'uit'), staal('rust', '<div class="hv-tegels hv-so-staal__tegels">' + o.tegel(proef('torsher', function (a) { a.st.aan = true; a.st.helderheid = 60; }), { vorm: '2x2', bediening: true }) + '</div>')], true],
        ['hv-kamerkaart', t('Кімната: назва, температура, знак світла, винятки й «−/+» цілі.', 'Kamer: naam, temperatuur, lichtteken, uitzonderingen en ‘−/+’ van het doel.'), [staal('rust', '<div class="hv-kamers hv-so-staal__kamers">' + o.kamerkaart(HV.staat.kamer('woonkamer')) + '</div>'), staal('hover', '<div class="hv-kamers hv-so-staal__kamers">' + o.kamerkaart(HV.staat.kamer('slaapkamer')) + '</div>', 'hover')], true],
        ['hv-telemetrie', t('Авто, дрон, робот: заряд, запас ходу, три числа й силует.', 'Auto, drone, robot: lading, bereik, drie getallen en silhouet.'), [staal('rust', o.telemetrie({ id: 'zaal-ev', icoon: 'car', naam: HV.p(w.voertuigen[0].naam), stand: t('заряджається', 'laadt'), lading: w.voertuigen[0].lading, doel: 80, bereik: HV.maat(w.voertuigen[0].bereik, t('км', 'km')), getallen: [{ label: t('Потужність', 'Vermogen'), waarde: HV.maat(7.4, t('кВт', 'kW'), 1) }, { label: t('До цілі', 'Tot doel'), waarde: HV.duur(95) }, { label: t('Ціна', 'Prijs'), waarde: HV.euro(0.18) }], actie: 'x' })), staal('verouderd', o.telemetrie({ id: 'zaal-drn', icoon: 'drone', naam: t('Дрон «Лелека»', 'Drone ‘Ooievaar’'), stand: t('у базі', 'in het dock'), lading: 92, staat: 'verouderd', getallen: [{ label: t('Сигнал', 'Signaal'), waarde: '100 %' }] }))], true],
        ['hv-scene', t('Кнопка сцени: дотик виконує; «діє» — коли сцена активна.', 'Scèneknop: een tik voert uit; ‘actief’ als de scène actief is.'), [staal('aan', '<div class="hv-scenes">' + o.scene(w.scenes[0], true) + '</div>'), staal('rust', '<div class="hv-scenes">' + o.scene(w.scenes[1], false) + '</div>'), staal('focus', '<div class="hv-scenes">' + o.scene(w.scenes[2], false) + '</div>', 'focus')]]
      ] },
      { id: 'tijd', naam: ['Час і дані', 'Tijd en gegevens'], lijst: [
        ['hv-dagstrook', t('Стрічка доби: −18…+6 годин; фази неба, присутність, двері, ціна, режим і автори.', 'Dagstrook: −18…+6 uur; hemelfasen, aanwezigheid, deuren, prijs, stand en makers.'), [
          staal('rust', zone(HV.dagstrook ? HV.dagstrook(ctx, { makers: true }) : '', '', ['Дім → Стрічка доби', 'Thuis → Dagstrook']), 'vol')], true, { waar: ['Дім → Стрічка доби', 'Thuis → Dagstrook'], naar: 'overzicht' }],
        ['hv-tabel', t('Таблиця: текстовий відповідник графіка й плану; перший стовпець — заголовок рядка.', 'Tabel: de tekstversie van een grafiek of plattegrond; de eerste kolom is de rijkop.'), [staal('rust', zone(tabelKamers, 'midden'), 'vol')], true],
        ['hv-plan', t('План поверху: кімнати, пристрої на своїх місцях, шари й масштаб; текстовий відповідник — список під планом.', 'Plattegrond: kamers, apparaten op hun plek, lagen en schaal; de tekstversie is de lijst onder de plattegrond.'), [
          staal('rust', zone(uitZone('plan', function () { var v = knip(tabHtml(ctx, 'kamers', 'plattegrond'), '.hv-plan__venster'); return v ? '<div class="hv-plan"><div class="hv-plan__links">' + v + '</div></div>' : ''; }), '', ['Кімнати → План', 'Kamers → Plattegrond']), 'vol')], true, { waar: ['Кімнати → План', 'Kamers → Plattegrond'], naar: 'kamers-plattegrond' }],
        ['hv-landkaart', t('Мапа: ділянка, околиці й регіон; транспорт, геозони й досяжність. Схема — від сервера дому, без зовнішніх мап.', 'Kaart: perceel, omgeving en regio; voertuigen, geozones en bereik. Het schema komt van de server van het huis, zonder externe kaarten.'), [
          staal('rust', zone(uitZone('landkaart', function () { return knip(tabHtml(ctx, 'garage', 'kaart'), '.hv-gar-kaartje', { alias: 'hv-landkaart' }); }), 'midden', ['Гараж → Мапа', 'Garage → Kaart']), 'vol')], true, { waar: ['Гараж → Мапа', 'Garage → Kaart'], klas: 'hv-gar-kaartje', naar: 'garage-kaart' }],
        ['hv-waarom', t('«Чому?»: рядок «хто змінив» в аркуші пристрою й ланцюжок «що запустило · умова · дія» в Журналі.', '‘Waarom?’: de regel ‘wie het wijzigde’ in het apparaatblad en de keten ‘aanleiding · voorwaarde · actie’ in het logboek.'), [
          staal(['людина', 'mens'], waaromRegel(t('Увімкнено: ', 'Aan: '), { soort: 'mens', naam: ['Олена', 'Olena'] })), staal(['автоматизація', 'automatisering'], waaromRegel(t('Змінено: ', 'Gewijzigd: '), 'automatisering')), staal(['агент', 'agent'], waaromRegel(t('Остання зміна: ', 'Laatste wijziging: '), { soort: 'agent', naam: ['Claude', 'Claude'] })),
          staal(['ланцюжок', 'keten'], zone(uitZone('waarom', function () { return waaromKeten(ctx, ketenId); }), 'midden', ['Журнал → «Чому?»', 'Logboek → ‘Waarom?’']), 'vol')], true, { waar: ['Журнал → «Чому?»', 'Logboek → ‘Waarom?’'], naar: 'activiteit' }]
      ] },
      { id: 'staat', naam: ['Стан і походження', 'Toestand en herkomst'], lijst: [
        ['hv-stempel', t('Штамп виміру: значення · вік · джерело.', 'Meetstempel: waarde · leeftijd · bron.'), [staal('rust', o.stempel({ waarde: '20,6 °C', leeftijd: 12000 })), staal('verouderd', o.stempel({ waarde: '15,4 °C', leeftijd: 4380000, staat: 'verouderd' })), staal('sim', o.stempel({ waarde: '640 ppm', leeftijd: 3000, bron: t('Симулятор', 'Simulator') }))]],
        ['hv-versheid', t('Актуальність і шлях даних — завжди зі словом.', 'Actualiteit en pad van de gegevens — altijd met een woord.'), [staal('aan', o.versheid(fakeW('live'))), staal('verouderd', o.versheid(fakeW('verouderd'))), staal('onbereikbaar', o.versheid(fakeW('geen')))]],
        ['hv-sim', t('Чип симуляції з колбою; веде до симулятора.', 'Simulatiechip met kolf; leidt naar de simulator.'), [staal('sim', o.sim(fakeW('live', false, 60))), staal('rust', o.sim(fakeW('live', true))), staal('focus', o.sim(fakeW('live', false, 600)), 'focus')]],
        ['hv-maker', t('Знак автора з іменем: вісім авторів.', 'Makerteken met naam: acht makers.'), ['mens', 'knop', 'automatisering', 'agent', 'simulator', 'dienst', 'optimalisatie', 'systeem'].map(function (m) { return staal('rust', o.maker(m === 'mens' ? { soort: 'mens', naam: ['Олена', 'Olena'] } : m === 'agent' ? { soort: 'agent', naam: ['Claude', 'Claude'] } : m)); }), true],
        ['hv-getal', t('Велике число з малою одиницею й підписом.', 'Groot getal met een kleine eenheid en label.'), [staal('rust', o.getal({ maat: 'l', label: t('Зараз', 'Nu'), waarde: HV.euro(0.24), sub: h(t('за кВт·год', 'per kWh')) })), staal('rust', o.getal({ maat: 'm', label: t('Сонце', 'Zon'), waarde: HV.maat(2.1, t('кВт', 'kW'), 1), toon: 'zon' }))]],
        ['hv-later', t('Штамп «пізніше»: функцію показано чесно, з етапом.', 'Stempel ‘later’: de functie eerlijk getoond, met fase.'), [staal('rust', o.later(t('пізніше · етап 12', 'later · fase 12'))), staal('rust', o.later())]]
      ] },
      { id: 'risico', naam: ['Ризик', 'Risico'], lijst: [
        ['hv-risico', t('Знак рівня дії зі словом.', 'Teken van het actieniveau met een woord.'), ['gewoon', 'gevoelig', 'gevaarlijk', 'kritiek'].map(function (n) { return staal('rust', o.risico(n)); })],
        ['hv-stand', t('Дозвіл «Вимкнено · Питати · Завжди» для одного виконавця й однієї дії; «!» біля небезпечних.', 'Toestemming ‘Uit · Vragen · Altijd’ voor één uitvoerder en één actie; ‘!’ bij gevaarlijke.'), [
          staal('rust', o.stand({ uitvoerder: 'claude', actie: HV.gevaar.actie('laadpaal.laden'), rol: 'eigenaar' })), staal('ritueel', o.stand({ uitvoerder: 'claude', actie: HV.gevaar.actie('slot.ontgrendelen'), rol: 'eigenaar' })), staal('uit', o.stand({ uitvoerder: 'claude', actie: HV.gevaar.actie('slot.ontgrendelen'), rol: 'kind' }))], true],
        ['hv-gevolg', t('Підказка-наслідок «i» і пояснення ризику «!» — відкриваються на папері.', 'Gevolguitleg ‘i’ en risico-uitleg ‘!’ — openen op papier.'), [staal('rust', o.gevolg(t('Що станеться: лампа ввімкнеться. Пов’язано з: сцена «Вечір». Як повернути: один дотик.', 'Wat er gebeurt: de lamp gaat aan. Hangt samen met: de scène ‘Avond’. Terugdraaien: één tik.'))), staal('ritueel', o.gevolg(HV.p(HV.gevaar.actie('slot.ontgrendelen').risico), { soort: 'uitroep', kop: t('Ризик', 'Risico') })), staal('aan', o.gevolg(HV.p(HV.gevaar.actie('slot.ontgrendelen').risico), { soort: 'uitroep', vast: 'kritiek' }))]],
        ['hv-gevaar', t('Діалог небезпечної дії на папері: рівень, наслідок, зачеплене; рейка утримання й «Підтвердити» з відліком 3 с рівноправні. Критична дія просить ще й підтвердження входу.', 'Dialoog voor een gevaarlijke actie op papier: niveau, gevolg, wat geraakt wordt; de houdrail en ‘Bevestigen’ met 3 s aftellen zijn gelijkwaardig. Een kritieke actie vraagt ook een bevestiging van je aanmelding.'), [
          staal(['небезпечна', 'gevaarlijk'], zone(gevaarStaal('oven.aan', 'oven', 'houd'))), staal(['критична', 'kritiek'], zone(gevaarStaal('slot.ontgrendelen', 'voordeurslot', 'houd'))),
          staal(['відлік «Підтвердити»', 'aftellen ‘Bevestigen’'], zone(gevaarStaal('oven.aan', 'oven', 'aftel'))), staal(['підтвердження входу', 'aanmelding bevestigen'], zone(gevaarStaal('slot.ontgrendelen', 'voordeurslot', 'herbevestig')))], true,
          { echt: { tekst: t('Спробувати справжній діалог', 'De echte dialoog proberen'), wat: 'gevaarlijk' } }],
        ['hv-rail', t('Рейка утримання 1,2 с: подвійна рамка — ознака ритуалу; заливка йде зліва направо, відпускання скасовує.', 'Houdrail van 1,2 s: de dubbele rand is het teken van het ritueel; de vulling loopt van links naar rechts, loslaten annuleert.'), [
          staal(['спокій', 'rust'], railStaal(slotActie, 'lock-keyhole', 'rust') + staalNoot(t('Дотик нічого не виконує: рейку треба втримати.', 'Een tik voert niets uit: de rail moet je vasthouden.'))),
          staal(['утримання', 'vasthouden'], railStaal(slotActie, 'lock-keyhole', 'houdt') + staalNoot(t('Заливка росте, відлік іде до нуля.', 'De vulling groeit, de teller loopt naar nul.'))),
          staal(['виконано', 'uitgevoerd'], railStaal(slotActie, 'lock-keyhole', 'klaar') + staalNoot(t('Рейку заповнено: дія йде далі, діалог закривається.', 'De rail is vol: de actie gaat door, de dialoog sluit.'))),
          staal(['скасовано', 'geannuleerd'], railStaal(slotActie, 'lock-keyhole', 'terug') + staalNoot(t('Відпущено раніше: заливка зникла, нічого не виконано.', 'Te vroeg losgelaten: de vulling is weg, er is niets uitgevoerd.'))),
          staal(['небезпечна дія', 'gevaarlijke actie'], railStaal(ovenActie, 'microwave', 'rust') + staalNoot(t('Тон попередження замість тону помилки.', 'De waarschuwingstoon in plaats van de fouttoon.')))], true,
          { echt: { tekst: t('Спробувати справжню рейку', 'De echte rail proberen'), wat: 'kritiek' } }],
        ['hv-nood', t('Аварійний шар: суцільний, з рамкою 4 px, на всіх екранах; три дії й чесна позначка симуляції.', 'Noodlaag: volledig dekkend, met een rand van 4 px, op alle schermen; drie acties en een eerlijk simulatiemerk.'), [
          staal(['дим', 'rook'], zone(noodStaal('rook')), 'vol'), staal(['вода', 'water'], zone(noodStaal('lek')), 'vol')], true, { waar: ['Система → Симулятор → сценарій «Дим»', 'Systeem → Simulator → scenario ‘Rook’'], naar: 'instellingen-simulator' }],
        ['hv-pincode', t('Код на панелі біля дверей: чотири цифри, великі клавіші; п’ять помилок — пауза 5 хв.', 'Code op het paneel bij de deur: vier cijfers, grote toetsen; vijf fouten — 5 min pauze.'), [
          staal(['порожньо', 'leeg'], zone(uitZone('pin0', function () { return pincodeStaal(ctx, ''); }), 'pin', ['Профіль «Двері» → Вхід', 'Profiel ‘Deur’ → Toegang'])),
          staal(['дві цифри', 'twee cijfers'], zone(uitZone('pin2', function () { return pincodeStaal(ctx, '24'); }), 'pin', ['Профіль «Двері» → Вхід', 'Profiel ‘Deur’ → Toegang'])),
          staal(['хибний код', 'onjuiste code'], zone(uitZone('pinfout', function () { return pincodeStaal(ctx, '', t('Хибний код · спроба 2 з 5', 'Onjuiste code · poging 2 van 5')); }), 'pin', ['Профіль «Двері» → Вхід', 'Profiel ‘Deur’ → Toegang']))], true, { waar: ['Профіль «Двері» → Вхід', 'Profiel ‘Deur’ → Toegang'] }]
      ] },
      { id: 'meldingen', naam: ['Повідомлення', 'Berichten'], lijst: [
        ['hv-toost', t('Спливне сповіщення на папері: автор, два рядки, «Повернути» 10 с.', 'Pop-upmelding op papier: maker, twee regels, ‘Ongedaan maken’ 10 s.'), [
          staal('rust', '<div class="hv-so-staal__toost">' + o.toost({ id: 'zt1', gewicht: 'info', titel: t('Торшер: увімкнено', 'Staande lamp: aan'), tekst: t('вимкнено → увімкнено', 'uit → aan'), maker: { soort: 'mens', naam: ['Олена', 'Olena'] }, terug: true }) + '</div>'),
          staal('wacht', '<div class="hv-so-staal__toost">' + o.toost({ id: 'zt2', gewicht: 'belangrijk', icoon: 'circle-help', titel: t('Чекає на вас', 'Wacht op jou'), tekst: t('Агент Claude: зарядка авто', 'Agent Claude: auto laden'), maker: { soort: 'agent', naam: ['Claude', 'Claude'] } }) + '</div>'),
          staal('mislukt', '<div class="hv-so-staal__toost">' + o.toost({ id: 'zt3', gewicht: 'alarm', titel: t('Дим на кухні', 'Rook in de keuken'), tekst: t('Аварійний шар на всіх екранах.', 'Noodlaag op alle schermen.'), maker: 'simulator' }) + '</div>')], true],
        ['hv-bericht', t('Запис Журналу: хто, що, чому, було → стало; розгортається.', 'Logboekregel: wie, wat, waarom, was → werd; klapt open.'), [staal('rust', '<ul class="hv-berichten">' + w.logboek.slice(0, 2).map(function (r) { return o.bericht(r, { open: HV.ui.lees('bericht', null) === r.id }); }).join('') + '</ul>')], true],
        ['hv-nu', t('«Зараз важливо»: до трьох рядків «знак · факт · дія».', '‘Nu belangrijk’: tot drie regels ‘teken · feit · actie’.'), [staal('rust', o.nu([{ id: 'zn1', soort: 'aandacht', maker: 'simulator', icoon: 'door-open', sinds: w.tijd - 42 * 60000, tekst: ['У спальні відчинено вікно, а опалення гріє', 'In de slaapkamer staat het raam open terwijl de verwarming aan is'], acties: [{ naam: 'x', hoofd: true, label: ['Знизити до 15 °C', 'Verlagen naar 15 °C'] }] }, { id: 'zn2', soort: 'verzoek', maker: 'agent', icoon: 'plug-zap', sinds: w.tijd - 5 * 60000, tekst: ['Агент Claude просить зарядити авто о 02:00', 'Agent Claude vraagt de auto om 02:00 te laden'], acties: [{ naam: 'x', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'] }] }]))], true],
        ['hv-leeg', t('Порожній стан: що тут буде й одна дія.', 'Lege toestand: wat hier komt en één actie.'), [staal('rust', o.leeg({ icoon: 'history', titel: t('Ще немає записів', 'Nog geen regels'), tekst: t('Кожна дія з’явиться тут.', 'Elke actie komt hier.'), actie: { tekst: t('До кімнат', 'Naar kamers'), actie: 'x' } }))]],
        ['hv-skelet', t('Скелет за формою вмісту без блиску.', 'Skelet in de vorm van de inhoud, zonder glans.'), [staal('wacht', o.skelet('tegels', 3)), staal('wacht', o.skelet('rijen', 2))], true]
      ] },
      { id: 'ai', naam: ['Активність і ШІ', 'Activiteit en AI'], lijst: [
        ['hv-meldingen', t('Центр сповіщень: один ряд ваги, решта фільтрів — за кнопкою; кожен запис розгортається.', 'Meldingencentrum: één rij voor gewicht, de overige filters achter de knop; elke regel klapt open.'), [
          staal('rust', zone(uitZone('meldingen', function () { return knip(bladVrijHtml(ctx, 'meldingen'), '.hv-meldingen', { snoei: { '.hv-berichten > li': 3 } }); }), 'midden'), 'vol')], true, { echt: { tekst: t('Відкрити центр сповіщень', 'Het meldingencentrum openen'), wat: 'meldingen' } }],
        ['hv-opdracht', t('Команда: поле пошуку й шість швидких дій; перед виконанням — картка наслідку.', 'Opdracht: een zoekveld en zes snelle acties; vóór het uitvoeren een kaart met het gevolg.'), [
          staal(['швидкі дії', 'snelle acties'], zone(opdrachtStaal(false), 'midden'), 'vol'), staal(['наслідок перед виконанням', 'gevolg vóór het uitvoeren'], zone(opdrachtStaal(true), 'midden'), 'vol')], true, { echt: { tekst: t('Відкрити Команду', 'Opdracht openen'), wat: 'opdracht' } }],
        ['hv-voorstel', t('Намір помічника: що зміниться «було → стане», рівень дії, дозвіл і «Виконати · Змінити · Відхилити».', 'Voornemen van de assistent: wat er verandert ‘was → wordt’, het actieniveau, de toestemming en ‘Uitvoeren · Wijzigen · Afwijzen’.'), [
          staal('rust', zone(uitZone('voorstel', function () { return voorstelStaal(ctx); }), 'midden', ['Автоматика → Помічник', 'Automatisering → Assistent']), 'vol')], true, { waar: ['Автоматика → Помічник', 'Automatisering → Assistent'], klas: 'hv-ast-voorstel', naar: 'automatiseringen-assistent' }],
        ['hv-verzoek', t('Запит «Питати»: хто просить, що зміниться й чому; «Схвалити раз» або «Відхилити».', 'Verzoek ‘Vragen’: wie het vraagt, wat er verandert en waarom; ‘Eén keer goedkeuren’ of ‘Afwijzen’.'), [
          staal('wacht', zone(uitZone('verzoek', function () { return verzoekStaal(ctx); }), 'midden', ['Журнал → Сповіщення', 'Logboek → Meldingen']), 'vol')], true, { waar: ['Журнал → Сповіщення', 'Logboek → Meldingen'], naar: 'activiteit' }],
        ['hv-agentkaart', t('Картка агента: стан, що йому дозволено й що він зробив сьогодні.', 'Agentkaart: de stand, wat hij mag en wat hij vandaag deed.'), [
          staal('rust', zone(uitZone('agentkaart', function () { return knip(tabHtml(ctx, 'automatiseringen', 'agenten'), '.hv-ast-agentkaart', { alias: 'hv-agentkaart', aantal: 2, wikkel: 'hv-ast-agentkaarten' }); }), '', ['Автоматика → Агенти й погодження', 'Automatisering → Agenten en goedkeuringen']), 'vol')], true,
          { waar: ['Автоматика → Агенти й погодження', 'Automatisering → Agenten en goedkeuringen'], klas: 'hv-ast-agentkaart', naar: 'automatiseringen-agenten' }],
        ['hv-regel', t('Рядок правила: перемикач, речення «коли — то», стан і останній запуск.', 'Regel van een automatisering: schakelaar, de zin ‘als — dan’, de stand en de laatste run.'), [
          staal('rust', zone(uitZone('regel', function () { var html = tabHtml(ctx, 'automatiseringen', 'regels'), rijen = ['is-actief', 'is-loopt', 'is-concept', 'is-quarantaine'].map(function (k) { return knip(html, '.hv-regel.' + k); }).join(''); return rijen ? '<div class="hv-regels">' + rijen + '</div>' : ''; }), '', ['Автоматика → Правила', 'Automatisering → Regels']), 'vol')], true, { waar: ['Автоматика → Правила', 'Automatisering → Regels'], naar: 'automatiseringen' }],
        ['hv-vluchtbalk', t('Смуга польоту: стан дрона, заряд, сигнал і висота; у польоті — три дії безпеки.', 'Vluchtbalk: de stand van de drone, accu, signaal en hoogte; in de lucht — drie veiligheidsacties.'), [
          staal(['у доку', 'in het dock'], zone(uitZone('vlucht0', function () { return vluchtbalkStaal(ctx, false); }), '', ['Гараж → Безпілотники → Кабіна', 'Garage → Drones → Cockpit']), 'vol'),
          staal(['у польоті', 'in de lucht'], zone(uitZone('vlucht1', function () { return vluchtbalkStaal(ctx, true); }), '', ['Гараж → Безпілотники → Кабіна', 'Garage → Drones → Cockpit']), 'vol')], true, { waar: ['Гараж → Безпілотники → Кабіна', 'Garage → Drones → Cockpit'], naar: 'garage-drones-vlucht' }],
        ['hv-oproep', t('Виклик із дверей: кадр камери, швидка відповідь, «Відчинити…» як критична дія й «Відхилити».', 'Oproep van de deur: camerabeeld, snel antwoord, ‘Openen…’ als kritieke actie en ‘Weigeren’.'), [
          staal(['дзвонить', 'belt aan'], zone(uitZone('oproep', function () { return oproepStaal(ctx); }), 'midden', ['Безпека → Доступ', 'Beveiliging → Toegang']), 'vol')], true, { waar: ['Безпека → Доступ', 'Beveiliging → Toegang'], klas: 'hv-bev-oproep', naar: 'beveiliging-toegang' }]
      ] },
      { id: 'grafieken', naam: ['Графіки', 'Grafieken'], lijst: [
        ['hv-grafiek · lijn', t('Лінія з маркерами й прямим підписом; «Показати як таблицю».', 'Lijn met markeringen en een direct label; ‘Als tabel tonen’.'), [staal('rust', HV.grafiek.lijn({ id: 'zaal-lijn', titel: t('Температура', 'Temperatuur'), eenheid: '°C', x: { min: 0, max: 6, tikken: [{ x: 0, label: '08:00' }, { x: 6, label: '14:00' }] }, reeksen: [{ naam: t('Вітальня', 'Woonkamer'), toon: 'warm', punten: [[0, 18.2], [1, 19], [2, 20.1], [3, 20.6], [4, 20.4], [5, 20.8], [6, 20.6]] }, { naam: t('Надворі', 'Buiten'), toon: 'koud', punten: [[0, 4], [1, 5], [2, 7], [3, 8], [4, 9], [5, 9], [6, 9]] }], samenvatting: t('Вітальня тримає ціль; надворі тепліє.', 'De woonkamer houdt het doel; buiten wordt het warmer.') }))], true],
        ['hv-grafiek · staven', t('Стовпці, також під нулем; найдешевший — з позначкою.', 'Staven, ook onder nul; de goedkoopste met een vinkje.'), [staal('rust', HV.grafiek.staven({ id: 'zaal-staven', titel: t('Ціна', 'Prijs'), eenheid: '€', decimalen: 2, tikken: 2, staven: [0.21, 0.14, 0.03, -0.02, 0.04, 0.21].map(function (p, i) { return { label: pad2(10 + i) + ':00', waarde: p, toon: 'net-in', vink: p < 0, nu: i === 2 }; }), samenvatting: t('О 13:00 ціна від’ємна.', 'Om 13:00 is de prijs negatief.') }))], true],
        ['hv-grafiek · toestanden', t('Смуги станів у часі.', 'Toestandsbanen in de tijd.'), [staal('rust', HV.grafiek.toestanden({ id: 'zaal-toest', titel: t('Світло', 'Licht'), van: 0, tot: 10, nu: 10, tikken: [{ x: 0, label: '04:00' }, { x: 10, label: '14:00' }], format: function (x) { return String(x); }, banen: [{ naam: t('Торшер', 'Staande lamp'), stukken: [{ van: 1, tot: 3, toon: 'aan', label: HV.woord.aan() }, { van: 6, tot: 9, toon: 'aan', label: HV.woord.aan() }] }] }))], true],
        ['hv-grafiek · ring', t('Кільце потоків, кожен сегмент підписано словом.', 'Ring van stromen, elk segment met een woord.'), [staal('rust', HV.grafiek.ring({ id: 'zaal-ring', titel: t('Куди йде енергія', 'Waar de energie heen gaat'), midden: { waarde: HV.maat(1.8, t('кВт', 'kW'), 1), label: t('дім', 'huis') }, delen: [{ naam: t('Сонце', 'Zon'), waarde: 1.1, tekst: '1,1', toon: 'zon' }, { naam: t('Мережа', 'Net'), waarde: 0.5, tekst: '0,5', toon: 'net-in' }, { naam: t('Батарея', 'Batterij'), waarde: 0.2, tekst: '0,2', toon: 'batterij' }], klein: true }))]],
        ['hv-grafiek · vlak', t('Область під лінією — для потужності й накопичення.', 'Vlak onder de lijn — voor vermogen en opbouw.'), [staal('rust', HV.grafiek.lijn({ id: 'zaal-vlak', titel: t('Сонце', 'Zon'), eenheid: t('кВт', 'kW'), x: { min: 0, max: 6, tikken: [{ x: 0, label: '08:00' }, { x: 6, label: '14:00' }] }, reeksen: [{ naam: t('Вироблення', 'Opbrengst'), toon: 'zon', vlak: true, punten: [[0, 0.2], [1, 0.8], [2, 1.6], [3, 2.3], [4, 2.1], [5, 2.6], [6, 2.2]] }], samenvatting: t('До полудня вироблення росте.', 'Tot de middag groeit de opbrengst.') }))], true],
        ['hv-grafiek · warmtekaart', t('Теплокарта: п’ять щаблів одного тону, число в кожній клітинці.', 'Warmtekaart: vijf treden van één toon, het getal in elk vak.'), [staal('rust', HV.grafiek.warmtekaart({ id: 'zaal-warmte', titel: t('Споживання, середнє за 6 год', 'Verbruik, gemiddeld per 6 u'), eenheid: t('кВт', 'kW'), decimalen: 1, rijen: [t('пн', 'ma'), t('вт', 'di'), t('ср', 'wo')], kolommen: ['00', '06', '12', '18'], waarden: [[0.3, 0.6, 0.9, 1.8], [0.3, 0.7, 0.5, 2.1], [0.4, 0.6, 1.2, null]], samenvatting: t('Темніша клітинка — більше значення; прочерк — проміжок ще не настав.', 'Een donkerder vak is een hogere waarde; een streep — dit blok is nog niet begonnen.') }))], true],
        ['hv-vonk', t('Мініграфік у рядку без осей.', 'Minigrafiek in een regel, zonder assen.'), [staal('rust', '<span class="hv-so-vonk">' + HV.grafiek.vonk([3, 5, 4, 7, 6, 9, 8], 'zon') + '</span>'), staal('rust', '<span class="hv-so-vonk">' + HV.grafiek.vonk([9, 7, 8, 5, 6, 3, 4], 'koud') + '</span>')]]
      ] },
      { id: 'systeem', naam: ['Система', 'Systeem'], lijst: [
        ['hv-klok', t('Керування часом дому: пауза, швидкість, «Зрівняти з годинником».', 'Bediening van de huistijd: pauze, snelheid, ‘Gelijkzetten met de klok’.'), [staal('rust', klok(ctx, true))], true],
        ['hv-scenario', t('Рядок сценарію з реєстру: стан, запуск, подробиці.', 'Scenarioregel uit het register: stand, start, details.'), [staal('aan', '<ul class="hv-so-scenarios">' + scenarioRij(HV.scenarios.vind('avond'), true) + '</ul>'), staal('rust', '<ul class="hv-so-scenarios">' + scenarioRij(HV.scenarios.vind('rook'), false) + '</ul>')], true],
        ['hv-gezondheid', t('Картка стану адаптера: причина людською мовою й одна дія.', 'Kaart met de stand van de adapter: reden in gewone taal en één actie.'), [staal('rust', gezondheid(ctx, true))]],
        ['hv-verbindingsketen', t('Ланцюжок зв’язку з п’яти ланок із затримкою й станом.', 'Verbindingsketen van vijf schakels met vertraging en stand.'), [staal('rust', keten(ctx))], true],
        ['hv-nieuw-banner', t('Банер «Знайдено N нових пристроїв».', 'Banner ‘N nieuwe apparaten gevonden’.'), [staal('rust', '<div class="hv-so-banner">' + ic('package-plus') + '<div class="hv-so-banner__tekst"><p class="hv-so-banner__titel">' + h(t('Знайдено 3 нові пристрої', '3 nieuwe apparaten gevonden')) + '</p></div>' + o.knop({ tekst: t('Додати', 'Toevoegen'), soort: 'hoofd', actie: 'x' }) + '</div>')], true],
        ['hv-koppelwizard', t('Кроки майстра нового пристрою.', 'Stappen van de wizard voor een nieuw apparaat.'), [staal('bezig', '<ol class="hv-so-stapbalk is-voortgang">' + WIZARD_STAPPEN.map(function (s, i) { return '<li class="' + (i < 2 ? 'is-klaar' : i === 2 ? 'is-nu' : '') + '"><span>' + (i < 2 ? ic('check', { maat: 's' }) : i + 1) + '</span>' + h(HV.p(s)) + '</li>'; }).join('') + '</ol>')], true],
        ['hv-koppelcode', t('Код сполучення екрана з 6 цифр.', 'Koppelcode van een scherm met 6 cijfers.'), [staal('rust', '<div class="hv-so-code">' + '482913'.split('').map(function (c, i) { return (i === 3 ? '<span class="hv-so-code__kier" aria-hidden="true"></span>' : '') + '<span class="hv-so-code__cijfer">' + c + '</span>'; }).join('') + '</div>')]],
        ['hv-profielminiatuur', t('Мініатюра профілю в справжніх пропорціях.', 'Profielminiatuur in echte verhoudingen.'), ['wand', 'tv', 'strook', 'rond', 'inkt'].map(function (p) { return staal('rust', '<span class="hv-so-staal__mini">' + miniatuur(p) + '</span>'); })]
      ] }
    ];
    planControle();
    return groepen;
  }
  function onderdelenTab(ctx) {
    var filter = HV.ui.lees('so-ond', 'alle');
    var groepen = onderdelenLijst(ctx);
    var aantal = 0, stalen = 0;
    var namen = [];
    groepen.forEach(function (g) { g.lijst.forEach(function (c) { aantal++; stalen += c[2].filter(Boolean).length; namen.push(c[0]); }); });
    // назва плану має картку, якщо є картка з цією назвою або з її різновидом («hv-grafiek · lijn»)
    var ontbreekt = PLAN_39.filter(function (n) { return !namen.some(function (x) { return x === n || x.indexOf(n + ' ') === 0; }); });
    var STATEN_TABEL = [['С', ['спокій', 'rust'], ['--panel, рамка 1 px --line', '--panel, rand 1 px --line']], ['Н', ['наведення', 'aanwijzen'], ['--surface, лише з вказівником', '--surface, alleen met aanwijzer']], ['Ф', ['фокус', 'focus'], ['кільце --focus 2 px, відступ 2', 'ring --focus 2 px, afstand 2']], ['Т', ['натиск', 'indrukken'], ['--surface2, 120 мс', '--surface2, 120 ms']],
      ['О', ['очікує', 'wacht'], ['пунктир 6/4, що пульсує, слово «очікує»', 'stippellijn 6/4 die pulseert, woord ‘wacht’']], ['Р', ['виконується', 'bezig'], ['суцільний контур, напрям і відсоток', 'doorlopende rand, richting en procent']], ['В', ['не виконано', 'niet uitgevoerd'], ['контур 2 px --fout і знак хрестика', 'rand 2 px --fout en kruisteken']],
      ['З', ['застаріле', 'verouderd'], ['значення --muted, вік жирним', 'waarde --muted, leeftijd vet']], ['Х', ['недоступне', 'niet bereikbaar'], ['пунктир 12/6 із розривом, вилка', 'stippellijn 12/6 met onderbreking, stekker']], ['П', ['стан припущено', 'toestand verondersteld'], ['кільце пунктиром 2/3 і слово', 'ring met stippels 2/3 en woord']], ['М', ['симуляція', 'simulatie'], ['позначка з колбою', 'merkteken met kolf']], ['Б', ['заблоковано', 'geblokkeerd'], ['--muted, замок і причина словами', '--muted, slot en reden in woorden']]];
    var legenda = '<div class="hv-so-staten" data-k="so-staten">' + STATEN_TABEL.map(function (s) { return '<div class="hv-so-staten__cel"><span class="hv-so-staten__letter">' + h(s[0]) + '</span><span><strong>' + h(HV.p(s[1])) + '</strong><small>' + h(HV.p(s[2])) + '</small></span></div>'; }).join('') + '</div>';
    var probeer = '<div class="hv-so-probeer" data-k="so-probeer">' +
      '<div class="hv-so-probeer__cel"><span class="hv-so-staal__label">hv-schakel</span>' + o.schakel({ aan: X.zaal.schakel, icoon: 'lightbulb', toon: 'aan', actie: 'so-zaal-live', gegevens: { veld: 'schakel' }, aria: t('Спробуйте перемикач', 'Probeer de schakelaar') }) + '</div>' +
      '<div class="hv-so-probeer__cel"><span class="hv-so-staal__label">hv-werkmodus</span>' + o.werkmodus({ waarde: X.zaal.segment, actie: 'so-zaal-live', gegevens: { veld: 'segment' } }) + '</div>' +
      '<div class="hv-so-probeer__cel"><span class="hv-so-staal__label">hv-stapper</span>' + o.stapper({ actie: 'so-zaal-live', gegevens: { veld: 'stapper' }, stap: 0.5, label: t('Ціль', 'Doel'), waarde: HV.maat(X.zaal.stapper, '°C', 1) }) + '</div>' +
      '<div class="hv-so-probeer__cel hv-so-probeer__cel--breed"><span class="hv-so-staal__label">hv-schuif</span>' + o.schuif({ label: t('Спробуйте повзунок', 'Probeer de schuif'), waarde: X.zaal.schuif, actie: 'so-zaal-live-schuif', toon: 'aan', k: 'so-probeer-schuif' }) + '</div></div>';
    var filters = '<div class="hv-filter hv-so-filter" role="group" aria-label="' + h(t('Група компонентів', 'Groep van onderdelen')) + '">' + o.chip({ tekst: t('Усі', 'Alle'), filter: true, gekozen: filter === 'alle', actie: 'ui', gegevens: { naam: 'so-ond', waarde: 'alle' } }) +
      groepen.map(function (g) { return o.chip({ tekst: HV.p(g.naam) + ' · ' + g.lijst.length, filter: true, gekozen: filter === g.id, actie: 'ui', gegevens: { naam: 'so-ond', waarde: g.id } }); }).join('') + '</div>';
    var lijf = groepen.filter(function (g) { return filter === 'alle' || g.id === filter; }).map(function (g) {
      return '<section class="hv-so-zaalgroep" data-k="so-zg-' + g.id + '"><h2 class="hv-so-zaalgroep__kop">' + h(HV.p(g.naam)) + '</h2><div class="hv-so-zaalraster">' +
        g.lijst.map(function (c) { return zaal(zaalKaart(c[0].replace(/[^a-z0-9]+/g, ''), c[0], c[1], c[2], c[3], c[4]), c[0]); }).join('') + '</div></section>';
    }).join('');
    return '<div class="hv-so hv-so-zaal" data-k="so-onderdelen">' +
      '<section class="hv-so-held" data-k="so-held-zaal"><div class="hv-so-held__getal"><span class="hv-so-held__n">' + aantal + '</span><span class="hv-so-held__woord">' + h(HV.meervoud(aantal, ['складник', 'складники', 'складників'], ['onderdeel', 'onderdelen'])) + '</span></div>' +
      '<div class="hv-so-held__tekst"><p class="hv-so-held__zin">' + h(t('Живий довідник: ' + stalen + ' зразків у темі, мові й щільності цього екрана. Дотик до зразка показує, яку дію він виконав би.', 'Levend naslagwerk: ' + stalen + ' voorbeelden in het thema, de taal en de dichtheid van dit scherm. Een tik op een voorbeeld laat zien welke actie het zou uitvoeren.')) + '</p>' +
      '<div class="hv-so-held__chips">' + o.chip({ icoon: 'component', tekst: t('компоненти ядра й зони', 'onderdelen van kern en zone') }) + o.chip({ icoon: 'palette', tekst: t('лише токени кольорів', 'alleen kleurtokens') }) +
      o.chip({ icoon: ontbreekt.length ? 'triangle-alert' : 'circle-check', toon: ontbreekt.length ? 'let-op' : 'ok', tekst: t('бібліотека плану: ', 'bibliotheek van het plan: ') + (PLAN_39.length - ontbreekt.length) + t(' із ', ' van ') + PLAN_39.length }) + '</div>' +
      (ontbreekt.length ? '<p class="hv-so-held__mist">' + h(t('Ще без картки: ', 'Nog zonder kaart: ')) + '<code>' + h(ontbreekt.join(', ')) + '</code></p>' : '') + '</div></section>' +
      o.blok({ id: 'so-zaal-staten', titel: t('Дванадцять спільних станів', 'Twaalf gedeelde toestanden'), teller: 12, dicht: true, samenvatting: h(t('спокій, наведення, фокус, натиск, очікує, виконується…', 'rust, aanwijzen, focus, indrukken, wacht, bezig…')), inhoud: kaart('so-statenkaart', legenda) }) +
      o.blok({ id: 'so-zaal-probeer', titel: t('Спробуйте', 'Probeer'), inhoud: kaart('so-probeerkaart', probeer + noot('info', t('Ці чотири органи працюють по-справжньому, але керують лише собою.', 'Deze vier organen werken echt, maar bedienen alleen zichzelf.'))) }) +
      filters + lijf + '</div>';
  }
  HV.actie('so-zaal', function (ctx, g) {
    HV.meld({ icoon: 'component', titel: t('Зразок: ', 'Voorbeeld: ') + (g.onderdeel || 'hv-*'), tekst: t('У продукті тут спрацює дія «' + (g.oorspr || '—') + '». У довіднику вона нічого не змінює.', 'In het product voert dit de actie ‘' + (g.oorspr || '—') + '’ uit. In het naslagwerk verandert er niets.') });
  });
  HV.actie('so-zaal-ga', function (ctx, g) { ctx.open(g.naar); }, { kijk: true });
  // «Справжній» шар поверх довідника: аркуш, центр сповіщень, Команда й діалог небезпечної дії з рейкою. Ритуал проходить
  // по-справжньому, але сама дія не виконується — довідник нічого не змінює в домі.
  HV.actie('so-zaal-echt', function (ctx, g) {
    var w = ctx.staat;
    if (g.wat === 'laag') ctx.blad('apparaat:torsher');
    else if (g.wat === 'meldingen') ctx.blad('meldingen');
    else if (g.wat === 'opdracht') HV.acties.opdracht(ctx, {});
    else if (g.wat === 'gevaarlijk' || g.wat === 'kritiek') {
      if (HV.zonderVerbinding()) { HV.meldZonderVerbinding(); return; }
      var kritiek = g.wat === 'kritiek';
      HV.schil.gevaar({ actie: HV.gevaar.actie(kritiek ? 'slot.ontgrendelen' : 'oven.aan'), apparaat: w.apparaten[kritiek ? 'voordeurslot' : 'oven'] }).then(function (ja) {
        HV.meld({ icoon: 'component', titel: ja ? t('Ритуал пройдено', 'Ritueel doorlopen') : t('Скасовано', 'Geannuleerd'),
          tekst: ja ? t('У довіднику сама дія не виконується: у домі нічого не змінилося.', 'In het naslagwerk wordt de actie zelf niet uitgevoerd: in huis is niets veranderd.') : t('Нічого не виконано.', 'Er is niets uitgevoerd.') });
      });
    }
  }, { kijk: true });
  HV.actie('so-zaal-schuif', function (ctx, g) { if (g.fase === 'klaar') HV.meld({ icoon: 'component', titel: t('Зразок повзунка', 'Voorbeeld van een schuif'), tekst: t('Значення: ', 'Waarde: ') + g.waarde + t('. У продукті команда піде на відпусканні.', '. In het product gaat de opdracht bij loslaten.') }); });
  HV.actie('so-zaal-kleur', function (ctx, g) { X.zaal.kleur = g.waarde; HV.teken(); });
  HV.actie('so-zaal-live', function (ctx, g) {
    var z = X.zaal;
    if (g.veld === 'schakel') z.schakel = !z.schakel;
    else if (g.veld === 'segment') z.segment = g.waarde;
    else if (g.veld === 'stapper') z.stapper = Math.max(5, Math.min(30, z.stapper + Number(g.richting) * 0.5));
    HV.teken();
  });
  HV.actie('so-zaal-live-schuif', function (ctx, g) { if (g.fase === 'klaar') { X.zaal.schuif = Number(g.waarde); HV.teken(); } });

  // ───────────────────────── Реєстрація вкладок ─────────────────────────
  // Той самий id замінює заглушку з nog-niet.js; інші вкладки «Система» лишаються за іншими авторами.
  [
    { id: 'schermen', titel: ['Екрани', 'Schermen'], adres: '/instellingen/schermen', render: schermenTab },
    { id: 'integraties', titel: ['Інтеграції', 'Integraties'], adres: '/instellingen/integraties', render: integratiesTab },
    { id: 'simulator', titel: ['Симулятор', 'Simulator'], adres: '/instellingen/simulator', render: simulatorTab },
    { id: 'gegevens', titel: ['Дані', 'Gegevens'], adres: '/instellingen/gegevens', render: gegevensTab },
    { id: 'geheimen', titel: ['Секрети', 'Geheimen'], adres: '/instellingen/geheimen', render: geheimenTab },
    { id: 'diagnose', titel: ['Діагностика', 'Diagnose'], adres: '/instellingen/diagnose', render: diagnoseTab },
    { id: 'toegankelijkheid', titel: ['Доступність', 'Toegankelijkheid'], adres: '/instellingen/toegankelijkheid', render: toegankelijkheidTab },
    { id: 'showroom', titel: ['Вітрина', 'Toonzaal'], adres: '/instellingen/showroom', render: toonzaalTab },
    { id: 'planner', titel: ['Калькулятор', 'Rekenhulp'], adres: '/instellingen/planner', render: plannerTab },
    { id: 'onderdelen', titel: ['Складники', 'Onderdelen'], adres: '/instellingen/onderdelen', render: onderdelenTab }
  ].forEach(function (tab) { HV.tab('instellingen', tab); });
})(window.HV = window.HV || {});
