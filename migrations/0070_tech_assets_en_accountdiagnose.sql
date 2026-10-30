-- 0070: technische bundels alleen voor een sessie met technisch profiel + diagnose «voor iedereen / alleen voor mij» (18.10.2026).
--
-- 1) app.tech_asset_toegang — toegangssleutel voor /assets/tech/* (zie backend/tech-assets.ts, shared/tech-assets.ts).
--    Bij een actieve activering geeft /api/owner/tech/status een HttpOnly-cookie (Path=/assets/tech/) met een willekeurige sleutel; hier
--    staat alleen de SHA-256 ervan, gekoppeld aan de activering. Eindigt de activering (zelf, verlopen, uitloggen, intrekken), dan is de
--    sleutel meteen ongeldig: de server controleert bij elk bestand of de activering nog loopt. Rijen verlopen met de activering.
CREATE TABLE IF NOT EXISTS app.tech_asset_toegang (
  sleutel_hash  text        PRIMARY KEY CHECK (sleutel_hash ~ '^[0-9a-f]{64}$'),
  user_id       text        NOT NULL,
  activatie_id  uuid        NOT NULL REFERENCES app.tech_activaties (id) ON DELETE CASCADE,
  verloopt_op   timestamptz NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tech_asset_toegang_activatie_idx ON app.tech_asset_toegang (activatie_id);
CREATE INDEX IF NOT EXISTS tech_asset_toegang_verloopt_idx ON app.tech_asset_toegang (verloopt_op);

-- 2) app.diagnostiek_account_uitslagen — synthetische controles van één ACCOUNT (mail, agenda, Drive, GitHub, AI-koppelingen,
--    apparaten, eigen instellingen). Alleen metadata: stand, korte code, wie startte, wanneer. Nooit inhoud, adressen of tokens.
--    Naast app.diagnostiek_uitslagen (server, voor iedereen) geeft dit de tabel «Сервер (для всіх) / Цей акаунт». Bewaartermijn 30 dagen.
CREATE TABLE IF NOT EXISTS app.diagnostiek_account_uitslagen (
  nr        bigserial   PRIMARY KEY,
  user_id   text        NOT NULL,
  dienst    text        NOT NULL CHECK (dienst ~ '^[a-z][a-z0-9-]{1,23}$'),
  stand     text        NOT NULL CHECK (stand IN ('ok', 'let-op', 'fout', 'onbekend')),
  code      text        NOT NULL DEFAULT '' CHECK (code ~ '^[A-Z0-9_]{0,40}$'),
  op        timestamptz NOT NULL DEFAULT now(),
  door      text        NOT NULL DEFAULT '',   -- gebruikers-id van wie de controle startte (de gebruiker zelf of een beheerder)
  batch     text        NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS diagnostiek_account_uitslagen_user_idx ON app.diagnostiek_account_uitslagen (user_id, dienst, op DESC);
CREATE INDEX IF NOT EXISTS diagnostiek_account_uitslagen_op_idx ON app.diagnostiek_account_uitslagen (op DESC);

-- Alleen de systeemrol; de app-rol (RLS) komt hier niet aan: de server bepaalt wie welke rij ziet (eigen account of beheerder).
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.tech_asset_toegang FROM mijnruimte_app;
    REVOKE ALL ON app.diagnostiek_account_uitslagen FROM mijnruimte_app;
    REVOKE ALL ON SEQUENCE app.diagnostiek_account_uitslagen_nr_seq FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, DELETE ON app.tech_asset_toegang TO mijnruimte_system;
    GRANT SELECT, INSERT, DELETE ON app.diagnostiek_account_uitslagen TO mijnruimte_system;
    GRANT USAGE, SELECT ON SEQUENCE app.diagnostiek_account_uitslagen_nr_seq TO mijnruimte_system;
  END IF;
END
$r$;
