// MAILAI-001 (15.11.2026): панель «ШІ-аналіз і переклад» над листом — лише як увімкнена опція і лише з робочим ШІ.
// Draaien: node scripts/eenheidstests.mjs mailai-001-20261115.test.ts
// Скарги Павла: (1) у темній темі підказка «?» — білий прямокутник з білим текстом; (2) блок має працювати лише ввімкнений як опція
// і лише якщо справді є підключений ШІ; (3) немає хрестика закриття; (4) без ШІ-агента кнопки не працюють і лише займають вікно;
// (5) кнопка веде на mail.tarasevych.com/ai — 404; (6) незрозуміло, як це працює і що безкоштовне.
//  A. налаштування: balkTonen типово false (і для старих записів без поля), true/false зберігається, сміття ігнорується.
//  B. видимість: aiBalkZichtbaar лише при (завантажено && увімкнено && хоча б один рушій «werkt»); рушій «werkt» лише з ключем API.
//  C. сервер: /state позначає агентів без ключа (heeftSleutel=false, чесний статус); /settings приймає balkTonen і пише сповіщення
//     в центр сповіщень лише при зміні; тип сповіщення зареєстровано як приватний (пошта).
//  D. панель: без стану сервера — нічого (без порожнього місця); з'являється з хрестиком; немає вигаданого «Приватного асистента»,
//     немає мертвого «/ai» і «#sleutels»; пояснення «Як працює ШІ в пошті» є в обох мовах.
//  E. підказка «?»: її стилі вантажить сам InfoTip (hulp-knop.css), а не лише toegangslaag.css, якого пошта не вантажить; загальне
//     правило пошти для [role=tooltip] (тло = колір тексту) більше не зачіпає InfoTip, який має власний колір тексту.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  agentKanPost,
  aiBalkZichtbaar,
  motorenMetStand,
  normalizeAiVertalingInstellingen,
  STANDAARD_AI_VERTALING_INSTELLINGEN,
  type AiVertalingAgentInfo,
} from '../../shared/ai-vertaling';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT } from '../../shared/meldingen-soorten';
import { createAiVertalingRoutes, setAiVertalingDeps } from '../../backend/ai-vertaling-routes';
import { registreerMelder } from '../../backend/melder';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const UID = 'user-mailai-001';

const agent = (over: Partial<AiVertalingAgentInfo> = {}): AiVertalingAgentInfo => ({
  id: 'oauth:claude', name: 'Claude', platform: 'mcp-oauth', source: 'oauth', ruimte: 'prive', scopes: ['mail.read'],
  allowedMailRead: true, allowedFilesRead: false, statusUk: 'Активний', ...over,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('mailai-001-20261115');

  // ================================================================ A. налаштування
  {
    const oud = normalizeAiVertalingInstellingen({ defaultLang: 'nl' } as never);
    check('A типово вимкнено (новий користувач і старий запис без поля)', STANDAARD_AI_VERTALING_INSTELLINGEN.balkTonen === false && oud.balkTonen === false);
    const aan = normalizeAiVertalingInstellingen({ balkTonen: true });
    const blijft = normalizeAiVertalingInstellingen({ defaultLang: 'en' }, aan);
    const rommel = normalizeAiVertalingInstellingen({ balkTonen: 'ja' as never }, aan);
    check('A true зберігається, інші зміни його не скидають, не-boolean ігнорується', aan.balkTonen && blijft.balkTonen && rommel.balkTonen);
  }

  // ================================================================ B. видимість
  {
    const werkt = [{ staat: 'werkt' as const }], niet = [{ staat: 'aansluiten' as const }, { staat: 'nog-niet' as const }];
    check('B видно лише: завантажено + увімкнено + робочий рушій',
      aiBalkZichtbaar({ geladen: true, balkTonen: true, motoren: werkt })
      && !aiBalkZichtbaar({ geladen: false, balkTonen: true, motoren: werkt })
      && !aiBalkZichtbaar({ geladen: true, balkTonen: false, motoren: werkt })
      && !aiBalkZichtbaar({ geladen: true, balkTonen: true, motoren: niet }));
    const stand = (a: AiVertalingAgentInfo[]) => motorenMetStand(a).find((m) => m.id === 'eigen-agent')?.staat;
    check('B «працює» лише агент з ключем API; без ключа — «треба підключити»; старий сервер без поля — як раніше',
      stand([agent({ heeftSleutel: true })]) === 'werkt' && stand([agent({ heeftSleutel: false })]) === 'aansluiten' && stand([agent()]) === 'werkt' && stand([]) === 'aansluiten',
      `${stand([agent({ heeftSleutel: true })])}/${stand([agent({ heeftSleutel: false })])}/${stand([agent()])}`);
    check('B агент технічного простору чи без mail.read пошту не перекладає',
      !agentKanPost(agent({ ruimte: 'technisch', heeftSleutel: true })) && !agentKanPost(agent({ allowedMailRead: false, heeftSleutel: true })) && agentKanPost(agent({ heeftSleutel: true })));
  }

  // ================================================================ C. сервер
  const meldingen: Array<{ kind: string; title: string; message: string; link?: string }> = [];
  registreerMelder(async (_uid, _email, kind, title, message, link) => { meldingen.push({ kind, title, message, link }); });
  const audit: string[] = [];
  const routes = createAiVertalingRoutes({
    requireSession: async () => ({ user: { id: UID, status: 'approved' }, service: 'mail' }),
    audit: async (_uid, action) => { audit.push(action); },
  });
  const post = async (pad: string, body: Record<string, unknown>) => {
    const res = await (routes as Record<string, Array<(ctx: unknown) => Promise<{ statusCode: number; body: string }>>>)[pad][0]({ event: {}, body });
    return { status: res.statusCode, data: JSON.parse(res.body) };
  };
  try {
    // Sleutel alleen voor Gemini: de standaardagent (Anthropic) en een MCP-koppeling (Claude → anthropic) hebben er geen.
    setAiVertalingDeps({
      getApiKeyForProvider: async (_uid, aanbieder) => (aanbieder === 'gemini' ? 'nep-gemini-sleutel' : null),
      loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
    });
    const st = await post('POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    const agents = st.data.agents as AiVertalingAgentInfo[];
    const gemini = agents.find((a) => /gemini/i.test(a.platform));
    const basis = agents.find((a) => a.id === 'prive:mijn-ruimte-assistent');
    check('C /state: агент із ключем — heeftSleutel=true; «Приватний асистент» без ключа — heeftSleutel=false з чесним статусом',
      st.status === 200 && gemini?.heeftSleutel === true && (!basis || (basis.heeftSleutel === false && /немає ключа/.test(basis.statusUk))),
      JSON.stringify(agents.map((a) => [a.id, a.heeftSleutel, a.statusUk])));
    check('C /state: рушій «власний агент» працює (є Gemini з ключем), налаштування типово вимкнене',
      (st.data.motoren as Array<{ id: string; staat: string }>).find((m) => m.id === 'eigen-agent')?.staat === 'werkt' && st.data.settings.balkTonen === false);

    setAiVertalingDeps({ getApiKeyForProvider: async () => null, loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }) });
    const geen = await post('POST /api/owner/mail/ai-vertaling/state', { service: 'mail' });
    check('C /state без жодного ключа: рушій «треба підключити» — панель не з\'явиться навіть увімкнена',
      (geen.data.motoren as Array<{ id: string; staat: string }>).find((m) => m.id === 'eigen-agent')?.staat === 'aansluiten'
      && (geen.data.agents as AiVertalingAgentInfo[]).every((a) => a.ruimte !== 'prive' || a.heeftSleutel === false));

    const voor = meldingen.length;
    const aan = await post('POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', balkTonen: true });
    const nogmaals = await post('POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', balkTonen: true });
    const andere = await post('POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', summaryDepth: 'detailed' });
    const uit = await post('POST /api/owner/mail/ai-vertaling/settings', { service: 'mail', balkTonen: false });
    const nieuw = meldingen.slice(voor);
    check('C /settings: balkTonen зберігається; інше налаштування його не скидає',
      aan.data.settings.balkTonen === true && nogmaals.data.settings.balkTonen === true && andere.data.settings.balkTonen === true && uit.data.settings.balkTonen === false);
    check('C центр сповіщень: рівно два записи (увімкнено, вимкнено), тип mail_ai_balk, обидві мови, посилання на пошту',
      nieuw.length === 2 && nieuw.every((m) => m.kind === 'mail_ai_balk' && m.link === '/mail') && /увімкнено/.test(nieuw[0].title) && /aangezet/.test(nieuw[0].title) && /вимкнено/.test(nieuw[1].title) && /«Вигляд»/.test(nieuw[1].message),
      JSON.stringify(nieuw.map((m) => m.title)));
    check('C журнал аудиту фіксує кожну зміну налаштувань', audit.filter((a) => a === 'owner.mail.ai_vertaling.settings').length === 4);
    check('C тип сповіщення зареєстровано: пошта, приватний простір (після 0107 — через префікс)',
      (MELDING_SOORTEN as Record<string, { type: string }>).mail_ai_balk?.type === 'post' && SFEER_PER_SOORT.mail_ai_balk === 'prive' && NA_0107_VIA_VOORVOEGSEL.has('mail_ai_balk'));
  } finally {
    setAiVertalingDeps(null);
  }

  // ================================================================ D. панель
  {
    const { default: AiVertalingBalk } = await import('../../src/mail/AiVertalingBalk');
    const props = { context: { service: 'mail' }, accountId: 'a', messageId: 'm1', subject: 'Тема', bodyText: 'Текст', segments: [{ id: 's0', text: 'Текст' }], translationActive: false, onToggleTranslationActive: () => undefined, onTranslationsReady: () => undefined } as unknown as Parameters<typeof AiVertalingBalk>[0];
    const leeg = renderToString(createElement(AiVertalingBalk, props));
    check('D без відповіді сервера панелі немає зовсім (порожній рядок, жодного місця)', leeg === '', leeg.slice(0, 80));
    const html = renderToString(createElement(AiVertalingBalk, { ...props, voorbeeldZichtbaar: true }));
    check('D видима панель має хрестик «Сховати панель ШІ над усіма листами» з поясненням, як повернути',
      /data-testid="ai-vb-sluit"/.test(html) && html.includes('Сховати панель ШІ над усіма листами') && html.includes('«Вигляд»'));
    const bron = lees('src/mail/AiVertalingBalk.tsx');
    check('D у панелі більше немає вигаданого «Приватного асистента» при збої та мертвих адрес /ai і #sleutels',
      !bron.includes("name: 'Приватний асистент Мого Простору'") && !bron.includes('mcp.tarasevych.com/agents#sleutels') && !/href=\{AI_TOEGANG_HREF\}/.test(bron) && !/href=\{motor\.aansluitenHref\}/.test(bron));
    const uitleg = lees('src/mail/AiUitleg.tsx');
    // MAILAI-002 (16.11): Chrome тепер робочий локальний рушій — пояснення каже це, а не «ще не користується».
    check('D пояснення «Як працює ШІ в пошті» в обох мовах: ключ API, конектор лише в один бік, Gemini безкоштовний рівень, локальний ШІ Chrome',
      uitleg.includes('Як працює ШІ в пошті') && uitleg.includes('Hoe de AI in de post werkt') && /Конектор/.test(uitleg) && /в один бік/.test(uitleg) && /безкоштовний рівень/.test(uitleg) && /вбудований ШІ Chrome/.test(uitleg) && /ingebouwde AI van Chrome/.test(uitleg));
    const weergave = lees('src/mail/WeergaveKeuze.tsx');
    check('D перемикач у «Вигляд»: «ШІ-аналіз над листом» Вимкнено/Увімкнено, обидві мови, підказки з наслідками',
      weergave.includes("t('ШІ-аналіз над листом', 'AI-analyse boven het bericht')") && weergave.includes('zetAiBalkTonen') && /title=\{t\('Над кожним листом/.test(weergave));
  }

  // aiHrefOplossen met de runtime van de eigen installatie (BYOS: domeinen uit public/canonical-service.js, niet hard)
  {
    const g = globalThis as Record<string, unknown>;
    g.__TSV_CANONICAL_SERVICE__ = { canonicalUrl: (s: string, t: string, l: string) => `https://${s}.voorbeeld.test/${t}?${l}` };
    g.document = { documentElement: { lang: 'nl' } };
    const { aiHrefOplossen } = await import('../../src/mail/ai-staat');
    const t1 = aiHrefOplossen('/ai'), t2 = aiHrefOplossen('/ai', 'sleutels'), t3 = aiHrefOplossen('https://mcp.voorbeeld.test/agenten#tokens'), t4 = aiHrefOplossen('');
    check('D «/ai» (404 на mail.*) → «Підключення ШІ → Доступи» або «Сховище ключів» власного сервера; справжні адреси не чіпаються',
      t1 === 'https://mcp.voorbeeld.test/agents?nl#toegang' && t2 === 'https://api.voorbeeld.test/vault?nl' && t3 === 'https://mcp.voorbeeld.test/agenten#tokens' && t4 === t1, `${t1} | ${t2} | ${t3}`);
    delete g.__TSV_CANONICAL_SERVICE__; delete g.document;
  }

  // ================================================================ E. підказка «?»
  {
    const css = lees('src/hulp/hulp-knop.css'), toegang = lees('src/toegangslaag.css'), tip = lees('src/InfoTip.tsx');
    check('E стилі спливної підказки (position:fixed, тло й текст з токенів) вантажить сам InfoTip',
      tip.includes("import './hulp/hulp-knop.css';") && /\.info-tip-tekst\{position:fixed;[^}]*background:var\(--panel\);color:var\(--text\)/.test(css) && /\.info-tip-tekst\[hidden\]\{display:none\}/.test(css));
    const overlay = lees('src/mail-overlay-oppervlak.css');
    check('E пошта не фарбує підказку «?» інвертованим тлом (var(--text)): білий-на-білому в темній, чорний-на-чорному у світлій темі',
      overlay.includes(".canonical-chrome [role='tooltip']:not(.info-tip-tekst),") && !overlay.includes(".canonical-chrome [role='tooltip'],"));
    check('E у toegangslaag.css базових правил більше немає (одне джерело), лише перевизначення для access-plane',
      !/^\.info-tip-tekst\{/m.test(toegang) && /:is\(\.access-plane/.test(toegang));
  }

  return einde();
}
