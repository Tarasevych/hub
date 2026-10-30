#!/bin/sh
# Mijn Ruimte — lokaal kanaal van de browserextensie (0.5.0) installeren op Linux of macOS, alleen voor de huidige gebruiker.
#
#   sh installeer-unix.sh                 # node uit PATH
#   sh installeer-unix.sh --node /opt/node/bin/node --doel ~/mijn-map
#
# Wat het doet: kopieert de drie .mjs-bestanden, maakt een start-script met het volledige node-pad (een browser die vanuit het
# bureaublad start, kent uw PATH niet), schrijft com.tarasevych.mijnruimte.json in de NativeMessagingHosts-map van Chrome (en van
# Chromium / Edge / Brave als die er zijn) en maakt ~/.mijn-ruimte met 0700. Geen sudo nodig.
set -eu

NODE=""
DOEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --node) NODE="$2"; shift 2 ;;
    --doel) DOEL="$2"; shift 2 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "onbekende optie: $1" >&2; exit 2 ;;
  esac
done

BRON="$(cd "$(dirname "$0")" && pwd)"
HOST_NAAM="com.tarasevych.mijnruimte"
OS="$(uname -s)"

fout() { echo "ПОМИЛКА: $*" >&2; exit 1; }

[ -n "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
[ -n "$NODE" ] && [ -x "$NODE" ] || fout "node не знайдено. Встановіть Node.js 18+ або вкажіть --node /шлях/до/node"
NODE="$(cd "$(dirname "$NODE")" && pwd)/$(basename "$NODE")"
VERSIE="$("$NODE" -e 'process.stdout.write(process.versions.node)')"
[ "${VERSIE%%.*}" -ge 18 ] 2>/dev/null || fout "потрібен Node.js 18 або новіший (знайдено $VERSIE)"
echo "Node.js $VERSIE : $NODE"

case "$OS" in
  Darwin)
    [ -n "$DOEL" ] || DOEL="$HOME/Library/Application Support/MijnRuimte/extensie-native"
    BASIS="$HOME/Library/Application Support"
    ;;
  Linux)
    [ -n "$DOEL" ] || DOEL="${XDG_DATA_HOME:-$HOME/.local/share}/mijn-ruimte/extensie-native"
    BASIS="${XDG_CONFIG_HOME:-$HOME/.config}"
    ;;
  *) fout "непідтримувана система: $OS (для Windows: installeer-windows.ps1)" ;;
esac

for f in mr-native-gemeen.mjs mr-native-host.mjs mr-native-mcp.mjs com.tarasevych.mijnruimte.json; do
  [ -f "$BRON/$f" ] || fout "файл $f відсутній поруч зі скриптом ($BRON)"
done

umask 077
mkdir -p "$DOEL"
chmod 700 "$DOEL"
for f in mr-native-gemeen.mjs mr-native-host.mjs mr-native-mcp.mjs; do cp "$BRON/$f" "$DOEL/$f"; chmod 600 "$DOEL/$f"; done

# Start-script: paden tussen enkele aanhalingstekens (ook met spaties, bv. "Application Support").
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
WRAPPER="$DOEL/mr-native-host"
{
  echo '#!/bin/sh'
  echo "exec $(q "$NODE") $(q "$DOEL/mr-native-host.mjs") \"\$@\""
} > "$WRAPPER"
chmod 700 "$WRAPPER"

mkdir -p "$HOME/.mijn-ruimte"
chmod 700 "$HOME/.mijn-ruimte"

# Manifest met node zelf schrijven (juiste JSON-escaping van het pad) en allowed_origins controleren.
schrijf_manifest() {
  "$NODE" -e '
    const fs = require("fs");
    const [bron, doel, pad] = process.argv.slice(1);
    const m = JSON.parse(fs.readFileSync(bron, "utf8"));
    if (JSON.stringify(m.allowed_origins) !== JSON.stringify(["chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi/"])) { console.error("allowed_origins gewijzigd"); process.exit(1); }
    m.path = pad;
    fs.writeFileSync(doel, JSON.stringify(m, null, 2) + "\n", { mode: 0o644 });
  ' "$BRON/com.tarasevych.mijnruimte.json" "$1" "$WRAPPER"
}

# registreer <submap van BASIS> <verplicht 0|1>: Google Chrome altijd, de andere browsers alleen als hun profielmap bestaat.
registreer() {
  if [ "$2" = 1 ] || [ -d "$BASIS/$1" ]; then
    umask 022
    mkdir -p "$BASIS/$1/NativeMessagingHosts"
    schrijf_manifest "$BASIS/$1/NativeMessagingHosts/$HOST_NAAM.json"
    umask 077
    echo "Зареєстровано: $BASIS/$1/NativeMessagingHosts/$HOST_NAAM.json"
  fi
}
if [ "$OS" = Darwin ]; then
  registreer "Google/Chrome" 1
  registreer "Chromium" 0
  registreer "Microsoft Edge" 0
  registreer "BraveSoftware/Brave-Browser" 0
else
  registreer "google-chrome" 1
  registreer "chromium" 0
  registreer "microsoft-edge" 0
  registreer "BraveSoftware/Brave-Browser" 0
fi

MCP="$DOEL/mr-native-mcp.mjs"
echo ""
echo "Готово. Далі:"
echo " 1. Перезапустіть браузер. У налаштуваннях розширення «Мій простір» увімкніть «Нативні повідомлення» (дозвіл nativeMessaging)."
echo " 2. На сайті розблокуйте розширення своїм passkey і позначте «локальний агент»."
echo " 3. Claude Desktop (claude_desktop_config.json):"
"$NODE" -e 'console.log(JSON.stringify({ mcpServers: { "mijn-ruimte-lokaal": { command: process.argv[1], args: [process.argv[2]] } } }, null, 2))' "$NODE" "$MCP"
echo " 4. Claude Code:"
echo "    claude mcp add mijn-ruimte-lokaal -- $(q "$NODE") $(q "$MCP")"
