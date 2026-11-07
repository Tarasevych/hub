> 🌐 **Мова / Taal:** **Українська** · [Nederlands](VAARDIGHEID.nl.md) | [Головна](../../../README.md) · [Покажчик документації](../../../docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

> 🇺🇦 **Українська (канонічна)** · 🇳🇱 [Nederlandse versie](./VAARDIGHEID.nl.md)

---
name: mijn-ruimte
description: Двосторонній модуль розширення і з'єднувач MCP Google Antigravity для Mijn Ruimte (*.tarasevych.com) — розбудова й керування сайтом, керування розширенням оглядача, локальним комп'ютером (agent.mjs), сервером і багатоагентною координацією через https://mcp.tarasevych.com/antigravity.
---

# Mijn Ruimte — модуль розширення і двосторонній міст Google Antigravity (`/antigravity`)

Ця навичка надає **Google Antigravity** виділений двосторонній з'єднувач (`https://mcp.tarasevych.com/antigravity`) і міст командного рядка (`<шлях-до-навички>/scripts/mijn-ruimte`) для роботи з платформою **Mijn Ruimte** (`*.tarasevych.com`) через чотири робочі канали:

1. **Сайт і багатоагентна координація (`site` / `orch`)** — читання та запис пошти, календаря, хмарних файлів, дошки завдань, репозиторіїв GitHub і координація задач між агентами штучного інтелекту (`orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_*`).
2. **Розширення оглядача (`browser`)** — керування розширенням Mijn Ruimte для Chrome/Firefox у реальному часі в приватному (`_gebruiker`) і технічному (`_beheer`) слотах вкладок (`browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_screenshot`, `browser_console`, `browser_network`, `browser_get_deep_diagnostics`, `browser_script`).
3. **Локальний комп'ютер (`pc` через `agent.mjs`)** — огляд і керування під'єднаним комп'ютером (`machine_status`, `machine_processes`, `machine_read_file`, `machine_write_file`, `machine_list_dir`, `machine_exec`, `machine_docker`) у приватному (`_gebruiker`) або технічному (`_beheer`) контурі.
4. **Сервер і випуски (`server` у `_beheer`)** — моніторинг і адміністрування робочого сервера за активного технічного простору власника (`server_health`, `deploy_status`, `deploy_logs`, `deploy_release`, `db_query_readonly`, `audit_tail`, `security_overview`).

## Канонічна адреса та іменування інструментів

- **Виділена кінцева точка MCP**: `https://mcp.tarasevych.com/antigravity`
- **Метадані захищеного ресурсу OAuth (RFC 9728)**: `https://mcp.tarasevych.com/.well-known/oauth-protected-resource/antigravity`
- **Вебпанель керування**: `https://mcp.tarasevych.com/agenten#agent/antigravity`
- **Шаблон імен інструментів v2**: `<сутність>_antigravity_<піддомен>[_<служба>]_tarasevych_com_<gebruiker|beheer>` (завжди `<= 64` символи).
  - Інструменти із закінченням `_gebruiker` працюють у **приватному просторі** користувача.
  - Інструменти із закінченням `_beheer` працюють у **технічному просторі** (видимі й доступні лише тоді, коли технічний профіль власника активний і делегований).

## Команди сценарію (`<шлях-до-навички>/scripts/mijn-ruimte`)

Викликайте вбудований сценарій за допомогою `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte <Команда> [прапорці]`:

### 1. Налаштування та перевірка з'єднання
```bash
# Зберегти кінцеву точку та налаштувати ~/.gemini/settings.json для Antigravity
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/antigravity [--token <МАРКЕР_ДОСТУПУ>]

# Перевірити метадані RFC 9728, стан сеансу MCP і видимі інструменти за каналами
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Status

# Вивести всі надані інструменти (за потреби з фільтром --groep або --kant gebruiker|beheer)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Lijst [--kant gebruiker|beheer]
```

### 2. Двостороння координація сайту та агентів (`orch_*`)
```bash
# Отримати актуальний огляд координації агентів із сайту
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchOverzicht

# Отримати стислий контекст правил (CONTEXT-COMPACT.md + геш замка)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchContext

# Зареєструвати нову задачу в оркестрації через MCP
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchTaakStart --id AGPLUGIN-002 --samenvatting "Опис задачі"
```

### 3. Двостороннє керування оглядачем (`browser_*`)
```bash
# Перелік відкритих вкладок у розблокованому слоті оглядача
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserTabs [--kant gebruiker|beheer]

# Відкрити адресу в слоті оглядача
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserOpen --doelUrl https://tarasevych.com [--kant gebruiker]

# Зняти знімок дерева документа активної вкладки
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSnapshot [--kant gebruiker]

# Натиснути елемент або ввести текст в активній вкладці
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserKlik --selector "button[data-agent-terug]"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserTyp --selector "input[name=q]" --tekst "Antigravity"

# Зробити знімок екрана або запустити глибоку діагностику налагоджувача (`_beheer`)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSchermafdruk [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserDiagnose
```

### 4. Двостороннє керування локальним комп'ютером (`machine_*`)
```bash
# Стан системи (процесор, пам'ять, ОС, час роботи) під'єднаного комп'ютера
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcStatus [--kant gebruiker]

# Переглянути теки або прочитати файли в дозволених кореневих каталогах
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcBestanden --pad . [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcLees --pad README.md [--kant gebruiker]

# Записати файл або виконати дозволену команду на комп'ютері
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcSchrijf --pad notes.txt --inhoud "Тест"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcOpdracht --opdracht "git status"

# Перевірити контейнери Docker на комп'ютері або сервері
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcDocker [--kant gebruiker|beheer]
```

### 5. Двостороннє адміністрування сервера та випусків (`_beheer`)
```bash
# Перевірити справність сервера, служб і бази даних
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerGezondheid

# Перевірити стан розгортання, встановлений випуск і журнали служб
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerUitrolStatus
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerRelease
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerLogs --dienst hub --regels 100

# Переглянути останні записи журналу аудиту
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerAudit --limiet 25
```

### 6. Довільний виклик інструмента та міст стандартного введення-виведення MCP
```bash
# Викликати будь-який інструмент v2 безпосередньо за повною або короткою назвою
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte RoepAan --hulpmiddel <назва_інструмента> --args '{"ключ":"значення"}'

# Запустити стандартний сервер stdio MCP з мостом до https://mcp.tarasevych.com/antigravity
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte McpStdio
```

## Правила безпеки та врядування
- **Очікування підтвердження**: коли інструмент запису або дії повертає `status: "pending"`, сайт очікує підтвердження користувача в `BevestigingenPaneel` на `https://mcp.tarasevych.com/agenten#agent/antigravity`. Повідомте про це користувача й не повторюйте виклик у циклі.
- **Технічний простір (`_beheer`)**: якщо інструмент `_beheer` повертає `TECH_PROFILE_OFF`, попросіть власника увімкнути або делегувати технічну сеанс на `https://mcp.tarasevych.com/agenten#agent/antigravity`.
- **Правила репозиторію**: завжди дотримуйтесь `AGENTS.md` та `ANTIGRAVITY.md` під час внесення змін у `Tarasevych/hub`.
