-- 0341 — Увімкнення прапорця капсульного вигляду сповіщень та квитанцій доставки й прочитання (HERSTEL-001, 24.11.2026).
-- 0341 — Inschakeling van functievlag voor capsuleweergave van meldingen en aflever- en leesbewijzen (HERSTEL-001, 24.11.2026).
UPDATE app.feature_flags
SET aan = true,
    standaard = true
WHERE sleutel = 'melding-kapsel-aflevering-v1'
  AND gearchiveerd_op IS NULL;
