// Комплексне модульне та інтеграційне випробування Блоку В Віхи M4 (CONSOL-001):
//   1. Міграції прапорців 0326..0329 за правилом VLAG-001 (false, false, ON CONFLICT DO NOTHING, без руйнівних команд).
//   2. ШІ-чат: вибір під’єднаного цільового пристрою (pasGekozenApparaatToe, 403 APPARAAT_NIET_GEVONDEN на чужий простір/оглядач).
//   3. Платформа програмних інтерфейсів: 3 області читання (mail.read, calendar.read, files.metadata.read), RLS-ізоляція та миттєве відкликання.
//   4. Знаряддя MCP: живий стан bronnen і 3 нові дії каталогу (cloud_eigen_lijst, cloud_koppelingen_lijst, comment_board_item).
//   5. Навички (.agents/skills/*), розбір посилань Telegram (leesTelegramKoppeling, bouwUitgaveUitleg) та мовна чистота (#163).
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  AI_CHAT_APPARAATKEUZE_VLAG,
  LEGE_FEITEN,
  pasGekozenApparaatToe,
  WERKRUIMTE_FOUTEN,
} from '../../shared/ai-werkruimte';
import { aiWerkruimteRoutes } from '../../backend/ai-werkruimte';
import {
  API_PLATFORM_CAPABILITIES as CLIENT_API_CAPS,
  API_PLATFORM_LEES_VLAG,
  apiPlatformContractPayload as clientContractPayload,
} from '../../src/api-platform-contract';
import {
  API_PLATFORM_CAPABILITIES as SERVER_API_CAPS,
  apiPlatformContractPayload as serverContractPayload,
} from '../../backend/api-platform-contract';
import {
  API_MACHINE_TOKEN_TABLE,
  API_PAT_FORBIDDEN_SCOPES,
  API_PAT_ISSUABLE_SCOPES,
  createApiPlatformRoutes,
} from '../../backend/api-platform-tokens';
import { MCP_BRONNEN_LIVE_VLAG, leesMcpBronnenStand } from '../../backend/mcp-connector-routes';
import { SITE_TOOL_BY_NAME, SITE_TOOLS } from '../../backend/site-hulpmiddelen';
import { RISKY_TOOLS } from '../../backend/connectors-hulpmiddelen';
import { TOEGESTANE_ROUTES } from '../../backend/site-aanroep';
import { v2Optie } from '../../shared/connector-v2/catalogus';
import { scopeVoorTool } from '../../shared/ai-toegang';
import { capabilityForTool } from '../../shared/ai-beleid/catalogus';
import { isTweetalig, vertaalHulpmiddel } from '../../shared/hulpmiddel-teksten';
import { taalFouten } from './hulp/taalcontrole';
import { leesTelegramKoppeling, UITROL_TELEGRAM_KOPPELING_VLAG } from '../../src/uitrol/telegram-koppeling';
import { bouwUitgaveUitleg } from '../../backend/uitrol-telegram-uitleg';
import { metVerzoek } from '../../server/platform/context';
import { closePool, getPool } from '../../server/platform/pg';

const RU_LETTERS = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m4-blok-c');

  // ================================================================ 1. Міграції прапорців 0326..0329 (VLAG-001)
  const verwachteMigraties: ReadonlyArray<{ pad: string; sleutel: string; bronBestand: string }> = [
    { pad: 'migrations/0326_ai_chat_apparaatkeuze_vlag.sql', sleutel: AI_CHAT_APPARAATKEUZE_VLAG, bronBestand: 'src/AiWerkruimteChat.tsx' },
    { pad: 'migrations/0327_api_platform_lees_scopes_vlag.sql', sleutel: API_PLATFORM_LEES_VLAG, bronBestand: 'src/ApiPlatformWeergave.tsx' },
    { pad: 'migrations/0328_mcp_bronnen_live_vlag.sql', sleutel: MCP_BRONNEN_LIVE_VLAG, bronBestand: 'src/McpHulpmiddelenPaneel.tsx' },
    { pad: 'migrations/0329_uitrol_telegram_koppeling_vlag.sql', sleutel: UITROL_TELEGRAM_KOPPELING_VLAG, bronBestand: 'src/uitrol/TelegramArchief.tsx' },
  ];

  for (const m of verwachteMigraties) {
    const sql = readFileSync(m.pad, 'utf8');
    const omschrijvingMatch = /VALUES\s*\(\s*'[^']+'\s*,\s*'([^']+)'\s*,\s*false\s*,\s*false\s*\)/.exec(sql);
    check(
      `міграція ${m.pad}: вставляє ${m.sleutel} зі станом false, false, ON CONFLICT DO NOTHING, опис <= 300 знаків і без DROP/TRUNCATE/RENAME`,
      sql.includes(`'${m.sleutel}'`) &&
        Boolean(omschrijvingMatch && omschrijvingMatch[1].length > 20 && omschrijvingMatch[1].length <= 300) &&
        /ON CONFLICT\s*\(\s*sleutel\s*\)\s*DO NOTHING/i.test(sql) &&
        !/\b(DROP|TRUNCATE|RENAME)\b/i.test(sql) &&
        !RU_LETTERS.test(sql),
      m.pad,
    );
  }

  // ================================================================ 2. Підзадача 1 — ШІ-чат з вибором цільового пристрою
  {
    check(
      'pasGekozenApparaatToe: підставляє machine для інструментів ПК/додатків, але не чіпає machine_list чи поштові інструменти',
      JSON.stringify(pasGekozenApparaatToe('machine_list_dir', { path: '.' }, 'pc-1')) === JSON.stringify({ path: '.', machine: 'pc-1' }) &&
        JSON.stringify(pasGekozenApparaatToe('app_list', {}, 'pc-2')) === JSON.stringify({ machine: 'pc-2' }) &&
        JSON.stringify(pasGekozenApparaatToe('machine_list', {}, 'pc-1')) === JSON.stringify({}) &&
        JSON.stringify(pasGekozenApparaatToe('mail_search_messages', { query: 'x' }, 'pc-1')) === JSON.stringify({ query: 'x' }) &&
        JSON.stringify(pasGekozenApparaatToe('machine_info', {}, '')) === JSON.stringify({}),
    );

    const chatBron = readFileSync('src/AiWerkruimteChat.tsx', 'utf8');
    check(
      'AiWerkruimteChat.tsx: заглушку nog-niet повністю прибрано, додано двомовний <select data-aiw-apparaatkeuze="kiezer"> та передачу apparaatId',
      !chatBron.includes("data-aiw-apparaatkeuze='nog-niet'") &&
        !chatBron.includes('data-aiw-apparaatkeuze="nog-niet"') &&
        !chatBron.includes('вибрати один тут поки не можна') &&
        chatBron.includes("data-aiw-apparaatkeuze='kiezer'") &&
        chatBron.includes('apparaatId: gekozenApparaatId') &&
        !RU_LETTERS.test(chatBron),
    );

    const aangeroepenTools: Array<{ name: string; args: unknown }> = [];
    let ontvangenSysteem = '';
    const nepAgenten = [
      { id: 'pc-prive-1', user_id: 'u1', name: 'Домашній ПК', platform: 'linux', ruimte: 'prive' },
      { id: 'pc-tech-1', user_id: 'u1', name: 'Сервер ВМ', platform: 'linux', ruimte: 'technisch' },
      { id: 'br-prive-1', user_id: 'u1', name: 'Оглядач Chrome', platform: 'browser', ruimte: 'prive' },
    ] as any[];

    const chatRoutes = aiWerkruimteRoutes({
      requireSession: async () => ({
        user: { id: 'u1', email: 'u1@example.invalid', role: 'owner', status: 'approved', entitlements: ['api-platform'] },
        service: 'ai',
      }),
      feiten: async () => ({ ...LEGE_FEITEN, recht: true, sleutel: true }),
      limiet: async () => true,
      ladeVoorVerzoek: async () => ({ userId: 'u1', ruimte: 'prive' }),
      agentenLijst: async () => nepAgenten,
      chatDeps: {
        getApiKey: async () => 'sk-ant-proef',
        listTools: async () => [{ name: 'machine_info', description: 'info', inputSchema: { type: 'object', properties: {} } }],
        callTool: async (_uid, name, args) => {
          aangeroepenTools.push({ name, args });
          return { content: [{ type: 'text', text: '{"ok":true}' }] };
        },
        fetchImpl: (async (_url, init) => {
          const req = JSON.parse(String(init?.body || '{}')) as { system?: string; messages: Array<{ role: string }> };
          ontvangenSysteem = String(req.system || '');
          const heeftToolResult = req.messages.length > 1;
          if (!heeftToolResult) {
            return new Response(
              JSON.stringify({
                stop_reason: 'tool_use',
                content: [{ type: 'tool_use', id: 'tu-1', name: 'machine_info', input: {} }],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(
            JSON.stringify({
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'Перевірку на пристрої виконано.' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }) as typeof fetch,
      },
    });

    const okChat = await chatRoutes['POST /api/owner/ai/werkruimte/chat'][0]({
      event: {},
      body: { apparaatId: 'pc-prive-1', messages: [{ role: 'user', content: 'Перевір пристрій' }] },
    } as never);
    const okData = JSON.parse(String((okChat as any).body || '{}'));

    const foutTech = await chatRoutes['POST /api/owner/ai/werkruimte/chat'][0]({
      event: {},
      body: { apparaatId: 'pc-tech-1', messages: [{ role: 'user', content: 'Спроба іншого простору' }] },
    } as never);
    const foutBrowser = await chatRoutes['POST /api/owner/ai/werkruimte/chat'][0]({
      event: {},
      body: { apparaatId: 'br-prive-1', messages: [{ role: 'user', content: 'Спроба оглядача як ПК' }] },
    } as never);
    const foutOnbekend = await chatRoutes['POST /api/owner/ai/werkruimte/chat'][0]({
      event: {},
      body: { apparaatId: 'bestaat-niet', messages: [{ role: 'user', content: 'Невідомий пристрій' }] },
    } as never);

    check(
      'POST /api/owner/ai/werkruimte/chat: передає обраний пристрій у системну підказку та виклик інструмента й блокує чужий простір/оглядач кодом 403 APPARAAT_NIET_GEVONDEN',
      (okChat as any).statusCode === 200 &&
        okData.apparaatId === 'pc-prive-1' &&
        ontvangenSysteem.includes('Домашній ПК') &&
        ontvangenSysteem.includes('pc-prive-1') &&
        aangeroepenTools.length === 1 &&
        (aangeroepenTools[0].args as any)?.machine === 'pc-prive-1' &&
        (foutTech as any).statusCode === 403 &&
        JSON.parse(String((foutTech as any).body)).error === WERKRUIMTE_FOUTEN.apparaatNietGevonden &&
        (foutBrowser as any).statusCode === 403 &&
        (foutOnbekend as any).statusCode === 403,
    );
  }

  // ================================================================ 3. Підзадача 2 — API Platform (контракт і межі областей)
  {
    check(
      'API Platform контракт: src і backend синхронні, 4 області читання published, 4 руйнівні області forbidden, writeScopesEnabled=false',
      JSON.stringify(CLIENT_API_CAPS) === JSON.stringify(SERVER_API_CAPS) &&
        ['identity.me.read', 'mail.read', 'calendar.read', 'files.metadata.read'].every((s) => {
          const cap = CLIENT_API_CAPS.find((c) => c.id === s);
          return cap?.status === 'published' && cap.actor === 'machine-token' && !cap.descriptionUk.includes('ще не видається') && (API_PAT_ISSUABLE_SCOPES as readonly string[]).includes(s);
        }) &&
        ['site.deploy', 'source.write', 'vault.write', 'device.command'].every((s) => {
          const cap = CLIENT_API_CAPS.find((c) => c.id === s);
          return cap?.status === 'forbidden' && (API_PAT_FORBIDDEN_SCOPES as readonly string[]).includes(s);
        }) &&
        CLIENT_API_CAPS.find((c) => c.id === 'site.deploy')?.descriptionUk === 'Розгортання сайту через зовнішній програмний інтерфейс заборонено.' &&
        clientContractPayload({ id: 'u1', email: 'e@example.invalid', role: 'owner' }).writeScopesEnabled === false &&
        serverContractPayload({ id: 'u1', email: 'e@example.invalid', role: 'owner' }).writeScopesEnabled === false,
    );
  }

  // ================================================================ 4. Підзадача 3 — Знаряддя MCP і 3 нові дії каталогу
  {
    const mcpPaneel = readFileSync('src/McpHulpmiddelenPaneel.tsx', 'utf8');
    for (const bronNaam of ['Внутрішній диск сайту', 'Outlook (Microsoft)', 'OneDrive (Microsoft)']) {
      const ontsnapt = bronNaam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`\\{[^{}]*${ontsnapt}[^{}]*\\}`).exec(mcpPaneel);
      check(
        `McpHulpmiddelenPaneel.tsx: джерело «${bronNaam}» присутнє без статичного live: false`,
        Boolean(m && !/\blive\s*:\s*false\b/.test(m[0])),
      );
    }

    const nieuweTools = ['cloud_eigen_lijst', 'cloud_koppelingen_lijst', 'comment_board_item'] as const;
    check(
      'SITE_TOOLS: 83 інструменти, RISKY_TOOLS незмінно 17, а всі 3 нові дії узгоджені в TOEGESTANE_ROUTES, V2_OPTIES, ai-toegang та ai-beleid',
      SITE_TOOLS.length === 83 &&
        RISKY_TOOLS.size === 17 &&
        nieuweTools.every((naam) => {
          const st = SITE_TOOL_BY_NAME.get(naam);
          if (!st) return false;
          const v2 = v2Optie(`${naam}:gebruiker`);
          const ukVertaald = vertaalHulpmiddel(st.tool, 'uk');
          const nlVertaald = vertaalHulpmiddel(st.tool, 'nl');
          const tf = taalFouten(naam, `${ukVertaald.title} ${ukVertaald.description}`, `${nlVertaald.title} ${nlVertaald.description}`);
          const paramsOk = Object.values((st.tool.inputSchema as any).properties as Record<string, any>).every((p) => isTweetalig(p.description));
          return (
            Boolean(v2) &&
            Boolean(scopeVoorTool(naam)) &&
            Boolean(capabilityForTool(naam)) &&
            TOEGESTANE_ROUTES.has(st.request({ item_id: 'item-12345', body: 'коментар' }).route) &&
            paramsOk &&
            tf.length === 0
          );
        }),
    );

    const tComment = SITE_TOOL_BY_NAME.get('comment_board_item')!;
    check(
      'comment_board_item: перевіряє довжину item_id і формує безпечну нотатку з мітками ["hub","comment"]',
      tComment.write === true &&
        tComment.validate({ item_id: 'kort', body: 'x' }) !== null &&
        tComment.validate({ item_id: 'taak-123456', body: 'Готово до перевірки' }) === null &&
        JSON.stringify(tComment.request({ item_id: 'taak-123456', body: 'Готово' }).body.tags) === JSON.stringify(['hub', 'comment']),
    );
  }

  // ================================================================ 5. Підзадача 4 — Навички, Telegram та мовна чистота (#163)
  {
    const drieSkills = [
      '.agents/skills/site-ontwikkelen/SKILL.md',
      '.agents/skills/wijziging-controleren/SKILL.md',
      '.agents/skills/uitgave-voorbereiden/SKILL.md',
    ];
    for (const pad of drieSkills) {
      const inhoud = readFileSync(pad, 'utf8');
      check(
        `навичка ${pad}: містить VLAG-001, functievlaggen, MELDINGEN-REGISTER-001 та meldingen-register-controle.mjs`,
        inhoud.startsWith('---\n') &&
          inhoud.includes('VLAG-001') &&
          inhoud.includes('functievlaggen') &&
          inhoud.includes('MELDINGEN-REGISTER-001') &&
          inhoud.includes('meldingen-register-controle.mjs') &&
          !RU_LETTERS.test(inhoud),
      );
    }

    const valUit = spawnSync(process.execPath, [resolve('scripts/vaardigheden/valideer.mjs'), '--stil'], { encoding: 'utf8' });
    check('scripts/vaardigheden/valideer.mjs завершується з кодом виходу 0', valUit.status === 0, valUit.stderr || valUit.stdout);

    check(
      'leesTelegramKoppeling: розпізнає приватні супергрупи t.me/c/... і публічні посилання та відхиляє хибні рядки',
      JSON.stringify(leesTelegramKoppeling('https://t.me/c/3928298101/1939')) === JSON.stringify({ chatId: '-1003928298101', threadId: '1939' }) &&
        JSON.stringify(leesTelegramKoppeling('https://t.me/c/3928298101/1939/2045')) === JSON.stringify({ chatId: '-1003928298101', threadId: '1939' }) &&
        JSON.stringify(leesTelegramKoppeling('https://t.me/MijnGroep/42')) === JSON.stringify({ chatId: '@mijngroep', threadId: '42' }) &&
        leesTelegramKoppeling('https://example.com/niet-telegram') === null &&
        leesTelegramKoppeling('') === null,
    );

    const uitlegTekst = bouwUitgaveUitleg({
      versie: '20261123-040000',
      commit: '2eeb5d5f25a2',
      releaseCommit: '2eeb5d5f25a2',
      auteur: 'Власник',
      manifest: {
        versie: '20261123-040000',
        beschrijving: {
          uk: {
            titel: 'Зведене оновлення',
            samenvatting: 'Поєднано можливості платформи з повною перевіркою безпеки.',
            wijzigingen: ['Додано вибір пристрою в чаті ШІ'],
            fixes: ['Усунено сленгові підписи'],
            beperkingen: [],
            instructies: 'Перевірте розділ оновлень.',
          },
          nl: {
            titel: 'Geconsolideerde uitgave',
            samenvatting: 'Platformmogelijkheden samengebracht met volledige veiligheidscontrole.',
            wijzigingen: ['Apparaatkeuze in AI-chat toegevoegd'],
            fixes: ['Taalzuiverheid bijgewerkt'],
            beperkingen: [],
            instructies: 'Controleer het onderdeel updates.',
          },
        },
      } as any,
    } as any);
    check(
      'bouwUitgaveUitleg: формує двомовний опис випуску з версією, змінами та виправленнями без одруку «манифесту»',
      uitlegTekst.includes('20261123-040000') &&
        uitlegTekst.includes('Зведене оновлення') &&
        uitlegTekst.includes('Geconsolideerde uitgave') &&
        !readFileSync('backend/uitrol-telegram-uitleg.ts', 'utf8').includes('манифест') &&
        readFileSync('src/uitrol/TelegramArchief.tsx', 'utf8').includes('data-ut-telegram-archief') &&
        readFileSync('src/uitrol/TelegramArchief.tsx', 'utf8').includes('data-ut-tg-koppeling'),
    );

    const bordBron = readFileSync('src/agenten/AgentBord.tsx', 'utf8');
    const tabBron = readFileSync('src/agenten/AiToegangTab.tsx', 'utf8');
    check(
      'мовна чистота (#163): AgentBord.tsx та AiToegangTab.tsx використовують «ключ підключення MCP» замість «MCP-токен»',
      !bordBron.includes('MCP-токен') &&
        !tabBron.includes('MCP-токен') &&
        bordBron.includes('ключів підключення MCP') &&
        tabBron.includes('ключів підключення MCP') &&
        !RU_LETTERS.test(bordBron) &&
        !RU_LETTERS.test(tabBron),
    );
  }

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN consol-m4-blok-c (інтеграційна частина PostgreSQL): база не підключена');
    return einde();
  }

  // ================================================================ 6. Жива PostgreSQL: API Platform /api/v1/* + RLS між користувачами А і Б + відкликання
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const userA = { id: `m4c-a-${randomUUID()}`, email: `m4c-a-${sfx}@example.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] };
  const userB = { id: `m4c-b-${randomUUID()}`, email: `m4c-b-${sfx}@example.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] };
  const gemaakteTokenIds: string[] = [];
  const gemaakteRecordIds: Array<{ tbl: string; id: string }> = [];

  const voegRecordToe = async (tbl: string, data: Record<string, unknown>) => {
    const id = randomUUID();
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [tbl, id, data]);
    gemaakteRecordIds.push({ tbl, id });
    return id;
  };

  try {
    await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2), ('users', $3, $4)", [
      userA.id,
      userA,
      userB.id,
      userB,
    ]);

    await voegRecordToe('mail_items_v1', {
      ownerUserId: userA.id,
      ruimte: 'prive',
      subject: 'Рахунок за листопад А',
      senderName: 'Олена',
      senderEmail: 'olena@example.invalid',
      receivedAt: 1_763_800_000_000,
      unread: true,
      labelIds: ['INBOX', 'UNREAD'],
      body: '<p>Привіт! Короткий зміст листа користувача А.</p>',
    });
    await voegRecordToe('mail_items_v1', {
      ownerUserId: userA.id,
      ruimte: 'technisch',
      subject: 'Технічний лист А (не має світитися у prive)',
      senderEmail: 'tech@example.invalid',
      receivedAt: 1_763_800_100_000,
    });
    await voegRecordToe('mail_items_v1', {
      ownerUserId: userB.id,
      ruimte: 'prive',
      subject: 'Приватний лист користувача Б (чужий)',
      senderEmail: 'b@example.invalid',
      receivedAt: 1_763_800_200_000,
    });

    await voegRecordToe('google_suite_calendar_events_v1', {
      ownerUserId: userA.id,
      ruimte: 'prive',
      calendarId: 'primary',
      summary: 'Зустріч команди А',
      start: '2026-11-24T10:00:00Z',
      end: '2026-11-24T11:00:00Z',
      location: 'Київ',
      updatedAt: 1_763_800_000_000,
    });
    await voegRecordToe('google_suite_calendar_events_v1', {
      ownerUserId: userB.id,
      ruimte: 'prive',
      calendarId: 'primary',
      summary: 'Чужа подія користувача Б',
      start: '2026-11-24T12:00:00Z',
      end: '2026-11-24T13:00:00Z',
      updatedAt: 1_763_800_000_000,
    });

    const shaA = 'a'.repeat(64);
    await voegRecordToe('cloud_items_v1', {
      ownerUserId: userA.id,
      ruimte: 'prive',
      kind: 'file',
      title: 'Проєктний-план-А.pdf',
      originalName: 'Проєктний-план-А.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      sha256: shaA,
      storagePath: '/geheim/intern/pad/a.pdf',
      textContent: 'СЕКРЕТНИЙ_ВМІСТ_ФАЙЛУ_НЕ_ПОВЕРТАТИ',
      tags: ['план'],
      favoriet: true,
      verwijderdOp: null,
      updatedAt: 1_763_800_000_000,
    });
    await voegRecordToe('cloud_items_v1', {
      ownerUserId: userA.id,
      ruimte: 'prive',
      kind: 'file',
      title: 'Видалений-у-кошик.pdf',
      originalName: 'Видалений-у-кошик.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      verwijderdOp: '2026-11-22T00:00:00Z',
      updatedAt: 1_763_800_000_000,
    });
    await voegRecordToe('cloud_items_v1', {
      ownerUserId: userB.id,
      ruimte: 'prive',
      kind: 'file',
      title: 'Чужий-файл-Б.pdf',
      originalName: 'Чужий-файл-Б.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      verwijderdOp: null,
      updatedAt: 1_763_800_000_000,
    });

    const auditRegels: Array<{ action: string; result: string }> = [];
    const routesA = createApiPlatformRoutes({
      requireSession: async () => ({ user: userA, service: 'api' }),
      respond: (data, status = 200) => ({ statusCode: status, body: JSON.stringify(data) }),
      fail: (message, status = 403) => ({ statusCode: status, body: JSON.stringify({ error: message }) }),
      audit: async (_uid, action, result) => {
        auditRegels.push({ action, result });
      },
      body: (b) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}),
    });

    for (const verbodenScope of ['site.deploy', 'source.write', 'vault.write', 'device.command', 'files.write']) {
      const rVerboden = await routesA['POST /api/owner/api-platform/tokens/create'][0]({
        event: {},
        body: { label: 'Заборонений', scopes: [verbodenScope] },
      });
      check(
        `API Platform create: заборонена область ${verbodenScope} відхиляється зі статусом 403 API_TOKEN_SCOPE_FORBIDDEN`,
        rVerboden.statusCode === 403 && JSON.parse(rVerboden.body).error === 'API_TOKEN_SCOPE_FORBIDDEN',
      );
    }

    const rBeperkt = await routesA['POST /api/owner/api-platform/tokens/create'][0]({
      event: {},
      body: { label: 'Лише me', scopes: ['identity.me.read'] },
    });
    const beperktData = JSON.parse(rBeperkt.body) as { plaintext: string; item: { id: string } };
    gemaakteTokenIds.push(beperktData.item.id);

    const zonderMailScope = await metVerzoek('GET /api/v1/mail/messages', () =>
      routesA['GET /api/v1/mail/messages'][0]({
        event: { headers: { authorization: `Bearer ${beperktData.plaintext}` } },
        query: {},
      }),
    );
    check(
      'GET /api/v1/mail/messages без області mail.read повертає 403 API_TOKEN_SCOPE_MISSING',
      zonderMailScope.statusCode === 403 && JSON.parse(zonderMailScope.body).error === 'API_TOKEN_SCOPE_MISSING',
    );

    const rVolledig = await routesA['POST /api/owner/api-platform/tokens/create'][0]({
      event: {},
      body: {
        label: 'Усі 4 області читання',
        scopes: ['identity.me.read', 'mail.read', 'calendar.read', 'files.metadata.read'],
      },
    });
    const volledigData = JSON.parse(rVolledig.body) as { plaintext: string; item: { id: string; scopes: string[] } };
    gemaakteTokenIds.push(volledigData.item.id);
    const authHeaders = { authorization: `Bearer ${volledigData.plaintext}` };

    const mailRes = await metVerzoek('GET /api/v1/mail/messages', () =>
      routesA['GET /api/v1/mail/messages'][0]({ event: { headers: authHeaders }, query: {} }),
    );
    const calRes = await metVerzoek('GET /api/v1/calendar/events', () =>
      routesA['GET /api/v1/calendar/events'][0]({ event: { headers: authHeaders }, query: {} }),
    );
    const filesRes = await metVerzoek('GET /api/v1/files/metadata', () =>
      routesA['GET /api/v1/files/metadata'][0]({ event: { headers: authHeaders }, query: {} }),
    );

    const mailBody = JSON.parse(mailRes.body);
    const calBody = JSON.parse(calRes.body);
    const filesBody = JSON.parse(filesRes.body);

    check(
      'GET /api/v1/{mail/messages,calendar/events,files/metadata}: повертає лише приватні записи власника А без чужих даних Б, кошика, storagePath і вмісту файлів',
      mailRes.statusCode === 200 &&
        mailBody.count === 1 &&
        mailBody.items[0].subject === 'Рахунок за листопад А' &&
        !mailRes.body.includes('<p>') &&
        !mailRes.body.includes('користувача Б') &&
        !mailRes.body.includes('Технічний лист А') &&
        calRes.statusCode === 200 &&
        calBody.count === 1 &&
        calBody.items[0].summary === 'Зустріч команди А' &&
        !calRes.body.includes('Чужа подія') &&
        filesRes.statusCode === 200 &&
        filesBody.count === 1 &&
        filesBody.items[0].name === 'Проєктний-план-А.pdf' &&
        filesBody.items[0].sha256 === shaA &&
        !filesRes.body.includes('storagePath') &&
        !filesRes.body.includes('/geheim/intern/pad') &&
        !filesRes.body.includes('СЕКРЕТНИЙ_ВМІСТ_ФАЙЛУ_НЕ_ПОВЕРТАТИ') &&
        !filesRes.body.includes('Видалений-у-кошик') &&
        !filesRes.body.includes('Чужий-файл-Б'),
    );

    const intrekRes = await routesA['POST /api/owner/api-platform/tokens/:id/revoke'][0]({
      event: {},
      body: {},
      params: { id: volledigData.item.id },
    });
    check('відкликання маркера повертає 200 та записує owner.api.token.revoked', intrekRes.statusCode === 200 && auditRegels.some((a) => a.action === 'owner.api.token.revoked'));

    for (const pad of ['GET /api/v1/me', 'GET /api/v1/mail/messages', 'GET /api/v1/calendar/events', 'GET /api/v1/files/metadata'] as const) {
      const naIntrek = await metVerzoek(pad, () =>
        routesA[pad][0]({ event: { headers: authHeaders }, query: {} }),
      );
      check(
        `миттєве відкликання на ${pad}: повертає 401 API_TOKEN_REVOKED`,
        naIntrek.statusCode === 401 && JSON.parse(naIntrek.body).error === 'API_TOKEN_REVOKED',
      );
    }

    const bronnenStand = await leesMcpBronnenStand(userA.id);
    check(
      'leesMcpBronnenStand: повертає живий стан cloud-intern=true та булеві ознаки підключення для mail-outlook і cloud-onedrive',
      bronnenStand['cloud-intern'].live === true &&
        bronnenStand['cloud-intern'].gekoppeld === true &&
        bronnenStand['mail-outlook'].live === true &&
        bronnenStand['cloud-onedrive'].live === true,
    );
  } finally {
    for (const tid of gemaakteTokenIds) {
      await sys.query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [API_MACHINE_TOKEN_TABLE, tid]).catch(() => undefined);
    }
    for (const r of gemaakteRecordIds) {
      await sys.query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [r.tbl, r.id]).catch(() => undefined);
    }
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id IN ($1, $2)", [userA.id, userB.id]).catch(() => undefined);
    await closePool();
  }

  return einde();
}
