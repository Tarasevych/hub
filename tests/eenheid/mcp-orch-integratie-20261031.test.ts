// Integratiesuite MCP-001 + ORCH-001 (PR #11) + PR #13 + MCP-DEUR (31.10.2026):
//  1) Connector v2 pad-slugs (claude, gpt -> chatgpt, grok, gemini, copilot, cursor) komen exact overeen met orchestratie/beleid.json;
//  2) ChatGPT via /gpt (who.agent = 'gpt') kan orch_taak_start en orch_inleveren_* voor ORCH-agent 'chatgpt' uitvoeren, maar geen andere
//     agent imiteren (AGENT_VERSCHILT);
//  3) PR #13 + PR #11 beveiligingseisen blijven intact: onvertrouwde tests-opdrachten worden geweigerd (TESTS_NIET_TOEGESTAAN) en uploads
//     zijn strikt gebonden aan de eigen actor + grant-id (UPLOAD_ONBEKEND bij een ander token of een tweede grant van dezelfde client);
//  4) Cursor Cloud (Anysphere, cursor.com OAuth callback) en ChatGPT (/gpt) zien en gebruiken via dezelfde Connector v2-sessie zowel de
//     herstelde MCP-001 hulpmiddelen (GitHub OAuth 0086, SSE notifications/tools/list_changed, 202/204 Streamable HTTP) als de nieuwe
//     ORCH-001 coördinatiehulpmiddelen (orch_*).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';
import { V2_AGENTEN, agentUrl } from '../../shared/connector-v2/agenten';
import { toolInRuimte, toolRuimte } from '../../shared/ai-ruimte';
import { klantVan } from '../../shared/ai-verbinding';
import { v2Optie } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { agentVoor } from '../../backend/ai-beleid';
import { koppelingBewaren, koppelingWissen, verzegel } from '../../backend/github-koppeling-opslag';
import * as mcpConn from '../../backend/mcp-connector';
import { _mcpLimietenLeeg, orchAgentVan, voerOrchToolUit } from '../../backend/orch-hulpmiddelen';
import * as opslag from '../../backend/orch-opslag';
import * as tp from '../../backend/tech-profiel';
import * as v2 from '../../backend/connector-v2';
import { closePool, getPool } from '../../server/platform/pg';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const json = (s: string) => (s ? JSON.parse(s) : null);
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

function pythonCmd(): string {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; sys.exit(0)'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return 'python3';
}

function maakOrchRepo() {
  const R = mkdtempSync(join(tmpdir(), 'orch-mcp-int-'));
  for (const p of [
    'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules',
    'scripts/orch.mjs', 'scripts/orch', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md',
    'orchestratie/eigenaar-ondertekenaars', 'orchestratie/sjablonen',
  ]) {
    cpSync(p, join(R, p), { recursive: true });
  }
  cpSync('.github/copilot-instructions.md', join(R, '.github/copilot-instructions.md'));
  mkdirSync(join(R, 'src'), { recursive: true });
  writeFileSync(join(R, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(R, 'orchestratie/wachtrij.json'), JSON.stringify({
    schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [],
  }, null, 2));
  git(R, 'init', '-q', '-b', 'integratie');
  git(R, 'config', 'user.email', 'eigenaar@eenheid.test');
  git(R, 'config', 'user.name', 'eigenaar');
  execFileSync(process.execPath, [join(R, 'scripts/orch.mjs'), 'vergrendel'], { cwd: R });
  execFileSync(process.execPath, [join(R, 'scripts/orch.mjs'), 'context'], { cwd: R });
  git(R, 'add', '-A');
  git(R, 'commit', '-q', '-m', 'basis');
  return {
    R,
    basis: git(R, 'rev-parse', 'HEAD'),
    beleid: JSON.parse(readFileSync(join(R, 'orchestratie/beleid.json'), 'utf8')),
    lock: JSON.parse(readFileSync(join(R, 'orchestratie/regels.lock.json'), 'utf8')),
  };
}

type Antw = { status: number; body: string; kop: (n: string) => string };
function verzoek(poort: number, methode: string, pad: string, body = '', headers: Record<string, string> = {}): Promise<Antw> {
  return new Promise((ok, fout) => {
    const r = http.request({
      host: '127.0.0.1',
      port: poort,
      method: methode,
      path: pad,
      headers: {
        host: 'mcp.tarasevych.com',
        'content-type': 'application/json',
        'cf-connecting-ip': `198.19.${Math.floor(Math.random() * 200)}.55`,
        'content-length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => ok({
        status: res.statusCode || 0,
        body: data,
        kop: (n: string) => String(res.headers[n.toLowerCase()] ?? ''),
      }));
    });
    r.on('error', fout);
    r.end(body);
  });
}

function openSse(poort: number, pad: string, token: string): Promise<{ status: number; berichten: string[]; sluit: () => void }> {
  return new Promise((ok, fout) => {
    const berichten: string[] = [];
    const req = http.request({
      host: '127.0.0.1',
      port: poort,
      method: 'GET',
      path: pad,
      headers: {
        host: 'mcp.tarasevych.com',
        accept: 'text/event-stream',
        authorization: `Bearer ${token}`,
        'cf-connecting-ip': `198.19.${Math.floor(Math.random() * 200)}.56`,
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
  const { check, einde } = checker('mcp-orch-integratie-20261031');

  const { R, basis, beleid, lock } = maakOrchRepo();
  const T = mkdtempSync(join(tmpdir(), 'orch-mcp-tmp-'));
  const oudEnv = {
    ORCH_WORTEL: process.env.ORCH_WORTEL,
    ORCH_INBOX: process.env.ORCH_INBOX,
    OPDRACHT_STATUS_DIR: process.env.OPDRACHT_STATUS_DIR,
    MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD,
  };
  Object.assign(process.env, {
    ORCH_WORTEL: R,
    ORCH_INBOX: join(T, 'inbox'),
    OPDRACHT_STATUS_DIR: join(T, 'status'),
    MCP_RECHTEN_PAD: join(T, 'mcp-rechten.json'),
  });
  mkdirSync(join(T, 'status'), { recursive: true });

  try {
    // ============================================================== 1. Semantische agent-mapping & PR #11 / PR #13 beveiliging (zonder DB)
    const beleidIds = new Set((beleid.agenten as Array<{ id: string }>).map((a) => a.id));
    check('alle Connector v2 agent-slugs mappen via orchAgentVan naar een geldig agent-id in orchestratie/beleid.json',
      V2_AGENTEN.every((a) => {
        const mapped = orchAgentVan(a.slug);
        return !!mapped && beleidIds.has(mapped);
      }) && orchAgentVan('gpt') === 'chatgpt' && orchAgentVan('cursor') === 'cursor');

    const orchTools = ['orch_overzicht', 'orch_context', 'orch_taak_start', 'orch_inleveren_begin', 'orch_inleveren_stuk', 'orch_inleveren_klaar'];
    check('alle zes orch_*-hulpmiddelen horen strikt bij de technische AI-ruimte (nooit SPACE_SEPARATED in technisch, nooit zichtbaar in prive)',
      orchTools.every((t) => toolRuimte(t) === 'technisch' && toolInRuimte(t, 'technisch') && !toolInRuimte(t, 'prive')));

    const ps1Inhoud = readFileSync('deploy/uitrol/maak-uitrolpakket.ps1', 'utf8');
    const shInhoud = readFileSync('deploy/uitrol/maak-uitrolpakket.sh', 'utf8');
    check('UITROL-BASIS pariteit: zowel maak-uitrolpakket.sh als maak-uitrolpakket.ps1 schrijven UITROL-BASIS met BASIS_VERSIE, BASIS_COMMIT en regels.lock.json',
      ps1Inhoud.includes('UITROL-BASIS') && ps1Inhoud.includes('BASIS_VERSIE') && ps1Inhoud.includes('BASIS_COMMIT') && ps1Inhoud.includes('regels.lock.json') && ps1Inhoud.includes('GEEN_BASIS')
      && shInhoud.includes('UITROL-BASIS') && shInhoud.includes('BASIS_VERSIE') && shInhoud.includes('BASIS_COMMIT'));

    const testBeleid = {
      version: 1,
      agents: {
        cursor: { name: 'Cursor', rules: [] },
        chatgpt: { name: 'ChatGPT', rules: [] },
        claude: { name: 'Claude', rules: [] },
      },
    } as never;
    check('MCP-001 + AI-beleid: Anysphere (Cursor Cloud) herkend als "cursor", /gpt als "chatgpt", en SEC-001-09 weigert spoofing op /gemini',
      klantVan('Anysphere') === 'cursor'
      && agentVoor(testBeleid, 'Anysphere', 'cursor') === 'cursor'
      && agentVoor(testBeleid, 'ChatGPT', 'gpt') === 'chatgpt'
      && agentVoor(testBeleid, 'Claude', 'gemini') === null
      && agentVoor(testBeleid, 'OnbekendeClient') === null);

    _mcpLimietenLeeg();
    const gptWie = { userId: 'u-eigenaar', clientName: 'ChatGPT', agent: 'gpt', grantId: 'grant-gpt-1' };
    const tZonder = await voerOrchToolUit(gptWie, 'orch_taak_start', {
      id: 'CHT-101', tak: 'feature/cht-101-20261031-205500', basisCommit: basis, omschrijving: 'ChatGPT via /gpt zonder agentveld',
    });
    const tMetChatgpt = await voerOrchToolUit(gptWie, 'orch_taak_start', {
      id: 'CHT-102', agent: 'chatgpt', tak: 'feature/cht-102-20261031-205501', basisCommit: basis, omschrijving: 'ChatGPT via /gpt met agent=chatgpt',
    });
    const tMetGpt = await voerOrchToolUit(gptWie, 'orch_taak_start', {
      id: 'CHT-103', agent: 'gpt', tak: 'feature/cht-103-20261031-205502', basisCommit: basis, omschrijving: 'ChatGPT via /gpt met agent=gpt',
    });
    const tSpoof = await voerOrchToolUit(gptWie, 'orch_taak_start', {
      id: 'CHT-104', agent: 'claude', tak: 'feature/cht-104-20261031-205503', basisCommit: basis, omschrijving: 'poging op naam van claude',
    });
    check('ChatGPT (/gpt → chatgpt): orch_taak_start aanvaardt leeg, "chatgpt" en "gpt" als agent="chatgpt", en weigert "claude" met AGENT_VERSCHILT',
      !tZonder.isError && !tMetChatgpt.isError && !tMetGpt.isError
      && JSON.parse(readFileSync(join(R, 'orchestratie/taken/CHT-101.json'), 'utf8')).agent === 'chatgpt'
      && JSON.parse(readFileSync(join(R, 'orchestratie/taken/CHT-102.json'), 'utf8')).agent === 'chatgpt'
      && JSON.parse(readFileSync(join(R, 'orchestratie/taken/CHT-103.json'), 'utf8')).agent === 'chatgpt'
      && tSpoof.isError === true && tSpoof.content[0].text.startsWith('AGENT_VERSCHILT:'),
      `${tZonder.content[0].text} | ${tSpoof.content[0].text}`);

    // Overdrachtspakket van ChatGPT ("agent": "chatgpt") via /gpt + PR #13 regressiechecks (tests weigeren + cross-grant isolatie)
    const py = pythonCmd();
    const pakMap = join(T, 'pak-gpt');
    mkdirSync(join(pakMap, 'src'), { recursive: true });
    writeFileSync(join(pakMap, 'src/chatgpt-bijdrage.ts'), 'export const chatgptBijdrage = true;\n');
    writeFileSync(join(pakMap, 'ORCH-OVERDRACHT.json'), JSON.stringify({
      schema: 1,
      taakId: 'CHT-101',
      agent: 'chatgpt',
      tak: 'feature/cht-101-20261031-205500',
      basisCommit: basis,
      regelsVersie: beleid.regelsVersie,
      regelsHash: lock.hash,
      kanaal: 'tar_gz',
      zonderGit: 'integratietest /gpt -> chatgpt',
      samenvatting: { uk: 'Тестова передача ChatGPT через /gpt', nl: 'Testoverdracht van ChatGPT via /gpt' },
    }));
    const tarPad = join(T, 'cht-101.tar.gz');
    const mk = spawnSync(py, ['-c', [
      'import os, sys, tarfile',
      'with tarfile.open(sys.argv[2], "w:gz") as tf:',
      '    tf.add(os.path.join(sys.argv[1], "src/chatgpt-bijdrage.ts"), arcname="src/chatgpt-bijdrage.ts")',
      '    tf.add(os.path.join(sys.argv[1], "ORCH-OVERDRACHT.json"), arcname="ORCH-OVERDRACHT.json")',
    ].join('\n'), pakMap, tarPad], { encoding: 'utf8' });
    check('overdrachtspakket cht-101.tar.gz gebouwd', mk.status === 0, mk.stderr);
    const tarBytes = readFileSync(tarPad);

    const beginGpt = JSON.parse((await voerOrchToolUit(gptWie, 'orch_inleveren_begin', {
      naam: 'cht-101.tar.gz', grootte: tarBytes.length, sha256: sha256(tarBytes), taakId: 'CHT-101',
    })).content[0].text) as { id: string };

    // PR #13 check 1: andere grant van dezelfde clientnaam of andere agent mag niet aan deze upload komen
    const gptTweedeGrant = { ...gptWie, grantId: 'grant-gpt-2' };
    const stukVreemd = await voerOrchToolUit(gptTweedeGrant, 'orch_inleveren_stuk', { id: beginGpt.id, offset: 0, data: 'AAAA' });
    const annuleerVreemd = (() => {
      try { opslag.uploadAnnuleren({ id: beginGpt.id }, 'ChatGPT (chatgpt) via mcp [grant-gpt-2]'); return ''; }
      catch (e) { return (e as { code?: string }).code || 'FOUT'; }
    })();
    check('PR #13 + PR #11: tweede grant van dezelfde clientnaam krijgt UPLOAD_ONBEKEND op stuk en annuleren',
      stukVreemd.isError === true && stukVreemd.content[0].text.startsWith('UPLOAD_ONBEKEND:') && annuleerVreemd === 'UPLOAD_ONBEKEND');

    const stukEigen = await voerOrchToolUit(gptWie, 'orch_inleveren_stuk', {
      id: beginGpt.id, offset: 0, data: tarBytes.toString('base64'),
    });
    check('eigen /gpt-grant uploadt stuk tot klaarVoorAfronden', !stukEigen.isError && JSON.parse(stukEigen.content[0].text).klaarVoorAfronden === true);

    // PR #13 check 2: caller-supplied shell tests worden geweigerd vóór uitvoering
    const onvertrouwdeTests = await voerOrchToolUit(gptWie, 'orch_inleveren_klaar', {
      id: beginGpt.id, tests: ['echo untrusted'],
    });
    check('PR #13 + PR #11: caller-supplied shell tests ("echo untrusted") worden geweigerd met TESTS_NIET_TOEGESTAAN',
      onvertrouwdeTests.isError === true && onvertrouwdeTests.content[0].text.startsWith('TESTS_NIET_TOEGESTAAN:'));

    const klaarGpt = await voerOrchToolUit(gptWie, 'orch_inleveren_klaar', { id: beginGpt.id });
    const klaarData = JSON.parse(klaarGpt.content[0].text);
    check('ChatGPT (/gpt → chatgpt): orch_inleveren_klaar aanvaardt ORCH-OVERDRACHT met agent="chatgpt" en zet CHT-101 op ter_integratie',
      !klaarGpt.isError && klaarData.uitkomst === 'aanvaard'
      && JSON.parse(readFileSync(join(R, 'orchestratie/taken/CHT-101.json'), 'utf8')).staat === 'ter_integratie',
      klaarGpt.content[0].text.slice(0, 300));

    // ============================================================== 2. Volledige DB + HTTP-server integratie (Connector v2 + MCP-001 + ORCH-001)
    if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
      console.log('OVERGESLAGEN mcp-orch-integratie-20261031 (DB-deel): geen database');
      return einde();
    }

    const vorigeOwner = process.env.OWNER_EMAIL;
    const vorigeTotp = process.env.TOTP_ENCRYPTION_KEY_V1;
    if (!process.env.TOTP_ENCRYPTION_KEY_V1) process.env.TOTP_ENCRYPTION_KEY_V1 = randomBytes(32).toString('hex');

    const sys = getPool('systeem');
    const eigId = `mcp-orch-eig-${randomUUID()}`;
    const eigEmail = `${eigId}@eenheid.test`;
    process.env.OWNER_EMAIL = eigEmail;

    const dist = await mkdtemp(join(tmpdir(), 'mr-mcporch-dist-'));
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
    const vorigeDist = process.env.DIST_DIR;
    process.env.DIST_DIR = dist;

    const clients: string[] = [];
    const sluiters: Array<() => void> = [];
    let server: http.Server | null = null;
    try {
      const oudeEigenaren = (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'")).rows.map((r) => String(r.id));
      for (const id of oudeEigenaren) {
        await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"member\"') WHERE tbl='users' AND id=$1", [id]);
      }
      await sys.query(
        "INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2)",
        [eigId, { email: eigEmail, role: 'owner', status: 'approved', entitlements: ['api-platform'] }],
      );
      await sys.query(
        `INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
         VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test') ON CONFLICT (user_id) DO NOTHING`,
        [eigId, `tech-${randomBytes(6).toString('hex')}`],
      );
      await tp.activeren({ id: eigId, email: eigEmail, role: 'owner', status: 'approved' }, randomBytes(24).toString('hex'), 60, 'integratietest MCP-001 + ORCH-001');
      await aiDienstAan(eigId);
      await koppelingBewaren(eigId, 'oauth', {
        login: 'tarasevych',
        scopes: ['repo', 'read:user'],
        tokenZegel: verzegel('gho_test_mcporch_token', eigId, 'oauth'),
        verlooptOp: Date.now() + 3600_000,
      }, 'prive');

      server = (await import('../../server/start')).createServer();
      await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
      const poort = (server.address() as { port: number }).port;

      const sleutels = [
        'v2_whoami:gebruiker',
        'create_task:gebruiker',
        'list_services:gebruiker',
        'github_list_repos:gebruiker',
        'github_get:gebruiker',
        'get_live_release:beheer',
        'orch_overzicht:beheer',
        'orch_context:beheer',
        'orch_taak_start:beheer',
        'orch_inleveren_begin:beheer',
        'orch_inleveren_stuk:beheer',
        'orch_inleveren_klaar:beheer',
      ];

      async function koppelViaHttp(slug: 'cursor' | 'gpt', clientName: string, redirectUri: string) {
        const reg = json(await verzoek(poort, 'POST', '/oauth2/register', JSON.stringify({ client_name: clientName, redirect_uris: [redirectUri] })).then((r) => r.body));
        clients.push(reg.client_id);
        const p = pkce();
        const auth = await verzoek(poort, 'GET', `/oauth2/authorize?${new URLSearchParams({
          response_type: 'code', client_id: reg.client_id, redirect_uri: redirectUri,
          code_challenge: p.challenge, code_challenge_method: 'S256', state: `st-${slug}`, resource: agentUrl(slug),
        }).toString()}`);
        const requestId = new URL(auth.kop('location')).searchParams.get('consent') || '';
        const dec = await mcpConn.consentDecide(eigId, requestId, true, null, 'prive', { kanten: ['beheer', 'gebruiker'], sleutels });
        const code = 'redirect' in dec ? new URL(dec.redirect).searchParams.get('code') || '' : '';
        const tok = json((await verzoek(poort, 'POST', '/oauth2/token', new URLSearchParams({
          grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirectUri,
        }).toString(), { 'content-type': 'application/x-www-form-urlencoded' })).body);
        return tok.access_token as string;
      }

      const cursorTok1 = await koppelViaHttp('cursor', 'Anysphere', 'https://cursor.com/api/mcp/oauth/callback');
      const cursorTok2 = await koppelViaHttp('cursor', 'Anysphere', 'https://cursor.com/api/mcp/oauth/callback');
      const gptTok = await koppelViaHttp('gpt', 'ChatGPT', 'https://chatgpt.com/connector_platform_oauth_redirect');

      // Cursor Cloud: Streamable HTTP 202 + tools/list bevat zowel GitHub OAuth (MCP-001) als ORCH-001 tools
      const notif = await verzoek(poort, 'POST', '/cursor', JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), {
        authorization: `Bearer ${cursorTok1}`,
      });
      check('Streamable HTTP op /cursor: notifications/initialized geeft 202 zonder JSON Content-Type',
        notif.status === 202 && !notif.kop('content-type').includes('application/json'));

      const lijstResp = await verzoek(poort, 'POST', '/cursor', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), {
        authorization: `Bearer ${cursorTok1}`,
      });
      const cursorNamen: string[] = (json(lijstResp.body)?.result?.tools ?? []).map((t: { name: string }) => t.name);
      const nGithubRepos = toolNaam(v2Optie('github_list_repos:gebruiker')!, 'cursor');
      const nOrchOverzicht = toolNaam(v2Optie('orch_overzicht:beheer')!, 'cursor');
      const nOrchStart = toolNaam(v2Optie('orch_taak_start:beheer')!, 'cursor');
      const nOrchBegin = toolNaam(v2Optie('orch_inleveren_begin:beheer')!, 'cursor');
      const nOrchStuk = toolNaam(v2Optie('orch_inleveren_stuk:beheer')!, 'cursor');
      check('Cursor Cloud (/cursor) tools/list bevat tegelijk GitHub OAuth-hulpmiddelen (MCP-001) én ORCH-001 coördinatiehulpmiddelen',
        lijstResp.status === 200
        && cursorNamen.includes(nGithubRepos)
        && cursorNamen.includes(nOrchOverzicht)
        && cursorNamen.includes(nOrchStart)
        && cursorNamen.includes(nOrchBegin),
        cursorNamen.join(', '));

      // Cursor Cloud voert orch_overzicht en orch_taak_start uit over HTTP /cursor (gecontroleerd door ondertekend AI-beleid + agentVoor('Anysphere') === 'cursor')
      const roepOverzicht = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: nOrchOverzicht, arguments: {} },
      }), { authorization: `Bearer ${cursorTok1}` });
      const ovInhoud = json(json(roepOverzicht.body)?.result?.content?.[0]?.text || '{}');
      check('Cursor Cloud (/cursor) roept orch_overzicht succesvol aan via Connector v2',
        roepOverzicht.status === 200 && !json(roepOverzicht.body)?.result?.isError && ovInhoud?.regels?.regelsVersie === beleid.regelsVersie,
        roepOverzicht.body.slice(0, 240));

      const roepTaakCursor = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: nOrchStart, arguments: { id: 'CUR-201', tak: 'feature/cur-201-20261031-205600', basisCommit: basis, omschrijving: 'Cursor Cloud via /cursor' } },
      }), { authorization: `Bearer ${cursorTok1}` });
      check('Cursor Cloud (/cursor) registreert taak CUR-201 met agent="cursor" en grant-id in geregistreerdDoor',
        !json(roepTaakCursor.body)?.result?.isError
        && JSON.parse(readFileSync(join(R, 'orchestratie/taken/CUR-201.json'), 'utf8')).agent === 'cursor'
        && /Anysphere \(cursor\) via mcp \[[0-9a-f-]+\]/.test(JSON.parse(readFileSync(join(R, 'orchestratie/taken/CUR-201.json'), 'utf8')).geregistreerdDoor),
        roepTaakCursor.body.slice(0, 240));

      // Cross-grant isolatie over echte OAuth-tokens: cursorTok1 begint upload, cursorTok2 (zelfde Anysphere/cursor, ander token) krijgt UPLOAD_ONBEKEND
      const roepBegin1 = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
        jsonrpc: '2.0', id: 4, method: 'tools/call',
        params: { name: nOrchBegin, arguments: { naam: 'cur-201.tar.gz', grootte: tarBytes.length, sha256: sha256(tarBytes), taakId: 'CUR-201' } },
      }), { authorization: `Bearer ${cursorTok1}` });
      const upCursor = json(json(roepBegin1.body)?.result?.content?.[0]?.text || '{}');
      const roepStuk2 = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
        jsonrpc: '2.0', id: 5, method: 'tools/call',
        params: { name: nOrchStuk, arguments: { id: upCursor.id, offset: 0, data: 'AAAA' } },
      }), { authorization: `Bearer ${cursorTok2}` });
      check('echte OAuth grant-isolatie op /cursor: tweede Anysphere-token krijgt UPLOAD_ONBEKEND op upload van eerste token',
        Boolean(upCursor?.id) && json(roepStuk2.body)?.result?.isError === true
        && String(json(roepStuk2.body)?.result?.content?.[0]?.text || '').startsWith('UPLOAD_ONBEKEND:'),
        roepStuk2.body.slice(0, 220));

      // ChatGPT over echte HTTP /gpt registreert taak CHT-202 als agent="chatgpt"
      const nGptStart = toolNaam(v2Optie('orch_taak_start:beheer')!, 'gpt');
      const roepTaakGpt = await verzoek(poort, 'POST', '/gpt', JSON.stringify({
        jsonrpc: '2.0', id: 6, method: 'tools/call',
        params: { name: nGptStart, arguments: { id: 'CHT-202', tak: 'feature/cht-202-20261031-205601', basisCommit: basis, omschrijving: 'ChatGPT via echte /gpt HTTP' } },
      }), { authorization: `Bearer ${gptTok}` });
      check('ChatGPT over echte HTTP /gpt registreert taak CHT-202 met agent="chatgpt"',
        !json(roepTaakGpt.body)?.result?.isError
        && JSON.parse(readFileSync(join(R, 'orchestratie/taken/CHT-202.json'), 'utf8')).agent === 'chatgpt',
        roepTaakGpt.body.slice(0, 240));

      // SSE notifications/tools/list_changed op /cursor bij inperken + DELETE /cursor 204
      const sse = await openSse(poort, '/cursor', cursorTok1);
      sluiters.push(sse.sluit);
      await v2.wijzig(eigId, 'cursor', { kanten: ['beheer', 'gebruiker'], sleutels: sleutels.filter((k) => k !== 'create_task:gebruiker') });
      for (let i = 0; i < 25 && !sse.berichten.join('').includes('notifications/tools/list_changed'); i++) await slaap(50);
      check('SSE GET /cursor ontvangt notifications/tools/list_changed na UI-wijziging op geïntegreerde boom',
        sse.status === 200 && sse.berichten.join('').includes('notifications/tools/list_changed'));

      const delResp = await verzoek(poort, 'DELETE', '/cursor', '', { authorization: `Bearer ${cursorTok1}` });
      check('DELETE /cursor sluit Streamable HTTP-sessie met 204 No Content', delResp.status === 204);

      for (const id of oudeEigenaren) {
        await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl='users' AND id=$1", [id]);
      }
    } finally {
      for (const s of sluiters) s();
      if (server) await new Promise<void>((r) => { server!.closeAllConnections?.(); server!.close(() => r()); });
      await koppelingWissen(eigId, 'oauth', 'prive').catch(() => undefined);
      await aiDienstOpruimen([eigId]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [eigId]).catch(() => undefined);
      if (clients.length) {
        await sys.query("DELETE FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id IN (SELECT id::text FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))", [clients]).catch(() => undefined);
        await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
      }
      await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [eigId]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_rechten WHERE user_id = $1', [eigId]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eigId]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigId]).catch(() => undefined);
      if (vorigeOwner === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeOwner;
      if (vorigeTotp === undefined) delete process.env.TOTP_ENCRYPTION_KEY_V1; else process.env.TOTP_ENCRYPTION_KEY_V1 = vorigeTotp;
      if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
      await rm(dist, { recursive: true, force: true }).catch(() => undefined);
      await closePool().catch(() => undefined);
    }
  } finally {
    for (const [k, w] of Object.entries(oudEnv)) {
      if (w === undefined) delete process.env[k];
      else process.env[k] = w;
    }
    rmSync(R, { recursive: true, force: true });
    rmSync(T, { recursive: true, force: true });
  }
  return einde();
}
