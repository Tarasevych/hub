// Extern bureaublad via Apache Guacamole (uitvoerder D, 18.10.2026). Melding van de eigenaar: «Guacamole (RDP/VNC) — не впроваджено,
// зараз лише текстовий термінал». Bewijst: tickets (handtekening, eenmalig, verlopen, geen wachtwoord), allowlist/SSRF (publiek,
// 169.254.*, ::ffff:, octaal, DNS-rebinding met gemengde antwoorden), rechten (geen eigenaar / geen techprofiel / geen passkey / agent
// → geweigerd), de tunnel tegen een NEP-guacd (echte TCP-server die de handshake beantwoordt), filters (bestanden, klembord), einde bij
// inactiviteit en bij het verlaten van het technisch profiel, en het logboek (zonder wachtwoord). Echte RDP/VNC: niet getest.
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer as httpServer, type IncomingMessage } from 'node:http';
import { createServer as tcpServer, type AddressInfo, type Socket } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocket } from 'ws';
import { checker } from './hulp/nep-google';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function tot(f: () => boolean | Promise<boolean>, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await wacht(25); } return false; }

export async function main(): Promise<number> {
  const { check, einde } = checker('extern-bureaublad');
  const W = process.cwd();
  const map = mkdtempSync(join(tmpdir(), 'rb-'));
  const rechten = join(map, 'mcp-rechten.json');
  writeFileSync(rechten, JSON.stringify({ read: true, guacamole: false }));
  process.env.MCP_RECHTEN_PAD = rechten;
  process.env.REMOTE_CONTROLE_MS = '100';
  if (!process.env.OWNER_VAULT_ENCRYPTION_KEY_V1) process.env.OWNER_VAULT_ENCRYPTION_KEY_V1 = randomBytes(32).toString('base64');
  const G = await import('../../shared/extern-bureaublad');
  const rb = await import('../../backend/remote-bureaublad');
  const { remoteRoutes } = await import('../../backend/extern-routes');
  const { agentRouteVerboden } = await import('../../backend/agent-namens');
  const tp = await import('../../backend/tech-profiel');
  const { getPool } = await import('../../server/platform/pg');

  // ================================================================ 1. tickets
  {
    const sid = randomUUID(), nonce = randomBytes(18).toString('base64url'), exp = Date.now() + 60_000;
    const t = rb.ticketMaken(sid, nonce, exp);
    const l = rb.ticketLezen(t);
    check('ticket: geldig → sid, nonce en vervaltijd terug', !!l && l.sid === sid && l.nonce === nonce && l.exp === exp);
    check('ticket: bevat alleen sid.vervaltijd.nonce.handtekening (geen wachtwoord, geen gebruiker, geen host)', t.split('.').length === 4 && !/[@:/ ]/.test(t) && t.length < 200, t.slice(0, 50));
    const delen = t.split('.');
    const kapot = (i: number, v: string) => { const d = [...delen]; d[i] = v; return d.join('.'); };
    check('ticket: andere handtekening → geweigerd', rb.ticketLezen(kapot(3, 'A'.repeat(43))) === null);
    check('ticket: andere sessie-id met oude handtekening → geweigerd', rb.ticketLezen(kapot(0, randomUUID())) === null);
    check('ticket: vervaltijd verlengd met oude handtekening → geweigerd', rb.ticketLezen(kapot(1, String(exp + 3_600_000))) === null);
    check('ticket: verlopen (61 s later) → geweigerd', rb.ticketLezen(t, exp + 1_000) === null);
    check('ticket: termijn is 60 s', G.REMOTE_TICKET_MS === 60_000);
    check('ticket: rommel/te lang/geen string → geweigerd', rb.ticketLezen('x') === null && rb.ticketLezen('a'.repeat(400)) === null && rb.ticketLezen(42) === null);
  }

  // ================================================================ 2. adressen en SSRF
  {
    const s = G.adresSoort;
    check('privé: 10/8, 172.16/12, 192.168/16, fd00::/8', s('10.1.2.3') === 'prive' && s('172.16.0.1') === 'prive' && s('172.31.255.254') === 'prive' && s('192.168.1.20') === 'prive' && s('fd12::1') === 'prive');
    check('loopback: 127.0.0.1, ::1', s('127.0.0.1') === 'loopback' && s('::1') === 'loopback');
    check('publiek: 8.8.8.8, 172.32.0.1, 2001:4860::8888', s('8.8.8.8') === 'publiek' && s('172.32.0.1') === 'publiek' && s('2001:4860::8888') === 'publiek');
    check('verboden: 169.254.169.254 (metadata), 0.0.0.0, 224.0.0.1, 255.255.255.255, fe80::1, ff02::1', ['169.254.169.254', '0.0.0.0', '224.0.0.1', '255.255.255.255', 'fe80::1', 'ff02::1'].every((a) => s(a) === 'verboden'));
    check('::ffff:169.254.169.254 en ::ffff:a9fe:a9fe → verboden (IPv4 in IPv6)', s('::ffff:169.254.169.254') === 'verboden' && s('::ffff:a9fe:a9fe') === 'verboden');
    check('::ffff:10.0.0.1 → privé, ::ffff:8.8.8.8 → publiek', s('::ffff:10.0.0.1') === 'prive' && s('::ffff:8.8.8.8') === 'publiek');
    check('octaal/kortschrift (0177.0.0.1, 127.1) niet als IPv4 gelezen', G.ipv4Getal('0177.0.0.1') === null && G.ipv4Getal('127.1') === null);
    check('publiek alleen via de lijst; verboden nooit, ook niet via de lijst', !G.adresToegestaan('8.8.8.8', '8.8.8.8', []) && G.adresToegestaan('8.8.8.8', '8.8.8.8', ['8.8.8.8']) && !G.adresToegestaan('169.254.169.254', 'meta', ['meta']));
    check('host-invoer: geen schema, pad of spaties', G.hostGeldig('pc.lan') && G.hostGeldig('fd00::5') && !G.hostGeldig('http://x') && !G.hostGeldig('a b') && !G.hostGeldig('x/y'));

    const dns: Record<string, string[]> = { 'pc.lan': ['10.0.0.5'], 'rebind.example': ['10.0.0.5', '8.8.8.8'], 'meta.example': ['169.254.169.254'], 'jump.example.com': ['203.0.113.7'], 'v6meta.example': ['::ffff:169.254.169.254'] };
    rb._zetDns(async (n) => { if (!dns[n]) throw new Error('ENOTFOUND'); return dns[n]; });
    const weigert = async (f: () => Promise<unknown>, codeVerwacht: string) => { try { await f(); return 'GEEN FOUT'; } catch (e) { return (e as { code?: string }).code === codeVerwacht ? 'ok' : String((e as { code?: string }).code || (e as Error).message); } };
    check('DNS: naam → privé-IP; guacd krijgt het IP, niet de naam', (await rb.doelOplossen('pc.lan', [])) === '10.0.0.5');
    check('DNS-rebinding: gemengd antwoord (privé + publiek) → geweigerd', (await weigert(() => rb.doelOplossen('rebind.example', []), 'HOST_NIET_TOEGESTAAN')) === 'ok');
    check('DNS naar 169.254.169.254 → HOST_VERBODEN (ook als de naam op de lijst staat)', (await weigert(() => rb.doelOplossen('meta.example', ['meta.example']), 'HOST_VERBODEN')) === 'ok');
    check('DNS naar ::ffff:169.254.169.254 → HOST_VERBODEN', (await weigert(() => rb.doelOplossen('v6meta.example', ['v6meta.example']), 'HOST_VERBODEN')) === 'ok');
    check('publieke naam zonder lijst → HOST_NIET_TOEGESTAAN; op de lijst → ok', (await weigert(() => rb.doelOplossen('jump.example.com', []), 'HOST_NIET_TOEGESTAAN')) === 'ok' && (await rb.doelOplossen('jump.example.com', ['jump.example.com'])) === '203.0.113.7');
    check('publiek IP letterlijk → geweigerd; onbekende naam → HOST_NIET_GEVONDEN', (await weigert(() => rb.doelOplossen('8.8.8.8', []), 'HOST_NIET_TOEGESTAAN')) === 'ok' && (await weigert(() => rb.doelOplossen('weg.example', []), 'HOST_NIET_GEVONDEN')) === 'ok');
    check('[IPv6] met haken → gelezen', (await rb.doelOplossen('[fd00::5]', [])) === 'fd00::5');
  }

  // ================================================================ 3. protocol (lengtes in codepunten, zoals guacd)
  {
    const i = G.guacInstructie('clipboard', '0', 'tëkst😀');
    check('guacInstructie: lengte in codepunten (😀 = 1)', i === '9.clipboard,1.0,6.tëkst😀;', i);
    const o = G.guacOntleed(`${G.guacInstructie('sync', 1)}${G.guacInstructie('mouse', 1, 2, 0)}4.ke`);
    check('guacOntleed: twee volledige instructies + onvolledige rest bewaard', o.instructies.length === 2 && o.instructies[1].opcode === 'mouse' && o.instructies[1].args.join() === '1,2,0' && o.rest === '4.ke');
    let gegooid = ''; try { G.guacOntleed('x.abc;'); } catch (e) { gegooid = (e as Error).message; }
    check('guacOntleed: kapotte lengte → fout (verbinding dicht)', /GUAC_/.test(gegooid), gegooid);
    const cw = G.connectWaarden(['VERSION_1_5_0', 'hostname', 'port', 'username', 'password', 'disable-download', 'disable-upload', 'disable-copy', 'onbekend'], { protocol: 'rdp', ip: '10.0.0.5', poort: 3389, gebruiker: 'pavlo', wachtwoord: 'x', instellingen: G.STANDAARD_INSTELLINGEN });
    check('connect: versie terug, hostname = IP, bestanden standaard uit, klembord aan, onbekend leeg', cw.join('|') === 'VERSION_1_5_0|10.0.0.5|3389|pavlo|x|true|true||', cw.join('|'));
    check('standaard: bestandsoverdracht UIT, opname uit', G.STANDAARD_INSTELLINGEN.bestanden === false && G.STANDAARD_INSTELLINGEN.opnemen === false);
  }

  // ================================================================ 4. agenten
  check('AGENT_VERBODEN: /api/owner/remote/* (alle routes)', ['POST /api/owner/remote/openen', 'POST /api/owner/remote/verbinding/opslaan', 'POST /api/owner/remote/stand', 'GET /api/owner/remote/tunnel'].every(agentRouteVerboden));
  check('geen MCP-tool voor het bureaublad (deploy/mcp/server.mjs noemt het niet)', !/owner\/remote|guacamole/i.test(readFileSync(join(W, 'deploy/mcp/server.mjs'), 'utf8')));
  const gw = readFileSync(join(W, 'backend/connectors-gateway.ts'), 'utf8');
  check('gateway: eigen WS-pad, zelfde host-controle, ?ticket/?token geweigerd', /const extra = wsPaden\.get\(url\.pathname\);\s*if \(extra && allowedHosts\.has\(host\) && !url\.searchParams\.has\('ticket'\) && !url\.searchParams\.has\('token'\)\)/.test(gw));
  const inst = readFileSync(join(W, 'deploy/installeer-app.sh'), 'utf8');
  check('installer: schakelaar guacamole standaard uit; guacd alleen op 127.0.0.1:4822', /"guacamole": false/.test(inst) && /guacamole_inrichten "\$doel"/.test(inst) && /-b 127\.0\.0\.1 -l 4822/.test(readFileSync(join(W, 'deploy/guacamole/mijn-ruimte-guacd.service'), 'utf8')));

  // ================================================================ 5. met database: rechten, opslag, tunnel tegen nep-guacd
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_SYSTEM) { console.log('OVERGESLAGEN: geen database'); return einde(); }
  const pool = getPool('systeem');
  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
  const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
  const vreemd = { id: randomUUID(), email: 'iemand@eenheid.test', role: 'user', status: 'approved' };
  const nepAdmin = { id: uid, email: 'nep-eigenaar@eenheid.test', role: 'owner', status: 'approved' }; // rol owner, maar niet het eigenaarsadres
  const GEHEIM = `Wachtwoord-${randomBytes(6).toString('hex')}`;
  const tab = randomBytes(24).toString('hex');

  // Nep-doel (TCP open) en nep-guacd (handshake: select → args, connect → ready; daarna echo van mouse als sync).
  const doel = tcpServer((s) => s.end()); await new Promise<void>((r) => doel.listen(0, '127.0.0.1', r));
  const doelPoort = (doel.address() as AddressInfo).port;
  type GuacLog = { select: string; connect: string[]; ontvangen: string[]; disconnect: boolean; sock: Socket };
  const guacd: GuacLog[] = [];
  const ARGS = ['VERSION_1_5_0', 'hostname', 'port', 'username', 'password', 'width', 'height', 'disable-download', 'disable-upload', 'disable-copy', 'disable-paste'];
  const nep = tcpServer((sock) => {
    const log: GuacLog = { select: '', connect: [], ontvangen: [], disconnect: false, sock };
    guacd.push(log);
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (d: string) => {
      buf += d;
      const o = G.guacOntleed(buf); buf = o.rest;
      for (const ins of o.instructies) {
        log.ontvangen.push(ins.opcode);
        if (ins.opcode === 'select') { log.select = ins.args[0]; sock.write(G.guacInstructie('args', ...ARGS)); }
        else if (ins.opcode === 'connect') { log.connect = ins.args; sock.write(G.guacInstructie('ready', '$nep-verbinding') + G.guacInstructie('size', 0, 1280, 800)); }
        else if (ins.opcode === 'mouse') sock.write(G.guacInstructie('sync', Date.now()));
        else if (ins.opcode === 'disconnect') log.disconnect = true;
      }
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>((r) => nep.listen(0, '127.0.0.1', r));
  process.env.GUACD_HOST = '127.0.0.1';
  process.env.GUACD_PORT = String((nep.address() as AddressInfo).port);

  // HTTP-server met dezelfde upgrade als de gateway.
  const http = httpServer((_q, s) => { s.statusCode = 404; s.end(); });
  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => { if ((req.url || '').startsWith(rb.REMOTE_WS_PATH)) rb.upgrade(req, socket, head); else socket.destroy(); });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const wsPoort = (http.address() as AddressInfo).port;
  type Ws = { ws: WebSocket; berichten: string[]; dicht: { code: number; reden: string } | null };
  const verbind = (origin = `http://127.0.0.1:${wsPoort}`) => new Promise<Ws>((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPoort}${rb.REMOTE_WS_PATH}?`, 'guacamole', { headers: { origin } });
    const x: Ws = { ws, berichten: [], dicht: null };
    ws.on('message', (m) => x.berichten.push(m.toString()));
    ws.on('close', (code, reden) => { x.dicht = { code, reden: reden.toString() }; });
    ws.on('open', () => res(x));
    ws.on('error', (e) => rej(e));
    ws.on('unexpected-response', (_q, r) => rej(new Error(`HTTP ${r.statusCode}`)));
  });

  // Routes met een nep-sessie en een nep-passkey (de echte passkeycontrole staat in tests/eenheid/stap-op*.test.ts).
  let wie: typeof eig = eig; let passkey = false; let verbruikt = 0;
  const routes = remoteRoutes(async () => ({ user: wie, service: 'admin', session: null }), { passkeyGeldig: async () => passkey, passkeyVerbruiken: async () => { verbruikt += 1; passkey = false; } });
  const roep = async (pad: string, body: Record<string, unknown> = {}) => {
    const r = await (routes[`POST ${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body: { tabContext: tab, ...body } });
    return { status: r.statusCode, data: JSON.parse(r.body || '{}') };
  };
  const auditVan = async (actie: string) => (await pool.query(`SELECT details::text AS d FROM app.audit WHERE owner_id = $1 AND action = $2 ORDER BY seq DESC LIMIT 5`, [uid, actie]).catch(() => ({ rows: [] as Array<{ d: string }> }))).rows.map((r) => String(r.d));

  try {
    await pool.query('DELETE FROM app.remote_verbindingen WHERE user_id = $1', [uid]);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');

    // ---------------------------------------------------------------- rechten
    wie = vreemd as never;
    check('rechten: geen eigenaar → 403 REMOTE_ALLEEN_EIGENAAR (ook stand)', (await roep('/api/owner/remote/stand')).status === 403 && (await roep('/api/owner/remote/openen', { id: randomUUID() })).data.error === 'REMOTE_ALLEEN_EIGENAAR');
    wie = nepAdmin as never;
    check('rechten: rol «owner» zonder eigenaarsadres → 403', (await roep('/api/owner/remote/stand')).status === 403);
    wie = eig;
    const zonderPk = await roep('/api/owner/remote/verbinding/opslaan', { naam: 'Werk-pc', protocol: 'rdp', host: '127.0.0.1', poort: doelPoort, gebruiker: 'pavlo', geheim: GEHEIM });
    check('rechten: opslaan zonder passkey → 403 STEP_UP_REQUIRED (alleen passkey)', zonderPk.status === 403 && zonderPk.data.error === 'STEP_UP_REQUIRED' && JSON.stringify(zonderPk.data.methods) === '["passkey"]');

    // ---------------------------------------------------------------- SSRF via opslaan
    passkey = true;
    const meta = await roep('/api/owner/remote/verbinding/opslaan', { naam: 'Meta', protocol: 'rdp', host: '169.254.169.254' });
    passkey = true;
    const pub = await roep('/api/owner/remote/verbinding/opslaan', { naam: 'Publiek', protocol: 'vnc', host: '8.8.8.8' });
    check('opslaan: 169.254.169.254 → 403 HOST_VERBODEN; 8.8.8.8 → 403 HOST_NIET_TOEGESTAAN; niets bewaard', meta.data.error === 'HOST_VERBODEN' && pub.data.error === 'HOST_NIET_TOEGESTAAN'
      && Number((await pool.query('SELECT count(*)::int AS n FROM app.remote_verbindingen WHERE user_id=$1', [uid])).rows[0].n) === 0);

    // ---------------------------------------------------------------- opslaan (wachtwoord naar de kluis)
    passkey = true; verbruikt = 0;
    const ok = await roep('/api/owner/remote/verbinding/opslaan', { naam: 'Werk-pc', protocol: 'rdp', host: '127.0.0.1', poort: doelPoort, gebruiker: 'pavlo', geheim: GEHEIM, instellingen: { klembord: true } });
    const vid = String(ok.data.id || '');
    check('opslaan met passkey: 200, passkey verbruikt (één bevestiging = één handeling)', ok.status === 200 && !!vid && verbruikt === 1, JSON.stringify(ok.data).slice(0, 160));
    const rij = (await pool.query('SELECT * FROM app.remote_verbindingen WHERE id = $1', [vid])).rows[0];
    check('opslag: wachtwoord NIET in remote_verbindingen, wel een kluisnaam; antwoord zonder wachtwoord', !!rij && !JSON.stringify(rij).includes(GEHEIM) && /^remote-[0-9a-f]{8}$/.test(rij.geheim_naam) && !JSON.stringify(ok.data).includes(GEHEIM) && ok.data.heeftGeheim === true);
    check('opslag: bestandsoverdracht standaard uit', ok.data.instellingen?.bestanden === false);
    const test = await roep('/api/owner/remote/verbinding/testen', { id: vid });
    check('testen: TCP naar het doel (alleen allowlist) → bereikbaar', test.data.ok === true && test.data.ip === '127.0.0.1');

    // ---------------------------------------------------------------- openen: schakelaar, techprofiel, passkey
    passkey = true;
    check('openen met schakelaar uit → 409 REMOTE_UIT', (await roep('/api/owner/remote/openen', { id: vid })).data.error === 'REMOTE_UIT');
    writeFileSync(rechten, JSON.stringify({ read: true, guacamole: true }));
    passkey = true;
    check('openen zonder actief technisch profiel in dit tabblad → 403 TECH_PROFIEL_VEREIST', (await roep('/api/owner/remote/openen', { id: vid })).data.error === 'TECH_PROFIEL_VEREIST');
    await tp.profielVan(eig);
    const act = await tp.activeren(eig, tab, 0, 'eenheidstest extern bureaublad');
    passkey = false;
    check('openen zonder passkey (met techprofiel) → 403 STEP_UP_REQUIRED', (await roep('/api/owner/remote/openen', { id: vid })).data.error === 'STEP_UP_REQUIRED');
    passkey = true;
    check('openen in een ANDER tabblad → TECH_PROFIEL_VEREIST', (await (async () => { const r = await (routes['POST /api/owner/remote/openen'][0] as unknown as (c: unknown) => Promise<{ body: string }>)({ event: {}, body: { tabContext: randomBytes(24).toString('hex'), id: vid } }); return JSON.parse(r.body).error; })()) === 'TECH_PROFIEL_VEREIST');
    passkey = true;
    const op = await roep('/api/owner/remote/openen', { id: vid });
    check('openen: ticket + sessie; antwoord zonder wachtwoord', op.status === 200 && !!op.data.ticket && !JSON.stringify(op.data).includes(GEHEIM), JSON.stringify(op.data).slice(0, 120));
    check('openen: rij in app.remote_sessies (wie/waarheen/wanneer)', !!(await pool.query('SELECT 1 FROM app.remote_sessies WHERE id=$1 AND user_id=$2 AND host=$3 AND activatie_id=$4', [op.data.sid, uid, '127.0.0.1', act.id])).rows[0]);

    // ---------------------------------------------------------------- tunnel
    let fout = ''; try { await verbind('https://evil.example'); } catch (e) { fout = (e as Error).message; }
    check('tunnel: andere Origin → HTTP 403', fout === 'HTTP 403', fout);
    const a = await verbind();
    await tot(() => a.berichten.length > 0);
    check('tunnel: eerst de interne UUID (client gaat naar OPEN)', /^0\.,36\.[0-9a-f-]{36};$/.test(a.berichten[0] || ''), a.berichten[0]);
    a.ws.send(G.guacInstructie('nop')); // Guacamole.Client mag vóór de aanmelding al nop sturen
    a.ws.send(G.guacInstructie('mr-auth', op.data.ticket));
    await tot(() => a.berichten.some((m) => m.includes('7.mr-info')));
    const g = guacd[guacd.length - 1];
    check('nep-guacd: select rdp → connect met hostname = IP en poort van het doel', g?.select === 'rdp' && g.connect[1] === '127.0.0.1' && g.connect[2] === String(doelPoort) && g.connect[3] === 'pavlo', JSON.stringify(g?.connect.slice(0, 4)));
    check('nep-guacd: wachtwoord pas hier (uit de kluis), bestanden uit (disable-download/upload = true)', g?.connect[4] === GEHEIM && g.connect[7] === 'true' && g.connect[8] === 'true');
    check('browser kreeg «ready» niet, wel guacd-uitvoer (size) en mr-info', !a.berichten.join('').includes('5.ready') && a.berichten.join('').includes('4.size') && a.berichten.join('').includes('7.mr-info'));
    const s = rb._sessies.get(op.data.sid)!;
    check('na de handshake staat het wachtwoord niet meer in het geheugen van de sessie', !!s && s.geheim === null);
    a.ws.send(G.guacInstructie('mouse', 10, 20, 1) + G.guacInstructie('file', 1, 'text/plain', 'x.txt') + G.guacInstructie('put', 2, 'text/plain', 'y'));
    await tot(() => g.ontvangen.includes('mouse'));
    await wacht(100);
    check('invoer door (mouse), bestandsoverdracht tegengehouden (file/put)', g.ontvangen.includes('mouse') && !g.ontvangen.includes('file') && !g.ontvangen.includes('put'), g.ontvangen.join(','));
    check('guacd-antwoord terug naar de browser (sync)', await tot(() => a.berichten.some((m) => m.includes('4.sync'))));
    const b = await verbind();
    await tot(() => b.berichten.length > 0);
    b.ws.send(G.guacInstructie('mr-auth', op.data.ticket));
    check('ticket eenmalig: tweede gebruik → verbinding dicht (4403)', await tot(() => b.dicht?.code === 4403));
    const c = await verbind();
    await tot(() => c.berichten.length > 0);
    c.ws.send(G.guacInstructie('mouse', 1, 1, 0));
    check('zonder ticket alleen genegeerd; na 5 s dicht (4401)', await tot(() => c.dicht?.code === 4401, 6500));
    check('stand: sessie zichtbaar als actief', (await roep('/api/owner/remote/stand')).data.actief?.some((x: { sid: string }) => x.sid === op.data.sid));
    a.ws.send(G.guacInstructie('disconnect'));
    check('disconnect van de browser → guacd krijgt disconnect, sessie dicht', await tot(() => g.disconnect && !rb._sessies.has(op.data.sid)));
    check('einde in app.remote_sessies (reden «gesloten», duur, bytes)', await tot(async () => (await pool.query('SELECT einde_reden, bytes_in FROM app.remote_sessies WHERE id=$1', [op.data.sid])).rows[0]?.einde_reden === 'gesloten'));

    // ---------------------------------------------------------------- inactiviteit
    passkey = true;
    const op2 = await roep('/api/owner/remote/openen', { id: vid });
    const d = await verbind(); await tot(() => d.berichten.length > 0);
    d.ws.send(G.guacInstructie('mr-auth', op2.data.ticket));
    await tot(() => d.berichten.some((m) => m.includes('7.mr-info')));
    rb._sessies.get(op2.data.sid)!.laatsteInvoer = Date.now() - G.REMOTE_INACTIEF_MS - 1000;
    check('15 min zonder invoer → sessie dicht, browser krijgt «mr-einde inactief»', await tot(() => !rb._sessies.has(op2.data.sid) && d.berichten.some((m) => m.includes('8.mr-einde,8.inactief'))));

    // ---------------------------------------------------------------- techprofiel verlaten
    process.env.REMOTE_CONTROLE_MS = '600000'; // de periodieke controle telt niet: de haak van tech-profiel moet het doen
    passkey = true;
    const op3 = await roep('/api/owner/remote/openen', { id: vid });
    const e = await verbind(); await tot(() => e.berichten.length > 0);
    e.ws.send(G.guacInstructie('mr-auth', op3.data.ticket));
    await tot(() => e.berichten.some((m) => m.includes('7.mr-info')));
    await tp.beeindigen(eig, tab);
    check('technisch profiel verlaten → sessie METEEN dicht (haak), reden tech-uit', await tot(() => !rb._sessies.has(op3.data.sid) && e.berichten.some((m) => m.includes('8.mr-einde,8.tech-uit')), 1500));
    passkey = true;
    check('daarna openen → TECH_PROFIEL_VEREIST', (await roep('/api/owner/remote/openen', { id: vid })).data.error === 'TECH_PROFIEL_VEREIST');

    // ---------------------------------------------------------------- logboek
    const alles = [...await auditVan('owner.remote.verbinding.toegevoegd'), ...await auditVan('owner.remote.geopend'), ...await auditVan('owner.remote.verbonden'), ...await auditVan('owner.remote.gesloten')];
    check('audit: toegevoegd, geopend, verbonden en gesloten gelogd', (await auditVan('owner.remote.verbinding.toegevoegd')).length > 0 && (await auditVan('owner.remote.geopend')).length > 0 && (await auditVan('owner.remote.verbonden')).length > 0 && (await auditVan('owner.remote.gesloten')).length > 0);
    check('audit: gesloten met reden en duur; nergens het wachtwoord', alles.some((x) => /"reden": ?"(gesloten|inactief|tech-uit)"/.test(x) && /"seconden"/.test(x)) && !alles.some((x) => x.includes(GEHEIM)));
    check('journaal: labels uk/nl voor owner.remote.*', /'owner\.remote\.geopend': \['Відкрито віддалений стіл', 'Extern bureaublad geopend'\]/.test(readFileSync(join(W, 'shared/beheer-journaal.ts'), 'utf8')));

    // ---------------------------------------------------------------- verwijderen (ook uit de kluis)
    passkey = true;
    const weg = await roep('/api/owner/remote/verbinding/verwijderen', { id: vid });
    const inKluis = (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='owner_vault_v1' AND data->>'ownerUserId'=$1 AND data->>'keyName'=$2`, [uid, rij.geheim_naam])).rows[0].n;
    check('verwijderen met passkey: verbinding én kluisgeheim weg', weg.status === 200 && Number(inKluis) === 0 && !(await pool.query('SELECT 1 FROM app.remote_verbindingen WHERE id=$1', [vid])).rows[0]);
  } finally {
    for (const s of [...rb._sessies.values()]) rb.beeindigVoorGebruiker(s.userId, 'test-einde');
    await pool.query('DELETE FROM app.remote_verbindingen WHERE user_id = $1', [uid]).catch(() => undefined);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');
    rb._zetDns(null);
    await new Promise((r) => http.close(r)); await new Promise((r) => nep.close(r)); await new Promise((r) => doel.close(r));
    for (const g of guacd) g.sock.destroy();
  }
  return einde();
}
