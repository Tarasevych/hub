-- 0305 (UPD-012, 20.11.2026): підтримка зовнішніх і власних служб перекладу (Google Translate, DeepL, власний захищений вузол)
-- та вибору режиму приватності (privacy_modus) у таблиці app.ai_dienst_motoren.
-- Повністю зворотно сумісна та повторювана: лише розширення CHECK та додавання колонки зі значенням за замовчуванням;
-- стара версія коду працює без змін. Жодних колонок *_door та жодних руйнівних команд.
-- Uitbreiding van app.ai_dienst_motoren met vertaaldiensten en privacymodus; volledig achterwaarts compatibel en herhaalbaar.

ALTER TABLE app.ai_dienst_motoren
  ADD COLUMN IF NOT EXISTS privacy_modus text NOT NULL DEFAULT 'extern-gezuiverd';

ALTER TABLE app.ai_dienst_motoren
  DROP CONSTRAINT IF EXISTS ai_dienst_motoren_privacy_modus_check;
ALTER TABLE app.ai_dienst_motoren
  ADD CONSTRAINT ai_dienst_motoren_privacy_modus_check
    CHECK (privacy_modus IN ('lokaal-alleen', 'eigen-server', 'extern-gezuiverd', 'extern-volledig'));

ALTER TABLE app.ai_dienst_motoren
  DROP CONSTRAINT IF EXISTS ai_dienst_motoren_soort_check;
ALTER TABLE app.ai_dienst_motoren
  ADD CONSTRAINT ai_dienst_motoren_soort_check
    CHECK (soort IN ('aanbieder', 'libretranslate', 'ollama', 'google-translate', 'deepl', 'eigen-vertaal-knoop'));

ALTER TABLE app.ai_dienst_motoren
  DROP CONSTRAINT IF EXISTS ai_dienst_motoren_vorm;
ALTER TABLE app.ai_dienst_motoren
  ADD CONSTRAINT ai_dienst_motoren_vorm CHECK (
    (soort = 'aanbieder' AND aanbieder IS NOT NULL AND url IS NULL)
    OR (soort IN ('libretranslate', 'ollama') AND url IS NOT NULL AND aanbieder IS NULL AND heeft_sleutel = false)
    OR (soort IN ('google-translate', 'deepl') AND aanbieder IS NULL)
    OR (soort = 'eigen-vertaal-knoop' AND url IS NOT NULL AND aanbieder IS NULL)
  );
