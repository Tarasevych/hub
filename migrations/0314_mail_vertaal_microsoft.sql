-- 0314 (CONSOL-001 / Віха M3, 23.11.2026): розширення дозволених видів рушіїв перекладу в таблиці app.ai_dienst_motoren
-- видом 'microsoft-translate' (Microsoft Azure AI Translator). Повністю адитивно й повторювано: стара версія коду працює без змін.
-- Additieve en herhaalbare uitbreiding van CHECK-beperkingen op app.ai_dienst_motoren voor 'microsoft-translate'.

ALTER TABLE app.ai_dienst_motoren
  DROP CONSTRAINT IF EXISTS ai_dienst_motoren_soort_check;
ALTER TABLE app.ai_dienst_motoren
  ADD CONSTRAINT ai_dienst_motoren_soort_check
    CHECK (soort IN ('aanbieder', 'libretranslate', 'ollama', 'google-translate', 'deepl', 'microsoft-translate', 'eigen-vertaal-knoop'));

ALTER TABLE app.ai_dienst_motoren
  DROP CONSTRAINT IF EXISTS ai_dienst_motoren_vorm;
ALTER TABLE app.ai_dienst_motoren
  ADD CONSTRAINT ai_dienst_motoren_vorm CHECK (
    (soort = 'aanbieder' AND aanbieder IS NOT NULL AND url IS NULL)
    OR (soort IN ('libretranslate', 'ollama') AND url IS NOT NULL AND aanbieder IS NULL AND heeft_sleutel = false)
    OR (soort IN ('google-translate', 'deepl', 'microsoft-translate') AND aanbieder IS NULL)
    OR (soort = 'eigen-vertaal-knoop' AND url IS NOT NULL AND aanbieder IS NULL)
  );
