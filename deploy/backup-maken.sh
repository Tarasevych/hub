#!/usr/bin/env bash
# backup-maken.sh — maakt een consistente back-up van Mijn Ruimte voor ophalen door de host (pull-model).
#
# Resultaat: $BACKUP_DIR/<JJJJMMDD-UUMMSS>/
#   database.dump     pg_dump --format=custom (alle schema's, zonder eigenaar/rechten)
#   uploads.tar.gz    inhoud van $UPLOADS_DIR
#   info.txt          tijdstip, release, migraties, groottes
#   SHA256SUMS        controlesommen
#   KLAAR             wordt als laatste geschreven: de host haalt alleen mappen met KLAAR op
# De VM bewaart $BACKUP_BEWAAR_DAGEN dagen (standaard 7); de host is verantwoordelijk voor de lange termijn.
#
# Geheimen (geheimen.env) en de sleutels *_KEY_V1/RECOVERY_CODE_PEPPER zitten er bewust NIET in:
# bewaar die apart (wachtwoordmanager). Zonder die sleutels zijn versleutelde velden onleesbaar.
#
# Draait normaal via mijn-ruimte-backup.service (gebruiker mijnruimte, groep mijnruimte-backup).
# Handmatig: sudo systemctl start mijn-ruimte-backup.service
#
# Ophalen vanaf de host (voorbeeld, gebruiker 'backup' in groep mijnruimte-backup op de VM):
#   rsync -a --include='*/' --include='*' vm:/srv/backups/mijn-ruimte/ /pad/op/host/mijn-ruimte/
#   (daarna per map: sha256sum -c SHA256SUMS)
# Terugzetten: zie deploy/LEESMIJ.md, sectie "Back-up terugzetten".
set -euo pipefail
umask 027

: "${DATABASE_URL:?DATABASE_URL ontbreekt (EnvironmentFile /etc/mijn-ruimte/geheimen.env)}"
UPLOADS_DIR="${UPLOADS_DIR:-/srv/data/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/mijn-ruimte}"
BEWAAR_DAGEN="${BACKUP_BEWAAR_DAGEN:-7}"

stempel="$(date +%Y%m%d-%H%M%S)"
doel="$BACKUP_DIR/$stempel"
tmp="$BACKUP_DIR/.bezig-$stempel"
mkdir -p "$tmp"
trap 'rm -rf "$tmp"' ERR

echo "[backup] database dumpen…"
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=6 --no-owner --no-privileges --file="$tmp/database.dump"

echo "[backup] uploads archiveren…"
if [ -d "$UPLOADS_DIR" ]; then
  tar --create --gzip --file="$tmp/uploads.tar.gz" --directory="$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
else
  echo "[backup] waarschuwing: $UPLOADS_DIR bestaat niet; leeg archief" >&2
  tar --create --gzip --file="$tmp/uploads.tar.gz" --files-from=/dev/null
fi

release="$(readlink -f /srv/mijn-ruimte/current 2>/dev/null || echo onbekend)"
migraties="$(psql "$DATABASE_URL" -Atc "select string_agg(version, ',' order by version) from app.schema_migrations" 2>/dev/null || echo onbekend)"
{
  echo "tijdstip=$(date --iso-8601=seconds)"
  echo "release=$release"
  echo "migraties=$migraties"
  echo "database_bytes=$(stat -c %s "$tmp/database.dump")"
  echo "uploads_bytes=$(stat -c %s "$tmp/uploads.tar.gz")"
} > "$tmp/info.txt"

( cd "$tmp" && sha256sum database.dump uploads.tar.gz info.txt > SHA256SUMS )
mv "$tmp" "$doel"
trap - ERR
date --iso-8601=seconds > "$doel/KLAAR"
echo "[backup] klaar: $doel"

# Oude back-ups op de VM opruimen (alleen volledige mappen met KLAAR; nooit de nieuwste).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BEWAAR_DAGEN" ! -path "$doel" -print -exec rm -rf {} + || true
# Achtergebleven half-afgemaakte mappen (crash) opruimen.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '.bezig-*' -mmin +360 -exec rm -rf {} + || true
