-- 0069: SSH-CA beheren vanaf de site (uitvoerder F, 18.10.2026).
--   goedkeur_uitdagingen: nieuw doel 'ssh-ca' (passkey-challenge voor «Voorbereiden» en «Aan»; de actie zit in de challenge en root
--     controleert de assertie zelf opnieuw met zijn eigen sleutelbestand — zie deploy/goedkeuring/goedkeur-hulp.mjs verifieer-ssh-ca).
--   ssh_ca_certificaten: elk uitgegeven certificaat (serienummer van root, door wie, wanneer, tot wanneer, principals) en of het is
--     ingetrokken (KRL). Het certificaat zelf wordt niet bewaard (alleen de vingerafdruk van de publieke sleutel).
-- Schrijven via de systeemrol; de app-rol leest alleen eigen rijen.
ALTER TABLE app.goedkeur_uitdagingen DROP CONSTRAINT IF EXISTS goedkeur_uitdagingen_doel_check;
ALTER TABLE app.goedkeur_uitdagingen ADD CONSTRAINT goedkeur_uitdagingen_doel_check
  CHECK (doel IN ('registreren', 'goedkeuren', 'sleutel-toevoegen', 'sleutel-verwijderen', 'ai-beleid', 'ssh-ca'));

CREATE TABLE IF NOT EXISTS app.ssh_ca_certificaten (
  id               bigserial   PRIMARY KEY,
  serie            bigint      NOT NULL CHECK (serie > 0),
  ca_vinger        text        NOT NULL DEFAULT '' CHECK (char_length(ca_vinger) <= 60),
  vinger           text        NOT NULL CHECK (vinger ~ '^SHA256:[A-Za-z0-9+/]{43}$'),
  user_id          text        NOT NULL,
  email            text        NOT NULL DEFAULT '',
  identiteit       text        NOT NULL DEFAULT '' CHECK (char_length(identiteit) <= 64),
  principals       text[]      NOT NULL CHECK (cardinality(principals) BETWEEN 1 AND 8),
  minuten          int         NOT NULL CHECK (minuten BETWEEN 5 AND 60),
  aangemaakt_op    timestamptz NOT NULL DEFAULT now(),
  geldig_tot       timestamptz NOT NULL,
  activatie_id     text        NOT NULL DEFAULT '',
  ingetrokken_op   timestamptz,
  ingetrokken_door text,
  reden            text        NOT NULL DEFAULT '' CHECK (char_length(reden) <= 200),
  UNIQUE (ca_vinger, serie)
);
CREATE INDEX IF NOT EXISTS ssh_ca_certificaten_recent ON app.ssh_ca_certificaten (aangemaakt_op DESC);

ALTER TABLE app.ssh_ca_certificaten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ssh_ca_certificaten_eigen ON app.ssh_ca_certificaten;
CREATE POLICY ssh_ca_certificaten_eigen ON app.ssh_ca_certificaten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT ON app.ssh_ca_certificaten TO mijnruimte_app;
    REVOKE INSERT, UPDATE, DELETE ON app.ssh_ca_certificaten FROM mijnruimte_app;
  END IF;
END $$;
