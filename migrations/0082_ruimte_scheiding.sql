-- 0082: GESCHEIDEN GEGEVENSRUIMTES voor het technische profiel (opdracht van de eigenaar, 20.10.2026).
--
-- Waarom: tot nu scheidde shared/ai-ruimte.ts alleen welke HULPMIDDELEN een AI ziet. De GEGEVENS (pochta, hmara, dosjka,
-- kontakty, pidkljutsjennja SjI) hingen uitsluitend aan ownerUserId, dus het technische profiel en het gebruikersprofiel
-- keken in dezelfde lade. De eigenaar wil twee laden, met de keuze bij de mens die technische rechten heeft.
--
-- Twee tabellen, niets meer:
--   app.ruimte_keuze         één rij per mens: de EENMALIGE keuze (apart / samen / per_dienst), wanneer en door wie.
--                            Geen rij = nog niet gekozen = de technische ruimte is LEEG en elke dienst weigert met uitleg.
--   app.ruimte_dienst_stand  één rij per (mens, dienst): eigen / gedeeld / uit / bevroren, met wie het bevestigde en wanneer,
--                            de stand van vóór het bevriezen (zodat «teruggeven» weet waarheen) en de oorzaak van het bevriezen.
--                            Geen rij = 'uit' (de veilige richting).
--
-- GEEN RIJ GAAT VERLOREN. Deze migratie verplaatst of verwijdert geen enkel gegeven: alles wat vandaag bestaat blijft van de
-- PERSOONLIJKE ruimte. Dat werkt omdat de diensten hun rijen straks met een kolom `ruimte` taggen waarin NULL of ontbrekend
-- altijd 'prive' betekent (shared/ruimte-scheiding.ts → sqlLadeWaar / hoortBij; de eenheidstest houdt dat vast). Daarom staat
-- hier ook geen UPDATE op bestaande tabellen: er is niets om te verbouwen, alleen iets om bij te houden.
--
-- Alles per gebruiker en onder RLS (zoals 0076/0078). Schrijven doet de server met de systeemrol. Idempotent
-- (de testsuite draait alle migraties opnieuw).

CREATE TABLE IF NOT EXISTS app.ruimte_keuze (
  user_id       text        NOT NULL PRIMARY KEY,
  -- 'apart' = elke dienst eigen lade; 'samen' = elke dienst gebruikt de persoonlijke lade; 'per_dienst' = beide ruimtes
  -- naast elkaar en per dienst beslissen (begint op 'uit'). Nooit leeg: geen rij betekent «nog niet gekozen».
  gekozen       text        NOT NULL CHECK (gekozen IN ('apart', 'samen', 'per_dienst')),
  gekozen_op    timestamptz NOT NULL DEFAULT now(),
  -- Wie koos. Normaal de mens zelf; bij een besluit van de servereigenaar staat hier diens user_id.
  gekozen_door  text        NOT NULL DEFAULT '',
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.ruimte_keuze IS
  'Eenmalige keuze bij de eerste activering van het technische profiel: heeft de technische ruimte eigen gegevens, gebruikt zij de persoonlijke, of beslist de mens per dienst. Geen rij = niet gekozen = technische ruimte leeg.';

CREATE TABLE IF NOT EXISTS app.ruimte_dienst_stand (
  user_id        text        NOT NULL,
  -- Alleen diensten die echt een eigen lade kunnen hebben (shared/ruimte-scheiding.ts → DEELBARE_DIENSTEN; «notities» hoort
  -- bij 'bord', want hub-notities zijn rijen met etiket 'hub' in app.mcp_console_items).
  dienst         text        NOT NULL CHECK (dienst IN ('mail', 'cloud', 'agenda', 'contacten', 'ai', 'bord', 'github')),
  stand          text        NOT NULL DEFAULT 'uit' CHECK (stand IN ('eigen', 'gedeeld', 'uit', 'bevroren')),
  -- De stand van vóór het bevriezen, zodat «повернути» weet waarheen; teruggeven landt nooit op 'gedeeld' (dat vraagt een
  -- nieuwe bewuste daad van de mens zelf).
  vorige_stand   text        NOT NULL DEFAULT 'uit' CHECK (vorige_stand IN ('eigen', 'gedeeld', 'uit', 'bevroren')),
  gewijzigd_op   timestamptz NOT NULL DEFAULT now(),
  -- Wie het verbinden bevestigde (step-up): de mens zelf, of de servereigenaar bij een besluit over bevroren gegevens.
  bevestigd_door text        NOT NULL DEFAULT '',
  bevroren_op    timestamptz,
  bevroren_oorzaak text      NOT NULL DEFAULT '' CHECK (bevroren_oorzaak IN ('', 'rol-weg', 'profiel-ingetrokken', 'account-geblokkeerd', 'account-verwijderd')),
  PRIMARY KEY (user_id, dienst)
);
COMMENT ON TABLE app.ruimte_dienst_stand IS
  'Stand per (mens, dienst) in de TECHNISCHE ruimte: eigen gegevens, gedeeld met de persoonlijke, uit, of bevroren na verlies van technische rechten. Geen rij = uit. De persoonlijke ruimte staat hier nooit in: die is altijd toegankelijk voor haar eigenaar.';
CREATE INDEX IF NOT EXISTS ruimte_dienst_stand_bevroren_idx ON app.ruimte_dienst_stand (user_id) WHERE stand = 'bevroren';

ALTER TABLE app.ruimte_keuze ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ruimte_dienst_stand ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ruimte_keuze_eigen ON app.ruimte_keuze;
CREATE POLICY ruimte_keuze_eigen ON app.ruimte_keuze
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS ruimte_dienst_stand_eigen ON app.ruimte_dienst_stand;
CREATE POLICY ruimte_dienst_stand_eigen ON app.ruimte_dienst_stand
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
