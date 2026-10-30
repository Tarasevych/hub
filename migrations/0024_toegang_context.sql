-- 0024: gebruikscontext, notities en wijzigingen van toegangssleutels (id.tarasevych.com/methods, RUNBOOK §13.10).
--
--   app.toegang_gebruik      per gebruik van een passkey of herstelcode: WAARVOOR (actie uit een vaste lijst op de server),
--                            WAAR (host), apparaat (grof label uit de user-agent, bv. «Chrome/Windows») en de IP-hash. Alleen
--                            toevoegen; de app houdt per sleutel de laatste 20 (oudere rijen worden bij het toevoegen gewist).
--   app.toegang_notities     privénotitie (≤ 500 tekens) per passkey, herstelcodeset, losse herstelcode of (toekomstige) toegangscode.
--   app.toegang_wijzigingen  wie/wanneer/waarom bij het intrekken van een recht (bv. «Може схвалювати оновлення») of het verwijderen
--                            van een goedkeur-passkey: account, sessie, apparaat, IP-hash, reden, sleutel; plus wat nodig is om de
--                            wijziging terug te draaien («Це був не я»). Schrijven alleen via de systeemrol (de getroffen gebruiker
--                            kan een ander account zijn dan wie de wijziging deed); de app-rol leest alleen eigen rijen.
--
-- RLS zoals 0023: voor mijnruimte_app altijd alleen eigen rijen (app.user_id). De systeemrol filtert in de code op user_id.
CREATE TABLE IF NOT EXISTS app.toegang_gebruik (
  id        bigserial PRIMARY KEY,
  user_id   text        NOT NULL,
  soort     text        NOT NULL CHECK (soort IN ('passkey', 'herstelcode')),
  sleutel   text        NOT NULL CHECK (sleutel ~ '^[A-Za-z0-9:._-]{1,120}$'),
  actie     text        NOT NULL CHECK (actie ~ '^[a-z][a-z0-9-]{1,40}$'),
  host      text        NOT NULL DEFAULT '' CHECK (host = '' OR host ~ '^([a-z0-9-]+\.)*tarasevych\.com$'),
  apparaat  text        CHECK (apparaat IS NULL OR length(apparaat) <= 40),
  ip_hash   text        CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{8,64}$'),
  op        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS toegang_gebruik_sleutel_idx ON app.toegang_gebruik (user_id, soort, sleutel, op DESC);

CREATE TABLE IF NOT EXISTS app.toegang_notities (
  user_id       text        NOT NULL,
  soort         text        NOT NULL CHECK (soort IN ('passkey', 'herstelset', 'herstelcode', 'toegangscode')),
  sleutel       text        NOT NULL CHECK (sleutel ~ '^[A-Za-z0-9:._-]{1,120}$'),
  tekst         text        NOT NULL CHECK (length(tekst) BETWEEN 1 AND 500),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, soort, sleutel)
);

CREATE TABLE IF NOT EXISTS app.toegang_wijzigingen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL,                -- getroffen account (eigenaar van het recht/de sleutel)
  actor_id         text        NOT NULL,                -- wie de wijziging deed
  actor_email      text        NOT NULL DEFAULT '',
  soort            text        NOT NULL CHECK (soort IN ('goedkeur-recht-aangevraagd', 'goedkeur-recht-ingetrokken', 'goedkeur-passkey-verwijderd', 'voorbereider-ingetrokken')),
  sleutel          text        NOT NULL DEFAULT '',     -- passkey-id of grant-id
  vingerafdruk     text        NOT NULL DEFAULT '' CHECK (vingerafdruk = '' OR vingerafdruk ~ '^[0-9a-f]{64}$'),
  label            text        NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  reden            text        CHECK (reden IS NULL OR length(reden) BETWEEN 10 AND 500),
  sessie_id        text        NOT NULL DEFAULT '',
  sessies          jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- tab-, anker- en browsergrant-id van de sessie die de wijziging deed
  stap_op          text        NOT NULL DEFAULT '',            -- waarmee bevestigd: passkey | totp | herstelcode
  host             text        NOT NULL DEFAULT '',
  apparaat         text,
  ip_hash          text,
  herstel          jsonb,                                      -- publieke passkeygegevens om een verwijderde passkey terug te zetten
  op               timestamptz NOT NULL DEFAULT now(),
  ongedaan_op      timestamptz,
  ongedaan_door    text,
  ongedaan_uitkomst jsonb
);
CREATE INDEX IF NOT EXISTS toegang_wijzigingen_user_idx ON app.toegang_wijzigingen (user_id, op DESC);
CREATE INDEX IF NOT EXISTS toegang_wijzigingen_fp_idx ON app.toegang_wijzigingen (user_id, vingerafdruk) WHERE vingerafdruk <> '';

ALTER TABLE app.toegang_gebruik ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.toegang_notities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.toegang_wijzigingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS toegang_gebruik_eigen ON app.toegang_gebruik;
CREATE POLICY toegang_gebruik_eigen ON app.toegang_gebruik
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS toegang_notities_eigen ON app.toegang_notities;
CREATE POLICY toegang_notities_eigen ON app.toegang_notities
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS toegang_wijzigingen_eigen ON app.toegang_wijzigingen;
CREATE POLICY toegang_wijzigingen_eigen ON app.toegang_wijzigingen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
