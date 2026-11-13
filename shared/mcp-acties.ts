// Wat een AI via MCP deed, in gewone taal (uk/nl), zonder gevoelige waarden — en het groeperen van die acties tot «werksessies».
//
// Server (backend/mcp-connector.ts): bij elke tools/call komt in app.audit `owner.mcp.tool` met { tool, client, grantId, soort, doel }.
//   `doel` is alleen een veilige aanduiding (map/bestandspad, host+pad zonder query, repo, commando zonder geheimen) — nooit
//   inhoud van bestanden, zoektermen, ingevulde velden of brieven.
// Journaal (src/agenten/Journaal.tsx): opeenvolgende acties van dezelfde AI-verbinding met minder dan 10 minuten ertussen worden één
//   sessie («Claude працював 14:02–14:20: 12 дій»), herhalingen worden samengevoegd («×3»).
// Puur (geen DOM/Node): getest in tests/eenheid/mcp-acties.test.ts.

export type ActieSoort =
  | 'bekijken' | 'screenshot' | 'diagnose' | 'navigeren' | 'invoer'
  | 'lezen' | 'schrijven' | 'commando' | 'docker' | 'meten' | 'apps'
  | 'mail' | 'agenda' | 'schijf' | 'github' | 'bord' | 'server' | 'zoeken' | 'uitrol' | 'onbekend';

type Vormen = { uk: readonly [string, string, string]; nl: readonly [string, string] };
/** Lucide-icoonnaam per soort + meervoudsvormen (uk: 1 / 2–4 / 5+, nl: 1 / meer). */
export const SOORT_INFO: Readonly<Record<ActieSoort, { icoon: string } & Vormen>> = {
  bekijken: { icoon: 'eye', uk: ['перегляд', 'перегляди', 'переглядів'], nl: ['keer bekeken', 'keer bekeken'] },
  screenshot: { icoon: 'camera', uk: ['знімок екрана', 'знімки екрана', 'знімків екрана'], nl: ['schermafdruk', 'schermafdrukken'] },
  diagnose: { icoon: 'stethoscope', uk: ['діагностика', 'діагностики', 'діагностик'], nl: ['diagnose', 'diagnoses'] },
  navigeren: { icoon: 'compass', uk: ['перехід', 'переходи', 'переходів'], nl: ['navigatie', 'navigaties'] },
  invoer: { icoon: 'mouse-pointer-click', uk: ['дія на сторінці', 'дії на сторінці', 'дій на сторінці'], nl: ['actie op de pagina', 'acties op de pagina'] },
  lezen: { icoon: 'file-text', uk: ['читання файлу чи теки', 'читання файлів чи тек', 'читань файлів чи тек'], nl: ['bestand of map gelezen', 'bestanden of mappen gelezen'] },
  schrijven: { icoon: 'file-pen', uk: ['запис файлу', 'записи файлів', 'записів файлів'], nl: ['bestand geschreven', 'bestanden geschreven'] },
  commando: { icoon: 'terminal', uk: ['команда', 'команди', 'команд'], nl: ['commando', "commando's"] },
  docker: { icoon: 'container', uk: ['дія з контейнером', 'дії з контейнерами', 'дій з контейнерами'], nl: ['containeractie', 'containeracties'] },
  apps: { icoon: 'boxes', uk: ['дія з додатком', 'дії з додатками', 'дій з додатками'], nl: ['app-actie', 'app-acties'] },
  meten: { icoon: 'gauge', uk: ['перевірка стану', 'перевірки стану', 'перевірок стану'], nl: ['statuscontrole', 'statuscontroles'] },
  mail: { icoon: 'mail', uk: ['дія з поштою', 'дії з поштою', 'дій з поштою'], nl: ['mailactie', 'mailacties'] },
  agenda: { icoon: 'calendar', uk: ['запит до календаря', 'запити до календаря', 'запитів до календаря'], nl: ['agendavraag', 'agendavragen'] },
  schijf: { icoon: 'hard-drive', uk: ['запит до Диска', 'запити до Диска', 'запитів до Диска'], nl: ['Drive-vraag', 'Drive-vragen'] },
  github: { icoon: 'git-branch', uk: ['дія в GitHub', 'дії в GitHub', 'дій у GitHub'], nl: ['GitHub-actie', 'GitHub-acties'] },
  bord: { icoon: 'kanban', uk: ['дія на дошці', 'дії на дошці', 'дій на дошці'], nl: ['bordactie', 'bordacties'] },
  server: { icoon: 'server', uk: ['перевірка сервера', 'перевірки сервера', 'перевірок сервера'], nl: ['servercontrole', 'servercontroles'] },
  zoeken: { icoon: 'search', uk: ['пошук', 'пошуки', 'пошуків'], nl: ['zoekopdracht', 'zoekopdrachten'] },
  uitrol: { icoon: 'rocket', uk: ['дія з оновленням', 'дії з оновленням', 'дій з оновленням'], nl: ['update-actie', 'update-acties'] },
  onbekend: { icoon: 'circle-help', uk: ['інша дія', 'інші дії', 'інших дій'], nl: ['andere actie', 'andere acties'] },
};

/** Zowel de DevTools-namen (click, take_snapshot) als de interne namen (browser_click, browser_snapshot) en de site-hulpmiddelen. */
const TOOL_SOORT: Readonly<Record<string, ActieSoort>> = {
  take_snapshot: 'bekijken', browser_snapshot: 'bekijken', list_pages: 'bekijken', browser_pages: 'bekijken', browser_list_tabs: 'bekijken',
  list_console_messages: 'bekijken', browser_console: 'bekijken', list_network_requests: 'bekijken', browser_network: 'bekijken',
  browser_history: 'navigeren', wait_for: 'bekijken', browser_wait_for_text: 'bekijken', select_page: 'navigeren',
  take_screenshot: 'screenshot', browser_screenshot: 'screenshot',
  browser_get_diagnostics: 'diagnose', browser_get_deep_diagnostics: 'diagnose', browser_audit: 'diagnose',
  new_page: 'navigeren', browser_open: 'navigeren', navigate_page: 'navigeren', close_page: 'navigeren', browser_scroll: 'navigeren', hover: 'navigeren', browser_hover: 'navigeren',
  click: 'invoer', browser_click: 'invoer', fill: 'invoer', browser_type: 'invoer', fill_form: 'invoer', browser_fill_form: 'invoer',
  press_key: 'invoer', browser_press_key: 'invoer', browser_select_option: 'invoer', browser_invoke_action: 'invoer',
  evaluate_script: 'invoer', browser_script: 'invoer',
  machine_info: 'meten', system_metrics: 'meten', machine_list: 'meten',
  machine_list_dir: 'lezen', machine_read_file: 'lezen', machine_file_info: 'lezen', machine_search_files: 'lezen', machine_write_file: 'schrijven', machine_exec: 'commando',
  docker_list_containers: 'docker', docker_manage_container: 'docker',
  app_deploy: 'apps', app_deploy_status: 'apps', app_list: 'apps', app_logs: 'apps', app_versions: 'apps', app_rollback: 'apps',
  app_control: 'apps', app_route: 'apps', app_secret_request: 'apps', app_secret_list: 'apps', app_secret_delete: 'apps',
  mail_list_accounts: 'mail', mail_list_labels: 'mail', mail_read_message: 'mail', mail_search_messages: 'mail', mail_modify_message: 'mail',
  calendar_list_calendars: 'agenda', calendar_list_events: 'agenda', drive_browse: 'schijf', drive_read_file: 'schijf',
  calendar_create_event: 'agenda', calendar_update_event: 'agenda', calendar_move_event: 'agenda',
  calendar_delete_event: 'agenda', calendar_event_attendees: 'agenda', calendar_rsvp_event: 'agenda',
  github_ci_status: 'github', github_list_commits: 'github', github_list_issues: 'github', github_list_repos: 'github', github_my_activity: 'github',
  github_read_readme: 'github', github_repo_overview: 'github', github_search: 'github', github_status: 'github', github_comment_issue: 'github',
  github_create_issue: 'github', github_get: 'github', github_ci_logs: 'github', github_pr: 'github',
  github_list_branches: 'github', github_list_tree: 'github', github_read_file: 'github', github_compare: 'github',
  github_list_releases: 'github', github_save_file: 'github', github_sync_mirror: 'github',
  mcp_board_list: 'bord', mcp_board_add: 'bord', search_board: 'bord', create_task: 'bord', update_task_status: 'bord',
  update_board_item: 'bord', delete_board_item: 'bord', manage_hub_notes: 'bord', draft_calendar_event: 'agenda',
  get_live_release: 'uitrol', list_releases: 'uitrol', read_release_file: 'server', get_system_health: 'server', get_admin_view: 'server',
  list_services: 'server', get_service: 'server', get_hub_overview: 'server', get_connector_stats: 'server',
  get_github_projects: 'github', draft_email_reply: 'mail',
  mcp_archive_status: 'server', mcp_backups_list: 'server', mcp_services_health: 'server', mcp_traffic_recent: 'server',
  site_search: 'zoeken', global_search: 'zoeken',
  uitrol_voorstel_begin: 'uitrol', uitrol_voorstel_stuk: 'uitrol', uitrol_voorstel_klaar: 'uitrol', uitrol_voorstel_status: 'uitrol', uitrol_voorstel_annuleren: 'uitrol',
  audit_read: 'server', siem_status: 'server', users_manage: 'server', flags_manage: 'server',
  orch_overzicht: 'uitrol', orch_context: 'uitrol', orch_taak_start: 'uitrol', orch_inleveren_begin: 'uitrol', orch_inleveren_stuk: 'uitrol', orch_inleveren_klaar: 'uitrol',
};
const zonderPrefix = (t: string) => String(t || '').replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
export const actieSoort = (tool: string): ActieSoort => TOOL_SOORT[zonderPrefix(tool)] ?? 'onbekend';

// ---------------------------------------------------------------- veilige aanduiding (doel)
const AUTH = /\b(authorization)\b\s*[=:]\s*(?:(?:bearer|basic|token)\s+)?[^\s"']+/gi;
const DRAGER = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PAAR = /\b(token|secret|password|passwd|pwd|api[_-]?key|apikey|cookie|wachtwoord|пароль)\b(\s*[=:]\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi;
const TOKENACHTIG = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9_-]{40,})\b/g;
/** Haalt alles wat op een geheim lijkt uit een tekst: het journaal mag zelf geen lek worden. */
export const verberg = (t: string) => t.replace(AUTH, '$1=…').replace(DRAGER, '$1 …').replace(PAAR, '$1=…').replace(TOKENACHTIG, '…');
// SEC-002 (privacy-logboek-02): nooit midden in een emoji afkappen — de halve (eenzame surrogaat) werd door jsonb geweigerd,
// waardoor de regel van precies die actie niet in het journaal kwam.
const kort = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, (t.charCodeAt(n - 2) & 0xFC00) === 0xD800 ? n - 2 : n - 1)}…`);
const tekst = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/[\u0000-\u001f\u007f]/g, ' ') : undefined);
/** Alleen host + pad, zonder query en fragment (daar staan vaak codes en zoektermen). */
export function veiligeUrl(raw: unknown): string | undefined {
  const s = tekst(raw); if (!s) return undefined;
  try { const u = new URL(s); if (!/^https?:$/.test(u.protocol)) return undefined; return kort(`${u.host}${u.pathname === '/' ? '' : u.pathname}`, 80); } catch { return undefined; }
}

/** Wat werd aangeraakt, voor het journaal (max. 100 tekens), of undefined. Nooit inhoud, zoektermen of ingevulde waarden. */
export function actieDoel(tool: string, args: unknown): string | undefined {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const naam = zonderPrefix(tool);
  const pad = tekst(a.path) ?? tekst(a.file) ?? tekst(a.dir) ?? tekst(a.directory);
  switch (naam) {
    case 'machine_list_dir': case 'machine_read_file': case 'machine_write_file': case 'machine_file_info': case 'machine_search_files': return pad ? kort(verberg(pad), 100) : undefined;
    case 'machine_exec': {
      const cmd = tekst(a.command) ?? tekst(a.cmd);
      const rest = Array.isArray(a.args) ? (a.args as unknown[]).filter((x): x is string => typeof x === 'string').join(' ') : '';
      const volledig = [cmd, rest].filter(Boolean).join(' ');
      return volledig ? kort(verberg(volledig), 100) : undefined;
    }
    case 'new_page': case 'navigate_page': case 'browser_open': return veiligeUrl(a.url);
    // «Додатки»: alleen de naam van de app (en actie/domein/naam van het geheim) — nooit bestanden, env of waarden.
    case 'app_deploy': case 'app_deploy_status': case 'app_logs': case 'app_versions': case 'app_rollback': {
      const n = tekst(a.name); return n && /^[a-z][a-z0-9-]{1,31}$/.test(n) ? n : undefined;
    }
    case 'app_control': { const n = tekst(a.name); const act = tekst(a.action); return n && /^[a-z][a-z0-9-]{1,31}$/.test(n) ? kort(`${act && /^[a-z]{3,8}$/.test(act) ? `${act} ` : ''}${n}`, 60) : undefined; }
    case 'app_route': { const n = tekst(a.name); const d = tekst(a.domain); return n && /^[a-z][a-z0-9-]{1,31}$/.test(n) ? kort(`${n}${d && /^[a-z0-9.-]{1,253}$/i.test(d) ? ` → ${d}` : ''}`, 100) : undefined; }
    case 'app_secret_request': case 'app_secret_delete': { const n = tekst(a.name); const k = tekst(a.key); return n && /^[a-z][a-z0-9-]{1,31}$/.test(n) ? kort(`${n}${k && /^[A-Z_][A-Z0-9_]{0,63}$/.test(k) ? ` · ${k}` : ''}`, 100) : undefined; }
    case 'docker_manage_container': { const c = tekst(a.container) ?? tekst(a.name); const act = tekst(a.action); return c ? kort(`${act ? `${act} ` : ''}${c}`, 60) : undefined; }
    case 'read_release_file': return pad ? kort(verberg(pad), 100) : undefined;
    case 'get_service': { const id = tekst(a.id); return id && /^[a-z]{2,12}$/.test(id) ? id : undefined; }
    case 'update_task_status': { const id = tekst(a.id); const st = tekst(a.status); return id ? kort(`${st && /^(backlog|doing|blocked|done)$/.test(st) ? `${st} ` : ''}${id}`, 80) : undefined; }
    case 'browser_invoke_action': { const x = tekst(a.action) ?? tekst(a.name); return x ? kort(verberg(x), 50) : undefined; }
    case 'users_manage': { const act = tekst(a.action); const id = tekst(a.user_id); const rol = tekst(a.role); return act && /^[a-z_]{3,10}$/.test(act) ? kort(`${act}${id && /^[A-Za-z0-9_.:-]{1,80}$/.test(id) ? ` ${id}` : ''}${rol && /^[a-z]{3,8}$/.test(rol) ? ` → ${rol}` : ''}`, 100) : undefined; }
    case 'flags_manage': { const act = tekst(a.action); const k = tekst(a.key); return act && /^[a-z]{3,8}$/.test(act) ? kort(`${act}${k && /^[a-z][a-z0-9-]{2,40}$/.test(k) ? ` ${k}` : ''}`, 60) : undefined; }
    default: {
      const repo = tekst(a.repo) ?? tekst(a.repository);
      return repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : undefined;
    }
  }
}

// ---------------------------------------------------------------- zin per actie
type Taal = 'uk' | 'nl';
const Z: Readonly<Record<string, [string, string]>> = {
  bekijken: ['Переглянув сторінку', 'Bekeek de pagina'], take_snapshot: ['Подивився структуру сторінки', 'Bekeek de opbouw van de pagina'],
  list_pages: ['Переглянув відкриті вкладки', 'Bekeek de open tabbladen'], list_console_messages: ['Прочитав консоль сторінки', 'Las de console van de pagina'],
  list_network_requests: ['Переглянув мережеві запити', 'Bekeek de netwerkverzoeken'], browser_history: ['Перейшов назад/вперед в історії', 'Ging terug/vooruit in de geschiedenis'],
  wait_for: ['Чекав появи тексту на сторінці', 'Wachtte op tekst op de pagina'], select_page: ['Перемкнувся на іншу вкладку', 'Schakelde naar een ander tabblad'],
  take_screenshot: ['Зробив знімок екрана', 'Maakte een schermafdruk'], browser_get_diagnostics: ['Зібрав діагностику сторінки', 'Verzamelde diagnose van de pagina'],
  browser_get_deep_diagnostics: ['Зібрав глибоку діагностику сторінки', 'Verzamelde diepe diagnose van de pagina'],
  browser_audit: ['Провів аудит сторінки (швидкодія, безпека, структура)', 'Deed een audit van de pagina (snelheid, beveiliging, opbouw)'],
  new_page: ['Відкрив нову вкладку', 'Opende een nieuw tabblad'], navigate_page: ['Перейшов на сторінку', 'Ging naar een pagina'], close_page: ['Закрив вкладку', 'Sloot een tabblad'],
  browser_scroll: ['Прокрутив сторінку', 'Scrolde de pagina'], hover: ['Навів курсор на елемент', 'Hield de muis boven een element'],
  click: ['Натиснув елемент на сторінці', 'Klikte op een element'], fill: ['Заповнив поле', 'Vulde een veld in'], fill_form: ['Заповнив форму', 'Vulde een formulier in'],
  press_key: ['Натиснув клавішу', 'Drukte op een toets'], browser_select_option: ['Вибрав варіант у списку', 'Koos een optie in een lijst'], browser_invoke_action: ['Виконав дію сайту', 'Voerde een site-actie uit'],
  evaluate_script: ['Виконав скрипт у вкладці', 'Voerde een script uit in het tabblad'], browser_script: ['Виконав скрипт у вкладці', 'Voerde een script uit in het tabblad'],
  machine_info: ['Подивився відомості про ПК', 'Bekeek de gegevens van de pc'], system_metrics: ['Перевірив навантаження ПК', 'Controleerde de belasting van de pc'],
  machine_list: ['Переглянув підключені пристрої', 'Bekeek de gekoppelde apparaten'], machine_list_dir: ['Переглянув теку', 'Bekeek een map'],
  machine_read_file: ['Прочитав файл', 'Las een bestand'], machine_file_info: ['Перевірив файл або теку', 'Bekeek een bestand of map'], machine_search_files: ['Шукав файли на пристрої', 'Zocht bestanden op het apparaat'], machine_write_file: ['Записав файл', 'Schreef een bestand'], machine_exec: ['Виконав команду', 'Voerde een commando uit'],
  app_deploy: ['Розгорнув додаток на вашому ПК', 'Rolde een app uit op uw pc'], app_deploy_status: ['Перевірив хід розгортання', 'Bekeek de voortgang van een uitrol'],
  app_list: ['Переглянув розгорнуті додатки', 'Bekeek de uitgerolde apps'], app_logs: ['Прочитав журнал додатка', 'Las het logboek van een app'],
  app_versions: ['Переглянув версії додатка', 'Bekeek de versies van een app'], app_rollback: ['Повернув попередню версію додатка', 'Zette een eerdere versie van een app terug'],
  app_control: ['Змінив стан додатка', 'Wijzigde de status van een app'], app_route: ['Налаштував домен додатка', 'Stelde het domein van een app in'],
  app_secret_request: ['Попросив вас ввести секрет', 'Vroeg u een geheim in te voeren'], app_secret_list: ['Переглянув назви секретів', 'Bekeek de namen van geheimen'],
  app_secret_delete: ['Видалив секрет додатка', 'Verwijderde een geheim van een app'],
  docker_list_containers: ['Переглянув контейнери', 'Bekeek de containers'], docker_manage_container: ['Змінив стан контейнера', 'Wijzigde de status van een container'],
  mail_list_accounts: ['Переглянув поштові скриньки', 'Bekeek de mailaccounts'], mail_list_labels: ['Переглянув мітки пошти', 'Bekeek de maillabels'],
  mail_search_messages: ['Шукав листи', 'Zocht in de mail'], mail_read_message: ['Прочитав лист', 'Las een bericht'], mail_modify_message: ['Змінив лист (мітки чи стан)', 'Wijzigde een bericht (labels of status)'],
  calendar_list_calendars: ['Переглянув календарі', 'Bekeek de agenda\'s'], calendar_list_events: ['Переглянув події календаря', 'Bekeek afspraken in de agenda'],
  drive_browse: ['Переглянув теки на Диску', 'Bekeek mappen op Drive'], drive_read_file: ['Прочитав файл на Диску', 'Las een bestand op Drive'],
  github_status: ['Перевірив підключення GitHub', 'Controleerde de GitHub-koppeling'], github_list_repos: ['Переглянув репозиторії', 'Bekeek de repository\'s'],
  github_repo_overview: ['Переглянув огляд репозиторію', 'Bekeek een repository'], github_read_readme: ['Прочитав README', 'Las een README'],
  github_list_commits: ['Переглянув коміти', 'Bekeek commits'], github_list_issues: ['Переглянув задачі', 'Bekeek issues'], github_ci_status: ['Перевірив CI', 'Controleerde CI'],
  github_search: ['Шукав у GitHub', 'Zocht in GitHub'], github_my_activity: ['Переглянув вашу активність у GitHub', 'Bekeek uw GitHub-activiteit'],
  github_create_issue: ['Створив задачу в GitHub', 'Maakte een issue in GitHub'], github_comment_issue: ['Прокоментував задачу в GitHub', 'Reageerde op een issue in GitHub'],
  github_list_branches: ['Переглянув гілки й мітки у GitHub', 'Bekeek takken en tags in GitHub'],
  github_list_tree: ['Переглянув дерево файлів у GitHub', 'Bekeek de bestandsboom in GitHub'],
  github_read_file: ['Прочитав файл у сховищі GitHub', 'Las een bestand in een GitHub-repository'],
  github_compare: ['Порівняв гілки у GitHub', 'Vergeleek takken in GitHub'],
  github_list_releases: ['Переглянув випуски у GitHub', 'Bekeek uitgaven in GitHub'],
  github_save_file: ['Зберіг файл у сховищі GitHub', 'Sloeg een bestand op in een GitHub-repository'],
  github_sync_mirror: ['Синхронізував дзеркало GitHub', 'Synchroniseerde de GitHub-spiegel'],
  mcp_board_list: ['Переглянув дошку завдань', 'Bekeek het takenbord'], mcp_board_add: ['Додав завдання на дошку', 'Voegde een taak toe aan het bord'],
  search_board: ['Шукав на дошці', 'Zocht op het bord'], create_task: ['Створив завдання', 'Maakte een taak'],
  update_task_status: ['Змінив статус завдання', 'Wijzigde de status van een taak'], update_board_item: ['Виправив запис на дошці', 'Corrigeerde een borditem'],
  delete_board_item: ['Видалив запис з дошки', 'Verwijderde een borditem'], manage_hub_notes: ['Працював з нотатками хаба', 'Werkte met hubnotities'],
  get_live_release: ['Перевірив живий випуск', 'Controleerde de live release'], list_releases: ['Переглянув список випусків', 'Bekeek de lijst van releases'],
  read_release_file: ['Прочитав файл випуску', 'Las een releasebestand'], get_system_health: ['Перевірив стан сайту і дверей', 'Controleerde site en deur'], get_admin_view: ['Переглянув адмін-розділ від імені власника', 'Bekeek een beheerweergave namens de eigenaar'],
  list_services: ['Переглянув карту сервісів', 'Bekeek de kaart van diensten'], get_service: ['Переглянув один сервіс', 'Bekeek één dienst'],
  get_hub_overview: ['Переглянув огляд хаба', 'Bekeek het hub-overzicht'], get_connector_stats: ['Переглянув лічильник конектора', 'Bekeek de teller van de connector'],
  get_github_projects: ['Переглянув дошки GitHub Projects', 'Bekeek GitHub Projects'], draft_email_reply: ['Підготував чернетку листа', 'Maakte een conceptmail'],
  draft_calendar_event: ['Підготував чернетку події', 'Maakte een conceptafspraak'],
  calendar_create_event: ['Створив подію в календарі', 'Maakte een afspraak in de agenda'],
  calendar_update_event: ['Змінив подію в календарі', 'Wijzigde een afspraak in de agenda'],
  calendar_move_event: ['Переніс подію в інший календар', 'Verplaatste een afspraak naar een andere agenda'],
  calendar_delete_event: ['Видалив подію з календаря', 'Verwijderde een afspraak uit de agenda'],
  calendar_event_attendees: ['Змінив склад учасників події', 'Wijzigde de gasten van een afspraak'],
  calendar_rsvp_event: ['Відповів на запрошення', 'Antwoordde op een uitnodiging'],
  mcp_services_health: ['Перевірив стан сервісів сайту', 'Controleerde de diensten van de site'], mcp_backups_list: ['Переглянув резервні копії', 'Bekeek de back-ups'],
  mcp_archive_status: ['Перевірив стан архіву', 'Controleerde het archief'], mcp_traffic_recent: ['Переглянув трафік конектора', 'Bekeek het verkeer van de connector'],
  site_search: ['Шукав на сайті', 'Zocht op de site'],
  uitrol_voorstel_begin: ['Почав готувати оновлення сайту', 'Begon een update van de site voor te bereiden'], uitrol_voorstel_stuk: ['Надіслав частину пакета оновлення', 'Stuurde een deel van een updatepakket'],
  uitrol_voorstel_klaar: ['Підготував оновлення (чекає вашого схвалення)', 'Bereidde een update voor (wacht op uw goedkeuring)'],
  uitrol_voorstel_status: ['Перевірив стан оновлення', 'Controleerde de status van een update'], uitrol_voorstel_annuleren: ['Скасував підготовлене оновлення', 'Annuleerde een voorbereide update'],
  audit_read: ['Прочитав журнал безпеки (замасковано)', 'Las het beveiligingslogboek (gemaskeerd)'], siem_status: ['Перевірив передачу в SIEM', 'Controleerde de SIEM-export'],
  users_manage: ['Запропонував зміну користувача (чекає вашого passkey)', 'Stelde een wijziging van een gebruiker voor (wacht op uw passkey)'],
  flags_manage: ['Запропонував зміну прапорця функції (чекає підтвердження)', 'Stelde een wijziging van een functievlag voor (wacht op bevestiging)'],
  // ORCH-001 етап 3: координація агентів
  orch_overzicht: ['Переглянув координацію агентів', 'Bekeek de agentcoördinatie'], orch_context: ['Прочитав компактний контекст правил', 'Las de compacte regelcontext'],
  orch_taak_start: ['Зареєстрував задачу агента', 'Registreerde een agenttaak'], orch_inleveren_begin: ['Почав передачу результату', 'Begon een overdracht van een resultaat'],
  orch_inleveren_stuk: ['Надіслав частину пакета передачі', 'Stuurde een deel van een overdrachtspakket'], orch_inleveren_klaar: ['Завершив передачу (пакет у черзі перевірки)', 'Rondde een overdracht af (pakket in de controlerij)'],
};
const SYNONIEM: Readonly<Record<string, string>> = {
  browser_snapshot: 'take_snapshot', browser_pages: 'list_pages', browser_list_tabs: 'list_pages', browser_console: 'list_console_messages', browser_network: 'list_network_requests',
  browser_wait_for_text: 'wait_for', browser_screenshot: 'take_screenshot', browser_open: 'new_page', browser_hover: 'hover', browser_click: 'click', browser_type: 'fill',
  browser_fill_form: 'fill_form', browser_press_key: 'press_key', github_get: 'github_repo_overview', global_search: 'site_search',
};

/** Eén zin, bv. «Прочитав файл T:\notes\a.md». Onbekend hulpmiddel: eerlijk de naam, nooit het algemene «mcp tool». */
export function actieZin(tool: string, doel: string | undefined, taal: Taal): string {
  const naam = SYNONIEM[zonderPrefix(tool)] ?? zonderPrefix(tool);
  const z = Z[naam];
  const basis = z ? z[taal === 'nl' ? 1 : 0] : (taal === 'nl' ? `Hulpmiddel «${kort(naam, 60)}» gebruikt` : `Викликав інструмент «${kort(naam, 60)}»`);
  return doel ? `${basis}: ${doel}` : basis;
}

// ---------------------------------------------------------------- waarom mislukte het? (korte, veilige foutcode)
/** Een foutcode die veilig in het journaal en in meldingen mag staan: HOOFDLETTERS_CIJFERS_ONDERSTREEPJE, 3–48 tekens — nooit vrije tekst. */
const FOUTCODE = /^[A-Z][A-Z0-9_]{2,47}$/;
/**
 * Haalt de foutcode uit de tekst van een mislukt hulpmiddel: «SPIEGEL_FOUT», «SITE_CAP: AI_UIT. …», {"error":"PATH_NIET_GEVONDEN"},
 * {"ok":false,"error":{"code":"…"}}. Alleen een code in bovenstaand formaat komt terug; bestandsinhoud of een uitleg in vrije tekst nooit.
 */
export function foutCodeUit(tekstUit: unknown): string | undefined {
  if (typeof tekstUit !== 'string') return undefined;
  const t = tekstUit.trim().slice(0, 2000);
  if (!t) return undefined;
  const geldig = (c: unknown) => (typeof c === 'string' && FOUTCODE.test(c) ? c : undefined);
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const e = j && typeof j === 'object' ? (j.error ?? j.code ?? j.fout) : undefined;
      return geldig(e) ?? (e && typeof e === 'object' ? geldig((e as Record<string, unknown>).code) : undefined);
    } catch { /* geen JSON: hieronder als tekst */ }
  }
  const kop = /^(?:SITE_CAP:\s*)?([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?=[\s.:,;)]|$)/.exec(t);
  if (kop) return geldig(kop[1]);
  // Vaste zinnen van de site zelf (backend/site-hulpmiddelen.ts explainSiteError, connectors-hulpmiddelen.ts) die geen code in de tekst dragen.
  if (/looks like a secret/i.test(t)) return 'PATH_SECRET';
  if (/user rejected this action/i.test(t)) return 'DOOR_EIGENAAR_GEWEIGERD';
  if (/approval request expired/i.test(t)) return 'GOEDKEURING_VERLOPEN';
  if (/waiting for the user's approval/i.test(t)) return 'WACHT_OP_EIGENAAR';
  // «Mijn Ruimte reported: SPIEGEL_FOUT», «(PATH_INVALID)», «GitHub reported: GITHUB_…»: de eerste CODE_MET_ONDERSTREEPJE in de tekst.
  const ingebed = /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(t);
  return ingebed ? geldig(ingebed[1]) : undefined;
}
/** Leesbare uitleg per bekende code (uk, nl). Onbekende codes worden eerlijk met de code zelf getoond. */
const FOUT_UITLEG: Readonly<Record<string, readonly [string, string]>> = {
  SPIEGEL_FOUT: ['файл не знайдено в активному випуску на сервері (або не вдалося його прочитати)', 'bestand niet gevonden in de actieve release op de server (of niet te lezen)'],
  NOT_A_FILE: ['це не файл, а тека', 'dit is geen bestand maar een map'],
  FILE_TOO_LARGE: ['файл завеликий для читання', 'bestand te groot om te lezen'],
  UITROL_FOUT: ['помилка під час підготовки оновлення', 'fout bij het voorbereiden van de update'],
  VERSIE_BESTAAT_AL: ['така версія вже існує', 'deze versie bestaat al'],
  TE_VEEL_OPEN: ['забагато незавершених завантажень', 'te veel onafgeronde uploads'],
  OFFSET_ONJUIST: ['частина завантаження прийшла не в тому порядку', 'uploaddeel in de verkeerde volgorde'],
  UPLOAD_STIL: ['завантаження зупинилося (понад 30 хв без руху)', 'upload stilgevallen (meer dan 30 min geen voortgang)'],
  ALLEEN_EIGENAAR_MET_PASSKEY: ['схвалювати може тільки власник через passkey', 'goedkeuren kan alleen de eigenaar met passkey'],
  NETWORK_ERROR: ['мережева помилка', 'netwerkfout'],
  RATE_LIMITED: ['забагато запитів — спробуйте пізніше', 'te veel verzoeken — probeer later opnieuw'],
  PATH_SECRET: ['файл схожий на секрет (ключ, токен, .env) — сайт відмовляється його читати', 'bestand lijkt een geheim (sleutel, token, .env) — de site weigert het te lezen'],
  PATH_INVALID: ['некоректний шлях до файлу', 'ongeldig bestandspad'],
  PATH_OUTSIDE: ['шлях виходить за межі активного випуску', 'pad valt buiten de actieve release'],
  DOOR_EIGENAAR_GEWEIGERD: ['ви відхилили цю дію на сайті', 'u hebt deze actie op de site geweigerd'],
  GOEDKEURING_VERLOPEN: ['запит на схвалення минув без відповіді', 'goedkeuringsverzoek verlopen zonder antwoord'],
  WACHT_OP_EIGENAAR: ['дія чекає вашого схвалення на сайті', 'actie wacht op uw goedkeuring op de site'],
  TASK_STATUS: ['недопустимий статус задачі', 'ongeldige taakstatus'],
  GITHUB_TOKEN_MISSING: ['GitHub не підключено (немає токена)', 'GitHub is niet gekoppeld (geen token)'],
  GITHUB_TOKEN_INVALID: ['GitHub відхилив токен (недійсний або прострочений)', 'GitHub weigerde het token (ongeldig of verlopen)'],
  GITHUB_RATE_LIMITED: ['ліміт запитів GitHub вичерпано', 'GitHub-limiet bereikt'],
  GITHUB_NOT_FOUND: ['GitHub: не знайдено (немає репозиторію або доступу)', 'GitHub: niet gevonden (repo bestaat niet of geen toegang)'],
  AI_UIT: ['ШІ вимкнено перемикачем адміністратора', 'AI uitgeschakeld door een beheerschakelaar'],
};
const REDEN_UITLEG: Readonly<Record<string, readonly [string, string]>> = {
  ruimte: ['інструмент належить до іншого простору (приватний/технічний) — ця AI-прив’язка його не має', 'hulpmiddel hoort bij de andere ruimte (privé/technisch) — deze AI-verbinding heeft het niet'],
  'andere-agent': ['токен іншого агента', 'token van een andere agent'],
};
export function foutUitleg(code: string | undefined, taal: Taal): string | undefined {
  if (!code) return undefined;
  const u = FOUT_UITLEG[code] ?? REDEN_UITLEG[code];
  return u ? u[taal === 'nl' ? 1 : 0] : `${taal === 'nl' ? 'code' : 'код'} ${code}`;
}
/**
 * Hele tekst van een melding over een AI-actie: wat (actieZin), tegen welk doel, en bij een mislukking WAAROM.
 * «Claude читав файл x.md — помилка: файл не знайдено …» in plaats van «Дія на сайті: mcp tool — помилка».
 */
export function meldingMetOorzaak(o: { tool: string; doel?: string; uitkomst: 'succeeded' | 'failed'; geweigerd?: boolean; code?: string; reden?: string }, taal: Taal): { titel: string; oorzaak?: string; status: string } {
  const titel = actieZin(o.tool, o.doel, taal);
  if (o.uitkomst === 'succeeded') return { titel, status: taal === 'nl' ? 'uitgevoerd' : 'виконано' };
  const status = o.geweigerd ? (taal === 'nl' ? 'geweigerd' : 'відхилено') : (taal === 'nl' ? 'mislukt' : 'не вдалося');
  const oorzaak = foutUitleg(o.code, taal) ?? foutUitleg(o.reden, taal);
  return { titel, status, ...(oorzaak ? { oorzaak } : {}) };
}

/** Een AI-actie zoals de site haar als melding kent (backend/site-activiteit.ts → SiteEvent). */
export type SiteToolMelding = { status: string; tool?: string; doel?: string; client?: string; geweigerd?: boolean; code?: string; reden?: string };
/** Titel van de melding: «Claude: Прочитав файл …» (client + wat + doel). */
export const siteToolTitel = (e: SiteToolMelding, taal: Taal): string => `${e.client ? `${e.client}: ` : ''}${actieZin(e.tool ?? '', e.doel, taal)}`;
/** Oorzaak van een mislukking/weigering in gewone woorden; leeg bij succes. Onbekend: eerlijk zeggen dat de server geen reden gaf. */
export function siteToolOorzaak(e: SiteToolMelding, taal: Taal): string {
  if (e.status !== 'failed') return '';
  const uitleg = foutUitleg(e.code, taal) ?? foutUitleg(e.reden, taal);
  if (uitleg) return uitleg;
  if (e.geweigerd) return taal === 'nl' ? 'actie geblokkeerd door de toegangsregels' : 'дію заблоковано правилами доступу';
  return taal === 'nl' ? 'de server gaf geen reden — zie Agenten → Journaal' : 'причину сервер не повідомив — дивіться «Агенти → Журнал»';
}
/** «відхилено» (de poort liet de actie niet toe) is iets anders dan «помилка» (uitgevoerd, maar mislukt). */
export const siteToolStatus = (e: SiteToolMelding, taal: Taal): string | undefined =>
  e.status === 'failed' ? (e.geweigerd ? (taal === 'nl' ? 'geweigerd' : 'відхилено') : (taal === 'nl' ? 'mislukt' : 'не вдалося')) : undefined;

/** «3 читання файлів чи тек» / «3 bestanden of mappen gelezen». */
export function telling(n: number, soort: ActieSoort, taal: Taal): string {
  const f = SOORT_INFO[soort] ?? SOORT_INFO.onbekend;
  if (taal === 'nl') return `${n} ${n === 1 ? f.nl[0] : f.nl[1]}`;
  const m10 = n % 10, m100 = n % 100;
  const vorm = m10 === 1 && m100 !== 11 ? f.uk[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? f.uk[1] : f.uk[2];
  return `${n} ${vorm}`;
}

// ---------------------------------------------------------------- werksessies
export type JournaalAchtig = { id: string; at: number; actie: string; details: Record<string, unknown> };
export type WerkSessie<T extends JournaalAchtig> = {
  soort: 'sessie'; id: string; sleutel: string; klant: string; van: number; tot: number; items: T[];
  /** Per soort het aantal, grootste eerst. */
  tellingen: Array<{ soort: ActieSoort; aantal: number }>;
  /** Opeenvolgende gelijke acties (zelfde hulpmiddel en doel) samengevoegd: { item, keer }. */
  stappen: Array<{ item: T; keer: number }>;
  mislukt: number;
};
export type JournaalRegel<T extends JournaalAchtig> = { soort: 'los'; item: T } | WerkSessie<T>;

const s = (v: unknown) => (typeof v === 'string' ? v : '');
export const isWerkActie = (e: JournaalAchtig) => e.actie === 'owner.mcp.tool';
const sleutelVan = (e: JournaalAchtig) => s(e.details.grantId) || `klant:${s(e.details.client) || '?'}`;

/**
 * Zet een journaal (nieuwste eerst) om in regels: losse gebeurtenissen blijven los; MCP-acties van dezelfde AI-verbinding met
 * hoogstens `pauze` ms ertussen vormen één sessie — ook als een andere AI er tussendoor werkte. De volgorde blijft nieuwste eerst
 * (een sessie staat op de plek van haar nieuwste actie).
 */
export function groepeerWerk<T extends JournaalAchtig>(items: readonly T[], pauze = 10 * 60_000): Array<JournaalRegel<T>> {
  const regels: Array<JournaalRegel<T>> = [];
  const open = new Map<string, WerkSessie<T>>();
  for (const e of [...items].sort((x, y) => y.at - x.at)) {
    if (!isWerkActie(e)) { regels.push({ soort: 'los', item: e }); continue; }
    const k = sleutelVan(e);
    const huidig = open.get(k);
    if (huidig && huidig.van - e.at <= pauze) { huidig.items.push(e); huidig.van = e.at; continue; }
    const nieuw: WerkSessie<T> = { soort: 'sessie', id: `sessie:${e.id}`, sleutel: k, klant: s(e.details.client), van: e.at, tot: e.at, items: [e], tellingen: [], stappen: [], mislukt: 0 };
    open.set(k, nieuw);
    regels.push(nieuw);
  }
  for (const r of regels) {
    if (r.soort !== 'sessie') continue;
    const per = new Map<ActieSoort, number>();
    // Stappen in tijdsvolgorde (oudste eerst): zo leest een sessie als een verhaal.
    const chrono = [...r.items].sort((x, y) => x.at - y.at);
    for (const e of chrono) {
      const so = (s(e.details.soort) as ActieSoort) in SOORT_INFO ? s(e.details.soort) as ActieSoort : actieSoort(s(e.details.tool));
      per.set(so, (per.get(so) ?? 0) + 1);
      const laatste = r.stappen[r.stappen.length - 1];
      if (laatste && s(laatste.item.details.tool) === s(e.details.tool) && s(laatste.item.details.doel) === s(e.details.doel)) laatste.keer++;
      else r.stappen.push({ item: e, keer: 1 });
      if ((e as unknown as { resultaat?: string }).resultaat === 'failure') r.mislukt++;
    }
    r.tellingen = [...per.entries()].map(([soort, aantal]) => ({ soort, aantal })).sort((x, y) => y.aantal - x.aantal);
  }
  return regels;
}
