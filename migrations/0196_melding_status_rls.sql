-- 0196 — UI-014 fase 2B (vlag meldingen-uitleg-v3, standaard UIT): blijvende status per melding per gebruiker op de server
-- (прочитане / вирішено / архів / відкладено, met wie/wanneer/hoe) + bewaartermijn voor automatisch archiveren
-- (backend/meldingen-status.ts). Opslag in app.records, tbl 'melding_status_v1', één rij per gebruiker. Geen nieuwe tabel;
-- alleen de RLS-groep «voorkeuren» kent deze tbl voortaan (zelfde patroon als 0143/0190). Idempotent. Terugdraaien:
--   UPDATE app.rls_groepen SET tabellen = array_remove(tabellen, 'melding_status_v1') WHERE groep = 'voorkeuren';
--   DELETE FROM app.records WHERE tbl = 'melding_status_v1';
UPDATE app.rls_groepen
   SET tabellen = array_append(tabellen, 'melding_status_v1'), bijgewerkt = now()
 WHERE groep = 'voorkeuren' AND NOT ('melding_status_v1' = ANY(tabellen));
