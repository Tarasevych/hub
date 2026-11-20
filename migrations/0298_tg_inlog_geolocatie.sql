-- 0298 — TELEGRAM-004 (16.11.2026, eis van de eigenaar): de plaats van het vragende toestel OOK volgens het toestel zelf
-- (geolocatie van de browser, alleen na toestemming van de gebruiker), naast de plaats volgens het IP-adres. In het beveiligde
-- Telegram-venster staan beide naast elkaar, zodat een afwijking (mogelijke oplichting, of een VPN) zichtbaar is.
--
-- Privacy: coördinaten afgerond op 2 decimalen (≈ 1 km), alleen bij het aanmeldverzoek bewaard; nooit in het logboek.
-- Schrijven en lezen ALLEEN via de systeemrol (zelfde patroon als 0202/0276). Herhaalbaar (IF NOT EXISTS).

-- Punt volgens het IP-adres (koppen van de tunnel, indien aanwezig); afgerond op 1 decimaal.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS ip_lat numeric(4,1) CHECK (ip_lat IS NULL OR ip_lat BETWEEN -90 AND 90);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS ip_lon numeric(4,1) CHECK (ip_lon IS NULL OR ip_lon BETWEEN -180 AND 180);
-- Punt volgens de browser (na toestemming); afgerond op 2 decimalen.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_lat numeric(5,2) CHECK (geo_lat IS NULL OR geo_lat BETWEEN -90 AND 90);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_lon numeric(5,2) CHECK (geo_lon IS NULL OR geo_lon BETWEEN -180 AND 180);
-- Nauwkeurigheid in meters zoals de browser die meldt (begrensd).
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_nauwkeurig integer CHECK (geo_nauwkeurig IS NULL OR geo_nauwkeurig BETWEEN 0 AND 1000000);
-- '' = niet gevraagd of nog geen antwoord; 'gegeven' = punt ontvangen; 'geweigerd' = gebruiker weigerde; 'mislukt' = toestel kon het niet bepalen.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_stand text NOT NULL DEFAULT '' CHECK (geo_stand IN ('','gegeven','geweigerd','mislukt'));
DO $v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tg_inlog_verzoeken_geo_volledig') THEN
    ALTER TABLE app.tg_inlog_verzoeken ADD CONSTRAINT tg_inlog_verzoeken_geo_volledig
      CHECK ((geo_stand = 'gegeven') = (geo_lat IS NOT NULL AND geo_lon IS NOT NULL));
  END IF;
END
$v$;
