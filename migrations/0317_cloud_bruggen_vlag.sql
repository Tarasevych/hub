-- 0317 (CONSOL-001, Віха M3): таблиця захищених підключень WebDAV (Nextcloud та власний NAS),
-- посилення примусового рядкового захисту на таблицях багатооблікових підключень M4
-- та реєстрація 8 прапорців хмарних модулів (П-1..П-7 + WebDAV) зі станом false, false за правилом VLAG-001.
-- Повністю адитивна та повторювана міграція без руйнівних операцій.
-- Beveiligde WebDAV-koppelingen (Nextcloud en eigen NAS), FORCE RLS op M4-tabellen
-- en registratie van de 8 cloudfunctievlaggen (standaard uit conform VLAG-001).

CREATE TABLE IF NOT EXISTS app.cloud_webdav_koppelingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  ruimte text NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  aanbieder text NOT NULL CHECK (aanbieder IN ('nextcloud', 'nas-webdav')),
  naam text NOT NULL CHECK (char_length(naam) BETWEEN 1 AND 120),
  origin text NOT NULL CHECK (origin ~ '^https://[^/?#@\s]+$'),
  pad_voorvoegsel text NOT NULL DEFAULT '/' CHECK (char_length(pad_voorvoegsel) BETWEEN 1 AND 500),
  gebruikersnaam text NOT NULL CHECK (char_length(gebruikersnaam) BETWEEN 1 AND 150),
  geheim_envelop text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reauth_required', 'revoked')),
  laatst_gecontroleerd_op timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, aanbieder, origin, gebruikersnaam)
);

CREATE INDEX IF NOT EXISTS idx_cloud_webdav_koppelingen_eigenaar
  ON app.cloud_webdav_koppelingen (user_id, ruimte, updated_at DESC);

ALTER TABLE app.cloud_webdav_koppelingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_webdav_koppelingen FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_webdav_koppelingen_eigen ON app.cloud_webdav_koppelingen;
CREATE POLICY cloud_webdav_koppelingen_eigen ON app.cloud_webdav_koppelingen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  );

-- Адитивне посилення рядкового захисту на наявних таблицях підключень M4 (0120).
ALTER TABLE app.cloud_oauth_flows_m4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_oauth_flows_m4 FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_oauth_flows_m4_eigen ON app.cloud_oauth_flows_m4;
CREATE POLICY cloud_oauth_flows_m4_eigen ON app.cloud_oauth_flows_m4
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  );

ALTER TABLE app.cloud_provider_accounts_m4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cloud_provider_accounts_m4 FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cloud_provider_accounts_m4_eigen ON app.cloud_provider_accounts_m4;
CREATE POLICY cloud_provider_accounts_m4_eigen ON app.cloud_provider_accounts_m4
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = COALESCE(NULLIF(current_setting('app.ruimte', true), ''), 'prive')
    )
  );

-- Зашифровані облікові дані WebDAV та OAuth доступні лише системній ролі за перевіреним маршрутом хмари.
REVOKE ALL ON app.cloud_webdav_koppelingen FROM PUBLIC;
DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON
      app.cloud_webdav_koppelingen,
      app.cloud_oauth_flows_m4,
      app.cloud_provider_accounts_m4
    FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.cloud_webdav_koppelingen TO mijnruimte_system;
    GRANT SELECT, INSERT, DELETE ON app.cloud_oauth_flows_m4 TO mijnruimte_system;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.cloud_provider_accounts_m4 TO mijnruimte_system;
  END IF;
END
$rechten$;

-- Реєстрація 8 прапорців хмарних модулів (VLAG-001: початково false, false).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m4-koppelingen-v1',
  'Підключення зовнішніх хмарних сховищ M4 (OneDrive, Dropbox, Box) за OAuth у межах простору користувача. / Koppeling van externe M4-cloudopslag (OneDrive, Dropbox, Box) via OAuth per ruimte.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m5-catalogus-v1',
  'Каталог готовності зовнішніх хмарних постачальників M5 для схваленого сеансу хмари. / Gereedheidscatalogus van externe M5-cloudaanbieders voor een goedgekeurde cloudsessie.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m6-beheer-v1',
  'Політики керування зовнішніми хмарними постачальниками M6 для власника у технічному профілі. / Beheerbeleid voor externe M6-cloudaanbieders door de eigenaar in een technisch profiel.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m8-mappen-v1',
  'Єдиний перегляд тек підключених хмарних сховищ M8 із захищеним серверним вказівником сторінки. / Uniform mappenoverzicht van gekoppelde M8-cloudopslag met versleutelde paginawijzer.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m10-beheer-v1',
  'Адміністративний міст керування хмарними постачальниками M10 із посиленим підтвердженням власника. / Beheerbrug voor M10-cloudaanbieders met sterke bevestiging door de eigenaar.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m10-omgeving-v1',
  'Серверне середовище виконання перегляду тек M8 та попереднього перегляду файлів M11. / Serveromgeving voor M8-mappenweergave en M11-voorbeeldweergave van bestanden.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-m11-voorbeeld-v1',
  'Захищений попередній перегляд файлів зовнішніх хмар M11 із перевіркою контрольної суми та версії. / Beveiligde M11-voorbeeldweergave van externe cloudbestanden met revisie- en somcontrole.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'cloud-webdav-v1',
  'Підключення власних сховищ Nextcloud та NAS за захищеним протоколом WebDAV (HTTPS) у межах простору. / Koppeling van eigen Nextcloud- en NAS-opslag via beveiligde WebDAV (HTTPS) per ruimte.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
