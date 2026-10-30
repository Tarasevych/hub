-- 0057: indeling van het beheeroverzicht (admin.* → Огляд) per beheerder.
--   Een beheerder kiest welke widgets zichtbaar zijn, hun volgorde en formaat. Alleen weergave: geeft en neemt GEEN rechten
--   (die blijven op de server: sessie, beheerrol). Geen rij = standaardindeling (shared/overzicht-widgets.ts).
--   De server normaliseert elke indeling vóór het opslaan; de database bewaart alleen een klein JSON-document.
-- Lezen en schrijven alleen via de systeemrol (backend/admin-overzicht.ts) met de user_id uit de sessie; de app-rol krijgt geen
-- rechten op deze tabel (rechten.sql geeft haar alleen app.records). De RLS-policy is een extra vangnet als dat ooit verandert.
CREATE TABLE IF NOT EXISTS app.admin_overzicht_indeling (
  user_id      text        PRIMARY KEY,
  indeling     jsonb       NOT NULL CHECK (jsonb_typeof(indeling) = 'object' AND pg_column_size(indeling) <= 8192),
  gewijzigd_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.admin_overzicht_indeling ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_overzicht_indeling_eigen ON app.admin_overzicht_indeling;
CREATE POLICY admin_overzicht_indeling_eigen ON app.admin_overzicht_indeling
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- Snelle aggregaties op het auditlogboek voor het live-overzicht (tijdvenster + actie); bestaande indexen dekken id/actor/actie.
CREATE INDEX IF NOT EXISTS audit_tijd_idx ON app.audit (created_at DESC);
