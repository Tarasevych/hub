// Volledige verificatie van MCP-ACCESS-001 (01.11.2026):
//   1. Technisch profiel/sessie UIT (GEEN_TECH_SESSIE) → _beheer verborgen & geweigerd met exacte oorzaak, v2_whoami veilige diagnose;
//   2. Reproductie van het productie-incident («1 hulpmiddel uit 166»): ondertekende keten.json zonder cursor/gpt (BELEID_AGENT_ONBEKEND)
//      en met verlopen tijdvenster (BELEID_VERLOPEN) → effectiveVisibleToolsCount === 1 (alleen v2_whoami), geen valse 102/166-telling;
//   3. Technische sessie v2 AAN, maar AI-sessiedelegatie UIT → AI_NIET_TOEGESTAAN;
//   4. Per-verbinding (verbinding_id) isolatie in app.tech_ruimte_ai tussen /cursor en /gpt tegelijk + specifieke 'prive' overschrijft '*';
//   5. Dienst «ai» in ruimte-scheiding: DIENST_UIT, BEVROREN, KEUZE_ONTBREEKT en herstel naar eigen/gedeeld;
//   6. Technische sessie op PAUZE en hervatting (wisselen zonder stap-op);
//   7. Verlopen tijd-sessie (VERLOPEN);
//   8. Eigenaar uitgelogd van de site (SITE_SESSIE_WEG);
//   9. Live intrekking midden in een sessie + SSE notifications/tools/list_changed;
//  10. Direct toepassen van opgeslagen rechtenuitbreiding zonder OAuth-tokenintrekking (POST /api/owner/connector-v2/toepassen + step-up + SSE);
//  11. Gededupliceerde site_notifications (kind: 'ai_bevestiging', ruimte: 'prive', aiBlokSleutel) zonder spam bij herhaalde pogingen;
//  12. Echte headless Google Chrome E2E-verificatie op /agents en #agent/cursor (exacte Oekraïense diagnose, 1-klik vrijgave, géén dubbele Activeer-knop).
import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import * as bk from '../../deploy/goedkeuring/ai-beleid-kern.mjs';
import { vergeetCache } from '../../backend/ai-beleid';
import { _resetToegangMeldingGeheugen, diagnoseVoorAgent } from '../../backend/ai-toegang-diagnose';
import * as v2 from '../../backend/connector-v2';
import * as v2st from '../../backend/connector-v2-opslag';
import { koppelingBewaren, koppelingWissen, verzegel } from '../../backend/github-koppeling-opslag';
import * as c from '../../backend/mcp-connector';
import * as rs from '../../backend/ruimte-scheiding';
import { totpStapOpVastleggen } from '../../backend/stap-op';
import * as tp from '../../backend/tech-profiel';
import * as trk from '../../backend/tech-ruimtes-kern';
import { alsSysteem } from '../../server/platform/context';
import { getPool } from '../../server/platform/pg';
import type { Policy } from '../../shared/ai-beleid/model';
import { WEIGER_UITLEG } from '../../shared/ai-toegang-diagnose';
import { agentUrl, type AgentSlug } from '../../shared/connector-v2/agenten';
import { V2_OPTIES, v2Optie } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { pasModusToe, STANDAARD } from '../../shared/connector-v2/rechten';
import { checker, nepGoogle } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const parseJson = (s: string) => (s ? JSON.parse(s) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const kopVan = (r: { headers: Record<string, string> }, n: string) =>
  Object.entries(r.headers).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1] ?? '';

function zoekChrome(): string | null {
  const kandidaten = [
    process.env.CHROME || '',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const p of kandidaten) if (existsSync(p)) return p;
  return null;
}

function zoekOpenssl(): string | null {
  for (const p of ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'openssl']) {
    const r = spawnSync(p, ['version'], { encoding: 'utf8' });
    if (r.status === 0) return p;
  }
  return null;
}

class Cdp {
  private ws: WebSocket;
  private n = 0;
  private wacht = new Map<number, { res: (v: any) => void; rej: (e: Error) => void; method: string }>();
  public luisteraars: Array<(m: any) => void> = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (d) => this.ontvang(String(d)));
  }

  static async verbind(url: string): Promise<Cdp> {
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });
    return new Cdp(ws);
  }

  private ontvang(tekst: string) {
    let m: any;
    try { m = JSON.parse(tekst); } catch { return; }
    if (m.id && this.wacht.has(m.id)) {
      const w = this.wacht.get(m.id)!;
      this.wacht.delete(m.id);
      if (m.error) w.rej(new Error(`${w.method}: ${m.error.message}`));
      else w.res(m.result);
    } else if (m.method) {
      for (const l of [...this.luisteraars]) {
        try { l(m); } catch { /* negeer */ }
      }
    }
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.n;
    return new Promise((res, rej) => {
      this.wacht.set(id, { res, rej, method });
      const t = setTimeout(() => {
        if (this.wacht.has(id)) {
          this.wacht.delete(id);
          rej(new Error(`${method}: time-out na 25 s`));
        }
      }, 25_000);
      t.unref?.();
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(fn: (m: any) => void) { this.luisteraars.push(fn); }
  sluit() { try { this.ws.close(); } catch { /* al dicht */ } }
}

function httpsVerzoek(poort: number, host: string, methode: string, pad: string, body = '', headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((ok, fout) => {
    const r = https.request({
      host: '127.0.0.1',
      port: poort,
      path: pad,
      method: methode,
      servername: host,
      rejectUnauthorized: false,
      headers: {
        host,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let b = '';
      res.on('data', (x) => { b += x; });
      res.on('end', () => ok({ status: res.statusCode || 0, body: b }));
    });
    r.on('error', fout);
    r.end(body);
  });
}

function httpsSse(poort: number, pad: string, token: string): Promise<{ status: number; berichten: string[]; sluit: () => void }> {
  return new Promise((ok, fout) => {
    const berichten: string[] = [];
    const req = https.request({
      host: '127.0.0.1',
      port: poort,
      path: pad,
      method: 'GET',
      servername: 'mcp.tarasevych.com',
      rejectUnauthorized: false,
      headers: {
        host: 'mcp.tarasevych.com',
        accept: 'text/event-stream',
        authorization: `Bearer ${token}`,
      },
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { berichten.push(chunk); });
      ok({
        status: res.statusCode || 0,
        berichten,
        sluit: () => { try { req.destroy(); } catch { /* al dicht */ } },
      });
    });
    req.on('error', fout);
    req.end();
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-toegang-diagnose-20261101');

  // ------------------------------------------------------------------ 0. Pure contractcontrole
  check('elke weigercode heeft niet-lege uk én nl uitleg',
    Object.values(WEIGER_UITLEG).every((t) => t.uk.length > 12 && t.nl.length > 12 && t.uk !== t.nl));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN mcp-toegang-diagnose-20261101: geen database');
    return einde();
  }

  const werk = mkdtempSync(join(tmpdir(), 'mr-mcp-access-001-'));
  const beleidMap = join(werk, 'ai-beleid');
  mkdirSync(beleidMap, { recursive: true });

  const vorigeBeleidDir = process.env.AI_BELEID_DIR;
  const vorigeDist = process.env.DIST_DIR;
  const vorigeLimieten = process.env.E2E_LOKALE_LIMIETEN;
  const vorigeOrchWortel = process.env.ORCH_WORTEL;
  const vorigeOrchInbox = process.env.ORCH_INBOX;
  const distDir = resolve(process.env.DIST_DIR || 'dist');
  process.env.AI_BELEID_DIR = beleidMap;
  process.env.DIST_DIR = distDir;
  process.env.E2E_LOKALE_LIMIETEN = '1';
  process.env.ORCH_WORTEL = process.cwd();
  process.env.ORCH_INBOX = join(werk, 'orch-inbox');
  vergeetCache();
  _resetToegangMeldingGeheugen();

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  const schrijfKeten = (agents: Policy['agents']) => {
    const beleid: Policy = {
      v: 1,
      seq: 0,
      prevHash: null,
      issuedAt: Date.now() - 60_000,
      ownerKeys: [{ id: 'recovery-1', type: 'ed25519', publicKey: spki, label: 'Test sleutel', addedAt: Date.now() - 120_000 }],
      approvalSignature: 'risky',
      agents,
    };
    const sig = sign(null, bk.ed25519Bericht(beleid), privateKey).toString('base64url');
    writeFileSync(join(beleidMap, 'keten.json'), JSON.stringify({
      versies: [{
        beleid,
        hash: bk.beleidHash(beleid),
        op: new Date().toISOString(),
        ondertekend: { soort: 'ed25519', keyId: 'recovery-1', signature: sig },
      }],
    }), 'utf8');
    vergeetCache();
  };
  const wisKeten = () => {
    rmSync(join(beleidMap, 'keten.json'), { force: true });
    vergeetCache();
  };

  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `mcp-access-${T}@eenheid.test`;
  const sub = `sub-mcp-access-${T}`;
  const oudeEigenaren = (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'")).rows.map((r) => String(r.id));
  for (const id of oudeEigenaren) {
    await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"member\"') WHERE tbl='users' AND id=$1", [id]);
  }

  const G = await nepGoogle({ ownerEmail: eigenaarEmail });
  const { handler } = await import('../../backend/index');
  const { createServer } = await import('../../server/start');
  const opensslPad = zoekOpenssl();
  const chromePad = zoekChrome();
  let tlsServer: https.Server | null = null;
  let poort = 0;
  if (opensslPad) {
    const keyPad = join(werk, 'srv.key');
    const crtPad = join(werk, 'srv.crt');
    spawnSync(opensslPad, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPad, '-out', crtPad, '-days', '1', '-subj', '/CN=tarasevych.com'], { encoding: 'utf8' });
    const appHttp = createServer();
    tlsServer = https.createServer({ key: readFileSync(keyPad), cert: readFileSync(crtPad) }, (req, res) => { appHttp.emit('request', req, res); });
    await new Promise<void>((r) => tlsServer!.listen(0, '127.0.0.1', () => r()));
    poort = (tlsServer.address() as { port: number }).port;
  }

  let uid = '';
  const clients: string[] = [];
  const sseSluiters: Array<() => void> = [];
  let chromeProc: ReturnType<typeof spawn> | null = null;
  let cdp: Cdp | null = null;

  async function koppelAgent(userId: string, slug: AgentSlug, keuze: v2st.V2Keuze) {
    const redirect = slug === 'cursor' ? 'https://cursor.com/api/mcp/oauth/callback' : 'http://127.0.0.1/callback';
    const naam = slug === 'cursor' ? 'Cursor' : 'ChatGPT';
    const reg = parseJson((await c.registerClient(JSON.stringify({ client_name: naam, redirect_uris: [redirect] }))).body);
    clients.push(reg.client_id);
    const p = pkce();
    const a = await c.authorize({
      response_type: 'code', client_id: reg.client_id, redirect_uri: redirect,
      code_challenge: p.challenge, code_challenge_method: 'S256', state: 'st', resource: agentUrl(slug),
    });
    const rid = new URL(kopVan(a, 'location')).searchParams.get('consent') || '';
    const d = await c.consentDecide(userId, rid, true, null, 'prive', keuze);
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const tok = parseJson((await c.token(form({
      grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirect,
    }))).body);
    const tokenRij = (await sys.query(
      'SELECT id FROM app.mcp_oauth_tokens WHERE access_hash = $1',
      [createHash('sha256').update(tok.access_token).digest('hex')],
    )).rows[0];
    return { accessToken: String(tok.access_token), grantId: String(tokenRij.id) };
  }

  const rpc = (slug: AgentSlug, token: string, msg: unknown) =>
    v2.rpc(slug, `Bearer ${token}`, JSON.stringify(msg));
  const lijstTools = async (slug: AgentSlug, token: string) =>
    (parseJson((await rpc(slug, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).body)?.result?.tools ?? []) as Array<{ name: string }>;
  const roepTool = async (slug: AgentSlug, token: string, name: string, args: Record<string, unknown> = {}) =>
    parseJson((await rpc(slug, token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })).body)?.result;

  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const aanm = await b.aanmelden(sub, eigenaarEmail, {
      service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000),
    });
    check('eigenaar aangemeld', aanm.cb.data.sessionCreated === true);
    const eigRij = (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaarEmail])).rows[0];
    uid = String(eigRij.id);
    const eigUser = { id: uid, email: eigenaarEmail, role: 'owner', status: 'approved' };
    await tp.profielVan(eigUser);

    // Sessie-id en cookie voor directe router-aanroepen
    const cookieHeader = Array.from(b.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const sessieRij = (await sys.query(
      "SELECT id, (data->>'createdAt')::bigint AS created_at FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'userId'=$1 ORDER BY (data->>'createdAt')::bigint DESC LIMIT 1",
      [uid],
    )).rows[0];
    const sessieId = String(sessieRij.id);
    const sessieCreatedAt = Number(sessieRij.created_at);
    const stapOp = async () => {
      const tabRijen = (await sys.query(
        "SELECT id, (data->>'createdAt')::bigint AS created_at FROM app.records WHERE tbl='owner_tab_sessions_v1' AND data->>'anchorSessionId'=$1",
        [sessieId],
      )).rows;
      await alsSysteem(async () => {
        await totpStapOpVastleggen({ user: { id: uid }, session: { id: sessieId, createdAt: sessieCreatedAt } } as never);
        for (const tr of tabRijen) {
          await totpStapOpVastleggen({ user: { id: uid }, tabSession: { id: String(tr.id), createdAt: Number(tr.created_at) } } as never);
        }
      });
    };
    const apiPost = async (host: string, service: string, pad: string, extra: Record<string, unknown> = {}) => {
      const evt = {
        headers: { host, origin: `https://${host}`, 'content-type': 'application/json', cookie: cookieHeader, 'user-agent': 'eenheid' },
        body: JSON.stringify({ service, tabContext: tab, sourceOrigin: `https://${host}`, ...extra }),
        isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } },
      };
      const r = await handler(evt as never);
      return { status: r.statusCode, data: parseJson(String(r.body || '{}')) };
    };

    // Zet tech-ruimtes-v2 aan voor eigenaar + GitHub OAuth in beide laden + dienst 'ai' aan
    await sys.query(`UPDATE app.feature_flags SET aan = true, gebruikers = $1 WHERE sleutel = 'tech-ruimtes-v2'`, [[uid]]);
    trk._vlagCacheLeeg();
    await aiDienstAan(uid);
    for (const lade of ['prive', 'technisch'] as const) {
      await koppelingBewaren(uid, 'oauth', {
        login: 'tarasevych', scopes: ['repo', 'read:user'],
        tokenZegel: verzegel(`gho_test_${lade}`, uid, 'oauth'), verlooptOp: Date.now() + 3600_000,
      }, lade);
    }

    const alleSleutels = V2_OPTIES.filter((o) => o.status === 'actief').map((o) => o.key);
    const alleGebruikerAantal = V2_OPTIES.filter((o) => o.status === 'actief' && o.kant === 'gebruiker').length;
    const alleBeheerAantal = V2_OPTIES.filter((o) => o.status === 'actief' && o.kant === 'beheer').length;
    check('catalogus telt 102 gebruiker + 64 beheer = 166 actieve sleutels',
      alleGebruikerAantal === 102 && alleBeheerAantal === 64 && alleSleutels.length === 166,
      `${alleGebruikerAantal}+${alleBeheerAantal}=${alleSleutels.length}`);

    const cur = await koppelAgent(uid, 'cursor', { kanten: ['gebruiker', 'beheer'], sleutels: alleSleutels });
    const gpt = await koppelAgent(uid, 'gpt', { kanten: ['gebruiker', 'beheer'], sleutels: alleSleutels });
    const whoamiCurNaam = toolNaam(v2Optie('v2_whoami:gebruiker')!, 'cursor');
    const beheerCurNaam = toolNaam(v2Optie('get_live_release:beheer')!, 'cursor');
    const beheerGptNaam = toolNaam(v2Optie('get_live_release:beheer')!, 'gpt');

    // ================================================================== SCENARIO 1: Technisch profiel/sessie UIT (GEEN_TECH_SESSIE)
    const d1 = await diagnoseVoorAgent(uid, {
      slug: 'cursor',
      verbonden: true,
      grantId: cur.grantId,
      actief: { kanten: ['gebruiker', 'beheer'], sleutels: alleSleutels },
      voorkeur: null,
    });
    check('Scenario 1 (sessie UIT): denialCode === GEEN_TECH_SESSIE, effectiveTechnicalAccess === false, beheer === 0',
      d1.denialCode === 'GEEN_TECH_SESSIE' && !d1.effectiveTechnicalAccess && d1.effectiveBeheerVisibleCount === 0 && d1.effectiveGebruikerVisibleCount === 102);

    const curPriveZonderBeleid = (await lijstTools('cursor', cur.accessToken)).length;
    const who1 = JSON.parse((await roepTool('cursor', cur.accessToken, whoamiCurNaam)).content[0].text);
    check('Scenario 1 (v2_whoami): bevat veilige connection.diagnostics met GEEN_TECH_SESSIE zonder interne id\'s/e-mail in diagnostics',
      who1.connection.technicalProfileActive === false
      && who1.connection.diagnostics.statusCode === 'GEEN_TECH_SESSIE'
      && who1.connection.diagnostics.effectiveToolsNow === curPriveZonderBeleid
      && curPriveZonderBeleid > 20
      && who1.connection.diagnostics.grantedToolsTotal === 166
      && !JSON.stringify(who1.connection.diagnostics).includes(eigenaarEmail)
      && !JSON.stringify(who1.connection.diagnostics).includes(sessieId),
      JSON.stringify(who1.connection.diagnostics));

    const weiger1 = await roepTool('cursor', cur.accessToken, beheerCurNaam);
    check('Scenario 1 (tools/call _beheer): geweigerd met TECH_PROFILE_OFF én Cause: GEEN_TECH_SESSIE',
      weiger1?.isError === true && /TECH_PROFILE_OFF/.test(weiger1.content[0].text) && /Cause: GEEN_TECH_SESSIE/.test(weiger1.content[0].text),
      weiger1?.content?.[0]?.text);

    // ================================================================== SCENARIO 2: Exacte reproductie van «1 uit 166» (ondertekend AI-beleid)
    schrijfKeten({
      claude: { name: 'Claude', enabled: true, defaultMode: { kind: 'always' }, capabilities: {} },
    } as Policy['agents']);

    const curLijstBeleidOnbekend = await lijstTools('cursor', cur.accessToken);
    const gptLijstBeleidOnbekend = await lijstTools('gpt', gpt.accessToken);
    check('Scenario 2a (keten.json zonder cursor/gpt): tools/list snijdt 102 privétools terug tot exact 1 (v2_whoami) voor ZOWEL Cursor als ChatGPT',
      curLijstBeleidOnbekend.length === 1 && curLijstBeleidOnbekend[0].name === whoamiCurNaam
      && gptLijstBeleidOnbekend.length === 1);

    const ovBeleid = await v2.overzicht(uid);
    const curStandBeleid = ovBeleid.agenten.find((a) => a.slug === 'cursor')!;
    check('Scenario 2b (overzicht liegt NIET): effectiveVisibleToolsCount === 1 (niet 102 of 166!) en aiPolicyState === agent-onbekend',
      curStandBeleid.diagnose.effectiveVisibleToolsCount === 1
      && curStandBeleid.diagnose.effectiveGebruikerVisibleCount === 1
      && curStandBeleid.diagnose.aiPolicyState === 'agent-onbekend'
      && curStandBeleid.diagnose.aiPolicyBlockedCount === 101
      && curStandBeleid.diagnose.blokkades.some((bl) => bl.code === 'BELEID_AGENT_ONBEKEND'));

    // Verlopen tijdvenster in ondertekend beleid → BELEID_VERLOPEN
    const nuMs = Date.now();
    schrijfKeten({
      cursor: {
        name: 'Cursor', enabled: true,
        defaultMode: { kind: 'timed', startedAt: nuMs - 7200_000, expiresAt: nuMs - 60_000, after: 'off', label: '1 год' },
        capabilities: {},
      },
      gpt: { name: 'ChatGPT', enabled: true, defaultMode: { kind: 'always' }, capabilities: {} },
    } as Policy['agents']);
    const dVerlopen = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 2c (verlopen tijdvenster in keten.json): aiPolicyState === verlopen en blokkade BELEID_VERLOPEN',
      dVerlopen.effectiveVisibleToolsCount === 1 && dVerlopen.aiPolicyState === 'verlopen' && dVerlopen.blokkades.some((bl) => bl.code === 'BELEID_VERLOPEN'));

    // Zet beide agents netjes aan in ondertekend beleid voor de vervolgscenario's
    schrijfKeten({
      cursor: { name: 'Cursor', enabled: true, defaultMode: { kind: 'always' }, capabilities: {} },
      gpt: { name: 'ChatGPT', enabled: true, defaultMode: { kind: 'always' }, capabilities: {} },
    } as Policy['agents']);
    check('Scenario 2d (agents toegestaan in keten.json): alle 102 privétools direct weer zichtbaar',
      (await lijstTools('cursor', cur.accessToken)).length === 102 && (await lijstTools('gpt', gpt.accessToken)).length === 102);

    // ================================================================== SCENARIO 3: Technische sessie AAN, AI-delegatie UIT (AI_NIET_TOEGESTAAN)
    await stapOp();
    const startRes = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/starten', {
      modus: 'tot-technisch-einde', reden: 'MCP-ACCESS-001 test',
    });
    check('Scenario 3a: technische sessie v2 gestart', startRes.status === 200 && startRes.data.actief === 'technisch');

    const d3 = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 3b (sessie AAN, delegatie UIT): profileSessionActive === true, aiSessionDelegationActive === false, denialCode === AI_NIET_TOEGESTAAN',
      d3.profileSessionActive === true && d3.aiSessionDelegationActive === false && d3.denialCode === 'AI_NIET_TOEGESTAAN' && !d3.effectiveTechnicalAccess);
    const weiger3 = await roepTool('cursor', cur.accessToken, beheerCurNaam);
    check('Scenario 3c: _beheer tools/call geweigerd met Cause: AI_NIET_TOEGESTAAN',
      weiger3?.isError === true && /Cause: AI_NIET_TOEGESTAAN/.test(weiger3.content[0].text));

    // ================================================================== SCENARIO 4: Per-verbinding (verbinding_id) isolatie tussen /cursor en /gpt
    const aiZetCur = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/ai-zetten', {
      verbindingId: cur.grantId, ruimtes: ['prive', 'technisch'], termijn: 'tot-technisch-einde',
    });
    check('Scenario 4a: technische sessiedelegatie alleen voor Cursor grantId gezet', aiZetCur.status === 200);

    const volledigMetTechAantal = (await lijstTools('cursor', cur.accessToken)).length;
    const beheerZichtbaarAantal = volledigMetTechAantal - 102;
    const ov4 = await v2.overzicht(uid);
    const curD4 = ov4.agenten.find((a) => a.slug === 'cursor')!.diagnose;
    const gptD4 = ov4.agenten.find((a) => a.slug === 'gpt')!.diagnose;
    check('Scenario 4b (ISOLATIE): Cursor heeft nu effectiveTechnicalAccess=true (volledige _beheer tools), maar ChatGPT blijft geïsoleerd op AI_NIET_TOEGESTAAN (102 privétools)!',
      beheerZichtbaarAantal >= 30
      && curD4.effectiveTechnicalAccess === true
      && curD4.effectiveVisibleToolsCount === volledigMetTechAantal
      && curD4.effectiveBeheerVisibleCount === beheerZichtbaarAantal
      && curD4.denialCode === null
      && gptD4.effectiveTechnicalAccess === false
      && gptD4.effectiveVisibleToolsCount === 102
      && gptD4.effectiveBeheerVisibleCount === 0
      && gptD4.denialCode === 'AI_NIET_TOEGESTAAN',
      `cur=${curD4.effectiveVisibleToolsCount} (beheer=${curD4.effectiveBeheerVisibleCount}, denial=${curD4.denialCode}), gpt=${gptD4.effectiveVisibleToolsCount} (denial=${gptD4.denialCode})`);

    const okCurBeheer = await roepTool('cursor', cur.accessToken, beheerCurNaam);
    const weigerGptBeheer = await roepTool('gpt', gpt.accessToken, beheerGptNaam);
    check('Scenario 4c: _beheer tools/call slaagt op /cursor maar wordt GEWEIGERD op /gpt',
      okCurBeheer && !okCurBeheer.isError && weigerGptBeheer?.isError === true && /Cause: AI_NIET_TOEGESTAAN/.test(weigerGptBeheer.content[0].text));

    // Controleer dat specifieke 'prive' op één verbinding een algemene '*' overschrijft
    await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/ai-zetten', {
      verbindingId: '*', ruimtes: ['prive', 'technisch'], termijn: 'tot-technisch-einde',
    });
    await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/ai-zetten', {
      verbindingId: gpt.grantId, ruimtes: ['prive'], termijn: 'tot-site-uitloggen',
    });
    const gptD4Override = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'gpt')!.diagnose;
    check('Scenario 4d: specifieke per-verbinding [\'prive\'] op /gpt overschrijft wildcard \'*\' [\'prive\',\'technisch\']',
      !gptD4Override.effectiveTechnicalAccess && gptD4Override.denialCode === 'AI_NIET_TOEGESTAAN');
    // Ruim wildcard weer op zodat alleen cur.grantId geldt
    await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/ai-zetten', {
      verbindingId: '*', ruimtes: ['prive'], termijn: 'tot-site-uitloggen',
    });

    // ================================================================== SCENARIO 5: Dienst 'ai' UIT, BEVROREN en KEUZE_ONTBREEKT
    await rs.dienstZetten(uid, 'ai', 'ontkoppel', { actorId: uid, stapOpGedaan: true });
    const d5Uit = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 5a (dienst ai UIT): denialCode === DIENST_UIT, _beheer direct verborgen (102 tools)',
      d5Uit.denialCode === 'DIENST_UIT' && !d5Uit.effectiveTechnicalAccess && d5Uit.effectiveVisibleToolsCount === 102);

    await sys.query(
      `INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door, bevroren_op, bevroren_oorzaak)
       VALUES ($1, 'ai', 'bevroren', 'uit', 'eenheidstest', NOW(), 'rol-weg')
       ON CONFLICT (user_id, dienst) DO UPDATE SET stand = 'bevroren', bevroren_op = NOW(), bevroren_oorzaak = 'rol-weg', gewijzigd_op = NOW()`,
      [uid],
    );
    const d5Bevroren = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 5b (dienst ai BEVROREN): denialCode === BEVROREN, _beheer verborgen',
      d5Bevroren.denialCode === 'BEVROREN' && !d5Bevroren.effectiveTechnicalAccess);

    await aiDienstOpruimen([uid]);
    const d5GeenKeuze = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 5c (KEUZE_ONTBREEKT): denialCode === KEUZE_ONTBREEKT, ruimteKeuzeGemaakt === false',
      d5GeenKeuze.denialCode === 'KEUZE_ONTBREEKT' && !d5GeenKeuze.ruimteKeuzeGemaakt && !d5GeenKeuze.effectiveTechnicalAccess);

    await aiDienstAan(uid);
    check('Scenario 5d (dienst ai hersteld): Cursor heeft direct weer alle technische tools',
      (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose.effectiveVisibleToolsCount === volledigMetTechAantal);

    // ================================================================== SCENARIO 6: Technische sessie op PAUZE en HERVATTEN
    const pauzeRes = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/wisselen', { naar: 'prive' });
    check('Scenario 6a: gewisseld naar persoonlijke ruimte (pauze)', pauzeRes.status === 200 && pauzeRes.data.pauze === true);
    const d6Pauze = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 6b (PAUZE): profileSessionPaused === true, denialCode === PAUZE, _beheer direct verborgen',
      d6Pauze.profileSessionPaused === true && !d6Pauze.profileSessionActive && d6Pauze.denialCode === 'PAUZE' && d6Pauze.effectiveVisibleToolsCount === 102);

    const hervatRes = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/wisselen', { naar: 'technisch' });
    check('Scenario 6c (HERVAT): terug in technische ruimte zonder stap-op → direct weer alle technische tools',
      hervatRes.status === 200 && (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose.effectiveVisibleToolsCount === volledigMetTechAantal);

    // ================================================================== SCENARIO 7: Verlopen tijd-sessie (VERLOPEN)
    await sys.query(
      "UPDATE app.tech_ruimte_sessies SET modus = 'tijd', eind_op = NOW() - interval '2 minutes' WHERE user_id = $1 AND beeindigd_op IS NULL",
      [uid],
    );
    const d7Verlopen = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 7 (VERLOPEN): verlopen tijdsessie → denialCode === VERLOPEN, _beheer verborgen',
      d7Verlopen.denialCode === 'VERLOPEN' && !d7Verlopen.effectiveTechnicalAccess && d7Verlopen.effectiveVisibleToolsCount === 102);
    await sys.query(
      "UPDATE app.tech_ruimte_sessies SET beeindigd_op = NOW(), beeindigd_reden = 'verlopen' WHERE user_id = $1 AND beeindigd_op IS NULL",
      [uid],
    );

    // ================================================================== SCENARIO 8: Eigenaar uitgelogd van site (SITE_SESSIE_WEG)
    await stapOp();
    await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/starten', {
      modus: 'tot-site-uitloggen', reden: 'Test site-sessie verlies',
    });
    await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/ai-zetten', {
      verbindingId: cur.grantId, ruimtes: ['prive', 'technisch'], termijn: 'tot-site-uitloggen',
    });
    check('Scenario 8a: nieuwe tot-site-uitloggen sessie actief (alle technische tools zichtbaar)',
      (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose.effectiveVisibleToolsCount === volledigMetTechAantal);

    // Simuleer verlopen/verwijderde site-sessie terwijl tech_ruimte_sessies rij nog open staat
    await sys.query(
      "UPDATE app.records SET data = jsonb_set(data, '{idleExpiresAt}', '1000') WHERE tbl = 'owner_service_sessions_v1' AND id = $1",
      [sessieId],
    );
    const d8Weg = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'cursor')!.diagnose;
    check('Scenario 8b (SITE_SESSIE_WEG): verlopen site-sessie → denialCode === SITE_SESSIE_WEG en _beheer onmiddellijk dicht',
      d8Weg.denialCode === 'SITE_SESSIE_WEG' && !d8Weg.effectiveTechnicalAccess && d8Weg.effectiveVisibleToolsCount === 102);

    // Herstel site-sessie en sluit oude tech_ruimte_sessies rij netjes via echte /beeindigen route
    await sys.query(
      "UPDATE app.records SET data = jsonb_set(data, '{idleExpiresAt}', to_jsonb(($2)::bigint)) WHERE tbl = 'owner_service_sessions_v1' AND id = $1",
      [sessieId, Date.now() + 7 * 86400_000],
    );
    await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/beeindigen', {});

    // ================================================================== SCENARIO 9 & 10: Live intrekking + Live toepassen voorkeur zonder tokenintrekking + SSE
    // Geef /gpt een smalle standaardset en breid die daarna live uit via /api/owner/connector-v2/toepassen!
    await v2.intrekken(uid, 'gpt');
    const smalSleutels = STANDAARD();
    const gptSmal = await koppelAgent(uid, 'gpt', { kanten: ['gebruiker'], sleutels: smalSleutels });
    const taakMakenGpt = toolNaam(v2Optie('create_task:gebruiker')!, 'gpt');
    check('Scenario 10a: smalle /gpt koppeling bevat create_task nog niet',
      !(await lijstTools('gpt', gptSmal.accessToken)).some((t) => t.name === taakMakenGpt));

    let sseGpt: { status: number; berichten: string[]; sluit: () => void } | null = null;
    if (poort > 0) {
      sseGpt = await httpsSse(poort, '/gpt', gptSmal.accessToken);
      sseSluiters.push(sseGpt.sluit);
      check('Scenario 10b: GET /gpt opent SSE-stroom (200)', sseGpt.status === 200);
    }

    const uitgebreidSleutels = pasModusToe(smalSleutels, 'lezen-schrijven', ['gebruiker'], { groep: 'bord' });
    const wijzigRes = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/wijzig', {
      agent: 'gpt', kanten: ['gebruiker'], sleutels: uitgebreidSleutels,
    });
    check('Scenario 10c: wijzig slaat uitbreiding op als wachtende voorkeur (herverbinden=true) zonder stil toe te passen',
      wijzigRes.status === 200 && wijzigRes.data.herverbinden === true
      && !(await lijstTools('gpt', gptSmal.accessToken)).some((t) => t.name === taakMakenGpt));

    const weigerWacht = await roepTool('gpt', gptSmal.accessToken, taakMakenGpt, { title: 'Test' });
    check('Scenario 10d: aanroep van wachtend recht noemt direct «Застосувати зараз» op #agent/gpt',
      weigerWacht?.isError === true && /PERMISSION_OFF/.test(weigerWacht.content[0].text) && /Застосувати зараз/.test(weigerWacht.content[0].text));

    // Zonder verse step-up moet /toepassen bij uitbreiding 403 STEP_UP_REQUIRED geven
    await sys.query("DELETE FROM app.records WHERE tbl='owner_step_up_v1' AND data->>'userId'=$1", [uid]);
    const zonderStepUp = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/toepassen', { agent: 'gpt' });
    check('Scenario 10e: /connector-v2/toepassen vereist step-up bij uitbreiding van rechten (403)',
      zonderStepUp.status === 403 && /STEP_UP/.test(String(zonderStepUp.data?.error || '')));

    await stapOp();
    const pasToeRes = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/toepassen', { agent: 'gpt' });
    check('Scenario 10f: /connector-v2/toepassen met step-up werkt actieve grant live bij zonder OAuth-token in te trekken',
      pasToeRes.status === 200 && pasToeRes.data.bijgewerkt === 1);

    const lijstNaToepassen = await lijstTools('gpt', gptSmal.accessToken);
    const d10Na = (await v2.overzicht(uid)).agenten.find((a) => a.slug === 'gpt')!.diagnose;
    check('Scenario 10g: HETZELFDE OAuth access_token ziet nu direct create_task en pendingExpansion.wacht === false',
      lijstNaToepassen.some((t) => t.name === taakMakenGpt) && d10Na.pendingExpansion.wacht === false);

    if (sseGpt) {
      await slaap(250);
      check('Scenario 10h: open SSE-stroom ontving direct notifications/tools/list_changed na toepassen',
        sseGpt.berichten.join('').includes('notifications/tools/list_changed'));
    }

    // ================================================================== SCENARIO 11: Gededupliceerde site_notifications (geen spam!)
    await sys.query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [uid]);
    _resetToegangMeldingGeheugen();
    for (let i = 0; i < 5; i++) {
      await roepTool('cursor', cur.accessToken, beheerCurNaam);
    }
    await slaap(250);
    const meldingen = (await sys.query(
      "SELECT data FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1 AND data->>'aiAgent' = 'cursor'",
      [uid],
    )).rows.map((r) => r.data);
    check('Scenario 11 (site_notifications): 5 herhaalde geblokkeerde _beheer-pogingen maken EXACT 1 persoonlijke melding (geen spam, zichtbaar zonder tech profiel)',
      meldingen.length === 1
      && meldingen[0].kind === 'ai_bevestiging'
      && meldingen[0].ruimte === 'prive'
      && meldingen[0].aiWeigerCode === 'GEEN_TECH_SESSIE'
      && String(meldingen[0].link || '').endsWith('/agents#agent/cursor')
      && String(meldingen[0].title || '').includes('Cursor'),
      JSON.stringify(meldingen));

    // ================================================================== SCENARIO 12: Echte headless Google Chrome E2E op /agents en #agent/cursor
    if (chromePad && poort > 0 && existsSync(join(distDir, 'index.html'))) {
      // Zet technische sessie AAN in deze browser-sessie, maar laat AI-delegatie van Cursor UIT → AI_NIET_TOEGESTAAN!
      // Dit is precies de situatie waarin de oude UI loog dat "технічний профіль активний — ці інструменти ШІ бачить зараз".
      await stapOp();
      const startChromeRes = await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/starten', {
        modus: 'tot-technisch-einde', reden: 'Chrome E2E MCP-ACCESS-001',
      });
      check('Scenario 120 (voorbereiding Chrome): technische sessie v2 actief gezet', startChromeRes.status === 200, JSON.stringify(startChromeRes));
      await apiPost('mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/ai-zetten', {
        verbindingId: cur.grantId, ruimtes: ['prive'], termijn: 'tot-site-uitloggen',
      });

      const profielMap = join(werk, 'chrome-profiel');
      chromeProc = spawn(chromePad, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
        '--disable-sync', '--disable-component-update', '--disable-default-apps', '--mute-audio',
        '--window-size=1280,900', '--lang=uk', '--ignore-certificate-errors', '--no-proxy-server',
        `--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${poort}, MAP tarasevych.com 127.0.0.1:${poort}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
        '--remote-debugging-port=0', `--user-data-dir=${profielMap}`, 'about:blank',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      const wsUrl = await new Promise<string>((res, rej) => {
        let buf = '';
        const timer = setTimeout(() => rej(new Error(`Chrome DevTools timeout: ${buf.slice(-300)}`)), 25_000);
        chromeProc!.stderr!.on('data', (d) => {
          buf += String(d);
          const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buf);
          if (m) { clearTimeout(timer); res(m[1]); }
        });
        chromeProc!.once('exit', (code) => { clearTimeout(timer); rej(new Error(`Chrome exit ${code}`)); });
      });

      cdp = await Cdp.verbind(wsUrl);
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, s);
      await cdp.send('Runtime.enable', {}, s);
      await cdp.send('Network.enable', {}, s);
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', ${JSON.stringify(tab)});`,
      }, s);
      for (const [name, value] of b.jar) {
        for (const hostUrl of ['https://id.tarasevych.com/', 'https://mcp.tarasevych.com/', 'https://admin.tarasevych.com/']) {
          await cdp.send('Network.setCookie', { name, value, url: hostUrl, secure: true, httpOnly: true, sameSite: 'Lax' }, s);
        }
      }

      const pageErrors: string[] = [];
      cdp.on((m) => {
        if (m.sessionId === s && m.method === 'Runtime.exceptionThrown') {
          pageErrors.push(String(m.params?.exceptionDetails?.text || 'exception'));
        }
      });

      const evalJs = async <T = any>(expr: string, awaitPromise = false): Promise<T> => {
        const r = await cdp!.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, s);
        if (r?.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.text}`);
        return r?.result?.value as T;
      };
      const wachtOp = async <T = any>(naam: string, expr: string, ms = 15_000): Promise<T> => {
        const eind = Date.now() + ms;
        while (Date.now() < eind) {
          try { const v = await evalJs<T>(expr); if (v) return v; } catch { /* wacht */ }
          await slaap(150);
        }
        throw new Error(`Chrome time-out op ${naam}`);
      };

      // 12a. Open /agents → blokkadebanner voor Cursor moet zichtbaar zijn met AI_NIET_TOEGESTAAN
      await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/agents' }, s);
      await wachtOp('blokkadebanner voor Cursor op /agents',
        `Boolean(document.querySelector('[data-ag-blokkade-agent="cursor"][data-ag-blokkade-code="AI_NIET_TOEGESTAAN"]'))`);
      check('Scenario 12a (Chrome /agents): waarschuwingsbanner toont geblokkeerde Cursor met code AI_NIET_TOEGESTAAN', true);

      // Klik op de 1-klik knop om naar #agent/cursor te springen
      await evalJs(`document.querySelector('[data-ag-blokkade-open="cursor"]').click()`);
      await wachtOp('gereedheidspaneel op #agent/cursor',
        `Boolean(document.querySelector('[data-agent-diagnose="AI_NIET_TOEGESTAAN"]'))`);

      const uiControleVoor = await evalJs<{
        hulpmiddelenAttr: string;
        beheerStatus: string;
        beheerTekst: string;
        sessieStaat: string;
        heeftDubbeleStartKnop: boolean;
        dienstStaat: string;
        heeftDubbeleDienstKnop: boolean;
        heeftDelegatieKnop: boolean;
      }>(`(() => ({
        hulpmiddelenAttr: document.querySelector('[data-agent-hulpmiddelen]')?.getAttribute('data-agent-hulpmiddelen') || '',
        beheerStatus: document.querySelector('[data-v2-beheer-status]')?.getAttribute('data-v2-beheer-status') || '',
        beheerTekst: document.querySelector('[data-v2-beheer-status]')?.textContent || '',
        sessieStaat: document.querySelector('[data-diagnose-laag="sessie"]')?.getAttribute('data-diagnose-staat') || '',
        heeftDubbeleStartKnop: Boolean(document.querySelector('[data-diagnose-actie="start_tech_sessie"]')),
        dienstStaat: document.querySelector('[data-diagnose-laag="dienst"]')?.getAttribute('data-diagnose-staat') || '',
        heeftDubbeleDienstKnop: Boolean(document.querySelector('[data-diagnose-actie="zet_ai_dienst_eigen"]')),
        heeftDelegatieKnop: Boolean(document.querySelector('[data-diagnose-actie="zet_ai_sessie_einde"]')),
      }))()`);

      check('Scenario 12b (Chrome #agent/cursor geen UI-leugen): toont 102 zichtbare tools en AI_NIET_TOEGESTAAN i.p.v. «ці інструменти ШІ бачить зараз»',
        uiControleVoor.hulpmiddelenAttr === '102'
        && uiControleVoor.beheerStatus === 'AI_NIET_TOEGESTAAN'
        && !uiControleVoor.beheerTekst.includes('ці інструменти ШІ бачить зараз'),
        JSON.stringify(uiControleVoor));

      check('Scenario 12c (Chrome geen dubbele Activeer-knoppen): al actieve sessie en al actieve dienst bieden GEEN start/aanzetten-knop aan',
        uiControleVoor.sessieStaat === 'actief'
        && uiControleVoor.heeftDubbeleStartKnop === false
        && uiControleVoor.dienstStaat === 'actief'
        && uiControleVoor.heeftDubbeleDienstKnop === false
        && uiControleVoor.heeftDelegatieKnop === true,
        JSON.stringify(uiControleVoor));

      // 12d. Klik op de directe 1-klik knop «Дозволити до кінця сеансу» op #agent/cursor!
      await evalJs(`document.querySelector('[data-diagnose-actie="zet_ai_sessie_einde"]').click()`);
      await wachtOp('gereedheidspaneel springt naar OK en volledige tools',
        `document.querySelector('[data-agent-diagnose]')?.getAttribute('data-agent-diagnose') === 'OK' && document.querySelector('[data-agent-hulpmiddelen]')?.getAttribute('data-agent-hulpmiddelen') === '${volledigMetTechAantal}'`);

      const heeftNogDelegatieAanKnop = await evalJs<boolean>(`Boolean(document.querySelector('[data-diagnose-actie="zet_ai_sessie_einde"]'))`);
      const heeftIntrekDelegatieKnop = await evalJs<boolean>(`Boolean(document.querySelector('[data-diagnose-actie="trek_ai_sessie_in"]'))`);
      check('Scenario 12d (Chrome na 1-klik vrijgave): diagnose=OK, alle technische tools zichtbaar, «Дозволити»-knop verdwenen en vervangen door intrekknop',
        !heeftNogDelegatieAanKnop && heeftIntrekDelegatieKnop);

      // Verifieer via echte HTTPS POST /cursor dat Cursor nu alle technische tools terugkrijgt, terwijl /gpt nog steeds geïsoleerd is!
      const httpsCurTools = parseJson((await httpsVerzoek(
        poort, 'mcp.tarasevych.com', 'POST', '/cursor',
        JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }),
        { authorization: `Bearer ${cur.accessToken}` },
      )).body)?.result?.tools ?? [];
      check('Scenario 12e (echte HTTPS POST /cursor na 1-klik in Chrome): geeft exact alle zichtbare tools (incl. _beheer) terug',
        httpsCurTools.length === volledigMetTechAantal, `${httpsCurTools.length} vs ${volledigMetTechAantal}`);

      check('Scenario 12f (Chrome foutloos): geen onverwachte JS pageErrors', pageErrors.length === 0, pageErrors.join('; '));
    }
  } finally {
    for (const sluit of sseSluiters) sluit();
    if (cdp) cdp.sluit();
    if (chromeProc) { try { chromeProc.kill(); } catch { /* al gestopt */ } }
    if (tlsServer) await new Promise<void>((r) => tlsServer!.close(() => r()));
    G.herstel();

    if (uid) {
      await trk.bijIntrekken(uid, 'zelf').catch(() => undefined);
      await koppelingWissen(uid, 'prive').catch(() => undefined);
      await koppelingWissen(uid, 'technisch').catch(() => undefined);
      await aiDienstOpruimen([uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_ruimte_tabs WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_rechten WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_instellingen WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.ai_toegang WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_codes WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_requests WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.audit WHERE owner_id = $1 OR actor_id = $1', [uid]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE data->>'userId' = $1 OR data->>'recipientUserId' = $1", [uid]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
    }
    for (const cid of clients) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE id = $1', [cid]).catch(() => undefined);
    await sys.query(`UPDATE app.feature_flags SET aan = false, gebruikers = '{}' WHERE sleutel = 'tech-ruimtes-v2'`).catch(() => undefined);
    trk._vlagCacheLeeg();
    for (const id of oudeEigenaren) {
      await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl='users' AND id=$1", [id]).catch(() => undefined);
    }

    wisKeten();
    if (vorigeBeleidDir === undefined) delete process.env.AI_BELEID_DIR; else process.env.AI_BELEID_DIR = vorigeBeleidDir;
    if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
    if (vorigeLimieten === undefined) delete process.env.E2E_LOKALE_LIMIETEN; else process.env.E2E_LOKALE_LIMIETEN = vorigeLimieten;
    if (vorigeOrchWortel === undefined) delete process.env.ORCH_WORTEL; else process.env.ORCH_WORTEL = vorigeOrchWortel;
    if (vorigeOrchInbox === undefined) delete process.env.ORCH_INBOX; else process.env.ORCH_INBOX = vorigeOrchInbox;
    vergeetCache();
    rmSync(werk, { recursive: true, force: true });
  }

  return einde();
}
