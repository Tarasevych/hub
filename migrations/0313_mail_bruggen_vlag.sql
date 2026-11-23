-- 0313 (CONSOL-001 / Віха M3, 23.11.2026): таблиця повторостійкості та зворотних посилань міжслужбових мостів Пошти
-- (лист або вкладення → Нотатки, Завдання, Звірка, Календар, Картка клієнта) у межах ізольованих просторів prive/technisch.
-- Зберігає лише непрозорі ідентифікатори без приватного тексту листів, під захистом ENABLE + FORCE ROW LEVEL SECURITY.
-- Duurzame idempotentietabel en verwijzingen voor dienstbruggen vanuit Post onder strikte FORCE RLS per gebruiker en ruimte.

CREATE TABLE IF NOT EXISTS app.mail_dienstbruggen (
  gebruiker_id text NOT NULL,
  ruimte text NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  sleutel text NOT NULL CHECK (char_length(sleutel) BETWEEN 8 AND 160),
  bron_soort text NOT NULL CHECK (bron_soort IN ('bericht', 'bijlage')),
  account_id text NOT NULL,
  message_id text NOT NULL,
  bijlage_id text NOT NULL DEFAULT '',
  doel_soort text NOT NULL CHECK (doel_soort IN ('notitie', 'taak', 'afstemming', 'agenda', 'klant')),
  doel_id text NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gebruiker_id, ruimte, sleutel)
);

CREATE INDEX IF NOT EXISTS mail_dienstbruggen_bericht
  ON app.mail_dienstbruggen (gebruiker_id, ruimte, account_id, message_id);

ALTER TABLE app.mail_dienstbruggen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mail_dienstbruggen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_dienstbruggen_eigen ON app.mail_dienstbruggen;
CREATE POLICY mail_dienstbruggen_eigen ON app.mail_dienstbruggen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      gebruiker_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      gebruiker_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  );

DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.mail_dienstbruggen TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.mail_dienstbruggen TO mijnruimte_system;
  END IF;
END
$rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'mail-dienstbruggen-v1',
  'Міжслужбові мости Пошти: швидкі дії з листа або вкладення у Нотатки, Завдання, Календар та Картку клієнта. | Dienstbruggen in Post: snelle acties vanuit bericht of bijlage naar Notities, Taken, Agenda en Klantkaart.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
