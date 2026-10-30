-- 0023: passkeys per gebruiker (Instellingen → «Способи входу» / «Aanmeldmethoden», zie deploy/RUNBOOK-VEILIGE-UITROL.md §13).
--
--   app.passkeys             WebAuthn-sleutels van één gebruiker (rpId tarasevych.com): publieke sleutel (JWK), vingerafdruk
--                            (sha256 van de SPKI), naam, AAGUID-hint, BE/BS-vlaggen (gesynchroniseerd), teller en laatst gebruikt.
--                            Gebruikt voor step-up (gevoelige acties bevestigen). Updates goedkeuren kan alleen een sleutel die
--                            root daarnaast in /etc/mijn-ruimte/goedkeur-passkeys.json heeft staan; dat bepaalt NIET deze tabel.
--   app.passkey_uitdagingen  eenmalige WebAuthn-challenges (≤ 5 min) per gebruiker en sessie: registreren of step-up.
--
-- RLS zoals 0017/0019: voor mijnruimte_app altijd alleen eigen rijen (app.user_id). Ook de systeemrol filtert in de code op user_id.
CREATE TABLE IF NOT EXISTS app.passkeys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text        NOT NULL,
  credential_id       text        NOT NULL UNIQUE CHECK (credential_id ~ '^[A-Za-z0-9_-]+$' AND length(credential_id) BETWEEN 16 AND 1400),
  alg                 integer     NOT NULL CHECK (alg IN (-7, -8, -257)),
  jwk                 jsonb       NOT NULL,
  vingerafdruk        text        NOT NULL CHECK (vingerafdruk ~ '^[0-9a-f]{64}$'),
  naam                text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 60),
  aaguid              text        NOT NULL DEFAULT '' CHECK (aaguid ~ '^([0-9a-f]{32})?$'),
  transports          text[]      NOT NULL DEFAULT '{}',
  backup_eligible     boolean     NOT NULL DEFAULT false,
  backup_state        boolean     NOT NULL DEFAULT false,
  sign_count          bigint      NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  aangemaakt_op       timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt_op  timestamptz,
  CONSTRAINT passkeys_vingerafdruk_uniek UNIQUE (vingerafdruk)
);
CREATE INDEX IF NOT EXISTS passkeys_user_idx ON app.passkeys (user_id, aangemaakt_op);

CREATE TABLE IF NOT EXISTS app.passkey_uitdagingen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  sessie        text        NOT NULL DEFAULT '',
  doel          text        NOT NULL CHECK (doel IN ('registreren', 'stap-op')),
  uitdaging     text        NOT NULL UNIQUE CHECK (uitdaging ~ '^[A-Za-z0-9_-]{43,128}$'),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  verloopt_op   timestamptz NOT NULL,
  gebruikt_op   timestamptz,
  CONSTRAINT passkey_uitdagingen_kort CHECK (verloopt_op <= aangemaakt_op + interval '5 minutes 10 seconds')
);
CREATE INDEX IF NOT EXISTS passkey_uitdagingen_user_idx ON app.passkey_uitdagingen (user_id, verloopt_op);

ALTER TABLE app.passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.passkey_uitdagingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passkeys_eigen ON app.passkeys;
CREATE POLICY passkeys_eigen ON app.passkeys
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS passkey_uitdagingen_eigen ON app.passkey_uitdagingen;
CREATE POLICY passkey_uitdagingen_eigen ON app.passkey_uitdagingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
