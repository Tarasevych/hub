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
#               de vastgezette cloudflared-uitgave (bv. 2026.10.0) met de SHA-256 van het .deb-pakket voor DEZE architectuur.
#               Zonder vastgezette versie wordt cloudflared NIET geïnstalleerd: de rest van het herstel loopt gewoon door.
#   --tunnel-ongecontroleerd
#               ! haalt de NIEUWSTE cloudflared op ZONDER controlesom en installeert die als root. Risico: een vervalste of
#               gekaapte uitgave draait dan als root op de machine waar zojuist alle geheimen zijn teruggezet.
#   --node-sha256 HEX   de vastgezette SHA-256 van het Node-archief voor deze architectuur. Zonder: de som uit de officiële
#               SHASUMS256.txt van precies deze Node-uitgave. Het archief wordt nooit uitgepakt als de som niet klopt.
#
# Werkt op Ubuntu/Debian, virtueel of fysiek, x86-64 of ARM (de code wordt opnieuw gebouwd voor deze architectuur; Node wordt voor deze architectuur gehaald).
# Vereist internet (apt, nodejs.org, npm, cloudflared). Draai dit alleen op een NIEUWE/lege machine: bestaande Mijn Ruimte-data wordt vervangen.
set -euo pipefail

# Vastgezette cloudflared (SEC-002, server-uitrol-10; zelfde regel als deploy/opa/versie.env: nooit «latest», altijd een SHA-256).
# Leeg = niet vastgezet. Een nieuwe versie = deze drie waarden bijwerken in een nieuwe uitgave van Mijn Ruimte; dit script reist
# met die waarden mee in elk archief (vidnovyty.sh). Op de opdrachtregel kan de eigenaar ze voor één herstel opgeven.
# 2026.10.7 (uitgave van 30.10.2026: bevat de beveiligingsupdates van 2026.10.4–10.6 en het herstel van de http2-regressie).
# Nagekeken op 12.11.2026: de .deb van de GitHub-uitgave (github.com/cloudflare/cloudflared/releases/download/2026.10.7/) en dezelfde
# versie uit het pakketarchief van Cloudflare (pkg.cloudflare.com/cloudflared/pool/main/c/cloudflared/) hebben dezelfde SHA-256;
# dpkg-deb meldt Package=cloudflared, Version=2026.10.7 en de juiste architectuur.
# Перевірено 12.11.2026: однакова SHA-256 з двох незалежних джерел (випуск на GitHub і пакетний архів Cloudflare).
CF_VERSIE_VAST="2026.10.7"
CF_SHA256_AMD64_VAST="70b1a1e0f46033ffc8d90b406e554044ba6cbf2e4360295ef1163aed31e09393"
CF_SHA256_ARM64_VAST="d9407eb6e70ac31f54978a6b408a0320b51b664a6d0b498248692d7ac56bf836"

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLEUTEL=""; PROEF=0; TUNNEL=1; DB_NAAM="mijnruimte"
CF_VERSIE=""; CF_SHA256=""; NODE_SHA256=""; TUNNEL_ONGECONTROLEERD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --sleutel) SLEUTEL="${2:-}"; shift 2 ;;
    --proefrun) PROEF=1; shift ;;
    --zonder-tunnel) TUNNEL=0; shift ;;
    --db) DB_NAAM="${2:-mijnruimte}"; shift 2 ;;
    --cloudflared-versie) CF_VERSIE="${2:-}"; shift 2 ;;
    --cloudflared-sha256) CF_SHA256="${2:-}"; shift 2 ;;
    --node-sha256) NODE_SHA256="${2:-}"; shift 2 ;;
    --tunnel-ongecontroleerd) TUNNEL_ONGECONTROLEERD=1; shift ;;
    -h|--help) sed -n 2,20p "$0"; exit 0 ;;
    *) echo "onbekende optie: $1" >&2; exit 2 ;;
  esac
done
# De naam wordt in shell-opdrachten gebruikt: alleen een gewone PostgreSQL-naam toestaan.
[[ "$DB_NAAM" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "FOUT: ongeldige databasenaam voor --db: $DB_NAAM" >&2; exit 2; }
# Vastgezette downloads: alleen een echte versie (nooit «latest») en alleen samen met een SHA-256.
if [ -n "$CF_VERSIE" ] || [ -n "$CF_SHA256" ]; then
  [[ "$CF_VERSIE" =~ ^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,3}$ ]] || { echo "FOUT: --cloudflared-versie moet een uitgave zijn zoals 2026.10.0 (nooit «latest»): $CF_VERSIE" >&2; exit 2; }
  [[ "$CF_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "FOUT: --cloudflared-versie vraagt ook --cloudflared-sha256 (64 hexadecimale tekens, kleine letters)" >&2; exit 2; }
fi
[ -z "$NODE_SHA256" ] || [[ "$NODE_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "FOUT: --node-sha256 moet 64 hexadecimale tekens zijn (kleine letters)" >&2; exit 2; }
# Alleen voor tests (zoals OPA_BRON in deploy/opa/opa-ophalen.sh): een nagebootste downloadbron, bv. file:///…; sudo geeft dit niet door.
PROTO='=https'
if [ -n "${HERSTEL_TEST_BRON:-}" ]; then PROTO='=https,file'; fi

stap() { echo; echo "==> $*"; }
fout() { echo "FOUT: $*" >&2; exit 1; }
# Voert uit, of toont alleen (proefrun).
doe() { if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $*"; else "$@"; fi; }
# Voert een VASTE opdrachttekst uit in een eigen shell. Paden en namen gaan als losse argumenten mee ($1, $2, …) en worden nooit
# in de tekst geplakt: een aanhalingsteken of $(…) in een pad blijft zo een gewoon teken en kan de opdracht niet veranderen.
doe_sh() {
  local tekst="$1" i=1 a; shift
  if [ "$PROEF" -eq 1 ]; then
    echo "  [proefrun] $tekst"
    for a in "$@"; do echo "             \$$i = $a"; i=$((i + 1)); done
  else bash -c "$tekst" herstel "$@"; fi
}
# Voert een functie van dit script uit, of toont alleen de omschrijving (proefrun).
doe_fn() { local wat="$1"; shift; if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $wat"; else "$@"; fi; }

# Downloadt <url> naar <doel> en vergelijkt de SHA-256 met <verwacht> VÓÓR enig gebruik. Klopt die niet, dan blijft er niets liggen.
haal_gecontroleerd() {
  local url="$1" verwacht="$2" doel="$3" echt
  [[ "$verwacht" =~ ^[0-9a-f]{64}$ ]] || { echo "FOUT: geen geldige SHA-256 bekend voor $url — niets opgehaald" >&2; return 1; }
  curl -fsSL --proto "$PROTO" --proto-redir "$PROTO" --max-time 900 -o "$doel" "$url" || { rm -f -- "$doel"; echo "FOUT: downloaden mislukt: $url" >&2; return 1; }
  echt="$(sha256sum "$doel" | cut -d' ' -f1)"
  if [ "$echt" != "$verwacht" ]; then
    rm -f -- "$doel"
    echo "FOUT: SHA-256 KLOPT NIET voor $url (verwacht $verwacht, kreeg $echt) — niets geïnstalleerd" >&2
    return 1
  fi
}
# Node-archief voor deze architectuur naar $WERK/node.tar.xz, gecontroleerd. Verwachte som: --node-sha256, anders de regel voor
# precies dit bestand in de officiële SHASUMS256.txt van deze uitgave.
node_ophalen() {
  local naam="node-v${NODE_VERSIE}-linux-${NODE_ARCH}.tar.xz" basis="${HERSTEL_TEST_BRON:+$HERSTEL_TEST_BRON/node}" verwacht="$NODE_SHA256"
  basis="${basis:-https://nodejs.org/dist}/v${NODE_VERSIE}"
  if [ -z "$verwacht" ]; then
    curl -fsSL --proto "$PROTO" --proto-redir "$PROTO" --max-time 120 -o "$WERK/SHASUMS256.txt" "$basis/SHASUMS256.txt" || { echo "FOUT: SHASUMS256.txt van Node $NODE_VERSIE kon niet worden opgehaald" >&2; return 1; }
    verwacht="$(awk -v f="$naam" '$2 == f { print $1; exit }' "$WERK/SHASUMS256.txt")"
  fi
  haal_gecontroleerd "$basis/$naam" "$verwacht" "$WERK/node.tar.xz"
}
node_installeren() {
  local map="/usr/local/lib/nodejs/node-v${NODE_VERSIE}-linux-${NODE_ARCH}"
  node_ophalen || fout "Node.js $NODE_VERSIE is niet geïnstalleerd: het archief kon niet worden opgehaald of de SHA-256 klopt niet"
  mkdir -p /usr/local/lib/nodejs
  tar -xJf "$WERK/node.tar.xz" -C /usr/local/lib/nodejs
  ln -sf "$map/bin/node" /usr/bin/node
  ln -sf "$map/bin/npm" /usr/bin/npm
  ln -sf "$map/bin/npx" /usr/bin/npx
  rm -f -- "$WERK/node.tar.xz"
}
# cloudflared-pakket naar $WERK/cloudflared.deb. 0 = opgehaald (vastgezet: SHA-256 gecontroleerd); 3 = niets opgehaald omdat er geen
# vastgezette versie is en de eigenaar niet uitdrukkelijk voor «zonder controle» koos; anders = downloaden mislukt of som fout.
cloudflared_ophalen() {
  local pakket="cloudflared-linux-${DEB_ARCH}.deb" basis="${HERSTEL_TEST_BRON:+$HERSTEL_TEST_BRON/cloudflared}"
  basis="${basis:-https://github.com/cloudflare/cloudflared/releases}"
  if [ -n "$CF_VERSIE" ]; then
    haal_gecontroleerd "$basis/download/${CF_VERSIE}/$pakket" "$CF_SHA256" "$WERK/cloudflared.deb"
    return
  fi
  [ "$TUNNEL_ONGECONTROLEERD" -eq 1 ] || return 3
  echo "  ! LET OP: cloudflared wordt ZONDER controlesom opgehaald (nieuwste uitgave) en als root geïnstalleerd (--tunnel-ongecontroleerd)"
  curl -fsSL --proto "$PROTO" --proto-redir "$PROTO" --max-time 900 -o "$WERK/cloudflared.deb" "$basis/latest/download/$pakket" || { rm -f -- "$WERK/cloudflared.deb"; return 1; }
}
# Stap 10. Mislukt hier iets, dan stopt het herstel niet: de site draait al, alleen de tunnel moet dan met de hand.
tunnel_inrichten() {
  local s=0
  if ! command -v cloudflared >/dev/null 2>&1; then
    cloudflared_ophalen || s=$?
    if [ "$s" -eq 0 ]; then
      dpkg -i "$WERK/cloudflared.deb" || echo "  LET OP: cloudflared kon niet worden geïnstalleerd (dpkg); koppel de tunnel zelf"
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

# Wordt dit bestand ingelezen in plaats van uitgevoerd (de eenheidstest van de functies hierboven), dan stopt het hier: er gebeurt niets.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then return 0; fi

[ "$PROEF" -eq 1 ] || [ "$(id -u)" -eq 0 ] || fout "voer dit uit als root (sudo)"
[ -n "$SLEUTEL" ] && [ -r "$SLEUTEL" ] || fout "geef de herstelsleutel op: --sleutel /pad/naar/herstelsleutel-age.txt"
grep -q '^AGE-SECRET-KEY-' "$SLEUTEL" || fout "$SLEUTEL lijkt geen age-privésleutel"
command -v apt-get >/dev/null || fout "dit script ondersteunt apt (Ubuntu/Debian)"

# Eigen tijdelijke map (alleen root, willekeurige naam) voor de downloads; ze verdwijnt aan het einde. Het logboek van pg_restore
# blijft staan, zodat u het na een mislukt herstel kunt lezen. Geen vaste namen in /tmp meer.
if [ "$PROEF" -eq 1 ]; then WERK="<tijdelijke map>"; PG_LOG="<tijdelijk logboek pg_restore>"
else
  WERK="$(mktemp -d "${TMPDIR:-/tmp}/mijn-ruimte-herstel.XXXXXX")"
  trap 'rm -rf -- "$WERK"' EXIT
  PG_LOG="$(mktemp "${TMPDIR:-/tmp}/mijn-ruimte-pg_restore.XXXXXX")"
fi

stap "1/10 Controlesommen"
( cd "$HIER" && sha256sum -c SHA256SUMS --quiet ) || fout "controlesommen kloppen niet: het archief is beschadigd of gewijzigd"
echo "  alle bestanden kloppen"
MANIFEST="$HIER/manifest.json"
NODE_VERSIE="$(sed -n 's/.*"node":"v\{0,1\}\([0-9][0-9.]*\)".*/\1/p' "$MANIFEST" | head -1)"; NODE_VERSIE="${NODE_VERSIE:-24.0.0}"
ARCH="$(uname -m)"
case "$ARCH" in x86_64|amd64) NODE_ARCH=x64; DEB_ARCH=amd64 ;; aarch64|arm64) NODE_ARCH=arm64; DEB_ARCH=arm64 ;; *) fout "architectuur $ARCH wordt niet ondersteund (x86-64 en ARM64 wel)" ;; esac
echo "  architectuur: $ARCH, Node ${NODE_VERSIE}"
# Geen cloudflared op de opdrachtregel vastgezet: dan de waarden die met dit script zijn meegekomen (bovenaan), als ze er zijn.
if [ -z "$CF_VERSIE" ] && [ -n "$CF_VERSIE_VAST" ]; then
  CF_VERSIE="$CF_VERSIE_VAST"
  if [ "$DEB_ARCH" = amd64 ]; then CF_SHA256="$CF_SHA256_AMD64_VAST"; else CF_SHA256="$CF_SHA256_ARM64_VAST"; fi
fi

stap "2/10 Pakketten (age, git, rsync, curl, PostgreSQL 17)"
export DEBIAN_FRONTEND=noninteractive
doe apt-get update -y
doe apt-get install -y ca-certificates curl gnupg rsync git unzip xz-utils age postgresql-common
if ! dpkg -s postgresql-17 >/dev/null 2>&1; then
  doe_sh '/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y && apt-get install -y postgresql-17 postgresql-client-17'
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
doe_sh 'rm -rf -- "$1" && mkdir -p -- "$1" && tar -xzf "$2" -C "$1" && ls -- "$1"' "$BRON" "$HIER/kod/release.tar.gz"
CODE="$BRON/mijn-ruimte-code"

stap "5/10 Geheimen ontsleutelen en terugzetten (/etc/mijn-ruimte, tunnel-sleutels)"
doe_sh 'age --decrypt -i "$1" "$2" | tar -xpf - -C /' "$SLEUTEL" "$HIER/sekrety/sekrety.tar.age"
if [ "$PROEF" -eq 0 ]; then [ -s /etc/mijn-ruimte/geheimen.env ] || fout "geheimen.env is niet teruggezet (verkeerde sleutel?)"; fi

stap "6/10 Gebruiker, mappen en systemd-units (installeer-app.sh inrichten)"
doe bash "$CODE/deploy/installeer-app.sh" inrichten "$CODE"
# eigen hulpscripts en sudo-regels uit het systeemarchief (de MCP-brug en de archiefknop gebruiken ze)
doe_sh 'T=$(mktemp -d) && tar -xzpf "$1" -C "$T" && for f in "$T"/usr/local/sbin/*; do [ -e "$f" ] && install -m 0755 -o root -g root "$f" /usr/local/sbin/; done; for f in "$T"/etc/sudoers.d/*; do [ -e "$f" ] && visudo -cf "$f" >/dev/null && install -m 0440 -o root -g root "$f" /etc/sudoers.d/; done; [ -e "$T/etc/cloudflared/config.yml" ] && install -d /etc/cloudflared && install -m 0644 "$T/etc/cloudflared/config.yml" /etc/cloudflared/config.yml; [ -e "$T/etc/systemd/system/cloudflared.service" ] && install -m 0644 "$T/etc/systemd/system/cloudflared.service" /etc/systemd/system/cloudflared.service; rm -rf "$T"; systemctl daemon-reload; true' "$HIER/systeem/systeem.tar.gz"

stap "7/10 Database en rollen terugzetten"
doe systemctl enable --now postgresql
doe_sh 'age --decrypt -i "$1" "$2" | runuser -u postgres -- psql -q -v ON_ERROR_STOP=0 postgres >/dev/null 2>&1; true' "$SLEUTEL" "$HIER/baza/globals.sql.age"
doe_sh 'runuser -u postgres -- psql -Atc "drop database if exists $1" postgres && runuser -u postgres -- createdb "$1"' "$DB_NAAM"
doe_sh 'age --decrypt -i "$1" "$2" | runuser -u postgres -- pg_restore --dbname="$3" --exit-on-error=0 2>"$4"; true' "$SLEUTEL" "$HIER/baza/database.dump.age" "$DB_NAAM" "$PG_LOG"
if [ "$PROEF" -eq 0 ]; then
  N="$(runuser -u postgres -- psql -d "$DB_NAAM" -Atc "select count(*) from information_schema.tables where table_schema='app'" 2>/dev/null || echo 0)"
  [ "${N:-0}" -gt 0 ] || fout "de database lijkt leeg na het terugzetten (zie $PG_LOG)"
  echo "  database teruggezet: $N tabellen in schema app (logboek van pg_restore: $PG_LOG)"
fi

stap "8/10 Bestanden terugzetten"
doe_sh 'install -d /srv/data && age --decrypt -i "$1" "$2" | tar -xzpf - -C /srv/data && chown -R mijnruimte:mijnruimte /srv/data/uploads' "$SLEUTEL" "$HIER/fajly/uploads.tar.gz.age"

# Git-opslagplaatsen (kod/repos/*.bundle, index in INDEX.tsv) terugzetten op hun eigen pad onder /srv/mijn-ruimte.
# Bestaat het pad al, dan wordt er niets overschreven. Een mislukte bundel stopt het herstel niet; het wordt wel gemeld.
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
doe_sh 'ZONDER_BACKUP=1 NODE=/usr/bin/node bash "$1/deploy/installeer-app.sh" installeren "$1"' "$CODE"
doe_sh 'if [ -f "$1" ]; then tar -xzpf "$1" -C /srv/mijn-ruimte && chown -R mijnruimte:mijnruimte /srv/mijn-ruimte/mcp 2>/dev/null; if [ -f /etc/systemd/system/mijn-ruimte-mcp.service ]; then systemctl enable --now mijn-ruimte-mcp.service || true; fi; fi; true' "$HIER/kod/mcp.tar.gz"

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
echo "KLAAR. Controleer daarna: de tunnel (systemctl status cloudflared), DNS naar deze machine, en maak een verse back-up (systemctl start mijn-ruimte-backup)."
