// Technische ruimtes v2 (0115, vlag tech-ruimtes-v2): pure beslisfunctie + echte router + wegwerp-PG.
// Modi, pauze/wissel zonder stap-op, uitloggen van de site sluit technisch, beëindigen logt niet uit, één tabblad uitloggen laat lange
// extensie-ontgrendelingen staan, AI/MCP via dezelfde beslissing, twee gebruikers gescheiden, vlag uit = oud gedrag, rolplafond-fout weg,
// eigenaar nooit buitengesloten, schaduwmodus logt alleen.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import * as k from '../../backend/tech-ruimtes-kern';
import { maxMinutenVoor } from '../../shared/tech-rollen';
import { maxMinutenBeste, rollenVoorTermijn, ruimteToegang, termijnOpties, isEigenaarDefinitie, type RuimteCtx } from '../../shared/ruimte-toegang';
import { checker } from './hulp/nep-google';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'hub.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-ruimtes-v2');

  // ---------------------------------------------------------------- puur
  const basis: RuimteCtx = { bron: 'site', nu: 1000, eigenaar: false, accountActief: true, profiel: { rollen: ['tester'], ingetrokken: false },
    sessie: { id: 's', rollen: ['tester'], modus: 'tijd', actief: 'technisch', eind: 2000, grens: 9000, beeindigd: false, siteSessieLeeft: true, gebonden: true } };
  check('puur: geldige sessie → technisch met mogelijkheden van de rol', ruimteToegang(basis, 'technisch').toegestaan && ruimteToegang(basis, 'technisch').mogelijkheden.includes('flags.test'));
  check('puur: pauze → privé (code PAUZE)', ruimteToegang({ ...basis, sessie: { ...basis.sessie!, actief: 'prive' } }, 'technisch').code === 'PAUZE');
  check('puur: site-sessie weg → privé', ruimteToegang({ ...basis, sessie: { ...basis.sessie!, siteSessieLeeft: false } }, 'technisch').code === 'SITE_SESSIE_WEG');
  check('puur: tijd verlopen → privé', ruimteToegang({ ...basis, nu: 2500 }, 'technisch').code === 'VERLOPEN');
  check('puur: open modus voorbij grens (einde site-sessie) → privé', ruimteToegang({ ...basis, nu: 9500, sessie: { ...basis.sessie!, modus: 'tot-site-uitloggen', eind: null } }, 'technisch').code === 'GRENS_VOORBIJ');
  check('puur: tabblad niet gebonden → privé', ruimteToegang({ ...basis, sessie: { ...basis.sessie!, gebonden: false } }, 'technisch').code === 'NIET_GEBONDEN');
  check('puur: MCP zonder AI-instelling → privé; met → technisch', ruimteToegang({ ...basis, bron: 'mcp' }, 'technisch').code === 'AI_NIET_TOEGESTAAN' && ruimteToegang({ ...basis, bron: 'mcp', aiToegestaan: true }, 'technisch').toegestaan);
  check('puur: ingetrokken rol valt meteen weg', ruimteToegang({ ...basis, profiel: { rollen: [], ingetrokken: false } }, 'technisch').toegestaan === false);
  check('puur: privé is altijd toegestaan voor een actief account', ruimteToegang({ ...basis, sessie: null }, 'prive').toegestaan);
  check('puur: eigenaar = rol owner ÉN OWNER_EMAIL', isEigenaarDefinitie('owner', true) && !isEigenaarDefinitie('owner', false) && !isEigenaarDefinitie('admin', true));
  // rolplafond-fout (tech-rollen.ts:55-60): oud = minimum
  check('OUD: tester+beheerder → max 60 min (minimum over rollen, de fout)', maxMinutenVoor(['tester', 'beheerder'], 480) === 60);
  check('NIEUW: tester+beheerder → max 480 (beste rol), 480 min alleen met tester-rechten', maxMinutenBeste(['tester', 'beheerder'], 480) === 480 && rollenVoorTermijn(['tester', 'beheerder'], 480, 'tijd', 480).join() === 'tester' && rollenVoorTermijn(['tester', 'beheerder'], 480, 'tijd', 60).length === 2);
  const opt = termijnOpties(['beheerder'], 480);
  check('termijnen: onbeschikbare opties komen MET reden terug (nooit verborgen)', opt.length === 8 && opt.filter((o) => !o.beschikbaar).every((o) => !!o.reden?.uk && !!o.reden?.nl) && opt.find((o) => o.modus === 'tot-site-uitloggen')?.beschikbaar === false);
  check('termijnen: tester+beheerder open modus beschikbaar met reden «zonder Beheerder»', !!termijnOpties(['tester', 'beheerder'], 480).find((o) => o.modus === 'tot-technisch-einde' && o.beschikbaar && o.reden && o.rollen.join() === 'tester'));

  // ---------------------------------------------------------------- database + router
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

  try {
    await tp.profielVan(eig);
    check('migratie 0115: vlaggen bestaan en staan UIT', (await pool.query(`SELECT count(*)::int AS n FROM app.feature_flags WHERE sleutel IN ('tech-ruimtes-v2','tech-ruimtes-v2-schaduw') AND aan = false`)).rows[0].n === 2);

    // ---------------------------------------------------------------- vlag UIT = oud gedrag
    await vlagZet(false, []);
    const s0 = await sessie(uid), t0 = tab();
    const st0 = await roep(R('status'), s0, t0);
    check('vlag uit: status → aan:false, sessie null, termijnen met redenen', st0.status === 200 && st0.data.aan === false && st0.data.sessie === null && Array.isArray(st0.data.termijnen), JSON.stringify(st0.data).slice(0, 200));
    check('vlag uit: starten → 409 TECH_RUIMTES_V2_UIT', (await roep(R('starten'), s0, t0, { modus: 'tijd', minuten: 30, reden: 'test' })).data.error === 'TECH_RUIMTES_V2_UIT');
    await stapOp(s0);
    const oudAct = await roep('/api/owner/tech/activeren', s0, t0, { minuten: 30, reden: 'oud pad' });
    check('vlag uit: oude /api/owner/tech/activeren werkt zoals vroeger', oudAct.status === 200 && oudAct.data.activatie?.modus === 'tijd', `${oudAct.status} ${JSON.stringify(oudAct.data).slice(0, 160)}`);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');

    // ---------------------------------------------------------------- schaduwmodus (vlag uit): loggen, niets veranderen
    process.env.TECH_RUIMTES_V2_SCHADUW = '1'; k._schaduwLeeg();
    const tS = tab();
    const a = await tp.activeren(eig, tS, 30, 'schaduw zonder sessie'); // rij zonder sessie_id
    const voor = Number((await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.schaduw.verschil'`, [uid])).rows[0].n);
    const zonder = await tp.actieveActivatie(uid, tS);
    await new Promise((r) => setTimeout(r, 400));
    const na = Number((await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.schaduw.verschil'`, [uid])).rows[0].n);
    check('schaduw: oud antwoord ongewijzigd (activering telt nog)', zonder?.id === a.id);
    check('schaduw: verschil (activering zonder sessie) staat in het logboek', na > voor, `${voor}→${na}`);
    delete process.env.TECH_RUIMTES_V2_SCHADUW;
    await tp.beeindigenBijIntrekken(uid, 'handmatig');

    // ---------------------------------------------------------------- vlag AAN voor beide gebruikers
    await vlagZet(true, [uid, uid2]);
    const sA = await sessie(uid), tA1 = tab(), tA2 = tab();
    const zonderStap = await roep(R('starten'), sA, tA1, { modus: 'tijd', minuten: 30, reden: 'zonder stap-op' });
    check('starten vraagt stap-op (403)', zonderStap.status === 403, String(zonderStap.status));
    await stapOp(sA);
    check('oude activeren onder v2 → 409 GEBRUIK_RUIMTES_V2', (await roep('/api/owner/tech/activeren', sA, tA1, { minuten: 30, reden: 'oud' })).data.error === 'GEBRUIK_RUIMTES_V2');
    check('starten: reden te kort → 400 REDEN_ONGELDIG', (await roep(R('starten'), sA, tA1, { modus: 'tijd', minuten: 30, reden: 'x' })).data.error === 'REDEN_ONGELDIG');
    check('starten: modus onbekend → 400 MODUS_ONGELDIG', (await roep(R('starten'), sA, tA1, { modus: 'tot-verlaten', reden: 'abc' })).data.error === 'MODUS_ONGELDIG');
    const st1 = await roep(R('starten'), sA, tA1, { modus: 'tijd', minuten: 30, reden: 'werk op tijd' });
    check('starten tijd 30: technisch, eindTijd ≈ nu+30 min, grensTijd = einde site-sessie', st1.status === 200 && st1.data.actief === 'technisch' && st1.data.sessie?.modus === 'tijd'
      && Math.abs(Date.parse(st1.data.sessie.eindTijd) - Date.now() - 30 * 60_000) < 60_000 && Math.abs(Date.parse(st1.data.sessie.grensTijd) - Date.now() - 30 * 864e5) < 120_000, JSON.stringify(st1.data.sessie));
    const tAct = await tp.actieveActivatie(uid, tA1);
    check('oude controles (zonder sessie, via geregistreerd tabblad) zien de v2-sessie', !!tAct && tAct.mogelijkheden.includes('users.manage'));
    check('tweede tabblad van dezelfde aanmelding: na status hoort het erbij (geen nieuwe stap-op)', (await roep(R('status'), sA, tA2)).data.actief === 'technisch' && !!(await tp.actieveActivatie(uid, tA2)));
    check('onbekend tabblad (nooit met deze aanmelding gezien) → geen technisch', (await tp.actieveActivatie(uid, tab())) === null);

    // pauze / wissel zonder stap-op
    await pool.query(`UPDATE app.records SET data = data - 'x' WHERE id = $1`, [sA.id]);
    await pool.query(`DELETE FROM app.records WHERE tbl='owner_step_up_v1' AND data->>'userId' = $1`, [uid]).catch(() => undefined);
    const p1 = await roep(R('wisselen'), sA, tA1, { naar: 'prive' });
    check('wisselen naar privé: pauze, sessie loopt door', p1.status === 200 && p1.data.pauze === true && p1.data.actief === 'prive' && !!p1.data.sessie && (await tp.actieveActivatie(uid, tA1)) === null, JSON.stringify(p1.data).slice(0, 200));
    const p2 = await roep(R('wisselen'), sA, tA1, { naar: 'technisch' });
    check('wisselen terug naar technisch ZONDER stap-op', p2.status === 200 && p2.data.actief === 'technisch' && p2.data.pauze === false, `${p2.status} ${p2.data.error || ''}`);
    check('wisselen: ongeldige waarde → 400 NAAR_ONGELDIG', (await roep(R('wisselen'), sA, tA1, { naar: 'x' })).data.error === 'NAAR_ONGELDIG');

    // verlengen bijtellen/vervangen
    await stapOp(sA);
    const eind0 = Date.parse(p2.data.sessie.eindTijd);
    const v1 = await roep(R('verlengen'), sA, tA1, { minuten: 30, soort: 'bijtellen' });
    check('verlengen bijtellen: einde + 30 min', v1.status === 200 && Math.abs(Date.parse(v1.data.sessie.eindTijd) - eind0 - 30 * 60_000) < 5000, `${v1.status} ${v1.data.error || ''}`);
    const v2r = await roep(R('verlengen'), sA, tA1, { minuten: 15, soort: 'vervangen' });
    check('verlengen vervangen: einde = nu + 15 min', v2r.status === 200 && Math.abs(Date.parse(v2r.data.sessie.eindTijd) - Date.now() - 15 * 60_000) < 60_000);
    check('verlengen: soort ontbreekt → 400 SOORT_ONGELDIG', (await roep(R('verlengen'), sA, tA1, { minuten: 15 })).data.error === 'SOORT_ONGELDIG');
    check('verlengen: boven 8 uur → 400 DUUR_ONGELDIG', (await roep(R('verlengen'), sA, tA1, { minuten: 480, soort: 'bijtellen' })).data.error === 'DUUR_ONGELDIG');

    // beëindigen logt niet uit
    const b1 = await roep(R('beeindigen'), sA, tA1);
    check('beëindigen: technische sessie weg, site-sessie leeft (status 200, aan, privé)', b1.status === 200 && b1.data.sessie === null && b1.data.actief === 'prive' && (await k.siteSessie(sA.id)).leeft);
    check('na beëindigen: wisselen naar technisch → 409 GEEN_TECH_SESSIE (opnieuw starten nodig)', (await roep(R('wisselen'), sA, tA1, { naar: 'technisch' })).data.error === 'GEEN_TECH_SESSIE');

    // modi en uitloggen
    await stapOp(sA);
    await roep(R('starten'), sA, tA1, { modus: 'tot-site-uitloggen', reden: 'tot uitloggen' });
    await roep(R('status'), sA, tA2);
    await tp.beeindigenBijUitloggen(uid, tA2); // = logout-current in tabblad 2
    check('tot-site-uitloggen: uitloggen van ÉÉN tabblad laat de sessie lopen (dat tabblad valt eruit)', !!(await tp.actieveActivatie(uid, tA1)) && (await tp.actieveActivatie(uid, tA2)) === null);
    await stapOp(sA);
    await roep(R('starten'), sA, tA1, { modus: 'tot-technisch-einde', reden: 'tot einde tech' });
    await tp.beeindigenBijUitloggen(uid, tA1);
    check('tot-technisch-einde: uitloggen van het tabblad beëindigt de technische sessie', (await roep(R('status'), sA, tab())).data.sessie === null);
    // uitloggen van de site (logout-account-everywhere via de echte route)
    const sB = await sessie(uid), tB = tab();
    await stapOp(sB);
    await roep(R('starten'), sB, tB, { modus: 'tot-site-uitloggen', reden: 'tot site uit' });
    const uit = await roep('/api/owner/session/logout-account-everywhere', sB, tB);
    check('uitloggen van de site (overal) sluit de technische sessie', uit.status === 200 && (await pool.query(`SELECT count(*)::int AS n FROM app.tech_ruimte_sessies WHERE user_id=$1 AND beeindigd_op IS NULL`, [uid])).rows[0].n === 0, String(uit.status));
    // sessie ingetrokken zonder haak: site-sessie weg = geen technisch (binding aan levende aanmelding)
    const sC = await sessie(uid), tC = tab();
    await stapOp(sC);
    await roep(R('starten'), sC, tC, { modus: 'tot-site-uitloggen', reden: 'sessie intrekken' });
    await pool.query(`UPDATE app.records SET data = jsonb_set(data, '{revokedAt}', to_jsonb($2::bigint)) WHERE id = $1`, [sC.id, Date.now()]);
    check('site-sessie ingetrokken (ook zonder haak) → oude controles zeggen meteen nee', (await tp.actieveActivatie(uid, tC)) === null);

    // extensie: één tabblad uitloggen laat lange ontgrendelingen staan; overal uitloggen niet
    const sD = await sessie(uid);
    const ontg = async (soort: string, dagen: number) => (await pool.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, ruimte, einde_soort) VALUES ($1,$2,ARRAY['browser.read'],ARRAY['hub.tarasevych.com'],$3, now() + make_interval(days => $4::int), 'prive', $5) RETURNING id`, [`agent-${randomBytes(4).toString('hex')}`, uid, randomBytes(12).toString('hex'), dagen, soort])).rows[0].id;
    const jaar = await ontg('duur', 365), onb = await ontg('handmatig', 366);
    const levend = async (id: string) => !(await pool.query('SELECT ingetrokken_op FROM app.extensie_ontgrendelingen WHERE id=$1', [id])).rows[0].ingetrokken_op;
    await roep('/api/owner/session/logout-current', sD, tab());
    await new Promise((r) => setTimeout(r, 300));
    check('extensie: uitloggen van één tabblad laat «1 рік» en «Без обмеження» staan', await levend(jaar) && await levend(onb));
    await naUitloggen(uid);
    check('extensie: uitloggen van de site/overal trekt ze in', !(await levend(jaar)) && !(await levend(onb)));
    await vlagZet(false, []);
    const jaar2 = await ontg('duur', 365);
    await naUitloggen(uid, tab());
    check('vlag uit: één tabblad uitloggen trekt alles in (oud gedrag ongewijzigd)', !(await levend(jaar2)));
    await vlagZet(true, [uid, uid2]);

    // AI/MCP via dezelfde beslissing
    const sE = await sessie(uid), tE = tab();
    await stapOp(sE);
    await roep(R('starten'), sE, tE, { modus: 'tijd', minuten: 60, reden: 'ai test' });
    check('MCP zonder AI-instelling: privé (geen «ergens een activering»)', (await tp.lopendeActivatie(uid)) === null && (await effectieveRuimte(uid)) === 'prive');
    await stapOp(sE);
    const az = await roep(R('ai-zetten'), sE, tE, { verbindingId: '*', ruimtes: ['prive', 'technisch'], termijn: 'tot-technisch-einde' });
    check('ai-zetten: 200 en zichtbaar in toegang.ai', az.status === 200 && az.data.ai.some((x: any) => x.verbindingId === '*' && x.ruimtes.includes('technisch')), `${az.status} ${az.data.error || ''}`);
    check('MCP met instelling: technisch, zelfde rechten als de site', (await tp.lopendeActivatie(uid))?.mogelijkheden.includes('users.manage') === true && (await effectieveRuimte(uid)) === 'technisch');
    await roep(R('wisselen'), sE, tE, { naar: 'prive' });
    check('MCP: pauze op de site → AI ook privé', (await tp.lopendeActivatie(uid)) === null);
    await roep(R('wisselen'), sE, tE, { naar: 'technisch' });
    await roep(R('beeindigen'), sE, tE);
    check('MCP: technische sessie beëindigd → AI privé', (await tp.lopendeActivatie(uid)) === null);
    check('ai-zetten zonder technische ruimte → 403 TECH_RUIMTE_VEREIST', (await (async () => { await stapOp(sE); return roep(R('ai-zetten'), sE, tE, { verbindingId: '*', ruimtes: ['technisch'], termijn: 'tot-technisch-einde' }); })()).data.error === 'TECH_RUIMTE_VEREIST');

    // twee gebruikers + rolplafond via de route
    const s2 = await sessie(uid2), t2 = tab();
    const st2 = await roep(R('status'), s2, t2);
    check('gebruiker 2 (tester+beheerder): maxMinuten 480 (niet 60), open modi beschikbaar zonder Beheerder', st2.data.maxMinuten === 480 && st2.data.termijnen.find((o: any) => o.modus === 'tot-site-uitloggen')?.beschikbaar === true, JSON.stringify({ m: st2.data.maxMinuten }));
    await stapOp(s2);
    const g2 = await roep(R('starten'), s2, t2, { modus: 'tijd', minuten: 240, reden: 'lang testen' });
    check('gebruiker 2: 240 min → alleen tester-rechten (users.manage niet)', g2.status === 200 && g2.data.sessie.rollen.join() === 'tester' && !g2.data.sessie.mogelijkheden.includes('users.manage'), `${g2.status} ${JSON.stringify(g2.data.sessie || g2.data)}`);
    check('isolatie: sessie van gebruiker 2 geeft gebruiker 1 niets en omgekeerd', (await tp.actieveActivatie(uid, t2)) === null && !!(await tp.actieveActivatie(uid2, t2)));
    const sG = await sessie(uid);
    const bG = await roep(R('beeindigen'), sG, t2);
    check('isolatie: gebruiker 1 kan sessie van 2 niet beëindigen met eigen aanmelding (zelfs met het tabblad van 2)', bG.status === 200 && !!(await tp.actieveActivatie(uid2, t2)), String(bG.status));
    const tg2 = await roep(R('toegang'), s2, t2);
    check('toegang: tester zonder users.manage ziet geen mensenlijst (magBeheren false)', tg2.status === 200 && tg2.data.magBeheren === false && tg2.data.mensen.length === 0 && Array.isArray(tg2.data.extensie) && tg2.data.fouten.length === 0, JSON.stringify(tg2.data.fouten));

    // eigenaar nooit buitengesloten
    await pool.query(`UPDATE app.tech_profielen SET ingetrokken_op = now(), rollen = ARRAY['tester'] WHERE user_id = $1`, [uid]);
    const sF = await sessie(uid), tF = tab();
    const stF = await roep(R('status'), sF, tF);
    check('eigenaar: ingetrokken profiel herstelt zichzelf; technischToegestaan blijft true', stF.data.technischToegestaan === true && stF.data.eigenaar === true && stF.data.rollen.some((r: any) => r.naam === 'eigenaar'));
    await stapOp(sF);
    const gF = await roep(R('starten'), sF, tF, { modus: 'tot-site-uitloggen', reden: 'eigenaar' });
    const tgF = await roep(R('toegang'), sF, tF);
    check('eigenaar kan altijd starten; toegang toont mensen (users.manage)', gF.status === 200 && tgF.data.magBeheren === true && tgF.data.mensen.some((m: any) => m.userId === uid2));
    // account met rol owner maar ander adres (de database staat maar één eigenaar toe: rol meegegeven zoals connector-v2 doet)
    check('rol owner zonder OWNER_EMAIL → effectieveRuimte privé onder v2 (S5)', (await effectieveRuimte(uid2, 'owner')) === 'prive');
    // (idempotentie van 0115: tweede keer draaien als migrator, zie RUNBOOK §17 — niet als app-rol uit deze test)
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await vlagZet(false, []).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [uid2]).catch(() => undefined);
    await pool.query('DELETE FROM app.records WHERE id = ANY($1)', [[uid2, ...geheugen]]).catch(() => undefined);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');
  }
  return einde();
}
