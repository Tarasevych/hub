#!/usr/bin/env bash
# oauth-client-zetten.sh — zet de OAuth-client van Google of Microsoft in /etc/mijn-ruimte/geheimen.env, herstart de dienst
# en controleert de gezondheid. Opvolger van google-login-zetten.sh (dat nu hiernaartoe doorverwijst).
#
# Gebruik (als root; de werkgebruiker via sudo):
#   oauth-client-zetten.sh google      → GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
#   oauth-client-zetten.sh microsoft   → MICROSOFT_GRAPH_CLIENT_ID, MICROSOFT_GRAPH_CLIENT_SECRET, MICROSOFT_GRAPH_TENANT_ID
# Invoer:
#   - terminal: de waarden worden GEVRAAGD; het secret zonder echo (read -rs). Niets komt in argumenten, in `history` of in
#     een procestabel. Dit is de weg die «Майстер підключень» (admin → Інтеграції) toont;
#   - geen terminal (pijp, ssh vanaf de pc): PRECIES de regels van stdin — google: client-id, client-secret;
#     microsoft: client-id, client-secret, tenant (leeg = common). Dat is wat scripts/google-login-instellen.ps1 doet.
# Gedrag (gelijk aan google-login-zetten.sh): formaat controleren, nooit een waarde tonen (ook niet bij fouten), schrijven
# via een tijdelijk bestand in dezelfde map + mv (atomisch), rechten en eigenaar gelijk houden, back-up (root, 0600) →
# herstart → `is-active` en HTTP 200 op /__gezondheid → bij succes back-up geshred, bij falen oud bestand terug + herstart.
# Elke wijziging komt als naam + vingerafdruk (SHA-256, 8 hex) in geheimen.journaal — nooit de waarde.
# Uitvoer tweetalig: eerst Oekraïens, dan Nederlands. Afsluitcode 0 = gelukt.
set -euo pipefail
umask 077

PROVIDER="${1:-}"
GEHEIMEN="${GEHEIMEN:-/etc/mijn-ruimte/geheimen.env}"
JOURNAAL="${GEHEIMEN_JOURNAAL:-$(dirname "$GEHEIMEN")/geheimen.journaal}"
DIENST="${DIENST:-mijn-ruimte.service}"
PORT="${PORT:-8080}"
GEZONDHEID_URL="http://127.0.0.1:${PORT}/__gezondheid"
# Alleen voor tests: ZONDER_HERSTART=1 slaat systemctl/curl over (dan wordt alleen het bestand geschreven).
ZONDER_HERSTART="${ZONDER_HERSTART:-0}"

zeg()  { printf '%s\n  %s\n' "$1" "$2"; }
fout() { printf 'ПОМИЛКА: %s\n  FOUT: %s\n' "$1" "$2" >&2; exit 1; }

case "$PROVIDER" in
  google) NAMEN=(GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET); LABEL="Google" ;;
  microsoft) NAMEN=(MICROSOFT_GRAPH_CLIENT_ID MICROSOFT_GRAPH_CLIENT_SECRET MICROSOFT_GRAPH_TENANT_ID); LABEL="Microsoft" ;;
  *) fout "вкажіть провайдера: google або microsoft" "geef de provider op: google of microsoft" ;;
esac
if [ "$ZONDER_HERSTART" != "1" ]; then
  [ "$(id -u)" -eq 0 ] || fout "запустіть від root (sudo)" "voer dit uit als root (sudo)"
  command -v curl >/dev/null || fout "немає curl" "curl ontbreekt"
fi
[ -f "$GEHEIMEN" ] || fout "$GEHEIMEN не знайдено" "$GEHEIMEN ontbreekt"
command -v sha256sum >/dev/null || fout "немає sha256sum" "sha256sum ontbreekt"

# --- invoer -------------------------------------------------------------------------------------------------------------
CLIENT_ID=""; CLIENT_SECRET=""; TENANT=""
if [ -t 0 ]; then
  zeg "Налаштування OAuth-клієнта $LABEL. Значення не показуються й не зберігаються в історії." "OAuth-client $LABEL instellen. Waarden worden niet getoond en niet in de geschiedenis bewaard."
  IFS= read -r -p "Client ID (видно / zichtbaar): " CLIENT_ID
  IFS= read -r -s -p "Client secret (приховано / verborgen): " CLIENT_SECRET; printf '\n'
  if [ "$PROVIDER" = microsoft ]; then IFS= read -r -p "Tenant (порожньо = common / leeg = common): " TENANT; fi
else
  IFS= read -r CLIENT_ID || true
  IFS= read -r CLIENT_SECRET || true
  if [ "$PROVIDER" = microsoft ]; then IFS= read -r TENANT || true; fi
  if IFS= read -r _extra && [ -n "$_extra" ]; then fout "забагато рядків на вході" "te veel invoerregels"; fi
  unset _extra
fi
CLIENT_ID="${CLIENT_ID%$'\r'}"; CLIENT_SECRET="${CLIENT_SECRET%$'\r'}"; TENANT="${TENANT%$'\r'}"
CLIENT_ID="$(printf '%s' "$CLIENT_ID" | tr -d '[:space:]')"; CLIENT_SECRET="$(printf '%s' "$CLIENT_SECRET" | tr -d '[:space:]')"; TENANT="$(printf '%s' "$TENANT" | tr -d '[:space:]')"
[ "$PROVIDER" != microsoft ] || [ -n "$TENANT" ] || TENANT=common

case "$PROVIDER" in
  google)
    [[ "$CLIENT_ID" =~ ^[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com$ ]] \
      || fout "Client ID має неправильний формат (очікується <цифри>-<код>.apps.googleusercontent.com)" "client-ID heeft een ongeldig formaat (verwacht <cijfers>-<code>.apps.googleusercontent.com)"
    [ "${#CLIENT_SECRET}" -ge 16 ] && [ "${#CLIENT_SECRET}" -le 200 ] && [[ "$CLIENT_SECRET" =~ ^[A-Za-z0-9_.~-]+$ ]] \
      || fout "Client secret має неправильний формат (16–200 символів: A-Z a-z 0-9 _ . ~ -)" "client-secret heeft een ongeldig formaat (16–200 tekens: A-Z a-z 0-9 _ . ~ -)" ;;
  microsoft)
    [[ "$CLIENT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
      || fout "Application (client) ID має бути GUID" "Application (client) ID moet een GUID zijn"
    [ "${#CLIENT_SECRET}" -ge 16 ] && [ "${#CLIENT_SECRET}" -le 200 ] && [[ "$CLIENT_SECRET" =~ ^[A-Za-z0-9_.~+/=-]+$ ]] \
      || fout "Client secret має неправильний формат (16–200 символів)" "client-secret heeft een ongeldig formaat (16–200 tekens)"
    [[ "$TENANT" =~ ^(common|organizations|consumers|[0-9a-fA-F-]{36}|[a-z0-9-]+\.onmicrosoft\.com)$ ]] \
      || fout "Tenant має бути common, organizations, consumers, GUID або <naam>.onmicrosoft.com" "tenant moet common, organizations, consumers, een GUID of <naam>.onmicrosoft.com zijn" ;;
esac

# --- nieuw bestand opbouwen (zelfde map → mv is atomisch) ------------------------------------------------------------------
MAP="$(dirname "$GEHEIMEN")"
BACKUP="$(mktemp "$MAP/.geheimen.env.backup.XXXXXX")"
NIEUW="$(mktemp "$MAP/.geheimen.env.nieuw.XXXXXX")"
EIGENAAR="$(stat -c '%u:%g' "$GEHEIMEN")"; MODUS="$(stat -c '%a' "$GEHEIMEN")"
GESLAAGD=0
opruimen() {
  rm -f -- "$NIEUW"
  if [ "$GESLAAGD" -ne 1 ] && [ -s "$BACKUP" ] && ! cmp -s "$BACKUP" "$GEHEIMEN"; then
    if install -o "${EIGENAAR%%:*}" -g "${EIGENAAR##*:}" -m "$MODUS" -- "$BACKUP" "$MAP/.geheimen.env.herstel.$$" && mv -f -- "$MAP/.geheimen.env.herstel.$$" "$GEHEIMEN"; then
      [ "$ZONDER_HERSTART" = "1" ] || systemctl restart "$DIENST" >/dev/null 2>&1 || true
      zeg "Попередній geheimen.env відновлено, сервіс перезапущено." "Vorige geheimen.env teruggezet, dienst herstart." >&2
    else
      rm -f -- "$MAP/.geheimen.env.herstel.$$"
      zeg "НЕ вдалося відновити geheimen.env; резервна копія лишилась: $BACKUP (0600)" "Terugzetten MISLUKT; back-up blijft staan: $BACKUP (0600)" >&2
      return
    fi
  fi
  if [ -f "$BACKUP" ]; then shred -u -- "$BACKUP" 2>/dev/null || rm -f -- "$BACKUP"; fi
}
trap opruimen EXIT
cp -- "$GEHEIMEN" "$BACKUP"; chmod 0600 "$BACKUP"

PATROON='^[[:space:]]*(export[[:space:]]+)?('"$(IFS='|'; echo "${NAMEN[*]}")"')='
SUITE_WEG=0
if [ "$PROVIDER" = google ]; then
  # GOOGLE_SUITE_CLIENT_ID wint in de app van GOOGLE_OAUTH_CLIENT_ID: een ANDERE waarde zou stil winnen → verwijderen (met melding).
  SUITE="$(sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?GOOGLE_SUITE_CLIENT_ID=//p' "$GEHEIMEN" | tail -n 1 | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\r')"
  if [ -n "$SUITE" ] && [ "$SUITE" != "$CLIENT_ID" ]; then SUITE_WEG=1; PATROON='^[[:space:]]*(export[[:space:]]+)?(GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_SUITE_CLIENT_ID)='; fi
  unset SUITE
fi
{ grep -Ev "$PATROON" "$GEHEIMEN" || true; } > "$NIEUW"
[ ! -s "$NIEUW" ] || [ -z "$(tail -c1 "$NIEUW")" ] || printf '\n' >> "$NIEUW"
# printf is een shell-builtin: de waarden komen niet in de argumenten van een proces terecht.
if [ "$PROVIDER" = google ]; then
  printf 'GOOGLE_OAUTH_CLIENT_ID=%s\nGOOGLE_OAUTH_CLIENT_SECRET=%s\n' "$CLIENT_ID" "$CLIENT_SECRET" >> "$NIEUW"
else
  printf 'MICROSOFT_GRAPH_CLIENT_ID=%s\nMICROSOFT_GRAPH_CLIENT_SECRET=%s\nMICROSOFT_GRAPH_TENANT_ID=%s\n' "$CLIENT_ID" "$CLIENT_SECRET" "$TENANT" >> "$NIEUW"
fi
FP_SECRET="$(printf '%s' "$CLIENT_SECRET" | sha256sum | cut -c1-8)"
unset CLIENT_ID CLIENT_SECRET TENANT
chown "$EIGENAAR" "$NIEUW"; chmod "$MODUS" "$NIEUW"
mv -f -- "$NIEUW" "$GEHEIMEN"
{ [ -f "$JOURNAAL" ] || install -m 0600 /dev/null "$JOURNAAL"; printf '%s\t%s\tvervangen\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${NAMEN[1]}" "$FP_SECRET" >> "$JOURNAAL"; } 2>/dev/null || true

[ "$SUITE_WEG" -eq 0 ] || zeg "УВАГА: GOOGLE_SUITE_CLIENT_ID мав ІНШЕ значення і має пріоритет — видалено." "LET OP: GOOGLE_SUITE_CLIENT_ID had een ANDERE waarde en wint — verwijderd." >&2
zeg "${NAMEN[*]} записано (значення не показуються; відбиток секрету $FP_SECRET)." "${NAMEN[*]} geschreven (waarden worden niet getoond; vingerafdruk secret $FP_SECRET)."

# --- herstarten en controleren ---------------------------------------------------------------------------------------------
if [ "$ZONDER_HERSTART" = "1" ]; then GESLAAGD=1; zeg "Тест: без перезапуску." "Test: zonder herstart."; exit 0; fi
systemctl restart "$DIENST" || fout "не вдалося перезапустити $DIENST" "herstart van $DIENST mislukt"
CODE=000
for _ in $(seq 1 30); do
  if systemctl is-active --quiet "$DIENST"; then
    CODE="$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' "$GEZONDHEID_URL" || true)"
    [ "$CODE" = "200" ] && break
  fi
  sleep 1
done
systemctl is-active --quiet "$DIENST" || fout "$DIENST не активний після перезапуску (journalctl -u $DIENST -n 50)" "$DIENST is niet actief na de herstart (journalctl -u $DIENST -n 50)"
[ "$CODE" = "200" ] || fout "сайт відповідає HTTP $CODE замість 200" "site antwoordt HTTP $CODE in plaats van 200"
GESLAAGD=1
zeg "OK: $DIENST активний, /__gezondheid відповідає 200. Резервну копію знищено (shred). Тепер — «Перевірити» в Майстрі підключень." \
    "OK: $DIENST actief, /__gezondheid antwoordt 200. Back-up vernietigd (shred). Nu: «Controleren» in de Koppelwizard."
