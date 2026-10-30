-- 0190 — UI-014 (bugfix «позначене прочитаним лишається непрочитаним»): gelezen activiteit-ids per account op de server
-- (backend/meldingen-gelezen.ts), opslag in app.records, tbl 'melding_gelezen_v1', één rij per gebruiker. Geen nieuwe tabel; alleen
-- de RLS-groep «voorkeuren» kent deze tbl voortaan (zelfde patroon als 0143). Idempotent. Terugdraaien:
--   UPDATE app.rls_groepen SET tabellen = array_remove(tabellen, 'melding_gelezen_v1') WHERE groep = 'voorkeuren';
--   DELETE FROM app.records WHERE tbl = 'melding_gelezen_v1';
UPDATE app.rls_groepen
   SET tabellen = array_append(tabellen, 'melding_gelezen_v1'), bijgewerkt = now()
 WHERE groep = 'voorkeuren' AND NOT ('melding_gelezen_v1' = ANY(tabellen));
