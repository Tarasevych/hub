-- 0326 — Прапорець вибору цільового під’єднаного пристрою у вікні розмови ШІ (23.11.2026).
-- 0326 — Functievlag voor keuze van het verbonden doelapparaat in het AI-gespreksvenster (23.11.2026).
-- Нові таблиці не створюються; опис <= 300 символів; початковий стан вимкнено за правилом VLAG-001.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'ai-chat-apparaatkeuze-v1',
  'Вибір цільового під’єднаного пристрою у вікні розмови ШІ для команд на комп’ютері. | Keuze van het verbonden doelapparaat in het AI-gespreksvenster voor opdrachten op de computer.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
