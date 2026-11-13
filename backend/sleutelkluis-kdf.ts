// SEC-002 (geheimen-02): de KEK uit de herstelcode ZONDER de hoofdthread te blokkeren.
// scrypt met N=2^16, r=8 kost ~160 ms en 64 MiB. Synchroon (scryptSync) staat het hele serverproces — één proces, één
// event loop — die tijd stil voor ALLE gebruikers; een aangemelde gebruiker kon zo met een lus de site laten hangen.
// Hier rekent libuv het in zijn threadpool. Twee grenzen erbij, omdat die threadpool gedeeld is (bestanden, DNS, crypto):
//   • hoogstens GELIJKTIJDIG berekeningen tegelijk (de rest wacht in een rij);
//   • hoogstens RIJ_MAX wachtenden; daarboven een eerlijke weigering (SLEUTELKLUIS_BEZET) in plaats van onbegrensd geheugen.
import { scrypt } from 'node:crypto';
import { normaliseerHerstelcode } from '../shared/sleutelkluis';

const GELIJKTIJDIG = 2;
const RIJ_MAX = 16;
const MAXMEM = 160 * 1024 * 1024;
const N_MAX = 1 << 17;

export class KdfBezetFout extends Error { code = 'SLEUTELKLUIS_BEZET'; status = 429; constructor() { super('SLEUTELKLUIS_BEZET'); } }

let bezig = 0;
const rij: Array<() => void> = [];
const beurt = (): Promise<void> => {
  if (bezig < GELIJKTIJDIG) { bezig += 1; return Promise.resolve(); }
  if (rij.length >= RIJ_MAX) return Promise.reject(new KdfBezetFout());
  return new Promise((klaar) => { rij.push(klaar); });
};
const vrij = () => { const volgende = rij.shift(); if (volgende) volgende(); else bezig -= 1; };

/** Voor diagnose en tests: hoeveel berekeningen lopen en wachten er nu. */
export const kdfDrukte = () => ({ bezig, wachtend: rij.length });

/** Zelfde uitkomst als kekUitHerstelcode (backend/sleutelkluis.ts), maar in de threadpool. De parameters komen uit de omslag. */
export async function kekUitHerstelcodeAsync(code: string, salt: Buffer, p: { N: number; r: number; p: number }): Promise<Buffer> {
  // Parameters uit de database zijn invoer: een vervalste rij mag geen onbegrensde rekentijd of geheugen afdwingen.
  const N = Number(p.N), r = Number(p.r), pp = Number(p.p);
  if (!Number.isInteger(N) || N < 2 || N > N_MAX || (N & (N - 1)) !== 0 || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(pp) || pp < 1 || pp > 4) {
    throw new Error('SLEUTELKLUIS_KDF_PARAMETERS');
  }
  await beurt();
  try {
    return await new Promise<Buffer>((klaar, mislukt) => {
      scrypt(normaliseerHerstelcode(code), salt, 32, { N, r, p: pp, maxmem: MAXMEM }, (fout, sleutel) => (fout ? mislukt(fout) : klaar(sleutel)));
    });
  } finally { vrij(); }
}
