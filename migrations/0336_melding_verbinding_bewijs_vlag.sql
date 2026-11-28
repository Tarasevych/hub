-- 0336 — Прапорець тривалого збереження доказів і хронології збоїв зв’язку з сервером (HERSTEL-001, 23.11.2026).
-- 0336 — Functievlag voor duurzame opslag van bewijs en tijdlijn van verbindingsstoringen (HERSTEL-001, 23.11.2026).
-- Нові таблиці не створюються; опис <= 300 символів; початковий стан вимкнено за правилом VLAG-001.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'melding-verbinding-bewijs-v1',
  'Тривале збереження доказів і хронології збоїв зв’язку з сервером у центрі сповіщень та журналі бази даних і оновлена картка стану зв’язку. | Duurzame opslag van bewijs en tijdlijn van verbindingsstoringen in het meldingencentrum en databaselogboek en vernieuwde verbindingskaart.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
