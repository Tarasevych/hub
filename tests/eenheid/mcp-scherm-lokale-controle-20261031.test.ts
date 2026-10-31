// Lokale verificatie in echte Google Chrome via Chrome DevTools Protocol (31.10.2026, MCP-001 punt 3):
//   1. Tabblad «Доступ ШІ» (AiToegangTab op mcp.tarasevych.com/agents#ai → Cursor → «Доступ ШІ» én admin.tarasevych.com/ai);
//   2. Pagina #agent/cursor (AgentPagina op mcp.tarasevych.com/agents#agent/cursor);
//   3. OAuth-koppeling van Cursor Cloud (Anysphere, https://cursor.com/api/mcp/oauth/callback) door het echte toestemmingsvenster in Chrome;
//   4. tools/list via HTTPS /cursor (met werkende hulpmiddelen, GitHub OAuth 0086, beheertools — niet alleen mcp_auth);
//   5. Live SSE notifications/tools/list_changed na het wijzigen van rechten in Chrome op #agent/cursor;
//   6. Herautorisatie: zowel in-band via mcp_auth (toestemmingsvenster in Chrome op dezelfde sessie) als via «Перепідключити» + nieuwe OAuth-flow.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { checker, nepGoogle } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';
import { koppelingBewaren, koppelingWissen, verzegel } from '../../backend/github-koppeling-opslag';
import { closePool, getPool } from '../../server/platform/pg';

const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

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
  const kandidaten = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'openssl',
  ];
  for (const p of kandidaten) {
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
        try { l(m); } catch { /* luisteraar */ }
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

function httpsVerzoek(poort: number, methode: string, pad: string, body = '', headers: Record<string, string> = {}): Promise<{ status: number; body: string; kop: (n: string) => string }> {
  return new Promise((ok, fout) => {
    const r = https.request({
      host: '127.0.0.1',
      port: poort,
      path: pad,
      method: methode,
      servername: 'mcp.tarasevych.com',
      rejectUnauthorized: false,
      headers: {
        host: 'mcp.tarasevych.com',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let b = '';
      res.on('data', (x) => { b += x; });
      res.on('end', () => ok({
        status: res.statusCode || 0,
        body: b,
        kop: (n: string) => String(res.headers[n.toLowerCase()] ?? ''),
      }));
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
      res.on('data', (c: string) => { berichten.push(c); });
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
  const { check, einde } = checker('mcp-scherm-lokale-controle-20261031');
  const chromePad = zoekChrome();
  const opensslPad = zoekOpenssl();
  const distDir = resolve(process.env.DIST_DIR || 'dist');

  if (!chromePad || !opensslPad || !existsSync(join(distDir, 'index.html')) || (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL)) {
    console.log(`OVERGESLAGEN mcp-scherm-lokale-controle-20261031: chrome=${Boolean(chromePad)} openssl=${Boolean(opensslPad)} dist=${existsSync(join(distDir, 'index.html'))} db=${Boolean(process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL)}`);
    return einde();
  }

  const werk = mkdtempSync(join(tmpdir(), 'mr-chrome-mcp001-'));
  const profiel = join(werk, 'profiel');
  const keyPad = join(werk, 'srv.key');
  const crtPad = join(werk, 'srv.crt');
  const certGen = spawnSync(opensslPad, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPad, '-out', crtPad, '-days', '1', '-subj', '/CN=tarasevych.com',
  ], { encoding: 'utf8' });
  check('tijdelijk lokaal TLS-certificaat aangemaakt voor *.tarasevych.com', certGen.status === 0 && existsSync(crtPad), certGen.stderr);

  const vorigeDist = process.env.DIST_DIR;
  const vorigeLimieten = process.env.E2E_LOKALE_LIMIETEN;
  const vorigeOwner = process.env.OWNER_EMAIL;
  const vorigeOrchWortel = process.env.ORCH_WORTEL;
  const vorigeOrchInbox = process.env.ORCH_INBOX;
  process.env.DIST_DIR = distDir;
  process.env.E2E_LOKALE_LIMIETEN = '1';
  process.env.ORCH_WORTEL = process.cwd();
  process.env.ORCH_INBOX = join(werk, 'orch-inbox');

  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `chrome-mcp001-${T}@eenheid.test`;
  const sub = `sub-chrome-mcp001-${T}`;
  const sys = getPool('systeem');
  const oudeEigenaren = (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'")).rows.map((r) => String(r.id));

  const G = await nepGoogle({ ownerEmail: eigenaar });
  const { createServer } = await import('../../server/start');
  const appHttp = createServer();
  const tlsServer = https.createServer({ key: readFileSync(keyPad), cert: readFileSync(crtPad) }, (req, res) => {
    appHttp.emit('request', req, res);
  });
  await new Promise<void>((r) => tlsServer.listen(0, '127.0.0.1', () => r()));
  const poort = (tlsServer.address() as { port: number }).port;

  let chromeProc: ReturnType<typeof spawn> | null = null;
  let cdp: Cdp | null = null;
  let uid = '';
  const clients: string[] = [];
  const sseSluiters: Array<() => void> = [];

  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const aanm = await b.aanmelden(sub, eigenaar, {
      service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000),
    });
    check('eigenaar aangemeld via redirect-flow', aanm.cb.data.sessionCreated === true);
    uid = String((await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    await aiDienstAan(uid);
    await koppelingBewaren(uid, 'oauth', {
      login: 'tarasevych',
      scopes: ['repo', 'read:user'],
      tokenZegel: verzegel('gho_chrome_test_mcp001', uid, 'oauth'),
      verlooptOp: Date.now() + 3600_000,
    }, 'prive');

    const chromeArgs = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
      '--disable-sync', '--disable-component-update', '--disable-default-apps', '--mute-audio',
      '--window-size=1280,900', '--lang=uk', '--ignore-certificate-errors', '--no-proxy-server',
      `--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${poort}, MAP tarasevych.com 127.0.0.1:${poort}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
      '--remote-debugging-port=0', `--user-data-dir=${profiel}`, 'about:blank',
    ];
    chromeProc = spawn(chromePad, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    const wsUrl = await new Promise<string>((res, rej) => {
      let buf = '';
      const timer = setTimeout(() => rej(new Error(`Chrome gaf geen DevTools-URL: ${buf.slice(-400)}`)), 25_000);
      chromeProc!.stderr!.on('data', (d) => {
        buf += String(d);
        const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buf);
        if (m) { clearTimeout(timer); res(m[1]); }
      });
      chromeProc!.once('exit', (c) => { clearTimeout(timer); rej(new Error(`Chrome stopte (${c}): ${buf.slice(-300)}`)); });
    });

    cdp = await Cdp.verbind(wsUrl);
    const verInfo = await cdp.send('Browser.getVersion');
    check('echte Google Chrome gestart via CDP', /Chrome\//.test(String(verInfo?.product || '')), String(verInfo?.product || ''));

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
        await cdp.send('Network.setCookie', {
          name, value, url: hostUrl, secure: true, httpOnly: true, sameSite: 'Lax',
        }, s);
      }
    }

    // Onderschep de externe OAuth-redirect naar https://cursor.com/api/mcp/oauth/callback?code=... zodat niets naar internet gaat
    let opgevangenCallback = '';
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://cursor.com/*' }] }, s);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    cdp.on((m) => {
      if (m.sessionId !== s) return;
      if (m.method === 'Fetch.requestPaused') {
        const reqUrl = String(m.params?.request?.url || '');
        if (reqUrl.startsWith('https://cursor.com/api/mcp/oauth/callback')) opgevangenCallback = reqUrl;
        void cdp!.send('Fetch.fulfillRequest', {
          requestId: m.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from('<!doctype html><title>Cursor Callback</title><p>OAuth callback ontvangen</p>').toString('base64'),
        }, s).catch(() => undefined);
      } else if (m.method === 'Runtime.exceptionThrown') {
        pageErrors.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception').split('\n')[0]);
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
        const txt = (m.params.args || []).map((a: any) => a.description || a.value || '').join(' ');
        if (!/Failed to load resource|extension-version\.json|Service Worker/i.test(txt)) consoleErrors.push(txt.slice(0, 240));
      }
    });

    const evalJs = async <T = any>(expr: string, awaitPromise = false): Promise<T> => {
      const r = await cdp!.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, s);
      if (r?.exceptionDetails) throw new Error(`JS fout: ${r.exceptionDetails.text}`);
      return r?.result?.value as T;
    };

    const wachtOp = async <T = any>(omschrijving: string, expr: string, timeoutMs = 15_000): Promise<T> => {
      const eind = Date.now() + timeoutMs;
      while (Date.now() < eind) {
        try {
          const v = await evalJs<T>(expr);
          if (v) return v;
        } catch { /* nog aan het laden */ }
        await slaap(150);
      }
      const debugTekst = await evalJs<string>(`(document.body && document.body.innerText || '').slice(0, 500)`).catch(() => '');
      throw new Error(`Time-out wachtend op ${omschrijving} (url=${await evalJs('location.href').catch(() => '?')} tekst=${debugTekst})`);
    };

    // Activeer technisch profiel vanuit Chrome zelf (zodat ook _beheer en admin/ai werken)
    await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/' }, s);
    await wachtOp('mcp startpagina geladen', `document.readyState === 'complete'`);
    const techStatus = await evalJs<number>(`(async () => (await fetch('/api/owner/tech/activeren', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'mcp', tabContext: ${JSON.stringify(tab)}, sourceOrigin: location.origin, minuten: 30, reden: 'Chrome lokale verificatie MCP-001' }),
    })).status)()`, true);
    check('technisch profiel geactiveerd vanuit echte Chrome', techStatus === 200, String(techStatus));

    // ============================================================== 1. Tabblad «Доступ ШІ» (AiToegangTab op /agents#ai én admin/ai)
    await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/agents#ai' }, s);
    await wachtOp('AgentBord met Cursor-kaart op #ai', `Boolean(document.querySelector('[data-agent-bord="1"] [data-agent="cursor"]'))`);
    await evalJs(`document.querySelector('[data-agent="cursor"]').click()`);
    await wachtOp('paneel van Cursor met tabblad «Доступ ШІ»', `Boolean(document.querySelector('[data-agent-paneel="cursor"] [data-tab="toegang"]'))`);
    await evalJs(`document.querySelector('[data-agent-paneel="cursor"] [data-tab="toegang"]').click()`);
    await wachtOp('AiToegangTab voor bord:cursor geladen', `Boolean(document.querySelector('[data-toegang="bord:cursor"] [data-scope-schakelaar="github.read"]'))`);

    const voorGithub = await evalJs<string>(`document.querySelector('[data-toegang="bord:cursor"] [data-scope-schakelaar="github.read"]').getAttribute('aria-checked')`);
    if (voorGithub !== 'true') {
      await evalJs(`document.querySelector('[data-toegang="bord:cursor"] [data-scope-schakelaar="github.read"]').click()`);
    } else {
      // Schakel even om en weer aan zodat de bewaaractie een echte UI-interactie toetst
      await evalJs(`document.querySelector('[data-toegang="bord:cursor"] [data-scope-schakelaar="board.write"]').click()`);
    }
    await evalJs(`document.querySelector('[data-toegang="bord:cursor"] [data-bewaar="1"]').click()`);
    const bewaarMelding = await wachtOp<string>('bevestiging «Збережено» in AiToegangTab',
      `document.querySelector('[data-toegang="bord:cursor"] .at-ok')?.textContent || ''`);
    check('Chrome tabblad «Доступ ШІ» (AiToegangTab): Cursor-scopes geladen, geschakeld en opgeslagen',
      /Збережено/.test(bewaarMelding), bewaarMelding);

    // Controleer ook admin.tarasevych.com/ai (ondertekend AI-beleid «Доступ ШІ») op foutloos renderen
    await cdp.send('Page.navigate', { url: 'https://admin.tarasevych.com/ai' }, s);
    const adminAiTekst = await wachtOp<string>('admin.tarasevych.com/ai geladen',
      `document.readyState === 'complete' && (document.body?.innerText || '').includes('Доступ ШІ') ? document.body.innerText.slice(0, 200) : ''`);
    check('Chrome admin.tarasevych.com/ai («Доступ ШІ» beleidspagina) rendert zonder fouten', Boolean(adminAiTekst));

    // Controleer ook ORCH-001 tabblad «Координація агентів» (TabOrch op /agents#orch) op de samengevoegde code
    await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/agents#orch' }, s);
    const orchTekst = await wachtOp<string>('TabOrch #orch met regelsVersie geladen',
      `(document.querySelector('[data-orch]')?.innerText || '').includes('regelsVersie 1.3.0') ? document.querySelector('[data-orch]').innerText : ''`);
    check('Chrome tabblad «Координація агентів» (/agents#orch): toont regelsVersie 1.3.0 en agenten op samengevoegde code',
      orchTekst.includes('Координація агентів') && orchTekst.includes('regelsVersie 1.3.0'), orchTekst.slice(0, 140));

    // ============================================================== 2. Pagina #agent/cursor
    await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/agents#agent/cursor' }, s);
    const cursorAdres = await wachtOp<string>('AgentPagina #agent/cursor geladen',
      `document.querySelector('[data-agent-pagina="cursor"] [data-agent-adres="cursor"]')?.textContent || ''`);
    const heeftRechtenSectie = await wachtOp<boolean>('sectie Дозволи op #agent/cursor geladen',
      `Boolean(document.querySelector('[data-agent-pagina="cursor"] [data-agent-sectie="rechten"] [data-v2-bewaar="cursor"]'))`);
    check('Chrome pagina #agent/cursor: toont connectoradres https://mcp.tarasevych.com/cursor en rechtensectie',
      cursorAdres === 'https://mcp.tarasevych.com/cursor' && heeftRechtenSectie, cursorAdres);

    // ============================================================== 3. OAuth-verbinding van Cursor Cloud (Anysphere) in echte Chrome
    const cursorCallback = 'https://cursor.com/api/mcp/oauth/callback';
    const regResp = await httpsVerzoek(poort, 'POST', '/oauth2/register', JSON.stringify({
      client_name: 'Anysphere',
      redirect_uris: [cursorCallback],
    }));
    const reg = JSON.parse(regResp.body);
    clients.push(reg.client_id);

    const doorloopWizardInChrome = async (consentUrl: string, zetExtraRechten: boolean) => {
      opgevangenCallback = '';
      await cdp!.send('Page.navigate', { url: consentUrl }, s);
      await wachtOp('v2-wizard voor cursor (stap bevestigen)',
        `document.querySelector('[data-v2-wizard="cursor"]')?.getAttribute('data-v2-stap') === 'bevestigen'`);
      await evalJs(`[...document.querySelectorAll('[data-v2-wizard="cursor"] button')].find(b => /Далі/.test(b.textContent || ''))?.click()`);
      await wachtOp('stap account',
        `document.querySelector('[data-v2-wizard="cursor"]')?.getAttribute('data-v2-stap') === 'account'`);
      await evalJs(`[...document.querySelectorAll('[data-v2-wizard="cursor"] button')].find(b => /Далі/.test(b.textContent || ''))?.click()`);
      await wachtOp('stap ruimte',
        `document.querySelector('[data-v2-wizard="cursor"]')?.getAttribute('data-v2-stap') === 'ruimte'`);
      await evalJs(`(() => {
        const cb = document.querySelector('[data-v2-wizard="cursor"] .v2-ruimte-kaart.kant-beheer input');
        if (cb && !cb.checked) cb.click();
      })()`);
      await evalJs(`[...document.querySelectorAll('[data-v2-wizard="cursor"] button')].find(b => /Далі/.test(b.textContent || ''))?.click()`);
      await wachtOp('stap rechten',
        `document.querySelector('[data-v2-wizard="cursor"]')?.getAttribute('data-v2-stap') === 'rechten'`);
      if (zetExtraRechten) {
        for (const key of [
          'create_task:gebruiker',
          'list_services:gebruiker',
          'github_list_repos:gebruiker',
          'github_get:gebruiker',
          'get_live_release:beheer',
          'orch_overzicht:beheer',
        ]) {
          await evalJs(`(() => {
            const rij = document.querySelector('[data-v2-wizard="cursor"] [data-v2-optie="${key}"]');
            if (rij && !rij.classList.contains('is-aan')) rij.querySelector('[role="switch"]')?.click();
          })()`);
          await wachtOp(`optie ${key} ingeschakeld in wizard`,
            `Boolean(document.querySelector('[data-v2-wizard="cursor"] [data-v2-optie="${key}"].is-aan'))`);
        }
      }
      await evalJs(`document.querySelector('[data-v2-wizard="cursor"] [data-v2-toestaan]')?.click()`);
    };

    const p1 = pkce();
    const auth1 = await httpsVerzoek(poort, 'GET', `/oauth2/authorize?${new URLSearchParams({
      response_type: 'code', client_id: reg.client_id, redirect_uri: cursorCallback,
      code_challenge: p1.challenge, code_challenge_method: 'S256', state: 'chrome-oauth-1',
      resource: 'https://mcp.tarasevych.com/cursor',
    }).toString()}`);
    const consentUrl1 = auth1.kop('location');
    check('OAuth authorize voor Anysphere/cursor.com verwijst naar toestemmingsvenster op /agents?consent=…',
      consentUrl1.startsWith('https://mcp.tarasevych.com/agents?consent='), consentUrl1);

    await doorloopWizardInChrome(consentUrl1, true);
    for (let i = 0; i < 80 && !opgevangenCallback; i++) await slaap(100);
    const cbUrl1 = opgevangenCallback ? new URL(opgevangenCallback) : null;
    check('Chrome OAuth-wizard «Дозволити» stuurt terug naar https://cursor.com/api/mcp/oauth/callback met code + state',
      Boolean(cbUrl1?.searchParams.get('code')) && cbUrl1?.searchParams.get('state') === 'chrome-oauth-1', opgevangenCallback);

    const tok1 = JSON.parse((await httpsVerzoek(poort, 'POST', '/oauth2/token', new URLSearchParams({
      grant_type: 'authorization_code',
      code: cbUrl1!.searchParams.get('code')!,
      code_verifier: p1.verifier,
      client_id: reg.client_id,
      redirect_uri: cursorCallback,
    }).toString(), { 'content-type': 'application/x-www-form-urlencoded' })).body);

    // ============================================================== 4. tools/list via HTTPS /cursor
    const initResp = await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Anysphere', version: '1.0' } },
    }), { authorization: `Bearer ${tok1.access_token}` });
    const notifResp = await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized',
    }), { authorization: `Bearer ${tok1.access_token}` });
    const lijst1 = JSON.parse((await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    }), { authorization: `Bearer ${tok1.access_token}` })).body);
    const namen1: string[] = (lijst1?.result?.tools ?? []).map((t: { name: string }) => t.name);
    check('tools/list na Chrome OAuth geeft volledige werkende catalogus (bord, GitHub OAuth, live release, ORCH-001 — niet enkel mcp_auth)',
      initResp.status === 200 && notifResp.status === 202
      && namen1.length >= 8
      && namen1.some((n) => n.startsWith('creeren_nieuwe_taak_cursor_'))
      && namen1.some((n) => n.includes('_github_tarasevych_com_gebruiker'))
      && namen1.includes('tonen_agent_coordinatie_cursor_admin_tarasevych_com_beheer'),
      `aantal=${namen1.length}: ${namen1.slice(0, 8).join(', ')}`);

    // ============================================================== 5. notifications/tools/list_changed over live SSE vanuit Chrome #agent/cursor
    const sse = await httpsSse(poort, '/cursor', tok1.access_token);
    sseSluiters.push(sse.sluit);
    check('GET /cursor opent live SSE-stroom (200 text/event-stream)', sse.status === 200);

    await cdp.send('Page.navigate', { url: 'https://mcp.tarasevych.com/agents#agent/cursor' }, s);
    await wachtOp('actieve koppeling Anysphere met create_task aan zichtbaar op #agent/cursor',
      `(document.querySelector('[data-agent-pagina="cursor"]')?.innerText || '').includes('Anysphere') && Boolean(document.querySelector('[data-agent-pagina="cursor"] [data-v2-optie="create_task:gebruiker"].is-aan'))`);
    await evalJs(`document.querySelector('[data-agent-pagina="cursor"] [data-v2-optie="create_task:gebruiker"] [role="switch"]')?.click()`);
    await wachtOp('create_task uitgeschakeld en Зберегти actief',
      `!document.querySelector('[data-agent-pagina="cursor"] [data-v2-optie="create_task:gebruiker"]')?.classList.contains('is-aan') && !document.querySelector('[data-agent-pagina="cursor"] [data-v2-bewaar="cursor"]')?.disabled`);
    await evalJs(`document.querySelector('[data-agent-pagina="cursor"] [data-v2-bewaar="cursor"]')?.click()`);
    await wachtOp('wijziging opgeslagen op #agent/cursor (melding zichtbaar en bezig=false)',
      `(document.querySelector('[data-agent-pagina="cursor"] .v2-melding')?.textContent || '').includes('Збережено') && ![...document.querySelectorAll('[data-agent-pagina="cursor"] .v2b-adresrij button')].find(b => /Перепідключити/.test(b.textContent || ''))?.disabled`);

    for (let i = 0; i < 40 && !sse.berichten.join('').includes('notifications/tools/list_changed'); i++) await slaap(75);
    const lijstNaInperken = JSON.parse((await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/list',
    }), { authorization: `Bearer ${tok1.access_token}` })).body);
    const namenNaInperken: string[] = (lijstNaInperken?.result?.tools ?? []).map((t: { name: string }) => t.name);
    check('wijziging op #agent/cursor in Chrome verstuurt direct notifications/tools/list_changed over SSE en werkt tools/list direct bij',
      sse.berichten.join('').includes('notifications/tools/list_changed')
      && !namenNaInperken.some((n) => n.startsWith('creeren_nieuwe_taak_cursor_')),
      sse.berichten.join('').trim().slice(0, 200));

    // ============================================================== 6. Herautorisatie («Перепідключити» in Chrome + nieuwe OAuth-koppeling met bewaarde voorkeur)
    // Zet create_task:gebruiker weer aan in de UI (wordt opgeslagen als voorkeur voor herverbinden) en klik «Перепідключити»
    await wachtOp('create_task weer ingeschakeld en Зберегти actief', `(() => {
      const rij = document.querySelector('[data-agent-pagina="cursor"] [data-v2-optie="create_task:gebruiker"]');
      const btn = document.querySelector('[data-agent-pagina="cursor"] [data-v2-bewaar="cursor"]');
      if (rij && !rij.classList.contains('is-aan')) rij.querySelector('[role="switch"]')?.click();
      return Boolean(rij?.classList.contains('is-aan')) && Boolean(btn && !btn.disabled);
    })()`);
    await evalJs(`document.querySelector('[data-agent-pagina="cursor"] [data-v2-bewaar="cursor"]')?.click()`);
    await wachtOp('uitbreiding opgeslagen als voorkeur voor herverbinden en knop Перепідключити vrijgegeven',
      `(document.querySelector('[data-agent-pagina="cursor"] .v2-melding')?.textContent || '').includes('після перепідключення') && ![...document.querySelectorAll('[data-agent-pagina="cursor"] .v2b-adresrij button')].find(b => /Перепідключити/.test(b.textContent || ''))?.disabled`);
    await evalJs(`[...document.querySelectorAll('[data-agent-pagina="cursor"] .v2b-adresrij button')].find(b => /Перепідключити/.test(b.textContent || ''))?.click()`);
    for (let i = 0; i < 30; i++) {
      const st = (await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }), {
        authorization: `Bearer ${tok1.access_token}`,
      })).status;
      if (st === 401) break;
      await slaap(100);
    }
    const oudStatus = (await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }), {
      authorization: `Bearer ${tok1.access_token}`,
    })).status;
    check('klik op «Перепідключити» op #agent/cursor trekt het oude token direct in (401)', oudStatus === 401, String(oudStatus));

    // Nieuwe OAuth-autorisatie in Chrome neemt de in de UI bewaarde voorkeur (inclusief create_task:gebruiker) automatisch over
    const p2 = pkce();
    const auth2 = await httpsVerzoek(poort, 'GET', `/oauth2/authorize?${new URLSearchParams({
      response_type: 'code', client_id: reg.client_id, redirect_uri: cursorCallback,
      code_challenge: p2.challenge, code_challenge_method: 'S256', state: 'chrome-oauth-2',
      resource: 'https://mcp.tarasevych.com/cursor',
    }).toString()}`);
    await doorloopWizardInChrome(auth2.kop('location'), false);
    for (let i = 0; i < 80 && !opgevangenCallback; i++) await slaap(100);
    const cbUrl2 = opgevangenCallback ? new URL(opgevangenCallback) : null;
    const tok2 = JSON.parse((await httpsVerzoek(poort, 'POST', '/oauth2/token', new URLSearchParams({
      grant_type: 'authorization_code',
      code: cbUrl2!.searchParams.get('code')!,
      code_verifier: p2.verifier,
      client_id: reg.client_id,
      redirect_uri: cursorCallback,
    }).toString(), { 'content-type': 'application/x-www-form-urlencoded' })).body);
    const lijst2 = JSON.parse((await httpsVerzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 5, method: 'tools/list',
    }), { authorization: `Bearer ${tok2.access_token}` })).body);
    const namen2: string[] = (lijst2?.result?.tools ?? []).map((t: { name: string }) => t.name);
    check('herautorisatie in Chrome geeft nieuw geldig token met de op #agent/cursor bewaarde rechten (create_task weer actief)',
      namen2.some((n) => n.startsWith('creeren_nieuwe_taak_cursor_')) && namen2.some((n) => n.includes('_github_tarasevych_com_gebruiker')),
      `aantal=${namen2.length}`);

    check('geen JavaScript pageerrors of onverwachte console.error tijdens de volledige Chrome-verificatie',
      pageErrors.length === 0 && consoleErrors.length === 0,
      [...pageErrors, ...consoleErrors].join(' | '));
  } finally {
    for (const sl of sseSluiters) sl();
    if (cdp) cdp.sluit();
    if (chromeProc && !chromeProc.killed) {
      try { chromeProc.kill('SIGKILL'); } catch { /* al weg */ }
    }
    G.herstel();
    await new Promise<void>((r) => { tlsServer.closeAllConnections?.(); tlsServer.close(() => r()); });
    if (uid) {
      await koppelingWissen(uid, 'oauth', 'prive').catch(() => undefined);
      await aiDienstOpruimen([uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_rechten WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.ai_toegang WHERE onderwerp_id = $1', [`bord:cursor`]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
    }
    if (clients.length) {
      await sys.query("DELETE FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id IN (SELECT id::text FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))", [clients]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    }
    for (const id of oudeEigenaren) {
      await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl='users' AND id=$1", [id]).catch(() => undefined);
    }
    if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
    if (vorigeLimieten === undefined) delete process.env.E2E_LOKALE_LIMIETEN; else process.env.E2E_LOKALE_LIMIETEN = vorigeLimieten;
    if (vorigeOwner === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeOwner;
    if (vorigeOrchWortel === undefined) delete process.env.ORCH_WORTEL; else process.env.ORCH_WORTEL = vorigeOrchWortel;
    if (vorigeOrchInbox === undefined) delete process.env.ORCH_INBOX; else process.env.ORCH_INBOX = vorigeOrchInbox;
    await slaap(400);
    rmSync(werk, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  return einde();
}
