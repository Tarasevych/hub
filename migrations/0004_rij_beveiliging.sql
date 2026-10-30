-- Beveiliging fase 2: row-level security (RLS) op app.records, standaard in AUDIT-modus.
--
-- Wie wordt beperkt? Alleen de databaserol `mijnruimte_app` (verzoeken van ingelogde gebruikers, zie
-- server/platform/context.ts en deploy/db-rollen-instellen.sh). Alle andere rollen zijn vrijgesteld:
--   - de eigenaar van de tabel (vandaag `mijnruimte`, na de rollenstap `mijnruimte_migrator`) omzeilt RLS
--     (geen FORCE in deze migratie; FORCE zet de rollenstap, samen met deze vrijstelling);
--   - `mijnruimte_system` heeft BYPASSRLS (cron, webhooks, aanmelden, beheeroverzicht);
--   - zolang de app nog met de oude DATABASE_URL werkt, verandert er dus NIETS.
-- Afdwingen staat UIT (app.rls_instellingen.afdwingen = 'uit'): de policy's bestaan, maar laten alles
-- door. De app logt in die modus wat geweigerd ZOU worden in app.rls_audit. Aanzetten:
--   deploy/db-rollen-instellen.sh rls-aan   (en terug: rls-uit) — zie deploy/LEESMIJ.md.
--
-- Regels voor mijnruimte_app als afdwingen 'aan' staat (app.user_id = het ingelogde account):
--   lezen:     owner_id = app.user_id
--              OF owner_id IS NULL en de tabel staat in app.rls_gedeelde_tabellen (lezen)
--              OF data.workspaceId is een ruimte waarvan je eigenaar of actief lid bent
--   schrijven: idem, maar gedeelde tabellen alleen met schrijven = true
-- Idempotent: CREATE … IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.

CREATE TABLE IF NOT EXISTS app.rls_instellingen (
  sleutel    text PRIMARY KEY,
  waarde     text NOT NULL,
  bijgewerkt timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.rls_instellingen (sleutel, waarde) VALUES ('afdwingen', 'uit') ON CONFLICT (sleutel) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.rls_gedeelde_tabellen (
  tbl         text PRIMARY KEY,
  lezen       boolean NOT NULL DEFAULT true,
  schrijven   boolean NOT NULL DEFAULT false,
  toelichting text NOT NULL DEFAULT ''
);

-- Wat in audit-modus geweigerd ZOU zijn (per route/tabel/actie samengeteld; geen ids of inhoud).
CREATE TABLE IF NOT EXISTS app.rls_audit (
  route   text NOT NULL,
  tbl     text NOT NULL,
  actie   text NOT NULL,
  aantal  bigint NOT NULL DEFAULT 0,
  eerst   timestamptz NOT NULL DEFAULT now(),
  laatst  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route, tbl, actie)
);

CREATE OR REPLACE FUNCTION app.huidige_gebruiker() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

-- true = deze rol/deze stand wordt niet beperkt (zie kop). SECURITY INVOKER: current_user is de echte rol.
CREATE OR REPLACE FUNCTION app.rls_vrij() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT current_user::text <> 'mijnruimte_app'
            OR COALESCE((SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'), 'uit') <> 'aan' $$;

-- Ruimtes waarvan het huidige account eigenaar of actief lid is. SECURITY DEFINER (eigenaar van de tabel):
-- leest workspaces/workspace_members zonder zelf door RLS te worden beperkt.
CREATE OR REPLACE FUNCTION app.mijn_werkruimtes() RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
    SELECT COALESCE(array_agg(DISTINCT w), '{}'::text[]) FROM (
      SELECT r.id AS w FROM app.records r
       WHERE r.tbl = 'workspaces' AND r.owner_id = app.huidige_gebruiker()
      UNION
      SELECT r.data->>'workspaceId' FROM app.records r
       WHERE r.tbl = 'workspace_members' AND r.owner_id = app.huidige_gebruiker() AND r.data->>'status' = 'active'
    ) x WHERE w IS NOT NULL AND app.huidige_gebruiker() IS NOT NULL
  $$;

ALTER TABLE app.records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS records_lezen ON app.records;
CREATE POLICY records_lezen ON app.records FOR SELECT USING (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.lezen))
  OR (data ? 'workspaceId' AND data->>'workspaceId' IN (SELECT unnest(app.mijn_werkruimtes())))
);

DROP POLICY IF EXISTS records_toevoegen ON app.records;
CREATE POLICY records_toevoegen ON app.records FOR INSERT WITH CHECK (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
  OR (data ? 'workspaceId' AND data->>'workspaceId' IN (SELECT unnest(app.mijn_werkruimtes())))
);

DROP POLICY IF EXISTS records_wijzigen ON app.records;
CREATE POLICY records_wijzigen ON app.records FOR UPDATE USING (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
  OR (data ? 'workspaceId' AND data->>'workspaceId' IN (SELECT unnest(app.mijn_werkruimtes())))
) WITH CHECK (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
  OR (data ? 'workspaceId' AND data->>'workspaceId' IN (SELECT unnest(app.mijn_werkruimtes())))
);

DROP POLICY IF EXISTS records_verwijderen ON app.records;
CREATE POLICY records_verwijderen ON app.records FOR DELETE USING (
  (SELECT app.rls_vrij())
  OR owner_id = (SELECT app.huidige_gebruiker())
  OR (owner_id IS NULL AND tbl IN (SELECT g.tbl FROM app.rls_gedeelde_tabellen g WHERE g.schrijven))
  OR (data ? 'workspaceId' AND data->>'workspaceId' IN (SELECT unnest(app.mijn_werkruimtes())))
);
