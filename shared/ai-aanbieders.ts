/**
 * shared/ai-aanbieders.ts — Канонічний реєстр незалежних постачальників ШІ
 * для серверного чату, перекладу пошти та витягу дій («Що від вас потрібно?»).
 *
 * Головний архітектурний принцип:
 * Кожен ШІ-інструмент (Anthropic Claude, Google Gemini API, OpenAI ChatGPT / Copilot,
 * xAI Grok, Z.ai AutoClaw / GLM) працює ПОВНІСТЮ НЕЗАЛЕЖНО від інших, використовує
 * власний ізольований ключ користувача (`userId`) зі сховища `Sleutelkluis`
 * і може вмикатися, вимикатися та налаштовуватися окремо в обліковому записі.
 */

export type AiAanbiederId = 'anthropic' | 'gemini' | 'openai' | 'grok' | 'autoclaw';

export interface AiAanbiederMeta {
  id: AiAanbiederId;
  /** Короткий ідентифікатор агента на сторінці #agent/<slug> */
  agentSlug: 'claude' | 'gemini' | 'gpt' | 'grok' | 'autoclaw';
  /** Назва постачальника / інструменту для інтерфейсу */
  naamUk: string;
  naamNl: string;
  /** Типова модель, якщо користувач обрав агента без явного ідентифікатора моделі */
  standaardModel: string;
  /** Типова модель для швидкого перекладу пошти та витягу дій */
  standaardVertaalModel: string;
  /** Базова адреса кінцевої точки API */
  eindpunt: string;
  /** Префікс ідентифікатора приватного агента в налаштуваннях перекладу */
  priveAgentId: string;
}

export const AI_AANBIEDERS: readonly AiAanbiederMeta[] = [
  {
    id: 'anthropic',
    agentSlug: 'claude',
    naamUk: 'Anthropic Claude',
    naamNl: 'Anthropic Claude',
    standaardModel: 'claude-sonnet-5-5',
    standaardVertaalModel: 'claude-haiku-4-5-20251001',
    eindpunt: 'https://api.anthropic.com/v1/messages',
    priveAgentId: 'prive:vault-anthropic',
  },
  {
    id: 'gemini',
    agentSlug: 'gemini',
    naamUk: 'Google Gemini API',
    naamNl: 'Google Gemini API',
    standaardModel: 'gemini-2.5-flash',
    standaardVertaalModel: 'gemini-2.5-flash',
    eindpunt: 'https://generativelanguage.googleapis.com/v1beta/models',
    priveAgentId: 'prive:vault-gemini',
  },
  {
    id: 'openai',
    agentSlug: 'gpt',
    naamUk: 'OpenAI ChatGPT',
    naamNl: 'OpenAI ChatGPT',
    standaardModel: 'gpt-5',
    standaardVertaalModel: 'gpt-5-mini',
    eindpunt: 'https://api.openai.com/v1/chat/completions',
    priveAgentId: 'prive:vault-openai',
  },
  {
    id: 'grok',
    agentSlug: 'grok',
    naamUk: 'xAI Grok',
    naamNl: 'xAI Grok',
    standaardModel: 'grok-4',
    standaardVertaalModel: 'grok-4-fast',
    eindpunt: 'https://api.x.ai/v1/chat/completions',
    priveAgentId: 'prive:vault-grok',
  },
  {
    id: 'autoclaw',
    agentSlug: 'autoclaw',
    naamUk: 'AutoClaw / GLM (Z.ai)',
    naamNl: 'AutoClaw / GLM (Z.ai)',
    standaardModel: 'glm-4.6',
    standaardVertaalModel: 'glm-4.6-flash',
    eindpunt: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    priveAgentId: 'prive:vault-autoclaw',
  },
] as const;

export const AI_AANBIEDER_BIJ_ID: Readonly<Record<AiAanbiederId, AiAanbiederMeta>> = Object.fromEntries(
  AI_AANBIEDERS.map((a) => [a.id, a]),
) as Record<AiAanbiederId, AiAanbiederMeta>;

/**
 * Визначає незалежного постачальника ШІ за назвою моделі.
 */
export function aanbiederUitModel(model?: string | null): AiAanbiederId {
  const m = String(model || '').trim().toLowerCase();
  if (!m) return 'anthropic';
  if (m.startsWith('gemini') || m.includes('gemini')) return 'gemini';
  if (m.startsWith('grok') || m.includes('grok')) return 'grok';
  if (m.startsWith('glm') || m.includes('autoclaw') || m.includes('zhipu') || m.includes('chatglm')) return 'autoclaw';
  if (
    m.startsWith('gpt-') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.includes('openai') ||
    m.includes('chatgpt')
  ) {
    return 'openai';
  }
  return 'anthropic';
}

/**
 * Визначає незалежного постачальника ШІ за метаданими підключеного агента.
 */
export function aanbiederUitAgent(agent?: {
  id?: string | null;
  name?: string | null;
  platform?: string | null;
  slug?: string | null;
} | null): AiAanbiederId {
  if (!agent) return 'anthropic';
  const s = `${agent.id || ''} ${agent.slug || ''} ${agent.platform || ''} ${agent.name || ''}`.toLowerCase();
  if (s.includes('gemini') || s.includes('google-ai') || s.includes('generativelanguage')) return 'gemini';
  if (s.includes('grok') || s.includes('xai') || s.includes('x.ai')) return 'grok';
  if (s.includes('autoclaw') || s.includes('glm') || s.includes('z.ai') || s.includes('zhipu')) return 'autoclaw';
  if (s.includes('openai') || s.includes('chatgpt') || s.includes('gpt') || s.includes('copilot')) return 'openai';
  return 'anthropic';
}

/**
 * Повертає призначення ключа у сховищі Sleutelkluis для сторінки #agent/<slug>.
 */
export function aanbiederVoorAgentSlug(slug: string): AiAanbiederId {
  const s = slug.trim().toLowerCase();
  if (s === 'gemini' || s === 'antigravity') return 'gemini';
  if (s === 'grok') return 'grok';
  if (s === 'autoclaw') return 'autoclaw';
  if (s === 'gpt' || s === 'copilot' || s === 'cursor') return 'openai';
  return 'anthropic';
}

/**
 * Перетворює внутрішній опис інструментів чату на формат Google Gemini `functionDeclarations`.
 */
export function naarGeminiFunctionDeclarations(
  tools: ReadonlyArray<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>,
): Array<{
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: {
      type: 'OBJECT';
      properties: Record<string, unknown>;
      required?: string[];
    };
  }>;
}> {
  if (!tools.length) return [];
  return [
    {
      functionDeclarations: tools.map((t) => {
        const props =
          t.input_schema && typeof t.input_schema.properties === 'object' && t.input_schema.properties !== null
            ? (t.input_schema.properties as Record<string, unknown>)
            : {};
        const req = Array.isArray(t.input_schema?.required)
          ? t.input_schema.required.filter((r): r is string => typeof r === 'string')
          : [];
        return {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'OBJECT',
            properties: converteerEigenschappenNaarGemini(props),
            ...(req.length > 0 ? { required: req } : {}),
          },
        };
      }),
    },
  ];
}

function converteerEigenschappenNaarGemini(props: Record<string, unknown>): Record<string, unknown> {
  const uit: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      const rawType = typeof rec.type === 'string' ? rec.type.toUpperCase() : 'STRING';
      uit[k] = {
        ...rec,
        type: ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT'].includes(rawType) ? rawType : 'STRING',
      };
    } else {
      uit[k] = { type: 'STRING' };
    }
  }
  return uit;
}

/**
 * Перетворює внутрішній опис інструментів чату на сумісний з OpenAI / Grok / AutoClaw формат `tools`.
 */
export function naarOpenAiTools(
  tools: ReadonlyArray<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>,
): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/**
 * Сувора схема відповіді Google Gemini (`responseSchema`) для витягу пунктів дій із листа
 * («Що від вас потрібно?» — `ActiesModelAntwoord` у `backend/ai-vertaling-routes.ts`).
 */
export const GEMINI_ACTIES_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          quote: { type: 'STRING' },
          message: { type: 'INTEGER' },
          paragraph: { type: 'INTEGER' },
          deadline: { type: 'STRING' },
          kind: {
            type: 'STRING',
            enum: ['question', 'request', 'deadline', 'fact'],
          },
        },
        required: ['text', 'quote', 'message', 'paragraph', 'deadline', 'kind'],
      },
    },
    brief: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          quote: { type: 'STRING' },
          message: { type: 'INTEGER' },
          paragraph: { type: 'INTEGER' },
          deadline: { type: 'STRING' },
          kind: {
            type: 'STRING',
            enum: ['question', 'request', 'deadline', 'fact'],
          },
        },
        required: ['text', 'quote', 'message', 'paragraph'],
      },
    },
    replySuggestions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    needsReply: { type: 'BOOLEAN' },
  },
  required: ['items', 'brief', 'replySuggestions', 'needsReply'],
} as const;

