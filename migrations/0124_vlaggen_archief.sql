-- 0124 — Archief voor functieschakelaars (28.10.2026). Alleen een WEERGAVE-markering: een schakelaar die voor iedereen aan staat
-- en klaar is, verhuist in het venster «Перемикачі функцій» naar het tabblad «Архів». De berekening (shared/vlaggen.ts, evalueer)
-- leest deze kolom NIET: gearchiveerd of niet, de waarde voor gebruikers blijft precies hetzelfde. Standaard NULL = niet gearchiveerd.
-- Idempotent.
ALTER TABLE app.feature_flags ADD COLUMN IF NOT EXISTS gearchiveerd_op timestamptz NULL;
