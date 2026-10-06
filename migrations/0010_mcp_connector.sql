-- 0010: MCP-connector voor Claude (claude.ai > Customize > Connectors): OAuth 2.x-autorisatieserver + tokens.
--
-- Claude verbindt vanuit de cloud van Anthropic met https://mcp.tarasevych.com/mcp en laat de gebruiker inloggen via
-- OAuth (PKCE S256, dynamische clientregistratie). Elke gebruiker geeft Claude toegang tot ZIJN eigen apparaten.
--
-- Alleen de systeemrol (mijnruimte_system) benadert deze tabellen: de publieke eindpunten hebben geen sessie en de
-- UI-routes filteren zelf op user_id. mijnruimte_app krijgt GEEN rechten (rechten.sql blijft ongewijzigd). RLS staat
-- aan als tweede laag, zoals bij 0009. Geheimen staan hier niet: codes en tokens alleen als sha256-hash.

CREATE TABLE IF NOT EXISTS app.mcp_oauth_clients (
  client_id     text PRIMARY KEY,
  client_name   text        NOT NULL,
  redirect_uris text[]      NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Een autorisatieverzoek: eerst 'pending' (wacht op toestemming in de UI), daarna 'approved' met een eenmalige code.
CREATE TABLE IF NOT EXISTS app.mcp_oauth_auth (
  id              text PRIMARY KEY,                       -- willekeurig, staat in de toestemmings-URL
  client_id       text        NOT NULL REFERENCES app.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri    text        NOT NULL,
  code_challenge  text        NOT NULL,
  state           text,
  scope           text        NOT NULL DEFAULT 'machines',
  resource        text,
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'used')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  user_id         text,
  code_hash       text UNIQUE,
  code_expires_at timestamptz,
  decided_at      timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_oauth_auth_expires_idx ON app.mcp_oauth_auth (expires_at);

CREATE TABLE IF NOT EXISTS app.mcp_oauth_tokens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text        NOT NULL,
  client_id           text        NOT NULL REFERENCES app.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  client_name         text        NOT NULL,
  scope               text        NOT NULL,
  access_hash         text        NOT NULL UNIQUE,
  refresh_hash        text        NOT NULL UNIQUE,
  prev_refresh_hash   text,                               -- voor het herkennen van hergebruik van een geroteerd token
  access_expires_at   timestamptz NOT NULL,
  refresh_expires_at  timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  revoked_at          timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user_idx ON app.mcp_oauth_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_prev_idx ON app.mcp_oauth_tokens (prev_refresh_hash) WHERE prev_refresh_hash IS NOT NULL;

ALTER TABLE app.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mcp_oauth_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_oauth_clients_vrij ON app.mcp_oauth_clients;
CREATE POLICY mcp_oauth_clients_vrij ON app.mcp_oauth_clients USING (app.rls_vrij()) WITH CHECK (app.rls_vrij());

DROP POLICY IF EXISTS mcp_oauth_auth_eigen ON app.mcp_oauth_auth;
CREATE POLICY mcp_oauth_auth_eigen ON app.mcp_oauth_auth
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());

DROP POLICY IF EXISTS mcp_oauth_tokens_eigen ON app.mcp_oauth_tokens;
CREATE POLICY mcp_oauth_tokens_eigen ON app.mcp_oauth_tokens
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());
