-- 0134 — Vlag «bijlage-viewer-v2» (29.10.2026): de vernieuwde bijlageviewer in mail.* (src/bijlage-v2). Standaard UIT: zonder vlag
-- precies de oude kop en PDF-balk. Geen schemawijziging; alleen de vlag. Idempotent.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('bijlage-viewer-v2',
  'Новий перегляд вкладень у пошті: компактні кнопки, документ на весь простір. Nieuwe bijlageviewer in mail. Функції ті самі.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
