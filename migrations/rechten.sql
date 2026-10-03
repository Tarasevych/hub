-- rechten.sql: rechten van de drie databaserollen (beveiliging fase 2). GEEN genummerde migratie: wordt na
-- elke migratierun opnieuw uitgevoerd (server/migrate.ts) en door deploy/db-rollen.sql. Idempotent; doet
-- niets zolang de rollen niet bestaan (dan werkt alles met de oude ene rol, zoals vroeger).
--   mijnruimte_app     alleen DML op app.records (onder RLS) + lezen van de RLS-instellingen;
--                      app.audit alleen lezen/toevoegen (append-only).
--   mijnruimte_system  DML op alle tabellen (BYPASSRLS), behalve: app.audit alleen lezen/toevoegen
--                      (verwijderen kan alleen via app.audit_verwijderen), schema_migrations, rls_instellingen en
--                      rls_gedeelde_tabellen alleen lezen.
DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT USAGE ON SCHEMA app TO mijnruimte_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.records TO mijnruimte_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO mijnruimte_app;
    IF to_regclass('app.rls_instellingen') IS NOT NULL THEN GRANT SELECT ON app.rls_instellingen, app.rls_gedeelde_tabellen TO mijnruimte_app; END IF;
    IF to_regclass('app.audit') IS NOT NULL THEN
      REVOKE ALL ON app.audit FROM mijnruimte_app;
      GRANT SELECT, INSERT ON app.audit TO mijnruimte_app;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT USAGE ON SCHEMA app TO mijnruimte_system;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO mijnruimte_system;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO mijnruimte_system;
    REVOKE INSERT, UPDATE, DELETE ON app.schema_migrations FROM mijnruimte_system;
    -- De RLS-stand en de allowlist wijzigt alleen het rollenscript (postgres/migrator), nooit de app zelf.
    IF to_regclass('app.rls_instellingen') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.rls_instellingen, app.rls_gedeelde_tabellen FROM mijnruimte_system; END IF;
    IF to_regclass('app.audit') IS NOT NULL THEN REVOKE UPDATE, DELETE, TRUNCATE ON app.audit FROM mijnruimte_system; END IF;
  END IF;
END
$rechten$;
