-- 0327 — Прапорець трьох областей машинного читання платформи програмних інтерфейсів (23.11.2026).
-- 0327 — Functievlag voor drie machineleesscopes op het programmaverbindingsplatform (23.11.2026).
-- Нові таблиці не створюються; опис <= 300 символів; початковий стан вимкнено за правилом VLAG-001.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'api-platform-lees-v1',
  'Три області машинного читання (пошта, календар, метадані файлів) у ключах доступу платформи програмних інтерфейсів. | Drie machineleesscopes (e-mail, agenda, bestandsmetadata) in toegangssleutels van het programmaverbindingsplatform.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
