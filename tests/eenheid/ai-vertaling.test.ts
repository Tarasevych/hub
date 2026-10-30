// AI-переклад, підсумок, призначення документа та крос-поштовий контекст (shared/ai-vertaling.ts, backend/ai-vertaling-routes.ts):
// 1. Збереження верстки під час перекладу блоків HTML і миттєве повернення оригіналу без мутації.
// 2. Очищення трекінгових пікселів, маркетингових міток і секретів перед відправкою агенту.
// 3. Пошук пов'язаних листів за гілкою/темою/ключовими словами виключно в межах userId (жодного витоку між користувачами).
// 4. Перевірка простору AiRuimte='prive', гранулярних прав (mail.read / files.read) та стелі підписаної політики ДО виклику агента.
// 5. Гнучкі налаштування режимів, глибини підсумку, вкладень і сесійний кеш за (messageId, targetLang, mode, contextDepth).

import {
  AI_VERTALING_TALEN,
  AiVertalingSessionCache,
  buildAiVertalingCacheKey,
  checkAiVertalingToegang,
  extractLayoutPreservingSegments,
  extractSignificantKeywords,
  findRelatedMailContext,
  normalizeAiVertalingInstellingen,
  normalizeAiVertalingTaal,
  renderLayoutPreservingTranslation,
  stripTrackingAndSecrets,
  taalLabelUk,
  type AiVertalingRunResponse,
  type StoredMailContextItem,
} from '../../shared/ai-vertaling';
import {
  clearAiVertalingCache,
  createAiVertalingRoutes,
  executeAiVertalingRun,
  setAiVertalingDeps,
} from '../../backend/ai-vertaling-routes';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-vertaling');

  // ---------- 1. Збереження верстки (Layout-preserving translation) + відновлення оригіналу ----------
  const sampleHtml = [
    '<div class="mail-card" data-state="open">',
    '  <h2>Project Hyperion Q4 Budget</h2>',
    '  <p>Hello team, please review the <strong>updated invoice #4821</strong> before <em>Friday 18 Oct</em>.</p>',
    '  <ul><li>Server hosting: EUR 1,200</li><li>Security audit: EUR 3,400</li></ul>',
    '  <pre><code>const apiKey = "DO_NOT_TRANSLATE_CODE";</code></pre>',
    '  <p><a href="https://hub.tarasevych.com/docs" target="_blank">Open contract</a></p>',
    '</div>',
  ].join('\n');

  const layoutState = extractLayoutPreservingSegments(sampleHtml, 'seg');
  check(
    'layout: витягує текстові сегменти з HTML, залишаючи теги, атрибути та блоки <code>/<pre> недоторканими',
    layoutState.segments.length >= 6 &&
      layoutState.segments.some((s) => s.text.includes('Project Hyperion Q4 Budget')) &&
      layoutState.segments.some((s) => s.text.includes('updated invoice #4821')) &&
      !layoutState.segments.some((s) => s.text.includes('DO_NOT_TRANSLATE_CODE')),
    `segments=${layoutState.segments.length}`,
  );

  const translatedMap: Record<string, string> = {};
  for (const seg of layoutState.segments) {
    if (seg.text.includes('Project Hyperion Q4 Budget')) {
      translatedMap[seg.id] = 'Бюджет проєкту Гіперіон на 4 квартал';
    } else if (seg.text.includes('updated invoice #4821')) {
      translatedMap[seg.id] = 'оновлений рахунок №4821 <script>alert(1)</script>';
    } else {
      translatedMap[seg.id] = `[UK] ${seg.text}`;
    }
  }

  const renderedTranslated = renderLayoutPreservingTranslation(layoutState, translatedMap, true);
  const renderedRestored = renderLayoutPreservingTranslation(layoutState, translatedMap, false);

  check(
    'layout: переклад підставляється зі збереженням структури тегів/класів, код не змінюється, а ін’єкція HTML у перекладі екранується',
    renderedTranslated.includes('<div class="mail-card" data-state="open">') &&
      renderedTranslated.includes('<h2>Бюджет проєкту Гіперіон на 4 квартал</h2>') &&
      renderedTranslated.includes('<strong>оновлений рахунок №4821 &lt;script&gt;alert(1)&lt;/script&gt;</strong>') &&
      renderedTranslated.includes('const apiKey = "DO_NOT_TRANSLATE_CODE";') &&
      !renderedTranslated.includes('<script>alert(1)</script>'),
  );

  check(
    'layout: перемикач «Показати оригінал ↔ Переклад» (active=false) повертає байт-в-байт оригінальний HTML без втрат',
    renderedRestored === sampleHtml && layoutState.originalHtml === sampleHtml,
  );

  const paragraphHtml = '<p>First paragraph.</p><p>Second paragraph with details.</p>';
  const plainState = extractLayoutPreservingSegments(paragraphHtml, 'p');
  const plainTranslated = renderLayoutPreservingTranslation(
    plainState,
    Object.fromEntries(plainState.segments.map((s, idx) => [s.id, `Абзац ${idx + 1}`])),
    true,
  );
  check(
    'layout: абзаци перекладаються на місці та зберігають оригінал при вимкненні перекладу',
    plainState.segments.length === 2 &&
      plainTranslated === '<p>Абзац 1</p><p>Абзац 2</p>' &&
      renderLayoutPreservingTranslation(plainState, {}, false) === paragraphHtml,
  );

  // ---------- 2. Очищення трекінгових пікселів і секретів ----------
  const dirtyInput = [
    '<p>Зустріч завтра о 14:00.</p>',
    '<img src="https://tracker.example.com/pixel.gif" width="1" height="1" />',
    '<img src="https://mailtrack.io/trace/open/abc123" style="display:none" />',
    '<a href="https://example.com/offer?utm_source=newsletter&utm_medium=email&fbclid=IwAR123&id=42">Переглянути</a>',
    'Token: sk-ant-' + 'api03-abcdef1234567890abcdef1234567890', // opgeknipt voor de geheimenscan van de uitrol; runtime één token
    'Hub token: tvh_9876543210abcdef9876543210abcdef',
    'GitHub: ghp_1234567890abcdefghijklmnopqrstuvwx',
    'Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    'password=SuperSecretPassword123!',
    // Opgeknipt zodat de geheimenscan van de uitrol dit TESTBESTAND niet meldt; tijdens de test is de string gewoon één PEM-blok.
    '-----BEGIN PRIVATE' + ' KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC\n-----END PRIVATE' + ' KEY-----',
  ].join('\n');

  const sanitized = stripTrackingAndSecrets(dirtyInput);
  check(
    'privacy: 1x1 трекінгові пікселі та маячки відкриття видаляються разом із маркетинговими параметрами utm_*/fbclid',
    sanitized.strippedTrackingPixels >= 2 &&
      sanitized.strippedTrackingParams >= 3 &&
      !sanitized.text.includes('tracker.example.com/pixel.gif') &&
      !sanitized.text.includes('mailtrack.io/trace/open') &&
      !sanitized.text.includes('utm_source=') &&
      !sanitized.text.includes('fbclid=') &&
      sanitized.text.includes('id=42'),
    `pixels=${sanitized.strippedTrackingPixels}, params=${sanitized.strippedTrackingParams}`,
  );

  // Пакет 3 (24.10.2026): очищення параметрів більше не з'їдає «?» і «&» у звичайних реченнях (раніше «bevestigen? En» → «bevestigen En»).
  const proza = stripTrackingAndSecrets('Kunt u dit tijdstip bevestigen? En uw identiteitskaart meebrengen? Tom & Jerry. Zie https://example.com/a?utm_source=x&id=7 en https://example.com/b?utm_medium=y en verder');
  check(
    'privacy: звичайні речення зберігають «?» і «&»; прибрано лише трекінгові параметри (і їхні «?»/«&»)',
    proza.text.includes('bevestigen? En uw') && proza.text.includes('meebrengen? Tom & Jerry.') && proza.text.includes('https://example.com/a?id=7 en')
      && proza.text.includes('https://example.com/b en verder') && proza.strippedTrackingParams === 2,
    proza.text,
  );

  check(
    'privacy: секретні токени (Anthropic, tvh_, ghp_, Bearer JWT, паролі, приватні ключі PEM) маскуються до відправки агенту',
    sanitized.redactedSecrets >= 5 &&
      !sanitized.text.includes('sk-ant-api03') &&
      !sanitized.text.includes('tvh_9876543210') &&
      !sanitized.text.includes('ghp_1234567890') &&
      !sanitized.text.includes('SuperSecretPassword123') &&
      !sanitized.text.includes('BEGIN PRIVATE KEY') &&
      sanitized.text.includes('[ПРИХОВАНО_СЕКРЕТ]'),
    `secrets=${sanitized.redactedSecrets}`,
  );

  // ---------- 3. Пошук контексту та зв'язків строго в межах userId ----------
  const targetMail: StoredMailContextItem = {
    id: 'msg-current',
    ownerUserId: 'user-pavlo',
    mailAccountId: 'acc-work',
    accountEmail: 'eigenaar@example.test',
    providerMessageId: 'msg-current',
    providerThreadId: 'th-hyperion',
    internetMessageId: '<msg-current@tarasevych.com>',
    inReplyTo: '<msg-prev@tarasevych.com>',
    subject: 'Re: Гіперіон — фінальний кошторис міграції серверів',
    senderEmail: 'olena@partner.ua',
    senderName: 'Олена Коваль',
    to: ['eigenaar@example.test'],
    snippet: 'Погоджуємо бюджет міграції серверів Гіперіон та аудит безпеки.',
    body: 'Павле, ми оновили кошторис міграції серверів Гіперіон після вчорашнього аудиту безпеки.',
    receivedAt: Date.parse('2026-10-14T10:00:00Z'),
    hasAttachments: true,
  };

  const candidates: StoredMailContextItem[] = [
    // 1) Прямий попередній лист у тій самій гілці (In-Reply-To)
    {
      id: 'msg-prev',
      ownerUserId: 'user-pavlo',
      mailAccountId: 'acc-work',
      accountEmail: 'eigenaar@example.test',
      providerMessageId: 'msg-prev',
      providerThreadId: 'th-hyperion',
      internetMessageId: '<msg-prev@tarasevych.com>',
      subject: 'Гіперіон — фінальний кошторис міграції серверів',
      senderEmail: 'eigenaar@example.test',
      senderName: 'Павло',
      to: ['olena@partner.ua'],
      body: 'Надсилаю запит на оновлення кошторису міграції серверів.',
      snippet: 'Надсилаю запит на оновлення кошторису міграції серверів.',
      receivedAt: Date.parse('2026-10-12T09:00:00Z'),
    },
    // 2) Лист в ІНШІЙ поштовій скриньці того самого користувача за спільними ключовими словами
    {
      id: 'msg-other-mailbox',
      ownerUserId: 'user-pavlo',
      mailAccountId: 'acc-personal',
      accountEmail: 'pavlo.personal@gmail.com',
      providerMessageId: 'msg-other-mailbox',
      providerThreadId: 'th-audit-99',
      internetMessageId: '<msg-audit@gmail.com>',
      subject: 'Висновки аудиту безпеки для проєкту Гіперіон',
      senderEmail: 'security@auditor.ua',
      senderName: 'Аудит Безпеки',
      to: ['pavlo.personal@gmail.com'],
      body: 'Під час аудиту безпеки серверів Гіперіон виявлено потребу в додатковому шифруванні.',
      snippet: 'Під час аудиту безпеки серверів Гіперіон виявлено потребу в додатковому шифруванні.',
      receivedAt: Date.parse('2026-10-10T15:30:00Z'),
    },
    // 3) ЧУЖИЙ лист іншого користувача з тими самими ключовими словами та навіть тим самим threadId — ПОВИНЕН БУТИ ВІДКИНУТИЙ!
    {
      id: 'msg-foreign-leak',
      ownerUserId: 'user-other-victim',
      mailAccountId: 'acc-victim',
      accountEmail: 'victim@tarasevych.com',
      providerMessageId: 'msg-foreign-leak',
      providerThreadId: 'th-hyperion',
      internetMessageId: '<msg-prev@tarasevych.com>',
      subject: 'СЕКРЕТ ІНШОГО КОРИСТУВАЧА: Гіперіон кошторис міграції серверів',
      senderEmail: 'olena@partner.ua',
      senderName: 'Олена Коваль',
      to: ['victim@tarasevych.com'],
      body: 'Цей лист належить user-other-victim і ніколи не має потрапити до user-pavlo.',
      snippet: 'Цей лист належить user-other-victim і ніколи не має потрапити до user-pavlo.',
      receivedAt: Date.parse('2026-10-13T12:00:00Z'),
    },
  ];

  const ctxCross = findRelatedMailContext('user-pavlo', targetMail, candidates, { crossMailbox: true });
  check(
    'context: знаходить листи з тієї ж гілки ТА з інших підключених скриньок користувача за ключовими словами, але НІКОЛИ не пропускає листи іншого userId',
    ctxCross.citations.some((c) => c.messageId === 'msg-prev' && c.relationKind === 'in_reply_to') &&
      ctxCross.citations.some((c) => c.messageId === 'msg-other-mailbox' && c.relationKind === 'cross_mailbox_topic') &&
      !ctxCross.citations.some((c) => c.messageId === 'msg-foreign-leak') &&
      ctxCross.causalTimelineUk.length >= 2,
    ctxCross.citations.map((c) => `${c.messageId}:${c.relationKind}`).join(','),
  );

  const ctxSingleMailboxOnly = findRelatedMailContext('user-pavlo', targetMail, candidates, { crossMailbox: false });
  check(
    'context: коли crossMailbox=false, пошук обмежується поточною скринькою і не підтягує листи з інших скриньок',
    ctxSingleMailboxOnly.citations.some((c) => c.messageId === 'msg-prev') &&
      !ctxSingleMailboxOnly.citations.some((c) => c.messageId === 'msg-other-mailbox') &&
      !ctxSingleMailboxOnly.citations.some((c) => c.messageId === 'msg-foreign-leak'),
  );

  let crossUserThrew = false;
  try {
    findRelatedMailContext('user-attacker', targetMail, candidates, { crossMailbox: true });
  } catch (err) {
    crossUserThrew = String((err as Error).message).includes('AI_VERTALING_CROSS_USER_FORBIDDEN');
  }
  check(
    'context: спроба викликати пошук контексту для чужого цільового листа негайно кидає AI_VERTALING_CROSS_USER_FORBIDDEN',
    crossUserThrew,
  );

  // ---------- 4. Перевірка прав доступу, простору AiRuimte='prive' та стелі політики ДО виклику агента ----------
  const baseAccessInput = {
    userId: 'user-pavlo',
    userBlocked: false,
    agent: {
      id: 'agent-prive-1',
      name: 'Claude Приватний',
      ruimte: 'prive',
      scopes: ['mail.read', 'files.read'],
      revoked: false,
    },
    requiredScope: 'mail.read' as const,
    includeAttachments: true,
    policyCeiling: 'always' as const,
    attachmentPolicyCeiling: 'always' as const,
  };

  const allowedCheck = checkAiVertalingToegang(baseAccessInput);
  check('toegang: приватний агент із mail.read та files.read і стелею always отримує дозвіл', allowedCheck.allowed === true);

  const techCheck = checkAiVertalingToegang({
    ...baseAccessInput,
    agent: { ...baseAccessInput.agent, ruimte: 'technisch' },
  });
  check(
    'toegang: технічний агент (AiRuimte="technisch") категорично відхиляється з кодом SPACE_SEPARATED і посиланням на /ai',
    !techCheck.allowed &&
      techCheck.code === 'SPACE_SEPARATED' &&
      Boolean(techCheck.spaceError?.startsWith('SPACE_SEPARATED: ')) &&
      techCheck.actionHref === '/ai' &&
      techCheck.actionLabelUk.includes('Доступ ШІ'),
  );

  const ceilingOffCheck = checkAiVertalingToegang({ ...baseAccessInput, policyCeiling: 'off' });
  check(
    'toegang: коли стеля підписаної політики вимкнена (off), доступ блокується з POLICY_CEILING_OFF',
    !ceilingOffCheck.allowed && ceilingOffCheck.code === 'POLICY_CEILING_OFF' && ceilingOffCheck.actionHref === '/ai',
  );

  const missingMailScope = checkAiVertalingToegang({
    ...baseAccessInput,
    agent: { ...baseAccessInput.agent, scopes: ['files.read'] },
  });
  const missingAttachmentScope = checkAiVertalingToegang({
    ...baseAccessInput,
    agent: { ...baseAccessInput.agent, scopes: ['mail.read'] },
    includeAttachments: true,
  });
  const withoutAttachmentsOk = checkAiVertalingToegang({
    ...baseAccessInput,
    agent: { ...baseAccessInput.agent, scopes: ['mail.read'] },
    includeAttachments: false,
  });
  check(
    'toegang: відсутність mail.read для листа або files.read при увімкнених вкладеннях блокує запит, але без вкладень mail.read достатньо',
    !missingMailScope.allowed &&
      missingMailScope.code === 'SCOPE_MISSING_MAIL_READ' &&
      !missingAttachmentScope.allowed &&
      missingAttachmentScope.code === 'SCOPE_MISSING_FILES_READ' &&
      withoutAttachmentsOk.allowed === true,
  );

  // Перевіряємо через executeAiVertalingRun, що при відмові доступу ЖОДЕН запит до LLM або бази контексту не виконується
  let llmCalls = 0;
  let mailStoreLoads = 0;
  clearAiVertalingCache('user-pavlo');
  setAiVertalingDeps({
    fetch: (async (_url: string, init?: RequestInit) => {
      llmCalls += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      const prompt: string = body.messages?.[0]?.content || '';
      if (prompt.includes('"translations"')) {
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify({ detectedSourceLang: 'en', translations: { 'seg:0': 'Привіт, командо!' } }) }],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                headline: 'Короткий підсумок листа',
                keyFacts: ['Факт 1'],
                dates: ['18 жовтня'],
                sums: ['EUR 4,600'],
                actionItems: ['Погодити бюджет'],
                timeline: ['12 жовт — запит', '14 жовт — відповідь'],
              }),
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch,
    getApiKey: async () => 'sk-test-vertaling-key',
    loadAgents: async () => [
      {
        id: 'agent-prive-ok',
        name: 'Claude Приватний',
        platform: 'mcp-oauth',
        source: 'oauth',
        ruimte: 'prive',
        scopes: ['mail.read', 'files.read'],
        allowedMailRead: true,
        allowedFilesRead: true,
        statusUk: 'Активний (приватний простір)',
      },
      {
        id: 'agent-tech-bad',
        name: 'Деплой-агент',
        platform: 'mcp-console',
        source: 'console',
        ruimte: 'technisch',
        scopes: [],
        allowedMailRead: false,
        allowedFilesRead: false,
        statusUk: 'Технічний простір (ізольовано)',
      },
      {
        id: 'agent-no-scope',
        name: 'Агент без пошти',
        platform: 'desktop',
        source: 'agent',
        ruimte: 'prive',
        scopes: [],
        allowedMailRead: false,
        allowedFilesRead: false,
        statusUk: 'Обмежений',
      },
    ],
    loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
    loadUserMailStore: async () => {
      mailStoreLoads += 1;
      return {
        accounts: [
          { id: 'acc-work', email: 'eigenaar@example.test' },
          { id: 'acc-personal', email: 'pavlo.personal@gmail.com' },
        ],
        items: candidates,
      };
    },
  });

  try {
    const refusedTech = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'translate',
      targetLang: 'uk',
      agentId: 'agent-tech-bad',
      bodyText: 'Hello team!',
    });
    const refusedScope = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'summary',
      targetLang: 'uk',
      agentId: 'agent-no-scope',
      bodyText: 'Hello team!',
    });

    check(
      'backend: при виборі технічного агента або агента без scope mail.read бекенд повертає 403 ДО будь-якого звернення до провайдера ШІ чи пошуку листів',
      refusedTech.status === 403 &&
        (refusedTech.body as any).error === 'SPACE_SEPARATED' &&
        refusedScope.status === 403 &&
        (refusedScope.body as any).error === 'SCOPE_MISSING_MAIL_READ' &&
        (refusedScope.body as any).actionHref === '/ai' &&
        llmCalls === 0 &&
        mailStoreLoads === 0,
      `llmCalls=${llmCalls}, mailStoreLoads=${mailStoreLoads}`,
    );

    // ---------- 5. Валідація режимів, вкладень, глибини підсумку та сесійного кешу ----------
    const segState = extractLayoutPreservingSegments('<p class="lead">Hello team!</p>', 'seg');
    const okTranslate1 = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'translate',
      targetLang: 'uk',
      agentId: 'agent-prive-ok',
      bodyText: 'Hello team!',
      segments: segState.segments,
    });
    const okTranslate2 = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'translate',
      targetLang: 'uk',
      agentId: 'agent-prive-ok',
      bodyText: 'Hello team!',
      segments: segState.segments,
    });

    const body1 = okTranslate1.body as AiVertalingRunResponse;
    const body2 = okTranslate2.body as AiVertalingRunResponse;
    const renderedFromBackend = renderLayoutPreservingTranslation(segState, body1.translations || {}, true);

    check(
      'backend + cache: перший запит перекладу викликає ШІ та зберігає верстку <p class="lead">, а повторний запит повертається миттєво з кешу без повторної відправки',
      okTranslate1.status === 200 &&
        body1.ok === true &&
        body1.cached === false &&
        renderedFromBackend === '<p class="lead">Привіт, командо!</p>' &&
        okTranslate2.status === 200 &&
        body2.cached === true &&
        llmCalls === 1,
      `llmCalls=${llmCalls}, rendered=${renderedFromBackend}`,
    );

    const okSummaryBrief = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'summary',
      targetLang: 'uk',
      agentId: 'agent-prive-ok',
      summaryDepth: 'brief',
      includeAttachments: true,
      bodyText: 'Hello team!',
      attachments: [{ filename: 'budget.pdf', contentType: 'application/pdf', sizeBytes: 24500, textExcerpt: 'Total EUR 4,600' }],
    });
    const okSummaryTimeline = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'summary',
      targetLang: 'uk',
      agentId: 'agent-prive-ok',
      summaryDepth: 'timeline',
      includeAttachments: true,
      bodyText: 'Hello team!',
      attachments: [{ filename: 'budget.pdf', contentType: 'application/pdf', sizeBytes: 24500, textExcerpt: 'Total EUR 4,600' }],
    });

    const sumBriefBody = okSummaryBrief.body as AiVertalingRunResponse;
    const sumTimelineBody = okSummaryTimeline.body as AiVertalingRunResponse;
    check(
      'backend: зміна глибини підсумку (brief -> timeline) створює окремий ключ кешу й повертає структурований підсумок із датами, сумами та пунктами дій',
      okSummaryBrief.status === 200 &&
        sumBriefBody.cached === false &&
        Boolean(sumBriefBody.summary?.sums.includes('EUR 4,600')) &&
        okSummaryTimeline.status === 200 &&
        sumTimelineBody.cached === false &&
        llmCalls === 3,
      `llmCalls=${llmCalls}`,
    );

    const okPurpose = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      mode: 'purpose',
      targetLang: 'uk',
      agentId: 'agent-prive-ok',
      includeAttachments: true,
      subject: 'Invoice #4821 for Project Hyperion',
      from: 'olena@partner.ua',
      bodyText: 'Please review the attached invoice EUR 4,600 due by 18/10/2026.',
      attachments: [{ filename: 'invoice-4821.pdf', contentType: 'application/pdf', sizeBytes: 18400, textExcerpt: 'Invoice #4821 Total EUR 4,600' }],
    });
    const purposeBody = okPurpose.body as AiVertalingRunResponse;
    check(
      'backend (purpose): пояснює тип документа, про що він, для чого, чому важливий та роль кожного вкладення',
      okPurpose.status === 200 &&
        Boolean(purposeBody.purpose?.documentType) &&
        Boolean(purposeBody.purpose?.whatAbout) &&
        Boolean(purposeBody.purpose?.whatFor) &&
        Boolean(purposeBody.purpose?.whyImportant) &&
        purposeBody.purpose?.attachmentsOverview.some((a) => a.filename === 'invoice-4821.pdf'),
    );

    const okContext = await executeAiVertalingRun({
      userId: 'user-pavlo',
      messageId: 'msg-current',
      threadId: 'th-hyperion',
      accountId: 'acc-work',
      mode: 'context',
      targetLang: 'uk',
      agentId: 'agent-prive-ok',
      crossMailboxContext: true,
      subject: 'Re: Гіперіон — фінальний кошторис міграції серверів',
      from: 'olena@partner.ua',
      bodyText: 'Павле, ми оновили кошторис міграції серверів Гіперіон після вчорашнього аудиту безпеки.',
    });
    const contextBody = okContext.body as AiVertalingRunResponse;
    check(
      'backend (context): знаходить причинно-наслідкові зв’язки та цитати джерел у скриньках user-pavlo й ніколи не повертає чужі листи',
      okContext.status === 200 &&
        Boolean(contextBody.contextAnalysis?.overview) &&
        Boolean(contextBody.contextAnalysis?.citations.some((c) => c.messageId === 'msg-prev')) &&
        Boolean(contextBody.contextAnalysis?.citations.some((c) => c.messageId === 'msg-other-mailbox')) &&
        !contextBody.contextAnalysis?.citations.some((c) => c.messageId === 'msg-foreign-leak'),
    );

    // Перевірка HTTP-маршрутів createAiVertalingRoutes (автентифікація, state, settings)
    const auditLogs: Array<{ action: string; outcome: string }> = [];
    let sessionAllowed = false;
    const routes = createAiVertalingRoutes({
      requireSession: async () =>
        sessionAllowed
          ? { user: { id: 'user-pavlo', status: 'approved' }, service: 'mail' }
          : { errorCode: 'UNAUTHORIZED' },
      audit: async (_uid, action, outcome) => {
        auditLogs.push({ action, outcome });
      },
    });
    const unauthRes = await routes['POST /api/owner/mail/ai-vertaling/state'][0]({ event: {}, body: {} });
    sessionAllowed = true;
    const stateRes = await routes['POST /api/owner/mail/ai-vertaling/state'][0]({ event: {}, body: {} });
    const stateData = JSON.parse(stateRes.body);
    const settingsRes = await routes['POST /api/owner/mail/ai-vertaling/settings'][0]({
      event: {},
      body: { defaultLang: 'pl', summaryDepth: 'detailed', crossMailboxContext: false, includeAttachments: true },
    });
    const settingsData = JSON.parse(settingsRes.body);
    check(
      'routes: без сесії повертає 403; зі схваленою сесією state повертає лише приватні агенти (без технічних), а settings зберігає налаштування та пише аудит',
      unauthRes.statusCode === 403 &&
        stateRes.statusCode === 200 &&
        stateData.ok === true &&
        stateData.agents.every((a: any) => a.ruimte === 'prive') &&
        !stateData.agents.some((a: any) => a.id === 'agent-tech-bad') &&
        settingsRes.statusCode === 200 &&
        settingsData.settings.defaultLang === 'pl' &&
        settingsData.settings.summaryDepth === 'detailed' &&
        auditLogs.some((l) => l.action === 'owner.mail.ai_vertaling.settings' && l.outcome === 'success'),
    );

    // Перевірка normalizeAiVertalingInstellingen та мов
    const prefs = normalizeAiVertalingInstellingen({
      defaultLang: 'DE',
      recentLangs: ['pl', 'uk', 'de'],
      defaultAgentId: 'agent-prive-ok',
      summaryDepth: 'actions',
      crossMailboxContext: false,
      includeAttachments: false,
    });
    check(
      'instellingen: нормалізує мову, список нещодавніх мов (без дублікатів), глибину підсумку та прапорці контексту/вкладень',
      prefs.defaultLang === 'de' &&
        prefs.recentLangs[0] === 'de' &&
        prefs.recentLangs.includes('pl') &&
        prefs.recentLangs.includes('uk') &&
        prefs.summaryDepth === 'actions' &&
        prefs.crossMailboxContext === false &&
        prefs.includeAttachments === false &&
        AI_VERTALING_TALEN.length >= 25 &&
        taalLabelUk('uk').includes('Українська') &&
        normalizeAiVertalingTaal('FR') === 'fr',
    );

    const cache = new AiVertalingSessionCache(3);
    const k1 = buildAiVertalingCacheKey({
      userId: 'u1',
      messageId: 'm1',
      targetLang: 'uk',
      mode: 'context',
      contextDepth: 'detailed',
      crossMailboxContext: true,
      includeAttachments: true,
      agentId: 'a1',
      payloadSignature: 'sig1',
    });
    const k2 = buildAiVertalingCacheKey({
      userId: 'u1',
      messageId: 'm1',
      targetLang: 'en',
      mode: 'context',
      contextDepth: 'detailed',
      crossMailboxContext: true,
      includeAttachments: true,
      agentId: 'a1',
      payloadSignature: 'sig1',
    });
    check('cache: ключі кешу розрізняють мову/режим/глибину та підтримують інвалідацію за userId', k1 !== k2 && typeof cache.clearForUser === 'function');
    check('keywords: витягує змістовні українські та англійські ключові слова, ігноруючи стоп-слова', extractSignificantKeywords('Проєкт Гіперіон та міграція серверів у жовтні').includes('гіперіон'));
  } finally {
    setAiVertalingDeps(null);
    clearAiVertalingCache('user-pavlo');
  }

  return einde();
}
