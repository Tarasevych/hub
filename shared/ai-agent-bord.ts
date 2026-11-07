// Дошка підключення ШІ (ai.tarasevych.com) і стеля доступності сайту.
//
// Каталог — це KLANTEN із shared/ai-verbinding.ts, без вигаданих виробників і без «overig».
// Спосіб з’являється на картці лише якщо цей клієнт його справді має. Двері сервера (/Grok, /claude)
// сюди не входять: вони належать технічному простору (mcp.*/verbindingen).
//
// Адміністративні перемикачі (app.ai_site_schakelaars) можуть лише звузити приватний простір.
// Відсутній рядок = увімкнено (як до цього). Явне false = вимкнено для кожного приватного користувача.
// Технічний простір цими перемикачами не керується. Підписана політика ШІ лишається вищою стелею.
// Пуро: браузер і сервер читають один каталог.

import { CAPABILITIES, capabilityForTool, type CapabilityInfo } from './ai-beleid/catalogus';
import { KLANTEN, klantVan, type KlantId } from './ai-verbinding';
import { OUD_GEDEELD_URL } from './connector-v2/agenten';
import { isBeheerPagina } from './beheer-paginas';
import { toolInRuimte, type AiRuimte } from './ai-ruimte';

export type MethodeId = 'mcp' | 'token';
export type ConnectMethode = MethodeId | 'deur';
export type TabId = 'kaart' | 'mcp' | 'token' | 'toegang' | 'umovy';
export type BordKlantId = Exclude<KlantId, 'overig'>;

/** Het oude gedeelde adres. Sinds 20.10.2026 heeft elke agent zijn eigen adres (agentUrl); dit blijft alleen antwoorden (308). */
export const MCP_URL = OUD_GEDEELD_URL;

/** Можливості, яких приватне підключення не отримує ніколи (керування сайтом і сервером). */
const TECH_CAPS = new Set(['server.read', 'deploy.status', 'deploy.release', 'policy.change']);

export type BordAgent = {
  id: BordKlantId;
  naam: string;
  kan: string;
  toegang: string;
  methoden: readonly MethodeId[];
  /** Сторінка виробника, якщо вона вже є в продукті. null = одноразового переходу немає. */
  vendorUrl: string | null;
  mcpUk: string;
  tokenUk: string;
};

const TOEGANG = 'Лише ваш приватний простір: пристрої, пошта, календар, Drive, дошка й нотатки. Керування сайтом, сервером і випусками цьому підключенню недоступне.';

export const BORD_AGENTEN: readonly BordAgent[] = Object.freeze([
  {
    id: 'claude', naam: 'Claude',
    kan: 'Працює у вашому просторі через конектор MCP: читає й виконує лише ті дії, які ви дозволите.',
    toegang: TOEGANG, methoden: ['mcp', 'token'],
    vendorUrl: 'https://claude.ai/settings/connectors',
    mcpUk: 'Claude → Settings → Connectors → Add custom connector. Вставте адресу конектора; client id і secret не потрібні — сайт реєструє клієнта сам. Claude відкриє сайт, щоб ви підтвердили доступ.',
    tokenUk: 'Токен консолі (префікс tvh_) вставляється в заголовок Authorization. Він діє 30 днів і бачить лише ваш простір.',
  },
  {
    id: 'grok', naam: 'Grok',
    kan: 'Підключається як клієнт MCP до вашого простору.',
    toegang: TOEGANG, methoden: ['mcp', 'token'], vendorUrl: null,
    mcpUk: 'Додайте віддалений MCP-сервер у Grok і вставте адресу конектора. Одноразової сторінки виробника в продукті немає: Grok сам почне підтвердження доступу на сайті.',
    tokenUk: 'Якщо клієнт приймає Bearer-токен, випустіть його тут і вставте в заголовок Authorization.',
  },
  {
    id: 'chatgpt', naam: 'ChatGPT',
    kan: 'Підключається як клієнт MCP до вашого простору.',
    toegang: TOEGANG, methoden: ['mcp', 'token'], vendorUrl: null,
    mcpUk: 'Додайте конектор MCP у ChatGPT і вставте адресу. Одноразового переходу на сторінку виробника в продукті немає.',
    tokenUk: 'Токен консолі — для клієнта, який приймає заголовок Authorization: Bearer.',
  },
  {
    id: 'gemini', naam: 'Gemini',
    kan: 'Gemini є в каталозі клієнтів, але сайт не приймає його адресу повернення, і одноразової сторінки виробника немає.',
    toegang: TOEGANG, methoden: [], vendorUrl: null, mcpUk: '', tokenUk: '',
  },
  {
    id: 'copilot', naam: 'Copilot',
    kan: 'Працює з вашим простором через MCP у VS Code.',
    toegang: TOEGANG, methoden: ['mcp', 'token'], vendorUrl: null,
    mcpUk: 'VS Code → команда «MCP: Add Server» → HTTP → вставте адресу конектора.',
    tokenUk: 'Токен консолі можна передати як Bearer, якщо сервер MCP у VS Code це приймає.',
  },
  {
    id: 'cursor', naam: 'Cursor',
    kan: 'Працює з вашим простором через MCP у Cursor.',
    toegang: TOEGANG, methoden: ['mcp', 'token'], vendorUrl: null,
    mcpUk: 'Cursor → Settings → MCP → Add new MCP server (тип HTTP) → вставте адресу. Cursor сам відкриє сайт для підтвердження.',
    tokenUk: 'Токен консолі — запасний спосіб, якщо клієнт просить заголовок Authorization.',
  },
  {
    id: 'antigravity', naam: 'Antigravity',
    kan: 'Працює з вашим простором через власну MCP-адресу /antigravity та двосторонній плагін Google Antigravity.',
    toegang: TOEGANG, methoden: ['mcp', 'token'], vendorUrl: 'https://idx.google.com',
    mcpUk: 'Antigravity → плагін Mijn Ruimte або ~/.gemini/settings.json (mcpServers) → вставте адресу /antigravity.',
    tokenUk: 'Токен консолі передається як Bearer або змінна MIJN_RUIMTE_TOKEN для мосту mijn-ruimte.',
  },
  {
    id: 'autoclaw', naam: 'AutoClaw',
    kan: 'Працює з вашим простором через власну MCP-адресу /autoclaw та моделі Z.ai (зокрема GLM-5.3-flashX-Legal для правничої перевірки договорів і джерел).',
    toegang: TOEGANG, methoden: ['mcp', 'token'], vendorUrl: 'https://autoclaw.z.ai',
    mcpUk: 'AutoClaw Desktop → налаштування MCP (mcp.json) або міст mijn-ruimte → вставте адресу /autoclaw.',
    tokenUk: 'Ключ доступу консолі передається як Bearer або змінна MIJN_RUIMTE_TOKEN для мосту mijn-ruimte.',
  },
]);

const BORD_MAP = new Map(BORD_AGENTEN.map((a) => [a.id, a]));
export const isBordKlant = (v: unknown): v is BordKlantId => typeof v === 'string' && BORD_MAP.has(v as BordKlantId);
export const bordKaart = (id: KlantId): BordAgent | null => (isBordKlant(id) ? BORD_MAP.get(id)! : null);

export type CapKaart = Pick<CapabilityInfo, 'id' | 'group' | 'label' | 'hint'>;
export const PRIVE_CAPS: readonly CapKaart[] = Object.freeze(
  CAPABILITIES.filter((c) => !c.ownerOnly && !TECH_CAPS.has(c.id)).map((c) => ({ id: c.id, group: c.group, label: c.label, hint: c.hint })),
);
const PRIVE_CAP_SET = new Set(PRIVE_CAPS.map((c) => c.id));
export const isPriveCap = (id: string) => PRIVE_CAP_SET.has(id);

export type SiteStaat = {
  agent: Partial<Record<BordKlantId, boolean>>;
  methode: Partial<Record<MethodeId, boolean>>;
  cap: Partial<Record<string, boolean>>;
};
export const STANDAARD_STAAT: SiteStaat = { agent: {}, methode: {}, cap: {} };

const AGENT_SLEUTEL = /^agent:(grok|claude|chatgpt|gemini|copilot|cursor|antigravity|autoclaw)$/;
const METHODE_SLEUTEL = /^methode:(mcp|token)$/;
const CAP_SLEUTEL = /^cap:[a-z][a-z0-9.]{1,40}$/;

export function isSiteSleutel(sleutel: string): boolean {
  if (AGENT_SLEUTEL.test(sleutel) || METHODE_SLEUTEL.test(sleutel)) return true;
  return CAP_SLEUTEL.test(sleutel) && PRIVE_CAP_SET.has(sleutel.slice(4));
}

export function staatVanRijen(rijen: readonly { sleutel?: unknown; aan?: unknown }[]): SiteStaat {
  const staat: SiteStaat = { agent: {}, methode: {}, cap: {} };
  for (const rij of rijen) {
    const sleutel = String(rij.sleutel || '');
    if (!isSiteSleutel(sleutel) || typeof rij.aan !== 'boolean') continue;
    if (sleutel.startsWith('agent:')) staat.agent[sleutel.slice(6) as BordKlantId] = rij.aan;
    else if (sleutel.startsWith('methode:')) staat.methode[sleutel.slice(8) as MethodeId] = rij.aan;
    else staat.cap[sleutel.slice(4)] = rij.aan;
  }
  return staat;
}

export const agentAan = (staat: SiteStaat, id: BordKlantId) => staat.agent[id] !== false;
export const methodeAan = (staat: SiteStaat, id: MethodeId) => staat.methode[id] !== false;

/** Вкладки картки: лише те, що клієнт підтримує і що адміністратор не вимкнув для всіх. */
export function tabsVoor(id: KlantId, staat: SiteStaat = STANDAARD_STAAT): TabId[] {
  const kaart = bordKaart(id);
  if (!kaart || !agentAan(staat, kaart.id)) return ['kaart'];
  const tabs: TabId[] = ['kaart'];
  if (kaart.methoden.includes('mcp') && methodeAan(staat, 'mcp')) tabs.push('mcp');
  if (kaart.methoden.includes('token') && methodeAan(staat, 'token')) tabs.push('token');
  tabs.push('toegang', 'umovy');
  return tabs;
}

export type WeigerCode = 'DEUR_VERBODEN' | 'AGENT_UIT' | 'METHODE_NIET' | 'METHODE_UIT' | 'CAP_TECHNISCH' | 'CAP_UIT' | 'CAP_GEBRUIKER';
export type Weigering = { code: WeigerCode };

/**
 * Чи можна видати приватне підключення. Технічний простір не ріжеться цими перемикачами.
 * «overig» лишає старий шлях токена/OAuth, доки адміністратор не вимкнув сам спосіб.
 */
export function connectGeweigerd(staat: SiteStaat, vraag: { ruimte: AiRuimte; klant: KlantId; methode: ConnectMethode }): Weigering | null {
  if (vraag.ruimte !== 'prive') return null;
  if (vraag.methode === 'deur') return { code: 'DEUR_VERBODEN' };
  if (staat.methode[vraag.methode] === false) return { code: 'METHODE_UIT' };
  if (vraag.klant === 'overig') return null;
  if (!agentAan(staat, vraag.klant)) return { code: 'AGENT_UIT' };
  const kaart = bordKaart(vraag.klant);
  if (!kaart || !kaart.methoden.includes(vraag.methode)) return { code: 'METHODE_NIET' };
  return null;
}

export function klantUit(value: unknown, naam: string): KlantId {
  if (typeof value === 'string' && KLANTEN.some((k) => k.id === value)) return value as KlantId;
  return klantVan(naam);
}

/**
 * Відмова інструмента приватного підключення. Технічні інструменти відмовляються завжди.
 * Можливість поза приватним каталогом тут не чіпається: її вже відсікає простір або політика.
 */
export function toolGeweigerd(staat: SiteStaat, vraag: { ruimte: AiRuimte; tool: string; klant: KlantId; gebruiker?: Partial<Record<string, boolean>> }): Weigering | null {
  if (vraag.ruimte !== 'prive') return null;
  if (!toolInRuimte(vraag.tool, 'prive')) return { code: 'CAP_TECHNISCH' };
  const cap = capabilityForTool(vraag.tool);
  if (!cap || !PRIVE_CAP_SET.has(cap)) return null;
  if (staat.cap[cap] === false) return { code: 'CAP_UIT' };
  if (vraag.gebruiker && vraag.gebruiker[cap] === false) return { code: 'CAP_GEBRUIKER' };
  return null;
}

export type McpIngang = { service: 'mcp'; tab: 'agents'; hash: string } | null;
const NAAR_HUB = new Set(['', 'overview', 'connect']);

/**
 * Куди вести закладку mcp.* (19.10.2026, хаб «Підключення ШІ»): mcp.tarasevych.com/agents — єдине місце для всього про доступ ШІ, для КОЖНОГО
 * (і з технічним профілем, і без). Звідси більше нічого не перенаправляється. mcp.tarasevych.com/verbindingen («Технічні підключення») → вкладка
 * хаба #technisch; огляд/«Підключити» → хаб. Сторінки управління лишаються. Приватний користувач з інших не-управлінських вкладок
 * (інструменти, дошка, пісочниця…) — теж у хаб (раніше: ai.tarasevych.com/verbindingen, яка тепер сама веде сюди).
 * `consent` і `extensie` лишаються в підписі для сумісності: agents не перенаправляється за жодних умов.
 */
export function mcpIngang(tab: string, technisch: boolean, _consent = false, _extensie = false): McpIngang {
  const t = String(tab || '');
  if (t === 'agents') return null;
  if (t === 'verbindingen') return { service: 'mcp', tab: 'agents', hash: 'technisch' };
  if (isBeheerPagina('mcp', t)) return null;
  if (NAAR_HUB.has(t)) return { service: 'mcp', tab: 'agents', hash: '' };
  if (technisch) return null;
  return { service: 'mcp', tab: 'agents', hash: '' };
}

/** ai.tarasevych.com/verbindingen (vroegere hub met #bord/#connectors/#tech) → tab van de hub op mcp.tarasevych.com/agents. */
export function aiVerbindingenNaar(hash: string): string {
  const h = String(hash || '').replace(/^#/, '').split(/[/?]/)[0];
  return h === 'connectors' ? 'connectors' : h === 'tech' ? 'technisch' : 'ai';
}

export const SITE_REGEL = {
  uk: 'Якщо тут вимкнено, жоден користувач — навіть окремо — цього доступу не отримає.',
  nl: 'Staat dit uit, dan krijgt geen enkele gebruiker — ook niet apart — deze toegang.',
} as const;

/** Умови, які сайт уже вимагає. Окремих URL умов виробника в продукті немає. */
export const SITE_UMOVY = [
  'Підписана політика ШІ власника — стеля. Читання лишається читанням. Ця дошка політику не послаблює.',
  'Приватне підключення бачить лише простір цього користувача. Інструменти сайту й сервера йому не віддаються.',
  'Схвалення випуску, відкат, резервні копії, зміна політики й секретів лишаються лише на сайті, з ключем власника.',
  'Умови виробника ШІ ви приймаєте на його боці, коли додаєте конектор. Сайт їх не підміняє.',
] as const;
