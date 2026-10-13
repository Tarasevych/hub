-- 0031: weergave per account (architectuur 13.10.2026, etap 3): «простий» of «розширений» режим.
--   Alleen weergave: welke tabbladen en opties standaard zichtbaar zijn. Geeft en neemt GEEN rechten (die blijven op de server:
--   sessie, rollen, technisch profiel). Geen rij = standaard: eigenaar «розширений» (niets verandert voor wie alles al gebruikte),
--   iedereen anders «простий» (nieuwkomers zien eerst het nodige).
-- Schrijven alleen via de systeemrol (backend/weergave.ts); de app-rol leest onder RLS alleen de eigen rij.
CREATE TABLE IF NOT EXISTS app.ui_weergave (
  user_id      text        PRIMARY KEY,
  modus        text        NOT NULL CHECK (modus IN ('eenvoudig', 'expert')),
  gewijzigd_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.ui_weergave ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ui_weergave_eigen ON app.ui_weergave;
CREATE POLICY ui_weergave_eigen ON app.ui_weergave
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
