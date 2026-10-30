#!/usr/bin/env bash
# geheimen-aanvullen.sh — OUDE NAAM, blijft werken. Sinds 20.10.2026 doet deploy/geheimen-aanmaken.sh dit (alle sleutels,
# vingerafdrukken, journaal voor het register). Zelfde opties: [--eigenaar <e-mailadres>] [bestand].
set -euo pipefail
for k in "$(dirname "$0")/geheimen-aanmaken.sh" /usr/local/sbin/mijn-ruimte-geheimen /srv/mijn-ruimte/current/deploy/geheimen-aanmaken.sh; do
  [ -x "$k" ] || [ -s "$k" ] || continue
  exec bash "$k" "$@"
done
echo "[geheimen] geheimen-aanmaken.sh niet gevonden (zie ENV-VARS.md)" >&2; exit 1
