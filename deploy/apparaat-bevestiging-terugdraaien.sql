-- Terugdraaien van APPARAAT-001 (alleen met de vlag `apparaat-bevestiging-v1` UIT en na een reservekopie).
-- Відкат ПІДТВЕРДЖЕННЯ З ІНШОГО ПРИСТРОЮ (лише з вимкненим прапорцем і після резервної копії).
BEGIN;
DROP TABLE IF EXISTS app.bevestigingen_apparaat, app.apparaat_instellingen, app.apparaat_voorkeuren;
ALTER TABLE app.tg_bevestigingen DROP COLUMN IF EXISTS soort, DROP COLUMN IF EXISTS kandidaten, DROP COLUMN IF EXISTS juist;
DELETE FROM app.feature_flags WHERE sleutel = 'apparaat-bevestiging-v1';
DELETE FROM app.schema_migrations WHERE version IN ('0204_apparaat_bevestiging');
COMMIT;
