-- Rechten «updates voorbereiden»: (1) «tot intrekking» zonder einddatum, (2) herkomst (handmatig of uit het ondertekende AI-beleid).
-- Waarom:
--  - De eigenaar wil een agent kunnen toestaan «tot ik het intrek». Een echte NULL zou elke query `verloopt_op > now()` breken; daarom een
--    vlag `onbepaald` en een vaste verre einddatum (9999-12-31) — alle bestaande controles (verloopt_op > now()) blijven dus kloppen.
--  - Zet de eigenaar in «Доступ ШІ» de mogelijkheid «Розгортати сайт» voor een agent aan, dan verschijnt die agent automatisch in
--    «Хто готує оновлення» (backend/uitrol-beleid-sync.ts). Zo'n recht heeft bron = 'ai-beleid' en wordt alleen door die synchronisatie
--    (of door de eigenaar) weer ingetrokken; handmatig gegeven rechten (bron = 'handmatig') raakt de synchronisatie nooit.
ALTER TABLE app.uitrol_voorbereiders ADD COLUMN IF NOT EXISTS onbepaald boolean NOT NULL DEFAULT false;
ALTER TABLE app.uitrol_voorbereiders ADD COLUMN IF NOT EXISTS bron text NOT NULL DEFAULT 'handmatig';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'app.uitrol_voorbereiders'::regclass AND conname = 'uitrol_voorbereiders_bron_check') THEN
    ALTER TABLE app.uitrol_voorbereiders ADD CONSTRAINT uitrol_voorbereiders_bron_check CHECK (bron IN ('handmatig', 'ai-beleid'));
  END IF;
END $$;
ALTER TABLE app.uitrol_voorbereiders DROP CONSTRAINT IF EXISTS uitrol_voorbereiders_max_duur;
ALTER TABLE app.uitrol_voorbereiders ADD CONSTRAINT uitrol_voorbereiders_max_duur CHECK (
  (onbepaald AND verloopt_op = timestamptz '9999-12-31 00:00:00+00')
  OR (NOT onbepaald AND verloopt_op <= gegeven_op + interval '30 days'));
