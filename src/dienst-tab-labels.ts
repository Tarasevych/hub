// Namen van de pagina's (tabs) van elke dienst, zodat het zijmenu de pagina's van een ANDERE dienst kan tonen
// zonder die dienst eerst te laden. De id's komen uit canonical-service (serviceTabs).
type Pair = readonly [string, string];

const LABELS: Record<string, Pair> = {
  overview: ['Огляд', 'Overzicht'], recent: ['Останні', 'Recent'], tasks: ['Завдання', 'Taken'], calendar: ['Календар', 'Agenda'], notes: ['Нотатки', 'Notities'], zoek: ['Пошук', 'Zoeken'],
  workspace: ['Робочий простір', 'Werkruimte'], agents: ['Агенти', 'Agenten'], runs: ['Запуски', 'Runs'], workflows: ['Процеси', 'Workflows'], verbindingen: ['Підключення ШІ', 'AI-koppelingen'],
  inbox: ['Вхідні', 'Postvak IN'], starred: ['З зірочкою', 'Met ster'], snoozed: ['Відкладені', 'Gesnoozed'], sent: ['Надіслані', 'Verzonden'], drafts: ['Чернетки', 'Concepten'],
  archive: ['Архів', 'Archief'], labels: ['Мітки', 'Labels'], accounts: ['Облікові записи', 'Accounts'], local: ['Локальні', 'Lokaal'], unread: ['Непрочитані', 'Ongelezen'],
  all: ['Усі', 'Alle'], important: ['Важливі', 'Belangrijk'], spam: ['Спам', 'Spam'], trash: ['Кошик', 'Prullenbak'], subscriptions: ['Підписки', 'Abonnementen'],
  scheduled: ['Заплановані', 'Gepland'], settings: ['Налаштування', 'Instellingen'], contacts: ['Контакти й відправники', 'Contacten en afzenders'],
  workspaces: ['Простори', 'Werkruimtes'], capture: ['Захоплення', 'Vastleggen'], search: ['Пошук', 'Zoeken'], photos: ['Фото', "Foto's"], google: ['Google', 'Google'],
  onedrive: ['OneDrive', 'OneDrive'], dropbox: ['Dropbox', 'Dropbox'],
  repositories: ['Сховища', 'Repositories'], code: ['Код і редактор', 'Code en editor'], issues: ['Задачі', 'Vraagstukken'], pulls: ['Запити на злиття', 'Samenvoegingen'],
  actions: ['Конвеєри CI', 'CI-werkstromen'], releases: ['Випуски', 'Uitgaven'], sync: ['Дзеркало й пристрої', 'Spiegel en apparaten'],
  projects: ['Проєкти', 'Projecten'], documentation: ['Документація', 'Documentatie'], research: ['Дослідження', 'Onderzoek'], activity: ['Активність', 'Activiteit'],
  personalization: ['Персоналізація', 'Personalisatie'], menu: ['Меню', 'Menu'], themes: ['Теми', "Thema's"], languages: ['Мови', 'Talen'], widgets: ['Віджети', 'Widgets'],
  sharing: ['Спільний доступ', 'Delen'], identity: ['Ідентичність', 'Identiteit'], account: ['Обліковий запис', 'Account'], sessions: ['Сесії', 'Sessies'], methods: ['Способи входу', 'Aanmeldmethoden'],
  security: ['Безпека', 'Beveiliging'], recovery: ['Відновлення', 'Herstel'],
  vault: ['Сховище', 'Kluis'], oauth: ['OAuth', 'OAuth'], access: ['Доступ', 'Toegang'], webhooks: ['Webhooks', 'Webhooks'], events: ['Події', 'Gebeurtenissen'], logs: ['Журнали', 'Logboeken'],
  import: ['Імпорт', 'Import'], reconciliation: ['Звірка', 'Afstemming'],
  contour: ['Секрети й ключі', 'Geheimen en sleutels'], updates: ['Оновлення', 'Updates'], ai: ['Доступ ШІ', 'AI-toegang'], apps: ['Застосунки', 'Apps'], devices: ['Пристрої', 'Apparaten'], sso: ['Єдиний вхід', 'Eenmalige aanmelding'], directories: ['Інтеграції', 'Integraties'], roles: ['Ролі', 'Rollen'],
  diagnostics: ['Діагностика', 'Diagnostiek'], audit: ['Аудит', 'Audit'],
  dashboard: ['Панель розгортання', 'Deploy-dashboard'], services: ['Сервіси', 'Diensten'], tools: ['Інструменти', 'Hulpmiddelen'], board: ['Дошка', 'Bord'], playground: ['Пісочниця', 'Zandbak'], traffic: ['Трафік', 'Verkeer'],
  connect: ['Підключення', 'Koppelen'], roadmap: ['Дорожня карта', 'Roadmap'], download: ['Завантаження', 'Download'],
};

const titleCase = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]+/g, ' ');

export function serviceTabLabel(tab: string, lang: 'uk' | 'nl'): string {
  const pair = LABELS[tab];
  return pair ? pair[lang === 'uk' ? 0 : 1] : titleCase(tab);
}
