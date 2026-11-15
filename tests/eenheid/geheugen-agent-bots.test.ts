// Одиничні та інтеграційні перевірки реєстру окремих Telegram-ботів по агентах (0280):
//   1. Каталог із 15+ профілів агентів, підтримка власних кодів, валідація токенів, маскування й блокування секретів;
//   2. Офіційна перевірка Telegram API (getMe, getChat, getChatMember) через ін’єктований telegramFetch;
//   3. Пауза, відкликання, фільтр видів повідомлень, ідемпотентна черга доставлення та передача за taakId;
//   4. Збереження першоджерела при збої Telegram API + безпечний повтор без дублювання й ручне внесення розмов;
//   5. Повні HTTP-маршрути, ізоляція користувачів і просторів, реєстрація MCP-інструментів, політик і PG RLS + Сховище ключів.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  AGENT_PROFIEL_CATALOGUS,
  bevatGevoeligGeheim,
  BOT_FOUTEN,
  isGeldigBotSleutelFormaat,
  maakTelegramBerichtTekst,
  maskeerBotSleutel,
  valideerBestandsVerwijzingen,
} from '../../shared/geheugen-stroom';
import { maakGeheugenInGeheugenOpslag } from '../../backend/geheugen-stroom';
import {
  geheugenAgentBotsRoutes,
  maakBotsInGeheugenOpslag,
  maakPgBotsOpslag,
  type TelegramFetchFn,
} from '../../backend/geheugen-agent-bots';
import { SITE_TOOL_BY_NAME } from '../../backend/site-hulpmiddelen';
import { TOEGESTANE_ROUTES } from '../../backend/site-aanroep';
import { v2Optie } from '../../shared/connector-v2/catalogus';
import { capabilityForTool } from '../../shared/ai-beleid/catalogus';
import { SLEUTELKLUIS_REGISTER } from '../../shared/sleutelkluis';
import { actieDoel, actieSoort, actieZin, foutUitleg } from '../../shared/mcp-acties';
import { closePool, getPool } from '../../server/platform/pg';

type Antwoord = { statusCode: number; body: string };
const lees = (r: unknown): Record<string, any> => JSON.parse((r as Antwoord).body || '{}');
const codeVan = (r: unknown): string => String(lees(r).error || lees(r).reasonCode || '');

function maakNepToken(nr = 100200300): string {
  return [String(nr), 'AA' + 'NepTestBotSleutelVoorEenheid0123456789'].join(':');
}

function maakNepTelegramFetch(opties: {
  isForum?: boolean;
  memberStatus?: string;
  canSend?: boolean;
  failSend?: boolean;
  aanroepen: Array<{ methode: string; body: Record<string, unknown> }>;
}): TelegramFetchFn {
  let berichtNr = 500;
  return async (url, init) => {
    const methode = url.split('/').pop() || '';
    const body = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
    opties.aanroepen.push({ methode, body });

    if (methode === 'getMe') {
      return new Response(
        JSON.stringify({ ok: true, result: { id: 777001, is_bot: true, username: 'mijn_ruimte_agent_bot', first_name: 'AgentBot' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (methode === 'getChat') {
      return new Response(
        JSON.stringify({
          ok: true,
          result: { id: body.chat_id, type: 'supergroup', is_forum: opties.isForum ?? true, permissions: { can_send_messages: true } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (methode === 'getChatMember') {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            status: opties.memberStatus ?? 'administrator',
            is_member: opties.memberStatus !== 'left' && opties.memberStatus !== 'kicked',
            can_send_messages: opties.canSend ?? true,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (methode === 'sendMessage') {
      if (opties.failSend) {
        return new Response(
          JSON.stringify({ ok: false, error_code: 502, description: 'Bad Gateway tijdelijk' }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        );
      }
      berichtNr += 1;
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: berichtNr } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ok: false, error_code: 404, description: 'Onbekende methode' }), { status: 404 });
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('geheugen-agent-bots');
  const nepToken = maakNepToken(111222333);
  const nepToken2 = maakNepToken(444555666);

  // ================================================================ 1. Каталог 15+ профілів, валідація й захист від таємниць
  {
    const slugs = AGENT_PROFIEL_CATALOGUS.map((p) => p.slug);
    const masker = maskeerBotSleutel(true, nepToken);
    const badVerw = valideerBestandsVerwijzingen([{ naam: 'sleutel.txt', verwijzing: nepToken }]);
    const tekst = maakTelegramBerichtTekst({
      ruimte: 'prive',
      agentSlug: 'claude',
      taakId: 'taak-42',
      soortBericht: 'overdracht',
      titel: 'Передача результату перевірки',
      samenvatting: 'Усі перевірки пройшли чисто.',
      bestandsVerwijzingen: [{ naam: 'zvit.md', verwijzing: '/cloud/zvit.md', sha256: 'a'.repeat(64) }],
    });
    check('1a: каталог містить щонайменше 15 профілів, унікальні коди, правильну перевірку токенів і маскування',
      AGENT_PROFIEL_CATALOGUS.length >= 15
      && new Set(slugs).size === AGENT_PROFIEL_CATALOGUS.length
      && slugs.includes('claude') && slugs.includes('codex') && slugs.includes('gemini') && slugs.includes('antigravity')
      && isGeldigBotSleutelFormaat(nepToken)
      && !isGeldigBotSleutelFormaat('ongeldig-token')
      && masker.startsWith('••••') && !masker.includes(nepToken.slice(0, 12))
      && bevatGevoeligGeheim(`bot=${nepToken}`)
      && !badVerw.ok && badVerw.code === BOT_FOUTEN.geheimGeweigerd
      && tekst.includes('[claude]') && tekst.includes('taak-42') && tekst.includes('sha256:aaaaaaaaaaaa'));
  }

  // ================================================================ 2. Перевірка Telegram API, статуси й черги доставлення (in-memory)
  {
    let mode = { isForum: false, memberStatus: 'administrator', canSend: true, failSend: false };
    const calls: Array<{ methode: string; body: Record<string, unknown> }> = [];
    const dynFetch: TelegramFetchFn = (u, i) =>
      maakNepTelegramFetch({ ...mode, aanroepen: calls })(u, i);

    const stroom = maakGeheugenInGeheugenOpslag();
    const opslag = maakBotsInGeheugenOpslag({ telegramFetch: dynFetch, stroomOpslag: stroom });
    const ladeA = { userId: 'gebruiker-a', ruimte: 'prive' as const };
    const ladeATech = { userId: 'gebruiker-a', ruimte: 'technisch' as const };
    const ladeB = { userId: 'gebruiker-b', ruimte: 'prive' as const };

    // Збереження власного профілю та профілю з каталогу; токен не повертається
    const op1 = await opslag.bewaarBot(ladeA, {
      agentSlug: 'claude',
      botSleutel: nepToken,
      chatId: '-1001234567890',
      threadId: 17,
      toegestaneBerichtSoorten: ['gebeurtenis', 'overdracht', 'gesprek'],
    });
    const opEigen = await opslag.bewaarBot(ladeA, {
      agentSlug: 'eigen-assistent',
      dienstNaam: 'Власний помічник',
      weergaveNaam: 'Eigen Assistent',
      botSleutel: nepToken2,
      chatId: '-100999888777',
    });
    check('2a: профілі каталогу та власний агент зберігаються, а токен ніколи не повертається в об’єкті бота',
      op1.ok && opEigen.ok
      && op1.bot.sleutelAanwezig && !JSON.stringify(op1.bot).includes(nepToken)
      && opEigen.bot.agentSlug === 'eigen-assistent');

    // Не форум при заданому threadId → BOT_FORUM_VEREIST
    const testNietForum = await opslag.testenBot(ladeA, 'claude');
    check('2b: група без увімкненого форуму при заданому thread_id чесно відхиляє публікацію з BOT_FORUM_VEREIST',
      testNietForum.ok && !testNietForum.bot.kanPubliceren && testNietForum.foutCode === BOT_FOUTEN.forumVereist);

    // Форум увімкнений, але бот обмежений у правах → BOT_GEEN_PUBLICATIERECHT
    mode = { isForum: true, memberStatus: 'restricted', canSend: false, failSend: false };
    const testGeenRecht = await opslag.testenBot(ladeA, 'claude');
    check('2c: обмежений бот без can_send_messages отримує BOT_GEEN_PUBLICATIERECHT',
      testGeenRecht.ok && !testGeenRecht.bot.kanPubliceren && testGeenRecht.foutCode === BOT_FOUTEN.geenPublicatierecht);

    // Успішне підтвердження прав → статус actief
    mode = { isForum: true, memberStatus: 'administrator', canSend: true, failSend: false };
    const testOk = await opslag.testenBot(ladeA, 'claude');
    const testEigen = await opslag.testenBot(ladeA, 'eigen-assistent');
    check('2d: після підтвердження прав у форумі бот переходить у status=actief і kanPubliceren=true',
      testOk.ok && testOk.bot.kanPubliceren && testOk.bot.status === 'actief' && testOk.bot.botUsername === 'mijn_ruimte_agent_bot'
      && testEigen.ok && testEigen.bot.kanPubliceren);

    // Заборонений вид повідомлення (besluit не включено для claude)
    const verbodenSoort = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'claude',
      taakId: 'taak-101',
      soortBericht: 'besluit',
      titel: 'Спроба надіслати заборонений вид',
      idempotentieSleutel: 'soort-test-1',
    });
    check('2e: вид повідомлення поза toegestaneBerichtSoorten відхиляється з BOT_SOORT_NIET_TOEGESTAAN',
      !verbodenSoort.ok && verbodenSoort.code === BOT_FOUTEN.soortNietToegestaan);

    // Ідемпотентне відправлення + ланцюжок передавання завдання за taakId
    const sendVoor = calls.filter((c) => c.methode === 'sendMessage').length;
    const bez1 = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'claude',
      taakId: 'taak-101',
      soortBericht: 'overdracht',
      idempotentieSleutel: 'idem-taak-101-stap-1',
      titel: 'Передача контексту архітектури',
      samenvatting: 'Перший етап завершено чисто.',
      bestandsVerwijzingen: [{ naam: 'plan.md', verwijzing: '/cloud/plan.md' }],
    });
    const bez1Dup = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'claude',
      taakId: 'taak-101',
      soortBericht: 'overdracht',
      idempotentieSleutel: 'idem-taak-101-stap-1',
      titel: 'Передача контексту архітектури',
    });
    const bez2 = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'eigen-assistent',
      taakId: 'taak-101',
      vorigeBezorgingId: bez1.ok ? bez1.bezorging.id : undefined,
      soortBericht: 'rapport',
      idempotentieSleutel: 'idem-taak-101-stap-2',
      titel: 'Підсумковий звіт другого агента',
      samenvatting: 'Другий крок по тому ж taakId виконано.',
    });
    const sendNa = calls.filter((c) => c.methode === 'sendMessage').length;
    const keten = await opslag.overzicht(ladeA, { taakId: 'taak-101' });
    check('2f: ідемпотентний запит не надсилає дубль, а передача іншому агенту зв’язується за taakId та vorigeBezorgingId',
      bez1.ok && bez1.verzonden && !bez1.duplicaat
      && bez1Dup.ok && bez1Dup.duplicaat && bez1Dup.bezorging.id === bez1.bezorging.id
      && bez2.ok && bez2.verzonden && bez2.bezorging.vorigeBezorgingId === bez1.bezorging.id
      && sendNa === sendVoor + 2
      && keten.bezorgingen.length === 2);

    // Збій Telegram API → статус mislukt, токен приховано, повтор → verzonden
    mode.failSend = true;
    const mislukt = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'claude',
      taakId: 'taak-102',
      soortBericht: 'gebeurtenis',
      idempotentieSleutel: 'idem-taak-102-fail',
      titel: 'Тест збою Telegram',
      samenvatting: 'Повинно зберегтися в чергу при збої.',
    });
    mode.failSend = false;
    const herstel = mislukt.ok
      ? await opslag.opnieuwBezorgen(ladeA, mislukt.bezorging.id)
      : { ok: false as const, code: 'FAIL' };
    check('2g: при збої Telegram запис лишається зі status=mislukt (без витоку токена) і успішно повторюється через opnieuw',
      mislukt.ok && !mislukt.verzonden && mislukt.bezorging.status === 'mislukt' && mislukt.bezorging.pogingen === 1
      && !mislukt.bezorging.laatsteFout.includes(nepToken)
      && herstel.ok && herstel.verzonden && herstel.bezorging.status === 'verzonden' && herstel.bezorging.pogingen === 2);

    // Пауза та відкликання
    await opslag.zetBotStatus(ladeA, 'claude', 'gepauzeerd');
    const opPauze = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'claude',
      taakId: 'taak-103',
      soortBericht: 'gebeurtenis',
      titel: 'Надсилання при паузі',
    });
    await opslag.zetBotStatus(ladeA, 'claude', 'ingetrokken');
    const naIntrekken = await opslag.overzicht(ladeA, { agentSlug: 'claude' });
    const opIngetrokken = await opslag.bezorgBericht(ladeA, {
      agentSlug: 'claude',
      taakId: 'taak-103',
      soortBericht: 'gebeurtenis',
      titel: 'Надсилання після відкликання',
    });
    check('2h: пауза й відкликання блокують публікацію (BOT_GEPAUZEERD / BOT_INGETROKKEN), а відкликання очищує токен',
      !opPauze.ok && opPauze.code === BOT_FOUTEN.gepauzeerd
      && !opIngetrokken.ok && opIngetrokken.code === BOT_FOUTEN.ingetrokken
      && naIntrekken.bots[0]?.sleutelAanwezig === false);

    // Ручне внесення розмови зі сторонньої служби + ізоляція просторів/користувачів
    const handmatig = await opslag.gesprekInvoeren(ladeA, {
      agentSlug: 'eigen-assistent',
      taakId: 'taak-104',
      titel: 'Підсумок зовнішньої розмови',
      samenvatting: 'Погодили нову схему перевірок безпеки без передавання токенів.',
      bestandsVerwijzingen: [{ naam: 'schets.md', verwijzing: '/cloud/schets.md' }],
      ookBezorgen: true,
    });
    const techLeeg = await opslag.overzicht(ladeATech);
    const bLeeg = await opslag.overzicht(ladeB);
    check('2i: gesprekInvoeren створює вузол у Стрімі, доставляє в тему й надає чесне двомовне пояснення; простір і користувачі ізольовані',
      handmatig.ok
      && handmatig.knoop.labels.includes('handmatig-gesprek')
      && Boolean(handmatig.bezorging && handmatig.bezorging.status === 'verzonden')
      && handmatig.opmerkingUk.includes('ручний') && handmatig.opmerkingNl.includes('handmatig')
      && techLeeg.bots.length === 0 && techLeeg.bezorgingen.length === 0
      && bLeeg.bots.length === 0 && bLeeg.bezorgingen.length === 0);

    // ================================================================ 3. Повні HTTP-маршрути + RBAC + заборона секретів
    let huidigeUser = 'user-a';
    const routes = geheugenAgentBotsRoutes({
      requireSession: async (event) => {
        if (event.anoniem) return { errorCode: 'SESSION_REQUIRED' };
        return {
          user: {
            id: huidigeUser,
            email: `${huidigeUser}@example.test`,
            role: 'owner',
            status: 'approved',
            entitlements: ['api-platform'],
          },
          service: 'ai',
        };
      },
      opslag,
      ladeVan: async (uid, body) => ({
        userId: uid,
        ruimte: (body as Record<string, unknown>)?.ruimte === 'technisch' ? 'technisch' : 'prive',
      }),
      limiet: async () => true,
    });
    const roep = async (pad: string, body: Record<string, unknown>, event: Record<string, unknown> = {}) =>
      routes[pad][0]({ event, body } as never);

    const rAnon = await roep('POST /api/owner/ai/geheugen/bots/overzicht', {}, { anoniem: true });
    const rVreemd = await roep('POST /api/owner/ai/geheugen/bots/opslaan', { ownerUserId: 'ander', agentSlug: 'gemini' });
    const rGeheim = await roep('POST /api/owner/ai/geheugen/bots/bezorgen', {
      agentSlug: 'eigen-assistent',
      taakId: 't-sec',
      titel: `Злив ${nepToken}`,
    });
    const rOpslaan = await roep('POST /api/owner/ai/geheugen/bots/opslaan', {
      agentSlug: 'gemini',
      botSleutel: nepToken2,
      chatId: '-100333444555',
      threadId: 21,
    });
    const rTesten = await roep('POST /api/owner/ai/geheugen/bots/testen', { agentSlug: 'gemini' });
    const rBezorgOk = await roep('POST /api/owner/ai/geheugen/bots/bezorgen', {
      agentSlug: 'gemini',
      taakId: 'http-taak-1',
      soortBericht: 'gebeurtenis',
      idempotentieSleutel: 'http-idem-1',
      titel: 'Подія через HTTP-маршрут',
      samenvatting: 'Перевірка маршруту доставлення.',
    });
    const rOpnieuw = await roep('POST /api/owner/ai/geheugen/bots/opnieuw', {
      id: lees(rBezorgOk).bezorging?.id,
    });
    const rGesprek = await roep('POST /api/owner/ai/geheugen/bots/gesprek-invoeren', {
      agentSlug: 'gemini',
      taakId: 'http-taak-1',
      titel: 'Ручний підсумок через маршрут',
      samenvatting: 'Перенесено висновок бесіди.',
      ookBezorgen: false,
    });
    const rStatus = await roep('POST /api/owner/ai/geheugen/bots/status', {
      agentSlug: 'gemini',
      status: 'gepauzeerd',
    });
    const rVerwijderen = await roep('POST /api/owner/ai/geheugen/bots/verwijderen', { agentSlug: 'gemini' });
    const rOk = await roep('POST /api/owner/ai/geheugen/bots/overzicht', {});

    check('3: усі 8 HTTP-маршрутів перевірено (сесія, захист від ownerUserId, 400 при секреті, цикл opslaan → testen → bezorgen → opnieuw → gesprek-invoeren → status → verwijderen)',
      (rAnon as Antwoord).statusCode === 403
      && (rVreemd as Antwoord).statusCode === 403
      && (rGeheim as Antwoord).statusCode === 400 && codeVan(rGeheim) === BOT_FOUTEN.geheimGeweigerd
      && (rOpslaan as Antwoord).statusCode === 200 && lees(rOpslaan).bot?.agentSlug === 'gemini'
      && (rTesten as Antwoord).statusCode === 200 && lees(rTesten).bot?.kanPubliceren === true
      && (rBezorgOk as Antwoord).statusCode === 200 && lees(rBezorgOk).verzonden === true
      && (rOpnieuw as Antwoord).statusCode === 200 && lees(rOpnieuw).duplicaat === true
      && (rGesprek as Antwoord).statusCode === 200 && Boolean(lees(rGesprek).knoop?.id)
      && (rStatus as Antwoord).statusCode === 200 && lees(rStatus).bot?.status === 'gepauzeerd'
      && (rVerwijderen as Antwoord).statusCode === 200 && lees(rVerwijderen).ok === true
      && (rOk as Antwoord).statusCode === 200 && Array.isArray(lees(rOk).bots));
  }

  // ================================================================ 4. Реєстрація MCP-інструментів, політик, Сховища ключів і вкладки
  {
    const tOverzicht = SITE_TOOL_BY_NAME.get('geheugen_agent_bots_overzicht');
    const tBezorgen = SITE_TOOL_BY_NAME.get('geheugen_agent_bots_bezorgen');
    const v2Overzicht = v2Optie('geheugen_agent_bots_overzicht:gebruiker');
    const v2Bezorgen = v2Optie('geheugen_agent_bots_bezorgen:beheer');
    const doelBez = actieDoel('geheugen_agent_bots_bezorgen', {
      agent_slug: 'claude',
      taak_id: 'taak-99',
      soort_bericht: 'overdracht',
      titel: 'Приватний заголовок не потрапляє до журналу',
    });
    const uiBron = readFileSync('src/ai-ecosysteem/GeheugenStroomPaneel.tsx', 'utf8');
    const cssBron = readFileSync('src/ai-ecosysteem/geheugen-stroom.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const regBots = SLEUTELKLUIS_REGISTER.find((r) => r.tabel === 'app.geheugen_agent_bots');
    const regBez = SLEUTELKLUIS_REGISTER.find((r) => r.tabel === 'app.geheugen_telegram_bezorging');

    check('4: MCP-інструменти, політики, журнал без витоку заголовків, реєстр Сховища ключів та вкладка UI підключені',
      Boolean(tOverzicht && !tOverzicht.write && tBezorgen && tBezorgen.write)
      && TOEGESTANE_ROUTES.has('POST /api/owner/ai/geheugen/bots/overzicht')
      && TOEGESTANE_ROUTES.has('POST /api/owner/ai/geheugen/bots/bezorgen')
      && TOEGESTANE_ROUTES.has('POST /api/owner/ai/geheugen/bots/gesprek-invoeren')
      && Boolean(v2Overzicht && v2Bezorgen)
      && capabilityForTool('geheugen_agent_bots_overzicht') === 'site.read'
      && capabilityForTool('geheugen_agent_bots_bezorgen') === 'board.write'
      && actieSoort('geheugen_agent_bots_bezorgen') === 'geheugen'
      && doelBez === 'claude · overdracht · taak-99'
      && !String(doelBez).includes('Приватний')
      && actieZin('geheugen_agent_bots_overzicht', undefined, 'uk').length > 10
      && Boolean(foutUitleg(BOT_FOUTEN.gepauzeerd, 'uk') && foutUitleg(BOT_FOUTEN.forumVereist, 'nl'))
      && regBots?.stand === 'dek' && regBez?.stand === 'nog-niet'
      && uiBron.includes('AgentTelegramBotsPaneel')
      && !cssBron.includes('!important') && !cssBron.includes('position: fixed'));
  }

  // ================================================================ 5. Реальний PostgreSQL + RLS + Сховище ключів (коли доступний DATABASE_URL)
  if (process.env.DATABASE_URL) {
    process.env.TOTP_ENCRYPTION_KEY_V1 = process.env.TOTP_ENCRYPTION_KEY_V1 || randomBytes(32).toString('base64');
    const sk = await import('../../backend/sleutelkluis');
    const sys = getPool('systeem');
    const pgUserA = `pg-bots-a-${randomUUID()}`;
    const pgUserB = `pg-bots-b-${randomUUID()}`;
    const calls: Array<{ methode: string; body: Record<string, unknown> }> = [];
    const pgOpslag = maakPgBotsOpslag({
      telegramFetch: maakNepTelegramFetch({ isForum: true, memberStatus: 'administrator', canSend: true, aanroepen: calls }),
    });
    const ladeA = { userId: pgUserA, ruimte: 'prive' as const };
    const ladeATech = { userId: pgUserA, ruimte: 'technisch' as const };
    const ladeB = { userId: pgUserB, ruimte: 'prive' as const };

    try {
      sk.zetHouderControle(async () => true);
      // Початок без увімкненого Сховища ключів (v1), потім увімкнення та перешифрування під DEK
      const opV1 = await pgOpslag.bewaarBot(ladeA, {
        agentSlug: 'codex',
        botSleutel: nepToken,
        chatId: '-100555666777',
        threadId: 9,
      });
      const rauwV1 = (await sys.query(
        `SELECT sleutel_versleuteld FROM app.geheugen_agent_bots WHERE user_id = $1 AND ruimte = 'prive' AND agent_slug = 'codex'`,
        [pgUserA],
      )).rows[0]?.sleutel_versleuteld as string;

      await sk.inschakelen(ladeA, { soort: 'sessie', id: 'bots-pg-s1' });
      const her = await sk.herversleutelen(ladeA);
      const rauwDek = (await sys.query(
        `SELECT sleutel_versleuteld FROM app.geheugen_agent_bots WHERE user_id = $1 AND ruimte = 'prive' AND agent_slug = 'codex'`,
        [pgUserA],
      )).rows[0]?.sleutel_versleuteld as string;

      const testNaHer = await pgOpslag.testenBot(ladeA, 'codex');
      const bezPg = await pgOpslag.bezorgBericht(ladeA, {
        agentSlug: 'codex',
        taakId: 'pg-taak-1',
        soortBericht: 'overdracht',
        idempotentieSleutel: 'pg-idem-1',
        titel: 'Наскрізна перевірка PG + DEK',
        samenvatting: 'Перевірено під реальним PostgreSQL і RLS.',
      });
      const bezPgDup = await pgOpslag.bezorgBericht(ladeA, {
        agentSlug: 'codex',
        taakId: 'pg-taak-1',
        soortBericht: 'overdracht',
        idempotentieSleutel: 'pg-idem-1',
        titel: 'Наскрізна перевірка PG + DEK',
      });

      // Закриваємо Сховище ключів → запис/перевірка мають чесно дати SLEUTELKLUIS_GESLOTEN
      sk.sleutelVergrendelen(ladeA);
      let geslotenCode = '';
      try {
        await pgOpslag.bewaarBot(ladeA, { agentSlug: 'gemini', botSleutel: nepToken2, chatId: '-100555666777' });
      } catch (e) {
        geslotenCode = String((e as { code?: string; message?: string }).code || (e as Error).message);
      }

      const techOv = await pgOpslag.overzicht(ladeATech);
      const bOv = await pgOpslag.overzicht(ladeB);

      check('5: реальний PostgreSQL + RLS + DEK підтверджує шифрування v1 → dek1, ідемпотентність, 423 при закритому ключі та ізоляцію',
        opV1.ok && rauwV1.startsWith('v1.')
        && her.voortgang.status === 'klaar' && rauwDek.startsWith('dek1.')
        && !rauwDek.includes(nepToken)
        && testNaHer.ok && testNaHer.bot.kanPubliceren && testNaHer.bot.status === 'actief'
        && bezPg.ok && bezPg.verzonden && !bezPg.duplicaat
        && bezPgDup.ok && bezPgDup.duplicaat && bezPgDup.bezorging.id === bezPg.bezorging.id
        && geslotenCode === 'SLEUTELKLUIS_GESLOTEN'
        && techOv.bots.length === 0 && bOv.bots.length === 0);
    } finally {
      sk.geheugenLeeg();
      sk.zetHouderControle(null);
      await sys.query(`DELETE FROM app.geheugen_telegram_bezorging WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
      await sys.query(`DELETE FROM app.geheugen_agent_bots WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
      await sys.query(`DELETE FROM app.geheugen_stroom_knopen WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
      await sys.query(`DELETE FROM app.sleutelkluis_omslag WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
      await sys.query(`DELETE FROM app.sleutelkluis_journaal WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
      await sys.query(`DELETE FROM app.sleutelkluis WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
      await sys.query(`DELETE FROM app.records WHERE tbl = 'sleutelkluis_herversleutel_v1' AND id LIKE $1`, [`${pgUserA}%`]).catch(() => undefined);
      await closePool();
    }
  }

  return einde();
}
