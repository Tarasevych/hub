-- db-rollen.sql — drie databaserollen voor Mijn Ruimte (beveiliging fase 2). Uitvoeren als postgres
-- (superuser) in de app-database, via deploy/db-rollen-instellen.sh (dat de wachtwoorden op de VM maakt
-- en via stdin als psql-variabelen meegeeft; ze staan nooit in argumenten of logs).
-- Variabelen: legacy_rol (de rol uit DATABASE_URL, meestal mijnruimte), migrator_ww, app_ww, systeem_ww.
-- Idempotent: opnieuw uitvoeren is veilig (zelfde wachtwoorden blijven gelden als het script ze hergebruikt).
--
--   mijnruimte_migrator  eigenaar van schema app (migraties, installeer-app.sh)
--   mijnruimte_app       alleen DML, NOBYPASSRLS: verzoeken van ingelogde gebruikers (RLS geldt)
--   mijnruimte_system    BYPASSRLS: cron, webhooks, aanmelden, beheeroverzicht, back-up
-- De oude rol blijft werken (lid van mijnruimte_migrator), zodat een oudere release en terugdraaien
-- zonder de nieuwe variabelen gewoon doorlopen.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT format('CREATE ROLE %I LOGIN', r)
  FROM unnest(ARRAY['mijnruimte_migrator', 'mijnruimte_app', 'mijnruimte_system']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
ALTER ROLE mijnruimte_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE mijnruimte_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE mijnruimte_system   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS NOINHERIT;
SELECT format('ALTER ROLE mijnruimte_migrator PASSWORD %L', :'migrator_ww') \gexec
SELECT format('ALTER ROLE mijnruimte_app PASSWORD %L', :'app_ww') \gexec
SELECT format('ALTER ROLE mijnruimte_system PASSWORD %L', :'systeem_ww') \gexec

SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO mijnruimte_migrator, mijnruimte_app, mijnruimte_system', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO mijnruimte_migrator', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Eigendom naar de migrator (schema, tabellen, functies in app).
CREATE SCHEMA IF NOT EXISTS app;
ALTER SCHEMA app OWNER TO mijnruimte_migrator;
SELECT format('ALTER TABLE app.%I OWNER TO mijnruimte_migrator', tablename) FROM pg_tables WHERE schemaname = 'app' \gexec
SELECT format('ALTER FUNCTION %s OWNER TO mijnruimte_migrator', p.oid::regprocedure)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname <> 'mijn_werkruimtes' \gexec
-- app.mijn_werkruimtes() is SECURITY DEFINER en leest zelf app.records. Onder FORCE RLS zou hij als eigenaar
-- opnieuw de policy (en dus zichzelf) aanroepen → oneindige recursie. Daarom eigendom bij de BYPASSRLS-rol.
SELECT 'ALTER FUNCTION app.mijn_werkruimtes() OWNER TO mijnruimte_system' WHERE to_regprocedure('app.mijn_werkruimtes()') IS NOT NULL \gexec
-- Oude rol (DATABASE_URL) blijft alles kunnen wat hij kon: lid van de eigenaarsrol.
SELECT format('GRANT mijnruimte_migrator TO %I', :'legacy_rol')
 WHERE :'legacy_rol' <> '' AND :'legacy_rol' NOT IN ('mijnruimte_migrator', 'mijnruimte_app', 'mijnruimte_system', 'postgres')
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'legacy_rol') \gexec

-- Nieuwe tabellen van de migrator krijgen automatisch rechten voor de systeemrol (rechten.sql verfijnt).
ALTER DEFAULT PRIVILEGES FOR ROLE mijnruimte_migrator IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mijnruimte_system;
ALTER DEFAULT PRIVILEGES FOR ROLE mijnruimte_migrator IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO mijnruimte_system, mijnruimte_app;

-- RLS ook voor de eigenaar (FORCE); app.rls_vrij() stelt alle rollen behalve mijnruimte_app vrij.
SELECT 'ALTER TABLE app.records FORCE ROW LEVEL SECURITY' WHERE to_regclass('app.records') IS NOT NULL \gexec
-- Prestaties onder RLS: zonder LEAKPROOF mag Postgres de GIN-index op data niet gebruiken voor `data @> …`
-- (filters worden pas ná de policy uitgevoerd). jsonb_contains geeft geen fouten of neveneffecten op basis
-- van de inhoud. Na een major-upgrade van Postgres dit script opnieuw draaien.
ALTER FUNCTION pg_catalog.jsonb_contains(jsonb, jsonb) LEAKPROOF;
