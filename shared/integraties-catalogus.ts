// Каталог інтеграцій (admin.tarasevych.com/mappen, 17.10.2026). Puur: browser, server en tests gebruiken dezelfde lijst.
//
// Eerlijkheidsregel (belangrijk): `status` zegt wat de site NU werkelijk kan, niet wat gewenst is.
//   klaar       de koppeling bestaat al op de site; `doel` wijst naar de pagina die haar uitvoert (OAuth, MCP of token in de kluis).
//   instellen   de site bewaart alleen de configuratie of een eigen sleutel; handwerk of een extern vervolg is nodig.
//   binnenkort  er is GEEN koppeling. De kaart kan niet «verbinden» en doet ook niet alsof.
// Een nieuwe `klaar`-kaart mag alleen na een echte koppeling (zie tests/eenheid/integraties-catalogus.test.ts).
export type IntegratieMethode = 'oauth' | 'apikey' | 'webhook' | 'mcp' | 'handmatig' | 'scim';
export type IntegratieStatus = 'klaar' | 'instellen' | 'binnenkort';
export type IntegratieCategorie =
  | 'mail' | 'agenda' | 'opslag' | 'communicatie' | 'ai' | 'code' | 'cicd' | 'cloud' | 'database' | 'analyse'
  | 'crm' | 'betaling' | 'sociaal' | 'smarthome' | 'beveiliging' | 'documenten' | 'projecten' | 'automatisering' | 'support' | 'media' | 'webshop';

/** Waar de koppeling werkelijk gebeurt: een pagina van een dienst, of het blok «Externe directory's» op deze pagina. */
export type IntegratieDoel =
  | { soort: 'pagina'; dienst: 'mail' | 'cloud' | 'github' | 'huis' | 'identity' | 'api' | 'admin' | 'mcp'; tab: string }
  | { soort: 'directory'; type: 'microsoft_graph' | 'scim_inbound' };

export interface Integratie {
  id: string;
  naam: string;
  cat: IntegratieCategorie;
  methoden: readonly IntegratieMethode[];
  status: IntegratieStatus;
  /** simple-icons-slug (CC0); leeg of onbekend → monogram. */
  logo: string;
  uk: string;
  nl: string;
  site: string;
  doel?: IntegratieDoel;
  /** Hoe de koppeling wordt bevestigd in de UI, voor `klaar`: sleutel van de levende status (zie Integraties.tsx). */
  levend?: string;
}

export const CATEGORIEEN: ReadonlyArray<{ id: IntegratieCategorie; uk: string; nl: string; icoon: string; beschrijving: readonly [string, string] }> = [
  { id: 'mail', uk: 'Пошта', nl: 'E-mail', icoon: 'mail', beschrijving: ['Читання й надсилання пошти', 'Mail lezen en versturen'] },
  { id: 'agenda', uk: 'Календар і зустрічі', nl: 'Agenda en vergaderen', icoon: 'calendar', beschrijving: ['Події, запрошення й відеозустрічі', 'Afspraken, uitnodigingen en videogesprekken'] },
  { id: 'opslag', uk: 'Сховища файлів', nl: 'Bestandsopslag', icoon: 'cloud', beschrijving: ['Файли й теки у хмарі', 'Bestanden en mappen in de cloud'] },
  { id: 'communicatie', uk: 'Комунікація', nl: 'Communicatie', icoon: 'message', beschrijving: ['Месенджери й сповіщення', 'Berichten en meldingen'] },
  { id: 'ai', uk: 'ШІ-агенти й моделі', nl: 'AI-agenten en modellen', icoon: 'bot', beschrijving: ['Підключення ШІ до вашого простору', 'AI koppelen aan uw ruimte'] },
  { id: 'code', uk: 'Код і розробка', nl: 'Code en ontwikkeling', icoon: 'code', beschrijving: ['Репозиторії, задачі, помилки', 'Repositories, issues, fouten'] },
  { id: 'cicd', uk: 'CI/CD та інфраструктура', nl: 'CI/CD en infrastructuur', icoon: 'workflow', beschrijving: ['Збірка, розгортання, автоматизація', 'Bouwen, uitrollen, automatiseren'] },
  { id: 'cloud', uk: 'Хмари й хостинг', nl: 'Cloud en hosting', icoon: 'server', beschrijving: ['Сервери, домени, хостинг', 'Servers, domeinen, hosting'] },
  { id: 'database', uk: 'Бази даних', nl: 'Databases', icoon: 'database', beschrijving: ['Підключення до сховищ даних', 'Verbinding met gegevensopslag'] },
  { id: 'analyse', uk: 'Аналітика й моніторинг', nl: 'Analyse en monitoring', icoon: 'chart', beschrijving: ['Статистика, метрики, доступність', 'Statistieken, metingen, beschikbaarheid'] },
  { id: 'crm', uk: 'CRM і продажі', nl: 'CRM en verkoop', icoon: 'users', beschrijving: ['Контакти, угоди, клієнти', 'Contacten, deals, klanten'] },
  { id: 'betaling', uk: 'Платежі й облік', nl: 'Betalen en boekhouding', icoon: 'wallet', beschrijving: ['Платежі, рахунки, бухгалтерія', 'Betalingen, facturen, boekhouding'] },
  { id: 'sociaal', uk: 'Соцмережі', nl: 'Sociale media', icoon: 'share', beschrijving: ['Публікації й профілі', 'Berichten en profielen'] },
  { id: 'smarthome', uk: 'Розумний дім', nl: 'Slim huis', icoon: 'house', beschrijving: ['Пристрої, сенсори, сцени', 'Apparaten, sensoren, scènes'] },
  { id: 'beveiliging', uk: 'Безпека та ідентичність', nl: 'Beveiliging en identiteit', icoon: 'shield', beschrijving: ['Вхід, каталоги, паролі', 'Aanmelden, directory’s, wachtwoorden'] },
  { id: 'documenten', uk: 'Документи й нотатки', nl: 'Documenten en notities', icoon: 'file', beschrijving: ['Тексти, таблиці, бази знань', 'Teksten, tabellen, kennisbanken'] },
  { id: 'projecten', uk: 'Проєкти й задачі', nl: 'Projecten en taken', icoon: 'list', beschrijving: ['Дошки, спринти, дедлайни', 'Borden, sprints, deadlines'] },
  { id: 'automatisering', uk: 'Автоматизація та API', nl: 'Automatisering en API', icoon: 'zap', beschrijving: ['Вебхуки, токени, інтеграційні платформи', 'Webhooks, tokens, integratieplatformen'] },
  { id: 'support', uk: 'Підтримка клієнтів', nl: 'Klantenservice', icoon: 'life', beschrijving: ['Звернення й чати', 'Tickets en chats'] },
  { id: 'media', uk: 'Медіа й музика', nl: 'Media en muziek', icoon: 'play', beschrijving: ['Відео, музика, медіатеки', 'Video, muziek, mediabibliotheken'] },
  { id: 'webshop', uk: 'Сайти й магазини', nl: 'Websites en webshops', icoon: 'store', beschrijving: ['Сайти, магазини, розсилки', 'Sites, webshops, mailings'] },
];

const ctg = (c: IntegratieCategorie) => CATEGORIEEN.find((x) => x.id === c)!;
const P = (dienst: 'mail' | 'cloud' | 'github' | 'huis' | 'identity' | 'api' | 'admin' | 'mcp', tab: string): IntegratieDoel => ({ soort: 'pagina', dienst, tab });

type M = IntegratieMethode;
type Rij = [id: string, naam: string, cat: IntegratieCategorie, methoden: M[], status: IntegratieStatus, logo: string, site: string, extra?: { uk?: string; nl?: string; doel?: IntegratieDoel; levend?: string }];

const RIJEN: Rij[] = [
  // — Пошта —
  ['gmail', 'Gmail', 'mail', ['oauth'], 'klaar', 'gmail', 'https://mail.google.com', { uk: 'Читання, пошук і чернетки у «Пошті» через Google OAuth.', nl: 'Lezen, zoeken en concepten in «E-mail» via Google-OAuth.', doel: P('mail', 'accounts'), levend: 'gmail' }],
  ['outlook-mail', 'Outlook', 'mail', ['oauth'], 'binnenkort', 'microsoftoutlook', 'https://outlook.com'],
  ['yahoo-mail', 'Yahoo Mail', 'mail', ['oauth'], 'binnenkort', 'yahoo', 'https://mail.yahoo.com'],
  ['icloud-mail', 'iCloud Mail', 'mail', ['handmatig'], 'binnenkort', 'icloud', 'https://www.icloud.com/mail'],
  ['proton-mail', 'Proton Mail', 'mail', ['handmatig'], 'binnenkort', 'protonmail', 'https://proton.me/mail'],
  ['fastmail', 'Fastmail', 'mail', ['oauth'], 'binnenkort', 'fastmail', 'https://www.fastmail.com'],
  ['imap', 'IMAP / SMTP', 'mail', ['handmatig'], 'binnenkort', 'icoon-mail', 'https://datatracker.ietf.org/doc/html/rfc9051', { uk: 'Будь-яка поштова скринька за стандартами IMAP і SMTP.', nl: 'Elke mailbox via de standaarden IMAP en SMTP.' }],
  // — Календар —
  ['google-calendar', 'Google Calendar', 'agenda', ['oauth'], 'klaar', 'googlecalendar', 'https://calendar.google.com', { uk: 'Перегляд календарів і подій Google у вашому просторі.', nl: 'Google-agenda’s en afspraken bekijken in uw ruimte.', doel: P('cloud', 'calendar'), levend: 'calendar' }],
  ['outlook-calendar', 'Outlook Calendar', 'agenda', ['oauth'], 'binnenkort', 'microsoftoutlook', 'https://outlook.live.com/calendar'],
  ['apple-calendar', 'Apple Calendar', 'agenda', ['handmatig'], 'binnenkort', 'apple', 'https://www.icloud.com/calendar'],
  ['calendly', 'Calendly', 'agenda', ['oauth', 'webhook'], 'binnenkort', 'calendly', 'https://calendly.com'],
  ['cal-com', 'Cal.com', 'agenda', ['apikey', 'webhook'], 'binnenkort', 'caldotcom', 'https://cal.com'],
  ['zoom', 'Zoom', 'agenda', ['oauth'], 'binnenkort', 'zoom', 'https://zoom.us'],
  ['google-meet', 'Google Meet', 'agenda', ['oauth'], 'binnenkort', 'googlemeet', 'https://meet.google.com'],
  ['microsoft-teams', 'Microsoft Teams', 'agenda', ['oauth'], 'binnenkort', 'microsoftteams', 'https://teams.microsoft.com'],
  // — Сховища —
  ['google-drive', 'Google Drive', 'opslag', ['oauth'], 'klaar', 'googledrive', 'https://drive.google.com', { uk: 'Файли й теки Диска у «Хмарному сховищі», збереження вкладень з пошти.', nl: 'Bestanden en mappen van Drive in «Cloudopslag», bijlagen uit mail opslaan.', doel: P('cloud', 'accounts'), levend: 'drive' }],
  ['google-photos', 'Google Photos', 'opslag', ['oauth'], 'klaar', 'googlephotos', 'https://photos.google.com', { uk: 'Вибір і імпорт фото за вашим дозволом.', nl: 'Foto’s kiezen en importeren met uw toestemming.', doel: P('cloud', 'photos'), levend: 'photos' }],
  ['onedrive', 'OneDrive', 'opslag', ['oauth'], 'binnenkort', 'microsoftonedrive', 'https://onedrive.live.com'],
  ['dropbox', 'Dropbox', 'opslag', ['oauth'], 'binnenkort', 'dropbox', 'https://www.dropbox.com'],
  ['box', 'Box', 'opslag', ['oauth'], 'binnenkort', 'box', 'https://www.box.com'],
  ['icloud-drive', 'iCloud Drive', 'opslag', ['handmatig'], 'binnenkort', 'icloud', 'https://www.icloud.com'],
  ['nextcloud', 'Nextcloud', 'opslag', ['apikey'], 'binnenkort', 'nextcloud', 'https://nextcloud.com'],
  ['mega', 'MEGA', 'opslag', ['handmatig'], 'binnenkort', 'mega', 'https://mega.io'],
  ['s3', 'S3-сумісне сховище', 'opslag', ['apikey'], 'binnenkort', 'amazons3', 'https://aws.amazon.com/s3/', { uk: 'Будь-яке сховище з S3-протоколом (AWS, MinIO, R2).', nl: 'Elke opslag met het S3-protocol (AWS, MinIO, R2).' }],
  // — Комунікація —
  ['telegram', 'Telegram', 'communicatie', ['apikey'], 'klaar', 'telegram', 'https://core.telegram.org/bots', { uk: 'Токен бота зберігається лише в сховищі секретів; сповіщення від сайту.', nl: 'Bot-token alleen in de geheimenkluis; meldingen van de site.', doel: P('api', 'vault'), levend: 'telegram' }],
  ['slack', 'Slack', 'communicatie', ['oauth', 'webhook'], 'binnenkort', 'slack', 'https://slack.com'],
  ['discord', 'Discord', 'communicatie', ['webhook', 'apikey'], 'binnenkort', 'discord', 'https://discord.com'],
  ['whatsapp', 'WhatsApp Business', 'communicatie', ['apikey', 'webhook'], 'binnenkort', 'whatsapp', 'https://business.whatsapp.com'],
  ['signal', 'Signal', 'communicatie', ['handmatig'], 'binnenkort', 'signal', 'https://signal.org'],
  ['matrix', 'Matrix', 'communicatie', ['apikey'], 'binnenkort', 'matrix', 'https://matrix.org'],
  ['mattermost', 'Mattermost', 'communicatie', ['webhook', 'apikey'], 'binnenkort', 'mattermost', 'https://mattermost.com'],
  ['twilio', 'Twilio', 'communicatie', ['apikey', 'webhook'], 'binnenkort', 'twilio', 'https://www.twilio.com'],
  // — ШІ —
  ['claude', 'Claude', 'ai', ['mcp', 'oauth'], 'klaar', 'claude', 'https://claude.ai', { uk: 'Власна MCP-адреса /claude; приватний і технічний простір розділені.', nl: 'Eigen MCP-adres /claude; privé en technische ruimte gescheiden.', doel: P('mcp', 'connect'), levend: 'agent:claude' }],
  ['chatgpt', 'ChatGPT', 'ai', ['mcp', 'oauth'], 'klaar', 'openai', 'https://chatgpt.com', { uk: 'Власна MCP-адреса /gpt для режиму розробника ChatGPT.', nl: 'Eigen MCP-adres /gpt voor de ontwikkelaarsmodus van ChatGPT.', doel: P('mcp', 'connect'), levend: 'agent:gpt' }],
  ['grok', 'Grok', 'ai', ['mcp', 'oauth'], 'klaar', 'x', 'https://grok.com', { uk: 'Власна MCP-адреса /grok.', nl: 'Eigen MCP-adres /grok.', doel: P('mcp', 'connect'), levend: 'agent:grok' }],
  ['gemini', 'Gemini', 'ai', ['mcp', 'oauth'], 'klaar', 'googlegemini', 'https://gemini.google.com', { uk: 'Власна MCP-адреса /gemini (Gemini CLI).', nl: 'Eigen MCP-adres /gemini (Gemini CLI).', doel: P('mcp', 'connect'), levend: 'agent:gemini' }],
  ['copilot', 'GitHub Copilot', 'ai', ['mcp', 'oauth'], 'klaar', 'githubcopilot', 'https://github.com/features/copilot', { uk: 'Власна MCP-адреса /copilot для VS Code.', nl: 'Eigen MCP-adres /copilot voor VS Code.', doel: P('mcp', 'connect'), levend: 'agent:copilot' }],
  ['cursor', 'Cursor', 'ai', ['mcp', 'oauth'], 'klaar', 'cursor', 'https://cursor.com', { uk: 'Власна MCP-адреса /cursor.', nl: 'Eigen MCP-adres /cursor.', doel: P('mcp', 'connect'), levend: 'agent:cursor' }],
  ['antigravity', 'Google Antigravity', 'ai', ['mcp', 'oauth'], 'klaar', 'antigravity', 'https://idx.google.com', { uk: 'Власна MCP-адреса /antigravity та двосторонній плагін.', nl: 'Eigen MCP-adres /antigravity en tweerichtingsplug-in.', doel: P('mcp', 'connect'), levend: 'agent:antigravity' }],
  ['anthropic-api', 'Anthropic API (BYOK)', 'ai', ['apikey'], 'klaar', 'anthropic', 'https://docs.anthropic.com', { uk: 'Власний API-ключ для чату на ai.tarasevych.com; лише в сховищі секретів.', nl: 'Eigen API-sleutel voor de chat op ai.tarasevych.com; alleen in de geheimenkluis.', doel: P('api', 'vault'), levend: 'anthropic' }],
  ['openai-api', 'OpenAI API', 'ai', ['apikey'], 'binnenkort', 'openai', 'https://platform.openai.com'],
  ['mistral', 'Mistral AI', 'ai', ['apikey'], 'binnenkort', 'mistralai', 'https://mistral.ai'],
  ['perplexity', 'Perplexity', 'ai', ['apikey'], 'binnenkort', 'perplexity', 'https://www.perplexity.ai'],
  ['huggingface', 'Hugging Face', 'ai', ['apikey'], 'binnenkort', 'huggingface', 'https://huggingface.co'],
  ['ollama', 'Ollama', 'ai', ['handmatig'], 'binnenkort', 'ollama', 'https://ollama.com', { uk: 'Локальні моделі на вашому комп’ютері.', nl: 'Lokale modellen op uw eigen computer.' }],
  ['mcp-server', 'Власний MCP-клієнт', 'ai', ['mcp'], 'klaar', 'modelcontextprotocol', 'https://modelcontextprotocol.io', { uk: 'Будь-який клієнт MCP може підключитися за адресою вашого сервера.', nl: 'Elke MCP-client kan verbinden met het adres van uw server.', doel: P('mcp', 'connect'), levend: 'mcp' }],
  // — Код —
  // 20.10.2026: drie echte wegen — OAuth-app van de eigenaar, GitHub App, of een persoonlijke token in de kluis.
  ['github', 'GitHub', 'code', ['oauth', 'apikey'], 'klaar', 'github', 'https://github.com', { uk: 'Репозиторії, задачі, коміти й CI: вхід через власний OAuth-застосунок, GitHub App або PAT у сховищі ключів.', nl: 'Repositories, issues, commits en CI: aanmelden via uw eigen OAuth-app, een GitHub App of een PAT in de sleutelkluis.', doel: P('github', 'accounts'), levend: 'github' }],
  ['gitlab', 'GitLab', 'code', ['oauth', 'apikey'], 'binnenkort', 'gitlab', 'https://gitlab.com'],
  ['bitbucket', 'Bitbucket', 'code', ['oauth'], 'binnenkort', 'bitbucket', 'https://bitbucket.org'],
  ['gitea', 'Gitea', 'code', ['apikey'], 'binnenkort', 'gitea', 'https://about.gitea.com'],
  ['codeberg', 'Codeberg', 'code', ['apikey'], 'binnenkort', 'codeberg', 'https://codeberg.org'],
  ['sentry', 'Sentry', 'code', ['apikey', 'webhook'], 'binnenkort', 'sentry', 'https://sentry.io'],
  ['npm', 'npm', 'code', ['apikey'], 'binnenkort', 'npm', 'https://www.npmjs.com'],
  ['docker-hub', 'Docker Hub', 'code', ['apikey'], 'binnenkort', 'docker', 'https://hub.docker.com'],
  // — CI/CD —
  ['github-actions', 'GitHub Actions', 'cicd', ['webhook', 'apikey'], 'binnenkort', 'githubactions', 'https://github.com/features/actions'],
  ['circleci', 'CircleCI', 'cicd', ['apikey', 'webhook'], 'binnenkort', 'circleci', 'https://circleci.com'],
  ['jenkins', 'Jenkins', 'cicd', ['apikey', 'webhook'], 'binnenkort', 'jenkins', 'https://www.jenkins.io'],
  ['argocd', 'Argo CD', 'cicd', ['apikey'], 'binnenkort', 'argo', 'https://argo-cd.readthedocs.io'],
  ['terraform', 'Terraform', 'cicd', ['apikey'], 'binnenkort', 'terraform', 'https://www.terraform.io'],
  ['ansible', 'Ansible', 'cicd', ['handmatig'], 'binnenkort', 'ansible', 'https://www.ansible.com'],
  // — Хмари —
  ['aws', 'Amazon Web Services', 'cloud', ['apikey'], 'binnenkort', 'amazonwebservices', 'https://aws.amazon.com'],
  ['google-cloud', 'Google Cloud', 'cloud', ['oauth', 'apikey'], 'binnenkort', 'googlecloud', 'https://cloud.google.com'],
  ['azure', 'Microsoft Azure', 'cloud', ['oauth', 'apikey'], 'binnenkort', 'microsoftazure', 'https://azure.microsoft.com'],
  ['cloudflare', 'Cloudflare', 'cloud', ['apikey'], 'binnenkort', 'cloudflare', 'https://www.cloudflare.com'],
  ['vercel', 'Vercel', 'cloud', ['apikey'], 'binnenkort', 'vercel', 'https://vercel.com'],
  ['netlify', 'Netlify', 'cloud', ['apikey'], 'binnenkort', 'netlify', 'https://www.netlify.com'],
  ['digitalocean', 'DigitalOcean', 'cloud', ['apikey'], 'binnenkort', 'digitalocean', 'https://www.digitalocean.com'],
  ['hetzner', 'Hetzner', 'cloud', ['apikey'], 'binnenkort', 'hetzner', 'https://www.hetzner.com'],
  ['fly', 'Fly.io', 'cloud', ['apikey'], 'binnenkort', 'flydotio', 'https://fly.io'],
  ['heroku', 'Heroku', 'cloud', ['apikey'], 'binnenkort', 'heroku', 'https://www.heroku.com'],
  // — Бази даних —
  ['postgresql', 'PostgreSQL', 'database', ['handmatig'], 'binnenkort', 'postgresql', 'https://www.postgresql.org'],
  ['mysql', 'MySQL', 'database', ['handmatig'], 'binnenkort', 'mysql', 'https://www.mysql.com'],
  ['mongodb', 'MongoDB', 'database', ['handmatig'], 'binnenkort', 'mongodb', 'https://www.mongodb.com'],
  ['redis', 'Redis', 'database', ['handmatig'], 'binnenkort', 'redis', 'https://redis.io'],
  ['supabase', 'Supabase', 'database', ['apikey'], 'binnenkort', 'supabase', 'https://supabase.com'],
  ['firebase', 'Firebase', 'database', ['apikey'], 'binnenkort', 'firebase', 'https://firebase.google.com'],
  ['elasticsearch', 'Elasticsearch', 'database', ['apikey'], 'binnenkort', 'elasticsearch', 'https://www.elastic.co'],
  ['bigquery', 'BigQuery', 'database', ['oauth'], 'binnenkort', 'googlebigquery', 'https://cloud.google.com/bigquery'],
  ['snowflake', 'Snowflake', 'database', ['apikey'], 'binnenkort', 'snowflake', 'https://www.snowflake.com'],
  // — Аналітика —
  ['google-analytics', 'Google Analytics', 'analyse', ['oauth'], 'binnenkort', 'googleanalytics', 'https://analytics.google.com'],
  ['plausible', 'Plausible', 'analyse', ['apikey'], 'binnenkort', 'plausibleanalytics', 'https://plausible.io'],
  ['matomo', 'Matomo', 'analyse', ['apikey'], 'binnenkort', 'matomo', 'https://matomo.org'],
  ['mixpanel', 'Mixpanel', 'analyse', ['apikey'], 'binnenkort', 'mixpanel', 'https://mixpanel.com'],
  ['posthog', 'PostHog', 'analyse', ['apikey'], 'binnenkort', 'posthog', 'https://posthog.com'],
  ['grafana', 'Grafana', 'analyse', ['apikey'], 'binnenkort', 'grafana', 'https://grafana.com'],
  ['prometheus', 'Prometheus', 'analyse', ['handmatig'], 'binnenkort', 'prometheus', 'https://prometheus.io'],
  ['datadog', 'Datadog', 'analyse', ['apikey'], 'binnenkort', 'datadog', 'https://www.datadoghq.com'],
  ['uptime-kuma', 'Uptime Kuma', 'analyse', ['webhook'], 'binnenkort', 'uptimekuma', 'https://uptime.kuma.pet'],
  // — CRM —
  ['hubspot', 'HubSpot', 'crm', ['oauth'], 'binnenkort', 'hubspot', 'https://www.hubspot.com'],
  ['salesforce', 'Salesforce', 'crm', ['oauth'], 'binnenkort', 'salesforce', 'https://www.salesforce.com'],
  ['pipedrive', 'Pipedrive', 'crm', ['oauth', 'apikey'], 'binnenkort', 'pipedrive', 'https://www.pipedrive.com'],
  ['zoho', 'Zoho CRM', 'crm', ['oauth'], 'binnenkort', 'zoho', 'https://www.zoho.com/crm/'],
  // — Платежі —
  ['stripe', 'Stripe', 'betaling', ['apikey', 'webhook'], 'binnenkort', 'stripe', 'https://stripe.com'],
  ['paypal', 'PayPal', 'betaling', ['oauth', 'webhook'], 'binnenkort', 'paypal', 'https://www.paypal.com'],
  ['mollie', 'Mollie', 'betaling', ['apikey', 'webhook'], 'binnenkort', 'mollie', 'https://www.mollie.com'],
  ['wise', 'Wise', 'betaling', ['apikey'], 'binnenkort', 'wise', 'https://wise.com'],
  ['quickbooks', 'QuickBooks', 'betaling', ['oauth'], 'binnenkort', 'quickbooks', 'https://quickbooks.intuit.com'],
  ['xero', 'Xero', 'betaling', ['oauth'], 'binnenkort', 'xero', 'https://www.xero.com'],
  // — Соцмережі —
  ['x-twitter', 'X (Twitter)', 'sociaal', ['oauth'], 'binnenkort', 'x', 'https://x.com'],
  ['facebook', 'Facebook', 'sociaal', ['oauth'], 'binnenkort', 'facebook', 'https://www.facebook.com'],
  ['instagram', 'Instagram', 'sociaal', ['oauth'], 'binnenkort', 'instagram', 'https://www.instagram.com'],
  ['linkedin', 'LinkedIn', 'sociaal', ['oauth'], 'binnenkort', 'linkedin', 'https://www.linkedin.com'],
  ['youtube', 'YouTube', 'sociaal', ['oauth'], 'binnenkort', 'youtube', 'https://www.youtube.com'],
  ['tiktok', 'TikTok', 'sociaal', ['oauth'], 'binnenkort', 'tiktok', 'https://www.tiktok.com'],
  ['mastodon', 'Mastodon', 'sociaal', ['oauth'], 'binnenkort', 'mastodon', 'https://joinmastodon.org'],
  ['bluesky', 'Bluesky', 'sociaal', ['apikey'], 'binnenkort', 'bluesky', 'https://bsky.app'],
  ['reddit', 'Reddit', 'sociaal', ['oauth'], 'binnenkort', 'reddit', 'https://www.reddit.com'],
  // — Розумний дім —
  ['home-assistant', 'Home Assistant', 'smarthome', ['apikey'], 'klaar', 'homeassistant', 'https://www.home-assistant.io', { uk: 'Long-lived токен зберігається лише в сховищі секретів.', nl: 'Long-lived token alleen in de geheimenkluis.', doel: P('api', 'vault'), levend: 'home-assistant' }],
  ['philips-hue', 'Philips Hue', 'smarthome', ['oauth', 'apikey'], 'binnenkort', 'philipshue', 'https://www.philips-hue.com'],
  ['google-home', 'Google Home', 'smarthome', ['oauth'], 'binnenkort', 'googlehome', 'https://home.google.com'],
  ['homekit', 'Apple Home', 'smarthome', ['handmatig'], 'binnenkort', 'apple', 'https://www.apple.com/home-app/'],
  ['mqtt', 'MQTT', 'smarthome', ['handmatig'], 'binnenkort', 'mqtt', 'https://mqtt.org'],
  ['zigbee2mqtt', 'Zigbee2MQTT', 'smarthome', ['handmatig'], 'binnenkort', 'zigbee2mqtt', 'https://www.zigbee2mqtt.io'],
  ['tuya', 'Tuya', 'smarthome', ['apikey'], 'binnenkort', 'tuya', 'https://www.tuya.com'],
  ['shelly', 'Shelly', 'smarthome', ['handmatig'], 'binnenkort', 'shelly', 'https://www.shelly.com'],
  ['sonos', 'Sonos', 'smarthome', ['oauth'], 'binnenkort', 'sonos', 'https://www.sonos.com'],
  // — Безпека —
  ['google-signin', 'Вхід через Google (SSO)', 'beveiliging', ['oauth'], 'klaar', 'google', 'https://accounts.google.com', { uk: 'Єдиний вхід в екосистему; правила керуються на вкладці SSO.', nl: 'Eén aanmelding voor het ecosysteem; regels op het tabblad SSO.', doel: P('admin', 'sso'), levend: 'sso' }],
  ['entra', 'Microsoft Entra ID', 'beveiliging', ['oauth'], 'instellen', 'microsoftentra', 'https://learn.microsoft.com/entra/', { uk: 'Каталог Microsoft Graph: тут зберігається лише налаштування (орендар); облікові дані й перевірка — окремо.', nl: 'Microsoft Graph-directory: hier staat alleen de configuratie (tenant); referenties en verificatie apart.', doel: { soort: 'directory', type: 'microsoft_graph' }, levend: 'dir:microsoft_graph' }],
  ['scim', 'SCIM 2.0 (вхідна синхронізація)', 'beveiliging', ['scim'], 'instellen', 'icoon-scim', 'https://scim.cloud', { uk: 'Приймає користувачів із зовнішнього каталогу; тут зберігається лише базова адреса.', nl: 'Ontvangt gebruikers uit een externe directory; hier staat alleen de basis-URL.', doel: { soort: 'directory', type: 'scim_inbound' }, levend: 'dir:scim_inbound' }],
  ['okta', 'Okta', 'beveiliging', ['oauth', 'scim'], 'binnenkort', 'okta', 'https://www.okta.com'],
  ['auth0', 'Auth0', 'beveiliging', ['oauth'], 'binnenkort', 'auth0', 'https://auth0.com'],
  ['keycloak', 'Keycloak', 'beveiliging', ['oauth'], 'binnenkort', 'keycloak', 'https://www.keycloak.org'],
  ['onepassword', '1Password', 'beveiliging', ['apikey'], 'binnenkort', '1password', 'https://1password.com'],
  ['bitwarden', 'Bitwarden', 'beveiliging', ['apikey'], 'binnenkort', 'bitwarden', 'https://bitwarden.com'],
  ['vault', 'HashiCorp Vault', 'beveiliging', ['apikey'], 'binnenkort', 'vault', 'https://www.vaultproject.io'],
  // — Документи —
  ['notion', 'Notion', 'documenten', ['oauth'], 'binnenkort', 'notion', 'https://www.notion.so'],
  ['google-docs', 'Google Docs', 'documenten', ['oauth'], 'binnenkort', 'googledocs', 'https://docs.google.com'],
  ['google-sheets', 'Google Sheets', 'documenten', ['oauth'], 'binnenkort', 'googlesheets', 'https://sheets.google.com'],
  ['confluence', 'Confluence', 'documenten', ['oauth', 'apikey'], 'binnenkort', 'confluence', 'https://www.atlassian.com/software/confluence'],
  ['obsidian', 'Obsidian', 'documenten', ['handmatig'], 'binnenkort', 'obsidian', 'https://obsidian.md'],
  ['evernote', 'Evernote', 'documenten', ['oauth'], 'binnenkort', 'evernote', 'https://evernote.com'],
  ['airtable', 'Airtable', 'documenten', ['apikey', 'oauth'], 'binnenkort', 'airtable', 'https://airtable.com'],
  ['onenote', 'OneNote', 'documenten', ['oauth'], 'binnenkort', 'microsoftonenote', 'https://www.onenote.com'],
  // — Проєкти —
  ['trello', 'Trello', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'trello', 'https://trello.com'],
  ['asana', 'Asana', 'projecten', ['oauth'], 'binnenkort', 'asana', 'https://asana.com'],
  ['jira', 'Jira', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'jira', 'https://www.atlassian.com/software/jira'],
  ['linear', 'Linear', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'linear', 'https://linear.app'],
  ['monday', 'monday.com', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'mondaydotcom', 'https://monday.com'],
  ['clickup', 'ClickUp', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'clickup', 'https://clickup.com'],
  ['todoist', 'Todoist', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'todoist', 'https://todoist.com'],
  ['figma', 'Figma', 'projecten', ['oauth', 'apikey'], 'binnenkort', 'figma', 'https://www.figma.com'],
  // — Автоматизація —
  // Audit 19.10.2026 (A10): er is nog geen eigen webhooks-scherm (de tab api/webhooks toonde het paneel «Доступ») → eerlijk «binnenkort».
  ['webhooks', 'Вебхуки (вхідні)', 'automatisering', ['webhook'], 'binnenkort', 'webhook', 'https://api.tarasevych.com', { uk: 'Приймання подій з будь-якого сервісу готується; поки що є лише токени доступу (API → Доступ).', nl: 'Inkomende gebeurtenissen van elke dienst komen eraan; nu zijn er alleen toegangstokens (API → Toegang).' }],
  ['rest-api', 'REST API і токени', 'automatisering', ['apikey'], 'klaar', 'icoon-api', 'https://api.tarasevych.com', { uk: 'Власні токени доступу з обмеженими правами.', nl: 'Eigen toegangstokens met beperkte rechten.', doel: P('api', 'access'), levend: 'api' }],
  ['oauth-clients', 'OAuth-застосунки', 'automatisering', ['oauth'], 'klaar', 'oauth', 'https://oauth.net', { uk: 'Зовнішні застосунки, які просять доступ до вашого простору.', nl: 'Externe apps die toegang tot uw ruimte vragen.', doel: P('admin', 'apps'), levend: 'api' }],
  ['zapier', 'Zapier', 'automatisering', ['webhook', 'apikey'], 'binnenkort', 'zapier', 'https://zapier.com'],
  ['make', 'Make', 'automatisering', ['webhook'], 'binnenkort', 'make', 'https://www.make.com'],
  ['n8n', 'n8n', 'automatisering', ['webhook', 'apikey'], 'binnenkort', 'n8n', 'https://n8n.io'],
  ['ifttt', 'IFTTT', 'automatisering', ['webhook'], 'binnenkort', 'ifttt', 'https://ifttt.com'],
  // — Підтримка —
  ['zendesk', 'Zendesk', 'support', ['oauth', 'apikey'], 'binnenkort', 'zendesk', 'https://www.zendesk.com'],
  ['intercom', 'Intercom', 'support', ['oauth'], 'binnenkort', 'intercom', 'https://www.intercom.com'],
  ['freshdesk', 'Freshdesk', 'support', ['apikey'], 'binnenkort', 'freshdesk', 'https://freshdesk.com'],
  // — Медіа —
  ['spotify', 'Spotify', 'media', ['oauth'], 'binnenkort', 'spotify', 'https://www.spotify.com'],
  ['plex', 'Plex', 'media', ['apikey'], 'binnenkort', 'plex', 'https://www.plex.tv'],
  ['jellyfin', 'Jellyfin', 'media', ['apikey'], 'binnenkort', 'jellyfin', 'https://jellyfin.org'],
  ['youtube-music', 'YouTube Music', 'media', ['oauth'], 'binnenkort', 'youtubemusic', 'https://music.youtube.com'],
  // — Сайти й магазини —
  ['wordpress', 'WordPress', 'webshop', ['apikey', 'webhook'], 'binnenkort', 'wordpress', 'https://wordpress.org'],
  ['shopify', 'Shopify', 'webshop', ['oauth', 'webhook'], 'binnenkort', 'shopify', 'https://www.shopify.com'],
  ['woocommerce', 'WooCommerce', 'webshop', ['apikey', 'webhook'], 'binnenkort', 'woocommerce', 'https://woocommerce.com'],
  ['mailchimp', 'Mailchimp', 'webshop', ['oauth', 'apikey'], 'binnenkort', 'mailchimp', 'https://mailchimp.com'],
  ['sendgrid', 'SendGrid', 'webshop', ['apikey'], 'binnenkort', 'sendgrid', 'https://sendgrid.com'],
  ['brevo', 'Brevo', 'webshop', ['apikey'], 'binnenkort', 'brevo', 'https://www.brevo.com'],
];

export const INTEGRATIES: readonly Integratie[] = Object.freeze(
  RIJEN.map(([id, naam, cat, methoden, status, logo, site, extra]) => {
    const c = ctg(cat);
    return Object.freeze({
      id, naam, cat, methoden: Object.freeze(methoden), status, logo, site,
      uk: extra?.uk ?? `${naam}: ${c.beschrijving[0].toLowerCase()}.`,
      nl: extra?.nl ?? `${naam}: ${c.beschrijving[1].toLowerCase()}.`,
      ...(extra?.doel ? { doel: extra.doel } : {}),
      ...(extra?.levend ? { levend: extra.levend } : {}),
    }) as Integratie;
  }),
);

export const METHODE_LABEL: Record<IntegratieMethode, readonly [string, string]> = {
  oauth: ['OAuth', 'OAuth'], apikey: ['Ключ API', 'API-sleutel'], webhook: ['Вебхук', 'Webhook'], mcp: ['MCP', 'MCP'], handmatig: ['Вручну', 'Handmatig'], scim: ['SCIM', 'SCIM'],
};
export const STATUS_LABEL: Record<IntegratieStatus, readonly [string, string]> = {
  klaar: ['Готово до підключення', 'Klaar om te koppelen'], instellen: ['Потребує налаштування', 'Instellen nodig'], binnenkort: ['Скоро', 'Binnenkort'],
};
export const integratie = (id: string) => INTEGRATIES.find((i) => i.id === id);
