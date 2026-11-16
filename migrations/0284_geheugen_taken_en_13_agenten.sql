-- 0284 (stroom-geheugen): Розширення реєстрів ШІ-агентів до повної матриці з 13 агентів
-- (+windsurf, cline, devin, opencode) та таблиці безперервного переходу задач між сесіями й агентами
-- під суворим RLS (user_id = app.huidige_gebruiker() і ruimte 'prive' | 'technisch'):
--   1) app.geheugen_taken         — наскрізні задачі користувача з прив’язкою до Стріму пам’яті, ботів та карток afstemming.
--   2) app.geheugen_taak_stappen  — аудитований ланцюжок передач естафети, прогресу, рішень і доказів між агентами/сесіями.

DO $uitbreiden_13_agenten$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND con.contype = 'c'
      AND (
        (c.relname = 'ai_site_schakelaars' AND pg_get_constraintdef(con.oid) LIKE '%sleutel%' AND pg_get_constraintdef(con.oid) LIKE '%agent:%')
        OR (c.relname = 'ai_gebruiker_caps' AND pg_get_constraintdef(con.oid) LIKE '%klant%')
        OR (c.relname IN ('mcp_oauth_auth', 'mcp_oauth_tokens', 'connector_v2_rechten', 'connector_v2_voorkeur', 'agent_kleuren', 'extensie_matrix') AND pg_get_constraintdef(con.oid) LIKE '%agent%')
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', r.nspname, r.relname, r.conname);
  END LOOP;

  IF to_regclass('app.ai_site_schakelaars') IS NOT NULL THEN
    ALTER TABLE app.ai_site_schakelaars
      ADD CONSTRAINT ai_site_schakelaars_sleutel_check
      CHECK (sleutel ~ '^(agent:(grok|claude|chatgpt|codex|gemini|copilot|cursor|antigravity|autoclaw|windsurf|cline|devin|opencode)|methode:(mcp|token)|cap:[a-z][a-z0-9.]{1,40})$');
  END IF;

  IF to_regclass('app.ai_gebruiker_caps') IS NOT NULL THEN
    ALTER TABLE app.ai_gebruiker_caps
      ADD CONSTRAINT ai_gebruiker_caps_klant_check
      CHECK (klant IN ('grok', 'claude', 'chatgpt', 'codex', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;

  IF to_regclass('app.mcp_oauth_auth') IS NOT NULL THEN
    ALTER TABLE app.mcp_oauth_auth
      ADD CONSTRAINT mcp_oauth_auth_agent_check
      CHECK (agent IS NULL OR agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;

  IF to_regclass('app.mcp_oauth_tokens') IS NOT NULL THEN
    ALTER TABLE app.mcp_oauth_tokens
      ADD CONSTRAINT mcp_oauth_tokens_agent_check
      CHECK (agent IS NULL OR agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;

  IF to_regclass('app.connector_v2_rechten') IS NOT NULL THEN
    ALTER TABLE app.connector_v2_rechten
      ADD CONSTRAINT connector_v2_rechten_agent_check
      CHECK (agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;

  IF to_regclass('app.connector_v2_voorkeur') IS NOT NULL THEN
    ALTER TABLE app.connector_v2_voorkeur
      ADD CONSTRAINT connector_v2_voorkeur_agent_check
      CHECK (agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;

  IF to_regclass('app.agent_kleuren') IS NOT NULL THEN
    ALTER TABLE app.agent_kleuren
      ADD CONSTRAINT agent_kleuren_agent_check
      CHECK (agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;

  IF to_regclass('app.extensie_matrix') IS NOT NULL THEN
    ALTER TABLE app.extensie_matrix
      ADD CONSTRAINT extensie_matrix_agent_check
      CHECK (agent IN ('*', 'claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode'));
  END IF;
END
$uitbreiden_13_agenten$;

CREATE TABLE IF NOT EXISTS app.geheugen_taken (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              text        NOT NULL CHECK (user_id <> ''),
  ruimte               text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  taak_sleutel         text        NOT NULL CHECK (taak_sleutel ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$'),
  titel                text        NOT NULL CHECK (char_length(titel) BETWEEN 1 AND 240),
  doel                 text        NOT NULL DEFAULT '' CHECK (char_length(doel) <= 4000),
  status               text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'bezig', 'wacht_op_eigenaar', 'klaar', 'gepauzeerd', 'geannuleerd')),
  prioriteit           text        NOT NULL DEFAULT 'normaal' CHECK (prioriteit IN ('laag', 'normaal', 'hoog', 'kritiek')),
  huidige_agent        text        NOT NULL DEFAULT '' CHECK (char_length(huidige_agent) <= 48),
  laatste_knoop_id     uuid        REFERENCES app.geheugen_stroom_knopen(id) ON DELETE SET NULL,
  laatste_bezorging_id uuid        REFERENCES app.geheugen_telegram_bezorging(id) ON DELETE SET NULL,
  afstemming_kaart_id  text        NOT NULL DEFAULT '' CHECK (char_length(afstemming_kaart_id) <= 120),
  afstemming_extern_id text        NOT NULL DEFAULT '' CHECK (char_length(afstemming_extern_id) <= 80),
  geheugen_sleutels    text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(geheugen_sleutels, 1), 0) <= 64),
  eigenaar_vereist     boolean     NOT NULL DEFAULT false,
  aangemaakt_op        timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, taak_sleutel)
);

CREATE INDEX IF NOT EXISTS geheugen_taken_lade_idx
  ON app.geheugen_taken (user_id, ruimte, status, bijgewerkt_op DESC);

CREATE INDEX IF NOT EXISTS geheugen_taken_agent_idx
  ON app.geheugen_taken (user_id, ruimte, huidige_agent, status)
  WHERE huidige_agent <> '';

COMMENT ON TABLE app.geheugen_taken IS
  'Doorlopende taken van de Stroom van geheugen per gebruiker en ruimte voor overdracht tussen sessies, 13 AI-agenten, Telegram-bots en afstemming.';

ALTER TABLE app.geheugen_taken ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_taken FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_taken_eigen ON app.geheugen_taken;
CREATE POLICY geheugen_taken_eigen ON app.geheugen_taken
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.geheugen_taak_stappen (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              text        NOT NULL CHECK (user_id <> ''),
  ruimte               text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  taak_id              uuid        NOT NULL REFERENCES app.geheugen_taken(id) ON DELETE CASCADE,
  stap_soort           text        NOT NULL CHECK (stap_soort IN ('aangemaakt', 'voortgang', 'overdracht', 'besluit', 'bewijs', 'pauze', 'afgerond')),
  van_agent            text        NOT NULL DEFAULT '' CHECK (char_length(van_agent) <= 48),
  naar_agent           text        NOT NULL DEFAULT '' CHECK (char_length(naar_agent) <= 48),
  samenvatting         text        NOT NULL CHECK (char_length(samenvatting) BETWEEN 1 AND 4000),
  knoop_id             uuid        REFERENCES app.geheugen_stroom_knopen(id) ON DELETE SET NULL,
  bezorging_id         uuid        REFERENCES app.geheugen_telegram_bezorging(id) ON DELETE SET NULL,
  bestands_verwijzingen jsonb      NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bestands_verwijzingen) = 'array' AND pg_column_size(bestands_verwijzingen) <= 16384),
  aangemaakt_op        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geheugen_taak_stappen_taak_idx
  ON app.geheugen_taak_stappen (taak_id, aangemaakt_op DESC);

CREATE INDEX IF NOT EXISTS geheugen_taak_stappen_lade_idx
  ON app.geheugen_taak_stappen (user_id, ruimte, aangemaakt_op DESC);

COMMENT ON TABLE app.geheugen_taak_stappen IS
  'Chronologische stappen en overdrachten van taken tussen AI-agenten en sessies binnen één geïsoleerde ruimte.';

ALTER TABLE app.geheugen_taak_stappen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_taak_stappen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_taak_stappen_eigen ON app.geheugen_taak_stappen;
CREATE POLICY geheugen_taak_stappen_eigen ON app.geheugen_taak_stappen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
