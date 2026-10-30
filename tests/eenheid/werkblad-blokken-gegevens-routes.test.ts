// WERKBLAD BLOKKEN (0116) — /api/owner/hub/werkblad/v3/blokken/* op de ECHTE router, levende PostgreSQL, twee mensen.
//   vlag uit = oud gedrag (kolom genegeerd, niet gewist); bewaren met laagversie (409); servervalidatie (limieten, register, ruimte);
//   blok overleeft v3/bewaren (DELETE+INSERT); backup/herstel na een «oude release»; plekken; technische lade apart; RLS; 0116 idempotent.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getPool, appRolActief } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';

const HUB = 'hub.tarasevych.com';
type Antw = { status: number; data: Record<string, any>; body: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Br = { verzoek: (host: string, pad: string, body?: unknown) => Promise<Antw>; aanmelden: (sub: string, email: string, o?: Record<string, unknown>) => Promise<unknown>; tab: string; ctxBody: (s?: string, e?: Record<string, unknown>) => Record<string, unknown> };
const o = (id: string, itemId = 'svc:mail') => ({ soort: 'onderdeel', id, itemId, afmeting: { breedte: { soort: 'auto' }, hoogte: { soort: 'auto' } }, volgorde: 0 });
const bl = (id: string, kinderen: unknown[]) => ({ soort: 'blok', id, afmeting: { breedte: { soort: 'auto' }, hoogte: { soort: 'auto' } }, volgorde: 0, indeling: { modus: 'raster' }, kinderen });
const inh = (w: unknown) => ({ schema: 1, wortel: w });

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-blokken-gegevens-routes');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const pool = getPool('systeem');
  const eigenaar = `bla-a-${T}@example.test`, subA = `sub-bla-a-${T}`, emailB = `bla-b-${T}@example.test`, subB = `sub-bla-b-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  let A = '', B = '';
  const via = (b: Br, pad: string, body: Record<string, unknown> = {}) => b.verzoek(HUB, `/api/owner/hub/werkblad/${pad}`, b.ctxBody('hub', body));
  const FL = ['werkblad-v3', 'werkblad-blokken'];
  const vlagVoor = (await pool.query(`SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)`, [FL])).rows;
  const vlag = async (s: string, g: string[]) => pool.query(`UPDATE app.feature_flags SET aan = $2, gebruikers = $1 WHERE sleutel = $3`, [g, g.length > 0, s]);
  const dbBlok = async (u: string, inst: string, ruimte = 'prive') => (await pool.query(`SELECT blok FROM app.werkblad_items WHERE user_id=$1 AND ruimte=$3 AND apparaat='computer' AND instance_id=$2`, [u, inst, ruimte])).rows[0]?.blok ?? null;
  try {
    const bv = vlagVoor.find((r) => r.sleutel === 'werkblad-blokken');
    check('0116: vlag werkblad-blokken bestaat, standaard UIT', !!bv && bv.aan === false && bv.standaard === false);
    const P = G.browser() as unknown as Br; await P.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    A = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const Bb = G.browser() as unknown as Br; await Bb.aanmelden(subB, emailB, { service: 'hub' });
    B = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [emailB])).rows[0]?.id || '');
    await pool.query(`update app.records set data = data || '{"status":"approved"}'::jsonb where tbl='users' and id = ANY($1)`, [[A, B]]);
    check('підготовка: twee accounts', !!A && !!B && A !== B);

    await vlag('werkblad-v3', [A, B]); await vlag('werkblad-blokken', []);
    const items = [
      { instanceId: 'w1', itemId: 'wdg:snel-toegang', kind: 'widget', x: 0, y: 0, w: 400, h: 300 },
      { instanceId: 'm1', itemId: 'map:m1', kind: 'folder', x: 500, y: 0, w: 200, h: 200 },
      { instanceId: 'k1', itemId: 'svc:mail', kind: 'shortcut', x: 0, y: 0, w: 96, h: 104, parent: 'm1' },
      { instanceId: 's1', itemId: 'svc:ai', kind: 'shortcut', x: 800, y: 0, w: 96, h: 104 },
    ];
    const l0 = await via(P, 'v3/laden', { apparaat: 'computer' });
    const s0 = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { ...l0.data.layouts.computer.layout, items }, versie: l0.data.layouts.computer.versie });
    check('v3: laag met widget, map, snelkoppeling bewaard', s0.status === 200 && s0.data.laag.layout.items.length === 4, s0.body.slice(0, 200));
    let versie = Number(s0.data.laag.versie);

    // ---------------- vlag uit
    const lu = await via(P, 'v3/blokken/laden');
    check('vlag uit: blokken/laden → 200 {aan:false}', lu.status === 200 && lu.data.aan === false && !('lagen' in lu.data));
    const bu = await via(P, 'v3/blokken/bewaren', { apparaat: 'computer', instanceId: 'w1', blok: inh(bl('w', [])), versie });
    check('vlag uit: bewaren → 403 WERKBLAD_BLOKKEN_UIT', bu.status === 403 && /WERKBLAD_BLOKKEN_UIT/.test(bu.body));
    const pu = await via(P, 'v3/blokken/plek-bewaren', { plekId: 'menu:hoofd', blok: inh(bl('p', [])), versie: 0 });
    check('vlag uit: plek-bewaren → 403', pu.status === 403);
    await vlag('werkblad-v3', []); await vlag('werkblad-blokken', [A, B]);
    check('alleen blokken aan, v3 uit → nog steeds {aan:false}', (await via(P, 'v3/blokken/laden')).data.aan === false);

    // ---------------- vlag aan
    await vlag('werkblad-v3', [A, B]);
    const l1 = await via(P, 'v3/blokken/laden');
    check('vlag aan: laden → lagen met laagversie, geen blokken, geen backup', l1.status === 200 && l1.data.aan === true && l1.data.lagen.computer.versie === versie && Object.keys(l1.data.lagen.computer.blokken).length === 0 && l1.data.backup === null, l1.body.slice(0, 200));
    const blok1 = inh({ ...bl('w', [o('a'), bl('g', [o('b', 'svc:ai')])]), indeling: { modus: 'vrij', overlapToestaan: true } });
    const b1 = await via(P, 'v3/blokken/bewaren', { apparaat: 'computer', instanceId: 'w1', blok: blok1, versie });
    check('bewaren: 200, laagversie +1, genormaliseerd terug (bron eigen)', b1.status === 200 && b1.data.laag.versie === versie + 1 && b1.data.laag.blokken.w1.bron === 'eigen' && b1.data.laag.blokken.w1.wortel.kinderen.length === 2, b1.body.slice(0, 200));
    check('database: kolom blok gevuld', (await dbBlok(A, 'w1'))?.wortel?.kinderen?.[1]?.id === 'g');
    const oud = await via(P, 'v3/blokken/bewaren', { apparaat: 'computer', instanceId: 'w1', blok: null, versie });
    check('verouderde versie → 409 WERKBLAD_V3_VEROUDERD + actuele laag; niets gewijzigd', oud.status === 409 && oud.data.code === 'WERKBLAD_V3_VEROUDERD' && oud.data.laag.versie === versie + 1 && !!(await dbBlok(A, 'w1')));
    versie += 1;
    const v3oud = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { ...s0.data.laag.layout }, versie: versie - 1 });
    check('v3-client met oude laagversie → ook 409 (gedeelde versie)', v3oud.status === 409);
    const fout = async (blok: unknown, inst = 'm1') => via(P, 'v3/blokken/bewaren', { apparaat: 'computer', instanceId: inst, blok, versie });
    let diep: unknown = bl('d5', []); for (let i = 4; i >= 1; i--) diep = bl(`d${i}`, [diep]);
    const f1 = await fout(inh(diep));
    check('server: diepte 5 → 400 te-diep', f1.status === 400 && f1.data.fouten.includes('te-diep'));
    const f2 = await fout(inh(bl('m', [o('t', 'wdg:tech-server')])));
    check('server: technische widget in privé → 400 item-niet-toegestaan', f2.status === 400 && f2.data.fouten.some((x: string) => x.startsWith('item-niet-toegestaan')), f2.body);
    const f3 = await fout(inh(bl('m', [o('a')])));
    check('server: knoop-id al gebruikt in ander blok van de laag → 400 dubbele-id', f3.status === 400 && f3.data.fouten.includes('dubbele-id:a'));
    const f4 = await fout(inh(bl('m', [])), 's1');
    check('server: blok op een snelkoppeling → 404 GEEN_ITEM', f4.status === 404 && f4.data.code === 'WERKBLAD_BLOKKEN_GEEN_ITEM');
    const f5 = await fout(inh(bl('m', Array.from({ length: 61 }, (_, i) => o(`k${i}`)))));
    check('server: 61 kinderen → 400', f5.status === 400);
    const f6 = await fout(inh(bl('m', [o('x')])), 'bestaat-niet');
    check('server: onbekende instanceId → 404', f6.status === 404);
    const mb = await fout(inh(bl('m', [o('mk')])));
    check('map krijgt blok', mb.status === 200 && Object.keys(mb.data.laag.blokken).sort().join() === 'm1,w1');
    versie = mb.data.laag.versie;

    // ---------------- blok overleeft v3/bewaren (DELETE+INSERT), ook met vlag uit
    const lv = (await via(P, 'v3/laden', { apparaat: 'computer' })).data.layouts.computer;
    const verschoven = lv.layout.items.map((i: any) => (i.instanceId === 'w1' ? { ...i, x: 40 } : i)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const sv = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { ...lv.layout, items: verschoven }, versie: lv.versie });
    check('v3/bewaren (widget verschoven) → blok blijft staan', sv.status === 200 && (await dbBlok(A, 'w1'))?.wortel?.id === 'w' && (await dbBlok(A, 'm1'))?.wortel?.id === 'm');
    await vlag('werkblad-blokken', []);
    const sv2 = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { ...sv.data.laag.layout, items: sv.data.laag.layout.items.map((i: any) => (i.instanceId === 'w1' ? { ...i, x: 80 } : i)) }, versie: sv.data.laag.versie }); // eslint-disable-line @typescript-eslint/no-explicit-any
    check('vlag blokken UIT: v3 werkt exact zoals voorheen, kolom blok NIET gewist', sv2.status === 200 && !('blok' in sv2.data.laag.layout.items[0]) && (await dbBlok(A, 'w1'))?.wortel?.id === 'w');
    check('vlag uit: v3/laden geeft geen blok-veld', !(await via(P, 'v3/laden', { apparaat: 'computer' })).body.includes('"blok"'));
    const zonder = sv2.data.laag.layout.items.filter((i: any) => i.instanceId !== 'm1' && i.instanceId !== 'k1'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const sv3 = await via(P, 'v3/bewaren', { apparaat: 'computer', layout: { ...sv2.data.laag.layout, items: zonder }, versie: sv2.data.laag.versie });
    check('map verwijderd via v3 → blok van map weg, w1 blijft', sv3.status === 200 && (await dbBlok(A, 'm1')) === null && !!(await dbBlok(A, 'w1')));
    const herM = await via(P, 'v3/blokken/herstellen', { welke: 'voor' });
    check('herstellen «voor» met vlag uit: map bestaat niet meer → overgeslagen geteld', herM.status === 200 && herM.data.overgeslagen === 1 && herM.data.hersteld === 1, herM.body);

    // ---------------- «oude release» wist blok → herstellen
    await pool.query(`UPDATE app.werkblad_items SET blok = NULL WHERE user_id = $1`, [A]);
    const vv = Number((await pool.query(`SELECT versie FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive' AND apparaat='computer'`, [A])).rows[0].versie);
    const her = await via(P, 'v3/blokken/herstellen', {});
    const vn = Number((await pool.query(`SELECT versie FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive' AND apparaat='computer'`, [A])).rows[0].versie);
    check('oude release wiste blok → herstellen (na) zet het terug, laagversie +1, vlag uit', her.status === 200 && her.data.hersteld === 1 && (await dbBlok(A, 'w1'))?.wortel?.kinderen?.[1]?.id === 'g' && vn === vv + 1, her.body);
    const herB = await via(Bb, 'v3/blokken/herstellen', {});
    check('B zonder backup → 404 GEEN_BACKUP', herB.status === 404 && herB.data.code === 'WERKBLAD_BLOKKEN_GEEN_BACKUP');

    // ---------------- plekken
    await vlag('werkblad-blokken', [A, B]);
    const p1 = await via(P, 'v3/blokken/plek-bewaren', { plekId: 'menu:hoofd', blok: inh(bl('pm', [o('pa', 'svc:ai')])), versie: 0 });
    check('plek menu:hoofd → 200 versie 1', p1.status === 200 && p1.data.plek.versie === 1, p1.body.slice(0, 200));
    const p2 = await via(P, 'v3/blokken/plek-bewaren', { plekId: 'menu:hoofd', blok: inh(bl('pm', [])), versie: 0 });
    check('plek met oude versie → 409', p2.status === 409 && p2.data.plek.versie === 1);
    check('ongeldige plek-id (canvas:/URL) → 400', (await via(P, 'v3/blokken/plek-bewaren', { plekId: 'https://x', blok: inh(bl('p', [])), versie: 0 })).status === 400);
    check('technisch item in privé-plek → 400', (await via(P, 'v3/blokken/plek-bewaren', { plekId: 'zijbalk:links', blok: inh(bl('p', [o('t', 'wdg:tech-server')])), versie: 0 })).status === 400);
    const pB = await via(Bb, 'v3/blokken/plek-bewaren', { plekId: 'menu:hoofd', blok: inh(bl('pm', [])), versie: 0, userId: A });
    check('B met userId van A → eigen lade (versie 0 werkt), A onaangeroerd', pB.status === 200 && Number((await pool.query(`SELECT versie FROM app.werkblad_plekken WHERE user_id=$1 AND plek_id='menu:hoofd'`, [A])).rows[0].versie) === 1);
    const lA = await via(P, 'v3/blokken/laden');
    check('laden: plekken + backup-info', lA.data.plekken.length === 1 && lA.data.plekken[0].plekId === 'menu:hoofd' && lA.data.backup?.heeftNa === true && !!lA.data.lagen.computer.blokken.w1);
    const pw = await via(P, 'v3/blokken/plek-bewaren', { plekId: 'menu:hoofd', blok: null, versie: 1 });
    const pv = await via(P, 'v3/blokken/herstellen', { welke: 'voor' });
    check('plek leegmaken en «voor» herstellen → plek terug', pw.status === 200 && pw.data.plek === null && pv.status === 200 && (await pool.query(`SELECT 1 FROM app.werkblad_plekken WHERE user_id=$1 AND plek_id='menu:hoofd'`, [A])).rowCount === 1);

    // ---------------- technische lade
    const Tb = G.browser() as unknown as Br; await Tb.aanmelden(subA, eigenaar, { service: 'hub', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const { tabHash } = await import('../../backend/tech-profiel');
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [A, `tech-${randomBytes(6).toString('hex')}`]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['eigenaar'],'blokken-test', now() + interval '60 minutes')`, [A, pid, tabHash(Tb.tab)]);
    const lT = await via(Tb, 'v3/laden', { apparaat: 'computer' });
    const sT = await via(Tb, 'v3/bewaren', { apparaat: 'computer', layout: { ...lT.data.layouts.computer.layout, items: [{ instanceId: 't1', itemId: 'wdg:tech-server', kind: 'widget', w: 300, h: 200 }] }, versie: lT.data.layouts.computer.versie });
    const bT = await via(Tb, 'v3/blokken/bewaren', { apparaat: 'computer', instanceId: 't1', blok: inh(bl('tw', [o('tt', 'wdg:tech-server')])), versie: sT.data.laag.versie });
    check('technische lade: technisch onderdeel mag daar', bT.status === 200 && bT.data.ruimte === 'technisch', bT.body.slice(0, 200));
    const lP = await via(P, 'v3/blokken/laden');
    check('privé ziet niets van technisch (geen t1, plek alleen privé)', lP.data.ruimte === 'prive' && !lP.data.lagen.computer.blokken.t1 && !lP.body.includes('tech-server'));
    check('database: technische blok in eigen lade', (await dbBlok(A, 't1', 'technisch'))?.wortel?.id === 'tw');

    // ---------------- RLS
    if (appRolActief()) {
      const { alsGebruiker } = await import('../../backend/ai-toestemmingen');
      const nB = await alsGebruiker(B, async (q) => Number((await q(`SELECT count(*)::int AS n FROM app.werkblad_plekken WHERE user_id = $1`, [A])).rows[0].n));
      const nA = await alsGebruiker(A, async (q) => Number((await q(`SELECT count(*)::int AS n FROM app.werkblad_plekken WHERE user_id = $1`, [A])).rows[0].n));
      check('RLS: B ziet 0 plekken van A, A ziet de eigen', nB === 0 && nA === 1, `${nB}/${nA}`);
      const upd = await alsGebruiker(B, async (q) => Number((await q(`UPDATE app.werkblad_items SET blok = NULL WHERE user_id = $1`, [A])).rowCount || 0)).catch(() => -1);
      const bk = await alsGebruiker(B, async (q) => Number((await q(`UPDATE app.werkblad_v3_lade SET blokken_backup = NULL WHERE user_id = $1`, [A])).rowCount || 0)).catch(() => -1);
      check('RLS: B kan blok en backup van A niet wijzigen', upd <= 0 && bk <= 0 && !!(await dbBlok(A, 'w1')));
      let geweigerd = false;
      try { await alsGebruiker(B, async (q) => q(`INSERT INTO app.werkblad_plekken (user_id, ruimte, plek_id, blok) VALUES ($1,'prive','menu:inbraak','{"schema":1,"wortel":{"soort":"blok"}}')`, [A])); } catch { geweigerd = true; }
      check('RLS: B kan geen plek voor A maken', geweigerd);
    } else check('RLS: overgeslagen (geen DATABASE_URL_APP)', true);
    const faalt = async (sql: string, p: unknown[]) => { try { await pool.query(sql, p); return false; } catch { return true; } };
    check('vangnet CHECK: blok op snelkoppeling / wortel geen blok → geweigerd',
      await faalt(`UPDATE app.werkblad_items SET blok='{"wortel":{"soort":"blok"}}' WHERE user_id=$1 AND instance_id='s1'`, [A])
      && await faalt(`UPDATE app.werkblad_items SET blok='{"wortel":{"soort":"onderdeel"}}' WHERE user_id=$1 AND instance_id='w1' AND ruimte='prive'`, [A]));

    // ---------------- 0116 opnieuw (idempotent), v3-gegevens onaangeroerd
    const voor = (await pool.query(`SELECT md5(string_agg(row_to_json(i)::text, '|' ORDER BY layout_id, instance_id)) h FROM app.werkblad_items i WHERE user_id = ANY($1)`, [[A, B]])).rows[0].h;
    const lay = (await pool.query(`SELECT md5(string_agg(id::text || versie, '|' ORDER BY id)) h FROM app.werkblad_layout WHERE user_id = ANY($1)`, [[A, B]])).rows[0].h;
    let mig = true;
    try { const c = await getPool('migratie' as never).connect(); try { await c.query(readFileSync('migrations/0116_werkblad_blokken.sql', 'utf8')); } finally { c.release(); } } catch (e) { mig = false; console.log(String(e)); }
    const na = (await pool.query(`SELECT md5(string_agg(row_to_json(i)::text, '|' ORDER BY layout_id, instance_id)) h FROM app.werkblad_items i WHERE user_id = ANY($1)`, [[A, B]])).rows[0].h;
    const lay2 = (await pool.query(`SELECT md5(string_agg(id::text || versie, '|' ORDER BY id)) h FROM app.werkblad_layout WHERE user_id = ANY($1)`, [[A, B]])).rows[0].h;
    check('0116 tweede keer: zonder fout, items/lagen/blokken byte-gelijk', mig && voor === na && lay === lay2);

    const anon = await (G.browser() as unknown as Br).verzoek(HUB, '/api/owner/hub/werkblad/v3/blokken/laden', { service: 'hub' });
    check('zonder sessie → 401/403', anon.status === 401 || anon.status === 403, String(anon.status));
  } finally {
    const u = [A, B].filter(Boolean);
    if (u.length) {
      await pool.query('DELETE FROM app.werkblad_v3_lade WHERE user_id = ANY($1)', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.werkblad_indeling WHERE user_id = ANY($1)', [u]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [A]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [A]).catch(() => undefined);
    }
    for (const r of vlagVoor) await pool.query(`UPDATE app.feature_flags SET aan=$1, standaard=$2, percentage=$3, gebruikers=$4 WHERE sleutel=$5`, [r.aan, r.standaard, r.percentage, r.gebruikers, r.sleutel]).catch(() => undefined);
    G.herstel();
  }
  return einde();
}
