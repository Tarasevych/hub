-- SEC-002 (12.11.2026), groep g10e — twee kolommen voor de OAuth van de MCP-connector (app.mcp_oauth_*, migratie 0010).
--
-- 1. ai-mcp-14 — app.mcp_oauth_auth.binding_hash
--    Het toestemmingsverzoek wordt gebonden aan de BROWSER die de autorisatie begon. /oauth2/authorize zet een cookie
--    (HttpOnly, Secure, SameSite=Lax, 10 minuten) met een willekeurig geheim; hier staat alleen de SHA-256 ervan. De routes
--    /api/owner/mcp-connector/consent(/info) eisen dat de browser die «Дозволити» drukt datzelfde cookie heeft. Zo kan een
--    aanvaller een door HEM gestarte autorisatie (met zijn eigen PKCE) niet meer als link «bevestig even Claude» naar een ander
--    sturen. NULL = verzoek van vóór deze migratie (leeft hoogstens 10 minuten): daarvoor geldt de binding niet.
--
-- 2. ai-mcp-11 — app.mcp_oauth_tokens.venster_vanaf
--    «1 година, поновлюється до 14 днів» was in werkelijkheid een GLIJDENDE termijn: elke vernieuwing van het token schoof het
--    einde weer 14 dagen op, dus een AI die regelmatig vernieuwt hield voor altijd toegang. Vanaf nu telt de vernieuwtermijn
--    vanaf dit tijdstip en schuift ze niet meer op (backend/mcp-connector-opslag.ts → rotateRefresh); daarna is een nieuwe
--    toestemming nodig. Nieuwe verbindingen: het moment van uitgifte (DEFAULT now()). BESTAANDE verbindingen krijgen het moment
--    van deze migratie: zij houden dus nog één volledige termijn en vallen niet allemaal tegelijk weg bij de uitrol.
--
-- Geen nieuwe tabel en geen nieuw beleid: de bestaande RLS-regels en rechten (0010) gelden voor de hele rij. Idempotent.
ALTER TABLE app.mcp_oauth_auth
  ADD COLUMN IF NOT EXISTS binding_hash text CHECK (binding_hash IS NULL OR binding_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE app.mcp_oauth_tokens
  ADD COLUMN IF NOT EXISTS venster_vanaf timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN app.mcp_oauth_auth.binding_hash IS 'SEC-002 ai-mcp-14: SHA-256 van het cookiegeheim van de browser die de autorisatie begon (NULL = oud verzoek zonder binding)';
COMMENT ON COLUMN app.mcp_oauth_tokens.venster_vanaf IS 'SEC-002 ai-mcp-11: begin van de vernieuwtermijn; het refresh-token wordt nooit verder verlengd dan venster_vanaf + de gekozen termijn';
