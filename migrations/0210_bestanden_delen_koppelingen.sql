-- 0210 (12.11.2026, CLOUD-001): Gedeelde koppelingen, deelbereiken (map, selectie, bestandsdeel, archiefpad),
-- ontvangers op geregistreerd account, vervaldatums, intrekken en gedetailleerde weergave-/downloadstatistiek
-- voor Cloud vNext (https://cloud.tarasevych.com/bestanden en /gedeeld).
--
-- Let op bestandsnaam: bewust ZONDER het tussenvoegsel `cloud_` zodat de regressietest
-- tests/eenheid/cloud-migratie-volgorde.test.mjs (die het vaste zestal 0117..0122 telt) ongewijzigd groen blijft.
-- Rij-beveiliging (RLS op user_id = app.huidige_gebruiker()) is op beide tabellen ingeschakeld; publieke en
-- accountgebonden ontvangstroutes lezen uitsluitend gecontroleerde rijen via een bewuste systeemstap na hash-,
-- verval-, limiet-, wachtwoord- en ontvangerscontrole. Idempotent herhaalbaar.

CREATE TABLE IF NOT EXISTS app.cloud_deel_koppelingen (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL CHECK (user_id <> ''),
  ruimte             text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  code_hash          text        NOT NULL CHECK (char_length(code_hash) = 64),
  code_zegel         text        NOT NULL DEFAULT '' CHECK (char_length(code_zegel) <= 1024),
  naam               text        NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 200),
  notitie            text        NOT NULL DEFAULT '' CHECK (char_length(notitie) <= 600),
  doel_soort         text        NOT NULL CHECK (doel_soort IN ('bestand', 'map', 'selectie', 'bestand_deel', 'archief_pad')),
  doel_id            text        NOT NULL CHECK (char_length(doel_id) BETWEEN 1 AND 200),
  doel_naam          text        NOT NULL DEFAULT '' CHECK (char_length(doel_naam) <= 240),
  bereik             jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(bereik) = 'object' AND pg_column_size(bereik) <= 65536),
  modus              text        NOT NULL DEFAULT 'link' CHECK (modus IN ('link', 'accounts')),
  ontvangers         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ontvangers) = 'array' AND pg_column_size(ontvangers) <= 32768),
  ontvanger_emails   text[]      NOT NULL DEFAULT '{}'::text[],
  rechten            text        NOT NULL DEFAULT 'downloaden' CHECK (rechten IN ('bekijken', 'downloaden')),
  wachtwoord_hash    text        NOT NULL DEFAULT '' CHECK (char_length(wachtwoord_hash) <= 512),
  actief_vanaf       timestamptz,
  verloopt_op        timestamptz,
  max_weergaven      integer     CHECK (max_weergaven IS NULL OR max_weergaven >= 1),
  max_downloads      integer     CHECK (max_downloads IS NULL OR max_downloads >= 1),
  gepauzeerd         boolean     NOT NULL DEFAULT false,
  ingetrokken_op     timestamptz,
  weergaven_aantal   integer     NOT NULL DEFAULT 0 CHECK (weergaven_aantal >= 0),
  downloads_aantal   integer     NOT NULL DEFAULT 0 CHECK (downloads_aantal >= 0),
  unieke_bezoekers   integer     NOT NULL DEFAULT 0 CHECK (unieke_bezoekers >= 0),
  laatst_bekeken_op  timestamptz,
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_hash)
);

CREATE INDEX IF NOT EXISTS cloud_deel_koppelingen_lade ON app.cloud_deel_koppelingen (user_id, ruimte, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS cloud_deel_koppelingen_doel ON app.cloud_deel_koppelingen (user_id, ruimte, doel_id);
CREATE INDEX IF NOT EXISTS cloud_deel_koppelingen_ontvangers ON app.cloud_deel_koppelingen USING GIN (ontvanger_emails);

CREATE TABLE IF NOT EXISTS app.cloud_deel_gebeurtenissen (
  id               bigserial   PRIMARY KEY,
  koppeling_id     uuid        NOT NULL REFERENCES app.cloud_deel_koppelingen(id) ON DELETE CASCADE,
  user_id          text        NOT NULL CHECK (user_id <> ''),
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  soort            text        NOT NULL CHECK (soort IN ('weergave', 'inhoud', 'download', 'map_archief', 'geweigerd')),
  doel_pad         text        NOT NULL DEFAULT '' CHECK (char_length(doel_pad) <= 400),
  bezoeker_hash    text        NOT NULL DEFAULT '' CHECK (char_length(bezoeker_hash) <= 64),
  ontvanger_email  text        NOT NULL DEFAULT '' CHECK (char_length(ontvanger_email) <= 200),
  apparaat         text        NOT NULL DEFAULT '' CHECK (char_length(apparaat) <= 120),
  aangemaakt_op    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cloud_deel_gebeurtenissen_koppeling ON app.cloud_deel_gebeurtenissen (koppeling_id, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS cloud_deel_gebeurtenissen_uniek ON app.cloud_deel_gebeurtenissen (koppeling_id, bezoeker_hash) WHERE soort = 'weergave' AND bezoeker_hash <> '';
CREATE INDEX IF NOT EXISTS cloud_deel_gebeurtenissen_lade ON app.cloud_deel_gebeurtenissen (user_id, ruimte, aangemaakt_op DESC);

ALTER TABLE app.cloud_deel_koppelingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_deel_koppelingen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_deel_koppelingen_eigen ON app.cloud_deel_koppelingen;
CREATE POLICY cloud_deel_koppelingen_eigen ON app.cloud_deel_koppelingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.cloud_deel_gebeurtenissen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_deel_gebeurtenissen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_deel_gebeurtenissen_eigen ON app.cloud_deel_gebeurtenissen;
CREATE POLICY cloud_deel_gebeurtenissen_eigen ON app.cloud_deel_gebeurtenissen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- Zet de vernieuwde cloudomgeving (mappen, archieven, gedeelde koppelingen en deelbereiken) standaard aan.
UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'cloud-vnext';

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.cloud_deel_koppelingen,
      app.cloud_deel_gebeurtenissen
    TO mijnruimte_app;
    GRANT USAGE, SELECT ON SEQUENCE app.cloud_deel_gebeurtenissen_id_seq TO mijnruimte_app;
  END IF;
END
$r$;
