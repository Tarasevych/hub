-- 0277 — KLUIS-APPARAAT-001 (14.11.2026): «Розшифровувати пошту одразу на місці» — пам'ять ключа даних на знайомому пристрої.
--
-- WAAROM: de gegevenssleutel (DEK, 0092) leeft alleen in het geheugen van het serverproces zolang een sessie hem vasthoudt. Elke
-- uitlog én elke herstart van de server (dus elke update) sloot hem, en post/cloud/agenda bleven dan leeg tot de mens zelf in de
-- instellingen ging ontgrendelen. Op een apparaat waar de mens al eens ontgrendelde, hoort een nieuwe aanmelding dat niet te vragen.
--
-- HET MODEL (twee helften, geen van beide opent iets alleen):
--   • de SERVER bewaart per onthouden apparaat een willekeurige S (32 bytes), verzegeld met een omgevingssleutel (AAD = mens,
--     ruimte, apparaat-id) — hier, in `deel_verzegeld`;
--   • de BROWSER bewaart X = DEK ⊕ S, versleuteld met een NIET-EXPORTEERBARE AES-sleutel in IndexedDB (WebCrypto). De server ziet
--     die apparaatsleutel nooit.
--   Ontgrendelen: de browser opent X en stuurt het in een geldige sessie van die mens; de server rekent DEK = X ⊕ S en controleert
--   hem tegen app.sleutelkluis.controle. Een back-up van de database (met of zonder omgeving) heeft alleen S: X ⊕ S vraagt het
--   apparaat. Een gestolen browserprofiel heeft alleen X: zonder aanmelding als die mens geeft de server S nergens prijs.
--   Vergeten (op de pagina, bij «overal afmelden», bij verlopen) = de rij weg of ingetrokken → X is waardeloos.
--
-- Termijnen: 30 dagen zonder gebruik, hoogstens 90 dagen na het onthouden; daarna één keer passkey/herstelcode.
-- Alleen de systeemrol (rechten.sql); RLS staat toch aan, zelfde beleid als 0092. Herhaalbaar.

CREATE TABLE IF NOT EXISTS app.sleutelkluis_apparaat (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL,
  ruimte             text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  -- S, verzegeld met de omgevingssleutel ('v1.<iv>.<ct>.<tag>'); nooit de DEK, nooit X.
  deel_verzegeld     text        NOT NULL CHECK (deel_verzegeld ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND length(deel_verzegeld) <= 400),
  -- Leesbaar label voor de mens (browser en systeem uit de User-Agent), geen identificator.
  label              text        NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt_op timestamptz,
  verloopt_op        timestamptz NOT NULL,
  ingetrokken_op     timestamptz,
  FOREIGN KEY (user_id, ruimte) REFERENCES app.sleutelkluis (user_id, ruimte) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sleutelkluis_apparaat_lade_idx ON app.sleutelkluis_apparaat (user_id, ruimte);
COMMENT ON TABLE app.sleutelkluis_apparaat IS
  'Onthouden apparaten van de sleutelkluis: de serverhelft S (verzegeld). De browser houdt DEK xor S onder een niet-exporteerbare sleutel; geen van beide opent de gegevens alleen.';

ALTER TABLE app.sleutelkluis_apparaat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleutelkluis_apparaat_eigen ON app.sleutelkluis_apparaat;
CREATE POLICY sleutelkluis_apparaat_eigen ON app.sleutelkluis_apparaat
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
