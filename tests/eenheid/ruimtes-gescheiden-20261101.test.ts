// Gescheiden ruimtes (besluit eigenaar 1.11.2026, keuze «Розділити простори»): technische MCP-verbindingen erven de privékeuze
// «Доступ ШІ» (bord:<klant>) niet — zij krijgen alleen de technische standaard — en wijzigingen van het bord raken technische of
// connector-v2-verbindingen niet. Ook v2.wijzig en de erfenis op /<agent> houden de twee ruimtes uit elkaar.
// Розділені простори: приватний «Доступ ШІ» ніколи не визначає прав технічного підключення, і навпаки.
// Puur deel altijd; het deel met PostgreSQL (route /api/owner/ai-toegang/*, uitgifte, v2.wijzig) alleen met DATABASE_URL.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { AI_TOEGANG_GROEPEN, AI_TOEGANG_GROEP_NL, AI_TOEGANG_SCOPES, STANDAARD_SCOPES, TECHNISCHE_STANDAARD_SCOPES, scopeBruikbaar, toegangScope } from '../../shared/ai-toegang';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { bordOnderwerp, geefVoorNieuweKoppeling, isPriveOudeGrant, leesToegang, scopesVoorNieuweKoppeling, standaardScopesVoor, zetToegang } from '../../backend/ai-toegang';
import { erfenisUit } from '../../backend/connector-v2-erfenis';

const gesorteerd = (a: readonly string[] | null | undefined) => [...(a ?? [])].sort();
const gelijk = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => JSON.stringify(gesorteerd(a)) === JSON.stringify(gesorteerd(b));

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimtes-gescheiden');

  // ============================================================== 1. puur: nieuwe verbinding
  const tech = standaardScopesVoor('technisch');
  const bordKeuze = ['mail.read', 'photos.read', 'board.read', 'extern.mcp', 'onzin', 'board.read'];
  check('technische standaard = STANDAARD_SCOPES zonder gevoelige; bevat devices.read en geen extern.mcp',
    gelijk(tech, STANDAARD_SCOPES.filter((s) => !toegangScope(s)?.gevoelig)) && tech.includes('devices.read') && !tech.includes('extern.mcp')
    && !tech.some((s) => toegangScope(s)?.gevoelig), tech.join(','));
  check('nieuwe TECHNISCHE verbinding: altijd de technische standaard, wat het privébord ook zegt (ook bij een leeg of ontbrekend bord)',
    gelijk(scopesVoorNieuweKoppeling(bordKeuze, 'technisch'), tech) && gelijk(scopesVoorNieuweKoppeling([], 'technisch'), tech)
    && gelijk(scopesVoorNieuweKoppeling(null, 'technisch'), tech), scopesVoorNieuweKoppeling(bordKeuze, 'technisch').join(','));
  check('nieuwe PRIVÉ verbinding: precies de bordkeuze (alleen bekende scopes, uniek, ook bevestigde gevoelige)',
    gelijk(scopesVoorNieuweKoppeling(bordKeuze, 'prive'), ['board.read', 'extern.mcp', 'mail.read', 'photos.read']), scopesVoorNieuweKoppeling(bordKeuze, 'prive').join(','));
  check('nieuwe PRIVÉ verbinding zonder bordrij: de standaard; een leeg bord («alles uit») blijft leeg',
    gelijk(scopesVoorNieuweKoppeling(null, 'prive'), standaardScopesVoor('prive')) && scopesVoorNieuweKoppeling([], 'prive').length === 0);
  check('isPriveOudeGrant: alleen privé (ook oud NULL = privé) én zonder agent; technisch of connector v2 nooit',
    isPriveOudeGrant({ ruimte: 'prive', agent: null }) && isPriveOudeGrant({ ruimte: null }) && !isPriveOudeGrant({ ruimte: 'technisch', agent: null })
    && !isPriveOudeGrant({ ruimte: 'prive', agent: 'claude' }));

  // ============================================================== 2. puur: erfenis per kant
  const e = erfenisUit([{ id: 'p', ruimte: 'prive', scopes: ['devices.read'] }, { id: 't', ruimte: 'technisch', scopes: [] }]);
  check('erfenis: privé devices.read + technisch zonder scopes → machine_list:gebruiker, GEEN machine_list:beheer; beheer zonder scope blijft',
    e.sleutels.includes('machine_list:gebruiker') && !e.sleutels.includes('machine_list:beheer') && e.sleutels.includes('get_live_release:beheer')
    && e.kanten.join() === 'beheer,gebruiker', e.sleutels.filter((k) => k.startsWith('machine_')).join(','));
  const e1 = erfenisUit([{ id: 't', ruimte: 'technisch', scopes: ['devices.read', 'board.read'] }]);
  check('erfenis: één technische grant → alleen beheersleutels (geen enkele :gebruiker), machine_list:beheer uit zijn eigen scope',
    e1.kanten.join() === 'beheer' && e1.sleutels.includes('machine_list:beheer') && !e1.sleutels.some((k) => k.endsWith(':gebruiker')));

  // ============================================================== 2b. puur: bruikbaar per ruimte (de tab toont technisch alleen deze)
  const bruikbaarIn = (r: 'prive' | 'technisch') => AI_TOEGANG_SCOPES.filter((sc) => scopeBruikbaar(sc, (tool) => toolInRuimte(tool, r))).map((sc) => sc.id).sort();
  check('technisch bruikbaar: precies apparaten, site en externe MCP (extern_* hoort bij de ruimte van de externe verbinding)',
    gelijk(bruikbaarIn('technisch').filter((id) => !toegangScope(id)?.gevoelig), ['devices.read', 'devices.write', 'extern.mcp', 'site.read']), bruikbaarIn('technisch').join(','));
  check('privé bruikbaar: alle scopes (ook gevoelige en externe MCP)', gelijk(bruikbaarIn('prive'), AI_TOEGANG_SCOPES.map((sc) => sc.id)), bruikbaarIn('prive').join(','));
  check('technische standaard: één gedeelde lijst (server = knop in de tab), zonder gevoelige en zonder extern.mcp',
    gelijk(TECHNISCHE_STANDAARD_SCOPES, standaardScopesVoor('technisch')) && !TECHNISCHE_STANDAARD_SCOPES.some((id) => toegangScope(id)?.gevoelig)
    && !TECHNISCHE_STANDAARD_SCOPES.includes('extern.mcp'), TECHNISCHE_STANDAARD_SCOPES.join(','));
  const techScopes = bruikbaarIn('technisch').filter((id) => !toegangScope(id)?.gevoelig).map((id) => toegangScope(id)!);
  check('elke technisch bruikbare scope heeft een eigen technische regel (uk + nl, nl zonder Cyrillisch); geen «ваш ПК»/«Моїм простором»-belofte',
    techScopes.every((sc) => !!sc.technischUk && !!sc.technischNl && !/[Ѐ-ӿ]/.test(sc.technischNl) && sc.technischUk !== sc.omschrijvingUk)
    && !/Пошук «Моїм простором»/.test(toegangScope('site.read')!.technischUk!) && /Технічні пристрої/.test(toegangScope('devices.read')!.technischUk!),
    techScopes.filter((sc) => !sc.technischUk || !sc.technischNl).map((sc) => sc.id).join(','));

  // ============================================================== 3. catalogus nl (oude fout: de tab toonde op de nl-site Oekraïens)
  const cyr = /[Ѐ-ӿ]/;
  check('catalogus «Доступ ШІ»: elke scope heeft een Nederlandse naam en regel, zonder Cyrillisch en anders dan de Oekraïense',
    AI_TOEGANG_SCOPES.every((s) => !!s.nl && !!s.omschrijvingNl && !cyr.test(s.nl + s.omschrijvingNl) && s.omschrijvingNl !== s.omschrijvingUk),
    AI_TOEGANG_SCOPES.filter((s) => !s.nl || cyr.test(`${s.nl}${s.omschrijvingNl}`)).map((s) => s.id).join(','));
  check('catalogus: elke groep heeft een Nederlandse naam zonder Cyrillisch, en elke scope hoort bij een bekende groep',
    AI_TOEGANG_GROEPEN.every((g) => !!AI_TOEGANG_GROEP_NL[g] && !cyr.test(AI_TOEGANG_GROEP_NL[g])) && AI_TOEGANG_SCOPES.every((s) => AI_TOEGANG_GROEPEN.includes(s.groep)));

  // ============================================================== 4. bron: UI
  const tab = readFileSync('src/agenten/AiToegangTab.tsx', 'utf8');
  check('AiToegangTab: geen tr(s, s) meer; namen, regels en groepen via uk + nl',
    !/tr\(s, s\)/.test(tab) && /naamVan\(t, s\)/.test(tab) && /regelVan\(t, s(, technisch)?\)/.test(tab) && /groepVan\(t, groep\)/.test(tab));
  check('AiToegangTab: ruimte komt van de server; technisch → alleen bruikbare, niet-gevoelige scopes + uitleg (uk en nl) dat niets van het bord geërfd wordt',
    /data\.ruimte === 'technisch'/.test(tab) && /!technisch \|\| technischBruikbaar\(s\)/.test(tab)
    && /!s\.gevoelig && scopeBruikbaar\(s, \(tool\) => toolInRuimte\(tool, 'technisch'\)\)/.test(tab) && /data-ruimte-uitleg='technisch'/.test(tab)
    && /не успадковує приватний «Доступ ШІ»/.test(tab) && /erft de privé «AI-toegang» van deze AI niet/.test(tab));
  check('AiToegangTab: technisch toont de technische regel (regelVan met technisch), knop «Технічний стандарт» met de gedeelde lijst, melding bij afwijking',
    /<span className='at-lijn'>\{regelVan\(t, s, technisch\)\}<\/span>/.test(tab) && /aria-label=\{`\$\{naamVan\(t, s\)\}: \$\{regelVan\(t, s, technisch\)\}`\}/.test(tab)
    && /data-tech-standaard='1'/.test(tab) && /setGranted\(\[\.\.\.TECHNISCHE_STANDAARD_SCOPES\]\)/.test(tab)
    && /data-tech-afwijking='1'/.test(tab) && /Технічний стандарт/.test(tab) && /Technische standaard/.test(tab));
  check('AiToegangTab: geen bewering «(технічний стандарт)» voor elke technische verbinding; wel eerlijk over verbindingen van vóór 1.11.2026',
    !/має власні права \(технічний стандарт\)/.test(tab) && !/heeft eigen rechten \(technische standaard\)/.test(tab)
    && /створене до 1\.11\.2026 могло отримати права з «Доступу ШІ»/.test(tab) && /van vóór 1-11-2026 kan rechten uit de «AI-toegang» hebben gekregen/.test(tab));
  check('AiToegangTab v2: beperken meteen, nieuwe rechten pas na opnieuw verbinden (zoals de agentpagina zelf zegt)',
    /нові дозволи — після перепідключення/.test(tab) && /nieuwe rechten na opnieuw verbinden/.test(tab) && !/там вибір діє одразу/.test(tab) && !/daar geldt de keuze meteen/.test(tab));
  check('AiToegangTab: laden mislukt (geen bord) → foutmelding + «Спробувати ще раз», geen schakelaars of bewaarknop',
    /setLaadFout\(true\)/.test(tab) && /if \(laadFout\) \{[\s\S]*?data-opnieuw='1'[\s\S]*?\n {2}\}\n/.test(tab)
    && !/(if \(laadFout\) \{[\s\S]*?\n {2}\}\n)/.exec(tab)?.[1].includes('at-schakelaar') && !/(if \(laadFout\) \{[\s\S]*?\n {2}\}\n)/.exec(tab)?.[1].includes('data-bewaar'));
  check('AiToegangTab: geen valse bewering meer dat externe MCP voor een technische verbinding «alleen hier» aangaat',
    !/Зовнішні MCP для нього вмикаються лише тут/.test(tab) && !/Externe MCP zet u voor deze verbinding alleen hier aan/.test(tab));
  check('AiToegangTab: «Зберегти доступи» legt per soort uit wat het raakt (bord: /mcp-privé + nieuwe, niet technisch/v2/tokens; privégrant → ook bord)',
    /title=\{bewaarUitleg\}/.test(tab) && /Не змінює технічних підключень, підключень через власну адресу ШІ/.test(tab)
    && /Verandert geen technische verbindingen, verbindingen via het eigen adres van de AI/.test(tab)
    && /verbinding\.soort === 'oauth' && isBordKlant\(klant\)/.test(tab) && /водночас робить їх вибором «Доступ ШІ»/.test(tab)
    && /maakt hem meteen de keuze «AI-toegang» van deze AI/.test(tab) && !/Технічні підключення цього ШІ не змінюються/.test(tab));
  check('AiToegangTab: connector-v2-koppeling → alleen uitleg + link naar de agentpagina, geen schakelaars; TOEGANG_V2 in mensentaal',
    /if \(agent\) \{[\s\S]*?data-v2-uitleg='1'[\s\S]*?href=\{agentPagina\(agent\)\}[\s\S]*?\n {2}\}\n/.test(tab)
    && (tab.match(/if \(agent\) \{[\s\S]*?\n {2}\}\n/)?.[0] ?? '').includes('at-schakelaar') === false && /TOEGANG_V2: \[/.test(tab));
  check('AiToegangTab: bord met v2-koppelingen elders → telt ze en linkt naar de agentpagina (uk en nl)',
    /bord && v2Elders \?/.test(tab) && /Цей вибір не діє для/.test(tab) && /Deze keuze geldt niet voor/.test(tab));
  const techUi = readFileSync('src/agenten/TechVerbindingen.tsx', 'utf8');
  check('TechVerbindingen: elke actieve technische verbinding heeft haar eigen «Доступ ШІ»-editor (historische niet)',
    /import AiToegangTab from '\.\/AiToegangTab'/.test(techUi)
    && /\{!historisch \? \(\s*<section className='ag-kaart' data-toegang-tab=\{x\.sleutel\}>[\s\S]*?<AiToegangTab verbinding=\{\{ soort: x\.soort, id: g\?\.id \?\? t\?\.id \?\? '', naam: x\.naam \}\} tr=\{tr\} \/>/.test(techUi));
  const bordUi = readFileSync('src/agenten/AgentBord.tsx', 'utf8');
  check('AgentBord «Доступ ШІ»: zegt in uk en nl precies wat er (niet) onder valt en waar technische verbindingen te wijzigen zijn',
    /усіх його приватних підключень через спільну адресу \/mcp, наявних і нових/.test(bordUi) && /Перемикачі «Доступ ШІ» стосуються лише вашого приватного простору/.test(bordUi)
    && /на вкладці «Технічне»/.test(bordUi) && /al zijn privéverbindingen via het gedeelde adres \/mcp, bestaande en nieuwe/.test(bordUi)
    && /Вони не змінюють підключень через власну адресу ШІ/.test(bordUi) && !/\(технічний стандарт\)/.test(bordUi) && !/\(technische standaard\)/.test(bordUi)
    && /op het tabblad «Technisch»/.test(bordUi) && !/в «Підключені ШІ» на рядку технічного підключення/.test(bordUi)
    && !/bij «Verbonden AI» op de rij van de technische verbinding/.test(bordUi));
  check('AgentBord: de mogelijkheden (vinkjes) gelden voor ALLE privéverbindingen van de AI, ook via het eigen adres; niet voor tokens/technisch',
    /data-caps-uitleg='1'/.test(bordUi) && /і через спільну адресу \/mcp, і через його власну адресу/.test(bordUi)
    && /via het gedeelde adres \/mcp én via het eigen adres/.test(bordUi) && /MCP-токенів і технічних підключень вони не стосуються/.test(bordUi));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ruimtes-gescheiden (deel met PostgreSQL): geen database'); return einde(); }

  // ============================================================== 5. PostgreSQL: route, uitgifte, v2.wijzig
  const { createMcpConnectorRoutes } = await import('../../backend/mcp-connector-routes');
  const { closePool, getPool } = await import('../../server/platform/pg');
  const v2 = await import('../../backend/connector-v2');
  const pool = getPool('systeem');
  const U = `rg-${randomUUID()}`;
  const client = `rg-${randomBytes(6).toString('hex')}`;
  const user = { id: U, email: `${U}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] };
  const routes = createMcpConnectorRoutes({
    requireSession: async () => ({ user, service: 'mcp' }) as any,
    respond: (data: unknown, status = 200) => ({ statusCode: status, body: JSON.stringify(data) }),
    fail: (message: string, status = 400) => ({ statusCode: status, body: JSON.stringify({ error: message }) }),
    audit: async () => undefined,
    body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}),
  } as any) as Record<string, any[]>;
  const roep = async (route: string, body: Record<string, unknown>) => {
    const res = await routes[route][0]({ event: { headers: {} }, body, params: {} });
    return { status: res.statusCode as number, data: JSON.parse(res.body || 'null') };
  };
  const lees = async (id: string) => gesorteerd(await leesToegang({ soort: 'mcp-koppeling', id }));
  const grant = async (ruimte: 'prive' | 'technisch', agent: string | null, minuten: number, scopes: string[]) => {
    const r = await pool.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, ruimte, agent, created_at)
      VALUES ($1,$2,'Claude','mcp',$3,$4, now() + interval '1 hour', now() + interval '14 days', $5, $6, now() - make_interval(mins => $7)) RETURNING id::text AS id`,
    [U, client, randomBytes(16).toString('hex'), randomBytes(16).toString('hex'), ruimte, agent, minuten]);
    const id = String(r.rows[0].id);
    await zetToegang(U, { soort: 'mcp-koppeling', id }, scopes);
    return id;
  };
  try {
    await pool.query(`INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1,'Claude',ARRAY['https://claude.ai/api/mcp/auth_callback'])`, [client]);
    // P = oude privégrant, P2 = oudere privégrant, T = oude technische grant, V = connector-v2-koppeling (nieuwst, ruimte prive, agent claude).
    const P2 = await grant('prive', null, 40, ['board.read']);
    const P = await grant('prive', null, 30, ['board.read', 'devices.read']);
    const T = await grant('technisch', null, 20, ['devices.read', 'site.read']);
    const V = await grant('prive', 'claude', 10, ['board.read']);
    await pool.query(`INSERT INTO app.connector_v2_rechten (grant_id, user_id, agent, kanten, sleutels) VALUES ($1,$2,'claude',ARRAY['gebruiker'],ARRAY['search_board:gebruiker'])`, [V, U]);
    const bord = bordOnderwerp(U, 'claude')!;

    // (a) bord:claude staat voor de nieuwste PRIVÉ /mcp-grant (P), niet voor de nieuwere v2-koppeling V
    const oa = await roep('POST /api/owner/ai-toegang/overzicht', { soort: 'oauth', id: 'bord:claude' });
    check('(a) «Доступ ШІ» (bord:claude) toont de nieuwste oude PRIVÉgrant, niet een technische of nieuwere v2-koppeling; ruimte = prive',
      oa.status === 200 && gelijk(oa.data.granted, ['board.read', 'devices.read']) && oa.data.ruimte === 'prive', JSON.stringify(oa.data));
    check('(a2) «Доступ ШІ» meldt de v2-koppeling elders (agent claude, 1) en is zelf geen v2-koppeling',
      oa.data.agent === null && oa.data.v2Elders?.agent === 'claude' && oa.data.v2Elders?.aantal === 1, JSON.stringify(oa.data.v2Elders));

    // (b) bord wijzigen: P + bordrij; T en V ongemoeid
    const zb = await roep('POST /api/owner/ai-toegang/zet', { soort: 'oauth', id: 'bord:claude', scopes: ['board.read', 'board.write', 'mail.read'], bevestigd: true });
    const naB = { P: await lees(P), P2: await lees(P2), T: await lees(T), V: await lees(V), bord: await lees(bord.id) };
    check('(b) bord wijzigen schrijft de privégrant en de bordrij', zb.status === 200 && gelijk(naB.P, ['board.read', 'board.write', 'mail.read']) && gelijk(naB.bord, naB.P), JSON.stringify(naB));
    check('(b) bord wijzigen geldt voor ELKE actieve oude privégrant van deze AI (ook de oudere P2)', gelijk(naB.P2, naB.P), naB.P2.join(','));
    check('(b) bord wijzigen raakt de TECHNISCHE grant niet (geen board.write erbij, devices.read blijft)', gelijk(naB.T, ['devices.read', 'site.read']), naB.T.join(','));
    check('(b) bord wijzigen raakt de connector-v2-koppeling niet (haar scopes volgen connector_v2_rechten)', gelijk(naB.V, ['board.read']), naB.V.join(','));

    // (b2) één privégrant direct wijzigen: die grant + de bordkeuze (nieuwe privéverbindingen); andere grants ongemoeid
    const zp = await roep('POST /api/owner/ai-toegang/zet', { soort: 'oauth', id: P, scopes: ['board.read', 'notes.read'], bevestigd: true });
    const naB2 = { P: await lees(P), P2: await lees(P2), T: await lees(T), V: await lees(V), bord: await lees(bord.id) };
    check('(b2) een privégrant direct wijzigen werkt ook de bordkeuze bij, maar niet de andere privégrant, de technische of de v2-koppeling',
      zp.status === 200 && gelijk(naB2.P, ['board.read', 'notes.read']) && gelijk(naB2.bord, naB2.P) && gelijk(naB2.P2, naB.P2)
      && gelijk(naB2.T, naB.T) && gelijk(naB2.V, naB.V), JSON.stringify(naB2));

    // (c) technische grant direct: nooit gevoelig bewaard; bord en P ongemoeid
    const zt = await roep('POST /api/owner/ai-toegang/zet', { soort: 'oauth', id: T, scopes: ['mail.read', 'site.read', 'devices.write'], bevestigd: true });
    check('(c) technische grant: gevoelige scope wordt niet bewaard, de rest wel',
      zt.status === 200 && gelijk(zt.data.granted, ['devices.write', 'site.read']) && gelijk(await lees(T), ['devices.write', 'site.read']), JSON.stringify(zt.data));
    check('(c) technische grant wijzigen werkt het privébord en de privégrants niet bij',
      gelijk(await lees(bord.id), naB2.bord) && gelijk(await lees(P), naB2.P) && gelijk(await lees(P2), naB2.P2));

    // (d) ruimte in het overzicht
    const ot = await roep('POST /api/owner/ai-toegang/overzicht', { soort: 'oauth', id: T });
    const op = await roep('POST /api/owner/ai-toegang/overzicht', { soort: 'oauth', id: P });
    check('(d) overzicht meldt de ruimte: technische grant → technisch, privégrant → prive', ot.data.ruimte === 'technisch' && op.data.ruimte === 'prive', `${ot.data.ruimte}/${op.data.ruimte}`);

    // (e) v2-koppeling: alleen via de agentpagina — de route weigert, niets verandert; het overzicht noemt de agent
    const zv = await roep('POST /api/owner/ai-toegang/zet', { soort: 'oauth', id: V, scopes: ['board.read', 'notes.read'], bevestigd: true });
    const ov = await roep('POST /api/owner/ai-toegang/overzicht', { soort: 'oauth', id: V });
    check('(e) een connector-v2-koppeling via «Доступ ШІ» wijzigen wordt geweigerd (409 TOEGANG_V2); haar scopes en het bord blijven',
      zv.status === 409 && zv.data?.error === 'TOEGANG_V2' && gelijk(await lees(V), ['board.read']) && gelijk(await lees(bord.id), naB2.bord), JSON.stringify(zv));
    check('(e) overzicht van een v2-koppeling noemt de agent (de tab toont dan alleen de weg naar de agentpagina)', ov.status === 200 && ov.data.agent === 'claude', JSON.stringify(ov.data));

    // (f) nieuwe verbindingen (uitgifte): technisch = technische standaard, privé = bordkeuze
    const nieuwT = randomUUID(), nieuwP = randomUUID();
    await geefVoorNieuweKoppeling(U, nieuwT, 'claude', 'technisch');
    await geefVoorNieuweKoppeling(U, nieuwP, 'claude', 'prive');
    check('(f) nieuwe technische verbinding: de technische standaard, niet de bordkeuze (geen board.write uit het bord)',
      gelijk(await lees(nieuwT), standaardScopesVoor('technisch')), (await lees(nieuwT)).join(','));
    check('(f) nieuwe privéverbinding: erft de huidige bordkeuze', gelijk(await lees(nieuwP), naB2.bord) && naB2.bord.length > 0, (await lees(nieuwP)).join(','));

    // (g) technisch agenttoken: geen gevoelige scope, ruimte in het overzicht
    const tok = await pool.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, expires_at, ruimte) VALUES ($1,'rg-tech','tvh_rgtest00',$2, now() + interval '1 day','technisch') RETURNING id::text AS id`,
      [U, randomBytes(16).toString('hex')]);
    const tokId = String(tok.rows[0].id);
    const zk = await roep('POST /api/owner/ai-toegang/zet', { soort: 'token', id: tokId, scopes: ['mail.read', 'board.read'], bevestigd: true });
    const ok2 = await roep('POST /api/owner/ai-toegang/overzicht', { soort: 'token', id: tokId });
    check('(g) technisch agenttoken: gevoelige scope niet bewaard; overzicht meldt technisch', zk.status === 200 && gelijk(zk.data.granted, ['board.read']) && ok2.data.ruimte === 'technisch', JSON.stringify([zk.data, ok2.data.ruimte]));

    // (h) v2.wijzig perkt oude grants per kant in
    const zet = async (P0: string[], T0: string[]) => { await zetToegang(U, { soort: 'mcp-koppeling', id: P }, P0); await zetToegang(U, { soort: 'mcp-koppeling', id: T }, T0); };
    // h0: de beheerkant is hier nog NOOIT gekozen (geen voorkeur, V alleen gebruiker) → de technische grant blijft precies zoals hij was
    await zet(['board.read', 'devices.read'], ['devices.read', 'site.read']);
    await v2.wijzig(U, 'claude', { kanten: ['gebruiker'], sleutels: ['search_board:gebruiker'] });
    const h0 = { P: await lees(P), T: await lees(T) };
    check('(h0) v2.wijzig met alleen de gebruikerskant, beheer nooit gekozen: technische grant ongemoeid; privégrant volgt de keuze',
      gelijk(h0.T, ['devices.read', 'site.read']) && gelijk(h0.P, ['board.read']), JSON.stringify(h0));
    // h1: alleen machine_list:beheer → technisch houdt devices.read (+ site.read, dat v2 niet kan uitdrukken), privé verliest het
    await zet(['board.read', 'devices.read'], ['devices.read', 'site.read']);
    await v2.wijzig(U, 'claude', { kanten: ['gebruiker', 'beheer'], sleutels: ['machine_list:beheer'] });
    const h1 = { P: await lees(P), T: await lees(T) };
    check('(h1) v2.wijzig met alleen machine_list:beheer: de technische grant houdt devices.read én site.read, de privégrant verliest devices.read',
      gelijk(h1.T, ['devices.read', 'site.read']) && !h1.P.includes('devices.read'), JSON.stringify(h1));
    // h2: alleen machine_list:gebruiker → privé houdt devices.read, technisch verliest het (site.read blijft)
    await zet(['board.read', 'devices.read'], ['devices.read', 'site.read']);
    await v2.wijzig(U, 'claude', { kanten: ['gebruiker', 'beheer'], sleutels: ['machine_list:gebruiker'] });
    const h2 = { P: await lees(P), T: await lees(T) };
    check('(h2) v2.wijzig met alleen machine_list:gebruiker: de privégrant houdt devices.read, de technische verliest het; site.read blijft',
      gelijk(h2.P, ['devices.read']) && gelijk(h2.T, ['site.read']), JSON.stringify(h2));
    // h3: de beheerkant (eerder gekozen) bewust uitgezet → de technische grant verliest alleen wat v2 kan uitdrukken (devices.*)
    await zet(['board.read', 'devices.read'], ['devices.read', 'devices.write', 'extern.mcp', 'site.read']);
    await v2.wijzig(U, 'claude', { kanten: ['gebruiker'], sleutels: ['machine_list:gebruiker', 'search_board:gebruiker'] });
    const h3 = { P: await lees(P), T: await lees(T), P2: await lees(P2) };
    check('(h3) beheerkant bewust uitgezet: technische grant verliest devices.*, houdt extern.mcp en site.read; privégrant houdt de keuze',
      gelijk(h3.T, ['extern.mcp', 'site.read']) && gelijk(h3.P, ['board.read', 'devices.read']), JSON.stringify(h3));
  } catch (e) {
    check('deel met PostgreSQL loopt zonder uitzondering', false, e instanceof Error ? `${e.message} ${String(e.stack).split('\n').slice(1, 3).join(' / ')}` : String(e));
  } finally {
    await pool.query('DELETE FROM app.ai_toegang WHERE user_id = $1', [U]).catch(() => undefined);
    await pool.query('DELETE FROM app.connector_v2_rechten WHERE user_id = $1', [U]).catch(() => undefined);
    await pool.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [U]).catch(() => undefined);
    await pool.query('DELETE FROM app.mcp_console_tokens WHERE user_id = $1', [U]).catch(() => undefined);
    await pool.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [U]).catch(() => undefined);
    await pool.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [client]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
