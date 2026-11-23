-- 0318 (CONSOL-001, Віха M3): облік явної згоди користувача на читання світлин із підключених
-- зовнішніх хмарних джерел (Google Диск, Nextcloud, NAS) у межах простору у службі «Фото»
-- та реєстрація прапорця foto-google-drive-v1 зі станом false, false за правилом VLAG-001.
-- Bijhouden van uitdrukkelijke gebruikerstoestemming voor externe fotobronnen per ruimte
-- en registratie van de functievlag foto-google-drive-v1 (standaard uit conform VLAG-001).

CREATE TABLE IF NOT EXISTS app.foto_externe_bronnen (
  user_id text NOT NULL,
  ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bron text NOT NULL CHECK (bron IN ('google-drive', 'nextcloud', 'nas')),
  toestemming boolean NOT NULL DEFAULT false,
  laatst_op timestamptz,
  aantal integer NOT NULL DEFAULT 0 CHECK (aantal >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, bron)
);

CREATE INDEX IF NOT EXISTS idx_foto_externe_bronnen_eigenaar
  ON app.foto_externe_bronnen (user_id, ruimte);

ALTER TABLE app.foto_externe_bronnen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.foto_externe_bronnen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS foto_externe_bronnen_eigen ON app.foto_externe_bronnen;
CREATE POLICY foto_externe_bronnen_eigen ON app.foto_externe_bronnen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  );

REVOKE ALL ON app.foto_externe_bronnen FROM PUBLIC;
DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.foto_externe_bronnen TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.foto_externe_bronnen TO mijnruimte_system;
  END IF;
END
$rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'foto-google-drive-v1',
  'Пряме індексування та показ світлин із підключених сховищ Google Диск і WebDAV у службі «Фото» за згодою користувача. / Rechtstreekse foto-indexering uit Google Drive en WebDAV na toestemming.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
