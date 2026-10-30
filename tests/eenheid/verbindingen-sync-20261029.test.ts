// UI-003: syncFeiten (backend/cloud-vnext-integraties.ts) leest de echte syncstand per Drive-account uit google_suite_sync_state_v1,
// alleen de eigen lade, nieuwste rij wint; geen tabel/rijen = lege kaart. Tegen de wegwerp-PG (DATABASE_URL).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../../server/platform';
import { syncFeiten } from '../../backend/cloud-vnext-integraties';

export async function main(): Promise<number> {
  const eigenaar = `vbc-${randomUUID()}`, ander = `vbc-${randomUUID()}`;
  const rij = (o: Record<string, unknown>) => ({ ownerUserId: eigenaar, principalId: 'p', service: 'drive', phase: 'incremental', cursor: '', pageToken: '', lastAttemptAt: 0, lastSuccessAt: 0, recoveryRequired: false, errorCode: '', createdAt: 1, updatedAt: 1, ...o });
  let fout = 0; const t = (n: string, f: () => void) => { try { f(); console.log(`✔ ${n}`); } catch (e) { fout++; console.log(`✘ ${n}`, (e as Error).message); } };
  const leeg = await syncFeiten(eigenaar);
  t('geen rijen → lege kaart', () => assert.equal(leeg.size, 0));
  await db.add('google_suite_sync_state_v1', [
    rij({ accountId: 'a1', lastSuccessAt: 100, lastAttemptAt: 100, updatedAt: 10 }),
    rij({ accountId: 'a1', lastSuccessAt: 200, lastAttemptAt: 300, errorCode: 'DRIVE_HTTP_503', updatedAt: 20 }),
    rij({ accountId: 'a2', recoveryRequired: true, updatedAt: 5 }),
    rij({ ownerUserId: ander, accountId: 'a3', lastSuccessAt: 999 }),
  ]);
  const f = await syncFeiten(eigenaar);
  t('nieuwste rij per account wint', () => assert.deepEqual(f.get('a1'), { laatstGeluktOp: 200, laatstPogingOp: 300, foutCode: 'DRIVE_HTTP_503', herstelNodig: false }));
  t('herstelNodig doorgegeven', () => assert.equal(f.get('a2')?.herstelNodig, true));
  t('rij van een andere eigenaar niet zichtbaar', () => assert.equal(f.has('a3'), false));
  return fout ? 1 : 0;
}
