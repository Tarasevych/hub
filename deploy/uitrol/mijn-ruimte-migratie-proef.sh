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
#   3. Als postgres: een EENMALIGE rol mijnruimte_proef_<stempel> (LOGIN, willekeurig wachtwoord dat alleen als SCRAM-verifier bij
#      Postgres komt, NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS, lid van niets, één verbinding, wachtwoord 20 min geldig) en
#      een lege database met dezelfde naam waarvan die rol eigenaar is. Daarin het SCHEMA van de productiedatabase
#      (pg_dump --schema-only --no-owner, teruggezet onder die rol) plus alleen app.schema_migrations. Geen gebruikersgegevens:
#      versleutelde ruimtes blijven buiten de proef.
#   4. De SQL uit het pakket draait ALLEEN als de app-gebruiker via systemd-run (NoNewPrivileges, ProtectSystem=strict) met die
#      eenmalige rol in dist-server/migratie-proef.mjs, die elke andere databasenaam en elke andere rol weigert. De unit krijgt
#      alleen de proef-URL: geheimen.env en migratie.env (DATABASE_URL_MIGRATIE) bereiken de proef niet meer.
#      Nooit via psql (meta-opdrachten als \! zouden een shell openen) en nooit als postgres.
#      SEC-002 (server-uitrol-04): vroeger draaide deze SQL met de GEDEELDE migratierol. `ALTER ROLE <zichzelf> PASSWORD …` en
#      `ALTER ROLE <zichzelf> SET …` gelden voor het hele cluster en overleven de wegwerpdatabase: elke volgende installatie viel dan
#      om in «databasemigraties», en wie het nieuwe wachtwoord kende had de eigenaar van alle app-tabellen. De eenmalige rol kan
#      alleen zichzelf wijzigen en wordt na de proef verwijderd. Schijf: temp_file_limit (door postgres gezet, niet te verhogen) en
#      een bewaker die de proef beëindigt zodra de wegwerpdatabase meer dan PROEF_MAX_GROEI_MB groeit.
#   5. Daarna DROP DATABASE … WITH (FORCE) en DROP ROLE; de uitslag (per migratie duur, bij een fout code/bericht/regel/beperking)
#      gaat naar /var/lib/mijn-ruimte-uitrol-status/proef/<id>.json (root:mijnruimte 0640). De site leest alleen dat bestand.
# Tweede vorm (installer, deploy/installeer-app.sh): mijn-ruimte-migratie-proef --map <migrations-map> --uit <json> [--script <migratie-proef.mjs>]
# Exitcodes: 0 = alle nieuwe migraties slagen; 4 = een migratie faalt (uitslag noemt welke en waarom); 2 = proef niet uitvoerbaar.
set -euo pipefail
umask 077
export LC_ALL=C

# Paden overschrijven kan alleen in tests (niet als root); de root-dienst gebruikt altijd de vaste paden.
if [ "$(id -u)" -eq 0 ]; then unset PROEF_INBOX PROEF_STATUS_DIR PROEF_WERK PROEF_GROEP PROEF_GEBRUIKER PROEF_GEHEIMEN PROEF_MIGRATIE_ENV PROEF_SCRIPT PROEF_MAX_GROEI_MB 2>/dev/null || true; fi
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
# Hoeveel de wegwerpdatabase tijdens de proef mag groeien (MB). Een kopie zonder gegevens groeit door echte migraties nauwelijks.
MAX_GROEI_MB="${PROEF_MAX_GROEI_MB:-1024}"; [[ "$MAX_GROEI_MB" =~ ^[0-9]{1,6}$ ]] || MAX_GROEI_MB=1024
PROEF_NAAM_RE='^mijnruimte_proef_[a-z0-9_]{1,40}$'

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

# SEC-002 (server-uitrol-02): de inbox is van de app-gebruiker. Vroeger: `[ -L ] … stat` en daarna `cp --no-dereference` + `chmod 0600`
# op naam — verwisselde de app het bestand tussen controle en kopie voor een symlink, dan kopieerde cp de LINK en volgde chmod haar
# (willekeurig bestand werd 0600: /etc/passwd onleesbaar = server onbruikbaar), en python las daarna als root het doel van de link.
# Nu één keer openen met O_NOFOLLOW|O_NONBLOCK, op de open descriptor controleren (gewoon bestand, één naam, begrensd) en de bytes
# in een NIEUW root-bestand (O_EXCL, 0600) schrijven. Zelfde vorm als leesBegrensd in deploy/goedkeuring/goedkeur-hulp.mjs.
# Файл із теки застосунку відкривається один раз без переходу за посиланням; перевірка — на відкритому дескрипторі.
begrensd_overnemen() { # begrensd_overnemen <bron> <doel> <max bytes> → 0 = overgenomen, 1 = geweigerd
  python3 - "$1" "$2" "$3" <<'PY'
import os, stat, sys
bron, doel, grens = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    fd = os.open(bron, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
except OSError:
    sys.exit(1)
try:
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size > grens:
        sys.exit(1)
    data = b""
    while len(data) <= grens:
        stuk = os.read(fd, 65536)
        if not stuk:
            break
        data += stuk
    if len(data) > grens:
        sys.exit(1)
finally:
    os.close(fd)
uit = os.open(doel, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
with os.fdopen(uit, "wb") as f:
    f.write(data)
PY
}

# ---- SEC-002 (server-uitrol-04): eenmalige rol voor de proef ----
SCRAM_RE='^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
# proef_rol_env <envbestand> <naam>: maakt een willekeurig wachtwoord, schrijft de proef-URL in <envbestand> (0600, alleen root) en
# drukt ALLEEN de SCRAM-SHA-256-verifier af. Uit de bestaande migratie-URL komen host, poort en opties; rol, wachtwoord en database
# worden vervangen. Het wachtwoord staat nergens anders dan in dat bestand en verdwijnt met de rol.
proef_rol_env() {
  python3 - "$1" "$2" "$MIGRATIE_ENV" "$GEHEIMEN" <<'PY'
import base64, hashlib, hmac, os, re, secrets, sys, urllib.parse
doel, naam = sys.argv[1], sys.argv[2]
if not re.fullmatch(r"mijnruimte_proef_[a-z0-9_]{1,40}", naam): sys.exit(1)
basis = None
for pad in sys.argv[3:]:
    try: regels = open(pad, encoding="utf-8").read().splitlines()
    except OSError: continue
    for sleutel in ("DATABASE_URL_MIGRATIE", "DATABASE_URL"):
        for r in regels:
            m = re.match(r"\s*(?:export\s+)?" + sleutel + r"=(.*)$", r)
            if not m: continue
            u = urllib.parse.urlparse(m.group(1).strip().strip("\"'"))
            db = (u.path or "/").lstrip("/")
            if u.username and re.fullmatch(r"[A-Za-z0-9_]{1,63}", u.username) and re.fullmatch(r"[A-Za-z0-9_]{1,63}", db) and u.hostname in ("127.0.0.1", "localhost", "::1", None):
                basis = u; break
        if basis: break
    if basis: break
if basis is None: sys.exit(1)
wachtwoord = secrets.token_urlsafe(32)
url = urllib.parse.urlunparse((basis.scheme, "%s:%s@%s" % (naam, wachtwoord, basis.netloc.rsplit("@", 1)[-1]), "/" + naam, "", basis.query, ""))
if re.search(r"['\\\s]", url): sys.exit(1)
zout = secrets.token_bytes(16)
gezouten = hashlib.pbkdf2_hmac("sha256", wachtwoord.encode(), zout, 4096)
opgeslagen = hashlib.sha256(hmac.new(gezouten, b"Client Key", hashlib.sha256).digest()).digest()
server = hmac.new(gezouten, b"Server Key", hashlib.sha256).digest()
b64 = lambda b: base64.b64encode(b).decode()
fd = os.open(doel, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    # DATABASE_URL_MIGRATIE = dezelfde eenmalige URL: een OUDER migratie-proef.mjs (van vóór SEC-002, bv. na terugdraaien) leest alleen die naam.
    f.write("PROEF_DATABASE_URL='%s'\nDATABASE_URL_MIGRATIE='%s'\n" % (url, url))
print("SCRAM-SHA-256$4096:%s$%s:%s" % (b64(zout), b64(opgeslagen), b64(server)))
PY
}
# Eenmalige rol verwijderen (open sessies eerst beëindigen). Lukt verwijderen niet, dan kan de rol in elk geval niet meer aanmelden.
proef_rol_weg() {
  local r="$1"
  [[ "$r" =~ $PROEF_NAAM_RE ]] || return 0
  pg_root psql -X -q -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '$r'" >/dev/null 2>&1 || true
  pg_root psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP ROLE IF EXISTS \"$r\"" >/dev/null 2>&1 && return 0
  pg_root psql -X -q -d postgres -c "ALTER ROLE \"$r\" NOLOGIN PASSWORD NULL" >/dev/null 2>&1 || true
  zeg "LET OP: eenmalige rol $r niet verwijderd (aanmelden is uitgezet); verwijder haar als postgres met DROP OWNED/DROP ROLE"
  return 0
}
# Grootte van een database in bytes (0 als die niet te bepalen is) en vrije bytes op de schijf van de database (leeg = onbekend).
pg_grootte() { local n; n="$(pg_root psql -X -At -d postgres -c "SELECT pg_database_size('$1')" 2>/dev/null || true)"; [[ "$n" =~ ^[0-9]+$ ]] && printf '%s' "$n" || printf '0'; }
pg_datamap() { pg_root psql -X -At -d postgres -c 'SHOW data_directory' 2>/dev/null || true; }
pg_vrij() { # pg_vrij <datamap>
  local n
  [ -n "${1:-}" ] || return 0
  n="$(df --output=avail -B1 -- "$1" 2>/dev/null | tail -n 1 | tr -d ' ' || true)"
  [[ "$n" =~ ^[0-9]+$ ]] && printf '%s' "$n"
  return 0
}

# proef <map met .sql> <uitbestand> <script> → exitcode 0/4/2; schrijft altijd een JSON-uitslag.
proef() {
  local map="$1" uit="$2" script="$3" rol db live t0 t1 t2 t3 t4 rc=0 werk verifier vrij basis grens grootte spid d datamap
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
  # Achtergebleven proefdatabases en eenmalige rollen (afgebroken run) eerst opruimen.
  for d in $(pg_root psql -X -At -d postgres -c "SELECT datname FROM pg_database WHERE datname LIKE 'mijnruimte\\_proef\\_%'" 2>/dev/null); do
    pg_root psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" >/dev/null 2>&1 || true
  done
  for d in $(pg_root psql -X -At -d postgres -c "SELECT rolname FROM pg_roles WHERE rolname LIKE 'mijnruimte\\_proef\\_%' AND NOT rolsuper" 2>/dev/null); do
    proef_rol_weg "$d"
  done
  # Vrije schijfruimte bij de database (alleen als die te bepalen is): zonder marge voor de groeigrens niet beginnen.
  datamap="$(pg_datamap)"; vrij="$(pg_vrij "$datamap")"
  if [ -n "$vrij" ] && [ "$vrij" -lt $(( (MAX_GROEI_MB + 512) * 1024 * 1024 )) ]; then
    niet TE_WEINIG_SCHIJF "te weinig vrije schijfruimte bij de database voor een proef ($((vrij / 1048576)) MB vrij, nodig $((MAX_GROEI_MB + 512)) MB)"; return 2
  fi
  # Database én rol heten gelijk: mijnruimte_proef_<stempel>_<pid>. De rol bestaat alleen voor deze ene proef.
  db="mijnruimte_proef_$(date +%Y%m%d%H%M%S)_$$"
  t0="$(ms)"
  zeg "kopie: database $db met een eenmalige rol van dezelfde naam (de migratierol $rol wordt niet gebruikt)"
  rm -f -- "$werk/proef.env"
  verifier="$(proef_rol_env "$werk/proef.env" "$db")" || verifier=""
  [[ "$verifier" =~ $SCRAM_RE ]] || { rm -f -- "$werk/proef.env"; niet PROEFROL_NIET_VOORBEREID "de eenmalige rol kon niet worden voorbereid (migratie-URL onleesbaar?)"; return 2; }
  # Via stdin (niet in de opdrachtregel): alleen de SCRAM-verifier bereikt Postgres, nooit het leesbare wachtwoord.
  if ! printf 'CREATE ROLE "%s" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 1 PASSWORD %s VALID UNTIL %s;\n' \
         "$db" "'$verifier'" "'$(date -u -d '+20 minutes' '+%Y-%m-%d %H:%M:%S+00')'" | pg_root psql -X -q -v ON_ERROR_STOP=1 -d postgres -f - >/dev/null 2>&1; then
    rm -f -- "$werk/proef.env"; niet PROEFROL_NIET_AANGEMAAKT "eenmalige rol $db niet aan te maken"; return 2
  fi
  if ! pg_root psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"$db\" OWNER \"$db\"" >/dev/null 2>&1; then
    proef_rol_weg "$db"; rm -f -- "$werk/proef.env"; niet DB_NIET_AANGEMAAKT "database $db niet aan te maken"; return 2
  fi
  # Alleen postgres kan temp_file_limit zetten; de rol zelf kan de grens binnen de sessie niet verhogen. Vervalt met de database.
  pg_root psql -X -q -d postgres -c "ALTER ROLE \"$db\" IN DATABASE \"$db\" SET temp_file_limit = '${MAX_GROEI_MB}MB'" >/dev/null 2>&1 || zeg "LET OP: temp_file_limit niet gezet"
  pg_root psql -X -q -d postgres -c "REVOKE ALL ON DATABASE \"$db\" FROM PUBLIC" >/dev/null 2>&1 || true
  t1="$(ms)"
  zeg "schema: pg_dump --schema-only --no-owner $live → $db (teruggezet onder de eenmalige rol)"
  # pg_dump-uitvoer komt van postgres zelf (vertrouwd). Ze wordt teruggezet met `role=<eenmalige rol>`: die rol is dan eigenaar van alle
  # objecten in de kopie (zoals de migratierol in productie), zonder lid te zijn van een bestaande rol. Fouten (bv. standaardrechten
  # «FOR ROLE» van een andere rol) stoppen de restore niet; ze staan in het logboek.
  if ! { pg_root pg_dump --schema-only --no-owner "$live" && pg_root pg_dump --data-only --table=app.schema_migrations "$live"; } 2>"$werk/dump.err" \
       | pg_root env PGOPTIONS="-c role=$db" psql -X -q -d "$db" >/dev/null 2>"$werk/restore.err"; then
    zeg "LET OP: herstel van het schema meldde fouten (zie restore.err)"
  fi
  t2="$(ms)"
  zeg "migraties: $(find "$map" -maxdepth 1 -name '*.sql' | wc -l) aangeboden"
  mkdir -p "$werk/uit"; chgrp "$GEBRUIKER" "$werk/uit" 2>/dev/null || true; chmod 0770 "$werk/uit"
  chgrp -R "$GEBRUIKER" "$map" 2>/dev/null || true; chmod 0750 "$map"; find "$map" -type f -exec chmod 0640 {} +
  basis="$(pg_grootte "$db")"; grens=$(( basis + MAX_GROEI_MB * 1024 * 1024 ))
  rm -f -- "$werk/te-groot"
  set +e
  # De unit krijgt ALLEEN proef.env (eenmalige URL; root 0600, systemd leest het als root): geen geheimen.env, geen migratie.env.
  systemd-run --quiet --wait --pipe --collect --unit="mijn-ruimte-proef-$(date +%s)-$$" \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p EnvironmentFile="$werk/proef.env" \
    -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p ReadWritePaths="$werk/uit" \
    -p MemoryMax=512M -p TimeoutStartSec=300 -p RuntimeMaxSec=300 \
    -E PROEF_DB="$db" -E PROEF_TIJD_MS=120000 -E PATH="$(dirname "$NODE"):/usr/bin:/bin" \
    "$NODE" "$script" --map "$map" --uit "$werk/uit/uitslag.json" &
  spid=$!
  # Bewaker: de SQL kan statement_timeout zelf uitzetten en de schijf vullen (CREATE TABLE … AS SELECT … generate_series). Groeit de
  # wegwerpdatabase boven de grens, of raakt de schijf bijna vol, dan worden haar verbindingen beëindigd (de proef eindigt als mislukt).
  while kill -0 "$spid" 2>/dev/null; do
    sleep 1
    grootte="$(pg_grootte "$db")"; vrij="$(pg_vrij "$datamap")"
    if [ "$grootte" -gt "$grens" ] || { [ -n "$vrij" ] && [ "$vrij" -lt $((256 * 1024 * 1024)) ]; }; then
      [ -e "$werk/te-groot" ] || zeg "STOP: proefdatabase $db groeide boven de grens ($((grootte / 1048576)) MB, vrij ${vrij:-?} bytes) — verbindingen beëindigd"
      printf '%s\n' "$((grootte / 1048576))" > "$werk/te-groot"
      pg_root psql -X -q -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db'" >/dev/null 2>&1
    fi
  done
  wait "$spid"
  rc=$?
  set -e
  [ ! -e "$werk/te-groot" ] || rc=4
  t3="$(ms)"
  pg_root psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1 || zeg "LET OP: $db niet verwijderd"
  proef_rol_weg "$db"
  rm -f -- "$werk/proef.env"
  t4="$(ms)"
  zeg "opgeruimd: $db en de eenmalige rol (code $rc)"
  python3 - "$werk/uit/uitslag.json" "$uit" "$t0" "$t1" "$t2" "$t3" "$t4" "$rc" "$werk/restore.err" "$werk/te-groot" "$MAX_GROEI_MB" <<'PY'
import json, os, stat, sys, datetime
bron, doel, t0, t1, t2, t3, t4, rc, err, te_groot, max_mb = sys.argv[1:12]
t0, t1, t2, t3, t4, rc = map(int, (t0, t1, t2, t3, t4, rc))
def lees(pad, grens=4 * 1024 * 1024):
    # $werk/uit is schrijfbaar voor de app-gebruiker (het proefprogramma schrijft er de uitslag): nooit een symlink of fifo volgen.
    fd = os.open(pad, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_size > grens: raise ValueError("geen gewoon bestand of te groot")
        data = b""
        while len(data) <= grens:
            stuk = os.read(fd, 65536)
            if not stuk: break
            data += stuk
        return data[:grens]
    finally:
        os.close(fd)
try:
    d = json.loads(lees(bron).decode("utf-8"))
    if not isinstance(d, dict): raise ValueError("geen object")
except Exception: d = {"ok": False, "status": "fout", "code": "PROEF_GEEN_UITSLAG", "migraties": [], "log": ["het proefprogramma schreef geen uitslag (code %d)" % rc]}
d.setdefault("tijd", datetime.datetime.now(datetime.timezone.utc).isoformat())
if os.path.exists(te_groot):
    # Bewaker greep in: altijd «mislukt», ook als het programma zelf nog een andere uitslag schreef.
    d["ok"] = False; d["status"] = "mislukt"; d["code"] = "PROEF_SCHIJFGRENS"
    d.setdefault("log", []).append("proef beëindigd: de wegwerpdatabase groeide meer dan %s MB (schijfgrens) / пробу зупинено: тимчасова база зросла понад %s МБ" % (max_mb, max_mb))
d["stappen"] = [{"id": "kopie", "ms": t1 - t0, "ok": True}, {"id": "schema", "ms": t2 - t1, "ok": True}, {"id": "migraties", "ms": t3 - t2, "ok": bool(d.get("ok"))}, {"id": "opruimen", "ms": t4 - t3, "ok": True}]
try:
    # «default privileges»: pg_dump zet standaardrechten «FOR ROLE <migratierol>» terug; de eenmalige rol mag die van een ander niet
    # wijzigen. Dat is bedoeld (geen lid van de migratierol) en zegt niets over de migraties.
    fouten = [r for r in open(err, encoding="utf-8", errors="replace").read().splitlines() if "ERROR" in r and "default privileges" not in r][:5]
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
  # Kopie eerst (geen symlinks volgen, begrensd), dan uit de inbox. SEC-002: zie begrensd_overnemen (één open, geen controle-dan-gebruik).
  if ! begrensd_overnemen "$verzoek" "$W/verzoek.json" "$MAX_VERZOEK"; then rm -f -- "$verzoek"; rm -rf -- "$W"; zeg "verzoek $id geweigerd (geen gewoon bestand of te groot)"; continue; fi
  rm -f -- "$verzoek"
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
