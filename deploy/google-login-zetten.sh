#!/usr/bin/env bash
# google-login-zetten.sh — zet de Google-login (OAuth-client) in /etc/mijn-ruimte/geheimen.env.
# Installeren op de VM (als root):  install -o root -g root -m 0755 deploy/google-login-zetten.sh /usr/local/sbin/google-login-zetten
# Aanroep (vanaf de pc: scripts/google-login-instellen.ps1):
#   printf '%s\n%s\n' "<client-id>" "<client-secret>" | sudo /usr/local/sbin/google-login-zetten
# - leest PRECIES twee regels van stdin (client-ID, client-secret); nooit uit argumenten;
# - controleert het formaat; toont nooit een waarde (ook niet bij fouten);
# - vervangt of voegt GOOGLE_OAUTH_CLIENT_ID en GOOGLE_OAUTH_CLIENT_SECRET toe; eigenaar en rechten van
#   geheimen.env blijven gelijk; schrijft via een tijdelijk bestand in dezelfde map + mv (atomisch);
# - GOOGLE_SUITE_CLIENT_ID wint in de app van GOOGLE_OAUTH_CLIENT_ID: staat die er met een ANDERE waarde,
#   dan wordt hij verwijderd (met waarschuwing); gelijk = blijft staan;
# - back-up van het oude bestand (root, 0600) → herstart mijn-ruimte → controle `is-active` en HTTP 200 voor
#   Host hub.tarasevych.com op 127.0.0.1:8080 → bij succes back-up geshred; bij falen oud bestand terug + herstart.
# Uitvoer tweetalig: eerst Oekraïens, dan Nederlands. Afsluitcode 0 = gelukt.
set -euo pipefail
umask 077

GEHEIMEN="${GEHEIMEN:-/etc/mijn-ruimte/geheimen.env}"
DIENST=mijn-ruimte.service
PORT="${PORT:-8080}"
HOST_KOP=hub.tarasevych.com

zeg()  { printf '%s\n  %s\n' "$1" "$2"; }
fout() { printf 'ПОМИЛКА: %s\n  FOUT: %s\n' "$1" "$2" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fout "запустіть від root (sudo)" "voer dit uit als root (sudo)"
[ -f "$GEHEIMEN" ] || fout "$GEHEIMEN не знайдено" "$GEHEIMEN ontbreekt"
command -v curl >/dev/null || fout "немає curl" "curl ontbreekt"

# --- invoer: twee regels van stdin (geen echo, geen argumenten) ---
[ ! -t 0 ] || fout "дані очікуються через stdin, а не з клавіатури" "verwacht invoer via stdin, niet vanaf het toetsenbord"
IFS= read -r CLIENT_ID || true
IFS= read -r CLIENT_SECRET || true
CLIENT_ID="${CLIENT_ID%$'\r'}"; CLIENT_SECRET="${CLIENT_SECRET%$'\r'}"
if IFS= read -r _extra && [ -n "$_extra" ]; then fout "забагато рядків на вході (очікується 2)" "te veel invoerregels (verwacht 2)"; fi
unset _extra

[[ "$CLIENT_ID" =~ ^[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com$ ]] \
  || fout "Client ID має неправильний формат (очікується <цифри>-<код>.apps.googleusercontent.com)" "client-ID heeft een ongeldig formaat (verwacht <cijfers>-<code>.apps.googleusercontent.com)"
[ "${#CLIENT_SECRET}" -ge 20 ] && [ "${#CLIENT_SECRET}" -le 200 ] && [[ "$CLIENT_SECRET" =~ ^[A-Za-z0-9_-]+$ ]] \
  || fout "Client secret має неправильний формат (20–200 символів: A-Z a-z 0-9 _ -)" "client-secret heeft een ongeldig formaat (20–200 tekens: A-Z a-z 0-9 _ -)"

# --- nieuw bestand opbouwen (in dezelfde map, zodat mv atomisch is) ---
MAP="$(dirname "$GEHEIMEN")"
BACKUP="$(mktemp "$MAP/.geheimen.env.backup.XXXXXX")"
NIEUW="$(mktemp "$MAP/.geheimen.env.nieuw.XXXXXX")"
EIGENAAR="$(stat -c '%u:%g' "$GEHEIMEN")"; MODUS="$(stat -c '%a' "$GEHEIMEN")"
GESLAAGD=0
opruimen() {
  rm -f -- "$NIEUW"
  if [ "$GESLAAGD" -ne 1 ] && [ -s "$BACKUP" ] && ! cmp -s "$BACKUP" "$GEHEIMEN"; then
    # Mislukt na het vervangen: oud bestand terug (oorspronkelijke eigenaar/rechten), dienst opnieuw starten.
    if install -o "${EIGENAAR%%:*}" -g "${EIGENAAR##*:}" -m "$MODUS" -- "$BACKUP" "$MAP/.geheimen.env.herstel.$$" \
       && mv -f -- "$MAP/.geheimen.env.herstel.$$" "$GEHEIMEN"; then
      systemctl restart "$DIENST" >/dev/null 2>&1 || true
      zeg "Попередній geheimen.env відновлено, сервіс перезапущено." "Vorige geheimen.env teruggezet, dienst herstart." >&2
    else
      rm -f -- "$MAP/.geheimen.env.herstel.$$"
      zeg "НЕ вдалося відновити geheimen.env; резервна копія лишилась: $BACKUP (root, 0600)" "Terugzetten van geheimen.env MISLUKT; back-up blijft staan: $BACKUP (root, 0600)" >&2
      return
    fi
  fi
  if [ -f "$BACKUP" ]; then shred -u -- "$BACKUP" 2>/dev/null || rm -f -- "$BACKUP"; fi
}
trap opruimen EXIT

cp -- "$GEHEIMEN" "$BACKUP"; chown root:root "$BACKUP"; chmod 0600 "$BACKUP"

# Waarde van GOOGLE_SUITE_CLIENT_ID (laatste toewijzing; aanhalingstekens weg) zonder te tonen.
SUITE="$(sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?GOOGLE_SUITE_CLIENT_ID=//p' "$GEHEIMEN" | tail -n 1 | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\r')"
SUITE_WEG=0
if [ -n "$SUITE" ] && [ "$SUITE" != "$CLIENT_ID" ]; then SUITE_WEG=1; fi
unset SUITE

# Alle bestaande regels voor de twee sleutels (en evt. GOOGLE_SUITE_CLIENT_ID) weglaten, daarna toevoegen.
PATROON='^[[:space:]]*(export[[:space:]]+)?(GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET)='
[ "$SUITE_WEG" -eq 1 ] && PATROON='^[[:space:]]*(export[[:space:]]+)?(GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_SUITE_CLIENT_ID)='
{ grep -Ev "$PATROON" "$GEHEIMEN" || true; } > "$NIEUW"
[ ! -s "$NIEUW" ] || [ -z "$(tail -c1 "$NIEUW")" ] || printf '\n' >> "$NIEUW"
# printf is een shell-builtin: de waarden komen niet in de argumenten van een proces terecht.
printf 'GOOGLE_OAUTH_CLIENT_ID=%s\nGOOGLE_OAUTH_CLIENT_SECRET=%s\n' "$CLIENT_ID" "$CLIENT_SECRET" >> "$NIEUW"
unset CLIENT_ID CLIENT_SECRET
chown "$EIGENAAR" "$NIEUW"; chmod "$MODUS" "$NIEUW"
mv -f -- "$NIEUW" "$GEHEIMEN"

if [ "$SUITE_WEG" -eq 1 ]; then
  zeg "УВАГА: GOOGLE_SUITE_CLIENT_ID мав ІНШЕ значення і має пріоритет над GOOGLE_OAUTH_CLIENT_ID — видалено." \
      "LET OP: GOOGLE_SUITE_CLIENT_ID had een ANDERE waarde en wint van GOOGLE_OAUTH_CLIENT_ID — verwijderd." >&2
fi
zeg "GOOGLE_OAUTH_CLIENT_ID і GOOGLE_OAUTH_CLIENT_SECRET записано (значення не показуються)." \
    "GOOGLE_OAUTH_CLIENT_ID en GOOGLE_OAUTH_CLIENT_SECRET geschreven (waarden worden niet getoond)."

# --- herstarten en controleren ---
systemctl restart "$DIENST" || fout "не вдалося перезапустити $DIENST" "herstart van $DIENST mislukt"
CODE=000
for _ in $(seq 1 30); do
  if systemctl is-active --quiet "$DIENST"; then
    CODE="$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' -H "Host: $HOST_KOP" "http://127.0.0.1:$PORT/" || true)"
    [ "$CODE" = "200" ] && break
  fi
  sleep 1
done
systemctl is-active --quiet "$DIENST" || fout "$DIENST не активний після перезапуску (journalctl -u $DIENST -n 50)" "$DIENST is niet actief na de herstart (journalctl -u $DIENST -n 50)"
[ "$CODE" = "200" ] || fout "сайт відповідає HTTP $CODE замість 200" "site antwoordt HTTP $CODE in plaats van 200"

GESLAAGD=1
zeg "OK: $DIENST активний, $HOST_KOP відповідає HTTP 200. Резервну копію знищено (shred)." \
    "OK: $DIENST actief, $HOST_KOP antwoordt HTTP 200. Back-up vernietigd (shred)."
