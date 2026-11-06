// 0.9.0: sectie «Вбудований ШІ Chrome / Ingebouwde AI van Chrome» in de opties. Bouwt alles via de DOM-API (geen HTML als tekst).
// Elke wijziging wordt meteen bewaard (chrome.storage.local → lokaleAi). Riskante schakelaars staan standaard uit en dragen «!».
(() => {
  'use strict';
  const L = globalThis.MR_LOKALE_AI;
  const UI = globalThis.MR_UI;
  const t = UI.t, maak = UI.maak;
  const wortel = document.getElementById('lokale-ai-inhoud');
  if (!L || !wortel) return;

  let cfg = L.opschonen(null);
  let params = null;
  const standEl = {};      // id → <span> met de stand
  const knopEl = {};       // id → downloadknop
  const voortEl = {};      // id → <progress>

  // Waarden → leesbare namen (uk/nl). Onbekende waarden tonen zichzelf.
  const NAAM = {
    'key-points': ['ключові пункти', 'kernpunten'], tldr: ['коротко (TL;DR)', 'kort (TL;DR)'], teaser: ['анонс', 'teaser'], headline: ['заголовок', 'kop'],
    'plain-text': ['простий текст', 'platte tekst'], markdown: ['Markdown', 'Markdown'], 'as-is': ['без змін', 'ongewijzigd'],
    short: ['короткий', 'kort'], medium: ['середній', 'middel'], long: ['довгий', 'lang'], shorter: ['коротше', 'korter'], longer: ['довше', 'langer'],
    formal: ['офіційний', 'formeel'], neutral: ['нейтральний', 'neutraal'], casual: ['невимушений', 'informeel'],
    'more-formal': ['офіційніше', 'formeler'], 'more-casual': ['невимушеніше', 'informeler'],
  };
  const naam = (v) => (NAAM[v] ? t(NAAM[v][0], NAAM[v][1]) : v);
  const taalOptie = (c) => [c, `${L.taalNaam(c)} (${c})`];

  async function bewaar(wijzig) {
    wijzig(cfg);
    try { cfg = await L.bewaar(cfg); meldOpslag(true); } catch { meldOpslag(false); }
    L.vergeetAlles();
    L.plaatsProefTokens(cfg);
  }
  function meldOpslag(ok) {
    const el = document.getElementById('lokale-ai-opgeslagen');
    if (!el) return;
    el.textContent = ok ? t('Збережено', 'Opgeslagen') : t('Не вдалося зберегти', 'Opslaan mislukt');
    el.className = ok ? 'ok' : 'fout';
    clearTimeout(meldOpslag.tm); meldOpslag.tm = setTimeout(() => { el.textContent = ''; }, 2500);
  }

  // ---------------------------------------------------------------- bouwstenen
  function schakel(id, uk, nl, waarde, opWijzig, { gevaar = false, uitlegUk = '', uitlegNl = '' } = {}) {
    const inp = maak('input', { type: 'checkbox', role: 'switch', id, 'aria-describedby': uitlegUk ? `${id}-uitleg` : null });
    inp.checked = !!waarde;
    inp.addEventListener('change', () => opWijzig(inp.checked));
    const tekst = maak('span', null, t(uk, nl));
    const lab = maak('label', { class: 'schakel slank' }, inp, gevaar ? maak('span', { class: 'gevaar-teken', title: t('Ризикована функція — за замовчуванням вимкнена', 'Riskante functie — standaard uit'), 'aria-label': t('Увага', 'Let op') }, '!') : null, tekst);
    const blok = maak('div', { class: `instelling${gevaar ? ' gevaar-instelling' : ''}` }, lab);
    if (uitlegUk) blok.append(maak('p', { id: `${id}-uitleg`, class: gevaar ? 'let-op' : 'zacht' }, t(uitlegUk, uitlegNl)));
    return blok;
  }
  function keuzeVeld(id, uk, nl, opties, waarde, opWijzig) {
    const sel = maak('select', { id });
    for (const o of opties) { const [v, tekst] = Array.isArray(o) ? o : [o, naam(o)]; const opt = maak('option', { value: v }, tekst); if (v === waarde) opt.selected = true; sel.append(opt); }
    sel.addEventListener('change', () => opWijzig(sel.value));
    return maak('label', { class: 'veld' }, maak('span', null, t(uk, nl)), sel);
  }
  function tekstVeld(id, uk, nl, waarde, opWijzig, { regels = 2, max = 4000, plaats = '' } = {}) {
    const ta = maak('textarea', { id, rows: regels, maxlength: max, placeholder: plaats || null, spellcheck: 'false' });
    ta.value = waarde || '';
    ta.addEventListener('change', () => opWijzig(ta.value));
    return maak('label', { class: 'veld breed' }, maak('span', null, t(uk, nl)), ta);
  }
  function getalVeld(id, uk, nl, waarde, opWijzig, { min = 0, max = 2, stap = 0.1 } = {}) {
    const inp = maak('input', { id, type: 'number', min, max, step: stap, inputmode: 'decimal' });
    inp.value = waarde;
    inp.addEventListener('change', () => opWijzig(inp.value));
    return maak('label', { class: 'veld' }, maak('span', null, t(uk, nl)), inp);
  }
  const groep = (uk, nl, ...kinderen) => maak('fieldset', { class: 'ai-groep' }, maak('legend', null, t(uk, nl)), ...kinderen);

  // ---------------------------------------------------------------- beschikbaarheid + download
  async function controleer() {
    const knop = document.getElementById('lokale-ai-controle');
    if (knop) { knop.disabled = true; knop.setAttribute('aria-busy', 'true'); }
    try {
      params = await L.promptParams();
      await Promise.all(L.API_IDS.map(async (id) => {
        const r = await L.beschikbaarheid(id, cfg);
        toonStand(id, r.stand, r.fout);
      }));
      const hint = document.getElementById('lokale-ai-params');
      if (hint) hint.textContent = params ? t(`Межі моделі: температура 0…${params.maxTemperature} (типово ${params.defaultTemperature}), topK 1…${params.maxTopK} (типово ${params.defaultTopK}). Порожні поля = типові значення. Заповнюйте обидва або жодне.`, `Grenzen van het model: temperatuur 0…${params.maxTemperature} (standaard ${params.defaultTemperature}), topK 1…${params.maxTopK} (standaard ${params.defaultTopK}). Lege velden = standaard. Vul beide in of geen van beide.`) : t('Порожні поля = типові значення моделі. Заповнюйте обидва або жодне.', 'Lege velden = standaard van het model. Vul beide in of geen van beide.');
    } finally { if (knop) { knop.disabled = false; knop.removeAttribute('aria-busy'); } }
  }
  function toonStand(id, stand, fout) {
    const el = standEl[id];
    if (!el) return;
    el.textContent = L.standTekst(stand) + (fout ? ` — ${fout}` : '');
    el.setAttribute('data-stand', stand);
    el.className = `ai-stand ${stand === 'available' ? 'ok' : stand === 'uit' ? 'zacht' : stand === 'downloadable' || stand === 'downloading' ? 'let-op' : 'fout'}`;
    if (knopEl[id]) knopEl[id].hidden = !(stand === 'downloadable' || stand === 'downloading' || stand === 'stil');
  }
  /** Download = create() binnen de klik (gebruikersgebaar). De voortgang komt via monitor/downloadprogress. */
  const afbrekers = {};
  function download(id) {
    const knop = knopEl[id], balk = voortEl[id];
    // Tweede klik tijdens het wachten = annuleren (Chrome kan zonder voortgang blijven hangen; de gebruiker moet eruit kunnen).
    if (afbrekers[id]) { afbrekers[id].abort(); return; }
    const ab = new AbortController(); afbrekers[id] = ab;
    knop.textContent = t('Скасувати завантаження', 'Download annuleren');
    balk.hidden = false; balk.removeAttribute('value');
    standEl[id].textContent = t('Завантаження… (кілька ГБ, може тривати довго)', 'Downloaden… (enkele GB, kan lang duren)');
    const p = L.instantie(id, cfg, { magDownloaden: true, nieuw: true, signal: ab.signal, opVoortgang: (f) => { balk.value = f; balk.textContent = `${Math.round(f * 100)}%`; } });
    p.then((inst) => { try { inst && inst.destroy && inst.destroy(); } catch { /* klaar */ } balk.value = 1; return controleer(); },
      (e) => { standEl[id].textContent = L.foutTekst(e); standEl[id].className = 'ai-stand fout'; balk.hidden = true; })
      .finally(() => { delete afbrekers[id]; knop.textContent = t('Завантажити модель', 'Model downloaden'); });
  }

  // ---------------------------------------------------------------- opbouw
  function bouw() {
    const c = cfg;
    const zet = (pad) => (v) => bewaar((x) => { const [a, b] = pad.split('.'); if (b) x[a][b] = v; else x[a] = v; });
    const modelTalen = L.MODEL_TALEN.map(taalOptie);
    const vertaalTalen = [['auto', t('мова інтерфейсу', 'taal van de interface')], ...L.VERTAAL_TALEN.map(taalOptie)];

    const apiLijst = maak('ul', { class: 'toestand ai-apis', id: 'lokale-ai-apis' });
    for (const id of L.API_IDS) {
      const a = L.API[id];
      const sw = maak('input', { type: 'checkbox', role: 'switch', id: `ai-api-${id}`, 'aria-label': t(a.naam[0], a.naam[1]) });
      sw.checked = c.apis[id];
      sw.addEventListener('change', async () => { await bewaar((x) => { x.apis[id] = sw.checked; }); toonStand(id, (await L.beschikbaarheid(id, cfg)).stand); });
      standEl[id] = maak('span', { class: 'ai-stand zacht', id: `ai-stand-${id}`, role: 'status' }, '…');
      knopEl[id] = maak('button', { type: 'button', class: 'primair', id: `ai-download-${id}`, hidden: true }, t('Завантажити модель', 'Model downloaden'));
      knopEl[id].addEventListener('click', () => download(id));
      voortEl[id] = maak('progress', { max: 1, value: 0, hidden: true, id: `ai-voortgang-${id}`, 'aria-label': t('Завантаження моделі', 'Model downloaden') });
      apiLijst.append(maak('li', { 'data-api': id },
        maak('label', { class: 'schakel slank' }, sw, maak('span', { class: 'ai-naam' }, t(a.naam[0], a.naam[1]), a.proef ? maak('span', { class: 'zacht' }, ` · ${t('пробний період (origin trial)', 'proefperiode (origin trial)')}`) : null)),
        standEl[id], knopEl[id], voortEl[id]));
    }

    const vlaggen = maak('ul', { class: 'ai-vlaggen' }, ...L.API_IDS.map((id) => {
      const url = `chrome://flags/#${L.API[id].vlag}`;
      const a = maak('a', { href: '#', 'data-url': url }, url);
      a.addEventListener('click', (e) => { e.preventDefault(); UI.openTab(url); });
      return maak('li', null, a);
    }), (() => { const u = 'chrome://flags/#optimization-guide-on-device-model'; const a = maak('a', { href: '#' }, u); a.addEventListener('click', (e) => { e.preventDefault(); UI.openTab(u); }); return maak('li', null, a); })());
    const intern = maak('a', { href: '#', id: 'lokale-ai-intern' }, 'chrome://on-device-internals');
    intern.addEventListener('click', (e) => { e.preventDefault(); UI.openTab('chrome://on-device-internals'); });

    wortel.replaceChildren(
      schakel('ai-aan', 'Увімкнути вбудований ШІ Chrome (працює лише на цьому пристрої, нічого не надсилає на сервер)', 'Ingebouwde AI van Chrome aanzetten (werkt alleen op dit apparaat, stuurt niets naar een server)', c.aan, async (v) => { await bewaar((x) => { x.aan = v; }); void controleer(); }),
      maak('h3', null, t('Функції та стан моделі', 'Functies en staat van het model')),
      apiLijst,
      maak('div', { class: 'knoppen-rij' }, (() => { const k = maak('button', { type: 'button', id: 'lokale-ai-controle' }, t('Перевірити знову', 'Opnieuw controleren')); k.addEventListener('click', () => void controleer()); return k; })(),
        maak('span', { id: 'lokale-ai-opgeslagen', role: 'status', 'aria-live': 'polite' })),

      maak('h3', null, t('Ризиковані функції', 'Riskante functies')),
      maak('p', { class: 'zacht' }, t('Позначені «!» — за замовчуванням вимкнені. Їх не заблоковано: вмикайте свідомо.', 'Gemarkeerd met «!» — standaard uit. Ze zijn niet geblokkeerd: zet ze bewust aan.')),
      schakel('ai-auto-download', 'Завантажувати модель автоматично, без окремого натискання', 'Model automatisch downloaden, zonder aparte klik', c.autoDownload, zet('autoDownload'),
        { gevaar: true, uitlegUk: 'Модель займає кілька ГБ (потрібно ≥22 ГБ вільного місця на диску профілю Chrome) і завантажується з серверів Google. Без цього перемикача завантаження починається лише кнопкою «Завантажити модель».', uitlegNl: 'Het model is enkele GB groot (≥22 GB vrij nodig op de schijf van het Chrome-profiel) en komt van de servers van Google. Zonder deze schakelaar start de download alleen met de knop «Model downloaden».' }),
      schakel('ai-tab-tekst', 'Дозволити локальному ШІ читати текст активної вкладки tarasevych.com (виділення або вся сторінка)', 'De lokale AI de tekst van het actieve tarasevych.com-tabblad laten lezen (selectie of hele pagina)', c.tabTekst, zet('tabTekst'),
        { gevaar: true, uitlegUk: 'Текст сторінки (зокрема особисті дані на ній) передається моделі на цьому пристрої. На сервер нічого не йде, але все, що видно на сторінці, потрапляє у вхід моделі. Інші сайти ніколи не читаються.', uitlegNl: 'De tekst van de pagina (ook persoonlijke gegevens erop) gaat naar het model op dit apparaat. Er gaat niets naar een server, maar alles op de pagina komt in de invoer van het model. Andere sites worden nooit gelezen.' }),
      schakel('ai-multimodaal', 'Зображення як вхід для діалогу (Prompt API, експериментально)', 'Afbeeldingen als invoer voor het gesprek (Prompt API, experimenteel)', c.multimodaal, zet('multimodaal'),
        { gevaar: true, uitlegUk: 'Експериментальна можливість: потребує GPU, може бути недоступна або працювати нестабільно.', uitlegNl: 'Experimentele mogelijkheid: vraagt een GPU, kan ontbreken of onstabiel werken.' }),

      schakel('ai-site-toegang', 'Дозволити сторінкам Mijn Ruimte (*.tarasevych.com) використовувати локальний ШІ через розширення', 'Pagina’s van Mijn Ruimte (*.tarasevych.com) de lokale AI via de extensie laten gebruiken', c.siteToegang, zet('siteToegang'),
        { gevaar: true, uitlegUk: 'Сторінка сайту зможе надсилати текст локальній моделі (через невидимий документ offscreen.html) і отримувати результат. Текст обробляється лише на цьому пристрої, але сторінка використовує ресурси вашого комп’ютера (GPU/RAM). Модель ніколи не завантажується без вашого натискання; не більше 20 запитів за хвилину.', uitlegNl: 'Een pagina van de site kan tekst naar het lokale model sturen (via het onzichtbare document offscreen.html) en het resultaat terugkrijgen. De tekst wordt alleen op dit apparaat verwerkt, maar de pagina gebruikt de middelen van uw computer (GPU/RAM). Het model wordt nooit zonder uw klik gedownload; hoogstens 20 verzoeken per minuut.' }),

      maak('h3', null, t('Мова й інтеграція', 'Taal en integratie')),
      schakel('ai-vertaal-in', 'Перекладати вхід мовою моделі, якщо модель не знає мови тексту (українська, нідерландська…)', 'Invoer naar de modeltaal vertalen als het model de taal niet kent (Oekraïens, Nederlands…)', c.vertaalInvoer, zet('vertaalInvoer')),
      schakel('ai-vertaal-uit', 'Перекладати відповідь мовою інтерфейсу', 'Antwoord naar de taal van de interface vertalen', c.vertaalUitvoer, zet('vertaalUitvoer')),
      keuzeVeld('ai-doeltaal', 'Мова відповіді після перекладу', 'Taal van het antwoord na vertaling', vertaalTalen, c.doelTaal, zet('doelTaal')),
      schakel('ai-chat-hulp', 'Кнопки локального ШІ в чаті бічної панелі (перевірити/переписати запит, перекласти відповідь)', 'Knoppen van de lokale AI in de chat van het zijpaneel (vraag nakijken/herschrijven, antwoord vertalen)', c.chatHulp, zet('chatHulp')),

      maak('h3', null, t('Налаштування функцій', 'Instellingen per functie')),
      groep('Діалог (Prompt API)', 'Gesprek (Prompt API)',
        tekstVeld('ai-prompt-systeem', 'Системна інструкція (роль, стиль)', 'Systeeminstructie (rol, stijl)', c.prompt.systeem, zet('prompt.systeem'), { regels: 3, plaats: t('Напр.: Ти помічник Mijn Ruimte. Відповідай коротко.', 'Bijv.: Je bent de assistent van Mijn Ruimte. Antwoord kort.') }),
        keuzeVeld('ai-prompt-taal', 'Мова моделі', 'Taal van het model', modelTalen, c.prompt.taal, zet('prompt.taal')),
        getalVeld('ai-prompt-temp', 'Температура', 'Temperatuur', c.prompt.temperatuur, zet('prompt.temperatuur'), { min: 0, max: 2, stap: 0.1 }),
        getalVeld('ai-prompt-topk', 'topK', 'topK', c.prompt.topK, zet('prompt.topK'), { min: 1, max: 128, stap: 1 }),
        maak('p', { id: 'lokale-ai-params', class: 'zacht breed' }),
        tekstVeld('ai-prompt-schema', 'Структурована відповідь: JSON-схема (необов’язково)', 'Gestructureerd antwoord: JSON-schema (optioneel)', c.prompt.schema, zet('prompt.schema'), { regels: 3, max: 8000, plaats: '{"type":"object","properties":{"samenvatting":{"type":"string"}}}' })),
      groep('Стислий виклад (Summarizer)', 'Samenvatten (Summarizer)',
        keuzeVeld('ai-sum-type', 'Тип', 'Soort', L.KEUZES['summarizer.type'], c.summarizer.type, zet('summarizer.type')),
        keuzeVeld('ai-sum-format', 'Формат', 'Opmaak', L.KEUZES['summarizer.format'], c.summarizer.format, zet('summarizer.format')),
        keuzeVeld('ai-sum-length', 'Довжина', 'Lengte', L.KEUZES['summarizer.length'], c.summarizer.length, zet('summarizer.length')),
        keuzeVeld('ai-sum-taal', 'Мова моделі', 'Taal van het model', modelTalen, c.summarizer.taal, zet('summarizer.taal')),
        tekstVeld('ai-sum-context', 'Спільний контекст (для кого/навіщо)', 'Gedeelde context (voor wie/waarvoor)', c.summarizer.context, zet('summarizer.context'), { max: 1000 })),
      groep('Написання тексту (Writer)', 'Tekst schrijven (Writer)',
        keuzeVeld('ai-wri-tone', 'Тон', 'Toon', L.KEUZES['writer.tone'], c.writer.tone, zet('writer.tone')),
        keuzeVeld('ai-wri-format', 'Формат', 'Opmaak', L.KEUZES['writer.format'], c.writer.format, zet('writer.format')),
        keuzeVeld('ai-wri-length', 'Довжина', 'Lengte', L.KEUZES['writer.length'], c.writer.length, zet('writer.length')),
        keuzeVeld('ai-wri-taal', 'Мова моделі', 'Taal van het model', modelTalen, c.writer.taal, zet('writer.taal')),
        tekstVeld('ai-wri-context', 'Спільний контекст', 'Gedeelde context', c.writer.context, zet('writer.context'), { max: 1000 })),
      groep('Переписування (Rewriter)', 'Herschrijven (Rewriter)',
        keuzeVeld('ai-rew-tone', 'Тон', 'Toon', L.KEUZES['rewriter.tone'], c.rewriter.tone, zet('rewriter.tone')),
        keuzeVeld('ai-rew-format', 'Формат', 'Opmaak', L.KEUZES['rewriter.format'], c.rewriter.format, zet('rewriter.format')),
        keuzeVeld('ai-rew-length', 'Довжина', 'Lengte', L.KEUZES['rewriter.length'], c.rewriter.length, zet('rewriter.length')),
        keuzeVeld('ai-rew-taal', 'Мова моделі', 'Taal van het model', modelTalen, c.rewriter.taal, zet('rewriter.taal')),
        tekstVeld('ai-rew-context', 'Спільний контекст', 'Gedeelde context', c.rewriter.context, zet('rewriter.context'), { max: 1000 })),
      groep('Переклад і мова', 'Vertalen en taal',
        keuzeVeld('ai-tr-bron', 'З мови', 'Van taal', [['auto', t('визначити автоматично', 'automatisch herkennen')], ...L.VERTAAL_TALEN.map(taalOptie)], c.translator.bron, zet('translator.bron')),
        keuzeVeld('ai-tr-doel', 'На мову', 'Naar taal', vertaalTalen, c.translator.doel, zet('translator.doel')),
        keuzeVeld('ai-proef-taal', 'Мова коректури (Proofreader)', 'Taal voor proeflezen (Proofreader)', modelTalen, c.proofreader.taal, zet('proofreader.taal'))),

      maak('h3', null, t('Для розробника: пробні токени й прапорці', 'Voor ontwikkelaars: proeftokens en vlaggen')),
      maak('p', { class: 'zacht' }, t('Writer, Rewriter і Proofreader можуть ще бути в пробному періоді. Зареєструйте розширення на сайті Chrome Origin Trials (адреса chrome-extension://', 'Writer, Rewriter en Proofreader kunnen nog in een proefperiode zitten. Registreer de extensie op de Chrome Origin Trials-site (adres chrome-extension://'), chrome.runtime.id, t(') і вставте токени нижче — по одному в рядку. Або ввімкніть прапорці.', ') en plak de tokens hieronder — één per regel. Of zet de vlaggen aan.')),
      tekstVeld('ai-proef-tokens', 'Токени origin trial', 'Origin-trial-tokens', c.proefTokens, zet('proefTokens'), { regels: 3, max: 20000 }),
      vlaggen,
      maak('p', { class: 'zacht' }, t('Розмір і стан моделі: ', 'Grootte en staat van het model: '), intern),
    );
    if (typeof UI.koppelHelp === 'function') UI.koppelHelp(wortel);
  }

  L.laad().then((x) => { cfg = x; L.plaatsProefTokens(cfg); bouw(); void controleer(); });
  L.bijWijziging((x) => { cfg = x; });
})();
