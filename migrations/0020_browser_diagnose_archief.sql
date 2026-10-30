-- 0020: archief van diagnosebuffers van de browserextensie (console/netwerk, ≤ 200 items per buffer). Alleen versleuteld
-- (AES-256-GCM, sealWithEnvKey, AAD = diag:<user>:<agent>) en per gebruiker; bewaartermijn 90 dagen (opruimen bij schrijven
-- en bij het opstarten). RLS zoals 0017.
CREATE TABLE IF NOT EXISTS app.browser_diag_archive (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  agent_id    uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '90 days',
  entries     integer     NOT NULL CHECK (entries BETWEEN 0 AND 200),
  sealed      text        NOT NULL CHECK (length(sealed) <= 2000000),
  CONSTRAINT browser_diag_archive_agent_fk FOREIGN KEY (agent_id, user_id) REFERENCES app.agents (id, user_id) ON DELETE CASCADE,
  CONSTRAINT browser_diag_archive_max_bewaren CHECK (expires_at <= created_at + interval '90 days')
);
CREATE INDEX IF NOT EXISTS browser_diag_archive_user_idx ON app.browser_diag_archive (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS browser_diag_archive_expires_idx ON app.browser_diag_archive (expires_at);
ALTER TABLE app.browser_diag_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS browser_diag_archive_eigen ON app.browser_diag_archive;
CREATE POLICY browser_diag_archive_eigen ON app.browser_diag_archive
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
