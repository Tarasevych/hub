-- 0283 — Налаштування GitHub-webhook і автоматичного отримання випусків + зашифроване архівування випусків у Telegram.
-- 0283 — Instellingen voor GitHub-webhook en automatische release-ontvangst + versleutelde release-archivering in Telegram.
--
-- Сумісно з PostgreSQL 15+ і PostgreSQL 18.6; ідемпотентно.
-- Увімкнено суворий захист рядків (ENABLE + FORCE ROW LEVEL SECURITY) за app.huidige_gebruiker() та app.huidige_ruimte(),
-- а доступ непривілейованої ролі mijnruimte_app повністю закритий через migrations/rechten.sql.

ALTER TABLE app.uitrol_github_instellingen
  ADD COLUMN IF NOT EXISTS webhook_aan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_auto_ophalen boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS toegestane_tag_prefix text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS app.uitrol_telegram_instellingen (
  user_id                    text        PRIMARY KEY CHECK (user_id <> ''),
  ruimte                     text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  chat_id                    text        NOT NULL DEFAULT '' CHECK (char_length(chat_id) <= 80),
  message_thread_id          bigint      CHECK (message_thread_id IS NULL OR message_thread_id > 0),
  actief                     boolean     NOT NULL DEFAULT false,
  verplicht_voor_installatie boolean     NOT NULL DEFAULT false,
  laatst_getest_op           timestamptz,
  laatste_test_ok            boolean     NOT NULL DEFAULT false,
  laatste_test_fout          text        NOT NULL DEFAULT '' CHECK (char_length(laatste_test_fout) <= 200),
  aangemaakt_op              timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.uitrol_telegram_archief (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL CHECK (user_id <> ''),
  ruimte             text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  versie             text        NOT NULL CHECK (versie ~ '^[0-9]{8}-[0-9]{6}$'),
  run_id             text        NOT NULL DEFAULT '' CHECK (char_length(run_id) <= 80),
  voorstel_id        uuid        REFERENCES app.uitrol_voorstellen(id) ON DELETE SET NULL,
  chat_id            text        NOT NULL CHECK (chat_id <> ''),
  message_thread_id  bigint,
  origineel_sha256   text        NOT NULL CHECK (origineel_sha256 ~ '^[0-9a-f]{64}$'),
  origineel_bytes    bigint      NOT NULL CHECK (origineel_bytes > 0),
  versleuteld_sha256 text        NOT NULL DEFAULT '' CHECK (versleuteld_sha256 = '' OR versleuteld_sha256 ~ '^[0-9a-f]{64}$'),
  versleuteld_bytes  bigint      NOT NULL DEFAULT 0 CHECK (versleuteld_bytes >= 0),
  algoritme          text        NOT NULL DEFAULT 'AES-256-GCM',
  aantal_delen       integer     NOT NULL DEFAULT 1 CHECK (aantal_delen BETWEEN 1 AND 256),
  delen              jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(delen) = 'array' AND pg_column_size(delen) <= 65536),
  manifest_msg_id    bigint,
  status             text        NOT NULL DEFAULT 'bezig' CHECK (status IN ('bezig', 'voltooid', 'mislukt', 'overgeslagen')),
  fout_code          text        NOT NULL DEFAULT '' CHECK (char_length(fout_code) <= 80),
  pogingen           integer     NOT NULL DEFAULT 0,
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op      timestamptz NOT NULL DEFAULT now(),
  voltooid_op        timestamptz,
  UNIQUE (user_id, versie, origineel_sha256)
);

CREATE INDEX IF NOT EXISTS uitrol_telegram_archief_idx
  ON app.uitrol_telegram_archief (user_id, ruimte, aangemaakt_op DESC);

CREATE TABLE IF NOT EXISTS app.uitrol_github_ontvangen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL CHECK (user_id <> ''),
  ruimte          text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  bron            text        NOT NULL CHECK (bron IN ('webhook', 'handmatig', 'mcp')),
  repo            text        NOT NULL CHECK (repo ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$'),
  tag             text        NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 120),
  versie          text        NOT NULL DEFAULT '' CHECK (versie = '' OR versie ~ '^[0-9]{8}-[0-9]{6}$'),
  release_id      bigint      NOT NULL CHECK (release_id >= 0),
  asset_id        bigint      NOT NULL DEFAULT 0,
  asset_naam      text        NOT NULL DEFAULT '' CHECK (char_length(asset_naam) <= 200),
  asset_sha256    text        NOT NULL DEFAULT '' CHECK (asset_sha256 = '' OR asset_sha256 ~ '^[0-9a-f]{64}$'),
  asset_bytes     bigint      NOT NULL DEFAULT 0 CHECK (asset_bytes >= 0),
  voorstel_id     uuid        REFERENCES app.uitrol_voorstellen(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'ontvangen' CHECK (status IN ('ontvangen', 'gedownload', 'voorcontrole_ok', 'voorcontrole_mislukt', 'geweigerd', 'overgeslagen', 'fout')),
  fout_code       text        NOT NULL DEFAULT '' CHECK (char_length(fout_code) <= 80),
  samenvatting_uk text        NOT NULL DEFAULT '' CHECK (char_length(samenvatting_uk) <= 800),
  samenvatting_nl text        NOT NULL DEFAULT '' CHECK (char_length(samenvatting_nl) <= 800),
  aangemaakt_op   timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uitrol_github_ontvangen_idx
  ON app.uitrol_github_ontvangen (user_id, ruimte, aangemaakt_op DESC);

CREATE TABLE IF NOT EXISTS app.uitrol_github_webhook_leveringen (
  delivery_id  text        PRIMARY KEY CHECK (char_length(delivery_id) BETWEEN 4 AND 120),
  user_id      text        NOT NULL CHECK (user_id <> ''),
  ruimte       text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  gebeurtenis  text        NOT NULL DEFAULT '' CHECK (char_length(gebeurtenis) <= 60),
  repo         text        NOT NULL DEFAULT '' CHECK (char_length(repo) <= 150),
  tag          text        NOT NULL DEFAULT '' CHECK (char_length(tag) <= 120),
  uitkomst     text        NOT NULL DEFAULT 'verwerkt' CHECK (char_length(uitkomst) <= 60),
  ontvangen_op timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uitrol_github_webhook_leveringen_tijd_idx
  ON app.uitrol_github_webhook_leveringen (user_id, ontvangen_op DESC);

CREATE TABLE IF NOT EXISTS app.uitrol_telegram_updates (
  update_id    bigint      PRIMARY KEY,
  user_id      text        NOT NULL CHECK (user_id <> ''),
  ruimte       text        NOT NULL DEFAULT 'technisch' CHECK (ruimte IN ('prive', 'technisch')),
  chat_id      text        NOT NULL DEFAULT '' CHECK (char_length(chat_id) <= 80),
  uitkomst     text        NOT NULL DEFAULT 'verwerkt' CHECK (char_length(uitkomst) <= 60),
  ontvangen_op timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uitrol_telegram_updates_tijd_idx
  ON app.uitrol_telegram_updates (user_id, ontvangen_op DESC);

-- Розширюємо перелік допустимих видів доказів у app.uitrol_stroom_bewijzen на telegram-archief і github-ontvangst.
DO $$
DECLARE
  v_con text;
BEGIN
  IF to_regclass('app.uitrol_stroom_bewijzen') IS NOT NULL THEN
    FOR v_con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'app'
        AND t.relname = 'uitrol_stroom_bewijzen'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%pakket-integriteit%'
    LOOP
      EXECUTE format('ALTER TABLE app.uitrol_stroom_bewijzen DROP CONSTRAINT %I', v_con);
    END LOOP;
    ALTER TABLE app.uitrol_stroom_bewijzen
      ADD CONSTRAINT uitrol_stroom_bewijzen_soort_check
      CHECK (soort IN (
        'pakket-integriteit', 'vereisten-preflight', 'migratie-proef',
        'voorcontrole', 'ontwikkelarchief', 'testresultaten',
        'goedkeuring-passkey', 'installatie-uitvoering', 'server-diagnose',
        'telegram-archief', 'github-ontvangst'
      ));
  END IF;
END $$;

ALTER TABLE app.uitrol_telegram_instellingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_telegram_instellingen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_telegram_instellingen_ruimte_eigen ON app.uitrol_telegram_instellingen;
CREATE POLICY uitrol_telegram_instellingen_ruimte_eigen ON app.uitrol_telegram_instellingen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

ALTER TABLE app.uitrol_telegram_archief ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_telegram_archief FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_telegram_archief_ruimte_eigen ON app.uitrol_telegram_archief;
CREATE POLICY uitrol_telegram_archief_ruimte_eigen ON app.uitrol_telegram_archief
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

ALTER TABLE app.uitrol_github_ontvangen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_github_ontvangen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_github_ontvangen_ruimte_eigen ON app.uitrol_github_ontvangen;
CREATE POLICY uitrol_github_ontvangen_ruimte_eigen ON app.uitrol_github_ontvangen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

ALTER TABLE app.uitrol_github_webhook_leveringen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_github_webhook_leveringen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_github_webhook_leveringen_ruimte_eigen ON app.uitrol_github_webhook_leveringen;
CREATE POLICY uitrol_github_webhook_leveringen_ruimte_eigen ON app.uitrol_github_webhook_leveringen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );

ALTER TABLE app.uitrol_telegram_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.uitrol_telegram_updates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uitrol_telegram_updates_ruimte_eigen ON app.uitrol_telegram_updates;
CREATE POLICY uitrol_telegram_updates_ruimte_eigen ON app.uitrol_telegram_updates
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (app.huidige_ruimte() IS NULL OR ruimte = app.huidige_ruimte())
    )
  );
