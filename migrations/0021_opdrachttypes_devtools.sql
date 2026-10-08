-- 0021: nieuwe opdrachttypes voor de MCP-hulpmiddelen naar het voorbeeld van chrome-devtools-mcp (list_console_messages,
-- list_network_requests, hover, fill_form, pagina's beheren) en de zelftest van de extensie. Geen evaluate_script.
ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
                  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type', 'browser.diagnostics',
                  'browser.screenshot', 'browser.tabs', 'browser.history', 'browser.scroll', 'browser.wait',
                  'browser.select', 'browser.key', 'browser.deep_diagnostics',
                  'browser.console', 'browser.network', 'browser.hover', 'browser.fill_form', 'browser.pages', 'browser.self_test'));
-- Welke grant een opdracht droeg (null = oude opdracht van vóór 0017), voor het overzicht en het audit-spoor.
ALTER TABLE app.agent_commands ADD COLUMN IF NOT EXISTS grant_id uuid;
