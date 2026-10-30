#!/bin/bash
# Alle ruimtes-suites in één opdracht (ALLEEN LOKAAL). Bouwt eerst (--bouw), start server+proxy op een eigen database
# en draait: lekkage, directe URL, visueel in de site, visueel zuiver (als de tak van agent 3 er is), eenheidstests compatibiliteit.
# Gebruik: scripts/lokaal-e2e/ruimtes-alles.sh [--bouw]      uitslagen: /workspace/ru-uitslag/*.json
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$REPO"; export PATH=/opt/node24/bin:$PATH
eval "$(scripts/lokaal-e2e/ruimtes-start.sh "${1:-}" | tail -1)"
fout=0
for s in ruimtes-lekkage ruimtes-directe-url ruimtes-visueel-mail; do echo "== $s"; node scripts/lokaal-e2e/$s.mjs | tail -3 || fout=1; done
if [ -f scripts/visueel-mail.mjs ]; then echo "== zuiver"; scripts/lokaal-e2e/ruimtes-visueel-zuiver.sh | tail -3 || fout=1; fi
if ls tests/eenheid/ruimtes-compatibiliteit-*.test.ts >/dev/null 2>&1; then echo "== compatibiliteit"; ( set -a; . /workspace/.lokaal/geheimen.env; set +a; DB="${RU_DB:-ru4}"; for v in DATABASE_URL DATABASE_URL_MIGRATIE DATABASE_URL_APP DATABASE_URL_SYSTEM; do export $v="$(printf '%s' "${!v}" | sed -E "s#/[A-Za-z0-9_]+\$#/$DB#")"; done; node scripts/eenheidstests.mjs ruimtes-compatibiliteit | tail -3 ) || fout=1; fi
exit $fout
