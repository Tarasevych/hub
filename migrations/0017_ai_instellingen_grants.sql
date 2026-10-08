-- 0017: per-gebruiker AI-instellingen en toestemmingen (grants) voor agents (browserextensie en pc-agent).
--
-- Model (veilig-agenten-0.4):
--   app.user_ai_settings  één rij per gebruiker: plafond van mogelijkheden (capabilities), een epoch die bij ELKE wijziging
--                         omhoog gaat (agents krijgen {type:'settings',epoch,caps} via de WebSocket) en een blokkade.
--   app.ai_grants         per agent en per mogelijkheid: wanneer gegeven, tot wanneer (verplicht), ingetrokken, domeinen,
--                         en of de gebruiker 'altijd' (zonder klik per opdracht) heeft gekozen. Zonder geldige grant geen
--                         opdracht. 'altijd' kan alleen met step-up (route) en vervalt verplicht (hier: hoogstens 90 dagen).
--
-- RLS: strenger dan app.rls_vrij(): voor mijnruimte_app geldt de eigen-rij-regel ALTIJD, ook als 'afdwingen' nog uit staat.
-- De server gebruikt voor deze tabellen uitsluitend de app-rol met app.user_id = de betrokken gebruiker (ook vanuit het
-- WebSocket-kanaal: daar is de gebruiker die van de agent). mijnruimte_system en de migrator blijven vrijgesteld (onderhoud).

-- Samengestelde sleutel zodat een grant alleen naar een agent van DEZELFDE gebruiker kan wijzen (per-gebruiker, ook in de DB).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_id_user_uniek') THEN
    ALTER TABLE app.agents ADD CONSTRAINT agents_id_user_uniek UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.user_ai_settings (
  user_id        text PRIMARY KEY,
  capabilities   jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {"browser.read": true, "machine.exec": false, ...}; ontbreekt = toegestaan als er een grant is
  epoch          bigint      NOT NULL DEFAULT 1,
  blocked_at     timestamptz,
  blocked_reason text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.ai_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  agent_id    uuid        NOT NULL,
  capability  text        NOT NULL CHECK (capability IN (
                'browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug',
                'machine.read', 'machine.write', 'machine.exec', 'machine.docker')),
  scope       jsonb       NOT NULL DEFAULT '{"domains": []}'::jsonb,   -- domains: lege lijst = alle eigen sites (*.tarasevych.com)
  always      boolean     NOT NULL DEFAULT false,
  preset      text        CHECK (preset IS NULL OR preset IN ('spostericach', 'pomichnyk', 'razovo', 'handmatig', 'migratie')),
  granted_by  text,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  CONSTRAINT ai_grants_agent_fk FOREIGN KEY (agent_id, user_id) REFERENCES app.agents (id, user_id) ON DELETE CASCADE,
  CONSTRAINT ai_grants_vervalt_later CHECK (expires_at > granted_at),
  CONSTRAINT ai_grants_max_duur CHECK (expires_at <= granted_at + interval '90 days'),
  CONSTRAINT ai_grants_scope_vorm CHECK (jsonb_typeof(scope -> 'domains') = 'array')
);
CREATE INDEX IF NOT EXISTS ai_grants_actief_idx ON app.ai_grants (user_id, agent_id, capability) WHERE revoked_at IS NULL;

ALTER TABLE app.user_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_ai_settings_eigen ON app.user_ai_settings;
CREATE POLICY user_ai_settings_eigen ON app.user_ai_settings
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DROP POLICY IF EXISTS ai_grants_eigen ON app.ai_grants;
CREATE POLICY ai_grants_eigen ON app.ai_grants
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- Bestaande agents: alleen LEES-grants (30 dagen), nooit iets destructiefs of 'altijd'. Wie meer wil, geeft opnieuw toestemming.
INSERT INTO app.ai_grants (user_id, agent_id, capability, preset, granted_by, expires_at)
SELECT a.user_id, a.id, CASE WHEN a.platform = 'browser' THEN 'browser.read' ELSE 'machine.read' END, 'migratie', 'migratie-0017', now() + interval '30 days'
  FROM app.agents a
 WHERE a.revoked_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM app.ai_grants g WHERE g.agent_id = a.id);

INSERT INTO app.user_ai_settings (user_id)
SELECT DISTINCT user_id FROM app.agents
ON CONFLICT (user_id) DO NOTHING;
