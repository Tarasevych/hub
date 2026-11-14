-- 0275 — IDENTITEIT-015 (крок «aanmelden», етап 3.5–3.9 плану): вхід без Google.
-- Aanmelden zonder Google: toegangssleutel (discoverable), wachtwoord (+ tweede factor), Microsoft/Discord/Apple via een gekoppelde
-- identiteit en de bevestiging van een telefoonnummer per sms. 0274 blijft vrij voor de stap «vertrouwen van een toegangssleutel».
--
-- 1. app.aanmeld_uitdagingen — eenmalige uitdagingen VÓÓR de sessie (er is nog geen gebruiker, dus niet in app.passkey_uitdagingen,
--    waar user_id verplicht is). Eén rij per poging: soort 'passkey' (WebAuthn-challenge), 'wachtwoord' (alleen de binding aan de
--    aanmeldtransactie) of 'extern' (OAuth-state, PKCE-verifier en nonce). `sleutel_hash` = sha256 van wat de browser terugstuurt
--    (uitdagingId of state); de transactie (owner_auth_transactions_v1) bindt de rij aan het tabblad via de bindingscookie.
--    Eenmalig: `gebruikt_op` wordt atomisch gezet (UPDATE … WHERE gebruikt_op IS NULL AND verloopt_op > now()).
--    RLS: de app-rol ziet en schrijft hier NIETS (alleen de systeemrol van de server, vóór elke sessie). Oude rijen ruimt de server op.
-- 2. Functievlaggen, elk apart en standaard «Тільки я» (alleen de eigenaar van de site; zonder eigenaar-rij = uit).
--    ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar bij opnieuw draaien.
-- Повторюване: IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS app.aanmeld_uitdagingen (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  soort          text        NOT NULL CHECK (soort IN ('passkey', 'wachtwoord', 'extern')),
  aanbieder      text        NOT NULL DEFAULT '' CHECK (length(aanbieder) <= 20),
  sleutel_hash   text        NOT NULL CHECK (sleutel_hash ~ '^[a-f0-9]{64}$'),
  transactie_id  text        NOT NULL CHECK (length(transactie_id) BETWEEN 1 AND 120),
  uitdaging      text        NOT NULL DEFAULT '' CHECK (length(uitdaging) <= 200),   -- WebAuthn-challenge (base64url); leeg voor andere soorten
  verifier       text        NOT NULL DEFAULT '' CHECK (length(verifier) <= 200),    -- PKCE-verifier (extern); verlaat de server nooit
  nonce          text        NOT NULL DEFAULT '' CHECK (length(nonce) <= 100),
  verloopt_op    timestamptz NOT NULL,
  gebruikt_op    timestamptz,
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sleutel_hash)
);
CREATE INDEX IF NOT EXISTS aanmeld_uitdagingen_verloopt_idx ON app.aanmeld_uitdagingen (verloopt_op);

DO $aanmeld_uitdagingen$
BEGIN
  ALTER TABLE app.aanmeld_uitdagingen ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS aanmeld_uitdagingen_systeem ON app.aanmeld_uitdagingen;
  -- Alleen de server (systeemrol); de app-rol van een ingelogde sessie heeft hier niets te zoeken.
  CREATE POLICY aanmeld_uitdagingen_systeem ON app.aanmeld_uitdagingen
    USING (current_user::text <> 'mijnruimte_app')
    WITH CHECK (current_user::text <> 'mijnruimte_app');
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.aanmeld_uitdagingen FROM mijnruimte_app;
  END IF;
END
$aanmeld_uitdagingen$;

-- Vlaggen: «Тільки я» = aan, standaard uit, alleen de (eerste) eigenaar in de lijst. omschrijving ≤ 300 tekens.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers)
VALUES
  ('aanmelden-passkey',
   'Вхід лише ключем доступу (без Google) на сторінці входу. | Aanmelden met alleen een toegangssleutel (zonder Google) op de aanmeldpagina.',
   true, false, 0, ARRAY(SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY seq LIMIT 1)),
  ('aanmelden-wachtwoord',
   'Вхід паролем (з кодом із застосунку, якщо його налаштовано) на сторінці входу. | Aanmelden met wachtwoord (met app-code als die is ingesteld).',
   true, false, 0, ARRAY(SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY seq LIMIT 1)),
  ('aanmelden-extern',
   'Вхід через прив’язаний Microsoft, Discord або Apple (потрібні ключі власника й зелена самоперевірка). | Aanmelden met een gekoppelde Microsoft, Discord of Apple.',
   true, false, 0, ARRAY(SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY seq LIMIT 1)),
  ('aanmelden-sms',
   'Підтвердження номера телефону кодом із SMS (потрібен SMS-провайдер власника). | Telefoonnummer bevestigen met een sms-code (sms-aanbieder van de eigenaar nodig).',
   true, false, 0, ARRAY(SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY seq LIMIT 1))
ON CONFLICT (sleutel) DO NOTHING;
