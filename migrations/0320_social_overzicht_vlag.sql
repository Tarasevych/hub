-- 0320 (CONSOL-001 / M4, 23.11.2026): прикладна служба «Соціальні мережі» (канали, профілі та чернетки публікацій у просторі).
-- Кожен запис ізольований за користувачем і простором (prive / technisch) під суворим двомірним захистом рядків (ENABLE + FORCE RLS).
-- Sociale netwerken: eigen kanalen/profielen en publicatieconcepten per lade (user_id + ruimte) onder strikte FORCE RLS.

CREATE TABLE IF NOT EXISTS app.sociale_netwerken (
  user_id       text        NOT NULL CHECK (user_id <> ''),
  ruimte        text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  soort         text        NOT NULL CHECK (soort IN ('profiel', 'bericht')),
  netwerk       text        NOT NULL CHECK (netwerk IN ('telegram', 'discord', 'github', 'mastodon', 'bluesky', 'linkedin', 'youtube', 'rss', 'eigen')),
  handvat       text        NOT NULL DEFAULT '' CHECK (char_length(handvat) <= 160 AND handvat !~ '[<>]'),
  url           text        NOT NULL DEFAULT '' CHECK (char_length(url) <= 500 AND (url = '' OR url ~ '^https://')),
  titel         text        NOT NULL DEFAULT '' CHECK (char_length(titel) <= 200 AND titel !~ '[<>]'),
  inhoud        text        NOT NULL DEFAULT '' CHECK (char_length(inhoud) <= 4000),
  status        text        NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'gepauzeerd', 'concept', 'gepland', 'gepubliceerd', 'gearchiveerd')),
  gepland_op    timestamptz NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, id)
);

CREATE INDEX IF NOT EXISTS sociale_netwerken_lade_idx
  ON app.sociale_netwerken (user_id, ruimte, soort, bijgewerkt_op DESC);

COMMENT ON TABLE app.sociale_netwerken IS 'Sociale netwerken: profielen/kanalen en publicatieconcepten per lade (user_id + ruimte) onder strikte FORCE RLS.';

ALTER TABLE app.sociale_netwerken ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sociale_netwerken FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sociale_netwerken_eigen ON app.sociale_netwerken;
CREATE POLICY sociale_netwerken_eigen ON app.sociale_netwerken
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  );

DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.sociale_netwerken TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.sociale_netwerken TO mijnruimte_system;
  END IF;
END
$rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'social-overzicht-v1',
  'Соціальні мережі: єдиний огляд підключених каналів, імпортованих архівів світлин і чернеток публікацій у просторі. | Sociale netwerken: overzicht van kanalen, geïmporteerde fotoarchieven en publicatieconcepten.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
