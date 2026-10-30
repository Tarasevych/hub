-- 0075: «Перевірка всіх адрес» — automatisch herhalen met groeiende pauze en een bewaarde keuze (punt 15, 19.10.2026).
-- Melding van de eigenaar: de controle van ≈19 731 berichten stopte bij 5 050 met «Не вдалося (HTTP_502)»; het venster kwam
-- steeds terug en moest ≈101 keer met de hand bevestigd worden (5 050 / 50 berichten per pagina = 101 pagina's). Er was geen
-- keuze «продовжити / пропустити» en geen «запам'ятати мій вибір».
--   app.mail_contacten_scan        + poging / wacht_tot  — de stand van het herhalen per mailbox, zodat de pagina «Контакти й
--                                   відправники» en de zwevende melding kunnen zeggen «повторюю через N с, спроба X» in plaats
--                                   van een knop te laten wachten. Beide horen bij de voortgang en worden in dezelfde rij (en
--                                   dus dezelfde transactie) bijgewerkt als page_token: na een herstart is de stand echt.
--                                 + staat 'overgeslagen' — een mailbox die na alle pogingen blijft weigeren bij beleid
--                                   «пропускати проблемні»: de rest van de controle gaat door en niemand hoeft te klikken.
--   app.mail_contacten_scan_beleid de bewaarde keuze per gebruiker (automatisch / overslaan / vragen). Eén rij per gebruiker,
--                                   onder RLS: het is een persoonlijke voorkeur.
-- De pauzes zelf (2 s, 4 s, 8 s … max 120 s, hoogstens 12 pogingen) staan in shared/mail-scan-beleid.ts — dezelfde code in de
-- browser en op de server. Idempotent.
ALTER TABLE app.mail_contacten_scan ADD COLUMN IF NOT EXISTS poging smallint NOT NULL DEFAULT 0;
ALTER TABLE app.mail_contacten_scan ADD COLUMN IF NOT EXISTS wacht_tot timestamptz;
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mail_contacten_scan_poging_check') THEN
    ALTER TABLE app.mail_contacten_scan ADD CONSTRAINT mail_contacten_scan_poging_check CHECK (poging BETWEEN 0 AND 100);
  END IF;
END
$c$;

-- `staat` kreeg de waarde 'overgeslagen'. De oorspronkelijke CHECK heet door de inline-definitie in 0074
-- «mail_contacten_scan_staat_check»; voor de zekerheid wordt elke CHECK op kolom `staat` opgezocht en vervangen.
DO $c$
DECLARE naam text;
BEGIN
  FOR naam IN
    SELECT c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'app' AND t.relname = 'mail_contacten_scan' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%staat%'
  LOOP
    EXECUTE format('ALTER TABLE app.mail_contacten_scan DROP CONSTRAINT %I', naam);
  END LOOP;
  ALTER TABLE app.mail_contacten_scan ADD CONSTRAINT mail_contacten_scan_staat_check
    CHECK (staat IN ('wacht', 'bezig', 'gepauzeerd', 'gestopt', 'klaar', 'fout', 'overgeslagen'));
END
$c$;

CREATE TABLE IF NOT EXISTS app.mail_contacten_scan_beleid (
  user_id       text        NOT NULL PRIMARY KEY,
  beleid        text        NOT NULL DEFAULT 'automatisch' CHECK (beleid IN ('automatisch', 'overslaan', 'vragen')),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.mail_contacten_scan_beleid ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_contacten_scan_beleid_eigen ON app.mail_contacten_scan_beleid;
CREATE POLICY mail_contacten_scan_beleid_eigen ON app.mail_contacten_scan_beleid
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
