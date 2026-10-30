-- 0094: ZOEKKERN — rij-beveiliging van app.zoek_objecten. Zelfde vorm als 0064 (mail_afzenders): de app-rol ziet en
-- schrijft UITSLUITEND rijen van app.huidige_gebruiker(). De ruimte-scheiding (prive/technisch) is niet aan de database
-- bekend; die dwingt backend/zoek-index.ts af met een verplichte `ruimte = $2` in ELKE query (lade uit de poort,
-- nooit uit het verzoek). De systeemrollen (BYPASSRLS of andere current_user) blijven vrij via de
-- `current_user`-uitzondering — gelijk aan de rest van het schema.
ALTER TABLE app.zoek_objecten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoek_objecten_eigen ON app.zoek_objecten;
CREATE POLICY zoek_objecten_eigen ON app.zoek_objecten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
