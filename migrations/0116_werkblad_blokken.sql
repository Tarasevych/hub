-- 0116 (28.10.2026, Werkblad «Blokken» — stroom A, data-laag). Ontwerp: docs/ontwerp/WERKBLAD-BLOKKEN.md.
--
-- WAT. Additief op 0114, niets wordt gewist of herschreven:
--   app.werkblad_items.blok          jsonb NULL — boom «blok in blok» van een widget of map (BlokInhoud, schema 1);
--   app.werkblad_v3_lade.blokken_backup jsonb NULL — momentopname {op, voor, na} van ALLE blokken + plekken van de lade,
--                                    bijgewerkt bij elke schrijf die blokken raakt. Herstelknop «Відновити блоки»;
--   app.werkblad_plekken             één rij per (user_id, ruimte, plek_id) voor menu/pagina/zijbalk/werkbalk, met eigen versie (409).
-- WAAROM de backup: een oudere release kent de kolom `blok` niet en vervangt items met DELETE+INSERT → `blok` zou verdwijnen.
-- De oude code raakt blokken_backup en werkblad_plekken niet aan, dus herstel blijft mogelijk.
-- Vlag 'werkblad-blokken' standaard UIT: dan negeert de app de kolom (niet gewist) en werkt alles exact zoals v3.
-- Idempotent. Terugdraaien = DROP TABLE app.werkblad_plekken; ALTER TABLE … DROP COLUMN blok / blokken_backup (v3 blijft heel).

ALTER TABLE app.werkblad_items ADD COLUMN IF NOT EXISTS blok jsonb NULL;
ALTER TABLE app.werkblad_v3_lade ADD COLUMN IF NOT EXISTS blokken_backup jsonb NULL;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'werkblad_items_blok_vorm') THEN
    ALTER TABLE app.werkblad_items ADD CONSTRAINT werkblad_items_blok_vorm CHECK (
      blok IS NULL OR (kind IN ('widget', 'folder') AND jsonb_typeof(blok) = 'object' AND jsonb_typeof(blok->'wortel') = 'object'
        AND blok->'wortel'->>'soort' = 'blok' AND pg_column_size(blok) <= 65536));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'werkblad_v3_lade_blokken_backup_vorm') THEN
    ALTER TABLE app.werkblad_v3_lade ADD CONSTRAINT werkblad_v3_lade_blokken_backup_vorm CHECK (
      blokken_backup IS NULL OR (jsonb_typeof(blokken_backup) = 'object' AND pg_column_size(blokken_backup) <= 1048576));
  END IF;
END
$c$;

CREATE TABLE IF NOT EXISTS app.werkblad_plekken (
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  plek_id        text        NOT NULL CHECK (plek_id ~ '^(menu|pagina|zijbalk|werkbalk):[a-z0-9][a-z0-9._/#-]{0,79}$'),
  blok           jsonb       NOT NULL CHECK (jsonb_typeof(blok) = 'object' AND blok->'wortel'->>'soort' = 'blok' AND pg_column_size(blok) <= 65536),
  versie         integer     NOT NULL DEFAULT 1 CHECK (versie >= 1),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, plek_id),
  FOREIGN KEY (user_id, ruimte) REFERENCES app.werkblad_v3_lade (user_id, ruimte) ON DELETE CASCADE
);
COMMENT ON TABLE app.werkblad_plekken IS 'Werkblad blokken: inhoud van plekken buiten het canvas (menu, pagina-vak, zijbalk, werkbalk). RLS op user_id; versie per plek (409).';

-- Hoogstens 64 plekken per lade (tweede vangnet naast de server).
CREATE OR REPLACE FUNCTION app.werkblad_plekken_limiet() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF (SELECT count(*) FROM app.werkblad_plekken WHERE user_id = NEW.user_id AND ruimte = NEW.ruimte) > 64 THEN
    RAISE EXCEPTION 'WERKBLAD_BLOKKEN_TE_VEEL_PLEKKEN' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS werkblad_plekken_limiet ON app.werkblad_plekken;
CREATE CONSTRAINT TRIGGER werkblad_plekken_limiet AFTER INSERT ON app.werkblad_plekken
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.werkblad_plekken_limiet();

ALTER TABLE app.werkblad_plekken ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS werkblad_plekken_eigen ON app.werkblad_plekken;
CREATE POLICY werkblad_plekken_eigen ON app.werkblad_plekken
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_plekken TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_plekken TO mijnruimte_system;
  END IF;
END
$r$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('werkblad-blokken',
  'Блоки на робочому столі (блок у блоці, власні розміри й місця значків). Werkblad-blokken. Прав не дає; вимкнення не видаляє даних блоків.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

DO $bewijs$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM app.werkblad_items WHERE blok IS NOT NULL;
  RAISE NOTICE '0116: werkblad blokken klaar (kolom blok, blokken_backup, plekken met RLS, vlag werkblad-blokken uit); items met blok: %', n;
END
$bewijs$;
