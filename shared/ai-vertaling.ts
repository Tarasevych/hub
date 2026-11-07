import { ruimteOf, RUIMTE_GESCHEIDEN, type AiRuimte } from './ai-ruimte';
import type { GecontroleerdPunt } from './ai-bronnen';

/** 'acties' (pakket 3 «Adaptive Mail Canvas»): «Що від вас потрібно?» — punten met een letterlijke bron, zie shared/ai-bronnen.ts. */
export type AiVertalingMode = 'translate' | 'summary' | 'purpose' | 'context' | 'acties';
export type AiVertalingSummaryDepth = 'brief' | 'detailed' | 'actions' | 'timeline';
export type AiVertalingScope = 'mail.read' | 'files.read';

export type AiVertalingTaal = {
  code: string;
  labelUk: string;
  nativeLabel: string;
};

export const AI_VERTALING_TALEN: readonly AiVertalingTaal[] = [
  { code: 'uk', labelUk: 'Українська', nativeLabel: 'Українська' },
  { code: 'en', labelUk: 'Англійська', nativeLabel: 'English' },
  { code: 'nl', labelUk: 'Нідерландська', nativeLabel: 'Nederlands' },
  { code: 'de', labelUk: 'Німецька', nativeLabel: 'Deutsch' },
  { code: 'fr', labelUk: 'Французька', nativeLabel: 'Français' },
  { code: 'pl', labelUk: 'Польська', nativeLabel: 'Polski' },
  { code: 'es', labelUk: 'Іспанська', nativeLabel: 'Español' },
  { code: 'it', labelUk: 'Італійська', nativeLabel: 'Italiano' },
  { code: 'pt', labelUk: 'Португальська', nativeLabel: 'Português' },
  { code: 'cs', labelUk: 'Чеська', nativeLabel: 'Čeština' },
  { code: 'sk', labelUk: 'Словацька', nativeLabel: 'Slovenčina' },
  { code: 'ro', labelUk: 'Румунська', nativeLabel: 'Română' },
  { code: 'bg', labelUk: 'Болгарська', nativeLabel: 'Болгарська' },
  { code: 'lt', labelUk: 'Литовська', nativeLabel: 'Lietuvių' },
  { code: 'lv', labelUk: 'Латвійська', nativeLabel: 'Latviešu' },
  { code: 'et', labelUk: 'Естонська', nativeLabel: 'Eesti' },
  { code: 'sv', labelUk: 'Шведська', nativeLabel: 'Svenska' },
  { code: 'no', labelUk: 'Норвезька', nativeLabel: 'Norsk' },
  { code: 'da', labelUk: 'Данська', nativeLabel: 'Dansk' },
  { code: 'fi', labelUk: 'Фінська', nativeLabel: 'Suomi' },
  { code: 'tr', labelUk: 'Турецька', nativeLabel: 'Türkçe' },
  { code: 'el', labelUk: 'Грецька', nativeLabel: 'Ελληνικά' },
  { code: 'hu', labelUk: 'Угорська', nativeLabel: 'Magyar' },
  { code: 'hr', labelUk: 'Хорватська', nativeLabel: 'Hrvatski' },
  { code: 'ja', labelUk: 'Японська', nativeLabel: '日本語' },
  { code: 'ko', labelUk: 'Корейська', nativeLabel: '한국어' },
  { code: 'zh', labelUk: 'Китайська', nativeLabel: '中文' },
  { code: 'ar', labelUk: 'Арабська', nativeLabel: 'العربية' },
  { code: 'he', labelUk: 'Іврит', nativeLabel: 'עברית' },
  { code: 'hi', labelUk: 'Гінді', nativeLabel: 'हिन्दी' },
];

export const AI_VERTALING_MODES: ReadonlyArray<{ id: AiVertalingMode; labelUk: string; descriptionUk: string }> = [
  {
    id: 'translate',
    labelUk: 'Перекласти',
    descriptionUk: 'Переклад на місці зі збереженням розмітки, абзаців і можливості миттєво повернути оригінал.',
  },
  {
    id: 'summary',
    labelUk: 'Короткий підсумок',
    descriptionUk: 'Витяг головного: ключові факти, дати, суми та подальші кроки.',
  },
  {
    id: 'purpose',
    labelUk: 'Що це за документ, про що, для чого і чому',
    descriptionUk: 'Пояснення призначення листа й вкладень простою мовою: контекст, намір і очікувана дія.',
  },
  {
    id: 'context',
    labelUk: 'Контекст і зв’язки',
    descriptionUk: 'Історія гілки та пов’язані листи з ваших підключених скриньок із причинно-наслідковими зв’язками та цитатами.',
  },
  {
    id: 'acties',
    labelUk: 'Що від вас потрібно?',
    descriptionUk: 'Що треба зробити або відповісти: кожен пункт із дослівним джерелом у листі («лист 3 · §3»), терміни звірено з оригіналом.',
  },
];

/** Een brief zoals de browser hem nummert (1 = oudste in het gesprek) en als platte tekst meestuurt voor modus 'acties'. */
export type AiVertalingBronBericht = { brief: number; from: string; receivedAt: number; tekst: string };

export const AI_VERTALING_SUMMARY_DEPTHS: ReadonlyArray<{ id: AiVertalingSummaryDepth; labelUk: string }> = [
  { id: 'brief', labelUk: 'Стисло' },
  { id: 'detailed', labelUk: 'Детально' },
  { id: 'actions', labelUk: 'Пункти дій' },
  { id: 'timeline', labelUk: 'Хронологія' },
];

export type AiVertalingInstellingen = {
  defaultLang: string;
  recentLangs: string[];
  defaultAgentId: string;
  summaryDepth: AiVertalingSummaryDepth;
  crossMailboxContext: boolean;
  includeAttachments: boolean;
};

export const STANDAARD_AI_VERTALING_INSTELLINGEN: AiVertalingInstellingen = {
  defaultLang: 'uk',
  recentLangs: ['uk', 'en', 'nl'],
  defaultAgentId: '',
  summaryDepth: 'brief',
  crossMailboxContext: true,
  includeAttachments: true,
};

export function normalizeAiVertalingTaal(raw: unknown, fallback = 'uk'): string {
  const code = String(raw ?? '').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 16);
  if (!code) return fallback;
  return code;
}

export function taalLabelUk(code: string): string {
  const clean = normalizeAiVertalingTaal(code, 'uk');
  const found = AI_VERTALING_TALEN.find(item => item.code === clean);
  return found ? found.labelUk : clean.toUpperCase();
}

export function normalizeAiVertalingInstellingen(
  raw: Partial<AiVertalingInstellingen> | null | undefined,
  current: AiVertalingInstellingen = STANDAARD_AI_VERTALING_INSTELLINGEN,
): AiVertalingInstellingen {
  const src = raw && typeof raw === 'object' ? raw : {};
  const defaultLang = normalizeAiVertalingTaal(src.defaultLang ?? current.defaultLang, 'uk');
  const rawRecent = Array.isArray(src.recentLangs) ? src.recentLangs : current.recentLangs;
  const recentSet: string[] = [];
  for (const item of [defaultLang, ...rawRecent]) {
    const c = normalizeAiVertalingTaal(item, '');
    if (c && !recentSet.includes(c)) recentSet.push(c);
    if (recentSet.length >= 6) break;
  }
  if (!recentSet.length) recentSet.push('uk', 'en', 'nl');
  const depthRaw = String(src.summaryDepth ?? current.summaryDepth);
  const summaryDepth: AiVertalingSummaryDepth =
    depthRaw === 'brief' || depthRaw === 'detailed' || depthRaw === 'actions' || depthRaw === 'timeline'
      ? depthRaw
      : current.summaryDepth;
  const defaultAgentId = String(src.defaultAgentId ?? current.defaultAgentId ?? '').trim().slice(0, 120);
  const crossMailboxContext =
    typeof src.crossMailboxContext === 'boolean' ? src.crossMailboxContext : current.crossMailboxContext;
  const includeAttachments =
    typeof src.includeAttachments === 'boolean' ? src.includeAttachments : current.includeAttachments;
  return {
    defaultLang,
    recentLangs: recentSet,
    defaultAgentId,
    summaryDepth,
    crossMailboxContext,
    includeAttachments,
  };
}

export type AiVertalingSegment = {
  id: string;
  text: string;
};

export type AiVertalingBlockState = {
  originalHtml: string;
  segments: AiVertalingSegment[];
  templateHtml: string;
};

const SKIP_HTML_TAGS = new Set(['script', 'style', 'noscript', 'code', 'pre', 'svg', 'math', 'textarea']);

/**
 * Extracts translatable text segments from an HTML string or plain text while preserving
 * all HTML tags, attributes, whitespace prefixes/suffixes, and layout structure.
 * Never mutates the original input.
 */
export function extractLayoutPreservingSegments(htmlOrText: string, prefix = 'seg'): AiVertalingBlockState {
  const originalHtml = String(htmlOrText ?? '');
  if (!originalHtml.trim()) {
    return { originalHtml, segments: [], templateHtml: originalHtml };
  }
  const segments: AiVertalingSegment[] = [];
  let counter = 0;

  // Tokenize by HTML tags vs text nodes, tracking whether we are inside a skipped tag
  const tagRegex = /(<\/?([a-zA-Z0-9-]+)(?:\s[^>]*)?>|<!--[\s\S]*?-->)/g;
  const skipStack: string[] = [];
  let lastIndex = 0;
  let templateHtml = '';
  let match: RegExpExecArray | null;

  const processTextChunk = (chunk: string) => {
    if (!chunk || skipStack.length > 0) {
      templateHtml += chunk;
      return;
    }
    // Preserve HTML entities and leading/trailing whitespace
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(chunk);
    if (!m) {
      templateHtml += chunk;
      return;
    }
    const [, lead, core, trail] = m;
    const decodedCore = decodeBasicHtmlEntities(core).replace(/\s+/g, ' ').trim();
    if (!decodedCore) {
      templateHtml += chunk;
      return;
    }
    const id = `${prefix}:${counter++}`;
    segments.push({ id, text: decodedCore });
    templateHtml += `${lead}%%AI_SEG_${id}%%${trail}`;
  };

  while ((match = tagRegex.exec(originalHtml)) !== null) {
    const textBefore = originalHtml.slice(lastIndex, match.index);
    processTextChunk(textBefore);

    const fullTag = match[1];
    const tagName = (match[2] || '').toLowerCase();
    if (tagName && SKIP_HTML_TAGS.has(tagName)) {
      if (fullTag.startsWith('</')) {
        const idx = skipStack.lastIndexOf(tagName);
        if (idx !== -1) skipStack.splice(idx, 1);
      } else if (!fullTag.endsWith('/>')) {
        skipStack.push(tagName);
      }
    }
    templateHtml += fullTag;
    lastIndex = match.index + fullTag.length;
  }

  if (lastIndex < originalHtml.length) {
    processTextChunk(originalHtml.slice(lastIndex));
  }

  return { originalHtml, segments, templateHtml };
}

/**
 * Applies translated segments onto a layout-preserving state or restores the exact original HTML
 * when `active` is false.
 */
export function renderLayoutPreservingTranslation(
  state: AiVertalingBlockState,
  translations: Record<string, string>,
  active: boolean,
): string {
  if (!active) return state.originalHtml;
  let result = state.templateHtml;
  for (const seg of state.segments) {
    const translated = translations[seg.id];
    const replacement = typeof translated === 'string' && translated.trim() ? translated.trim() : seg.text;
    const placeholder = `%%AI_SEG_${seg.id}%%`;
    result = result.split(placeholder).join(escapeBasicHtmlEntities(replacement));
  }
  return result;
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function escapeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type SanitizedPayloadReport = {
  text: string;
  strippedTrackingPixels: number;
  strippedTrackingParams: number;
  redactedSecrets: number;
};

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-ant-[a-zA-Z0-9_-]{12,}\b/g,
  /\bsk-(?:proj-|live-|test-)?[a-zA-Z0-9_-]{16,}\b/g,
  /\btvh_[a-zA-Z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[a-zA-Z0-9]{16,}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{25,}\b/g,
  /\bya29\.[0-9A-Za-z_-]{20,}\b/g,
  /\bxox[baprs]-[0-9A-Za-z-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /\b(?:password|пароль|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"]?([^\s'",;]{6,})['"]?/gi,
];

const TRACKING_IMG_REGEX = /<img\b[^>]*>/gi;
const TRACKING_URL_PARAMS = /\b(?:utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid|mkt_tok|vero_id|_hsenc|_hsmi|rb_clickid)=[^&\s"'<>]+/gi;

/**
 * Strips 1x1 / hidden tracking pixels, beacon images, marketing tracking query parameters,
 * and redacts secrets/tokens/keys before any user text or HTML is sent to an AI agent.
 */
export function stripTrackingAndSecrets(input: string): SanitizedPayloadReport {
  let text = String(input ?? '');
  let strippedTrackingPixels = 0;
  let strippedTrackingParams = 0;
  let redactedSecrets = 0;

  text = text.replace(TRACKING_IMG_REGEX, imgTag => {
    const lower = imgTag.toLowerCase();
    const isOneByOne =
      /\b(?:width|height)\s*=\s*['"]?(?:0|1)(?:px)?['"]?/i.test(imgTag) ||
      /style\s*=\s*['"][^'"]*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*(?:0|1)px)/i.test(imgTag);
    const isBeaconUrl =
      /(?:open\.|pixel\.|track\.|beacon\.|analytics\.|mailtrack\.|list-manage\.com\/track|sendgrid\.net\/wf\/open|mailgun\.org\/o\/)/i.test(lower);
    if (isOneByOne || isBeaconUrl) {
      strippedTrackingPixels += 1;
      return '';
    }
    return imgTag;
  });

  // Pakket 3 (24.10.2026): vroeger ruimde `.replace(/[?&](?=['"\s<>]|$)/g, '')` ELK «?» of «&» vóór een spatie op — ook in
  // gewone zinnen («Kunt u dit bevestigen? En …» → «bevestigen En»): de vertaling verloor haar vraagtekens en een letterlijk
  // citaat klopte niet meer. Nu krijgt elke weggehaalde parameter een merkteken, en alleen dáár wordt «?»/«&» opgeruimd.
  const MERK = '\u0000';
  text = text.replace(/\u0000/g, '').replace(TRACKING_URL_PARAMS, () => {
    strippedTrackingParams += 1;
    return MERK;
  });
  if (strippedTrackingParams) text = text.replace(/\u0000&/g, '').replace(/[?&]\u0000/g, '').replace(/\u0000/g, '');

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, match => {
      redactedSecrets += 1;
      if (/^(?:password|пароль|secret|api[_-]?key|access[_-]?token|client[_-]?secret)/i.test(match)) {
        const keyPart = match.split(/[:=]/)[0] || 'secret';
        return `${keyPart}: [ПРИХОВАНО_СЕКРЕТ]`;
      }
      return '[ПРИХОВАНО_СЕКРЕТ]';
    });
  }

  return {
    text,
    strippedTrackingPixels,
    strippedTrackingParams,
    redactedSecrets,
  };
}

export type AiVertalingAgentInfo = {
  id: string;
  name: string;
  platform: string;
  source: 'oauth' | 'console' | 'agent' | 'vault';
  ruimte: AiRuimte;
  scopes: AiVertalingScope[];
  allowedMailRead: boolean;
  allowedFilesRead: boolean;
  statusUk: string;
};

export type AiVertalingToegangCheckInput = {
  userId: string;
  agent: {
    id: string;
    name: string;
    ruimte?: unknown;
    scopes?: readonly string[];
    revoked?: boolean;
  } | null;
  requiredScope: AiVertalingScope;
  includeAttachments?: boolean;
  policyCeiling: 'always' | 'ask' | 'off';
  attachmentPolicyCeiling?: 'always' | 'ask' | 'off';
  userBlocked?: boolean;
};

export type AiVertalingToegangResult =
  | {
      allowed: true;
      ruimte: 'prive';
      agentId: string;
      effectiveScopes: AiVertalingScope[];
    }
  | {
      allowed: false;
      code:
        | 'AGENT_NOT_SELECTED'
        | 'AGENT_REVOKED'
        | 'SPACE_SEPARATED'
        | 'POLICY_CEILING_OFF'
        | 'USER_AI_BLOCKED'
        | 'SCOPE_MISSING_MAIL_READ'
        | 'SCOPE_MISSING_FILES_READ';
      spaceError?: string;
      messageUk: string;
      actionLabelUk: string;
      actionHref: string;
    };

export const AI_TOEGANG_HREF = '/ai';

/**
 * Enforces privacy & access boundaries before any personal mail or document data leaves:
 * 1. User AI not blocked by admin.
 * 2. Agent exists, is active, and belongs strictly to `AiRuimte = 'prive'` (rejects `'technisch'` with `SPACE_SEPARATED`).
 * 3. Signed owner/admin AI policy ceiling allows the capability (`mail.read` / `files.read`).
 * 4. Selected agent has the granular scope (`mail.read` and, if attachments/documents are analyzed, `files.read`).
 */
export function checkAiVertalingToegang(input: AiVertalingToegangCheckInput): AiVertalingToegangResult {
  if (input.userBlocked) {
    return {
      allowed: false,
      code: 'USER_AI_BLOCKED',
      messageUk: 'Доступ ШІ для цього облікового запису вимкнено адміністратором або політикою безпеки.',
      actionLabelUk: 'Відкрити «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  const agent = input.agent;
  if (!agent || !agent.id) {
    return {
      allowed: false,
      code: 'AGENT_NOT_SELECTED',
      messageUk: 'Оберіть підключеного приватного ШІ-агента у розділі «Доступ ШІ», щоб виконати переклад або аналіз.',
      actionLabelUk: 'Налаштувати у «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  if (agent.revoked) {
    return {
      allowed: false,
      code: 'AGENT_REVOKED',
      messageUk: `Підключення агента «${agent.name}» відкликано або прострочено. Оновіть дозвіл у розділі «Доступ ШІ».`,
      actionLabelUk: 'Відкрити «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  const ruimte = ruimteOf(agent.ruimte);
  if (ruimte !== 'prive') {
    return {
      allowed: false,
      code: 'SPACE_SEPARATED',
      spaceError: RUIMTE_GESCHEIDEN(ruimte, input.requiredScope),
      messageUk: `Агент «${agent.name}» підключений до технічного простору (technisch). Технічні агенти ніколи не мають доступу до особистої пошти чи документів.`,
      actionLabelUk: 'Керувати просторами у «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  if (input.policyCeiling === 'off') {
    return {
      allowed: false,
      code: 'POLICY_CEILING_OFF',
      messageUk: 'Підписана політика безпеки ШІ забороняє читання пошти або документів (стеля політики: вимкнено).',
      actionLabelUk: 'Переглянути «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  const scopes = new Set((agent.scopes || []).map(s => String(s).trim()));
  const hasMailRead = scopes.has('mail.read');
  const hasFilesRead = scopes.has('files.read') || scopes.has('drive.read');

  if (input.requiredScope === 'mail.read' && !hasMailRead) {
    return {
      allowed: false,
      code: 'SCOPE_MISSING_MAIL_READ',
      messageUk: `Агент «${agent.name}» не має дозволу на читання пошти (mail.read). Надайте цей дозвіл у «Доступ ШІ».`,
      actionLabelUk: 'Надати дозвіл у «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  if (input.requiredScope === 'files.read' && !hasFilesRead) {
    return {
      allowed: false,
      code: 'SCOPE_MISSING_FILES_READ',
      messageUk: `Агент «${agent.name}» не має дозволу на читання файлів і документів (files.read). Надайте цей дозвіл у «Доступ ШІ».`,
      actionLabelUk: 'Надати дозвіл у «Доступ ШІ»',
      actionHref: AI_TOEGANG_HREF,
    };
  }

  if (input.includeAttachments) {
    if (input.attachmentPolicyCeiling === 'off') {
      return {
        allowed: false,
        code: 'POLICY_CEILING_OFF',
        messageUk: 'Аналіз вкладень вимкнено політикою безпеки ШІ для файлів (files.read / drive.read).',
        actionLabelUk: 'Переглянути «Доступ ШІ»',
        actionHref: AI_TOEGANG_HREF,
      };
    }
    if (!hasFilesRead) {
      return {
        allowed: false,
        code: 'SCOPE_MISSING_FILES_READ',
        messageUk: `Для аналізу вкладень агенту «${agent.name}» потрібен дозвіл files.read, або вимкніть опцію «Враховувати вкладення».`,
        actionLabelUk: 'Налаштувати у «Доступ ШІ»',
        actionHref: AI_TOEGANG_HREF,
      };
    }
  }

  const effectiveScopes: AiVertalingScope[] = [];
  if (hasMailRead) effectiveScopes.push('mail.read');
  if (hasFilesRead) effectiveScopes.push('files.read');

  return {
    allowed: true,
    ruimte: 'prive',
    agentId: agent.id,
    effectiveScopes,
  };
}

export type StoredMailContextItem = {
  id: string;
  ownerUserId: string;
  mailAccountId?: string;
  accountEmail?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  internetMessageId?: string;
  inReplyTo?: string;
  senderName?: string;
  senderEmail?: string;
  to?: string[];
  cc?: string[];
  subject: string;
  receivedAt: number;
  body: string;
  snippet?: string;
  hasAttachments?: boolean;
  attachmentNames?: string[];
};

export type RelatedMailCitation = {
  messageId: string;
  providerMessageId: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  subject: string;
  from: string;
  receivedAt: number;
  snippet: string;
  relationKind: 'same_thread' | 'in_reply_to' | 'cross_mailbox_topic' | 'participant_history';
  relationBadgeUk: string;
  causalLinkUk: string;
  matchedKeywords: string[];
  score: number;
};

export type CrossThreadContextResult = {
  targetMessageId: string;
  threadHistoryCount: number;
  crossMailboxCount: number;
  extractedTopics: string[];
  citations: RelatedMailCitation[];
  causalTimelineUk: string[];
};

const STOPWORDS = new Set([
  're', 'fw', 'fwd', 'aw', 'wg', 'sv', 'vs', 'відп', 'пересл',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'your', 'are', 'was', 'not', 'but', 'all', 'can', 'you',
  'van', 'het', 'een', 'voor', 'met', 'niet', 'naar', 'bij', 'ook', 'dat', 'zijn', 'wordt', 'door',
  'що', 'як', 'це', 'для', 'від', 'про', 'або', 'але', 'також', 'було', 'буде', 'вам', 'ми', 'ви', 'вони', 'його', 'її', 'наш', 'ваш', 'цей', 'ця', 'ці', 'привіт', 'вітаю', 'дякую', 'доброго', 'дня', 'лист', 'листа',
]);

export function normalizeComparableSubject(subject: string): string {
  let clean = String(subject ?? '').normalize('NFKC').trim();
  // Strip repeated Re:/Fwd:/Відп: prefixes
  while (/^(?:re|fw|fwd|aw|wg|sv|відп|пересл)\s*(?:\[\d+\])?\s*:\s*/i.test(clean)) {
    clean = clean.replace(/^(?:re|fw|fwd|aw|wg|sv|відп|пересл)\s*(?:\[\d+\])?\s*:\s*/i, '').trim();
  }
  return clean.replace(/\s+/g, ' ').toLowerCase();
}

export function extractSignificantKeywords(text: string, maxKeywords = 18): string[] {
  const normalized = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}@._-]+/gu, ' ');
  const counts = new Map<string, number>();
  for (const raw of normalized.split(/\s+/)) {
    const token = raw.replace(/^[._-]+|[._-]+$/g, '');
    if (token.length < 3 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function extractEmailAddress(raw: string): string {
  const m = /<([^>]+)>/.exec(String(raw ?? ''));
  return (m?.[1] || String(raw ?? '')).trim().toLowerCase();
}

/**
 * Finds thread history (`threadId`, `In-Reply-To`, normalized subject) AND related messages across
 * the user's connected mailboxes by matching keywords, topics, participants, and mentions.
 *
 * PRIVACY INVARIANT: Strictly filters `item.ownerUserId === userId`. Any record belonging to another
 * user or lacking a matching `ownerUserId` is immediately dropped so cross-user leakage is impossible.
 */
export function findRelatedMailContext(
  userId: string,
  target: StoredMailContextItem,
  candidates: readonly StoredMailContextItem[],
  options: { crossMailbox?: boolean; maxCitations?: number } = {},
): CrossThreadContextResult {
  const cleanUserId = String(userId ?? '').trim();
  if (!cleanUserId) {
    throw new Error('AI_VERTALING_USER_ID_REQUIRED');
  }
  if (target.ownerUserId !== cleanUserId) {
    throw new Error('AI_VERTALING_CROSS_USER_FORBIDDEN');
  }

  const crossMailbox = options.crossMailbox !== false;
  const maxCitations = Math.max(1, Math.min(25, options.maxCitations ?? 10));

  const targetSubjectNorm = normalizeComparableSubject(target.subject);
  const targetKeywords = extractSignificantKeywords(
    `${target.subject} ${target.body} ${(target.attachmentNames || []).join(' ')}`,
    20,
  );
  const targetKeywordSet = new Set(targetKeywords);
  const targetParticipants = new Set(
    [
      extractEmailAddress(target.senderEmail || ''),
      ...(target.to || []).map(extractEmailAddress),
      ...(target.cc || []).map(extractEmailAddress),
    ].filter(Boolean),
  );

  const citations: RelatedMailCitation[] = [];
  let threadHistoryCount = 0;
  let crossMailboxCount = 0;

  for (const item of candidates) {
    // Strict ownerUserId isolation: never touch another user's mail
    if (!item || item.ownerUserId !== cleanUserId) continue;
    const itemMsgId = item.providerMessageId || item.id;
    const targetMsgId = target.providerMessageId || target.id;
    if (item.id === target.id || (itemMsgId && itemMsgId === targetMsgId)) continue;

    const sameAccount =
      !target.mailAccountId || !item.mailAccountId || item.mailAccountId === target.mailAccountId;
    if (!crossMailbox && !sameAccount) continue;

    const sameThreadId =
      Boolean(target.providerThreadId && item.providerThreadId && target.providerThreadId === item.providerThreadId);
    const isReplyLink =
      Boolean(
        (target.inReplyTo && item.internetMessageId && target.inReplyTo === item.internetMessageId) ||
          (item.inReplyTo && target.internetMessageId && item.inReplyTo === target.internetMessageId),
      );
    const itemSubjectNorm = normalizeComparableSubject(item.subject);
    const sameSubject = Boolean(targetSubjectNorm && itemSubjectNorm && targetSubjectNorm === itemSubjectNorm);

    const itemText = `${item.subject} ${item.body || item.snippet || ''} ${(item.attachmentNames || []).join(' ')}`;
    const itemKeywords = extractSignificantKeywords(itemText, 24);
    const matchedKeywords = itemKeywords.filter(k => targetKeywordSet.has(k));

    const itemSender = extractEmailAddress(item.senderEmail || '');
    const itemRecipients = [
      ...(item.to || []).map(extractEmailAddress),
      ...(item.cc || []).map(extractEmailAddress),
    ].filter(Boolean);
    const sharedParticipants = [itemSender, ...itemRecipients].filter(p => p && targetParticipants.has(p));

    let relationKind: RelatedMailCitation['relationKind'] | null = null;
    let score = 0;

    if (isReplyLink) {
      relationKind = 'in_reply_to';
      score = 100 + matchedKeywords.length * 5;
    } else if (sameThreadId || (sameAccount && sameSubject)) {
      relationKind = 'same_thread';
      score = 85 + matchedKeywords.length * 4;
    } else if (matchedKeywords.length >= 2 || (sameSubject && !sameAccount)) {
      relationKind = 'cross_mailbox_topic';
      score = 45 + matchedKeywords.length * 10 + (sameSubject ? 25 : 0) + (sharedParticipants.length ? 12 : 0);
    } else if (sharedParticipants.length > 0 && matchedKeywords.length >= 1) {
      relationKind = 'participant_history';
      score = 30 + matchedKeywords.length * 8 + sharedParticipants.length * 6;
    }

    if (!relationKind) continue;

    const isEarlier = item.receivedAt <= target.receivedAt;
    const dateStr = new Date(item.receivedAt || Date.now()).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const senderLabel = item.senderName || item.senderEmail || 'Невідомий відправник';

    let relationBadgeUk = 'Пов’язаний лист';
    let causalLinkUk = '';

    if (relationKind === 'in_reply_to') {
      threadHistoryCount += 1;
      relationBadgeUk = 'Пряма відповідь (In-Reply-To)';
      causalLinkUk = isEarlier
        ? `Передумова (${dateStr}): лист від ${senderLabel} ініціював поточну відповідь.`
        : `Наслідок (${dateStr}): пряма відповідь на поточне повідомлення від ${senderLabel}.`;
    } else if (relationKind === 'same_thread') {
      threadHistoryCount += 1;
      relationBadgeUk = 'Історія гілки';
      causalLinkUk = isEarlier
        ? `Попередній крок у гілці (${dateStr}) від ${senderLabel}${matchedKeywords.length ? ` щодо «${matchedKeywords.slice(0, 3).join(', ')}»` : ''}.`
        : `Подальше повідомлення у гілці (${dateStr}) від ${senderLabel}.`;
    } else if (relationKind === 'cross_mailbox_topic') {
      crossMailboxCount += 1;
      relationBadgeUk = sameAccount ? 'Спільна тема' : `Інша скринька (${item.accountEmail || item.mailAccountId || 'підключена'})`;
      causalLinkUk = isEarlier
        ? `Причинно-наслідковий зв’язок (${dateStr}): попередні домовленості або документи за темами «${matchedKeywords.slice(0, 4).join(', ')}».`
        : `Подальший розвиток теми (${dateStr}): пов’язаний лист за ключовими словами «${matchedKeywords.slice(0, 4).join(', ')}».`;
    } else {
      crossMailboxCount += 1;
      relationBadgeUk = 'Історія учасника';
      causalLinkUk = `Попередня взаємодія з ${senderLabel} (${dateStr}) щодо «${matchedKeywords.slice(0, 3).join(', ')}».`;
    }

    const cleanSnippet = stripTrackingAndSecrets(item.snippet || item.body || '')
      .text.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);

    citations.push({
      messageId: item.providerMessageId || item.id,
      providerMessageId: item.providerMessageId || item.id,
      threadId: item.providerThreadId || item.id,
      accountId: item.mailAccountId || 'default',
      accountEmail: item.accountEmail || '',
      subject: item.subject || 'Без теми',
      from: item.senderName ? `${item.senderName} <${item.senderEmail || ''}>`.trim() : item.senderEmail || 'Невідомий',
      receivedAt: item.receivedAt,
      snippet: cleanSnippet,
      relationKind,
      relationBadgeUk,
      causalLinkUk,
      matchedKeywords: matchedKeywords.slice(0, 6),
      score,
    });
  }

  citations.sort((a, b) => b.score - a.score || b.receivedAt - a.receivedAt);
  const topCitations = citations.slice(0, maxCitations);

  const causalTimelineUk = [...topCitations]
    .sort((a, b) => a.receivedAt - b.receivedAt)
    .map(c => c.causalLinkUk);

  return {
    targetMessageId: target.providerMessageId || target.id,
    threadHistoryCount,
    crossMailboxCount,
    extractedTopics: targetKeywords.slice(0, 8),
    citations: topCitations,
    causalTimelineUk,
  };
}

export type AiVertalingCacheKeyInput = {
  userId: string;
  messageId: string;
  targetLang: string;
  mode: AiVertalingMode;
  contextDepth: AiVertalingSummaryDepth;
  crossMailboxContext?: boolean;
  includeAttachments?: boolean;
  agentId?: string;
  payloadSignature?: string;
};

export function buildAiVertalingCacheKey(input: AiVertalingCacheKeyInput): string {
  return [
    String(input.userId || '').trim(),
    String(input.messageId || '').trim(),
    normalizeAiVertalingTaal(input.targetLang, 'uk'),
    String(input.mode || 'translate'),
    String(input.contextDepth || 'brief'),
    input.crossMailboxContext !== false ? 'xm1' : 'xm0',
    input.includeAttachments !== false ? 'att1' : 'att0',
    String(input.agentId || 'default').trim(),
    String(input.payloadSignature || '').trim(),
  ].join('\u001f');
}

export class AiVertalingSessionCache<T> {
  private readonly store = new Map<string, { value: T; createdAt: number }>();
  constructor(private readonly maxEntries = 250, private readonly ttlMs = 30 * 60 * 1000) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (now - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, createdAt: now });
  }

  clearForUser(userId: string): void {
    const prefix = `${String(userId || '').trim()}\u001f`;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  get size(): number {
    return this.store.size;
  }
}

export type AiVertalingRunResponse = {
  ok: true;
  mode: AiVertalingMode;
  targetLang: string;
  targetLangLabelUk: string;
  detectedSourceLang: string;
  agentId: string;
  agentName: string;
  cached: boolean;
  privacy: {
    strippedTrackingPixels: number;
    strippedTrackingParams: number;
    redactedSecrets: number;
    scopeVerified: AiVertalingScope[];
    ruimte: 'prive';
  };
  translations?: Record<string, string>;
  /** Punt 16: welke motor de vertaling echt maakte, en hoeveel fragmenten onvertaald bleven (nooit een namaakmarkering). */
  motorId?: string;
  motorNaam?: string;
  onvertaald?: number;
  summary?: {
    depth: AiVertalingSummaryDepth;
    headline: string;
    keyFacts: string[];
    dates: string[];
    sums: string[];
    actionItems: string[];
    timeline: string[];
  };
  purpose?: {
    documentType: string;
    whatAbout: string;
    whatFor: string;
    whyImportant: string;
    attachmentsOverview: Array<{ filename: string; roleExplanation: string }>;
  };
  contextAnalysis?: {
    overview: string;
    causeAndEffectLinks: string[];
    nonObviousConnections: string[];
    extractedTopics: string[];
    citations: RelatedMailCitation[];
  };
  /**
   * Pakket 3: «Що від вас потрібно?». Elk punt is op de server tegen het ORIGINELE gesprek gecontroleerd (shared/ai-bronnen.ts:
   * letterlijk citaat, termijn in de bronalinea); de browser controleert het nog eens tegen wat hij toont.
   */
  acties?: {
    punten: GecontroleerdPunt[];
    kort: GecontroleerdPunt[];
    /** Korte antwoorden in de taal van de brief (ШІ, in de antwoordregel met een stippellijn). */
    antwoordHints: string[];
    antwoordNodig: boolean | null;
    opbouw: 'model';
  };
};

// ================================================================================================ vertaalmotoren (punt 16)
// Melding van de eigenaar (19.10.2026): «немає альтернативних рушіїв перекладу (Google, Microsoft, інші) і зручної кнопки
// інтеграції», «переклад вставляє маркери [Переклад → УКР] замість чистого тексту», «немає режиму оригінал і переклад поруч»,
// «є незрозуміла кнопка ШІ». En: «нічого не імітувати: якщо рушій не підключено — так і написати».
//
// Daarom staat hier een EERLIJKE catalogus. Drie standen, en niets anders:
//   'werkt'      — kan nu vertalen. Vandaag is dat alleen uw eigen privé-AI-agent (Anthropic, uw eigen sleutel).
//   'aansluiten' — de code is er, maar u moet hem zelf koppelen; de kaart heeft een knop die naar de juiste plek gaat.
//   'nog-niet'   — er is nog géén koppeling geschreven. Geen knop die niets doet, geen namaakvertaling: dat staat er zo bij.
// BYOS: een externe dienst (Google, Microsoft, DeepL) krijgt nooit stilletjes uw post. Zo'n motor kan er alleen komen als u hem
// zelf aanzet met uw eigen sleutel — en tot die koppeling bestaat, is de eerlijke stand 'nog-niet'.

export type VertaalMotorStaat = 'werkt' | 'aansluiten' | 'nog-niet';

export type VertaalMotor = {
  id: string;
  naam: string;
  /** Wie de vertaling maakt (voor de plaat boven de brief: «Перекладено … рушієм <naam>»). */
  leverancier: string;
  staat: VertaalMotorStaat;
  /** Waar de vertaling heen gaat — zelf gehost of een externe dienst. */
  plek: 'eigen-server' | 'eigen-sleutel' | 'externe-dienst';
  uitlegUk: string;
  uitlegNl: string;
  /** Alleen bij 'aansluiten': waar de knop «Підключити» naartoe gaat. Leeg = geen knop. */
  aansluitenHref: string;
};

export const VERTAAL_MOTOR_STAAT_TEKST: Record<VertaalMotorStaat, [string, string]> = {
  werkt: ['Працює зараз', 'Werkt nu'],
  aansluiten: ['Треба підключити', 'Moet gekoppeld worden'],
  'nog-niet': ['Ще немає', 'Nog niet beschikbaar'],
};

/** Vaste catalogus; `motorenMetStand()` zet de stand van de eerste motor op wat er écht gekoppeld is. */
export const VERTAAL_MOTOREN: readonly VertaalMotor[] = [
  {
    id: 'eigen-agent',
    naam: 'Ваш приватний ШІ-агент',
    leverancier: 'Claude · Gemini · ChatGPT · Grok · AutoClaw (ваш власний ключ)',
    staat: 'aansluiten',
    plek: 'eigen-sleutel',
    uitlegUk: 'Переклад, підсумок і контекст робить той незалежний ШІ-агент (Claude, Google Gemini API, ChatGPT, Grok або AutoClaw / GLM), який ви увімкнули у своєму обліковому записі в «Доступ ШІ» з вашим власним ізольованим ключем.',
    uitlegNl: 'Vertaling, samenvatting en context komen van de onafhankelijke AI-agent (Claude, Google Gemini API, ChatGPT, Grok of AutoClaw / GLM) die u voor uw eigen account in «AI-toegang» met uw eigen sleutel hebt ingeschakeld.',
    aansluitenHref: AI_TOEGANG_HREF,
  },
  {
    id: 'libretranslate',
    naam: 'LibreTranslate (на вашому сервері)',
    leverancier: 'LibreTranslate',
    staat: 'nog-niet',
    plek: 'eigen-server',
    uitlegUk: 'Власний контейнер перекладу на вашому ж сервері — нічого не йде назовні. Конектора для нього ще не написано, тому зараз він не працює.',
    uitlegNl: 'Een eigen vertaalcontainer op uw eigen server — niets gaat naar buiten. De koppeling is nog niet geschreven, dus hij werkt nu niet.',
    aansluitenHref: '',
  },
  {
    id: 'google-vertaling',
    naam: 'Google Cloud Translation',
    leverancier: 'Google',
    staat: 'nog-niet',
    plek: 'externe-dienst',
    uitlegUk: 'Сторонній хмарний сервіс. Конектора ще немає, і без вашого окремого підключення з власним ключем лист туди ніколи не піде.',
    uitlegNl: 'Een externe clouddienst. De koppeling bestaat nog niet, en zonder uw eigen sleutel en uw eigen toestemming gaat er nooit post naartoe.',
    aansluitenHref: '',
  },
  {
    id: 'microsoft-vertaling',
    naam: 'Microsoft Azure AI Translator',
    leverancier: 'Microsoft',
    staat: 'nog-niet',
    plek: 'externe-dienst',
    uitlegUk: 'Сторонній хмарний сервіс. Конектора ще немає.',
    uitlegNl: 'Een externe clouddienst. De koppeling bestaat nog niet.',
    aansluitenHref: '',
  },
  {
    id: 'deepl',
    naam: 'DeepL',
    leverancier: 'DeepL',
    staat: 'nog-niet',
    plek: 'externe-dienst',
    uitlegUk: 'Сторонній хмарний сервіс. Конектора ще немає.',
    uitlegNl: 'Een externe clouddienst. De koppeling bestaat nog niet.',
    aansluitenHref: '',
  },
];

/**
 * De catalogus met de ECHTE stand: de eigen agent «werkt» zodra er minstens één gekoppelde privé-agent met mail.read is
 * (of files.read in een documentweergave). Alle andere motoren blijven staan zoals ze zijn — nooit «werkt» zonder koppeling.
 */
export function motorenMetStand(agents: readonly AiVertalingAgentInfo[], voorDocument = false): VertaalMotor[] {
  const bruikbaar = (agents || []).some(a => (voorDocument ? a.allowedFilesRead : a.allowedMailRead));
  return VERTAAL_MOTOREN.map(m => (m.id === 'eigen-agent' ? { ...m, staat: (bruikbaar ? 'werkt' : 'aansluiten') as VertaalMotorStaat } : { ...m }));
}

/** De motor die een resultaat gemaakt heeft (voor de plaat boven de brief). */
export const vertaalMotorVan = (id: string) => VERTAAL_MOTOREN.find(m => m.id === id) || VERTAAL_MOTOREN[0];

/** Hoe de vertaling getoond wordt: in de brief zelf, of origineel en vertaling naast elkaar. */
export type VertaalWeergave = 'inline' | 'naast';
export const normaliseerVertaalWeergave = (raw: unknown): VertaalWeergave => (String(raw ?? '') === 'naast' ? 'naast' : 'inline');

/** Naam van een taal in de taal van de gebruiker: Oekraïens uit de lijst, Nederlands via de eigen naam van de taal. */
export function taalLabel(lang: 'uk' | 'nl', code: string): string {
  const clean = normalizeAiVertalingTaal(code, '');
  if (!clean) return '';
  const gevonden = AI_VERTALING_TALEN.find(item => item.code === clean);
  if (!gevonden) return clean.toUpperCase();
  return lang === 'uk' ? gevonden.labelUk : gevonden.nativeLabel;
}

/**
 * «Перекладено з <мова> рушієм <назва>» — de tekst van de plaat BOVEN de brief. Hij hoort nooit in de brieftekst zelf: dat was
 * precies de klacht over de markering in de tekst.
 */
export function vertaaldDoorZin(lang: 'uk' | 'nl', bronLang: string, motorNaam: string, doelLang?: string): string {
  const bron = taalLabel(lang, bronLang);
  const doel = doelLang ? taalLabel(lang, doelLang) : '';
  return lang === 'uk'
    ? `Перекладено з ${bron}${doel ? ` на ${doel}` : ''} рушієм ${motorNaam}`
    : `Vertaald uit ${bron}${doel ? ` naar ${doel}` : ''} door ${motorNaam}`;
}
