// Ontgrendeling van de browserextensie (0.5 → 0.6, backend/extensie-ontgrendeling.ts, migraties 0072/0073) tegen de wegwerp-PG en een
// echte WebSocket-gateway op 127.0.0.1 (nagebootste extensie). Echte WebAuthn-handtekeningen (nep-passkey), echte tech-activeringen.
// 0.6: twee sloten per browser (agent met ruimte 'technisch' en agent met ruimte 'prive'); ontgrendeling v2 met ruimte.
//  - technisch slot: ongewijzigd t.o.v. 0.5 (profiel + activering + eigen passkey), alleen op een agent met ruimte 'technisch';
//  - prive slot: step-up van deze sessie (STEP_UP_REQUIRED zonder), caps = actieve toestemmingen ∩ beleid (GEEN_BROWSER_RECHTEN zonder),
//    nooit admin.*/api.*, ≤ einde toestemmingen; dispatch per agent-ruimte (een rij van het andere slot telt nooit).
//  - weigeringen: zonder profiel → GEEN_TECH_PROFIEL, zonder activering → TECH_NIET_ACTIEF, zonder passkey → GEEN_PASSKEY,
//    foute assertie → PASSKEY_ONGELDIG; ongeldige invoer (domein, duur, agent); elke weigering in app.audit;
//  - geldig: rij + push {t:'ontgrendeling'} met geldige HMAC; challenge eenmalig; opnieuw duwen na 'ready';
//  - server-afdwinging: zonder ontgrendeling, buiten domein of zonder cap gaat er niets naar de extensie;
//  - intrekken: site, extensie (WS + HTTP-terugval met agenttoken), einde activering (bijTechEinde), uitloggen, nieuw → push 'vergrendel'.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import * as grants from '../../backend/ai-toestemmingen';
import { submitCommand } from '../../backend/connectors-opdrachten';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import { agentOnline, attachAgentGateway } from '../../backend/connectors-gateway';
import * as store from '../../backend/connectors-opslag';
import { callTool } from '../../backend/connectors-hulpmiddelen';
import { schrijfBeleid } from '../../backend/extensie-beleid';
import * as eo from '../../backend/extensie-ontgrendeling';
import { metNamens } from '../../backend/mcp-namens';
import { STAP_OP_TABEL, totpStapOpVastleggen } from '../../backend/stap-op';
import * as tp from '../../backend/tech-profiel';
import { closePool, getPool } from '../../server/platform/pg';
import { ontgrendelTekst, PRIVE_HOSTS, WEIGER_UITLEG, WEIGER_UITLEG_PRIVE, type Ontgrendeling } from '../../shared/extensie-ontgrendeling';
import * as extShared from '../../extension/shared.js';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean> | boolean, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(40); }
  return false;
}
/** Assertie zoals de browser hem op mcp.tarasevych.com maakt (de dienst van de sessie in deze test). */
const bev = (p: Parameters<typeof bevestig>[0], c: string, o: Parameters<typeof bevestig>[2] = {}) => bevestig(p, c, { origin: 'https://mcp.tarasevych.com', ...o });
const code = async (p: Promise<unknown>): Promise<string> => p.then(() => 'OK', (e) => (e instanceof eo.Weigering ? e.code : `ANDERS:${(e as Error).message}`));

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-ontgrendeling');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const U = `ext-u-${T}`, N = `ext-n-${T}`;
  const server = createServer();
  attachAgentGateway(server, new Set(['127.0.0.1']));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const agentIds: string[] = [];

  /** Nagebootste extensie 0.6 (één slot): verbindt met haar token, bewaart elk bericht en antwoordt op opdrachten. */
  const extensie = (token: string) => new Promise<{ ws: WebSocket; berichten: any[] }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent/ws`); sockets.push(ws);
    const berichten: any[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token, version: '0.6.2', capabilities: { kind: 'browser' } })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()); berichten.push(m);
      if (m.t === 'ready') resolve({ ws, berichten });
      if (m.t === 'cmd') ws.send(JSON.stringify({ t: 'result', id: m.id, ok: true, data: { ok: true, type: m.type } }));
    });
    ws.on('error', reject);
  });
  const reset = () => sys.query("DELETE FROM app.rate_limits WHERE bucket LIKE 'ext-ontgrendel%' AND bucket LIKE $1", [`%${U}`]).catch(() => undefined);
  const audits = async (actie: string, uid = U) => Number((await sys.query('SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = $2', [uid, actie])).rows[0].n);

  try {
    // ---------------------------------------------------------------- gebruikers, profiel, browser
    for (const [id, mail] of [[U, `ext-u-${T}@example.test`], [N, `ext-n-${T}@example.test`]]) {
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', id, { email: mail, role: 'user', status: 'approved', name: id }]);
    }
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['ontwikkelaar'], 240, 'test')`, [U, `tech-${randomBytes(6).toString('hex')}`]);
    // 20.10.2026: de technische kant van de AI is ondergeschikt aan de stand van de dienst «ai» in de gescheiden
    // gegevensruimtes (0082). Die staat standaard op «uit»; deze test gaat daar niet over, dus zetten we hem aan
    // (tests/eenheid/hulp/ruimte-ai.ts; de standen zelf staan in tests/eenheid/ruimte-ai-20261020.test.ts).
    await aiDienstAan(U);
    await aiDienstAan(N);   // ook het tweede account: deze test vergelijkt het SLOT, niet de ruimtescheiding
    const gU = { id: U, email: `ext-u-${T}@example.test`, role: 'user', status: 'approved' };
    const gN = { id: N, email: `ext-n-${T}@example.test`, role: 'user', status: 'approved' };
    const tab = randomBytes(24).toString('hex');
    const sessie = { id: randomUUID(), createdAt: Date.now() - 1000 };
    const aU: eo.Aanroep = { user: gU, service: 'mcp', tabContext: tab, session: sessie, tabSession: null };
    const aN: eo.Aanroep = { user: gN, service: 'mcp', tabContext: randomBytes(24).toString('hex'), session: { id: randomUUID(), createdAt: Date.now() }, tabSession: null };

    const token = randomToken(32);
    const key = newCommandKey();
    // Technisch slot van de browser (ruimte 'technisch', pairingId gedeeld met het prive slot verderop).
    const PID = `pid-${T}`.replace(/[^A-Za-z0-9_-]/g, '');
    const agent = await store.createAgent(U, `Chrome (ontgrendel ${T})`, 'browser', sha256(token), {}, undefined, { pairingId: PID, commandKeyEnc: sealCommandKey(key, U, sha256(token)), version: '0.6.2', ruimte: 'technisch' });
    agentIds.push(agent.id);
    const tokenOud = randomToken(32);
    const oud = await store.createAgent(U, `Chrome oud (${T})`, 'browser', sha256(tokenOud), {}, undefined, { commandKeyEnc: sealCommandKey(newCommandKey(), U, sha256(tokenOud)), version: '0.5.0', ruimte: 'technisch' });
    agentIds.push(oud.id);
    await store.setBrowserEnabled(U, agent.id, true);
    await grants.addGrants(U, U, [{ agentId: agent.id, capability: 'browser.read' }, { agentId: agent.id, capability: 'browser.navigate' }], { steppedUp: false });
    const ext = await extensie(token);
    check('extensie 0.6 (technisch slot) verbindt en staat online', await until(() => agentOnline(agent.id)));

    // ---------------------------------------------------------------- weigeringen
    const rN = await eo.recht(gN, aN.tabContext, null);
    check('zonder technisch profiel: recht GEEN_TECH_PROFIEL, magOntgrendelen false', !rN.magOntgrendelen && rN.code === 'GEEN_TECH_PROFIEL', JSON.stringify(rN));
    const wN = await eo.uitdaging(aN, { agentId: agent.id, minuten: 30 }).then(() => null, (e) => e);
    check('zonder technisch profiel: uitdaging → GEEN_TECH_PROFIEL (403) met uitleg uk/nl', wN instanceof eo.Weigering && wN.code === 'GEEN_TECH_PROFIEL' && wN.status === 403
      && eo.weigerAntwoord(wN.code).uitleg.uk === WEIGER_UITLEG.GEEN_TECH_PROFIEL.uk && !!eo.weigerAntwoord(wN.code).uitleg.nl);
    check('weigerAntwoord: vorm {error, uitleg:{uk,nl}, actie?}', JSON.stringify(Object.keys(eo.weigerAntwoord('TECH_NIET_ACTIEF'))) === '["error","uitleg","actie"]' && eo.weigerAntwoord('TECH_NIET_ACTIEF').actie?.url.startsWith('https://') === true);

    check('profiel zonder lopende activering: TECH_NIET_ACTIEF', (await eo.recht(gU, tab, sessie)).code === 'TECH_NIET_ACTIEF' && (await code(eo.uitdaging(aU, { agentId: agent.id, minuten: 30 }))) === 'TECH_NIET_ACTIEF');
    await tp.activeren(gU, tab, 60, 'test ontgrendeling extensie', sessie);
    const rZonderPk = await eo.recht(gU, tab, sessie);
    check('activering zonder passkey: GEEN_PASSKEY (409), caps van de rol al zichtbaar', rZonderPk.code === 'GEEN_PASSKEY' && rZonderPk.caps.length === 7 && rZonderPk.passkeys === 0
      && (await code(eo.uitdaging(aU, { agentId: agent.id, minuten: 30 }))) === 'GEEN_PASSKEY' && new eo.Weigering('GEEN_PASSKEY').status === 409, JSON.stringify(rZonderPk));
    check('andere tab (zelfde account) zonder activering: TECH_NIET_ACTIEF', (await eo.recht(gU, randomBytes(24).toString('hex'), sessie)).code === 'TECH_NIET_ACTIEF');

    // eigen passkey registreren (rechtstreeks, zoals toegangssleutels.ts dat na een registratie opslaat)
    const pk = nieuwePasskey();
    const reg = kern.verifieerRegistratie({ ...registreer(pk, 'c-reg'), verwachteUitdaging: 'c-reg', rpId: 'tarasevych.com', origins: ['https://admin.tarasevych.com'] }) as any;
    await sys.query(`INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam) VALUES ($1, $2, $3, $4::jsonb, $5, 'test')`, [U, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk]);
    const r = await eo.recht(gU, tab, sessie);
    check('profiel + activering + passkey: magOntgrendelen, rollen = activering, activatieTot = einde activering', r.magOntgrendelen && !r.code && r.rollen.join() === 'ontwikkelaar' && r.passkeys === 1
      && !!r.activatieTot && r.activatieTot > Date.now() + 59 * 60_000, JSON.stringify({ ...r, activatie: undefined }));
    await reset();
    check('ongeldige invoer: domein buiten de lijst, duur, onbekende/oude agent',
      (await code(eo.uitdaging(aU, { agentId: agent.id, minuten: 30, domeinen: ['evil.example'] }))) === 'DOMEIN_ONGELDIG'
      && (await code(eo.uitdaging(aU, { agentId: agent.id, minuten: 30, domeinen: [] }))) === 'DOMEIN_ONGELDIG'
      // 0.7.0: 481 minuten mag (keuze van de eigenaar tot 366 dagen) — maar niet voor een extensie 0.6.2 (TERMIJN_VEREIST_UPDATE); boven MAX_MINUTEN blijft DUUR_ONGELDIG.
      && (await code(eo.uitdaging(aU, { agentId: agent.id, minuten: 481 }))) === 'OK'
      && (await code(eo.uitdaging(aU, { agentId: agent.id, termijn: '7d' }))) === 'TERMIJN_VEREIST_UPDATE'
      && (await code(eo.uitdaging(aU, { agentId: agent.id, minuten: 366 * 24 * 60 + 1 }))) === 'DUUR_ONGELDIG'
      && (await code(eo.uitdaging(aU, { agentId: agent.id, termijn: 'geen-termijn' }))) === 'DUUR_ONGELDIG'
      && (await code(eo.uitdaging(aU, { agentId: randomUUID(), minuten: 30 }))) === 'AGENT_ONBEKEND'
      && (await code(eo.uitdaging(aU, { agentId: oud.id, minuten: 30 }))) === 'EXTENSIE_TE_OUD');

    // foute asserties
    await reset();
    const u1 = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30, domeinen: ['mcp.tarasevych.com'] });
    check('uitdaging: voorstel (caps van de rol, domeinen, eind ≤ activering) + publicKey met UV verplicht en eigen passkey',
      u1.voorstel.caps.length === 7 && u1.voorstel.domeinen.join() === 'mcp.tarasevych.com' && Math.abs(u1.voorstel.eind - (Date.now() + 30 * 60_000)) < 10_000
      && u1.publicKey.userVerification === 'required' && u1.publicKey.allowCredentials.length === 1 && u1.publicKey.challenge.length === 43 && u1.verloopt - Date.now() <= 5 * 60_000 + 2000);
    const vreemdPk = nieuwePasskey();
    check('foute assertie (andere sleutel) → PASSKEY_ONGELDIG', (await code(eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u1.uitdagingId, assertie: bev(vreemdPk, u1.publicKey.challenge, { credentialId: pk.credentialId }) }))) === 'PASSKEY_ONGELDIG');
    const u2 = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30, domeinen: ['mcp.tarasevych.com'] });
    check('foute assertie (verkeerde challenge) → PASSKEY_ONGELDIG', (await code(eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u2.uitdagingId, assertie: bev(pk, 'een-andere-challenge') }))) === 'PASSKEY_ONGELDIG');
    const u2b = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30, domeinen: ['mcp.tarasevych.com'] });
    check('assertie zonder gebruikersverificatie (UV) → PASSKEY_ONGELDIG', (await code(eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u2b.uitdagingId, assertie: bev(pk, u2b.publicKey.challenge, { uv: false }) }))) === 'PASSKEY_ONGELDIG');
    check('geen rij na weigeringen; weigeringen staan in app.audit', Number((await sys.query('SELECT count(*)::int AS n FROM app.extensie_ontgrendelingen WHERE user_id = $1', [U])).rows[0].n) === 0
      && (await audits('owner.extensie.geweigerd')) >= 8 && (await audits('owner.extensie.geweigerd', N)) >= 1);

    // ---------------------------------------------------------------- zonder ontgrendeling: niets naar de extensie
    const zonder = await submitCommand(agent, U, 'browser.snapshot', {});
    const zonderNa = await store.getCommand(U, zonder.command.id);
    // Het technische slot is alleen zichtbaar voor een aanroep in de technische ruimte (apparatenInRuimte).
    const viaTool = await metNamens({ client: 'test', ruimte: 'technisch' }, () => callTool(U, 'browser_snapshot', {}));
    check('dispatch zonder ontgrendeling: failed met EXTENSIE_VERGRENDELD, extensie ontvangt niets; callTool weigert vooraf',
      zonderNa.status === 'failed' && /EXTENSIE_VERGRENDELD/.test(String(zonderNa.result?.error)) && !ext.berichten.some((m) => m.t === 'cmd')
      && viaTool.isError === true && /EXTENSIE_VERGRENDELD/.test(viaTool.content[0].text), JSON.stringify(zonderNa.result));

    // ---------------------------------------------------------------- geldige ontgrendeling
    for (const origin of ['https://admin.tarasevych.com', 'https://id.tarasevych.com', 'https://hub.tarasevych.com']) {
      const ux = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30 });
      check(`review 2: assertie vanaf ${origin} op een mcp-sessie → PASSKEY_ONGELDIG (alleen de origin van de eigen dienst)`, (await code(eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: ux.uitdagingId, assertie: bevestig(pk, ux.publicKey.challenge, { origin }) }))) === 'PASSKEY_ONGELDIG');
    }
    await reset();
    const u3 = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30, domeinen: ['mcp.tarasevych.com'] });
    const assertie = bevestig(pk, u3.publicKey.challenge, { origin: 'https://mcp.tarasevych.com' });
    const ok = await eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u3.uitdagingId, assertie });
    const rij = (await sys.query('SELECT * FROM app.extensie_ontgrendelingen WHERE id = $1', [ok.ontgrendeling.gid])).rows[0];
    check('geldig: rij met caps/domeinen/activering/passkey (0.7.0: 7 caps, einde_soort tech-einde)', !!rij && rij.agent_id === agent.id && rij.user_id === U && rij.caps.length === 7 && rij.domeinen.join() === 'mcp.tarasevych.com' && rij.einde_soort === 'tech-einde' && rij.overleeft_activatie === false
      && !!rij.activatie_id && /^[0-9a-f]{16}$/.test(rij.passkey_vinger) && rij.ingetrokken_op === null && ok.verzonden === true && ok.ontgrendeling.rollen.join() === 'ontwikkelaar');
    check('geldig: push {t:ontgrendeling, grant, sig} bereikt de extensie', await until(() => ext.berichten.some((m) => m.t === 'ontgrendeling' && m.grant?.gid === ok.ontgrendeling.gid)));
    const push = ext.berichten.find((m) => m.t === 'ontgrendeling' && m.grant?.gid === ok.ontgrendeling.gid);
    const g = push.grant as Ontgrendeling;
    check('geldig: HMAC-SHA256(opdrachtsleutel, ontgrendelTekst(grant)) klopt; velden v/agentId/userId/iat/exp/nonce',
      push.sig === createHmac('sha256', Buffer.from(key, 'base64url')).update(ontgrendelTekst(g)).digest('hex') && g.v === 2 && g.ruimte === 'technisch' && g.agentId === agent.id && g.userId === U
      && g.exp === ok.ontgrendeling.eind && g.iat === ok.ontgrendeling.begin && g.exp - g.iat <= 480 * 60_000 && /^[A-Za-z0-9_-]{22}$/.test(g.nonce));
    const vx = extShared as unknown as { verifyOntgrendeling?: (k: string, g: unknown, s: string, e: unknown, now?: number) => Promise<{ ok: boolean; code?: string }> };
    if (typeof vx.verifyOntgrendeling === 'function') {
      const v = await vx.verifyOntgrendeling(key, g, push.sig, { agentId: agent.id, userId: U, ruimte: 'technisch' });
      check('extensie (extension/shared.js) verifyOntgrendeling aanvaardt de push', v.ok === true, JSON.stringify(v));
    } else console.log('OVERGESLAGEN: extension/shared.js heeft (nog) geen verifyOntgrendeling');
    check('geldig: in app.audit (owner.extensie.ontgrendeld)', (await audits('owner.extensie.ontgrendeld')) === 1);
    check('challenge eenmalig: dezelfde uitdaging nogmaals → UITDAGING_ONGELDIG', (await code(eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u3.uitdagingId, assertie }))) === 'UITDAGING_ONGELDIG');
    const u4 = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30 });
    check('challenge gebonden aan agent: andere agentId → UITDAGING_ONGELDIG', (await code(eo.ontgrendelen(aU, { agentId: oud.id, uitdagingId: u4.uitdagingId, assertie: bev(pk, u4.publicKey.challenge) }))) === 'UITDAGING_ONGELDIG');
    await sys.query("UPDATE app.passkey_uitdagingen SET aangemaakt_op = now() - interval '6 minutes', verloopt_op = now() - interval '1 minute' WHERE user_id = $1 AND gebruikt_op IS NULL", [U]);
    const u5 = await eo.uitdaging(aU, { agentId: agent.id, minuten: 30 });
    await sys.query("UPDATE app.passkey_uitdagingen SET aangemaakt_op = now() - interval '6 minutes', verloopt_op = now() - interval '1 minute' WHERE id = $1", [u5.uitdagingId]);
    check('challenge ouder dan 5 minuten → UITDAGING_ONGELDIG', (await code(eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u5.uitdagingId, assertie: bev(pk, u5.publicKey.challenge) }))) === 'UITDAGING_ONGELDIG');

    // ---------------------------------------------------------------- server-afdwinging met ontgrendeling
    const binnen = await submitCommand(agent, U, 'browser.navigate', { url: 'https://mcp.tarasevych.com/agents' });
    check('met ontgrendeling: opdracht op een ontgrendelde host gaat naar de extensie', await until(async () => (await store.getCommand(U, binnen.command.id))?.status === 'succeeded')
      && ext.berichten.some((m) => m.t === 'cmd' && m.id === binnen.command.id));
    const buiten = await submitCommand(agent, U, 'browser.navigate', { url: 'https://mail.tarasevych.com/' });
    const buitenNa = await store.getCommand(U, buiten.command.id);
    check('buiten de ontgrendelde domeinen (grant staat het wel toe): failed EXTENSIE_HOST met het pad naar «Браузер і агенти», niets verstuurd',
      buitenNa.status === 'failed' && /EXTENSIE_HOST/.test(String(buitenNa.result?.error)) && /agents#browser/.test(String(buitenNa.result?.error)) && !ext.berichten.some((m) => m.t === 'cmd' && m.id === buiten.command.id), JSON.stringify(buitenNa.result));
    const metPoort = await eo.controleerBrowserOpdracht(agent.id, U, 'browser.navigate', { url: 'https://mcp.tarasevych.com:8443/agents' });
    const metGebruiker = await eo.controleerBrowserOpdracht(agent.id, U, 'browser.navigate', { url: 'https://x@mcp.tarasevych.com/agents' });
    const zonderPoort = await eo.controleerBrowserOpdracht(agent.id, U, 'browser.navigate', { url: 'https://mcp.tarasevych.com/agents' });
    check('review 3: host met poort of gebruikersgegevens telt niet als ontgrendelde host', !metPoort.ok && !metGebruiker.ok && zonderPoort.ok);
    check('AI-activiteit: push {t:agent-status, verbonden:true}', await until(() => ext.berichten.some((m) => m.t === 'agent-status' && m.verbonden === true)));
    // cap-controle op een rij met minder caps (fixture voor een tweede, onverbonden agent)
    const tokenC = randomToken(32);
    const capAgent = await store.createAgent(U, `Chrome cap (${T})`, 'browser', sha256(tokenC), {}, undefined, { version: '0.6.2', ruimte: 'technisch' });
    agentIds.push(capAgent.id);
    await ontgrendelVoorTest(capAgent.id, U, { caps: ['browser.read'], domeinen: ['mcp.tarasevych.com'] });
    const capUit = await eo.controleerBrowserOpdracht(capAgent.id, U, 'browser.click', { name: 'x' });
    const capIn = await eo.controleerBrowserOpdracht(capAgent.id, U, 'browser.snapshot', {});
    const anderUser = await eo.controleerBrowserOpdracht(capAgent.id, N, 'browser.snapshot', {});
    check('cap niet in de ontgrendeling → EXTENSIE_CAP; cap erin → ok; andere gebruiker → vergrendeld',
      !capUit.ok && /^EXTENSIE_CAP/.test(capUit.fout) && capIn.ok && !anderUser.ok && /^EXTENSIE_VERGRENDELD/.test((anderUser as { fout: string }).fout));

    // ---------------------------------------------------------------- status (site) en opnieuw duwen na ready
    ext.ws.send(JSON.stringify({ t: 'status', staat: 'ontgrendeld', gid: ok.ontgrendeling.gid, exp: ok.ontgrendeling.eind, lokaal: false, lokaalVerbonden: false, version: '0.6.2' }));
    await sleep(150);
    const st = await eo.extensieStatus(gU, tab, sessie);
    const mijn = st.agenten.find((x) => x.agentId === agent.id)!;
    check('extensie-status: agent online (ruimte technisch), staat uit de melding, ontgrendeling, AI verbonden, recht (oud + technisch)', !!mijn && mijn.online && mijn.staat === 'ontgrendeld' && mijn.versie === '0.6.2'
      && mijn.ruimte === 'technisch' && mijn.ontgrendeling?.ruimte === 'technisch' && mijn.toestemming === undefined
      && mijn.ontgrendeling?.gid === ok.ontgrendeling.gid && mijn.ai.verbonden === true && mijn.ai.agenten.length >= 1 && st.recht.magOntgrendelen === true
      && st.recht.technisch?.mag === true && st.recht.technisch.maxMinuten === 366 * 24 * 60 && typeof st.nu === 'number' && st.beheer === false && st.beleid.priveAan === true
      && st.agenten.find((x) => x.agentId === oud.id)?.online === false && st.agenten.find((x) => x.agentId === oud.id)?.staat === 'onbekend', JSON.stringify(mijn));
    let ext2 = await extensie(token);
    check('na een nieuwe verbinding (ready) duwt de server de lopende ontgrendeling opnieuw', await until(() => ext2.berichten.some((m) => m.t === 'ontgrendeling' && m.grant?.gid === ok.ontgrendeling.gid)));

    // ---------------------------------------------------------------- intrekken door de site
    const n = await eo.intrekken(U, { agentId: agent.id }, 'site', 'site');
    check('intrekken (site): rij ingetrokken + push {t:vergrendel, gid, reden:site}', n === 1 && await until(() => ext2.berichten.some((m) => m.t === 'vergrendel' && m.gid === ok.ontgrendeling.gid && m.reden === 'site'))
      && (await sys.query('SELECT reden_einde, ingetrokken_door FROM app.extensie_ontgrendelingen WHERE id = $1', [ok.ontgrendeling.gid])).rows[0].reden_einde === 'site');
    ext2.ws.terminate();
    await until(() => !agentOnline(agent.id));
    const ext3 = await extensie(token);
    check('review 1: herverbinden zonder lopende rij → server stuurt {t:vergrendel, reden:ingetrokken} zonder gid', await until(() => ext3.berichten.some((m) => m.t === 'vergrendel' && m.reden === 'ingetrokken' && !('gid' in m)))
      && !ext3.berichten.some((m) => m.t === 'ontgrendeling'));
    ext3.ws.send(JSON.stringify({ t: 'pong', staat: 'ontgrendeld', gid: ok.ontgrendeling.gid, exp: ok.ontgrendeling.eind, lokaalVerbonden: false }));
    check('review 1: pong/status met een gid die niet meer loopt → {t:vergrendel, gid, reden:ingetrokken}', await until(() => ext3.berichten.some((m) => m.t === 'vergrendel' && m.gid === ok.ontgrendeling.gid && m.reden === 'ingetrokken')));
    ext2 = ext3;
    const naIntrekken = await submitCommand(agent, U, 'browser.snapshot', {});
    check('na intrekken: dispatch weer geweigerd', (await store.getCommand(U, naIntrekken.command.id)).status === 'failed');

    // ---------------------------------------------------------------- nieuw vervangt vorige; einde activering trekt in
    await reset();
    const nieuw = async () => { const u = await eo.uitdaging(aU, { agentId: agent.id, minuten: 60 }); return eo.ontgrendelen(aU, { agentId: agent.id, uitdagingId: u.uitdagingId, assertie: bev(pk, u.publicKey.challenge) }); };
    const o1 = await nieuw();
    const o2 = await nieuw();
    check('nieuwe ontgrendeling trekt de vorige in (reden nieuw) en duwt vergrendel voor de oude gid',
      (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o1.ontgrendeling.gid])).rows[0].reden_einde === 'nieuw'
      && await until(() => ext2.berichten.some((m) => m.t === 'vergrendel' && m.gid === o1.ontgrendeling.gid && m.reden === 'nieuw')));
    check('standaarddomeinen (zonder keuze): admin + mcp', o2.ontgrendeling.domeinen.join() === 'admin.tarasevych.com,mcp.tarasevych.com');
    await tp.beeindigen(gU, tab, sessie);
    check('einde technische activering (bijTechEinde): ingetrokken met reden tech-einde + push vergrendel',
      await until(async () => (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o2.ontgrendeling.gid])).rows[0].reden_einde === 'tech-einde')
      && await until(() => ext2.berichten.some((m) => m.t === 'vergrendel' && m.gid === o2.ontgrendeling.gid && m.reden === 'tech-einde')));

    // uitloggen
    await tp.activeren(gU, tab, 60, 'test ontgrendeling extensie 2', sessie);
    const o3 = await nieuw();
    await tp.beeindigenBijUitloggen(U);
    check('uitloggen: ingetrokken met reden uitgelogd + push',
      await until(async () => (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o3.ontgrendeling.gid])).rows[0].reden_einde === 'uitgelogd')
      && await until(() => ext2.berichten.some((m) => m.t === 'vergrendel' && m.gid === o3.ontgrendeling.gid && m.reden === 'uitgelogd')));

    // vervangen activering (geen bijTechEinde): vangnet veeg()
    await tp.activeren(gU, tab, 60, 'test ontgrendeling extensie 3', sessie);
    const o4 = await nieuw();
    await tp.activeren(gU, tab, 60, 'test ontgrendeling extensie 4', sessie);
    check('activering vervangen: dispatch meteen vergrendeld (activering loopt niet meer)', !(await eo.controleerBrowserOpdracht(agent.id, U, 'browser.snapshot', {})).ok);
    check('review 5: activering vervangen → ontgrendeling direct ingetrokken (tech-einde), zonder te wachten op veeg()',
      await until(async () => (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o4.ontgrendeling.gid])).rows[0].reden_einde === 'tech-einde', 3000));
    await eo.veeg();
    check('daarna: rij afgesloten (tech-einde) + push', (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o4.ontgrendeling.gid])).rows[0].reden_einde === 'tech-einde'
      && await until(() => ext2.berichten.some((m) => m.t === 'vergrendel' && m.gid === o4.ontgrendeling.gid)));

    // ---------------------------------------------------------------- de extensie trekt zelf in (WS en HTTP-terugval)
    await reset();
    const o5 = await nieuw();
    ext2.ws.send(JSON.stringify({ t: 'vergrendel-verzoek', gid: o5.ontgrendeling.gid, reden: 'popup' }));
    check('extensie (WS vergrendel-verzoek, popup): ingetrokken_door extensie, reden popup, zonder passkey',
      await until(async () => { const x = (await sys.query('SELECT reden_einde, ingetrokken_door FROM app.extensie_ontgrendelingen WHERE id = $1', [o5.ontgrendeling.gid])).rows[0]; return x.reden_einde === 'popup' && x.ingetrokken_door === 'extensie'; }));
    const o6 = await nieuw();
    const http = await eo.intrekkenMetAgentToken(token, { gid: o6.ontgrendeling.gid, reden: 'zijpaneel' });
    check('HTTP-terugval met het agenttoken: ingetrokken (zijpaneel); vals token → null',
      http?.ingetrokken === 1 && (await eo.intrekkenMetAgentToken('x'.repeat(40), { reden: 'popup' })) === null
      && (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o6.ontgrendeling.gid])).rows[0].reden_einde === 'zijpaneel');
    const o7 = await nieuw();
    await grants.stopAll(U, U);
    check('noodstop (stopAll): ontgrendeling ingetrokken met reden noodstop',
      await until(async () => (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [o7.ontgrendeling.gid])).rows[0].reden_einde === 'noodstop'));
    check('elke intrekking staat in app.audit (site, nieuw, tech-einde, uitgelogd, vangnet, popup, zijpaneel, noodstop)', await until(async () => (await audits('owner.extensie.ingetrokken')) >= 8), String(await audits('owner.extensie.ingetrokken')));

    // ================================================================ 0.6: prive slot (zelfde browser, tweede koppeling)
    const tokenP = randomToken(32);
    const keyP = newCommandKey();
    const P = await store.createAgent(U, `Chrome prive (${T})`, 'browser', sha256(tokenP), {}, undefined, { pairingId: PID, commandKeyEnc: sealCommandKey(keyP, U, sha256(tokenP)), version: '0.6.2', ruimte: 'prive' });
    agentIds.push(P.id);
    await store.setBrowserEnabled(U, P.id, true);
    const extP = await extensie(tokenP);
    check('0.6: prive slot verbindt; na ready zonder lopende rij → {t:vergrendel} zonder gid (per agent)', await until(() => extP.berichten.some((m) => m.t === 'vergrendel' && !('gid' in m))));
    const sP = { id: randomUUID(), createdAt: Date.now() - 1000 };
    const aP: eo.Aanroep = { user: gU, service: 'mcp', tabContext: randomBytes(24).toString('hex'), session: sP, tabSession: null };
    const codeR = async (p: Promise<unknown>): Promise<string> => p.then(() => 'OK', (e) => (e instanceof eo.Weigering ? `${e.code}@${e.ruimte ?? '-'}` : `ANDERS:${(e as Error).message}`));
    await reset();
    // zonder toestemmingen (stopAll trok alles in) en zonder step-up: eerst de toestemmingen (geen venster voor iets dat toch geweigerd wordt)
    const geenGrants = await eo.priveOntgrendelen(aP, { agentId: P.id }).then(() => null, (e) => e);
    check('prive zonder toestemmingen → GEEN_BROWSER_RECHTEN met prive-uitleg («Спершу дозвольте ШІ…»)', geenGrants instanceof eo.Weigering && geenGrants.code === 'GEEN_BROWSER_RECHTEN'
      && eo.weigerAntwoord(geenGrants.code, geenGrants.ruimte).uitleg.uk === WEIGER_UITLEG_PRIVE.GEEN_BROWSER_RECHTEN!.uk && /Спершу дозвольте ШІ/.test(eo.weigerAntwoord('GEEN_BROWSER_RECHTEN', 'prive').uitleg.uk)
      && eo.weigerAntwoord('GEEN_BROWSER_RECHTEN', 'technisch').uitleg.uk === WEIGER_UITLEG.GEEN_BROWSER_RECHTEN.uk, String(geenGrants?.code));
    await grants.addGrants(U, U, [{ agentId: P.id, capability: 'browser.read' }, { agentId: P.id, capability: 'browser.navigate', minutes: 120 }], { steppedUp: false });
    const zonderSu = await eo.priveOntgrendelen(aP, { agentId: P.id }).then(() => null, (e) => e);
    const suAntw = zonderSu instanceof eo.Weigering ? eo.weigerAntwoord(zonderSu.code, zonderSu.ruimte) : null;
    check('prive met toestemmingen maar zonder step-up van deze sessie → 403 STEP_UP_REQUIRED (reasonCode, methods, maxAgeSeconds, uitleg)',
      zonderSu instanceof eo.Weigering && zonderSu.code === 'STEP_UP_REQUIRED' && zonderSu.status === 403 && suAntw?.reasonCode === 'STEP_UP_REQUIRED'
      && suAntw.maxAgeSeconds === 300 && !!suAntw.methods?.includes('totp') && !!suAntw.uitleg.uk, JSON.stringify(suAntw));
    // step-up van een ANDERE sessie telt niet
    await totpStapOpVastleggen({ user: { id: U }, session: { id: randomUUID(), createdAt: Date.now() }, tabSession: null });
    check('step-up van een andere sessie telt niet → STEP_UP_REQUIRED', (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id }))) === 'STEP_UP_REQUIRED@prive');
    await totpStapOpVastleggen({ user: { id: U }, session: sP, tabSession: null });
    await grants.revokeGrants(U, U, { agentId: P.id });
    check('met step-up maar zonder toestemmingen → GEEN_BROWSER_RECHTEN', (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id }))) === 'GEEN_BROWSER_RECHTEN@prive');
    // Beide toestemmingen 120 minuten: het einde van de ontgrendeling = het laatste einde van de toestemmingen die erin zitten.
    await grants.addGrants(U, U, [{ agentId: P.id, capability: 'browser.read', minutes: 120 }, { agentId: P.id, capability: 'browser.navigate', minutes: 120 }], { steppedUp: false });
    await reset();
    check('prive: ongeldige invoer (admin.*, api.*, leeg, onbekend domein, dagen 2) → DOMEIN_ONGELDIG / DUUR_ONGELDIG',
      (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id, domeinen: ['admin.tarasevych.com'] }))) === 'DOMEIN_ONGELDIG@prive'
      && (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id, domeinen: ['api.tarasevych.com'] }))) === 'DOMEIN_ONGELDIG@prive'
      && (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id, domeinen: [] }))) === 'DOMEIN_ONGELDIG@prive'
      && (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id, domeinen: ['evil.example'] }))) === 'DOMEIN_ONGELDIG@prive'
      && (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id, dagen: 2 }))) === 'DUUR_ONGELDIG@prive');
    await reset();
    check('ruimte-mismatch: prive ontgrendelen op het technische slot → VERKEERDE_RUIMTE; technisch (passkey) op het prive slot → VERKEERDE_RUIMTE',
      (await codeR(eo.priveOntgrendelen(aP, { agentId: agent.id }))) === 'VERKEERDE_RUIMTE@prive'
      && (await codeR(eo.uitdaging(aU, { agentId: P.id, minuten: 30 }))) === 'VERKEERDE_RUIMTE@technisch');
    // dispatch vóór de prive-ontgrendeling: ook een rij van het ANDERE slot (ruimte technisch) op deze agent telt niet
    await ontgrendelVoorTest(P.id, U, { ruimte: 'technisch', domeinen: ['mcp.tarasevych.com'] });
    const pZonder = await submitCommand(P, U, 'browser.snapshot', {});
    const pZonderNa = await store.getCommand(U, pZonder.command.id);
    check('dispatch: prive-agent zonder prive-ontgrendeling (alleen een rij met ruimte technisch) → failed EXTENSIE_VERGRENDELD, niets verstuurd',
      pZonderNa.status === 'failed' && /EXTENSIE_VERGRENDELD/.test(String(pZonderNa.result?.error)) && !extP.berichten.some((m) => m.t === 'cmd'), JSON.stringify(pZonderNa.result));
    await sys.query('UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = $2 WHERE agent_id = $1 AND ingetrokken_op IS NULL', [P.id, 'test']);
    // geldig
    const po = await eo.priveOntgrendelen(aP, { agentId: P.id, dagen: 7 });
    const pRij = (await sys.query('SELECT * FROM app.extensie_ontgrendelingen WHERE id = $1', [po.ontgrendeling.gid])).rows[0];
    check('prive geldig: caps = toestemmingen (read+navigate), domeinen = PRIVE_HOSTS, ruimte prive, geen activering, bevestigd met totp; eind ≤ einde toestemmingen (120 min) ondanks 7 dagen',
      po.ontgrendeling.caps.join() === 'browser.read,browser.navigate' && po.ontgrendeling.domeinen.join() === [...PRIVE_HOSTS].sort().join() && po.ontgrendeling.ruimte === 'prive'
      && pRij.ruimte === 'prive' && pRij.activatie_id === null && pRij.bevestigd_met === 'totp' && po.ontgrendeling.bevestigdMet === 'totp'
      && po.ontgrendeling.eind - Date.now() > 115 * 60_000 && po.ontgrendeling.eind - Date.now() < 125 * 60_000 && po.verzonden === true, JSON.stringify(po));
    check('prive geldig: push {t:ontgrendeling} v2 met ruimte prive en geldige HMAC (sleutel van DIT slot)', await until(() => extP.berichten.some((m) => m.t === 'ontgrendeling' && m.grant?.gid === po.ontgrendeling.gid)));
    const pPush = extP.berichten.find((m) => m.t === 'ontgrendeling' && m.grant?.gid === po.ontgrendeling.gid);
    check('prive push: v 2, ruimte prive, HMAC met keyP (niet met de sleutel van het technische slot), nooit admin.*',
      pPush.grant.v === 2 && pPush.grant.ruimte === 'prive' && pPush.sig === createHmac('sha256', Buffer.from(keyP, 'base64url')).update(ontgrendelTekst(pPush.grant)).digest('hex')
      && pPush.sig !== createHmac('sha256', Buffer.from(key, 'base64url')).update(ontgrendelTekst(pPush.grant)).digest('hex') && !pPush.grant.domeinen.includes('admin.tarasevych.com'));
    if (typeof vx.verifyOntgrendeling === 'function') {
      const vp = await vx.verifyOntgrendeling(keyP, pPush.grant, pPush.sig, { agentId: P.id, userId: U, ruimte: 'prive' });
      check('extensie (extension/shared.js) aanvaardt de prive-push in het prive slot', vp.ok === true, JSON.stringify(vp));
    }
    check('prive: audit owner.extensie.ontgrendeld met ruimte prive', Number((await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.extensie.ontgrendeld' AND details->>'ruimte' = 'prive'", [U])).rows[0].n) === 1);
    // dispatch met prive-ontgrendeling
    const pMet = await submitCommand(P, U, 'browser.navigate', { url: 'https://mail.tarasevych.com/inbox' });
    check('dispatch: prive-agent met prive-ontgrendeling → opdracht bereikt het prive slot', await until(async () => (await store.getCommand(U, pMet.command.id))?.status === 'succeeded')
      && extP.berichten.some((m) => m.t === 'cmd' && m.id === pMet.command.id) && !ext2.berichten.some((m) => m.t === 'cmd' && m.id === pMet.command.id));
    const pAdmin = await eo.controleerBrowserOpdracht(P.id, U, 'browser.navigate', { url: 'https://admin.tarasevych.com/' });
    const pKlik = await eo.controleerBrowserOpdracht(P.id, U, 'browser.click', { name: 'x' });
    check('prive-ontgrendeling: admin.* geweigerd (ook al staat de toestemming het toe); cap buiten de ontgrendeling → EXTENSIE_CAP', !pAdmin.ok && /EXTENSIE_HOST/.test((pAdmin as { fout: string }).fout) && !pKlik.ok && /^EXTENSIE_CAP/.test((pKlik as { fout: string }).fout));
    const viaToolP = await callTool(U, 'browser_snapshot', {});
    check('callTool in de prive-ruimte kiest het prive slot (ontgrendeld) en voert uit', viaToolP.isError !== true, viaToolP.content[0].text.slice(0, 160));
    // Browserhulpmiddelen volgen de ruimte van het apparaat: nooit kruislings.
    const viaTech = await metNamens({ client: 'test', ruimte: 'technisch' }, () => callTool(U, 'take_snapshot', {}));
    const viaTechNaam = await metNamens({ client: 'test', ruimte: 'technisch' }, () => callTool(U, 'browser_snapshot', { browser: P.id }));
    check('technische verbinding bedient nooit het prive slot (ook niet als dat online en ontgrendeld is): duidelijke fout over het TECHNISCHE slot',
      viaTech.isError === true && /TECHNICAL slot/.test(viaTech.content[0].text) && viaTechNaam.isError === true && !extP.berichten.some((m) => m.t === 'cmd' && m.type === 'browser.snapshot' && m.params?.browser), viaTech.content[0].text.slice(0, 160));
    const { lijstTools } = await import('../../backend/mcp-connector');
    const lijstT = (await lijstTools({ userId: U, clientName: 'Claude', ruimte: 'technisch' })).map((t) => t.name);
    const lijstTN = (await lijstTools({ userId: N, clientName: 'Claude', ruimte: 'technisch' })).map((t) => t.name);
    const lijstPN = (await lijstTools({ userId: N, clientName: 'Claude', ruimte: 'prive' })).map((t) => t.name);
    check('tools/list technisch: met een technisch browserslot wel browserhulpmiddelen; zonder (account N) geen enkele; prive ongewijzigd',
      lijstT.includes('take_snapshot') && lijstT.includes('navigate_page') && !lijstT.includes('mail_search_messages')
      && !lijstTN.some((n) => ['take_snapshot', 'navigate_page', 'click', 'list_pages'].includes(n) || n.startsWith('browser_')) && lijstTN.includes('machine_list')
      && lijstPN.includes('take_snapshot'), JSON.stringify({ t: lijstT.length, tn: lijstTN.filter((n) => /snapshot|page/.test(n)) }));
    // DB-hek: een prive-rij met admin.* kan niet bestaan
    const dbHek = await sys.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, ruimte) VALUES ($1, $2, '{browser.read}', '{admin.tarasevych.com}', 'testfixture-nonce-0123456789', now() + interval '1 hour', 'prive')`, [P.id, U]).then(() => 'OK', (e) => String(e.message));
    const dbDuur = await sys.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, ruimte) VALUES ($1, $2, '{browser.read}', '{mcp.tarasevych.com}', 'testfixture-nonce-0123456789', now() + interval '400 days', 'technisch')`, [agent.id, U]).then(() => 'OK', (e) => String(e.message));
    check('0073/0110: CHECK — prive nooit admin.*; beide ruimtes ≤ 366 dagen', /extensie_ontgrendelingen_prive/.test(dbHek) && /extensie_ontgrendelingen_duur/.test(dbDuur), `${dbHek} | ${dbDuur}`);
    // caps = toestemmingen ∩ beleid
    await schrijfBeleid(U, { priveCaps: ['browser.read'] }, 'test');
    await reset();
    const po2 = await eo.priveOntgrendelen(aP, { agentId: P.id, dagen: 1, domeinen: ['mail.tarasevych.com'] });
    check('caps = toestemmingen ∩ beleid (beleid alleen lezen) en de vorige prive-rij is vervangen (nieuw)', po2.ontgrendeling.caps.join() === 'browser.read' && po2.ontgrendeling.domeinen.join() === 'mail.tarasevych.com'
      && (await sys.query('SELECT reden_einde FROM app.extensie_ontgrendelingen WHERE id = $1', [po.ontgrendeling.gid])).rows[0].reden_einde === 'nieuw');
    const nav2 = await eo.controleerBrowserOpdracht(P.id, U, 'browser.navigate', { url: 'https://mail.tarasevych.com/' });
    check('dispatch volgt het beleid: navigate buiten beleid → EXTENSIE_CAP', !nav2.ok && /^EXTENSIE_CAP/.test((nav2 as { fout: string }).fout));
    await schrijfBeleid(U, { priveAan: false }, 'test');
    check('beleid prive uit: dispatch meteen geweigerd, ontgrendelen → BELEID_UIT', !(await eo.controleerBrowserOpdracht(P.id, U, 'browser.snapshot', {})).ok
      && (await codeR(eo.priveOntgrendelen(aP, { agentId: P.id }))) === 'BELEID_UIT@prive');
    await schrijfBeleid(U, { priveAan: true, priveCaps: null }, 'test');
    // status: beide sloten van dezelfde browser
    const st2 = await eo.extensieStatus(gU, tab, sessie);
    const br = st2.browsers.find((b) => b.prive?.agentId === P.id);
    check('extensie-status: browsers[] groepeert beide sloten (zelfde pairingId) met ruimte; prive.toestemming; recht.prive (mag, caps, maxDagen, domeinen)',
      !!br && br.technisch?.agentId === agent.id && br.prive?.ruimte === 'prive' && br.prive.ontgrendeling?.gid === po2.ontgrendeling.gid
      && br.prive.toestemming?.caps.join() === 'browser.read,browser.navigate' && (br.prive.toestemming?.tot ?? 0) > Date.now() + 100 * 60_000 && st2.recht.prive.mag === true && st2.recht.prive.maxDagen === 366
      && st2.recht.prive.domeinen.length === PRIVE_HOSTS.length && st2.recht.technisch !== null, JSON.stringify({ br, prive: st2.recht.prive }));
    const stN = await eo.extensieStatus(gN, aN.tabContext, null);
    check('account zonder tech-profiel: recht.technisch = null, recht.prive zonder browsers → GEEN_BROWSER_RECHTEN', stN.recht.technisch === null && stN.recht.prive.mag === false && stN.recht.prive.code === 'GEEN_BROWSER_RECHTEN');
    // opnieuw verbinden: per slot de eigen ontgrendeling
    extP.ws.terminate();
    await until(() => !agentOnline(P.id));
    const extP2 = await extensie(tokenP);
    check('na ready duwt de server per slot de eigen ontgrendeling (prive slot krijgt de prive-rij)', await until(() => extP2.berichten.some((m) => m.t === 'ontgrendeling' && m.grant?.gid === po2.ontgrendeling.gid && m.grant?.ruimte === 'prive')));
    // intrekken per ruimte
    const nT = await eo.intrekken(U, { ruimte: 'technisch' }, 'site', 'site');
    check('intrekken met ruimte technisch laat de prive-ontgrendeling staan', (await eo.actieveOntgrendeling(P.id, U))?.id === po2.ontgrendeling.gid && nT >= 0);
    const nP = await eo.intrekken(U, { ruimte: 'prive' }, 'site', 'site');
    check('intrekken met ruimte prive: ingetrokken + push vergrendel naar het prive slot', nP === 1 && await until(() => extP2.berichten.some((m) => m.t === 'vergrendel' && m.gid === po2.ontgrendeling.gid)));

    const { agentRouteVerboden } = await import('../../backend/agent-namens');
    check('review 4: ontgrendel-, status- en beheerroutes staan in AGENT_VERBODEN (gedelegeerde agent-sessies nooit)',
      ['POST /api/owner/agents/ontgrendeling', 'POST /api/owner/agents/ontgrendeling/uitdaging', 'POST /api/owner/agents/ontgrendeling/intrekken', 'POST /api/owner/agents/ontgrendeling/prive',
        'GET /api/owner/agents/extensie-status', 'POST /api/owner/agents/extensie-status', 'GET /api/owner/agents/extensie-beheer', 'POST /api/owner/agents/extensie-beheer/beleid',
        'POST /api/owner/agents/extensie-beheer/intrekken', 'POST /api/owner/agents/extensie-beheer/verlengen'].every(agentRouteVerboden)
      && !agentRouteVerboden('POST /api/owner/agents/list'));
    // ---------------------------------------------------------------- routes (echte handler)
    const { handler } = await import('../../backend/index');
    const evt = (method: string, pad: string, body: unknown, headers: Record<string, string> = {}, query: Record<string, string> = {}) => ({
      headers: { host: 'mcp.tarasevych.com', origin: 'https://mcp.tarasevych.com', 'content-type': 'application/json', 'user-agent': 'eenheid', ...headers },
      body: body === undefined ? '' : JSON.stringify(body), isBase64Encoded: false, rawPath: pad, rawQueryString: new URLSearchParams(query).toString(), queryStringParameters: query,
      requestContext: { http: { method, path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } },
    });
    const anon = await handler(evt('GET', '/api/owner/agents/extensie-status', undefined, {}, { service: 'mcp', tabContext: tab }) as never);
    check('GET extensie-status zonder sessie → 401 {error:NIET_INGELOGD, uitleg}', anon.statusCode === 401 && JSON.parse(String(anon.body)).error === 'NIET_INGELOGD' && !!JSON.parse(String(anon.body)).uitleg?.uk, `${anon.statusCode} ${anon.body}`);
    // G3 (audit 19.10.2026): de status LEZEN mag op elke eigen dienst (hub/id/mail pollden en kregen 403-ruis); ontgrendelen/beheer blijven mcp/admin.
    {
      const { extensieOntgrendelingRoutes, EXTENSIE_DIENSTEN } = await import('../../backend/extensie-ontgrendeling-routes');
      const routesVoor = (service: string) => extensieOntgrendelingRoutes(async () => ({ user: gU, service, session: sessie, tabSession: null }) as never);
      const roep = async (service: string, route: string, body: Record<string, unknown> = {}) => { const r = await routesVoor(service)[route][0]({ event: { headers: {} }, body: { service, tabContext: tab, ...body }, query: { service, tabContext: tab } } as never); return { status: r.statusCode, body: JSON.parse(String(r.body || '{}')) }; };
      const hubGet = await roep('hub', 'GET /api/owner/agents/extensie-status'), mailPost = await roep('mail', 'POST /api/owner/agents/extensie-status');
      check('G3: GET/POST extensie-status op hub en mail → 200 (lezen is onschadelijk), geen SERVICE_NOT_ALLOWED', hubGet.status === 200 && Array.isArray(hubGet.body.agenten) && mailPost.status === 200, `${hubGet.status} ${mailPost.status} ${JSON.stringify(hubGet.body).slice(0, 80)}`);
      const hubUitdaging = await roep('hub', 'POST /api/owner/agents/ontgrendeling/uitdaging', { agentId: agent.id, minuten: 30 });
      const hubBeheer = await roep('hub', 'POST /api/owner/agents/extensie-beheer');
      check('G3: ontgrendelen en beheer op hub blijven 403 SERVICE_NOT_ALLOWED (contract: alleen mcp/admin)', hubUitdaging.status === 403 && hubUitdaging.body.error === 'SERVICE_NOT_ALLOWED' && hubBeheer.status === 403 && EXTENSIE_DIENSTEN.has('mcp') && !EXTENSIE_DIENSTEN.has('hub'), `${hubUitdaging.status} ${hubUitdaging.body.error} ${hubBeheer.status}`);
    }
    const anonPost = await handler(evt('POST', '/api/owner/agents/ontgrendeling/uitdaging', { service: 'mcp', tabContext: tab, agentId: agent.id, minuten: 30 }) as never);
    check('uitdaging zonder sessie → 401', anonPost.statusCode === 401, String(anonPost.statusCode));
    const anonPrive = await handler(evt('POST', '/api/owner/agents/ontgrendeling/prive', { service: 'mcp', tabContext: tab, agentId: P.id }) as never);
    const anonBeheer = await handler(evt('POST', '/api/owner/agents/extensie-beheer', { service: 'mcp', tabContext: tab }) as never);
    check('prive ontgrendelen en extensie-beheer zonder sessie → 401', anonPrive.statusCode === 401 && anonBeheer.statusCode === 401, `${anonPrive.statusCode} ${anonBeheer.statusCode}`);
    const httpOk = await handler(evt('POST', '/api/owner/agents/ontgrendeling/intrekken-extensie', { gid: randomUUID(), reden: 'opties' }, { authorization: `Bearer ${token}` }) as never);
    const httpFout = await handler(evt('POST', '/api/owner/agents/ontgrendeling/intrekken-extensie', { reden: 'opties' }, { authorization: 'Bearer ' + 'y'.repeat(40) }) as never);
    check('POST intrekken-extensie: met agenttoken 200 {ok, ingetrokken}, vals token 401', httpOk.statusCode === 200 && JSON.parse(String(httpOk.body)).ok === true && httpFout.statusCode === 401, `${httpOk.statusCode} ${httpOk.body} ${httpFout.statusCode}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await aiDienstOpruimen([U, N]);
    for (const s of sockets) { try { s.terminate(); } catch { /* al dicht */ } }
    eo._testReset();
    await new Promise<void>((r) => server.close(() => r()));
    await sys.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.agent_commands WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_grants WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.passkey_uitdagingen WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.passkeys WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query('DELETE FROM app.extensie_beleid WHERE user_id = ANY($1)', [[U, N]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = $1 AND data->>'userId' = ANY($2::text[])", [STAP_OP_TABEL, [U, N]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[U, N]]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
