-- 0201 — TELEGRAM-AANMELDEN v1 (09.11.2026): alleen de functievlag. Standaard UIT: met de vlag uit gedraagt de site zich
-- exact als 20261109-105221 (geen Telegram-knop, de bot-routes antwoorden «niet beschikbaar», de statusdienst slaapt).
-- Bouwt voort op `aanmeldmethoden-vnext` (0198) en backend/aanmeld-koppel.ts; vervangt die niet.
-- 0201 — ВХІД ЧЕРЕЗ TELEGRAM v1: лише прапорець, типово вимкнений; з вимкненим прапорцем сайт поводиться як 20261109-105221.
-- omschrijving ≤ 300 tekens (CHECK in 0038_feature_flags.sql). ON CONFLICT DO NOTHING bewaart een bewuste keuze van de eigenaar.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('telegram-aanmelden-v1',
  'Вхід і підтвердження через Telegram: бот, картки, зміни, таблиця підтверджень, таємний код, служба стану. | Aanmelden en bevestigen via Telegram: bot, kaarten, wijzigingen, bevestigingstabel, geheime code, statusdienst.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
