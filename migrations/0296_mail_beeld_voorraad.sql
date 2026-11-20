-- 0296 — MAILBEELD-001 (16.11.2026): «Завантажувати при отриманні (приватно)» — externe beelden van nieuwe brieven door de EIGEN
-- server ophalen op het moment van ontvangst, en versleuteld bewaren.
--
-- BESLUIT VAN DE EIGENAAR (16.11.2026): «згоден з тобою це накраще та найрозумніше рішення, також треба щоб можна було змінити вибір
-- будь-коли» — derde stand in «Вигляд» → «Зовнішні зображення», naast «Питати» (standaard) en «Завжди показувати»; voor alle nieuwe
-- brieven behalve Spam (en Prullenbak, Verzonden, Concepten: daar is niets te verbergen of het is eigen post).
--
-- WAAROM: de afzender ziet dan alleen «de server van de ontvanger haalde het beeld op, vlak na aflevering» — niet óf en wanneer de
-- brief gelezen werd, en ook het IP-adres en de browser van de lezer niet. Het lezen zelf gaat daarna niet meer naar buiten.
--
--   app.mail_beeld_voorraad  één beeld per (mens, ruimte, URL). De URL zelf staat er NIET in: alleen url_hash = HMAC(serverpepper,
--                            'mail-beeld-v1|' || url) — een URL van een volgpixel bevat vaak een persoonlijke code. Staat de
--                            sleutelkluis van die lade aan (0092), dan staat het beeld UITSLUITEND in data_versleuteld (dek1-envelop
--                            onder de eigen gegevenssleutel) en is `data` NULL. Een mislukte ophaling = negatieve rij (fout gezet),
--                            zodat de server dezelfde URL niet steeds opnieuw vraagt.
--   app.mail_beeld_voorkeur  de keuze van de mens per lade (standaard UIT = «Питати»), en sinds wanneer hij aanstaat.
--   app.mail_beeld_wachtrij  nieuwe brieven waarvan de beelden nog niet konden worden opgehaald omdat de sleutelkluis dicht was:
--                            alleen het id van de brief bij de provider (geen URL, geen inhoud). Bij de volgende onderhoudsronde met
--                            open sleutel worden ze alsnog opgehaald; na 7 dagen of 5 pogingen vervalt de rij.
--
-- Idempotent. De systeemrol krijgt DML via rechten.sql (alle tabellen); mijnruimte_app ziet alleen eigen rijen (RLS, zoals 0097).

CREATE TABLE IF NOT EXISTS app.mail_beeld_voorraad (
  user_id          text        NOT NULL,
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  url_hash         text        NOT NULL CHECK (url_hash ~ '^[a-f0-9]{64}$'),
  mime             text        CHECK (mime IS NULL OR mime IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/apng', 'image/x-icon', 'image/vnd.microsoft.icon')),
  grootte          integer     NOT NULL DEFAULT 0 CHECK (grootte >= 0 AND grootte <= 4194304),
  data             bytea       CHECK (data IS NULL OR octet_length(data) <= 4194304),
  -- Sleutelkluis aan: 'dek1.<iv>.<ct>.<tag>' (base64 van het beeld onder de DEK, AAD = lade + url_hash). Dan is `data` NULL.
  data_versleuteld text        CHECK (data_versleuteld IS NULL OR (data_versleuteld ~ '^dek1\.' AND length(data_versleuteld) <= 7700000)),
  sha256           text        CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  fout             text        CHECK (fout IS NULL OR fout ~ '^[A-Z0-9_]{2,60}$'),
  opgehaald        timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, url_hash),
  CHECK (NOT (data IS NOT NULL AND data_versleuteld IS NOT NULL)),
  CHECK (data IS NOT NULL OR data_versleuteld IS NOT NULL OR fout IS NOT NULL),
  CHECK ((mime IS NULL) = (data IS NULL AND data_versleuteld IS NULL))
);
CREATE INDEX IF NOT EXISTS mail_beeld_voorraad_gebruik_idx ON app.mail_beeld_voorraad (user_id, ruimte, laatst_gebruikt);
COMMENT ON TABLE app.mail_beeld_voorraad IS
  'Externe beelden van nieuwe brieven, bij ontvangst door de eigen server opgehaald (MAILBEELD-001). URL alleen als HMAC; onder de eigen gegevenssleutel als de sleutelkluis aanstaat.';

CREATE TABLE IF NOT EXISTS app.mail_beeld_voorkeur (
  user_id        text        NOT NULL,
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bij_ontvangst  boolean     NOT NULL DEFAULT false,
  aan_sinds      timestamptz,
  gewijzigd_op   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte)
);
COMMENT ON TABLE app.mail_beeld_voorkeur IS
  'Per mens en ruimte: externe beelden van nieuwe brieven bij ontvangst ophalen (standaard uit = «Питати»).';

CREATE TABLE IF NOT EXISTS app.mail_beeld_wachtrij (
  user_id          text        NOT NULL,
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  mail_account_id  text        NOT NULL CHECK (length(mail_account_id) BETWEEN 1 AND 300),
  bericht_id       text        NOT NULL CHECK (bericht_id ~ '^[A-Za-z0-9_-]+$' AND length(bericht_id) BETWEEN 3 AND 300),
  ontvangen_op     timestamptz NOT NULL DEFAULT now(),
  pogingen         integer     NOT NULL DEFAULT 0 CHECK (pogingen >= 0),
  PRIMARY KEY (user_id, ruimte, mail_account_id, bericht_id)
);
CREATE INDEX IF NOT EXISTS mail_beeld_wachtrij_tijd_idx ON app.mail_beeld_wachtrij (user_id, ontvangen_op);
COMMENT ON TABLE app.mail_beeld_wachtrij IS
  'Nieuwe brieven waarvan de beelden nog wachten op een open sleutelkluis (alleen het id bij de provider; vervalt na 7 dagen).';

ALTER TABLE app.mail_beeld_voorraad ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mail_beeld_voorkeur ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mail_beeld_wachtrij ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_beeld_voorraad_eigen ON app.mail_beeld_voorraad;
CREATE POLICY mail_beeld_voorraad_eigen ON app.mail_beeld_voorraad
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS mail_beeld_voorkeur_eigen ON app.mail_beeld_voorkeur;
CREATE POLICY mail_beeld_voorkeur_eigen ON app.mail_beeld_voorkeur
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS mail_beeld_wachtrij_eigen ON app.mail_beeld_wachtrij;
CREATE POLICY mail_beeld_wachtrij_eigen ON app.mail_beeld_wachtrij
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
