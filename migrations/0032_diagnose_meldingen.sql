-- 0032: verslagen van «Щось не працює?» (diagnose «для всіх чи лише для мене», etap 4).
--   Alleen wat de gebruiker zelf verstuurt: oordeel, uitslagen van de controles (codes, ja/nee, duur), dienst, korte browsernaam
--   en een eigen beschrijving (≤ 500 tekens). Geen inhoud, geen sleutels, geen adressen of IP.
--   Lezen: de gebruiker zelf (eigen rijen, RLS) en, via de systeemrol, wie in een actief technisch profiel 'diagnose.lezen' heeft.
--   Bewaartermijn: 90 dagen (opgeruimd bij elk nieuw verslag).
CREATE TABLE IF NOT EXISTS app.diagnose_meldingen (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  dienst        text        NOT NULL CHECK (dienst ~ '^[a-z]{2,12}$'),
  oordeel       text        NOT NULL CHECK (oordeel IN ('iedereen', 'alleen-ik', 'beide', 'alles-ok', 'onzeker')),
  uitslagen     jsonb       NOT NULL CHECK (jsonb_typeof(uitslagen) = 'array' AND pg_column_size(uitslagen) <= 8192),
  beschrijving  text        NOT NULL DEFAULT '' CHECK (char_length(beschrijving) <= 500),
  browser       text        NOT NULL DEFAULT '' CHECK (char_length(browser) <= 120),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  gelezen_op    timestamptz,
  gelezen_door  text
);
CREATE INDEX IF NOT EXISTS diagnose_meldingen_recent ON app.diagnose_meldingen (aangemaakt_op DESC);
ALTER TABLE app.diagnose_meldingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diagnose_meldingen_eigen ON app.diagnose_meldingen;
CREATE POLICY diagnose_meldingen_eigen ON app.diagnose_meldingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
