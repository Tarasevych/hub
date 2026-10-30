-- 0038: feature flags (architectuur 13.10.2026, etap F). Zie shared/flags.ts voor het waarom.
--   Een vlag zet een functie aan of uit, NOOIT een recht. Lezen en schrijven alleen via de systeemrol (backend/flags.ts);
--   de app-rol ziet niets (de lijst bevat gebruikers-id's van gerichte uitrol).
CREATE TABLE IF NOT EXISTS app.feature_flags (
  sleutel        text        PRIMARY KEY CHECK (sleutel ~ '^[a-z][a-z0-9-]{2,40}$'),
  omschrijving   text        NOT NULL DEFAULT '' CHECK (char_length(omschrijving) <= 300),
  aan            boolean     NOT NULL DEFAULT false,
  standaard      boolean     NOT NULL DEFAULT false,
  percentage     int         NOT NULL DEFAULT 0 CHECK (percentage BETWEEN 0 AND 100),
  gebruikers     text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(gebruikers) <= 200),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  gewijzigd_door text,
  gewijzigd_op   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_flags_geen_app ON app.feature_flags;
CREATE POLICY feature_flags_geen_app ON app.feature_flags USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');

-- Test van een tester (recht flags.test): alleen voor zichzelf, tot het einde van het actieve technisch profiel (hard max. 8 uur).
CREATE TABLE IF NOT EXISTS app.feature_flag_tests (
  user_id  text        NOT NULL,
  sleutel  text        NOT NULL REFERENCES app.feature_flags (sleutel) ON DELETE CASCADE,
  waarde   boolean     NOT NULL,
  gezet_op timestamptz NOT NULL DEFAULT now(),
  tot      timestamptz NOT NULL,
  PRIMARY KEY (user_id, sleutel),
  CHECK (tot > gezet_op AND tot <= gezet_op + interval '8 hours')
);
CREATE INDEX IF NOT EXISTS feature_flag_tests_tot ON app.feature_flag_tests (tot);
ALTER TABLE app.feature_flag_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_flag_tests_geen_app ON app.feature_flag_tests;
CREATE POLICY feature_flag_tests_geen_app ON app.feature_flag_tests USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
