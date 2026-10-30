#!/usr/bin/env bash
# archief-maken.sh — maakt EEN volledig archief van Mijn Ruimte (alles om op een nieuwe machine met één opdracht terug te zetten).
# Draait als root via mijn-ruimte-archief.service (gestart door mijn-ruimte-archief.path zodra de site het verzoekbestand schrijft).
# Zelf installeren: deploy/installeer-app.sh kopieert dit script naar /usr/local/sbin/mijn-ruimte-archief (root-eigendom; de site kan het niet wijzigen).
#
# Resultaat: $UIT/mijn-ruimte-<stempel>-volledig.tar.age — het HELE archief is met age versleuteld voor de publieke sleutel van de
# eigenaar (audit 2026-10-08, C4: vroeger stonden code, units, sudoers en git-geschiedenis leesbaar in de tar). Uitpakken:
#   age -d -i herstelsleutel-age.txt mijn-ruimte-<stempel>-volledig.tar.age | tar -x
# $UIT is een root-map (/var/lib/mijn-ruimte-archief/uitgifte, root:mijnruimte 0750): de app kan lezen maar niets neerzetten of
# vervangen; het werk gebeurt in een root-map 0700. Overdracht via een vaste naam: archief-laatste.tar.age (+ archief-laatste.json).
# De app (mcp.tarasevych.com) geeft het alleen aan de eigenaar na step-up, via een willekeurige eenmalige download-id.
# Inhoud (binnen de versleuteling):
#   mijn-ruimte-<stempel>-volledig/
#     LEES-MIJ.txt            wat erin zit en hoe het terug te zetten (Oekraïens + Nederlands)
#     vidnovyty.sh            het herstelscript: één opdracht op een nieuwe machine (deploy/archief-herstellen.sh)
#     manifest.json           stempel, release, commit, versies, architectuur, groottes, onderdelen
#     SHA256SUMS              controlesommen van alle bestanden hieronder
#     kod/release.tar.gz      de broncode van de actieve release (zonder node_modules/dist: die bouwt de installer opnieuw, ook op een andere architectuur)
#     kod/mcp.tar.gz          MCP-deur (/srv/mijn-ruimte/mcp)
#     kod/repos/*.bundle      volledige git-geschiedenis van elke git-opslagplaats onder /srv/mijn-ruimte (als die er zijn)
#     baza/database.dump.age  complete database (pg_dump custom, met eigenaren en rechten)   — age-versleuteld
#     baza/globals.sql.age    databaserollen (pg_dumpall --globals-only)                      — age-versleuteld
#     fajly/uploads.tar.gz.age alle gebruikersbestanden                                       — age-versleuteld
#     sekrety/sekrety.tar.age geheimen.env, migratie.env, tunnel-credentials, MCP-token       — age-versleuteld
#     systeem/systeem.tar.gz  systemd-units, tunnelconfiguratie (zonder credentials), hulpscripts (geen sudoers); systeem/systeem-info.txt
#
# Versleuteling: alleen met de BESTAANDE publieke age-sleutel ($BACKUP_ONTVANGER); er komt nooit een nieuwe sleutel bij en de privésleutel
# staat nergens op de server. Terugzetten vraagt dus de herstelsleutel van de eigenaar.
# Volume-onafhankelijk: alles wordt gestreamd (pg_dump | age, tar | age); er is geen aparte kopie van de data in het geheugen en de benodigde
# schijfruimte wordt vooraf berekend en gecontroleerd. Het bestand kit-status.txt toont de voortgang (staat, stap, percentage, wat er nu gebeurt).
set -uo pipefail
umask 077

UIT="${ARCHIEF_UIT:-/var/lib/mijn-ruimte-archief/uitgifte}"
WERKROOT="${ARCHIEF_WERK:-/var/lib/mijn-ruimte-archief/werk}"
VERZOEK="${ARCHIEF_VERZOEK:-/srv/data/uploads/mcp-archives/kit-request}"
APP="${APP_ROOT:-/srv/mijn-ruimte}"
DATA="${DATA_ROOT:-/srv/data}"
ETC="${ETC_MIJN:-/etc/mijn-ruimte}"
ONTVANGER="${BACKUP_ONTVANGER:-$ETC/backup-ontvanger.age.pub}"
DB_NAAM="${DB_NAAM:-mijnruimte}"

GROEP="${ARCHIEF_GROEP:-mijnruimte}"
STATUS="$UIT/kit-status.txt"
GESCHIEDENIS="$UIT/history.json"

mkdir -p "$UIT" "$WERKROOT"; chmod 0700 "$WERKROOT"
exec 8>"${ARCHIEF_LOCK:-/run/lock/mijn-ruimte-archief.lock}"
flock -n 8 || { echo "er loopt al een archief" >&2; exit 0; }
rm -f -- "$VERZOEK"   # alleen weghalen (rm volgt geen symlinks); de inhoud wordt nooit gelezen

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date +%Y%m%d-%H%M%S)"
map="mijn-ruimte-${stamp}-volledig"
naam="${map}.tar.age"
werk="$WERKROOT/.bezig-${stamp}"
stage=1; pct=1; phase=check; detail=""
kod=0; baza=0; fajly=0; sekrety=0; systeem=0

schrijf_status() {
  local tmp="$STATUS.$$"
  {
    echo "state=$1"; echo "stage=$stage"; echo "pct=$pct"; echo "phase=$phase"; echo "detail=$detail"
    echo "name=$naam"; echo "started=$started"
    echo "kod=$kod"; echo "baza=$baza"; echo "fajly=$fajly"; echo "sekrety=$sekrety"; echo "systeem=$systeem"
    [ -n "${2:-}" ] && echo "error=$2"
    [ "$1" = ready ] && { echo "bytes=${3:-0}"; echo "finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; }
  } > "$tmp"
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp"; mv -f "$tmp" "$STATUS"
}
zet() { stage="$1"; pct="$2"; phase="$3"; detail="${4:-}"; schrijf_status building; }
mislukt() {
  local code="${1:-ARCHIVE_FAILED}"
  echo "[archief] MISLUKT: $code ${2:-}" >&2
  detail="${2:-}"; schrijf_status failed "$code"
  rm -rf "$werk"
  exit 1
}
trap 'mislukt INTERRUPTED' INT TERM

# Volgt de groei van een uitvoerbestand en vertaalt dat naar een percentage tussen $3 en $4 (schatting $2 bytes); draait op de achtergrond.
volg() {
  local bestand="$1" schatting="$2" van="$3" tot="$4" label="$5" nu span
  span=$((tot - van))
  while sleep 1; do
    nu=$(stat -c %s "$bestand" 2>/dev/null || echo 0)
    local frac=$(( schatting > 0 ? (nu * 100) / schatting : 0 )); [ "$frac" -gt 97 ] && frac=97
    pct=$(( van + (span * frac) / 100 )); detail="$label: $(numfmt --to=iec "$nu" 2>/dev/null || echo "$nu")"
    schrijf_status building
  done
}
volg_start() { volg "$@" & VOLGER=$!; }
volg_stop() { [ -n "${VOLGER:-}" ] && { kill "$VOLGER" 2>/dev/null; wait "$VOLGER" 2>/dev/null; VOLGER=""; }; return 0; }
grootte() { stat -c %s "$1" 2>/dev/null || echo 0; }
versleutel() { age --encrypt --recipients-file "$ONTVANGER" --output "$1"; }

# ---- 1. controle ----
zet 1 2 check "controle van vereisten en schijfruimte"
[ "$(id -u)" -eq 0 ] || mislukt NOT_ROOT
command -v age >/dev/null || mislukt AGE_MISSING "apt install age"
grep -Eq '^age1[0-9a-z]{58}$' "$ONTVANGER" 2>/dev/null || mislukt AGE_RECIPIENT "publieke sleutel $ONTVANGER ontbreekt"
release="$(readlink -f "$APP/current" 2>/dev/null || true)"
[ -d "$release" ] || mislukt NO_RELEASE "$APP/current"
commit="$(cat "$release/BRON-COMMIT" 2>/dev/null || echo onbekend)"
rm -rf "$WERKROOT"/.bezig-* 2>/dev/null || true
db_bytes="$(runuser -u postgres -- psql -Atc "select pg_database_size('$DB_NAAM')" 2>/dev/null || echo 0)"
upl_bytes="$(du -sb --exclude=mcp-archives "$DATA/uploads" 2>/dev/null | cut -f1 || echo 0)"
rel_bytes="$(du -sb --exclude=node_modules --exclude=dist --exclude=dist-server --exclude=.git "$release" 2>/dev/null | cut -f1 || echo 0)"
nodig=$(( (db_bytes + upl_bytes + rel_bytes) * 2 + 300*1024*1024 ))
vrij=$(df -B1 --output=avail "$WERKROOT" | tail -1 | tr -d ' ')
if [ "$vrij" -lt "$nodig" ]; then mislukt NO_SPACE "nodig ~$(numfmt --to=iec "$nodig"), vrij $(numfmt --to=iec "$vrij")"; fi
mkdir -p "$werk/$map"/{kod/repos,baza,fajly,sekrety,systeem} || mislukt WORKDIR
W="$werk/$map"

# ---- 2. code ----
zet 1 8 code "broncode van de actieve release"
tar --create --gzip --file "$W/kod/release.tar.gz" --directory "$(dirname "$release")" \
  --exclude=node_modules --exclude=dist --exclude=dist-server --exclude=.git --exclude=rapporten \
  --exclude='*.env' --exclude='*.pem' --exclude='*.key' --exclude='*.age' --transform "s#^$(basename "$release")#mijn-ruimte-code#" "$(basename "$release")" || mislukt CODE
tar --create --gzip --file "$W/kod/mcp.tar.gz" --directory "$APP" --exclude='*.env' --exclude='*.token' --exclude='*.secret' --exclude=.git \
  $( [ -d "$APP/mcp" ] && echo mcp ) 2>/dev/null || true
zet 1 14 code "git-geschiedenis (als er opslagplaatsen zijn)"
while IFS= read -r g; do
  d="$(dirname "$g")"; n="$(echo "${d#$APP/}" | tr '/ ' '__')"
  git -c safe.directory="$d" -C "$d" bundle create "$W/kod/repos/${n}.bundle" --all >/dev/null 2>&1 || true
done < <(find "$APP" -maxdepth 3 -name .git -not -path '*/releases/*' -not -path '*/node_modules/*' 2>/dev/null)
kod=$(( $(grootte "$W/kod/release.tar.gz") + $(grootte "$W/kod/mcp.tar.gz") ))

# ---- 3. database ----
zet 2 24 database "databaserollen"
runuser -u postgres -- pg_dumpall --globals-only 2>/dev/null | versleutel "$W/baza/globals.sql.age"; [ "${PIPESTATUS[0]}" -eq 0 ] && [ -s "$W/baza/globals.sql.age" ] || mislukt DATABASE "pg_dumpall"
zet 2 28 database "pg_dump van $DB_NAAM"
volg_start "$W/baza/database.dump.age" $(( db_bytes / 3 + 1 )) 28 50 "database"
runuser -u postgres -- pg_dump --format=custom --compress=6 "$DB_NAAM" 2>"$werk/pgdump.log" | versleutel "$W/baza/database.dump.age"; rc=${PIPESTATUS[0]}
volg_stop
[ "$rc" -eq 0 ] && [ -s "$W/baza/database.dump.age" ] || mislukt DATABASE "pg_dump: $(tail -c 200 "$werk/pgdump.log" 2>/dev/null | tr '\n' ' ')"
baza=$(( $(grootte "$W/baza/database.dump.age") + $(grootte "$W/baza/globals.sql.age") ))

# ---- 4. bestanden ----
zet 3 52 files "gebruikersbestanden"
volg_start "$W/fajly/uploads.tar.gz.age" $(( upl_bytes / 2 + 1 )) 52 72 "bestanden"
tar --create --gzip --file - --directory "$DATA" --exclude=uploads/mcp-archives --exclude=uploads/mcp-bridge.token uploads | versleutel "$W/fajly/uploads.tar.gz.age"; rc=${PIPESTATUS[0]}
volg_stop
[ "$rc" -eq 0 ] && [ -s "$W/fajly/uploads.tar.gz.age" ] || mislukt FILES
fajly=$(grootte "$W/fajly/uploads.tar.gz.age")

# ---- 5. geheimen en systeem ----
zet 4 74 secrets "geheimen (versleuteld)"
[ -s "$ETC/geheimen.env" ] || mislukt SECRETS "$ETC/geheimen.env ontbreekt"
sec=( "${ETC#/}" ); for f in /etc/cloudflared/*.json; do [ -e "$f" ] && sec+=( "${f#/}" ); done
tar --create --file - --directory / --ignore-failed-read "${sec[@]}" 2>/dev/null | versleutel "$W/sekrety/sekrety.tar.age"; rc=${PIPESTATUS[0]}
[ "$rc" -le 1 ] && [ -s "$W/sekrety/sekrety.tar.age" ] || mislukt SECRETS "tar/age"
sekrety=$(grootte "$W/sekrety/sekrety.tar.age")
zet 4 82 system "systemd-units, tunnelconfiguratie en versies"
{
  echo "tijdstip=$(date --iso-8601=seconds)"; echo "release=$release"; echo "commit=$commit"
  echo "os=$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-onbekend}")"; echo "architectuur=$(uname -m)"; echo "kernel=$(uname -r)"
  echo "virtualisatie=$(systemd-detect-virt 2>/dev/null || echo onbekend)"
  echo "node=$(node --version 2>/dev/null || echo onbekend)"; echo "postgres=$(runuser -u postgres -- psql -Atc 'show server_version' 2>/dev/null || echo onbekend)"
  echo "cloudflared=$(cloudflared --version 2>/dev/null | head -1 || echo onbekend)"; echo "age=$(age --version 2>/dev/null | head -1 || echo onbekend)"
  echo "--- luisterende poorten ---"; ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | sort -u
  echo "--- diensten ---"; systemctl list-unit-files --no-pager --plain --no-legend 'mijn-ruimte*' 'cloudflared*' 2>/dev/null | cut -c1-120
} > "$W/systeem/systeem-info.txt" 2>/dev/null
sysp=( ); for p in /etc/systemd/system/mijn-ruimte* /etc/systemd/system/cloudflared.service /etc/cloudflared/config.yml /usr/local/sbin/mijn-ruimte-*; do [ -e "$p" ] && sysp+=( "${p#/}" ); done
tar --create --gzip --file "$W/systeem/systeem.tar.gz" --directory / --ignore-failed-read "${sysp[@]}" 2>/dev/null || true
systeem=$(grootte "$W/systeem/systeem.tar.gz")

# ---- 6. verpakken ----
zet 5 88 pack "handleiding, herstelscript en controlesommen"
herstel="$release/deploy/archief-herstellen.sh"
[ -f "$herstel" ] && install -m 0755 "$herstel" "$W/vidnovyty.sh" || mislukt NO_RESTORE_SCRIPT "$herstel ontbreekt in de release"
cat > "$W/LEES-MIJ.txt" <<EOT
ПОВНИЙ АРХІВ САЙТУ MIJN RUIMTE / VOLLEDIG ARCHIEF VAN MIJN RUIMTE
Зібрано / Gemaakt: $stamp   Реліз / Release: $(basename "$release") (commit $commit)   Архітектура / Architectuur: $(uname -m)

ЩО ВСЕРЕДИНІ
  kod/        код сайту (release.tar.gz), міст MCP (mcp.tar.gz), історія git (repos/*.bundle, якщо є)
  baza/       повна база даних і ролі — ЗАШИФРОВАНО (age)
  fajly/      усі файли користувачів — ЗАШИФРОВАНО (age)
  sekrety/    секрети сервера й ключі тунелю — ЗАШИФРОВАНО (age)
  systeem/    служби systemd, конфіг тунелю (без ключів), версії програм
  vidnovyty.sh  скрипт відновлення в одну команду
  SHA256SUMS  контрольні суми

ЯК РОЗГОРНУТИ НА НОВІЙ МАШИНІ (Ubuntu/Debian, віртуальній чи справжній, x86-64 або ARM)
  1) age -d -i /шлях/до/herstelsleutel-age.txt $naam | tar -x && cd $map
  2) sudo bash vidnovyty.sh --sleutel /шлях/до/herstelsleutel-age.txt
     (спершу можна перевірити без змін:  sudo bash vidnovyty.sh --sleutel … --proefrun)
  Скрипт сам: перевіряє суми, ставить пакети (Node 24, PostgreSQL 17, age, cloudflared), створює користувача й теки, розшифровує секрети,
  відновлює базу й файли, збирає сайт під вашу архітектуру, піднімає служби й перевіряє здоров'я.
  Потрібна приватна age-ключ-файл власника (herstelsleutel-age.txt). Без нього шифровані частини відкрити неможливо — це навмисно.

ЯК ТРИМАТИ: у файлі весь сайт і його дані. Зберігайте на зовнішньому диску, не пересилайте поштою.

WAT ZIT ERIN / HOE TERUGZETTEN (Nederlands)
  Pak uit met "age -d -i herstelsleutel-age.txt $naam | tar -x", ga naar de map en voer uit:  sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt
  (eerst proberen zonder wijzigingen: --proefrun). Database, bestanden en geheimen zijn met age versleuteld; de herstelsleutel van de eigenaar is nodig.
EOT
cat > "$W/manifest.json" <<EOT
{"stempel":"$stamp","release":"$(basename "$release")","commit":"$commit","architectuur":"$(uname -m)","node":"$(node --version 2>/dev/null)","grootte":{"kod":$kod,"baza":$baza,"fajly":$fajly,"sekrety":$sekrety,"systeem":$systeem},"versleuteld":["alles","baza","fajly","sekrety"],"herstel":"vidnovyty.sh"}
EOT
( cd "$W" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS ) || mislukt CHECKSUMS
zet 5 94 pack "archief samenstellen en in zijn geheel versleutelen"
tar --create --file - --directory "$werk" "$map" | versleutel "$werk/$naam"; rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] && [ -s "$werk/$naam" ] || mislukt PACK
head -c 32 "$werk/$naam" | grep -q '^age-encryption.org/v1' || mislukt PACK_VERIFY "geen age-kop"
# Overdracht: eerst in de root-map klaarzetten, dan atomisch onder de vaste naam (de app kan in $UIT niets schrijven).
install -m 0640 -g "$GROEP" "$werk/$naam" "$UIT/.archief-laatste.tar.age.deel" 2>/dev/null || install -m 0640 "$werk/$naam" "$UIT/.archief-laatste.tar.age.deel"
mv -f "$UIT/.archief-laatste.tar.age.deel" "$UIT/archief-laatste.tar.age"
bytes="$(grootte "$UIT/archief-laatste.tar.age")"
printf '{"naam":"%s","bytes":%s,"stempel":"%s","versleuteld":"age"}\n' "$naam" "$bytes" "$stamp" > "$UIT/.archief-laatste.json.deel"
chgrp "$GROEP" "$UIT/.archief-laatste.json.deel" 2>/dev/null || true; chmod 0640 "$UIT/.archief-laatste.json.deel"
mv -f "$UIT/.archief-laatste.json.deel" "$UIT/archief-laatste.json"
rm -rf "$werk"

# geschiedenis bijwerken (er blijft één archief: archief-laatste.tar.age; het vorige wordt overschreven)
GESCH="$GESCHIEDENIS" NAAM="$naam" BYTES="$bytes" KOD="$kod" BAZA="$baza" FAJLY="$fajly" SEKRETY="$sekrety" SYSTEEM="$systeem" node -e '
const fs=require("fs");const f=process.env.GESCH;let h=[];try{h=JSON.parse(fs.readFileSync(f,"utf8"))}catch{}
h.unshift({at:new Date().toISOString(),name:process.env.NAAM,bytes:+process.env.BYTES,kod:+process.env.KOD,baza:+process.env.BAZA,fajly:+process.env.FAJLY,sekrety:+process.env.SEKRETY,systeem:+process.env.SYSTEEM});
fs.writeFileSync(f,JSON.stringify(h.slice(0,30)));' 2>/dev/null || true
chgrp "$GROEP" "$GESCHIEDENIS" 2>/dev/null || true; chmod 0640 "$GESCHIEDENIS" 2>/dev/null || true
pct=100; stage=5; phase=pack; detail="gereed"
schrijf_status ready "" "$bytes"
echo "[archief] klaar: $UIT/archief-laatste.tar.age ($naam, $bytes bytes)"
