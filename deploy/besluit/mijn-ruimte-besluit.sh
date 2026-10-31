#!/bin/bash
# mijn-ruimte-besluit.sh — besluiten van de eigenaar met een passkey-handtekening uitvoeren (root). Zie deploy/RUNBOOK-VEILIGE-UITROL.md §15.
# Geïnstalleerd als /usr/local/sbin/mijn-ruimte-besluit (root:root 0755); gestart door mijn-ruimte-besluit.path zodra de app
# /srv/mijn-ruimte/besluit-inbox/aanvraag aantikt (unit mijn-ruimte-besluit.service), of met de hand: `mijn-ruimte-besluit verwerk|status`.
#
# Vertrouwensmodel (zelfde als de passkey-goedkeuring van updates, §13): ALLES in de inbox is door de app (gebruiker mijnruimte)
# geschreven en dus onbetrouwbaar. Root voert een besluit alleen uit als
#   1. /usr/local/sbin/mijn-ruimte-passkey verifieer-besluit <bestand> «OK» zegt: hash van de inhoud zelf uitgerekend (besluit-kern.mjs),
#      schakelaar van dit soort open, assertie van een passkey uit /etc/mijn-ruimte/goedkeur-passkeys.json geldig (rpId/origin, UV,
#      ≤ 5 min, nonce nooit eerder gezien) — zonder de passkey van de eigenaar gebeurt er NIETS;
#   2. de inhoud ook NU nog klopt met de werkelijkheid (terugdraaien: de actieve release is nog `van`, `naar` bestaat en is bruikbaar).
# Soorten:
#   terugdraaien   → /usr/local/sbin/mijn-ruimte-installeer terugdraaien <naar> (root-kopie van de installer, modus `besluit`;
#                    migraties worden NIET teruggedraaid; hoogstens één keer per 10 minuten, root-stempel)
#   externe-hosts  → sleutel "externeMcpHosts" in /etc/mijn-ruimte/mcp-rechten.json vervangen: atomisch (tmp + rename), eigenaar en
#                    rechten van het bestand blijven, reservekopie in /var/lib/mijn-ruimte/besluit/, het resultaat wordt teruggelezen
#                    en als JSON gecontroleerd vóór de rename. Niets anders in dat bestand verandert.
#   orch-regels    → ORCH-001 етап 3 (31.10.2026): підтвердження нової версії правил координації агентів (regelsVersie, hash, kritiekHash,
#                    voorstel). Root НІЧОГО не виконує: він дописує підтвердження у власний журнал $WERK/orch-regels-bevestigd.jsonl
#                    (лише root) і переписує $STATUS/orch-regels-bevestigd.json (root:groep 0640, останні 50) — застосунок читає його, щоб
#                    застосувати правила в git-гілці; gitops-ophalen.sh звіряє lock випуску з цим журналом перед автоматичною установкою.
# De app leest NOOIT uit de werkmap van root; de uitkomst staat in /var/lib/mijn-ruimte-uitrol-status/besluit-<id>.json (root:mijnruimte
# 0640), de stand (hosts, schakelaars, releases) in besluit-stand.json, en elke uitkomst ook in gebeurtenissen.jsonl (bron «besluit») en in
# het root-journaal /var/lib/mijn-ruimte/besluit/journaal.jsonl.
# Omgevingsvariabelen (BESLUIT_*) worden alleen buiten root gelezen (tests); als root gelden uitsluitend de vaste paden.
set -euo pipefail
umask 077

if [ "$(id -u)" -eq 0 ]; then
  unset BESLUIT_INBOX BESLUIT_WERK BESLUIT_STATUS BESLUIT_RECHTEN BESLUIT_PASSKEY BESLUIT_INSTALLEER BESLUIT_APP_ROOT BESLUIT_GROEP BESLUIT_WACHT_TERUG
  export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C.UTF-8
fi
exec </dev/null

INBOX="${BESLUIT_INBOX:-/srv/mijn-ruimte/besluit-inbox}"
WERK="${BESLUIT_WERK:-/var/lib/mijn-ruimte/besluit}"
STATUS="${BESLUIT_STATUS:-/var/lib/mijn-ruimte-uitrol-status}"
RECHTEN="${BESLUIT_RECHTEN:-/etc/mijn-ruimte/mcp-rechten.json}"
PASSKEY="${BESLUIT_PASSKEY:-/usr/local/sbin/mijn-ruimte-passkey}"
INSTALLEER="${BESLUIT_INSTALLEER:-/usr/local/sbin/mijn-ruimte-installeer}"
APP_ROOT="${BESLUIT_APP_ROOT:-/srv/mijn-ruimte}"
GROEP="${BESLUIT_GROEP:-mijnruimte}"
WACHT_TERUG="${BESLUIT_WACHT_TERUG:-600}"
case "$WACHT_TERUG" in ''|*[!0-9]*) WACHT_TERUG=600 ;; esac

onder_tmp() { case "$1" in /tmp/*|/var/tmp/*) return 0 ;; *) return 1 ;; esac; }
mag_pad() {
  [ "$(id -u)" -eq 0 ] && return 0
  # Buiten root (tests) alleen met testpaden: nooit per ongeluk een echt rechtenbestand of een echte releasemap raken.
  if onder_tmp "$INBOX" && onder_tmp "$WERK" && onder_tmp "$STATUS" && onder_tmp "$RECHTEN" && onder_tmp "$APP_ROOT"; then return 0; fi
  echo "alleen root" >&2
  exit 1
}

besluit_py() {
  /usr/bin/python3 - "$INBOX" "$WERK" "$STATUS" "$RECHTEN" "$PASSKEY" "$INSTALLEER" "$APP_ROOT" "$GROEP" "$WACHT_TERUG" "$1" <<'PY'
import datetime, fcntl, grp, json, os, re, secrets, stat, subprocess, sys, time
(inbox, werk, status_dir, rechten, passkey, installeer, app_root, groep, wacht_terug, modus) = sys.argv[1:11]
ID = re.compile(r"[0-9a-f]{32}\Z")
RELEASE = re.compile(r"[0-9]{8}-[0-9]{6}\Z")
HOST = re.compile(r"\*?\.?[a-z0-9.-]+\Z")
SOORTEN = ("terugdraaien", "externe-hosts", "orch-regels")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
SEMVER = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")
VOORSTEL_ID = re.compile(r"[0-9a-f]{16,32}\Z")
MAX_JSON = 65536

def nu():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def groep_lezen(pad):
    os.chmod(pad, 0o640)
    if os.geteuid() == 0:
        try:
            os.chown(pad, 0, grp.getgrnam(groep).gr_gid)
        except Exception:
            pass

def schrijf_json(doel, body, groep_leesbaar=True):
    os.makedirs(os.path.dirname(doel), exist_ok=True)
    tmp = doel + ".%d.%s.tmp" % (os.getpid(), secrets.token_hex(3))
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)
        f.write("\n")
    if groep_leesbaar:
        groep_lezen(tmp)
    else:
        os.chmod(tmp, 0o600)
    os.replace(tmp, doel)

def noteer(code, niveau, uk, nl, tag):
    """Gebeurtenis voor de site (gebeurtenissen.jsonl, zelfde vorm als opdracht/goedkeuring; onder de gedeelde vergrendeling)."""
    try:
        os.makedirs(status_dir, exist_ok=True)
        t = datetime.datetime.now(datetime.timezone.utc)
        regel = {"id": t.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": t.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                 "bron": "besluit", "code": code, "niveau": niveau, "uk": uk[:300], "nl": nl[:300], "tag": tag}
        pad = os.path.join(status_dir, "gebeurtenissen.jsonl")
        with open(os.path.join(status_dir, ".gebeurtenissen.lock"), "a") as slot:
            fcntl.flock(slot, fcntl.LOCK_EX)
            try:
                oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
            except FileNotFoundError:
                oud = []
            tmp = pad + ".besluit.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
            groep_lezen(tmp)
            os.replace(tmp, pad)
    except Exception:
        return

def journaal(regel):
    """Root-journaal (alleen root leesbaar): elk besluit, ook de geweigerde, met vingerafdruk van de passkey en uitkomst."""
    try:
        os.makedirs(werk, exist_ok=True)
        pad = os.path.join(werk, "journaal.jsonl")
        with open(pad, "a", encoding="utf-8") as f:
            f.write(json.dumps(regel, ensure_ascii=False) + "\n")
        os.chmod(pad, 0o600)
    except Exception:
        pass

def run(argv, timeout=20, env=None):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, env=env, stdin=subprocess.DEVNULL)
        return p.returncode, (p.stdout or ""), (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "", "time-out"
    except Exception as e:
        return 127, "", str(e)

class Fout(Exception):
    def __init__(self, code, uk, nl, detail=""):
        super().__init__(code)
        self.code, self.uk, self.nl, self.detail = code, uk, nl, detail

# ---------------------------------------------------------------- rechten (root-bestand) en releases
def lees_rechten():
    try:
        st = os.lstat(rechten)
        if not stat.S_ISREG(st.st_mode):
            return None, None
        with open(rechten, encoding="utf-8") as f:
            d = json.load(f)
        return (d if isinstance(d, dict) else None), st
    except FileNotFoundError:
        return {}, None
    except Exception:
        return None, None

def hosts_in_bestand():
    d, _ = lees_rechten()
    ruw = d.get("externeMcpHosts") if isinstance(d, dict) else None
    uit = []
    for h in (ruw if isinstance(ruw, list) else []):
        r = str(h or "").strip().lower()
        if r and r != "*" and len(r) <= 300 and HOST.fullmatch(r) and r not in uit:
            uit.append(r)
    return uit[:50]

def actief():
    try:
        p = os.path.join(app_root, "current")
        return os.path.basename(os.path.realpath(p)) if os.path.islink(p) else ""
    except Exception:
        return ""

def vorige():
    try:
        with open(os.path.join(app_root, "VORIGE"), encoding="utf-8") as f:
            return os.path.basename(f.read(300).strip())
    except Exception:
        return ""

def releases():
    root = os.path.join(app_root, "releases")
    rijen = []
    try:
        namen = sorted((n for n in os.listdir(root) if RELEASE.fullmatch(n)), reverse=True)[:30]
    except FileNotFoundError:
        namen = []
    a, v = actief(), vorige()
    for n in namen:
        p = os.path.join(root, n)
        try:
            st = os.lstat(p)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
            continue
        # Een release die nog gebouwd wordt, is tijdelijk van mijnruimte: die lezen we niet (alleen root-mappen).
        if os.geteuid() == 0 and (st.st_uid != 0 or st.st_mode & 0o022):
            continue
        commit = ""
        try:
            fd = os.open(os.path.join(p, "RELEASE-COMMIT"), os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, encoding="utf-8") as f:
                # 29.10.2026: alleen een echte hex-commit. Vroeger haalde re.sub de hex-letters uit «onbekend» (zo schrijft de installer
                # RELEASE-COMMIT bij een zonder-git-pakket) → «beed» bij elke release. De volledige BRON-COMMIT leest de app zelf.
                ruw = f.read(64).strip().lower()
                commit = ruw if re.fullmatch(r"[0-9a-f]{7,40}", ruw) else ""
        except Exception:
            commit = ""
        rijen.append({"naam": n, "commit": commit, "actief": n == a, "vorige": n == v,
                      "bruikbaar": os.path.isfile(os.path.join(p, "dist-server", "start.mjs"))})
    return rijen

def stand():
    d, st = lees_rechten()
    d = d if isinstance(d, dict) else {}
    op = d.get("opdracht") if isinstance(d.get("opdracht"), dict) else {}
    return {
        "bijgewerkt": nu(), "rechtenLeesbaar": st is not None or d == {},
        "hosts": hosts_in_bestand(),
        "schakelaars": {
            "terugdraaienDirect": op.get("terugdraaien") is True,
            "terugdraaienPasskey": d.get("terugdraaien-passkey") is not False,
            "externeHostsPasskey": d.get("externe-hosts-passkey") is not False,
            "orchRegelsPasskey": d.get("orch-regels-passkey") is not False,
        },
        "actief": actief(), "vorige": vorige(), "releases": releases(),
    }

def schrijf_stand():
    s = stand()
    schrijf_json(os.path.join(status_dir, "besluit-stand.json"), s)
    return s

# ---------------------------------------------------------------- uitvoeren
def passkey_controle(pad):
    code, out, err = run([passkey, "verifieer-besluit", pad], 30)
    uit = None
    try:
        uit = json.loads(out.strip().splitlines()[-1]) if out.strip() else None
    except Exception:
        uit = None
    if code != 0 or not isinstance(uit, dict) or uit.get("ok") is not True:
        c = str((uit or {}).get("code") or "BESLUIT_PASSKEY")
        c = c if re.fullmatch(r"[A-Z0-9_]{2,40}", c) else "BESLUIT_PASSKEY"
        raise Fout("BESLUIT_PASSKEY_" + c if not c.startswith("BESLUIT_") else c,
                   str((uit or {}).get("uk") or "Root не підтвердив підпис passkey — нічого не змінено."),
                   str((uit or {}).get("nl") or "Root heeft de passkey-handtekening niet bevestigd — niets gewijzigd."), (out + err)[-300:])
    return uit

def terugdraaien(rid, inhoud):
    van, naar = str(inhoud.get("van", "")), str(inhoud.get("naar", ""))
    if not RELEASE.fullmatch(van) or not RELEASE.fullmatch(naar) or van == naar:
        raise Fout("BESLUIT_INHOUD_ONGELDIG", "Вміст рішення недійсний.", "De inhoud van het besluit is ongeldig.")
    a = actief()
    if a != van:
        raise Fout("BESLUIT_STAND_VERANDERD", "Активний випуск уже не %s, а %s — рішення застаріло; почніть заново." % (van, a or "?"),
                   "De actieve release is niet meer %s maar %s — het besluit is verouderd; begin opnieuw." % (van, a or "?"))
    doel = os.path.join(app_root, "releases", naar)
    if not os.path.isdir(doel) or os.path.islink(doel) or not os.path.isfile(os.path.join(doel, "dist-server", "start.mjs")):
        raise Fout("BESLUIT_RELEASE_ONBEKEND", "Випуск %s відсутній або неповний на сервері." % naar, "Release %s ontbreekt of is onvolledig op de server." % naar)
    stempel = os.path.join(werk, "terugdraaien.stempel")
    try:
        if time.time() - os.stat(stempel).st_mtime < int(wacht_terug):
            raise Fout("BESLUIT_TE_SNEL", "Відкат можливий не частіше ніж раз на 10 хвилин.", "Terugdraaien kan hooguit één keer per 10 minuten.")
    except FileNotFoundError:
        pass
    with open(stempel, "w") as f:
        f.write(nu() + "\n")
    os.chmod(stempel, 0o600)
    if not os.access(installeer, os.X_OK):
        raise Fout("BESLUIT_TERUGDRAAIEN_MISLUKT", "Інсталятор %s недоступний." % installeer, "De installer %s is niet beschikbaar." % installeer)
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C.UTF-8", "MIJN_RUIMTE_UITROL_MODUS": "besluit"}
    code, out, err = run([installeer, "terugdraaien", naar], 900, env)
    logpad = os.path.join(werk, "terugdraaien-" + rid + ".log")
    try:
        with open(logpad, "w", encoding="utf-8") as f:
            f.write(out + err)
        os.chmod(logpad, 0o600)
    except Exception:
        pass
    na = actief()
    if code != 0 or na != naar:
        staart = re.sub(r"[^\x20-\x7eЀ-ӿ]", " ", (out + err))[-300:]
        raise Fout("BESLUIT_TERUGDRAAIEN_MISLUKT", "Відкат не вдався; активний випуск: %s." % (na or "?"), "Terugdraaien mislukt; actieve release: %s." % (na or "?"), staart)
    return {"van": van, "naar": naar, "actief": na}

def externe_hosts(rid, inhoud):
    ruw = inhoud.get("hosts")
    if not isinstance(ruw, list) or len(ruw) > 50:
        raise Fout("BESLUIT_INHOUD_ONGELDIG", "Вміст рішення недійсний.", "De inhoud van het besluit is ongeldig.")
    hosts = []
    for h in ruw:
        r = str(h or "").strip().lower()
        if not r or r in ("*", "*.") or len(r) > 300 or not HOST.fullmatch(r) or ".." in r:
            raise Fout("BESLUIT_INHOUD_ONGELDIG", "Хост «%s» у недопустимій формі." % r[:60], "Host «%s» heeft een onjuiste vorm." % r[:60])
        if r not in hosts:
            hosts.append(r)
    d, st = lees_rechten()
    if d is None:
        raise Fout("BESLUIT_RECHTEN", "Файл перемикачів пошкоджений — нічого не змінено.", "Het schakelaarbestand is beschadigd — niets gewijzigd.")
    if os.geteuid() == 0 and st is not None and (st.st_uid != 0 or (stat.S_IMODE(st.st_mode) & 0o022)):
        raise Fout("BESLUIT_RECHTEN", "Файл перемикачів не належить root або доступний для запису іншим — нічого не змінено.",
                   "Het schakelaarbestand is niet van root of is schrijfbaar voor anderen — niets gewijzigd.")
    oud = hosts_in_bestand()
    # Reservekopie (alleen root leesbaar) vóór elke wijziging; de laatste 20 blijven.
    os.makedirs(werk, exist_ok=True)
    kopie = os.path.join(werk, "mcp-rechten.%s.%s.bak" % (datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S"), rid[:8]))
    with open(kopie, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.chmod(kopie, 0o600)
    try:
        oude = sorted(n for n in os.listdir(werk) if n.startswith("mcp-rechten.") and n.endswith(".bak"))
        for n in oude[:-20]:
            os.remove(os.path.join(werk, n))
    except Exception:
        pass
    nieuw = dict(d)
    nieuw["externeMcpHosts"] = hosts
    tmp = rechten + ".besluit.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(nieuw, f, ensure_ascii=False, indent=2)
        f.write("\n")
    # Syntaxiscontrole: wat op schijf staat moet terug te lezen zijn en exact deze lijst bevatten; anders de tmp weggooien.
    try:
        with open(tmp, encoding="utf-8") as f:
            terug = json.load(f)
        if not isinstance(terug, dict) or terug.get("externeMcpHosts") != hosts or {k: v for k, v in terug.items() if k != "externeMcpHosts"} != {k: v for k, v in d.items() if k != "externeMcpHosts"}:
            raise ValueError("inhoud")
    except Exception:
        os.remove(tmp)
        raise Fout("BESLUIT_RECHTEN", "Новий файл перемикачів не пройшов перевірку — нічого не змінено.", "Het nieuwe schakelaarbestand kwam niet door de controle — niets gewijzigd.")
    if st is not None:
        os.chmod(tmp, stat.S_IMODE(st.st_mode))
        if os.geteuid() == 0:
            os.chown(tmp, st.st_uid, st.st_gid)
    else:
        groep_lezen(tmp)
    os.replace(tmp, rechten)
    return {"hosts": hosts, "vorige": oud, "toegevoegd": [h for h in hosts if h not in oud], "verwijderd": [h for h in oud if h not in hosts], "kopie": os.path.basename(kopie)}

def orch_regels(rid, inhoud, extra):
    """ORCH-001 етап 3: підтвердження правил координації. Root лише фіксує (журнал root + файл стану для застосунку); код правил не чіпає."""
    rv, h, kh, vs = (str(inhoud.get(k, "")).strip() for k in ("regelsVersie", "hash", "kritiekHash", "voorstel"))
    if not SEMVER.fullmatch(rv) or not SHA256.fullmatch(h) or not SHA256.fullmatch(kh) or not VOORSTEL_ID.fullmatch(vs):
        raise Fout("BESLUIT_INHOUD_ONGELDIG", "Вміст рішення про правила недійсний.", "De inhoud van het regelbesluit is ongeldig.")
    regel = {"regelsVersie": rv, "hash": h, "kritiekHash": kh, "voorstel": vs, "passkey": extra.get("passkey", ""), "label": extra.get("label", ""),
             "door": extra.get("door", ""), "besluit": rid, "tijd": nu()}
    os.makedirs(werk, exist_ok=True)
    pad = os.path.join(werk, "orch-regels-bevestigd.jsonl")
    with open(pad, "a", encoding="utf-8") as f:
        f.write(json.dumps(regel, ensure_ascii=False) + "\n")
    os.chmod(pad, 0o600)
    # Файл стану для застосунку: останні 50 підтверджень із root-журналу (джерело правди — журнал, файл лише копія для читання).
    regels = []
    try:
        with open(pad, encoding="utf-8") as f:
            for r in f.read().splitlines()[-50:]:
                try:
                    regels.append(json.loads(r))
                except Exception:
                    continue
    except Exception:
        regels = [regel]
    schrijf_json(os.path.join(status_dir, "orch-regels-bevestigd.json"), {"bijgewerkt": nu(), "bevestigingen": regels})
    return {"regelsVersie": rv, "hash": h, "kritiekHash": kh, "voorstel": vs}

def verwerk_een(doel, rid):
    st = os.lstat(doel)
    if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_JSON:
        raise Fout("BESLUIT_ONGELDIG", "Запит не є звичайним файлом або завеликий.", "Het verzoek is geen gewoon bestand of te groot.")
    with open(doel, encoding="utf-8") as f:
        d = json.load(f)
    if not isinstance(d, dict) or d.get("id") != rid or d.get("soort") not in SOORTEN:
        raise Fout("BESLUIT_ONGELDIG", "Запит пошкоджений.", "Het verzoek is beschadigd.")
    soort = d["soort"]
    # 1. Root controleert de handtekening en de inhoud ZELF (goedkeur-hulp.mjs verifieer-besluit): nonce verbruikt, hash herberekend.
    v = passkey_controle(doel)
    if v.get("soort") != soort or not isinstance(v.get("inhoud"), dict):
        raise Fout("BESLUIT_ONGELDIG", "Відповідь перевірки не збігається з рішенням.", "De uitkomst van de controle past niet bij het besluit.")
    inhoud = v["inhoud"]   # de door ROOT genormaliseerde inhoud, niet wat de app beweert
    extra = {"passkey": str(v.get("vingerafdruk", ""))[:16], "label": str(v.get("label", ""))[:60], "hash": str(v.get("hash", ""))[:64], "door": re.sub(r"[^\x20-\x7e]", "", str(d.get("door", "")))[:120]}
    # 2. Uitvoeren.
    if soort == "terugdraaien":
        extra.update(terugdraaien(rid, inhoud))
        uk = "Повернуто з випуску %s на %s за рішенням власника (passkey %s). Міграції бази не відкочуються." % (extra["van"], extra["actief"], extra["passkey"])
        nl = "Teruggedraaid van release %s naar %s op besluit van de eigenaar (passkey %s). Databasemigraties worden niet teruggedraaid." % (extra["van"], extra["actief"], extra["passkey"])
    elif soort == "orch-regels":
        extra.update(orch_regels(rid, inhoud, extra))
        uk = "Правила координації агентів %s (відбиток %s…) підтверджено власником (passkey %s). Root записав підтвердження; застосунок застосовує правила в git." % (extra["regelsVersie"], extra["hash"][:12], extra["passkey"])
        nl = "Coördinatieregels %s (afdruk %s…) bevestigd door de eigenaar (passkey %s). Root legde de bevestiging vast; de app past de regels toe in git." % (extra["regelsVersie"], extra["hash"][:12], extra["passkey"])
    else:
        extra.update(externe_hosts(rid, inhoud))
        uk = "Білий список зовнішніх MCP-хостів оновлено (passkey %s): %s." % (extra["passkey"], ", ".join(extra["hosts"]) or "порожній")
        nl = "Witte lijst van externe MCP-hosts bijgewerkt (passkey %s): %s." % (extra["passkey"], ", ".join(extra["hosts"]) or "leeg")
    return soort, inhoud, extra, uk, nl

def verwerk_inbox():
    os.makedirs(werk, exist_ok=True)
    os.chmod(werk, 0o700)
    try:
        namen = [n for n in os.listdir(inbox) if n.startswith("besluit-") and n.endswith(".json")]
    except FileNotFoundError:
        return
    def ouderdom(n):
        try:
            return os.lstat(os.path.join(inbox, n)).st_mtime
        except Exception:
            return 0
    for naam in sorted(namen, key=ouderdom)[:20]:
        rid = naam[len("besluit-"):-5]
        bron = os.path.join(inbox, naam)
        try:
            st = os.lstat(bron)
        except FileNotFoundError:
            continue
        if not ID.fullmatch(rid) or not stat.S_ISREG(st.st_mode) or st.st_size > MAX_JSON:
            try:
                os.remove(bron)
            except Exception:
                pass
            continue
        doel = os.path.join(werk, "besluit-" + rid + ".json")
        try:
            os.replace(bron, doel)   # eerst uit de inbox halen: de app kan het bestand daarna niet meer wijzigen
        except Exception:
            continue
        resultaat = {"id": rid, "uitkomst": "geweigerd", "code": "BESLUIT_CONTROLE", "tijd": nu()}
        soort = ""
        try:
            soort, inhoud, extra, uk, nl = verwerk_een(doel, rid)
            resultaat.update({"soort": soort, "inhoud": inhoud, "uitkomst": "klaar", "code": "OK", "uk": uk, "nl": nl, **{k: v for k, v in extra.items() if k not in ("inhoud",)}})
            noteer("BESLUIT_" + soort.upper().replace("-", "_") + "_OK", "info", uk, nl, rid)
        except Fout as e:
            try:
                with open(doel, encoding="utf-8") as f:
                    dd = json.load(f)
                soort = str(dd.get("soort", "")) if isinstance(dd, dict) else ""
                if isinstance(dd, dict) and isinstance(dd.get("inhoud"), dict):
                    resultaat["inhoud"] = dd["inhoud"]
            except Exception:
                pass
            mislukt = e.code in ("BESLUIT_TERUGDRAAIEN_MISLUKT", "BESLUIT_RECHTEN")
            resultaat.update({"soort": soort, "uitkomst": "mislukt" if mislukt else "geweigerd", "code": e.code, "uk": e.uk, "nl": e.nl})
            if e.detail:
                resultaat["detail"] = re.sub(r"[^\x20-\x7eЀ-ӿ]", " ", e.detail)[-300:]
            noteer(e.code, "fout" if mislukt else "waarschuwing", "Рішення власника відхилено: " + e.uk, "Besluit van de eigenaar geweigerd: " + e.nl, rid)
        except Exception as e:
            resultaat.update({"soort": soort, "uitkomst": "mislukt", "code": "BESLUIT_CONTROLE", "uk": "Внутрішня помилка root-скрипта.", "nl": "Interne fout in het root-script.", "detail": re.sub(r"[^\x20-\x7e]", " ", str(e))[-200:]})
            noteer("BESLUIT_CONTROLE", "fout", "Внутрішня помилка під час виконання рішення власника.", "Interne fout bij het uitvoeren van een besluit van de eigenaar.", rid)
        finally:
            try:
                os.remove(doel)
            except Exception:
                pass
        journaal(resultaat)
        schrijf_json(os.path.join(status_dir, "besluit-" + rid + ".json"), resultaat)
    # Oude uitkomstbestanden opruimen (ouder dan 7 dagen).
    try:
        grens = time.time() - 7 * 86400
        for n in os.listdir(status_dir):
            if n.startswith("besluit-") and n.endswith(".json") and n != "besluit-stand.json" and os.lstat(os.path.join(status_dir, n)).st_mtime < grens:
                os.remove(os.path.join(status_dir, n))
    except Exception:
        pass

if modus == "status":
    schrijf_stand()
else:
    verwerk_inbox()
    schrijf_stand()
PY
}

verwerk() {
  mkdir -p -- "$WERK" "$STATUS"
  chmod 0700 "$WERK" 2>/dev/null || true
  ( flock -w 600 9; besluit_py "${1:-inbox}" ) 9>"$WERK/.lock"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  verwerk) mag_pad; verwerk inbox ;;
  status) mag_pad; verwerk status ;;
  *) echo "gebruik: $0 verwerk | status" >&2; exit 2 ;;
esac
