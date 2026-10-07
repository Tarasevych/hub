#!/usr/bin/env bash
# backup-maken.sh — maakt een consistente back-up van Mijn Ruimte voor ophalen door de host (pull-model).
#
# Resultaat: $BACKUP_DIR/<JJJJMMDD-UUMMSS>/
#   database.dump.age    pg_dump --format=custom (alle schema's, zonder eigenaar/rechten), age-versleuteld
#   uploads.tar.gz.age   inhoud van $UPLOADS_DIR, age-versleuteld
#   systeem.tar.gz.age   de rest van het systeem waarop de site draait (zonder geheimen): de actieve release (code), de systemd-units en timers,
#                        de tunnelconfiguratie (zonder inloggegevens), de MCP-brug en zijn overlay en de beheerconfiguratie; age-versleuteld
#   systeem-info.txt     versies (node, postgres, cloudflared, age, besturingssysteem), draaiende diensten en luisterende poorten (klare tekst, niets geheims)
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

# Fase 2: app.records heeft RLS (FORCE). De dump moet alle rijen zien → systeemrol (BYPASSRLS) als die er is.
# Audit-fix 4: na env-splitsen staat DATABASE_URL niet meer in geheimen.env; de systeemrol volstaat.
DUMP_URL="${DATABASE_URL_SYSTEM:-${DATABASE_URL:-}}"
[ -n "$DUMP_URL" ] || { echo "[backup] DATABASE_URL_SYSTEM ontbreekt (EnvironmentFile /etc/mijn-ruimte/geheimen.env)" >&2; exit 1; }
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
pg_dump --dbname="$DUMP_URL" --format=custom --compress=6 --no-owner --no-privileges | schrijf "$tmp/database.dump$ext"

echo "[backup] uploads archiveren…"
if [ -d "$UPLOADS_DIR" ]; then
  tar --create --gzip --file=- --directory="$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" | schrijf "$tmp/uploads.tar.gz$ext"
else
  echo "[backup] waarschuwing: $UPLOADS_DIR bestaat niet; leeg archief" >&2
  tar --create --gzip --file=- --files-from=/dev/null | schrijf "$tmp/uploads.tar.gz$ext"
fi

# Systeem: alles wat nodig is om de server na een totaalverlies opnieuw op te bouwen, behalve de geheimen (die hebben een eigen age-archief).
# Elk pad is "best effort": wat de back-upgebruiker niet kan lezen wordt overgeslagen en in systeem-info.txt vermeld.
echo "[backup] systeem (code, units, tunnelconfig, versies) archiveren…"
release="$(readlink -f /srv/mijn-ruimte/current 2>/dev/null || echo onbekend)"
{
  echo "tijdstip=$(date --iso-8601=seconds)"
  echo "release=$release"
  echo "os=$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-onbekend}")"
  echo "kernel=$(uname -r)"
  echo "node=$(node --version 2>/dev/null || echo onbekend)"
  echo "postgres=$(psql --version 2>/dev/null | head -1 || echo onbekend)"
  echo "cloudflared=$(cloudflared --version 2>/dev/null | head -1 || echo onbekend)"
  echo "age=$(age --version 2>/dev/null | head -1 || echo onbekend)"
  echo "--- diensten (mijn-ruimte, cloudflared, postgresql) ---"
  systemctl list-units --type=service --type=timer --all --no-pager --plain --no-legend 'mijn-ruimte*' 'cloudflared*' 'postgresql*' 2>/dev/null | cut -c1-160 || true
  echo "--- luisterende poorten ---"
  ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | sort -u || true
} > "$tmp/systeem-info.txt" 2>/dev/null || true
sys_paden=()
for p in "$release" /srv/mijn-ruimte/mcp /srv/mijn-ruimte/mcp-staging/overlay /etc/cloudflared/config.yml /etc/mijn-ruimte; do
  if [ -r "$p" ]; then sys_paden+=("${p#/}"); else echo "overgeslagen (niet leesbaar of afwezig): $p" >> "$tmp/systeem-info.txt"; fi
done
for p in /etc/systemd/system/mijn-ruimte* /etc/systemd/system/cloudflared.service; do
  [ -r "$p" ] && sys_paden+=("${p#/}")
done
if [ "${#sys_paden[@]}" -gt 0 ]; then
  # Geheimen blijven eruit: geheimen.env, sleutels, certificaten en tunnel-inloggegevens. tar-code 1 (bestand veranderde) is geen fout.
  { tar --create --gzip --file=- --directory=/ --ignore-failed-read \
      --exclude='*geheimen*' --exclude='*.env' --exclude='*.pem' --exclude='*.key' --exclude='*herstelsleutel*' --exclude='*credentials*' --exclude='*.age.txt' \
      --exclude='*/node_modules' "${sys_paden[@]}" || [ $? -eq 1 ]; } | schrijf "$tmp/systeem.tar.gz$ext"
else
  echo "[backup] waarschuwing: geen systeempaden leesbaar; leeg systeemarchief" >&2
  tar --create --gzip --file=- --files-from=/dev/null | schrijf "$tmp/systeem.tar.gz$ext"
fi

migraties="$(psql "$DUMP_URL" -Atc "select string_agg(version, ',' order by version) from app.schema_migrations" 2>/dev/null || echo onbekend)"
{
  echo "tijdstip=$(date --iso-8601=seconds)"
  echo "release=$release"
  echo "migraties=$migraties"
  if [ -n "$ext" ]; then echo "versleuteling=age"; echo "ontvanger=$(cat "$ONTVANGER")"; else echo "versleuteling=GEEN"; fi
  echo "database_bytes=$(stat -c %s "$tmp/database.dump$ext")"
  echo "uploads_bytes=$(stat -c %s "$tmp/uploads.tar.gz$ext")"
  echo "systeem_bytes=$(stat -c %s "$tmp/systeem.tar.gz$ext")"
} > "$tmp/info.txt"

( cd "$tmp" && sha256sum "database.dump$ext" "uploads.tar.gz$ext" "systeem.tar.gz$ext" systeem-info.txt info.txt > SHA256SUMS )
mv "$tmp" "$doel"
trap - ERR
date --iso-8601=seconds > "$doel/KLAAR"
echo "[backup] klaar: $doel"

# Oude back-ups op de VM opruimen (alleen volledige mappen met KLAAR; nooit de nieuwste).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BEWAAR_DAGEN" ! -path "$doel" -print -exec rm -rf {} + || true
# Achtergebleven half-afgemaakte mappen (crash) opruimen.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '.bezig-*' -mmin +360 -exec rm -rf {} + || true
