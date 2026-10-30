-- 0022: updates goedkeuren met de passkey van de eigenaar (deploy/RUNBOOK-VEILIGE-UITROL.md §13).
--
--   app.uitrol_voorbereiders   wie een updatepakket mag VOORBEREIDEN (uploaden): een account, een agenttoken (tvh_…) of een
--                              MCP-koppeling (OAuth). Altijd met vervaldatum (hoogstens 30 dagen), intrekbaar; nooit goedkeuren.
--   app.uitrol_voorstellen     geüploade pakketten. Status 'wacht-op-goedkeuring' installeert niets: het pakket staat in de uploads-map
--                              van de app en komt pas na een passkey-goedkeuring in de goedkeur-inbox. Ook dan controleert root zelf.
--   app.goedkeur_uitdagingen   WebAuthn-challenges (eenmalig, ≤ 5 minuten), gebonden aan één voorstel of één sleutel.
--
-- Alleen de systeemrol (mijnruimte_system) gebruikt deze tabellen; mijnruimte_app krijgt GEEN rechten (rechten.sql) en de
-- RLS-policy sluit de app-rol daarnaast uit. De echte goedkeuring gebeurt hoe dan ook door root (assertie opnieuw controleren).
CREATE TABLE IF NOT EXISTS app.uitrol_voorbereiders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  soort            text        NOT NULL CHECK (soort IN ('account', 'agenttoken', 'mcp-koppeling')),
  onderwerp        text        NOT NULL CHECK (length(onderwerp) BETWEEN 1 AND 120),
  account_id       text        NOT NULL,
  label            text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  gegeven_door     text        NOT NULL,
  gegeven_op       timestamptz NOT NULL DEFAULT now(),
  verloopt_op      timestamptz NOT NULL,
  ingetrokken_op   timestamptz,
  ingetrokken_door text,
  CONSTRAINT uitrol_voorbereiders_vervalt_later CHECK (verloopt_op > gegeven_op),
  CONSTRAINT uitrol_voorbereiders_max_duur CHECK (verloopt_op <= gegeven_op + interval '30 days')
);
CREATE INDEX IF NOT EXISTS uitrol_voorbereiders_actief_idx ON app.uitrol_voorbereiders (soort, onderwerp) WHERE ingetrokken_op IS NULL;

CREATE TABLE IF NOT EXISTS app.uitrol_voorstellen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versie             text        NOT NULL UNIQUE CHECK (versie ~ '^[0-9]{8}-[0-9]{6}$'),
  status             text        NOT NULL DEFAULT 'uploaden' CHECK (status IN ('uploaden', 'wacht-op-goedkeuring', 'goedgekeurd', 'geinstalleerd',
                                   'mislukt', 'geweigerd', 'afgewezen', 'verlopen', 'afgebroken')),
  bytes              bigint      NOT NULL CHECK (bytes > 0 AND bytes <= 314572800),
  sha256             text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  ontvangen          bigint      NOT NULL DEFAULT 0 CHECK (ontvangen >= 0 AND ontvangen <= bytes),
  voorbereider_id    uuid        NOT NULL REFERENCES app.uitrol_voorbereiders (id),
  voorbereider_label text        NOT NULL,
  account_id         text        NOT NULL,
  bron_commit        text        CHECK (bron_commit IS NULL OR bron_commit ~ '^[0-9a-f]{7,64}$'),
  wijzigingen        text        NOT NULL DEFAULT '' CHECK (length(wijzigingen) <= 8000),
  tests              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  diff_samenvatting  text        NOT NULL DEFAULT '' CHECK (length(diff_samenvatting) <= 8000),
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op      timestamptz NOT NULL DEFAULT now(),
  beslist_op         timestamptz,
  beslist_door       text,
  uitkomst_code      text,
  uitkomst           jsonb
);
CREATE INDEX IF NOT EXISTS uitrol_voorstellen_status_idx ON app.uitrol_voorstellen (status, aangemaakt_op DESC);

CREATE TABLE IF NOT EXISTS app.goedkeur_uitdagingen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  doel          text        NOT NULL CHECK (doel IN ('registreren', 'goedkeuren', 'sleutel-toevoegen', 'sleutel-verwijderen')),
  onderwerp     text        NOT NULL DEFAULT '',
  nonce         text        NOT NULL UNIQUE,
  uitdaging     text        NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  verloopt_ms   bigint      NOT NULL,   -- exact de waarde in de challenge (ms sinds 1970), daarom geen timestamptz
  gebruikt_op   timestamptz,
  CONSTRAINT goedkeur_uitdagingen_kort CHECK (verloopt_ms <= (extract(epoch FROM aangemaakt_op) * 1000)::bigint + 310000)
);
CREATE INDEX IF NOT EXISTS goedkeur_uitdagingen_verloopt_idx ON app.goedkeur_uitdagingen (verloopt_ms);

ALTER TABLE app.uitrol_voorbereiders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_voorstellen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.goedkeur_uitdagingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_voorbereiders_geen_app ON app.uitrol_voorbereiders;
CREATE POLICY uitrol_voorbereiders_geen_app ON app.uitrol_voorbereiders USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
DROP POLICY IF EXISTS uitrol_voorstellen_geen_app ON app.uitrol_voorstellen;
CREATE POLICY uitrol_voorstellen_geen_app ON app.uitrol_voorstellen USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
DROP POLICY IF EXISTS goedkeur_uitdagingen_geen_app ON app.goedkeur_uitdagingen;
CREATE POLICY goedkeur_uitdagingen_geen_app ON app.goedkeur_uitdagingen USING (current_user::text <> 'mijnruimte_app') WITH CHECK (current_user::text <> 'mijnruimte_app');
