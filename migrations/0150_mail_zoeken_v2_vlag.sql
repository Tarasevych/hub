-- 0150 — Vlag «mail-zoeken-v2» (29.10.2026, UI-009): één compact zoek- en filterpaneel in Mail. Standaard UIT: zonder vlag precies het oude filterpaneel en «Ще умови».
-- Geen schemawijziging; alleen de vlag. Idempotent.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('mail-zoeken-v2',
  'Новий пошук у Пошті: одна компактна панель, згруповані умови, пошук лише кнопкою «Шукати». Nieuw zoekpaneel in Mail. Criteria en resultaten blijven gelijk.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
