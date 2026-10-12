// «Додатки»: eenmalige overdracht naar de agent (backend/apps-overdracht.ts + POST /api/owner/agents/overdracht), geheimverzoeken
// per eigenaar, en de MCP-hulpmiddelen app_* (validatie vóór er iets naar een apparaat gaat, standaard uit voor riskante,
// geheimen nooit via de chat). Tegen een wegwerp-PG.
import { randomBytes, randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import * as ov from '../../backend/apps-overdracht';
import * as agents from '../../backend/connectors-store';
import { sha256 } from '../../backend/connectors-crypto';
import { callTool, describeTools } from '../../backend/connectors-tools';
import { createAgentRoutes } from '../../backend/connectors-routes';
import { capabilityForTool } from '../../shared/ai-beleid/catalog';
import { actieDoel, actieSoort } from '../../shared/mcp-acties';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('apps-overdracht');
  ov._reset();

  // ---- module ----
  const t = ov.maakTicket('agent-1', 'u1', 'bundel', { files: [{ path: 'a', content: 'b' }] });
  check('ticket: 43 tekens base64url', ov.TICKET_RE.test(t), t);
  check('ticket: andere agent krijgt niets en het ticket is daarna weg', ov.haalTicket('agent-2', t) === null && ov.haalTicket('agent-1', t) === null);
  const t2 = ov.maakTicket('agent-1', 'u1', 'geheim', { key: 'K', value: 'v' });
  const eerst = ov.haalTicket('agent-1', t2);
  check('ticket: juiste agent krijgt de inhoud precies één keer', (eerst?.payload as any)?.value === 'v' && eerst?.soort === 'geheim' && ov.haalTicket('agent-1', t2) === null);
  check('ticket: ongeldig formaat geweigerd', ov.haalTicket('agent-1', '../x') === null && ov.haalTicket('agent-1', '') === null);
  const t3 = ov.maakTicket('agent-1', 'u1', 'bundel', {}, 1);
  await new Promise((r) => setTimeout(r, 5));
  check('ticket: verlopen ticket geeft niets', ov.haalTicket('agent-1', t3) === null);
  let teVeel = false;
  try { for (let i = 0; i < 20; i++) ov.maakTicket('agent-1', 'u-veel', 'bundel', {}); } catch (e) { teVeel = /TE_VEEL/.test((e as Error).message); }
  check('ticket: maximaal aantal per gebruiker', teVeel);
  const v = ov.maakGeheimVerzoek({ userId: 'u1', agentId: 'agent-1', agentNaam: 'pc', app: 'notes', sleutel: 'API_KEY', uitleg: 'test' });
  check('geheimverzoek: alleen de eigen gebruiker ziet het', ov.geheimVerzoek('u1', v.id)?.app === 'notes' && ov.geheimVerzoek('u2', v.id) === null && ov.geheimVerzoekenVan('u2').length === 0);
  check('geheimverzoek: publieke vorm bevat geen gebruikers- of agent-id', !('userId' in ov.verzoekPubliek(v)) && !('agentId' in ov.verzoekPubliek(v)));

  // ---- catalogus, journaal ----
  check('AI-beleid: app_*-hulpmiddelen hebben een eigen mogelijkheid (bekijken / uitrollen / geheimen)',
    capabilityForTool('mcp__mcp_tarasevych_com_Anthropic__app_list') === 'apps.read' && capabilityForTool('app_deploy') === 'apps.deploy'
    && capabilityForTool('app_rollback') === 'apps.deploy' && capabilityForTool('app_secret_request') === 'apps.secrets');
  check('journaal: soort «apps» en alleen de naam als doel (geen bestanden, env of waarden)',
    actieSoort('app_deploy') === 'apps' && actieDoel('app_deploy', { name: 'notes', files: [{ path: 'x', content: 'GEHEIM' }], env: { A: 'GEHEIM' } }) === 'notes'
    && actieDoel('app_secret_request', { name: 'notes', key: 'API_KEY', value: 'GEHEIM' }) === 'notes · API_KEY' && actieDoel('app_route', { name: 'notes', domain: 'n.example.com' }) === 'notes → n.example.com');

  const { catalogus } = await import('../../backend/ai-beleid');
  const cat = await catalogus();
  const tools = (id: string) => cat.mogelijkheden.find((m) => m.id === id)?.tools ?? [];
  check('levende catalogus: elk hulpmiddel van de connector valt onder een mogelijkheid (geen «zonder groep»)', cat.zonderGroep.length === 0, cat.zonderGroep.join(','));
  check('levende catalogus: «Додатки» met de juiste hulpmiddelen, publieke namen (take_snapshot, niet browser_snapshot)',
    tools('apps.deploy').join() === 'app_control,app_deploy,app_rollback,app_route' && tools('apps.secrets').join() === 'app_secret_delete,app_secret_request'
    && tools('apps.read').length === 5 && tools('browser.read').includes('take_snapshot') && !tools('browser.read').includes('browser_snapshot')
    && tools('deploy.release').includes('uitrol_voorstel_begin') && cat.mogelijkheden.find((m) => m.id === 'apps.deploy')?.sinds === '2026-10-11', JSON.stringify(cat.mogelijkheden.map((m) => [m.id, m.tools.length])));
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN db-deel: geen database'); return einde(); }
  const sys = getPool('systeem');
  const A = `apps-a-${randomUUID()}`;
  await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [A, { email: `${A}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);
  try {
    // ---- route voor de agent ----
    const token = randomBytes(32).toString('base64url');
    const ag = await agents.createAgent(A, 'apps-pc', 'linux-x64', sha256(token), { apps: true });
    const browserToken = randomBytes(32).toString('base64url');
    const br = await agents.createAgent(A, 'browser', 'browser', sha256(browserToken), {});
    const routes = createAgentRoutes({
      requireSession: async () => ({ errorCode: 'GEEN' }), respond: (d: unknown, s = 200) => ({ statusCode: s, body: JSON.stringify(d) }),
      fail: (m: string, s = 400) => ({ statusCode: s, body: JSON.stringify({ error: m }) }), audit: async () => undefined, body: (b: unknown) => (b as Record<string, unknown>) ?? {},
    } as any) as any;
    const haal = (tok: string, ticket: string) => routes['POST /api/owner/agents/overdracht'][0]({ event: { headers: { Authorization: `Bearer ${tok}` } }, body: { ticket } });
    const tk = ov.maakTicket(ag.id, A, 'bundel', { files: [{ path: 'index.html', content: 'hoi' }], env: {} });
    const r1 = await haal(token, tk);
    check('route: agent haalt zijn ticket op (200, inhoud)', r1.statusCode === 200 && JSON.parse(r1.body).payload.files[0].content === 'hoi', r1.body);
    const r2 = await haal(token, tk);
    check('route: tweede keer 404', r2.statusCode === 404);
    const tk2 = ov.maakTicket(ag.id, A, 'geheim', { key: 'K', value: 'v' });
    check('route: zonder geldig token 401, browseragent 401', (await haal('x'.repeat(30), tk2)).statusCode === 401 && (await haal(browserToken, tk2)).statusCode === 401);
    check('route: ticket na een poging met een verkeerd token nog bruikbaar voor de juiste agent', (await haal(token, tk2)).statusCode === 200);
    const tk3 = ov.maakTicket(br.id, A, 'geheim', { key: 'K', value: 'v' });
    check('route: ticket van een andere agent geweigerd', (await haal(token, tk3)).statusCode === 404);
    const zonderSessie = await routes['POST /api/owner/apps/geheimen/:id/invullen'][0]({ event: { headers: {} }, body: { waarde: 'x' }, params: { id: v.id } });
    check('geheim invullen zonder sessie geweigerd', zonderSessie.statusCode === 403);

    // ---- hulpmiddelen ----
    const info = await describeTools(A);
    const kind = (n: string) => info.find((x) => x.name === n);
    check('beheeroverzicht: app_deploy/rollback/control/route/secret_delete riskant en standaard uit; lezen standaard aan',
      ['app_deploy', 'app_rollback', 'app_control', 'app_route', 'app_secret_delete'].every((n) => kind(n)?.risky && kind(n)?.mode === 'off')
      && ['app_list', 'app_logs', 'app_versions', 'app_deploy_status', 'app_secret_list'].every((n) => kind(n)?.mode === 'always' && kind(n)?.readOnly)
      && kind('app_secret_request')?.kind === 'write', info.filter((x) => x.name.startsWith('app_')).map((x) => `${x.name}:${x.mode}`).join(','));
    const uit = await callTool(A, 'app_deploy', { name: 'notes', files: [{ path: 'index.html', content: 'x' }] }, { eigenaarZelf: true });
    check('app_deploy standaard uit: geweigerd met uitleg', uit.isError === true && /turned off by the user/.test(uit.content[0].text));
    await agents.setToolModes(A, { app_deploy: 'ask', app_route: 'ask' });
    const fout = async (n: string, a: unknown, re: RegExp) => { const r = await callTool(A, n, a, { eigenaarZelf: true }); return r.isError === true && re.test(r.content[0].text); };
    check('validatie: ongeldige naam, pad met .., absoluut pad, te groot, env met regeleinde, slecht domein — vóór er een apparaat gekozen wordt',
      await fout('app_deploy', { name: 'Notes', files: [{ path: 'a', content: 'x' }] }, /Invalid "name"/)
      && await fout('app_deploy', { name: 'notes', files: [{ path: '../etc/passwd', content: 'x' }] }, /Invalid file entry/)
      && await fout('app_deploy', { name: 'notes', files: [{ path: '/etc/passwd', content: 'x' }] }, /Invalid file entry/)
      && await fout('app_deploy', { name: 'notes', files: [{ path: 'big.bin', content: 'A'.repeat(7_200_000), encoding: 'base64' }] }, /larger than 5 MB/)
      && await fout('app_deploy', { name: 'notes', files: [{ path: 'a', content: 'x' }], env: { A: 'x\nB=y' } }, /Invalid env/)
      && await fout('app_route', { name: 'notes', domain: 'evil domain' }, /Invalid "domain"/)
      && await fout('app_logs', { name: 'notes', lines: 9999 }, /Invalid "lines"/)
      && await fout('app_secret_request', { name: 'notes', key: 'bad key' }, /Invalid "key"/));
    check('app_deploy zonder online apparaat: duidelijke melding', await fout('app_deploy', { name: 'notes', files: [{ path: 'index.html', content: 'x' }] }, /No suitable device is online/));
    check('app_secret_request zonder online apparaat met apps: duidelijke melding, geen link', await fout('app_secret_request', { name: 'notes', key: 'API_KEY' }, /No device with apps enabled/));
    check('app_secret_request op een genoemd apparaat zonder apps: uitleg hoe de eigenaar het aanzet', await (async () => {
      const zonder = await agents.createAgent(A, 'oud-pc', 'win32', sha256(randomUUID()), {});
      return fout('app_secret_request', { machine: zonder.name, name: 'notes', key: 'API_KEY' }, /Apps are not enabled on device "oud-pc"[\s\S]*apps-config/);
    })());
    const link = await callTool(A, 'app_secret_request', { machine: 'apps-pc', name: 'notes', key: 'OPENAI_API_KEY', reason: 'Voor de chatfunctie' }, { eigenaarZelf: true });
    const lj = link.isError ? null : JSON.parse(link.content[0].text);
    check('app_secret_request: eenmalige link naar mcp.*/apps?geheim=…, geen waarde gevraagd in de chat',
      !!lj && /^https:\/\/mcp\.tarasevych\.com\/apps\?geheim=[A-Za-z0-9_-]{43}$/.test(lj.link) && /never ask for the value in the chat/.test(lj.next), link.content[0].text);
    const id = lj ? new URL(lj.link).searchParams.get('geheim')! : '';
    check('geheimverzoek staat open bij de eigenaar, met app, sleutel en uitleg', ov.geheimVerzoek(A, id)?.status === 'open' && ov.geheimVerzoek(A, id)?.sleutel === 'OPENAI_API_KEY' && ov.geheimVerzoek(A, id)?.uitleg === 'Voor de chatfunctie');
  } finally {
    await sys.query("DELETE FROM app.agents WHERE user_id = $1", [A]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl='users' AND id = $1", [A]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
