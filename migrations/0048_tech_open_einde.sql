-- 0048: technisch profiel zonder tijdsgrens voor «tot uitloggen» en «tot verlaten van het technisch profiel».
--
-- Probleem: tech_activaties_duur (0030) liet elke activering na hoogstens 8 uur eindigen, en de server kapte ze op het plafond van de
-- strengste rol (eigenaar: 2 uur). De gebruiker wil dat «tot uitloggen» echt tot het uitloggen duurt en «tot verlaten» zolang hij in het
-- technisch profiel blijft; andere automatische uitlogmaatregelen volgen later en horen niet in deze tabel.
--
-- Oplossing: kolom modus. 'tijd' blijft hard begrensd op 8 uur; 'tot-uitloggen' en 'tot-verlaten' hebben geen tijdsgrens. eind_op is
-- NOT NULL en wordt voor die modi een technische achtervang van 366 dagen (geen beleid: de activering eindigt bij uitloggen of bij het
-- verlaten van het profiel; zie backend/tech-profiel.ts, beeindigenBijUitloggen).
ALTER TABLE app.tech_activaties ADD COLUMN IF NOT EXISTS modus text NOT NULL DEFAULT 'tijd';
ALTER TABLE app.tech_activaties DROP CONSTRAINT IF EXISTS tech_activaties_modus;
ALTER TABLE app.tech_activaties ADD CONSTRAINT tech_activaties_modus CHECK (modus IN ('tijd', 'tot-uitloggen', 'tot-verlaten'));
ALTER TABLE app.tech_activaties DROP CONSTRAINT IF EXISTS tech_activaties_duur;
ALTER TABLE app.tech_activaties ADD CONSTRAINT tech_activaties_duur CHECK (
  eind_op > begin_op AND eind_op <= begin_op + CASE WHEN modus = 'tijd' THEN interval '8 hours' ELSE interval '366 days' END);
ALTER TABLE app.tech_activaties DROP CONSTRAINT IF EXISTS tech_activaties_beeindigd_reden_check;
ALTER TABLE app.tech_activaties ADD CONSTRAINT tech_activaties_beeindigd_reden_check CHECK (beeindigd_reden IS NULL OR beeindigd_reden IN ('zelf', 'verlopen', 'ingetrokken', 'vervangen', 'noodstop', 'uitgelogd'));

-- De eigenaar mag ook vaste termijnen tot 8 uur kiezen (was 2 uur).
UPDATE app.tech_profielen SET max_minuten = 480 WHERE rollen = ARRAY['eigenaar']::text[] AND max_minuten < 480;
