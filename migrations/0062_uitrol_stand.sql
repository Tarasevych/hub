-- 0062 — Eén bron van waarheid voor de uitrolstand (audit 18.10.2026, punt 7).
--
-- Waarom: de stand «wat draait er nu en is de laatste installatie klaar» kwam uit vier plekken (status.json van root,
-- gebeurtenissen.jsonl, app.uitrol_runs, app.uitrol_voorstellen) plus de releasemap en VORIGE. Ze liepen uiteen:
-- status.json.versie was de pakketversie (passkey) óf de mapnaam (SSH); de modi opdracht/nazorg schreven niets.
--
-- Vanaf nu: backend/uitrol-bron.ts leest alle bronnen, normaliseert (versie = ALTIJD de pakketversie, release = mapnaam apart),
-- vergelijkt ze en bewaart hier één samengevoegde stand met de lijst afwijkingen. UI, /api/version-consumenten en de MCP-tools
-- lezen deze stand; de losse bronnen blijven alleen zichtbaar op de kaart «Джерела статусу» (diagnose).
CREATE TABLE IF NOT EXISTS app.uitrol_stand (
  id            text        PRIMARY KEY CHECK (id = 'huidig'),
  versie        text        NOT NULL DEFAULT '' CHECK (versie = '' OR versie ~ '^[0-9]{8}-[0-9]{6}$'),
  release       text        NOT NULL DEFAULT '' CHECK (release = '' OR release ~ '^[0-9]{8}-[0-9]{6}$'),
  commit        text        NOT NULL DEFAULT '' CHECK (commit = '' OR commit ~ '^[0-9a-f]{7,40}$'),
  staat         text        NOT NULL DEFAULT '' CHECK (staat IN ('', 'bezig', 'klaar', 'mislukt', 'geweigerd', 'afgebroken')),
  methode       text        NOT NULL DEFAULT '' CHECK (length(methode) <= 20),
  tijd          timestamptz,
  hoofdbron     text        NOT NULL DEFAULT 'runs' CHECK (hoofdbron IN ('runs', 'status', 'releasemap', 'versie')),
  interval_sec  integer     NOT NULL DEFAULT 20 CHECK (interval_sec BETWEEN 5 AND 300),
  bronnen       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  afwijkingen   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN REVOKE ALL ON app.uitrol_stand FROM mijnruimte_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN GRANT SELECT, INSERT, UPDATE ON app.uitrol_stand TO mijnruimte_system; END IF;
END
$r$;

-- Runs die door het bewakings- of opdrachtkanaal zijn teruggedraaid, krijgen een eigen methode.
ALTER TABLE app.uitrol_runs DROP CONSTRAINT IF EXISTS uitrol_runs_methode_check;
ALTER TABLE app.uitrol_runs ADD CONSTRAINT uitrol_runs_methode_check CHECK (methode IN ('passkey', 'handtekening', 'gitops', 'opdracht', 'ssh', 'nazorg'));
