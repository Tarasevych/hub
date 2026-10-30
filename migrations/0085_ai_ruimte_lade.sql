-- 0085: de dienst «ai» ONDERGESCHIKT aan de gescheiden gegevensruimtes (0082/0087) — geen nieuwe waarheid, wel de
-- indexen en de documentatie die daarbij horen.
--
-- WAT ER AL WAS. Anders dan bij de andere diensten bestond de kolom `ruimte` hier allang (migratie 0042): een apparaat, een
-- AI-koppeling, een agenttoken en (0078) een vreemde MCP-server horen elk bij precies één ruimte. Op 20.10.2026 kwam daar de
-- LEVENDE berekening bij (backend/ai-ruimte-poort.ts → effectieveRuimte): niet de kolom op de grant beslist, maar de huidige
-- staat van de mens. Er was dus geen gebrek aan waarheid — er waren er twee, en de STAND van de dienst «ai» uit 0082
-- (app.ruimte_dienst_stand: eigen / gedeeld / uit / bevroren) was een derde die niemand aan de AI-kant las.
--
-- WAT DEZE MIGRATIE DOET. Niets verbouwen en niets verplaatsen: er is geen rij om te verhuizen, want `ruimte` staat er al en
-- NULL of ontbrekend betekent nog altijd 'prive'. Wel twee dingen die de onderwerping praktisch maken:
--
--  1. INDEXEN op (user_id, ruimte) voor de tabellen die bij elke tools/list en tools/call gefilterd worden, en voor de
--     uitvoerder die een bevroren technische lade overdraagt of wist (backend/ai-ruimte-lade.ts). Zonder die indexen kost
--     elke AI-aanroep een scan over alle apparaten en koppelingen van de gebruiker;
--  2. COMMENTAAR op de kolommen, zodat bij de volgende lezer vastligt dat `ruimte` hier NIET meer alleen zegt waar een rij
--     bij hoort, maar ondergeschikt is aan app.ruimte_dienst_stand van de dienst 'ai'.
--
-- Idempotent (de testsuite draait alle migraties opnieuw) en zonder enige wijziging aan rechten of RLS: die staan al op de
-- betrokken tabellen (0042, 0072/0073, 0078).

-- app.agents had zijn index al (0042, agents_user_ruimte_idx): die blijft en wordt hier niet gedupliceerd.
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user_ruimte_idx       ON app.mcp_oauth_tokens       (user_id, ruimte) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mcp_console_tokens_user_ruimte_idx     ON app.mcp_console_tokens     (user_id, ruimte) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS externe_mcp_verbinding_user_ruimte_idx ON app.externe_mcp_verbinding (user_id, ruimte);

COMMENT ON COLUMN app.agents.ruimte IS
  'Ruimte van dit apparaat (0042). Sinds 20.10.2026 ondergeschikt aan de stand van de dienst «ai» in app.ruimte_dienst_stand: bij ''uit''/''bevroren'' bestaat er geen technisch apparaat, bij ''gedeeld'' gebruikt de technische ruimte juist de PERSOONLIJKE apparaten (de lade is dan ''prive''). Zie backend/ai-ruimte-poort.ts → aiPoortNu.';
COMMENT ON COLUMN app.mcp_oauth_tokens.ruimte IS
  'Ruimte van deze AI-koppeling (0042); voor connector v2 altijd ''prive'' omdat de kamer daar geen eigenschap van de koppeling meer is. Wat er nu geldt beslist backend/ai-ruimte-poort.ts → aiPoortNu, ondergeschikt aan app.ruimte_dienst_stand (dienst ''ai'').';
COMMENT ON COLUMN app.mcp_console_tokens.ruimte IS
  'Ruimte van dit agenttoken (0042), ondergeschikt aan app.ruimte_dienst_stand (dienst ''ai''): een technisch token zonder aangezette technische dienst krijgt geen enkel technisch hulpmiddel.';
COMMENT ON COLUMN app.externe_mcp_verbinding.ruimte IS
  'Ruimte die de mens bij het koppelen koos (0078). De route laat die keuze sinds 20.10.2026 door dezelfde poort gaan als elk ander AI-apparaat (backend/ai-ruimte-poort.ts → aiVerbindingRuimte): ''technisch'' alleen met een EIGEN technische lade.';
