-- 0072: browserextensie 0.5 — standaard vergrendeld, ontgrendelen met een EIGEN passkey (backend/extensie-ontgrendeling.ts, 18.10.2026).
--
--   app.extensie_ontgrendelingen: elke door de server ondertekende ontgrendeling van één gekoppelde browser (agent): voor wie, met
--     welke mogelijkheden (caps) en op welke hosts (domeinen), gekoppeld aan welke technische activering (activatie_id), tot wanneer,
--     en hoe ze eindigde (ingetrokken_op/_door, reden_einde). Hoogstens 8 uur (CHECK). De server zoekt hier vóór elke browseropdracht
--     de lopende rij (dispatchCommand); zonder rij gaat er niets naar de extensie.
--   app.passkey_uitdagingen: nieuw doel 'extensie-ontgrendelen' + kolom binding (agentId, caps, domeinen, eind, nonce, activering):
--     de challenge is de sha256 van precies die binding, eenmalig en ≤ 5 minuten (0023).
--   app.agent_commands: nieuw opdrachttype 'browser.audit' (cap browser.read). Laatste echte lijst: 0037 (0065 bestaat niet).
--
-- Schrijven alleen via de systeemrol; de app-rol (strikte RLS) mag eigen rijen lezen. Idempotent (agents.test.ts draait alle
-- migraties vanaf 0012 opnieuw).
CREATE TABLE IF NOT EXISTS app.extensie_ontgrendelingen (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         text        NOT NULL,
  user_id          text        NOT NULL,
  activatie_id     text,
  caps             text[]      NOT NULL,
  domeinen         text[]      NOT NULL,
  lokaal           boolean     NOT NULL DEFAULT false,
  rollen           text[]      NOT NULL DEFAULT '{}',
  nonce            text        NOT NULL,
  begin_op         timestamptz NOT NULL DEFAULT now(),
  eind_op          timestamptz NOT NULL,
  ingetrokken_op   timestamptz,
  ingetrokken_door text,
  reden_einde      text,
  passkey_vinger   text,
  CONSTRAINT extensie_ontgrendelingen_duur CHECK (eind_op <= begin_op + interval '8 hours'),
  CONSTRAINT extensie_ontgrendelingen_na_begin CHECK (eind_op > begin_op),
  CONSTRAINT extensie_ontgrendelingen_caps CHECK (cardinality(caps) BETWEEN 1 AND 5
    AND caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug']::text[]),
  CONSTRAINT extensie_ontgrendelingen_domeinen CHECK (cardinality(domeinen) BETWEEN 1 AND 20),
  CONSTRAINT extensie_ontgrendelingen_nonce CHECK (nonce ~ '^[A-Za-z0-9_-]{16,128}$')
);
CREATE INDEX IF NOT EXISTS extensie_ontgrendelingen_actief_idx ON app.extensie_ontgrendelingen (agent_id) WHERE ingetrokken_op IS NULL;
CREATE INDEX IF NOT EXISTS extensie_ontgrendelingen_user_idx ON app.extensie_ontgrendelingen (user_id, begin_op DESC);

ALTER TABLE app.extensie_ontgrendelingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extensie_ontgrendelingen_eigen ON app.extensie_ontgrendelingen;
CREATE POLICY extensie_ontgrendelingen_eigen ON app.extensie_ontgrendelingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT ON app.extensie_ontgrendelingen TO mijnruimte_app;
    REVOKE INSERT, UPDATE, DELETE ON app.extensie_ontgrendelingen FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE ON app.extensie_ontgrendelingen TO mijnruimte_system;
  END IF;
END
$r$;

-- Passkey-challenge voor het ontgrendelen (eigen passkey van de gebruiker, zelfde tabel als stap-op).
ALTER TABLE app.passkey_uitdagingen ADD COLUMN IF NOT EXISTS binding jsonb;
ALTER TABLE app.passkey_uitdagingen DROP CONSTRAINT IF EXISTS passkey_uitdagingen_doel_check;
ALTER TABLE app.passkey_uitdagingen ADD CONSTRAINT passkey_uitdagingen_doel_check
  CHECK (doel IN ('registreren', 'stap-op', 'extensie-ontgrendelen'));

-- Opdrachttypes: de lijst van 0037 + 'browser.audit'.
ALTER TABLE app.agent_commands DROP CONSTRAINT IF EXISTS agent_commands_type_check;
ALTER TABLE app.agent_commands ADD CONSTRAINT agent_commands_type_check
  CHECK (type IN (
                  'fs.read', 'fs.list', 'fs.stat', 'fs.search', 'fs.write', 'exec', 'sys.info', 'docker.ps',
                  'docker.manage', 'sys.metrics', 'browser.snapshot', 'browser.navigate', 'browser.invoke',
                  'browser.click', 'browser.type', 'browser.diagnostics', 'browser.screenshot', 'browser.tabs',
                  'browser.history', 'browser.scroll', 'browser.wait', 'browser.select', 'browser.key',
                  'browser.deep_diagnostics', 'browser.console', 'browser.network', 'browser.hover',
                  'browser.fill_form', 'browser.pages', 'browser.self_test', 'browser.audit', 'apps.deploy', 'apps.status', 'apps.list',
                  'apps.logs', 'apps.versions', 'apps.rollback', 'apps.control', 'apps.route', 'apps.secret.list',
                  'apps.secret.set', 'apps.secret.delete'));
