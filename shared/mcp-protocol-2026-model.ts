// Модель протоколу MCP 2026-07-28 та подвійної підтримки епох (2025-11-25 + 2026-07-28).
// Чисті функції без мережі та бази даних: використовуються і на сервері (backend/mcp-protocol-2026.ts,
// backend/mcp-connector.ts, backend/connector-v2.ts, backend/mcp-inspector-routes.ts), і в клієнтському інтерфейсі
// вбудованого Інспектора та Студії MCP (src/agenten/McpInspectorStudio.tsx).

import { V2_AGENTEN, agentUrl, type AgentSlug } from './connector-v2/agenten';
import { V2_GROEPEN, type GroepId as Groep } from './connector-v2/catalogus';

export const MCP_MODERNE_VERSIE = '2026-07-28' as const;
export const MCP_LEGACY_VERSIE = '2025-11-25' as const;
export const MCP_ALLE_VERSIES = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const;
export type McpOndersteundeVersie = typeof MCP_ALLE_VERSIES[number];

export const MCP_ERA_MODI = ['auto', 'modern', 'legacy'] as const;
export type McpEraModus = typeof MCP_ERA_MODI[number];

export const MCP_RPC_FOUTCODES = Object.freeze({
  versieMismatch: -32020,
  capabilityOntbreekt: -32021,
  versieNietOndersteund: -32022,
  ongeldigeParams: -32602,
  methodeOnbekend: -32601,
  ongeldigVerzoek: -32600,
});

export const MCP_META_SLEUTELS = Object.freeze({
  protocolVersie: 'io.modelcontextprotocol/protocolVersion',
  clientMogelijkheden: 'io.modelcontextprotocol/clientCapabilities',
  logNiveau: 'io.modelcontextprotocol/logLevel',
});

export const MCP_LOG_NIVEAUS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'] as const;
export type McpLogNiveau = typeof MCP_LOG_NIVEAUS[number];

export type Taal = 'uk' | 'nl';

// ---------------------------------------------------------------- іконки груп для tools/list (R2)

const svgDataUri = (pad: string, kleur = '#3b82f6') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pad}</svg>`)}`;

export const GROEP_ICONEN: Record<Groep, { src: string; mimeType: string; sizes: string[] }> = {
  account: { src: svgDataUri('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>', '#ea580c'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  mail: { src: svgDataUri('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', '#2563eb'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  agenda: { src: svgDataUri('<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>', '#7c3aed'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  bestanden: { src: svgDataUri('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>', '#0284c7'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  bord: { src: svgDataUri('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>', '#4f46e5'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  ruimte: { src: svgDataUri('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', '#059669'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  apparaten: { src: svgDataUri('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>', '#6366f1'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  apps: { src: svgDataUri('<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>', '#8b5cf6'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  browser: { src: svgDataUri('<circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', '#0891b2'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  github: { src: svgDataUri('<circle cx="12" cy="12" r="9"/><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>', '#334155'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  media: { src: svgDataUri('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>', '#0d9488'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  betalingen: { src: svgDataUri('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>', '#16a34a'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  releases: { src: svgDataUri('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>', '#d97706'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
  server: { src: svgDataUri('<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>', '#dc2626'), mimeType: 'image/svg+xml', sizes: ['24x24'] },
};

const OPEN_WERELD_GROEPEN = new Set<Groep>(['mail', 'github', 'browser', 'apps', 'betalingen']);

export function verrijkToolAnnotaties(groep: Groep, soort: 'lezen' | 'schrijven' | 'wissen', bestaand?: Record<string, unknown>) {
  return {
    ...(bestaand ?? {}),
    readOnlyHint: soort === 'lezen',
    destructiveHint: soort === 'wissen' || Boolean(bestaand?.destructiveHint),
    idempotentHint: soort === 'lezen' || Boolean(bestaand?.idempotentHint),
    openWorldHint: OPEN_WERELD_GROEPEN.has(groep),
  };
}

export const WHOAMI_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['account', 'connection'],
  properties: {
    account: {
      type: 'object',
      required: ['email', 'name', 'role'],
      properties: {
        email: { type: ['string', 'null'] },
        name: { type: ['string', 'null'] },
        role: { type: ['string', 'null'] },
      },
    },
    connection: {
      type: 'object',
      required: ['agent', 'connector', 'client', 'granted', 'activeNow', 'technicalProfileActive'],
      properties: {
        agent: { type: 'string' },
        connector: { type: 'string' },
        client: { type: 'string' },
        grantedVia: { type: 'string' },
        granted: { type: 'array', items: { type: 'string' } },
        spaces: { type: 'array', items: { type: 'string' } },
        tools: { type: 'integer' },
        activeNow: { type: 'array', items: { type: 'string' } },
        technicalProfileActive: { type: 'boolean' },
      },
    },
  },
} as const;

// ---------------------------------------------------------------- розширення (Extensions, R6/R7/R9)

export type McpExtensieDef = {
  id: string;
  versie: string;
  status: 'stable' | 'beta';
  sep: string;
  standaardAan: boolean;
  risicoWaarschuwing: boolean;
  titel: Record<Taal, string>;
  samenvatting: Record<Taal, string>;
};

export const MCP_EXTENSIES: readonly McpExtensieDef[] = [
  {
    id: 'io.modelcontextprotocol/ui',
    versie: '2026-07-28',
    status: 'stable',
    sep: 'SEP-1865',
    standaardAan: false,
    risicoWaarschuwing: true,
    titel: { uk: 'Інтерактивні панелі (MCP Apps)', nl: 'Interactieve panelen (MCP Apps)' },
    samenvatting: {
      uk: 'Вбудовані інтерфейси ui:// (text/html;profile=mcp-app) із суворим CSP без зовнішніх сценаріїв для дошки задач, стану випусків та огляду служб.',
      nl: 'Ingebedde ui://-weergaven (text/html;profile=mcp-app) met strikt CSP zonder externe scripts voor takenbord, uitrolstand en dienstenoverzicht.',
    },
  },
  {
    id: 'io.modelcontextprotocol/tasks',
    versie: '2026-07-28',
    status: 'beta',
    sep: 'SEP-1686',
    standaardAan: true,
    risicoWaarschuwing: false,
    titel: { uk: 'Довготривалі операції (Tasks)', nl: 'Langlopende taken (Tasks)' },
    samenvatting: {
      uk: 'Асинхронні ручки задач із прив’язкою до користувача (<userId>:<handle>), відстеженням перебігу та безпечним скасуванням.',
      nl: 'Asynchrone taakhandvatten gebonden aan de gebruiker (<userId>:<handle>), voortgangsmeldingen en veilig annuleren.',
    },
  },
  {
    id: 'io.modelcontextprotocol/server-card',
    versie: '2026-07-28',
    status: 'beta',
    sep: 'SEP-2127',
    standaardAan: true,
    risicoWaarschuwing: false,
    titel: { uk: 'Картка сервера (Server Card)', nl: 'Serverkaart (Server Card)' },
    samenvatting: {
      uk: 'Попередній HTTP-опис можливостей, підтримуваних епох протоколу та OAuth 2.1 у /.well-known/mcp.json до встановлення з’єднання.',
      nl: 'Voorafgaande HTTP-beschrijving van mogelijkheden, ondersteunde protocol-tijdperken en OAuth 2.1 op /.well-known/mcp.json vóór het verbinden.',
    },
  },
  {
    id: 'io.modelcontextprotocol/skills',
    versie: '2026-07-28',
    status: 'beta',
    sep: 'SEP-2410',
    standaardAan: true,
    risicoWaarschuwing: false,
    titel: { uk: 'Навички агента через MCP (Skills over MCP)', nl: 'Agentvaardigheden via MCP (Skills over MCP)' },
    samenvatting: {
      uk: 'Публікація перевірених правил і робочих інструкцій платформи як структурованих ресурсів mr://skills/*.',
      nl: 'Publicatie van geverifieerde platformregels en werkinstructies als gestructureerde mr://skills/*-bronnen.',
    },
  },
];

// ---------------------------------------------------------------- навички агента (Skills over MCP)

export type McpVaardigheid = {
  id: string;
  uri: string;
  titel: Record<Taal, string>;
  beschrijving: Record<Taal, string>;
  inhoud: Record<Taal, string>;
};

export const MCP_VAARDIGHEDEN: readonly McpVaardigheid[] = [
  {
    id: 'movnyi-zakon',
    uri: 'mr://skills/movnyi-zakon',
    titel: { uk: 'Абсолютний мовний закон (uk + nl)', nl: 'Absolute taalwet (uk + nl)' },
    beschrijving: {
      uk: 'Правила двомовності платформи: чиста українська та нідерландська мови без суржику й англомовного жаргону.',
      nl: 'Tweetaligheidsregels van het platform: zuiver Oekraïens en Nederlands zonder jargon.',
    },
    inhoud: {
      uk: '# Навичка: Мовний закон Мій простір\n1. Використовуйте виключно чисту українську (`uk`) та нідерландську (`nl`) мови.\n2. Усі елементи інтерфейсу, описи інструментів та документація подаються двомовно.\n3. Технічні ідентифікатори протоколу залишаються незмінними за специфікацією.',
      nl: '# Vaardigheid: Taalwet Mijn Ruimte\n1. Gebruik uitsluitend zuiver Oekraïens (`uk`) en Nederlands (`nl`).\n2. Alle UI-elementen, hulpmiddelbeschrijvingen en documentatie zijn tweetalig.\n3. Technische protocol-identificaties blijven ongewijzigd volgens de specificatie.',
    },
  },
  {
    id: 'mijn-ruimte-orch',
    uri: 'mr://skills/mijn-ruimte-orch',
    titel: { uk: 'Оркестрація та безпечні випуски (ORCH-001 / TRACE-001)', nl: 'Orkestratie en veilige uitrollen (ORCH-001 / TRACE-001)' },
    beschrijving: {
      uk: 'Порядок реєстрації задачі, перевірки свіжості основи, пакування та підтвердження походження випуску.',
      nl: 'Werkwijze voor taakregistratie, versheidscontrole van de basis, pakketopbouw en herkomstverificatie.',
    },
    inhoud: {
      uk: '# Навичка: Оркестрація Mijn Ruimte\n1. Перевірте поточну встановлену версію через `/api/version`.\n2. Створюйте гілку від актуальної основи, щоб не перетерти попередні випуски.\n3. Кожен пакунок містить `ONTWIKKELARCHIEF.json` та публікується у GitHub Releases із точним SHA-256.',
      nl: '# Vaardigheid: Orkestratie Mijn Ruimte\n1. Controleer de huidige geïnstalleerde versie via `/api/version`.\n2. Maak een vertakking vanaf de actuele basis om eerdere uitgaven niet te overschrijven.\n3. Elk pakket bevat `ONTWIKKELARCHIEF.json` en wordt gepubliceerd in GitHub Releases met exacte SHA-256.',
    },
  },
  {
    id: 'mcp-beveiliging',
    uri: 'mr://skills/mcp-beveiliging',
    titel: { uk: 'Безпека MCP та OAuth 2.1 (Origin, CIMD, PKCE, простори)', nl: 'MCP- en OAuth 2.1-beveiliging (Origin, CIMD, PKCE, ruimtes)' },
    beschrijving: {
      uk: 'Захист від DNS-rebinding (Origin 403), SSRF у CIMD, прив’язка токенів до ресурсу й розділення приватного та технічного просторів.',
      nl: 'Bescherming tegen DNS-rebinding (Origin 403), SSRF in CIMD, tokenkoppeling aan de resource en scheiding tussen privé- en technische ruimte.',
    },
    inhoud: {
      uk: '# Навичка: Безпека MCP 2026-07-28\n1. Запити з недозволеним заголовком `Origin` відхиляються з кодом `403 ORIGIN_DENIED`.\n2. Документи метаданих клієнта (`CIMD`) завантажуються виключно через HTTPS із блокуванням приватних і локальних IP-адрес на рівні DNS.\n3. Відповіді `/authorize` завжди містять параметр `iss` (RFC 9207).\n4. Технічні інструменти (`_beheer`) працюють лише тоді, коли власник увімкнув технічний профіль.',
      nl: '# Vaardigheid: MCP-beveiliging 2026-07-28\n1. Verzoeken met een niet-toegestane `Origin`-kop worden geweigerd met `403 ORIGIN_DENIED`.\n2. Client-metadatadocumenten (`CIMD`) worden uitsluitend via HTTPS opgehaald met blokkering van privé- en loopback-IP-adressen op DNS-niveau.\n3. Antwoorden van `/authorize` bevatten altijd de parameter `iss` (RFC 9207).\n4. Technische hulpmiddelen (`_beheer`) werken alleen zolang het technische profiel van de eigenaar actief is.',
    },
  },
  {
    id: 'mcp-inspector-recepten',
    uri: 'mr://skills/mcp-inspector-recepten',
    titel: { uk: 'Перевірка серверів через MCP Inspector (Web / CLI / TUI / mcpdo)', nl: 'Servercontrole met MCP Inspector (Web / CLI / TUI / mcpdo)' },
    beschrijving: {
      uk: 'Практичні рецепти перевірки серверів у режимах legacy (2025-11-25), modern (2026-07-28) та auto.',
      nl: 'Praktische recepten voor servercontrole in de standen legacy (2025-11-25), modern (2026-07-28) en auto.',
    },
    inhoud: {
      uk: '# Навичка: Рецепти MCP Inspector\n1. Використовуйте `--protocol-era legacy` для перевірки класичного рукостискання `initialize`.\n2. Використовуйте `--protocol-era modern` для перевірки безстанового `server/discover` та `_meta`.\n3. Для живого робочого сервера застосовуйте прапорець `--stored-auth-only` та лише операції читання.',
      nl: '# Vaardigheid: MCP Inspector-recepten\n1. Gebruik `--protocol-era legacy` om de klassieke `initialize`-handshake te testen.\n2. Gebruik `--protocol-era modern` om staatloos `server/discover` en `_meta` te testen.\n3. Gebruik tegen de productieserver altijd `--stored-auth-only` en alleen-lezen-aanroepen.',
    },
  },
];

// ---------------------------------------------------------------- шаблони запитів / Prompts (R3)

export type McpPromptArg = {
  name: string;
  required: boolean;
  description: Record<Taal, string>;
};

export type McpPromptDef = {
  name: string;
  title: Record<Taal, string>;
  description: Record<Taal, string>;
  arguments: McpPromptArg[];
  bouwTekst: (args: Record<string, string>, taal: Taal) => string;
};

export const MCP_PROMPTS: readonly McpPromptDef[] = [
  {
    name: 'postvak_overzicht',
    title: { uk: 'Огляд пошти за період', nl: 'Postvakoverzicht per periode' },
    description: {
      uk: 'Підсумувати вхідні листи, виділити термінові повідомлення та запропонувати чернетки відповідей без автоматичного надсилання.',
      nl: 'Inkomende berichten samenvatten, urgente post markeren en conceptantwoorden voorstellen zonder automatisch te verzenden.',
    },
    arguments: [
      { name: 'account', required: false, description: { uk: 'Поштова скринька або мітка облікового запису', nl: 'Postvak of accountlabel' } },
      { name: 'periode', required: false, description: { uk: 'Період огляду: vandaag, gisteren або week', nl: 'Periode: vandaag, gisteren of week' } },
    ],
    bouwTekst: (args, taal) => {
      const acc = args.account || (taal === 'uk' ? 'основна скринька' : 'hoofdpostvak');
      const per = args.periode || 'vandaag';
      return taal === 'uk'
        ? `Перевір вхідні листи для «${acc}» за період «${per}». Згрупуй їх за пріоритетом, вкажи відправників і короткий зміст, а для листів, що потребують відповіді, запропонуй лише текст чернетки (не надсилай листи без мого підтвердження).`
        : `Controleer de inkomende berichten voor «${acc}» over de periode «${per}». Groepeer ze op prioriteit, noem afzenders en kerninhoud, en stel voor berichten die een antwoord vragen alleen een concepttekst voor (verstuur niets zonder mijn bevestiging).`;
    },
  },
  {
    name: 'afspraak_voorbereiden',
    title: { uk: 'Підготовка до зустрічі', nl: 'Afspraak voorbereiden' },
    description: {
      uk: 'Зібрати контекст із календаря, пов’язаних задач на дошці та останніх листів за темою зустрічі.',
      nl: 'Context verzamelen uit de agenda, gerelateerde bordtaken en recente berichten over het onderwerp van de afspraak.',
    },
    arguments: [
      { name: 'onderwerp', required: true, description: { uk: 'Тема або назва зустрічі', nl: 'Onderwerp of titel van de afspraak' } },
      { name: 'datum', required: false, description: { uk: 'Дата зустрічі (РРРР-ММ-ДД)', nl: 'Datum van de afspraak (JJJJ-MM-DD)' } },
    ],
    bouwTekst: (args, taal) => {
      const ond = args.onderwerp || (taal === 'uk' ? 'робоча зустріч' : 'werkoverleg');
      const dat = args.datum || (taal === 'uk' ? 'сьогодні' : 'vandaag');
      return taal === 'uk'
        ? `Підготуй стислу довідку до зустрічі «${ond}» (${dat}): знайди подію в календарі, відкриті задачі на дошці за цією темою та ключові домовленості.`
        : `Maak een beknopt overzicht voor de afspraak «${ond}» (${dat}): zoek de afspraak in de agenda, openstaande taken op het bord over dit onderwerp en de belangrijkste afspraken.`;
    },
  },
  {
    name: 'dienst_diagnose',
    title: { uk: 'Діагностика служби та простору ШІ', nl: 'Diagnose van dienst en AI-ruimte' },
    description: {
      uk: 'Перевірити поточний стан підключення ШІ, активного простору (приватний чи технічний), дозволів та останніх відмов у журналі.',
      nl: 'Controleer de actuele status van de AI-koppeling, de actieve ruimte (privé of technisch), rechten en recente weigeringen in het logboek.',
    },
    arguments: [
      { name: 'agent', required: false, description: { uk: 'Ідентифікатор агента (claude, gpt, gemini, antigravity…)', nl: 'Agent-slug (claude, gpt, gemini, antigravity…)' } },
      { name: 'ruimte', required: false, description: { uk: 'Простір перевірки: prive або technisch', nl: 'Te controleren ruimte: prive of technisch' } },
    ],
    bouwTekst: (args, taal) => {
      const ag = args.agent || 'claude';
      const rm = args.ruimte || 'prive';
      return taal === 'uk'
        ? `Виконай діагностику доступу для агента «${ag}» у просторі «${rm}»: виклич інструмент перевірки облікового запису (whoami), поясни, які сторони дозволені, скільки інструментів видимі зараз і що потрібно увімкнути на сторінці /agenten#agent/${ag}, якщо частина можливостей прихована.`
        : `Voer een toegangsdiagnose uit voor agent «${ag}» in ruimte «${rm}»: roep het account-hulpmiddel (whoami) aan, leg uit welke kanten zijn toegestaan, hoeveel hulpmiddelen nu zichtbaar zijn en wat op /agenten#agent/${ag} aangezet moet worden als mogelijkheden verborgen zijn.`;
    },
  },
  {
    name: 'uitrol_rapport',
    title: { uk: 'Звіт про підготовку випуску', nl: 'Rapport over uitrolvoorbereiding' },
    description: {
      uk: 'Перевірити свіжість бази оркестрації, стан черги інтеграції та відповідність вимогам TRACE-001 перед випуском пакета.',
      nl: 'Controleer de versheid van de orkestratiebasis, de integratiewachtrij en naleving van TRACE-001 vóór een pakketuitgave.',
    },
    arguments: [
      { name: 'taakId', required: true, description: { uk: 'Ідентифікатор задачі (наприклад MCP-001)', nl: 'Taak-ID (bijvoorbeeld MCP-001)' } },
      { name: 'versie', required: false, description: { uk: 'Очікувана версія випуску (РРРРММДД-ГГХХСС)', nl: 'Verwachte uitrolversie (JJJJMMDD-UUMMSS)' } },
    ],
    bouwTekst: (args, taal) => {
      const id = args.taakId || 'MCP-001';
      const v = args.versie || 'huidig';
      return taal === 'uk'
        ? `Підготуй підсумковий звіт готовності випуску для задачі «${id}» (версія «${v}»): звір базову фіксацію змін зі встановленою версією сервера, результати модульних тестів, наявність ONTWIKKELARCHIEF.json за TRACE-001 та подай пряме посилання на архів випуску в першому рядку.`
        : `Stel het eindrapport voor uitrolgereedheid op voor taak «${id}» (versie «${v}»): vergelijk de basiscommit met de geïnstalleerde serverversie, eenheidstests, aanwezigheid van ONTWIKKELARCHIEF.json volgens TRACE-001 en plaats de directe link naar het uitrolarchief op de eerste regel.`;
    },
  },
  {
    name: 'github_beoordeling',
    title: { uk: 'Розбір запиту на злиття або задачі GitHub', nl: 'Beoordeling van GitHub-PR of issue' },
    description: {
      uk: 'Проаналізувати зміни, перевірки безпеки, двомовність та відсутність регресій у запиті на злиття.',
      nl: 'Wijzigingen, beveiligingscontroles, tweetaligheid en afwezigheid van regressies in een samenvoegingsverzoek analyseren.',
    },
    arguments: [
      { name: 'repo', required: false, description: { uk: 'Сховище у форматі власник/назва', nl: 'Opslagplaats in het formaat eigenaar/naam' } },
      { name: 'nummer', required: true, description: { uk: 'Номер запиту на злиття або задачі', nl: 'Nummer van het samenvoegingsverzoek of issue' } },
    ],
    bouwTekst: (args, taal) => {
      const repo = args.repo || 'Tarasevych/hub';
      const nr = args.nummer || '1';
      return taal === 'uk'
        ? `Переглянь запит №${nr} у сховищі «${repo}»: оціни безпеку змін, сумісність із поточною встановленою версією сервера, покриття тестами та дотримання мовного закону.`
        : `Beoordeel item nr. ${nr} in opslagplaats «${repo}»: controleer de veiligheid van de wijzigingen, compatibiliteit met de geïnstalleerde serverversie, testdekking en naleving van de taalwet.`;
    },
  },
  {
    name: 'mcp_beveiligingsaudit',
    title: { uk: 'Аудит безпеки MCP та OAuth 2.1', nl: 'Beveiligingsaudit MCP en OAuth 2.1' },
    description: {
      uk: 'Комплексна перевірка кінцевої точки MCP на відповідність вимогам OAuth 2.1, PKCE S256, RFC 9728, RFC 9207, CIMD та захисту Origin.',
      nl: 'Volledige controle van het MCP-eindpunt op naleving van OAuth 2.1, PKCE S256, RFC 9728, RFC 9207, CIMD en Origin-bescherming.',
    },
    arguments: [
      { name: 'doel', required: false, description: { uk: 'Цільова адреса або агент (claude, antigravity, mcp…)', nl: 'Doeladres of agent (claude, antigravity, mcp…)' } },
      { name: 'era', required: false, description: { uk: 'Епоха протоколу: 2026-07-28, 2025-11-25 або auto', nl: 'Protocol-tijdperk: 2026-07-28, 2025-11-25 of auto' } },
    ],
    bouwTekst: (args, taal) => {
      const doel = args.doel || 'claude';
      const era = args.era || 'auto';
      return taal === 'uk'
        ? `Проведи перевірку безпеки кінцевої точки MCP «${doel}» у режимі епохи «${era}»: звір метадані захищеного ресурсу (RFC 9728), метадані сервера авторизації (RFC 8414), обов’язковість PKCE S256, присутність параметра iss (RFC 9207), захист Origin (403) і блокування приватних IP-адрес у CIMD.`
        : `Voer een beveiligingscontrole uit op MCP-eindpunt «${doel}» in tijdperkmodus «${era}»: controleer de Protected Resource Metadata (RFC 9728), Authorization Server Metadata (RFC 8414), verplichte PKCE S256, aanwezigheid van parameter iss (RFC 9207), Origin-bescherming (403) en blokkering van privé-IP-adressen bij CIMD.`;
    },
  },
];

// ---------------------------------------------------------------- шаблони SDK для створення серверів і клієнтів

export type McpSdkVoorbeeld = {
  taal: string;
  naam: string;
  pakket: string;
  repoUrl: string;
  serverCode: string;
  clientCode: string;
  samenvatting: Record<Taal, string>;
};

export const MCP_SDK_VOORBEELDEN: readonly McpSdkVoorbeeld[] = [
  {
    taal: 'typescript',
    naam: 'TypeScript / Node.js (@modelcontextprotocol/sdk)',
    pakket: '@modelcontextprotocol/sdk',
    repoUrl: 'https://github.com/modelcontextprotocol/typescript-sdk',
    samenvatting: {
      uk: 'Офіційний пакет SDK для Node.js і браузера з підтримкою Streamable HTTP, stdio, ресурсів, промптів та OAuth 2.1.',
      nl: 'Officiële SDK voor Node.js en browser met ondersteuning voor Streamable HTTP, stdio, bronnen, prompts en OAuth 2.1.',
    },
    serverCode: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'mijn-ruimte-eigen-server', version: '1.0.0' });
server.tool('status_opvragen', 'Повернути стан служби / Dienststatus opvragen', { dienst: z.string() }, async ({ dienst }) => ({
  content: [{ type: 'text', text: JSON.stringify({ dienst, status: 'gereed' }) }],
}));`,
    clientCode: `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.tarasevych.com/claude'));
const client = new Client({ name: 'mijn-ruimte-klant', version: '1.0.0' });
await client.connect(transport);
const tools = await client.listTools();`,
  },
  {
    taal: 'python',
    naam: 'Python (mcp / FastMCP)',
    pakket: 'mcp[cli]',
    repoUrl: 'https://github.com/modelcontextprotocol/python-sdk',
    samenvatting: {
      uk: 'Офіційний Python SDK (FastMCP) для швидкого створення локальних та віддалених серверів і клієнтів MCP.',
      nl: 'Officiële Python SDK (FastMCP) voor het snel bouwen van lokale en externe MCP-servers en -clients.',
    },
    serverCode: `from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MijnRuimteServer")

@mcp.tool()
def status_opvragen(dienst: str) -> dict:
    """Повернути стан служби / Dienststatus opvragen"""
    return {"dienst": dienst, "status": "gereed"}`,
    clientCode: `from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async with streamablehttp_client("https://mcp.tarasevych.com/claude") as (read, write, _):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()`,
  },
  {
    taal: 'go',
    naam: 'Go (modelcontextprotocol/go-sdk)',
    pakket: 'github.com/modelcontextprotocol/go-sdk/mcp',
    repoUrl: 'https://github.com/modelcontextprotocol/go-sdk',
    samenvatting: {
      uk: 'Офіційний Go SDK з високою швидкодією, строгою типізацією та вбудованим транспортом Streamable HTTP.',
      nl: 'Officiële Go SDK met hoge prestaties, strikte typering en ingebouwd Streamable HTTP-vervoer.',
    },
    serverCode: `package main
import (
  "context"
  "github.com/modelcontextprotocol/go-sdk/mcp"
)
func main() {
  srv := mcp.NewServer(&mcp.Implementation{Name: "mijn-ruimte-go", Version: "1.0.0"}, nil)
  _ = srv
}`,
    clientCode: `package main
import (
  "context"
  "github.com/modelcontextprotocol/go-sdk/mcp"
)
func main() {
  ctx := context.Background()
  client := mcp.NewClient(&mcp.Implementation{Name: "mijn-ruimte-go-klant", Version: "1.0.0"}, nil)
  _ = ctx; _ = client
}`,
  },
  {
    taal: 'rust',
    naam: 'Rust (rmcp / modelcontextprotocol/rust-sdk)',
    pakket: 'rmcp',
    repoUrl: 'https://github.com/modelcontextprotocol/rust-sdk',
    samenvatting: {
      uk: 'Офіційний Rust SDK на базі Tokio з макросами інструментів та безпечним керуванням пам’яттю.',
      nl: 'Officiële Rust SDK op basis van Tokio met hulpmiddelmacro’s en veilig geheugenbeheer.',
    },
    serverCode: `use rmcp::{ServerHandler, model::ServerInfo};
#[derive(Clone, Default)]
pub struct MijnRuimteDienst;
impl ServerHandler for MijnRuimteDienst {
    fn get_info(&self) -> ServerInfo { ServerInfo::default() }
}`,
    clientCode: `// Підключення через Streamable HTTP у Rust SDK (rmcp)
// Верифікація заголовків MCP-Protocol-Version: 2026-07-28`,
  },
];

// ---------------------------------------------------------------- рецепти MCP Inspector (R5 / R8)

export type McpInspectorRecept = {
  id: string;
  era: McpEraModus;
  methode: string;
  params: Record<string, unknown>;
  titel: Record<Taal, string>;
  uitleg: Record<Taal, string>;
  cliOpdracht: (doelUrl: string) => string;
  tuiOpdracht: (doelUrl: string) => string;
  mcpdoOpdracht: (doelUrl: string) => string;
};

export const MCP_INSPECTOR_RECEPTEN: readonly McpInspectorRecept[] = [
  {
    id: 'discover-modern',
    era: 'modern',
    methode: 'server/discover',
    params: {},
    titel: {
      uk: '1. Сучасне виявлення без стану (server/discover · 2026-07-28)',
      nl: '1. Moderne staatloze ontdekking (server/discover · 2026-07-28)',
    },
    uitleg: {
      uk: 'Перевіряє підтримувані версії протоколу, можливості (tools, resources, prompts, completions), розширення та час кешування ttlMs без створення сесії.',
      nl: 'Controleert ondersteunde protocolversies, mogelijkheden (tools, resources, prompts, completions), extensies en ttlMs zonder sessie-opbouw.',
    },
    cliOpdracht: (u) => `npx @modelcontextprotocol/inspector --cli ${u} --transport http --protocol-era modern --stored-auth-only --method server/discover --strict`,
    tuiOpdracht: (u) => `npx @modelcontextprotocol/inspector --tui ${u} --transport http --protocol-era modern --stored-auth-only`,
    mcpdoOpdracht: (u) => `npx @modelcontextprotocol/inspector mcpdo discover ${u} --protocol-era modern`,
  },
  {
    id: 'init-legacy',
    era: 'legacy',
    methode: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'mcp-inspector-studio', version: '2.0.0' } },
    titel: {
      uk: '2. Класичне рукостискання (initialize · 2025-11-25)',
      nl: '2. Klassieke handshake (initialize · 2025-11-25)',
    },
    uitleg: {
      uk: 'Перевіряє зворотну сумісність для клієнтів claude.ai, ChatGPT, Gemini та Cursor через класичний цикл initialize.',
      nl: 'Controleert achterwaartse compatibiliteit voor claude.ai, ChatGPT, Gemini en Cursor via de klassieke initialize-cyclus.',
    },
    cliOpdracht: (u) => `npx @modelcontextprotocol/inspector --cli ${u} --transport http --protocol-era legacy --stored-auth-only --method initialize --strict`,
    tuiOpdracht: (u) => `npx @modelcontextprotocol/inspector --tui ${u} --transport http --protocol-era legacy --stored-auth-only`,
    mcpdoOpdracht: (u) => `npx @modelcontextprotocol/inspector mcpdo info ${u} --protocol-era legacy`,
  },
  {
    id: 'tools-strict',
    era: 'auto',
    methode: 'tools/list',
    params: {},
    titel: {
      uk: '3. Сувора перевірка каталогу інструментів (tools/list --strict)',
      nl: '3. Strikte controle van de hulpmiddelencatalogus (tools/list --strict)',
    },
    uitleg: {
      uk: 'Перевіряє, що всі назви, описи параметрів (vertaalSchema), анотації (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) та іконки валідні за схемою.',
      nl: 'Controleert of alle namen, parameterbeschrijvingen (vertaalSchema), annotaties en iconen geldig zijn volgens het schema.',
    },
    cliOpdracht: (u) => `npx @modelcontextprotocol/inspector --cli ${u} --transport http --protocol-era auto --stored-auth-only --method tools/list --strict`,
    tuiOpdracht: (u) => `npx @modelcontextprotocol/inspector --tui ${u} --transport http --protocol-era auto --stored-auth-only`,
    mcpdoOpdracht: (u) => `npx @modelcontextprotocol/inspector mcpdo tools list ${u}`,
  },
  {
    id: 'resources-audit',
    era: 'modern',
    methode: 'resources/list',
    params: {},
    titel: {
      uk: '4. Перевірка ресурсів і навичок (resources/list + templates)',
      nl: '4. Controle van bronnen en vaardigheden (resources/list + templates)',
    },
    uitleg: {
      uk: 'Отримує список доступних URI-ресурсів mr://* та шаблонів ресурсів у межах поточного простору користувача.',
      nl: 'Haalt de lijst met beschikbare mr://*-bronnen en bronsjablonen op binnen de actuele ruimte van de gebruiker.',
    },
    cliOpdracht: (u) => `npx @modelcontextprotocol/inspector --cli ${u} --transport http --protocol-era modern --stored-auth-only --method resources/list --strict`,
    tuiOpdracht: (u) => `npx @modelcontextprotocol/inspector --tui ${u} --transport http --protocol-era modern --stored-auth-only`,
    mcpdoOpdracht: (u) => `npx @modelcontextprotocol/inspector mcpdo resources list ${u}`,
  },
  {
    id: 'prompts-audit',
    era: 'modern',
    methode: 'prompts/list',
    params: {},
    titel: {
      uk: '5. Перевірка двомовних шаблонів запитів (prompts/list)',
      nl: '5. Controle van tweetalige promptsjablonen (prompts/list)',
    },
    uitleg: {
      uk: 'Перевіряє двомовні шаблони запитів (пошта, зустрічі, діагностика, випуски, GitHub, аудит безпеки) та їхні аргументи.',
      nl: 'Controleert de tweetalige promptsjablonen (postvak, afspraken, diagnose, uitrollen, GitHub, beveiligingsaudit) en hun argumenten.',
    },
    cliOpdracht: (u) => `npx @modelcontextprotocol/inspector --cli ${u} --transport http --protocol-era modern --stored-auth-only --method prompts/list --strict`,
    tuiOpdracht: (u) => `npx @modelcontextprotocol/inspector --tui ${u} --transport http --protocol-era modern --stored-auth-only`,
    mcpdoOpdracht: (u) => `npx @modelcontextprotocol/inspector mcpdo prompts list ${u}`,
  },
  {
    id: 'whoami-call',
    era: 'modern',
    methode: 'tools/call',
    params: { name: 'v2_whoami', arguments: {} },
    titel: {
      uk: '6. Безпечний пробний виклик діагностики (tools/call → whoami)',
      nl: '6. Veilige proefaanroep van diagnose (tools/call → whoami)',
    },
    uitleg: {
      uk: 'Виконує безпечний виклик лише на читання, перевіряючи structuredContent, outputSchema та активний простір.',
      nl: 'Voert een veilige alleen-lezen-aanroep uit en controleert structuredContent, outputSchema en de actieve ruimte.',
    },
    cliOpdracht: (u) => `npx @modelcontextprotocol/inspector --cli ${u} --transport http --protocol-era modern --stored-auth-only --method tools/call --tool-name tonen_mijn_account_claude_ai_tarasevych_com_gebruiker --strict`,
    tuiOpdracht: (u) => `npx @modelcontextprotocol/inspector --tui ${u} --transport http --protocol-era modern --stored-auth-only`,
    mcpdoOpdracht: (u) => `npx @modelcontextprotocol/inspector mcpdo tools call ${u} tonen_mijn_account_claude_ai_tarasevych_com_gebruiker`,
  },
];

// ---------------------------------------------------------------- автодоповнення (completion/complete)

export function voltooiMcpArgument(
  ref: { type?: string; name?: string; uri?: string } | undefined,
  arg: { name?: string; value?: string } | undefined,
): { values: string[]; total: number; hasMore: boolean } {
  const naam = String(arg?.name ?? '').trim();
  const voorvoegsel = String(arg?.value ?? '').trim().toLowerCase();
  let kandidaten: string[] = [];
  if (naam === 'agent' || naam === 'slug' || naam === 'doel') {
    kandidaten = [...V2_AGENTEN.map((a) => a.slug), 'mcp'];
  } else if (naam === 'ruimte') {
    kandidaten = ['prive', 'technisch'];
  } else if (naam === 'periode') {
    kandidaten = ['vandaag', 'gisteren', 'week'];
  } else if (naam === 'era') {
    kandidaten = ['2026-07-28', '2025-11-25', 'auto'];
  } else if (naam === 'taal') {
    kandidaten = MCP_SDK_VOORBEELDEN.map((s) => s.taal);
  } else if (naam === 'id' || String(ref?.uri ?? '').includes('skills')) {
    kandidaten = MCP_VAARDIGHEDEN.map((v) => v.id);
  } else if (naam === 'repo') {
    kandidaten = ['Tarasevych/hub'];
  } else if (naam === 'taakId') {
    kandidaten = ['MCP-001', 'CLOUD-001', 'IDENTITEIT-010', 'GITHUB-012'];
  } else if (naam === 'dienst') {
    kandidaten = V2_GROEPEN.map((g) => g.id);
  }
  const gefilterd = voorvoegsel
    ? kandidaten.filter((k) => k.toLowerCase().startsWith(voorvoegsel))
    : kandidaten;
  const uniek = [...new Set(gefilterd)].slice(0, 50);
  return { values: uniek, total: uniek.length, hasMore: false };
}

// ---------------------------------------------------------------- перевірка сучасної епохи 2026-07-28 (_meta та заголовки)

export type ModerneVerzoekControle =
  | { ok: true; modern: boolean; versie: string; clientCapabilities: Record<string, unknown>; logNiveau: McpLogNiveau | null }
  | { ok: false; code: number; message: string; data?: Record<string, unknown> };

export function controleerModerneMeta(
  msg: Record<string, unknown> | null | undefined,
  headerProtocolVersie?: string,
): ModerneVerzoekControle {
  const params = (msg?.params && typeof msg.params === 'object' && !Array.isArray(msg.params))
    ? (msg.params as Record<string, unknown>)
    : {};
  const meta = (params._meta && typeof params._meta === 'object' && !Array.isArray(params._meta))
    ? (params._meta as Record<string, unknown>)
    : (msg?._meta && typeof msg._meta === 'object' && !Array.isArray(msg._meta))
      ? (msg._meta as Record<string, unknown>)
      : null;

  const metaVersie = meta && typeof meta[MCP_META_SLEUTELS.protocolVersie] === 'string'
    ? String(meta[MCP_META_SLEUTELS.protocolVersie]).trim()
    : '';
  const kopVersie = String(headerProtocolVersie ?? '').trim();

  if (metaVersie && kopVersie && metaVersie !== kopVersie) {
    return {
      ok: false,
      code: MCP_RPC_FOUTCODES.versieMismatch,
      message: `Невідповідність версії протоколу: заголовок MCP-Protocol-Version (${kopVersie}) не збігається з _meta (${metaVersie}) · Protocolversie verschilt: kop MCP-Protocol-Version (${kopVersie}) wijkt af van _meta (${metaVersie})`,
    };
  }

  const effectieveVersie = metaVersie || kopVersie;
  if (metaVersie && !(MCP_ALLE_VERSIES as readonly string[]).includes(metaVersie)) {
    return {
      ok: false,
      code: MCP_RPC_FOUTCODES.versieNietOndersteund,
      message: `Версія протоколу не підтримується: ${metaVersie} · Protocolversie niet ondersteund: ${metaVersie}`,
      data: { supported: [...MCP_ALLE_VERSIES] },
    };
  }

  const rawCaps = meta?.[MCP_META_SLEUTELS.clientMogelijkheden];
  const clientCapabilities = (rawCaps && typeof rawCaps === 'object' && !Array.isArray(rawCaps))
    ? (rawCaps as Record<string, unknown>)
    : {};

  const rawLog = meta?.[MCP_META_SLEUTELS.logNiveau];
  const logNiveau = typeof rawLog === 'string' && (MCP_LOG_NIVEAUS as readonly string[]).includes(rawLog)
    ? (rawLog as McpLogNiveau)
    : null;

  return {
    ok: true,
    modern: effectieveVersie === MCP_MODERNE_VERSIE || msg?.method === 'server/discover',
    versie: effectieveVersie || MCP_LEGACY_VERSIE,
    clientCapabilities,
    logNiveau,
  };
}

/** Додає поля сучасної епохи 2026-07-28 (resultType, ttlMs, cacheScope) до результату JSON-RPC. */
export function omhulModernResultaat(
  result: Record<string, unknown>,
  modern: boolean,
  opties?: { metCache?: boolean; ttlMs?: number },
): Record<string, unknown> {
  if (!modern) return result;
  return {
    ...result,
    resultType: (result.resultType as string | undefined) ?? 'complete',
    ...(opties?.metCache
      ? {
        ttlMs: opties.ttlMs ?? 60_000,
        cacheScope: 'private',
      }
      : {}),
  };
}

// ---------------------------------------------------------------- Server Card (ext-server-card) та server.json (MCP Registry)

export function bouwServerCard(baseUrl: string, slug?: AgentSlug) {
  const agent = slug ? V2_AGENTEN.find((a) => a.slug === slug) : null;
  const endpoint = slug ? agentUrl(slug) : `${baseUrl}/mcp`;
  return {
    $schema: 'https://modelcontextprotocol.io/schemas/2026-07-28/server-card.json',
    name: slug ? `com.tarasevych/mijn-ruimte-${slug}` : 'com.tarasevych/mijn-ruimte',
    title: agent ? `Mijn Ruimte · ${agent.naam}` : 'Mijn Ruimte · Мій простір',
    description: 'Власноруч розміщена платформа «Мій простір · Mijn Ruimte» з підтримкою MCP 2026-07-28 та 2025-11-25, OAuth 2.1 (PKCE S256, CIMD, RFC 9728, RFC 9207) і розмежуванням приватного та технічного просторів.',
    version: '2.0.0',
    endpoint,
    transport: 'streamable-http',
    supportedProtocolVersions: [...MCP_ALLE_VERSIES],
    authentication: {
      type: 'oauth2',
      resourceMetadataUrl: slug
        ? `${baseUrl}/.well-known/oauth-protected-resource/${slug}`
        : `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
      authorizationServerMetadataUrl: `${baseUrl}/.well-known/oauth-authorization-server/oauth2`,
      pkceRequired: true,
      codeChallengeMethodsSupported: ['S256'],
      clientIdMetadataDocumentSupported: true,
      dynamicClientRegistrationSupported: true,
      authorizationResponseIssParameterSupported: true,
    },
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      completions: {},
      logging: {},
      extensions: Object.fromEntries(MCP_EXTENSIES.map((e) => [e.id, { version: e.versie, status: e.status }])),
    },
    endpoints: V2_AGENTEN.map((a) => ({
      agent: a.slug,
      name: a.naam,
      url: agentUrl(a.slug),
      prmUrl: `${baseUrl}/.well-known/oauth-protected-resource/${a.slug}`,
    })),
  };
}

export function bouwRegistryServerJson(baseUrl: string) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json',
    name: 'com.tarasevych/mijn-ruimte',
    title: 'Mijn Ruimte · Мій простір',
    description: 'Власноруч розміщена платформа «Мій простір · Mijn Ruimte» з окремими кінцевими точками MCP для кожного агента, OAuth 2.1 (PKCE S256 і CIMD), подвійною епохою протоколу (2026-07-28 і 2025-11-25) та вбудованим інспектором. Zelfgehost platform met eigen MCP-eindpunten per agent.',
    version: '2.0.0',
    websiteUrl: baseUrl,
    remotes: [
      ...V2_AGENTEN.map((a) => ({
        type: 'streamable-http',
        url: agentUrl(a.slug),
      })),
      {
        type: 'streamable-http',
        url: `${baseUrl}/mcp`,
      },
    ],
  };
}
