-- 0114 (27.10.2026, Werkblad v3 — etappe A, data-laag): vrij canvas per LADE (user_id + ruimte) en per APPARAATKLASSE.
--
-- WAAROM. v2 (0112 app.werkblad_indeling) bewaart één JSONB-rij per lade, begrensd op 24 widgets en 32 KiB, zonder x/y/w/h/z en
-- zonder aparte indeling voor computer/tablet/telefoon. Een grote bibliotheek (ярлики + віджети + mappen) past daar niet in.
-- Daarom drie tabellen onder RLS, zelfde vorm als 0112:
--   app.werkblad_v3_lade   één rij per (user_id, ruimte): achtergrond, herkomst, het tijdstip van de eenmalige overzetting en
--                          de BACKUP van de v2-indeling (v2_backup) — de v2-rij zelf blijft ongewijzigd in app.werkblad_indeling;
--   app.werkblad_layout    één rij per (user_id, ruimte, apparaat): modus, canvasmaat, versie (optimistische controle → 409);
--   app.werkblad_items     één rij per object op een laag: instance_id, kind, item_id, x, y, w, h, z, locked, parent, overrides, config.
-- De server (backend/werkblad-v3.ts) normaliseert alles met shared/werkblad-v3.ts vóór het schrijven; de CHECKs hieronder zijn het
-- tweede vangnet (ook tegen een fout in de code), niet de eerste controle.
-- Vlag 'werkblad-v3' standaard UIT: zonder vlag gedraagt het werkblad zich precies als v2. Vlag uit zetten wist GEEN v3-gegevens.
-- Idempotent. Terugdraaien = DROP TABLE app.werkblad_items, app.werkblad_layout, app.werkblad_v3_lade (v2 blijft onaangeroerd).

CREATE TABLE IF NOT EXISTS app.werkblad_v3_lade (
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  achtergrond    text        NOT NULL DEFAULT 'nacht' CHECK (achtergrond IN ('geen', 'nacht', 'zee', 'woud', 'avond', 'eigen')),
  herkomst       text        NOT NULL DEFAULT 'standaard' CHECK (herkomst IN ('v2', 'standaard')),
  v2_backup      jsonb       NULL CHECK (v2_backup IS NULL OR (jsonb_typeof(v2_backup) = 'object' AND pg_column_size(v2_backup) <= 32768)),
  v2_versie      integer     NULL CHECK (v2_versie IS NULL OR v2_versie >= 1),
  versie         integer     NOT NULL DEFAULT 1 CHECK (versie >= 1),
  gemigreerd_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte)
);

CREATE TABLE IF NOT EXISTS app.werkblad_layout (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  apparaat       text        NOT NULL CHECK (apparaat IN ('computer', 'tablet', 'telefoon')),
  modus          text        NOT NULL DEFAULT 'free' CHECK (modus IN ('free', 'snap', 'flow')),
  canvas_breedte integer     NOT NULL CHECK (canvas_breedte BETWEEN 200 AND 12000),
  canvas_hoogte  integer     NOT NULL CHECK (canvas_hoogte BETWEEN 200 AND 12000),
  versie         integer     NOT NULL DEFAULT 1 CHECK (versie >= 1),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, apparaat),
  UNIQUE (id, user_id, ruimte, apparaat),
  FOREIGN KEY (user_id, ruimte) REFERENCES app.werkblad_v3_lade (user_id, ruimte) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app.werkblad_items (
  layout_id      uuid        NOT NULL,
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  apparaat       text        NOT NULL CHECK (apparaat IN ('computer', 'tablet', 'telefoon')),
  instance_id    text        NOT NULL CHECK (instance_id ~ '^[a-z0-9-]{1,40}$'),
  kind           text        NOT NULL CHECK (kind IN ('shortcut', 'folder', 'widget')),
  item_id        text        NOT NULL CHECK (item_id ~ '^(svc|pg|cmd|wdg|usr|map):[a-z0-9][a-z0-9._/-]{0,79}$'),
  x              integer     NOT NULL CHECK (x BETWEEN 0 AND 12000),
  y              integer     NOT NULL CHECK (y BETWEEN 0 AND 12000),
  w              integer     NOT NULL CHECK (w BETWEEN 24 AND 4000),
  h              integer     NOT NULL CHECK (h BETWEEN 24 AND 4000),
  z              integer     NOT NULL CHECK (z BETWEEN 1 AND 400),
  locked         boolean     NOT NULL DEFAULT false,
  parent         text        NULL CHECK (parent IS NULL OR parent ~ '^[a-z0-9-]{1,40}$'),
  title_override text        NULL CHECK (title_override IS NULL OR (char_length(title_override) BETWEEN 1 AND 60 AND title_override !~ '[<>]')),
  icon_override  text        NULL CHECK (icon_override IS NULL OR icon_override ~ '^[a-z0-9][a-z0-9:_-]{0,59}$'),
  config         jsonb       NULL CHECK (config IS NULL OR (jsonb_typeof(config) = 'object' AND pg_column_size(config) <= 6000)),
  PRIMARY KEY (layout_id, instance_id),
  UNIQUE (layout_id, z),
  CHECK ((kind = 'widget') = (item_id LIKE 'wdg:%')),
  CHECK (parent IS NULL OR (kind = 'shortcut' AND parent <> instance_id)),
  -- de lade van het item MOET die van zijn laag zijn (geen item van A op een laag van B, geen prive-item op een technische laag)
  FOREIGN KEY (layout_id, user_id, ruimte, apparaat) REFERENCES app.werkblad_layout (id, user_id, ruimte, apparaat) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS werkblad_layout_lade_idx ON app.werkblad_layout (user_id, ruimte);
CREATE INDEX IF NOT EXISTS werkblad_items_lade_idx ON app.werkblad_items (user_id, ruimte, apparaat);

-- Hoogstens 400 objecten per laag (tweede vangnet naast de normalisatie). Trigger i.p.v. CHECK: een telling over rijen.
CREATE OR REPLACE FUNCTION app.werkblad_items_limiet() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF (SELECT count(*) FROM app.werkblad_items WHERE layout_id = NEW.layout_id) > 400 THEN
    RAISE EXCEPTION 'WERKBLAD_V3_TE_VEEL_ITEMS' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$f$;
DROP TRIGGER IF EXISTS werkblad_items_limiet ON app.werkblad_items;
CREATE CONSTRAINT TRIGGER werkblad_items_limiet AFTER INSERT ON app.werkblad_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.werkblad_items_limiet();

COMMENT ON TABLE app.werkblad_v3_lade IS 'Werkblad v3 per lade (user_id + ruimte): achtergrond, herkomst, v2-backup voor terugdraaien. RLS op user_id.';
COMMENT ON TABLE app.werkblad_layout IS 'Werkblad v3: één laag per (user_id, ruimte, apparaat) met versie voor optimistische controle (409). RLS op user_id.';
COMMENT ON TABLE app.werkblad_items IS 'Werkblad v3: objecten (shortcut/folder/widget) met x,y,w,h,z per laag. RLS op user_id; lade via samengestelde FK.';

-- Rij-beveiliging: precies de vorm van 0112. De app-rol ziet en schrijft uitsluitend rijen van app.huidige_gebruiker();
-- de ruimte dwingt backend/werkblad-v3.ts af met `ruimte = $2` in ELKE query (plus de samengestelde FK hierboven).
ALTER TABLE app.werkblad_v3_lade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS werkblad_v3_lade_eigen ON app.werkblad_v3_lade;
CREATE POLICY werkblad_v3_lade_eigen ON app.werkblad_v3_lade
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
ALTER TABLE app.werkblad_layout ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS werkblad_layout_eigen ON app.werkblad_layout;
CREATE POLICY werkblad_layout_eigen ON app.werkblad_layout
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
ALTER TABLE app.werkblad_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS werkblad_items_eigen ON app.werkblad_items;
CREATE POLICY werkblad_items_eigen ON app.werkblad_items
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_v3_lade, app.werkblad_layout, app.werkblad_items TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_v3_lade, app.werkblad_layout, app.werkblad_items TO mijnruimte_system;
  END IF;
END
$r$;

-- De vlag: standaard UIT (zoals 0041). Geeft geen recht; alleen of de nieuwe weergave en de v3-routes actief zijn.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('werkblad-v3',
  'Робочий стіл v3 (вільне полотно, окремі розкладки ПК/планшет/телефон). Werkblad v3 (vrij canvas). Прав не дає; вимкнення не видаляє даних v3.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

DO $bewijs$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM app.werkblad_v3_lade;
  RAISE NOTICE '0114: werkblad v3 klaar (lade/layout/items, RLS, vlag werkblad-v3 uit); laden: %', n;
END
$bewijs$;
