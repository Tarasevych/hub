#!/usr/bin/env bash
# mijn-ruimte-uitrol.sh — veilige uitrol van een ONDERTEKEND releasepakket (vervangt mijn-ruimte-mcp-doen en de sudo-regel).
# Geïnstalleerd als /usr/local/sbin/mijn-ruimte-uitrol (root:root 0755), gestart door mijn-ruimte-uitrol.path zodra er iets in de
# inbox verandert. Draait als root, maar voert NOOIT code uit die niet met de uitrolsleutel van de eigenaar is ondertekend:
#
#   1. De app/MCP-dienst (gebruiker mijnruimte) kan alleen twee bestanden in de inbox leggen:
#        mijn-ruimte-<JJJJMMDD-UUMMSS>.tar.gz   en   mijn-ruimte-<JJJJMMDD-UUMMSS>.tar.gz.sig
#   2. Dit script KOPIEERT beide eerst naar een eigen root-map (0700) en controleert daarna alleen die kopie (geen TOCTOU:
#      wat in de inbox gebeurt nadat de kopie is gemaakt, telt niet meer).
#   3. Handtekening: `ssh-keygen -Y verify` met de publieke sleutel(s) in /etc/mijn-ruimte/uitrol-ondertekenaars (root-eigendom,
#      niet schrijfbaar voor groep/anderen), identiteit uitrol@mijn-ruimte, naamruimte mijn-ruimte-uitrol. De privésleutel staat
#      alleen op de pc van de eigenaar (met wachtwoordzin), nooit op de server.
#   4. Het pakket bevat UITROL-VERSIE; die moet gelijk zijn aan de versie in de bestandsnaam (de naam zelf is niet ondertekend) en
#      NIEUWER dan de laatst uitgerolde versie (geen terugrol naar een oud, wel ondertekend pakket via deze weg; terugdraaien gaat
#      met `installeer-app.sh terugdraaien` via SSH).
#   5. Het archief mag alleen gewone bestanden en mappen bevatten: geen symlinks, hardlinks, apparaten, absolute paden of "..".
#   6. Pas dan: installeer-app.sh installeren <uitgepakte bron> (bouwen, back-up, migreren, activeren, gezondheidscontrole).
# Uitkomst in /var/lib/mijn-ruimte-uitrol-status/status.json (root:mijnruimte 0640), zodat de app/MCP de stand kan tonen.
# Tweetalige meldingen staan in de status (Oekraïens + Nederlands); het logboek (journal) is Nederlands.
set -euo pipefail
umask 077
export LC_ALL=C

# Overschrijven van paden kan alleen in tests (niet als root): de root-dienst gebruikt altijd de vaste paden.
if [ "$(id -u)" -eq 0 ]; then
  unset UITROL_INBOX UITROL_WERK UITROL_STATUS_DIR UITROL_ONDERTEKENAARS UITROL_INSTALLEER UITROL_LOCK UITROL_MAX_BYTES UITROL_GROEP 2>/dev/null || true
fi
INBOX="${UITROL_INBOX:-/srv/mijn-ruimte/uitrol-inbox}"
WERK_ROOT="${UITROL_WERK:-/var/lib/mijn-ruimte-uitrol}"
STATUS_DIR="${UITROL_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
ONDERTEKENAARS="${UITROL_ONDERTEKENAARS:-/etc/mijn-ruimte/uitrol-ondertekenaars}"
INSTALLEER="${UITROL_INSTALLEER:-}"          # leeg = deploy/installeer-app.sh uit het (gecontroleerde) pakket
LOCK="${UITROL_LOCK:-/run/lock/mijn-ruimte-uitrol.lock}"
MAX_BYTES="${UITROL_MAX_BYTES:-314572800}"    # 300 MB
GROEP="${UITROL_GROEP:-mijnruimte}"
IDENTITEIT="uitrol@mijn-ruimte"
NAAMRUIMTE="mijn-ruimte-uitrol"
PATROON='^mijn-ruimte-([0-9]{8}-[0-9]{6})\.tar\.gz$'

log() { echo "[uitrol] $*" >&2; }
mkdir -p "$WERK_ROOT" "$STATUS_DIR"
chmod 0700 "$WERK_ROOT"

status() { # status <staat> <code> <uk> <nl> [versie]
  local tmp; tmp="$(mktemp "$STATUS_DIR/.status.XXXXXX")"
  python3 - "$tmp" "$1" "$2" "$3" "$4" "${5:-}" <<'PY'
import json, sys, datetime
path, staat, code, uk, nl, versie = sys.argv[1:7]
json.dump({"staat": staat, "code": code, "uk": uk, "nl": nl, "versie": versie,
           "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat()}, open(path, "w"), ensure_ascii=False)
PY
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATUS_DIR/status.json"
}

exec 8>"$LOCK"
flock -n 8 || { log "er loopt al een uitrol"; exit 0; }

WERK="$(mktemp -d "$WERK_ROOT/pakket.XXXXXX")"
opruimen() { rm -rf -- "$WERK"; }
trap opruimen EXIT

weiger() { # weiger <code> <uk> <nl>
  log "GEWEIGERD: $1 — $3"
  status geweigerd "$1" "$2" "$3" "${VERSIE:-}"
  # Het geweigerde pakket uit de inbox halen (rm volgt geen symlinks), anders blijft de path-unit afgaan.
  [ -n "${NAAM:-}" ] && rm -f -- "$INBOX/$NAAM" "$INBOX/$NAAM.sig"
  exit 2
}

# ---- 1. kandidaat kiezen (nieuwste geldige naam; alleen gewone bestanden, geen symlinks) ----
[ -d "$INBOX" ] && [ ! -L "$INBOX" ] || { log "inbox $INBOX ontbreekt"; exit 0; }
NAAM=""; VERSIE=""
while IFS= read -r kandidaat; do
  if [[ "$kandidaat" =~ $PATROON ]]; then NAAM="$kandidaat"; VERSIE="${BASH_REMATCH[1]}"; fi
done < <(find "$INBOX" -maxdepth 1 -mindepth 1 -type f -printf '%f\n' | LC_ALL=C sort)
if [ -z "$NAAM" ]; then log "geen pakket in de inbox"; exit 0; fi
[ -f "$INBOX/$NAAM.sig" ] && [ ! -L "$INBOX/$NAAM.sig" ] || weiger SIG_ONTBREEKT "Немає файлу підпису (.sig)." "Het handtekeningbestand (.sig) ontbreekt."
[ ! -L "$INBOX/$NAAM" ] || weiger SYMLINK "Пакет є символьним посиланням." "Het pakket is een symlink."
status bezig CONTROLE "Перевіряю пакет $VERSIE." "Pakket $VERSIE wordt gecontroleerd." "$VERSIE"

# ---- 2. kopie naar de eigen root-map; vanaf hier telt alleen de kopie ----
timeout 120 head -c "$((MAX_BYTES + 1))" < "$INBOX/$NAAM" > "$WERK/pakket.tar.gz" || weiger KOPIE "Не вдалося скопіювати пакет." "Kopiëren van het pakket mislukt."
timeout 10 head -c 8193 < "$INBOX/$NAAM.sig" > "$WERK/pakket.tar.gz.sig" || weiger KOPIE "Не вдалося скопіювати підпис." "Kopiëren van de handtekening mislukt."
[ "$(stat -c %s "$WERK/pakket.tar.gz")" -le "$MAX_BYTES" ] || weiger TE_GROOT "Пакет завеликий." "Het pakket is te groot."
[ "$(stat -c %s "$WERK/pakket.tar.gz.sig")" -le 8192 ] || weiger SIG_ONGELDIG "Підпис має неправильний розмір." "De handtekening heeft een onjuiste grootte."

# ---- 3. handtekening ----
[ -f "$ONDERTEKENAARS" ] && [ ! -L "$ONDERTEKENAARS" ] || weiger GEEN_SLEUTEL "На сервері немає публічного ключа випуску." "Er staat geen publieke uitrolsleutel op de server."
if [ "$(id -u)" -eq 0 ]; then
  read -r eigenaar modus < <(stat -c '%u %a' "$ONDERTEKENAARS")
  [ "$eigenaar" = 0 ] || weiger SLEUTEL_EIGENAAR "Файл ключів не належить root." "Het sleutelbestand is niet van root."
  (( (8#$modus & 8#022) == 0 )) || weiger SLEUTEL_RECHTEN "Файл ключів доступний для запису іншим." "Het sleutelbestand is schrijfbaar voor anderen."
fi
command -v ssh-keygen >/dev/null || weiger GEEN_SSH_KEYGEN "Немає ssh-keygen." "ssh-keygen ontbreekt."
if ! ssh-keygen -Y verify -f "$ONDERTEKENAARS" -I "$IDENTITEIT" -n "$NAAMRUIMTE" -s "$WERK/pakket.tar.gz.sig" < "$WERK/pakket.tar.gz" >/dev/null 2>"$WERK/verify.log"; then
  weiger HANDTEKENING_ONGELDIG "Підпис недійсний: пакет змінено або підписано чужим ключем." "Ongeldige handtekening: het pakket is gewijzigd of met een andere sleutel ondertekend."
fi
log "handtekening geldig voor $NAAM"

# ---- 4. inhoud: alleen gewone bestanden en mappen; daarna uitpakken met het 'data'-filter ----
mkdir "$WERK/bron"
if ! python3 - "$WERK/pakket.tar.gz" "$WERK/bron" "$MAX_BYTES" > "$WERK/tar.log" 2>&1 <<'PY'
import sys, tarfile, posixpath
pakket, doel, maxb = sys.argv[1], sys.argv[2], int(sys.argv[3])
totaal = 0
with tarfile.open(pakket, "r:gz") as tf:
    leden = tf.getmembers()
    for m in leden:
        naam = m.name
        delen = [d for d in naam.split("/") if d not in ("", ".")]
        if naam.startswith("/") or ".." in delen or "\\" in naam or "\n" in naam:
            sys.exit(f"onveilig pad: {naam!r}")
        if not (m.isfile() or m.isdir()):
            sys.exit(f"geen gewoon bestand of map: {naam!r}")
        totaal += m.size
        if totaal > maxb * 4:
            sys.exit("uitgepakt te groot")
    tf.extractall(doel, members=leden, filter="data")
PY
then
  weiger INHOUD_ONVEILIG "Архів містить недозволені елементи (посилання, пристрої, шляхи поза текою)." "Het archief bevat niet-toegestane onderdelen (links, apparaten, paden buiten de map): $(tail -c 200 "$WERK/tar.log" | tr '\n' ' ')"
fi
BRON="$WERK/bron"
# git archive --prefix=… levert één bovenmap; die mag (precies één map, verder niets).
if [ ! -f "$BRON/UITROL-VERSIE" ]; then
  mapfile -t top < <(find "$BRON" -mindepth 1 -maxdepth 1 -printf '%f\n')
  if [ "${#top[@]}" -eq 1 ] && [ -d "$BRON/${top[0]}" ]; then BRON="$BRON/${top[0]}"; fi
fi
[ -f "$BRON/UITROL-VERSIE" ] || weiger GEEN_VERSIE "У пакеті немає UITROL-VERSIE." "UITROL-VERSIE ontbreekt in het pakket."
INHOUD_VERSIE="$(head -c 64 "$BRON/UITROL-VERSIE" | tr -d '\r\n[:space:]')"
[ "$INHOUD_VERSIE" = "$VERSIE" ] || weiger VERSIE_VERSCHILT "Версія в пакеті ($INHOUD_VERSIE) не збігається з назвою ($VERSIE)." "Versie in het pakket ($INHOUD_VERSIE) wijkt af van de naam ($VERSIE)."
LAATSTE="$(cat "$WERK_ROOT/laatste-versie" 2>/dev/null || echo 00000000-000000)"
[[ "$VERSIE" > "$LAATSTE" ]] || weiger NIET_NIEUWER "Версія $VERSIE не новіша за встановлену ($LAATSTE)." "Versie $VERSIE is niet nieuwer dan de geïnstalleerde ($LAATSTE)."
[ -f "$BRON/deploy/installeer-app.sh" ] || weiger GEEN_INSTALLER "У пакеті немає deploy/installeer-app.sh." "deploy/installeer-app.sh ontbreekt in het pakket."

# ---- 5. installeren (alleen ondertekende code) ----
rm -f -- "$INBOX/$NAAM" "$INBOX/$NAAM.sig"
status bezig INSTALLEREN "Встановлюю випуск $VERSIE." "Release $VERSIE wordt geïnstalleerd." "$VERSIE"
if [ -n "$INSTALLEER" ]; then cmd=( "$INSTALLEER" installeren "$BRON" ); else cmd=( bash "$BRON/deploy/installeer-app.sh" installeren "$BRON" ); fi
if "${cmd[@]}" > "$WERK/installeer.log" 2>&1; then
  printf '%s\n' "$VERSIE" > "$WERK_ROOT/laatste-versie"
  # Oudere (nooit meer installeerbare) pakketten uit de inbox halen.
  find "$INBOX" -maxdepth 1 -type f \( -name 'mijn-ruimte-*.tar.gz' -o -name 'mijn-ruimte-*.tar.gz.sig' \) -delete 2>/dev/null || true
  status klaar OK "Випуск $VERSIE встановлено." "Release $VERSIE is geïnstalleerd." "$VERSIE"
  log "klaar: $VERSIE"
else
  tail -n 40 "$WERK/installeer.log" >&2 || true
  status mislukt INSTALLATIE_MISLUKT "Встановлення не вдалося; попередній випуск лишився активним." "Installeren mislukt; de vorige release blijft actief." "$VERSIE"
  exit 1
fi
