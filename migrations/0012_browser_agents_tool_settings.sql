-- 0012: (1) browseragent (de Mijn Ruimte-extensie): vijf nieuwe opdrachttypes; (2) per gebruiker instelbare MCP-hulpmiddelen.
--
-- 1) De browserextensie is een agent met platform 'browser'. Opdrachten: browser.snapshot (lezen), browser.navigate
--    (alleen naar eigen adressen), browser.invoke (een door de site aangeboden actie), browser.click en browser.type.
--    Alleen browser.snapshot staat standaard in autoApprove; de rest wacht op een klik van de gebruiker.
--    De CHECK op app.agent_commands.type heet agent_commands_type_check (zie 0011).
--
-- 2) app.connector_tool_settings: welke MCP-hulpmiddelen de gebruiker UITZET. Een uitgezet hulpmiddel verdwijnt uit tools/list
--    en wordt bij een aanroep geweigerd (server-side, niet alleen in de UI). Zoals bij 0010: alleen de systeemrol
--    (mijnruimte_system) benadert de tabel, de routes filteren zelf op user_id; RLS staat aan als tweede laag.
--    mijnruimte_app krijgt GEEN rechten (rechten.sql blijft ongewijzigd).

ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
                  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type'));

CREATE TABLE IF NOT EXISTS app.connector_tool_settings (
  user_id     text        PRIMARY KEY,
  disabled    text[]      NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.connector_tool_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connector_tool_settings_eigen ON app.connector_tool_settings;
CREATE POLICY connector_tool_settings_eigen ON app.connector_tool_settings
  USING (app.rls_vrij() OR user_id = app.huidige_gebruiker())
  WITH CHECK (app.rls_vrij() OR user_id = app.huidige_gebruiker());
