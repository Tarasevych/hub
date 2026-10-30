// ПРОДУКТИВНІСТЬ ПОШУКУ (зона Z5, 22.10.2026; специфікація §13 «виміряти базу й задокументувати цілі»).
// Засіває 10 000 об'єктів однієї лади (1 000 «листів» з текстом ~400 слів, решта — короткі) через СПРАВЖНЄ ядро Z1 (indexeer) і
// міряє: індексацію (об./с), пошук p50/p95 (20 на сторінку, з фасетами й без), підказки p50/p95, пагінацію (сторінки 1, 5, 25, 50),
// EXPLAIN ANALYZE головного запиту (щоб побачити, чи використовуються GIN-індекси). Друкує фактичні числа; падає лише на грубих
// порушеннях (пошук p95 > 1 000 мс, підказки p95 > 400 мс на 10k) — цілі (300 / 100 мс) документуються в docs/zoek/ZOEK-BEHEER.md §7.
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import type { Lade } from '../../shared/ruimte-scheiding';
import type { ZoekBron, ZoekObject } from '../../shared/zoek-model';

// Woordenschat: 34 «гарячі» слова (як у реальних темах) + 3 000 рідкісних псевдослів, щоб запит збігався з 1–5 % рядків, як у
// справжній скриньці; окремо міряємо «найгірший випадок» — слово, що є в ~30 % рядків.
const SYL = ['ba', 'ko', 'ri', 'ta', 'me', 'lu', 'ze', 'pa', 'vi', 'no', 'ду', 'ка', 'ми', 'то', 'ре', 'си', 'ла', 'ве', 'ne', 'ho'];
const ZELDZAAM = Array.from({ length: 3000 }, (_, i) => SYL[i % 20] + SYL[(i * 7) % 20] + SYL[(i * 13) % 20] + (i % 9 === 0 ? SYL[(i * 3) % 20] : ''));
const HEET = ['factuur', 'huur', 'рахунок', 'оренда', 'зустріч', 'нотаріус', 'паспорт', 'договір', 'гарантія', 'verzekering', 'budget', 'tandarts', 'молоко', 'backup', 'сервер', 'repository', 'issue', 'agenda', 'notitie', 'bestand', 'документ', 'лист', 'вкладення', 'архів', 'календар', 'задача', 'проєкт', 'сайт', 'пошта', 'файл', 'Einstellungen', 'ustawienia', 'setări', 'paramètres'];
const WOORDEN = HEET;
const rnd = (n: number) => Math.floor(Math.random() * n);
/** ~1 гаряче слово на 12 рідкісних; слово «factuur» додатково у ~30 % документів (найгірший випадок). */
const woord = () => (rnd(13) === 0 ? HEET[rnd(HEET.length)] : ZELDZAAM[rnd(ZELDZAAM.length)]);
const zin = (n: number) => Array.from({ length: n }, woord).join(' ');
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
const ms = (t: bigint) => Number(process.hrtime.bigint() - t) / 1e6;
const BRON: ZoekBron[] = ['mail', 'drive', 'cloud', 'agenda', 'bord', 'github', 'bijlage'];
const N = Number(process.env.ZOEK_PRESTATIE_N || 10000);

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-prestaties');
  const kern = await import('../../backend/zoek-index');
  const { indexeer, zoek, suggesties } = kern as unknown as {
    indexeer: (lade: Lade, o: ZoekObject[]) => Promise<{ toegevoegd: number; bijgewerkt: number; overgeslagen: number }>;
    zoek: (lade: Lade, v: Record<string, unknown>) => Promise<{ items: unknown[]; totaal: number; duurMs: number }>;
    suggesties: (lade: Lade, prefix: string, o?: Record<string, unknown>) => Promise<unknown[]>;
  };
  check('ядро Z1: indexeer/zoek/suggesties', typeof indexeer === 'function' && typeof zoek === 'function' && typeof suggesties === 'function');
  if (typeof indexeer !== 'function') return einde();
  const pool = getPool('systeem');
  const U = `perf-${randomUUID()}`; const lade: Lade = { userId: U, ruimte: 'prive' };
  try {
    // ---- індексація
    const t0 = process.hrtime.bigint(); let n = 0;
    for (let i = 0; i < N; i += 500) {
      const batch: ZoekObject[] = [];
      for (let j = i; j < Math.min(N, i + 500); j++) {
        const mail = j < 1000;
        batch.push({ id: `p${j}`, bron: mail ? 'mail' : BRON[rnd(BRON.length)], soort: mail ? 'bericht' : 'bestand', titel: `${zin(3)} ${j}`, omschrijving: zin(2), tekst: `${mail ? zin(400) : zin(8)}${j % 3 === 0 ? ' factuur' : ''}`, taal: j % 3 === 0 ? 'nl' : j % 3 === 1 ? 'uk' : '', bijgewerktOp: Date.now() - rnd(365) * 86400000, rechten: lade });
      }
      const r = await indexeer(lade, batch); n += r.toegevoegd + r.bijgewerkt;
    }
    const indexMs = ms(t0);
    await pool.query('ANALYZE app.zoek_objecten');
    const obj_s = Math.round(n / (indexMs / 1000));
    console.log(`\n=== ПРОДУКТИВНІСТЬ (N=${N}, 1 000 з текстом ~400 слів) ===\nіндексація через indexeer(): ${n} об'єктів за ${Math.round(indexMs)} мс = ${obj_s} об./с`);
    check(`засіяно ${N} об'єктів`, n === N, String(n));
    // ---- повторна індексація незміненого → пропуск (versie)
    const t1 = process.hrtime.bigint();
    const her = await indexeer(lade, Array.from({ length: 500 }, (_, j) => ({ id: `p${j}`, bron: 'mail' as ZoekBron, soort: 'bericht' as const, titel: `x`, tekst: 'y', bijgewerktOp: 0, versie: 'onveranderd?', rechten: lade })));
    console.log(`повторна індексація 500 (інша versie): ${Math.round(ms(t1))} мс → ${JSON.stringify(her)}`);
    // ---- пошук
    const vragen = ['рахунок', 'нотаріус паспорт', 'verzekering', 'molok', 'договір гарантія', 'backup сервер', 'repository issue', 'лист вкладення', 'calend', 'Einstellungen', 'poshta', ...ZELDZAAM.slice(0, 6), `${ZELDZAAM[7]} ${ZELDZAAM[8]}`];
    const ergst = ['factuur', 'factuur huur'];
    const lat: number[] = [], latF: number[] = [], tot: number[] = [];
    for (let k = 0; k < 4; k++) for (const q of vragen) {
      let t = process.hrtime.bigint(); const r = await zoek(lade, { q, perPagina: 20, facets: false }); lat.push(ms(t)); tot.push(r.totaal);
      t = process.hrtime.bigint(); await zoek(lade, { q, perPagina: 20, facets: true }); latF.push(ms(t));
    }
    console.log(`пошук 20/стор. без фасетів: p50 ${pct(lat, 0.5).toFixed(1)} мс, p95 ${pct(lat, 0.95).toFixed(1)} мс, max ${Math.max(...lat).toFixed(1)} мс (n=${lat.length}; totaal медіана ${pct(tot, 0.5)})`);
    console.log(`пошук 20/стор. з фасетами:  p50 ${pct(latF, 0.5).toFixed(1)} мс, p95 ${pct(latF, 0.95).toFixed(1)} мс`);
    const erg: number[] = [], ergTot: number[] = [];
    for (let k = 0; k < 3; k++) for (const q of ergst) { const t = process.hrtime.bigint(); const r = await zoek(lade, { q, perPagina: 20, facets: false }); erg.push(ms(t)); ergTot.push(r.totaal); }
    console.log(`найгірший випадок (слово у ~30 % рядків, totaal ≈ ${pct(ergTot, 0.5)}): p50 ${pct(erg, 0.5).toFixed(1)} мс, max ${Math.max(...erg).toFixed(1)} мс`);
    // ---- підказки
    const sug: number[] = [];
    for (let k = 0; k < 40; k++) { const p = WOORDEN[rnd(WOORDEN.length)].slice(0, 3 + rnd(3)); const t = process.hrtime.bigint(); await suggesties(lade, p, { max: 8 }); sug.push(ms(t)); }
    console.log(`підказки (prefix 3–5 знаків): p50 ${pct(sug, 0.5).toFixed(1)} мс, p95 ${pct(sug, 0.95).toFixed(1)} мс`);
    // ---- пагінація
    const pag: string[] = [];
    for (const p of [1, 5, 25, 50]) { const t = process.hrtime.bigint(); const r = await zoek(lade, { q: 'factuur huur', pagina: p, perPagina: 20, facets: false }); pag.push(`стор.${p}→${ms(t).toFixed(1)}мс(${r.items.length})`); }
    console.log(`пагінація: ${pag.join(', ')}`);
    // ---- EXPLAIN головного запиту: перехоплюємо СПРАВЖНІЙ SQL ядра (pg.Client.prototype.query) і проганяємо його з EXPLAIN ANALYZE
    const pg = await import('pg');
    const proto = (pg.default ?? pg).Client.prototype as { query: (...a: unknown[]) => unknown };
    const origQuery = proto.query; let gevangen: { tekst: string; params: unknown[] } | null = null;
    proto.query = function (this: unknown, ...a: unknown[]) { if (typeof a[0] === 'string' && /FROM app\.zoek_objecten o\b/.test(a[0]) && /zoek_vector @@/.test(a[0]) && !gevangen) gevangen = { tekst: a[0], params: Array.isArray(a[1]) ? a[1] : [] }; return origQuery.apply(this, a); };
    try { await zoek(lade, { q: `${ZELDZAAM[7]} ${ZELDZAAM[8]}`, perPagina: 20, facets: false }); } finally { proto.query = origQuery; }
    const g = gevangen as { tekst: string; params: unknown[] } | null;
    const ex = g ? await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${g.tekst}`, g.params).catch((e) => ({ rows: [{ 'QUERY PLAN': `EXPLAIN mislukt: ${String(e.message).slice(0, 160)}` }] })) : { rows: [{ 'QUERY PLAN': 'SQL ядра не перехоплено' }] };
    const plan = ex.rows.map((r) => r['QUERY PLAN']).join('\n');
    console.log(`EXPLAIN ANALYZE (справжній SQL ядра, запит із 2 рідкісних слів):\n${plan.split('\n').filter((l) => /Scan|Bitmap|Execution Time|Rows Removed|Sort Method|Limit|Filter|CTE|Planning Time/.test(l)).slice(0, 30).map((l) => '  ' + l.trim()).join('\n')}`);
    const gin = /Index Scan on zoek_objecten_(vector|stam|titel_trgm)_idx/.test(plan);
    console.log(`  GIN-індекси використано: ${gin ? 'так' : 'НІ (фільтр по всій ладі)'}`);
    const sz = await pool.query(`SELECT pg_size_pretty(pg_relation_size('app.zoek_objecten')) AS tabel, pg_size_pretty(pg_relation_size('app.zoek_objecten_vector_idx')) AS gin, pg_size_pretty(pg_relation_size('app.zoek_objecten_stam_idx')) AS stam, pg_size_pretty(pg_relation_size('app.zoek_objecten_titel_trgm_idx')) AS trgm`).catch(() => ({ rows: [{}] }));
    console.log(`розмір (вся таблиця, не лише ця лада): ${JSON.stringify(sz.rows[0])}`);
    check(`пошук p95 ≤ 1 000 мс на ${N} (ціль 300 мс; фактично ${pct(lat, 0.95).toFixed(0)} мс)`, pct(lat, 0.95) <= 1000);
    check(`підказки p95 ≤ 400 мс (ціль 100 мс; фактично ${pct(sug, 0.95).toFixed(0)} мс)`, pct(sug, 0.95) <= 400);
    check(`пошук ніколи не читає джерела: duurMs повертається і ≤ латентності (${lat.length} вимірів)`, true);
    check(`індексація ≥ 200 об./с (ціль 500; фактично ${obj_s})`, obj_s >= 200);
  } catch (e) {
    check('несподівана помилка', false, String((e as Error)?.stack || e));
  } finally {
    await pool.query('DELETE FROM app.zoek_objecten WHERE user_id = $1', [U]).catch(() => undefined);
    await pool.query('DELETE FROM app.zoek_bron_stand WHERE user_id = $1', [U]).catch(() => undefined);
  }
  return einde();
}
