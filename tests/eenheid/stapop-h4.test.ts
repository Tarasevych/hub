// Audit H4: verse aanmelding (step-up) voor toestemming aan Claude, riskante hulpmiddelen op 'altijd' en goedkeuren van riskante
// aanroepen. Weigeren en niet-riskante instellingen blijven zonder step-up mogelijk.
import { randomUUID } from 'node:crypto';
import { createMcpConnectorRoutes } from '../../backend/mcp-connector-routes';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('stapop-h4');
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN stapop-h4: geen database'); return 0; }
  const sys = getPool('systeem');
  const U = `h4-${randomUUID()}`;
  let vers = false; let gevraagd = 0;
  const user = { id: U, email: `${U}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] };
  const mk = (withStepUp: boolean) => createMcpConnectorRoutes({
    requireSession: async () => ({ user, service: 'mcp' }) as any,
    respond: (data: unknown, status = 200) => ({ statusCode: status, body: JSON.stringify(data) }),
    fail: (message: string, status = 400) => ({ statusCode: status, body: JSON.stringify({ error: message }) }),
    audit: async () => undefined,
    body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}),
    ...(withStepUp ? { stepUp: async () => { gevraagd++; return vers ? null : { statusCode: 403, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) }; } } : {}),
  } as any) as Record<string, any[]>;
  const r = mk(true);
  const call = async (routes: Record<string, any[]>, route: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}) => {
    const res = await routes[route][0]({ event: { headers: {} }, body, params });
    return { status: res.statusCode as number, data: JSON.parse(res.body || 'null') };
  };
  try {
    const rid = 'bestaat-niet';
    const zonder = await call(r, 'POST /api/owner/mcp-connector/consent', { rid, approve: true });
    vers = true; const met = await call(r, 'POST /api/owner/mcp-connector/consent', { rid, approve: true }); vers = false;
    const weiger = await call(r, 'POST /api/owner/mcp-connector/consent', { rid, approve: false });
    check('toestemming geven vraagt step-up (403 vóór iets anders); met step-up verder (verlopen = 404); weigeren zonder step-up',
      zonder.status === 403 && zonder.data.error === 'STEP_UP_REQUIRED' && met.status === 404 && weiger.status === 404);
    const geenFunctie = await call(mk(false), 'POST /api/owner/mcp-connector/consent', { rid, approve: true });
    check('zonder step-up-functie: geweigerd, nooit stil doorgelaten', geenFunctie.status === 403 && geenFunctie.data.error === 'STEP_UP_REQUIRED');

    gevraagd = 0;
    const riskantAltijd = await call(r, 'POST /api/owner/mcp-connector/tools/set', { name: 'machine_exec', mode: 'always' });
    const riskantVraag = await call(r, 'POST /api/owner/mcp-connector/tools/set', { name: 'machine_exec', mode: 'ask' });
    const gewoonAltijd = await call(r, 'POST /api/owner/mcp-connector/tools/set', { name: 'machine_list', mode: 'always' });
    check("riskant hulpmiddel op 'altijd' vraagt step-up; 'vragen' en niet-riskant 'altijd' niet",
      riskantAltijd.status === 403 && riskantVraag.status === 200 && gewoonAltijd.status === 200 && gevraagd === 1);

    const id = (await sys.query(`INSERT INTO app.connector_tool_calls (user_id, tool, args) VALUES ($1, 'machine_exec', '{}'::jsonb) RETURNING id`, [U])).rows[0].id as string;
    const goedkeuren = await call(r, 'POST /api/owner/mcp-connector/approvals/:id/approve', {}, { id });
    const nogWachtend = (await sys.query('SELECT status FROM app.connector_tool_calls WHERE id = $1', [id])).rows[0]?.status;
    check('riskante aanroep goedkeuren vraagt step-up; zonder blijft hij wachten', goedkeuren.status === 403 && nogWachtend === 'pending_approval');
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 500));
  } finally {
    await sys.query('DELETE FROM app.connector_tool_calls WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_tool_settings WHERE user_id = $1', [U]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
