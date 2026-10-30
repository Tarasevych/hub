#!/usr/bin/env bash
# geheimen-aanmaken.sh — maakt de ONTBREKENDE server-geheimen van Mijn Ruimte aan in /etc/mijn-ruimte/geheimen.env.
#
# Regels (dezelfde als vroeger geheimen-aanvullen.sh, nu één script voor alle sleutels):
#   - bestaande waarden worden NOOIT overschreven (dat zou versleutelde gegevens onleesbaar maken);
#   - waarden ontstaan op de server zelf (openssl rand) en verlaten hem niet: dit script toont alleen de NAAM en de
#     VINGERAFDRUK (eerste 8 hex-tekens van SHA-256 van de waarde) — nooit de waarde, ook niet in een foutmelding;
#   - een waarde komt niet in de argumenten van een proces terecht (printf is een shell-builtin; sha256sum leest stdin);
#   - idempotent: tweemaal draaien verandert niets meer en meldt «bestaat al»;
#   - elke aanmaak komt in /etc/mijn-ruimte/geheimen.journaal (naam, datum, vingerafdruk — geen waarde); daaruit maakt
#     deploy/geheimen-register.sh het register voor de eigenaar.
#
# Sleutels (zie ENV-VARS.md):
#   altijd (geen terugval in de code → veilig om aan te maken):
#     TOTP_ENCRYPTION_KEY_V1 GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 OWNER_VAULT_ENCRYPTION_KEY_V1 MAIL_TOKEN_ENCRYPTION_KEY_V1
#     MAIL_APP_WACHTWOORD_SLEUTEL_V1 AGENDA_ABONNEMENT_SLEUTEL_V1   (32 willekeurige bytes, base64)
#     RECOVERY_CODE_PEPPER AUDIT_IP_PEPPER                           (48 bytes, base64)
#   alleen met --ook-optioneel of in een NIEUW bestand:
#     GITHUB_KOPPELING_SLEUTEL_V1 AGENT_SLEUTEL_V1 AI_ARCHIEF_SLEUTEL_V1
#     (zonder deze sleutel gebruikt de code TOTP_ENCRYPTION_KEY_V1; op een bestaande installatie kunnen er dus al gegevens
#      onder de TOTP-sleutel staan — een nieuwe eigen sleutel zou die onleesbaar maken. Daarom hier bewust NIET automatisch.)
#   alleen als MICROSOFT_GRAPH_WEBHOOK_URL gezet is: MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE (32 bytes, hex)
#
# Gebruik (als root):  geheimen-aanmaken.sh [--eigenaar <e-mailadres>] [--ook-optioneel] [--stil] [bestand]
#   --eigenaar       zet OWNER_EMAIL als die ontbreekt (nooit overschrijven)
#   --ook-optioneel  maakt ook de sleutels met TOTP-terugval aan (alleen op een verse installatie!)
#   --stil           alleen regels over aangemaakte of ontbrekende sleutels (voor de installatiestap)
#   bestand          standaard /etc/mijn-ruimte/geheimen.env; een ander pad mag ook zonder root (tests, proefdraaien)
# Afsluitcode 0 = alle verplichte sleutels aanwezig (al dan niet net aangemaakt).
set -euo pipefail
umask 077

EIGENAAR=""; OOK_OPTIONEEL=0; STIL=0; BESTAND=""
while [ $# -gt 0 ]; do
  case "$1" in
    --eigenaar) EIGENAAR="${2:?e-mailadres ontbreekt}"; shift 2 ;;
    --ook-optioneel) OOK_OPTIONEEL=1; shift ;;
    --stil) STIL=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    --*) echo "[geheimen] onbekende optie: $1" >&2; exit 2 ;;
    *) BESTAND="$1"; shift ;;
  esac
done
STANDAARD=/etc/mijn-ruimte/geheimen.env
BESTAND="${BESTAND:-$STANDAARD}"
JOURNAAL="${GEHEIMEN_JOURNAAL:-$(dirname "$BESTAND")/geheimen.journaal}"

if [ "$BESTAND" = "$STANDAARD" ] && [ "$(id -u)" -ne 0 ]; then echo "[geheimen] voer dit uit als root (sudo), of geef een eigen bestand op" >&2; exit 1; fi
command -v openssl >/dev/null || { echo "[geheimen] openssl ontbreekt" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "[geheimen] sha256sum ontbreekt" >&2; exit 1; }

NIEUW_BESTAND=0; MODUS=0600
if [ -f "$BESTAND" ]; then MODUS="$(stat -c %a "$BESTAND")"; fi
if [ ! -f "$BESTAND" ]; then
  install -m 0600 /dev/null "$BESTAND"
  NIEUW_BESTAND=1
  [ "$STIL" -eq 1 ] || echo "[geheimen] $BESTAND aangemaakt (0600)"
fi
# Op een regeleinde laten eindigen vóór er iets bij komt.
[ ! -s "$BESTAND" ] || [ -z "$(tail -c1 "$BESTAND")" ] || printf '\n' >> "$BESTAND"

zeg()  { [ "$STIL" -eq 1 ] || echo "[geheimen] $*"; }
heeft_waarde() { grep -Eq "^[[:space:]]*(export[[:space:]]+)?$1=.+" "$BESTAND"; }
lege_regel_weg() { sed -i -E "/^[[:space:]]*(export[[:space:]]+)?$1=[[:space:]]*$/d" "$BESTAND"; }
# Vingerafdruk van de huidige waarde van een naam: SHA-256, eerste 8 hex. De waarde gaat alleen via stdin naar sha256sum.
vingerafdruk() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1=//p" "$BESTAND" | tail -n 1 | tr -d '\r' | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\n' | sha256sum | cut -c1-8
}
journaal() { # naam actie vingerafdruk
  { [ -f "$JOURNAAL" ] || install -m 0600 /dev/null "$JOURNAAL"; } 2>/dev/null || return 0
  printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" >> "$JOURNAAL" 2>/dev/null || true
}
AANGEMAAKT=(); BESTOND=(); OVERGESLAGEN=()
toevoegen() { # naam waarde
  local naam="$1" waarde="$2" fp
  if heeft_waarde "$naam"; then BESTOND+=("$naam"); return 0; fi
  lege_regel_weg "$naam"
  printf '%s=%s\n' "$naam" "$waarde" >> "$BESTAND"
  fp="$(printf '%s' "$waarde" | sha256sum | cut -c1-8)"
  AANGEMAAKT+=("$naam")
  journaal "$naam" aangemaakt "$fp"
  echo "[geheimen] $naam aangemaakt (vingerafdruk $fp)"
}
b64_32() { openssl rand -base64 32 | tr -d '\n'; }
b64_48() { openssl rand -base64 48 | tr -d '\n'; }
hex_32() { openssl rand -hex 32 | tr -d '\n'; }

# SLEUTELKLUIS_SLEUTEL_V1 (21.10.2026): verplicht gemaakt. Veilig om aan te maken bij de installatie van de release met 0092:
# geheimen_controleren draait VÓÓR de migraties, dus er bestaan dan nog geen omslagen die op de terugval (TOTP-sleutel) leunen.
# Daarna bestaat hij en wordt hij nooit overschreven. NIET handmatig verwijderen: AI-omslagen worden dan onleesbaar.
VERPLICHT_32=(TOTP_ENCRYPTION_KEY_V1 GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 OWNER_VAULT_ENCRYPTION_KEY_V1 MAIL_TOKEN_ENCRYPTION_KEY_V1 MAIL_APP_WACHTWOORD_SLEUTEL_V1 AGENDA_ABONNEMENT_SLEUTEL_V1 SLEUTELKLUIS_SLEUTEL_V1)
VERPLICHT_48=(RECOVERY_CODE_PEPPER AUDIT_IP_PEPPER)
OPTIONEEL_32=(GITHUB_KOPPELING_SLEUTEL_V1 AGENT_SLEUTEL_V1 AI_ARCHIEF_SLEUTEL_V1)

for naam in "${VERPLICHT_32[@]}"; do toevoegen "$naam" "$(b64_32)"; done
for naam in "${VERPLICHT_48[@]}"; do toevoegen "$naam" "$(b64_48)"; done
if [ "$OOK_OPTIONEEL" -eq 1 ] || [ "$NIEUW_BESTAND" -eq 1 ]; then
  for naam in "${OPTIONEEL_32[@]}"; do toevoegen "$naam" "$(b64_32)"; done
else
  for naam in "${OPTIONEEL_32[@]}"; do heeft_waarde "$naam" && BESTOND+=("$naam") || OVERGESLAGEN+=("$naam"); done
fi
if heeft_waarde MICROSOFT_GRAPH_WEBHOOK_URL; then toevoegen MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE "$(hex_32)"; fi

if [ -n "$EIGENAAR" ]; then
  if heeft_waarde OWNER_EMAIL; then
    grep -qx "OWNER_EMAIL=$EIGENAAR" "$BESTAND" && zeg "OWNER_EMAIL al ingesteld" || echo "[geheimen] LET OP: OWNER_EMAIL heeft al een andere waarde (ongewijzigd)" >&2
  else
    lege_regel_weg OWNER_EMAIL; printf 'OWNER_EMAIL=%s\n' "$EIGENAAR" >> "$BESTAND"; zeg "OWNER_EMAIL toegevoegd"
  fi
fi

# Rechten zoals ze waren (root:root 0600 of root:mijnruimte 0640 — zie ENV-VARS.md); een nieuw bestand is 0600.
chmod "$MODUS" "$BESTAND"

[ "${#BESTOND[@]}" -eq 0 ] || zeg "bestond al (ongewijzigd): ${BESTOND[*]}"
if [ "${#OVERGESLAGEN[@]}" -gt 0 ]; then
  echo "[geheimen] niet aangemaakt (code valt terug op TOTP_ENCRYPTION_KEY_V1; op een bestaande installatie kunnen er al gegevens onder staan): ${OVERGESLAGEN[*]} — bewust kiezen: --ook-optioneel (zie ENV-VARS.md)"
fi
if [ "$STIL" -eq 0 ]; then
  echo "[geheimen] vingerafdrukken (SHA-256, eerste 8 hex; nooit waarden):"
  for naam in "${VERPLICHT_32[@]}" "${VERPLICHT_48[@]}" "${OPTIONEEL_32[@]}" MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE; do
    heeft_waarde "$naam" && printf '  %-40s %s\n' "$naam" "$(vingerafdruk "$naam")"
  done
fi
ONTBREEKT=()
for naam in "${VERPLICHT_32[@]}" "${VERPLICHT_48[@]}"; do heeft_waarde "$naam" || ONTBREEKT+=("$naam"); done
if [ "${#ONTBREEKT[@]}" -gt 0 ]; then echo "[geheimen] FOUT: nog steeds ontbrekend: ${ONTBREEKT[*]}" >&2; exit 1; fi
zeg "klaar: ${#AANGEMAAKT[@]} aangemaakt, ${#BESTOND[@]} bestonden al"
