-- 0192 — UI-014 fase 2A (30.10.2026): bekende apparaten per account, voor de melding «Новий вхід / новий пристрій»
-- (backend/nieuw-apparaat.ts). Alleen een grove sleutel (hash van account + browser/systeem uit de user-agent), nooit de
-- volledige user-agent of het IP; de IP-regio staat alleen in de melding zelf (uit de CDN-geo-koppen, zoals requestMeta).
-- Schrijven alleen via de systeemrol; mijnruimte_app krijgt geen rechten (zelfde patroon als 0025). Alleen in gebruik als de
-- vlag `meldingen-uitleg-v3` aan staat. Terugdraaien: DROP TABLE IF EXISTS app.bekende_apparaten;
CREATE TABLE IF NOT EXISTS app.bekende_apparaten (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL,
  sleutel        text        NOT NULL CHECK (sleutel ~ '^[0-9a-f]{32}$'),
  apparaat       text        CHECK (apparaat IS NULL OR length(apparaat) <= 40),
  eerst_gezien   timestamptz NOT NULL DEFAULT now(),
  laatst_gezien  timestamptz NOT NULL DEFAULT now(),
  bevestigd_op   timestamptz,
  UNIQUE (user_id, sleutel)
);
ALTER TABLE app.bekende_apparaten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bekende_apparaten_eigen ON app.bekende_apparaten;
CREATE POLICY bekende_apparaten_eigen ON app.bekende_apparaten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
