-- 0315 — Календар: метадані ресурсу CalDAV (bron_href, etag), примусовий рядковий захист та прапорець agenda-koppelingen-v1.
-- Agenda: CalDAV-bronpad en ETag in de externe spiegel, afgedwongen rijbeveiliging en functievlag agenda-koppelingen-v1 (standaard uit).

ALTER TABLE app.agenda_externe_gebeurtenis
  ADD COLUMN IF NOT EXISTS bron_href text NOT NULL DEFAULT '' CHECK (length(bron_href) <= 2000),
  ADD COLUMN IF NOT EXISTS etag text NOT NULL DEFAULT '' CHECK (length(etag) <= 300);

ALTER TABLE app.agenda_koppeling ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_koppeling FORCE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_abonnement ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_abonnement FORCE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_externe_gebeurtenis ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_externe_gebeurtenis FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_koppeling_eigen ON app.agenda_koppeling;
CREATE POLICY agenda_koppeling_eigen ON app.agenda_koppeling
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  );

DROP POLICY IF EXISTS agenda_abonnement_eigen ON app.agenda_abonnement;
CREATE POLICY agenda_abonnement_eigen ON app.agenda_abonnement
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  );

DROP POLICY IF EXISTS agenda_externe_gebeurtenis_eigen ON app.agenda_externe_gebeurtenis;
CREATE POLICY agenda_externe_gebeurtenis_eigen ON app.agenda_externe_gebeurtenis
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  );

DO $agenda_koppelingen_rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.agenda_koppeling, app.agenda_abonnement, app.agenda_externe_gebeurtenis TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.agenda_koppeling, app.agenda_abonnement, app.agenda_externe_gebeurtenis TO mijnruimte_system;
  END IF;
END
$agenda_koppelingen_rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'agenda-koppelingen-v1',
  'Календар: двосторонній запис подій CalDAV із перевіркою прав і версій, вивантаження .ics та швидкі переходи. | Agenda: tweerichtings-CalDAV met rechten- en versiecontrole, .ics-uitvoer en snelle sprongen.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
