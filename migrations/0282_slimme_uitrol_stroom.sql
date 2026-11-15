-- 0282 — Розумний потік розгортання: інтелектуальні нотатки, контекстні контрольні списки та автоматичні докази перевірок.
-- 0282 — Slimme uitrolstroom: intelligente notities, contextafhankelijke controlelijsten en automatisch bewijs van controles.
--
-- Сумісно з PostgreSQL 15+ і PostgreSQL 18.6; ідемпотентно.
-- Включено суворий захист рядків (ENABLE + FORCE ROW LEVEL SECURITY) за app.huidige_gebruiker() та app.huidige_ruimte(),
-- а також повне закриття доступу для непривілейованої ролі mijnruimte_app (використовується лише контуром admin через mijnruimte_system).

CREATE TABLE IF NOT EXISTS app.uitrol_stroom_notities (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  versie         text        NOT NULL CHECK (versie ~ '^[0-9]{8}-[0-9]{6}$'),
  voorstel_id    uuid        REFERENCES app.uitrol_voorstellen(id) ON DELETE SET NULL,
  run_id         text        NOT NULL DEFAULT '' CHECK (char_length(run_id) <= 80),
  soort          text        NOT NULL DEFAULT 'eigenaar' CHECK (soort IN ('ai-duiding', 'eigenaar', 'systeem')),
  risico         text        NOT NULL DEFAULT 'normaal' CHECK (risico IN ('laag', 'normaal', 'verhoogd', 'kritiek')),
  titel_uk       text        NOT NULL CHECK (char_length(titel_uk) BETWEEN 1 AND 240),
  titel_nl       text        NOT NULL CHECK (char_length(titel_nl) BETWEEN 1 AND 240),
  inhoud_uk      text        NOT NULL CHECK (char_length(inhoud_uk) BETWEEN 1 AND 8000),
  inhoud_nl      text        NOT NULL CHECK (char_length(inhoud_nl) BETWEEN 1 AND 8000),
  onderdelen     jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(onderdelen) = 'array' AND pg_column_size(onderdelen) <= 16384),
  vastgepind     boolean     NOT NULL DEFAULT false,
  geschoond      boolean     NOT NULL DEFAULT true,
  auteur         text        NOT NULL DEFAULT '' CHECK (char_length(auteur) <= 160),
  sleutel        text        CHECK (sleutel IS NULL OR sleutel ~ '^[a-z0-9][a-z0-9._:-]{1,95}$'),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uitrol_stroom_notities_sleutel_idx
  ON app.uitrol_stroom_notities (user_id, ruimte, versie, sleutel)
  WHERE sleutel IS NOT NULL;

CREATE INDEX IF NOT EXISTS uitrol_stroom_notities_versie_idx
  ON app.uitrol_stroom_notities (user_id, ruimte, versie, vastgepind DESC, bijgewerkt_op DESC);

CREATE TABLE IF NOT EXISTS app.uitrol_stroom_controlelijsten (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              text        NOT NULL CHECK (user_id <> ''),
  ruimte               text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  versie               text        NOT NULL CHECK (versie ~ '^[0-9]{8}-[0-9]{6}$'),
  voorstel_id          uuid        REFERENCES app.uitrol_voorstellen(id) ON DELETE SET NULL,
  run_id               text        NOT NULL DEFAULT '' CHECK (char_length(run_id) <= 80),
  sleutel              text        NOT NULL CHECK (sleutel ~ '^[a-z0-9][a-z0-9._:-]{1,95}$'),
  groep                text        NOT NULL CHECK (groep IN ('voorbereiding', 'veiligheid', 'migraties', 'goedkeuring', 'nazorg', 'eigen')),
  herkomst             text        NOT NULL DEFAULT 'systeem' CHECK (herkomst IN ('systeem', 'eigenaar', 'ai')),
  verplicht            boolean     NOT NULL DEFAULT false,
  handmatig_bevestigen boolean     NOT NULL DEFAULT false,
  titel_uk             text        NOT NULL CHECK (char_length(titel_uk) BETWEEN 1 AND 240),
  titel_nl             text        NOT NULL CHECK (char_length(titel_nl) BETWEEN 1 AND 240),
  toelichting_uk       text        NOT NULL DEFAULT '' CHECK (char_length(toelichting_uk) <= 1000),
  toelichting_nl       text        NOT NULL DEFAULT '' CHECK (char_length(toelichting_nl) <= 1000),
  status               text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'geslaagd', 'waarschuwing', 'mislukt', 'overgeslagen', 'afgevinkt')),
  reden                text        NOT NULL DEFAULT '' CHECK (char_length(reden) <= 600),
  bewijs_soort         text        NOT NULL DEFAULT '' CHECK (char_length(bewijs_soort) <= 60),
  volgorde             integer     NOT NULL DEFAULT 100 CHECK (volgorde BETWEEN 0 AND 10000),
  bijgewerkt_door      text        NOT NULL DEFAULT '' CHECK (char_length(bijgewerkt_door) <= 160),
  aangemaakt_op        timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, versie, sleutel)
);

CREATE INDEX IF NOT EXISTS uitrol_stroom_controlelijsten_versie_idx
  ON app.uitrol_stroom_controlelijsten (user_id, ruimte, versie, volgorde ASC, aangemaakt_op ASC);

CREATE TABLE IF NOT EXISTS app.uitrol_stroom_bewijzen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL CHECK (user_id <> ''),
  ruimte          text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  versie          text        NOT NULL CHECK (versie ~ '^[0-9]{8}-[0-9]{6}$'),
  voorstel_id     uuid        REFERENCES app.uitrol_voorstellen(id) ON DELETE SET NULL,
  run_id          text        NOT NULL DEFAULT '' CHECK (char_length(run_id) <= 80),
  soort           text        NOT NULL CHECK (soort IN (
                    'pakket-integriteit', 'vereisten-preflight', 'migratie-proef',
                    'voorcontrole', 'ontwikkelarchief', 'testresultaten',
                    'goedkeuring-passkey', 'installatie-uitvoering', 'server-diagnose'
                  )),
  bron            text        NOT NULL CHECK (char_length(bron) BETWEEN 1 AND 80),
  status          text        NOT NULL CHECK (status IN ('geslaagd', 'waarschuwing', 'mislukt', 'overgeslagen')),
  samenvatting_uk text        NOT NULL CHECK (char_length(samenvatting_uk) BETWEEN 1 AND 1000),
  samenvatting_nl text        NOT NULL CHECK (char_length(samenvatting_nl) BETWEEN 1 AND 1000),
  pakket_sha256   text        NOT NULL DEFAULT '' CHECK (pakket_sha256 = '' OR pakket_sha256 ~ '^[0-9a-f]{64}$'),
  bewijs_data     jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(bewijs_data) = 'object' AND pg_column_size(bewijs_data) <= 65536),
  bewijs_hash     text        NOT NULL CHECK (bewijs_hash ~ '^[0-9a-f]{64}$'),
  vorige_hash     text        NOT NULL DEFAULT '' CHECK (vorige_hash = '' OR vorige_hash ~ '^[0-9a-f]{64}$'),
  geschoond       boolean     NOT NULL DEFAULT true,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, versie, soort, bewijs_hash)
);

CREATE INDEX IF NOT EXISTS uitrol_stroom_bewijzen_versie_idx
  ON app.uitrol_stroom_bewijzen (user_id, ruimte, versie, aangemaakt_op ASC, id ASC);

ALTER TABLE app.uitrol_stroom_notities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_stroom_notities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_stroom_notities_ruimte_eigen ON app.uitrol_stroom_notities;
CREATE POLICY uitrol_stroom_notities_ruimte_eigen ON app.uitrol_stroom_notities
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

ALTER TABLE app.uitrol_stroom_controlelijsten ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_stroom_controlelijsten FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_stroom_controlelijsten_ruimte_eigen ON app.uitrol_stroom_controlelijsten;
CREATE POLICY uitrol_stroom_controlelijsten_ruimte_eigen ON app.uitrol_stroom_controlelijsten
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

ALTER TABLE app.uitrol_stroom_bewijzen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_stroom_bewijzen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_stroom_bewijzen_ruimte_eigen ON app.uitrol_stroom_bewijzen;
CREATE POLICY uitrol_stroom_bewijzen_ruimte_eigen ON app.uitrol_stroom_bewijzen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON
      app.uitrol_stroom_notities,
      app.uitrol_stroom_controlelijsten,
      app.uitrol_stroom_bewijzen
    FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.uitrol_stroom_notities,
      app.uitrol_stroom_controlelijsten,
      app.uitrol_stroom_bewijzen
    TO mijnruimte_system;
  END IF;
END
$r$;
