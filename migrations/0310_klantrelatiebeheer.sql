-- De inhoud en het ontvangstbewijs zijn gebonden aan de gegevenssleutel, de ruimte en de rij.
CREATE TABLE IF NOT EXISTS app.klantrelatieboek (
  gebruiker text NOT NULL,
  ruimte text NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  id uuid NOT NULL,
  soort text NOT NULL CHECK (soort IN ('klant', 'kans', 'contact', 'taak', 'ontvangst')),
  klant_id uuid,
  inhoud text CHECK (inhoud IS NOT NULL OR soort = 'ontvangst'),
  PRIMARY KEY (gebruiker, ruimte, id, soort)
);
CREATE INDEX IF NOT EXISTS klantrelatieboek_dossier ON app.klantrelatieboek (gebruiker, ruimte, klant_id);
ALTER TABLE app.klantrelatieboek ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS klantrelatieboek_eigen ON app.klantrelatieboek;
CREATE POLICY klantrelatieboek_eigen ON app.klantrelatieboek USING (
  gebruiker = current_setting('app.user_id', true) AND ruimte = current_setting('app.ruimte', true)
) WITH CHECK (
  gebruiker = current_setting('app.user_id', true) AND ruimte = current_setting('app.ruimte', true)
);
DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.klantrelatieboek TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.klantrelatieboek TO mijnruimte_system;
  END IF;
END
$rechten$;
