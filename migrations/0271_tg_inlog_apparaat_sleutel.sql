-- 0271 — SEC-002 / integraties-04 + aanmelden-05 (12.11.2026): welke BROWSER startte een aanmelding met Telegram?
-- Vroeger alleen het grove label «Browser/Systeem» uit de User-Agent (kolom apparaat): dat kiest de aanvaller zelf, en daarmee
-- verdween de eis «nieuw apparaat → ook een toegangssleutel». Nu bewaart het verzoek de sha256 van de eigen apparaatcookie van
-- de browser (backend/apparaat-cookie.ts). NULL = de browser had geen apparaatcookie = altijd een NIEUW apparaat.
-- De tabel, haar RLS (alleen de systeemrol) en rechten bestaan al (0202); hier komt alleen de kolom bij. Herhaalbaar.
ALTER TABLE app.tg_inlog_verzoeken
  ADD COLUMN IF NOT EXISTS apparaat_sleutel text CHECK (apparaat_sleutel IS NULL OR apparaat_sleutel ~ '^[a-f0-9]{64}$');

COMMENT ON COLUMN app.tg_inlog_verzoeken.apparaat_sleutel IS
  'sha256 van de apparaatcookie van de browser die de aanmelding startte (NULL = geen cookie = nieuw apparaat). Nooit de cookie zelf.';
