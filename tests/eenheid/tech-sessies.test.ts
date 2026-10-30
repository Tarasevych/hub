// Audit 18.10.2026, punt 3: «Вийти всюди» en het intrekken van sessies moeten ook het technisch profiel beëindigen, en na opnieuw
// aanmelden in hetzelfde tabblad is een nieuwe stap-op nodig. Reproduceert eerst het oude gedrag (activering zonder sessie-binding
// overleeft) en bewijst dan de nieuwe regels via de echte routes (backend/index.ts) tegen de wegwerp-PG.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import { checker } from './hulp/nep-google';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'id.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-sessies');
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');

  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
  const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
  const sessies: string[] = [];
  const tabs: string[] = [];

  const epoch = async () => Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [uid])).rows[0]?.e || 0);
  /** Een ankersessie (ecosysteemcookie) zoals na een Google-aanmelding; createdAt instelbaar om «oud» vs «nieuw» te testen. */
  const sessie = async (createdAt = Date.now()) => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt, authenticatedAt: createdAt, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: await epoch(), scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    sessies.push(id);
    return { id, createdAt, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const roep = async (pad: string, s: { cookie: string }, body: Record<string, unknown> = {}, tabContext = tab()) => {
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await handler(evt as never);
    let data: any = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };
  const actief = (t: string, s?: { id: string; createdAt: number }) => tp.actieveActivatie(uid, t, s ? { id: s.id, createdAt: s.createdAt } : undefined);
  const redenVan = async (id: string) => String((await pool.query('SELECT beeindigd_reden FROM app.tech_activaties WHERE id=$1', [id])).rows[0]?.beeindigd_reden || '');

  try {
    await tp.profielVan(eig);

    // ---------------------------------------------------------------- reproductie van het oude gedrag (rij zonder sessie)
    const tOud = tab();
    const oud = await tp.activeren(eig, tOud, 0, 'oude rij zonder sessie');
    await pool.query('UPDATE app.tech_activaties SET sessie_id = NULL, tab_sessie_id = NULL WHERE id=$1', [oud.id]);
    const sNieuw = await sessie(Date.now() + 5 * 60_000); // sessie die ná de activering is begonnen (= opnieuw aangemeld)
    check('OUD: activering zonder sessie is nog zichtbaar zonder sessiecontrole (het lek)', !!(await actief(tOud)));
    check('NIEUW: met de huidige sessie telt een activering van vóór die sessie niet meer', (await actief(tOud, sNieuw)) === null);
    const sOuder = await sessie(Date.now() - 60 * 60_000); // sessie die al liep toen de activering begon
    check('NIEUW: oude rij (zonder sessie_id) geldt wel voor een sessie die vóór de activering begon', !!(await actief(tOud, sOuder)));
    await tp.beeindigenBijIntrekken(uid, 'handmatig');

    // ---------------------------------------------------------------- activering gebonden aan de sessie
    const sA = await sessie(), sB = await sessie();
    const tA = tab(), tB = tab();
    const aA = await tp.activeren(eig, tA, 60, 'werk in sessie A', { id: sA.id, createdAt: sA.createdAt });
    const aB = await tp.activeren(eig, tB, 0, 'werk in sessie B', { id: sB.id, createdAt: sB.createdAt });
    check('activering onthoudt de sessie', aA.sessieId === sA.id && aB.sessieId === sB.id);
    check('activering van sessie A telt niet voor sessie B (zelfde tab zou nodig zijn, maar ook sessie)', !!(await actief(tA, sA)) && (await actief(tA, sB)) === null);

    // sessielijst: tech-veld
    const ov = await roep('/api/owner/identity/security/overview', sA);
    const rijA = (ov.data.items || []).find((i: any) => i.id === sA.id), rijB = (ov.data.items || []).find((i: any) => i.id === sB.id);
    check('sessielijst: elke aanmelding draagt «tech» (modus, begin, eind)', ov.status === 200 && rijA?.tech?.modus === 'tijd' && rijB?.tech?.modus === 'tot-uitloggen' && typeof rijA.tech.eind === 'number', `${ov.status} ${JSON.stringify(rijA?.tech)}`);
    check('sessielijst: «techLos» telt rijen zonder sessie (hier 0)', ov.data.techLos === 0);

    // items/:id/revoke (session) → alleen die sessie
    const rv = await roep(`/api/owner/identity/security/items/${sB.id}/revoke`, sA, { kind: 'session' });
    check('intrekken van één aanmelding beëindigt haar technisch profiel (reden revoke), de andere blijft', rv.status === 200 && rv.data.tech === 1 && (await actief(tB, sB)) === null && !!(await actief(tA, sA)) && (await redenVan(aB.id)) === 'revoke', JSON.stringify(rv.data));

    // tech-beeindigen → alleen activering, sessie leeft
    const sC = await sessie(); const tC = tab();
    const aC = await tp.activeren(eig, tC, 30, 'werk in C', { id: sC.id, createdAt: sC.createdAt });
    const tb = await roep(`/api/owner/identity/security/items/${sC.id}/tech-beeindigen`, sA, { kind: 'session' });
    const sessieC = (await pool.query(`SELECT data->>'revokedAt' AS r FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1`, [sC.id])).rows[0];
    check('«Завершити технічний профіль» beëindigt alleen de activering (handmatig); de aanmelding blijft', tb.status === 200 && tb.data.tech === 1 && (await actief(tC, sC)) === null && !sessieC?.r && (await redenVan(aC.id)) === 'handmatig', JSON.stringify(tb.data));
    const ovC = await roep('/api/owner/identity/security/overview', sC);
    check('na tech-beeindigen: sessie C staat nog in de lijst, zonder tech', ovC.status === 200 && (ovC.data.items || []).some((i: any) => i.id === sC.id && !i.tech));

    // revoke-others → alles behalve de aanroepende sessie
    const aA2 = await actief(tA, sA);
    const aC2 = await tp.activeren(eig, tC, 30, 'opnieuw in C', { id: sC.id, createdAt: sC.createdAt });
    const ro = await roep('/api/owner/identity/security/revoke-others', sA);
    check('revoke-others beëindigt de technische profielen van de andere sessies, niet van deze', ro.status === 200 && ro.data.tech === 1 && (await actief(tC, sC)) === null && !!(await actief(tA, sA)) && (await redenVan(aC2.id)) === 'revoke-others' && aA2?.id === aA.id, JSON.stringify(ro.data));

    // revoke-all → alles, ook deze sessie; daarna opnieuw aanmelden in HETZELFDE tabblad → niets actief, activeren vraagt stap-op
    const ra = await roep('/api/owner/identity/security/revoke-all', sA);
    check('revoke-all beëindigt alle technische profielen (reden revoke-all)', ra.status === 200 && ra.data.tech === 1 && (await actief(tA)) === null && (await redenVan(aA.id)) === 'revoke-all', JSON.stringify(ra.data));
    const sNa = await sessie();
    check('na revoke-all: opnieuw aangemeld in hetzelfde tabblad → technisch profiel NIET actief', (await actief(tA, sNa)) === null);
    const st = await roep('/api/owner/tech/status', sNa, {}, tA);
    check('tech/status voor de nieuwe sessie: geen activering', st.status === 200 && st.data.activatie === null, `${st.status} ${JSON.stringify(st.data.activatie)}`);
    const act = await roep('/api/owner/tech/activeren', sNa, { minuten: 60, reden: 'opnieuw zonder stap-op' }, tA);
    check('activeren zonder stap-op → 403 STEP_UP_REQUIRED (nooit stil weer actief)', act.status === 403 && (act.data.reasonCode === 'STEP_UP_REQUIRED' || act.data.error === 'STEP_UP_REQUIRED'), `${act.status} ${JSON.stringify(act.data).slice(0, 120)}`);

    // emergency-revoke
    const sE = await sessie(); const tE = tab();
    const aE = await tp.activeren(eig, tE, 0, 'nood', { id: sE.id, createdAt: sE.createdAt });
    const er = await roep('/api/owner/identity/security/emergency-revoke', sE);
    check('emergency-revoke beëindigt het technisch profiel (reden emergency)', er.status === 200 && er.data.tech === 1 && (await actief(tE)) === null && (await redenVan(aE.id)) === 'emergency', JSON.stringify(er.data));

    // tab-overlay: intrekken van één tabblad
    const sT = await sessie(); const tT = tab();
    const tabId = randomUUID(); const now = Date.now();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_tab_sessions_v1', tabId, { anchorSessionId: sT.id, tabHash: sha(tT), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, grantId: '', status: 'active', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, revokedAt: 0, revocationEpoch: await epoch(), authMethod: 'google' }]);
    tabs.push(tabId);
    const aT = await tp.activeren(eig, tT, 30, 'tabblad', { id: sT.id, createdAt: sT.createdAt, tabSessieId: tabId });
    const tT2 = tab(); const aT2 = await tp.activeren(eig, tT2, 30, 'ander tabblad zelfde anker', { id: sT.id, createdAt: sT.createdAt, tabSessieId: null });
    const rt = await roep(`/api/owner/identity/security/items/${tabId}/revoke`, sT, { kind: 'tab' });
    check('intrekken van één tabblad beëindigt de activering van dat tabblad (en losse rijen van hetzelfde anker)', rt.status === 200 && rt.data.tech === 2 && (await redenVan(aT.id)) === 'revoke' && (await redenVan(aT2.id)) === 'revoke', JSON.stringify(rt.data));

    // logboek
    const redenen = (await pool.query(`SELECT DISTINCT details->>'reden' AS r FROM app.audit WHERE actor_id=$1 AND action='owner.tech.beeindigd' AND details->>'reden' IN ('revoke','revoke-all','revoke-others','emergency','handmatig')`, [uid])).rows.map((r) => r.r).sort();
    check('logboek owner.tech.beeindigd met elke reden', redenen.join(',') === 'emergency,handmatig,revoke,revoke-all,revoke-others', redenen.join(','));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id=$1 AND (sessie_id = ANY($2) OR reden LIKE $3)', [uid, sessies, '%']).catch(() => undefined);
    if (sessies.length) await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id = ANY($1)`, [sessies]).catch(() => undefined);
    if (tabs.length) await pool.query(`DELETE FROM app.records WHERE tbl='owner_tab_sessions_v1' AND id = ANY($1)`, [tabs]).catch(() => undefined);
    if (!bestaand) { await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined); await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [uid]).catch(() => undefined); }
  }
  return einde();
}
