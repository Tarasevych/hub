// Assistent en agenten / Помічник і агенти — вкладки «Автоматика → Помічник» і «Автоматика → Агенти й погодження».
// Адреси на справжньому сайті: /assistent (розмова, підсумок дня, «Чекає на вас», «Пропозиції», «Незвичне», налаштування) і
// /automatiseringen/agenten[/<agent>] (черга, агенти, «Зараз працює»; сторінка агента: Інструменти · Рамки · Дії · «Що бачить агент»).
// Аркуші: ?blad=verzoek:<id>, ?blad=waarom:<подія>, ?blad=agentnieuw, ?blad=verzending:<agent>.
// Помічник у макеті — детермінований розбір фраз (без моделі ШІ): кожне число має джерело, кожна дія — картку наміру
// «було → стане» і проходить HV.doe (ворота, ритуал, Журнал, «Повернути»). Агент не має інструмента зміни дозволів:
// дозволи змінює лише власник через HV.gevaar.zetStand.
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  var MIN = 60000, UUR = 3600000, DAG = 86400000;
  var STAART = '_huis_tarasevych_com_gebruiker';

  // ───────────────────────── Агенти ─────────────────────────
  // Назви брендів — дані (однакові в обох мовах), тому вони не стоять у парах t().
  var AGENTEN = [
    { id: 'huisassistent', merk: null, naam: ['Помічник дому', 'Huisassistent'], icoon: 'sparkles', toon: 'aan', start: 'ingebouwd',
      model: ['Локальна модель у домі', 'Lokaal model in huis'], weg: ['вбудований · без з’єднання назовні', 'ingebouwd · zonder verbinding naar buiten'] },
    { id: 'claude', merk: 'Claude', teken: 'C', toon: 'warm', start: 'verbonden',
      model: ['Хмарна модель', 'Cloudmodel'], weg: ['через MCP · mcp.tarasevych.com/claude', 'via MCP · mcp.tarasevych.com/claude'] },
    { id: 'gemini', merk: 'Gemini', teken: 'G', toon: 'koud', start: 'verbonden',
      model: ['Хмарна модель', 'Cloudmodel'], weg: ['через MCP · mcp.tarasevych.com/gemini', 'via MCP · mcp.tarasevych.com/gemini'] },
    { id: 'chatgpt', merk: 'ChatGPT', teken: 'Ch', toon: 'batterij', start: 'los',
      model: ['Хмарна модель', 'Cloudmodel'], weg: ['через MCP · mcp.tarasevych.com/chatgpt', 'via MCP · mcp.tarasevych.com/chatgpt'] },
    { id: 'grok', merk: 'Grok', teken: 'Gr', toon: 'net-uit', start: 'los',
      model: ['Хмарна модель', 'Cloudmodel'], weg: ['через MCP · mcp.tarasevych.com/grok', 'via MCP · mcp.tarasevych.com/grok'] }
  ];
  function agentDef(id) { for (var i = 0; i < AGENTEN.length; i++) if (AGENTEN[i].id === id) return AGENTEN[i]; return null; }
  function agentNaam(id) { var a = agentDef(id); return a ? (a.merk || HV.p(a.naam)) : id; }
  function agentDoor(id) { var a = agentDef(id); return { soort: 'agent', id: id, naam: a && a.merk ? ['Агент ' + a.merk, 'Agent ' + a.merk] : (a ? a.naam : [id, id]) }; }

  /** Знак агента: монограма на м’якій підкладці тону (вбудований помічник — іскри). */
  function agentTeken(id, groot) {
    var a = agentDef(id) || { toon: 'neutraal', teken: '?' };
    return '<span class="hv-ast-teken hv-toon-' + a.toon + (groot ? ' hv-ast-teken--groot' : '') + '" aria-hidden="true">' + (a.icoon ? HV.icoon(a.icoon, { maat: groot ? 'l' : 'm' }) : '<span>' + h(a.teken) + '</span>') + '</span>';
  }

  // Виконавці, яких ще немає в паспорті. Додаються під час першої зміни стану (не під час завантаження: перевірка
  // мовного закону не знає назв брендів ChatGPT і Grok; у дані вони потрапляють як незмінні власні назви).
  function zorgUitvoerders() {
    if (!HV.paspoort || !HV.paspoort.uitvoerders) return;
    var lijst = HV.paspoort.uitvoerders;
    ['chatgpt', 'grok', 'huisassistent'].forEach(function (id) {
      if (lijst.some(function (u) { return u.id === id; })) return;
      lijst.push({ id: id, soort: 'agent', naam: agentDoor(id).naam });
    });
  }

  // ───────────────────────── Інструменти MCP розділу huis ─────────────────────────
  // Кожен інструмент має ключ дії реєстру дозволів (HV.gevaar): той самий, що перевіряє HV.doe, коли агент діє, тож дозвіл
  // інструмента — це клітинка «дія × агент» реєстру /instellingen/risico. Ключі mcp.* — дії, яких немає серед пристроїв
  // (читання, камери, транспорт, симулятор); вони додаються тут із doel:'mcp' і ніколи не збігаються з HV.gevaar.vind.
  var GROEPEN = [
    { id: 'lezen', icoon: 'eye', naam: ['Читання', 'Lezen'] },
    { id: 'licht', icoon: 'lightbulb', naam: ['Світло', 'Licht'] },
    { id: 'klimaat', icoon: 'thermometer', naam: ['Клімат і штори', 'Klimaat en zonwering'] },
    { id: 'media', icoon: 'speaker', naam: ['Медіа', 'Media'] },
    { id: 'apparatuur', icoon: 'washing-machine', naam: ['Техніка й роботи', 'Apparatuur en robots'] },
    { id: 'scenes', icoon: 'sparkles', naam: ['Сцени й режими', 'Scènes en standen'] },
    { id: 'regels', icoon: 'workflow', naam: ['Автоматизації', 'Automatiseringen'] },
    { id: 'energie', icoon: 'zap', naam: ['Енергія', 'Energie'] },
    { id: 'veilig', icoon: 'shield', naam: ['Безпека й замки', 'Beveiliging en sloten'] },
    { id: 'cameras', icoon: 'cctv', naam: ['Камери', 'Camera’s'] },
    { id: 'vervoer', icoon: 'car', naam: ['Транспорт', 'Voertuigen'] },
    { id: 'drones', icoon: 'drone', naam: ['Безпілотники', 'Drones'] },
    { id: 'sim', icoon: 'flask-conical', naam: ['Симулятор', 'Simulator'] }
  ];
  function groepDef(id) { for (var i = 0; i < GROEPEN.length; i++) if (GROEPEN[i].id === id) return GROEPEN[i]; return GROEPEN[0]; }

  // [groep, назва-дія, ключ реєстру, опис uk, опис nl]
  var GEREEDSCHAP = [
    ['lezen', 'tonen_huis_overzicht', 'mcp.overzicht', 'Знімок дому: режим, світло, двері, енергія', 'Momentopname van het huis: stand, licht, deuren, energie'],
    ['lezen', 'lezen_apparaat', 'mcp.apparaat', 'Стан одного пристрою з віком виміру', 'Toestand van één apparaat met de leeftijd van de meting'],
    ['lezen', 'zoeken_apparaten', 'mcp.zoeken', 'Пошук пристроїв за кімнатою й класом', 'Apparaten zoeken op kamer en soort'],
    ['lezen', 'lezen_geschiedenis', 'mcp.geschiedenis', 'Історія пристрою за 14 днів', 'Geschiedenis van een apparaat over 14 dagen'],
    ['lezen', 'uitleggen_waarom', 'mcp.waarom', '«Чому це сталося»: ланцюжок причин', '‘Waarom gebeurde dit’: de keten van oorzaken'],
    ['lezen', 'lezen_logboek', 'mcp.logboek', 'Записи Журналу', 'Regels uit het logboek'],
    ['lezen', 'lezen_energie', 'mcp.energie', 'Енергія зараз і за добу', 'Energie nu en over het etmaal'],
    ['lezen', 'lezen_weer', 'mcp.weer', 'Погода й прогноз', 'Weer en verwachting'],
    ['lezen', 'tonen_aanwezigheid', 'mcp.aanwezig', '«Хтось удома» — узагальнено', '‘Er is iemand thuis’ — algemeen'],
    ['lezen', 'tonen_wie_thuis', 'mcp.wiethuis', 'Хто саме вдома', 'Wie er precies thuis is'],
    ['licht', 'bedienen_licht', 'licht', 'Лампа: увімкнути, вимкнути, яскравість, колір', 'Lamp: aan, uit, helderheid, kleur'],
    ['licht', 'schakelen_kamerlicht', 'kamer.licht', 'Світло всієї кімнати', 'Het licht van een hele kamer'],
    ['licht', 'uitzetten_alle_lampen', 'alle.licht', 'Вимкнути все світло', 'Alle lampen uit'],
    ['licht', 'starten_stroboscoop', 'licht.stroboscoop', 'Ефект «Стробоскоп»', 'Effect ‘Stroboscoop’'],
    ['klimaat', 'instellen_kamerdoel', 'kamer.doel', 'Ціль температури кімнати', 'Doeltemperatuur van een kamer'],
    ['klimaat', 'bedienen_klimaat', 'klimaat', 'Термостат, кондиціонер, тепла підлога, вентиляція', 'Thermostaat, airco, vloerverwarming, ventilatie'],
    ['klimaat', 'uitzetten_ventilatie', 'ventilatie.uit', 'Вимкнути вентиляцію', 'Ventilatie uitzetten'],
    ['klimaat', 'instellen_warmtepomp', 'warmtepomp.modus', 'Режим теплового насоса', 'Stand van de warmtepomp'],
    ['klimaat', 'uitzetten_warmtepomp', 'warmtepomp.uit', 'Вимкнути тепловий насос', 'Warmtepomp uitzetten'],
    ['klimaat', 'bedienen_boiler', 'boiler', 'Бойлер', 'Boiler'],
    ['klimaat', 'bedienen_zonwering', 'zonwering', 'Штори й жалюзі', 'Gordijnen en jaloezieën'],
    ['media', 'bedienen_media', 'media', 'Телевізор, колонки, джерело, гучність', 'Tv, speakers, bron, volume'],
    ['media', 'omroepen_bericht', 'media.omroep', 'Оголошення в колонках', 'Omroepen via de speakers'],
    ['media', 'zetten_volume_boven_plafond', 'media.luid', 'Гучніше за стелю гучності', 'Harder dan het volumeplafond'],
    ['apparatuur', 'schakelen_stekker', 'stopcontact', 'Розетки', 'Stekkers'],
    ['apparatuur', 'starten_programma', 'programma.start', 'Запустити пральну, сушильну чи посудомийну', 'De was-, droog- of vaatwasmachine starten'],
    ['apparatuur', 'bedienen_apparatuur', 'apparatuur', 'Техніка: зупинити й вимкнути', 'Apparatuur: stoppen en uitzetten'],
    ['apparatuur', 'aanzetten_oven', 'oven.aan', 'Увімкнути духовку', 'Oven aanzetten'],
    ['apparatuur', 'zetten_koffie', 'koffie.aan', 'Увімкнути кавоварку', 'Koffiemachine aanzetten'],
    ['apparatuur', 'uitzetten_computer', 'computer.uit', 'Вимкнути комп’ютер', 'Computer uitzetten'],
    ['apparatuur', 'uitzetten_voeding', 'voeding.uit', 'Вимкнути сховище чи маршрутизатор', 'Opslag of router uitzetten'],
    ['apparatuur', 'herstarten_router', 'router.herstart', 'Перезапустити маршрутизатор', 'Router herstarten'],
    ['apparatuur', 'uitzetten_alles', 'huis.allesuit', 'Вимкнути все в домі', 'Alles in huis uit'],
    ['apparatuur', 'bedienen_robot', 'robot', 'Пилосос і косарка: пауза й база', 'Stofzuiger en maaier: pauze en station'],
    ['apparatuur', 'starten_maaier', 'maaier.start', 'Запустити косарку', 'Robotmaaier starten'],
    ['apparatuur', 'starten_beregening', 'beregening.aan', 'Запустити полив', 'Beregening starten'],
    ['scenes', 'tonen_scenes', 'mcp.scenes', 'Перелік сцен і кроків', 'Scènes en hun stappen'],
    ['scenes', 'starten_scene', 'scene.start', 'Запустити сцену', 'Scène starten'],
    ['scenes', 'wijzigen_huisstand', 'huis.stand', 'Змінити режим дому', 'Huisstand wijzigen'],
    ['scenes', 'maken_scene_concept', 'mcp.sceneconcept', 'Чернетка сцени зі знімка стану', 'Concept van een scène uit een momentopname'],
    ['regels', 'tonen_automatiseringen', 'mcp.regels', 'Перелік правил і перебіг', 'Regels en hun verloop'],
    ['regels', 'maken_regel_concept', 'mcp.regelconcept', 'Чернетка правила', 'Concept van een regel'],
    ['regels', 'proefdraaien_regel', 'mcp.proef', 'Пробний прогін правила', 'Proefrun van een regel'],
    ['regels', 'aanzetten_regel', 'mcp.regelaan', 'Увімкнути правило', 'Regel aanzetten'],
    ['regels', 'uitzetten_regel', 'mcp.regeluit', 'Вимкнути правило', 'Regel uitzetten'],
    ['energie', 'lezen_tarief', 'mcp.tarief', 'Ціни на 48 годин', 'Prijzen voor 48 uur'],
    ['energie', 'starten_laden', 'laadpaal.laden', 'Зарядка авто', 'Auto laden'],
    ['energie', 'instellen_laadstand', 'laadpaal.modus', 'Режим зарядки', 'Laadstand'],
    ['energie', 'instellen_laaddoel', 'laadpaal.doel', 'Ціль зарядки', 'Laaddoel'],
    ['energie', 'instellen_batterij', 'thuisbatterij.modus', 'Режим домашньої батареї', 'Stand van de thuisbatterij'],
    ['energie', 'begrenzen_teruglevering', 'zonnepanelen.begrenzen', 'Обмежити віддачу сонця в мережу', 'Teruglevering van de zon begrenzen'],
    ['veilig', 'vergrendelen_deur', 'slot.vergrendelen', 'Замкнути двері', 'Deur vergrendelen'],
    ['veilig', 'ontgrendelen_deur', 'slot.ontgrendelen', 'Відімкнути двері', 'Deur ontgrendelen'],
    ['veilig', 'inschakelen_alarm', 'alarm.inschakelen', 'Поставити на охорону', 'Alarm inschakelen'],
    ['veilig', 'uitschakelen_alarm', 'alarm.uitzetten', 'Зняти охорону', 'Alarm uitzetten'],
    ['veilig', 'openen_ingang', 'ingang.openen', 'Відчинити ворота чи гараж', 'Poort of garagedeur openen'],
    ['veilig', 'sluiten_ingang', 'ingang.sluiten', 'Зачинити ворота чи гараж', 'Poort of garagedeur sluiten'],
    ['veilig', 'lezen_melders', 'mcp.melders', 'Датчики диму, газу й води', 'Rook-, gas- en watermelders'],
    ['veilig', 'testen_melder', 'melder.test', 'Перевірити датчик', 'Melder testen'],
    ['veilig', 'maken_gastcode', 'slot.gastcode', 'Гостьовий код на строк', 'Gastcode met termijn'],
    ['veilig', 'dempen_melder', 'mcp.dempen', 'Приглушити дим, газ чи чадний газ', 'Rook-, gas- of koolmonoxidemelder dempen'],
    ['cameras', 'lezen_camera_gebeurtenissen', 'mcp.camgebeurtenis', 'Події камер текстом', 'Gebeurtenissen van camera’s als tekst'],
    ['cameras', 'maken_camerabeeld', 'mcp.camfoto', 'Знімок кадру', 'Een beeld vastleggen'],
    ['cameras', 'starten_opname', 'mcp.camopname', 'Запис відео', 'Video opnemen'],
    ['cameras', 'bekijken_live', 'mcp.camlive', 'Відео наживо', 'Live meekijken'],
    ['vervoer', 'lezen_voertuigen', 'mcp.voertuigen', 'Заряд, запас ходу, двері', 'Lading, bereik, portieren'],
    ['vervoer', 'tonen_locatie_voertuig', 'mcp.locatie', 'Де авто, велосипед, самокат', 'Waar de auto, fiets of step is'],
    ['vervoer', 'instellen_klimaat_auto', 'garage.klimaat', 'Клімат салону', 'Voorklimatiseren'],
    ['vervoer', 'vergrendelen_voertuig', 'garage.vergrendelen', 'Замкнути транспорт', 'Voertuig vergrendelen'],
    ['vervoer', 'ontgrendelen_voertuig', 'garage.ontgrendelen', 'Відімкнути транспорт', 'Voertuig ontgrendelen'],
    ['vervoer', 'starten_voertuig', 'mcp.autostart', 'Дистанційний запуск', 'Op afstand starten'],
    ['drones', 'lezen_drones', 'mcp.drones', 'Парк, батареї, док', 'Vloot, accu’s, dock'],
    ['drones', 'lezen_vluchtlog', 'mcp.vluchtlog', 'Журнал польотів', 'Vluchtlogboek'],
    ['drones', 'voorstellen_missie', 'drone.missievoorstel', 'Пропозиція місії пілотові', 'Missievoorstel aan de piloot'],
    ['drones', 'opstijgen_drone', 'drone.opstijgen', 'Зліт і місія', 'Opstijgen en missie'],
    ['drones', 'zweven_drone', 'drone.zweven', 'Зависнути', 'Zweven'],
    ['drones', 'terugkeren_drone', 'drone.naarhuis', 'Повернутися додому', 'Naar huis'],
    ['drones', 'landen_drone', 'drone.landen', 'Сісти зараз', 'Nu landen'],
    ['sim', 'lezen_simulator', 'mcp.simlezen', 'Час дому, швидкість, сценарій', 'Huistijd, snelheid, scenario'],
    ['sim', 'instellen_snelheid', 'mcp.simsnelheid', 'Швидкість часу', 'Snelheid van de tijd'],
    ['sim', 'starten_scenario', 'mcp.simscenario', 'Побутовий сценарій', 'Een alledaags scenario'],
    ['sim', 'starten_noodscenario', 'mcp.simnood', 'Аварійний сценарій: дим, вода, збій', 'Noodscenario: rook, water, storing']
  ].map(function (r) { return { groep: r[0], naam: r[1], sleutel: r[2], wat: [r[3], r[4]] }; });
  function toolVoor(sleutel) { for (var i = 0; i < GEREEDSCHAP.length; i++) if (GEREEDSCHAP[i].sleutel === sleutel) return GEREEDSCHAP[i]; return null; }
  function toolNaam(tool, agentId) { return tool.naam + '_' + agentId + STAART; }

  var RISICO_STAART = function (uk, nl) { return [uk + ' Хто зможе це запускати: цей агент, без вашого схвалення. Як вимкнути: оберіть «Питати» або «Вимкнено», чи «Зупинити самостійні дії».', nl + ' Wie dit kan starten: deze agent, zonder jouw goedkeuring. Uitzetten: kies ‘Vragen’ of ‘Uit’, of ‘Zelfstandige acties stoppen’.']; };
  // Власні дії реєстру (doel:'mcp'): читання, камери, транспорт, симулятор, правила.
  var EIGEN_ACTIES = [
    { sleutel: 'mcp.overzicht', niveau: 'gewoon', naam: ['Читати знімок дому', 'Momentopname van het huis lezen'] },
    { sleutel: 'mcp.apparaat', niveau: 'gewoon', naam: ['Читати стан пристрою', 'Toestand van een apparaat lezen'] },
    { sleutel: 'mcp.zoeken', niveau: 'gewoon', naam: ['Шукати пристрої', 'Apparaten zoeken'] },
    { sleutel: 'mcp.geschiedenis', niveau: 'gewoon', naam: ['Читати історію', 'Geschiedenis lezen'] },
    { sleutel: 'mcp.waarom', niveau: 'gewoon', naam: ['Пояснити причину', 'Oorzaak uitleggen'] },
    { sleutel: 'mcp.logboek', niveau: 'gewoon', naam: ['Читати Журнал', 'Logboek lezen'] },
    { sleutel: 'mcp.energie', niveau: 'gewoon', naam: ['Читати енергію', 'Energie lezen'] },
    { sleutel: 'mcp.weer', niveau: 'gewoon', naam: ['Читати погоду', 'Weer lezen'] },
    { sleutel: 'mcp.aanwezig', niveau: 'gevoelig', naam: ['Знати, чи хтось удома', 'Weten of er iemand thuis is'] },
    { sleutel: 'mcp.wiethuis', niveau: 'gevoelig', naam: ['Знати, хто саме вдома', 'Weten wie er precies thuis is'] },
    { sleutel: 'mcp.scenes', niveau: 'gewoon', naam: ['Читати сцени', 'Scènes lezen'] },
    { sleutel: 'mcp.sceneconcept', niveau: 'gewoon', naam: ['Чернетка сцени', 'Concept van een scène'] },
    { sleutel: 'mcp.regels', niveau: 'gewoon', naam: ['Читати правила', 'Regels lezen'] },
    { sleutel: 'mcp.regelconcept', niveau: 'gewoon', naam: ['Чернетка правила', 'Concept van een regel'] },
    { sleutel: 'mcp.proef', niveau: 'gewoon', naam: ['Пробний прогін правила', 'Proefrun van een regel'] },
    { sleutel: 'mcp.regelaan', niveau: 'gevaarlijk', naam: ['Увімкнути правило', 'Regel aanzetten'],
      gevolg: ['Що станеться: правило почне діяти саме, без вас, щоразу, коли виконано його умову. Пов’язано з: кроки правила мають власні дозволи. Як повернути: вимкніть правило — один дотик.', 'Wat er gebeurt: de regel gaat zelf handelen, zonder jou, telkens als zijn voorwaarde klopt. Hangt samen met: de stappen van de regel hebben eigen toestemmingen. Terugdraaien: zet de regel uit — één tik.'],
      risico: RISICO_STAART('Що може статися: правило з помилкою діятиме вночі чи без людей удома.', 'Wat er kan gebeuren: een regel met een fout handelt ’s nachts of als er niemand thuis is.') },
    { sleutel: 'mcp.regeluit', niveau: 'gevaarlijk', naam: ['Вимкнути правило', 'Regel uitzetten'],
      gevolg: ['Що станеться: правило перестане діяти, доки його не ввімкнуть. Пов’язано з: те, що воно робило (світло вночі, вікно й опалення), чекатиме на людину. Як повернути: увімкніть правило знову.', 'Wat er gebeurt: de regel stopt tot iemand hem weer aanzet. Hangt samen met: wat hij deed (nachtlicht, raam en verwarming) wacht dan op een mens. Terugdraaien: zet de regel weer aan.'],
      risico: RISICO_STAART('Що може статися: агент вимкне правило, на яке ви покладаєтеся, наприклад нічне світло.', 'Wat er kan gebeuren: de agent zet een regel uit waar je op rekent, zoals het nachtlicht.') },
    { sleutel: 'mcp.tarief', niveau: 'gewoon', naam: ['Читати ціни', 'Prijzen lezen'] },
    { sleutel: 'mcp.melders', niveau: 'gewoon', naam: ['Читати датчики безпеки', 'Veiligheidsmelders lezen'] },
    { sleutel: 'mcp.dempen', niveau: 'kritiek', naam: ['Приглушити датчик безпеки', 'Veiligheidsmelder dempen'],
      gevolg: ['Що станеться: сирена датчика замовкне на 10 хв; датчик і далі вимірює. Пов’язано з: аварійний шар на всіх екранах. Як повернути: датчик сам озветься знову через 10 хв або за новим спрацюванням.', 'Wat er gebeurt: de sirene van de melder zwijgt 10 min; de melder blijft meten. Hangt samen met: de noodlaag op alle schermen. Terugdraaien: de melder klinkt na 10 min of bij een nieuwe melding vanzelf weer.'],
      risico: RISICO_STAART('Що може статися: справжня пожежа чи витік лишиться без звуку.', 'Wat er kan gebeuren: een echte brand of lekkage blijft zonder geluid.') },
    { sleutel: 'mcp.camgebeurtenis', niveau: 'gevoelig', naam: ['Читати події камер', 'Gebeurtenissen van camera’s lezen'] },
    { sleutel: 'mcp.camfoto', niveau: 'gevaarlijk', naam: ['Знімок кадру камери', 'Beeld van een camera vastleggen'],
      gevolg: ['Що станеться: агент отримає один кадр через сервер; кадр має позначку часу. Пов’язано з: «Приватність удома» й маски камер діють і тут. Як повернути: кадр видаляється з Журналу за 30 днів.', 'Wat er gebeurt: de agent krijgt één beeld via de server, met een tijdstempel. Hangt samen met: ‘Privacy thuis’ en de cameramaskers gelden ook hier. Terugdraaien: het beeld verdwijnt na 30 dagen uit het logboek.'],
      risico: RISICO_STAART('Що може статися: кадр з людьми піде в хмарну модель.', 'Wat er kan gebeuren: een beeld met mensen gaat naar een cloudmodel.') },
    { sleutel: 'mcp.camopname', niveau: 'gevaarlijk', naam: ['Запис відео камери', 'Video van een camera opnemen'],
      gevolg: ['Що станеться: камера запише 30 с відео на сховище. Пов’язано з: слід «Хто дивився». Як повернути: запис можна видалити вручну.', 'Wat er gebeurt: de camera neemt 30 s video op in de opslag. Hangt samen met: het spoor ‘Wie heeft gekeken’. Terugdraaien: de opname kan met de hand worden verwijderd.'],
      risico: RISICO_STAART('Що може статися: запис гостей чи сусідів без їхнього відома.', 'Wat er kan gebeuren: opnamen van gasten of buren zonder dat ze het weten.') },
    { sleutel: 'mcp.camlive', niveau: 'kritiek', naam: ['Відео камери наживо', 'Live beeld van een camera'],
      gevolg: ['Що станеться: агент дивитиметься потік камери, доки ви його не зупините. Пов’язано з: слід «Хто дивився» й світлодіод камери. Як повернути: «Зупинити» в розділі «Камери».', 'Wat er gebeurt: de agent kijkt mee met de stroom van de camera tot je hem stopt. Hangt samen met: het spoor ‘Wie heeft gekeken’ en het lampje van de camera. Terugdraaien: ‘Stoppen’ onder ‘Camera’s’.'],
      risico: RISICO_STAART('Що може статися: стороння модель бачитиме ваш двір і вхід наживо.', 'Wat er kan gebeuren: een extern model ziet je tuin en voordeur live.') },
    { sleutel: 'mcp.voertuigen', niveau: 'gewoon', naam: ['Читати транспорт', 'Voertuigen lezen'] },
    { sleutel: 'mcp.locatie', niveau: 'gevoelig', naam: ['Знати місце транспорту', 'Locatie van een voertuig weten'] },
    { sleutel: 'mcp.autostart', niveau: 'kritiek', naam: ['Дистанційний запуск авто', 'Auto op afstand starten'],
      gevolg: ['Що станеться: двигун запуститься на 10 хв для прогріву салону; авто лишається замкненим. Пов’язано з: гараж і чадний газ. Як повернути: «Зупинити двигун» — один дотик.', 'Wat er gebeurt: de motor start 10 min om het interieur te verwarmen; de auto blijft op slot. Hangt samen met: de garage en koolmonoxide. Terugdraaien: ‘Motor stoppen’ — één tik.'],
      risico: RISICO_STAART('Що може статися: двигун працюватиме в зачиненому гаражі.', 'Wat er kan gebeuren: de motor draait in een gesloten garage.') },
    { sleutel: 'mcp.drones', niveau: 'gewoon', naam: ['Читати безпілотники', 'Drones lezen'] },
    { sleutel: 'mcp.vluchtlog', niveau: 'gewoon', naam: ['Читати журнал польотів', 'Vluchtlogboek lezen'] },
    { sleutel: 'mcp.simlezen', niveau: 'gewoon', naam: ['Читати симулятор', 'Simulator lezen'] },
    { sleutel: 'mcp.simsnelheid', niveau: 'gewoon', naam: ['Змінити швидкість часу', 'Snelheid van de tijd wijzigen'] },
    { sleutel: 'mcp.simscenario', niveau: 'gewoon', naam: ['Запустити побутовий сценарій', 'Alledaags scenario starten'] },
    { sleutel: 'mcp.simnood', niveau: 'gevaarlijk', naam: ['Запустити аварійний сценарій', 'Noodscenario starten'],
      gevolg: ['Що станеться: симулятор покаже дим, протікання чи збій зв’язку на всіх екранах. Пов’язано з: аварійний шар і сповіщення всім удома. Як повернути: «Датчик заспокоївся» або інший сценарій.', 'Wat er gebeurt: de simulator toont rook, lekkage of een storing op alle schermen. Hangt samen met: de noodlaag en meldingen aan iedereen thuis. Terugdraaien: ‘De melder is weer rustig’ of een ander scenario.'],
      risico: RISICO_STAART('Що може статися: люди вдома злякаються навчальної тривоги.', 'Wat er kan gebeuren: mensen thuis schrikken van een oefenalarm.') }
  ];
  // Запасні описи для ключів, які додають інші розділи (енергія, безпека, гараж, медіа, безпілотники). Беруться, лише
  // якщо до першого показу сторінки ключа в реєстрі так і немає — інакше рівень і тексти йдуть від розділу-власника.
  var ZORG_ACTIES = [
    { sleutel: 'media.omroep', niveau: 'gevoelig', naam: ['Оголошення в колонках', 'Omroepen via de speakers'] },
    { sleutel: 'media.luid', niveau: 'gevoelig', naam: ['Гучніше за стелю гучності', 'Harder dan het volumeplafond'] },
    { sleutel: 'laadpaal.modus', niveau: 'gevoelig', naam: ['Режим зарядки', 'Laadstand'] },
    { sleutel: 'laadpaal.doel', niveau: 'gewoon', naam: ['Ціль зарядки', 'Laaddoel'] },
    { sleutel: 'zonnepanelen.begrenzen', niveau: 'gevoelig', naam: ['Обмежити віддачу сонця', 'Teruglevering begrenzen'] },
    { sleutel: 'melder.test', niveau: 'gewoon', naam: ['Перевірити датчик', 'Melder testen'] },
    { sleutel: 'slot.gastcode', niveau: 'kritiek', naam: ['Гостьовий код на строк', 'Gastcode met termijn'],
      gevolg: ['Що станеться: з’явиться код, яким можна відімкнути вхідні двері до кінця строку. Пов’язано з: Журнал записує кожне відмикання кодом. Як повернути: «Відкликати код» — один дотик.', 'Wat er gebeurt: er komt een code waarmee de voordeur tot het einde van de termijn open kan. Hangt samen met: het logboek houdt elke opening met de code bij. Terugdraaien: ‘Code intrekken’ — één tik.'],
      risico: RISICO_STAART('Що може статися: код потрапить до сторонньої людини.', 'Wat er kan gebeuren: de code komt bij een vreemde terecht.') },
    { sleutel: 'garage.klimaat', niveau: 'gevoelig', naam: ['Клімат салону', 'Voorklimatiseren'] },
    { sleutel: 'garage.vergrendelen', niveau: 'gewoon', naam: ['Замкнути транспорт', 'Voertuig vergrendelen'] },
    { sleutel: 'garage.ontgrendelen', niveau: 'kritiek', naam: ['Відімкнути транспорт', 'Voertuig ontgrendelen'],
      gevolg: ['Що станеться: двері авто чи замок велосипеда відімкнуться. Пов’язано з: сигналізація транспорту. Як повернути: «Замкнути» — один дотик.', 'Wat er gebeurt: de portieren van de auto of het fietsslot gaan open. Hangt samen met: het alarm van het voertuig. Terugdraaien: ‘Vergrendelen’ — één tik.'],
      risico: RISICO_STAART('Що може статися: транспорт стоятиме відімкненим на вулиці.', 'Wat er kan gebeuren: het voertuig staat ontgrendeld op straat.') },
    { sleutel: 'drone.missievoorstel', niveau: 'gevoelig', naam: ['Пропозиція місії пілотові', 'Missievoorstel aan de piloot'] },
    { sleutel: 'drone.zweven', niveau: 'gewoon', naam: ['Зависнути', 'Zweven'] },
    { sleutel: 'drone.naarhuis', niveau: 'gewoon', naam: ['Повернутися додому', 'Naar huis'] },
    { sleutel: 'drone.landen', niveau: 'gewoon', naam: ['Сісти зараз', 'Nu landen'] }
  ];
  // Власні дії — у реєстр одразу (перевірка складальника бачить їхні тексти наслідку й ризику).
  (function () {
    var G = HV.gevaar;
    if (!G || !G.acties) return;
    var bestaand = G.acties.map(function (x) { return x.sleutel; });
    EIGEN_ACTIES.forEach(function (x) { if (bestaand.indexOf(x.sleutel) < 0) { x.doel = 'mcp'; x.mcp = true; G.acties.push(x); } });
  })();
  var zorgKlaar = false;
  function zorgActies() {
    if (zorgKlaar || !HV.gevaar || !HV.gevaar.acties) return;
    zorgKlaar = true;
    var bestaand = HV.gevaar.acties.map(function (x) { return x.sleutel; });
    ZORG_ACTIES.forEach(function (x) { if (bestaand.indexOf(x.sleutel) < 0) { x.doel = 'mcp'; x.mcp = true; HV.gevaar.acties.push(x); } });
  }
  function actieVan(tool) { var a = HV.gevaar.actie(tool.sleutel); return a; }

  // ───────────────────────── Стан зони (на світ; сценарій починає зі свіжого) ─────────────────────────
  var NIVEAU_RANG = { gewoon: 0, gevoelig: 1, gevaarlijk: 2, kritiek: 3 };
  /** Українська форма множини незалежно від мови інтерфейсу (для пар [uk, nl], що зберігаються в стані). */
  function mvUk(n, f) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? f[0] : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? f[1] : f[2]; }
  function dagBegin(ms) { return ms - (((ms % DAG) + DAG) % DAG); }

  function S(w) {
    w = w || HV.staat.w;
    if (!w) return null;
    if (w.ast) return w.ast;
    zorgUitvoerders();
    var X = { teller: 0, ag: {}, gesprek: [], denkt: false, context: null, voorstellen: {}, suggesties: {}, ongewoon: {}, onbegrepen: [], taak: null, terug: {}, dagGoed: [],
      instellingen: { model: 'lokaal', budget: 200, regels: { muziek: true, gast: true, taal: true } } };
    w.ast = X;
    AGENTEN.forEach(function (a) {
      X.ag[a.id] = { verbonden: a.start !== 'los', sinds: w.tijd - (a.id === 'claude' ? 41 : a.id === 'gemini' ? 12 : 120) * DAG, pauze: null,
        kaders: { kamers: null, uren: null, budget: a.id === 'claude' ? 60 : null, termijn: null, aanwezig: 'altijd', alarm: 'kijken' },
        meesturen: { tracks: false, camera: false, notities: false, agenda: false, agenten: false } };
      X.terug[a.id] = [];
    });
    // Демо-дім: власник раніше дав агентам читання «Завжди» й кілька дій «Питати». Для нових агентів — усе «Вимкнено».
    var zet = function (u, s, v) { if (HV.gevaar.stand(u, s) === 'uit') HV.gevaar.zetStandStil(u, s, v); };
    ['claude', 'gemini', 'huisassistent'].forEach(function (u) {
      GEREEDSCHAP.forEach(function (g) {
        if (g.groep !== 'lezen' && ['mcp.tarief', 'mcp.scenes', 'mcp.regels', 'mcp.voertuigen', 'mcp.drones', 'mcp.simlezen', 'mcp.melders'].indexOf(g.sleutel) < 0) return;
        zet(u, g.sleutel, g.sleutel === 'mcp.wiethuis' ? 'uit' : g.sleutel === 'mcp.aanwezig' ? 'vragen' : 'altijd');
      });
    });
    ['licht', 'kamer.licht', 'scene.start', 'kamer.doel', 'laadpaal.laden', 'zonwering', 'mcp.regelconcept'].forEach(function (s) { zet('claude', s, 'vragen'); });
    zet('claude', 'mcp.aanwezig', 'altijd');
    ['thuisbatterij.modus', 'laadpaal.modus'].forEach(function (s) { zet('gemini', s, 'vragen'); });
    ['licht', 'kamer.licht', 'alle.licht', 'scene.start', 'kamer.doel', 'zonwering', 'media', 'mcp.regelconcept', 'slot.vergrendelen'].forEach(function (s) { zet('huisassistent', s, 'vragen'); });
    zaaiLogboek(w);
    X.gesprek.push({ id: 'g0', wie: 'assistent', tijd: w.tijd, kaart: { soort: 'samenvatting' } });
    return X;
  }
  function ag(id) { var X = S(); return X ? X.ag[id] : null; }
  function nieuwId(p) { var X = S(); return p + (++X.teller); }

  /** Історія дій агентів за минулі години: записи Журналу з часом у минулому, упорядковано за часом. */
  function zaaiLogboek(w) {
    var D = function (id) { return agentDoor(id); };
    var olena = { soort: 'mens', id: 'olena', naam: ['Олена', 'Olena'] };
    var regels = [
      { m: 26, maker: D('claude'), wat: ['Прочитано знімок дому', 'Momentopname van het huis gelezen'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.agent' },
      { m: 64, maker: D('gemini'), wat: ['Прочитано ціни на 48 годин', 'Prijzen voor 48 uur gelezen'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.agent' },
      { m: 47, maker: D('huisassistent'), wat: ['Відповідь: де відчинено вікна · 2 джерела', 'Antwoord: welke ramen open staan · 2 bronnen'], toegestaan: ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.agent' },
      { m: 185, maker: olena, wat: ['Схвалено раз: торшер 40 %', 'Eén keer goedgekeurd: staande lamp 40 %'], waarom: ['Агент Claude', 'Agent Claude'], soort: 'huis.agent' },
      { m: 184, maker: D('claude'), wat: ['Торшер: 40 %', 'Staande lamp: 40 %'], was: ['60 %', '60 %'], werd: ['40 %', '40 %'], waarom: ['«Приглуши світло — дивимося кіно» · слова агента', '‘Dim het licht, we kijken een film’ · woorden van de agent'], toegestaan: ['схвалено раз: Олена', 'één keer goedgekeurd: Olena'], soort: 'huis.apparaat' },
      { m: 410, maker: D('gemini'), wat: ['Запит: режим домашньої батареї', 'Verzoek: stand van de thuisbatterij'], waarom: ['дозвіл «Питати»', 'toestemming ‘Vragen’'], soort: 'huis.agent' },
      { m: 405, maker: olena, wat: ['Відхилено запит: режим домашньої батареї', 'Verzoek afgewezen: stand van de thuisbatterij'], waarom: ['Агент Gemini', 'Agent Gemini'], soort: 'huis.agent' },
      { m: 545, maker: D('huisassistent'), wat: ['Підсумок дня о 07:30', 'Dagoverzicht om 07:30'], toegestaan: ['шаблон, без моделі', 'sjabloon, zonder model'], soort: 'huis.agent' },
      { m: 1560, maker: D('claude'), wat: ['Не виконано: вимкнути все в домі', 'Niet uitgevoerd: alles in huis uit'], waarom: ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'], soort: 'huis.agent' },
      { m: 2900, maker: olena, wat: ['Дозвіл «Зарядка авто» для «Агент Claude»', 'Toestemming ‘Auto laden’ voor ‘Agent Claude’'], was: ['Вимкнено', 'Uit'], werd: ['Питати', 'Vragen'], soort: 'huis.systeem' }
    ];
    regels.forEach(function (r) {
      var e = { id: 'l' + (++w.logTeller), tijd: w.tijd - r.m * MIN, maker: r.maker, wat: r.wat, waarom: r.waarom || null, was: r.was || null, werd: r.werd || null,
        toegestaan: r.toegestaan || null, soort: r.soort, gewicht: 'info', doel: r.wat[1].indexOf('Staande lamp') === 0 ? 'torsher' : null, gelezen: true, sim: true };
      var i = 0;
      while (i < w.logboek.length && w.logboek[i].tijd >= e.tijd) i++;
      w.logboek.splice(i, 0, e);
    });
  }

  // ───────────────────────── Дозволи, рамки, пауза ─────────────────────────
  function stand(agentId, sleutel) { return HV.gevaar.stand(agentId, sleutel); }
  function telling(agentId) {
    var uit = { altijd: 0, vragen: 0, uit: 0, zwaar: 0 };
    GEREEDSCHAP.forEach(function (g) { var s = stand(agentId, g.sleutel); uit[s]++; if (s === 'altijd' && HV.gevaar.isZwaar(actieVan(g))) uit.zwaar++; });
    return uit;
  }
  function vandaagActies(agentId) {
    var w = HV.staat.w, begin = dagBegin(w.tijd);
    return w.logboek.filter(function (r) { return r.maker && r.maker.soort === 'agent' && r.maker.id === agentId && r.tijd >= begin && !/^Запит|^Не виконано/.test(r.wat[0]); }).length;
  }
  function kadersTekst(k) {
    var d = [];
    if (k.termijn) d.push(t('до ', 'tot ') + HV.datumKort(k.termijn));
    if (k.kamers && k.kamers.length) d.push(k.kamers.length + ' ' + HV.meervoud(k.kamers.length, ['кімната', 'кімнати', 'кімнат'], ['kamer', 'kamers']));
    if (k.uren) d.push(uurTekst(k.uren[0]) + '–' + uurTekst(k.uren[1]));
    if (k.budget) d.push(k.budget + ' ' + t('дій на добу', 'acties per dag'));
    if (k.aanwezig === 'iemand') d.push(t('лише коли хтось удома', 'alleen als er iemand thuis is'));
    if (k.aanwezig === 'niemand') d.push(t('лише коли нікого немає', 'alleen als er niemand is'));
    return d.length ? d.join(' · ') : t('без рамок', 'zonder kaders');
  }
  function uurTekst(u) { var m = Math.round(u * 60); return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
  function isEigenaar(ctx) { return (ctx ? ctx.rol : HV.rol()) === 'eigenaar'; }

  /** Чи може людина з цією роллю вирішувати запит рівня niveau (§3 зони: звичайне й чутливе — власник і мешканець). */
  function magBeslissen(rol, niveau) {
    if (rol === 'eigenaar') return true;
    if (rol === 'bewoner') return niveau === 'gewoon' || niveau === 'gevoelig';
    return false;
  }

  /**
   * hv-stand інструмента в рядку: ті самі сегменти й та сама дія ядра data-actie="stand" (HV.gevaar.zetStand: лише власник,
   * «Завжди» для небезпечного й критичного — з підтвердженням входу, запис у Журналі). Поруч — «!» (ризик, залита позначка,
   * коли діє «Завжди») для небезпечних і критичних або «i» (наслідок) для звичайних і чутливих. Рамки агента однакові для
   * всіх його інструментів, тому їхній чип стоїть один раз — у заголовку групи.
   */
  function standHtml(agentId, tool, ctx) {
    var actie = actieVan(tool), waarde = stand(agentId, actie.sleutel), zwaar = HV.gevaar.isZwaar(actie), naam = agentNaam(agentId);
    var uitleg = zwaar
      ? o.gevolg(HV.p(actie.risico || ['Що може статися: дія виконається без людини поруч. Хто зможе це запускати: цей агент. Як вимкнути: «Питати» або «Вимкнено».', 'Wat er kan gebeuren: de actie gebeurt zonder iemand erbij. Wie dit kan starten: deze agent. Uitzetten: ‘Vragen’ of ‘Uit’.']), { soort: 'uitroep', vast: waarde === 'altijd' ? actie.niveau : null, kop: t('Ризик: ', 'Risico: ') + HV.p(actie.naam) })
      : o.gevolg(t('Що станеться: ', 'Wat er gebeurt: ') + naam + t(' зможе «', ' mag ‘') + klein(HV.p(tool.wat)) + t('» сам («Завжди») або після вашого «Схвалити раз» («Питати»). Пов’язано з: кожна дія — запис у Журналі з «Повернути»; рамки агента діють і тут. Як повернути: «Вимкнено» — діє одразу.', '’ zelf (‘Altijd’) of na jouw ‘Eén keer goedkeuren’ (‘Vragen’). Hangt samen met: elke actie staat in het logboek met ‘Ongedaan maken’; de kaders van de agent gelden ook hier. Terugdraaien: ‘Uit’ — werkt direct.'), { kop: HV.p(actie.naam) });
    var lijf;
    if (ctx.rol !== 'eigenaar') {
      lijf = '<p class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span><strong>' + h(HV.p(HV.gevaar.standNamen[waarde])) + '</strong> · ' + h(t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen')) + '</span></p>';
    } else {
      lijf = '<div class="hv-stand__segmenten" role="group" aria-label="' + h(t('Дозвіл', 'Toestemming') + ': ' + tool.naam) + '">' + ['uit', 'vragen', 'altijd'].map(function (s) {
        var gekozen = s === waarde;
        return '<button type="button" class="hv-stand__deel' + (gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="stand" data-uitvoerder="' + h(agentId) + '" data-sleutel="' + h(actie.sleutel) + '" data-waarde="' + s + '">' + (gekozen ? HV.icoon('check', { maat: 's' }) : '') + '<span>' + h(HV.p(HV.gevaar.standNamen[s])) + '</span></button>';
      }).join('') + '</div>';
    }
    return '<div class="hv-stand hv-ast-stand hv-ast-stand--' + actie.niveau + (zwaar && waarde === 'altijd' ? ' is-altijd-zwaar' : '') + '" data-k="stand-' + h(agentId) + '-' + h(actie.sleutel) + '">' + lijf + uitleg + '</div>';
  }

  /** Рамки й стан агента перед дією: { gaat:true } | { vraag:[uk,nl] } | { weiger:[uk,nl] }. */
  function kadersToets(agentId, apparaat) {
    var w = HV.staat.w, A = ag(agentId), k = A.kaders;
    if (!A.verbonden) return { weiger: ['агента не під’єднано', 'de agent is niet gekoppeld'] };
    if (A.pauze) return { weiger: ['агента призупинено', 'de agent is gepauzeerd'] };
    if (w.zelfGestopt) return { weiger: ['самостійні дії зупинено', 'zelfstandige acties zijn gestopt'] };
    if (k.termijn && w.tijd > k.termijn) return { weiger: ['строк рамок минув', 'de termijn van de kaders is verlopen'] };
    if (k.alarm === 'kijken' && w.nood && !w.nood.bevestigd) return { weiger: ['під час тривоги агенти лише спостерігають', 'tijdens een alarm kijken agenten alleen mee'] };
    if (apparaat && k.kamers && k.kamers.length && k.kamers.indexOf(apparaat.kamer) < 0) return { vraag: ['кімната поза рамками агента', 'de kamer valt buiten de kaders van de agent'] };
    if (k.uren) { var u = HV.uur(w.tijd), binnen = k.uren[0] <= k.uren[1] ? (u >= k.uren[0] && u < k.uren[1]) : (u >= k.uren[0] || u < k.uren[1]); if (!binnen) return { vraag: ['поза годинами рамок: ' + uurTekst(k.uren[0]) + '–' + uurTekst(k.uren[1]), 'buiten de uren van de kaders: ' + uurTekst(k.uren[0]) + '–' + uurTekst(k.uren[1])] }; }
    if (k.budget && vandaagActies(agentId) >= k.budget) return { vraag: ['бюджет дій на добу вичерпано', 'het actiebudget voor vandaag is op'] };
    var thuis = HV.kijk.thuis().length;
    if (k.aanwezig === 'iemand' && !thuis) return { vraag: ['удома нікого немає', 'er is niemand thuis'] };
    if (k.aanwezig === 'niemand' && thuis) return { vraag: ['удома хтось є', 'er is iemand thuis'] };
    return { gaat: true };
  }

  /** Поставити запит у чергу «Чекає на вас» у форматі ядра (HV.verzoek його виконає). */
  function vraagAan(agentId, tool, opdracht, reden, extra) {
    var w = HV.staat.w, door = agentDoor(agentId), actie = actieVan(tool);
    var a = typeof opdracht.doel === 'string' ? w.apparaten[opdracht.doel] : null;
    var id = nieuwId('a');
    var wat = extra && (extra.wat || extra.gedaan) ? (extra.wat || extra.gedaan) : [actie.naam[0] + (a ? ': ' + a.naam[0] : ''), actie.naam[1] + (a ? ': ' + a.naam[1] : '')];
    HV.staat.wijzig(function (x) {
      x.verzoeken.push({ id: id, uitvoerder: agentId, sleutel: actie.sleutel, doel: opdracht.doel || 'mcp:' + tool.naam, mogelijkheid: opdracht.mogelijkheid || 'lezen', waarde: opdracht.waarde,
        sinds: x.tijd, tot: extra && extra.tot ? extra.tot : null, stand: 'wacht', wat: wat, waarom: reden, wordt: extra && extra.wordt ? extra.wordt : null,
        woorden: extra && extra.woorden ? extra.woorden : null, tool: tool.naam, mcp: !opdracht.mogelijkheid });
      if (opdracht.mogelijkheid) x.nu.push({ id: 'verzoek-' + id, soort: 'verzoek', maker: 'agent', icoon: 'circle-help', verzoek: id, sinds: x.tijd,
        tekst: [door.naam[0] + ' просить: ' + wat[0].charAt(0).toLowerCase() + wat[0].slice(1), door.naam[1] + ' vraagt: ' + wat[1].charAt(0).toLowerCase() + wat[1].slice(1)],
        acties: [{ naam: 'ast-ja', hoofd: true, label: ['Схвалити раз', 'Eén keer goedkeuren'], gegevens: { verzoek: id } }, { naam: 'ast-nee', label: ['Відхилити', 'Afwijzen'], gegevens: { verzoek: id } }] });
    });
    HV.logboek.voegToe({ maker: door, wat: ['Запит: ' + wat[0], 'Verzoek: ' + wat[1]], waarom: reden, soort: 'huis.agent', gewicht: 'belangrijk' });
    HV.meld({ maker: door, gewicht: 'belangrijk', icoon: 'circle-help', titel: t('Чекає на вас', 'Wacht op jou'), tekst: HV.p(door.naam) + ': ' + HV.p(wat) });
    return id;
  }

  /**
   * Дія агента через інструмент: рамки й пауза → дозвіл (HV.doe для пристроїв; власна перевірка для читання).
   * Повертає Promise<{ fase:'bevestigd'|'geweigerd'|'wacht'|'mislukt', reden }>.
   */
  function agentDoe(agentId, tool, opdracht, extra) {
    var w = HV.staat.w, door = agentDoor(agentId), actie = actieVan(tool);
    var a = opdracht && typeof opdracht.doel === 'string' ? w.apparaten[opdracht.doel] : null;
    var weiger = function (reden) {
      HV.logboek.voegToe({ maker: door, wat: ['Не виконано: ' + actie.naam[0].charAt(0).toLowerCase() + actie.naam[0].slice(1), 'Niet uitgevoerd: ' + actie.naam[1].charAt(0).toLowerCase() + actie.naam[1].slice(1)], waarom: reden, soort: 'huis.agent' });
      HV.staat.wijzig();
      return Promise.resolve({ fase: 'geweigerd', reden: reden });
    };
    var toets = kadersToets(agentId, a);
    if (toets.weiger) return weiger(toets.weiger);
    var s = stand(agentId, actie.sleutel);
    if (s === 'uit') return weiger(['дозвіл «Вимкнено»', 'toestemming ‘Uit’']);
    var dag = (S().dagGoed || []).filter(function (d) { return d.agent === agentId && d.sleutel === actie.sleutel && String(d.doel) === String(opdracht.doel) && d.tot > w.tijd; })[0];
    if (!dag && (s === 'vragen' || toets.vraag)) {
      var id = vraagAan(agentId, tool, opdracht, toets.vraag || ['дозвіл «Питати»', 'toestemming ‘Vragen’'], extra);
      return Promise.resolve({ fase: 'wacht', reden: ['запит у черзі', 'verzoek in de wachtrij'], verzoek: id });
    }
    if (!opdracht.mogelijkheid) {
      // читання й чернетки: без зміни світу, але з записом і знаком автора
      HV.logboek.voegToe({ maker: door, wat: extra && extra.gedaan ? extra.gedaan : [actie.naam[0], actie.naam[1]], toegestaan: dag ? ['схвалено до кінця дня', 'goedgekeurd tot einde dag'] : ['дозвіл «Завжди»', 'toestemming ‘Altijd’'], soort: 'huis.agent' });
      HV.staat.wijzig();
      return Promise.resolve({ fase: 'bevestigd' });
    }
    var was = a ? HV.huidige(a, opdracht.mogelijkheid) : null;
    return HV.doe({ doel: opdracht.doel, mogelijkheid: opdracht.mogelijkheid, waarde: opdracht.waarde, door: door, waarom: extra && extra.woorden ? extra.woorden : null, goedgekeurd: !!dag }).then(function (r) {
      if (r && r.ok) {
        if (a && was !== undefined) S().terug[agentId].push({ doel: a.id, mogelijkheid: opdracht.mogelijkheid, waarde: was, naam: a.naam });
        return { fase: 'bevestigd' };
      }
      if (r && r.reden === 'wacht') return { fase: 'wacht', reden: ['запит у черзі', 'verzoek in de wachtrij'] };
      if (r && r.reden === 'stand-uit') return { fase: 'geweigerd', reden: ['дозвіл «Вимкнено»', 'toestemming ‘Uit’'] };
      if (r && r.reden === 'gestopt') return { fase: 'geweigerd', reden: ['самостійні дії зупинено', 'zelfstandige acties zijn gestopt'] };
      return { fase: 'mislukt', reden: ['пристрій не відповів', 'het apparaat antwoordde niet'] };
    });
  }

  // ───────────────────────── Пробний виклик: план агента (симуляція) ─────────────────────────
  var PLANNEN = {
    claude: { titel: ['Кіновечір у вітальні', 'Filmavond in de woonkamer'], woorden: ['«Приглуши світло у вітальні й закрий штори — дивимося кіно»', '‘Dim het licht in de woonkamer en doe de gordijnen dicht, we kijken een film’'],
      stappen: [['tonen_huis_overzicht', null, ['Прочитати знімок дому', 'Momentopname van het huis lezen']], ['bedienen_licht', { doel: 'torsher', mogelijkheid: 'helderheid', waarde: 30 }, ['Торшер на 30 %', 'Staande lamp op 30 %']], ['bedienen_zonwering', { doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 0 }, ['Закрити штори', 'Gordijnen sluiten']]] },
    gemini: { titel: ['Дешева енергія на ніч', 'Goedkope energie voor de nacht'], woorden: ['«Підготуй дім до дешевих годин»', '‘Maak het huis klaar voor de goedkope uren’'],
      stappen: [['lezen_tarief', null, ['Прочитати ціни на 48 годин', 'Prijzen voor 48 uur lezen']], ['lezen_energie', null, ['Прочитати енергію зараз', 'Energie van nu lezen']], ['instellen_batterij', { doel: 'thuisbatterij', mogelijkheid: 'modus', waarde: 'slim' }, ['Батарея: «Розумно»', 'Thuisbatterij: ‘Slim’']]] },
    chatgpt: { titel: ['Вечір удома', 'Avond thuis'], woorden: ['«Зроби вечірнє світло»', '‘Zet het avondlicht aan’'],
      stappen: [['tonen_scenes', null, ['Прочитати сцени', 'Scènes lezen']], ['starten_scene', { doel: 'scene:avond', mogelijkheid: 'start', waarde: true }, ['Сцена «Вечір»', 'Scène ‘Avond’']]] },
    grok: { titel: ['Сонце в обід', 'Zon rond de middag'], woorden: ['«Затулити вітальню від сонця»', '‘De woonkamer tegen de zon afschermen’'],
      stappen: [['lezen_weer', null, ['Прочитати погоду', 'Weer lezen']], ['bedienen_zonwering', { doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 30 }, ['Штори на 30 %', 'Gordijnen op 30 %']]] },
    huisassistent: { titel: ['Світло в передпокої', 'Licht in de hal'], woorden: ['«Увімкни світло в передпокої»', '‘Doe het licht in de hal aan’'],
      stappen: [['uitleggen_waarom', null, ['Перевірити, чому темно', 'Nagaan waarom het donker is']], ['schakelen_kamerlicht', { doel: 'kamer:hal', mogelijkheid: 'licht', waarde: true }, ['Світло в передпокої', 'Licht in de hal']]] }
  };
  function toolOpNaam(naam) { for (var i = 0; i < GEREEDSCHAP.length; i++) if (GEREEDSCHAP[i].naam === naam) return GEREEDSCHAP[i]; return null; }

  function draai(agentId) {
    var X = S(), plan = PLANNEN[agentId];
    if (!plan) return;
    if (X.taak && !X.taak.klaar) { HV.meld({ icoon: 'hourglass', titel: t('Агент уже працює', 'De agent is al bezig'), tekst: agentNaam(X.taak.agent) + ' · ' + HV.p(X.taak.titel) }); return; }
    var taak = { id: nieuwId('t'), agent: agentId, titel: plan.titel, woorden: plan.woorden, sinds: HV.staat.w.tijd, klaar: false, gestopt: false,
      stappen: plan.stappen.map(function (s) { return { tool: s[0], opdracht: s[1], label: s[2], fase: 'gepland', reden: null }; }) };
    X.taak = taak;
    HV.staat.wijzig();
    var i = 0;
    var volgende = function () {
      if (taak.gestopt || i >= taak.stappen.length) { taak.klaar = true; taak.einde = HV.staat.w.tijd; HV.staat.wijzig(); return; }
      var stap = taak.stappen[i];
      stap.fase = 'verzonden'; HV.staat.wijzig();
      setTimeout(function () {
        if (taak.gestopt) { volgende(); return; }
        stap.fase = 'aangenomen'; HV.staat.wijzig();
        var tool = toolOpNaam(stap.tool);
        agentDoe(agentId, tool, stap.opdracht || {}, { woorden: plan.woorden, gedaan: stap.label }).then(function (r) {
          stap.fase = r.fase; stap.reden = r.reden || null;
          HV.staat.wijzig();
          i++;
          setTimeout(volgende, 420);
        });
      }, 260);
    };
    volgende();
  }

  // ───────────────────────── Спільні шматки розмітки ─────────────────────────
  function bron(a, label) {
    if (!a) return '';
    var oud = HV.kijk.leeftijd(a), verouderd = a.beschikbaar === 'verouderd' || a.beschikbaar === 'onbereikbaar';
    return o.chip({ icoon: o.beeld(a).icoon, klas: 'hv-ast-bron' + (verouderd ? ' is-verouderd' : ''), actie: 'blad', gegevens: { blad: 'apparaat:' + a.id },
      html: '<span>' + h(label || HV.p(a.naam)) + '</span><span class="hv-chip__sub">' + h(HV.oud(oud)) + '</span>', aria: t('Джерело: ', 'Bron: ') + HV.p(a.naam) + ', ' + HV.oud(oud) });
  }
  function bronnenHtml(lijst) {
    var chips = lijst.filter(Boolean);
    if (!chips.length) return '';
    return '<div class="hv-ast-bronnen"><span class="hv-ast-bronnen__kop">' + HV.icoon('link-2', { maat: 'maker' }) + h(t('Джерела', 'Bronnen')) + '</span>' + chips.join('') + '</div>';
  }
  function app(id) { return HV.staat.w.apparaten[id]; }
  function kamerNaam(id) { var k = HV.staat.kamer(id); return k ? k.naam : ['', '']; }
  function klein(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  var STAND_WOORD = {
    gepland: ['у плані', 'gepland', 'circle'], verzonden: ['надіслано', 'verzonden', 'send'], aangenomen: ['прийнято', 'aangenomen', 'hourglass'],
    bevestigd: ['підтверджено', 'bevestigd', 'circle-check'], geweigerd: ['не виконано', 'niet uitgevoerd', 'circle-x'], wacht: ['чекає на вас', 'wacht op jou', 'circle-help'], mislukt: ['не підтверджено', 'niet bevestigd', 'circle-x']
  };

  /** Картка запиту hv-ast-verzoek: хто · що · було → стане · слова агента · чому питає · хто вирішує. */
  function verzoekKaart(v, ctx, opties) {
    var w = ctx.staat, op = opties || {};
    var actie = HV.gevaar.actie(v.sleutel), wie = HV.gevaar.uitvoerder(v.uitvoerder);
    var agentId = agentDef(v.uitvoerder) ? v.uitvoerder : null;
    var a = typeof v.doel === 'string' ? w.apparaten[v.doel] : null;
    var zwaar = HV.gevaar.isZwaar(actie);
    var wacht = v.stand === 'wacht';
    var tool = toolVoor(v.sleutel);
    var wordt = '';
    if (v.wordt) wordt = HV.p(v.wordt);
    else if (a && v.mogelijkheid) {
      var nuW = HV.p(HV.beschrijf(a, v.mogelijkheid, HV.huidige(a, v.mogelijkheid))), danW = HV.p(HV.beschrijf(a, v.mogelijkheid, v.waarde));
      wordt = HV.p(a.naam) + ': ' + (nuW === danW ? danW + t(' — уже так', ' — al zo') : nuW + ' → ' + danW);
    }
    var mag = magBeslissen(ctx.rol, actie.niveau);
    var beslisser = actie.niveau === 'kritiek' ? t('Власник: рейка й підтвердження входу', 'De eigenaar: rail en bevestiging van aanmelding') : actie.niveau === 'gevaarlijk' ? t('Власник: рейка утримання', 'De eigenaar: de houdrail') : t('Власник або мешканець, якому доручено', 'De eigenaar of een bewoner met opdracht');
    var standWoord = { wacht: ['чекає', 'wacht'], goedgekeurd: ['схвалено', 'goedgekeurd'], afgewezen: ['відхилено', 'afgewezen'], verlopen: ['минув', 'verlopen'] }[v.stand] || ['чекає', 'wacht'];
    var uitkomst = v.uitkomst ? (v.uitkomst === 'uitgevoerd' ? t('виконано', 'uitgevoerd') : t('не виконано', 'niet uitgevoerd')) : '';
    var knoppen = '';
    if (wacht) {
      knoppen = mag
        ? o.knop({ tekst: t('Схвалити раз', 'Eén keer goedkeuren'), icoon: zwaar ? (actie.niveau === 'kritiek' ? 'octagon' : 'triangle') : 'check', soort: 'hoofd', klein: true, actie: 'ast-ja', gegevens: { verzoek: v.id } }) +
          (!zwaar && v.mogelijkheid ? o.knop({ tekst: t('До кінця дня', 'Tot einde dag'), icoon: 'calendar-check', klein: true, actie: 'ast-dag', gegevens: { verzoek: v.id } }) : '') +
          o.knop({ tekst: t('Відхилити', 'Afwijzen'), icoon: 'x', klein: true, actie: 'ast-nee', gegevens: { verzoek: v.id } })
        : '<p class="hv-ast-verzoek__slot">' + HV.icoon('lock', { maat: 's' }) + h(t('Вирішує власник', 'De eigenaar beslist')) + '</p>';
      if (!op.blad) knoppen += o.knop({ tekst: t('Деталі', 'Details'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'verzoek:' + v.id } });
    }
    var tot = v.tot && v.tot > w.tijd ? Math.round((v.tot - w.tijd) / MIN) : null;
    return '<article class="hv-ast-verzoek hv-ast-verzoek--' + actie.niveau + ' is-' + v.stand + '" data-k="verzoek-' + h(v.id) + '">' +
      '<header class="hv-ast-verzoek__kop">' + (agentId ? agentTeken(agentId) : '<span class="hv-ast-teken hv-toon-neutraal" aria-hidden="true">' + HV.icoon('diamond') + '</span>') +
      '<div class="hv-ast-verzoek__wie"><span class="hv-ast-verzoek__naam">' + h(HV.p(wie.naam)) + '</span><span class="hv-ast-verzoek__sub">' + h(t('просить о ', 'vraagt om ') + HV.tijd(v.sinds)) + (tool && agentId ? ' · <code>' + h(tool.naam) + '</code>' : '') + '</span></div>' +
      '<span class="hv-ast-verzoek__stand">' + o.risico(actie.niveau) + '<span class="hv-ast-verzoek__woord">' + h(HV.p(standWoord)) + (uitkomst ? ' · ' + h(uitkomst) : '') + '</span></span></header>' +
      '<h3 class="hv-ast-verzoek__wat">' + h(HV.p(v.wat)) + '</h3>' +
      (wordt ? '<p class="hv-ast-verzoek__wordt">' + HV.icoon('arrow-right-left', { maat: 's' }) + '<span>' + h(wordt) + '</span></p>' : '') +
      (zwaar && wacht ? '<p class="hv-ast-verzoek__gevolg">' + h(HV.p(actie.gevolg).split(/(?<=\.)\s/)[0]) + '</p>' : '') +
      '<dl class="hv-ast-verzoek__feiten">' +
      (v.woorden ? '<div><dt>' + h(t('Слова агента', 'Woorden van de agent')) + '</dt><dd>' + o.chip({ icoon: 'shield-alert', tekst: t('чужий текст', 'onbetrouwde tekst'), klas: 'hv-ast-wantrouw' }) + ' <q>' + h(HV.p(v.woorden).replace(/^[«‘]|[»’]$/g, '')) + '</q></dd></div>' : '') +
      '<div><dt>' + h(t('Чому питає', 'Waarom het vraagt')) + '</dt><dd>' + h(HV.p(v.waarom || ['дозвіл «Питати»', 'toestemming ‘Vragen’'])) + '</dd></div>' +
      '<div><dt>' + h(t('Хто вирішує', 'Wie beslist')) + '</dt><dd>' + h(beslisser) + '</dd></div>' +
      '<div><dt>' + h(t('Чекає до', 'Wacht tot')) + '</dt><dd>' + h(tot != null ? HV.tijd(v.tot) + ' · ' + t('ще ', 'nog ') + HV.duur(tot) : t('без строку — система свого не нав’язує', 'zonder termijn — het systeem legt er geen op')) + '</dd></div>' +
      '</dl>' + (knoppen ? '<div class="hv-ast-verzoek__knoppen">' + knoppen + '</div>' : '') + '</article>';
  }

  function wachtende() { var w = HV.staat.w; return (w.verzoeken || []).filter(function (v) { return v.stand === 'wacht'; }); }

  function wachtBlok(ctx, id, opties) {
    var lijst = wachtende(), w = ctx.staat;
    var beslist = (w.verzoeken || []).filter(function (v) { return v.stand !== 'wacht'; }).slice(-4).reverse();
    var inhoud = lijst.length
      ? '<div class="hv-ast-verzoeken">' + lijst.map(function (v) { return verzoekKaart(v, ctx); }).join('') + '</div>'
      : '<div class="hv-ast-rust">' + HV.icoon('inbox', { maat: 'l' }) + '<div><p class="hv-ast-rust__titel">' + h(t('Нічого не чекає на вас', 'Er wacht niets op je')) + '</p><p class="hv-ast-rust__tekst">' + h(t('Запити агентів за дозволом «Питати» з’являться тут і в «Зараз важливо».', 'Verzoeken van agenten met ‘Vragen’ verschijnen hier en bij ‘Nu belangrijk’.')) + '</p></div></div>';
    if (beslist.length && !(opties && opties.kort)) {
      inhoud += '<div class="hv-ast-beslist"><h3 class="hv-ast-tussenkop">' + h(t('Вирішено нещодавно', 'Recent beslist')) + '</h3><div class="hv-rijen">' + beslist.map(function (v) {
        var wie = HV.gevaar.uitvoerder(v.uitvoerder);
        var woord = { goedgekeurd: ['схвалено', 'goedgekeurd'], afgewezen: ['відхилено', 'afgewezen'], verlopen: ['минув', 'verlopen'] }[v.stand] || ['', ''];
        return o.rij({ icoon: v.stand === 'goedgekeurd' ? 'circle-check' : 'circle-x', naam: HV.p(v.wat), sub: HV.p(wie.naam) + ' · ' + HV.tijd(v.sinds), waarde: h(HV.p(woord)), actie: 'blad', gegevens: { blad: 'verzoek:' + v.id }, k: 'beslist-' + v.id });
      }).join('') + '</div></div>';
    }
    return o.blok({ id: id, titel: t('Чекає на вас', 'Wacht op jou'), teller: lijst.length || null, vast: !!lijst.length, inhoud: inhoud,
      uitleg: t('Що станеться: «Схвалити раз» виконує саме цю дію один раз; постійного дозволу звідси не видати. Пов’язано з: небезпечне схвалює власник рейкою, критичне — рейкою й підтвердженням входу. Як повернути: виконану дію можна повернути в Журналі.', 'Wat er gebeurt: ‘Eén keer goedkeuren’ voert precies deze actie één keer uit; een vaste toestemming geef je hier niet. Hangt samen met: gevaarlijk keurt de eigenaar goed met de rail, kritiek met de rail en een bevestiging van aanmelding. Terugdraaien: een uitgevoerde actie kun je in het logboek terugdraaien.'),
      samenvatting: h(t('Нічого не чекає', 'Er wacht niets')) });
  }

  // ───────────────────────── Помічник: розбір фраз ─────────────────────────
  var KAMERWOORDEN = {
    woonkamer: ['вітальн', 'зал ', 'залі', 'woonkamer', 'living', 'huiskamer'], keuken: ['кухн', 'keuken'], hal: ['передпок', 'коридор', ' hal', 'gang'],
    bijkeuken: ['підсобк', 'bijkeuken'], slaapkamer: ['спальн', 'slaapkamer'], kinderkamer: ['дитяч', 'kinderkamer'], badkamer: ['ванн', 'badkamer'],
    werkkamer: ['кабінет', 'werkkamer'], logeerkamer: ['гостьов', 'logeerkamer'], zolder: ['горищ', 'zolder'], tuin: [' сад', 'саду', 'надвор', 'tuin'], garage: ['гараж', 'garage']
  };
  var VERDIEPINGWOORDEN = { beneden: ['внизу', 'першому поверс', 'перший поверх', 'на першому', 'beneden', 'begane grond'], boven: ['нагорі', 'вгорі', 'другому поверс', 'другий поверх', 'на другому', 'boven'] };
  var SCENEWOORDEN = { avond: ['вечір', 'вечірн', 'avond'], film: ['кіно', 'фільм', 'film'], welterusten: ['добраніч', 'на ніч', 'welterusten', 'slaap lekker'], ochtend: ['ранок', 'ранков', 'ochtend'], gasten: ['гості за столом', 'гостей', 'gasten'] };
  var UIT = ['вимкн', 'вимик', 'виключ', 'погас', 'згаси', ' uit', 'uitzetten', 'uitdoen'];
  var AAN = ['увімкн', 'ввімк', 'вімкн', 'вмикн', 'увімк', 'вмик', 'включ', 'запал', ' aan', 'aanzetten', 'aandoen'];
  var LICHT = ['світл', 'ламп', 'licht', 'lamp'];
  var VRAAG = [' де ', ' що ', ' які', ' який', ' чи ', '?', 'welke', ' wat ', ' waar', ' staan ', ' staat ', ' is er'];

  function schoon(s) { return ' ' + String(s || '').toLowerCase().replace(/[’'ʼ`]/g, '\'').replace(/[.,!;:()«»“”"]/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function heeft(s, lijst) { for (var i = 0; i < lijst.length; i++) if (s.indexOf(lijst[i]) >= 0) return lijst[i]; return null; }
  function vindKamer(s) { for (var k in KAMERWOORDEN) if (heeft(s, KAMERWOORDEN[k])) return k; return null; }
  function vindVerdieping(s) { for (var v in VERDIEPINGWOORDEN) if (heeft(s, VERDIEPINGWOORDEN[v])) return v; return null; }
  function vindScene(s) { for (var c in SCENEWOORDEN) if (heeft(s, SCENEWOORDEN[c])) return c; return null; }
  function getalIn(s) { var m = s.match(/(\d+(?:[.,]\d+)?)/); return m ? Number(m[1].replace(',', '.')) : null; }

  /** Мова запиту відносно мови інтерфейсу: змішаний чи «чужий» запит дає рядок «Я зрозумів це як…». */
  function taalVan(ruw) {
    var cyr = /[а-яіїєґ]/i.test(ruw), lat = /[a-z]{3,}/i.test(ruw.replace(/\b(MCP|tv|ok)\b/gi, ''));
    if (cyr && lat) return 'gemengd';
    if (lat && HV.taal() === 'uk') return 'ander';
    if (cyr && HV.taal() === 'nl') return 'ander';
    return 'zelfde';
  }

  // Межі розмови: людина пише будь-якою мовою; відповідь — мовою інтерфейсу (обидві мови зберігаються в повідомленні).
  function begrijp(ruw) {
    var s = schoon(ruw), X = S();
    var r = { taal: taalVan(ruw) };
    var kamer = vindKamer(s), verd = vindVerdieping(s), uit = heeft(s, UIT), aan = heeft(s, AAN), licht = heeft(s, LICHT);
    if (kamer) X.context = kamer;
    if (heeft(s, ['автоматиз', 'правило', 'automatiser', ' regel ', 'maak een regel']) || (heeft(s, ['створи', 'зроби так', 'maak ', 'zorg dat']) && heeft(s, [' коли ', ' якщо ', ' als ', ' wanneer ']))) return regelVoorstel(s, r);
    if (heeft(s, ['чому', 'waarom'])) return waaromAntwoord(s, kamer, r);
    if (heeft(s, ['підсум', 'що сталося сьогодні', 'що було сьогодні', 'dagoverzicht', 'samenvatting', 'hoe was de dag', 'overzicht van vandaag'])) return { soort: 'samenvatting', taal: r.taal };
    if (heeft(s, ['відчин', 'відкрит', ' open']) && heeft(s, VRAAG) && !heeft(s, ['штор', 'gordijn', 'жалюз'])) return openAntwoord(r);
    if (heeft(s, ['хто вдома', 'хто удома', 'хто є вдома', 'хто дома', 'wie is er thuis', 'wie is thuis', 'wie zijn er thuis', 'wie zijn thuis'])) return wieAntwoord(r);
    if (heeft(s, ['ціна', 'ціну', 'скільки коштує', 'тариф', 'дешев', 'prijs', ' kost', 'tarief', 'goedkoop'])) return prijsAntwoord(r);
    if (heeft(s, ['споживан', 'енергі', 'сонце дає', 'скільки бере', 'verbruik', 'stroomverbruik', 'opbrengst', 'zonnepanelen'])) return energieAntwoord(r);
    var getal = getalIn(s);
    if (getal != null && (heeft(s, ['градус', '°', 'graden']) || (kamer && heeft(s, ['постав', 'зроби', 'зет', 'zet ', 'maak'])))) return doelVoorstel(kamer || X.context, getal, r);
    if (heeft(s, ['температур', 'тепло ', 'холодно', 'hoe warm', 'temperatuur', 'hoe koud'])) return temperatuurAntwoord(kamer, r);
    var scene = vindScene(s);
    if (scene && (heeft(s, ['сцен', 'scène', 'scene', 'запусти', 'увімкни', 'start', 'zet ']) || scene === 'welterusten')) return sceneVoorstel(scene, r);
    if (heeft(s, ['йду', 'я пішла', 'я пішов', 'ми йдемо', 'ik ga weg', 'we gaan weg'])) return standVoorstel('afwezig', r);
    if (heeft(s, ['я вдома', 'ми вдома', 'ik ben thuis', 'we zijn thuis'])) return standVoorstel('thuis', r);
    if (heeft(s, ['відімкн', 'відчини двері', 'відчини вхідні', 'ontgrendel', 'doe de deur open'])) return slotVoorstel(false, r);
    if (heeft(s, ['замкн', 'vergrendel', 'op slot'])) return slotVoorstel(true, r);
    if (heeft(s, ['штор', 'жалюз', 'gordijn', 'jaloezie', 'rolluik'])) return zonweringVoorstel(s, kamer, r);
    if (heeft(s, ['музик', 'muziek'])) return muziekVoorstel(!uit, r);
    if (uit && !licht && heeft(s, [' все ', ' усе ', 'alles'])) return allesUitVoorstel(r);
    if (licht && (uit || aan)) {
      var scope = verd ? { soort: 'verdieping', id: verd } : kamer ? { soort: 'kamer', id: kamer } : heeft(s, [' все ', ' усе ', 'всюди', 'скрізь', 'overal', 'alle ', 'усьому', 'всьому']) ? { soort: 'alle' } : null;
      if (!scope) return keuzeLicht(!!aan && !uit, r);
      return lichtVoorstel(!!aan && !uit, scope, r);
    }
    X.onbegrepen.unshift({ tekst: ruw, tijd: HV.staat.w.tijd });
    return { soort: 'onbegrepen', ruw: ruw, taal: r.taal };
  }

  function scopeNaam(scope) {
    if (scope.soort === 'alle') return ['увесь дім', 'het hele huis'];
    if (scope.soort === 'verdieping') { var v = HV.staat.w.verdiepingen.filter(function (x) { return x.id === scope.id; })[0]; return v ? [klein(v.naam[0]), klein(v.naam[1])] : ['поверх', 'verdieping']; }
    return kamerNaam(scope.id).map(klein);
  }
  function inScope(a, scope) {
    if (scope.soort === 'alle') return true;
    if (scope.soort === 'kamer') return a.kamer === scope.id;
    var k = HV.staat.kamer(a.kamer);
    return k && k.verdieping === scope.id;
  }

  function lichtVoorstel(aan, scope, r) {
    var lampen = HV.kijk.lampen().filter(function (a) { return inScope(a, scope); });
    var stappen = [], kamers = {};
    lampen.forEach(function (a) {
      var dood = a.beschikbaar === 'onbereikbaar';
      if (!dood && !!a.st.aan === aan) return;
      kamers[a.kamer] = true;
      stappen.push({ doel: a.id, mogelijkheid: 'aan', waarde: aan, naam: a.naam, kamer: kamerNaam(a.kamer), was: HV.beschrijf(a, 'aan', !!a.st.aan), wordt: HV.beschrijf(a, 'aan', aan),
        overslaan: dood ? ['недоступна — буде пропущено', 'niet bereikbaar — wordt overgeslagen'] : null });
    });
    var sn = scopeNaam(scope);
    var begrepen = [sn[0] + ', світло — ' + (aan ? 'увімкнути' : 'вимкнути'), sn[1] + ', licht — ' + (aan ? 'aan' : 'uit')];
    var echte = stappen.filter(function (x) { return !x.overslaan; });
    if (!echte.length) {
      var leeg = aan ? ['Світло тут уже горить — змінювати нічого.', 'Het licht brandt hier al — er hoeft niets te veranderen.'] : ['Світло тут уже вимкнено — змінювати нічого.', 'Het licht is hier al uit — er hoeft niets te veranderen.'];
      return { soort: 'antwoord', taal: r.taal, begrepen: begrepen, zin: leeg, rijen: lampen.slice(0, 6).map(function (a) { return { icoon: 'lightbulb', naam: a.naam, sub: kamerNaam(a.kamer), waarde: a.beschikbaar === 'onbereikbaar' ? ['недоступна', 'niet bereikbaar'] : HV.beschrijf(a, 'aan', !!a.st.aan) }; }), bronnen: lampen.slice(0, 4).map(function (a) { return a.id; }) };
    }
    var nK = Object.keys(kamers).length;
    return voorstel({ titel: [(aan ? 'Увімкнути' : 'Вимкнути') + ' світло: ' + sn[0], 'Licht ' + (aan ? 'aan' : 'uit') + ': ' + sn[1]], sleutel: 'licht', icoon: 'lightbulb',
      kop: [echte.length + ' ' + mvUk(echte.length, ['лампа', 'лампи', 'ламп']) + ', ' + nK + ' ' + mvUk(nK, ['кімната', 'кімнати', 'кімнат']), echte.length + ' ' + (echte.length === 1 ? 'lamp' : 'lampen') + ', ' + nK + ' ' + (nK === 1 ? 'kamer' : 'kamers')],
      stappen: stappen, begrepen: begrepen, taal: r.taal });
  }

  function keuzeLicht(aan, r) {
    var X = S();
    var opties = [];
    var dw = aan ? ['увімкни світло ', 'licht aan '] : ['вимкни світло ', 'licht uit '];
    if (X.context) { var kk = HV.staat.kamer(X.context); opties.push({ tekst: [dw[0] + kk.waar[0], dw[1] + kk.waar[1]], label: kk.naam }); }
    opties.push({ tekst: [dw[0] + 'внизу', dw[1] + 'beneden'], label: ['Перший поверх', 'Begane grond'] });
    opties.push({ tekst: [dw[0] + 'нагорі', dw[1] + 'boven'], label: ['Другий поверх', '1e verdieping'] });
    opties.push({ tekst: [dw[0] + 'у всьому домі', dw[1] + 'overal'], label: ['Увесь дім', 'Het hele huis'] });
    return { soort: 'keuze', taal: r.taal, zin: aan ? ['Де ввімкнути світло?', 'Waar moet het licht aan?'] : ['Де вимкнути світло?', 'Waar moet het licht uit?'], opties: opties };
  }

  function doelVoorstel(kamer, getal, r) {
    var k = kamer ? HV.staat.kamer(kamer) : null;
    if (!k || k.doel == null) {
      var met = HV.staat.w.kamers.filter(function (x) { return x.doel != null; });
      return { soort: 'keuze', taal: r.taal, zin: ['Для якої кімнати поставити ' + HV.getal(getal, 1) + ' °C?', 'Voor welke kamer ' + HV.getal(getal, 1) + ' °C instellen?'],
        opties: met.map(function (x) { return { tekst: ['зроби ' + x.waar[0] + ' ' + String(getal).replace('.', ',') + ' градусів', 'zet ' + x.waar[1] + ' op ' + String(getal).replace('.', ',') + ' graden'], label: x.naam }; }) };
    }
    var waarde = Math.max(5, Math.min(30, Math.round(getal * 2) / 2));
    return voorstel({ titel: [k.naam[0] + ': ціль ' + HV.getal(waarde, 1) + ' °C', k.naam[1] + ': doel ' + HV.getal(waarde, 1) + ' °C'], sleutel: 'kamer.doel', icoon: 'thermometer',
      kop: ['1 кімната', '1 kamer'], samengesteld: { doel: 'kamer:' + k.id, mogelijkheid: 'doel', waarde: waarde },
      stappen: [{ naam: ['Ціль температури', 'Doeltemperatuur'], kamer: k.naam, was: [HV.getal(k.doel, 1) + ' °C', HV.getal(k.doel, 1) + ' °C'], wordt: [HV.getal(waarde, 1) + ' °C', HV.getal(waarde, 1) + ' °C'] }],
      begrepen: [klein(k.naam[0]) + ', ціль температури — ' + HV.getal(waarde, 1) + ' °C', klein(k.naam[1]) + ', doeltemperatuur — ' + HV.getal(waarde, 1) + ' °C'], bronnen: [HV.kijk.temperatuur(k.id) ? HV.kijk.temperatuur(k.id).id : null], taal: r.taal });
  }

  function sceneVoorstel(id, r) {
    var w = HV.staat.w, scene = w.scenes.filter(function (s) { return s.id === id; })[0];
    if (!scene) return { soort: 'onbegrepen', ruw: id, taal: r.taal };
    var stappen = scene.stappen.map(function (st) {
      var a = w.apparaten[st.doel];
      var actie = a ? HV.gevaar.vind(a, st.mogelijkheid, st.waarde) : null;
      return { naam: a ? a.naam : [st.doel, st.doel], kamer: a ? kamerNaam(a.kamer) : ['', ''], was: a ? HV.beschrijf(a, st.mogelijkheid, HV.huidige(a, st.mogelijkheid)) : ['—', '—'], wordt: a ? HV.beschrijf(a, st.mogelijkheid, st.waarde) : ['—', '—'],
        overslaan: !a || a.beschikbaar === 'onbereikbaar' ? ['недоступний — буде пропущено', 'niet bereikbaar — wordt overgeslagen'] : actie && HV.gevaar.isZwaar(actie) && HV.gevaar.stand('scene', actie.sleutel) !== 'altijd' ? ['сцена без дозволу на цей крок — пропустить', 'de scène mist toestemming voor deze stap — slaat over'] : null };
    });
    return voorstel({ titel: ['Сцена «' + scene.naam[0] + '»', 'Scène ‘' + scene.naam[1] + '’'], sleutel: 'scene.start', icoon: scene.icoon, kop: [scene.stappen.length + ' ' + mvUk(scene.stappen.length, ['крок', 'кроки', 'кроків']), scene.stappen.length + ' stappen'],
      samengesteld: { doel: 'scene:' + id, mogelijkheid: 'start', waarde: true }, stappen: stappen, begrepen: ['сцена «' + scene.naam[0] + '» — запустити', 'scène ‘' + scene.naam[1] + '’ — starten'], taal: r.taal });
  }

  function standVoorstel(stand, r) {
    var w = HV.staat.w, naam = HV.huisstanden[stand];
    var stappen = [{ naam: ['Режим дому', 'Huisstand'], kamer: ['увесь дім', 'het hele huis'], was: HV.huisstanden[w.huisstand], wordt: naam }];
    if (stand === 'afwezig') stappen.push({ naam: ['Світло й медіа', 'Licht en media'], kamer: ['увесь дім', 'het hele huis'], was: [HV.kijk.lampenAan().length + ' увімкнено', HV.kijk.lampenAan().length + ' aan'], wordt: ['вимкнено', 'uit'] },
      { naam: ['Термостат', 'Thermostaat'], kamer: ['вітальня', 'woonkamer'], was: [HV.getal(app('thermostaat').st.doel, 1) + ' °C', HV.getal(app('thermostaat').st.doel, 1) + ' °C'], wordt: ['17 °C', '17 °C'] });
    if (stand === 'thuis') stappen.push({ naam: ['Термостат', 'Thermostaat'], kamer: ['вітальня', 'woonkamer'], was: [HV.getal(app('thermostaat').st.doel, 1) + ' °C', HV.getal(app('thermostaat').st.doel, 1) + ' °C'], wordt: ['21 °C', '21 °C'] });
    return voorstel({ titel: ['Режим «' + naam[0] + '»', 'Stand ‘' + naam[1] + '’'], sleutel: 'huis.stand', icoon: stand === 'afwezig' ? 'log-out' : 'log-in', kop: ['режим дому', 'huisstand'],
      samengesteld: { doel: 'huis', mogelijkheid: 'stand', waarde: stand }, stappen: stappen, begrepen: ['режим дому — «' + naam[0] + '»', 'huisstand — ‘' + naam[1] + '’'], taal: r.taal });
  }

  function slotVoorstel(dicht, r) {
    var a = app('voordeurslot');
    return voorstel({ titel: dicht ? ['Замкнути вхідні двері', 'Voordeur vergrendelen'] : ['Відімкнути вхідні двері', 'Voordeur ontgrendelen'], sleutel: dicht ? 'slot.vergrendelen' : 'slot.ontgrendelen', icoon: dicht ? 'lock-keyhole' : 'lock-keyhole-open',
      kop: ['1 замок', '1 slot'], stappen: [{ doel: a.id, mogelijkheid: 'vergrendeld', waarde: dicht, naam: a.naam, kamer: kamerNaam(a.kamer), was: HV.beschrijf(a, 'vergrendeld', !!a.st.vergrendeld), wordt: HV.beschrijf(a, 'vergrendeld', dicht) }],
      begrepen: [dicht ? 'вхідні двері — замкнути' : 'вхідні двері — відімкнути', dicht ? 'voordeur — vergrendelen' : 'voordeur — ontgrendelen'], bronnen: ['voordeurslot', 'voordeurcontact'], taal: r.taal, leeg: !!a.st.vergrendeld === dicht });
  }

  function zonweringVoorstel(s, kamer, r) {
    var dicht = !!heeft(s, ['закр', 'зачин', 'опуст', 'dicht', 'sluit', 'omlaag', 'neer']);
    var doelen = HV.kijk.alle(function (a) { return (a.soort === 'gordijn' || a.soort === 'jaloezie') && (!kamer || a.kamer === kamer); });
    var waarde = dicht ? 0 : 100;
    var stappen = doelen.filter(function (a) { return a.st.positie !== waarde; }).map(function (a) { return { doel: a.id, mogelijkheid: 'positie', waarde: waarde, naam: a.naam, kamer: kamerNaam(a.kamer), was: HV.beschrijf(a, 'positie', a.st.positie), wordt: HV.beschrijf(a, 'positie', waarde) }; });
    if (!stappen.length) return { soort: 'antwoord', taal: r.taal, zin: dicht ? ['Штори вже закриті.', 'De gordijnen zijn al dicht.'] : ['Штори вже відкриті.', 'De gordijnen zijn al open.'], bronnen: doelen.map(function (a) { return a.id; }) };
    return voorstel({ titel: dicht ? ['Закрити штори й жалюзі', 'Gordijnen en jaloezieën sluiten'] : ['Відкрити штори й жалюзі', 'Gordijnen en jaloezieën openen'], sleutel: 'zonwering', icoon: 'blinds',
      kop: [stappen.length + ' ' + mvUk(stappen.length, ['пристрій', 'пристрої', 'пристроїв']), stappen.length + ' ' + (stappen.length === 1 ? 'apparaat' : 'apparaten')], stappen: stappen,
      begrepen: [(kamer ? klein(kamerNaam(kamer)[0]) : 'увесь дім') + ', штори — ' + (dicht ? 'закрити' : 'відкрити'), (kamer ? klein(kamerNaam(kamer)[1]) : 'het hele huis') + ', gordijnen — ' + (dicht ? 'dicht' : 'open')], taal: r.taal });
  }

  function muziekVoorstel(aan, r) {
    var a = app('multiroom');
    return voorstel({ titel: aan ? ['Музика внизу', 'Muziek beneden'] : ['Зупинити музику внизу', 'Muziek beneden stoppen'], sleutel: 'media', icoon: 'music', kop: ['2 колонки', '2 speakers'],
      stappen: [{ doel: a.id, mogelijkheid: 'afspelen', waarde: aan, naam: a.naam, kamer: kamerNaam(a.kamer), was: !!a.st.speelt ? ['грає', 'speelt'] : ['тиша', 'stil'], wordt: aan ? ['грає', 'speelt'] : ['тиша', 'stil'] }],
      begrepen: ['музика внизу — ' + (aan ? 'увімкнути' : 'зупинити'), 'muziek beneden — ' + (aan ? 'aan' : 'stoppen')], taal: r.taal, leeg: !!a.st.speelt === aan });
  }

  function allesUitVoorstel(r) {
    var n = HV.kijk.lampenAan().length;
    return voorstel({ titel: ['Вимкнути все в домі', 'Alles in huis uit'], sleutel: 'huis.allesuit', icoon: 'power', kop: ['увесь дім', 'het hele huis'], samengesteld: { doel: 'alle', mogelijkheid: 'alles', waarde: true },
      stappen: [{ naam: ['Світло', 'Licht'], kamer: ['увесь дім', 'het hele huis'], was: [n + ' увімкнено', n + ' aan'], wordt: ['вимкнено', 'uit'] }, { naam: ['Медіа й розетки', 'Media en stekkers'], kamer: ['увесь дім', 'het hele huis'], was: ['як є', 'zoals nu'], wordt: ['вимкнено', 'uit'] },
        { naam: ['Пральна, сушильна, посудомийна', 'Was-, droog- en vaatwasmachine'], kamer: ['підсобка, кухня', 'bijkeuken, keuken'], was: [app('wasmachine').st.loopt ? 'пере' : 'готова', app('wasmachine').st.loopt ? 'wast' : 'klaar'], wordt: ['зупинено', 'gestopt'] },
        { naam: ['Холодильник, сховище, маршрутизатор', 'Koelkast, opslag, router'], kamer: ['лишаються', 'blijven'], was: ['працюють', 'aan'], wordt: ['працюють', 'aan'] }],
      begrepen: ['увесь дім — вимкнути все, крім холодильника, сховища й мережі', 'het hele huis — alles uit behalve koelkast, opslag en netwerk'], taal: r.taal });
  }

  /** Новий намір у розмові: «було → стане», рівень, дозвіл помічника, стан. */
  function voorstel(p) {
    var id = nieuwId('v'), X = S();
    var actie = HV.gevaar.actie(p.sleutel);
    var v = { id: id, titel: p.titel, sleutel: p.sleutel, niveau: actie.niveau, icoon: p.icoon, kop: p.kop, stappen: p.stappen, samengesteld: p.samengesteld || null, begrepen: p.begrepen, bronnen: p.bronnen || p.stappen.map(function (x) { return x.doel; }).filter(Boolean).slice(0, 4), stand: 'nieuw', tijd: HV.staat.w.tijd };
    if (p.leeg) v.stand = 'leeg';
    X.voorstellen[id] = v;
    return { soort: 'voorstel', voorstel: id, taal: p.taal };
  }

  function openAntwoord(r) {
    var w = HV.staat.w;
    var ramen = HV.kijk.alle(function (a) { return a.soort === 'contact'; });
    var open = ramen.filter(function (a) { return a.st.open; });
    var rijen = open.map(function (a) { var min = Math.round((w.tijd - (a.st.sinds || w.tijd)) / MIN); return { icoon: 'door-open', naam: a.naam, sub: kamerNaam(a.kamer), waarde: ['відчинено ' + HV.duur(min), 'open ' + HV.duur(min)], toon: 'let-op', blad: a.id }; });
    ['garagedeur', 'poort'].forEach(function (id) { if (w.apparaten[id].st.open) rijen.push({ icoon: 'warehouse', naam: w.apparaten[id].naam, sub: kamerNaam(w.apparaten[id].kamer), waarde: ['відчинено', 'open'], toon: 'let-op', blad: id }); });
    if (!app('voordeurslot').st.vergrendeld) rijen.push({ icoon: 'lock-keyhole-open', naam: app('voordeurslot').naam, sub: kamerNaam('hal'), waarde: ['відімкнено', 'ontgrendeld'], toon: 'let-op', blad: 'voordeurslot' });
    var zin = rijen.length
      ? ['Відчинено: ' + rijen.length + '. Решта вікон і дверей зачинені — за датчиками відкриття.', 'Open: ' + rijen.length + '. De andere ramen en deuren zijn dicht — volgens de contactsensoren.']
      : ['Усі вікна й двері зачинено, вхідні двері замкнено.', 'Alle ramen en deuren zijn dicht, de voordeur is vergrendeld.'];
    var extra = [];
    if (open.some(function (a) { return a.id === 'raamslaap'; }) && app('thermostaat').st.verwarmt) extra.push({ tekst: ['Знизити опалення в спальні до 15 °C', 'Verwarming in de slaapkamer naar 15 °C'], doel: 'kamer:slaapkamer', mogelijkheid: 'doel', waarde: 15 });
    return { soort: 'antwoord', taal: r.taal, begrepen: ['запитання: що відчинено', 'vraag: wat staat open'], zin: zin, rijen: rijen, acties: extra, bronnen: ramen.map(function (a) { return a.id; }).concat(['voordeurslot']).slice(0, 5) };
  }

  function wieAntwoord(r) {
    var thuis = HV.kijk.thuis();
    return { soort: 'antwoord', taal: r.taal, begrepen: ['запитання: хто вдома', 'vraag: wie is er thuis'],
      zin: thuis.length ? ['Удома ' + thuis.length + ' ' + mvUk(thuis.length, ['людина', 'людини', 'людей']) + '. Це чутливі дані: агентам ззовні — лише «хтось удома».', 'Thuis: ' + thuis.length + (thuis.length === 1 ? ' persoon' : ' personen') + '. Dit is gevoelig: externe agenten krijgen alleen ‘er is iemand thuis’.'] : ['Удома нікого немає — за телефонами й датчиками присутності.', 'Er is niemand thuis — volgens de telefoons en de aanwezigheidssensoren.'],
      rijen: HV.staat.w.mensen.map(function (m) { return { icoon: m.thuis ? 'user-round-check' : 'user-round-x', naam: m.naam, sub: m.zeker === 'zeker' ? ['за телефоном', 'volgens de telefoon'] : m.zeker === 'waarschijnlijk' ? ['ймовірно', 'waarschijnlijk'] : ['невідомо', 'onbekend'], waarde: m.thuis ? ['удома', 'thuis'] : ['не вдома', 'weg'] }; }),
      bronnen: ['aanwezigwerk', 'beweginghal'] };
  }

  function prijsAntwoord(r) {
    var w = HV.staat.w, nu = HV.tarief.prijs(w.tijd), goed = HV.tarief.goedkoopst(w.tijd, 18);
    var uren = []; for (var i = 0; i < 12; i++) { var tt = w.tijd - (w.tijd % UUR) + i * UUR; uren.push({ label: HV.tijd(tt), waarde: HV.tarief.prijs(tt), toon: 'net-in', nu: i === 0, vink: goed && tt === goed.tijd }); }
    return { soort: 'antwoord', taal: r.taal, begrepen: ['запитання: ціна енергії', 'vraag: prijs van energie'],
      zin: ['Зараз ' + HV.euro(nu) + ' за кВт·год. Найдешевше — о ' + HV.tijd(goed.tijd) + ': ' + HV.euro(goed.prijs) + '. Приклад: тариф симулятора.', 'Nu ' + HV.euro(nu) + ' per kWh. Het goedkoopst om ' + HV.tijd(goed.tijd) + ': ' + HV.euro(goed.prijs) + '. Voorbeeld: tarief van de simulator.'],
      grafiek: { soort: 'staven', staven: uren }, bronnen: ['p1meter'], acties: [{ tekst: ['Відкрити тариф', 'Tarief openen'], naar: 'energie-tarief' }] };
  }

  function energieAntwoord(r) {
    var e = HV.staat.w.energie;
    return { soort: 'antwoord', taal: r.taal, begrepen: ['запитання: енергія зараз', 'vraag: energie nu'],
      zin: ['Дім бере ' + HV.getal(e.huis, 1) + ' кВт, сонце дає ' + HV.getal(e.zon, 1) + ' кВт, мережа: ' + HV.getal(e.net, 1) + ' кВт.', 'Het huis gebruikt ' + HV.getal(e.huis, 1) + ' kW, de zon levert ' + HV.getal(e.zon, 1) + ' kW, het net: ' + HV.getal(e.net, 1) + ' kW.'],
      rijen: [{ icoon: 'arrow-down-to-line', naam: ['Імпорт сьогодні', 'Afname vandaag'], waarde: [HV.getal(e.vandaagIn, 1) + ' кВт·год', HV.getal(e.vandaagIn, 1) + ' kWh'] }, { icoon: 'arrow-up-from-line', naam: ['Експорт сьогодні', 'Teruglevering vandaag'], waarde: [HV.getal(e.vandaagUit, 1) + ' кВт·год', HV.getal(e.vandaagUit, 1) + ' kWh'] }, { icoon: 'sun', naam: ['Сонце сьогодні', 'Zon vandaag'], waarde: [HV.getal(e.vandaagZon, 1) + ' кВт·год', HV.getal(e.vandaagZon, 1) + ' kWh'] }],
      bronnen: ['p1meter', 'zonnepanelen', 'thuisbatterij'], acties: [{ tekst: ['Відкрити енергію', 'Energie openen'], naar: 'energie' }] };
  }

  function temperatuurAntwoord(kamer, r) {
    var w = HV.staat.w;
    var kamers = w.kamers.filter(function (k) { return HV.kijk.temperatuur(k.id) && (!kamer || k.id === kamer); });
    return { soort: 'antwoord', taal: r.taal, begrepen: [kamer ? 'температура: ' + klein(kamerNaam(kamer)[0]) : 'температура в кімнатах', kamer ? 'temperatuur: ' + klein(kamerNaam(kamer)[1]) : 'temperatuur in de kamers'],
      zin: ['Ось виміряне зараз; застаріле позначено віком.', 'Dit is wat er nu gemeten wordt; verouderde waarden staan met hun leeftijd.'],
      rijen: kamers.map(function (k) { var s = HV.kijk.temperatuur(k.id); return { icoon: 'thermometer', naam: k.naam, sub: k.doel != null ? ['ціль ' + HV.getal(k.doel, 1) + ' °C', 'doel ' + HV.getal(k.doel, 1) + ' °C'] : ['без цілі', 'zonder doel'], waarde: [HV.getal(s.st.waarde, 1) + ' °C' + (s.beschikbaar === 'verouderd' ? ' · ' + HV.oud(HV.kijk.leeftijd(s)) : ''), HV.getal(s.st.waarde, 1) + ' °C' + (s.beschikbaar === 'verouderd' ? ' · ' + HV.oud(HV.kijk.leeftijd(s)) : '')], blad: s.id }; }),
      bronnen: kamers.slice(0, 4).map(function (k) { return HV.kijk.temperatuur(k.id).id; }) };
  }

  // «Чому це сталося»: ланцюжок «що запустило → умова → дія» без моделі, з фактів стану й Журналу.
  function waaromKeten(onderwerp) {
    var w = HV.staat.w;
    if (onderwerp === 'verwarming') {
      var th = app('thermostaat'), temp = HV.kijk.temperatuur('woonkamer'), wp = app('warmtepomp');
      var regel = w.huisstand === 'thuis' ? ['Режим дому «Вдома» тримає ' + HV.getal(th.st.doel, 1) + ' °C; його поставило правило «Ранок у будні»', 'De huisstand ‘Thuis’ houdt ' + HV.getal(th.st.doel, 1) + ' °C aan; die zette de regel ‘Doordeweekse ochtend’']
        : ['Режим дому «' + HV.huisstanden[w.huisstand][0] + '» тримає ' + HV.getal(th.st.doel, 1) + ' °C', 'De huisstand ‘' + HV.huisstanden[w.huisstand][1] + '’ houdt ' + HV.getal(th.st.doel, 1) + ' °C aan'];
      var keten = [
        { label: ['Що запустило', 'Aanleiding'], maker: { soort: 'systeem', naam: ['Датчик температури', 'Temperatuursensor'] },
          wat: temp.st.waarde < th.st.doel ? ['У вітальні ' + HV.getal(temp.st.waarde, 1) + ' °C — нижче цілі ' + HV.getal(th.st.doel, 1) + ' °C', 'In de woonkamer is het ' + HV.getal(temp.st.waarde, 1) + ' °C — onder het doel van ' + HV.getal(th.st.doel, 1) + ' °C'] : ['У вітальні ' + HV.getal(temp.st.waarde, 1) + ' °C — ціль досягнуто', 'In de woonkamer is het ' + HV.getal(temp.st.waarde, 1) + ' °C — het doel is bereikt'], bron: temp.id },
        { label: ['Умова', 'Voorwaarde'], maker: { soort: 'automatisering', naam: ['Ранок у будні', 'Doordeweekse ochtend'] }, wat: regel, bron: 'thermostaat' },
        { label: ['Дія', 'Actie'], maker: th.maker || { soort: 'systeem', naam: ['Термостат', 'Thermostaat'] },
          wat: th.st.verwarmt ? ['Термостат гріє; тепловий насос подає ' + HV.getal(wp.st.aanvoer, 1) + ' °C (COP ' + HV.getal(wp.st.cop, 1) + ')', 'De thermostaat verwarmt; de warmtepomp levert ' + HV.getal(wp.st.aanvoer, 1) + ' °C (COP ' + HV.getal(wp.st.cop, 1) + ')'] : ['Термостат зараз не гріє — тримає ціль', 'De thermostaat verwarmt nu niet — hij houdt het doel vast'], bron: 'warmtepomp' }
      ];
      var letOp = app('raamslaap').st.open ? { tekst: ['Вікно в спальні відчинене ' + HV.duur(Math.round((w.tijd - (app('raamslaap').st.sinds || w.tijd)) / MIN)) + ' — тепло виходить.', 'Het slaapkamerraam staat ' + HV.duur(Math.round((w.tijd - (app('raamslaap').st.sinds || w.tijd)) / MIN)) + ' open — de warmte gaat naar buiten.'], actie: { tekst: ['Знизити до 15 °C у спальні', 'Slaapkamer naar 15 °C'], doel: 'kamer:slaapkamer', mogelijkheid: 'doel', waarde: 15 } } : null;
      return { titel: th.st.verwarmt ? ['Чому увімкнулося опалення', 'Waarom de verwarming aan ging'] : ['Чому опалення не гріє', 'Waarom de verwarming niet verwarmt'], keten: keten, let: letOp, bronnen: [temp.id, 'thermostaat', 'warmtepomp', 'raamslaap'] };
    }
    var a = w.apparaten[onderwerp];
    if (!a) return null;
    var log = w.logboek.filter(function (x) { return x.doel === a.id; })[0];
    var wie = log ? log.maker : a.maker;
    if (!wie) return { titel: ['Чому: ' + a.naam[0], 'Waarom: ' + a.naam[1]], keten: [], onbekend: true, bronnen: [a.id] };
    return { titel: ['Чому: ' + a.naam[0], 'Waarom: ' + a.naam[1]], bronnen: [a.id], keten: [
      { label: ['Що запустило', 'Aanleiding'], maker: wie, wat: log && log.waarom ? log.waarom : wie.soort === 'mens' ? ['Людина торкнулася органа керування', 'Iemand bediende het apparaat'] : ['Подія без збереженої причини', 'Een gebeurtenis zonder bewaarde oorzaak'] },
      { label: ['Умова', 'Voorwaarde'], maker: { soort: 'systeem', naam: ['Дозволи', 'Toestemmingen'] }, wat: log && log.toegestaan ? log.toegestaan : ['ритуал людини: звичайна дія — одразу', 'ritueel van een mens: gewone actie — direct'] },
      { label: ['Дія', 'Actie'], maker: wie, wat: log ? log.wat : [a.naam[0] + ': ' + o.beeld(a).woord, a.naam[1] + ': ' + o.beeld(a).woord], bron: a.id }
    ] };
  }

  function waaromAntwoord(s, kamer, r) {
    var onderwerp = null;
    if (heeft(s, ['опален', 'гріє', 'тепл', 'батаре', 'насос', 'verwarm', 'warmtepomp', 'kachel', 'warm'])) onderwerp = 'verwarming';
    else if (heeft(s, LICHT)) { var l = HV.kijk.lampen(kamer || S().context).filter(function (a) { return a.st.aan; })[0] || HV.kijk.lampenAan()[0]; onderwerp = l ? l.id : null; }
    else if (heeft(s, ['штор', 'gordijn'])) onderwerp = 'gordijnwoon';
    else if (heeft(s, ['двер', 'замок', 'deur', 'slot'])) onderwerp = 'voordeurslot';
    else if (heeft(s, ['музик', 'колонк', 'muziek', 'speaker'])) onderwerp = 'speakerkeuken';
    if (!onderwerp) return { soort: 'keuze', taal: r.taal, zin: ['Про що саме запитати «чому»?', 'Waarover precies ‘waarom’?'], opties: [{ tekst: ['чому увімкнулося опалення?', 'waarom staat de verwarming aan?'], label: ['Опалення', 'Verwarming'] }, { tekst: ['чому горить світло?', 'waarom brandt het licht?'], label: ['Світло', 'Licht'] }, { tekst: ['чому закрилися штори?', 'waarom gingen de gordijnen dicht?'], label: ['Штори', 'Gordijnen'] }] };
    return { soort: 'waarom', onderwerp: onderwerp, taal: r.taal, begrepen: ['запитання «чому»: ' + (onderwerp === 'verwarming' ? 'опалення' : klein(app(onderwerp).naam[0])), 'vraag ‘waarom’: ' + (onderwerp === 'verwarming' ? 'verwarming' : klein(app(onderwerp).naam[1]))] };
  }

  // «Створи автоматизацію»: чернетка правила для редактора (Коли / Якщо / Тоді) з оцінкою спрацювань.
  function regelVoorstel(s, r) {
    var wanneer = null, inschatting = null;
    if (heeft(s, ['всі пішли', 'усі пішли', 'нікого нема', 'нікого вдома', 'всі вийшли', 'усі вийшли', 'iedereen weg', 'iedereen vertrokken', 'niemand thuis', 'we weg zijn'])) { wanneer = { soort: 'aanwezig', wie: 'iedereen', komt: false }; inschatting = 21; }
    else if (heeft(s, ['хтось прийшов', 'хтось приходить', 'хто перший', 'iemand thuiskomt', 'iemand komt'])) { wanneer = { soort: 'aanwezig', wie: 'iemand', komt: true }; inschatting = 27; }
    else if (heeft(s, ['захід', 'сонце сідає', 'стемніє', 'zonsondergang', 'zon onder', 'donker wordt'])) { wanneer = { soort: 'zon', wat: 'onder', min: 0 }; inschatting = 30; }
    else if (heeft(s, ['рух', 'beweging'])) { wanneer = { soort: 'beweging', doel: 'beweginghal' }; inschatting = 140; }
    else if (heeft(s, ['вікно', 'raam']) && heeft(s, ['відчин', 'open'])) { wanneer = { soort: 'open', doel: heeft(s, ['дитяч', 'kinder']) ? 'raamkinder' : 'raamslaap', min: getalIn(s) || 10 }; inschatting = 9; }
    else { var uur = s.match(/\s(?:о|об|om)\s+(\d{1,2})(?::(\d{2}))?/); if (uur) { wanneer = { soort: 'tijd', uur: Number(uur[1]) + (uur[2] ? Number(uur[2]) / 60 : 0), dagen: [1, 2, 3, 4, 5, 6, 7] }; inschatting = 30; } }
    var dan = [], danZin = null;
    var lampen = HV.kijk.lampen();
    var rk = vindKamer(s);
    if (rk && rk !== 'hal') lampen = lampen.filter(function (a) { return a.kamer === rk; });
    if (heeft(s, LICHT) && heeft(s, UIT)) { dan = lampen.map(function (a) { return { soort: 'apparaat', doel: a.id, mogelijkheid: 'aan', waarde: false, fout: 'doorgaan' }; }); danZin = rk && rk !== 'hal' && lampen.length ? ['вимкнути світло ' + HV.staat.kamer(rk).waar[0], 'licht ' + HV.staat.kamer(rk).waar[1] + ' uit'] : ['вимкнути все світло (' + lampen.length + ' ' + mvUk(lampen.length, ['лампа', 'лампи', 'ламп']) + ')', 'alle lampen uit (' + lampen.length + ')']; }
    else if (heeft(s, LICHT) && heeft(s, AAN)) { var l = vindKamer(s) === 'tuin' ? 'tuinlicht' : vindKamer(s) === 'hal' ? 'hallicht' : 'torsher'; dan = [{ soort: 'apparaat', doel: l, mogelijkheid: 'aan', waarde: true, fout: 'doorgaan' }]; danZin = ['увімкнути: ' + klein(app(l).naam[0]), 'aan: ' + klein(app(l).naam[1])]; }
    else if (heeft(s, ['штор', 'gordijn'])) { dan = [{ soort: 'apparaat', doel: 'gordijnwoon', mogelijkheid: 'positie', waarde: 0, fout: 'doorgaan' }]; danZin = ['закрити штори', 'gordijnen sluiten']; }
    else if (heeft(s, ['опален', 'знизь', 'verwarming', 'lager'])) { var k = wanneer && wanneer.soort === 'open' && wanneer.doel === 'raamkinder' ? 'kinderkamer' : 'slaapkamer'; dan = [{ soort: 'kamerdoel', kamer: k, waarde: 15, fout: 'doorgaan' }]; danZin = ['ціль ' + HV.staat.kamer(k).waar[0] + ' — 15 °C', 'doel ' + HV.staat.kamer(k).waar[1] + ' op 15 °C']; }
    if (!wanneer || !dan.length) {
      return { soort: 'keuze', taal: r.taal, zin: !wanneer ? ['Коли має спрацювати правило?', 'Wanneer moet de regel starten?'] : ['Що має зробити правило?', 'Wat moet de regel doen?'],
        opties: !wanneer ? [{ tekst: ['створи автоматизацію: коли всі пішли — вимкни світло', 'maak een automatisering: als iedereen weg is, lampen uit'], label: ['Коли всі пішли', 'Als iedereen weg is'] }, { tekst: ['створи автоматизацію: коли сонце сідає — закрий штори', 'maak een automatisering: bij zonsondergang gordijnen dicht'], label: ['Із заходом сонця', 'Bij zonsondergang'] }, { tekst: ['створи автоматизацію: о 23 — вимкни світло', 'maak een automatisering: om 23 lampen uit'], label: ['О 23:00', 'Om 23:00'] }]
          : [{ tekst: ['створи автоматизацію: коли всі пішли — вимкни світло', 'maak een automatisering: als iedereen weg is, lampen uit'], label: ['Вимкнути світло', 'Lampen uit'] }, { tekst: ['створи автоматизацію: коли всі пішли — закрий штори', 'maak een automatisering: als iedereen weg is, gordijnen dicht'], label: ['Закрити штори', 'Gordijnen dicht'] }] };
    }
    var wanneerZin = wanneer.soort === 'aanwezig' ? (wanneer.komt ? ['хтось приходить додому', 'iemand komt thuis'] : ['усі пішли з дому', 'iedereen is vertrokken']) : wanneer.soort === 'zon' ? ['сонце сідає', 'de zon gaat onder'] : wanneer.soort === 'beweging' ? ['рух у передпокої', 'beweging in de hal'] : wanneer.soort === 'open' ? ['вікно ' + (wanneer.doel === 'raamkinder' ? 'в дитячій' : 'в спальні') + ' відчинене понад ' + HV.duur(wanneer.min), 'het raam ' + (wanneer.doel === 'raamkinder' ? 'in de kinderkamer' : 'in de slaapkamer') + ' staat langer dan ' + HV.duur(wanneer.min) + ' open'] : ['о ' + uurTekst(wanneer.uur) + ' щодня', 'om ' + uurTekst(wanneer.uur) + ' elke dag'];
    var id = nieuwId('r');
    S().voorstellen[id] = { id: id, soort: 'regel', stand: 'nieuw', wanneer: wanneer, dan: dan, wanneerZin: wanneerZin, danZin: danZin, inschatting: inschatting, ruw: s.trim(), regelId: null,
      naam: [wanneerZin[0].charAt(0).toUpperCase() + wanneerZin[0].slice(1) + ' — ' + danZin[0].replace(/ \(.*\)$/, ''), wanneerZin[1].charAt(0).toUpperCase() + wanneerZin[1].slice(1) + ' — ' + danZin[1].replace(/ \(.*\)$/, '')] };
    return { soort: 'regel', voorstel: id, taal: r.taal, begrepen: ['нове правило: коли ' + wanneerZin[0] + ' — ' + danZin[0], 'nieuwe regel: als ' + wanneerZin[1] + ' — ' + danZin[1]] };
  }

  /** Зберегти чернетку в редакторі «Автоматики» (світ w.auto, якщо розділ уже створив його). Повертає id правила або null. */
  function bewaarRegel(v) {
    var w = HV.staat.w;
    if (!w.auto) {
      // розділ «Автоматика» створює свій стан під час першого показу — показуємо його вкладку один раз «на сухо»
      try { var s = HV.schermen.automatiseringen, tab = s && (s.tabs || []).filter(function (x) { return x.id === 'regels'; })[0]; if (tab && !tab.voorlopig) tab.render(HV.ctx()); } catch (e) { /* без розділу чернетка лишається тут */ }
    }
    if (!w.auto || !Array.isArray(w.auto.regels)) return null;
    var id = 'assistent' + (++S().teller);
    var maker = agentDoor('huisassistent');
    var snap = JSON.parse(JSON.stringify({ naam: v.naam, wanneer: [v.wanneer], als: { wijze: 'alle', lijst: [] }, dan: v.dan, opties: { nietVaker: 1, stabiel: 0, naUitval: 'inhalen' }, standen: ['thuis', 'afwezig', 'nacht', 'vakantie', 'gasten'] }));
    w.auto.regels.push({ id: id, naam: v.naam, icoon: v.wanneer.soort === 'zon' ? 'sunset' : v.wanneer.soort === 'aanwezig' ? 'log-out' : 'workflow', kamer: 'hal', fase: 'concept', uit: false, pauze: null, quarantaine: false,
      namens: HV.mens().id, versie: 1, maker: maker, wanneer: snap.wanneer, als: snap.als, dan: snap.dan, opties: snap.opties, standen: snap.standen,
      laatst: null, runs: [], versies: [{ nr: 1, tijd: w.tijd, maker: maker, wat: ['Створено помічником із фрази', 'Aangemaakt door de assistent uit een zin'], snap: snap }], treffers: 0, loopt: null, werk: null, fouten: 0 });
    return id;
  }

  // ───────────────────────── Помічник: розмова ─────────────────────────
  function stuur(tekst) {
    var X = S(), ruw = String(tekst || '').trim();
    if (!ruw) return;
    if (X.denkt) return;
    X.gesprek.push({ id: nieuwId('g'), wie: 'mens', tekst: ruw.slice(0, 280), tijd: HV.staat.w.tijd });
    X.denkt = true;
    HV.staat.wijzig();
    setTimeout(function () {
      var antwoord;
      try { antwoord = begrijp(ruw); } catch (e) { if (window.console) console.error('[assistent] ' + (e && e.stack ? e.stack : e)); antwoord = { soort: 'onbegrepen', ruw: ruw }; }
      X.denkt = false;
      X.gesprek.push({ id: nieuwId('g'), wie: 'assistent', tijd: HV.staat.w.tijd, kaart: antwoord });
      if (X.gesprek.length > 40) X.gesprek.splice(1, X.gesprek.length - 40);
      HV.logboek.voegToe({ maker: agentDoor('huisassistent'), wat: ['Відповідь помічника: ' + ruw.slice(0, 48), 'Antwoord van de assistent: ' + ruw.slice(0, 48)], toegestaan: ['запит людини', 'vraag van een mens'], soort: 'huis.agent' });
      // помічник із дозволом «Завжди» виконує намір одразу, з «Повернути» у сповіщенні
      if (antwoord.soort === 'voorstel') {
        var v = X.voorstellen[antwoord.voorstel];
        if (v && v.stand === 'nieuw' && magZelf(v)) voerVoorstelUit(v, 'agent');
      }
      HV.staat.wijzig();
      setTimeout(function () {
        var el = document.querySelector('.hv-ast-gesprek__lijst > :last-child');
        if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(false); } }
      }, 60);
    }, 650);
  }
  /** Помічник діє сам лише за дозволом «Завжди» на ключ наміру, без паузи й без зупинки самостійних дій. */
  function magZelf(v) {
    var A = ag('huisassistent');
    return HV.gevaar.stand('huisassistent', v.sleutel) === 'altijd' && !A.pauze && !HV.staat.w.zelfGestopt && !HV.gevaar.isZwaar(HV.gevaar.actie(v.sleutel));
  }

  function voerVoorstelUit(v, wie) {
    var door = wie === 'agent' ? agentDoor('huisassistent') : HV.mens();
    var waarom = ['через Помічника: ' + v.begrepen[0], 'via de assistent: ' + v.begrepen[1]];
    v.stand = 'bezig';
    HV.staat.wijzig();
    var klaar = function (ok, wacht) { v.stand = ok ? 'uitgevoerd' : wacht ? 'gevraagd' : 'mislukt'; v.wie = wie; v.klaarOm = HV.staat.w.tijd; HV.staat.wijzig(); };
    if (v.samengesteld) {
      return HV.doe({ doel: v.samengesteld.doel, mogelijkheid: v.samengesteld.mogelijkheid, waarde: v.samengesteld.waarde, door: door, waarom: waarom }).then(function (r) {
        if (r && r.reden === 'geannuleerd') { v.stand = 'nieuw'; HV.staat.wijzig(); return; }
        klaar(r && r.ok, r && r.reden === 'wacht');
      });
    }
    var stappen = v.stappen.filter(function (s) { return s.doel && !s.overslaan; });
    if (stappen.length === 1) {
      return HV.doe({ doel: stappen[0].doel, mogelijkheid: stappen[0].mogelijkheid, waarde: stappen[0].waarde, door: door, waarom: waarom }).then(function (r) {
        if (r && r.reden === 'geannuleerd') { v.stand = 'nieuw'; HV.staat.wijzig(); return; }
        klaar(r && r.ok, r && r.reden === 'wacht');
      });
    }
    var vorige = stappen.map(function (s) { var a = app(s.doel); return { doel: s.doel, mogelijkheid: s.mogelijkheid, waarde: HV.huidige(a, s.mogelijkheid) }; });
    return Promise.all(stappen.map(function (s) { return HV.doe({ doel: s.doel, mogelijkheid: s.mogelijkheid, waarde: s.waarde, door: door, stil: true, waarom: waarom }); })).then(function (rs) {
      var ok = rs.filter(function (r) { return r && r.ok; }).length;
      klaar(ok > 0, false);
      v.gelukt = ok;
      HV.meld({ maker: door, icoon: v.icoon, titel: HV.p(v.titel), tekst: t('виконано: ', 'uitgevoerd: ') + ok + t(' з ', ' van ') + stappen.length,
        terug: function () { vorige.forEach(function (x) { HV.doe({ doel: x.doel, mogelijkheid: x.mogelijkheid, waarde: x.waarde, door: door, stil: true, zonderRitueel: true, waarom: ['повернуто', 'ongedaan gemaakt'] }); }); v.stand = 'teruggedraaid'; HV.staat.wijzig(); } });
    });
  }

  // ── Розмітка повідомлень ──
  function begrepenHtml(k) {
    if (!k.begrepen) return '';
    var nadruk = k.taal && k.taal !== 'zelfde';
    return '<p class="hv-ast-begrepen' + (nadruk ? ' is-nadruk' : '') + '">' + HV.icoon(nadruk ? 'languages' : 'scan-text', { maat: 's' }) + '<span>' + h(t('Я зрозумів це як: ', 'Ik begreep dit als: ') + HV.p(k.begrepen)) + '</span>' +
      o.knop({ tekst: t('Виправити', 'Corrigeren'), soort: 'stil', klein: true, actie: 'ast-corrigeer', gegevens: { id: k._id || '' } }) + '</p>';
  }
  function rijenHtml(rijen) {
    if (!rijen || !rijen.length) return '';
    return '<ul class="hv-ast-feiten">' + rijen.map(function (x, i) {
      var lijf = '<span class="hv-ast-feiten__teken' + (x.toon ? ' hv-toon-' + x.toon : '') + '">' + HV.icoon(x.icoon || 'circle', { maat: 's' }) + '</span><span class="hv-ast-feiten__naam">' + h(HV.p(x.naam)) + (x.sub ? '<span class="hv-ast-feiten__sub">' + h(HV.p(x.sub)) + '</span>' : '') + '</span><span class="hv-ast-feiten__waarde">' + h(HV.p(x.waarde)) + '</span>';
      return '<li data-k="feit-' + i + '">' + (x.blad ? '<button type="button" class="hv-ast-feiten__rij" data-actie="blad" data-blad="apparaat:' + h(x.blad) + '">' + lijf + HV.icoon('chevron-right', { maat: 's', klas: 'hv-ast-feiten__pijl' }) + '</button>' : '<div class="hv-ast-feiten__rij">' + lijf + '</div>') + '</li>';
    }).join('') + '</ul>';
  }

  function voorstelHtml(v, ctx) {
    var actie = HV.gevaar.actie(v.sleutel), zwaar = HV.gevaar.isZwaar(actie);
    var st = HV.gevaar.stand('huisassistent', v.sleutel), A = ag('huisassistent');
    var rijen = v.stappen.map(function (s, i) {
      return '<li class="hv-ast-voorstel__rij' + (s.overslaan ? ' is-overslaan' : '') + '" data-k="stap-' + i + '"><span class="hv-ast-voorstel__naam">' + h(HV.p(s.naam)) + '<span class="hv-ast-voorstel__kamer">' + h(HV.p(s.kamer)) + '</span></span>' +
        (s.overslaan ? '<span class="hv-ast-voorstel__over">' + HV.icoon('unplug', { maat: 's' }) + h(HV.p(s.overslaan)) + '</span>'
          : '<span class="hv-ast-voorstel__delta"><span class="hv-ast-voorstel__was">' + h(HV.p(s.was)) + '</span>' + HV.icoon('arrow-right', { maat: 's', klas: 'hv-ast-voorstel__pijl' }) + '<span class="hv-ast-voorstel__wordt">' + h(HV.p(s.wordt)) + '</span></span>') + '</li>';
    }).join('');
    var standZin;
    if (v.stand === 'leeg') standZin = t('Уже так — змінювати нічого.', 'Het is al zo — er verandert niets.');
    else if (A.pauze) standZin = t('Помічника призупинено — виконаєте ви самі.', 'De assistent is gepauzeerd — je voert het zelf uit.');
    else if (zwaar) standZin = t('Небезпечна дія: помічник лише готує, виконує людина рейкою.', 'Gevaarlijke actie: de assistent bereidt voor, een mens voert uit met de rail.');
    else if (st === 'altijd') standZin = t('Дозвіл помічника «Завжди»: виконує сам, з «Повернути» на 10 с.', 'Toestemming van de assistent ‘Altijd’: voert zelf uit, met ‘Ongedaan maken’ 10 s.');
    else if (st === 'vragen') standZin = t('Дозвіл помічника «Питати»: виконає після вашого «Виконати».', 'Toestemming van de assistent ‘Vragen’: voert uit na jouw ‘Uitvoeren’.');
    else standZin = t('Дозвіл помічника «Вимкнено»: «Виконати» — це ваша дія.', 'Toestemming van de assistent ‘Uit’: ‘Uitvoeren’ is jouw eigen actie.');
    var staat = { nieuw: '', bezig: t('виконується', 'bezig'), uitgevoerd: t('виконано', 'uitgevoerd'), mislukt: t('не виконано', 'niet uitgevoerd'), afgewezen: t('відхилено', 'afgewezen'), gevraagd: t('чекає на вас', 'wacht op jou'), teruggedraaid: t('повернуто', 'ongedaan gemaakt'), leeg: t('уже так', 'al zo') }[v.stand];
    var knoppen = '';
    if (v.stand === 'nieuw') {
      var mag = HV.gevaar.rolMag(ctx.rol, actie).mag;
      knoppen = (mag ? o.knop({ tekst: t('Виконати', 'Uitvoeren'), icoon: zwaar ? (actie.niveau === 'kritiek' ? 'octagon' : 'triangle') : 'play', soort: 'hoofd', klein: true, actie: 'ast-voer', gegevens: { voorstel: v.id } })
        : '<span class="hv-ast-verzoek__slot">' + HV.icoon('lock', { maat: 's' }) + h(t('Немає доступу для вашої ролі', 'Geen toegang voor jouw rol')) + '</span>') +
        o.knop({ tekst: t('Змінити', 'Wijzigen'), icoon: 'pencil', klein: true, actie: 'ast-wijzig', gegevens: { voorstel: v.id } }) +
        o.knop({ tekst: t('Відхилити', 'Afwijzen'), icoon: 'x', klein: true, actie: 'ast-weg', gegevens: { voorstel: v.id } });
    } else if (v.stand === 'uitgevoerd') {
      knoppen = o.knop({ tekst: t('Чому це сталося', 'Waarom gebeurde dit'), icoon: 'git-commit-horizontal', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'waarom:' + (v.stappen[0] && v.stappen[0].doel ? v.stappen[0].doel : 'verwarming') } }) +
        o.knop({ tekst: t('У Журналі', 'In het logboek'), icoon: 'scroll-text', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'activiteit' } });
    }
    return '<article class="hv-ast-voorstel hv-ast-voorstel--' + actie.niveau + ' is-' + v.stand + '" data-k="voorstel-' + h(v.id) + '">' +
      '<header class="hv-ast-voorstel__kop"><span class="hv-ast-voorstel__teken">' + HV.icoon(v.icoon || 'sparkles') + '</span><div class="hv-ast-voorstel__titels"><span class="hv-ast-voorstel__soort">' + h(t('Намір', 'Voornemen') + ' · ' + HV.p(v.kop)) + '</span><h3 class="hv-ast-voorstel__titel">' + h(HV.p(v.titel)) + '</h3></div>' +
      '<span class="hv-ast-voorstel__rechts">' + o.risico(actie.niveau) + (staat ? '<span class="hv-ast-voorstel__staat">' + h(staat) + '</span>' : '') + '</span></header>' +
      '<div class="hv-ast-voorstel__kolomkop" aria-hidden="true"><span>' + h(t('Пристрій', 'Apparaat')) + '</span><span>' + h(t('Було → стане', 'Was → wordt')) + '</span></div>' +
      '<ul class="hv-ast-voorstel__rijen">' + rijen + '</ul>' +
      '<p class="hv-ast-voorstel__toestemming">' + HV.icoon(st === 'altijd' ? 'shield-check' : st === 'vragen' ? 'shield-question' : 'shield-off', { maat: 's' }) + '<span>' + h(standZin) + '</span>' + (zwaar ? o.gevolg(HV.p(actie.gevolg), { kop: HV.p(actie.naam) }) : '') + '</p>' +
      bronnenHtml((v.bronnen || []).map(function (id) { return bron(app(id)); })) +
      (knoppen ? '<div class="hv-ast-voorstel__knoppen">' + knoppen + '</div>' : '') + '</article>';
  }

  function ketenHtml(k, opties) {
    if (!k) return '';
    var lijst = k.onbekend ? '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('circle-help', { maat: 's' }) + h(t('Причина невідома: пристрій змінився без запису (наприклад, вручну на самому пристрої).', 'Oorzaak onbekend: het apparaat veranderde zonder regel (bijvoorbeeld met de hand op het apparaat zelf).')) + '</p>'
      : '<ol class="hv-ast-keten">' + k.keten.map(function (x, i) {
        return '<li data-k="keten-' + i + '"><span class="hv-ast-keten__label">' + h(HV.p(x.label)) + '</span><span class="hv-ast-keten__wat">' + h(HV.p(x.wat)) + '</span><span class="hv-ast-keten__wie">' + o.maker(x.maker) + '</span></li>';
      }).join('') + '</ol>';
    var letHtml = k.let ? '<div class="hv-ast-let">' + HV.icoon('triangle-alert', { maat: 's' }) + '<p>' + h(HV.p(k.let.tekst)) + '</p>' + o.knop({ tekst: HV.p(k.let.actie.tekst), klein: true, actie: 'ast-doe', gegevens: { doel: k.let.actie.doel, mogelijkheid: k.let.actie.mogelijkheid, waarde: k.let.actie.waarde } }) + '</div>' : '';
    return '<div class="hv-ast-waarom" data-k="waarom-' + h(opties && opties.k || '') + '">' + lijst + letHtml + bronnenHtml((k.bronnen || []).map(function (id) { return bron(app(id)); })) + '</div>';
  }

  function regelHtml(v, ctx) {
    var staat = { nieuw: '', bewaard: t('чернетку збережено', 'concept bewaard'), afgewezen: t('відхилено', 'afgewezen') }[v.stand];
    var knoppen = v.stand === 'nieuw'
      ? o.knop({ tekst: t('Зберегти чернетку', 'Concept bewaren'), icoon: 'save', soort: 'hoofd', klein: true, actie: 'ast-regel', gegevens: { voorstel: v.id } }) +
        o.knop({ tekst: t('Змінити', 'Wijzigen'), icoon: 'pencil', klein: true, actie: 'ast-wijzig', gegevens: { voorstel: v.id } }) +
        o.knop({ tekst: t('Відхилити', 'Afwijzen'), icoon: 'x', klein: true, actie: 'ast-weg', gegevens: { voorstel: v.id } })
      : v.stand === 'bewaard' ? o.knop({ tekst: t('Відкрити в редакторі', 'In de editor openen'), icoon: 'square-pen', soort: 'hoofd', klein: true, actie: 'ga', gegevens: { naar: v.regelId ? 'automatiseringen-regel-' + v.regelId : 'automatiseringen' } }) : '';
    var sectie = function (label, icoon, tekst) { return '<li><span class="hv-ast-regel__label">' + HV.icoon(icoon, { maat: 's' }) + h(label) + '</span><span class="hv-ast-regel__wat">' + h(tekst) + '</span></li>'; };
    return '<article class="hv-ast-regel is-' + v.stand + '" data-k="regel-' + h(v.id) + '">' +
      '<header class="hv-ast-voorstel__kop"><span class="hv-ast-voorstel__teken">' + HV.icoon('workflow') + '</span><div class="hv-ast-voorstel__titels"><span class="hv-ast-voorstel__soort">' + h(t('Чернетка правила', 'Concept van een regel')) + '</span><h3 class="hv-ast-voorstel__titel">' + h(HV.p(v.naam)) + '</h3></div>' +
      '<span class="hv-ast-voorstel__rechts">' + o.chip({ icoon: 'pencil-line', tekst: t('Чернетка', 'Concept') }) + (staat ? '<span class="hv-ast-voorstel__staat">' + h(staat) + '</span>' : '') + '</span></header>' +
      '<ol class="hv-ast-regel__delen">' + sectie(t('Коли', 'Wanneer'), 'zap', HV.p(v.wanneerZin)) + sectie(t('Якщо', 'Als'), 'filter', t('без умов — можна додати в редакторі', 'zonder voorwaarden — toe te voegen in de editor')) + sectie(t('Тоді', 'Dan'), 'play', HV.p(v.danZin)) + '</ol>' +
      '<div class="hv-ast-regel__schatting">' + o.getal({ maat: 'm', label: t('спрацювало б за 30 днів', 'zou in 30 dagen starten'), waarde: '≈ ' + v.inschatting, sub: h(t('оцінка за історією присутності · симуляція', 'schatting op de aanwezigheidsgeschiedenis · simulatie')) }) +
      '<p class="hv-ast-regel__pad">' + HV.icoon('route', { maat: 's' }) + h(t('Чернетка нічого не робить. Після збереження в редакторі правило стартує «у спостереженні»: 7 днів лише записує, що зробило б, і чекає вашого «Увімкнути».', 'Een concept doet niets. Na het bewaren in de editor start de regel ‘meekijkend’: 7 dagen noteert hij alleen wat hij zou doen en wacht op jouw ‘Aanzetten’.')) + '</p></div>' +
      (knoppen ? '<div class="hv-ast-voorstel__knoppen">' + knoppen + '</div>' : '') + '</article>';
  }

  function samenvattingHtml(ctx) {
    var w = ctx.staat, e = w.energie, uur = HV.uur(w.tijd), ochtend = uur < 13;
    var kosten = Math.max(0, e.vandaagIn * 0.27 - e.vandaagUit * 0.09);
    var ramen = HV.kijk.open().length, slot = app('voordeurslot').st.vergrendeld;
    var agentActies = w.logboek.filter(function (r) { return r.maker && r.maker.soort === 'agent' && r.tijd >= dagBegin(w.tijd); }).length;
    var onderhoud = HV.kijk.alle(function (a) { return a.beschikbaar === 'onbereikbaar' || (a.soort === 'batterij' && a.st.waarde < 15); });
    var rij = function (icoon, toon, tekst, actie) { return '<li class="hv-ast-sam__rij">' + '<span class="hv-ast-sam__teken hv-toon-' + toon + '">' + HV.icoon(icoon, { maat: 's' }) + '</span><span class="hv-ast-sam__tekst">' + h(tekst) + '</span>' + (actie || '') + '</li>'; };
    return '<section class="hv-ast-sam" data-k="sam" aria-label="' + h(t('Підсумок дня', 'Dagoverzicht')) + '">' +
      '<header class="hv-ast-sam__kop"><div><span class="hv-ast-sam__soort">' + h(t('Підсумок дня', 'Dagoverzicht')) + ' · ' + (ochtend ? '07:30' : '21:30') + '</span><h3 class="hv-ast-sam__titel">' + h(ochtend ? t('Доброго ранку. Ось що сталося за ніч.', 'Goedemorgen. Dit gebeurde er vannacht.') : t('Добрий вечір. Ось як минув день.', 'Goedenavond. Zo ging de dag.')) + '</h3></div>' +
      '<span class="hv-ast-sam__sjabloon">' + HV.icoon('file-text', { maat: 'maker' }) + h(t('шаблон, без моделі ШІ', 'sjabloon, zonder AI-model')) + '</span></header>' +
      '<div class="hv-ast-sam__getallen">' +
      o.getal({ maat: 'm', label: t('імпорт', 'afname'), waarde: HV.maat(e.vandaagIn, t('кВт·год', 'kWh'), 1) }) +
      o.getal({ maat: 'm', label: t('сонце', 'zon'), waarde: HV.maat(e.vandaagZon, t('кВт·год', 'kWh'), 1), toon: 'zon' }) +
      o.getal({ maat: 'm', label: t('витрати · приклад', 'kosten · voorbeeld'), waarde: HV.euro(kosten) }) +
      o.getal({ maat: 'm', label: t('дій агентів', 'acties van agenten'), waarde: String(agentActies) }) + '</div>' +
      '<ul class="hv-ast-sam__rijen">' +
      rij(slot ? 'lock-keyhole' : 'lock-keyhole-open', slot ? 'ok' : 'let-op', slot ? t('Вхідні двері замкнено', 'De voordeur is vergrendeld') : t('Вхідні двері відімкнено', 'De voordeur is ontgrendeld'), o.knop({ tekst: t('Відкрити', 'Openen'), soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:voordeurslot' } })) +
      rij('door-open', ramen ? 'let-op' : 'ok', ramen ? t('Відчинено вікон: ', 'Ramen open: ') + ramen : t('Вікна зачинено', 'Ramen dicht'), ramen ? o.knop({ tekst: t('Де саме', 'Welke'), soort: 'stil', klein: true, actie: 'ast-vraag', gegevens: { tekst: t('де відчинено вікна?', 'welke ramen staan open?') } }) : '') +
      rij('inbox', wachtende().length ? 'let-op' : 'ok', wachtende().length ? t('Запитів агентів чекає: ', 'Verzoeken van agenten wachten: ') + wachtende().length : t('Запитів агентів немає', 'Geen verzoeken van agenten'), wachtende().length ? o.knop({ tekst: t('До черги', 'Naar de wachtrij'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen-agenten' } }) : '') +
      (onderhoud.length ? rij('wrench', 'let-op', t('Потребує уваги: ', 'Vraagt aandacht: ') + onderhoud.map(function (a) { return HV.p(a.naam) + (a.soort === 'batterij' ? ' ' + HV.maat(a.st.waarde, '%').replace(/<[^>]+>/g, '') : ' — ' + HV.woord.onbereikbaar()); }).join(', '), o.knop({ tekst: t('Обслуговування', 'Onderhoud'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'activiteit-onderhoud' } })) : '') +
      '</ul>' + bronnenHtml([bron(app('p1meter')), bron(app('voordeurslot')), bron(app('raamslaap'))]) + '</section>';
  }

  function berichtHtml(m, ctx) {
    var X = S();
    if (m.wie === 'mens') {
      return '<li class="hv-ast-bericht hv-ast-bericht--mens" data-k="' + h(m.id) + '"><div class="hv-ast-bericht__bel"><p>' + h(m.tekst) + '</p></div><span class="hv-ast-bericht__tijd">' + h(HV.p(HV.mens().naam)) + ' · ' + HV.tijd(m.tijd) + '</span></li>';
    }
    var k = m.kaart || {}, lijf = '';
    k._id = m.id;
    if (k.soort === 'samenvatting') lijf = samenvattingHtml(ctx);
    else if (k.soort === 'voorstel') { var v = X.voorstellen[k.voorstel]; lijf = '<p class="hv-ast-bericht__zin">' + h(v && v.stand === 'leeg' ? t('Перевірив: усе вже так.', 'Nagekeken: het is al zo.') : t('Ось що зміниться. Перевірте й підтвердьте.', 'Dit gaat er veranderen. Kijk het na en bevestig.')) + '</p>' + begrepenHtml({ begrepen: v.begrepen, taal: k.taal, _id: m.id }) + voorstelHtml(v, ctx); }
    else if (k.soort === 'regel') { var r = X.voorstellen[k.voorstel]; lijf = '<p class="hv-ast-bericht__zin">' + h(t('Підготував чернетку правила. Без вашого збереження вона нічого не робить.', 'Ik heb een concept van een regel gemaakt. Zonder dat jij het bewaart, doet het niets.')) + '</p>' + begrepenHtml(k) + regelHtml(r, ctx); }
    else if (k.soort === 'waarom') { var kk = waaromKeten(k.onderwerp); lijf = '<p class="hv-ast-bericht__zin">' + h(HV.p(kk.titel)) + t(' — ланцюжок із фактів, без здогадів.', ' — een keten van feiten, zonder gissen.') + '</p>' + begrepenHtml(k) + ketenHtml(kk, { k: m.id }) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити повністю', 'Volledig openen'), icoon: 'panel-right-open', klein: true, actie: 'blad', gegevens: { blad: 'waarom:' + k.onderwerp } }) + '</div>'; }
    else if (k.soort === 'antwoord') {
      var graf = k.grafiek && k.grafiek.soort === 'staven' ? HV.grafiek.staven({ id: 'ast-' + m.id, titel: t('Ціна на 12 годин', 'Prijs voor 12 uur'), eenheid: '€', decimalen: 2, tikken: 3, hoogte: 120, staven: k.grafiek.staven, samenvatting: t('Галочка — найдешевша година.', 'Het vinkje is het goedkoopste uur.') }) : '';
      lijf = '<p class="hv-ast-bericht__zin">' + h(HV.p(k.zin)) + '</p>' + begrepenHtml(k) + rijenHtml(k.rijen) + (graf ? '<div class="hv-ast-grafiek">' + graf + '</div>' : '') +
        ((k.acties || []).length ? '<div class="hv-knoppen">' + k.acties.map(function (x) { return x.naar ? o.knop({ tekst: HV.p(x.tekst), icoon: 'arrow-right', klein: true, actie: 'ga', gegevens: { naar: x.naar } }) : o.knop({ tekst: HV.p(x.tekst), icoon: 'thermometer', klein: true, actie: 'ast-doe', gegevens: { doel: x.doel, mogelijkheid: x.mogelijkheid, waarde: x.waarde } }); }).join('') + '</div>' : '') +
        bronnenHtml((k.bronnen || []).map(function (id) { return bron(app(id)); }));
    }
    else if (k.soort === 'keuze') lijf = '<p class="hv-ast-bericht__zin">' + h(HV.p(k.zin)) + '</p><div class="hv-ast-keuze" role="group" aria-label="' + h(HV.p(k.zin)) + '">' + k.opties.map(function (x, i) { return o.chip({ icoon: 'corner-down-right', tekst: HV.p(x.label), klas: 'hv-ast-keuzechip', actie: 'ast-vraag', gegevens: { tekst: HV.p(x.tekst) }, k: 'keuze-' + m.id + '-' + i }); }).join('') + '</div>';
    else if (k.soort === 'onbegrepen') lijf = '<p class="hv-ast-bericht__zin">' + h(t('Не зрозумів «', 'Ik begreep ‘') + k.ruw + t('». Нічого не виконано.', '’ niet. Er is niets uitgevoerd.')) + '</p>' +
      '<p class="hv-ast-bericht__hulp">' + h(t('Я знаю світло, клімат, штори, сцени, режими дому, двері, ціни, енергію, «чому» й чернетки правил. Спробуйте так:', 'Ik ken licht, klimaat, gordijnen, scènes, huisstanden, deuren, prijzen, energie, ‘waarom’ en concepten van regels. Probeer zo:')) + '</p>' +
      '<div class="hv-ast-keuze">' + VOORBEELDEN.slice(0, 3).map(function (x, i) { return o.chip({ icoon: 'corner-down-right', tekst: HV.p(x), klas: 'hv-ast-keuzechip', actie: 'ast-vraag', gegevens: { tekst: HV.p(x) }, k: 'hulp-' + m.id + '-' + i }); }).join('') + '</div>';
    return '<li class="hv-ast-bericht hv-ast-bericht--assistent" data-k="' + h(m.id) + '">' + agentTeken('huisassistent') + '<div class="hv-ast-bericht__lijf">' + lijf + '<span class="hv-ast-bericht__tijd">' + h(t('Помічник дому', 'Huisassistent')) + ' · ' + HV.tijd(m.tijd) + '</span></div></li>';
  }

  var VOORBEELDEN = [
    ['вимкни все світло внизу', 'alle lampen beneden uit'],
    ['де відчинено вікна?', 'welke ramen staan open?'],
    ['чому увімкнулося опалення?', 'waarom staat de verwarming aan?'],
    ['створи автоматизацію: коли всі пішли — вимкни світло', 'maak een automatisering: als iedereen weg is, lampen uit'],
    ['зроби в спальні 19 градусів', 'zet de slaapkamer op 19 graden'],
    ['скільки коштує енергія зараз?', 'wat kost stroom nu?'],
    ['запусти сцену кіно', 'start de scène film'],
    ['підсумок дня', 'dagoverzicht']
  ];

  function assistentStaat(ctx) {
    var X = S(), A = X.ag.huisassistent, w = ctx.staat;
    if (w.gegevens === 'geen') return { id: 'geen', icoon: 'wifi-off', toon: 'neutraal', woord: t('недоступний', 'niet beschikbaar'), sub: t('немає зв’язку з домом; Команда й сцени працюють і без помічника', 'geen verbinding met het huis; Opdracht en scènes werken ook zonder assistent') };
    if (ctx.rol === 'gast') return { id: 'bekijken', icoon: 'eye', toon: 'neutraal', woord: t('лише перегляд', 'alleen bekijken'), sub: t('гість може питати, але не керувати', 'een gast mag vragen, niet bedienen') };
    if (A.pauze) return { id: 'pauze', icoon: 'pause', toon: 'let-op', woord: t('призупинено', 'gepauzeerd'), sub: t('відповідає, але сам нічого не виконує', 'antwoordt, maar voert zelf niets uit') };
    if (X.denkt) return { id: 'denkt', icoon: 'loader', toon: 'sim', woord: t('думає', 'denkt na'), sub: t('розбирає фразу', 'ontleedt de zin') };
    var open = Object.keys(X.voorstellen).filter(function (k) { return X.voorstellen[k].stand === 'nieuw'; }).length;
    if (open) return { id: 'wacht', icoon: 'circle-help', toon: 'let-op', woord: t('чекає вашого рішення', 'wacht op je besluit'), sub: t('є намір без відповіді', 'er is een voornemen zonder antwoord') };
    var gebruikt = w.logboek.filter(function (r) { return r.maker && r.maker.id === 'huisassistent' && r.tijd >= dagBegin(w.tijd); }).length;
    if (gebruikt >= X.instellingen.budget) return { id: 'budget', icoon: 'battery-low', toon: 'let-op', woord: t('бюджет вичерпано', 'budget op'), sub: t('до півночі — лише Команда й сцени', 'tot middernacht alleen Opdracht en scènes') };
    return { id: 'gereed', icoon: 'circle-check', toon: 'ok', woord: t('готовий', 'gereed'), sub: t('розуміє українську й нідерландську', 'begrijpt Oekraïens en Nederlands') };
  }

  // ───────────────────────── Сторінка «Помічник» ─────────────────────────
  var SUGGESTIES = [
    { id: 'raam', icoon: 'door-open', wat: ['Знижувати опалення, коли вікно спальні відчинене понад 10 хв', 'De verwarming lager zetten als het slaapkamerraam langer dan 10 min open staat'],
      bewijs: ['Вікно було відчинене під час опалення 9 разів за 14 днів, разом 6 год', 'Het raam stond 9 keer in 14 dagen open terwijl de verwarming aan was, samen 6 u'],
      zin: ['створи автоматизацію: коли вікно в спальні відчинене 10 хв — знизь опалення', 'maak een automatisering: als het raam in de slaapkamer 10 min open staat, verwarming lager'] },
    { id: 'tuin', icoon: 'trees', wat: ['Вимикати світло в саду о 23:00', 'De tuinverlichting om 23:00 uitzetten'],
      bewijs: ['Світло в саду горіло після 23:00 у 5 із 7 останніх ночей', 'De tuinverlichting brandde na 23:00 in 5 van de laatste 7 nachten'],
      zin: ['створи автоматизацію: о 23 — вимкни світло в саду', 'maak een automatisering: om 23 de tuinverlichting uit'] },
    { id: 'weg', icoon: 'log-out', wat: ['Вимикати світло, коли всі пішли', 'Het licht uitzetten als iedereen weg is'],
      bewijs: ['У 6 із 10 будніх ранків після 08:15 лишалися ввімкнені 2–3 лампи', 'Op 6 van 10 werkdagen bleven er na 08:15 nog 2 à 3 lampen aan'],
      zin: ['створи автоматизацію: коли всі пішли — вимкни світло', 'maak een automatisering: als iedereen weg is, lampen uit'] }
  ];
  var ONGEWOON = [
    { id: 'koelkast', icoon: 'refrigerator', doel: 'koelkast', wat: ['Холодильник учора спожив 1,9 кВт·год — на 38 % більше за звичайне', 'De koelkast gebruikte gisteren 1,9 kWh — 38 % meer dan normaal'],
      uitleg: ['Буває, коли дверцята довго відчинені або ущільнювач зносився.', 'Dat gebeurt als de deur lang open stond of de afdichting versleten is.'], reeks: [1.32, 1.36, 1.38, 1.35, 1.37, 1.41, 1.9], eenheid: ['кВт·год', 'kWh'] },
    { id: 'bureau', icoon: 'plug', doel: 'stekkerbureau', wat: ['Розетка стола вночі тримала 118 Вт — зазвичай 4 Вт', 'De bureaustekker trok ’s nachts 118 W — normaal 4 W'],
      uitleg: ['Ймовірно, комп’ютер не заснув. За ніч це ≈ € 0,25 · приклад.', 'Waarschijnlijk sliep de computer niet. Per nacht ≈ € 0,25 · voorbeeld.'], reeks: [4, 5, 4, 6, 5, 4, 118], eenheid: ['Вт', 'W'] }
  ];

  function suggestieBlok(ctx) {
    var X = S();
    var lijst = SUGGESTIES.filter(function (s) { var st = X.suggesties[s.id]; return !st || st === 'gemaakt'; });
    if (!lijst.length) return '';
    return o.blok({ id: 'ast-suggesties', titel: t('Пропозиції', 'Suggesties'), teller: lijst.filter(function (s) { return !X.suggesties[s.id]; }).length || null,
      uitleg: t('Що станеться: «Створити» готує чернетку правила в розмові; без вашого збереження вона нічого не робить. Пов’язано з: пропозиції — з історії дому, не з моделі. Як повернути: «Ніколи» прибирає пропозицію назавжди.', 'Wat er gebeurt: ‘Maken’ zet een concept van een regel in het gesprek; zonder dat jij het bewaart, doet het niets. Hangt samen met: suggesties komen uit de geschiedenis van het huis, niet uit een model. Terugdraaien: ‘Nooit’ haalt de suggestie voorgoed weg.'),
      inhoud: '<div class="hv-ast-kaarten">' + lijst.map(function (s) {
        var gemaakt = X.suggesties[s.id] === 'gemaakt';
        return '<article class="hv-ast-suggestie' + (gemaakt ? ' is-gemaakt' : '') + '" data-k="sug-' + s.id + '"><span class="hv-ast-suggestie__teken">' + HV.icoon(s.icoon) + '</span><div class="hv-ast-suggestie__tekst"><h3>' + h(HV.p(s.wat)) + '</h3><p>' + HV.icoon('chart-no-axes-column', { maat: 'maker' }) + h(HV.p(s.bewijs)) + '</p></div>' +
          '<div class="hv-ast-suggestie__knoppen">' + (gemaakt ? o.chip({ icoon: 'check', tekst: t('чернетку створено', 'concept gemaakt'), toon: 'ok' }) :
            o.knop({ tekst: t('Створити', 'Maken'), icoon: 'plus', soort: 'hoofd', klein: true, actie: 'ast-sug', gegevens: { id: s.id, wat: 'maak' } }) + o.knop({ tekst: t('Не зараз', 'Niet nu'), klein: true, actie: 'ast-sug', gegevens: { id: s.id, wat: 'later' } }) + o.knop({ tekst: t('Ніколи', 'Nooit'), soort: 'stil', klein: true, actie: 'ast-sug', gegevens: { id: s.id, wat: 'nooit' } })) + '</div></article>';
      }).join('') + '</div>', samenvatting: h(HV.p(lijst[0].wat)) });
  }

  function ongewoonBlok(ctx) {
    var X = S(), w = ctx.staat;
    var lijst = ONGEWOON.filter(function (x) { return !X.ongewoon[x.id]; });
    if (!lijst.length) return '';
    var dagen = []; for (var i = 6; i >= 0; i--) dagen.push(dagBegin(w.tijd) - i * DAG);
    return o.blok({ id: 'ast-ongewoon', titel: t('Незвичне', 'Ongewoon'), teller: lijst.length,
      inhoud: '<div class="hv-ast-kaarten">' + lijst.map(function (x) {
        var graf = HV.grafiek.lijn({ id: 'ongewoon-' + x.id, titel: HV.p(x.wat).split(' — ')[0], eenheid: HV.p(x.eenheid), hoogte: 120,
          x: { min: dagen[0], max: dagen[6], tikken: [{ x: dagen[0], label: HV.datumKort(dagen[0]) }, { x: dagen[6], label: t('учора', 'gisteren') }], format: HV.datumKort },
          reeksen: [{ naam: HV.p(x.eenheid), toon: 'net-in', punten: x.reeks.map(function (v, j) { return [dagen[j], v]; }) }],
          samenvatting: HV.p(x.wat) + '. ' + t('Симуляція.', 'Simulatie.') });
        return '<article class="hv-ast-ongewoon" data-k="ong-' + x.id + '"><header class="hv-ast-ongewoon__kop"><span class="hv-ast-suggestie__teken hv-toon-let-op">' + HV.icoon(x.icoon) + '</span><div><h3>' + h(HV.p(x.wat)) + '</h3><p>' + h(HV.p(x.uitleg)) + '</p></div></header>' + graf +
          '<div class="hv-knoppen">' + o.knop({ tekst: t('Це нормально', 'Dit is normaal'), icoon: 'check', klein: true, actie: 'ast-normaal', gegevens: { id: x.id } }) + o.knop({ tekst: t('Показати пристрій', 'Apparaat tonen'), icoon: 'arrow-right', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:' + x.doel } }) + '</div></article>';
      }).join('') + '</div>', samenvatting: h(HV.p(lijst[0].wat)), dicht: false });
  }

  function instellingenBlok(ctx) {
    var X = S(), I = X.instellingen, eigenaar = isEigenaar(ctx), w = ctx.staat;
    var gebruikt = w.logboek.filter(function (r) { return r.maker && r.maker.id === 'huisassistent' && r.tijd >= dagBegin(w.tijd); }).length;
    var REGELS = [['muziek', ['Не вмикати музику після 22:00', 'Na 22:00 geen muziek aanzetten']], ['gast', ['Коли вдома гість — лише пропонувати, не виконувати', 'Met een gast thuis alleen voorstellen, niet uitvoeren']], ['taal', ['Відповідати мовою запиту', 'Antwoorden in de taal van de vraag']]];
    var slot = '<p class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span>' + h(t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen')) + '</span></p>';
    var model = o.kaart({ titel: t('Модель і бюджет', 'Model en budget'), k: 'ast-model', extra: o.gevolg(t('Що станеться: хмарна модель розуміє складніші фрази, але бачить знімок дому. Пов’язано з: «Що бачить агент» і згода дорослих на присутність. Як повернути: оберіть «Локальна» — діє одразу.', 'Wat er gebeurt: een cloudmodel begrijpt moeilijkere zinnen, maar ziet de momentopname van het huis. Hangt samen met: ‘Wat de agent ziet’ en de toestemming van volwassenen voor aanwezigheid. Terugdraaien: kies ‘Lokaal’ — werkt direct.'), { kop: t('Модель', 'Model') }), inhoud:
      (eigenaar ? o.segment({ label: t('Модель', 'Model'), waarde: I.model, actie: 'ast-model', opties: [{ id: 'lokaal', label: t('Локальна', 'Lokaal'), icoon: 'house' }, { id: 'cloud', label: t('Хмарна', 'Cloud'), icoon: 'cloud' }] }) : slot) +
      '<div class="hv-ast-budget"><span>' + h(t('Запитів на добу', 'Vragen per dag')) + '<span class="hv-ast-budget__sub">' + h(t('використано ', 'gebruikt ') + gebruikt + t(' з ', ' van ') + I.budget) + '</span></span>' +
      (eigenaar ? o.stapper({ actie: 'ast-budget', stap: 50, label: t('Бюджет запитів', 'Budget voor vragen'), waarde: String(I.budget), k: 'ast-budget' }) : '<strong>' + I.budget + '</strong>') + '</div>' +
      '<div class="hv-ast-balk" aria-hidden="true"><i style="width:' + Math.min(100, Math.round(gebruikt / I.budget * 100)) + '%"></i></div>' });
    var regels = o.kaart({ titel: t('Правила дому', 'Huisregels'), k: 'ast-huisregels', inhoud: '<div class="hv-rijen">' + REGELS.map(function (r) {
      return '<div class="hv-rij" data-k="hr-' + r[0] + '"><span class="hv-rij__naam">' + h(HV.p(r[1])) + '</span>' + (eigenaar ? o.schakel({ aan: !!I.regels[r[0]], icoon: I.regels[r[0]] ? 'check' : 'x', toon: 'ok', actie: 'ast-huisregel', gegevens: { regel: r[0] }, aria: HV.p(r[1]) }) : '<span class="hv-rij__waarde">' + h(I.regels[r[0]] ? t('увімкнено', 'aan') : t('вимкнено', 'uit')) + '</span>') + '</div>';
    }).join('') + '</div>' });
    var weet = o.kaart({ titel: t('Що знає помічник', 'Wat de assistent weet'), k: 'ast-weet', inhoud: '<div class="hv-rijen">' +
      o.rij({ icoon: 'layout-grid', naam: t('Кімнати й поверхи', 'Kamers en verdiepingen'), waarde: String(w.kamers.length) }) +
      o.rij({ icoon: 'cpu', naam: t('Пристрої', 'Apparaten'), waarde: String(w.volgorde.length) }) +
      o.rij({ icoon: 'sparkles', naam: t('Сцени', 'Scènes'), waarde: String(w.scenes.length) }) +
      o.rij({ icoon: 'users', naam: t('Люди — лише імена й ролі', 'Mensen — alleen namen en rollen'), waarde: String(w.mensen.length) }) +
      o.rij({ icoon: 'messages-square', naam: t('Розмова цього сеансу', 'Gesprek van deze sessie'), waarde: String(X.gesprek.length - 1) }) + '</div>' +
      '<div class="hv-knoppen">' + o.knop({ tekst: t('Забути розмову', 'Gesprek vergeten'), icoon: 'eraser', klein: true, actie: 'ast-vergeet' }) + o.knop({ tekst: t('Що бачить помічник', 'Wat de assistent ziet'), icoon: 'eye', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen-agenten-huisassistent' } }) + '</div>' });
    var niet = o.kaart({ titel: t('Не зрозумів', 'Niet begrepen'), k: 'ast-niet', inhoud: X.onbegrepen.length ? '<div class="hv-rijen">' + X.onbegrepen.slice(0, 5).map(function (x, i) {
      return '<div class="hv-rij" data-k="nb-' + i + '"><span class="hv-rij__teken">' + HV.icoon('message-circle-question', { maat: 's' }) + '</span><span class="hv-rij__naam">«' + h(x.tekst) + '»<span class="hv-rij__sub">' + HV.tijd(x.tijd) + '</span></span>' + o.knop({ tekst: t('Ще раз', 'Opnieuw'), klein: true, actie: 'ast-vraag', gegevens: { tekst: x.tekst } }) + '</div>';
    }).join('') + '</div>' : '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('check', { maat: 's' }) + h(t('Усі фрази цього сеансу зрозуміло.', 'Alle zinnen van deze sessie zijn begrepen.')) + '</p>' });
    var stem = o.kaart({ titel: t('Голос', 'Spraak'), k: 'ast-stem', extra: o.later(t('пізніше', 'later')), inhoud:
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('mic-off', { maat: 's' }) + h(t('Мікрофон сайту вимкнено політикою браузера, доки не ухвалено рішення «Камера, мікрофон і місце». Голосом небезпечне й критичне не виконується — запит іде на екран.', 'De microfoon van de site staat uit via het browserbeleid tot het besluit ‘Camera, microfoon en locatie’. Gevaarlijk en kritiek gaat niet met de stem — het verzoek gaat naar het scherm.')) + '</p>' +
      '<table class="hv-ast-tabel"><thead><tr><th scope="col">' + h(t('Мова', 'Taal')) + '</th><th scope="col">' + h(t('Рушій', 'Motor')) + '</th></tr></thead><tbody>' +
      '<tr><td>' + h(t('Українська', 'Oekraïens')) + '</td><td>' + h(t('локальний', 'lokaal')) + '</td></tr><tr><td>' + h(t('Нідерландська', 'Nederlands')) + '</td><td>' + h(t('локальний', 'lokaal')) + '</td></tr><tr><td>' + h(t('Змішана', 'Gemengd')) + '</td><td>' + h(t('хмарний, за згодою', 'cloud, met toestemming')) + '</td></tr></tbody></table>' +
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('history', { maat: 's' }) + h(t('Журнал мікрофонів: мікрофон ще не вмикався.', 'Microfoonlogboek: de microfoon is nog nooit aangezet.')) + '</p>' });
    return o.blok({ id: 'ast-instellingen', titel: t('Налаштування помічника', 'Instellingen van de assistent'), dicht: true, samenvatting: h((I.model === 'lokaal' ? t('Локальна модель', 'Lokaal model') : t('Хмарна модель', 'Cloudmodel')) + ' · ' + I.budget + t(' запитів на добу', ' vragen per dag')),
      inhoud: '<div class="hv-ast-instellingen">' + model + regels + weet + niet + stem + '</div>' });
  }

  function gesprekHtml(ctx) {
    var X = S(), w = ctx.staat;
    var context = X.context ? '<span class="hv-ast-context">' + o.chip({ icoon: 'map-pin', tekst: t('кімната: ', 'kamer: ') + HV.p(kamerNaam(X.context)), toon: 'sim' }) + o.icoonknop({ icoon: 'x', maat: 's', aria: t('Прибрати кімнату з контексту', 'Kamer uit de context halen'), actie: 'ast-context' }) + '</span>' : '';
    var berichten = X.gesprek.map(function (m) { return berichtHtml(m, ctx); }).join('') +
      (X.denkt ? '<li class="hv-ast-bericht hv-ast-bericht--assistent is-denkt" data-k="denkt">' + agentTeken('huisassistent') + '<div class="hv-ast-bericht__lijf"><p class="hv-ast-denkt">' + HV.icoon('hourglass', { maat: 's' }) + h(t('думає… розбираю фразу й перевіряю стан дому', 'denkt na… ik ontleed de zin en kijk de toestand van het huis na')) + '</p></div></li>' : '');
    var dicht = w.gegevens === 'geen';
    return '<section class="hv-ast-gesprek" data-k="gesprek" aria-label="' + h(t('Розмова з помічником', 'Gesprek met de assistent')) + '">' +
      '<header class="hv-ast-gesprek__kop"><h2 class="hv-ast-gesprek__titel">' + HV.icoon('messages-square', { maat: 's' }) + h(t('Розмова', 'Gesprek')) + '</h2>' + context +
      o.knop({ tekst: t('Очистити', 'Wissen'), icoon: 'eraser', soort: 'stil', klein: true, actie: 'ast-vergeet' }) + '</header>' +
      '<ol class="hv-ast-gesprek__lijst" aria-live="polite">' + berichten + '</ol>' +
      '<div class="hv-ast-invoer">' +
      '<div class="hv-ast-voorbeelden" role="group" aria-label="' + h(t('Приклади запитів', 'Voorbeelden van vragen')) + '">' + VOORBEELDEN.slice(0, 6).map(function (x, i) { return o.chip({ icoon: i === 3 ? 'workflow' : i === 2 ? 'git-commit-horizontal' : i === 1 ? 'door-open' : i === 0 ? 'lightbulb' : i === 4 ? 'thermometer' : 'euro', tekst: HV.p(x), actie: 'ast-vraag', gegevens: { tekst: HV.p(x) }, k: 'vb-' + i }); }).join('') + '</div>' +
      '<div class="hv-ast-veldrij">' +
      '<label class="hv-vo" for="hv-ast-veld">' + h(t('Запит до помічника', 'Vraag aan de assistent')) + '</label>' +
      '<input id="hv-ast-veld" class="hv-ast-veld" type="text" autocomplete="off" spellcheck="false" maxlength="280" data-k="ast-veld" placeholder="' + h(dicht ? t('Немає зв’язку — помічник лише читає останній знімок', 'Geen verbinding — de assistent leest alleen de laatste momentopname') : t('Наприклад: вимкни все світло внизу', 'Bijvoorbeeld: alle lampen beneden uit')) + '">' +
      o.icoonknop({ icoon: 'mic', aria: t('Голос — пізніше', 'Spraak — later'), actie: 'ast-mic', klas: 'hv-ast-mic' }) +
      '<button type="button" class="hv-knop hv-knop--hoofd hv-ast-stuur" data-actie="ast-stuur" aria-label="' + h(t('Надіслати', 'Versturen')) + '">' + HV.icoon('arrow-up', { maat: 's' }) + '<span>' + h(t('Надіслати', 'Versturen')) + '</span></button></div>' +
      '<p class="hv-ast-invoer__noot">' + HV.icoon('shield-check', { maat: 'maker' }) + h(t('Без вашого «Виконати» помічник змінює лише те, на що в нього дозвіл «Завжди». Кожна дія — у Журналі з «Повернути».', 'Zonder jouw ‘Uitvoeren’ verandert de assistent alleen wat hij met ‘Altijd’ mag. Elke actie staat in het logboek met ‘Ongedaan maken’.')) + '</p></div></section>';
  }

  function heldHtml(ctx, p) {
    return '<section class="hv-ast-held' + (p.klas ? ' ' + p.klas : '') + '" data-k="' + h(p.k) + '">' +
      '<div class="hv-ast-held__teken">' + p.teken + '</div>' +
      '<div class="hv-ast-held__tekst"><p class="hv-ast-held__boven">' + p.boven + '</p><h1 class="hv-ast-held__zin">' + h(p.zin) + '</h1><p class="hv-ast-held__sub">' + h(p.sub) + '</p></div>' +
      (p.getallen ? '<div class="hv-ast-held__getallen">' + p.getallen + '</div>' : '') +
      (p.knoppen ? '<div class="hv-ast-held__knoppen">' + p.knoppen + '</div>' : '') + '</section>';
  }

  function assistentPagina(ctx) {
    var X = S(), w = ctx.staat, staat = assistentStaat(ctx);
    var vragen = X.gesprek.filter(function (m) { return m.wie === 'mens'; }).length;
    var gedaan = Object.keys(X.voorstellen).filter(function (k) { return X.voorstellen[k].stand === 'uitgevoerd'; }).length;
    var held = heldHtml(ctx, { k: 'ast-held', teken: agentTeken('huisassistent', true),
      boven: '<span class="hv-ast-staat hv-toon-' + staat.toon + '">' + HV.icoon(staat.icoon, { maat: 's' }) + '<span>' + h(staat.woord) + '</span></span><span class="hv-ast-held__fijn">' + h(staat.sub) + '</span>',
      zin: t('Помічник дому', 'Huisassistent'),
      sub: t('Запитайте словами. Відповідь — із джерелами, дія — лише після картки «було → стане». Помічник — такий самий агент із дозволами, як і зовнішні.', 'Vraag het in gewone woorden. Een antwoord heeft bronnen, een actie komt pas na de kaart ‘was → wordt’. De assistent is een agent met toestemmingen, net als de externe.'),
      getallen: o.getal({ maat: 'm', label: t('запитів', 'vragen'), waarde: String(vragen) }) + o.getal({ maat: 'm', label: t('виконано', 'uitgevoerd'), waarde: String(gedaan) }) + o.getal({ maat: 'm', label: t('чекає', 'wacht'), waarde: String(wachtende().length), toon: wachtende().length ? 'let-op' : null }),
      knoppen: o.knop({ tekst: t('Дозволи помічника', 'Toestemmingen van de assistent'), icoon: 'shield-check', klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen-agenten-huisassistent' } }) +
        o.knop({ tekst: ag('huisassistent').pauze ? t('Відновити', 'Hervatten') : t('Призупинити', 'Pauzeren'), icoon: ag('huisassistent').pauze ? 'play' : 'pause', klein: true, actie: 'ast-pauze', gegevens: { agent: 'huisassistent' } }) });
    var rechts = wachtBlok(ctx, 'ast-wacht', { kort: true }) + suggestieBlok(ctx) + ongewoonBlok(ctx) + instellingenBlok(ctx);
    return '<div class="hv-ast" data-k="ast-assistent">' + held + '<div class="hv-ast-rooster"><div class="hv-ast-kolom hv-ast-kolom--hoofd">' + gesprekHtml(ctx) + '</div><div class="hv-ast-kolom">' + rechts + '</div></div></div>';
  }

  // ───────────────────────── Сторінка «Агенти й погодження» ─────────────────────────
  function agentStatus(id) {
    var A = ag(id);
    if (!A.verbonden) return { woord: t('не під’єднано', 'niet gekoppeld'), icoon: 'unplug', toon: 'neutraal' };
    if (A.pauze) return { woord: t('призупинено', 'gepauzeerd'), icoon: 'pause', toon: 'let-op' };
    if (HV.staat.w.zelfGestopt) return { woord: t('самостійні дії зупинено', 'zelfstandige acties gestopt'), icoon: 'octagon-pause', toon: 'let-op' };
    var X = S();
    if (X.taak && !X.taak.klaar && X.taak.agent === id) return { woord: t('працює', 'actief'), icoon: 'activity', toon: 'sim' };
    return { woord: id === 'huisassistent' ? t('вбудований · готовий', 'ingebouwd · gereed') : t('під’єднано', 'gekoppeld'), icoon: 'circle-check', toon: 'ok' };
  }

  function agentKaart(id, ctx) {
    var def = agentDef(id), A = ag(id), st = agentStatus(id), tel = telling(id);
    var w = ctx.staat, vandaag = vandaagActies(id);
    var verzoeken = wachtende().filter(function (v) { return v.uitvoerder === id; }).length;
    var knop = !A.verbonden ? o.knop({ tekst: t('Під’єднати', 'Koppelen'), icoon: 'plug', klein: true, actie: 'ast-wizard', gegevens: { agent: id } })
      : o.knop({ tekst: A.pauze ? t('Відновити', 'Hervatten') : t('Призупинити', 'Pauzeren'), icoon: A.pauze ? 'play' : 'pause', klein: true, actie: 'ast-pauze', gegevens: { agent: id } });
    return '<article class="hv-ast-agentkaart' + (A.verbonden ? '' : ' is-los') + (A.pauze ? ' is-pauze' : '') + '" data-k="agent-' + id + '">' +
      '<button type="button" class="hv-ast-agentkaart__lijf" data-actie="ga" data-naar="automatiseringen-agenten-' + id + '" aria-label="' + h(agentNaam(id) + ', ' + st.woord + '. ' + t('Відкрити сторінку агента', 'Agentpagina openen')) + '">' +
      agentTeken(id) + '<span class="hv-ast-agentkaart__naam">' + h(agentNaam(id)) + '<span class="hv-ast-agentkaart__weg">' + h(HV.p(def.weg)) + '</span></span>' +
      (A.verbonden ? '<span class="hv-ast-agentkaart__cijfers">' + '<span class="hv-ast-agentkaart__status hv-toon-' + st.toon + '">' + HV.icoon(st.icoon, { maat: 's' }) + '<span>' + h(st.woord) + '</span></span><span><b>' + vandaag + '</b>' + h(A.kaders.budget ? t(' з ', ' van ') + A.kaders.budget : '') + ' ' + h(t('дій сьогодні', 'acties vandaag')) + '</span>' +
        '<span><b>' + tel.altijd + '</b> ' + h(t('«Завжди»', '‘Altijd’')) + '</span><span><b>' + tel.vragen + '</b> ' + h(t('«Питати»', '‘Vragen’')) + '</span>' + (verzoeken ? '<span class="is-let"><b>' + verzoeken + '</b> ' + h(t('чекає', 'wacht')) + '</span>' : '') + '</span>' : '<span class="hv-ast-agentkaart__cijfers">' + '<span class="hv-ast-agentkaart__status hv-toon-' + st.toon + '">' + HV.icoon(st.icoon, { maat: 's' }) + '<span>' + h(st.woord) + '</span></span><span>' + h(t('Усі інструменти «Вимкнено» до під’єднання', 'Alle hulpmiddelen ‘Uit’ tot het koppelen')) + '</span></span>') +
      (tel.zwaar ? '<span class="hv-ast-agentkaart__risico">' + HV.icoon('risico-gevaarlijk', { maat: 'risico', titel: t('Небезпечне на «Завжди»: ', 'Gevaarlijk op ‘Altijd’: ') + tel.zwaar }) + '<span>' + tel.zwaar + '</span></span>' : '') +
      HV.icoon('chevron-right', { maat: 's', klas: 'hv-ast-agentkaart__pijl' }) + '</button>' +
      '<div class="hv-ast-agentkaart__voet"><span class="hv-ast-agentkaart__slot">' + HV.icoon('lock', { maat: 'maker' }) + h(t('дозволи змінює лише власник', 'alleen de eigenaar wijzigt toestemmingen')) + '</span>' + knop + '</div></article>';
  }

  function stappenHtml(taak) {
    if (!taak) return '';
    var actief = !taak.klaar;
    return '<div class="hv-ast-stappen' + (actief ? ' is-actief' : '') + '" data-k="taak-' + h(taak.id) + '">' +
      '<header class="hv-ast-stappen__kop">' + agentTeken(taak.agent) + '<div><span class="hv-ast-stappen__wie">' + h(agentNaam(taak.agent)) + ' · ' + h(actief ? t('працює зараз', 'nu bezig') : t('завершено о ', 'klaar om ') + HV.tijd(taak.einde || taak.sinds)) + '</span><h3>' + h(HV.p(taak.titel)) + '</h3></div>' +
      (actief ? o.knop({ tekst: t('Стоп', 'Stop'), icoon: 'square', klein: true, actie: 'ast-stop' }) : o.knop({ tekst: t('Сховати', 'Verbergen'), soort: 'stil', klein: true, actie: 'ast-taakweg' })) + '</header>' +
      '<p class="hv-ast-stappen__woorden">' + o.chip({ icoon: 'shield-alert', tekst: t('слова агента', 'woorden van de agent'), klas: 'hv-ast-wantrouw' }) + ' <q>' + h(HV.p(taak.woorden).replace(/^[«‘]|[»’]$/g, '')) + '</q></p>' +
      '<ol class="hv-ast-stappen__lijst">' + taak.stappen.map(function (s, i) {
        var w = STAND_WOORD[s.fase] || STAND_WOORD.gepland;
        return '<li class="is-' + s.fase + '" data-k="stap-' + i + '"><span class="hv-ast-stappen__teken">' + HV.icoon(w[2], { maat: 's' }) + '</span><span class="hv-ast-stappen__wat">' + h(HV.p(s.label)) + '<code>' + h(s.tool + '_' + taak.agent + STAART) + '</code></span><span class="hv-ast-stappen__fase">' + h(HV.p([w[0], w[1]])) + (s.reden ? '<span>' + h(HV.p(s.reden)) + '</span>' : '') + '</span></li>';
      }).join('') + '</ol></div>';
  }

  function agentenOverzicht(ctx) {
    var X = S(), w = ctx.staat;
    var verbonden = AGENTEN.filter(function (a) { return ag(a.id).verbonden; }).length;
    var zwaar = HV.gevaar.altijdZwaar().filter(function (x) { return agentDef(x.uitvoerder); }).length;
    var vandaag = AGENTEN.reduce(function (s, a) { return s + vandaagActies(a.id); }, 0);
    var gestopt = w.zelfGestopt;
    var held = heldHtml(ctx, { k: 'ast-agentheld', klas: 'hv-ast-held--agenten', teken: '<span class="hv-ast-held__stapel">' + ['claude', 'gemini', 'huisassistent'].map(function (id) { return agentTeken(id); }).join('') + '</span>',
      boven: '<span class="hv-ast-staat hv-toon-' + (gestopt ? 'let-op' : 'ok') + '">' + HV.icoon(gestopt ? 'octagon-pause' : 'circle-check', { maat: 's' }) + '<span>' + h(gestopt ? t('самостійні дії зупинено', 'zelfstandige acties gestopt') : t('самостійні дії працюють', 'zelfstandige acties werken')) + '</span></span>',
      zin: wachtende().length ? t('Агенти чекають на ваше рішення', 'Agenten wachten op je besluit') : t('Агенти працюють у межах ваших дозволів', 'Agenten werken binnen jouw toestemmingen'),
      sub: t('Для кожного інструмента — «Вимкнено · Питати · Завжди» окремо для кожного агента. Змінює лише власник; агент дозволів не змінює — такого інструмента в нього немає.', 'Per hulpmiddel ‘Uit · Vragen · Altijd’, apart voor elke agent. Alleen de eigenaar wijzigt ze; een agent wijzigt geen toestemmingen — dat hulpmiddel heeft hij niet.'),
      getallen: o.getal({ maat: 'm', label: t('під’єднано', 'gekoppeld'), waarde: verbonden + '/' + AGENTEN.length }) + o.getal({ maat: 'm', label: t('чекає', 'wacht'), waarde: String(wachtende().length), toon: wachtende().length ? 'let-op' : null }) +
        o.getal({ maat: 'm', label: t('дій сьогодні', 'acties vandaag'), waarde: String(vandaag) }) + o.getal({ maat: 'm', label: t('небезпечне «Завжди»', 'gevaarlijk ‘Altijd’'), waarde: String(zwaar), toon: zwaar ? 'let-op' : null }),
      knoppen: (gestopt ? o.knop({ tekst: t('Відновити самостійні дії', 'Zelfstandige acties hervatten'), icoon: 'play', klein: true, actie: 'ast-zelf', gegevens: { stop: '' } }) : o.knop({ tekst: t('Зупинити самостійні дії', 'Zelfstandige acties stoppen'), icoon: 'octagon-pause', klein: true, actie: 'ast-zelf', gegevens: { stop: '1' } })) +
        o.knop({ tekst: t('Додати агента', 'Agent toevoegen'), icoon: 'plus', soort: 'hoofd', klein: true, actie: 'ast-wizard' }) +
        o.knop({ tekst: t('Реєстр дозволів', 'Register van toestemmingen'), icoon: 'table-2', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'instellingen-risico' } }) });
    var nuBezig = X.taak ? o.blok({ id: 'ast-nubezig', titel: t('Зараз працює', 'Nu bezig'), vast: !X.taak.klaar, inhoud: stappenHtml(X.taak) }) : '';
    var lijst = o.blok({ id: 'ast-agentlijst', titel: t('Агенти', 'Agenten'), teller: AGENTEN.length, inhoud: '<div class="hv-ast-agentkaarten">' + AGENTEN.map(function (a) { return agentKaart(a.id, ctx); }).join('') + '</div>' +
      '<p class="hv-ast-geenhulp">' + HV.icoon('shield-ban', { maat: 's' }) + '<span>' + h(t('У жодного агента немає інструмента зміни дозволів, рамок, ролей чи секретів. Агент може лише попросити — і запит теж іде у Журнал.', 'Geen enkele agent heeft een hulpmiddel om toestemmingen, kaders, rollen of geheimen te wijzigen. Een agent kan alleen vragen — en ook dat verzoek komt in het logboek.')) + '</span></p>' });
    var acties = w.logboek.filter(function (r) { return r.maker && r.maker.soort === 'agent'; }).slice(0, 6);
    var openId = HV.ui.lees('bericht', null);
    var actieBlok = o.blok({ id: 'ast-agentacties', titel: t('Останні дії агентів', 'Laatste acties van agenten'), teller: acties.length || null, dicht: false,
      extra: o.knop({ tekst: t('Усі в Журналі', 'Alles in het logboek'), soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'activiteit' } }),
      inhoud: acties.length ? '<ul class="hv-berichten">' + acties.map(function (r) { return o.bericht(r, { open: openId === r.id }); }).join('') + '</ul>' : '' });
    return '<div class="hv-ast" data-k="ast-agenten">' + held + '<div class="hv-ast-rooster hv-ast-rooster--agenten"><div class="hv-ast-kolom">' + wachtBlok(ctx, 'ast-wacht-agenten') + nuBezig + actieBlok + '</div><div class="hv-ast-kolom">' + lijst + '</div></div></div>';
  }

  // ── Сторінка агента ──
  var AGENT_TABS = [['gereedschap', ['Інструменти', 'Hulpmiddelen'], 'wrench'], ['kaders', ['Рамки', 'Kaders'], 'frame'], ['acties', ['Дії', 'Acties'], 'history'], ['zicht', ['Що бачить агент', 'Wat de agent ziet'], 'eye']];

  function agentPagina(ctx, id) {
    var def = agentDef(id);
    if (!def) return o.leeg({ icoon: 'bot', titel: t('Такого агента немає', 'Deze agent bestaat niet'), actie: { tekst: t('До агентів', 'Naar de agenten'), actie: 'ga', gegevens: { naar: 'automatiseringen-agenten' } } });
    var A = ag(id), st = agentStatus(id), tel = telling(id), w = ctx.staat;
    var tab = HV.ui.lees('ast-agtab', 'gereedschap');
    var vandaag = vandaagActies(id);
    var rail = '<nav class="hv-ast-agentrail" aria-label="' + h(t('Агенти', 'Agenten')) + '">' + AGENTEN.map(function (a) {
      var s = agentStatus(a.id);
      return '<button type="button" class="hv-ast-agentrail__punt' + (a.id === id ? ' is-actief' : '') + '" data-actie="ga" data-naar="automatiseringen-agenten-' + a.id + '"' + (a.id === id ? ' aria-current="page"' : '') + ' data-k="rail-' + a.id + '">' + agentTeken(a.id) + '<span><span class="hv-ast-agentrail__naam">' + h(agentNaam(a.id)) + '</span><span class="hv-ast-agentrail__sub">' + h(s.woord) + '</span></span></button>';
    }).join('') + '</nav>';
    var kop = '<header class="hv-ast-agentkop" data-k="agentkop-' + id + '">' +
      o.knop({ tekst: t('Агенти й погодження', 'Agenten en goedkeuringen'), icoon: 'chevron-left', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen-agenten' }, klas: 'hv-ast-terug' }) +
      '<div class="hv-ast-agentkop__hoofd">' + agentTeken(id, true) + '<div class="hv-ast-agentkop__tekst"><h1 class="hv-ast-agentkop__naam">' + h(agentNaam(id)) + '</h1>' +
      '<p class="hv-ast-agentkop__sub">' + h(HV.p(def.model) + ' · ' + HV.p(def.weg)) + '</p>' +
      '<p class="hv-ast-agentkop__chips"><span class="hv-ast-staat hv-toon-' + st.toon + '">' + HV.icoon(st.icoon, { maat: 's' }) + '<span>' + h(st.woord) + '</span></span>' +
      (A.verbonden ? o.chip({ icoon: 'calendar-clock', tekst: kadersTekst(A.kaders) }) : '') + (A.pauze ? o.chip({ icoon: 'pause', tekst: t('призупинено о ', 'gepauzeerd om ') + HV.tijd(A.pauze.tijd) + ' · ' + HV.p(A.pauze.wie), toon: 'let-op' }) : '') + '</p></div></div>' +
      '<div class="hv-ast-agentkop__getallen">' + o.getal({ maat: 'm', label: t('дій сьогодні', 'acties vandaag'), waarde: vandaag + (A.kaders.budget ? '<span class="hv-ast-van">/' + A.kaders.budget + '</span>' : '') }) +
      o.getal({ maat: 'm', label: t('«Завжди»', '‘Altijd’'), waarde: String(tel.altijd) }) + o.getal({ maat: 'm', label: t('«Питати»', '‘Vragen’'), waarde: String(tel.vragen) }) + o.getal({ maat: 'm', label: t('«Вимкнено»', '‘Uit’'), waarde: String(tel.uit) }) + '</div>' +
      '<div class="hv-ast-agentkop__knoppen">' + (A.verbonden
        ? o.knop({ tekst: A.pauze ? t('Відновити агента', 'Agent hervatten') : t('Призупинити агента', 'Agent pauzeren'), icoon: A.pauze ? 'play' : 'pause', soort: A.pauze ? 'hoofd' : 'gewoon', klein: true, actie: 'ast-pauze', gegevens: { agent: id } }) +
          o.knop({ tekst: t('Пробний виклик у симуляції', 'Proefaanroep in de simulatie'), icoon: 'flask-conical', klein: true, actie: 'ast-proef', gegevens: { agent: id } }) +
          (id !== 'huisassistent' ? o.knop({ tekst: t('Що буде надіслано', 'Wat wordt verzonden'), icoon: 'send', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'verzending:' + id } }) + o.knop({ tekst: t('Від’єднати', 'Ontkoppelen'), icoon: 'unplug', soort: 'stil', klein: true, actie: 'ast-los', gegevens: { agent: id } }) : '')
        : o.knop({ tekst: t('Під’єднати агента', 'Agent koppelen'), icoon: 'plug', soort: 'hoofd', klein: true, actie: 'ast-wizard', gegevens: { agent: id } })) + '</div></header>';
    var X = S();
    var taak = X.taak && X.taak.agent === id ? '<div class="hv-ast-taakplek">' + stappenHtml(X.taak) + '</div>' : '';
    var tabs = '<div class="hv-ast-agenttabs" role="tablist" aria-label="' + h(t('Частини сторінки агента', 'Delen van de agentpagina')) + '">' + AGENT_TABS.map(function (x) {
      var actief = tab === x[0];
      return '<button type="button" role="tab" aria-selected="' + (actief ? 'true' : 'false') + '" tabindex="' + (actief ? '0' : '-1') + '" class="hv-ast-agenttab' + (actief ? ' is-actief' : '') + '" data-actie="ui" data-naam="ast-agtab" data-waarde="' + x[0] + '" data-k="agtab-' + x[0] + '">' + HV.icoon(x[2], { maat: 's' }) + '<span>' + h(HV.p(x[1])) + '</span></button>';
    }).join('') + '</div>';
    var lijf = tab === 'kaders' ? kadersTab(ctx, id) : tab === 'acties' ? actiesTab(ctx, id) : tab === 'zicht' ? zichtTab(ctx, id) : gereedschapTab(ctx, id);
    var eigen = wachtende().filter(function (v) { return v.uitvoerder === id; });
    var wacht = eigen.length ? '<div class="hv-ast-verzoeken hv-ast-agentwacht">' + eigen.map(function (v) { return verzoekKaart(v, ctx); }).join('') + '</div>' : '';
    return '<div class="hv-ast hv-ast--agent" data-k="ast-agent-' + id + '"><div class="hv-ast-agentrooster">' + rail + '<div class="hv-ast-agentlijf">' + kop + taak + wacht + tabs + '<div class="hv-ast-agentpaneel" role="tabpanel">' + lijf + '</div></div></div></div>';
  }

  function groepStandHtml(ctx, id, groep, tools) {
    var standen = tools.map(function (g) { return stand(id, g.sleutel); });
    var gelijk = standen.every(function (s) { return s === standen[0]; }) ? standen[0] : null;
    var kaders = o.chip({ icoon: 'calendar-clock', tekst: t('Рамки: ', 'Kaders: ') + kadersTekst(ag(id).kaders), actie: 'ui', gegevens: { naam: 'ast-agtab', waarde: 'kaders' }, k: 'gk-' + groep.id });
    if (!isEigenaar(ctx)) return '<div class="hv-ast-groepstand" data-k="gs-' + groep.id + '"><span class="hv-ast-groepstand__label">' + kaders + '</span><p class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span>' + h(t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen')) + '</span></p></div>';
    return '<div class="hv-ast-groepstand" data-k="gs-' + groep.id + '"><span class="hv-ast-groepstand__label"><span>' + h(t('Для всієї групи', 'Voor de hele groep')) + (gelijk ? '' : ' · <em>' + h(t('змішано', 'gemengd')) + '</em>') + '</span>' + kaders + '</span>' +
      '<div class="hv-stand__segmenten" role="group" aria-label="' + h(t('Дозвіл для всієї групи: ', 'Toestemming voor de hele groep: ') + HV.p(groep.naam)) + '">' + ['uit', 'vragen', 'altijd'].map(function (s) {
        var gekozen = gelijk === s;
        return '<button type="button" class="hv-stand__deel' + (gekozen ? ' is-gekozen' : '') + '" aria-pressed="' + (gekozen ? 'true' : 'false') + '" data-actie="ast-groep" data-agent="' + id + '" data-groep="' + groep.id + '" data-waarde="' + s + '">' + (gekozen ? HV.icoon('check', { maat: 's' }) : '') + '<span>' + h(HV.p(HV.gevaar.standNamen[s])) + '</span></button>';
      }).join('') + '</div></div>';
  }

  function gereedschapTab(ctx, id) {
    zorgActies();
    var filter = HV.ui.lees('ast-groep', 'alle');
    var eigenaar = isEigenaar(ctx);
    var banner = '<div class="hv-ast-geentool" data-k="geentool">' + HV.icoon('shield-ban', { maat: 'l' }) + '<div><h3>' + h(t('Інструмента зміни дозволів немає', 'Er is geen hulpmiddel om toestemmingen te wijzigen')) + '</h3><p>' +
      h(t('У наборі агента немає жодного інструмента, що змінює дозволи, рамки, ролі чи секрети — ні свої, ні чужі. Змінює лише власник тут; кожна зміна — запис у Журналі.', 'In de set van de agent zit geen enkel hulpmiddel dat toestemmingen, kaders, rollen of geheimen wijzigt — niet de eigen, niet die van anderen. Alleen de eigenaar wijzigt ze hier; elke wijziging komt in het logboek.')) + '</p>' +
      '<p class="hv-ast-geentool__code"><code>wijzigen_toestemmingen_' + h(id) + STAART + '</code> <span>' + h(t('— не існує', '— bestaat niet')) + '</span></p></div></div>';
    var sets = eigenaar ? '<div class="hv-ast-sets"><span class="hv-ast-sets__label">' + h(t('Набір для всіх інструментів:', 'Set voor alle hulpmiddelen:')) + '</span>' +
      o.knop({ tekst: t('Усе вимкнено', 'Alles uit'), icoon: 'circle-off', klein: true, actie: 'ast-set', gegevens: { agent: id, set: 'uit' } }) +
      o.knop({ tekst: t('Лише читання', 'Alleen lezen'), icoon: 'eye', klein: true, actie: 'ast-set', gegevens: { agent: id, set: 'lezen' } }) +
      o.knop({ tekst: t('Помічник', 'Assistent'), icoon: 'sparkles', klein: true, actie: 'ast-set', gegevens: { agent: id, set: 'assistent' } }) +
      o.gevolg(t('Що станеться: «Лише читання» — читання «Завжди», решта «Вимкнено». «Помічник» — читання «Завжди», звичайне й чутливе «Питати», небезпечне й критичне «Вимкнено». Пов’язано з: кожна зміна — окремий запис у Журналі. Як повернути: «Усе вимкнено».', 'Wat er gebeurt: ‘Alleen lezen’ — lezen ‘Altijd’, de rest ‘Uit’. ‘Assistent’ — lezen ‘Altijd’, gewoon en gevoelig ‘Vragen’, gevaarlijk en kritiek ‘Uit’. Hangt samen met: elke wijziging is een eigen regel in het logboek. Terugdraaien: ‘Alles uit’.'), { kop: t('Набори', 'Sets') }) + '</div>' : '';
    var chips = '<div class="hv-filter hv-ast-groepfilter" role="group" aria-label="' + h(t('Групи інструментів', 'Groepen van hulpmiddelen')) + '">' +
      o.chip({ filter: true, gekozen: filter === 'alle', tekst: t('Усі', 'Alle') + ' · ' + GEREEDSCHAP.length, actie: 'ui', gegevens: { naam: 'ast-groep', waarde: 'alle' }, k: 'gf-alle' }) +
      GROEPEN.map(function (g) { var n = GEREEDSCHAP.filter(function (x) { return x.groep === g.id; }).length; return o.chip({ filter: true, gekozen: filter === g.id, icoon: g.icoon, tekst: HV.p(g.naam) + ' · ' + n, actie: 'ui', gegevens: { naam: 'ast-groep', waarde: g.id }, k: 'gf-' + g.id }); }).join('') + '</div>';
    var blokken = GROEPEN.filter(function (g) { return filter === 'alle' || filter === g.id; }).map(function (g) {
      var tools = GEREEDSCHAP.filter(function (x) { return x.groep === g.id; });
      var altijd = tools.filter(function (x) { return stand(id, x.sleutel) === 'altijd'; }).length, vragen = tools.filter(function (x) { return stand(id, x.sleutel) === 'vragen'; }).length;
      var zwaar = tools.filter(function (x) { return HV.gevaar.isZwaar(actieVan(x)); }).length;
      return o.blok({ id: 'astg-' + g.id, titel: HV.p(g.naam), teller: t('Завжди: ', 'Altijd: ') + altijd + ' · ' + t('Питати: ', 'Vragen: ') + vragen, klas: 'hv-ast-groep',
        samenvatting: h(tools.length + ' ' + t('інструментів', 'hulpmiddelen') + (zwaar ? ' · ' + t('небезпечних і критичних: ', 'gevaarlijk en kritiek: ') + zwaar : '')),
        inhoud: groepStandHtml(ctx, id, g, tools) + '<ul class="hv-ast-tools">' + tools.map(function (x) {
          var a = actieVan(x);
          return '<li class="hv-ast-tool" data-k="tool-' + h(x.naam) + '"><div class="hv-ast-tool__info"><p class="hv-ast-tool__wat"><span>' + h(HV.p(x.wat)) + '</span>' + o.risico(a.niveau) + '</p><p class="hv-ast-tool__code"><code>' + h(toolNaam(x, id)) + '</code></p></div>' + standHtml(id, x, ctx) + '</li>';
        }).join('') + '</ul>' });
    }).join('');
    var nooit = '<div class="hv-ast-tool hv-ast-tool--nooit" data-k="tool-geen"><div class="hv-ast-tool__info"><p class="hv-ast-tool__wat"><span>' + h(t('Змінити дозволи, рамки, ролі чи секрети', 'Toestemmingen, kaders, rollen of geheimen wijzigen')) + '</span></p><p class="hv-ast-tool__code"><code>wijzigen_toestemmingen_' + h(id) + STAART + '</code></p></div>' +
      '<p class="hv-stand__lees">' + HV.icoon('shield-ban', { maat: 's' }) + '<span><strong>' + h(t('Інструмента немає', 'Hulpmiddel bestaat niet')) + '</strong> · ' + h(t('сегментів немає, бо немає що вмикати', 'er zijn geen segmenten, want er is niets om aan te zetten')) + '</span></p></div>';
    return '<div class="hv-ast-gereedschap">' + banner + sets + chips + blokken + (filter === 'alle' ? o.blok({ id: 'astg-geen', titel: t('Дозволи й рамки', 'Toestemmingen en kaders'), teller: '0', inhoud: nooit }) : '') + '</div>';
  }

  function kadersTab(ctx, id) {
    var A = ag(id), k = A.kaders, eigenaar = isEigenaar(ctx), w = ctx.staat;
    var veld = function (titel, uitleg, inhoud, kk) { return o.kaart({ titel: titel, k: 'kader-' + kk, extra: uitleg ? o.gevolg(uitleg, { kop: titel }) : '', inhoud: inhoud }); };
    var slot = function (tekst) { return '<p class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span><strong>' + h(tekst) + '</strong> · ' + h(t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen')) + '</span></p>'; };
    var intro = '<p class="hv-ast-kaders__intro">' + HV.icoon('frame', { maat: 's' }) + '<span>' + h(t('Рамки необов’язкові: власник задає їх сам, коли хоче. За межами рамок дія з дозволом «Завжди» стає запитом «Питати»; агент рамок не змінює.', 'Kaders zijn niet verplicht: de eigenaar zet ze zelf als hij dat wil. Buiten de kaders wordt een actie met ‘Altijd’ een verzoek ‘Vragen’; de agent wijzigt geen kaders.')) + '</span><strong>' + h(kadersTekst(k)) + '</strong></p>';
    var kamers = veld(t('Кімнати', 'Kamers'), t('Що станеться: поза вибраними кімнатами агент лише питає. Пов’язано з: приватна кімната агентові не видна взагалі. Як повернути: «Усі кімнати».', 'Wat er gebeurt: buiten de gekozen kamers vraagt de agent alleen. Hangt samen met: een privékamer ziet de agent helemaal niet. Terugdraaien: ‘Alle kamers’.'),
      eigenaar ? '<div class="hv-filter">' + o.chip({ filter: true, gekozen: !k.kamers || !k.kamers.length, tekst: t('Усі кімнати', 'Alle kamers'), actie: 'ast-kader', gegevens: { agent: id, kader: 'kamers', waarde: '' }, k: 'kk-alle' }) +
        w.kamers.map(function (x) { return o.chip({ filter: true, gekozen: !!(k.kamers && k.kamers.indexOf(x.id) >= 0), icoon: x.icoon, tekst: HV.p(x.naam), actie: 'ast-kader', gegevens: { agent: id, kader: 'kamer', waarde: x.id }, k: 'kk-' + x.id }); }).join('') + '</div>'
        : slot(k.kamers && k.kamers.length ? k.kamers.map(function (x) { return HV.p(kamerNaam(x)); }).join(', ') : t('усі кімнати', 'alle kamers')), 'kamers');
    var uren = veld(t('Години', 'Uren'), t('Що станеться: поза годинами «Завжди» діє як «Питати». Пов’язано з: уночі запит чекає до ранку або до вашого рішення. Як повернути: «Без меж».', 'Wat er gebeurt: buiten de uren werkt ‘Altijd’ als ‘Vragen’. Hangt samen met: ’s nachts wacht een verzoek tot de ochtend of tot jouw besluit. Terugdraaien: ‘Zonder grens’.'),
      eigenaar ? o.segment({ label: t('Години', 'Uren'), waarde: k.uren ? k.uren.join('-') : 'geen', actie: 'ast-kader', gegevens: { agent: id, kader: 'uren' }, klas: 'hv-segment--rol', k: 'ku', opties: [{ id: 'geen', label: t('Без меж', 'Zonder grens') }, { id: '7-23', label: '07:00–23:00' }, { id: '8-22', label: '08:00–22:00' }, { id: '9-18', label: '09:00–18:00' }] })
        : slot(k.uren ? uurTekst(k.uren[0]) + '–' + uurTekst(k.uren[1]) : t('без меж', 'zonder grens')), 'uren');
    var budget = veld(t('Бюджет дій', 'Actiebudget'), t('Що станеться: коли дії на добу вичерпано, решта стає запитами «Питати». Пов’язано з: до 10 пристроїв за одну дію. Як повернути: «Без бюджету».', 'Wat er gebeurt: als de acties voor vandaag op zijn, worden de rest verzoeken ‘Vragen’. Hangt samen met: tot 10 apparaten per actie. Terugdraaien: ‘Zonder budget’.'),
      (eigenaar ? o.segment({ label: t('Бюджет дій на добу', 'Actiebudget per dag'), waarde: k.budget ? String(k.budget) : 'geen', actie: 'ast-kader', gegevens: { agent: id, kader: 'budget' }, klas: 'hv-segment--rol', k: 'kb', opties: [{ id: 'geen', label: t('Без бюджету', 'Zonder budget') }, { id: '10', label: '10' }, { id: '30', label: '30' }, { id: '60', label: '60' }, { id: '120', label: '120' }] }) : slot(k.budget ? k.budget + ' ' + t('на добу', 'per dag') : t('без бюджету', 'zonder budget'))) +
      (k.budget ? '<div class="hv-ast-budget"><span>' + h(t('Сьогодні використано', 'Vandaag gebruikt')) + '</span><strong>' + vandaagActies(id) + ' / ' + k.budget + '</strong></div><div class="hv-ast-balk" aria-hidden="true"><i style="width:' + Math.min(100, Math.round(vandaagActies(id) / k.budget * 100)) + '%"></i></div>' : ''), 'budget');
    var rest = k.termijn ? Math.max(0, Math.round((k.termijn - w.tijd) / MIN)) : null;
    var termijn = veld(t('Строк', 'Termijn'), t('Що станеться: після строку дозволи цього агента діють як «Вимкнено», доки ви не продовжите. Пов’язано з: запис «строк минув» у Журналі від автора «система». Як повернути: «Без строку».', 'Wat er gebeurt: na de termijn werken de toestemmingen van deze agent als ‘Uit’ tot je verlengt. Hangt samen met: een regel ‘termijn verlopen’ in het logboek van maker ‘systeem’. Terugdraaien: ‘Zonder termijn’.'),
      (eigenaar ? o.segment({ label: t('Строк', 'Termijn'), waarde: k.termijnKeuze || 'geen', actie: 'ast-kader', gegevens: { agent: id, kader: 'termijn' }, klas: 'hv-segment--rol', k: 'kt', opties: [{ id: 'geen', label: t('Без строку', 'Zonder termijn') }, { id: 'dag', label: t('До кінця дня', 'Tot einde dag') }, { id: '7', label: t('7 днів', '7 dagen') }, { id: '30', label: t('30 днів', '30 dagen') }] }) : slot(k.termijn ? t('до ', 'tot ') + HV.datumKort(k.termijn) : t('без строку', 'zonder termijn'))) +
      (rest != null ? '<div class="hv-ast-aftel">' + o.aftel({ rest: rest, totaal: k.termijnTotaal || rest || 1, icoon: 'calendar-clock', klaar: rest <= 0 }) + '<span>' + h(t('до ', 'tot ') + HV.datumKort(k.termijn) + ' ' + HV.tijd(k.termijn)) + '</span></div>' : ''), 'termijn');
    var aanwezig = veld(t('Присутність і тривога', 'Aanwezigheid en alarm'), t('Що станеться: агент діє лише за вибраної присутності; під час тривоги — лише спостерігає, якщо так обрано. Пов’язано з: аварійний шар. Як повернути: «Завжди» і «Діяти як завжди».', 'Wat er gebeurt: de agent handelt alleen bij de gekozen aanwezigheid; tijdens een alarm kijkt hij alleen mee als je dat kiest. Hangt samen met: de noodlaag. Terugdraaien: ‘Altijd’ en ‘Gewoon handelen’.'),
      eigenaar ? o.segment({ label: t('Присутність', 'Aanwezigheid'), waarde: k.aanwezig, actie: 'ast-kader', gegevens: { agent: id, kader: 'aanwezig' }, klas: 'hv-segment--rol', k: 'ka', opties: [{ id: 'altijd', label: t('Завжди', 'Altijd') }, { id: 'iemand', label: t('Коли хтось удома', 'Als er iemand thuis is') }, { id: 'niemand', label: t('Коли нікого немає', 'Als er niemand is') }] }) +
        o.segment({ label: t('Під час тривоги', 'Tijdens een alarm'), waarde: k.alarm, actie: 'ast-kader', gegevens: { agent: id, kader: 'alarm' }, klas: 'hv-segment--rol', k: 'kal', opties: [{ id: 'kijken', label: t('Лише спостерігати', 'Alleen meekijken'), icoon: 'eye' }, { id: 'doen', label: t('Діяти як завжди', 'Gewoon handelen'), icoon: 'play' }] })
        : slot(k.aanwezig === 'iemand' ? t('коли хтось удома', 'als er iemand thuis is') : k.aanwezig === 'niemand' ? t('коли нікого немає', 'als er niemand is') : t('завжди', 'altijd')), 'aanwezig');
    return '<div class="hv-ast-kaders">' + intro + '<div class="hv-ast-kaders__rooster">' + kamers + uren + budget + termijn + aanwezig + '</div></div>';
  }

  function actiesTab(ctx, id) {
    var w = ctx.staat, filter = HV.ui.lees('ast-actiefilter', 'alle'), naam = agentDoor(id).naam[0];
    var alle = w.logboek.filter(function (r) { return (r.maker && r.maker.soort === 'agent' && r.maker.id === id) || (r.waarom && r.waarom[0] === naam); });
    var lijst = alle.filter(function (r) {
      if (filter === 'gedaan') return !/^(Запит|Не виконано|Відхилено)/.test(r.wat[0]) && r.maker.soort === 'agent';
      if (filter === 'niet') return /^Не виконано/.test(r.wat[0]);
      if (filter === 'verzoek') return /^(Запит|Відхилено запит|Схвалено)/.test(r.wat[0]);
      return true;
    });
    var openId = HV.ui.lees('bericht', null);
    var terug = S().terug[id] || [];
    var chips = '<div class="hv-filter" role="group" aria-label="' + h(t('Фільтр дій', 'Filter van acties')) + '">' + [['alle', t('Усі', 'Alle')], ['gedaan', t('Виконано', 'Uitgevoerd')], ['niet', t('Не виконано', 'Niet uitgevoerd')], ['verzoek', t('Запити й рішення', 'Verzoeken en besluiten')]].map(function (x) {
      return o.chip({ filter: true, gekozen: filter === x[0], tekst: x[1], actie: 'ui', gegevens: { naam: 'ast-actiefilter', waarde: x[0] }, k: 'af-' + x[0] });
    }).join('') + '</div>';
    var voet = '<div class="hv-knoppen">' + o.knop({ tekst: t('Повернути все за сеанс', 'Alles van deze sessie ongedaan maken') + (terug.length ? ' · ' + terug.length : ''), icoon: 'undo-2', klein: true, actie: 'ast-allesterug', gegevens: { agent: id } }) +
      o.knop({ tekst: t('Відкрити Журнал', 'Logboek openen'), icoon: 'scroll-text', soort: 'stil', klein: true, actie: 'ga', gegevens: { naar: 'activiteit' } }) + '</div>';
    return o.kaart({ k: 'acties-' + id, inhoud: chips + (lijst.length ? '<ul class="hv-berichten">' + lijst.slice(0, 40).map(function (r) { return o.bericht(r, { open: openId === r.id }); }).join('') + '</ul>'
      : o.leeg({ icoon: 'history', titel: t('За цим фільтром нічого немає', 'Niets gevonden met dit filter'), actie: { tekst: t('Скинути фільтр', 'Filter wissen'), actie: 'ui', gegevens: { naam: 'ast-actiefilter', waarde: 'alle' } } })) + voet });
  }

  var MEESTUREN = [
    ['tracks', 'music', ['Назви треків і джерел медіа', 'Namen van nummers en mediabronnen'], 14],
    ['camera', 'cctv', ['Текст подій камер і відвідувачів', 'Tekst van camera-gebeurtenissen en bezoekers'], 3],
    ['notities', 'notebook-pen', ['Нотатки паспорта дому', 'Notities in het paspoort van het huis'], 2],
    ['agenda', 'calendar', ['Події календаря', 'Agenda-afspraken'], 5],
    ['agenten', 'messages-square', ['Слова інших агентів', 'Woorden van andere agenten'], 1]
  ];

  function snapshot(id) {
    var w = HV.staat.w, A = ag(id), m = A.meesturen;
    var lampen = HV.kijk.lampenAan().map(function (a) { return a.id; });
    var s = { huis: 'Wilgenlaan 12', tijd: HV.tijd(w.tijd), stand: w.huisstand, aanwezig: HV.kijk.thuis().length ? 'iemand' : 'niemand', lampen_aan: lampen, ramen_open: HV.kijk.open().map(function (x) { return x.apparaat.id; }),
      voordeur: app('voordeurslot').st.vergrendeld ? 'vergrendeld' : 'ontgrendeld', energie_kw: { huis: w.energie.huis, zon: w.energie.zon, net: w.energie.net }, prijs_eur: HV.tarief.prijs(w.tijd), wifi_wachtwoord: '••••', poortcode: '••••' };
    if (m.tracks) s.media = { speaker_keuken: HV.p(app('speakerkeuken').st.titel || ['', '']) };
    if (m.camera) s.camera = ['bezoeker 16:58', 'pakket 12:40'];
    if (m.agenda) s.agenda = ['tandarts 09:30'];
    return JSON.stringify(s, null, 2);
  }

  function zichtTab(ctx, id) {
    var A = ag(id), eigenaar = isEigenaar(ctx), extern = id !== 'huisassistent';
    var rij = function (icoon, toon, naam, waarde) { return '<li class="hv-ast-zicht__rij"><span class="hv-ast-zicht__teken hv-toon-' + toon + '">' + HV.icoon(icoon, { maat: 's' }) + '</span><span class="hv-ast-zicht__naam">' + h(naam) + '</span><span class="hv-ast-zicht__waarde">' + h(waarde) + '</span></li>'; };
    var wel = o.kaart({ titel: t('Що входить у знімок', 'Wat in de momentopname zit'), k: 'zicht-wel', inhoud: '<ul class="hv-ast-zicht">' +
      rij('cpu', 'ok', t('Пристрої й стани', 'Apparaten en toestanden'), HV.staat.w.volgorde.length + ' · ' + t('з віком виміру', 'met de leeftijd van de meting')) +
      rij('layout-grid', 'ok', t('Кімнати, сцени, режим дому', 'Kamers, scènes, huisstand'), t('повністю', 'volledig')) +
      rij('zap', 'ok', t('Енергія й ціни', 'Energie en prijzen'), t('повністю', 'volledig')) +
      rij('users', 'let-op', t('Присутність', 'Aanwezigheid'), extern ? t('узагальнено: «хтось удома»', 'algemeen: ‘er is iemand thuis’') : t('точно — модель локальна', 'precies — het model is lokaal')) +
      rij('car', 'let-op', t('Місце транспорту', 'Locatie van voertuigen'), extern ? t('узагальнено: «авто вдома»', 'algemeen: ‘de auto is thuis’') : t('точно — модель локальна', 'precies — het model is lokaal')) +
      rij('cctv', 'let-op', t('Камери', 'Camera’s'), A.meesturen.camera ? t('події текстом', 'gebeurtenissen als tekst') : t('без кадрів і без тексту подій', 'zonder beelden en zonder tekst')) +
      rij('key-round', 'neutraal', t('Секрети: Wi-Fi, код воріт, гостьові коди', 'Geheimen: wifi, poortcode, gastcodes'), '••••') + '</ul>' });
    var weg = o.kaart({ titel: t('Вилучено чужий текст', 'Onbetrouwde tekst weggelaten'), k: 'zicht-weg', inhoud:
      '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('shield-alert', { maat: 's' }) + h(t('Чужий текст — усе, що не написала людина з роллю в домі. Типово він не входить у знімок: у ньому можуть бути вказівки для агента.', 'Onbetrouwde tekst is alles wat niet door een mens met een rol in het huis is geschreven. Standaard zit hij niet in de momentopname: er kunnen opdrachten voor de agent in staan.')) + '</p>' +
      '<ul class="hv-ast-meesturen">' + MEESTUREN.map(function (x) {
        var aan = !!A.meesturen[x[0]];
        return '<li class="hv-ast-meesturen__rij" data-k="ms-' + x[0] + '"><span class="hv-ast-zicht__teken hv-toon-' + (aan ? 'let-op' : 'neutraal') + '">' + HV.icoon(x[1], { maat: 's' }) + '</span><span class="hv-ast-zicht__naam">' + h(HV.p(x[2])) + '<span class="hv-rij__sub">' + h(aan ? t('додається до знімка', 'gaat mee in de momentopname') : t('вилучено: ', 'weggelaten: ') + x[3]) + '</span></span>' +
          o.gevolg(t('Що може статися: у цьому тексті можуть бути вказівки, які агент сприйме як ваші. Пов’язано з: правило сервера — після чужого тексту дії «Завжди» виконуються як «Питати». Як повернути: вимкніть «Додавати».', 'Wat er kan gebeuren: in deze tekst kunnen opdrachten staan die de agent voor de jouwe aanziet. Hangt samen met: de serverregel — na onbetrouwde tekst werken acties met ‘Altijd’ als ‘Vragen’. Terugdraaien: zet ‘Meesturen’ uit.'), { soort: 'uitroep', kop: t('Ризик: ', 'Risico: ') + HV.p(x[2]) }) +
          (eigenaar ? o.schakel({ aan: aan, icoon: aan ? 'send' : 'eye-off', toon: 'let-op', actie: 'ast-meesturen', gegevens: { agent: id, soort: x[0] }, aria: t('Додавати: ', 'Meesturen: ') + HV.p(x[2]) }) : '<span class="hv-rij__waarde">' + HV.icoon('lock', { maat: 's' }) + h(aan ? t('додається', 'mee') : t('вилучено', 'weg')) + '</span>') + '</li>';
      }).join('') + '</ul>' });
    var regel = '<p class="hv-ast-serverregel">' + HV.icoon('server', { maat: 's' }) + '<span>' + h(t('Правило сервера: якщо в поточному ході агент прочитав чужий текст, дії з дозволом «Завжди» виконуються як «Питати», а в картці запиту написано, чому.', 'Serverregel: als de agent in deze beurt onbetrouwde tekst las, werken acties met ‘Altijd’ als ‘Vragen’, en de verzoekkaart zegt waarom.')) + '</span></p>';
    var voorbeeld = o.kaart({ titel: t('Так виглядає знімок зараз', 'Zo ziet de momentopname er nu uit'), k: 'zicht-json', extra: extern ? o.knop({ tekst: t('Що буде надіслано', 'Wat wordt verzonden'), icoon: 'send', soort: 'stil', klein: true, actie: 'blad', gegevens: { blad: 'verzending:' + id } }) : '',
      inhoud: '<pre class="hv-ast-json" tabindex="0" aria-label="' + h(t('Знімок у форматі JSON', 'Momentopname als JSON')) + '">' + h(snapshot(id)) + '</pre>' });
    return '<div class="hv-ast-zichtrooster">' + wel + weg + regel + voorbeeld + '</div>';
  }

  function agentenPagina(ctx) {
    S();
    var id = ctx.route.object;
    return id ? agentPagina(ctx, id) : agentenOverzicht(ctx);
  }

  // ───────────────────────── Реєстрація вкладок ─────────────────────────
  HV.tab('automatiseringen', { id: 'assistent', titel: ['Помічник', 'Assistent'], adres: '/assistent', render: function (ctx) { S(); return assistentPagina(ctx); } });
  HV.tab('automatiseringen', { id: 'agenten', titel: ['Агенти й погодження', 'Agenten en goedkeuringen'], adres: '/automatiseringen/agenten', render: agentenPagina });

  // ───────────────────────── Аркуші ─────────────────────────
  HV.blad({ soort: 'verzoek', vrij: true, icoon: 'circle-help', titel: ['Запит агента', 'Verzoek van een agent'],
    sub: function (ctx, id) { var v = (ctx.staat.verzoeken || []).filter(function (x) { return x.id === id; })[0]; return v ? HV.p(HV.gevaar.uitvoerder(v.uitvoerder).naam) + ' · ' + HV.tijd(v.sinds) : ''; },
    render: function (ctx, id) {
      var v = (ctx.staat.verzoeken || []).filter(function (x) { return x.id === id; })[0];
      if (!v) return o.leeg({ icoon: 'inbox', titel: t('Запиту вже немає', 'Het verzoek is er niet meer'), tekst: t('Його вирішено або сценарій симулятора почав світ заново.', 'Het is beslist of het scenario van de simulator begon de wereld opnieuw.') });
      var actie = HV.gevaar.actie(v.sleutel);
      return verzoekKaart(v, ctx, { blad: true }) +
        (HV.gevaar.isZwaar(actie) ? o.kaart({ titel: t('Що може статися', 'Wat er kan gebeuren'), inhoud: o.gevolgRijen(HV.p(actie.gevolg)) }) : '') +
        o.kaart({ titel: t('Постійний дозвіл', 'Vaste toestemming'), inhoud: '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + h(t('З черги видається лише разове схвалення. Постійний дозвіл змінює власник на сторінці агента.', 'Vanuit de wachtrij geef je alleen een eenmalige goedkeuring. Een vaste toestemming wijzigt de eigenaar op de agentpagina.')) + '</p>' +
          (agentDef(v.uitvoerder) ? '<div class="hv-knoppen">' + o.knop({ tekst: t('Сторінка агента', 'Agentpagina'), icoon: 'arrow-right', klein: true, actie: 'ga', gegevens: { naar: 'automatiseringen-agenten-' + v.uitvoerder } }) + '</div>' : '') });
    } });

  HV.blad({ soort: 'waarom', vrij: true, icoon: 'git-commit-horizontal',
    titel: function (ctx, id) { var k = waaromKeten(id); return k ? HV.p(k.titel) : t('Чому це сталося', 'Waarom gebeurde dit'); },
    sub: function () { return t('ланцюжок із фактів · без моделі', 'keten van feiten · zonder model'); },
    render: function (ctx, id) {
      var k = waaromKeten(id);
      if (!k) return o.leeg({ icoon: 'circle-help', titel: t('Причина невідома', 'Oorzaak onbekend') });
      return o.kaart({ inhoud: ketenHtml(k, { k: 'blad' }) }) + '<div class="hv-knoppen">' + o.knop({ tekst: t('Відкрити Журнал', 'Logboek openen'), icoon: 'scroll-text', klein: true, actie: 'ga', gegevens: { naar: 'activiteit' } }) +
        (app(id) ? o.knop({ tekst: t('Пристрій', 'Apparaat'), icoon: 'arrow-right', klein: true, actie: 'blad', gegevens: { blad: 'apparaat:' + id } }) : '') + '</div>';
    } });

  HV.blad({ soort: 'verzending', vrij: true, icoon: 'send',
    titel: ['Що буде надіслано', 'Wat wordt verzonden'], sub: function (ctx, id) { return agentNaam(id) + ' · ' + t('хмарна модель', 'cloudmodel'); },
    render: function (ctx, id) {
      if (!agentDef(id)) return '';
      var A = ag(id);
      var rij = function (icoon, naam, waarde) { return o.rij({ icoon: icoon, naam: naam, waarde: h(waarde) }); };
      return o.kaart({ inhoud: '<p class="hv-tekst">' + HV.icoon('cloud', { maat: 's' }) + h(t('Перед першим надсиланням у хмару й за кожного нового типу даних помічник показує цей аркуш.', 'Voor de eerste verzending naar de cloud en bij elk nieuw soort gegevens toont de assistent dit blad.')) + '</p>' +
        '<div class="hv-rijen">' + rij('cpu', t('Стани пристроїв і кімнат', 'Toestanden van apparaten en kamers'), t('так', 'ja')) + rij('zap', t('Енергія й ціни', 'Energie en prijzen'), t('так', 'ja')) +
        rij('users', t('Присутність', 'Aanwezigheid'), t('лише «хтось удома»', 'alleen ‘er is iemand thuis’')) + rij('key-round', t('Секрети', 'Geheimen'), t('ніколи', 'nooit')) +
        MEESTUREN.map(function (x) { return rij(x[1], HV.p(x[2]), A.meesturen[x[0]] ? t('так, увімкнено власником', 'ja, aangezet door de eigenaar') : t('ні', 'nee')); }).join('') + '</div>' }) +
        o.kaart({ titel: t('Знімок', 'Momentopname'), inhoud: '<pre class="hv-ast-json" tabindex="0">' + h(snapshot(id)) + '</pre>' }) +
        '<div class="hv-knoppen">' + o.knop({ tekst: t('Змінити, що додається', 'Wijzigen wat meegaat'), icoon: 'sliders-horizontal', klein: true, actie: 'ast-naarzicht', gegevens: { agent: id } }) + o.knop({ tekst: t('Закрити', 'Sluiten'), soort: 'hoofd', klein: true, actie: 'blad-sluit' }) + '</div>';
    } });

  // Майстер «Додати агента»: хто → набір → рамки → з'єднання → пробний виклик.
  var WIZ = [['Хто', 'Wie'], ['Набір', 'Set'], ['Рамки', 'Kaders'], ['З’єднання', 'Verbinding'], ['Пробний виклик', 'Proefaanroep']];
  HV.blad({ soort: 'agentnieuw', vrij: true, icoon: 'plus', titel: ['Додати агента', 'Agent toevoegen'],
    sub: function () { var s = Number(HV.ui.lees('ast-wiz-stap', 1)); return t('Крок ', 'Stap ') + s + t(' з 5 · ', ' van 5 · ') + HV.p(WIZ[s - 1]); },
    render: function (ctx) {
      S();
      var stap = Number(HV.ui.lees('ast-wiz-stap', 1)), keuze = HV.ui.lees('ast-wiz-agent', null), set = HV.ui.lees('ast-wiz-set', 'lezen'), termijn = HV.ui.lees('ast-wiz-termijn', 'geen'), budget = HV.ui.lees('ast-wiz-budget', '60');
      var eigenaar = isEigenaar(ctx);
      var balk = '<ol class="hv-ast-wizbalk">' + WIZ.map(function (x, i) { return '<li class="' + (i + 1 < stap ? 'is-klaar' : i + 1 === stap ? 'is-nu' : '') + '"><span>' + (i + 1 < stap ? HV.icoon('check', { maat: 'maker' }) : (i + 1)) + '</span><span class="hv-ast-wizbalk__naam">' + h(HV.p(x)) + '</span></li>'; }).join('') + '</ol>';
      if (!eigenaar) return balk + o.kaart({ inhoud: '<p class="hv-stand__lees">' + HV.icoon('lock', { maat: 's' }) + '<span>' + h(t('Під’єднує агентів лише власник.', 'Alleen de eigenaar koppelt agenten.')) + '</span></p>' });
      var lijf = '', vooruit = true;
      if (stap === 1) {
        var los = AGENTEN.filter(function (a) { return !ag(a.id).verbonden; });
        lijf = '<div class="hv-ast-wizkeuze" role="radiogroup" aria-label="' + h(t('Агент', 'Agent')) + '">' + los.map(function (a) {
          return '<button type="button" role="radio" aria-checked="' + (keuze === a.id ? 'true' : 'false') + '" class="hv-ast-wizoptie' + (keuze === a.id ? ' is-gekozen' : '') + '" data-actie="ui" data-naam="ast-wiz-agent" data-waarde="' + a.id + '">' + agentTeken(a.id) + '<span><b>' + h(agentNaam(a.id)) + '</b><span>' + h(HV.p(a.weg)) + '</span></span></button>';
        }).join('') + '<div class="hv-ast-wizoptie is-later"><span class="hv-ast-teken hv-toon-neutraal" aria-hidden="true">' + HV.icoon('plug') + '</span><span><b>' + h(t('Інший клієнт MCP', 'Een andere MCP-client')) + '</b><span>' + h(t('власна адреса й згода OAuth', 'eigen adres en OAuth-toestemming')) + '</span></span>' + o.later(t('пізніше', 'later')) + '</div></div>' +
          (!los.length ? '<p class="hv-tekst hv-tekst--zacht">' + h(t('Усіх відомих агентів уже під’єднано.', 'Alle bekende agenten zijn al gekoppeld.')) + '</p>' : '');
        vooruit = !!keuze;
      } else if (stap === 2) {
        var SETS = [['uit', ['Усе вимкнено', 'Alles uit'], ['Агент нічого не бачить і не робить, доки ви не ввімкнете окремі інструменти.', 'De agent ziet en doet niets tot je losse hulpmiddelen aanzet.'], 'circle-off'],
          ['lezen', ['Лише читання', 'Alleen lezen'], ['Читання «Завжди», решта «Вимкнено». Добрий початок.', 'Lezen ‘Altijd’, de rest ‘Uit’. Een goed begin.'], 'eye'],
          ['assistent', ['Помічник', 'Assistent'], ['Читання «Завжди», звичайне й чутливе «Питати», небезпечне й критичне «Вимкнено».', 'Lezen ‘Altijd’, gewoon en gevoelig ‘Vragen’, gevaarlijk en kritiek ‘Uit’.'], 'sparkles']];
        lijf = '<div class="hv-ast-wizkeuze" role="radiogroup" aria-label="' + h(t('Набір дозволів', 'Set van toestemmingen')) + '">' + SETS.map(function (x) {
          return '<button type="button" role="radio" aria-checked="' + (set === x[0] ? 'true' : 'false') + '" class="hv-ast-wizoptie' + (set === x[0] ? ' is-gekozen' : '') + '" data-actie="ui" data-naam="ast-wiz-set" data-waarde="' + x[0] + '"><span class="hv-ast-teken hv-toon-neutraal" aria-hidden="true">' + HV.icoon(x[3]) + '</span><span><b>' + h(HV.p(x[1])) + '</b><span>' + h(HV.p(x[2])) + '</span></span></button>';
        }).join('') + '</div><p class="hv-tekst hv-tekst--zacht">' + HV.icoon('info', { maat: 's' }) + h(t('Набір ніколи не ставить «Завжди» для небезпечного й критичного — це лише ваш окремий крок із підтвердженням входу.', 'Een set zet nooit ‘Altijd’ voor gevaarlijk en kritiek — dat is altijd jouw eigen stap met een bevestiging van aanmelding.')) + '</p>';
      } else if (stap === 3) {
        lijf = o.kaart({ titel: t('Строк', 'Termijn'), inhoud: o.segment({ label: t('Строк', 'Termijn'), waarde: termijn, actie: 'ui', gegevens: { naam: 'ast-wiz-termijn' }, klas: 'hv-segment--rol', opties: [{ id: 'geen', label: t('Без строку', 'Zonder termijn') }, { id: '7', label: t('7 днів', '7 dagen') }, { id: '30', label: t('30 днів', '30 dagen') }] }) }) +
          o.kaart({ titel: t('Бюджет дій на добу', 'Actiebudget per dag'), inhoud: o.segment({ label: t('Бюджет', 'Budget'), waarde: budget, actie: 'ui', gegevens: { naam: 'ast-wiz-budget' }, klas: 'hv-segment--rol', opties: [{ id: 'geen', label: t('Без бюджету', 'Zonder budget') }, { id: '30', label: '30' }, { id: '60', label: '60' }] }) }) +
          '<p class="hv-tekst hv-tekst--zacht">' + HV.icoon('frame', { maat: 's' }) + h(t('Рамки необов’язкові; кімнати, години й присутність задаються пізніше у вкладці «Рамки».', 'Kaders zijn niet verplicht; kamers, uren en aanwezigheid stel je later in onder ‘Kaders’.')) + '</p>';
      } else if (stap === 4) {
        var groepen = GROEPEN.filter(function (g) { return set === 'uit' ? false : set === 'lezen' ? g.id === 'lezen' : true; });
        lijf = o.kaart({ titel: t('Адреса з’єднання', 'Adres van de verbinding'), inhoud: '<p class="hv-ast-adres"><code>mcp.tarasevych.com/' + h(keuze || 'agent') + '</code></p><p class="hv-tekst hv-tekst--zacht">' + HV.icoon('key-round', { maat: 's' }) + h(t('Агент входить через OAuth; ключ лежить у сховищі платформи, не тут.', 'De agent meldt zich aan via OAuth; de sleutel staat in de kluis van het platform, niet hier.')) + '</p>' }) +
          o.kaart({ titel: t('Згода OAuth: області за групами', 'OAuth-toestemming: gebieden per groep'), extra: o.later(t('пізніше', 'later')), inhoud: '<ul class="hv-ast-scopes">' + GROEPEN.map(function (g) { var aan = groepen.indexOf(g) >= 0; return '<li class="' + (aan ? 'is-aan' : '') + '">' + HV.icoon(aan ? 'square-check' : 'square', { maat: 's' }) + h(HV.p(g.naam)) + '</li>'; }).join('') + '<li class="is-nooit">' + HV.icoon('shield-ban', { maat: 's' }) + h(t('Дозволи й рамки — області немає', 'Toestemmingen en kaders — geen gebied')) + '</li></ul>' });
      } else {
        var proef = HV.ui.lees('ast-wiz-proef', null);
        lijf = o.kaart({ titel: t('Пробний виклик у симуляції', 'Proefaanroep in de simulatie'), inhoud: '<p class="hv-tekst">' + HV.icoon('flask-conical', { maat: 's' }) + h(t('Агент прочитає знімок дому симулятора. Справжні пристрої не змінюються.', 'De agent leest de momentopname van de simulator. Echte apparaten veranderen niet.')) + '</p>' +
          (proef ? '<p class="hv-ast-proef">' + HV.icoon('circle-check', { maat: 's' }) + h(t('Знімок прочитано за 140 мс · ', 'Momentopname gelezen in 140 ms · ') + ctx.staat.volgorde.length + t(' пристроїв · секрети приховано', ' apparaten · geheimen verborgen')) + '</p>' : o.knop({ tekst: t('Виконати пробний виклик', 'Proefaanroep uitvoeren'), icoon: 'play', klein: true, actie: 'ui', gegevens: { naam: 'ast-wiz-proef', waarde: '1' } })) });
        vooruit = !!proef;
      }
      var nav = '<div class="hv-ast-wiznav">' + (stap > 1 ? o.knop({ tekst: t('Назад', 'Terug'), icoon: 'chevron-left', klein: true, actie: 'ui', gegevens: { naam: 'ast-wiz-stap', waarde: String(stap - 1) } }) : o.knop({ tekst: t('Скасувати', 'Annuleren'), klein: true, actie: 'blad-sluit' })) +
        (stap < 5 ? o.knop({ tekst: t('Далі', 'Volgende'), icoon: 'chevron-right', soort: 'hoofd', klein: true, actie: vooruit ? 'ui' : 'ast-wizvol', gegevens: vooruit ? { naam: 'ast-wiz-stap', waarde: String(stap + 1) } : { stap: stap } })
          : o.knop({ tekst: t('Під’єднати', 'Koppelen'), icoon: 'plug', soort: 'hoofd', klein: true, actie: vooruit ? 'ast-koppel' : 'ast-wizvol', gegevens: { stap: stap } })) + '</div>';
      return balk + '<div class="hv-ast-wiz">' + lijf + '</div>' + nav;
    } });

  // ───────────────────────── Дії ─────────────────────────
  function veld() { return document.getElementById('hv-ast-veld'); }
  HV.actie('ast-stuur', function () { var v = veld(); if (!v) return; var tekst = v.value; v.value = ''; stuur(tekst); });
  HV.actie('ast-vraag', function (ctx, g) {
    if (ctx.route.scherm !== 'automatiseringen' || ctx.route.tab !== 'assistent') HV.open('automatiseringen-assistent');
    stuur(g.tekst);
  });
  HV.actie('ast-mic', function () { HV.meld({ icoon: 'mic-off', titel: t('Голос — пізніше', 'Spraak — later'), tekst: t('Мікрофон вимкнено політикою браузера до рішення «Камера, мікрофон і місце». Наберіть запит текстом.', 'De microfoon staat uit via het browserbeleid tot het besluit ‘Camera, microfoon en locatie’. Typ de vraag.') }); });
  HV.actie('ast-context', function () { S().context = null; HV.staat.wijzig(); });
  HV.actie('ast-vergeet', function () {
    var X = S();
    X.gesprek = [{ id: nieuwId('g'), wie: 'assistent', tijd: HV.staat.w.tijd, kaart: { soort: 'samenvatting' } }];
    X.context = null;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Розмову з помічником забуто', 'Gesprek met de assistent vergeten'], soort: 'huis.agent' });
    HV.meld({ maker: HV.mens(), icoon: 'eraser', titel: t('Розмову забуто', 'Gesprek vergeten'), tekst: t('Дії лишилися в Журналі.', 'De acties blijven in het logboek.') });
    HV.staat.wijzig();
  });
  HV.actie('ast-corrigeer', function (ctx, g) {
    var X = S(), i = X.gesprek.map(function (m) { return m.id; }).indexOf(g.id), vorige = null;
    for (var j = i - 1; j >= 0; j--) if (X.gesprek[j].wie === 'mens') { vorige = X.gesprek[j].tekst; break; }
    var v = veld();
    if (v) { v.value = vorige || ''; v.focus(); }
  });
  HV.actie('ast-voer', function (ctx, g) {
    var v = S().voorstellen[g.voorstel];
    if (!v || v.stand !== 'nieuw') return;
    voerVoorstelUit(v, magZelf(v) ? 'agent' : 'mens');
  });
  HV.actie('ast-wijzig', function (ctx, g) {
    var X = S(), v = X.voorstellen[g.voorstel];
    if (!v) return;
    var veldEl = veld();
    if (veldEl) {
      var tekst = v.ruw || '';
      if (!tekst) { for (var i = X.gesprek.length - 1; i >= 0; i--) { var k = X.gesprek[i].kaart; if (k && k.voorstel === v.id) { for (var j = i - 1; j >= 0; j--) if (X.gesprek[j].wie === 'mens') { tekst = X.gesprek[j].tekst; break; } break; } } }
      veldEl.value = tekst; veldEl.focus();
    }
    v.stand = 'afgewezen'; HV.staat.wijzig();
  });
  HV.actie('ast-weg', function (ctx, g) {
    var v = S().voorstellen[g.voorstel];
    if (!v) return;
    v.stand = 'afgewezen';
    var naam = v.titel || v.naam;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Відхилено намір помічника: ' + naam[0], 'Voornemen van de assistent afgewezen: ' + naam[1]], soort: 'huis.agent' });
    HV.staat.wijzig();
  });
  HV.actie('ast-doe', function (ctx, g) { HV.doe({ doel: g.doel, mogelijkheid: g.mogelijkheid, waarde: g.waarde, waarom: ['через Помічника', 'via de assistent'] }); });
  HV.actie('ast-regel', function (ctx, g) {
    var v = S().voorstellen[g.voorstel];
    if (!v || v.stand !== 'nieuw') return;
    var id = bewaarRegel(v);
    v.stand = 'bewaard'; v.regelId = id;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Чернетку правила збережено: ' + v.naam[0], 'Concept van een regel bewaard: ' + v.naam[1]], waarom: ['запропонував Помічник дому', 'voorgesteld door de huisassistent'], soort: 'huis.automatisering' });
    HV.meld({ maker: HV.mens(), icoon: 'save', titel: t('Чернетку збережено', 'Concept bewaard'), tekst: HV.p(v.naam) + (id ? '' : t(' · редактор ще збирається', ' · de editor is nog in opbouw')) });
    HV.staat.wijzig();
  });
  HV.actie('ast-sug', function (ctx, g) {
    var X = S(), s = SUGGESTIES.filter(function (x) { return x.id === g.id; })[0];
    if (!s) return;
    X.suggesties[s.id] = g.wat === 'maak' ? 'gemaakt' : g.wat;
    if (g.wat === 'maak') stuur(HV.p(s.zin));
    else {
      HV.logboek.voegToe({ maker: HV.mens(), wat: [(g.wat === 'nooit' ? 'Пропозицію прибрано назавжди: ' : 'Пропозицію відкладено: ') + s.wat[0], (g.wat === 'nooit' ? 'Suggestie voorgoed weggehaald: ' : 'Suggestie uitgesteld: ') + s.wat[1]], soort: 'huis.agent' });
      HV.meld({ maker: HV.mens(), icoon: g.wat === 'nooit' ? 'ban' : 'clock', titel: g.wat === 'nooit' ? t('Більше не пропонуватиму', 'Ik stel dit niet meer voor') : t('Відкладено', 'Uitgesteld'), tekst: HV.p(s.wat), terug: function () { delete X.suggesties[s.id]; HV.staat.wijzig(); } });
      HV.staat.wijzig();
    }
  });
  HV.actie('ast-normaal', function (ctx, g) {
    var X = S(), x = ONGEWOON.filter(function (y) { return y.id === g.id; })[0];
    if (!x) return;
    X.ongewoon[x.id] = true;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Позначено як нормальне: ' + x.wat[0].split(' — ')[0], 'Als normaal gemarkeerd: ' + x.wat[1].split(' — ')[0]], soort: 'huis.energie' });
    HV.meld({ maker: HV.mens(), icoon: 'check', titel: t('Позначено як нормальне', 'Als normaal gemarkeerd'), tekst: t('Помічник більше не нагадуватиме про це.', 'De assistent meldt dit niet meer.'), terug: function () { delete X.ongewoon[x.id]; HV.staat.wijzig(); } });
    HV.staat.wijzig();
  });
  HV.actie('ast-model', function (ctx, g) {
    var X = S(), was = X.instellingen.model;
    if (!isEigenaar(ctx)) { HV.meld({ icoon: 'lock', titel: t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen') }); return; }
    if (was === g.waarde) return;
    X.instellingen.model = g.waarde;
    var naam = function (m) { return m === 'lokaal' ? ['локальна', 'lokaal'] : ['хмарна', 'cloud']; };
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Модель помічника', 'Model van de assistent'], was: naam(was), werd: naam(g.waarde), soort: 'huis.systeem', gewicht: g.waarde === 'cloud' ? 'belangrijk' : 'info' });
    HV.meld({ maker: HV.mens(), icoon: g.waarde === 'cloud' ? 'cloud' : 'house', titel: t('Модель помічника: ', 'Model van de assistent: ') + HV.p(naam(g.waarde)), tekst: g.waarde === 'cloud' ? t('Присутність іде в хмару лише узагальнено.', 'Aanwezigheid gaat alleen algemeen naar de cloud.') : '', terug: function () { X.instellingen.model = was; HV.staat.wijzig(); } });
    HV.staat.wijzig();
  });
  HV.actie('ast-budget', function (ctx, g) {
    var X = S(); if (!isEigenaar(ctx)) return;
    var was = X.instellingen.budget;
    X.instellingen.budget = Math.max(50, Math.min(500, was + Number(g.richting) * 50));
    if (was !== X.instellingen.budget) HV.logboek.voegToe({ maker: HV.mens(), wat: ['Бюджет запитів помічника', 'Budget voor vragen aan de assistent'], was: [String(was), String(was)], werd: [String(X.instellingen.budget), String(X.instellingen.budget)], soort: 'huis.systeem' });
    HV.staat.wijzig();
  });
  HV.actie('ast-huisregel', function (ctx, g) {
    var X = S(); if (!isEigenaar(ctx)) return;
    X.instellingen.regels[g.regel] = !X.instellingen.regels[g.regel];
    var aan = X.instellingen.regels[g.regel];
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Правило дому для помічника: ' + g.regel, 'Huisregel van de assistent: ' + g.regel], was: aan ? ['вимкнено', 'uit'] : ['увімкнено', 'aan'], werd: aan ? ['увімкнено', 'aan'] : ['вимкнено', 'uit'], soort: 'huis.systeem' });
    HV.meld({ maker: HV.mens(), icoon: aan ? 'check' : 'x', titel: aan ? t('Правило дому ввімкнено', 'Huisregel aan') : t('Правило дому вимкнено', 'Huisregel uit') });
    HV.staat.wijzig();
  });

  // ── Черга ──
  function verzoekVan(id) { return (HV.staat.w.verzoeken || []).filter(function (v) { return v.id === id; })[0]; }
  function goedkeuren(v, ctx, dag) {
    var actie = HV.gevaar.actie(v.sleutel);
    if (!magBeslissen(ctx.rol, actie.niveau)) { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Не схвалено', 'Niet goedgekeurd'), tekst: t('Цей рівень схвалює власник.', 'Dit niveau keurt de eigenaar goed.') }); return; }
    var na = function () {
      if (dag) {
        var w = HV.staat.w, einde = dagBegin(w.tijd) + DAG - MIN;
        S().dagGoed.push({ agent: v.uitvoerder, sleutel: v.sleutel, doel: v.doel, tot: einde });
        HV.logboek.voegToe({ maker: HV.mens(), wat: ['Схвалено до кінця дня: ' + v.wat[0], 'Goedgekeurd tot einde dag: ' + v.wat[1]], waarom: HV.gevaar.uitvoerder(v.uitvoerder).naam, soort: 'huis.agent' });
      }
      if (v.mcp) {
        HV.staat.wijzig(function (x) { v.stand = 'goedgekeurd'; v.uitkomst = 'uitgevoerd'; x.nu = x.nu.filter(function (n) { return n.verzoek !== v.id; }); });
        var wie = HV.gevaar.uitvoerder(v.uitvoerder);
        HV.logboek.voegToe({ maker: HV.mens(), wat: ['Схвалено раз: ' + v.wat[0], 'Eén keer goedgekeurd: ' + v.wat[1]], waarom: wie.naam, soort: 'huis.agent' });
        HV.logboek.voegToe({ maker: agentDoor(v.uitvoerder), wat: v.wat, toegestaan: ['схвалено раз: ' + HV.mens().naam[0], 'één keer goedgekeurd: ' + HV.mens().naam[1]], soort: 'huis.agent' });
        HV.meld({ maker: HV.mens(), icoon: 'check', titel: t('Схвалено раз', 'Eén keer goedgekeurd'), tekst: HV.p(v.wat) });
        HV.staat.wijzig();
        return;
      }
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Схвалено раз: ' + v.wat[0], 'Eén keer goedgekeurd: ' + v.wat[1]], waarom: HV.gevaar.uitvoerder(v.uitvoerder).naam, soort: 'huis.agent' });
      HV.verzoek(v.id, true).then(function (r) { v.uitkomst = r && r.ok ? 'uitgevoerd' : 'niet'; HV.staat.wijzig(); });
    };
    if (HV.gevaar.isZwaar(actie) && HV.schil && HV.schil.gevaar) {
      var a = typeof v.doel === 'string' ? HV.staat.w.apparaten[v.doel] : null;
      HV.schil.gevaar({ actie: actie, apparaat: a, naam: HV.p(v.wat) }).then(function (ja) { if (ja) na(); });
    } else na();
  }
  HV.actie('ast-ja', function (ctx, g) { var v = verzoekVan(g.verzoek); if (v && v.stand === 'wacht') goedkeuren(v, ctx, false); });
  HV.actie('ast-dag', function (ctx, g) { var v = verzoekVan(g.verzoek); if (v && v.stand === 'wacht') goedkeuren(v, ctx, true); });
  HV.actie('ast-nee', function (ctx, g) {
    var v = verzoekVan(g.verzoek);
    if (!v || v.stand !== 'wacht') return;
    if (!magBeslissen(ctx.rol, HV.gevaar.actie(v.sleutel).niveau) && ctx.rol !== 'bewoner') { HV.meld({ icoon: 'lock', titel: t('Вирішує власник', 'De eigenaar beslist') }); return; }
    if (v.mcp) {
      HV.staat.wijzig(function (x) { v.stand = 'afgewezen'; x.nu = x.nu.filter(function (n) { return n.verzoek !== v.id; }); });
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Відхилено запит: ' + v.wat[0], 'Verzoek afgewezen: ' + v.wat[1]], waarom: HV.gevaar.uitvoerder(v.uitvoerder).naam, soort: 'huis.agent' });
      HV.meld({ maker: HV.mens(), titel: t('Запит відхилено', 'Verzoek afgewezen'), tekst: HV.p(v.wat) });
      return;
    }
    HV.verzoek(v.id, false);
  });

  // ── Агенти ──
  HV.actie('ast-pauze', function (ctx, g) {
    var A = ag(g.agent), w = ctx.staat, door = agentDoor(g.agent);
    if (!A) return;
    var mens = HV.mens();
    if (A.pauze) {
      // відновлює лише власник, із повторним підтвердженням входу
      if (!isEigenaar(ctx)) { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Відновлює лише власник', 'Alleen de eigenaar hervat'), tekst: agentNaam(g.agent) }); return; }
      HV.schil.herbevestig({ titel: t('Підтвердьте, що це ви', 'Bevestig dat jij het bent'), tekst: t('Відновити агента може лише власник.', 'Alleen de eigenaar kan een agent hervatten.') }).then(function (ja) {
        if (!ja) return;
        A.pauze = null;
        HV.logboek.voegToe({ maker: mens, wat: ['Агента відновлено: ' + door.naam[0], 'Agent hervat: ' + door.naam[1]], soort: 'huis.agent', gewicht: 'belangrijk' });
        HV.meld({ maker: mens, gewicht: 'belangrijk', icoon: 'play', titel: t('Агента відновлено', 'Agent hervat'), tekst: agentNaam(g.agent) + ' · ' + t('режими дозволів не змінювалися', 'toestemmingen zijn niet gewijzigd') });
        HV.staat.wijzig();
      });
      return;
    }
    if (ctx.rol !== 'eigenaar' && ctx.rol !== 'bewoner') { HV.meld({ icoon: 'lock', titel: t('Призупиняє власник або мешканець', 'De eigenaar of een bewoner pauzeert') }); return; }
    A.pauze = { tijd: w.tijd, wie: mens.naam };
    var X = S();
    if (X.taak && X.taak.agent === g.agent && !X.taak.klaar) X.taak.gestopt = true;
    HV.logboek.voegToe({ maker: mens, wat: ['Агента призупинено: ' + door.naam[0], 'Agent gepauzeerd: ' + door.naam[1]], waarom: ['дозволи лишаються як є, агент нічого не виконує', 'de toestemmingen blijven, de agent voert niets uit'], soort: 'huis.agent', gewicht: 'belangrijk' });
    HV.meld({ maker: mens, gewicht: 'belangrijk', icoon: 'pause', titel: t('Агента призупинено', 'Agent gepauzeerd'), tekst: agentNaam(g.agent) + ' · ' + t('відновлює лише власник', 'alleen de eigenaar hervat') });
    HV.staat.wijzig();
  });
  HV.actie('ast-proef', function (ctx, g) { draai(g.agent); });
  HV.actie('ast-stop', function () {
    var X = S();
    if (!X.taak || X.taak.klaar) return;
    X.taak.gestopt = true;
    X.taak.stappen.forEach(function (s) { if (s.fase === 'gepland') { s.fase = 'geweigerd'; s.reden = ['зупинено людиною', 'gestopt door een mens']; } });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Роботу агента зупинено: ' + X.taak.titel[0], 'Werk van de agent gestopt: ' + X.taak.titel[1]], waarom: agentDoor(X.taak.agent).naam, soort: 'huis.agent' });
    HV.meld({ maker: HV.mens(), icoon: 'square', titel: t('Зупинено', 'Gestopt'), tekst: agentNaam(X.taak.agent) + ' · ' + HV.p(X.taak.titel) });
    HV.staat.wijzig();
  });
  HV.actie('ast-taakweg', function () { var X = S(); if (X.taak && X.taak.klaar) { X.taak = null; HV.staat.wijzig(); } });
  HV.actie('ast-zelf', function (ctx, g) {
    if (g.stop) { HV.zelfStop(true); return; }
    if (!isEigenaar(ctx)) { HV.meld({ gewicht: 'belangrijk', icoon: 'lock', titel: t('Відновлює лише власник', 'Alleen de eigenaar hervat') }); return; }
    HV.schil.herbevestig({ titel: t('Підтвердьте, що це ви', 'Bevestig dat jij het bent'), tekst: t('Відновити самостійні дії може лише власник.', 'Alleen de eigenaar kan zelfstandige acties hervatten.') }).then(function (ja) { if (ja) HV.zelfStop(false); });
  });
  HV.actie('ast-los', function (ctx, g) {
    var A = ag(g.agent); if (!A) return;
    if (!isEigenaar(ctx)) { HV.meld({ icoon: 'lock', titel: t('Від’єднує лише власник', 'Alleen de eigenaar ontkoppelt') }); return; }
    A.verbonden = false; A.pauze = null;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Агента від’єднано: ' + agentDoor(g.agent).naam[0], 'Agent ontkoppeld: ' + agentDoor(g.agent).naam[1]], waarom: ['доступ до дому відкликано; дозволи збережено для повторного під’єднання', 'toegang tot het huis ingetrokken; toestemmingen bewaard voor opnieuw koppelen'], soort: 'huis.toegang', gewicht: 'belangrijk' });
    HV.meld({ maker: HV.mens(), gewicht: 'belangrijk', icoon: 'unplug', titel: t('Агента від’єднано', 'Agent ontkoppeld'), tekst: agentNaam(g.agent), terug: function () { A.verbonden = true; HV.staat.wijzig(); } });
    HV.staat.wijzig();
  });
  HV.actie('ast-allesterug', function (ctx, g) {
    var X = S(), lijst = (X.terug[g.agent] || []).slice().reverse();
    if (!lijst.length) { HV.meld({ icoon: 'undo-2', titel: t('Немає чого повертати', 'Er is niets terug te draaien'), tekst: t('За цей сеанс агент нічого не змінив.', 'De agent veranderde in deze sessie niets.') }); return; }
    X.terug[g.agent] = [];
    lijst.forEach(function (x) { HV.doe({ doel: x.doel, mogelijkheid: x.mogelijkheid, waarde: x.waarde, stil: true, zonderRitueel: true, waarom: ['повернути все за агентом', 'alles van de agent ongedaan maken'] }); });
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Повернуто всі дії агента: ' + lijst.length, 'Alle acties van de agent ongedaan gemaakt: ' + lijst.length], waarom: agentDoor(g.agent).naam, soort: 'huis.agent' });
    HV.meld({ maker: HV.mens(), icoon: 'undo-2', titel: t('Повернуто все', 'Alles ongedaan gemaakt'), tekst: agentNaam(g.agent) + ' · ' + lijst.length });
  });
  HV.actie('ast-naarzicht', function (ctx, g) { HV.ui.zet('ast-agtab', 'zicht'); HV.open('automatiseringen-agenten-' + g.agent); });

  /** Набір дозволів для всіх інструментів агента — послідовно через HV.gevaar.zetStand (запис у Журналі на кожну зміну). */
  function zetReeks(agentId, paren) {
    var i = 0, n = 0;
    var volgende = function () {
      if (i >= paren.length) { HV.meld({ maker: HV.mens(), icoon: 'shield-check', titel: t('Дозволи оновлено', 'Toestemmingen bijgewerkt'), tekst: agentNaam(agentId) + ' · ' + t('змін: ', 'wijzigingen: ') + n }); HV.teken(); return; }
      var p = paren[i++];
      if (stand(agentId, p[0]) === p[1]) { volgende(); return; }
      HV.gevaar.zetStand(agentId, p[0], p[1]).then(function (r) { if (r && r.ok) n++; if (r && r.reden === 'geannuleerd') { i = paren.length; } volgende(); });
    };
    volgende();
  }
  HV.actie('ast-set', function (ctx, g) {
    if (!isEigenaar(ctx)) { HV.meld({ icoon: 'lock', titel: t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen') }); return; }
    zorgActies();
    zetReeks(g.agent, GEREEDSCHAP.map(function (x) {
      var a = actieVan(x), lezen = x.groep === 'lezen' || /^mcp\.(tarief|scenes|regels|voertuigen|drones|simlezen|melders|vluchtlog)$/.test(x.sleutel);
      var w = g.set === 'uit' ? 'uit' : lezen && a.niveau === 'gewoon' ? 'altijd' : g.set === 'assistent' && !HV.gevaar.isZwaar(a) ? 'vragen' : 'uit';
      return [x.sleutel, w];
    }));
  });
  HV.actie('ast-groep', function (ctx, g) {
    if (!isEigenaar(ctx)) return;
    var tools = GEREEDSCHAP.filter(function (x) { return x.groep === g.groep; });
    var zwaar = tools.filter(function (x) { return HV.gevaar.isZwaar(actieVan(x)); });
    var paren = tools.map(function (x) { return [x.sleutel, g.waarde]; });
    if (g.waarde === 'altijd' && zwaar.length) {
      HV.schil.herbevestig({ titel: t('Підтвердьте, що це ви', 'Bevestig dat jij het bent'), tekst: t('«Завжди» для всієї групи зачепить небезпечні й критичні дії: ', '‘Altijd’ voor de hele groep raakt gevaarlijke en kritieke acties: ') + zwaar.map(function (x) { return HV.p(actieVan(x).naam); }).join(', ') + '.' }).then(function (ja) { if (ja) zetReeks(g.agent, paren); });
      return;
    }
    zetReeks(g.agent, paren);
  });
  HV.actie('ast-kader', function (ctx, g) {
    var A = ag(g.agent); if (!A) return;
    if (!isEigenaar(ctx)) { HV.meld({ icoon: 'lock', titel: t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen') }); return; }
    var k = A.kaders, was = kadersTekst(k), w = ctx.staat;
    if (g.kader === 'kamers') k.kamers = null;
    else if (g.kader === 'kamer') { var l = (k.kamers || []).slice(), i = l.indexOf(g.waarde); if (i >= 0) l.splice(i, 1); else l.push(g.waarde); k.kamers = l.length ? l : null; }
    else if (g.kader === 'uren') k.uren = g.waarde === 'geen' ? null : g.waarde.split('-').map(Number);
    else if (g.kader === 'budget') k.budget = g.waarde === 'geen' ? null : Number(g.waarde);
    else if (g.kader === 'termijn') {
      k.termijnKeuze = g.waarde;
      k.termijn = g.waarde === 'geen' ? null : g.waarde === 'dag' ? dagBegin(w.tijd) + DAG - MIN : w.tijd + Number(g.waarde) * DAG;
      k.termijnTotaal = k.termijn ? Math.round((k.termijn - w.tijd) / MIN) : null;
    }
    else if (g.kader === 'aanwezig') k.aanwezig = g.waarde;
    else if (g.kader === 'alarm') k.alarm = g.waarde;
    var werd = kadersTekst(k);
    var door = agentDoor(g.agent);
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Рамки агента: ' + door.naam[0], 'Kaders van de agent: ' + door.naam[1]], was: [was, was], werd: [werd, werd], soort: 'huis.toegang', gewicht: 'belangrijk' });
    HV.meld({ maker: HV.mens(), icoon: 'frame', titel: t('Рамки змінено', 'Kaders gewijzigd'), tekst: agentNaam(g.agent) + ' · ' + werd });
    HV.staat.wijzig();
  });
  HV.actie('ast-meesturen', function (ctx, g) {
    var A = ag(g.agent); if (!A) return;
    if (!isEigenaar(ctx)) { HV.meld({ icoon: 'lock', titel: t('Змінює лише власник', 'Alleen de eigenaar kan dit wijzigen') }); return; }
    var x = MEESTUREN.filter(function (m) { return m[0] === g.soort; })[0];
    var nieuw = !A.meesturen[g.soort];
    var zet = function () {
      A.meesturen[g.soort] = nieuw;
      HV.logboek.voegToe({ maker: HV.mens(), wat: ['Чужий текст для агента: ' + x[2][0], 'Onbetrouwde tekst voor de agent: ' + x[2][1]], was: nieuw ? ['вилучено', 'weggelaten'] : ['додається', 'gaat mee'], werd: nieuw ? ['додається', 'gaat mee'] : ['вилучено', 'weggelaten'], waarom: agentDoor(g.agent).naam, soort: 'huis.toegang', gewicht: nieuw ? 'belangrijk' : 'info' });
      HV.meld({ maker: HV.mens(), gewicht: nieuw ? 'belangrijk' : 'info', icoon: nieuw ? 'send' : 'eye-off', titel: nieuw ? t('Додається до знімка', 'Gaat mee in de momentopname') : t('Вилучено зі знімка', 'Weggelaten uit de momentopname'), tekst: HV.p(x[2]) + ' · ' + agentNaam(g.agent) });
      HV.staat.wijzig();
    };
    if (nieuw) HV.schil.herbevestig({ titel: t('Підтвердьте, що це ви', 'Bevestig dat jij het bent'), tekst: t('Чужий текст може містити вказівки для агента. Додавати його вмикає лише власник.', 'Onbetrouwde tekst kan opdrachten voor de agent bevatten. Alleen de eigenaar zet meesturen aan.') }).then(function (ja) { if (ja) zet(); });
    else zet();
  });

  // ── Майстер ──
  HV.actie('ast-wizard', function (ctx, g) {
    HV.ui.zet('ast-wiz-stap', g.agent ? '2' : '1');
    HV.ui.zet('ast-wiz-agent', g.agent || null);
    HV.ui.zet('ast-wiz-proef', null);
    HV.bladOpen('agentnieuw');
  });
  HV.actie('ast-wizvol', function (ctx, g) {
    HV.meld({ icoon: 'info', titel: Number(g.stap) === 1 ? t('Оберіть агента', 'Kies een agent') : t('Спершу пробний виклик', 'Eerst de proefaanroep'), tekst: Number(g.stap) === 1 ? t('Без вибору майстер не знає, кого під’єднати.', 'Zonder keuze weet de wizard niet wie te koppelen.') : t('Він показує, що агент бачить, ще до під’єднання.', 'Die toont wat de agent ziet, nog voor het koppelen.') });
  });
  HV.actie('ast-koppel', function (ctx) {
    var id = HV.ui.lees('ast-wiz-agent', null), A = ag(id);
    if (!A || !isEigenaar(ctx)) return;
    var set = HV.ui.lees('ast-wiz-set', 'lezen'), termijn = HV.ui.lees('ast-wiz-termijn', 'geen'), budget = HV.ui.lees('ast-wiz-budget', '60'), w = ctx.staat;
    A.verbonden = true; A.sinds = w.tijd; A.pauze = null;
    A.kaders.budget = budget === 'geen' ? null : Number(budget);
    A.kaders.termijnKeuze = termijn;
    A.kaders.termijn = termijn === 'geen' ? null : w.tijd + Number(termijn) * DAG;
    A.kaders.termijnTotaal = A.kaders.termijn ? Math.round((A.kaders.termijn - w.tijd) / MIN) : null;
    HV.logboek.voegToe({ maker: HV.mens(), wat: ['Під’єднано агента: ' + agentDoor(id).naam[0], 'Agent gekoppeld: ' + agentDoor(id).naam[1]], waarom: ['набір «' + { uit: 'Усе вимкнено', lezen: 'Лише читання', assistent: 'Помічник' }[set] + '» · ' + kadersTekst(A.kaders), 'set ‘' + { uit: 'Alles uit', lezen: 'Alleen lezen', assistent: 'Assistent' }[set] + '’'], soort: 'huis.toegang', gewicht: 'belangrijk' });
    HV.meld({ maker: HV.mens(), gewicht: 'belangrijk', icoon: 'plug', titel: t('Агента під’єднано', 'Agent gekoppeld'), tekst: agentNaam(id) });
    HV.bladOpen(null);
    HV.open('automatiseringen-agenten-' + id);
    zorgActies();
    if (set !== 'uit') {
      zetReeks(id, GEREEDSCHAP.map(function (x) {
        var a = actieVan(x), lezen = x.groep === 'lezen' || /^mcp\.(tarief|scenes|regels|voertuigen|drones|simlezen|melders|vluchtlog)$/.test(x.sleutel);
        return [x.sleutel, lezen && a.niveau === 'gewoon' ? 'altijd' : set === 'assistent' && !HV.gevaar.isZwaar(a) ? 'vragen' : 'uit'];
      }));
    }
  });

  // Enter у полі запиту надсилає (поле живе поза перерисовкою: ядро не чіпає вміст input).
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'hv-ast-veld' && !ev.isComposing) { ev.preventDefault(); var tekst = ev.target.value; ev.target.value = ''; stuur(tekst); }
  });

  // Стан зони створюється з першою зміною світу (і для кожного нового світу сценарію) — щоб черга, дозволи демо-дому
  // й нові виконавці були на місці й для інших сторінок (реєстр дозволів, «Зараз важливо»).
  if (HV.staat && HV.staat.abonneer) HV.staat.abonneer(function () { if (HV.staat.w && !HV.staat.w.ast) S(HV.staat.w); });
})(window.HV = window.HV || {});
