-- 0285 — AI-TERMIJN-001 (15.11.2026): termijnen en regels voor de AI-sessiedelegatie (app.tech_ruimte_ai).
-- Терміни й правила делегування технічного простору підключенню ШІ.
--
-- Waarom: de toestemming hing aan ÉÉN technische sessie (één subdomein in één browser). Pauze op mcp.* = Claude weg, ook als de eigenaar
-- op admin.* technisch bleef; een nieuwe technische sessie liet de toestemming stil vervallen. Nu:
--   termijn          + 'tot-account-uitloggen' (elke aanmelding van de eigenaar) en 'onbepaald'; eind_op mag bij elke termijn een harde grens zijn
--   site_sessie_id   de aanmelding waarin de toestemming gegeven werd (anker voor 'tot-site-uitloggen')
--   bij_pauze        pauzeren (standaard) | intrekken | doorwerken — wat er gebeurt als de eigenaar zelf naar de gewone ruimte gaat
--   inactief_minuten intrekken na N minuten zonder gebruik door de AI (standaard 60; NULL = nooit)
--   bij_afmelden     intrekken (standaard) | blijven — alleen bij 'tijd'/'onbepaald': ook zonder levende aanmelding blijven
--   laatst_gebruikt_op, ingetrokken_op, ingetrokken_reden, gevaren — journaal en «!» in de UI
-- Oude code (vóór deze release) kent de nieuwe termijnwaarden niet → weigert (veilige richting) bij terugdraaien.
-- Idempotent: tweemaal draaien op een schone database geeft hetzelfde resultaat.

ALTER TABLE app.tech_ruimte_ai DROP CONSTRAINT IF EXISTS tech_ruimte_ai_tijd;
ALTER TABLE app.tech_ruimte_ai DROP CONSTRAINT IF EXISTS tech_ruimte_ai_termijn_check;

ALTER TABLE app.tech_ruimte_ai
  ADD COLUMN IF NOT EXISTS site_sessie_id     text,
  ADD COLUMN IF NOT EXISTS bij_pauze          text        NOT NULL DEFAULT 'pauzeren',
  ADD COLUMN IF NOT EXISTS inactief_minuten   integer,
  ADD COLUMN IF NOT EXISTS bij_afmelden       text        NOT NULL DEFAULT 'intrekken',
  ADD COLUMN IF NOT EXISTS laatst_gebruikt_op timestamptz,
  ADD COLUMN IF NOT EXISTS ingetrokken_op     timestamptz,
  ADD COLUMN IF NOT EXISTS ingetrokken_reden  text,
  ADD COLUMN IF NOT EXISTS gevaren            text[]      NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE app.tech_ruimte_ai DROP CONSTRAINT IF EXISTS tech_ruimte_ai_termijn_v2;
ALTER TABLE app.tech_ruimte_ai ADD CONSTRAINT tech_ruimte_ai_termijn_v2
  CHECK (termijn IN ('tijd', 'tot-technisch-einde', 'tot-site-uitloggen', 'tot-account-uitloggen', 'onbepaald'));
ALTER TABLE app.tech_ruimte_ai DROP CONSTRAINT IF EXISTS tech_ruimte_ai_tijd_v2;
ALTER TABLE app.tech_ruimte_ai ADD CONSTRAINT tech_ruimte_ai_tijd_v2 CHECK (termijn <> 'tijd' OR eind_op IS NOT NULL);
ALTER TABLE app.tech_ruimte_ai DROP CONSTRAINT IF EXISTS tech_ruimte_ai_regels;
ALTER TABLE app.tech_ruimte_ai ADD CONSTRAINT tech_ruimte_ai_regels CHECK (
  bij_pauze IN ('pauzeren', 'intrekken', 'doorwerken')
  AND bij_afmelden IN ('intrekken', 'blijven')
  AND (inactief_minuten IS NULL OR inactief_minuten BETWEEN 5 AND 10080)
  AND (ingetrokken_reden IS NULL OR char_length(ingetrokken_reden) <= 40)
  AND cardinality(gevaren) <= 8
);

-- Bestaande rijen: gedrag als vóór de release (pauze laat de toestemming staan, geen inactief-grens), anker van de aanmelding invullen.
UPDATE app.tech_ruimte_ai a SET site_sessie_id = s.sessie_id
  FROM app.tech_ruimte_sessies s
 WHERE a.site_sessie_id IS NULL AND s.id = a.ruimte_sessie_id;

COMMENT ON COLUMN app.tech_ruimte_ai.bij_pauze IS 'AI-TERMIJN-001: pauzeren | intrekken | doorwerken — als de eigenaar zelf naar de gewone ruimte overschakelt.';
COMMENT ON COLUMN app.tech_ruimte_ai.inactief_minuten IS 'AI-TERMIJN-001: intrekken na zoveel minuten zonder gebruik door de AI; NULL = nooit (bewuste keuze, «!»).';
COMMENT ON COLUMN app.tech_ruimte_ai.bij_afmelden IS 'AI-TERMIJN-001: alleen bij tijd/onbepaald — blijven = ook zonder levende aanmelding (breedste stand, «!»).';
