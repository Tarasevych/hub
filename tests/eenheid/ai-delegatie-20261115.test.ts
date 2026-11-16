// AI-TERMIJN-001 (15.11.2026): termijnen en regels voor de AI-sessiedelegatie — pure regel (shared/ai-delegatie.ts) + echte router,
// kern en wegwerp-PG (migratie 0285).
//
// Reproductie van de klacht van Павло (journaal 15.11, 20:10–20:18): toestemming gegeven op mcp.*, daarna mcp.* naar de gewone ruimte,
// admin.* bleef technisch → Claude verloor de technische ruimte en de pagina sprak zichzelf tegen. Nu:
//   - standaard (tot afmelden van het account, regel «pauze»): pauze op mcp.* terwijl admin.* technisch blijft → AI blijft technisch;
//     alles op pauze → AI wacht (niet ingetrokken) en komt zonder nieuwe toestemming terug;
//   - regel «intrekken»: alles op pauze → ingetrokken, met journaal en melding; terug naar technisch geeft NIETS terug (PR #111-les);
//   - regel «doorwerken» (!): eigenaar overal op pauze → AI toch technisch;
//   - inactief en verlopen → ingetrokken door de veger; '*' alleen met expliciete bevestiging; andere eigenaar ziet niets.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import * as k from '../../backend/tech-ruimtes-kern';
import * as dk from '../../backend/ai-delegatie-kern';
import { beoordeel, gevaren, normaliseerInvoer, AiInvoerFout, STANDAARD_REGELS, type DelegatieFeit, type SessieFeit } from '../../shared/ai-delegatie';
import { checker } from './hulp/nep-google';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-delegatie');

  // ---------------------------------------------------------------- puur
  const nu = 10_000_000;
  const d0: DelegatieFeit = { verbindingId: 'v1', technisch: true, termijn: 'tot-account-uitloggen', eindOp: null, ruimteSessieId: 'mcp', siteSessieId: 'aanm-mcp',
    regels: { ...STANDAARD_REGELS }, gezetOp: nu - 1000, laatstGebruiktOp: null, ingetrokkenOp: null };
  const mcpPauze: SessieFeit = { id: 'mcp', siteSessieId: 'aanm-mcp', actief: 'prive' };
  const adminTech: SessieFeit = { id: 'admin', siteSessieId: 'aanm-admin', actief: 'technisch' };
  const adminPauze: SessieFeit = { ...adminTech, actief: 'prive' };
  const aan = ['aanm-mcp', 'aanm-admin'];
  const b1 = beoordeel(d0, [mcpPauze, adminTech], aan, nu);
  check('puur: DE KLACHT — pauze op mcp, admin technisch → AI technisch via admin', b1.soort === 'toegestaan' && b1.sessieId === 'admin' && !b1.negeerPauze, JSON.stringify(b1));
  check('puur: alles op pauze + regel pauze → wacht AI_PAUZE (niet ingetrokken)', JSON.stringify(beoordeel(d0, [mcpPauze, adminPauze], aan, nu)) === JSON.stringify({ soort: 'wacht', code: 'AI_PAUZE' }));
  check('puur: alles op pauze + regel intrekken → intrekken profiel-gewisseld', beoordeel({ ...d0, regels: { ...d0.regels, bijPauze: 'intrekken' } }, [mcpPauze, adminPauze], aan, nu).soort === 'intrekken');
  const dw = beoordeel({ ...d0, regels: { ...d0.regels, bijPauze: 'doorwerken' } }, [mcpPauze, adminPauze], aan, nu);
  check('puur: alles op pauze + doorwerken (!) → toegestaan met negeerPauze', dw.soort === 'toegestaan' && dw.negeerPauze);
  check('puur: tot-technisch-einde blijft aan ÉÉN sessie (mcp op pauze, admin technisch → wacht)', beoordeel({ ...d0, termijn: 'tot-technisch-einde' }, [mcpPauze, adminTech], aan, nu).soort === 'wacht');
  check('puur: tot-technisch-einde, sessie weg → intrekken technisch-einde', JSON.stringify(beoordeel({ ...d0, termijn: 'tot-technisch-einde' }, [adminTech], aan, nu)) === JSON.stringify({ soort: 'intrekken', reden: 'technisch-einde' }));
  check('puur: tot-site-uitloggen: nieuwe technische sessie in dezelfde aanmelding telt', beoordeel({ ...d0, termijn: 'tot-site-uitloggen' }, [{ id: 'mcp2', siteSessieId: 'aanm-mcp', actief: 'technisch' }], aan, nu).soort === 'toegestaan');
  check('puur: tot-site-uitloggen: aanmelding leeft zonder technische sessie → wacht', beoordeel({ ...d0, termijn: 'tot-site-uitloggen' }, [], aan, nu).soort === 'wacht');
  check('puur: tot-site-uitloggen: aanmelding weg → intrekken site-afgemeld', JSON.stringify(beoordeel({ ...d0, termijn: 'tot-site-uitloggen' }, [adminTech], ['aanm-admin'], nu)) === JSON.stringify({ soort: 'intrekken', reden: 'site-afgemeld' }));
  check('puur: account: overal afgemeld → intrekken account-afgemeld', JSON.stringify(beoordeel(d0, [], [], nu)) === JSON.stringify({ soort: 'intrekken', reden: 'account-afgemeld' }));
  check('puur: account: aangemeld zonder technische sessie → wacht AI_WACHT_OP_SESSIE', JSON.stringify(beoordeel(d0, [], aan, nu)) === JSON.stringify({ soort: 'wacht', code: 'AI_WACHT_OP_SESSIE' }));
  check('puur: onbepaald + blijven (!) + overal afgemeld → wacht op aanmelding (NOOIT technisch zonder eigenaar)',
    JSON.stringify(beoordeel({ ...d0, termijn: 'onbepaald', regels: { ...d0.regels, bijAfmelden: 'blijven' } }, [], [], nu)) === JSON.stringify({ soort: 'wacht', code: 'AI_WACHT_OP_AANMELDING' }));
  check('puur: tijd verlopen → intrekken verlopen', beoordeel({ ...d0, termijn: 'tijd', eindOp: nu - 1 }, [adminTech], aan, nu).soort === 'intrekken');
  check('puur: inactief 60 min overschreden → intrekken inactief', JSON.stringify(beoordeel({ ...d0, gezetOp: nu - 61 * 60_000 }, [adminTech], aan, nu)) === JSON.stringify({ soort: 'intrekken', reden: 'inactief' }));
  check('puur: recent gebruik houdt inactief-regel tegen', beoordeel({ ...d0, gezetOp: nu - 600 * 60_000, laatstGebruiktOp: nu - 5 * 60_000 }, [adminTech], aan, nu).soort === 'toegestaan');
  check('puur: ingetrokken of alleen privé → geen', beoordeel({ ...d0, ingetrokkenOp: nu }, [adminTech], aan, nu).soort === 'geen' && beoordeel({ ...d0, technisch: false }, [adminTech], aan, nu).soort === 'geen');
  // invoer
  const i1 = normaliseerInvoer({ termijn: 'tijd', minuten: 120 }, nu);
  check('invoer: snelknop 2 u → eindOp = nu + 2 u, standaardregels', i1.eindOp === nu + 120 * 60_000 && i1.regels.bijPauze === 'pauzeren' && i1.regels.inactiefMinuten === 60 && i1.regels.bijAfmelden === 'intrekken');
  check('invoer: exacte datum wordt overgenomen', normaliseerInvoer({ termijn: 'tijd', eindOp: nu + 3 * 864e5 }, nu).eindOp === nu + 3 * 864e5);
  const fout = (f: () => unknown) => { try { f(); return ''; } catch (e) { return e instanceof AiInvoerFout ? e.code : 'ANDERS'; } };
  check('invoer: < 15 min, > 5 jaar, datum in het verleden → DUUR_ONGELDIG', fout(() => normaliseerInvoer({ termijn: 'tijd', minuten: 5 }, nu)) === 'DUUR_ONGELDIG'
    && fout(() => normaliseerInvoer({ termijn: 'tijd', minuten: 6 * 366 * 1440 }, nu)) === 'DUUR_ONGELDIG' && fout(() => normaliseerInvoer({ termijn: 'tijd', eindOp: nu - 1 }, nu)) === 'DUUR_ONGELDIG');
  check('invoer: onbekende termijn/regel → TERMIJN_ONGELDIG / REGEL_ONGELDIG', fout(() => normaliseerInvoer({ termijn: 'altijd' as never }, nu)) === 'TERMIJN_ONGELDIG'
    && fout(() => normaliseerInvoer({ termijn: 'onbepaald', regels: { bijPauze: 'x' as never } }, nu)) === 'REGEL_ONGELDIG' && fout(() => normaliseerInvoer({ termijn: 'onbepaald', regels: { inactiefMinuten: 1 } }, nu)) === 'REGEL_ONGELDIG');
  check('invoer: «blijven na afmelden» telt alleen bij tijd/onbepaald', normaliseerInvoer({ termijn: 'tot-account-uitloggen', regels: { bijAfmelden: 'blijven' } }, nu).regels.bijAfmelden === 'intrekken');
  check('gevaren: standaard = geen; onbepaald+doorwerken+nooit+blijven = 4; maand = lang',
    gevaren(normaliseerInvoer({ termijn: 'tot-account-uitloggen' }, nu), nu).length === 0
    && gevaren(normaliseerInvoer({ termijn: 'onbepaald', regels: { bijPauze: 'doorwerken', inactiefMinuten: null, bijAfmelden: 'blijven' } }, nu), nu).join() === 'onbepaald,doorwerken,nooit-inactief,na-afmelden'
    && gevaren(normaliseerInvoer({ termijn: 'tijd', minuten: 30 * 1440 }, nu), nu).join() === 'lang');

  // ---------------------------------------------------------------- database + router
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const { totpStapOpVastleggen } = await import('../../backend/stap-op');
  const { registreerMelder } = await import('../../backend/melder');
  const meldingen: Array<{ userId: string; titel: string; tekst: string }> = [];
  registreerMelder(async (userId, _e, _k, titel, tekst) => { meldingen.push({ userId, titel, tekst }); });

  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else { process.env.OWNER_EMAIL = process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'; await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL, role: 'owner', status: 'approved', name: 'Eigenaar' }]); }
  const uid2 = randomUUID();
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid2, { email: `ander-${uid2.slice(0, 8)}@eenheid.test`, role: 'user', status: 'approved', name: 'Ander' }]);

  const sessie = async (userId: string, host: string, dienst: string) => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const ep = Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [userId])).rows[0]?.e || 0);
    const rec = { tokenHash: sha(token), userId, service: dienst, sourceOrigin: `https://${host}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: ep, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid', deviceLabel: 'Windows-ПК', browser: 'Chrome' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    return { id, createdAt: now, userId, host, dienst, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  type S = Awaited<ReturnType<typeof sessie>>;
  const stapOp = (s: S) => totpStapOpVastleggen({ user: { id: s.userId }, session: { id: s.id, createdAt: s.createdAt } } as never);
  const roep = async (pad: string, s: S, t: string, body: Record<string, unknown> = {}) => {
    const evt = { headers: { host: s.host, origin: `https://${s.host}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: s.dienst, tabContext: t, sourceOrigin: `https://${s.host}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await handler(evt as never);
    let data: any = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };
  const R = (n: string) => `/api/owner/hub/tech/ruimtes/${n}`;
  const grant = async (userId: string) => { const client = `client-${randomBytes(4).toString('hex')}`;
    await pool.query(`INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1,'Claude',ARRAY['https://claude.ai/api/mcp/auth_callback'])`, [client]);
    return String((await pool.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, ruimte, agent)
      VALUES ($1, $2, 'Claude', 'mcp', $3, $4, now() + interval '1 hour', now() + interval '14 days', 'technisch', 'claude') RETURNING id::text AS id`,
    [userId, client, randomBytes(16).toString('hex'), randomBytes(16).toString('hex')])).rows[0].id); };
  const mcp = (vid: string) => k.besluit(uid, { bron: 'mcp', verbindingId: vid });
  const rij = async (vid: string) => (await pool.query('SELECT * FROM app.tech_ruimte_ai WHERE user_id = $1 AND verbinding_id = $2', [uid, vid])).rows[0];
  const journaal = async (actie: string) => Number((await pool.query('SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = $2', [uid, actie])).rows[0].n);

  // Opruimen (AI-TERMIJN-001, opmerking releasethread 15.11): de suite draait in een gedeelde wegwerp-DB na andere suites. Alles wat
  // ze aan gedeelde staat wijzigt (vlag tech-ruimtes-v2, sessies en aanmeldingen van de bestaande eigenaar, zijn AI-delegaties) wordt
  // hier vastgelegd en in finally exact teruggezet. / Знімок спільного стану; у finally повертаємо все як було.
  const vlagVoor = (await pool.query(`SELECT aan, gebruikers FROM app.feature_flags WHERE sleutel = 'tech-ruimtes-v2'`)).rows[0] as { aan: boolean; gebruikers: string[] } | undefined;
  const techVoor = (await pool.query('SELECT id::text AS id FROM app.tech_ruimte_sessies WHERE user_id = $1 AND beeindigd_op IS NULL', [uid])).rows.map((r) => String(r.id));
  const techAlle = (await pool.query('SELECT id::text AS id FROM app.tech_ruimte_sessies WHERE user_id = $1', [uid])).rows.map((r) => String(r.id));
  const siteVoor = (await pool.query(`SELECT id FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1 AND NOT (data ? 'revokedAt')`, [uid])).rows.map((r) => String(r.id));
  const siteAlle = (await pool.query(`SELECT id FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1`, [uid])).rows.map((r) => String(r.id));
  const aiVoor = (await pool.query('SELECT * FROM app.tech_ruimte_ai WHERE user_id = $1', [uid])).rows;
  const herstel = async () => {
    await pool.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = ANY($1)', [[uid, uid2]]);
    for (const r of aiVoor) { const kol = Object.keys(r); await pool.query(`INSERT INTO app.tech_ruimte_ai (${kol.join(', ')}) VALUES (${kol.map((_, i) => `\$${i + 1}`).join(', ')})`, kol.map((x) => r[x])); }
    await pool.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = ANY($1)', [[uid, uid2]]);
    // Eigen sessies en aanmeldingen van de suite sluiten, die van eerdere suites heropenen.
    await pool.query(`UPDATE app.tech_ruimte_sessies SET beeindigd_op = now(), beeindigd_reden = 'zelf' WHERE user_id = ANY($1) AND beeindigd_op IS NULL AND NOT (id::text = ANY($2))`, [[uid, uid2], techAlle]);
    await pool.query('UPDATE app.tech_ruimte_sessies SET beeindigd_op = NULL, beeindigd_reden = NULL WHERE id::text = ANY($1)', [techVoor]);
    await pool.query(`UPDATE app.records SET data = jsonb_set(data, '{revokedAt}', to_jsonb((extract(epoch FROM now()) * 1000)::bigint)) WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = ANY($1) AND NOT (id = ANY($2)) AND NOT (data ? 'revokedAt')`, [[uid, uid2], siteAlle]);
    await pool.query(`UPDATE app.records SET data = data - 'revokedAt' WHERE tbl = 'owner_service_sessions_v1' AND id = ANY($1)`, [siteVoor]);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = $1`, [uid2]);
    if (vlagVoor) await pool.query(`UPDATE app.feature_flags SET aan = $1, gebruikers = $2 WHERE sleutel = 'tech-ruimtes-v2'`, [vlagVoor.aan, vlagVoor.gebruikers]);
    k._vlagCacheLeeg();
  };
  await pool.query(`UPDATE app.feature_flags SET aan = true, gebruikers = $1 WHERE sleutel = 'tech-ruimtes-v2'`, [[uid, uid2]]); k._vlagCacheLeeg();
  await pool.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = $1', [uid]);
  // Wegwerp-DB: sessies en aanmeldingen van eerdere suites van dezelfde eigenaar sluiten, anders telt «alles op pauze» niet.
  await pool.query(`UPDATE app.tech_ruimte_sessies SET beeindigd_op = now(), beeindigd_reden = 'zelf' WHERE user_id = $1 AND beeindigd_op IS NULL`, [uid]);
  await pool.query(`UPDATE app.records SET data = jsonb_set(data, '{revokedAt}', to_jsonb((extract(epoch FROM now()) * 1000)::bigint)) WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1`, [uid]);
  try {
    // Twee piddomeinen in één browser, elk een eigen aanmelding + technische sessie (zoals op de site van Павло).
    const sMcp = await sessie(uid, 'mcp.tarasevych.com', 'mcp'), tMcp = tab();
    const sAdm = await sessie(uid, 'admin.tarasevych.com', 'admin'), tAdm = tab();
    await stapOp(sMcp); await stapOp(sAdm);
    check('opzet: technische sessie op mcp en admin', (await roep(R('starten'), sMcp, tMcp, { modus: 'tot-site-uitloggen', reden: 'test mcp' })).status === 200
      && (await roep(R('starten'), sAdm, tAdm, { modus: 'tot-site-uitloggen', reden: 'test admin' })).status === 200);
    const vid = await grant(uid);

    // '*' zonder bevestiging + onbekende verbinding
    check('«alle verbindingen» zonder bevestiging → 400', (await roep(R('ai-zetten'), sMcp, tMcp, { verbindingId: '*', ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' })).data.error === 'ALLE_VERBINDINGEN_NIET_BEVESTIGD');
    check('onbekende verbinding → 404 VERBINDING_ONBEKEND', (await roep(R('ai-zetten'), sMcp, tMcp, { verbindingId: randomUUID(), ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' })).data.error === 'VERBINDING_ONBEKEND');
    const vidAnder = await grant(uid2);
    check('verbinding van een ANDERE gebruiker → 404 (isolatie)', (await roep(R('ai-zetten'), sMcp, tMcp, { verbindingId: vidAnder, ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' })).data.error === 'VERBINDING_ONBEKEND');
    check('ongeldige duur → 400 DUUR_ONGELDIG', (await roep(R('ai-zetten'), sMcp, tMcp, { verbindingId: vid, ruimtes: ['prive', 'technisch'], termijn: 'tijd', minuten: 3 })).data.error === 'DUUR_ONGELDIG');

    // 1) standaard: tot afmelden van het account, pauze = wachten
    meldingen.length = 0;
    const g1 = await roep(R('ai-zetten'), sMcp, tMcp, { verbindingId: vid, naam: 'Claude', ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' });
    const regel = g1.data.ai?.find((x: any) => x.verbindingId === vid);
    check('gegeven: 200, toegang toont termijn + regels + levende stand «actief»', g1.status === 200 && regel?.delegatie?.termijn === 'tot-account-uitloggen' && regel.delegatie.stand === 'actief' && regel.delegatie.regels.bijPauze === 'pauzeren' && regel.delegatie.regels.inactiefMinuten === 60, JSON.stringify(regel?.delegatie));
    check('gegeven: melding «Надано доступ ШІ» + journaal', meldingen.some((m) => m.titel.startsWith('Надано доступ ШІ')) && (await journaal('owner.tech.ruimte.ai')) > 0);
    check('MCP: technisch', (await mcp(vid)).ruimte === 'technisch');
    await roep(R('wisselen'), sMcp, tMcp, { naar: 'prive' });
    const naPauzeMcp = await mcp(vid);
    check('DE KLACHT: mcp op pauze, admin technisch → Claude BLIJFT technisch (via admin)', naPauzeMcp.ruimte === 'technisch' && String(naPauzeMcp.rij?.sessie_id) === sAdm.id, naPauzeMcp.code);
    await roep(R('wisselen'), sAdm, tAdm, { naar: 'prive' });
    const allesPauze = await mcp(vid);
    check('alles op pauze (regel pauze) → AI privé (PAUZE), toestemming NIET ingetrokken', allesPauze.ruimte === 'prive' && ['PAUZE', 'AI_PAUZE'].includes(allesPauze.code) && !(await rij(vid)).ingetrokken_op, allesPauze.code);
    await roep(R('wisselen'), sAdm, tAdm, { naar: 'technisch' });
    check('terug naar technisch → AI meteen weer technisch, zonder nieuwe toestemming', (await mcp(vid)).ruimte === 'technisch');
    const sessiesToegang = (await roep(R('toegang'), sAdm, tAdm)).data.sessies;
    check('toegang: sessies dragen dienst + apparaat (geen «Інший браузер» meer nodig)', sessiesToegang.some((x: any) => x.dienst === 'mcp' && x.apparaat === 'Windows-ПК' && x.browser === 'Chrome'), JSON.stringify(sessiesToegang).slice(0, 200));

    // 2) regel «intrekken»: alles op pauze → ingetrokken, met melding; terug naar technisch geeft niets terug
    meldingen.length = 0;
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, naam: 'Claude', ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen', regels: { bijPauze: 'intrekken' } });
    check('wijzigen: melding «Змінено доступ ШІ»', meldingen.some((m) => m.titel.startsWith('Змінено доступ ШІ')));
    await roep(R('wisselen'), sAdm, tAdm, { naar: 'prive' });
    const r2 = await rij(vid);
    check('intrekken bij pauze: ingetrokken_reden profiel-gewisseld + melding + journaal', !!r2.ingetrokken_op && r2.ingetrokken_reden === 'profiel-gewisseld'
      && meldingen.some((m) => m.titel.startsWith('Доступ ШІ до технічного простору знято')) && (await journaal('owner.tech.ruimte.ai.ingetrokken')) > 0, JSON.stringify(r2));
    await roep(R('wisselen'), sAdm, tAdm, { naar: 'technisch' });
    check('na intrekken komt de toestemming NIET vanzelf terug (les PR #111)', (await mcp(vid)).ruimte === 'prive' && !!(await rij(vid)).ingetrokken_op);
    const n1 = meldingen.length; await dk.veeg(uid);
    check('één melding per intrekking (veger herhaalt niet)', meldingen.length === n1);

    // 3) doorwerken (!): eigenaar overal op pauze → AI technisch; gevaren in de rij
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, naam: 'Claude', ruimtes: ['prive', 'technisch'], termijn: 'onbepaald', regels: { bijPauze: 'doorwerken', inactiefMinuten: null } });
    check('doorwerken: gevaren in de rij (onbepaald, doorwerken, nooit-inactief)', (await rij(vid)).gevaren.join() === 'onbepaald,doorwerken,nooit-inactief');
    await roep(R('wisselen'), sAdm, tAdm, { naar: 'prive' });
    const dwB = await mcp(vid);
    check('doorwerken: eigenaar overal op pauze → AI toch technisch', dwB.ruimte === 'technisch', dwB.code);
    const dg = (await roep(R('toegang'), sAdm, tAdm)).data.ai.find((x: any) => x.verbindingId === vid);
    check('toegang: stand «doorwerken» zichtbaar', dg?.delegatie?.stand === 'doorwerken', JSON.stringify(dg?.delegatie));
    await roep(R('wisselen'), sAdm, tAdm, { naar: 'technisch' });

    // 4) inactief → veger trekt in
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen', regels: { inactiefMinuten: 15 } });
    await pool.query(`UPDATE app.tech_ruimte_ai SET gezet_op = now() - interval '20 minutes' WHERE user_id = $1 AND verbinding_id = $2`, [uid, vid]);
    await dk.veeg(uid);
    check('inactief 15 min: veger trekt in (reden inactief)', (await rij(vid)).ingetrokken_reden === 'inactief');
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen', regels: { inactiefMinuten: 15 } });
    await pool.query(`UPDATE app.tech_ruimte_ai SET gezet_op = now() - interval '20 minutes' WHERE user_id = $1 AND verbinding_id = $2`, [uid, vid]);
    dk._gebruiktLeeg(); await dk.gebruikt(uid, vid);
    await dk.veeg(uid);
    check('gebruik door de AI houdt de inactief-regel tegen', !(await rij(vid)).ingetrokken_op && (await mcp(vid)).ruimte === 'technisch');

    // 5) tijd: snelknop, daarna verlopen
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, ruimtes: ['prive', 'technisch'], termijn: 'tijd', minuten: 120 });
    const r5 = await rij(vid);
    check('snelknop 2 u: eind_op ≈ nu + 2 u', Math.abs(new Date(r5.eind_op).getTime() - Date.now() - 120 * 60_000) < 60_000);
    await pool.query(`UPDATE app.tech_ruimte_ai SET eind_op = now() - interval '1 minute' WHERE user_id = $1 AND verbinding_id = $2`, [uid, vid]);
    check('verlopen: MCP privé en rij ingetrokken met reden verlopen', (await mcp(vid)).ruimte === 'prive' && (await rij(vid)).ingetrokken_reden === 'verlopen');

    // 6) eigenaar trekt in via de knop
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' });
    const ik = await roep(R('ai-intrekken'), sAdm, tAdm, { verbindingId: vid, naam: 'Claude' });
    check('knop «Зняти»: 200, reden eigenaar, MCP privé', ik.status === 200 && (await rij(vid)).ingetrokken_reden === 'eigenaar' && (await mcp(vid)).ruimte === 'prive');

    // 6b) per agent: geldt ook voor een NIEUWE verbinding van dezelfde AI (herverbinden verliest niets); agent gaat vóór '*'
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: 'agent:claude', naam: 'Claude', ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' });
    await pool.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = $1 AND verbinding_id = $2', [uid, vid]);
    const vidNieuw = await grant(uid);
    check('per agent: nieuwe Claude-verbinding (herverbonden) is meteen technisch', (await mcp(vidNieuw)).ruimte === 'technisch');
    check('ongeldige agent-sleutel → 400 VERBINDING_ONGELDIG', (await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: 'agent:iemand', ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' })).data.error === 'VERBINDING_ONGELDIG');
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: '*', ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen', alleVerbindingen: true });
    await roep(R('ai-intrekken'), sAdm, tAdm, { verbindingId: 'agent:claude' });
    check('agent «alleen privé» gaat vóór «alle verbindingen»', (await mcp(vidNieuw)).ruimte === 'prive');
    await pool.query("DELETE FROM app.tech_ruimte_ai WHERE user_id = $1 AND verbinding_id IN ('*', 'agent:claude')", [uid]);

    // 7) account: overal afmelden trekt in
    await roep(R('ai-zetten'), sAdm, tAdm, { verbindingId: vid, ruimtes: ['prive', 'technisch'], termijn: 'tot-account-uitloggen' });
    await pool.query(`UPDATE app.records SET data = jsonb_set(data, '{revokedAt}', to_jsonb((extract(epoch FROM now()) * 1000)::bigint)) WHERE id = ANY($1)`, [[sMcp.id, sAdm.id]]);
    await dk.veeg(uid);
    check('overal afgemeld: toestemming ingetrokken (account-afgemeld)', (await rij(vid)).ingetrokken_reden === 'account-afgemeld' && (await mcp(vid)).ruimte === 'prive');
  } finally {
    try {
      await herstel();
      const v = (await pool.query(`SELECT aan, gebruikers FROM app.feature_flags WHERE sleutel = 'tech-ruimtes-v2'`)).rows[0];
      const levend = Number((await pool.query('SELECT count(*)::int AS n FROM app.tech_ruimte_sessies WHERE user_id = $1 AND beeindigd_op IS NULL', [uid])).rows[0].n);
      const site = Number((await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1 AND NOT (data ? 'revokedAt')`, [uid])).rows[0].n);
      check('opruimen: vlag, sessies, aanmeldingen en delegaties van de eigenaar zoals vóór de suite',
        (!vlagVoor || (v.aan === vlagVoor.aan && JSON.stringify(v.gebruikers) === JSON.stringify(vlagVoor.gebruikers))) && levend === techVoor.length && site === siteVoor.length
        && Number((await pool.query('SELECT count(*)::int AS n FROM app.tech_ruimte_ai WHERE user_id = $1', [uid])).rows[0].n) === aiVoor.length,
        JSON.stringify({ vlag: v, levend, site, voor: { tech: techVoor.length, site: siteVoor.length, ai: aiVoor.length } }));
    } catch (e) { check('opruimen: gedeelde staat teruggezet', false, String((e as Error)?.message)); }
  }
  return einde();
}
