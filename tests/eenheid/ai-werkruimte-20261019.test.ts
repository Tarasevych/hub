// Werkgebied «ШІ для вас» op ai.tarasevych.com — punt 13 van de eigenaarslijst (19.10.2026).
//
// Toetst precies wat de eigenaar miste, en wel zo dat niets nagebootst kan worden:
//   1. de startstaat wordt GEREKEND uit de echte feiten (recht → sleutel → model → hulpmiddelen), niet geraden;
//   2. de startvragen worden gefilterd op wat echt aangesloten is: een vraag zonder hulpmiddel is nooit een knop;
//   3. één overzicht van alle gemakken met hun échte stand ('aan' / 'koppelen' / 'niet-in-chat' / 'geen-recht');
//   4. een GELDIGE sessie zonder het recht 'api-platform' krijgt de uitleggende code API_RECHT_VEREIST en NOOIT
//      OWNER_API_SESSION_REQUIRED (dat laatste leest de gebruiker als «Сесія закінчилася», wat onwaar is);
//   5. de chatroute kiest alleen modellen die de server echt heeft ingesteld en geeft per fout de echte reden;
//   6. de bronnen van het scherm: geen verzonnen antwoord, lege staten met een volgende stap.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  LEGE_FEITEN, middelen, startStaat, STARTVRAGEN, vragen, vragenMetStand, WERKRUIMTE_FOUTEN,
  type Feiten,
} from '../../shared/ai-werkruimte';
import { aiWerkruimteRoutes, ingesteldeModellen } from '../../backend/ai-werkruimte';

type Antwoord = { statusCode: number; body: string };
const lees = (r: unknown) => JSON.parse((r as Antwoord).body || '{}');
const code = (r: unknown) => String(lees(r).error || lees(r).reasonCode || '');

const feiten = (extra: Partial<Feiten> = {}): Feiten => ({
  ...LEGE_FEITEN,
  modellen: [{ id: 'claude-sonnet-5-5', standaard: true }],
  ...extra,
});
const MACHINE = ['machine_list', 'machine_info', 'machine_list_dir', 'machine_read_file', 'machine_search_files', 'docker_list_containers'];
const POST_TOOLS = ['mail_search_messages', 'mail_read_message', 'mail_list_accounts'];

/** Sessie-uitkomsten: geldig met recht, geldig zonder recht, en een echte sessiefout. */
const sessieMet = (entitlements: string[]) => async () => ({ user: { id: 'u1', email: 'iemand@test.invalid', role: 'member', status: 'approved', entitlements }, service: 'ai' } as never);
const sessieKapot = async () => ({ errorCode: 'OWNER_TAB_SESSION_EXPIRED' } as never);

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-werkruimte-20261019');
  const ctx = (body: Record<string, unknown> = {}) => ({ event: {}, body: { service: 'ai', ...body } }) as never;

  // ================================================================ 1. startstaat uit de echte feiten
  {
    const geenRecht = startStaat(feiten({ recht: false, sleutel: true, chatTools: MACHINE }));
    check('1a: zonder het recht «api-platform» kan niemand chatten, ook met sleutel en hulpmiddelen; blokkade = geen-recht',
      geenRecht.kanChatten === false && geenRecht.blokkade === 'geen-recht' && geenRecht.klaar.length === 0, JSON.stringify({ b: geenRecht.blokkade, k: geenRecht.klaar.length }));

    const geenSleutel = startStaat(feiten({ recht: true, sleutel: false, apparaten: { totaal: 1, online: 1 } }));
    check('1b: recht maar geen sleutel in de kluis → blokkade geen-sleutel, chat uit, en het is NIET de lege staat (er is een apparaat)',
      geenSleutel.blokkade === 'geen-sleutel' && !geenSleutel.kanChatten && geenSleutel.leeg === false);

    const geenModel = startStaat(feiten({ recht: true, sleutel: true, modellen: [] }));
    check('1c: sleutel maar de server heeft geen model → blokkade geen-model, model leeg', geenModel.blokkade === 'geen-model' && geenModel.model === '' && !geenModel.kanChatten);

    const klaar = startStaat(feiten({ recht: true, sleutel: true, chatTools: MACHINE, apparaten: { totaal: 2, online: 1 } }));
    check('1d: recht + sleutel + model → chat aan, model en aantal hulpmiddelen komen uit de feiten (niets vast ingebakken)',
      klaar.kanChatten && klaar.blokkade === null && klaar.model === 'claude-sonnet-5-5' && klaar.aantalTools === MACHINE.length);
    check('1e: «працює зараз» telt alleen gemakken die ECHT werken: model, server, bestanden — niet post/agenda/GitHub',
      klaar.klaar.map((m) => m.id).sort().join() === 'bestanden,model,server' && klaar.ontbreekt.some((m) => m.id === 'post'), klaar.klaar.map((m) => m.id).join());

    const leeg = startStaat(feiten({ recht: true }));
    check('1f: niets aangesloten → leeg = true (dan toont het scherm de lege staat met de volgende stap)', leeg.leeg === true);
    check('1g: één koppeling of integratie maakt het niet meer leeg',
      startStaat(feiten({ recht: true, koppelingen: 1 })).leeg === false
      && startStaat(feiten({ recht: true, google: { bekend: true, post: true, agenda: false, schijf: false } })).leeg === false);
  }

  // ================================================================ 2. startvragen volgen wat echt aangesloten is
  {
    const basis = feiten({ recht: true, sleutel: true });
    check('2a: 6-10+ kant-en-klare vragen bestaan en elke vraag zegt zelf welk hulpmiddel ze nodig heeft',
      STARTVRAGEN.length >= 6 && STARTVRAGEN.every((v) => Array.isArray(v.tools)) && new Set(STARTVRAGEN.map((v) => v.id)).size === STARTVRAGEN.length, String(STARTVRAGEN.length));

    const zonder = vragen(basis);
    check('2b: zonder enig hulpmiddel blijven alleen de vragen over die geen hulpmiddel nodig hebben (geen valse belofte)',
      zonder.length > 0 && zonder.every((v) => v.tools.length === 0));

    const metServer = vragen(feiten({ recht: true, sleutel: true, chatTools: MACHINE }));
    check('2c: met apparaat-hulpmiddelen komen server- en bestandsvragen erbij, post/agenda/Drive NIET',
      metServer.some((v) => v.groep === 'server') && metServer.some((v) => v.groep === 'bestanden')
      && !metServer.some((v) => v.groep === 'post' || v.groep === 'agenda' || v.groep === 'schijf'), metServer.map((v) => v.id).join());

    const metPost = vragen(feiten({ recht: true, sleutel: true, chatTools: POST_TOOLS }));
    check('2d: met postinstrumenten in de chat wordt de postvraag wél aangeboden', metPost.some((v) => v.id === 'post-ongelezen'));

    check('2e: zonder recht of zonder sleutel is GEEN ENKELE vraag een werkende knop',
      vragen(feiten({ recht: false, sleutel: true, chatTools: MACHINE })).length === 0
      && vragen(feiten({ recht: true, sleutel: false, chatTools: MACHINE })).length === 0);

    const standen = vragenMetStand(feiten({ recht: true, sleutel: true, chatTools: MACHINE }));
    check('2f: elke vraag blijft zichtbaar met haar stand (beschikbaar ja/nee), zodat het scherm kan zeggen wat ervoor nodig is',
      standen.length === STARTVRAGEN.length && standen.some((s) => !s.beschikbaar) && standen.some((s) => s.beschikbaar));
  }

  // ================================================================ 3. één overzicht van alle gemakken met de echte stand
  {
    const m = middelen(feiten({
      recht: true, sleutel: true, chatTools: [...MACHINE, 'github_get'], github: true,
      google: { bekend: true, post: true, agenda: false, schijf: false }, koppelingen: 2,
      browsers: { totaal: 1, actief: 0 },
    }));
    const staatVan = (id: string) => m.find((x) => x.id === id)?.staat;
    check('3a: GitHub met token én instrument = aan; post is gekoppeld maar het chatvenster heeft geen postinstrument = niet-in-chat',
      staatVan('github') === 'aan' && staatVan('post') === 'niet-in-chat', `${staatVan('github')}/${staatVan('post')}`);
    check('3b: agenda en Drive zonder koppeling = koppelen; browser gekoppeld maar niet aangezet = niet-in-chat',
      staatVan('agenda') === 'koppelen' && staatVan('schijf') === 'koppelen' && staatVan('browser') === 'niet-in-chat');
    check('3c: elk gemak noemt een adres waar je het aanzet (dienst + tabblad) en een zin over wat het geeft',
      m.every((x) => !!x.waar.dienst && !!x.waar.tab && x.wat[0].length > 10 && x.naam[0].length > 2));
    check('3d: zonder recht krijgt ALLES de stand geen-recht (niets aanbieden wat toch geweigerd wordt)',
      middelen(feiten({ recht: false, sleutel: true, github: true })).every((x) => x.staat === 'geen-recht'));
    const onbekend = middelen(feiten({ recht: true, sleutel: true, google: { bekend: false, post: false, agenda: false, schijf: false } }));
    check('3e: kan de stand van Google niet gelezen worden, dan beweert het scherm nergens «підключено»',
      onbekend.find((x) => x.id === 'post')?.detail?.[0]?.includes('не вдалося') === true);
  }

  // ================================================================ 4. de route: recht vs sessie (U-03)
  {
    const routes = aiWerkruimteRoutes({ requireSession: sessieMet([]) as never, feiten: async () => feiten({ recht: true }), limiet: async () => true });
    const r = await routes['POST /api/owner/ai/werkruimte/overzicht'][0](ctx());
    check('4a: GELDIGE sessie zonder recht «api-platform» → API_RECHT_VEREIST (403), nooit OWNER_API_SESSION_REQUIRED',
      (r as Antwoord).statusCode === 403 && code(r) === 'API_RECHT_VEREIST', `${(r as Antwoord).statusCode} ${code(r)}`);

    const chat = await routes['POST /api/owner/ai/werkruimte/chat'][0](ctx({ messages: [{ role: 'user', content: 'hoi' }] }));
    check('4b: dezelfde regel geldt voor de chatroute zelf', code(chat) === 'API_RECHT_VEREIST');

    const kapot = aiWerkruimteRoutes({ requireSession: sessieKapot as never, feiten: async () => feiten(), limiet: async () => true });
    const rk = await kapot['POST /api/owner/ai/werkruimte/overzicht'][0](ctx());
    check('4c: een ECHTE sessiefout blijft OWNER_API_SESSION_REQUIRED (daar is «увійдіть знову» het juiste antwoord)',
      code(rk) === 'OWNER_API_SESSION_REQUIRED', code(rk));

    const andereDienst = aiWerkruimteRoutes({ requireSession: (async () => ({ user: { id: 'u1', email: 'e@test.invalid', role: 'member', status: 'approved', entitlements: ['api-platform'] }, service: 'mail' })) as never, feiten: async () => feiten(), limiet: async () => true });
    check('4d: vanaf een andere dienst (mail) is dit scherm niet bereikbaar', code(await andereDienst['POST /api/owner/ai/werkruimte/overzicht'][0](ctx())) === 'OWNER_API_SESSION_REQUIRED');
  }

  // ================================================================ 5. overzicht en chat met het recht
  {
    const ok = {
      requireSession: sessieMet(['api-platform']) as never,
      feiten: async () => feiten({ recht: true, sleutel: true, chatTools: MACHINE, apparaten: { totaal: 1, online: 1 } }),
      limiet: async () => true,
    };
    const routes = aiWerkruimteRoutes(ok);
    const data = lees(await routes['POST /api/owner/ai/werkruimte/overzicht'][0](ctx()));
    check('5a: het overzicht geeft de feiten ÉN de gerekende stand terug, zodat de browser niets hoeft te raden',
      data.feiten?.sleutel === true && data.stand?.kanChatten === true && data.stand?.aantalTools === MACHINE.length);
    check('5b: in het antwoord staat nooit een sleutel of een geheime waarde', !/sk-ant|apiKey|secret/i.test(JSON.stringify(data)));

    // De chatmotor zelf is nagebootst: deze test gaat over de route (model, codes), niet over connectors-chat (eigen test chat.test.ts).
    const chatDeps = {
      getApiKey: async () => 'sk-ant-test',
      listTools: async () => [],
      callTool: async () => ({ content: [{ type: 'text' as const, text: '' }] }),
      fetchImpl: (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Goed' }], stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
    };
    const metChat = aiWerkruimteRoutes({ ...ok, chatDeps });
    const antwoord = lees(await metChat['POST /api/owner/ai/werkruimte/chat'][0](ctx({ messages: [{ role: 'user', content: 'hoi' }] })));
    check('5c: een gewone vraag geeft het antwoord van het model terug, met het gebruikte model erbij',
      antwoord.reply === 'Goed' && antwoord.model === ingesteldeModellen()[0].id, JSON.stringify(antwoord));

    const onbekendModel = await metChat['POST /api/owner/ai/werkruimte/chat'][0](ctx({ model: 'gpt-van-de-buren', messages: [{ role: 'user', content: 'hoi' }] }));
    check('5d: een model dat de server NIET heeft ingesteld wordt geweigerd met een eigen code (geen stille andere keuze)',
      code(onbekendModel) === WERKRUIMTE_FOUTEN.modelOnbekend && (onbekendModel as Antwoord).statusCode === 400);

    const geenSleutel = aiWerkruimteRoutes({ ...ok, chatDeps: { ...chatDeps, getApiKey: async () => null } });
    check('5e: geen sleutel in de kluis → AI_WERKRUIMTE_GEEN_SLEUTEL (409), niet een vage fout',
      code(await geenSleutel['POST /api/owner/ai/werkruimte/chat'][0](ctx({ messages: [{ role: 'user', content: 'hoi' }] }))) === WERKRUIMTE_FOUTEN.geenSleutel);

    const geweigerd = aiWerkruimteRoutes({ ...ok, chatDeps: { ...chatDeps, fetchImpl: (async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch } });
    check('5f: weigert de aanbieder de sleutel, dan staat de status in de code (401), zodat het scherm de echte reden toont',
      code(await geweigerd['POST /api/owner/ai/werkruimte/chat'][0](ctx({ messages: [{ role: 'user', content: 'hoi' }] }))) === `${WERKRUIMTE_FOUTEN.aanbieder}_401`);

    const vol = aiWerkruimteRoutes({ ...ok, chatDeps, limiet: async () => false });
    check('5g: te veel verzoeken per minuut → eigen code met uitleg (429)',
      code(await vol['POST /api/owner/ai/werkruimte/chat'][0](ctx({ messages: [{ role: 'user', content: 'hoi' }] }))) === WERKRUIMTE_FOUTEN.teVeel);

    const leegGesprek = await metChat['POST /api/owner/ai/werkruimte/chat'][0](ctx({ messages: [{ role: 'assistant', content: 'ik eerst' }] }));
    check('5h: het laatste bericht moet de vraag van de mens zijn', code(leegGesprek) === WERKRUIMTE_FOUTEN.laatsteMoetVraagZijn);
  }

  // ================================================================ 6. ingestelde modellen komen van de server
  {
    const voorModellen = process.env.CHAT_MODELLEN, voorModel = process.env.CHAT_MODEL;
    try {
      process.env.CHAT_MODELLEN = 'claude-opus-5, claude-sonnet-5-5 , niet geldig!';
      const lijst = ingesteldeModellen();
      check('6a: CHAT_MODELLEN levert de keuze (eerste = standaard); een onmogelijke naam valt weg',
        lijst.map((m) => m.id).join() === 'claude-opus-5,claude-sonnet-5-5' && lijst[0].standaard === true, JSON.stringify(lijst));
      delete process.env.CHAT_MODELLEN;
      process.env.CHAT_MODEL = 'claude-haiku-5';
      check('6b: zonder CHAT_MODELLEN geldt CHAT_MODEL van de server', ingesteldeModellen().map((m) => m.id).join() === 'claude-haiku-5');
      delete process.env.CHAT_MODEL;
      check('6c: zonder beide blijft precies één model over (het standaardmodel van de code), nooit een verzonnen lijst', ingesteldeModellen().length === 1);
    } finally {
      if (voorModellen === undefined) delete process.env.CHAT_MODELLEN; else process.env.CHAT_MODELLEN = voorModellen;
      if (voorModel === undefined) delete process.env.CHAT_MODEL; else process.env.CHAT_MODEL = voorModel;
    }
  }

  // ================================================================ 7. de bron van het scherm: niets nabootsen
  {
    const pagina = readFileSync('src/AiWerkruimte.tsx', 'utf8');
    const chat = readFileSync('src/AiWerkruimteChat.tsx', 'utf8');
    const view = readFileSync('src/AIDienstWeergave.tsx', 'utf8');
    check('7a: de startpagina rekent niets zelf uit maar gebruikt de stand van de server (shared/ai-werkruimte)',
      /from '\.\.\/shared\/ai-werkruimte'/.test(pagina) && pagina.includes("api.post('/api/owner/ai/werkruimte/overzicht'"));
    check('7b: zonder recht toont de pagina de uitleg van de hub (wie het recht geeft), niet «Сесія закінчилася»',
      pagina.includes('RECHT_UITLEG') && pagina.includes("data-aiw-geen-recht='1'") && !/tr\('Сесія закінчилася/.test(pagina));
    check('7c: het chatvenster heeft een veld, een echte stopknop (AbortController) en toont de reden van elke fout',
      chat.includes('new AbortController()') && chat.includes("data-aiw-stop='1'") && chat.includes('werkruimteFout') && chat.includes("api.post('/api/owner/ai/werkruimte/chat'"));
    check('7j: wat nog NIET kan staat er ook: één apparaat vooraf kiezen is niet mogelijk en wordt niet nagebootst',
      chat.includes("data-aiw-apparaatkeuze='nog-niet'"));
    check('7d: er staat geen nagebootst antwoord van de AI in de bron (geen vaste «відповідь» zonder server)',
      !/rol: 'assistant', tekst: '[^']/.test(chat) && chat.includes("String(res.data?.reply ?? '')"));
    check('7e: de startvragen komen uit de gedeelde lijst en worden per stand getoond; klikken vult alleen het veld',
      pagina.includes('vragenMetStand') && pagina.includes('setInvoer(tr(vraag.tekst[0], vraag.tekst[1]))'));
    check('7f: AI-02 blijft gelden: geen sleutel → eigenaar naar de kluis, iedere andere mens naar de hub-connectors',
      view.includes("onAction={() => location.assign(hubUrl('connectors'))}") && /eigenaar \? <ProductEmptyState[\s\S]{0,600}onAction=\{openVault\}/.test(view));
    check('7g: elk tabblad van het overzicht heeft een lege staat met de volgende stap',
      pagina.includes('Почніть з першого пункту нижче') && pagina.includes('Усе, що вміє цей розділ, у вас уже підключено'));
    check('7i: de stand is te verversen zonder de pagina te herladen (na het geven van het recht of het koppelen van iets)',
      pagina.includes("data-aiw-herlaad='1'") && pagina.includes('Перевірити ще раз') && pagina.includes('Я щось підключив — оновити стан'));
    const backend = readFileSync('backend/index.ts', 'utf8');
    check('7h: de routes zijn in backend/index.ts geregistreerd', /\.\.\.aiWerkruimteRoutes\(\{ requireSession: ownerRequireSession as never \}\)/.test(backend));
  }

  return einde();
}
