// Ruimtes-scheiding (0123, vlag ruimtes-scheiding): binding van de technische sessie aan de site-sessie (HMAC), directe links
// 401/403, intrekken van de site-sessie sluit technisch meteen, reden SITE_SESSIE_WEG blijft, koppen no-store/Vary/X-Ruimte,
// beperkende RLS per ruimte, twee gebruikers gescheiden, vlag uit = oud gedrag. Echte router + echte lokale PG.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import * as k from '../../backend/tech-ruimtes-kern';
import { _scheidingCacheLeeg, bindingKlopt, bindingWaarde } from '../../backend/ruimte-sessie';
import { ruimteSleutel, sleutelVanRuimte } from '../../shared/ruimte-sleutel';
import { ruimteToegang, type RuimteCtx } from '../../shared/ruimte-toegang';
import { checker } from './hulp/nep-google';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'hub.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimtes-scheiding');
  // ---------------------------------------------------------------- puur
  const b0: RuimteCtx = { bron: 'site', nu: 1000, eigenaar: false, accountActief: true, profiel: { rollen: ['tester'], ingetrokken: false },
    sessie: { id: 's', rollen: ['tester'], modus: 'tijd', actief: 'technisch', eind: 2000, grens: 9000, beeindigd: false, siteSessieLeeft: true, gebonden: true } };
  check('puur: bindingGeldig ontbreekt (vlag uit) → oud gedrag (technisch)', ruimteToegang(b0, 'technisch').toegestaan);
  check('puur: bindingGeldig false → BINDING_ONGELDIG', ruimteToegang({ ...b0, sessie: { ...b0.sessie!, bindingGeldig: false } }, 'technisch').code === 'BINDING_ONGELDIG');
  check('puur: account niet actief → ACCOUNT_NIET_ACTIEF, ook privé geweigerd', ruimteToegang({ ...b0, accountActief: false }, 'prive').code === 'ACCOUNT_NIET_ACTIEF' && !ruimteToegang({ ...b0, accountActief: false }, 'prive').toegestaan);
  const w = bindingWaarde('sessieA', 'rijX', 1);
  check('HMAC: 64 hex, klopt alleen voor dezelfde sessie/rij/generatie', !!w && /^[0-9a-f]{64}$/.test(w) && bindingKlopt(w, 'sessieA', 'rijX', 1) && !bindingKlopt(w, 'sessieB', 'rijX', 1) && !bindingKlopt(w, 'sessieA', 'rijY', 1) && !bindingKlopt(w, 'sessieA', 'rijX', 2) && !bindingKlopt('zz', 'sessieA', 'rijX', 1));
  check('sleutelcontract: ruimteSleutel bevat de ruimte; andere ruimte matcht niet', ruimteSleutel('technisch', 'mail:lijst') === 'mr-ruimte:technisch:mail:lijst' && sleutelVanRuimte(ruimteSleutel('prive', 'x'), 'prive') && !sleutelVanRuimte(ruimteSleutel('prive', 'x'), 'technisch'));
  let gooit = false; try { ruimteSleutel('x' as never, 'y'); } catch { gooit = true; }
  check('sleutelcontract: onbekende ruimte → fout (nooit stil prive)', gooit);

  // ---------------------------------------------------------------- database + router
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const { totpStapOpVastleggen } = await import('../../backend/stap-op');
  const { gegevensRuimteVeilig } = await import('../../backend/ruimte-scheiding');
  const { metVerzoek, zetGebruiker } = await import('../../server/platform/context');

  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else { process.env.OWNER_EMAIL = process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'; await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL, role: 'owner', status: 'approved', name: 'Eigenaar' }]); }
  const uid2 = randomUUID();
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid2, { email: `tester-${uid2.slice(0, 8)}@eenheid.test`, role: 'user', status: 'approved', name: 'Tester' }]);
  await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['tester'], 480, 'eenheid')`, [uid2, `tech-${randomBytes(6).toString('hex')}`]);
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
  const roep = async (pad: string, s: S | null, t: string, body: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'eenheid' };
    if (s) headers.cookie = s.cookie;
    const evt = { headers, body: JSON.stringify({ service: 'hub', tabContext: t, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await handler(evt as never);
    let data: any = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data, koppen: (r.headers || {}) as Record<string, string> };
  };
  const R = (n: string) => `/api/owner/hub/tech/ruimtes/${n}`;
  const vlag = async (sleutel: string, aan: boolean, gebruikers: string[]) => { await pool.query(`UPDATE app.feature_flags SET aan = $1, gebruikers = $2 WHERE sleutel = $3`, [aan, gebruikers, sleutel]); k._vlagCacheLeeg(); _scheidingCacheLeeg(); };
  /** Server-kant ruimte zoals een dienst die ziet (gegevensRuimteVeilig) binnen een verzoek met deze ankersessie. */
  const ruimteIn = (userId: string, sessieId: string | null, t: string) => metVerzoek('POST /eenheid', async () => { zetGebruiker(userId, 'hub', t, sessieId ?? undefined); return gegevensRuimteVeilig(userId, { tabContext: t }); });

  try {
    await tp.profielVan({ id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' } as never);
    check('migratie 0123: vlag ruimtes-scheiding bestaat en staat UIT', (await pool.query(`SELECT count(*)::int AS n FROM app.feature_flags WHERE sleutel = 'ruimtes-scheiding' AND aan = false`)).rows[0].n === 1);
    check('migratie 0123: kolommen binding + mcp_console_log.ruimte (standaard prive)', (await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='app' AND ((table_name='tech_ruimte_sessies' AND column_name IN ('binding_hmac','binding_generatie')) OR (table_name='mcp_console_log' AND column_name='ruimte' AND column_default LIKE '%prive%'))`)).rows[0].n === 3);

    // ---------------------------------------------------------------- v2 aan, scheiding UIT = oud gedrag
    await vlag('tech-ruimtes-v2', true, [uid, uid2]); await vlag('ruimtes-scheiding', false, []);
    const sA = await sessie(uid), tA = tab();
    await stapOp(sA);
    const st = await roep(R('starten'), sA, tA, { modus: 'tijd', minuten: 30, reden: 'scheiding test' });
    check('starten (v2) → technisch', st.status === 200 && st.data.actief === 'technisch', `${st.status} ${st.data.error || ''}`);
    const rij0 = (await pool.query('SELECT * FROM app.tech_ruimte_sessies WHERE sessie_id = $1 AND beeindigd_op IS NULL', [sA.id])).rows[0];
    check('starten zet HMAC-binding (generatie 1)', !!rij0?.binding_hmac && rij0.binding_generatie === 1 && bindingKlopt(rij0.binding_hmac, sA.id, String(rij0.id), 1));
    const sB = await sessie(uid);
    check('vlag UIT: ander aanmelding met hetzelfde (geregistreerde) tabblad telt nog als technisch (oud gedrag)', (await ruimteIn(uid, sB.id, tA)) === 'technisch');
    const k0 = await roep(R('status'), sA, tA);
    check('vlag UIT: geen nieuwe koppen (geen X-Ruimte, geen Vary)', !k0.koppen['X-Ruimte'] && !k0.koppen.Vary);
    check('vlag UIT: controle-route werkt (200 technisch)', (await roep(R('controle'), sA, tA)).status === 200);

    // ---------------------------------------------------------------- scheiding AAN
    await vlag('ruimtes-scheiding', true, [uid, uid2]);
    const c1 = await roep(R('controle'), sA, tA);
    check('directe link met eigen aanmelding → 200 technisch', c1.status === 200 && c1.data.ruimte === 'technisch', `${c1.status} ${JSON.stringify(c1.data)}`);
    check('koppen: Cache-Control no-store + Vary Cookie + X-Ruimte technisch', c1.koppen['Cache-Control'] === 'no-store' && /cookie/i.test(c1.koppen.Vary || '') && c1.koppen['X-Ruimte'] === 'technisch', JSON.stringify(c1.koppen));
    check('geen sessiecookie → 401', (await roep(R('controle'), null, tA)).status === 401);
    const cB = await roep(R('controle'), sB, tA);
    check('andere aanmelding (zelfde account, zelfde tabblad) → 403 GEEN_TECH_SESSIE + uitleg', cB.status === 403 && cB.data.error === 'GEEN_TECH_SESSIE' && !!cB.data.uitleg?.uk && !!cB.data.uitleg?.nl, JSON.stringify(cB.data));
    check('andere aanmelding: diensten zien privé (gegevensRuimteVeilig)', (await ruimteIn(uid, sB.id, tA)) === 'prive');
    check('eigen aanmelding: diensten zien technisch', (await ruimteIn(uid, sA.id, tA)) === 'technisch');
    check('alleen tabbladcode zonder ankersessie → privé', (await ruimteIn(uid, null, tA)) === 'prive');
    check('privé-tabblad (status privé) krijgt X-Ruimte prive', (await roep(R('status'), sB, tab())).koppen['X-Ruimte'] === 'prive');

    // binding geknoeid → weg
    await pool.query(`UPDATE app.tech_ruimte_sessies SET binding_hmac = $2 WHERE id = $1`, [rij0.id, 'a'.repeat(64)]);
    const cT = await roep(R('controle'), sA, tA);
    check('binding vervalst → 403 BINDING_ONGELDIG', cT.status === 403 && cT.data.error === 'BINDING_ONGELDIG', JSON.stringify(cT.data));
    await pool.query(`UPDATE app.tech_ruimte_sessies SET binding_hmac = NULL WHERE id = $1`, [rij0.id]);
    check('rij zonder binding (van vóór 0123) bindt bij de EIGEN aanmelding', (await roep(R('controle'), sA, tA)).status === 200 && !!(await pool.query('SELECT binding_hmac FROM app.tech_ruimte_sessies WHERE id = $1', [rij0.id])).rows[0].binding_hmac);

    // rotatie bij stap-op (verlengen)
    await stapOp(sA);
    const v = await roep(R('verlengen'), sA, tA, { minuten: 15, soort: 'vervangen' });
    const rij1 = (await pool.query('SELECT * FROM app.tech_ruimte_sessies WHERE id = $1', [rij0.id])).rows[0];
    check('verlengen (stap-op) roteert de binding (generatie +1, nieuwe HMAC)', v.status === 200 && rij1.binding_generatie === 2 && rij1.binding_hmac !== rij0.binding_hmac && bindingKlopt(rij1.binding_hmac, sA.id, String(rij0.id), 2), `${v.status} ${v.data.error || ''}`);

    // twee gebruikers
    const s2 = await sessie(uid2), t2 = tab();
    check('gebruiker 2 (eigen profiel, geen sessie) → privé; gebruiker 1 blijft technisch', (await ruimteIn(uid2, s2.id, t2)) === 'prive' && (await ruimteIn(uid, sA.id, tA)) === 'technisch');
    check('gebruiker 2 met cookie van zichzelf maar tabblad van gebruiker 1 → privé', (await ruimteIn(uid2, s2.id, tA)) === 'prive');

    // RLS: app-rol + app.ruimte
    const app = getPool('app');
    const id1 = (await pool.query(`INSERT INTO app.mcp_console_log (user_id, method, detail, transport, agent, ok, ms, ruimte) VALUES ($1,'p','x','http','a',true,1,'prive') RETURNING id`, [uid])).rows[0].id;
    const id2 = (await pool.query(`INSERT INTO app.mcp_console_log (user_id, method, detail, transport, agent, ok, ms, ruimte) VALUES ($1,'t','x','http','a',true,1,'technisch') RETURNING id`, [uid])).rows[0].id;
    const alsApp = async (ruimte: string | null) => { const c = await app.connect(); try { await c.query('BEGIN'); await c.query(`SELECT set_config('app.user_id', $1, true)`, [uid]); if (ruimte) await c.query(`SELECT set_config('app.ruimte', $1, true)`, [ruimte]);
      const r = (await c.query('SELECT id FROM app.mcp_console_log WHERE id = ANY($1)', [[id1, id2]])).rows.map((x: any) => String(x.id)); await c.query('ROLLBACK'); return r; } finally { c.release(); } };
    const geen = await alsApp(null), tech = await alsApp('technisch'), prv = await alsApp('prive');
    check('RLS: zonder app.ruimte ziet de app-rol beide (oud gedrag)', geen.length === 2, geen.join());
    check('RLS: app.ruimte technisch → alleen technische rij; prive → alleen privé-rij', tech.length === 1 && tech[0] === String(id2) && prv.length === 1 && prv[0] === String(id1), `${tech} | ${prv}`);
    let schrijfGeweigerd = false;
    { const c = await app.connect(); try { await c.query('BEGIN'); await c.query(`SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'technisch', true)`, [uid]);
      await c.query(`INSERT INTO app.mcp_console_log (user_id, method, detail, transport, agent, ok, ms, ruimte) VALUES ($1,'x','x','http','a',true,1,'prive')`, [uid]); } catch { schrijfGeweigerd = true; } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); } }
    check('RLS: technisch verzoek kan geen privé-rij schrijven', schrijfGeweigerd);
    await pool.query('DELETE FROM app.mcp_console_log WHERE id = ANY($1)', [[id1, id2]]);

    // site-sessie ingetrokken → technisch meteen weg, ook voor MCP en directe links
    await pool.query(`INSERT INTO app.tech_ruimte_ai (user_id, verbinding_id, ruimtes, termijn, ruimte_sessie_id) VALUES ($1,'*',ARRAY['technisch'],'tot-technisch-einde',$2) ON CONFLICT (user_id, verbinding_id) DO UPDATE SET ruimtes = EXCLUDED.ruimtes, termijn = EXCLUDED.termijn, eind_op = NULL, ruimte_sessie_id = EXCLUDED.ruimte_sessie_id`, [uid, rij0.id]);
    const mcpVoor = await k.besluit(uid, { bron: 'mcp' });
    check('MCP met AI-instelling vóór intrekken → technisch', mcpVoor.toegestaan && mcpVoor.ruimte === 'technisch', mcpVoor.code);
    await pool.query(`UPDATE app.records SET data = jsonb_set(data, '{revokedAt}', to_jsonb((extract(epoch FROM now())*1000)::bigint)) WHERE id = $1`, [sA.id]);
    check('ingetrokken site-sessie: directe link → 401 (geen sessie)', (await roep(R('controle'), sA, tA)).status === 401);
    const bWeg = await k.besluit(uid, { bron: 'site', sessieId: sA.id });
    check('ingetrokken site-sessie: besluit meteen SITE_SESSIE_WEG (zonder opruimen)', !bWeg.toegestaan && bWeg.code === 'SITE_SESSIE_WEG', bWeg.code);
    const mWeg = await k.besluit(uid, { bron: 'mcp' });
    check('ingetrokken site-sessie: MCP meteen privé', !mWeg.toegestaan && mWeg.ruimte === 'prive', mWeg.code);
    await tp.beeindigenBijIntrekken(uid, 'revoke', { sessieId: sA.id });
    const mNa = await k.besluit(uid, { bron: 'mcp' });
    check('na sluiten wegens site-sessie: MCP geeft SITE_SESSIE_WEG (niet GEEN_TECH_SESSIE)', mNa.code === 'SITE_SESSIE_WEG', mNa.code);
    const sNa = await k.besluit(uid, { bron: 'site', sessieId: sA.id });
    check('na sluiten wegens site-sessie: site-besluit SITE_SESSIE_WEG', sNa.code === 'SITE_SESSIE_WEG', sNa.code);
    // zelf beëindigd ≠ site weg
    const sC = await sessie(uid), tC = tab(); await stapOp(sC);
    await roep(R('starten'), sC, tC, { modus: 'tijd', minuten: 30, reden: 'zelf stoppen' });
    await roep(R('beeindigen'), sC, tC);
    const zelf = await k.besluit(uid, { bron: 'site', sessieId: sC.id });
    check('zelf beëindigd (site leeft) → GEEN_TECH_SESSIE, niet SITE_SESSIE_WEG', zelf.code === 'GEEN_TECH_SESSIE', zelf.code);
    check('eigenaar houdt zijn profiel en kan opnieuw starten (root/eigenaar niet verzwakt)', (await (async () => { await stapOp(sC); return roep(R('starten'), sC, tC, { modus: 'tot-site-uitloggen', reden: 'eigenaar opnieuw' }); })()).data.actief === 'technisch');

    // vlag uit = terug naar oud
    await vlag('ruimtes-scheiding', false, []);
    check('vlag weer UIT: tabblad zonder ankersessie telt weer (oud gedrag)', (await ruimteIn(uid, null, tC)) === 'technisch');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await vlag('ruimtes-scheiding', false, []).catch(() => undefined);
    await vlag('tech-ruimtes-v2', false, []).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_ai WHERE user_id = ANY($1)', [[uid, uid2]]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [uid2]).catch(() => undefined);
    await pool.query('DELETE FROM app.records WHERE id = ANY($1)', [[uid2, ...geheugen]]).catch(() => undefined);
    await tp.beeindigenBijIntrekken(uid, 'handmatig');
  }
  return einde();
}
