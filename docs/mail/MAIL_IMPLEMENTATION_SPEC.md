# Mail Platform Technical Specification v1

## 1. Status vocabulary

- `confirmed`: supported by applied source/control-plane evidence.
- `partial`: implementation exists but external/browser evidence incomplete.
- `unverified`: target or configuration not yet exercised.
- `blocked`: required external configuration/security gate absent.
- `deprecated`: retained only for rollback/migration.

Current baseline:

- Mail Phase 1 manual/QA UI: confirmed.
- M-110 provider registry/readiness, AES-256-GCM envelope self-tests and owner-scoped empty unified read facade: confirmed.
- Authenticated Gmail Pub/Sub ingress, dedupe/coalescing, token refresh, watch renewal, bounded initial/history read sync and provider-to-Inbox projection: implemented behind runtime and external-endpoint gates; not externally exercised.
- Durable external scheduler and provider data ingestion: not active.
- Google mailbox OAuth state/PKCE/offline-consent/callback/token-commit source path: implemented behind fail-closed production gates; external consent not yet exercised.
- Owner-scoped Gmail label mutation and explicit two-phase send command source paths: implemented behind connected-runtime gates; provider write behavior not externally exercised.
- Microsoft Graph OAuth, encrypted refresh-token commit, mailbox `/me` verification, webhook validation/clientState, delta-link sync and provider-dispatched labels/send: implemented behind fail-closed external/runtime gates; not externally exercised.
- Provider-specific runtime/scope dispatch, disconnect/revocation, token/subscription cleanup, sync health, stale-lease recovery, maintenance scheduling contract and manual/provider migration inventory: implemented. Legacy manual/QA records are retained until real-provider acceptance.
- Provider token vault: not active.
- Gmail watch/Pub/Sub: not active.
- Microsoft Graph webhooks/delta: not active.
- High-risk send: disabled.

## 2. Work packages

### M-100 Architecture and contracts

Deliverables:

- platform architecture;
- database schema;
- sync pipeline;
- provider/security contracts;
- implementation plan and acceptance gates;
- blocking build audit.

Acceptance:

- docs exist in repository;
- release manifest truthfully says provider runtime inactive;
- rollback points to previous applied version;
- no auth/session/UI behavior changes;
- build/E2E terminal evidence recorded.

### M-110 Mail provider foundation

Deliverables:

- provider registry types;
- account status model;
- secret/readiness evaluator;
- AES-256-GCM token envelope helper with deterministic self-tests;
- owner-scoped queue record and idempotency helper;
- unified read API facade over current data;
- admin/system truth readiness surface.

Acceptance:

- missing encryption secret fails closed;
- no raw token appears in DB/public response/audit;
- owner A cannot read owner B account/message;
- duplicate job idempotency key produces one logical job;
- current manual Phase 1 remains functional;
- provider status is never connected without a token/subscription/sync proof.

### M-120 Google mailbox OAuth

Deliverables:

- separate provider OAuth state, not identity state;
- exact Gmail scopes;
- PKCE, state, safe return, offline access;
- server-side code exchange;
- provider profile verification;
- encrypted refresh token persistence;
- scope persistence;
- revoke/disconnect;
- button wired from Mail Accounts.

Acceptance:

- explicit user click is the only start trigger;
- one click creates one state;
- callback replay is idempotent;
- state mismatch/expiry/wrong owner rejected;
- refresh token encrypted with valid GCM tag/AAD;
- browser receives no token;
- consent denial leaves authorization required;
- real Chrome consent and return accepted by owner;
- Google restricted-scope verification status documented.

External prerequisites:

- OAuth client allows exact callback;
- consent screen/scopes configured;
- restricted-scope verification/security assessment as required;
- `MAIL_TOKEN_ENCRYPTION_KEY_V1` configured.

### M-130 Gmail watch and Pub/Sub

Deliverables:

- topic/subscription configuration records;
- authenticated push endpoint;
- JWT audience/issuer validation;
- Pub/Sub message dedupe;
- `users.watch` creation/renewal/stop;
- daily renew cron;
- fallback sync cron;
- health/readiness status.

Acceptance:

- spoofed/unsigned/wrong-audience push rejected;
- valid test push queues one coalesced account job;
- duplicate messageId is no-op;
- webhook handler performs no mailbox fetch inline;
- watch expiration persisted and renewed;
- push gap recovered by fallback;
- real Google Pub/Sub delivery observed.

External prerequisites:

- Google Cloud project/topic;
- Gmail publisher service account permission;
- authenticated push subscription and audience;
- AppDeploy/custom-domain external POST route verified.

### M-140 Gmail sync workers

Deliverables:

- token refresh lease;
- label sync;
- initial message pagination;
- incremental history sync;
- MIME parser;
- message/thread/label upsert;
- attachment metadata/download;
- recovery cursor reset;
- websocket revision.

Acceptance:

- restart during a page is idempotent;
- cursor advances only after commit;
- duplicate provider IDs do not duplicate records;
- label add/remove and deletion reflected;
- malformed MIME does not crash account sync;
- invalid history cursor triggers bounded recovery;
- owner scoping negative tests pass;
- UI receives a real message without manual import.

### M-150 Unified Mail API

Normative operations:

- list accounts;
- list/get messages;
- list/get threads;
- list labels;
- modify provider labels/read state;
- save draft;
- send prepare/confirm;
- disconnect;
- sync health.

Acceptance:

- pagination cursors opaque and owner-bound;
- account IDs cannot cross owners;
- query filters bounded/allowlisted;
- mutations idempotent and audited;
- send requires explicit short-lived confirmation;
- API errors use stable reason codes and never expose provider tokens.

### M-160 Real-data Inbox Functional

Deliverables:

- current Phase 1 maps to canonical real messages/threads;
- Focus View, four-state triage, cited Trust Layer and silent resume-context persistence operate on provider data;
- manual source remains visibly distinct;
- websocket refresh;
- energy-aware projection;
- calm notification eligibility.

Acceptance:

- provider subject/body/source citations match original;
- current account context is stable across refresh/switch;
- no layout shift introduced;
- low-energy view exposes no more than three primary actions;
- no punitive counters/copy;
- AI absence degrades to deterministic cited output;
- external content cannot cause a tool/send action.

### M-170 Microsoft Graph

Deliverables:

- Microsoft app registration configuration;
- OAuth/PKCE/offline token vault;
- `/me` identity verification;
- folder/message delta;
- webhook/clientState/lifecycle validation;
- renewal;
- Graph send/label-folder mappings;
- disconnect.

Acceptance mirrors Google security/owner/idempotency gates plus real Graph webhook and delta evidence.

### M-180 Cleanup and migration

Deliverables:

- migration plan for `mail_items_v1` manual records;
- compatibility reads;
- feature flags;
- dead code inventory;
- retention/export/delete;
- rollback rehearsal.

Acceptance:

- no data loss;
- manual records remain distinguishable;
- old routes removed only after usage/evidence audit;
- rollback restores previous code without corrupting new records.

## 3. API contract

### Accounts

```text
GET /mail/accounts
POST /mail/accounts/{id}/connect
POST /mail/accounts/{id}/disconnect
GET /mail/accounts/{id}/sync-health
```

Account response contains safe capability status only:

- id/provider/email/display name;
- granted scope names;
- status;
- last sync;
- watch/subscription expiry;
- reauth/error reason code;
- never token/ciphertext/IV/tag.

### Messages and threads

```text
GET /mail/{accountId}/messages?cursor=&triage=&label=&unread=
GET /mail/{accountId}/messages/{messageId}
GET /mail/{accountId}/threads?cursor=
GET /mail/{accountId}/threads/{threadId}
```

Pagination cursor is signed/opaque and includes owner/account/filter fingerprint.

### Labels

```text
POST /mail/{accountId}/labels
{
  "messageIds": ["..."],
  "add": ["..."],
  "remove": ["..."],
  "idempotencyKey": "..."
}
```

### Send

Normative safe flow:

```text
POST /mail/{accountId}/send/prepare
POST /mail/{accountId}/send/confirm
```

The requested single endpoint `/mail/{accountId}/send` may be exposed as a facade, but it must reject calls lacking a valid prepared command and explicit confirmation. AI cannot supply confirmation.

## 4. Provider registry interface

```ts
interface MailProviderAdapter {
  provider: 'google_gmail' | 'microsoft_graph';
  authorizationUrl(input: ProviderAuthorizationInput): Promise<ProviderAuthorizationResult>;
  exchangeCode(input: ProviderCallbackInput): Promise<ProviderTokenSet>;
  refreshToken(input: RefreshInput): Promise<ProviderAccessToken>;
  verifyMailbox(accessToken: string): Promise<ProviderMailboxIdentity>;
  createSubscription(ctx: ProviderContext): Promise<ProviderSubscription>;
  renewSubscription(ctx: ProviderContext): Promise<ProviderSubscription>;
  stopSubscription(ctx: ProviderContext): Promise<void>;
  initialSync(ctx: SyncContext): Promise<SyncPage>;
  incrementalSync(ctx: SyncContext): Promise<SyncPage>;
  fetchMessage(ctx: MessageFetchContext): Promise<ProviderMessage>;
  fetchAttachment(ctx: AttachmentFetchContext): Promise<ProviderAttachmentStream>;
  applyLabels(ctx: LabelMutationContext): Promise<ProviderMutationResult>;
  send(ctx: SendContext): Promise<ProviderSendResult>;
  revoke(ctx: ProviderContext): Promise<void>;
}
```

Adapters return provider-neutral values and stable error classification; they do not write UI state directly.

## 5. Security acceptance suite

Required negative tests:

- wrong owner/account id;
- missing canonical Mail session;
- OAuth state replay/expiry/tamper;
- wrong callback origin/return path;
- missing/invalid encryption key;
- GCM AAD mismatch;
- refresh concurrency race;
- spoofed Pub/Sub JWT;
- wrong Graph clientState;
- duplicate webhook event;
- invalid cursor recovery;
- MIME depth/size overflow;
- HTML script/remote image sanitization;
- attachment size/type/hash mismatch;
- prompt injection asking AI to send/reveal secrets;
- send without confirmation;
- duplicate send confirmation;
- disconnect during queued sync.

## 6. Test matrix

1. First Gmail connection success/cancel/denied.
2. Existing identity account still requires mailbox consent.
3. Two Gmail accounts for one owner.
4. Same provider email cannot be duplicated.
5. Owner A cannot access Owner B account/message/token/job.
6. Initial sync pages and resumes after worker restart.
7. Gmail push duplicate, gap, invalid history cursor.
8. Watch renewal and expiration.
9. Broken MIME and large attachment.
10. Thread and label reconciliation.
11. Focus View on real Gmail data.
12. Citation links resolve to original source segments.
13. Low/medium/high energy projections.
14. Resume after F5 and service navigation.
15. Draft save vs explicit send confirmation.
16. Provider 429/5xx/backoff/dead letter.
17. Disconnect and reauth.
18. Microsoft validation token/clientState/delta/subscription renewal.
19. Mobile 375×667 and desktop 1280×800.
20. FE/BE/network logs clean after full E2E.

## 7. Chrome acceptance checklist per provider release

- hard refresh Mail Accounts;
- connect from one explicit click;
- inspect exact consent scopes;
- cancel and retry;
- return to same Mail account context;
- verify no token/code remains in URL/storage;
- verify account progress status;
- receive a real test email;
- observe UI update without manual import;
- F5 and silent resume-context restoration without an unsolicited prompt;
- switch account and confirm isolation;
- disconnect and verify sync stops;
- repeat in narrow viewport;
- check Network/Console and provider dashboard delivery evidence.

## 8. Rollout gates

- Feature flags per provider/account.
- Foundation → owner canary → bounded real mailbox → wider activation.
- Each slice has direct rollback Version ID.
- Database migrations are forward-compatible and reversible where possible.
- Provider write/send remains disabled until read sync and isolation evidence pass.
- Microsoft starts only after Google read/sync path is stable unless isolated behind an independent flag.

## 9. Current blockers before live Gmail

- dedicated mailbox encryption secret;
- exact Google consent/restricted-scope verification state;
- Pub/Sub project/topic/subscription and authenticated push audience;
- externally reachable push route evidence;
- production-grade durable DB/queue equivalence or managed infrastructure;
- owner Chrome acceptance.

These blockers do not prevent implementation of pure contracts, token-envelope tests, owner-scoped queue foundation and truthful readiness APIs. They do prevent an honest `connected` claim.
