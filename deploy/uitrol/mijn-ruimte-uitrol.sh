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
        UITROL_GOEDKEUR_INBOX UITROL_GOEDKEUR_HULP 2>/dev/null || true
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

log() { echo "[uitrol] $*" >&2; }
mkdir -p "$WERK_ROOT" "$STATUS_DIR"
chmod 0700 "$WERK_ROOT"

status() { # status <staat> <code> <uk> <nl> [versie]
  local tmp; tmp="$(mktemp "$STATUS_DIR/.status.XXXXXX")"
  python3 - "$tmp" "$1" "$2" "$3" "$4" "${5:-}" "$MODUS" <<'PY'
import json, sys, datetime
path, staat, code, uk, nl, versie, methode = sys.argv[1:8]
json.dump({"staat": staat, "code": code, "uk": uk, "nl": nl, "versie": versie, "methode": methode,
           "tijd": datetime.datetime.now(datetime.timezone.utc).isoformat()}, open(path, "w"), ensure_ascii=False)
PY
  chgrp "$GROEP" "$tmp" 2>/dev/null || true
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATUS_DIR/status.json"
}

gebeurtenis() { # gebeurtenis <code> <niveau> <uk> <nl>  (zelfde vorm als gitops; de app neemt ze op in de audit)
  (
    flock 7
    tmp="$(mktemp "$STATUS_DIR/.gebeurtenis.XXXXXX")"
    python3 - "$STATUS_DIR/gebeurtenissen.jsonl" "$tmp" uitrol "$1" "$2" "$3" "$4" "${VERSIE:-}" "$MODUS" <<'PY'
import json, sys, datetime, secrets
pad, tmp, bron, code, niveau, uk, nl, tag, herkomst = sys.argv[1:10]
nu = datetime.datetime.now(datetime.timezone.utc)
regel_d = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(), "bron": bron,
           "code": code, "niveau": niveau, "uk": uk, "nl": nl, "tag": tag}
if herkomst in ("passkey", "handtekening"):
    regel_d["herkomst"] = herkomst
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

exec 8>"$LOCK"
flock -n 8 || { log "er loopt al een uitrol"; exit 0; }

WERK="$(mktemp -d "$WERK_ROOT/pakket.XXXXXX")"
opruimen() { rm -rf -- "$WERK"; }
trap opruimen EXIT

weiger() { # weiger <code> <uk> <nl>
  log "GEWEIGERD: $1 — $3"
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
if [ "$MODUS" = passkey ]; then
  [ -f "$INBOX/$NAAM.goedkeuring.json" ] && [ ! -L "$INBOX/$NAAM.goedkeuring.json" ] || weiger GOEDKEURING_ONTBREEKT "Немає файлу схвалення passkey." "Het goedkeuringsbestand (passkey) ontbreekt."
else
  [ -f "$INBOX/$NAAM.sig" ] && [ ! -L "$INBOX/$NAAM.sig" ] || weiger SIG_ONTBREEKT "Немає файлу підпису (.sig)." "Het handtekeningbestand (.sig) ontbreekt."
fi
[ ! -L "$INBOX/$NAAM" ] || weiger SYMLINK "Пакет є символьним посиланням." "Het pakket is een symlink."
status bezig CONTROLE "Перевіряю пакет $VERSIE." "Pakket $VERSIE wordt gecontroleerd." "$VERSIE"

# ---- 2. kopie naar de eigen root-map; vanaf hier telt alleen de kopie ----
timeout 120 head -c "$((MAX_BYTES + 1))" < "$INBOX/$NAAM" > "$WERK/pakket.tar.gz" || weiger KOPIE "Не вдалося скопіювати пакет." "Kopiëren van het pakket mislukt."
[ "$(stat -c %s "$WERK/pakket.tar.gz")" -le "$MAX_BYTES" ] || weiger TE_GROOT "Пакет завеликий." "Het pakket is te groot."
if [ "$MODUS" = passkey ]; then
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
  gebeurtenis GOEDGEKEURD info "Пакет $VERSIE схвалено passkey власника; починаю перевірку вмісту." "Pakket $VERSIE goedgekeurd met de passkey van de eigenaar; inhoud wordt gecontroleerd."
else
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
fi

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
    tf.extractall(doel, members=leden, filter="data")
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

# ---- Правило 2 (обов'язкові метадані випуску): машина відхиляє випуск без автора, агента й підсумку. Діє для БУДЬ-ЯКОГО
# джерела (passkey/підпис/gitops/мобільний додаток). Файли додає скрипт збирання (deploy/uitrol/maak-*pakket).
meta() { head -c "$2" "$BRON/$1" 2>/dev/null | tr -d '\000' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }
AUTEUR="$(meta AUTEUR 200)"
AGENT="$(meta AGENT 40)"
SAMENVATTING="$(meta SAMENVATTING 8000 | tr '\n' ' ')"
[ -n "$AUTEUR" ] || weiger GEEN_AUTEUR "У пакеті немає AUTEUR (хто автор випуску). Випуск відхилено." "AUTEUR ontbreekt in het pakket (wie is de auteur). Release geweigerd."
[[ "${#AUTEUR}" -ge 3 ]] || weiger AUTEUR_ONGELDIG "AUTEUR закороткий. Випуск відхилено." "AUTEUR is te kort. Release geweigerd."
[ -n "$AGENT" ] || weiger GEEN_AGENT "У пакеті немає AGENT (через якого агента зроблено). Випуск відхилено." "AGENT ontbreekt (via welke agent gemaakt). Release geweigerd."
[[ "$AGENT" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || weiger AGENT_ONGELDIG "AGENT має бути як-от claude/cursor/gpt (малі літери). Випуск відхилено." "AGENT moet bv. claude/cursor/gpt zijn (kleine letters). Release geweigerd."
[ -n "$SAMENVATTING" ] || weiger GEEN_SAMENVATTING "У пакеті немає SAMENVATTING (підсумок: що і для чого, що було/зʼявилося/зникло). Випуск відхилено." "SAMENVATTING ontbreekt (samenvatting: wat en waarom, wat was/kwam/verdween). Release geweigerd."
[[ "${#SAMENVATTING}" -ge 20 ]] || weiger SAMENVATTING_TE_KORT "SAMENVATTING закороткий (мінімум 20 символів змістовного опису). Випуск відхилено." "SAMENVATTING is te kort (minstens 20 tekens). Release geweigerd."
log "метадані випуску: автор=$AUTEUR агент=$AGENT"

# ---- 5. installeren (alleen ondertekende code) ----
rm -f -- "$INBOX/$NAAM" "$INBOX/$NAAM.sig" "$INBOX/$NAAM.goedkeuring.json"
status bezig INSTALLEREN "Встановлюю випуск $VERSIE." "Release $VERSIE wordt geïnstalleerd." "$VERSIE"
export MIJN_RUIMTE_UITROL_MODUS="$MODUS"
if [ -n "$INSTALLEER" ]; then cmd=( "$INSTALLEER" installeren "$BRON" ); else cmd=( bash "$BRON/deploy/installeer-app.sh" installeren "$BRON" ); fi
if "${cmd[@]}" > "$WERK/installeer.log" 2>&1; then
  printf '%s\n' "$VERSIE" > "$WERK_ROOT/laatste-versie"
  # Oudere (nooit meer installeerbare) pakketten uit de inbox halen.
  find "$INBOX" -maxdepth 1 -type f \( -name 'mijn-ruimte-*.tar.gz' -o -name 'mijn-ruimte-*.tar.gz.sig' -o -name 'mijn-ruimte-*.tar.gz.goedkeuring.json' \) -delete 2>/dev/null || true
  status klaar OK "Випуск $VERSIE встановлено." "Release $VERSIE is geïnstalleerd." "$VERSIE"
  if [ "$MODUS" = passkey ]; then
    gebeurtenis OK info "Випуск $VERSIE встановлено (схвалено passkey). Автор: $AUTEUR, агент: $AGENT." "Release $VERSIE geïnstalleerd (passkey). Auteur: $AUTEUR, agent: $AGENT."
  else
    gebeurtenis OK info "Випуск $VERSIE встановлено (підпис ключем). Автор: $AUTEUR, агент: $AGENT." "Release $VERSIE geïnstalleerd (ondertekend). Auteur: $AUTEUR, agent: $AGENT."
  fi
  log "klaar: $VERSIE"
else
  tail -n 40 "$WERK/installeer.log" >&2 || true
  # Extract the last meaningful error line so the site shows WHY it failed, not just "failed".
  REDEN="$(python3 -c '
import sys
lines = open(sys.argv[1], encoding="utf-8", errors="replace").read().splitlines()
candidates = [l.strip() for l in lines if l.strip() and not l.startswith("[installeer] klaar")]
# Prefer lines that look like errors
err = [l for l in candidates if any(x in l.lower() for x in ("error", "fout", "failed", "mislykt", "exit", "cannot", "undefined", "ts", "tsc"))]
use = (err or candidates)[-1:] 
print(use[0][:240] if use else "onbekende fout")
' "$WERK/installeer.log" 2>/dev/null || echo "onbekende fout")"
  REDEN_UK="Встановлення не вдалося (${REDEN}); попередній випуск лишився активним."
  REDEN_NL="Installeren mislukt (${REDEN}); de vorige release blijft actief."
  status mislukt INSTALLATIE_MISLUKT "$REDEN_UK" "$REDEN_NL" "$VERSIE"
  gebeurtenis INSTALLATIE_MISLUKT fout "$REDEN_UK" "$REDEN_NL"
  exit 1
fi
