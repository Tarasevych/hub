// Gevaarmatrix en toestemmingen (§3.8 van het plan, §10 van de ontwerptaal).
//
// 1) Рівень дії (звичайна · чутлива · небезпечна · критична) залежить від дії й напряму. Він визначає ЛИШЕ знак і ритуал
//    для людини; дозволів він не обмежує.
// 2) Дозвіл hv-stand — окремо для кожного виконавця (сцени, автоматизації, оптимізатор, кожен агент) і кожної дії:
//    «Вимкнено · Питати · Завжди». Типово — «Вимкнено». Усі три режими доступні власникові для будь-якої дії.
// 3) Змінює лише роль «власник». Агент дозволів не змінює взагалі: функції для цього в його наборі немає —
//    HV.gevaar.zetStand приймає тільки дію людини з роллю «власник».
(function (HV) {
  'use strict';

  var G = 'gewoon', V = 'gevoelig', Z = 'gevaarlijk', K = 'kritiek';

  // Дії: sleutel, для яких класів, можливість, умова (напрям), рівень, назва, і тексти для небезпечних та критичних:
  // gevolg — «Що станеться · Пов'язано з · Як повернути»; risico — «Що може статися · Хто зможе це запускати · Як вимкнути».
  var acties = [
    { sleutel: 'slot.ontgrendelen', soorten: ['slot'], mogelijkheid: 'vergrendeld', als: function (a, v) { return v === false; }, niveau: K,
      naam: ['Відімкнути двері', 'Deur ontgrendelen'],
      gevolg: ['Що станеться: вхідні двері відімкнуться і їх зможе відчинити будь-хто. Пов’язано з: нічна охорона стежить за цими дверима. Як повернути: «Замкнути» — один дотик.', 'Wat er gebeurt: de voordeur gaat van het slot en iedereen kan haar openen. Hangt samen met: het nachtalarm bewaakt deze deur. Terugdraaien: ‘Vergrendelen’ — één tik.'],
      risico: ['Що може статися: двері відімкнуться, коли вдома нікого немає. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de deur gaat van het slot terwijl er niemand thuis is. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'slot.vergrendelen', soorten: ['slot'], mogelijkheid: 'vergrendeld', als: function (a, v) { return v !== false; }, niveau: G, naam: ['Замкнути двері', 'Deur vergrendelen'] },
    { sleutel: 'ingang.openen', soorten: ['garagedeur', 'poort'], mogelijkheid: 'open', als: function (a, v) { return !!v; }, niveau: K,
      naam: ['Відчинити ворота', 'Poort of garagedeur openen'],
      gevolg: ['Що станеться: ворота відчиняться й лишаться відчиненими, доки їх не зачинять. Пов’язано з: у гаражі стоять велосипеди й зарядна станція. Як повернути: «Зачинити» — перед рухом буде відлік 5 с.', 'Wat er gebeurt: de poort gaat open en blijft open tot iemand haar sluit. Hangt samen met: in de garage staan de fietsen en de laadpaal. Terugdraaien: ‘Sluiten’ — vóór het bewegen telt het 5 s af.'],
      risico: ['Що може статися: ворота відчиняться, коли вдома нікого немає. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de poort gaat open terwijl er niemand thuis is. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'ingang.sluiten', soorten: ['garagedeur', 'poort'], mogelijkheid: 'open', als: function (a, v) { return !v; }, niveau: V, naam: ['Зачинити ворота', 'Poort of garagedeur sluiten'] },
    { sleutel: 'alarm.uitzetten', soorten: ['alarmsysteem'], mogelijkheid: 'alarmstand', als: function (a, v) { return v === 'uit'; }, niveau: K,
      naam: ['Зняти охорону', 'Alarm uitzetten'],
      gevolg: ['Що станеться: охорону буде знято, датчики дверей і руху перестануть піднімати тривогу. Пов’язано з: камери й далі показують кадри. Як повернути: поставте охорону знову — один дотик.', 'Wat er gebeurt: het alarm gaat uit; deur- en bewegingssensoren slaan geen alarm meer. Hangt samen met: de camera’s blijven beelden tonen. Terugdraaien: schakel het alarm weer in — één tik.'],
      risico: ['Що може статися: дім лишиться без охорони, поки нікого немає. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: het huis is onbewaakt terwijl er niemand is. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'alarm.inschakelen', soorten: ['alarmsysteem'], mogelijkheid: 'alarmstand', als: function (a, v) { return v !== 'uit'; }, niveau: V, naam: ['Поставити на охорону', 'Alarm inschakelen'] },
    { sleutel: 'oven.aan', soorten: ['oven'], mogelijkheid: 'aan', als: function (a, v) { return !!v; }, niveau: Z,
      naam: ['Увімкнути духовку', 'Oven aanzetten'],
      gevolg: ['Що станеться: духовка почне грітися до заданої температури. Пов’язано з: датчик диму на кухні. Як повернути: «Вимкнути» — один дотик; духовка холоне близько 30 хв.', 'Wat er gebeurt: de oven warmt op naar de ingestelde temperatuur. Hangt samen met: de rookmelder in de keuken. Terugdraaien: ‘Uitzetten’ — één tik; afkoelen duurt ongeveer 30 min.'],
      risico: ['Що може статися: духовка грітиметься без нагляду. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de oven staat zonder toezicht aan. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'oven.uit', soorten: ['oven'], mogelijkheid: 'aan', als: function (a, v) { return !v; }, niveau: G, naam: ['Вимкнути духовку', 'Oven uitzetten'] },
    { sleutel: 'voeding.uit', soorten: ['nas', 'router'], mogelijkheid: 'aan', als: function (a, v) { return !v; }, niveau: Z,
      naam: ['Вимкнути критичне живлення', 'Kritieke voeding uitzetten'],
      gevolg: ['Що станеться: пристрій втратить живлення; нічна копія о 02:00 не відбудеться. Пов’язано з: три камери пишуть на це сховище. Як повернути: увімкніть знову — запуск триває 4 хв.', 'Wat er gebeurt: het apparaat verliest stroom; de nachtelijke kopie van 02:00 gaat niet door. Hangt samen met: drie camera’s schrijven naar deze opslag. Terugdraaien: zet het weer aan — opstarten duurt 4 min.'],
      risico: ['Що може статися: записи камер і копії зупиняться. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: camera-opnamen en kopieën stoppen. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'router.herstart', soorten: ['router'], mogelijkheid: 'herstart', niveau: Z,
      naam: ['Перезапустити маршрутизатор', 'Router herstarten'],
      gevolg: ['Що станеться: мережа зникне приблизно на 3 хв, екрани покажуть «немає зв’язку». Пов’язано з: усі пристрої Wi-Fi і тунель до сайту. Як повернути: відкату немає — мережа повернеться сама.', 'Wat er gebeurt: het netwerk valt ongeveer 3 min weg, schermen tonen ‘geen verbinding’. Hangt samen met: alle wifi-apparaten en de tunnel naar de site. Terugdraaien: kan niet — het netwerk komt vanzelf terug.'],
      risico: ['Що може статися: дім лишиться без мережі в невдалий момент. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: het huis zit op een ongelukkig moment zonder netwerk. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'maaier.start', soorten: ['maaier'], mogelijkheid: 'robot', als: function (a, v) { return v === 'start'; }, niveau: Z,
      naam: ['Запустити косарку', 'Robotmaaier starten'],
      gevolg: ['Що станеться: косарка виїде з бази й косить близько 50 хв. Пов’язано з: полив саду відкладається до її повернення. Як повернути: «На базу» — один дотик.', 'Wat er gebeurt: de maaier rijdt van het station en maait ongeveer 50 min. Hangt samen met: de beregening wacht tot hij terug is. Terugdraaien: ‘Naar station’ — één tik.'],
      risico: ['Що може статися: косарка працюватиме, коли в саду діти чи тварини. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de maaier rijdt terwijl er kinderen of dieren in de tuin zijn. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'warmtepomp.uit', soorten: ['warmtepomp'], mogelijkheid: 'modus', als: function (a, v) { return v === 'uit'; }, niveau: Z,
      naam: ['Вимкнути тепловий насос', 'Warmtepomp uitzetten'],
      gevolg: ['Що станеться: опалення й гаряча вода зупиняться в усьому домі. Пов’язано з: термостат, тепла підлога, бойлер. Як повернути: оберіть режим «Обігрів»; дім нагрівається кілька годин.', 'Wat er gebeurt: verwarming en warm water stoppen in het hele huis. Hangt samen met: thermostaat, vloerverwarming, boiler. Terugdraaien: kies de stand ‘Verwarmen’; opwarmen duurt enkele uren.'],
      risico: ['Що може статися: дім вихолоне в мороз. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: het huis koelt af bij vorst. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'huis.allesuit', doel: 'alle', mogelijkheid: 'alles', niveau: Z,
      naam: ['Вимкнути все в домі', 'Alles in huis uit'],
      gevolg: ['Що станеться: вимкнуться світло, медіа, розетки й техніка з програмою; холодильник, сховище й маршрутизатор лишаться. Пов’язано з: прання зупиниться посеред програми. Як повернути: «Повернути» протягом 10 с, далі — вручну.', 'Wat er gebeurt: licht, media, stekkers en apparaten met een programma gaan uit; koelkast, opslag en router blijven aan. Hangt samen met: de was stopt midden in het programma. Terugdraaien: ‘Ongedaan maken’ binnen 10 s, daarna handmatig.'],
      risico: ['Що може статися: техніка зупиниться посеред роботи. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: apparaten stoppen midden in hun werk. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    { sleutel: 'drone.opstijgen', doel: 'drone', mogelijkheid: 'vlucht', als: function (a, v) { return v === 'opstijgen'; }, niveau: K,
      naam: ['Зліт дрона', 'Drone laten opstijgen'],
      gevolg: ['Що станеться: дрон злетить із бази й почне місію. Пов’язано з: зони польоту показано довідково, відповідальність — на пілоті. Як повернути: «Повернутися додому» або «Сісти зараз».', 'Wat er gebeurt: de drone stijgt op van het dock en begint de missie. Hangt samen met: vliegzones zijn ter informatie, de piloot blijft verantwoordelijk. Terugdraaien: ‘Naar huis’ of ‘Nu landen’.'],
      risico: ['Що може статися: дрон злетить без людини поруч. Хто зможе це запускати: цей виконавець, без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de drone stijgt op zonder iemand in de buurt. Wie dit kan starten: deze uitvoerder, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’.'] },
    // ── чутливі ──
    { sleutel: 'huis.stand', doel: 'huis', mogelijkheid: 'stand', niveau: V, naam: ['Змінити режим дому', 'Huisstand wijzigen'] },
    { sleutel: 'warmtepomp.modus', soorten: ['warmtepomp'], mogelijkheid: 'modus', niveau: V, naam: ['Режим теплового насоса', 'Stand van de warmtepomp'] },
    { sleutel: 'boiler', soorten: ['boiler'], niveau: V, naam: ['Бойлер', 'Boiler'] },
    { sleutel: 'ventilatie.uit', soorten: ['ventilatie'], mogelijkheid: 'stand', als: function (a, v) { return Number(v) === 0; }, niveau: V, naam: ['Вимкнути вентиляцію', 'Ventilatie uitzetten'] },
    { sleutel: 'beregening.aan', soorten: ['beregening'], mogelijkheid: 'aan', als: function (a, v) { return !!v; }, niveau: V, naam: ['Запустити полив', 'Beregening starten'] },
    { sleutel: 'programma.start', soorten: ['wasmachine', 'droger', 'vaatwasser'], mogelijkheid: 'programma', als: function (a, v) { return v === 'start'; }, niveau: V, naam: ['Запустити програму', 'Programma starten'] },
    { sleutel: 'oven.doel', soorten: ['oven'], mogelijkheid: 'doel', niveau: V, naam: ['Температура духовки', 'Oventemperatuur'] },
    { sleutel: 'koelkast.doel', soorten: ['koelkast'], mogelijkheid: 'doel', niveau: V, naam: ['Температура холодильника', 'Koelkasttemperatuur'] },
    { sleutel: 'koffie.aan', soorten: ['koffie'], mogelijkheid: 'aan', als: function (a, v) { return !!v; }, niveau: V, naam: ['Увімкнути кавоварку', 'Koffiemachine aanzetten'] },
    { sleutel: 'computer.uit', soorten: ['computer'], mogelijkheid: 'aan', als: function (a, v) { return !v; }, niveau: V, naam: ['Вимкнути комп’ютер', 'Computer uitzetten'] },
    { sleutel: 'thuisbatterij.modus', soorten: ['thuisbatterij'], mogelijkheid: 'modus', niveau: V, naam: ['Режим домашньої батареї', 'Stand van de thuisbatterij'] },
    { sleutel: 'laadpaal.laden', soorten: ['laadpaal'], mogelijkheid: 'laden', niveau: V, naam: ['Зарядка авто', 'Auto laden'] },
    { sleutel: 'licht.stroboscoop', soorten: ['licht'], mogelijkheid: 'effect', als: function (a, v) { return v === 'stroboscoop'; }, niveau: V, naam: ['Ефект «Стробоскоп»', 'Effect ‘Stroboscoop’'] },
    // ── звичайні ──
    { sleutel: 'scene.start', doel: 'scene', mogelijkheid: 'start', niveau: G, groep: true, naam: ['Запустити сцену', 'Scène starten'] },
    { sleutel: 'alle.licht', doel: 'alle', mogelijkheid: 'licht', niveau: G, groep: true, naam: ['Вимкнути все світло', 'Alle lampen uit'] },
    { sleutel: 'kamer.licht', doel: 'kamer', mogelijkheid: 'licht', niveau: G, groep: true, naam: ['Світло кімнати', 'Licht van de kamer'] },
    { sleutel: 'kamer.doel', doel: 'kamer', mogelijkheid: 'doel', niveau: G, naam: ['Температура кімнати', 'Kamertemperatuur'] },
    { sleutel: 'licht', soorten: ['licht', 'lichtgroep'], niveau: G, naam: ['Світло', 'Licht'] },
    { sleutel: 'stopcontact', soorten: ['stopcontact'], niveau: G, naam: ['Розетка', 'Stekker'] },
    { sleutel: 'zonwering', soorten: ['gordijn', 'jaloezie'], niveau: G, naam: ['Штори й жалюзі', 'Gordijnen en jaloezieën'] },
    { sleutel: 'klimaat', soorten: ['thermostaat', 'airco', 'vloerverwarming', 'radiatorkraan', 'ventilatie', 'bevochtiger', 'luchtreiniger'], niveau: G, naam: ['Клімат у межах', 'Klimaat binnen grenzen'] },
    { sleutel: 'media', soorten: ['tv', 'speaker', 'speakergroep', 'irzender'], niveau: G, naam: ['Медіа', 'Media'] },
    { sleutel: 'robot', soorten: ['stofzuiger', 'maaier'], niveau: G, naam: ['Робот: пауза й база', 'Robot: pauze en station'] },
    { sleutel: 'apparatuur', soorten: ['wasmachine', 'droger', 'vaatwasser', 'koffie', 'computer', 'printer', 'nas', 'koelkast', 'beregening', 'laadpaal'], niveau: G, naam: ['Техніка: безпечний бік', 'Apparatuur: veilige kant'] }
  ];
  var ONBEKEND = { sleutel: 'onbekend', niveau: V, naam: ['Невідома дія', 'Onbekende actie'] };

  var niveaus = {
    gewoon: { naam: ['звичайна', 'gewoon'], icoon: null },
    gevoelig: { naam: ['чутлива', 'gevoelig'], icoon: 'eye' },
    gevaarlijk: { naam: ['небезпечна', 'gevaarlijk'], icoon: 'triangle' },
    kritiek: { naam: ['критична', 'kritiek'], icoon: 'octagon' }
  };
  var standNamen = { uit: ['Вимкнено', 'Uit'], vragen: ['Питати', 'Vragen'], altijd: ['Завжди', 'Altijd'] };

  // Дозволи: standen[виконавець][sleutel]. Порожньо = «Вимкнено».
  var standen = {};

  function doelSoort(doel) {
    if (doel && typeof doel === 'object') return { soort: 'apparaat', a: doel };
    if (doel === 'huis' || doel === 'alle') return { soort: doel };
    if (typeof doel === 'string' && doel.indexOf(':') > 0) return { soort: doel.split(':')[0], id: doel.split(':')[1] };
    var a = HV.staat && HV.staat.w ? HV.staat.w.apparaten[doel] : null;
    return a ? { soort: 'apparaat', a: a } : { soort: String(doel) };
  }

  HV.gevaar = {
    acties: acties,
    niveaus: niveaus,
    standNamen: standNamen,
    doelSoort: doelSoort,

    /** Дія матриці для цілі, можливості й значення (перший збіг; специфічні стоять вище загальних). */
    vind: function (doel, mogelijkheid, waarde) {
      var d = doelSoort(doel);
      for (var i = 0; i < acties.length; i++) {
        var x = acties[i];
        if (x.soorten) { if (d.soort !== 'apparaat' || x.soorten.indexOf(d.a.soort) < 0) continue; }
        else if (x.doel !== d.soort) continue;
        if (x.mogelijkheid && x.mogelijkheid !== mogelijkheid) continue;
        if (x.als && !x.als(d.a, waarde)) continue;
        return x;
      }
      return ONBEKEND;
    },
    actie: function (sleutel) { for (var i = 0; i < acties.length; i++) if (acties[i].sleutel === sleutel) return acties[i]; return ONBEKEND; },
    isZwaar: function (actie) { return actie.niveau === Z || actie.niveau === K; },

    /** Що дозволено ролі людини. Власник і мешканець проходять ритуал рівня; дитина й гість — лише частину дій. */
    rolMag: function (rol, actie) {
      if (rol === 'eigenaar' || rol === 'bewoner') return { mag: true };
      if (rol === 'kind') {
        if (actie.niveau === G || actie.niveau === V) return { mag: true };
        return { mag: false, reden: ['ця дія недоступна ролі «Дитина»', 'deze actie is niet beschikbaar voor de rol ‘Kind’'] };
      }
      if (actie.niveau === G) return { mag: true };
      return { mag: false, reden: ['гість керує лише світлом, шторами й медіа', 'een gast bedient alleen licht, gordijnen en media'] };
    },

    standaardStand: function () { return 'uit'; },
    /** Дозвіл виконавця для дії: 'uit' | 'vragen' | 'altijd'. */
    stand: function (uitvoerder, sleutel) { return (standen[uitvoerder] && standen[uitvoerder][sleutel]) || 'uit'; },
    standen: function () { return standen; },
    herstelStanden: function () { standen = {}; },
    /** Лише для сценаріїв симулятора (початковий стан світу). */
    zetStandStil: function (uitvoerder, sleutel, waarde) { (standen[uitvoerder] = standen[uitvoerder] || {})[sleutel] = waarde; },

    /**
     * Змінити дозвіл. Працює тільки для людини з роллю «власник»; «Завжди» для небезпечної чи критичної дії
     * просить повторного підтвердження входу (це перевірка, що дозвіл змінює власник, а не обмеження вибору).
     * Повертає Promise<{ ok, reden }>.
     */
    zetStand: function (uitvoerder, sleutel, waarde) {
      var rol = HV.rol ? HV.rol() : 'eigenaar';
      var actie = HV.gevaar.actie(sleutel);
      var was = HV.gevaar.stand(uitvoerder, sleutel);
      if (rol !== 'eigenaar') {
        HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: HV.t('Дозвіл не змінено', 'Toestemming niet gewijzigd'), tekst: HV.t('Змінює лише власник.', 'Alleen de eigenaar kan dit wijzigen.') });
        return Promise.resolve({ ok: false, reden: 'rol' });
      }
      if (was === waarde) return Promise.resolve({ ok: true });
      var klaar = function () {
        (standen[uitvoerder] = standen[uitvoerder] || {})[sleutel] = waarde;
        var wie = HV.gevaar.uitvoerder(uitvoerder);
        var e = HV.logboek.voegToe({
          maker: HV.mens(), soort: 'huis.systeem', gewicht: HV.gevaar.isZwaar(actie) && waarde === 'altijd' ? 'belangrijk' : 'info',
          wat: ['Дозвіл «' + actie.naam[0] + '» для «' + wie.naam[0] + '»', 'Toestemming ‘' + actie.naam[1] + '’ voor ‘' + wie.naam[1] + '’'],
          was: standNamen[was], werd: standNamen[waarde]
        });
        HV.meld({ maker: HV.mens(), icoon: 'shield-check', titel: HV.p(e.wat), tekst: HV.p(standNamen[was]) + ' → ' + HV.p(standNamen[waarde]) });
        HV.staat.wijzig();
        return { ok: true };
      };
      if (waarde === 'altijd' && HV.gevaar.isZwaar(actie) && HV.schil && HV.schil.herbevestig) {
        return HV.schil.herbevestig({ titel: HV.t('Підтвердьте, що це ви', 'Bevestig dat jij het bent'), tekst: HV.t('«Завжди» для цієї дії вмикає лише власник.', '‘Altijd’ voor deze actie zet alleen de eigenaar aan.') })
          .then(function (ja) { return ja ? klaar() : { ok: false, reden: 'geannuleerd' }; });
      }
      return Promise.resolve(klaar());
    },

    uitvoerders: function () { return HV.paspoort.uitvoerders; },
    uitvoerder: function (id) {
      var l = HV.paspoort.uitvoerders;
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return { id: id, soort: 'agent', naam: [id, id] };
    },
    /** Де стоїть «Завжди» для небезпечних і критичних дій: [{ uitvoerder, actie }] — для позначки «! N» у шапці. */
    altijdZwaar: function () {
      var uit = [];
      Object.keys(standen).forEach(function (u) {
        Object.keys(standen[u]).forEach(function (s) {
          var a = HV.gevaar.actie(s);
          if (standen[u][s] === 'altijd' && HV.gevaar.isZwaar(a)) uit.push({ uitvoerder: u, actie: a });
        });
      });
      return uit;
    }
  };
})(window.HV = window.HV || {});
