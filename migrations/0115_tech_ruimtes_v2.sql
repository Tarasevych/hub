-- 0115 — Technische ruimtes v2 (27.10.2026). Twee parallelle ruimtes van één account: «prive» en «technisch».
-- Achter de vlag tech-ruimtes-v2 (standaard UIT). Vlag UIT = exact het oude gedrag; deze tabellen worden dan niet gelezen.
-- Idempotent: alles met IF NOT EXISTS / ON CONFLICT DO NOTHING. Geeft geen rechten: een rij hier is alleen geldig binnen
-- een bestaand technisch profiel (app.tech_profielen) en een levende aanmeldsessie van de site.
--
--   app.tech_ruimte_sessies  één technische sessie per aanmeldsessie (sessie_id = ankersessie van de site)
--   app.tech_ruimte_tabs     tabbladen (sha256 van de tabcontext) die bij die sessie horen — binding voor oude controles zonder sessie
--   app.tech_ruimte_ai       één set AI-termijnen: welke ruimtes een AI-verbinding mag, en hoe lang

CREATE TABLE IF NOT EXISTS app.tech_ruimte_sessies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  profiel_id      text        NOT NULL,
  sessie_id       text        NOT NULL,
  rollen          text[]      NOT NULL CHECK (cardinality(rollen) BETWEEN 1 AND 10),
  modus           text        NOT NULL CHECK (modus IN ('tijd', 'tot-technisch-einde', 'tot-site-uitloggen')),
  reden           text        NOT NULL CHECK (char_length(reden) BETWEEN 3 AND 300),
  begin_op        timestamptz NOT NULL DEFAULT now(),
  -- Alleen bij modus 'tijd'; ≤ 8 uur na nu (bij verlengen opnieuw gemeten vanaf het moment van verlengen).
  eind_op         timestamptz,
  -- Harde grens: het absolute einde van de aanmeldsessie van de site. «Zonder tijdsgrens» betekent dus: tot de site-sessie eindigt.
  grens_op        timestamptz NOT NULL,
  actief          text        NOT NULL DEFAULT 'technisch' CHECK (actief IN ('prive', 'technisch')),
  pauze_op        timestamptz,
  verlengd_op     timestamptz,
  beeindigd_op    timestamptz,
  beeindigd_reden text,
  CONSTRAINT tech_ruimte_sessies_eind CHECK ((modus = 'tijd') = (eind_op IS NOT NULL)),
  CONSTRAINT tech_ruimte_sessies_tijd CHECK (eind_op IS NULL OR eind_op <= COALESCE(verlengd_op, begin_op) + interval '8 hours')
);
CREATE UNIQUE INDEX IF NOT EXISTS tech_ruimte_sessies_een_per_sessie ON app.tech_ruimte_sessies (user_id, sessie_id) WHERE beeindigd_op IS NULL;
CREATE INDEX IF NOT EXISTS tech_ruimte_sessies_user ON app.tech_ruimte_sessies (user_id) WHERE beeindigd_op IS NULL;

CREATE TABLE IF NOT EXISTS app.tech_ruimte_tabs (
  ruimte_sessie_id uuid        NOT NULL REFERENCES app.tech_ruimte_sessies (id) ON DELETE CASCADE,
  user_id          text        NOT NULL,
  tab_hash         text        NOT NULL CHECK (tab_hash ~ '^[0-9a-f]{64}$'),
  gezien_op        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ruimte_sessie_id, tab_hash)
);
CREATE INDEX IF NOT EXISTS tech_ruimte_tabs_tab ON app.tech_ruimte_tabs (user_id, tab_hash);

CREATE TABLE IF NOT EXISTS app.tech_ruimte_ai (
  user_id         text        NOT NULL,
  verbinding_id   text        NOT NULL CHECK (char_length(verbinding_id) BETWEEN 1 AND 100),
  ruimtes         text[]      NOT NULL CHECK (ruimtes <@ ARRAY['prive', 'technisch']::text[]),
  termijn         text        NOT NULL CHECK (termijn IN ('tijd', 'tot-technisch-einde', 'tot-site-uitloggen')),
  eind_op         timestamptz,
  ruimte_sessie_id uuid,
  gezet_op        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, verbinding_id),
  CONSTRAINT tech_ruimte_ai_tijd CHECK ((termijn = 'tijd') = (eind_op IS NOT NULL))
);

ALTER TABLE app.tech_ruimte_sessies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tech_ruimte_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tech_ruimte_ai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tech_ruimte_sessies_eigen ON app.tech_ruimte_sessies;
CREATE POLICY tech_ruimte_sessies_eigen ON app.tech_ruimte_sessies
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS tech_ruimte_tabs_eigen ON app.tech_ruimte_tabs;
CREATE POLICY tech_ruimte_tabs_eigen ON app.tech_ruimte_tabs
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS tech_ruimte_ai_eigen ON app.tech_ruimte_ai;
CREATE POLICY tech_ruimte_ai_eigen ON app.tech_ruimte_ai
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.tech_ruimte_sessies, app.tech_ruimte_tabs, app.tech_ruimte_ai TO mijnruimte_system;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT ON app.tech_ruimte_sessies, app.tech_ruimte_tabs, app.tech_ruimte_ai TO mijnruimte_app;
  END IF;
END
$r$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('tech-ruimtes-v2',
  'Технічні простори v2: «Звичайний» і «Технічний» простір одного акаунта, три терміни, пауза. Technische ruimtes v2. Прав не дає й не забирає.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('tech-ruimtes-v2-schaduw',
  'Тіньовий режим: лише записує в журнал розбіжності між старими перевірками й новою (нічого не змінює). Schaduwmodus.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

DO $bewijs$
BEGIN
  RAISE NOTICE '0115: technische ruimtes v2 klaar (sessies/tabs/ai, RLS, vlaggen tech-ruimtes-v2 en -schaduw uit)';
END
$bewijs$;
