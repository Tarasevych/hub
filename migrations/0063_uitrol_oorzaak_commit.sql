-- 0063: echte oorzaak van een mislukte installatie en de commitregel (audit 18.10.2026, punten 2, 6 en 10).
--
-- Waarom:
--  * Een mislukte installatie toonde «bouwen mislukt (journalctl …)» of een willekeurige logregel. Root schrijft nu de EERSTE echte foutregel
--    (`reden`) en enkele regels eromheen (`context`) in status.json en in de gebeurtenis; de app bewaart ze bij de run, zodat de site
--    «Причина» kan tonen, ook als het logboek later wordt ingekort.
--  * Regel 3: BRON-COMMIT is een 40-hex git-commit óf uitdrukkelijk «zonder-git:<reden>». De oude CHECK op uitrol_voorstellen.bron_commit
--    stond alleen hex toe; een pakket dat volgens de regel buiten git is gebouwd, moet ook als voorstel bewaard kunnen worden.
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS reden   text  NOT NULL DEFAULT '' CHECK (length(reden) <= 400);
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(context) = 'array');

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace
           WHERE n.nspname = 'app' AND rel.relname = 'uitrol_voorstellen' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%bron_commit%'
  LOOP
    EXECUTE format('ALTER TABLE app.uitrol_voorstellen DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE app.uitrol_voorstellen ADD CONSTRAINT uitrol_voorstellen_bron_commit_check
  CHECK (bron_commit IS NULL OR bron_commit ~ '^[0-9a-f]{7,64}$' OR bron_commit ~ '^zonder-git:.{5,200}$');
