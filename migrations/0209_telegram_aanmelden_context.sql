-- 0209 — ВХІД ЧЕРЕЗ TELEGRAM v1 (контекст безпеки, стан збереження облікового запису та керування сеансами):
-- розширення таблиць app.tg_inlog_verzoeken та app.tg_koppelingen повними реквізитами пристрою, оглядача,
-- операційної системи, IP-адреси, країни/місця, цільової служби, стану «Зберегти обліковий запис», перевіреної
-- адреси повернення та позначки відкликання сеансу з чату бота. Повторювана міграція (ADD COLUMN IF NOT EXISTS).
-- Політики захисту на рівні рядків (RLS) уже ввімкнено у міграції 0202.

ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS ip                    text        NOT NULL DEFAULT '' CHECK (length(ip) <= 64);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS locatie               text        NOT NULL DEFAULT '' CHECK (length(locatie) <= 160);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS browser               text        NOT NULL DEFAULT '' CHECK (length(browser) <= 80);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS os                    text        NOT NULL DEFAULT '' CHECK (length(os) <= 80);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS apparaat_type         text        NOT NULL DEFAULT '' CHECK (length(apparaat_type) <= 32);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS dienst                text        NOT NULL DEFAULT '' CHECK (length(dienst) <= 32);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS onthouden             boolean     NOT NULL DEFAULT true;
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS terug_adres           text        NOT NULL DEFAULT '' CHECK (length(terug_adres) <= 500);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS sessie_ingetrokken_op timestamptz;

ALTER TABLE app.tg_koppelingen ADD COLUMN IF NOT EXISTS gekoppeld_ip       text NOT NULL DEFAULT '' CHECK (length(gekoppeld_ip) <= 64);
ALTER TABLE app.tg_koppelingen ADD COLUMN IF NOT EXISTS gekoppeld_locatie  text NOT NULL DEFAULT '' CHECK (length(gekoppeld_locatie) <= 160);
ALTER TABLE app.tg_koppelingen ADD COLUMN IF NOT EXISTS gekoppeld_apparaat text NOT NULL DEFAULT '' CHECK (length(gekoppeld_apparaat) <= 120);
ALTER TABLE app.tg_koppelingen ADD COLUMN IF NOT EXISTS laatst_ip          text NOT NULL DEFAULT '' CHECK (length(laatst_ip) <= 64);
ALTER TABLE app.tg_koppelingen ADD COLUMN IF NOT EXISTS laatst_locatie     text NOT NULL DEFAULT '' CHECK (length(laatst_locatie) <= 160);
ALTER TABLE app.tg_koppelingen ADD COLUMN IF NOT EXISTS laatst_apparaat    text NOT NULL DEFAULT '' CHECK (length(laatst_apparaat) <= 120);

-- Увімкнення прапорця можливості типово (аварійний вимикач адміністратора керується окремо через app.tg_instellingen.aan).
UPDATE app.feature_flags
   SET aan = true, standaard = true
 WHERE sleutel = 'telegram-aanmelden-v1';
