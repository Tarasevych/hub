-- 0310 (KLANT-001, 22.11.2026): зашифрований реєстр взаємин із клієнтами (досьє, угоди, контакти, завдання, квитанції повторостійкості).
-- Увесь вміст запечатано ключем даних користувача (DEK) з прив’язкою до таблиці, користувача, простору, виду запису та ідентифікатора.
-- De inhoud en het ontvangstbewijs zijn gebonden aan de gegevenssleutel, de ruimte en de rij onder strikte FORCE RLS.

CREATE TABLE IF NOT EXISTS app.klantrelatieboek (
  gebruiker text NOT NULL,
  ruimte text NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  id uuid NOT NULL,
  soort text NOT NULL CHECK (soort IN ('klant', 'kans', 'contact', 'taak', 'ontvangst')),
  klant_id uuid,
  inhoud text CHECK (inhoud IS NOT NULL OR soort = 'ontvangst'),
  PRIMARY KEY (gebruiker, ruimte, id, soort)
);

CREATE INDEX IF NOT EXISTS klantrelatieboek_dossier
  ON app.klantrelatieboek (gebruiker, ruimte, klant_id);

ALTER TABLE app.klantrelatieboek ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.klantrelatieboek FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS klantrelatieboek_eigen ON app.klantrelatieboek;
CREATE POLICY klantrelatieboek_eigen ON app.klantrelatieboek
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      gebruiker = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      gebruiker = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
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

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'klantrelatiebeheer-v1',
  'Клієнтські взаємини: зашифровані досьє клієнтів, угоди, контакти, завдання та кошторис у просторі. | Klantrelatiebeheer: versleutelde klantdossiers, verkoopkansen, contactmomenten, taken en begroting.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
