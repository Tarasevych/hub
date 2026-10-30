-- 0025: toegangscodes voor anderen (id.tarasevych.com/methods «Коди доступу для інших», RUNBOOK §13.11).
--
--   app.toegangscodes     een code die de eigenaar aan iemand anders geeft: naam, scopes (vaste allowlist op de server, alleen
--                         lezen), verloop (NULL = безстроково), eenmalig of herbruikbaar met optioneel maximum. De code zelf staat
--                         er NOOIT in: alleen de SHA-256 (code_hash) en de laatste 4 tekens als hint.
--   app.gast_sessies      gastsessie na het inwisselen van een code: eigen cookie (alleen de hash van het token), nooit de
--                         identiteit van de eigenaar. Elke gastaanvraag controleert sessie + code opnieuw (intrekken werkt meteen).
--   app.toegangscode_log  elk gebruik en elke actie onder een code (aangemaakt, ingewisseld, actie, geweigerd, gewijzigd,
--                         ingetrokken, sessie beëindigd), met apparaat en IP-hash; zichtbaar voor de eigenaar.
--
-- Schrijven gebeurt alleen via de systeemrol (inwisselen kent de eigenaar nog niet); de app-rol leest onder RLS alleen eigen rijen.
CREATE TABLE IF NOT EXISTS app.toegangscodes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL,
  naam               text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 80),
  code_hash          text        NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint          text        NOT NULL CHECK (code_hint ~ '^[0-9A-Z]{4}$'),
  scopes             text[]      NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 10),
  eenmalig           boolean     NOT NULL DEFAULT false,
  max_gebruik        integer     CHECK (max_gebruik IS NULL OR max_gebruik BETWEEN 1 AND 1000),
  gebruikt           integer     NOT NULL DEFAULT 0 CHECK (gebruikt >= 0),
  verloopt_op        timestamptz,
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  aangemaakt_sessie  text        NOT NULL DEFAULT '',
  eerste_gebruik_op  timestamptz,
  laatst_gebruikt_op timestamptz,
  laatst_apparaat    text        CHECK (laatst_apparaat IS NULL OR length(laatst_apparaat) <= 40),
  laatst_ip_hash     text        CHECK (laatst_ip_hash IS NULL OR laatst_ip_hash ~ '^[0-9a-f]{8,64}$'),
  ingetrokken_op     timestamptz,
  ingetrokken_reden  text        CHECK (ingetrokken_reden IS NULL OR length(ingetrokken_reden) BETWEEN 10 AND 500),
  ingetrokken_door   text
);
CREATE INDEX IF NOT EXISTS toegangscodes_user_idx ON app.toegangscodes (user_id, aangemaakt_op DESC);

CREATE TABLE IF NOT EXISTS app.gast_sessies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id          uuid        NOT NULL REFERENCES app.toegangscodes (id) ON DELETE CASCADE,
  user_id          text        NOT NULL,
  token_hash       text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  gestart_op       timestamptz NOT NULL DEFAULT now(),
  laatst_actief_op timestamptz NOT NULL DEFAULT now(),
  verloopt_op      timestamptz NOT NULL,
  ingetrokken_op   timestamptz,
  ingetrokken_reden text       CHECK (ingetrokken_reden IS NULL OR ingetrokken_reden ~ '^[a-z-]{2,40}$'),
  apparaat         text        CHECK (apparaat IS NULL OR length(apparaat) <= 40),
  ip_hash          text        CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{8,64}$')
);
CREATE INDEX IF NOT EXISTS gast_sessies_code_idx ON app.gast_sessies (code_id, gestart_op DESC);
CREATE INDEX IF NOT EXISTS gast_sessies_user_idx ON app.gast_sessies (user_id) WHERE ingetrokken_op IS NULL;

CREATE TABLE IF NOT EXISTS app.toegangscode_log (
  id        bigserial PRIMARY KEY,
  code_id   uuid        NOT NULL REFERENCES app.toegangscodes (id) ON DELETE CASCADE,
  user_id   text        NOT NULL,
  sessie_id uuid,
  soort     text        NOT NULL CHECK (soort IN ('aangemaakt', 'ingewisseld', 'actie', 'geweigerd', 'gewijzigd', 'ingetrokken', 'sessie-ingetrokken', 'uitgelogd')),
  detail    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  apparaat  text        CHECK (apparaat IS NULL OR length(apparaat) <= 40),
  ip_hash   text        CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{8,64}$'),
  op        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS toegangscode_log_code_idx ON app.toegangscode_log (code_id, op DESC, id DESC);

ALTER TABLE app.toegangscodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.gast_sessies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.toegangscode_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS toegangscodes_eigen ON app.toegangscodes;
CREATE POLICY toegangscodes_eigen ON app.toegangscodes
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS gast_sessies_eigen ON app.gast_sessies;
CREATE POLICY gast_sessies_eigen ON app.gast_sessies
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS toegangscode_log_eigen ON app.toegangscode_log;
CREATE POLICY toegangscode_log_eigen ON app.toegangscode_log
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
