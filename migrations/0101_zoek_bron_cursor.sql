-- 0101: ZOEKEN — DE LEVENSCYCLUS VAN DE INDEX (Z2, 22.10.2026): cursors voor incrementele scans en de wachtreden per bron.
-- Breidt app.zoek_bron_stand (0096, kernkolommen uit 0100) uit; hangt alleen van 0096 af (0100 mag ervoor of erna komen).
--
-- WAAROM
--   • waterlijn / waterlijn_id — (updated_at, id) van de laatst verwerkte rij in app.records (of mcp_console_items): een scanstap
--     leest alleen wat daarna veranderde (records_updated_idx bestaat al). Zonder cursor las de oude code elke keer de hele
--     tabel via db.list(…, 1000) en zag zij brieven boven de 1000 nooit.
--   • cursor — per bron een vrij veld (jsonb): de waterlijn van ICS/CalDAV (gezien_op), later ETag/syncToken.
--   • volledig_op — wanneer de laatste afstemming op verdwenen rijen liep (eens per ZOEK_INDEX_VOLLEDIG_MIN).
--   • wacht_reden — waarom er NU niet geïndexeerd wordt zonder dat het een fout is: SLEUTELKLUIS_GESLOTEN («очікує входу»,
--     0092) of LADE_NIET_ACTIEF. De stand toont dit eerlijk in plaats van «fout».
--
-- IDEMPOTENT. Terugdraaien: ALTER TABLE app.zoek_bron_stand DROP COLUMN IF EXISTS waterlijn, DROP COLUMN IF EXISTS waterlijn_id,
--   DROP COLUMN IF EXISTS cursor, DROP COLUMN IF EXISTS volledig_op, DROP COLUMN IF EXISTS wacht_reden; — de index zelf blijft
--   staan; de volgende scan begint dan weer vooraan (geen gegevensverlies, alleen een volledige herscan).

ALTER TABLE app.zoek_bron_stand
  ADD COLUMN IF NOT EXISTS waterlijn    timestamptz NOT NULL DEFAULT to_timestamp(0),
  ADD COLUMN IF NOT EXISTS waterlijn_id text        NOT NULL DEFAULT '' CHECK (length(waterlijn_id) <= 700),
  ADD COLUMN IF NOT EXISTS cursor       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cursor) = 'object' AND pg_column_size(cursor) <= 4096),
  ADD COLUMN IF NOT EXISTS volledig_op  timestamptz,
  ADD COLUMN IF NOT EXISTS wacht_reden  text        NOT NULL DEFAULT '' CHECK (length(wacht_reden) <= 60);

-- Afstemming en planning vragen per (gebruiker, ruimte, bron) naar de laatste poging; de primaire sleutel dekt dat al.
COMMENT ON COLUMN app.zoek_bron_stand.waterlijn IS 'Z2 0101: updated_at van de laatst verwerkte bronrij (incrementele scan).';
COMMENT ON COLUMN app.zoek_bron_stand.wacht_reden IS 'Z2 0101: SLEUTELKLUIS_GESLOTEN | LADE_NIET_ACTIEF | leeg — geen fout, wel een reden om te wachten.';
