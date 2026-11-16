-- 0279 — Екосистема модульних навичок і профілів ШІ-агентів (Agent Skills & MCP Studio).
-- Три таблиці під суворим RLS (ізоляція user_id + ruimte 'prive' | 'technisch'), сумісні з PostgreSQL 15+ і 18.6:
--   1) app.vaardigheden_eigen        — власні та імпортовані двомовні (uk + nl) навички з версійністю.
--   2) app.vaardigheden_agent_stand  — вмикання/вимикання будь-яких навичок для конкретного агента й простору.
--   3) app.vaardigheden_revisies     — аудит-історія версій та знімки змін для відкату й перегляду.

CREATE TABLE IF NOT EXISTS app.vaardigheden_eigen (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                text        NOT NULL CHECK (user_id <> ''),
  ruimte                 text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  slug                   text        NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  versie                 integer     NOT NULL DEFAULT 1 CHECK (versie >= 1),
  titel_uk               text        NOT NULL CHECK (char_length(titel_uk) BETWEEN 1 AND 160),
  titel_nl               text        NOT NULL CHECK (char_length(titel_nl) BETWEEN 1 AND 160),
  samenvatting_uk        text        NOT NULL CHECK (char_length(samenvatting_uk) BETWEEN 1 AND 600),
  samenvatting_nl        text        NOT NULL CHECK (char_length(samenvatting_nl) BETWEEN 1 AND 600),
  inhoud_uk              text        NOT NULL CHECK (char_length(inhoud_uk) BETWEEN 1 AND 48000),
  inhoud_nl              text        NOT NULL CHECK (char_length(inhoud_nl) BETWEEN 1 AND 48000),
  termen_uk              text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(termen_uk, 1), 0) <= 40),
  termen_nl              text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(termen_nl, 1), 0) <= 40),
  vereiste_hulpmiddelen  text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(vereiste_hulpmiddelen, 1), 0) <= 24),
  agent_koppelingen      text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(agent_koppelingen, 1), 0) <= 16),
  bron                   text        NOT NULL DEFAULT 'eigen' CHECK (bron IN ('eigen', 'geimporteerd')),
  actief                 boolean     NOT NULL DEFAULT true,
  aangemaakt_op          timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, slug)
);

CREATE INDEX IF NOT EXISTS vaardigheden_eigen_lade_idx
  ON app.vaardigheden_eigen (user_id, ruimte, bijgewerkt_op DESC);

COMMENT ON TABLE app.vaardigheden_eigen IS
  'Eigen en geïmporteerde tweetalige agentvaardigheden (uk + nl) per gebruiker en ruimte onder strikte RLS.';

ALTER TABLE app.vaardigheden_eigen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vaardigheden_eigen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vaardigheden_eigen_beleid ON app.vaardigheden_eigen;
CREATE POLICY vaardigheden_eigen_beleid ON app.vaardigheden_eigen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.vaardigheden_agent_stand (
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  agent_slug     text        NOT NULL CHECK (agent_slug = '*' OR agent_slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  vaardigheid_id text        NOT NULL CHECK (vaardigheid_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  actief         boolean     NOT NULL DEFAULT true,
  prioriteit     integer     NOT NULL DEFAULT 100 CHECK (prioriteit BETWEEN 0 AND 1000),
  notitie        text        NOT NULL DEFAULT '' CHECK (char_length(notitie) <= 400),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, agent_slug, vaardigheid_id)
);

CREATE INDEX IF NOT EXISTS vaardigheden_agent_stand_lade_idx
  ON app.vaardigheden_agent_stand (user_id, ruimte, agent_slug, bijgewerkt_op DESC);

COMMENT ON TABLE app.vaardigheden_agent_stand IS
  'Actieve status en koppeling van vaardigheden per AI-agent en gebruikersruimte onder RLS.';

ALTER TABLE app.vaardigheden_agent_stand ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vaardigheden_agent_stand FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vaardigheden_agent_stand_beleid ON app.vaardigheden_agent_stand;
CREATE POLICY vaardigheden_agent_stand_beleid ON app.vaardigheden_agent_stand
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.vaardigheden_revisies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL CHECK (user_id <> ''),
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  vaardigheid_slug text        NOT NULL CHECK (vaardigheid_slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  versie           integer     NOT NULL CHECK (versie >= 1),
  actie            text        NOT NULL CHECK (actie IN ('aangemaakt', 'bijgewerkt', 'geimporteerd', 'hersteld', 'verwijderd', 'koppeling_gewijzigd')),
  momentopname     jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(momentopname) = 'object' AND pg_column_size(momentopname) <= 131072),
  door_agent       text        NOT NULL DEFAULT '' CHECK (char_length(door_agent) <= 48),
  aangemaakt_op    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vaardigheden_revisies_lade_idx
  ON app.vaardigheden_revisies (user_id, ruimte, vaardigheid_slug, versie DESC, aangemaakt_op DESC);

COMMENT ON TABLE app.vaardigheden_revisies IS
  'Versie- en wijzigingshistorie van agentvaardigheden en agentkoppelingen onder strikte RLS.';

ALTER TABLE app.vaardigheden_revisies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vaardigheden_revisies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vaardigheden_revisies_beleid ON app.vaardigheden_revisies;
CREATE POLICY vaardigheden_revisies_beleid ON app.vaardigheden_revisies
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.vaardigheden_eigen,
      app.vaardigheden_agent_stand,
      app.vaardigheden_revisies
    TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.vaardigheden_eigen,
      app.vaardigheden_agent_stand,
      app.vaardigheden_revisies
    TO mijnruimte_system;
  END IF;
END
$r$;
