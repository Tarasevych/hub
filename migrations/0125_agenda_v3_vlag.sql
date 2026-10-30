-- 0125 — Vlag «agenda-v3» (28.10.2026): de nieuwe agendapagina (src/agenda/v3). Standaard UIT: zonder vlag precies de oude agenda.
-- Geen schemawijziging; alleen de vlag. Idempotent.
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('agenda-v3',
  'Новий календар: великий календар, мінікалендар і зручний вигляд на телефоні. Nieuwe agenda. Події та дозволи ті самі.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
