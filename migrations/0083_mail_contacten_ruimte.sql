-- 0083: GESCHEIDEN GEGEVENSRUIMTES VOOR POST EN CONTACTEN (opdracht van de eigenaar, 20.10.2026; kern in migratie 0082 en
-- shared/ruimte-scheiding.ts). Het technische profiel en het profiel van de mens krijgen GESCHEIDEN gegevens, met de
-- mogelijkheid om per dienst bewust samen te voegen; verliest iemand zijn technische rechten, dan is de technische kant op
-- datzelfde moment onbereikbaar.
--
-- DE REGEL VAN DE KERN, HIER LETTERLIJK OVERGENOMEN (shared/ruimte-scheiding.ts → RUIMTE_VELD, sqlLadeWaar):
--   • de kolom heet `ruimte` en is 'prive' of 'technisch';
--   • ONTBREEKT de waarde (NULL) of is zij 'prive', dan hoort de rij bij de PERSOONLIJKE lade. Daarom is de standaardwaarde
--     'prive' en wordt er GEEN ENKELE bestaande rij verplaatst: alles wat er nu staat blijft precies waar het staat en van
--     wie het is. De technische ruimte begint leeg.
--
-- WELKE TABELLEN. Alles wat post en contacten vasthoudt, gecontroleerd tegen de code en niet tegen een wensenlijst:
--   app.mail_afzenders             contacten en afzenders zelf (0064 + 0074: «ви писали», in_contacten, organisatie, vertrouwen)
--   app.mail_domein_dns            het DNS-bewijs per domein dat die contacten onderbouwt (0074) — wie welke domeinen mailt is privé
--   app.mail_contacten_scan        de stand van de volledige controle per gekoppelde mailbox (0074 + 0075)
--   app.mail_contacten_scan_beleid de bewaarde keuze «запам'ятати мій вибір» bij het herhalen (0075)
--   app.mail_afzender_audit        de voortgang van de eerste controle over de bestaande post (0064)
--   app.mail_drafts                de concepten (0016) — een concept van de technische ruimte hoort daar en nergens anders
--   app.mail_queue                 de verzendwachtrij (0016) — ook een geplande verzending draagt haar lade mee
--   app.mail_ruimte_account        NIEUW: welke GEKOPPELDE MAILBOX bij welke lade hoort
--
-- WAAROM app.mail_ruimte_account EN GEEN KOLOM OP DE KOPPELING ZELF. De koppeling van een Google-account is één rij die door
-- post, schijf én agenda wordt gebruikt (backend/google-suite-onboarding.ts → provider_principals_v1). Die rij hoort dus niet
-- aan één dienst en mag door deze migratie niet van eigenaar veranderen. In plaats daarvan staat hier alleen de VERMELDING
-- «deze mailbox is in de technische ruimte verbonden». Een mailbox zonder vermelding is persoonlijk — dezelfde regel als
-- hierboven, en precies daarom raakt niemand zijn bestaande post kwijt.
--
-- Stand 'gedeeld' heeft hier NIETS nodig: de poort (backend/ruimte-scheiding.ts → gegevensLade) geeft dan de PERSOONLIJKE lade
-- terug, dus de technische ruimte leest en schrijft dan dezelfde rijen als de mens zelf — het persoonlijke adres zelf, geen
-- kopie. Trekt de mens de dienst los of verliest hij zijn rechten, dan geeft de poort die lade niet meer: één plek, één waarheid.
--
-- Idempotent: twee keer draaien verandert niets (de eenheidstest doet dat ook).

-- ------------------------------------------------------------------------------------------------ de kolom `ruimte`
DO $k$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mail_afzenders', 'mail_domein_dns', 'mail_contacten_scan', 'mail_contacten_scan_beleid', 'mail_afzender_audit', 'mail_drafts', 'mail_queue']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'app' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE app.%I ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT ''prive''', t);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_ruimte_check') THEN
        EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I CHECK (ruimte IN (''prive'', ''technisch''))', t, t || '_ruimte_check');
      END IF;
    END IF;
  END LOOP;
END
$k$;

-- ------------------------------------------------------------------------------------------------ de sleutel krijgt de ruimte erbij
-- Eén mens kan nu DEZELFDE sleutel in twee laden hebben (hetzelfde adres persoonlijk én technisch, dezelfde mailbox in beide
-- ruimtes). Daarom gaat `ruimte` in de primaire sleutel. De bestaande rijen staan al op 'prive', dus de sleutel blijft voor hen
-- dezelfde rij — er verdwijnt niets en er botst niets.
DO $s$
DECLARE
  paren text[][] := ARRAY[
    ['mail_afzenders', 'user_id, ruimte, adres'],
    ['mail_domein_dns', 'user_id, ruimte, domein'],
    ['mail_contacten_scan', 'user_id, ruimte, account_id'],
    ['mail_contacten_scan_beleid', 'user_id, ruimte'],
    ['mail_afzender_audit', 'user_id, ruimte']
  ];
  i int;
  tabel text;
  sleutel text;
  oud text;
BEGIN
  FOR i IN 1 .. array_length(paren, 1) LOOP
    tabel := paren[i][1];
    sleutel := paren[i][2];
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'app' AND tablename = tabel);
    -- Al goed? Dan niets doen (idempotent).
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'app' AND t.relname = tabel AND c.contype = 'p'
         AND pg_get_constraintdef(c.oid) = format('PRIMARY KEY (%s)', sleutel));
    SELECT c.conname INTO oud FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'app' AND t.relname = tabel AND c.contype = 'p';
    IF oud IS NOT NULL THEN EXECUTE format('ALTER TABLE app.%I DROP CONSTRAINT %I', tabel, oud); END IF;
    EXECUTE format('ALTER TABLE app.%I ADD PRIMARY KEY (%s)', tabel, sleutel);
  END LOOP;
END
$s$;

-- De indexen die de lijsten dragen, krijgen de ruimte vooraan: anders leest de technische lade de index van de persoonlijke.
CREATE INDEX IF NOT EXISTS mail_afzenders_ruimte_status_idx ON app.mail_afzenders (user_id, ruimte, status, laatste_op DESC);
CREATE INDEX IF NOT EXISTS mail_afzenders_ruimte_domein_idx ON app.mail_afzenders (user_id, ruimte, domein);
CREATE INDEX IF NOT EXISTS mail_drafts_ruimte_idx ON app.mail_drafts (user_id, ruimte, updated_at DESC);
CREATE INDEX IF NOT EXISTS mail_queue_ruimte_idx ON app.mail_queue (user_id, ruimte, send_at DESC);

-- Concepten en wachtrij houden hun eigen id als sleutel (0016); wat de ruimte erbij moet krijgen, zijn de UNIEKE sleutels
-- waarop «hetzelfde concept» en «dezelfde verzending» worden herkend. Anders zou een technisch concept met hetzelfde
-- local_id het persoonlijke overschrijven — precies wat deze scheiding moet voorkomen.
ALTER TABLE app.mail_drafts DROP CONSTRAINT IF EXISTS mail_drafts_user_id_local_id_key;
DROP INDEX IF EXISTS app.mail_drafts_user_id_local_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS mail_drafts_ruimte_local_key ON app.mail_drafts (user_id, ruimte, local_id);
DROP INDEX IF EXISTS app.mail_queue_request_idx;
CREATE UNIQUE INDEX IF NOT EXISTS mail_queue_ruimte_request_idx ON app.mail_queue (user_id, ruimte, request_id) WHERE request_id <> '';

-- ------------------------------------------------------------------------------------------------ welke mailbox in welke lade
-- Eén rij per (mens, ruimte, gekoppelde mailbox). Alleen de TECHNISCHE kant wordt hier vermeld; een mailbox zonder rij is
-- persoonlijk (de regel «ontbreekt = prive»). Zo is er geen enkel moment waarop een bestaande mailbox van lade wisselt.
CREATE TABLE IF NOT EXISTS app.mail_ruimte_account (
  user_id       text        NOT NULL,
  ruimte        text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  account_id    text        NOT NULL CHECK (length(account_id) BETWEEN 1 AND 300),
  account_email text        NOT NULL DEFAULT '' CHECK (length(account_email) <= 254),
  verbonden_op  timestamptz NOT NULL DEFAULT now(),
  verbonden_door text       NOT NULL DEFAULT '' CHECK (length(verbonden_door) <= 200),
  PRIMARY KEY (user_id, ruimte, account_id)
);
ALTER TABLE app.mail_ruimte_account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_ruimte_account_eigen ON app.mail_ruimte_account;
CREATE POLICY mail_ruimte_account_eigen ON app.mail_ruimte_account
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
