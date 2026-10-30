// Regressietests audit-fix 9 (RLS per tabel, migrations/0007_rls_per_tabel.sql) en de lage bevindingen van
// fix 10 rond delen (deel-links intrekbaar, uitnodiger opnieuw gecontroleerd), handoff-epoch en harde verwijdering.
// Draait tegen een wegwerp-PG met de drie rollen (DATABASE_URL_APP/_SYSTEM/_MIGRATIE), nagebootste Google.
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../../server/platform/db';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { rijToegestaan, rlsAuditWegschrijven, werkruimtesVan } from '../../server/platform/rls-audit';
import { verlopenVerwijderingenAfronden, persoonsgegevensExport } from '../../backend/privacy';
import { checker, nepGoogle } from './hulp/nep-google';

const ROUTE = 'POST /api/eenheid/rls9';
const als = <T>(userId: string, fn: () => Promise<T>) => metVerzoek(ROUTE, async () => { zetGebruiker(userId, 'eenheid'); return fn(); });
const eigenaarVan = (tbl: string, id: string, d: Record<string, any>) => tbl === 'users' ? id : tbl === 'account_identities' ? (d.accountId || d.userId || null) : (d.ownerUserId || d.userId || d.recipientUserId || null);

export async function main(): Promise<number> {
  const { check, einde } = checker('audit-rls');
  if (!appRolActief() || !process.env.DATABASE_URL_MIGRATIE) { console.log('OVERGESLAGEN audit-rls: rollen niet ingesteld'); await closePool(); return 0; }
  const sys = getPool('systeem'), mig = getPool('migratie');
  const stand = (w: 'aan' | 'uit') => mig.query("UPDATE app.rls_instellingen SET waarde = $1 WHERE sleutel = 'afdwingen'", [w]);
  const vorigeStand = (await mig.query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde === 'aan' ? 'aan' : 'uit';
  const A = randomUUID(), B = randomUUID(), C = randomUUID(), D = randomUUID(), X = randomUUID(), ws = `ws-${randomUUID()}`;
  const ids: string[] = [];
  const voeg = async (tbl: string, data: Record<string, unknown>, id = randomUUID()) => { ids.push(id); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', [tbl, id, data]); return id; };
  try {
    // ---- opzet: ruimte van A; B member, C viewer, D admin ----
    for (const [u, naam] of [[A, 'a'], [B, 'b'], [C, 'c'], [D, 'd'], [X, 'x']] as const) await voeg('users', { email: `rls9-${naam}-${u}@example.test`, role: 'member', status: 'approved', name: naam }, u);
    await voeg('workspaces', { ownerUserId: A, name: 'r' }, ws);
    const lidB = await voeg('workspace_members', { workspaceId: ws, userId: B, status: 'active', permission: 'editor', workspaceRole: 'member' });
    await voeg('workspace_members', { workspaceId: ws, userId: C, status: 'active', permission: 'viewer', workspaceRole: 'viewer' });
    await voeg('workspace_members', { workspaceId: ws, userId: D, status: 'active', permission: 'editor', workspaceRole: 'admin' });
    const blokA = await voeg('workspace_blocks', { workspaceId: ws, ownerUserId: A, title: 'x' });
    const blokC = await voeg('workspace_blocks', { workspaceId: ws, ownerUserId: C, title: 'van C (vroeger editor)' });
    const identB = await voeg('account_identities', { accountId: B, provider: 'google', subject: `s-${B}`, status: 'active' });
    const ownerIdent = (await sys.query('SELECT owner_id FROM app.records WHERE id = $1', [identB])).rows[0]?.owner_id;
    check('owner_id van account_identities = accountId (0007)', ownerIdent === B, String(ownerIdent));

    await stand('aan');
    const nieuwBlok = (u: string) => als(u, () => db.add('workspace_blocks', [{ workspaceId: ws, ownerUserId: u, title: 'nieuw' }]));
    const [blokViaC] = await nieuwBlok(C); const [blokViaB] = await nieuwBlok(B);
    if (blokViaB) ids.push(blokViaB); if (blokViaC) ids.push(blokViaC);
    const [cLeest] = await als(C, () => db.get('workspace_blocks', [blokA]));
    const [cWijzigtEigen] = await als(C, () => db.update('workspace_blocks', [{ id: blokC, record: { workspaceId: ws, ownerUserId: C, title: 'gewijzigd' } }]));
    const [bWijzigtA] = await als(B, () => db.update('workspace_blocks', [{ id: blokA, record: { workspaceId: ws, ownerUserId: A, title: 'door B' } }]));
    check('kijker (viewer) leest ruimte-inhoud maar voegt niets toe en wijzigt ook eigen oude blokken niet; lid (member) wel',
      !!cLeest && blokViaC === null && cWijzigtEigen === false && !!blokViaB && bWijzigtA === true, JSON.stringify({ blokViaC, cWijzigtEigen, blokViaB, bWijzigtA }));

    const lidVoor = (u: string, door: string) => als(door, () => db.add('workspace_members', [{ workspaceId: ws, userId: u, status: 'active', permission: 'editor', workspaceRole: 'admin' }]));
    const [viaB] = await lidVoor(X, B); const [viaC] = await lidVoor(X, C);
    const [bOphogen] = await als(B, () => db.update('workspace_members', [{ id: lidB, record: { workspaceId: ws, userId: B, status: 'active', permission: 'editor', workspaceRole: 'admin' } }]));
    const [viaD] = await lidVoor(X, D); if (viaD) ids.push(viaD);
    const [viaA] = await als(A, () => db.add('workspace_members', [{ workspaceId: ws, email: `uitgenodigd-${X}@example.test`, status: 'invited', permission: 'viewer', workspaceRole: 'viewer' }])); if (viaA) ids.push(viaA);
    check('workspace_members: lid/kijker voegen geen leden toe en lid hoogt zichzelf niet op; beheerder (admin) en eigenaar wel',
      viaB === null && viaC === null && bOphogen === false && !!viaD && !!viaA, JSON.stringify({ viaB, viaC, bOphogen, viaD: !!viaD, viaA: !!viaA }));

    const [bNaam] = await als(B, () => db.update('users', [{ id: B, record: { email: `rls9-b-${B}@example.test`, role: 'member', status: 'approved', name: 'nieuwe naam' } }]));
    const [bRol] = await als(B, () => db.update('users', [{ id: B, record: { email: `rls9-b-${B}@example.test`, role: 'owner', status: 'approved', name: 'nieuwe naam' } }]));
    const [bStatus] = await als(C, () => db.update('users', [{ id: C, record: { email: `rls9-c-${C}@example.test`, role: 'member', status: 'approved', name: 'c', statusVoorVerwijdering: 'approved' } }]));
    const [nepEigenaar] = await als(B, () => db.add('users', [{ email: `nep-${B}@example.test`, role: 'owner', status: 'approved' }])); if (nepEigenaar) ids.push(nepEigenaar);
    check('users: eigen naam wijzigen mag; rol/status/serverveld wijzigen of een eigenaar-record aanmaken niet (trigger)',
      bNaam === true && bRol === false && bStatus === false && nepEigenaar === null, JSON.stringify({ bNaam, bRol, bStatus, nepEigenaar }));

    const [bIdent] = await als(B, () => db.get('account_identities', [identB]));
    const [aIdent] = await als(A, () => db.get('account_identities', [identB]));
    check('account_identities: alleen het eigen account leest zijn identiteiten', !!bIdent && aIdent === null);
    const [bVertrekt] = await als(B, () => db.delete('workspace_members', [lidB]));
    check('zelf vertrekken (eigen lidmaatschap verwijderen) mag', bVertrekt === true);
    await voeg('workspace_members', { workspaceId: ws, userId: B, status: 'active', permission: 'editor', workspaceRole: 'member' });

    // ---- pariteit: JS-spiegel (audit-modus) == SQL-policy (afdwingen) voor toevoegen ----
    const kandidaten: Array<[string, Record<string, unknown>]> = [];
    for (const tbl of ['workspace_blocks', 'workspace_members', 'eenheid_rls9_v1', 'users', 'workspaces']) for (const eig of [A, B, C, null]) for (const w of [ws, null]) {
      const d: Record<string, unknown> = { titel: 't' }; if (eig) d.ownerUserId = eig; if (w) d.workspaceId = w; if (tbl === 'workspace_members' && eig) { delete d.ownerUserId; d.userId = eig; d.status = 'active'; }
      kandidaten.push([tbl, d]);
    }
    let verschil = 0; const verschillen: string[] = [];
    for (const u of [A, B, C, D]) {
      const ruimtes = await werkruimtesVan(u);
      for (const [tbl, d] of kandidaten) {
        const id = randomUUID();
        if (tbl === 'users') d.role = 'member';
        const c = await getPool('app').connect();
        let sqlMag = false;
        try {
          await c.query('BEGIN'); await c.query("SELECT set_config('app.user_id', $1, true)", [u]);
          await c.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', [tbl, id, d]); sqlMag = true;
        } catch { sqlMag = false; } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
        const jsMag = rijToegestaan(tbl, 'toevoegen', { id, owner_id: eigenaarVan(tbl, id, d), ws: (d.workspaceId as string) || null }, u, ruimtes, new Set(), new Set());
        if (sqlMag !== jsMag) { verschil++; if (verschillen.length < 5) verschillen.push(`${u === A ? 'A' : u === B ? 'B' : u === C ? 'C' : 'D'} ${tbl} ${JSON.stringify(d)} sql=${sqlMag} js=${jsMag}`); }
      }
    }
    check(`audit-spiegel (rls-audit.ts) geeft voor ${kandidaten.length * 4} gevallen hetzelfde besluit als de SQL-policy`, verschil === 0, verschillen.join(' | '));

    // ---- audit-modus: niets geblokkeerd, wel geteld (ook door de users-trigger) ----
    await stand('uit');
    await sys.query('DELETE FROM app.rls_audit WHERE route = $1', [ROUTE]);
    const [auditRol] = await als(B, () => db.update('users', [{ id: B, record: { email: `rls9-b-${B}@example.test`, role: 'owner', status: 'approved', name: 'b' } }]));
    await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"member\"') WHERE tbl='users' AND id=$1", [B]);
    const [auditBlok] = await nieuwBlok(C); if (auditBlok) ids.push(auditBlok);
    await new Promise((r) => setTimeout(r, 300)); // controleerRijen loopt asynchroon na de query
    await rlsAuditWegschrijven();
    const geteld = (await sys.query('SELECT tbl, actie, aantal FROM app.rls_audit WHERE route = $1 ORDER BY 1, 2', [ROUTE])).rows.map((r) => `${r.tbl}/${r.actie}`);
    check('audit-modus: verboden schrijfacties gaan door maar worden geteld (users/serverveld via trigger, workspace_blocks/toevoegen via spiegel)',
      auditRol === true && !!auditBlok && geteld.includes('users/serverveld') && geteld.includes('workspace_blocks/toevoegen'), geteld.join(','));
  } catch (e) {
    check('onverwachte fout (deel 1)', false, String((e as Error)?.stack || e));
  } finally {
    await stand(vorigeStand as 'aan' | 'uit').catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.rls_audit WHERE route = $1', [ROUTE]).catch(() => undefined);
  }

  // ---- deel 2: echte flows in audit-modus → app.rls_audit blijft leeg ----
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `rls9-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const rij = async (email: string) => (await sys.query("select id, data from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0] as { id: string; data: Record<string, any> } | undefined;
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const waarschuwingen: string[] = []; const echteWarn = console.warn;
  console.warn = (...a: unknown[]) => { const t = a.map(String).join(' '); if (t.includes('[rls-audit]')) waarschuwingen.push(t); echteWarn(...a); };
  try {
    await sys.query("DELETE FROM app.rls_audit WHERE route LIKE 'POST /api/%'");
    const O = G.browser();
    await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', authTime: oud });
    await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', intent: 'step-up' });
    const ADMIN = { confirmation: 'ADMIN_POLICY_CHANGE' };
    const hub = (b: ReturnType<typeof G.browser>, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
    const wsO = await hub(O, '/api/workspace/load');
    const wsId = String(wsO.data.workspace?.id || wsO.data.workspaceId || '');
    const mk = async (naam: string) => {
      const b = G.browser(); const email = `rls9-${naam}-${T}@example.test`;
      await b.aanmelden(`sub-${naam}-${T}`, email, { authTime: oud });
      await b.verzoek('hub.tarasevych.com', '/api/owner/access/request', b.ctxBody());
      const id = (await rij(email))!.id;
      const ok = await O.verzoek('admin.tarasevych.com', `/api/owner/admin/users/${id}`, O.ctxBody('admin', { ...ADMIN, status: 'approved' }));
      return { b, email, id, ok: ok.status };
    };
    const U = await mk('u'), V = await mk('v'), W = await mk('w');
    const deel = await hub(O, '/api/share/email', { workspaceId: wsId, email: U.email, workspaceRole: 'member' });
    const uLaad = await hub(U.b, '/api/workspace/load', { workspaceId: wsId });
    const uBlok = await hub(U.b, '/api/blocks/add', { workspaceId: wsId, kind: 'custom', title: 'van U', url: 'https://example.test/' });
    const link = await hub(O, '/api/share/link', { workspaceId: wsId, workspaceRole: 'viewer' });
    const vJoin = await hub(V.b, '/api/share/join', { code: link.data.code });
    const vLaad = await hub(V.b, '/api/workspace/load', { workspaceId: wsId });
    check('flows: delen, laden, blok toevoegen, link maken en aansluiten werken',
      U.ok === 200 && deel.status === 200 && uLaad.status === 200 && uBlok.status === 200 && link.status === 200 && vJoin.status === 200 && vLaad.status === 200,
      JSON.stringify([U.ok, deel.status, uLaad.status, uBlok.status, uBlok.body.slice(0, 80), link.status, vJoin.status, vLaad.status]));

    // fix 10: link intrekken (ook anoniem) en uitnodiger opnieuw controleren
    const link2 = await hub(O, '/api/share/link', { workspaceId: wsId, workspaceRole: 'viewer' });
    const intrek = await hub(O, '/api/share/link/revoke', { workspaceId: wsId, code: link2.data.code });
    const wJoinIngetrokken = await hub(W.b, '/api/share/join', { code: link2.data.code });
    await hub(O, '/api/share/email', { workspaceId: wsId, email: W.email, workspaceRole: 'admin' });
    const leden = await hub(O, '/api/share/members', { workspaceId: wsId });
    const lidW = (leden.data.members || []).find((m: any) => m.userId === W.id || m.email === W.email);
    const linkW = await hub(W.b, '/api/share/link', { workspaceId: wsId, workspaceRole: 'member' });
    const omlaag = await hub(O, '/api/share/role', { workspaceId: wsId, memberId: lidW?.id, workspaceRole: 'viewer' });
    const X = G.browser(); const xMail = `rls9-x-${T}@example.test`; await X.aanmelden(`sub-x-${T}`, xMail, { authTime: oud });
    await X.verzoek('hub.tarasevych.com', '/api/owner/access/request', X.ctxBody());
    await O.verzoek('admin.tarasevych.com', `/api/owner/admin/users/${(await rij(xMail))!.id}`, O.ctxBody('admin', { ...ADMIN, status: 'approved' }));
    const xJoin = await hub(X, '/api/share/join', { code: linkW.data.code });
    check('deel-link intrekbaar (anoniem); link van een inmiddels gedegradeerde beheerder werkt niet meer',
      intrek.status === 200 && wJoinIngetrokken.status === 400 && wJoinIngetrokken.data.error === 'invite_revoked' && linkW.status === 200 && omlaag.status === 200 && xJoin.status === 403 && xJoin.data.error === 'INVITE_INVITER_NOT_ALLOWED',
      JSON.stringify([intrek.status, wJoinIngetrokken.status, wJoinIngetrokken.data.error, linkW.status, omlaag.status, xJoin.status, xJoin.data.error]));

    const uLid = (leden.data.members || []).find((m: any) => m.userId === U.id);
    const uWeg = await hub(U.b, '/api/share/revoke', { workspaceId: wsId, memberId: uLid?.id });
    await U.b.aanmelden(`sub-u-${T}`, U.email, { intent: 'step-up' });
    const del = await hub(U.b, '/api/account/delete', { confirmEmail: U.email });
    await U.b.aanmelden(`sub-u-${T}`, U.email, { authTime: oud });
    const rec = await hub(U.b, '/api/account/recover', { mode: 'restore' });
    check('flows: zelf vertrekken, zelf verwijderen en herstellen werken', uWeg.status === 200 && del.status === 200 && rec.status === 200, JSON.stringify([uWeg.status, del.status, rec.status]));

    await new Promise((r) => setTimeout(r, 300));
    await rlsAuditWegschrijven();
    const rlsRijen = (await sys.query("SELECT route, tbl, actie, aantal FROM app.rls_audit WHERE route LIKE 'POST /api/%' AND route NOT LIKE 'POST /api/eenheid/%' ORDER BY 1")).rows;
    check('audit-modus: legitieme flows geven geen enkele RLS-overtreding (app.rls_audit leeg, geen [rls-audit]-melding)', rlsRijen.length === 0 && waarschuwingen.length === 0, JSON.stringify(rlsRijen) + waarschuwingen.join(' | '));

    // fix 10: AVG-export bevat identiteiten (owner via accountId); harde verwijdering raakt alleen eigen rijen.
    const exp = await persoonsgegevensExport(V.id);
    check('AVG-export bevat account_identities van het account', Array.isArray((exp.gegevens as any).account_identities) && (exp.gegevens as any).account_identities.length >= 1, Object.keys(exp.gegevens).join(','));
    const ander = randomUUID();
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [ander, { email: V.email, role: 'member', status: 'approved' }]);
    const melding = randomUUID();
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('site_notifications',$1,$2)", [melding, { recipientEmail: V.email, recipientUserId: '', title: 'voor het adres' }]);
    await sys.query("UPDATE app.records SET data = data || $2::jsonb WHERE tbl='users' AND id=$1", [V.id, JSON.stringify({ status: 'deleted', deletedAt: 1, recoverableUntil: Date.now() - 1000 })]);
    const vorigeVlag = process.env.ACCOUNT_DEFINITIEF_WISSEN;
    const r = await verlopenVerwijderingenAfronden(Date.now(), true);
    if (vorigeVlag === undefined) delete process.env.ACCOUNT_DEFINITIEF_WISSEN; else process.env.ACCOUNT_DEFINITIEF_WISSEN = vorigeVlag;
    const meldingBlijft = (await sys.query('SELECT 1 FROM app.records WHERE id = $1', [melding])).rowCount;
    const anderBlijft = (await sys.query("SELECT 1 FROM app.records WHERE tbl='users' AND id = $1", [ander])).rowCount;
    const vIdent = (await sys.query("SELECT count(*)::int n FROM app.records WHERE tbl='account_identities' AND data->>'accountId' = $1", [V.id])).rows[0].n;
    check('harde verwijdering: eigen rijen weg (op id), e-mailrijen die ook bij een ander account met dat adres horen blijven',
      r.accounts.some((a) => a.id === V.id) && vIdent === 0 && meldingBlijft === 1 && anderBlijft === 1, JSON.stringify({ vIdent, meldingBlijft, anderBlijft }));
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [[ander, melding]]);

    // fix 10: handoff-sessie krijgt de echte revocationEpoch; codes van vóór "overal afmelden" zijn ongeldig.
    const H = G.browser(); const hMail = `rls9-h-${T}@example.test`;
    await H.aanmelden(`sub-h-${T}`, hMail, { authTime: oud });
    const hId = (await rij(hMail))!.id;
    await O.verzoek('admin.tarasevych.com', `/api/owner/admin/users/${hId}`, O.ctxBody('admin', { ...ADMIN, status: 'approved' }));
    const revId = randomUUID();
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('owner_revocation_state_v1',$1,$2)", [revId, { userId: hId, epoch: 3, updatedAt: Date.now() - 5000, lastAction: 'eenheidstest' }]);
    await H.aanmelden(`sub-h-${T}`, hMail, { authTime: oud });
    const maak = await H.verzoek('hub.tarasevych.com', '/api/owner/session/handoff/create', H.ctxBody('hub', { target: 'mail' }));
    const code = new URL(String(maak.data.url || 'https://x.invalid/')).searchParams.get('handoff') || '';
    // Inwisselen in een "andere context" van dezelfde browser: alleen de bindingscookie, geen bestaande sessie.
    const H2 = G.browser(); const binding = H.jar.get('tsv_handoff_binding'); if (binding) H2.jar.set('tsv_handoff_binding', binding);
    const inwissel = await H2.verzoek('mail.tarasevych.com', '/api/owner/session/handoff/redeem', { code, service: 'mail' });
    const hSessie = (await sys.query("SELECT data FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'userId'=$1 AND data->>'service'='mail' ORDER BY seq DESC LIMIT 1", [hId])).rows[0]?.data;
    const maak2 = await H.verzoek('hub.tarasevych.com', '/api/owner/session/handoff/create', H.ctxBody('hub', { target: 'cloud' }));
    const code2 = new URL(String(maak2.data.url || 'https://x.invalid/')).searchParams.get('handoff') || '';
    await sys.query("UPDATE app.records SET data = jsonb_set(jsonb_set(data, '{epoch}', '4'), '{updatedAt}', to_jsonb($2::bigint)) WHERE id = $1", [revId, Date.now() + 1000]);
    const inwissel2 = await G.browser().verzoek('cloud.tarasevych.com', '/api/owner/session/handoff/redeem', { code: code2, service: 'cloud' });
    const H3 = G.browser(); const binding2 = H.jar.get('tsv_handoff_binding'); if (binding2) H3.jar.set('tsv_handoff_binding', binding2);
    const inwissel2b = await H3.verzoek('cloud.tarasevych.com', '/api/owner/session/handoff/redeem', { code: code2, service: 'cloud' });
    check('handoff: nieuwe sessie met echte revocationEpoch (3); code van vóór de intrekking wordt geweigerd',
      inwissel.status === 200 && Number(hSessie?.revocationEpoch) === 3 && maak2.status === 200 && inwissel2b.status === 401 && inwissel2.status === 401,
      JSON.stringify([maak.status, inwissel.status, inwissel.body.slice(0, 80), hSessie?.revocationEpoch, maak2.status, inwissel2.status, inwissel2b.status, inwissel2b.body.slice(0, 60)]));
    await sys.query('DELETE FROM app.records WHERE id = $1', [revId]);

    // fix 10: eigenaar zonder uitzondering op blokkade; verouderde eigenaar ook tijdens gebruik gedegradeerd.
    const oId = (await rij(eigenaar))!.id;
    await sys.query("UPDATE app.records SET data = jsonb_set(data, '{status}', '\"blocked\"') WHERE tbl='users' AND id=$1", [oId]);
    const oGeblokkeerd = await G.browser().aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', authTime: oud });
    await sys.query("UPDATE app.records SET data = jsonb_set(data, '{status}', '\"approved\"') WHERE tbl='users' AND id=$1", [oId]);
    process.env.OWNER_EMAIL = `ander-${T}@example.test`;
    const boot = await O.verzoek('admin.tarasevych.com', '/api/owner/session/bootstrap', O.ctxBody('admin'));
    const rolNa = (await rij(eigenaar))?.data.role;
    process.env.OWNER_EMAIL = eigenaar;
    const terug = await G.browser().aanmelden(`sub-o-${T}`, eigenaar, { service: 'admin', authTime: oud });
    const rolTerug = (await rij(eigenaar))?.data.role;
    check('OWNER_EMAIL-account: geblokkeerd = geen aanmelding; verouderde eigenaar tijdens gebruik → member; echte eigenaar krijgt de rol bij aanmelden terug',
      oGeblokkeerd.cb.data.ok === false && boot.status === 200 && rolNa === 'member' && terug.cb.data.ok === true && rolTerug === 'owner',
      JSON.stringify([oGeblokkeerd.cb.data.reasonCode, boot.status, rolNa, terug.cb.data.ok, rolTerug]));
  } catch (e) {
    check('onverwachte fout (deel 2)', false, String((e as Error)?.stack || e));
  } finally {
    console.warn = echteWarn;
    G.herstel();
    const uids = (await sys.query("select id from app.records where tbl='users' and data->>'email' like $1", [`rls9-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (uids.length) await sys.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [uids]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
