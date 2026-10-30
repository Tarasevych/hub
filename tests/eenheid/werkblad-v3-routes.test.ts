// WERKBLAD v3 (0114): /api/owner/hub/werkblad/v3/{laden,bewaren,terugdraaien} op de ECHTE router met twee mensen (A eigenaar,
// B gewoon account) op de levende PostgreSQL.
//   1. vlag uit (standaard): laden → {aan:false}, bewaren → 403, er wordt NIETS overgezet; v2 werkt precies als voorheen;
//   2. vlag aan voor A: eenmalige overzetting v2 → v3 (computer/tablet/telefoon), v2-rij ongewijzigd, backup aanwezig; idempotent;
//   3. bewaren: normalisatie op de server, versie per laag, 409 + actuele laag, andere laag botst niet; grenzen → 413/400;
//   4. lade-scheiding: B ziet niets van A; userId in het verzoek genegeerd; technische lade los van de persoonlijke;
//   5. vlag weer uit → v3-gegevens blijven; terugdraaien werkt met vlag uit (v2-backup terug, versie +1), v3Wissen wist alleen v3;
//   6. RLS met twee gebruikers (app-rol): B ziet 0 rijen van A in alle drie de tabellen en kan niets wijzigen; CHECK/FK-vangnetten.
import { randomBytes } from 'node:crypto';
import { getPool, appRolActief } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';

const HUB = 'hub.tarasevych.com';
type Antw = { status: number; data: Record<string, any>; body: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Br = { verzoek: (host: string, pad: string, body?: unknown, extra?: Record<string, unknown>) => Promise<Antw>; aanmelden: (sub: string, email: string, o?: Record<string, unknown>) => Promise<unknown>; tab: string; ctxBody: (s?: string, e?: Record<string, unknown>) => Record<string, unknown> };
const ids = (l: { items: Array<{ instanceId: string }> }) => l.items.map((i) => i.instanceId).join(',');

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-v3-routes');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const pool = getPool('systeem');
  const eigenaar = `wb3-a-${T}@example.test`, subA = `sub-wb3-a-${T}`, emailB = `wb3-b-${T}@example.test`, subB = `sub-wb3-b-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  let A = '', B = '';
  const via = (b: Br, pad: string, body: Record<string, unknown> = {}) => b.verzoek(HUB, `/api/owner/hub/werkblad/${pad}`, b.ctxBody('hub', body));
  const vlag = async (gebruikers: string[]) => pool.query(`UPDATE app.feature_flags SET aan = $2, gebruikers = $1 WHERE sleutel = 'werkblad-v3'`, [gebruikers, gebruikers.length > 0]);
  const tel = async (tabel: string, u: string) => Number((await pool.query(`SELECT count(*)::int AS n FROM app.${tabel} WHERE user_id = $1`, [u])).rows[0].n);
  const vlagVoor = (await pool.query(`SELECT aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = 'werkblad-v3'`)).rows[0];
  try {
    check('0114: vlag werkblad-v3 bestaat en staat standaard UIT', !!vlagVoor && vlagVoor.aan === false && vlagVoor.standaard === false);
    const P = G.browser() as unknown as Br; await P.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    A = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const Bb = G.browser() as unknown as Br; await Bb.aanmelden(subB, emailB, { service: 'hub' });
    B = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [emailB])).rows[0]?.id || '');
    await pool.query(`update app.records set data = data || '{"status":"approved"}'::jsonb where tbl='users' and id = ANY($1)`, [[A, B]]);
    check('підготовка: twee accounts', !!A && !!B && A !== B);
    const v2 = { v: 2, achtergrond: 'zee', items: [{ tid: 'w1', id: 'begroeting', k: 12, r: 1 }, { tid: 'w2', id: 'post', k: 6, r: 3, inst: { weergave: 'tellers' } }, { tid: 'w3', id: 'agenda', k: 6, r: 2 }] };
    const b2 = await via(P, 'bewaren', { indeling: v2, versie: 0 });
    check('v2 bewaren A (zoals voorheen): 200, versie 1', b2.status === 200 && b2.data.versie === 1);

    // ---------------------------------------------------------------- 1. vlag uit
    await vlag([]);
    const l0 = await via(P, 'v3/laden');
    check('vlag uit: v3/laden → 200 {aan:false}, geen lagen', l0.status === 200 && l0.data.aan === false && !('layouts' in l0.data), l0.body.slice(0, 150));
    const s0 = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { items: [] }, versie: 0 });
    check('vlag uit: v3/bewaren → 403 WERKBLAD_V3_UIT', s0.status === 403 && /WERKBLAD_V3_UIT/.test(s0.body), `${s0.status} ${s0.body.slice(0, 100)}`);
    check('vlag uit: er is niets overgezet (0 rijen in lade/layout/items)', (await tel('werkblad_v3_lade', A)) === 0 && (await tel('werkblad_layout', A)) === 0);
    const v2l = await via(P, 'laden');
    check('vlag uit: v2/laden precies zoals voorheen (3 widgets, versie 1, source 0112)', v2l.status === 200 && v2l.data.source === 'server_werkblad_0112' && v2l.data.indeling.items.length === 3 && v2l.data.versie === 1);

    // ---------------------------------------------------------------- 2. vlag aan voor A → eenmalige overzetting
    await vlag([A]);
    const lB0 = await via(Bb, 'v3/laden');
    check('vlag aan alleen voor A: B krijgt nog {aan:false}', lB0.status === 200 && lB0.data.aan === false);
    const l1 = await via(P, 'v3/laden');
    const pc = l1.data.layouts?.computer, tb = l1.data.layouts?.tablet, tf = l1.data.layouts?.telefoon;
    check('vlag aan: eerste laden zet v2 → v3 over (netOvergezet, herkomst v2, backup, achtergrond zee)', l1.status === 200 && l1.data.aan === true && l1.data.netOvergezet === true && l1.data.herkomst === 'v2' && l1.data.heeftV2Backup === true && l1.data.achtergrond === 'zee', l1.body.slice(0, 300));
    check('drie lagen, elk versie 1; computer = w1,w2,w3 in px', !!pc && !!tb && !!tf && pc.versie === 1 && tb.versie === 1 && tf.versie === 1 && ids(pc.layout) === 'w1,w2,w3' && pc.layout.items[1].h === 312 && pc.layout.items[1].config?.weergave === 'tellers');
    check('telefoon: flow, eigen laag', tf.layout.mode === 'flow' && tf.layout.canvasWidth === 390);
    const v2na = await via(P, 'laden');
    check('v2-rij NIET gewijzigd door de overzetting (versie 1, 3 widgets)', v2na.data.versie === 1 && v2na.data.indeling.items.length === 3);
    const back = (await pool.query(`SELECT v2_backup, v2_versie FROM app.werkblad_v3_lade WHERE user_id=$1 AND ruimte='prive'`, [A])).rows[0];
    check('database: v2_backup = v2-indeling, v2_versie = 1', back?.v2_backup?.items?.length === 3 && back.v2_versie === 1);
    const l2 = await via(P, 'v3/laden', { apparaat: 'computer' });
    check('idempotent: tweede laden zet niet opnieuw over (netOvergezet false), alleen gevraagde laag', l2.data.netOvergezet === false && Object.keys(l2.data.layouts).join(',') === 'computer' && l2.data.layouts.computer.versie === 1);
    check('database: één lade, drie lagen, 9 items (3 per laag)', (await tel('werkblad_v3_lade', A)) === 1 && (await tel('werkblad_layout', A)) === 3 && (await tel('werkblad_items', A)) === 9);

    // ---------------------------------------------------------------- 3. bewaren, normalisatie, 409
    const nieuw = { mode: 'free', canvasWidth: 1280, canvasHeight: 900, hack: true, items: [
      { instanceId: 'w1', itemId: 'wdg:begroeting', kind: 'widget', x: 333.4, y: 211.6, w: 517, h: 143, z: 9, geheim: 'x' },
      { instanceId: 's1', itemId: 'svc:mail', kind: 'shortcut', x: 40, y: 40, w: 88, h: 88, z: 3, titleOverride: 'Пошта <b>', iconOverride: 'lucide:mail' },
      { instanceId: 't1', itemId: 'wdg:tech-server', kind: 'widget', x: 0, y: 0, w: 300, h: 200, z: 1 },
      { instanceId: 'u1', itemId: 'https://kwaad.test', kind: 'shortcut', x: 0, y: 0, w: 80, h: 80, z: 2 },
    ] };
    const s1 = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: nieuw, versie: 1, achtergrond: 'woud' });
    const L1 = s1.data.laag?.layout;
    check('bewaren: 200, versie 2, exacte x/y/w/h (afgerond), geen auto-compactie', s1.status === 200 && s1.data.laag.versie === 2 && L1.items.find((i: any) => i.instanceId === 'w1')?.x === 333 && L1.items.find((i: any) => i.instanceId === 'w1')?.y === 212 && L1.items.find((i: any) => i.instanceId === 'w1')?.w === 517, s1.body.slice(0, 300)); // eslint-disable-line @typescript-eslint/no-explicit-any
    check('server normaliseert: tech-widget in privé en vrije URL vallen weg, onbekende velden weg, titel geschoond', ids(L1) === 's1,w1' && !s1.body.includes('geheim') && !s1.body.includes('hack') && L1.items[0].titleOverride === 'Пошта b', ids(L1));
    check('z uniek 1..n, achtergrond bewaard', L1.items.map((i: any) => i.z).join(',') === '1,2' && s1.data.achtergrond === 'woud'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const r1 = await via(P, 'v3/laden', { apparaat: 'computer' });
    check('refresh: zelfde coördinaten terug (333,212,517,143)', (() => { const w = r1.data.layouts.computer.layout.items.find((i: any) => i.instanceId === 'w1'); return w.x === 333 && w.y === 212 && w.w === 517 && w.h === 143; })()); // eslint-disable-line @typescript-eslint/no-explicit-any
    const oud = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { items: [] }, versie: 1 });
    check('409 WERKBLAD_V3_VEROUDERD bij oude versie + actuele laag van de server (niets overschreven)', oud.status === 409 && oud.data.code === 'WERKBLAD_V3_VEROUDERD' && oud.data.apparaat === 'computer' && oud.data.laag.versie === 2 && ids(oud.data.laag.layout) === 's1,w1', `${oud.status} ${oud.body.slice(0, 200)}`);
    const nul = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { items: [] }, versie: 0 });
    check('409 ook bij versie 0 als de laag al bestaat (geen blinde overschrijving)', nul.status === 409);
    const ander = await via(P, 'v3/bewaren', { apparaat: 'telefoon', layout: { mode: 'flow', items: [{ instanceId: 'p1', itemId: 'svc:mail', kind: 'shortcut', x: 0, y: 0, w: 72, h: 72, z: 1 }] }, versie: 1 });
    check('andere laag (telefoon, versie 1) botst niet met computer (v2) → 200, versie 2; computer blijft', ander.status === 200 && ander.data.laag.versie === 2 && (await via(P, 'v3/laden', { apparaat: 'computer' })).data.layouts.computer.laag === undefined);
    const comp = (await via(P, 'v3/laden', { apparaat: 'computer' })).data.layouts.computer;
    check('computer na telefoon-bewaring ongewijzigd (versie 2, s1,w1)', comp.versie === 2 && ids(comp.layout) === 's1,w1');
    const ongeldig = await via(P, 'v3/bewaren', { apparaat: 'kast', layout: { items: [] }, versie: 0 });
    check('onbekend apparaat → 400 WERKBLAD_V3_APPARAAT_ONGELDIG', ongeldig.status === 400 && /APPARAAT_ONGELDIG/.test(ongeldig.body));
    const geenL = await via(P, 'v3/bewaren', { apparaat: 'tablet', layout: 'x', versie: 1 });
    check('layout geen object → 400 WERKBLAD_V3_LAYOUT_ONGELDIG', geenL.status === 400 && /LAYOUT_ONGELDIG/.test(geenL.body));
    const veel = await via(P, 'v3/bewaren', { apparaat: 'tablet', layout: { items: Array.from({ length: 401 }, (_, i) => ({ instanceId: `n${i}`, itemId: 'svc:mail', kind: 'shortcut' })) }, versie: 1 });
    check('> 400 objecten → 413 WERKBLAD_V3_TE_VEEL_ITEMS (geen stille afkapping)', veel.status === 413 && /TE_VEEL_ITEMS/.test(veel.body), `${veel.status}`);
    const groot = await via(P, 'v3/bewaren', { apparaat: 'tablet', layout: { items: [{ instanceId: 'a', itemId: 'svc:mail', kind: 'shortcut', config: { t: 'x'.repeat(410_000) } }] }, versie: 1 });
    check('> 400 000 bytes → 413 WERKBLAD_V3_TE_GROOT', groot.status === 413 && /TE_GROOT/.test(groot.body));
    const vol = await via(P, 'v3/bewaren', { apparaat: 'tablet', layout: { canvasWidth: 768, items: Array.from({ length: 400 }, (_, i) => ({ instanceId: `n${i}`, itemId: 'svc:mail', kind: 'shortcut', x: (i % 9) * 80, y: Math.floor(i / 9) * 80, w: 72, h: 72, z: i + 1, config: { a: 'b' } })) }, versie: 1 });
    check('400 objecten (grote bibliotheek, boven de oude 24/32 KiB) → bewaard', vol.status === 200 && vol.data.laag.layout.items.length === 400 && vol.data.laag.versie === 2, `${vol.status} ${vol.body.slice(0, 120)}`);
    // Integratie (etappe D): het register is de servervalidatie — map:-instanties, usr: met basis, mapinhoud (parent), onbekend/technisch weg.
    const reg = await via(P, 'v3/bewaren', { apparaat: 'tablet', versie: 2, layout: { canvasWidth: 768, items: [
      { instanceId: 'm1', itemId: 'map:m1', kind: 'folder', x: 10, y: 10, w: 96, h: 104, z: 1, titleOverride: 'Пошта' },
      { instanceId: 'k1', itemId: 'pg:mail/inbox', kind: 'shortcut', x: 10, y: 10, w: 96, h: 104, z: 2, parent: 'm1' },
      { instanceId: 'u1', itemId: 'usr:k1', kind: 'shortcut', x: 200, y: 10, w: 96, h: 104, z: 3, titleOverride: 'Мій лист', config: { basis: 'cmd:bericht-schrijven', titel: 'Мій лист' } },
      { instanceId: 'u2', itemId: 'usr:k2', kind: 'shortcut', x: 300, y: 10, w: 96, h: 104, z: 4, config: { basis: 'https://evil.example' } },
      { instanceId: 'x1', itemId: 'pg:mail/bestaat-niet', kind: 'shortcut', x: 400, y: 10, w: 96, h: 104, z: 5 },
      { instanceId: 'x2', itemId: 'pg:admin/audit', kind: 'shortcut', x: 500, y: 10, w: 96, h: 104, z: 6 },
      { instanceId: 'x3', itemId: 'wdg:tech-server', kind: 'widget', x: 10, y: 300, w: 300, h: 200, z: 7 },
      { instanceId: 'x4', itemId: 'svc:mail', kind: 'widget', x: 10, y: 600, w: 300, h: 200, z: 8 },
      { instanceId: 'g1', itemId: 'wdg:post', kind: 'widget', x: 10, y: 600, w: 5000, h: 10, z: 9 },
    ] } });
    const RL = reg.data.laag?.layout; const RI = (id: string) => RL?.items.find((i: any) => i.instanceId === id); // eslint-disable-line @typescript-eslint/no-explicit-any
    check('register op de server: map:m1 + inhoud (parent) + usr: met basis bewaard; vrije URL-basis, onbekende pagina, technische pagina/widget in privé en verkeerde soort weg', reg.status === 200 && ids(RL) === 'm1,k1,u1,g1' && RI('k1')?.parent === 'm1' && RI('u1')?.config?.basis === 'cmd:bericht-schrijven' && RI('u1')?.titleOverride === 'Мій лист', `${reg.status} ${RL ? ids(RL) : reg.body.slice(0, 200)}`);
    check('registergrenzen op de server: widget w/h geklemd op min/max van het register (geen 96-px-stap)', RI('g1')?.w <= 1600 && RI('g1')?.h >= 96, JSON.stringify(RI('g1')));
    const regL = await via(P, 'v3/laden', { apparaat: 'tablet' });
    check('na laden: map, mapinhoud en persoonlijke snelkoppeling blijven (persistentie)', ids(regL.data.layouts.tablet.layout) === 'm1,k1,u1,g1' && regL.data.layouts.tablet.layout.items.find((i: any) => i.instanceId === 'k1')?.parent === 'm1'); // eslint-disable-line @typescript-eslint/no-explicit-any

    // ---------------------------------------------------------------- 4. lade-scheiding
    await vlag([A, B]);
    const lB = await via(Bb, 'v3/laden', { userId: A, ownerUserId: A, ruimte: 'technisch' });
    check('АТАКА: B met userId van A → eigen (lege, standaard) lade; niets van A', lB.status === 200 && lB.data.aan === true && lB.data.herkomst === 'standaard' && lB.data.ruimte === 'prive' && lB.data.layouts.computer.layout.items.length === 0 && !lB.body.includes('s1'));
    const sB = await via(Bb, 'v3/bewaren', { apparaat: 'computer', layout: { items: [{ instanceId: 'b1', itemId: 'svc:calendar', kind: 'shortcut' }] }, versie: 1, userId: A });
    check('B bewaart in eigen lade; laag van A onaangeroerd', sB.status === 200 && ids((await via(P, 'v3/laden', { apparaat: 'computer' })).data.layouts.computer.layout) === 's1,w1');
    const Tb = G.browser() as unknown as Br; await Tb.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const { tabHash } = await import('../../backend/tech-profiel');
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['eigenaar'],'werkblad-v3-test', now() + interval '60 minutes')`, [A, pid, tabHash(Tb.tab)]);
    const lT = await via(Tb, 'v3/laden', { apparaat: 'computer' });
    check('technische lade: eigen v3-lade (standaard, leeg), los van privé', lT.status === 200 && lT.data.ruimte === 'technisch' && lT.data.herkomst === 'standaard' && lT.data.layouts.computer.layout.items.length === 0, lT.body.slice(0, 200));
    const sT = await via(Tb, 'v3/bewaren', { apparaat: 'computer', layout: { items: [{ instanceId: 't1', itemId: 'wdg:tech-server', kind: 'widget', w: 300, h: 200 }] }, versie: 1 });
    check('technische lade: technische widget wordt bewaard; privé blijft s1,w1', sT.status === 200 && ids(sT.data.laag.layout) === 't1' && ids((await via(P, 'v3/laden', { apparaat: 'computer' })).data.layouts.computer.layout) === 's1,w1');
    const ruimtes = (await pool.query(`SELECT ruimte FROM app.werkblad_v3_lade WHERE user_id=$1 ORDER BY ruimte`, [A])).rows.map((r) => r.ruimte).join(',');
    check('database: A heeft prive + technisch als aparte laden', ruimtes === 'prive,technisch');

    // ---------------------------------------------------------------- 5. vlag weer uit, terugdraaien
    await vlag([]);
    const uitL = await via(P, 'v3/laden');
    check('vlag weer uit: {aan:false}, maar v3-gegevens blijven in de database', uitL.data.aan === false && (await tel('werkblad_items', A)) > 0);
    await via(P, 'bewaren', { indeling: { v: 2, items: [{ id: 'taken' }] }, versie: 1 });
    const td = await via(P, 'v3/terugdraaien');
    check('terugdraaien werkt met vlag uit: v2-backup terug, v2-versie +1 (3), v3 blijft', td.status === 200 && td.data.hersteld === true && td.data.v2Versie === 3 && td.data.v3Gewist === false, td.body.slice(0, 200));
    const v2t = await via(P, 'laden');
    check('v2 na terugdraaien = de oorspronkelijke 3 widgets (achtergrond zee)', v2t.data.indeling.items.map((t: { id: string }) => t.id).join(',') === 'begroeting,post,agenda' && v2t.data.indeling.achtergrond === 'zee');
    await vlag([A]);
    const weer = await via(P, 'v3/laden', { apparaat: 'computer' });
    check('vlag weer aan: v3 precies zoals achtergelaten (s1,w1, versie 2), geen nieuwe overzetting', weer.data.netOvergezet === false && ids(weer.data.layouts.computer.layout) === 's1,w1' && weer.data.layouts.computer.versie === 2);
    const tdW = await via(P, 'v3/terugdraaien', { v3Wissen: true });
    check('terugdraaien met v3Wissen: privé v3-lade weg (cascade), technische lade blijft', tdW.data.v3Gewist === true && (await pool.query(`SELECT ruimte FROM app.werkblad_v3_lade WHERE user_id=$1`, [A])).rows.map((r) => r.ruimte).join(',') === 'technisch' && Number((await pool.query(`SELECT count(*)::int n FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive'`, [A])).rows[0].n) === 0);
    const her = await via(P, 'v3/laden', { apparaat: 'computer' });
    check('na v3Wissen: opnieuw (eenmalig) overgezet uit v2', her.data.netOvergezet === true && ids(her.data.layouts.computer.layout) === 'w1,w2,w3');
    const tdB = await via(Bb, 'v3/terugdraaien');
    check('B zonder v2: terugdraaien → hersteld:false, niets van A geraakt', tdB.status === 200 && tdB.data.hersteld === false && (await tel('werkblad_indeling', B)) === 0);

    // ---------------------------------------------------------------- 6. RLS + vangnetten
    if (appRolActief()) {
      const { alsGebruiker } = await import('../../backend/ai-toestemmingen');
      for (const t of ['werkblad_v3_lade', 'werkblad_layout', 'werkblad_items']) {
        const nB = await alsGebruiker(B, async (q) => Number((await q(`SELECT count(*)::int AS n FROM app.${t} WHERE user_id = $1`, [A])).rows[0].n));
        const nA = await alsGebruiker(A, async (q) => Number((await q(`SELECT count(*)::int AS n FROM app.${t} WHERE user_id = $1`, [A])).rows[0].n));
        check(`RLS ${t}: B ziet 0 rijen van A, A ziet de eigen`, nB === 0 && nA > 0, `${nB}/${nA}`);
      }
      const upd = await alsGebruiker(B, async (q) => Number((await q(`UPDATE app.werkblad_items SET x = 1 WHERE user_id = $1`, [A])).rowCount || 0)).catch(() => -1);
      const del = await alsGebruiker(B, async (q) => Number((await q(`DELETE FROM app.werkblad_v3_lade WHERE user_id = $1`, [A])).rowCount || 0)).catch(() => -1);
      check('RLS: B kan items/laden van A niet wijzigen of wissen (0 rijen)', upd === 0 && del === 0, `${upd}/${del}`);
      const lidA = String((await pool.query(`SELECT id FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive' AND apparaat='computer'`, [A])).rows[0].id);
      let geweigerd = false;
      try { await alsGebruiker(B, async (q) => q(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z) VALUES ($1,$2,'prive','computer','inbraak','shortcut','svc:mail',0,0,50,50,99)`, [lidA, A])); } catch { geweigerd = true; }
      check('RLS: B kan geen item op de laag van A zetten (WITH CHECK)', geweigerd);
    } else check('RLS: overgeslagen (geen DATABASE_URL_APP)', true);
    const lid = String((await pool.query(`SELECT id FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive' AND apparaat='computer'`, [A])).rows[0].id);
    const faalt = async (sql: string, p: unknown[]) => { try { await pool.query(sql, p); return false; } catch { return true; } };
    check('vangnet FK: item met ruimte technisch op een privé-laag → geweigerd', await faalt(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z) VALUES ($1,$2,'technisch','computer','x1','shortcut','svc:mail',0,0,50,50,98)`, [lid, A]));
    check('vangnet CHECK: widget zonder wdg:, URL als item_id, w te klein, <> in titel → geweigerd',
      await faalt(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z) VALUES ($1,$2,'prive','computer','x2','widget','svc:mail',0,0,50,50,97)`, [lid, A])
      && await faalt(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z) VALUES ($1,$2,'prive','computer','x3','shortcut','svc:https://x',0,0,50,50,96)`, [lid, A])
      && await faalt(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z) VALUES ($1,$2,'prive','computer','x4','shortcut','svc:mail',0,0,5,50,95)`, [lid, A])
      && await faalt(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z,title_override) VALUES ($1,$2,'prive','computer','x5','shortcut','svc:mail',0,0,50,50,94,'<img>')`, [lid, A]));
    check('vangnet UNIQUE: dubbele z op één laag → geweigerd', await faalt(`INSERT INTO app.werkblad_items (layout_id,user_id,ruimte,apparaat,instance_id,kind,item_id,x,y,w,h,z) VALUES ($1,$2,'prive','computer','x6','shortcut','svc:mail',0,0,50,50,1)`, [lid, A]));

    const anon = await (G.browser() as unknown as Br).verzoek(HUB, '/api/owner/hub/werkblad/v3/laden', { service: 'hub' });
    check('zonder sessie → 401/403', anon.status === 401 || anon.status === 403, String(anon.status));
  } finally {
    const u = [A, B].filter(Boolean);
    if (u.length) {
      await pool.query('DELETE FROM app.werkblad_v3_lade WHERE user_id = ANY($1)', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.werkblad_indeling WHERE user_id = ANY($1)', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [A]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [A]).catch(() => undefined);
    }
    if (vlagVoor) await pool.query(`UPDATE app.feature_flags SET aan=$1, standaard=$2, percentage=$3, gebruikers=$4 WHERE sleutel='werkblad-v3'`, [vlagVoor.aan, vlagVoor.standaard, vlagVoor.percentage, vlagVoor.gebruikers]).catch(() => undefined);
    G.herstel();
  }
  return einde();
}
