> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./BROWSER-VIA-CONNECTOR.uk.md) · [🇳🇱 **Nederlandse versie**](./BROWSER-VIA-CONNECTOR.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Браузер через конектор «Мій простір» — для будь-якого ШІ-агента

Стан: 23.10.2026 (розширення 0.7.0, міграція 0110). Для власника BYOS-сервера і для розробників агентів. Усе працює на сервері
власника і в його браузері; жодних зовнішніх служб, жодного стороннього хостингу. Нідерландська версія — нижче (§ NL).

## 1. Що це

Будь-який агент, підключений до нашого конектора (`https://mcp.<ваш-домен>/<агент>`: `claude`, `gpt`, `grok`, `gemini`, `copilot`, `cursor`),
отримує **ті самі інструменти браузера**. Вони діють через розширення «Мій простір» у браузері власника — у двох окремих слотах:

| Слот | Що бачить агент | Як відкривається | Найдовший строк |
|---|---|---|---|
| **Приватний** (`…_gebruiker`) | лише ваші сторінки: hub, mail, cloud, ai, id, github, huis, mcp (ніколи admin.\*, api.\*) | «Відкрити доступ» + підтвердження входу (passkey, код або Google) | 1 рік (за вашим вибором і політикою) |
| **Технічний** (`…_beheer`) | лише вкладки з **активним** технічним профілем, на адмін-хостах, які ви обрали | «Розблокувати з passkey» у технічному профілі | 1 рік; кожне технічне звернення все одно вимагає активного профілю у вкладці |

Відмінність між агентами — **лише у ваших дозволах**, а не в наборі інструментів (тест `connector-browser-gelijk-20261022`).

## 2. Одне місце керування: mcp.\*/agents → «Браузер і агенти» (`#browser`)

На одному екрані:
1. **Слоти** — стан, залишок, строк (15 хв, 1 год, 4 год, до кінця технічної активації, до закриття браузера, до виходу з акаунта,
   до відкликання, 1 тиждень, 1 місяць, 6 місяців, 1 рік), сторінки, «Відкрити доступ» / «Заблокувати».
   **Перезапуск браузера** не скидає «до виходу з акаунта», «до відкликання» і строки від тижня до року (сервер зберігає розблокування
   й надсилає його знову). Короткі строки (15 хв, 1 год, 4 год, до кінця технічної активації) і «до закриття браузера» закінчуються,
   коли браузер закрито: розширення 0.7.0 при кожному з’єднанні повідомляє ідентифікатор браузерної сесії (`chrome.storage.session`),
   інший ідентифікатор = браузер перезапущено → сервер відкликає (`browser-gesloten`). Оновлення чи перезавантаження розширення теж
   починає нову сесію. Якщо Chrome працює у фоні після закриття вікон, браузер ще не закрито. **Вихід з акаунта на сайті скидає
   завжди — будь-який строк** в обох слотах (зокрема вихід в одній вкладці й перемикання акаунта у вкладці).
2. **Матриця** можливість × агент (`усі` + шість агентів) для кожного слота: читати, навігація, клік/введення, скріншот,
   консоль/мережа, глибока діагностика (лише технічний), скрипти (лише технічний). Швидкі набори: «Дозволити все для розробки»
   (з попередженням), «Лише читання», «Заблокувати». Перемикачі «без підтвердження кожної дії» і «назви як у chrome-devtools-mcp».
   Збереження ширшого просить підтвердити вхід; чинне розблокування переподписується одразу — агентові нічого не треба повторювати.
3. **Що ще має бути дозволено** — для кожного агента: права його конектора (скільки з інструментів браузера ви йому дали у вікні
   «Дозволити») і які інструменти вимкнені режимом (налаштування сайту або ваша підписана політика ШІ в admin → «Доступ ШІ»).
   Збереження матриці саме вмикає ризикові інструменти браузера для дозволених можливостей («з підтвердженням» або без нього) —
   якщо діє підписана політика ШІ, вирішує вона, а екран лише показує її рішення.
4. **Останні відмови агентам** — з журналу, людською мовою, з рядком/стовпчиком, якого бракує.

### Повний ланцюжок для одного виклику
`права конектора (venster «Дозволити»)` → `жива сторона (технічна — лише з активним профілем і службою «Підключення ШІ»)` →
`режим інструмента (підписана політика ШІ, інакше налаштування сайту)` → `розблокування слота (строк, сторінки)` ∩ `політика розширення
(власник / users.manage)` ∩ **`матриця для цього агента`** → `розширення ще раз перевіряє підпис, слот, профіль вкладки, хост, обліковий запис`.

## 3. Крок за кроком (для будь-якого агента)

1. Встановіть розширення 0.7.0 (mcp.\*/agents → «Розширення браузера») і підключіть слот(и).
2. Підключіть агента на його адресі (вкладка «Підключені ШІ»), у вікні «Дозволити» увімкніть групу **«Браузер»** — у приватній і/або
   технічній частині.
3. «Браузер і агенти»: позначте можливості для цього агента (або для «усі»), «Зберегти».
4. Відкрийте слот на потрібний строк. Для технічного: активуйте технічний профіль у вкладці.
5. Агент викликає `tools/list` і бачить інструменти браузера.

## 4. Назви інструментів

Повна назва v2: `<суть>_<агент>_mcp_tarasevych_com_<gebruiker|beheer>`, наприклад `lezen_pagina_claude_mcp_tarasevych_com_gebruiker`.

| Внутрішній | Суть (v2) | chrome-devtools-mcp | Можливість |
|---|---|---|---|
| browser_list_tabs | tonen_tabbladen | list_pages | читати |
| browser_snapshot | lezen_pagina | take_snapshot | читати |
| browser_scroll | scrollen_pagina | — | читати |
| browser_wait_for_text | wachten_op_tekst | wait_for | читати |
| browser_get_diagnostics, browser_audit | tonen_diagnose, tonen_pagina_audit | performance_start_trace / _stop_trace (→ аудит швидкодії) | читати |
| browser_console, browser_network | lezen_console, lezen_netwerk | list_console_messages, get_console_message, list_network_requests, get_network_request | консоль/мережа (разом із «читати»: старі дозволи на читання діють як і раніше, матриця додатково вимагає рядок «Консоль і мережа») |
| browser_open, browser_history, browser_pages | openen_pagina, navigeren_geschiedenis, beheren_tabbladen | navigate_page, navigate_page_history, new_page, select_page, close_page | навігація |
| browser_click, browser_type, browser_hover, browser_fill_form, browser_select_option, browser_press_key, browser_invoke_action | klikken_element, typen_tekst, aanwijzen_element, invullen_formulier, kiezen_optie, drukken_toets, uitvoeren_site_actie | click, fill, hover, fill_form, press_key | клік/введення |
| browser_screenshot | maken_schermafdruk | take_screenshot | скріншот |
| browser_get_deep_diagnostics | uitvoeren_diepe_diagnose | — | глибока діагностика (лише технічний, пакет «діагностика») |
| browser_script | uitvoeren_script (лише `_beheer`) | evaluate_script | скрипти (лише технічний, пакет «діагностика», позначка в матриці) |

## 5. Приклади викликів (JSON-RPC, `POST https://mcp.<домен>/<агент>`, `Authorization: Bearer <OAuth-токен>`)

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lezen_pagina_claude_mcp_tarasevych_com_gebruiker","arguments":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"take_snapshot","arguments":{"slot":"prive"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"click","arguments":{"uid":"12_k3x9a"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"fill","arguments":{"uid":"7_1h2p","value":"Привіт"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"navigate_page","arguments":{"url":"https://mail.tarasevych.com/"}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"evaluate_script_beheer","arguments":{"function":"() => document.title"}}}
```
- `uid` — з поля `controls[].uid` відповіді `take_snapshot`/`lezen_pagina_…` (формат `<номер>_<хеш назви>`); можна й `name` (видимий підпис).
- Кала назва (`take_snapshot`) іде в технічний слот, якщо технічна сторона жива і дозволена, інакше в приватний; `"slot":"prive"`
  або суфікс `_gebruiker` / `_beheer` обирають явно. Після відмови в автоматично обраному слоті відповідь підказує, як обрати інший.
- Аргументи chrome-devtools-mcp, яких у нас немає (`format`, `fullPage`, `dblClick`, `pageSize`, `timeout` навігації…), ігноруються,
  і відповідь чесно пише «Ignored arguments …». `wait_for.timeout` (мс) → секунди (1–15). `select_page.pageIdx` = номер у `list_pages`.

## 6. Відмови і що робити

| Код | Що означає | Де виправити |
|---|---|---|
| `EXTENSIE_VERGRENDELD` | слот заблоковано, строк минув або політика вимкнула слот | «Браузер і агенти» → картка слота → «Відкрити доступ» |
| `EXTENSIE_CAP` | можливості немає в розблокуванні або в матриці для цього агента | матриця: рядок (можливість) × стовпчик (агент) |
| `EXTENSIE_AGENT` | для цього агента в матриці нічого не дозволено | матриця: стовпчик агента або «усі» |
| `EXTENSIE_HOST` | адреса поза сторінками розблокування | картка слота → «Сторінки» |
| `EXTENSIE_PROFIEL` | вкладка не в технічному режимі | активуйте технічний профіль у вкладці |
| `EXTENSIE_RUIMTE` / `TECH_PROFILE_OFF` | інструмент іншого слота / технічна сторона не активна | технічний профіль, служба «Підключення ШІ» |
| `EXTENSIE_SCRIPT` | скрипти: не технічний слот, розширення < 0.7.0 або без позначки «Скрипти» | матриця, пакет «діагностика» |
| `PERMISSION_OFF` | права конектора цього агента не містять інструмента | «Підключені ШІ» → вікно «Дозволити» |
| `NOT_SUPPORTED` | назва chrome-devtools-mcp, яку ми свідомо не підтримуємо | у тексті — список того, що є |
| `TERMIJN_VEREIST_UPDATE` | довгий строк для розширення < 0.7.0 | оновіть розширення |

Кожна відмова містить точну адресу екрана: `https://mcp.tarasevych.com/agents#browser`.

## 7. Сумісність із chrome-devtools-mcp

Підтримано (ті самі межі, що й наші назви): `list_pages, select_page, new_page, close_page, navigate_page, navigate_page_history,
take_snapshot, take_screenshot, click, hover, fill, fill_form, press_key, wait_for, list_console_messages, get_console_message,
list_network_requests, get_network_request, evaluate_script, performance_start_trace, performance_stop_trace`.
Свідомо не підтримано (з поясненням у відповіді): `emulate, emulate_cpu, emulate_network, resize_page, upload_file, handle_dialog,
drag, performance_analyze_insight, take_memory_snapshot`.
Відмінності: знімок сторінки — JSON (url, заголовки, текст, `controls[{uid, role, name}]`, дії сайту), а не текстове дерево a11y;
`press_key` — лише клавіші навігації (Enter, Escape, Tab, стрілки, PageUp/Down, Home, End); `evaluate_script` — лише технічний слот
і лише без елементних `args`; «trace» — це аудит швидкодії, не запис трасування.
**Не перевірено з мережею:** список назв і параметрів chrome-devtools-mcp взято зі знань про публічний репозиторій
`ChromeDevTools/chrome-devtools-mcp` (версії до 2025 р.). Нові назви з пізніших версій отримають `UNKNOWN_TOOL`.

## 8. Бокова панель розширення

Розширення 0.7.0 має в боковій панелі чат «ШІ для вас — поруч із цією вкладкою»: слот відповідає профілю активної вкладки,
запит іде з токеном слота на `POST /api/owner/agents/extensie/chat` (без cookie), модель бачить лише інструменти браузера і діє
лише в цьому браузері, через ті самі ворота (матриця — стовпчик «усі»). Потрібні: відкритий слот, право «API-платформа», ключ
Anthropic у сховищі сайту, для технічного слота — активний технічний профіль.

## 9. Що не відбувається ніколи
Розширення не читає паролі, платіжні поля, cookie, сховище, вміст запитів; не відкриває сторонні сайти; приватний агент не бачить
технічних вкладок; технічний — приватних; агент одного користувача не дістає слот іншого (тест `extensie-matrix-20261022`).

---

## § NL — De browser via de connector van «Mijn Ruimte», voor elke AI-agent

**Wat.** Elke agent op `https://mcp.<domein>/<agent>` (claude, gpt, grok, gemini, copilot, cursor) krijgt **dezelfde browserhulpmiddelen**,
via de extensie in de browser van de eigenaar, in twee gescheiden sloten: **privé** (`…_gebruiker`; alleen uw eigen pagina’s, nooit
admin.\*/api.\*; openen met een bevestiging van de aanmelding) en **technisch** (`…_beheer`; alleen tabbladen met een ACTIEF technisch
profiel op de gekozen beheerhosts; ontgrendelen met uw passkey). Het verschil tussen agenten zit alleen in uw toestemmingen.

**Eén plek: mcp.\*/agents → «Browser en agenten» (`#browser`).** Sloten (stand, termijn: 15 min, 1 u, 4 u, tot het einde van de
technische activering, tot de browser sluit, tot uitloggen, tot intrekken, 1 week, 1 maand, 6 maanden, 1 jaar), de matrix mogelijkheid × agent per slot
(lezen, navigatie, klikken/typen, schermafdruk, console/netwerk, diepe diagnose en scripts alleen technisch), snelle sets («Alles toestaan
voor ontwikkeling» met waarschuwing, «Alleen lezen», «Blokkeren»), «zonder bevestiging per actie», «namen zoals chrome-devtools-mcp»,
«Wat er verder nog toegestaan moet zijn» (connectorrechten en modi per hulpmiddel; opslaan van de matrix zet riskante browserhulpmiddelen
aan voor de toegestane mogelijkheden — met een geldig ondertekend AI-beleid beslist dat beleid) en de laatste weigeringen in gewone taal.
Ruimer opslaan vraagt een bevestiging; een lopende ontgrendeling wordt meteen opnieuw ondertekend.

**Termijn en technisch profiel.** Een technische ontgrendeling die langer loopt dan de activering, overleeft die — maar elk technisch
hulpmiddel eist bij gebruik toch een actief technisch profiel in het tabblad. Een herstart van de browser maakt geen einde aan «tot
uitloggen», «tot intrekken» en een week tot een jaar (de server stuurt de ontgrendeling opnieuw); korte termijnen (15 min, 1 u, 4 u, tot
het einde van de activering) en «tot de browser sluit» eindigen als de browser sluit — de extensie 0.7.0 meldt bij elke verbinding een
browsersessie-id (`chrome.storage.session`), een andere id betekent een herstart (of een update van de extensie) en de server trekt in
(`browser-gesloten`). **Uitloggen op de site maakt altijd een einde — aan elke termijn**, in beide sloten.

**Stappen.** Extensie 0.7.0 installeren en sloten koppelen → agent koppelen op zijn adres en in het venster «Toestaan» de groep
**Browser** aanzetten → in «Browser en agenten» vinkjes zetten en opslaan → slot openen voor de gewenste termijn (technisch: profiel
activeren) → de agent roept `tools/list` aan.

**Namen.** `<essentie>_<agent>_mcp_tarasevych_com_<gebruiker|beheer>`; zie de tabel in §4 (essentie, chrome-devtools-mcp-naam, mogelijkheid).
Voorbeelden: zie §5. `uid` komt uit `controls[].uid` van de snapshot (`<index>_<hash>`), `name` kan ook. Een kale devtools-naam gaat naar
het technische slot als dat leeft en is toegestaan, anders naar privé; `"slot":"prive"|"technisch"` of het achtervoegsel kiest zelf.
Onbekende argumenten van chrome-devtools-mcp vallen weg en staan als «Ignored arguments» in het antwoord.

**Weigeringen** (§6): EXTENSIE_VERGRENDELD, EXTENSIE_CAP, EXTENSIE_AGENT, EXTENSIE_HOST, EXTENSIE_PROFIEL, EXTENSIE_RUIMTE/TECH_PROFILE_OFF,
EXTENSIE_SCRIPT, PERMISSION_OFF, NOT_SUPPORTED, TERMIJN_VEREIST_UPDATE — elk met het exacte adres `https://mcp.tarasevych.com/agents#browser`.

**chrome-devtools-mcp** (§7): ondersteund en bewust niet ondersteund zoals hierboven; snapshot is JSON in plaats van een tekstboom;
`evaluate_script` alleen technisch en zonder element-args. **Niet online geverifieerd:** de lijst komt uit kennis van de openbare
repository ChromeDevTools/chrome-devtools-mcp (versies tot 2025).

**Zijpaneel** (§8): chat «AI voor u — bij dit tabblad», met het token van het slot, alleen browserhulpmiddelen, alleen deze browser,
dezelfde poorten; vereist een open slot, het recht «API-platform», een Anthropic-sleutel in de kluis en voor technisch een actief profiel.

**Nooit** (§9): wachtwoorden, betaalvelden, cookies, opslag of inhoud van verzoeken; vreemde sites; kruisen tussen de sloten; het slot van
een andere gebruiker.
