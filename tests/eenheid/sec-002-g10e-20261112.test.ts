// SEC-002 (12.11.2026), groep g10e: regressietests voor de bevindingen ai-mcp-01, geheimen-01, ai-mcp-10, http-rand-06,
// ai-mcp-11, keten-config-05, ai-mcp-07, extensie-08, http-rand-07, aanmelden-09 / integraties-12 en ai-mcp-14.
// Elke test toont de fout VÓÓR de patch (rood) en blijft daarna als regressie staan. Alleen verzonnen geheimen.
import { createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { WebSocket } from 'ws';
import { closePool, getPool } from '../../server/platform/pg';
import { sealWithEnvKey } from '../../server/platform/beveiliging';
import * as c from '../../backend/mcp-connector';
import * as sk from '../../backend/sleutelkluis';
import { callTool, resolveAlias } from '../../backend/connectors-hulpmiddelen';
import { zetSiteAanroeper } from '../../backend/site-aanroep';
import { metNamens } from '../../backend/mcp-namens';
import { zetToegang } from '../../backend/ai-toegang';
import { TECHNISCHE_STANDAARD_SCOPES } from '../../shared/ai-toegang';
import { checker } from './hulp/nep-google';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const body = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const kop = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Check = (naam: string, ok: boolean, info?: string) => void;
/** Kale AES-256-GCM-opening van een envelop '<versie>.<iv>.<ct>.<tag>' — zonder de controles van de kluis, om te bewijzen onder WELKE sleutel iets staat. */
const gcmRuw = (sleutel: Buffer, envelop: string, aad: string): string => {
  const [, iv, ct, tag] = envelop.split('.');
  const d = createDecipheriv('aes-256-gcm', sleutel, Buffer.from(iv, 'base64url'), { authTagLength: 16 });
  d.setAAD(Buffer.from(aad, 'utf8')); d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
};

// ---------------------------------------------------------------------------------------------------- ai-mcp-01
async function aiMcp01(check: Check) {
  // Puur: het doel van een alias komt NOOIT uit de argumenten van de klant, en alleen eigen sleutels van de aliastabel tellen.
  const viaLijst = resolveAlias('list_pages', { __target: 'machine_exec', command: 'id' });
  check('ai-mcp-01: resolveAlias(list_pages, {__target}) blijft browser_list_tabs en laat __target vallen',
    viaLijst.name === 'browser_list_tabs' && !('__target' in (viaLijst.args ?? {})), JSON.stringify(viaLijst));
  const proto = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'].map((n) => resolveAlias(n, { __target: 'mail_send', to: 'x' }).name);
  check('ai-mcp-01: namen uit Object.prototype (constructor, toString, …) zijn geen alias', proto.join(',') === 'constructor,toString,valueOf,hasOwnProperty,__proto__', proto.join(','));
  const klik = resolveAlias('click', { __target: 'machine_exec', uid: 'u1' });
  check('ai-mcp-01: alias MET map (click) negeert __target van de klant', klik.name === 'browser_click' && !('__target' in klik.args), JSON.stringify(klik));
  const terug = resolveAlias('navigate_page', { type: 'back' });
  const naarUrl = resolveAlias('navigate_page', { __target: 'machine_exec', url: 'https://mcp.tarasevych.com/' });
  check('ai-mcp-01: navigate_page houdt zijn EIGEN omschakeling (back → browser_history), niet die van de klant',
    terug.name === 'browser_history' && terug.args.action === 'back' && naarUrl.name === 'browser_open' && !('__target' in naarUrl.args), JSON.stringify([terug, naarUrl]));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ai-mcp-01 (DB): geen database'); return; }
  const sys = getPool('systeem');
  const A = `sec002-g10e-a-${randomUUID()}`;
  await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [A, { email: `${A}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);
  const routes: string[] = [];
  zetSiteAanroeper(async (_u, _s, route) => { routes.push(String(route)); return { status: 200, data: { ok: true, nep: true } }; });
  let clientId = '';
  try {
    const reg = body(await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' })));
    clientId = reg.client_id;
    const p = pkce();
    const a = await c.authorize({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: c.RESOURCE });
    const rid = new URL(kop(a, 'location')).searchParams.get('consent') || '';
    const d = await c.consentDecide(A, rid, true);
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const t = body(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: clientId, redirect_uri: CALLBACK })));
    const tok = t.access_token as string;
    const call = async (name: string, args: Record<string, unknown>) => body(await c.rpcPost(`Bearer ${tok}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }))).result as { isError?: boolean; content: Array<{ text: string }> };
    const tekst = (r: { content: Array<{ text: string }> }) => String(r.content?.[0]?.text ?? '');

    const direct = await call('get_system_health', {});
    check('ai-mcp-01: privékoppeling, direct get_system_health → SPACE_SEPARATED (uitgangspunt)', direct.isError === true && /^SPACE_SEPARATED/.test(tekst(direct)), tekst(direct).slice(0, 60));
    routes.length = 0;
    const via1 = await call('list_pages', { __target: 'get_system_health' });
    const via2 = await call('list_pages', { __target: 'read_release_file', path: 'backend/index.ts' });
    const via3 = await call('constructor', { __target: 'get_system_health' });
    check('ai-mcp-01: list_pages/constructor met __target bereikt GEEN technische route van de site', routes.length === 0, JSON.stringify(routes));
    check('ai-mcp-01: constructor{__target} is een onbekend hulpmiddel (geen uitvoering)', via3.isError === true && /Unknown tool/.test(tekst(via3)), tekst(via3).slice(0, 80));
    check('ai-mcp-01: list_pages{__target} gedraagt zich als list_pages (browserhulpmiddel), niet als het doel',
      !/"nep":\s*true/.test(tekst(via1)) && !/"nep":\s*true/.test(tekst(via2)), `${tekst(via1).slice(0, 60)} | ${tekst(via2).slice(0, 60)}`);

    // «Alleen v2»: direct en via een alias dezelfde weigering; ook de hulpmiddelen die alleen in V2_ALLEEN staan (ecosysteem).
    routes.length = 0;
    const betaalDirect = await call('payments_list', {});
    const betaalAlias = await call('list_pages', { __target: 'payments_list' });
    const ecoDirect = await call('ecosysteem_context_list', {});
    check('ai-mcp-01: payments_list direct → V2_ONLY, via list_pages{__target} geen betaalroute', /^V2_ONLY/.test(tekst(betaalDirect)) && routes.length === 0 && !/"nep":\s*true/.test(tekst(betaalAlias)), `${tekst(betaalDirect).slice(0, 30)} | ${JSON.stringify(routes)}`);
    check('ai-mcp-01 (variant): een alleen-v2-hulpmiddel buiten de zeven (ecosysteem_context_list) wordt op het oude /mcp geweigerd',
      ecoDirect.isError === true && /^V2_ONLY/.test(tekst(ecoDirect)), tekst(ecoDirect).slice(0, 80));

    // Journaal: de ruwe naam én de interne naam staan erin (een alias verbergt de echte daad niet).
    const audit = (await sys.query(`SELECT details->>'tool' AS tool, details->>'intern' AS intern FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND details->>'tool' = 'list_pages' ORDER BY seq DESC LIMIT 1`, [A])).rows[0];
    check('ai-mcp-01: journaal van een aliasaanroep noemt de ruwe naam en de interne naam', audit?.tool === 'list_pages' && audit?.intern === 'browser_list_tabs', JSON.stringify(audit));

    // callTool rechtstreeks (chat, zijpaneel, werkruimte gebruiken dezelfde ingang): technische context mag geen privéroute bereiken.
    const grant = (await sys.query('SELECT id FROM app.mcp_oauth_tokens WHERE user_id = $1 LIMIT 1', [A])).rows[0].id as string;
    await zetToegang(A, { soort: 'mcp-koppeling', id: grant }, [...TECHNISCHE_STANDAARD_SCOPES]);
    routes.length = 0;
    const tech = await metNamens({ client: 'Claude', grantId: grant, ruimte: 'technisch', lade: 'technisch' }, () => callTool(A, 'list_pages', { __target: 'calendar_list_calendars' }));
    check('ai-mcp-01: callTool(list_pages, {__target: calendar_list_calendars}) in een technische context bereikt geen agendaroute', routes.length === 0 && !/"nep":\s*true/.test(String(tech.content[0]?.text)), JSON.stringify(routes));
    const protoTool = await metNamens({ client: 'Claude', grantId: grant, ruimte: 'prive' }, () => callTool(A, 'constructor', {}));
    const protoTool2 = await metNamens({ client: 'Claude', grantId: grant, ruimte: 'prive' }, () => callTool(A, 'toString', { machine: 'x' }));
    check('ai-mcp-01 (variant): callTool met een naam uit Object.prototype → «Unknown tool», geen opdrachtpad',
      /^Unknown tool/.test(String(protoTool.content[0]?.text)) && /^Unknown tool/.test(String(protoTool2.content[0]?.text)), `${String(protoTool.content[0]?.text).slice(0, 60)} | ${String(protoTool2.content[0]?.text).slice(0, 60)}`);
    const ecoChat = await metNamens({ client: 'Claude', grantId: grant, ruimte: 'prive' }, () => callTool(A, 'payments_list', {}));
    check('ai-mcp-01: callTool weigert een alleen-v2-hulpmiddel buiten connector v2 (V2_ONLY)', ecoChat.isError === true && /^V2_ONLY/.test(String(ecoChat.content[0]?.text)) && routes.length === 0, String(ecoChat.content[0]?.text).slice(0, 60));
  } finally {
    zetSiteAanroeper(null);
    await sys.query('DELETE FROM app.ai_toegang WHERE user_id = $1', [A]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [A]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_oauth_auth WHERE user_id = $1', [A]).catch(() => undefined);
    if (clientId) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [clientId]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [A]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------- geheimen-01
async function geheimen01(check: Check) {
  // Vangnet voor de hele klasse: een sleutel van alleen nullen wordt nooit gebruikt om te verzegelen of te openen.
  let nulGeweigerd = false;
  try { sk.verzegelMetDek(Buffer.alloc(32), 'geheim', 'aad'); } catch (e) { nulGeweigerd = (e as { code?: string }).code === 'SLEUTELKLUIS_GESLOTEN'; }
  check('geheimen-01: verzegelMetDek weigert een sleutel van 32 nulbytes', nulGeweigerd);
  let nulOmslag = false;
  try { sk.omslaan(Buffer.alloc(32), randomBytes(32), 'aad'); } catch (e) { nulOmslag = (e as { code?: string }).code === 'SLEUTELKLUIS_GESLOTEN'; }
  check('geheimen-01: omslaan weigert een KEK van 32 nulbytes', nulOmslag);

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN geheimen-01 (DB): geen database'); return; }
  const sys = getPool('systeem');
  process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1 = randomBytes(32).toString('base64');
  const U = `sec002-g10e-kluis-${randomUUID()}`;
  const lade = { userId: U, ruimte: 'prive' as const };
  sk.zetHouderControle(async () => true);
  try {
    await sk.inschakelen(lade, { soort: 'sessie', id: 's1' });
    const echteDek = Buffer.from(sk.sleutelOpen(lade)!);
    const aad = `bewijs|${U}`;
    const oud = [1, 2, 3].map((i) => sealWithEnvKey('MAIL_APP_WACHTWOORD_SLEUTEL_V1', `verzonnen-geheim-${i}`, aad));
    const nieuw: string[] = [];
    let tweedeGestart = false;
    sk.registreerHerversleutelaar('sec002.g10e.eerste', async (_l, dek) => {
      for (const e of oud) { try { nieuw.push(sk.herversleutelEnvelop(dek, e, aad, 'MAIL_APP_WACHTWOORD_SLEUTEL_V1')); } catch { /* geweigerd */ } await slaap(40); }
      return { gevonden: oud.length, herversleuteld: nieuw.length };
    });
    sk.registreerHerversleutelaar('sec002.g10e.tweede', async () => { tweedeGestart = true; return { gevonden: 0, herversleuteld: 0 }; });
    const p = sk.herversleutelen(lade).then((u) => ({ u, fout: '' }), (e) => ({ u: null, fout: String((e as { code?: string }).code || (e as Error).message) }));
    await slaap(50);
    // De mens meldt zich af in een ander tabblad (of klikt «Заблокувати»): de enige houder verdwijnt midden in het werk.
    sk.sleutelSluitenVoorHouder('sessie', 's1');
    const uit = await p;
    const nulSleutel = Buffer.alloc(32);
    const onderNul = nieuw.filter((e, i) => { try { return gcmRuw(nulSleutel, e, aad) === `verzonnen-geheim-${i + 1}`; } catch { return false; } }).length;
    const onderEcht = nieuw.filter((e, i) => { try { return sk.ontzegelMetDek(echteDek, e, aad) === `verzonnen-geheim-${i + 1}`; } catch { return false; } }).length;
    check('geheimen-01: geen enkele rij is onder de NUL-sleutel verzegeld nadat de sleutel midden in het herversleutelen dichtging', onderNul === 0, `onderNul=${onderNul} van ${nieuw.length}`);
    check('geheimen-01: elke geschreven rij gaat open met de ECHTE sleutel', nieuw.length > 0 && onderEcht === nieuw.length, `onderEcht=${onderEcht} van ${nieuw.length}`);
    check('geheimen-01: herversleutelen breekt af met SLEUTELKLUIS_GESLOTEN en start de volgende tabel niet', uit.fout === 'SLEUTELKLUIS_GESLOTEN' && tweedeGestart === false, `fout=${uit.fout} tweede=${tweedeGestart}`);
    const rij = (await sys.query('SELECT herversleuteld_op FROM app.sleutelkluis WHERE user_id = $1 AND ruimte = $2', [U, 'prive'])).rows[0];
    check('geheimen-01: een afgebroken ronde zet «herversleuteld op» niet (het scherm meldt geen succes)', !rij?.herversleuteld_op, String(rij?.herversleuteld_op));
  } finally {
    sk.geheugenLeeg();
    sk.zetHouderControle(null);
    await sys.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis_journaal WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [U]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------- hulp: OAuth-koppeling
const testGebruiker = async (prefix: string, rol = 'member'): Promise<string> => {
  const id = `sec002-g10e-${prefix}-${randomUUID()}`;
  await getPool('systeem').query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [id, { email: `${id}@test.invalid`, role: rol, status: 'approved', entitlements: ['api-platform'] }]);
  return id;
};
const opruimenGebruiker = async (id: string) => {
  const sys = getPool('systeem');
  for (const sql of ['DELETE FROM app.ai_toegang WHERE user_id = $1', 'DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', 'DELETE FROM app.mcp_oauth_auth WHERE user_id = $1',
    'DELETE FROM app.mcp_console_tokens WHERE user_id = $1', "DELETE FROM app.records WHERE tbl = 'users' AND id = $1"]) await sys.query(sql, [id]).catch(() => undefined);
};
/**
 * Eén eigenaar per database (unieke index records_een_eigenaar — de productiegarantie «nooit twee eigenaars»). In de gedeelde
 * test-DB van het uitgaveproces laat een eerdere test (sec-002-g01: OWNER_EMAIL-eigenaar) terecht een eigenaar achter; blind een
 * tweede INSERT gaf daar «duplicate key … records_een_eigenaar». Daarom: de bestaande eigenaar LENEN (`geleend: true` — dan ruimt
 * de test alleen op wat hij zelf aanmaakte, nooit de gebruiker of zijn andere gegevens), anders een tijdelijke maken. De INSERT
 * zelf is ON CONFLICT DO NOTHING en leest daarna opnieuw: ook een gelijktijdig aangemaakte eigenaar wordt geleend, niet verdubbeld.
 * Одна власниця на базу (records_een_eigenaar): позичаємо наявну (прибираємо лише своє), інакше створюємо тимчасову з перевіркою.
 */
const eigenaarVoorTest = async (prefix: string): Promise<{ id: string; geleend: boolean }> => {
  const sys = getPool('systeem');
  const zoek = async () => (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY created_at ASC LIMIT 1")).rows[0]?.id as string | undefined;
  const bestaand = await zoek();
  if (bestaand) return { id: bestaand, geleend: true };
  const id = `sec002-g10e-${prefix}-${randomUUID()}`;
  const r = await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2) ON CONFLICT DO NOTHING", [id, { email: `${id}@test.invalid`, role: 'owner', status: 'approved', entitlements: ['api-platform'] }]);
  if (r.rowCount === 1) return { id, geleend: false };
  const nu = await zoek();
  if (!nu) throw new Error('eigenaar: INSERT geweigerd en toch geen bestaande eigenaar');
  return { id: nu, geleend: true };
};
/** Volledige OAuth-stroom van het oude /mcp: registratie → authorize → «Дозволити» → code inwisselen. */
async function koppel(userId: string): Promise<{ clientId: string; access: string; refresh: string; grantId: string }> {
  const reg = body(await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' })));
  const p = pkce();
  const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: c.RESOURCE });
  const rid = new URL(kop(a, 'location'), 'https://x.invalid').searchParams.get('consent') || '';
  const d = await c.consentDecide(userId, rid, true);
  const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
  const t = body(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: CALLBACK })));
  const grantId = (await getPool('systeem').query('SELECT id FROM app.mcp_oauth_tokens WHERE user_id = $1 AND client_id = $2', [userId, reg.client_id])).rows[0]?.id as string;
  return { clientId: reg.client_id, access: t.access_token, refresh: t.refresh_token, grantId };
}

// ---------------------------------------------------------------------------------------------------- ai-mcp-10
async function aiMcp10(check: Check) {
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ai-mcp-10: geen database'); return; }
  const sys = getPool('systeem');
  const st = await import('../../backend/mcp-connector-opslag');
  const oudMax = st.LIMITS.maxClients, oudDag = (st.LIMITS as Record<string, number>).maxRegistratiesPerIpPerDag;
  const gemaakt: string[] = [];
  const registreer = async (ip = '') => {
    const r = await (c.registerClient as (b: string, ip?: string) => Promise<{ statusCode: number; body: string; headers: Record<string, string> }>)(JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' }), ip);
    if (r.statusCode === 201) gemaakt.push(body(r).client_id);
    return r;
  };
  try {
    // Aanvaller vult het plafond met registraties zonder vervolg (hier: een klein plafond, zelfde logica als 500).
    const n0 = await st.countClients();
    (st.LIMITS as { maxClients: number }).maxClients = n0 + 4;
    for (let i = 0; i < 4; i++) await registreer();
    // Eén «echte» klant heeft net een autorisatie lopen: die mag nooit verdrongen worden.
    const echt = gemaakt[0];
    const p = pkce();
    const au = await c.authorize({ response_type: 'code', client_id: echt, redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: c.RESOURCE });
    const lopend = (await sys.query("SELECT count(*)::int AS n FROM app.mcp_oauth_auth WHERE client_id = $1 AND status = 'pending'", [echt])).rows[0].n;
    check('ai-mcp-10: uitgangspunt — de echte klant heeft een lopend autorisatieverzoek', lopend === 1, `${au.statusCode} ${kop(au, 'location').slice(0, 80)} n=${lopend}`);
    // De registraties van de aanvaller zijn 10 minuten oud (binnen een dag: vroeger ruimde niets ze op).
    await sys.query(`UPDATE app.mcp_oauth_clients SET created_at = now() - interval '10 minutes' WHERE client_id = ANY($1)`, [gemaakt]);
    const nieuw = await registreer();
    check('ai-mcp-10: vol plafond met registraties zonder vervolg → een nieuwe klant kan TOCH registreren (geen 503 voor iedereen)', nieuw.statusCode === 201, `${nieuw.statusCode} ${nieuw.body.slice(0, 80)}`);
    const echtBestaat = (await sys.query('SELECT 1 FROM app.mcp_oauth_clients WHERE client_id = $1', [echt])).rows.length === 1;
    check('ai-mcp-10: een klant met een lopend autorisatieverzoek wordt niet verdrongen', echtBestaat);
    // Een verse vloed (registraties van < 2 minuten) blijft wél begrensd door het plafond: dat is de bedoeling.
    // (eigen testdatabank: alle registraties «vers» maken, alsof de vloed van de laatste twee minuten is)
    await sys.query('UPDATE app.mcp_oauth_clients SET created_at = now()');
    (st.LIMITS as { maxClients: number }).maxClients = await st.countClients();
    const vloed = await registreer();
    check('ai-mcp-10: een verse vloed binnen 2 minuten blijft door het plafond begrensd (503)', vloed.statusCode === 503, String(vloed.statusCode));
    (st.LIMITS as { maxClients: number }).maxClients = oudMax;

    // Registratie zonder autorisatie binnen een uur → gewoon opruimen (niet pas na een dag).
    const los = await registreer();
    const losId = body(los).client_id as string;
    await sys.query(`UPDATE app.mcp_oauth_clients SET created_at = now() - interval '2 hours' WHERE client_id = $1`, [losId]);
    await sys.query(`UPDATE app.mcp_oauth_clients SET created_at = now() - interval '2 hours' WHERE client_id = $1`, [echt]);
    await st.purgeStale();
    const losWeg = (await sys.query('SELECT 1 FROM app.mcp_oauth_clients WHERE client_id = $1', [losId])).rows.length === 0;
    const echtNog = (await sys.query('SELECT 1 FROM app.mcp_oauth_clients WHERE client_id = $1', [echt])).rows.length === 1;
    check('ai-mcp-10: registratie die binnen een uur geen autorisatie begon, verdwijnt bij het opruimen; met autorisatie blijft ze', losWeg && echtNog, `losWeg=${losWeg} echtNog=${echtNog}`);

    // Plafond per IP per etmaal (boven op 20/min).
    (st.LIMITS as Record<string, number>).maxRegistratiesPerIpPerDag = 2;
    const ip = `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;
    const ip2 = ip.replace(/::1$/, '::2'); // zelfde /64
    const r1 = await registreer(ip), r2 = await registreer(ip2), r3 = await registreer(ip);
    check('ai-mcp-10: plafond per IP-net (/64) per etmaal → 429', r1.statusCode === 201 && r2.statusCode === 201 && r3.statusCode === 429, `${r1.statusCode},${r2.statusCode},${r3.statusCode}`);
  } finally {
    (st.LIMITS as { maxClients: number }).maxClients = oudMax;
    (st.LIMITS as Record<string, number>).maxRegistratiesPerIpPerDag = oudDag;
    if (gemaakt.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [gemaakt]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------- ai-mcp-11
async function aiMcp11(check: Check) {
  // De deur (los bestand zonder export): de vernieuwtermijn telt vanaf grant.createdAt en het toegangstoken leeft nooit langer.
  const deur = (await import('node:fs')).readFileSync('deploy/mcp/server.mjs', 'utf8');
  const issue = /function issuePair[\s\S]*?\n}\n/.exec(deur)?.[0] ?? '';
  check('ai-mcp-11: deur — issuePair begrenst refresh op createdAt + termijn (absoluut, niet glijdend)',
    /Math\.min\(now \+ d\.refresh, begin \+ d\.refresh\)/.test(issue) && /createdAt/.test(issue) && /Math\.min\(now \+ d\.access, refreshExp\)/.test(issue), issue.slice(0, 120));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ai-mcp-11 (DB): geen database'); return; }
  const sys = getPool('systeem');
  const U = await testGebruiker('venster');
  let clientId = '';
  try {
    const k = await koppel(U);
    clientId = k.clientId;
    // 13 dagen na de toestemming (termijn «1 година, поновлюється до 14 днів»): vernieuwen mag nog, maar schuift het einde NIET op.
    await sys.query(`UPDATE app.mcp_oauth_tokens SET venster_vanaf = now() - interval '13 days', refresh_expires_at = now() + interval '1 day' WHERE id = $1`, [k.grantId]);
    const r1 = await c.token(form({ grant_type: 'refresh_token', refresh_token: k.refresh, client_id: clientId }));
    const rij = (await sys.query(`SELECT extract(epoch FROM refresh_expires_at - now())::float AS rest, extract(epoch FROM access_expires_at - now())::float AS toegang FROM app.mcp_oauth_tokens WHERE id = $1`, [k.grantId])).rows[0];
    check('ai-mcp-11: vernieuwen op dag 13 verlengt NIET tot dag 27 (einde blijft toestemming + 14 dagen)', r1.statusCode === 200 && rij.rest < 86400 + 60, `status=${r1.statusCode} rest=${Math.round(rij.rest)}s`);
    check('ai-mcp-11: het toegangstoken leeft niet langer dan het vernieuwvenster', rij.toegang <= rij.rest + 1, `toegang=${Math.round(rij.toegang)} rest=${Math.round(rij.rest)}`);
    // 15 dagen na de toestemming: ook al zou een glijdende termijn nog lopen, vernieuwen kan niet meer → nieuwe toestemming.
    const nieuwRefresh = body(r1).refresh_token as string;
    await sys.query(`UPDATE app.mcp_oauth_tokens SET venster_vanaf = now() - interval '15 days', refresh_expires_at = now() + interval '10 days' WHERE id = $1`, [k.grantId]);
    const r2 = await c.token(form({ grant_type: 'refresh_token', refresh_token: nieuwRefresh, client_id: clientId }));
    check('ai-mcp-11: na toestemming + 14 dagen geeft vernieuwen invalid_grant (geen eeuwige toegang door regelmatig vernieuwen)', r2.statusCode === 400 && /invalid_grant/.test(r2.body), `${r2.statusCode} ${r2.body.slice(0, 80)}`);
  } finally {
    await opruimenGebruiker(U);
    if (clientId) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [clientId]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------- ai-mcp-14
async function aiMcp14(check: Check) {
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ai-mcp-14: geen database'); return; }
  const sys = getPool('systeem');
  const U = await testGebruiker('binding');
  let clientId = '';
  try {
    const reg = body(await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' })));
    clientId = reg.client_id;
    const p = pkce();
    const a = await c.authorize({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: c.RESOURCE });
    const rid = new URL(kop(a, 'location'), 'https://x.invalid').searchParams.get('consent') || '';
    const zet = kop(a, 'set-cookie');
    check('ai-mcp-14: /oauth2/authorize zet een bindingscookie (__Host-, HttpOnly, Secure, SameSite=Lax, 10 min)',
      /^__Host-mr_mcpb_[0-9a-f]{16}=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/.test(zet), zet.replace(/=[A-Za-z0-9_-]{43};/, '=…;'));
    const rij = (await sys.query('SELECT binding_hash FROM app.mcp_oauth_auth WHERE id = $1', [rid])).rows[0];
    check('ai-mcp-14: in de database staat alleen de SHA-256 van het cookie', /^[0-9a-f]{64}$/.test(String(rij?.binding_hash)) && !zet.includes(String(rij?.binding_hash)));
    const cookie = zet.split(';')[0];
    const { createMcpConnectorRoutes } = await import('../../backend/mcp-connector-routes');
    const routes = createMcpConnectorRoutes({
      requireSession: async () => ({ user: { id: U, email: `${U}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }, service: 'mcp' }) as never,
      respond: (data: unknown, status = 200) => ({ status, data }), fail: (m: string, status = 400) => ({ status, data: { error: m } }),
      audit: async () => undefined, body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}), stepUp: async () => null,
    }) as Record<string, Array<(ctx: unknown) => Promise<{ status: number; data: Record<string, unknown> }>>>;
    const roep = (route: string, b: Record<string, unknown>, ck = '') => routes[route][0]({ event: { headers: ck ? { cookie: ck } : {} }, body: b, params: {} });
    const vreemdInfo = await roep('POST /api/owner/mcp-connector/consent/info', { rid });
    check('ai-mcp-14: consent/info vanuit een ANDERE browser (zonder cookie) → CONSENT_ANDERE_BROWSER', vreemdInfo.status === 409 && vreemdInfo.data.error === 'CONSENT_ANDERE_BROWSER', JSON.stringify(vreemdInfo));
    const vreemd = await roep('POST /api/owner/mcp-connector/consent', { rid, approve: true }, 'x=1; __Host-mr_mcpb_0000000000000000=' + 'A'.repeat(43));
    check('ai-mcp-14: «Дозволити» vanuit een andere browser (vals cookie) → geweigerd, verzoek blijft open', vreemd.status === 409 && !!(await c.consentInfo(rid)), JSON.stringify(vreemd));
    const eigenInfo = await roep('POST /api/owner/mcp-connector/consent/info', { rid }, `andere=1; ${cookie}`);
    check('ai-mcp-14: dezelfde browser ziet het venster, met het volledige terugkeeradres', eigenInfo.status === 200 && eigenInfo.data.redirectAdres === CALLBACK, JSON.stringify(eigenInfo.data).slice(0, 120));
    const eigen = await roep('POST /api/owner/mcp-connector/consent', { rid, approve: false }, cookie);
    check('ai-mcp-14: dezelfde browser kan beslissen (hier: weigeren → access_denied)', eigen.status === 200 && /error=access_denied/.test(String(eigen.data.redirect)), JSON.stringify(eigen.data).slice(0, 120));
  } finally {
    await opruimenGebruiker(U);
    if (clientId) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [clientId]).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------- g10e-toets-3 (deur, ai-mcp-11)
async function deurVenster(check: Check) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { spawn } = await import('node:child_process');
  const d = fs.mkdtempSync(`${process.env.TMPDIR || os.tmpdir()}/g10e-deur-`);
  fs.mkdirSync(`${d}/site`); fs.mkdirSync(`${d}/state`);
  fs.writeFileSync(`${d}/rechten.json`, JSON.stringify({ read: true, uitrol: false }));
  fs.writeFileSync(`${d}/mcp.token`, randomBytes(24).toString('hex'));
  const nu = Date.now(), dag = 86_400_000;
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');
  const rOud = randomBytes(32).toString('base64url'), rVoorbij = randomBytes(32).toString('base64url');
  // Toestand zoals hij NU op een server staat: grant A (aangemaakt 100 dagen geleden, nog zonder venster) met een geldig glijdend
  // refresh-token; grant B met een venster dat al 15 dagen loopt (termijn 1u = 14 dagen) en toch nog een «geldig» refresh-token.
  fs.writeFileSync(`${d}/state/state.json`, JSON.stringify({
    clients: { cl: { redirects: ['https://claude.ai/api/mcp/auth_callback'], createdAt: nu - 100 * dag, name: 'Claude' } },
    access: {},
    refresh: { [sha(rOud)]: { exp: nu + 10 * dag, clientId: 'cl', fam: 'famA', iat: nu - dag }, [sha(rVoorbij)]: { exp: nu + 10 * dag, clientId: 'cl', fam: 'famB', iat: nu - dag } },
    families: {},
    grants: { famA: { clientId: 'cl', clientName: 'Claude', door: '', duur: '1u', createdAt: nu - 100 * dag, lastUsedAt: 0 }, famB: { clientId: 'cl', clientName: 'Claude', door: '', duur: '1u', createdAt: nu - 100 * dag, vensterVanaf: nu - 15 * dag, lastUsedAt: 0 } },
  }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(port), MCP_ROOT: `${d}/site`, MCP_TOKEN_FILE: `${d}/mcp.token`, MCP_RECHTEN_FILE: `${d}/rechten.json`, MCP_INTREKKEN_FILE: `${d}/intrekken`,
      MCP_STATE_FILE: `${d}/state/state.json`, MCP_UITROL_INBOX: `${d}/inbox`, MCP_UITROL_STATUS: `${d}/status.json`, MCP_RELEASES_DIR: d, MCP_HEALTH_URL: 'http://127.0.0.1:1/x',
      MCP_ISSUER: 'https://mcp.example.test', MCP_APP_URL: 'http://127.0.0.1:1', MCP_AGENTPADEN: 'deur', MCP_INTERN_SLEUTEL: `${d}/state/intern.sleutel` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', (b) => { log += b; }); proc.stderr.on('data', (b) => { log += b; });
  try {
    for (let i = 0; i < 50 && !log.includes('mijn-ruimte-mcp'); i++) await slaap(100);
    const ververs = async (rt: string) => {
      const r = await fetch(`http://127.0.0.1:${port}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': `10.9.${Math.floor(Math.random() * 250)}.1` }, body: form({ grant_type: 'refresh_token', refresh_token: rt, client_id: 'cl' }) });
      return { status: r.status, j: await r.json().catch(() => null) as Record<string, unknown> | null };
    };
    const a = await ververs(rOud);
    check('g10e-toets-3: bestaande deurverbinding (van vóór het venster) krijgt bij de uitrol één volledig venster, geen dode tokens',
      a.status === 200 && Number(a.j?.expires_in) > 3000, `${a.status} expires_in=${a.j?.expires_in}`);
    const b = await ververs(rVoorbij);
    check('g10e-toets-3: venster voorbij → 400 invalid_grant (geen 200 met verlopen tokens)', b.status === 400 && b.j?.error === 'invalid_grant', `${b.status} ${JSON.stringify(b.j).slice(0, 80)}`);
  } finally {
    proc.kill();
  }
}

// ---------------------------------------------------------------------------------------------------- g10e-toets-5 (deur, ai-mcp-14)
async function deurBinding(check: Check) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { spawn } = await import('node:child_process');
  const d = fs.mkdtempSync(`${process.env.TMPDIR || os.tmpdir()}/g10e-deurb-`);
  fs.mkdirSync(`${d}/site`); fs.mkdirSync(`${d}/state`);
  fs.writeFileSync(`${d}/rechten.json`, JSON.stringify({ read: true, uitrol: false }));
  fs.writeFileSync(`${d}/mcp.token`, randomBytes(24).toString('hex'));
  fs.writeFileSync(`${d}/state/state.json`, JSON.stringify({ clients: { cl: { redirects: [CALLBACK], createdAt: Date.now(), name: 'Claude' } }, access: {}, refresh: {}, families: {}, grants: {} }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(port), MCP_ROOT: `${d}/site`, MCP_TOKEN_FILE: `${d}/mcp.token`, MCP_RECHTEN_FILE: `${d}/rechten.json`, MCP_INTREKKEN_FILE: `${d}/intrekken`,
      MCP_STATE_FILE: `${d}/state/state.json`, MCP_UITROL_INBOX: `${d}/inbox`, MCP_UITROL_STATUS: `${d}/status.json`, MCP_RELEASES_DIR: d, MCP_HEALTH_URL: 'http://127.0.0.1:1/x',
      MCP_ISSUER: 'https://mcp.example.test', MCP_APP_URL: 'http://127.0.0.1:1', MCP_AGENTPADEN: 'deur', MCP_INTERN_SLEUTEL: `${d}/state/intern.sleutel` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', (b) => { log += b; }); proc.stderr.on('data', (b) => { log += b; });
  const oud = { s: process.env.MCP_INTERN_SLEUTEL, u: process.env.MCP_DEUR_URL };
  process.env.MCP_INTERN_SLEUTEL = `${d}/state/intern.sleutel`;
  process.env.MCP_DEUR_URL = `http://127.0.0.1:${port}`;
  // De rol komt hier uit de nagebootste sessie; het record is er alleen voor de melding. Bestaande eigenaar lenen (zie eigenaarVoorTest).
  const eig = await eigenaarVoorTest('deurb');
  const E = eig.id;
  try {
    for (let i = 0; i < 50 && !log.includes('mijn-ruimte-mcp'); i++) await slaap(100);
    const p = pkce();
    const q = new URLSearchParams({ response_type: 'code', client_id: 'cl', redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's' });
    const a = await fetch(`http://127.0.0.1:${port}/oauth/authorize?${q}`, { redirect: 'manual' });
    const rid = new URL(a.headers.get('location') || 'https://x.invalid/', 'https://x.invalid').searchParams.get('consent') || '';
    const zet = a.headers.get('set-cookie') || '';
    check('g10e-toets-5: /oauth/authorize van de deur zet een bindingscookie (__Host-, HttpOnly, Secure, SameSite=Lax)',
      /^mrd_/.test(rid) && /^__Host-mr_mcpb_[0-9a-f]{16}=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/.test(zet), `${a.status} ${rid.slice(0, 8)} ${zet.replace(/=[A-Za-z0-9_-]{43};/, '=…;')}`);
    const cookie = zet.split(';')[0];
    const { createMcpConnectorRoutes } = await import('../../backend/mcp-connector-routes');
    const routes = createMcpConnectorRoutes({
      requireSession: async () => ({ user: { id: E, email: `${E}@test.invalid`, role: 'owner', status: 'approved', entitlements: ['api-platform'] }, service: 'mcp' }) as never,
      respond: (data: unknown, status = 200) => ({ status, data }), fail: (m: string, status = 400) => ({ status, data: { error: m } }),
      audit: async () => undefined, body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}), stepUp: async () => null,
    }) as Record<string, Array<(ctx: unknown) => Promise<{ status: number; data: Record<string, unknown> }>>>;
    const roep = (route: string, b: Record<string, unknown>, ck = '') => routes[route][0]({ event: { headers: ck ? { cookie: ck } : {} }, body: b, params: {} });
    const vreemd = await roep('POST /api/owner/mcp-connector/consent/info', { rid });
    check('g10e-toets-5: deurverzoek (mrd_) vanuit een ANDERE browser → 409 CONSENT_ANDERE_BROWSER', vreemd.status === 409 && vreemd.data.error === 'CONSENT_ANDERE_BROWSER', JSON.stringify(vreemd).slice(0, 120));
    const vreemdBesluit = await roep('POST /api/owner/mcp-connector/consent', { rid, approve: false });
    check('g10e-toets-5: ook «Дозволити/Відхилити» voor de deur zonder cookie → 409', vreemdBesluit.status === 409, JSON.stringify(vreemdBesluit).slice(0, 120));
    const eigen = await roep('POST /api/owner/mcp-connector/consent/info', { rid }, `x=1; ${cookie}`);
    check('g10e-toets-5: dezelfde browser ziet het deurvenster', eigen.status === 200 && eigen.data.soort === 'deur', JSON.stringify(eigen).slice(0, 120));
  } finally {
    proc.kill();
    if (oud.s === undefined) delete process.env.MCP_INTERN_SLEUTEL; else process.env.MCP_INTERN_SLEUTEL = oud.s;
    if (oud.u === undefined) delete process.env.MCP_DEUR_URL; else process.env.MCP_DEUR_URL = oud.u;
    if (!eig.geleend) await opruimenGebruiker(E); // een geleende eigenaar blijft onaangeroerd (deze toets maakt voor hem niets aan)
  }
}

// ---------------------------------------------------------------------------------------------------- g10e-toets-7 (hmara-upload onder de grenzen)
// Echte OverdrachtBeheer (src/cloud-vnext/overdracht-beheer.ts) + echte leesBodyBegrensd op een lokale http-server; uplink ~10 Mbit/s,
// tijd ×10 versneld (naar het voorbeeld van de controleur, toets-g10e/hmara-upload.ts). Een map van 20 bestanden van 12 MB moet
// helemaal «klaar» komen, zonder dat de grenzen van de server (96 MB per IP, 256 MB samen) losser worden.
async function hmaraMap(check: Check) {
  const bb = await import('../../server/platform/body-budget');
  const { aanmeldingEcht } = await import('../../server/platform/body-aanmelding');
  const { OverdrachtBeheer } = await import('../../src/cloud-vnext/overdracht-beheer');
  bb.zetAanmeldControle(async () => true); // de klant is aangemeld (de echte sessiecontrole is elders getest)
  const SCHAAL = 10, UPLINK = 1.25 * 1024 * 1024 * SCHAAL, STUK = 4 * 1024 * 1024, N = 20, GROOTTE = 12 * 1024 * 1024;
  let stromen = 0;
  const sessies = new Map<string, { bytes: number; stukken: Set<number> }>();
  let teller = 0;
  const stat = { s429: 0, s503: 0, ok: 0 };
  const server = http.createServer(async (req, res) => {
    let tekst = '';
    try { tekst = await bb.leesBodyBegrensd(req, '/api/owner/cloud/vnext/upload', '203.0.113.77'); }
    catch (e) {
      const f = e as { status?: number; code?: string; retryAfter?: number }; if (f.status === 429) stat.s429++; else if (f.status === 503) stat.s503++;
      req.resume(); res.writeHead(f.status || 400, { Connection: 'close', ...(f.retryAfter ? { 'Retry-After': String(f.retryAfter) } : {}) }); res.end(JSON.stringify({ error: f.code })); return;
    }
    stat.ok++;
    const d = JSON.parse(tekst);
    const antw = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (d.actie === 'begin') { const id = `s${++teller}`; sessies.set(id, { bytes: d.bytes, stukken: new Set() }); return antw({ id, stukMax: STUK, ontvangen: 0 }); }
    const s = sessies.get(d.id)!;
    if (d.actie === 'stuk') { s.stukken.add(d.offset / STUK); return antw({ ontvangen: s.stukken.size * STUK }); }
    if (d.actie === 'status') { const n = Math.ceil(s.bytes / STUK); return antw({ id: d.id, naam: 'x', bytes: s.bytes, stukMax: STUK, ontvangen: Math.min(s.bytes, s.stukken.size * STUK), ontbreekt: [...Array(n).keys()].filter((i) => !s.stukken.has(i)) }); }
    return antw({ id: d.id, naam: 'x' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const poort = (server.address() as { port: number }).port;
  const post = (inhoud: string) => new Promise<any>((ok, nee) => {
    const buf = Buffer.from(inhoud);
    const req = http.request({ host: '127.0.0.1', port: poort, method: 'POST', path: '/api/owner/cloud/vnext/upload', headers: { Cookie: 'sessie=x', 'Content-Type': 'application/json', 'Content-Length': buf.length } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { if ((res.statusCode || 0) >= 400) nee(Object.assign(new Error(t), { status: res.statusCode, retryAfter: Number(res.headers['retry-after']) || 0 })); else ok(JSON.parse(t)); });
    });
    req.on('error', (e) => nee(Object.assign(e, { status: 0 })));
    stromen++;
    let o = 0;
    const stap = () => {
      if (req.destroyed) { stromen--; return; }
      if (o >= buf.length) { stromen--; req.end(); return; }
      const per = Math.max(16 * 1024, Math.floor(UPLINK / Math.max(1, stromen) / 20));
      const deel = buf.subarray(o, o + per); o += deel.length;
      req.write(deel); setTimeout(stap, 50);
    };
    stap();
  });
  const vervoer = {
    begin: (naam: string, mime: string, bytes: number, mapId: string | null) => post(JSON.stringify({ actie: 'begin', naam, mime, bytes, mapId })),
    stuk: (id: string, offset: number, data: string) => post(JSON.stringify({ actie: 'stuk', id, offset, data })),
    status: (id: string) => post(JSON.stringify({ actie: 'status', id })),
    zoek: async () => ({ sessie: null }),
    klaar: (id: string, sha256: string) => post(JSON.stringify({ actie: 'klaar', id, sha256 })),
    afbreken: async () => ({}),
    downloadDeel: async () => { throw new Error('n.v.t.'); },
  };
  const beheer = new OverdrachtBeheer({ vervoer: vervoer as never, wacht: (ms: number) => slaap(ms / SCHAAL), bewaar: () => undefined, leesBewaard: () => '', venster: null });
  try {
    for (let i = 0; i < N; i++) beheer.voegUploadToe({ naam: `foto-${i}.jpg`, bytes: GROOTTE, mime: 'image/jpeg', lees: async (o: number, l: number) => new Uint8Array(Math.min(l, GROOTTE - o)).fill(i).buffer } as never, null);
    const begin = Date.now();
    let wn = 0;
    for (;;) {
      await slaap(500);
      const st = beheer.stand();
      wn = Math.max(wn, st.filter((r) => r.staat === 'wacht-netwerk').length);
      if (st.every((r) => r.staat === 'klaar' || r.staat === 'fout')) break;
      if (Date.now() - begin > 150_000) break;
    }
    const samen: Record<string, number> = {};
    for (const r of beheer.stand()) samen[r.staat] = (samen[r.staat] || 0) + 1;
    check('g10e-toets-7: map van 20 × 12 MB via de echte OverdrachtBeheer komt helemaal klaar onder de grenzen (96 MB/IP, 256 MB)', samen.klaar === N && wn === 0, `${JSON.stringify(samen)} server=${JSON.stringify(stat)} max wacht-netwerk=${wn}`);
  } finally {
    for (const r of beheer.stand()) if (r.staat !== 'klaar') beheer.stop(r.sleutel);
    bb.zetAanmeldControle(aanmeldingEcht);
    server.closeAllConnections?.(); server.close();
  }
}

// ---------------------------------------------------------------------------------------------------- ai-mcp-07
async function aiMcp07(check: Check) {
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN ai-mcp-07: geen database'); return; }
  const sys = getPool('systeem');
  const fs = await import('node:fs');
  const map = fs.mkdtempSync(`${process.env.TMPDIR || '/tmp'}/g10e-deur-`);
  const sleutel = randomBytes(32).toString('base64url'); // verzonnen
  fs.writeFileSync(`${map}/intern.sleutel`, sleutel);
  const oud = process.env.MCP_INTERN_SLEUTEL;
  process.env.MCP_INTERN_SLEUTEL = `${map}/intern.sleutel`;
  // De deur kijkt naar de rol in de DB (agentToken → records.role = 'owner'): een echte eigenaar is nodig. Er mag er maar één zijn,
  // dus de bestaande lenen (zie eigenaarVoorTest); opgeruimd worden dan alleen de twee tokens van deze toets.
  const eig = await eigenaarVoorTest('deur');
  const E = eig.id;
  const tokenHashes: string[] = [];
  try {
    const { createMcpConnectorRoutes } = await import('../../backend/mcp-connector-routes');
    const { aiPoortNu } = await import('../../backend/ai-ruimte-poort');
    const journaal: Array<{ action: string; result: string }> = [];
    const routes = createMcpConnectorRoutes({
      requireSession: async () => ({ errorCode: 'X' }), respond: (data: unknown, status = 200) => ({ status, data }), fail: (m: string, status = 400) => ({ status, data: { error: m } }),
      audit: async (_u: string, action: string, result: string) => { journaal.push({ action, result }); }, body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}),
    }) as Record<string, Array<(ctx: unknown) => Promise<{ status: number; data: { ok?: boolean } }>>>;
    const check1 = (token: string) => routes['POST /api/mcp/deur/token-check'][0]({ event: { headers: { 'x-forwarded-for': '127.0.0.1', 'x-mijn-ruimte-intern': sleutel } }, body: { token } });
    const prive = `tvh_${randomBytes(24).toString('base64url')}`, tech = `tvh_${randomBytes(24).toString('base64url')}`;
    const { sha256 } = await import('../../backend/connectors-crypto');
    tokenHashes.push(sha256(prive), sha256(tech));
    await sys.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, ruimte) VALUES ($1, 'privé-bord', 'tvh_p', $2, 'prive'), ($1, 'technisch', 'tvh_t', $3, 'technisch')`, [E, ...tokenHashes]);
    const rp = await check1(prive);
    check('ai-mcp-07: privétoken tvh_ van de eigenaar → de deur (technisch) zegt NEE', rp.status === 200 && rp.data.ok === false, JSON.stringify(rp.data));
    check('ai-mcp-07: de weigering staat in het journaal', journaal.some((j) => j.action === 'owner.mcp.deur.token' && j.result === 'denied'), JSON.stringify(journaal));
    // Uitgangspunt expliciet: een geleende eigenaar mag geen levend technisch profiel hebben (anders zegt deze toets niets);
    // laat een eerdere test er toch een achter, dan faalt de toets met die reden in plaats van stil groen te zijn.
    const vooraf = (await aiPoortNu(E)).ruimte;
    const rt = await check1(tech);
    check('ai-mcp-07: technisch token zonder levend technisch profiel → ook NEE', vooraf !== 'technisch' && rt.status === 200 && rt.data.ok === false, `uitgangspunt=${vooraf} geleend=${eig.geleend} ${JSON.stringify(rt.data)}`);
    const zonder = await routes['POST /api/mcp/deur/token-check'][0]({ event: { headers: { 'x-forwarded-for': '127.0.0.1' } }, body: { token: prive } });
    check('ai-mcp-07: zonder sleutel van de deur → 404 (ongewijzigd)', zonder.status === 404);
    const deur = fs.readFileSync('deploy/mcp/server.mjs', 'utf8');
    check('ai-mcp-07: de deur bewaart een positief antwoord nog maar 15 s', /paneelCache\.set\(key, \{ ok, id, naam, exp: now \+ 15_000 \}\)/.test(deur));
  } finally {
    if (oud === undefined) delete process.env.MCP_INTERN_SLEUTEL; else process.env.MCP_INTERN_SLEUTEL = oud;
    // Geleend: alleen de eigen tokens weg (op hash), niets anders van de eigenaar. Zelf gemaakt: alles van de tijdelijke gebruiker.
    if (eig.geleend) { if (tokenHashes.length) await sys.query('DELETE FROM app.mcp_console_tokens WHERE user_id = $1 AND token_hash = ANY($2::text[])', [E, tokenHashes]).catch(() => undefined); }
    else await opruimenGebruiker(E);
  }
}

// ---------------------------------------------------------------------------------------------------- http-rand-06, keten-config-05, http-rand-07, extensie-08
type HttpAntw = { status: number; body: string; headers: Record<string, unknown> } | { fout: string };
/** Eén verzoek; `stuur` = hoeveel bytes van het lichaam echt gestuurd worden (rest blijft hangen), `wacht` = ms tot we opgeven. */
function rauwVerzoek(poort: number, o: { methode?: string; pad: string; host?: string; ip: string; lengte?: number; stuur?: number; headers?: Record<string, string>; wacht?: number }): { klaar: Promise<HttpAntw>; stop: () => void } {
  let req: http.ClientRequest | null = null;
  const klaar = new Promise<HttpAntw>((ok) => {
    const t = setTimeout(() => { ok({ fout: 'timeout' }); req?.destroy(); }, o.wacht ?? 3000);
    const headers: Record<string, string> = { host: o.host ?? 'hub.tarasevych.com', 'cf-connecting-ip': o.ip, ...(o.lengte !== undefined ? { 'content-length': String(o.lengte), 'content-type': 'application/json' } : {}), ...(o.headers ?? {}) };
    req = http.request({ host: '127.0.0.1', port: poort, method: o.methode ?? 'POST', path: o.pad, headers }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => { clearTimeout(t); ok({ status: res.statusCode || 0, body: data, headers: res.headers }); });
    });
    req.on('error', (e) => { clearTimeout(t); ok({ fout: String((e as NodeJS.ErrnoException).code || e.message) }); });
    req.on('close', () => { setTimeout(() => { clearTimeout(t); ok({ fout: 'gesloten' }); }, 50); });
    if (o.stuur) req.write(Buffer.alloc(o.stuur, 0x20));
    else req.flushHeaders();
    if (o.lengte === undefined || (o.stuur ?? 0) >= (o.lengte ?? 0)) req.end();
  });
  return { klaar, stop: () => req?.destroy() };
}
const statusVan = (a: HttpAntw) => ('status' in a ? a.status : a.fout);

async function httpRand(check: Check) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dist = fs.mkdtempSync(`${os.tmpdir()}/g10e-dist-`);
  fs.mkdirSync(`${dist}/assets`);
  fs.writeFileSync(`${dist}/index.html`, '<!doctype html><title>spa</title>');
  const vorig = { DIST_DIR: process.env.DIST_DIR, API: process.env.API_RATE_LIMIT_PER_MIN };
  process.env.DIST_DIR = dist;
  process.env.API_RATE_LIMIT_PER_MIN = '10'; // klein, zodat de SSE-proef niet 600 verzoeken nodig heeft (gelezen bij het laden van start.ts)
  const ipNet = `198.18.${Math.floor(Math.random() * 200)}.`;
  let n = 0;
  const ip = () => `${ipNet}${++n}`;
  const start = await import('../../server/start');
  const bb = await import('../../server/platform/body-budget');
  const { attachAgentGateway } = await import('../../backend/connectors-gateway');
  const server = start.createServer();
  attachAgentGateway(server, new Set(['hub.tarasevych.com']));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const poort = (server.address() as { port: number }).port;
  const openen: Array<() => void> = [];
  const wsOpen: WebSocket[] = [];
  // g10e-toets-2: een ECHT agenttoken (tvh_) — de ruimere grenzen gelden alleen na de controle dat het token bestaat.
  const H = await testGebruiker('body');
  const echtToken = `tvh_${randomBytes(24).toString('base64url')}`;
  const echtBearer = `Bearer ${echtToken}`;
  await getPool('systeem').query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, ruimte) VALUES ($1, 'g10e-body', 'tvh_b', $2, 'prive')`, [H, createHash('sha256').update(echtToken).digest('hex')]);
  try {
    // --- g10e-toets-2: een VALSE Cookie of een verzonnen Bearer geeft geen ruimere grenzen
    const valsCookie = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 300 * 1024, stuur: 300 * 1024, headers: { cookie: 'x=1; __Secure-tsv_ecosystem_mr=abc.' + 'A'.repeat(43), origin: 'https://hub.tarasevych.com' } }).klaar;
    check('g10e-toets-2: valse Cookie (geen bestaande sessie) → anonieme grens (300 KB → 413)', statusVan(valsCookie) === 413, String(statusVan(valsCookie)));
    const valsBearer = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 300 * 1024, stuur: 300 * 1024, headers: { authorization: `Bearer tvh_${'v'.repeat(40)}` } }).klaar;
    check('g10e-toets-2: verzonnen Bearer-token → anonieme grens (300 KB → 413)', statusVan(valsBearer) === 413, String(statusVan(valsBearer)));
    // Eén IP mag niet het hele gezamenlijke budget innemen (hier plafond per IP 1 MB; ondertekende webhook mag anoniem groot zijn).
    const oudPerIpBytes = (bb.BODY_GRENZEN as Record<string, number>).perIpBytes;
    (bb.BODY_GRENZEN as Record<string, number>).perIpBytes = 1024 * 1024;
    try {
      const veelIp = ip();
      const eerst = rauwVerzoek(poort, { pad: '/api/github/webhook/sec002', ip: veelIp, lengte: 800_000, stuur: 790_000, wacht: 20_000 });
      openen.push(eerst.stop);
      await slaap(300);
      const nog = await rauwVerzoek(poort, { pad: '/api/github/webhook/sec002', ip: veelIp, lengte: 800_000, stuur: 800_000 }).klaar;
      const ander = await rauwVerzoek(poort, { pad: '/api/github/webhook/sec002', ip: ip(), lengte: 800_000, stuur: 800_000 }).klaar;
      check('g10e-toets-2: plafond van gebufferde bytes per IP → 429 voor die IP, een andere IP gaat gewoon door',
        statusVan(nog) === 429 && statusVan(ander) !== 429 && statusVan(ander) !== 503 && typeof statusVan(ander) === 'number', `${statusVan(nog)} / ${statusVan(ander)}`);
    } finally { (bb.BODY_GRENZEN as Record<string, number>).perIpBytes = oudPerIpBytes; for (const s of openen.splice(0)) s(); }
    await slaap(150);

    // --- http-rand-06 / keten-config-05: lichamen vóór routering en aanmelding
    const a = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 11 * 1024 * 1024, wacht: 2000 }).klaar;
    check('http-rand-06: anoniem POST met Content-Length 11 MB → meteen 413, zonder het lichaam af te wachten', statusVan(a) === 413, String(statusVan(a)));
    const b = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 300 * 1024, stuur: 300 * 1024 }).klaar;
    check('http-rand-06: anoniem (geen Cookie/Authorization) lichaam van 300 KB → 413 (grens 256 KB)', statusVan(b) === 413, String(statusVan(b)));
    const c2 = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 300 * 1024, stuur: 300 * 1024, headers: { authorization: echtBearer } }).klaar;
    check('http-rand-06: met Authorization blijft de gewone grens (300 KB gaat door naar de router)', statusVan(c2) !== 413 && typeof statusVan(c2) === 'number', String(statusVan(c2)));
    // Lichamen per IP tegelijk.
    const zelfde = ip();
    for (let i = 0; i < 8; i++) { const v = rauwVerzoek(poort, { pad: '/api/sec002/traag', ip: zelfde, lengte: 1000, stuur: 10, wacht: 20_000 }); openen.push(v.stop); }
    await slaap(150);
    const negende = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: zelfde, lengte: 2, stuur: 2 }).klaar;
    check('keten-config-05: het 9e gelijktijdige ANONIEME lichaam van één IP → 429', statusVan(negende) === 429, String(statusVan(negende)));
    for (const s of openen.splice(0)) s();
    // g10e-toets-1: een aangemelde klant (hmara: elk bestand 3 stukken tegelijk, een map = vele bestanden) mag wél veel lichamen
    // tegelijk sturen; de algemene limiet staat in deze test op 10/min, dus 9 trage + 1.
    const klant = ip();
    for (let i = 0; i < 9; i++) { const v = rauwVerzoek(poort, { pad: '/api/sec002/traag', ip: klant, lengte: 1000, stuur: 10, headers: { authorization: echtBearer }, wacht: 20_000 }); openen.push(v.stop); }
    await slaap(150);
    const tiende = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: klant, lengte: 2, stuur: 2, headers: { authorization: echtBearer } }).klaar;
    check('g10e-toets-1: 10 gelijktijdige lichamen MET Authorization van één IP → geen 429 (upload van een map naar de hmara)', statusVan(tiende) !== 429 && typeof statusVan(tiende) === 'number', String(statusVan(tiende)));
    for (const s of openen.splice(0)) s();
    await slaap(150);
    // Eén budget voor alle lichamen samen.
    const oudBudget = bb.BODY_GRENZEN.budget;
    bb.BODY_GRENZEN.budget = 2 * 1024 * 1024;
    try {
      const groot = rauwVerzoek(poort, { pad: '/api/sec002/traag', ip: ip(), lengte: 1_600_000, stuur: 1_590_000, headers: { authorization: echtBearer }, wacht: 20_000 });
      openen.push(groot.stop);
      await slaap(300);
      const tweede = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 1_000_000, stuur: 1_000_000, headers: { authorization: echtBearer } }).klaar;
      check('http-rand-06: boven het gezamenlijke budget (hier 2 MB) → 503 met Retry-After', statusVan(tweede) === 503 && 'headers' in tweede && !!tweede.headers['retry-after'], String(statusVan(tweede)));
    } finally { bb.BODY_GRENZEN.budget = oudBudget; for (const s of openen.splice(0)) s(); }
    // g10e-toets-6: een klein lichaam (aanmelden, OAuth) wordt nooit door een vol budget geweigerd.
    {
      const oud = bb.BODY_GRENZEN.budget;
      bb.BODY_GRENZEN.budget = 1;
      try {
        const klein = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 2000, stuur: 2000 }).klaar;
        check('g10e-toets-6: klein lichaam (2 KB) gaat ook bij een vol budget door (geen 503)', statusVan(klein) !== 503 && typeof statusVan(klein) === 'number', String(statusVan(klein)));
      } finally { bb.BODY_GRENZEN.budget = oud; }
    }
    // Anoniem half lichaam: kort vastgehouden.
    const oudMs = bb.BODY_GRENZEN.anoniemMs;
    bb.BODY_GRENZEN.anoniemMs = 300;
    try {
      const half = await rauwVerzoek(poort, { pad: '/api/sec002/bestaat-niet', ip: ip(), lengte: 100, stuur: 10, wacht: 3000 }).klaar;
      check('http-rand-06: anoniem half lichaam wordt na de korte termijn afgebroken (niet 120 s vastgehouden)', statusVan(half) !== 'timeout', String(statusVan(half)));
    } finally { bb.BODY_GRENZEN.anoniemMs = oudMs; }
    await slaap(100);
    check('http-rand-06: na afloop is het budget weer leeg (geen lek)', bb.bodyStand().inGebruik === 0 && bb.bodyStand().lezers === 0, JSON.stringify(bb.bodyStand()));

    // --- keten-config-05: WebSocket /agent/ws vóór de aanmelding
    const wsIp = ip();
    const wsVerbind = () => new Promise<{ ws: WebSocket | null; status: number | string }>((ok) => {
      const ws = new WebSocket(`ws://127.0.0.1:${poort}/agent/ws`, { headers: { host: 'hub.tarasevych.com', 'cf-connecting-ip': wsIp } });
      ws.on('open', () => { wsOpen.push(ws); ok({ ws, status: 101 }); });
      ws.on('unexpected-response', (_q, res) => { ok({ ws: null, status: res.statusCode || 0 }); });
      ws.on('error', () => ok({ ws: null, status: 'fout' }));
    });
    const eerste = await wsVerbind();
    const sluitCode = await new Promise<number>((ok) => {
      if (!eerste.ws) { ok(-1); return; }
      eerste.ws.on('close', (code) => ok(code));
      eerste.ws.send('x'.repeat(200 * 1024));
      setTimeout(() => ok(-2), 3000);
    });
    check('keten-config-05: vóór de aanmelding sluit een bericht van 200 KB met 1009 (grens 64 KiB, niet 8 MiB)', sluitCode === 1009, String(sluitCode));
    await slaap(100);
    const verb: Array<number | string> = [];
    for (let i = 0; i < 11; i++) verb.push((await wsVerbind()).status);
    check('keten-config-05: hoogstens 10 onaangemelde WebSocket-verbindingen per IP, de 11e → 503', verb.slice(0, 10).every((s) => s === 101) && verb[10] === 503, verb.join(','));
    for (const w of wsOpen.splice(0)) w.terminate();

    // --- http-rand-07: paden vóór de /api-tak
    const gIp = ip();
    const gez: Array<number | string> = [];
    for (let i = 0; i < 121; i++) gez.push(statusVan(await rauwVerzoek(poort, { methode: 'GET', pad: '/__gezondheid', ip: gIp }).klaar));
    check('http-rand-07: /__gezondheid van buiten heeft een limiet per IP (121e → 429)', gez.slice(0, 120).every((s) => s === 200 || s === 503) && gez[120] === 429, `${gez[0]} … ${gez[120]}`);
    const lokaal = await new Promise<number>((ok) => { http.get({ host: '127.0.0.1', port: poort, path: '/__gezondheid' }, (res) => { res.resume(); ok(res.statusCode || 0); }).on('error', () => ok(0)); });
    check('http-rand-07: systemd/monitoring op loopback blijft onbeperkt', lokaal === 200 || lokaal === 503, String(lokaal));
    const sIp = ip();
    const sse: Array<number | string> = [];
    for (let i = 0; i < 11; i++) sse.push(statusVan(await rauwVerzoek(poort, { methode: 'GET', pad: '/mcp', host: 'mcp.tarasevych.com', ip: sIp, headers: { accept: 'text/event-stream', authorization: 'Bearer verzonnen-ongeldig' }, wacht: 2000 }).klaar));
    check('http-rand-07: SSE-ingang GET /mcp telt in de algemene emmer per IP (hier 10/min → 11e 429)', sse[10] === 429, sse.join(','));

    // --- extensie-08: HTTP-terugval van de extensie
    const ext = `chrome-extension://${'a'.repeat(32)}`;
    const pad = '/api/owner/agents/ontgrendeling/intrekken-extensie';
    check('extensie-08: intrekken-extensie met Origin chrome-extension:// en zonder Cookie gaat door de CSRF-controle', start.csrfAfwijzing('POST', { origin: ext }, pad) === '', start.csrfAfwijzing('POST', { origin: ext }, pad));
    check('extensie-08: met een Cookie blijft het geweigerd', start.csrfAfwijzing('POST', { origin: ext, cookie: 'x=1' }, pad) === 'CSRF_ORIGIN_DENIED');
    const bron = fs.readFileSync('extension/background.js', 'utf8');
    const bewaar = /async function bewaarIntrekking[^\n]*/.exec(bron)?.[0] ?? '';
    check('extensie-08: de extensie bewaart intrekkingen ook in chrome.storage.local en leest ze bij het laden terug',
      /chrome\.storage\.local\.set/.test(bewaar) && /chrome\.storage\.local\.get\(K\.intrek\(r\)\)/.test(bron), bewaar.slice(0, 120));
    check('extensie-08: openstaande intrekkingen worden elke 30 s (keepalive) opnieuw verstuurd', /alarm\.name === 'keepalive'\) \{\n\s*const poging = connect\(\);[\s\S]{0,300}wachtrijVersturen\(r\)/.test(bron));
  } finally {
    for (const s of openen) s();
    for (const w of wsOpen) w.terminate();
    const dicht = new Promise((r) => server.close(() => r(undefined)));
    server.closeAllConnections?.();
    await Promise.race([dicht, slaap(3000)]);
    if (vorig.DIST_DIR === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorig.DIST_DIR;
    if (vorig.API === undefined) delete process.env.API_RATE_LIMIT_PER_MIN; else process.env.API_RATE_LIMIT_PER_MIN = vorig.API;
    await opruimenGebruiker(H);
  }
}

// ---------------------------------------------------------------------------------------------------- keten-config-05 (pg)
async function ketenPg(check: Check) {
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN keten-config-05 (pg): geen database'); return; }
  const r = (await getPool('systeem').query('SHOW statement_timeout')).rows[0]?.statement_timeout;
  const s = (await getPool('systeem').query('SHOW idle_in_transaction_session_timeout')).rows[0]?.idle_in_transaction_session_timeout;
  check('keten-config-05: systeempool heeft statement_timeout (2min) en idle_in_transaction_session_timeout (1min)', r === '2min' && s === '1min', `${r} / ${s}`);
  const unit = (await import('node:fs')).readFileSync('deploy/mijn-ruimte.service', 'utf8');
  check('keten-config-05: de dienst heeft MemoryHigh/MemoryMax als laatste grens', /^MemoryHigh=\d+%$/m.test(unit) && /^MemoryMax=\d+%$/m.test(unit));
}

// ---------------------------------------------------------------------------------------------------- aanmelden-09, integraties-12, aanv-gat-a-03
async function telegramCode(check: Check) {
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN telegram: geen database'); return; }
  const sys = getPool('systeem');
  const oudPeper = process.env.TELEGRAM_AANMELD_PEPER;
  process.env.TELEGRAM_AANMELD_PEPER = randomBytes(32).toString('base64url'); // verzonnen
  const U = await testGebruiker('tg');
  const code = await import('../../backend/telegram-aanmelden/code');
  try {
    const gezet = await code.codeInstellen(U, 'Zq7wMp2Lx9', 'Hb4kTn8Rv3', '');
    check('telegram: code ingesteld (uitgangspunt)', gezet.ok === true, JSON.stringify(gezet));
    // 20 gelijktijdige foute pogingen: hoogstens `pauzeNa` (3) mogen echt gecontroleerd worden.
    const uit = await Promise.all(Array.from({ length: 20 }, (_, i) => code.codeControleren(U, `fout-${i}-Kw8q`)));
    const stand = (await sys.query('SELECT mislukt, pauze_tot FROM app.tg_geheime_codes WHERE user_id = $1', [U])).rows[0];
    const gecontroleerd = uit.filter((u) => u === 'fout').length + (uit.includes('pauze') ? 1 : 0);
    check('aanmelden-09/integraties-12: 20 gelijktijdige pogingen → hoogstens 3 tellen (de rest: pauze)', Number(stand.mislukt) === 3 && uit.filter((u) => u === 'fout').length <= 2 && !!stand.pauze_tot, `mislukt=${stand.mislukt} uitkomsten=${uit.join(',')}`);
    void gecontroleerd;
    // Pauze voorbij: weer twee pogingen, de 5e zet de code uit; gelijktijdig mogen er niet meer doorheen.
    await sys.query('UPDATE app.tg_geheime_codes SET pauze_tot = now() - interval \'1 second\' WHERE user_id = $1', [U]);
    const uit2 = await Promise.all(Array.from({ length: 10 }, (_, i) => code.codeControleren(U, `fout2-${i}-Kw8q`)));
    const stand2 = (await sys.query('SELECT mislukt, uitgeschakeld FROM app.tg_geheime_codes WHERE user_id = $1', [U])).rows[0];
    check('aanmelden-09: na de pauze hoogstens tot `uitNa` (5) en dan uit, ook bij 10 gelijktijdige pogingen', Number(stand2.mislukt) === 5 && stand2.uitgeschakeld === true && uit2.every((u) => u === 'fout' || u === 'uit'), `mislukt=${stand2.mislukt} uit=${stand2.uitgeschakeld} ${uit2.join(',')}`);
    // Juiste code na herstel: telt, zet teller terug.
    await code.codeHerstellen(U);
    const goed = await code.codeControleren(U, 'Zq7wMp2Lx9');
    const stand3 = (await sys.query('SELECT mislukt, pauze_tot FROM app.tg_geheime_codes WHERE user_id = $1', [U])).rows[0];
    check('telegram: de juiste code werkt nog en zet de teller op 0', goed === 'ok' && Number(stand3.mislukt) === 0 && !stand3.pauze_tot, `${goed} ${stand3.mislukt}`);

    // aanv-gat-a-03: de hoofdthread blijft vrij tijdens de chatcontrole (asynchroon hashen).
    let maxGat = 0, vorige = Date.now();
    const tik = setInterval(() => { const nu = Date.now(); maxGat = Math.max(maxGat, nu - vorige - 10); vorige = nu; }, 10);
    const t0 = Date.now();
    await code.lijktOpCodeVan([U], 'aaaaaaa bbbbbbb ccccccc ddddddd eeeeeee', `tg:${randomUUID()}`);
    const duur = Date.now() - t0;
    await slaap(30); // de klok moet na het werk nog tikken, anders wordt een blokkade aan het eind niet gemeten
    clearInterval(tik);
    check('aanv-gat-a-03: chatbericht van 5 woorden houdt de hoofdthread niet vast (grootste gat < 60 ms)', maxGat < 60, `gat=${maxGat}ms duur=${duur}ms`);
    // Code al uit (in de chat gezien): geen hash meer.
    await sys.query("UPDATE app.tg_geheime_codes SET uitgeschakeld = true, reden = 'in-chat-gezien' WHERE user_id = $1", [U]);
    const t1 = Date.now();
    const gezien = await code.lijktOpCodeVan([U], 'Zq7wMp2Lx9', `tg:${randomUUID()}`);
    check('aanv-gat-a-03: voor een code die al uit staat wordt niet gehasht (snel, geen treffer)', gezien === null && Date.now() - t1 < 40, `${gezien} ${Date.now() - t1}ms`);
    await code.codeHerstellen(U);
    // g10e-toets-4: de code als 4e woord in een zin wordt herkend (vroeger: alleen het hele bericht en de eerste twee woorden).
    const inZin = await code.lijktOpCodeVan([U], 'Ось мій код Zq7wMp2Lx9', `tg:${randomUUID()}`);
    check('g10e-toets-4: code als 4e woord van een zin wordt herkend', inZin === U, String(inZin));
    // g10e-toets-4: na een paar gewone berichten is het budget niet op — de code wordt nog herkend.
    const gewoon = `tg:${randomUUID()}`;
    for (const z of ['Підтверджую оплату завтра', 'Добрий вечір, дякую', 'Перевірю документи сьогодні']) await code.lijktOpCodeVan([U], z, gewoon);
    const naGewoon = await code.lijktOpCodeVan([U], 'код: Zq7wMp2Lx9', gewoon);
    check('g10e-toets-4: na drie gewone berichten wordt de code nog herkend', naGewoon === U, String(naGewoon));
    // Budget per Telegram-gebruiker: na het budget geen hash meer (snel antwoord), maar een «codevormig» woord geeft een vermoeden
    // zodat de bot het bericht toch verwijdert (zonder hash).
    const bron = `tg:${randomUUID()}`;
    const tijden: number[] = [];
    for (let i = 0; i < 14; i++) { const t = Date.now(); await code.lijktOpCodeVan([U], `woordje${i} anderwoord`, bron); tijden.push(Date.now() - t); }
    check('aanv-gat-a-03: hashbudget per Telegram-gebruiker — na het budget geen hashes meer (snel antwoord)', tijden.slice(-2).every((t) => t < 30) && tijden[0] >= 30, tijden.join(','));
    const naBudget = await (code as unknown as { lijktOpCode: (u: string[], t: string, b: string) => Promise<{ userId: string | null; vermoeden: boolean }> }).lijktOpCode([U], 'Ось мій код Zq7wMp2Lx9', bron);
    check('g10e-toets-4: budget op → geen hash, maar wel «vermoeden» voor een codevormig woord (de bot verwijdert het bericht)', naBudget.userId === null && naBudget.vermoeden === true, JSON.stringify(naBudget));
    const gewoonNaBudget = await (code as unknown as { lijktOpCode: (u: string[], t: string, b: string) => Promise<{ userId: string | null; vermoeden: boolean }> }).lijktOpCode([U], 'Підтверджую оплату завтра', bron);
    check('g10e-toets-4: een gewoon bericht zonder codevormig woord wordt ook na het budget niet verwijderd', gewoonNaBudget.vermoeden === false, JSON.stringify(gewoonNaBudget));
    // Herkenning werkt nog: de code zelf als bericht.
    const treffer = await code.lijktOpCodeVan([U], 'Zq7wMp2Lx9', `tg:${randomUUID()}`);
    check('telegram: een code die in de chat staat wordt nog herkend', treffer === U, String(treffer));
  } finally {
    if (oudPeper === undefined) delete process.env.TELEGRAM_AANMELD_PEPER; else process.env.TELEGRAM_AANMELD_PEPER = oudPeper;
    await sys.query('DELETE FROM app.tg_geheime_codes WHERE user_id = $1', [U]).catch(() => undefined);
    await opruimenGebruiker(U);
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10e-20261112');
  const delen: Array<[string, (check: Check) => Promise<void>]> = [
    ['ai-mcp-01', aiMcp01],
    ['geheimen-01', geheimen01],
    ['ai-mcp-10', aiMcp10],
    ['ai-mcp-11', aiMcp11],
    ['ai-mcp-07', aiMcp07],
    ['ai-mcp-14', aiMcp14],
    ['deur', deurVenster],
    ['deurbinding', deurBinding],
    ['hmara', hmaraMap],
    ['http', httpRand],
    ['pg', ketenPg],
    ['telegram', telegramCode],
  ];
  const alleen = process.env.G10E_ALLEEN || '';
  try {
    for (const [naam, fn] of delen) {
      if (alleen && !alleen.split(',').includes(naam)) continue;
      try { await fn(check); } catch (e) { check(`${naam}: test liep zonder onverwachte fout`, false, String((e as Error)?.stack || e).slice(0, 400)); }
    }
  } finally {
    await closePool().catch(() => undefined);
  }
  return einde();
}
