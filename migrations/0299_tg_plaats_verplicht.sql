-- 0299 — TELEGRAM-004 (16.11.2026, eis van de eigenaar): preventieve bescherming per account — «Вимагати місце пристрою».
-- De gebruiker kiest ZELF per aanmeldmethode (Telegram, toegangssleutel, wachtwoord, Google, Microsoft, Discord, Apple) of
-- aanmelden bij zijn account alleen lukt als de vragende browser de plaats van het toestel deelde (geolocatie, 0298).
-- Standaard staat de eis bij ELKE methode UIT; aanzetten en uitzetten gebeurt in dezelfde instellingen. Niets wordt hard
-- verboden: wie de eis bij alle methoden aanzet, kan zich alleen nog aanmelden vanaf een toestel dat de plaats geeft —
-- dat staat met «!» in de uitleg. Herhaalbaar (IF NOT EXISTS; een CHECK wordt vervangen door dezelfde of een ruimere).

ALTER TABLE app.tg_matrix ADD COLUMN IF NOT EXISTS plaats_eis text[] NOT NULL DEFAULT '{}';
ALTER TABLE app.tg_matrix DROP CONSTRAINT IF EXISTS tg_matrix_plaats_eis_check;
ALTER TABLE app.tg_matrix ADD CONSTRAINT tg_matrix_plaats_eis_check
  CHECK (plaats_eis <@ ARRAY['telegram','passkey','password','google','microsoft','discord','apple']::text[]);
-- UPD-003 (17.11.2026): hier stond een blok dat een kolom geo_verplicht uit een nooit uitgebrachte eerste vorm overnam en verwijderde.
-- Die kolom bestond in geen enkele uitgave (ook niet in 20261116-031827), dus het blok deed op elke server niets — maar het was een
-- verwijdering van een kolom, en een migratie wordt bij terugdraaien niet teruggedraaid. Weg: deze migratie voegt nu alleen toe (kolommen met
-- standaardwaarde, ruimere CHECK), zodat de vorige versie van de code met het nieuwe schema blijft werken.
-- Міграція лише додає: стовпці зі значенням за замовчуванням і ширша перевірка — стара версія коду працює з новою схемою.
-- true = het gekozen account eist de plaats en de browser gaf die nog niet → de site vraagt er nu nadrukkelijk om.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS geo_vereist boolean NOT NULL DEFAULT false;
-- Nieuwe reden voor de oude knop-weg (zonder venster): de plaats ontbrak.
ALTER TABLE app.tg_inlog_verzoeken DROP CONSTRAINT IF EXISTS tg_inlog_verzoeken_reden_check;
ALTER TABLE app.tg_inlog_verzoeken ADD CONSTRAINT tg_inlog_verzoeken_reden_check
  CHECK (reden IN ('','niet-ik','passkey-nodig','niet-gekoppeld','gepauzeerd','apparaat-geblokkeerd','fout-symbool','code-fout','plaats-nodig'));
