#!/usr/bin/env bash
# Mijn Ruimte: maak en onderteken een uitrolpakket (Linux/macOS/WSL-variant van maak-uitrolpakket.ps1).
# Gebruik: deploy/uitrol/maak-uitrolpakket.sh <sleutel> [uitvoermap]      (in de repo; alleen HEAD wordt verpakt)
# Uitvoer: mijn-ruimte-<versie>.tar.gz, .tar.gz.sig en .txt (versie, bytes, sha256).
set -euo pipefail
sleutel="${1:?gebruik: maak-uitrolpakket.sh <privésleutel> [uitvoermap]}"
uit="${2:-$PWD}"
versie="${UITROL_VERSIE_OVERRIDE:-$(date +%Y%m%d-%H%M%S)}"
[[ "$versie" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo "FOUT: ongeldige versie $versie" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "FOUT: niet-gecommitte wijzigingen (alleen HEAD wordt verpakt)" >&2; exit 1; }
commit="$(git rev-parse HEAD)"
# Правило 2 (PRAVYLA-ADRESY-I-VYPUSKY.md): обовʼязкові метадані випуску. Без них машина відхилить архів.
AUTEUR="${AUTEUR:-}"; AGENT="${AGENT:-}"; SAMENVATTING="${SAMENVATTING:-}"
[ -n "$AUTEUR" ] || { echo "FOUT: встановіть AUTEUR (email/імʼя автора випуску)" >&2; exit 1; }
[[ "$AGENT" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || { echo "FOUT: встановіть AGENT (claude/cursor/gpt, малі літери)" >&2; exit 1; }
[ "${#SAMENVATTING}" -ge 20 ] || { echo "FOUT: встановіть SAMENVATTING (підсумок, мінімум 20 символів)" >&2; exit 1; }
doel="$uit/mijn-ruimte-$versie.tar.gz"
git archive --format=tar.gz --prefix="mijn-ruimte-$versie/" \
  --add-virtual-file="mijn-ruimte-$versie/UITROL-VERSIE:$versie" \
  --add-virtual-file="mijn-ruimte-$versie/BRON-COMMIT:$commit" \
  --add-virtual-file="mijn-ruimte-$versie/AUTEUR:$AUTEUR" \
  --add-virtual-file="mijn-ruimte-$versie/AGENT:$AGENT" \
  --add-virtual-file="mijn-ruimte-$versie/SAMENVATTING:$SAMENVATTING" -o "$doel" HEAD
rm -f "$doel.sig"
ssh-keygen -q -Y sign -f "$sleutel" -n mijn-ruimte-uitrol "$doel"
ond="$(mktemp)"; trap 'rm -f "$ond"' EXIT
printf 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol" %s\n' "$(cat "$sleutel.pub")" > "$ond"
ssh-keygen -Y verify -f "$ond" -I uitrol@mijn-ruimte -n mijn-ruimte-uitrol -s "$doel.sig" < "$doel" >/dev/null
bytes="$(stat -c %s "$doel" 2>/dev/null || stat -f %z "$doel")"
sha="$(sha256sum "$doel" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$doel" | cut -d' ' -f1)"
printf 'versie=%s\ncommit=%s\nbytes=%s\nsha256=%s\n' "$versie" "$commit" "$bytes" "$sha" > "$uit/mijn-ruimte-$versie.txt"
echo "klaar: $doel (+ .sig, .txt)  versie=$versie bytes=$bytes sha256=$sha"
