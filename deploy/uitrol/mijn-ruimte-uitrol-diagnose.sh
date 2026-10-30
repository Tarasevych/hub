#!/usr/bin/env bash
# Diagnose van de uitrol-keten (root, elke minuut via mijn-ruimte-diagnose.timer). Schrijft ALLEEN LEZENDE feiten naar
# /var/lib/mijn-ruimte-uitrol-status/diagnose.json (root:mijnruimte 0640); de site toont ze in Admin → «Оновлення» → «Діагностика».
# Doel: als een goedkeuring met de passkey geen uitkomst geeft, moet de site kunnen zeggen WAAR de keten stokt (path-unit uit, service
# mislukt, vergrendeling bezet, pakket ligt nog in de inbox, schijf vol, …) zonder dat de eigenaar via SSH hoeft te zoeken.
# Dit script wijzigt niets en neemt NOOIT de uitrol-vergrendeling (anders zou een echte run stil afbreken met «er loopt al een uitrol»).
set -uo pipefail
export LC_ALL=C
STATUS_DIR="${UITROL_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
GROEP="${UITROL_GROEP:-mijnruimte}"
mkdir -p "$STATUS_DIR" 2>/dev/null || exit 0
tmp="$(mktemp "$STATUS_DIR/.diagnose.XXXXXX")" || exit 0
trap 'rm -f -- "$tmp"' EXIT

python3 - "$tmp" <<'PY' || exit 0
import json, os, re, subprocess, sys, datetime, hashlib

uit = sys.argv[1]
STATUS = os.environ.get("UITROL_STATUS_DIR", "/var/lib/mijn-ruimte-uitrol-status")
INBOX = os.environ.get("UITROL_GOEDKEUR_INBOX", "/srv/mijn-ruimte/goedkeur-inbox")
LOCK = os.environ.get("UITROL_LOCK", "/run/lock/mijn-ruimte-uitrol.lock")
SBIN = "/usr/local/sbin/mijn-ruimte-uitrol"

def run(args, timeout=8):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"})
        return r.returncode, (r.stdout or "")
    except Exception as e:  # noqa: BLE001
        return 127, f"{type(e).__name__}: {e}"

def eenheid(naam):
    rc, out = run(["systemctl", "show", naam, "--no-pager",
                   "-p", "LoadState,ActiveState,SubState,UnitFileState,Result,ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp,NextElapseUSecRealtime,TriggeredBy,ConditionResult"])
    d = {}
    for regel in out.splitlines():
        if "=" in regel:
            k, v = regel.split("=", 1)
            d[k] = v
    return {"geladen": d.get("LoadState", "?"), "actief": d.get("ActiveState", "?"), "sub": d.get("SubState", "?"), "bestand": d.get("UnitFileState", "?"),
            "resultaat": d.get("Result", ""), "exit": d.get("ExecMainStatus", ""), "start": d.get("ExecMainStartTimestamp", ""),
            "einde": d.get("ExecMainExitTimestamp", ""), "volgende": d.get("NextElapseUSecRealtime", "")}

eenheden = {n: eenheid(n) for n in (
    "mijn-ruimte-goedkeuring.path", "mijn-ruimte-goedkeuring.service", "mijn-ruimte-goedkeuring-wacht.timer",
    "mijn-ruimte-uitrol.path", "mijn-ruimte-uitrol.service", "mijn-ruimte.service")}

# Vergrendeling: alleen lezen via lslocks (nooit zelf flock nemen).
lock = {"bezet": False, "door": ""}
rc, out = run(["lslocks", "-n", "-r", "-o", "COMMAND,PID,PATH"])
if rc == 0:
    for regel in out.splitlines():
        if LOCK in regel:
            lock = {"bezet": True, "door": " ".join(regel.split()[:2])}
            break
lock["bestaat"] = os.path.exists(LOCK)

# Inbox (alleen namen, grootte en tijd).
inbox = {"bestaat": os.path.isdir(INBOX), "bestanden": []}
try:
    for naam in sorted(os.listdir(INBOX))[:30]:
        p = os.path.join(INBOX, naam)
        try:
            st = os.lstat(p)
            inbox["bestanden"].append({"naam": naam[:120], "bytes": st.st_size, "tijd": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat()})
        except OSError:
            pass
except OSError:
    pass

# Schijf.
schijf = {}
for pad in ("/srv/mijn-ruimte", "/var/lib/mijn-ruimte-uitrol", "/tmp"):
    try:
        v = os.statvfs(pad)
        schijf[pad] = {"vrijMB": int(v.f_bavail * v.f_frsize / 1048576), "totaalMB": int(v.f_blocks * v.f_frsize / 1048576)}
    except OSError:
        pass

# Het root-script zelf: welke versie staat er, en is het uitvoerbaar?
script = {"bestaat": os.path.isfile(SBIN)}
try:
    st = os.stat(SBIN)
    script["uitvoerbaar"] = bool(st.st_mode & 0o100)
    script["gewijzigd"] = datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat()
    script["sha12"] = hashlib.sha256(open(SBIN, "rb").read()).hexdigest()[:12]
except OSError:
    pass

# Laatste regels van het journaal van de goedkeur-service (geheimen gemaskeerd).
maskeer = re.compile(r"((token|secret|password|wachtwoord|passphrase|api[_-]?key|private[_-]?key)[A-Za-z0-9_]*[=:][ ]*).*", re.I)
rc, out = run(["journalctl", "-u", "mijn-ruimte-goedkeuring.service", "-n", "60", "--no-pager", "-o", "short-iso"], timeout=10)
journaal = [maskeer.sub(r"\1***", regel)[:300] for regel in out.splitlines()[-60:]] if rc == 0 else []

# Conclusie in gewone taal (uk/nl): de EERSTE oorzaak die zeker is.
pad = eenheden["mijn-ruimte-goedkeuring.path"]
wacht = eenheden["mijn-ruimte-goedkeuring-wacht.timer"]
svc = eenheden["mijn-ruimte-goedkeuring.service"]
problemen = []
def p(code, uk, nl):
    problemen.append({"code": code, "uk": uk, "nl": nl})
if pad["geladen"] != "loaded":
    p("PATH_ONTBREEKT", "На сервері немає юніта mijn-ruimte-goedkeuring.path — схвалення нікому обробляти.", "De unit mijn-ruimte-goedkeuring.path ontbreekt op de server — niemand verwerkt de goedkeuring.")
elif pad["actief"] != "active":
    p("PATH_NIET_ACTIEF", f"Юніт mijn-ruimte-goedkeuring.path не активний ({pad['actief']}/{pad['sub']}). Запустіть: sudo systemctl enable --now mijn-ruimte-goedkeuring.path", f"De unit mijn-ruimte-goedkeuring.path is niet actief ({pad['actief']}/{pad['sub']}). Start: sudo systemctl enable --now mijn-ruimte-goedkeuring.path")
if not script["bestaat"]:
    p("SCRIPT_ONTBREEKT", "Немає /usr/local/sbin/mijn-ruimte-uitrol.", "/usr/local/sbin/mijn-ruimte-uitrol ontbreekt.")
elif not script.get("uitvoerbaar"):
    p("SCRIPT_NIET_UITVOERBAAR", "/usr/local/sbin/mijn-ruimte-uitrol не виконуваний.", "/usr/local/sbin/mijn-ruimte-uitrol is niet uitvoerbaar.")
if svc["resultaat"] not in ("", "success") and svc["actief"] != "activating":
    p("SERVICE_MISLUKT", f"Остання обробка схвалення завершилась помилкою (результат {svc['resultaat']}, код {svc['exit']}). Деталі — у журналі нижче.", f"De laatste verwerking van een goedkeuring is mislukt (resultaat {svc['resultaat']}, code {svc['exit']}). Details staan in het journaal hieronder.")
if lock["bezet"] and svc["actief"] not in ("activating", "active"):
    p("LOCK_BEZET", f"Блокування uitrol.lock утримує процес ({lock['door']}), хоча служба не працює — нові пакети мовчки ігноруються.", f"De vergrendeling uitrol.lock wordt vastgehouden door een proces ({lock['door']}) terwijl de dienst niet draait — nieuwe pakketten worden stil genegeerd.")
for pad_, w in schijf.items():
    if w["vrijMB"] < 800:
        p("SCHIJF_VOL", f"Мало місця на {pad_}: {w['vrijMB']} МБ.", f"Weinig schijfruimte op {pad_}: {w['vrijMB']} MB.")
oud = [b for b in inbox["bestanden"] if b["naam"].startswith("mijn-ruimte-") and b["naam"].endswith(".tar.gz")]
if oud and svc["actief"] not in ("activating", "active"):
    p("PAKKET_LIGT_STIL", f"У goedkeur-inbox лежить пакет {oud[0]['naam']}, але його ніхто не обробляє.", f"In de goedkeur-inbox ligt {oud[0]['naam']}, maar niemand verwerkt het.")

# Nazorg-bewaker (markering in een root-map, 0600): alleen hier leesbaar; de site toont hem op de kaart «Джерела статусу» (uitrol-bron.ts).
NAZORG = os.environ.get("UITROL_NAZORG_MARK", "/var/lib/mijn-ruimte-uitrol/nazorg")
nazorg = {"actief": False, "release": "", "vorige": "", "tot": "", "fouten": 0}
try:
    delen = open(NAZORG, encoding="utf-8").read().split()
    if len(delen) >= 2:
        nazorg["actief"] = True
        nazorg["tot"] = datetime.datetime.fromtimestamp(int(delen[0]), datetime.timezone.utc).isoformat()
        nazorg["release"] = os.path.basename(delen[1])[:15]
        if len(delen) >= 3:
            nazorg["vorige"] = os.path.basename(delen[2])[:15]
    try:
        nazorg["fouten"] = int(open(NAZORG + "-fouten", encoding="utf-8").read().strip() or 0)
    except (OSError, ValueError):
        pass
except OSError:
    pass

json.dump({"tijd": datetime.datetime.now(datetime.timezone.utc).isoformat(), "eenheden": eenheden, "lock": lock, "inbox": inbox, "schijf": schijf,
           "script": script, "journaal": journaal, "problemen": problemen, "gezond": not problemen, "nazorg": nazorg}, open(uit, "w", encoding="utf-8"), ensure_ascii=False)
PY

chgrp "$GROEP" "$tmp" 2>/dev/null || true
chmod 0640 "$tmp"
mv -f "$tmp" "$STATUS_DIR/diagnose.json"
trap - EXIT
exit 0
