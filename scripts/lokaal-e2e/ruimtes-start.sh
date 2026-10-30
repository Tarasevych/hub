#!/bin/bash
# Start (of herstart) server + proxy voor de ruimtes-suites op eigen poorten en een eigen database. ALLEEN LOKAAL.
# Gebruik: scripts/lokaal-e2e/ruimtes-start.sh [--bouw]   (omgeving: RU_DB=ru4 RU_APP_POORT=8094 RU_PROXY_POORT=8494)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$REPO"; export PATH=/opt/node24/bin:$PATH
DB="${RU_DB:-ru4}"; AP="${RU_APP_POORT:-8094}"; PP="${RU_PROXY_POORT:-8494}"
[ "${1:-}" = "--bouw" ] && { npx vite build >/tmp/ru-bouw.log 2>&1; npm run build:server >>/tmp/ru-bouw.log 2>&1; }
scripts/lokaal-e2e/ruimtes-db.sh "$DB" >/tmp/ru-db.log 2>&1
set -a; . "${GEHEIMEN:-/workspace/.lokaal/geheimen.env}"; set +a
om() { echo "$1" | sed -E "s#/[A-Za-z0-9_]+\$#/$DB#"; }
export DATABASE_URL="$(om "$DATABASE_URL")" DATABASE_URL_MIGRATIE="$(om "$DATABASE_URL_MIGRATIE")" DATABASE_URL_APP="$(om "$DATABASE_URL_APP")" DATABASE_URL_SYSTEM="$(om "$DATABASE_URL_SYSTEM")"
export AUDIT_IP_PEPPER="${AUDIT_IP_PEPPER:-$(printf "ru-lokaal-%s" "$DB" | sha256sum | cut -c1-48)}"
export UPLOADS_DIR=/tmp/ru-uploads-$DB; mkdir -p "$UPLOADS_DIR"
for p in $(pgrep -f "RU_TAG=$DB" || true); do kill "$p" || true; done; sleep 0.5
OWNER_EMAIL="${OWNER_EMAIL:-ru-eigenaar@example.test}" RU_TAG=$DB PORT=$AP DIST_DIR=dist DASHBOARD_DIR=/tmp/ru-dashboard setsid nohup env RU_TAG=$DB OWNER_EMAIL="${OWNER_EMAIL:-ru-eigenaar@example.test}" node dist-server/start.mjs >/tmp/ru-server-$DB.log 2>&1 </dev/null &
RU_PROXY_POORT=$PP RU_APP_POORT=$AP setsid nohup env RU_TAG=$DB node scripts/lokaal-e2e/ruimtes-proxy.mjs >/tmp/ru-proxy-$DB.log 2>&1 </dev/null &
for i in $(seq 1 40); do curl -sk -o /dev/null "http://127.0.0.1:$AP/" && break; sleep 0.5; done
echo "server $AP + proxy $PP op database $DB (log /tmp/ru-server-$DB.log)"
echo "export DATABASE_URL='$DATABASE_URL' PROXY_PORT=$PP"
