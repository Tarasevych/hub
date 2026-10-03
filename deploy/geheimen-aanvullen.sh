#!/usr/bin/env bash
# geheimen-aanvullen.sh — vult /etc/mijn-ruimte/geheimen.env aan met de verplichte sleutels die nog
# ontbreken (of leeg zijn). Bestaande waarden worden NOOIT overschreven (dat zou versleutelde data
# onleesbaar maken). Waarden worden op de VM gegenereerd (openssl rand) en nooit getoond: alleen de
# naam en de lengte worden gemeld. De waarden komen niet in de argumenten van een proces terecht
# (printf is een shell-builtin).
#
# Gebruik (als root):  geheimen-aanvullen.sh [--eigenaar <e-mailadres>] [bestand]
set -euo pipefail
umask 077

EIGENAAR=""
if [ "${1:-}" = "--eigenaar" ]; then EIGENAAR="${2:?e-mailadres ontbreekt}"; shift 2; fi
BESTAND="${1:-/etc/mijn-ruimte/geheimen.env}"

[ "$(id -u)" -eq 0 ] || { echo "[geheimen] voer dit uit als root" >&2; exit 1; }
command -v openssl >/dev/null || { echo "[geheimen] openssl ontbreekt" >&2; exit 1; }
[ -f "$BESTAND" ] || { install -m 0600 -o root -g root /dev/null "$BESTAND"; echo "[geheimen] $BESTAND aangemaakt (0600 root:root)"; }

heeft_waarde() { grep -Eq "^$1=.+" "$BESTAND"; }
lege_regel_weg() { sed -i -E "/^$1=[[:space:]]*$/d" "$BESTAND"; }
# Zorg dat het bestand op een regeleinde eindigt voordat er iets wordt toegevoegd.
[ ! -s "$BESTAND" ] || [ -z "$(tail -c1 "$BESTAND")" ] || printf '\n' >> "$BESTAND"

toevoegen() {
  local naam="$1" waarde="$2"
  if heeft_waarde "$naam"; then echo "[geheimen] $naam bestaat al (ongewijzigd)"; return; fi
  lege_regel_weg "$naam"
  printf '%s=%s\n' "$naam" "$waarde" >> "$BESTAND"
  echo "[geheimen] $naam toegevoegd (${#waarde} tekens)"
}

# 32 willekeurige bytes, base64 (AES-256-sleutels: TOTP, Google-grants, kluis, mailtokens).
for naam in TOTP_ENCRYPTION_KEY_V1 GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 OWNER_VAULT_ENCRYPTION_KEY_V1 MAIL_TOKEN_ENCRYPTION_KEY_V1; do
  if heeft_waarde "$naam"; then echo "[geheimen] $naam bestaat al (ongewijzigd)"; continue; fi
  toevoegen "$naam" "$(openssl rand -base64 32)"
done
# Pepper voor herstelcodes: 48 bytes → 64 tekens (minimaal 32 vereist).
if heeft_waarde RECOVERY_CODE_PEPPER; then echo "[geheimen] RECOVERY_CODE_PEPPER bestaat al (ongewijzigd)"; else toevoegen RECOVERY_CODE_PEPPER "$(openssl rand -base64 48 | tr -d '\n')"; fi

if [ -n "$EIGENAAR" ]; then
  if heeft_waarde OWNER_EMAIL; then
    grep -qx "OWNER_EMAIL=$EIGENAAR" "$BESTAND" && echo "[geheimen] OWNER_EMAIL al ingesteld" || echo "[geheimen] LET OP: OWNER_EMAIL heeft al een andere waarde (ongewijzigd)" >&2
  else
    toevoegen OWNER_EMAIL "$EIGENAAR"
  fi
fi

chown root:root "$BESTAND"; chmod 0600 "$BESTAND"
echo "[geheimen] aanwezig: $(grep -Eo '^[A-Z0-9_]+=' "$BESTAND" | tr -d '=' | sort | tr '\n' ' ')"
