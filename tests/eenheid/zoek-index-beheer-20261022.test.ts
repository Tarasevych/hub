// /zoek — HANDMATIGE INDEXATIE vanuit het technisch profiel (zone D, 22.10.2026). Draaien: node scripts/eenheidstests.mjs zoek-index-beheer-20261022
//   A. zuivere logica (backend/zoek/beheer.ts, src/zoek/zoek-index-api.ts): bronkeuze, stappen per lade, tellers, detail heen-en-terug,
//      voortgang, duur, datum → ms, tolerante lezers.
//   B. de ECHTE routes (handler + sessiecookie): zonder technisch profiel 403; A start een gedeeltelijke run (ui + bord) in het
//      technische tabblad → klaar, index gevuld, auditregel; de wachtrij van B blijft onaangeroerd (isolatie); stand/geschiedenis;
//      het slot bezet (cron «loopt») → aangesloten; «Зупинити» → gestopt + geplande stappen geannuleerd; B ziet A's runs niet.
//   C. structuur: het venster is het gezamenlijke Venster (modaal={false}), de knop alleen bij techActief, hulp-sleutels bestaan,
//      wachtrij pakt alleen eigen items (zoekOphalen `alleen`), CSS zonder hex.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { tabHash } from '../../backend/tech-profiel';
import { bronnenKiezen, detailLezen, detailVan, nieuweRun, nieuweWaterlijn, runWachten, stappenPlannen, telGebeurtenis, weergave, LOCK_NAAM, CRON_NAAM, _beheerIntern } from '../../backend/zoek/beheer';
import { _intern as bronIntern } from '../../backend/zoek/bronnen';
import { zoekMelden, zoekOphalen, zoekStappenAnnuleren, VOLLEDIG_ID } from '../../backend/zoek/wachtrij';
import { fmtDuur, leesIndexStand, leesRun, runSom, runVoortgang, sindsVanDatum } from '../../src/zoek/zoek-index-logica';
import { hulpVan } from '../../shared/hulp-register';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'hub.tarasevych.com';
const lees = (f: string) => readFileSync(f, 'utf8');
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-index-beheer-20261022');
  const stil = console.error; console.error = () => {};
  try {
    // ================================================================ A. zuivere logica
    check('A bronnenKiezen: leeg + volledig = alle Z2-bronnen; leeg + gedeeltelijk = niets; pagina/instelling/hulp → ui; onbekend valt weg; volgorde van INDEX_BRONNEN',
      bronnenKiezen(undefined, 'volledig').join() === 'ui,mail,bijlage,cloud,drive,agenda,bord,github' && bronnenKiezen([], 'gedeeltelijk').length === 0
      && bronnenKiezen(['instelling', 'github', 'evil', 'pagina', 'mail'], 'gedeeltelijk').join() === 'ui,mail,github' && bronnenKiezen(['contact'], 'gedeeltelijk').length === 0);
    const laden = [{ ruimte: 'prive' as const, bronnen: ['ui', 'mail', 'bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github'] as never[] }, { ruimte: 'technisch' as const, bronnen: ['ui', 'bord'] as never[] }];
    const st = stappenPlannen(laden, ['ui', 'bijlage', 'bord', 'github']);
    check('A stappenPlannen: per lade alleen de bronnen die de lade heeft; bijlage → mail met de waterlijn terug; nooit dubbel',
      st.map((x) => `${x.ruimte}:${x.bron}${x.terug ? '!' : ''}`).join() === 'prive:ui,prive:mail!,prive:bord,prive:github,technisch:ui,technisch:bord');
    const st2 = stappenPlannen(laden, ['mail', 'bijlage']);
    check('A stappenPlannen: mail + bijlage samen = één mailstap met terug', st2.map((x) => `${x.ruimte}:${x.bron}${x.terug ? '!' : ''}`).join() === 'prive:mail!');
    const T0 = 1_800_000_000_000, D = 864e5;
    check('A nieuweWaterlijn: volledig → 0; gedeeltelijk zonder datum → 0 (gekozen bronnen volledig); met datum → terug tot de datum, nooit vooruit; nooit gescand (0) blijft 0',
      nieuweWaterlijn(T0, 'volledig', T0 - D) === 0 && nieuweWaterlijn(T0, 'gedeeltelijk', 0) === 0 && nieuweWaterlijn(T0, 'gedeeltelijk', T0 - D) === T0 - D
      && nieuweWaterlijn(T0 - 2 * D, 'gedeeltelijk', T0 - D) === T0 - 2 * D && nieuweWaterlijn(0, 'gedeeltelijk', T0 - D) === 0 && nieuweWaterlijn(T0, 'gedeeltelijk', Number.NaN) === 0);
    const run = nieuweRun('u-a', 'gedeeltelijk', ['ui', 'bord'], laden, 0);
    check('A telGebeurtenis: alleen van DEZE mens; tellers per lade+bron opgeteld',
      telGebeurtenis(run, { lade: { userId: 'u-b', ruimte: 'prive' }, bron: 'ui', toegevoegd: 9, bijgewerkt: 0, overgeslagen: 0, verwijderd: 0, ocr: 0 }) === false && run.tellingen.length === 0
      && telGebeurtenis(run, { lade: { userId: 'u-a', ruimte: 'technisch' }, bron: 'ui', toegevoegd: 3, bijgewerkt: 1, overgeslagen: 2, verwijderd: 0, ocr: 0 }) === true
      && telGebeurtenis(run, { lade: { userId: 'u-a', ruimte: 'technisch' }, bron: 'ui', toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, verwijderd: 4, ocr: 1 }) === true
      && run.tellingen.length === 1 && run.tellingen[0].toegevoegd === 3 && run.tellingen[0].verwijderd === 4 && run.tellingen[0].ocr === 1);
    run.verwerkt = 5; run.klaar = 4; run.status = 'klaar'; run.eind = run.begin + 1234;
    const detail = detailVan(run); const velden = detailLezen(detail);
    check('A detailVan/detailLezen: tellers heen-en-terug, gebruiker-sleutel aanwezig in detail maar niet in de velden, ≤ 500 tekens',
      detail.startsWith('gebruiker=u-a ') && detail.length <= 500 && velden.gebruiker === undefined && velden.modus === 'gedeeltelijk' && velden.bronnen === 'ui,bord' && velden.toegevoegd === '3' && velden.verwijderd === '4' && velden.verwerkt === '5' && velden.status === 'klaar' && velden.duur === '1234');
    const w = weergave(run, { wachtend: 2, bezig: 1 });
    check('A weergave: zonder userId/stop/cronRunId, met duurMs en wachtrij', !('userId' in w) && !('stop' in w) && !('cronRunId' in w) && w.duurMs === 1234 && w.wachtend === 2 && w.bezig === 1);
    check('A runVoortgang: loopt 5 van 8 → 62 (nooit 100 zolang hij loopt); klaar = 100; niets = 0; aangesloten zonder cijfers = 0',
      runVoortgang({ status: 'loopt', verwerkt: 5, wachtend: 2, bezig: 1 }) === 63 && runVoortgang({ status: 'loopt', verwerkt: 99, wachtend: 0, bezig: 0 }) === 99 && runVoortgang({ status: 'klaar', verwerkt: 0, wachtend: 0, bezig: 0 }) === 100 && runVoortgang(null) === 0 && runVoortgang({ status: 'aangesloten', verwerkt: 0, wachtend: 0, bezig: 0 }) === 0);
    check('A fmtDuur uk/nl', fmtDuur(72_000, 'uk') === '1 хв 12 с' && fmtDuur(3_600_000 + 60_000, 'nl') === '1 u 1 min' && fmtDuur(500, 'uk') === '1 с' && fmtDuur(-5, 'nl') === '0 s');
    check('A sindsVanDatum: geldige datum → begin van de lokale dag; onzin → 0', sindsVanDatum('2026-10-01') === new Date(2026, 9, 1).getTime() && sindsVanDatum('vandaag') === 0 && sindsVanDatum('') === 0);
    const r1 = leesRun({ id: 'r1', modus: 'gedeeltelijk', bronnen: ['ui', 'evil'], laden: [{ ruimte: 'technisch', bronnen: ['ui'] }], status: 'loopt', stap: { bron: 'ui', ruimte: 'technisch', actie: 'volledig', id: '', sinds: 1 }, tellingen: [{ bron: 'ui', ruimte: 'technisch', toegevoegd: '3', fouten: 1 }], fouten: [{ bron: 'ui', ruimte: 'x', id: 'a'.repeat(100), code: 'X', op: 1, definitief: true }], wachtend: 2, bezig: 0, verwerkt: 1 });
    check('A leesRun: tolerant (onbekende bron weg, getallen uit tekst, ruimte onbekend → prive, id ≤ 60), som en voortgang', !!r1 && r1.bronnen.join() === 'ui' && r1.status === 'loopt' && r1.stap?.bron === 'ui' && runSom(r1).toegevoegd === 3 && runSom(r1).fouten === 1 && r1.fouten[0].ruimte === 'prive' && r1.fouten[0].id.length === 60 && runVoortgang(r1) === 33);
    check('A leesRun zonder id = null; leesIndexStand tolerant', leesRun({}) === null && leesIndexStand({ run: null, bronnen: [{ bron: 'ui', stand: 'klaar', aantal: 12, ruimte: 'technisch' }, { bron: 'nope' }], laden: [{ ruimte: 'technisch', bronnen: ['ui', 'x'] }], cron: { loopt: true }, wachtrij: { 'technisch:ui': { wachtend: '2' } } }).bronnen.length === 1
      && leesIndexStand({ laden: [{ ruimte: 'technisch', bronnen: ['ui', 'x'] }] }).laden[0].bronnen.join() === 'ui' && leesIndexStand({ cron: { loopt: true } }).cron.loopt === true && leesIndexStand({ wachtrij: { 'technisch:ui': { wachtend: '2' } } }).wachtrij['technisch:ui'].wachtend === 2);

    // ================================================================ B. de echte routes
    const pool = getPool('systeem');
    const idx = await import('../../backend/index');
    const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');
    const sfx = randomBytes(4).toString('hex');
    const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved', name: email }]); return { id, email }; };
    const A = await mk(`zoek-idx-a-${sfx}@eenheid.test`), B = await mk(`zoek-idx-b-${sfx}@eenheid.test`);
    const sessies: string[] = [];
    const sessie = async (uid: string) => {
      const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
      const rec = { tokenHash: sha(token), userId: uid, service: 'hub', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now - 3_600_000, authenticatedAt: now - 3_600_000, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]); sessies.push(id);
      return { cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
    };
    const roep = async (pad: string, s: { cookie: string } | null, body: Record<string, unknown>, tabContext: string) => {
      const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', ...(s ? { cookie: s.cookie } : {}), 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'hub', tabContext, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
      const r = await idx.handler(evt as never); let data: Record<string, unknown> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ } return { status: r.statusCode, data };
    };
    const techAan = async (uid: string, t: string) => {
      await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['beheerder'],60,'test') ON CONFLICT DO NOTHING`, [uid, `tech-${randomBytes(6).toString('hex')}`]);
      const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1 LIMIT 1', [uid])).rows[0].profiel_id);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'eenheidstest zoek-index', now() + interval '60 minutes')`, [uid, pid, tabHash(t)]);
    };
    const sA = await sessie(A.id), sB = await sessie(B.id); const tA = tab(), tT = tab(), tB = tab();
    const P = '/api/owner/zoek/index';
    try {
      check('B zonder sessie: 403', (await roep(`${P}/stand`, null, {}, tA)).status === 403);
      const zonder = await roep(`${P}/starten`, sA, { modus: 'volledig' }, tA);
      check('B zonder technisch profiel in het tabblad: 403 ZOEK_INDEX_TECH_PROFIEL_VEREIST (ook stand/stoppen/geschiedenis)', zonder.status === 403 && String(zonder.data.error || zonder.data.errorCode || JSON.stringify(zonder.data)).includes('ZOEK_INDEX_TECH_PROFIEL_VEREIST')
        && (await roep(`${P}/stand`, sA, {}, tA)).status === 403 && (await roep(`${P}/stoppen`, sA, {}, tA)).status === 403 && (await roep(`${P}/geschiedenis`, sA, {}, tA)).status === 403, JSON.stringify(zonder.data).slice(0, 200));
      await techAan(A.id, tT);
      // B's wachtrij-item vooraf: mag door A's run NOOIT opgepakt worden.
      await zoekMelden((sql, p) => pool.query(sql, p), [{ userId: B.id, ruimte: 'prive', bron: 'bord', bronId: VOLLEDIG_ID, actie: 'volledig' }]);
      const s0 = await roep(`${P}/stand`, sA, {}, tT);
      check('B stand (technisch tabblad): run null, laden bevat technisch met ui, bronnen met stand, limieten uit ENV', s0.status === 200 && s0.data.run === null && (s0.data.laden as Array<{ ruimte: string; bronnen: string[] }>).some((l) => l.ruimte === 'technisch' && l.bronnen.includes('ui')) && (s0.data.bronnen as Array<{ bron: string; ruimte: string }>).some((b) => b.bron === 'ui' && b.ruimte === 'technisch') && Number((s0.data.limieten as { runMs: number }).runMs) > 0, JSON.stringify(s0.data).slice(0, 300));
      const st1 = await roep(`${P}/starten`, sA, { modus: 'gedeeltelijk', bronnen: ['ui', 'bord', 'evil'], ruimte: 'prive', userId: B.id }, tT);
      const run1 = st1.data.run as Record<string, unknown>;
      check('B starten (A, gedeeltelijk ui+bord): ok, run met id/status/bronnen; client kan userId/ruimte niet opdringen', st1.status === 200 && st1.data.ok === true && st1.data.bestond === false && !!run1?.id && (run1.bronnen as string[]).join() === 'ui,bord' && !('userId' in run1), JSON.stringify(st1.data).slice(0, 300));
      const laatste = await runWachten(A.id, 60_000);
      check('B run afgerond: status klaar, ui-stap verwerkt, objecten toegevoegd in de TECHNISCHE lade van A', !!laatste && laatste.status === 'klaar' && laatste.verwerkt >= 1 && laatste.tellingen.some((t) => t.bron === 'ui' && t.ruimte === 'technisch')
        && Number((await pool.query(`SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='technisch' AND bron IN ('ui','pagina','instelling','hulp')`, [A.id])).rows[0].n) > 0, JSON.stringify(laatste ? { status: laatste.status, verwerkt: laatste.verwerkt, fout: laatste.fout, fouten: laatste.fouten.slice(0, 3), tellingen: laatste.tellingen } : null).slice(0, 400));
      check('B isolatie: het wachtrij-item van B staat nog «wachtend» (A\'s run pakte het niet), B heeft geen objecten', (await pool.query(`SELECT status FROM app.zoek_wachtrij WHERE user_id=$1 AND bron='bord' ORDER BY created_at DESC LIMIT 1`, [B.id])).rows[0]?.status === 'wachtend'
        && Number((await pool.query(`SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1`, [B.id])).rows[0].n) === 0);
      const s1 = await roep(`${P}/stand`, sA, {}, tT);
      check('B stand na afloop: laatste run zichtbaar (klaar), duurMs, bronnen', s1.status === 200 && (s1.data.run as Record<string, unknown>)?.status === 'klaar' && Number((s1.data.run as Record<string, unknown>).duurMs) >= 0);
      const g1 = await roep(`${P}/geschiedenis`, sA, {}, tT);
      check('B geschiedenis: eigen runs ≥ 1 en een cron_runs-rij zoek-index@handmatig met tellers (zonder gebruiker-sleutel)', g1.status === 200 && (g1.data.eigen as unknown[]).length >= 1 && (g1.data.runs as Array<{ naam: string; velden: Record<string, string>; detail: string }>).some((r) => r.naam === CRON_NAAM && r.velden.status === 'klaar' && r.velden.gebruiker === undefined && !r.detail.includes(A.id)), JSON.stringify(g1.data).slice(0, 300));
      const au = await pool.query(`SELECT action, details FROM app.audit WHERE owner_id=$1 AND action='zoek.index.starten' ORDER BY created_at DESC LIMIT 1`, [A.id]);
      check('B audit: zoek.index.starten met modus en bronnen, type beheer', au.rows.length === 1 && au.rows[0].details?.modus === 'gedeeltelijk' && Array.isArray(au.rows[0].details?.bronnen));
      // plannen op de echte database: de waterlijn van A/technisch/bord volgens nieuweWaterlijn, met een geplande scanstap
      {
        const ladeT = { userId: A.id, ruimte: 'technisch' as const }; const q = (sql: string, p?: unknown[]) => pool.query(sql, p);
        const nu0 = Date.now(), dag = 864e5, wl = async () => (await bronIntern.z2Stand(ladeT, 'bord')).waterlijn;
        const plan = async (modus: 'volledig' | 'gedeeltelijk', sinds: number) => { const n = await _beheerIntern.plannen(nieuweRun(A.id, modus, ['bord'], [{ ruimte: 'technisch', bronnen: ['bord'] }], sinds)); await zoekStappenAnnuleren(q, ladeT, 'TEST'); return n; };
        await bronIntern.z2StandZetten(ladeT, 'bord', { waterlijn: nu0, waterlijnId: 'x' });
        const n1 = await plan('gedeeltelijk', nu0 - dag); const w1 = await wl();
        await bronIntern.z2StandZetten(ladeT, 'bord', { waterlijn: nu0 - 3 * dag, waterlijnId: 'x' });
        await plan('gedeeltelijk', nu0 - dag); const w2 = await wl();
        await bronIntern.z2StandZetten(ladeT, 'bord', { waterlijn: 0, waterlijnId: '' });
        await plan('gedeeltelijk', nu0 - dag); const w3 = await wl();
        await bronIntern.z2StandZetten(ladeT, 'bord', { waterlijn: nu0, waterlijnId: 'x' });
        await plan('gedeeltelijk', 0); const w4 = await wl();
        await bronIntern.z2StandZetten(ladeT, 'bord', { waterlijn: nu0, waterlijnId: 'x' });
        await plan('volledig', nu0 - dag); const w5 = await wl(); const z5 = await bronIntern.z2Stand(ladeT, 'bord');
        check('B plannen (echte DB): met datum terug tot de datum; ouder blijft ouder; nooit gescand blijft 0; zonder datum en volledig → 0; volledigOp 0, scanstap gepland',
          n1 === 1 && Math.abs(w1 - (nu0 - dag)) < 2 && Math.abs(w2 - (nu0 - 3 * dag)) < 2 && w3 === 0 && w4 === 0 && w5 === 0 && z5.volledigOp === 0 && z5.waterlijnId === '', JSON.stringify({ n1, w1: w1 - nu0, w2: w2 - nu0, w3, w4, w5, v: z5.volledigOp }));
      }
      // slot bezet (alsof de cron loopt) → aangesloten; dan stoppen → gestopt + geplande stappen geannuleerd
      const slot = await pool.connect();
      try {
        check('B slot nemen (cron:zoek-index)', (await slot.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAAM])).rowCount !== null);
        const st2 = await roep(`${P}/starten`, sA, { modus: 'gedeeltelijk', bronnen: ['ui'] }, tT);
        let s2: Record<string, unknown> = {};
        for (let i = 0; i < 30; i++) { await slaap(150); s2 = (await roep(`${P}/stand`, sA, {}, tT)).data; if ((s2.run as Record<string, unknown>)?.status === 'aangesloten') break; }
        check('B slot bezet: de run sluit aan (status aangesloten), verwerkt niets zelf, wachtend ≥ 1', st2.data.ok === true && (s2.run as Record<string, unknown>)?.status === 'aangesloten' && Number((s2.run as Record<string, unknown>).verwerkt) === 0 && Number((s2.run as Record<string, unknown>).wachtend) >= 1, JSON.stringify(s2.run).slice(0, 300));
        const stop = await roep(`${P}/stoppen`, sA, {}, tT);
        const na = await runWachten(A.id, 10_000);
        check('B stoppen: geplande stap geannuleerd (≥1), run gestopt, auditregel zoek.index.stoppen', stop.status === 200 && Number(stop.data.geannuleerd) >= 1 && na?.status === 'gestopt'
          && (await pool.query(`SELECT 1 FROM app.zoek_wachtrij WHERE user_id=$1 AND ruimte='technisch' AND bron='ui' AND status='geannuleerd' AND last_error='HANDMATIG_GESTOPT'`, [A.id])).rows.length >= 1
          && (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action='zoek.index.stoppen'`, [A.id])).rows.length >= 1, JSON.stringify({ stop: stop.data, na: na?.status }).slice(0, 300));
        check('B isolatie bij stoppen: het item van B staat nog «wachtend»', (await pool.query(`SELECT status FROM app.zoek_wachtrij WHERE user_id=$1 AND bron='bord' ORDER BY created_at DESC LIMIT 1`, [B.id])).rows[0]?.status === 'wachtend');
      } finally { await slot.query('SELECT pg_advisory_unlock_all()').catch(() => undefined); slot.release(); }
      // B met technisch profiel: ziet A's runs niet
      await techAan(B.id, tB);
      const gB = await roep(`${P}/geschiedenis`, sB, {}, tB);
      check('B andere mens (B, technisch): eigen runs leeg, geen handmatige rij van A in de lijst', gB.status === 200 && (gB.data.eigen as unknown[]).length === 0 && !(gB.data.runs as Array<{ naam: string }>).some((r) => r.naam === CRON_NAAM), JSON.stringify(gB.data).slice(0, 200));
      const stB = await roep(`${P}/stoppen`, sB, {}, tB);
      check('B stoppen door B raakt A niet (geen run → geannuleerd 0)', stB.status === 200 && Number(stB.data.geannuleerd) === 0);
      // zoekOphalen met `alleen`: pakt uitsluitend items van die mens/ruimtes
      const q = (sql: string, p?: unknown[]) => pool.query(sql, p);
      await zoekMelden(q, [{ userId: A.id, ruimte: 'prive', bron: 'bord', bronId: 'x1', actie: 'bijwerken' }]);
      const eigen = await zoekOphalen(q, 10, { userId: A.id, ruimtes: ['technisch'] });
      check('B zoekOphalen(alleen): A/technisch pakt niet A/prive en niet B', eigen.every((i) => i.userId === A.id && i.ruimte === 'technisch'));
      const eigen2 = await zoekOphalen(q, 10, { userId: A.id, ruimtes: ['prive'] });
      check('B zoekOphalen(alleen): A/prive pakt alleen het eigen prive-item', eigen2.length >= 1 && eigen2.every((i) => i.userId === A.id && i.ruimte === 'prive'));
    } finally {
      await pool.query(`DELETE FROM app.zoek_wachtrij WHERE user_id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
      await pool.query(`DELETE FROM app.zoek_objecten WHERE user_id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
      await pool.query(`DELETE FROM app.zoek_bron_stand WHERE user_id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
      await pool.query(`DELETE FROM app.cron_runs WHERE name=$1 AND detail LIKE $2`, [CRON_NAAM, `gebruiker=${A.id} %`]).catch(() => undefined);
      await pool.query(`DELETE FROM app.tech_activaties WHERE user_id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
      await pool.query(`DELETE FROM app.tech_profielen WHERE user_id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
      for (const id of sessies) await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1`, [id]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
    }

    // ================================================================ C. structuur
    const venster = lees('src/zoek/ZoekIndexVenster.tsx'), pagina = lees('src/zoek/ZoekPagina.tsx');
    check('C het venster is het gezamenlijke Venster (src/platform/vensters.tsx) met modaal={false}: slepen, dok, maximaliseren, sluiten, bewaarde positie', venster.includes("from '../platform/vensters'") && venster.includes('modaal={false}') && venster.includes("INDEX_VENSTER_ID = 'zoek-index'") && !venster.includes('position:fixed'));
    check('C de knop «Індексація…» en het venster alleen bij techActief; strook technische ruimte (D3) alleen bij techActief', pagina.includes("{techAan && <button") && pagina.includes('data-zoek-index-knop') && pagina.includes('{techAan && indexOpen && <Suspense') && pagina.includes('data-zoek-tech-strook'));
    check('C opties van het venster: data-hulp + <HulpVraag/> + register (zoek.index.modus/bron/sinds)', ['zoek.index.modus', 'zoek.index.bron', 'zoek.index.sinds'].every((k) => !!hulpVan(k) && venster.includes(`data-hulp='${k}'`) && venster.includes(`<HulpVraag k='${k}'`)));
    check('C polling (geen SSE-infrastructuur voor pagina\'s): snel bij een lopende run, rustig daarna; afgeronde run → stand van de bronnen opnieuw', venster.includes('POLL_ACTIEF = 1500') && venster.includes('POLL_RUST = 10_000') && venster.includes('onKlaar?.()'));
    check('C geminimaliseerd: de titel draagt de voortgang (het dok toont «Індексація пошуку — N%»); statussen en soorten runs in uk/nl, geen ruwe codes ok/running/skipped', venster.includes('titel={actief ? `${t.titel} — ${pct}%` : t.titel}') && venster.includes("running: 'виконується'") && venster.includes("running: 'loopt'") && venster.includes("{t.cronStatus[r.status] || r.status}") && !venster.includes('>{r.status}<'));
    // Het indexvenster is technisch: zijn «?»-uitleg (zoek.index.*) mag NIET in de persoonlijke lade van de UI-catalogus komen (anders
    // vindt een gewone gebruiker hem in /zoek), wel in de technische. Bron → plek via UI_PLEKKEN (scripts/zoek-ui-catalogus.mjs).
    const { uiPlekVan } = await import('../../shared/zoek-ui-knoppen.generated');
    const { uiZoekObjecten } = await import('../../backend/zoek/catalogus-ui');
    const priveIds = new Set(uiZoekObjecten({ userId: 'u1', ruimte: 'prive' }, { heeftProfiel: true }).map((o) => o.id)), techIds = new Set(uiZoekObjecten({ userId: 'u1', ruimte: 'technisch' }).map((o) => o.id));
    check('C UI-catalogus: ZoekIndexVenster = technisch; hulp:zoek.index.* alleen in de technische lade (niet in de persoonlijke, ook niet met profiel)', uiPlekVan('src/zoek/ZoekIndexVenster.tsx')?.toegang === 'technisch' && uiPlekVan('src/zoek/ZoekPagina.tsx')?.toegang === 'iedereen'
      && ['zoek.index.modus', 'zoek.index.bron', 'zoek.index.sinds'].every((k) => techIds.has(`hulp:${k}`) && !priveIds.has(`hulp:${k}`)), JSON.stringify({ plek: uiPlekVan('src/zoek/ZoekIndexVenster.tsx'), prive: [...priveIds].filter((x) => x.startsWith('hulp:zoek.index')) }));
    check('C technische bundel: het venster en zijn API dragen // @tech-asset (assets/tech/), het laden heeft een vangnet', ['src/zoek/ZoekIndexVenster.tsx', 'src/zoek/zoek-index-api.ts', 'src/zoek/zoek-index-logica.ts'].every((f) => lees(f).startsWith('// @tech-asset')) && pagina.includes(".catch(() => ({ default: IndexVensterNietGeladen }))"));
    check('C pagina: meer dan twee gesloten diensten → één uitklapbaar blok met de namen (zelfde vlakken erin)', pagina.includes('gesloten.length > 2') && pagina.includes("className='zk-gesloten zk-gesloten-groep kaart-zacht'") && pagina.includes('<RuimteGeslotenVlak'));
    check('C «за джерелами» + lijst/raster + «Останні пошуки» met relatieve tijd op de pagina', pagina.includes('groepeerPerCategorie(') && pagina.includes("data-zoek-ordening={wk.ordening}") && pagina.includes("aria-pressed={wk.weergave === 'raster'}") && pagina.includes('relatiefTijd(g.laatstOp, lang)'));
    const beheer = lees('backend/zoek/beheer.ts');
    check('C server: advisory lock van de cron, alleen eigen items, tech-activering vereist, audit', beheer.includes("LOCK_NAAM = 'cron:zoek-index'") && beheer.includes('zoekOphalen(sys, Math.min(5, run.limiet - run.verwerkt), { userId: run.userId, ruimtes })') && beheer.includes('actieveActivatie(auth.user.id') && beheer.includes("'zoek.index.starten'") && beheer.includes("'zoek.index.stoppen'"));
    const css = lees('src/zoek/zoek.css').replace(/\/\*[\s\S]*?\*\//g, '');
    check('C zoek.css: geen hex, geen prefers-color-scheme (zone D-blokken erbij)', !/#[0-9a-f]{3,8}\b/i.test(css) && !css.includes('prefers-color-scheme') && css.includes('.zk-iv-inhoud') && css.includes('.zk-lijst.is-raster'));
  } finally { console.error = stil; }
  return einde();
}
