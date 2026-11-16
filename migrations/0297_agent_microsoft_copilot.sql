-- 0297 (BREEDTE-003): veertiende AI-agent «Microsoft Copilot» (slug en klant-id: mscopilot), gekoppeld via Microsoft Copilot Studio.
-- Чотирнадцятий ШІ-агент «Microsoft Copilot» (окремий від GitHub Copilot = copilot): розширення CHECK-обмежень тих самих восьми
-- таблиць, що й у 0284. Нових таблиць, стовпців і даних немає. Повторний запуск безпечний: блок спершу знімає наявні
-- обмеження (IF EXISTS), потім додає їх знову; кожна таблиця — лише якщо вона існує.
-- Let op: in ai_site_schakelaars en ai_gebruiker_caps heet ChatGPT «chatgpt», in de overige tabellen «gpt» (zoals in 0284).

DO $uitbreiden_mscopilot$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND con.contype = 'c'
      AND (
        (c.relname = 'ai_site_schakelaars' AND pg_get_constraintdef(con.oid) LIKE '%sleutel%' AND pg_get_constraintdef(con.oid) LIKE '%agent:%')
        OR (c.relname = 'ai_gebruiker_caps' AND pg_get_constraintdef(con.oid) LIKE '%klant%')
        OR (c.relname IN ('mcp_oauth_auth', 'mcp_oauth_tokens', 'connector_v2_rechten', 'connector_v2_voorkeur', 'agent_kleuren', 'extensie_matrix') AND pg_get_constraintdef(con.oid) LIKE '%agent%')
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', r.nspname, r.relname, r.conname);
  END LOOP;

  IF to_regclass('app.ai_site_schakelaars') IS NOT NULL THEN
    ALTER TABLE app.ai_site_schakelaars
      ADD CONSTRAINT ai_site_schakelaars_sleutel_check
      CHECK (sleutel ~ '^(agent:(grok|claude|chatgpt|codex|gemini|copilot|cursor|antigravity|autoclaw|windsurf|cline|devin|opencode|mscopilot)|methode:(mcp|token)|cap:[a-z][a-z0-9.]{1,40})$');
  END IF;

  IF to_regclass('app.ai_gebruiker_caps') IS NOT NULL THEN
    ALTER TABLE app.ai_gebruiker_caps
      ADD CONSTRAINT ai_gebruiker_caps_klant_check
      CHECK (klant IN ('grok', 'claude', 'chatgpt', 'codex', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;

  IF to_regclass('app.mcp_oauth_auth') IS NOT NULL THEN
    ALTER TABLE app.mcp_oauth_auth
      ADD CONSTRAINT mcp_oauth_auth_agent_check
      CHECK (agent IS NULL OR agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;

  IF to_regclass('app.mcp_oauth_tokens') IS NOT NULL THEN
    ALTER TABLE app.mcp_oauth_tokens
      ADD CONSTRAINT mcp_oauth_tokens_agent_check
      CHECK (agent IS NULL OR agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;

  IF to_regclass('app.connector_v2_rechten') IS NOT NULL THEN
    ALTER TABLE app.connector_v2_rechten
      ADD CONSTRAINT connector_v2_rechten_agent_check
      CHECK (agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;

  IF to_regclass('app.connector_v2_voorkeur') IS NOT NULL THEN
    ALTER TABLE app.connector_v2_voorkeur
      ADD CONSTRAINT connector_v2_voorkeur_agent_check
      CHECK (agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;

  IF to_regclass('app.agent_kleuren') IS NOT NULL THEN
    ALTER TABLE app.agent_kleuren
      ADD CONSTRAINT agent_kleuren_agent_check
      CHECK (agent IN ('claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;

  IF to_regclass('app.extensie_matrix') IS NOT NULL THEN
    ALTER TABLE app.extensie_matrix
      ADD CONSTRAINT extensie_matrix_agent_check
      CHECK (agent IN ('*', 'claude', 'gpt', 'codex', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw', 'windsurf', 'cline', 'devin', 'opencode', 'mscopilot'));
  END IF;
END
$uitbreiden_mscopilot$;
