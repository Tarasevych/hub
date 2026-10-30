-- 0018: verharding van agent- en MCP-tokens.
--   - agenttokens stonden al alleen als sha256 (token_hash); nu ook een verplichte vervaldatum en een koppel-id (pairing_id =
--     installatie-id van de extensie of de agent). Opnieuw koppelen met hetzelfde pairing_id trekt het vorige token in.
--   - bestaande tokens vervallen over hoogstens 30 dagen (daarna opnieuw koppelen).
--   - command_key_enc: per agent een sleutel (AES-GCM verzegeld met de servergeheimen) waarmee de server elke opdracht
--     ondertekent (HMAC); de agent voert alleen opdrachten uit met een geldige handtekening (audit H3).
--   - MCP OAuth-tokens (0010) stonden al als hash; verversingstokens vervallen nu ook over hoogstens 30 dagen.
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS pairing_id text;
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS agent_version text;
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS command_key_enc text;
ALTER TABLE app.agents ADD COLUMN IF NOT EXISTS revoke_reason text;

UPDATE app.agents SET token_expires_at = now() + interval '30 days'
 WHERE token_expires_at IS NULL;
ALTER TABLE app.agents ALTER COLUMN token_expires_at SET DEFAULT now() + interval '30 days';
ALTER TABLE app.agents ALTER COLUMN token_expires_at SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_pairing_id_vorm') THEN
    ALTER TABLE app.agents ADD CONSTRAINT agents_pairing_id_vorm CHECK (pairing_id IS NULL OR pairing_id ~ '^[A-Za-z0-9_-]{8,80}$');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS agents_pairing_idx ON app.agents (user_id, pairing_id) WHERE revoked_at IS NULL AND pairing_id IS NOT NULL;

UPDATE app.mcp_oauth_tokens SET refresh_expires_at = LEAST(refresh_expires_at, now() + interval '30 days')
 WHERE revoked_at IS NULL;
