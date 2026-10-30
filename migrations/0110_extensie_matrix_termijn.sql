-- 0110 (22.10.2026, zone E): «БРАУЗЕР І АГЕНТИ» — één matrix voor wat elke AI via de browserextensie mag, en termijnen die de
-- eigenaar zelf kiest (shared/extensie-matrix.ts, backend/extensie-matrix.ts, src/extensie/BrowserEnAgenten.tsx).
--
-- Waarom: «Що може ШІ» zat verstopt onder elke gekoppelde browser (ai_grants per browseragent), los van het ontgrendelen, en
-- een technische ontgrendeling duurde hoogstens 8 uur (0072/0073). De eigenaar wil één scherm — slot × mogelijkheid × agent —
-- en een termijn naar keuze (15 min … 1 jaar, tot uitloggen, tot intrekken).
--
-- WAT ER VERANDERT
--   • app.extensie_matrix (nieuw): per (user_id, ruimte, agent) de caps die DIE agent in DAT slot mag; agent '*' = alle agenten
--     zonder eigen rij. Geen rij voor een ruimte = erfenis: de oude toestemmingen per browser blijven gelden (niets valt stil weg).
--     Op de rij '*' staan twee slotschakelaars: zonder_bevestiging (destructieve acties zonder klik; alleen met step-up gezet) en
--     devtools_namen (connector v2 toont ook de namen van chrome-devtools-mcp).
--   • app.extensie_ontgrendelingen: einde_soort ('duur' | 'tech-einde' | 'uitloggen' | 'handmatig') en overleeft_activatie
--     (een technische ontgrendeling die langer loopt dan de activering — de eigenaar koos dat; elk technisch hulpmiddel eist bij
--     gebruik toch een lopende activering). De duurgrens wordt 366 dagen in beide ruimtes; de caps-CHECK kent zeven mogelijkheden.
--   • app.extensie_beleid: prive_max_dagen tot 366, technisch_max_minuten tot 527040 (= 366 d); caps-CHECK met zeven mogelijkheden.
--     Bestaande rijen houden hun waarden (een beheerder die 30/480 koos, houdt 30/480); alleen de BOVENGRENS wordt ruimer.
--     Nieuwe rijen (en het standaardbeleid in shared/extensie-ontgrendeling.ts) krijgen de ruime bovengrens: de eigenaar beslist.
--   • app.ai_grants.capability en app.agent_commands.type: 'browser.console' (rij «Консоль і мережа» van de matrix; de opdrachten
--     console/netwerk houden voor bestaande toestemmingen en ontgrendelingen hun mogelijkheid browser.read, de matrix eist daarnaast
--     browser.console — backend/extensie-matrix.ts matrixCap) en 'browser.script' (evaluate_script via de Chrome-debugger; alleen
--     technisch slot + pakket «diagnose» + vinkje in de matrix). Vervolg: 0111 («до закриття браузера», browsersessie).
--
-- Idempotent (de testsuite draait alle migraties opnieuw). Terugdraaien: DROP TABLE app.extensie_matrix; de twee kolommen van
-- app.extensie_ontgrendelingen droppen; de CHECK-constraints terug naar die van 0072/0073/0017; rijen met de nieuwe caps eerst wissen.

CREATE TABLE IF NOT EXISTS app.extensie_matrix (
  user_id             text        NOT NULL,
  ruimte              text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  agent               text        NOT NULL CHECK (agent IN ('*', 'claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor')),
  caps                text[]      NOT NULL DEFAULT '{}',
  zonder_bevestiging  boolean     NOT NULL DEFAULT false,
  devtools_namen      boolean     NOT NULL DEFAULT false,
  gewijzigd_door      text,
  gewijzigd_op        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, agent),
  CONSTRAINT extensie_matrix_caps CHECK (cardinality(caps) <= 7 AND caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact',
    'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script']::text[]),
  -- debugger en scripts bestaan nooit in het privéslot
  CONSTRAINT extensie_matrix_prive CHECK (ruimte <> 'prive' OR NOT (caps && ARRAY['browser.debug', 'browser.script']::text[]))
);
ALTER TABLE app.extensie_matrix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extensie_matrix_eigen ON app.extensie_matrix;
CREATE POLICY extensie_matrix_eigen ON app.extensie_matrix
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT ON app.extensie_matrix TO mijnruimte_app;
    REVOKE INSERT, UPDATE, DELETE ON app.extensie_matrix FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.extensie_matrix TO mijnruimte_system;
  END IF;
END
$r$;

-- Ontgrendelingen: termijn naar keuze, zeven mogelijkheden.
ALTER TABLE app.extensie_ontgrendelingen ADD COLUMN IF NOT EXISTS einde_soort text NOT NULL DEFAULT 'duur';
ALTER TABLE app.extensie_ontgrendelingen ADD COLUMN IF NOT EXISTS overleeft_activatie boolean NOT NULL DEFAULT false;
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_einde_soort;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_einde_soort CHECK (einde_soort IN ('duur', 'tech-einde', 'uitloggen', 'handmatig'));
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_duur;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_duur CHECK (eind_op <= begin_op + interval '366 days');
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_caps;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_caps CHECK (cardinality(caps) BETWEEN 1 AND 7
  AND caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script']::text[]);
-- Bestaande technische rijen hingen aan hun activering: zo blijft het (einde_soort 'tech-einde', overleeft false).
UPDATE app.extensie_ontgrendelingen SET einde_soort = 'tech-einde' WHERE activatie_id IS NOT NULL AND einde_soort = 'duur' AND ingetrokken_op IS NULL;

-- Beleid: ruimere bovengrens, zeven mogelijkheden.
ALTER TABLE app.extensie_beleid DROP CONSTRAINT IF EXISTS extensie_beleid_prive_dagen;
ALTER TABLE app.extensie_beleid ADD CONSTRAINT extensie_beleid_prive_dagen CHECK (prive_max_dagen BETWEEN 1 AND 366);
ALTER TABLE app.extensie_beleid DROP CONSTRAINT IF EXISTS extensie_beleid_technisch_minuten;
ALTER TABLE app.extensie_beleid ADD CONSTRAINT extensie_beleid_technisch_minuten CHECK (technisch_max_minuten BETWEEN 5 AND 527040);
ALTER TABLE app.extensie_beleid ALTER COLUMN prive_max_dagen SET DEFAULT 366;
ALTER TABLE app.extensie_beleid ALTER COLUMN technisch_max_minuten SET DEFAULT 527040;
ALTER TABLE app.extensie_beleid DROP CONSTRAINT IF EXISTS extensie_beleid_prive_caps;
ALTER TABLE app.extensie_beleid ADD CONSTRAINT extensie_beleid_prive_caps CHECK (prive_caps IS NULL
  OR prive_caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script']::text[]);
ALTER TABLE app.extensie_beleid DROP CONSTRAINT IF EXISTS extensie_beleid_technisch_caps;
ALTER TABLE app.extensie_beleid ADD CONSTRAINT extensie_beleid_technisch_caps CHECK (technisch_caps IS NULL
  OR technisch_caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script']::text[]);

-- Toestemmingen per browser (0017): de twee nieuwe mogelijkheden.
ALTER TABLE app.ai_grants DROP CONSTRAINT IF EXISTS ai_grants_capability_check;
ALTER TABLE app.ai_grants ADD CONSTRAINT ai_grants_capability_check CHECK (capability IN (
  'browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script',
  'machine.read', 'machine.write', 'machine.exec', 'machine.docker'));

-- Opdrachttypes: de lijst van 0072 + 'browser.script'.
ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN (
                  'fs.read', 'fs.list', 'fs.stat', 'fs.search', 'fs.write', 'exec', 'sys.info', 'docker.ps',
                  'docker.manage', 'sys.metrics', 'browser.snapshot', 'browser.navigate', 'browser.invoke',
                  'browser.click', 'browser.type', 'browser.diagnostics', 'browser.screenshot', 'browser.tabs',
                  'browser.history', 'browser.scroll', 'browser.wait', 'browser.select', 'browser.key',
                  'browser.deep_diagnostics', 'browser.console', 'browser.network', 'browser.hover',
                  'browser.fill_form', 'browser.pages', 'browser.self_test', 'browser.audit', 'browser.script', 'apps.deploy', 'apps.status', 'apps.list',
                  'apps.logs', 'apps.versions', 'apps.rollback', 'apps.control', 'apps.route', 'apps.secret.list',
                  'apps.secret.set', 'apps.secret.delete'));
