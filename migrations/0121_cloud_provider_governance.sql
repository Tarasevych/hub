-- M6 DEVELOPMENT ONLY. Atomic provider policy and separately signed CI attestations.
-- No new public privileges; migration runs under the existing restricted migrator.
CREATE TABLE IF NOT EXISTS app.cloud_provider_policy_m6 (
  provider text PRIMARY KEY CHECK (provider IN (
   'google-drive','onedrive-personal','onedrive-business','sharepoint','dropbox',
   'box','nextcloud','s3','backblaze-b2','pcloud','github')),
  allow_new_connections boolean NOT NULL DEFAULT false,
  allow_existing_operations boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.cloud_provider_policy_audit_m6 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  revision bigint NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  before_policy jsonb NOT NULL,
  after_policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,revision)
);
-- Signed attestation is written by a dedicated CI job, never an admin UI route.
CREATE TABLE IF NOT EXISTS app.cloud_provider_attestation_m6 (
  provider text PRIMARY KEY,
  build_sha text NOT NULL CHECK (build_sha ~ '^[a-f0-9]{40}$|^[a-f0-9]{64}$'),
  run_id text NOT NULL CHECK (run_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  checks text[] NOT NULL,
  checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  signature text NOT NULL CHECK (signature ~ '^[a-f0-9]{64}$'),
  CONSTRAINT cloud_ci_expiry CHECK (expires_at>checked_at AND expires_at<=checked_at+interval '14 days')
);
REVOKE ALL ON app.cloud_provider_policy_m6, app.cloud_provider_policy_audit_m6,
  app.cloud_provider_attestation_m6 FROM PUBLIC;
REVOKE ALL ON SEQUENCE app.cloud_provider_policy_audit_m6_id_seq FROM PUBLIC;
ALTER TABLE app.cloud_provider_policy_m6 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_provider_policy_audit_m6 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_provider_attestation_m6 ENABLE ROW LEVEL SECURITY;
-- System role is used only after owner + live technical-tab authorization.
-- It cannot forge CI evidence: attestation INSERT/UPDATE/DELETE is not granted.
DO $grant$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_system') THEN
  GRANT SELECT,INSERT,UPDATE ON app.cloud_provider_policy_m6 TO mijnruimte_system;
  GRANT SELECT,INSERT ON app.cloud_provider_policy_audit_m6 TO mijnruimte_system;
  GRANT USAGE,SELECT ON SEQUENCE app.cloud_provider_policy_audit_m6_id_seq TO mijnruimte_system;
  GRANT SELECT ON app.cloud_provider_attestation_m6 TO mijnruimte_system;
 END IF;
END $grant$;
