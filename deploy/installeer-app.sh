#!/usr/bin/env bash
# installeer-app.sh — bouwt en installeert een release van Mijn Ruimte op de VM, met rollback.
#
# Indeling op de VM:
#   /srv/mijn-ruimte/releases/<JJJJMMDD-UUMMSS>/   één map per release (code + node_modules + dist + dist-server)
#   /srv/mijn-ruimte/current  -> releases/<…>      symlink naar de actieve release (atomisch omgezet)
#   /srv/mijn-ruimte/VORIGE                        pad van de vorige release (voor terugdraaien)
#   /srv/data/uploads                              bestanden (enige schrijfbare map van de dienst)
#   /etc/mijn-ruimte/geheimen.env                  geheimen (zie ENV-VARS.md)
#
# Gebruik (als root):
#   installeer-app.sh inrichten  <bronmap>    eenmalig: gebruikers, mappen, systemd-units, timers
#   installeer-app.sh installeren <bronmap>   bouwen, back-up, migreren, activeren, gezondheidscontrole
#   installeer-app.sh terugdraaien [release]  terug naar de vorige (of een genoemde) release
#   installeer-app.sh lijst                   releases tonen
#   installeer-app.sh dashboard <map>         statische dashboardpagina's (alleen *.html/*.css/*.js/afbeeldingen)
#                                             naar /srv/mijn-ruimte/dashboard, alleen-lezen voor de dienst
#   installeer-app.sh apps-inrichten <bronmap> [--caddy tunnel|publiek|geen] [--caddy-poort 8090]
#                                             «Додатки»: rootless Podman, gebruiker mr-apps (geen root, geen sudo),
#                                             agent als systemd-dienst, optioneel Caddy (admin alleen via unix-socket)
#   installeer-app.sh apps-koppelen <KOPPELCODE> [--domein '{app}-app.voorbeeld.nl'] [--naam N] [--geheugen 512m] [--server URL]
#                                             agent van mr-apps koppelen (code van mcp.* → Agenten) en starten
#   installeer-app.sh apps-status             stand van de apps-agent, Caddy en de containers
#   installeer-app.sh apps-terminal on|off    terminal in de browser via de apps-agent (wegwerpcontainer zonder netwerk,
#                                             rootless podman als mr-apps; openen alleen vanuit een technisch profiel)
#   installeer-app.sh beheer-koppelen <KOPPELCODE> [--gebruiker beheer] [--root DIR]... [--readonly-root DIR]... [--allow git,node]
#                                             deze server als apparaat op de site (agent als die gebruiker, NoNewPrivileges:
#                                             geen sudo); daarna alles via mcp.* (toestemmingen, hulpmiddelen, journaal)
#
# <bronmap> is een git-checkout (alleen de GECOMMITTE stand van HEAD wordt gebruikt) of een uitgepakte map
# (bijv. een `git archive`-tarball; staat daarin een bestand BRON-COMMIT, dan wordt dat de commit van de release).
# Opties via omgeving: BEWAAR_RELEASES (standaard 5), ZONDER_BACKUP=1 (back-up vóór migratie overslaan),
#                      NODE (standaard /usr/bin/node), PORT (standaard 8080),
#                      BOUW_GEHEUGEN_MAX (3000M), BOUW_SWAP_MAX (2G), BOUW_HEAP_MB (2560) voor de build.
set -euo pipefail

APP_ROOT=/srv/mijn-ruimte
RELEASES="$APP_ROOT/releases"
HUIDIG="$APP_ROOT/current"
VORIGE_BESTAND="$APP_ROOT/VORIGE"
GEHEIMEN=/etc/mijn-ruimte/geheimen.env
# Audit-fix 4: migrator- en legacy-URL (DATABASE_URL_MIGRATIE, DATABASE_URL) alleen voor de migratiestap.
MIGRATIE_ENV=/etc/mijn-ruimte/migratie.env
DIENST=mijn-ruimte.service
GEBRUIKER=mijnruimte
BACKUP_GROEP=mijnruimte-backup
# Audit van een handmatige installatie. GitOps, de ondertekende inbox en de site-opdracht «terugdraaien»
# zetten MIJN_RUIMTE_UITROL_MODUS en schrijven zelf; als root nooit een ander statuspad (tests wel).
if [ "$(id -u)" -eq 0 ]; then unset MIJN_RUIMTE_STATUS_DIR MIJN_RUIMTE_STATUS_GROEP; fi
STATUS_GEBEURTENISSEN="${MIJN_RUIMTE_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}"
STATUS_GROEP="${MIJN_RUIMTE_STATUS_GROEP:-$GEBRUIKER}"
NODE="${NODE:-/usr/bin/node}"
PORT="${PORT:-8080}"
BEWAAR="${BEWAAR_RELEASES:-5}"
GEZONDHEID_URL="http://127.0.0.1:${PORT}/__gezondheid"
TIMERS=(mijn-ruimte-mail-onderhoud.timer mijn-ruimte-google-sync.timer mijn-ruimte-opruimen.timer mijn-ruimte-backup.timer mijn-ruimte-mail-queue.timer mijn-ruimte-gitops.timer)

ONVOLTOOID=""   # pad van een release die nog niet klaar is; wordt bij een fout verwijderd
opruimen_bij_afbreken() { if [ -n "$ONVOLTOOID" ] && [ -d "$ONVOLTOOID" ]; then echo "[installeer] onvolledige release $ONVOLTOOID verwijderd" >&2; rm -rf -- "$ONVOLTOOID"; fi; }
trap opruimen_bij_afbreken EXIT
git_bron() { git -c safe.directory="$BRON_GIT" -C "$BRON_GIT" "$@"; }

melding() { echo "[installeer] $*"; }
waarschuwing() { echo "[installeer] LET OP: $*" >&2; }
fout() { echo "[installeer] FOUT: $*" >&2; exit 1; }

pakket_versie() {
  local v=""
  [ -f "$1/UITROL-VERSIE" ] && v="$(head -c 32 "$1/UITROL-VERSIE" | tr -d '\r\n[:space:]')"
  [[ "$v" =~ ^[0-9]{8}-[0-9]{6}$ ]] && printf '%s' "$v"
}
commit_van() {
  local c=""
  [ -f "$1/RELEASE-COMMIT" ] && c="$(head -c 64 "$1/RELEASE-COMMIT" | tr -d '\r\n[:space:]')"
  c="${c:0:40}"
  [[ "$c" =~ ^[0-9a-f]{7,40}$ ]] && printf '%s' "$c"
}

# Handmatige SSH-installatie of -terugdraaiing. Schrijft status.json (methode ssh, de app zet daarmee
# geen voorstel op «geïnstalleerd») en een regel in gebeurtenissen.jsonl. Een andere modus schrijft niets.
noteer_ssh() { # noteer_ssh <SSH_OK|SSH_TERUG> <release> <pakket> <commit>
  case "${MIJN_RUIMTE_UITROL_MODUS:-ssh}" in
    passkey|handtekening|gitops|opdracht) return 0 ;;
  esac
  case "$1" in SSH_OK|SSH_TERUG) ;; *) return 0 ;; esac
  mkdir -p "$STATUS_GEBEURTENISSEN" || return 1
  (
    flock 7
    tmp="$(mktemp "$STATUS_GEBEURTENISSEN/.gebeurtenis.XXXXXX")"
    st="$(mktemp "$STATUS_GEBEURTENISSEN/.status.XXXXXX")"
    python3 - "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl" "$tmp" "$st" "$1" "$2" "$3" "$4" "${SUDO_USER:-}" "${SSH_CONNECTION:-}" <<'PY' || { rm -f -- "$tmp" "$st"; exit 1; }
import json, sys, datetime, secrets, re
pad, tmp, st, code, release, pakket, commit, wie, verbinding = sys.argv[1:10]
def schoon(v, pat):
    v = str(v or "").strip()
    return v if re.fullmatch(pat, v) else ""
release = schoon(release, r"[0-9]{8}-[0-9]{6}")
if not release:
    sys.exit(2)
pakket = schoon(pakket, r"[0-9]{8}-[0-9]{6}")
commit = schoon(commit, r"[0-9a-f]{7,40}")
wie = (schoon(wie, r"[A-Za-z_][A-Za-z0-9_.-]{0,31}") or "onbekend") if str(wie or "").strip() else "root"
adres = schoon(str(verbinding).split()[0] if str(verbinding).split() else "", r"(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)")
if code == "SSH_OK":
    uk, nl = f"Випуск {release} встановлено з SSH", f"Release {release} geïnstalleerd via SSH"
else:
    uk, nl = f"Повернуто на випуск {release} з SSH", f"Teruggedraaid naar release {release} via SSH"
if pakket:
    uk += f" (пакет {pakket})"; nl += f" (pakket {pakket})"
uk += f", користувач {wie}"; nl += f", gebruiker {wie}"
if adres:
    uk += f", з {adres}"; nl += f", vanaf {adres}"
if commit:
    uk += f", коміт {commit[:12]}"; nl += f", commit {commit[:12]}"
uk += "."; nl += "."
nu = datetime.datetime.now(datetime.timezone.utc)
regel = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(),
         "bron": "uitrol", "code": code, "niveau": "info", "uk": uk, "nl": nl, "tag": release,
         "herkomst": "ssh", "wie": wie, "release": release}
if pakket: regel["pakket"] = pakket
if commit: regel["commit"] = commit
if adres: regel["adres"] = adres
try:
    oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
except FileNotFoundError:
    oud = []
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
json.dump({"staat": "klaar", "code": code, "uk": uk, "nl": nl, "versie": release, "methode": "ssh", "tijd": nu.isoformat()},
          open(st, "w"), ensure_ascii=False)
PY
    chgrp "$STATUS_GROEP" "$tmp" "$st" 2>/dev/null || true
    chmod 0640 "$tmp" "$st"
    mv -f "$tmp" "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl"
    mv -f "$st" "$STATUS_GEBEURTENISSEN/status.json"
  ) 7>"$STATUS_GEBEURTENISSEN/.gebeurtenissen.lock"
}

# Doel van de current-symlink, of leeg als die (nog) niet bestaat. NIET `readlink -f` op een
# ontbrekend pad: dat geeft het pad zelf terug (bij de eerste installatie gaf dat een symlink naar zichzelf).
actieve_release() { if [ -L "$HUIDIG" ] && [ -d "$HUIDIG" ]; then readlink -f "$HUIDIG"; fi; }

vereis_root() { [ "$(id -u)" -eq 0 ] || fout "voer dit uit als root (sudo)"; }
vereis_node() {
  [ -x "$NODE" ] || fout "Node niet gevonden op $NODE (Node 24 vereist)"
  local major; major="$("$NODE" -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 24 ] || fout "Node $major gevonden, Node 24 of nieuwer vereist"
  command -v npm >/dev/null || fout "npm ontbreekt"
}
vergrendel() {
  exec 9>/run/lock/mijn-ruimte-installeer.lock
  flock -n 9 || fout "er loopt al een installatie"
}

gezond() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS --max-time 3 "$GEZONDHEID_URL" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    sleep 1
  done
  return 1
}

units_installeren() {
  local bron="$1" gewijzigd=0 f
  for f in "$bron"/deploy/*.service "$bron"/deploy/*.timer "$bron"/deploy/*.path; do
    [ -e "$f" ] || continue
    if ! cmp -s "$f" "/etc/systemd/system/$(basename "$f")"; then
      install -m 0644 -o root -g root "$f" /etc/systemd/system/
      gewijzigd=1
    fi
  done
  if [ "$gewijzigd" -eq 1 ]; then systemctl daemon-reload; melding "systemd-units bijgewerkt"; fi
}

# ---------------------------------------------------------------------------------------------
# Oude MCP-deur met root-pad uitschakelen (audit 2026-10-08, C1/C3): de sudo-regel, de root-hulp die gestagede code uitvoerde,
# de "povnyj-arkhiv"-lader, de drop-in die NoNewPrivileges uitzette en de app-schrijfbare schakelaars. Idempotent.
oude_deur_opruimen() {
  local p weg=0 q
  # Niet wissen maar in quarantaine (root 0700): de inhoud is bewijsmateriaal voor het onderzoek naar de oude deur (audit §6).
  q="/var/lib/mijn-ruimte-quarantaine/$(date +%Y%m%d-%H%M%S)"
  for p in /etc/sudoers.d/mijn-ruimte-mcp /usr/local/sbin/mijn-ruimte-mcp-doen /usr/local/sbin/mijn-ruimte-povnyj-arkhiv \
           /etc/systemd/system/mijn-ruimte-mcp.service.d/write.conf "$APP_ROOT/mcp-staging" \
           /srv/data/uploads/mcp-permissions.json /srv/data/uploads/mcp-bridge.token; do
    if [ -e "$p" ] || [ -L "$p" ]; then
      install -d -o root -g root -m 0700 "$q"
      mv -- "$p" "$q/$(echo "${p#/}" | tr '/' '_')"
      melding "naar quarantaine ($q): $p"; weg=1
    fi
  done
  rmdir /etc/systemd/system/mijn-ruimte-mcp.service.d 2>/dev/null || true
  if [ "$weg" -eq 1 ]; then chmod -R go-rwx "$q"; systemctl daemon-reload; fi
  # Controle: geen enkele sudo-regel mag de app-gebruiker nog iets als root laten doen.
  if grep -rqsE "^[^#]*\b$GEBRUIKER\b.*NOPASSWD" /etc/sudoers /etc/sudoers.d/ 2>/dev/null; then
    waarschuwing "er staat nog een NOPASSWD-regel voor $GEBRUIKER in /etc/sudoers(.d): verwijder die met de hand (visudo)."
  fi
}

# Veilige uitrol (ondertekende pakketten): root-script, units, mappen, standaard-schakelaars van de MCP-deur.
veilige_uitrol_inrichten() {
  local doel="$1"
  [ -s "$doel/deploy/uitrol/mijn-ruimte-uitrol.sh" ] || return 0
  install -m 0755 -o root -g root "$doel/deploy/uitrol/mijn-ruimte-uitrol.sh" /usr/local/sbin/mijn-ruimte-uitrol
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/uitrol-inbox" "$APP_ROOT/mcp-state"
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte-uitrol
  install -d -o root -g "$GEBRUIKER" -m 0750 /var/lib/mijn-ruimte-uitrol-status
  # De eerste uitrol via de inbox moet nieuwer zijn dan wat nu draait.
  [ -s /var/lib/mijn-ruimte-uitrol/laatste-versie ] || date +%Y%m%d-%H%M%S > /var/lib/mijn-ruimte-uitrol/laatste-versie
  if [ ! -e /etc/mijn-ruimte/mcp-rechten.json ]; then
    printf '%s\n' '{"read": true, "uitrol": false, "gitops": false, "passkey-goedkeuring": false, "opdracht": {"status": true, "releases": true, "backup": true, "uitrol-nu": true, "terugdraaien": false}}' > /etc/mijn-ruimte/mcp-rechten.json
    chown root:"$GEBRUIKER" /etc/mijn-ruimte/mcp-rechten.json; chmod 0640 /etc/mijn-ruimte/mcp-rechten.json
  fi
  if [ -s "$doel/deploy/mcp/server.mjs" ]; then
    install -d -o root -g root -m 0755 "$APP_ROOT/mcp"
    install -m 0644 -o root -g root "$doel/deploy/mcp/server.mjs" "$APP_ROOT/mcp/server.mjs"
    if ! cmp -s "$doel/deploy/mcp/mijn-ruimte-mcp.service" /etc/systemd/system/mijn-ruimte-mcp.service; then
      install -m 0644 -o root -g root "$doel/deploy/mcp/mijn-ruimte-mcp.service" /etc/systemd/system/mijn-ruimte-mcp.service
      systemctl daemon-reload
    fi
    systemctl try-restart mijn-ruimte-mcp.service >/dev/null 2>&1 || true
  fi
  if [ -s /etc/mijn-ruimte/uitrol-ondertekenaars ]; then
    systemctl enable --now mijn-ruimte-uitrol.path >/dev/null 2>&1 || waarschuwing "mijn-ruimte-uitrol.path kon niet worden gestart"
  else
    waarschuwing "/etc/mijn-ruimte/uitrol-ondertekenaars ontbreekt: uitrol via mcp.tarasevych.com staat uit tot de publieke sleutel er staat (zie deploy/RUNBOOK-VEILIGE-UITROL.md)."
  fi
  melding "veilige uitrol ingericht"
}

# De map deploy/ van een release is tijdens `npm ci`/build schrijfbaar voor mijnruimte (scripts van afhankelijkheden). Alles wat
# daarna als root wordt geïnstalleerd (units, root-scripts, polkit-regel) moet uit de ONGEWIJZIGDE bron komen: daarom deploy/ na
# het bouwen opnieuw uit de bron halen (git: HEAD; uitgepakte map: die map zelf, die alleen root kan schrijven).
deploy_herstellen() {
  local bron="$1" doel="$2"
  rm -rf -- "$doel/deploy"
  BRON_GIT="$bron"
  if git_bron rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git_bron archive --format=tar HEAD deploy | tar -x -C "$doel"
  else
    rsync -a --no-links "$bron/deploy/" "$doel/deploy/"
  fi
  chown -R "root:$GEBRUIKER" "$doel/deploy"
  chmod -R u=rwX,g=rX,o= "$doel/deploy"
  find "$doel/deploy" -type f -name '*.sh' -exec chmod 750 {} +
  if find "$doel/deploy" -type l | grep -q .; then fout "symlink in deploy/ van $doel"; fi
}

# Beheer op afstand zonder root-pad voor de app (methode 1 GitOps-pull, methode 3 gepantserde opdracht; zie RUNBOOK-VEILIGE-UITROL.md).
beheer_inrichten() {
  local doel="$1"
  [ -s "$doel/deploy/opdracht/mijn-ruimte-opdracht.sh" ] || return 0
  install -d -o root -g root -m 0755 /var/lib/mijn-ruimte
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte/gitops /var/lib/mijn-ruimte/opdracht
  install -d -o root -g "$GEBRUIKER" -m 0750 /var/lib/mijn-ruimte-uitrol-status
  # Root-kopie van de installer: `terugdraaien` via methode 3 voert nooit iets uit /srv/mijn-ruimte/…/deploy uit.
  install -m 0755 -o root -g root "$doel/deploy/installeer-app.sh" /usr/local/sbin/mijn-ruimte-installeer
  install -m 0755 -o root -g root "$doel/deploy/gitops/gitops-ophalen.sh" /usr/local/sbin/mijn-ruimte-gitops
  install -m 0755 -o root -g root "$doel/deploy/opdracht/mijn-ruimte-opdracht.sh" /usr/local/sbin/mijn-ruimte-opdracht
  [ -e /etc/mijn-ruimte/gitops-known_hosts ] || install -m 0644 -o root -g root "$doel/deploy/gitops/github-known_hosts" /etc/mijn-ruimte/gitops-known_hosts
  # Eerste GitOps-uitrol moet nieuwer zijn dan wat nu draait (tags in UTC).
  [ -s /var/lib/mijn-ruimte/gitops/laatste-tag ] || echo "uitrol-$(date -u +%Y%m%d-%H%M)" > /var/lib/mijn-ruimte/gitops/laatste-tag
  if [ -e /etc/mijn-ruimte/gitops.env ]; then
    chown root:root /etc/mijn-ruimte/gitops.env; chmod 0600 /etc/mijn-ruimte/gitops.env
  fi
  # polkit (JavaScript-regels, >= 0.106): de app mag alleen mijn-ruimte-opdracht@<vast werkwoord>.service starten.
  if [ -d /etc/polkit-1/rules.d ] && command -v pkaction >/dev/null 2>&1; then
    if ! cmp -s "$doel/deploy/opdracht/50-mijn-ruimte-opdracht.rules" /etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules; then
      install -m 0644 -o root -g root "$doel/deploy/opdracht/50-mijn-ruimte-opdracht.rules" /etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules
      melding "polkit-regel voor mijn-ruimte-opdracht@ geïnstalleerd"
    fi
  else
    waarschuwing "polkit (polkitd, JavaScript-regels) ontbreekt: methode 3 werkt pas na 'apt install polkitd' en opnieuw installeren. Geen sudo-terugval (zie RUNBOOK-VEILIGE-UITROL.md §9)."
  fi
  systemctl enable mijn-ruimte-gitops.timer >/dev/null 2>&1 || waarschuwing "mijn-ruimte-gitops.timer kon niet worden ingeschakeld"
  melding "beheer op afstand ingericht (GitOps: $(python3 -c 'import json;print("aan" if json.load(open("/etc/mijn-ruimte/mcp-rechten.json")).get("gitops") is True else "uit")' 2>/dev/null || echo uit))"
}

# Goedkeuren van updates met de passkey van de eigenaar (RUNBOOK-VEILIGE-UITROL.md §13): root-hulp (node, alleen ingebouwde
# modules) + kern, wrapper /usr/local/sbin/mijn-ruimte-passkey, root-map voor nonces/tellers, de inbox van de app en twee path-units.
# Het sleutelbestand /etc/mijn-ruimte/goedkeur-passkeys.json wordt alleen aangemaakt (leeg) als het ontbreekt; sleutels komen er
# uitsluitend in via `mijn-ruimte-passkey toevoegen` (SSH) of met een assertie van een al bekende sleutel. Schakelaar
# "passkey-goedkeuring" in mcp-rechten.json: ontbreekt = uit.
goedkeur_inbox_maken() { install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/goedkeur-inbox"; }
goedkeuring_inrichten() {
  local doel="$1"
  [ -s "$doel/deploy/goedkeuring/goedkeur-hulp.mjs" ] || return 0
  install -d -o root -g root -m 0755 /usr/local/lib/mijn-ruimte /usr/local/lib/mijn-ruimte/goedkeuring
  install -m 0644 -o root -g root "$doel/deploy/goedkeuring/webauthn-kern.mjs" "$doel/deploy/goedkeuring/goedkeur-hulp.mjs" /usr/local/lib/mijn-ruimte/goedkeuring/
  # AI-beleid (§13.12): kern naast de hulp; keten leesbaar voor de app, schrijfbaar alleen voor root.
  [ -s "$doel/deploy/goedkeuring/ai-beleid-kern.mjs" ] && install -m 0644 -o root -g root "$doel/deploy/goedkeuring/ai-beleid-kern.mjs" /usr/local/lib/mijn-ruimte/goedkeuring/
  install -m 0755 -o root -g root "$doel/deploy/goedkeuring/mijn-ruimte-passkey.sh" /usr/local/sbin/mijn-ruimte-passkey
  install -d -o root -g root -m 0755 /var/lib/mijn-ruimte
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte/goedkeuring
  install -d -o root -g root -m 0755 /var/lib/mijn-ruimte/ai-beleid
  goedkeur_inbox_maken
  if [ ! -e /etc/mijn-ruimte/goedkeur-passkeys.json ]; then
    printf '%s\n' '{"versie": 1, "rpId": "tarasevych.com", "origins": ["https://admin.tarasevych.com", "https://id.tarasevych.com"], "sleutels": []}' > /etc/mijn-ruimte/goedkeur-passkeys.json
  fi
  chown root:"$GEBRUIKER" /etc/mijn-ruimte/goedkeur-passkeys.json; chmod 0640 /etc/mijn-ruimte/goedkeur-passkeys.json
  # Sinds «Способи входу»: rpId tarasevych.com (één passkey voor id/admin/hub). Alleen een LEEG bestand met de oude rpId wordt
  # omgezet; met sleutels blijft alles zoals het is (melding in het log).
  /usr/local/sbin/mijn-ruimte-passkey rp-bijwerken >/dev/null 2>&1 || waarschuwing "passkey-rpId niet bijgewerkt (er staan al sleutels in of de rpId is met de hand gezet): zie 'mijn-ruimte-passkey lijst'"
  systemctl enable --now mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeur-sleutels.path >/dev/null 2>&1 || waarschuwing "path-units voor de passkey-goedkeuring konden niet worden gestart"
  melding "passkey-goedkeuring ingericht ($(/usr/local/sbin/mijn-ruimte-passkey lijst 2>/dev/null | head -1 || echo 'stand onbekend'))"
}

# ---------------------------------------------------------------------------------------------
inrichten() {
  local bron="${1:?bronmap ontbreekt}"
  vereis_root
  getent group "$BACKUP_GROEP" >/dev/null || groupadd --system "$BACKUP_GROEP"
  if ! id "$GEBRUIKER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$APP_ROOT" --no-create-home --shell /usr/sbin/nologin "$GEBRUIKER"
    melding "systeemgebruiker $GEBRUIKER aangemaakt"
  fi
  install -d -o root -g "$GEBRUIKER" -m 0750 "$APP_ROOT" "$RELEASES" "$APP_ROOT/dashboard"
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0700 "$APP_ROOT/.npm-cache" "$APP_ROOT/.bouw-home"
  install -d -o root -g root -m 0755 /srv/data /srv/backups
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 /srv/data/uploads
  install -d -o "$GEBRUIKER" -g "$BACKUP_GROEP" -m 2750 /srv/backups/mijn-ruimte
  install -d -o root -g "$GEBRUIKER" -m 0750 /etc/mijn-ruimte
  units_installeren "$bron"
  # cloudflared: alleen de configuratie voorbereiden (tunnel-id als plaatshouder); de tunnel zelf wordt
  # NIET aangemaakt of ingeschakeld (dat vraagt een Cloudflare-login, zie LEESMIJ.md "Tunnel").
  if command -v cloudflared >/dev/null 2>&1 && [ ! -e /etc/cloudflared/config.yml ]; then
    install -d -o root -g root -m 0755 /etc/cloudflared
    sed 's/<TUNNEL-ID>/TUNNEL-ID-INVULLEN/g' "$bron/deploy/cloudflared-config.yml" > /etc/cloudflared/config.yml
    chown root:root /etc/cloudflared/config.yml; chmod 0644 /etc/cloudflared/config.yml
    melding "cloudflared-configuratie voorbereid: /etc/cloudflared/config.yml (tunnel-id TUNNEL-ID-INVULLEN, niet ingeschakeld)"
  fi
  systemctl enable "$DIENST" "${TIMERS[@]}" >/dev/null
  melding "dienst en timers ingeschakeld (starten na de eerste installatie)"
  if ! command -v age >/dev/null 2>&1; then
    waarschuwing "age ontbreekt (apt install age): de back-up (ook die vóór elke installatie) weigert zonder."
  fi
  if ! grep -Eqs '^age1[0-9a-z]{58}$' /etc/mijn-ruimte/backup-ontvanger.age.pub; then
    waarschuwing "/etc/mijn-ruimte/backup-ontvanger.age.pub ontbreekt: zet daar de PUBLIEKE age-sleutel (0644). Zie HERSTEL.md."
  fi
  if [ ! -s "$GEHEIMEN" ]; then
    waarschuwing "$GEHEIMEN ontbreekt nog. Maak hem aan volgens ENV-VARS.md (0600 root:root volstaat: systemd leest hem als root)."
  fi
  cat <<EOT
[installeer] Postgres (eenmalig, als dat nog niet bestaat), bijvoorbeeld:
  sudo -u postgres psql -c "CREATE ROLE $GEBRUIKER LOGIN PASSWORD '<uit DATABASE_URL>';"
  sudo -u postgres psql -c "CREATE DATABASE $GEBRUIKER OWNER $GEBRUIKER;"
[installeer] Daarna: $0 installeren $bron
EOT
}

# ---------------------------------------------------------------------------------------------
bron_kopieren() {
  local bron="$1" doel="$2" commit="onbekend"
  BRON_GIT="$bron"
  if git_bron rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git_bron diff --quiet HEAD -- 2>/dev/null; then
      waarschuwing "niet-gecommitte wijzigingen in $bron worden NIET meegenomen (alleen HEAD)"
    fi
    git_bron archive --format=tar HEAD | tar -x -C "$doel"
    commit="$(git_bron rev-parse --short HEAD)"
  else
    rsync -a --exclude node_modules --exclude dist --exclude dist-server --exclude .git --exclude rapporten "$bron/" "$doel/"
    if [ -s "$bron/BRON-COMMIT" ]; then commit="$(head -c 40 "$bron/BRON-COMMIT" | tr -cd '0-9a-f')"; fi
  fi
  echo "$commit" > "$doel/RELEASE-COMMIT"
}

bouwen() {
  local doel="$1"
  chown -R "$GEBRUIKER:$GEBRUIKER" "$doel"
  # Bouwen als onbevoegde gebruiker: npm-scripts van afhankelijkheden draaien nooit als root.
  # NODE_ENV=development alleen voor `npm ci` (devDependencies nodig); de build zelf met NODE_ENV=production, anders
  # bundelt vite de ontwikkelversie van React (trager, extra waarschuwingen) — zo stond het t/m release 20261009-052551.
  # In een eigen cgroup met geheugenplafond: de vite-build heeft ~1,5 GB heap nodig. Op een kleine VM
  # (2 GB RAM) mag de build in swap uitwijken, maar raakt een tekort alleen de build (cgroup-OOM),
  # nooit Postgres of sshd. Instelbaar: BOUW_GEHEUGEN_MAX, BOUW_SWAP_MAX, BOUW_HEAP_MB.
  systemd-run --quiet --wait --pipe --collect --unit="mijn-ruimte-bouw-$(basename "$doel")" \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p WorkingDirectory="$doel" \
    -p MemoryMax="${BOUW_GEHEUGEN_MAX:-3000M}" -p MemorySwapMax="${BOUW_SWAP_MAX:-2G}" -p Nice=10 \
    -p NoNewPrivileges=yes -p PrivateTmp=yes \
    -E PATH="$(dirname "$NODE"):/usr/bin:/bin" -E HOME="$APP_ROOT/.bouw-home" \
    -E npm_config_cache="$APP_ROOT/.npm-cache" -E npm_config_update_notifier=false -E NODE_ENV=development \
    -E NODE_OPTIONS="--max-old-space-size=${BOUW_HEAP_MB:-2560}" \
    bash -c 'set -euo pipefail; npm ci --no-audit --no-fund; NODE_ENV=production npm run build; npm prune --omit=dev --no-audit --no-fund' \
    || fout "bouwen mislukt (journalctl -u mijn-ruimte-bouw-$(basename "$doel"))"
  [ -f "$doel/dist/index.html" ] || fout "bouwen mislukt: dist/index.html ontbreekt"
  [ -f "$doel/dist-server/start.mjs" ] || fout "bouwen mislukt: dist-server/start.mjs ontbreekt"
  find "$doel/dist" -name '*.map' -delete
  rm -rf "$doel/rapporten"
  # Code is daarna alleen-lezen voor de dienst (root is eigenaar).
  chown -R "root:$GEBRUIKER" "$doel"
  chmod -R u=rwX,g=rX,o= "$doel"
  find "$doel/deploy" -type f -name '*.sh' -exec chmod 750 {} +
}

migreren() {
  local doel="$1"
  if [ "${ZONDER_BACKUP:-0}" != "1" ] && [ -e "$HUIDIG" ] && systemctl cat mijn-ruimte-backup.service >/dev/null 2>&1; then
    melding "back-up vóór migratie…"
    chmod 750 /srv/mijn-ruimte/current/deploy/backup-maken.sh 2>/dev/null || true
    systemctl start mijn-ruimte-backup.service || fout "back-up mislukt; niets gewijzigd (ZONDER_BACKUP=1 om over te slaan)"
  fi
  melding "migraties uitvoeren…"
  systemd-run --quiet --wait --pipe --collect \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p EnvironmentFile="$GEHEIMEN" -p EnvironmentFile=-"$MIGRATIE_ENV" -p WorkingDirectory="$doel" \
    -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes \
    "$NODE" "$doel/dist-server/migrate.mjs" || fout "migratie mislukt; de actieve release is ongewijzigd"
}

omzetten() {
  # Atomisch: nieuwe symlink naast de oude maken en met rename(2) vervangen.
  local doel="$1"
  ln -sfn "$doel" "$APP_ROOT/.current.nieuw"
  mv -Tf "$APP_ROOT/.current.nieuw" "$HUIDIG"
}

activeren() {
  local doel="$1" vorige
  vorige="$(actieve_release)"
  omzetten "$doel"
  [ -n "$vorige" ] && [ "$vorige" != "$doel" ] && echo "$vorige" > "$VORIGE_BESTAND"
  systemctl restart "$DIENST"
  if gezond; then
    melding "actief: $doel"
    return 0
  fi
  waarschuwing "gezondheidscontrole mislukt ($GEZONDHEID_URL); journalctl -u $DIENST -n 50"
  if [ -n "$vorige" ] && [ -d "$vorige" ] && [ "$vorige" != "$doel" ]; then
    waarschuwing "automatisch terug naar $vorige"
    omzetten "$vorige"
    systemctl restart "$DIENST"
    gezond && melding "vorige release draait weer" || waarschuwing "ook de vorige release is niet gezond!"
  fi
  fout "installatie van $doel mislukt"
}

releases_opruimen() {
  local actief vorige r
  actief="$(actieve_release)"
  vorige="$(cat "$VORIGE_BESTAND" 2>/dev/null || true)"; [ -d "$vorige" ] || vorige=""
  # Nieuwste $BEWAAR behouden, plus altijd de actieve en de vorige.
  ls -1d "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | sort -r | tail -n +"$((BEWAAR + 1))" | while read -r r; do
    [ "$r" = "$actief" ] || [ "$r" = "$vorige" ] && continue
    rm -rf -- "$r" && melding "oude release verwijderd: $(basename "$r")"
  done
}

# Beleidsdienst OPA (architectuur 13.10.2026, etap 6; eerst «schaduw»: de app vraagt, niets wordt geblokkeerd). Alleen 127.0.0.1:8181.
# Binaire: vastgezette versie + SHA-256 (deploy/opa/versie.env) via deploy/opa/opa-ophalen.sh. Beleid: alleen toegang.rego + data.json,
# root-eigen en alleen-lezen. Mislukt iets, dan alleen een waarschuwing: de site werkt zonder OPA precies zoals ervoor.
# Uitzetten: /etc/mijn-ruimte/opa.uit aanmaken (dan wordt de dienst gestopt en niet bijgewerkt).
opa_inrichten() {
  local bron="$1" map=/usr/local/lib/mijn-ruimte/opa gewijzigd=0 f
  [ -s "$bron/deploy/opa/opa-ophalen.sh" ] || return 0
  if [ -e /etc/mijn-ruimte/opa.uit ]; then
    systemctl disable --now mijn-ruimte-opa.service >/dev/null 2>&1 || true
    melding "beleidsdienst OPA uitgezet (/etc/mijn-ruimte/opa.uit)"; return 0
  fi
  install -d -o root -g root -m 0755 /usr/local/lib/mijn-ruimte "$map" "$map/beleid"
  if ! bash "$bron/deploy/opa/opa-ophalen.sh" "$map/opa"; then waarschuwing "OPA niet geïnstalleerd (zie hierboven); de site werkt zonder"; return 0; fi
  for f in toegang.rego data.json; do
    if ! cmp -s "$bron/deploy/opa/beleid/$f" "$map/beleid/$f"; then install -m 0644 -o root -g root "$bron/deploy/opa/beleid/$f" "$map/beleid/$f"; gewijzigd=1; fi
  done
  find "$map/beleid" -mindepth 1 -maxdepth 1 ! -name toegang.rego ! -name data.json -exec rm -rf -- {} + 2>/dev/null || true
  if ! "$map/opa" check --strict "$map/beleid" >/dev/null 2>&1; then waarschuwing "beleid van OPA ongeldig; dienst niet (her)gestart"; return 0; fi
  if ! cmp -s "$bron/deploy/opa/mijn-ruimte-opa.service" /etc/systemd/system/mijn-ruimte-opa.service; then
    install -m 0644 -o root -g root "$bron/deploy/opa/mijn-ruimte-opa.service" /etc/systemd/system/mijn-ruimte-opa.service
    systemctl daemon-reload; gewijzigd=1
  fi
  systemctl enable mijn-ruimte-opa.service >/dev/null 2>&1 || true
  if [ "$gewijzigd" -eq 1 ]; then systemctl restart mijn-ruimte-opa.service >/dev/null 2>&1 || waarschuwing "mijn-ruimte-opa.service kon niet starten"
  else systemctl start mijn-ruimte-opa.service >/dev/null 2>&1 || waarschuwing "mijn-ruimte-opa.service kon niet starten"; fi
  melding "beleidsdienst OPA op 127.0.0.1:8181 (schaduwmodus)"
}

installeren() {
  local bron="${1:?bronmap ontbreekt}" datum doel
  vereis_root; vereis_node; vergrendel
  [ -s "$GEHEIMEN" ] || fout "$GEHEIMEN ontbreekt (zie ENV-VARS.md)"
  # Audit-fix 10: de app start niet zonder eigen IP-pepper; liever hier stoppen dan na het omzetten.
  grep -Eq '^[[:space:]]*AUDIT_IP_PEPPER=.{32,}' "$GEHEIMEN" || fout "AUDIT_IP_PEPPER ontbreekt in $GEHEIMEN: eerst deploy/geheimen-aanvullen.sh (zie deploy/RUNBOOK-AUDIT-FIXES.md)"
  id "$GEBRUIKER" >/dev/null 2>&1 || fout "gebruiker $GEBRUIKER ontbreekt; eerst: $0 inrichten $bron"
  bron="$(readlink -f "$bron")"
  datum="$(date +%Y%m%d-%H%M%S)"
  doel="$RELEASES/$datum"
  [ ! -e "$doel" ] || fout "$doel bestaat al"
  install -d -o root -g "$GEBRUIKER" -m 0750 "$doel"
  ONVOLTOOID="$doel"
  melding "bron kopiëren naar $doel…"; bron_kopieren "$bron" "$doel"
  # Geen patch-scripts meer tijdens het installeren (vroeger o.a. een base64-blob die als root werd uitgevoerd): wat in de bron
  # staat, is wat er gebouwd wordt. Zie deploy/RUNBOOK-VEILIGE-UITROL.md.
  melding "bouwen (npm ci, audit, vite, server-bundel)…"; bouwen "$doel"
  deploy_herstellen "$bron" "$doel"
  migreren "$doel"
  ONVOLTOOID=""   # vanaf hier blijft de release bestaan (ook als activeren mislukt, voor diagnose)
  goedkeur_inbox_maken   # vóór het herstarten: de app-unit noemt deze map in ReadWritePaths
  units_installeren "$doel"
  activeren "$doel"
  oude_deur_opruimen
  veilige_uitrol_inrichten "$doel"
  beheer_inrichten "$doel"
  goedkeuring_inrichten "$doel"
  opa_inrichten "$doel"
  # Volledig archief ("Архів на ПК"): root-script + path-unit die het verzoekbestand van de site bewaakt (de site kan zelf niets als root
  # doen). Uitvoer in een root-map (uitgifte root:mijnruimte 0750, werkmap 0700), het hele archief age-versleuteld.
  if [ -s "$doel/deploy/archief-maken.sh" ]; then
    install -m 0755 -o root -g root "$doel/deploy/archief-maken.sh" /usr/local/sbin/mijn-ruimte-archief
    install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 /srv/data/uploads/mcp-archives
    install -d -o root -g root -m 0711 /var/lib/mijn-ruimte-archief
    install -d -o root -g root -m 0700 /var/lib/mijn-ruimte-archief/werk
    install -d -o root -g "$GEBRUIKER" -m 0750 /var/lib/mijn-ruimte-archief/uitgifte
    # Oude, deels onversleutelde archieven in de app-map weghalen (bevatten broncode, units en sudoers in leesbare vorm).
    find /srv/data/uploads/mcp-archives -maxdepth 1 -type f \( -name 'mijn-ruimte-*-volledig.tar' -o -name 'mijn-ruimte-*.tar.gz' -o -name 'kit-status.txt' -o -name 'history.json' \) -delete 2>/dev/null || true
    systemctl enable --now mijn-ruimte-archief.path >/dev/null 2>&1 || waarschuwing "mijn-ruimte-archief.path kon niet worden gestart"
    melding "archief-hulp bijgewerkt"
  fi
  # Timers (cron, opruimen, back-up) starten; `enable` alleen start ze pas na een herstart.
  systemctl enable "${TIMERS[@]}" >/dev/null 2>&1 || true   # nieuwe timers moeten ook een herstart overleven
  systemctl start "${TIMERS[@]}"
  agenten_bijwerken "$doel"
  releases_opruimen
  melding "klaar: release $datum (commit $(cat "$doel/RELEASE-COMMIT"))"
  noteer_ssh SSH_OK "$datum" "$(pakket_versie "$doel")" "$(commit_van "$doel")" || waarschuwing "auditregel voor deze installatie niet geschreven"
}

terugdraaien() {
  local naam="${1:-}" doel actief
  vereis_root; vergrendel
  actief="$(actieve_release)"
  if [ -n "$naam" ]; then
    doel="$RELEASES/$naam"
  elif [ -s "$VORIGE_BESTAND" ]; then
    doel="$(cat "$VORIGE_BESTAND")"
  else
    doel="$(ls -1d "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | sort -r | grep -vx "$actief" | head -n 1 || true)"
  fi
  [ -n "$doel" ] && [ -f "$doel/dist-server/start.mjs" ] || fout "geen geldige release om naar terug te gaan (${doel:-geen})"
  [ "$doel" != "$actief" ] || fout "$doel is al actief"
  waarschuwing "migraties worden NIET teruggedraaid; het databaseschema blijft op de nieuwste stand"
  omzetten "$doel"
  echo "$actief" > "$VORIGE_BESTAND"
  systemctl restart "$DIENST"
  gezond || fout "release $doel start niet gezond; journalctl -u $DIENST -n 50"
  melding "teruggedraaid naar $(basename "$doel")"
  noteer_ssh SSH_TERUG "$(basename "$doel")" "$(pakket_versie "$doel")" "$(commit_van "$doel")" || waarschuwing "auditregel voor dit terugdraaien niet geschreven"
}

dashboard() {
  local bron="${1:?map met dashboardpaginas ontbreekt}" doel="$APP_ROOT/dashboard"
  vereis_root
  [ -f "$bron/index.html" ] || fout "$bron/index.html ontbreekt"
  install -d -o root -g "$GEBRUIKER" -m 0750 "$doel"
  # Alleen sitebestanden op het hoogste niveau; notities, varianten en controlesommen blijven buiten de site.
  rsync -rt --delete --include='*.html' --include='*.css' --include='*.js' --include='*.svg' --include='*.png' \
    --include='*.ico' --include='*.webp' --exclude='*' "$bron/" "$doel/"
  chown -R "root:$GEBRUIKER" "$doel"
  find "$doel" -type d -exec chmod 0750 {} +
  find "$doel" -type f -exec chmod 0640 {} +
  melding "dashboard geplaatst in $doel ($(find "$doel" -type f | wc -l) bestanden, alleen-lezen voor $GEBRUIKER)"
}

# ---------------------------------------------------------------------------------------------
# «Додатки» (BYOS-PaaS): apps die een AI met toestemming van de eigenaar uitrolt, draaien als rootless containers van een
# eigen systeemgebruiker. Die gebruiker heeft geen sudo en geen docker-groep (docker-groep = root); Caddy is alleen via een
# unix-socket te bedienen (groep caddy), nooit via een open TCP-poort. Alles blijft op deze machine.
APPS_GEBRUIKER=mr-apps
APPS_HOME=/srv/apps
APPS_WERK="$APPS_HOME/werk"
APPS_AGENT_DIR=/usr/local/lib/mijn-ruimte/agent
APPS_UNIT=mijn-ruimte-apps-agent.service
APPS_CADDY_SOCK=/run/caddy/admin.sock

als_apps() { runuser -u "$APPS_GEBRUIKER" -- env HOME="$APPS_HOME" HUB_AGENT_CONFIG="$APPS_HOME/.hub-agent/config.json" XDG_RUNTIME_DIR="/run/user/$(id -u "$APPS_GEBRUIKER")" "$@"; }
# Eerste vrije sub-id na alle bestaande bereiken (zodat er niets overlapt).
vrij_subid() { awk -F: 'BEGIN{m=100000} NF>=3 {e=$2+$3; if (e>m) m=e} END{print m}' "$1" 2>/dev/null || echo 100000; }

apps_inrichten() {
  local bron="${1:?bronmap ontbreekt}"; shift
  local caddy=geen poort=8090
  while [ $# -gt 0 ]; do
    case "$1" in
      --caddy) caddy="${2:?}"; shift 2 ;;
      --caddy-poort) poort="${2:?}"; shift 2 ;;
      *) fout "onbekende optie: $1" ;;
    esac
  done
  case "$caddy" in tunnel|publiek|geen) ;; *) fout "--caddy: tunnel, publiek of geen" ;; esac
  [[ "$poort" =~ ^[0-9]{2,5}$ ]] && [ "$poort" -ge 1024 ] && [ "$poort" -le 65535 ] || fout "--caddy-poort: 1024-65535"
  vereis_root
  [ -s "$bron/deploy/agent/agent.mjs" ] || fout "$bron/deploy/agent/agent.mjs ontbreekt (is dit een uitgepakte release?)"
  [ -x "$NODE" ] || fout "Node niet gevonden op $NODE"

  local nodig=()
  command -v podman >/dev/null 2>&1 || nodig+=(podman)
  command -v newuidmap >/dev/null 2>&1 || nodig+=(uidmap)
  if [ "$caddy" != geen ] && ! command -v caddy >/dev/null 2>&1; then nodig+=(caddy); fi
  if [ ${#nodig[@]} -gt 0 ]; then
    command -v apt-get >/dev/null 2>&1 || fout "installeer eerst met de pakketbeheerder van dit systeem: ${nodig[*]} (daarna dit commando opnieuw)"
    melding "pakketten installeren: ${nodig[*]}"
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${nodig[@]}" slirp4netns >/dev/null || fout "apt-get install ${nodig[*]} mislukt"
  fi

  if ! id "$APPS_GEBRUIKER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$APPS_HOME" --shell /usr/sbin/nologin "$APPS_GEBRUIKER"
    melding "systeemgebruiker $APPS_GEBRUIKER aangemaakt (geen sudo, geen docker-groep)"
  fi
  id -nG "$APPS_GEBRUIKER" | tr ' ' '\n' | grep -qxE 'sudo|wheel|docker|adm' && fout "$APPS_GEBRUIKER zit in een beheergroep (sudo/wheel/docker/adm): haal hem daar eerst uit"
  install -d -o "$APPS_GEBRUIKER" -g "$APPS_GEBRUIKER" -m 0750 "$APPS_HOME" "$APPS_WERK"
  install -d -o "$APPS_GEBRUIKER" -g "$APPS_GEBRUIKER" -m 0700 "$APPS_HOME/.hub-agent"
  local start
  if ! grep -q "^$APPS_GEBRUIKER:" /etc/subuid 2>/dev/null; then start="$(vrij_subid /etc/subuid)"; usermod --add-subuids "$start-$((start + 65535))" "$APPS_GEBRUIKER"; fi
  if ! grep -q "^$APPS_GEBRUIKER:" /etc/subgid 2>/dev/null; then start="$(vrij_subid /etc/subgid)"; usermod --add-subgids "$start-$((start + 65535))" "$APPS_GEBRUIKER"; fi
  # Linger: eigen /run/user/<uid> en gebruikersdiensten, ook zonder aanmelding (nodig voor rootless Podman).
  loginctl enable-linger "$APPS_GEBRUIKER"

  install -d -o root -g root -m 0755 "$APPS_AGENT_DIR"
  install -m 0644 -o root -g root "$bron/deploy/agent/agent.mjs" "$APPS_AGENT_DIR/agent.mjs"
  local uid; uid="$(id -u "$APPS_GEBRUIKER")"
  cat > "/etc/systemd/system/$APPS_UNIT" <<EOT
# Beheerd door mijn-ruimte-installeer apps-inrichten. Agent van «Додатки»: rootless containers als $APPS_GEBRUIKER.
[Unit]
Description=Mijn Ruimte agent voor apps (rootless containers)
After=network-online.target
Wants=network-online.target
ConditionPathExists=$APPS_HOME/.hub-agent/config.json

[Service]
User=$APPS_GEBRUIKER
Group=$APPS_GEBRUIKER
Environment=HOME=$APPS_HOME
Environment=HUB_AGENT_CONFIG=$APPS_HOME/.hub-agent/config.json
Environment=XDG_RUNTIME_DIR=/run/user/$uid
ExecStart=$NODE $APPS_AGENT_DIR/agent.mjs run
Restart=always
RestartSec=10
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
# Geen NoNewPrivileges: rootless Podman heeft newuidmap/newgidmap (setuid) nodig. De containers zelf draaien met
# --cap-drop ALL en no-new-privileges (deploy/agent/agent.mjs).

[Install]
WantedBy=multi-user.target
EOT
  chmod 0644 "/etc/systemd/system/$APPS_UNIT"

  if [ "$caddy" != geen ]; then
    getent group caddy >/dev/null || fout "groep caddy ontbreekt (is Caddy als pakket geïnstalleerd?)"
    usermod -aG caddy "$APPS_GEBRUIKER"
    install -d -m 0755 /etc/systemd/system/caddy.service.d
    cat > /etc/systemd/system/caddy.service.d/mijn-ruimte-apps.conf <<'EOT'
# Beheerd door mijn-ruimte-installeer apps-inrichten: admin-API alleen via /run/caddy/admin.sock (0660, groep caddy).
[Service]
RuntimeDirectory=caddy
RuntimeDirectoryMode=0750
UMask=0007
EOT
    local cf=/etc/caddy/Caddyfile
    if [ -s "$cf" ] && ! grep -q 'Beheerd door mijn-ruimte-installeer' "$cf" && ! grep -q '/usr/share/caddy' "$cf"; then
      waarschuwing "$cf is al aangepast: niet overschreven. Zet zelf in de globale opties 'admin unix/$APPS_CADDY_SOCK' en geef --caddy-server door bij apps-koppelen."
    else
      [ -s "$cf" ] && cp -a "$cf" "$cf.voor-mijn-ruimte.$(date +%Y%m%d%H%M%S)"
      if [ "$caddy" = tunnel ]; then
        cat > "$cf" <<EOT
# Beheerd door mijn-ruimte-installeer apps-inrichten (modus tunnel): HTTP alleen op 127.0.0.1:$poort; TLS doet de tunnel.
# Routes per app zet de apps-agent via de admin-socket; dit is alleen het vangnet.
{
	admin unix/$APPS_CADDY_SOCK
	auto_https off
}
http://:$poort {
	bind 127.0.0.1
	respond "Geen app op dit adres" 404
}
EOT
      else
        cat > "$cf" <<EOT
# Beheerd door mijn-ruimte-installeer apps-inrichten (modus publiek): Caddy op 80/443 met automatische HTTPS per app-domein.
{
	admin unix/$APPS_CADDY_SOCK
}
:443 {
	respond "Geen app op dit adres" 404
}
EOT
      fi
      chmod 0644 "$cf"
    fi
    systemctl daemon-reload
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy || fout "Caddy start niet: journalctl -u caddy -n 50"
    melding "Caddy draait (modus $caddy); admin alleen via $APPS_CADDY_SOCK"
  else
    systemctl daemon-reload
  fi
  melding "apps ingericht: gebruiker $APPS_GEBRUIKER, map $APPS_WERK, dienst $APPS_UNIT (start na het koppelen)"
  cat <<EOT
[installeer] Volgende stap: haal een koppelcode op mcp.* → Agenten → «Пристрій» en voer uit:
  sudo $0 apps-koppelen <KOPPELCODE> --domein '{app}-app.<uw-domein>'
EOT
}

apps_koppelen() {
  local code="${1:?koppelcode ontbreekt}"; shift
  local domein="" naam="" geheugen="512m" server="" caddy_server="srv0"
  while [ $# -gt 0 ]; do
    case "$1" in
      --domein) domein="${2:?}"; shift 2 ;;
      --naam) naam="${2:?}"; shift 2 ;;
      --geheugen) geheugen="${2:?}"; shift 2 ;;
      --server) server="${2:?}"; shift 2 ;;
      --caddy-server) caddy_server="${2:?}"; shift 2 ;;
      *) fout "onbekende optie: $1" ;;
    esac
  done
  vereis_root
  id "$APPS_GEBRUIKER" >/dev/null 2>&1 && [ -s "$APPS_AGENT_DIR/agent.mjs" ] || fout "eerst: $0 apps-inrichten <bronmap>"
  [[ "$code" =~ ^[A-Za-z0-9-]{4,40}$ ]] || fout "ongeldige koppelcode"
  [ -z "$domein" ] || [[ "$domein" =~ ^[a-z0-9-]{0,20}\{app\}[a-z0-9-]{0,20}(\.[a-z0-9-]{1,63})+$ ]] || fout "--domein: sjabloon zoals '{app}.apps.voorbeeld.nl' of '{app}-app.voorbeeld.nl'"
  [[ "$geheugen" =~ ^[0-9]{2,5}[mg]$ ]] || fout "--geheugen: bv. 512m of 1g"
  [[ "$caddy_server" =~ ^[A-Za-z0-9_-]{1,40}$ ]] || fout "--caddy-server: naam van de Caddy-server (standaard srv0)"
  naam="${naam:-$(hostname -s)-apps}"
  [[ "$naam" =~ ^[A-Za-z0-9._-]{1,60}$ ]] || fout "--naam: letters, cijfers, . _ -"
  if [ -z "$server" ]; then
    local domeinnaam
    domeinnaam="$(sed -n "s/^export const PUBLIC_DOMAIN = '\([a-z0-9.-]*\)';.*/\1/p" "$HUIDIG/backend/deployment-identity.ts" 2>/dev/null | head -1)"
    [ -n "$domeinnaam" ] || fout "domein van de site niet gevonden; geef --server https://mcp.<uw-domein>"
    server="https://mcp.$domeinnaam"
  fi
  [[ "$server" =~ ^https://[a-z0-9.-]+$ ]] || fout "--server: https://<host> zonder pad"
  als_apps "$NODE" "$APPS_AGENT_DIR/agent.mjs" pair --server "$server" --code "$code" --name "$naam" --root "$APPS_WERK" || fout "koppelen mislukt (code verlopen? nieuwe code halen)"
  local extra=()
  [ -n "$domein" ] && extra+=(--domain "$domein")
  [ -S "$APPS_CADDY_SOCK" ] && extra+=(--caddy-admin "unix:$APPS_CADDY_SOCK" --caddy-server "$caddy_server")
  als_apps "$NODE" "$APPS_AGENT_DIR/agent.mjs" apps-config --apps-root "$APPS_WERK" --runtime podman --memory "$geheugen" "${extra[@]}"
  systemctl daemon-reload
  systemctl enable --now "$APPS_UNIT" >/dev/null
  systemctl restart "$APPS_UNIT"
  melding "apps-agent «$naam» gekoppeld en gestart. Zet op de site (mcp.* → Агенти) de toestemmingen voor dit apparaat en de hulpmiddelen app_* aan."
}

# ---------------------------------------------------------------------------------------------
# Deze server als apparaat («Мій сервер»): een agent die als een gewone gebruiker draait (standaard beheer), met alleen de
# mappen en programma's die de eigenaar hier kiest. NoNewPrivileges=yes: zelfs met node/python op de lijst kan de agent geen
# sudo of setuid gebruiken. De eerste koppeling gebeurt bewust hier (console): de site mag zichzelf nooit toegang tot haar
# eigen host geven. Daarna regelt de eigenaar alles op de site.
agent_unit_naam() { echo "mijn-ruimte-agent-$1.service"; }

beheer_koppelen() {
  local code="${1:?koppelcode ontbreekt}"; shift
  local gebruiker=beheer naam="" server="" allow="" roots=() ro=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --gebruiker) gebruiker="${2:?}"; shift 2 ;;
      --root) roots+=("${2:?}"); shift 2 ;;
      --readonly-root) ro+=("${2:?}"); shift 2 ;;
      --allow) allow="${2:?}"; shift 2 ;;
      --naam) naam="${2:?}"; shift 2 ;;
      --server) server="${2:?}"; shift 2 ;;
      *) fout "onbekende optie: $1" ;;
    esac
  done
  vereis_root
  [[ "$code" =~ ^[A-Za-z0-9-]{4,40}$ ]] || fout "ongeldige koppelcode"
  [[ "$gebruiker" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || fout "--gebruiker: ongeldige naam"
  id "$gebruiker" >/dev/null 2>&1 || fout "gebruiker $gebruiker bestaat niet"
  local uid home; uid="$(id -u "$gebruiker")"; home="$(getent passwd "$gebruiker" | cut -d: -f6)"
  [ "$uid" -ge 1000 ] || fout "$gebruiker is een systeemgebruiker of root: kies een gewone gebruiker (bijv. beheer)"
  [ "$gebruiker" != "$GEBRUIKER" ] || fout "de app-gebruiker $GEBRUIKER mag geen agent zijn"
  [ -d "$home" ] || fout "thuismap van $gebruiker ontbreekt"
  [ ${#roots[@]} -gt 0 ] || roots=("$home")
  [[ -z "$allow" || "$allow" =~ ^[a-z0-9._-]+(,[a-z0-9._-]+)*$ ]] || fout "--allow: komma-lijst van programmanamen"
  local r schrijf=() args=()
  for r in "${roots[@]}" "${ro[@]}"; do
    [[ "$r" = /* && "$r" != *..* ]] || fout "map moet absoluut zijn zonder ..: $r"
    [ -d "$r" ] || fout "map bestaat niet: $r"
    case "$(readlink -f "$r")" in /|/root|/root/*|/etc|/etc/*|/boot*|/proc*|/sys*|/dev*|/usr|/usr/*|/var/lib/mijn-ruimte*) fout "map niet toegestaan als agent-root: $r" ;; esac
  done
  for r in "${roots[@]}"; do schrijf+=("$(readlink -f "$r")"); args+=(--root "$r"); done
  for r in "${ro[@]}"; do args+=(--readonly-root "$r"); done
  [ -n "$allow" ] && args+=(--allow "$allow")
  naam="${naam:-$(hostname -s) ($gebruiker)}"
  local naam_re='^[A-Za-z0-9._() -]{1,60}$'
  [[ "$naam" =~ $naam_re ]] || fout "--naam: letters, cijfers, spatie, . _ - ( )"
  if [ -z "$server" ]; then
    local domeinnaam
    domeinnaam="$(sed -n "s/^export const PUBLIC_DOMAIN = '\([a-z0-9.-]*\)';.*/\1/p" "$HUIDIG/backend/deployment-identity.ts" 2>/dev/null | head -1)"
    [ -n "$domeinnaam" ] || fout "domein van de site niet gevonden; geef --server https://mcp.<uw-domein>"
    server="https://mcp.$domeinnaam"
  fi
  [[ "$server" =~ ^https://[a-z0-9.-]+$ ]] || fout "--server: https://<host> zonder pad"
  [ -x "$NODE" ] || fout "Node niet gevonden op $NODE"
  [ -s "$HUIDIG/deploy/agent/agent.mjs" ] || fout "geen actieve release met deploy/agent/agent.mjs"
  install -d -o root -g root -m 0755 "$APPS_AGENT_DIR"
  install -m 0644 -o root -g root "$HUIDIG/deploy/agent/agent.mjs" "$APPS_AGENT_DIR/agent.mjs"
  install -d -o "$gebruiker" -g "$(id -gn "$gebruiker")" -m 0700 "$home/.hub-agent"
  runuser -u "$gebruiker" -- env HOME="$home" HUB_AGENT_CONFIG="$home/.hub-agent/config.json" "$NODE" "$APPS_AGENT_DIR/agent.mjs" pair --server "$server" --code "$code" --name "$naam" "${args[@]}" \
    || fout "koppelen mislukt (code verlopen? haal een nieuwe op mcp.* → Агенти)"
  local unit; unit="$(agent_unit_naam "$gebruiker")"
  cat > "/etc/systemd/system/$unit" <<EOT
# Beheerd door mijn-ruimte-installeer beheer-koppelen. Deze server als apparaat op de site, als $gebruiker.
[Unit]
Description=Mijn Ruimte agent ($gebruiker)
After=network-online.target
Wants=network-online.target
ConditionPathExists=$home/.hub-agent/config.json

[Service]
User=$gebruiker
Environment=HOME=$home
Environment=HUB_AGENT_CONFIG=$home/.hub-agent/config.json
ExecStart=$NODE $APPS_AGENT_DIR/agent.mjs run
Restart=always
RestartSec=10
# Geen sudo/setuid voor de agent en alles wat hij start; schrijven alleen in de gekozen mappen.
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=$home/.hub-agent ${schrijf[*]}
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOT
  chmod 0644 "/etc/systemd/system/$unit"
  systemctl daemon-reload
  systemctl enable --now "$unit" >/dev/null
  systemctl restart "$unit"
  melding "«$naam» gekoppeld en gestart ($unit). Geef op de site (mcp.* → Агенти → Пристрої) de toestemmingen die u wilt."
}

# Bij elke release: de agent van deze server (apps en/of beheer) bijwerken en herstarten, zodat hij nooit achterloopt.
agenten_bijwerken() {
  local doel="$1" u
  [ -d "$APPS_AGENT_DIR" ] && [ -s "$doel/deploy/agent/agent.mjs" ] || return 0
  install -m 0644 -o root -g root "$doel/deploy/agent/agent.mjs" "$APPS_AGENT_DIR/agent.mjs"
  for u in $(systemctl list-unit-files --no-legend 'mijn-ruimte-agent-*.service' "$APPS_UNIT" 2>/dev/null | awk '{print $1}'); do
    systemctl try-restart "$u" >/dev/null 2>&1 || waarschuwing "$u herstart niet"
  done
  melding "agent op deze server bijgewerkt ($(sed -n "s/^const VERSION = '\([0-9.]*\)'.*/\1/p" "$APPS_AGENT_DIR/agent.mjs" | head -1))"
}

apps_terminal() {
  local stand="${1:-}"
  [[ "$stand" == on || "$stand" == off ]] || fout "gebruik: $0 apps-terminal on|off"
  id "$APPS_GEBRUIKER" >/dev/null 2>&1 && [ -s "$APPS_AGENT_DIR/agent.mjs" ] || fout "eerst: $0 apps-inrichten <bronmap> en apps-koppelen <code>"
  (cd / && als_apps "$NODE" "$APPS_AGENT_DIR/agent.mjs" terminal-config "$stand" --runtime podman) || fout "terminal-config mislukt"
  systemctl restart "$APPS_UNIT" || waarschuwing "$APPS_UNIT kon niet herstarten"
  melding "terminal via de apps-agent: $stand"
}

apps_status() {
  systemctl --no-pager --lines=5 status "$APPS_UNIT" 2>/dev/null | head -12 || echo "$APPS_UNIT: niet ingericht"
  if systemctl is-active --quiet caddy 2>/dev/null; then echo "caddy: actief"; else echo "caddy: niet actief of niet ingericht"; fi
  if id "$APPS_GEBRUIKER" >/dev/null 2>&1; then
    (cd / && als_apps podman ps -a --filter label=mijn-ruimte.app --format '{{.Names}}  {{.Status}}  {{.Ports}}') 2>/dev/null || echo "podman: geen containers of niet bereikbaar"
  fi
}

lijst() {
  local actief vorige r label
  actief="$(actieve_release)"
  vorige="$(cat "$VORIGE_BESTAND" 2>/dev/null || true)"; [ -d "$vorige" ] || vorige=""
  for r in $(ls -1d "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | sort -r); do
    label=""
    [ "$r" = "$actief" ] && label=" (actief)"
    [ "$r" = "$vorige" ] && label="$label (vorige)"
    echo "$(basename "$r")  commit $(cat "$r/RELEASE-COMMIT" 2>/dev/null || echo '?')$label"
  done
}

opdracht="${1:-}"; shift || true
case "$opdracht" in
  inrichten) inrichten "$@" ;;
  installeren) installeren "$@" ;;
  terugdraaien) terugdraaien "$@" ;;
  lijst) lijst ;;
  dashboard) dashboard "$@" ;;
  apps-inrichten) apps_inrichten "$@" ;;
  apps-koppelen) apps_koppelen "$@" ;;
  apps-status) vereis_root; apps_status ;;
  apps-terminal) vereis_root; vereis_node; apps_terminal "$@" ;;
  beheer-koppelen) beheer_koppelen "$@" ;;
  noteer-proef) [ "$(id -u)" -ne 0 ] && [ "${INSTALLEER_NOTEER_PROEF:-}" = 1 ] || fout "alleen in een test"; noteer_ssh "$@" ;;
  *) sed -n '/^set -euo/q;2,$p' "$0"; exit 2 ;;
esac
