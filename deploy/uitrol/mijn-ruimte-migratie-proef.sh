#!/usr/bin/env bash
# mijn-ruimte-migratie-proef.sh — UITROL-001: proef van NIEUWE databasemigraties op een wegwerpkopie van het schema, vóór de upload
# en als eerste stap van elke installatie. Перевірка нових міграцій на тимчасовій копії схеми ще до завантаження архіву.
#
# Waarom: release 20261109-065647 viel pas na upload, npm ci en bouwen om in «databasemigraties» (migratie 0200: 301 tekens tegen
# CHECK ≤ 300). Een CHECK, UNIQUE of NOT NULL bestaat alleen in de database; zonder de migratie echt uit te voeren ziet niemand het.
#
# Veiligheid (de productiedatabase wordt NOOIT geraakt; er draait nooit SQL met meer rechten dan de echte migratie):
#   1. Geïnstalleerd als /usr/local/sbin/mijn-ruimte-migratie-proef (root:root 0755), gestart door mijn-ruimte-proef.path zodra de site
#      een verzoek proef-<id>.json in /srv/mijn-ruimte/proef-inbox legt. De site kan verder niets: alleen dat ene bestand schrijven.
#   2. Het verzoek wordt eerst naar een root-map (0700) gekopieerd en uit de inbox gehaald; daarna telt alleen de kopie (geen TOCTOU).
#      Strikte vorm: id, versie, ≤ 60 migraties met naam NNNN_[a-z0-9_]+, samen ≤ 1 MB SQL.
#   3. Als postgres: lege database mijnruimte_proef_<stempel> (eigenaar = de migratierol), daarin het SCHEMA van de productiedatabase
#      (pg_dump --schema-only) plus alleen app.schema_migrations. Geen gebruikersgegevens: versleutelde ruimtes blijven buiten de proef.
#   4. De SQL uit het pakket draait ALLEEN als de app-gebruiker via systemd-run (NoNewPrivileges, ProtectSystem=strict) met de
#      migratierol (NOSUPERUSER, zie deploy/db-rollen.sql) in dist-server/migratie-proef.mjs, die elke andere databasenaam weigert.
#      Nooit via psql (meta-opdrachten als \! zouden een shell openen) en nooit als postgres.
#   5. Daarna DROP DATABASE … WITH (FORCE); de uitslag (per migratie duur, bij een fout code/bericht/regel/beperking) gaat naar
#      /var/lib/mijn-ruimte-uitrol-status/proef/<id>.json (root:mijnruimte 0640). De site leest alleen dat bestand.
# Tweede vorm (installer, deploy/installeer-app.sh): mijn-ruimte-migratie-proef --map <migrations-map> --uit <json> [--script <migratie-proef.mjs>]
# Exitcodes: 0 = alle nieuwe migraties slagen; 4 = een migratie faalt (uitslag noemt welke en waarom); 2 = proef niet uitvoerbaar.
set -euo pipefail
umask 077
export LC_ALL=C

# Paden overschrijven kan alleen in tests (niet als root); de root-dienst gebruikt altijd de vaste paden.
if [ "$(id -u)" -eq 0 ]; then unset PROEF_INBOX PROEF_STATUS_DIR PROEF_WERK PROEF_GROEP PROEF_GEBRUIKER PROEF_GEHEIMEN PROEF_MIGRATIE_ENV PROEF_SCRIPT 2>/dev/null || true; fi
INBOX="${PROEF_INBOX:-/srv/mijn-ruimte/proef-inbox}"
STATUS_DIR="${PROEF_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}/proef"
WERK_ROOT="${PROEF_WERK:-/var/lib/mijn-ruimte-proef}"
GROEP="${PROEF_GROEP:-mijnruimte}"
GEBRUIKER="${PROEF_GEBRUIKER:-mijnruimte}"
GEHEIMEN="${PROEF_GEHEIMEN:-/etc/mijn-ruimte/geheimen.env}"
MIGRATIE_ENV="${PROEF_MIGRATIE_ENV:-/etc/mijn-ruimte/migratie.env}"
NODE="${NODE:-/usr/bin/node}"
SCRIPT_STANDAARD="${PROEF_SCRIPT:-/srv/mijn-ruimte/current/dist-server/migratie-proef.mjs}"
LOCK="${PROEF_WERK:+$PROEF_WERK/.lock}"; LOCK="${LOCK:-/run/lock/mijn-ruimte-migratie-proef.lock}"
MAX_VERZOEK=$((2 * 1024 * 1024))

ms() { date +%s%3N; }
zeg() { printf '[proef] %s %s\n' "$(date +%H:%M:%S.%3N)" "$*" >&2; }

# Rol en databasenaam uit de migratie-URL (migratie.env, anders geheimen.env). Alleen naam en database, nooit het wachtwoord.
db_gegevens() {
  python3 - "$MIGRATIE_ENV" "$GEHEIMEN" <<'PY'
import sys, re, urllib.parse
for pad in sys.argv[1:]:
    try: regels = open(pad, encoding="utf-8").read().splitlines()
    except OSError: continue
    for sleutel in ("DATABASE_URL_MIGRATIE", "DATABASE_URL"):
        for r in regels:
            m = re.match(r"\s*(?:export\s+)?" + sleutel + r"=(.*)$", r)
            if not m: continue
            u = urllib.parse.urlparse(m.group(1).strip().strip("\"'"))
            db = (u.path or "/").lstrip("/")
            if u.username and re.fullmatch(r"[A-Za-z0-9_]{1,63}", u.username) and re.fullmatch(r"[A-Za-z0-9_]{1,63}", db) and u.hostname in ("127.0.0.1", "localhost", "::1", None):
                print(u.username); print(db); sys.exit(0)
print(""); print("")
PY
}
pg_root() { runuser -u postgres -- "$@"; }

# proef <map met .sql> <uitbestand> <script> → exitcode 0/4/2; schrijft altijd een JSON-uitslag.
proef() {
  local map="$1" uit="$2" script="$3" rol db live t0 t1 t2 t3 t4 rc=0 werk
  werk="$(dirname "$uit")"
  mapfile -t g < <(db_gegevens); rol="${g[0]:-}"; live="${g[1]:-}"
  niet() { python3 - "$uit" "$1" "$2" <<'PY'
import json, sys, datetime
json.dump({"id": "", "ok": False, "status": "niet-beschikbaar", "code": sys.argv[2], "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat(), "stappen": [], "migraties": [], "log": [sys.argv[3]]}, open(sys.argv[1], "w"))
PY
  zeg "niet uitgevoerd: $2"; return 2; }
  [ -n "$rol" ] && [ -n "$live" ] || { niet GEEN_MIGRATIE_URL "geen lokale migratie-URL in $MIGRATIE_ENV/$GEHEIMEN"; return 2; }
  id postgres >/dev/null 2>&1 && command -v pg_dump >/dev/null 2>&1 && command -v psql >/dev/null 2>&1 || { niet GEEN_POSTGRES_HULPMIDDELEN "pg_dump/psql of de postgres-gebruiker ontbreekt"; return 2; }
  [ -s "$script" ] || { niet GEEN_PROEFSCRIPT "$script ontbreekt (eerst een release met UITROL-001 installeren)"; return 2; }
  # Achtergebleven proefdatabases (afgebroken run) eerst opruimen.
  for d in $(pg_root psql -X -At -d postgres -c "SELECT datname FROM pg_database WHERE datname LIKE 'mijnruimte\\_proef\\_%'" 2>/dev/null); do
    pg_root psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" >/dev/null 2>&1 || true
  done
  db="mijnruimte_proef_$(date +%Y%m%d%H%M%S)_$$"
  t0="$(ms)"
  zeg "kopie: database $db (eigenaar $rol)"
  pg_root psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"$db\" OWNER \"$rol\"" >/dev/null 2>&1 || { niet DB_NIET_AANGEMAAKT "database $db niet aan te maken"; return 2; }
  t1="$(ms)"
  zeg "schema: pg_dump --schema-only $live → $db"
  # pg_dump-uitvoer komt van postgres zelf (vertrouwd); fouten van extensies e.d. stoppen de restore niet, ze staan in het logboek.
  if ! { pg_root pg_dump --schema-only "$live" && pg_root pg_dump --data-only --table=app.schema_migrations "$live"; } 2>"$werk/dump.err" \
       | pg_root psql -X -q -d "$db" >/dev/null 2>"$werk/restore.err"; then
    zeg "LET OP: herstel van het schema meldde fouten (zie restore.err)"
  fi
  t2="$(ms)"
  zeg "migraties: $(find "$map" -maxdepth 1 -name '*.sql' | wc -l) aangeboden"
  mkdir -p "$werk/uit"; chgrp "$GEBRUIKER" "$werk/uit" 2>/dev/null || true; chmod 0770 "$werk/uit"
  chgrp -R "$GEBRUIKER" "$map" 2>/dev/null || true; chmod 0750 "$map"; find "$map" -type f -exec chmod 0640 {} +
  set +e
  systemd-run --quiet --wait --pipe --collect --unit="mijn-ruimte-proef-$(date +%s)-$$" \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p EnvironmentFile="$GEHEIMEN" -p EnvironmentFile=-"$MIGRATIE_ENV" \
    -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p ReadWritePaths="$werk/uit" \
    -p MemoryMax=512M -p TimeoutStartSec=300 -p RuntimeMaxSec=300 \
    -E PROEF_DB="$db" -E PROEF_TIJD_MS=120000 -E PATH="$(dirname "$NODE"):/usr/bin:/bin" \
    "$NODE" "$script" --map "$map" --uit "$werk/uit/uitslag.json"
  rc=$?
  set -e
  t3="$(ms)"
  pg_root psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1 || zeg "LET OP: $db niet verwijderd"
  t4="$(ms)"
  zeg "opgeruimd: $db (code $rc)"
  python3 - "$werk/uit/uitslag.json" "$uit" "$t0" "$t1" "$t2" "$t3" "$t4" "$rc" "$werk/restore.err" <<'PY'
import json, sys, datetime
bron, doel, t0, t1, t2, t3, t4, rc, err = sys.argv[1:10]
t0, t1, t2, t3, t4, rc = map(int, (t0, t1, t2, t3, t4, rc))
try: d = json.load(open(bron, encoding="utf-8"))
except Exception: d = {"ok": False, "status": "fout", "code": "PROEF_GEEN_UITSLAG", "migraties": [], "log": ["het proefprogramma schreef geen uitslag (code %d)" % rc]}
d.setdefault("tijd", datetime.datetime.now(datetime.timezone.utc).isoformat())
d["stappen"] = [{"id": "kopie", "ms": t1 - t0, "ok": True}, {"id": "schema", "ms": t2 - t1, "ok": True}, {"id": "migraties", "ms": t3 - t2, "ok": bool(d.get("ok"))}, {"id": "opruimen", "ms": t4 - t3, "ok": True}]
try:
    fouten = [r for r in open(err, encoding="utf-8", errors="replace").read().splitlines() if "ERROR" in r][:5]
    if fouten: d.setdefault("log", []).extend(["schema-herstel: " + f[:200] for f in fouten])
except OSError: pass
json.dump(d, open(doel, "w", encoding="utf-8"), ensure_ascii=False)
PY
  case "$rc" in 0) return 0 ;; 4) return 4 ;; *) return 2 ;; esac
}

# ---- installer-vorm
if [ "${1:-}" = "--map" ]; then
  MAP="${2:?map}"; UIT=""; SCRIPT="$SCRIPT_STANDAARD"
  shift 2
  while [ $# -gt 0 ]; do case "$1" in --uit) UIT="$2"; shift 2 ;; --script) SCRIPT="$2"; shift 2 ;; *) shift ;; esac; done
  [ -n "$UIT" ] || { echo "gebruik: $0 --map <map> --uit <json> [--script <mjs>]" >&2; exit 2; }
  # Niet onder /tmp: systemd-run draait met PrivateTmp en zou de map niet zien.
  mkdir -p "$WERK_ROOT"; chmod 0711 "$WERK_ROOT"
  W="$(mktemp -d "$WERK_ROOT/i.XXXXXX")"; chgrp "$GEBRUIKER" "$W" 2>/dev/null || true; chmod 0750 "$W"; trap 'rm -rf -- "$W"' EXIT
  mkdir -m 0750 "$W/mig"
  find "$MAP" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{4}_[a-z0-9_]+\.sql' -exec cp -t "$W/mig" {} +
  rc=0; proef "$W/mig" "$W/uitslag.json" "$SCRIPT" || rc=$?
  cp -f "$W/uitslag.json" "$UIT" 2>/dev/null || true
  exit "$rc"
fi

# ---- verzoeken van de site
# 0711: de app-gebruiker mag er alleen doorheen naar de eigen werkmap van één proef (root:mijnruimte 0750), niets opsommen.
mkdir -p "$WERK_ROOT" "$STATUS_DIR"; chmod 0711 "$WERK_ROOT"; chgrp "$GROEP" "$STATUS_DIR" 2>/dev/null || true; chmod 0750 "$STATUS_DIR"
exec 9>"$LOCK"; flock -n 9 || { zeg "er loopt al een proef"; exit 0; }
shopt -s nullglob
for verzoek in "$INBOX"/proef-*.json; do
  naam="$(basename "$verzoek")"
  [[ "$naam" =~ ^proef-([a-f0-9-]{8,64})\.json$ ]] || { rm -f -- "$verzoek"; continue; }
  id="${BASH_REMATCH[1]}"
  W="$(mktemp -d "$WERK_ROOT/v.XXXXXX")"; chgrp "$GEBRUIKER" "$W" 2>/dev/null || true; chmod 0750 "$W"
  # Kopie eerst (geen symlinks volgen, begrensd), dan uit de inbox.
  if [ -L "$verzoek" ] || [ ! -f "$verzoek" ] || [ "$(stat -c %s "$verzoek")" -gt "$MAX_VERZOEK" ]; then rm -f -- "$verzoek"; rm -rf -- "$W"; continue; fi
  cp --no-dereference -- "$verzoek" "$W/verzoek.json"; chmod 0600 "$W/verzoek.json"; rm -f -- "$verzoek"
  mkdir -m 0750 "$W/mig"
  doel="$STATUS_DIR/$id.json"; tmp="$STATUS_DIR/.$id.tmp"
  printf '{"id":"%s","ok":false,"status":"bezig","tijd":"%s","stappen":[],"migraties":[]}\n' "$id" "$(date -u +%FT%TZ)" > "$tmp"; chgrp "$GROEP" "$tmp" 2>/dev/null || true; chmod 0640 "$tmp"; mv -f "$tmp" "$doel"
  if ! python3 - "$W/verzoek.json" "$W/mig" "$id" <<'PY'
import json, re, sys, os
pad, map_, ident = sys.argv[1:4]
d = json.load(open(pad, encoding="utf-8"))
assert d.get("id") == ident, "id"
mig = d.get("migraties")
assert isinstance(mig, list) and 0 < len(mig) <= 60, "aantal"
totaal = 0
for m in mig:
    naam, sql = m.get("naam"), m.get("sql")
    assert isinstance(naam, str) and re.fullmatch(r"\d{4}_[a-z0-9_]+", naam), "naam"
    assert isinstance(sql, str), "sql"
    totaal += len(sql.encode("utf-8"))
    assert totaal <= 1024 * 1024, "omvang"
    with open(os.path.join(map_, naam + ".sql"), "w", encoding="utf-8") as f: f.write(sql)
PY
  then
    printf '{"id":"%s","ok":false,"status":"fout","code":"VERZOEK_ONGELDIG","tijd":"%s","stappen":[],"migraties":[]}\n' "$id" "$(date -u +%FT%TZ)" > "$tmp"
  else
    rc=0; proef "$W/mig" "$W/uitslag.json" "$SCRIPT_STANDAARD" || rc=$?
    python3 - "$W/uitslag.json" "$tmp" "$id" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8")); d["id"] = sys.argv[3]
json.dump(d, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
PY
  fi
  chgrp "$GROEP" "$tmp" 2>/dev/null || true; chmod 0640 "$tmp"; mv -f "$tmp" "$doel"
  rm -rf -- "$W"
  zeg "verzoek $id klaar"
done
# Alleen de laatste 50 uitslagen bewaren.
ls -1t "$STATUS_DIR"/*.json 2>/dev/null | tail -n +51 | xargs -r rm -f --
exit 0
