-- 0093: ZOEKKERN — de universele zoekindex (Etap A+B, 21.10.2026).
--
-- Eén tabel voor elk vindbaar object (post, hmara, Drive, agenda …): app.zoek_objecten. De lade is (user_id, ruimte),
-- precies zoals shared/ruimte-scheiding.ts: zonder eigenaar én ruimte bestaat een rij niet (NOT NULL + CHECK).
-- Zoeken gebeurt in Latijnse, genormaliseerde vorm (app.zoek_norm): kleine letters → Cyrillisch (uk) naar Latijn →
-- unaccent → fonetische vouw → alleen letters/cijfers. Deze functie is de SQL-tweeling van shared/zoek-normalisatie.ts
-- (gegenereerd uit TRANSLIT/LATIJN_EXTRA/VOUW; de eenheidstest bewaakt dat ze gelijk blijven).
--   FTS:     zoek_vector (tsvector, config 'simple' — de taal is onbekend en al genormaliseerd), GIN;
--   trigram: titel_norm met gin_trgm_ops (similarity / %), voor typefouten en deelwoorden.
-- Idempotent. Geen gegevens verhuisd: de index wordt gevuld door backend/zoek-index.ts (zoekIndexBijwerken).

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- IMMUTABLE mag: unaccent krijgt het woordenboek expliciet mee (anders is het STABLE en weigert een GENERATED kolom).
CREATE OR REPLACE FUNCTION app.zoek_norm(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT btrim(regexp_replace(regexp_replace(replace(replace(replace(replace(replace(replace(replace(public.unaccent('public.unaccent'::regdictionary, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(coalesce(t, '')), 'щ', 'shch'), 'ж', 'zh'), 'ч', 'ch'), 'ш', 'sh'), 'ц', 'ts'), 'ю', 'yu'), 'я', 'ya'), 'є', 'ye'), 'ї', 'yi'), 'х', 'h'), 'а', 'a'), 'б', 'b'), 'в', 'v'), 'г', 'g'), 'ґ', 'g'), 'д', 'd'), 'е', 'e'), 'з', 'z'), 'и', 'y'), 'і', 'i'), 'й', 'y'), 'к', 'k'), 'л', 'l'), 'м', 'm'), 'н', 'n'), 'о', 'o'), 'п', 'p'), 'р', 'r'), 'с', 's'), 'т', 't'), 'у', 'u'), 'ф', 'f'), 'ь', ''), '’', ''), '''', ''), 'ʼ', ''), 'ł', 'l'), 'ß', 'ss'), 'ø', 'o'), 'æ', 'ae'), 'œ', 'oe'), 'đ', 'd'), 'ı', 'i')), 'kh', 'h'), 'w', 'v'), 'ij', 'y'), 'j', 'y'), 'y', 'i'), 'ii', 'i'), 'ii', 'i'), '[^[:alnum:]@._-]+', ' ', 'g'), '\s+', ' ', 'g')) $$;

CREATE TABLE IF NOT EXISTS app.zoek_objecten (
  id             bigserial PRIMARY KEY,
  user_id        text NOT NULL CHECK (user_id <> ''),
  ruimte         text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bron           text NOT NULL CHECK (bron IN ('mail', 'drive', 'cloud', 'calendar')),
  bron_id        text NOT NULL,
  soort          text NOT NULL DEFAULT 'overig',
  titel          text NOT NULL DEFAULT '',
  inhoud         text NOT NULL DEFAULT '',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  titel_norm     text GENERATED ALWAYS AS (app.zoek_norm(left(titel, 2000))) STORED,
  zoek_vector    tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('simple', app.zoek_norm(left(titel, 2000))), 'A') ||
                   setweight(to_tsvector('simple', app.zoek_norm(coalesce(metadata->>'onderkop', ''))), 'B') ||
                   setweight(to_tsvector('simple', app.zoek_norm(left(inhoud, 100000))), 'C')) STORED,
  UNIQUE (user_id, ruimte, bron, bron_id)
);

CREATE INDEX IF NOT EXISTS zoek_objecten_vector_idx ON app.zoek_objecten USING gin (zoek_vector);
CREATE INDEX IF NOT EXISTS zoek_objecten_titel_trgm_idx ON app.zoek_objecten USING gin (titel_norm public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS zoek_objecten_lade_idx ON app.zoek_objecten (user_id, ruimte, bron, bijgewerkt_op DESC);
