-- 0279 (stroom-geheugen): Стрім пам’яті — жива, хронологічна й простір-ізольована довготривала пам’ять ШІ та екосистеми.
-- Три таблиці під суворим RLS (ізоляція user_id = app.huidige_gebruiker() + ruimte 'prive' | 'technisch' у всіх запитах):
--   1) app.geheugen_stroom_knopen        — атомарні вузли пам’яті (факт, рішення, уподобання, застереження, контекст, зв’язок)
--                                          із підтримкою шифрування власним ключем (inhoud_versleuteld / dek1), закріпленням і строками дії.
--   2) app.geheugen_stroom_relaties      — граф зв’язків між вузлами (замінює, підтверджує, суперечить, залежить, посилається).
--   3) app.geheugen_stroom_gebeurtenissen  — аудитована стрічка змін, звернень та побудов контекстних пакетів пам’яті.

CREATE TABLE IF NOT EXISTS app.geheugen_stroom_knopen (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text        NOT NULL CHECK (user_id <> ''),
  ruimte                text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  werkruimte_id         uuid        REFERENCES app.ai_agent_werkruimtes(id) ON DELETE SET NULL,
  sleutel               text        NOT NULL CHECK (sleutel ~ '^[a-z0-9][a-z0-9._:-]{1,95}$'),
  soort                 text        NOT NULL DEFAULT 'feit' CHECK (soort IN ('feit', 'besluit', 'voorkeur', 'waarschuwing', 'context', 'koppeling')),
  titel                 text        NOT NULL DEFAULT '' CHECK (char_length(titel) <= 200),
  inhoud                text        NOT NULL DEFAULT '' CHECK (char_length(inhoud) <= 8000),
  samenvatting          text        NOT NULL DEFAULT '' CHECK (char_length(samenvatting) <= 600),
  inhoud_versleuteld    text,
  inhoud_hash           text        NOT NULL DEFAULT '' CHECK (char_length(inhoud_hash) <= 80),
  bron_dienst           text        NOT NULL DEFAULT 'ai' CHECK (char_length(bron_dienst) BETWEEN 1 AND 40),
  bron_agent            text        NOT NULL DEFAULT '' CHECK (char_length(bron_agent) <= 48),
  labels                text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(labels, 1), 0) <= 24),
  status                text        NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'verouderd', 'gearchiveerd', 'herroepen')),
  vastgepind            boolean     NOT NULL DEFAULT false,
  gewicht               real        NOT NULL DEFAULT 1.0 CHECK (gewicht >= 0.1 AND gewicht <= 5.0),
  geldig_vanaf          timestamptz NOT NULL DEFAULT now(),
  geldig_tot            timestamptz,
  aanroepen             integer     NOT NULL DEFAULT 0 CHECK (aanroepen >= 0),
  laatst_geraadpleegd_op timestamptz,
  aangemaakt_op         timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, sleutel)
);

CREATE INDEX IF NOT EXISTS geheugen_stroom_knopen_lade_idx
  ON app.geheugen_stroom_knopen (user_id, ruimte, status, vastgepind DESC, bijgewerkt_op DESC);

CREATE INDEX IF NOT EXISTS geheugen_stroom_knopen_werkruimte_idx
  ON app.geheugen_stroom_knopen (user_id, ruimte, werkruimte_id, status)
  WHERE werkruimte_id IS NOT NULL;

COMMENT ON TABLE app.geheugen_stroom_knopen IS
  'Geheugenknopen van de Stroom van geheugen per gebruiker en ruimte: feiten, besluiten, voorkeuren, waarschuwingen en context (met DEK-versleuteling).';

ALTER TABLE app.geheugen_stroom_knopen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_stroom_knopen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_stroom_knopen_eigen ON app.geheugen_stroom_knopen;
CREATE POLICY geheugen_stroom_knopen_eigen ON app.geheugen_stroom_knopen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.geheugen_stroom_relaties (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL CHECK (user_id <> ''),
  ruimte        text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bron_knoop_id uuid        NOT NULL REFERENCES app.geheugen_stroom_knopen(id) ON DELETE CASCADE,
  doel_knoop_id uuid        NOT NULL REFERENCES app.geheugen_stroom_knopen(id) ON DELETE CASCADE,
  relatie_soort text        NOT NULL CHECK (relatie_soort IN ('vervangt', 'ondersteunt', 'spreekt_tegen', 'afhankelijk_van', 'verwijst_naar')),
  toelichting   text        NOT NULL DEFAULT '' CHECK (char_length(toelichting) <= 600),
  sterkte       real        NOT NULL DEFAULT 1.0 CHECK (sterkte >= 0.1 AND sterkte <= 3.0),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  CHECK (bron_knoop_id <> doel_knoop_id),
  UNIQUE (user_id, ruimte, bron_knoop_id, doel_knoop_id, relatie_soort)
);

CREATE INDEX IF NOT EXISTS geheugen_stroom_relaties_lade_idx
  ON app.geheugen_stroom_relaties (user_id, ruimte, bron_knoop_id, doel_knoop_id);

COMMENT ON TABLE app.geheugen_stroom_relaties IS
  'Gerichte relaties tussen geheugenknopen (vervangt, ondersteunt, spreekt_tegen, afhankelijk_van, verwijst_naar) voor versiegeschiedenis en tegenspraakdetectie.';

ALTER TABLE app.geheugen_stroom_relaties ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_stroom_relaties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_stroom_relaties_eigen ON app.geheugen_stroom_relaties;
CREATE POLICY geheugen_stroom_relaties_eigen ON app.geheugen_stroom_relaties
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.geheugen_stroom_gebeurtenissen (
  id            bigserial   PRIMARY KEY,
  user_id       text        NOT NULL CHECK (user_id <> ''),
  ruimte        text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  knoop_id      uuid        REFERENCES app.geheugen_stroom_knopen(id) ON DELETE SET NULL,
  actie         text        NOT NULL CHECK (actie IN ('aangemaakt', 'bijgewerkt', 'vastgepind', 'ontpind', 'vervangen', 'tegenspraak_gemarkeerd', 'gearchiveerd', 'hersteld', 'geraadpleegd', 'pakket_opgebouwd')),
  bron_agent    text        NOT NULL DEFAULT '' CHECK (char_length(bron_agent) <= 48),
  bron_dienst   text        NOT NULL DEFAULT 'ai' CHECK (char_length(bron_dienst) <= 40),
  details       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 8192),
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geheugen_stroom_gebeurtenissen_lade_idx
  ON app.geheugen_stroom_gebeurtenissen (user_id, ruimte, aangemaakt_op DESC);

COMMENT ON TABLE app.geheugen_stroom_gebeurtenissen IS
  'Auditstroom van wijzigingen, tegenspraakafhandeling en contextpakketten in de Stroom van geheugen.';

ALTER TABLE app.geheugen_stroom_gebeurtenissen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_stroom_gebeurtenissen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_stroom_gebeurtenissen_eigen ON app.geheugen_stroom_gebeurtenissen;
CREATE POLICY geheugen_stroom_gebeurtenissen_eigen ON app.geheugen_stroom_gebeurtenissen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
