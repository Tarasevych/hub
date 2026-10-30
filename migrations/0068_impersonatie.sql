-- 0068: «Подивитися як користувач» (impersonatie) — alleen met uitdrukkelijke toestemming van de gebruiker (18.10.2026).
--
--   Wat 0035 (ondersteuning_verzoeken) niet kon: de INTERFACE van de gebruiker zien. Hier vraagt een beheerder (technisch profiel met
--   'impersonatie.aanvragen') om de site van een gebruiker te bekijken; de gebruiker beslist zelf met een verse STERKE bevestiging
--   (passkey, TOTP of herstelcode). Na toestemming krijgt de beheerder GEEN cookie of token van de gebruiker: zijn eigen tabblad
--   stuurt elke aanroep via POST /api/impersonatie/aanroep; de server controleert per aanroep deze rij (status, eind_op, dezelfde
--   beheerder, hetzelfde tabblad, technisch profiel nog actief) en voert de route in-process uit als die gebruiker (backend/impersonatie.ts).
--
--   Standaard ALLEEN LEZEN. «met_acties» alleen als de gebruiker dat bij zijn toestemming uitdrukkelijk aanvinkte — en ook dan nooit
--   beveiliging, aanmeldmethoden, passkeys, account verwijderen, geheimen, export, rollen of beheer (vaste lijst in de code).
--   Elke aanroep staat in het journaal van de gebruiker met actorType 'impersonatie', actor = de beheerder, «від імені» = deze rij.
CREATE TABLE IF NOT EXISTS app.impersonatie_sessies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  beheerder_id     text        NOT NULL,
  doel_id          text        NOT NULL CHECK (doel_id <> beheerder_id),
  beheerder_tab    text        NOT NULL CHECK (beheerder_tab ~ '^[0-9a-f]{64}$'),
  reden            text        NOT NULL CHECK (char_length(reden) BETWEEN 3 AND 300),
  minuten          int         NOT NULL CHECK (minuten BETWEEN 5 AND 60),
  met_acties       boolean     NOT NULL DEFAULT false,
  status           text        NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'actief', 'geweigerd', 'beeindigd', 'verlopen', 'ingetrokken')),
  aangevraagd_op   timestamptz NOT NULL DEFAULT now(),
  besloten_op      timestamptz,
  eind_op          timestamptz,
  beeindigd_op     timestamptz,
  beeindigd_door   text,
  beeindigd_reden  text        NOT NULL DEFAULT '',
  stap_op_methode  text        NOT NULL DEFAULT '',
  acties           integer     NOT NULL DEFAULT 0,
  geweigerd        integer     NOT NULL DEFAULT 0,
  laatst_actief    timestamptz,
  CHECK (eind_op IS NULL OR eind_op <= COALESCE(besloten_op, aangevraagd_op) + interval '60 minutes 30 seconds')
);
CREATE INDEX IF NOT EXISTS impersonatie_doel_open ON app.impersonatie_sessies (doel_id) WHERE status IN ('wacht', 'actief');
CREATE INDEX IF NOT EXISTS impersonatie_beheerder ON app.impersonatie_sessies (beheerder_id, aangevraagd_op DESC);

-- Alleen de systeemrol schrijft en controleert. De app-rol mag de eigen rijen (als doel of beheerder) lezen, nooit schrijven:
-- een aanroep in gebruikerscontext kan zijn eigen toestemming dus niet verlengen of verruimen.
ALTER TABLE app.impersonatie_sessies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS impersonatie_eigen ON app.impersonatie_sessies;
CREATE POLICY impersonatie_eigen ON app.impersonatie_sessies FOR SELECT
  USING (current_user::text <> 'mijnruimte_app' OR doel_id = app.huidige_gebruiker() OR beheerder_id = app.huidige_gebruiker());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.impersonatie_sessies FROM mijnruimte_app;
    GRANT SELECT ON app.impersonatie_sessies TO mijnruimte_app;
  END IF;
END $$;
