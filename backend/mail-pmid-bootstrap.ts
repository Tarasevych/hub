import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { writePmidMapForAccount } from './mail-search-durable';

type BootstrapCheckpointRecord = {
  id: string;
  nextToken: string;
  processed: number;
  mapped: number;
  skippedDup: number;
  complete: boolean;
  updatedAt: number;
};

type MailItemBootstrapRow = {
  id: string;
  ownerUserId?: string;
  source?: string;
  mailAccountId?: string;
  providerMessageId?: string;
};

type MailAccountBootstrapRow = {
  ownerUserId?: string;
  email?: string;
};

const ITEMS = 'mail_items_v1';
const ACCOUNTS = 'mail_accounts_v1';
const CHECKPOINT_PREFIX = 'mail_pmid_bootstrap_v1:';

const sha = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const ownerKey = (ownerUserId: string) =>
  sha(ownerUserId).slice(0, 24);

const checkpointTable = (ownerUserId: string) =>
  `${CHECKPOINT_PREFIX}${ownerKey(ownerUserId)}`;

const checkpointBody = (
  row: Omit<BootstrapCheckpointRecord, 'id'>,
) => ({
  nextToken: row.nextToken,
  processed: row.processed,
  mapped: row.mapped,
  skippedDup: row.skippedDup,
  complete: row.complete,
  updatedAt: row.updatedAt,
});

async function readCheckpoint(
  ownerUserId: string,
): Promise<BootstrapCheckpointRecord | null> {
  const table = checkpointTable(ownerUserId);
  const page = await db.list<BootstrapCheckpointRecord>(table, { limit: 1 });
  return page.items[0] || null;
}

async function writeCheckpoint(
  ownerUserId: string,
  current: BootstrapCheckpointRecord | null,
  next: Omit<BootstrapCheckpointRecord, 'id'>,
) {
  const table = checkpointTable(ownerUserId);
  const record = checkpointBody(next);
  if (current?.id) {
    const [ok] = await db.update(table, [{ id: current.id, record }]);
    if (!ok) throw new Error('MAIL_PMID_BOOTSTRAP_CHECKPOINT_WRITE_FAILED');
    return;
  }
  const [id] = await db.add(table, [record]);
  if (!id) throw new Error('MAIL_PMID_BOOTSTRAP_CHECKPOINT_WRITE_FAILED');
}

async function accountEmailFor(
  ownerUserId: string,
  mailAccountId: string,
): Promise<string> {
  const [raw] = await db.get<MailAccountBootstrapRow>(ACCOUNTS, [mailAccountId]);
  if (!raw || String(raw.ownerUserId || '') !== ownerUserId) return '';
  return String(raw.email || '').trim().toLowerCase();
}

export async function runMailPmidBootstrapPage(
  ownerUserId: string,
): Promise<{
  processed: number;
  mapped: number;
  skippedDup: number;
  complete: boolean;
  nextToken: string;
}> {
  if (!ownerUserId) throw new Error('MAIL_PMID_BOOTSTRAP_OWNER_REQUIRED');
  const checkpoint = await readCheckpoint(ownerUserId);
  if (checkpoint?.complete) {
    return {
      processed: Math.max(0, Number(checkpoint.processed || 0)),
      mapped: Math.max(0, Number(checkpoint.mapped || 0)),
      skippedDup: Math.max(0, Number(checkpoint.skippedDup || 0)),
      complete: true,
      nextToken: '',
    };
  }
  const previousNextToken = String(checkpoint?.nextToken || '');
  const page = await db.list<MailItemBootstrapRow>(ITEMS, {
    filter: { ownerUserId },
    limit: 50,
    ...(previousNextToken ? { nextToken: previousNextToken } : {}),
  });
  const accountEmailCache = new Map<string, string>();
  const pairsByEmail = new Map<string, Array<[string, string]>>();
  for (const row of page.items) {
    if (String(row.source || '') !== 'provider') continue;
    const mailAccountId = String(row.mailAccountId || '').trim();
    const providerMessageId = String(row.providerMessageId || '').trim();
    const mailItemId = String(row.id || '').trim();
    if (!mailAccountId || !providerMessageId || !mailItemId) continue;
    let accountEmail = accountEmailCache.get(mailAccountId);
    if (accountEmail === undefined) {
      accountEmail = await accountEmailFor(ownerUserId, mailAccountId);
      accountEmailCache.set(mailAccountId, accountEmail);
    }
    if (!accountEmail) continue;
    const pairs = pairsByEmail.get(accountEmail) || [];
    pairs.push([providerMessageId, mailItemId]);
    pairsByEmail.set(accountEmail, pairs);
  }
  let mappedThisPage = 0;
  let skippedDupThisPage = 0;
  for (const [accountEmail, pairs] of pairsByEmail) {
    const result = await writePmidMapForAccount(ownerUserId, accountEmail, pairs);
    mappedThisPage += result.mapped;
    skippedDupThisPage += result.skippedDup;
  }
  const nextToken = String(page.nextToken || '');
  const next = {
    nextToken,
    processed: Math.max(0, Number(checkpoint?.processed || 0)) + page.items.length,
    mapped: Math.max(0, Number(checkpoint?.mapped || 0)) + mappedThisPage,
    skippedDup: Math.max(0, Number(checkpoint?.skippedDup || 0)) + skippedDupThisPage,
    complete: !nextToken,
    updatedAt: Date.now(),
  };
  await writeCheckpoint(ownerUserId, checkpoint, next);
  return {
    processed: next.processed,
    mapped: next.mapped,
    skippedDup: next.skippedDup,
    complete: next.complete,
    nextToken: next.nextToken,
  };
}
