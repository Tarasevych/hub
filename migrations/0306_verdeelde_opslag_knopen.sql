-- 0306 (UPD-013, 20.11.2026): реєстр вузлів і журнал перевірок та навчальних ротацій
-- розподіленого зашифрованого зберігання Шаміра (k-з-n).
-- У базі зберігаються лише очищені метадані вузлів, контрольні суми та підсумки перевірок —
-- жодних сирих часток, ключів чи таємниць.
-- Зворотно сумісна й повторювана міграція: лише нові таблиці та індекси, без руйнівних дій.
-- Register van knopen en logboek van controles en proactieve rotaties voor verdeelde versleutelde opslag.
-- Achterwaarts compatibel en herhaalbaar: uitsluitend nieuwe tabellen en indexen, zonder geheime gegevens.

CREATE TABLE IF NOT EXISTS app.verdeelde_opslag_knopen (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gebruiker_id        text        NOT NULL,
  naam                text        NOT NULL CHECK (length(trim(naam)) BETWEEN 1 AND 120),
  land_code           text        NOT NULL CHECK (length(trim(land_code)) BETWEEN 2 AND 16),
  platform            text        NOT NULL CHECK (length(trim(platform)) BETWEEN 1 AND 80),
  soort               text        NOT NULL CHECK (soort IN ('r-schijf', 's3', 'webdav', 'rclone', 'nextcloud', 'offline-qr', 'eigen-server')),
  bestemming_hint     text        NOT NULL DEFAULT '',
  status              text        NOT NULL DEFAULT 'onbekend' CHECK (status IN ('gezond', 'waarschuwing', 'fout', 'onbekend')),
  laatste_sha256      text        NOT NULL DEFAULT '',
  laatste_controle_op timestamptz,
  actief              boolean     NOT NULL DEFAULT true,
  aangemaakt_op       timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verdeelde_opslag_knopen_gebruiker
  ON app.verdeelde_opslag_knopen (gebruiker_id, actief DESC, bijgewerkt_op DESC);

CREATE INDEX IF NOT EXISTS idx_verdeelde_opslag_knopen_land_platform
  ON app.verdeelde_opslag_knopen (gebruiker_id, land_code, platform)
  WHERE actief = true;

CREATE TABLE IF NOT EXISTS app.verdeelde_opslag_rotaties (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gebruiker_id   text        NOT NULL,
  soort          text        NOT NULL CHECK (soort IN ('rotatie', 'oefen-herstel', 'controle')),
  aantal_delen   integer     NOT NULL CHECK (aantal_delen >= 0 AND aantal_delen <= 255),
  drempel_k      integer     NOT NULL CHECK (drempel_k >= 0 AND drempel_k <= 255),
  geslaagd       boolean     NOT NULL DEFAULT false,
  samenvatting   text        NOT NULL DEFAULT '',
  details_json   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  uitgevoerd_op  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verdeelde_opslag_rotaties_gebruiker
  ON app.verdeelde_opslag_rotaties (gebruiker_id, uitgevoerd_op DESC);

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.verdeelde_opslag_knopen,
      app.verdeelde_opslag_rotaties
    TO mijnruimte_system;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      app.verdeelde_opslag_knopen,
      app.verdeelde_opslag_rotaties
    TO mijnruimte_app;
  END IF;
END
$r$;
