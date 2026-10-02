# Mail Sync Pipeline v1

## 1. State machine

```text
authorization_required
→ connecting
→ initial_sync
→ connected
↘ degraded / reauth_required / error
→ disconnected
```

Status `connected` requires: verified provider identity, encrypted refresh token, active watch/subscription, completed initial sync and valid cursor.

## 2. Provider connection pipeline

1. User explicitly clicks Connect Gmail/Microsoft.
2. Backend validates canonical Mail session and account ownership.
3. Readiness gate checks client configuration, encryption key, callback allowlist and provider policy.
4. Create hashed, expiring provider OAuth state with PKCE and exact scopes.
5. Same-tab or approved popup navigation starts provider consent; no token/proof in URL beyond provider code/state.
6. Callback claims state with processing lease.
7. Exchange code server-side.
8. Verify provider identity matches selected/new account policy.
9. Encrypt refresh token with AES-256-GCM and AAD.
10. Commit account scopes/status and token atomically.
11. Create watch/subscription.
12. Enqueue initial sync.
13. Return to Mail Accounts with truthful progress state.
14. Publish account revision over websocket.

Failure before token commit leaves `authorization_required`; failure after token commit but before sync leaves `degraded`/`initial_sync`, never falsely `connected`.

## 3. Gmail push → UI

```text
Gmail mailbox change
→ Gmail API publishes Pub/Sub message
→ authenticated Pub/Sub push POST
→ validate OIDC JWT audience/issuer/expiry
→ decode envelope and validate emailAddress/historyId
→ dedupe provider messageId
→ resolve owner-scoped mail_account
→ enqueue/coalesce provider.sync.incremental
→ return 2xx

worker claims incremental job
→ refresh access token under account lease
→ users.history.list(startHistoryId=stored cursor)
→ collect added/deleted/label deltas
→ fetch changed messages
→ parse MIME with bounded limits
→ upsert messages, bodies, labels, attachments, threads
→ commit next historyId only after all durable writes
→ enqueue neuro jobs for changed content hash
→ evaluate calm notification threshold
→ publish entity.update revision
→ UI refetches normalized owner-scoped data
```

Push body is not treated as message content. Duplicate or out-of-order notifications are safe because sync starts from persisted cursor and writes are idempotent.

## 4. Gmail initial sync

### 4.1 Preparation

- account status `initial_sync`;
- establish/renew watch first to reduce change gap;
- persist watch expiration/history baseline;
- create one initial-sync job with account idempotency key.

### 4.2 Labels

- fetch labels;
- map provider system/user labels;
- upsert by `(account, provider_label_id)`;
- preserve unknown provider labels instead of dropping them.

### 4.3 Messages

- paginate message IDs using bounded page size;
- checkpoint page token separately from final history cursor;
- fetch message content with concurrency/rate limit;
- normalize headers and addresses;
- parse MIME recursively with depth, part count and decoded-size limits;
- prefer text/plain; sanitize HTML; block remote images;
- record attachment metadata; large attachment bytes are lazy jobs;
- upsert message by provider id;
- associate provider thread;
- map labels;
- update thread counts/latest timestamp.

### 4.4 Completion

- drain pages;
- reconcile deletions only within explicit sync scope;
- commit initial cursor and completed timestamp;
- set account `connected` if watch remains valid;
- enqueue neuro jobs only for changed content hashes;
- publish revision.

Restart safety: the job can repeat a page without duplicate messages because provider IDs and idempotency keys are unique.

## 5. Gmail incremental details

History changes handled:

- `messagesAdded`: fetch and upsert full metadata/content;
- `messagesDeleted`: mark provider deletion/tombstone;
- `labelsAdded`: upsert relation;
- `labelsRemoved`: remove relation;
- changes with only message id: fetch current provider state.

Cursor rules:

- one active lease per account;
- history pages processed in order;
- cursor is not advanced on a failed page;
- final cursor uses authoritative response/history result;
- invalid `startHistoryId` sets recovery flag and schedules bounded rebootstrap;
- periodic fallback runs even with active push.

## 6. Gmail watch lifecycle

- `users.watch` created after consent/token commit;
- expiration persisted;
- daily renewal job;
- urgent renewal when expiration is near;
- `users.stop` on disconnect where appropriate;
- watch error does not delete mailbox data;
- expired watch changes status to degraded and fallback sync continues.

## 7. Microsoft notification → UI

```text
Graph change notification
→ HTTPS webhook
→ validationToken branch returns exact plain text
→ normal branch validates clientState and subscription
→ dedupe notification
→ enqueue account/folder delta job
→ 2xx

worker
→ refresh token
→ follow stored deltaLink
→ page through changes
→ upsert/delete messages and folders
→ persist nextLink while paging
→ commit final deltaLink after durable completion
→ neuro jobs + notifications + websocket revision
```

Subscriptions are renewed before expiration. Lifecycle events trigger reauthorization or subscription recreation as appropriate.

## 8. MIME parser contract

Input is untrusted. Limits:

- maximum raw message bytes;
- maximum MIME depth;
- maximum number of parts;
- maximum decoded part size;
- bounded header count/length;
- charset allowlist/fallback;
- no script execution;
- HTML sanitizer;
- remote images blocked;
- `cid:` references rewritten only to scanned local attachments;
- dangerous filenames normalized;
- archive expansion disabled in ingestion.

Parser result stores warnings. A malformed body does not discard basic sender/subject/date/provider identity.

## 9. Thread builder

Primary key is provider thread/conversation id. Internal builder:

- upserts thread;
- links messages;
- computes latest timestamp, unread/message counts and participants;
- keeps provider semantics;
- does not heuristically merge unrelated provider threads;
- manual-import messages may use a distinct synthetic thread id.

## 10. Label mapper

Internal labels preserve provider identity and expose normalized capabilities:

- inbox;
- unread/read;
- sent;
- draft;
- trash/deleted;
- spam/junk;
- starred/flagged;
- user label/folder/category.

Provider write actions are adapter commands with idempotency and audit. UI triage is separate from provider labels unless the user explicitly enables a mapping rule.

## 11. Attachment pipeline

1. Store metadata during message parse.
2. Policy decides eager vs lazy download.
3. Download worker validates account/message ownership and token.
4. Stream with size limit; compute SHA-256.
5. Store in private object path.
6. Scan/classify; mark clean/blocked/unsupported.
7. UI never exposes bytes before safe status.
8. Disconnect/retention cleanup deletes objects idempotently.

## 12. Neuroinclusive pipeline

### 12.1 Deterministic pass

- noise indicators;
- sender/context extraction;
- dates/action phrases;
- deterministic citation segments;
- conservative triage suggestion;
- content hash.

### 12.2 AI pass

Only on changed, sanitized bounded text:

- system instruction treats email as data, never instructions;
- schema output includes who/what/when/next action, confidence and citation references;
- references must resolve to stored source segments;
- invalid citations reject the artifact;
- output always `requires_review=true`;
- no provider mutation tools are available.

### 12.3 UI projection

- Focus View presents one message;
- low energy exposes reply/task/snooze only;
- silent resume-context persistence stores exact message/thread/panel context without an unsolicited prompt or rail;
- Action/Waiting/Info/Later remains user-correctable;
- soft reminders use calm thresholds;
- no red backlog counters.

## 13. Send pipeline

```text
user edits draft
→ save local/provider draft
→ POST send/prepare
→ validate recipients, account capability, draft revision
→ render exact preview and compute payload hash
→ create short-lived prepared command
→ UI asks explicit confirmation
→ POST send/confirm with command id + confirmation token/hash
→ claim command once
→ provider send with idempotency strategy
→ reconcile provider result
→ store sent message/thread update
→ audit and publish revision
```

A timeout after provider call is ambiguous: worker checks provider message/idempotency evidence before retry. No automatic send from AI, reminder, background queue or low-energy shortcut.

## 14. Retry and rate-limit policy

- provider-specific classification (`401`, `403`, `404 cursor`, `409`, `429`, `5xx`);
- exponential backoff + jitter;
- honor Retry-After;
- account-level concurrency caps;
- token refresh lock;
- separate cheap sync from AI enrichment;
- stale UI remains readable during provider outage;
- dead-letter records retain safe error code, not message content or token.

## 15. Recovery matrix

| Failure | Recovery |
|---|---|
| Duplicate webhook | Dedupe and return success |
| Dropped Gmail push | Periodic history fallback |
| Invalid Gmail history cursor | Recovery initial sync |
| Expired Graph deltaLink | Folder-scoped rebootstrap |
| Revoked refresh token | `reauth_required` |
| Watch/subscription expired | Recreate; retain data |
| MIME parse failure | Metadata-only record + warning |
| AI unavailable | Deterministic cited summary remains |
| Queue worker crash | Lease expiry and retry |
| Send uncertain | Provider reconciliation, no blind retry |
| Disconnect | Stop subscription, revoke/delete token, cleanup jobs |

## 16. Observability

Per account:

- last push and last fallback sync;
- watch/subscription expiration;
- cursor age;
- queue depth/retries/dead jobs;
- messages changed;
- parse warnings;
- token refresh result;
- rate-limit state;
- websocket revision;
- notification eligibility counts without punitive user-facing language.

Operational metrics are separated from compassionate UI copy.
