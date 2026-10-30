-- M4 staging only: encrypted OAuth grants per owner + space + provider + remote account.
-- DO NOT ACTIVATE until end-to-end provider acceptance. Never expose encrypted grants to app role.
CREATE TABLE IF NOT EXISTS app.cloud_oauth_flows_m4 (
 state_hash text PRIMARY KEY CHECK(state_hash ~ '^[a-f0-9]{64}$'),
 flow_id uuid NOT NULL UNIQUE,
 user_id text NOT NULL,
 ruimte text NOT NULL CHECK(ruimte IN ('prive','technisch')),
 encrypted_flow text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cloud_oauth_flows_expires ON app.cloud_oauth_flows_m4(expires_at);
CREATE TABLE IF NOT EXISTS app.cloud_provider_accounts_m4 (
 id uuid PRIMARY KEY,
 user_id text NOT NULL,
 ruimte text NOT NULL CHECK(ruimte IN ('prive','technisch')),
 aanbieder text NOT NULL CHECK(aanbieder IN ('onedrive-personal','onedrive-business','sharepoint','dropbox','box')),
 external_subject text NOT NULL,
 naam text NOT NULL,
 alias text NOT NULL DEFAULT '' CHECK(char_length(alias)<=80),
 email text NOT NULL,
 modus text NOT NULL CHECK(modus IN ('read','write')),
 scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
 status text NOT NULL CHECK(status IN ('connected','reauth_required','disconnect_pending','revoked')),
 encrypted_credentials text NOT NULL,
 refresh_lease_token text NOT NULL DEFAULT '',
 refresh_lease_until timestamptz,
 token_version bigint NOT NULL DEFAULT 0,
 bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
 aangemaakt_op timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,ruimte,aanbieder,external_subject)
);
CREATE INDEX IF NOT EXISTS cloud_accounts_owner ON app.cloud_provider_accounts_m4(user_id,ruimte,bijgewerkt_op DESC);
ALTER TABLE app.cloud_oauth_flows_m4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_provider_accounts_m4 ENABLE ROW LEVEL SECURITY;
-- No user-facing SELECT/INSERT/UPDATE/DELETE grants. Only trusted system role may see ciphertext.
REVOKE ALL ON app.cloud_oauth_flows_m4 FROM PUBLIC;
REVOKE ALL ON app.cloud_provider_accounts_m4 FROM PUBLIC;
DO $grant$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_system') THEN
  GRANT SELECT,INSERT,DELETE ON app.cloud_oauth_flows_m4 TO mijnruimte_system;
  GRANT SELECT,INSERT,UPDATE,DELETE ON app.cloud_provider_accounts_m4 TO mijnruimte_system;
 END IF;
END $grant$;
