-- 0060: technische activering gebonden aan de aanmeldsessie (audit 18.10.2026, punt 3).
--
-- Probleem: «Вийти всюди», revoke-all/revoke-others/emergency-revoke en het intrekken van één aanmelding beëindigden de sessies,
-- maar NIET de rijen in app.tech_activaties. Na opnieuw aanmelden in hetzelfde tabblad (zelfde tab_hash) was het technisch profiel
-- weer actief zonder nieuwe stap-op, in de open modus tot 366 dagen.
--
-- Oplossing: elke activering onthoudt de ankersessie (sessie_id) en, als die er is, de tab-overlay (tab_sessie_id). Intrekken van een
-- sessie beëindigt de bijbehorende activeringen; «alles» beëindigt alles. Rijen zonder sessie_id (van vóór deze migratie) tellen bij
-- elke intrekking als «alle». Daarnaast controleert de server (backend/tech-profiel.ts, actieveActivatie) dat een activering bij de
-- HUIDIGE sessie hoort: sessie_id = huidige sessie, of (oude rij) begonnen ná het begin van de huidige sessie.
ALTER TABLE app.tech_activaties ADD COLUMN IF NOT EXISTS sessie_id text;
ALTER TABLE app.tech_activaties ADD COLUMN IF NOT EXISTS tab_sessie_id text;
CREATE INDEX IF NOT EXISTS tech_activaties_sessie_idx ON app.tech_activaties (user_id, sessie_id) WHERE beeindigd_op IS NULL;

-- Nieuwe redenen van beëindiging: per intrekking te zien in het logboek en in de sessielijst.
ALTER TABLE app.tech_activaties DROP CONSTRAINT IF EXISTS tech_activaties_beeindigd_reden_check;
ALTER TABLE app.tech_activaties ADD CONSTRAINT tech_activaties_beeindigd_reden_check CHECK (beeindigd_reden IS NULL OR beeindigd_reden IN (
  'zelf', 'verlopen', 'ingetrokken', 'vervangen', 'noodstop', 'uitgelogd',
  'revoke', 'revoke-all', 'revoke-others', 'emergency', 'handmatig'));
