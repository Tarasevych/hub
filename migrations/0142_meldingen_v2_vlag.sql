-- 0142 — Vlag «meldingen-v2» (29.10.2026, UI-007): het nieuwe, compacte meldingencentrum (src/meldingen/v2) en de
-- leveringsregels op de server (backend/meldingen-regels.ts). Standaard UIT: zonder vlag precies het oude paneel.
-- Geen schemawijziging; alleen de vlag. Idempotent. Terugdraaien: DELETE FROM app.feature_flags WHERE sleutel = 'meldingen-v2';
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('meldingen-v2',
  'Новий центр сповіщень: компактний список, групування повторів, правила доставки й «Не турбувати». Nieuw meldingencentrum. Дані ті самі.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
