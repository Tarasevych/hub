#!/usr/bin/env bash
# google-login-zetten.sh — OUDE NAAM, blijft werken (scripts/google-login-instellen.ps1 roept /usr/local/sbin/google-login-zetten
# aan met twee regels op stdin). Sinds 20.10.2026 doet deploy/oauth-client-zetten.sh google hetzelfde, plus Microsoft en het
# journaal voor het geheimenregister. Installeren: mijn-ruimte-installeer zet beide in /usr/local/sbin.
set -euo pipefail
for k in "$(dirname "$0")/oauth-client-zetten.sh" /usr/local/sbin/mijn-ruimte-oauth-client /srv/mijn-ruimte/current/deploy/oauth-client-zetten.sh; do
  [ -s "$k" ] || continue
  exec bash "$k" google "$@"
done
echo "oauth-client-zetten.sh niet gevonden / не знайдено (zie deploy/LEESMIJ.md)" >&2; exit 1
