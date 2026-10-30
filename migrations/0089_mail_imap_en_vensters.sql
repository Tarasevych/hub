-- 0089: ECHTE POSTKOPPELINGEN (IMAP/SMTP met app-wachtwoord) en VENSTERS DIE EEN SUBDOMEIN OVERLEVEN.
-- Opdracht van de eigenaar, 20.10.2026: «Немає опцій підключення пошти — лише всевдо-блоки … згорнуті вікна в одному
-- просторі втрачаються, якщо я переходжу на інший піддомен.»
--
-- TWEE TABELLEN, TWEE REDENEN.
--
-- 1. app.mail_imap_koppeling — een gekoppelde mailbox die NIET via OAuth gaat. Gmail (Google Workspace) en Outlook
--    (Microsoft 365) hebben hun eigen OAuth-weg (backend/google-suite-onboarding.ts, de Microsoft-tak in backend/index.ts);
--    iCloud, Ukr.net, Yahoo en I.ua kennen geen OAuth voor derden en werken uitsluitend met een APP-WACHTWOORD over
--    IMAP/SMTP. Dat wachtwoord staat hier uitsluitend als AES-256-GCM-envelop ('v1.<iv>.<ct>.<tag>', base64url) met de
--    rij als AAD — exact zoals het CalDAV-wachtwoord van de agenda (migratie 0076, backend/agenda-caldav.ts). De
--    sleutel staat in de omgeving (MAIL_APP_WACHTWOORD_SLEUTEL_V1) en nooit in de database; de CHECK hieronder laat
--    daarom geen andere vorm dan een envelop toe, dus platte tekst kan er niet eens in.
--    De HOST staat NIET in deze tabel: hij komt uit de vaste lijst shared/mail-aanbieders.ts. Een gebruiker kan dus geen
--    binnenadres laten aanroepen (SSRF) — er is geen veld om het in te zetten.
--
-- 2. app.venster_stand — welke vensters een mens open of geminimaliseerd heeft, PER ACCOUNT en PER RUIMTE ('prive' of
--    'technisch', zelfde regel als 0082/0083: NULL of 'prive' hoort bij de persoonlijke lade). Alleen een kleine,
--    hervatbare BESCHRIJVING: soort, titel, stap, adres. Geheimen horen hier niet en komen er ook niet in
--    (shared/vensters-onthouden-model.ts → zonderGeheimen + stapOmTeBewaren, en de route controleert het nog eens).
--
-- Idempotent (de testsuite draait alle migraties opnieuw). Rechten: alleen de systeemrol raakt deze tabellen aan
-- (migrations/rechten.sql geeft mijnruimte_system DML op ALLE tabellen in het schema), de app-rol krijgt niets.
-- RLS staat toch aan, zodat een toekomstige app-rol nooit per ongeluk de rijen van een ander account ziet.

CREATE TABLE IF NOT EXISTS app.mail_imap_koppeling (
  user_id        text        NOT NULL,
  id             text        NOT NULL CHECK (length(id) BETWEEN 8 AND 120),
  -- Sleutel uit shared/mail-aanbieders.ts (icloud, ukrnet, yahoo, iua …). Geen vrije tekst: de backend controleert
  -- dat de dienst bestaat én dat zij via IMAP gaat voordat er iets wordt weggeschreven.
  aanbieder      text        NOT NULL CHECK (aanbieder ~ '^[a-z0-9.+-]{2,40}$'),
  adres          text        NOT NULL CHECK (adres ~ '^[^[:space:]@]+@[^[:space:]@]+$' AND length(adres) <= 320),
  -- AES-256-GCM-envelop van het app-wachtwoord — nooit het wachtwoord zelf, nooit in een URL, nooit in een antwoord.
  geheim         text        NOT NULL CHECK (geheim ~ '^v1\.'),
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  actief         boolean     NOT NULL DEFAULT true,
  -- Uitslag van de ECHTE aanmelding bij het koppelen (backend/mail-imap.ts): hoeveel mappen de server teruggaf en of
  -- SMTP het app-wachtwoord ook accepteerde. Nul mappen = er is niets gekoppeld, en dat zegt de pagina dan ook.
  mappen         integer     NOT NULL DEFAULT 0 CHECK (mappen >= 0),
  smtp_goed      boolean     NOT NULL DEFAULT false,
  laatst_goed_op timestamptz,
  fout           text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,60}$'),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_imap_koppeling_adres_idx ON app.mail_imap_koppeling (user_id, ruimte, adres);
CREATE INDEX IF NOT EXISTS mail_imap_koppeling_ruimte_idx ON app.mail_imap_koppeling (user_id, ruimte);

COMMENT ON COLUMN app.mail_imap_koppeling.geheim IS
  'App-wachtwoord als AES-256-GCM-envelop (sealWithEnvKey, sleutel MAIL_APP_WACHTWOORD_SLEUTEL_V1, AAD "mail-imap|<user>|<id>"). Platte tekst is door de CHECK onmogelijk; de API geeft dit veld nooit terug.';
COMMENT ON TABLE app.mail_imap_koppeling IS
  'Mailboxen die met een app-wachtwoord over IMAP/SMTP gekoppeld zijn (iCloud, Ukr.net, Yahoo, I.ua). Host en poort staan niet hier maar in de vaste lijst shared/mail-aanbieders.ts.';

CREATE TABLE IF NOT EXISTS app.venster_stand (
  user_id       text        NOT NULL,
  ruimte        text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  -- De lijst open/geminimaliseerde vensters: hoogstens VENSTER_MAX (8) kleine beschrijvingen, dus bewust krap begrensd.
  vensters      jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(vensters) = 'array' AND pg_column_size(vensters) <= 8192),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte)
);
COMMENT ON TABLE app.venster_stand IS
  'Welke vensters dit account open of geminimaliseerd heeft, per ruimte. Zodat een geminimaliseerd venster hub → mail → cloud en F5 overleeft (opdracht 20.10.2026). Nooit geheimen: zie shared/vensters-onthouden-model.ts.';

ALTER TABLE app.mail_imap_koppeling ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.venster_stand ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_imap_koppeling_eigen ON app.mail_imap_koppeling;
CREATE POLICY mail_imap_koppeling_eigen ON app.mail_imap_koppeling
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS venster_stand_eigen ON app.venster_stand;
CREATE POLICY venster_stand_eigen ON app.venster_stand
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
