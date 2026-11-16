-- SEC-002 interface-02 (12.11.2026) — bij elk verzoek dat op een klik van de mens wacht bewaren WIE het vroeg.
--
-- Tot nu toe hadden app.agent_commands (opdrachten naar een pc/browser) en app.connector_tool_calls (hulpmiddelen in de modus
-- «Питати») geen kolom voor de aanvrager. Het scherm schreef daarom bij elk verzoek hard «Claude», ook als een andere agent, een
-- oud deurtoken of een via DCR geregistreerde klant met een zelfgekozen naam het verzoek stuurde: de mens kon een vreemd verzoek
-- niet onderscheiden van dat van zijn eigen gesprek.
--
--   aanvrager_client  naam van de MCP-klant zoals de server die bij de geauthenticeerde verbinding kent (mcp-namens.ts);
--                     'site:eigenaar' = de mens zelf vanaf de site; '' = onbekend (oude rijen, geen AI-context)
--   aanvrager_grant   id van de verbinding of het token (mcp_oauth_tokens.id / mcp_console_tokens.id), '' = onbekend
--   aanvrager_agent   connector v2: de agent (slug) waaraan het token gebonden is, '' = geen
--
-- Geen nieuwe tabel en geen nieuw beleid: de bestaande RLS-regels (eigen rijen) en rechten op beide tabellen gelden voor de hele
-- rij, dus ook voor deze kolommen. Idempotent (ADD COLUMN IF NOT EXISTS); bestaande rijen krijgen de lege standaardwaarde.
ALTER TABLE app.agent_commands
  ADD COLUMN IF NOT EXISTS aanvrager_client text NOT NULL DEFAULT '' CHECK (length(aanvrager_client) <= 80),
  ADD COLUMN IF NOT EXISTS aanvrager_grant  text NOT NULL DEFAULT '' CHECK (length(aanvrager_grant) <= 120),
  ADD COLUMN IF NOT EXISTS aanvrager_agent  text NOT NULL DEFAULT '' CHECK (aanvrager_agent ~ '^[a-z0-9-]{0,40}$');

ALTER TABLE app.connector_tool_calls
  ADD COLUMN IF NOT EXISTS aanvrager_client text NOT NULL DEFAULT '' CHECK (length(aanvrager_client) <= 80),
  ADD COLUMN IF NOT EXISTS aanvrager_grant  text NOT NULL DEFAULT '' CHECK (length(aanvrager_grant) <= 120),
  ADD COLUMN IF NOT EXISTS aanvrager_agent  text NOT NULL DEFAULT '' CHECK (aanvrager_agent ~ '^[a-z0-9-]{0,40}$');

COMMENT ON COLUMN app.agent_commands.aanvrager_client IS 'SEC-002 interface-02: naam van de MCP-klant die deze opdracht vroeg (site:eigenaar = de mens zelf; leeg = onbekend)';
COMMENT ON COLUMN app.connector_tool_calls.aanvrager_client IS 'SEC-002 interface-02: naam van de MCP-klant die deze aanroep vroeg (leeg = onbekend)';
