#!/usr/bin/env bash
# Mijn Ruimte: maak een ONONDERTEKEND voorstelpakket voor de passkey-goedkeuring (RUNBOOK-VEILIGE-UITROL.md §13).
# Geen sleutel nodig: het pakket installeert niets tot de eigenaar het in Admin → «Оновлення» / «Updates» met zijn passkey goedkeurt.
# Gebruik: deploy/uitrol/maak-voorstelpakket.sh [--zonder-git "reden"] [uitvoermap] [basis-ref voor wijzigingen/diff, standaard origin/main]
#   optioneel: TESTS_GESLAAGD=<n> TESTS_MISLUKT=<n> TESTS_SAMENVATTING="..."  (uitkomst van de eigen testrun)
# Uitvoer: mijn-ruimte-<versie>.tar.gz en mijn-ruimte-<versie>.voorstel.json (precies de argumenten voor het MCP-hulpmiddel
#          uitrol_voorstel_begin: version, bytes, sha256, commit, changelog, tests, diff_summary). Uploaden: uitrol_voorstel_stuk
#          (base64-stukken van max. 512 KiB, offset = al ontvangen bytes) en daarna uitrol_voorstel_klaar.
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
uit="${1:-$PWD}"
basis="${2:-origin/main}"
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
    BASISTEKST+=$'\n'"$(python3 -c 'import json; d=json.load(open("orchestratie/regels.lock.json",encoding="utf-8")); print("regelsVersie=" + d["regelsVersie"] + "\nregelsHash=" + d["hash"])' | tr -d '\r')"
  fi
elif [[ "$versie" > "20261201-000000" || "$versie" == "20261201-000000" ]]; then
  echo "FOUT: встановіть BASIS_VERSIE і BASIS_COMMIT (встановлена база) — root відхилить пакет без UITROL-BASIS (GEEN_BASIS); простіше: node scripts/orch.mjs pakket" >&2; exit 1
fi
# UI-010: UITROL-MANIFEST.json (tweetalige beschrijving uk+nl, auteur, AI-agenten met platform/model/rol; REGELS-UITROLPAKKET.md §5).
# MANIFEST=<pad naar json>. Verplicht voor versies vanaf 20261101-000000 (shared/uitrol-manifest.ts MANIFEST_VERPLICHT_VANAF).
MANIFESTJSON=""
if [ -n "${MANIFEST:-}" ]; then
  [ -f "$MANIFEST" ] || { echo "FOUT: MANIFEST-bestand niet gevonden: $MANIFEST" >&2; exit 1; }
  MANIFESTJSON="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); d["versie"]=sys.argv[2]; print(json.dumps(d,ensure_ascii=False,separators=(",",":")))' "$MANIFEST" "$versie" | tr -d '\r')" \
    || { echo "FOUT: MANIFEST is geen geldige JSON" >&2; exit 1; }
elif [[ "$versie" > "20261101-000000" || "$versie" == "20261101-000000" ]]; then
  echo "FOUT: встановіть MANIFEST=<шлях до UITROL-MANIFEST.json> (опис uk+nl і учасники; див. deploy/REGELS-UITROLPAKKET.md §5)" >&2; exit 1
fi
# TESTRESULTATEN gaat mee in het pakket (JSON {geslaagd, mislukt, samenvatting}): dan toont de voorcontrole «tests» ook bij een
# upload van het losse .tar.gz via de wizard of SSH, niet alleen via de MCP-weg met het .voorstel.json.
TESTJSON=""
# UI-010: TESTRESULTATEN_BESTAND=<pad> = volledig formaat 2 (falend[] met ookOpBasis, basis{}, uitleg{uk,nl}); gaat vóór de losse getallen.
if [ -n "${TESTRESULTATEN_BESTAND:-}" ]; then
  TESTJSON="$(python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1],encoding="utf-8")),ensure_ascii=False,separators=(",",":")))' "$TESTRESULTATEN_BESTAND" | tr -d '\r')" || { echo "FOUT: TESTRESULTATEN_BESTAND is geen geldige JSON" >&2; exit 1; }
elif [ -n "${TESTS_GESLAAGD:-}${TESTS_MISLUKT:-}${TESTS_SAMENVATTING:-}" ]; then
  TESTJSON="$(python3 - "${TESTS_GESLAAGD:-}" "${TESTS_MISLUKT:-}" "${TESTS_SAMENVATTING:-}" <<'PY'
import json, sys
ok, mis, sam = sys.argv[1:4]
uit = {k: int(v) for k, v in (("geslaagd", ok), ("mislukt", mis)) if v.strip().isdigit()}
if sam.strip(): uit["samenvatting"] = sam.strip()[:2000]
print(json.dumps(uit, ensure_ascii=False))
PY
)"
fi
if [ -z "$ZONDER_GIT" ]; then
  git archive --format=tar.gz --prefix="mijn-ruimte-$versie/" \
    --add-virtual-file="mijn-ruimte-$versie/UITROL-VERSIE:$versie" \
    --add-virtual-file="mijn-ruimte-$versie/BRON-COMMIT:$commit" \
    --add-virtual-file="mijn-ruimte-$versie/AUTEUR:$AUTEUR" \
    --add-virtual-file="mijn-ruimte-$versie/AGENT:$AGENT" \
    --add-virtual-file="mijn-ruimte-$versie/SAMENVATTING:$SAMENVATTING" \
    ${BASISTEKST:+--add-virtual-file="mijn-ruimte-$versie/UITROL-BASIS:$BASISTEKST"} \
    ${TESTJSON:+--add-virtual-file="mijn-ruimte-$versie/TESTRESULTATEN:$TESTJSON"} \
    ${MANIFESTJSON:+--add-virtual-file="mijn-ruimte-$versie/UITROL-MANIFEST.json:$MANIFESTJSON"} -o "$doel" HEAD
else
  # Buiten git: de werkmap zelf (zonder bouwresten), met dezelfde metadatabestanden en één bovenmap.
  stage="$(mktemp -d)"; mkdir -p "$stage/mijn-ruimte-$versie"
  tar -C . --exclude=./node_modules --exclude=./dist --exclude=./dist-server --exclude=./.git --exclude=./rapporten --exclude=./harness \
      --exclude='./harness-*' --exclude='*.bak' --exclude='./mijn-ruimte-*.tar.gz*' --exclude='./mijn-ruimte-*.voorstel.json' --exclude='./mijn-ruimte-*.txt' -cf - . | tar -C "$stage/mijn-ruimte-$versie" -xf -
  printf '%s' "$versie" > "$stage/mijn-ruimte-$versie/UITROL-VERSIE"; printf '%s' "$commit" > "$stage/mijn-ruimte-$versie/BRON-COMMIT"
  printf '%s' "$AUTEUR" > "$stage/mijn-ruimte-$versie/AUTEUR"; printf '%s' "$AGENT" > "$stage/mijn-ruimte-$versie/AGENT"; printf '%s' "$SAMENVATTING" > "$stage/mijn-ruimte-$versie/SAMENVATTING"
  [ -z "$BASISTEKST" ] || printf '%s\n' "$BASISTEKST" > "$stage/mijn-ruimte-$versie/UITROL-BASIS"
  [ -z "$TESTJSON" ] || printf '%s' "$TESTJSON" > "$stage/mijn-ruimte-$versie/TESTRESULTATEN"
  [ -z "$MANIFESTJSON" ] || printf '%s' "$MANIFESTJSON" > "$stage/mijn-ruimte-$versie/UITROL-MANIFEST.json"
  tar -C "$stage" -czf "$doel" "mijn-ruimte-$versie"; rm -rf -- "$stage"
fi
bytes="$(stat -c %s "$doel" 2>/dev/null || stat -f %z "$doel")"
sha="$(sha256sum "$doel" 2>/dev/null | sed 's/^\\//' | cut -d' ' -f1 || shasum -a 256 "$doel" | cut -d' ' -f1)"
if [ -n "$ZONDER_GIT" ]; then
  wijzigingen="- (buiten git: $ZONDER_GIT) $SAMENVATTING"; diff=""
elif git rev-parse --verify -q "$basis" >/dev/null; then
  wijzigingen="$(git log --no-merges --format='- %h %s' "$basis..HEAD" | head -c 7900)"
  diff="$(git diff --stat "$basis..HEAD" | tail -n 60 | head -c 7900)"
else
  wijzigingen="$(git log -1 --format='- %h %s')"; diff=""
fi
python3 - "$uit/mijn-ruimte-$versie.voorstel.json" "$versie" "$bytes" "$sha" "$commit" "$wijzigingen" "$diff" \
  "${TESTS_GESLAAGD:-}" "${TESTS_MISLUKT:-}" "${TESTS_SAMENVATTING:-}" "$AUTEUR" "$AGENT" "$SAMENVATTING" <<'PY'
import json, sys
pad, versie, n, sha, commit, wijz, diff, ok, mis, sam, auteur, agent, samenvatting = sys.argv[1:14]
tests = {k: int(v) for k, v in (("passed", ok), ("failed", mis)) if v.strip().isdigit()}
if sam.strip(): tests["summary"] = sam.strip()[:2000]
json.dump({"version": versie, "bytes": int(n), "sha256": sha, "commit": commit, "auteur": auteur, "agent": agent, "samenvatting": samenvatting, "changelog": wijz, "tests": tests, "diff_summary": diff},
          open(pad, "w"), ensure_ascii=False, indent=2)
PY
echo "klaar: $doel (+ .voorstel.json)  versie=$versie bytes=$bytes sha256=$sha"
echo "volgende stap: uitrol_voorstel_begin met de inhoud van mijn-ruimte-$versie.voorstel.json (vereist een grant «Кому дозволено»)."
