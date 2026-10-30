#!/usr/bin/env bash
# Headless-browser voor de rendercontrole van releases op de EIGEN server (BYOS). Aangeroepen als
#   sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle [--map /srv/mijn-ruimte/browser] [--zonder-apt] [--controleer] [--verwijderen]
#
# Waarom: release 20261021-221718 gaf «Buffer is not defined» in de technische bundel; elke admin.*-pagina was wit terwijl
# /__gezondheid en «HTTP 200» groen waren. Alleen een echte browser ziet of een pagina rendert (scripts/rook-controle.mjs).
# Zonder browser doet de installer alleen de modulecontrole in Node en meldt eerlijk «rendering niet gecontroleerd».
#
# Wat dit doet (en niets meer):
#   1. apt: de gedeelde bibliotheken die Chromium nodig heeft (libnss3, libatk…, fonts-liberation). Zonder apt of met
#      --zonder-apt wordt dit overgeslagen (dan moet u ze zelf hebben; `--controleer` toont wat ontbreekt via ldd).
#   2. «chrome-headless-shell» (Chrome for Testing, de officiële headless-build van Google, BSD-licentie van Chromium) vastgepind
#      op ÉÉN versie met SHA-256 (hieronder). Download via HTTPS, hash gecontroleerd vóór het uitpakken; klopt hij niet, dan wordt
#      het bestand verwijderd en gemeld. Bestemming: --map (standaard /srv/mijn-ruimte/browser), root-eigen, leesbaar voor de dienst.
#      Niet in de release-tar (±125 MB) en alleen gedownload als hij ontbreekt of een andere versie heeft.
#   Geen `curl | bash`, geen snap, geen scripts van derden: alleen apt en één archief met bekende hash.
# Alternatief zonder download: een distributie-Chromium (Debian: apt install chromium) wordt automatisch gevonden op
# /usr/bin/chromium of /usr/bin/chromium-browser (op Ubuntu is dat een snap en werkt het NIET onder systemd zonder snapd — gebruik dit script).
set -euo pipefail

MAP='/srv/mijn-ruimte/browser'
MET_APT=1
ALLEEN_CONTROLE=0
VERWIJDEREN=0
DIENST_GEBRUIKER="${MIJN_RUIMTE_GEBRUIKER:-mijnruimte}"

# Vastgepinde build (Chrome for Testing «Stable», 22.10.2026). Bijwerken: nieuwe versie + nieuwe SHA-256 hier, na eigen controle
# (sha256sum van het gedownloade zip). De URL-vorm is vast: https://storage.googleapis.com/chrome-for-testing-public/<versie>/linux64/chrome-headless-shell-linux64.zip
VERSIE='156.0.8078.47'
SHA256='0d5acc62c3e213f8c87d3c298d66ffcf9a236d12ea4b9f85318bf85dbc279daa'
BRON="https://storage.googleapis.com/chrome-for-testing-public/${VERSIE}/linux64/chrome-headless-shell-linux64.zip"
# Runtime-bibliotheken (deb.deps van de build; libasound2t64 op Ubuntu 24.04 vervangt libasound2 — apt lost dat zelf op via Provides).
PAKKETTEN=(ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libudev1 libvulkan1 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 unzip)
PAKKETTEN_OUD=(libasound2)   # Ubuntu 22.04 / Debian 12: zonder t64

melding() { printf '  %s\n' "$*"; }
fout() { printf 'FOUT: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --map) MAP="${2:?}"; shift 2 ;;
    --zonder-apt) MET_APT=0; shift ;;
    --controleer) ALLEEN_CONTROLE=1; shift ;;
    --verwijderen) VERWIJDEREN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) fout "onbekende optie: $1" ;;
  esac
done
[ "$(id -u)" -eq 0 ] || fout "als root uitvoeren (sudo mijn-ruimte-installeer browser-controle)"
[[ "$MAP" == /* ]] || fout "--map moet een absoluut pad zijn"
BIN="$MAP/chrome-headless-shell"

if [ "$VERWIJDEREN" -eq 1 ]; then
  rm -rf -- "$MAP"; melding "verwijderd: $MAP (de installer valt terug op de modulecontrole zonder browser)"; exit 0
fi

# 0. Al aanwezig en de juiste versie?
huidige() { [ -x "$BIN" ] && cat "$MAP/VERSIE" 2>/dev/null || true; }
if [ "$ALLEEN_CONTROLE" -eq 1 ]; then
  if [ -x "$BIN" ]; then
    melding "browser: $BIN (versie $(huidige), verwacht $VERSIE)"
    mis="$(ldd "$BIN" 2>/dev/null | awk '/not found/ {print $1}' | tr '\n' ' ')"
    if [ -n "$mis" ]; then melding "ONTBREKENDE bibliotheken: $mis (voer dit script zonder --controleer uit)"; exit 2; fi
    "$BIN" --headless=new --no-sandbox --disable-gpu --version 2>/dev/null | head -1 | sed 's/^/  /' || { melding "browser start niet"; exit 2; }
    melding "in orde: de installer doet de rendercontrole in de browser"
    exit 0
  fi
  for k in /usr/bin/chromium /usr/bin/chromium-browser /usr/lib/chromium/chromium; do [ -x "$k" ] && { melding "distributie-Chromium gevonden: $k"; exit 0; }; done
  melding "GEEN browser: de installer controleert alleen modules (Node) en meldt «rendering niet gecontroleerd»"; exit 2
fi

# 1. Pakketten
if [ "$MET_APT" -eq 1 ] && command -v apt-get >/dev/null 2>&1; then
  nodig=()
  for p in "${PAKKETTEN[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || nodig+=("$p"); done
  if [ ${#nodig[@]} -gt 0 ]; then
    melding "pakketten installeren: ${nodig[*]}"
    if ! DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${nodig[@]}" >/dev/null 2>&1; then
      # Oudere distributie: libasound2 in plaats van libasound2t64.
      alt=(); for p in "${nodig[@]}"; do [ "$p" = libasound2t64 ] && alt+=("${PAKKETTEN_OUD[@]}") || alt+=("$p"); done
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${alt[@]}" >/dev/null || melding "apt-get install mislukt: controleer hieronder met ldd welke bibliotheken ontbreken"
    fi
  fi
fi
command -v unzip >/dev/null 2>&1 || fout "unzip ontbreekt (apt-get install unzip)"

# 2. De browser zelf (vastgepind + SHA-256)
if [ -x "$BIN" ] && [ "$(huidige)" = "$VERSIE" ]; then
  melding "browser aanwezig: $BIN (versie $VERSIE)"
else
  install -d -m 0755 -o root -g root "$MAP"
  tmp="$(mktemp "${TMPDIR:-/tmp}/browser-controle.XXXXXX.zip")"
  melding "downloaden: $BRON"
  curl -fsSL --proto '=https' --tlsv1.2 --max-time 900 -o "$tmp" "$BRON" || { rm -f "$tmp"; fout "download mislukt ($BRON)"; }
  echt="$(sha256sum "$tmp" | cut -d' ' -f1)"
  if [ "$echt" != "$SHA256" ]; then rm -f "$tmp"; fout "SHA-256 klopt NIET (verwacht $SHA256, kreeg $echt) — archief verwijderd, niets geïnstalleerd"; fi
  melding "SHA-256 gecontroleerd"
  uit="$(mktemp -d "${TMPDIR:-/tmp}/browser-controle.XXXXXX")"
  unzip -q "$tmp" -d "$uit" || { rm -rf "$tmp" "$uit"; fout "uitpakken mislukt"; }
  rm -f "$tmp"
  [ -x "$uit/chrome-headless-shell-linux64/chrome-headless-shell" ] || { rm -rf "$uit"; fout "archief zonder chrome-headless-shell"; }
  # Atomisch vervangen: nieuwe map naast de oude, dan omzetten.
  rm -rf "$MAP.nieuw"; mv "$uit/chrome-headless-shell-linux64" "$MAP.nieuw"; rm -rf "$uit"
  printf '%s\n' "$VERSIE" > "$MAP.nieuw/VERSIE"
  chown -R root:root "$MAP.nieuw"; find "$MAP.nieuw" -type d -exec chmod 0755 {} +; find "$MAP.nieuw" -type f -exec chmod 0644 {} +; chmod 0755 "$MAP.nieuw/chrome-headless-shell"
  rm -rf "$MAP.oud"; [ -d "$MAP" ] && mv "$MAP" "$MAP.oud"; mv "$MAP.nieuw" "$MAP"; rm -rf "$MAP.oud"
  melding "geïnstalleerd: $BIN (versie $VERSIE, $(du -sh "$MAP" | cut -f1))"
fi

# 3. Werkt hij?
mis="$(ldd "$BIN" 2>/dev/null | awk '/not found/ {print $1}' | tr '\n' ' ')"
[ -z "$mis" ] || fout "ontbrekende bibliotheken: $mis (apt-get install …; zie deb.deps in $MAP)"
if v="$("$BIN" --headless=new --no-sandbox --disable-gpu --version 2>/dev/null | head -1)"; then melding "start: $v"; else fout "de browser start niet (zie journalctl / voer handmatig uit: $BIN --headless=new --no-sandbox --version)"; fi
id "$DIENST_GEBRUIKER" >/dev/null 2>&1 && melding "map $MAP is leesbaar voor $DIENST_GEBRUIKER (0755/0644); de rendercontrole draait als die gebruiker, nooit als root"
melding "klaar: bij elke installatie controleert de installer nu in de browser of de pagina's renderen (automatisch terugdraaien bij een witte pagina). Handmatig: sudo mijn-ruimte-installeer rook-controle"
