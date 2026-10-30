#!/bin/bash
# Visuele regressie van de ZUIVERE donkere omzetting (zonder site) op 390/768/1440, licht+donker, via scripts/visueel-mail.mjs
# en het corpus tests/hulp/mails/ van agent 3 (tak ruimtes2-3-mail). ALLEEN LOKAAL; het script blokkeert elk netwerk.
# Gebruik: scripts/lokaal-e2e/ruimtes-visueel-zuiver.sh [--bijwerken] [extra opties van visueel-mail.mjs]
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$REPO"; export PATH=/opt/node24/bin:$PATH
if [ ! -f scripts/visueel-mail.mjs ] || [ ! -d tests/hulp/mails ]; then
  echo "scripts/visueel-mail.mjs of tests/hulp/mails ontbreekt: eerst de tak ruimtes2-3-mail samenvoegen." >&2; exit 2
fi
UIT="${SHOTS:-/workspace/ru-uitslag}/zuiver"; mkdir -p "$UIT"
exec node scripts/visueel-mail.mjs --breedtes 390,768,1440 --themas licht,donker --uit "$UIT" --json "$UIT/uitslag.json" "$@"
