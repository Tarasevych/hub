> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./MAIL_PLATFORM_ARCHITECTURE.uk.md) · [🇳🇱 **Nederlandse versie**](./MAIL_PLATFORM_ARCHITECTURE.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Mail Platform Architecture v1

## 1. Мета і межа

Цей документ визначає production-target архітектуру реальної поштової платформи `mail.tarasevych.com`, інтегрованої з canonical identity/session model. Поточний Mail Phase 1 залишається чесним manual/QA контуром. Цей реліз не активує Gmail або Microsoft OAuth, не зберігає provider tokens і не оголошує push/sync під'єднаними.

Основна продуктова модель — **Inbox Functional**: система зменшує виконавче тертя, а не вимагає Inbox Zero. Синхронізація постачає достовірні provider-дані; нейроінклюзивний шар перетворює їх на одну найближчу дію, cited summary, silent resume-context persistence і energy-aware інтерфейс.

## 2. Архітектурні інваріанти

1. Canonical ecosystem session і mailbox authorization — різні capabilities. Вхід через Google Identity не означає доступ до Gmail.
2. Кожний mailbox record має `owner_user_id`; provider payload не може визначати owner.
3. Refresh tokens зберігаються лише server-side у AES-256-GCM envelope; access tokens не потрапляють у browser storage, URL, logs або audit details.
4. Provider callback state — single-use, короткоживучий, прив’язаний до owner, mail account, provider, initiating service, locale і safe return path.
5. Webhook/push — лише сигнал. Авторитетний стан отримується через Gmail History або Microsoft Delta.
6. Кожна ingestion і mutation операція має idempotency key.
7. Sync cursor просувається лише після durable commit усіх пов’язаних змін.
8. High-risk send виконується лише через prepare → explicit confirm → commit, з idempotency та audit.
9. External email HTML, attachments і AI output є untrusted.
10. AI не виконує інструкції з листа, не надсилає листи й не приховує джерело.
11. Cited summary зберігає provenance до конкретних message parts/excerpts.
12. Low-energy mode зменшує кількість рішень; він не є просто темою.
13. Жодних каральних unread/overdue/missed формулювань.
14. Manual import залишається окремим source type до окремого migration gate; він не змішується з provider truth.

## 3. Компоненти

### 3.1 Canonical Mail API

Owner-scoped facade над provider adapters:

- accounts і connection status;
- messages/threads/labels;
- draft/send command lifecycle;
- sync health;
- neuroinclusive state;
- websocket entity updates.

Public product contract:

- `GET /mail/accounts`
- `GET /mail/{accountId}/messages`
- `GET /mail/{accountId}/threads`
- `POST /mail/{accountId}/send`
- `POST /mail/{accountId}/labels`

У чинному AppDeploy runtime owner session context передається через canonical POST body. Тому adapter routes можуть тимчасово мати форму `/api/owner/mail/...` без зміни продуктового контракту. GET facade вводиться лише після доведення безпечного session-context resolution для GET.

### 3.2 Provider registry

Один registry описує `google_gmail` і `microsoft_graph`:

- scopes;
- OAuth endpoints;
- identity/profile resolver;
- token refresh;
- watch/subscription lifecycle;
- initial sync;
- incremental sync;
- message/thread/label normalization;
- send/modify capabilities;
- provider rate-limit classifier;
- disconnect/revoke.

Provider-specific код не викликається без capability state `configured` і active account grant.

### 3.3 Token vault

Envelope format:

- `ciphertext`;
- 12-byte random `iv`;
- GCM `auth_tag`;
- `key_version`;
- `algorithm = AES-256-GCM`;
- AAD: `owner_user_id | mail_account_id | provider | token_kind`.

`MAIL_TOKEN_ENCRYPTION_KEY_V1` зберігається як AppDeploy secret або KMS-backed key. Відсутній/невалідний ключ блокує provider connection. Token refresh використовує account-level lease, rotation і compare-before-write.

### 3.4 Push ingress

#### Gmail

Google Pub/Sub authenticated push endpoint:

- перевіряє OIDC bearer JWT issuer/audience/expiry;
- перевіряє allowlisted subscription/topic identity;
- декодує Pub/Sub envelope;
- дедуплікує `messageId`;
- звіряє `emailAddress` з connected account;
- створює coalesced incremental-sync job;
- відповідає швидко, без provider fetch у request path.

#### Microsoft

Graph webhook endpoint:

- повертає validation token як plain text під час creation validation;
- перевіряє `clientState` constant-time;
- дедуплікує notification identity;
- підтримує lifecycle notifications;
- ставить delta-sync job, не завантажує mailbox у webhook request.

### 3.5 Durable queue і workers

Job types:

- `token.refresh`
- `provider.watch.renew`
- `provider.webhook.ingest`
- `provider.sync.initial`
- `provider.sync.incremental`
- `provider.message.fetch`
- `provider.attachment.fetch`
- `provider.labels.sync`
- `provider.thread.rebuild`
- `neuro.triage`
- `neuro.summary`
- `notification.evaluate`
- `send.prepare`
- `send.commit`
- `provider.disconnect.cleanup`

Кожний job має idempotency key, lease, attempt count, exponential backoff з jitter, `available_at`, terminal status і dead-letter reason. Gmail events coalesce per account because notification rate is bounded and events can be dropped. Periodic fallback sync is mandatory.

### 3.6 Storage

- Metadata, cursors, commands, triage, citations: relational database.
- Sanitized plain text і bounded HTML: database або compressed object storage за size policy.
- Attachments: private object storage, owner/account/message path, content hash, malware-scan state.
- Provider raw payload: короткий encrypted/debug retention лише за explicit policy; default — normalized fields, не довічний raw archive.

### 3.7 Realtime UI update

1. Initial HTTP bootstrap.
2. Frontend створює AppDeploy WS connection.
3. Підписується на `mail_account:{accountId}` або owner-level mail feed.
4. Worker після commit надсилає `entity.update` з revision/cursor, не full sensitive payload.
5. Frontend invalidates/refetches owner-scoped API або застосовує bounded normalized delta.
6. Unsubscribe при виході з Mail view; socket не перебудовується на кожній вкладці.

## 4. Google adapter

### 4.1 Consent

Mailbox OAuth є окремою incremental authorization transaction. Target scope contract:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.labels`

`gmail.modify` перекриває значну частину read capability, але runtime не скорочує заданий користувачем scope contract без окремого consent/verification рішення. Restricted scopes потребують Google verification і, залежно від deployment, security assessment.

Authorization використовує offline access; refresh token absence після повторного consent не стирає чинний token. Provider mailbox identity підтверджується через Gmail profile перед activation.

### 4.2 Watch

Після token commit:

1. створити/оновити account;
2. виконати labels bootstrap;
3. викликати Gmail `users.watch`;
4. зберегти returned `historyId` і expiration;
5. поставити initial sync;
6. поновлювати watch щодня й обов’язково до expiration;
7. мати periodic history fallback.

### 4.3 Initial sync

- labels list;
- paginated messages list за bounded policy;
- fetch message metadata/full MIME;
- normalize headers, body parts, attachments;
- upsert messages;
- build thread membership;
- map labels;
- queue attachment downloads according to policy;
- commit initial cursor;
- enqueue triage/summary only for new/changed content.

### 4.4 Incremental sync

- read stored history cursor;
- call history list;
- apply messages added/deleted and labels added/removed;
- fetch changed messages;
- commit changes and next cursor atomically;
- on invalid/expired cursor perform bounded recovery bootstrap;
- never advance cursor after partial failure.

## 5. Microsoft adapter

- Authorization Code + PKCE + offline access.
- Delegated scopes: `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`.
- Resolve mailbox identity via Graph `/me`.
- Initial sync uses folder inventory plus paginated messages/delta.
- Persist delta links per account/folder.
- Webhook notification schedules delta sync.
- Renew subscriptions before expiration; handle lifecycle events.
- Thread mapping uses Graph conversation identifiers but preserves provider message identity.

## 6. Neuroinclusive processing boundary

Pipeline after normalized message commit:

1. deterministic noise/risk/header extraction;
2. four-class triage suggestion (`action`, `waiting`, `info`, `later`);
3. source segmentation and citation anchors;
4. optional AI summary against sanitized untrusted text;
5. validate output schema and citation references;
6. store confidence, model/version, source hash and review-required flag;
7. derive one next step;
8. evaluate calm notification threshold;
9. publish UI revision.

Low energy: максимум 2–3 safe options, no batch pressure. Medium: summary, draft, rationale. High: backlog rescue, rules and batching. AI never calls send/label provider tools directly.

## 7. Security and privacy

- least privilege and explicit mailbox consent;
- provider token encryption and key rotation;
- webhook JWT/clientState validation;
- account/owner scoping on every read/write;
- HTML sanitization and remote-image blocking by default;
- MIME depth/size limits and zip-bomb protections;
- attachment type/size allowlist and malware status;
- prompt-injection isolation;
- log redaction;
- immutable audit for connect, refresh, scope change, sync, label mutation, draft and send;
- disconnect revokes provider token where supported, stops watch/subscription, deletes local tokens, and schedules retention cleanup;
- privacy export/delete path.

## 8. AppDeploy capability boundary

AppDeploy DB is suitable for current control-plane and bounded foundation records, but it does not by itself prove SQL uniqueness, foreign keys, transactional cursor+message commits, high-throughput durable queues or production mailbox scale. Production target therefore requires either:

- a managed relational database + durable queue/object storage; or
- an explicitly verified AppDeploy implementation providing equivalent idempotency, leases and recovery guarantees.

Until that evidence exists, UI status remains `not_connected`/`foundation_only`, not `production_ready`.

## 9. Failure modes

- missing encryption key → connection blocked;
- consent denied → account remains authorization required;
- refresh revoked → status `reauth_required`, no destructive cleanup;
- rate limit → retry with provider-aware backoff;
- invalid history/delta cursor → bounded recovery sync;
- webhook duplicates → idempotent no-op;
- push gap → periodic fallback catches up;
- malformed MIME → quarantine parsing result, preserve provider metadata;
- attachment scan failure → unavailable, never auto-open;
- send ambiguity → idempotency lookup before retry;
- provider disconnect → stop renewals and sync immediately.

## 10. Definition of Done

A provider is `connected` only when consent, encrypted refresh-token persistence, mailbox identity verification, watch/subscription creation, initial sync, incremental fallback and disconnect tests have passed. Automated tests do not replace real Chrome OAuth acceptance or cloud webhook evidence.
