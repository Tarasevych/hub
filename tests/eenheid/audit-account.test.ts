// Regressietests audit-fixes 1 (zelf verwijderen/herstellen, blokkeren trekt sessies in) en 5 (Google-step-up).
// Draait tegen een wegwerp-PG (DATABASE_URL*), met nagebootste Google. Zie tests/eenheid/hulp/nep-google.ts.
import { randomBytes } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { googleUitgifteVoorStapOpVers } from '../../backend/stap-op';

export async function main(): Promise<number> {
  const { check, einde } = checker('audit-account');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `acc-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const rij = async (email: string) => (await pool.query("select id, data from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0] as { id: string; data: Record<string, any> } | undefined;
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const ADMIN = { confirmation: 'ADMIN_POLICY_CHANGE' };
  try {
    // ---- eigenaar: gewone aanmelding (oude Google-sessie, auth_time 1 uur geleden) ----
    const O = G.browser();
    const oLogin = await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', authTime: oud });
    check('gewone aanmelding: prompt=select_account, geen max_age/claims (fix 5)', oLogin.cb.data.ok === true && oLogin.authUrl.searchParams.get('prompt') === 'select_account' && !oLogin.authUrl.searchParams.has('max_age') && !oLogin.authUrl.searchParams.has('claims'), String(oLogin.cb.data.reasonCode));
    const adminPost = (b: ReturnType<typeof G.browser>, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('admin.tarasevych.com', pad, b.ctxBody('admin', { ...ADMIN, ...extra }));

    // ---- gebruikers aanmelden (allemaal "new") ----
    const mk = async (naam: string) => { const b = G.browser(); const email = `acc-${naam}-${T}@example.test`; const r = await b.aanmelden(`sub-${naam}-${T}`, email, { authTime: oud }); return { b, email, r }; };
    const A = await mk('a');
    const bootA = await A.b.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', A.b.ctxBody());
    check('nieuwe gebruiker: wacht-op-goedkeuring-scherm werkt (sessie ok, approved=false)', A.r.cb.data.ok === true && !!bootA.data.user && bootA.data.accessGate?.approved === false && bootA.data.accessGate?.status === 'new', JSON.stringify(bootA.data.accessGate));

    // ---- fix 5: step-up via Google ----
    const zonderStap = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'approved' });
    check('admin-actie met oude Google-aanmelding → 403 STEP_UP_REQUIRED', zonderStap.status === 403 && zonderStap.data.error === 'STEP_UP_REQUIRED', `${zonderStap.status} ${zonderStap.body.slice(0, 120)}`);
    const anderBrowser = G.browser(); await anderBrowser.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin' });
    const nogSteeds = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'approved' });
    check('verse aanmelding in een ANDERE browser geeft deze sessie geen step-up (gebonden aan sessie-id)', nogSteeds.status === 403 && nogSteeds.data.error === 'STEP_UP_REQUIRED');
    const zonderSessie = await G.browser().verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext: randomBytes(24).toString('hex'), flowMode: 'redirect', returnTo: 'https://hub.tarasevych.com/', locale: 'nl', intent: 'step-up' });
    check('step-up-transactie zonder sessie geweigerd', zonderSessie.data.ok === false && zonderSessie.data.reasonCode === 'OWNER_STEP_UP_SESSION_REQUIRED', JSON.stringify(zonderSessie.data).slice(0, 160));
    const oudIat = Math.floor(Date.now() / 1000) - 600;
    const stapOud = await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', intent: 'step-up', authTime: oud, iat: oudIat });
    check('step-up-URL: prompt=select_account (Google kent prompt=login niet), max_age=0, claims auth_time', stapOud.authUrl.searchParams.get('prompt') === 'select_account' && stapOud.authUrl.searchParams.get('max_age') === '0' && String(stapOud.authUrl.searchParams.get('claims')).includes('auth_time'));
    const naOud = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'new' });
    const stapZonder = await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', intent: 'step-up', authTime: null, iat: oudIat });
    const naZonder = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'new' });
    check('step-up met oude auth_time (of zonder) én oud id_token (iat 10 min) telt niet en meldt STEP_UP_NOT_FRESH (geen stille lus)', stapOud.cb.data.ok === false && stapOud.cb.data.reasonCode === 'STEP_UP_NOT_FRESH' && stapOud.cb.data.stepUp === true && naOud.status === 403 && stapZonder.cb.data.reasonCode === 'STEP_UP_NOT_FRESH' && naZonder.status === 403, `${JSON.stringify(stapOud.cb.data).slice(0, 200)} ${naOud.status} ${naZonder.status}`);
    const sessieVoor = (await O.verzoek('admin.tarasevych.com', '/api/owner/session/bootstrap', O.ctxBody('admin'))).data.user?.id;
    const stapAnder = await O.aanmelden(`sub-ander-${T}`, eigenaar, { service: 'admin', intent: 'step-up' });
    const sessieNa = (await O.verzoek('admin.tarasevych.com', '/api/owner/session/bootstrap', O.ctxBody('admin'))).data.user?.id;
    const anderRij = await getPool().query("select count(*)::int n from app.records where tbl='users' and data->>'sub'=$1", [`sub-ander-${T}`]);
    const naAnder = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'new' });
    check('step-up met een ANDER Google-account → STEP_UP_ACCOUNT_MISMATCH, geen nieuw account, sessie ongewijzigd, nog steeds 403', stapAnder.cb.data.ok === false && stapAnder.cb.data.reasonCode === 'STEP_UP_ACCOUNT_MISMATCH' && anderRij.rows[0].n === 0 && !!sessieVoor && sessieVoor === sessieNa && naAnder.status === 403, `${JSON.stringify(stapAnder.cb.data).slice(0, 200)} ${anderRij.rows[0].n} ${sessieVoor} ${sessieNa} ${naAnder.status}`);
    const stapIat = await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', intent: 'step-up', authTime: oud });
    const naIat = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'new' });
    check('step-up met OUDE auth_time maar net uitgegeven id_token (iat, nonce van deze transactie, zelfde sub) → telt', stapIat.cb.data.ok === true && naIat.status === 200, `${JSON.stringify(stapIat.cb.data).slice(0, 160)} ${naIat.status}`);
    { const nu = Date.now(), start = nu - 30_000;
      check('googleUitgifteVoorStapOpVers: vers (na de klik, ≤ 2 min) ja; te oud, vóór de klik, toekomst, transactie > 10 min, 0 → nee',
        googleUitgifteVoorStapOpVers(nu - 5_000, start, nu) && !googleUitgifteVoorStapOpVers(nu - 3 * 60_000, start, nu) && !googleUitgifteVoorStapOpVers(start - 2 * 60_000, start, nu)
        && !googleUitgifteVoorStapOpVers(nu + 5 * 60_000, start, nu) && !googleUitgifteVoorStapOpVers(nu - 5_000, nu - 11 * 60_000, nu) && !googleUitgifteVoorStapOpVers(0, start, nu)); }
    const gewoonIat = G.browser(); await gewoonIat.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', authTime: oud });
    const naGewoon = await adminPost(gewoonIat, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'new' });
    check('gewone aanmelding (geen step-up-transactie) met vers iat maar oude auth_time telt NIET als step-up', naGewoon.status === 403, `${naGewoon.status}`);
    const stapVers = await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', intent: 'step-up' });
    const naVers = await adminPost(O, `/api/owner/admin/users/${(await rij(A.email))!.id}`, { status: 'new' });
    check('step-up met verse auth_time (redirect-flow) → admin-actie mag', stapVers.cb.data.ok === true && naVers.status === 200, `${naVers.status} ${naVers.body.slice(0, 160)}`);

    // ---- fix 1: zelf verwijderen ----
    // IDENTITEIT-015: старі /api/account/{delete,recover} → 410; hub ходить на /api/owner/identity/account/* (ті самі правила).
    const delZonder = await A.b.verzoek('hub.tarasevych.com', '/api/owner/identity/account/delete', A.b.ctxBody('hub', { confirmEmail: A.email }));
    check('zelf verwijderen zonder step-up → 403 STEP_UP_REQUIRED', delZonder.status === 403 && delZonder.data.error === 'STEP_UP_REQUIRED', `${delZonder.status}`);
    await A.b.aanmelden(`sub-a-${T}`, A.email, { intent: 'step-up' });
    const delA = await A.b.verzoek('hub.tarasevych.com', '/api/owner/identity/account/delete', A.b.ctxBody('hub', { confirmEmail: A.email }));
    const bootNaDel = await A.b.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', A.b.ctxBody());
    const aRij = await rij(A.email);
    check('zelf verwijderen (new) met step-up: status deleted, statusVoorVerwijdering=new, sessies ingetrokken', delA.status === 200 && aRij?.data.status === 'deleted' && aRij?.data.statusVoorVerwijdering === 'new' && bootNaDel.data.state === 'signed_out', `${delA.status} ${bootNaDel.status} ${bootNaDel.data.state}`);
    await A.b.aanmelden(`sub-a-${T}`, A.email, { authTime: oud });
    const recA = await A.b.verzoek('hub.tarasevych.com', '/api/owner/identity/account/recover', A.b.ctxBody('hub', { mode: 'restore' }));
    check('zelf herstellen na verwijderen vanuit "new" → 403 RECOVERY_NOT_ALLOWED, blijft deleted (geen ophoging naar approved)', recA.status === 403 && recA.data.error === 'RECOVERY_NOT_ALLOWED' && (await rij(A.email))?.data.status === 'deleted', `${recA.status} ${recA.body.slice(0, 120)}`);

    // goedgekeurde gebruiker: zelf verwijderen + zelf herstellen → exact terug naar approved
    const B = await mk('b');
    const bId = (await rij(B.email))!.id;
    const goedB = await adminPost(O, `/api/owner/admin/users/${bId}`, { status: 'approved' });
    await B.b.aanmelden(`sub-b-${T}`, B.email, { intent: 'step-up' });
    const delB = await B.b.verzoek('hub.tarasevych.com', '/api/owner/identity/account/delete', B.b.ctxBody('hub', { confirmEmail: B.email }));
    await B.b.aanmelden(`sub-b-${T}`, B.email, { authTime: oud });
    const recB = await B.b.verzoek('hub.tarasevych.com', '/api/owner/identity/account/recover', B.b.ctxBody('hub', { mode: 'restore' }));
    const bNa = await rij(B.email);
    check('approved → zelf verwijderd → zelf hersteld = approved (precies de oude status)', goedB.status === 200 && delB.status === 200 && recB.status === 200 && bNa?.data.status === 'approved' && !bNa?.data.statusVoorVerwijdering, `${goedB.status} ${delB.status} ${recB.status} ${bNa?.data.status}`);

    // geblokkeerd: alle sessies, tab-overlays en onthouden browsers ingetrokken
    const C = await mk('c');
    const cId = (await rij(C.email))!.id;
    await adminPost(O, `/api/owner/admin/users/${cId}`, { status: 'approved' });
    const cOnthoud = G.browser(); await cOnthoud.aanmelden(`sub-c-${T}`, C.email, { authTime: oud, remember: true });
    const blok = await adminPost(O, `/api/owner/admin/users/${cId}`, { status: 'blocked' });
    const bootC = await C.b.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', C.b.ctxBody());
    const levend = (await pool.query("select tbl, count(*)::int n from app.records where tbl in ('owner_service_sessions_v1','owner_tab_sessions_v1','owner_browser_grants_v1') and data->>'userId'=$1 and coalesce((data->>'revokedAt')::bigint,0)=0 group by tbl", [cId])).rows;
    const cOpnieuw = await G.browser().aanmelden(`sub-c-${T}`, C.email, { authTime: oud });
    check('blokkeren: bestaande sessie werkt niet meer, geen levende sessies/overlays/grants, opnieuw aanmelden geweigerd', blok.status === 200 && !bootC.data.user && levend.length === 0 && cOpnieuw.cb.data.ok === false, `${blok.status} ${bootC.status} ${JSON.stringify(levend)} ${cOpnieuw.cb.data.reasonCode}`);

    // door beheerder verwijderd → niet zelf herstelbaar; beheerder herstelt naar de oude status (met step-up)
    const D = await mk('d');
    const dId = (await rij(D.email))!.id;
    await adminPost(O, `/api/owner/admin/users/${dId}`, { status: 'approved' });
    const delD = await adminPost(O, `/api/owner/admin/users/${dId}/delete`, { confirmEmail: D.email });
    await D.b.aanmelden(`sub-d-${T}`, D.email, { authTime: oud });
    const recD = await D.b.verzoek('hub.tarasevych.com', '/api/owner/identity/account/recover', D.b.ctxBody('hub', { mode: 'restore' }));
    check('door beheerder verwijderd → zelf herstellen 403 RECOVERY_ADMIN_DELETED', delD.status === 200 && recD.status === 403 && recD.data.error === 'RECOVERY_ADMIN_DELETED', `${delD.status} ${recD.status} ${recD.body.slice(0, 100)}`);
    const O3 = G.browser(); await O3.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', authTime: oud });
    const recDZonder = await adminPost(O3, `/api/owner/admin/users/${dId}/recover`, { mode: 'restore' });
    const recDMet = await adminPost(O, `/api/owner/admin/users/${dId}/recover`, { mode: 'restore' });
    check('beheerder-herstel vereist step-up en herstelt exact de vorige status (approved)', recDZonder.status === 403 && recDZonder.data.error === 'STEP_UP_REQUIRED' && recDMet.status === 200 && (await rij(D.email))?.data.status === 'approved', `${recDZonder.status} ${recDMet.status}`);

    // geblokkeerd → door beheerder verwijderd → door beheerder hersteld blijft blocked (nooit ophogen)
    const delC = await adminPost(O, `/api/owner/admin/users/${cId}/delete`, { confirmEmail: C.email });
    const recC = await adminPost(O, `/api/owner/admin/users/${cId}/recover`, { mode: 'restore' });
    check('geblokkeerd → verwijderd → hersteld = blocked (nooit ophogen)', delC.status === 200 && recC.status === 200 && (await rij(C.email))?.data.status === 'blocked', `${delC.status} ${recC.status} ${(await rij(C.email))?.data.status}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`acc-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
