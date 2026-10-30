-- 0129 — sha256 van het GELEVERDE archief naast die van het bewaarde bestand (29.10.2026).
--
-- Waarom: het logboek toonde voor 20261028-215049 en 20261028-224316 een andere sha256/grootte dan de geleverde archieven. Oorzaak in
-- deploy/installeer-app.sh (pakket_bewaren_ssh): de test «ligt het geleverde archief naast de bronmap?» liep via
-- `tar -tzf | head -n1 | grep` onder `set -o pipefail`; tar kreeg SIGPIPE (141), de test faalde altijd en de bronmap werd OPNIEUW
-- ingepakt. Nu bewaart de installer het geleverde archief zelf en schrijft hij beide waarden in de gebeurtenis; de pagina «Оновлення»
-- toont ze naast elkaar, met de herkomst (geleverd / opnieuw ingepakt). Oude rijen blijven leeg (onbekend).
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS pakket_geleverd_sha256 text NOT NULL DEFAULT '' CHECK (pakket_geleverd_sha256 ~ '^([0-9a-f]{64})?$');
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS pakket_herkomst text NOT NULL DEFAULT '' CHECK (pakket_herkomst IN ('', 'geleverd', 'opnieuw-ingepakt'));
