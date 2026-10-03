#!/usr/bin/env bash
# db-rollen-instellen.sh — drie databaserollen + RLS-schakelaar voor Mijn Ruimte (beveiliging fase 2).
# Als root op de VM, vanuit een release- of bronmap (gebruikt deploy/db-rollen.sql en migrations/rechten.sql
# naast dit script):
#   db-rollen-instellen.sh instellen     rollen mijnruimte_migrator/_app/_system maken of bijwerken, eigendom
#                                        en rechten zetten, DATABASE_URL_MIGRATIE/_APP/_SYSTEM in geheimen.env
#                                        (wachtwoorden hier gemaakt, nooit getoond; bestaande worden hergebruikt),
#                                        dienst herstarten + gezondheidscontrole; mislukt die → variabelen weer weg
#   db-rollen-instellen.sh status        RLS-stand + samenvatting van app.rls_audit (geen id's of inhoud)
#   db-rollen-instellen.sh rls-aan       RLS afdwingen (alleen voor mijnruimte_app)
#   db-rollen-instellen.sh rls-uit       terug naar audit-modus
#   db-rollen-instellen.sh terugdraaien  de drie variabelen uit geheimen.env halen, eigendom terug naar de oude
#                                        rol, FORCE RLS en afdwingen uit, herstart (app en back-up werken weer met
#                                        de oude ene rol; de rollen zelf blijven ongebruikt bestaan)
# Uitvoer tweetalig (Oekraïens, dan Nederlands). Waarden worden nooit getoond.
set -euo pipefail
umask 077

GEHEIMEN="${GEHEIMEN:-/etc/mijn-ruimte/geheimen.env}"
DIENST="${DIENST:-mijn-ruimte.service}"
PORT="${PORT:-8080}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLEN_SQL="$HIER/db-rollen.sql"
RECHTEN_SQL="$HIER/../migrations/rechten.sql"
TERUG_SQL="$HIER/db-rollen-terug.sql"
# Voor tests overschrijfbaar; standaard psql als postgres via de lokale socket.
PSQL_POSTGRES="${PSQL_POSTGRES:-runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1}"
ZONDER_HERSTART="${ZONDER_HERSTART:-0}"

zeg()  { printf '%s\n  %s\n' "$1" "$2"; }
fout() { printf 'ПОМИЛКА: %s\n  FOUT: %s\n' "$1" "$2" >&2; exit 1; }

vereis_root() { [ "$(id -u)" -eq 0 ] || [ "${ZONDER_ROOT:-0}" = 1 ] || fout "запустіть від root (sudo)" "voer dit uit als root (sudo)"; }
waarde_van() { sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1=//p" "$GEHEIMEN" | tail -n 1 | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\r'; }

# Onderdelen van DATABASE_URL (postgres://rol:ww@host:poort/db).
lees_url() {
  URL="$(waarde_van DATABASE_URL)"
  [ -n "$URL" ] || fout "DATABASE_URL відсутній у $GEHEIMEN" "DATABASE_URL ontbreekt in $GEHEIMEN"
  [[ "$URL" =~ ^postgres(ql)?://([^:@/]+)(:[^@]*)?@([^:/?]+)(:([0-9]+))?/([^?]+) ]] \
    || fout "DATABASE_URL має неочікуваний формат" "DATABASE_URL heeft een onverwacht formaat"
  LEGACY_ROL="${BASH_REMATCH[2]}"; DB_HOST="${BASH_REMATCH[4]}"; DB_PORT="${BASH_REMATCH[6]:-5432}"; DB_NAAM="${BASH_REMATCH[7]}"
  [[ "$DB_NAAM" =~ ^[A-Za-z0-9_]+$ ]] || fout "назва бази даних має неочікуваний формат" "databasenaam heeft een onverwacht formaat"
}
# Wachtwoord uit een bestaande URL-variabele hergebruiken (idempotent), anders een nieuw maken.
wachtwoord_voor() {
  local bestaand; bestaand="$(waarde_van "$1")"
  if [[ "$bestaand" =~ ^postgres(ql)?://[^:@/]+:([0-9a-f]{64})@ ]]; then printf '%s' "${BASH_REMATCH[2]}"; else openssl rand -hex 32; fi
}
psql_db() { $PSQL_POSTGRES -d "$DB_NAAM" "$@"; }

gezond() {
  local i code
  for i in $(seq 1 30); do
    if systemctl is-active --quiet "$DIENST"; then
      code="$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' -H 'Host: hub.tarasevych.com' "http://127.0.0.1:$PORT/" || true)"
      if [ "$code" = 200 ] && curl -fsS --max-time 3 "http://127.0.0.1:$PORT/__gezondheid" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    fi
    sleep 1
  done
  return 1
}

# geheimen.env herschrijven: regels voor de drie variabelen weg, nieuwe (optioneel) erachter. Eigenaar/rechten blijven.
herschrijf_geheimen() {
  local nieuw eigenaar modus
  eigenaar="$(stat -c '%u:%g' "$GEHEIMEN")"; modus="$(stat -c '%a' "$GEHEIMEN")"
  nieuw="$(mktemp "$(dirname "$GEHEIMEN")/.geheimen.env.nieuw.XXXXXX")"
  { grep -Ev '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL_(MIGRATIE|APP|SYSTEM)=' "$GEHEIMEN" || true; } > "$nieuw"
  [ ! -s "$nieuw" ] || [ -z "$(tail -c1 "$nieuw")" ] || printf '\n' >> "$nieuw"
  if [ "$#" -gt 0 ]; then printf '%s\n' "$@" >> "$nieuw"; fi
  chown "$eigenaar" "$nieuw"; chmod "$modus" "$nieuw"
  mv -f -- "$nieuw" "$GEHEIMEN"
}

herstart_en_controleer() {
  [ "$ZONDER_HERSTART" = 1 ] && return 0
  systemctl restart "$DIENST" && gezond
}

instellen() {
  vereis_root; lees_url
  [ -f "$ROLLEN_SQL" ] && [ -f "$RECHTEN_SQL" ] || fout "не знайдено db-rollen.sql / rechten.sql поруч зі скриптом" "db-rollen.sql / rechten.sql niet gevonden naast dit script"
  command -v openssl >/dev/null || fout "немає openssl" "openssl ontbreekt"
  local ww_m ww_a ww_s backup
  ww_m="$(wachtwoord_voor DATABASE_URL_MIGRATIE)"; ww_a="$(wachtwoord_voor DATABASE_URL_APP)"; ww_s="$(wachtwoord_voor DATABASE_URL_SYSTEM)"
  # Wachtwoorden alleen via stdin (psql-variabelen); printf is een shell-builtin.
  { printf '\\set legacy_rol %s\n\\set migrator_ww %s\n\\set app_ww %s\n\\set systeem_ww %s\n' "$LEGACY_ROL" "$ww_m" "$ww_a" "$ww_s"; cat "$ROLLEN_SQL" "$RECHTEN_SQL"; } \
    | psql_db -f - >/dev/null || fout "налаштування ролей у Postgres не вдалося" "rollen instellen in Postgres mislukt"
  zeg "Ролі mijnruimte_migrator / mijnruimte_app / mijnruimte_system налаштовано (власник схеми, права, FORCE RLS)." \
      "Rollen mijnruimte_migrator / mijnruimte_app / mijnruimte_system ingesteld (schema-eigenaar, rechten, FORCE RLS)."
  backup="$(mktemp "$(dirname "$GEHEIMEN")/.geheimen.env.backup.XXXXXX")"; cp -p -- "$GEHEIMEN" "$backup"
  local basis="@$DB_HOST:$DB_PORT/$DB_NAAM"
  herschrijf_geheimen "DATABASE_URL_MIGRATIE=postgres://mijnruimte_migrator:$ww_m$basis" "DATABASE_URL_APP=postgres://mijnruimte_app:$ww_a$basis" "DATABASE_URL_SYSTEM=postgres://mijnruimte_system:$ww_s$basis"
  unset ww_m ww_a ww_s
  if herstart_en_controleer; then
    shred -u -- "$backup" 2>/dev/null || rm -f -- "$backup"
    zeg "OK: DATABASE_URL_MIGRATIE/_APP/_SYSTEM записано, сервіс працює. RLS у режимі аудиту (див. 'status')." \
        "OK: DATABASE_URL_MIGRATIE/_APP/_SYSTEM geschreven, dienst draait. RLS in audit-modus (zie 'status')."
  else
    herschrijf_geheimen
    shred -u -- "$backup" 2>/dev/null || rm -f -- "$backup"
    { printf '\\set legacy_rol %s\n' "$LEGACY_ROL"; cat "$TERUG_SQL"; } | psql_db -f - >/dev/null || true
    systemctl restart "$DIENST" || true
    fout "сервіс не запустився з новими ролями; змінні прибрано, працює стара роль (journalctl -u $DIENST -n 50)" \
         "dienst start niet met de nieuwe rollen; variabelen weer weg, de oude rol werkt (journalctl -u $DIENST -n 50)"
  fi
}

rls_zetten() {
  vereis_root; lees_url
  psql_db -c "UPDATE app.rls_instellingen SET waarde = '$1', bijgewerkt = now() WHERE sleutel = 'afdwingen'" >/dev/null \
    || fout "не вдалося змінити режим RLS" "RLS-stand wijzigen mislukt"
  if [ "$1" = aan ]; then
    zeg "RLS ВВІМКНЕНО для mijnruimte_app (діє одразу, без перезапуску). Назад: rls-uit" "RLS AFGEDWONGEN voor mijnruimte_app (direct, zonder herstart). Terug: rls-uit"
    [ -n "$(waarde_van DATABASE_URL_APP)" ] || zeg "УВАГА: DATABASE_URL_APP не задано — застосунок ще не використовує роль mijnruimte_app." "LET OP: DATABASE_URL_APP ontbreekt — de app gebruikt mijnruimte_app nog niet." >&2
  else
    zeg "RLS у режимі аудиту (політики пропускають усе, застосунок рахує порушення)." "RLS in audit-modus (policy's laten alles door, de app telt overtredingen)."
  fi
}

status() {
  vereis_root; lees_url
  psql_db -At -c "SELECT 'afdwingen=' || waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'"
  psql_db -At -c "SELECT 'rollen=' || string_agg(rolname || CASE WHEN rolbypassrls THEN '(bypassrls)' ELSE '' END, ',' ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'mijnruimte%'"
  psql_db -At -c "SELECT 'force_rls=' || relforcerowsecurity FROM pg_class WHERE oid = 'app.records'::regclass"
  for v in DATABASE_URL_MIGRATIE DATABASE_URL_APP DATABASE_URL_SYSTEM; do
    if [ -n "$(waarde_van "$v")" ]; then echo "$v=gezet"; else echo "$v=ontbreekt"; fi
  done
  echo "--- app.rls_audit (wat RLS zou weigeren; leeg = klaar om af te dwingen) ---"
  psql_db -A -F ' | ' -c "SELECT route, tbl, actie, aantal, to_char(laatst, 'YYYY-MM-DD HH24:MI') AS laatst FROM app.rls_audit ORDER BY laatst DESC LIMIT 50"
}

terugdraaien() {
  vereis_root; lees_url
  [ -f "$TERUG_SQL" ] || fout "не знайдено db-rollen-terug.sql" "db-rollen-terug.sql niet gevonden"
  herschrijf_geheimen
  { printf '\\set legacy_rol %s\n' "$LEGACY_ROL"; cat "$TERUG_SQL"; } | psql_db -f - >/dev/null \
    || fout "повернення власника/FORCE не вдалося (змінні вже прибрано)" "eigendom/FORCE terugzetten mislukt (variabelen zijn al weg)"
  if herstart_en_controleer; then
    zeg "OK: нові змінні прибрано, застосунок працює зі старою роллю (DATABASE_URL)." "OK: nieuwe variabelen verwijderd, de app werkt weer met de oude rol (DATABASE_URL)."
  else
    fout "сервіс не відповідає після перезапуску" "dienst antwoordt niet na de herstart"
  fi
}

case "${1:-}" in
  instellen) instellen ;;
  status) status ;;
  rls-aan) rls_zetten aan ;;
  rls-uit) rls_zetten uit ;;
  terugdraaien) terugdraaien ;;
  *) sed -n '2,15p' "$0"; exit 2 ;;
esac
