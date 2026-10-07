-- 0015: per hulpmiddel een MODUS (altijd / vragen / uit) en een goedkeuringswachtrij voor hulpmiddelen van de site zelf.
--
-- 1) connector_tool_settings.modes: {"<hulpmiddel>": "always" | "ask" | "off"}. Ontbreekt een hulpmiddel, dan geldt de standaard van het
--    hulpmiddel (lezen = always, wijzigen = ask). De oude kolom `disabled` (0012) wordt hier eenmalig naar "off" overgezet.
-- 2) connector_tool_calls: aanroepen van site-hulpmiddelen (mail, agenda, schijf, ...) die op goedkeuring wachten. Zoals bij 0010/0012:
--    alleen de systeemrol benadert de tabel, de routes filteren zelf op user_id; RLS staat aan als tweede laag, mijnruimte_app krijgt GEEN
--    rechten (rechten.sql blijft ongewijzigd).

ALTER TABLE app.connector_tool_settings ADD COLUMN IF NOT EXISTS modes jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE app.connector_tool_settings s
   SET modes = COALESCE((SELECT jsonb_object_agg(t, 'off') FROM unnest(s.disabled) AS t), '{}'::jsonb) || s.modes
 WHERE cardinality(s.disabled) > 0;

CREATE TABLE IF NOT EXISTS app.connector_tool_calls (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  tool         text        NOT NULL,
  args         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status       text        NOT NULL DEFAULT 'pending_approval'
               CHECK (status IN ('pending_approval', 'approved', 'rejected', 'succeeded', 'failed', 'timeout')),
  result       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS connector_tool_calls_user_idx ON app.connector_tool_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connector_tool_calls_pending_idx ON app.connector_tool_calls (user_id) WHERE status = 'pending_approval';

ALTER TABLE app.connector_tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connector_tool_calls_eigen ON app.connector_tool_calls;
CREATE POLICY connector_tool_calls_eigen ON app.connector_tool_calls
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());
