-- 0311 (CONSOL-001, 22.11.2026): закриття прогалини прав доступу міграції 0306 для таблиць
-- розподіленого зберігання Шаміра (app.verdeelde_opslag_knopen, app.verdeelde_opslag_rotaties).
-- Обидві таблиці належать до контуру керування власника (backend/verdeelde-opslag-beheer.ts → mijnruimte_system):
-- відкликаємо прямі права читання та зміни записів у ролі mijnruimte_app і вмикаємо примусовий рядковий захист
-- за власником рядка (gebruiker_id = app.huidige_gebruiker()).
-- Повністю зворотно сумісна та повторювана міграція без руйнівних дій.
-- Herstel van rijbeveiliging en rolrechten voor app.verdeelde_opslag_knopen en app.verdeelde_opslag_rotaties (0306):
-- intrekken van tabelrechten bij mijnruimte_app en inschakelen van ENABLE + FORCE ROW LEVEL SECURITY op gebruiker_id.

ALTER TABLE app.verdeelde_opslag_knopen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.verdeelde_opslag_knopen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verdeelde_opslag_knopen_eigen ON app.verdeelde_opslag_knopen;
CREATE POLICY verdeelde_opslag_knopen_eigen ON app.verdeelde_opslag_knopen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR gebruiker_id = app.huidige_gebruiker()
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR gebruiker_id = app.huidige_gebruiker()
  );

ALTER TABLE app.verdeelde_opslag_rotaties ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.verdeelde_opslag_rotaties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verdeelde_opslag_rotaties_eigen ON app.verdeelde_opslag_rotaties;
CREATE POLICY verdeelde_opslag_rotaties_eigen ON app.verdeelde_opslag_rotaties
  USING (
    current_user::text <> 'mijnruimte_app'
    OR gebruiker_id = app.huidige_gebruiker()
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR gebruiker_id = app.huidige_gebruiker()
  );

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON
      app.verdeelde_opslag_knopen,
      app.verdeelde_opslag_rotaties
    FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.verdeelde_opslag_knopen,
      app.verdeelde_opslag_rotaties
    TO mijnruimte_system;
  END IF;
END
$r$;
