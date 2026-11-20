-- 0208 (11.11.2026): Volledige tweerichtings-GitHub-werkruimte per gebruikersruimte ('prive' en 'technisch'):
--   1. app.github_spiegel_repos          — geïsoleerde spiegel van gekoppelde GitHub-opslagplaatsen binnen het eigen account,
--                                          inclusief webhook-koppeling (versleuteld HMAC-geheim), koppeling met een verbonden
--                                          apparaat (agent.mjs), bord-synchronisatie, AI-context en uitrolprofiel;
--   2. app.github_spiegel_gebeurtenissen — tweerichtingslogboek van wijzigingen (inkomend vanaf GitHub-webhooks en uitgaand
--                                          vanaf onze site naar GitHub) met idempotente levering-id;
--   3. app.github_bord_koppelingen       — tweerichtingsbrug tussen GitHub-vraagstukken/samenvoegingen en kaarten op het
--                                          takenbord (app.mcp_console_items);
--   4. app.github_eenklik_manifesten     — tijdelijke eenmalige staten voor éénkliks GitHub App-manifestregistratie en
--                                          apparaatcode-aanmelding (zonder handmatig sleutels kopiëren).
--
-- Rij-beveiliging (RLS op user_id = app.huidige_gebruiker()) is op alle vier tabellen ingeschakeld; daarnaast filtert elke
-- query op `WHERE user_id = $1 AND ruimte = $2`. Idempotent herhaalbaar.

CREATE TABLE IF NOT EXISTS app.github_spiegel_repos (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text        NOT NULL CHECK (user_id <> ''),
  ruimte                   text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  full_name                text        NOT NULL CHECK (full_name ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$'),
  standaard_tak            text        NOT NULL DEFAULT 'main' CHECK (char_length(standaard_tak) BETWEEN 1 AND 120),
  prive_repo               boolean     NOT NULL DEFAULT false,
  beschrijving             text        NOT NULL DEFAULT '' CHECK (char_length(beschrijving) <= 1000),
  taal                     text        NOT NULL DEFAULT '' CHECK (char_length(taal) <= 60),
  sterren                  integer     NOT NULL DEFAULT 0 CHECK (sterren >= 0),
  open_zaken               integer     NOT NULL DEFAULT 0 CHECK (open_zaken >= 0),
  webhook_id               bigint      NOT NULL DEFAULT 0,
  webhook_sleutel          text        NOT NULL DEFAULT '' CHECK (char_length(webhook_sleutel) <= 96),
  webhook_geheim_zegel     text        NOT NULL DEFAULT '' CHECK (char_length(webhook_geheim_zegel) <= 1024),
  apparaat_id              text        NOT NULL DEFAULT '' CHECK (char_length(apparaat_id) <= 80),
  lokaal_pad               text        NOT NULL DEFAULT '' CHECK (char_length(lokaal_pad) <= 400),
  bord_sync                boolean     NOT NULL DEFAULT false,
  ai_context_sync          boolean     NOT NULL DEFAULT false,
  uitrol_config            jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(uitrol_config) = 'object' AND pg_column_size(uitrol_config) <= 16384),
  samenvatting             jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(samenvatting) = 'object' AND pg_column_size(samenvatting) <= 32768),
  laatst_gesynchroniseerd  timestamptz,
  aangemaakt_op            timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, full_name)
);
CREATE INDEX IF NOT EXISTS github_spiegel_repos_lade ON app.github_spiegel_repos (user_id, ruimte, bijgewerkt_op DESC);
CREATE UNIQUE INDEX IF NOT EXISTS github_spiegel_repos_webhook_sleutel ON app.github_spiegel_repos (webhook_sleutel) WHERE webhook_sleutel <> '';

CREATE TABLE IF NOT EXISTS app.github_spiegel_gebeurtenissen (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  full_name      text        NOT NULL CHECK (char_length(full_name) <= 150),
  richting       text        NOT NULL CHECK (richting IN ('inkomend', 'uitgaand')),
  soort          text        NOT NULL CHECK (char_length(soort) BETWEEN 1 AND 60),
  levering_id    text        NOT NULL DEFAULT '' CHECK (char_length(levering_id) <= 120),
  samenvatting   text        NOT NULL CHECK (char_length(samenvatting) BETWEEN 1 AND 600),
  details        jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 16384),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS github_spiegel_gebeurtenissen_lade ON app.github_spiegel_gebeurtenissen (user_id, ruimte, aangemaakt_op DESC);
CREATE UNIQUE INDEX IF NOT EXISTS github_spiegel_gebeurtenissen_levering ON app.github_spiegel_gebeurtenissen (user_id, ruimte, levering_id) WHERE levering_id <> '';

CREATE TABLE IF NOT EXISTS app.github_bord_koppelingen (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  full_name      text        NOT NULL CHECK (full_name ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$'),
  issue_nummer   integer     NOT NULL CHECK (issue_nummer > 0),
  bord_item_id   text        NOT NULL CHECK (char_length(bord_item_id) BETWEEN 1 AND 120),
  laatste_staat  text        NOT NULL DEFAULT 'open' CHECK (laatste_staat IN ('open', 'closed')),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, full_name, issue_nummer)
);
CREATE INDEX IF NOT EXISTS github_bord_koppelingen_lade ON app.github_bord_koppelingen (user_id, ruimte, bijgewerkt_op DESC);

CREATE TABLE IF NOT EXISTS app.github_eenklik_manifesten (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  soort          text        NOT NULL CHECK (soort IN ('manifest', 'device')),
  state_hash     text        NOT NULL CHECK (char_length(state_hash) = 64),
  sessie_hash    text        NOT NULL DEFAULT '' CHECK (char_length(sessie_hash) <= 64),
  host           text        NOT NULL DEFAULT '' CHECK (char_length(host) <= 180),
  payload_zegel  text        NOT NULL DEFAULT '' CHECK (char_length(payload_zegel) <= 4096),
  verloopt_op    timestamptz NOT NULL,
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_hash)
);
CREATE INDEX IF NOT EXISTS github_eenklik_manifesten_lade ON app.github_eenklik_manifesten (user_id, ruimte, verloopt_op);

ALTER TABLE app.github_spiegel_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.github_spiegel_repos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS github_spiegel_repos_eigen ON app.github_spiegel_repos;
CREATE POLICY github_spiegel_repos_eigen ON app.github_spiegel_repos
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.github_spiegel_gebeurtenissen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.github_spiegel_gebeurtenissen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS github_spiegel_gebeurtenissen_eigen ON app.github_spiegel_gebeurtenissen;
CREATE POLICY github_spiegel_gebeurtenissen_eigen ON app.github_spiegel_gebeurtenissen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.github_bord_koppelingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.github_bord_koppelingen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS github_bord_koppelingen_eigen ON app.github_bord_koppelingen;
CREATE POLICY github_bord_koppelingen_eigen ON app.github_bord_koppelingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

ALTER TABLE app.github_eenklik_manifesten ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.github_eenklik_manifesten FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS github_eenklik_manifesten_eigen ON app.github_eenklik_manifesten;
CREATE POLICY github_eenklik_manifesten_eigen ON app.github_eenklik_manifesten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.github_spiegel_repos,
      app.github_spiegel_gebeurtenissen,
      app.github_bord_koppelingen,
      app.github_eenklik_manifesten
    TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.github_spiegel_repos,
      app.github_spiegel_gebeurtenissen,
      app.github_bord_koppelingen,
      app.github_eenklik_manifesten
    TO mijnruimte_system;
  END IF;
END
$r$;
