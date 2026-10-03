#!/usr/bin/env bash
# backup-maken.sh — maakt een consistente back-up van Mijn Ruimte voor ophalen door de host (pull-model).
#
# Resultaat: $BACKUP_DIR/<JJJJMMDD-UUMMSS>/
#   database.dump.age    pg_dump --format=custom (alle schema's, zonder eigenaar/rechten), age-versleuteld
#   uploads.tar.gz.age   inhoud van $UPLOADS_DIR, age-versleuteld
#   info.txt             tijdstip, release, migraties, groottes, ontvanger (klare tekst, niets geheims)
#   SHA256SUMS           controlesommen van de bestanden hierboven (van de versleutelde vorm)
#   KLAAR                wordt als laatste geschreven: de host haalt alleen mappen met KLAAR op
# De VM bewaart $BACKUP_BEWAAR_DAGEN dagen (standaard 7); de host is verantwoordelijk voor de lange termijn.
#
# Versleuteling (publieke-sleutelmodel): pg_dump en tar worden direct door `age -R` gestuurd, er komt dus
# nooit klare tekst op schijf. Op de VM staat alleen de PUBLIEKE sleutel ($BACKUP_ONTVANGER, standaard
# /etc/mijn-ruimte/backup-ontvanger.age.pub); de privésleutel (herstelsleutel-age.txt) staat alleen offline
# bij de eigenaar. De VM kan zijn eigen back-ups dus niet ontsleutelen. Zonder `age` of zonder publieke
# sleutel weigert dit script (alleen met BACKUP_ONVERSLEUTELD=1 komt er klare tekst, bedoeld voor tests).
#
# Geheimen (geheimen.env) en de sleutels *_KEY_V1/RECOVERY_CODE_PEPPER zitten er bewust NIET in:
# daarvan bestaat een apart age-archief (zie deploy/HERSTEL.md). Zonder die sleutels zijn versleutelde
# velden in de database onleesbaar.
#
# Draait normaal via mijn-ruimte-backup.service (gebruiker mijnruimte, groep mijnruimte-backup).
# Handmatig: sudo systemctl start mijn-ruimte-backup.service
#
# Ophalen vanaf de host (voorbeeld, gebruiker 'backup' in groep mijnruimte-backup op de VM):
#   rsync -a --include='*/' --include='*' vm:/srv/backups/mijn-ruimte/ /pad/op/host/mijn-ruimte/
#   (daarna per map: sha256sum -c SHA256SUMS)
#   Windows-host: deploy/reservekopie-ophalen.ps1.
# Terugzetten: zie deploy/HERSTEL.md en deploy/LEESMIJ.md, sectie "Back-up terugzetten".
set -euo pipefail
umask 027

: "${DATABASE_URL:?DATABASE_URL ontbreekt (EnvironmentFile /etc/mijn-ruimte/geheimen.env)}"
UPLOADS_DIR="${UPLOADS_DIR:-/srv/data/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/mijn-ruimte}"
BEWAAR_DAGEN="${BACKUP_BEWAAR_DAGEN:-7}"
ONTVANGER="${BACKUP_ONTVANGER:-/etc/mijn-ruimte/backup-ontvanger.age.pub}"

if [ "${BACKUP_ONVERSLEUTELD:-0}" = "1" ]; then
  echo "[backup] WAARSCHUWING: BACKUP_ONVERSLEUTELD=1, back-up wordt NIET versleuteld" >&2
  ext=""
else
  command -v age >/dev/null || { echo "[backup] age ontbreekt (apt install age); geen onversleutelde back-up" >&2; exit 1; }
  [ -r "$ONTVANGER" ] || { echo "[backup] publieke sleutel $ONTVANGER ontbreekt of is onleesbaar" >&2; exit 1; }
  grep -Eq '^age1[0-9a-z]{58}$' "$ONTVANGER" || { echo "[backup] $ONTVANGER bevat geen geldige age-ontvanger" >&2; exit 1; }
  ext=".age"
fi
# Schrijft stdin naar $1 (versleuteld als ext=.age).
schrijf() { if [ -n "$ext" ]; then age --encrypt --recipients-file "$ONTVANGER" --output "$1"; else cat > "$1"; fi; }

stempel="$(date +%Y%m%d-%H%M%S)"
doel="$BACKUP_DIR/$stempel"
tmp="$BACKUP_DIR/.bezig-$stempel"
mkdir -p "$tmp"
trap 'rm -rf "$tmp"' ERR

echo "[backup] database dumpen…"
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=6 --no-owner --no-privileges | schrijf "$tmp/database.dump$ext"

echo "[backup] uploads archiveren…"
if [ -d "$UPLOADS_DIR" ]; then
  tar --create --gzip --file=- --directory="$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" | schrijf "$tmp/uploads.tar.gz$ext"
else
  echo "[backup] waarschuwing: $UPLOADS_DIR bestaat niet; leeg archief" >&2
  tar --create --gzip --file=- --files-from=/dev/null | schrijf "$tmp/uploads.tar.gz$ext"
fi

release="$(readlink -f /srv/mijn-ruimte/current 2>/dev/null || echo onbekend)"
migraties="$(psql "$DATABASE_URL" -Atc "select string_agg(version, ',' order by version) from app.schema_migrations" 2>/dev/null || echo onbekend)"
{
  echo "tijdstip=$(date --iso-8601=seconds)"
  echo "release=$release"
  echo "migraties=$migraties"
  if [ -n "$ext" ]; then echo "versleuteling=age"; echo "ontvanger=$(cat "$ONTVANGER")"; else echo "versleuteling=GEEN"; fi
  echo "database_bytes=$(stat -c %s "$tmp/database.dump$ext")"
  echo "uploads_bytes=$(stat -c %s "$tmp/uploads.tar.gz$ext")"
} > "$tmp/info.txt"

( cd "$tmp" && sha256sum "database.dump$ext" "uploads.tar.gz$ext" info.txt > SHA256SUMS )
mv "$tmp" "$doel"
trap - ERR
date --iso-8601=seconds > "$doel/KLAAR"
echo "[backup] klaar: $doel"

# Oude back-ups op de VM opruimen (alleen volledige mappen met KLAAR; nooit de nieuwste).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BEWAAR_DAGEN" ! -path "$doel" -print -exec rm -rf {} + || true
# Achtergebleven half-afgemaakte mappen (crash) opruimen.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '.bezig-*' -mmin +360 -exec rm -rf {} + || true
