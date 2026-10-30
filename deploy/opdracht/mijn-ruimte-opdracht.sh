#!/bin/bash
# mijn-ruimte-opdracht.sh — methode 3 (gepantserde opdracht): een VASTE lijst beheeropdrachten die de app als root mag laten doen.
# Geïnstalleerd als /usr/local/sbin/mijn-ruimte-opdracht (root:root 0755). Alleen gestart door de systemd-unit
# mijn-ruimte-opdracht@<werkwoord>.service; de polkit-regel 50-mijn-ruimte-opdracht.rules laat de gebruiker mijnruimte
# precies die vijf units starten (en niets anders). De app houdt NoNewPrivileges=yes: er is geen sudo en geen setuid.
#
# Regels:
#   - precies één argument, uit de vaste lijst: status | releases | backup | uitrol-nu | terugdraaien. Anders: weigeren (64).
#   - geen andere invoer: geen omgeving (alles wordt gewist), geen stdin, en het leest GEEN bestand of map die de app kan schrijven.
#     Alleen root-bestanden: /etc/mijn-ruimte/mcp-rechten.json (schakelaars), /srv/mijn-ruimte/{current,VORIGE,releases},
#     /var/lib/mijn-ruimte-uitrol{,-status}, /var/lib/mijn-ruimte/{gitops,opdracht}.
#   - elk werkwoord heeft een schakelaar in mcp-rechten.json → "opdracht": {"status": true, ...}; ontbreekt die, dan geldt de standaard
#     (status/releases/backup/uitrol-nu aan, terugdraaien UIT).
#   - uitrol-nu start alleen mijn-ruimte-gitops.service, mijn-ruimte-uitrol.service en mijn-ruimte-goedkeuring.service (die installeren
#     uitsluitend ONDERTEKENDE of met de passkey van de eigenaar GOEDGEKEURDE code; root controleert dat zelf).
#   - terugdraaien roept de root-kopie /usr/local/sbin/mijn-ruimte-installeer terugdraaien aan (nooit iets uit /srv/…/deploy),
#     hooguit één keer per 10 minuten (root-stempel), en wordt gemeld in de audit.
#   - backup start mijn-ruimte-backup.service (die draait als mijnruimte, niet als root).
# Uitkomst: /var/lib/mijn-ruimte-uitrol-status/opdracht-<werkwoord>.json (root:mijnruimte 0640) + gebeurtenissen.jsonl (audit).
set -euo pipefail
umask 077

IS_ROOT=0; [ "$(id -u)" -eq 0 ] && IS_ROOT=1
# Omgeving wissen: als root blijft er niets over behalve een vast PATH (ook test-overrides verdwijnen).
if [ "$IS_ROOT" -eq 1 ]; then
  for v in $(compgen -e); do
    case "$v" in BASHOPTS|SHELLOPTS|BASH_VERSINFO|EUID|PPID|UID) ;; *) unset "$v" 2>/dev/null || true ;; esac
  done
fi
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
exec </dev/null

RECHTEN="${OPDRACHT_RECHTEN:-/etc/mijn-ruimte/mcp-rechten.json}"
STATUS_DIR="${OPDRACHT_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
STAAT="${OPDRACHT_STAAT:-/var/lib/mijn-ruimte/opdracht}"
APP_ROOT="${OPDRACHT_APP_ROOT:-/srv/mijn-ruimte}"
UITROL_STAAT="${OPDRACHT_UITROL_STAAT:-/var/lib/mijn-ruimte-uitrol}"
GITOPS_STAAT="${OPDRACHT_GITOPS_STAAT:-/var/lib/mijn-ruimte/gitops}"
SYSTEMCTL="${OPDRACHT_SYSTEMCTL:-/usr/bin/systemctl}"
INSTALLEER="${OPDRACHT_INSTALLEER:-/usr/local/sbin/mijn-ruimte-installeer}"
GROEP="${OPDRACHT_GROEP:-mijnruimte}"
WACHT_TERUG="${OPDRACHT_WACHT_TERUG:-600}"   # seconden tussen twee keer terugdraaien

log() { echo "[opdracht] $*" >&2; }

gebeurtenis() { # gebeurtenis <code> <niveau> <uk> <nl> [werkwoord]
  mkdir -p "$STATUS_DIR"
  (
    flock 7
    tmp="$(mktemp "$STATUS_DIR/.gebeurtenis.XXXXXX")"
    python3 - "$STATUS_DIR/gebeurtenissen.jsonl" "$tmp" opdracht "$1" "$2" "$3" "$4" "${5:-}" <<'PY'
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

# ---- 1. argumenten: precies één, uit de vaste lijst ----
if [ "$#" -ne 1 ]; then
  log "GEWEIGERD: precies één werkwoord verwacht (kreeg $#)"
  gebeurtenis ARGUMENTEN waarschuwing "Відхилено: неправильна кількість аргументів." "Geweigerd: onjuist aantal argumenten." ""
  exit 64
fi
case "$1" in
  status|releases|backup|uitrol-nu|terugdraaien) WERKWOORD="$1" ;;
  *)
    log "GEWEIGERD: onbekend werkwoord"
    gebeurtenis ONBEKEND waarschuwing "Відхилено: невідома команда." "Geweigerd: onbekend werkwoord." ""
    exit 64 ;;
esac
mkdir -p "$STATUS_DIR" "$STAAT"
chmod 0700 "$STAAT"

resultaat() { # resultaat <uitkomst> <code> <uk> <nl> [json-bestand met extra velden]
  local tmp; tmp="$(mktemp "$STATUS_DIR/.opdracht.XXXXXX")"
  python3 - "$tmp" "$WERKWOORD" "$1" "$2" "$3" "$4" "${5:-}" <<'PY'
import json, sys, datetime
path, werkwoord, uitkomst, code, uk, nl, extra = sys.argv[1:8]
d = {"werkwoord": werkwoord, "uitkomst": uitkomst, "code": code, "uk": uk, "nl": nl,
     "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat()}
if extra:
    d["gegevens"] = json.load(open(extra, encoding="utf-8"))
json.dump(d, open(path, "w"), ensure_ascii=False)
PY
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATUS_DIR/opdracht-$WERKWOORD.json"
}

# ---- 2. schakelaar uit het root-bestand ----
rechten_ok=1
if [ "$IS_ROOT" -eq 1 ]; then
  if [ ! -f "$RECHTEN" ] || [ -L "$RECHTEN" ]; then rechten_ok=0
  else
    read -r eigenaar modus < <(stat -c '%u %a' "$RECHTEN")
    { [ "$eigenaar" = 0 ] && (( (8#$modus & 8#022) == 0 )); } || rechten_ok=0
  fi
fi
toegestaan="$(python3 - "$RECHTEN" "$WERKWOORD" "$rechten_ok" <<'PY'
import json, sys
pad, w, ok = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
standaard = {"status": True, "releases": True, "backup": True, "uitrol-nu": True, "terugdraaien": False}
waarde = standaard[w]
if not ok:
    waarde = w in ("status", "releases")   # onbetrouwbaar rechtenbestand: alleen lezen
else:
    try:
        d = json.load(open(pad, encoding="utf-8")).get("opdracht", {})
        if isinstance(d, dict) and isinstance(d.get(w), bool):
            waarde = d[w]
    except FileNotFoundError:
        pass
    except Exception:
        waarde = w in ("status", "releases")
print("ja" if waarde else "nee")
PY
)"
if [ "$toegestaan" != ja ]; then
  log "GEWEIGERD: $WERKWOORD staat uit in $RECHTEN"
  resultaat geweigerd UIT "Команду «$WERKWOORD» вимкнено на сервері (mcp-rechten.json)." "Opdracht '$WERKWOORD' staat uit op de server (mcp-rechten.json)."
  gebeurtenis UIT waarschuwing "Команду «$WERKWOORD» вимкнено; запит відхилено." "Opdracht '$WERKWOORD' staat uit; verzoek geweigerd." "$WERKWOORD"
  exit 3
fi

actief() { [ -L "$APP_ROOT/current" ] && basename "$(readlink -f "$APP_ROOT/current")" || true; }
vorige() { [ -s "$APP_ROOT/VORIGE" ] && basename "$(head -c 300 "$APP_ROOT/VORIGE" | tr -d '\r\n')" || true; }

# ---- 3. werkwoorden ----
case "$WERKWOORD" in
  status)
    diensten=()
    for u in mijn-ruimte.service mijn-ruimte-mcp.service mijn-ruimte-uitrol.path mijn-ruimte-gitops.timer mijn-ruimte-backup.timer; do
      diensten+=( "$u=$("$SYSTEMCTL" is-active "$u" 2>/dev/null || true)" )
    done
    extra="$(mktemp "$STAAT/.status.XXXXXX")"
    python3 - "$extra" "$(actief)" "$(vorige)" "$UITROL_STAAT" "$GITOPS_STAAT" "$STATUS_DIR" "${diensten[@]}" <<'PY'
import json, sys, re
uit, actief, vorige, uitrol, gitops, statusdir, *diensten = sys.argv[1:]
def lees(p, n=64):
    try: return open(p, encoding="utf-8").read(n).strip()
    except Exception: return ""
def js(p):
    try:
        d = json.load(open(p, encoding="utf-8"))
        return {k: d.get(k) for k in ("staat", "code", "uk", "nl", "versie", "tag", "tijd") if k in d}
    except Exception: return None
schoon = lambda s: s if re.fullmatch(r"[A-Za-z0-9._-]{0,64}", s or "") else ""
json.dump({"actief": schoon(actief), "vorige": schoon(vorige),
           "diensten": {d.split("=", 1)[0]: schoon(d.split("=", 1)[1]) for d in diensten},
           "laatsteVersie": schoon(lees(uitrol + "/laatste-versie")), "laatsteTag": schoon(lees(gitops + "/laatste-tag")),
           "uitrol": js(statusdir + "/status.json"), "gitops": js(statusdir + "/gitops.json")}, open(uit, "w"), ensure_ascii=False)
PY
    resultaat ok OK "Стан сервера зібрано." "Serverstatus verzameld." "$extra"; rm -f -- "$extra" ;;

  releases)
    extra="$(mktemp "$STAAT/.releases.XXXXXX")"
    python3 - "$extra" "$APP_ROOT/releases" "$(actief)" "$(vorige)" <<'PY'
import json, os, re, sys
uit, root, actief, vorige = sys.argv[1:5]
rijen = []
try: namen = sorted((n for n in os.listdir(root) if re.fullmatch(r"\d{8}-\d{6}", n)), reverse=True)[:30]
except FileNotFoundError: namen = []
for n in namen:
    p = os.path.join(root, n)
    st = os.lstat(p)
    if os.path.islink(p) or not os.path.isdir(p): continue
    # Een release die nog gebouwd wordt, is tijdelijk van mijnruimte: die lezen we niet (alleen root-mappen).
    if os.geteuid() == 0 and (st.st_uid != 0 or st.st_mode & 0o022): continue
    try:
        fd = os.open(os.path.join(p, "RELEASE-COMMIT"), os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, encoding="utf-8") as f: ruw = f.read(64).strip().lower(); commit = ruw if re.fullmatch(r"[0-9a-f]{7,40}", ruw) else ""  # 29.10.2026: niet «beed» uit «onbekend»
    except Exception: commit = ""
    rijen.append({"naam": n, "commit": commit, "actief": n == actief, "vorige": n == vorige,
                  "bruikbaar": os.path.isfile(os.path.join(p, "dist-server", "start.mjs"))})
json.dump({"releases": rijen}, open(uit, "w"), ensure_ascii=False)
PY
    resultaat ok OK "Список випусків." "Lijst van releases." "$extra"; rm -f -- "$extra" ;;

  backup)
    "$SYSTEMCTL" start --no-block mijn-ruimte-backup.service
    resultaat ok GESTART "Резервну копію запущено." "Back-up gestart."
    gebeurtenis BACKUP info "Резервну копію запущено на запит." "Back-up gestart op verzoek." backup ;;

  uitrol-nu)
    "$SYSTEMCTL" start --no-block mijn-ruimte-gitops.service
    "$SYSTEMCTL" start --no-block mijn-ruimte-uitrol.service
    "$SYSTEMCTL" start --no-block mijn-ruimte-goedkeuring.service
    resultaat ok GESTART "Перевірку підписаних випусків запущено (GitOps і пакет)." "Controle op ondertekende releases gestart (GitOps en pakket)."
    gebeurtenis UITROL_NU info "Запущено перевірку підписаних випусків." "Controle op ondertekende releases gestart." uitrol-nu ;;

  terugdraaien)
    stempel="$STAAT/terugdraaien.stempel"
    nu="$(date +%s)"
    if [ -f "$stempel" ]; then
      vorig="$(stat -c %Y "$stempel")"
      if (( nu - vorig < WACHT_TERUG )); then
        resultaat geweigerd TE_SNEL "Відкат можливий не частіше ніж раз на 10 хвилин." "Terugdraaien kan hooguit één keer per 10 minuten."
        gebeurtenis TE_SNEL waarschuwing "Повторний відкат відхилено (ліміт 10 хв)." "Opnieuw terugdraaien geweigerd (limiet 10 min)." terugdraaien
        exit 4
      fi
    fi
    touch "$stempel"
    van="$(actief)"
    gebeurtenis TERUGDRAAIEN waarschuwing "Відкат з випуску $van розпочато." "Terugdraaien vanaf release $van gestart." terugdraaien
    if [ -x "$INSTALLEER" ] && MIJN_RUIMTE_UITROL_MODUS=opdracht "$INSTALLEER" terugdraaien > "$STAAT/terugdraaien.log" 2>&1; then
      resultaat ok OK "Повернено до випуску $(actief)." "Teruggedraaid naar release $(actief)."
      gebeurtenis TERUGGEDRAAID info "Повернено з $van до $(actief)." "Teruggedraaid van $van naar $(actief)." terugdraaien
    else
      tail -n 20 "$STAAT/terugdraaien.log" >&2 2>/dev/null || true
      resultaat fout MISLUKT "Відкат не вдався; активний випуск: $(actief)." "Terugdraaien mislukt; actieve release: $(actief)."
      gebeurtenis TERUGDRAAIEN_MISLUKT fout "Відкат не вдався." "Terugdraaien mislukt." terugdraaien
      exit 1
    fi ;;
esac
log "klaar: $WERKWOORD"
