// DE DRIVE-PROJECTIE IN TWEE GESCHEIDEN LADEN (opdracht van de eigenaar, 20.10.2026; migraties 0082 + 0084;
// kern: shared/ruimte-scheiding.ts, backend/ruimte-scheiding.ts, backend/ruimte-cloud-agenda.ts).
//
// HET GAT DAT DEZE TEST VASTHOUDT
//   `google_suite_drive_projection_v1` (backend/google-suite-sync.ts) werd geschreven ZONDER `ruimte`: elke rij heette
//   persoonlijk, ook die van een Drive-rekening die uitsluitend in de TECHNISCHE ruimte verbonden is. Sinds de twee
//   projectieroutes hun rijen op de lade filteren (backend/ruimte-projecties.ts, gebruikt door hub-block-data.ts en
//   globaal-zoek.ts) was dat in BEIDE richtingen fout, en de planner liep door over een BEVROREN lade.
//
// HET SCENARIO IS HET ERGSTE GEVAL: ÉÉN MENS KOPPELT HETZELFDE GOOGLE-ACCOUNT IN BEIDE RUIMTES. Hetzelfde
// `providerAccountId`, hetzelfde e-mailadres — alleen de lade verschilt. Als er dan niets kruist, kruist er niets.
//
// Wat hier bewezen wordt:
//   1. de planner schrijft elke rij in de lade VAN DE REKENING, niet in die van het lopende verzoek;
//   2. de hub-blokken, «Пошук усюди» en de AI-hulpmiddelen (drive_browse) zien in elke ruimte UITSLUITEND de bestanden
//      van die ruimte — in beide richtingen;
//   3. een rij van vóór 0084 (geen `ruimte`) blijft persoonlijk en is uit de technische ruimte onzichtbaar;
//   4. een bevroren lade wordt door de planner OVERGESLAGEN (zoals ICS/CalDAV: `ladeNogGeldig`);
//   5. het besluit van de servereigenaar (overdragen / verwijderen) omvat de projectie én haar syncstand;
//   6. alles is veilig te herhalen: tweemaal synchroniseren geeft geen dubbele rij, tweemaal wissen geen fout.
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const CLIENT_REF = 'google_suite_web_oauth_client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-drive-projectie');

  // De geheimen komen uitsluitend uit env (server/platform/geheimen.ts). Zonder deze drie bestaat er geen grant en dus
  // ook geen toegangstoken — de planner zou dan nooit tot de Drive-API komen en de test zou niets bewijzen.
  const grantKey = `eenheidstest-grant-sleutel-${randomBytes(16).toString('hex')}`;
  process.env.GOOGLE_OAUTH_CLIENT_ID = '1234567890-drive-eenheid.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = `eenheidstest-client-geheim-${randomBytes(12).toString('hex')}`;
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = grantKey;

  // ---------------------------------------------------------------- de nagebootste Google (er gaat niets naar buiten)
  /** Welke bestanden Google per TOEGANGSTOKEN teruggeeft. Het token komt uit het refresh-token van de grant, dus per lade. */
  const bestandenPerToken = new Map<string, Array<Record<string, unknown>>>();
  const veranderingenPerToken = new Map<string, Array<Record<string, unknown>>>();
  const gezien: string[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const nee = (body = '{}', status = 599) => new Response(body, { status });
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const refresh = String(p.get('refresh_token') || '');
      if (!refresh) return nee('{"error":"invalid_grant"}', 400);
      return new Response(JSON.stringify({ access_token: `at-${refresh}`, scope: DRIVE_SCOPE }), { status: 200 });
    }
    if (!url.startsWith('https://www.googleapis.com/drive/v3')) return nee();
    const token = String((init?.headers as Record<string, string> | undefined)?.Authorization || '').replace(/^Bearer\s+/, '');
    gezien.push(`${token} ${url.slice(38, 120)}`);
    if (url.includes('/changes/startPageToken')) return new Response(JSON.stringify({ startPageToken: `start-${token}` }), { status: 200 });
    if (url.includes('/drive/v3/changes?')) {
      const changes = veranderingenPerToken.get(token) || [];
      return new Response(JSON.stringify({ newStartPageToken: `next-${token}`, changes }), { status: 200 });
    }
    if (url.includes('/files/root?')) return new Response(JSON.stringify({ id: 'root-id' }), { status: 200 });
    if (url.includes('/drive/v3/files?')) return new Response(JSON.stringify({ files: bestandenPerToken.get(token) || [] }), { status: 200 });
    return nee();
  }) as typeof fetch;

  const { getPool } = await import('../../server/platform/pg');
  const { db } = await import('../../server/platform');
  const { hoortBij, ladeVelden } = await import('../../shared/ruimte-scheiding');
  const rs = await import('../../backend/ruimte-scheiding');
  const rca = await import('../../backend/ruimte-cloud-agenda');          // registreert de uitvoerder 'cloud'
  const { tabHash } = await import('../../backend/tech-profiel');
  const { runGoogleSuiteDriveSync, googleSuiteDriveProjectionSnapshot } = await import('../../backend/google-suite-sync');
  const { createGoogleSuiteBrowserRoutes } = await import('../../backend/google-suite-browser');
  const { createHubBlockDataRoutes } = await import('../../backend/hub-blok-gegevens');
  const { createGlobalSearchRoutes } = await import('../../backend/globaal-zoek');
  const siteTools = await import('../../backend/site-hulpmiddelen');

  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const tE = randomBytes(24).toString('hex');   // het tabblad MET een lopende technische activering
  const tP = randomBytes(24).toString('hex');   // een gewoon tabblad: persoonlijke ruimte
  const PROJECTIE = 'google_suite_drive_projection_v1';
  const SYNCSTAND = 'google_suite_sync_state_v1';
  const prive = (userId: string) => ({ userId, ruimte: 'prive' as const });
  const tech = (userId: string) => ({ userId, ruimte: 'technisch' as const });

  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]);
    return id;
  };
  const bestaand = (await pool.query(`SELECT id, data->>'status' AS status FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eigId = bestaand ? String(bestaand.id) : await mk(`eig-drive-${sfx}@eenheid.test`, 'owner');
  const eigStatus = bestaand ? String(bestaand.status || 'approved') : 'approved';
  const eigMail = `eig-drive-${sfx}@eenheid.test`;
  const opruimen: string[] = bestaand ? [] : [eigId];
  const hadProfiel = (await pool.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eigId])).rows.length > 0;

  /** Precies de versleuteling van backend/google-suite-inrichting.ts (AES-256-GCM met de AAD van de grant). */
  const grantEnvelope = (refreshToken: string, principalId: string, providerAccountId: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(grantKey, 'utf8').digest(), iv);
    cipher.setAAD(Buffer.from(`google-oauth-grant-v1|${eigId}|${principalId}|${providerAccountId}|${CLIENT_REF}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
    return { algorithm: 'AES-256-GCM', keyVersion: 1, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
  };

  type NepAuth = (event: Record<string, unknown>, body: unknown) => Promise<{ service: string; user: Record<string, unknown> }>;
  const auth = (service: string): NepAuth => async () => ({ service, user: { id: eigId, email: eigMail, name: 'Eig', status: 'approved', role: 'owner' } });
  type Resp = { statusCode: number; body: string };
  const roep = async (routes: Record<string, Array<(ctx: unknown) => Promise<Resp>>>, route: string, body: Record<string, unknown>) => {
    const res = await routes[route][0]({ event: {}, body, params: {} });
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(res.body || '{}'); } catch { data = {}; }
    return { status: res.statusCode, data };
  };

  try {
    for (const naam of ['0082_ruimte_scheiding.sql', '0087_ruimte_besluit_verslag.sql', '0084_ruimte_cloud_agenda.sql']) {
      const mig = readFileSync(join(process.cwd(), 'migrations', naam), 'utf8');
      await getPool('migratie').query(mig);
    }
    // Geen nieuwe kolom: de Drive-projectie ligt in app.records, waar `ruimte` een VELD in `data` is. De index die
    // technische rijen opzoekbaar maakt (overdragen/wissen) staat al in migratie 0086 — die eisen we hier wel.
    check('de projectie heeft geen eigen kolom nodig (app.records) en de index op technische rijen uit 0086 staat er',
      (await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='records_ruimte_technisch_idx'`)).rows.length === 1);

    // ------------------------------------------------------------------ technisch profiel + lopende activering
    const profielId = `tech-${randomBytes(6).toString('hex')}`;
    if (!hadProfiel) await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],480,'test')`, [eigId, profielId]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [eigId])).rows[0].profiel_id);
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eigId]);
    const activeer = async () => {
      await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden='vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [eigId]);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
        VALUES ($1,$2,$3,ARRAY['eigenaar'],'eenheidstest drive-projectie', now() + interval '60 minutes')`, [eigId, pid, tabHash(tE)]);
    };
    await activeer();
    await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [eigId]);
    await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [eigId]);
    await rs.keuzeZetten(eigId, 'per_dienst', eigId);
    await rs.dienstZetten(eigId, 'cloud', 'verbind-eigen', { stapOpGedaan: true });

    // ------------------------------------------------------------------ HETZELFDE Google-account in BEIDE laden
    const SUB = `sub-${sfx}`;            // hetzelfde providerAccountId
    const GMAIL = `pavlo-${sfx}@gmail.test`;  // hetzelfde e-mailadres
    const koppel = async (lade: { userId: string; ruimte: 'prive' | 'technisch' }, refresh: string) => {
      const velden = ladeVelden(lade), nu = Date.now();
      const [principalId] = await db.add('provider_principals_v1', [{ ...velden, provider: 'google', providerAccountId: SUB, identityProviderAccountId: SUB, email: GMAIL, displayName: 'Pavlo', picture: '', accountRole: 'primary', identityLinked: true, createdAt: nu, updatedAt: nu }]);
      const [grantId] = await db.add('google_oauth_grant_v1', [{ ...velden, principalId, providerAccountId: SUB, provider: 'google', clientRef: CLIENT_REF, tokenKind: 'refresh_token', ...grantEnvelope(refresh, String(principalId), SUB), grantedScopes: [DRIVE_SCOPE], grantStatus: 'active', issuedAt: nu, lastVerifiedAt: nu, updatedAt: nu, revokedAt: 0 }]);
      await db.add('provider_service_tokens_v1', [{ ...velden, principalId, provider: 'google', service: 'drive', tokenName: 'google_drive_token', tokenKind: 'logical_handle', oauthGrantId: grantId, requiredScopes: [DRIVE_SCOPE], status: 'active', createdAt: nu, updatedAt: nu, revokedAt: 0 }]);
      await db.add('provider_service_grants_v1', [{ ...velden, principalId, provider: 'google', service: 'drive', tokenName: 'google_drive_token', oauthClientName: CLIENT_REF, status: 'connected', accountId: '', grantedScopes: [DRIVE_SCOPE], createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
      const [accountId] = await db.add('cloud_provider_accounts_v1', [{ ...velden, principalId, provider: 'google_drive', service: 'drive', tokenName: 'google_drive_token', accountRole: 'primary', providerAccountId: SUB, email: GMAIL, displayName: 'Pavlo', picture: '', status: 'connected', grantedScopes: [DRIVE_SCOPE], scopeMode: 'full_drive', connectionStage: 'oauth_complete_sync_not_started', lastErrorCode: '', createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
      return { principalId: String(principalId), accountId: String(accountId), token: `at-${refresh}` };
    };
    const pR = await koppel(prive(eigId), `refresh-prive-${sfx}`);
    const tR = await koppel(tech(eigId), `refresh-tech-${sfx}`);
    check('hetzelfde Google-account (zelfde sub, zelfde adres) kan in BEIDE laden naast elkaar staan — dat is het ergste geval',
      pR.accountId !== tR.accountId && pR.principalId !== tR.principalId && pR.token !== tR.token);

    bestandenPerToken.set(pR.token, [{ id: 'f-priv-1', name: `PERSOONLIJK-salaris-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-19T10:00:00Z', createdTime: '2026-10-01T10:00:00Z', parents: ['root-id'], size: '11', description: 'prive notitie', webViewLink: 'https://drive.google.com/p1' }]);
    bestandenPerToken.set(tR.token, [{ id: 'f-tech-1', name: `TECHNISCH-uitrol-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-19T11:00:00Z', createdTime: '2026-10-02T10:00:00Z', parents: ['root-id'], size: '12', description: 'tech notitie', webViewLink: 'https://drive.google.com/t1' }]);

    // Een rij zoals de planner haar vóór deze reparatie schreef: GEEN `ruimte`.
    const [oudeRij] = await db.add(PROJECTIE, [{ ownerUserId: eigId, principalId: pR.principalId, accountId: pR.accountId, providerFileId: 'f-oud-1', name: `OUD-zonder-ruimte-${sfx}.txt`, mimeType: 'text/plain', modifiedAt: Date.now() - 86400000, createdAt: Date.now() - 86400000, parentIds: [], size: '3', description: '', starred: false, trashed: false, webViewLink: '', updatedAt: Date.now() - 86400000 }]);
    check('een rij van vóór 0084 heeft geen «ruimte» en hoort dus bij de PERSOONLIJKE lade, nooit bij de technische',
      hoortBij({ ownerUserId: eigId }, prive(eigId)) && !hoortBij({ ownerUserId: eigId }, tech(eigId)));

    // ------------------------------------------------------------------ punt 1: de planner schrijft PER LADE
    const ronde1 = await runGoogleSuiteDriveSync(25);
    const rijenVan = async (lade: 'prive' | 'technisch') => (await pool.query(
      `SELECT data->>'name' AS naam FROM app.records WHERE tbl=$1 AND data->>'ownerUserId'=$2 AND COALESCE(data->>'ruimte','prive')=$3 ORDER BY 1`,
      [PROJECTIE, eigId, lade],
    )).rows.map((r: { naam: string }) => String(r.naam));
    const na1P = await rijenVan('prive'), na1T = await rijenVan('technisch');
    check('de planner schrijft de rij in de lade VAN DE REKENING: het technische bestand staat in de technische lade',
      na1T.length === 1 && na1T[0].startsWith('TECHNISCH-'), JSON.stringify(na1T));
    check('en het persoonlijke bestand in de persoonlijke lade — samen met de oude rij zonder «ruimte», die niet verhuisde',
      na1P.length === 2 && na1P.some((n) => n.startsWith('PERSOONLIJK-')) && na1P.some((n) => n.startsWith('OUD-zonder-ruimte')), JSON.stringify(na1P));
    check('elke NIEUWE rij zegt zelf in welke lade zij hoort (geen rij meer zonder «ruimte»)',
      (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl=$1 AND data->>'ownerUserId'=$2 AND data->>'ruimte' IS NULL AND id <> $3`, [PROJECTIE, eigId, oudeRij])).rows[0].n === 0);
    check('ook de SYNCSTAND staat per lade (anders zou één cursor voor twee rekeningen gelden)',
      (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl=$1 AND data->>'ownerUserId'=$2 AND data->>'ruimte'='technisch'`, [SYNCSTAND, eigId])).rows[0].n === 1
      && (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl=$1 AND data->>'ownerUserId'=$2 AND data->>'ruimte'='prive'`, [SYNCSTAND, eigId])).rows[0].n === 1,
      JSON.stringify(ronde1.results).slice(0, 160));

    // punt 6: veilig te herhalen — de tweede ronde is incrementeel en geeft geen dubbele rij
    veranderingenPerToken.set(tR.token, [{ fileId: 'f-tech-1', file: { id: 'f-tech-1', name: `TECHNISCH-uitrol-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-20T09:00:00Z', parents: ['root-id'], webViewLink: 'https://drive.google.com/t1' } }]);
    await runGoogleSuiteDriveSync(25);
    check('tweemaal synchroniseren geeft geen dubbele rij: dezelfde lade, dezelfde rij, bijgewerkt',
      (await rijenVan('technisch')).length === 1 && (await rijenVan('prive')).length === 2);

    // ------------------------------------------------------------------ punt 2: geen enkel scherm kruist de laden
    const hubRoutes = createHubBlockDataRoutes(auth('hub') as never) as Record<string, Array<(ctx: unknown) => Promise<Resp>>>;
    const zoekRoutes = createGlobalSearchRoutes(auth('hub') as never) as Record<string, Array<(ctx: unknown) => Promise<Resp>>>;
    const driveRoutes = createGoogleSuiteBrowserRoutes(auth('cloud') as never) as Record<string, Array<(ctx: unknown) => Promise<Resp>>>;
    const HUB = 'POST /api/owner/hub/blocks/data', ZOEK = 'POST /api/owner/global-search', BROWSE = 'POST /api/owner/cloud/google-suite/drive/browse';

    const hubNamen = async (tab: string) => {
      const r = await roep(hubRoutes, HUB, { service: 'hub', tabContext: tab });
      const blokken = (r.data.blocks || r.data.sources || r.data) as Record<string, unknown>;
      return JSON.stringify(blokken);
    };
    const hubT = await hubNamen(tE), hubP = await hubNamen(tP);
    check('de hub-blokken van de TECHNISCHE ruimte tonen het technische Drive-bestand en NIET het persoonlijke',
      hubT.includes('TECHNISCH-uitrol') && !hubT.includes('PERSOONLIJK-salaris') && !hubT.includes('OUD-zonder-ruimte'));
    check('de hub-blokken van de PERSOONLIJKE ruimte tonen het persoonlijke bestand en de oude rij, en NIET het technische',
      hubP.includes('PERSOONLIJK-salaris') && hubP.includes('OUD-zonder-ruimte') && !hubP.includes('TECHNISCH-uitrol'));

    const zoek = async (tab: string, q: string) => JSON.stringify((await roep(zoekRoutes, ZOEK, { service: 'hub', tabContext: tab, query: q })).data);
    check('«Пошук усюди» (en dus het AI-hulpmiddel site_search) vindt in de technische ruimte alleen het technische bestand',
      (await zoek(tE, sfx)).includes('TECHNISCH-uitrol') && !(await zoek(tE, sfx)).includes('PERSOONLIJK-salaris'));
    // Let op: het antwoord herhaalt de VRAAG (`query`), dus «komt de naam in het antwoord voor» zegt hier niets. Wat
    // telt is het aantal TREFFERS: wie in de persoonlijke ruimte naar de naam van het technische bestand zoekt, moet nul
    // resultaten krijgen.
    const treffers = async (tab: string, q: string) => Number((await roep(zoekRoutes, ZOEK, { service: 'hub', tabContext: tab, query: q })).data.total || 0);
    check('en in de persoonlijke ruimte alleen het persoonlijke — zoeken op de naam van het andere bestand geeft NUL treffers',
      (await zoek(tP, sfx)).includes('PERSOONLIJK-salaris') && !(await zoek(tP, sfx)).includes('TECHNISCH-uitrol')
      && (await treffers(tP, `TECHNISCH-uitrol-${sfx}`)) === 0 && (await treffers(tE, `TECHNISCH-uitrol-${sfx}`)) === 1
      && (await treffers(tE, `PERSOONLIJK-salaris-${sfx}`)) === 0);

    // De AI-hulpmiddelen drive_browse / drive_read_file lopen LIVE langs Google, met de rekening van hun eigen lade.
    const browseT = await roep(driveRoutes, BROWSE, { service: 'cloud', tabContext: tE, sourceOrigin: 'https://cloud.tarasevych.com' });
    const browseP = await roep(driveRoutes, BROWSE, { service: 'cloud', tabContext: tP, sourceOrigin: 'https://cloud.tarasevych.com' });
    check('drive_browse kiest in elke ruimte de rekening van DIE lade (zelfde Google-adres, andere rij) en ziet dus andere bestanden',
      (browseT.data.account as { id?: string })?.id === tR.accountId && (browseP.data.account as { id?: string })?.id === pR.accountId
      && JSON.stringify(browseT.data.files).includes('TECHNISCH-uitrol') && !JSON.stringify(browseT.data.files).includes('PERSOONLIJK-salaris')
      && JSON.stringify(browseP.data.files).includes('PERSOONLIJK-salaris') && !JSON.stringify(browseP.data.files).includes('TECHNISCH-uitrol'),
      `${browseT.status}/${browseP.status} ${String(browseT.data.error || '')}`);
    check('elk Drive-hulpmiddel van de AI wijst naar een route die door de lade-poort loopt',
      siteTools.SITE_TOOLS.filter((t) => /^drive_/.test(t.tool.name)).length >= 2
      && siteTools.SITE_TOOLS.filter((t) => /^drive_/.test(t.tool.name)).every((t) => Object.keys(driveRoutes).includes(t.request({ file_id: 'x'.repeat(8) }).route)));
    check('de momentopname van de projectie leest eveneens per lade (nooit de rij van de andere lade van dezelfde mens)',
      (await rca.metLade(tech(eigId), 'cloud', () => googleSuiteDriveProjectionSnapshot(eigId, tR.principalId))).items.length === 1
      && (await rca.metLade(tech(eigId), 'cloud', () => googleSuiteDriveProjectionSnapshot(eigId, pR.principalId))).items.length === 0);

    // ------------------------------------------------------------------ punt 4: de planner slaat een BEVROREN lade over
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = now() WHERE user_id=$1`, [eigId]);
    await rs.rechtenVerloren(eigId, 'profiel-ingetrokken', 'test');
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eigId]);
    await pool.query(`UPDATE app.records SET data = data || '{"status":"connected"}'::jsonb WHERE tbl='cloud_provider_accounts_v1' AND id=$1`, [tR.accountId]);
    await pool.query(`UPDATE app.records SET data = data || '{"grantStatus":"active","revokedAt":0}'::jsonb WHERE tbl='google_oauth_grant_v1' AND data->>'ownerUserId'=$1 AND data->>'ruimte'='technisch'`, [eigId]);
    check('rechten weg → de hmara van de technische lade is bevroren',
      (await rs.standenVan(eigId)).find((s) => s.dienst === 'cloud')?.stand === 'bevroren');
    bestandenPerToken.set(tR.token, [{ id: 'f-tech-2', name: `TECHNISCH-NA-BEVRIEZEN-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-20T12:00:00Z', parents: ['root-id'] }]);
    veranderingenPerToken.set(tR.token, [{ fileId: 'f-tech-2', file: { id: 'f-tech-2', name: `TECHNISCH-NA-BEVRIEZEN-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-20T12:00:00Z', parents: ['root-id'] } }]);
    bestandenPerToken.set(pR.token, [{ id: 'f-priv-2', name: `PERSOONLIJK-nieuw-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-20T12:00:00Z', parents: ['root-id'] }]);
    veranderingenPerToken.set(pR.token, [{ fileId: 'f-priv-2', file: { id: 'f-priv-2', name: `PERSOONLIJK-nieuw-${sfx}.txt`, mimeType: 'text/plain', modifiedTime: '2026-10-20T12:00:00Z', parents: ['root-id'] } }]);
    const bevrorenRonde = await runGoogleSuiteDriveSync(25);
    const naBevriezenT = await rijenVan('technisch'), naBevriezenP = await rijenVan('prive');
    check('de planner slaat de BEVROREN technische lade over: er komt geen enkel nieuw bestand bij (zoals bij ICS/CalDAV)',
      !naBevriezenT.some((n) => n.includes('NA-BEVRIEZEN')) && naBevriezenT.length === 1
      && JSON.stringify(bevrorenRonde.results).includes('"gesloten":true'), JSON.stringify(naBevriezenT));
    check('en de PERSOONLIJKE lade loopt gewoon door — bevriezen raakt alleen de technische lade',
      naBevriezenP.some((n) => n.startsWith('PERSOONLIJK-nieuw')), JSON.stringify(naBevriezenP));

    // ------------------------------------------------------------------ punt 5: het besluit van de servereigenaar
    const besluit = (b: string) => rs.eigenaarsBesluit({ userId: eigId, dienst: 'cloud', besluit: b, eigenaarId: eigId, doorEigenaar: true, stapOpGedaan: true });
    const over = await besluit('overdragen');
    check('«передати собі»: de uitvoerder noemt de Drive-projectie én haar syncstand met naam, en verplaatst ze naar de persoonlijke lade van de eigenaar',
      over.verslag?.regels.some((r) => r.tabel === `app.records/${PROJECTIE}` && r.rijen >= 1) === true
      && over.verslag?.regels.some((r) => r.tabel === `app.records/${SYNCSTAND}`) === true
      && (await rijenVan('technisch')).length === 0
      && (await rijenVan('prive')).some((n) => n.startsWith('TECHNISCH-uitrol')),
      JSON.stringify(over.verslag?.regels.filter((r) => r.rijen) ?? []).slice(0, 220));
    check('het persoonlijke bestand en de oude rij zonder «ruimte» staan er nog: er is niets overschreven',
      (await rijenVan('prive')).some((n) => n.startsWith('PERSOONLIJK-salaris')) && (await rijenVan('prive')).some((n) => n.startsWith('OUD-zonder-ruimte')));

    // wissen: een verse technische rij, opnieuw bevroren, en dan echt weg
    await db.add(PROJECTIE, [{ ...ladeVelden(tech(eigId)), principalId: tR.principalId, accountId: tR.accountId, providerFileId: 'f-tech-3', name: `TECHNISCH-te-wissen-${sfx}.txt`, mimeType: 'text/plain', modifiedAt: Date.now(), createdAt: Date.now(), parentIds: [], size: '1', description: '', starred: false, trashed: false, webViewLink: '', updatedAt: Date.now() }]);
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='cloud'`, [eigId]);
    const weg = await besluit('verwijderen');
    check('«видалити»: de technische projectierijen zijn echt weg, en de persoonlijke lade is ongemoeid',
      weg.verslag?.regels.some((r) => r.tabel === `app.records/${PROJECTIE}` && r.rijen >= 1) === true
      && (await rijenVan('technisch')).length === 0 && (await rijenVan('prive')).length >= 3,
      JSON.stringify(weg.verslag?.regels.filter((r) => r.rijen) ?? []).slice(0, 220));
    await pool.query(`UPDATE app.ruimte_dienst_stand SET stand='bevroren', vorige_stand='eigen' WHERE user_id=$1 AND dienst='cloud'`, [eigId]);
    const nogmaals = await besluit('verwijderen');
    check('een tweede keer wissen vindt niets meer: rijen 0 en geen fout (idempotent)',
      nogmaals.verslag?.regels.filter((r) => r.tabel.startsWith('app.records/')).every((r) => r.rijen === 0) === true);

    check('de nagebootste Google is werkelijk met TWEE verschillende tokens benaderd (anders bewijst de test niets)',
      gezien.some((g) => g.startsWith(pR.token)) && gezien.some((g) => g.startsWith(tR.token)), String(gezien.length));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    globalThis.fetch = echteFetch;
    const alle = [eigId, ...opruimen];
    for (const sql of [
      'DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)',
      'DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)',
      'DELETE FROM app.tech_activaties WHERE user_id = ANY($1)',
    ]) await pool.query(sql, [alle]).catch(() => undefined);
    await pool.query(
      `DELETE FROM app.records WHERE tbl IN ('google_suite_drive_projection_v1','google_suite_sync_state_v1','provider_principals_v1','provider_service_tokens_v1','provider_service_grants_v1','google_oauth_grant_v1','cloud_provider_accounts_v1','cloud_provider_selections_v1','cloud_audit_v1','google_suite_onboarding_v1') AND data->>'ownerUserId' = ANY($1)`,
      [alle],
    ).catch(() => undefined);
    if (!hadProfiel) await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eigId]).catch(() => undefined);
    else await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1`, [eigId]).catch(() => undefined);
    await pool.query(`UPDATE app.records SET data = data || jsonb_build_object('role','owner','status',$2::text) WHERE tbl='users' AND id=$1`, [eigId, eigStatus]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [opruimen]).catch(() => undefined);
  }
  return einde();
}
