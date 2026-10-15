#!/usr/bin/env bash
# Mijn Ruimte: maak een ONONDERTEKEND voorstelpakket voor de passkey-goedkeuring (RUNBOOK-VEILIGE-UITROL.md §13).
# Geen sleutel nodig: het pakket installeert niets tot de eigenaar het in Admin → «Оновлення» / «Updates» met zijn passkey goedkeurt.
# Gebruik: deploy/uitrol/maak-voorstelpakket.sh [uitvoermap] [basis-ref voor wijzigingen/diff, standaard origin/main]
#   optioneel: TESTS_GESLAAGD=<n> TESTS_MISLUKT=<n> TESTS_SAMENVATTING="..."  (uitkomst van de eigen testrun)
# Uitvoer: mijn-ruimte-<versie>.tar.gz en mijn-ruimte-<versie>.voorstel.json (precies de argumenten voor het MCP-hulpmiddel
#          uitrol_voorstel_begin: version, bytes, sha256, commit, changelog, tests, diff_summary). Uploaden: uitrol_voorstel_stuk
#          (base64-stukken van max. 512 KiB, offset = al ontvangen bytes) en daarna uitrol_voorstel_klaar.
set -euo pipefail
uit="${1:-$PWD}"
basis="${2:-origin/main}"
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
bytes="$(stat -c %s "$doel" 2>/dev/null || stat -f %z "$doel")"
sha="$(sha256sum "$doel" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$doel" | cut -d' ' -f1)"
if git rev-parse --verify -q "$basis" >/dev/null; then
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
