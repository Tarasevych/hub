-- 0056: geschiedenis van de beheerdiagnostiek (admin → «Діагностика», /diagnostiek).
--
-- Elke uitgevoerde controle wordt bewaard: welke, met welke uitslag, hoe lang het duurde, welke korte code, wie op «Перевірити» drukte en
-- wanneer. Daaruit volgen «laatste succes», «sinds wanneer faalt het» en de lijst «Потребує уваги». Alleen de systeemrol gebruikt deze
-- tabel. Er worden nooit geheimen, paden of e-mailinhoud opgeslagen: `detail` is een korte, al gemaskeerde zin van maximaal 400 tekens.
-- Opruimen: de app verwijdert rijen ouder dan 30 dagen bij elke uitvoering (zie backend/admin-diagnostiek.ts).
CREATE TABLE IF NOT EXISTS app.diagnostiek_uitslagen (
  nr         bigserial   PRIMARY KEY,
  controle   text        NOT NULL CHECK (controle ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  categorie  text        NOT NULL CHECK (categorie ~ '^[a-z]{2,20}$'),
  stand      text        NOT NULL CHECK (stand IN ('ok', 'let-op', 'fout', 'onbekend')),
  ms         integer     NOT NULL DEFAULT 0 CHECK (ms BETWEEN 0 AND 600000),
  code       text        NOT NULL DEFAULT '' CHECK (code ~ '^[A-Z0-9_]{0,40}$'),
  detail     text        NOT NULL DEFAULT '' CHECK (length(detail) <= 400),
  op         timestamptz NOT NULL DEFAULT now(),
  door       text        NOT NULL DEFAULT '',     -- gebruikers-id van wie de controle startte ('' = automatisch)
  door_email text        NOT NULL DEFAULT '',
  batch      text        NOT NULL DEFAULT ''      -- groepeert controles uit één klik op «Перевірити все»/categorie
);
CREATE INDEX IF NOT EXISTS diagnostiek_uitslagen_controle_idx ON app.diagnostiek_uitslagen (controle, op DESC);
CREATE INDEX IF NOT EXISTS diagnostiek_uitslagen_stand_idx ON app.diagnostiek_uitslagen (stand, op DESC);
CREATE INDEX IF NOT EXISTS diagnostiek_uitslagen_op_idx ON app.diagnostiek_uitslagen (op DESC);

-- De app-rol (RLS, per gebruiker) heeft hier niets te zoeken; alleen de systeemrol (BYPASSRLS) leest en schrijft.
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    REVOKE ALL ON app.diagnostiek_uitslagen FROM mijnruimte_app;
    REVOKE ALL ON SEQUENCE app.diagnostiek_uitslagen_nr_seq FROM mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, DELETE ON app.diagnostiek_uitslagen TO mijnruimte_system;
    GRANT USAGE, SELECT ON SEQUENCE app.diagnostiek_uitslagen_nr_seq TO mijnruimte_system;
  END IF;
END
$r$;
