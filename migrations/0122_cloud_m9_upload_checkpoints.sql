-- M9 STAGING-ONLY. Session URLs are bearer capabilities and MUST be encrypted
-- at rest with a separately provisioned server key. Not end-to-end encrypted.
-- No user-facing routes, no worker activation, no grants to the application role.
CREATE TABLE IF NOT EXISTS app.cloud_m9_upload_checkpoints (
 job_id uuid PRIMARY KEY REFERENCES app.cloud_overdracht_jobs(id) ON DELETE RESTRICT,
 user_id text NOT NULL,
 ruimte text NOT NULL CHECK (ruimte IN ('prive','technisch')),
 account_id text NOT NULL,
 provider text NOT NULL CHECK (provider IN ('onedrive-personal','onedrive-business','sharepoint','dropbox')),
 encrypted_session bytea NOT NULL CHECK (octet_length(encrypted_session) BETWEEN 29 AND 8192),
 doel text NOT NULL CHECK (char_length(doel) BETWEEN 1 AND 1024),
 naam text NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 200),
 bron_revisie text NOT NULL CHECK (char_length(bron_revisie) BETWEEN 1 AND 200),
 total_bytes bigint NOT NULL CHECK (total_bytes > 0),
 confirmed_offset bigint NOT NULL DEFAULT 0 CHECK (confirmed_offset >= 0),
 status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','uploaded_not_verified','review_required')),
 lease_token text NOT NULL,
 lease_until timestamptz NOT NULL,
 fout text NOT NULL DEFAULT '' CHECK (char_length(fout) <= 120),
 remote_id text,
 remote_revision text,
 aangemaakt_op timestamptz NOT NULL DEFAULT now(),
 bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
 CHECK (confirmed_offset <= total_bytes)
);
CREATE INDEX IF NOT EXISTS cloud_m9_upload_unverified ON app.cloud_m9_upload_checkpoints(status,lease_until)
 WHERE status='uploading';
ALTER TABLE app.cloud_m9_upload_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_m9_upload_checkpoints FORCE ROW LEVEL SECURITY;
-- No SELECT or mutation policy for public/app role: only a separately trusted
-- service role with BYPASSRLS can access session capabilities.
DO $grant$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_system') THEN
  GRANT SELECT, INSERT, UPDATE ON app.cloud_m9_upload_checkpoints TO mijnruimte_system;
 END IF;
END $grant$;
