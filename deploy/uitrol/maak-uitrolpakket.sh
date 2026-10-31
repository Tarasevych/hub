#!/usr/bin/env bash
# Mijn Ruimte: maak en onderteken een uitrolpakket (Linux/macOS/WSL-variant van maak-uitrolpakket.ps1).
# Gebruik: deploy/uitrol/maak-uitrolpakket.sh [--zonder-git "reden"] <sleutel> [uitvoermap]      (in de repo; alleen HEAD wordt verpakt)
# Uitvoer: mijn-ruimte-<versie>.tar.gz, .tar.gz.sig en .txt (versie, bytes, sha256).
set -euo pipefail

# Regel 3 (deploy/REGELS-UITROLPAKKET.md): BRON-COMMIT is verplicht. Normaal uit git (HEAD); alleen buiten git met een uitdrukkelijke
# reden: --zonder-git "reden" (≥ 5 tekens) → BRON-COMMIT = «zonder-git:<reden>», zichtbaar als waarschuwing op de site. Zonder git en
# zonder die vlag weigert dit script, want root en de voorcontrole weigeren zo'n pakket ook (GEEN_BRON_COMMIT).
ZONDER_GIT=""
if [ "${1:-}" = "--zonder-git" ]; then
  ZONDER_GIT="$(printf '%s' "${2:-}" | tr '\r\n' '  ' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ "${#ZONDER_GIT}" -ge 5 ] || { echo "FOUT: --zonder-git vraagt een reden van minstens 5 tekens (waarom zonder git?)" >&2; exit 1; }
  shift 2
fi
sleutel="${1:?gebruik: maak-uitrolpakket.sh <privésleutel> [uitvoermap]}"
uit="${2:-$PWD}"
versie="${UITROL_VERSIE_OVERRIDE:-$(date +%Y%m%d-%H%M%S)}"
[[ "$versie" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo "FOUT: ongeldige versie $versie" >&2; exit 1; }
if [ -z "$ZONDER_GIT" ]; then
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "FOUT: geen git-repository. Bouw vanuit git (BRON-COMMIT = HEAD) of geef uitdrukkelijk --zonder-git \"reden\" (zie deploy/REGELS-UITROLPAKKET.md)" >&2; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "FOUT: niet-gecommitte wijzigingen (alleen HEAD wordt verpakt)" >&2; exit 1; }
  commit="$(git rev-parse HEAD)"
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "FOUT: git rev-parse HEAD gaf geen volledige commit" >&2; exit 1; }
else
  commit="zonder-git:$ZONDER_GIT"
  echo "LET OP: pakket wordt BUITEN git gebouwd (BRON-COMMIT = $commit); de site toont dit als waarschuwing." >&2
fi
# Правило 2 (PRAVYLA-ADRESY-I-VYPUSKY.md): обовʼязкові метадані випуску. Без них машина відхилить архів.
AUTEUR="${AUTEUR:-}"; AGENT="${AGENT:-}"; SAMENVATTING="${SAMENVATTING:-}"
[ -n "$AUTEUR" ] || { echo "FOUT: встановіть AUTEUR (email/імʼя автора випуску)" >&2; exit 1; }
[[ "$AGENT" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || { echo "FOUT: встановіть AGENT (claude/cursor/gpt, малі літери)" >&2; exit 1; }
[ "${#SAMENVATTING}" -ge 20 ] || { echo "FOUT: встановіть SAMENVATTING (підсумок, мінімум 20 символів)" >&2; exit 1; }
doel="$uit/mijn-ruimte-$versie.tar.gz"
# ORCH-001 (31.10.2026): UITROL-BASIS — op welke GEÏNSTALLEERDE versie en commit dit pakket is gebouwd (BASIS_VERSIE=JJJJMMDD-UUMMSS,
# BASIS_COMMIT=<40 hex>); root weigert een pakket waarvan de basis ouder is dan wat er staat (BASIS_VEROUDERD). Komt er een
# orchestratie/regels.lock.json mee, dan ook regelsVersie/regelsHash. Verplicht voor UITROL-VERSIE ≥ 20261201-000000 (GEEN_BASIS).
# Het eenvoudigst: node scripts/orch.mjs pakket (leest de basis uit orchestratie/geinstalleerd.json of beleid.json).
BASISTEKST=""
if [ -n "${BASIS_VERSIE:-}${BASIS_COMMIT:-}" ]; then
  { [[ "${BASIS_VERSIE:-}" =~ ^[0-9]{8}-[0-9]{6}$ ]] && [[ "${BASIS_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; } || { echo "FOUT: BASIS_VERSIE (JJJJMMDD-UUMMSS) en BASIS_COMMIT (40 hex) horen samen en moeten geldig zijn" >&2; exit 1; }
  BASISTEKST="versie=$BASIS_VERSIE"$'\n'"commit=$BASIS_COMMIT"
  if [ -f orchestratie/regels.lock.json ]; then
    BASISTEKST+=$'\n'"$(python3 -c 'import json; d=json.load(open("orchestratie/regels.lock.json",encoding="utf-8")); print("regelsVersie=" + d["regelsVersie"] + "\nregelsHash=" + d["hash"])')"
  fi
elif [[ "$versie" > "20261201-000000" || "$versie" == "20261201-000000" ]]; then
  echo "FOUT: встановіть BASIS_VERSIE і BASIS_COMMIT (встановлена база) — root відхилить пакет без UITROL-BASIS (GEEN_BASIS); простіше: node scripts/orch.mjs pakket" >&2; exit 1
fi
if [ -z "$ZONDER_GIT" ]; then
  git archive --format=tar.gz --prefix="mijn-ruimte-$versie/" \
    --add-virtual-file="mijn-ruimte-$versie/UITROL-VERSIE:$versie" \
    --add-virtual-file="mijn-ruimte-$versie/BRON-COMMIT:$commit" \
    --add-virtual-file="mijn-ruimte-$versie/AUTEUR:$AUTEUR" \
    --add-virtual-file="mijn-ruimte-$versie/AGENT:$AGENT" \
    --add-virtual-file="mijn-ruimte-$versie/SAMENVATTING:$SAMENVATTING" \
    ${BASISTEKST:+--add-virtual-file="mijn-ruimte-$versie/UITROL-BASIS:$BASISTEKST"} -o "$doel" HEAD
else
  # Buiten git: de werkmap zelf (zonder bouwresten), met dezelfde metadatabestanden en één bovenmap.
  stage="$(mktemp -d)"; mkdir -p "$stage/mijn-ruimte-$versie"
  tar -C . --exclude=./node_modules --exclude=./dist --exclude=./dist-server --exclude=./.git --exclude=./rapporten --exclude=./harness \
      --exclude='./harness-*' --exclude='*.bak' --exclude='./mijn-ruimte-*.tar.gz*' --exclude='./mijn-ruimte-*.voorstel.json' --exclude='./mijn-ruimte-*.txt' -cf - . | tar -C "$stage/mijn-ruimte-$versie" -xf -
  printf '%s' "$versie" > "$stage/mijn-ruimte-$versie/UITROL-VERSIE"; printf '%s' "$commit" > "$stage/mijn-ruimte-$versie/BRON-COMMIT"
  printf '%s' "$AUTEUR" > "$stage/mijn-ruimte-$versie/AUTEUR"; printf '%s' "$AGENT" > "$stage/mijn-ruimte-$versie/AGENT"; printf '%s' "$SAMENVATTING" > "$stage/mijn-ruimte-$versie/SAMENVATTING"
  [ -z "$BASISTEKST" ] || printf '%s\n' "$BASISTEKST" > "$stage/mijn-ruimte-$versie/UITROL-BASIS"
  tar -C "$stage" -czf "$doel" "mijn-ruimte-$versie"; rm -rf -- "$stage"
fi
rm -f "$doel.sig"
ssh-keygen -q -Y sign -f "$sleutel" -n mijn-ruimte-uitrol "$doel"
ond="$(mktemp)"; trap 'rm -f "$ond"' EXIT
printf 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol" %s\n' "$(cat "$sleutel.pub")" > "$ond"
ssh-keygen -Y verify -f "$ond" -I uitrol@mijn-ruimte -n mijn-ruimte-uitrol -s "$doel.sig" < "$doel" >/dev/null
bytes="$(stat -c %s "$doel" 2>/dev/null || stat -f %z "$doel")"
sha="$(sha256sum "$doel" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$doel" | cut -d' ' -f1)"
printf 'versie=%s\ncommit=%s\nbytes=%s\nsha256=%s\n' "$versie" "$commit" "$bytes" "$sha" > "$uit/mijn-ruimte-$versie.txt"
echo "klaar: $doel (+ .sig, .txt)  versie=$versie bytes=$bytes sha256=$sha"
