-- 0287 — LAI-CON-001 (16.11.2026): beleid «Локальний ШІ / Lokale AI» per gebruiker (app.extensie_beleid).
-- Політика «Локальний ШІ Chrome» для кожного користувача.
--
-- Waarom: de ingebouwde AI van Chrome rekent op het apparaat van de gebruiker zelf, nooit op de server. Daarom staat ze standaard
-- voor iedereen AAN. De beheerder (eigenaar of 'users.manage') mag haar voor een gebruiker uitzetten — alleen MET een reden: de gebruiker
-- ziet die reden, wie het deed (gewijzigd_door) en wat hij kan doen. Het beleid geldt voor aanvragen van de site en (later) van de
-- connector; wat iemand in zijn eigen browser doet, beslist hij zelf.
--   lokale_ai_aan    standaard true
--   lokale_ai_reden  verplicht (≥ 10 tekens) zolang lokale_ai_aan = false; leeg zodra weer aan
-- Oude code kent de kolommen niet en negeert ze (standaard aan): veilige richting bij terugdraaien, want rekenen gebeurt toch lokaal.
-- Daarnaast: opdrachttype 'browser.lokale_ai' in de CHECK van app.agent_commands (onderaan).
-- Idempotent: tweemaal draaien geeft hetzelfde resultaat.

ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_aan boolean NOT NULL DEFAULT true;
ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_reden text NOT NULL DEFAULT '';
-- Wie uitzette en wanneer: apart van gewijzigd_door, zodat een latere andere wijziging de naam bij de reden niet overschrijft.
ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_door text;
ALTER TABLE app.extensie_beleid ADD COLUMN IF NOT EXISTS lokale_ai_op timestamptz;
ALTER TABLE app.extensie_beleid DROP CONSTRAINT IF EXISTS extensie_beleid_lokale_ai_reden;
ALTER TABLE app.extensie_beleid ADD CONSTRAINT extensie_beleid_lokale_ai_reden CHECK (
  length(lokale_ai_reden) <= 300 AND (lokale_ai_aan OR length(btrim(lokale_ai_reden)) >= 10));

-- Opdrachttypes (connector browser_local_ai → 'browser.lokale_ai'): de lijst van 0110 + 'browser.lokale_ai'. Zonder dit weigerde
-- createCommand de rij (23514, gevonden bij de review op een echte PostgreSQL). De tekst zelf staat nooit in params (eenmalig ticket).
ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN (
                  'fs.read', 'fs.list', 'fs.stat', 'fs.search', 'fs.write', 'exec', 'sys.info', 'docker.ps',
                  'docker.manage', 'sys.metrics', 'browser.snapshot', 'browser.navigate', 'browser.invoke',
                  'browser.click', 'browser.type', 'browser.diagnostics', 'browser.screenshot', 'browser.tabs',
                  'browser.history', 'browser.scroll', 'browser.wait', 'browser.select', 'browser.key',
                  'browser.deep_diagnostics', 'browser.console', 'browser.network', 'browser.hover',
                  'browser.fill_form', 'browser.pages', 'browser.self_test', 'browser.audit', 'browser.script', 'browser.lokale_ai',
                  'apps.deploy', 'apps.status', 'apps.list',
                  'apps.logs', 'apps.versions', 'apps.rollback', 'apps.control', 'apps.route', 'apps.secret.list',
                  'apps.secret.set', 'apps.secret.delete'));
