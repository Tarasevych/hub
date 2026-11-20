-- 0303 (UPD-010): розумна кумулятивна черга оновлень та гнучкі права агентів на завантаження й делеговане встановлення.
-- Зворотно сумісна міграція: лише додавання нових колонок із типовими значеннями та розширення CHECK-обмеження статусу.
-- Попередня версія коду безперебійно працює з цією схемою при можливому відкаті.

ALTER TABLE app.uitrol_voorbereiders
  ADD COLUMN IF NOT EXISTS toegang_niveau text NOT NULL DEFAULT 'uploaden';
ALTER TABLE app.uitrol_voorbereiders
  ADD COLUMN IF NOT EXISTS limiet_modus text NOT NULL DEFAULT 'periode';
ALTER TABLE app.uitrol_voorbereiders
  ADD COLUMN IF NOT EXISTS max_aantal integer;
ALTER TABLE app.uitrol_voorbereiders
  ADD COLUMN IF NOT EXISTS gebruikt_aantal integer NOT NULL DEFAULT 0;
ALTER TABLE app.uitrol_voorbereiders
  ADD COLUMN IF NOT EXISTS bevestiging_per_keer boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'app.uitrol_voorbereiders'::regclass AND conname = 'uitrol_voorbereiders_niveau_check') THEN
    ALTER TABLE app.uitrol_voorbereiders
      ADD CONSTRAINT uitrol_voorbereiders_niveau_check
      CHECK (toegang_niveau IN ('uploaden', 'installeren'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'app.uitrol_voorbereiders'::regclass AND conname = 'uitrol_voorbereiders_limiet_modus_check') THEN
    ALTER TABLE app.uitrol_voorbereiders
      ADD CONSTRAINT uitrol_voorbereiders_limiet_modus_check
      CHECK (limiet_modus IN ('periode', 'eenmalig', 'aantal', 'bevestiging_per_keer'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'app.uitrol_voorbereiders'::regclass AND conname = 'uitrol_voorbereiders_max_aantal_check') THEN
    ALTER TABLE app.uitrol_voorbereiders
      ADD CONSTRAINT uitrol_voorbereiders_max_aantal_check
      CHECK (max_aantal IS NULL OR (max_aantal >= 1 AND max_aantal <= 1000));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'app.uitrol_voorbereiders'::regclass AND conname = 'uitrol_voorbereiders_gebruikt_aantal_check') THEN
    ALTER TABLE app.uitrol_voorbereiders
      ADD CONSTRAINT uitrol_voorbereiders_gebruikt_aantal_check
      CHECK (gebruikt_aantal >= 0);
  END IF;
END $$;

ALTER TABLE app.uitrol_voorstellen
  ADD COLUMN IF NOT EXISTS ingehaald_door_versie text;

ALTER TABLE app.uitrol_voorstellen
  DROP CONSTRAINT IF EXISTS uitrol_voorstellen_status_check;

ALTER TABLE app.uitrol_voorstellen
  ADD CONSTRAINT uitrol_voorstellen_status_check
  CHECK (status IN (
    'uploaden',
    'wacht-op-goedkeuring',
    'goedgekeurd',
    'geinstalleerd',
    'mislukt',
    'geweigerd',
    'afgewezen',
    'verlopen',
    'afgebroken',
    'ingehaald'
  ));
