-- 0273 — Uitnodigingslinks van een werkruimte: index voor de lijst «Відкриті посилання» en RLS (IDENTITEIT-015, крок «delen», 14.11.2026).
--
-- Перелік відкритих посилань простору (POST /api/share/link/lijst) і відкликання за id (POST /api/share/link/revoke з linkId)
-- шукають рядки app.invites за resource_type і context->>'workspaceId'. Без індексу — повний перегляд таблиці всіх запрошень.
-- Lijst en intrekken-op-id zoeken op (resource_type, context->>'workspaceId'); de index is niet partieel, zodat ook een al
-- ingetrokken link (herhaald intrekken = idempotent) snel gevonden wordt.
--
-- RLS: app.invites bevat geheimen (de code geeft een rol in een ruimte). De site leest en schrijft hier uitsluitend via de
-- systeemrol (server/platform/uitnodigingen.ts → getPool() = mijnruimte_system); de app-rol (verzoeken onder RLS) krijgt NIETS:
-- geen GRANT en een beleid dat voor mijnruimte_app geen enkele rij doorlaat (dubbele bodem, zoals 0212). Andere rollen
-- (systeem, migrator, één-rol-installaties zonder DATABASE_URL_APP) merken niets. Oude rijen blijven ongewijzigd geldig.
-- Idempotent: twee keer toepassen geeft geen fout.

CREATE INDEX IF NOT EXISTS invites_werkruimte_idx ON app.invites (resource_type, (context->>'workspaceId'), created_at DESC);

DO $invites_rls$
BEGIN
  ALTER TABLE app.invites ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS invites_alleen_systeem ON app.invites;
  CREATE POLICY invites_alleen_systeem ON app.invites
    USING (current_user::text <> 'mijnruimte_app')
    WITH CHECK (current_user::text <> 'mijnruimte_app');
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.invites FROM mijnruimte_app;
  END IF;
END
$invites_rls$;
