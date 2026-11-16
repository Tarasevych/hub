-- 0278 — GEMINI-002: Єдина екосистема споживчих сповіщень («застосунок у застосунку»).
-- Три таблиці під суворим RLS (ізоляція user_id + ruimte 'prive' | 'technisch'):
--   1) app.melding_ecosysteem_profiel — персональні налаштування панелі, геометрія, жести, канали, ШІ.
--   2) app.melding_ecosysteem_gebeurtenissen — уніфікований потік сповіщень (сайт, ПК-агент, розширення, пошта, хмара, ШІ, MCP, GitHub, дім) з вкладеннями, діями та ШІ-розбором.
--   3) app.melding_ecosysteem_actie_log — аудитований журнал швидких дій і змахів у межах панелі.

CREATE TABLE IF NOT EXISTS app.melding_ecosysteem_profiel (
  user_id       text        NOT NULL,
  ruimte        text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  instellingen  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte)
);

COMMENT ON TABLE app.melding_ecosysteem_profiel IS
  'Profiel van het meldingen-ecosysteem per gebruiker en ruimte: venstergeometrie, veegregels, kanalen, bijlageviewer en AI-voorkeuren.';

ALTER TABLE app.melding_ecosysteem_profiel ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.melding_ecosysteem_profiel FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS melding_ecosysteem_profiel_eigen ON app.melding_ecosysteem_profiel;
CREATE POLICY melding_ecosysteem_profiel_eigen ON app.melding_ecosysteem_profiel
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.melding_ecosysteem_gebeurtenissen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  ruimte          text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  externe_sleutel text        NOT NULL DEFAULT '' CHECK (length(externe_sleutel) <= 180),
  kanaal          text        NOT NULL CHECK (length(kanaal) BETWEEN 1 AND 64),
  subdomein       text        NOT NULL DEFAULT 'hub' CHECK (length(subdomein) BETWEEN 1 AND 48),
  bron            text        NOT NULL DEFAULT '' CHECK (length(bron) <= 120),
  prioriteit      text        NOT NULL DEFAULT 'normaal' CHECK (prioriteit IN ('kritiek', 'hoog', 'normaal', 'laag')),
  status          text        NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw', 'gelezen', 'uitgesteld', 'archief', 'opgelost')),
  titel           text        NOT NULL CHECK (length(titel) BETWEEN 1 AND 400),
  bericht         text        NOT NULL DEFAULT '' CHECK (length(bericht) <= 4000),
  uitleg          text        NOT NULL DEFAULT '' CHECK (length(uitleg) <= 2000),
  context_label   text        NOT NULL DEFAULT '' CHECK (length(context_label) <= 240),
  herhalingen     integer     NOT NULL DEFAULT 1 CHECK (herhalingen >= 1),
  uitgesteld_tot  timestamptz,
  bijlagen        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  acties          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  meta            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ai_samenvatting jsonb,
  aangemaakt_op   timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS melding_ecosysteem_geb_lade_idx
  ON app.melding_ecosysteem_gebeurtenissen (user_id, ruimte, status, aangemaakt_op DESC);

CREATE UNIQUE INDEX IF NOT EXISTS melding_ecosysteem_geb_sleutel_uidx
  ON app.melding_ecosysteem_gebeurtenissen (user_id, ruimte, externe_sleutel)
  WHERE externe_sleutel <> '';

COMMENT ON TABLE app.melding_ecosysteem_gebeurtenissen IS
  'Geünificeerde stroom van het meldingen-ecosysteem (webdiensten, pc-agent, browserextensie, AI, MCP, mail, cloud, slim wonen) met bijlagen en acties.';

ALTER TABLE app.melding_ecosysteem_gebeurtenissen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.melding_ecosysteem_gebeurtenissen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS melding_ecosysteem_geb_eigen ON app.melding_ecosysteem_gebeurtenissen;
CREATE POLICY melding_ecosysteem_geb_eigen ON app.melding_ecosysteem_gebeurtenissen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.melding_ecosysteem_actie_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL,
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  gebeurtenis_id uuid        REFERENCES app.melding_ecosysteem_gebeurtenissen(id) ON DELETE SET NULL,
  actie          text        NOT NULL CHECK (length(actie) BETWEEN 1 AND 80),
  kanaal         text        NOT NULL DEFAULT '' CHECK (length(kanaal) <= 64),
  uitgevoerd_op  timestamptz NOT NULL DEFAULT now(),
  details        jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS melding_ecosysteem_log_idx
  ON app.melding_ecosysteem_actie_log (user_id, ruimte, uitgevoerd_op DESC);

COMMENT ON TABLE app.melding_ecosysteem_actie_log IS
  'Auditlog van interacties (veegacties, snelle keuzes, bijlage-inspectie en AI-analyse) binnen het meldingen-ecosysteem.';

ALTER TABLE app.melding_ecosysteem_actie_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.melding_ecosysteem_actie_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS melding_ecosysteem_log_eigen ON app.melding_ecosysteem_actie_log;
CREATE POLICY melding_ecosysteem_log_eigen ON app.melding_ecosysteem_actie_log
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
