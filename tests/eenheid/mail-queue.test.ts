// Mailtaken (provider.sync.*): de uitvoerlus mag niet blijven hangen op de eerste (oudste) 100 jobs van een eigenaar, en klaar-jobs worden opgeruimd.
// Achtergrond: op productie bleven 293 jobs "queued" omdat de lus alleen de eerste 100 rijen (allemaal "succeeded") bekeek; drie dagen geen synchronisatie.
import { randomUUID } from 'node:crypto';
import { closePool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { mailPurgeJobs, mailRunDueJobs } from '../../backend/index';
import { checker } from './hulp/nep-google';

const TABLE = 'mail_jobs_v2';
const idOf = (x: unknown): string => (typeof x === 'string' ? x : String((x as { id: string }).id));
const job = (owner: string, over: Record<string, unknown>) => ({
  ownerUserId: owner, mailAccountId: 'acc-niet-bestaand', type: 'provider.sync.incremental', idempotencyKey: randomUUID(), status: 'queued', priority: 100,
  attemptCount: 0, maxAttempts: 8, availableAt: Date.now() - 1000, leaseOwner: '', leaseExpiresAt: 0, createdAt: Date.now(), updatedAt: Date.now(), payload: {}, ...over,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-queue');
  const A = `mq-A-${randomUUID()}`;
  const B = `mq-B-${randomUUID()}`;
  const stil = console.error; console.error = () => {};
  try {
    // 130 oude "succeeded" jobs eerst (invoegvolgorde!), daarna pas de wachtende jobs: precies de situatie op productie.
    await db.add(TABLE, Array.from({ length: 130 }, () => job(A, { status: 'succeeded', updatedAt: Date.now() - 5 * 24 * 3600000 })));
    const [due1, due2] = (await db.add(TABLE, [job(A, { priority: 20, type: 'provider.sync.initial' }), job(A, {})]) as unknown[]).map(idOf);
    await db.add(TABLE, [job(B, {})]);
    await mailRunDueJobs(A, 3);
    const na = await db.list<any>(TABLE, { filter: { ownerUserId: A, attemptCount: 1 }, limit: 50 });
    const ids = new Set(na.items.map((i) => i.id));
    check('uitvoerlus: wachtende jobs worden opgepakt ook als er 130 oudere klaar-jobs voor staan (attemptCount 1, niet langer "queued")',
      ids.has(due1) && ids.has(due2) && na.items.every((i) => i.status !== 'queued'), JSON.stringify(na.items.map((i) => [i.type, i.status, i.lastErrorCode])));
    const vanB = await db.list<any>(TABLE, { filter: { ownerUserId: B }, limit: 10 });
    check('uitvoerlus: jobs van een andere eigenaar blijven onaangeroerd', vanB.items.length === 1 && vanB.items[0].status === 'queued' && vanB.items[0].attemptCount === 0);

    // opruimen
    const nieuweKlaar = idOf((await db.add(TABLE, [job(A, { status: 'succeeded', updatedAt: Date.now() - 3600000 })]) as unknown[])[0]);
    const oudTerugval = idOf((await db.add(TABLE, [job(A, { payload: { fallback: true }, createdAt: Date.now() - 3 * 3600000 })]) as unknown[])[0]);
    const nieuwTerugval = idOf((await db.add(TABLE, [job(A, { payload: { fallback: true }, createdAt: Date.now() - 5 * 60000, availableAt: Date.now() + 3600000 })]) as unknown[])[0]);
    const verwijderd = await mailPurgeJobs(A);
    const rest = await db.list<any>(TABLE, { filter: { ownerUserId: A }, limit: 500 });
    const restIds = new Set(rest.items.map((i) => i.id));
    check('opruimen: oude klaar-jobs (>3 dagen) en verouderde terugval-synchronisaties weg; recente klaar-jobs en verse terugval-taken blijven',
      verwijderd >= 130 && !rest.items.some((i) => i.status === 'succeeded' && Number(i.updatedAt) < Date.now() - 4 * 24 * 3600000) && restIds.has(nieuweKlaar) && !restIds.has(oudTerugval) && restIds.has(nieuwTerugval), `verwijderd=${verwijderd} rest=${rest.items.length}`);
    const eigenaarB = await db.list<any>(TABLE, { filter: { ownerUserId: B }, limit: 10 });
    check('opruimen: raakt de jobs van een andere eigenaar niet', eigenaarB.items.length === 1);
  } finally {
    console.error = stil;
    await closePool().catch(() => undefined);
  }
  return einde();
}
