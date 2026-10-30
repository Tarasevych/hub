-- 0092: DE SLEUTELKLUIS — een gegevenssleutel per mens en per ruimte, die de server NOOIT in platte vorm bewaart.
--
-- BESLUIT VAN DE EIGENAAR (20.10.2026): «персональні дані мають бути доступні лише їх власникам… щоб навіть адмін чи хтось
-- із доступом до сайту не міг використовувати дані користувачів». Gekozen variant: «ключ користувача + фон під час сесії».
--
-- HET MODEL IN ÉÉN ALINEA
--   Per (gebruiker, ruimte) bestaat één gegevenssleutel (DEK, 32 bytes). Hij staat in app.sleutelkluis_omslag UITSLUITEND
--   «omgeslagen» (gewrapt, AES-256-GCM) met een sleutel die de server NIET heeft:
--     • 'passkey'     — de PRF-uitkomst van een passkey (WebAuthn PRF-extensie → HKDF → KEK). Het omslaan en openen gebeurt
--                       IN DE BROWSER; de server ziet de DEK alleen tijdens de sessie, in het geheugen;
--     • 'herstelcode' — een eenmalig getoonde herstelcode (scrypt, hoge parameters → KEK). De server rekent de KEK bij het
--                       ontgrendelen uit en gooit hem weg;
--     • 'grant'       — een kopie voor een AI-verbinding (app.mcp_oauth_tokens): omgeslagen met een sleutel afgeleid van
--                       het TOKEN ZELF (dat alleen de agent heeft; de server bewaart er alleen een hash van) + een
--                       serverpepper. Zo werkt een agent zonder mens, maar ALLEEN zolang de verbinding geldig is —
--                       het bewuste compromis uit het besluit van de eigenaar (zie backend/sleutelkluis.ts).
--   Er is GEEN omslag met alleen een serversleutel. Wie de database én de omgeving van de server heeft, kan een rij
--   'dek1.…' dus niet lezen zonder een mens (passkey/herstelcode) of een nog geldig agenttoken.
--
--   app.sleutelkluis.controle is HMAC-SHA256(DEK, vaste tekst): daarmee controleert de server een aangeboden DEK zonder hem
--   te bewaren; uit de controlewaarde valt de DEK niet terug te rekenen.
--
--   De technische ruimte heeft haar EIGEN, onafhankelijk gegenereerde DEK (niet afgeleid van de persoonlijke): een
--   technisch profiel dat zijn sleutel opent, kan daarmee nooit een persoonlijke rij openen — ook niet door een rij van
--   ruimte te verwisselen, want de AAD van elke envelop draagt de ruimte.
--
-- NIETS WORDT VERHUISD. Bestaande rijen blijven 'v1.…' (serversleutel) en blijven leesbaar; nieuwe rijen van een mens die de
-- kluis aanzette worden 'dek1.…'. «Перешифрувати мої дані зараз» (route) zet oude rijen om tijdens een open sessie.
--
-- app.sleutelkluis_journaal telt per tabel hoe vaak er nog met de serversleutel gelezen werd (geen inhoud, alleen tellers),
-- zodat de pagina eerlijk zegt wat nog niet onder de eigen sleutel staat.
--
-- Idempotent. Alleen de systeemrol raakt deze tabellen (rechten.sql: DML op alle tabellen); RLS staat toch aan.

CREATE TABLE IF NOT EXISTS app.sleutelkluis (
  user_id           text        NOT NULL,
  ruimte            text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  -- HMAC-SHA256(DEK, 'mijn-ruimte-sleutelkluis-controle-v1') in hex: verifieert een aangeboden DEK, onthult hem niet.
  controle          text        NOT NULL CHECK (controle ~ '^[a-f0-9]{64}$'),
  ingeschakeld_op   timestamptz NOT NULL DEFAULT now(),
  herversleuteld_op timestamptz,
  PRIMARY KEY (user_id, ruimte)
);
COMMENT ON TABLE app.sleutelkluis IS
  'Per mens en ruimte: dat er een eigen gegevenssleutel (DEK) is en een controlewaarde om een aangeboden DEK te verifiëren. De DEK zelf staat hier NIET en nergens anders in platte vorm.';

CREATE TABLE IF NOT EXISTS app.sleutelkluis_omslag (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL,
  ruimte             text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  soort              text        NOT NULL CHECK (soort IN ('passkey', 'herstelcode', 'grant')),
  -- passkey: app.passkeys.id; herstelcode: 'herstelcode'; grant: app.mcp_oauth_tokens.id (als tekst).
  houder             text        NOT NULL CHECK (length(houder) BETWEEN 1 AND 120),
  -- grant: 'toegang' (access-token) of 'vernieuw' (refresh-token); anders leeg.
  deel               text        NOT NULL DEFAULT '' CHECK (deel IN ('', 'toegang', 'vernieuw')),
  -- passkey: {salt, prf:true}; herstelcode: {kdf:'scrypt', N, r, p, salt}; grant: {kdf:'hkdf'}. Nooit geheimen.
  parameters         jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object' AND pg_column_size(parameters) <= 2048),
  -- 'omslag1.<iv>.<ct>.<tag>' (base64url): de DEK, AES-256-GCM met de KEK van deze omslag. Platte tekst kan er niet in.
  envelop            text        NOT NULL CHECK (envelop ~ '^omslag1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt_op timestamptz,
  UNIQUE (user_id, ruimte, soort, houder, deel),
  FOREIGN KEY (user_id, ruimte) REFERENCES app.sleutelkluis (user_id, ruimte) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sleutelkluis_omslag_houder_idx ON app.sleutelkluis_omslag (soort, houder);
COMMENT ON TABLE app.sleutelkluis_omslag IS
  'De gegevenssleutel, omgeslagen met een sleutel die de server niet heeft: PRF van een passkey (browser), herstelcode (scrypt) of het token van een AI-verbinding (HKDF + pepper). Geen omslag met alleen een serversleutel.';

CREATE TABLE IF NOT EXISTS app.sleutelkluis_journaal (
  user_id   text        NOT NULL,
  ruimte    text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  tabel     text        NOT NULL CHECK (tabel ~ '^[a-z0-9_.]{1,80}$'),
  soort     text        NOT NULL CHECK (soort IN ('serversleutel-gelezen', 'herversleuteld', 'gesloten-overgeslagen')),
  aantal    bigint      NOT NULL DEFAULT 0 CHECK (aantal >= 0),
  laatst_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, tabel, soort)
);
COMMENT ON TABLE app.sleutelkluis_journaal IS
  'Tellers (geen inhoud): hoe vaak een tabel nog met de serversleutel gelezen werd, hoeveel rijen herversleuteld zijn, hoe vaak een achtergrondtaak een gesloten sleutel oversloeg.';

-- Vensterstand (0089) kan onder de eigen sleutel: de versleutelde vorm staat in een eigen kolom; `vensters` blijft dan '[]'.
ALTER TABLE app.venster_stand ADD COLUMN IF NOT EXISTS vensters_versleuteld text
  CHECK (vensters_versleuteld IS NULL OR vensters_versleuteld ~ '^dek1\.');
COMMENT ON COLUMN app.venster_stand.vensters_versleuteld IS
  'Sinds 0092: de vensterlijst als dek1-envelop (eigen gegevenssleutel). Niet NULL → `vensters` is leeg en telt niet.';

-- IMAP-wachtwoord (0089) en CalDAV-wachtwoord (0076): ook een dek1-envelop toestaan naast v1 (serversleutel).
ALTER TABLE app.mail_imap_koppeling DROP CONSTRAINT IF EXISTS mail_imap_koppeling_geheim_check;
ALTER TABLE app.mail_imap_koppeling ADD CONSTRAINT mail_imap_koppeling_geheim_check CHECK (geheim ~ '^(v1|dek1)\.');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_abonnement_geheim_check') THEN
    ALTER TABLE app.agenda_abonnement DROP CONSTRAINT agenda_abonnement_geheim_check;
    ALTER TABLE app.agenda_abonnement ADD CONSTRAINT agenda_abonnement_geheim_check CHECK (geheim IS NULL OR geheim = '' OR geheim ~ '^(v1|dek1)\.');
  END IF;
END $$;

-- Passkey-uitdagingen (0023) krijgen een extra doel: ontgrendelen/koppelen van de sleutelkluis.
-- 21.10.2026: de eerste versie van deze regel herdefinieerde de lijst ZONDER 'extensie-ontgrendelen' (0072) — daarmee brak het
-- ontgrendelen van de extensie met een passkey (check-constraint-fout). Een CHECK herdefiniëren = de VOLLEDIGE lijst herhalen.
ALTER TABLE app.passkey_uitdagingen DROP CONSTRAINT IF EXISTS passkey_uitdagingen_doel_check;
ALTER TABLE app.passkey_uitdagingen ADD CONSTRAINT passkey_uitdagingen_doel_check CHECK (doel IN ('registreren', 'stap-op', 'extensie-ontgrendelen', 'sleutelkluis'));

ALTER TABLE app.sleutelkluis ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sleutelkluis_omslag ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sleutelkluis_journaal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleutelkluis_eigen ON app.sleutelkluis;
CREATE POLICY sleutelkluis_eigen ON app.sleutelkluis
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS sleutelkluis_omslag_eigen ON app.sleutelkluis_omslag;
CREATE POLICY sleutelkluis_omslag_eigen ON app.sleutelkluis_omslag
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS sleutelkluis_journaal_eigen ON app.sleutelkluis_journaal;
CREATE POLICY sleutelkluis_journaal_eigen ON app.sleutelkluis_journaal
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
