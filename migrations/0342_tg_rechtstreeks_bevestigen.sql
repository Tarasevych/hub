-- 0342 — HERSTEL-001 (TG-2, 25.11.2026): необов’язкове пряме підтвердження входу в боті Telegram без переходу за посиланням із сайту.
-- За замовчуванням ВИМКНЕНО (false) для захисту від телефонних шахраїв; вмикається лише самим власником облікового запису
-- у «Способах входу → Telegram» із підтвердженням доступу. Повторостійка й сумісна зі старішими версіями коду.
-- Nederlands (nl): optionele rechtstreekse aanmeldbevestiging in de Telegram-bot zonder verplichte sitelink, standaard UIT (false).

ALTER TABLE app.tg_matrix ADD COLUMN IF NOT EXISTS rechtstreeks_bevestigen boolean NOT NULL DEFAULT false;
