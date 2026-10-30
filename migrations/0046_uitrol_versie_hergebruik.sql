-- 0046: een versienummer van een mislukt, afgewezen, afgebroken of verlopen voorstel mag opnieuw worden gebruikt.
--
-- Probleem (0022): app.uitrol_voorstellen.versie was UNIQUE voor ALLE statussen. Een onderbroken upload, een afwijzing of een mislukte
-- installatie hield daarom het versienummer voor altijd vast: dezelfde versie opnieuw uploaden gaf VERSIE_BESTAAT_AL en er moest een
-- nieuw nummer worden verzonnen. Nu is de versie alleen uniek zolang het voorstel «leeft» (loopt, wacht, is goedgekeurd of is
-- geïnstalleerd). De geschiedenis van mislukte pogingen blijft staan. De sha256 zit in de passkey-challenge, dus een nieuwe poging met
-- andere inhoud kan nooit met een oude goedkeuring worden geïnstalleerd.
ALTER TABLE app.uitrol_voorstellen DROP CONSTRAINT IF EXISTS uitrol_voorstellen_versie_key;
CREATE UNIQUE INDEX IF NOT EXISTS uitrol_voorstellen_versie_levend
  ON app.uitrol_voorstellen (versie)
  WHERE status IN ('uploaden', 'wacht-op-goedkeuring', 'goedgekeurd', 'geinstalleerd');
CREATE INDEX IF NOT EXISTS uitrol_voorstellen_versie_idx ON app.uitrol_voorstellen (versie);
