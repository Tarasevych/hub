-- 0074: «Контакти й відправники» — volledige controle van ALLE adressen in de mail (19.10.2026, melding van de eigenaar:
-- «ти мав перевірити всі адреси листів … немає де їх передивитися»). Bouwt verder op 0064 (app.mail_afzenders).
--   app.mail_afzenders        + verzonden / laatst_verzonden_op («ви писали»: ontvangers van uw verzonden mail), in_contacten,
--                               accounts (in welke gekoppelde mailbox gezien), organisatie (organisatiedomein, om adressen van
--                               dezelfde organisatie te groeperen), officieel (domein staat in de gecureerde lijst) en vertrouwen
--                               (0–100, afgeleid van het bewijs; voor sorteren). De bewijsregels zelf worden bij het lezen
--                               opgebouwd uit bewijs + DNS (shared/mail-afzenders.ts → bewijsRegels), zodat ze nooit verouderen.
--   app.mail_domein_dns       DNS-bewijs per (gebruiker, domein): MX, SPF, DMARC (+ beleid), BIMI/VMC, tijdstip (cache 24 u).
--                               Per gebruiker en onder RLS: welke domeinen iemand mailt, is zelf privé.
--   app.mail_contacten_scan   voortgang van de volledige controle per (gebruiker, gekoppelde mailbox): fase (volledig/bijwerken),
--                               paginatoken, verwerkt, schatting, hoogwater (nieuwste verwerkte bericht, voor de incrementele
--                               controle). Wordt in DEZELFDE transactie geschreven als de contactrijen van die pagina (app-rol,
--                               eigen rijen onder RLS), zodat een onderbreking nooit een pagina dubbel telt.
-- Nooit berichtinhoud: alleen adressen, namen uit From/To/Cc/Bcc, tijdstip en de controle-uitslagen. Idempotent.
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS verzonden integer NOT NULL DEFAULT 0;
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS laatst_verzonden_op timestamptz;
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS in_contacten boolean NOT NULL DEFAULT false;
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS accounts text[] NOT NULL DEFAULT '{}';
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS organisatie text NOT NULL DEFAULT '';
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS officieel boolean NOT NULL DEFAULT false;
ALTER TABLE app.mail_afzenders ADD COLUMN IF NOT EXISTS vertrouwen smallint NOT NULL DEFAULT 0;
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mail_afzenders_contact_check') THEN
    ALTER TABLE app.mail_afzenders ADD CONSTRAINT mail_afzenders_contact_check CHECK (verzonden >= 0 AND cardinality(accounts) <= 20
      AND length(organisatie) <= 253 AND vertrouwen BETWEEN 0 AND 100);
  END IF;
END
$c$;
CREATE INDEX IF NOT EXISTS mail_afzenders_organisatie_idx ON app.mail_afzenders (user_id, organisatie);
CREATE INDEX IF NOT EXISTS mail_afzenders_verzonden_idx ON app.mail_afzenders (user_id, laatst_verzonden_op DESC) WHERE verzonden > 0;

CREATE TABLE IF NOT EXISTS app.mail_domein_dns (
  user_id          text        NOT NULL,
  domein           text        NOT NULL CHECK (length(domein) BETWEEN 1 AND 253 AND domein = lower(domein)),
  gegevens         jsonb       NOT NULL CHECK (jsonb_typeof(gegevens) = 'object' AND pg_column_size(gegevens) <= 2048),
  gecontroleerd_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, domein)
);

CREATE TABLE IF NOT EXISTS app.mail_contacten_scan (
  user_id         text        NOT NULL,
  account_id      text        NOT NULL CHECK (length(account_id) BETWEEN 1 AND 300),
  account_email   text        NOT NULL DEFAULT '' CHECK (length(account_email) <= 254),
  staat           text        NOT NULL CHECK (staat IN ('wacht', 'bezig', 'gepauzeerd', 'gestopt', 'klaar', 'fout')),
  fase            text        NOT NULL DEFAULT 'volledig' CHECK (fase IN ('volledig', 'bijwerken')),
  page_token      text        NOT NULL DEFAULT '' CHECK (length(page_token) <= 500),
  verwerkt        integer     NOT NULL DEFAULT 0 CHECK (verwerkt >= 0),
  schatting       integer     NOT NULL DEFAULT 0 CHECK (schatting >= 0),
  hoogwater       bigint      NOT NULL DEFAULT 0,
  run_hoogwater   bigint      NOT NULL DEFAULT 0,
  fout            text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,60}$'),
  gestart_op      timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op   timestamptz NOT NULL DEFAULT now(),
  eerste_klaar_op timestamptz,
  PRIMARY KEY (user_id, account_id)
);

ALTER TABLE app.mail_domein_dns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mail_contacten_scan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_domein_dns_eigen ON app.mail_domein_dns;
CREATE POLICY mail_domein_dns_eigen ON app.mail_domein_dns
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS mail_contacten_scan_eigen ON app.mail_contacten_scan;
CREATE POLICY mail_contacten_scan_eigen ON app.mail_contacten_scan
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
