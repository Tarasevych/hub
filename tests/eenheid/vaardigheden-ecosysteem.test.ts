// Модульні й інтеграційні тести екосистеми модульних навичок і профілів ШІ-агентів:
//   1. Валідатор мовного закону (uk + nl), заборона російських літер, техно-сленгу й таємних ключів.
//   2. Генератор та розбирач SKILL.md та JSON-пакета mr-vaardigheid-v1.
//   3. HTTP-маршрути /api/owner/vaardigheden/*: огляд, пошук/підбір, збереження, імпорт, перемикач на агента, відкат версій, видалення.
//   4. Ізоляція просторів (prive проти technisch) та ізоляція між користувачами (користувач A vs B).
//   5. Інтеграція з протоколом MCP 2026-07-28 (resources/list, resources/read, completion/complete, mr://agent/{slug}/info).
//   6. Сумісність нових MCP-інструментів vaardigheden_aanbevelen і vaardigheden_opslaan із Connector v2 (<= 64 символів), міграції 0279 та стилів CSS.

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import {
  bouwSkillMarkdown,
  bouwVaardigheidPakket,
  parseerSkillMarkdown,
  parseerVaardigheidInvoerPakket,
  valideerVaardigheidInvoer,
} from '../../shared/vaardigheden-ecosysteem';
import { v2Optie } from '../../shared/connector-v2/catalogus';
import { ontleed, toolNaam } from '../../shared/connector-v2/namen';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { SLEUTELKLUIS_REGISTER } from '../../shared/sleutelkluis';
import { maakGeheugenVaardighedenOpslag } from '../../backend/vaardigheden-opslag';
import { vaardighedenRoutes } from '../../backend/vaardigheden-routes';
import { behandelMcpProtocolMethode, type McpProtocolContext } from '../../backend/mcp-protocol-2026';

const jsonBody = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);

export async function main(): Promise<number> {
  const { check, einde } = checker('vaardigheden-ecosysteem');

  // ------------------------------------------------------------------ 1. Валідація мовного закону та секретів
  const slechteSlug = valideerVaardigheidInvoer({ slug: 'Bad_Slug', titelUk: 'Тест', titelNl: 'Test', samenvattingUk: 'Опис', samenvattingNl: 'Omschrijving', inhoudUk: 'Текст', inhoudNl: 'Tekst' });
  check('валідатор відхиляє недійсний slug', !slechteSlug.ok && slechteSlug.code === 'VAARD_SLUG_ONGELDIG');

  const ruTekst = valideerVaardigheidInvoer({
    slug: 'goede-sleutel',
    titelUk: 'Пров\u0454р\u0454но \u044b \u044d',
    titelNl: 'Goede titel',
    samenvattingUk: 'Коротко',
    samenvattingNl: 'Korte uitleg',
    inhoudUk: 'Детальна інструкція',
    inhoudNl: 'Uitgebreide instructie',
  });
  check('валідатор блокує літери російської абетки', !ruTekst.ok && ruTekst.code === 'VAARD_TAALWET_GESCHONDEN');

  const jargonTekst = valideerVaardigheidInvoer({
    slug: 'goede-sleutel',
    titelUk: '\u0424\u0456\u043a\u0441 \u0431\u0430\u0433\u0430 перед \u0434\u0435\u043f\u043b\u043e\u0454\u043c',
    titelNl: 'Goede titel',
    samenvattingUk: 'Короткий опис',
    samenvattingNl: 'Korte uitleg',
    inhoudUk: 'Робимо \u043a\u043e\u043c\u0456\u0442 і \u0431\u0435\u043a\u0430\u043f',
    inhoudNl: 'Uitgebreide instructie',
  });
  check('валідатор блокує техно-сленг і суржик', !jargonTekst.ok && jargonTekst.code === 'VAARD_TAALWET_GESCHONDEN');

  const geheimTekst = valideerVaardigheidInvoer({
    slug: 'sleutel-lek',
    titelUk: 'Чиста назва',
    titelNl: 'Zuivere titel',
    samenvattingUk: 'Чистий опис',
    samenvattingNl: 'Zuivere uitleg',
    inhoudUk: 'Токен ghp_1234567890abcdefghijklmnopqrstuvwx не можна зберігати',
    inhoudNl: 'Geen geheimen',
  });
  check('валідатор блокує секретні ключі доступу', !geheimTekst.ok && geheimTekst.code === 'VAARD_GEHEIM_VERBODEN');

  const geldigeInvoer = {
    slug: 'dagelijks-rapport',
    titelUk: 'Щоденний огляд простору',
    titelNl: 'Dagelijks ruimteoverzicht',
    samenvattingUk: 'Збирає ключові події дня без зміни даних.',
    samenvattingNl: 'Verzamelt de belangrijkste gebeurtenissen van de dag zonder wijzigingen.',
    inhoudUk: '# Щоденний огляд\n1. Переглянь події дошки.\n2. Підсумуй коротко українською.',
    inhoudNl: '# Dagelijks overzicht\n1. Bekijk bordgebeurtenissen.\n2. Vat kort samen in het Nederlands.',
    termenUk: ['звіт', 'щоденний', 'підсумок'],
    termenNl: ['rapport', 'dagelijks', 'overzicht'],
    vereisteHulpmiddelen: ['site_search', 'mcp_board_list'],
    agentKoppelingen: ['claude' as const, 'gemini' as const],
    bron: 'eigen' as const,
    actief: true,
  };
  const okInvoer = valideerVaardigheidInvoer(geldigeInvoer);
  check('чиста двомовна навичка проходить валідацію', okInvoer.ok);

  // ------------------------------------------------------------------ 2. Експорт та імпорт (SKILL.md + JSON)
  const mdTekst = bouwSkillMarkdown({
    id: geldigeInvoer.slug,
    versie: 2,
    ruimte: 'prive',
    agentKoppelingen: geldigeInvoer.agentKoppelingen,
    titel: { uk: geldigeInvoer.titelUk, nl: geldigeInvoer.titelNl },
    samenvatting: { uk: geldigeInvoer.samenvattingUk, nl: geldigeInvoer.samenvattingNl },
    inhoud: { uk: geldigeInvoer.inhoudUk, nl: geldigeInvoer.inhoudNl },
    vereisteHulpmiddelen: geldigeInvoer.vereisteHulpmiddelen,
  });
  const terugVanMd = parseerSkillMarkdown(mdTekst);
  check(
    'розбирач SKILL.md відновлює двомовні розділи, агентів та інструменти',
    terugVanMd.ok &&
      terugVanMd.waarde.slug === 'dagelijks-rapport' &&
      terugVanMd.waarde.agentKoppelingen.includes('claude') &&
      terugVanMd.waarde.vereisteHulpmiddelen.includes('mcp_board_list') &&
      terugVanMd.waarde.inhoudUk.includes('Переглянь події дошки') &&
      terugVanMd.waarde.inhoudNl.includes('Bekijk bordgebeurtenissen'),
  );

  const pakket = bouwVaardigheidPakket({
    id: geldigeInvoer.slug,
    uri: 'mr://skills/dagelijks-rapport',
    bron: 'eigen',
    ruimte: 'prive',
    versie: 2,
    actief: true,
    agentKoppelingen: geldigeInvoer.agentKoppelingen,
    titel: { uk: geldigeInvoer.titelUk, nl: geldigeInvoer.titelNl },
    samenvatting: { uk: geldigeInvoer.samenvattingUk, nl: geldigeInvoer.samenvattingNl },
    inhoud: { uk: geldigeInvoer.inhoudUk, nl: geldigeInvoer.inhoudNl },
    termen: { uk: geldigeInvoer.termenUk, nl: geldigeInvoer.termenNl },
    vereisteHulpmiddelen: geldigeInvoer.vereisteHulpmiddelen,
    heeftVoorbeeld: false,
    bijgewerktOp: Date.now(),
  });
  const terugVanJson = parseerVaardigheidInvoerPakket(JSON.stringify(pakket));
  check('JSON-імпорт mr-vaardigheid-v1 зберігає всі поля', terugVanJson.ok && terugVanJson.waarde.slug === 'dagelijks-rapport');

  // ------------------------------------------------------------------ 3. Маршрути HTTP, ізоляція просторів, версійність, відкат
  const opslag = maakGeheugenVaardighedenOpslag();
  const userA = `user-a-${randomUUID()}`;
  const userB = `user-b-${randomUUID()}`;
  let huidigUser = userA;
  let metRecht = true;
  let huidigeRuimte: 'prive' | 'technisch' = 'prive';
  const meldingen: Array<{ userId: string; agent?: string }> = [];
  const audits: string[] = [];

  const routes = vaardighedenRoutes({
    requireSession: async () => ({
      service: 'mcp',
      user: {
        id: huidigUser,
        status: 'approved',
        role: 'member',
        entitlements: metRecht ? ['api-platform'] : [],
      },
    }),
    opslag,
    ladeVoor: async (uid, b) => {
      const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
      if (o.ruimte === 'technisch' && huidigeRuimte !== 'technisch') {
        return { ok: false, code: 'VAARD_TECH_PROFIEL_VEREIST' };
      }
      return { ok: true, userId: uid, ruimte: huidigeRuimte };
    },
    limiet: async () => true,
    audit: async (_uid, action, result) => { audits.push(`${action}:${result}`); },
    meldWijziging: (userId, agent) => { meldingen.push({ userId, agent }); },
    zichtbareHulpmiddelenVoor: async (_uid, slug) => (slug === 'claude' ? ['site_search'] : ['site_search', 'mcp_board_list']),
  });

  const roep = async (pad: string, body: Record<string, unknown> = {}) => {
    const fn = routes[`POST ${pad}`][0];
    return fn({ event: { headers: {} }, body } as never);
  };

  metRecht = false;
  const zonderRecht = await roep('/api/owner/vaardigheden/overzicht');
  check('без права api-platform маршрут відхиляє запит із кодом 403 API_RECHT_VEREIST', zonderRecht.statusCode === 403 && jsonBody(zonderRecht).error === 'API_RECHT_VEREIST');
  metRecht = true;

  // Огляд у приватному просторі не показує uitgave-voorbereiden (вона технічна)
  const ovPrive = jsonBody(await roep('/api/owner/vaardigheden/overzicht'));
  check(
    'огляд у prive містить системні й протокольні навички, але приховує технічну uitgave-voorbereiden',
    ovPrive.ruimte === 'prive' &&
      ovPrive.vaardigheden.some((v: { id: string }) => v.id === 'project-verkennen') &&
      ovPrive.vaardigheden.some((v: { id: string }) => v.id === 'movnyi-zakon') &&
      !ovPrive.vaardigheden.some((v: { id: string }) => v.id === 'uitgave-voorbereiden'),
  );

  // Спроба обійти простір без технічного профілю → 403
  const weigeringTech = await roep('/api/owner/vaardigheden/overzicht', { ruimte: 'technisch' });
  check('спроба читати технічні навички з prive повертає 403 VAARD_TECH_PROFIEL_VEREIST', weigeringTech.statusCode === 403);

  // Збереження власної навички v1 і оновлення до v2
  const opslaan1 = jsonBody(await roep('/api/owner/vaardigheden/opslaan', geldigeInvoer));
  const opslaan2 = jsonBody(
    await roep('/api/owner/vaardigheden/opslaan', {
      ...geldigeInvoer,
      titelUk: 'Оновлений щоденний огляд v2',
      inhoudUk: '# Оновлена настанова v2\nПеревіряй усе ще детальніше.',
    }),
  );
  check(
    'створення v1 і оновлення v2 збільшують версію, надсилають push SSE та пишуть аудит',
    opslaan1.item.versie === 1 &&
      opslaan1.aangemaakt === true &&
      opslaan2.item.versie === 2 &&
      opslaan2.aangemaakt === false &&
      meldingen.length >= 2 &&
      audits.includes('owner.vaardigheden.opslaan:success'),
  );

  // Відновлення першої версії через herstelRevisie (створить v3 зі змістом v1)
  const ovNaV2 = jsonBody(await roep('/api/owner/vaardigheden/overzicht'));
  const revV1 = ovNaV2.revisies.find((r: { vaardigheidSlug: string; versie: number }) => r.vaardigheidSlug === 'dagelijks-rapport' && r.versie === 1);
  const herstelUit = jsonBody(await roep('/api/owner/vaardigheden/herstellen', { revisieId: revV1.id }));
  check(
    'відновлення ревізії v1 створює версію v3 зі старою назвою',
    herstelUit.item.versie === 3 && herstelUit.item.titel.uk === 'Щоденний огляд простору',
  );

  // Пошук і підбір з перевіркою доступних інструментів для claude (має лише site_search -> бракує mcp_board_list)
  const aanbClaude = jsonBody(await roep('/api/owner/vaardigheden/aanbevelen', { vraag: 'щоденний звіт', agent: 'claude' }));
  const hit = aanbClaude.aanbevelingen.find((a: { id: string }) => a.id === 'dagelijks-rapport');
  check(
    'aanbevelen підбирає власну навичку й чесно показує нестачу mcp_board_list для claude',
    Boolean(hit) && hit.aansluiting === 'hulpmiddelen_ontbreken' && hit.ontbrekendeHulpmiddelen.includes('mcp_board_list'),
  );

  // Вимкнення навички тільки для claude (gemini все ще має її)
  await roep('/api/owner/vaardigheden/koppelen', { agentSlug: 'claude', vaardigheidId: 'dagelijks-rapport', actief: false });
  const mcpPriveClaude: McpProtocolContext = {
    userId: userA,
    clientName: 'Claude',
    ruimte: 'prive',
    agent: 'claude',
    instructions: 'test',
    modern: true,
    taal: 'uk',
    vaardighedenOpslag: opslag,
  };
  const mcpPriveGemini: McpProtocolContext = { ...mcpPriveClaude, agent: 'gemini', clientName: 'Gemini' };

  const resClaude = await behandelMcpProtocolMethode(mcpPriveClaude, 'resources/list', {});
  const resGemini = await behandelMcpProtocolMethode(mcpPriveGemini, 'resources/list', {});
  const urisClaude = ((resClaude as { result: { resources: Array<{ uri: string }> } }).result.resources).map((r) => r.uri);
  const urisGemini = ((resGemini as { result: { resources: Array<{ uri: string }> } }).result.resources).map((r) => r.uri);
  check(
    'resources/list для claude приховує вимкнену для нього навичку, а gemini її бачить',
    !urisClaude.includes('mr://skills/dagelijks-rapport') &&
      urisGemini.includes('mr://skills/dagelijks-rapport') &&
      urisGemini.includes('mr://skills/project-verkennen'),
  );

  // Перевірка resources/read і completion/complete та mr://agent/gemini/info
  const leesGemini = await behandelMcpProtocolMethode(mcpPriveGemini, 'resources/read', { uri: 'mr://skills/dagelijks-rapport' });
  const leesClaude = await behandelMcpProtocolMethode(mcpPriveClaude, 'resources/read', { uri: 'mr://skills/dagelijks-rapport' });
  const compUit = await behandelMcpProtocolMethode(mcpPriveGemini, 'completion/complete', {
    ref: { type: 'ref/resource', uri: 'mr://skills/{id}' },
    argument: { name: 'id', value: 'dag' },
  });
  const agentInfoUit = await behandelMcpProtocolMethode(mcpPriveGemini, 'resources/read', { uri: 'mr://agent/gemini/info' });
  check(
    'resources/read, completion/complete і mr://agent/gemini/info працюють із живим каталогом',
    leesGemini?.soort === 'result' &&
      leesClaude?.soort === 'error' &&
      ((compUit as { result: { completion: { values: string[] } } }).result.completion.values).includes('dagelijks-rapport') &&
      agentInfoUit?.soort === 'result' &&
      String((agentInfoUit.result.contents as Array<{ text: string }>)[0].text).includes('dagelijks-rapport'),
  );

  // Ізоляція між користувачами (користувач B не бачить власної навички користувача A)
  huidigUser = userB;
  const ovB = jsonBody(await roep('/api/owner/vaardigheden/overzicht'));
  check('користувач B не бачить власних навичок користувача A', !ovB.vaardigheden.some((v: { id: string }) => v.id === 'dagelijks-rapport'));

  // У технічному просторі доступна навичка uitgave-voorbereiden
  huidigUser = userA;
  huidigeRuimte = 'technisch';
  const ovTech = jsonBody(await roep('/api/owner/vaardigheden/overzicht'));
  check('у technisch просторі з’являється uitgave-voorbereiden', ovTech.vaardigheden.some((v: { id: string }) => v.id === 'uitgave-voorbereiden'));

  // Імпорт SKILL.md через маршрут і спроба видалення системної навички
  huidigeRuimte = 'prive';
  const impUit = jsonBody(await roep('/api/owner/vaardigheden/importeren', {
    inhoud: mdTekst.replace('dagelijks-rapport', 'geimporteerde-gids'),
  }));
  const delSys = await roep('/api/owner/vaardigheden/verwijderen', { slug: 'project-verkennen' });
  const delEigen = jsonBody(await roep('/api/owner/vaardigheden/verwijderen', { slug: 'geimporteerde-gids' }));
  check(
    'імпорт SKILL.md створює geimporteerd, системна навичка захищена від видалення, власна видаляється',
    impUit.item?.bron === 'geimporteerd' && delSys.statusCode === 400 && delEigen.verwijderd === true,
  );

  // ------------------------------------------------------------------ 4. Каталог Connector v2, міграція 0279, реєстр і CSS
  const optAanbevelen = v2Optie('vaardigheden_aanbevelen:gebruiker');
  const optOpslaan = v2Optie('vaardigheden_opslaan:beheer');
  const lengtesOk = V2_AGENTEN.every(
    (a) =>
      toolNaam(optAanbevelen!, a.slug).length <= 64 &&
      toolNaam(optOpslaan!, a.slug).length <= 64 &&
      ontleed(toolNaam(optAanbevelen!, a.slug), a.slug).ok &&
      ontleed(toolNaam(optOpslaan!, a.slug), a.slug).ok,
  );
  check('нові MCP-інструменти навичок відповідають обмеженню <= 64 символів і розбираються для всіх агентів', Boolean(optAanbevelen && optOpslaan && lengtesOk));

  const migrSql = readFileSync('migrations/0279_vaardigheden_ecosysteem.sql', 'utf8');
  const rechtenSql = readFileSync('migrations/rechten.sql', 'utf8');
  const cssTekst = readFileSync('src/agenten/vaardigheden-maquette.css', 'utf8');
  check(
    'міграція 0279 (RLS + GRANT), SLEUTELKLUIS_REGISTER та CSS (>=12px, без !important, без fixed) чисті',
    migrSql.includes('FORCE ROW LEVEL SECURITY') &&
      migrSql.includes('app.vaardigheden_eigen') &&
      migrSql.includes('app.vaardigheden_agent_stand') &&
      migrSql.includes('app.vaardigheden_revisies') &&
      rechtenSql.includes('app.vaardigheden_eigen, app.vaardigheden_agent_stand, app.vaardigheden_revisies TO mijnruimte_app;') &&
      SLEUTELKLUIS_REGISTER.some((r) => r.tabel === 'app.vaardigheden_eigen') &&
      !cssTekst.includes('!important') &&
      !/position:\s*fixed/i.test(cssTekst) &&
      !/font-size:\s*(?:[0-9]|1[01])px/i.test(cssTekst),
  );

  const { SITE_TOOLS, SITE_TOOL_BY_NAME } = await import('../../backend/site-hulpmiddelen');
  const { capabilityForTool } = await import('../../shared/ai-beleid/catalogus');
  const tAanb = SITE_TOOL_BY_NAME.get('vaardigheden_aanbevelen');
  const tOpsl = SITE_TOOL_BY_NAME.get('vaardigheden_opslaan');
  check(
    'SITE_TOOLS містить 80 унікальних інструментів і правильні валідатори для vaardigheden_aanbevelen / vaardigheden_opslaan',
    SITE_TOOLS.length === 80 &&
      new Set(SITE_TOOLS.map((s) => s.tool.name)).size === 80 &&
      Boolean(tAanb && !tAanb.write && tAanb.tool.annotations?.readOnlyHint === true) &&
      Boolean(tOpsl && tOpsl.write && tOpsl.tool.annotations?.readOnlyHint === false) &&
      tAanb!.validate({ vraag: 'перевірка' }) === null &&
      tAanb!.validate({}) !== null &&
      tOpsl!.validate({ slug: 'test-skill', titel_uk: 'А', titel_nl: 'B', samenvatting_uk: 'В', samenvatting_nl: 'D', inhoud_uk: 'Е', inhoud_nl: 'F' }) === null &&
      tOpsl!.validate({ slug: 'BAD' }) !== null &&
      capabilityForTool('vaardigheden_aanbevelen') === 'site.read' &&
      capabilityForTool('vaardigheden_opslaan') === 'board.write',
  );

  return einde();
}
