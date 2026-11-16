#!/usr/bin/env bash
# archief-herstellen.sh (in het archief: vidnovyty.sh) — zet Mijn Ruimte met ÉÉN opdracht terug op een nieuwe machine uit het volledige archief.
#
# Gebruik (als root, vanuit de uitgepakte archiefmap):
#   sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt [--proefrun] [--zonder-tunnel] [--db NAAM]
#
#   --sleutel   de age-privésleutel van de eigenaar (herstelsleutel-age.txt). Nodig: database, bestanden en geheimen zijn ermee versleuteld.
#   --proefrun  voert niets uit: toont alleen wat er zou gebeuren (en controleert de controlesommen en de sleutel).
#   --zonder-tunnel  slaat cloudflared over (bijv. als u de tunnel later zelf koppelt).
#
# Werkt op Ubuntu/Debian, virtueel of fysiek, x86-64 of ARM (de code wordt opnieuw gebouwd voor deze architectuur; Node en cloudflared worden per SHA-256 gecontroleerd).
# Vereist internet (apt, nodejs.org, github.com). Draai dit alleen op een NIEUWE/lege machine: bestaande Mijn Ruimte-data wordt vervangen.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLEUTEL=""; PROEF=0; TUNNEL=1; DB_NAAM="mijnruimte"
WERKMAP=""

# Vastgepinde cloudflared-release (geen onverifieerbare «latest»-download). Bijwerken: versie + exacte SHA-256 van het .deb-pakket.
CLOUDFLARED_VERSIE="${CLOUDFLARED_VERSIE:-2026.11.0}"
CLOUDFLARED_SHA256_AMD64="${CLOUDFLARED_SHA256_AMD64:-5305dbaf62984e92e7daa29cdd6a35a4797edc23385d4c5b8422ff97eb96a19b}"
CLOUDFLARED_SHA256_ARM64="${CLOUDFLARED_SHA256_ARM64:-ce671bc2b4afbd16b43f9a3c279527e9e2be8b30b87648047a1f95cccfbacdfd}"

stap() { echo; echo "==> $*"; }
fout() { echo "FOUT: $*" >&2; exit 1; }
doe() { if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $*"; else "$@"; fi; }

curl_veilig() {
  local doel="$1" bron="$2" max_tijd="${3:-300}" proto='=https'
  case "$bron" in
    file://*) proto='=https,file' ;;
  esac
  curl -fsSL --proto "$proto" --tlsv1.2 --max-time "$max_tijd" -o "$doel" "$bron"
}

node_ok() {
  command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 24 ]
}

node_installeren() {
  local basis="${NODE_BRON:-https://nodejs.org/dist/v${NODE_VERSIE}}"
  local bestand="node-v${NODE_VERSIE}-linux-${NODE_ARCH}.tar.xz"
  local sommen="$WERKMAP/SHASUMS256.txt"
  local archief="$WERKMAP/$bestand"
  local doel_lib="${NODE_DOEL:-/usr/local/lib/nodejs}"
  local doel_bin="${NODE_BIN_DOEL:-/usr/bin}"
  local verwacht_regel=""

  [[ "$NODE_VERSIE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fout "ongeldige Node-versie in manifest: $NODE_VERSIE"
  [ -n "${WERKMAP:-}" ] && [ -d "$WERKMAP" ] || fout "tijdelijke werkmap ontbreekt"

  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] download ${basis}/SHASUMS256.txt en ${basis}/${bestand} naar \$WERKMAP"
    echo "  [proefrun] sha256sum -c - voor ${bestand} en uitpakken naar ${doel_lib}"
    return 0
  fi

  curl_veilig "$sommen" "${basis}/SHASUMS256.txt" 60 \
    || fout "downloaden van SHASUMS256.txt mislukt (${basis}/SHASUMS256.txt)"
  verwacht_regel="$(awk -v f="$bestand" '{ naam = $2; sub(/^\*/, "", naam); if (naam == f && $1 ~ /^[0-9a-f]{64}$/) { print $1 "  " f; exit } }' "$sommen")"
  [ -n "$verwacht_regel" ] || fout "SHA-256 voor $bestand ontbreekt of is ongeldig in SHASUMS256.txt"

  curl_veilig "$archief" "${basis}/${bestand}" 300 \
    || fout "downloaden van $bestand mislukt (${basis}/${bestand})"
  ( cd "$WERKMAP" && printf '%s\n' "$verwacht_regel" | sha256sum -c - >/dev/null ) \
    || fout "SHA-256 controle van $bestand mislukt — archief niet uitgepakt"

  mkdir -p "$doel_lib" "$doel_bin"
  tar -xJf "$archief" -C "$doel_lib"
  ln -sf "$doel_lib/node-v${NODE_VERSIE}-linux-${NODE_ARCH}/bin/node" "$doel_bin/node"
  ln -sf "$doel_lib/node-v${NODE_VERSIE}-linux-${NODE_ARCH}/bin/npm" "$doel_bin/npm"
  ln -sf "$doel_lib/node-v${NODE_VERSIE}-linux-${NODE_ARCH}/bin/npx" "$doel_bin/npx"
  rm -f -- "$archief" "$sommen"
}

cloudflared_installeren() {
  local cf_sha="" cf_bestand="" cf_bron="" cf_deb="" dpkg_cmd="${DPKG_CMD:-dpkg}"

  [[ "$CLOUDFLARED_VERSIE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fout "ongeldige cloudflared-versie: $CLOUDFLARED_VERSIE"
  case "$DEB_ARCH" in
    amd64) cf_sha="$CLOUDFLARED_SHA256_AMD64" ;;
    arm64) cf_sha="$CLOUDFLARED_SHA256_ARM64" ;;
    *) fout "architectuur $DEB_ARCH wordt niet ondersteund voor cloudflared" ;;
  esac
  [[ "$cf_sha" =~ ^[0-9a-f]{64}$ ]] || fout "ongeldige SHA-256 voor cloudflared ($DEB_ARCH)"
  [ -n "${WERKMAP:-}" ] && [ -d "$WERKMAP" ] || fout "tijdelijke werkmap ontbreekt"

  cf_bestand="cloudflared-linux-${DEB_ARCH}.deb"
  cf_bron="${CLOUDFLARED_BRON:-https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSIE}}/${cf_bestand}"
  cf_deb="$WERKMAP/$cf_bestand"

  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] download ${cf_bron} naar \$WERKMAP/${cf_bestand}"
    echo "  [proefrun] sha256sum -c - (verwacht ${cf_sha}) en ${dpkg_cmd} -i ${cf_deb}"
    return 0
  fi

  curl_veilig "$cf_deb" "$cf_bron" 300 \
    || fout "downloaden van $cf_bestand mislukt ($cf_bron)"
  ( cd "$WERKMAP" && printf '%s  %s\n' "$cf_sha" "$cf_bestand" | sha256sum -c - >/dev/null ) \
    || fout "SHA-256 controle van $cf_bestand mislukt — pakket niet geïnstalleerd"
  "$dpkg_cmd" -i "$cf_deb"
  rm -f -- "$cf_deb"
}

stap_systeem() {
  local sys_tmp f
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] systeem.tar.gz uitpakken en hulpscripts/systemd installeren"
    return 0
  fi
  sys_tmp="$(mktemp -d "$WERKMAP/systeem.XXXXXX")"
  tar -xzpf "$HIER/systeem/systeem.tar.gz" -C "$sys_tmp"
  for f in "$sys_tmp"/usr/local/sbin/*; do
    if [ -e "$f" ]; then
      install -m 0755 -o root -g root "$f" /usr/local/sbin/
    fi
  done
  for f in "$sys_tmp"/etc/sudoers.d/*; do
    if [ -e "$f" ] && visudo -cf "$f" >/dev/null; then
      install -m 0440 -o root -g root "$f" /etc/sudoers.d/
    fi
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

stap_database() {
  local pg_log="$WERKMAP/pg_restore.log" n=0
  doe systemctl enable --now postgresql
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] rollen terugzetten, database $DB_NAAM aanmaken en database.dump.age herstellen"
    return 0
  fi
  age --decrypt -i "$SLEUTEL" "$HIER/baza/globals.sql.age" | runuser -u postgres -- psql -q -v ON_ERROR_STOP=0 postgres >/dev/null 2>&1 || true
  runuser -u postgres -- psql -Atc "drop database if exists \"$DB_NAAM\"" postgres
  runuser -u postgres -- createdb "$DB_NAAM"
  age --decrypt -i "$SLEUTEL" "$HIER/baza/database.dump.age" | runuser -u postgres -- pg_restore --dbname="$DB_NAAM" --exit-on-error=0 2>"$pg_log" || true
  n="$(runuser -u postgres -- psql -d "$DB_NAAM" -Atc "select count(*) from information_schema.tables where table_schema='app'" 2>/dev/null || echo 0)"
  if [ "${n:-0}" -le 0 ]; then
    [ -s "$pg_log" ] && tail -n 20 "$pg_log" >&2 || true
    fout "de database lijkt leeg na het terugzetten"
  fi
  echo "  database teruggezet: $n tabellen in schema app"
}

hoofd() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --sleutel) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; SLEUTEL="$2"; shift 2 ;;
      --proefrun) PROEF=1; shift ;;
      --zonder-tunnel) TUNNEL=0; shift ;;
      --db) [ $# -ge 2 ] || { echo "onbekende of onvolledige optie: $1" >&2; exit 2; }; DB_NAAM="$2"; shift 2 ;;
      -h|--help) sed -n 2,14p "$0"; exit 0 ;;
      *) echo "onbekende optie: $1" >&2; exit 2 ;;
    esac
  done

  # De naam wordt in PostgreSQL-opdrachten gebruikt: alleen een gewone PostgreSQL-naam toestaan.
  [[ "$DB_NAAM" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "FOUT: ongeldige databasenaam voor --db: $DB_NAAM" >&2; exit 2; }
  [ "$PROEF" -eq 1 ] || [ "$(id -u)" -eq 0 ] || fout "voer dit uit als root (sudo)"
  [ -n "$SLEUTEL" ] && [ -r "$SLEUTEL" ] || fout "geef de herstelsleutel op: --sleutel /pad/naar/herstelsleutel-age.txt"
  grep -q '^AGE-SECRET-KEY-' "$SLEUTEL" || fout "$SLEUTEL lijkt geen age-privésleutel"
  command -v apt-get >/dev/null || fout "dit script ondersteunt apt (Ubuntu/Debian)"

  WERKMAP="$(mktemp -d "${TMPDIR:-/tmp}/mijn-ruimte-herstel.XXXXXX")"
  chmod 0700 "$WERKMAP"
  trap 'rm -rf "$WERKMAP"' EXIT

  stap "1/10 Controlesommen"
  ( cd "$HIER" && sha256sum -c SHA256SUMS --quiet ) || fout "controlesommen kloppen niet: het archief is beschadigd of gewijzigd"
  echo "  alle bestanden kloppen"
  MANIFEST="$HIER/manifest.json"
  NODE_RUW="$(sed -nE 's/.*"node"[[:space:]]*:[[:space:]]*"v?([^"]*)".*/\1/p' "$MANIFEST" | head -1)"
  if [ -n "$NODE_RUW" ] && [ "$NODE_RUW" != "onbekend" ]; then
    NODE_VERSIE="$NODE_RUW"
  else
    NODE_VERSIE="24.0.0"
  fi
  [[ "$NODE_VERSIE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fout "ongeldige Node-versie in manifest: $NODE_VERSIE"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) NODE_ARCH=x64; DEB_ARCH=amd64 ;;
    aarch64|arm64) NODE_ARCH=arm64; DEB_ARCH=arm64 ;;
    *) fout "architectuur $ARCH wordt niet ondersteund (x86-64 en ARM64 wel)" ;;
  esac
  echo "  architectuur: $ARCH, Node ${NODE_VERSIE}"

  stap "2/10 Pakketten (age, git, rsync, curl, PostgreSQL 17)"
  export DEBIAN_FRONTEND=noninteractive
  doe apt-get update -y
  doe apt-get install -y ca-certificates curl gnupg rsync git unzip xz-utils age postgresql-common
  if ! dpkg -s postgresql-17 >/dev/null 2>&1; then
    if [ "$PROEF" -eq 1 ]; then
      echo "  [proefrun] /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y && apt-get install -y postgresql-17 postgresql-client-17"
    else
      /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
      apt-get install -y postgresql-17 postgresql-client-17
    fi
  fi
  if [ "$PROEF" -eq 0 ]; then command -v age >/dev/null || fout "age is niet geïnstalleerd"; fi

  stap "3/10 Node.js $NODE_VERSIE voor $NODE_ARCH"
  if [ "$PROEF" -eq 1 ] || ! node_ok; then
    node_installeren
  else
    echo "  Node is al aanwezig"
  fi

  stap "4/10 Code uitpakken"
  BRON=/var/lib/mijn-ruimte-herstel
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] $BRON vrijmaken en $HIER/kod/release.tar.gz uitpakken"
  else
    rm -rf -- "$BRON" && mkdir -p "$BRON" && tar -xzf "$HIER/kod/release.tar.gz" -C "$BRON" && ls "$BRON"
  fi
  CODE="$BRON/mijn-ruimte-code"

  stap "5/10 Geheimen ontsleutelen en terugzetten (/etc/mijn-ruimte, tunnel-sleutels)"
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] age --decrypt -i $SLEUTEL $HIER/sekrety/sekrety.tar.age | tar -xpf - -C /"
  else
    age --decrypt -i "$SLEUTEL" "$HIER/sekrety/sekrety.tar.age" | tar -xpf - -C /
    [ -s /etc/mijn-ruimte/geheimen.env ] || fout "geheimen.env is niet teruggezet (verkeerde sleutel?)"
  fi

  stap "6/10 Gebruiker, mappen en systemd-units (installeer-app.sh inrichten)"
  doe bash "$CODE/deploy/installeer-app.sh" inrichten "$CODE"
  stap_systeem

  stap "7/10 Database en rollen terugzetten"
  stap_database

  stap "8/10 Bestanden terugzetten"
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] uploads terugzetten naar /srv/data/uploads"
  else
    install -d /srv/data
    age --decrypt -i "$SLEUTEL" "$HIER/fajly/uploads.tar.gz.age" | tar -xzpf - -C /srv/data
    chown -R mijnruimte:mijnruimte /srv/data/uploads
  fi

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

  stap "9/10 Site bouwen en starten (voor deze architectuur, zonder extra back-up: dit archief is de back-up)"
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] ZONDER_BACKUP=1 NODE=/usr/bin/node bash $CODE/deploy/installeer-app.sh installeren $CODE"
    echo "  [proefrun] mcp.tar.gz terugzetten indien aanwezig"
  else
    ZONDER_BACKUP=1 NODE=/usr/bin/node bash "$CODE/deploy/installeer-app.sh" installeren "$CODE"
    if [ -f "$HIER/kod/mcp.tar.gz" ]; then
      tar -xzpf "$HIER/kod/mcp.tar.gz" -C /srv/mijn-ruimte
      chown -R mijnruimte:mijnruimte /srv/mijn-ruimte/mcp 2>/dev/null || true
      if [ -f /etc/systemd/system/mijn-ruimte-mcp.service ]; then
        systemctl enable --now mijn-ruimte-mcp.service || true
      fi
    fi
  fi

  stap "10/10 Tunnel en gezondheidscontrole"
  if [ "$TUNNEL" -eq 1 ]; then
    if ! command -v cloudflared >/dev/null 2>&1; then
      cloudflared_installeren
    else
      echo "  cloudflared is al aanwezig"
    fi
    if [ "$PROEF" -eq 0 ]; then
      if ls /etc/cloudflared/*.json >/dev/null 2>&1 && [ -e /etc/systemd/system/cloudflared.service ]; then
        systemctl enable --now cloudflared || true
      else
        echo "  tunnel-sleutels of cloudflared.service ontbreken: koppel de tunnel zelf (zie deploy/LEESMIJ.md)"
      fi
    fi
  else
    echo "  tunnel overgeslagen (--zonder-tunnel)"
  fi

  if [ "$PROEF" -eq 0 ]; then
    GEZOND=0
    for _ in $(seq 1 30); do
      if curl -fsS --max-time 3 http://127.0.0.1:8080/__gezondheid 2>/dev/null | grep -q '"ok":true'; then
        echo "  gezond: de site draait op poort 8080"
        GEZOND=1
        break
      fi
      sleep 2
    done
    [ "$GEZOND" -eq 1 ] || fout "de site is niet gezond na het herstellen; kijk met: journalctl -u mijn-ruimte -n 80"
  fi
  echo
  echo "KLAAR. Controleer daarna: de tunnel (systemctl status cloudflared), DNS naar deze machine, en maak een verse back-up (systemctl start mijn-ruimte-backup)."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  hoofd "$@"
fi
