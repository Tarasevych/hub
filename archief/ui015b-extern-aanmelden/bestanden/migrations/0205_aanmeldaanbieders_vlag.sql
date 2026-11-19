-- 0205 — UI-015B (30.10.2026): vlag voor aanmelden met externe aanbieders (Microsoft, Apple, Discord, Telegram).
-- UIT = niets verandert: geen knoppen, geen koppel- of aanmeldroutes (die antwoorden dan «uitgeschakeld»).
-- Ook met de vlag AAN werkt een aanbieder pas als (1) zijn instellingen op de server staan (zie ІНСТРУКЦІЯ-UI015B.md) en
-- (2) het aanmeldbeleid (beheer → access_method_policy_v1) hem toestaat. Terugdraaien: DELETE FROM app.feature_flags WHERE sleutel = 'aanmeldaanbieders-v1';
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('aanmeldaanbieders-v1', 'Aanmelden en koppelen met Microsoft, Apple, Discord en Telegram (alleen voor een al gekoppeld account; koppelen/losmaken met bevestiging). Werkt per aanbieder pas als de sleutels op de server staan. UIT = alleen de huidige aanmeldmethoden.', false, false)
ON CONFLICT (sleutel) DO NOTHING;
