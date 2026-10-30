-- Recht «updates voorbereiden» per AGENT (claude, gpt, …) in plaats van alleen per token-rij.
-- Waarom: een MCP-koppeling (mcp-koppeling) is gebonden aan één OAuth-tokenrij. Verbindt de AI opnieuw (nieuwe autorisatie, andere
-- client, ingetrokken token) dan is dat een NIEUWE rij en geldt de oude toestemming niet meer — de agent staat nog in de lijst maar mag
-- niets uploaden. Een grant op de agent (onderwerp = slug) blijft gelden tot hij verloopt of wordt ingetrokken, voor elke koppeling
-- van die agent in de TECHNISCHE ruimte van dit account.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'app.uitrol_voorbereiders'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%mcp-koppeling%'
  LOOP EXECUTE format('ALTER TABLE app.uitrol_voorbereiders DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE app.uitrol_voorbereiders ADD CONSTRAINT uitrol_voorbereiders_soort_check CHECK (soort IN ('account', 'agenttoken', 'mcp-koppeling', 'agent'));
