-- Terugdraaien van TELEGRAM-AANMELDEN v1 (alleen met de vlag `telegram-aanmelden-v1` UIT en na een reservekopie).
-- Відкат ВХОДУ ЧЕРЕЗ TELEGRAM v1 (лише з вимкненим прапорцем і після резервної копії).
BEGIN;
DROP TABLE IF EXISTS app.tg_koppelingen, app.tg_vingerafdruk_historie, app.tg_wijzigingen, app.tg_koppel_verzoeken, app.tg_inlog_verzoeken,
  app.tg_bevestigingen, app.tg_knoppen, app.tg_updates, app.tg_eenmalig, app.tg_chats, app.tg_instellingen, app.tg_acties, app.tg_matrix,
  app.tg_geheime_codes, app.tg_status, app.tg_gebeurtenissen, app.tg_geblokkeerd, app.aanmeld_plaatsing;
DELETE FROM app.schema_migrations WHERE version IN ('0202_telegram_aanmelden_tabellen', '0203_aanmeld_plaatsing', '0209_telegram_aanmelden_context');
UPDATE app.feature_flags SET aan = false, standaard = false WHERE sleutel = 'telegram-aanmelden-v1';
COMMIT;
