-- 0058: momentopnamen van het beheeroverzicht (admin.* → Огляд → «Знімки стану»).
--   Elk uur (soort 'uur') en elke dag (soort 'dag') wordt een KLEIN document bewaard met alleen tellers (gebruikers, online, sessies,
--   gebeurtenissen, storingen, diensten, wachtrij) — nooit namen, e-mail, IP of inhoud. Bewaartermijn 90 dagen (opruimen bij het schrijven).
--   Lezen en schrijven alleen via de systeemrol (backend/admin-overzicht-momentopnamen.ts); de app-rol krijgt geen rechten.
CREATE TABLE IF NOT EXISTS app.admin_overzicht_momentopnamen (
  soort      text        NOT NULL CHECK (soort IN ('uur', 'dag')),
  emmer      bigint      NOT NULL,
  genomen_op timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 4096),
  PRIMARY KEY (soort, emmer)
);
CREATE INDEX IF NOT EXISTS admin_overzicht_momentopnamen_tijd_idx ON app.admin_overzicht_momentopnamen (soort, genomen_op DESC);
ALTER TABLE app.admin_overzicht_momentopnamen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_overzicht_momentopnamen_systeem ON app.admin_overzicht_momentopnamen;
CREATE POLICY admin_overzicht_momentopnamen_systeem ON app.admin_overzicht_momentopnamen
  USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
