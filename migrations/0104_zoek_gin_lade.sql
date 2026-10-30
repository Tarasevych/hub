-- 0104: ZOEKKERN — samengestelde GIN-indexen per lade (Z1, 22.10.2026; na de prestatiemeting van Z5: p95 463 ms op 10 000 rijen).
--
-- WAAROM. Een zoekopdracht filtert altijd op (user_id, ruimte) ÉN op zoek_vector/zoek_stam. Met losse indexen kiest de planner
-- de b-tree op de lade en voert dan de tsquery per rij uit; met btree_gin kan één GIN-scan beide voorwaarden tegelijk nemen,
-- zodat alleen de rijen van DEZE lade die de woorden écht bevatten worden gelezen. De oude GIN-indexen blijven (voor
-- queries zonder lade, bv. beheerstatistiek).
--
-- IDEMPOTENT. TERUGDRAAIEN: DROP INDEX IF EXISTS app.zoek_objecten_lade_vector_idx, app.zoek_objecten_lade_stam_idx;
--   DELETE FROM app.schema_migrations WHERE version = '0104_zoek_gin_lade'; (de extensie btree_gin mag blijven staan.)
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;
CREATE INDEX IF NOT EXISTS zoek_objecten_lade_vector_idx ON app.zoek_objecten USING gin (user_id, ruimte, zoek_vector);
CREATE INDEX IF NOT EXISTS zoek_objecten_lade_stam_idx   ON app.zoek_objecten USING gin (user_id, ruimte, zoek_stam);
