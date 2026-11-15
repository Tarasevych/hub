// Спільне чисте ядро для окремих Telegram-ботів кожного ШІ-агента та надійної черги доставлення пам’яті.
// Без Node, без DOM: працює однаково на сервері, у браузері та в модульних випробуваннях.
import type { AiRuimte } from '../ai-ruimte';
import { bevatGevoeligGeheim, filterGeheimePatronen, GEHEUGEN_FOUTEN } from './model';

export const BOT_STATUSSEN = ['in_afwachting', 'actief', 'gepauzeerd', 'ingetrokken'] as const;
export type BotStatus = typeof BOT_STATUSSEN[number];

export const BERICHT_SOORTEN = ['gebeurtenis', 'besluit', 'overdracht', 'rapport', 'bestand', 'gesprek'] as const;
export type BerichtSoort = typeof BERICHT_SOORTEN[number];

export const BEZORGING_STATUSSEN = ['wachtrij', 'verzonden', 'mislukt', 'overgeslagen'] as const;
export type BezorgingStatus = typeof BEZORGING_STATUSSEN[number];

export interface AgentProfielSjabloon {
  slug: string;
  dienstNaam: string;
  weergaveNaam: string;
  beschrijvingUk: string;
  beschrijvingNl: string;
  avatarKleur: string;
  standaardActies: readonly string[];
}

// Типові профілі для 15+ популярних ШІ-агентів і помічників; будь-які власні профілі також дозволені.
export const AGENT_PROFIEL_CATALOGUS: readonly AgentProfielSjabloon[] = Object.freeze([
  {
    slug: 'claude',
    dienstNaam: 'Anthropic Claude',
    weergaveNaam: 'Claude',
    beschrijvingUk: 'Помічник для глибокого розбору завдань, коду й документів.',
    beschrijvingNl: 'Assistent voor diepgaande analyse van taken, code en documenten.',
    avatarKleur: '#c26d3a',
    standaardActies: ['besluit', 'overdracht', 'rapport'],
  },
  {
    slug: 'codex',
    dienstNaam: 'OpenAI Codex',
    weergaveNaam: 'Codex',
    beschrijvingUk: 'Автономний інженер-виконавець змін у коді й перевірок.',
    beschrijvingNl: 'Zelfstandige code-uitvoerder voor wijzigingen en controles.',
    avatarKleur: '#2563eb',
    standaardActies: ['gebeurtenis', 'overdracht', 'rapport', 'bestand'],
  },
  {
    slug: 'gemini',
    dienstNaam: 'Google Gemini',
    weergaveNaam: 'Gemini',
    beschrijvingUk: 'Мультимодальний помічник для досліджень, інтерфейсу та планів.',
    beschrijvingNl: 'Multimodale assistent voor onderzoek, interface en planning.',
    avatarKleur: '#0f766e',
    standaardActies: ['gebeurtenis', 'besluit', 'rapport'],
  },
  {
    slug: 'chatgpt',
    dienstNaam: 'OpenAI ChatGPT',
    weergaveNaam: 'ChatGPT',
    beschrijvingUk: 'Універсальний співрозмовник для ідей, текстів і координації.',
    beschrijvingNl: 'Veelzijdige gesprekspartner voor ideeën, teksten en afstemming.',
    avatarKleur: '#059669',
    standaardActies: ['besluit', 'gesprek', 'rapport'],
  },
  {
    slug: 'antigravity',
    dienstNaam: 'Google Antigravity',
    weergaveNaam: 'Antigravity',
    beschrijvingUk: 'Середовище багатоагентної розробки й перевірки збірок.',
    beschrijvingNl: 'Omgeving voor samenwerking van meerdere agenten en bouwcontroles.',
    avatarKleur: '#4f46e5',
    standaardActies: ['gebeurtenis', 'besluit', 'overdracht', 'rapport'],
  },
  {
    slug: 'grok',
    dienstNaam: 'xAI Grok',
    weergaveNaam: 'Grok',
    beschrijvingUk: 'Швидкий аналітичний помічник для перевірки гіпотез.',
    beschrijvingNl: 'Snelle analytische assistent voor het toetsen van aannames.',
    avatarKleur: '#475569',
    standaardActies: ['gebeurtenis', 'rapport', 'gesprek'],
  },
  {
    slug: 'copilot',
    dienstNaam: 'GitHub Copilot',
    weergaveNaam: 'Copilot',
    beschrijvingUk: 'Помічник редактора для підказок, огляду коду та виправлень.',
    beschrijvingNl: 'Editor-assistent voor suggesties, code-overzicht en herstel.',
    avatarKleur: '#1d4ed8',
    standaardActies: ['gebeurtenis', 'overdracht', 'bestand'],
  },
  {
    slug: 'cursor',
    dienstNaam: 'Cursor Agent',
    weergaveNaam: 'Cursor',
    beschrijvingUk: 'Агент локального редактора коду для покрокових змін.',
    beschrijvingNl: 'Lokale editor-agent voor stapsgewijze codewijzigingen.',
    avatarKleur: '#334155',
    standaardActies: ['gebeurtenis', 'overdracht', 'rapport'],
  },
  {
    slug: 'perplexity',
    dienstNaam: 'Perplexity',
    weergaveNaam: 'Perplexity',
    beschrijvingUk: 'Дослідник джерел і збору перевірених фактів.',
    beschrijvingNl: 'Onderzoeker voor bronnen en het verzamelen van geverifieerde feiten.',
    avatarKleur: '#0e7490',
    standaardActies: ['rapport', 'gesprek'],
  },
  {
    slug: 'mistral',
    dienstNaam: 'Mistral Le Chat',
    weergaveNaam: 'Mistral',
    beschrijvingUk: 'Європейський ШІ для структурованих оглядів і перекладів.',
    beschrijvingNl: 'Europese AI voor gestructureerde overzichten en vertalingen.',
    avatarKleur: '#d97706',
    standaardActies: ['besluit', 'rapport', 'gesprek'],
  },
  {
    slug: 'deepseek',
    dienstNaam: 'DeepSeek',
    weergaveNaam: 'DeepSeek',
    beschrijvingUk: 'Модель для алгоритмічних розрахунків і порівнянь.',
    beschrijvingNl: 'Model voor algoritmische berekeningen en vergelijkingen.',
    avatarKleur: '#2563eb',
    standaardActies: ['rapport', 'gesprek'],
  },
  {
    slug: 'qwen',
    dienstNaam: 'Alibaba Qwen',
    weergaveNaam: 'Qwen',
    beschrijvingUk: 'Технічний помічник для обробки великих документів.',
    beschrijvingNl: 'Technische assistent voor het verwerken van grote documenten.',
    avatarKleur: '#7c3aed',
    standaardActies: ['rapport', 'bestand', 'gesprek'],
  },
  {
    slug: 'llama',
    dienstNaam: 'Meta Llama (локально)',
    weergaveNaam: 'Llama',
    beschrijvingUk: 'Локальна модель для автономної роботи без зовнішньої хмари.',
    beschrijvingNl: 'Lokaal model voor zelfstandig werk zonder externe cloud.',
    avatarKleur: '#0284c7',
    standaardActies: ['gebeurtenis', 'gesprek'],
  },
  {
    slug: 'cline',
    dienstNaam: 'Cline',
    weergaveNaam: 'Cline',
    beschrijvingUk: 'Помічник автоматизації сценаріїв і перевірок у робочому дереві.',
    beschrijvingNl: 'Assistent voor het automatiseren van scripts en controles in de werkboom.',
    avatarKleur: '#0d9488',
    standaardActies: ['gebeurtenis', 'overdracht', 'rapport'],
  },
  {
    slug: 'windsurf',
    dienstNaam: 'Windsurf Cascade',
    weergaveNaam: 'Windsurf',
    beschrijvingUk: 'Агент потокового редагування файлів і міжмодульних завдань.',
    beschrijvingNl: 'Agent voor doorlopende bestandsbewerking en module-overstijgende taken.',
    avatarKleur: '#0891b2',
    standaardActies: ['gebeurtenis', 'overdracht', 'bestand'],
  },
  {
    slug: 'autoclaw',
    dienstNaam: 'AutoClaw (Z.ai / GLM)',
    weergaveNaam: 'AutoClaw',
    beschrijvingUk: 'Правничий і координаційний агент із дослівною перевіркою джерел.',
    beschrijvingNl: 'Juridische en coördinatie-agent met letterlijke broncontrole.',
    avatarKleur: '#2563eb',
    standaardActies: ['gebeurtenis', 'besluit', 'overdracht', 'rapport'],
  },
  {
    slug: 'devin',
    dienstNaam: 'Cognition Devin',
    weergaveNaam: 'Devin',
    beschrijvingUk: 'Автономний хмарний інженер для тривалих циклів розробки й тестування.',
    beschrijvingNl: 'Zelfstandige cloud-engineer voor langere bouw- en testcycli.',
    avatarKleur: '#4338ca',
    standaardActies: ['gebeurtenis', 'overdracht', 'rapport', 'bestand'],
  },
  {
    slug: 'opencode',
    dienstNaam: 'OpenCode CLI / IDE',
    weergaveNaam: 'OpenCode',
    beschrijvingUk: 'Відкритий термінальний і IDE-агент для командних змін коду.',
    beschrijvingNl: 'Open terminal- en IDE-agent voor codewijzigingen.',
    avatarKleur: '#1e293b',
    standaardActies: ['gebeurtenis', 'overdracht', 'rapport', 'bestand'],
  },
]);

export const BOT_STATUS_META: Record<BotStatus, { uk: string; nl: string }> = {
  in_afwachting: { uk: 'Очікує перевірки', nl: 'Wacht op controle' },
  actief: { uk: 'Активний', nl: 'Actief' },
  gepauzeerd: { uk: 'Призупинено', nl: 'Gepauzeerd' },
  ingetrokken: { uk: 'Відкликано', nl: 'Ingetrokken' },
};

export const BERICHT_SOORT_META: Record<BerichtSoort, { uk: string; nl: string }> = {
  gebeurtenis: { uk: 'Подія', nl: 'Gebeurtenis' },
  besluit: { uk: 'Рішення', nl: 'Besluit' },
  overdracht: { uk: 'Передача завдання', nl: 'Taakoverdracht' },
  rapport: { uk: 'Звіт', nl: 'Rapport' },
  bestand: { uk: 'Файл / посилання', nl: 'Bestand / verwijzing' },
  gesprek: { uk: 'Підсумок розмови', nl: 'Gesprekssamenvatting' },
};

export const BEZORGING_STATUS_META: Record<BezorgingStatus, { uk: string; nl: string }> = {
  wachtrij: { uk: 'У черзі', nl: 'In wachtrij' },
  verzonden: { uk: 'Доставлено', nl: 'Bezorgd' },
  mislukt: { uk: 'Помилка доставлення', nl: 'Bezorging mislukt' },
  overgeslagen: { uk: 'Пропущено', nl: 'Overgeslagen' },
};

export const BOT_FOUTEN = {
  ...GEHEUGEN_FOUTEN,
  botNietGevonden: 'BOT_NIET_GEVONDEN',
  sleutelOntbreekt: 'BOT_SLEUTEL_ONTBREEKT',
  sleutelOngeldig: 'BOT_SLEUTEL_ONGELDIG',
  gepauzeerd: 'BOT_GEPAUZEERD',
  ingetrokken: 'BOT_INGETROKKEN',
  geenPublicatierecht: 'BOT_GEEN_PUBLICATIERECHT',
  soortNietToegestaan: 'BOT_SOORT_NIET_TOEGESTAAN',
  chatOngeldig: 'BOT_CHAT_ONGELDIG',
  forumVereist: 'BOT_FORUM_VEREIST',
  telegramFout: 'BOT_TELEGRAM_FOUT',
  bezorgingNietGevonden: 'BEZORGING_NIET_GEVONDEN',
  reedsVerzonden: 'BEZORGING_REEDS_VERZONDEN',
} as const;

export const BOT_FOUT_TEKSTEN: Readonly<Record<string, { uk: string; nl: string }>> = {
  [BOT_FOUTEN.botNietGevonden]: {
    uk: 'Бота для цього агента ще не налаштовано в активному просторі.',
    nl: 'Er is voor deze agent nog geen bot ingesteld in de actieve ruimte.',
  },
  [BOT_FOUTEN.sleutelOntbreekt]: {
    uk: 'Вкажіть токен бота Telegram (від @BotFather), щоб перевірити чи активувати підключення.',
    nl: 'Geef eerst een Telegram-botsleutel (via @BotFather) op om de koppeling te testen of te activeren.',
  },
  [BOT_FOUTEN.sleutelOngeldig]: {
    uk: 'Формат токена бота некоректний або Telegram відхилив ключ.',
    nl: 'De vorm van de botsleutel is ongeldig of Telegram heeft de sleutel geweigerd.',
  },
  [BOT_FOUTEN.gepauzeerd]: {
    uk: 'Бот цього агента призупинено — надсилання нових повідомлень заблоковано.',
    nl: 'De bot van deze agent is gepauzeerd — nieuwe berichten worden niet verzonden.',
  },
  [BOT_FOUTEN.ingetrokken]: {
    uk: 'Бот цього агента відкликано — публікація заборонена.',
    nl: 'De bot van deze agent is ingetrokken — publiceren is geblokkeerd.',
  },
  [BOT_FOUTEN.geenPublicatierecht]: {
    uk: 'Бот не має підтвердженого права публікації в групі чи темі (спершу запустіть перевірку підключення).',
    nl: 'De bot heeft geen bevestigd publicatierecht in de groep of het onderwerp (voer eerst de koppelingscontrole uit).',
  },
  [BOT_FOUTEN.soortNietToegestaan]: {
    uk: 'Обраний вид повідомлення заборонено налаштуваннями цього бота.',
    nl: 'Het gekozen berichttype is uitgeschakeld in de instellingen van deze bot.',
  },
  [BOT_FOUTEN.chatOngeldig]: {
    uk: 'Вкажіть чинний ідентифікатор групи або каналу Telegram (chat_id).',
    nl: 'Geef een geldig chat-id van de Telegram-groep of het kanaal op.',
  },
  [BOT_FOUTEN.forumVereist]: {
    uk: 'Задано номер теми (thread_id), але вказана група Telegram не ввімкнена як форум із темами.',
    nl: 'Er is een onderwerpnummer (thread_id) opgegeven, maar deze Telegram-groep is geen forum met onderwerpen.',
  },
  [BOT_FOUTEN.telegramFout]: {
    uk: 'Telegram не зміг прийняти повідомлення. Запис збережено в черзі для безпечного повтору без дублювання.',
    nl: 'Telegram kon het bericht niet verwerken. Het item blijft in de wachtrij bewaard voor herhaling zonder dubbels.',
  },
  [BOT_FOUTEN.bezorgingNietGevonden]: {
    uk: 'Запис доставлення не знайдено в цьому просторі.',
    nl: 'Het bezorgitem is in deze ruimte niet gevonden.',
  },
  [BOT_FOUTEN.reedsVerzonden]: {
    uk: 'Це повідомлення вже успішно доставлено до Telegram.',
    nl: 'Dit bericht is al succesvol in Telegram bezorgd.',
  },
};

export interface BestandsVerwijzing {
  naam: string;
  verwijzing: string;
  sha256?: string;
  grootte?: number;
}

export interface GeheugenAgentBot {
  id: string;
  ruimte: AiRuimte;
  agentSlug: string;
  dienstNaam: string;
  weergaveNaam: string;
  beschrijving: string;
  avatarKleur: string;
  sleutelAanwezig: boolean;
  sleutelMasker: string;
  botId: string;
  botUsername: string;
  botNaam: string;
  chatId: string;
  threadId: number | null;
  toegestaneActies: string[];
  toegestaneBerichtSoorten: BerichtSoort[];
  status: BotStatus;
  kanPubliceren: boolean;
  laatsteFout: string;
  laatstGecontroleerdOp?: number;
  laatsteBerichtId?: number;
  laatsteBerichtOp?: number;
  aangemaaktOp: number;
  bijgewerktOp: number;
}

export interface GeheugenTelegramBezorging {
  id: string;
  ruimte: AiRuimte;
  botId?: string;
  agentSlug: string;
  taakId: string;
  sessieId: string;
  knoopId?: string;
  vorigeBezorgingId?: string;
  soortBericht: BerichtSoort;
  idempotentieSleutel: string;
  titel: string;
  samenvatting: string;
  bestandsVerwijzingen: BestandsVerwijzing[];
  telegramChatId: string;
  telegramThreadId: number | null;
  telegramBerichtId: number | null;
  status: BezorgingStatus;
  pogingen: number;
  laatsteFout: string;
  aangemaaktOp: number;
  bijgewerktOp: number;
  verzondenOp?: number;
}

const AGENT_SLUG_RE = /^[a-z0-9][a-z0-9._:-]{1,47}$/;
const BOT_SLEUTEL_RE = /^[0-9]{3,20}:[A-Za-z0-9_-]{20,80}$/;
const CHAT_ID_RE = /^(?:-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;

export function isGeldigeAgentSlug(raw: unknown): boolean {
  return typeof raw === 'string' && AGENT_SLUG_RE.test(raw.trim());
}

export function schoonAgentSlug(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 48);
  return AGENT_SLUG_RE.test(s) ? s : '';
}

export function isGeldigBotSleutelFormaat(raw: unknown): boolean {
  return typeof raw === 'string' && BOT_SLEUTEL_RE.test(raw.trim());
}

export function maskeerBotSleutel(sleutelAanwezig: boolean, rawToken?: string | null): string {
  if (!sleutelAanwezig) return '';
  if (typeof rawToken === 'string' && rawToken.trim().length >= 8) {
    return `••••${rawToken.trim().slice(-4)}`;
  }
  return '••••';
}

export function schoonBotStatus(raw: unknown): BotStatus {
  return (BOT_STATUSSEN as readonly string[]).includes(String(raw)) ? (raw as BotStatus) : 'in_afwachting';
}

export function schoonBerichtSoort(raw: unknown): BerichtSoort {
  return (BERICHT_SOORTEN as readonly string[]).includes(String(raw)) ? (raw as BerichtSoort) : 'gebeurtenis';
}

export function schoonBerichtSoortLijst(raw: unknown): BerichtSoort[] {
  if (!Array.isArray(raw)) return [...BERICHT_SOORTEN];
  const uit = raw
    .map((x) => String(x ?? '').trim())
    .filter((x): x is BerichtSoort => (BERICHT_SOORTEN as readonly string[]).includes(x));
  return uit.length > 0 ? [...new Set(uit)] : [...BERICHT_SOORTEN];
}

export function schoonToegestaneActies(raw: unknown): string[] {
  const bron = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n;]+/) : [];
  const uit: string[] = [];
  for (const item of bron) {
    const schoon = String(item ?? '').trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').slice(0, 48);
    if (!schoon || uit.includes(schoon)) continue;
    uit.push(schoon);
    if (uit.length >= 32) break;
  }
  return uit;
}

export function schoonChatId(raw: unknown): string {
  const s = String(raw ?? '').trim().slice(0, 80);
  if (!s) return '';
  return CHAT_ID_RE.test(s) ? s : '';
}

export function schoonThreadId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

export function isGeldigChatId(raw: unknown): boolean {
  return typeof raw === 'string' && CHAT_ID_RE.test(raw.trim());
}

export function vindStandaardAgentProfiel(slug: string): AgentProfielSjabloon | undefined {
  return AGENT_PROFIEL_CATALOGUS.find((p) => p.slug === slug);
}

export function valideerBestandsVerwijzingen(
  raw: unknown,
): { ok: true; items: BestandsVerwijzing[] } | { ok: false; code: string } {
  if (raw === undefined || raw === null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer };
  const uit: BestandsVerwijzing[] = [];
  for (const r of raw.slice(0, 20)) {
    if (!r || typeof r !== 'object') return { ok: false, code: BOT_FOUTEN.ongeldigeInvoer };
    const rec = r as Record<string, unknown>;
    const naam = String(rec.naam ?? '').trim().slice(0, 160);
    const verwijzing = String(rec.verwijzing ?? '').trim().slice(0, 500);
    if (!naam || !verwijzing) continue;
    if (bevatGevoeligGeheim(naam) || bevatGevoeligGeheim(verwijzing)) {
      return { ok: false, code: BOT_FOUTEN.geheimGeweigerd };
    }
    const sha = typeof rec.sha256 === 'string' && SHA256_RE.test(rec.sha256.trim()) ? rec.sha256.trim().toLowerCase() : undefined;
    const grootte = typeof rec.grootte === 'number' && Number.isFinite(rec.grootte) && rec.grootte >= 0
      ? Math.floor(rec.grootte)
      : undefined;
    uit.push({ naam, verwijzing, ...(sha ? { sha256: sha } : {}), ...(grootte !== undefined ? { grootte } : {}) });
  }
  return { ok: true, items: uit };
}

export function maakTelegramBerichtTekst(invoer: {
  ruimte: AiRuimte;
  agentSlug: string;
  taakId: string;
  soortBericht: BerichtSoort;
  titel: string;
  samenvatting: string;
  bestandsVerwijzingen: BestandsVerwijzing[];
  vorigeBezorgingId?: string;
}): string {
  const meta = BERICHT_SOORT_META[invoer.soortBericht];
  const ruimteLabel = invoer.ruimte === 'technisch' ? 'Технічний / Technisch' : 'Приватний / Privé';
  const regels: string[] = [
    `[${invoer.agentSlug}] ${meta.uk} / ${meta.nl}`,
    `Простір / Ruimte: ${ruimteLabel}`,
  ];
  if (invoer.taakId) regels.push(`Завдання / Taak: ${filterGeheimePatronen(invoer.taakId)}`);
  if (invoer.vorigeBezorgingId) regels.push(`Попередня передача / Vorige overdracht: ${invoer.vorigeBezorgingId}`);
  regels.push('', filterGeheimePatronen(invoer.titel.trim()));
  if (invoer.samenvatting.trim()) {
    regels.push('', filterGeheimePatronen(invoer.samenvatting.trim()));
  }
  if (invoer.bestandsVerwijzingen.length > 0) {
    regels.push('', 'Файли та посилання / Bestanden en verwijzingen:');
    for (const f of invoer.bestandsVerwijzingen.slice(0, 12)) {
      const hashTekst = f.sha256 ? ` [sha256:${f.sha256.slice(0, 12)}]` : '';
      regels.push(`• ${filterGeheimePatronen(f.naam)} — ${filterGeheimePatronen(f.verwijzing)}${hashTekst}`);
    }
  }
  return regels.join('\n').slice(0, 3900);
}
