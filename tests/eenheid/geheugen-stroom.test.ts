// Одиничні та інтеграційні перевірки «Стріму пам’яті» (Stroom van geheugen):
//   1. Доменне ядро, нормалізація ключів, блокування секретів і витягування кандидатів із тексту;
//   2. Двомовний крос-мовний пошук (uk <-> nl), часове згасання, графові зв’язки й виявлення суперечностей;
//   3. Побудова компактного пакета пам’яті в межах бюджету символів та експорт у Markdown;
//   4. Серверні маршрути, ізоляція просторів ('prive' vs 'technisch'), RBAC, перевірка секретів і чатова інтеграція;
//   5. Реєстрація MCP-інструментів, політик і таблиці в реєстрі Сховища ключів.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  berekenTijdVerval,
  bevatGevoeligGeheim,
  bouwGeheugenPakket,
  bouwGeheugenSysteemPrompt,
  GEHEUGEN_ACTIE_META,
  GEHEUGEN_ACTIES,
  GEHEUGEN_FOUTEN,
  haalGeheugenKandidatenUitTekst,
  maakMarkdownExport,
  normaliseerGeheugenSleutel,
  rangschikGeheugen,
  spoorTegenspraken,
  type GeheugenKnoop,
  type GeheugenRelatie,
} from '../../shared/geheugen-stroom';
import {
  geheugenStroomRoutes,
  maakGeheugenInGeheugenOpslag,
  pgStroomOpslag,
} from '../../backend/geheugen-stroom';
import { aiWerkruimteRoutes } from '../../backend/ai-werkruimte';
import { SITE_TOOL_BY_NAME } from '../../backend/site-hulpmiddelen';
import { TOEGESTANE_ROUTES } from '../../backend/site-aanroep';
import { v2Optie } from '../../shared/connector-v2/catalogus';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { capabilityForTool } from '../../shared/ai-beleid/catalogus';
import { SLEUTELKLUIS_REGISTER } from '../../shared/sleutelkluis';
import { actieDoel, actieSoort, actieZin, foutUitleg } from '../../shared/mcp-acties';
import { closePool, getPool } from '../../server/platform/pg';

type Antwoord = { statusCode: number; body: string };
const lees = (r: unknown): Record<string, any> => JSON.parse((r as Antwoord).body || '{}');
const codeVan = (r: unknown): string => String(lees(r).error || lees(r).reasonCode || '');

export async function main(): Promise<number> {
  const { check, einde } = checker('geheugen-stroom');

  // ================================================================ 1. Нормалізація, захист від секретів і витягування кандидатів
  {
    const sleutel = normaliseerGeheugenSleutel('Мова звітів та архітектура!');
    check('1a: normaliseerGeheugenSleutel перетворює український заголовок у чистий латинський ключ',
      /^[a-z0-9][a-z0-9._:-]+$/.test(sleutel) && sleutel.includes('mova'),
      sleutel);

    const nepSk = ['sk', 'ant', 'nepVoorbeeld1234567890'].join('-');
    const nepGh = ['ghp', 'nepVoorbeeldToken123456789012'].join('_');
    const nepMcp = ['mcpa', 'nepTestToken9876543210'].join('_');
    check('1b: bevatGevoeligGeheim виявляє токени, паролі й приватні ключі та пропускає звичайний текст',
      bevatGevoeligGeheim(`Ключ: ${nepSk}`)
      && bevatGevoeligGeheim(`токен=${nepGh}`)
      && bevatGevoeligGeheim(`посилання ${nepMcp}`)
      && bevatGevoeligGeheim('wachtwoord=SuperGeheim123')
      && !bevatGevoeligGeheim('Ми вирішили готувати двомовні звіти без англіцизмів щотижня.'));

    const tekstMetGeheim = [
      'Ми вирішили завжди використовувати PostgreSQL 18 з увімкненим RLS для нових таблиць.',
      'Ніколи не змінюйте виробничу базу вручну без міграції!',
      `Тимчасове поле з секретом: ${nepSk}`,
      'We hebben besloten om alle rapporten zowel in het Oekraïens als in het Nederlands op te leveren voor ons prive project.',
    ].join('\n');
    const kandidaten = haalGeheugenKandidatenUitTekst(tekstMetGeheim, { maxKandidaten: 6 });
    const geblokkeerd = kandidaten.filter((k) => k.geblokkeerdDoorGeheim);
    const veilig = kandidaten.filter((k) => !k.geblokkeerdDoorGeheim);
    const priveNlKandidaat = veilig.find((k) => k.inhoud.includes('prive project'));
    check('1c: haalGeheugenKandidatenUitTekst виокремлює рішення й застереження uk/nl та ізолює рядок із секретом',
      veilig.length >= 3
      && veilig.some((k) => k.soort === 'besluit')
      && veilig.some((k) => k.soort === 'waarschuwing')
      && Boolean(priveNlKandidaat && !priveNlKandidaat.labels.includes('github'))
      && geblokkeerd.length === 1
      && !geblokkeerd[0]!.inhoud.includes(nepSk));
  }

  // ================================================================ 2. Двомовне ранжування, часове згасання, граф і суперечності
  {
    const nu = Date.UTC(2026, 10, 15, 12, 0, 0);
    const oud = nu - 400 * 86_400_000;
    const knopen: GeheugenKnoop[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        ruimte: 'prive',
        sleutel: 'postvak-regel-oud',
        soort: 'besluit',
        titel: 'Postvak en e-mail sorteren op prioriteit',
        inhoud: 'Gebruik het hoofdpostvak om urgente e-mails eerst te tonen.',
        samenvatting: '',
        inhoudHash: 'h1',
        bronDienst: 'mail',
        bronAgent: 'claude',
        labels: ['mail', 'sorteren'],
        status: 'actief',
        vastgepind: false,
        gewicht: 1.0,
        geldigVanaf: oud,
        aanroepen: 1,
        aangemaaktOp: oud,
        bijgewerktOp: oud,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        ruimte: 'prive',
        sleutel: 'poshta-ta-bezpeka-pin',
        soort: 'voorkeur',
        titel: 'Пошта й правила безпеки користувача',
        inhoud: 'Завжди вимагати підтвердження перед надсиланням листів і берегти шифрування пошти.',
        samenvatting: '',
        inhoudHash: 'h2',
        bronDienst: 'mail',
        bronAgent: 'codex',
        labels: ['mail', 'beveiliging'],
        status: 'actief',
        vastgepind: true,
        gewicht: 1.4,
        geldigVanaf: oud,
        aanroepen: 4,
        aangemaaktOp: oud,
        bijgewerktOp: oud,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        ruimte: 'prive',
        sleutel: 'postvak-regel-nieuw',
        soort: 'besluit',
        titel: 'Postvak sorteerregel zonder automatisch archiveren',
        inhoud: 'Niet meer automatisch e-mails uit het postvak archiveren bij sorteren, enkel markeren.',
        samenvatting: '',
        inhoudHash: 'h3',
        bronDienst: 'mail',
        bronAgent: 'claude',
        labels: ['mail', 'sorteren'],
        status: 'actief',
        vastgepind: false,
        gewicht: 1.2,
        geldigVanaf: nu - 86_400_000,
        aanroepen: 2,
        aangemaaktOp: nu - 86_400_000,
        bijgewerktOp: nu - 86_400_000,
      },
    ];

    const relaties: GeheugenRelatie[] = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ruimte: 'prive',
        bronKnoopId: knopen[2]!.id,
        doelKnoopId: knopen[0]!.id,
        relatieSoort: 'ondersteunt',
        toelichting: 'Доповнення',
        sterkte: 1,
        aangemaaktOp: nu,
      },
    ];

    // Закріплений вузол віком 400 днів не втрачає актуальності; незакріплений — згасає.
    check('2a: berekenTijdVerval зберігає 1.0 для закріпленого вузла і знижує оцінку старого незакріпленого',
      berekenTijdVerval(knopen[1]!, nu) === 1.0 && berekenTijdVerval(knopen[0]!, nu) < 0.4);

    // Пошук українською «пошта» знаходить і нідерландські вузли про postvak/e-mail!
    const gerangschikt = rangschikGeheugen(knopen, relaties, { vraag: 'пошта та сортування', nu });
    check('2b: крос-мовний пошук uk/nl піднімає релевантні закріплені й свіжі вузли над застарілими',
      gerangschikt.length === 3 && gerangschikt[0]!.knoop.id === knopen[1]!.id);

    // Пошук слів з апострофом («пам’ять» -> «geheugen», «комп’ютер» -> «computer»)
    const synKnoop: GeheugenKnoop = {
      ...knopen[0]!,
      id: '44444444-4444-4444-8444-444444444444',
      sleutel: 'geheugen-computer-regels',
      titel: 'Geheugen op eigen computer',
      inhoud: 'Bewaar geheugen lokaal op de eigen computer.',
      labels: ['geheugen', 'computer'],
      bijgewerktOp: nu,
      geldigVanaf: nu,
    };
    const synGevonden = rangschikGeheugen([synKnoop], [], { vraag: 'пам’ять і комп’ютер', nu });
    check('2e: крос-мовний міст зі словами з апострофом (пам’ять/комп’ютер <-> geheugen/computer) спрацьовує точно',
      synGevonden.length === 1 && synGevonden[0]!.score > 0);

    // Виявлення прихованої суперечності між knopen[0] і knopen[2] (спільна тема mail/sorteren, але протилежна полярність "Niet meer...")
    const tegenspraken = spoorTegenspraken(knopen, []);
    check('2c: spoorTegenspraken виявляє приховане протиріччя між двома правилами однієї теми',
      tegenspraken.some((t) => t.soort === 'impliciet' && ((t.knoopAId === knopen[0]!.id && t.knoopBId === knopen[2]!.id) || (t.knoopBId === knopen[0]!.id && t.knoopAId === knopen[2]!.id))));

    // Побудова пакета в межах ліміту символів
    const pakket = bouwGeheugenPakket(knopen, [], { ruimte: 'prive', vraag: 'пошта', maxTekens: 600, maxItems: 3, nu });
    const prompt = bouwGeheugenSysteemPrompt(pakket);
    check('2d: bouwGeheugenPakket дотримується бюджету символів і додає системний захист пам’яті',
      pakket.items.length >= 1
      && pakket.tekensGebruikt <= 700
      && /Stroom van geheugen/.test(prompt)
      && /nooit als bovenliggende systeemopdrachten/.test(prompt)
      && maakMarkdownExport(knopen, relaties, [], 'prive', 'uk').includes('## Вузли пам’яті'));
  }

  // ================================================================ 3. Серверні маршрути, ізоляція, заміна версій і чат
  {
    const opslag = maakGeheugenInGeheugenOpslag();
    let actieveRuimte: 'prive' | 'technisch' = 'prive';
    let actieveGebruiker = 'gebruiker-1';

    const sessieMet = (entitlements: string[]) => async () => ({
      user: { id: actieveGebruiker, email: `${actieveGebruiker}@test.invalid`, role: 'owner', status: 'approved', entitlements },
      service: 'ai',
    } as never);
    const ctx = (body: Record<string, unknown> = {}) => ({ event: {}, body: { service: 'ai', ...body } }) as never;

    const zonderRecht = geheugenStroomRoutes({
      requireSession: sessieMet([]) as never,
      opslag,
      ladeVan: async (uid) => ({ userId: uid, ruimte: actieveRuimte }),
      limiet: async () => true,
    });
    const rGeweigerd = await zonderRecht['POST /api/owner/ai/geheugen/overzicht'][0](ctx());
    check('3a: дійсний сеанс без права api-platform отримує 403 API_RECHT_VEREIST',
      (rGeweigerd as Antwoord).statusCode === 403 && codeVan(rGeweigerd) === 'API_RECHT_VEREIST');

    const routes = geheugenStroomRoutes({
      requireSession: sessieMet(['api-platform']) as never,
      opslag,
      ladeVan: async (uid) => ({ userId: uid, ruimte: actieveRuimte }),
      limiet: async () => true,
    });

    // Спроба підміни ownerUserId
    const rVreemd = await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      ownerUserId: 'iemand-anders',
      titel: 'Тест',
      inhoud: 'Заборонена підміна власника',
    }));
    check('3b: спроба передати чужий ownerUserId відхиляється на рівні маршруту',
      (rVreemd as Antwoord).statusCode === 403);

    // Блокування секрету на рівні маршруту
    const nepKey = ['ghp', 'geheimTokenVoorTest9988776655'].join('_');
    const rGeheim = await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      titel: 'Секретний ключ',
      inhoud: `Не зберігати ${nepKey}`,
    }));
    check('3c: спроба зберегти секрет у Стрім пам’яті блокується кодом GEHEUGEN_GEHEIM_GEWEIGERD',
      (rGeheim as Antwoord).statusCode === 400 && codeVan(rGeheim) === GEHEUGEN_FOUTEN.geheimGeweigerd);

    // Збереження першого рішення, потім заміна новішим рішенням через vervangtId
    const r1 = lees(await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      sleutel: 'architectuur-db-keuze',
      soort: 'besluit',
      titel: 'Початковий вибір сховища',
      inhoud: 'Спочатку використовуємо один загальний файл журналу.',
      bronDienst: 'ai',
      labels: ['database'],
      vastgepind: false,
    })));
    const id1 = String(r1.knoop?.id ?? '');

    const r2 = lees(await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      sleutel: 'architectuur-db-pg18',
      soort: 'besluit',
      titel: 'Перехід на ізольовані таблиці PostgreSQL з RLS',
      inhoud: 'Усі дані пам’яті зберігаються в PostgreSQL 18.6 з політиками RLS і шифруванням ключа.',
      bronDienst: 'ai',
      labels: ['database', 'beveiliging'],
      vastgepind: true,
      vervangtId: id1,
    })));
    const id2 = String(r2.knoop?.id ?? '');

    const ov1 = lees(await routes['POST /api/owner/ai/geheugen/overzicht'][0](ctx({ status: 'alle' })));
    const oudNaVervanging = (ov1.knopen as GeheugenKnoop[]).find((k) => k.id === id1);
    check('3d: новий вузол із vervangtId створює зв’язок vervangt і переводить старий у стан verouderd',
      Boolean(id1 && id2)
      && oudNaVervanging?.status === 'verouderd'
      && (ov1.relaties as GeheugenRelatie[]).some((r) => r.bronKnoopId === id2 && r.doelKnoopId === id1 && r.relatieSoort === 'vervangt'));

    // Ізоляція просторів: 'technisch' не бачить приватних вузлів 'prive'
    actieveRuimte = 'technisch';
    const techOv = lees(await routes['POST /api/owner/ai/geheugen/overzicht'][0](ctx()));
    check('3e: технічний простір повністю ізольований від приватного простору',
      techOv.ruimte === 'technisch' && (techOv.knopen as GeheugenKnoop[]).length === 0);

    // Ізоляція між різними користувачами в межах одного простору
    actieveRuimte = 'prive';
    actieveGebruiker = 'gebruiker-2';
    const user2Ov = lees(await routes['POST /api/owner/ai/geheugen/overzicht'][0](ctx()));
    check('3f: інший користувач не бачить вузлів першого користувача',
      (user2Ov.knopen as GeheugenKnoop[]).length === 0);
    actieveGebruiker = 'gebruiker-1';

    // Інтеграція з чатом aiWerkruimteRoutes (metGeheugen: true)
    let ontvangenExtraSystem = '';
    const wrRoutes = aiWerkruimteRoutes({
      requireSession: sessieMet(['api-platform']) as never,
      geheugenOpslag: opslag,
      limiet: async () => true,
      feiten: async () => ({
        heeftRecht: true,
        isEigenaar: true,
        modellen: [{ id: 'claude-sonnet-4-6', standaard: true }],
        sleutels: { anthropic: true, openai: false, google: false },
        apparaten: { totaal: 0, online: 0, apparaten: [] },
        connectors: 0,
        tools: 5,
      }) as never,
      chatDeps: {
        model: 'claude-sonnet-4-6',
        listTools: async () => [],
        callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        getApiKey: async () => 'sk' + '-ant-nep-sleutel-alleen-voor-test',
        fetchImpl: (async (_url: unknown, init?: { body?: string }) => {
          const payload = init?.body ? JSON.parse(String(init.body)) : {};
          ontvangenExtraSystem = String(payload.system ?? '');
          return new Response(
            JSON.stringify({ content: [{ type: 'text', text: 'Використовую ваш вибір PostgreSQL з RLS.' }], stop_reason: 'end_turn' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }) as unknown as typeof fetch,
      },
    });
    const chatAntwoord = lees(await wrRoutes['POST /api/owner/ai/werkruimte/chat'][0](ctx({
      metGeheugen: true,
      messages: [{ role: 'user', content: 'Як ми зберігаємо дані пам’яті в базі?' }],
    })));
    const naChat = lees(await routes['POST /api/owner/ai/geheugen/overzicht'][0](ctx()));
    const knoop2NaChat = (naChat.knopen as GeheugenKnoop[]).find((k) => k.id === id2);
    check('3g: чат робочого простору з metGeheugen=true додає Стрім пам’яті у system-контекст і фіксує звернення',
      chatAntwoord.geheugenAantal >= 1
      && ontvangenExtraSystem.includes('Stroom van geheugen')
      && ontvangenExtraSystem.includes('PostgreSQL 18.6')
      && (knoop2NaChat?.aanroepen ?? 0) >= 1,
      JSON.stringify({ chatAntwoord, sysLen: ontvangenExtraSystem.length, aanroepen: knoop2NaChat?.aanroepen }));

    // Експорт Markdown і JSON
    const exp = lees(await routes['POST /api/owner/ai/geheugen/exporteren'][0](ctx({ taal: 'nl' })));
    check('3h: експорт формує чистий Markdown та JSON із вузлами й зв’язками',
      exp.formaat === 'mijn-ruimte-geheugen-v1'
      && String(exp.markdown || '').includes('# Stroom van geheugen Mijn Ruimte')
      && (exp.knopen as GeheugenKnoop[]).length === 2);

    // Оновлення за id зі збереженням sleutel, soort та vastgepind при частковій передачі
    const updById = await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      id: id2,
      titel: 'Оновлена назва правила PostgreSQL з RLS',
      inhoud: 'Оновлений текст рішення: усі таблиці працюють з RLS і шифруванням ключа.',
    }));
    const updBody = lees(updById);
    check('3i: оновлення вузла за id зберігає його sleutel, soort та vastgepind без створення дубліката',
      (updById as Antwoord).statusCode === 200
      && updBody.nieuw === false
      && updBody.knoop?.id === id2
      && updBody.knoop?.sleutel === 'architectuur-db-pg18'
      && updBody.knoop?.soort === 'besluit'
      && updBody.knoop?.vastgepind === true);

    // Відсутній vervangtId або vervangtSleutel має повертати 404, а самозаміна — 400
    const onbekendeUuid = '99999999-9999-4999-8999-999999999999';
    const rVervangtMis = await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      titel: 'Новий вузол із відсутньою заміною',
      inhoud: 'Не повинен падати з 500 при відсутньому vervangtId.',
      vervangtId: onbekendeUuid,
    }));
    const rZelfVervang = await routes['POST /api/owner/ai/geheugen/opslaan'][0](ctx({
      id: id2,
      titel: 'Спроба замінити сам себе',
      inhoud: 'Повинна блокуватися кодом самопосилання.',
      vervangtId: id2,
    }));
    check('3j: відсутній vervangtId повертає 404 GEHEUGEN_NIET_GEVONDEN, а самозаміна — 400 GEHEUGEN_ZELF_RELATIE_ONGELDIG',
      (rVervangtMis as Antwoord).statusCode === 404
      && codeVan(rVervangtMis) === GEHEUGEN_FOUTEN.nietGevonden
      && (rZelfVervang as Antwoord).statusCode === 400
      && codeVan(rZelfVervang) === GEHEUGEN_FOUTEN.zelfRelatie);
  }

  // ================================================================ 4. Реєстрація MCP-інструментів, політик і Сховища ключів
  {
    const tools = ['geheugen_stroom_zoeken', 'geheugen_stroom_bewaren', 'geheugen_stroom_verbinden'];
    check('4a: усі три інструменти Стріму пам’яті зареєстровані в SITE_TOOLS, V2_OPTIES, AI-політиці та працюють в обох просторах',
      tools.every((n) =>
        SITE_TOOL_BY_NAME.has(n)
        && !!v2Optie(`${n}:gebruiker`)
        && !!v2Optie(`${n}:beheer`)
        && toolInRuimte(n, 'prive')
        && toolInRuimte(n, 'technisch')
        && !!capabilityForTool(n),
      ));

    check('4b: дозволені маршрути для MCP-виклику та таблиця 0280 в SLEUTELKLUIS_REGISTER на місці',
      TOEGESTANE_ROUTES.has('POST /api/owner/ai/geheugen/pakket')
      && TOEGESTANE_ROUTES.has('POST /api/owner/ai/geheugen/opslaan')
      && TOEGESTANE_ROUTES.has('POST /api/owner/ai/geheugen/relatie')
      && SLEUTELKLUIS_REGISTER.some((r) => r.tabel === 'app.geheugen_stroom_knopen' && r.stand === 'dek'));

    check('4c: кожна подія пам’яті (GEHEUGEN_ACTIES) має переклади uk + nl в GEHEUGEN_ACTIE_META',
      GEHEUGEN_ACTIES.every((a) => Boolean(GEHEUGEN_ACTIE_META[a]?.uk && GEHEUGEN_ACTIE_META[a]?.nl)));

    const migratieSql = readFileSync('migrations/0280_geheugen_stroom.sql', 'utf8');
    const opslagBron = readFileSync('backend/connectors-opslag.ts', 'utf8');
    const toolsBron = readFileSync('backend/connectors-hulpmiddelen.ts', 'utf8');
    check('4d: міграція 0280 має FORCE RLS на трьох таблицях та зберігає ruimte в черзі затверджень MCP',
      migratieSql.includes('ENABLE ROW LEVEL SECURITY')
      && migratieSql.includes('FORCE ROW LEVEL SECURITY')
      && migratieSql.includes('app.connector_tool_calls')
      && opslagBron.includes('ruimte: AiRuimte = huidigeRuimte()')
      && toolsBron.includes('metNamens(namensHerstel, () => runSite(userId, site, claimed.args))'));

    // Перевірка аудиту дій MCP (mcp-acties.ts): жодного витоку пошукового запиту чи змісту вузла
    const doelZoek = actieDoel('geheugen_stroom_zoeken', { vraag: 'таємний пошуковий запит', doel_dienst: 'mail' });
    const doelBewaar = actieDoel('geheugen_stroom_bewaren', { sleutel: 'mova-zvitiv', titel: 'Приватний заголовок', inhoud: 'Приватний текст' });
    const doelVerbind = actieDoel('geheugen_stroom_verbinden', { relatie_soort: 'vervangt', toelichting: 'Таємне пояснення' });
    check('4e: mcp-acties класифікує інструменти Стріму пам’яті без витоку вмісту чи запитів у doel',
      actieSoort('geheugen_stroom_zoeken') === 'geheugen'
      && actieSoort('geheugen_stroom_bewaren') === 'geheugen'
      && actieSoort('geheugen_stroom_verbinden') === 'geheugen'
      && doelZoek === 'mail'
      && doelBewaar === 'mova-zvitiv'
      && doelVerbind === 'vervangt'
      && actieZin('geheugen_stroom_bewaren', doelBewaar, 'uk').includes('Стрімі пам’яті')
      && Boolean(foutUitleg(GEHEUGEN_FOUTEN.geheimGeweigerd, 'uk'))
      && Boolean(foutUitleg(GEHEUGEN_FOUTEN.sleutelGesloten, 'nl')));

    // Реальна перевірка PostgreSQL з RLS (виконується, коли задано DATABASE_URL)
    if (process.env.DATABASE_URL) {
      const sys = getPool('systeem');
      const pgUserA = `pg-geheugen-a-${randomUUID()}`;
      const pgUserB = `pg-geheugen-b-${randomUUID()}`;
      try {
        const resA1 = await pgStroomOpslag.bewaarKnoop(
          { userId: pgUserA, ruimte: 'prive' },
          { sleutel: 'pg-test-1', soort: 'besluit', titel: 'PG тест 1', inhoud: 'Перше правило в PostgreSQL.', vastgepind: true },
          'codex',
        );
        const resA1Upd = await pgStroomOpslag.bewaarKnoop(
          { userId: pgUserA, ruimte: 'prive' },
          { id: resA1.ok ? resA1.knoop.id : '', titel: 'PG тест 1 (оновлено)', inhoud: 'Оновлене правило в PostgreSQL.' },
          'codex',
        );
        const resMis = await pgStroomOpslag.bewaarKnoop(
          { userId: pgUserA, ruimte: 'prive' },
          { titel: 'Помилкова заміна', inhoud: 'Повинно повернути nietGevonden.', vervangtId: '99999999-9999-4999-8999-999999999999' },
          'codex',
        );
        const resTech = await pgStroomOpslag.leesAlles({ userId: pgUserA, ruimte: 'technisch' });
        const resUserB = await pgStroomOpslag.leesAlles({ userId: pgUserB, ruimte: 'prive' });
        check('4f: реальний PostgreSQL + RLS підтверджує запис, оновлення за id, відхилення відсутнього vervangtId та ізоляцію просторів і користувачів',
          resA1.ok
          && resA1Upd.ok
          && resA1Upd.knoop.id === resA1.knoop.id
          && resA1Upd.knoop.sleutel === 'pg-test-1'
          && resA1Upd.knoop.vastgepind === true
          && !resMis.ok
          && resMis.code === GEHEUGEN_FOUTEN.nietGevonden
          && resTech.knopen.length === 0
          && resUserB.knopen.length === 0);
      } finally {
        await sys.query(`DELETE FROM app.geheugen_stroom_knopen WHERE user_id IN ($1, $2)`, [pgUserA, pgUserB]).catch(() => undefined);
        await closePool();
      }
    }
  }

  return einde();
}
