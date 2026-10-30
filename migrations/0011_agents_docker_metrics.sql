-- 0011: nieuwe opdrachttypes voor de agent: docker.ps (lezen), docker.manage (start/stop/restart; altijd met goedkeuring)
-- en sys.metrics (CPU/RAM/schijf; lezen). Zie backend/connectors-tools.ts en deploy/agent/agent.mjs.
--
-- 1) De CHECK op app.agent_commands.type (inline in 0009, dus automatisch genoemd agent_commands_type_check) uitbreiden.
-- 2) De standaard autoApprove-lijst van nieuwe agents uitbreiden met de twee leestypes; bestaande agents idempotent bijwerken.
--    docker.manage komt NOOIT in autoApprove: elke start/stop/restart wacht op een klik van de gebruiker.

ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN ('fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics'));

ALTER TABLE app.agents ALTER COLUMN policy
  SET DEFAULT '{"autoApprove": ["fs.read", "fs.list", "sys.info", "sys.metrics", "docker.ps"]}'::jsonb;

-- Bestaande rijen: alleen de twee leestypes toevoegen als ze ontbreken (en een ontbrekende of ongeldige lijst herstellen).
UPDATE app.agents
   SET policy = jsonb_set(
         COALESCE(policy, '{}'::jsonb),
         '{autoApprove}',
         (SELECT COALESCE(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
            FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(policy -> 'autoApprove') = 'array' THEN policy -> 'autoApprove' ELSE '["fs.read","fs.list","sys.info"]'::jsonb END
                   || '["sys.metrics","docker.ps"]'::jsonb) AS t(v)),
         true)
 WHERE jsonb_typeof(policy -> 'autoApprove') IS DISTINCT FROM 'array'
    OR NOT (policy -> 'autoApprove') @> '["sys.metrics","docker.ps"]'::jsonb;
