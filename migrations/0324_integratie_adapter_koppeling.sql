-- 0324 (CONSOL-001, 23.11.2026): зашифроване сховище перевірених підключень перехідників зовнішніх служб (Nextcloud/WebDAV, S3, MQTT, Zigbee2MQTT).
-- Секрет запечатано ключем даних користувача (DEK) або резервним ключем середовища з прив’язкою до простору, користувача та ідентифікатора рядка під суворим захистом рядків.
-- Versleutelde opslag van gecontroleerde adapterkoppelingen per gebruiker en ruimte onder strikte FORCE ROW LEVEL SECURITY.

CREATE TABLE IF NOT EXISTS app.integratie_adapter_koppeling (
  user_id text NOT NULL,
  ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  integratie text NOT NULL CHECK (integratie IN ('nextcloud', 's3', 'mqtt', 'zigbee2mqtt')),
  soort text NOT NULL CHECK (soort IN ('webdav', 's3', 'mqtt')),
  configuratie jsonb NOT NULL DEFAULT '{}'::jsonb,
  geheim text NOT NULL,
  actief boolean NOT NULL DEFAULT true,
  zichtbare_items integer NOT NULL DEFAULT 0,
  laatst_goed_op timestamptz,
  fout text NOT NULL DEFAULT '',
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, integratie)
);

CREATE INDEX IF NOT EXISTS integratie_adapter_koppeling_id
  ON app.integratie_adapter_koppeling (user_id, ruimte, id);

ALTER TABLE app.integratie_adapter_koppeling ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integratie_adapter_koppeling FORCE ROW LEVEL SECURITY;

DO $beleid$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'app'
      AND tablename = 'integratie_adapter_koppeling'
      AND policyname = 'integratie_adapter_koppeling_eigen'
  ) THEN
    CREATE POLICY integratie_adapter_koppeling_eigen ON app.integratie_adapter_koppeling
      USING (
        current_user::text <> 'mijnruimte_app'
        OR (
          user_id = NULLIF(current_setting('app.user_id', true), '')
          AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
        )
      )
      WITH CHECK (
        current_user::text <> 'mijnruimte_app'
        OR (
          user_id = NULLIF(current_setting('app.user_id', true), '')
          AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
        )
      );
  END IF;
END
$beleid$;

DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.integratie_adapter_koppeling TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.integratie_adapter_koppeling TO mijnruimte_system;
  END IF;
END
$rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'integraties-adapter-opslaan-v1',
  'Майстер інтеграцій: зашифроване збереження перевіреного підключення перехідника (WebDAV, S3, MQTT) у просторі. | Koppelwizard: versleuteld bewaren van gecontroleerde adapterkoppelingen (WebDAV, S3, MQTT) in de ruimte.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
