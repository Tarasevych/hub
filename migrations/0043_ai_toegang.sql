-- 0043: gedetailleerde AI-toegang (shared/ai-toegang.ts): welke verbinding van welke gebruiker
-- precies welke functies mag aanroepen (per scope, default-deny).
--
-- Model:
--   app.ai_toegang         één rij per verbinding: gebruiker → (mcp-koppeling | agenttoken) → welke scopes gegeven.
--                          Geen rij of geen scope in de rij = weigeren. Alleen de mens geeft (consent-scherm /
--                          tabblad «Доступ ШІ»), nooit de AI zelf.
--   app.ai_toegang_beheer  bestuurlijk plafond voor de hele site: een uitgeschakelde scope wordt door de backend
--                          geweigerd, ook als er nog een oude grantrij bij de verbinding staat. Alleen de eigenaar wijzigt dit.
--
-- RLS zoals 0017: voor mijnruimte_app altijd alleen eigen rijen; de server gebruikt de systeemrol.
-- Bestaande verbindingen behouden wat ze hadden: alle ondersteunde scopes bij de migratie
-- (zie shared/ai-toegang.ts); nieuwe verbindingen krijgen alleen de niet-gevoelige standaardscopes
-- (backend/ai-toegang.ts, bij het uitgeven).

CREATE TABLE IF NOT EXISTS app.ai_toegang (
  user_id      text        NOT NULL,
  soort        text        NOT NULL CHECK (soort IN ('mcp-koppeling', 'agenttoken')),
  onderwerp_id text        NOT NULL CHECK (length(onderwerp_id) >= 8 AND length(onderwerp_id) <= 80),
  scopes       text[]      NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (soort, onderwerp_id)
);
CREATE INDEX IF NOT EXISTS ai_toegang_user_idx ON app.ai_toegang (user_id);

CREATE TABLE IF NOT EXISTS app.ai_toegang_beheer (
  scope      text        PRIMARY KEY,
  uit        boolean     NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.ai_toegang ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_toegang_beheer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_toegang_eigen ON app.ai_toegang;
CREATE POLICY ai_toegang_eigen ON app.ai_toegang
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DROP POLICY IF EXISTS ai_toegang_beheer_lezen ON app.ai_toegang_beheer;
CREATE POLICY ai_toegang_beheer_lezen ON app.ai_toegang_beheer
  FOR SELECT USING (true);
DROP POLICY IF EXISTS ai_toegang_beheer_schrijven ON app.ai_toegang_beheer;
CREATE POLICY ai_toegang_beheer_schrijven ON app.ai_toegang_beheer
  FOR ALL USING (current_user::text <> 'mijnruimte_app')
  WITH CHECK (current_user::text <> 'mijnruimte_app');

-- Bestaande verbindingen behouden wat ze hadden: alle ondersteunde scopes (zie shared/ai-toegang.ts).
-- Alleen actieve (niet ingetrokken, niet verlopen) OAuth-verbindingen en agenttokens.
DO $$
DECLARE
  alle text[] := ARRAY['mail.read', 'mail.send', 'calendar.read', 'calendar.write', 'files.read',
    'board.read', 'board.write', 'notes.read', 'notes.write',
    'devices.read', 'devices.write', 'github.read', 'github.write', 'site.read'];
BEGIN
  INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes)
  SELECT t.user_id, 'mcp-koppeling', t.id::text, alle
    FROM app.mcp_oauth_tokens t
   WHERE t.revoked_at IS NULL AND t.refresh_expires_at > now()
  ON CONFLICT (soort, onderwerp_id) DO NOTHING;
  INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes)
  SELECT t.user_id, 'agenttoken', t.id::text, alle
    FROM app.mcp_console_tokens t
   WHERE t.revoked_at IS NULL AND t.expires_at > now()
  ON CONFLICT (soort, onderwerp_id) DO NOTHING;
END $$;
