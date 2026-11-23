-- 0328 — Прапорець живого стану джерел на панелі знарядь ШІ (23.11.2026).
-- 0328 — Functievlag voor actuele koppelingsstatus van bronnen in het AI-hulpmiddelenpaneel (23.11.2026).
-- Нові таблиці не створюються; опис <= 300 символів; початковий стан вимкнено за правилом VLAG-001.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'mcp-bronnen-live-v1',
  'Живий стан підключення внутрішнього диска сайту, пошти Microsoft Outlook та сховища OneDrive на панелі знарядь ШІ. | Actuele koppelingsstatus van de interne siteschijf, Microsoft Outlook-post en OneDrive-opslag in het AI-hulpmiddelenpaneel.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
