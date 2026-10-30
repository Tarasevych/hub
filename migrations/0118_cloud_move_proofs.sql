-- 0118: M3 durable copy-proof journal for conditional source deletion.
-- This migration DOES NOT activate any route, cron task, or provider connection.
-- Copy verification is committed BEFORE the separately leased delete attempt.
CREATE TABLE IF NOT EXISTS app.cloud_move_proofs (
 job_id uuid PRIMARY KEY REFERENCES app.cloud_overdracht_jobs(id) ON DELETE RESTRICT,
 user_id text NOT NULL,
 ruimte text NOT NULL CHECK (ruimte IN ('prive','technisch')),
 bewijs jsonb NOT NULL CHECK (jsonb_typeof(bewijs)='object' AND pg_column_size(bewijs)<=8192),
 status text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified','deleting','moved','review')),
 lease_token text NOT NULL DEFAULT '',
 lease_tot timestamptz,
 resultaat text NOT NULL DEFAULT '' CHECK(char_length(resultaat)<=160),
 aangemaakt_op timestamptz NOT NULL DEFAULT now(),
 bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cloud_move_proofs_owner ON app.cloud_move_proofs(user_id,ruimte,status,bijgewerkt_op DESC);
CREATE INDEX IF NOT EXISTS cloud_move_proofs_stale ON app.cloud_move_proofs(lease_tot) WHERE status='deleting';
ALTER TABLE app.cloud_move_proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_move_owner ON app.cloud_move_proofs;
CREATE POLICY cloud_move_owner ON app.cloud_move_proofs
 USING(current_user::text <> 'mijnruimte_app' OR user_id=app.huidige_gebruiker())
 WITH CHECK(current_user::text <> 'mijnruimte_app' OR user_id=app.huidige_gebruiker());
DO $grants$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_system') THEN
  GRANT SELECT, INSERT, UPDATE ON app.cloud_move_proofs TO mijnruimte_system;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_app') THEN
  GRANT SELECT ON app.cloud_move_proofs TO mijnruimte_app;
 END IF;
END $grants$;
