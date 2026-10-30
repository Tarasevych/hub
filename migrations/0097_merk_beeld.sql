-- 0097 (eerst 0093; hernummerd omdat 0093 al door de zoek-release bezet was): DE DATABASE VAN LOGO'S EN FOTO'S VAN AFZENDERS (21.10.2026).
--
-- BESLUIT VAN DE EIGENAAR: «знайди в інтернеті публічні фото їх логотипів і збережи в базу, щоб використовувати їх там, де вони
-- треба … До офіційних адрес / від кого щось прийшло — також мають бути заповнені … Якщо акаунти Google або інші видають фото
-- відправника — вони також мають відображатися в нас на сервісі.»
--
-- TWEE SOORTEN BEELDEN, BEWUST TWEE TABELLEN
--   app.merk_beeld      het LOGO van een domein of merk (BIMI, de eigen website van het domein). Publiek en geen persoonsgegeven:
--                       één rij voor de hele site, zonder user_id en zonder ruimte. Alleen de systeemrol leest en schrijft.
--                       Een mislukte ophaling is een NEGATIEVE rij (data NULL, fout gezet, geldig_tot = +1 dag), zodat de server
--                       hetzelfde domein niet steeds opnieuw vraagt. Een geslaagde rij is 30 dagen geldig.
--   app.afzender_beeld  de FOTO van één mens/adres (Google-contacten, vCard, Gravatar). WEL een persoonsgegeven, dus:
--                         • per (user_id, ruimte) — dezelfde scheiding als post en contacten (0082/0083);
--                         • het adres staat er NIET in: alleen adres_hash = HMAC-SHA256(serverpepper, adres);
--                         • staat de sleutelkluis van die lade aan (0092), dan staat het beeld UITSLUITEND in data_versleuteld
--                           (dek1-envelop onder de eigen gegevenssleutel) en is `data` NULL.
--   app.merk_bron_instelling     schakelaar van de eigenaar van de site («отримувати логотипи з доменів», standaard AAN).
--   app.afzender_beeld_voorkeur  keuzes van de mens per lade: Gravatar (standaard UIT), Google-contacten (standaard UIT).
--
-- Idempotent. De systeemrol krijgt DML via rechten.sql (alle tabellen); mijnruimte_app krijgt hier niets. RLS staat toch aan,
-- met dezelfde eigen-rij-regel als de buren (0089/0092).

CREATE TABLE IF NOT EXISTS app.merk_beeld (
  sleutel      text        PRIMARY KEY CHECK (sleutel ~ '^[a-z0-9][a-z0-9.+-]{0,252}$'),
  bron         text        CHECK (bron IS NULL OR bron IN ('bimi', 'vcard', 'gravatar', 'favicon', 'manifest', 'officieel', 'eigen', 'google-contact')),
  mime         text        CHECK (mime IS NULL OR mime IN ('image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon')),
  data         bytea       CHECK (data IS NULL OR octet_length(data) <= 262144),
  sha256       text        CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  -- Waar het bestand vandaan kwam (https-URL van het domein zelf of van zijn BIMI-record). Nooit iets persoonlijks.
  bron_url     text        CHECK (bron_url IS NULL OR (bron_url ~ '^https://' AND length(bron_url) <= 2048)),
  opgehaald    timestamptz NOT NULL DEFAULT now(),
  geldig_tot   timestamptz NOT NULL,
  -- Negatieve rij: de reden (GEEN_LOGO, PRIVE_ADRES, TE_GROOT, SVG_ELEMENT_SCRIPT …). Een geslaagde rij heeft fout NULL.
  fout         text        CHECK (fout IS NULL OR fout ~ '^[A-Z0-9_]{2,60}$'),
  pogingen     integer     NOT NULL DEFAULT 1 CHECK (pogingen >= 0),
  CHECK ((data IS NULL) = (mime IS NULL)),
  CHECK (data IS NOT NULL OR fout IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS merk_beeld_geldig_idx ON app.merk_beeld (geldig_tot);
COMMENT ON TABLE app.merk_beeld IS
  'Logo per domein/merk (BIMI, eigen website van het domein). Publiek, geen persoonsgegevens; negatieve rij = mislukte ophaling (1 dag), positieve 30 dagen.';

CREATE TABLE IF NOT EXISTS app.afzender_beeld (
  user_id          text        NOT NULL,
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  -- HMAC-SHA256(serverpepper, 'afzender-beeld-v1|' || adres) in hex — het adres zelf staat nergens in deze tabel.
  adres_hash       text        NOT NULL CHECK (adres_hash ~ '^[a-f0-9]{64}$'),
  bron             text        CHECK (bron IS NULL OR bron IN ('bimi', 'vcard', 'gravatar', 'favicon', 'manifest', 'officieel', 'eigen', 'google-contact')),
  mime             text        CHECK (mime IS NULL OR mime IN ('image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon')),
  data             bytea       CHECK (data IS NULL OR octet_length(data) <= 262144),
  -- Sleutelkluis aan: 'dek1.<iv>.<ct>.<tag>' (base64 van het beeld onder de DEK, AAD = lade + hash). Dan is `data` NULL.
  data_versleuteld text        CHECK (data_versleuteld IS NULL OR (data_versleuteld ~ '^dek1\.' AND length(data_versleuteld) <= 400000)),
  sha256           text        CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  -- Alleen de host (bv. lh3.googleusercontent.com) — geen pad: daarin kan bij sommige diensten iets persoonlijks staan.
  bron_host        text        CHECK (bron_host IS NULL OR bron_host ~ '^[a-z0-9.-]{1,253}$'),
  opgehaald        timestamptz NOT NULL DEFAULT now(),
  geldig_tot       timestamptz NOT NULL,
  fout             text        CHECK (fout IS NULL OR fout ~ '^[A-Z0-9_]{2,60}$'),
  PRIMARY KEY (user_id, ruimte, adres_hash, bron),
  CHECK (NOT (data IS NOT NULL AND data_versleuteld IS NOT NULL)),
  CHECK (data IS NOT NULL OR data_versleuteld IS NOT NULL OR fout IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS afzender_beeld_lade_idx ON app.afzender_beeld (user_id, ruimte, adres_hash);
COMMENT ON TABLE app.afzender_beeld IS
  'Foto van een afzender per (mens, ruimte): Google-contact, vCard of Gravatar. Adres alleen als HMAC; onder de eigen gegevenssleutel als de sleutelkluis aanstaat.';

CREATE TABLE IF NOT EXISTS app.merk_bron_instelling (
  sleutel        text        PRIMARY KEY CHECK (sleutel IN ('afzender-domeinen')),
  aan            boolean     NOT NULL,
  gewijzigd_door text        NOT NULL DEFAULT '' CHECK (length(gewijzigd_door) <= 120),
  gewijzigd_op   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.merk_bron_instelling IS
  'Schakelaar van de eigenaar van de site: logo''s van afzenders van hun eigen domein halen (BIMI/website). Geen rij = aan.';

CREATE TABLE IF NOT EXISTS app.afzender_beeld_voorkeur (
  user_id          text        NOT NULL,
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  gravatar         boolean     NOT NULL DEFAULT false,
  google_contacten boolean     NOT NULL DEFAULT false,
  -- Laatste stand van de Google-contacten: '', 'ok', 'scope-ontbreekt', 'geen-account', 'fout', 'sleutel-gesloten'.
  google_stand     text        NOT NULL DEFAULT '' CHECK (google_stand IN ('', 'ok', 'scope-ontbreekt', 'geen-account', 'fout', 'sleutel-gesloten')),
  google_op        timestamptz,
  gewijzigd_op     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte)
);
COMMENT ON TABLE app.afzender_beeld_voorkeur IS
  'Per mens en ruimte: foto''s van afzenders uit Gravatar (standaard uit) en uit de eigen Google-contacten (standaard uit).';

ALTER TABLE app.merk_beeld ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.afzender_beeld ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.merk_bron_instelling ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.afzender_beeld_voorkeur ENABLE ROW LEVEL SECURITY;
-- merk_beeld en merk_bron_instelling hebben geen eigenaar per rij: alleen de systeemrol (mijnruimte_app ziet niets).
DROP POLICY IF EXISTS merk_beeld_systeem ON app.merk_beeld;
CREATE POLICY merk_beeld_systeem ON app.merk_beeld
  USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
DROP POLICY IF EXISTS merk_bron_instelling_systeem ON app.merk_bron_instelling;
CREATE POLICY merk_bron_instelling_systeem ON app.merk_bron_instelling
  USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
DROP POLICY IF EXISTS afzender_beeld_eigen ON app.afzender_beeld;
CREATE POLICY afzender_beeld_eigen ON app.afzender_beeld
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS afzender_beeld_voorkeur_eigen ON app.afzender_beeld_voorkeur;
CREATE POLICY afzender_beeld_voorkeur_eigen ON app.afzender_beeld_voorkeur
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
