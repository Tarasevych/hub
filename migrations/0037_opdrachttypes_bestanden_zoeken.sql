-- 0037: opdrachttypes voor de nieuwe alleen-lezen hulpmiddelen fs.stat (machine_file_info) en fs.search (machine_search_files), agent 0.7.0.
-- Dezelfde lijst als COMMAND_TYPES (backend/connectors-gateway.ts); de test in tests/eenheid/agents controleert de overeenkomst.
ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN (
                  'fs.read', 'fs.list', 'fs.stat', 'fs.search', 'fs.write', 'exec', 'sys.info', 'docker.ps',
                  'docker.manage', 'sys.metrics', 'browser.snapshot', 'browser.navigate', 'browser.invoke',
                  'browser.click', 'browser.type', 'browser.diagnostics', 'browser.screenshot', 'browser.tabs',
                  'browser.history', 'browser.scroll', 'browser.wait', 'browser.select', 'browser.key',
                  'browser.deep_diagnostics', 'browser.console', 'browser.network', 'browser.hover',
                  'browser.fill_form', 'browser.pages', 'browser.self_test', 'apps.deploy', 'apps.status', 'apps.list',
                  'apps.logs', 'apps.versions', 'apps.rollback', 'apps.control', 'apps.route', 'apps.secret.list',
                  'apps.secret.set', 'apps.secret.delete'));
