-- 0014: volledige set browsermogelijkheden (screenshot, tabbladen, scrollen, wachten, selecteren, toetsen, geschiedenis,
-- diepe diagnose) en een keuze per browser welke mogelijkheden AAN staan (policy.enabled).
--
-- policy.enabled ontbreekt = de standaard (alleen lezen/kijken; zie backend/browser-capabilities.ts).
-- Bestaande browseragents behouden hun huidige gedrag: ze krijgen de oude zes types plus de nieuwe leestypes expliciet aan.

ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
                  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type', 'browser.diagnostics',
                  'browser.screenshot', 'browser.tabs', 'browser.history', 'browser.scroll', 'browser.wait',
                  'browser.select', 'browser.key', 'browser.deep_diagnostics'));

UPDATE app.agents
   SET policy = jsonb_set(COALESCE(policy, '{}'::jsonb), '{enabled}',
         '["browser.snapshot","browser.diagnostics","browser.navigate","browser.invoke","browser.click","browser.type","browser.tabs","browser.scroll","browser.wait"]'::jsonb, true)
 WHERE platform = 'browser' AND (policy -> 'enabled') IS NULL;
