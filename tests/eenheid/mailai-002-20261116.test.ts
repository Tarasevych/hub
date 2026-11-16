// MAILAI-002 (16.11.2026): вибір рушія ШІ в пошті — хто обробляє текст, де, чиїм ключем, безкоштовно чи платно; локальний ШІ Chrome
// як безкоштовний рушій; «сховати зараз» ≠ «вимкнути зовсім»; чесні ліміти; ключ ніколи не йде не тому постачальнику.
// Draaien: node scripts/eenheidstests.mjs mailai-002-20261116.test.ts
//  A. стан локального ШІ з PING розширення: телефон, немає розширення, старе, вимкнено, «!» вимкнено, модель не завантажена, готово.
//  B. модель рушіїв: картки з дорогою тексту/ключем/вартістю; «авто» = спершу безкоштовний; явний вибір ніколи не підмінюється
//     мовчки (локальний + «контекст» → нічого не надсилається); інший рушій при ліміті; офіційні джерела — https для всіх постачальників.
//  C. переклад блоками: один фрагмент на рядок, ліміт розміру, повернення назад; модель змінила кількість рядків → null.
//  D. сервер: «Асистент» з єдиним ключем Gemini шле запит САМЕ в Google (раніше ключ міг піти на api.anthropic.com); 429 → AANBIEDER_LIMIET
//     з часом очікування і порадою; 401 → AANBIEDER_SLEUTEL_ONGELDIG; успіх називає постачальника.
//  E. інтерфейс: рядок «Обробляє: …», хрестик відкриває вибір (сховати зараз / вимкнути зовсім), «Що від вас потрібно?» не надсилає
//     постачальнику, коли обрано локальний ШІ; «Вигляд» каже про локальний ШІ навіть без розширення.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { type AiVertalingAgentInfo, type AiVertalingRunResponse } from '../../shared/ai-vertaling';
import { AI_AANBIEDERS } from '../../shared/ai-aanbieders';
import {
  AANBIEDER_BRONNEN, andereMotor, blokTerug, kiesMotor, LOKAAL_MOTOR_ID, lokaalStandVan, MOTOR_AUTO, motorenVoorPost,
  samenvattingVanTekst, vertaalBlokken, verwerktDoor,
} from '../../shared/mail-ai-motor';
import { clearAiVertalingCache, executeAiVertalingRun, setAiVertalingDeps } from '../../backend/ai-vertaling-routes';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const UID = 'user-mailai-002';
const agent = (over: Partial<AiVertalingAgentInfo> = {}): AiVertalingAgentInfo => ({
  id: 'prive:vault-gemini', name: 'Gemini', platform: 'gemini', source: 'vault', ruimte: 'prive', scopes: ['mail.read'],
  allowedMailRead: true, allowedFilesRead: false, statusUk: 'Активний', heeftSleutel: true, ...over,
});
const ping = (lai: Record<string, unknown>, version = '0.9.3') => ({ ok: true, version, lokaleAi: { ondersteund: true, aan: true, apis: ['translator', 'summarizer'], siteToegang: true, ...lai } });

export async function main(): Promise<number> {
  const { check, einde } = checker('mailai-002-20261116');

  // ================================================================ A
  {
    const s = {
      tel: lokaalStandVan(ping({}), { mobiel: true }), geen: lokaalStandVan(null), fout: lokaalStandVan({ ok: false }),
      oud: lokaalStandVan(ping({}, '0.9.1')), ondersteundNiet: lokaalStandVan({ ok: true, version: '0.9.3' }),
      uit: lokaalStandVan(ping({ aan: false })), apisUit: lokaalStandVan(ping({ apis: ['prompt'] })), site: lokaalStandVan(ping({ siteToegang: false })),
      download: lokaalStandVan(ping({ stand: { translator: 'downloadable', summarizer: 'downloadable' } })),
      nietHier: lokaalStandVan(ping({ stand: { translator: 'unavailable', summarizer: 'unavailable' } })),
      klaar: lokaalStandVan(ping({ stand: { translator: 'available', summarizer: 'downloadable' } })), zonderMeting: lokaalStandVan(ping({})),
    };
    check('A стан локального ШІ: телефон / немає / старе / вимкнено / «!» вимкнено / модель не завантажена / не підтримує / готово',
      s.tel === 'telefoon' && s.geen === 'geen-extensie' && s.fout === 'geen-extensie' && s.oud === 'oud' && s.ondersteundNiet === 'oud' && s.uit === 'uit'
      && s.apisUit === 'uit' && s.site === 'site-uit' && s.download === 'model-ontbreekt' && s.nietHier === 'niet-hier' && s.klaar === 'klaar' && s.zonderMeting === 'klaar',
      JSON.stringify(s));
  }

  check('A майбутнє поле PING lokaleAi.reden має перевагу (зокрема beleid-uit — адміністратор вимкнув); сміття ігнорується',
    lokaalStandVan(ping({ reden: 'beleid-uit' })) === 'beleid-uit' && lokaalStandVan(ping({ reden: 'model-ontbreekt' })) === 'model-ontbreekt' && lokaalStandVan(ping({ reden: 'xyz', siteToegang: false })) === 'site-uit'
    && motorenVoorPost([], 'beleid-uit')[0].staat === 'niet-hier');

  // ================================================================ B
  {
    const k = motorenVoorPost([agent(), agent({ id: 'oauth:claude', name: 'Claude', platform: 'mcp-oauth', heeftSleutel: false })], 'klaar');
    const lok = k.find((x) => x.id === LOKAAL_MOTOR_ID)!;
    const gem = k.find((x) => x.id === 'prive:vault-gemini')!;
    const cla = k.find((x) => x.id === 'oauth:claude')!;
    check('B картки: локальний (безкоштовно, нічого не надсилається), Gemini (ваш ключ, безкоштовний рівень), Claude без ключа — «потрібен крок»',
      lok.staat === 'klaar' && lok.kosten === 'gratis' && /нікуди не надсилається/i.test(lok.wegUk) && /nergens heen/.test(lok.wegNl)
      && gem.staat === 'klaar' && gem.kosten === 'gratis-niveau' && /ваш власний ключ/.test(gem.sleutelUk) && /ніколи ключ власника/.test(gem.sleutelUk) && /nooit de sleutel van de eigenaar/.test(gem.sleutelNl)
      && cla.staat === 'instellen' && cla.kosten === 'betaald');
    check('B «ще не налаштовані» способи названо чесно: власний сервер і спільний ШІ власника',
      k.some((x) => x.id === 'eigen-server' && x.staat === 'nog-niet') && k.some((x) => x.id === 'dienst-eigenaar' && x.staat === 'nog-niet'));
    check('B «авто» бере спершу безкоштовний (локальний), для «контексту» — постачальника',
      kiesMotor(k, MOTOR_AUTO, 'translate')?.id === LOKAAL_MOTOR_ID && kiesMotor(k, MOTOR_AUTO, 'context')?.id === 'prive:vault-gemini');
    check('B явний вибір локального + «контекст» → null: текст не йде постачальнику без вашого вибору',
      kiesMotor(k, LOKAAL_MOTOR_ID, 'context') === null && kiesMotor(k, LOKAAL_MOTOR_ID, 'summary')?.id === LOKAAL_MOTOR_ID);
    check('B вибір агента, якого вже немає, → «авто»; вибір без ключа → null',
      kiesMotor(k, 'oauth:weg', 'translate')?.id === LOKAAL_MOTOR_ID && kiesMotor(k, 'oauth:claude', 'translate') === null);
    check('B ліміт: інший готовий рушій (не той самий)', andereMotor(k, LOKAAL_MOTOR_ID, 'translate')?.id === 'prive:vault-gemini' && andereMotor(k, 'prive:vault-gemini', 'translate')?.id === LOKAAL_MOTOR_ID);
    const telefoon = motorenVoorPost([agent()], 'telefoon');
    check('B на телефоні локальний — «не на цьому пристрої» з поясненням, «авто» бере ваш ключ',
      telefoon[0].staat === 'niet-hier' && /телефон/.test(telefoon[0].stapUk) && kiesMotor(telefoon, MOTOR_AUTO, 'translate')?.id === 'prive:vault-gemini');
    check('B офіційні джерела: ціни й умови для кожного постачальника, лише https; Z.ai попереджає про сервер у Китаї',
      AI_AANBIEDERS.every((a) => /^https:\/\//.test(AANBIEDER_BRONNEN[a.id].prijzen) && /^https:\/\//.test(AANBIEDER_BRONNEN[a.id].gegevens)) && /Китаї/.test(AANBIEDER_BRONNEN.autoclaw.kostenUk)
      && /ЄЕЗ/.test(AANBIEDER_BRONNEN.gemini.kostenUk) && /EER/.test(AANBIEDER_BRONNEN.gemini.kostenNl));
    check('B «хто обробив»: локально — нічого не надіслано; сервер — назва постачальника і «вашим власним ключем»',
      /нічого не надіслано/.test(verwerktDoor({ lokaal: true }, false)) && /Google Gemini API, вашим власним ключем/.test(verwerktDoor({ aanbiederId: 'gemini' }, false)) && /met uw eigen sleutel/.test(verwerktDoor({ aanbiederId: 'gemini' }, true)));
  }

  // ================================================================ C
  {
    const seg = [{ id: 'a', text: 'Eerste\nregel  hier' }, { id: 'b', text: '   ' }, { id: 'c', text: 'Tweede' }];
    const b = vertaalBlokken(seg);
    check('C один фрагмент на рядок, переноси всередині стають пробілами, порожні пропущено',
      b.length === 1 && b[0].tekst === 'Eerste regel hier\nTweede' && b[0].ids.join() === 'a,c', JSON.stringify(b));
    const veel = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, text: 'x'.repeat(1000) }));
    const blokken = vertaalBlokken(veel, 5000);
    check('C великий лист ділиться на блоки в межах ліміту, порядок збережено',
      blokken.length === 8 && blokken.every((x) => x.tekst.length <= 5000) && blokken.flatMap((x) => x.ids).join() === veel.map((x) => x.id).join());
    check('C переклад назад: рядки → фрагменти; інша кількість рядків → null (тоді — по фрагменту)',
      JSON.stringify(blokTerug(['a', 'c'], 'Перший рядок\n\nДругий\n')) === JSON.stringify({ a: 'Перший рядок', c: 'Другий' }) && blokTerug(['a', 'c'], 'Усе в одному рядку') === null);
    const sm = samenvattingVanTekst('* Головне\n* Факт 1\n- Факт 2');
    check('C підсумок Summarizer → заголовок і факти', sm.headline === 'Головне' && sm.keyFacts.join('|') === 'Факт 1|Факт 2');
  }

  // ================================================================ D
  const verzoeken: Array<{ url: string; sleutel: string }> = [];
  let status = 200;
  let retry = '';
  try {
    setAiVertalingDeps({
      fetch: (async (url: unknown, init?: RequestInit) => {
        const h = (init?.headers || {}) as Record<string, string>;
        verzoeken.push({ url: String(url), sleutel: h['x-goog-api-key'] || h['x-api-key'] || h.authorization || '' });
        if (status !== 200) return new Response('{}', { status, headers: retry ? { 'retry-after': retry } : {} });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ detectedSourceLang: 'nl', translations: { s0: 'Привіт' } }) }] } }] }), { status: 200 });
      }) as unknown as typeof fetch,
      getApiKeyForProvider: async (_uid, a) => (a === 'gemini' ? 'nep-gemini-sleutel' : null),
      loadAgents: async () => [agent({ id: 'prive:mijn-ruimte-assistent', name: 'Приватний асистент', platform: 'mijn-ruimte' })],
      loadPolicyCeiling: async () => ({ mailRead: 'always', filesRead: 'always', userBlocked: false }),
    });
    clearAiVertalingCache(UID);
    const r = await executeAiVertalingRun({ userId: UID, mode: 'translate', targetLang: 'uk', agentId: 'prive:mijn-ruimte-assistent', messageId: 'm1', subject: '', bodyText: 'Hallo', segments: [{ id: 's0', text: 'Hallo' }] });
    check('D «Асистент» з єдиним ключем Gemini: запит іде в Google з ключем Gemini, не на api.anthropic.com',
      r.status === 200 && verzoeken.length === 1 && verzoeken[0].url.startsWith('https://generativelanguage.googleapis.com/') && verzoeken[0].sleutel === 'nep-gemini-sleutel' && !verzoeken.some((v) => v.url.includes('anthropic.com')),
      JSON.stringify(verzoeken.map((v) => v.url)));
    check('D успішна відповідь називає постачальника, що обробив текст', (r.body as AiVertalingRunResponse).aanbiederId === 'gemini' && (r.body as AiVertalingRunResponse).translations?.s0 === 'Привіт');

    status = 429; retry = '42';
    clearAiVertalingCache(UID);
    const lim = await executeAiVertalingRun({ userId: UID, mode: 'translate', targetLang: 'uk', agentId: 'prive:mijn-ruimte-assistent', messageId: 'm2', subject: '', bodyText: 'Dag', segments: [{ id: 's0', text: 'Dag' }] });
    const lb = lim.body as Record<string, unknown>;
    check('D ліміт постачальника → 429 AANBIEDER_LIMIET: хто, скільки чекати, порада взяти інший рушій (обидві мови)',
      lim.status === 429 && lb.error === 'AANBIEDER_LIMIET' && lb.aanbiederId === 'gemini' && lb.wachtSec === 42 && /42 с/.test(String(lb.messageUk)) && /локальний ШІ Chrome/.test(String(lb.messageUk)) && /lokale AI van Chrome/.test(String(lb.messageNl)),
      JSON.stringify(lb));
    status = 401; retry = '';
    clearAiVertalingCache(UID);
    const ong = await executeAiVertalingRun({ userId: UID, mode: 'translate', targetLang: 'uk', agentId: 'prive:mijn-ruimte-assistent', messageId: 'm3', subject: '', bodyText: 'Dag', segments: [{ id: 's0', text: 'Dag' }] });
    check('D недійсний ключ → AANBIEDER_SLEUTEL_ONGELDIG з посиланням на «Сховище ключів»',
      ong.status === 503 && (ong.body as Record<string, unknown>).error === 'AANBIEDER_SLEUTEL_ONGELDIG' && /не прийняв ваш ключ/.test(String((ong.body as Record<string, unknown>).messageUk)));
    const tekst = JSON.stringify([lb, ong.body]);
    check('D у відповідях немає самого ключа', !tekst.includes('nep-gemini-sleutel'));
  } finally {
    setAiVertalingDeps(null);
  }

  // ================================================================ E
  {
    const { default: AiVertalingBalk } = await import('../../src/mail/AiVertalingBalk');
    const props = { context: { service: 'mail' }, accountId: 'a', messageId: 'm1', subject: 'Тема', bodyText: 'Текст', segments: [{ id: 's0', text: 'Текст' }], translationActive: false, onToggleTranslationActive: () => undefined, onTranslationsReady: () => undefined, voorbeeldZichtbaar: true } as unknown as Parameters<typeof AiVertalingBalk>[0];
    const html = renderToString(createElement(AiVertalingBalk, props));
    check('E панель: рядок «Обробляє / хто обробляє» з кнопкою «Змінити · як обробляється текст»; вибір закриття закритий типово',
      html.includes('data-testid="ai-vb-wie"') && html.includes('Змінити · як обробляється текст') && !html.includes('ai-vb-sluit-keuze') && html.includes('aria-haspopup="true"'));
    const bron = lees('src/mail/AiVertalingBalk.tsx');
    check('E хрестик: «Сховати зараз» (лише вкладка, налаштування не змінюються) і «Вимкнути зовсім» (усі пристрої) — обидві мови',
      bron.includes('data-sluit="sessie"') && bron.includes('data-sluit="uit"') && bron.includes('zetBalkSessieVerborgen(true)') && /Лише до закриття цієї вкладки/.test(bron) && /Alleen tot u dit tabblad sluit/.test(bron) && /На всіх ваших пристроях/.test(bron));
    check('E локальний рушій: переклад і підсумок через розширення, нічого на сервер; помилка → інший рушій',
      bron.includes("motor.soort === 'lokaal'") && bron.includes('vertaalLokaal(') && bron.includes('vatSamenLokaal(') && bron.includes('andereMotor(kaarten, motor.id, mode)'));
    const wat = lees('src/mail/WatNodigBlok.tsx');
    // MAILAI-003: кнопка тепер залежить від рушія, обраного в панелі (kiesMotor … 'acties'): локальний без «сирого» запиту цього не вміє →
    // рушія немає → кнопки немає і нічого не надсилається (раніше це була окрема умова lokaalGekozen).
    check('E «Що від вас потрібно?»: обраний рушій цього не вміє (локальний до 0.9.6) → «Уточнити з ШІ» не показується і не надсилає; видно, хто обробив',
      wat.includes('if (!motor || bezig) return;') && wat.includes('{motor && !model && (') && wat.includes("kiesMotor(kaarten, voorkeur, 'acties')") && wat.includes('data-ai-lokaal-gekozen') && wat.includes('verwerktDoor(') && /нічого не надсилається/.test(wat));
    const weergave = lees('src/mail/WeergaveKeuze.tsx');
    check('E «Вигляд»: про безкоштовний локальний ШІ Chrome знають і без розширення (стан + кнопка встановити/увімкнути); «Показати знову» після «сховати зараз»',
      weergave.includes("t('Безкоштовний локальний ШІ Chrome:'") && weergave.includes("'extensie')") && weergave.includes('openExtensieOpties') && weergave.includes('data-weergave-ai-sessie'));
    const lm = lees('src/mail/lokale-motor.ts');
    check('E розширення: лише PING / LOKALE_AI / OPEN_OPTIONS; сайт сам «!» не вмикає', /type: 'PING'/.test(lm) && /type: 'LOKALE_AI'/.test(lm) && /OPEN_OPTIONS/.test(lm) && !/siteToegang\s*[:=]\s*true/.test(lm));
  }

  return einde();
}
