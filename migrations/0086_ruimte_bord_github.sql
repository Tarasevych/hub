-- 0086: DE RUIMTE-DIMENSIE VOOR TWEE DIENSTEN — «bord» (taken, notities, bureaublad, werkruimtes/blokken) en «github»
-- (OAuth, App, PAT-weg, MCP-adres, stand). Hoort bij migratie 0082 (app.ruimte_keuze / app.ruimte_dienst_stand) en bij
-- shared/ruimte-scheiding.ts; de poort blijft backend/ruimte-scheiding.ts → gegevensLade.
--
-- ÉÉN REGEL, EN DIE IS NIET ONDERHANDELBAAR: een rij ZONDER `ruimte` (of met NULL) is PERSOONLIJK. Daarom:
--   • verplaatst deze migratie geen enkele rij en verwijdert zij er geen;
--   • krijgen bestaande taken, notities, bureaubladen, werkruimtes, blokken en GitHub-koppelingen GEEN technische vlag:
--     alles wat er vandaag staat blijft van de persoonlijke lade van dezelfde mens;
--   • begint de technische lade dus leeg — precies wat de eigenaar vroeg («технічний простір починається порожнім»).
--
-- WAAR DE RUIMTE STAAT, PER SOORT OPSLAG
--   echte tabel      app.mcp_console_items           — taken ÉN notities van het bord staan in deze ene tabel (etiket 'hub'
--                                                      maakt er een hub-notitie van). Krijgt hier een echte kolom `ruimte`,
--                                                      zodat sqlLadeWaar('ruimte', lade) er direct op kan filteren.
--   app.records      hub_bureau_v1:<hash>            — bureaublad per gebruiker (backend/hub-bureau.ts)
--                    hub_layout_preferences_v1:<hash>— blokvoorkeuren (backend/hub-layout-preferences.ts)
--                    workspaces / workspace_blocks   — werkruimtes en blokken van de hub (backend/index.ts)
--                    github_koppeling_v1             — bewaarde GitHub-weg per (mens, pad) (migratie 0077)
--                    github_oauth_state_v1           — de eenmalige state van een lopende OAuth-flow (migratie 0077)
--                    Deze liggen als JSON in app.records; daar is `ruimte` een VELD in `data`, en ladeFilter/hoortBij
--                    (shared/ruimte-scheiding.ts) rekenen een ontbrekend veld als 'prive'. Er is dus geen DDL voor nodig —
--                    alleen de index hieronder, zodat de technische rijen snel te vinden zijn.
--
-- Idempotent: de testsuite draait alle migraties opnieuw.

-- ------------------------------------------------------------------------------------------------ bord: echte kolom
ALTER TABLE app.mcp_console_items ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive';
-- De CHECK apart (ADD CONSTRAINT IF NOT EXISTS bestaat niet in PostgreSQL): alleen de twee bekende ruimtes.
DO $bord_ruimte$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_console_items_ruimte_chk') THEN
    ALTER TABLE app.mcp_console_items ADD CONSTRAINT mcp_console_items_ruimte_chk CHECK (ruimte IN ('prive', 'technisch'));
  END IF;
END
$bord_ruimte$;
COMMENT ON COLUMN app.mcp_console_items.ruimte IS
  'Gegevenslade van deze rij: ''prive'' (standaard, en wat elke bestaande rij is) of ''technisch''. NULL of ontbrekend = prive; de poort backend/ruimte-scheiding.ts beslist uit welke lade gelezen en geschreven mag worden.';
-- Lezen gaat altijd per (mens, lade), dus die index hoort erbij; de bestaande user_id-index blijft nuttig voor de rest.
CREATE INDEX IF NOT EXISTS mcp_console_items_ruimte_idx ON app.mcp_console_items (user_id, ruimte, created_at DESC);

-- ------------------------------------------------------------------------------------------------ records: alleen een index
-- Technische rijen opzoeken (overdragen/verwijderen van een bevroren lade) mag niet over de hele tabel hoeven lopen.
-- Alleen rijen die ECHT 'technisch' zeggen staan erin; persoonlijke rijen (veld afwezig) blijven er met opzet buiten.
CREATE INDEX IF NOT EXISTS records_ruimte_technisch_idx
  ON app.records (tbl, (data->>'ruimte'))
  WHERE data->>'ruimte' = 'technisch';

-- ------------------------------------------------------------------------------------------------ bewijs dat niets verhuisde
-- Geen UPDATE, geen DELETE, geen DEFAULT die bestaande rijen herschrijft naar 'technisch'. Zou iemand dat later toevoegen,
-- dan valt deze melding op bij het migreren: zij is het enige wat deze migratie over bestaande gegevens zegt.
DO $bord_github_bewijs$
DECLARE techniek bigint;
BEGIN
  SELECT count(*) INTO techniek FROM app.mcp_console_items WHERE ruimte = 'technisch';
  RAISE NOTICE '0086: bord/github ruimte-dimensie klaar; technische bord-rijen nu: % (bij een eerste migratie altijd 0 — er is niets verplaatst)', techniek;
END
$bord_github_bewijs$;
