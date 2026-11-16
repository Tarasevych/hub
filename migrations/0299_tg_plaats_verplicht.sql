-- 0299 — TELEGRAM-004 (16.11.2026, eis van de eigenaar): preventieve bescherming per account — «Вимагати місце пристрою».
-- Staat de eis AAN, dan kan aanmelden met Telegram bij dat account alleen als de vragende browser de plaats van het toestel
-- deelde (geolocatie, 0298). Standaard UIT; de gebruiker zet hem bewust aan en kan hem in dezelfde instellingen weer uitzetten.
-- Andere aanmeldmethoden (toegangssleutel, Google, wachtwoord) vallen hier NIET onder: dat is de noodweg als een toestel
-- geen plaats kan geven. Herhaalbaar (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).

ALTER TABLE app.tg_matrix ADD COLUMN IF NOT EXISTS geo_verplicht boolean NOT NULL DEFAULT false;
-- true = het gekozen account eist de plaats en de browser gaf die nog niet → de site vraagt er nu nadrukkelijk om.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_vereist boolean NOT NULL DEFAULT false;
-- Nieuwe reden voor de oude knop-weg (zonder venster): de plaats ontbrak.
ALTER TABLE app.tg_inlog_verzoeken DROP CONSTRAINT IF EXISTS tg_inlog_verzoeken_reden_check;
ALTER TABLE app.tg_inlog_verzoeken ADD CONSTRAINT tg_inlog_verzoeken_reden_check
  CHECK (reden IN ('','niet-ik','passkey-nodig','niet-gekoppeld','gepauzeerd','apparaat-geblokkeerd','fout-symbool','code-fout','plaats-nodig'));
