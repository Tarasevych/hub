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
  /** Чутливе (пошта, фото): мітка в UI + крок підтвердження при вмиканні; ніколи — технічному підключенню. */
  gevoelig: boolean;
  /** Інструменти, які цей скоуп відкриває (внутрішні імена; аліаси браузерних інструментів розгортаються до виклику). */
  tools: readonly string[];
  /** Які ШІ-клієнти скоуп підтримують ('*' = усі). Скоуп без підтримки не малюється у вкладці. */
  agents: readonly (KlantId | '*')[];
  /** Новим підключенням надається одразу (лише нечутливі). */
  standaardAan: boolean;
}

export const AI_TOEGANG_GROEPEN: readonly string[] = [
  'Пошта', 'Фото', 'Календар', 'Файли', 'Дошка', 'Нотатки', 'Пристрої', 'GitHub', 'Сайт', 'Зовнішні MCP',
];

export const AI_TOEGANG_SCOPES: readonly AiToegangScope[] = [
  {
    id: 'mail.read', groep: 'Пошта', uk: 'Читати пошту',
    omschrijvingUk: 'Список скриньок, мітки, пошук і читання листів.',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['mail_list_accounts', 'mail_list_labels', 'mail_search_messages', 'mail_read_message'],
  },
  {
    id: 'mail.send', groep: 'Пошта', uk: 'Писати й змінювати листи',
    omschrijvingUk: 'Чернетки відповідей, мітки «прочитано», архів і кошик (без остаточного видалення).',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['mail_modify_message', 'draft_email_reply'],
  },
  {
    // 21.10.2026: een EIGEN scope, zodat geen bestaande grant (die «Писати й змінювати листи» gaf voor concepten) stil ook
    // verzenden krijgt. Elk bericht pas na bevestiging op de site met een verse passkey (backend/ai-bevestiging.ts).
    id: 'mail.verzenden', groep: 'Пошта', uk: 'Надсилати листи',
    omschrijvingUk: 'Надсилання листів від вашого імені — кожен лист лише після вашого підтвердження на сайті свіжим passkey.',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['mail_send'],
  },
  {
    id: 'photos.read', groep: 'Фото', uk: 'Читати фото',
    omschrijvingUk: 'Вибрані вами фото з Google Photos (через безпечний вибір на сайті).',
    gevoelig: true, standaardAan: false, agents: ['*'],
    tools: ['photos_picked_media'],
  },
  {
    id: 'calendar.read', groep: 'Календар', uk: 'Читати календар',
    omschrijvingUk: 'Ваші календарі та події (Google і iCloud).',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['calendar_list_calendars', 'calendar_list_events', 'icloud_list_events'],
  },
  {
    id: 'calendar.write', groep: 'Календар', uk: 'Створювати й змінювати події',
    // 20.10.2026: цей скоуп більше не «лише чернетки». Він справді змінює ваш Google-календар, тому його
    // НЕМА у стандартному наборі: ви вмикаєте його самі, і кожен виклик окремо підтверджуєте на сайті.
    omschrijvingUk: 'Створення, зміна, перенесення й видалення подій у вашому Google-календарі, учасники та відповіді на запрошення. Також чернетки подій на дошці.',
    gevoelig: false, standaardAan: false, agents: ['*'],
    tools: ['draft_calendar_event', 'calendar_create_event', 'calendar_update_event', 'calendar_move_event', 'calendar_delete_event', 'calendar_event_attendees', 'calendar_rsvp_event'],
  },
  {
    id: 'files.read', groep: 'Файли', uk: 'Читати файли',
    omschrijvingUk: 'Перегляд і читання файлів вашого Google Диска.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['drive_browse', 'drive_read_file'],
  },
  {
    id: 'files.write', groep: 'Файли', uk: 'Змінювати файли',
    omschrijvingUk: 'Нові документи й таблиці, завантаження файлів і надання доступу на Диску (поділитися — лише з вашим підтвердженням на сайті).',
    gevoelig: false, standaardAan: false, agents: ['*'],
    tools: ['drive_create_file', 'drive_upload_file', 'drive_share_file'],
  },
  {
    id: 'board.read', groep: 'Дошка', uk: 'Читати дошку',
    omschrijvingUk: 'Задачі, пошук і стан вашої дошки.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['search_board', 'mcp_board_list', 'list_tasks', 'estate_search'],
  },
  {
    id: 'board.write', groep: 'Дошка', uk: 'Писати на дошку',
    omschrijvingUk: 'Створення, зміна статусу й видалення задач.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['create_task', 'update_task_status', 'update_board_item', 'delete_board_item', 'mcp_board_add', 'upsert_task'],
  },
  {
    id: 'notes.read', groep: 'Нотатки', uk: 'Читати нотатки',
    omschrijvingUk: 'Ваші нотатки та hub-замітки.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['list_notes'],
  },
  {
    id: 'notes.write', groep: 'Нотатки', uk: 'Писати нотатки',
    omschrijvingUk: 'Створення, правка й видалення нотаток.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: ['upsert_note', 'manage_hub_notes'],
  },
  {
    id: 'devices.read', groep: 'Пристрої', uk: 'Бачити пристрої',
    omschrijvingUk: 'Файли й стан вашого ПК, контейнери; читання сторінок браузера.',
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
    gevoelig: false, standaardAan: true, agents: ['*'],
    tools: [
      'github_get', 'github_status', 'github_list_repos', 'github_repo_overview', 'github_list_issues',
      'github_list_commits', 'github_ci_status', 'github_read_readme', 'github_search', 'github_my_activity',
      'get_github_projects',
      // 21.10.2026: «Журнали CI» (alleen via connector v2; de scope houdt de oude laag gelijk aan de rechten).
      'github_ci_logs',
    ],
  },
  {
    id: 'github.write', groep: 'GitHub', uk: 'Писати в GitHub',
    omschrijvingUk: 'Нові задачі й коментарі від вашого імені.',
    gevoelig: false, standaardAan: true, agents: ['*'],
    // 21.10.2026: github_pr (alleen via connector v2, en elk voorstel pas na bevestiging op de site).
    tools: ['github_create_issue', 'github_comment_issue', 'github_pr'],
  },
  {
    id: 'site.read', groep: 'Сайт', uk: 'Пошук і стан',
    omschrijvingUk: 'Пошук «Моїм простором», стан служб і статистика підключень.',
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
/** Скоупи за замовчуванням для нового підключення: нечутливі й підтримувані бодай кимось. */
export const STANDAARD_SCOPES: readonly string[] = AI_TOEGANG_SCOPES.filter((s) => s.standaardAan && s.agents.length > 0).map((s) => s.id);

/** Чи підтримує клієнт скоуп (для вкладки «Доступ ШІ»). */
export const scopeOndersteund = (scope: AiToegangScope, klant: KlantId): boolean =>
  scope.agents.includes('*' as KlantId) || (scope.agents as readonly string[]).includes(klant);
/** Скоупи, які вкладка малює для цього ШІ: лише підтримувані, у порядку груп. */
export const zichtbareScopes = (klant: KlantId): AiToegangScope[] =>
  AI_TOEGANG_SCOPES.filter((s) => scopeOndersteund(s, klant));
