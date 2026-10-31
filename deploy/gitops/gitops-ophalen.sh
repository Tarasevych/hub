#!/usr/bin/env bash
# gitops-ophalen.sh — methode 1 (GitOps-pull): ondertekende uitrol-tags uit GitHub ophalen en installeren.
# Geïnstalleerd als /usr/local/sbin/mijn-ruimte-gitops (root:root 0755), elke 5 minuten gestart door mijn-ruimte-gitops.timer.
#
# Wat dit script vertrouwt (en niets anders):
#   - /etc/mijn-ruimte/mcp-rechten.json     schakelaar "gitops": true|false (root-eigendom; standaard uit)
#   - /etc/mijn-ruimte/gitops.env           GITOPS_REPO + ALLEEN-LEZEN-toegang: GITOPS_SSH_SLEUTEL (deploy key) of GITOPS_TOKEN
#                                           (fine-grained, alleen "Contents: read"); root 0600. Nooit het persoonlijke token van de eigenaar.
#   - /etc/mijn-ruimte/uitrol-ondertekenaars dezelfde ed25519-sleutel als methode 2 (regel met namespaces="mijn-ruimte-uitrol,git")
#   - /var/lib/mijn-ruimte/gitops/          eigen root-map (0700): spiegel, staat, werkmap
# Het leest NIETS wat de app (gebruiker mijnruimte) kan schrijven: geen uploads, geen inbox, geen staging.
#
# Stappen:
#   1. git fetch van alleen refs/tags/uitrol-* in een kale spiegel (hooks uit, fsck aan, alleen https/ssh).
#   2. Kandidaten: tags uitrol-JJJJMMDD-UUMM (UTC) die NIEUWER zijn dan de laatst geïnstalleerde; nieuwste eerst.
#   3. Per kandidaat: geannoteerde tag, de naam IN het ondertekende tag-object moet gelijk zijn aan de ref (geen oude tag onder een
#      nieuwe naam), doel is een commit, en `git verify-tag` met gpg.format=ssh en het ondertekenaarsbestand moet
#      'Good "git" signature for uitrol@mijn-ruimte' geven. Anders: één keer melden (audit) en negeren.
#   4. `git archive` van precies die commit → uitpakken in de root-werkmap met het tarfile-'data'-filter; alleen gewone
#      bestanden en mappen (geen symlinks, geen paden buiten de map).
#   5. installeer-app.sh installeren <bron> uit die gecontroleerde bron. Mislukt dat, dan blijft de huidige release actief
#      (installeer-app.sh draait automatisch terug) en wordt deze tag niet opnieuw geprobeerd.
# Meldingen (Oekraïens + Nederlands) gaan naar /var/lib/mijn-ruimte-uitrol-status/gitops.json en gebeurtenissen.jsonl
# (root:mijnruimte 0640); de app neemt die op in de audit. Het journal is Nederlands.
set -euo pipefail
umask 077
export LC_ALL=C

# Pad-overrides alleen in tests (niet als root).
if [ "$(id -u)" -eq 0 ]; then
  unset GITOPS_RECHTEN GITOPS_ENV GITOPS_ONDERTEKENAARS GITOPS_STAAT GITOPS_STATUS_DIR GITOPS_INSTALLEER GITOPS_LOCK GITOPS_GROEP \
        GITOPS_KNOWN_HOSTS GITOPS_MAX_BYTES GITOPS_INSTALLEER_LOCK 2>/dev/null || true
fi
RECHTEN="${GITOPS_RECHTEN:-/etc/mijn-ruimte/mcp-rechten.json}"
ENVBESTAND="${GITOPS_ENV:-/etc/mijn-ruimte/gitops.env}"
ONDERTEKENAARS="${GITOPS_ONDERTEKENAARS:-/etc/mijn-ruimte/uitrol-ondertekenaars}"
KNOWN_HOSTS="${GITOPS_KNOWN_HOSTS:-/etc/mijn-ruimte/gitops-known_hosts}"
STAAT="${GITOPS_STAAT:-/var/lib/mijn-ruimte/gitops}"
STATUS_DIR="${GITOPS_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
INSTALLEER="${GITOPS_INSTALLEER:-}"          # leeg = deploy/installeer-app.sh uit de gecontroleerde bron
LOCK="${GITOPS_LOCK:-/run/lock/mijn-ruimte-gitops.lock}"
GROEP="${GITOPS_GROEP:-mijnruimte}"
MAX_BYTES="${GITOPS_MAX_BYTES:-314572800}"
INSTALLEER_LOCK="${GITOPS_INSTALLEER_LOCK:-/run/lock/mijn-ruimte-installeer.lock}"
IDENTITEIT="uitrol@mijn-ruimte"
TAGPATROON='^uitrol-[0-9]{8}-[0-9]{4}$'
SPIEGEL="$STAAT/spiegel.git"
IS_ROOT=0; [ "$(id -u)" -eq 0 ] && IS_ROOT=1

# Schone omgeving voor git/ssh: geen gebruikersconfig, geen prompts.
export HOME="$STAAT" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false SSH_ASKPASS=/bin/false
unset GIT_DIR GIT_WORK_TREE GIT_SSH GIT_SSH_COMMAND GIT_CONFIG_COUNT GIT_EXEC_PATH GIT_TEMPLATE_DIR SSH_AUTH_SOCK 2>/dev/null || true

log() { echo "[gitops] $*" >&2; }
mkdir -p "$STAAT" "$STATUS_DIR"
chmod 0700 "$STAAT"

status() { # status <staat> <code> <uk> <nl> [tag]
  local tmp; tmp="$(mktemp "$STATUS_DIR/.gitops.XXXXXX")"
  python3 - "$tmp" "$1" "$2" "$3" "$4" "${5:-}" <<'PY'
import json, sys, datetime
path, staat, code, uk, nl, tag = sys.argv[1:7]
json.dump({"staat": staat, "code": code, "uk": uk, "nl": nl, "tag": tag,
           "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat()}, open(path, "w"), ensure_ascii=False)
PY
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATUS_DIR/gitops.json"
}

# Veilig auditkanaal: root schrijft, de app leest alleen (zie backend/root-gebeurtenissen.ts).
gebeurtenis() { # gebeurtenis <code> <niveau> <uk> <nl> [tag]
  (
    flock 7
    tmp="$(mktemp "$STATUS_DIR/.gebeurtenis.XXXXXX")"
    python3 - "$STATUS_DIR/gebeurtenissen.jsonl" "$tmp" gitops "$1" "$2" "$3" "$4" "${5:-}" <<'PY'
import json, sys, datetime, secrets
pad, tmp, bron, code, niveau, uk, nl, tag = sys.argv[1:9]
nu = datetime.datetime.now(datetime.timezone.utc)
regel = json.dumps({"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(), "bron": bron,
                    "code": code, "niveau": niveau, "uk": uk, "nl": nl, "tag": tag}, ensure_ascii=False)
try:
    oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
except FileNotFoundError:
    oud = []
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(oud + [regel]) + "\n")
PY
    chgrp "$GROEP" "$tmp" 2>/dev/null || true
    chmod 0640 "$tmp"
    mv -f "$tmp" "$STATUS_DIR/gebeurtenissen.jsonl"
  ) 7>"$STATUS_DIR/.gebeurtenissen.lock"
}

# Root-bestand mag alleen van root zijn en niet schrijfbaar voor groep/anderen (als root gecontroleerd).
root_bestand() { # root_bestand <pad> [geheim]
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  [ "$IS_ROOT" -eq 1 ] || return 0
  local eigenaar modus; read -r eigenaar modus < <(stat -c '%u %a' "$1")
  [ "$eigenaar" = 0 ] || return 1
  (( (8#$modus & 8#022) == 0 )) || return 1
  if [ "${2:-}" = geheim ]; then (( (8#$modus & 8#077) == 0 )) || return 1; fi
  return 0
}

# ---- 0. schakelaar ----
aan="$(python3 - "$RECHTEN" <<'PY' 2>/dev/null || echo uit
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("uit"); sys.exit(0)
print("aan" if d.get("gitops") is True else "uit")
PY
)"
if ! root_bestand "$RECHTEN"; then aan=uit; fi
if [ "$aan" != aan ]; then log "GitOps staat uit (\"gitops\": true in $RECHTEN zet het aan)"; status uit UIT "GitOps вимкнено." "GitOps staat uit."; exit 0; fi

exec 8>"$LOCK"
flock -n 8 || { log "er loopt al een GitOps-ronde"; exit 0; }

if ! root_bestand "$ONDERTEKENAARS"; then
  status geweigerd GEEN_SLEUTEL "На сервері немає (надійного) публічного ключа випуску." "Er staat geen (betrouwbare) publieke uitrolsleutel op de server."
  log "ondertekenaarsbestand ontbreekt of heeft verkeerde rechten: $ONDERTEKENAARS"; exit 0
fi

# ---- 1. toegang (alleen lezen) uit gitops.env: geen shell-`source`, alleen bekende sleutels ----
REPO=""; SSH_SLEUTEL=""; TOKEN=""
if root_bestand "$ENVBESTAND" geheim; then
  while IFS= read -r regel || [ -n "$regel" ]; do
    regel="${regel%$'\r'}"
    [[ "$regel" =~ ^[[:space:]]*(#|$) ]] && continue
    if [[ "$regel" =~ ^(GITOPS_REPO|GITOPS_SSH_SLEUTEL|GITOPS_TOKEN)=(.*)$ ]]; then
      waarde="${BASH_REMATCH[2]}"; waarde="${waarde#\"}"; waarde="${waarde%\"}"
      case "${BASH_REMATCH[1]}" in
        GITOPS_REPO) REPO="$waarde" ;;
        GITOPS_SSH_SLEUTEL) SSH_SLEUTEL="$waarde" ;;
        GITOPS_TOKEN) TOKEN="$waarde" ;;
      esac
    fi
  done < "$ENVBESTAND"
elif [ -e "$ENVBESTAND" ]; then
  status geweigerd ENV_RECHTEN "gitops.env має бути лише для root (0600)." "gitops.env moet alleen voor root zijn (0600)."
  log "$ENVBESTAND heeft verkeerde eigenaar/rechten"; exit 0
fi
if [ -z "$REPO" ]; then
  if [ -n "$TOKEN" ]; then REPO="https://github.com/Tarasevych/hub.git"; else REPO="git@github.com:Tarasevych/hub.git"; fi
fi
PROTO_FILE=never
if [[ "$REPO" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || [[ "$REPO" =~ ^(ssh://)?git@github\.com[:/][A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  :
elif [ "$IS_ROOT" -eq 0 ] && [[ "$REPO" == /* ]]; then
  PROTO_FILE=always   # alleen in tests: lokale bron
else
  status geweigerd REPO_ONGELDIG "Неприпустима адреса репозиторію в gitops.env." "Ongeldig repositoryadres in gitops.env."; log "GITOPS_REPO niet toegestaan: $REPO"; exit 0
fi
export GIT_CONFIG_COUNT=0
if [ -n "$TOKEN" ]; then
  [[ "$TOKEN" =~ ^[A-Za-z0-9_]{20,255}$ ]] || { status geweigerd TOKEN_ONGELDIG "Неправильний формат токена." "Het token heeft een onjuiste vorm."; exit 0; }
  # Via de omgeving (niet zichtbaar in `ps`), alleen voor github.com.
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraHeader"
  GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"; export GIT_CONFIG_VALUE_0
fi
if [ -n "$SSH_SLEUTEL" ]; then
  root_bestand "$SSH_SLEUTEL" geheim || { status geweigerd SLEUTEL_RECHTEN "Ключ доступу (deploy key) має бути лише для root." "De deploy key moet alleen voor root zijn."; exit 0; }
  root_bestand "$KNOWN_HOSTS" || { status geweigerd KNOWN_HOSTS "Немає gitops-known_hosts." "gitops-known_hosts ontbreekt."; exit 0; }
  export GIT_SSH_COMMAND="ssh -i $SSH_SLEUTEL -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o GlobalKnownHostsFile=/dev/null -F /dev/null"
fi

G_OPTS=( -c core.hooksPath=/dev/null -c core.fsmonitor=false -c transfer.fsckObjects=true -c fetch.fsckObjects=true -c gc.auto=0
         -c protocol.allow=never -c protocol.https.allow=always -c protocol.ssh.allow=always -c protocol.file.allow="$PROTO_FILE"
         -c safe.directory="$SPIEGEL" -c gpg.program=/bin/false -c gpg.x509.program=/bin/false --git-dir="$SPIEGEL" )
g() { git "${G_OPTS[@]}" "$@"; }

if [ ! -d "$SPIEGEL" ]; then git init --quiet --bare "$SPIEGEL"; fi
if ! timeout 300 git "${G_OPTS[@]}" fetch --quiet --prune --no-tags --no-write-fetch-head "$REPO" '+refs/tags/uitrol-*:refs/tags/uitrol-*' 2>"$STAAT/fetch.log"; then
  status mislukt OPHALEN_MISLUKT "Не вдалося отримати теги з GitHub." "Ophalen van de tags uit GitHub mislukt."
  log "fetch mislukt: $(tail -c 300 "$STAAT/fetch.log" | tr '\n' ' ')"; exit 1
fi

# ---- 2. kandidaten ----
touch "$STAAT/geweigerd" "$STAAT/mislukt"
LAATSTE="$(head -c 64 "$STAAT/laatste-tag" 2>/dev/null | tr -d '\r\n[:space:]' || true)"
[[ "$LAATSTE" =~ $TAGPATROON ]] || LAATSTE="uitrol-00000000-0000"
mapfile -t TAGS < <(g for-each-ref --format='%(refname:strip=2)' 'refs/tags/uitrol-*' | grep -E "$TAGPATROON" | LC_ALL=C sort -r || true)

weiger_tag() { # weiger_tag <tag> <object> <code> <uk> <nl>
  log "tag $1 GEWEIGERD: $3 — $5"
  if ! grep -qx "$2 $1" "$STAAT/geweigerd"; then
    echo "$2 $1" >> "$STAAT/geweigerd"
    gebeurtenis "$3" waarschuwing "$4" "$5" "$1"
  fi
}

controleer() { # controleer <tag>  → zet COMMIT bij succes
  local tag="$1" obj type kop naam doeltype verify
  obj="$(g rev-parse --verify --quiet "refs/tags/$tag")" || return 1
  grep -qx "$obj $tag" "$STAAT/geweigerd" && { log "tag $tag eerder geweigerd ($obj)"; return 1; }
  grep -qx "$obj $tag" "$STAAT/mislukt" && { log "tag $tag eerder mislukt bij installeren ($obj)"; return 1; }
  type="$(g cat-file -t "$obj")"
  if [ "$type" != tag ]; then weiger_tag "$tag" "$obj" NIET_ONDERTEKEND "Тег $tag без підпису (легкий тег)." "Tag $tag is niet ondertekend (lichtgewicht tag)."; return 1; fi
  kop="$(g cat-file tag "$obj" | sed '/^$/q')"
  naam="$(printf '%s\n' "$kop" | sed -n 's/^tag //p' | head -n1)"
  doeltype="$(printf '%s\n' "$kop" | sed -n 's/^type //p' | head -n1)"
  COMMIT="$(printf '%s\n' "$kop" | sed -n 's/^object //p' | head -n1)"
  if [ "$naam" != "$tag" ]; then weiger_tag "$tag" "$obj" NAAM_VERSCHILT "Назва в підписаному тезі ($naam) не збігається з $tag." "De naam in de ondertekende tag ($naam) wijkt af van $tag."; return 1; fi
  if [ "$doeltype" != commit ] || ! [[ "$COMMIT" =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]]; then weiger_tag "$tag" "$obj" GEEN_COMMIT "Тег $tag не вказує на коміт." "Tag $tag wijst niet naar een commit."; return 1; fi
  if ! verify="$(g -c gpg.format=ssh -c gpg.ssh.allowedSignersFile="$ONDERTEKENAARS" -c gpg.ssh.program=ssh-keygen verify-tag --raw "$obj" 2>&1)" \
     || ! printf '%s\n' "$verify" | grep -q "^Good \"git\" signature for $IDENTITEIT with "; then
    weiger_tag "$tag" "$obj" HANDTEKENING_ONGELDIG "Тег $tag не підписано ключем випуску." "Tag $tag is niet met de uitrolsleutel ondertekend."
    log "verify-tag: $(printf '%s' "$verify" | tail -c 300 | tr '\n' ' ')"
    return 1
  fi
  return 0
}

KIES=""; COMMIT=""
for t in "${TAGS[@]}"; do
  [[ "$t" > "$LAATSTE" ]] || break
  if controleer "$t"; then KIES="$t"; break; fi
done
if [ -z "$KIES" ]; then
  log "geen nieuwe ondertekende tag (geïnstalleerd: $LAATSTE)"
  status klaar GEEN_NIEUWE "Нового підписаного тегу немає ($LAATSTE)." "Geen nieuwe ondertekende tag ($LAATSTE)." "$LAATSTE"
  exit 0
fi
log "handtekening geldig: $KIES → $COMMIT"
OBJ="$(g rev-parse "refs/tags/$KIES")"

# ---- 3. exporteren naar de eigen root-werkmap ----
mkdir -p "$STAAT/werk"; chmod 0700 "$STAAT/werk"
WERK="$(mktemp -d "$STAAT/werk/bron.XXXXXX")"
trap 'rm -rf -- "$WERK"' EXIT
status bezig EXPORT "Готую випуск $KIES." "Release $KIES wordt klaargezet." "$KIES"
g archive --format=tar --prefix=bron/ "$COMMIT" > "$WERK/bron.tar"
[ "$(stat -c %s "$WERK/bron.tar")" -le "$MAX_BYTES" ] || { weiger_tag "$KIES" "$OBJ" TE_GROOT "Випуск завеликий." "De release is te groot."; status geweigerd TE_GROOT "Випуск завеликий." "De release is te groot." "$KIES"; exit 2; }
mkdir "$WERK/uit"
if ! python3 - "$WERK/bron.tar" "$WERK/uit" "$MAX_BYTES" > "$WERK/tar.log" 2>&1 <<'PY'
import sys, tarfile
pakket, doel, maxb = sys.argv[1], sys.argv[2], int(sys.argv[3])
totaal = 0
with tarfile.open(pakket, "r:") as tf:
    leden = [m for m in tf.getmembers() if m.name != "pax_global_header" and m.type != tarfile.XGLTYPE]
    for m in leden:
        naam = m.name
        delen = [d for d in naam.split("/") if d not in ("", ".")]
        if naam.startswith("/") or ".." in delen or "\\" in naam or "\n" in naam or not (delen and delen[0] == "bron"):
            sys.exit(f"onveilig pad: {naam!r}")
        if not (m.isfile() or m.isdir()):
            sys.exit(f"geen gewoon bestand of map: {naam!r}")
        totaal += m.size
        if totaal > maxb * 4:
            sys.exit("uitgepakt te groot")
    tf.extractall(doel, members=leden, filter="data")
PY
then
  weiger_tag "$KIES" "$OBJ" INHOUD_ONVEILIG "Випуск містить недозволені елементи (посилання тощо)." "De release bevat niet-toegestane onderdelen (links e.d.): $(tail -c 200 "$WERK/tar.log" | tr '\n' ' ')"
  status geweigerd INHOUD_ONVEILIG "Випуск містить недозволені елементи." "De release bevat niet-toegestane onderdelen." "$KIES"
  exit 2
fi
BRON="$WERK/uit/bron"
[ -f "$BRON/deploy/installeer-app.sh" ] || { weiger_tag "$KIES" "$OBJ" GEEN_INSTALLER "У випуску немає deploy/installeer-app.sh." "deploy/installeer-app.sh ontbreekt in de release."; status geweigerd GEEN_INSTALLER "Немає інсталятора." "Installer ontbreekt." "$KIES"; exit 2; }
# ORCH-001 (31.10.2026): GitOps is de AUTOMATISCHE modus. Die mag alleen als orchestratie/beleid.json in de bron «automatisch_beperkt» toestaat
# én de eigenaar de kritieke regels heeft ondertekend (orchestratie/regels.lock.json → eigenaar). Zonder orchestratie/ (oudere bron) geldt
# alleen de schakelaar "gitops" zoals voorheen.
if [ -f "$BRON/orchestratie/beleid.json" ]; then
  MODUS_FOUT="$(python3 - "$BRON" 2>&1 <<'PYMODUS'
import json, os, sys
bron = sys.argv[1]
b = json.load(open(os.path.join(bron, "orchestratie/beleid.json"), encoding="utf-8"))
modi = (b.get("kritiek") or {}).get("installatieModi") or {}
if "automatisch_beperkt" not in (modi.get("toegestaan") or []):
    sys.exit("automatisch_beperkt staat niet in kritiek.installatieModi.toegestaan")
try:
    lock = json.load(open(os.path.join(bron, "orchestratie/regels.lock.json"), encoding="utf-8"))
except Exception as e:
    sys.exit(f"regels.lock.json ontbreekt of onleesbaar: {e}")
e = lock.get("eigenaar") or {}
if not e.get("handtekening") or e.get("kritiekHash") != lock.get("kritiekHash"):
    sys.exit("kritieke regels zijn niet (meer) door de eigenaar ondertekend")
PYMODUS
)" || { weiger_tag "$KIES" "$OBJ" MODUS_NIET_TOEGESTAAN "Автоматичне встановлення (GitOps) не дозволене політикою цього випуску: $MODUS_FOUT." "Automatisch installeren (GitOps) is niet toegestaan door het beleid van deze release: $MODUS_FOUT."; status geweigerd MODUS_NIET_TOEGESTAAN "Автоматичний режим не дозволений політикою." "Automatische modus niet toegestaan door het beleid." "$KIES"; exit 2; }
fi
printf '%s\n' "$COMMIT" > "$BRON/BRON-COMMIT"
printf '%s\n' "$KIES" > "$BRON/UITROL-TAG"

# ---- 4. installeren (alleen code uit de ondertekende tag) ----
status bezig INSTALLEREN "Встановлюю випуск $KIES." "Release $KIES wordt geïnstalleerd." "$KIES"
gebeurtenis INSTALLEREN info "Встановлюю підписаний тег $KIES." "Ondertekende tag $KIES wordt geïnstalleerd." "$KIES"
export MIJN_RUIMTE_UITROL_MODUS=gitops
if [ -n "$INSTALLEER" ]; then cmd=( "$INSTALLEER" installeren "$BRON" ); else cmd=( bash "$BRON/deploy/installeer-app.sh" installeren "$BRON" ); fi
# Loopt er al een installatie (methode 2 of handmatig), dan eerst wachten; die ronde telt dan niet als mislukt.
flock -w 2700 "$INSTALLEER_LOCK" true 2>/dev/null || true
if "${cmd[@]}" > "$WERK/installeer.log" 2>&1; then
  printf '%s\n' "$KIES" > "$STAAT/laatste-tag"
  status klaar OK "Випуск $KIES встановлено." "Release $KIES is geïnstalleerd." "$KIES"
  gebeurtenis OK info "Випуск $KIES встановлено (GitOps)." "Release $KIES is geïnstalleerd (GitOps)." "$KIES"
  log "klaar: $KIES"
else
  tail -n 40 "$WERK/installeer.log" >&2 || true
  if grep -q 'er loopt al een installatie' "$WERK/installeer.log"; then
    status bezig WACHT "Триває інше встановлення; спробую пізніше." "Er loopt al een installatie; later opnieuw." "$KIES"
    exit 0
  fi
  echo "$OBJ $KIES" >> "$STAAT/mislukt"
  status mislukt INSTALLATIE_MISLUKT "Встановлення не вдалося; попередній випуск лишився активним." "Installeren mislukt; de vorige release blijft actief." "$KIES"
  gebeurtenis INSTALLATIE_MISLUKT fout "Встановлення $KIES не вдалося; попередній випуск лишився активним." "Installeren van $KIES mislukt; de vorige release blijft actief." "$KIES"
  exit 1
fi
