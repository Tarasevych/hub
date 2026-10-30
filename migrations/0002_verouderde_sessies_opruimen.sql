-- Auth fase 1 (docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md): eenmalige opruiming van rijen uit de
-- verouderde aanmeld-/sessiemodellen. De routes die deze rijen aanmaakten of lazen, antwoorden nu
-- 410 Gone (backend/index.ts, VEROUDERDE_ROUTE_WEG); de huidige sessies staan in
-- owner_service_sessions_v1 / owner_tab_sessions_v1 / owner_browser_grants_v1 en blijven ongemoeid.
--
-- Idempotent: een tweede uitvoering verwijdert gewoon niets meer (en de runner voert elke migratie
-- maar één keer uit, zie server/migrate.ts).
--   google_sessions        oude hub-sessies (token in de request-body)
--   service_sessions       oude dienstsessies (30 dagen, verlengden zichzelf, negeerden revocatie)
--   browser_grants         oude "onthouden browser"-grants van het oude model
--   google_auth_codes      eenmalige codes van POST /api/auth/google (ID-token zonder nonce)
--   auth_broker_requests   oude broker-aanvragen
DELETE FROM app.records
 WHERE tbl IN ('google_sessions', 'service_sessions', 'browser_grants', 'google_auth_codes', 'auth_broker_requests');
