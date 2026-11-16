-- 0295 (MAILAI-003, 16.11.2026): спільні рушії ШІ «для всіх» у пошті та лічильник використання рушіїв.
-- Власник сайту вмикає рушій (ключ постачальника, LibreTranslate або Ollama на власному сервері) окремо від особистих ключів.
-- Типово вимкнено (aan = false). Значення ключа тут НЕМАЄ: воно у сховищі ключів власника під назвою «gedeeld-<id>».
-- Тексту листів тут немає й не буде: лише число запитів на людину, рушій і день.
-- Пише й читає лише системна роль (як 0043); роль застосунку рядків не бачить.
-- Gedeelde AI-motoren en gebruiksteller; alleen de systeemrol leest en schrijft. Herhaalbaar (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS app.ai_dienst_motoren (
  id               text        PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  soort            text        NOT NULL CHECK (soort IN ('aanbieder', 'libretranslate', 'ollama')),
  naam             text        NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 80),
  aanbieder        text        CHECK (aanbieder IS NULL OR aanbieder IN ('anthropic', 'gemini', 'openai', 'grok', 'autoclaw')),
  url              text        CHECK (url IS NULL OR (char_length(url) <= 300 AND url ~ '^https?://')),
  model            text        CHECK (model IS NULL OR char_length(model) <= 120),
  aan              boolean     NOT NULL DEFAULT false,
  limiet_per_dag   integer     NOT NULL DEFAULT 30 CHECK (limiet_per_dag BETWEEN 1 AND 5000),
  heeft_sleutel    boolean     NOT NULL DEFAULT false,
  eigenaar_user_id text        NOT NULL,
  bijgewerkt_door  text,
  bijgewerkt_op    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_dienst_motoren_vorm CHECK (
    (soort = 'aanbieder' AND aanbieder IS NOT NULL AND url IS NULL)
    OR (soort <> 'aanbieder' AND url IS NOT NULL AND aanbieder IS NULL AND heeft_sleutel = false)
  )
);
ALTER TABLE app.ai_dienst_motoren ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_dienst_motoren_geen_app ON app.ai_dienst_motoren;
CREATE POLICY ai_dienst_motoren_geen_app ON app.ai_dienst_motoren
  USING (current_user::text <> 'mijnruimte_app')
  WITH CHECK (current_user::text <> 'mijnruimte_app');

-- Лічильник: motor = «dienst:<id>» (спільний рушій) або «sleutel:<постачальник>» (особистий ключ людини).
CREATE TABLE IF NOT EXISTS app.ai_motor_gebruik (
  user_id   text    NOT NULL,
  motor     text    NOT NULL CHECK (motor ~ '^(dienst|sleutel):[a-z][a-z0-9-]{1,30}$'),
  dag       date    NOT NULL,
  aantal    integer NOT NULL DEFAULT 0 CHECK (aantal >= 0),
  geweigerd integer NOT NULL DEFAULT 0 CHECK (geweigerd >= 0),
  PRIMARY KEY (user_id, motor, dag)
);
CREATE INDEX IF NOT EXISTS ai_motor_gebruik_dag_idx ON app.ai_motor_gebruik (dag, motor);
ALTER TABLE app.ai_motor_gebruik ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_motor_gebruik_geen_app ON app.ai_motor_gebruik;
CREATE POLICY ai_motor_gebruik_geen_app ON app.ai_motor_gebruik
  USING (current_user::text <> 'mijnruimte_app')
  WITH CHECK (current_user::text <> 'mijnruimte_app');

-- Автоматичне отримання орієнтовних цін (OpenRouter, загальнодоступний перелік моделей; жодних даних користувача не надсилається).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('ai-prijzen-ophalen', 'Орієнтовні ціни рушіїв ШІ в пошті раз на добу беруться із загальнодоступного переліку моделей OpenRouter (дані користувачів не надсилаються). UIT = лише посилання на офіційні сторінки цін.', true, true)
ON CONFLICT (sleutel) DO NOTHING;
