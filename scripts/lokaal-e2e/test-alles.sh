#!/bin/bash
# Herstart lokale server + testproxy en draai rooktest en browsertest.
cd "$(dirname "$0")/../.."
export PATH=/opt/node24/bin:$PATH
set -a; . "${GEHEIMEN:-/workspace/.lokaal/geheimen.env}"; set +a   # DATABASE_URL, TOTP_ENCRYPTION_KEY_V1, RECOVERY_CODE_PEPPER
export UPLOADS_DIR=/tmp/mr-uploads
export OWNER_EMAIL=rooktest-eigenaar@example.test
for p in $(pgrep -f "^node dist-server/start.mjs") $(pgrep -f "^node /tmp/pw/proxy.mjs"); do kill $p; done
sleep 0.5
mkdir -p /tmp/mr-uploads
node dist-server/migrate.mjs
PORT=8080 DIST_DIR=dist DASHBOARD_DIR=/tmp/mr-dashboard setsid nohup node dist-server/start.mjs > /tmp/mr-server.log 2>&1 < /dev/null &
cp scripts/lokaal-e2e/*.mjs /tmp/pw/
setsid nohup node /tmp/pw/proxy.mjs > /tmp/pw/proxy.log 2>&1 < /dev/null &
sleep 1.5
node scripts/rooktest-lokaal.mjs; R1=$?
node scripts/eenheidstests.mjs; R3=$?
cd /tmp/pw; timeout 150 node e2e.mjs; R2=$?
echo "rooktest=$R1 eenheid=$R3 e2e=$R2"
