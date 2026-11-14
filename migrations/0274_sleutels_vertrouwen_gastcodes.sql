-- 0274 — IDENTITEIT-015 (крок «sleutels-gasten», етап 3.4 і 2.5 плану): довіра до ключа доступу і гостьові коди для інших.
-- Vertrouwen van een toegangssleutel en gastcodes voor goedgekeurde accounts die niet de eigenaar van de site zijn.
--
-- 1. app.passkeys: «Довірений» — окреме рішення людини про КОНКРЕТНИЙ ключ (пристрій або обладнання), а не наявність ключа.
--    vertrouwd_op    — коли людина позначила ключ довіреним (NULL = не довірений; так і для всіх старих рядків — сумісно);
--    vertrouwd_wie  — хто позначив (адреса або id облікового запису; власник ключа, бо RLS 0023 пускає лише до своїх рядків).
--                     Не «_door»: така кінцівка в реєстрі стирання облікового запису означає «інший акаунт»; рядок і так стирається за user_id;
--    vertrouwd_sessie — коротка частина id сеансу, у якому дали довіру (для журналу «хто/коли/звідки»).
--    Сайт НЕ перевіряє виробника обладнання (attestation 'none' — backend/toegangssleutels.ts); довіра нових прав не дає.
--    RLS не змінюється: політика passkeys_eigen (0023) уже обмежує рядки власником ключа для app-ролі.
-- 2. Прапорець gastcodes-iedereen: «Тільки я» (лише власник сайту; без рядка власника = вимкнено для всіх, крім власника сайту,
--    якого сервер пускає завжди). Увімкнення для інших дає схваленим обліковим записам «Коди доступу для інших» на власні дані.
--    ON CONFLICT DO NOTHING зберігає свідомий вибір власника під час повторного запуску.
-- Повторюване: ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING.

ALTER TABLE app.passkeys ADD COLUMN IF NOT EXISTS vertrouwd_op timestamptz;
ALTER TABLE app.passkeys ADD COLUMN IF NOT EXISTS vertrouwd_wie text;
ALTER TABLE app.passkeys ADD COLUMN IF NOT EXISTS vertrouwd_sessie text;

DO $passkeys_vertrouwen$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passkeys_vertrouwd_wie_lengte') THEN
    ALTER TABLE app.passkeys ADD CONSTRAINT passkeys_vertrouwd_wie_lengte CHECK (vertrouwd_wie IS NULL OR length(vertrouwd_wie) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passkeys_vertrouwd_sessie_lengte') THEN
    ALTER TABLE app.passkeys ADD CONSTRAINT passkeys_vertrouwd_sessie_lengte CHECK (vertrouwd_sessie IS NULL OR length(vertrouwd_sessie) <= 40);
  END IF;
  -- Ті самі права app-ролі, що й на інші стовпці (RLS 0023 і далі вирішує, які рядки).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.passkeys TO mijnruimte_app;
  END IF;
END
$passkeys_vertrouwen$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers)
VALUES
  ('gastcodes-iedereen',
   'Коди доступу для гостей (лише перегляд власних даних) і для схвалених облікових записів, не лише власника сайту. | Gastcodes ook voor goedgekeurde accounts, niet alleen de eigenaar.',
   true, false, 0, ARRAY(SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY seq LIMIT 1))
ON CONFLICT (sleutel) DO NOTHING;
