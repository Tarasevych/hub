/**
 * Каталог можливостей (capabilities), інструментів і типів дій.
 *
 * Принцип власника: РІШЕННЯ ПРИЙМАЄ ВЛАСНИК. Тому «ризик» тут — лише підпис для
 * показу в інтерфейсі, він нічого не забороняє. Єдине, що не можна видати
 * агентові взагалі, — можливість `policy.change` (змінювати самі дозволи).
 *
 * Модуль чистий (без Node-залежностей).
 */

export type Risk = 'read' | 'sensitive' | 'write' | 'dangerous';

export interface CapabilityInfo {
  id: string;
  group: string;
  label: string;
  hint: string;
  /** Лише для підпису в інтерфейсі. НЕ є забороною. */
  risk: Risk;
  /** Дата (YYYY-MM-DD), коли можливість зʼявилася: екран позначає її «Нове», якщо політику підписано раніше. */
  sinds?: string;
  /** Назва групи нідерландською (інакше бере екран зі свого словника). */
  groupNl?: string;
  /** true → жоден агент не може отримати це в принципі (лише власник зі своїм підписом). */
  ownerOnly?: boolean;
}

export const CAPABILITIES: readonly CapabilityInfo[] = [
  { id: 'browser.read', group: 'Браузер', label: 'Читати сторінки', hint: 'Знімки сторінок, список вкладок, консоль, мережа, історія', risk: 'sensitive' },
  { id: 'browser.screenshot', group: 'Браузер', label: 'Скріншоти', hint: 'Знімки екрана відкритих сторінок', risk: 'sensitive' },
  { id: 'browser.diagnose', group: 'Браузер', label: 'Діагностика', hint: 'Налагоджувальна діагностика сторінок сайту', risk: 'read' },
  { id: 'browser.navigate', group: 'Браузер', label: 'Відкривати й закривати сторінки', hint: 'Нові вкладки, перехід за адресою, прокрутка', risk: 'write' },
  { id: 'browser.act', group: 'Браузер', label: 'Діяти на сторінках', hint: 'Натискати, вводити текст, вибирати, дії сайту', risk: 'dangerous' },

  { id: 'device.read', group: 'Пристрої', label: 'Читати файли й стан ПК', hint: 'Каталоги, файли, навантаження, контейнери (перегляд)', risk: 'sensitive' },
  { id: 'device.write', group: 'Пристрої', label: 'Записувати файли на ПК', hint: 'Створення й зміна файлів у дозволених теках', risk: 'dangerous' },
  { id: 'device.exec', group: 'Пристрої', label: 'Виконувати команди на ПК', hint: 'git, node, python, docker, npm у дозволених теках', risk: 'dangerous' },
  { id: 'docker.manage', group: 'Пристрої', label: 'Керувати контейнерами', hint: 'Запуск, зупинка, перезапуск контейнерів', risk: 'dangerous' },

  { id: 'apps.read', group: 'Додатки', groupNl: 'Apps', sinds: '2026-10-11', label: 'Бачити додатки', hint: 'Список, стан, журнали (секрети замасковано), версії, назви секретів', risk: 'read' },
  { id: 'apps.deploy', group: 'Додатки', groupNl: 'Apps', sinds: '2026-10-11', label: 'Розгортати додатки', hint: 'Збірка й запуск у контейнері на вашому ПК, відкат, зупинка, видалення, домен', risk: 'dangerous' },
  { id: 'apps.secrets', group: 'Додатки', groupNl: 'Apps', sinds: '2026-10-11', label: 'Секрети додатків', hint: 'Посилання, де ви самі вводите ключ (ШІ значення не бачить); видалення секрету', risk: 'write' },

  { id: 'mail.read', group: 'Пошта й Google', label: 'Читати пошту', hint: 'Список скриньок, мітки, пошук, читання листів', risk: 'sensitive' },
  { id: 'mail.modify', group: 'Пошта й Google', label: 'Змінювати листи', hint: 'Мітки, прочитано, архів, кошик', risk: 'write' },
  { id: 'calendar.read', group: 'Пошта й Google', label: 'Читати календар', hint: 'Календарі та події', risk: 'sensitive' },
  // 20.10.2026 — de agenda is tweerichtings geworden. Deze twee mogelijkheden bestaan APART van elkaar, omdat
  // wissen niet terug te draaien is vanaf de site: wie de AI laat plannen, hoeft haar niet te laten wissen.
  { id: 'calendar.write', group: 'Пошта й Google', sinds: '2026-10-20', label: 'Створювати й змінювати події', hint: 'Нові події, зміна часу й опису, перенесення між календарями, учасники, відповіді на запрошення', risk: 'write' },
  { id: 'calendar.delete', group: 'Пошта й Google', sinds: '2026-10-20', label: 'Видаляти події', hint: 'Видалення події з вашого календаря (повернути можна лише в кошику Google)', risk: 'dangerous' },
  { id: 'drive.read', group: 'Пошта й Google', label: 'Читати Диск', hint: 'Перегляд і читання файлів Google Drive', risk: 'sensitive' },
  // 21.10.2026 (backend/dev-rechten-gebruiker.ts): vier nieuwe mogelijkheden voor mail verzenden, Drive en gekozen foto's. Nieuw =
  // een beleid dat ze nog niet noemt valt voor die AI terug op zijn standaardmodus; elk verzenden/delen/kiezen gaat bovendien
  // ALTIJD langs de bevestigingsrij op de site (shared/ai-bevestiging.ts → MET_BEVESTIGING), ook bij «завжди» in het beleid.
  { id: 'mail.send', group: 'Пошта й Google', sinds: '2026-10-21', label: 'Надсилати листи', hint: 'Нові листи, відповіді й чернетки — кожен лист лише з вашим підтвердженням на сайті', risk: 'dangerous' },
  { id: 'drive.write', group: 'Пошта й Google', sinds: '2026-10-21', label: 'Створювати файли на Диску', hint: 'Нові документи й таблиці Google, завантаження файлів до 4 МБ у вибрану теку', risk: 'write' },
  { id: 'drive.share', group: 'Пошта й Google', sinds: '2026-10-21', label: 'Ділитися файлами Диска', hint: 'Доступ людям за адресою; «будь-хто з посиланням» — лише окремою позначкою; щоразу з вашим підтвердженням на сайті', risk: 'dangerous' },
  { id: 'photos.read', group: 'Пошта й Google', sinds: '2026-10-21', label: 'Вибрані фото', hint: 'Лише ті фото з Google Фото, які ви самі виберете у вікні Google', risk: 'sensitive' },

  { id: 'github.read', group: 'GitHub', label: 'Читати GitHub', hint: 'Репозиторії, коміти, задачі, CI, пошук', risk: 'read' },
  { id: 'github.write', group: 'GitHub', label: 'Писати в GitHub', hint: 'Створювати задачі й коментарі; pull request — лише з вашим підтвердженням на сайті', risk: 'write' },

  // 21.10.2026 (shared/dev-media-github.ts): drie nieuwe mogelijkheden — de eigenaar beslist ze in zijn ondertekende beleid.
  { id: 'media.read', group: 'Дизайн і медіа', groupNl: 'Ontwerp en media', sinds: '2026-10-21', label: 'Контекст дизайну', hint: 'Кольори, шрифти й компоненти сайту — лише стилі', risk: 'read' },
  { id: 'media.create', group: 'Дизайн і медіа', groupNl: 'Ontwerp en media', sinds: '2026-10-21', label: 'Створювати зображення й схеми', hint: 'Локальний генератор зображень і схеми Mermaid — у вашу хмару', risk: 'write' },
  { id: 'payments.read', group: 'Платежі', groupNl: 'Betalingen', sinds: '2026-10-21', label: 'Переглядати платежі', hint: 'Stripe лише для читання: платежі, рахунки, виплати', risk: 'sensitive' },

  { id: 'board.read', group: 'Сервер', label: 'Читати дошку завдань', hint: 'Список завдань на дошці', risk: 'read' },
  { id: 'board.write', group: 'Сервер', label: 'Додавати на дошку', hint: 'Нові завдання на дошці', risk: 'write' },
  { id: 'server.read', group: 'Сервер', label: 'Стан сервера', hint: 'Здоровʼя сервісів, резервні копії, архів, трафік', risk: 'read' },
  { id: 'site.read', group: 'Сервер', label: 'Пошук по сайту', hint: 'Пошук у вмісті «Мого простору»', risk: 'sensitive' },

  { id: 'deploy.status', group: 'Розгортання', label: 'Дивитися стан розгортання', hint: 'Версії, журнал релізів', risk: 'read' },
  { id: 'deploy.release', group: 'Розгортання', label: 'Розгортати сайт', hint: 'Запит на реліз із відкотом; увімкнення й вимкнення — рішення власника', risk: 'dangerous' },

  { id: 'policy.change', group: 'Власник', label: 'Змінювати дозволи', hint: 'Тільки власник зі своїм цифровим підписом', risk: 'dangerous', ownerOnly: true },
];

const CAP_MAP = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function capabilityInfo(id: string): CapabilityInfo | undefined {
  return CAP_MAP.get(id);
}

export function isKnownCapability(id: string): boolean {
  return CAP_MAP.has(id);
}

export function isOwnerOnly(id: string): boolean {
  return CAP_MAP.get(id)?.ownerOnly === true;
}

/** Усі можливості, які в принципі можна видати агентові. */
export const GRANTABLE_CAPABILITIES: readonly string[] = CAPABILITIES.filter((c) => !c.ownerOnly).map((c) => c.id);

/**
 * Розгортає шаблони: `*` — усе, що можна видати; `deploy.*` — група за префіксом; або точний id.
 * Невідомий id → помилка (щоб друкарська помилка не стала «тихим» нічим).
 */
export function expandCapabilities(patterns: readonly string[] | '*'): string[] {
  if (patterns === '*') return [...GRANTABLE_CAPABILITIES];
  const out = new Set<string>();
  for (const pat of patterns) {
    if (pat === '*') { GRANTABLE_CAPABILITIES.forEach((c) => out.add(c)); continue; }
    if (pat.endsWith('.*')) {
      const prefix = pat.slice(0, -1);
      const hits = GRANTABLE_CAPABILITIES.filter((c) => c.startsWith(prefix));
      if (hits.length === 0) throw new Error(`Невідома група можливостей «${pat}».`);
      hits.forEach((c) => out.add(c));
      continue;
    }
    if (!isKnownCapability(pat)) throw new Error(`Невідома можливість «${pat}».`);
    out.add(pat);
  }
  return [...out];
}

// ───────────────────────── інструменти → можливості ─────────────────────────

export const TOOL_PREFIX = 'mcp__mcp_tarasevych_com_Anthropic__';
/** Andere klanten zetten hun eigen voorvoegsel (mcp__<server>__); alles tot en met de laatste «__» valt weg. */
const ANDER_PREFIX = /^mcp__[A-Za-z0-9_.-]*?__/;

/** Усі 57 інструментів конектора + майбутні інструменти розгортання. */
export const TOOL_CAPABILITY: Readonly<Record<string, string>> = {
  // браузер
  take_snapshot: 'browser.read',
  list_pages: 'browser.read',
  list_console_messages: 'browser.read',
  list_network_requests: 'browser.read',
  browser_history: 'browser.read',
  wait_for: 'browser.read',
  select_page: 'browser.read',
  take_screenshot: 'browser.screenshot',
  browser_get_diagnostics: 'browser.diagnose',
  browser_audit: 'browser.diagnose',
  browser_get_deep_diagnostics: 'browser.diagnose',
  new_page: 'browser.navigate',
  navigate_page: 'browser.navigate',
  close_page: 'browser.navigate',
  browser_scroll: 'browser.navigate',
  hover: 'browser.navigate',
  click: 'browser.act',
  fill: 'browser.act',
  fill_form: 'browser.act',
  press_key: 'browser.act',
  browser_select_option: 'browser.act',
  browser_invoke_action: 'browser.act',
  // 23.10 (integratie, zone E): evaluate_script (chrome-devtools-mcp) = eigen JavaScript in de pagina → de zwaarste browserdaad. Extra
  // muren blijven: alleen technisch slot + pakket «diagnose» + vinkje «Скрипти» in de matrix (backend/extensie-matrix.ts).
  evaluate_script: 'browser.act',
  // ПК
  machine_info: 'device.read',
  machine_list: 'device.read',
  machine_list_dir: 'device.read',
  machine_read_file: 'device.read',
  machine_file_info: 'device.read',
  machine_search_files: 'device.read',
  system_metrics: 'device.read',
  docker_list_containers: 'device.read',
  machine_write_file: 'device.write',
  machine_exec: 'device.exec',
  docker_manage_container: 'docker.manage',
  // додатки (BYOS: на власному ПК користувача)
  app_list: 'apps.read', app_deploy_status: 'apps.read', app_logs: 'apps.read', app_versions: 'apps.read', app_secret_list: 'apps.read',
  app_deploy: 'apps.deploy', app_rollback: 'apps.deploy', app_control: 'apps.deploy', app_route: 'apps.deploy',
  app_secret_request: 'apps.secrets', app_secret_delete: 'apps.secrets',
  // пошта і Google
  mail_list_accounts: 'mail.read',
  mail_list_labels: 'mail.read',
  mail_read_message: 'mail.read',
  mail_search_messages: 'mail.read',
  mail_modify_message: 'mail.modify',
  calendar_list_calendars: 'calendar.read',
  calendar_list_events: 'calendar.read',
  calendar_create_event: 'calendar.write',
  calendar_update_event: 'calendar.write',
  calendar_move_event: 'calendar.write',
  calendar_event_attendees: 'calendar.write',
  calendar_rsvp_event: 'calendar.write',
  calendar_delete_event: 'calendar.delete',
  drive_browse: 'drive.read',
  drive_read_file: 'drive.read',
  // 21.10.2026 (backend/dev-gebruiker-hulpmiddeldefinities.ts); iCloud is lezen van de agenda, net als calendar_list_events.
  mail_send: 'mail.send',
  drive_create_file: 'drive.write', drive_upload_file: 'drive.write', drive_share_file: 'drive.share',
  photos_picked_media: 'photos.read', icloud_list_events: 'calendar.read',
  // GitHub
  github_ci_status: 'github.read',
  github_list_commits: 'github.read',
  github_list_issues: 'github.read',
  github_list_repos: 'github.read',
  github_my_activity: 'github.read',
  github_read_readme: 'github.read',
  github_repo_overview: 'github.read',
  github_search: 'github.read',
  github_status: 'github.read',
  github_comment_issue: 'github.write',
  // 21.10.2026 (shared/dev-media-github.ts)
  github_ci_logs: 'github.read', github_pr: 'github.write', app_domain: 'apps.deploy',
  image_generate: 'media.create', diagram_generate: 'media.create', screenshot_design: 'media.read', payments_list: 'payments.read',
  github_create_issue: 'github.write',
  // сервер
  mcp_board_list: 'board.read',
  mcp_board_add: 'board.write',
  mcp_archive_status: 'server.read',
  mcp_backups_list: 'server.read',
  mcp_services_health: 'server.read',
  mcp_traffic_recent: 'server.read',
  site_search: 'site.read',
  // розгортання (інструменти з'являться разом зі службою розгортання)
  deploy_status: 'deploy.status',
  deploy_request: 'deploy.release',
  deploy_release: 'deploy.release',
  deploy_rollback: 'deploy.release',
  // Mijn Ruimte: interne namen van dezelfde browserhulpmiddelen (backend/connectors-hulpmiddelen.ts) en de uitrolhulpmiddelen.
  browser_snapshot: 'browser.read', browser_pages: 'browser.read', browser_list_tabs: 'browser.read', browser_console: 'browser.read',
  browser_network: 'browser.read', browser_wait_for_text: 'browser.read',
  browser_screenshot: 'browser.screenshot',
  browser_open: 'browser.navigate', browser_hover: 'browser.navigate',
  browser_click: 'browser.act', browser_type: 'browser.act', browser_fill_form: 'browser.act', browser_press_key: 'browser.act',
  browser_script: 'browser.act',
  github_get: 'github.read', global_search: 'site.read',
  uitrol_voorstel_status: 'deploy.status',
  uitrol_voorstel_begin: 'deploy.release', uitrol_voorstel_stuk: 'deploy.release', uitrol_voorstel_klaar: 'deploy.release', uitrol_voorstel_annuleren: 'deploy.release',
  get_live_release: 'deploy.status',
  read_release_file: 'server.read', get_system_health: 'server.read',
  get_hub_overview: 'server.read', get_connector_stats: 'server.read',
  search_board: 'board.read', create_task: 'board.write', update_task_status: 'board.write', update_board_item: 'board.write', delete_board_item: 'board.write', manage_hub_notes: 'board.write',
  get_github_projects: 'github.read',
  draft_email_reply: 'mail.modify', draft_calendar_event: 'board.write',
  // «Deur» van de MCP-console voor agenttokens (backend/mcp-console.ts runTool).
  list_tasks: 'board.read', list_notes: 'board.read', estate_search: 'board.read', upsert_task: 'board.write', upsert_note: 'board.write',
  list_services: 'server.read', hub_overview: 'server.read', health_check: 'server.read', get_service: 'server.read', site_health: 'server.read',
  release_info: 'server.read', list_dir: 'server.read', read_file: 'server.read', host_status: 'server.read', list_releases: 'server.read',
  permission_flags: 'server.read', get_architecture: 'server.read', get_roadmap: 'server.read', agent_handshake: 'server.read',
  get_admin_view: 'server.read',
  // 21.10.2026 (backend/ai-beheer-hulpmiddelen.ts): lezen valt onder «Стан сервера»; users_manage en flags_manage staan bewust NIET in de
  // catalogus (= «ask» onder een beleid): zij voeren toch nooit iets uit zonder bevestiging van de eigenaar op de site.
  audit_read: 'server.read', siem_status: 'server.read',
  admin_list_access: 'server.read', dashboard_usage: 'server.read', server_status: 'server.read', server_releases: 'server.read',
};

export function stripToolPrefix(tool: string): string {
  return tool.startsWith(TOOL_PREFIX) ? tool.slice(TOOL_PREFIX.length) : tool.replace(ANDER_PREFIX, '');
}

/** `undefined` — інструмент не в каталозі: шлюз має питати власника, а не мовчки дозволяти. */
export function capabilityForTool(tool: string): string | undefined {
  return TOOL_CAPABILITY[stripToolPrefix(tool)];
}
