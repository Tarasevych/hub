/**
 * Модульні випробування повної незалежності ШІ-агентів та ізоляції за обліковим записом (userId):
 *   1. Кожен ШІ-інструмент (Anthropic Claude, Google Gemini API, OpenAI ChatGPT, xAI Grok, Z.ai AutoClaw/GLM)
 *      має власне призначення у сховищі Sleutelkluis (shared/geheimen.ts) і власний канонічний опис у shared/ai-aanbieders.ts;
 *   2. Серверний чат (backend/connectors-chat.ts) працює з кожним постачальником незалежно (включно з циклом
 *      functionDeclarations -> functionCall -> functionResponse для Google Gemini API та tool_calls для OpenAI/Grok/AutoClaw);
 *   3. Переклад пошти та витяг дій «Що від вас потрібно?» (backend/ai-vertaling-routes.ts) виконуються саме тим
 *      незалежним ШІ-агентом, який користувач увімкнув і обрав у своєму обліковому записі (userId), з передачею
 *      GEMINI_ACTIES_RESPONSE_SCHEMA для Gemini та повною ізоляцією між користувачами;
 *   4. Кожна сторінка #agent/<slug> (src/agenten/AgentPagina.tsx) надає незалежну панель керування та канал post_ai.
 */
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { afleiden, DIENSTEN, DOEL_INFO, VAULT_DOELEN } from '../../shared/geheimen';
import { PLACEHOLDER_PER_DOEL, STANDAARD_NAAM_PER_DOEL, standaardSoortVoorDoel } from '../../shared/geheimen-formulier';
import {
  AI_AANBIEDERS,
  aanbiederUitAgent,
  aanbiederUitModel,
  aanbiederVoorAgentSlug,
  GEMINI_ACTIES_RESPONSE_SCHEMA,
  naarGeminiFunctionDeclarations,
  naarOpenAiTools,
  type AiAanbiederId,
} from '../../shared/ai-aanbieders';
import { runChat, type ChatDeps } from '../../backend/connectors-chat';
import { modellenVoorGebruiker } from '../../backend/ai-werkruimte';
import { clearAiVertalingCache, executeAiVertalingRun, setAiVertalingDeps } from '../../backend/ai-vertaling-routes';

const antwoord = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-onafhankelijke-agenten');

  // ================================================================ 1. Незалежні призначення у Sleutelkluis
  {
    const aiDoelen: AiAanbiederId[] = ['anthropic', 'gemini', 'openai', 'grok', 'autoclaw'];
    check(
      '1a: всі 5 незалежних постачальників ШІ присутні у VAULT_DOELEN, DIENSTEN та DOEL_INFO',
      aiDoelen.every(
        (d) =>
          (VAULT_DOELEN as readonly string[]).includes(d) &&
          Boolean(DIENSTEN[d]?.naam?.[0]) &&
          Boolean(DOEL_INFO[d]?.naam?.[0]) &&
          Boolean(STANDAARD_NAAM_PER_DOEL[d]) &&
          Boolean(PLACEHOLDER_PER_DOEL[d]?.[0]) &&
          standaardSoortVoorDoel(d) === 'ai',
      ),
    );

    check(
      '1b: розпізнавання за назвою ключа розрізняє Gemini, Grok та AutoClaw/GLM окремо від OpenAI',
      afleiden('GEMINI_API_KEY').dienst === 'gemini' &&
        afleiden('XAI_GROK_KEY').dienst === 'grok' &&
        afleiden('AUTOCLAW_GLM_KEY').dienst === 'autoclaw' &&
        afleiden('OPENAI_API_KEY').dienst === 'openai' &&
        afleiden('ANTHROPIC_API_KEY').dienst === 'anthropic',
    );

    check(
      '1c: aanbiederUitModel та aanbiederUitAgent визначають кожного постачальника незалежно',
      aanbiederUitModel('gemini-2.5-flash') === 'gemini' &&
        aanbiederUitModel('grok-4') === 'grok' &&
        aanbiederUitModel('glm-4.6') === 'autoclaw' &&
        aanbiederUitModel('gpt-5') === 'openai' &&
        aanbiederUitModel('claude-sonnet-5-5') === 'anthropic' &&
        aanbiederUitAgent({ id: 'prive:vault-gemini', name: 'Google Gemini API' }) === 'gemini' &&
        aanbiederUitAgent({ id: 'prive:vault-grok', name: 'xAI Grok' }) === 'grok' &&
        aanbiederUitAgent({ id: 'prive:vault-autoclaw', name: 'AutoClaw GLM' }) === 'autoclaw' &&
        aanbiederVoorAgentSlug('gemini') === 'gemini' &&
        aanbiederVoorAgentSlug('autoclaw') === 'autoclaw',
    );
  }

  // ================================================================ 2. Серверний чат: незалежний цикл Google Gemini API та інших постачальників
  {
    const tools = [
      {
        name: 'machine_list',
        description: 'Перелік підключених комп’ютерів користувача',
        inputSchema: {
          type: 'object' as const,
          properties: { filter: { type: 'string' } },
          required: ['filter'],
        },
      },
    ];
    const gemDecl = naarGeminiFunctionDeclarations(tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })));
    const oaDecl = naarOpenAiTools(tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })));
    check(
      '2a: перетворення інструментів на формат Gemini functionDeclarations та OpenAI tools',
      gemDecl.length === 1 &&
        gemDecl[0].functionDeclarations[0].name === 'machine_list' &&
        gemDecl[0].functionDeclarations[0].parameters.type === 'OBJECT' &&
        oaDecl.length === 1 &&
        oaDecl[0].function.name === 'machine_list',
    );

    // Цикл Gemini: модель викликає functionCall -> сервер виконує callTool -> передає functionResponse -> отримує відповідь
    // Водночас ключ Anthropic ВІДСУТНІЙ (null), що доводить повну незалежність Gemini від Anthropic!
    const verzoeken: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
    const antwoorden = [
      () =>
        antwoord(200, {
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'machine_list', args: { filter: 'online' } } }],
              },
            },
          ],
        }),
      () =>
        antwoord(200, {
          candidates: [
            {
              content: {
                parts: [{ text: 'Ваш основний комп’ютер у мережі.' }],
              },
            },
          ],
        }),
    ];
    let stepIdx = 0;
    const kluisPerGebruiker: Record<string, Partial<Record<AiAanbiederId, string>>> = {
      'user-gemini': { gemini: 'AIzaSyTestGeminiSleutelUser1' },
      'user-grok': { grok: 'xai-test-sleutel-user2' },
    };

    const geminiDeps: ChatDeps = {
      model: 'gemini-2.5-flash',
      getApiKey: async () => null, // Anthropic немає!
      getApiKeyForPurpose: async (uid, purpose) => kluisPerGebruiker[uid]?.[purpose] ?? null,
      listTools: async () => tools,
      callTool: async (_uid, name, args) => ({
        content: [{ type: 'text', text: JSON.stringify({ tool: name, args, computers: ['ПК-Павло'] }) }],
      }),
      fetchImpl: (async (url: string, init: any) => {
        verzoeken.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
        return antwoorden[Math.min(stepIdx++, antwoorden.length - 1)]();
      }) as unknown as typeof fetch,
    };

    const uitGem = await runChat(geminiDeps, 'user-gemini', [{ role: 'user', content: 'Які мої ПК зараз у мережі?' }]);
    check(
      '2b: Gemini 2.5 Flash працює в чаті без ключа Anthropic, викликає functionCall і повертає фінальну відповідь',
      'reply' in uitGem &&
        uitGem.reply === 'Ваш основний комп’ютер у мережі.' &&
        uitGem.steps.length === 1 &&
        uitGem.steps[0].tool === 'machine_list' &&
        verzoeken.length === 2 &&
        verzoeken[0].url.includes('generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent') &&
        verzoeken[0].headers['x-goog-api-key'] === 'AIzaSyTestGeminiSleutelUser1' &&
        Boolean(verzoeken[1].body?.contents?.[2]?.parts?.[0]?.functionResponse),
      JSON.stringify(uitGem),
    );

    // Ізоляція між користувачами: user-grok не має ключа gemini, тому запит до gemini-2.5-flash для нього повертає no_api_key
    const uitAndereGebruiker = await runChat(geminiDeps, 'user-grok', [{ role: 'user', content: 'Перевірка' }]);
    check(
      '2c: сувора ізоляція ключів у чаті між обліковими записами (user-grok не може скористатися ключем user-gemini)',
      'error' in uitAndereGebruiker && uitAndereGebruiker.error === 'no_api_key',
    );

    // Тепер user-grok викликає власну модель grok-4 зі своїм ізольованим ключем grok
    const grokVerzoeken: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
    const uitGrok = await runChat(
      {
        ...geminiDeps,
        model: 'grok-4',
        fetchImpl: (async (url: string, init: any) => {
          grokVerzoeken.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
          return antwoord(200, {
            choices: [{ message: { role: 'assistant', content: 'Відповідь від незалежного агента Grok.' } }],
          });
        }) as unknown as typeof fetch,
      },
      'user-grok',
      [{ role: 'user', content: 'Привіт, Grok!' }],
    );
    check(
      '2d: Grok працює зі своїм ізольованим ключем через api.x.ai без залежності від інших агентів',
      'reply' in uitGrok &&
        uitGrok.reply === 'Відповідь від незалежного агента Grok.' &&
        grokVerzoeken.length === 1 &&
        grokVerzoeken[0].url === 'https://api.x.ai/v1/chat/completions' &&
        grokVerzoeken[0].headers.authorization === 'Bearer xai-test-sleutel-user2',
    );
  }

  // ================================================================ 3. Переклад пошти та «Що від вас потрібно?» через обраний незалежний ШІ-агент
  {
    const vertaalVerzoeken: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
    setAiVertalingDeps({
      getApiKeyForProvider: async (uid, provider) => {
        if (uid === 'user-a' && provider === 'gemini') return 'AIzaSyGeminiMailKeyUserA';
        if (uid === 'user-b' && provider === 'autoclaw') return 'glm-key-user-b';
        return null;
      },
      loadAgents: async (uid) => {
        if (uid === 'user-a') {
          return [
            {
              id: 'prive:vault-gemini',
              name: 'Власний ключ ШІ (Google Gemini API · Приватний)',
              platform: 'gemini-prive',
              source: 'vault',
              ruimte: 'prive',
              scopes: ['mail.read', 'files.read'],
              allowedMailRead: true,
              allowedFilesRead: true,
              statusUk: 'Активний (приватний простір)',
            },
          ];
        }
        return [];
      },
      loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
      fetch: (async (url: string, init: any) => {
        const body = JSON.parse(String(init?.body || '{}'));
        vertaalVerzoeken.push({ url: String(url), headers: init?.headers || {}, body });
        if (JSON.stringify(body).includes('translations')) {
          return antwoord(200, {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        detectedSourceLang: 'nl',
                        translations: {
                          'seg:0': 'Будь ласка, підтвердьте рахунок до 19 листопада 2026 року.',
                        },
                      }),
                    },
                  ],
                },
              },
            ],
          });
        }
        return antwoord(200, {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        {
                          text: 'Підтвердити рахунок до 19 листопада 2026 року',
                          quote: 'Gelieve de factuur vóór 19 november 2026 te bevestigen.',
                          message: 1,
                          paragraph: 1,
                          deadline: '19 november 2026',
                          kind: 'deadline',
                        },
                      ],
                      brief: [
                        {
                          text: 'Запит на підтвердження рахунку',
                          quote: 'Gelieve de factuur vóór 19 november 2026 te bevestigen.',
                          message: 1,
                          paragraph: 1,
                          deadline: '19 november 2026',
                          kind: 'fact',
                        },
                      ],
                      replySuggestions: ['Ik bevestig de factuur.'],
                      needsReply: true,
                    }),
                  },
                ],
              },
            },
          ],
        });
      }) as unknown as typeof fetch,
    });

    try {
      clearAiVertalingCache('user-a');
      const rTranslate = await executeAiVertalingRun({
        userId: 'user-a',
        mode: 'translate',
        targetLang: 'uk',
        agentId: 'prive:vault-gemini',
        messageId: 'msg-gem-1',
        subject: 'Factuur',
        bodyText: 'Gelieve de factuur vóór 19 november 2026 te bevestigen.',
        segments: [{ id: 'seg:0', text: 'Gelieve de factuur vóór 19 november 2026 te bevestigen.' }],
      });

      check(
        '3a: переклад листа виконується обраним у профілі користувача незалежним агентом Google Gemini API',
        rTranslate.status === 200 &&
          'translations' in rTranslate.body &&
          rTranslate.body.translations?.['seg:0'] === 'Будь ласка, підтвердьте рахунок до 19 листопада 2026 року.' &&
          rTranslate.body.agentId === 'prive:vault-gemini' &&
          vertaalVerzoeken.length === 1 &&
          vertaalVerzoeken[0].url.includes('generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent') &&
          vertaalVerzoeken[0].headers['x-goog-api-key'] === 'AIzaSyGeminiMailKeyUserA',
        JSON.stringify(rTranslate),
      );

      const rActies = await executeAiVertalingRun({
        userId: 'user-a',
        mode: 'acties',
        targetLang: 'uk',
        agentId: 'prive:vault-gemini',
        messageId: 'msg-gem-2',
        bodyText: 'Gelieve de factuur vóór 19 november 2026 te bevestigen.',
        bronBerichten: [
          {
            brief: 1,
            from: 'boekhouding@voorbeeld.nl',
            receivedAt: Date.now(),
            tekst: 'Gelieve de factuur vóór 19 november 2026 te bevestigen.',
          },
        ],
      });

      const laatsteVerzoek = vertaalVerzoeken[vertaalVerzoeken.length - 1];
      check(
        '3b: режим «Що від вас потрібно?» (acties) передає у Gemini сувору схему GEMINI_ACTIES_RESPONSE_SCHEMA і дослівно перевіряє цитату',
        rActies.status === 200 &&
          'acties' in rActies.body &&
          rActies.body.acties?.punten.length === 1 &&
          rActies.body.acties?.punten[0].status === 'letterlijk' &&
          rActies.body.acties?.punten[0].termijn === '19 november 2026' &&
          laatsteVerzoek.body?.generationConfig?.responseMimeType === 'application/json' &&
          laatsteVerzoek.body?.generationConfig?.responseSchema?.type === GEMINI_ACTIES_RESPONSE_SCHEMA.type,
        JSON.stringify(rActies),
      );

      // Користувач user-b не має підключеного агента з дозволом mail.read -> 403
      const rUserB = await executeAiVertalingRun({
        userId: 'user-b',
        mode: 'translate',
        targetLang: 'uk',
        agentId: 'prive:vault-gemini',
        messageId: 'msg-gem-1',
        bodyText: 'Geheim bericht',
      });
      check(
        '3c: повна ізоляція перекладу пошти між користувачами (user-b не має доступу до агентів та кешу user-a)',
        rUserB.status === 403,
      );
    } finally {
      setAiVertalingDeps(null);
    }
  }

  // ================================================================ 4. Незалежна панель керування на #agent/<slug> та AiWerkruimteChat
  {
    const bron = readFileSync('src/agenten/AgentPagina.tsx', 'utf8');
    const chatBron = readFileSync('src/AiWerkruimteChat.tsx', 'utf8');
    check(
      '4a: AgentPagina.tsx містить незалежний канал post_ai та відмальовує панель керування для кожного агента',
      bron.includes("post_ai:") &&
        bron.includes('<AntigravityBrugPaneel tr={tr} uk={uk} slug={slug}') &&
        !bron.includes("slug === 'antigravity' || slug === 'autoclaw' ? (\n        <AntigravityBrugPaneel") &&
        AI_AANBIEDERS.length === 5,
    );
    check(
      '4b: AiWerkruimteChat.tsx динамічно визначає активного ШІ-постачальника замість жорсткого прив’язування до Claude',
      chatBron.includes('AI_AANBIEDER_BIJ_ID[aanbiederUitModel(') &&
        !chatBron.includes(": 'Claude'") &&
        !chatBron.includes("tr('Claude працює…'"),
    );

    const gemEnAutoclaw = await modellenVoorGebruiker('user-gem', {
      getApiKey: async () => null,
      getApiKeyForPurpose: async (_uid, purpose) => {
        if (purpose === 'gemini') return 'AIzaSyTest';
        if (purpose === 'autoclaw') return 'glm-test';
        return null;
      },
      listTools: async () => [],
      callTool: async () => ({ content: [] }),
    });
    check(
      '5a: modellenVoorGebruiker виявляє ключі Gemini та AutoClaw навіть без ключа Anthropic і формує список моделей користувача',
      gemEnAutoclaw.sleutel === true &&
        gemEnAutoclaw.modellen.map((m) => m.id).join(',') === 'gemini-2.5-flash,glm-4.6' &&
        gemEnAutoclaw.modellen[0].standaard === true,
      JSON.stringify(gemEnAutoclaw),
    );
  }

  return einde();
}
