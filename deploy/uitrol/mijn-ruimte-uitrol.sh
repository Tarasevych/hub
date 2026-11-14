#!/usr/bin/env bash
# mijn-ruimte-uitrol.sh — veilige uitrol van een ONDERTEKEND releasepakket (vervangt mijn-ruimte-mcp-doen en de sudo-regel).
# Geïnstalleerd als /usr/local/sbin/mijn-ruimte-uitrol (root:root 0755), gestart door mijn-ruimte-uitrol.path zodra er iets in de
# inbox verandert. Draait als root, maar voert NOOIT code uit die niet met de uitrolsleutel van de eigenaar is ondertekend:
#
#   1. De app/MCP-dienst (gebruiker mijnruimte) kan alleen twee bestanden in de inbox leggen:
#        mijn-ruimte-<JJJJMMDD-UUMMSS>.tar.gz   en   mijn-ruimte-<JJJJMMDD-UUMMSS>.tar.gz.sig
#   2. Dit script KOPIEERT beide eerst naar een eigen root-map (0700) en controleert daarna alleen die kopie (geen TOCTOU:
#      wat in de inbox gebeurt nadat de kopie is gemaakt, telt niet meer).
#   3. Handtekening: `ssh-keygen -Y verify` met de publieke sleutel(s) in /etc/mijn-ruimte/uitrol-ondertekenaars (root-eigendom,
#      niet schrijfbaar voor groep/anderen), identiteit uitrol@mijn-ruimte, naamruimte mijn-ruimte-uitrol. De privésleutel staat
#      alleen op de pc van de eigenaar (met wachtwoordzin), nooit op de server.
#   4. Het pakket bevat UITROL-VERSIE; die moet gelijk zijn aan de versie in de bestandsnaam (de naam zelf is niet ondertekend) en
#      NIEUWER dan de laatst uitgerolde versie (geen terugrol naar een oud, wel ondertekend pakket via deze weg; terugdraaien gaat
#      met `installeer-app.sh terugdraaien` via SSH).
#   5. Het archief mag alleen gewone bestanden en mappen bevatten: geen symlinks, hardlinks, apparaten, absolute paden of "..".
#   6. Pas dan: installeer-app.sh installeren <uitgepakte bron> (bouwen, back-up, migreren, activeren, gezondheidscontrole).
# Uitkomst in /var/lib/mijn-ruimte-uitrol-status/status.json (root:mijnruimte 0640), zodat de app/MCP de stand kan tonen.
# Tweetalige meldingen staan in de status (Oekraïens + Nederlands); het logboek (journal) is Nederlands.
#
# Tweede modus `mijn-ruimte-uitrol --goedkeuring` (mijn-ruimte-goedkeuring.path; zie RUNBOOK-VEILIGE-UITROL.md §13):
#   andere inbox (/srv/mijn-ruimte/goedkeur-inbox, schrijfbaar voor de app) en in plaats van een .sig een
#   mijn-ruimte-<versie>.tar.gz.goedkeuring.json met een WebAuthn-assertie van de passkey van de eigenaar. Stap 3 wordt dan
#   `mijn-ruimte-passkey verifieer-goedkeuring` (root controleert zelf: sleutel uit /etc/mijn-ruimte/goedkeur-passkeys.json,
#   challenge = hash van sha256 van DEZE kopie + versie + voorstel-id + nonce + vervaltijd, rpId, origin, UV, teller, nonce eenmalig).
#   Stappen 4–6 (inhoud, versie, installeren) zijn voor beide modi gelijk. Een .sig in de goedkeur-inbox telt niet, en een
#   goedkeuring in de gewone inbox ook niet: de twee wegen blijven gescheiden.
set -euo pipefail
MODUS=handtekening
if [ "${1:-}" = "--goedkeuring" ]; then MODUS=passkey; fi
umask 077
export LC_ALL=C

# Overschrijven van paden kan alleen in tests (niet als root): de root-dienst gebruikt altijd de vaste paden.
if [ "$(id -u)" -eq 0 ]; then
  unset UITROL_INBOX UITROL_WERK UITROL_STATUS_DIR UITROL_ONDERTEKENAARS UITROL_INSTALLEER UITROL_LOCK UITROL_MAX_BYTES UITROL_GROEP \
        UITROL_GOEDKEUR_INBOX UITROL_GOEDKEUR_HULP UITROL_TEST_BREEK UITROL_PAKKETTEN_DIR UITROL_ACTIEF_LINK 2>/dev/null || true
fi
if [ "$MODUS" = passkey ]; then INBOX="${UITROL_GOEDKEUR_INBOX:-/srv/mijn-ruimte/goedkeur-inbox}"; else INBOX="${UITROL_INBOX:-/srv/mijn-ruimte/uitrol-inbox}"; fi
# Root: altijd de vaste hulp (wist de omgeving, neemt de vergrendeling). Tests: "node <pad>/goedkeur-hulp.mjs".
GOEDKEUR_HULP="${UITROL_GOEDKEUR_HULP:-/usr/local/sbin/mijn-ruimte-passkey}"
WERK_ROOT="${UITROL_WERK:-/var/lib/mijn-ruimte-uitrol}"
STATUS_DIR="${UITROL_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
ONDERTEKENAARS="${UITROL_ONDERTEKENAARS:-/etc/mijn-ruimte/uitrol-ondertekenaars}"
INSTALLEER="${UITROL_INSTALLEER:-}"          # leeg = deploy/installeer-app.sh uit het (gecontroleerde) pakket
LOCK="${UITROL_LOCK:-/run/lock/mijn-ruimte-uitrol.lock}"
MAX_BYTES="${UITROL_MAX_BYTES:-314572800}"    # 300 MB
GROEP="${UITROL_GROEP:-mijnruimte}"
IDENTITEIT="uitrol@mijn-ruimte"
NAAMRUIMTE="mijn-ruimte-uitrol"
PATROON='^mijn-ruimte-([0-9]{8}-[0-9]{6})\.tar\.gz$'

log() {
  echo "[uitrol] $*" >&2
  # Dezelfde regel gaat in tijdvolgorde naar het ene logboek van deze run (installeer.log; het installatiescript schrijft er ook in),
  # zodat de site de controles én de installatie als één doorlopend verhaal toont en de regelnummers stabiel blijven.
  if [ -n "${WERK:-}" ] && [ -d "$WERK" ]; then printf '[uitrol] %s\n' "$*" >> "$WERK/installeer.log" 2>/dev/null || true; fi
}
mkdir -p "$WERK_ROOT" "$STATUS_DIR"
chmod 0700 "$WERK_ROOT"

# Oorzaak van een mislukking (audit 18.10.2026, punt 6): REDEN_TEKST = de eerste echte foutregel, CONTEXT_BESTAND = enkele regels eromheen.
# Beide zijn leeg bij een geslaagde of geweigerde run; status.json en de gebeurtenis krijgen dan geen «reden»/«context».
REDEN_TEKST=""; CONTEXT_BESTAND=""
status() { # status <staat> <code> <uk> <nl> [versie]
  local tmp; tmp="$(mktemp "$STATUS_DIR/.status.XXXXXX")"
  python3 - "$tmp" "$1" "$2" "$3" "$4" "${5:-}" "$MODUS" "$REDEN_TEKST" "$CONTEXT_BESTAND" <<'PY'
import json, sys, datetime, os
path, staat, code, uk, nl, versie, methode, reden, ctx = sys.argv[1:10]
# UITROL-UTF8-001: tekst uit argv kan ongeldige UTF-8 bevatten (los surrogaat → json.dump faalt); maak er U+FFFD van.
# Текст з argv може містити невалідний UTF-8 (сурогат ламає json.dump) — замінюємо на U+FFFD.
uk, nl, reden = (os.fsencode(t).decode("utf-8", "replace") for t in (uk, nl, reden))
d = {"staat": staat, "code": code, "uk": uk, "nl": nl, "versie": versie, "methode": methode,
     "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat()}
if reden.strip():
    d["reden"] = reden.strip()[:400]
if ctx and os.path.isfile(ctx):
    try:
        d["context"] = [r[:300] for r in open(ctx, encoding="utf-8", errors="replace").read().splitlines() if r.strip()][:8]
    except OSError:
        pass
with open(path, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False)
PY
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATUS_DIR/status.json"
}

gebeurtenis() { # gebeurtenis <code> <niveau> <uk> <nl>  (zelfde vorm als gitops; de app neemt ze op in de audit)
  (
    flock 7
    tmp="$(mktemp "$STATUS_DIR/.gebeurtenis.XXXXXX")"
    python3 - "$STATUS_DIR/gebeurtenissen.jsonl" "$tmp" uitrol "$1" "$2" "$3" "$4" "${VERSIE:-}" "$MODUS" "$REDEN_TEKST" "$CONTEXT_BESTAND" <<'PY'
import json, sys, datetime, secrets, os
pad, tmp, bron, code, niveau, uk, nl, tag, herkomst, reden, ctx = sys.argv[1:12]
# UITROL-UTF8-001: zonder dit liet één ongeldig teken (bv. half Cyrillisch teken uit AUTEUR) python falen → onder `set -e` stierf het
# script vóór de OK-regel. Невалідні байти → U+FFFD, щоб журнал подій ніколи не ламався.
uk, nl, tag, reden = (os.fsencode(t).decode("utf-8", "replace") for t in (uk, nl, tag, reden))
nu = datetime.datetime.now(datetime.timezone.utc)
regel_d = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(), "bron": bron,
           "code": code, "niveau": niveau, "uk": uk, "nl": nl, "tag": tag}
if herkomst in ("passkey", "handtekening"):
    regel_d["herkomst"] = herkomst
# Oorzaak (alleen bij een mislukking): de echte foutregel + context, zodat de site «Причина» kan tonen in plaats van «mislukt».
if reden.strip():
    regel_d["reden"] = reden.strip()[:400]
if ctx and os.path.isfile(ctx):
    try:
        regel_d["context"] = [r[:300] for r in open(ctx, encoding="utf-8", errors="replace").read().splitlines() if r.strip()][:8]
    except OSError:
        pass
# Alleen bij de OK-uitkomst: pad/sha256/grootte van het bewaarde archief (pakket_bewaren), zodat de app ze bij de run bewaart.
if code == "OK":
    try:
        extra = json.loads(os.environ.get("UITROL_GEB_EXTRA") or "{}")
        for k in ("pakket_pad", "pakket_sha256", "pakket_bytes"):
            if k in extra:
                regel_d[k] = extra[k]
    except Exception:
        pass
regel = json.dumps(regel_d, ensure_ascii=False)
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

# Stappen van deze run voor de site (Admin → «Оновлення»): één regel per overgang, append-only in stappen.jsonl (laatste 1500 regels).
# De app neemt ze op in de database (app.uitrol_runs); daar blijft de geschiedenis staan, ook als dit bestand later wordt ingekort.
# Nooit fataal: een mislukte stapregel mag de uitrol niet breken.
RUN=""; HUIDIGE_STAP=""
stap() { # stap <id> <bezig|ok|fout> <pct> <uk> <nl>
  [ -n "$RUN" ] || return 0
  [ "$2" = bezig ] && HUIDIGE_STAP="$1"
  (
    flock 7
    tmp="$(mktemp "$STATUS_DIR/.stap.XXXXXX")" || exit 0
    python3 - "$STATUS_DIR/stappen.jsonl" "$tmp" "$RUN" "${VERSIE:-}" "$MODUS" "$1" "$2" "$3" "$4" "$5" <<'PY' || { rm -f -- "$tmp"; exit 0; }
import json, sys, datetime, os
pad, tmp, run, versie, methode, stap, staat, pct, uk, nl = sys.argv[1:11]
# UITROL-UTF8-001: ongeldige UTF-8 in de tekst → U+FFFD (vroeger ging de stapregel dan stil verloren).
# Невалідний UTF-8 у тексті → U+FFFD (раніше рядок кроку мовчки губився).
uk, nl, versie = (os.fsencode(t).decode("utf-8", "replace") for t in (uk, nl, versie))
try:
    pct = max(0, min(100, int(pct)))
except ValueError:
    pct = 0
regel = json.dumps({"run": run, "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat(), "versie": versie, "methode": methode,
                    "stap": stap, "staat": staat, "pct": pct, "uk": uk[:300], "nl": nl[:300]}, ensure_ascii=False)
try:
    oud = open(pad, encoding="utf-8").read().splitlines()[-1499:]
except FileNotFoundError:
    oud = []
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(oud + [regel]) + "\n")
PY
    chgrp "$GROEP" "$tmp" 2>/dev/null || true
    chmod 0640 "$tmp"
    mv -f "$tmp" "$STATUS_DIR/stappen.jsonl"
  ) 7>"$STATUS_DIR/.stappen.lock" 2>/dev/null || true
  return 0
}

# Staart van het installatielogboek voor de site (Admin → «Оновлення»). De werkmap van root is 0700 en voor de app onleesbaar; dit
# bestand (root:mijnruimte 0640, laatste 200 regels, geheimen gemaskeerd) is het enige wat de app leest. Nooit fataal voor de uitrol.
publiceer_log() {
  local tmp
  tmp="$(mktemp "$STATUS_DIR/.installeer-log.XXXXXX" 2>/dev/null)" || return 0
  { tail -n 5000 "$WERK/installeer.log" 2>/dev/null | cut -c1-400 \
      | sed -E 's/((token|secret|password|wachtwoord|passphrase|api[_-]?key|private[_-]?key)[A-Za-z0-9_]*[=:][ ]*).*/\1***/I'; } > "$tmp" 2>/dev/null || true
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp" 2>/dev/null || true
  if [ -n "$RUN" ]; then
    { mkdir -p "$STATUS_DIR/runs" && chgrp "$GROEP" "$STATUS_DIR/runs" && chmod 0750 "$STATUS_DIR/runs"; } 2>/dev/null || true
    # cp maakt een nieuw bestand aan dat de groep van root krijgt (niet die van de bron): zonder de chgrp/chmod hieronder kan de app
    # runs/<run>.log niet lezen en blijft de terminal op de site leeg. Daarom eerst groep en rechten zetten, dan pas op de eindnaam leggen.
    { cp -f -- "$tmp" "$STATUS_DIR/runs/.$RUN.tmp" && { chgrp "$GROEP" "$STATUS_DIR/runs/.$RUN.tmp" 2>/dev/null || true; } \
        && chmod 0640 "$STATUS_DIR/runs/.$RUN.tmp" && mv -f "$STATUS_DIR/runs/.$RUN.tmp" "$STATUS_DIR/runs/$RUN.log"; } 2>/dev/null || true
  fi
  mv -f "$tmp" "$STATUS_DIR/installeer.log" 2>/dev/null || rm -f -- "$tmp"
  return 0
}

# Voortgang van de installatie (audit 18.10.2026, punt 6): deploy/installeer-app.sh schrijft per onderdeel één regel
# «[installeer] stap: <id> (<pct>%) …» in het logboek; hier wordt elke nieuwe regel een stap «installeren» met dat percentage in
# stappen.jsonl, zodat de balk op de site meeloopt (kopie 45 → npm 55 → bouwen 70 → backup 75 → migraties 80 → activeren 90 →
# gezondheid 95 → nabewaken 98). Het aantal al verwerkte regels staat in $WERK/stap-teller (zowel de publicatielus in de achtergrond
# als de hoofdlus na afloop roepen dit aan; nooit dubbel). Nooit fataal.
installeer_stappen() {
  local al regel id pct uk nl
  [ -n "${WERK:-}" ] && [ -f "$WERK/installeer.log" ] || return 0
  al="$(cat "$WERK/stap-teller" 2>/dev/null || echo 0)"; [[ "$al" =~ ^[0-9]+$ ]] || al=0
  mapfile -t nieuw < <(grep -aE '^\[installeer\] stap: [a-z]+ \([0-9]{1,3}%\)' "$WERK/installeer.log" 2>/dev/null | tail -n +"$((al + 1))" || true)
  [ "${#nieuw[@]}" -gt 0 ] || return 0
  printf '%s\n' "$((al + ${#nieuw[@]}))" > "$WERK/stap-teller" 2>/dev/null || true
  for regel in "${nieuw[@]}"; do
    [[ "$regel" =~ ^\[installeer\]\ stap:\ ([a-z]+)\ \(([0-9]{1,3})%\) ]] || continue
    id="${BASH_REMATCH[1]}"; pct="${BASH_REMATCH[2]}"
    case "$id" in
      proef) uk="Проба нових міграцій на тимчасовій копії схеми (робоча база не змінюється)."; nl="Nieuwe migraties worden geprobeerd op een wegwerpkopie van het schema (productie blijft onaangeroerd)." ;;
      pgversie) uk="Перевіряю версію PostgreSQL."; nl="PostgreSQL-versie wordt gecontroleerd." ;;
      kopie) uk="Копіюю код випуску в нову теку релізу."; nl="Broncode wordt naar een nieuwe releasemap gekopieerd." ;;
      npm) uk="Встановлюю залежності (npm ci)."; nl="Afhankelijkheden worden geïnstalleerd (npm ci)." ;;
      bouwen) uk="Збираю сайт і сервер (vite + серверна збірка)."; nl="Site en server worden gebouwd (vite + serverbundel)." ;;
      backup) uk="Роблю резервну копію бази перед міграціями."; nl="Back-up van de database vóór de migraties." ;;
      migraties) uk="Застосовую міграції бази даних."; nl="Databasemigraties worden uitgevoerd." ;;
      activeren) uk="Перемикаю на новий випуск і перезапускаю службу."; nl="Overschakelen naar de nieuwe release en de dienst herstarten." ;;
      gezondheid) uk="Перевіряю, чи сайт відповідає (health-check)."; nl="Controleren of de site antwoordt (health-check)." ;;
      nabewaken) uk="Нагляд за новим випуском — за збою автоматичний відкат."; nl="Nieuwe release onder toezicht — bij een storing automatisch terug." ;;
      rook) uk="Рендер-контроль: сторінки відкриваються в браузері на сервері — біла сторінка = автоматичний відкат."; nl="Rendercontrole: pagina's openen in een browser op de server — witte pagina = automatisch terug." ;;
      *) uk="Встановлення: $id."; nl="Installatie: $id." ;;
    esac
    stap installeren bezig "$pct" "$uk" "$nl"
    printf '%s\n' "$pct" > "$WERK/stap-pct" 2>/dev/null || true
  done
  return 0
}

exec 8>"$LOCK"
flock -n 8 || { log "er loopt al een uitrol"; exit 0; }

WERK="$(mktemp -d "$WERK_ROOT/pakket.XXXXXX")"
opruimen() { rm -rf -- "$WERK"; }

# ---- Nooit stil sterven (audit 18.10.2026, punt 2) ------------------------------------------------------------------------------
# Vroeger kon dit script onder `set -euo pipefail` halverwege stoppen (bv. `head` op een ontbrekend AUTEUR-bestand) zónder status:
# status.json bleef «bezig CONTROLE», er kwam geen gebeurtenis, en de site toonde eeuwig «встановлюється» tot het voorstel als
# «verlopen GEEN_UITKOMST» verdween. Nu geldt: elke uitkomst die niet via weiger/klaar/mislukt loopt, wordt bij het afsluiten
# alsnog als `mislukt AFGEBROKEN` (interne fout: regel + code) of `mislukt ONDERBROKEN` (SIGTERM/SIGINT/SIGHUP: systemd-timeout,
# handmatig gestopt) in status.json, stappen.jsonl en gebeurtenissen.jsonl geschreven. Het pakket gaat uit de inbox, anders zou de
# path-unit dezelfde fout eindeloos herhalen.
AFGEROND=0; ONDERBROKEN=0; FOUT_REGEL=""; INSTALL_PID=""
set -E
trap 'FOUT_REGEL="$LINENO"' ERR
# SEC-002 (server-uitrol-08): na het doorgeven van het signaal even op het installatiescript wachten (hoogstens 30 s). Dat script zet,
# als het al had overgeschakeld, zelf de vorige release terug; pas daarna kan afsluiten() zien welke release werkelijk actief is.
onderbroken() {
  local i
  ONDERBROKEN=1
  trap '' TERM INT HUP
  if [ -n "$INSTALL_PID" ]; then
    kill -TERM -- "-$INSTALL_PID" 2>/dev/null || kill -TERM "$INSTALL_PID" 2>/dev/null || true
    for i in $(seq 1 60); do kill -0 "$INSTALL_PID" 2>/dev/null || break; sleep 0.5 || true; done
  fi
  exit 143
}
trap onderbroken TERM INT HUP

# ---- Stopverzoek van de eigenaar (UITROL-001) ----------------------------------------------------------------------------------
# De site (als app-gebruiker, na step-up van de eigenaar) legt $INBOX/stop.json neer: {doel:"stoppen", versie, voorstelId, tijd, door,
# reden}. Alleen in de passkey-inbox. Root honoreert het verzoek:
#   • vóór de installatie (stap 1): het pakket wordt geweigerd met code GESTOPT en gaat uit de inbox;
#   • tijdens de installatie tot vóór het overschakelen (< 90 %): de procesgroep van installeer-app.sh krijgt SIGTERM, de onvolledige
#     releasemap wordt door het installatiescript zelf opgeruimd, de vorige release blijft actief → uitkomst «mislukt GESTOPT»;
#   • vanaf het overschakelen (≥ 90 %): te laat — stoppen zou de site half omgeschakeld achterlaten. Het verzoek wordt gelogd en
#     genegeerd; de gezondheidscontrole en de automatische terugdraai van het installatiescript beslissen.
# Een stopverzoek kan niets installeren en niets anders dan deze run raken: het ergste dat een vervalst verzoek kan doen is een
# installatie afbreken (beschikbaarheid), nooit code uitvoeren of iets omzetten. Het bestand wordt na lezing verwijderd.
# Запит на зупинку від власника: лише зупиняє (до перемикання) — нічого не встановлює й не змінює; файл видаляється після читання.
STOP_DOOR=""; STOP_REDEN=""
stop_verzoek() { # stop_verzoek → 0 als er een geldig verzoek voor DEZE run/versie ligt (en het bestand is dan verwijderd)
  local f="$INBOX/stop.json" uit
  [ "$MODUS" = passkey ] || return 1
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  [ "$(stat -c %s "$f" 2>/dev/null || echo 99999)" -le 4096 ] || { rm -f -- "$f"; log "stopverzoek genegeerd: bestand te groot"; return 1; }
  uit="$(timeout 5 python3 - "$f" "${VERSIE:-}" "${RUN:-}" <<'PY' 2>/dev/null || true
import json, sys, datetime
pad, versie, run = sys.argv[1:4]
try:
    d = json.load(open(pad, encoding="utf-8"))
except Exception:
    print("ONGELDIG"); sys.exit()
if not isinstance(d, dict) or d.get("doel") != "stoppen":
    print("ONGELDIG"); sys.exit()
if str(d.get("versie", "")) != versie and str(d.get("run", "")) != run:
    print("ANDER"); sys.exit()
try:
    t = datetime.datetime.fromisoformat(str(d.get("tijd", "")).replace("Z", "+00:00"))
    if (datetime.datetime.now(datetime.timezone.utc) - t).total_seconds() > 3600:
        print("VEROUDERD"); sys.exit()
except Exception:
    print("ONGELDIG"); sys.exit()
schoon = lambda v, n: " ".join(str(v).split())[:n]
print("OK"); print(schoon(d.get("door", ""), 120)); print(schoon(d.get("reden", ""), 300))
PY
)"
  case "$(printf '%s
' "$uit" | head -n1)" in
    OK) STOP_DOOR="$(printf '%s
' "$uit" | sed -n 2p)"; STOP_REDEN="$(printf '%s
' "$uit" | sed -n 3p)"; rm -f -- "$f"; return 0 ;;
    ANDER) return 1 ;;   # verzoek voor een ander pakket: laten liggen (die run leest het zelf)
    *) rm -f -- "$f"; log "stopverzoek genegeerd ($(printf '%s
' "$uit" | head -n1))"; return 1 ;;
  esac
}
# SEC-002 (server-uitrol-08): wat is er NU werkelijk actief? Vroeger schreef dit script na een onderbreking of een stop altijd «de
# vorige release blijft actief», ook als het installatiescript al had overgeschakeld. Nu wordt de pakketversie van de actieve release
# gelezen (UITROL-VERSIE onder de current-symlink): is dat de versie van DIT pakket, dan zegt de status eerlijk dat de nieuwe release
# actief en niet gecontroleerd is. Що насправді активне: читаємо версію під посиланням current і кажемо правду в статусі.
ACTIEF_LINK="${UITROL_ACTIEF_LINK:-/srv/mijn-ruimte/current}"
nieuwe_release_actief() { # → 0 als de actieve release de versie van dit pakket draagt
  local v=""
  [ -n "${VERSIE:-}" ] && [ -f "$ACTIEF_LINK/UITROL-VERSIE" ] || return 1
  v="$(head -c 32 "$ACTIEF_LINK/UITROL-VERSIE" 2>/dev/null | tr -d '\r\n[:space:]')"
  [ "$v" = "$VERSIE" ]
}
# Percentage van de laatste stapregel, rechtstreeks uit het logboek van het installatiescript (niet uit een eerder weggeschreven tussenstand).
# SEC-002 (g09-toets-4): heeft het installatiescript de nieuwe release al bevestigd? Het schrijft dan «[installeer] actief: <map>»
# (na gezondheid, nabewaking en rendercontrole). Alleen een regel die daarmee BEGINT telt.
nieuwe_release_bevestigd() {
  grep -aqE '^\[installeer\] actief: ' "$WERK/installeer.log" 2>/dev/null
}
log_pct() {
  local p
  p="$(grep -aoE '^\[installeer\] stap: [a-z]+ \([0-9]{1,3}%\)' "$WERK/installeer.log" 2>/dev/null | tail -n 1 | grep -oE '[0-9]{1,3}%' | tr -d '%' || true)"
  [[ "$p" =~ ^[0-9]{1,3}$ ]] && printf '%s' "$p" || printf '0'
}
afsluiten() {
  local rc=$? code uk nl
  trap - ERR
  if [ "$AFGEROND" -ne 1 ] && [ -n "${RUN:-}" ]; then
    if [ "$ONDERBROKEN" -eq 1 ] && nieuwe_release_actief && nieuwe_release_bevestigd; then
      code=ONDERBROKEN
      uk="! Встановлення перервано ззовні (зупинка служби, тайм-аут systemd або сигнал) на кроці «${HUIDIGE_STAP:-ontvangen}». Новий випуск ${VERSIE} уже активний і ПЕРЕВІРЕНИЙ (здоров'я, нагляд, рендеринг), але наступні кроки налаштування не завершено. Повторіть установлення або за потреби поверніть попередній випуск."
      nl="! De installatie is van buitenaf onderbroken (dienst gestopt, systemd-timeout of signaal) in stap «${HUIDIGE_STAP:-ontvangen}». De nieuwe release ${VERSIE} is al actief en GECONTROLEERD (gezondheid, nabewaking, rendering), maar de inrichtstappen daarna zijn niet afgerond. Installeer opnieuw of zet zo nodig de vorige release terug."
    elif [ "$ONDERBROKEN" -eq 1 ] && nieuwe_release_actief; then
      code=ONDERBROKEN
      uk="! Встановлення перервано ззовні (зупинка служби, тайм-аут systemd або сигнал) на кроці «${HUIDIGE_STAP:-ontvangen}», коли новий випуск ${VERSIE} уже був увімкнений. Він лишився активним БЕЗ завершеної перевірки й без автоматичного відкату. Перевірте сайт; якщо він не працює — поверніть попередній випуск (сторінка «Оновлення» → «Повернути» або sudo mijn-ruimte-installeer terugdraaien)."
      nl="! De installatie is van buitenaf onderbroken (dienst gestopt, systemd-timeout of signaal) in stap «${HUIDIGE_STAP:-ontvangen}», toen de nieuwe release ${VERSIE} al was ingeschakeld. Ze is actief gebleven ZONDER afgeronde controle en zonder automatische terugdraai. Controleer de site; werkt ze niet, zet dan de vorige release terug (pagina «Оновлення» → «Повернути» of sudo mijn-ruimte-installeer terugdraaien)."
    elif [ "$ONDERBROKEN" -eq 1 ]; then
      code=ONDERBROKEN
      uk="Встановлення перервано ззовні (зупинка служби, тайм-аут systemd або сигнал) на кроці «${HUIDIGE_STAP:-ontvangen}». Попередній випуск лишився активним; повторіть завантаження."
      nl="De installatie is van buitenaf onderbroken (dienst gestopt, systemd-timeout of signaal) in stap «${HUIDIGE_STAP:-ontvangen}». De vorige release blijft actief; upload opnieuw."
    else
      code=AFGEBROKEN
      uk="Сценарій сервера зупинився з внутрішньою помилкою (рядок ${FOUT_REGEL:-?}, код ${rc}) на кроці «${HUIDIGE_STAP:-ontvangen}». Нічого не встановлено; див. журнал і «Діагностика»."
      nl="Het serverscript stopte met een interne fout (regel ${FOUT_REGEL:-?}, code ${rc}) in stap «${HUIDIGE_STAP:-ontvangen}». Er is niets geïnstalleerd; zie het logboek en «Діагностика»."
    fi
    log "AFGEBROKEN ($code): $nl"
    stap "${HUIDIGE_STAP:-ontvangen}" fout 0 "$uk" "$nl"
    status mislukt "$code" "$uk" "$nl" "${VERSIE:-}"
    gebeurtenis "$code" fout "$uk" "$nl"
    publiceer_log
    [ -n "${NAAM:-}" ] && rm -f -- "$INBOX/$NAAM" "$INBOX/$NAAM.sig" "$INBOX/$NAAM.goedkeuring.json"
  fi
  opruimen
}
trap afsluiten EXIT

weiger() { # weiger <code> <uk> <nl>
  AFGEROND=1
  log "GEWEIGERD: $1 — $3"
  stap "${HUIDIGE_STAP:-ontvangen}" fout 0 "$2" "$3"
  publiceer_log
  status geweigerd "$1" "$2" "$3" "${VERSIE:-}"
  gebeurtenis "$1" waarschuwing "$2" "$3"
  # Het geweigerde pakket uit de inbox halen (rm volgt geen symlinks), anders blijft de path-unit afgaan.
  [ -n "${NAAM:-}" ] && rm -f -- "$INBOX/$NAAM" "$INBOX/$NAAM.sig" "$INBOX/$NAAM.goedkeuring.json"
  exit 2
}

# ---- 1. kandidaat kiezen (nieuwste geldige naam; alleen gewone bestanden, geen symlinks) ----
[ -d "$INBOX" ] && [ ! -L "$INBOX" ] || { log "inbox $INBOX ontbreekt"; exit 0; }
NAAM=""; VERSIE=""
while IFS= read -r kandidaat; do
  if [[ "$kandidaat" =~ $PATROON ]]; then NAAM="$kandidaat"; VERSIE="${BASH_REMATCH[1]}"; fi
done < <(find "$INBOX" -maxdepth 1 -mindepth 1 -type f -printf '%f\n' | LC_ALL=C sort)
if [ -z "$NAAM" ]; then log "geen pakket in de inbox"; exit 0; fi
RUN="$(date -u +%Y%m%dT%H%M%SZ)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
log "run $RUN: pakket $NAAM ontvangen ($MODUS)"
stap ontvangen ok 5 "Сервер отримав запит на встановлення $VERSIE." "De server heeft het installatieverzoek voor $VERSIE ontvangen."
if [ "$MODUS" = passkey ]; then
  [ -f "$INBOX/$NAAM.goedkeuring.json" ] && [ ! -L "$INBOX/$NAAM.goedkeuring.json" ] || weiger GOEDKEURING_ONTBREEKT "Немає файлу схвалення passkey." "Het goedkeuringsbestand (passkey) ontbreekt."
else
  [ -f "$INBOX/$NAAM.sig" ] && [ ! -L "$INBOX/$NAAM.sig" ] || weiger SIG_ONTBREEKT "Немає файлу підпису (.sig)." "Het handtekeningbestand (.sig) ontbreekt."
fi
[ ! -L "$INBOX/$NAAM" ] || weiger SYMLINK "Пакет є символьним посиланням." "Het pakket is een symlink."
if stop_verzoek; then
  weiger GESTOPT "Власник зупинив установлення $VERSIE ще до початку${STOP_DOOR:+ ($STOP_DOOR)}${STOP_REDEN:+: $STOP_REDEN}. Нічого не змінено." "De eigenaar stopte de installatie van $VERSIE nog vóór het begin${STOP_DOOR:+ ($STOP_DOOR)}${STOP_REDEN:+: $STOP_REDEN}. Er is niets gewijzigd."
fi
status bezig CONTROLE "Перевіряю пакет $VERSIE." "Pakket $VERSIE wordt gecontroleerd." "$VERSIE"
# Alleen tests (als root gewist, zie boven): een onverwachte fout na «bezig CONTROLE» nabootsen; de trap moet die als AFGEBROKEN melden.
[ "${UITROL_TEST_BREEK:-}" = controle ] && false
stap kopie bezig 8 "Копіюю пакет у закриту теку root." "Het pakket wordt naar de afgesloten root-map gekopieerd."

# ---- 2. kopie naar de eigen root-map; vanaf hier telt alleen de kopie ----
timeout 120 head -c "$((MAX_BYTES + 1))" < "$INBOX/$NAAM" > "$WERK/pakket.tar.gz" || weiger KOPIE "Не вдалося скопіювати пакет." "Kopiëren van het pakket mislukt."
[ "$(stat -c %s "$WERK/pakket.tar.gz")" -le "$MAX_BYTES" ] || weiger TE_GROOT "Пакет завеликий." "Het pakket is te groot."
stap kopie ok 12 "Пакет скопійовано." "Pakket gekopieerd."
if [ "$MODUS" = passkey ]; then
  stap echtheid bezig 15 "Перевіряю схвалення passkey (root перевіряє сам)." "De passkey-goedkeuring wordt gecontroleerd (root controleert zelf)."
  timeout 10 head -c 65537 < "$INBOX/$NAAM.goedkeuring.json" > "$WERK/goedkeuring.json" || weiger KOPIE "Не вдалося скопіювати схвалення." "Kopiëren van de goedkeuring mislukt."
  [ "$(stat -c %s "$WERK/goedkeuring.json")" -le 65536 ] || weiger GOEDKEURING_ONGELDIG "Файл схвалення завеликий." "Het goedkeuringsbestand is te groot."

  # ---- 3p. passkey-goedkeuring (root controleert zelf; de app kan niets goedkeuren) ----
  read -r -a hulp <<< "$GOEDKEUR_HULP"
  set +e
  uitslag="$("${hulp[@]}" verifieer-goedkeuring "$WERK/pakket.tar.gz" "$WERK/goedkeuring.json" "$VERSIE" 2>"$WERK/goedkeuring.log")"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    mapfile -t melding < <(python3 -c 'import json, sys
try:
    d = json.loads(sys.argv[1] or "{}")
except Exception:
    d = {}
schoon = lambda v, n: " ".join(str(v).split())[:n]
print("".join(ch for ch in str(d.get("code", "")) if ch.isalnum() or ch == "_")[:40] or "GOEDKEURING_ONGELDIG")
print(schoon(d.get("uk") or "Схвалення passkey відхилено.", 300))
print(schoon(d.get("nl") or "De passkey-goedkeuring is geweigerd.", 300))' "$uitslag" 2>/dev/null || true)
    weiger "${melding[0]:-GOEDKEURING_ONGELDIG}" "${melding[1]:-Схвалення passkey відхилено.}" "${melding[2]:-De passkey-goedkeuring is geweigerd.}"
  fi
  log "passkey-goedkeuring geldig voor $NAAM"
  stap echtheid ok 25 "Схвалення passkey дійсне для цього пакета." "De passkey-goedkeuring is geldig voor dit pakket."
  gebeurtenis GOEDGEKEURD info "Пакет $VERSIE схвалено passkey власника; починаю перевірку вмісту." "Pakket $VERSIE goedgekeurd met de passkey van de eigenaar; inhoud wordt gecontroleerd."
else
stap echtheid bezig 15 "Перевіряю цифровий підпис пакета." "De digitale handtekening van het pakket wordt gecontroleerd."
timeout 10 head -c 8193 < "$INBOX/$NAAM.sig" > "$WERK/pakket.tar.gz.sig" || weiger KOPIE "Не вдалося скопіювати підпис." "Kopiëren van de handtekening mislukt."
[ "$(stat -c %s "$WERK/pakket.tar.gz.sig")" -le 8192 ] || weiger SIG_ONGELDIG "Підпис має неправильний розмір." "De handtekening heeft een onjuiste grootte."

# ---- 3. handtekening ----
[ -f "$ONDERTEKENAARS" ] && [ ! -L "$ONDERTEKENAARS" ] || weiger GEEN_SLEUTEL "На сервері немає публічного ключа випуску." "Er staat geen publieke uitrolsleutel op de server."
if [ "$(id -u)" -eq 0 ]; then
  read -r eigenaar modus < <(stat -c '%u %a' "$ONDERTEKENAARS")
  [ "$eigenaar" = 0 ] || weiger SLEUTEL_EIGENAAR "Файл ключів не належить root." "Het sleutelbestand is niet van root."
  (( (8#$modus & 8#022) == 0 )) || weiger SLEUTEL_RECHTEN "Файл ключів доступний для запису іншим." "Het sleutelbestand is schrijfbaar voor anderen."
fi
command -v ssh-keygen >/dev/null || weiger GEEN_SSH_KEYGEN "Немає ssh-keygen." "ssh-keygen ontbreekt."
if ! ssh-keygen -Y verify -f "$ONDERTEKENAARS" -I "$IDENTITEIT" -n "$NAAMRUIMTE" -s "$WERK/pakket.tar.gz.sig" < "$WERK/pakket.tar.gz" >/dev/null 2>"$WERK/verify.log"; then
  weiger HANDTEKENING_ONGELDIG "Підпис недійсний: пакет змінено або підписано чужим ключем." "Ongeldige handtekening: het pakket is gewijzigd of met een andere sleutel ondertekend."
fi
log "handtekening geldig voor $NAAM"
stap echtheid ok 25 "Підпис дійсний." "De handtekening is geldig."
fi

stap inhoud bezig 28 "Перевіряю вміст архіву та метадані випуску." "De inhoud van het archief en de release-metadata worden gecontroleerd."
# ---- 4. inhoud: alleen gewone bestanden en mappen; daarna uitpakken met het 'data'-filter ----
mkdir "$WERK/bron"
if ! python3 - "$WERK/pakket.tar.gz" "$WERK/bron" "$MAX_BYTES" > "$WERK/tar.log" 2>&1 <<'PY'
import sys, tarfile, posixpath
pakket, doel, maxb = sys.argv[1], sys.argv[2], int(sys.argv[3])
totaal = 0
with tarfile.open(pakket, "r:gz") as tf:
    leden = tf.getmembers()
    for m in leden:
        naam = m.name
        delen = [d for d in naam.split("/") if d not in ("", ".")]
        if naam.startswith("/") or ".." in delen or "\\" in naam or "\n" in naam:
            sys.exit(f"onveilig pad: {naam!r}")
        if not (m.isfile() or m.isdir()):
            sys.exit(f"geen gewoon bestand of map: {naam!r}")
        totaal += m.size
        if totaal > maxb * 4:
            sys.exit("uitgepakt te groot")
    if hasattr(tarfile, "data_filter"):
        tf.extractall(doel, members=leden, filter="data")
    else:
        # python3 < 3.11.4 heeft nog geen data-filter (PEP 706): hetzelfde effect met de hand (alleen gewone bestanden en mappen,
        # zie boven). Eigenaar = wie uitpakt, niet die uit het archief. Bestanden: geen setuid/setgid/sticky, geen schrijfrecht voor
        # groep/anderen, de eigenaar mag lezen en schrijven, uitvoerbaar alleen als de eigenaar het al was. Mappen: de modus uit het
        # archief telt niet; zoals bij het filter krijgen ze de umask van dit script (077, dus 0700).
        import os
        um = os.umask(0)
        os.umask(um)
        for m in leden:
            m.uid, m.gid, m.uname, m.gname = os.geteuid(), os.getegid(), "", ""
            if m.isfile():
                m.mode &= 0o755
                if not m.mode & 0o100:
                    m.mode &= ~0o111
                m.mode |= 0o600
            else:
                m.mode = 0o777 & ~um
        tf.extractall(doel, members=leden)
PY
then
  weiger INHOUD_ONVEILIG "Архів містить недозволені елементи (посилання, пристрої, шляхи поза текою)." "Het archief bevat niet-toegestane onderdelen (links, apparaten, paden buiten de map): $(tail -c 200 "$WERK/tar.log" | tr '\n' ' ')"
fi
BRON="$WERK/bron"
# git archive --prefix=… levert één bovenmap; die mag (precies één map, verder niets).
if [ ! -f "$BRON/UITROL-VERSIE" ]; then
  mapfile -t top < <(find "$BRON" -mindepth 1 -maxdepth 1 -printf '%f\n')
  if [ "${#top[@]}" -eq 1 ] && [ -d "$BRON/${top[0]}" ]; then BRON="$BRON/${top[0]}"; fi
fi
[ -f "$BRON/UITROL-VERSIE" ] || weiger GEEN_VERSIE "У пакеті немає UITROL-VERSIE." "UITROL-VERSIE ontbreekt in het pakket."
INHOUD_VERSIE="$(head -c 64 "$BRON/UITROL-VERSIE" | tr -d '\r\n[:space:]')"
[ "$INHOUD_VERSIE" = "$VERSIE" ] || weiger VERSIE_VERSCHILT "Версія в пакеті ($INHOUD_VERSIE) не збігається з назвою ($VERSIE)." "Versie in het pakket ($INHOUD_VERSIE) wijkt af van de naam ($VERSIE)."
LAATSTE="$(cat "$WERK_ROOT/laatste-versie" 2>/dev/null || echo 00000000-000000)"
[[ "$VERSIE" > "$LAATSTE" ]] || weiger NIET_NIEUWER "Версія $VERSIE не новіша за встановлену ($LAATSTE)." "Versie $VERSIE is niet nieuwer dan de geïnstalleerde ($LAATSTE)."
[ -f "$BRON/deploy/installeer-app.sh" ] || weiger GEEN_INSTALLER "У пакеті немає deploy/installeer-app.sh." "deploy/installeer-app.sh ontbreekt in het pakket."

# ---- ORCH-001 (31.10.2026): basis, regels en modus van het pakket (AGENTS.md §5, orchestratie/beleid.json → kritiek) ----
# UITROL-BASIS (versie=…, commit=…, regelsVersie=…, regelsHash=…) zegt op welke GEÏNSTALLEERDE versie en welke commit het pakket is gebouwd.
# Staat hier intussen een nieuwere versie dan die basis, of een andere commit, dan is het pakket op een verouderde basis gebouwd (een andere
# agent installeerde ertussen) → geweigerd: niets wordt stil overschreven. Pakketten zonder UITROL-BASIS blijven installeerbaar tot
# BASIS_VERPLICHT_VANAF (waarschuwing «oud formaat»); daarna GEEN_BASIS. De laatst geïnstalleerde commit staat in $WERK_ROOT/laatste-commit.
BASIS_VERPLICHT_VANAF="20261201-000000"
LAATSTE_COMMIT="$(head -c 64 "$WERK_ROOT/laatste-commit" 2>/dev/null | tr -d '\r\n[:space:]' || true)"
if [ -f "$BRON/UITROL-BASIS" ]; then
  BASIS_VERSIE="$(grep -m1 '^versie=' "$BRON/UITROL-BASIS" | cut -d= -f2- | tr -d '\r[:space:]' || true)"
  BASIS_COMMIT="$(grep -m1 '^commit=' "$BRON/UITROL-BASIS" | cut -d= -f2- | tr -d '\r[:space:]' || true)"
  { [[ "$BASIS_VERSIE" =~ ^[0-9]{8}-[0-9]{6}$ ]] && [[ "$BASIS_COMMIT" =~ ^[0-9a-f]{40}$ ]]; } || weiger BASIS_ONGELDIG "UITROL-BASIS у пакеті неповний: потрібні versie=РРРРММДД-ГГХХСС і commit=<40 hex>. Випуск відхилено." "UITROL-BASIS in het pakket is onvolledig: versie=JJJJMMDD-UUMMSS en commit=<40 hex> zijn nodig. Release geweigerd."
  if [ "$LAATSTE" != 00000000-000000 ] && [[ "$LAATSTE" > "$BASIS_VERSIE" ]]; then
    weiger BASIS_VEROUDERD "Пакет зібрано на базі $BASIS_VERSIE, але на сервері вже встановлено новішу $LAATSTE (хтось установив між збіркою й цим пакетом). Перебазуйте зміни на встановлену версію й зберіть знову. Випуск відхилено." "Het pakket is gebouwd op basis $BASIS_VERSIE, maar op de server staat al de nieuwere $LAATSTE (iemand installeerde ertussen). Rebase op de geïnstalleerde versie en bouw opnieuw. Release geweigerd."
  fi
  if [ -n "$LAATSTE_COMMIT" ] && [ "$LAATSTE_COMMIT" != "$BASIS_COMMIT" ]; then
    weiger BASIS_COMMIT_VERSCHILT "Базовий commit пакета ($BASIS_COMMIT) не той, що встановлено на сервері ($LAATSTE_COMMIT): код на сервері відрізняється від того, від якого працював агент. Випуск відхилено." "De basiscommit van het pakket ($BASIS_COMMIT) is niet de geïnstalleerde ($LAATSTE_COMMIT): de code op de server verschilt van waar de agent van vertrok. Release geweigerd."
  fi
  log "basis van het pakket: $BASIS_VERSIE @ $BASIS_COMMIT (geïnstalleerd: $LAATSTE @ ${LAATSTE_COMMIT:-onbekend})"
elif [[ "$VERSIE" > "$BASIS_VERPLICHT_VANAF" ]] || [ "$VERSIE" = "$BASIS_VERPLICHT_VANAF" ]; then
  weiger GEEN_BASIS "У пакеті немає UITROL-BASIS (на якій встановленій версії й commit його зібрано) — для випусків від $BASIS_VERPLICHT_VANAF він обовʼязковий. Збирайте через node scripts/orch.mjs pakket або з BASIS_VERSIE/BASIS_COMMIT." "UITROL-BASIS ontbreekt (op welke geïnstalleerde versie en commit is gebouwd) — verplicht voor releases vanaf $BASIS_VERPLICHT_VANAF. Bouw met node scripts/orch.mjs pakket of met BASIS_VERSIE/BASIS_COMMIT."
else
  log "LET OP: pakket zonder UITROL-BASIS (oud formaat) — basisversie en -commit niet gecontroleerd"
fi
# Regels: zit orchestratie/regels.lock.json in het pakket, dan moeten de regelbestanden erin (AGENTS.md, beleid.json, BESLUITEN.md) precies die
# afdruk hebben (zelfde normalisatie als scripts/orch/kern.mjs: geen BOM, LF, geen spaties aan het regeleinde). Anders zijn de regels
# gewijzigd zonder versie/lock — het pakket volgt zijn eigen regels niet. Modus: dit script installeert na bevestiging van de eigenaar
# (passkey of handtekening); dat moet het beleid in het pakket toestaan.
if [ -f "$BRON/orchestratie/regels.lock.json" ]; then
  REGELS_FOUT="$(python3 -I - "$BRON" 2>&1 <<'PYREGELS'
import hashlib, json, os, re, sys
bron = sys.argv[1]
try:
    lock = json.load(open(os.path.join(bron, "orchestratie/regels.lock.json"), encoding="utf-8"))
    beleid = json.load(open(os.path.join(bron, "orchestratie/beleid.json"), encoding="utf-8"))
except Exception as e:
    sys.exit(f"lock/beleid onleesbaar: {e}")
if not isinstance(lock, dict) or not isinstance(beleid, dict):
    sys.exit("lock/beleid is geen JSON-object")
if lock.get("regelsVersie") != beleid.get("regelsVersie"):
    sys.exit(f"regelsVersie lock {lock.get('regelsVersie')} != beleid {beleid.get('regelsVersie')}")
# \u0422\u0435 \u0441\u0430\u043c\u0435, \u0449\u043e stabielJson + kritiekAfdruk \u0443 scripts/orch/kern.mjs: kritieke regels in beleid.json moeten de kritiekHash van de lock hebben.
# (Onafhankelijk van regelBestanden \u2014 anders kon een pakket beleid.json uit de lijst halen en zo de afdruk omzeilen.)
def stabiel(w):
    if w is None or isinstance(w, (bool, str)):
        return json.dumps(w, ensure_ascii=False)
    if isinstance(w, int):
        return str(w)
    if isinstance(w, float):
        return str(int(w)) if w.is_integer() and abs(w) < 1e21 else repr(w)
    if isinstance(w, list):
        return "[" + ",".join(stabiel(x) for x in w) + "]"
    if isinstance(w, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + stabiel(w[k]) for k in sorted(w)) + "}"
    sys.exit("beleid.json bevat een onbekend JSON-type")
try:
    if hashlib.sha256(stabiel(beleid.get("kritiek")).encode("utf-8")).hexdigest() != lock.get("kritiekHash"):
        sys.exit("kritieke regels in beleid.json wijken af van kritiekHash in de lock")
except UnicodeEncodeError:
    sys.exit("beleid.json bevat ongeldige Unicode")
paden = beleid.get("regelBestanden")
if not isinstance(paden, list) or not all(isinstance(p, str) for p in paden) or "AGENTS.md" not in paden or "orchestratie/beleid.json" not in paden:
    sys.exit("regelBestanden moet AGENTS.md en orchestratie/beleid.json bevatten")
norm = lambda t: re.sub(r"[ \t]+$", "", (t[1:] if t.startswith("\ufeff") else t).replace("\r\n", "\n").replace("\r", "\n"), flags=re.M)
per = {}
for pad in sorted(set(paden)):
    if pad.startswith("/") or "\\" in pad or ":" in pad or any(d in ("", ".", "..") for d in pad.split("/")):
        sys.exit(f"onveilig pad in regelBestanden: {pad!r}")
    try:
        with open(os.path.join(bron, pad), encoding="utf-8", newline="") as f:
            per[pad] = hashlib.sha256(norm(f.read()).encode()).hexdigest()
    except (OSError, UnicodeDecodeError):
        sys.exit(f"regelbestand ontbreekt: {pad}")
totaal = hashlib.sha256("".join(f"{h}  {p}\n" for p, h in per.items()).encode()).hexdigest()
if totaal != lock.get("hash"):
    anders = [p for p in per if lock.get("bestanden", {}).get(p) != per[p]]
    sys.exit("gewijzigd zonder lock: " + ", ".join(anders or ["(onbekend)"]))
modi = (beleid.get("kritiek") or {}).get("installatieModi") or {}
if "na_bevestiging" not in (modi.get("toegestaan") or []):
    sys.exit("MODUS: na_bevestiging staat niet in kritiek.installatieModi.toegestaan")
PYREGELS
)" || {
    case "$REGELS_FOUT" in
      MODUS:*) weiger MODUS_NIET_TOEGESTAAN "Політика в пакеті не дозволяє режим встановлення «після підтвердження власника»: ${REGELS_FOUT#MODUS: }. Випуск відхилено." "Het beleid in het pakket staat de modus «na bevestiging van de eigenaar» niet toe: ${REGELS_FOUT#MODUS: }. Release geweigerd." ;;
      *) weiger REGELS_NIET_VERGRENDELD "Правила в пакеті (AGENTS.md / beleid.json / BESLUITEN.md) не збігаються з orchestratie/regels.lock.json: $REGELS_FOUT. Підвищте regelsVersie, виконайте node scripts/orch.mjs vergrendel і зберіть знову. Випуск відхилено." "De regels in het pakket komen niet overeen met orchestratie/regels.lock.json: $REGELS_FOUT. Verhoog regelsVersie, voer node scripts/orch.mjs vergrendel uit en bouw opnieuw. Release geweigerd." ;;
    esac; }
  log "regels in het pakket vergrendeld (lock klopt) en modus na_bevestiging toegestaan"
fi

# ---- Правило 2 (обов'язкові метадані випуску): машина відхиляє випуск без автора, агента й підсумку. Діє для БУДЬ-ЯКОГО
# джерела (passkey/підпис/gitops/мобільний додаток). Файли додає скрипт збирання (deploy/uitrol/maak-*pakket).
# Een ontbrekend bestand geeft een LEGE tekst, geen fout: `head` op een ontbrekend pad gaf rc 1 en onder pipefail stierf het hele script
# vóór `weiger GEEN_AUTEUR` (status bleef «bezig CONTROLE»). Het `|| true` binnen de accolades houdt de pijplijn op 0.
# UITROL-UTF8-001 (06.11.2026): vroeger `head -c "$2"`, dus knippen per BYTE. Viel de grens midden in een Cyrillisch teken (AUTEUR
# van 200+ bytes), dan kwam er een half teken in $AUTEUR; python3 in stap()/gebeurtenis() kreeg een los surrogaat en faalde bij het
# schrijven van de JSON (stapregel «inhoud» stil weg, OK-gebeurtenis ontbrak en het script stierf ná de installatie). Nu knipt Python
# op het begin van een heel UTF-8-teken (hoogstens 3 vervolgbytes terug) en worden ongeldige bytes U+FFFD: zichtbaar, niet stil weg.
# Раніше `head -c` різав побайтово: пів кириличного символу ламало JSON у stap()/gebeurtenis(). Тепер обрізання — по цілому
# символу UTF-8, а невалідні байти стають U+FFFD (видно, а не зникають мовчки). Відсутній файл, як і раніше, дає порожній текст.
meta() { # meta <bestand> <max-bytes>
  { python3 - "$BRON/$1" "$2" <<'PY' 2>/dev/null || true
import sys
pad, grens = sys.argv[1], int(sys.argv[2])
try:
    with open(pad, "rb") as f:
        ruw = f.read(grens + 1)  # grens + 1: zo is te zien of er geknipt wordt en of byte <grens> een vervolgbyte is
except OSError:
    sys.exit(0)
if len(ruw) > grens:
    k = grens
    # terug naar het begin van het teken dat de grens overschrijdt (vervolgbytes zijn 10xxxxxx; een UTF-8-teken heeft er hoogstens 3)
    while k > max(0, grens - 3) and (ruw[k] & 0xC0) == 0x80:
        k -= 1
    if (ruw[k] & 0xC0) == 0x80:
        k = grens  # geen geldig begin binnen 3 bytes: ongeldige bytes, knip gewoon op de grens (die worden hieronder U+FFFD)
    ruw = ruw[:k]
sys.stdout.buffer.write(ruw.replace(b"\0", b"").decode("utf-8", "replace").encode("utf-8"))
PY
  } | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}
AUTEUR="$(meta AUTEUR 200)"
AGENT="$(meta AGENT 40)"
SAMENVATTING="$(meta SAMENVATTING 8000 | tr '\n' ' ')"
[ -n "$AUTEUR" ] || weiger GEEN_AUTEUR "У пакеті немає AUTEUR (хто автор випуску). Випуск відхилено." "AUTEUR ontbreekt in het pakket (wie is de auteur). Release geweigerd."
[[ "${#AUTEUR}" -ge 3 ]] || weiger AUTEUR_ONGELDIG "AUTEUR закороткий. Випуск відхилено." "AUTEUR is te kort. Release geweigerd."
[ -n "$AGENT" ] || weiger GEEN_AGENT "У пакеті немає AGENT (через якого агента зроблено). Випуск відхилено." "AGENT ontbreekt (via welke agent gemaakt). Release geweigerd."
[[ "$AGENT" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || weiger AGENT_ONGELDIG "AGENT має бути як-от claude/cursor/gpt (малі літери). Випуск відхилено." "AGENT moet bv. claude/cursor/gpt zijn (kleine letters). Release geweigerd."
[ -n "$SAMENVATTING" ] || weiger GEEN_SAMENVATTING "У пакеті немає SAMENVATTING (підсумок: що і для чого, що було/зʼявилося/зникло). Випуск відхилено." "SAMENVATTING ontbreekt (samenvatting: wat en waarom, wat was/kwam/verdween). Release geweigerd."
[[ "${#SAMENVATTING}" -ge 20 ]] || weiger SAMENVATTING_TE_KORT "SAMENVATTING закороткий (мінімум 20 символів змістовного опису). Випуск відхилено." "SAMENVATTING is te kort (minstens 20 tekens). Release geweigerd."
# ---- UI-010 (29.10.2026): UITROL-MANIFEST.json (deploy/REGELS-UITROLPAKKET.md §5). Vanaf versie 20261101-000000 verplicht; een
# aanwezig manifest wordt altijd gecontroleerd. Root controleert de KERNREGELS (vorm, versie, uk+nl titel/samenvatting, deelnemers,
# per AI platform/tool/model.bron); de volledige regels (o.a. model-id «Claude» weigeren, gelijke lijsten) controleren de browser en
# de voorcontrole met shared/uitrol-manifest.ts. Zo wordt de regel ook bij SSH/GitOps/handtekening niet overgeslagen.
if [ -f "$BRON/UITROL-MANIFEST.json" ]; then
  MANIFEST_FOUT="$(python3 - "$BRON/UITROL-MANIFEST.json" "$VERSIE" <<'PY' 2>/dev/null || echo "UITROL-MANIFEST.json: onleesbaar"
import json, re, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("UITROL-MANIFEST.json: geen geldige JSON"); sys.exit(0)
f = []
versie = sys.argv[2]
strikt = bool(re.fullmatch(r"\d{8}-\d{6}", versie)) and versie >= "20261106-000000"
generiek = {"власник", "eigenaar", "owner", "admin", "administrator", "адміністратор", "user", "користувач", "gebruiker", "автор", "auteur", "author", "невідомо", "onbekend", "unknown"}
familie = {"claude", "grok", "gpt", "gemini", "cursor", "copilot", "llama", "mistral", "ai", "llm", "onbekend", "unknown", "невідомо"}
if not isinstance(d, dict): print("UITROL-MANIFEST.json: geen object"); sys.exit(0)
if d.get("schema") != 1: f.append("schema")
if str(d.get("versie", "")).strip() != versie: f.append("versie")
auteur = str(d.get("auteur", "")).strip()
if len(auteur) < 3 or (strikt and auteur.lower() in generiek): f.append("auteur")
for t in ("uk", "nl"):
    b = (d.get("beschrijving") or {}).get(t) or {}
    if len(str(b.get("titel", "")).strip()) < 3: f.append(f"beschrijving.{t}.titel")
    s = str(b.get("samenvatting", "")).strip()
    if len(s) < 20 or (t == "uk" and not re.search("[\u0400-\u04FF]", s)): f.append(f"beschrijving.{t}.samenvatting")
dn = d.get("deelnemers")
if not isinstance(dn, list) or not dn: f.append("deelnemers")
else:
    ai = [x for x in dn if isinstance(x, dict) and x.get("soort") == "ai"]
    for i, x in enumerate(dn):
        if not isinstance(x, dict) or x.get("soort") not in ("ai", "mens"): f.append(f"deelnemers[{i}].soort"); continue
        naam = str(x.get("naam", "")).strip()
        if not naam or (strikt and x.get("soort") == "mens" and naam.lower() in generiek): f.append(f"deelnemers[{i}].naam")
        if x.get("soort") == "ai":
            for k in ("platform", "tool"):
                w = str(x.get(k, "")).strip()
                if not w or (strikt and w.lower() in ("onbekend", "unknown", "невідомо")): f.append(f"deelnemers[{i}].{k}")
            m = x.get("model") or {}
            bron = m.get("bron")
            mid = str(m.get("id") or "").strip()
            if strikt:
                if bron not in ("omgeving", "auteur"): f.append(f"deelnemers[{i}].model.bron")
                if not mid or mid.lower() in familie: f.append(f"deelnemers[{i}].model.id")
            else:
                if bron not in ("omgeving", "auteur", "onbekend"): f.append(f"deelnemers[{i}].model.bron")
    if (d.get("zonderAi") is True) == bool(ai): f.append("zonderAi")
print(", ".join(f[:12]))
PY
)"
  [ -z "$MANIFEST_FOUT" ] || weiger MANIFEST_ONGELDIG "UITROL-MANIFEST.json неповний або неправильний: $MANIFEST_FOUT. Випуск відхилено." "UITROL-MANIFEST.json onvolledig of ongeldig: $MANIFEST_FOUT. Release geweigerd."
elif [[ ! "$VERSIE" < "20261101-000000" ]]; then
  weiger GEEN_MANIFEST "У пакеті немає UITROL-MANIFEST.json (опис українською й нідерландською та учасники) — для нових випусків він обовʼязковий." "UITROL-MANIFEST.json ontbreekt (beschrijving uk+nl en deelnemers) — verplicht voor nieuwe releases."
fi
# ---- Regel 3 (audit 18.10.2026, punt 10): de release moet herleidbaar zijn tot een commit. BRON-COMMIT is óf een volledige
# git-commit (40 hex), óf uitdrukkelijk «zonder-git:<reden>» (pakket buiten git gebouwd; de reden komt op de site te staan).
# «unknown», leeg of iets anders → geweigerd. Zie deploy/REGELS-UITROLPAKKET.md.
BRON_COMMIT="$(meta BRON-COMMIT 200 | tr -d '\n')"
COMMIT_TEKST=""
if [[ "$BRON_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then COMMIT_TEKST="$BRON_COMMIT"
elif [[ "$BRON_COMMIT" =~ ^zonder-git:[[:space:]]*(.{5,})$ ]]; then COMMIT_TEKST="zonder-git"
else weiger GEEN_BRON_COMMIT "У пакеті немає дійсного BRON-COMMIT (40-символьний git-коміт або «zonder-git:<причина>»). Без нього неможливо сказати, який код працює. Випуск відхилено — див. deploy/REGELS-UITROLPAKKET.md." "BRON-COMMIT ontbreekt of is ongeldig (40-tekens git-commit of «zonder-git:<reden>»). Zonder commit is niet te zeggen welke code draait. Release geweigerd — zie deploy/REGELS-UITROLPAKKET.md."
fi
# TRACE-001: vóór installatie uitsluitend met VASTE GitHub-routes controleren dat
# (1) het volledige ontwikkeldossier op de aangegeven commit in de taak-tak staat en
# (2) exact deze pakketbytes als tar.gz in de release van dezelfde versie bestaan.
# De URL uit het pakket wordt nooit geopend; geen script uit het pakket wordt uitgevoerd.
if [[ ! "$VERSIE" < "20261103-211555" ]]; then
  [ -f "$BRON/ONTWIKKELARCHIEF.json" ] || weiger GEEN_ONTWIKKELARCHIEF "Немає ONTWIKKELARCHIEF.json — обов'язкової перевіреної історії GitHub." "ONTWIKKELARCHIEF.json met gecontroleerde GitHub-herkomst ontbreekt."
  ARCHIEF_UITKOMST="$(timeout 55 python3 - "$BRON/ONTWIKKELARCHIEF.json" "$BRON_COMMIT" "$VERSIE" "$WERK/pakket.tar.gz" <<'PY' 2>/dev/null || true
import base64, hashlib, json, os, re, stat, sys, urllib.request, urllib.parse
f, bron, versie, pakket = sys.argv[1:]
repo='Tarasevych/hub'
if not re.fullmatch(r'[0-9a-f]{40}', bron):
    print('ONTWIKKELARCHIEF_ONGELDIG'); sys.exit()
try:
    if os.path.getsize(f)>8192: raise ValueError('te groot')
    ref=json.load(open(f,encoding='utf-8'))
    taak=ref.get('taakId','')
    pad=f'orchestratie/ontwikkelarchieven/{taak}.json'
    commit=ref.get('commit','')
    tak=ref.get('tak','')
    if (ref.get('schema')!=1 or not re.fullmatch(r'[A-Z][A-Z0-9]{1,9}-\d{3,5}',taak)
        or not re.fullmatch(r'(functie|herstel|controle|feature|fix|audit|release)/[a-z0-9-]+-\d{8}-\d{6}',tak)
        or ref.get('repo')!=repo or commit!=bron or ref.get('pad')!=pad
        or not re.fullmatch(r'[0-9a-f]{64}',ref.get('sha256',''))
        or ref.get('url')!=f'https://github.com/{repo}/blob/{commit}/{pad}'
        or ref.get('release')!=f'https://github.com/{repo}/releases/tag/{versie}'
        or ref.get('pakket')!=f'mijn-ruimte-{versie}.tar.gz'):
        raise ValueError('ongeldige herkomst')
except Exception:
    print('ONTWIKKELARCHIEF_ONGELDIG');sys.exit()
headers={'Accept':'application/vnd.github+json','User-Agent':'Mijn-Ruimte-Uitrol-TRACE-001',
         'X-GitHub-Api-Version':'2022-11-28'}
# Alleen de voor root afgeschermde oude tokenfile; geen geheim in argumenten, log of pakket.
tokenfile='/etc/mijn-ruimte/github-token'
try:
    st=os.stat(tokenfile)
    if st.st_uid==0 and not (stat.S_IMODE(st.st_mode)&0o077):
        token=open(tokenfile,encoding='utf-8').read(4096).strip()
        if token: headers['Authorization']='Bearer '+token
except OSError: pass
class GeenOmleiding(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise ValueError('redirect geweigerd')
opener=urllib.request.build_opener(GeenOmleiding)
def gh(url):
    import time
    for poging in range(3):
        try:
            req=urllib.request.Request(url,headers=headers)
            with opener.open(req,timeout=12) as r:
                if r.status!=200: raise ValueError('HTTP_'+str(r.status))
                data=r.read(800001)
                if len(data)>800000: raise ValueError('te groot')
                return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code in (401,403) and 'Authorization' in headers:
                headers.pop('Authorization',None)
                continue
            if e.code in (429,500,502,503,504) and poging<2:
                time.sleep(1)
                continue
            raise
        except urllib.error.URLError:
            if poging<2:
                time.sleep(1)
                continue
            raise
try:
    u=f'https://api.github.com/repos/{repo}/contents/{pad}?ref={commit}'
    item=gh(u)
    if item.get('type')!='file' or item.get('encoding')!='base64': raise ValueError('geen bestand')
    raw=base64.b64decode(item['content'])
    if len(raw)>256000 or hashlib.sha256(raw).hexdigest()!=ref['sha256']:
        print('ONTWIKKELARCHIEF_SHA_VERSCHILT');sys.exit()
    doc=json.loads(raw)
    if (doc.get('schema')!=1 or doc.get('taakId')!=taak or
        len(str(doc.get('opdracht','')).strip())<40 or
        not all(isinstance(doc.get(x),list) and doc[x] for x in
                ('tijdlijn','keuzes','wijzigingen','controles','bronnen','beperkingen')) or
        doc.get('privacy',{}).get('geheimenUitgesloten') is not True):
        raise ValueError('onvolledig dossier')
    branch=gh(f'https://api.github.com/repos/{repo}/branches/{urllib.parse.quote(tak,safe="")}')
    head=branch.get('commit',{}).get('sha','')
    if not re.fullmatch(r'[0-9a-f]{40}',head): raise ValueError('geen tak')
    compare=gh(f'https://api.github.com/repos/{repo}/compare/{commit}...{head}')
    if compare.get('status') not in ('ahead','identical'):
        print('ONTWIKKELARCHIEF_TAK_ONGELDIG');sys.exit()
    release=gh(f'https://api.github.com/repos/{repo}/releases/tags/{versie}')
    asset=next((a for a in release.get('assets',[]) if a.get('name')==ref['pakket']),None)
    if not asset or asset.get('state')!='uploaded':
        print('ONTWIKKELARCHIEF_PAKKET_ONTBREEKT');sys.exit()
    digest=hashlib.file_digest(open(pakket,'rb'),'sha256').hexdigest()
    if asset.get('digest')!='sha256:'+digest:
        print('ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT');sys.exit()
    print('OK')
except urllib.error.HTTPError as e:
    print('ONTWIKKELARCHIEF_NIET_GEVONDEN' if e.code==404 else 'ONTWIKKELARCHIEF_ONBEREIKBAAR')
except Exception:
    print('ONTWIKKELARCHIEF_ONBEREIKBAAR')
PY
)"
  case "$ARCHIEF_UITKOMST" in
    OK) log "TRACE-001: GitHub commit, tak, dossier en exact pakketdigest bevestigd" ;;
    GEEN_ONTWIKKELARCHIEF|ONTWIKKELARCHIEF_ONGELDIG|ONTWIKKELARCHIEF_SHA_VERSCHILT|ONTWIKKELARCHIEF_TAK_ONGELDIG|ONTWIKKELARCHIEF_PAKKET_ONTBREEKT|ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT|ONTWIKKELARCHIEF_NIET_GEVONDEN|ONTWIKKELARCHIEF_ONBEREIKBAAR)
      weiger "$ARCHIEF_UITKOMST" "GitHub не підтвердив повну історію розробки й точний архів ($ARCHIEF_UITKOMST). Установлення відхилено." "GitHub kon het ontwikkeldossier en het exacte archief niet bevestigen ($ARCHIEF_UITKOMST). Installatie geweigerd." ;;
    *) weiger ONTWIKKELARCHIEF_ONBEREIKBAAR "Перевірка GitHub не завершилась. Установлення відхилено." "GitHub-verificatie niet voltooid. Installatie geweigerd." ;;
  esac
fi
log "метадані випуску: автор=$AUTEUR агент=$AGENT commit=${COMMIT_TEKST}"
stap inhoud ok 40 "Вміст і метадані в порядку (автор: $AUTEUR, агент: $AGENT)." "Inhoud en metadata zijn in orde (auteur: $AUTEUR, agent: $AGENT)."
publiceer_log

# Blijvend archief van het pakket: $PAKKETTEN_DIR/mijn-ruimte-<versie>.tar.gz (+ .sha256), map root:$GROEP 0750, bestanden 0640.
# Nooit fataal; zet PAKKET_PAD/PAKKET_SHA256/PAKKET_BYTES en UITROL_GEB_EXTRA (door gebeurtenis() in de OK-regel opgenomen). Idempotent.
PAKKETTEN_DIR="${UITROL_PAKKETTEN_DIR:-/srv/mijn-ruimte/pakketten}"
PAKKET_PAD=""; PAKKET_SHA256=""; PAKKET_BYTES=""
#
# SEC-002 (server-uitrol-02): $PAKKETTEN_DIR is schrijfbaar voor de app (groep, 0770, geen sticky-bit). Alles wat root dáár zelf
# aanmaakt of op naam bewerkt, kan de app vervangen door een symlink: `printf > "$doel.sha256"`, `cp`, `chgrp` en `chmod` volgen
# die link en overschreven zo een willekeurig root-bestand of maakten het leesbaar voor de groep. Daarom nu:
#   • archief en .sha256 worden klaargezet in de eigen werkmap van root ($WERK, 0700): daar groep en rechten, sha256 en grootte van
#     de EIGEN kopie (nooit teruggelezen uit de gedeelde map);
#   • in de gedeelde map gebeurt alleen `mv -T -f` (rename(2) vervangt de naam zelf en volgt geen symlink; op een ander
#     bestandssysteem verwijdert mv eerst de bestemming en maakt haar met O_EXCL opnieuw aan — ook dan wordt geen link gevolgd);
#   • de map zelf mag geen symlink zijn en moet van root zijn (ze staat in een map die alleen root kan schrijven).
# Каталог архівів записуваний для застосунку: root готує файли у власній теці й лише перейменовує їх туди (посилання не слідуються).
pakketten_map_veilig() { # → 0 als $PAKKETTEN_DIR een echte map van root is (zo nodig aangemaakt)
  if [ -L "$PAKKETTEN_DIR" ]; then log "archief: $PAKKETTEN_DIR is een symlink — niets bewaard"; return 1; fi
  [ -d "$PAKKETTEN_DIR" ] || mkdir -p -- "$PAKKETTEN_DIR" || return 1
  if [ -L "$PAKKETTEN_DIR" ] || [ ! -d "$PAKKETTEN_DIR" ] || [ "$(stat -c %u -- "$PAKKETTEN_DIR" 2>/dev/null)" != "$(id -u)" ]; then
    log "archief: $PAKKETTEN_DIR is geen map van root — niets bewaard"; return 1
  fi
  chgrp "$GROEP" "$PAKKETTEN_DIR" 2>/dev/null || true
  chmod 0770 "$PAKKETTEN_DIR" 2>/dev/null || true   # de app (groep) mag opruimen; bestanden blijven root 0640
  return 0
}
pakket_bewaren() {
  [ -n "${PAKKET_PAD:-}" ] && return 0
  [ -f "$WERK/pakket.tar.gz" ] || { log "archief: geen kopie om te bewaren"; return 1; }
  pakketten_map_veilig || return 1
  local naam="mijn-ruimte-${VERSIE}.tar.gz" doel klaar sha bytes
  doel="$PAKKETTEN_DIR/$naam"
  klaar="$(mktemp -d "$WERK/archief.XXXXXX")" || return 1
  if ! cp -f -- "$WERK/pakket.tar.gz" "$klaar/$naam"; then rm -rf -- "$klaar"; log "archief: kopiëren mislukt"; return 1; fi
  sha="$(sha256sum -- "$klaar/$naam" | cut -c1-64)"; bytes="$(stat -c %s -- "$klaar/$naam")"
  printf '%s  %s\n' "$sha" "$naam" > "$klaar/$naam.sha256"
  chgrp "$GROEP" "$klaar/$naam" "$klaar/$naam.sha256" 2>/dev/null || true
  chmod 0640 "$klaar/$naam" "$klaar/$naam.sha256"
  if ! mv -T -f -- "$klaar/$naam" "$doel"; then rm -rf -- "$klaar"; log "archief: plaatsen in $PAKKETTEN_DIR mislukt"; return 1; fi
  mv -T -f -- "$klaar/$naam.sha256" "$doel.sha256" || log "archief: $naam.sha256 niet geplaatst (het archief zelf staat er wel)"
  rm -rf -- "$klaar"
  PAKKET_PAD="$doel"; PAKKET_SHA256="$sha"; PAKKET_BYTES="$bytes"
  export UITROL_GEB_EXTRA="{\"pakket_pad\":\"$PAKKET_PAD\",\"pakket_sha256\":\"$PAKKET_SHA256\",\"pakket_bytes\":$PAKKET_BYTES}"
  log "archief bewaard: $doel ($PAKKET_BYTES bytes, sha256 $sha)"
  return 0
}

# ---- 5. installeren (alleen ondertekende code) ----
rm -f -- "$INBOX/$NAAM" "$INBOX/$NAAM.sig" "$INBOX/$NAAM.goedkeuring.json"
status bezig INSTALLEREN "Встановлюю випуск $VERSIE." "Release $VERSIE wordt geïnstalleerd." "$VERSIE"
stap installeren bezig 42 "Встановлюю: копіювання, збірка, міграції, перезапуск, перевірка роботи." "Installeren: kopiëren, bouwen, migraties, herstart, gezondheidscontrole."
export MIJN_RUIMTE_UITROL_MODUS="$MODUS"
if [ -n "$INSTALLEER" ]; then cmd=( "$INSTALLEER" installeren "$BRON" ); else cmd=( bash "$BRON/deploy/installeer-app.sh" installeren "$BRON" ); fi
publiceer_log
set +e
# Eigen procesgroep (setsid): een stopverzoek of SIGTERM beëindigt dan ook npm, vite en node, niet alleen de bash van het script.
setsid "${cmd[@]}" >> "$WERK/installeer.log" 2>&1 < /dev/null &
INSTALL_PID=$!
# Terwijl de installatie loopt elke 2 seconden de staart publiceren, zodat de site het verloop kan tonen; en op een stopverzoek letten.
( while kill -0 "$INSTALL_PID" 2>/dev/null; do
    installeer_stappen; publiceer_log
    if [ ! -f "$WERK/gestopt" ] && stop_verzoek; then
      # SEC-002 (server-uitrol-08): het percentage op het moment van beslissen rechtstreeks uit het logboek (stap-pct was van vóór het
      # lezen van het stopverzoek en kon bij de grens van 90 % al verouderd zijn). Valt het signaal toch net na het overschakelen, dan
      # zet het installatiescript zelf de vorige release terug (bij_signaal in deploy/installeer-app.sh).
      pct="$(log_pct)"
      if [ "$pct" -lt 90 ]; then
        printf '%s\n%s\n' "$STOP_DOOR" "$STOP_REDEN" > "$WERK/gestopt"
        log "STOP: eigenaar vraagt te stoppen bij $pct % (${STOP_DOOR:-onbekend})${STOP_REDEN:+: $STOP_REDEN} — installatie wordt afgebroken, vorige release blijft actief"
        printf '[installeer] stap: gestopt (%s%%) зупинено власником / gestopt door de eigenaar\n' "$pct" >> "$WERK/installeer.log"
        kill -TERM -- "-$INSTALL_PID" 2>/dev/null || kill -TERM "$INSTALL_PID" 2>/dev/null
      else
        log "STOP: verzoek van de eigenaar kwam bij $pct % — te laat (het overschakelen loopt al); de gezondheidscontrole en de automatische terugdraai beslissen"
        gebeurtenis STOP_TE_LAAT waarschuwing "Запит на зупинку надійшов, коли перемикання вже тривало ($pct %). Його проігноровано: результат вирішать перевірка здоров’я та автоматичний відкат." "Het stopverzoek kwam toen het overschakelen al liep ($pct %). Het is genegeerd: gezondheidscontrole en automatische terugdraai beslissen."
      fi
    fi
    sleep 2
  done ) 8>&- &
LOG_PID=$!
wait "$INSTALL_PID"
INSTALL_RC=$?
kill "$LOG_PID" 2>/dev/null
wait "$LOG_PID" 2>/dev/null
installeer_stappen
publiceer_log
set -e
if [ "$INSTALL_RC" -eq 0 ]; then
  printf '%s\n' "$VERSIE" > "$WERK_ROOT/laatste-versie"
  # ORCH-001: de geïnstalleerde commit bewaren voor de basiscontrole van het volgende pakket (alleen een echte 40-hex commit).
  if [[ "${BRON_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then printf '%s\n' "$BRON_COMMIT" > "$WERK_ROOT/laatste-commit"; fi
  # Oudere (nooit meer installeerbare: NIET_NIEUWER) pakketten uit de inbox halen. Een NIEUWER pakket dat tijdens deze installatie binnenkwam
  # blijft staan voor de volgende ronde, waar de gewone controles (versie, UITROL-BASIS, regels) erover oordelen — vroeger werd het hier stil
  # gewist (ORCH-001 etappe 4, acceptatietest «gelijktijdige installaties», 31.10.2026).
  # Старі пакети (не новіші за щойно встановлений) прибираються; новіший, що надійшов під час установки, лишається на наступний прохід.
  while IFS= read -r oud; do
    v="${oud#mijn-ruimte-}"; v="${v%%.tar.gz*}"
    [[ "$v" > "$VERSIE" ]] && continue
    rm -f -- "$INBOX/$oud" "$INBOX/$oud.sig" "$INBOX/$oud.goedkeuring.json" 2>/dev/null || true
  done < <(find "$INBOX" -maxdepth 1 -type f -name 'mijn-ruimte-*.tar.gz' -printf '%f\n' 2>/dev/null)
  # Archief vóór de OK-gebeurtenis bewaren, zodat die gebeurtenis het pad en de sha256 bevat (de app zet ze in app.uitrol_runs).
  set +e; pakket_bewaren; set -e
  status klaar OK "Випуск $VERSIE встановлено." "Release $VERSIE is geïnstalleerd." "$VERSIE"
  AFGEROND=1   # vanaf hier is de uitkomst geschreven; de trap mag haar niet meer overschrijven
  stap installeren ok 98 "Встановлення й перевірка роботи завершені." "Installatie en gezondheidscontrole zijn klaar."
  stap klaar ok 100 "Випуск $VERSIE активний." "Release $VERSIE is actief."
  if [ "$MODUS" = passkey ]; then
    gebeurtenis OK info "Випуск $VERSIE встановлено (схвалено passkey). Автор: $AUTEUR, агент: $AGENT." "Release $VERSIE geïnstalleerd (passkey). Auteur: $AUTEUR, agent: $AGENT."
  else
    gebeurtenis OK info "Випуск $VERSIE встановлено (підпис ключем). Автор: $AUTEUR, агент: $AGENT." "Release $VERSIE geïnstalleerd (ondertekend). Auteur: $AUTEUR, agent: $AGENT."
  fi
  log "klaar: $VERSIE"
  publiceer_log
  # Blijvend archief (audit 18.10.2026, punt 4): is al vóór de OK-gebeurtenis bewaard (pakket_bewaren, nooit fataal), zodat die
  # gebeurtenis pad en sha256 bevat. Vroeger zocht dit blok `$BRON/../<naam>` of `/tmp/<naam>` — die bestonden nooit (de kopie heet
  # `$WERK/pakket.tar.gz`, de inbox is al leeg), dus er werd nooit een archief bewaard en nooit een GitHub-release gemaakt. GitHub
  # publiceert nu de site (backend/uitrol-github.ts) met de token uit de kluis; root heeft geen kluis en geen token-bestand meer nodig.
  [ -n "$PAKKET_PAD" ] || log "archief: niet bewaard (zie hierboven); de site kan dit pakket later niet aanbieden om te downloaden"
elif [ -f "$WERK/gestopt" ]; then
  STOP_DOOR="$(sed -n 1p "$WERK/gestopt")"; STOP_REDEN="$(sed -n 2p "$WERK/gestopt")"
  pct="$(cat "$WERK/stap-pct" 2>/dev/null || echo 0)"
  REDEN_TEKST="gestopt door de eigenaar${STOP_DOOR:+ ($STOP_DOOR)} bij $pct %${STOP_REDEN:+: $STOP_REDEN}"
  if nieuwe_release_actief; then
    # SEC-002 (server-uitrol-08): het stopsignaal viel toch ná het overschakelen en het terugzetten lukte niet — zeg dat eerlijk.
    REDEN_UK="! Встановлення зупинено власником${STOP_DOOR:+ ($STOP_DOOR)} на $pct %${STOP_REDEN:+: $STOP_REDEN}, але новий випуск $VERSIE уже був увімкнений і лишився активним БЕЗ завершеної перевірки. Перевірте сайт; якщо він не працює — поверніть попередній випуск («Оновлення» → «Повернути» або sudo mijn-ruimte-installeer terugdraaien)."
    REDEN_NL="! Installatie gestopt door de eigenaar${STOP_DOOR:+ ($STOP_DOOR)} bij $pct %${STOP_REDEN:+: $STOP_REDEN}, maar de nieuwe release $VERSIE was al ingeschakeld en is actief gebleven ZONDER afgeronde controle. Controleer de site; werkt ze niet, zet dan de vorige release terug («Оновлення» → «Повернути» of sudo mijn-ruimte-installeer terugdraaien)."
  else
  REDEN_UK="Встановлення зупинено власником${STOP_DOOR:+ ($STOP_DOOR)} на $pct %${STOP_REDEN:+: $STOP_REDEN}. Попередній випуск лишився активним; незавершену теку випуску прибрано."
  REDEN_NL="Installatie gestopt door de eigenaar${STOP_DOOR:+ ($STOP_DOOR)} bij $pct %${STOP_REDEN:+: $STOP_REDEN}. De vorige release blijft actief; de onvolledige releasemap is opgeruimd."
  fi
  stap installeren fout 0 "$REDEN_UK" "$REDEN_NL"
  status mislukt GESTOPT "$REDEN_UK" "$REDEN_NL" "$VERSIE"
  AFGEROND=1
  gebeurtenis GESTOPT waarschuwing "$REDEN_UK" "$REDEN_NL"
  log "installatie gestopt door de eigenaar (afsluitcode $INSTALL_RC)"
  publiceer_log
  exit 1
else
  tail -n 40 "$WERK/installeer.log" >&2 || true
  # Oorzaak (audit 18.10.2026, punt 6). Vroeger: de LAATSTE regel met een breed sleutelwoord («ts» paste op bijna alles, «mislykt» was een
  # tikfout) — dat werd meestal «bouwen mislukt (journalctl …)» en de echte fout (bv. «error TS6133 …») kwam nooit op de site.
  # Nu: de EERSTE echte foutregel vanaf het begin van het onderdeel dat liep (laatste «[installeer] stap:»-regel), met 2 regels ervoor en
  # 3 erna als context. Gevonden niets, dan de laatste «[installeer] FOUT:»-regel, anders de laatste regel van het logboek.
  CONTEXT_BESTAND="$WERK/oorzaak-context.txt"
  mapfile -t oorzaak < <(python3 - "$WERK/installeer.log" "$CONTEXT_BESTAND" <<'PY' 2>/dev/null || true
import re, sys
log, ctx_pad = sys.argv[1], sys.argv[2]
try:
    regels = [re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", r).rstrip() for r in open(log, encoding="utf-8", errors="replace").read().splitlines()]
except OSError:
    regels = []
STAP = re.compile(r"^\[installeer\] stap: ([a-z]+) \(")
FOUT = re.compile(r"(\berror\b|\bERR!|^\[installeer\] FOUT:|psql:.*\bERROR\b|\bFATAL\b|Traceback \(most recent|^fatal:)", re.I)
def is_fout(r):
    return bool(r.strip()) and not r.startswith("[uitrol]") and "LET OP" not in r and FOUT.search(r) is not None
begin, stap = 0, ""
for i, r in enumerate(regels):
    m = STAP.match(r)
    if m:
        begin, stap = i, m.group(1)
eerste = next((i for i in range(begin, len(regels)) if is_fout(regels[i])), None)
if eerste is None:
    eerste = next((i for i in range(len(regels)) if is_fout(regels[i]) and not regels[i].startswith("[uitrol]")), None)
if eerste is None:
    eerste = next((i for i in range(len(regels) - 1, -1, -1) if regels[i].strip() and not regels[i].startswith("[uitrol]")), None)
if eerste is None:
    print(stap); print("onbekende fout (leeg logboek)"); sys.exit(0)
van, tot = max(begin, eerste - 2), min(len(regels), eerste + 4)
with open(ctx_pad, "w", encoding="utf-8") as f:
    f.write("\n".join(r[:300] for r in regels[van:tot] if r.strip()) + "\n")
print(stap)
print(" ".join(regels[eerste].split())[:300])
PY
)
  FOUT_STAP="${oorzaak[0]:-}"; REDEN_TEKST="${oorzaak[1]:-onbekende fout}"
  case "$FOUT_STAP" in
    proef) STAP_UK="проба міграцій на копії схеми (нічого не змінено)"; STAP_NL="migratieproef op een schemakopie (niets gewijzigd)" ;;
    pgversie) STAP_UK="перевірка версії PostgreSQL"; STAP_NL="controle PostgreSQL-versie" ;;
    kopie) STAP_UK="копіювання коду"; STAP_NL="broncode kopiëren" ;;
    npm) STAP_UK="встановлення залежностей (npm ci)"; STAP_NL="afhankelijkheden installeren (npm ci)" ;;
    bouwen) STAP_UK="збірка"; STAP_NL="bouwen" ;;
    backup) STAP_UK="резервна копія бази"; STAP_NL="back-up van de database" ;;
    migraties) STAP_UK="міграції бази даних"; STAP_NL="databasemigraties" ;;
    activeren) STAP_UK="активація"; STAP_NL="activeren" ;;
    gezondheid) STAP_UK="перевірка роботи"; STAP_NL="gezondheidscontrole" ;;
    nabewaken) STAP_UK="нагляд після активації"; STAP_NL="nabewaking" ;;
    rook) STAP_UK="рендер-контроль (сторінка не рендериться, відкочено автоматично)"; STAP_NL="rendercontrole (pagina rendert niet, automatisch teruggedraaid)" ;;
    *) STAP_UK="встановлення"; STAP_NL="installatie" ;;
  esac
  REDEN="$REDEN_TEKST"
  if nieuwe_release_actief; then
    # SEC-002 (server-uitrol-08): het installatiescript viel om ná het overschakelen (bv. in een inrichtstap na «actief», of het
    # terugzetten mislukte). «De vorige release blijft actief» zou dan niet waar zijn.
    REDEN_UK="! Встановлення не завершилося на кроці «${STAP_UK}»: ${REDEN_TEKST}. Новий випуск $VERSIE при цьому вже активний — перевірте сайт і журнал; за потреби поверніть попередній випуск («Оновлення» → «Повернути» або sudo mijn-ruimte-installeer terugdraaien)."
    REDEN_NL="! De installatie is niet afgerond in stap «${STAP_NL}»: ${REDEN_TEKST}. De nieuwe release $VERSIE is daarbij al actief — controleer de site en het logboek; zet zo nodig de vorige release terug («Оновлення» → «Повернути» of sudo mijn-ruimte-installeer terugdraaien)."
  else
  REDEN_UK="Встановлення не вдалося на кроці «${STAP_UK}»: ${REDEN_TEKST}. Попередній випуск лишився активним."
  REDEN_NL="Installeren mislukt in stap «${STAP_NL}»: ${REDEN_TEKST}. De vorige release blijft actief."
  fi
  stap installeren fout 0 "$REDEN_UK" "$REDEN_NL"
  status mislukt INSTALLATIE_MISLUKT "$REDEN_UK" "$REDEN_NL" "$VERSIE"
  AFGEROND=1
  gebeurtenis INSTALLATIE_MISLUKT fout "$REDEN_UK" "$REDEN_NL"
  log "installatie mislukt (afsluitcode $INSTALL_RC): $REDEN"
  publiceer_log
  exit 1
fi
