-- 0055: beleid en controles van de integraties (admin → /mappen «Інтеграції»).
--
-- integratie_beleid: of de beheerder een koppeling beschikbaar heeft gemaakt voor gebruikers van de site (standaard NIET). Alleen
--   koppelingen die werkelijk bestaan (status «klaar» in shared/integraties-catalogus.ts) kunnen worden aangezet; de app weigert de rest.
-- integratie_controles: geschiedenis van «Перевірити стан» per koppeling (stand, korte code, wie, wanneer). Geen geheimen of waarden.
-- Wijzigingen staan daarnaast in het hash-geketende beheerlogboek (integration.* via schrijfBeheerAudit); deze tabellen zijn de actuele toestand.
-- Alleen de systeemrol gebruikt ze (de app-rol met RLS heeft hier niets te zoeken).
CREATE TABLE IF NOT EXISTS app.integratie_beleid (
  integratie       text        PRIMARY KEY CHECK (integratie ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  voor_gebruikers  boolean     NOT NULL DEFAULT false,
  bijgewerkt_door  text        NOT NULL DEFAULT '',
  bijgewerkt_op    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integratie_controles (
  nr          bigserial   PRIMARY KEY,
  integratie  text        NOT NULL CHECK (integratie ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  stand       text        NOT NULL CHECK (stand IN ('ok', 'let-op', 'fout', 'onbekend')),
  code        text        NOT NULL DEFAULT '' CHECK (code ~ '^[A-Z0-9_]{0,40}$'),
  detail      text        NOT NULL DEFAULT '' CHECK (length(detail) <= 300),
  door        text        NOT NULL DEFAULT '',
  op          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integratie_controles_idx ON app.integratie_controles (integratie, op DESC);

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.integratie_beleid, app.integratie_controles FROM mijnruimte_app;
    REVOKE ALL ON SEQUENCE app.integratie_controles_nr_seq FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE ON app.integratie_beleid TO mijnruimte_system;
    GRANT SELECT, INSERT, DELETE ON app.integratie_controles TO mijnruimte_system;
    GRANT USAGE, SELECT ON SEQUENCE app.integratie_controles_nr_seq TO mijnruimte_system;
  END IF;
END
$r$;
