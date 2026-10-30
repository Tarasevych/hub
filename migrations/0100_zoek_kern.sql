-- 0100: ZOEKKERN v2 — ÉÉN INDEX (Z1, 22.10.2026). Breidt app.zoek_objecten (0093/0094) uit tot de enige zoekindex en zet
-- de normalisatie uit SQL naar Node.
--
-- WAAROM
--   • 0093 en 0096 waren twee indexen met twee modellen; geen van beide werd gevuld. Dit is er nog één: app.zoek_objecten.
--   • app.zoek_norm() (0093) brak bij datctype = C: lower() laat niet-ASCII staan en [[:alnum:]] gooit Cyrillisch weg
--     («Харків» → «arkiv», bewezen op PG16 met C|C). Daarom berekent Node (shared/zoek-normalisatie.ts) voortaan de
--     genormaliseerde kolommen; de GENERATED kolommen die van zoek_norm afhingen worden vervangen en de functie verdwijnt.
--   • Stemmers die PG 16 ECHT heeft: dutch, english, german, french, romanian, russian (geen ukrainian/bulgarian/polish).
--     zoek_stam gebruikt ze per taal; voor de rest: 'simple' over stam_norm (lichte achtervoegselregels uit Node).
--
-- IDEMPOTENT: elke stap controleert zichzelf; opnieuw draaien verandert niets.
--
-- TERUGDRAAIEN (handmatig, volgorde van onder naar boven):
--   1. DROP TABLE IF EXISTS app.zoek_synoniemen_eigenaar;
--   2. ALTER TABLE app.zoek_bron_stand DROP COLUMN IF EXISTS stand, DROP COLUMN IF EXISTS voortgang, DROP COLUMN IF EXISTS versie;
--      ALTER TABLE app.zoek_bron_stand ADD CONSTRAINT zoek_bron_stand_bron_check CHECK (bron IN ('mail','mail_bijlage','cloud','drive','agenda','bord','github'));
--      (zelfde voor app.zoek_wachtrij: zoek_wachtrij_bron_check);
--   3. TRUNCATE app.zoek_objecten;  (de index is afgeleide data: alles komt terug door opnieuw te indexeren)
--      ALTER TABLE app.zoek_objecten DROP COLUMN zoek_stam, DROP COLUMN zoek_vector, DROP COLUMN titel_norm, DROP COLUMN stam_norm,
--        DROP COLUMN tekst_norm, DROP COLUMN omschrijving_norm, DROP COLUMN trefwoorden_norm, DROP COLUMN titels, DROP COLUMN omschrijving,
--        DROP COLUMN trefwoorden, DROP COLUMN pad, DROP COLUMN route, DROP COLUMN taal, DROP COLUMN formaat, DROP COLUMN versie, DROP COLUMN integratie;
--      ALTER TABLE app.zoek_objecten RENAME COLUMN tekst TO inhoud; ALTER TABLE app.zoek_objecten RENAME COLUMN extra TO metadata;
--      ALTER TABLE app.zoek_objecten DROP CONSTRAINT zoek_objecten_bron_check; ADD CONSTRAINT ... CHECK (bron IN ('mail','drive','cloud','calendar'));
--      daarna migrations/0093_zoek_index.sql opnieuw uitvoeren (CREATE OR REPLACE FUNCTION app.zoek_norm + de GENERATED kolommen/indexen).
--   4. DELETE FROM app.schema_migrations WHERE version = '0100_zoek_kern';
--   De code van vóór 0100 (backend/zoek-index.ts Etap A+B) werkt dan weer. Er gaan geen brongegevens verloren: de index bevat
--   uitsluitend afgeleide tekst.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ------------------------------------------------------------------------------------------------ 1. app.zoek_objecten
-- Oude GENERATED kolommen (hangen van app.zoek_norm af) en hun indexen weg. De tabel is in elke bekende installatie leeg
-- (nooit gevuld: zie de audit van 22.10.2026); is zij dat niet, dan is de inhoud afgeleide data en wordt hij opnieuw opgebouwd.
DO $$
DECLARE gen text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO gen
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'app' AND c.relname = 'zoek_objecten' AND a.attname = 'zoek_vector' AND NOT a.attisdropped;
  IF gen IS NOT NULL AND gen LIKE '%zoek_norm%' THEN
    DROP INDEX IF EXISTS app.zoek_objecten_vector_idx;
    DROP INDEX IF EXISTS app.zoek_objecten_titel_trgm_idx;
    ALTER TABLE app.zoek_objecten DROP COLUMN IF EXISTS zoek_vector;
    ALTER TABLE app.zoek_objecten DROP COLUMN IF EXISTS titel_norm;
  END IF;
END $$;

-- Hernoemingen (0093 → model v2), alleen als de oude naam nog bestaat.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'zoek_objecten' AND column_name = 'inhoud') THEN
    ALTER TABLE app.zoek_objecten RENAME COLUMN inhoud TO tekst;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'zoek_objecten' AND column_name = 'metadata') THEN
    ALTER TABLE app.zoek_objecten RENAME COLUMN metadata TO extra;
  END IF;
END $$;

ALTER TABLE app.zoek_objecten
  ADD COLUMN IF NOT EXISTS titels            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS omschrijving      text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trefwoorden       text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pad               text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS route             jsonb,
  ADD COLUMN IF NOT EXISTS taal              text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS formaat           text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS versie            text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS integratie        text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fragment_bron     text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS geindexeerd_op    timestamptz NOT NULL DEFAULT now(),
  -- door Node geschreven (shared/zoek-normalisatie.ts), nooit door SQL berekend:
  ADD COLUMN IF NOT EXISTS titel_norm        text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trefwoorden_norm  text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS omschrijving_norm text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tekst_norm        text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stam_norm         text  NOT NULL DEFAULT '';

-- bron: van een vaste lijst naar een patroon (uitbreidbaar via shared/zoek-model.ts → ZOEK_BRONNEN); 'calendar' → 'agenda'.
ALTER TABLE app.zoek_objecten DROP CONSTRAINT IF EXISTS zoek_objecten_bron_check;
UPDATE app.zoek_objecten SET bron = 'agenda' WHERE bron = 'calendar';
ALTER TABLE app.zoek_objecten ADD CONSTRAINT zoek_objecten_bron_check CHECK (bron ~ '^[a-z_]{2,32}$');
ALTER TABLE app.zoek_objecten DROP CONSTRAINT IF EXISTS zoek_objecten_taal_check;
ALTER TABLE app.zoek_objecten ADD CONSTRAINT zoek_objecten_taal_check CHECK (taal IN ('', 'uk', 'ru', 'nl', 'en', 'de', 'fr', 'pl', 'ro', 'bg'));
ALTER TABLE app.zoek_objecten DROP CONSTRAINT IF EXISTS zoek_objecten_bron_id_check;
ALTER TABLE app.zoek_objecten ADD CONSTRAINT zoek_objecten_bron_id_check CHECK (length(bron_id) BETWEEN 1 AND 700);
ALTER TABLE app.zoek_objecten DROP CONSTRAINT IF EXISTS zoek_objecten_extra_check;
ALTER TABLE app.zoek_objecten ADD CONSTRAINT zoek_objecten_extra_check CHECK (jsonb_typeof(extra) = 'object' AND pg_column_size(extra) <= 8192);

-- GENERATED tsvectors uit de door Node geschreven kolommen. to_tsvector(regconfig, text) is IMMUTABLE met een vaste config.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'zoek_objecten' AND column_name = 'zoek_vector') THEN
    ALTER TABLE app.zoek_objecten ADD COLUMN zoek_vector tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple'::regconfig, left(titel_norm, 4000)), 'A') ||
      setweight(to_tsvector('simple'::regconfig, left(trefwoorden_norm, 8000)), 'B') ||
      setweight(to_tsvector('simple'::regconfig, left(omschrijving_norm, 8000)), 'C') ||
      setweight(to_tsvector('simple'::regconfig, left(tekst_norm, 200000)), 'D')) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'zoek_objecten' AND column_name = 'zoek_stam') THEN
    ALTER TABLE app.zoek_objecten ADD COLUMN zoek_stam tsvector GENERATED ALWAYS AS (
      CASE taal
        WHEN 'nl' THEN setweight(to_tsvector('dutch'::regconfig,    left(titel, 2000) || ' ' || left(omschrijving, 4000)), 'A') || setweight(to_tsvector('dutch'::regconfig,    left(tekst, 200000)), 'D')
        WHEN 'en' THEN setweight(to_tsvector('english'::regconfig,  left(titel, 2000) || ' ' || left(omschrijving, 4000)), 'A') || setweight(to_tsvector('english'::regconfig,  left(tekst, 200000)), 'D')
        WHEN 'de' THEN setweight(to_tsvector('german'::regconfig,   left(titel, 2000) || ' ' || left(omschrijving, 4000)), 'A') || setweight(to_tsvector('german'::regconfig,   left(tekst, 200000)), 'D')
        WHEN 'fr' THEN setweight(to_tsvector('french'::regconfig,   left(titel, 2000) || ' ' || left(omschrijving, 4000)), 'A') || setweight(to_tsvector('french'::regconfig,   left(tekst, 200000)), 'D')
        WHEN 'ro' THEN setweight(to_tsvector('romanian'::regconfig, left(titel, 2000) || ' ' || left(omschrijving, 4000)), 'A') || setweight(to_tsvector('romanian'::regconfig, left(tekst, 200000)), 'D')
        WHEN 'ru' THEN setweight(to_tsvector('russian'::regconfig,  left(titel, 2000) || ' ' || left(omschrijving, 4000)), 'A') || setweight(to_tsvector('russian'::regconfig,  left(tekst, 200000)), 'D')
        ELSE setweight(to_tsvector('simple'::regconfig, left(stam_norm, 200000)), 'C')
      END) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS zoek_objecten_vector_idx ON app.zoek_objecten USING gin (zoek_vector);
CREATE INDEX IF NOT EXISTS zoek_objecten_stam_idx   ON app.zoek_objecten USING gin (zoek_stam);
CREATE INDEX IF NOT EXISTS zoek_objecten_titel_trgm_idx ON app.zoek_objecten USING gin (titel_norm public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS zoek_objecten_lade_idx ON app.zoek_objecten (user_id, ruimte, bron, bijgewerkt_op DESC);
CREATE INDEX IF NOT EXISTS zoek_objecten_lade_soort_idx ON app.zoek_objecten (user_id, ruimte, soort);

-- De SQL-normalisatie is weg: zij was locale-afhankelijk (C-locale → Cyrillisch verdwijnt). Niets hangt er meer van af.
DROP FUNCTION IF EXISTS app.zoek_norm(text);

COMMENT ON TABLE app.zoek_objecten IS 'Zoekkern v2 (0100): de ENIGE zoekindex. Lade = (user_id, ruimte). *_norm-kolommen schrijft Node (shared/zoek-normalisatie.ts); zoek_vector/zoek_stam zijn GENERATED. RLS 0094.';

-- ------------------------------------------------------------------------------------------------ 2. stand per bron (0096 →)
ALTER TABLE app.zoek_bron_stand
  ADD COLUMN IF NOT EXISTS stand     text    NOT NULL DEFAULT 'niet_gekoppeld',
  ADD COLUMN IF NOT EXISTS voortgang integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS versie    text    NOT NULL DEFAULT '';
ALTER TABLE app.zoek_bron_stand DROP CONSTRAINT IF EXISTS zoek_bron_stand_stand_check;
ALTER TABLE app.zoek_bron_stand ADD CONSTRAINT zoek_bron_stand_stand_check CHECK (stand IN ('niet_gekoppeld', 'indexeert', 'gedeeltelijk', 'fout', 'klaar'));
ALTER TABLE app.zoek_bron_stand DROP CONSTRAINT IF EXISTS zoek_bron_stand_voortgang_check;
ALTER TABLE app.zoek_bron_stand ADD CONSTRAINT zoek_bron_stand_voortgang_check CHECK (voortgang BETWEEN 0 AND 100);
ALTER TABLE app.zoek_bron_stand DROP CONSTRAINT IF EXISTS zoek_bron_stand_bron_check;
ALTER TABLE app.zoek_bron_stand ADD CONSTRAINT zoek_bron_stand_bron_check CHECK (bron ~ '^[a-z_]{2,32}$');
-- De wachtrij (Z2) moet ook nieuwe bronnen (ui, bijlage, …) kunnen dragen.
ALTER TABLE app.zoek_wachtrij DROP CONSTRAINT IF EXISTS zoek_wachtrij_bron_check;
ALTER TABLE app.zoek_wachtrij ADD CONSTRAINT zoek_wachtrij_bron_check CHECK (bron ~ '^[a-z_]{2,32}$');

-- ------------------------------------------------------------------------------------------------ 3. 0096-index: verouderd
-- Niet verwijderd in deze uitgave (terugdraaibaarheid; op andere BYOS-servers is leegte niet te bewijzen). Niemand schrijft
-- of leest er nog uit; een volgende uitgave mag hem droppen na `SELECT count(*) FROM app.zoek_document` = 0.
COMMENT ON TABLE app.zoek_document IS 'VEROUDERD sinds 0100 (22.10.2026): vervangen door app.zoek_objecten. Niet gebruiken; wordt in een latere uitgave verwijderd.';

-- ------------------------------------------------------------------------------------------------ 4. woordenboek van de eigenaar
CREATE TABLE IF NOT EXISTS app.zoek_synoniemen_eigenaar (
  user_id       text        NOT NULL,
  ruimte        text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  canoniek      text        NOT NULL CHECK (length(canoniek) BETWEEN 1 AND 120),
  taal          text        NOT NULL DEFAULT 'multi' CHECK (taal IN ('multi', 'uk', 'ru', 'nl', 'en', 'de', 'fr', 'pl', 'ro', 'bg')),
  synoniemen    text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(synoniemen) <= 64),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, canoniek)
);
ALTER TABLE app.zoek_synoniemen_eigenaar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoek_synoniemen_eigenaar_eigen ON app.zoek_synoniemen_eigenaar;
CREATE POLICY zoek_synoniemen_eigenaar_eigen ON app.zoek_synoniemen_eigenaar
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- ------------------------------------------------------------------------------------------------ 5. rechten (ook in migrations/rechten.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_objecten, app.zoek_bron_stand, app.zoek_synoniemen_eigenaar TO mijnruimte_app;
    GRANT USAGE, SELECT ON SEQUENCE app.zoek_objecten_id_seq TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_objecten, app.zoek_bron_stand, app.zoek_synoniemen_eigenaar, app.zoek_wachtrij, app.zoek_ocr_cache TO mijnruimte_system;
    GRANT USAGE, SELECT ON SEQUENCE app.zoek_objecten_id_seq TO mijnruimte_system;
  END IF;
END $$;
