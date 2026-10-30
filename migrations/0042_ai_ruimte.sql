-- 0042: twee AI-ruimtes (shared/ai-ruimte.ts). Elke AI-verbinding, elk agenttoken en elk gekoppeld apparaat hoort bij
-- precies één ruimte: 'prive' (de gebruiker: eigen apparaten, mail, Drive, bord) of 'technisch' (sitebeheer: releases,
-- uitrol voorbereiden, server, serverdeur). De connector filtert tools/list en weigert tools/call buiten de ruimte.
--
-- Bestaande rijen worden 'prive' (minste rechten), behalve wat aantoonbaar van het beheer is:
--  • grants en agenttokens die al het recht «updates voorbereiden» hebben (app.uitrol_voorbereiders),
--  • apparaten die de installatie op de server zelf koppelde (installeer-app.sh: «<host>-apps», «naam (beheer)»,
--    of «Додатки» aan op linux) — dezelfde herkenning als opServer in de agentenpagina.
ALTER TABLE app.mcp_oauth_auth        ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch'));
ALTER TABLE app.mcp_oauth_tokens      ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch'));
ALTER TABLE app.mcp_console_tokens    ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch'));
ALTER TABLE app.agent_pairing_codes   ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch'));
ALTER TABLE app.agents                ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch'));

UPDATE app.mcp_oauth_tokens t SET ruimte = 'technisch'
 WHERE t.ruimte = 'prive'
   AND EXISTS (SELECT 1 FROM app.uitrol_voorbereiders g WHERE g.soort = 'mcp-koppeling' AND g.onderwerp = t.id::text AND g.ingetrokken_op IS NULL);
UPDATE app.mcp_console_tokens t SET ruimte = 'technisch'
 WHERE t.ruimte = 'prive'
   AND EXISTS (SELECT 1 FROM app.uitrol_voorbereiders g WHERE g.soort = 'agenttoken' AND g.onderwerp = t.id::text AND g.ingetrokken_op IS NULL);
UPDATE app.agents a SET ruimte = 'technisch'
 WHERE a.ruimte = 'prive' AND a.revoked_at IS NULL AND COALESCE(a.platform, '') LIKE 'linux%'
   AND (COALESCE(a.capabilities->>'apps', '') = 'true' OR a.name ~ '\(.+\)$' OR a.name LIKE '%-apps');

CREATE INDEX IF NOT EXISTS agents_user_ruimte_idx ON app.agents (user_id, ruimte) WHERE revoked_at IS NULL;
