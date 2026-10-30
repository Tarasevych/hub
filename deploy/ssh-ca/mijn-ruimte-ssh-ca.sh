#!/bin/bash
# SSH-CA (etap C, deel 2). Root tekent een gebruikerscertificaat van 5–60 minuten (standaard 60) voor principals uit de
# root-lijst toegestaan.json (standaard alleen «beheer»), met alleen permit-pty. De app kan dit niet zelf: schakelaar "ssh-ca"
# in mcp-rechten.json ontbreekt of is iets anders dan true → geen handtekening.
#
# Beheer vanaf de site (18.10.2026, `beheer`, unit mijn-ruimte-ssh-ca-beheer.service): de app legt een verzoek in
# /srv/mijn-ruimte/ssh-ca-beheer; root voert het uit:
#   status       stand schrijven (CA, sshd vertrouwt de CA, schakelaar, KRL) — geen assertie nodig
#   inrichten    CA-sleutel + KRL + principals + sshd-drop-in; `sshd -t` vóór herladen, bij een fout terug naar de vorige drop-in
#                → alleen met een geldige ROOT-passkey-assertie (mijn-ruimte-passkey verifieer-ssh-ca), want dit geeft toegang
#   aan          schakelaar ssh-ca = true + path-unit aan → ook alleen met een root-passkey-assertie
#   uit          schakelaar ssh-ca = false + path-unit uit (veilige richting, geen assertie)
#   ontmantelen  uit + drop-in weg (`sshd -t`, herladen), CA-sleutel blijft (veilige richting)
#   intrekken    serienummers in de KRL (RevokedKeys) — sshd weigert ze meteen, ook binnen de geldigheid (veilige richting)
# De hoofdconfig van sshd wordt nooit herschreven: alleen de eigen drop-in in sshd_config.d (die moet ge-Include't zijn).
set -euo pipefail
umask 077

if [ "$(id -u)" -eq 0 ]; then
  unset MIJN_RUIMTE_SSH_CA_DIR MIJN_RUIMTE_SSH_CA_RECHTEN MIJN_RUIMTE_SSH_CA_INBOX \
    MIJN_RUIMTE_SSH_CA_WERK MIJN_RUIMTE_SSH_CA_UIT MIJN_RUIMTE_SSH_CA_STATUS \
    MIJN_RUIMTE_SSH_CA_GROEP MIJN_RUIMTE_SSH_CA_LIMIET MIJN_RUIMTE_SSH_CA_BEHEER_INBOX \
    MIJN_RUIMTE_SSH_CA_SSHD_DROPIN MIJN_RUIMTE_SSH_CA_SSHD_CONFIG MIJN_RUIMTE_SSH_CA_SSHD_BIN \
    MIJN_RUIMTE_SSH_CA_SYSTEMCTL MIJN_RUIMTE_SSH_CA_PASSKEY MIJN_RUIMTE_SSH_CA_ACCOUNT
fi

CA_DIR="${MIJN_RUIMTE_SSH_CA_DIR:-/etc/mijn-ruimte/ssh-ca}"
RECHTEN="${MIJN_RUIMTE_SSH_CA_RECHTEN:-/etc/mijn-ruimte/mcp-rechten.json}"
INBOX="${MIJN_RUIMTE_SSH_CA_INBOX:-/srv/mijn-ruimte/ssh-ca-inbox}"
WERK="${MIJN_RUIMTE_SSH_CA_WERK:-/var/lib/mijn-ruimte/ssh-ca}"
UIT="${MIJN_RUIMTE_SSH_CA_UIT:-/var/lib/mijn-ruimte/ssh-ca-uit}"
STATUS="${MIJN_RUIMTE_SSH_CA_STATUS:-/var/lib/mijn-ruimte-uitrol-status}"
GROEP="${MIJN_RUIMTE_SSH_CA_GROEP:-mijnruimte}"
LIMIET="${MIJN_RUIMTE_SSH_CA_LIMIET:-12}"
BEHEER_INBOX="${MIJN_RUIMTE_SSH_CA_BEHEER_INBOX:-/srv/mijn-ruimte/ssh-ca-beheer}"
SSHD_DROPIN="${MIJN_RUIMTE_SSH_CA_SSHD_DROPIN:-/etc/ssh/sshd_config.d/50-mijn-ruimte-ssh-ca.conf}"
SSHD_CONFIG="${MIJN_RUIMTE_SSH_CA_SSHD_CONFIG:-/etc/ssh/sshd_config}"
SSHD_BIN="${MIJN_RUIMTE_SSH_CA_SSHD_BIN:-/usr/sbin/sshd}"
SYSTEMCTL="${MIJN_RUIMTE_SSH_CA_SYSTEMCTL:-/usr/bin/systemctl}"
PASSKEY="${MIJN_RUIMTE_SSH_CA_PASSKEY:-/usr/local/sbin/mijn-ruimte-passkey}"
ACCOUNT="${MIJN_RUIMTE_SSH_CA_ACCOUNT:-beheer}"
ID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
case "$LIMIET" in
  ''|*[!0-9]*) LIMIET=12 ;;
esac
if [ "$LIMIET" -lt 1 ] || [ "$LIMIET" -gt 1000 ]; then LIMIET=12; fi

onder_tmp() { case "$1" in /tmp/*|/var/tmp/*) return 0 ;; *) return 1 ;; esac; }
mag_pad() {
  [ "$(id -u)" -eq 0 ] && return 0
  if onder_tmp "$CA_DIR" && onder_tmp "$INBOX" && onder_tmp "$WERK" && onder_tmp "$UIT" && onder_tmp "$STATUS"; then
    # Beheer raakt ook sshd en het rechten-bestand: buiten root alleen als ook die paden testpaden zijn.
    [ "${1:-}" != beheer ] && return 0
    onder_tmp "$BEHEER_INBOX" && onder_tmp "$SSHD_DROPIN" && onder_tmp "$SSHD_CONFIG" && onder_tmp "$RECHTEN" && return 0
  fi
  echo "alleen root" >&2
  exit 1
}

inrichten() {
  mkdir -p -- "$CA_DIR"
  chmod 0700 "$CA_DIR"
  if [ -L "$CA_DIR/ca" ] || [ -L "$CA_DIR/ca.pub" ]; then echo "CA-pad is een symlink" >&2; exit 1; fi
  if [ ! -e "$CA_DIR/ca" ]; then
    /usr/bin/ssh-keygen -q -t ed25519 -f "$CA_DIR/ca" -N "" -C "mijn-ruimte-ssh-ca"
    chmod 0600 "$CA_DIR/ca" "$CA_DIR/ca.pub"
  fi
  echo "Publieke CA-sleutel. De schakelaar ssh-ca blijft uit; sshd wordt niet aangepast."
  echo "Публічний ключ CA. Перемикач ssh-ca лишається вимкненим; sshd не змінюється."
  cat "$CA_DIR/ca.pub"
}

publiek() {
  cat <<'EOT'
TrustedUserCAKeys /etc/mijn-ruimte/ssh-ca/ca.pub
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
# Далі вручну, від root. Цей скрипт sshd не редагує і перемикач не вмикає.
# Daarna met de hand, als root. Dit script bewerkt sshd niet en zet de schakelaar niet aan.
#   echo beheer > /etc/ssh/auth_principals/beheer
#   у mcp-rechten.json: "ssh-ca": true
#   systemctl enable --now mijn-ruimte-ssh-ca.path
# Прапорець ssh-certificaat лише показує кнопку. Право лишається terminal.servers.
EOT
  if [ -f "$CA_DIR/ca.pub" ] && [ ! -L "$CA_DIR/ca.pub" ]; then cat "$CA_DIR/ca.pub"; fi
}

teken_py() {
  /usr/bin/python3 - "$CA_DIR" "$WERK" "$UIT" "$RECHTEN" "$STATUS" "$LIMIET" "$1" "$2" "$GROEP" <<'PY'
import datetime, grp, json, os, re, secrets, subprocess, sys
ca_dir, werk, uit, rechten, status, limiet_s, sid, aanvraag, groep = sys.argv[1:10]
limiet = int(limiet_s)
py = "/usr/bin/ssh-keygen"
PUB = re.compile(r"ssh-ed25519 [A-Za-z0-9+/]{68}\Z")
IDENT = re.compile(r"[A-Za-z0-9._@-]{1,64}\Z")

def schrijf(code, ok, extra=None):
    os.makedirs(uit, exist_ok=True)
    body = {"ok": ok, "code": code}
    if extra:
        body.update(extra)
    doel = os.path.join(uit, sid + ".json")
    tmp = doel + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)
        f.write("\n")
    os.chmod(tmp, 0o640)
    if os.geteuid() == 0:
        try:
            os.chown(tmp, 0, grp.getgrnam(groep).gr_gid)
        except Exception:
            try:
                os.chown(tmp, 0, 0)
            except Exception:
                pass
    os.replace(tmp, doel)

def noteer(code, niveau, uk, nl, vinger=""):
    try:
        os.makedirs(status, exist_ok=True)
        nu = datetime.datetime.now(datetime.timezone.utc)
        regel = {
            "id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4),
            "tijd": nu.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "bron": "ssh-ca", "code": code, "niveau": niveau, "uk": uk[:300], "nl": nl[:300], "tag": sid,
        }
        if vinger and re.fullmatch(r"SHA256:[A-Za-z0-9+/]{43}", vinger):
            regel["vinger"] = vinger
        # Zelfde slot en dezelfde vorm als uitrol/gitops/opdracht (14.10): die herschrijven het bestand onder flock; een losse
        # append zonder slot kon tussen hun lezen en vervangen verdwijnen, en een nieuw bestand kreeg 0600 root (app leest het niet).
        import fcntl
        pad = os.path.join(status, "gebeurtenissen.jsonl")
        with open(os.path.join(status, ".gebeurtenissen.lock"), "a") as slot:
            fcntl.flock(slot, fcntl.LOCK_EX)
            try:
                oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
            except FileNotFoundError:
                oud = []
            tmp = pad + ".ssh-ca.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
            os.chmod(tmp, 0o640)
            if os.geteuid() == 0:
                try:
                    os.chown(tmp, 0, grp.getgrnam(groep).gr_gid)
                except Exception:
                    pass
            os.replace(tmp, pad)
    except Exception:
        return

def weiger(code, uk, nl):
    schrijf(code, False)
    noteer(code, "geweigerd", uk, nl)
    return 0

def schakelaar():
    try:
        with open(rechten, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return False
    return isinstance(d, dict) and d.get("ssh-ca") is True

try:
    st = os.lstat(aanvraag)
    if not os.path.isfile(aanvraag) or os.path.islink(aanvraag):
        sys.exit(0)
    nu = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    if nu - int(st.st_mtime) > 90 or int(st.st_mtime) - nu > 30:
        sys.exit(weiger("SSH_CA_TE_OUD", "Запит на сертифікат застарів.", "Het certificaatverzoek is te oud."))
    raw = open(aanvraag, "rb").read(4096)
    if len(raw) > 2048:
        sys.exit(weiger("SSH_CA_SLEUTEL", "Публічний ключ не прийнято.", "Publieke sleutel niet aanvaard."))
    if not schakelaar():
        sys.exit(weiger("SSH_CA_UIT", "Підпис SSH-сертифікатів вимкнено.", "Ondertekenen van SSH-certificaten staat uit."))
    ca = os.path.join(ca_dir, "ca")
    if not os.path.isfile(ca) or os.path.islink(ca):
        sys.exit(weiger("SSH_CA_NIET_GEREED", "CA ще не створено (mijn-ruimte-ssh-ca inrichten).", "CA bestaat nog niet (mijn-ruimte-ssh-ca inrichten)."))
    try:
        d = json.loads(raw.decode("utf-8"))
    except Exception:
        sys.exit(weiger("SSH_CA_SLEUTEL", "Публічний ключ не прийнято.", "Publieke sleutel niet aanvaard."))
    pub = d.get("publiek") if isinstance(d, dict) else None
    if not isinstance(pub, str) or not PUB.fullmatch(pub):
        sys.exit(weiger("SSH_CA_SLEUTEL", "Потрібен рівно один ключ ssh-ed25519.", "Precies één ssh-ed25519-sleutel is nodig."))
    ident = d.get("identiteit") if isinstance(d, dict) and isinstance(d.get("identiteit"), str) else ""
    if not IDENT.fullmatch(ident):
        ident = "mijn-ruimte"
    # Duur 5–60 min (standaard 60). Velden «principal», «ttl», «opties» van oudere/vijandige verzoeken blijven genegeerd.
    minuten = d.get("minuten", 60) if isinstance(d, dict) else 60
    if not isinstance(minuten, int) or isinstance(minuten, bool) or not (5 <= minuten <= 60):
        sys.exit(weiger("SSH_CA_DUUR", "Термін сертифіката має бути від 5 до 60 хвилин.", "De geldigheid moet tussen 5 en 60 minuten liggen."))
    # Principals: alleen uit de ROOT-lijst toegestaan.json (standaard ["beheer"]); de app vraagt per rol, root beslist.
    try:
        toegestaan = json.load(open(os.path.join(ca_dir, "toegestaan.json"), encoding="utf-8")).get("principals")
    except Exception:
        toegestaan = None
    if not isinstance(toegestaan, list) or not all(isinstance(x, str) and re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", x) for x in toegestaan) or not toegestaan:
        toegestaan = ["beheer"]
    gevraagd = d.get("toegang", ["beheer"]) if isinstance(d, dict) else ["beheer"]
    if not isinstance(gevraagd, list) or not gevraagd or len(gevraagd) > 8 or any((not isinstance(x, str)) or x not in toegestaan for x in gevraagd) or len(set(gevraagd)) != len(gevraagd):
        sys.exit(weiger("SSH_CA_PRINCIPAL", "Цей доступ (principal) сервер не дозволяє.", "Deze toegang (principal) staat de server niet toe."))
    gevraagd = sorted(gevraagd)
    uitgiften = os.path.join(ca_dir, "uitgiften")
    try:
        tijden = [int(x) for x in open(uitgiften, encoding="utf-8") if x.strip().isdigit()]
    except Exception:
        tijden = []
    tijden = [t for t in tijden if nu - t < 3600]
    if len(tijden) >= limiet:
        sys.exit(weiger("SSH_CA_LIMIET", "Забагато сертифікатів за цю годину.", "Te veel certificaten in dit uur."))
    volg = os.path.join(ca_dir, "volgende")
    try:
        n = int(open(volg, encoding="utf-8").read().strip() or "0")
    except Exception:
        n = 0
    n = n + 1 if 0 <= n < 2**62 else 1
    with open(volg, "w", encoding="utf-8") as f:
        f.write(str(n) + "\n")
    os.chmod(volg, 0o600)
    pubpad = os.path.join(werk, sid + ".pub")
    with open(pubpad, "w", encoding="utf-8") as f:
        f.write(pub + "\n")
    os.chmod(pubpad, 0o600)
    # Principals uit de root-lijst, 5–60 min (+5 min speling), alleen permit-pty. Velden principal/ttl/opties in het verzoek tellen niet.
    subprocess.run([py, "-q", "-s", ca, "-I", ident, "-n", ",".join(gevraagd), "-V", "-5m:+%dm" % minuten, "-O", "clear", "-O", "permit-pty", "-z", str(n), pubpad], check=True, timeout=20)
    certpad = os.path.join(werk, sid + "-cert.pub")
    if not os.path.isfile(certpad) or os.path.islink(certpad):
        sys.exit(weiger("SSH_CA_CONTROLE", "Сертифікат не пройшов перевірку.", "Het certificaat kwam niet door de controle."))
    lijst = subprocess.check_output([py, "-L", "-f", certpad], text=True, timeout=20)
    if not lijst.endswith("\n"):
        lijst += "\n"
    if "user certificate" not in lijst.splitlines()[1]:
        raise RuntimeError("geen user certificate")
    def blok(kop):
        m = re.search(r"^        %s\s*(.*)\n((?:                .+\n)*)" % re.escape(kop), lijst, re.M)
        if not m:
            return "", []
        return m.group(1).strip(), [x.strip() for x in m.group(2).splitlines() if x.strip()]
    pr_rest, pr = blok("Principals:")
    principals = pr if pr else ([pr_rest] if pr_rest and pr_rest != "(none)" else [])
    if sorted(principals) != gevraagd:
        raise RuntimeError("principal")
    cr_rest, cr = blok("Critical Options:")
    if cr_rest != "(none)" or cr:
        raise RuntimeError("critical")
    ex_rest, ex = blok("Extensions:")
    exts = ex if ex else ([ex_rest] if ex_rest and ex_rest != "(none)" else [])
    if exts != ["permit-pty"]:
        raise RuntimeError("extensions")
    vm = re.search(r"Valid: from (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}) to (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})", lijst)
    if not vm:
        raise RuntimeError("geldigheid")
    fmt = "%Y-%m-%dT%H:%M:%S"
    delta = (datetime.datetime.strptime(vm.group(2), fmt) - datetime.datetime.strptime(vm.group(1), fmt)).total_seconds()
    if not ((minuten + 4) * 60 <= delta <= (minuten + 6) * 60):
        raise RuntimeError("duur")
    if not re.search(r'^        Key ID: "%s"$' % re.escape(ident), lijst, re.M):
        raise RuntimeError("key id")
    lf = subprocess.check_output([py, "-lf", certpad], text=True, timeout=20)
    vm2 = re.search(r"(SHA256:[A-Za-z0-9+/]{43})", lf)
    if not vm2:
        raise RuntimeError("vinger")
    vinger = vm2.group(1)
    cert = open(certpad, encoding="utf-8").read().strip()
    if "\n" in cert or not cert.startswith("ssh-ed25519-cert-v01@openssh.com "):
        raise RuntimeError("cert-regel")
    # Alleen type + sleutel (14.10): zonder commentaar zet ssh-keygen het PAD van het invoerbestand achter het certificaat
    # (/var/lib/mijn-ruimte/ssh-ca/<id>.pub). Dat lekte een serverpad naar de browser en de site weigerde de regel (SSH_CA_CONTROLE).
    delen = cert.split()
    if len(delen) < 2 or not re.fullmatch(r"[A-Za-z0-9+/=]{20,2000}", delen[1]):
        raise RuntimeError("cert-regel")
    cert = delen[0] + " " + delen[1]
    tijden.append(nu)
    with open(uitgiften, "w", encoding="utf-8") as f:
        f.write("\n".join(str(t) for t in tijden) + "\n")
    os.chmod(uitgiften, 0o600)
    schrijf("SSH_CA_OK", True, {"cert": cert, "geldigTot": vm.group(2), "vinger": vinger, "principal": gevraagd[0], "principals": gevraagd, "minuten": minuten, "serie": n})
    noteer("SSH_CA_OK", "info", "Сертифікат SSH №%d для %s на %d хв: %s." % (n, ident, minuten, ", ".join(gevraagd)), "SSH-certificaat nr. %d voor %s, %d min: %s." % (n, ident, minuten, ", ".join(gevraagd)), vinger)
except subprocess.CalledProcessError:
    weiger("SSH_CA_CONTROLE", "Сертифікат не пройшов перевірку.", "Het certificaat kwam niet door de controle.")
except Exception:
    try:
        os.remove(os.path.join(werk, sid + "-cert.pub"))
    except Exception:
        pass
    weiger("SSH_CA_CONTROLE", "Сертифікат не пройшов перевірку.", "Het certificaat kwam niet door de controle.")
PY
}

# Beheer vanaf de site. Alles (inbox lezen, verplaatsen, opruimen, rechten-bestand, drop-in, KRL) gebeurt in Python met
# padcontrole; bash roept het alleen aan onder het slot. Argument "status" = alleen de stand schrijven (geen inbox).
beheer_py() {
  /usr/bin/python3 - "$CA_DIR" "$WERK" "$UIT" "$RECHTEN" "$STATUS" "$GROEP" "$BEHEER_INBOX" "$SSHD_DROPIN" "$SSHD_CONFIG" \
    "$SSHD_BIN" "$SYSTEMCTL" "$PASSKEY" "$ACCOUNT" "$1" <<'PY'
import datetime, fnmatch, glob, grp, json, os, re, secrets, stat, subprocess, sys
(ca_dir, werk, uit, rechten, status_dir, groep, inbox, dropin, sshd_config, sshd_bin, systemctl, passkey, account,
 modus) = sys.argv[1:15]
KG = "/usr/bin/ssh-keygen"
ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z")
ACC = re.compile(r"[a-z_][a-z0-9_-]{0,31}\Z")
ACTIES = ("status", "inrichten", "aan", "uit", "ontmantelen", "intrekken")
PATH_UNIT = "mijn-ruimte-ssh-ca.path"
if not ACC.fullmatch(account):
    account = "beheer"
ca, ca_pub, krl = os.path.join(ca_dir, "ca"), os.path.join(ca_dir, "ca.pub"), os.path.join(ca_dir, "krl")
reeks = os.path.join(ca_dir, "krl-series")
pr_dir = os.path.join(ca_dir, "principals")

def nu():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def groep_lezen(pad):
    os.chmod(pad, 0o640)
    if os.geteuid() == 0:
        try:
            os.chown(pad, 0, grp.getgrnam(groep).gr_gid)
        except Exception:
            pass

def schrijf_json(doel, body):
    os.makedirs(uit, exist_ok=True)
    tmp = doel + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)
        f.write("\n")
    groep_lezen(tmp)
    os.replace(tmp, doel)

def noteer(code, niveau, uk, nl, tag):
    try:
        import fcntl
        os.makedirs(status_dir, exist_ok=True)
        t = datetime.datetime.now(datetime.timezone.utc)
        regel = {"id": t.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": t.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                 "bron": "ssh-ca", "code": code, "niveau": niveau, "uk": uk[:300], "nl": nl[:300], "tag": tag}
        pad = os.path.join(status_dir, "gebeurtenissen.jsonl")
        with open(os.path.join(status_dir, ".gebeurtenissen.lock"), "a") as slot:
            fcntl.flock(slot, fcntl.LOCK_EX)
            try:
                oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
            except FileNotFoundError:
                oud = []
            tmp = pad + ".ssh-ca.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
            groep_lezen(tmp)
            os.replace(tmp, pad)
    except Exception:
        return

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

def zet_schakelaar(waarde):
    d, st = lees_rechten()
    if d is None:
        raise Fout("SSH_CA_RECHTEN", "Файл перемикачів пошкоджений — нічого не змінено.", "Het schakelaarbestand is beschadigd — niets gewijzigd.")
    d["ssh-ca"] = bool(waarde)
    tmp = rechten + ".ssh-ca.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    if st is not None:
        os.chmod(tmp, stat.S_IMODE(st.st_mode))
        if os.geteuid() == 0:
            os.chown(tmp, st.st_uid, st.st_gid)
    else:
        groep_lezen(tmp)
    os.replace(tmp, rechten)

def run(argv, timeout=20):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or ""), (p.stderr or "")
    except Exception as e:
        return 127, "", str(e)

class Fout(Exception):
    def __init__(self, code, uk, nl, detail=""):
        super().__init__(code)
        self.code, self.uk, self.nl, self.detail = code, uk, nl, detail

def include_dekt():
    try:
        tekst = open(sshd_config, encoding="utf-8").read()
    except Exception:
        return False
    basis = os.path.dirname(sshd_config)
    for regel in tekst.splitlines():
        m = re.match(r"\s*Include\s+(.+?)\s*$", regel, re.I)
        if not m:
            continue
        for patroon in m.group(1).split():
            if not patroon.startswith("/"):
                patroon = os.path.join(basis, patroon)
            if fnmatch.fnmatch(dropin, patroon):
                return True
    return False

def effectief():
    code, out, err = run([sshd_bin, "-T", "-f", sshd_config, "-C", "user=" + account + ",host=localhost,addr=127.0.0.1"])
    if code != 0:
        return {}
    w = {}
    for regel in out.splitlines():
        k, _, v = regel.partition(" ")
        w.setdefault(k.lower(), v.strip())
    return w

def vinger():
    if not os.path.isfile(ca_pub):
        return ""
    code, out, _ = run([KG, "-l", "-E", "sha256", "-f", ca_pub])
    m = re.search(r"SHA256:[A-Za-z0-9+/]{43}", out) if code == 0 else None
    return m.group(0) if m else ""

def ingetrokken():
    try:
        return [int(x) for x in open(reeks, encoding="utf-8").read().split() if x.isdigit()]
    except FileNotFoundError:
        return []

def toegestaan():
    try:
        d = json.load(open(os.path.join(ca_dir, "toegestaan.json"), encoding="utf-8"))
        p = [x for x in d.get("principals", []) if isinstance(x, str) and ACC.fullmatch(x)]
        return sorted(set(p)) or ["beheer"]
    except Exception:
        return ["beheer"]

def stand():
    d, _ = lees_rechten()
    w = effectief()
    sleutel = os.path.isfile(ca) and not os.path.islink(ca) and os.path.isfile(ca_pub)
    vertrouwt = bool(sleutel and os.path.isfile(dropin) and w.get("trustedusercakeys") == ca_pub)
    krl_actief = bool(vertrouwt and w.get("revokedkeys") == krl and os.path.isfile(krl))
    code, out, _ = run([systemctl, "is-enabled", PATH_UNIT], 5)
    return {
        "bijgewerkt": nu(), "ca": sleutel, "vinger": vinger(), "include": include_dekt(), "dropin": os.path.isfile(dropin),
        "sshdVertrouwt": vertrouwt, "krl": krl_actief, "ingetrokken": len(ingetrokken()),
        "schakelaar": bool(d is not None and d.get("ssh-ca") is True), "pathUnit": out.strip() == "enabled",
        "account": account, "principals": toegestaan(),
    }

def schrijf_stand():
    s = stand()
    schrijf_json(os.path.join(uit, "beheer-status.json"), s)
    return s

def krl_bouwen(series):
    spec = os.path.join(ca_dir, "krl.spec")
    with open(spec, "w", encoding="utf-8") as f:
        for n in sorted(set(series)):
            f.write("serial: %d\n" % n)
    nieuw = krl + ".nieuw"
    code, _, err = run([KG, "-q", "-k", "-f", nieuw, "-s", ca_pub, spec])
    if code != 0:
        raise Fout("SSH_CA_KRL", "Не вдалося зібрати список відкликаних (KRL).", "De intrekkingslijst (KRL) kon niet worden gebouwd.", err[-300:])
    os.chmod(nieuw, 0o644)
    os.replace(nieuw, krl)
    tmp = reeks + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("".join("%d\n" % n for n in sorted(set(series))))
    os.chmod(tmp, 0o600)
    os.replace(tmp, reeks)

def dropin_tekst():
    return ("# Mijn Ruimte SSH-CA — beheerd door mijn-ruimte-ssh-ca beheer, niet met de hand wijzigen.\n"
            "TrustedUserCAKeys %s\nRevokedKeys %s\nAuthorizedPrincipalsFile %s/%%u\n" % (ca_pub, krl, pr_dir))

def sshd_wissel(nieuw_inhoud):
    """Schrijf (of verwijder bij None) de drop-in, `sshd -t`, herlaad; bij elke fout terug naar de vorige toestand."""
    try:
        vorig = open(dropin, encoding="utf-8").read()
    except FileNotFoundError:
        vorig = None
    if os.path.islink(dropin):
        raise Fout("SSH_CA_SSHD_ONGELDIG", "Drop-in sshd — символьне посилання; нічого не змінено.", "De sshd-drop-in is een symlink; niets gewijzigd.")
    def zet(inhoud):
        if inhoud is None:
            if os.path.lexists(dropin):
                os.remove(dropin)
            return
        os.makedirs(os.path.dirname(dropin), exist_ok=True)
        tmp = dropin + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(inhoud)
        os.chmod(tmp, 0o644)
        os.replace(tmp, dropin)
    zet(nieuw_inhoud)
    code, _, err = run([sshd_bin, "-t", "-f", sshd_config])
    if code != 0:
        zet(vorig)
        raise Fout("SSH_CA_SSHD_ONGELDIG", "sshd -t відхилив конфігурацію — повернуто попередню, sshd не перезавантажено.",
                   "sshd -t keurde de configuratie af — vorige teruggezet, sshd niet herladen.", err[-300:])
    code, _, err = run([systemctl, "reload", "ssh.service"])
    if code != 0:
        code2, _, err2 = run([systemctl, "reload", "sshd.service"])
        if code2 != 0:
            zet(vorig)
            run([systemctl, "reload", "ssh.service"])
            raise Fout("SSH_CA_SSHD_HERLADEN", "sshd не перезавантажився — повернуто попередню конфігурацію.",
                       "sshd herladen mislukte — vorige configuratie teruggezet.", (err + err2)[-300:])

def passkey_ok(pad, actie):
    code, out, err = run([passkey, "verifieer-ssh-ca", pad, actie], 30)
    if code != 0:
        raise Fout("SSH_CA_PASSKEY", "Root не підтвердив passkey — нічого не змінено.", "Root heeft de passkey niet bevestigd — niets gewijzigd.", (out + err)[-200:])

def inrichten(pad):
    passkey_ok(pad, "inrichten")
    if not include_dekt():
        raise Fout("SSH_CA_SSHD_GEEN_INCLUDE", "sshd_config не підключає sshd_config.d — головний файл не редагуємо, додайте Include вручну.",
                   "sshd_config neemt sshd_config.d niet op — de hoofdconfig wordt niet bewerkt; voeg Include met de hand toe.")
    os.makedirs(ca_dir, exist_ok=True)
    os.chmod(ca_dir, 0o700)
    if os.path.islink(ca) or os.path.islink(ca_pub):
        raise Fout("SSH_CA_CONTROLE", "Шлях CA — символьне посилання.", "Het CA-pad is een symlink.")
    if not os.path.exists(ca):
        code, _, err = run([KG, "-q", "-t", "ed25519", "-f", ca, "-N", "", "-C", "mijn-ruimte-ssh-ca"])
        if code != 0:
            raise Fout("SSH_CA_CONTROLE", "Не вдалося створити CA-ключ.", "De CA-sleutel kon niet worden gemaakt.", err[-200:])
        os.chmod(ca, 0o600)
        os.chmod(ca_pub, 0o644)
    if not os.path.isfile(krl):
        krl_bouwen(ingetrokken())
    os.makedirs(pr_dir, exist_ok=True)
    os.chmod(pr_dir, 0o755)
    pf = os.path.join(pr_dir, account)
    with open(pf + ".tmp", "w", encoding="utf-8") as f:
        f.write("".join(p + "\n" for p in toegestaan()))
    os.chmod(pf + ".tmp", 0o644)
    os.replace(pf + ".tmp", pf)
    sshd_wissel(dropin_tekst())
    if effectief().get("trustedusercakeys") != ca_pub:
        sshd_wissel(None)
        raise Fout("SSH_CA_SSHD_NIET_ACTIEF", "sshd бере TrustedUserCAKeys з іншого місця — drop-in знято.",
                   "sshd neemt TrustedUserCAKeys van elders — drop-in weggehaald.")

def verwerk_een(pad, rid, d):
    actie = str(d.get("actie", ""))
    if actie not in ACTIES:
        raise Fout("SSH_CA_ACTIE", "Невідома дія.", "Onbekende actie.")
    extra = {}
    if actie == "inrichten":
        inrichten(pad)
    elif actie == "aan":
        passkey_ok(pad, "aan")
        s = stand()
        if not (s["ca"] and s["sshdVertrouwt"]):
            raise Fout("SSH_CA_NIET_GEREED", "Спершу «Підготувати»: CA-ключ і довіра sshd.", "Eerst «Voorbereiden»: CA-sleutel en sshd-vertrouwen.")
        zet_schakelaar(True)
        run([systemctl, "enable", "--now", PATH_UNIT])
    elif actie == "uit":
        zet_schakelaar(False)
        run([systemctl, "disable", "--now", PATH_UNIT])
    elif actie == "ontmantelen":
        zet_schakelaar(False)
        run([systemctl, "disable", "--now", PATH_UNIT])
        if os.path.lexists(dropin):
            sshd_wissel(None)
    elif actie == "intrekken":
        series = d.get("series")
        if not isinstance(series, list) or not 1 <= len(series) <= 100 or not all(isinstance(n, int) and not isinstance(n, bool) and 1 <= n < 2 ** 63 for n in series):
            raise Fout("SSH_CA_SERIE", "Некоректні серійні номери.", "Ongeldige serienummers.")
        if not os.path.isfile(ca_pub):
            raise Fout("SSH_CA_NIET_GEREED", "CA-ключа ще немає.", "Er is nog geen CA-sleutel.")
        krl_bouwen(ingetrokken() + series)
        extra["ingetrokken"] = sorted(set(series))
    return extra

def verwerk_inbox():
    os.makedirs(werk, exist_ok=True)
    os.chmod(werk, 0o700)
    try:
        namen = [n for n in os.listdir(inbox) if n.endswith(".json")]
    except FileNotFoundError:
        return
    def ouderdom(n):
        try:
            return os.lstat(os.path.join(inbox, n)).st_mtime
        except Exception:
            return 0
    for naam in sorted(namen, key=ouderdom)[:20]:
        rid = naam[:-5]
        bron = os.path.join(inbox, naam)
        if os.path.dirname(bron) != inbox:
            continue
        try:
            st = os.lstat(bron)
        except FileNotFoundError:
            continue
        if not ID.fullmatch(rid) or not stat.S_ISREG(st.st_mode) or st.st_size > 65536:
            try:
                os.remove(bron)
            except Exception:
                pass
            continue
        doel = os.path.join(werk, "beheer-" + rid + ".json")
        try:
            os.replace(bron, doel)
        except Exception:
            continue
        resultaat = {"id": rid, "ok": False, "code": "SSH_CA_CONTROLE", "op": nu()}
        try:
            st2 = os.lstat(doel)
            if not stat.S_ISREG(st2.st_mode):
                raise Fout("SSH_CA_CONTROLE", "Запит не є файлом.", "Het verzoek is geen bestand.")
            ouder = datetime.datetime.now().timestamp() - st2.st_mtime
            if ouder > 300:
                raise Fout("SSH_CA_TE_OUD", "Запит застарів.", "Het verzoek is verlopen.")
            with open(doel, encoding="utf-8") as f:
                d = json.load(f)
            if not isinstance(d, dict) or d.get("id") != rid:
                raise Fout("SSH_CA_CONTROLE", "Запит пошкоджений.", "Het verzoek is beschadigd.")
            resultaat["actie"] = str(d.get("actie", ""))[:20]
            resultaat.update(verwerk_een(doel, rid, d))
            resultaat.update({"ok": True, "code": "OK"})
            noteer("SSH_CA_BEHEER_" + resultaat["actie"].upper(), "ok", "SSH-CA: " + resultaat["actie"], "SSH-CA: " + resultaat["actie"], rid)
        except Fout as e:
            resultaat.update({"code": e.code, "uk": e.uk, "nl": e.nl})
            if e.detail:
                resultaat["detail"] = re.sub(r"[^\x20-\x7e]", " ", e.detail)[-300:]
            noteer(e.code, "geweigerd", e.uk, e.nl, rid)
        except Exception as e:
            resultaat.update({"code": "SSH_CA_CONTROLE", "uk": "Внутрішня помилка root-скрипта.", "nl": "Interne fout in het root-script."})
        finally:
            try:
                os.remove(doel)
            except Exception:
                pass
        try:
            resultaat["stand"] = schrijf_stand()
        except Exception:
            pass
        schrijf_json(os.path.join(uit, "beheer-" + rid + ".json"), resultaat)

if modus == "status":
    schrijf_stand()
else:
    verwerk_inbox()
    schrijf_stand()
PY
}

beheer() {
  mkdir -p -- "$WERK" "$UIT"
  chmod 0700 "$WERK" 2>/dev/null || true
  ( flock 9; beheer_py "${1:-inbox}" ) 9>"$WERK/.beheer.lock"
}

tekenen_een() {
  local id="$1" bron="$2"
  [[ "$id" =~ $ID_RE ]] || return 2
  [ -e "$bron" ] || return 0
  if [ -L "$bron" ] || [ ! -f "$bron" ]; then
    rm -f -- "$bron"
    return 0
  fi
  mkdir -p -- "$WERK" "$UIT"
  chmod 0700 "$WERK" 2>/dev/null || true
  local doel="$WERK/$id.json"
  (
    flock 9
    mv -n -- "$bron" "$doel" || exit 0
    if [ -L "$doel" ] || [ ! -f "$doel" ]; then rm -f -- "$doel"; exit 0; fi
    teken_py "$id" "$doel" || true
    rm -f -- "$doel" "$WERK/$id.pub" "$WERK/$id-cert.pub"
  ) 9>"$WERK/.lock"
}

# Alle verzoeken in de inbox (oudste eerst, hoogstens 20 per ronde): de path-unit vuurt niet opnieuw voor een bestand dat
# binnenkwam terwijl deze dienst al liep, dus één per ronde liet een tweede verzoek liggen tot het «te oud» was.
verwerk() {
  mkdir -p -- "$INBOX" "$WERK" "$UIT"
  local regel base id n=0
  while [ "$n" -lt 20 ]; do
    regel="$(find "$INBOX" -maxdepth 1 -type f -name '*.json' -printf '%T@ %f\n' 2>/dev/null | sort -n | head -1 || true)"
    [ -n "$regel" ] || return 0
    base="${regel#* }"
    id="${base%.json}"
    n=$((n + 1))
    if [[ ! "$id" =~ $ID_RE ]] || [ "$base" != "$id.json" ]; then
      rm -f -- "$INBOX/$base"
      continue
    fi
    tekenen_een "$id" "$INBOX/$base"
    # Lag het bestand er nog (bv. symlink-weigering zonder verwijderen), dan niet eindeloos herhalen.
    [ -e "$INBOX/$base" ] && rm -f -- "$INBOX/$base"
  done
}

cmd="${1:-}"
shift || true
case "$cmd" in
  inrichten) mag_pad; inrichten ;;
  publiek) publiek ;;
  verwerk) mag_pad; verwerk ;;
  beheer) mag_pad beheer; beheer inbox ;;
  status) mag_pad beheer; beheer status ;;
  tekenen)
    id="${1:-}"
    mag_pad
    [[ "$id" =~ $ID_RE ]] || { echo "id ongeldig" >&2; exit 2; }
    tekenen_een "$id" "$INBOX/$id.json"
    ;;
  *) echo "gebruik: $0 inrichten | publiek | verwerk | beheer | status | tekenen <id>" >&2; exit 2 ;;
esac
