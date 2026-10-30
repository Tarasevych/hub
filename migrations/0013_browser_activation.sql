-- 0013: activering van de browserextensie door de ingelogde gebruiker + diagnose-opdracht.
--
-- Een gekoppelde browser doet NIETS totdat de gebruiker hem in het kabinet aanzet (browser_enabled), en daarna alleen zolang
-- een ingelogde sessie op de site dat blijft bevestigen: de site vernieuwt `armed_until` (korte looptijd) via een route die
-- een geldige sessie vereist. Wie alleen het token van de extensie heeft (diefstal, kwaadaardige software) kan dus niets:
-- uitloggen of de site sluiten legt de browser binnen enkele minuten stil, ook zonder het token in te trekken.
-- Afgedwongen op de server (connectors-tools.ts, connectors-commands.ts, connectors-gateway.ts), niet in de extensie.
--
-- browser.diagnostics: alleen-lezen opdracht (fouten in de console en mislukte verzoeken van de eigen site), zonder de
-- brede rechten van chrome.debugger.

ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS browser_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS armed_until timestamptz;

ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
                  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type', 'browser.diagnostics'));

-- Bestaande browseragents: diagnose (alleen lezen) mag direct, net als snapshot.
UPDATE app.agents
   SET policy = jsonb_set(COALESCE(policy, '{}'::jsonb), '{autoApprove}',
         (SELECT COALESCE(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
            FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(policy -> 'autoApprove') = 'array' THEN policy -> 'autoApprove' ELSE '[]'::jsonb END
                   || '["browser.snapshot","browser.diagnostics"]'::jsonb) AS t(v)), true)
 WHERE platform = 'browser'
   AND (jsonb_typeof(policy -> 'autoApprove') IS DISTINCT FROM 'array' OR NOT (policy -> 'autoApprove') @> '["browser.diagnostics"]'::jsonb);
