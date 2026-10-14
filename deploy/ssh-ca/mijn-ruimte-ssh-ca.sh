#!/bin/bash
# SSH-CA (etap C, deel 2). Root tekent een gebruikerscertificaat van 60 minuten voor principal «beheer»,
# met alleen permit-pty. De app kan dit niet zelf: schakelaar "ssh-ca" in mcp-rechten.json ontbreekt of is
# iets anders dan true → geen handtekening. Dit script wijzigt sshd nooit en zet de schakelaar nooit aan.
# De sleutel ontstaat alleen door het commando `inrichten`, niet door een installatie van de site.
set -euo pipefail
umask 077

if [ "$(id -u)" -eq 0 ]; then
  unset MIJN_RUIMTE_SSH_CA_DIR MIJN_RUIMTE_SSH_CA_RECHTEN MIJN_RUIMTE_SSH_CA_INBOX \
    MIJN_RUIMTE_SSH_CA_WERK MIJN_RUIMTE_SSH_CA_UIT MIJN_RUIMTE_SSH_CA_STATUS \
    MIJN_RUIMTE_SSH_CA_GROEP MIJN_RUIMTE_SSH_CA_LIMIET
fi

CA_DIR="${MIJN_RUIMTE_SSH_CA_DIR:-/etc/mijn-ruimte/ssh-ca}"
RECHTEN="${MIJN_RUIMTE_SSH_CA_RECHTEN:-/etc/mijn-ruimte/mcp-rechten.json}"
INBOX="${MIJN_RUIMTE_SSH_CA_INBOX:-/srv/mijn-ruimte/ssh-ca-inbox}"
WERK="${MIJN_RUIMTE_SSH_CA_WERK:-/var/lib/mijn-ruimte/ssh-ca}"
UIT="${MIJN_RUIMTE_SSH_CA_UIT:-/var/lib/mijn-ruimte/ssh-ca-uit}"
STATUS="${MIJN_RUIMTE_SSH_CA_STATUS:-/var/lib/mijn-ruimte-uitrol-status}"
GROEP="${MIJN_RUIMTE_SSH_CA_GROEP:-mijnruimte}"
LIMIET="${MIJN_RUIMTE_SSH_CA_LIMIET:-12}"
ID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
case "$LIMIET" in
  ''|*[!0-9]*) LIMIET=12 ;;
esac
if [ "$LIMIET" -lt 1 ] || [ "$LIMIET" -gt 1000 ]; then LIMIET=12; fi

onder_tmp() { case "$1" in /tmp/*|/var/tmp/*) return 0 ;; *) return 1 ;; esac; }
mag_pad() {
  [ "$(id -u)" -eq 0 ] && return 0
  onder_tmp "$CA_DIR" && onder_tmp "$INBOX" && onder_tmp "$WERK" && onder_tmp "$UIT" && onder_tmp "$STATUS" && return 0
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
        with open(os.path.join(status, "gebeurtenissen.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(regel, ensure_ascii=False) + "\n")
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
    # Vast: principal beheer, 60 min (+5 min speling), alleen permit-pty. Velden principal/ttl/opties in het verzoek worden genegeerd.
    subprocess.run([py, "-q", "-s", ca, "-I", ident, "-n", "beheer", "-V", "-5m:+60m", "-O", "clear", "-O", "permit-pty", "-z", str(n), pubpad], check=True, timeout=20)
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
    if principals != ["beheer"]:
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
    if not (64 * 60 <= delta <= 66 * 60):
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
    tijden.append(nu)
    with open(uitgiften, "w", encoding="utf-8") as f:
        f.write("\n".join(str(t) for t in tijden) + "\n")
    os.chmod(uitgiften, 0o600)
    schrijf("SSH_CA_OK", True, {"cert": cert, "geldigTot": vm.group(2), "vinger": vinger, "principal": "beheer"})
    noteer("SSH_CA_OK", "info", "Сертифікат SSH для %s на 60 хв, лише beheer." % ident, "SSH-certificaat voor %s, 60 min, alleen beheer." % ident, vinger)
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

verwerk() {
  mkdir -p -- "$INBOX" "$WERK" "$UIT"
  local regel base id
  regel="$(find "$INBOX" -maxdepth 1 -type f -name '*.json' -printf '%T@ %f\n' 2>/dev/null | sort -n | head -1 || true)"
  [ -n "$regel" ] || return 0
  base="${regel#* }"
  id="${base%.json}"
  if [[ ! "$id" =~ $ID_RE ]] || [ "$base" != "$id.json" ]; then
    rm -f -- "$INBOX/$base"
    return 0
  fi
  tekenen_een "$id" "$INBOX/$base"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  inrichten) mag_pad; inrichten ;;
  publiek) publiek ;;
  verwerk) mag_pad; verwerk ;;
  tekenen)
    id="${1:-}"
    mag_pad
    [[ "$id" =~ $ID_RE ]] || { echo "id ongeldig" >&2; exit 2; }
    tekenen_een "$id" "$INBOX/$id.json"
    ;;
  *) echo "gebruik: $0 inrichten | publiek | verwerk | tekenen <id>" >&2; exit 2 ;;
esac
