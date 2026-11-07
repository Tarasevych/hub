-- 0043: доступність ШІ для всього сайту (shared/ai-agent-bord.ts).
-- Відсутній рядок = увімкнено. Явне false = вимкнено для кожного приватного користувача.
-- Це стеля, не право: рядок ніколи не відкриває технічний простір. Технічні підключення цими
-- перемикачами не керуються. Підписана політика ШІ лишається вищою стелею.
-- Пише лише системна роль. Роль застосунку рядків не бачить.
CREATE TABLE IF NOT EXISTS app.ai_site_schakelaars (
  sleutel        text        PRIMARY KEY CHECK (sleutel ~ '^(agent:(grok|claude|chatgpt|gemini|copilot|cursor|antigravity|autoclaw)|methode:(mcp|token)|cap:[a-z][a-z0-9.]{1,40})$'),
  aan            boolean     NOT NULL,
  gewijzigd_door text,
  gewijzigd_op   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.ai_site_schakelaars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_site_schakelaars_geen_app ON app.ai_site_schakelaars;
CREATE POLICY ai_site_schakelaars_geen_app ON app.ai_site_schakelaars
  USING (current_user::text <> 'mijnruimte_app')
  WITH CHECK (current_user::text <> 'mijnruimte_app');

-- Вимкнення можливості для одного користувача й одного ШІ (лише приватний простір).
-- Відсутній рядок = увімкнено. Стельовий перемикач сайту все одно сильніший.
CREATE TABLE IF NOT EXISTS app.ai_gebruiker_caps (
  user_id      text        NOT NULL,
  klant        text        NOT NULL CHECK (klant IN ('grok', 'claude', 'chatgpt', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw')),
  cap          text        NOT NULL CHECK (cap ~ '^[a-z][a-z0-9.]{1,40}$'),
  aan          boolean     NOT NULL,
  gewijzigd_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, klant, cap)
);
ALTER TABLE app.ai_gebruiker_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_gebruiker_caps_geen_app ON app.ai_gebruiker_caps;
CREATE POLICY ai_gebruiker_caps_geen_app ON app.ai_gebruiker_caps
  USING (current_user::text <> 'mijnruimte_app')
  WITH CHECK (current_user::text <> 'mijnruimte_app');
