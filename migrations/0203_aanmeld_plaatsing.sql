-- 0203 — AANMELD-PLAATSING v1 (TELEGRAM-001): waar elke aanmeldmethode op het aanmeldscherm staat (hoofdscherm, «Інші способи
-- входу» of verborgen) en in welke volgorde. Eén rij (id = 1). Geen rij = het gedrag van vóór deze migratie (Google en Telegram op
-- het hoofdscherm, de rest onder «Інші способи входу»). Alleen via de systeemrol (zelfde patroon als 0202); de beheerroute vraagt
-- eigenaar/beheerder + verse toegangssleutel en schrijft het journaal. Herhaalbaar (IF NOT EXISTS).
-- Розміщення способів входу на сторінці входу. Відкат: deploy/telegram-aanmelden-terugdraaien.sql.
CREATE TABLE IF NOT EXISTS app.aanmeld_plaatsing (
  id           smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  plaatsing    jsonb       NOT NULL CHECK (jsonb_typeof(plaatsing) = 'object'),
  door         text        NOT NULL DEFAULT '',
  gewijzigd_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.aanmeld_plaatsing ENABLE ROW LEVEL SECURITY;
