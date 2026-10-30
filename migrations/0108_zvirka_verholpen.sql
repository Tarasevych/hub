-- 0108 (22.10.2026, zone C): DE DRIE OPGELOSTE OVERTREDINGEN VAN «ЗВІРКА» UIT DE TELLER (app.rls_audit, migratie 0004).
--
-- WAAROM
--   app.rls_audit telt per (route, tabel, actie) wat RLS ZOU weigeren — een diagnoseteller zonder id's of inhoud, geen beveiligingslog
--   (dat is app.audit met zijn hashketen; daar verandert niets). deploy/db-rollen-instellen.sh «rls-groep <groep> aan» WEIGERT een groep
--   zolang de teller voor haar tabellen niet leeg is, en de pagina «Звірка» toont dan «Ще є порушення». Na deze release zijn de oorzaken
--   van precies drie combinaties weg (tests/eenheid/ruimte-aanvallen-20261022.test.ts §1–§3; docs/beveiliging/MAATREGELEN-PER-ROUTE-20261022.md §5):
--     • POST /api/owner/session/bootstrap · owner_browser_grants_v1 · lezen      — bewuste systeemstap met grant.userId === anker.userId;
--     • POST /api/access/request          · notification_jobs        · toevoegen  — taken met ontvanger = eigenaar, als systeemstap;
--     • POST /api/workspace/load          · workspace_blocks         · toevoegen  — vals alarm van de nabootsing (cache van ruimtes).
--   Zonder deze migratie bleven de oude tellingen (74×, 2×, 6×) staan en kon de eigenaar de groepen «verbindingen», «meldingen» en
--   «werkruimtes» nooit afdwingen. ALLE andere tellingen blijven onaangeroerd.
--
-- HET VENSTER TUSSEN MIGREREN EN ACTIVEREN
--   De installer migreert vóór hij de nieuwe release activeert; tot de herstart telt het OUDE proces door (wegschrijven elke 10 s). Een
--   telling die daarna nog verschijnt met «laatst» vóór het moment van activeren, komt uit dat venster (oude code), niet uit de nieuwe:
--   «sudo deploy/db-rollen-instellen.sh status» toont route, tabel, actie en tijd. Een telling met een tijd NA het activeren is echt en
--   moet onderzocht worden — daarom wist deze migratie alleen wat er nú staat (laatst < now()) en verbergt ze nooit iets van later.
--
-- Idempotent (een tweede keer vindt niets). Terugdraaien: niet nodig en niet mogelijk — het waren alleen getallen; komt een oorzaak terug,
-- dan telt de site haar vanzelf opnieuw.

DO $zvirka_verholpen$
DECLARE weg bigint; over bigint;
BEGIN
  IF to_regclass('app.rls_audit') IS NULL THEN
    RAISE NOTICE '0108: app.rls_audit bestaat niet (nog geen 0004) — niets te doen';
    RETURN;
  END IF;
  WITH w AS (
    DELETE FROM app.rls_audit
     WHERE (route, tbl, actie) IN (
             ('POST /api/owner/session/bootstrap', 'owner_browser_grants_v1', 'lezen'),
             ('POST /api/access/request', 'notification_jobs', 'toevoegen'),
             ('POST /api/workspace/load', 'workspace_blocks', 'toevoegen'))
       AND laatst < now()
     RETURNING aantal)
  SELECT COALESCE(sum(aantal), 0) INTO weg FROM w;
  SELECT COALESCE(sum(aantal), 0) INTO over FROM app.rls_audit;
  RAISE NOTICE '0108: % opgeloste tellingen uit «Звірка» gehaald (bootstrap/grants, access-request/jobs, workspace-load/blocks); andere tellingen ongewijzigd: % in totaal', weg, over;
END
$zvirka_verholpen$;
