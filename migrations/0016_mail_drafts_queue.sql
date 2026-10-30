-- 0016: serverkant van het opstellen van mail: concepten (eerst lokaal in PostgreSQL, daarna naar Gmail gesynchroniseerd) en de wachtrij voor
-- uitgestelde verzending (status scheduled -> sending -> sent / failed / cancelled). Zoals bij 0010/0012/0015: alleen de systeemrol benadert de
-- tabellen, de routes filteren zelf op user_id; RLS staat aan als tweede laag en mijnruimte_app krijgt GEEN rechten.

CREATE TABLE IF NOT EXISTS app.mail_drafts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL,
  local_id       text        NOT NULL,                       -- stabiele id die de browser kiest (overleeft een herlaad en andere apparaten)
  account_id     text        NOT NULL DEFAULT '',
  thread_id      text        NOT NULL DEFAULT '',
  to_addrs       text        NOT NULL DEFAULT '',
  cc_addrs       text        NOT NULL DEFAULT '',
  bcc_addrs      text        NOT NULL DEFAULT '',
  subject        text        NOT NULL DEFAULT '',
  html           text        NOT NULL DEFAULT '',
  plain_text     text        NOT NULL DEFAULT '',
  gmail_draft_id text        NOT NULL DEFAULT '',
  sync_status    text        NOT NULL DEFAULT 'local' CHECK (sync_status IN ('local', 'synced', 'error')),
  sync_error     text        NOT NULL DEFAULT '',
  version        integer     NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_id)
);
CREATE INDEX IF NOT EXISTS mail_drafts_user_idx ON app.mail_drafts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.mail_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text        NOT NULL,
  account_id          text        NOT NULL DEFAULT '',
  message_payload     jsonb       NOT NULL,                  -- {to, cc, bcc, subject, html, plainText, draftLocalId?}
  send_at             timestamptz NOT NULL,
  status              text        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  attempts            integer     NOT NULL DEFAULT 0,
  last_error          text        NOT NULL DEFAULT '',
  provider_message_id text        NOT NULL DEFAULT '',
  request_id          text        NOT NULL DEFAULT '',        -- idempotentie: dezelfde aanvraag maakt nooit twee wachtrij-items
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);
CREATE INDEX IF NOT EXISTS mail_queue_due_idx ON app.mail_queue (send_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS mail_queue_user_idx ON app.mail_queue (user_id, send_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS mail_queue_request_idx ON app.mail_queue (user_id, request_id) WHERE request_id <> '';

ALTER TABLE app.mail_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mail_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_drafts_eigen ON app.mail_drafts;
DROP POLICY IF EXISTS mail_queue_eigen ON app.mail_queue;
CREATE POLICY mail_drafts_eigen ON app.mail_drafts
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());
CREATE POLICY mail_queue_eigen ON app.mail_queue
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());
