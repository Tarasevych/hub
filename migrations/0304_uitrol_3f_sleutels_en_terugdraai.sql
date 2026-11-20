-- 0304 (UPD-011): персональні відкличні ключі адміністраторів, 3-чинникова довіра оновлень
-- (GitHub ↔ MCP-з’єднувач ШІ ↔ Сайт і правила) та реєстр змін випусків для вибіркового відкликання.
-- Зворотно сумісна міграція: лише нові таблиці й необов’язкові колонки з типовими значеннями.

CREATE TABLE IF NOT EXISTS app.uitrol_beheer_sleutels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  label text NOT NULL,
  rol text NOT NULL DEFAULT 'beheerder' CHECK (rol IN ('eigenaar', 'beheerder', 'gedelegeerde', 'agent')),
  sleutel_prefix text NOT NULL,
  sleutel_hash text NOT NULL UNIQUE,
  github_koppeling text NOT NULL DEFAULT '',
  github_geverifieerd_op timestamptz,
  mcp_koppeling_id text NOT NULL DEFAULT '',
  mcp_agent_slug text NOT NULL DEFAULT '',
  mcp_geverifieerd_op timestamptz,
  site_grant_id text NOT NULL DEFAULT '',
  regels_versie text NOT NULL DEFAULT '',
  regels_hash text NOT NULL DEFAULT '',
  toegang_niveau text NOT NULL DEFAULT 'uploaden' CHECK (toegang_niveau IN ('uploaden', 'installeren')),
  uitwissel_hash text,
  uitwissel_verloopt_op timestamptz,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt_op timestamptz,
  gesynchroniseerd_op timestamptz,
  ingetrokken_op timestamptz,
  ingetrokken_reden text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_uitrol_beheer_sleutels_user
  ON app.uitrol_beheer_sleutels (user_id, aangemaakt_op DESC);

CREATE INDEX IF NOT EXISTS idx_uitrol_beheer_sleutels_actief
  ON app.uitrol_beheer_sleutels (ingetrokken_op)
  WHERE ingetrokken_op IS NULL;

CREATE TABLE IF NOT EXISTS app.uitrol_release_wijzigingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versie text NOT NULL UNIQUE,
  voorstel_id text NOT NULL DEFAULT '',
  commit_sha text NOT NULL DEFAULT '',
  basis_versie text NOT NULL DEFAULT '',
  basis_commit text NOT NULL DEFAULT '',
  herkomst_kanaal text NOT NULL DEFAULT 'site' CHECK (herkomst_kanaal IN ('github', 'mcp', 'site', 'ssh', 'gitops', 'onbekend')),
  herkomst_sleutel_id text NOT NULL DEFAULT '',
  auteur text NOT NULL DEFAULT '',
  agent text NOT NULL DEFAULT '',
  taak_id text NOT NULL DEFAULT '',
  samenvatting_uk text NOT NULL DEFAULT '',
  samenvatting_nl text NOT NULL DEFAULT '',
  drie_factoren jsonb NOT NULL DEFAULT '{}'::jsonb,
  bestanden jsonb NOT NULL DEFAULT '[]'::jsonb,
  migraties jsonb NOT NULL DEFAULT '[]'::jsonb,
  commits jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'geinstalleerd', 'teruggedraaid', 'selectief_aangevraagd', 'selectief_ingetrokken', 'mislukt', 'afgewezen')),
  ingetrokken_op timestamptz,
  ingetrokken_versie text NOT NULL DEFAULT '',
  ingetrokken_reden text NOT NULL DEFAULT '',
  ingetrokken_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  geinstalleerd_op timestamptz,
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uitrol_release_wijzigingen_tijd
  ON app.uitrol_release_wijzigingen (aangemaakt_op DESC);

ALTER TABLE app.uitrol_voorstellen
  ADD COLUMN IF NOT EXISTS herkomst_kanaal text NOT NULL DEFAULT 'site';

ALTER TABLE app.uitrol_voorstellen
  ADD COLUMN IF NOT EXISTS herkomst_sleutel_id text NOT NULL DEFAULT '';

ALTER TABLE app.uitrol_voorstellen
  ADD COLUMN IF NOT EXISTS drie_factoren jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.uitrol_voorstellen
  ADD COLUMN IF NOT EXISTS bestanden_manifest jsonb NOT NULL DEFAULT '[]'::jsonb;
