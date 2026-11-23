-- 0329 — Прапорець розбору посилання на тему групи Telegram і пояснення випуску (23.11.2026).
-- 0329 — Functievlag voor ontleding van de Telegram-topiclink en tweetalige uitgave-uitleg (23.11.2026).
-- Нові таблиці не створюються; опис <= 300 символів; початковий стан вимкнено за правилом VLAG-001.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'uitrol-telegram-koppeling-v1',
  'Розбір посилання на тему групи Telegram, пробний файл зв’язку та двомовне пояснення випуску в архіві оновлень. | Ontleding van de Telegram-topiclink, proefbestand bij verbindingstest en tweetalige uitgave-uitleg in het updatearchief.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
