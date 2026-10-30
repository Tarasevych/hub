-- 0071: technisch profiel in een nieuw tabblad (melding van de eigenaar, 18.10.2026: «технічний профіль злітає в новій вкладці»).
--
-- Model (backend/tech-profiel.ts):
--  - een OPEN activering («tot uitloggen» / «tot verlaten») geldt voor de hele browsersessie: elk ander tabblad van DEZELFDE
--    ankersessie (sessie_id) krijgt bij zijn eerste status een eigen kopie (herkomst 'geerfd'), zonder nieuwe stap-op;
--  - een activering OP TIJD blijft van haar tabblad; een tabblad dat vanuit zo'n tabblad wordt geopend mag een eigen kopie met
--    hetzelfde einde krijgen (herkomst 'gedeeld'), alleen in dezelfde sessie en browser;
--  - verlopen = alleen die rij; zelf verlaten, uitloggen of intrekken = alle rijen van de sessie.
-- ouder_id wijst naar de activering waarvan de kopie is gemaakt (alleen informatief + logboek; geen FK zodat opruimen niet blokkeert).
ALTER TABLE app.tech_activaties ADD COLUMN IF NOT EXISTS ouder_id uuid;
ALTER TABLE app.tech_activaties ADD COLUMN IF NOT EXISTS herkomst text NOT NULL DEFAULT 'eigen';
ALTER TABLE app.tech_activaties DROP CONSTRAINT IF EXISTS tech_activaties_herkomst;
ALTER TABLE app.tech_activaties ADD CONSTRAINT tech_activaties_herkomst CHECK (herkomst IN ('eigen', 'geerfd', 'gedeeld'));
-- Zoeken naar de lopende open activering van een sessie en naar eerdere rijen van een tabblad in die sessie.
CREATE INDEX IF NOT EXISTS tech_activaties_sessie_tab_idx ON app.tech_activaties (user_id, sessie_id, tab_hash, begin_op DESC);
