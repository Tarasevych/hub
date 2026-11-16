// LAI-CON-001 tegen een wegwerp-PG (review PR #137: de CHECK op app.agent_commands.type kende 'browser.lokale_ai' niet → 23514).
// Hele keten: AI-hulpmiddel browser_local_ai → server (beleid 0287, matrix, ticket) → WebSocket → nagebootste extensie 0.9.6 → antwoord.
// Controleert ook wat in de DATABASE terechtkomt: nooit de tekst in params, nooit het resultaat in result (alleen metadata).
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import * as grants from '../../backend/ai-toestemmingen';
import { agentOnline, attachAgentGateway } from '../../backend/connectors-gateway';
import * as store from '../../backend/connectors-opslag';
import { randomToken, sha256 } from '../../backend/connectors-crypto';
import { callTool } from '../../backend/connectors-hulpmiddelen';
import { haalTicket } from '../../backend/apps-overdracht';
import { schrijfBeleid } from '../../backend/extensie-beleid';
import { closePool, getPool } from '../../server/platform/pg';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { checker } from './hulp/nep-google';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean> | boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(50); }
  return false;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('lai-con-001-db-20261116');
  const sys = getPool('systeem');
  const A = `lai-A-${randomUUID()}`;
  const server = createServer();
  attachAgentGateway(server, new Set(['127.0.0.1']));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const GEHEIM = 'GEHEIME-TEKST-VAN-DE-GEBRUIKER';
  const RESULTAAT = 'SAMENVATTING-DIE-NIET-IN-DE-DATABASE-MAG';
  try {
    const token = randomToken(32);
    const agent = await store.createAgent(A, 'Chrome (lai)', 'browser', sha256(token), {}, { autoApprove: [] });
    const opdrachten: any[] = [];
    let ticketTekst = '';
    // Nagebootste extensie 0.9.6: haalt het ticket op (zoals POST /api/owner/agents/overdracht) en geeft vluchtig = ticket terug.
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/agent/ws`);
      sockets.push(ws);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token, version: '0.9.6', capabilities: { kind: 'browser' } })));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.t === 'ready') resolve();
        if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
        if (msg.t === 'cmd') {
          opdrachten.push(msg);
          if (msg.type === 'browser.lokale_ai') {
            const t = haalTicket(agent.id, String(msg.params.ticket), ['lokale-ai']) as { payload?: { tekst?: string } } | null;
            ticketTekst = t?.payload?.tekst ?? '';
            ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, data: { tekst: RESULTAAT, notities: [], opApparaat: true, vluchtig: msg.params.ticket } }));
          } else ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, data: {} }));
        }
      });
      ws.on('error', reject);
    });
    check('extensie 0.9.6 verbonden', await until(() => agentOnline(agent.id)));
    await store.setBrowserEnabled(A, agent.id, true);
    await ontgrendelVoorTest(agent.id, A);
    await grants.addGrants(A, A, [{ agentId: agent.id, capability: 'browser.read' }], { steppedUp: false });

    const r = await callTool(A, 'browser_local_ai', { modus: 'summarizer', tekst: GEHEIM, doel: 'uk' });
    const rij = (await sys.query(`SELECT params, result, status FROM app.agent_commands WHERE user_id = $1 AND type = 'browser.lokale_ai' ORDER BY created_at DESC LIMIT 1`, [A])).rows[0];
    check('browser_local_ai: de opdracht wordt aangemaakt (CHECK kent browser.lokale_ai) en uitgevoerd zonder klik', !r.isError && rij?.status === 'succeeded', `${r.content?.[0]?.text?.slice(0, 200)} · ${JSON.stringify(rij)?.slice(0, 200)}`);
    check('het resultaat komt bij de AI aan (uit het geheugen)', !r.isError && String(r.content[0].text).includes(RESULTAAT));
    check('de extensie kreeg de tekst via het ticket, niet in de opdracht', ticketTekst === GEHEIM && !JSON.stringify(opdrachten).includes(GEHEIM));
    check('database: params zonder tekst (functie, ticket, aantal tekens, doeltaal)', !!rij && !JSON.stringify(rij.params).includes(GEHEIM) && rij.params.modus === 'summarizer' && rij.params.tekens === GEHEIM.length && rij.params.doel === 'uk');
    check('database: result zonder inhoud (alleen opApparaat, vluchtig, bewaard, tekens)', !!rij && !JSON.stringify(rij.result).includes(RESULTAAT) && rij.result?.data?.vluchtig === true && rij.result?.data?.bewaard === true && rij.result?.data?.tekens === RESULTAAT.length, JSON.stringify(rij?.result));

    // Beleid van de beheerder (0287): uit met reden → weigering met reden en wie, geen nieuwe opdracht.
    await schrijfBeleid(A, { lokaleAiAan: false, lokaleAiReden: 'Pilot nog niet gestart voor dit team' }, 'beheer@test.invalid');
    const voor = opdrachten.length;
    const uit = await callTool(A, 'browser_local_ai', { modus: 'summarizer', tekst: 'x' });
    check('beheerder zette het uit: duidelijke weigering met reden en wie; de extensie krijgt niets',
      uit.isError === true && /Pilot nog niet gestart voor dit team/.test(uit.content[0].text) && /beheer@test\.invalid/.test(uit.content[0].text) && opdrachten.length === voor, uit.content[0].text.slice(0, 200));
    const rijBeleid = (await sys.query('SELECT lokale_ai_aan, lokale_ai_reden, lokale_ai_door FROM app.extensie_beleid WHERE user_id = $1', [A])).rows[0];
    check('database: beleid uit met reden en wie (CHECK aanvaardt het)', rijBeleid?.lokale_ai_aan === false && rijBeleid.lokale_ai_door === 'beheer@test.invalid');
    let geweigerd = '';
    try { await sys.query(`UPDATE app.extensie_beleid SET lokale_ai_reden = 'kort' WHERE user_id = $1`, [A]); } catch (e) { geweigerd = String((e as { code?: string }).code); }
    check('database: uit met een reden korter dan 10 tekens wordt door de CHECK geweigerd (23514)', geweigerd === '23514', geweigerd);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    for (const s of sockets) { try { s.terminate(); } catch { /* al dicht */ } }
    await new Promise<void>((r) => server.close(() => r()));
    await sys.query('DELETE FROM app.extensie_beleid WHERE user_id = $1', [A]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = $1', [A]);
  }
  await closePool();
  return einde();
}
