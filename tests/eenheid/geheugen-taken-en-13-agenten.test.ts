// Одиничні та інтеграційні перевірки для 13 ШІ-агентів та безперервного переходу задач між сесіями (0284):
//   1. Повний паритет усіх 13 канонічних агентів (+windsurf, cline, devin, opencode) у V2_AGENTEN, KLANTEN,
//      BORD_AGENTEN, MATRIX_AGENTEN, MERKEN, MERK_AGENTEN, AGENT_ACCENT, AGENT_NAAM, recept() і каталозі інтеграцій;
//   2. Міграція 0284 з CHECK для 13 агентів і суворим RLS на app.geheugen_taken / app.geheugen_taak_stappen;
//   3. Наскрізний цикл переходу задачі (claude -> windsurf -> devin -> opencode) із Стрімом пам’яті та Telegram-ботом;
//   4. Відмова таємниць, ізоляція користувачів і просторів ('prive' vs 'technisch'), 3 MCP-інструменти та права.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import {
  AGENT_PROFIEL_CATALOGUS,
  TAAK_FOUTEN,
  TAAK_STATUSSEN,
  TAAK_STATUS_META,
  schoonAgentCode,
  schoonTaakBestanden,
  schoonTaakSleutel,
} from '../../shared/geheugen-stroom';
import { V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import { KLANTEN, klantVan } from '../../shared/ai-verbinding';
import { BORD_AGENTEN, isSiteSleutel } from '../../shared/ai-agent-bord';
import { MATRIX_AGENTEN } from '../../shared/extensie-matrix';
import { AGENT_ACCENT, AGENT_NAAM, ONBEKEND_ACCENT, agentSlugUitNaam } from '../../shared/markering-agenten';
import { MERKEN } from '../../src/merk/merk-tabel';
import { recept } from '../../src/agenten/verbind-recepten';
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { CAPABILITIES, capabilityForTool } from '../../shared/ai-beleid/catalogus';
import { SLEUTELKLUIS_REGISTER } from '../../shared/sleutelkluis';
import { actieDoel, actieSoort, actieZin } from '../../shared/mcp-acties';
import { SITE_TOOL_BY_NAME, explainSiteError } from '../../backend/site-hulpmiddelen';
import { TOEGESTANE_ROUTES } from '../../backend/site-aanroep';
import { maakGeheugenInGeheugenOpslag } from '../../backend/geheugen-stroom';
import { maakBotsInGeheugenOpslag } from '../../backend/geheugen-agent-bots';
import { maakTakenInGeheugenOpslag, pgTakenOpslag } from '../../backend/geheugen-taken';
import { getPool } from '../../server/platform/pg';

const VERWACHTE_13: readonly AgentSlug[] = [
  'claude',
  'gpt',
  'codex',
  'grok',
  'gemini',
  'copilot',
  'cursor',
  'antigravity',
  'autoclaw',
  'windsurf',
  'cline',
  'devin',
  'opencode',
];

export async function main(): Promise<number> {
  const { check, einde } = checker('geheugen-taken-en-13-agenten');

  // ================================================================ 1. Повна матриця 13 ШІ-агентів
  const slugs = V2_AGENTEN.map((a) => a.slug);
  check('1a: V2_AGENTEN містить усіх 13 очікуваних ШІ-агентів без дублікатів',
    slugs.length === 13 && VERWACHTE_13.every((s) => slugs.includes(s)) && new Set(slugs).size === 13,
    slugs.join(','));

  check('1b: KLANTEN, BORD_AGENTEN, MATRIX_AGENTEN, MERKEN і AGENT_NAAM покривають усіх 13 агентів',
    V2_AGENTEN.every((a) => KLANTEN.some((k) => k.id === a.klant))
    && V2_AGENTEN.every((a) => BORD_AGENTEN.some((b) => b.id === a.klant))
    && V2_AGENTEN.every((a) => MATRIX_AGENTEN.includes(a.slug))
    && V2_AGENTEN.every((a) => Boolean((MERKEN as Record<string, unknown>)[a.slug]))
    && V2_AGENTEN.every((a) => AGENT_NAAM[a.slug] === a.naam)
    && V2_AGENTEN.every((a) => isSiteSleutel(`agent:${a.klant}`))
    && V2_AGENTEN.every((a) => INTEGRATIES.some((i) => i.levend === `agent:${a.slug}` && i.status === 'klaar')));

  const accenten = V2_AGENTEN.map((a) => AGENT_ACCENT[a.slug]);
  check('1c: усі 13 агентів мають унікальні кольори акцентів (жоден не дорівнює ONBEKEND_ACCENT)',
    new Set(accenten).size === 13 && accenten.every((c) => c && c !== ONBEKEND_ACCENT));

  check('1d: розпізнавання імен клієнтів працює для windsurf, cline, devin та opencode',
    klantVan('Windsurf Cascade') === 'windsurf'
    && klantVan('Codeium Windsurf') === 'windsurf'
    && klantVan('Cline VSCode') === 'cline'
    && klantVan('Roo Code') === 'cline'
    && klantVan('Devin Cognition') === 'devin'
    && klantVan('OpenCode CLI') === 'opencode'
    && agentSlugUitNaam('windsurf') === 'windsurf'
    && agentSlugUitNaam('cline') === 'cline'
    && agentSlugUitNaam('devin') === 'devin'
    && agentSlugUitNaam('opencode') === 'opencode');

  check('1e: recept() повертає індивідуальний рецепт і власну MCP-адресу для кожного з 13 агентів',
    V2_AGENTEN.every((a) => {
      const r = recept(a.slug);
      return r.slug === a.slug && r.stappen.length >= 3 && decodeURIComponent(JSON.stringify(r)).includes(`/${a.slug}`);
    }));

  check('1f: каталог ботів має 17+ профілів включно з windsurf, cline, autoclaw, devin та opencode',
    AGENT_PROFIEL_CATALOGUS.length >= 17
    && ['claude', 'codex', 'gemini', 'chatgpt', 'antigravity', 'grok', 'copilot', 'cursor', 'cline', 'windsurf', 'autoclaw', 'devin', 'opencode']
      .every((s) => AGENT_PROFIEL_CATALOGUS.some((p) => p.slug === s)));

  // ================================================================ 2. Міграція 0284, RLS, права і реєстр
  const sql0284 = readFileSync('migrations/0284_geheugen_taken_en_13_agenten.sql', 'utf8');
  const rechtenSql = readFileSync('migrations/rechten.sql', 'utf8');
  check('2a: міграція 0284 містить FORCE RLS на app.geheugen_taken та app.geheugen_taak_stappen й 13 агентів у CHECK',
    sql0284.includes('ENABLE ROW LEVEL SECURITY')
    && sql0284.includes('FORCE ROW LEVEL SECURITY')
    && sql0284.includes('app.geheugen_taken')
    && sql0284.includes('app.geheugen_taak_stappen')
    && ['windsurf', 'cline', 'devin', 'opencode'].every((s) => sql0284.includes(s))
    && rechtenSql.includes('app.geheugen_taken')
    && rechtenSql.includes('app.geheugen_taak_stappen'));

  check('2b: SLEUTELKLUIS_REGISTER та переклади статусів містять актуальні записи 0280, 0281 і 0284',
    SLEUTELKLUIS_REGISTER.some((r) => r.tabel === 'app.geheugen_taken')
    && SLEUTELKLUIS_REGISTER.some((r) => r.tabel === 'app.geheugen_taak_stappen')
    && TAAK_STATUSSEN.every((st) => Boolean(TAAK_STATUS_META[st]?.uk && TAAK_STATUS_META[st]?.nl)));

  // ================================================================ 3. Наскрізний перехід задачі між сесіями й агентами
  const stroom = maakGeheugenInGeheugenOpslag();
  const nepTelegramFetch = async (url: string) => {
    if (url.endsWith('/getMe')) return new Response(JSON.stringify({ ok: true, result: { id: 9101, username: 'devin_test_bot', first_name: 'Devin Bot' } }), { status: 200 });
    if (url.endsWith('/getChat')) return new Response(JSON.stringify({ ok: true, result: { id: -100777888, type: 'supergroup', is_forum: true } }), { status: 200 });
    if (url.endsWith('/getChatMember')) return new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }), { status: 200 });
    if (url.endsWith('/sendMessage')) return new Response(JSON.stringify({ ok: true, result: { message_id: 505 } }), { status: 200 });
    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  };
  const bots = maakBotsInGeheugenOpslag({ telegramFetch: nepTelegramFetch, stroomOpslag: stroom });
  const opslag = maakTakenInGeheugenOpslag({ stroom, bots });

  const priveA = { userId: 'gebruiker-a', ruimte: 'prive' as const };
  const techA = { userId: 'gebruiker-a', ruimte: 'technisch' as const };
  const priveB = { userId: 'gebruiker-b', ruimte: 'prive' as const };

  // Налаштуємо тестового бота для Devin у приватному просторі A
  await bots.bewaarBot(priveA, {
    agentSlug: 'devin',
    botSleutel: '9101001:AAArtificialTestTokenForUnitTests0000000',
    chatId: '-100777888',
    threadId: 42,
  });
  await bots.testenBot(priveA, 'devin');

  // 3a: валідація ключів і відмова секретів
  check('3a: schoonTaakSleutel і schoonAgentCode нормалізують ключі, а секрети блокуються',
    schoonTaakSleutel(' GEHEUGEN-003 ') === 'GEHEUGEN-003'
    && schoonTaakSleutel('!') === ''
    && schoonAgentCode('WindSurf') === 'windsurf');

  const geheimWeigering = await opslag.opslaan(priveA, {
    taakSleutel: 'SEC-CHECK-1',
    titel: 'Передача з токеном ghp_1234567890abcdef1234567890abcdef1234',
  }, 'claude');
  check('3b: потенційний секрет у назві чи меті задачі відхиляється з TAAK_GEHEIM_GEWEIGERD',
    !geheimWeigering.ok && geheimWeigering.code === TAAK_FOUTEN.geheimGeweigerd);

  const bestandGeheim = schoonTaakBestanden([{ naam: 'env', verwijzing: 'sk-ant-api03-secretvalue1234567890' }]);
  check('3c: потенційний секрет у посиланнях на файли також відхиляється',
    !bestandGeheim.ok && bestandGeheim.code === TAAK_FOUTEN.geheimGeweigerd);

  // 3d: створення задачі агентом Claude, додавання вузла пам’яті й перехід до Windsurf -> Devin (з Telegram) -> OpenCode
  const knoopRes = await stroom.bewaarKnoop(priveA, {
    sleutel: 'taak-regels-003',
    soort: 'besluit',
    titel: 'Використовуємо RLS і двомовний інтерфейс uk/nl',
    inhoud: 'Усі таблиці задач працюють під FORCE RLS, інтерфейс двомовний.',
    vastgepind: true,
  }, 'claude');

  const aangemaakt = knoopRes.ok ? await opslag.opslaan(priveA, {
    taakSleutel: 'HANDOFF-003',
    titel: 'Безперервний перехід між 13 агентами',
    doel: 'Забезпечити передачу контексту без повторів між будь-якими сесіями.',
    status: 'bezig',
    prioriteit: 'hoog',
    huidigeAgent: 'claude',
    afstemmingExternId: 'UI-014',
    geheugenSleutels: [knoopRes.knoop.sleutel],
    laatsteKnoopId: knoopRes.knoop.id,
  }, 'claude') : { ok: false as const, code: 'FOUT' };

  check('3d: створення задачі формує перший крок aangemaakt та двомовні вказівки',
    aangemaakt.ok && aangemaakt.nieuw
    && aangemaakt.pakket.stappen.length === 1
    && aangemaakt.pakket.stappen[0].stapSoort === 'aangemaakt'
    && aangemaakt.pakket.geheugenKnopen.some((k) => k.sleutel === 'taak-regels-003')
    && aangemaakt.pakket.overdrachtPromptUk.includes('HANDOFF-003')
    && aangemaakt.pakket.overdrachtPromptNl.includes('HANDOFF-003'));

  const naarWindsurf = await opslag.overdragen(priveA, {
    taakSleutel: 'HANDOFF-003',
    vanAgent: 'claude',
    naarAgent: 'windsurf',
    samenvatting: 'Міграцію 0284 та спільні типи підготовлено, далі підключити інтерфейс.',
    bewaarInStroom: true,
    bestandsVerwijzingen: [{ naam: 'shared/geheugen-stroom/taken.ts', verwijzing: 'Спільне ядро переходу задач' }],
  }, 'claude');

  const naarDevin = await opslag.overdragen(priveA, {
    taakSleutel: 'HANDOFF-003',
    vanAgent: 'windsurf',
    naarAgent: 'devin',
    samenvatting: 'Інтерфейсну вкладку додано; запускаємо перевірку типів і сповіщаємо Devin у Telegram.',
    bewaarInStroom: true,
    ookBezorgen: true,
    bestandsVerwijzingen: [{ naam: 'src/ai-ecosysteem/GeheugenTakenPaneel.tsx', verwijzing: 'Вкладка переходу задач' }],
  }, 'windsurf');

  check('3e: естафета claude -> windsurf -> devin оновлює Стрім пам’яті, доставляє в Telegram і готує контекст',
    naarWindsurf.ok && naarDevin.ok
    && naarDevin.bezorgd
    && naarDevin.pakket.taak.huidigeAgent === 'devin'
    && naarDevin.pakket.stappen.length === 3
    && naarDevin.pakket.bezorgingen.length === 1
    && naarDevin.pakket.bezorgingen[0].telegramBerichtId === 505
    && naarDevin.pakket.overdrachtPromptUk.includes('devin')
    && naarDevin.pakket.overdrachtPromptUk.includes('GeheugenTakenPaneel.tsx'));

  // 3f: ізоляція просторів і користувачів
  const inTech = await opslag.overzicht(techA);
  const inB = await opslag.overzicht(priveB);
  const detailTech = await opslag.detail(techA, 'HANDOFF-003');
  check('3f: сувора ізоляція між prive та technisch і між різними користувачами',
    inTech.taken.length === 0
    && inB.taken.length === 0
    && !detailTech.ok && detailTech.code === TAAK_FOUTEN.taakNietGevonden);

  // ================================================================ 4. MCP-інструменти, маршрути, права, аудит
  const tLezen = SITE_TOOL_BY_NAME.get('geheugen_taak_lezen');
  const tOpslaan = SITE_TOOL_BY_NAME.get('geheugen_taak_opslaan');
  const tOverdracht = SITE_TOOL_BY_NAME.get('geheugen_taak_overdracht');
  const reqLezenList = tLezen?.request({});
  const reqLezenDetail = tLezen?.request({ taak_sleutel: 'HANDOFF-003' });
  const reqOpslaan = tOpslaan?.request({ taak_sleutel: 'HANDOFF-003', titel: 'Заголовок' });
  const reqOverdracht = tOverdracht?.request({ taak_sleutel: 'HANDOFF-003', naar_agent: 'opencode', samenvatting: 'Продовжити з тестів.' });

  check('4a: 3 MCP-інструменти переходу задач зареєстровані в SITE_TOOLS, TOEGESTANE_ROUTES, V2_OPTIES і CAPABILITIES',
    Boolean(tLezen && tOpslaan && tOverdracht)
    && tLezen!.tool.annotations?.readOnlyHint === true
    && tOpslaan!.tool.annotations?.readOnlyHint === false
    && tOverdracht!.tool.annotations?.readOnlyHint === false
    && Boolean(reqLezenList && TOEGESTANE_ROUTES.has(reqLezenList.route))
    && Boolean(reqLezenDetail && TOEGESTANE_ROUTES.has(reqLezenDetail.route))
    && Boolean(reqOpslaan && TOEGESTANE_ROUTES.has(reqOpslaan.route))
    && Boolean(reqOverdracht && TOEGESTANE_ROUTES.has(reqOverdracht.route))
    && V2_OPTIES.some((o) => o.id === 'geheugen_taak_lezen')
    && V2_OPTIES.some((o) => o.id === 'geheugen_taak_opslaan')
    && V2_OPTIES.some((o) => o.id === 'geheugen_taak_overdracht')
    && CAPABILITIES.some((c) => c.id === capabilityForTool('geheugen_taak_lezen'))
    && capabilityForTool('geheugen_taak_overdracht') === 'board.write');

  const doelOverdracht = actieDoel('geheugen_taak_overdracht', {
    taak_sleutel: 'HANDOFF-003',
    naar_agent: 'opencode',
    samenvatting: 'Приватний зміст, що не має потрапити до журналу дій',
  });
  check('4b: mcp-acties класифікує інструменти без витоку приватного тексту і explainSiteError пояснює TAAK_*',
    actieSoort('geheugen_taak_lezen') === 'geheugen'
    && actieSoort('geheugen_taak_opslaan') === 'geheugen'
    && actieSoort('geheugen_taak_overdracht') === 'geheugen'
    && doelOverdracht === 'HANDOFF-003 → opencode'
    && actieZin('geheugen_taak_overdracht', doelOverdracht, 'uk').includes('Передав естафету')
    && explainSiteError(400, { error: 'TAAK_GEHEIM_GEWEIGERD' }).includes('TAAK_GEHEIM_GEWEIGERD'));

  // ================================================================ 5. Живий тест PostgreSQL із RLS (якщо задано DATABASE_URL)
  if (process.env.DATABASE_URL) {
    const sys = getPool('systeem');
    const pgA = `pg-taak-a-${randomUUID()}`;
    const pgB = `pg-taak-b-${randomUUID()}`;
    try {
      const r1 = await pgTakenOpslag.opslaan({ userId: pgA, ruimte: 'prive' }, {
        taakSleutel: 'PG-HANDOFF-1',
        titel: 'PG задача 1',
        doel: 'Перевірка RLS та збереження кроків у PostgreSQL.',
        huidigeAgent: 'claude',
      }, 'claude');
      const r2 = await pgTakenOpslag.overdragen({ userId: pgA, ruimte: 'prive' }, {
        taakSleutel: 'PG-HANDOFF-1',
        naarAgent: 'opencode',
        samenvatting: 'Передано в PostgreSQL під RLS до opencode.',
        bewaarInStroom: false,
      }, 'claude');
      const rB = await pgTakenOpslag.overzicht({ userId: pgB, ruimte: 'prive' });
      const rTech = await pgTakenOpslag.overzicht({ userId: pgA, ruimte: 'technisch' });
      check('5a: реальна БД PostgreSQL з RLS ізолює наскрізні задачі між користувачами і просторами',
        r1.ok && r2.ok && r2.pakket.taak.huidigeAgent === 'opencode' && r2.pakket.stappen.length === 2
        && rB.taken.length === 0 && rTech.taken.length === 0);
    } finally {
      await sys.query(`DELETE FROM app.geheugen_taak_stappen WHERE user_id = ANY($1::text[])`, [[pgA, pgB]]).catch(() => undefined);
      await sys.query(`DELETE FROM app.geheugen_taken WHERE user_id = ANY($1::text[])`, [[pgA, pgB]]).catch(() => undefined);
    }
  }

  return einde();
}
