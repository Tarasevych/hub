-- 0113 (22.10.2026, zone G): opdracht-terminal van het technisch profiel — app.terminal_opdrachten.
--
-- Waarom: de «Термінал» opende tot nu toe alleen een wegwerpcontainer op een apparaat met podman; de eigenaar wil zijn SERVER (Ubuntu-VM,
-- als beheer) en zijn Windows-pc (PowerShell) vanaf de site bedienen. Elke regel in de nieuwe opdracht-terminal is ÉÉN programma uit de
-- toegestane lijst van het apparaat, zonder shell, gestart door de agent (deploy/agent/agent.mjs term.exec, 0.8.0) als die gebruiker
-- (geen sudo: NoNewPrivileges). De uitvoer wordt hier bewaard («вихід записується»), net als bij de containersessies (0036).
--
-- WAT ER IN EEN RIJ STAAT
--   • user_id, agent_id, agent_naam: wie, op welk eigen apparaat (alleen eigen apparaten; backend/terminal.ts controleert dat);
--   • regel: de getypte regel (max. 2000 tekens); programma + args (jsonb) zoals de server ze ontleedde (shared/terminal-opdrachten.ts);
--   • soort: lezend | wijzigend; powershell: de regel ging als -Command-tekst; bevestigd: de mens klikte «Виконати» op de site;
--   • cwd: werkmap; begin_op / einde_op; staat: bezig | klaar | mislukt | tijd | geweigerd;
--   • code (exitcode), uitvoer (stdout+stderr, afgekapt op 256 KB, afgekapt=true als er meer was), fout (weigering van de agent);
--   • via_activatie: de technische activering waaronder dit gebeurde.
-- Lezen: eigen rijen (RLS); alle rijen alleen met 'opnames.bekijken' (Аудитор, Власник) via de systeemrol. Schrijven: systeemrol.
-- Idempotent (de testsuite draait alle migraties opnieuw). Terugdraaien: DROP TABLE app.terminal_opdrachten;
CREATE TABLE IF NOT EXISTS app.terminal_opdrachten (
  id             uuid        PRIMARY KEY,
  user_id        text        NOT NULL,
  agent_id       uuid        NOT NULL,
  agent_naam     text        NOT NULL DEFAULT '',
  regel          text        NOT NULL CHECK (char_length(regel) BETWEEN 1 AND 2000),
  programma      text        NOT NULL CHECK (char_length(programma) BETWEEN 1 AND 64),
  args           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  soort          text        NOT NULL DEFAULT 'wijzigend' CHECK (soort IN ('lezend', 'wijzigend')),
  powershell     boolean     NOT NULL DEFAULT false,
  bevestigd      boolean     NOT NULL DEFAULT false,
  cwd            text        NOT NULL DEFAULT '' CHECK (char_length(cwd) <= 500),
  staat          text        NOT NULL DEFAULT 'bezig' CHECK (staat IN ('bezig', 'klaar', 'mislukt', 'tijd', 'geweigerd')),
  code           int,
  uitvoer        text        NOT NULL DEFAULT '',
  afgekapt       boolean     NOT NULL DEFAULT false,
  fout           text        NOT NULL DEFAULT '' CHECK (char_length(fout) <= 1000),
  bytes_uit      int         NOT NULL DEFAULT 0,
  via_activatie  text        NOT NULL DEFAULT '',
  begin_op       timestamptz NOT NULL DEFAULT now(),
  einde_op       timestamptz
);
CREATE INDEX IF NOT EXISTS terminal_opdrachten_user ON app.terminal_opdrachten (user_id, begin_op DESC);
CREATE INDEX IF NOT EXISTS terminal_opdrachten_agent ON app.terminal_opdrachten (agent_id, begin_op DESC);
COMMENT ON TABLE app.terminal_opdrachten IS
  'Opdracht-terminal (technisch profiel): één programma per regel op een eigen apparaat via de agent (term.exec), uitvoer opgenomen. Zie shared/terminal-opdrachten.ts en backend/terminal.ts.';

ALTER TABLE app.terminal_opdrachten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS terminal_opdrachten_eigen ON app.terminal_opdrachten;
CREATE POLICY terminal_opdrachten_eigen ON app.terminal_opdrachten
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
