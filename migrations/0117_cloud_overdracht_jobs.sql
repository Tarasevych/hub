-- 0117: Cloud transfers M2. Data only, no worker activation and no user-facing feature flag.
-- Every job belongs to one owner and one exact data space. No OAuth bearer secrets in request JSON.
CREATE TABLE IF NOT EXISTS app.cloud_overdracht_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL,
 ruimte text NOT NULL CHECK (ruimte IN ('prive','technisch')),
 idempotentie_sleutel text NOT NULL CHECK (idempotentie_sleutel ~ '^[A-Za-z0-9_-]{8,120}$'),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
 verzoek jsonb NOT NULL CHECK (jsonb_typeof(verzoek)='object' AND pg_column_size(verzoek)<=8192),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','review')),
 lease_token text NOT NULL DEFAULT '',
 lease_tot timestamptz,
 pogingen integer NOT NULL DEFAULT 0 CHECK (pogingen BETWEEN 0 AND 3),
 uitkomst jsonb NOT NULL DEFAULT '{}'::jsonb,
 fout text NOT NULL DEFAULT '' CHECK (char_length(fout)<=120),
 aangemaakt_op timestamptz NOT NULL DEFAULT now(),
 bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
 UNIQUE (user_id,ruimte,idempotentie_sleutel)
);
CREATE INDEX IF NOT EXISTS cloud_overdracht_owner_staat ON app.cloud_overdracht_jobs (user_id,ruimte,status,bijgewerkt_op DESC);
CREATE INDEX IF NOT EXISTS cloud_overdracht_stale ON app.cloud_overdracht_jobs (lease_tot) WHERE status='running';
ALTER TABLE app.cloud_overdracht_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_overdracht_owner ON app.cloud_overdracht_jobs;
CREATE POLICY cloud_overdracht_owner ON app.cloud_overdracht_jobs
 USING (current_user::text <> 'mijnruimte_app' OR user_id=app.huidige_gebruiker())
 WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id=app.huidige_gebruiker());
DO $grants$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_system') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON app.cloud_overdracht_jobs TO mijnruimte_system;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_app') THEN
  GRANT SELECT ON app.cloud_overdracht_jobs TO mijnruimte_app;
 END IF;
END $grants$;
