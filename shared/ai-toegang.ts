// Детальні доступи ШІ (per-user, per-agent, per-function): ЯКІ функції приватного
// простору одне підключення ШІ може викликати, а які ні.
//
// Один каталог для всіх: вкладка «Доступ ШІ» на mcp.*/agents малює перемикачі
// з цього списку, а бекенд (backend/ai-toegang.ts, connectors-tools.callTool,
// mcp-console.runTool) відмовляє виклики за цим самим списком. Жодних
// захардкоджених списків скоупів в інших місцях.
//
// Правила:
//  - default-deny: скоуп, який людина явно не надала цьому підключенню, відмовляється.
//  - Надання — лише людиною на сайті (consent-вікно / вкладка «Доступ ШІ»), ніколи самим ШІ.
//  - Чутливі скоупи (пошта, фото): ніколи не читаються технічним підключенням
//    (додатково до воріт AiRuimte) і вмикаються лише з підтвердженням.
//  - Підписана політика ШІ власника (shared/ai-beleid) лишається стелею поверх цього.
//  - Адміністративна стеля (app.ai_toegang_beheer): вимкнений скоуп відмовляється,
//    навіть якщо в підключення є застарілий рядок гранту.
// Пуро (без React/DOM/Node): браузер і сервер використовують той самий список.

import type { KlantId } from './ai-verbinding';

export type AiToegangSoort = 'mcp-koppeling' | 'agenttoken';

/** Відмова за деталями доступу. Формат навмисно як у RUIMTE_GESCHEIDEN (англійська — мова інструментів). */
export const TOEGANG_GESCHEIDEN = (client: string, tool: string, scope: string) =>
  `TOEGANG_GESCHEIDEN: this connection (${client.slice(0, 40)}) may not use "${tool.slice(0, 80)}" because scope "${scope}" was not granted to it. `
  + 'The user grants scopes per AI on mcp.tarasevych.com → Agents → this AI → "Доступ ШІ". Do not try another way.';

export interface AiToegangScope {
  id: string;
  /** Група для вкладки «Доступ ШІ» (українською). */
  groep: string;
  uk: string;
  /** Один рядок: що саме вмикає (українською, для перемикача). */
  omschrijvingUk: string;
  /** Назва нідерландською (сайт nl). · Naam in het Nederlands. */
  nl: string;
  /** Той самий рядок нідерландською. · Dezelfde regel in het Nederlands. */
  omschrijvingNl: string;
  /** Чутливе (пошта, фото): мітка в UI + крок підтвердження при вмиканні; ніколи — технічному підключенню. */
  gevoelig: boolean;
  /** Інструменти, які цей скоуп відкриває (внутрішні імена; аліаси браузерних інструментів розгортаються до виклику). */
  tools: readonly string[];
  /** Які ШІ-клієнти скоуп підтримують ('*' = усі). Скоуп без підтримки не малюється у вкладці. */
  agents: readonly (KlantId | '*')[];
  /** Новим підключенням надається одразу (лише нечутливі). */
  standaardAan: boolean;
  /**
   * Опис для ТЕХНІЧНОГО підключення, якщо там скоуп відкриває інше, ніж у приватному просторі (інші пристрої, інші інструменти).
   * Omschrijving voor een TECHNISCHE verbinding, als de scope daar iets anders opent dan in de privéruimte.
   */
  technischUk?: string;
  technischNl?: string;
}

export const AI_TOEGANG_GROEPEN: readonly string[] = [
  'Пошта', 'Фото', 'Календар', 'Файли', 'Дошка', 'Нотатки', 'Пристрої', 'GitHub', 'Сайт', 'Зовнішні MCP',
];
/** Назви груп нідерландською (ключ — українська назва з AI_TOEGANG_GROEPEN). · Groepsnamen in het Nederlands. */
export const AI_TOEGANG_GROEP_NL: Readonly<Record<string, string>> = {
  'Пошта': 'E-mail', 'Фото': "Foto's", 'Календар': 'Agenda', 'Файли': 'Bestanden', 'Дошка': 'Bord', 'Нотатки': 'Notities',
  'Пристрої': 'Apparaten', 'GitHub': 'GitHub', 'Сайт': 'Site', 'Зовнішні MCP': 'Externe MCP',
};

export const AI_TOEGANG_SCOPES: readonly AiToegangScope[] = [
  {
    id: 'mail.read', groep: 'Пошта', uk: 'Читати пошту',
    omschrijvingUk: 'Список скриньок, мітки, пошук і читання листів.',
    nl: 'E-mail lezen', omschrijvingNl: 'Postvakken, labels, zoeken en berichten lezen.',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['mail_list_accounts', 'mail_list_labels', 'mail_search_messages', 'mail_read_message'],
  },
  {
    id: 'mail.send', groep: 'Пошта', uk: 'Писати й змінювати листи',
    omschrijvingUk: 'Чернетки відповідей, мітки «прочитано», архів і кошик (без остаточного видалення).',
    nl: 'E-mail opstellen en wijzigen', omschrijvingNl: 'Conceptantwoorden, labels «gelezen», archief en prullenbak (zonder definitief verwijderen).',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['mail_modify_message', 'draft_email_reply'],
  },
  {
    // 21.10.2026: een EIGEN scope, zodat geen bestaande grant (die «Писати й змінювати листи» gaf voor concepten) stil ook
    // verzenden krijgt. Elk bericht pas na bevestiging op de site met een verse passkey (backend/ai-bevestiging.ts).
    id: 'mail.verzenden', groep: 'Пошта', uk: 'Надсилати листи',
    omschrijvingUk: 'Надсилання листів від вашого імені — кожен лист лише після вашого підтвердження на сайті свіжим passkey.',
    nl: 'E-mail verzenden', omschrijvingNl: 'Berichten verzenden namens u — elk bericht pas na uw bevestiging op de site met een verse passkey.',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['mail_send'],
  },
  {
    id: 'photos.read', groep: 'Фото', uk: 'Читати фото',
    omschrijvingUk: 'Вибрані вами фото з Google Photos (через безпечний вибір на сайті).',
    nl: "Foto's bekijken", omschrijvingNl: "Door u gekozen foto's uit Google Foto's (via de veilige keuze op de site).",
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['photos_picked_media'],
  },
  {
    id: 'calendar.read', groep: 'Календар', uk: 'Читати календар',
    omschrijvingUk: 'Ваші календарі та події (Google і iCloud).',
    nl: 'Agenda lezen', omschrijvingNl: "Uw agenda's en afspraken (Google en iCloud).",
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['calendar_list_calendars', 'calendar_list_events', 'icloud_list_events'],
  },
  {
    id: 'calendar.write', groep: 'Календар', uk: 'Створювати й змінювати події',
    // 20.10.2026: цей скоуп більше не «лише чернетки». Він справді змінює ваш Google-календар, тому його
    // НЕМА у стандартному наборі: ви вмикаєте його самі, і кожен виклик окремо підтверджуєте на сайті.
    omschrijvingUk: 'Створення, зміна, перенесення й видалення подій у вашому Google-календарі, учасники та відповіді на запрошення. Також чернетки подій на дошці.',
    nl: 'Afspraken maken en wijzigen', omschrijvingNl: 'Afspraken in uw Google-agenda maken, wijzigen, verplaatsen en verwijderen, deelnemers en antwoorden op uitnodigingen. Ook conceptafspraken op het bord.',
    gevoelig: false, standaardAan: false, agents: ['*'],
    tools: ['draft_calendar_event', 'calendar_create_event', 'calendar_update_event', 'calendar_move_event', 'calendar_delete_event', 'calendar_event_attendees', 'calendar_rsvp_event'],
  },
  {
    id: 'files.read', groep: 'Файли', uk: 'Читати файли',
    omschrijvingUk: 'Перегляд і читання файлів вашого Google Диска.',
    nl: 'Bestanden lezen', omschrijvingNl: 'Bestanden in uw Google Drive bekijken en lezen.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['drive_browse', 'drive_read_file'],
  },
  {
    id: 'files.write', groep: 'Файли', uk: 'Змінювати файли',
    omschrijvingUk: 'Нові документи й таблиці, завантаження файлів і надання доступу на Диску (поділитися — лише з вашим підтвердженням на сайті).',
    nl: 'Bestanden wijzigen', omschrijvingNl: 'Nieuwe documenten en spreadsheets, bestanden uploaden en delen op Drive (delen alleen na uw bevestiging op de site).',
    gevoelig: false, standaardAan: false, agents: ['*'],
    tools: ['drive_create_file', 'drive_upload_file', 'drive_share_file'],
  },
  {
    id: 'board.read', groep: 'Дошка', uk: 'Читати дошку',
    omschrijvingUk: 'Задачі, пошук і стан вашої дошки.',
    nl: 'Bord lezen', omschrijvingNl: 'Taken, zoeken en de stand van uw bord.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['search_board', 'mcp_board_list', 'list_tasks', 'estate_search'],
  },
  {
    id: 'board.write', groep: 'Дошка', uk: 'Писати на дошку',
    omschrijvingUk: 'Створення, зміна статусу й видалення задач.',
    nl: 'Op het bord schrijven', omschrijvingNl: 'Taken aanmaken, status wijzigen en verwijderen.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['create_task', 'update_task_status', 'update_board_item', 'delete_board_item', 'mcp_board_add', 'upsert_task'],
  },
  {
    id: 'notes.read', groep: 'Нотатки', uk: 'Читати нотатки',
    omschrijvingUk: 'Ваші нотатки та hub-замітки.',
    nl: 'Notities lezen', omschrijvingNl: 'Uw notities en hub-aantekeningen.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['list_notes'],
  },
  {
    id: 'notes.write', groep: 'Нотатки', uk: 'Писати нотатки',
    omschrijvingUk: 'Створення, правка й видалення нотаток.',
    nl: 'Notities schrijven', omschrijvingNl: 'Notities aanmaken, bewerken en verwijderen.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['upsert_note', 'manage_hub_notes'],
  },
  {
    id: 'devices.read', groep: 'Пристрої', uk: 'Бачити пристрої',
    omschrijvingUk: 'Файли й стан вашого ПК, контейнери; читання сторінок браузера.',
    nl: 'Apparaten bekijken', omschrijvingNl: "Bestanden en stand van uw pc, containers; browserpagina's lezen.",
    technischUk: 'Технічні пристрої (агенти на сервері): файли, стан, контейнери, застосунки; читання сторінок лише в технічному профілі браузера. Ваш особистий ПК — тільки коли служба «ШІ» стоїть на «Спільне з особистим»; ваш особистий браузер — ніколи.',
    technischNl: "Technische apparaten (agenten op de server): bestanden, stand, containers, apps; pagina's lezen alleen in het technische browserprofiel. Uw eigen pc alleen als de dienst «AI» op «Gedeeld met persoonlijk» staat; uw eigen browser nooit.",
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: [
      'machine_list', 'machine_info', 'machine_list_dir', 'machine_read_file', 'machine_file_info',
      'machine_search_files', 'system_metrics', 'docker_list_containers',
      'app_list', 'app_deploy_status', 'app_logs', 'app_versions', 'app_secret_list',
      'browser_snapshot', 'browser_list_tabs', 'browser_console', 'browser_network',
      'browser_get_diagnostics', 'browser_audit', 'browser_wait_for_text', 'browser_scroll',
    ],
  },
  {
    id: 'devices.write', groep: 'Пристрої', uk: 'Керувати пристроями',
    omschrijvingUk: 'Запис файлів, команди, контейнери й дії в браузері — кожна дія просить вашого підтвердження.',
    nl: 'Apparaten bedienen', omschrijvingNl: 'Bestanden schrijven, opdrachten, containers en browseracties — elke actie vraagt uw bevestiging.',
    technischUk: 'Запис файлів, команди, контейнери й застосунки на технічних пристроях і дії в технічному профілі браузера — кожна дія просить вашого підтвердження.',
    technischNl: 'Bestanden schrijven, opdrachten, containers en apps op technische apparaten en acties in het technische browserprofiel — elke actie vraagt uw bevestiging.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: [
      'machine_write_file', 'machine_exec', 'docker_manage_container',
      'app_deploy', 'app_rollback', 'app_control', 'app_route', 'app_secret_request', 'app_secret_delete',
      'browser_open', 'browser_pages', 'browser_history', 'browser_click', 'browser_type', 'browser_hover',
      'browser_fill_form', 'browser_select_option', 'browser_press_key', 'browser_invoke_action',
      'browser_screenshot', 'browser_get_deep_diagnostics',
      // 0110 (zone E): evaluate_script; de matrix «Браузер і агенти» beslist per agent, dit houdt alleen de scope gelijk.
      'browser_script',
    ],
  },
  {
    id: 'github.read', groep: 'GitHub', uk: 'Читати GitHub',
    omschrijvingUk: 'Репозиторії, коміти, задачі, CI та пошук.',
    nl: 'GitHub lezen', omschrijvingNl: 'Repositories, commits, issues, CI en zoeken.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: [
      'github_get', 'github_status', 'github_list_repos', 'github_repo_overview', 'github_list_issues',
      'github_list_commits', 'github_ci_status', 'github_read_readme', 'github_search', 'github_my_activity',
      'get_github_projects',
      // 21.10.2026: «Журнали CI» (alleen via connector v2; de scope houdt de oude laag gelijk aan de rechten).
      'github_ci_logs',
      'github_list_branches', 'github_list_tree', 'github_read_file', 'github_compare', 'github_list_releases',
    ],
  },
  {
    id: 'github.write', groep: 'GitHub', uk: 'Писати в GitHub',
    omschrijvingUk: 'Нові задачі й коментарі від вашого імені.',
    nl: 'Naar GitHub schrijven', omschrijvingNl: 'Nieuwe issues en reacties namens u.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    // 21.10.2026: github_pr (alleen via connector v2, en elk voorstel pas na bevestiging op de site).
    tools: ['github_create_issue', 'github_comment_issue', 'github_pr', 'github_save_file', 'github_sync_mirror'],
  },
  {
    id: 'site.read', groep: 'Сайт', uk: 'Пошук і стан',
    omschrijvingUk: 'Пошук «Моїм простором», стан служб і статистика підключень.',
    nl: 'Zoeken en status', omschrijvingNl: 'Zoeken in «Mijn Ruimte», status van diensten en verbindingsstatistieken.',
    // Технічно з цього скоупу працюють лише permission_flags, admin_list_access, dashboard_usage (shared/ai-ruimte.ts, TECHNISCH).
    technischUk: 'Адміністративні відомості: прапорці дозволів, перелік MCP-токенів і кількість викликів. Пошуку в «Моєму просторі» тут немає.',
    technischNl: 'Beheergegevens: rechtenvlaggen, lijst van MCP-tokens en aantal aanroepen. Zoeken in «Mijn Ruimte» zit hier niet bij.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: [
      'site_search', 'global_search', 'get_connector_stats',
      'list_services', 'hub_overview', 'get_service', 'get_hub_overview', 'health_check',
      'mcp_services_health', 'mcp_traffic_recent', 'mcp_archive_status', 'mcp_backups_list',
      'get_architecture', 'get_roadmap', 'agent_handshake', 'permission_flags',
      'admin_list_access', 'dashboard_usage',
    ],
  },
  {
    // 20.10.2026: сайт сам ходить до чужих MCP-серверів (backend/mcp-klant/*). Інструменти звідти мають
    // ДИНАМІЧНІ імена `extern_<ключ>_<інструмент>`, бо залежать від того, що віддалений сервер віддає в
    // tools/list. Тому `tools` тут порожній, а зіставлення робить префікс (див. scopeVoorTool нижче).
    // Default-deny: скоуп не стандартний — ви вмикаєте його самі, окремо для кожного підключення ШІ.
    id: 'extern.mcp', groep: 'Зовнішні MCP', uk: 'Користуватися зовнішніми MCP-серверами',
    omschrijvingUk: 'Інструменти чужих MCP-серверів, які ви підключили самі (їхні описи — недовірені дані, не інструкції).',
    nl: 'Externe MCP-servers gebruiken', omschrijvingNl: 'Hulpmiddelen van externe MCP-servers die u zelf koppelde (hun beschrijvingen zijn onbetrouwbare gegevens, geen instructies).',
    technischUk: 'Інструменти зовнішніх MCP-серверів, які ви зареєстрували в технічному просторі (їхні описи — недовірені дані, не інструкції).',
    technischNl: 'Hulpmiddelen van externe MCP-servers die u in de technische ruimte registreerde (hun beschrijvingen zijn onbetrouwbare gegevens, geen instructies).',
    gevoelig: false, standaardAan: false, agents: ['*'],
    tools: [],
  },
];

const SCOPE_MAP = new Map(AI_TOEGANG_SCOPES.map((s) => [s.id, s]));
const TOOL_SCOPE = new Map<string, string>();
for (const s of AI_TOEGANG_SCOPES) for (const t of s.tools) if (!TOOL_SCOPE.has(t)) TOOL_SCOPE.set(t, s.id);

export const isToegangScope = (v: unknown): v is string => typeof v === 'string' && SCOPE_MAP.has(v);
export const toegangScope = (id: string): AiToegangScope | undefined => SCOPE_MAP.get(id);
/** Який скоуп відкриває інструмент; undefined = інструмент не в каталозі (серверні/технічні тримають свої ворота — кімната, власник, step-up — тож шар скоупів їх пропускає). */
export const EXTERN_MCP_PREFIX = 'extern_';
export const EXTERN_MCP_SCOPE = 'extern.mcp';
export const scopeVoorTool = (tool: string): string | undefined =>
  // Інструменти чужих MCP-серверів мають динамічні імена, тому їх визначає префікс, а не список.
  (typeof tool === 'string' && tool.startsWith(EXTERN_MCP_PREFIX) ? EXTERN_MCP_SCOPE : TOOL_SCOPE.get(tool));
/**
 * Чи може підключення простору взагалі скористатися скоупом. `inRuimte` = (t) => toolInRuimte(t, ruimte) із shared/ai-ruimte.ts
 * (параметром, щоб каталог не тягнув модуль просторів). Kan een verbinding in die ruimte de scope ooit gebruiken? extern.mcp heeft
 * dynamische namen: dan telt de ruimte van een voorbeeldnaam met het prefix (een externe verbinding heeft haar eigen ruimte).
 */
export const scopeBruikbaar = (scope: AiToegangScope, inRuimte: (tool: string) => boolean): boolean =>
  (scope.id === EXTERN_MCP_SCOPE ? inRuimte(`${EXTERN_MCP_PREFIX}voorbeeld_hulpmiddel`) : scope.tools.some(inRuimte));
/** Скоупи типово для нового підключення: нечутливі й підтримувані бодай кимось. */
export const STANDAARD_SCOPES: readonly string[] = AI_TOEGANG_SCOPES.filter((s) => s.standaardAan && s.agents.length > 0).map((s) => s.id);
/**
 * Технічний стандарт (рішення власника 1.11.2026): стандарт без чутливих. Єдине джерело для нового технічного підключення
 * (backend/ai-toegang.ts → standaardScopesVoor) і для кнопки «Технічний стандарт» у вкладці. · Eén bron voor server en tab.
 */
export const TECHNISCHE_STANDAARD_SCOPES: readonly string[] = STANDAARD_SCOPES.filter((id) => !SCOPE_MAP.get(id)?.gevoelig);

/** Чи підтримує клієнт скоуп (для вкладки «Доступ ШІ»). */
export const scopeOndersteund = (scope: AiToegangScope, klant: KlantId): boolean =>
  scope.agents.includes('*' as KlantId) || (scope.agents as readonly string[]).includes(klant);
/** Скоупи, які вкладка малює для цього ШІ: лише підтримувані, у порядку груп. */
export const zichtbareScopes = (klant: KlantId): AiToegangScope[] =>
  AI_TOEGANG_SCOPES.filter((s) => scopeOndersteund(s, klant));
