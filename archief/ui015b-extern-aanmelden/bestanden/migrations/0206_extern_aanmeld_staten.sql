-- 0206 — UI-015B (30.10.2026): kortlevende, eenmalige gegevens van de externe aanmeldstroom (backend/extern-aanmelden/stroom.ts):
--   soort 'staat'    = state → (aanbieder, doel, nonce, PKCE-verifier), max 10 min, bij terugkomst atomisch verwijderd;
--   soort 'afronden' = geverifieerd resultaat onder een willekeurige overdrachtssleutel, max 2 min, eenmalig;
--   soort 'replay'   = hash van een gebruikte Telegram-aanmelding (tegen hergebruik), 10 min.
-- Sleutel = sha256-hex; nooit tokens van de aanbieder. Alleen de systeemrol leest/schrijft; mijnruimte_app heeft geen rechten
-- (zelfde patroon als 0192). Terugdraaien: DROP TABLE IF EXISTS app.extern_aanmeld_staten;
CREATE TABLE IF NOT EXISTS app.extern_aanmeld_staten (
  sleutel    text        PRIMARY KEY CHECK (sleutel ~ '^[0-9a-f]{64}$'),
  soort      text        NOT NULL CHECK (soort IN ('staat', 'afronden', 'replay')),
  gegevens   jsonb       NOT NULL,
  verloopt   timestamptz NOT NULL,
  aangemaakt timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extern_aanmeld_staten_verloopt ON app.extern_aanmeld_staten (verloopt);
ALTER TABLE app.extern_aanmeld_staten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extern_aanmeld_staten_systeem ON app.extern_aanmeld_staten;
CREATE POLICY extern_aanmeld_staten_systeem ON app.extern_aanmeld_staten
  USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
