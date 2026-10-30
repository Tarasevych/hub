-- 0105 (22.10.2026, zone B): «РІШЕННЯ ВЛАСНИКА З ПІДПИСОМ PASSKEY» — app.eigenaar_besluiten (deploy/RUNBOOK-VEILIGE-UITROL.md §15,
-- backend/eigenaar-besluit.ts, deploy/besluit/mijn-ruimte-besluit.sh).
--
-- Waarom: de knop «Відкат до попереднього» op mcp.*/dashboard werkte alleen met "opdracht.terugdraaien": true in het root-bestand
-- /etc/mijn-ruimte/mcp-rechten.json (standaard uit, bewust: een gekaapte app mag de site niet terugdraaien), en de witte lijst van
-- externe MCP-hosts (externeMcpHosts) was alleen via SSH te wijzigen. Nu gaat een besluit van de eigenaar hetzelfde pad als het
-- goedkeuren van updates: de browser maakt een WebAuthn-assertie over sha256(canonieke inhoud) + nonce + vervaltijd (≤ 5 min), de app legt
-- die in /srv/mijn-ruimte/besluit-inbox, en ROOT controleert de handtekening opnieuw tegen zijn eigen sleutels en voert pas dan uit.
-- Het rechtenbestand blijft van root en wordt NIET schrijfbaar voor de app.
--
-- WAT ER IN EEN RIJ STAAT
--   • user_id: de eigenaar die het besluit startte (alleen hij ziet zijn rijen; de routes eisen bovendien de eigenaarsrol);
--   • soort: terugdraaien | externe-hosts; inhoud: de GENORMALISEERDE inhoud (besluit-kern.mjs) — {van, naar} of {hosts};
--   • hash: sha256 (hex) van de canonieke tekst — precies dit tekent de passkey (webauthn-kern uitdagingVoor('eigenaar-besluit'));
--   • nonce / verloopt_ms / uitdaging_id: de eenmalige challenge (app.goedkeur_uitdagingen, 0022) — één keer te gebruiken;
--   • staat: ontwerp → ondertekend → klaar | geweigerd | mislukt; ontwerp/ondertekend → verlopen (geen uitkomst binnen 15 min);
--   • code, uitkomst (uk/nl/tijd/detail van root), passkey (eerste 16 tekens van de vingerafdruk waarmee root bevestigde).
-- De waarheid over de uitkomst komt uit het statusbestand van root (/var/lib/mijn-ruimte-uitrol-status/besluit-<id>.json); de rij is
-- de geschiedenis voor de eigenaar en de pagina. Idempotent: de testsuite draait alle migraties opnieuw.
-- Terugdraaien van deze migratie: DROP TABLE app.eigenaar_besluiten; en de doel-CHECK van app.goedkeur_uitdagingen terug naar die van 0069.

-- De eenmalige challenge (0022) krijgt een nieuw doel 'eigenaar-besluit' (webauthn-kern.mjs DOELEN).
ALTER TABLE app.goedkeur_uitdagingen DROP CONSTRAINT IF EXISTS goedkeur_uitdagingen_doel_check;
ALTER TABLE app.goedkeur_uitdagingen ADD CONSTRAINT goedkeur_uitdagingen_doel_check
  CHECK (doel IN ('registreren', 'goedkeuren', 'sleutel-toevoegen', 'sleutel-verwijderen', 'ai-beleid', 'ssh-ca', 'eigenaar-besluit'));

CREATE TABLE IF NOT EXISTS app.eigenaar_besluiten (
  id             uuid        PRIMARY KEY,
  user_id        text        NOT NULL,
  soort          text        NOT NULL CHECK (soort IN ('terugdraaien', 'externe-hosts')),
  inhoud         jsonb       NOT NULL,
  hash           text        NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  nonce          text        NOT NULL DEFAULT '' CHECK (length(nonce) <= 128),
  verloopt_ms    bigint      NOT NULL DEFAULT 0,
  uitdaging_id   uuid,
  staat          text        NOT NULL DEFAULT 'ontwerp' CHECK (staat IN ('ontwerp', 'ondertekend', 'klaar', 'geweigerd', 'mislukt', 'verlopen')),
  code           text        NOT NULL DEFAULT '' CHECK (code ~ '^[A-Z0-9_]{0,60}$'),
  uitkomst       jsonb,
  passkey        text        NOT NULL DEFAULT '' CHECK (passkey ~ '^[0-9a-f]{0,16}$'),
  door           text        NOT NULL DEFAULT '' CHECK (length(door) <= 200),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  ondertekend_op timestamptz,
  afgerond_op    timestamptz,
  CHECK (verloopt_ms = 0 OR verloopt_ms <= (extract(epoch FROM aangemaakt_op) * 1000)::bigint + 400000)
);
CREATE INDEX IF NOT EXISTS eigenaar_besluiten_eigenaar_idx ON app.eigenaar_besluiten (user_id, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS eigenaar_besluiten_open_idx ON app.eigenaar_besluiten (staat) WHERE staat IN ('ontwerp', 'ondertekend');
COMMENT ON TABLE app.eigenaar_besluiten IS
  'Besluiten van de eigenaar met passkey-handtekening (terugdraaien naar een release, witte lijst externe MCP-hosts); root controleert en voert uit (§15). Rij = geschiedenis; uitkomst uit besluit-<id>.json van root.';
COMMENT ON COLUMN app.eigenaar_besluiten.hash IS 'sha256 (hex) van de canonieke inhoud (deploy/goedkeuring/besluit-kern.mjs); dit tekent de passkey.';

-- Rijbeveiliging (zelfde vorm als 0092/0098): de app-rol ziet alleen eigen rijen; de systeemrol (BYPASSRLS) bedient de server.
-- Schrijven doet alleen de systeemrol (migrations/rechten.sql: SELECT voor de app-rol, geen INSERT/UPDATE/DELETE).
ALTER TABLE app.eigenaar_besluiten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eigenaar_besluiten_eigen ON app.eigenaar_besluiten;
CREATE POLICY eigenaar_besluiten_eigen ON app.eigenaar_besluiten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $eigenaar_besluiten_bewijs$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM app.eigenaar_besluiten;
  RAISE NOTICE '0105: app.eigenaar_besluiten klaar (passkey-besluiten van de eigenaar); rijen: % (bij een eerste migratie 0)', n;
END
$eigenaar_besluiten_bewijs$;
