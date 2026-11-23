-- 0312 (CONSOL-001 / KLANT-001, 23.11.2026): укріплення безпеки таблиці app.klantrelatieboek поверх живої основи 0307_klantrelatiebeheer
-- (примусовий FORCE ROW LEVEL SECURITY, відкликання прав PUBLIC, точна перевірка непорожніх app.user_id та app.ruimte) і реєстрація прапорця
-- можливості klantrelatiebeheer-v1 за правилом VLAG-001 (типово вимкнений до міграції 0335).
-- Verharding van app.klantrelatieboek boven op 0307_klantrelatiebeheer (FORCE RLS, REVOKE PUBLIC, NULLIF-beleid) en registratie van klantrelatiebeheer-v1.

REVOKE ALL ON TABLE app.klantrelatieboek FROM PUBLIC;
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

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'klantrelatiebeheer-v1',
  'Клієнтські взаємини: зашифровані досьє клієнтів, угоди, контакти, завдання та кошторис у просторі. | Klantrelatiebeheer: versleutelde klantdossiers, verkoopkansen, contactmomenten, taken en begroting.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
