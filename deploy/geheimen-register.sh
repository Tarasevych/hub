#!/usr/bin/env bash
# geheimen-register.sh — maakt het REGISTER van de geheimen van deze installatie: naam, doel, waar het staat, vingerafdruk
# (SHA-256, eerste 8 hex), datum van aanmaak/rotatie en wie roteert. ZONDER één enkele waarde. Dit is het bestand dat de
# eigenaar bewaart naast zijn wachtwoordmanager (sjabloon: deploy/GEHEIMEN-REGISTER.md).
#
# Gebruik (als root):  geheimen-register.sh [--uit <pad>] [--env <bestand>] [--journaal <bestand>]
#   zonder --uit: naar stdout;  --uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md schrijft het bestand (0600).
#   Een ander env-bestand mag ook zonder root (tests, proefdraaien).
# De datum komt uit geheimen.journaal (geschreven door geheimen-aanmaken.sh / oauth-client-zetten.sh); staat een naam daar
# niet in, dan geldt de wijzigingsdatum van geheimen.env en staat er «(bestand)» bij.
set -euo pipefail
umask 077

UIT=""; ENV_BESTAND=/etc/mijn-ruimte/geheimen.env; JOURNAAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --uit) UIT="${2:?pad ontbreekt}"; shift 2 ;;
    --env) ENV_BESTAND="${2:?bestand ontbreekt}"; shift 2 ;;
    --journaal) JOURNAAL="${2:?bestand ontbreekt}"; shift 2 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    *) echo "[register] onbekende optie: $1" >&2; exit 2 ;;
  esac
done
JOURNAAL="${JOURNAAL:-$(dirname "$ENV_BESTAND")/geheimen.journaal}"
[ -r "$ENV_BESTAND" ] || { echo "[register] $ENV_BESTAND niet leesbaar (root nodig?)" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "[register] sha256sum ontbreekt" >&2; exit 1; }

# Doel per naam (uk | nl), waar het leeft, wie roteert. Onbekende namen krijgen «—» — nooit verzonnen.
doel() {
  case "$1" in
    DATABASE_URL|DATABASE_URL_APP|DATABASE_URL_SYSTEM|DATABASE_URL_MIGRATIE) echo "Підключення до PostgreSQL (містить пароль ролі) / Postgres-verbinding (met rolwachtwoord)@@db-rollen-instellen.sh / ALTER ROLE" ;;
    OWNER_EMAIL) echo "E-mail власника (не секрет, але визначає super-admin) / E-mail van de eigenaar (geen geheim, bepaalt super-admin)@@з рук / handmatig" ;;
    AUDIT_IP_PEPPER) echo "Pepper для хешу IP у журналі аудиту / Pepper voor de IP-hash in het auditlogboek@@mijn-ruimte-installeer geheimen (нова = старі хеші непорівнянні)" ;;
    RECOVERY_CODE_PEPPER) echo "Pepper для кодів відновлення / Pepper voor herstelcodes@@НЕ ротувати без нових кодів для всіх / niet roteren zonder nieuwe codes" ;;
    TOTP_ENCRYPTION_KEY_V1) echo "AES-256 ключ секретів TOTP (і резерв для GitHub/агентів/архіву) / AES-256-sleutel voor TOTP-geheimen (en terugval)@@НЕ ротувати (втрата TOTP усіх) / niet roteren" ;;
    GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1) echo "AES-256 ключ Google-токенів (refresh) / AES-256-sleutel voor Google-tokens@@НЕ ротувати (перепідключення Google) / niet roteren" ;;
    OWNER_VAULT_ENCRYPTION_KEY_V1) echo "AES-256 ключ сховища секретів власника / AES-256-sleutel van de geheimenkluis@@НЕ ротувати (сховище нечитабельне) / niet roteren" ;;
    MAIL_TOKEN_ENCRYPTION_KEY_V1) echo "AES-256 ключ токенів поштових провайдерів / AES-256-sleutel voor mailprovider-tokens@@НЕ ротувати / niet roteren" ;;
    SLEUTELKLUIS_SLEUTEL_V1) echo "Pepper обгорток ключа даних для підключень ШІ / pepper voor de DEK-omslagen van AI-verbindingen@@НЕ ротувати й не видаляти (підключення ШІ треба буде перепідключити) / niet roteren of verwijderen" ;;
    MAIL_APP_WACHTWOORD_SLEUTEL_V1) echo "AES-256 ключ паролів застосунку IMAP/SMTP / AES-256-sleutel voor IMAP/SMTP-app-wachtwoorden@@НЕ ротувати (перепідключення пошти) / niet roteren" ;;
    AGENDA_ABONNEMENT_SLEUTEL_V1) echo "AES-256 ключ паролів CalDAV / AES-256-sleutel voor CalDAV-wachtwoorden@@НЕ ротувати / niet roteren" ;;
    GITHUB_KOPPELING_SLEUTEL_V1) echo "AES-256 ключ токенів GitHub-підключення / AES-256-sleutel voor GitHub-koppelingstokens@@НЕ ротувати / niet roteren" ;;
    AGENT_SLEUTEL_V1) echo "AES-256 ключ токенів ШІ-агентів / AES-256-sleutel voor AI-agenttokens@@НЕ ротувати / niet roteren" ;;
    AI_ARCHIEF_SLEUTEL_V1) echo "AES-256 ключ архіву діагностики браузера / AES-256-sleutel voor het browserdiagnose-archief@@може / mag" ;;
    GOOGLE_OAUTH_CLIENT_ID|GOOGLE_SUITE_CLIENT_ID) echo "Google OAuth Client ID (публічний) / Google OAuth Client ID (publiek)@@Google Cloud Console → Credentials" ;;
    GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_SUITE_CLIENT_SECRET) echo "Google OAuth client secret / Google OAuth client secret@@Google Cloud Console → Credentials → Reset secret; потім mijn-ruimte-installeer oauth-client google" ;;
    MICROSOFT_GRAPH_CLIENT_ID) echo "Microsoft Entra Application (client) ID (публічний) / (publiek)@@Entra → App registrations" ;;
    MICROSOFT_GRAPH_CLIENT_SECRET) echo "Microsoft Entra client secret (термін ≤ 24 міс.) / client secret (max. 24 maanden)@@Entra → Certificates & secrets; потім mijn-ruimte-installeer oauth-client microsoft" ;;
    MICROSOFT_GRAPH_TENANT_ID) echo "Орендар Microsoft (common або Directory ID) / Microsoft-tenant@@Entra" ;;
    MICROSOFT_GRAPH_WEBHOOK_URL) echo "Адреса вебхука Graph (не секрет) / Webhook-adres (geen geheim)@@—" ;;
    MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE) echo "Спільний секрет вебхука Graph / Gedeeld webhookgeheim Graph@@mijn-ruimte-installeer geheimen (після ротації — нова підписка)" ;;
    GOOGLE_GMAIL_PUBSUB_TOPIC|GOOGLE_GMAIL_PUBSUB_AUDIENCE|GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL) echo "Gmail push (Pub/Sub), не секрет / Gmail push (Pub/Sub), geen geheim@@Google Cloud → Pub/Sub" ;;
    SCIM_BEARER_TOKEN) echo "Вхідний SCIM-токен / Inkomend SCIM-token@@openssl rand -base64 48 + у каталозі" ;;
    SIEM_*) echo "Налаштування SIEM / SIEM-instelling@@deploy/SIEM.md" ;;
    *) echo "— / —@@—" ;;
  esac
}
waar() {
  case "$1" in
    DATABASE_URL|DATABASE_URL_MIGRATIE) echo "/etc/mijn-ruimte/migratie.env (після env-splitsen) / geheimen.env" ;;
    *) echo "$ENV_BESTAND" ;;
  esac
}
is_geheim() { # publieke namen krijgen geen vingerafdruk-nadruk, wel een regel
  case "$1" in OWNER_EMAIL|*_CLIENT_ID|MICROSOFT_GRAPH_TENANT_ID|MICROSOFT_GRAPH_WEBHOOK_URL|GOOGLE_GMAIL_PUBSUB_*|HOST|PORT|*_DIR|NODE_ENV) return 1 ;; *) return 0 ;; esac
}
datum_van() {
  local naam="$1" regel
  if [ -r "$JOURNAAL" ]; then
    regel="$(awk -F'\t' -v n="$naam" '$2==n{d=$1} END{print d}' "$JOURNAAL")"
    [ -z "$regel" ] || { echo "$regel"; return; }
  fi
  echo "$(date -u -r "$ENV_BESTAND" +%Y-%m-%d) (bestand)"
}
uitvoer() {
  local naam fp d rest doelen
  echo "# Реєстр секретів / Geheimenregister — $(hostname -f 2>/dev/null || hostname)"
  echo
  echo "Згенеровано / gegenereerd: $(date -u +%Y-%m-%dT%H:%M:%SZ) · файл / bestand: $ENV_BESTAND · значень тут НЕМАЄ / GEEN waarden."
  echo "Відбиток = SHA-256 значення, перші 8 hex / vingerafdruk = SHA-256 van de waarde, eerste 8 hex. Ротація: див. колонку / zie kolom."
  echo
  echo "| Назва / Naam / Призначення / Doel / Де / Waar / Відбиток / Vingerafdruk / Дата / Datum / Хто ротує / Wie roteert @@"
  echo "|---|---|---|---|---|---@@"
  while IFS= read -r naam; do
    [ -n "$naam" ] || continue
    fp="$(sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$naam=//p" "$ENV_BESTAND" | tail -n 1 | tr -d '\r' | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\n' | sha256sum | cut -c1-8)"
    if [ "$fp" = "e3b0c442" ]; then fp="(порожнє / leeg)"; fi
    rest="$(doel "$naam")"; doelen="${rest%%@@*}"; rest="${rest#*@@}"
    d="$(datum_van "$naam")"
    if is_geheim "$naam"; then printf '| `%s` | %s | %s | `%s` | %s | %s |\n' "$naam" "$doelen" "$(waar "$naam")" "$fp" "$d" "$rest"
    else printf '| `%s` | %s | %s | %s (публічне / publiek) | %s | %s |\n' "$naam" "$doelen" "$(waar "$naam")" "$fp" "$d" "$rest"; fi
  done < <(grep -Eo '^[[:space:]]*(export[[:space:]]+)?[A-Z][A-Z0-9_]+=' "$ENV_BESTAND" | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=$//' | awk '!gezien[$0]++')
  echo
  echo "## Сховище секретів власника / Geheimenkluis van de eigenaar"
  echo "Записи сховища (GitHub OAuth, GitHub App, Google-клієнт, Telegram, Anthropic…) мають власний перелік у Адміністрування → «Секрети й ключі» (лише назви, дати, терміни). / De kluisitems staan in Beheer → «Geheimen en sleutels» (alleen namen, datums, termijnen)."
  echo
  echo "## Де лежить резервна копія / Waar de back-up ligt"
  echo "- geheimen.env + migratie.env: у зашифрованій резервній копії (deploy/HERSTEL.md), окремо від копії бази. / in de versleutelde geheimen-back-up, los van de databaseback-up."
  echo "- Цей реєстр: у менеджері паролів власника поруч із самими значеннями. / Dit register: in de wachtwoordmanager van de eigenaar, naast de waarden zelf."
}
if [ -n "$UIT" ]; then
  tmp="$(mktemp "$(dirname "$UIT")/.register.XXXXXX")"
  uitvoer > "$tmp"; chmod 0600 "$tmp"; mv -f -- "$tmp" "$UIT"
  echo "[register] geschreven: $UIT ($(grep -c '^@@ `' "$UIT") regels, geen waarden)"
else
  uitvoer
fi
