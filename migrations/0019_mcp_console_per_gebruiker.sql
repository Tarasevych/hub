-- 0019: het MCP-bord (taken, notities), de agenttokens en het verkeerslog van mcp.tarasevych.com per gebruiker in de database,
-- in plaats van één gedeeld JSON-bestand voor iedereen (audit C2). Tokens alleen als sha256-hash, met vervaldatum.
-- RLS zoals 0017: voor mijnruimte_app altijd alleen eigen rijen.
CREATE TABLE IF NOT EXISTS app.mcp_console_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('task', 'note')),
  title       text        NOT NULL CHECK (length(title) <= 160),
  body        text        NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  status      text        CHECK (status IS NULL OR status IN ('backlog', 'doing', 'blocked', 'done')),
  tags        text[]      NOT NULL DEFAULT '{}',
  author      text        NOT NULL DEFAULT 'operator',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_console_items_user_idx ON app.mcp_console_items (user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS app.mcp_console_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  name          text        NOT NULL CHECK (length(name) <= 80),
  prefix        text        NOT NULL,
  token_hash    text        NOT NULL UNIQUE,
  scopes        text[]      NOT NULL DEFAULT '{mcp:tools}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at    timestamptz,
  calls         integer     NOT NULL DEFAULT 0,
  last_seen_at  timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_console_tokens_user_idx ON app.mcp_console_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS app.mcp_console_log (
  id         bigserial PRIMARY KEY,
  user_id    text        NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  method     text        NOT NULL,
  detail     text        NOT NULL DEFAULT '',
  transport  text        NOT NULL DEFAULT 'console',
  agent      text        NOT NULL DEFAULT '',
  ok         boolean     NOT NULL DEFAULT true,
  ms         integer     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mcp_console_log_user_idx ON app.mcp_console_log (user_id, at DESC);

ALTER TABLE app.mcp_console_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mcp_console_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mcp_console_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_console_items_eigen ON app.mcp_console_items;
CREATE POLICY mcp_console_items_eigen ON app.mcp_console_items
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS mcp_console_tokens_eigen ON app.mcp_console_tokens;
CREATE POLICY mcp_console_tokens_eigen ON app.mcp_console_tokens
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS mcp_console_log_eigen ON app.mcp_console_log;
CREATE POLICY mcp_console_log_eigen ON app.mcp_console_log
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
