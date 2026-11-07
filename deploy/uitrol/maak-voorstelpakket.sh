#!/usr/bin/env bash
# Mijn Ruimte: maak een ONONDERTEKEND voorstelpakket voor de passkey-goedkeuring (RUNBOOK-VEILIGE-UITROL.md §13).
# Geen sleutel nodig: het pakket installeert niets tot de eigenaar het in Admin → «Оновлення» / «Updates» met zijn passkey goedkeurt.
# Gebruik: deploy/uitrol/maak-voorstelpakket.sh [--zonder-git "reden"] [uitvoermap] [basis-ref voor wijzigingen/diff, standaard origin/main]
#   optioneel: TESTS_GESLAAGD=<n> TESTS_MISLUKT=<n> TESTS_SAMENVATTING="..."  (uitkomst van de eigen testrun)
# Uitvoer: mijn-ruimte-<versie>.tar.gz en mijn-ruimte-<versie>.voorstel.json (precies de argumenten voor het MCP-hulpmiddel
#          uitrol_voorstel_begin: version, bytes, sha256, commit, changelog, tests, diff_summary). Uploaden: uitrol_voorstel_stuk
#          (base64-stukken van max. 512 KiB, offset = al ontvangen bytes) en daarna uitrol_voorstel_klaar.
set -euo pipefail
# UITGAVE-001: alle python3-aanroepen hieronder in UTF-8-modus (argv, stdin/stdout, open()), ook onder een niet-UTF-8-locale
# (Windows/Git Bash, ISO-8859-*). Anders faalt print() van Cyrillische JSON of wordt argv verkeerd gedecodeerd.
# Усі виклики python3 нижче — у режимі UTF-8 (argv, stdout, open()) навіть у не-UTF-8 локалі; інакше кирилиця ламає JSON.
export PYTHONUTF8=1

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
# Правило 2 (ПРАВИЛА-АДРЕС-І-ВИПУСКІВ.md): обовʼязкові метадані випуску. Без них машина відхилить архів.
# Якщо AUTEUR не передано або вказано загальну роль («Власник»/«Eigenaar»/«Owner»), автоматично підтягуємо обліковий запис із git/середовища.
AUTEUR="${AUTEUR:-}"; AGENT="${AGENT:-}"; SAMENVATTING="${SAMENVATTING:-}"
if [ -z "$AUTEUR" ] || [[ "${AUTEUR,,}" =~ ^(власник|eigenaar|owner|admin|administrator|адміністратор|user|користувач|gebruiker|автор|auteur|author)$ ]]; then
  GIT_NAAM="$(git config user.name 2>/dev/null || true)"
  GIT_EMAIL="$(git config user.email 2>/dev/null || true)"
  [[ "$GIT_EMAIL" == *"@users.noreply.github.com" ]] && GIT_EMAIL="${MR_CONTACT_EMAIL:-}"
  if [ -n "${MR_EIGENAAR_NAAM:-}" ] && [ -n "${MR_CONTACT_EMAIL:-}" ]; then AUTEUR="$MR_EIGENAAR_NAAM ($MR_CONTACT_EMAIL)"
  elif [ -n "$GIT_NAAM" ] && [ -n "$GIT_EMAIL" ]; then AUTEUR="$GIT_NAAM ($GIT_EMAIL)"
  elif [ -n "$GIT_NAAM" ]; then AUTEUR="$GIT_NAAM"
  elif [ -n "$GIT_EMAIL" ]; then AUTEUR="$GIT_EMAIL"
  fi
fi
[ -n "$AUTEUR" ] || { echo "FOUT: встановіть AUTEUR (імʼя та ел. пошта облікового запису автора випуску)" >&2; exit 1; }
[[ ! "${AUTEUR,,}" =~ ^(власник|eigenaar|owner|admin|administrator|адміністратор|user|користувач|gebruiker|автор|auteur|author)$ ]] || { echo "FOUT: псевдоніми на кшталт «$AUTEUR» заборонені — вкажіть справжнє імʼя або ел. пошту облікового запису" >&2; exit 1; }
[[ "$AGENT" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || { echo "FOUT: встановіть AGENT (claude/cursor/gpt/antigravity, малі літери)" >&2; exit 1; }
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
# TRACE-001: iedere toekomstige uitgave moet een gecommit dossier + exacte GitHub Release verwijzen.
# Ontbrekend? Stop al bij het bouwen, zodat de site geen misleidend pakket krijgt.
ARCHIEFJSON=""
if [[ ! "$versie" < "20261103-211555" ]]; then
  [ -z "$ZONDER_GIT" ] || { echo "FOUT GEEN_ONTWIKKELARCHIEF: toekomstige pakketten zijn alleen vanuit git toegestaan" >&2; exit 1; }
  [ -n "${ONTWIKKELARCHIEF_BESTAND:-}" ] && [ -f "$ONTWIKKELARCHIEF_BESTAND" ] || { echo "FOUT GEEN_ONTWIKKELARCHIEF: ontbrekend ONTWIKKELARCHIEF_BESTAND (orch pakket maakt dit zelf)" >&2; exit 1; }
  ARCHIEFJSON="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); print(json.dumps(d,ensure_ascii=False,separators=(",",":")))' "$ONTWIKKELARCHIEF_BESTAND" | tr -d '\r')" \
    || { echo "FOUT ONTWIKKELARCHIEF_ONGELDIG: geen JSON" >&2; exit 1; }
fi
# TESTRESULTATEN gaat mee in het pakket (JSON {geslaagd, mislukt, samenvatting}): dan toont de voorcontrole «tests» ook bij een
# upload van het losse .tar.gz via de wizard of SSH, niet alleen via de MCP-weg met het .voorstel.json.
TESTJSON=""
# UI-010: TESTRESULTATEN_BESTAND=<pad> = volledig formaat 2 (falend[] met ookOpBasis, basis{}, uitleg{uk,nl}); gaat vóór de losse getallen.
if [ -n "${TESTRESULTATEN_BESTAND:-}" ]; then
  TESTJSON="$(python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1],encoding="utf-8")),ensure_ascii=False,separators=(",",":")))' "$TESTRESULTATEN_BESTAND" | tr -d '\r')" || { echo "FOUT: TESTRESULTATEN_BESTAND is geen geldige JSON" >&2; exit 1; }
elif [ -n "${TESTS_GESLAAGD:-}${TESTS_MISLUKT:-}${TESTS_SAMENVATTING:-}" ]; then
  TESTJSON="$(python3 - "${TESTS_GESLAAGD:-}" "${TESTS_MISLUKT:-}" "${TESTS_SAMENVATTING:-}" <<'PY'
import json, os, sys
ok, mis, sam = sys.argv[1:4]
sam = os.fsencode(sam).decode("utf-8", "replace")  # UITGAVE-001: geen los surrogaat naar stdout / без сурогатів
uit = {k: int(v) for k, v in (("geslaagd", ok), ("mislukt", mis)) if v.strip().isdigit()}
if sam.strip(): uit["samenvatting"] = sam.strip()[:2000]
print(json.dumps(uit, ensure_ascii=False))
PY
)"
fi
if [ -z "$ZONDER_GIT" ]; then
  git -c core.autocrlf=false archive --format=tar.gz --prefix="mijn-ruimte-$versie/" \
    --add-virtual-file="mijn-ruimte-$versie/UITROL-VERSIE:$versie" \
    --add-virtual-file="mijn-ruimte-$versie/BRON-COMMIT:$commit" \
    --add-virtual-file="mijn-ruimte-$versie/AUTEUR:$AUTEUR" \
    --add-virtual-file="mijn-ruimte-$versie/AGENT:$AGENT" \
    --add-virtual-file="mijn-ruimte-$versie/SAMENVATTING:$SAMENVATTING" \
    ${BASISTEKST:+--add-virtual-file="mijn-ruimte-$versie/UITROL-BASIS:$BASISTEKST"} \
    ${TESTJSON:+--add-virtual-file="mijn-ruimte-$versie/TESTRESULTATEN:$TESTJSON"} \
    ${MANIFESTJSON:+--add-virtual-file="mijn-ruimte-$versie/UITROL-MANIFEST.json:$MANIFESTJSON"} \
    ${ARCHIEFJSON:+--add-virtual-file="mijn-ruimte-$versie/ONTWIKKELARCHIEF.json:$ARCHIEFJSON"} -o "$doel" HEAD
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
  [ -z "$ARCHIEFJSON" ] || printf '%s' "$ARCHIEFJSON" > "$stage/mijn-ruimte-$versie/ONTWIKKELARCHIEF.json"
  tar -C "$stage" -czf "$doel" "mijn-ruimte-$versie"; rm -rf -- "$stage"
fi
bytes="$(stat -c %s "$doel" 2>/dev/null || stat -f %z "$doel")"
sha="$(sha256sum "$doel" 2>/dev/null | sed 's/^\\//' | cut -d' ' -f1 || shasum -a 256 "$doel" | cut -d' ' -f1)"
if [ -n "$ZONDER_GIT" ]; then
  wijzigingen="- (buiten git: $ZONDER_GIT) $SAMENVATTING"; diff=""
elif git rev-parse --verify -q "$basis" >/dev/null; then
  # UITGAVE-001: 7901 bytes = grens + 1, zodat Python ziet dát er geknipt is; het knippen zelf (heel teken, hele regel) gebeurt
  # hieronder in Python. De schildwacht «x» houdt de uitvoer exact: $(...) zou afsluitende regeleinden weghalen, en viel de grens
  # precies op een \n, dan leek een afgeknipte lijst compleet. diff --stat: 61 regels, zodat Python ziet dat er meer dan 60 waren.
  # 7901 байт = межа + 1; сентинел «x» зберігає вивід точно ($(...) зрізав би кінцевий \n, і обрізаний список виглядав би повним).
  wijzigingen="$( { git log --no-merges --format='- %h %s' "$basis..HEAD" | head -c 7901 || true; }; printf x)"; wijzigingen="${wijzigingen%x}"
  diff="$( { git diff --stat "$basis..HEAD" | tail -n 61 || true; }; printf x)"; diff="${diff%x}"
else
  wijzigingen="$(git log -1 --format='- %h %s')"; diff=""
fi
python3 - "$uit/mijn-ruimte-$versie.voorstel.json" "$versie" "$bytes" "$sha" "$commit" "$wijzigingen" "$diff" \
  "${TESTS_GESLAAGD:-}" "${TESTS_MISLUKT:-}" "${TESTS_SAMENVATTING:-}" "$AUTEUR" "$AGENT" "$SAMENVATTING" <<'PY'
import json, os, sys
pad, versie, n, sha, commit, wijz, diff, ok, mis, sam, auteur, agent, samenvatting = sys.argv[1:14]
# UITGAVE-001 (06.11.2026): `head -c` knipt bytes, geen tekens. Viel de grens midden in een Cyrillisch teken (git log van een
# echte release: 11 430 bytes), dan kwam er een los surrogaat in argv en faalde json.dump (UnicodeEncodeError →
# PAKKET_BOUW_MISLUKT, geen pakket). Nu: onvolledige tekens vallen weg en een afgeknipte lijst eindigt op een hele regel + «- …».
# `head -c` ріже байти, а не символи: межа посеред кириличного символу давала сурогат в argv, і json.dump падав. Тепер неповні
# символи відкидаються, а обрізаний список закінчується цілим рядком і «- …».
# os.fsencode = precies de omkering van hoe Python argv decodeerde; ongeldige bytes worden overal U+FFFD (niet stil weggelaten).
# os.fsencode — точна обернена дія до декодування argv; невалідні байти скрізь стають U+FFFD, а не зникають мовчки.
GRENS = 7900
def schoon(tekst):
    return os.fsencode(tekst).decode("utf-8", "replace")
def heel_teken(ruw, k):
    # terug naar het begin van een UTF-8-teken (vervolgbytes zijn 10xxxxxx) / назад до початку UTF-8-символу
    while k > 0 and (ruw[k] & 0xC0) == 0x80:
        k -= 1
    return ruw[:k]
def knip(tekst):
    ruw = os.fsencode(tekst)
    if len(ruw) <= GRENS:
        return ruw.decode("utf-8", "replace").rstrip("\n")
    eind = ruw.rfind(b"\n", 0, GRENS + 1)   # een \n op positie GRENS sluit nog een hele regel af / цілий рядок
    deel = ruw[:eind] if eind > 0 else heel_teken(ruw, GRENS)
    return deel.decode("utf-8", "replace") + "\n- …"
def knip_staart(tekst):
    # diff --stat: de laatste regel («N files changed …») is de kern; afknippen gebeurt vooraan, gemarkeerd met «…».
    # diff --stat: останній рядок-підсумок лишається; обрізання — з початку, з позначкою «…».
    regels = os.fsencode(tekst).decode("utf-8", "replace").rstrip("\n").split("\n")
    afgeknipt = len(regels) > 60
    regels = regels[-60:]
    while len(regels) > 1 and len(("…\n" + "\n".join(regels)).encode("utf-8")) > GRENS:
        regels.pop(0); afgeknipt = True
    tekst = "\n".join(regels)
    if len(tekst.encode("utf-8")) > GRENS:   # één reuzenregel / один дуже довгий рядок
        tekst = heel_teken(tekst.encode("utf-8"), GRENS - 4).decode("utf-8"); afgeknipt = True
    return ("…\n" + tekst) if afgeknipt and tekst else tekst
wijz, diff = knip(wijz), knip_staart(diff)
commit, sam, auteur, agent, samenvatting = schoon(commit), schoon(sam), schoon(auteur), schoon(agent), schoon(samenvatting)
tests = {k: int(v) for k, v in (("passed", ok), ("failed", mis)) if v.strip().isdigit()}
if sam.strip(): tests["summary"] = sam.strip()[:2000]
json.dump({"version": versie, "bytes": int(n), "sha256": sha, "commit": commit, "auteur": auteur, "agent": agent, "samenvatting": samenvatting, "changelog": wijz, "tests": tests, "diff_summary": diff},
          open(pad, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
echo "klaar: $doel (+ .voorstel.json)  versie=$versie bytes=$bytes sha256=$sha"
echo "volgende stap: uitrol_voorstel_begin met de inhoud van mijn-ruimte-$versie.voorstel.json (vereist een grant «Кому дозволено»)."
