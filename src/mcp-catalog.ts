export const MCP_TABS = [
  ["overview", "Огляд", "Overzicht"],
  ["services", "Сервіси", "Diensten"],
  ["tools", "Інструменти", "Hulpmiddelen"],
  ["board", "Дошка", "Bord"],
  ["agents", "Агенти", "Agenten"],
  ["playground", "Пісочниця", "Zandbak"],
  ["traffic", "Трафік", "Verkeer"],
  ["connect", "Підключити", "Verbinden"],
  ["roadmap", "Що далі", "Wat hierna"],
  ["download", "Архів на ПК", "Archief op de pc"],
] as const;

export const ESTATE = [
  { id: "mcp", uk: "MCP-шлюз", nl: "MCP-brug", url: "https://mcp.tarasevych.com/Grok", statusUk: "MCP готовий", statusNl: "MCP klaar", roleUk: "Міст між будь-яким ШІ-агентом і всім маєтком. JSON-RPC інструменти, ресурси, промпти.", roleNl: "Brug tussen elke AI-agent en het hele domein.", tools: ["list_services", "health_check", "agent_handshake"], scopes: ["mcp:connect", "mcp:tools"] },
  { id: "hub", uk: "Хаб", nl: "Hub", url: "https://hub.tarasevych.com/overview", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Дім особистого простору. Огляд проєктів, людей і поточної роботи.", roleNl: "Thuis van de persoonlijke ruimte.", tools: ["hub_overview", "estate_search"], scopes: ["hub:read"] },
  { id: "id", uk: "Ідентичність", nl: "Identiteit", url: "https://id.tarasevych.com/personalization", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Хто може увійти. Персоналізація, ідентичності агентів і сесійні твердження.", roleNl: "Wie binnen mag.", tools: ["id_profile", "issue_agent_token"], scopes: ["id:read", "id:issue"] },
  { id: "admin", uk: "Адмін", nl: "Beheer", url: "https://admin.tarasevych.com/access", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Площина доступу. Видачі, відкликання і карта можливостей.", roleNl: "Toegangsvlak.", tools: ["admin_list_access", "admin_grant"], scopes: ["admin:read", "admin:grant"] },
  { id: "api", uk: "API", nl: "API", url: "https://api.tarasevych.com/access", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Машинна поверхня маєтку. Контракти, через які звертаються MCP-інструменти.", roleNl: "Machinevlak van het domein.", tools: ["api_describe", "api_call"], scopes: ["api:read", "api:call"] },
  { id: "dashboard", uk: "Дашборд", nl: "Dashboard", url: "https://dashboard.tarasevych.com/releases.html", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Використання, витрати і трафік по всьому маєтку.", roleNl: "Gebruik en verkeer.", tools: ["dashboard_usage"], scopes: ["dashboard:read"] },
  { id: "ai", uk: "Вузол ШІ", nl: "AI-knoop", url: "https://ai.tarasevych.com/", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Домашня поверхня ШІ. Розмови, моделі і локальний інференс.", roleNl: "AI-oppervlak van het huis.", tools: ["ai_status"], scopes: ["ai:read"] },
  { id: "mail", uk: "Пошта", nl: "E-mail", url: "https://mail.tarasevych.com/inbox", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Скринька маєтку. Листи, які агенти можуть резюмувати, але не надсилати без скоупу.", roleNl: "Postbus van het domein.", tools: ["mail_inbox_summary"], scopes: ["mail:read"] },
  { id: "cloud", uk: "Хмара", nl: "Cloud", url: "https://cloud.tarasevych.com/calendar", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Календар і файли. Що відбувається і коли.", roleNl: "Agenda en bestanden.", tools: ["cloud_calendar_today"], scopes: ["cloud:read"] },
  { id: "github", uk: "Git", nl: "Git", url: "https://github.tarasevych.com/", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Код дому. Репозиторії, через які агенти розвивають проєкт.", roleNl: "Code van het huis.", tools: ["github_repos", "github_search"], scopes: ["git:read"] },
  { id: "huis", uk: "Huis", nl: "Huis", url: "https://huis.tarasevych.com/", statusUk: "за брамою", statusNl: "achter de poort", roleUk: "Сам дім. Присутність, кімнати і вузол у Фландрії.", roleNl: "Het huis zelf, in Vlaanderen.", tools: ["huis_status"], scopes: ["huis:read"] },
] as const;

export const DOOR_TOOLS: Array<{ name: string; uk: string; nl: string; args: Record<string, unknown> }> = [
  { name: "site_health", uk: "Здоров’я сайту на цьому вузлі.", nl: "Gezondheid van de site op deze knoop.", args: {} },
  { name: "host_status", uk: "Стан сайту, тунелю і дверей.", nl: "Staat van site, tunnel en deur.", args: {} },
  { name: "release_info", uk: "Який випуск зараз живий.", nl: "Welke release nu live is.", args: {} },
  { name: "list_releases", uk: "Назви випусків на диску.", nl: "Namen van de releases op schijf.", args: {} },
  { name: "list_dir", uk: "Список одного каталогу випуску.", nl: "Lijst van één map in de release.", args: { path: "src" } },
  { name: "read_file", uk: "Текст одного файлу випуску. Секрети відмовляються.", nl: "Tekst van één releasebestand. Geheimen worden geweigerd.", args: { path: "package.json" } },
  { name: "permission_flags", uk: "Які перемикачі зараз увімкнені (задає власник у файлі на сервері).", nl: "Welke schakelaars nu aan staan (de eigenaar zet ze in een bestand op de server).", args: {} },
];

export const TOOL_HELP: Array<[string, string, string]> = [
  ["list_services", "Каталог маєтку: кожен хост, шлях, роль і інструменти.", "Catalogus van het domein."],
  ["get_service", "Один сервіс за id: mcp, hub, id, admin, api, dashboard, ai, mail, cloud, github, huis.", "Eén dienst op id."],
  ["health_check", "Питає кожен публічний хост. 401/403 означає, що сервіс живий, але за брамою.", "Vraagt elke publieke host."],
  ["get_architecture", "Як зібраний маєток: дім, брама, API, міст MCP.", "Hoe het domein in elkaar zit."],
  ["get_roadmap", "Чого ще бракує, щоб агент працював з живим tarasevych.com.", "Wat nog ontbreekt."],
  ["estate_search", "Пошук по сервісах, інструментах, задачах і нотатках.", "Zoeken in het domein."],
  ["hub_overview", "Зріз особистого простору: сервіси, відкриті задачі, трафік.", "Momentopname van de ruimte."],
  ["id_profile", "Як мають видаватися ідентичності агентів.", "Hoe agentidentiteiten horen te ontstaan."],
  ["issue_agent_token", "Випускає Bearer-токен для агента.", "Geeft een Bearer-token uit."],
  ["admin_list_access", "Поточна карта доступів: токени і скоупи.", "Huidige toegangskaart."],
  ["admin_grant", "Записує грант: хто, який сервіс, які скоупи.", "Schrijft een toekenning."],
  ["api_describe", "Машинний контракт api.tarasevych.com.", "Machinecontract van de API."],
  ["dashboard_usage", "Лічильники використання з боку MCP.", "Gebruik vanuit MCP."],
  ["ai_status", "Стан домашнього вузла ШІ.", "Staat van de AI-knoop."],
  ["mail_inbox_summary", "Контракт скриньки. Тіла листів без скоупу не віддає.", "Postbuscontract, geen briefinhoud."],
  ["cloud_calendar_today", "Контракт календаря на сьогодні.", "Agendacontract voor vandaag."],
  ["github_repos", "Кодова поверхня дому.", "Codeoppervlak van het huis."],
  ["huis_status", "Вузол у Фландрії: чому це початок маєтку.", "De knoop in Vlaanderen."],
  ["list_tasks", "Спільна дошка людей і агентів.", "Gedeeld bord."],
  ["upsert_task", "Створює або оновлює задачу на дошці.", "Maakt of wijzigt een taak."],
  ["list_notes", "Спільні нотатки для наступного агента.", "Gedeelde notities."],
  ["upsert_note", "Залишає нотатку, яку прочитає наступний агент.", "Laat een notitie achter."],
  ["agent_handshake", "Перший виклик нового агента: хто ви, куди йти далі.", "Eerste aanroep van een nieuwe agent."],
];

export const LAYERS = [
  ["1. Huis", "Дім у Фландрії. Походження всіх хостів.", "Huis in Vlaanderen."],
  ["2. id / admin", "Брама людей і карта грантів.", "Poort van mensen en toekenningen."],
  ["3. api", "Машинні контракти. Сюди мають ходити інструменти.", "Machinecontracten."],
  ["4. MCP", "Міст. Сюди підключається будь-який агент.", "De brug. Hier koppelt elke agent."],
  ["5. Поверхні", "Hub, mail, cloud, git, dashboard, AI — для людей.", "Oppervlakken voor mensen."],
];
