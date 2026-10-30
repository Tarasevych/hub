#!/bin/sh
# Mijn Ruimte — lokaal kanaal van de browserextensie verwijderen (Linux / macOS, huidige gebruiker).
#   sh verwijder-unix.sh [--doel MAP]
# Verwijdert de manifesten (Chrome, Chromium, Edge, Brave), de programmamap en het token. De extensie en ~/.mijn-ruimte blijven.
set -eu
DOEL=""
[ "${1:-}" = "--doel" ] && DOEL="${2:-}"
HOST_NAAM="com.tarasevych.mijnruimte"
case "$(uname -s)" in
  Darwin)
    [ -n "$DOEL" ] || DOEL="$HOME/Library/Application Support/MijnRuimte/extensie-native"
    B="$HOME/Library/Application Support"
    for m in "Google/Chrome" "Chromium" "Microsoft Edge" "BraveSoftware/Brave-Browser"; do
      f="$B/$m/NativeMessagingHosts/$HOST_NAAM.json"; [ -f "$f" ] && rm -f "$f" && echo "Видалено: $f"
    done ;;
  *)
    [ -n "$DOEL" ] || DOEL="${XDG_DATA_HOME:-$HOME/.local/share}/mijn-ruimte/extensie-native"
    B="${XDG_CONFIG_HOME:-$HOME/.config}"
    for m in google-chrome chromium microsoft-edge BraveSoftware/Brave-Browser; do
      f="$B/$m/NativeMessagingHosts/$HOST_NAAM.json"; [ -f "$f" ] && rm -f "$f" && echo "Видалено: $f"
    done ;;
esac
[ -d "$DOEL" ] && rm -rf "$DOEL" && echo "Видалено: $DOEL"
[ -f "$HOME/.mijn-ruimte/extensie-token" ] && rm -f "$HOME/.mijn-ruimte/extensie-token" && echo "Видалено: токен"
echo "Готово. Claude Code: claude mcp remove mijn-ruimte-lokaal; Claude Desktop: приберіть 'mijn-ruimte-lokaal' з claude_desktop_config.json."
