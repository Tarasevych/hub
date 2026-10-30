// Ruimtes: compatibiliteit extensie/MCP tegen de wegwerp-PG (echte router, echte tech-ruimtes v2), met een NAGEBOOTSTE MCP-klant
// (alleen het besluit dat de connector per hulpmiddel neemt) en een NAGEBOOTSTE extensie (ontgrendelingsrijen + uitloggen).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import * as k from '../../backend/tech-ruimtes-kern';
import { antwoordVoorCode, hulpmiddelScope } from '../../backend/ruimtes-compatibiliteit';
import { checker } from './hulp/nep-google';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'hub.tarasevych.com';
const BEHEER = ['beheer_journaal_lezen'];

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimtes-compatibiliteit-db');
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');
  const { totpStapOpVastleggen } = await import('../../backend/stap-op');
  const { naUitloggen } = await import('../../backend/extensie-ontgrendeling');
  const { effectieveRuimte } = await import('../../backend/ai-ruimte-poort');

  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else { process.env.OWNER_EMAIL = process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'; await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL, role: 'owner', status: 'approved', name: 'Eigenaar' }]); }
  const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
  const uid2 = randomUUID();
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid2, { email: `tester-${uid2.slice(0, 8)}@eenheid.test`, role: 'user', status: 'approved', name: 'Tester' }]);
  await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['tester','beheerder'], 480, 'eenheid')`, [uid2, `tech-${randomBytes(6).toString('hex')}`]);
  const geheugen: string[] = [];

  const sessie = async (userId: string) => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const ep = Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [userId])).rows[0]?.e || 0);
    const rec = { tokenHash: sha(token), userId, service: 'hub', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: ep, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    geheugen.push(id);
    return { id, createdAt: now, userId, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  type S = Awaited<ReturnType<typeof sessie>>;
  const stapOp = (s: S) => totpStapOpVastleggen({ user: { id: s.userId }, session: { id: s.id, createdAt: s.createdAt } } as never);
  const roep = async (pad: string, s: S, t: string, body: Record<string, unknown> = {}) => {
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'hub', tabContext: t, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await handler(evt as never);
    let data: any = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };
  const R = (n: string) => `/api/owner/hub/tech/ruimtes/${n}`;
  const vlagZet = async (aan: boolean, gebruikers: string[]) => { await pool.query(`UPDATE app.feature_flags SET aan = $1, gebruikers = $2 WHERE sleutel = 'tech-ruimtes-v2'`, [aan, gebruikers]); k._vlagCacheLeeg(); };

  // nagebootste MCP-klant: één aanroep van hulpmiddel `naam`
  const mcp = async (naam: string) => {
    const scope = hulpmiddelScope(naam, BEHEER);
    if (scope === 'prive') return { scope, ...antwoordVoorCode('PRIVE') };
    const b = await k.besluit(uid, { bron: 'mcp' } as never);
    const live = await effectieveRuimte(uid);
    return { scope, live, ...antwoordVoorCode(b.toegestaan && live === 'technisch' ? 'TECHNISCH' : b.code) };
  };
  const ontg = async (ruimte: string, soort: string, dagen: number) => (await pool.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, ruimte, einde_soort) VALUES ($1,$2,ARRAY['browser.read'],ARRAY['hub.tarasevych.com'],$3, now() + make_interval(days => $4::int), $5, $6) RETURNING id`, [`agent-${randomBytes(4).toString('hex')}`, uid, randomBytes(12).toString('hex'), dagen, ruimte, soort])).rows[0].id;
  const levend = async (id: string) => !(await pool.query('SELECT ingetrokken_op FROM app.extensie_ontgrendelingen WHERE id=$1', [id])).rows[0].ingetrokken_op;

  try {
    await tp.profielVan(eig);
    await vlagZet(true, [uid, uid2]);
    const s = await sessie(uid), t = tab();
    await stapOp(s);
    const st = await roep(R('starten'), s, t, { modus: 'tot-site-uitloggen', reden: 'compatibiliteit' });
    check('opzet: technische ruimte gestart', st.status === 200, `${st.status} ${st.data.error || ''}`);
    await stapOp(s);
    const az = await roep(R('ai-zetten'), s, t, { verbindingId: '*', ruimtes: ['prive', 'technisch'], termijn: 'tot-technisch-einde' });
    check('opzet: AI mag technisch', az.status === 200, `${az.status} ${az.data.error || ''}`);
    const a1 = await mcp('beheer_journaal_lezen');
    check('MCP: beheerhulpmiddel draait in scope technisch (200)', a1.status === 200 && a1.scope === 'technisch', JSON.stringify(a1));
    check('MCP: mailhulpmiddel draait in scope prive (200)', (await mcp('mail_lezen')).scope === 'prive');
    await roep(R('wisselen'), s, t, { naar: 'prive' });
    const p = await mcp('beheer_journaal_lezen');
    check('MCP: pauze op de site → beheerhulpmiddel 403', p.status === 403, JSON.stringify(p));
    await roep(R('wisselen'), s, t, { naar: 'technisch' });
    check('MCP: terug naar technisch zonder nieuwe aanmelding → 200', (await mcp('beheer_journaal_lezen')).status === 200);

    // extensie: lange ontgrendelingen in beide ruimtes
    const jaarP = await ontg('prive', 'duur', 365), onbT = await ontg('technisch', 'handmatig', 366);
    await naUitloggen(uid, tab());
    check('extensie: uitloggen van één tabblad laat «1 рік» (prive) en «Без обмеження» (technisch) staan', await levend(jaarP) && await levend(onbT));

    // hoofdsessie ingetrokken (direct-URL-scenario): technische MCP-aanroep geblokkeerd met Oekraïense melding
    await pool.query(`UPDATE app.records SET data = jsonb_set(data, '{revokedAt}', to_jsonb($2::bigint)) WHERE id = $1`, [s.id, Date.now()]);
    const w = await mcp('beheer_journaal_lezen');
    check('MCP: hoofdsessie ingetrokken → 403, live ruimte prive', w.status === 403 && (w as any).live === 'prive', JSON.stringify(w));
    check('MCP: melding is SITE_SESSIE_WEG «Основний акаунт не активний» (of sessie al gesloten)', ['SITE_SESSIE_WEG', 'GEEN_TECH_SESSIE'].includes(w.code) && !!w.uitleg?.uk, w.code);
    check('MCP: prive hulpmiddel werkt nog na intrekken', (await mcp('mail_lezen')).status === 200);

    await naUitloggen(uid);
    check('extensie: uitloggen van de site trekt alle ontgrendelingen in (beide ruimtes)', !(await levend(jaarP)) && !(await levend(onbT)));

    // vlag uit: pariteit met het oude gedrag
    await vlagZet(false, []);
    const oud = await ontg('prive', 'duur', 365);
    await naUitloggen(uid, tab());
    check('vlag uit: één tabblad uitloggen trekt in (oud gedrag)', !(await levend(oud)));
    check('vlag uit: MCP zonder activering → prive', (await effectieveRuimte(uid)) === 'prive');
  } finally {
    await vlagZet(false, []).catch(() => undefined);
    await pool.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [uid2]).catch(() => undefined);
    await pool.query('DELETE FROM app.records WHERE id = ANY($1)', [[uid2, ...geheugen]]).catch(() => undefined);
  }
  return einde();
}
