-- 0027: opdrachttypes voor «Додатки» (BYOS-PaaS op eigen hardware, deploy/agent/agent.mjs apps.*): uitrollen in een rootless
-- container, status, lijst, logboek, versies, terugdraaien, starten/stoppen/verwijderen, domeinroute (Caddy) en geheimen.
-- Bestanden van een uitrol en waarden van geheimen staan NOOIT in params: alleen een eenmalig ticket (backend/apps-overdracht.ts).
ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
                  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type', 'browser.diagnostics',
                  'browser.screenshot', 'browser.tabs', 'browser.history', 'browser.scroll', 'browser.wait',
                  'browser.select', 'browser.key', 'browser.deep_diagnostics',
                  'browser.console', 'browser.network', 'browser.hover', 'browser.fill_form', 'browser.pages', 'browser.self_test',
                  'apps.deploy', 'apps.status', 'apps.list', 'apps.logs', 'apps.versions', 'apps.rollback', 'apps.control',
                  'apps.route', 'apps.secret.list', 'apps.secret.set', 'apps.secret.delete'));
