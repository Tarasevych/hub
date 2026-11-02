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
# Werkt op Ubuntu/Debian, virtueel of fysiek, x86-64 of ARM (de code wordt opnieuw gebouwd voor deze architectuur; Node wordt voor deze architectuur gehaald).
# Vereist internet (apt, nodejs.org, npm, cloudflared). Draai dit alleen op een NIEUWE/lege machine: bestaande Mijn Ruimte-data wordt vervangen.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLEUTEL=""; PROEF=0; TUNNEL=1; DB_NAAM="mijnruimte"
while [ $# -gt 0 ]; do
  case "$1" in
    --sleutel) SLEUTEL="${2:-}"; shift 2 ;;
    --proefrun) PROEF=1; shift ;;
    --zonder-tunnel) TUNNEL=0; shift ;;
    --db) DB_NAAM="${2:-mijnruimte}"; shift 2 ;;
    -h|--help) sed -n 2,14p "$0"; exit 0 ;;
    *) echo "onbekende optie: $1" >&2; exit 2 ;;
  esac
done
# De naam wordt in shell-opdrachten gebruikt: alleen een gewone PostgreSQL-naam toestaan.
[[ "$DB_NAAM" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "FOUT: ongeldige databasenaam voor --db: $DB_NAAM" >&2; exit 2; }

stap() { echo; echo "==> $*"; }
fout() { echo "FOUT: $*" >&2; exit 1; }
# Voert uit, of toont alleen (proefrun).
doe() { if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $*"; else "$@"; fi; }
doe_sh() { if [ "$PROEF" -eq 1 ]; then echo "  [proefrun] $1"; else bash -c "$1"; fi; }

[ "$PROEF" -eq 1 ] || [ "$(id -u)" -eq 0 ] || fout "voer dit uit als root (sudo)"
[ -n "$SLEUTEL" ] && [ -r "$SLEUTEL" ] || fout "geef de herstelsleutel op: --sleutel /pad/naar/herstelsleutel-age.txt"
grep -q '^AGE-SECRET-KEY-' "$SLEUTEL" || fout "$SLEUTEL lijkt geen age-privésleutel"
command -v apt-get >/dev/null || fout "dit script ondersteunt apt (Ubuntu/Debian)"

stap "1/10 Controlesommen"
( cd "$HIER" && sha256sum -c SHA256SUMS --quiet ) || fout "controlesommen kloppen niet: het archief is beschadigd of gewijzigd"
echo "  alle bestanden kloppen"
MANIFEST="$HIER/manifest.json"
NODE_VERSIE="$(sed -n 's/.*"node":"v\{0,1\}\([0-9][0-9.]*\)".*/\1/p' "$MANIFEST" | head -1)"; NODE_VERSIE="${NODE_VERSIE:-24.0.0}"
ARCH="$(uname -m)"
case "$ARCH" in x86_64|amd64) NODE_ARCH=x64; DEB_ARCH=amd64 ;; aarch64|arm64) NODE_ARCH=arm64; DEB_ARCH=arm64 ;; *) fout "architectuur $ARCH wordt niet ondersteund (x86-64 en ARM64 wel)" ;; esac
echo "  architectuur: $ARCH, Node ${NODE_VERSIE}"

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
  doe_sh "curl -fsSL https://nodejs.org/dist/v${NODE_VERSIE}/node-v${NODE_VERSIE}-linux-${NODE_ARCH}.tar.xz -o /tmp/node.tar.xz && mkdir -p /usr/local/lib/nodejs && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs && ln -sf /usr/local/lib/nodejs/node-v${NODE_VERSIE}-linux-${NODE_ARCH}/bin/node /usr/bin/node && ln -sf /usr/local/lib/nodejs/node-v${NODE_VERSIE}-linux-${NODE_ARCH}/bin/npm /usr/bin/npm && ln -sf /usr/local/lib/nodejs/node-v${NODE_VERSIE}-linux-${NODE_ARCH}/bin/npx /usr/bin/npx && rm -f /tmp/node.tar.xz"
else echo "  Node is al aanwezig"; fi

stap "4/10 Code uitpakken"
BRON=/var/lib/mijn-ruimte-herstel
doe_sh "rm -rf '$BRON' && mkdir -p '$BRON' && tar -xzf '$HIER/kod/release.tar.gz' -C '$BRON' && ls '$BRON'"
CODE="$BRON/mijn-ruimte-code"

stap "5/10 Geheimen ontsleutelen en terugzetten (/etc/mijn-ruimte, tunnel-sleutels)"
doe_sh "age --decrypt -i '$SLEUTEL' '$HIER/sekrety/sekrety.tar.age' | tar -xpf - -C /"
if [ "$PROEF" -eq 0 ]; then [ -s /etc/mijn-ruimte/geheimen.env ] || fout "geheimen.env is niet teruggezet (verkeerde sleutel?)"; fi

stap "6/10 Gebruiker, mappen en systemd-units (installeer-app.sh inrichten)"
doe bash "$CODE/deploy/installeer-app.sh" inrichten "$CODE"
# eigen hulpscripts en sudo-regels uit het systeemarchief (de MCP-brug en de archiefknop gebruiken ze)
doe_sh "T=\$(mktemp -d) && tar -xzpf '$HIER/systeem/systeem.tar.gz' -C \"\$T\" && for f in \"\$T\"/usr/local/sbin/*; do [ -e \"\$f\" ] && install -m 0755 -o root -g root \"\$f\" /usr/local/sbin/; done; for f in \"\$T\"/etc/sudoers.d/*; do [ -e \"\$f\" ] && visudo -cf \"\$f\" >/dev/null && install -m 0440 -o root -g root \"\$f\" /etc/sudoers.d/; done; [ -e \"\$T/etc/cloudflared/config.yml\" ] && install -d /etc/cloudflared && install -m 0644 \"\$T/etc/cloudflared/config.yml\" /etc/cloudflared/config.yml; [ -e \"\$T/etc/systemd/system/cloudflared.service\" ] && install -m 0644 \"\$T/etc/systemd/system/cloudflared.service\" /etc/systemd/system/cloudflared.service; rm -rf \"\$T\"; systemctl daemon-reload; true"

stap "7/10 Database en rollen terugzetten"
doe systemctl enable --now postgresql
doe_sh "age --decrypt -i '$SLEUTEL' '$HIER/baza/globals.sql.age' | runuser -u postgres -- psql -q -v ON_ERROR_STOP=0 postgres >/dev/null 2>&1; true"
doe_sh "runuser -u postgres -- psql -Atc \"drop database if exists $DB_NAAM\" postgres && runuser -u postgres -- createdb $DB_NAAM"
doe_sh "age --decrypt -i '$SLEUTEL' '$HIER/baza/database.dump.age' | runuser -u postgres -- pg_restore --dbname=$DB_NAAM --exit-on-error=0 2>/tmp/pg_restore.log; true"
if [ "$PROEF" -eq 0 ]; then
  N="$(runuser -u postgres -- psql -d "$DB_NAAM" -Atc "select count(*) from information_schema.tables where table_schema='app'" 2>/dev/null || echo 0)"
  [ "${N:-0}" -gt 0 ] || fout "de database lijkt leeg na het terugzetten (zie /tmp/pg_restore.log)"
  echo "  database teruggezet: $N tabellen in schema app"
fi

stap "8/10 Bestanden terugzetten"
doe_sh "install -d /srv/data && age --decrypt -i '$SLEUTEL' '$HIER/fajly/uploads.tar.gz.age' | tar -xzpf - -C /srv/data && chown -R mijnruimte:mijnruimte /srv/data/uploads"

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
doe_sh "ZONDER_BACKUP=1 NODE=/usr/bin/node bash '$CODE/deploy/installeer-app.sh' installeren '$CODE'"
doe_sh "if [ -f '$HIER/kod/mcp.tar.gz' ]; then tar -xzpf '$HIER/kod/mcp.tar.gz' -C /srv/mijn-ruimte && chown -R mijnruimte:mijnruimte /srv/mijn-ruimte/mcp 2>/dev/null; if [ -f /etc/systemd/system/mijn-ruimte-mcp.service ]; then systemctl enable --now mijn-ruimte-mcp.service || true; fi; fi; true"

stap "10/10 Tunnel en gezondheidscontrole"
if [ "$TUNNEL" -eq 1 ]; then
  doe_sh "command -v cloudflared >/dev/null 2>&1 || { curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${DEB_ARCH}.deb -o /tmp/cf.deb && dpkg -i /tmp/cf.deb; }; if ls /etc/cloudflared/*.json >/dev/null 2>&1 && [ -e /etc/systemd/system/cloudflared.service ]; then systemctl enable --now cloudflared || true; else echo '  tunnel-sleutels of cloudflared.service ontbreken: koppel de tunnel zelf (zie deploy/LEESMIJ.md)'; fi; true"
else echo "  tunnel overgeslagen (--zonder-tunnel)"; fi
if [ "$PROEF" -eq 0 ]; then
  for i in $(seq 1 30); do curl -fsS --max-time 3 http://127.0.0.1:8080/__gezondheid 2>/dev/null | grep -q '"ok":true' && { echo "  gezond: de site draait op poort 8080"; GEZOND=1; break; }; sleep 2; done
  [ "${GEZOND:-0}" = 1 ] || fout "de site is niet gezond na het herstellen; kijk met: journalctl -u mijn-ruimte -n 80"
fi
echo
echo "KLAAR. Controleer daarna: de tunnel (systemctl status cloudflared), DNS naar deze machine, en maak een verse back-up (systemctl start mijn-ruimte-backup)."
