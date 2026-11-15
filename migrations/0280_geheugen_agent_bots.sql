-- 0280 (stroom-geheugen): Окремий Telegram-бот для кожного ШІ-агента та надійна ідемпотентна черга доставлення й передавання завдань.
-- Обидві таблиці працюють під суворим RLS (ізоляція user_id = app.huidige_gebruiker() та ruimte 'prive' | 'technisch'):
--   1) app.geheugen_agent_bots          — реєстр ботів по агентах (токен у sleutel_versleuteld під DEK/серверним ключем, без додаткових прав агента).
--   2) app.geheugen_telegram_bezorging  — черга доставлення, передавання завдань за taak_id, ланцюжки vorige_bezorging_id та захист від дублікатів.

CREATE TABLE IF NOT EXISTS app.geheugen_agent_bots (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    text        NOT NULL CHECK (user_id <> ''),
  ruimte                     text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  agent_slug                 text        NOT NULL CHECK (agent_slug ~ '^[a-z0-9][a-z0-9._:-]{1,47}$'),
  dienst_naam                text        NOT NULL DEFAULT '' CHECK (char_length(dienst_naam) <= 80),
  weergave_naam              text        NOT NULL DEFAULT '' CHECK (char_length(weergave_naam) <= 120),
  beschrijving               text        NOT NULL DEFAULT '' CHECK (char_length(beschrijving) <= 500),
  avatar_kleur               text        NOT NULL DEFAULT '' CHECK (char_length(avatar_kleur) <= 32),
  sleutel_versleuteld        text        NOT NULL DEFAULT '',
  sleutel_naam               text        NOT NULL DEFAULT '' CHECK (char_length(sleutel_naam) <= 80),
  sleutel_aanwezig           boolean     NOT NULL DEFAULT false,
  bot_id                     text        NOT NULL DEFAULT '' CHECK (char_length(bot_id) <= 40),
  bot_username               text        NOT NULL DEFAULT '' CHECK (char_length(bot_username) <= 80),
  bot_naam                   text        NOT NULL DEFAULT '' CHECK (char_length(bot_naam) <= 160),
  chat_id                    text        NOT NULL DEFAULT '' CHECK (char_length(chat_id) <= 80),
  thread_id                  bigint,
  toegestane_acties          text[]      NOT NULL DEFAULT '{}'::text[] CHECK (coalesce(array_length(toegestane_acties, 1), 0) <= 32),
  toegestane_bericht_soorten text[]      NOT NULL DEFAULT ARRAY['gebeurtenis','besluit','overdracht','rapport','bestand','gesprek']::text[],
  status                     text        NOT NULL DEFAULT 'in_afwachting' CHECK (status IN ('in_afwachting', 'actief', 'gepauzeerd', 'ingetrokken')),
  kan_publiceren             boolean     NOT NULL DEFAULT false,
  laatste_fout               text        NOT NULL DEFAULT '' CHECK (char_length(laatste_fout) <= 600),
  laatst_gecontroleerd_op    timestamptz,
  laatste_bericht_id         bigint,
  laatste_bericht_op         timestamptz,
  aangemaakt_op              timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, agent_slug)
);

CREATE INDEX IF NOT EXISTS geheugen_agent_bots_lade_idx
  ON app.geheugen_agent_bots (user_id, ruimte, status, agent_slug);

COMMENT ON TABLE app.geheugen_agent_bots IS
  'Register van afzonderlijke Telegram-bots per AI-agent binnen gebruikersruimte (versleutelde sleutel, publicatiestatus, onderwerpkoppeling; geen extra AI-rechten).';

ALTER TABLE app.geheugen_agent_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_agent_bots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_agent_bots_eigen ON app.geheugen_agent_bots;
CREATE POLICY geheugen_agent_bots_eigen ON app.geheugen_agent_bots
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

CREATE TABLE IF NOT EXISTS app.geheugen_telegram_bezorging (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                text        NOT NULL CHECK (user_id <> ''),
  ruimte                 text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bot_id                 uuid        REFERENCES app.geheugen_agent_bots(id) ON DELETE SET NULL,
  agent_slug             text        NOT NULL CHECK (agent_slug ~ '^[a-z0-9][a-z0-9._:-]{1,47}$'),
  taak_id                text        NOT NULL DEFAULT '' CHECK (char_length(taak_id) <= 120),
  sessie_id              text        NOT NULL DEFAULT '' CHECK (char_length(sessie_id) <= 120),
  knoop_id               uuid        REFERENCES app.geheugen_stroom_knopen(id) ON DELETE SET NULL,
  vorige_bezorging_id    uuid        REFERENCES app.geheugen_telegram_bezorging(id) ON DELETE SET NULL,
  soort_bericht          text        NOT NULL CHECK (soort_bericht IN ('gebeurtenis','besluit','overdracht','rapport','bestand','gesprek')),
  idempotentie_sleutel   text        NOT NULL CHECK (idempotentie_sleutel <> '' AND char_length(idempotentie_sleutel) <= 160),
  titel                  text        NOT NULL DEFAULT '' CHECK (char_length(titel) <= 240),
  samenvatting           text        NOT NULL DEFAULT '' CHECK (char_length(samenvatting) <= 4000),
  bestands_verwijzingen  jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bestands_verwijzingen) = 'array' AND pg_column_size(bestands_verwijzingen) <= 16384),
  telegram_chat_id       text        NOT NULL DEFAULT '' CHECK (char_length(telegram_chat_id) <= 80),
  telegram_thread_id     bigint,
  telegram_bericht_id    bigint,
  status                 text        NOT NULL DEFAULT 'wachtrij' CHECK (status IN ('wachtrij', 'verzonden', 'mislukt', 'overgeslagen')),
  pogingen               integer     NOT NULL DEFAULT 0 CHECK (pogingen >= 0),
  laatste_fout           text        NOT NULL DEFAULT '' CHECK (char_length(laatste_fout) <= 600),
  aangemaakt_op          timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op          timestamptz NOT NULL DEFAULT now(),
  verzonden_op           timestamptz,
  UNIQUE (user_id, ruimte, idempotentie_sleutel)
);

CREATE INDEX IF NOT EXISTS geheugen_telegram_bezorging_taak_idx
  ON app.geheugen_telegram_bezorging (user_id, ruimte, taak_id, aangemaakt_op DESC);

CREATE INDEX IF NOT EXISTS geheugen_telegram_bezorging_agent_idx
  ON app.geheugen_telegram_bezorging (user_id, ruimte, agent_slug, aangemaakt_op DESC);

COMMENT ON TABLE app.geheugen_telegram_bezorging IS
  'Idempotente bezorgwachtrij van geheugengebeurtenissen, overdrachten en rapporten naar Telegram-onderwerpen per agent en taak_id.';

ALTER TABLE app.geheugen_telegram_bezorging ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geheugen_telegram_bezorging FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geheugen_telegram_bezorging_eigen ON app.geheugen_telegram_bezorging;
CREATE POLICY geheugen_telegram_bezorging_eigen ON app.geheugen_telegram_bezorging
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
