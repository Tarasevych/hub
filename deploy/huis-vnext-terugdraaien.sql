-- Terugdraaien van Huis vNext (migratie 0128) — ALLEEN als de release is teruggedraaid naar een versie van vóór 0128 en de
-- tabellen echt weg moeten. Normaal is dit NIET nodig: een oudere release kent de tabellen niet en negeert ze; de oude
-- informatieve pagina (src/DomoticaWeergave.tsx, SmartHomeOud) leest niets uit app.huis_*. Alleen de vlag «huis-vnext» op UIT
-- zetten geeft dezelfde oude pagina zonder gegevensverlies.
--
-- Wat verloren gaat bij uitvoeren: woningen, leden, kamers/plattegrond, gekoppelde integraties (versleutelde tokens — opnieuw
-- koppelen is daarna nodig), apparaten + laatste toestanden, opdrachtenjournaal, scènes, regels, gebeurtenissen en voorstellen.
-- In Home Assistant zelf verandert NIETS. Maak daarom EERST een back-up:
--   sudo -u postgres pg_dump -Fc -t 'app.huis_*' mijnruimte > huis-vnext-$(date +%Y%m%d-%H%M%S).dump
-- Uitvoeren als migrator/eigenaar van het schema (nooit als mijnruimte_app):
--   psql "$DATABASE_URL_MIGRATIE" -v ON_ERROR_STOP=1 -f deploy/huis-vnext-terugdraaien.sql
BEGIN;
-- Eerst de RLS-beleidsregels (die van huis_woningen verwijst naar huis_leden), dan de tabellen van kind naar ouder.
DROP POLICY IF EXISTS huis_woningen_lid ON app.huis_woningen;
DROP POLICY IF EXISTS huis_leden_lid ON app.huis_leden;
DROP TABLE IF EXISTS app.huis_voorstellen;
DROP TABLE IF EXISTS app.huis_gebeurtenissen;
DROP TABLE IF EXISTS app.huis_automatiseringen;
DROP TABLE IF EXISTS app.huis_scenes;
DROP TABLE IF EXISTS app.huis_opdrachten;
DROP TABLE IF EXISTS app.huis_toestanden;
DROP TABLE IF EXISTS app.huis_apparaten;
DROP TABLE IF EXISTS app.huis_integraties;
DROP TABLE IF EXISTS app.huis_ruimtes;
DROP TABLE IF EXISTS app.huis_leden;
DROP TABLE IF EXISTS app.huis_woningen;
DELETE FROM app.feature_flags WHERE sleutel = 'huis-vnext';
DELETE FROM app.schema_migrations WHERE version = '0128_huis_vnext';
COMMIT;
