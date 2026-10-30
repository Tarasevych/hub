-- db-rollen-terug.sql — terugdraaien van db-rollen.sql (via db-rollen-instellen.sh terugdraaien, als postgres).
-- Eigendom terug naar de oude rol (DATABASE_URL), FORCE RLS uit, afdwingen uit. De drie rollen blijven bestaan
-- (zonder gebruik); opnieuw 'instellen' kan altijd. Variabele: legacy_rol.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
SELECT format('ALTER SCHEMA app OWNER TO %I', :'legacy_rol') \gexec
SELECT format('ALTER TABLE app.%I OWNER TO %I', tablename, :'legacy_rol') FROM pg_tables WHERE schemaname = 'app' \gexec
SELECT format('ALTER FUNCTION %s OWNER TO %I', p.oid::regprocedure, :'legacy_rol')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' \gexec
SELECT 'ALTER TABLE app.records NO FORCE ROW LEVEL SECURITY' WHERE to_regclass('app.records') IS NOT NULL \gexec
SELECT $$UPDATE app.rls_instellingen SET waarde = 'uit', bijgewerkt = now() WHERE sleutel = 'afdwingen'$$ WHERE to_regclass('app.rls_instellingen') IS NOT NULL \gexec
