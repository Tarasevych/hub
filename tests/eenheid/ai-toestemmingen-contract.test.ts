// De 8 contracttests van het toestemmingsmodel (grants) uit de opdracht "veilige agenten 0.4", tegen een echte Postgres:
//  1. zonder grant geen opdracht;              5. elke wijziging: epoch + 1 en push naar de agents;
//  2. domeinbereik van een grant;              6. blokkeren is één transactie en sluit daarna de verbindingen;
//  3. destructief vraagt een verse goedkeuring; 7. opnieuw koppelen trekt het vorige token (pairing_id) in;
//  4. 'altijd' vraagt step-up en vervalt;       8. nooit een token in de URL; accountclaim die niet klopt = weigeren.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import * as grants from '../../backend/ai-toestemmingen';
import { approveCommand, CommandRefused, submitCommand } from '../../backend/connectors-opdrachten';
import { agentOnline, attachAgentGateway, issueWsTicket, WS_TICKET_TTL_MS } from '../../backend/connectors-gateway';
import { DIAG_LIMITS } from '../../backend/browser-diag-archief';
import * as store from '../../backend/connectors-opslag';
import { COMMAND_SIG_TTL_MS, newCommandKey, randomToken, sealCommandKey, sha256, signCommand } from '../../backend/connectors-crypto';
import { accountState, DIAG_LIMITS as EXT_DIAG, parseAccountClaim, TYPE_CAPABILITY as EXT_TYPE_CAPABILITY, verifyCommand } from '../../extension/shared.js';
import { auditLijst } from '../../server/platform/audit';
import { closePool, getPool } from '../../server/platform/pg';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { checker } from './hulp/nep-google';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean> | boolean, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(40); }
  return false;
}
const refusedCode = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof CommandRefused ? e.code : `ERR:${(e as Error).message}`));

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-toestemmingen-contract');
  const sys = getPool('systeem');
  const A = `grants-A-${randomUUID()}`;
  const B = `grants-B-${randomUUID()}`;
  const server = createServer();
  attachAgentGateway(server, new Set(['127.0.0.1']));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];

  /** Testagent met het 0.4-protocol: ticket in het eerste bericht, berichten verzamelen. */
  const verbind = (auth: Record<string, unknown>, pad = '/agent/ws') => new Promise<{ ws: WebSocket; berichten: any[]; gesloten: Promise<number> }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${pad}`);
    sockets.push(ws);
    const berichten: any[] = [];
    const gesloten = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', ...auth, version: '0.4.0', capabilities: { kind: 'browser' } })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      berichten.push(msg);
      if (msg.t === 'ready') resolve({ ws, berichten, gesloten });
      if (msg.t === 'cmd') ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, data: {} }));
    });
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    gesloten.then((c) => reject(new Error(`gesloten ${c}`)));
  });
  const nieuweBrowser = async (user: string, naam: string, pairingId: string | null = null) => {
    const token = randomToken(32);
    const key = newCommandKey();
    const agent = await store.createAgent(user, naam, 'browser', sha256(token), {}, undefined,
      { pairingId, commandKeyEnc: sealCommandKey(key, user, sha256(token)), version: '0.4.0' });
    await store.setBrowserEnabled(user, agent.id, true);
    await store.armBrowserAgent(user, agent.id);
    return { agent, token, key };
  };

  // Plafondconstanten: deze test faalt als iemand een grens ruimer maakt.
  const L = grants.GRANT_LIMITS;
  check('plafonds: grant max 90 d, altijd standaard 30 d, verse goedkeuring 5 min, snelheidsgrenzen, max 20 domeinen; bevroren',
    L.maxDays <= 90 && L.alwaysDefaultDays <= 30 && L.freshApprovalMinutes <= 5 && L.commandsPerAgentPerMinute <= 60 && L.destructivePerUserPerHour <= 30 && L.maxDomains <= 20 && Object.isFrozen(L));
  check('plafonds: presets nooit langer dan 30 dagen; Разово ≤ 60 min; Спостерігач alleen lezen',
    Object.values(grants.PRESETS).every((p) => p.minutes <= 30 * 24 * 60) && grants.PRESETS.razovo.minutes <= 60
    && JSON.stringify(grants.PRESETS.spostericach.browser) === '["browser.read"]' && JSON.stringify(grants.PRESETS.spostericach.machine) === '["machine.read"]');
  check('plafonds: agenttoken ≤ 30 d, koppelcode ≤ 5 min, ws-ticket ≤ 60 s, handtekening ≤ 120 s, diagnosebuffer ≤ 200 regels en archief ≤ 90 d',
    store.AGENT_LIMITS.tokenTtlDays <= 30 && store.AGENT_LIMITS.pairingCodeTtlMin <= 5 && WS_TICKET_TTL_MS <= 60_000 && COMMAND_SIG_TTL_MS <= 120_000
    && EXT_DIAG.maxEntries <= 200 && DIAG_LIMITS.maxEntries <= 200 && DIAG_LIMITS.retentionDays <= 90);
  check('plafonds: elke destructieve mogelijkheid staat in DESTRUCTIVE; elk browsertype heeft een mogelijkheid in server én extensie (zelfde indeling)',
    ['browser.interact', 'browser.screenshot', 'browser.debug', 'machine.write', 'machine.exec', 'machine.docker'].every((c) => grants.DESTRUCTIVE.has(c as grants.Capability))
    && Object.entries(EXT_TYPE_CAPABILITY).every(([t, c]) => grants.TYPE_CAPABILITY[t] === c)
    && Object.keys(grants.TYPE_CAPABILITY).filter((t) => t.startsWith('browser.')).every((t) => t in EXT_TYPE_CAPABILITY));

  try {
    const br = await nieuweBrowser(A, 'Chrome (contract)', `p-${randomUUID()}`);
    // Extensie 0.5: zonder ontgrendeling stuurt de server geen browseropdracht (EXTENSIE_VERGRENDELD); dit contract test de grants erachter.
    await ontgrendelVoorTest(br.agent.id, A);
    const ext = await verbind({ ticket: issueWsTicket(br.agent.id).ticket });

    // 1. zonder grant
    const zonder = await refusedCode(submitCommand(br.agent, A, 'browser.snapshot', {}));
    check('1. zonder grant: opdracht geweigerd (NO_GRANT), geen rij en niets naar de agent',
      zonder === 'NO_GRANT' && (await store.listCommands(A, br.agent.id)).length === 0 && !ext.berichten.some((m) => m.t === 'cmd'), zonder);
    check('1. ook een andere gebruiker kan geen opdracht naar deze agent sturen', (await refusedCode(submitCommand(br.agent, B, 'browser.snapshot', {}))) === 'AGENT_NOT_FOUND');

    // 2. domeinbereik
    await grants.addGrants(A, A, [
      { agentId: br.agent.id, capability: 'browser.read', domains: ['mcp.tarasevych.com'] },
      { agentId: br.agent.id, capability: 'browser.navigate', domains: ['mail.tarasevych.com'] },
    ], { steppedUp: false });
    const binnen = await submitCommand(br.agent, A, 'browser.navigate', { url: 'https://mail.tarasevych.com/inbox' });
    const buiten = await refusedCode(submitCommand(br.agent, A, 'browser.navigate', { url: 'https://agenda.tarasevych.com/' }));
    const vreemd = await refusedCode(submitCommand(br.agent, A, 'browser.navigate', { url: 'https://evil.example/' }));
    check('2. domeinbereik: binnen het domein direct, een ander eigen subdomein en een vreemd adres geweigerd',
      binnen.auto === true && buiten === 'DOMAIN_OUT_OF_SCOPE' && vreemd === 'DOMAIN_OUT_OF_SCOPE', `${buiten}/${vreemd}`);
    check('2. de verzonden opdracht draagt het bereik en een handtekening die de extensie kan controleren',
      await until(() => ext.berichten.some((m) => m.t === 'cmd' && m.type === 'browser.navigate'))
      && await (async () => { const m = ext.berichten.find((x) => x.t === 'cmd' && x.type === 'browser.navigate');
        return JSON.stringify(m.scope.domains) === '["mail.tarasevych.com"]' && (await verifyCommand(br.key, m)) === true
          && (await verifyCommand(br.key, { ...m, params: { url: 'https://mail.tarasevych.com/andere' } })) === false
          && (await verifyCommand(newCommandKey(), m)) === false; })());

    // 3. destructief = verse goedkeuring
    await grants.addGrants(A, A, [{ agentId: br.agent.id, capability: 'browser.interact', domains: [] }], { steppedUp: false });
    const klik = await submitCommand(br.agent, A, 'browser.click', { name: 'Opslaan' });
    check('3. destructief met gewone grant: wacht op goedkeuring, niets verstuurd', klik.auto === false && klik.command.status === 'pending_approval'
      && !ext.berichten.some((m) => m.t === 'cmd' && m.type === 'browser.click'));
    await sys.query(`UPDATE app.agent_commands SET created_at = now() - interval '6 minutes' WHERE id = $1`, [klik.command.id]);
    const telaat = await approveCommand(A, klik.command.id);
    check('3. goedkeuring na meer dan 5 minuten: verlopen, niet verstuurd', telaat === null && (await store.getCommand(A, klik.command.id))?.status !== 'sent'
      && !ext.berichten.some((m) => m.t === 'cmd' && m.type === 'browser.click'), String((await store.getCommand(A, klik.command.id))?.status));
    const klik2 = await submitCommand(br.agent, A, 'browser.click', { name: 'Opslaan' });
    const opTijd = await approveCommand(A, klik2.command.id);
    check('3. verse goedkeuring binnen de termijn: verstuurd en uitgevoerd',
      !!opTijd && await until(async () => (await store.getCommand(A, klik2.command.id))?.status === 'succeeded'));

    // 4. 'altijd' vraagt step-up en vervalt
    const zonderStepUp = await grants.addGrants(A, A, [{ agentId: br.agent.id, capability: 'browser.screenshot', always: true }], { steppedUp: false }).then(() => 'OK', (e) => e.message);
    const met = await grants.addGrants(A, A, [{ agentId: br.agent.id, capability: 'browser.screenshot', always: true }], { steppedUp: true });
    const dagen = (new Date(met.grants[0].expires_at).getTime() - Date.now()) / 86400000;
    const teLang = await grants.addGrants(A, A, [{ agentId: br.agent.id, capability: 'browser.screenshot', always: true, minutes: 91 * 24 * 60 }], { steppedUp: true }).then(() => 'OK', (e) => e.message);
    const dbZonderVervaldatum = await sys.query(`INSERT INTO app.ai_grants (user_id, agent_id, capability, always, granted_by, expires_at) VALUES ($1, $2, 'browser.read', true, $1, NULL)`, [A, br.agent.id]).then(() => 'OK', () => 'GEWEIGERD');
    const dbTeLang = await sys.query(`INSERT INTO app.ai_grants (user_id, agent_id, capability, always, granted_by, expires_at) VALUES ($1, $2, 'browser.read', true, $1, now() + interval '120 days')`, [A, br.agent.id]).then(() => 'OK', () => 'GEWEIGERD');
    check("4. 'altijd' zonder step-up geweigerd; met step-up standaard 30 dagen; langer dan 90 dagen geweigerd (code én database)",
      zonderStepUp === 'STEP_UP_REQUIRED' && met.grants[0].always === true && Math.abs(dagen - 30) < 0.1 && teLang === 'DURATION_INVALID' && dbZonderVervaldatum === 'GEWEIGERD' && dbTeLang === 'GEWEIGERD',
      `${zonderStepUp} ${dagen.toFixed(2)} ${teLang} ${dbZonderVervaldatum} ${dbTeLang}`);
    const audit = { rows: [{ n: (await auditLijst({ ownerId: A, action: 'ai_grant_always_enabled' })).items.length }] };
    const shot = await submitCommand(br.agent, A, 'browser.screenshot', {});
    check("4. met 'altijd'-grant gaat een screenshot zonder klik; zichtbaar in de lijst met stopknop-gegevens; geaudit",
      shot.auto === true && (await grants.listAlwaysGrants(A)).some((g) => g.capability === 'browser.screenshot' && !!g.expires_at) && audit.rows[0].n >= 1, `audit=${audit.rows[0].n}`);
    await sys.query(`UPDATE app.ai_grants SET granted_at = now() - interval '2 days', expires_at = now() - interval '1 second' WHERE id = $1`, [met.grants[0].id]);
    const verlopen = await submitCommand(br.agent, A, 'browser.screenshot', {}).then((r) => r.auto ? 'auto' : 'vraagt', (e) => e.code);
    check("4. verlopen 'altijd'-grant: niets meer zonder klik", verlopen !== 'auto', verlopen);

    // 5. epoch + push
    const voor = (await grants.getSettings(A)).epoch;
    const n0 = ext.berichten.filter((m) => m.t === 'settings').length;
    await grants.setCapabilityCeiling(A, A, { 'browser.screenshot': false });
    const na = (await grants.getSettings(A)).epoch;
    check('5. plafond wijzigen: epoch + 1 en de agent krijgt {type:settings, epoch, caps} zonder de uitgezette mogelijkheid',
      na === voor + 1 && await until(() => ext.berichten.filter((m) => m.t === 'settings').length > n0)
      && (() => { const s = ext.berichten.filter((m) => m.t === 'settings').at(-1); return s.type === 'settings' && s.epoch === na && Array.isArray(s.caps) && !s.caps.some((c: any) => (c.capability ?? c) === 'browser.screenshot'); })());
    check('5. plafond uit: ook met grant geweigerd (CAPABILITY_OFF)', (await refusedCode(submitCommand(br.agent, A, 'browser.screenshot', {}))) === 'CAPABILITY_OFF');
    const n1 = ext.berichten.filter((m) => m.t === 'settings').length;
    await grants.revokeGrants(A, A, { agentId: br.agent.id, capability: 'browser.interact' });
    check('5. intrekken: ook epoch + 1 en push', (await grants.getSettings(A)).epoch === na + 1 && await until(() => ext.berichten.filter((m) => m.t === 'settings').length > n1));

    // 7. opnieuw koppelen trekt het vorige token van dezelfde installatie in
    const pid = `p-${randomUUID()}`;
    const oud = await nieuweBrowser(A, 'Chrome (thuis)', pid);
    const ander = await nieuweBrowser(A, 'Chrome (werk)', `p-${randomUUID()}`);
    const nieuw = await nieuweBrowser(A, 'Chrome (thuis, nieuw)', pid);
    const ingetrokken = await store.revokePreviousPairing(A, nieuw.agent.id, pid, 'Chrome (thuis, nieuw)', 'browser');
    check('7. opnieuw koppelen: het vorige token (zelfde pairing_id) werkt niet meer, een andere installatie blijft werken',
      JSON.stringify(ingetrokken) === JSON.stringify([oud.agent.id]) && (await store.findAgentByTokenHash(sha256(oud.token))) === null
      && !!(await store.findAgentByTokenHash(sha256(ander.token))) && !!(await store.findAgentByTokenHash(sha256(nieuw.token))));
    check('7. een ingetrokken agent krijgt geen ws-ticket-verbinding meer', await verbind({ ticket: issueWsTicket(oud.agent.id).ticket }).then(() => false, () => true));

    // 8. nooit een token in de URL; tickets eenmalig; accountclaim
    const inUrl = await verbind({}, `/agent/ws?token=${br.token}`).then(() => 'open', (e) => e.message);
    const ticketInUrl = await verbind({}, `/agent/ws?ticket=x`).then(() => 'open', (e) => e.message);
    check('8. een token of ticket in de URL: de upgrade wordt geweigerd (404)', inUrl === 'HTTP 404' && ticketInUrl === 'HTTP 404', `${inUrl} ${ticketInUrl}`);
    const t = issueWsTicket(ander.agent.id).ticket;
    const eerste = await verbind({ ticket: t });
    const tweede = await verbind({ ticket: t }).then(() => 'open', (e) => e.message);
    check('8. een ws-ticket werkt precies één keer', !!eerste && tweede === 'gesloten 4403', tweede);
    process.env.AGENT_WS_TOKEN_AUTH_LEGACY = '0';
    const legacy = await verbind({ token: ander.token }).then(() => 'open', (e) => e.message);
    delete process.env.AGENT_WS_TOKEN_AUTH_LEGACY;
    check('8. met AGENT_WS_TOKEN_AUTH_LEGACY=0 wordt een token in het eerste bericht niet meer aanvaard', legacy === 'gesloten 4403', legacy);
    const claimA = parseAccountClaim(`${A}:abc123`);
    check('8. accountclaim: zelfde gebruiker = ok; ander account = mismatch; geen of kapotte claim = unknown (allebei weigeren)',
      accountState(claimA, A) === 'ok' && accountState(parseAccountClaim(`${B}:x`), A) === 'mismatch'
      && accountState(parseAccountClaim(''), A) === 'unknown' && accountState(parseAccountClaim('<script>:x'), A) === 'unknown');

    // 6. blokkeren: één transactie, daarna verbindingen dicht
    const wacht = await submitCommand(ander.agent, A, 'browser.snapshot', {}).catch(() => null); // geen grant: geweigerd (geen rij)
    await grants.applyPreset(A, A, ander.agent.id, 'pomichnyk');
    const hangend = await submitCommand(ander.agent, A, 'browser.click', { name: 'X' });
    let gesloten = -1;
    eerste.gesloten.then((c) => { gesloten = c; });
    ext.gesloten.then(() => undefined);
    // Een mislukte blokkade (ongeldige reden-type → fout in de transactie) laat NIETS half achter.
    const kapot = await grants.blockUser(A, A, null as unknown as string).then(() => 'OK', () => 'FOUT');
    const halfweg = (await sys.query(`SELECT count(*)::int AS n FROM app.agents WHERE user_id = $1 AND revoked_at IS NOT NULL AND revoke_reason = 'blocked'`, [A])).rows[0].n;
    check('6. een mislukte blokkade laat niets half achter (alles of niets)', kapot === 'FOUT' && halfweg === 0, `${kapot} ${halfweg}`);
    const blok = await grants.blockUser(A, A, 'contracttest');
    const actieveAgents = (await sys.query('SELECT count(*)::int AS n FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL', [A])).rows[0].n;
    const actieveGrants = (await sys.query('SELECT count(*)::int AS n FROM app.ai_grants WHERE user_id = $1 AND revoked_at IS NULL', [A])).rows[0].n;
    check('6. blokkeren: alle tokens en grants ingetrokken, wachtende opdracht afgewezen, epoch + 1, daarna verbindingen dicht (4403)',
      actieveAgents === 0 && actieveGrants === 0 && (await store.getCommand(A, hangend.command.id))?.status === 'rejected'
      && blok.epoch > 0 && await until(() => gesloten === 4403) && await until(() => !agentOnline(ander.agent.id)) && wacht === null, `gesloten=${gesloten}`);
    check('6. na blokkeren: geen ticket- of tokenverbinding en geen nieuwe grant', (await store.findAgentByTokenHash(sha256(nieuw.token))) === null
      && (await grants.addGrants(A, A, [{ agentId: nieuw.agent.id, capability: 'browser.read' }], { steppedUp: true }).then(() => 'OK', (e) => e.message)) === 'USER_BLOCKED');
    check('isolatie: B is niet geraakt door de blokkade van A', (await grants.getSettings(B)).blocked_at === null);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 400));
  } finally {
    for (const s of sockets) { try { s.terminate(); } catch { /* al dicht */ } }
    await new Promise<void>((r) => server.close(() => r()));
    for (const u of [A, B]) {
      await sys.query('DELETE FROM app.agents WHERE user_id = $1', [u]).catch(() => undefined);
      await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = $1', [u]).catch(() => undefined);
    }
    await closePool();
  }
  return einde();
}
