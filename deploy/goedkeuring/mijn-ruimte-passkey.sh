#!/usr/bin/env bash
# /usr/local/sbin/mijn-ruimte-passkey — passkeys voor het goedkeuren van updates beheren (root). Zie deploy/RUNBOOK-VEILIGE-UITROL.md §13.
#   mijn-ruimte-passkey wachtend                    aanmeldingen die op bevestiging wachten (vingerafdruk zoals op de telefoon)
#   mijn-ruimte-passkey toevoegen <vingerafdruk>    eerste (of extra) passkey bevestigen; minstens 16 hex-tekens
#   mijn-ruimte-passkey lijst | verwijderen <vingerafdruk> | alles-intrekken
#   mijn-ruimte-passkey rp-bijwerken               leeg bestand: rpId admin.tarasevych.com -> tarasevych.com (installer doet dit zelf)
# Intern ook: verifieer-goedkeuring (mijn-ruimte-uitrol --goedkeuring) en verwerk (mijn-ruimte-goedkeur-sleutels.service).
# Lege omgeving (geen NODE_OPTIONS e.d.), vaste node, één vergrendeling voor de toestand (nonces, tellers, sleutelbestand).
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "voer dit uit als root (sudo)" >&2; exit 1; }
STAAT=/var/lib/mijn-ruimte/goedkeuring
install -d -o root -g root -m 0700 "$STAAT"
exec /usr/bin/flock -w 120 "$STAAT/.lock" /usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C.UTF-8 \
  /usr/bin/node --disallow-code-generation-from-strings /usr/local/lib/mijn-ruimte/goedkeuring/goedkeur-hulp.mjs "$@"
