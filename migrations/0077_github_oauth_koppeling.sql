-- 0077: echte GitHub-koppeling (OAuth-app en GitHub App van de eigenaar), 20.10.2026.
--
-- Melding van de eigenaar: «досить кнопок-пустушок» — op de koppelkaart van GitHub was alleen de persoonlijke token (PAT)
-- een werkende weg; «Aanmelden met GitHub» en «GitHub App» stonden er met de reden waarom ze niet konden. Nu loopt de server
-- beide wegen echt, en daarvoor horen twee nieuwe logische tabellen bij de RLS-groep «verbindingen»:
--
--   github_koppeling_v1    één rij per gebruiker per weg ('oauth' | 'app'): de login, de toegekende scopes, de termijn en het
--                          installatienummer — plus de token ZELF, uitsluitend als AES-256-GCM-zegel (backend/github-koppeling-
--                          opslag.ts, sleutel GITHUB_KOPPELING_SLEUTEL_V1, gebonden aan gebruiker + weg). Zonder die sleutel is
--                          de rij waardeloos; de database alleen stelen levert dus geen GitHub-toegang op.
--   github_oauth_state_v1  de eenmalige `state` van een begonnen OAuth-flow, alleen als SHA-256-hash, met de hash van de sessie
--                          die hem startte, de host en een vervaltijd van 10 minuten. De rij verdwijnt bij het eerste gebruik,
--                          dus dezelfde state een tweede keer vindt niets. De PKCE-verifier staat erin als zegel.
--
-- Beide tabellen staan in app.records (zoals owner_vault_v1), dus de kolom owner_id volgt uit data->>'userId' (0007) en de
-- policy's van 0007/0033 gelden zodra de groep «verbindingen» op 'aan' staat. Daarom worden ze hier aan die groep toegevoegd:
-- een token of een state van de ene gebruiker mag de rol mijnruimte_app nooit voor een andere gebruiker kunnen lezen.
--
-- Schakelen van de groep blijft zoals het was: alleen root, met deploy/db-rollen-instellen.sh rls-groep verbindingen aan|uit.
-- Idempotent: de tabelnamen worden alleen toegevoegd als ze er nog niet in staan.
DO $github_koppeling$
DECLARE nieuw text[] := ARRAY['github_koppeling_v1', 'github_oauth_state_v1'];
BEGIN
  IF to_regclass('app.rls_groepen') IS NULL THEN
    RAISE NOTICE '0077: app.rls_groepen bestaat nog niet (migratie 0033 niet gelopen) — niets te doen';
    RETURN;
  END IF;
  UPDATE app.rls_groepen
     SET tabellen = (SELECT array_agg(DISTINCT t ORDER BY t) FROM unnest(tabellen || nieuw) AS t),
         bijgewerkt = now()
   WHERE groep = 'verbindingen'
     AND NOT (tabellen @> nieuw);
END
$github_koppeling$;

-- Een begonnen, nooit afgemaakte flow is na tien minuten waardeloos. De app ruimt ze bij elke start op
-- (backend/github-koppeling-opslag.ts → statesOpruimen); dit haalt wat er bij een eerdere versie is achtergebleven weg,
-- zodat de tabel niet groeit. Alleen verlopen rijen, nooit een geldige flow.
DELETE FROM app.records
 WHERE tbl = 'github_oauth_state_v1'
   AND COALESCE((data->>'verlooptOp')::bigint, 0) < (EXTRACT(EPOCH FROM now()) * 1000)::bigint;
