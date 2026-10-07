#!/bin/sh
# Mijn Ruimte: helper voor de browserextensie (macOS en Linux). Geen beheerdersrechten; schrijft alleen naar een eigen map,
# controleert het pakket met een SHA-256-controlesom en opent daarna de extensiepagina van de browser. Versie @@VERSION@@.
set -eu
SITE="https://mcp.tarasevych.com"
EXPECTED="@@SHA256@@"
case "$(uname -s)" in
  Darwin) DIR="$HOME/Library/Application Support/MijnRuimte/extension" ;;
  *) DIR="${XDG_DATA_HOME:-$HOME/.local/share}/MijnRuimte/extension" ;;
esac
TMP="$(mktemp -t mijnruimte.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

echo "Mijn Ruimte: встановлення розширення браузера"
echo "1/4 Завантажуємо розширення з $SITE"
curl -fsSL "$SITE/downloads/mijn-ruimte-extension.zip" -o "$TMP"

echo "2/4 Перевіряємо контрольну суму (SHA-256)"
if command -v sha256sum >/dev/null 2>&1; then GOT="$(sha256sum "$TMP" | cut -d' ' -f1)"; else GOT="$(shasum -a 256 "$TMP" | cut -d' ' -f1)"; fi
if [ "$GOT" != "$EXPECTED" ]; then echo "Контрольна сума не збігається (очікувалась $EXPECTED, отримано $GOT). Встановлення скасовано."; exit 1; fi

echo "3/4 Розпаковуємо в $DIR"
rm -rf "$DIR"; mkdir -p "$DIR"
unzip -q -o "$TMP" -d "$DIR"
if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$DIR" | pbcopy; elif command -v xclip >/dev/null 2>&1; then printf '%s' "$DIR" | xclip -selection clipboard; fi

echo "4/4 Відкриваємо сторінку розширень браузера"
if [ "$(uname -s)" = "Darwin" ]; then open -a "Google Chrome" "chrome://extensions" 2>/dev/null || open "chrome://extensions" || true
elif command -v google-chrome >/dev/null 2>&1; then google-chrome "chrome://extensions" >/dev/null 2>&1 &
elif command -v chromium >/dev/null 2>&1; then chromium "chrome://extensions" >/dev/null 2>&1 &
else echo "Браузер не знайдено: відкрийте chrome://extensions вручну."; fi

echo
echo "Залишилось 3 кліки (Chrome не дозволяє встановлювати розширення без вашої участі):"
echo "  1. Увімкніть «Режим розробника» (перемикач праворуч угорі)."
echo "  2. Натисніть «Завантажити розпаковане» і виберіть папку:"
echo "     $DIR"
echo "  3. Розширення саме відкриє сторінку активації на сайті."
