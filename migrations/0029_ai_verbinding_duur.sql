-- 0029: hoe lang de toegang van een AI-verbinding (MCP) geldt — keuze van de gebruiker per AI-klant.
--
--   app.user_ai_settings.verbinding_duur  {"grok":"1u","claude":"7d","cursor":"altijd", "*": ...}; ontbreekt = 1 uur (vernieuwd tot 14 dagen).
--                                          Ids: 1u | 8u | 1d | 7d | 30d | altijd (shared/ai-verbinding.ts).
--   app.mcp_oauth_auth.duur               de keuze in het venster «Дозволити» (geldt voor de code van dat verzoek).
--   app.mcp_oauth_tokens.duur             blijft bij de grant, zodat het roteren van het refresh-token dezelfde duur aanhoudt.
-- Bestaande grants hebben NULL = de oude vaste waarden (1 uur / 30 dagen), dus niets verandert voor wat al verbonden is.
ALTER TABLE app.user_ai_settings ADD COLUMN IF NOT EXISTS verbinding_duur jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.mcp_oauth_auth ADD COLUMN IF NOT EXISTS duur text;
ALTER TABLE app.mcp_oauth_tokens ADD COLUMN IF NOT EXISTS duur text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ai_settings_duur_vorm') THEN
    ALTER TABLE app.user_ai_settings ADD CONSTRAINT user_ai_settings_duur_vorm CHECK (jsonb_typeof(verbinding_duur) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_auth_duur_id') THEN
    ALTER TABLE app.mcp_oauth_auth ADD CONSTRAINT mcp_oauth_auth_duur_id CHECK (duur IS NULL OR duur IN ('1u', '8u', '1d', '7d', '30d', 'altijd'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_tokens_duur_id') THEN
    ALTER TABLE app.mcp_oauth_tokens ADD CONSTRAINT mcp_oauth_tokens_duur_id CHECK (duur IS NULL OR duur IN ('1u', '8u', '1d', '7d', '30d', 'altijd'));
  END IF;
END $$;
