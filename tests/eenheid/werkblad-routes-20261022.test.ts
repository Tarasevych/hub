// WERKBLAD (zone F, 22.10.2026): de routes /api/owner/hub/werkblad/{laden,bewaren,terugzetten,tech} op de ECHTE router met twee
// mensen (A eigenaar, B gewoon account) op de levende PostgreSQL (0112 app.werkblad_indeling).
//   1. B laadt → bestaat:false (geen rij, geen standaard uit de database); A bewaart; B laadt → nog steeds niets van A;
//   2. userId/ownerUserId/ruimte in het verzoek worden genegeerd — de lade komt alleen uit de sessie en het tabblad;
//   3. normalisatie op de server: technische widgets in de persoonlijke lade vallen weg, «binnenkort» ook, te groot → 413;
//   4. versie: een oudere client overschrijft geen nieuwere rij (409 + actuele rij); versie telt op;
//   5. eigen achtergrond: alleen data:image/*;base64 (geen http, geen svg); te groot → 413; blijft staan als de client hem niet meestuurt;
//   6. technische lade van A (tabblad met activering): eigen rij, los van de persoonlijke; /tech geeft de samenvatting; B (geen profiel) → 403;
//      /tech in de persoonlijke lade → 403;
//   7. terugzetten wist alleen de eigen rij van die lade;
//   8. RLS: met DATABASE_URL_APP (run-test-rls.sh) ziet app.user_id = B nul rijen van A; anders eerlijk «overgeslagen».
import { randomBytes } from 'node:crypto';
import { getPool, appRolActief } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';

const HUB = 'hub.tarasevych.com';
type Antw = { status: number; data: Record<string, any>; body: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Br = { verzoek: (host: string, pad: string, body?: unknown, extra?: Record<string, unknown>) => Promise<Antw>; aanmelden: (sub: string, email: string, o?: Record<string, unknown>) => Promise<unknown>; tab: string; ctxBody: (s?: string, e?: Record<string, unknown>) => Record<string, unknown> };
const PNG = `data:image/png;base64,${Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64').toString('base64')}`;

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-routes-20261022');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const pool = getPool('systeem');
  const eigenaar = `wb-a-${T}@example.test`, subA = `sub-wb-a-${T}`, emailB = `wb-b-${T}@example.test`, subB = `sub-wb-b-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  let A = '', B = '';
  const pad = (naam: string) => `/api/owner/hub/werkblad/${naam}`;
  const via = (b: Br, naam: string, body: Record<string, unknown> = {}) => b.verzoek(HUB, pad(naam), b.ctxBody('hub', body));
  try {
    const P = G.browser() as unknown as Br; await P.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    A = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const Bb = G.browser() as unknown as Br; await Bb.aanmelden(subB, emailB, { service: 'hub' });
    B = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [emailB])).rows[0]?.id || '');
    await pool.query(`update app.records set data = data || '{"status":"approved"}'::jsonb where tbl='users' and id = ANY($1)`, [[A, B]]);
    check('підготовка: два акаунти (A власник, B звичайний), обидва approved', !!A && !!B && A !== B);

    // ---------------------------------------------------------------- 1. geen rij → bestaat:false; A bewaart; B ziet niets van A
    const l0 = await via(Bb, 'laden');
    check('laden B zonder rij: 200, bestaat:false, indeling null, ruimte prive (geen standaard uit de database)', l0.status === 200 && l0.data.bestaat === false && l0.data.indeling === null && l0.data.ruimte === 'prive' && l0.data.versie === 0, `${l0.status} ${l0.body.slice(0, 200)}`);
    const indA = { v: 2, achtergrond: 'zee', items: [{ tid: 'w1', id: 'begroeting', k: 12, r: 1 }, { tid: 'w2', id: 'post', k: 6, r: 3, inst: { weergave: 'tellers' } }, { tid: 'w3', id: 'snelkoppeling', k: 3, r: 1, inst: { url: 'https://a-geheim.test/', titel: 'GEHEIM-A' } }] };
    const b1 = await via(P, 'bewaren', { indeling: indA, versie: 0, herkomst: 'bureau' });
    check('bewaren A: 200, ok, versie 1, herkomst bureau, indeling terug genormaliseerd', b1.status === 200 && b1.data.ok === true && b1.data.versie === 1 && b1.data.herkomst === 'bureau' && b1.data.indeling.items.length === 3 && b1.data.indeling.achtergrond === 'zee', `${b1.status} ${b1.body.slice(0, 300)}`);
    const lA = await via(P, 'laden');
    check('laden A: eigen rij terug (bestaat:true, 3 widgets, versie 1)', lA.status === 200 && lA.data.bestaat === true && lA.data.indeling.items.length === 3 && lA.data.versie === 1);
    const lB = await via(Bb, 'laden');
    check('АТАКА 1: B laadt → nog steeds geen rij; niets van A (geen GEHEIM-A in het antwoord)', lB.status === 200 && lB.data.bestaat === false && !lB.body.includes('GEHEIM-A'));

    // ---------------------------------------------------------------- 2. userId / ownerUserId / ruimte in het verzoek worden genegeerd
    const atk = await via(Bb, 'laden', { userId: A, ownerUserId: A, ruimte: 'prive', lade: { userId: A } });
    check('АТАКА 2: B met userId/ownerUserId van A in het verzoek → eigen (lege) lade, niets van A', (atk.status === 200 && atk.data.bestaat === false && !atk.body.includes('GEHEIM-A')) || atk.status === 403, `${atk.status} ${atk.body.slice(0, 120)}`);
    const atk2 = await via(Bb, 'bewaren', { indeling: { v: 2, items: [{ id: 'post' }] }, userId: A, ownerUserId: A, versie: 0 });
    const naAtk = await via(P, 'laden');
    check('АТАКА 2b: B bewaart met ownerUserId van A → de rij van A blijft onaangeroerd (nog 3 widgets, versie 1)', naAtk.data.indeling.items.length === 3 && naAtk.data.versie === 1, `${atk2.status} ${atk2.body.slice(0, 120)}`);
    await via(Bb, 'terugzetten');

    // ---------------------------------------------------------------- 3. normalisatie op de server
    const vuil = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'http://x', items: [{ id: 'tech-server' }, { id: 'github' }, { id: 'onzin' }, { id: 'agenda', k: 99, r: 99 }, { id: 'begroeting' }, { id: 'begroeting' }] }, versie: 1 });
    check('server normaliseert: tech-widget en «binnenkort» en onzin vallen weg in de persoonlijke lade, dubbele begroeting → één, formaat begrensd, achtergrond → nacht',
      vuil.status === 200 && vuil.data.indeling.items.map((t: { id: string }) => t.id).join(',') === 'agenda,begroeting' && vuil.data.indeling.items[0].k === 12 && vuil.data.indeling.items[0].r === 6 && vuil.data.indeling.achtergrond === 'nacht' && vuil.data.versie === 2, vuil.body.slice(0, 300));
    const groot = await via(P, 'bewaren', { indeling: { v: 2, items: Array.from({ length: 2000 }, () => ({ id: 'post', inst: { x: 'y'.repeat(100) } })) }, versie: 2 });
    check('te groot → 413 WERKBLAD_TE_GROOT', groot.status === 413, `${groot.status} ${groot.body.slice(0, 120)}`);

    // ---------------------------------------------------------------- 4. versie
    const oud = await via(P, 'bewaren', { indeling: { v: 2, items: [{ id: 'post' }] }, versie: 1 });
    check('oudere client (versie 1 terwijl de server op 2 staat) → 409 WERKBLAD_VEROUDERD + de actuele rij (agenda,begroeting)', oud.status === 409 && oud.data.code === 'WERKBLAD_VEROUDERD' && oud.data.indeling.items.map((t: { id: string }) => t.id).join(',') === 'agenda,begroeting' && oud.data.versie === 2, `${oud.status} ${oud.body.slice(0, 200)}`);
    const nieuw = await via(P, 'bewaren', { indeling: { v: 2, items: [{ id: 'post' }] }, versie: 2 });
    check('client met de actuele versie → bewaard, versie 3; herkomst blijft (eigen na een zelf-bewaring)', nieuw.status === 200 && nieuw.data.versie === 3 && nieuw.data.indeling.items[0].id === 'post');
    const zonder = await via(P, 'bewaren', { indeling: { v: 2, items: [{ id: 'taken' }] } });
    check('client zonder versie (0) → bewaart altijd (eerste keer / onbekend)', zonder.status === 200 && zonder.data.versie === 4);

    // ---------------------------------------------------------------- 5. eigen achtergrond
    const png = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'eigen', items: [{ id: 'taken' }] }, achtergrondEigen: PNG, versie: 4 });
    check('eigen achtergrond (data:image/png;base64) → bewaard, achtergrond eigen', png.status === 200 && png.data.indeling.achtergrond === 'eigen' && png.data.achtergrondEigen === PNG, png.body.slice(0, 200));
    const blijft = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'eigen', items: [{ id: 'taken' }, { id: 'post' }] }, versie: 5 });
    check('eigen achtergrond blijft staan als de client alleen de indeling meestuurt', blijft.status === 200 && blijft.data.achtergrondEigen === PNG && blijft.data.indeling.achtergrond === 'eigen');
    const http = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'eigen', items: [{ id: 'taken' }] }, achtergrondEigen: 'https://kwaad.test/x.png', versie: 6 });
    const svg = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'eigen', items: [{ id: 'taken' }] }, achtergrondEigen: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==', versie: 7 });
    check('АТАКА 5: http-adres of svg als achtergrond → geweigerd; bestaande eigen afbeelding blijft (geen stille overschrijving)', http.status === 200 && http.data.achtergrondEigen === PNG && svg.status === 200 && svg.data.achtergrondEigen === PNG, `${http.body.slice(0, 100)} | ${svg.body.slice(0, 100)}`);
    const teGroot = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'eigen', items: [{ id: 'taken' }] }, achtergrondEigen: `data:image/jpeg;base64,${'A'.repeat(420_000)}`, versie: 8 });
    check('eigen achtergrond > 400 kB → 413', teGroot.status === 413);
    const weg = await via(P, 'bewaren', { indeling: { v: 2, achtergrond: 'nacht', items: [{ id: 'taken' }] }, versie: 8 });
    check('achtergrond terug op een verloop → de eigen afbeelding wordt gewist (geen oude bytes blijven liggen)', weg.status === 200 && weg.data.achtergrondEigen === '' && weg.data.indeling.achtergrond === 'nacht');

    // ---------------------------------------------------------------- 6. technische lade van A
    const Tb = G.browser() as unknown as Br; await Tb.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const { tabHash } = await import('../../backend/tech-profiel');
    const rs = await import('../../backend/ruimte-scheiding');
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['eigenaar'],'werkblad-test', now() + interval '60 minutes')`, [A, pid, tabHash(Tb.tab)]);
    const ruimteT = await rs.gegevensRuimteVeilig(A, { tabContext: Tb.tab });
    check('підготовка: технічна вкладка A → ruimte technisch', ruimteT === 'technisch', ruimteT);
    const lT = await via(Tb, 'laden');
    check('technische lade: eigen (nog lege) rij, los van de persoonlijke', lT.status === 200 && lT.data.ruimte === 'technisch' && lT.data.bestaat === false);
    const bT = await via(Tb, 'bewaren', { indeling: { v: 2, items: [{ id: 'tech-server' }, { id: 'tech-updates' }, { id: 'post' }] }, versie: 0 });
    check('technische lade: technische widgets worden bewaard; persoonlijke rij blijft wat ze was', bT.status === 200 && bT.data.ruimte === 'technisch' && bT.data.indeling.items.map((t: { id: string }) => t.id).join(',') === 'tech-server,tech-updates,post'
      && (await via(P, 'laden')).data.indeling.items.map((t: { id: string }) => t.id).join(',') === 'taken');
    const rijen = (await pool.query('SELECT ruimte FROM app.werkblad_indeling WHERE user_id=$1 ORDER BY ruimte', [A])).rows.map((r) => r.ruimte);
    check('database: twee rijen voor A (prive + technisch), nul voor B', rijen.join(',') === 'prive,technisch' && (await pool.query('SELECT count(*)::int AS n FROM app.werkblad_indeling WHERE user_id=$1', [B])).rows[0].n === 0);
    const tech = await via(Tb, 'tech');
    check('/tech in de technische lade (eigenaar): server/release/uitrol/diagnostiek zonder paden van de server', tech.status === 200 && typeof tech.data.server?.db === 'boolean' && typeof tech.data.server?.kernen === 'number' && 'release' in tech.data && Array.isArray(tech.data.uitrol) && !/\/srv\/|\/var\/lib/.test(tech.body), `${tech.status} ${tech.body.slice(0, 200)}`);
    const techP = await via(P, 'tech');
    check('/tech in de persoonlijke lade → 403 WERKBLAD_TECH_RUIMTE_VEREIST', techP.status === 403 && /WERKBLAD_TECH_RUIMTE_VEREIST/.test(techP.body), `${techP.status} ${techP.body.slice(0, 120)}`);
    const techB = await via(Bb, 'tech');
    check('АТАКА 6: B (geen technisch profiel) → 403', techB.status === 403);

    // ---------------------------------------------------------------- 7. terugzetten
    const tz = await via(Tb, 'terugzetten');
    check('terugzetten in de technische lade wist alleen die rij; de persoonlijke blijft', tz.status === 200 && tz.data.gewist === true && (await pool.query('SELECT ruimte FROM app.werkblad_indeling WHERE user_id=$1', [A])).rows.map((r) => r.ruimte).join(',') === 'prive');
    const tzB = await via(Bb, 'terugzetten');
    check('terugzetten B zonder rij: ok, gewist:false, en de rij van A staat er nog', tzB.status === 200 && tzB.data.gewist === false && (await pool.query('SELECT count(*)::int AS n FROM app.werkblad_indeling WHERE user_id=$1', [A])).rows[0].n === 1);

    // ---------------------------------------------------------------- 8. RLS
    if (appRolActief()) {
      const { alsGebruiker } = await import('../../backend/ai-toestemmingen');
      const nB = await alsGebruiker(B, async (q) => Number((await q('SELECT count(*)::int AS n FROM app.werkblad_indeling')).rows[0].n));
      const nA = await alsGebruiker(A, async (q) => Number((await q('SELECT count(*)::int AS n FROM app.werkblad_indeling')).rows[0].n));
      check('RLS: app.user_id = B ziet 0 rijen; A ziet zijn eigen 1 (zonder WHERE)', nB === 0 && nA === 1, `${nB}/${nA}`);
      let upd = -1;
      try { upd = await alsGebruiker(B, async (q) => Number((await q(`UPDATE app.werkblad_indeling SET indeling = '{"v":2,"items":[],"achtergrond":"nacht"}'::jsonb WHERE user_id = $1`, [A])).rowCount || 0)); } catch { upd = -2; }
      check('RLS: B kan de rij van A niet bijwerken (0 rijen)', upd === 0, String(upd));
    } else check('RLS: overgeslagen (geen DATABASE_URL_APP — start met run-test-rls.sh)', true);

    // ---------------------------------------------------------------- zonder sessie
    const anon = await (G.browser() as unknown as Br).verzoek(HUB, pad('laden'), { service: 'hub' });
    check('zonder sessie → 401/403', anon.status === 401 || anon.status === 403, String(anon.status));
  } finally {
    if (A || B) {
      await pool.query('DELETE FROM app.werkblad_indeling WHERE user_id = ANY($1)', [[A, B].filter(Boolean)]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [A]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [A]).catch(() => undefined);
    }
    G.herstel();
  }
  return einde();
}
