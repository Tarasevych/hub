-- 0289 — KLUIS-AANMELDEN (16.11.2026): «вхід, який одразу розшифровує дані» — пароль і passkey відкривають ключ даних самі.
--
-- 1. Twee nieuwe omslagsoorten in app.sleutelkluis_omslag (0092):
--    • 'wachtwoord'        — de DEK onder scrypt(wachtwoord, eigen zout); houder 'wachtwoord'. Nooit het wachtwoord zelf.
--    • 'passkey-aanmelden' — de DEK onder HKDF(PRF(vast aanmeldzout)) van een passkey; houder = app.passkeys.id. De browser maakt
--                            en opent hem; de server ziet de PRF-uitkomst nooit (backend/sleutelkluis-aanmelden.ts).
-- 2. app.sleutelkluis_voorkeur — per mens en ruimte: mag het wachtwoord de sleutel openen (standaard ja; uitzetten wist de omslag).
-- Alleen de systeemrol (rechten.sql); RLS aan, zelfde beleid als 0092/0277. Herhaalbaar.

ALTER TABLE app.sleutelkluis_omslag DROP CONSTRAINT IF EXISTS sleutelkluis_omslag_soort_check;
ALTER TABLE app.sleutelkluis_omslag ADD CONSTRAINT sleutelkluis_omslag_soort_check
  CHECK (soort IN ('passkey', 'herstelcode', 'grant', 'wachtwoord', 'passkey-aanmelden'));
COMMENT ON TABLE app.sleutelkluis_omslag IS
  'De gegevenssleutel, omgeslagen met een sleutel die de server niet bewaart: PRF van een passkey (browser; ook met het aanmeldzout), herstelcode of wachtwoord (scrypt) of het token van een AI-verbinding (HKDF + pepper). Geen omslag met alleen een serversleutel.';

CREATE TABLE IF NOT EXISTS app.sleutelkluis_voorkeur (
  user_id        text        NOT NULL,
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  -- true = het wachtwoord opent deze sleutel NIET (de mens zette het uit); geen rij = standaard (wel).
  wachtwoord_uit boolean     NOT NULL DEFAULT false,
  gewijzigd_op   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte)
);
COMMENT ON TABLE app.sleutelkluis_voorkeur IS
  'Keuzes van de mens over zijn sleutelkluis per ruimte (KLUIS-AANMELDEN): of de aanmelding met wachtwoord de gegevenssleutel mag openen.';

ALTER TABLE app.sleutelkluis_voorkeur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleutelkluis_voorkeur_eigen ON app.sleutelkluis_voorkeur;
CREATE POLICY sleutelkluis_voorkeur_eigen ON app.sleutelkluis_voorkeur
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
