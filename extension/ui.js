// Gedeelde UI voor pop-up, zijpaneel en opties (extensie 0.6, contract 0.6 §5). Klassiek script (geen bundler, CSP script-src 'self').
// Regels: nooit HTML als tekst invoegen — alles via textContent en de DOM-API. Teksten Oekraïens; Nederlands als navigator.language
// met 'nl' begint (statische teksten: attribuut data-nl / data-nl-aria op het element zelf).
// Bovenaan: account (e-mail) + profiel van het actieve tabblad. Daaronder één kaart per slot in #sloten:
//  - «Як користувач» (slot prive): bestaat altijd; niet gekoppeld → «Додати доступ як користувач».
//  - «Технічний профіль» (slot technisch): bestaat ALLEEN als ExtStatus.sloten.technisch niet null is (slot gekoppeld of
//    /self.techRecht === true). Anders wordt er niets van gebouwd: geen titel, geen knop, geen uitgeschakelde knop, geen tekst.
//  Staat het actieve tabblad in de technische modus, dan staat die kaart bovenaan; verlaat het tabblad de modus, dan meteen weer
//  de gebruikersweergave (prive bovenaan).
// ExtStatus 0.6 (background.js statusKern): { versie, profielTab, accountEmail, techRecht, account, sloten:{prive, technisch|null},
//  lokaal:{toegestaan, verbonden, ruimte}, diagOptIn, nativeOptIn, debugging }; slot = { ruimte, gekoppeld, verbonden, staat,
//  ontgrendeling:{gid,exp,caps,domeinen,lokaal}|null, ai:{verbonden,agenten}, agentId, naam, fout }.
(() => {
  'use strict';
  const NL = String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase().startsWith('nl');
  const t = (uk, nl) => (NL ? nl : uk);
  const SITE = 'https://mcp.tarasevych.com';
  const URLS = Object.freeze({
    koppelenPrive: `${SITE}/agents?koppel=prive#extensie`,
    koppelenTechnisch: `${SITE}/agents?koppel=technisch#extensie`,
    ontgrendelenPrive: `${SITE}/agents?ontgrendelen=prive#extensie`,
    ontgrendelenTechnisch: `${SITE}/agents?ontgrendelen=technisch#extensie`,
    beheer: `${SITE}/agents#toegang`,
    lokaal: `${SITE}/agents#extension-lokaal`,
  });

  // Technisch: kopie van STAAT_TEKST uit shared/extensie-ontgrendeling.ts (tests/eenheid/extensie-ui.test.ts houdt beide gelijk).
  const STAAT_TEKST = Object.freeze({
    'niet-gekoppeld': ['Не підключено до сайту', 'Niet gekoppeld'],
    vergrendeld: ['Очікування підтвердження', 'Wacht op bevestiging'],
    ontgrendeld: ['Доступ відкрито', 'Toegang open'],
    agent: ['ШІ-агент підключено', 'AI-agent verbonden'],
  });
  // Prive (contract 0.6 §5): «Не підключено» zonder «до сайту»; verder gelijk.
  const STAAT_TEKST_PRIVE = Object.freeze({
    'niet-gekoppeld': ['Не підключено', 'Niet gekoppeld'],
    vergrendeld: ['Очікування підтвердження', 'Wacht op bevestiging'],
    ontgrendeld: ['Доступ відкрито', 'Toegang open'],
    agent: ['ШІ-агент підключено', 'AI-agent verbonden'],
  });
  const STAAT_UITLEG = Object.freeze({
    prive: {
      'niet-gekoppeld': ['Ваш ШІ ще не має доступу до цього браузера. Після підключення він працюватиме лише з вашими сервісами (пошта, диск, дошка, календар) — ніколи з керуванням сайтом.', 'Uw AI heeft nog geen toegang tot deze browser. Na koppelen werkt hij alleen met uw eigen diensten (mail, Drive, bord, agenda) — nooit met het beheer van de site.'],
      vergrendeld: ['Доступ закрито: ШІ нічого не бачить і не виконує. Відкрийте доступ на сайті (з підтвердженням входу).', 'De toegang is dicht: de AI ziet en doet niets. Open de toegang op de site (met een bevestiging van uw aanmelding).'],
      ontgrendeld: ['ШІ може працювати лише з вашими сервісами в межах дозволів і сайтів нижче, доки не мине час.', 'De AI mag alleen met uw diensten werken, binnen de rechten en sites hieronder, tot de tijd om is.'],
      agent: ['ШІ-агент зараз працює з вашими сервісами в цьому браузері в межах дозволів нижче.', 'Een AI-agent werkt nu met uw diensten in deze browser, binnen de rechten hieronder.'],
    },
    technisch: {
      'niet-gekoppeld': ['Технічний профіль ще не підключено до цього браузера. ШІ нічого не бачить і не виконує.', 'Het technische profiel is nog niet aan deze browser gekoppeld. De AI ziet en doet niets.'],
      vergrendeld: ['Технічний доступ заблоковано: ШІ нічого не бачить і не виконує. Відкрийте його на сайті своїм passkey.', 'De technische toegang is vergrendeld: de AI ziet en doet niets. Open hem op de site met uw passkey.'],
      ontgrendeld: ['Технічний ШІ може працювати лише у вкладках у технічному режимі, в межах дозволів і сайтів нижче.', 'De technische AI werkt alleen in tabbladen in de technische modus, binnen de rechten en sites hieronder.'],
      agent: ['Технічний ШІ-агент зараз виконує команди у вкладках у технічному режимі.', 'Een technische AI-agent voert nu opdrachten uit in tabbladen in de technische modus.'],
    },
  });
  const TITEL = Object.freeze({ prive: ['Як користувач', 'Als gebruiker'], technisch: ['Технічний профіль', 'Technisch profiel'] });
  const PROFIEL_NAAM = Object.freeze({ gebruiker: ['Користувач', 'Gebruiker'], technisch: ['Технічний', 'Technisch'] });
  const BROWSER_CAPS = Object.freeze(['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script']);
  const CAP_NAAM = Object.freeze({
    'browser.read': ['Читати сторінки', 'Pagina’s lezen'],
    'browser.navigate': ['Відкривати сторінки', 'Pagina’s openen'],
    'browser.interact': ['Натискати й вводити', 'Klikken en typen'],
    'browser.screenshot': ['Знімки екрана', 'Schermafbeeldingen'],
    'browser.console': ['Консоль і мережа', 'Console en netwerk'],
    'browser.debug': ['Глибока діагностика', 'Diepe diagnose'],
    'browser.script': ['Скрипти', 'Scripts'],
  });
  const CAP_UITLEG = Object.freeze({
    'browser.read': ['Текст і структуру сторінок вибраних сайтів, помилки консолі, адреси запитів без параметрів, час завантаження. Ніколи — паролі, cookies, вміст полів чи сховища.', 'Tekst en structuur van pagina’s op de gekozen sites, consolefouten, adressen zonder parameters, laadtijden. Nooit wachtwoorden, cookies, veldwaarden of opslag.'],
    'browser.navigate': ['Відкривати адреси й переходити назад/вперед — лише в межах вибраних сайтів.', 'Adressen openen en terug/vooruit — alleen binnen de gekozen sites.'],
    'browser.interact': ['Натискати кнопки, вводити текст, обирати й прокручувати на вибраних сайтах.', 'Knoppen indrukken, tekst typen, kiezen en scrollen op de gekozen sites.'],
    'browser.screenshot': ['Знімок лише видимої вкладки вибраного сайту.', 'Een afbeelding van alleen het zichtbare tabblad van een gekozen site.'],
    'browser.console': ['Повідомлення консолі та список запитів вкладки: метод, адреса без параметрів, статус, час. Без заголовків і тіл.', 'Consoleberichten en de lijst verzoeken van het tabblad: methode, adres zonder parameters, status, tijd. Zonder headers en bodies.'],
    'browser.debug': ['Налагоджувач Chrome на кілька секунд (жовта смуга вгорі) — лише якщо глибоку діагностику ввімкнено в налаштуваннях.', 'De Chrome-debugger enkele seconden (gele balk bovenaan) — alleen als diepe diagnose in de instellingen aan staat.'],
    'browser.script': ['JavaScript у технічній вкладці через налагоджувач (evaluate_script) — лише технічний слот, пакет «діагностика» й позначка «Скрипти» на сайті.', 'JavaScript in het technische tabblad via de debugger (evaluate_script) — alleen technisch slot, pakket «diagnose» en het vinkje «Scripts» op de site.'],
  });
  const capNaam = (c) => (CAP_NAAM[c] ? t(CAP_NAAM[c][0], CAP_NAAM[c][1]) : String(c));
  const STATEN = Object.keys(STAAT_TEKST);

  // ---------------------------------------------------------------- 0.6.1: diepe diagnose (punt 7 eigenaar 19.10.2026)
  // Chrome staat het recht `debugger` NIET toe als optioneel recht: permissions.request eindigt altijd met «Only permissions
  // specified in the manifest may be requested». Daarom: het verzoek gaat hier STRIKT uit een klik (pop-up, zijpaneel of opties),
  // en bij elke uitkomst staat er in gewone taal wat er aan de hand is en wat de gebruiker kan doen. Zodra het recht er wél is
  // (pakket «діагностика»), is diepe diagnose onmiddellijk bruikbaar: de achtergrond duwt de nieuwe stand naar deze pagina's.
  const DIAG_PAKKET_URL = 'https://mcp.tarasevych.com/downloads/mijn-ruimte-extension-diagnose.zip';
  const DIAG_STAND_TEKST = Object.freeze({
    ja: ['Дозвіл налагоджувача: є', 'Debuggerrecht: aanwezig'],
    nee: ['Дозвіл налагоджувача: немає', 'Debuggerrecht: niet aanwezig'],
    geweigerd: ['Дозвіл налагоджувача: ви відмовили', 'Debuggerrecht: u hebt geweigerd'],
    ingetrokken: ['Дозвіл налагоджувача: відкликано', 'Debuggerrecht: ingetrokken'],
    'niet-aanvraagbaar': ['Дозвіл налагоджувача: немає в цій версії', 'Debuggerrecht: ontbreekt in deze versie'],
  });
  const DIAG_HULP = Object.freeze({
    ja: ['', ''],
    nee: ['Chrome ще не ввімкнув дозвіл налагоджувача для розширення. Відкрийте chrome://extensions, знайдіть «Mijn Ruimte» і, якщо Chrome просить, підтвердіть новий дозвіл (після оновлення до 0.8.0 Chrome може тимчасово вимкнути розширення до вашого підтвердження).',
      'Chrome heeft het debuggerrecht voor de extensie nog niet actief. Open chrome://extensions, zoek «Mijn Ruimte» en bevestig het nieuwe recht als Chrome erom vraagt (na de update naar 0.8.0 kan Chrome de extensie tijdelijk uitzetten tot u bevestigt).'],
    geweigerd: ['Chrome не підтвердив дозвіл. Відкрийте chrome://extensions і ввімкніть «Mijn Ruimte» знову.', 'Chrome heeft het recht niet bevestigd. Open chrome://extensions en zet «Mijn Ruimte» weer aan.'],
    ingetrokken: ['Дозвіл налагоджувача зараз не діє. Перезавантажте розширення в chrome://extensions (кнопка ↻). Нічого не збирається.',
      'Het debuggerrecht werkt nu niet. Herlaad de extensie in chrome://extensions (knop ↻). Er wordt niets verzameld.'],
    'niet-aanvraagbaar': ['У цій версії розширення немає дозволу налагоджувача (старий пакет). Встановіть версію 0.8.0 або новішу в ту саму постійну папку й натисніть ↻ у chrome://extensions. Усе інше працює й без цього дозволу.',
      'Deze versie van de extensie heeft geen debuggerrecht (oud pakket). Installeer 0.8.0 of nieuwer in dezelfde vaste map en klik ↻ in chrome://extensions. Al het andere werkt ook zonder dit recht.'],
  });
  /** Waarom dit recht nodig is (altijd zichtbaar bij de knop, zodat niemand het blind aanzet). */
  const DIAG_WAAROM = ['Потрібен лише для глибокої діагностики: Chrome на кілька секунд під’єднує налагоджувач до вкладки (жовта смуга вгорі) і збирає помилки консолі та невдалі запити. Доступно лише за відкритого доступу й лише на обраних сайтах.',
    'Alleen nodig voor diepe diagnose: Chrome hangt de debugger enkele seconden aan het tabblad (gele balk bovenaan) en verzamelt consolefouten en mislukte verzoeken. Alleen bij een open toegang en alleen op de gekozen sites.'];

  const diagStandVan = (s) => {
    const d = s && s.diagnostiek && typeof s.diagnostiek === 'object' ? s.diagnostiek : null;
    const stand = d && DIAG_STAND_TEKST[d.stand] ? d.stand : 'nee';
    return { stand, optIn: !!(d && d.optIn), actief: !!(d && d.actief), aanvraagbaar: !!(d && d.aanvraagbaar) };
  };
  const diagStandTekst = (stand) => t(DIAG_STAND_TEKST[stand][0], DIAG_STAND_TEKST[stand][1]);
  const diagHulpTekst = (stand) => t(DIAG_HULP[stand][0], DIAG_HULP[stand][1]);

  /**
   * Chrome om het recht vragen. MOET synchroon uit een klikhandler komen (anders weigert Chrome met «user gesture»).
   * Geeft {stand} terug: 'ja' | 'geweigerd' | 'nee' | 'niet-aanvraagbaar'. De fouttekst van Chrome gaat nooit naar de gebruiker,
   * alleen de stand (de teksten hierboven zeggen wat er te doen is).
   */
  function vraagDebuggerRecht() {
    // 0.8.0: `debugger` staat VAST in het manifest. Er wordt niets meer gevraagd (Chrome weigert `debugger` als optioneel recht:
    // «Permission 'debugger' cannot be listed as optional»); we lezen alleen of Chrome het recht actief heeft.
    const inManifest = (() => { try { return (chrome.runtime.getManifest().permissions || []).includes('debugger'); } catch { return false; } })();
    if (!inManifest) return Promise.resolve({ stand: 'niet-aanvraagbaar' });
    let poging;
    try { poging = Promise.resolve(chrome.permissions.contains({ permissions: ['debugger'] })); }
    catch (e) { poging = Promise.reject(e); }
    return poging.then((ok) => ({ stand: ok === true ? 'ja' : 'nee' }), (e) => ({ stand: standVanFout(e) }));
  }
  /** Zelfde indeling als diagRechtStandVanFout() in shared.js (de extensie-pagina's kunnen geen module importeren). */
  function standVanFout(fout) {
    const m = String((fout && fout.message) || fout || '').toLowerCase();
    if (!m) return 'geweigerd';
    if (/only permissions specified in the manifest|cannot be optional|not a recognized permission|unknown permission/.test(m)) return 'niet-aanvraagbaar';
    if (/user gesture/.test(m)) return 'nee';
    return 'geweigerd';
  }

  const $ = (id) => document.getElementById(id);
  const heeft = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const maak = (tag, attrs, ...kinderen) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, String(v)); }
    for (const k of kinderen) if (k != null) el.append(k);
    return el;
  };

  /** Staat van een slot (ook bestand tegen ontbrekende velden). */
  function staatVan(slot) {
    if (!slot || typeof slot !== 'object') return 'niet-gekoppeld';
    if (typeof slot.staat === 'string' && STATEN.includes(slot.staat)) return slot.staat;
    return slot.gekoppeld ? 'vergrendeld' : 'niet-gekoppeld';
  }
  const isOpen = (staat) => staat === 'ontgrendeld' || staat === 'agent';
  /** Sloten die in deze status een kaart krijgen: prive altijd, technisch alleen als de achtergrond hem meegeeft (niet null). */
  function slotenVan(s) {
    const sl = s && s.sloten && typeof s.sloten === 'object' ? s.sloten : {};
    const prive = sl.prive && typeof sl.prive === 'object' ? sl.prive : { ruimte: 'prive', gekoppeld: false, staat: 'niet-gekoppeld' };
    const technisch = sl.technisch && typeof sl.technisch === 'object' ? sl.technisch : null;
    return { prive, technisch };
  }

  async function vraag(bericht) {
    try { return await chrome.runtime.sendMessage(bericht); } catch { return null; }
  }
  function openTab(url) { try { void Promise.resolve(chrome.tabs.create({ url })).catch(() => undefined); } catch { /* geen tabs-API */ } }

  function vertaal() {
    document.documentElement.setAttribute('lang', NL ? 'nl' : 'uk');
    if (!NL) return;
    for (const el of document.querySelectorAll('[data-nl]')) el.textContent = el.getAttribute('data-nl');
    for (const el of document.querySelectorAll('[data-nl-aria]')) el.setAttribute('aria-label', el.getAttribute('data-nl-aria'));
    for (const el of document.querySelectorAll('[data-nl-placeholder]')) el.setAttribute('placeholder', el.getAttribute('data-nl-placeholder'));
  }

  const twee = (n) => String(n).padStart(2, '0');
  // 0.7.1: «Без обмеження» noemt geen «найпізніше» — de server opent een nieuwe rij vóór de 366 dagen. Andere soorten zonder vaste duur tonen de achtervang.
  const EINDE_TEKST = { uitloggen: ['До виходу з акаунта', 'Tot uitloggen'], browser: ['До закриття браузера', 'Tot de browser sluit'] };
  function resttijdTekst(exp, nu, einde) {
    const ms = Number(exp) - nu;
    if (!(ms > 0)) return t('Час вийшов — доступ закривається', 'Tijd om — de toegang gaat dicht');
    if (einde === 'handmatig') return t('Без обмеження — доки не відкличете', 'Onbeperkt — tot u intrekt');
    const soort = typeof einde === 'string' && Object.prototype.hasOwnProperty.call(EINDE_TEKST, einde) ? EINDE_TEKST[einde] : null;
    if (soort) {
      let datum = '';
      try { datum = new Date(Number(exp)).toLocaleDateString(NL ? 'nl-NL' : 'uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { datum = ''; }
      return `${t(soort[0], soort[1])}${datum ? ` · ${t('найпізніше', 'uiterlijk')} ${datum}` : ''}`;
    }
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const klok = d > 0 ? `${d} ${t('дн.', 'd')} ${h}:${twee(m)}` : h > 0 ? `${h}:${twee(m)}:${twee(sec)}` : `${m}:${twee(sec)}`;
    let tot = '';
    try { tot = new Date(Number(exp)).toLocaleTimeString(NL ? 'nl-NL' : 'uk-UA', { hour: '2-digit', minute: '2-digit' }); } catch { tot = ''; }
    return `${t('Залишилось', 'Nog')} ${klok}${tot ? ` · ${t('до', 'tot')} ${tot}` : ''}`;
  }
  const tijd = (ms) => { try { return new Date(Number(ms)).toLocaleTimeString(NL ? 'nl-NL' : 'uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };

  // ---------------------------------------------------------------- pictogrammen (SVG via de DOM-API)
  const PICT = {
    'niet-gekoppeld': ['M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5', 'M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.4', 'M3 3l18 18'],
    vergrendeld: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V7a4 4 0 0 1 8 0v4', 'M12 15v2'],
    ontgrendeld: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V7a4 4 0 0 1 7.75-1.4', 'M12 15v2'],
    agent: ['M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z', 'M12 4v4', 'M9 14h.01M15 14h.01', 'M2 13v3M22 13v3'],
  };
  function pict(staat) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pict'); svg.setAttribute('data-pict', staat); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    for (const d of PICT[staat]) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); svg.append(p); }
    return svg;
  }

  function chipLijst(id, items, tekst, label) {
    const ul = maak('ul', { id, class: 'chips', 'aria-label': label });
    ul.replaceChildren(...items.map((x) => maak('li', null, tekst(x))));
    return ul;
  }

  // ---------------------------------------------------------------- 0.8.0: één «?» per blok, gedeeld toestandsmodel, werkelijke debuggerstand
  /** Eén rond «?»-knopje (44 px tikvlak) dat een uitleg open/dicht klapt. Altijd precies één per blok. */
  function helpKnop(doelId, label) {
    const k = maak('button', { type: 'button', class: 'help', 'aria-expanded': 'false', 'aria-controls': doelId, title: label || t('Пояснення', 'Uitleg'), 'aria-label': label || t('Пояснення', 'Uitleg') }, '?');
    k.addEventListener('click', () => { const doel = $(doelId); if (!doel) return; const open = doel.hidden; doel.hidden = !open; k.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    return k;
  }
  /** Statische «?»-knoppen in HTML: <button class="help" data-help="id">. */
  function koppelHelp(root) {
    for (const k of (root || document).querySelectorAll('button.help[data-help]:not([data-help-klaar])')) {
      k.setAttribute('data-help-klaar', '1');
      if (!k.textContent.trim()) k.textContent = '?';
      const doelId = k.getAttribute('data-help');
      k.setAttribute('aria-controls', doelId); k.setAttribute('aria-expanded', 'false');
      if (!k.getAttribute('aria-label')) k.setAttribute('aria-label', t('Пояснення', 'Uitleg'));
      if (!k.title) k.title = k.getAttribute('aria-label');
      k.addEventListener('click', () => { const doel = $(doelId); if (!doel) return; const open = doel.hidden; doel.hidden = !open; k.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    }
  }

  /**
   * Werkelijke stand van diepe diagnose, uit de status (nooit verzonnen). Codes: actief | beschikbaar | uit | wacht | geblokkeerd | fout.
   * Scheidt: Chrome-recht (manifest) · keuze van de gebruiker (diagOptIn) · technische ontgrendeling met browser.debug · aanhaking.
   */
  function diagWerkelijk(s) {
    const d = diagStandVan(s);
    const ruw = s && s.diagnostiek && typeof s.diagnostiek === 'object' ? s.diagnostiek : {};
    const tech = slotenVan(s).technisch;
    const techOpen = !!(tech && isOpen(staatVan(tech)) && tech.ontgrendeling && Array.isArray(tech.ontgrendeling.caps) && tech.ontgrendeling.caps.includes('browser.debug'));
    if (d.actief) return { code: 'actief', uk: 'Активна зараз', nl: 'Nu actief', reden: ['Chrome показує жовту смугу; її можна закрити будь-коли — це одразу зупиняє діагностику.', 'Chrome toont een gele balk; sluiten stopt de diagnose meteen.'] };
    if (d.stand !== 'ja') return { code: 'geblokkeerd', uk: 'Заблоковано', nl: 'Geblokkeerd', reden: [DIAG_HULP[d.stand][0], DIAG_HULP[d.stand][1]] };
    if (ruw.laatsteFout && ruw.laatsteFout.code === 'CONFLICT') return { code: 'fout', uk: 'Конфлікт', nl: 'Conflict', reden: ['До вкладки вже під’єднано інший налагоджувач (відкриті Chrome DevTools або інший інструмент). Закрийте DevTools для цієї вкладки й повторіть.', 'Er hangt al een andere debugger aan het tabblad (Chrome DevTools open of een ander hulpmiddel). Sluit DevTools voor dat tabblad en probeer opnieuw.'] };
    if (ruw.laatsteFout) return { code: 'fout', uk: 'Помилка', nl: 'Fout', reden: ['Chrome не зміг під’єднати налагоджувач до вкладки. Оновіть вкладку й повторіть.', 'Chrome kon de debugger niet aan het tabblad hangen. Vernieuw het tabblad en probeer opnieuw.'] };
    if (!d.optIn) return { code: 'uit', uk: 'Вимкнено', nl: 'Uit', reden: ['Ви не дали згоди. Нічого не збирається.', 'U gaf geen toestemming. Er wordt niets verzameld.'] };
    if (!techOpen) return { code: 'wacht', uk: 'Очікує технічного доступу', nl: 'Wacht op technische toegang', reden: ['Згоду дано. Діагностика почнеться лише після відкриття технічного доступу на сайті з позначкою «Глибока діагностика» і лише на дозволених адресах.', 'Toestemming gegeven. Diagnose start pas na het openen van de technische toegang op de site met «Diepe diagnose», en alleen op toegestane adressen.'] };
    return { code: 'beschikbaar', uk: 'Готово до використання', nl: 'Klaar voor gebruik', reden: ['Під’єднання відбувається лише на запит технічного ШІ, на кілька секунд, з жовтою смугою Chrome.', 'Aanhaken gebeurt alleen op verzoek van de technische AI, enkele seconden, met de gele balk van Chrome.'] };
  }

  /**
   * Gedeeld toestandsmodel (pop-up, opties, zijpaneel; dezelfde velden gaan via de status naar de site/MCP). Elke regel: id, stand
   * ('ja' | 'nee' | 'let-op'), tekst. Samenvatting is NOOIT groen als één voorwaarde voor AI-werk ontbreekt.
   */
  function toestandModel(s) {
    const { prive, technisch } = slotenVan(s);
    const r = [];
    const add = (id, stand, uk, nl) => r.push({ id, stand, tekst: t(uk, nl) });
    add('geinstalleerd', 'ja', 'Розширення встановлене', 'Extensie geïnstalleerd');
    add('dienst', s ? 'ja' : 'nee', s ? 'Служба розширення працює' : 'Служба розширення не відповідає', s ? 'Dienst van de extensie werkt' : 'Dienst van de extensie antwoordt niet');
    const mail = s && typeof s.accountEmail === 'string' ? s.accountEmail : '';
    add('account', mail ? 'ja' : 'nee', mail ? `Обліковий запис: ${mail}` : 'Обліковий запис не підключено', mail ? `Account: ${mail}` : 'Geen account gekoppeld');
    const p0 = s && (s.profielTab === 'technisch' || s.profielTab === 'gebruiker') ? s.profielTab : null;
    const p = p0 === 'technisch' && !technisch ? 'gebruiker' : p0; // zelfde regel als toonKop: geen «технічний» zonder technische kaart
    add('tab', p ? 'ja' : 'let-op', p ? `Вкладка: ${t(PROFIEL_NAAM[p][0], PROFIEL_NAAM[p][1])}` : 'Активна вкладка не на tarasevych.com', p ? `Tabblad: ${t(PROFIEL_NAAM[p][0], PROFIEL_NAAM[p][1])}` : 'Actief tabblad niet op tarasevych.com');
    const open = [prive, technisch].filter((x) => x && isOpen(staatVan(x)));
    add('toegang', open.length ? 'ja' : (prive && prive.gekoppeld) ? 'let-op' : 'nee', open.length ? 'Доступ ШІ відкрито' : (prive && prive.gekoppeld) ? 'Доступ ШІ закрито' : 'ШІ не підключено', open.length ? 'AI-toegang open' : (prive && prive.gekoppeld) ? 'AI-toegang dicht' : 'AI niet gekoppeld');
    const verbondenAgent = [prive, technisch].some((x) => x && staatVan(x) === 'agent');
    add('agent', verbondenAgent ? 'ja' : 'let-op', verbondenAgent ? 'ШІ-агент підключено' : 'ШІ-агент зараз не працює', verbondenAgent ? 'AI-agent verbonden' : 'Er werkt nu geen AI-agent');
    const dw = diagWerkelijk(s);
    if (technisch) add('debugger', dw.code === 'actief' || dw.code === 'beschikbaar' ? 'ja' : dw.code === 'geblokkeerd' || dw.code === 'fout' ? 'nee' : 'let-op', `Глибока діагностика: ${dw.uk}`, `Diepe diagnose: ${dw.nl}`);
    return r;
  }
  /** Eén zin bovenaan: groen alleen als dienst, account, toegang en tabblad alle vier kloppen. */
  function samenvatting(s) {
    const m = Object.fromEntries(toestandModel(s).map((x) => [x.id, x]));
    if (m.dienst.stand !== 'ja') return { niveau: 'fout', tekst: m.dienst.tekst };
    if (m.account.stand !== 'ja') return { niveau: 'uit', tekst: m.account.tekst };
    if (m.toegang.stand !== 'ja') return { niveau: 'uit', tekst: m.toegang.tekst };
    if (m.tab.stand !== 'ja') return { niveau: 'let-op', tekst: `${m.toegang.tekst} · ${m.tab.tekst}` };
    return { niveau: 'ok', tekst: `${m.toegang.tekst} · ${m.tab.tekst}` };
  }

  // ---------------------------------------------------------------- kaart per slot
  let opties = { reden: 'popup', naStatus: null };
  let laatste = null;
  const laatsteStaat = { prive: null, technisch: null };
  let laatsteTeken = '';
  let verlopenGemeld = false;

  function kaart(r, slot, profielTab) {
    const staat = staatVan(slot);
    const o = isOpen(staat) && slot.ontgrendeling && typeof slot.ontgrendeling === 'object' ? slot.ontgrendeling : null;
    const teksten = r === 'technisch' ? STAAT_TEKST : STAAT_TEKST_PRIVE;
    const [uk, nl] = teksten[staat];
    const titel = maak('h2', { id: `kop-${r}`, class: 'kaart-titel' }, t(TITEL[r][0], TITEL[r][1]));
    const staatEl = maak('p', { id: `staat-${r}`, class: 'staat-tekst' }, t(uk, nl));
    const rest = maak('p', { id: `resttijd-${r}`, class: 'resttijd', hidden: !o, 'data-exp': o ? Number(o.exp) : null, 'data-einde': o && typeof o.einde === 'string' ? o.einde : null });
    // 0.8.0: compacte kaart — dunne rand, kleur alleen in het pictogram en een smalle streep links; uitleg achter één «?».
    const sec = maak('section', { id: `kaart-${r}`, class: `kaart${opties.groot ? ' groot' : ''}`, 'data-ruimte': r, 'data-staat': staat, 'aria-labelledby': `kop-${r}` },
      maak('div', { class: 'kaart-kop' }, pict(staat), maak('div', { class: 'kaart-tekst' }, titel, staatEl, rest), helpKnop(`uitleg-${r}`)),
      maak('p', { class: 'zacht uitleg', id: `uitleg-${r}`, hidden: true }, t(STAAT_UITLEG[r][staat][0], STAAT_UITLEG[r][staat][1])));
    if (o) {
      const caps = Array.isArray(o.caps) ? o.caps.map(String) : [];
      const domeinen = Array.isArray(o.domeinen) ? o.domeinen.map(String) : [];
      sec.append(maak('div', { class: 'rechten' },
        maak('p', { class: 'label' }, t('Що дозволено ШІ', 'Wat de AI mag')), chipLijst(`caps-${r}`, caps, capNaam, t('Дозволи', 'Rechten')),
        // 0.8.0: geen acht losse domeinen meer in beeld: «Доступ до N сайтів» klapt open.
        maak('details', { class: 'sites', id: `sites-${r}` }, maak('summary', null, `${t('Доступ до', 'Toegang tot')} ${domeinen.length} ${t(domeinen.length === 1 ? 'сайту' : 'сайтів', domeinen.length === 1 ? 'site' : 'sites')}`),
          chipLijst(`domeinen-${r}`, domeinen, (d) => d, t('Сайти', 'Sites')))));
    }
    const agenten = slot.ai && Array.isArray(slot.ai.agenten) ? slot.ai.agenten : [];
    if (staat === 'agent' && agenten.length) sec.append(maak('p', { id: `ai-agenten-${r}`, class: 'zacht' }, `${t('Активні агенти', 'Actieve agenten')}: ${agenten.map((a) => String((a && a.naam) || '?').slice(0, 40)).join(', ')}`));
    // Past het actieve tabblad bij dit slot?
    if (slot.gekoppeld && profielTab) {
      if (r === 'technisch' && profielTab !== 'technisch') sec.append(maak('p', { class: 'zacht tab-melding' }, t('Ця вкладка не в технічному режимі — технічний ШІ тут нічого не бачить і не виконує.', 'Dit tabblad staat niet in de technische modus — de technische AI ziet en doet hier niets.')));
      if (r === 'prive' && profielTab === 'technisch') sec.append(maak('p', { class: 'zacht tab-melding' }, t('Ця вкладка в іншому режимі — ШІ користувача її не бачить.', 'Dit tabblad staat in een andere modus — de AI van de gebruiker ziet het niet.')));
    }
    if (slot.gekoppeld && slot.verbonden === false) sec.append(maak('p', { class: 'waarschuwing' }, t('Немає з’єднання з сервером. Розширення спробує ще раз саме.', 'Geen verbinding met de server. De extensie probeert het zelf opnieuw.')));
    if (slot.fout === 'revoked' && !slot.gekoppeld) sec.append(maak('p', { class: 'waarschuwing' }, t('Підключення було відкликано на сайті. Підключіть знову.', 'De koppeling is op de site ingetrokken. Koppel opnieuw.')));
    // Knoppen
    if (!slot.gekoppeld) {
      const k = maak('button', { id: `koppelen-${r}`, type: 'button', class: 'primair' },
        r === 'prive' ? t('Додати доступ як користувач', 'Toegang als gebruiker toevoegen') : t('Підключити технічний профіль', 'Technisch profiel koppelen'));
      k.addEventListener('click', () => openTab(r === 'prive' ? URLS.koppelenPrive : URLS.koppelenTechnisch));
      sec.append(k);
    } else {
      if (staat === 'vergrendeld') {
        const k = maak('button', { id: `ontgrendelen-${r}`, type: 'button', class: 'primair' },
          r === 'prive' ? t('Відкрити доступ на сайті', 'Toegang openen op de site') : t('Розблокувати на сайті', 'Ontgrendelen op de site'));
        k.addEventListener('click', () => openTab(r === 'prive' ? URLS.ontgrendelenPrive : URLS.ontgrendelenTechnisch));
        sec.append(k);
      }
      const kan = isOpen(staat);
      const knop = maak('button', { id: `intrekken-${r}`, type: 'button', class: 'gevaar rand', 'aria-describedby': `intrekken-uitleg-${r}`, disabled: !kan, 'aria-disabled': kan ? 'false' : 'true' },
        r === 'prive' ? t('Відкликати доступ ШІ', 'AI-toegang intrekken') : t('Відкликати технічний доступ', 'Technische toegang intrekken'));
      knop.addEventListener('click', () => { void trekIn(r); });
      sec.append(knop, maak('p', { id: `intrekken-uitleg-${r}`, class: 'vh' }, kan
        ? (r === 'prive' ? t('Одразу закриває доступ ШІ користувача в цьому браузері. Підтвердження не потрібне.', 'Sluit de AI-toegang van de gebruiker in deze browser meteen. Geen bevestiging nodig.')
          : t('Одразу закриває технічний доступ ШІ в цьому браузері. Passkey не потрібен.', 'Sluit de technische AI-toegang in deze browser meteen. Geen passkey nodig.'))
        : t('Неактивно: доступ уже закрито — ШІ нічого не бачить і не виконує.', 'Niet actief: de toegang is al dicht — de AI ziet en doet niets.')));
    }
    return sec;
  }

  /** Lokale agent: keuze in de opties (nativeOptIn) + vinkje in een ontgrendeling + verbinding; welk slot (technisch als beide). */
  function lokaalTekst(s) {
    const l = (s && s.lokaal) || {};
    const optIn = s && typeof s.nativeOptIn === 'boolean' ? s.nativeOptIn : !!l.toegestaan;
    const bij = l.ruimte === 'technisch' && slotenVan(s).technisch ? ` (${t('технічний профіль', 'technisch profiel')})` : l.ruimte === 'prive' ? ` (${t('як користувач', 'als gebruiker')})` : '';
    if (l.verbonden) return t('Локальний агент: підключено (лише читання)', 'Lokale agent: verbonden (alleen lezen)') + bij;
    if (!optIn) return t('Локальний агент: вимкнено в налаштуваннях', 'Lokale agent: uit in de instellingen');
    if (!l.toegestaan) return t('Локальний агент: увімкнено, діє лише після відкриття доступу з позначкою «локальний агент»', 'Lokale agent: aan, werkt pas na het openen van de toegang met «lokale agent»');
    return t('Локальний агент: дозволено (лише читання), не підключено', 'Lokale agent: toegestaan (alleen lezen), niet verbonden') + bij;
  }

  /**
   * Stand van de diepe diagnose tonen. In de opties vult hij de vaste sectie (#diag-recht, #diag-hulp, #diag-pakket-rij); in de
   * pop-up en het zijpaneel bouwt hij een blok in #diagnostiek, met de knop die het recht BINNEN DE KLIK vraagt.
   * Het blok bestaat alleen als het slot met beheerrechten bestaat: zonder dat slot kan diepe diagnose nooit aan.
   */
  function toonDiag(s) {
    const d = diagStandVan(s);
    if ($('diag-recht')) {
      $('diag-recht').textContent = `${diagStandTekst(d.stand)}${d.actief ? ` · ${t('іде зараз', 'nu bezig')}` : ''}`;
      const hulp = d.stand === 'ja' ? '' : diagHulpTekst(d.stand);
      if ($('diag-hulp')) { $('diag-hulp').hidden = !hulp; $('diag-hulp').textContent = hulp; }
      if ($('diag-pakket-rij')) $('diag-pakket-rij').hidden = d.stand !== 'niet-aanvraagbaar' && d.stand !== 'geweigerd';
    }
    const doos = $('diagnostiek');
    if (!doos) return;
    if (!slotenVan(s).technisch) { doos.replaceChildren(); doos.hidden = true; return; }
    doos.hidden = false;
    const aan = d.stand === 'ja' && d.optIn;
    const w = diagWerkelijk(s);
    // 0.8.0: één regel met de werkelijke stand + één «?»; reden en herstel alleen als er iets mis is of als «?» open is.
    const regels = [
      maak('div', { class: 'diag-kop' },
        maak('p', { class: 'diag-stand', 'data-diag-stand': d.stand, 'data-werkelijk': w.code }, `${capNaam('browser.debug')}: ${t(w.uk, w.nl)}`),
        helpKnop('diag-waarom', t('Що це?', 'Wat is dit?'))),
    ];
    const knop = maak('button', { type: 'button', id: 'diag-aan', class: aan ? '' : 'primair', disabled: d.stand !== 'ja', title: d.stand !== 'ja' ? t(w.reden[0], w.reden[1]) : '' }, aan ? t('Вимкнути', 'Uitzetten') : t('Дати згоду', 'Toestemming geven'));
    knop.addEventListener('click', () => {
      const wil = !aan;
      const toestemming = wil ? vraagDebuggerRecht() : null;
      void zetDiagnose(wil, toestemming);
    });
    regels.push(knop, maak('p', { class: 'zacht', id: 'diag-waarom', hidden: true }, `${t(DIAG_WAAROM[0], DIAG_WAAROM[1])} ${t(w.reden[0], w.reden[1])}`));
    if (w.code === 'geblokkeerd' || w.code === 'fout') regels.push(maak('p', { class: 'let-op', id: 'diag-hulp-blok' }, t(w.reden[0], w.reden[1])));
    doos.replaceChildren(...regels);
  }
  /** Aan/uit zetten vanuit de pop-up of het zijpaneel; `toestemming` is de belofte die in de klik begon (of null bij uitzetten). */
  async function zetDiagnose(wil, toestemming) {
    const knop = $('diag-aan');
    if (knop) knop.disabled = true;
    try {
      let stand = 'ja';
      if (wil) { const r = await toestemming; stand = r && r.stand ? r.stand : 'geweigerd'; }
      if (wil && stand !== 'ja') {
        // De uitkomst naar de achtergrond: alleen zo weten de andere schermen en de site waarom het niet lukte.
        await vraag({ op: 'set-diag-stand', stand });
        if ($('aankondiging')) $('aankondiging').textContent = `${diagStandTekst(stand)}. ${diagHulpTekst(stand)}`;
        await ververs();
        return;
      }
      const x = await vraag({ op: 'set-diag', on: wil });
      // 0.8.0: nooit stil terugspringen — mislukt het, dan zegt de aankondiging waarom.
      if (!x || x.ok === false) { if ($('aankondiging')) $('aankondiging').textContent = t('Не вдалося змінити. Перезавантажте розширення (↻ у chrome://extensions) і повторіть.', 'Wijzigen mislukt. Herlaad de extensie (↻ in chrome://extensions) en probeer opnieuw.'); await ververs(); return; }
      if ($('aankondiging')) $('aankondiging').textContent = wil ? t('Згоду на глибоку діагностику дано.', 'Toestemming voor diepe diagnose gegeven.') : t('Глибоку діагностику вимкнено.', 'Diepe diagnose staat uit.');
      await ververs();
    } finally { if ($('diag-aan')) $('diag-aan').disabled = false; }
  }

  function waarschuwingTekst(s) {
    if (!s) return t('Не вдалося отримати стан розширення. Закрийте й знову відкрийте це вікно.', 'De status van de extensie is niet beschikbaar. Sluit dit venster en open het opnieuw.');
    if (s.account === 'mismatch') return t('На сторінці інший обліковий запис — команди ШІ відхиляються, доки ви не ввійдете тим самим.', 'De pagina is van een ander account — AI-opdrachten worden geweigerd tot u met hetzelfde account inlogt.');
    if (s.debugging) return t('Іде глибока діагностика (налагоджувач Chrome).', 'Diepe diagnose bezig (Chrome-debugger).');
    // 0.6.1: het recht is weggehaald terwijl de gebruiker diepe diagnose aan had staan — dat moet hij weten, want er wordt niets verzameld.
    if (diagStandVan(s).stand === 'ingetrokken') return t('Дозвіл налагоджувача відкликано — глибока діагностика не працює.', 'Het debuggerrecht is ingetrokken — diepe diagnose werkt niet.');
    return '';
  }

  function toonKop(s) {
    if ($('status-regel')) {
      const sv = samenvatting(s);
      $('status-regel').setAttribute('data-niveau', sv.niveau);
      $('status-regel').textContent = sv.tekst;
    }
    if ($('toestand')) {
      $('toestand').replaceChildren(...toestandModel(s).map((x) => maak('li', { 'data-stand': x.stand, 'data-id': x.id }, maak('span', { class: 'stip', 'aria-hidden': 'true' }), maak('span', null, x.tekst), maak('span', { class: 'vh' }, x.stand === 'ja' ? t('гаразд', 'in orde') : x.stand === 'nee' ? t('проблема', 'probleem') : t('увага', 'let op')))));
    }
    if ($('account')) {
      const mail = s && typeof s.accountEmail === 'string' && s.accountEmail ? s.accountEmail.slice(0, 120) : '';
      $('account').textContent = `${t('Обліковий запис', 'Account')}: ${mail || '—'}`;
    }
    if ($('profiel-tab')) {
      const p = s && (s.profielTab === 'technisch' || s.profielTab === 'gebruiker') ? s.profielTab : null;
      // «Технічний» alleen als de technische kaart bestaat (anders kan er geen technisch tabblad voor dit account zijn).
      const toon = p === 'technisch' && !slotenVan(s).technisch ? 'gebruiker' : p;
      $('profiel-tab').setAttribute('data-profiel', toon || 'geen');
      $('profiel-tab').textContent = toon ? `${t('Профіль вкладки', 'Profiel van het tabblad')}: ${t(PROFIEL_NAAM[toon][0], PROFIEL_NAAM[toon][1])}`
        : t('Активна вкладка не на tarasevych.com', 'Het actieve tabblad is niet op tarasevych.com');
    }
  }

  function toonStatus(s) {
    laatste = s && typeof s === 'object' ? s : null;
    const { prive, technisch } = slotenVan(laatste);
    toonKop(laatste);
    const profielTab = laatste ? laatste.profielTab : null;
    const teken = JSON.stringify([prive, technisch, profielTab, NL]);
    const doos = $('sloten');
    if (doos && teken !== laatsteTeken) {
      laatsteTeken = teken;
      const kaarten = [kaart('prive', prive, profielTab)];
      if (technisch) { const k = kaart('technisch', technisch, profielTab); if (profielTab === 'technisch') kaarten.unshift(k); else kaarten.push(k); }
      doos.replaceChildren(...kaarten);
    }
    // Aankondiging bij een wijziging van staat (aria-live).
    for (const [r, slot] of [['prive', prive], ['technisch', technisch]]) {
      const staat = slot ? staatVan(slot) : null;
      if (laatsteStaat[r] !== null && staat !== null && laatsteStaat[r] !== staat && $('aankondiging')) {
        const tk = (r === 'technisch' ? STAAT_TEKST : STAAT_TEKST_PRIVE)[staat];
        $('aankondiging').textContent = `${t(TITEL[r][0], TITEL[r][1])}: ${t(tk[0], tk[1])}`;
      }
      laatsteStaat[r] = staat;
    }
    if ($('lokaal')) { $('lokaal').hidden = !prive.gekoppeld && !(technisch && technisch.gekoppeld); $('lokaal').textContent = lokaalTekst(laatste); }
    toonDiag(laatste);
    const w = waarschuwingTekst(laatste);
    if ($('waarschuwing')) { $('waarschuwing').hidden = !w; $('waarschuwing').textContent = w; }
    verlopenGemeld = false;
    tik();
    if (typeof opties.naStatus === 'function') opties.naStatus(laatste, { prive, technisch });
  }

  function tik() {
    const nu = Date.now();
    for (const el of document.querySelectorAll('[data-exp]')) {
      const exp = Number(el.getAttribute('data-exp'));
      if (!exp) { el.hidden = true; continue; }
      el.hidden = false;
      el.textContent = resttijdTekst(exp, nu, el.getAttribute('data-einde'));
      el.classList.toggle('bijna', exp - nu < 5 * 60_000);
      if (exp <= nu && !verlopenGemeld) { verlopenGemeld = true; void ververs(); }
    }
  }

  async function ververs() {
    const s = await vraag({ op: 'status' });
    toonStatus(s && typeof s === 'object' && s.ok !== false ? s : null);
    return laatste;
  }

  async function trekIn(r) {
    const knop = $(`intrekken-${r}`);
    if (knop) knop.disabled = true;
    const x = await vraag({ op: 'vergrendel', reden: opties.reden, ruimte: r });
    if (x && x.ok !== false) {
      if (x.status && typeof x.status === 'object') toonStatus(x.status);
      else {
        // Achtergrond zonder status in het antwoord: dit slot vergrendeld tonen.
        const s = laatste ? JSON.parse(JSON.stringify(laatste)) : { sloten: {} };
        s.sloten = s.sloten || {};
        const oud = s.sloten[r] || { ruimte: r, gekoppeld: true };
        s.sloten[r] = { ...oud, staat: oud.gekoppeld === false ? 'niet-gekoppeld' : 'vergrendeld', ontgrendeling: null, ai: { verbonden: false, agenten: [] } };
        toonStatus(s);
      }
      if ($('aankondiging')) $('aankondiging').textContent = r === 'prive' ? t('Доступ ШІ відкликано. Доступ закрито.', 'AI-toegang ingetrokken. De toegang is dicht.') : t('Технічний доступ ШІ відкликано. Розширення заблоковане.', 'Technische AI-toegang ingetrokken. De extensie is vergrendeld.');
    } else {
      if ($('aankondiging')) $('aankondiging').textContent = t('Не вдалося відкликати доступ. Спробуйте ще раз або відкличте його на сайті.', 'Intrekken mislukt. Probeer opnieuw of trek de toegang in op de site.');
      await ververs();
    }
  }

  /** Start: live updates (status-push), aftellen, vangnet. */
  function start(o) {
    opties = { ...opties, ...(o || {}) };
    vertaal();
    koppelHelp(document);
    chrome.runtime.onMessage.addListener((m, sender) => {
      if (!m || m.op !== 'status-push' || !m.status || typeof m.status !== 'object') return;
      // Alleen van de eigen achtergrond (geen tabblad: een content script kan dit dus niet vervalsen).
      if (sender && (sender.id !== chrome.runtime.id || sender.tab)) return;
      toonStatus(m.status);
    });
    setInterval(tik, 1000);
    setInterval(() => { void ververs(); }, 15_000); // vangnet als een push gemist is
    return ververs();
  }

  globalThis.MR_UI = Object.freeze({
    NL, t, URLS, STAAT_TEKST, STAAT_TEKST_PRIVE, TITEL, BROWSER_CAPS, CAP_NAAM, CAP_UITLEG, capNaam, staatVan, slotenVan, isOpen, vraag, openTab, tijd,
    resttijdTekst, start, ververs, trekIn, toonStatus, laatste: () => laatste, heeft, maak,
    // 0.6.1 (punt 7): diepe diagnose — stand, teksten en het verzoek dat STRIKT uit een klik moet komen.
    DIAG_STAND_TEKST, DIAG_HULP, DIAG_WAAROM, DIAG_PAKKET_URL, diagWerkelijk, toestandModel, samenvatting, helpKnop, koppelHelp, diagStandVan, diagStandTekst, diagHulpTekst, vraagDebuggerRecht, standVanFout, toonDiag,
  });
})();
