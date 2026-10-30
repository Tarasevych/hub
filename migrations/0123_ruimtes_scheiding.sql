-- 0123 — Ruimtes-scheiding (28.10.2026). Harde scheiding «prive» ↔ «technisch» van één account, en de technische sessie
-- cryptografisch gebonden aan de aanmeldsessie van de site. Achter de vlag ruimtes-scheiding (standaard UIT).
-- Vlag UIT = exact het oude gedrag: de nieuwe kolommen worden dan niet gelezen, de GUC app.ruimte wordt niet gezet en de
-- beperkende beleidsregels hieronder laten dan alles door (geen GUC = geen beperking).
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO NOTHING). Bestaande rijen krijgen 'prive': niets verhuist.
-- Zie docs/ontwerp/RUIMTES-ISOLATIE.md.

-- 1. Binding van de technische sessie aan de site-sessie (HMAC, sleutel alleen op de server; hier staat alleen het resultaat).
ALTER TABLE app.tech_ruimte_sessies ADD COLUMN IF NOT EXISTS binding_hmac text CHECK (binding_hmac IS NULL OR binding_hmac ~ '^[0-9a-f]{64}$');
ALTER TABLE app.tech_ruimte_sessies ADD COLUMN IF NOT EXISTS binding_generatie integer NOT NULL DEFAULT 0;

-- 2. Ruimte op het logboek van de MCP-console (was gedeeld voor beide ruimtes).
ALTER TABLE app.mcp_console_log ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive';
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_console_log_ruimte_geldig') THEN
    ALTER TABLE app.mcp_console_log ADD CONSTRAINT mcp_console_log_ruimte_geldig CHECK (ruimte IN ('prive', 'technisch'));
  END IF;
END
$c$;
CREATE INDEX IF NOT EXISTS mcp_console_log_ruimte ON app.mcp_console_log (user_id, ruimte, at DESC);

-- 3. De ruimte van het lopende verzoek voor RLS: app.huidige_ruimte() (NULL = niet gezet = geen beperking, oud gedrag).
CREATE OR REPLACE FUNCTION app.huidige_ruimte() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT CASE WHEN current_setting('app.ruimte', true) IN ('prive', 'technisch') THEN current_setting('app.ruimte', true) END
$f$;

-- 4. Beperkende (RESTRICTIVE) regel op elke tabel met een `ruimte`-kolom ZONDER «спільно»-stand (die lezen nooit de andere lade).
--    Alleen voor de app-rol en alleen als app.ruimte gezet is; NULL in de kolom telt als 'prive'.
DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mcp_console_log', 'werkblad_items', 'werkblad_layout', 'werkblad_indeling', 'werkblad_v3_lade', 'werkblad_plekken', 'venster_stand', 'zoek_geschiedenis'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = t AND column_name = 'ruimte') THEN
      EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON app.%I', t || '_ruimte', t);
      EXECUTE format($s$CREATE POLICY %I ON app.%I AS RESTRICTIVE FOR ALL
        USING (current_user::text <> 'mijnruimte_app' OR app.huidige_ruimte() IS NULL OR COALESCE(ruimte, 'prive') = app.huidige_ruimte())
        WITH CHECK (current_user::text <> 'mijnruimte_app' OR app.huidige_ruimte() IS NULL OR COALESCE(ruimte, 'prive') = app.huidige_ruimte())$s$, t || '_ruimte', t);
    END IF;
  END LOOP;
END
$p$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('ruimtes-scheiding',
  'Жорстке розділення просторів: технічний простір прив''язаний до сеансу входу на сайті, відповіді не кешуються, журнали окремо. Harde ruimtes-scheiding. Прав не дає й не забирає.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

DO $bewijs$
BEGIN
  RAISE NOTICE '0123: ruimtes-scheiding klaar (binding, mcp_console_log.ruimte, beperkende RLS, vlag ruimtes-scheiding uit)';
END
$bewijs$;
