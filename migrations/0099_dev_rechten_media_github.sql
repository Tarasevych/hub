-- 0099 (eerst 0095; hernummerd samen met 0097/0098): rechten die «in ontwikkeling» stonden, nu ECHT (besluit van de eigenaar, 21.10.2026) — de groepen GitHub, Ontwerp en media,
-- Betalingen en Apps. Wat een tabel nodig heeft:
--
--   app.ai_media_generator   — de instelling van de LOKALE beeldgenerator (BYOS): één rij. Adres (alleen loopback of privénetwerk;
--                              de server controleert dat bij elk verzoek opnieuw, ook na DNS — backend/media-generator.ts), soort API
--                              (AUTOMATIC1111-achtig of OpenAI-compatibel), model en grenzen. Alleen de eigenaar zet haar, met een
--                              verse passkey (backend/dev-mg-routes.ts). Een AI kan het adres nooit kiezen of veranderen.
--   app.app_eigen_domeinen   — welke app op welk apparaat een eigen hostnaam kreeg, na bevestiging op de site (backend/dev-mg-bevestiging.ts,
--                              soort «apps.eigen-domein»). Eén hostnaam hoort bij hoogstens één app (PRIMARY KEY); de DNS-stand op het
--                              moment van zetten staat erbij (alleen namen en adressen, geen geheimen).
--
-- Niet hier, bewust: de Stripe-sleutel (die staat in de kluis van de eigenaar, doel «stripe»), de pull requests en de voorstellen
-- (die staan versleuteld in app.ai_bevestiging, 0094), de beelden en schema's (die staan in de hmara van de mens, app.records).
-- Idempotent. Alleen de systeemrol raakt deze tabellen (rechten.sql: DML op alle tabellen); RLS staat aan zonder beleid voor de app-rol.

CREATE TABLE IF NOT EXISTS app.ai_media_generator (
  id              smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  aan             boolean     NOT NULL DEFAULT false,
  url             text        NOT NULL DEFAULT '' CHECK (length(url) <= 300 AND url !~ '[[:space:]]' AND (url = '' OR url ~ '^https?://')),
  soort           text        NOT NULL DEFAULT 'a1111' CHECK (soort IN ('a1111', 'openai')),
  model           text        NOT NULL DEFAULT '' CHECK (length(model) <= 200),
  timeout_s       integer     NOT NULL DEFAULT 300 CHECK (timeout_s BETWEEN 10 AND 900),
  max_zijde       integer     NOT NULL DEFAULT 1024 CHECK (max_zijde BETWEEN 256 AND 2048),
  stappen         integer     NOT NULL DEFAULT 25 CHECK (stappen BETWEEN 1 AND 150),
  bijgewerkt_door text        NOT NULL DEFAULT '' CHECK (length(bijgewerkt_door) <= 120),
  bijgewerkt_op   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.ai_media_generator IS
  'Instelling van de lokale beeldgenerator (BYOS): één rij. Alleen loopback/privénetwerk (gecontroleerd bij elk verzoek, ook na DNS). Alleen de eigenaar met verse passkey.';

CREATE TABLE IF NOT EXISTS app.app_eigen_domeinen (
  host            text        PRIMARY KEY CHECK (host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' AND length(host) <= 253),
  user_id         text        NOT NULL,
  agent_id        text        NOT NULL CHECK (length(agent_id) BETWEEN 1 AND 120),
  app             text        NOT NULL CHECK (app ~ '^[a-z][a-z0-9-]{1,30}[a-z0-9]$'),
  status          text        NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'verwijderd')),
  dns             jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dns) = 'object' AND pg_column_size(dns) <= 4096),
  bevestiging_id  uuid,
  gezet_op        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_eigen_domeinen_app_idx ON app.app_eigen_domeinen (user_id, app);
COMMENT ON TABLE app.app_eigen_domeinen IS
  'Eigen hostnaam per app (na bevestiging op de site met passkey). Eén host hoort bij hoogstens één app; de DNS-stand bij het zetten staat erbij.';

-- Rijbeveiliging: de systeemrol (BYPASSRLS) bedient de server. De app-rol krijgt hier geen enkele rij: geen beleid = niets.
ALTER TABLE app.ai_media_generator ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.app_eigen_domeinen ENABLE ROW LEVEL SECURITY;
DO $mg_rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.ai_media_generator, app.app_eigen_domeinen FROM mijnruimte_app;
  END IF;
END
$mg_rechten$;
