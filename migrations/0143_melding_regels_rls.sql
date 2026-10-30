-- 0143 — Leveringsregels voor meldingen (UI-007, vlag meldingen-v2): opslag in app.records, tbl 'melding_regels_v1', één rij
-- per gebruiker. Geen nieuwe tabel; alleen de RLS-groep «voorkeuren» kent deze tbl voortaan, zodat ze samen met de andere
-- eigen instellingen wordt afgedwongen (zie 0033). Idempotent. Terugdraaien:
--   UPDATE app.rls_groepen SET tabellen = array_remove(tabellen, 'melding_regels_v1') WHERE groep = 'voorkeuren';
--   DELETE FROM app.records WHERE tbl = 'melding_regels_v1';
UPDATE app.rls_groepen
   SET tabellen = array_append(tabellen, 'melding_regels_v1'), bijgewerkt = now()
 WHERE groep = 'voorkeuren' AND NOT ('melding_regels_v1' = ANY(tabellen));
