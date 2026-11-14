-- 0272 — SEC-002 / post-06 (12.11.2026): keuze per mens en ruimte voor het logo van het domein van een afzender.
-- De server haalt dat logo zelf op (DNS + HTTPS naar het organisatiedomein van de afzender). Voor een afzender die de mens niet
-- kent is dat een spoor: de eigenaar van dat domein ziet dat en wanneer de lijst van de post zijn bericht toonde.
--   NULL  = nog niets gekozen: de standaard van de code (backend/merk-bron.ts → ONBEKENDE_AFZENDERS_STANDAARD);
--   true  = ook voor onbekende afzenders;
--   false = alleen voor bekende diensten en voor afzenders die de mens bevestigde, in zijn contacten heeft of zelf schreef.
-- De tabel, haar RLS en haar rechten bestaan al (0097); hier komt alleen de kolom bij. Herhaalbaar.
ALTER TABLE app.afzender_beeld_voorkeur
  ADD COLUMN IF NOT EXISTS onbekende_afzenders boolean;

COMMENT ON COLUMN app.afzender_beeld_voorkeur.onbekende_afzenders IS
  'Logo ook ophalen voor afzenders die de mens niet kent (NULL = standaard van de code; false = alleen bekende diensten en eigen contacten).';
