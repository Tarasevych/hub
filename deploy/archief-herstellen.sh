#!/usr/bin/env bash
# archief-herstellen.sh (in het archief: vidnovyty.sh) — zet Mijn Ruimte met ÉÉN opdracht terug op een nieuwe machine uit het volledige archief.
#
# Gebruik (als root, vanuit de uitgepakte archiefmap):
#   sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt [--proefrun] [--zonder-tunnel] [--db NAAM] [opties hieronder]
#
#   --sleutel   de age-privésleutel van de eigenaar (herstelsleutel-age.txt). Nodig: database, bestanden en geheimen zijn ermee versleuteld.
#   --proefrun  voert niets uit: toont alleen wat er zou gebeuren (en controleert de controlesommen en de sleutel).
#   --zonder-tunnel  slaat cloudflared over (bijv. als u de tunnel later zelf koppelt).
#   --cloudflared-versie V --cloudflared-sha256 HEX
#               de vastgezette cloudflared-uitgave (bv. 2026.11.0) met de SHA-256 van het .deb-pakket voor DEZE architectuur.
#               Zonder vastgezette versie wordt cloudflared NIET geïnstalleerd: de rest van het herstel loopt gewoon door.
#   --tunnel-ongecontroleerd
#               ! haalt de NIEUWSTE cloudflared op ZONDER controlesom en installeert die als root. Risico: een vervalste of
#               gekaapte uitgave draait dan als root op de machine waar zojuist alle geheimen zijn teruggezet.
#   --node-sha256 HEX   de vastgezette SHA-256 van het Node-archief voor deze architectuur. Zonder: de som uit de officiële
#               SHASUMS256.txt van precies deze Node-uitgave. Het archief wordt nooit uitgepakt als de som niet klopt.
#
# Werkt op Ubuntu/Debian, virtueel of fysiek, x86-64 of ARM (de code wordt opnieuw gebouwd voor deze architectuur; Node en cloudflared worden met SHA-256 gecontroleerd).
# Vereist internet (apt, nodejs.org, npm, cloudflared). Draai dit alleen op een NIEUWE/lege machine: bestaande Mijn Ruimte-data wordt vervangen.
set -euo pipefail

# Vastgezette cloudflared (SEC-002 / SEC-003; nooit «latest» als standaard, altijd een SHA-256 per architectuur).
CF_VERSIE_VAST="2026.11.0"
CF_SHA256_AMD64_VAST="5305dbaf62984e92e7daa29cdd6a35a4797edc23385d4c5b8422ff97eb96a19b"
CF_SHA256_ARM64_VAST="ce671bc2b4afbd16b43f9a3c279527e9e2be8b30b87648047a1f95cccfbacdfd"

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLEUTEL=""; PROEF=0; TUNNEL=1; DB_NAAM="mijnruimte"
CF_VERSIE=""; CF_SHA256=""; NODE_SHA256=""; TUNNEL_ONGECONTROLEERD=0
WERK=""; WERKMAP=""; PG_LOG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --sleutel) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; SLEUTEL="$2"; shift 2 ;;
    --proefrun) PROEF=1; shift ;;
    --zonder-tunnel) TUNNEL=0; shift ;;
    --db) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; DB_NAAM="$2"; shift 2 ;;
    --cloudflared-versie) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; CF_VERSIE="$2"; shift 2 ;;
    --cloudflared-sha256) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; CF_SHA256="$2"; shift 2 ;;
    --node-sha256) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; NODE_SHA256="$2"; shift 2 ;;
    --tunnel-ongecontroleerd) TUNNEL_ONGECONTROLEERD=1; shift ;;
    -h|--help) sed -n 2,20p "$0"; exit 0 ;;
    *) echo "onbekende optie: $1" >&2; exit 2 ;;
  esac
done

# De naam wordt in PostgreSQL-opdrachten gebruikt: alleen een gewone PostgreSQL-naam toestaan.
[[ "$DB_NAAM" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "FOUT: ongeldige databasenaam voor --db: $DB_NAAM" >&2; exit 2; }
if [ -n "$CF_VERSIE" ] || [ -n "$CF_SHA256" ]; then
  [[ "$CF_VERSIE" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,3}$ ]] || { echo "FOUT: --cloudflared-versie moet een uitgave zijn zoals 2026.11.0 (nooit «latest»): $CF_VERSIE" >&2; exit 2; }
  [[ "$CF_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "FOUT: --cloudflared-versie vraagt ook --cloudflared-sha256 (64 hexadecimale tekens, kleine letters)" >&2; exit 2; }
fi
[ -z "$NODE_SHA256" ] || [[ "$NODE_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "FOUT: --node-sha256 moet 64 hexadecimale tekens zijn (kleine letters)" >&2; exit 2; }

PROTO='=https'
if [ -n "${HERSTEL_TEST_BRON:-}" ]; then PROTO='=https,file'; fi

stap() { echo; echo "==> $*"; }
fout() { echo "FOUT: $*" >&2; exit 1; }
doe() { if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $*"; else "$@"; fi; }
doe_fn() { local wat="$1"; shift; if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $wat"; else "$@"; fi; }
werk_pad() { printf '%s' "${WERK:-${WERKMAP:-}}"; }

curl_naar() {
  local doel="$1" url="$2" max_tijd="${3:-900}" proto="$PROTO"
  case "$url" in file://*) proto='=https,file' ;; esac
  curl -fsSL --proto "$proto" --proto-redir "$proto" --tlsv1.2 --max-time "$max_tijd" -o "$doel" "$url"
}

# Downloadt <url> naar <doel> en vergelijkt de SHA-256 met <verwacht> VÓÓR enig gebruik. Klopt die niet, dan blijft er niets liggen.
haal_gecontroleerd() {
  local url="$1" verwacht="$2" doel="$3" echt map naam
  [[ "$verwacht" =~ ^[0-9a-f]{64}$ ]] || { echo "FOUT: geen geldige SHA-256 bekend voor $url — niets opgehaald" >&2; return 1; }
  curl_naar "$doel" "$url" 900 || { rm -f -- "$doel"; echo "FOUT: downloaden mislukt: $url" >&2; return 1; }
  echt="$(sha256sum "$doel" | cut -d' ' -f1)"
  map="$(dirname "$doel")"; naam="$(basename "$doel")"
  if [ "$echt" != "$verwacht" ] || ! ( cd "$map" && printf '%s  %s\n' "$verwacht" "$naam" | sha256sum -c - >/dev/null 2>&1 ); then
    rm -f -- "$doel"
    echo "FOUT: SHA-256 KLOPT NIET voor $url (verwacht $verwacht, kreeg $echt) — niets geïnstalleerd" >&2
    return 1
  fi
}

# Node-archief voor deze architectuur naar $WERK/node.tar.xz, gecontroleerd met SHASUMS256.txt of --node-sha256.
node_ophalen() {
  local w naam basis verwacht="${NODE_SHA256:-}"
  w="$(werk_pad)"
  [ -n "$w" ] && [ -d "$w" ] || { echo "FOUT: tijdelijke werkmap ontbreekt" >&2; return 1; }
  [[ "$NODE_VERSIE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "FOUT: ongeldige Node-versie: $NODE_VERSIE" >&2; return 1; }
  naam="node-v${NODE_VERSIE}-linux-${NODE_ARCH}.tar.xz"
  if [ -n "${NODE_BRON:-}" ]; then
    basis="$NODE_BRON"
  elif [ -n "${HERSTEL_TEST_BRON:-}" ]; then
    basis="$HERSTEL_TEST_BRON/node/v${NODE_VERSIE}"
  else
    basis="https://nodejs.org/dist/v${NODE_VERSIE}"
  fi
  if [ -z "$verwacht" ]; then
    curl_naar "$w/SHASUMS256.txt" "$basis/SHASUMS256.txt" 120 || { echo "FOUT: SHASUMS256.txt van Node $NODE_VERSIE kon niet worden opgehaald" >&2; return 1; }
    verwacht="$(awk -v f="$naam" '{ bestand = $2; sub(/^\*/, "", bestand); if (bestand == f && $1 ~ /^[0-9a-f]{64}$/) { print $1; exit } }' "$w/SHASUMS256.txt")"
  fi
  haal_gecontroleerd "$basis/$naam" "$verwacht" "$w/node.tar.xz"
}

node_installeren() {
  local w doel_lib="${NODE_DOEL:-/usr/local/lib/nodejs}" doel_bin="${NODE_BIN_DOEL:-/usr/bin}" map
  w="$(werk_pad)"
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] node-v${NODE_VERSIE}-linux-${NODE_ARCH}.tar.xz ophalen, SHA-256 controleren en uitpakken naar ${doel_lib}"
    return 0
  fi
  node_ophalen || fout "Node.js $NODE_VERSIE is niet geïnstalleerd: het archief kon niet worden opgehaald of de SHA-256 klopt niet"
  map="$doel_lib/node-v${NODE_VERSIE}-linux-${NODE_ARCH}"
  mkdir -p -- "$doel_lib" "$doel_bin"
  tar -xJf "$w/node.tar.xz" -C "$doel_lib"
  ln -sf "$map/bin/node" "$doel_bin/node"
  ln -sf "$map/bin/npm" "$doel_bin/npm"
  ln -sf "$map/bin/npx" "$doel_bin/npx"
  rm -f -- "$w/node.tar.xz" "$w/SHASUMS256.txt"
}

# cloudflared-pakket naar $WERK/cloudflared.deb. 0 = opgehaald; 3 = geen vastgezette versie en geen --tunnel-ongecontroleerd.
cloudflared_ophalen() {
  local w pakket="cloudflared-linux-${DEB_ARCH}.deb" basis
  w="$(werk_pad)"
  [ -n "$w" ] && [ -d "$w" ] || { echo "FOUT: tijdelijke werkmap ontbreekt" >&2; return 1; }
  basis="${HERSTEL_TEST_BRON:+$HERSTEL_TEST_BRON/cloudflared}"
  basis="${basis:-https://github.com/cloudflare/cloudflared/releases}"
  if [ -n "$CF_VERSIE" ]; then
    haal_gecontroleerd "$basis/download/${CF_VERSIE}/$pakket" "$CF_SHA256" "$w/cloudflared.deb"
    return
  fi
  [ "$TUNNEL_ONGECONTROLEERD" -eq 1 ] || return 3
  echo "  ! LET OP: cloudflared wordt ZONDER controlesom opgehaald (nieuwste uitgave) en als root geïnstalleerd (--tunnel-ongecontroleerd)"
  curl_naar "$w/cloudflared.deb" "$basis/latest/download/$pakket" 900 || { rm -f -- "$w/cloudflared.deb"; return 1; }
}

cloudflared_installeren() {
  local w cf_ver="${CLOUDFLARED_VERSIE:-${CF_VERSIE:-$CF_VERSIE_VAST}}" cf_sha="" pakket="cloudflared-linux-${DEB_ARCH}.deb" bron dpkg_cmd="${DPKG_CMD:-dpkg}"
  w="$(werk_pad)"
  [[ "$cf_ver" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,3}$ ]] || fout "ongeldige cloudflared-versie: $cf_ver"
  case "$DEB_ARCH" in
    amd64) cf_sha="${CLOUDFLARED_SHA256_AMD64:-${CF_SHA256:-$CF_SHA256_AMD64_VAST}}" ;;
    arm64) cf_sha="${CLOUDFLARED_SHA256_ARM64:-${CF_SHA256:-$CF_SHA256_ARM64_VAST}}" ;;
    *) fout "architectuur $DEB_ARCH wordt niet ondersteund voor cloudflared" ;;
  esac
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] cloudflared $cf_ver ($DEB_ARCH) ophalen, SHA-256 controleren en installeren"
    return 0
  fi
  [ -n "$w" ] && [ -d "$w" ] || fout "tijdelijke werkmap ontbreekt"
  bron="${CLOUDFLARED_BRON:-https://github.com/cloudflare/cloudflared/releases/download/${cf_ver}}/${pakket}"
  haal_gecontroleerd "$bron" "$cf_sha" "$w/cloudflared.deb" || fout "SHA-256 controle van $pakket mislukt — pakket niet geïnstalleerd"
  "$dpkg_cmd" -i "$w/cloudflared.deb"
  rm -f -- "$w/cloudflared.deb"
}

tunnel_inrichten() {
  local w s=0 dpkg_cmd="${DPKG_CMD:-dpkg}"
  w="$(werk_pad)"
  if ! command -v cloudflared >/dev/null 2>&1; then
    cloudflared_ophalen || s=$?
    if [ "$s" -eq 0 ]; then
      "$dpkg_cmd" -i "$w/cloudflared.deb" || echo "  LET OP: cloudflared kon niet worden geïnstalleerd (dpkg); koppel de tunnel zelf"
      rm -f -- "$w/cloudflared.deb"
    elif [ "$s" -eq 3 ]; then
      echo "  ! cloudflared is NIET geïnstalleerd: er is geen vastgezette versie met SHA-256, en zonder controle halen we niets binnen dat als root draait."
      echo "    De site zelf draait; alleen de tunnel naar buiten ontbreekt nog. Installeer cloudflared uit een bron die u vertrouwt"
      echo "    (bv. het ondertekende pakketarchief van Cloudflare) en voer daarna uit:  systemctl enable --now cloudflared"
      echo "    Een volgend herstel: --cloudflared-versie V --cloudflared-sha256 HEX, of (met het risico erbij) --tunnel-ongecontroleerd."
    else
      echo "  LET OP: cloudflared is niet geïnstalleerd (downloaden mislukt of de SHA-256 klopt niet); koppel de tunnel zelf"
    fi
  fi
  if ls /etc/cloudflared/*.json >/dev/null 2>&1 && [ -e /etc/systemd/system/cloudflared.service ]; then systemctl enable --now cloudflared || true
  else echo '  tunnel-sleutels of cloudflared.service ontbreken: koppel de tunnel zelf (zie deploy/LEESMIJ.md)'; fi
  return 0
}

stap_pg18_installeren() {
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -y postgresql-18 postgresql-client-18
}

stap_pad_schrijven_proef() {
  printf '%s' "$1" > "$2"
}

stap_code_uitpakken() {
  local doel="$1" archief="$2"
  rm -rf -- "$doel"
  mkdir -p -- "$doel"
  tar -xzf "$archief" -C "$doel"
  ls -- "$doel"
}

stap_geheimen_terugzetten() {
  local sleutel_pad="$1" archief="$2"
  age --decrypt -i "$sleutel_pad" "$archief" | tar -xpf - -C /
}

stap_systeem_inrichten() {
  local archief="$1" w sys_tmp f
  w="$(werk_pad)"
  sys_tmp="$(mktemp -d "${w:-/tmp}/systeem.XXXXXX")"
  chmod 0700 "$sys_tmp"
  tar -xzpf "$archief" -C "$sys_tmp"
  for f in "$sys_tmp"/usr/local/sbin/*; do
    [ -e "$f" ] && install -m 0755 -o root -g root "$f" /usr/local/sbin/
  done
  for f in "$sys_tmp"/etc/sudoers.d/*; do
    [ -e "$f" ] && visudo -cf "$f" >/dev/null && install -m 0440 -o root -g root "$f" /etc/sudoers.d/
  done
  if [ -e "$sys_tmp/etc/cloudflared/config.yml" ]; then
    install -d /etc/cloudflared
    install -m 0644 "$sys_tmp/etc/cloudflared/config.yml" /etc/cloudflared/config.yml
  fi
  if [ -e "$sys_tmp/etc/systemd/system/cloudflared.service" ]; then
    install -m 0644 "$sys_tmp/etc/systemd/system/cloudflared.service" /etc/systemd/system/cloudflared.service
  fi
  rm -rf -- "$sys_tmp"
  systemctl daemon-reload || true
}

stap_database_herstellen() {
  local sleutel_pad="$1" globals_age="$2" dump_age="$3" db_naam="$4" pg_log="$5"
  [[ "$db_naam" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || fout "ongeldige databasenaam: $db_naam"
  age --decrypt -i "$sleutel_pad" "$globals_age" | runuser -u postgres -- psql -q -v ON_ERROR_STOP=0 postgres >/dev/null 2>&1 || true
  printf '%s\n' "SELECT format('DROP DATABASE IF EXISTS %I', :'db') \\gexec" \
    | runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -v db="$db_naam" postgres
  runuser -u postgres -- createdb -- "$db_naam"
  age --decrypt -i "$sleutel_pad" "$dump_age" | runuser -u postgres -- pg_restore --dbname="$db_naam" --exit-on-error=0 2>"$pg_log" || true
}

stap_uploads_terugzetten() {
  local sleutel_pad="$1" archief="$2"
  install -d /srv/data
  age --decrypt -i "$sleutel_pad" "$archief" | tar -xzpf - -C /srv/data
  chown -R mijnruimte:mijnruimte /srv/data/uploads
}

stap_site_bouwen() {
  local code_pad="$1" mcp_archief="$2"
  ZONDER_BACKUP=1 NODE=/usr/bin/node bash "$code_pad/deploy/installeer-app.sh" installeren "$code_pad"
  if [ -f "$mcp_archief" ]; then
    tar -xzpf "$mcp_archief" -C /srv/mijn-ruimte
    chown -R mijnruimte:mijnruimte /srv/mijn-ruimte/mcp 2>/dev/null || true
    if [ -f /etc/systemd/system/mijn-ruimte-mcp.service ]; then
      systemctl enable --now mijn-ruimte-mcp.service || true
    fi
  fi
}

# Wordt dit bestand ingelezen in plaats van uitgevoerd (de eenheidstest van de functies hieronder), dan stopt het hier: er gebeurt niets.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then return 0; fi

[ "$PROEF" -eq 1 ] || [ "$(id -u)" -eq 0 ] || fout "voer dit uit als root (sudo)"
[ -n "$SLEUTEL" ] && [ -r "$SLEUTEL" ] || fout "geef de herstelsleutel op: --sleutel /pad/naar/herstelsleutel-age.txt"
grep -q '^AGE-SECRET-KEY-' "$SLEUTEL" || fout "$SLEUTEL lijkt geen age-privésleutel"
command -v apt-get >/dev/null || fout "dit script ondersteunt apt (Ubuntu/Debian)"

WERK="$(mktemp -d "${TMPDIR:-/tmp}/mijn-ruimte-herstel.XXXXXX")"
chmod 0700 "$WERK"
WERKMAP="$WERK"
trap 'rm -rf -- "$WERK"' EXIT
if [ "$PROEF" -eq 1 ]; then
  PG_LOG="$WERK/pg_restore.proef.log"
else
  PG_LOG="$(mktemp "${TMPDIR:-/tmp}/mijn-ruimte-pg_restore.XXXXXX")"
  chmod 0600 "$PG_LOG"
fi

stap "1/10 Controlesommen"
( cd "$HIER" && sha256sum -c SHA256SUMS --quiet ) || fout "controlesommen kloppen niet: het archief is beschadigd of gewijzigd"
echo "  alle bestanden kloppen"
MANIFEST="$HIER/manifest.json"
NODE_RUW="$(sed -nE 's/.*"node"[[:space:]]*:[[:space:]]*"v?([^"]*)".*/\1/p' "$MANIFEST" | head -1)"
if [ -n "$NODE_RUW" ] && [ "$NODE_RUW" != "onbekend" ]; then NODE_VERSIE="$NODE_RUW"; else NODE_VERSIE="24.0.0"; fi
[[ "$NODE_VERSIE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fout "ongeldige Node-versie in manifest: $NODE_VERSIE"
ARCH="$(uname -m)"
case "$ARCH" in x86_64|amd64) NODE_ARCH=x64; DEB_ARCH=amd64 ;; aarch64|arm64) NODE_ARCH=arm64; DEB_ARCH=arm64 ;; *) fout "architectuur $ARCH wordt niet ondersteund (x86-64 en ARM64 wel)" ;; esac
echo "  architectuur: $ARCH, Node ${NODE_VERSIE}"
if [ -z "$CF_VERSIE" ] && [ -n "$CF_VERSIE_VAST" ]; then
  CF_VERSIE="$CF_VERSIE_VAST"
  if [ "$DEB_ARCH" = amd64 ]; then CF_SHA256="$CF_SHA256_AMD64_VAST"; else CF_SHA256="$CF_SHA256_ARM64_VAST"; fi
fi

stap "2/10 Pakketten (age, git, rsync, curl, PostgreSQL 18)"
export DEBIAN_FRONTEND=noninteractive
doe apt-get update -y
doe apt-get install -y ca-certificates curl gnupg rsync git unzip xz-utils age postgresql-common
if ! dpkg -s postgresql-18 >/dev/null 2>&1; then
  doe_fn "/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y && apt-get install -y postgresql-18 postgresql-client-18" stap_pg18_installeren
fi
if [ "$PROEF" -eq 0 ]; then command -v age >/dev/null || fout "age is niet geïnstalleerd"; fi

stap "3/10 Node.js $NODE_VERSIE voor $NODE_ARCH"
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ]; }
if [ "$PROEF" -eq 1 ] || ! node_ok; then
  if [ -n "$NODE_SHA256" ]; then NODE_SOM_BRON="vastgezet met --node-sha256"; else NODE_SOM_BRON="officiële SHASUMS256.txt van deze uitgave"; fi
  doe_fn "node-v${NODE_VERSIE}-linux-${NODE_ARCH}.tar.xz ophalen van nodejs.org, SHA-256 controleren ($NODE_SOM_BRON), uitpakken in /usr/local/lib/nodejs en node/npm/npx koppelen in /usr/bin" node_installeren
else echo "  Node is al aanwezig"; fi

stap "4/10 Code uitpakken"
BRON=/var/lib/mijn-ruimte-herstel
doe_fn "$BRON vrijmaken en $HIER/kod/release.tar.gz uitpakken" stap_code_uitpakken "$BRON" "$HIER/kod/release.tar.gz"
CODE="$BRON/mijn-ruimte-code"

stap "5/10 Geheimen ontsleutelen en terugzetten (/etc/mijn-ruimte, tunnel-sleutels)"
doe_fn "geheimen ontsleutelen en uitpakken naar /" stap_geheimen_terugzetten "$SLEUTEL" "$HIER/sekrety/sekrety.tar.age"
if [ "$PROEF" -eq 0 ]; then [ -s /etc/mijn-ruimte/geheimen.env ] || fout "geheimen.env is niet teruggezet (verkeerde sleutel?)"; fi

stap "6/10 Gebruiker, mappen en systemd-units (installeer-app.sh inrichten)"
doe bash "$CODE/deploy/installeer-app.sh" inrichten "$CODE"
doe_fn "systeem.tar.gz uitpakken en hulpscripts/systemd installeren" stap_systeem_inrichten "$HIER/systeem/systeem.tar.gz"

stap "7/10 Database en rollen terugzetten"
doe systemctl enable --now postgresql
doe_fn "rollen terugzetten, database $DB_NAAM aanmaken en database.dump.age herstellen" stap_database_herstellen "$SLEUTEL" "$HIER/baza/globals.sql.age" "$HIER/baza/database.dump.age" "$DB_NAAM" "$PG_LOG"
if [ "$PROEF" -eq 0 ]; then
  N="$(runuser -u postgres -- psql -d "$DB_NAAM" -Atc "select count(*) from information_schema.tables where table_schema='app'" 2>/dev/null || echo 0)"
  [ "${N:-0}" -gt 0 ] || fout "de database lijkt leeg na het terugzetten (zie $PG_LOG)"
  echo "  database teruggezet: $N tabellen in schema app (logboek van pg_restore: $PG_LOG)"
fi

stap "8/10 Bestanden terugzetten"
doe_fn "uploads terugzetten naar /srv/data/uploads" stap_uploads_terugzetten "$SLEUTEL" "$HIER/fajly/uploads.tar.gz.age"

if [ -f "$HIER/kod/repos/INDEX.tsv" ]; then
  while IFS=$'\t' read -r naam rel; do
    [ -n "${naam:-}" ] && [ -n "${rel:-}" ] || continue
    case "$rel" in /*|*..*) echo "  overgeslagen (ongeldig pad): $rel"; continue ;; esac
    [ -f "$HIER/kod/repos/$naam.bundle" ] || { echo "  bundel ontbreekt: $naam"; continue; }
    doel="/srv/mijn-ruimte/$rel"
    if [ -e "$doel" ]; then echo "  bestaat al, niet overschreven: $doel"; continue; fi
    doe git clone --quiet "$HIER/kod/repos/$naam.bundle" "$doel" && doe chown -R mijnruimte:mijnruimte "$doel" \
      || echo "  LET OP: opslagplaats $rel kon niet worden teruggezet (zie de melding hierboven)"
  done < "$HIER/kod/repos/INDEX.tsv"
fi

stap "9/10 Site bouwen en starten (voor deze architectuur, zonder extra reservekopie: dit archief is de reservekopie)"
doe_fn "site bouwen en starten via installeer-app.sh (+ mcp.tar.gz indien aanwezig)" stap_site_bouwen "$CODE" "$HIER/kod/mcp.tar.gz"

stap "10/10 Tunnel en gezondheidscontrole"
if [ "$TUNNEL" -eq 1 ]; then
  if [ -n "$CF_VERSIE" ]; then CF_PLAN="cloudflared $CF_VERSIE ($DEB_ARCH) ophalen, SHA-256 controleren en installeren als het er nog niet is"
  elif [ "$TUNNEL_ONGECONTROLEERD" -eq 1 ]; then CF_PLAN="! de NIEUWSTE cloudflared ZONDER controlesom ophalen en als root installeren als het er nog niet is (--tunnel-ongecontroleerd)"
  else CF_PLAN="! cloudflared wordt NIET geïnstalleerd als het er nog niet is (geen vastgezette versie; zie --cloudflared-versie of --tunnel-ongecontroleerd)"; fi
  doe_fn "$CF_PLAN; daarna de tunnel starten als de sleutels en cloudflared.service er zijn" tunnel_inrichten
else echo "  tunnel overgeslagen (--zonder-tunnel)"; fi
if [ "$PROEF" -eq 0 ]; then
  for i in $(seq 1 30); do curl -fsS --max-time 3 http://127.0.0.1:8080/__gezondheid 2>/dev/null | grep -q '"ok":true' && { echo "  gezond: de site draait op poort 8080"; GEZOND=1; break; }; sleep 2; done
  [ "${GEZOND:-0}" = 1 ] || fout "de site is niet gezond na het herstellen; kijk met: journalctl -u mijn-ruimte -n 80"
fi
echo
echo "KLAAR. Controleer daarna: de tunnel (systemctl status cloudflared), DNS naar deze machine, en maak een verse reservekopie (systemctl start mijn-ruimte-backup)."
