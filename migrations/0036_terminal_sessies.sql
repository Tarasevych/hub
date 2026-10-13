-- 0036: terminals in de browser (architectuur 13.10.2026, etap «термінали»). Een sessie = een wegwerpcontainer op een EIGEN apparaat
--   (agent 0.6, terminal-config on), geopend vanuit een actief technisch profiel met terminal.test of terminal.servers, met reden en
--   verse bevestiging van de aanmelding, tot eind_gepland. De UITVOER wordt opgenomen (asciicast v2, gzip, ≤ 4 MB); invoer niet
--   (wachtwoorden). Opnames lezen alleen rollen met 'opnames.bekijken' (Аудитор, Власник). Schrijven via de systeemrol.
CREATE TABLE IF NOT EXISTS app.terminal_sessies (
  id            uuid        PRIMARY KEY,
  user_id       text        NOT NULL,
  agent_id      uuid        NOT NULL,
  agent_naam    text        NOT NULL DEFAULT '',
  root          text        NOT NULL CHECK (char_length(root) BETWEEN 1 AND 500),
  schrijven     boolean     NOT NULL DEFAULT false,
  reden         text        NOT NULL CHECK (char_length(reden) BETWEEN 3 AND 300),
  minuten       int         NOT NULL CHECK (minuten BETWEEN 1 AND 240),
  begin_op      timestamptz NOT NULL DEFAULT now(),
  eind_gepland  timestamptz NOT NULL,
  einde_op      timestamptz,
  einde_reden   text,
  bytes_uit     bigint      NOT NULL DEFAULT 0,
  opname        bytea,
  CHECK (eind_gepland <= begin_op + interval '4 hours')
);
CREATE INDEX IF NOT EXISTS terminal_sessies_user ON app.terminal_sessies (user_id, begin_op DESC);
ALTER TABLE app.terminal_sessies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS terminal_sessies_eigen ON app.terminal_sessies;
CREATE POLICY terminal_sessies_eigen ON app.terminal_sessies
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
