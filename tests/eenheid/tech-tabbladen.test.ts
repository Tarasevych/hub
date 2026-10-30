// Melding van de eigenaar, 18.10.2026: «технічний профіль злітає в новій вкладці». Nieuw model (migratie 0071):
//  - open activering («до виходу з акаунта/профілю») = hele browsersessie: elk tabblad van DEZELFDE aanmeldsessie erft, zonder stap-op;
//  - activering op tijd = eigen tabblad; alleen een tabblad dat vanuit het bron-tabblad is geopend kan een kopie krijgen (zelfde einde);
//  - verlopen = alleen dat tabblad; zelf verlaten (in elk tabblad), uitloggen, intrekken = alle tabbladen van de sessie;
//  - een andere sessie/browser erft nooit.
// Eerst het oude gedrag nagebootst (nieuw tabblad ziet niets), daarna alles via de echte routes (backend/index.ts) tegen de wegwerp-PG.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import { checker } from './hulp/nep-google';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'mcp.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-tabbladen');
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');

  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
  const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
  const sessies: string[] = [];
  const epoch = async () => Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [uid])).rows[0]?.e || 0);
  const sessie = async () => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const rec = { tokenHash: sha(token), userId: uid, service: 'mcp', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: await epoch(), scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    sessies.push(id);
    return { id, createdAt: now, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const roep = async (pad: string, s: { cookie: string }, tabContext: string, body: Record<string, unknown> = {}) => {
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'mcp', tabContext, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await handler(evt as never);
    let data: any = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };
  const status = async (s: { cookie: string }, t: string) => (await roep('/api/owner/tech/status', s, t)).data?.activatie ?? null;
  const S = (s: { id: string; createdAt: number }) => ({ id: s.id, createdAt: s.createdAt });
  const audits = async (actie: string) => Number((await pool.query('SELECT count(*)::int AS n FROM app.audit WHERE owner_id=$1 AND action=$2', [uid, actie])).rows[0].n);

  try {
    await tp.profielVan(eig);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');

    // ---------------------------------------------------------------- 0080: erven is een KEUZE; standaard nieuwe tabbladen = gebruiker
    // Waarom: erven maakte elk tabblad technisch, en de AI in de privéruimte van de gebruiker mag een technisch tabblad nooit
    // lezen of bedienen (extensie 0.6, slot 'prive'). De logica van 0071 blijft, maar staat standaard uit.
    await pool.query('UPDATE app.tech_profielen SET erven_nieuwe_tabbladen = false WHERE user_id = $1', [uid]);
    const s0 = await sessie(); const t0a = tab(), t0b = tab();
    await tp.activeren(eig, t0a, 0, 'standaard: nieuwe tabbladen gebruiker', S(s0));
    check('0080 STANDAARD: een nieuw tabblad erft NIET (het blijft een gebruikerstabblad, zodat de AI van de gebruiker er mag werken)', (await status(s0, t0b)) === null);
    const erfAan = await roep('/api/owner/tech/erven', s0, t0a, { aan: true });
    check('0080: de gebruiker zet «нові вкладки технічні» aan via POST /api/owner/tech/erven; het profiel onthoudt het',
      erfAan.status === 200 && erfAan.data?.profiel?.ervenNieuweTabbladen === true, `${erfAan.status} ${JSON.stringify(erfAan.data?.profiel)}`);
    check('0080: daarna erft een nieuw tabblad weer — de logica van 0071 is ongewijzigd', !!(await status(s0, t0b)));
    const erfFout = await roep('/api/owner/tech/erven', s0, t0a, { aan: 'ja' });
    check('0080: iets anders dan true/false → 400 ERVEN_ONGELDIG (nooit stil negeren)', erfFout.status === 400 && erfFout.data?.error === 'ERVEN_ONGELDIG', `${erfFout.status} ${JSON.stringify(erfFout.data)}`);
    check('0080: de keuze staat in het logboek (owner.tech.erven_keuze)', (await audits('owner.tech.erven_keuze')) >= 1);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');

    // ---------------------------------------------------------------- oud gedrag nagebootst
    const sA = await sessie();
    const t1 = tab(), t2 = tab();
    const open = await tp.activeren(eig, t1, 0, 'werk tot uitloggen', S(sA));
    check('OUD (nagebootst): zonder erven ziet een nieuw tabblad van dezelfde sessie niets', (await tp.actieveActivatie(uid, t2, S(sA))) === null);

    // ---------------------------------------------------------------- open activering: hele browsersessie
    const geerfdVoor = await audits('owner.tech.geerfd');
    const a2 = await status(sA, t2);
    check('NIEUW: open activering is zichtbaar in een nieuw tabblad van dezelfde sessie (zonder stap-op)', !!a2 && a2.herkomst === 'geerfd' && a2.modus === 'tot-uitloggen', JSON.stringify(a2));
    check('erven staat in het logboek (owner.tech.geerfd, «успадковано вкладкою»)', (await audits('owner.tech.geerfd')) === geerfdVoor + 1);
    const a2b = await status(sA, t2);
    check('tweede status in hetzelfde tabblad: dezelfde kopie, geen nieuwe rij', a2b?.id === a2?.id);
    check('de kopie geeft echte rechten in dat tabblad (andere routes zien haar zonder sessie)', !!(await tp.actieveActivatie(uid, t2)));
    const sB = await sessie(), t3 = tab();
    check('andere sessie (andere browser) erft NIET', (await status(sB, t3)) === null && (await status(sB, t1)) === null);

    // ---------------------------------------------------------------- activering op tijd: alleen eigen tabblad (+ geopend vanuit)
    const sC = await sessie(), t4 = tab(), t5 = tab(), t6 = tab();
    const tijd = await tp.activeren(eig, t4, 30, 'kort werk', S(sC));
    check('activering op tijd is NIET zichtbaar in een ander tabblad van dezelfde sessie', (await status(sC, t5)) === null);
    const vreemd = await roep('/api/owner/tech/delen', sB, t4, { doel: t6 });
    check('delen vanuit een andere sessie (zelfde tabcontext) → geweigerd', vreemd.status === 403, `${vreemd.status} ${JSON.stringify(vreemd.data)}`);
    const d = await roep('/api/owner/tech/delen', sC, t4, { doel: t6 });
    const a6 = await status(sC, t6);
    check('geopend vanuit het technische tabblad: eigen kopie met HETZELFDE einde', d.status === 200 && !!a6 && a6.herkomst === 'gedeeld' && a6.eind === tijd.eind && a6.modus === 'tijd', `${d.status} ${JSON.stringify(a6)}`);
    const nogEens = await roep('/api/owner/tech/delen', sC, t4, { doel: t6 });
    check('delen naar een tabblad dat al een rij heeft → 409 (alleen nieuwe tabbladen)', nogEens.status === 409, String(nogEens.status));
    const zelf = await roep('/api/owner/tech/delen', sC, t4, { doel: t4 });
    check('delen naar zichzelf → 400', zelf.status === 400);
    check('delen staat in het logboek (owner.tech.gedeeld)', (await audits('owner.tech.gedeeld')) >= 1);

    // ---------------------------------------------------------------- verlopen: alleen dat tabblad
    const t7 = tab();
    const eigenTijd = await tp.activeren(eig, t7, 15, 'tabblad met eigen tijd', S(sA));
    // Verloopt NÁ het begin van de open activering (eind_op = nu − 5 ms; de open activering liep al langer).
    await new Promise((r) => setTimeout(r, 30));
    await pool.query(`UPDATE app.tech_activaties SET begin_op = now() - interval '20 minutes', eind_op = now() - interval '5 milliseconds' WHERE id=$1`, [eigenTijd.id]);
    check('verlopen van één tabblad: dat tabblad is uit', (await status(sA, t7)) === null);
    check('… de open activering en haar kopie lopen door', !!(await status(sA, t1)) && !!(await status(sA, t2)));
    check('… en het verlopen tabblad wordt niet stil opnieuw technisch (geen erven na eigen einde)', (await status(sA, t7)) === null);
    await pool.query(`UPDATE app.tech_activaties SET begin_op = now() - interval '20 minutes', eind_op = now() - interval '1 second' WHERE id=$1`, [a6.id]);
    check('verlopen van de gedeelde kopie raakt de bron niet', (await status(sC, t6)) === null && !!(await status(sC, t4)));

    // ---------------------------------------------------------------- zelf verlaten in ELK tabblad → alle tabbladen van de sessie
    const t8 = tab();
    check('vóór verlaten: nog een nieuw tabblad erft', !!(await status(sA, t8)));
    const uit = await roep('/api/owner/tech/beeindigen', sA, t2);
    check('«Вийти з технічного профілю» in een GEËRFD tabblad: antwoord zonder activering', uit.status === 200 && uit.data.activatie === null);
    check('… server: bron en alle kopieën van de sessie uit', (await tp.actieveActivatie(uid, t1)) === null && (await tp.actieveActivatie(uid, t2)) === null && (await tp.actieveActivatie(uid, t8)) === null);
    check('… een nieuw tabblad erft daarna niets', (await status(sA, tab())) === null);
    check('… andere sessie (C) ongemoeid', !!(await status(sC, t4)));
    const reden = (await pool.query('SELECT beeindigd_reden AS r FROM app.tech_activaties WHERE id=$1', [open.id])).rows[0]?.r;
    check('… reden «zelf», logboek met «via ander tabblad»', reden === 'zelf' && Number((await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id=$1 AND action='owner.tech.beeindigd' AND details->>'activatie'=$2 AND details->>'via'='ander tabblad'`, [uid, open.id])).rows[0].n) === 1);

    // ---------------------------------------------------------------- nieuwe open activering → tabbladen die eerder uit gingen erven weer
    const open2 = await tp.activeren(eig, t1, -1, 'opnieuw tot verlaten', S(sA));
    const a2n = await status(sA, t2);
    check('nieuwe open activering: eerder verlaten tabblad erft opnieuw', !!a2n && a2n.herkomst === 'geerfd' && a2n.modus === 'tot-verlaten');
    // open → op tijd in het bron-tabblad: kopieën eindigen (bewuste keuze «alleen hier, op tijd»)
    await tp.activeren(eig, t1, 30, 'nu alleen hier', S(sA));
    check('bron schakelt naar «op tijd»: kopieën in andere tabbladen eindigen (vervangen)', (await tp.actieveActivatie(uid, t2)) === null && (await status(sA, t2)) === null && !!(await status(sA, t1)));
    void open2;

    // ---------------------------------------------------------------- uitloggen / intrekken → alle tabbladen; daarna stap-op
    await tp.activeren(eig, t1, 0, 'weer open', S(sA));
    const t9 = tab();
    check('opnieuw open: nieuw tabblad erft', !!(await status(sA, t9)));
    // (de route items/:id/revoke roept precies dit aan; zie tech-sessies.test.ts)
    const n = await tp.beeindigenBijIntrekken(uid, 'revoke', { sessieId: sA.id });
    check('intrekken van de aanmelding beëindigt bron én kopieën', n >= 2 && (await tp.actieveActivatie(uid, t1)) === null && (await tp.actieveActivatie(uid, t9)) === null, String(n));
    const sNa = await sessie();
    check('na intrekken: nieuwe aanmelding in hetzelfde tabblad erft niets', (await status(sNa, t9)) === null && (await status(sNa, t1)) === null);
    const act = await roep('/api/owner/tech/activeren', sNa, t1, { minuten: 0, reden: 'zonder stap-op' });
    check('… en activeren vraagt opnieuw stap-op (403)', act.status === 403, String(act.status));

    // ---------------------------------------------------------------- client: kanaal en kaartje (bron)
    const store = readFileSync('src/tech/tech-opslag.ts', 'utf8');
    check("client: BroadcastChannel 'mr-tech' met aan/uit/vraag/gedeeld", store.includes("TECH_KANAAL = 'mr-tech'") && ["t: 'aan'", "t: 'uit'", "t: 'vraag'", "t: 'gedeeld'"].every((x) => store.includes(x)));
    check('client: verlaten meldt «uit» aan de andere tabbladen; activeren meldt «aan»', /techBeeindigen\(\)[^\n]*meld\(\{ t: 'uit' \}\)/.test(store) && /meld\(\{ t: 'aan' \}\)/.test(store));
    check('client: kaartje eenmalig en 15 s geldig; minuutcontrole blijft als terugval', store.includes('ERF_GELDIG_MS = 15_000') && store.includes('opslag.removeItem(ERF_SLEUTEL)') && store.includes('60_000'));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id=$1 AND sessie_id = ANY($2)', [uid, sessies]).catch(() => undefined);
    if (sessies.length) await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id = ANY($1)`, [sessies]).catch(() => undefined);
    if (!bestaand) { await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined); await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [uid]).catch(() => undefined); }
  }
  return einde();
}
