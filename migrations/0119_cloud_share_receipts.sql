-- 0119: server-side receipts for named-person Cloud share invitations (DEV ONLY).
-- This does not expose an API or enable provider sharing without user confirmation.
CREATE TABLE IF NOT EXISTS app.cloud_share_receipts (
 id uuid PRIMARY KEY,
 user_id text NOT NULL,
 ruimte text NOT NULL CHECK(ruimte IN ('prive','technisch')),
 account_id text NOT NULL,
 aanbieder text NOT NULL CHECK(aanbieder IN ('google-drive','onedrive-personal','onedrive-business','sharepoint','box')),
 bestand_id text NOT NULL,
 ontvanger text NOT NULL,
 rol text NOT NULL CHECK(rol IN ('viewer','editor')),
 provider_permissie_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('active','review','revoked')) DEFAULT 'active',
 aangemaakt_op timestamptz NOT NULL DEFAULT now(),
 bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,ruimte,account_id,aanbieder,bestand_id,provider_permissie_id)
);
CREATE INDEX IF NOT EXISTS cloud_share_owner ON app.cloud_share_receipts(user_id,ruimte,status,bijgewerkt_op DESC);
ALTER TABLE app.cloud_share_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_share_owner ON app.cloud_share_receipts;
CREATE POLICY cloud_share_owner ON app.cloud_share_receipts
 USING(current_user::text <> 'mijnruimte_app' OR user_id=app.huidige_gebruiker())
 WITH CHECK(current_user::text <> 'mijnruimte_app' OR user_id=app.huidige_gebruiker());
DO $grant$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_system') THEN
  GRANT SELECT, INSERT, UPDATE ON app.cloud_share_receipts TO mijnruimte_system;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mijnruimte_app') THEN
  GRANT SELECT ON app.cloud_share_receipts TO mijnruimte_app;
 END IF;
END $grant$;
