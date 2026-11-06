// Volledige verificatie van UX-AI-VAULT-001 (01.11.2026):
//   DEEL 1 — 1-plek AI-agentbeheer op mcp.tarasevych.com/agenten#agent/<slug> zonder 4 slagbomen of blinde redirects:
//     1a. Cross-subdomein actieve technische sessie (bv. gestart op admin.*) + 0-sessie 1-klik Rij 2 («Дозволити до кінця сеансу»)
//         via POST /api/owner/connector-v2/activeer-tech → nooit meer HTTP 403 TECH_RUIMTE_VEREIST;
//     1b. Rij 4 («4. Підписана політика-стеля Доступ ШІ») tekent keten.json DIRECT TER PLAATSE op mcp.tarasevych.com/agents#agent/cursor
//         met echte WebAuthn Passkey (WYSIWYS-hashcontrole in browser + root goedkeur-hulp.mjs verwerk, origin https://mcp.tarasevych.com);
//     1c. Gecombineerde 1-actie rechtenactivatie («Зберегти й активувати (Passkey)») werkt met één bevestiging tegelijk ai-beleid,
//         actieve grant (connector_v2_rechten zonder herverbinden=true) én technische sessiedelegatie bij, met behoud van PR #17 ruimtescheiding.
//   DEEL 2 — Geünificeerde mensvriendelijke «Сховище секретів» (GeheimFormulier / GeheimVenster) op github.*, api.* en admin.*:
//     2a. Alle 17 VAULT_DOELEN in één canonieke component; adaptieve velden voor github-oauth (Homepage URL + Redirect URI kopieerbaar +
//         aparte Client ID & Client Secret → leesOauthApp), github-app (aparte App ID & Private Key PEM → leesAppSleutel) en single-token doelen;
//     2b. Automatisch ingevulde metadata ingeklapt onder <details data-kluis-extra="1"> («Додаткові параметри»);
//     2c. Veldspecifieke Oekraïense foutmeldingen vóór step-up (nooit blinde «Спробу дії з секретом відхилено: помилка»);
//     2d. Echte headless Google Chrome E2E op github.tarasevych.com/accounts (in-place modal), api.tarasevych.com/kluis?doel=github-app en
//         admin.tarasevych.com/contour met 0 JS pageErrors.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import * as bk from '../../deploy/goedkeuring/ai-beleid-kern.mjs';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { leesStand, vergeetCache } from '../../backend/ai-beleid';
import { _resetToegangMeldingGeheugen } from '../../backend/ai-toegang-diagnose';
import { readOwnerVaultPlaintext } from '../../backend/api-platform-kluis';
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
import { bouwAgentBeleidOps } from '../../shared/ai-beleid/agent-ontwerp';
import { assertPolicy, buildDraft, type Policy } from '../../shared/ai-beleid/model';
import { agentUrl, type AgentSlug } from '../../shared/connector-v2/agenten';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { pasModusToe, STANDAARD } from '../../shared/connector-v2/rechten';
import { VAULT_DOELEN } from '../../shared/geheimen';
import {
  PLACEHOLDER_PER_DOEL,
  STANDAARD_NAAM_PER_DOEL,
  foutVeldVoorServerCode,
  standaardVaultMeta,
  valideerEnPakGeheimIn,
} from '../../shared/geheimen-formulier';
import { leesAppSleutel, leesOauthApp } from '../../shared/github-koppeling';
import { checker, nepGoogle } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
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
  const { check, einde } = checker('ai-kluis-een-plek-20261101');

  // ==================================================================== 0. PURE EENHEIDSTESTS (Deel 1 & Deel 2)
  const testSleutels = V2_OPTIES.map((o) => o.key);
  const nuBasis = Date.now();
  const basisBeleid: Policy = {
    v: 1,
    seq: 0,
    prevHash: null,
    issuedAt: nuBasis - 60_000,
    ownerKeys: [{ id: 'sleutel-1', type: 'ed25519', publicKey: 'MCowBQYDK2VwAyEA0123456789abcdef0123456789abcdef', label: 'Eigenaar', addedAt: nuBasis - 120_000 }],
    approvalSignature: 'risky',
    agents: {
      claude: { name: 'Claude', enabled: true, defaultMode: { kind: 'ask' }, capabilities: {} },
    },
  };
  const opsNieuw = bouwAgentBeleidOps(basisBeleid, 'cursor', 'Cursor', testSleutels, {
    bestaandeAgentId: null,
    nu: nuBasis,
  });
  check('Unit 1a (bouwAgentBeleidOps): onbekende agent maakt agent_add + grant en sluit policy.change strikt uit',
    opsNieuw.some((o) => o.op === 'agent_add' && o.agent === 'cursor' && o.name === 'Cursor')
    && opsNieuw.some((o) => o.op === 'grant' && o.agent === 'cursor' && !o.capabilities.includes('policy.change')));
  const ontwerp1 = buildDraft(basisBeleid, bk.beleidHash(basisBeleid), opsNieuw, nuBasis);
  assertPolicy(ontwerp1);
  check('Unit 1b (bouwAgentBeleidOps): ontwerp passeert assertPolicy en zet cursor enabled=true',
    Boolean(ontwerp1.agents.cursor?.enabled));

  // Idempotent wanneer alles al gedekt is
  const opsAlKlaar = bouwAgentBeleidOps(ontwerp1, 'cursor', 'Cursor', testSleutels, {
    bestaandeAgentId: 'cursor',
    nu: nuBasis,
  });
  check('Unit 1c (bouwAgentBeleidOps): al volledig vrijgegeven agent levert 0 overbodige operaties op',
    opsAlKlaar.length === 0);

  // Verlopen tijdslimiet of uitgeschakelde agent wordt hersteld
  const verlopenBeleid: Policy = {
    ...ontwerp1,
    agents: {
      ...ontwerp1.agents,
      cursor: {
        name: 'Cursor',
        enabled: false,
        defaultMode: { kind: 'timed', startedAt: nuBasis - 7200_000, expiresAt: nuBasis - 3600_000, after: 'off', label: '1 год' },
        capabilities: { 'github.read': { kind: 'off' } },
      },
    },
  };
  const opsHerstel = bouwAgentBeleidOps(verlopenBeleid, 'cursor', 'Cursor', testSleutels, {
    bestaandeAgentId: 'cursor',
    nu: nuBasis,
  });
  const ontwerpHersteld = buildDraft(verlopenBeleid, bk.beleidHash(verlopenBeleid), opsHerstel, nuBasis);
  assertPolicy(ontwerpHersteld);
  check('Unit 1d (bouwAgentBeleidOps): uitgeschakelde agent met verlopen timer wordt ingeschakeld en vernieuwd',
    ontwerpHersteld.agents.cursor.enabled === true
    && ontwerpHersteld.agents.cursor.capabilities['github.read']?.kind === 'always');

  // Deel 2 pure checks: alle 17 VAULT_DOELEN gedekt
  check('Unit 2a (VAULT_DOELEN dekking): alle 17 doelen hebben standaardnaam, placeholder en geldige standaardVaultMeta',
    VAULT_DOELEN.length === 17
    && VAULT_DOELEN.every((d) =>
      /^[a-z0-9._-]{2,64}$/i.test(STANDAARD_NAAM_PER_DOEL[d])
      && PLACEHOLDER_PER_DOEL[d][0].length >= 4
      && PLACEHOLDER_PER_DOEL[d][1].length >= 4
      && standaardVaultMeta(d, 'Eigenaar').geldigTot === ''
      && standaardVaultMeta(d, 'Eigenaar').van.length >= 2));

  const oauthFout = valideerEnPakGeheimIn({ doel: 'github-oauth', clientId: 'x', clientSecret: '' });
  check('Unit 2b (github-oauth validatie): ongeldige Client ID en lege Client Secret geven specifieke Oekraïense veldfouten',
    !oauthFout.ok
    && Boolean(oauthFout.veldFouten.clientId?.[0].includes('Client ID'))
    && Boolean(oauthFout.veldFouten.clientSecret?.[0].includes('Client Secret')));

  const oauthOk = valideerEnPakGeheimIn({
    doel: 'github-oauth',
    clientId: 'Ov23liVoorbeeld12345',
    clientSecret: 'ghs_VoorbeeldGeheimWaarde1234567890',
  });
  const uitgepaktOauth = oauthOk.ok ? leesOauthApp(oauthOk.waarde) : null;
  check('Unit 2c (github-oauth inpakken → leesOauthApp): verpakt automatisch tot exact leesbaar client_id + client_secret',
    oauthOk.ok
    && oauthOk.naam === 'github-oauth'
    && uitgepaktOauth?.clientId === 'Ov23liVoorbeeld12345'
    && uitgepaktOauth?.clientSecret === 'ghs_VoorbeeldGeheimWaarde1234567890');

  // Echte RSA-sleutel genereren zodat we geen PEM-literal in broncode hoeven te zetten en leesAppSleutel echt verifiëren
  const { privateKey: rsaKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const echtePem = rsaKey.export({ type: 'pkcs1', format: 'pem' }).toString('utf8');
  const appFout = valideerEnPakGeheimIn({ doel: 'github-app', appId: 'abc', privateKey: 'geen-pem' });
  const appOk = valideerEnPakGeheimIn({ doel: 'github-app', appId: '987654', privateKey: echtePem });
  const uitgepaktApp = appOk.ok ? leesAppSleutel(appOk.waarde) : null;
  check('Unit 2d (github-app validatie & leesAppSleutel): fouten op appId/privateKey + geldige PEM verpakt voor leesAppSleutel',
    !appFout.ok
    && Boolean(appFout.veldFouten.appId)
    && Boolean(appFout.veldFouten.privateKey)
    && appOk.ok
    && uitgepaktApp?.appId === '987654'
    && uitgepaktApp.privateKey.includes('BEGIN RSA PRIVATE' + ' KEY'));

  check('Unit 2e (foutVeldVoorServerCode): serverfoutcodes wijzen exact het juiste veld aan',
    foutVeldVoorServerCode('GITHUB_OAUTH_CLIENT_ID_ONGELDIG', 'github-oauth') === 'clientId'
    && foutVeldVoorServerCode('GITHUB_OAUTH_CLIENT_SECRET_ONGELDIG', 'github-oauth') === 'clientSecret'
    && foutVeldVoorServerCode('GITHUB_APP_ID_ONGELDIG', 'github-app') === 'appId'
    && foutVeldVoorServerCode('GITHUB_APP_PEM_ONGELDIG', 'github-app') === 'privateKey'
    && foutVeldVoorServerCode('OWNER_VAULT_NAME_INVALID', 'github') === 'naam'
    && foutVeldVoorServerCode('OWNER_VAULT_META_RANGE_INVALID', 'anthropic') === 'meta');

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN ux-ai-vault-20261101 E2E: geen database');
    return einde();
  }

  // ==================================================================== E2E OP POSTGRESQL 17.11 (FORCE RLS) + ECHTE CHROME 156 HTTPS
  const werk = mkdtempSync(join(tmpdir(), 'mr-ux-ai-vault-'));
  // mkdtemp maakt 0700: draait de test als root, dan draait goedkeur-hulp.mjs hieronder als nobody (alsNobody) en kan die de
  // submappen (0777) niet bereiken («inbox … ontbreekt»). Doorgang (x) volstaat; de bestanden zelf blijven van root.
  // Alleen als root: als gewone gebruiker draait alles als die gebruiker, en dan zou 0711 andere lokale gebruikers toegang geven
  // tot de 0777-submappen (zoals de goedkeur-inbox) van deze test.
  if (process.getuid?.() === 0) chmodSync(werk, 0o711);
  const maakMap = (n: string) => { const p = join(werk, n); mkdirSync(p, { recursive: true }); chmodSync(p, 0o777); return p; };
  const dirs = {
    beleid: maakMap('ai-beleid'),
    inbox: maakMap('goedkeur-inbox'),
    status: maakMap('goedkeur-status'),
    staat: maakMap('goedkeur-staat'),
    orchInbox: maakMap('orch-inbox'),
  };
  const sleutelsPad = join(werk, 'goedkeur-passkeys.json');
  const distDir = resolve(process.env.DIST_DIR || 'dist');

  const vorigeEnv = {
    AI_BELEID_DIR: process.env.AI_BELEID_DIR,
    GOEDKEUR_INBOX: process.env.GOEDKEUR_INBOX,
    OPDRACHT_STATUS_DIR: process.env.OPDRACHT_STATUS_DIR,
    GOEDKEUR_SLEUTELS: process.env.GOEDKEUR_SLEUTELS,
    OWNER_VAULT_ENCRYPTION_KEY_V1: process.env.OWNER_VAULT_ENCRYPTION_KEY_V1,
    DIST_DIR: process.env.DIST_DIR,
    E2E_LOKALE_LIMIETEN: process.env.E2E_LOKALE_LIMIETEN,
    ORCH_WORTEL: process.env.ORCH_WORTEL,
    ORCH_INBOX: process.env.ORCH_INBOX,
  };
  process.env.AI_BELEID_DIR = dirs.beleid;
  process.env.GOEDKEUR_INBOX = dirs.inbox;
  process.env.OPDRACHT_STATUS_DIR = dirs.status;
  process.env.GOEDKEUR_SLEUTELS = sleutelsPad;
  process.env.OWNER_VAULT_ENCRYPTION_KEY_V1 = process.env.OWNER_VAULT_ENCRYPTION_KEY_V1
    || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.DIST_DIR = distDir;
  process.env.E2E_LOKALE_LIMIETEN = '1';
  process.env.ORCH_WORTEL = process.cwd();
  process.env.ORCH_INBOX = dirs.orchInbox;
  vergeetCache();
  _resetToegangMeldingGeheugen();

  const hulpEnv = {
    ...process.env,
    AI_BELEID_DIR: dirs.beleid,
    GOEDKEUR_INBOX: dirs.inbox,
    GOEDKEUR_STATUS_DIR: dirs.status,
    GOEDKEUR_STAAT: dirs.staat,
    GOEDKEUR_SLEUTELS: sleutelsPad,
    GOEDKEUR_RECHTEN: join(werk, 'rechten.json'),
    GOEDKEUR_GROEP: 'nogroup',
  };
  const alsNobody = typeof process.getuid === 'function' && process.getuid() === 0 ? { uid: 65534, gid: 65534 } : {};

  // Achtergrondlus die de systemd path-unit (mijn-ruimte-goedkeur-sleutels.path → goedkeur-hulp.mjs verwerk) nabootst
  let watcherActief = true;
  const watcherLus = (async () => {
    while (watcherActief) {
      try {
        const bestanden = readdirSync(dirs.inbox).filter((n) => n.endsWith('.json'));
        if (bestanden.length > 0) {
          for (const f of bestanden) {
            try { chmodSync(join(dirs.inbox, f), 0o644); } catch { /* al verwerkt */ }
          }
          spawnSync(process.execPath, [HULP, 'verwerk'], { env: hulpEnv, encoding: 'utf8', ...alsNobody });
        }
      } catch { /* negeer */ }
      await slaap(120);
    }
  })();

  const { publicKey: edPub, privateKey: edPriv } = generateKeyPairSync('ed25519');
  const edSpki = edPub.export({ type: 'spki', format: 'der' }).toString('base64url');
  const schrijfKeten = (agents: Policy['agents']) => {
    for (const f of readdirSync(dirs.beleid)) {
      if (f.startsWith('versie-') && f.endsWith('.json')) {
        try { rmSync(join(dirs.beleid, f), { force: true }); } catch { /* al weg */ }
      }
    }
    const beleid: Policy = {
      v: 1,
      seq: 0,
      prevHash: null,
      issuedAt: Date.now() - 60_000,
      ownerKeys: [{ id: 'recovery-1', type: 'ed25519', publicKey: edSpki, label: 'Herstelsleutel', addedAt: Date.now() - 120_000 }],
      approvalSignature: 'risky',
      agents,
    };
    const sig = sign(null, bk.ed25519Bericht(beleid), edPriv).toString('base64url');
    writeFileSync(join(dirs.beleid, 'keten.json'), JSON.stringify({
      versies: [{
        beleid,
        hash: bk.beleidHash(beleid),
        op: new Date().toISOString(),
        ondertekend: { soort: 'ed25519', keyId: 'recovery-1', signature: sig },
      }],
    }), 'utf8');
    vergeetCache();
  };

  // Echte ECDSA P-256 Passkey voor ZOWEL root goedkeur-passkeys.json ALS app.passkeys ALS Chrome CDP Virtual WebAuthn Authenticator!
  const { publicKey: pkPub, privateKey: pkPriv } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pkJwk = pkPub.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };
  const pkPkcs8Base64 = (pkPriv.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
  const pkCredBytes = randomBytes(32);
  const pkCredIdB64u = pkCredBytes.toString('base64url');
  const pkCredIdStdB64 = pkCredBytes.toString('base64');
  const pkVingerafdruk = kern.vingerafdruk({ alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: pkJwk.x, y: pkJwk.y } });
  writeFileSync(sleutelsPad, JSON.stringify({
    versie: 1,
    rpId: 'tarasevych.com',
    origins: ['https://admin.tarasevych.com', 'https://id.tarasevych.com'],
    sleutels: [{
      credentialId: pkCredIdB64u,
      alg: -7,
      jwk: { kty: 'EC', crv: 'P-256', x: pkJwk.x, y: pkJwk.y },
      label: 'Chrome Virtual Passkey',
      vingerafdruk: pkVingerafdruk,
      toegevoegd: new Date().toISOString(),
      door: 'ssh',
    }],
  }, null, 2), 'utf8');
  chmodSync(sleutelsPad, 0o644);

  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `ux-ai-vault-${T}@eenheid.test`;
  const sub = `sub-ux-ai-vault-${T}`;
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
    const redirect = 'https://cursor.com/api/mcp/oauth/callback';
    const reg = parseJson((await c.registerClient(JSON.stringify({ client_name: 'Cursor', redirect_uris: [redirect] }))).body);
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

  try {
    // Twee afzonderlijke browsersessies voor dezelfde eigenaar (zoals in productie tussen admin.* en mcp.* wanneer cookies per sessie lopen):
    //   bAdmin = sessie op admin.tarasevych.com
    //   bMcp   = sessie op mcp.tarasevych.com (die we ook in Chrome laden)
    const tabAdmin = randomBytes(24).toString('hex');
    const bAdmin = G.browser();
    const aanmAdmin = await bAdmin.aanmelden(sub, eigenaarEmail, {
      service: 'admin', tabContext: tabAdmin, intent: 'login', authTime: Math.floor(Date.now() / 1000),
    });
    check('eigenaar aangemeld op admin.tarasevych.com', aanmAdmin.cb.data.sessionCreated === true);

    const tabMcp = randomBytes(24).toString('hex');
    const bMcp = G.browser();
    const aanmMcp = await bMcp.aanmelden(sub, eigenaarEmail, {
      service: 'mcp', tabContext: tabMcp, intent: 'login', authTime: Math.floor(Date.now() / 1000),
    });
    check('eigenaar afzonderlijk aangemeld op mcp.tarasevych.com', aanmMcp.cb.data.sessionCreated === true);

    const eigRij = (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaarEmail])).rows[0];
    uid = String(eigRij.id);
    await tp.profielVan({ id: uid, email: eigenaarEmail, role: 'owner', status: 'approved' });

    // Registreer dezelfde P-256 Passkey ook in app.passkeys voor deze eigenaar (voor site step-up met Passkey)
    await sys.query(
      `INSERT INTO app.passkeys (id, user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count)
       VALUES ($1, $2, $3, -7, $4::jsonb, $5, 'Chrome Virtual Passkey', '', ARRAY['internal'], true, true, 0)`,
      [randomUUID(), uid, pkCredIdB64u, JSON.stringify({ kty: 'EC', crv: 'P-256', x: pkJwk.x, y: pkJwk.y }), pkVingerafdruk],
    );

    const sessieRijen = (await sys.query(
      "SELECT id, (data->>'createdAt')::bigint AS created_at FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'userId'=$1 ORDER BY (data->>'createdAt')::bigint ASC",
      [uid],
    )).rows;
    const adminSessieId = String(sessieRijen[0].id);
    const adminSessieCreated = Number(sessieRijen[0].created_at);
    const mcpSessieId = String(sessieRijen[sessieRijen.length - 1].id);
    const mcpSessieCreated = Number(sessieRijen[sessieRijen.length - 1].created_at);
    check('twee afzonderlijke site-ankersessies aangemaakt (S_admin !== S_mcp)', adminSessieId !== mcpSessieId);

    const cookieAdmin = Array.from(bAdmin.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const cookieMcp = Array.from(bMcp.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    const stapOpVoor = async (sid: string, createdAt: number) => {
      const tabRijen = (await sys.query(
        "SELECT id, (data->>'createdAt')::bigint AS created_at FROM app.records WHERE tbl='owner_tab_sessions_v1' AND data->>'anchorSessionId'=$1",
        [sid],
      )).rows;
      await alsSysteem(async () => {
        await totpStapOpVastleggen({ user: { id: uid }, session: { id: sid, createdAt } } as never);
        for (const tr of tabRijen) {
          await totpStapOpVastleggen({ user: { id: uid }, tabSession: { id: String(tr.id), createdAt: Number(tr.created_at) } } as never);
        }
      });
    };

    const apiPost = async (cookie: string, tab: string, host: string, service: string, pad: string, extra: Record<string, unknown> = {}) => {
      const evt = {
        headers: { host, origin: `https://${host}`, 'content-type': 'application/json', cookie, 'user-agent': 'eenheid' },
        body: JSON.stringify({ service, tabContext: tab, sourceOrigin: `https://${host}`, ...extra }),
        isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } },
      };
      const r = await handler(evt as never);
      return { status: r.statusCode, data: parseJson(String(r.body || '{}')) };
    };

    // Zet tech-ruimtes-v2 aan + GitHub OAuth koppeling zodat alle 166 tools beschikbaar zijn wanneer vrijgegeven
    await sys.query(`UPDATE app.feature_flags SET aan = true, gebruikers = $1 WHERE sleutel = 'tech-ruimtes-v2'`, [[uid]]);
    trk._vlagCacheLeeg();
    await aiDienstAan(uid);
    for (const lade of ['prive', 'technisch'] as const) {
      await koppelingBewaren(uid, 'oauth', {
        login: 'ux-vault-eigenaar', scopes: ['repo', 'read:user'],
        tokenZegel: verzegel(`gho_ux_ai_vault_test_${lade}`, uid, 'oauth'), verlooptOp: Date.now() + 3600_000,
      }, lade);
    }
    schrijfKeten({
      cursor: { name: 'Cursor', enabled: true, defaultMode: { kind: 'always' }, capabilities: {} },
    });

    const allesSleutels = pasModusToe([], 'alles', ['gebruiker', 'beheer']);
    const cur = await koppelAgent(uid, 'cursor', { kanten: ['gebruiker', 'beheer'], sleutels: allesSleutels });
    const beheerOptie = V2_OPTIES.find((o) => o.kant === 'beheer' && o.status === 'actief' && o.intern && o.intern !== 'v2_whoami')!;
    const beheerCurNaam = toolNaam(beheerOptie, 'cursor');

    let sseCur: { status: number; berichten: string[]; sluit: () => void } | null = null;
    if (poort > 0) {
      sseCur = await httpsSse(poort, '/cursor', cur.accessToken);
      sseSluiters.push(sseCur.sluit);
    }

    // ==================================================================== DEEL 1.1: Cross-subdomein actieve sessie & 1-klik Rij 2 (GEEN 403 TECH_RUIMTE_VEREIST!)
    // Start technische sessie op S_admin (admin.tarasevych.com), terwijl S_mcp GEEN tech_ruimte_sessies rij heeft!
    await stapOpVoor(adminSessieId, adminSessieCreated);
    const startOpAdmin = await apiPost(cookieAdmin, tabAdmin, 'admin.tarasevych.com', 'admin', '/api/owner/hub/tech/ruimtes/starten', {
      modus: 'tot-technisch-einde', reden: 'Gestart op admin.tarasevych.com',
    });
    check('Deel 1.1a: technische sessie gestart op S_admin (admin.tarasevych.com)', startOpAdmin.status === 200);

    // Wis AI-delegatie op S_admin (precies de live situatie uit Probleem 1: technische sessie op admin.* actief,
    // maar nog geen app.tech_ruimte_ai-rij, en S_mcp heeft zelf GEEN tech_ruimte_sessies rij!)
    await sys.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = $1', [uid]);

    // Controleer via echte HTTP /api/owner/connector-v2/overzicht op S_mcp dat profileSessionActive === true maar aiSessionDelegationActive === false
    const ovCross = await apiPost(cookieMcp, tabMcp, 'mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/overzicht', {});
    const diagCross = (ovCross.data?.agenten ?? []).find((a: any) => a.slug === 'cursor')?.diagnose;
    check('Deel 1.1b: overzicht op S_mcp herkent actieve sessie van S_admin (profileSessionActive=true, denialCode=AI_NIET_TOEGESTAAN)',
      Boolean(diagCross && diagCross.profileSessionActive === true && diagCross.aiSessionDelegationActive === false && diagCross.denialCode === 'AI_NIET_TOEGESTAAN'),
      JSON.stringify(diagCross));

    // Roep nu vanuit S_mcp (ZONDER eigen tech-sessierij!) 1-klik /api/owner/connector-v2/activeer-tech aan (zoals Rij 2 doet)!
    await stapOpVoor(mcpSessieId, mcpSessieCreated);
    const activeerCross = await apiPost(cookieMcp, tabMcp, 'mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/activeer-tech', {
      agent: 'cursor', actie: 'alles-aan', verbindingId: cur.grantId, termijn: 'tot-technisch-einde',
    });
    check('Deel 1.1c (GEEN 403 TECH_RUIMTE_VEREIST!): 1-klik activeer-tech vanuit S_mcp neemt actieve sessie over en delegeert (HTTP 200)',
      activeerCross.status === 200 && activeerCross.data?.ok === true, JSON.stringify(activeerCross));

    const toolsVolledig = await lijstTools('cursor', cur.accessToken);
    const volledigAantal = toolsVolledig.length;
    check('Deel 1.1d: Cursor ziet meteen alle technische tools incl. _beheer',
      volledigAantal >= 130 && toolsVolledig.some((t) => t.name === beheerCurNaam), `aantal=${volledigAantal}`);

    // ==================================================================== CHROME E2E VOOR DEEL 1 ÉN DEEL 2
    check('Chrome + OpenSSL + dist/index.html beschikbaar voor echte browser-E2E',
      Boolean(chromePad && poort > 0 && existsSync(join(distDir, 'index.html'))));

    if (chromePad && poort > 0 && existsSync(join(distDir, 'index.html'))) {
      const profielMap = join(werk, 'chrome-profiel');
      chromeProc = spawn(chromePad, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
        '--disable-sync', '--disable-component-update', '--disable-default-apps', '--mute-audio',
        '--window-size=1360,960', '--lang=uk', '--ignore-certificate-errors', '--no-proxy-server',
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

      // Echte WebAuthn Virtual Authenticator in Chrome met onze P-256 root-passkey!
      await cdp.send('WebAuthn.enable', { enableUI: false }, s);
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      }, s);
      await cdp.send('WebAuthn.addCredential', {
        authenticatorId,
        credential: {
          credentialId: pkCredIdStdB64,
          isResidentCredential: true,
          rpId: 'tarasevych.com',
          privateKey: pkPkcs8Base64,
          userHandle: Buffer.from(uid, 'utf8').subarray(0, 32).toString('base64'),
          signCount: 1,
        },
      }, s);

      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', ${JSON.stringify(tabMcp)});`,
      }, s);
      for (const [name, value] of bMcp.jar) {
        for (const hostUrl of [
          'https://id.tarasevych.com/',
          'https://mcp.tarasevych.com/',
          'https://admin.tarasevych.com/',
          'https://github.tarasevych.com/',
          'https://api.tarasevych.com/',
        ]) {
          await cdp.send('Network.setCookie', { name, value, url: hostUrl, secure: true, httpOnly: true, sameSite: 'Lax' }, s);
        }
      }

      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      cdp.on((m) => {
        if (m.sessionId === s && m.method === 'Runtime.exceptionThrown') {
          pageErrors.push(String(m.params?.exceptionDetails?.text || 'exception'));
        }
        if (m.sessionId === s && m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
          const txt = (m.params?.args || []).map((a: any) => String(a?.value ?? a?.description ?? '')).join(' ');
          if (!/favicon|Failed to load resource|extension-version\.json|Service Worker/i.test(txt)) consoleErrors.push(txt);
        }
      });

      const evalJs = async <T = any>(expr: string, awaitPromise = false): Promise<T> => {
        const r = await cdp!.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, s);
        if (r?.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.text}`);
        return r?.result?.value as T;
      };
      const wachtOp = async <T = any>(naam: string, expr: string, ms = 18_000): Promise<T> => {
        const eind = Date.now() + ms;
        while (Date.now() < eind) {
          try { const v = await evalJs<T>(expr); if (v) return v; } catch { /* wacht */ }
          await slaap(150);
        }
        const diagDebug = await evalJs<string>(`(() => JSON.stringify({
          href: location.href,
          diag: document.querySelector('[data-agent-diagnose]')?.getAttribute('data-agent-diagnose') || null,
          zichtbaar: document.querySelector('[data-agent-zichtbaar-echt]')?.getAttribute('data-agent-zichtbaar-echt') || null,
          melding: document.querySelector('[data-diagnose-melding]')?.textContent || null,
          v2Melding: document.querySelector('.v2-melding')?.textContent || null,
          alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent).join(' | '),
        }))()`).catch(() => '?');
        throw new Error(`Chrome time-out op ${naam} — ${diagDebug}`);
      };
      const zetReactWaarde = async (selector: string, waarde: string) => {
        await evalJs(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element niet gevonden: ' + ${JSON.stringify(selector)});
          const proto = el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : el.tagName === 'SELECT'
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter ? setter.call(el, ${JSON.stringify(waarde)}) : (el.value = ${JSON.stringify(waarde)});
          el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
          if (el.tagName !== 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
      };

      // ------------------------------------------------------------------ Chrome Deel 1.1e: 0-sessie + dienst UIT → 1-klik Rij 2 werkt in Chrome!
      await apiPost(cookieAdmin, tabAdmin, 'admin.tarasevych.com', 'admin', '/api/owner/hub/tech/ruimtes/beeindigen', {});
      await apiPost(cookieMcp, tabMcp, 'mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/beeindigen', {});
      await rs.dienstZetten(uid, 'ai', 'ontkoppel', { actorId: uid, stapOpGedaan: false });
      await stapOpVoor(mcpSessieId, mcpSessieCreated);

      await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/agents#agent/cursor' }, s);
      await wachtOp('Rij 2 knop zichtbaar zelfs zonder actieve tech-sessie',
        `Boolean(document.querySelector('[data-diagnose-actie="zet_ai_sessie_einde"]'))`);

      await evalJs(`document.querySelector('[data-diagnose-actie="zet_ai_sessie_einde"]').click()`);
      await wachtOp('1-klik Rij 2 start tech-sessie + zet ai-dienst aan + delegeert → OK',
        `document.querySelector('[data-agent-diagnose]')?.getAttribute('data-agent-diagnose') === 'OK'`);
      check('Chrome Deel 1.1e: Rij 2 («Дозволити до кінця сеансу») activeert vanuit NUL-sessie + uitgeschakelde dienst in 1 klik alles naar OK!', true);

      // ------------------------------------------------------------------ Chrome Deel 1.2: In-place Rij 4 Passkey-ondertekening op #agent/cursor (geen redirect naar admin/ai!)
      schrijfKeten({
        claude: { name: 'Claude', enabled: true, defaultMode: { kind: 'ask' }, capabilities: {} },
      });
      if (sseCur) sseCur.berichten.length = 0;

      await cdp.send('Page.reload', {}, s);
      await wachtOp('Rij 4 toont BELEID_AGENT_ONBEKEND en in-place Passkey-knop',
        `document.querySelector('[data-agent-diagnose]')?.getAttribute('data-agent-diagnose') === 'BELEID_AGENT_ONBEKEND' && Boolean(document.querySelector('[data-diagnose-actie="onderteken_ai_beleid"]'))`);

      const rij4Tekst = await evalJs<string>(`document.querySelector('[data-diagnose-actie="onderteken_ai_beleid"]')?.textContent || ''`);
      check('Chrome Deel 1.2a: Rij 4 toont primaire knop «Додати Cursor у Доступ ШІ та підписати Passkey»',
        rij4Tekst.includes('Додати Cursor у Доступ ШІ та підписати Passkey'), rij4Tekst);

      // Klik op de in-place Passkey-knop! Chrome's Virtual WebAuthn Authenticator tekent met origin https://mcp.tarasevych.com,
      // de browser controleert WYSIWYS beleidHash, en onze watcher draait goedkeur-hulp.mjs verwerk!
      await evalJs(`document.querySelector('[data-diagnose-actie="onderteken_ai_beleid"]').click()`);
      await wachtOp('In-place Passkey-ondertekening zet diagnose op OK en geeft alle tools vrij',
        `document.querySelector('[data-agent-diagnose]')?.getAttribute('data-agent-diagnose') === 'OK' && Number(document.querySelector('[data-agent-zichtbaar-echt]')?.getAttribute('data-agent-zichtbaar-echt') || '0') >= ${volledigAantal}`,
        22_000);

      const huidigeHost = await evalJs<string>(`window.location.hostname + window.location.hash`);
      const zichtbaarDomRij4 = Number(await evalJs<string>(`document.querySelector('[data-agent-zichtbaar-echt]')?.getAttribute('data-agent-zichtbaar-echt') || '0'`));
      const standNaRij4 = await leesStand();
      const toolsNaRij4 = await lijstTools('cursor', cur.accessToken);
      check('Chrome Deel 1.2b: GEEN redirect naar admin.tarasevych.com — bleef op mcp.tarasevych.com#agent/cursor, keten seq=1 met cursor en alle tools incl. _beheer open',
        huidigeHost === 'mcp.tarasevych.com#agent/cursor'
        && standNaRij4.staat === 'geldig'
        && standNaRij4.beleid.seq === 1
        && Boolean(standNaRij4.beleid.agents.cursor?.enabled)
        && toolsNaRij4.length === zichtbaarDomRij4
        && toolsNaRij4.length >= volledigAantal
        && toolsNaRij4.some((t) => t.name === beheerCurNaam),
        `${huidigeHost} / seq=${standNaRij4.staat === 'geldig' ? standNaRij4.beleid.seq : standNaRij4.staat} / tools=${toolsNaRij4.length} (dom=${zichtbaarDomRij4})`);

      if (sseCur) {
        await slaap(250);
        check('Chrome Deel 1.2c: SSE notifications/tools/list_changed direct verstuurd na in-place Passkey-ondertekening',
          sseCur.berichten.join('').includes('notifications/tools/list_changed'));
      }

      // ------------------------------------------------------------------ Chrome Deel 1.3: Gecombineerde 1-actie rechtenactivatie («Зберегти й активувати (Passkey)»)
      // Zet smalle rechten op actieve grant + wachtende voorkeur (herverbinden=true) + verwijder cursor weer uit keten.json + trek tech-delegatie in:
      // EÉN klik op [data-v2-bewaar="cursor"] moet ALLE DRIE in één actie met één Passkey herstellen!
      await sys.query(
        `UPDATE app.connector_v2_rechten SET kanten = ARRAY['gebruiker'], sleutels = $2 WHERE grant_id = $1`,
        [cur.grantId, STANDAARD().slice(0, 2)],
      );
      await v2st.zetVoorkeur(uid, 'cursor', { kanten: ['gebruiker', 'beheer'], sleutels: allesSleutels }, true);
      await apiPost(cookieMcp, tabMcp, 'mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/activeer-tech', {
        agent: 'cursor', actie: 'delegatie-uit', verbindingId: cur.grantId,
      });
      schrijfKeten({
        claude: { name: 'Claude', enabled: true, defaultMode: { kind: 'ask' }, capabilities: {} },
      });

      await cdp.send('Page.reload', {}, s);
      await wachtOp('Gecombineerde 1-actie knop «Зберегти й активувати (Passkey)» zichtbaar',
        `Boolean(document.querySelector('[data-v2-bewaar="cursor"]')) && (document.querySelector('[data-v2-bewaar="cursor"]')?.textContent || '').includes('Зберегти й активувати (Passkey)')`);

      await evalJs(`document.querySelector('[data-v2-bewaar="cursor"]').click()`);
      await wachtOp('1-actie knop werkt tegelijk beleid + actieve grant + tech-delegatie bij naar OK',
        `document.querySelector('[data-agent-diagnose]')?.getAttribute('data-agent-diagnose') === 'OK' && Number(document.querySelector('[data-agent-zichtbaar-echt]')?.getAttribute('data-agent-zichtbaar-echt') || '0') >= ${volledigAantal}`,
        22_000);

      const zichtbaarDom1Actie = Number(await evalJs<string>(`document.querySelector('[data-agent-zichtbaar-echt]')?.getAttribute('data-agent-zichtbaar-echt') || '0'`));
      const voorkeurNa1Actie = await v2st.leesVoorkeur(uid, 'cursor');
      const toolsNa1Actie = await lijstTools('cursor', cur.accessToken);
      check('Chrome Deel 1.3: «Зберегти й активувати (Passkey)» zet in ÉÉN actie keten seq=1, herverbinden=false op hetzelfde OAuth-token én tech-delegatie AAN',
        voorkeurNa1Actie?.herverbinden === false
        && toolsNa1Actie.length === zichtbaarDom1Actie
        && toolsNa1Actie.length >= volledigAantal
        && toolsNa1Actie.some((t) => t.name === beheerCurNaam));

      // Verifieer PR #17 ruimtescheiding nog steeds waterdicht: zet kanten op ['gebruiker'] alleen → _beheer verdwijnt!
      await apiPost(cookieMcp, tabMcp, 'mcp.tarasevych.com', 'mcp', '/api/owner/connector-v2/wijzig', {
        agent: 'cursor', kanten: ['gebruiker'], sleutels: STANDAARD(),
      });
      const toolsAlleenGebruiker = await lijstTools('cursor', cur.accessToken);
      check('Deel 1.4 (PR #17 ruimtescheiding behouden): agent met alleen kant=gebruiker ziet GEEN _beheer tools',
        !toolsAlleenGebruiker.some((t) => t.name === beheerCurNaam));

      // ================================================================== Chrome Deel 2: Geünificeerde «Сховище секретів» op github.*, api.* en admin.*
      // Sluit eerst de technische sessie zodat github.*/accounts in de gewone persoonlijke ruimte opent (zonder RUIMTE_GESLOTEN op dienst github)
      await apiPost(cookieMcp, tabMcp, 'mcp.tarasevych.com', 'mcp', '/api/owner/hub/tech/ruimtes/beeindigen', {});
      await koppelingWissen(uid, 'oauth', 'prive');
      await stapOpVoor(mcpSessieId, mcpSessieCreated);

      await cdp.send('Page.navigate', { url: 'https://github.tarasevych.com/accounts' }, s);
      await wachtOp('GitHub KoppelKaart geladen en hoofdknop klikbaar op github.tarasevych.com/accounts',
        `Boolean(document.querySelector('[data-gh-hoofd-actie="1"]:not([disabled])'))`);

      // Klik op «Підключити» → opent in-place [data-venster="gh-kluis-venster"] ZONDER weg te navigeren van github.tarasevych.com!
      await evalJs(`document.querySelector('[data-gh-hoofd-actie="1"]').click()`);
      await wachtOp('In-place kluisvenster [data-venster="gh-kluis-venster"] geopend met github-oauth voorgeselecteerd',
        `Boolean(document.querySelector('[data-venster="gh-kluis-venster"] [data-kluis-doel="github-oauth"]'))`);

      const ghModalStaat = await evalJs<{
        host: string;
        homepageUrl: string;
        callbackUrl: string;
        heeftClientId: boolean;
        heeftClientSecret: boolean;
        extraIngeklapt: boolean;
        aantalDoelen: number;
        knopTekst: string;
      }>(`(() => ({
        host: window.location.hostname,
        homepageUrl: document.querySelector('[data-kluis-url="homepage"]')?.value || '',
        callbackUrl: document.querySelector('[data-kluis-url="callback"]')?.value || '',
        heeftClientId: Boolean(document.querySelector('[data-kluis-veld="client-id"]')),
        heeftClientSecret: Boolean(document.querySelector('[data-kluis-veld="client-secret"]')),
        extraIngeklapt: document.querySelector('[data-kluis-extra="1"]')?.open === false,
        aantalDoelen: document.querySelectorAll('select[data-kluis-veld="doel"] option').length,
        knopTekst: document.querySelector('[data-kluis-opslaan="1"]')?.textContent || '',
      }))()`);

      check('Chrome Deel 2.1 (github.tarasevych.com/accounts in-place modal): blijft op github.tarasevych.com, toont Homepage URL + Redirect URI, aparte Client ID & Client Secret, 17 doelen en ingeklapte «Додаткові параметри»',
        ghModalStaat.host === 'github.tarasevych.com'
        && ghModalStaat.homepageUrl === 'https://github.tarasevych.com'
        && ghModalStaat.callbackUrl === 'https://github.tarasevych.com/api/owner/github/oauth/callback'
        && ghModalStaat.heeftClientId
        && ghModalStaat.heeftClientSecret
        && ghModalStaat.extraIngeklapt
        && ghModalStaat.aantalDoelen === 17
        && ghModalStaat.knopTekst.includes('Зберегти зашифровано (Passkey)'),
        JSON.stringify(ghModalStaat));

      // Dien ongeldige Client ID in → specifieke Oekraïense inline fout bij Client ID, geen blinde «відхилено: помилка»!
      await zetReactWaarde('[data-kluis-veld="client-id"]', 'x');
      await zetReactWaarde('[data-kluis-veld="client-secret"]', 'ghs_GeldigGeheim1234567890');
      await evalJs(`document.querySelector('[data-kluis-opslaan="1"]').click()`);
      await wachtOp('Specifieke inline Oekraïense veldfout onder Client ID',
        `Boolean(document.querySelector('[data-kluis-fout="clientId"]'))`);
      const foutTekstClientId = await evalJs<string>(`document.querySelector('[data-kluis-fout="clientId"]')?.textContent || ''`);
      check('Chrome Deel 2.2 (specifieke inline Oekraïense fout): toont exacte Client ID-uitleg direct onder het veld',
        foutTekstClientId.includes('Client ID') && !foutTekstClientId.includes('Спробу дії з секретом відхилено'),
        foutTekstClientId);

      // Vul nu geldige Client ID + Client Secret in en sla versleuteld op!
      await stapOpVoor(mcpSessieId, mcpSessieCreated);
      await zetReactWaarde('[data-kluis-veld="client-id"]', 'Ov23liChromeTest98765');
      await zetReactWaarde('[data-kluis-veld="client-secret"]', 'ghs_ChromeTestClientSecretValue987654321');
      await evalJs(`document.querySelector('[data-kluis-opslaan="1"]').click()`);
      await wachtOp('Modal sluit na opslaan en hoofdknop springt naar «Увійти через GitHub» (oauthKlaar=true!)',
        `!document.querySelector('[data-venster="gh-kluis-venster"]') && (document.querySelector('[data-gh-hoofd-actie="1"]')?.textContent || '').includes('Увійти через GitHub')`);

      const ontsleuteld = await alsSysteem(() => readOwnerVaultPlaintext(uid, 'github-oauth', 'github-oauth'));
      const gelezenOauth = leesOauthApp(ontsleuteld);
      check('Chrome Deel 2.3 (AES-256-GCM opslag + leesOauthApp): kluis bewaart versleuteld geheim en KoppelKaart herkent oauthKlaar direct',
        gelezenOauth?.clientId === 'Ov23liChromeTest98765'
        && gelezenOauth?.clientSecret === 'ghs_ChromeTestClientSecretValue987654321');

      // ------------------------------------------------------------------ Chrome Deel 2.4: api.tarasevych.com/kluis?doel=github-app
      // api.* en admin.* zijn technische diensten (niet in publicServiceIds), dus start technische sessie op deze browsersessie:
      await stapOpVoor(mcpSessieId, mcpSessieCreated);
      await apiPost(cookieMcp, tabMcp, 'api.tarasevych.com', 'api', '/api/owner/hub/tech/ruimtes/starten', {
        modus: 'tot-technisch-einde', reden: 'Chrome Deel 2.4..2.6 op api.* en admin.*',
      });
      await cdp.send('Page.navigate', { url: 'https://api.tarasevych.com/kluis?doel=github-app' }, s);
      await wachtOp('api.tarasevych.com/kluis opent met ?doel=github-app voorgeselecteerd',
        `Boolean(document.querySelector('[data-kluis-doel="github-app"]'))`);

      const apiKluisStaat = await evalJs<{
        heeftAppId: boolean;
        heeftPem: boolean;
        aantalDoelen: number;
        extraIngeklapt: boolean;
      }>(`(() => ({
        heeftAppId: Boolean(document.querySelector('[data-kluis-veld="app-id"]')),
        heeftPem: Boolean(document.querySelector('[data-kluis-veld="private-key"]')),
        aantalDoelen: document.querySelectorAll('select[data-kluis-veld="doel"] option').length,
        extraIngeklapt: document.querySelector('[data-kluis-extra="1"]')?.open === false,
      }))()`);
      check('Chrome Deel 2.4 (api.tarasevych.com/kluis?doel=github-app): zelfde canonieke formulier met 17 doelen, App ID + Private Key (PEM) en ingeklapte extra parameters',
        apiKluisStaat.heeftAppId && apiKluisStaat.heeftPem && apiKluisStaat.aantalDoelen === 17 && apiKluisStaat.extraIngeklapt,
        JSON.stringify(apiKluisStaat));

      // Wissel in Chrome naar 'anthropic' → controleer single-token veld met sk-ant-api03-... placeholder
      await zetReactWaarde('select[data-kluis-veld="doel"]', 'anthropic');
      await wachtOp('Formulier wisselt naar anthropic met single-token veld',
        `Boolean(document.querySelector('[data-kluis-doel="anthropic"] [data-kluis-veld="waarde"]'))`);
      const anthropicPlaceholder = await evalJs<string>(`document.querySelector('[data-kluis-veld="waarde"]')?.getAttribute('placeholder') || ''`);
      check('Chrome Deel 2.5 (adaptieve placeholder): anthropic toont sk-ant-api03-... voorbeeld',
        anthropicPlaceholder.includes('sk-ant-api03-'), anthropicPlaceholder);

      // ------------------------------------------------------------------ Chrome Deel 2.6: admin.tarasevych.com/contour gebruikt exact dezelfde canonieke component
      await cdp.send('Page.navigate', { url: 'https://admin.tarasevych.com/contour' }, s);
      await wachtOp('admin.tarasevych.com/contour geladen met klikbare [data-gm-toevoegen]',
        `Boolean(document.querySelector('[data-gm-toevoegen]:not([disabled])'))`);
      await evalJs(`document.querySelector('[data-gm-toevoegen]').click()`);
      await wachtOp('admin/contour toevoegen-modal toont hetzelfde canonieke GeheimFormulier met 17 doelen',
        `document.querySelectorAll('[data-venster="gm-toevoegen"] select[data-kluis-veld="doel"] option').length === 17`);
      check('Chrome Deel 2.6 (admin.tarasevych.com/contour): exact dezelfde canonieke GeheimFormulier-component met alle 17 doelen actief op alle 3 oppervlakken', true);

      check('Chrome Deel 2.7 (foutloos in browser): 0 onverwachte JS pageErrors en 0 console.error',
        pageErrors.length === 0 && consoleErrors.length === 0,
        `pageErrors=${pageErrors.join('; ')} | consoleErrors=${consoleErrors.join('; ')}`);
    }
  } finally {
    watcherActief = false;
    await watcherLus.catch(() => undefined);
    for (const sluit of sseSluiters) sluit();
    if (cdp) cdp.sluit();
    if (chromeProc) {
      const wachtExit = new Promise<void>((r) => {
        const t = setTimeout(r, 1500);
        chromeProc!.once('close', () => { clearTimeout(t); r(); });
      });
      try { chromeProc.kill(); } catch { /* al gestopt */ }
      await wachtExit;
    }
    if (tlsServer) await new Promise<void>((r) => tlsServer!.close(() => r()));
    G.herstel();

    if (uid) {
      await trk.bijIntrekken(uid, 'zelf').catch(() => undefined);
      await koppelingWissen(uid, 'oauth', 'prive').catch(() => undefined);
      await koppelingWissen(uid, 'oauth', 'technisch').catch(() => undefined);
      await aiDienstOpruimen([uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.passkeys WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.passkey_uitdagingen WHERE user_id = $1', [uid]).catch(() => undefined);
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
      await sys.query("DELETE FROM app.records WHERE data->>'ownerUserId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1", [uid]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
    }
    for (const cid of clients) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE id = $1', [cid]).catch(() => undefined);
    await sys.query(`UPDATE app.feature_flags SET aan = false, gebruikers = '{}' WHERE sleutel = 'tech-ruimtes-v2'`).catch(() => undefined);
    trk._vlagCacheLeeg();
    for (const id of oudeEigenaren) {
      await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl='users' AND id=$1", [id]).catch(() => undefined);
    }

    for (const [k, v] of Object.entries(vorigeEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vergeetCache();
    try { rmSync(werk, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows Chrome lock */ }
  }

  return einde();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ai-kluis-een-plek-20261101.test.ts')) {
  main().then((code) => process.exit(code));
}
