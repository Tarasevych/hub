-- rechten.sql: rechten van de drie databaserollen (beveiliging fase 2). GEEN genummerde migratie: wordt na
-- elke migratierun opnieuw uitgevoerd (server/migrate.ts) en door deploy/db-rollen.sql. Idempotent; doet
-- niets zolang de rollen niet bestaan (dan werkt alles met de oude ene rol, zoals vroeger).
--   mijnruimte_app     alleen DML op app.records (onder RLS) + lezen van de RLS-instellingen;
--                      app.audit: geen tabelrechten, alleen EXECUTE op app.audit_toevoegen (audit-fix 4).
--   mijnruimte_system  DML op alle tabellen (BYPASSRLS), behalve: app.audit alleen lezen (toevoegen via
--                      app.audit_toevoegen, verwijderen via app.audit_verwijderen), app.audit_kop en
--                      app.audit_beheerders alleen lezen, schema_migrations, rls_instellingen en
--                      rls_gedeelde_tabellen alleen lezen.
DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT USAGE ON SCHEMA app TO mijnruimte_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.records TO mijnruimte_app;
    -- 0009: Local Machine Connector. Onder RLS (policy op user_id); het WebSocket-kanaal en het koppelen van een
    -- agent lopen via de systeemrol, de eigenaar-UI via deze rol.
    IF to_regclass('app.agents') IS NOT NULL THEN GRANT SELECT, INSERT, UPDATE, DELETE ON app.agents, app.agent_pairing_codes, app.agent_commands TO mijnruimte_app; END IF;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO mijnruimte_app;
    IF to_regclass('app.rls_instellingen') IS NOT NULL THEN GRANT SELECT ON app.rls_instellingen, app.rls_gedeelde_tabellen TO mijnruimte_app; END IF;
    -- Audit-fix 9: de users-trigger telt (audit-modus) via deze functie; de app kan rls_audit zelf niet schrijven.
    IF to_regprocedure('app.rls_audit_noteren(text, text, text)') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION app.rls_audit_noteren(text, text, text) TO mijnruimte_app; END IF;
    IF to_regclass('app.audit') IS NOT NULL THEN
      -- Audit-fix 4: geen directe INSERT meer (vervalste rijen met eigen seq/hash braken de keten). Alleen via
      -- app.audit_toevoegen (SECURITY DEFINER); niet lezen, wijzigen of verwijderen.
      REVOKE ALL ON app.audit FROM mijnruimte_app;
      IF to_regclass('app.audit_kop') IS NOT NULL THEN REVOKE ALL ON app.audit_kop FROM mijnruimte_app; END IF;
      IF to_regclass('app.audit_beheerders') IS NOT NULL THEN REVOKE ALL ON app.audit_beheerders FROM mijnruimte_app; END IF;
      GRANT EXECUTE ON FUNCTION app.audit_toevoegen(text, text, text, text, text, jsonb, text, text, text) TO mijnruimte_app;
      REVOKE EXECUTE ON FUNCTION app.audit_verwijderen(text, text, timestamptz, text) FROM PUBLIC, mijnruimte_app;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT USAGE ON SCHEMA app TO mijnruimte_system;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO mijnruimte_system;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO mijnruimte_system;
    REVOKE INSERT, UPDATE, DELETE ON app.schema_migrations FROM mijnruimte_system;
    -- De RLS-stand en de allowlist wijzigt alleen het rollenscript (postgres/migrator), nooit de app zelf.
    IF to_regclass('app.rls_instellingen') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.rls_instellingen, app.rls_gedeelde_tabellen FROM mijnruimte_system; END IF;
    IF to_regclass('app.audit') IS NOT NULL THEN
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.audit FROM mijnruimte_system;
      IF to_regclass('app.audit_kop') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.audit_kop FROM mijnruimte_system; END IF;
      -- Wie audit mag verwijderen, bepaalt alleen postgres/de migrator (db-rollen-instellen.sh audit-beheerder).
      IF to_regclass('app.audit_beheerders') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.audit_beheerders FROM mijnruimte_system; END IF;
      GRANT EXECUTE ON FUNCTION app.audit_toevoegen(text, text, text, text, text, jsonb, text, text, text) TO mijnruimte_system;
      GRANT EXECUTE ON FUNCTION app.audit_verwijderen(text, text, timestamptz, text) TO mijnruimte_system;
    END IF;
  END IF;
END
$rechten$;

-- Audit-fix 10: hoogstens één eigenaar-account (role 'owner') — ook bij twee gelijktijdige eerste aanmeldingen.
-- Staat hier (niet in een genummerde migratie) zodat hij alsnog wordt aangemaakt zodra een dubbele (verouderde)
-- eigenaar is opgeschoond: de app degradeert die bij het opstarten en bij aanmelden; de volgende migratierun
-- (of db-rollen-instellen.sh instellen) maakt de index dan aan.
DO $een_eigenaar$
BEGIN
  IF to_regclass('app.records_een_eigenaar') IS NULL AND to_regclass('app.records') IS NOT NULL THEN
    IF (SELECT count(*) FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner') <= 1 THEN
      CREATE UNIQUE INDEX records_een_eigenaar ON app.records ((tbl)) WHERE tbl = 'users' AND data->>'role' = 'owner';
    ELSE
      RAISE WARNING 'meer dan één eigenaar-account: unieke index records_een_eigenaar nog niet aangemaakt (zie deploy/RUNBOOK-AUDIT-FIXES.md)';
    END IF;
  END IF;
END
$een_eigenaar$;
