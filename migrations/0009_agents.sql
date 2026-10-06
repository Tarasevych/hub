-- 0009: Local Machine Connector (agents). Drie eigen tabellen, elk met RLS op user_id.
--
-- Waarom eigen tabellen i.p.v. app.records: agent-opdrachten hebben atomaire statusovergangen nodig
-- (UPDATE ... WHERE status = 'pending_approval', zodat een opdracht maar één keer wordt goedgekeurd) en
-- agenttokens worden op hash opgezocht zonder gebruikerscontext (het WebSocket-kanaal heeft geen sessie).
--
-- RLS volgt 0004/0007: de policy laat alles door zolang `afdwingen` uit staat (app.rls_vrij()), en beperkt
-- mijnruimte_app tot eigen rijen zodra afdwingen aan staat. mijnruimte_system (BYPASSRLS) en de eigenaar van
-- de tabel (migrator, geen FORCE) zijn vrijgesteld. Rechten voor mijnruimte_app: zie rechten.sql.
-- Geheimen staan hier NIET: agenttokens alleen als sha256-hash, koppelcodes alleen als hash.

CREATE TABLE IF NOT EXISTS app.agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  name          text        NOT NULL,
  platform      text,
  token_hash    text        NOT NULL UNIQUE,
  status        text        NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  last_seen_at  timestamptz,
  capabilities  jsonb       NOT NULL DEFAULT '{}',
  policy        jsonb       NOT NULL DEFAULT '{"autoApprove": ["fs.read", "fs.list", "sys.info"]}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS agents_user_idx ON app.agents (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS app.agent_pairing_codes (
  code_hash   text PRIMARY KEY,
  user_id     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS agent_pairing_codes_user_idx ON app.agent_pairing_codes (user_id, created_at);

CREATE TABLE IF NOT EXISTS app.agent_commands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
  user_id      text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info')),
  params       jsonb       NOT NULL DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'pending_approval'
               CHECK (status IN ('pending_approval', 'approved', 'sent', 'succeeded', 'failed', 'rejected', 'timeout')),
  result       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS agent_commands_agent_idx ON app.agent_commands (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_commands_pending_idx ON app.agent_commands (user_id) WHERE status = 'pending_approval';

-- RLS: eigen rijen (of vrij zolang afdwingen uit staat).
ALTER TABLE app.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agents_eigen ON app.agents;
CREATE POLICY agents_eigen ON app.agents
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());

DROP POLICY IF EXISTS agent_pairing_codes_eigen ON app.agent_pairing_codes;
CREATE POLICY agent_pairing_codes_eigen ON app.agent_pairing_codes
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());

DROP POLICY IF EXISTS agent_commands_eigen ON app.agent_commands;
CREATE POLICY agent_commands_eigen ON app.agent_commands
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());
