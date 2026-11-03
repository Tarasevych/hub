// SEC-001 (31.10.2026): regressie- en verificatiesuite voor alle bevindingen SEC-001-01 t/m SEC-001-16.
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import DOMPurify from 'dompurify';
import { checker } from './hulp/nep-google';
import { adresSoort } from '../../shared/extern-bureaublad';
import { pinnedFetch } from '../../backend/veilige-fetch';
import { _zetHaDns, haVerbinden, veiligAdres, zetVertrouwdeToestellenBron } from '../../backend/huis-adapter-thuis-assistent';
import { koppelBindingKlopt, koppelBindingVoorAanmaken, koppelBindingWissen } from '../../backend/koppel-binding';
import { isPubliek } from '../../server/platform/auth-poort';
import { routeOordeel } from '../../shared/impersonatie';
import { agentRouteVerboden } from '../../backend/agent-namens';
import { denyMutation, isMutationPath, permForPath } from '../../backend/rbac';
import { RECORD_TABELLEN_CLOUD } from '../../backend/ruimte-cloud-agenda';
import { actieVoorPad, onthoudMagVoorPad, onthoudVastleggen, stapOpFout } from '../../backend/stap-op';
import { ontleed } from '../../shared/terminal-opdrachten';
import { agentVoor } from '../../backend/ai-beleid';
import { registerClient } from '../../backend/mcp-connector';
import { _tellerLeeg, som, telAntwoord } from '../../server/platform/antwoord-teller';
import { zekeringOordeel } from '../../backend/beveiliging-schakelaars';
import { clientIp } from '../../server/start';
import { terminalOriginToegestaan } from '../../backend/terminal';
import { ontzegelMetDek, verzegelMetDek } from '../../backend/sleutelkluis';
import { handler } from '../../backend/index';
import { appRolActief, getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { metImpersonatie, metVerzoek, zetGebruiker } from '../../server/platform/context';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import { createAgent, findAgentByTokenHash } from '../../backend/connectors-opslag';
import { sha256 } from '../../backend/connectors-crypto';
import { storage } from '../../server/platform/opslag';
import { accountMeteenWissen } from '../../backend/account-wissen';
import { persoonsgegevensExport } from '../../backend/privacy';

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-001-20261031');

  // ---------------------------------------------------------------- SEC-001-01 & SEC-001-15: dependencies & Mermaid sanitizer
  {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    check('SEC-001-15: dompurify, mermaid, vite en postcss-selector-parser bijgewerkt',
      pkg.dependencies.dompurify === '^3.4.17'
      && pkg.dependencies.mermaid === '^12.2.0'
      && pkg.devDependencies.vite === '^6.4.5'
      && lock.packages?.['node_modules/postcss-selector-parser']?.version === '6.1.5');
    const mermaidBron = readFileSync('src/media/MermaidSchema.tsx', 'utf8');
    check('SEC-001-01: MermaidSchema blokkeert foreignObject, script, animate en xlink:href',
      mermaidBron.includes("'foreignObject'") && mermaidBron.includes("'animate'") && mermaidBron.includes("'xlink:href'"));
    if (typeof (DOMPurify as unknown as { sanitize?: Function }).sanitize === 'function') {
      const schoon = (DOMPurify as unknown as { sanitize: (s: string, c: object) => string }).sanitize(
        '<svg><g><text>OK</text></g><foreignObject><img src=x onerror=alert(1)></foreignObject><script>alert(1)</script><animate attributeName="href" values="javascript:alert(1)"/></svg>',
        { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'animate', 'set', 'animateMotion', 'animateTransform'], FORBID_ATTR: ['xlink:href'] },
      );
      check('SEC-001-01: DOMPurify stript foreignObject/script/animate uit SVG', !/foreignObject|<script|<animate|onerror/i.test(schoon) && schoon.includes('OK'));
    }
  }

  // ---------------------------------------------------------------- SEC-001-02: centrale SSRF-bescherming
  {
    const nietPubliek = [
      '127.0.0.1', '10.77.0.10', '169.254.169.254', '100.64.0.1',
      '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:0:127.0.0.1',
      '2002:7f00:0001::1', '2002:0a4d:000a::1',
      '2001:0000:4136:e378:8000:63bf:3fff:fdd2',
      '64:ff9b::10.0.0.1', '2001:db8::1', '2001:2::1',
    ];
    const fout = nietPubliek.filter((ip) => adresSoort(ip) === 'publiek');
    check(`SEC-001-02: adresSoort weigert alle ${nietPubliek.length} interne/tunnel IPv4/IPv6-vormen`, fout.length === 0, fout.join(', '));
    check('SEC-001-02: publieke IPv4/IPv6 blijven publiek', adresSoort('93.184.216.34') === 'publiek' && adresSoort('2606:4700:4700::1111') === 'publiek');

    const ssrfUrls = [
      'https://[::ffff:7f00:1]/',
      'https://[2002:7f00:1::1]/',
      'https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/',
      'https://[0:0:0:0:0:0:0:1]/',
      'https://169.254.169.254/latest/meta-data/',
    ];
    let geblokkeerd = 0;
    for (const u of ssrfUrls) {
      try { await pinnedFetch(u, {}, { timeoutMs: 500 }); }
      catch (e) { if ((e as Error).message === 'SSRF_ADRES_GEWEIGERD') geblokkeerd += 1; }
    }
    check('SEC-001-02: pinnedFetch blokkeert IPv6-mapped/6to4/Teredo/loopback/IMDS direct', geblokkeerd === ssrfUrls.length, `${geblokkeerd}/${ssrfUrls.length}`);
  }

  // ---------------------------------------------------------------- SEC-001-03: Home Assistant vertrouwde-toestellen-allowlist
  {
    const prevEnv = process.env.HUIS_VERTROUWDE_TOESTELLEN;
    delete process.env.HUIS_VERTROUWDE_TOESTELLEN;
    zetVertrouwdeToestellenBron(async () => []);
    const rOnvertrouwd = await haVerbinden('http://192.168.1.50:8123', 'tok-1234567890');
    check('SEC-001-03: privé LAN-adres zonder allowlist → TOESTEL_NIET_VERTROUWD', !rOnvertrouwd.ok && rOnvertrouwd.fout === 'TOESTEL_NIET_VERTROUWD');

    zetVertrouwdeToestellenBron(async () => ['10.77.0.10', '127.0.0.1', '192.168.1.50']);
    const rHyperv = await haVerbinden('https://10.77.0.10:8123', 'tok-1234567890');
    const rLoop = await haVerbinden('http://127.0.0.1:8123', 'tok-1234567890');
    const rPubHttp = veiligAdres('http://93.184.216.34:8123');
    check('SEC-001-03: Hyper-V beheersubnet (10.77.0.0/24), loopback en publiek HTTP altijd geblokkeerd',
      !rHyperv.ok && rHyperv.fout === 'ADRES_GEWEIGERD'
      && !rLoop.ok && rLoop.fout === 'ADRES_GEWEIGERD'
      && !rPubHttp.ok && rPubHttp.fout === 'ADRES_GEWEIGERD');

    _zetHaDns(async () => ['192.168.1.99']);
    const rRebind = await haVerbinden('https://ha.thuis.example:8123', 'tok-1234567890');
    check('SEC-001-03: DNS-rebinding naar niet-vertrouwd LAN-IP → TOESTEL_NIET_VERTROUWD', !rRebind.ok && rRebind.fout === 'TOESTEL_NIET_VERTROUWD');
    _zetHaDns(null);
    zetVertrouwdeToestellenBron(null);
    if (prevEnv === undefined) delete process.env.HUIS_VERTROUWDE_TOESTELLEN; else process.env.HUIS_VERTROUWDE_TOESTELLEN = prevEnv;
  }

  // ---------------------------------------------------------------- SEC-001-04: OAuth browser-binding cookie & publieke callback
  {
    const sh = sha256('state-abc-123456');
    const anderSh = sha256('state-andere-999');
    const b = koppelBindingVoorAanmaken('koppel', sh, 'user-1');
    check('SEC-001-04: koppel-binding cookie is HttpOnly, Secure, SameSite=Lax',
      b.setCookie.includes('HttpOnly') && b.setCookie.includes('Secure') && b.setCookie.includes('SameSite=Lax'));
    const pair = b.setCookie.split(';')[0];
    check('SEC-001-04: juiste state+user matcht cookie; andere sessie, user of state faalt',
      koppelBindingKlopt({ headers: { cookie: pair } }, 'koppel', sh, 'user-1', b.bindingHash) === true
      && koppelBindingKlopt({ headers: { cookie: pair } }, 'koppel', sh, 'user-2', b.bindingHash) === false
      && koppelBindingKlopt({ headers: { cookie: pair } }, 'koppel', anderSh, 'user-1', b.bindingHash) === false
      && koppelBindingKlopt({ headers: {} }, 'koppel', sh, 'user-1', b.bindingHash) === false
      && koppelBindingWissen('koppel', sh).includes('Max-Age=0'));
    check('SEC-001-04: GET /api/aanmeld/koppel/:aanbieder/terug staat in PUBLIEKE_ROUTES',
      isPubliek('GET /api/aanmeld/koppel/:aanbieder/terug') === true);
  }

  // ---------------------------------------------------------------- SEC-001-05: impersonatie & agent-namens verboden lijsten
  {
    const impVerboden = [
      'POST /api/owner/sleutelkluis/openen',
      'POST /api/owner/tech-ruimtes/overdragen',
      'POST /api/owner/identity/codewoord/instellen',
      'POST /api/aanmeld/koppel/google/start',
      'POST /api/huis/vertrouwde-toestellen',
      'POST /api/owner/session/logout-all',
    ];
    check('SEC-001-05: impersonatie blokkeert sleutelkluis, tech-ruimtes, codewoord, aanmeld, vertrouwde-toestellen, logout-all',
      impVerboden.every((r) => routeOordeel(r, true) === 'IMPERSONATIE_VERBODEN'));

    const agVerboden = [
      'POST /api/owner/identity/codewoord/instellen',
      'POST /api/owner/sleutelkluis/openen',
      'POST /api/owner/tech-ruimtes/stand',
      'POST /api/aanmeld/koppel/microsoft/start',
      'POST /api/huis/vertrouwde-toestellen',
      'POST /api/owner/agents/register',
      'GET /api/owner/agents/ws-ticket',
      'POST /api/owner/session/logout-all',
    ];
    check('SEC-001-05: agent-namens blokkeert codewoord, sleutelkluis, tech-ruimtes, aanmeld, agents/register, ws-ticket, logout-all',
      agVerboden.every((r) => agentRouteVerboden(r)));
  }

  // ---------------------------------------------------------------- SEC-001-06: RBAC, ladePoort('cloud') & RECORD_TABELLEN_CLOUD
  {
    const viewer = { id: 'v1', email: 'kijker@test.invalid', role: 'viewer', status: 'approved', accessLevel: 'limited' };
    check('SEC-001-06: Nederlandse mutatiepaden en foto/cloud/huis writes worden herkend en geweigerd voor viewer',
      isMutationPath('/api/notities/bewaren')
      && isMutationPath('/api/cloud/taken/opslaan')
      && isMutationPath('/api/cloud/mappen/verwijderen')
      && isMutationPath('/api/foto/upload')
      && permForPath('/api/foto/upload') === 'photos.write'
      && denyMutation(viewer, 'workspace.write') !== undefined
      && denyMutation(viewer, 'cloud.write') !== undefined
      && denyMutation(viewer, 'photos.write') !== undefined);
    check('SEC-001-06: overzicht/zoeken/bibliotheek zijn geen mutatiepaden',
      !isMutationPath('/api/notities/overzicht')
      && !isMutationPath('/api/cloud/bestanden/zoeken')
      && !isMutationPath('/api/foto/bibliotheek'));
    check('SEC-001-06: RECORD_TABELLEN_CLOUD bevat cloud vNext en foto-tabellen',
      ['cloud_mappen_v1', 'cloud_taken_v1', 'foto_media_v1', 'foto_albums_v1', 'foto_import_v1'].every((t) => (RECORD_TABELLEN_CLOUD as readonly string[]).includes(t)));
    const idx = readFileSync('backend/index.ts', 'utf8');
    check('SEC-001-06: cloud vNext & foto-dienst hangen achter ladePoort(\'cloud\') en ownerRequireSession zet ruimteVanSessie',
      /ladePoort\('cloud',\s*ownerRequireSession as never,\s*\{[\s\S]*?cloudVnextBestandenRoutes[\s\S]*?fotoDienstRoutes[\s\S]*?cloudVnextIntegratiesRoutes[\s\S]*?cloudVnextTakenRoutes/.test(idx)
      && idx.includes('ruimteVanSessie()'));
  }

  // ---------------------------------------------------------------- SEC-001-07: fail-closed step-up classificatie
  {
    check('SEC-001-07: onbekende en kluis-paden vallen fail-closed onder \'onbekend\', codewoord onder \'wachtwoord\'',
      actieVoorPad('/api/owner/nieuw-gevoelig-eindpunt') === 'onbekend'
      && actieVoorPad('/api/owner/sleutelkluis/openen') === 'onbekend'
      && actieVoorPad('/api/owner/identity/codewoord/instellen') === 'wachtwoord'
      && actieVoorPad('/api/owner/tech/activeren') === 'bevestigen'
      && actieVoorPad('/api/owner/agents/grants') === 'agenten'
      && onthoudMagVoorPad('/api/owner/nieuw-gevoelig-eindpunt') === false
      && onthoudMagVoorPad('/api/owner/sleutelkluis/openen') === false);
  }

  // ---------------------------------------------------------------- SEC-001-08: terminal subcommando's & agent padcontrole
  {
    const app = { allow: ['docker', 'git', 'systemctl', 'node'], powershell: false };
    check('SEC-001-08: onbekende vlaggen vóór subcommando zijn altijd wijzigend',
      ontleed('docker --log-level info rm x', app).soort === 'wijzigend'
      && ontleed('git -C /pad push', app).soort === 'wijzigend'
      && ontleed('systemctl -H ander status x', app).soort === 'wijzigend'
      && ontleed('node -v -e "process.exit(1)"', app).soort === 'wijzigend'
      && ontleed('systemctl --no-pager status mijn-ruimte', app).soort === 'lezend');
    const agentBron = readFileSync('deploy/agent/agent.mjs', 'utf8');
    check('SEC-001-08: deploy/agent/agent.mjs bevat VOOR_SUB_VLAGGEN en controleerArgPaden',
      agentBron.includes('VOOR_SUB_VLAGGEN') && agentBron.includes('controleerArgPaden'));
  }

  // ---------------------------------------------------------------- SEC-001-09: AI-beleid agentVoor & RFC 7591 client_name spoofing
  {
    const nepBeleid = {
      version: 1, seq: 1, prevHash: null, updatedAt: new Date().toISOString(),
      defaults: { unknownAgent: 'deny', unlistedCapability: 'deny' },
      agents: { claude: { name: 'Claude', enabled: true, grants: {} } },
    } as never;
    check('SEC-001-09: v2-slug /gemini kan zich via client_name niet voordoen als Claude',
      agentVoor(nepBeleid, 'Claude', 'gemini') === null
      && agentVoor(nepBeleid, 'Claude', 'claude') === 'claude'
      && agentVoor(nepBeleid, 'Claude', 'onbekend') === 'claude');
  }

  // ---------------------------------------------------------------- SEC-001-11 & SEC-001-12: anonieme 403-immuniteit & app-rol vereiste
  {
    _tellerLeeg();
    const nu = Date.now();
    for (let i = 0; i < 25; i++) telAntwoord(403, nu, { geverifieerd: false });
    const sAnon = som(nu - 1000, nu + 1000);
    check('SEC-001-11: anonieme 403\'s tellen NIET mee voor de OPA 403-piek zekering',
      sAnon.totaal === 25 && sAnon['403'] === 0 && zekeringOordeel('opa-afdwingen', sAnon) === null);
    for (let i = 0; i < 15; i++) telAntwoord(403, nu, { geverifieerd: true });
    const sAuth = som(nu - 1000, nu + 1000);
    check('SEC-001-11: geverifieerde 403\'s tellen WEL mee voor de zekering',
      sAuth['403'] === 15 && zekeringOordeel('opa-afdwingen', sAuth) === '403-piek');
    _tellerLeeg();

    const prevApp = process.env.DATABASE_URL_APP;
    const prevReq = process.env.REQUIRE_SEPARATE_APP_DB_ROLE;
    delete process.env.DATABASE_URL_APP;
    process.env.REQUIRE_SEPARATE_APP_DB_ROLE = '1';
    let wierp = false;
    try { getPool('app'); } catch (e) { wierp = (e as Error).message === 'DATABASE_URL_APP_VEREIST'; }
    if (prevApp === undefined) delete process.env.DATABASE_URL_APP; else process.env.DATABASE_URL_APP = prevApp;
    if (prevReq === undefined) delete process.env.REQUIRE_SEPARATE_APP_DB_ROLE; else process.env.REQUIRE_SEPARATE_APP_DB_ROLE = prevReq;
    check('SEC-001-12: REQUIRE_SEPARATE_APP_DB_ROLE=1 weigert terugval van app-pool op systeemrol', wierp);
  }

  // ---------------------------------------------------------------- SEC-001-14 & SEC-001-16: cookies, clientIp, WS Origin, GCM tag, archief
  {
    const nepEvent = {
      headers: { host: 'hub.tarasevych.com', cookie: 'mr_kapot=%E0%A4%A; mr_ok=1' },
      body: '{}', isBase64Encoded: false as const, rawPath: '/api/_healthcheck', rawQueryString: '', queryStringParameters: {},
      requestContext: { http: { method: 'GET', path: '/api/_healthcheck', sourceIp: '127.0.0.1', userAgent: 'sec-001-test' } },
    };
    const rCookie = await handler(nepEvent as never);
    check('SEC-001-14: ongeldige %-codering in Cookie veroorzaakt geen 500 URIError', rCookie.statusCode < 500);

    const ipSpoof = clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4' }, socket: { remoteAddress: '198.51.100.7' } } as never);
    const ipTunnel = clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4' }, socket: { remoteAddress: '127.0.0.1' } } as never);
    check('SEC-001-14: cf-connecting-ip wordt alleen vanaf loopback vertrouwd', ipSpoof === '198.51.100.7' && ipTunnel === '1.2.3.4');

    check('SEC-001-16: terminal WS weigert vreemde/lege Origin en accepteert eigen https-host',
      terminalOriginToegestaan('https://evil.example', 'mcp.tarasevych.com') === false
      && terminalOriginToegestaan('', 'mcp.tarasevych.com') === false
      && terminalOriginToegestaan('https://mcp.tarasevych.com', 'mcp.tarasevych.com') === true);

    const dek = randomBytes(32);
    const goed = verzegelMetDek(dek, 'geheim-123', 'aad-1');
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', dek, iv);
    c.setAAD(Buffer.from('aad-1', 'utf8'));
    const ct = Buffer.concat([c.update(Buffer.from('geheim-123', 'utf8')), c.final()]);
    const korteTag = c.getAuthTag().subarray(0, 4);
    const vervalst = ['dek1', iv.toString('base64url'), ct.toString('base64url'), korteTag.toString('base64url')].join('.');
    let korteTagGeweigerd = false;
    try { ontzegelMetDek(dek, vervalst, 'aad-1'); } catch { korteTagGeweigerd = true; }
    check('SEC-001-16: sleutelkluis AES-256-GCM vereist 16-byte authTag en opent geldige envelop',
      ontzegelMetDek(dek, goed, 'aad-1') === 'geheim-123' && korteTagGeweigerd);

    check('SEC-001-16: gecommit tar.gz-archief in incoming/ is verwijderd', !existsSync('incoming/mijn-ruimte-20261030-133556.tar.gz'));
  }

  // ---------------------------------------------------------------- Database-integratietests (indien wegwerp-Postgres beschikbaar)
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN (DB-integratie): geen database');
    return einde();
  }

  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const bestaand = (await sys.query("SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0] as { id: string; email: string } | undefined;
  const tijdelijkeEigenaar = !bestaand;
  const eigId = bestaand ? String(bestaand.id) : `sec001-owner-${sfx}`;
  const lidId = `sec001-member-${sfx}`;
  const wisId = `sec001-erase-${sfx}`;
  const impId = randomUUID();
  const tmpOpslag = mkdtempSync(join(tmpdir(), 'sec001-opslag-'));
  // De opslagcode leest UPLOADS_DIR (server/platform/opslag.ts); STORAGE_DIR had hier geen effect en schreef naar /srv/data.
  const prevUploadsDir = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = tmpOpslag;
  const ownerMail = (bestaand ? String(bestaand.email) : String(process.env.OWNER_EMAIL || 'eigenaar@example.invalid')).toLowerCase();

  try {
    check('SEC-001-12: aparte mijnruimte_app DB-rol is actief in de testomgeving', appRolActief());

    if (tijdelijkeEigenaar) {
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)',
        ['users', eigId, JSON.stringify({ email: ownerMail, role: 'owner', status: 'approved' })]);
    }
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)',
      ['users', lidId, JSON.stringify({ email: `lid-${sfx}@test.invalid`, role: 'member', status: 'approved' })]);
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)',
      ['users', wisId, JSON.stringify({ email: `wis-${sfx}@test.invalid`, role: 'member', status: 'approved' })]);

    // 1. SEC-001-09: RFC 7591 registerClient weigert client_name spoofing op vreemde redirect_uri
    const regSpoof = await registerClient(JSON.stringify({
      client_name: 'Claude',
      redirect_uris: ['https://gemini.google.com/oauth/callback'],
    }));
    check('SEC-001-09 (DB): registerClient weigert client_name "Claude" met Gemini redirect_uri', regSpoof.statusCode === 400);

    // 2. SEC-001-07 (DB): onthouden browser (12u) mag NOOIT een onbekend/sleutelkluis-pad overslaan
    const authLid = {
      user: { id: lidId, email: `lid-${sfx}@test.invalid` },
      session: { id: `sess-${sfx}`, createdAt: Date.now() - 20 * 60_000 },
      tabSession: null,
    };
    const totMs = await onthoudVastleggen(authLid);
    const foutAgenten = await stapOpFout(authLid, { onthoud: onthoudMagVoorPad('/api/owner/agents/grants') });
    const foutOnbekend = await stapOpFout(authLid, { onthoud: onthoudMagVoorPad('/api/owner/sleutelkluis/openen') });
    check('SEC-001-07 (DB): 12u-onthouden bevestiging werkt op /agents, maar weigert /sleutelkluis en onbekende paden',
      totMs > Date.now() && foutAgenten === '' && foutOnbekend === 'STEP_UP_REQUIRED');

    // 3. SEC-001-05 (DB): PostgreSQL SET LOCAL transaction_read_only = on blokkeert schrijfacties tijdens alleen-lezen impersonatie
    let roGeblokkeerd = false;
    const roUit1 = await metImpersonatie({ id: impId, door: eigId }, true, async () =>
      metVerzoek('POST /api/proef/ro', async () => {
        zetGebruiker(lidId, 'sessie');
        try {
          await alsGebruiker(lidId, async (q) => {
            await q('INSERT INTO app.mcp_console_items (user_id, kind, title, body) VALUES ($1, $2, $3, $4)', [lidId, 'note', 'verboden', 'x']);
          });
        } catch (e) {
          roGeblokkeerd = (e as Error).message === 'IMPERSONATIE_ALLEEN_LEZEN';
        }
      }),
    );
    let dbAddGeblokkeerd = false;
    const roUit2 = await metImpersonatie({ id: impId, door: eigId }, true, async () =>
      metVerzoek('POST /api/proef/ro-db', async () => {
        zetGebruiker(lidId, 'sessie');
        try { await db.add(`test_sec001_${sfx}`, [{ a: 1 }]); }
        catch (e) { dbAddGeblokkeerd = (e as Error).message === 'IMPERSONATIE_ALLEEN_LEZEN'; }
      }),
    );
    check('SEC-001-05 (DB): transaction_read_only blokkeert zowel alsGebruiker SQL als db.add bij alleen-lezen impersonatie',
      roGeblokkeerd && roUit1.geblokkeerd && dbAddGeblokkeerd && roUit2.geblokkeerd);

    // 4. SEC-001-10 (DB): agent-token stopt onmiddellijk zodra status != approved (bv. pending of blocked)
    const rauwToken = `tvh_sec001_${randomBytes(18).toString('hex')}`;
    const tokenHash = sha256(rauwToken);
    const ag = await createAgent(lidId, 'SEC-001 Agent', 'linux', tokenHash, { fs: true });
    check('SEC-001-10 (DB): agent-token werkt voor approved gebruiker', (await findAgentByTokenHash(tokenHash))?.id === ag.id);
    await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{status}', '"pending"') WHERE tbl = 'users' AND id = $1`, [lidId]);
    check('SEC-001-10 (DB): agent-token geweigerd zodra account niet meer approved is (bv. pending)', (await findAgentByTokenHash(tokenHash)) === null);
    await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{status}', '"approved"') WHERE tbl = 'users' AND id = $1`, [lidId]);

    // 5. SEC-001-13 (DB): eigenaar wordt NIET gewist, lid krijgt volledige wissing incl. fysiek bestand, en AVG-export bevat relationele tabellen
    const eigRijenVoor = (await sys.query('SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id = $1', [eigId])).rows[0]?.n ?? 0;
    const proefItem = (await sys.query('INSERT INTO app.mcp_console_items (user_id, kind, title, body) VALUES ($1, $2, $3, $4) RETURNING id', [eigId, 'note', 'Blijft bestaan', 'ok'])).rows[0]?.id;
    let ownerGeweigerd = false;
    try { await accountMeteenWissen(eigId, ownerMail); } catch (e) { ownerGeweigerd = (e as Error).message === 'OWNER_NIET_WISSEN'; }
    const eigRijenNa = (await sys.query('SELECT count(*)::int AS n FROM app.mcp_console_items WHERE user_id = $1', [eigId])).rows[0]?.n;
    if (proefItem) await sys.query('DELETE FROM app.mcp_console_items WHERE id = $1', [proefItem]).catch(() => undefined);
    check('SEC-001-13 (DB): accountMeteenWissen weigert eigenaar VÓÓR de DELETE-transactie', ownerGeweigerd && eigRijenNa === eigRijenVoor + 1);

    await sys.query('INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md) VALUES ($1, $2, $3, $4)', [wisId, 'prive', 'Mijn notitie', 'AVG test']);
    await storage.write([{ path: `users/${wisId}/proef.txt`, content: 'persoonsgegeven', contentType: 'text/plain', ownerId: wisId }]);
    const exp = await persoonsgegevensExport(wisId);
    check('SEC-001-13 (DB): persoonsgegevensExport bevat app.notities en bestandsmetadata',
      Array.isArray(exp.gegevens['app.notities']) && exp.gegevens['app.notities'].length === 1 && exp.bestanden.length === 1);

    await accountMeteenWissen(wisId, `wis-${sfx}@test.invalid`);
    const naLees = await storage.read([`users/${wisId}/proef.txt`]);
    const naNotities = (await sys.query('SELECT count(*)::int AS n FROM app.notities WHERE user_id = $1', [wisId])).rows[0]?.n;
    check('SEC-001-13 (DB): accountMeteenWissen wist zowel relationele rijen als het fysieke bestand op schijf',
      naNotities === 0 && naLees[0]?.content === null);
  } finally {
    const wisIds = tijdelijkeEigenaar ? [eigId, lidId, wisId] : [lidId, wisId];
    await sys.query('DELETE FROM app.mcp_console_items WHERE user_id = ANY($1::text[])', [wisIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.notities WHERE user_id = ANY($1::text[])', [wisIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1::text[])', [wisIds]).catch(() => undefined);
    await sys.query("DELETE FROM app.mcp_oauth_clients WHERE client_name = 'Claude' AND redirect_uris::text LIKE '%gemini.google.com%'").catch(() => undefined);
    await sys.query('DELETE FROM app.storage_objects WHERE owner_id = ANY($1::text[])', [wisIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1::text[]) OR owner_id = ANY($1::text[]) OR id LIKE $2', [wisIds, `%${lidId}%`]).catch(() => undefined);
    if (prevUploadsDir === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = prevUploadsDir;
    rmSync(tmpOpslag, { recursive: true, force: true });
  }

  return einde();
}
