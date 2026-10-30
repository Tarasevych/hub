-- 0067: extern bureaublad (RDP/VNC/SSH via Apache Guacamole, uitvoerder D, 18.10.2026).
--   remote_verbindingen: wat de eigenaar heeft ingesteld (doel, poort, protocol, gebruikersnaam, instellingen). Het wachtwoord of de
--     sleutel staat NIET hier maar in de kluis (owner_vault_v1, kolom geheim_naam = naam in de kluis).
--   remote_instellingen: uitdrukkelijk toegestane publieke hosts (privénetwerken mogen altijd).
--   remote_sessies: elke geopende sessie (wie, waarheen, wanneer, hoe lang, hoe beëindigd) — ook in app.audit.
-- Schrijven via de systeemrol; de app-rol mag alleen eigen rijen lezen.
CREATE TABLE IF NOT EXISTS app.remote_verbindingen (
  id           uuid        PRIMARY KEY,
  user_id      text        NOT NULL,
  naam         text        NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 60),
  protocol     text        NOT NULL CHECK (protocol IN ('rdp', 'vnc', 'ssh')),
  host         text        NOT NULL CHECK (char_length(host) BETWEEN 1 AND 253),
  poort        int         NOT NULL CHECK (poort BETWEEN 1 AND 65535),
  gebruiker    text        NOT NULL DEFAULT '' CHECK (char_length(gebruiker) <= 120),
  geheim_naam  text        NOT NULL DEFAULT '',
  instellingen jsonb       NOT NULL DEFAULT '{}'::jsonb,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  gewijzigd_op  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS remote_verbindingen_user ON app.remote_verbindingen (user_id, naam);

CREATE TABLE IF NOT EXISTS app.remote_instellingen (
  user_id          text        PRIMARY KEY,
  toegestane_hosts text[]      NOT NULL DEFAULT '{}',
  gewijzigd_op     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.remote_sessies (
  id            uuid        PRIMARY KEY,
  user_id       text        NOT NULL,
  verbinding_id uuid,
  naam          text        NOT NULL DEFAULT '',
  protocol      text        NOT NULL,
  host          text        NOT NULL,
  ip            text        NOT NULL DEFAULT '',
  poort         int         NOT NULL,
  begin_op      timestamptz NOT NULL DEFAULT now(),
  eind_gepland  timestamptz NOT NULL,
  einde_op      timestamptz,
  einde_reden   text,
  bytes_in      bigint      NOT NULL DEFAULT 0,
  bytes_uit     bigint      NOT NULL DEFAULT 0,
  opname        text        NOT NULL DEFAULT '',
  activatie_id  text        NOT NULL DEFAULT '',
  CHECK (eind_gepland <= begin_op + interval '8 hours 5 minutes')
);
CREATE INDEX IF NOT EXISTS remote_sessies_user ON app.remote_sessies (user_id, begin_op DESC);

ALTER TABLE app.remote_verbindingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.remote_instellingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.remote_sessies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remote_verbindingen_eigen ON app.remote_verbindingen;
CREATE POLICY remote_verbindingen_eigen ON app.remote_verbindingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS remote_instellingen_eigen ON app.remote_instellingen;
CREATE POLICY remote_instellingen_eigen ON app.remote_instellingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS remote_sessies_eigen ON app.remote_sessies;
CREATE POLICY remote_sessies_eigen ON app.remote_sessies
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT ON app.remote_verbindingen, app.remote_instellingen, app.remote_sessies TO mijnruimte_app;
    REVOKE INSERT, UPDATE, DELETE ON app.remote_verbindingen, app.remote_instellingen, app.remote_sessies FROM mijnruimte_app;
  END IF;
END $$;
