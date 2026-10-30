-- 0039: journaal-context (architectuur 13.10.2026, etap E). Elke regel kan in details._ctx dragen:
--   profiel  = technisch profiel (tech-…) waarin de actie gebeurde (actief in dat tabblad);
--   namens   = id van het ondersteuningsverzoek als iemand «від імені» van een ander keek;
--   ruimte   = werkruimte.
-- details valt al onder de hashketen (app.audit_hash), dus deze velden ook. De kolommen hieronder zijn ALLEEN afgeleid (GENERATED),
-- om op te filteren en te exporteren: ze veranderen de hash en de controle (app.audit_controleer) niet.
ALTER TABLE app.audit ADD COLUMN IF NOT EXISTS ctx_profiel text GENERATED ALWAYS AS (details -> '_ctx' ->> 'profiel') STORED;
ALTER TABLE app.audit ADD COLUMN IF NOT EXISTS ctx_namens  text GENERATED ALWAYS AS (details -> '_ctx' ->> 'namens') STORED;
ALTER TABLE app.audit ADD COLUMN IF NOT EXISTS ctx_ruimte  text GENERATED ALWAYS AS (details -> '_ctx' ->> 'ruimte') STORED;
CREATE INDEX IF NOT EXISTS audit_ctx_profiel ON app.audit (ctx_profiel, id DESC) WHERE ctx_profiel IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_ctx_namens  ON app.audit (ctx_namens, id DESC)  WHERE ctx_namens IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_ctx_ruimte  ON app.audit (ctx_ruimte, id DESC)  WHERE ctx_ruimte IS NOT NULL;
