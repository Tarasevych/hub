-- 0286 — RUIMTE-WEERGAVE-001 (16.11.2026): простір у вкладці ≠ пауза технічного сеансу.
-- Weergave per tabblad: welke ruimte DIT tabblad toont, los van de technische sessie.
--
-- Waarom: «Звичайний / Технічний» wisselen zette de HELE technische sessie van die aanmelding op pauze (tech_ruimte_sessies.actief),
-- dus ook AI-verbindingen (MCP) en andere tabbladen. De eigenaar wil snel tussen de ruimtes wisselen terwijl de sessie en de diensten
-- doorlopen; alleen een bewuste «Пауза» of «Завершити» stopt ze. Nu:
--   tech_ruimte_tabs.weergave  'technisch' | 'prive' — alleen dit tabblad; een site-verzoek uit een tabblad met 'prive' krijgt
--                              nooit technische rechten of de technische lade (kan alleen verkleinen, nooit vergroten).
--   tech_ruimte_sessies.actief blijft de PAUZE van de sessie ('prive' = op pauze), maar wordt alleen nog door «Пауза»/«Продовжити» gezet.
-- Oude code (vóór deze release) kent de kolom niet en negeert hem: dan geldt weer «wisselen = pauze» (veilige richting).
-- Idempotent: tweemaal draaien op een schone database geeft hetzelfde resultaat.

ALTER TABLE app.tech_ruimte_tabs ADD COLUMN IF NOT EXISTS weergave text NOT NULL DEFAULT 'technisch';
ALTER TABLE app.tech_ruimte_tabs DROP CONSTRAINT IF EXISTS tech_ruimte_tabs_weergave_check;
ALTER TABLE app.tech_ruimte_tabs ADD CONSTRAINT tech_ruimte_tabs_weergave_check CHECK (weergave IN ('prive', 'technisch'));
