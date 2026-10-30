-- 0073: browserextensie 0.6 — twee profielen (sloten 'prive' en 'technisch') en beleid per gebruiker (backend/extensie-ontgrendeling.ts,
-- backend/extensie-beleid.ts, 19.10.2026).
--
--   app.extensie_beleid: per gebruiker wat de extensie in elk slot hoogstens mag (aan/uit, caps — null = alle —, maximale duur,
--     lokale agent). Ontbreekt de rij, dan geldt het standaardbeleid (alles aan, 30 dagen / 480 minuten). Alleen de eigenaar of een
--     lopende technische activering met 'users.manage' wijzigt het (nooit dat van de eigenaar door een ander); elke wijziging in app.audit.
--   app.extensie_ontgrendelingen: kolom ruimte ('prive' | 'technisch'; bestaande rijen waren technisch). De duurgrens hangt nu af van de
--     ruimte: technisch ≤ 8 uur, prive ≤ 30 dagen. Een prive-ontgrendeling heeft nooit admin.* of api.* in zijn domeinen en hangt
--     nooit aan een technische activering. bevestigd_met: hoe de mens bevestigde (passkey, totp, herstelcode, google).
--   app.agent_pairing_codes: alleen_platform — een koppelcode voor het technische slot van de extensie werkt alleen voor een browser.
--
-- Idempotent (agents.test.ts draait alle migraties vanaf 0012 opnieuw).
CREATE TABLE IF NOT EXISTS app.extensie_beleid (
  user_id               text        PRIMARY KEY,
  prive_aan             boolean     NOT NULL DEFAULT true,
  technisch_aan         boolean     NOT NULL DEFAULT true,
  prive_caps            text[],
  technisch_caps        text[],
  prive_max_dagen       integer     NOT NULL DEFAULT 30,
  technisch_max_minuten integer     NOT NULL DEFAULT 480,
  lokaal_aan            boolean     NOT NULL DEFAULT true,
  notitie               text        NOT NULL DEFAULT '',
  gewijzigd_door        text,
  gewijzigd_op          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extensie_beleid_prive_caps CHECK (prive_caps IS NULL
    OR prive_caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug']::text[]),
  CONSTRAINT extensie_beleid_technisch_caps CHECK (technisch_caps IS NULL
    OR technisch_caps <@ ARRAY['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug']::text[]),
  CONSTRAINT extensie_beleid_prive_dagen CHECK (prive_max_dagen BETWEEN 1 AND 30),
  CONSTRAINT extensie_beleid_technisch_minuten CHECK (technisch_max_minuten BETWEEN 5 AND 480),
  CONSTRAINT extensie_beleid_notitie CHECK (length(notitie) <= 300)
);

ALTER TABLE app.extensie_beleid ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extensie_beleid_eigen ON app.extensie_beleid;
CREATE POLICY extensie_beleid_eigen ON app.extensie_beleid
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT ON app.extensie_beleid TO mijnruimte_app;
    REVOKE INSERT, UPDATE, DELETE ON app.extensie_beleid FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE ON app.extensie_beleid TO mijnruimte_system;
  END IF;
END
$r$;

-- Ontgrendelingen: ruimte + duur per ruimte.
ALTER TABLE app.extensie_ontgrendelingen ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT 'technisch';
ALTER TABLE app.extensie_ontgrendelingen ADD COLUMN IF NOT EXISTS bevestigd_met text;
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_ruimte;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_ruimte CHECK (ruimte IN ('prive', 'technisch'));
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_duur;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_duur CHECK (
  (ruimte = 'technisch' AND eind_op <= begin_op + interval '8 hours')
  OR (ruimte = 'prive' AND eind_op <= begin_op + interval '30 days'));
ALTER TABLE app.extensie_ontgrendelingen DROP CONSTRAINT IF EXISTS extensie_ontgrendelingen_prive;
ALTER TABLE app.extensie_ontgrendelingen ADD CONSTRAINT extensie_ontgrendelingen_prive CHECK (ruimte <> 'prive' OR (
  activatie_id IS NULL
  AND NOT ('admin.tarasevych.com' = ANY (domeinen)) AND NOT ('api.tarasevych.com' = ANY (domeinen))));
CREATE INDEX IF NOT EXISTS extensie_ontgrendelingen_lopend_user_idx ON app.extensie_ontgrendelingen (user_id) WHERE ingetrokken_op IS NULL;

-- Koppelcode alleen voor één soort apparaat (technisch slot van de extensie: 'browser').
ALTER TABLE app.agent_pairing_codes ADD COLUMN IF NOT EXISTS alleen_platform text;
