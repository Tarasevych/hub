// Levende rechten + één pad per agent (20.10.2026, opdracht van de eigenaar).
//
// Wat hier vastligt:
//  1. ADRES: één connector per agent op `/<agent>` (geen `/ai/`, geen eigen «deur»); het oude `/ai/<agent>` blijft leesbaar en
//     antwoordt 308 Permanent Redirect — nooit 301/302, want MCP praat over POST en die mogen clients in een GET veranderen;
//  2. `/mcp` wordt NIET omgeleid: daar hangen de koppelingen zonder agent en de agenttokens `tvh_…` aan;
//  3. RECHTEN ZIJN GEEN EIGENSCHAP VAN DE KOPPELING: `effectieveRuimte` kijkt naar de huidige staat van de mens (nog eigenaar +
//     lopende activering van het technische profiel), niet naar wat er bij de toestemming in de grant werd gezet;
//  4. eigenaar MET actief technisch profiel ziet de `_beheer`-namen en kan ze aanroepen;
//  5. zodra het profiel uit is: `tools/list` toont ze niet meer en `tools/call` weigert met TECH_PROFILE_OFF — ook als in de
//     grant `ruimte = 'technisch'` staat. De privékant van dezelfde connector blijft gewoon werken;
//  6. een niet-eigenaar ziet nooit een technisch hulpmiddel, ook niet als er beheer-sleutels in zijn rechten staan;
//  7. toestemming geven vraagt geen actief technisch profiel meer (de eigenaarseis blijft);
//  8. browserhulpmiddelen en hulpmiddelen van VREEMDE MCP-servers vallen onder exact dezelfde regel.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { AGENT_PAD_PREFIX, agentPrmUrl, agentUrl, isOudAgentPad, oudAgentUrl, slugUitPad, slugUitResource } from '../../shared/connector-v2/agenten';
import { TECH_PROFIEL_UIT, toolRuimte, toolInRuimte } from '../../shared/ai-ruimte';
import { externSleutel, externeToolNaam } from '../../shared/mcp-klant-model';
import { effectieveRuimte } from '../../backend/ai-ruimte-poort';
import * as c from '../../backend/mcp-connector';
import * as v2 from '../../backend/connector-v2';
import * as v2st from '../../backend/connector-v2-opslag';
import * as tp from '../../backend/tech-profiel';
import * as store from '../../backend/connectors-opslag';
import { sha256 } from '../../backend/connectors-crypto';

type Antw = { status: number; body: string; kop: (n: string) => string };
function verzoek(poort: number, methode: string, pad: string, body = ''): Promise<Antw> {
  return new Promise((ok, fout) => {
    const r = http.request({
      host: '127.0.0.1', port: poort, method: methode, path: pad,
      headers: { host: 'mcp.tarasevych.com', 'content-type': 'application/json', 'cf-connecting-ip': `198.19.${Math.floor(Math.random() * 200)}.9`, 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let data = ''; res.on('data', (ch) => { data += ch; }); res.on('end', () => ok({
        status: res.statusCode || 0, body: data,
        kop: (n: string) => String(res.headers[n.toLowerCase()] ?? ''),
      }));
    });
    r.on('error', fout); r.end(body);
  });
}

const json = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const kopVan = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-levende-rechten-20261020');

  // ============================================================== 1. puur: één pad per agent, het oude pad blijft leesbaar
  check('AGENT_PAD_PREFIX is leeg: het adres is /<agent>, niet /ai/<agent>',
    AGENT_PAD_PREFIX === '' && agentUrl('claude') === 'https://mcp.tarasevych.com/claude' && agentUrl('gpt') === 'https://mcp.tarasevych.com/gpt'
    && agentPrmUrl('claude') === 'https://mcp.tarasevych.com/claude/.well-known/oauth-protected-resource', agentUrl('claude'));
  check('het korte pad is terug te lezen; /mcp en de schermen van de site zijn geen agent',
    slugUitPad('/claude') === 'claude' && slugUitPad('/cursor/') === 'cursor' && slugUitPad('/mcp') === null && slugUitPad('/agents') === null
    && slugUitPad('/verbindingen') === null && slugUitPad('/ai') === null && slugUitPad('/claude/extra') === null);
  check('het oude pad /ai/<agent> blijft leesbaar (een token met de oude resource moet geldig blijven)',
    slugUitPad('/ai/claude') === 'claude' && slugUitResource('https://mcp.tarasevych.com/ai/grok/') === 'grok'
    && isOudAgentPad('/ai/grok') === 'grok' && isOudAgentPad('/grok') === null && oudAgentUrl('grok') === 'https://mcp.tarasevych.com/ai/grok');
  check('resource (RFC 8707): alleen onze host, nooit /mcp en nooit een vreemd domein',
    slugUitResource('https://mcp.tarasevych.com/claude') === 'claude' && slugUitResource('https://mcp.tarasevych.com/mcp') === null
    && slugUitResource('https://evil.example/claude') === null && slugUitResource('https://mcp.tarasevych.com.evil.example/claude') === null
    && slugUitResource(null) === null);

  // Browserhulpmiddelen en hulpmiddelen van vreemde MCP-servers horen bij de ruimte van het APPARAAT resp. de VERBINDING:
  // ze bestaan in beide kanten en vallen daarom onder dezelfde levende poort, niet onder een eigen uitzondering.
  check('vreemde MCP-hulpmiddelen (extern_*) volgen de ruimte van hun verbinding, net als een apparaat',
    toolRuimte(externeToolNaam('abcdef12-0000', 'lees_iets')) === 'apparaat'
    && toolInRuimte(externeToolNaam('abcdef12-0000', 'lees_iets'), 'technisch') && toolInRuimte(externeToolNaam('abcdef12-0000', 'lees_iets'), 'prive'));
  check('weigeringstekst TECH_PROFILE_OFF noemt het hulpmiddel, zegt dat er NIETS is uitgevoerd en wijst de weg terug',
    /^TECH_PROFILE_OFF: "tonen_live_release_claude_admin_tarasevych_com_beheer"/.test(TECH_PROFIEL_UIT('tonen_live_release_claude_admin_tarasevych_com_beheer'))
    && /Nothing was executed/.test(TECH_PROFIEL_UIT('x')) && /technical profile on again/.test(TECH_PROFIEL_UIT('x')) && /Do not try another way/.test(TECH_PROFIEL_UIT('x')));

  // Toestemming vraagt geen technisch profiel meer; de eigenaarseis staat er nog (punt 4 van de opdracht).
  const routes = readFileSync('backend/mcp-connector-routes.ts', 'utf8');
  check('consent v2: geen technischeRuimte-poort meer, wel OWNER_REQUIRED voor de beheerkant',
    /v2Keuze\.kanten\.includes\('beheer'\) && !isEigenaar\(auth\.user\)/.test(routes) && !/v2Keuze \? \(v2Keuze\.kanten\.includes\('beheer'\) \? technischeRuimte/.test(routes));
  const v2Routes = readFileSync('backend/connector-v2-routes.ts', 'utf8');
  check('beheerpagina: de technische kant kiezen vraagt de eigenaar, niet langer een actief profiel in dit tabblad',
    /isEigenaar/.test(v2Routes) && !/technischeRuimte/.test(v2Routes));
  const start = readFileSync('server/start.ts', 'utf8');
  check('server/start.ts: de korte paden horen bij de app en het oude pad krijgt 308 (nooit 301/302)',
    /V2_KORT = \/\^\\\/\(claude\|gpt\|grok\|gemini\|copilot\|cursor\)/.test(start) && /send\(res, 308, \{ Location: naar/.test(start)
    && !/send\(res, 30[12], \{ Location: naar/.test(start));
  const tunnel = readFileSync('deploy/cloudflared-config.yml', 'utf8');
  check('cloudflared-sjabloon: de deur krijgt niet langer /claude, /grok … (anders komt het nieuwe adres nooit bij de app)',
    !/\(\?i:grok\|claude\|chatgpt\|gemini\|copilot\)/.test(tunnel) && /path: \^\/\(oauth\|health\)\(\/\|\$\)/.test(tunnel));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN levende rechten (integratie): geen database'); return einde(); }

  // ============================================================== routering op de ECHTE server
  const sys = getPool('systeem');
  const dist = await mkdtemp(join(tmpdir(), 'mr-lr-dist-'));
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
  const vorigeDist = process.env.DIST_DIR; process.env.DIST_DIR = dist;
  let server: http.Server | null = null;

  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const M = `lr-lid-${randomUUID()}`;                       // gewoon lid: nooit technisch
  const clients: string[] = [];
  const agentIds: string[] = [];
  let eigenaarId = '';
  let eigenaarWasRol: string | null = null;
  let vorigeEigenaar: string | undefined;

  const rpc = (slug: string, token: string | undefined, msg: unknown) => v2.rpc(slug, token ? `Bearer ${token}` : undefined, JSON.stringify(msg));
  const lijst = async (slug: string, token: string) => (json(await rpc(slug, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result?.tools ?? []) as Array<{ name: string }>;
  const roep = async (slug: string, token: string, naam: string, args: Record<string, unknown> = {}) =>
    json(await rpc(slug, token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: naam, arguments: args } }))?.result as { isError?: boolean; content: Array<{ text: string }> };
  const init = async (slug: string, token: string) => json(await rpc(slug, token, { jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2025-06-18' } }))?.result;

  /** Volledige koppeling via de echte OAuth-route (autorisatie → toestemming → token), met de keuze uit het venster. */
  async function koppel(userId: string, slug: 'claude' | 'gpt', keuze: v2st.V2Keuze) {
    const redirect = slug === 'claude' ? 'https://claude.ai/api/mcp/auth_callback' : 'http://127.0.0.1/cb';
    const reg = json(await c.registerClient(JSON.stringify({ client_name: slug === 'gpt' ? 'ChatGPT' : 'Claude', redirect_uris: [redirect] })));
    clients.push(reg.client_id);
    const p = pkce();
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: agentUrl(slug) });
    const rid = new URL(kopVan(a as never, 'location')).searchParams.get('consent') || '';
    const d = await c.consentDecide(userId, rid, true, null, 'prive', keuze);
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const t = json(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirect })));
    return { token: String(t.access_token || ''), grantId: '' };
  }

  try {
    server = (await import('../../server/start')).createServer();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const poort = (server.address() as { port: number }).port;

    const kort = await verzoek(poort, 'POST', '/claude', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    check('POST /claude komt bij de connector van Claude: 401 met WWW-Authenticate naar de metadata van DEZE agent',
      kort.status === 401 && kort.kop('www-authenticate').includes(`resource_metadata="${agentPrmUrl('claude')}"`) && kort.kop('www-authenticate').includes('realm="mcp-claude"'),
      `${kort.status} ${kort.kop('www-authenticate').slice(0, 120)}`);
    const oud = await verzoek(poort, 'POST', '/ai/claude', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    check('POST /ai/claude → 308 Permanent Redirect naar /claude (308 houdt methode én body; 301/302 zou er een GET van maken)',
      oud.status === 308 && oud.kop('location') === '/claude', `${oud.status} ${oud.kop('location')}`);
    const oudQuery = await verzoek(poort, 'POST', '/ai/grok?x=1', '{}');
    check('de omleiding houdt de query en werkt voor elke agent', oudQuery.status === 308 && oudQuery.kop('location') === '/grok?x=1', oudQuery.kop('location'));
    const prmKort = await verzoek(poort, 'GET', '/claude/.well-known/oauth-protected-resource');
    const prmStandaard = await verzoek(poort, 'GET', '/.well-known/oauth-protected-resource/claude');
    check('metadata (RFC 9728) in beide vormen onder het korte pad: resource = het korte adres',
      prmKort.status === 200 && json(prmKort).resource === agentUrl('claude') && prmStandaard.status === 200 && json(prmStandaard).resource === agentUrl('claude'),
      `${prmKort.status}/${prmStandaard.status} ${prmKort.body.slice(0, 80)}`);
    const prmOud = await verzoek(poort, 'GET', '/.well-known/oauth-protected-resource/ai/claude');
    const prmOudEigen = await verzoek(poort, 'GET', '/ai/claude/.well-known/oauth-protected-resource');
    check('de oude metadata-adressen leiden 308 naar de nieuwe (clients die ze onthielden blijven werken)',
      prmOud.status === 308 && prmOud.kop('location') === '/.well-known/oauth-protected-resource/claude'
      && prmOudEigen.status === 308 && prmOudEigen.kop('location') === '/claude/.well-known/oauth-protected-resource',
      `${prmOud.status} ${prmOud.kop('location')} | ${prmOudEigen.status} ${prmOudEigen.kop('location')}`);
    const oudeMcp = await verzoek(poort, 'POST', '/mcp', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    check('/mcp wordt NIET omgeleid maar blijft zelf antwoorden: de koppelingen zonder agent en de tokens tvh_… breken niet',
      oudeMcp.status === 401 && oudeMcp.kop('www-authenticate').startsWith('Bearer realm="mcp"'), `${oudeMcp.status} ${oudeMcp.kop('www-authenticate').slice(0, 60)}`);
    const onbekend = await verzoek(poort, 'POST', '/chatgpt', '{}');
    check('een pad dat geen agent is (/chatgpt — de oude naam van de deur) wordt nooit als connector behandeld', onbekend.status !== 401 && onbekend.status !== 200, String(onbekend.status));

    // ============================================================== effectieveRuimte: de levende poort zelf
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [M, { email: `${M}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);
    vorigeEigenaar = (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0]?.id as string | undefined;
    eigenaarId = vorigeEigenaar ?? `lr-eig-${randomUUID()}`;
    if (!vorigeEigenaar) {
      await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [eigenaarId, { email: `${eigenaarId}@test.invalid`, role: 'owner', status: 'approved', entitlements: ['api-platform'] }]);
    } else {
      eigenaarWasRol = (await sys.query("SELECT data->>'entitlements' AS e FROM app.records WHERE tbl='users' AND id=$1", [eigenaarId])).rows[0]?.e ?? null;
      await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{entitlements}', '["api-platform"]') WHERE tbl = 'users' AND id = $1`, [eigenaarId]);
    }
    const eigenaar = { id: eigenaarId, email: `${eigenaarId}@test.invalid`, role: 'owner', status: 'approved' };
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test')
      ON CONFLICT (user_id) DO NOTHING`, [eigenaarId, `tech-${randomBytes(6).toString('hex')}`]);
    // 20.10.2026 (avond): de technische kant van de AI is bovendien ONDERGESCHIKT aan de stand van de dienst «ai» in de
    // gescheiden gegevensruimtes (migratie 0082, app.ruimte_dienst_stand; backend/ai-ruimte-poort.ts → aiPoortNu). Zonder
    // een aangezette dienst bestaat er geen technisch hulpmiddel — ook niet met een lopende activering. Deze test gaat over
    // de LEVENDE rechten van de connector, dus zetten we die dienst hier op «eigen gegevens» en laten
    // tests/eenheid/ruimte-ai-20261020.test.ts de standen zelf nalopen.
    await sys.query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1,'per_dienst',$1) ON CONFLICT (user_id) DO NOTHING`, [eigenaarId]);
    await sys.query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door) VALUES ($1,'ai','eigen','uit','test')
      ON CONFLICT (user_id, dienst) DO UPDATE SET stand = 'eigen', bevroren_op = NULL, bevroren_oorzaak = ''`, [eigenaarId]);

    check('effectieveRuimte: een gewoon lid is altijd prive, ook met een technisch profiel in de database',
      (await effectieveRuimte(M)) === 'prive' && (await effectieveRuimte(M, 'member')) === 'prive' && (await effectieveRuimte('bestaat-niet')) === 'prive');
    check('effectieveRuimte: de eigenaar ZONDER lopende activering is ook prive (het profiel hebben is niet genoeg)',
      (await effectieveRuimte(eigenaarId)) === 'prive');
    const tab = randomBytes(24).toString('hex');
    await tp.activeren(eigenaar, tab, 60, 'test: levende rechten van de connector');
    check('effectieveRuimte: eigenaar MET lopende activering is technisch — zonder tabcontext (de AI heeft er geen) en met',
      (await effectieveRuimte(eigenaarId)) === 'technisch' && (await effectieveRuimte(eigenaarId, 'owner', tab)) === 'technisch'
      && (await effectieveRuimte(eigenaarId, 'owner', randomBytes(24).toString('hex'))) === 'prive');
    check('effectieveRuimte: de rol wint — dezelfde lopende activering met een andere rol geeft prive', (await effectieveRuimte(eigenaarId, 'member')) === 'prive');

    // ============================================================== de connector: één adres, beide sets, levende filtering
    const sleutels = ['v2_whoami:gebruiker', 'machine_list:gebruiker', 'machine_list:beheer', 'get_live_release:beheer'];
    const k = await koppel(eigenaarId, 'claude', { kanten: ['beheer', 'gebruiker'], sleutels });
    check('toestemming met beide kanten is gelukt en gaf een token (en vroeg GEEN actief technisch profiel in het venster)', !!k.token);
    const grantId = (await sys.query('SELECT id::text AS id, ruimte FROM app.mcp_oauth_tokens WHERE access_hash = $1', [sha256(k.token)])).rows[0];
    const metProfiel = (await lijst('claude', k.token)).map((t) => t.name);
    const roepBeheer = await roep('claude', k.token, 'tonen_apparaten_claude_mcp_tarasevych_com_beheer');
    const initMet = await init('claude', k.token);
    check('eigenaar met actief technisch profiel: één adres toont BEIDE sets en een _beheer-aanroep wordt uitgevoerd',
      metProfiel.includes('tonen_live_release_claude_admin_tarasevych_com_beheer') && metProfiel.includes('tonen_apparaten_claude_mcp_tarasevych_com_beheer')
      && metProfiel.includes('tonen_apparaten_claude_mcp_tarasevych_com_gebruiker')
      && !/TECH_PROFILE_OFF|OWNER_REQUIRED|SPACE_SEPARATED/.test(roepBeheer.content[0].text), `${metProfiel.join(',')} | ${roepBeheer.content[0].text.slice(0, 80)}`);
    // 20.10.2026 (avond): «technische kant» in plaats van «technisch profiel» — die kant hangt nu aan twee dingen samen
    // (het profiel én de dienst «ai» in de technische gegevensruimte), en de instructie noemt ze allebei eerlijk.
    check('initialize zegt dat de technische kant nu actief is (de AI weet waarom ze beide sets ziet)',
      /technical side is active NOW/.test(initMet.instructions) && /CURRENT state of the user/.test(initMet.instructions));
    const ikMet = JSON.parse((await roep('claude', k.token, 'tonen_mijn_account_claude_ai_tarasevych_com_gebruiker')).content[0].text);
    check('tonen_mijn_account: «granted» (wat de mens gaf) staat los van «activeNow» (wat nu bestaat)',
      ikMet.connection.granted.join() === 'beheer,gebruiker' && ikMet.connection.activeNow.includes('beheer') && ikMet.connection.technicalProfileActive === true, JSON.stringify(ikMet.connection));

    // In de grant zetten we met de hand `ruimte = 'technisch'`: het oude, ingebakken veld. Het mag de filtering NIET meer bepalen.
    await sys.query("UPDATE app.mcp_oauth_tokens SET ruimte = 'technisch' WHERE id = $1", [grantId.id]);
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig');
    const zonderProfiel = (await lijst('claude', k.token)).map((t) => t.name);
    const weigering = await roep('claude', k.token, 'tonen_live_release_claude_admin_tarasevych_com_beheer');
    const weigering2 = await roep('claude', k.token, 'tonen_apparaten_claude_mcp_tarasevych_com_beheer');
    const priveNog = await roep('claude', k.token, 'tonen_mijn_account_claude_ai_tarasevych_com_gebruiker');
    const initZonder = await init('claude', k.token);
    check('profiel uit: de _beheer-namen verdwijnen uit tools/list, de privékant blijft volledig staan',
      !zonderProfiel.some((n) => n.endsWith('_beheer')) && zonderProfiel.includes('tonen_apparaten_claude_mcp_tarasevych_com_gebruiker')
      && zonderProfiel.includes('tonen_mijn_account_claude_ai_tarasevych_com_gebruiker'), zonderProfiel.join(','));
    check('profiel uit: tools/call van een _beheer-naam wordt geweigerd met TECH_PROFILE_OFF, ook al staat in de grant ruimte=technisch',
      weigering.isError === true && /^TECH_PROFILE_OFF/.test(weigering.content[0].text)
      && weigering2.isError === true && /^TECH_PROFILE_OFF/.test(weigering2.content[0].text), `${weigering.content[0].text.slice(0, 70)} | ${weigering2.content[0].text.slice(0, 70)}`);
    check('profiel uit: een privé-aanroep op dezelfde koppeling werkt gewoon door (geen enkele straf voor de privékant)',
      priveNog.isError !== true && JSON.parse(priveNog.content[0].text).connection.technicalProfileActive === false);
    check('initialize legt de kortere lijst uit in plaats van hem onverklaard te laten',
      /NOT active at this moment/.test(initZonder.instructions) && /not a malfunction/.test(initZonder.instructions));
    const reden = (await sys.query(`SELECT details->>'reden' AS reden, details->>'v2' AS v2 FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND result = 'denied' ORDER BY id DESC LIMIT 4`, [eigenaarId])).rows;
    check('elke weigering staat in het journaal met reden «tech-profiel» en de v2-naam die de AI gebruikte',
      reden.some((r: any) => r.reden === 'tech-profiel' && /_beheer$/.test(String(r.v2 || ''))), JSON.stringify(reden));

    // Weer aanzetten: zonder herverbinden komt alles terug (het recht bleef immers staan).
    await tp.activeren(eigenaar, randomBytes(24).toString('hex'), 60, 'test: profiel weer aan');
    const weerAan = (await lijst('claude', k.token)).map((t) => t.name);
    check('profiel weer aan: de _beheer-namen komen terug ZONDER opnieuw verbinden (het recht bleef bewaard)',
      weerAan.includes('tonen_live_release_claude_admin_tarasevych_com_beheer'), weerAan.filter((n) => n.endsWith('_beheer')).join(','));

    // ============================================================== een niet-eigenaar ziet nooit iets technisch
    const kl = await koppel(M, 'gpt', { kanten: ['gebruiker'], sleutels: ['v2_whoami:gebruiker', 'machine_list:gebruiker'] });
    const lidGrant = (await sys.query('SELECT id::text AS id FROM app.mcp_oauth_tokens WHERE access_hash = $1', [sha256(kl.token)])).rows[0].id;
    // Met de hand beheer-sleutels in de rechten van dit lid zetten (zoals een aanvaller of een oude rij zou doen).
    await sys.query("UPDATE app.connector_v2_rechten SET kanten = ARRAY['beheer','gebruiker'], sleutels = $2::text[] WHERE grant_id = $1",
      [lidGrant, ['v2_whoami:gebruiker', 'machine_list:gebruiker', 'machine_list:beheer', 'get_live_release:beheer']]);
    const lidLijst = (await lijst('gpt', kl.token)).map((t) => t.name);
    const lidPoging = await roep('gpt', kl.token, 'tonen_live_release_gpt_admin_tarasevych_com_beheer');
    check('niet-eigenaar: beheer-sleutels in de rechten geven nog steeds NIETS — niet in de lijst en niet bij de aanroep (OWNER_REQUIRED)',
      !lidLijst.some((n) => n.endsWith('_beheer')) && lidLijst.includes('tonen_apparaten_gpt_mcp_tarasevych_com_gebruiker')
      && lidPoging.isError === true && /OWNER_REQUIRED/.test(lidPoging.content[0].text), `${lidLijst.join(',')} | ${lidPoging.content[0].text.slice(0, 60)}`);

    // ============================================================== browser en vreemde MCP-servers onder dezelfde regel
    const bToken = randomBytes(24).toString('hex');
    const browser = await store.createAgent(eigenaarId, `Chrome tech (${T})`, 'browser', sha256(bToken), { enabled: ['browser.snapshot'] }, undefined, { version: '0.6.2', ruimte: 'technisch' });
    agentIds.push(browser.id);
    const externId = `lr-ext-${randomBytes(6).toString('hex')}`;
    await sys.query(`INSERT INTO app.externe_mcp_verbinding (user_id, id, naam, adres, ruimte, actief, staat) VALUES ($1,$2,'Nep extern','https://nep-extern.voorbeeld.test/mcp','technisch',true,'klaar')`, [eigenaarId, externId]);
    await sys.query(`INSERT INTO app.externe_mcp_hulpmiddel (user_id, verbinding_id, naam, titel, beschrijving, alleen_lezen, aan) VALUES ($1,$2,'lees_iets','Lees iets','',true,true)`, [eigenaarId, externId]);
    const externNaam = `extern_${externSleutel(externId)}_lees_iets`;
    const techLijst = (await c.lijstTools({ userId: eigenaarId, clientName: 'Claude', ruimte: 'technisch' }, { aliassen: false })).map((t) => t.name);
    check('technische ruimte ziet het technische browserslot én de technische vreemde MCP-server (beide volgen hun eigen ruimte)',
      techLijst.includes('browser_snapshot') && techLijst.includes(externNaam), `${techLijst.filter((n) => n.startsWith('browser_') || n.startsWith('extern_')).join(',')}`);
    const priveLijst = (await c.lijstTools({ userId: eigenaarId, clientName: 'Claude', ruimte: 'prive' }, { aliassen: false })).map((t) => t.name);
    check('de privéruimte ziet die technische vreemde server niet (nooit kruislings)', !priveLijst.includes(externNaam));
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig');
    const browserWeg = await c.roepTool({ userId: eigenaarId, clientName: 'Claude', tokenId: grantId.id, ruimte: 'technisch', agent: 'claude' }, 'browser_snapshot', { browser: browser.id });
    const externWeg = await c.roepTool({ userId: eigenaarId, clientName: 'Claude', tokenId: grantId.id, ruimte: 'technisch', agent: 'claude' }, externNaam, {});
    check('profiel uit: ook een technische BROWSER-opdracht wordt geweigerd vóór de extensie (TECH_PROFILE_OFF), niet stil op een eigen tabblad uitgevoerd',
      browserWeg.isError === true && /^TECH_PROFILE_OFF/.test(browserWeg.content[0].text), browserWeg.content[0].text.slice(0, 80));
    check('profiel uit: ook een hulpmiddel van een technische VREEMDE MCP-server wordt geweigerd met dezelfde code',
      externWeg.isError === true && /^TECH_PROFILE_OFF/.test(externWeg.content[0].text), externWeg.content[0].text.slice(0, 80));
    check('het oude /mcp valt onder dezelfde levende poort: zonder profiel toont een technische koppeling NIETS',
      (await c.technischNuGeldig({ userId: eigenaarId, clientName: 'Claude', ruimte: 'technisch' })) === false
      && (await c.technischNuGeldig({ userId: eigenaarId, clientName: 'Claude', ruimte: 'prive' })) === true);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
    await rm(dist, { recursive: true, force: true }).catch(() => undefined);
    const ids = [M, eigenaarId].filter(Boolean);
    if (clients.length) {
      await sys.query("DELETE FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id IN (SELECT id::text FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))", [clients]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    }
    if (agentIds.length) await sys.query('DELETE FROM app.agents WHERE id = ANY($1::uuid[])', [agentIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.externe_mcp_hulpmiddel WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.externe_mcp_verbinding WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_toegang WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.audit WHERE owner_id = ANY($1)', [ids]).catch(() => undefined);
    if (eigenaarWasRol !== null) await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{entitlements}', $2::jsonb) WHERE tbl = 'users' AND id = $1`, [eigenaarId, eigenaarWasRol]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [vorigeEigenaar ? [M] : ids]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
