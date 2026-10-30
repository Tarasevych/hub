-- 0047: blijvende geschiedenis van uitrollen (runs) met stappen en logregels.
--
-- Probleem: de enige bron van waarheid was /var/lib/mijn-ruimte-uitrol-status (status.json = alleen de LAATSTE stand, gebeurtenissen.jsonl =
-- laatste 500 regels). Een volgende installatie (ook via SSH) overschreef de stand, en het installatielogboek was er helemaal niet. Zo kon
-- de site niet laten zien wat er bij een eerdere uitrol misging.
--
--   app.uitrol_runs        één rij per uitrol (passkey, ondertekend, GitOps of SSH): methode, stand, laatste stap, percentage, code,
--                          uitkomsttekst, pakketgegevens (sha256, commit, wie bereidde voor, wat veranderde) en tijden.
--   app.uitrol_run_regels  logregels per run (genummerd, in volgorde): wat root en het installatiescript hebben geschreven.
--
-- Root schrijft stappen.jsonl en runs/<run>.log; de app neemt ze op (backend/uitrol-runs.ts). Alleen de systeemrol gebruikt deze tabellen.
CREATE TABLE IF NOT EXISTS app.uitrol_runs (
  id             text        PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 80),
  methode        text        NOT NULL CHECK (methode IN ('passkey', 'handtekening', 'gitops', 'opdracht', 'ssh')),
  versie         text        NOT NULL DEFAULT '',     -- versie van het pakket (UITROL-VERSIE)
  release        text        NOT NULL DEFAULT '',     -- naam van de releasemap (bij SSH: tijdstip van de installatie)
  staat          text        NOT NULL DEFAULT 'bezig' CHECK (staat IN ('bezig', 'klaar', 'mislukt', 'geweigerd', 'afgebroken')),
  stap           text        NOT NULL DEFAULT '',     -- laatste stap (ontvangen, kopie, echtheid, inhoud, installeren, klaar)
  sub            text        NOT NULL DEFAULT '',     -- onderdeel van «installeren» (bron, bouwen, backup, migraties, actief)
  pct            integer     NOT NULL DEFAULT 0 CHECK (pct BETWEEN 0 AND 100),
  code           text        NOT NULL DEFAULT '',
  uk             text        NOT NULL DEFAULT '',
  nl             text        NOT NULL DEFAULT '',
  stappen        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  voorstel_id    uuid,
  sha256         text        NOT NULL DEFAULT '',
  bytes          bigint      NOT NULL DEFAULT 0,
  bron_commit    text        NOT NULL DEFAULT '',
  voorbereider   text        NOT NULL DEFAULT '',
  goedgekeurd_door text      NOT NULL DEFAULT '',
  wijzigingen    text        NOT NULL DEFAULT '' CHECK (length(wijzigingen) <= 8000),
  wie            text        NOT NULL DEFAULT '',
  adres          text        NOT NULL DEFAULT '',
  log_regels     integer     NOT NULL DEFAULT 0,
  gestart_op     timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op  timestamptz NOT NULL DEFAULT now(),
  geeindigd_op   timestamptz
);
CREATE INDEX IF NOT EXISTS uitrol_runs_gestart_idx ON app.uitrol_runs (gestart_op DESC);
CREATE INDEX IF NOT EXISTS uitrol_runs_staat_idx ON app.uitrol_runs (staat, gestart_op DESC);
CREATE INDEX IF NOT EXISTS uitrol_runs_versie_idx ON app.uitrol_runs (versie);

CREATE TABLE IF NOT EXISTS app.uitrol_run_regels (
  run_id  text        NOT NULL REFERENCES app.uitrol_runs (id) ON DELETE CASCADE,
  nr      integer     NOT NULL CHECK (nr >= 0),
  tijd    timestamptz NOT NULL DEFAULT now(),   -- moment van opname door de app (±2 s na het schrijven door root)
  niveau  text        NOT NULL DEFAULT 'info' CHECK (niveau IN ('info', 'ok', 'warn', 'error')),
  tekst   text        NOT NULL CHECK (length(tekst) <= 600),
  PRIMARY KEY (run_id, nr)
);
