// Begrensd uitpakken van .gz-bijlagen: moet echt uitpakken (callback (data, final) van de synchrone fflate-Gunzip) en de limiet bewaken.
import { gzipSync } from 'node:zlib';
import { gunzipBounded } from '../../src/mail-bounded-gzip';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-gzip');
  const tekst = 'Hallo wereld, dit is een test van het uitpakken. '.repeat(2000);
  const raw = new Uint8Array(gzipSync(Buffer.from(tekst)));
  const uit = await gunzipBounded(raw, 10_000_000);
  check('een geldige gzip wordt volledig uitgepakt', Buffer.from(uit).toString('utf8') === tekst && uit.length === tekst.length);
  let fout = '';
  try { await gunzipBounded(raw, 1000); } catch (e) { fout = (e as Error).message; }
  check('boven de limiet: GZIP_EXPANDED_LIMIT in plaats van geheugenverbruik', fout === 'GZIP_EXPANDED_LIMIT');
  let kapot = '';
  try { await gunzipBounded(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 1000); } catch (e) { kapot = (e as Error).message; }
  check('een kapot bestand geeft een fout (geen hang, geen leeg resultaat)', kapot.length > 0);
  return einde();
}
