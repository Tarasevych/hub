// Connector v2 (shared/connector-v2/*, backend/connector-v2*.ts, migrations/0045): Nederlandse namen per agent, eigen adres per agent,
// token gebonden aan het pad, rechten per hulpmiddel (standaard alleen veilig), kanten gebruiker/beheer gescheiden, inperken meteen,
// uitbreiden via herverbinden. Puur deel zonder database; integratiedeel tegen een wegwerp-PG.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';
import { V2_AGENTEN, agentUrl, isOudAgentPad, oudAgentUrl, redirectPastBijAgent, slugUitPad, slugUitResource, type AgentSlug } from '../../shared/connector-v2/agenten';
import { V2_GROEPEN, V2_OPTIES, v2Optie, type V2Optie } from '../../shared/connector-v2/catalogus';
import { MAX_NAAM, NAAM_RE, alleNamen, ontleed, toolNaam } from '../../shared/connector-v2/namen';
import { MODI, STANDAARD, modusStaatToe, modusVan, pasModusToe, schoon, verschil, breidtUit, hoogsteRisico } from '../../shared/connector-v2/rechten';
import { STATISCHE_TOOLNAMEN } from '../../backend/connectors-hulpmiddelen';
import { SITE_TOOLS } from '../../backend/site-hulpmiddelen';
import { UITROL_TOOL_NAMEN } from '../../backend/uitrol-goedkeuring';
import { BEHEER_TOOL_NAMEN } from '../../backend/ai-beheer-hulpmiddeldefinities';
import { scopeVoorTool } from '../../shared/ai-toegang';
import { closePool, getPool } from '../../server/platform/pg';
import * as c from '../../backend/mcp-connector';
import * as v2 from '../../backend/connector-v2';
import * as v2st from '../../backend/connector-v2-opslag';
import * as tp from '../../backend/tech-profiel';

const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const body = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const kop = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-v2');

  // ------------------------------------------------------------ namen
  const fouten: string[] = [];
  for (const a of V2_AGENTEN) {
    const namen = alleNamen(a.slug).map((n) => n.naam);
    for (const n of namen) if (!NAAM_RE.test(n) || n.length > MAX_NAAM) fouten.push(n);
    if (new Set(namen).size !== namen.length) fouten.push(`dubbel bij ${a.slug}`);
  }
  check('namen: elke naam voor elke agent is a-z0-9_ en hoogstens 64 tekens (eis van Claude/ChatGPT/MCP), en uniek', !fouten.length, fouten.join(', '));
  const o = v2Optie('mail_read_message:gebruiker')!;
  check('naam: volgorde essentie_agent_subdomein_dienst_tarasevych_com_kant', toolNaam(o, 'grok') === 'lezen_bericht_grok_mail_gmail_tarasevych_com_gebruiker', toolNaam(o, 'grok'));
  check('naam: dienst valt weg als hij gelijk is aan het subdomein (GitHub)', toolNaam(v2Optie('github_create_issue:gebruiker')!, 'gpt') === 'creeren_nieuw_issue_gpt_github_tarasevych_com_gebruiker');
  check('naam: zelfde hulpmiddel bestaat in twee kanten met verschillende naam (eigen pc ↔ server)',
    toolNaam(v2Optie('machine_exec:gebruiker')!, 'claude') === 'uitvoeren_opdracht_claude_mcp_tarasevych_com_gebruiker'
    && toolNaam(v2Optie('machine_exec:beheer')!, 'claude') === 'uitvoeren_opdracht_claude_mcp_tarasevych_com_beheer');
  check('naam: essentie hoogstens 5 woorden', V2_OPTIES.every((x) => x.essentie.split('_').length <= 5));
  const andere = ontleed(toolNaam(o, 'grok'), 'gpt');
  check('ontleed: naam van een andere agent wordt herkend en geweigerd (ANDERE_AGENT)', !andere.ok && andere.reden === 'ANDERE_AGENT' && andere.agent === 'grok');
  check('ontleed: eigen naam → optie; onbekend en oud formaat → ONBEKEND', ontleed(toolNaam(o, 'gpt'), 'gpt').ok && !ontleed('mail_read_message', 'gpt').ok
    && (ontleed('mail_read_message', 'gpt') as { reden: string }).reden === 'ONBEKEND');
  // 21.10.2026: alle opties «у розробці» zijn gebouwd (besluit van de eigenaar). De regel blijft gelden voor een volgende: test haar
  // met een opgebouwde optie in dezelfde vorm (intern = null), zodat «in ontwikkeling werkt nooit» bewezen blijft.
  const dev: V2Optie = V2_OPTIES.find((x) => x.status === 'in-ontwikkeling')
    ?? { ...V2_OPTIES[0], key: 'dev.proef_optie:gebruiker', id: 'dev.proef_optie', intern: null, essentie: 'proeven_in_ontwikkeling', status: 'in-ontwikkeling' };
  check('ontleed: een hulpmiddel «in ontwikkeling» werkt nooit (ook niet met de juiste naam)', !ontleed(toolNaam(dev, 'claude'), 'claude').ok);

  // ------------------------------------------------------------ catalogus dekt alle echte hulpmiddelen
  const echt = new Set([...STATISCHE_TOOLNAMEN(), ...SITE_TOOLS.map((t) => t.tool.name), ...UITROL_TOOL_NAMEN, ...BEHEER_TOOL_NAMEN]);
  const aliassen = new Set(['list_pages', 'select_page', 'new_page', 'close_page', 'navigate_page', 'take_snapshot', 'take_screenshot', 'click', 'hover', 'fill', 'fill_form', 'press_key', 'wait_for', 'list_console_messages', 'list_network_requests']);
  const intern = new Set(V2_OPTIES.map((x) => x.intern).filter(Boolean) as string[]);
  const ontbreekt = [...echt].filter((n) => !aliassen.has(n) && !intern.has(n));
  const verzonnen = [...intern].filter((n) => n !== 'v2_whoami' && !echt.has(n));
  check('catalogus: elk echt hulpmiddel (behalve browser-aliassen) heeft een v2-naam', !ontbreekt.length, ontbreekt.join(','));
  check('catalogus: geen v2-optie verwijst naar een hulpmiddel dat niet bestaat', !verzonnen.length, verzonnen.join(','));
  check('catalogus: elke optie heeft een groep, uk- en nl-tekst (titel, wat, gevolg)', V2_OPTIES.every((x) => V2_GROEPEN.some((g) => g.id === x.groep) && x.uk[0] && x.uk[1] && x.uk[2] && x.nl[0] && x.nl[1] && x.nl[2]));
  // 20.10.2026: de browsergroep heeft een beheerkant gekregen — die bedient ALLEEN het technische slot van de extensie
  // (tabbladen met actief technisch profiel), nooit de eigen tabbladen van de gebruiker. Mail, bestanden en bord blijven privé.
  check('catalogus: beheerkant alleen voor site/server/apparaten/browser, nooit mail, bestanden of bord',
    V2_OPTIES.filter((x) => x.kant === 'beheer').every((x) => ['releases', 'server', 'apparaten', 'apps', 'browser'].includes(x.groep)));
  check('catalogus: gevoelige opties (mail, foto\'s) zijn nooit beheer', V2_OPTIES.filter((x) => x.gevoelig).every((x) => x.kant === 'gebruiker'));
  check('catalogus: elk mail-, agenda-, bord-hulpmiddel valt onder een scope van de oude laag (scopes gelijk te houden)',
    V2_OPTIES.filter((x) => x.intern && ['mail', 'agenda', 'bord', 'github'].includes(x.groep)).every((x) => !!scopeVoorTool(x.intern!)));

  // ------------------------------------------------------------ rechten
  const std = STANDAARD();
  check('standaard: alleen lezen, laag risico, niet gevoelig, privékant — geen mail, geen schrijven, geen beheer',
    std.length > 5 && std.every((k) => { const x = v2Optie(k)!; return x.soort === 'lezen' && x.risico === 'laag' && !x.gevoelig && x.kant === 'gebruiker'; }) && !std.includes('mail_read_message:gebruiker'));
  check('modi: alles ⊇ lezen-schrijven ⊇ lezen; schrijven zonder lezen; geen = niets',
    modusStaatToe('alles', 'wissen') && modusStaatToe('lezen-schrijven', 'schrijven') && !modusStaatToe('lezen-schrijven', 'wissen') && !modusStaatToe('lezen', 'schrijven')
    && modusStaatToe('schrijven', 'wissen') && !modusStaatToe('schrijven', 'lezen') && MODI.every((m) => m === 'geen' ? !modusStaatToe(m, 'lezen') : true));
  const bordRW = pasModusToe([], 'lezen-schrijven', ['gebruiker'], { groep: 'bord' });
  check('modus per groep: bord lezen+schrijven zonder verwijderen, en modusVan herkent het', bordRW.includes('create_task:gebruiker') && !bordRW.includes('delete_board_item:gebruiker')
    && modusVan(bordRW, ['gebruiker'], { groep: 'bord' }) === 'lezen-schrijven' && modusVan([...bordRW, 'delete_board_item:gebruiker'], ['gebruiker'], { groep: 'bord' }) === 'alles');
  check('schoon: beheersleutels vallen weg zonder technische kant; onbekend en «in ontwikkeling» vallen weg',
    schoon(['get_live_release:beheer', 'search_board:gebruiker', 'bestaat_niet:gebruiker', `${dev.key}`], ['gebruiker']).join() === 'search_board:gebruiker');
  const vs = verschil(['a:gebruiker', 'b:gebruiker'], ['b:gebruiker', 'c:gebruiker']);
  check('verschil (herverbinden): toegevoegd / behouden / vervalt', vs.toegevoegd.join() === 'c:gebruiker' && vs.behouden.join() === 'b:gebruiker' && vs.vervalt.join() === 'a:gebruiker');
  check('breidtUit en hoogsteRisico', breidtUit(['a'], ['a', 'b']) && !breidtUit(['a', 'b'], ['a']) && hoogsteRisico(['machine_exec:gebruiker', 'search_board:gebruiker']) === 'kritiek');

  // ------------------------------------------------------------ adressen en terugkeeradressen per agent
  // 20.10.2026 — EEN PAD PER AGENT: /grok in plaats van /ai/grok. Het oude pad blijft LEESBAAR (een token dat met resource
  // https://mcp.tarasevych.com/ai/claude is uitgegeven moet geldig blijven; server/start.ts antwoordt er 308 op).
  check('adres per agent: /<agent>, en terug te lezen uit pad en resource', agentUrl('grok') === 'https://mcp.tarasevych.com/grok' && slugUitPad('/gpt') === 'gpt'
    && slugUitPad('/onbekend') === null && slugUitResource('https://mcp.tarasevych.com/claude/') === 'claude' && slugUitResource('https://mcp.tarasevych.com/mcp') === null
    && slugUitResource('https://evil.example/claude') === null && slugUitPad('/mcp') === null && slugUitPad('/agents') === null);
  check('het oude pad /ai/<agent> blijft erkend (bestaande koppelingen breken niet) en wijst naar dezelfde agent',
    slugUitPad('/ai/gpt') === 'gpt' && slugUitResource('https://mcp.tarasevych.com/ai/claude/') === 'claude' && isOudAgentPad('/ai/claude') === 'claude'
    && isOudAgentPad('/claude') === null && oudAgentUrl('claude') === 'https://mcp.tarasevych.com/ai/claude' && slugUitPad('/ai/onbekend') === null
    && slugUitResource('https://evil.example/ai/claude') === null);
  check('terugkeeradres hoort bij de agent: claude.ai niet op /grok, grok.com niet op /claude; loopback en het eigen adres wel',
    redirectPastBijAgent('claude', 'https://claude.ai/api/mcp/auth_callback') && !redirectPastBijAgent('grok', 'https://claude.ai/api/mcp/auth_callback')
    && !redirectPastBijAgent('claude', 'https://grok.com/cb') && redirectPastBijAgent('cursor', 'cursor://anysphere.cursor-mcp/oauth/callback') && !redirectPastBijAgent('claude', 'cursor://x/cb')
    && redirectPastBijAgent('gemini', 'http://localhost:7777/oauth/callback') && redirectPastBijAgent('grok', 'https://mcp.tarasevych.com/oauth-terug', ['https://mcp.tarasevych.com/oauth-terug']));

  // ------------------------------------------------------------ integratie (database)
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN connector-v2 (integratie): geen database'); return einde(); }
  const sys = getPool('systeem');
  const A = `v2-a-${randomUUID()}`;
  const clients: string[] = [];
  await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [A, { email: `${A}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);
  // Er mag maar één eigenaar zijn (records_een_eigenaar): de bestaande gebruiken, anders er tijdelijk een maken.
  const bestaand = (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0]?.id as string | undefined;
  const E = bestaand ?? `v2-e-${randomUUID()}`;
  if (!bestaand) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [E, { email: `${E}@test.invalid`, role: 'owner', status: 'approved', entitlements: ['api-platform'] }]);
  // De connector vraagt het recht api-platform (of OWNER_EMAIL): tijdelijk geven, aan het eind de oorspronkelijke gegevens terug.
  const eOrigineel = (await sys.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [E])).rows[0]?.data;
  await sys.query("UPDATE app.records SET data = jsonb_set(data, '{entitlements}', '[\"api-platform\"]') WHERE tbl = 'users' AND id = $1", [E]);

  async function koppel(userId: string, slug: AgentSlug, keuze: v2st.V2Keuze | null, redirect = slug === 'claude' ? 'https://claude.ai/api/mcp/auth_callback' : 'http://127.0.0.1/callback') {
    const reg = body(await c.registerClient(JSON.stringify({ client_name: slug === 'gpt' ? 'ChatGPT' : slug, redirect_uris: [redirect] })));
    clients.push(reg.client_id);
    const p = pkce();
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: agentUrl(slug) });
    const loc = kop(a, 'location');
    const rid = loc.includes('consent=') ? new URL(loc).searchParams.get('consent') || '' : '';
    if (!rid) return { a, loc };
    const d = await c.consentDecide(userId, rid, true, null, keuze?.kanten.includes('gebruiker') === false ? 'technisch' : 'prive', keuze);
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const t = body(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirect })));
    return { a, loc, rid, d, t, clientId: reg.client_id };
  }
  const rpc = (slug: string, token: string | undefined, msg: unknown) => v2.rpc(slug, token ? `Bearer ${token}` : undefined, JSON.stringify(msg));
  const lijst = async (slug: string, token: string) => (body(await rpc(slug, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result?.tools ?? []) as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
  const roep = async (slug: string, token: string, name: string, args: Record<string, unknown> = {}) => body(await rpc(slug, token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }))?.result;

  try {
    // metadata en 401
    const prm = body(v2.prm('grok'));
    const zonder = await rpc('grok', undefined, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    check('PRM per agent: resource = eigen adres; 401 wijst naar de metadata van DEZE agent', prm.resource === 'https://mcp.tarasevych.com/grok' && prm.authorization_servers[0] === c.ISSUER
      && zonder.statusCode === 401 && kop(zonder, 'www-authenticate').includes('resource_metadata="https://mcp.tarasevych.com/grok/.well-known/oauth-protected-resource"'));
    check('onbekende agent → 404', (await rpc('chatgpt', 'x', {})).statusCode === 404);

    // claude.ai op het adres van grok: geweigerd vóór het venster
    const vreemd = await koppel(A, 'grok', null, 'https://claude.ai/api/mcp/auth_callback');
    check('autorisatie: terugkeeradres van een andere AI op /grok → invalid_target, geen toestemmingsvenster', vreemd.loc.includes('error=invalid_target') && !vreemd.loc.includes('consent='));

    // standaardkoppeling (keuze uit het venster = standaard)
    const k1 = await koppel(A, 'claude', { kanten: ['gebruiker'], sleutels: STANDAARD() });
    check('autorisatie v2: venster op /agents, agent in het verzoek, token uitgegeven', !!k1.rid && k1.loc.includes('/agents?consent=') && !!k1.t?.access_token);
    const info = await sys.query('SELECT agent FROM app.mcp_oauth_tokens WHERE access_hash = $1', [createHash('sha256').update(k1.t.access_token).digest('hex')]);
    check('token is gebonden aan de agent (kolom agent)', info.rows[0]?.agent === 'claude');
    const init = body(await rpc('claude', k1.t.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }));
    check('initialize: eigen servernaam en instructies met de naamregel', init.result.serverInfo.name === 'mijn-ruimte-claude' && /_claude_/.test(init.result.instructions) && /no technical/.test(init.result.instructions));
    const namen = (await lijst('claude', k1.t.access_token)).map((t) => t.name);
    check('tools/list: alleen v2-namen van deze agent, alleen wat gekozen is (standaard = lezen)', namen.length > 0 && namen.every((n) => n.endsWith('_tarasevych_com_gebruiker') && n.includes('_claude_'))
      && namen.includes('tonen_mijn_account_claude_ai_tarasevych_com_gebruiker') && !namen.some((n) => n.startsWith('lezen_bericht_')) && !namen.some((n) => n.startsWith('creeren_nieuwe_taak')), namen.join(','));
    const ik = JSON.parse((await roep('claude', k1.t.access_token, 'tonen_mijn_account_claude_ai_tarasevych_com_gebruiker')).content[0].text);
    check('tonen_mijn_account: account en verbinding (agent, ruimte, aantal rechten)', ik.account.email === `${A}@test.invalid` && ik.connection.agent === 'claude' && ik.connection.spaces.join() === 'gebruiker');

    // token op ander pad / oud /mcp
    check('token van /claude werkt niet op /grok (401 invalid_token)', (await rpc('grok', k1.t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).statusCode === 401);
    check('token van /claude werkt niet op het oude /mcp', (await c.rpcPost(`Bearer ${k1.t.access_token}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).statusCode === 401);

    // naam van een andere agent, niet-gekozen recht, beheer zonder kant
    const vreemdeNaam = await roep('claude', k1.t.access_token, 'tonen_mijn_account_grok_ai_tarasevych_com_gebruiker');
    check('tools/call met de naam van een andere agent → AGENT_MISMATCH', vreemdeNaam.isError && /AGENT_MISMATCH/.test(vreemdeNaam.content[0].text));
    const nietGekozen = await roep('claude', k1.t.access_token, 'creeren_nieuwe_taak_claude_hub_tarasevych_com_gebruiker', { title: 'x' });
    check('tools/call van een niet-gekozen recht → PERMISSION_OFF', nietGekozen.isError && /PERMISSION_OFF/.test(nietGekozen.content[0].text));
    const beheerNaam = await roep('claude', k1.t.access_token, 'tonen_live_release_claude_admin_tarasevych_com_beheer');
    check('tools/call van een beheertool zonder technische kant → PERMISSION_OFF (nooit uitgevoerd)', beheerNaam.isError && /PERMISSION_OFF/.test(beheerNaam.content[0].text));
    const journaal = await sys.query(`SELECT details->>'reden' AS reden, details->>'v2' AS v2, details->>'agent' AS agent FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND result = 'denied' ORDER BY id DESC LIMIT 5`, [A]).catch(() => ({ rows: [] as Array<Record<string, string>> }));
    check('journaal: weigeringen met reden, v2-naam en agent', journaal.rows.some((r) => r.reden === 'andere-agent') && journaal.rows.some((r) => r.reden === 'recht-uit' && r.agent === 'claude' && /_claude_/.test(r.v2 || '')), JSON.stringify(journaal.rows));
    const scopes = (await sys.query("SELECT scopes FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id = (SELECT id::text FROM app.mcp_oauth_tokens WHERE user_id = $1 AND agent = 'claude' AND revoked_at IS NULL LIMIT 1)", [A])).rows[0]?.scopes ?? [];
    check('scopelaag gelijk aan de rechten: geen mail-scope bij de standaard', Array.isArray(scopes) && !scopes.includes('mail.read') && scopes.includes('board.read'), JSON.stringify(scopes));

    // inperken meteen, uitbreiden → herverbinden
    const metBord = pasModusToe(STANDAARD(), 'lezen-schrijven', ['gebruiker'], { groep: 'bord' });
    const uit1 = await v2.wijzig(A, 'claude', { kanten: ['gebruiker'], sleutels: metBord });
    const naUitbreiden = (await lijst('claude', k1.t.access_token)).map((t) => t.name);
    check('uitbreiden: onthouden, herverbinden nodig, de actieve koppeling krijgt het NIET stil erbij', uit1.herverbinden && uit1.voorkeur.herverbinden && !naUitbreiden.some((n) => n.startsWith('creeren_nieuwe_taak')));
    const zonderZoeken = STANDAARD().filter((k) => k !== 'search_board:gebruiker');
    const uit2 = await v2.wijzig(A, 'claude', { kanten: ['gebruiker'], sleutels: zonderZoeken });
    const naInperken = (await lijst('claude', k1.t.access_token)).map((t) => t.name);
    check('inperken: geldt meteen voor de actieve koppeling', uit2.ingeperkt === 1 && !naInperken.some((n) => n.startsWith('zoeken_taken_bord')));
    const consent = await v2.consentV2(A, 'claude');
    check('venster weet wat de koppeling had (vorige) en wat klaarstaat (voorkeur)', !!consent.vorige && consent.voorkeur?.sleutels.join() === v2st.normaliseerKeuze({ kanten: ['gebruiker'], sleutels: zonderZoeken }).sleutels.join());
    // massale wijziging: voorbeeld slaat niets op; toepassen werkt als wijzigen per agent (inperken meteen, uitbreiden → herverbinden)
    const voor = await v2.massaVoorbeeld(A, ['claude', 'gpt'], { modus: 'geen', kanten: ['gebruiker'] });
    const nogActief = (await lijst('claude', k1.t.access_token)).length;
    check('massa-voorbeeld: rekent per agent uit (alles vervalt) en slaat NIETS op', voor.length === 2 && voor[0].verbonden && !voor[0].uitbreiding && voor[0].vervalt > 0 && nogActief > 0, JSON.stringify(voor.map((v) => [v.slug, v.verbonden, v.vervalt])));
    const gedaan = await v2.massaToepassen(A, voor);
    const naMassa = await lijst('claude', k1.t.access_token);
    check('massa-toepassen «alles uit»: geldt meteen voor de actieve koppeling (inperken), niets te herverbinden', gedaan.length === 2 && gedaan[0].gewijzigd && !gedaan[0].herverbinden && naMassa.length <= 1, `${gedaan.length} ${naMassa.length}`);
    const uitbr = await v2.massaVoorbeeld(A, ['claude'], { modus: 'lezen', kanten: ['gebruiker'], groep: 'mail' });
    const opslag = await v2.massaToepassen(A, uitbr);
    const vk = await v2st.leesVoorkeur(A, 'claude');
    check('massa-uitbreiding: onthouden als voorkeur + herverbinden; de actieve koppeling krijgt het niet stil erbij', uitbr[0].uitbreiding && opslag[0].herverbinden && !!vk?.herverbinden && !(await lijst('claude', k1.t.access_token)).some((t) => t.name.startsWith('lezen_bericht_')));
    const ingetrokken = await v2.herverbind(A, 'claude');
    check('herverbinden trekt de koppeling in → 401, de AI-klant begint de toestemming opnieuw', ingetrokken.length === 1 && (await rpc('claude', k1.t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).statusCode === 401);

    // eigenaar met beide kanten. 20.10.2026 (levende rechten): de beheerkant bestaat alleen zolang de eigenaar een LOPENDE
    // activering van zijn technische profiel heeft. Vroeger werd dat één keer bij de toestemming gecontroleerd en daarna nooit
    // meer; nu bij elke tools/list en tools/call. Daarom activeert deze test het profiel eerst echt.
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test')
      ON CONFLICT (user_id) DO NOTHING`, [E, `tech-${randomBytes(6).toString('hex')}`]);
    const techTab = randomBytes(24).toString('hex');
    await tp.activeren({ id: E, email: `${E}@test.invalid`, role: 'owner', status: 'approved' }, techTab, 60, 'test: levende rechten v2');
    // 20.10.2026: de technische kant van de AI is ondergeschikt aan de stand van de dienst «ai» in de gescheiden
    // gegevensruimtes (0082). Die staat standaard op «uit»; deze test gaat daar niet over, dus zetten we hem aan
    // (tests/eenheid/hulp/ruimte-ai.ts; de standen zelf staan in tests/eenheid/ruimte-ai-20261020.test.ts).
    await aiDienstAan(E);
    const k2 = await koppel(E, 'gpt', { kanten: ['beheer', 'gebruiker'], sleutels: ['get_live_release:beheer', 'machine_list:beheer', 'machine_list:gebruiker', 'v2_whoami:gebruiker'] });
    const ek = (await lijst('gpt', k2.t.access_token)).map((t) => t.name);
    check('eigenaar, beide kanten: beheer- en gebruikersnamen naast elkaar, elk met de eigen kant', !!k2.t?.access_token &&
      ek.includes('tonen_live_release_gpt_admin_tarasevych_com_beheer') && ek.includes('tonen_apparaten_gpt_mcp_tarasevych_com_gebruiker') && ek.includes('tonen_apparaten_gpt_mcp_tarasevych_com_beheer'), ek.join(','));
    // technisch profiel verlaten (de mens sluit het tabblad of klikt «Вийти з профілю»): de beheerkant verdwijnt METEEN,
    // zonder dat de koppeling of de privékant iets verliest, en een aanroep van een beheernaam wordt geweigerd.
    await tp.beeindigenBijIntrekken(E, 'handmatig');
    const naProfielUit = (await lijst('gpt', k2.t.access_token)).map((t) => t.name);
    const pogingZonderProfiel = await roep('gpt', k2.t.access_token, 'tonen_live_release_gpt_admin_tarasevych_com_beheer');
    check('levende rechten: zonder actief technisch profiel verdwijnen de _beheer-namen en wordt een aanroep geweigerd (TECH_PROFILE_OFF); de privékant blijft',
      !naProfielUit.some((n) => n.endsWith('_beheer')) && naProfielUit.includes('tonen_apparaten_gpt_mcp_tarasevych_com_gebruiker')
      && pogingZonderProfiel.isError && /TECH_PROFILE_OFF/.test(pogingZonderProfiel.content[0].text), naProfielUit.join(','));
    await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"member\"') WHERE tbl = 'users' AND id = $1", [E]);
    const naDegradatie = (await lijst('gpt', k2.t.access_token)).map((t) => t.name);
    const poging = await roep('gpt', k2.t.access_token, 'tonen_live_release_gpt_admin_tarasevych_com_beheer');
    check('niet meer eigenaar: beheertools verdwijnen meteen en worden geweigerd', !naDegradatie.some((n) => n.endsWith('_beheer')) && poging.isError && /OWNER_REQUIRED/.test(poging.content[0].text));

    // D-01 (audit fase 2): de noodstop «Стоп» maakt ook elke v2-connectorsessie (/<agent>) ongeldig: tools/call → 401, lijst leeg.
    const { stopAll } = await import('../../backend/ai-toestemmingen');
    const k3 = await koppel(E, 'claude', { kanten: ['gebruiker'], sleutels: ['v2_whoami:gebruiker'] });
    const voorStop = (await rpc('claude', k3.t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).statusCode;
    const stop = await stopAll(E, E);
    const naStop = (await rpc('claude', k3.t.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'tonen_mijn_account_claude_ai_tarasevych_com_gebruiker', arguments: {} } })).statusCode;
    const naStopGpt = (await rpc('gpt', k2.t.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/list' })).statusCode;
    const actief = (await sys.query('SELECT count(*)::int AS n FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL', [E])).rows[0].n;
    check('D-01: na stopAll geeft tools/call van een bestaande v2-sessie 401 (alle agents), 0 actieve koppelingen; antwoord telt de connectors', voorStop === 200 && stop.connectors >= 2 && naStop === 401 && naStopGpt === 401 && actief === 0, JSON.stringify({ voorStop, naStop, naStopGpt, actief, stop }));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await aiDienstOpruimen([A, E]);
    if (eOrigineel) await sys.query("UPDATE app.records SET data = $2 WHERE tbl = 'users' AND id = $1", [E, eOrigineel]).catch(() => undefined);
    if (clients.length) {
      await sys.query("DELETE FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id IN (SELECT id::text FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))", [clients]);
      await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]);
    }
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [[A, E]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [[A, E]]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = ANY($1)', [[A, E]]);
    await sys.query('DELETE FROM app.ai_toegang WHERE user_id = $1', [A]);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [bestaand ? [A] : [A, E]]);
  }
  await closePool();
  return einde();
}
