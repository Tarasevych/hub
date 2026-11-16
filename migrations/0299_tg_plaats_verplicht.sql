-- 0299 — TELEGRAM-004 (16.11.2026, eis van de eigenaar): preventieve bescherming per account — «Вимагати місце пристрою».
-- De gebruiker kiest ZELF per aanmeldmethode (Telegram, toegangssleutel, wachtwoord, Google, Microsoft, Discord, Apple) of
-- aanmelden bij zijn account alleen lukt als de vragende browser de plaats van het toestel deelde (geolocatie, 0298).
-- Standaard staat de eis bij ELKE methode UIT; aanzetten en uitzetten gebeurt in dezelfde instellingen. Niets wordt hard
-- verboden: wie de eis bij alle methoden aanzet, kan zich alleen nog aanmelden vanaf een toestel dat de plaats geeft —
-- dat staat met «!» in de uitleg. Herhaalbaar (IF NOT EXISTS / DROP ... IF EXISTS).

ALTER TABLE app.tg_matrix ADD COLUMN IF NOT EXISTS plaats_eis text[] NOT NULL DEFAULT '{}';
ALTER TABLE app.tg_matrix DROP CONSTRAINT IF EXISTS tg_matrix_plaats_eis_check;
ALTER TABLE app.tg_matrix ADD CONSTRAINT tg_matrix_plaats_eis_check
  CHECK (plaats_eis <@ ARRAY['telegram','passkey','password','google','microsoft','discord','apple']::text[]);
-- Eerste vorm van deze (nog niet uitgebrachte) migratie had één schakelaar alleen voor Telegram: overnemen en opruimen.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'tg_matrix' AND column_name = 'geo_verplicht') THEN
    UPDATE app.tg_matrix SET plaats_eis = ARRAY['telegram'] WHERE geo_verplicht AND plaats_eis = '{}';
    ALTER TABLE app.tg_matrix DROP COLUMN geo_verplicht;
  END IF;
END $$;
-- true = het gekozen account eist de plaats en de browser gaf die nog niet → de site vraagt er nu nadrukkelijk om.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_vereist boolean NOT NULL DEFAULT false;
-- Nieuwe reden voor de oude knop-weg (zonder venster): de plaats ontbrak.
ALTER TABLE app.tg_inlog_verzoeken DROP CONSTRAINT IF EXISTS tg_inlog_verzoeken_reden_check;
ALTER TABLE app.tg_inlog_verzoeken ADD CONSTRAINT tg_inlog_verzoeken_reden_check
  CHECK (reden IN ('','niet-ik','passkey-nodig','niet-gekoppeld','gepauzeerd','apparaat-geblokkeerd','fout-symbool','code-fout','plaats-nodig'));
