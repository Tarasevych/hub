-- 0059: «агент від імені власника» (audit 18.10.2026, bevinding K1) — gecontroleerd, in plaats van de verwijderde instrumenten
-- issue_session_token / exchange_session / auto_session (die sloegen voor een AI een 90-daagse eigenaarssessie zonder passkey).
--
--   app.agent_namens_sessies  één rij per toestemming: welke agent (slug), in welke ruimte, hoe lang (15 min … 8 u), welke omvang
--                             (groepen van alleen-lezen beheerroutes), wie hem gaf (altijd de eigenaar zelf, na een passkey-step-up op
--                             de site), hoe vaak hij gebruikt is en wanneer hij is ingetrokken. Nooit een cookie of token: de agent
--                             gebruikt gewoon zijn bestaande koppeling; de site herkent de toestemming per aanroep (backend/agent-namens.ts)
--                             en zet in elke journaalregel «від імені» = deze rij + de agent.
--
-- Spooksessies: rijen in app.records (owner_service_sessions_v1) met authMethod = 'agent-token' zijn door de verwijderde instrumenten
-- aangemaakt. Ze worden hier NIET fysiek gewist maar gemarkeerd (verwijderdOp/verwijderdReden), zodat de beheerder ze op de site ziet
-- en met zijn passkey definitief kan opruimen. De sessiecontrole (backend/index.ts ownerFindSession) negeert gemarkeerde rijen én
-- elke rij met authMethod 'agent-token'.
CREATE TABLE IF NOT EXISTS app.agent_namens_sessies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL,
  agent            text        NOT NULL CHECK (agent ~ '^[a-z][a-z0-9-]{1,31}$'),
  ruimte           text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  omvang           text[]      NOT NULL DEFAULT '{}',
  aangemaakt_op    timestamptz NOT NULL DEFAULT now(),
  verloopt_op      timestamptz NOT NULL,
  ingetrokken_op   timestamptz,
  ingetrokken_reden text       NOT NULL DEFAULT '',
  stap_op_methode  text        NOT NULL DEFAULT 'passkey',
  acties           integer     NOT NULL DEFAULT 0,
  laatst_actief    timestamptz,
  CHECK (verloopt_op > aangemaakt_op AND verloopt_op <= aangemaakt_op + interval '8 hours 1 minute')
);
CREATE INDEX IF NOT EXISTS agent_namens_sessies_actief_idx ON app.agent_namens_sessies (user_id, agent, ruimte) WHERE ingetrokken_op IS NULL;

-- Alleen de systeemrol (de app-rol mag er niet bij: een AI-aanroep in app-context mag zijn eigen toestemming nooit lezen of schrijven).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.agent_namens_sessies FROM mijnruimte_app;
  END IF;
END $$;

-- Spooksessies markeren (niet wissen): zichtbaar op de site, definitief opruimen alleen met passkey.
UPDATE app.records
   SET data = data || jsonb_build_object('verwijderdOp', (extract(epoch from now()) * 1000)::bigint, 'verwijderdReden', 'AUDIT_K1')
 WHERE tbl = 'owner_service_sessions_v1'
   AND data->>'authMethod' = 'agent-token'
   AND (data->>'verwijderdOp') IS NULL;
