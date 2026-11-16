-- 0212 — Huis: uitnodigingen in plaats van rechtstreeks toevoegen (SEC-002, bevinding integraties-09, 12.11.2026).
--
-- Tot nu toe zette «Учасники → Додати» (POST /api/huis/leden, actie 'toevoegen') een ander account meteen in app.huis_leden:
--   • het antwoord verschilde tussen «er is geen goedgekeurd account met dit adres» en «toegevoegd» — elke eigenaar van een
--     woning (iedereen kan er één aanmaken) kon zo raden wie een account heeft;
--   • de toegevoegde zag zonder eigen toestemming een woning van een vreemde in zijn lijst (naam, gebeurtenissen, voorstellen
--     onder controle van de uitnodiger).
-- Nu: een rij hier met stand 'uitgenodigd'. Lid wordt men pas wanneer de genodigde ZELF aanvaardt (backend/huis-vnext.ts,
-- uitnodigingBesluiten). `user_id` vult de server in als er een goedgekeurd account met dat adres is (NULL = geen account:
-- de uitnodiging verloopt dan gewoon); de uitnodiger krijgt die kolom nooit te zien. Een afwijzing staat alleen in
-- `afgewezen_op`: voor de uitnodiger blijft de rij er precies zo uitzien als elke andere openstaande uitnodiging (ook na
-- opnieuw uitnodigen), en gedurende 14 dagen krijgt de genodigde ze niet opnieuw te zien of gemeld. Een ingetrokken
-- uitnodiging blijft als rij staan (voor niemand zichtbaar), zodat intrekken en opnieuw uitnodigen geen reeks meldingen aan
-- de genodigde oplevert (`gemeld_op`).
--
-- RLS: alleen de EIGENAAR van de woning (app.huis_is_eigenaar, 0131) leest en schrijft hier via de app-rol. De genodigde
-- leest en beslist via de systeemrol met een uitdrukkelijke controle op user_id (hij is nog geen lid en mag de woning zelf
-- onder RLS niet zien). Idempotent.

CREATE TABLE IF NOT EXISTS app.huis_uitnodigingen (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id      uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  email          text        NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  user_id        text,                                            -- de genodigde, door de server opgezocht; NULL = geen goedgekeurd account met dit adres
  door_user_id   text        NOT NULL,                            -- wie uitnodigde (eigenaar van de woning)
  rol            text        NOT NULL DEFAULT 'gast' CHECK (rol IN ('lid', 'gast', 'installateur', 'ondersteuning')),
  lid_geldig_tot timestamptz,                                     -- einde van het lidmaatschap (installateur/ondersteuning), anders NULL
  stand          text        NOT NULL DEFAULT 'uitgenodigd' CHECK (stand IN ('uitgenodigd', 'ingetrokken')),
  verloopt_op    timestamptz NOT NULL DEFAULT now() + interval '14 days',
  gemeld_op      timestamptz,                                     -- laatste melding aan de genodigde (hoogstens één per etmaal per woning)
  afgewezen_op   timestamptz,                                     -- de genodigde wees af; nooit zichtbaar voor de uitnodiger
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (woning_id, email)
);
CREATE INDEX IF NOT EXISTS huis_uitnodigingen_user_idx ON app.huis_uitnodigingen (user_id) WHERE user_id IS NOT NULL;

DO $huis_uitnodigingen$
BEGIN
  ALTER TABLE app.huis_uitnodigingen ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS huis_uitnodigingen_eigenaar ON app.huis_uitnodigingen;
  CREATE POLICY huis_uitnodigingen_eigenaar ON app.huis_uitnodigingen
    USING (current_user::text <> 'mijnruimte_app' OR app.huis_is_eigenaar(woning_id))
    WITH CHECK (current_user::text <> 'mijnruimte_app' OR app.huis_is_eigenaar(woning_id));
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.huis_uitnodigingen TO mijnruimte_app;
  END IF;
END
$huis_uitnodigingen$;
