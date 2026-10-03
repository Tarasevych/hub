// Eenheidstests voor auth fase 1 (zie docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md):
// rate limiter faalt dicht op gevoelige buckets.
// Draaien: DATABASE_URL=... node scripts/eenheidstests.mjs
import { rateLimit } from '../../server/platform/beveiliging';
import { closePool } from '../../server/platform/pg';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

export async function main() {
  // Rate limiter: een ongeldig venster (NaN) laat de INSERT mislukken = gesimuleerde databasefout.
  const stil = console.error; console.error = () => {};
  const open = await rateLimit(`eenheidstest-open:${Date.now()}`, 10, Number.NaN);
  const dicht = await rateLimit(`eenheidstest-dicht:${Date.now()}`, 10, Number.NaN, { failClosed: true });
  console.error = stil;
  check('rate limit: DB-fout op gewone bucket → doorgelaten (open)', open.ok === true);
  check('rate limit: DB-fout op gevoelige bucket → geweigerd met Retry-After (dicht)', dicht.ok === false && dicht.retryAfter > 0, JSON.stringify(dicht));
  const bucket = `eenheidstest-normaal:${Date.now()}`;
  const normaal = [];
  for (let i = 0; i < 3; i++) normaal.push((await rateLimit(bucket, 2, 60, { failClosed: true })).ok);
  check('rate limit: zonder DB-fout telt failClosed gewoon (2 ok, 3e geweigerd)', normaal.join(',') === 'true,true,false', normaal.join(','));

  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (aanmelden)`);
  return mis ? 1 : 0;
}
