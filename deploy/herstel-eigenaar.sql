-- Herstel eigenaar — alleen uitvoeren als CONTROLE-EIGENAAR-IDENTITEIT.sql een afwijking toont.
-- Відновлення власника — виконувати ЛИШЕ якщо перевірка показала відхилення.
--
--   sudo -u postgres psql -d mijnruimte -v eigenaar='eigenaar@voorbeeld.be' -f deploy/herstel-eigenaar.sql
--
-- Alles staat in ÉÉN transactie die standaard wordt TERUGGEDRAAID (ROLLBACK onderaan). Lees eerst de SELECT-uitvoer;
-- is die juist, vervang dan de laatste regel ROLLBACK door COMMIT en voer opnieuw uit.
-- Усе в ОДНІЙ транзакції, яка за замовчуванням ВІДКОЧУЄТЬСЯ (ROLLBACK унизу). Спочатку перегляньте вивід SELECT;
-- якщо все правильно — замініть останній рядок ROLLBACK на COMMIT і виконайте знову.
--
-- Stap 1 — eigenaarsrol terugzetten op het OUDSTE actieve account met OWNER_EMAIL (alleen als er nu géén eigenaar is).
-- Stap 2 — extra (verweesde) accounts met OWNER_EMAIL die GEEN eigenaar zijn: markeren als gepensioneerd (retiredAt) — niets
--          wordt verwijderd; hun sessies worden gesloten. (Alleen als stap B/E van de controle >1 / rijen toonde.)
-- Stap 3 — meer dan één Google-identiteit op de eigenaarsrij: de NIET laatst gebruikte op 'disabled' zetten (niet wissen).
-- Elke stap schrijft een regel in app.audit (hash-keten) via audit_toevoegen, zodat het herstel zichtbaar is in /audit.
\set ON_ERROR_STOP on
BEGIN;

\echo '--- vooraf'
SELECT id, data->>'role' AS rol, data->>'status' AS status FROM app.records
 WHERE tbl='users' AND lower(data->>'email')=lower(:'eigenaar') AND COALESCE((data->>'retiredAt')::numeric,0)=0
 ORDER BY (data->>'createdAt')::numeric NULLS FIRST;

\echo '--- stap 1: eigenaarsrol herstellen (alleen als er geen eigenaar is)'
WITH kandidaat AS (
  SELECT id FROM app.records
   WHERE tbl='users' AND lower(data->>'email')=lower(:'eigenaar') AND COALESCE((data->>'retiredAt')::numeric,0)=0
     AND NOT EXISTS (SELECT 1 FROM app.records WHERE tbl='users' AND data->>'role'='owner')
   ORDER BY (data->>'createdAt')::numeric NULLS FIRST LIMIT 1)
UPDATE app.records r SET data = r.data || jsonb_build_object('role','owner','status','approved','accessLevel','full','updatedAt',(extract(epoch from now())*1000)::bigint)
  FROM kandidaat k WHERE r.id = k.id
RETURNING r.id AS hersteld_eigenaar;

\echo '--- stap 2: verweesde extra accounts met OWNER_EMAIL pensioneren (niet wissen)'
UPDATE app.records SET data = data || jsonb_build_object('retiredAt',(extract(epoch from now())*1000)::bigint,'updatedAt',(extract(epoch from now())*1000)::bigint)
 WHERE tbl='users' AND lower(data->>'email')=lower(:'eigenaar') AND COALESCE(data->>'role','')<>'owner'
   AND COALESCE((data->>'retiredAt')::numeric,0)=0
RETURNING id AS gepensioneerd;
DELETE FROM app.records WHERE tbl='owner_service_sessions_v1'
   AND data->>'userId' IN (SELECT id::text FROM app.records WHERE tbl='users' AND lower(data->>'email')=lower(:'eigenaar') AND COALESCE(data->>'role','')<>'owner')
RETURNING id AS sessie_gesloten;

\echo '--- stap 3: extra Google-identiteiten op de eigenaarsrij uitschakelen (laatst gebruikte blijft)'
WITH eig AS (SELECT id::text AS id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1),
     ident AS (SELECT i.id, row_number() OVER (ORDER BY COALESCE((i.data->>'lastUsedAt')::numeric,0) DESC) AS rang
                 FROM app.records i, eig WHERE i.tbl='account_identities' AND i.data->>'provider'='google' AND i.data->>'accountId'=eig.id)
UPDATE app.records r SET data = r.data || '{"status":"disabled"}'::jsonb FROM ident WHERE r.id=ident.id AND ident.rang>1
RETURNING r.id AS identiteit_uitgeschakeld;

\echo '--- logboek (hash-keten)'
SELECT app.audit_toevoegen(
  (SELECT id::text FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1), NULL,
  'owner.rol.hersteld', 'beheer', 'success',
  jsonb_build_object('bron','deploy/herstel-eigenaar.sql','reden','handmatig herstel na CONTROLE-EIGENAAR-IDENTITEIT'),
  NULL, NULL, 'systeem');

\echo '--- achteraf'
SELECT id, data->>'role' AS rol, data->>'status' AS status, COALESCE((data->>'retiredAt')::numeric,0)<>0 AS gepensioneerd FROM app.records
 WHERE tbl='users' AND lower(data->>'email')=lower(:'eigenaar') ORDER BY (data->>'createdAt')::numeric NULLS FIRST;

ROLLBACK; -- ← na controle van de uitvoer vervangen door COMMIT / після перевірки замінити на COMMIT
