-- 0337 — Увімкнення прапорця тривалого збереження доказів і хронології збоїв зв’язку з сервером (HERSTEL-001, 23.11.2026).
-- 0337 — Inschakeling van functievlag voor duurzame opslag van bewijs en tijdlijn van verbindingsstoringen (HERSTEL-001, 23.11.2026).
UPDATE app.feature_flags
SET aan = true,
    standaard = true
WHERE sleutel = 'melding-verbinding-bewijs-v1'
  AND gearchiveerd_op IS NULL;
