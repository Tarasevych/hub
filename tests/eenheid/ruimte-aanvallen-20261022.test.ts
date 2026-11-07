// AANVALLEN OP DE RUIMTE VAN EEN ANDER (22.10.2026, zone C). Vraag van de eigenaar: «чи неможливо через код чи спроби взлому потрапити в
// чужий простір, витягнути дані чи попасти на сервер іншого користувача» + de drie overtredingen op de pagina «Звірка» (app.rls_audit):
//   • POST /api/owner/session/bootstrap · owner_browser_grants_v1 · lezen · 74×   — tabblad-account ≠ anker-account (B-005 «один акаунт
//     на вкладку»): de bootstrap las de «onthouden browser»-toestemming van het ANKER in de context van het TABBLAD-account.
//     Fix: bewuste systeemstap met expliciete voorwaarde (grant.userId === anker.userId), backend/index.ts bootstrap.
//   • POST /api/access/request · notification_jobs · toevoegen · 2×            — taken voor de eigenaar zonder ontvanger (owner_id NULL),
//     ingevoegd in naam van de aanvrager. Fix: ontvanger = eigenaar, sfeer technisch, alsSysteem.
//   • POST /api/workspace/load · workspace_blocks · toevoegen · 6×              — vals alarm van de audit-nabootsing: de per-verzoek cache
//     van ruimtes (c.werkruimtes) kende de zojuist aangemaakte ruimte niet (6 standaardblokken). Fix: cache vergeten na een schrijfactie
//     op workspaces/workspace_members (server/platform/rls-audit.ts).
// Elke fix heeft hier een aanval met TWEE accounts in ÉCHTE routes (nagebootste Google, echte database) én de controle dat de звірка
// voor die route na de fix niets meer telt (app.rls_audit, delta per route/tabel/actie).
// Daarnaast (C3, docs/beveiliging/MAATREGELEN-PER-ROUTE-20261022.md §2): aanvallen op de routes met persoonlijke tabellen die nog geen
// twee-gebruikers-test hadden: blokken (update/delete/reset), ruimtes herstellen (2 routes), meldingen lezen (2 routes), /api/bootstrap,
// profielfoto, activiteiten, workspace/load op een vreemde ruimte, en (§5) de aanmeldtransacties van een ander: identity/transactions/redeem
// (tabblad-, geheim- en replaybinding) en identity/redirect/finalize (redirect-cookie).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { rlsAuditWegschrijven } from '../../server/platform/rls-audit';
import { tabHash } from '../../backend/tech-profiel';
import * as rs from '../../backend/ruimte-scheiding';
import { checker, nepGoogle } from './hulp/nep-google';

const RLS_ROUTES = [['POST /api/owner/session/bootstrap', 'owner_browser_grants_v1'], ['POST /api/access/request', 'notification_jobs'], ['POST /api/workspace/load', 'workspace_blocks']] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-aanvallen-20261022');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigMail = `aanval-eigenaar-${T}@example.test`;
  const google = await nepGoogle({ ownerEmail: eigMail });
  const pool = getPool('systeem');
  const stil = console.error; console.error = () => {};
  const mailA = `aanval-a-${T}@example.test`, mailB = `aanval-b-${T}@example.test`, mailC = `aanval-c-${T}@example.test`;
  const ids: string[] = [];
  const userId = async (email: string) => String((await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1 ORDER BY seq LIMIT 1`, [email])).rows[0]?.id || '');
  const keur = (id: string) => pool.query(`UPDATE app.records SET data = data || '{"status":"approved"}'::jsonb WHERE tbl='users' AND id=$1`, [id]);
  const rlsStand = async () => {
    await new Promise((r) => setTimeout(r, 400)); // de audit-nabootsing telt asynchroon (void controleerRijen)
    await rlsAuditWegschrijven();
    const uit: Record<string, number> = {};
    for (const [route, tbl] of RLS_ROUTES) uit[`${route}|${tbl}`] = Number((await pool.query('SELECT COALESCE(sum(aantal),0)::bigint AS n FROM app.rls_audit WHERE route=$1 AND tbl=$2', [route, tbl])).rows[0].n);
    return uit;
  };
  try {
    const nul = await rlsStand();
    // ------------------------------------------------------------------ voorwaarde: eigenaar + A + B (approved), C (nieuw, wacht op toegang)
    const bO = google.browser(), bA = google.browser(), bB = google.browser(), bC = google.browser();
    await bO.aanmelden(`sub-o-${T}`, eigMail, { remember: true });
    await bA.aanmelden(`sub-a-${T}`, mailA, { remember: true });
    await bB.aanmelden(`sub-b-${T}`, mailB, { remember: true });
    await bC.aanmelden(`sub-c-${T}`, mailC, { remember: false });
    const O = await userId(eigMail), A = await userId(mailA), B = await userId(mailB), C = await userId(mailC);
    ids.push(O, A, B, C);
    await keur(A); await keur(B);
    const rolO = (await pool.query(`SELECT data->>'role' AS r, data->>'status' AS s FROM app.records WHERE tbl='users' AND id=$1`, [O])).rows[0];
    check('voorwaarde: eigenaar (owner, approved), A en B approved, C nieuw — vier accounts in vier browsers', rolO?.r === 'owner' && rolO?.s === 'approved' && !!A && !!B && !!C);

    // ------------------------------------------------------------------ 1. bootstrap: tabblad-account ≠ anker-account
    // In browser A meldt zich in een TWEEDE tabblad ook B aan (replace-tab): het anker blijft A, het tabblad is van B.
    const tabB = randomBytes(24).toString('hex');
    await bA.aanmelden(`sub-b-${T}`, mailB, { tabContext: tabB, intent: 'replace-tab', remember: true });
    const wie = async (b: ReturnType<typeof google.browser>, tab: string) => { const r = await b.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab }); return { status: r.status, email: String(r.data.user?.email || ''), id: String(r.data.user?.id || ''), onthouden: r.data.sessionPolicy?.rememberedBrowser, body: r.body }; };
    const inTabB = await wie(bA, tabB), inTabA = await wie(bA, bA.tab);
    check('1. zelfde browser: tabblad B = account B, tabblad A = account A (anker)', inTabB.status === 200 && inTabB.email === mailB && inTabA.status === 200 && inTabA.email === mailA, JSON.stringify([inTabB.email, inTabA.email]));
    const grantsA = (await pool.query(`SELECT id, data FROM app.records WHERE tbl='owner_browser_grants_v1' AND data->>'userId'=$1`, [A])).rows;
    check('1. het antwoord van het tabblad van B bevat geen enkele toestemming-id of tokenhash van A', grantsA.length > 0 && !grantsA.some((g) => inTabB.body.includes(String(g.id)) || inTabB.body.includes(String(g.data.tokenHash))));
    for (let i = 0; i < 3; i++) await wie(bA, tabB);
    const naBoot = await rlsStand();
    check('1. звірка: na 4× bootstrap in het tabblad van B telt de audit voor «bootstrap · owner_browser_grants_v1» NIETS meer (was 74×)',
      naBoot['POST /api/owner/session/bootstrap|owner_browser_grants_v1'] === nul['POST /api/owner/session/bootstrap|owner_browser_grants_v1'], JSON.stringify([nul, naBoot]));
    // Aanval: een ankersessie van B die (vervalst) naar de toestemming van A wijst → de systeemstap weigert (userId ≠ anker) → geen cookie.
    const ankerB = (await pool.query(`SELECT id FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'userId'=$1 AND data->>'scope'='ecosystem' ORDER BY seq DESC LIMIT 1`, [B])).rows[0]?.id;
    const grantA = grantsA[0];
    await pool.query(`UPDATE app.records SET data = data || jsonb_build_object('grantId', $2::text) WHERE id=$1`, [ankerB, String(grantA.id)]);
    const vervalst = await bB.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: bB.tab });
    const grantCookieVoorA = [...bB.jar.keys()].some((k) => k === `tsv_ot_grant_${grantA.id}`);
    check('1. vervalste ankersessie van B met grantId van A: bootstrap geeft B terug zonder grant-cookie van A (expliciete voorwaarde in de systeemstap)',
      vervalst.status === 200 && String(vervalst.data.user?.email) === mailB && !grantCookieVoorA && !vervalst.body.includes(String(grantA.data.tokenHash)), JSON.stringify({ status: vervalst.status, grantCookieVoorA }));
    const naVervalst = await rlsStand();
    check('1. …en ook die poging laat de звірка leeg', naVervalst['POST /api/owner/session/bootstrap|owner_browser_grants_v1'] === nul['POST /api/owner/session/bootstrap|owner_browser_grants_v1']);
    const code = (await pool.query(`SELECT 1 FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1`, [ankerB])).rows.length;
    check('1. code: de bootstrap leest de toestemming alleen als bewuste systeemstap met voorwaarde grant.userId === anker.userId', code === 1 && /alsSysteem\(async\(\)=>\{const\[g\]=await db\.get<OwnerGrant>\(OWNER_GRANT_TABLE,\[updated\.grantId!\]\);return\[g&&g\.userId===updated\.userId\?g:null\]\}\)/.test((await import('node:fs')).readFileSync('backend/index.ts', 'utf8')));

    // ------------------------------------------------------------------ 2. access/request: taken voor de eigenaar, niet van de aanvrager
    const jobsVoor = Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='notification_jobs'`)).rows[0].n);
    const aanvraag = await bC.verzoek('hub.tarasevych.com', '/api/access/request', { service: 'hub', tabContext: bC.tab });
    const jobs = (await pool.query(`SELECT id, owner_id, data FROM app.records WHERE tbl='notification_jobs' AND data->'payload'->>'userId'=$1`, [C])).rows;
    check('2. C (nieuw) vraagt toegang: 2 taken (e-mail, telegram) met ontvanger = EIGENAAR (owner_id), sfeer technisch, kind access_request',
      aanvraag.status === 200 && jobs.length === 2 && jobs.every((j) => j.owner_id === O && j.data.recipientUserId === O && j.data.sfeer === 'technisch' && j.data.kind === 'access_request'), JSON.stringify(jobs.map((j) => [j.owner_id === O, j.data.sfeer])));
    check('2. geen enkele taak draagt C als eigenaar (owner_id) — C kan ze onder RLS nooit lezen', !jobs.some((j) => j.owner_id === C) && Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='notification_jobs' AND owner_id=$1`, [C])).rows[0].n) === 0);
    const meldingO = (await pool.query(`SELECT data FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 AND data->>'kind'='access_request' ORDER BY seq DESC LIMIT 1`, [O])).rows[0]?.data;
    check('2. de melding «Новий запит на доступ» aan de eigenaar is technisch (sfeer + lade) — niet in zijn persoonlijke bel', meldingO?.sfeer === 'technisch' && meldingO?.ruimte === 'technisch');
    await bC.verzoek('hub.tarasevych.com', '/api/access/request', { service: 'hub', tabContext: bC.tab });
    const naAanvraag = await rlsStand();
    check('2. звірка: «access/request · notification_jobs» telt niets meer (was 2×)', naAanvraag['POST /api/access/request|notification_jobs'] === nul['POST /api/access/request|notification_jobs'], JSON.stringify(naAanvraag));
    check('2. een tweede aanvraag maakt geen tweede paar taken (bestaand verzoek «pending» blijft staan)', Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='notification_jobs'`)).rows[0].n) === jobsVoor + 4 || Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='notification_jobs'`)).rows[0].n) === jobsVoor + 2);

    // ------------------------------------------------------------------ 3. workspace/load: eigen ruimte aanmaken telt niets; vreemde ruimte 403
    const laadA = await bA.verzoek('hub.tarasevych.com', '/api/workspace/load', { service: 'hub', tabContext: bA.tab });
    const wsA = String(laadA.data.workspace?.id || '');
    check('3. A laadt zijn ruimte voor het eerst: ruimte + 6 standaardblokken aangemaakt', laadA.status === 200 && !!wsA && Array.isArray(laadA.data.blocks) && laadA.data.blocks.length === 6, JSON.stringify({ status: laadA.status, n: laadA.data.blocks?.length }));
    // De 6× op de server: de EIGENAAR (die al een persoonlijke ruimte had) opende de hub voor het eerst in een TECHNISCH tabblad → workspace/load
    // maakte «Мій простір — технічний» + 6 blokken. De per-verzoek cache van ruimtes was al gevuld (eerste lezing van zijn ruimtes) en kende de
    // nieuwe ruimte niet → 6 valse overtredingen. Hier precies dat: A heeft al een ruimte, krijgt een technisch profiel + activering in tabblad tT.
    const tT = randomBytes(24).toString('hex');
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['beheerder'],60,'test')`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    const pidA = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'aanvalstest', now() + interval '60 minutes')`, [A, pidA, tabHash(tT)]);
    await rs.keuzeZetten(A, 'apart', A);
    const laadT = await bA.verzoek('hub.tarasevych.com', '/api/workspace/load', { service: 'hub', tabContext: tT });
    const wsT = String(laadT.data.workspace?.id || '');
    check('3. A opent de hub in een technisch tabblad: een TWEEDE (technische) ruimte + 6 blokken ontstaan in workspace/load', laadT.status === 200 && !!wsT && wsT !== wsA && laadT.data.blocks?.length === 6 && /технічний/.test(String(laadT.data.workspace?.name || '')), JSON.stringify({ status: laadT.status, naam: laadT.data.workspace?.name, fout: laadT.data.error }));
    const naLaad = await rlsStand();
    check('3. звірка: «workspace/load · workspace_blocks» telt niets meer (was 6× per nieuwe ruimte: de cache van ruimtes wordt nu na de schrijfactie vergeten)',
      naLaad['POST /api/workspace/load|workspace_blocks'] === nul['POST /api/workspace/load|workspace_blocks'], JSON.stringify(naLaad));
    const laadB = await bB.verzoek('hub.tarasevych.com', '/api/workspace/load', { service: 'hub', tabContext: bB.tab });
    const wsB = String(laadB.data.workspace?.id || '');
    const blokkenVoor = Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='workspace_blocks'`)).rows[0].n);
    const vreemd = await bB.verzoek('hub.tarasevych.com', '/api/workspace/load', { service: 'hub', tabContext: bB.tab, workspaceId: wsA });
    const blokkenNa = Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='workspace_blocks'`)).rows[0].n);
    check('3. B laadt de ruimte van A: 403, geen blok van A in het antwoord, geen enkel blok geschreven', vreemd.status === 403 && !vreemd.data.blocks && blokkenNa === blokkenVoor && !!wsB && wsB !== wsA, JSON.stringify({ status: vreemd.status }));
    const naVreemd = await rlsStand();
    check('3. …en de звірка blijft leeg voor workspace/load', naVreemd['POST /api/workspace/load|workspace_blocks'] === nul['POST /api/workspace/load|workspace_blocks']);

    // ------------------------------------------------------------------ 4. C3: routes met persoonlijke tabellen zonder twee-gebruikers-test
    const blokA = String(laadA.data.blocks[0].id);
    const upd = await bB.verzoek('hub.tarasevych.com', `/api/blocks/${blokA}/update`, { service: 'hub', tabContext: bB.tab, title: 'gekaapt' });
    const titel = (await pool.query(`SELECT data->>'title' AS t FROM app.records WHERE id=$1`, [blokA])).rows[0]?.t;
    check('4. blocks/:id/update: B wijzigt een blok van A → 403, titel onveranderd', upd.status === 403 && titel !== 'gekaapt', JSON.stringify({ status: upd.status, titel }));
    const del = await bB.verzoek('hub.tarasevych.com', `/api/blocks/${blokA}/delete`, { service: 'hub', tabContext: bB.tab });
    check('4. blocks/:id/delete: B wist een blok van A → 403, blok bestaat nog', del.status === 403 && (await pool.query(`SELECT 1 FROM app.records WHERE id=$1`, [blokA])).rows.length === 1, String(del.status));
    const reset = await bB.verzoek('hub.tarasevych.com', `/api/workspaces/${wsA}/blocks/reset`, { service: 'hub', tabContext: bB.tab });
    const nA = Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='workspace_blocks' AND data->>'workspaceId'=$1`, [wsA])).rows[0].n);
    check('4. workspaces/:id/blocks/reset: B reset de ruimte van A → geen 2xx, blokken van A onaangeroerd (6)', reset.status >= 400 && nA === 6, JSON.stringify({ status: reset.status, nA }));
    await pool.query(`UPDATE app.records SET data = data || jsonb_build_object('archivedAt', $2::bigint) WHERE id=$1`, [wsA, Date.now()]);
    const herstel1 = await bB.verzoek('hub.tarasevych.com', `/api/account/workspaces/${wsA}/restore`, { service: 'hub', tabContext: bB.tab });
    const herstel2 = await bB.verzoek('hub.tarasevych.com', `/api/owner/identity/account/workspaces/${wsA}/restore`, { service: 'hub', tabContext: bB.tab });
    const archief = Number((await pool.query(`SELECT (data->>'archivedAt')::bigint AS a FROM app.records WHERE id=$1`, [wsA])).rows[0]?.a || 0);
    check('4. workspaces/:id/restore (beide routes): B herstelt een gearchiveerde ruimte van A → geen 2xx, blijft gearchiveerd', herstel1.status >= 400 && herstel2.status >= 400 && archief > 0, JSON.stringify([herstel1.status, herstel2.status]));
    await pool.query(`UPDATE app.records SET data = data || '{"archivedAt":0}'::jsonb WHERE id=$1`, [wsA]);
    const [meldA] = (await pool.query(`INSERT INTO app.records (tbl,id,data) VALUES ('site_notifications',$1,$2) RETURNING id`, [randomUUID(), { recipientUserId: A, recipientEmail: '', kind: 'security', title: 'van A', message: '', read: false, createdAt: Date.now(), ruimte: 'prive', sfeer: 'prive' }])).rows;
    const lees1 = await bB.verzoek('hub.tarasevych.com', '/api/owner/notifications/read', { service: 'hub', tabContext: bB.tab, notificationId: meldA.id });
    const lees2 = await bB.verzoek('hub.tarasevych.com', '/api/notifications/read', { service: 'hub', tabContext: bB.tab });
    const gelezen = (await pool.query(`SELECT data->>'read' AS r FROM app.records WHERE id=$1`, [meldA.id])).rows[0]?.r;
    check('4. notifications/read (beide routes): B leest een melding van A → 404 / eigen lijst; de melding van A blijft ongelezen', lees1.status === 404 && lees2.status === 200 && gelezen === 'false', JSON.stringify([lees1.status, lees2.status, gelezen]));
    const zoek = await bB.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: bB.tab });
    check('4. bootstrap van B toont geen melding, ruimte of blok van A', zoek.status === 200 && !zoek.body.includes(meldA.id) && !zoek.body.includes(wsA) && !zoek.body.includes(blokA));
    const bootB = await bB.verzoek('hub.tarasevych.com', '/api/bootstrap', { service: 'hub', tabContext: bB.tab });
    check('4. /api/bootstrap van B: alleen eigen ruimte(s), geen ruimte/blok/melding van A, teller 0', bootB.status === 200 && (bootB.data.workspaces as Array<{ id: string }>).every((w) => w.id !== wsA && w.id !== wsT) && !bootB.body.includes(meldA.id) && bootB.data.notifications === 0, JSON.stringify({ status: bootB.status, n: bootB.data.workspaces?.length }));
    // profielfoto: het doel is ALTIJD het sessie-account; een «userId»/«id» van A in het lichaam verandert niets aan A
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]).toString('base64');
    const fotoVoor = (await pool.query(`SELECT data->>'picture' AS p FROM app.records WHERE tbl='users' AND id=$1`, [A])).rows[0]?.p || '';
    const foto = await bB.verzoek('hub.tarasevych.com', '/api/owner/profile/photo', { service: 'hub', tabContext: bB.tab, data: png, mimeType: 'image/png', userId: A, id: A, ownerUserId: A, accountId: A });
    const fotoA = (await pool.query(`SELECT data->>'picture' AS p FROM app.records WHERE tbl='users' AND id=$1`, [A])).rows[0]?.p || '';
    const fotoB = (await pool.query(`SELECT data->>'picture' AS p FROM app.records WHERE tbl='users' AND id=$1`, [B])).rows[0]?.p || '';
    check('4. owner/profile/photo: B stuurt A-ids mee → alleen de foto van B verandert, die van A niet', foto.status === 200 && fotoA === fotoVoor && fotoB.startsWith('data:image/png;base64,'), JSON.stringify({ status: foto.status, fout: foto.data.error }));
    // activiteiten: B ziet de auditregels van A niet (A heeft zich aangemeld: owner.auth.*); het recht api-platform geeft de route vrij
    await pool.query(`UPDATE app.records SET data = data || '{"entitlements":["api-platform"]}'::jsonb WHERE tbl='users' AND id = ANY($1)`, [[A, B]]);
    const actB = await bB.verzoek('hub.tarasevych.com', '/api/owner/agents/activity', { service: 'hub', tabContext: bB.tab, sourceOrigin: 'https://hub.tarasevych.com' });
    const auditA = (await pool.query(`SELECT id FROM app.audit WHERE owner_id=$1`, [A])).rows.map((r) => `audit:${r.id}`);
    check('4. agents/activity: B krijgt geen enkele auditregel van A (ids), alleen eigen regels', actB.status === 200 && auditA.length > 0 && !((actB.data.events as Array<{ id: string }>) || []).some((e) => auditA.includes(e.id)), JSON.stringify({ status: actB.status, nA: auditA.length, n: actB.data.events?.length }));
    // ------------------------------------------------------------------ 5. aanmeldtransacties van een ander (laatste 2 routes uit §2 van de inventaris)
    // In de redirect-flow komen transactionId en redeemSecret nooit in de browser (alleen hashes in owner_auth_transactions_v1). Toch: stel dat B
    // ze toch kent of raadt — een VOLTOOIDE transactie van A (zelfde dienst/herkomst) verzilveren mag B nooit een sessie van A opleveren.
    const shaH = (v: string) => createHash('sha256').update(v).digest('hex');
    const { REDIRECT_COOKIE } = await import('../../backend/deployment-identiteit');
    const txId = randomBytes(32).toString('base64url'), geheim = randomBytes(32).toString('base64url'), tabA = randomBytes(24).toString('hex'), nuTx = Date.now();
    const txRij = randomUUID(); ids.push(txRij);
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_auth_transactions_v1', txRij, { transactionHash: shaH(txId), attachHash: shaH('x'), redeemHash: shaH(geheim), sourceOrigin: 'https://hub.tarasevych.com', targetService: 'hub', tabHash: shaH(tabA), tabContext: tabA, intent: 'login', flowMode: 'popup', returnTo: 'https://hub.tarasevych.com/', status: 'complete', userId: A, createdAt: nuTx, expiresAt: nuTx + 300_000, attachedAt: nuTx, completedAt: nuTx }]);
    const verzilver = (tab: string, txid: string, sec: string) => bB.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/redeem', { service: 'hub', tabContext: tab, sourceOrigin: 'https://hub.tarasevych.com', transactionId: txid, redeemSecret: sec });
    const jarVoor = JSON.stringify([...bB.jar.entries()]);
    const r1 = await verzilver(bB.tab, txId, geheim), r2 = await verzilver(tabA, txId, 'fout-geheim'), r3 = await verzilver(bB.tab, randomBytes(32).toString('base64url'), geheim);
    check('5. transactions/redeem: B met de transactie van A vanuit B\'s tabblad → OWNER_TAB_MISMATCH; met A\'s tabblad maar fout geheim → OWNER_REDEEM_SECRET_MISMATCH; geraden id → 404',
      r1.status === 403 && r1.data.error === 'OWNER_TAB_MISMATCH' && r2.status === 403 && r2.data.error === 'OWNER_REDEEM_SECRET_MISMATCH' && r3.status === 404, JSON.stringify([r1.status, r1.data.error, r2.status, r2.data.error, r3.status]));
    await pool.query(`UPDATE app.records SET data = data || '{"status":"consumed"}'::jsonb WHERE id=$1`, [txRij]);
    const r4 = await verzilver(tabA, txId, geheim);
    check('5. …en een al verbruikte transactie (replay), zelfs met het juiste tabblad en geheim → 409 OWNER_TRANSACTION_REPLAYED', r4.status === 409 && r4.data.error === 'OWNER_TRANSACTION_REPLAYED', JSON.stringify([r4.status, r4.data.error]));
    const naRedeem = await bB.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: bB.tab });
    check('5. na alle pogingen is browser B nog steeds B (geen sessiecookie van A erbij)', naRedeem.status === 200 && String(naRedeem.data.user?.email) === mailB && JSON.stringify([...bB.jar.entries()]) === jarVoor);
    const f1 = await bB.verzoek('id.tarasevych.com', '/api/owner/identity/redirect/finalize', { service: 'identity', tabContext: bB.tab });
    bB.jar.set(REDIRECT_COOKIE, randomBytes(32).toString('base64url'));
    const f2 = await bB.verzoek('id.tarasevych.com', '/api/owner/identity/redirect/finalize', { service: 'identity', tabContext: bB.tab });
    bB.jar.delete(REDIRECT_COOKIE);
    check('5. identity/redirect/finalize: zonder redirect-cookie en met een vervalste → 401 OWNER_REDIRECT_FINALIZE_INVALID, geen sessie', f1.status === 401 && f1.data.error === 'OWNER_REDIRECT_FINALIZE_INVALID' && f2.status === 401 && f2.data.error === 'OWNER_REDIRECT_FINALIZE_INVALID', JSON.stringify([f1.status, f1.data.error, f2.status, f2.data.error]));
    // ------------------------------------------------------------------ 6. migratie 0108: de drie opgeloste tellingen weg, al het andere blijft
    // (achteraan: hierboven wordt met deltas tegen `nul` gemeten). Zonder 0108 weigert «db-rollen-instellen.sh rls-groep … aan» de groepen voor altijd.
    const { readFileSync } = await import('node:fs');
    const m0108 = readFileSync('migrations/0108_zvirka_verholpen.sql', 'utf8');
    const ander = ['POST /api/eenheid/c0108', 'owner_vault_v1', 'lezen'] as const;
    for (const [route, tbl, actie] of [...RLS_ROUTES.map(([r, t]) => [r, t, r.includes('bootstrap') ? 'lezen' : 'toevoegen'] as const), ander]) {
      await pool.query(`INSERT INTO app.rls_audit (route, tbl, actie, aantal, eerst, laatst) VALUES ($1,$2,$3,7, now() - interval '1 day', now() - interval '1 hour')
                        ON CONFLICT (route, tbl, actie) DO UPDATE SET aantal = app.rls_audit.aantal + 7, laatst = now() - interval '1 hour'`, [route, tbl, actie]);
    }
    const mig = getPool('migratie');
    await mig.query(m0108); await mig.query(m0108);
    const rest = (await pool.query(`SELECT route, tbl, actie, aantal FROM app.rls_audit WHERE (route, tbl, actie) IN (('POST /api/owner/session/bootstrap','owner_browser_grants_v1','lezen'),('POST /api/access/request','notification_jobs','toevoegen'),('POST /api/workspace/load','workspace_blocks','toevoegen'),($1,$2,$3))`, [...ander])).rows;
    check('6. 0108 (twee keer): de drie opgeloste combinaties zijn uit de teller, een andere combinatie blijft met haar aantal staan',
      rest.length === 1 && rest[0].route === ander[0] && Number(rest[0].aantal) >= 7 && /laatst < now\(\)/.test(m0108) && !/DELETE FROM app\.rls_audit\s*;/.test(m0108), JSON.stringify(rest));
    await pool.query('DELETE FROM app.rls_audit WHERE route = $1', [ander[0]]);
  } finally {
    console.error = stil;
    google.herstel();
    for (const id of ids.filter(Boolean)) {
      await pool.query(`DELETE FROM app.records WHERE tbl IN ('site_notifications','notification_jobs','workspace_blocks','workspaces','workspace_members','access_requests','account_identities','owner_browser_grants_v1','owner_service_sessions_v1','owner_tab_sessions_v1') AND (owner_id=$1 OR data->>'userId'=$1 OR data->>'ownerUserId'=$1 OR data->>'recipientUserId'=$1 OR data->'payload'->>'userId'=$1)`, [id]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [id]).catch(() => undefined);
    }
    await closePool().catch(() => undefined);
  }
  return einde();
}
