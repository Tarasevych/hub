---
name: mijn-ruimte
description: Двосторонній модуль розширення і з’єднувач MCP Google Antigravity для Mijn Ruimte (*.tarasevych.com) — розбудова й керування сайтом, оглядачем, локальним комп’ютером, сервером і координацією. Tweerichtingsplug-in en MCP-connector van Google Antigravity voor Mijn Ruimte (*.tarasevych.com).
---

> 🌐 **Мова / Taal:** **Українська** · [Nederlands](VAARDIGHEID.nl.md) | [Головна](../../../README.md) · [Покажчик документації](../../../docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

> 🇺🇦 **Українська (канонічна)** · 🇳🇱 [Nederlandse versie](./VAARDIGHEID.nl.md)

# Mijn Ruimte — модуль розширення і двосторонній міст Google Antigravity (`/antigravity`)

Ця навичка надає **Google Antigravity** виділений двосторонній з’єднувач (`https://mcp.tarasevych.com/antigravity`) і міст командного рядка (`<шлях-до-навички>/scripts/mijn-ruimte`) для роботи з платформою **Mijn Ruimte** (`*.tarasevych.com`) через чотири робочі канали:

1. **Сайт, навички та багатоагентна координація (`site` / `orch` / `vaardigheden`)** — читання та запис пошти, календаря, хмарних файлів, дошки завдань, репозиторіїв GitHub, спільного контексту й координації задач (`v2_whoami`, `site_search`, `list_services`, `orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_begin`, `orch_inleveren_stuk`, `orch_inleveren_klaar`, `vaardigheden_aanbevelen`, `vaardigheden_opslaan`, `ecosysteem_context_list`, `ecosysteem_context_save`).
2. **Розширення оглядача (`browser`)** — керування розширенням Mijn Ruimte для Chrome/Firefox у реальному часі в приватному (`_gebruiker`) і технічному (`_beheer`) слотах вкладок (`browser_list_tabs`, `browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_screenshot`, `browser_console`, `browser_network`, `browser_audit`, `browser_get_deep_diagnostics`, `browser_script`).
3. **Локальний комп’ютер і контейнери (`pc` через `agent.mjs`)** — огляд і керування під’єднаним комп’ютером у приватному (`_gebruiker`) або технічному (`_beheer`) просторі (`machine_list`, `machine_info`, `machine_list_dir`, `machine_read_file`, `machine_file_info`, `machine_search_files`, `system_metrics`, `machine_write_file`, `machine_exec`, `docker_list_containers`, `docker_manage_container`).
4. **Сервер і випуски (`server` у `_beheer`)** — спостереження та адміністрування робочого сервера за активного технічного простору власника (`get_system_health`, `get_live_release`, `list_releases`, `read_release_file`, `uitrol_voorstel_status`, `uitrol_voorstel_begin`, `uitrol_voorstel_stuk`, `uitrol_voorstel_klaar`, `app_deploy_status`, `app_logs`, `get_admin_view`, `audit_read`, `siem_status`).

## Канонічна адреса та іменування інструментів

- **Виділена кінцева точка MCP**: `https://mcp.tarasevych.com/antigravity`
- **Метадані захищеного ресурсу OAuth (RFC 9728)**: `https://mcp.tarasevych.com/.well-known/oauth-protected-resource/antigravity`
- **Вебпанель керування**: `https://mcp.tarasevych.com/agenten#agent/antigravity`
- **Шаблон імен інструментів v2**: `<сутність>_antigravity_<піддомен>[_<служба>]_tarasevych_com_<gebruiker|beheer>` (завжди `<= 64` символи).
  - Інструменти із закінченням `_gebruiker` працюють у **приватному просторі** користувача.
  - Інструменти із закінченням `_beheer` працюють у **технічному просторі** (видимі й доступні лише тоді, коли технічний профіль власника активний і делегований).
- Ця навичка не надає нових прав: доступ визначають лише надані з’єднанню дозволи та перевірка прав власника.

## Команди сценарію (`<шлях-до-навички>/scripts/mijn-ruimte`)

Викликайте вбудований сценарій за допомогою `node .agents/skills/mijn-ruimte/scripts/mijn-ruimte <Команда> [прапорці]`:

### 1. Налаштування та перевірка з’єднання
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

# Отримати стислий контекст правил (CONTEXT-COMPACT.md + відбиток замка)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte OrchContext

# Зареєструвати нову задачу в координації через MCP
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

# Зробити знімок екрана або запустити глибоку діагностику налагоджувача (_beheer)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserSchermafdruk [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte BrowserDiagnose
```

### 4. Двостороннє керування локальним комп’ютером (`machine_*`, `system_metrics`, `docker_*`)
```bash
# Навантаження системи (system_metrics: процесор, пам’ять, диск)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcStatus [--kant gebruiker]

# Переглянути теки або прочитати файли в дозволених кореневих каталогах (machine_list_dir, machine_read_file)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcBestanden --pad . [--kant gebruiker]
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcLees --pad README.md [--kant gebruiker]

# Записати файл або виконати дозволену команду на комп’ютері (machine_write_file, machine_exec)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcSchrijf --pad notes.txt --inhoud "Тест"
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcOpdracht --opdracht "git status"

# Перевірити контейнери Docker на комп’ютері або сервері (docker_list_containers)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte PcDocker [--kant gebruiker|beheer]
```

### 5. Двостороннє адміністрування сервера та випусків (`_beheer`)
```bash
# Перевірити справність сервера, служб і бази даних (get_system_health)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerGezondheid

# Перевірити стан розгортання, встановлений випуск і журнали служб (uitrol_voorstel_status, get_live_release, app_logs)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerUitrolStatus
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerRelease
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerLogs --dienst hub --regels 100

# Переглянути останні записи журналу аудиту (audit_read)
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte ServerAudit --limiet 25
```

### 6. Довільний виклик інструмента та міст стандартного введення-виведення MCP
```bash
# Викликати будь-який інструмент v2 безпосередньо за повною назвою або коротким ключем
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte RoepAan --hulpmiddel <назва_інструмента> --args '{"ключ":"значення"}'

# Запустити міст стандартного введення-виведення MCP (stdio) до https://mcp.tarasevych.com/antigravity або /autoclaw
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte McpStdio [--url https://mcp.tarasevych.com/autoclaw]
```

### 7. Правнича перевірка договорів, реєстр доказів і AutoClaw (`GLM-5.3-flashX-Legal` / `/autoclaw`)
```bash
# Під’єднати AutoClaw (GLM) до власної кінцевої точки /autoclaw
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte Verbind --url https://mcp.tarasevych.com/autoclaw [--token <МАРКЕР_ДОСТУПУ>]

# Виконати дослівну перевірку договору чи листа за абзацами (§1, §2…), знеособлення реквізитів і побудову реєстру доказів
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte JuridischControleer [--bestand <ШЛЯХ> | --tekst "<ТЕКСТ>"] [--taal uk|nl]

# Вивести повний пакет матеріалів і перелік для участі в «Built with AutoClaw — Раунд 3»
node .agents/skills/mijn-ruimte/scripts/mijn-ruimte AutoClawPakket [--taal uk|nl]
```

## Правила безпеки, врядування та екосистеми «Плющ» (`KLIMOP-001`)
- **Очікування підтвердження**: коли інструмент запису або дії повертає `status: "pending"`, сайт очікує підтвердження користувача в `BevestigingenPaneel` на `https://mcp.tarasevych.com/agenten#agent/antigravity` (або `#agent/autoclaw`). Повідомте про це користувача й не повторюйте виклик у циклі.
- **Технічний простір (`_beheer`)**: якщо інструмент `_beheer` повертає `TECH_PROFILE_OFF`, попросіть власника увімкнути або делегувати технічний сеанс на `https://mcp.tarasevych.com/agenten#agent/antigravity` (або `#agent/autoclaw`).
- **Межі «Вусиків» і цільової концепції «Плющ» (`AGENTS.md` §3б, §10, `docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`, навичка `klimop-architectuur`)**: міст керування локальним комп’ютером та оглядачем діє виключно за явними, обмеженими й відкличними повноваженнями користувача без прихованого фонового розширення (§1.4, §5.2 маніфесту). Маніфест «Плющ» не дозволяє негайно змінювати робочу інфраструктуру без окремого затвердження власника; кожна програмна зміна перевіряється за 15 питаннями архітектурної перевірки (§10.4).
- **Правила сховища**: завжди дотримуйтесь `AGENTS.md`, `ANTIGRAVITY.md` та `AUTOCLAW.md` під час внесення змін у `Tarasevych/hub`.
