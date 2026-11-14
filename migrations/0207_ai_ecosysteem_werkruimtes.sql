-- 0207 (11.11.2026): AI-ecosysteem per gebruikersruimte ('prive' en 'technisch'):
--   1. app.ai_agent_werkruimtes     — geïsoleerde werkruimtes voor AI-agenten met begrensde toegang tot bestanden,
--                                     aangesloten diensten en de drie omgevingen (computer, browser, server);
--   2. app.ai_gedeelde_context      — gedeelde werkcontext tussen taken, aangesloten toepassingen en AI-agenten;
--   3. app.ai_agent_overdrachten    — overdracht van taken en samenwerking tussen verbonden AI-agenten en diensten
--                                     in opdracht van de gebruiker;
--   4. app.ai_ruimte_uitbreidingen  — aanpassingen en uitbreidingen van het eigen deel van de site binnen de ruimte
--                                     van het account (o.a. via OpenAI Codex, Anthropic Claude en andere hulpmiddelen).
--
-- Elke tabel heeft rij-beveiliging (RLS op user_id = app.huidige_gebruiker()) en backend/ai-ecosysteem.ts dwingt
-- in elke query bovendien `WHERE user_id = $1 AND ruimte = $2` af. Idempotent herhaalbaar.

CREATE TABLE IF NOT EXISTS app.ai_agent_werkruimtes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  naam           text        NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 120),
  beschrijving   text        NOT NULL DEFAULT '' CHECK (char_length(beschrijving) <= 1000),
  agenten        text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(agenten, 1), 0) <= 24),
  modellen       text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(modellen, 1), 0) <= 24),
  omgevingen     jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(omgevingen) = 'object' AND pg_column_size(omgevingen) <= 16384),
  bronnen        jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(bronnen) = 'object' AND pg_column_size(bronnen) <= 8192),
  actief         boolean     NOT NULL DEFAULT true,
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_agent_werkruimtes_lade ON app.ai_agent_werkruimtes (user_id, ruimte, bijgewerkt_op DESC);

CREATE TABLE IF NOT EXISTS app.ai_gedeelde_context (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  werkruimte_id  uuid        REFERENCES app.ai_agent_werkruimtes(id) ON DELETE SET NULL,
  sleutel        text        NOT NULL CHECK (sleutel ~ '^[a-z0-9][a-z0-9._:-]{1,79}$'),
  titel          text        NOT NULL CHECK (char_length(titel) BETWEEN 1 AND 160),
  inhoud         text        NOT NULL CHECK (char_length(inhoud) <= 16000),
  bron_dienst    text        NOT NULL DEFAULT 'ai' CHECK (char_length(bron_dienst) <= 40),
  bron_agent     text        NOT NULL DEFAULT '' CHECK (char_length(bron_agent) <= 40),
  koppelingen    jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(koppelingen) = 'array' AND jsonb_array_length(koppelingen) <= 32 AND pg_column_size(koppelingen) <= 16384),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, sleutel)
);
CREATE INDEX IF NOT EXISTS ai_gedeelde_context_lade ON app.ai_gedeelde_context (user_id, ruimte, bijgewerkt_op DESC);

CREATE TABLE IF NOT EXISTS app.ai_agent_overdrachten (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL CHECK (user_id <> ''),
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  werkruimte_id    uuid        REFERENCES app.ai_agent_werkruimtes(id) ON DELETE SET NULL,
  van_agent        text        NOT NULL CHECK (char_length(van_agent) BETWEEN 1 AND 40),
  naar_agent       text        NOT NULL CHECK (char_length(naar_agent) BETWEEN 1 AND 40),
  doel_dienst      text        NOT NULL DEFAULT 'ai' CHECK (char_length(doel_dienst) <= 40),
  opdracht         text        NOT NULL CHECK (char_length(opdracht) BETWEEN 1 AND 8000),
  context_sleutels text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(context_sleutels, 1), 0) <= 24),
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'bezig', 'voltooid', 'geannuleerd')),
  resultaat        text        NOT NULL DEFAULT '' CHECK (char_length(resultaat) <= 8000),
  aangemaakt_op    timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_agent_overdrachten_lade ON app.ai_agent_overdrachten (user_id, ruimte, bijgewerkt_op DESC);

CREATE TABLE IF NOT EXISTS app.ai_ruimte_uitbreidingen (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL CHECK (user_id <> ''),
  ruimte             text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  slug               text        NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  naam               text        NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 120),
  beschrijving       text        NOT NULL DEFAULT '' CHECK (char_length(beschrijving) <= 1500),
  soort              text        NOT NULL DEFAULT 'systeem_brug' CHECK (soort IN ('systeem_brug', 'werkstroom', 'paneel_actie')),
  doel_diensten      text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(doel_diensten, 1), 0) <= 16),
  omgevingen         text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(omgevingen, 1), 0) <= 8),
  config             jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object' AND pg_column_size(config) <= 24576),
  gemaakt_door_agent text        NOT NULL DEFAULT '' CHECK (char_length(gemaakt_door_agent) <= 40),
  actief             boolean     NOT NULL DEFAULT true,
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, slug)
);
CREATE INDEX IF NOT EXISTS ai_ruimte_uitbreidingen_lade ON app.ai_ruimte_uitbreidingen (user_id, ruimte, bijgewerkt_op DESC);

ALTER TABLE app.ai_agent_werkruimtes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_werkruimtes_eigen ON app.ai_agent_werkruimtes;
CREATE POLICY ai_agent_werkruimtes_eigen ON app.ai_agent_werkruimtes
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.ai_gedeelde_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_gedeelde_context_eigen ON app.ai_gedeelde_context;
CREATE POLICY ai_gedeelde_context_eigen ON app.ai_gedeelde_context
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.ai_agent_overdrachten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_overdrachten_eigen ON app.ai_agent_overdrachten;
CREATE POLICY ai_agent_overdrachten_eigen ON app.ai_agent_overdrachten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.ai_ruimte_uitbreidingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_ruimte_uitbreidingen_eigen ON app.ai_ruimte_uitbreidingen;
CREATE POLICY ai_ruimte_uitbreidingen_eigen ON app.ai_ruimte_uitbreidingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.ai_agent_werkruimtes,
      app.ai_gedeelde_context,
      app.ai_agent_overdrachten,
      app.ai_ruimte_uitbreidingen
    TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.ai_agent_werkruimtes,
      app.ai_gedeelde_context,
      app.ai_agent_overdrachten,
      app.ai_ruimte_uitbreidingen
    TO mijnruimte_system;
  END IF;
END
$r$;
