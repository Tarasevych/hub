-- 0045: connector v2 (shared/connector-v2/*): eigen adres per AI-agent (https://mcp.tarasevych.com/ai/<agent>), Nederlandse
-- hulpmiddelnamen met agent, subdomein, dienst en kant (gebruiker|beheer), en rechten per hulpmiddel per koppeling.
--
--  • mcp_oauth_auth.agent / mcp_oauth_tokens.agent: aan welke agent het verzoek en de koppeling gebonden zijn. NULL = oude
--    connector /mcp (blijft werken). Een v2-token werkt alleen op het eigen pad; het oude /mcp weigert v2-tokens.
--  • mcp_oauth_auth.v2_keuze: wat de mens in het toestemmingsvenster koos (kanten + sleutels), tot het token wordt uitgegeven.
--  • app.connector_v2_rechten: per koppeling de toegestane sleutels (`${id}:${kant}`) en kanten. Geen rij = niets toegestaan.
--  • app.connector_v2_voorkeur: per gebruiker × agent het geheugen van de laatste keuze en wat klaarstaat voor herverbinden
--    (de keuze gaat niet verloren tot de nieuwe toestemming).
--  • app.connector_v2_instellingen: «extra bevestiging bij elke nieuwe koppeling» (verse aanmelding, ook als de sessie jong is).
-- RLS zoals 0044: mijnruimte_app ziet alleen eigen rijen; de server werkt met de systeemrol.

ALTER TABLE app.mcp_oauth_auth   ADD COLUMN IF NOT EXISTS agent text CHECK (agent IS NULL OR agent IN ('claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw'));
ALTER TABLE app.mcp_oauth_auth   ADD COLUMN IF NOT EXISTS v2_keuze jsonb;
ALTER TABLE app.mcp_oauth_tokens ADD COLUMN IF NOT EXISTS agent text CHECK (agent IS NULL OR agent IN ('claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw'));
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_agent_idx ON app.mcp_oauth_tokens (user_id, agent) WHERE agent IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS app.connector_v2_rechten (
  grant_id   uuid        PRIMARY KEY REFERENCES app.mcp_oauth_tokens(id) ON DELETE CASCADE,
  user_id    text        NOT NULL,
  agent      text        NOT NULL CHECK (agent IN ('claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw')),
  kanten     text[]      NOT NULL CHECK (kanten <@ ARRAY['gebruiker', 'beheer']::text[] AND cardinality(kanten) BETWEEN 1 AND 2),
  sleutels   text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(sleutels) <= 400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_v2_rechten_user_idx ON app.connector_v2_rechten (user_id);

CREATE TABLE IF NOT EXISTS app.connector_v2_voorkeur (
  user_id      text        NOT NULL,
  agent        text        NOT NULL CHECK (agent IN ('claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw')),
  kanten       text[]      NOT NULL CHECK (kanten <@ ARRAY['gebruiker', 'beheer']::text[] AND cardinality(kanten) BETWEEN 1 AND 2),
  sleutels     text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(sleutels) <= 400),
  -- true = de gebruiker wijzigde iets wat een nieuwe toestemming vraagt; het venster toont dan het verschil.
  herverbinden boolean     NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent)
);

CREATE TABLE IF NOT EXISTS app.connector_v2_instellingen (
  user_id          text        PRIMARY KEY,
  extra_bevestigen boolean     NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.connector_v2_rechten ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.connector_v2_voorkeur ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.connector_v2_instellingen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connector_v2_rechten_eigen ON app.connector_v2_rechten;
CREATE POLICY connector_v2_rechten_eigen ON app.connector_v2_rechten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS connector_v2_voorkeur_eigen ON app.connector_v2_voorkeur;
CREATE POLICY connector_v2_voorkeur_eigen ON app.connector_v2_voorkeur
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS connector_v2_instellingen_eigen ON app.connector_v2_instellingen;
CREATE POLICY connector_v2_instellingen_eigen ON app.connector_v2_instellingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
