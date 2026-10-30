-- Controle eigenaar en Google-identiteit — ALLEEN LEZEN (audit 18.10.2026, punt 5).
-- Перевірка власника та Google-ідентичності — ЛИШЕ ЧИТАННЯ (аудит 18.10.2026, п. 5).
--
-- Uitvoeren op de server / Виконати на сервері (ніяких змін, лише SELECT):
--   sudo -u postgres psql -d mijnruimte -v eigenaar='eigenaar@voorbeeld.be' -f deploy/CONTROLE-EIGENAAR-IDENTITEIT.sql
--   (vervang het adres door OWNER_EMAIL uit /etc/mijn-ruimte/geheimen.env; kleine letters)
--   (замініть адресу на OWNER_EMAIL із /etc/mijn-ruimte/geheimen.env; малими літерами)
--
-- Uitvoer bevat alleen tellingen en id's — geen namen, geen adressen (PII blijft weg).
-- У виводі лише лічильники та id — без імен і адрес.
--
-- Wat de uitkomsten betekenen / Що означають результати:
--   A. eigenaarsrijen (role=owner)            = 1  → goed / добре.  0 → GEEN eigenaar (zie herstel-eigenaar.sql, stap 1).
--                                               >1 kan niet (unieke index records_een_eigenaar) — staat dit er toch, dan ontbreekt de index: migraties controleren.
--   B. rijen met OWNER_EMAIL (actief)         = 1  → goed.  >1 → er bestaat een tweede account met het adres van de eigenaar
--                                               (oude situatie vóór audit-fix punt 5: ander Google-subject kreeg een «new»-account).
--                                               Sinds dit pakket wordt dat geweigerd; het bestaande extra account is onschadelijk
--                                               (role member) maar hoort weg: herstel-eigenaar.sql, stap 2.
--   C. google-identiteit van de eigenaar      = 1  → goed (vaste koppeling).  0 → gemigreerde DB zonder identiteit: de EERSTE Google-
--                                               aanmelding met OWNER_EMAIL koppelt eenmalig (code bewezen, test aanmelden 23/23); daarna 1.
--                                               >1 → meerdere Google-subjects aan één account: ongewenst, zie herstel stap 3.
--   D. eigenaar-rij heeft status approved     = t  → goed.  f (blocked/deleted) → de eigenaar kan niet aanmelden: herstel stap 1.
--   E. verweesde accounts met OWNER_EMAIL     = 0  → goed. Anders: lijst van id's (role/status) om te beoordelen; zie B.
--   F. laatste aanmeld-logregels eigenaar     : owner.rol.hersteld / owner.aanmelden.geweigerd zijn de nieuwe gebeurtenissen (audit-fix);
--                                               owner_role_demoted_stale / owner.role.demoted-stale = degradatie (mag ALLEEN op een ander adres).
--
-- ----------------------------------------------------------------------------------------------------------------------
\set ON_ERROR_STOP on
\echo 'A. eigenaarsrijen (role=owner) — verwacht 1'
SELECT count(*) AS eigenaarsrijen,
       count(*) FILTER (WHERE COALESCE((data->>'retiredAt')::numeric,0)=0) AS actief
  FROM app.records WHERE tbl='users' AND data->>'role'='owner';

\echo 'A2. unieke index records_een_eigenaar aanwezig — verwacht 1'
SELECT count(*) AS index_aanwezig FROM pg_indexes WHERE schemaname='app' AND indexname='records_een_eigenaar';

\echo 'B. actieve accounts met OWNER_EMAIL — verwacht 1 (id + rol + status, geen PII)'
SELECT id, data->>'role' AS rol, data->>'status' AS status,
       (data->>'sub') IS NOT NULL AND data->>'sub' <> '' AS heeft_oude_sub,
       to_timestamp(COALESCE((data->>'createdAt')::numeric,0)/1000) AS aangemaakt
  FROM app.records
 WHERE tbl='users' AND lower(data->>'email') = lower(:'eigenaar')
   AND COALESCE((data->>'retiredAt')::numeric,0)=0
 ORDER BY (data->>'createdAt')::numeric NULLS FIRST;

\echo 'C. Google-identiteiten gekoppeld aan de eigenaarsrij — verwacht 1 (0 = gemigreerde DB, koppelt bij eerste aanmelding)'
SELECT i.id AS identiteit_id, i.data->>'status' AS status, left(md5(i.data->>'subject'),12) AS subject_hash,
       to_timestamp(COALESCE((i.data->>'lastUsedAt')::numeric,0)/1000) AS laatst_gebruikt
  FROM app.records i
  JOIN app.records u ON u.tbl='users' AND u.data->>'role'='owner' AND u.id::text = i.data->>'accountId'
 WHERE i.tbl='account_identities' AND i.data->>'provider'='google';

\echo 'D. eigenaarsrij approved en niet geblokkeerd — verwacht t'
SELECT (data->>'status')='approved' AS approved, data->>'status' AS status
  FROM app.records WHERE tbl='users' AND data->>'role'='owner';

\echo 'E. verweesde (niet-eigenaar) accounts met OWNER_EMAIL — verwacht 0 rijen'
SELECT id, data->>'role' AS rol, data->>'status' AS status,
       (SELECT count(*) FROM app.records i WHERE i.tbl='account_identities' AND i.data->>'accountId'=u.id::text) AS identiteiten,
       (SELECT count(*) FROM app.records s WHERE s.tbl='owner_service_sessions_v1' AND s.data->>'userId'=u.id::text) AS sessies
  FROM app.records u
 WHERE tbl='users' AND lower(data->>'email') = lower(:'eigenaar') AND COALESCE(data->>'role','')<>'owner'
   AND COALESCE((data->>'retiredAt')::numeric,0)=0;

\echo 'F. laatste 10 aanmeld-/rolgebeurtenissen van de eigenaar (hash-keten)'
SELECT created_at AS tijd, action, result
  FROM app.audit
 WHERE owner_id = (SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1)
   AND (action LIKE 'owner.aanmelden.%' OR action LIKE 'owner.rol.%' OR action LIKE 'owner.role.%' OR action='account.email.conflict')
 ORDER BY seq DESC LIMIT 10;

\echo 'G. systeemlog (security_audit) eigenaar: demotie/herstel/weigering — laatste 10'
SELECT to_timestamp(COALESCE((data->>'createdAt')::numeric,0)/1000) AS tijd, data->>'event' AS gebeurtenis
  FROM app.records
 WHERE tbl='security_audit'
   AND data->>'accountId' = (SELECT id::text FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1)
   AND data->>'event' IN ('owner_first_google_binding','owner_role_demoted_stale','owner_role_restored','owner_sign_in_refused_identity_mismatch','sign_in_refused_blocked','identity_linked')
 ORDER BY (data->>'createdAt')::numeric DESC LIMIT 10;
