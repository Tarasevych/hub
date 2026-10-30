-- Terugdraaien van Notities vNext (migratie 0127) — ALLEEN als de release is teruggedraaid naar een versie van vóór 0127 en
-- de tabellen echt weg moeten. Normaal is dit NIET nodig: een oudere release leest gewoon de spiegel in app.mcp_console_items
-- (elke hub-notitie staat daar met dezelfde id, titel ≤ 160, tekst ≤ 4000, ≤ 8 etiketten) en negeert app.notities.
--
-- Wat verloren gaat bij uitvoeren: de volledige inhoud van notities langer dan 4000 tekens, Oekraïense/lange etiketten, mappen,
-- revisies, de prullenbak (notities daarin staan niet in de spiegel) en de herkomst. Maak daarom EERST een back-up:
--   sudo -u postgres pg_dump -Fc -t app.notities -t app.notities_mappen -t app.notities_revisies mijnruimte > notities-vnext-$(date +%Y%m%d-%H%M%S).dump
-- Uitvoeren als migrator/eigenaar van het schema (nooit als mijnruimte_app):
--   psql "$DATABASE_URL_MIGRATIE" -v ON_ERROR_STOP=1 -f deploy/notities-vnext-terugdraaien.sql
BEGIN;
-- Notities in de prullenbak hebben geen spiegelrij meer; zet ze eerst terug op het bord, zodat niets verdwijnt.
INSERT INTO app.mcp_console_items (id, user_id, kind, title, body, status, author, tags, ruimte, created_at, updated_at)
SELECT n.id, n.user_id, 'note', left(coalesce(nullif(trim(n.titel), ''), '—'), 160), left(n.inhoud_md, 4000), NULL, left(n.auteur, 80),
       ARRAY['hub'] || CASE WHEN n.soort <> 'tekst' THEN ARRAY['soort:' || n.soort] ELSE '{}' END || CASE WHEN n.kleur <> 'geen' THEN ARRAY['kleur:' || n.kleur] ELSE '{}' END,
       n.ruimte, n.created_at, n.updated_at
  FROM app.notities n
 WHERE n.verwijderd_op IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.mcp_console_items i WHERE i.id = n.id)
ON CONFLICT (id) DO NOTHING;
DROP TABLE IF EXISTS app.notities_revisies;
DROP TABLE IF EXISTS app.notities;
DROP TABLE IF EXISTS app.notities_mappen;
DELETE FROM app.feature_flags WHERE sleutel = 'notities-vnext';
DELETE FROM app.schema_migrations WHERE version = '0127_notities_vnext';
COMMIT;
