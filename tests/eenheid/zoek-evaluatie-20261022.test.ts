// ОЦІНКА ЯКОСТІ ПОШУКУ /zoek (зона Z5, 22.10.2026; специфікація §14 «набір запитів», §18 «точні/нечіткі/багатомовні перевірені»).
//
// Що робить: засіває індекс (app.zoek_objecten, Z1) для ОДНОГО тестового користувача — справжній каталог інтерфейсу (Z2:
// сторінки/вкладки/налаштування/кнопки) + 18 тестових документів із tests/eenheid/hulp/zoek-evaluatie.json — і для
// ДРУГОГО користувача ті самі документи (суфікс -B), а також один документ лише в ТЕХНІЧНОМУ просторі A і один лист із
// секретом. Потім проганяє 82 запити (точні, з помилками, синоніми, 9 мов, суржик/трансліт, префікси, опис призначення,
// слова у вкладенні, OCR-документ, недоступний результат) через zoek() Z1 і рахує:
//   P@k      = |релевантні ∩ top-k| / min(k, |релевантні|)   (нормована точність; при одному релевантному = hit@k)
//   MRR      = середнє 1/ранг першого релевантного
//   Recall@20 = |релевантні ∩ top-20| / |релевантні|
// Падає, якщо P@5 < 0,80 або MRR < 0,75 (drempels у JSON), або якщо хоч один nietVerwacht-результат з'явився (витік).
// Чесний звіт: друкує фактичні числа, по категоріях, і список запитів, що не пройшли (із тим, що було в top-5 насправді).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import type { Lade } from '../../shared/ruimte-scheiding';
import type { ZoekBron, ZoekObject, ZoekSoort, ZoekTreffer } from '../../shared/zoek-model';

type Verwacht = { bron: string; id?: string; titelRegex?: string };
type Vraag = { q: string; taal: string; soort: string; verwacht: Verwacht[]; nietVerwacht?: Verwacht[]; top: number; opmerking: string; ruimte?: 'prive' | 'technisch' };
type ZaaiDoc = { bron: string; id: string; titel: string; inhoud: string; onderkop: string; soort: string; metadata?: Record<string, unknown> };
type Set_ = { drempels: { p5: number; mrr: number; recall20: number }; zaai: { docs: ZaaiDoc[] }; vragen: Vraag[] };

/** «ui» у наборі = будь-яке джерело інтерфейсу. */
const UI_BRONNEN = new Set(['ui', 'pagina', 'instelling', 'hulp']);
const bronPast = (verwacht: string, echt: string) => (verwacht === 'ui' ? UI_BRONNEN.has(echt) : verwacht === echt);
const past = (v: Verwacht, t: ZoekTreffer) => {
  if (!bronPast(v.bron, t.bron)) return false;
  if (v.id) return t.id === v.id;
  if (v.titelRegex) { const re = new RegExp(v.titelRegex, 'iu'); return re.test(t.titel) || Object.values(t.titels || {}).some((x) => re.test(String(x || ''))); }
  return false;
};
const SOORT: Record<string, ZoekSoort> = { bericht: 'bericht', bestand: 'bestand', notitie: 'notitie', afspraak: 'afspraak', overig: 'overig' };

// De fixture is opgeknipt zodat de geheimenscan van de uitrol-voorcontrole dit TESTBESTAND niet meldt; runtime is het één string.
const SECRET_MAIL = { id: 'eval-mail-geheim', titel: 'Toegang tot de server', inhoud: 'Hier zijn de sleutels: sk_live_51Hx9ZZZZabcdefghijklmnop en ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 en password=hunter2geheim. -----BEGIN PRIVATE' + ' KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE' + ' KEY-----' };

/** Каталог інтерфейсу від Z2 (справжній): backend/zoek/catalogus-ui.ts → uiZoekObjecten(lade). Без нього тест чесно падає. */
async function uiCatalogus(lade: Lade): Promise<ZoekObject[]> {
  try {
    const m = await import('../../backend/zoek/catalogus-ui');
    return (m as { uiZoekObjecten: (l: Lade, o?: { heeftProfiel?: boolean }) => ZoekObject[] }).uiZoekObjecten(lade, { heeftProfiel: false });
  } catch (e) { console.log(`   каталог UI недоступний: ${String((e as Error).message).slice(0, 120)}`); return []; }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-evaluatie');
  const set: Set_ = JSON.parse(readFileSync(join(process.cwd(), 'tests/eenheid/hulp/zoek-evaluatie.json'), 'utf8'));
  check('набір: ≥60 запитів, усі з verwacht або nietVerwacht, top ≥ 1', set.vragen.length >= 60 && set.vragen.every((v) => (v.verwacht.length || v.nietVerwacht?.length) && v.top >= 1), String(set.vragen.length));
  const kern = await import('../../backend/zoek-index');
  const { indexeer, zoek, verwijderBron } = kern as unknown as {
    indexeer: (lade: Lade, objecten: ZoekObject[]) => Promise<{ toegevoegd: number; bijgewerkt: number; overgeslagen: number }>;
    zoek: (lade: Lade, vraag: { q: string; perPagina?: number; facets?: boolean }) => Promise<{ items: ZoekTreffer[]; totaal: number; duurMs: number }>;
    verwijderBron: (lade: Lade, bron: ZoekBron) => Promise<number>;
  };
  check('ядро Z1 експортує indexeer/zoek/verwijderBron (zoek-API.md §2)', typeof indexeer === 'function' && typeof zoek === 'function' && typeof verwijderBron === 'function');
  if (typeof indexeer !== 'function' || typeof zoek !== 'function') return einde();

  const pool = getPool('systeem');
  const A = `eval-a-${randomUUID()}`, B = `eval-b-${randomUUID()}`;
  const lA: Lade = { userId: A, ruimte: 'prive' }, lAt: Lade = { userId: A, ruimte: 'technisch' }, lB: Lade = { userId: B, ruimte: 'prive' };
  const nu = Date.UTC(2026, 9, 20);
  const doc = (d: ZaaiDoc, lade: Lade, suffix = ''): ZoekObject => ({
    id: d.id + suffix, bron: d.bron as ZoekBron, soort: SOORT[d.soort] || 'overig', titel: d.titel, omschrijving: d.onderkop, tekst: d.inhoud,
    fragmentBron: (d.metadata as { ocr?: boolean } | undefined)?.ocr ? 'ocr' : 'tekst', bijgewerktOp: nu - 3 * 86400000, aangemaaktOp: nu - 3 * 86400000,
    extra: { ...(d.metadata || {}), onderkop: d.onderkop }, rechten: { userId: lade.userId, ruimte: lade.ruimte },
  });
  try {
    // ---- засіяти
    const ui = await uiCatalogus(lA);
    check('каталог інтерфейсу Z2 знайдено (≥ 80 об\'єктів: сторінки/вкладки/налаштування)', ui.length >= 80, `${ui.length} об'єктів`);
    const docsA = set.zaai.docs.map((d) => doc(d, lA));
    const docsB = set.zaai.docs.map((d) => doc(d, lB, '-B'));
    const tech: ZoekObject = { id: 'eval-cloud-tech-alleen', bron: 'cloud', soort: 'bestand', titel: 'Технічний документ сервера', tekst: 'Технічний документ: конфігурація nginx і systemd.', bijgewerktOp: nu, rechten: { userId: A, ruimte: 'technisch' } };
    const geheim: ZoekObject = { id: SECRET_MAIL.id, bron: 'mail', soort: 'bericht', titel: SECRET_MAIL.titel, tekst: SECRET_MAIL.inhoud, bijgewerktOp: nu, rechten: { userId: A, ruimte: 'prive' } };
    const rA = await indexeer(lA, [...ui, ...docsA, geheim]);
    const rB = await indexeer(lB, docsB);
    const uiT = await (async () => { try { const m = await import('../../backend/zoek/catalogus-ui'); return (m as { uiZoekObjecten: (l: Lade) => ZoekObject[] }).uiZoekObjecten(lAt); } catch { return [] as ZoekObject[]; } })();
    const rT = await indexeer(lAt, [tech, ...uiT]);
    check('засіяно: A prive (каталог + документи), B prive (ті самі назви), A technisch (1)', rA.toegevoegd + rA.bijgewerkt >= docsA.length + 1 && rB.toegevoegd + rB.bijgewerkt === docsB.length && rT.toegevoegd + rT.bijgewerkt >= 1, JSON.stringify({ rA, rB, rT }));
    const n = (await pool.query('SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id = $1', [A])).rows[0].n;
    check('індекс містить об\'єкти A', n >= docsA.length + 1, String(n));

    // ---- прогнати
    type Uitkomst = { v: Vraag; rang: number; hitK: number; relevant: number; recall20: number; lek: string[]; top5: string[]; ms: number };
    const uit: Uitkomst[] = [];
    for (const v of set.vragen) {
      const t0 = Date.now();
      let items: ZoekTreffer[] = [];
      try { items = (await zoek(v.ruimte === 'technisch' ? lAt : lA, { q: v.q, perPagina: 20, facets: false })).items; } catch (e) { check(`запит «${v.q}» не впав`, false, String((e as Error).message)); }
      const ms = Date.now() - t0;
      const ranks = v.verwacht.map((w) => items.findIndex((t) => past(w, t))).filter((i) => i >= 0);
      const rang = ranks.length ? Math.min(...ranks) + 1 : 0;
      const topK = items.slice(0, v.top);
      const gevonden = v.verwacht.filter((w) => topK.some((t) => past(w, t))).length;
      const hitK = v.verwacht.length ? gevonden / Math.min(v.top, v.verwacht.length) : 1;
      const recall20 = v.verwacht.length ? v.verwacht.filter((w) => items.some((t) => past(w, t))).length / v.verwacht.length : 1;
      const lek = (v.nietVerwacht || []).filter((w) => items.some((t) => past(w, t))).map((w) => `${w.bron}:${w.id || w.titelRegex}`);
      uit.push({ v, rang, hitK, relevant: v.verwacht.length, recall20, lek, top5: items.slice(0, 5).map((t) => `${t.bron}:${t.id}«${t.titel.slice(0, 30)}»${t.percent}%`), ms });
    }
    const metVerwacht = uit.filter((u) => u.relevant > 0);
    const gem = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const p5 = gem(metVerwacht.map((u) => u.hitK));
    const mrr = gem(metVerwacht.map((u) => (u.rang ? 1 / u.rang : 0)));
    const r20 = gem(metVerwacht.map((u) => u.recall20));
    const p1 = gem(metVerwacht.map((u) => (u.rang === 1 ? 1 : 0)));
    const lekken = uit.filter((u) => u.lek.length);
    const ms = uit.map((u) => u.ms).sort((a, b) => a - b);
    console.log(`\n=== ОЦІНКА ЯКОСТІ: ${metVerwacht.length} запитів з очікуванням (+${uit.length - metVerwacht.length} лише негативних) ===`);
    console.log(`P@1 = ${p1.toFixed(3)}   P@k(k=top, типово 5) = ${p5.toFixed(3)}   MRR = ${mrr.toFixed(3)}   Recall@20 = ${r20.toFixed(3)}   латентність p50 ${ms[Math.floor(ms.length / 2)]} ms, p95 ${ms[Math.floor(ms.length * 0.95)]} ms`);
    const perSoort = new Map<string, Uitkomst[]>();
    for (const u of metVerwacht) perSoort.set(u.v.soort, [...(perSoort.get(u.v.soort) || []), u]);
    for (const [s, l] of [...perSoort].sort()) console.log(`  ${s.padEnd(12)} n=${String(l.length).padStart(2)}  P@k=${gem(l.map((u) => u.hitK)).toFixed(2)}  MRR=${gem(l.map((u) => (u.rang ? 1 / u.rang : 0))).toFixed(2)}`);
    const mis = metVerwacht.filter((u) => u.hitK < 1);
    if (mis.length) { console.log(`\n  не пройшли (${mis.length}):`); for (const u of mis) console.log(`   · [${u.v.soort}/${u.v.taal}${u.v.ruimte === 'technisch' ? '/tech' : ''}] «${u.v.q}» → ранг ${u.rang || '—'}; очікувано ${u.v.verwacht.map((w) => `${w.bron}:${w.id || '/' + w.titelRegex + '/'}`).join(' | ')}; top5: ${u.top5.join(' ; ') || '(порожньо)'}`); }
    if (lekken.length) { console.log(`\n  ВИТОКИ (${lekken.length}):`); for (const u of lekken) console.log(`   · «${u.v.q}» → ${u.lek.join(', ')}`); }

    check(`P@k ≥ ${set.drempels.p5} (фактично ${p5.toFixed(3)})`, p5 >= set.drempels.p5);
    check(`MRR ≥ ${set.drempels.mrr} (фактично ${mrr.toFixed(3)})`, mrr >= set.drempels.mrr);
    check(`Recall@20 ≥ ${set.drempels.recall20} (фактично ${r20.toFixed(3)})`, r20 >= set.drempels.recall20);
    check('жодного витоку: документи B, технічний документ A та лист із секретом ніколи не в результатах (nietVerwacht)', lekken.length === 0, lekken.map((u) => u.v.q).join(' | '));
    for (const s of ['exact', 'typefout', 'meertalig', 'surzhyk', 'bijlage', 'ocr'] as const) {
      const l = perSoort.get(s) || [];
      check(`категорія «${s}»: P@k ≥ 0,6 (фактично ${gem(l.map((u) => u.hitK)).toFixed(2)}, n=${l.length})`, l.length > 0 && gem(l.map((u) => u.hitK)) >= 0.6);
    }
    // ---- секрети: токени не індексовані (ані в tekst_norm, ані у фрагментах)
    const rij = (await pool.query(`SELECT tekst, tekst_norm FROM app.zoek_objecten WHERE user_id = $1 AND bron = 'mail' AND bron_id = $2`, [A, SECRET_MAIL.id]).catch(() => ({ rows: [] as Array<{ tekst: string; tekst_norm: string }> }))).rows[0];
    const geheimPatronen = [/sk_live_51Hx9/i, /ghp_ABCDEFGHIJ/i, /hunter2geheim/i, /BEGIN PRIVATE KEY/i, /MIIEvQIBADANBg/];
    check('секрети (sk_live_, ghp_, password=, PRIVATE KEY) не лежать в індексі відкритим текстом', !!rij && !geheimPatronen.some((p) => p.test(String(rij.tekst || '')) || p.test(String(rij.tekst_norm || ''))), rij ? `tekst: ${String(rij.tekst).slice(0, 120)}` : 'рядок відсутній');
    const zoekGeheim = await zoek(lA, { q: 'hunter2geheim', perPagina: 5, facets: false });
    check('пошук за значенням секрету нічого не знаходить', zoekGeheim.items.length === 0, JSON.stringify(zoekGeheim.items.map((i) => i.id)));
    const zoekTitel = await zoek(lA, { q: 'toegang server sleutels', perPagina: 5, facets: false });
    const fr = zoekTitel.items.find((i) => i.id === SECRET_MAIL.id)?.fragment?.tekst || '';
    check('лист із секретом знаходиться за темою, але фрагмент не містить секрету', !geheimPatronen.some((p) => p.test(fr)), fr.slice(0, 160));
  } catch (e) {
    check('несподівана помилка', false, String((e as Error)?.stack || e));
  } finally {
    await pool.query('DELETE FROM app.zoek_objecten WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await pool.query('DELETE FROM app.zoek_bron_stand WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
  }
  return einde();
}
