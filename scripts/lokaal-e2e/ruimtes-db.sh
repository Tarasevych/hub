#!/bin/bash
# Eigen wegwerp-database voor de ruimtes-testsuites (standaard «ru4»), naast andere agents. ALLEEN LOKAAL.
# Gebruik: scripts/lokaal-e2e/ruimtes-db.sh [dbnaam]  → maakt db (indien nodig), rollen-rechten, migraties.
set -euo pipefail
DB="${1:-ru4}"; REPO="$(cd "$(dirname "$0")/../.." && pwd)"; export PATH=/opt/node24/bin:$PATH
set -a; . "${GEHEIMEN:-/workspace/.lokaal/geheimen.env}"; set +a
om() { echo "$1" | sed -E "s#/[A-Za-z0-9_]+\$#/$DB#"; }
pw() { echo "$1" | sed -E 's#^postgres(ql)?://[^:]+:([^@]*)@.*#\2#'; }
sudo -u postgres psql -X -q -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || sudo -u postgres psql -X -q -c "CREATE DATABASE $DB OWNER mijnruimte"
cd "$REPO"
M=$(printf '%s' "$(pw "$DATABASE_URL_MIGRATIE")" | node deploy/scram-verifier.mjs); A=$(printf '%s' "$(pw "$DATABASE_URL_APP")" | node deploy/scram-verifier.mjs); S=$(printf '%s' "$(pw "$DATABASE_URL_SYSTEM")" | node deploy/scram-verifier.mjs)
sudo -u postgres psql -X -q -d "$DB" -v legacy_rol=mijnruimte -v "migrator_scram=$M" -v "app_scram=$A" -v "systeem_scram=$S" -f deploy/db-rollen.sql
export DATABASE_URL="$(om "$DATABASE_URL")" DATABASE_URL_MIGRATIE="$(om "$DATABASE_URL_MIGRATIE")" DATABASE_URL_APP="$(om "$DATABASE_URL_APP")" DATABASE_URL_SYSTEM="$(om "$DATABASE_URL_SYSTEM")"
node -e "require('esbuild').buildSync({entryPoints:['server/migrate.ts'],outfile:'/tmp/ru-migreer-$DB.mjs',bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'})"
cp "/tmp/ru-migreer-$DB.mjs" "$REPO/.ru-migreer.mjs"; MIGRATIONS_DIR="$REPO/migrations" node "$REPO/.ru-migreer.mjs"; rm -f "$REPO/.ru-migreer.mjs"
echo "database $DB klaar"
