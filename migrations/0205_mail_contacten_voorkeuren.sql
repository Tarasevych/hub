-- MAILSCAN-002 · Вибір окремо для кожної скриньки. Без запису перевірка вимкнена.
-- Чинні результати перевірки не стираються, попередній вибір повторних спроб зберігається.
ALTER TABLE app.mail_contacten_scan_beleid
  ADD COLUMN IF NOT EXISTS voorkeuren jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mail_contacten_scan_voorkeuren_grootte') THEN
    ALTER TABLE app.mail_contacten_scan_beleid ADD CONSTRAINT mail_contacten_scan_voorkeuren_grootte
      CHECK (jsonb_typeof(voorkeuren) = 'object' AND pg_column_size(voorkeuren) <= 65536);
  END IF;
END
$controle$;
