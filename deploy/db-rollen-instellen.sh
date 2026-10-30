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
#   db-rollen-instellen.sh rls-groepen   stand per groep van tabellen (migratie 0033) + wat de audit voor die tabellen telde
#   db-rollen-instellen.sh rls-groep <groep> aan|uit
#                                        RLS afdwingen voor ALLEEN die groep (van laag naar hoog risico; zie 0033).
#                                        Weigert 'aan' als app.rls_audit voor die tabellen nog overtredingen heeft,
#                                        tenzij FORCEER=1 (dan wordt dat gemeld). Alleen root; de site kan dit niet.
#   db-rollen-instellen.sh terugdraaien  de drie variabelen uit geheimen.env halen, eigendom terug naar de oude
#                                        rol, FORCE RLS en afdwingen uit, herstart (app en back-up werken weer met
#                                        de oude ene rol; de rollen zelf blijven ongebruikt bestaan)
#   db-rollen-instellen.sh env-splitsen  (audit-fix 4) DATABASE_URL (legacy-eigenaar) en DATABASE_URL_MIGRATIE
#                                        van geheimen.env naar migratie.env (0600 root:root); de app-diensten laden
#                                        alleen geheimen.env, de migratiestap (installeer-app.sh) laadt beide.
#                                        Herstart + gezondheidscontrole; mislukt die → automatisch terug.
#   db-rollen-instellen.sh env-samenvoegen  het omgekeerde (terug naar één bestand)
#   db-rollen-instellen.sh audit-beheerder <e-mail|user-id>      mag app.audit verwijderen (alleen postgres kan dit)
#   db-rollen-instellen.sh audit-beheerder-weg <e-mail|user-id>
# Wachtwoorden: hier gemaakt (openssl), naar Postgres gaat alleen de SCRAM-verifier (scram-verifier.mjs).
# Uitvoer tweetalig (Oekraïens, dan Nederlands). Waarden worden nooit getoond.
set -euo pipefail
umask 077

GEHEIMEN="${GEHEIMEN:-/etc/mijn-ruimte/geheimen.env}"
# Audit-fix 4: migrator- en legacy-URL buiten de app-omgeving (alleen voor migraties/rollenscript).
MIGRATIE_ENV="${MIGRATIE_ENV:-/etc/mijn-ruimte/migratie.env}"
NODE="${NODE:-$(command -v node || echo /usr/bin/node)}"
DIENST="${DIENST:-mijn-ruimte.service}"
PORT="${PORT:-8080}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLEN_SQL="$HIER/db-rollen.sql"
SCRAM_MJS="$HIER/scram-verifier.mjs"
RECHTEN_SQL="$HIER/../migrations/rechten.sql"
TERUG_SQL="$HIER/db-rollen-terug.sql"
# Voor tests overschrijfbaar; standaard psql als postgres via de lokale socket.
PSQL_POSTGRES="${PSQL_POSTGRES:-runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1}"
ZONDER_HERSTART="${ZONDER_HERSTART:-0}"

zeg()  { printf '%s\n  %s\n' "$1" "$2"; }
fout() { printf 'ПОМИЛКА: %s\n  FOUT: %s\n' "$1" "$2" >&2; exit 1; }

vereis_root() { [ "$(id -u)" -eq 0 ] || [ "${ZONDER_ROOT:-0}" = 1 ] || fout "запустіть від root (sudo)" "voer dit uit als root (sudo)"; }
waarde_in() { [ -f "$2" ] || return 0; sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1=//p" "$2" | tail -n 1 | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\r'; }
# Waarde uit migratie.env (als die er is en de variabele bevat), anders uit geheimen.env.
waarde_van() { local w; w="$(waarde_in "$1" "$MIGRATIE_ENV")"; [ -n "$w" ] || w="$(waarde_in "$1" "$GEHEIMEN")"; printf '%s' "$w"; }
# SCRAM-SHA-256-verifier voor een wachtwoord (stdin; printf is een builtin, dus niet zichtbaar in ps).
scram() { printf '%s' "$1" | "$NODE" "$SCRAM_MJS"; }

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

# Bestand herschrijven: regels die op het patroon (namen, regex) passen weg, nieuwe (optioneel) erachter.
# Eigenaar/rechten blijven; een nieuw bestand wordt 0600 root:root.
herschrijf_bestand() {
  local bestand="$1" namen="$2" nieuw eigenaar=0:0 modus=600; shift 2
  if [ -f "$bestand" ]; then eigenaar="$(stat -c '%u:%g' "$bestand")"; modus="$(stat -c '%a' "$bestand")"; fi
  nieuw="$(mktemp "$(dirname "$bestand")/.$(basename "$bestand").nieuw.XXXXXX")" || return 1
  # Ook binnen 'if !' (waar set -e niet werkt) bij elke fout stoppen en het tijdelijke bestand opruimen.
  if [ -f "$bestand" ]; then { grep -Ev "^[[:space:]]*(export[[:space:]]+)?($namen)=" "$bestand" || true; } > "$nieuw" || { rm -f -- "$nieuw"; return 1; }; fi
  [ ! -s "$nieuw" ] || [ -z "$(tail -c1 "$nieuw")" ] || printf '\n' >> "$nieuw"
  if [ "$#" -gt 0 ]; then printf '%s\n' "$@" >> "$nieuw" || { rm -f -- "$nieuw"; return 1; }; fi
  { chown "$eigenaar" "$nieuw" && chmod "$modus" "$nieuw" && mv -f -- "$nieuw" "$bestand"; } || { rm -f -- "$nieuw"; return 1; }
}
# geheimen.env: de drie rol-variabelen weg en (optioneel) nieuwe erachter.
herschrijf_geheimen() { herschrijf_bestand "$GEHEIMEN" 'DATABASE_URL_(MIGRATIE|APP|SYSTEM)' "$@"; }

herstart_en_controleer() {
  [ "$ZONDER_HERSTART" = 1 ] && return 0
  systemctl restart "$DIENST" && gezond
}

instellen() {
  vereis_root; lees_url
  [ -f "$ROLLEN_SQL" ] && [ -f "$RECHTEN_SQL" ] && [ -f "$SCRAM_MJS" ] || fout "не знайдено db-rollen.sql / rechten.sql / scram-verifier.mjs поруч зі скриптом" "db-rollen.sql / rechten.sql / scram-verifier.mjs niet gevonden naast dit script"
  command -v openssl >/dev/null || fout "немає openssl" "openssl ontbreekt"
  [ -x "$NODE" ] || fout "немає node ($NODE)" "node ontbreekt ($NODE)"
  local ww_m ww_a ww_s v_m v_a v_s backup backup_m=""
  ww_m="$(wachtwoord_voor DATABASE_URL_MIGRATIE)"; ww_a="$(wachtwoord_voor DATABASE_URL_APP)"; ww_s="$(wachtwoord_voor DATABASE_URL_SYSTEM)"
  # Audit-fix 10: naar Postgres gaat alleen de SCRAM-verifier (via stdin als psql-variabele).
  v_m="$(scram "$ww_m")" && v_a="$(scram "$ww_a")" && v_s="$(scram "$ww_s")" || fout "SCRAM-верифікатор не створено" "SCRAM-verifier maken mislukt"
  { printf '\\set legacy_rol %s\n\\set migrator_scram %s\n\\set app_scram %s\n\\set systeem_scram %s\n' "$LEGACY_ROL" "$v_m" "$v_a" "$v_s"; cat "$ROLLEN_SQL" "$RECHTEN_SQL"; } \
    | psql_db -f - >/dev/null || fout "налаштування ролей у Postgres не вдалося" "rollen instellen in Postgres mislukt"
  unset v_m v_a v_s
  zeg "Ролі mijnruimte_migrator / mijnruimte_app / mijnruimte_system налаштовано (власник схеми, права, FORCE RLS)." \
      "Rollen mijnruimte_migrator / mijnruimte_app / mijnruimte_system ingesteld (schema-eigenaar, rechten, FORCE RLS)."
  backup="$(mktemp "$(dirname "$GEHEIMEN")/.geheimen.env.backup.XXXXXX")"; cp -p -- "$GEHEIMEN" "$backup"
  local basis="@$DB_HOST:$DB_PORT/$DB_NAAM"
  if [ -f "$MIGRATIE_ENV" ]; then
    # Na env-splitsen: migrator-URL in migratie.env, app/systeem in geheimen.env.
    backup_m="$(mktemp "$(dirname "$MIGRATIE_ENV")/.migratie.env.backup.XXXXXX")"; cp -p -- "$MIGRATIE_ENV" "$backup_m"
    herschrijf_bestand "$MIGRATIE_ENV" 'DATABASE_URL_MIGRATIE' "DATABASE_URL_MIGRATIE=postgres://mijnruimte_migrator:$ww_m$basis"
    herschrijf_geheimen "DATABASE_URL_APP=postgres://mijnruimte_app:$ww_a$basis" "DATABASE_URL_SYSTEM=postgres://mijnruimte_system:$ww_s$basis"
  else
    herschrijf_geheimen "DATABASE_URL_MIGRATIE=postgres://mijnruimte_migrator:$ww_m$basis" "DATABASE_URL_APP=postgres://mijnruimte_app:$ww_a$basis" "DATABASE_URL_SYSTEM=postgres://mijnruimte_system:$ww_s$basis"
  fi
  unset ww_m ww_a ww_s
  if herstart_en_controleer; then
    shred -u -- "$backup" 2>/dev/null || rm -f -- "$backup"
    [ -z "$backup_m" ] || shred -u -- "$backup_m" 2>/dev/null || rm -f -- "$backup_m"
    zeg "OK: DATABASE_URL_MIGRATIE/_APP/_SYSTEM записано, сервіс працює. RLS у режимі аудиту (див. 'status')." \
        "OK: DATABASE_URL_MIGRATIE/_APP/_SYSTEM geschreven, dienst draait. RLS in audit-modus (zie 'status')."
  else
    herschrijf_geheimen
    [ -z "$backup_m" ] || { mv -f -- "$backup_m" "$MIGRATIE_ENV"; }
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

rls_groepen() {
  vereis_root; lees_url
  psql_db -At -c "SELECT 'globaal=' || waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'"
  psql_db -A -F ' | ' -c "SELECT g.volgorde AS nr, g.groep, g.afdwingen, COALESCE((SELECT sum(a.aantal) FROM app.rls_audit a WHERE a.tbl = ANY (g.tabellen)), 0) AS overtredingen, array_to_string(g.tabellen, ',') AS tabellen FROM app.rls_groepen g ORDER BY g.volgorde" \
    || fout "немає таблиці app.rls_groepen (міграцію 0033 виконано?)" "app.rls_groepen ontbreekt (is migratie 0033 uitgevoerd?)"
}

rls_groep_zetten() {
  vereis_root; lees_url
  local groep="${1:-}" stand="${2:-}"
  [[ "$groep" =~ ^[a-z]{3,20}$ ]] || fout "назва групи: лише малі латинські літери (3–20)" "groepsnaam: alleen kleine letters (3–20)"
  [[ "$stand" == aan || "$stand" == uit ]] || fout "стан: aan або uit" "stand: aan of uit"
  local bestaat
  bestaat="$(psql_db -At -c "SELECT count(*) FROM app.rls_groepen WHERE groep = '$groep'")" || fout "немає таблиці app.rls_groepen (міграція 0033?)" "app.rls_groepen ontbreekt (migratie 0033?)"
  [ "$bestaat" = 1 ] || fout "невідома група: $groep (див. rls-groepen)" "onbekende groep: $groep (zie rls-groepen)"
  if [ "$stand" = aan ]; then
    local mis
    mis="$(psql_db -At -c "SELECT COALESCE(sum(a.aantal), 0) FROM app.rls_audit a, app.rls_groepen g WHERE g.groep = '$groep' AND a.tbl = ANY (g.tabellen)")"
    if [ "${mis:-0}" != 0 ]; then
      if [ "${FORCEER:-0}" = 1 ]; then
        zeg "УВАГА: аудит для групи $groep має $mis порушень — вмикаю, бо FORCEER=1." "LET OP: audit voor groep $groep heeft $mis overtredingen — toch aan (FORCEER=1)." >&2
      else
        fout "аудит для групи $groep ще має $mis порушень: спершу виправте маршрути (rls-groepen / status). Примусово: FORCEER=1" \
             "audit voor groep $groep heeft nog $mis overtredingen: eerst de routes oplossen (rls-groepen / status). Forceren: FORCEER=1"
      fi
    fi
  fi
  psql_db -c "UPDATE app.rls_groepen SET afdwingen = '$stand', bijgewerkt = now() WHERE groep = '$groep'" >/dev/null || fout "не вдалося змінити групу" "groep wijzigen mislukt"
  if [ "$stand" = aan ]; then
    zeg "RLS ВВІМКНЕНО для групи $groep (діє одразу). Назад: rls-groep $groep uit" "RLS AFGEDWONGEN voor groep $groep (direct). Terug: rls-groep $groep uit"
  else
    zeg "Група $groep знову в режимі аудиту." "Groep $groep weer in audit-modus."
  fi
}

status() {
  vereis_root; lees_url
  psql_db -At -c "SELECT 'afdwingen=' || waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'"
  psql_db -At -c "SELECT 'rollen=' || string_agg(rolname || CASE WHEN rolbypassrls THEN '(bypassrls)' ELSE '' END, ',' ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'mijnruimte%'"
  psql_db -At -c "SELECT 'force_rls=' || relforcerowsecurity FROM pg_class WHERE oid = 'app.records'::regclass"
  for v in DATABASE_URL DATABASE_URL_MIGRATIE DATABASE_URL_APP DATABASE_URL_SYSTEM AUDIT_IP_PEPPER; do
    local waar=""
    [ -n "$(waarde_in "$v" "$GEHEIMEN")" ] && waar="geheimen.env"
    [ -n "$(waarde_in "$v" "$MIGRATIE_ENV")" ] && waar="${waar:+$waar+}migratie.env"
    echo "$v=${waar:-ontbreekt}"
  done
  psql_db -At -c "SELECT 'audit_beheerders=' || count(*) FROM app.audit_beheerders" 2>/dev/null || echo "audit_beheerders=(migratie 0008 nog niet uitgevoerd)"
  psql_db -At -c "SELECT 'audit_insert_app=' || has_table_privilege('mijnruimte_app', 'app.audit', 'INSERT') || ' audit_insert_system=' || has_table_privilege('mijnruimte_system', 'app.audit', 'INSERT')" 2>/dev/null || true
  echo "--- app.rls_audit (wat RLS zou weigeren; leeg = klaar om af te dwingen) ---"
  psql_db -A -F ' | ' -c "SELECT route, tbl, actie, aantal, to_char(laatst, 'YYYY-MM-DD HH24:MI') AS laatst FROM app.rls_audit ORDER BY laatst DESC LIMIT 50"
}

terugdraaien() {
  vereis_root; lees_url
  [ -f "$TERUG_SQL" ] || fout "не знайдено db-rollen-terug.sql" "db-rollen-terug.sql niet gevonden"
  # Zonder de nieuwe rollen heeft de app DATABASE_URL zelf nodig: eerst terug naar één bestand.
  if [ -n "$(waarde_in DATABASE_URL "$MIGRATIE_ENV")" ]; then ZONDER_HERSTART=1 env_samenvoegen; fi
  herschrijf_geheimen
  { printf '\\set legacy_rol %s\n' "$LEGACY_ROL"; cat "$TERUG_SQL"; } | psql_db -f - >/dev/null \
    || fout "повернення власника/FORCE не вдалося (змінні вже прибрано)" "eigendom/FORCE terugzetten mislukt (variabelen zijn al weg)"
  if herstart_en_controleer; then
    zeg "OK: нові змінні прибрано, застосунок працює зі старою роллю (DATABASE_URL)." "OK: nieuwe variabelen verwijderd, de app werkt weer met de oude rol (DATABASE_URL)."
  else
    fout "сервіс не відповідає після перезапуску" "dienst antwoordt niet na de herstart"
  fi
}

# ---- Audit-fix 4: migrator/legacy-URL uit de app-omgeving ----
env_splitsen() {
  vereis_root
  [ -n "$(waarde_in DATABASE_URL_SYSTEM "$GEHEIMEN")" ] && [ -n "$(waarde_in DATABASE_URL_APP "$GEHEIMEN")" ] \
    || fout "спершу 'instellen': DATABASE_URL_APP/_SYSTEM мають бути в $GEHEIMEN" "eerst 'instellen': DATABASE_URL_APP/_SYSTEM moeten in $GEHEIMEN staan"
  local legacy migr b_g b_m=""
  legacy="$(waarde_in DATABASE_URL "$GEHEIMEN")"; migr="$(waarde_in DATABASE_URL_MIGRATIE "$GEHEIMEN")"
  if [ -z "$legacy" ] && [ -z "$migr" ]; then zeg "Нічого переносити (уже розділено)." "Niets te verplaatsen (al gesplitst)."; return 0; fi
  # Wat al in migratie.env staat (bijv. DATABASE_URL_MIGRATIE na 'instellen') blijft behouden.
  [ -n "$legacy" ] || legacy="$(waarde_in DATABASE_URL "$MIGRATIE_ENV")"
  [ -n "$migr" ] || migr="$(waarde_in DATABASE_URL_MIGRATIE "$MIGRATIE_ENV")"
  b_g="$(mktemp "$(dirname "$GEHEIMEN")/.geheimen.env.backup.XXXXXX")"; cp -p -- "$GEHEIMEN" "$b_g"
  if [ -f "$MIGRATIE_ENV" ]; then b_m="$(mktemp "$(dirname "$MIGRATIE_ENV")/.migratie.env.backup.XXXXXX")"; cp -p -- "$MIGRATIE_ENV" "$b_m"; fi
  local regels=()
  [ -z "$legacy" ] || regels+=("DATABASE_URL=$legacy")
  [ -z "$migr" ] || regels+=("DATABASE_URL_MIGRATIE=$migr")
  # Elke stap gecontroleerd: mislukt er één, dan beide bestanden terug zoals ze waren.
  if ! { herschrijf_bestand "$MIGRATIE_ENV" 'DATABASE_URL|DATABASE_URL_MIGRATIE' "${regels[@]}" \
         && { [ "${ZONDER_ROOT:-0}" = 1 ] || chown root:root "$MIGRATIE_ENV"; } && chmod 0600 "$MIGRATIE_ENV" \
         && herschrijf_bestand "$GEHEIMEN" 'DATABASE_URL|DATABASE_URL_MIGRATIE'; }; then
    mv -f -- "$b_g" "$GEHEIMEN"; if [ -n "$b_m" ]; then mv -f -- "$b_m" "$MIGRATIE_ENV"; else rm -f -- "$MIGRATIE_ENV"; fi
    fout "не вдалося переписати файли; повернено як було" "bestanden herschrijven mislukt; teruggezet zoals het was"
  fi
  unset legacy migr regels
  if herstart_en_controleer; then
    shred -u -- "$b_g" 2>/dev/null || rm -f -- "$b_g"; [ -z "$b_m" ] || shred -u -- "$b_m" 2>/dev/null || rm -f -- "$b_m"
    zeg "OK: DATABASE_URL і DATABASE_URL_MIGRATIE тепер лише в $MIGRATIE_ENV; сервіс працює без них." \
        "OK: DATABASE_URL en DATABASE_URL_MIGRATIE staan nu alleen in $MIGRATIE_ENV; de dienst draait zonder."
  else
    mv -f -- "$b_g" "$GEHEIMEN"; if [ -n "$b_m" ]; then mv -f -- "$b_m" "$MIGRATIE_ENV"; else rm -f -- "$MIGRATIE_ENV"; fi
    systemctl restart "$DIENST" || true
    fout "сервіс не запустився без DATABASE_URL; повернено як було (journalctl -u $DIENST -n 50)" \
         "dienst start niet zonder DATABASE_URL; teruggezet zoals het was (journalctl -u $DIENST -n 50)"
  fi
}
env_samenvoegen() {
  vereis_root
  [ -f "$MIGRATIE_ENV" ] || { zeg "migratie.env відсутній — нічого робити." "migratie.env ontbreekt — niets te doen."; return 0; }
  local legacy migr regels=()
  legacy="$(waarde_in DATABASE_URL "$MIGRATIE_ENV")"; migr="$(waarde_in DATABASE_URL_MIGRATIE "$MIGRATIE_ENV")"
  [ -z "$legacy" ] || regels+=("DATABASE_URL=$legacy")
  [ -z "$migr" ] || regels+=("DATABASE_URL_MIGRATIE=$migr")
  [ "${#regels[@]}" -eq 0 ] || herschrijf_bestand "$GEHEIMEN" 'DATABASE_URL|DATABASE_URL_MIGRATIE' "${regels[@]}"
  herschrijf_bestand "$MIGRATIE_ENV" 'DATABASE_URL|DATABASE_URL_MIGRATIE'
  [ -s "$MIGRATIE_ENV" ] || rm -f -- "$MIGRATIE_ENV"
  unset legacy migr regels
  herstart_en_controleer || fout "сервіс не відповідає після перезапуску" "dienst antwoordt niet na de herstart"
  zeg "OK: змінні знову в $GEHEIMEN." "OK: variabelen staan weer in $GEHEIMEN."
}
# Wie mag app.audit verwijderen (app.audit_beheerders; alleen postgres/migrator kan schrijven).
audit_beheerder() {
  vereis_root; lees_url
  local wie="${2:-}" id
  [ -n "$wie" ] || fout "вкажіть e-mail або user-id" "geef een e-mailadres of user-id op"
  [[ "$wie" =~ ^[A-Za-z0-9_.@+-]{1,200}$ ]] || fout "неочікуваний формат" "onverwacht formaat"
  if [[ "$wie" == *@* ]]; then
    id="$(psql_db -At -c "SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = lower('$wie') LIMIT 2")"
    [ "$(printf '%s\n' "$id" | grep -c .)" = 1 ] || fout "акаунт не знайдено (або їх кілька)" "account niet (of meer dan één keer) gevonden"
  else id="$wie"; fi
  if [ "$1" = toevoegen ]; then
    psql_db -c "INSERT INTO app.audit_beheerders (user_id, notitie) VALUES ('$id', 'db-rollen-instellen.sh') ON CONFLICT (user_id) DO NOTHING" >/dev/null \
      || fout "не вдалося (міграцію 0008 виконано?)" "mislukt (is migratie 0008 uitgevoerd?)"
    zeg "OK: акаунт може видаляти журнал аудиту (лише з причиною; дія записується)." "OK: account mag de audit-log opschonen (alleen met reden; wordt zelf gelogd)."
  else
    psql_db -c "DELETE FROM app.audit_beheerders WHERE user_id = '$id'" >/dev/null || fout "не вдалося" "mislukt"
    zeg "OK: право видалення аудиту знято." "OK: recht om audit te verwijderen ingetrokken."
  fi
}

# 0066 «Захист» (/diagnostiek): de site start mijn-ruimte-db-rollen.service (polkit: alleen «start» van die vaste naam) als
# DATABASE_URL_APP ontbreekt. Dan: instellen (met gezondheidscontrole en terugdraaien), anders niets. Uitkomst zonder waarden in
# $STATUS_DIR/db-rollen.json (root:mijnruimte 0640), die de kaart «RLS» toont.
STATUS_DIR="${STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
resultaat_schrijven() { # resultaat_schrijven true|false CODE
  mkdir -p "$STATUS_DIR" 2>/dev/null || return 0
  local tmp; tmp="$(mktemp "$STATUS_DIR/.db-rollen.XXXXXX")" || return 0
  printf '{"tijd":"%s","ok":%s,"code":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" > "$tmp"
  chgrp "${GROEP:-mijnruimte}" "$tmp" 2>/dev/null || true; chmod 0640 "$tmp"; mv -f -- "$tmp" "$STATUS_DIR/db-rollen.json"
}
instellen_als_nodig() {
  vereis_root
  if [ -n "$(waarde_in DATABASE_URL_APP "$GEHEIMEN")" ]; then
    zeg "DATABASE_URL_APP вже задано — нічого не змінено." "DATABASE_URL_APP is al gezet — niets gewijzigd."
    resultaat_schrijven true AL_INGESTELD; return 0
  fi
  # Eigen proces (niet in een if-subshell: daar werkt set -e niet).
  if "$BASH" "${BASH_SOURCE[0]}" instellen; then resultaat_schrijven true INGESTELD; else resultaat_schrijven false MISLUKT_TERUGGEZET; return 1; fi
}

case "${1:-}" in
  instellen) instellen ;;
  instellen-als-nodig) instellen_als_nodig ;;
  status) status ;;
  rls-aan) rls_zetten aan ;;
  rls-uit) rls_zetten uit ;;
  rls-groepen) rls_groepen ;;
  rls-groep) rls_groep_zetten "${2:-}" "${3:-}" ;;
  terugdraaien) terugdraaien ;;
  env-splitsen) env_splitsen ;;
  env-samenvoegen) env_samenvoegen ;;
  audit-beheerder) audit_beheerder toevoegen "${2:-}" ;;
  audit-beheerder-weg) audit_beheerder weg "${2:-}" ;;
  *) sed -n '2,31p' "$0"; exit 2 ;;
esac
