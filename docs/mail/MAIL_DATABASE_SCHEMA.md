> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./MAIL_DATABASE_SCHEMA.uk.md) · [🇳🇱 **Nederlandse versie**](./MAIL_DATABASE_SCHEMA.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Mail Database Schema v1

## 1. Scope

Це production-target PostgreSQL schema. Вона є нормативною моделлю для identity, constraints, indexes, owner scoping, idempotency і retention. Поточні AppDeploy `mail_*_v1` tables є compatibility foundation і не оголошуються еквівалентними SQL-транзакціям.

## 2. Extensions and enums

```sql
create extension if not exists pgcrypto;

create type mail_provider as enum ('google_gmail','microsoft_graph');
create type mail_account_status as enum (
  'authorization_required','connecting','initial_sync','connected',
  'degraded','reauth_required','revoked','disconnected','error'
);
create type mail_job_status as enum ('queued','leased','retry','succeeded','dead');
create type mail_triage_state as enum ('action','waiting','info','later');
create type mail_command_status as enum ('prepared','confirmed','executing','succeeded','failed','cancelled','expired');
create type mail_source_type as enum ('provider','manual','qa');
```

## 3. Core accounts and token vault

```sql
create table mail_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  workspace_id uuid null,
  provider mail_provider not null,
  provider_account_id text not null,
  email citext not null,
  display_name text not null default '',
  primary_account boolean not null default false,
  identity_linked boolean not null default false,
  status mail_account_status not null default 'authorization_required',
  granted_scopes text[] not null default '{}',
  provider_profile jsonb not null default '{}',
  last_successful_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, provider, provider_account_id),
  unique(owner_user_id, provider, email)
);
create index mail_accounts_owner_status_idx on mail_accounts(owner_user_id,status,updated_at desc);
create unique index mail_accounts_one_primary_idx on mail_accounts(owner_user_id) where primary_account and disconnected_at is null;

create table mail_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider mail_provider not null,
  token_kind text not null check (token_kind in ('refresh_token','access_token_cache')),
  ciphertext bytea not null,
  iv bytea not null check (octet_length(iv)=12),
  auth_tag bytea not null,
  algorithm text not null default 'AES-256-GCM',
  key_version integer not null,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,token_kind)
);
create index mail_oauth_tokens_owner_account_idx on mail_oauth_tokens(owner_user_id,mail_account_id);

create table mail_oauth_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid references mail_accounts(id) on delete cascade,
  provider mail_provider not null,
  state_hash bytea not null unique,
  pkce_verifier_ciphertext bytea,
  pkce_iv bytea,
  pkce_auth_tag bytea,
  source_origin text not null,
  safe_return_path text not null,
  locale text not null check (locale in ('uk','nl')),
  requested_scopes text[] not null,
  status text not null check(status in ('pending','processing','complete','failed','cancelled')),
  processing_lease_until timestamptz,
  failure_code text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index mail_oauth_states_expiry_idx on mail_oauth_states(status,expires_at);
```

## 4. Provider subscriptions and cursors

```sql
create table mail_provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider mail_provider not null,
  provider_subscription_id text,
  topic_or_resource text not null,
  client_state_hash bytea,
  audience text,
  status text not null check(status in ('creating','active','renewing','expired','stopped','error')),
  expires_at timestamptz,
  last_notification_at timestamptz,
  last_renewed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,topic_or_resource)
);
create index mail_provider_subscriptions_renew_idx on mail_provider_subscriptions(status,expires_at);

create table mail_sync_state (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider mail_provider not null,
  resource_key text not null default 'mailbox',
  cursor text,
  cursor_version bigint not null default 0,
  initial_sync_completed_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  recovery_required boolean not null default false,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,resource_key)
);
create index mail_sync_state_due_idx on mail_sync_state(recovery_required,last_success_at);
```

## 5. Messages, bodies, threads and labels

```sql
create table mail_threads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider_thread_id text not null,
  subject_normalized text not null default '',
  participants jsonb not null default '[]',
  message_count integer not null default 0,
  unread_count integer not null default 0,
  latest_message_at timestamptz,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,provider_thread_id)
);
create index mail_threads_owner_latest_idx on mail_threads(owner_user_id,mail_account_id,latest_message_at desc) where deleted_at is null;

create table mail_messages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  thread_id uuid references mail_threads(id) on delete set null,
  source_type mail_source_type not null,
  provider_message_id text,
  provider_thread_id text,
  internet_message_id text,
  subject text not null default '',
  sender jsonb not null default '{}',
  recipients jsonb not null default '{}',
  reply_to jsonb not null default '[]',
  headers jsonb not null default '{}',
  snippet text not null default '',
  received_at timestamptz not null,
  sent_at timestamptz,
  size_bytes bigint not null default 0,
  is_unread boolean not null default false,
  is_draft boolean not null default false,
  is_sent boolean not null default false,
  has_attachments boolean not null default false,
  provider_etag text,
  content_hash bytea,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,provider_message_id)
);
create index mail_messages_account_received_idx on mail_messages(owner_user_id,mail_account_id,received_at desc) where deleted_at is null;
create index mail_messages_thread_idx on mail_messages(thread_id,received_at);
create index mail_messages_unread_idx on mail_messages(owner_user_id,mail_account_id,is_unread,received_at desc) where deleted_at is null;
create index mail_messages_internet_id_idx on mail_messages(mail_account_id,internet_message_id) where internet_message_id is not null;

create table mail_message_bodies (
  message_id uuid primary key references mail_messages(id) on delete cascade,
  owner_user_id uuid not null,
  plain_text text not null default '',
  sanitized_html text not null default '',
  body_storage_path text,
  mime_structure jsonb not null default '{}',
  remote_images_blocked boolean not null default true,
  parser_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mail_labels (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider_label_id text not null,
  name text not null,
  kind text not null check(kind in ('system','user','folder','category')),
  color jsonb,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,provider_label_id)
);
create index mail_labels_owner_idx on mail_labels(owner_user_id,mail_account_id,name);

create table mail_message_labels (
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  message_id uuid not null references mail_messages(id) on delete cascade,
  label_id uuid not null references mail_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id,label_id)
);
create index mail_message_labels_label_idx on mail_message_labels(label_id,message_id);
```

## 6. Attachments

```sql
create table mail_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  message_id uuid not null references mail_messages(id) on delete cascade,
  provider_attachment_id text not null,
  filename text not null default '',
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  content_hash bytea,
  storage_path text,
  download_status text not null check(download_status in ('metadata_only','queued','downloaded','failed','deleted')),
  scan_status text not null check(scan_status in ('pending','clean','blocked','unsupported','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mail_account_id,provider_attachment_id)
);
create index mail_attachments_message_idx on mail_attachments(message_id);
create index mail_attachments_scan_idx on mail_attachments(scan_status,download_status);
```

## 7. Queue, webhook dedupe and attempts

```sql
create table mail_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider mail_provider not null,
  provider_event_id text not null,
  mail_account_id uuid references mail_accounts(id) on delete cascade,
  payload_hash bytea not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null check(status in ('accepted','duplicate','rejected','processed','failed')),
  error_code text,
  unique(provider,provider_event_id)
);
create index mail_webhook_events_processing_idx on mail_webhook_events(status,received_at);

create table mail_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid references mail_accounts(id) on delete cascade,
  type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  priority integer not null default 100,
  status mail_job_status not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index mail_jobs_claim_idx on mail_jobs(status,priority,available_at) where status in ('queued','retry');
create index mail_jobs_account_idx on mail_jobs(mail_account_id,created_at desc);

create table mail_job_attempts (
  id bigserial primary key,
  job_id uuid not null references mail_jobs(id) on delete cascade,
  attempt integer not null,
  worker_id text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  result text,
  error_code text,
  metrics jsonb not null default '{}',
  unique(job_id,attempt)
);
```

## 8. Neuroinclusive state and AI provenance

```sql
create table mail_triage (
  message_id uuid primary key references mail_messages(id) on delete cascade,
  owner_user_id uuid not null,
  state mail_triage_state not null,
  suggested_state mail_triage_state not null,
  confirmed boolean not null default false,
  noise boolean not null default false,
  next_action text not null default '',
  snoozed_until timestamptz,
  first_opened_at timestamptz,
  first_action_at timestamptz,
  updated_at timestamptz not null default now()
);
create index mail_triage_queue_idx on mail_triage(owner_user_id,state,snoozed_until,updated_at desc);

create table mail_ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  message_id uuid references mail_messages(id) on delete cascade,
  thread_id uuid references mail_threads(id) on delete cascade,
  kind text not null check(kind in ('summary','next_action','reply_draft','classification')),
  source_hash bytea not null,
  model_provider text not null,
  model_name text not null,
  prompt_version text not null,
  output jsonb not null,
  confidence numeric(5,4),
  requires_review boolean not null default true,
  status text not null check(status in ('valid','stale','rejected','failed')),
  created_at timestamptz not null default now()
);
create index mail_ai_artifacts_source_idx on mail_ai_artifacts(message_id,kind,created_at desc);

create table mail_ai_citations (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references mail_ai_artifacts(id) on delete cascade,
  message_id uuid not null references mail_messages(id) on delete cascade,
  part_path text not null,
  start_offset integer,
  end_offset integer,
  excerpt text not null,
  excerpt_hash bytea not null,
  ordinal integer not null,
  unique(artifact_id,ordinal)
);

create table mail_resume_state (
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  current_message_id uuid references mail_messages(id) on delete set null,
  current_thread_id uuid references mail_threads(id) on delete set null,
  focus boolean not null default false,
  energy text not null check(energy in ('low','medium','high')),
  panel_state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key(owner_user_id,mail_account_id)
);

create table mail_notification_preferences (
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  minimum_triage text not null check(minimum_triage in ('all','info','waiting','action','none')),
  batching_mode text not null default 'calm',
  quiet_hours jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key(owner_user_id,mail_account_id)
);
```

## 9. Draft and send command model

```sql
create table mail_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider_draft_id text,
  reply_to_message_id uuid references mail_messages(id) on delete set null,
  recipients jsonb not null,
  subject text not null,
  plain_text text not null,
  sanitized_html text not null default '',
  style text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mail_outbox_commands (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  draft_id uuid references mail_drafts(id) on delete set null,
  idempotency_key text not null unique,
  payload_hash bytea not null,
  confirmation_hash bytea,
  status mail_command_status not null default 'prepared',
  prepared_at timestamptz not null default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz not null,
  provider_message_id text,
  error_code text,
  audit_context jsonb not null default '{}'
);
create index mail_outbox_commands_owner_status_idx on mail_outbox_commands(owner_user_id,status,prepared_at desc);
```

## 10. Audit and retention

```sql
create table mail_audit_log (
  id bigserial primary key,
  owner_user_id uuid not null,
  mail_account_id uuid references mail_accounts(id) on delete set null,
  actor_user_id uuid not null,
  action text not null,
  result text not null,
  target_type text,
  target_id text,
  safe_details jsonb not null default '{}',
  previous_hash bytea,
  entry_hash bytea not null,
  created_at timestamptz not null default now()
);
create index mail_audit_owner_time_idx on mail_audit_log(owner_user_id,created_at desc);
```

Retention is policy-driven. Token records are deleted immediately on disconnect; webhook payloads are short-lived; message bodies/attachments follow owner retention/export/delete policy. Audit stores no token, cookie, raw authorization header, full body or attachment content.

## 11. Owner-scoping query rule

Every protected query includes both owner and resource identity:

```sql
select * from mail_messages
where owner_user_id = :actor_owner
  and mail_account_id = :account_id
  and deleted_at is null;
```

Resource ID alone is never authorization. Foreign keys prevent orphaned records; service authorization still validates owner/workspace membership before SQL execution.

## 12. AppDeploy compatibility mapping

Current tables:

- `mail_accounts_v1` → preliminary `mail_accounts`
- `mail_items_v1` → manual/QA subset of `mail_messages + bodies + triage`
- `mail_resume_v1` → preliminary `mail_resume_state`
- `mail_metrics_v1` → product analytics projection
- `mail_notification_preferences_v1` → preliminary owner-level preference

Future bounded foundation tables may use `_v2` names, but migration must be dual-read/dual-write with evidence and rollback. No existing record is deleted merely because target SQL schema is documented.
