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
#   installeer-app.sh app-domein <host> [--caddy-poort 8090]
#                                             eigen domein voor een app: tunnelregel <host> → Caddy (na de bevestiging op de site;
#                                             nooit onder het domein van de site; kopie, validatie, terugzetten bij een fout)
#   installeer-app.sh apps-terminal on|off    terminal in de browser via de apps-agent (wegwerpcontainer zonder netwerk,
#                                             rootless podman als mr-apps; openen alleen vanuit een technisch profiel)
#   installeer-app.sh siem aan [--bestand] [--loki http://127.0.0.1:3100] [--vanaf-begin] | siem uit
#                                             journaal naar uw eigen SIEM op DEZE server (NDJSON in /var/log/mijn-ruimte
#                                             en/of Loki op loopback); schrijft alleen SIEM_-regels in /etc/mijn-ruimte/siem.env
#   installeer-app.sh beheer-koppelen <KOPPELCODE> [--gebruiker beheer] [--root DIR]... [--readonly-root DIR]... [--allow git,node]
#                                             deze server als apparaat op de site (agent als die gebruiker, NoNewPrivileges:
#                                             geen sudo); daarna alles via mcp.* (toestemmingen, hulpmiddelen, journaal)
#   installeer-app.sh terminal-inrichten [--gebruiker beheer] [--allow …] [--root DIR]... [--opnieuw] | --status | --uit
#                                             (zone G 22.10.2026) deze server als apparaat van de eigenaar ZONDER code overtypen:
#                                             koppelcode via dist-server/apparaat-koppelcode.mjs, agent als beheer in
#                                             mijn-ruimte-apparaat.service (NoNewPrivileges), «Термінал» op de site opent meteen;
#                                             loopt ook stil mee aan het einde van «installeren» (deploy/apparaat-inrichten.sh)
#   installeer-app.sh geheimen [--ook-optioneel] [--eigenaar <e-mail>]
#                                             ontbrekende server-geheimen aanmaken in geheimen.env (bestaande blijven; alleen
#                                             namen + vingerafdrukken worden getoond). Loopt ook automatisch bij «installeren».
#   installeer-app.sh geheimen-register [--uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md]
#                                             register van alle geheimen (naam, doel, waar, vingerafdruk, datum) — zonder waarden
#   installeer-app.sh oauth-client google|microsoft
#                                             OAuth-client (client id, secret[, tenant]) VERBORGEN invoeren → geheimen.env →
#                                             herstart + gezondheidscontrole (Майстер підключень toont deze opdracht)
#   installeer-app.sh browser-controle [--controleer] [--verwijderen]
#                                             headless Chromium (Chrome for Testing, vastgepind + SHA-256) in /srv/mijn-ruimte/browser voor de
#                                             rendercontrole van releases; zonder browser alleen de modulecontrole in Node
#   installeer-app.sh rook-controle [--live] [release]
#                                             rendercontrole nu: sleutelpagina's in de browser (stand met testeigenaar op een wegwerpdatabase,
#                                             of --live: publieke pagina's van de draaiende dienst) → rook-controle.json; draait nooit terug
#
# <bronmap> is een git-checkout (alleen de GECOMMITTE stand van HEAD wordt gebruikt) of een uitgepakte map
# (bijv. een `git archive`-tarball; staat daarin een bestand BRON-COMMIT, dan wordt dat de commit van de release).
# Opties via omgeving: NABEWAKING_SEC (standaard 40; toezicht direct na de activering), NAZORG_MIN (standaard 30; dode-mansschakelaar), BEWAAR_RELEASES (standaard 5), ZONDER_BACKUP=1 (back-up vóór migratie overslaan),
#                      ROOK_UIT=1 (rendercontrole overslaan), ROOK_CHROMIUM, ROOK_GEHEUGEN_MAX (1500M), ROOK_TIJD_SEC (600), ROOK_PAGINA_SEC (20),
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
TIMERS=(mijn-ruimte-mail-onderhoud.timer mijn-ruimte-google-sync.timer mijn-ruimte-opruimen.timer mijn-ruimte-backup.timer mijn-ruimte-mail-queue.timer mijn-ruimte-gitops.timer mijn-ruimte-diagnostiek-server.timer mijn-ruimte-zoek-index.timer)

ONVOLTOOID=""   # pad van een release die nog niet klaar is; wordt bij een fout verwijderd
opruimen_bij_afbreken() { if [ -n "$ONVOLTOOID" ] && [ -d "$ONVOLTOOID" ]; then echo "[installeer] onvolledige release $ONVOLTOOID verwijderd" >&2; rm -rf -- "$ONVOLTOOID"; fi; }
trap opruimen_bij_afbreken EXIT
git_bron() { git -c safe.directory="$BRON_GIT" -C "$BRON_GIT" "$@"; }

melding() { echo "[installeer] $*"; }
# Voortgang voor de site (audit 18.10.2026, punt 6): één vaste regel per onderdeel. Het root-script (mijn-ruimte-uitrol.sh) leest deze
# regels uit het logboek en zet ze als stap «installeren» met dit percentage in stappen.jsonl — zo beweegt de balk ook tijdens de lange
# installatie (vroeger bleef hij op 42 % staan). Vorm: «[installeer] stap: <id> (<pct>%) <tekst>»; ids: kopie npm bouwen backup migraties
# activeren gezondheid nabewaken. Via SSH zijn het gewoon leesbare regels.
voortgang() { echo "[installeer] stap: $1 ($2%) ${3:-}"; }
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

# Blijvend archief van een SSH-installatie (audit 18.10.2026, punt 4): /srv/mijn-ruimte/pakketten/mijn-ruimte-<versie>.tar.gz (+ .sha256).
# Ligt naast de bronmap het archief waaruit ze is uitgepakt (`tar -xzf mijn-ruimte-<v>.tar.gz` → map met dezelfde naam), dan wordt dát
# bewaard; anders wordt de bronmap zelf ingepakt (zonder node_modules/dist/.git). Nooit fataal. Zet UITROL_GEB_EXTRA voor noteer_ssh.
# Bij een passkey/ondertekende uitrol bewaart het root-script het archief al; dan doet deze functie niets.
PAKKETTEN_DIR="${UITROL_PAKKETTEN_DIR:-$APP_ROOT/pakketten}"
pakket_bewaren_ssh() { # pakket_bewaren_ssh <bronmap> <versie>
  local bron="$1" versie="$2" doel tmp sha naast eerste geleverd="" herkomst="opnieuw-ingepakt" kand
  case "${MIJN_RUIMTE_UITROL_MODUS:-ssh}" in passkey|handtekening|gitops|opdracht|nazorg|besluit) return 0 ;; esac
  [[ "$versie" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { waarschuwing "archief niet bewaard: geen geldige UITROL-VERSIE"; return 0; }
  install -d -o root -g "$GEBRUIKER" -m 0770 "$PAKKETTEN_DIR" || { waarschuwing "archief: map $PAKKETTEN_DIR niet aan te maken"; return 0; }
  doel="$PAKKETTEN_DIR/mijn-ruimte-$versie.tar.gz"
  tmp="$(mktemp "$PAKKETTEN_DIR/.pakket.XXXXXX")" || return 0
  # Het geleverde archief zoeken (29.10.2026): eerst UITROL_ARCHIEF (expliciet), dan naast de bronmap onder de mapnaam of onder
  # mijn-ruimte-<versie>.tar.gz. VROEGER: `tar -tzf … | head -n1 | grep` onder `set -o pipefail` → tar kreeg SIGPIPE (141), de test
  # faalde ALTIJD en het archief werd opnieuw ingepakt (andere sha256/grootte dan geleverd: 215049, 224316). Nu zonder pijp-fout.
  naast=""
  for kand in "${UITROL_ARCHIEF:-}" "$(dirname "$bron")/$(basename "$bron").tar.gz" "$(dirname "$bron")/mijn-ruimte-$versie.tar.gz"; do
    [ -n "$kand" ] && [ -f "$kand" ] && [ ! -L "$kand" ] || continue
    eerste="$( (tar -tzf "$kand" 2>/dev/null || true) | head -n1 )"
    case "$eerste" in "$(basename "$bron")/"*|"mijn-ruimte-$versie/"*) naast="$kand"; break ;; esac
  done
  if [ -n "$naast" ]; then
    cp -f -- "$naast" "$tmp" || { rm -f -- "$tmp"; waarschuwing "archief: kopiëren van $naast mislukt"; return 0; }
    herkomst="geleverd"
    geleverd="$(sha256sum -- "$naast" | cut -c1-64)"
    # Een .sha256 die met het archief meekwam, moet kloppen; anders melden (het bestand is onderweg veranderd).
    if [ -s "$naast.sha256" ]; then
      local verwacht; verwacht="$(head -c 64 "$naast.sha256" | tr -cd '0-9a-f')"
      [ "$verwacht" = "$geleverd" ] || waarschuwing "archief: sha256 van $naast ($geleverd) wijkt af van $naast.sha256 ($verwacht)"
    fi
  else
    waarschuwing "archief: geleverd archief niet gevonden naast $bron (zet UITROL_ARCHIEF=<pad>); de bronmap wordt opnieuw ingepakt — sha256 wijkt dan af van het geleverde bestand"
    tar -czf "$tmp" -C "$(dirname "$bron")" --exclude=node_modules --exclude=dist --exclude=dist-server --exclude=.git --exclude=rapporten \
      --transform "s|^$(basename "$bron")|mijn-ruimte-$versie|" "$(basename "$bron")" 2>/dev/null || { rm -f -- "$tmp"; waarschuwing "archief: inpakken van $bron mislukt"; return 0; }
  fi
  chown "root:$GEBRUIKER" "$tmp"; chmod 0640 "$tmp"
  mv -f -- "$tmp" "$doel" || { rm -f -- "$tmp"; return 0; }
  sha="$(sha256sum -- "$doel" | cut -c1-64)"
  printf '%s  %s\n' "$sha" "$(basename "$doel")" > "$doel.sha256"; chown "root:$GEBRUIKER" "$doel.sha256"; chmod 0640 "$doel.sha256"
  export UITROL_GEB_EXTRA="{\"pakket_pad\":\"$doel\",\"pakket_sha256\":\"$sha\",\"pakket_bytes\":$(stat -c %s "$doel"),\"geleverd_sha256\":\"$geleverd\",\"pakket_herkomst\":\"$herkomst\"}"
  melding "archief bewaard: $doel (sha256 $sha; $herkomst${geleverd:+, geleverd $geleverd})"
}

# Pakketgegevens in het uitvoeringslogboek en in de gebeurtenis (29.10.2026; eigenaar: «Підготував / Схвалив / Коміт / Розмір / sha256 — порожньо»).
# Leest AUTEUR, AGENT en PAKKET-BRON-COMMIT uit de release (veilige tekens, begrensd) en sha256/grootte uit pakket_bewaren_ssh.
# Zet UITROL_GEB_PAKKET (JSON) voor noteer_ssh. Nooit fataal.
pakketgegevens_melden() { # pakketgegevens_melden <release-map>
  local doel="$1" json=""
  json="$(python3 "$doel/deploy/pakketgegevens.py" "$doel" "${UITROL_GEB_EXTRA:-}" 2>/dev/null)" || return 0
  [ -n "$json" ] || return 0
  export UITROL_GEB_PAKKET="$json"
  melding "pakketgegevens: $json"
  melding "goedgekeurd: via SSH als root (zonder passkey)"
}

# Handmatige SSH-installatie of -terugdraaiing, én terugdraaien via het dashboard (modus opdracht) of de nazorg-bewaker (modus nazorg).
# Schrijft status.json en een regel in gebeurtenissen.jsonl; de app bouwt daar app.uitrol_runs (de hoofdbron van de stand) uit op.
# Eén betekenis per veld (audit 18.10.2026, punt 7): «versie» = ALTIJD de pakketversie (UITROL-VERSIE), «release» = de mapnaam.
# De modi passkey/handtekening/gitops schrijven niets: daar doet het root-script mijn-ruimte-uitrol dat zelf (met stappen).
noteer_ssh() { # noteer_ssh <SSH_OK|SSH_TERUG> <release> <pakket> <commit>
  local modus="${MIJN_RUIMTE_UITROL_MODUS:-ssh}"
  case "$modus" in
    passkey|handtekening|gitops) return 0 ;;
    opdracht|nazorg|besluit) [ "$1" = "SSH_TERUG" ] || return 0 ;;   # alleen terugdraaien loopt langs deze modi (besluit = passkey-besluit, §15)
    *) modus=ssh ;;
  esac
  case "$1" in SSH_OK|SSH_TERUG) ;; *) return 0 ;; esac
  mkdir -p "$STATUS_GEBEURTENISSEN" || return 1
  (
    flock 7
    tmp="$(mktemp "$STATUS_GEBEURTENISSEN/.gebeurtenis.XXXXXX")"
    st="$(mktemp "$STATUS_GEBEURTENISSEN/.status.XXXXXX")"
    python3 - "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl" "$tmp" "$st" "$1" "$2" "$3" "$4" "${SUDO_USER:-}" "${SSH_CONNECTION:-}" "$modus" <<'PY' || { rm -f -- "$tmp" "$st"; exit 1; }
import json, sys, datetime, secrets, re, os
pad, tmp, st, code, release, pakket, commit, wie, verbinding, modus = sys.argv[1:11]
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
if modus != "ssh":
    code = "TERUG_OK"
    wie = {"opdracht": "dashboard", "nazorg": "nazorg", "besluit": "passkey"}[modus]
    adres = ""
if code == "SSH_OK":
    uk, nl = f"Випуск {release} встановлено з SSH", f"Release {release} geïnstalleerd via SSH"
elif code == "TERUG_OK":
    hoe = {"opdracht": ("з панелі керування сервером", "via het dashboard"), "nazorg": ("наглядачем після збою сайту", "door de nazorg-bewaker na een storing"), "besluit": ("за рішенням власника з підписом passkey", "op besluit van de eigenaar met passkey-handtekening")}[modus]
    uk, nl = f"Повернуто на випуск {release} {hoe[0]}", f"Teruggedraaid naar release {release} {hoe[1]}"
else:
    uk, nl = f"Повернуто на випуск {release} з SSH", f"Teruggedraaid naar release {release} via SSH"
if pakket:
    uk += f" (пакет {pakket})"; nl += f" (pakket {pakket})"
if modus == "ssh":
    uk += f", користувач {wie}"; nl += f", gebruiker {wie}"
if adres:
    uk += f", з {adres}"; nl += f", vanaf {adres}"
if commit:
    uk += f", коміт {commit[:12]}"; nl += f", commit {commit[:12]}"
uk += "."; nl += "."
nu = datetime.datetime.now(datetime.timezone.utc)
regel = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(),
         "bron": "uitrol", "code": code, "niveau": "info", "uk": uk, "nl": nl, "tag": release,
         "herkomst": modus, "wie": wie, "release": release}
if pakket: regel["pakket"] = pakket
if commit: regel["commit"] = commit
if adres: regel["adres"] = adres
# Bewaard archief (pakket_bewaren_ssh): pad/sha256/grootte, zodat de app «Завантажити цей випуск» kan aanbieden (audit 18.10.2026, punt 4).
if code == "SSH_OK":
    try:
        extra = json.loads(os.environ.get("UITROL_GEB_EXTRA") or "{}")
        for k in ("pakket_pad", "pakket_sha256", "pakket_bytes", "geleverd_sha256", "pakket_herkomst"):
            if k in extra:
                regel[k] = extra[k]
    except Exception:
        pass
    # Pakketgegevens (pakketgegevens_melden): wie, via welke agent, volledige BRON-COMMIT, sha256, grootte, tijd.
    try:
        pg = json.loads(os.environ.get("UITROL_GEB_PAKKET") or "{}")
        for k in ("auteur", "agent", "bron_commit", "geinstalleerd_op"):
            if isinstance(pg.get(k), str) and pg[k]:
                regel[k] = pg[k][:200]
        if "sha256" in pg and "pakket_sha256" not in regel: regel["pakket_sha256"] = pg["sha256"]
        if "bytes" in pg and "pakket_bytes" not in regel: regel["pakket_bytes"] = pg["bytes"]
        regel["goedkeuring"] = "ssh-root"
    except Exception:
        pass
try:
    oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
except FileNotFoundError:
    oud = []
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
# status.json: «versie» is de pakketversie (zoals bij passkey), «release» de mapnaam — nooit meer de mapnaam in «versie».
json.dump({"staat": "klaar", "code": code, "uk": uk, "nl": nl, "versie": pakket, "release": release, "methode": modus, "tijd": nu.isoformat()},
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

# Diepe gezondheidscontrole (29.10.2026): /__gezondheid?diep=1 maakt een proefsessie van de technische ruimte en een proefcookie voor
# /assets/tech/*, controleert dat de technische bestanden opengaan en ruimt alles op (backend/diepe-gezondheid.ts).
# 0 = in orde; 1 = kapot (de release geeft de technische bestanden niet → terugdraaien); 2 = niet uitgevoerd (alleen waarschuwen).
diep_gezond() {
  local uit code
  uit="$(curl -sS --max-time 20 -w '\n%{http_code}' "${GEZONDHEID_URL}?diep=1" 2>/dev/null)" || { waarschuwing "diepe gezondheidscontrole niet uitgevoerd (geen antwoord)"; return 2; }
  code="${uit##*$'\n'}"; uit="${uit%$'\n'*}"
  case "$code" in
    200) melding "diepe gezondheidscontrole in orde (technische ruimte + technische bestanden)"; return 0 ;;
    503) waarschuwing "diepe gezondheidscontrole MISLUKT: ${uit:0:400}"; return 1 ;;
    *) waarschuwing "diepe gezondheidscontrole niet uitgevoerd (HTTP $code)"; return 2 ;;
  esac
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

# MCP-deur op poort 8091 (deploy/mcp/server.mjs → $APP_ROOT/mcp/server.mjs): staat los van de current-symlink (root:root 0644),
# dus ZOWEL bij `installeren` (via veilige_uitrol_inrichten) ALS bij `terugdraaien` bijwerken en een actieve dienst herstarten.
# Een uitgeschakelde dienst (CONNECTOR-EEN-PAD.md) blijft uit (`try-restart` start geen gestopte unit); faalt herstart wel, dan waarschuwen.
# Elke stap die kan falen geeft expliciet 1 terug (ook binnen `||`, waar `set -e` niet geldt); de aanroeper beslist: bij installeren
# fataal (zoals vroeger), bij terugdraaien alleen een waarschuwing NA de audit — de hoofdapp is dan al terug en gezond, en een
# herhaling «terugdraaien» zonder argument zou via VORIGE juist de release terugzetten die net is teruggedraaid.
# Кожен крок, що може впасти, явно повертає 1; при відкаті — лише попередження ПІСЛЯ аудиту (застосунок уже відкочено й здоровий).
mcp_deur_bijwerken() {
  local doel="$1" unit_doel="${MCP_UNIT_DOEL:-/etc/systemd/system/mijn-ruimte-mcp.service}"
  [ -s "$doel/deploy/mcp/server.mjs" ] || return 0
  [ "$(id -u)" -eq 0 ] && unit_doel="/etc/systemd/system/mijn-ruimte-mcp.service"
  install -d -o root -g root -m 0755 "$APP_ROOT/mcp" || return 1
  install -m 0644 -o root -g root "$doel/deploy/mcp/server.mjs" "$APP_ROOT/mcp/server.mjs" || return 1
  if [ -s "$doel/deploy/mcp/mijn-ruimte-mcp.service" ] && ! cmp -s "$doel/deploy/mcp/mijn-ruimte-mcp.service" "$unit_doel"; then
    install -m 0644 -o root -g root "$doel/deploy/mcp/mijn-ruimte-mcp.service" "$unit_doel" || return 1
    systemctl daemon-reload || return 1
  fi
  if ! systemctl try-restart mijn-ruimte-mcp.service >/dev/null 2>&1; then
    waarschuwing "mijn-ruimte-mcp.service (poort 8091) kon niet worden herstart"
  elif systemctl is-active --quiet mijn-ruimte-mcp.service 2>/dev/null; then
    melding "MCP-deur bijgewerkt en herstart (mijn-ruimte-mcp.service, poort 8091)"
  fi
}

# Gebeurtenis voor de site (gebeurtenissen.jsonl → audit «server.uitrol.mcp_deur_niet_teruggezet»), in ALLE modi (ssh, opdracht, nazorg,
# besluit, passkey, gitops): het terugdraaien is gelukt, maar de MCP-deur (poort 8091) kon niet worden teruggezet. Zonder deze regel
# stond dat alleen in de terminal/journal en zag de eigenaar op de site enkel «teruggedraaid». Bewust ZONDER «herkomst» en met tag
# «mcp-deur»: dit is geen uitkomst van een uitrol-run (uitrol-runs.ts leest een waarschuwing met herkomst + versie-tag als einde/weigering).
# Подія для сайту в усіх режимах: відкат удався, але двері MCP (порт 8091) не повернуто. Без «herkomst» — це не підсумок запуску.
noteer_mcp_deur() { # noteer_mcp_deur MCP_DEUR_NIET_TERUGGEZET <warn|error> <release>
  mkdir -p "$STATUS_GEBEURTENISSEN" || return 1
  (
    flock 7
    tmp="$(mktemp "$STATUS_GEBEURTENISSEN/.gebeurtenis.XXXXXX")"
    python3 - "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl" "$tmp" "$1" "$2" "$(basename "$3")" "$APP_ROOT" <<'PY' || { rm -f -- "$tmp"; exit 1; }
import json, sys, datetime, secrets, re
pad, tmp, code, niveau, release, app = sys.argv[1:7]
if code != "MCP_DEUR_NIET_TERUGGEZET" or niveau not in ("warn", "error"):
    sys.exit(2)
release = release if re.fullmatch(r"[0-9]{8}-[0-9]{6}", release) else ""
app = app if re.fullmatch(r"/[A-Za-z0-9._/-]{1,80}", app) else "/srv/mijn-ruimte"
waar = f" {release}" if release else ""
# Het advies «niet opnieuw terugdraaien» staat vooraan: de app kapt uk/nl af op 300 tekens. Порада «не повторювати» — на початку.
uk = (f"Відкат на{waar} удався, але двері MCP (порт 8091) не оновлено — відкат НЕ повторюйте. "
      f"SSH: перевірте {app}/mcp/server.mjs і unit, далі systemctl daemon-reload && systemctl try-restart mijn-ruimte-mcp.")
nl = (f"Terugdraaien naar{waar} gelukt, maar de MCP-deur (poort 8091) is niet bijgewerkt — NIET opnieuw terugdraaien. "
      f"SSH: controleer {app}/mcp/server.mjs en de unit, dan systemctl daemon-reload && systemctl try-restart mijn-ruimte-mcp.")
nu = datetime.datetime.now(datetime.timezone.utc)
regel = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(), "bron": "uitrol", "code": code,
         "niveau": niveau, "uk": uk[:300], "nl": nl[:300], "tag": "mcp-deur"}
if release: regel["release"] = release
try: oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
except FileNotFoundError: oud = []
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
PY
    chgrp "$STATUS_GROEP" "$tmp" 2>/dev/null || true
    chmod 0640 "$tmp"
    mv -f "$tmp" "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl"
  ) 7>"$STATUS_GEBEURTENISSEN/.gebeurtenissen.lock"
}

# Veilige uitrol (ondertekende pakketten): root-script, units, mappen, standaard-schakelaars van de MCP-deur.
veilige_uitrol_inrichten() {
  local doel="$1"
  [ -s "$doel/deploy/uitrol/mijn-ruimte-uitrol.sh" ] || return 0
  install -m 0755 -o root -g root "$doel/deploy/uitrol/mijn-ruimte-uitrol.sh" /usr/local/sbin/mijn-ruimte-uitrol
  # Diagnose van de uitrol-keten (alleen lezen, elke minuut) en het vangnet dat een liggend goedgekeurd pakket alsnog laat verwerken.
  if [ -s "$doel/deploy/uitrol/mijn-ruimte-uitrol-diagnose.sh" ]; then
    install -m 0755 -o root -g root "$doel/deploy/uitrol/mijn-ruimte-uitrol-diagnose.sh" /usr/local/sbin/mijn-ruimte-uitrol-diagnose
    systemctl enable --now mijn-ruimte-diagnose.timer mijn-ruimte-goedkeuring-wacht.timer >/dev/null 2>&1 || waarschuwing "diagnose- en vangnet-timer konden niet worden gestart"
  fi
  if [ -s "$doel/deploy/uitrol/mijn-ruimte-nazorg.sh" ]; then
    install -m 0755 -o root -g root "$doel/deploy/uitrol/mijn-ruimte-nazorg.sh" /usr/local/sbin/mijn-ruimte-nazorg
    systemctl enable --now mijn-ruimte-nazorg.timer >/dev/null 2>&1 || waarschuwing "nazorg-timer kon niet worden gestart"
  fi
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/uitrol-inbox" "$APP_ROOT/mcp-state"
  # Eigen logo's van de beheerder (21.10.2026, deploy/LEESMIJ.md «Eigen logo's»): de app leest en (na passkey) schrijft hier.
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0755 "$APP_ROOT/merk-eigen"
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte-uitrol
  install -d -o root -g "$GEBRUIKER" -m 0750 /var/lib/mijn-ruimte-uitrol-status
  # De eerste uitrol via de inbox moet nieuwer zijn dan wat nu draait.
  [ -s /var/lib/mijn-ruimte-uitrol/laatste-versie ] || date +%Y%m%d-%H%M%S > /var/lib/mijn-ruimte-uitrol/laatste-versie
  if [ ! -e /etc/mijn-ruimte/mcp-rechten.json ]; then
    printf '%s\n' '{"read": true, "uitrol": false, "gitops": false, "passkey-goedkeuring": false, "ssh-ca": false, "beheer-alleen-tech": false, "guacamole": false, "terugdraaien-passkey": true, "externe-hosts-passkey": true, "externeMcpHosts": [], "opdracht": {"status": true, "releases": true, "backup": true, "uitrol-nu": true, "terugdraaien": false}}' > /etc/mijn-ruimte/mcp-rechten.json
    chown root:"$GEBRUIKER" /etc/mijn-ruimte/mcp-rechten.json; chmod 0640 /etc/mijn-ruimte/mcp-rechten.json
  fi
  mcp_deur_bijwerken "$doel" || fout "MCP-deur (poort 8091) kon niet worden bijgewerkt (install of daemon-reload faalde) — zie de melding hierboven"
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

# Besluiten van de eigenaar met passkey-handtekening (22.10.2026, RUNBOOK §15): terugdraaien naar een release en de witte lijst van
# externe MCP-hosts, zonder SSH. Root-script + inbox van de app + path-unit; root controleert de assertie zelf (mijn-ruimte-passkey
# verifieer-besluit) en voert pas daarna uit. Schakelaars "terugdraaien-passkey" / "externe-hosts-passkey" in mcp-rechten.json:
# ontbreekt = open; false = dicht. De werkmap /var/lib/mijn-ruimte/besluit (root 0700) houdt journaal, stempel en reservekopieën.
besluit_inrichten() {
  local doel="$1"
  [ -s "$doel/deploy/besluit/mijn-ruimte-besluit.sh" ] || return 0
  [ -s "$doel/deploy/goedkeuring/besluit-kern.mjs" ] && install -m 0644 -o root -g root "$doel/deploy/goedkeuring/besluit-kern.mjs" /usr/local/lib/mijn-ruimte/goedkeuring/
  install -m 0755 -o root -g root "$doel/deploy/besluit/mijn-ruimte-besluit.sh" /usr/local/sbin/mijn-ruimte-besluit
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/besluit-inbox"
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte/besluit
  systemctl enable --now mijn-ruimte-besluit.path >/dev/null 2>&1 || waarschuwing "mijn-ruimte-besluit.path kon niet worden gestart"
  /usr/local/sbin/mijn-ruimte-besluit status >/dev/null 2>&1 || waarschuwing "besluit-stand.json niet geschreven (mijn-ruimte-besluit status)"
  melding "besluiten van de eigenaar (passkey) ingericht: terugdraaien en externe MCP-hosts vanaf de site"
}

# ORCH-001 етап 3 (31.10.2026): coördinatie van AI-agenten vanaf de site (mcp.*/agenten → «Координація», MCP orch_*). De app schrijft
# uploads en regelvoorstellen in $APP_ROOT/orch-inbox (eigendom app, 0750). De WERKKOPIE van de coördinatierepository ($APP_ROOT/orch-repo,
# ORCH_WORTEL) maakt de EIGENAAR zelf aan met een deploy key (RUNBOOK §18) — de installer kloont niets en zet geen sleutels; zonder werkkopie
# meldt de site eerlijk ORCH_GEEN_REPO. De bevestigingen van de regels legt root vast via mijn-ruimte-besluit (soort orch-regels).
orch_inrichten() {
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/orch-inbox"
  if [ -f "$APP_ROOT/orch-repo/orchestratie/beleid.json" ]; then melding "coördinatie van agenten: werkkopie $APP_ROOT/orch-repo aanwezig"; else melding "coördinatie van agenten: geen werkkopie in $APP_ROOT/orch-repo (RUNBOOK §18) — de site toont ORCH_GEEN_REPO tot de eigenaar die aanmaakt"; fi
}

# SSH-CA (etap C, deel 2): script, mappen en de polkit-naam. Geen sleutel, geen schakelaar aan, geen wijziging van sshd,
# en de path-unit wordt niet ingeschakeld. De eigenaar doet dat zelf na `mijn-ruimte-ssh-ca inrichten` en `publiek`.
ssh_ca_inrichten() {
  local doel="$1"
  [ -s "$doel/deploy/ssh-ca/mijn-ruimte-ssh-ca.sh" ] || return 0
  install -m 0755 -o root -g root "$doel/deploy/ssh-ca/mijn-ruimte-ssh-ca.sh" /usr/local/sbin/mijn-ruimte-ssh-ca
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/ssh-ca-inbox"
  # Beheer vanaf de site (18.10.2026): verzoeken voor mijn-ruimte-ssh-ca-beheer.service (root controleert passkey en sshd -t).
  install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/ssh-ca-beheer"
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte/ssh-ca
  install -d -o root -g "$GEBRUIKER" -m 0750 /var/lib/mijn-ruimte/ssh-ca-uit
  if [ -d /etc/polkit-1/rules.d ] && [ -s "$doel/deploy/opdracht/50-mijn-ruimte-opdracht.rules" ]; then
    if ! cmp -s "$doel/deploy/opdracht/50-mijn-ruimte-opdracht.rules" /etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules; then
      install -m 0644 -o root -g root "$doel/deploy/opdracht/50-mijn-ruimte-opdracht.rules" /etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules
    fi
  fi
  melding "SSH-CA geïnstalleerd (uit: geen sleutel, schakelaar ssh-ca uit, sshd ongewijzigd; zie mijn-ruimte-ssh-ca publiek)"
}

# Extern bureaublad (RDP/VNC/SSH via Apache Guacamole, uitvoerder D, 18.10.2026). guacd luistert ALLEEN op 127.0.0.1:4822; alleen de
# app praat ermee. Alleen met "guacamole": true in /etc/mijn-ruimte/mcp-rechten.json (standaard uit: niets geïnstalleerd, een eerder
# gestarte guacd wordt gestopt). Voorkeur: pakket «guacd» via apt (eigen verharde unit); anders, als docker er is, het vaste image
# guacamole/guacd:1.5.5 met host-netwerk en -b 127.0.0.1. Opnames: /srv/data/guac-opnames (0750, 30 dagen, tmpfiles.d).
guacamole_inrichten() {
  local doel="$1" aan unit bron gewijzigd=0 luistert
  [ -s "$doel/deploy/guacamole/mijn-ruimte-guacd.service" ] || return 0
  aan=$(python3 -c 'import json;print("1" if json.load(open("/etc/mijn-ruimte/mcp-rechten.json")).get("guacamole") is True else "0")' 2>/dev/null || echo 0)
  if [ "$aan" != 1 ]; then
    systemctl disable --now mijn-ruimte-guacd.service mijn-ruimte-guacd-docker.service >/dev/null 2>&1 || true
    melding "extern bureaublad uit (schakelaar guacamole in /etc/mijn-ruimte/mcp-rechten.json); guacd draait niet"
    return 0
  fi
  id -u mijnruimte-guacd >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /var/lib/mijn-ruimte-guacd --shell /usr/sbin/nologin mijnruimte-guacd
  [ -e /etc/tmpfiles.d/mijn-ruimte-guac-opnames.conf ] || install -m 0644 -o root -g root "$doel/deploy/guacamole/guac-opnames.tmpfiles.conf" /etc/tmpfiles.d/mijn-ruimte-guac-opnames.conf
  systemd-tmpfiles --create /etc/tmpfiles.d/mijn-ruimte-guac-opnames.conf >/dev/null 2>&1 || install -d -o mijnruimte-guacd -g "$GEBRUIKER" -m 0750 /srv/data/guac-opnames
  if [ ! -x /usr/sbin/guacd ] && command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends guacd libguac-client-rdp0 libguac-client-vnc0 libguac-client-ssh0 >/dev/null 2>&1 \
      || waarschuwing "apt: pakket guacd niet geïnstalleerd (probeer docker)"
  fi
  if [ -x /usr/sbin/guacd ]; then
    unit=mijn-ruimte-guacd.service; bron="$doel/deploy/guacamole/mijn-ruimte-guacd.service"
    # De unit van het pakket zelf niet gebruiken (eigen bind/verharding): uit, zodat er maar één guacd luistert.
    systemctl disable --now guacd.service >/dev/null 2>&1 || true
    systemctl disable --now mijn-ruimte-guacd-docker.service >/dev/null 2>&1 || true
  elif command -v docker >/dev/null 2>&1; then
    unit=mijn-ruimte-guacd-docker.service; bron="$doel/deploy/guacamole/mijn-ruimte-guacd-docker.service"
    printf 'GUACD_UID=%s\nGUACD_GID=%s\n' "$(id -u mijnruimte-guacd)" "$(id -g mijnruimte-guacd)" > /etc/mijn-ruimte/guacd-docker.env
    chmod 0644 /etc/mijn-ruimte/guacd-docker.env
    docker pull -q guacamole/guacd:1.5.5 >/dev/null 2>&1 || { waarschuwing "docker: image guacamole/guacd:1.5.5 niet opgehaald; extern bureaublad werkt niet"; return 0; }
  else
    waarschuwing "guacd niet geïnstalleerd (geen apt-pakket, geen docker): extern bureaublad meldt «guacd недоступний». Zie deploy/WIJZIGINGEN-20261018-TECH-AFRONDING.md"
    return 0
  fi
  if ! cmp -s "$bron" "/etc/systemd/system/$unit"; then
    install -m 0644 -o root -g root "$bron" "/etc/systemd/system/$unit"; systemctl daemon-reload; gewijzigd=1
  fi
  systemctl enable "$unit" >/dev/null 2>&1 || true
  if [ "$gewijzigd" -eq 1 ]; then systemctl restart "$unit" >/dev/null 2>&1 || waarschuwing "$unit kon niet starten"
  else systemctl start "$unit" >/dev/null 2>&1 || waarschuwing "$unit kon niet starten"; fi
  # Controle: guacd mag nergens anders dan op loopback luisteren; anders meteen stoppen.
  sleep 1
  luistert=$(ss -Hltn 'sport = :4822' 2>/dev/null | awk '{print $4}' | tr '\n' ' ')
  if printf '%s' "$luistert" | grep -Eq '(^| )(0\.0\.0\.0|\*|\[::\]|::):4822'; then
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    waarschuwing "guacd luisterde op een publiek adres ($luistert) en is gestopt"; return 0
  fi
  melding "extern bureaublad: guacd via $unit op 127.0.0.1:4822 (${luistert:-nog niet luisterend})"
}

# «Захист» → RLS (0066): root-kopie van het rollenscript voor mijn-ruimte-db-rollen.service (de site start die alleen via polkit,
# na passkey van de eigenaar). Niets wordt hier uitgevoerd: geen rol, geen wachtwoord, geen wijziging van geheimen.env.
db_rollen_hulp_inrichten() {
  local doel="$1" d=/usr/local/lib/mijn-ruimte/db-rollen f
  [ -s "$doel/deploy/db-rollen-instellen.sh" ] && [ -s "$doel/migrations/rechten.sql" ] || return 0
  install -d -o root -g root -m 0755 /usr/local/lib/mijn-ruimte "$d" "$d/deploy" "$d/migrations"
  install -m 0755 -o root -g root "$doel/deploy/db-rollen-instellen.sh" "$d/deploy/"
  for f in db-rollen.sql db-rollen-terug.sql scram-verifier.mjs; do [ ! -s "$doel/deploy/$f" ] || install -m 0644 -o root -g root "$doel/deploy/$f" "$d/deploy/"; done
  install -m 0644 -o root -g root "$doel/migrations/rechten.sql" "$d/migrations/"
  melding "hulp voor de app-rol (RLS) geïnstalleerd: $d (alleen starten via mijn-ruimte-db-rollen.service)"
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
    git_bron rev-parse HEAD > "$doel/PAKKET-BRON-COMMIT" 2>/dev/null || true
  else
    rsync -a --exclude node_modules --exclude dist --exclude dist-server --exclude .git --exclude rapporten "$bron/" "$doel/"
    # Alleen een volledige git-commit telt; «zonder-git:<reden>» (of iets anders) wordt «onbekend» — vroeger haalde `tr -cd 0-9a-f`
    # de hex-letters uit zo'n tekst en ontstond een nep-commit.
    if [ -s "$bron/BRON-COMMIT" ]; then commit="$(head -c 64 "$bron/BRON-COMMIT" | tr -d '\r\n[:space:]')"; [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || commit="onbekend"; fi
    # Pakketgegevens (29.10.2026): de VOLLEDIGE BRON-COMMIT (ook zonder-git:<reden>) apart bewaren voor het logboek en de site;
    # RELEASE-COMMIT blijft hex of onbekend (andere lezers verwachten dat).
    if [ -s "$bron/BRON-COMMIT" ]; then head -n 1 "$bron/BRON-COMMIT" | head -c 200 | tr -d '\r' > "$doel/PAKKET-BRON-COMMIT" || true; fi
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
    bash -c 'set -euo pipefail; echo "[installeer] stap: npm (55%) npm ci"; npm ci --no-audit --no-fund; echo "[installeer] stap: bouwen (70%) npm run build"; NODE_ENV=production npm run build; npm prune --omit=dev --no-audit --no-fund' \
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

# PostgreSQL-versie vóór back-up en migraties (21.10.2026): op een te oude versie (BYOS, bijv. Ubuntu 22.04 met PG14) stopte
# de installatie vroeger pas midden in de migraties met «syntax error at or near "EXPRESSION"». Minimum: server/pg-versie.ts.
# Zelfde rol, omgeving en afscherming als de migratiestap; verandert niets aan de database.
pg_versie_controleren() {
  local doel="$1" uit rc=0
  voortgang pgversie 74 "PostgreSQL-versie controleren"
  uit="$(systemd-run --quiet --wait --pipe --collect \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p EnvironmentFile="$GEHEIMEN" -p EnvironmentFile=-"$MIGRATIE_ENV" -p WorkingDirectory="$doel" \
    -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes \
    "$NODE" "$doel/dist-server/migrate.mjs" --pg-controle 2>&1)" || rc=$?
  [ -n "$uit" ] && printf '%s\n' "$uit" | sed 's/^/[installeer] /'
  # Ook als systemd-run de exitcode niet doorgeeft: de vaste code in de uitvoer telt.
  if [ "$rc" -ne 0 ] && printf '%s' "$uit" | grep -q 'PG_VERSIE_TE_OUD:'; then rc=3; fi
  case "$rc" in
    0) return 0 ;;
    3) fout "PostgreSQL is te oud voor deze versie / PostgreSQL застаріла для цієї версії (zie/див. hierboven, deploy/LEESMIJ.md); niets gewijzigd / нічого не змінено" ;;
    *) fout "database niet bereikbaar voor de versiecontrole / база даних недоступна для перевірки версії (DATABASE_URL in $GEHEIMEN of $MIGRATIE_ENV); niets gewijzigd / нічого не змінено" ;;
  esac
}

# UITROL-001 (09.11.2026): de NIEUWE migraties eerst op een wegwerpkopie van het schema proberen — vóór kopiëren, npm ci en bouwen.
# Release 20261109-065647 viel vroeger pas na ±3 minuten bouwen om in «databasemigraties» (CHECK feature_flags_omschrijving_check);
# nu stopt zo'n pakket in seconden, met migratie, regel en beperking in het logboek. De productiedatabase wordt niet geraakt
# (deploy/uitrol/mijn-ruimte-migratie-proef.sh). Niet uitvoerbaar (oude release zonder proefprogramma, geen postgres-gebruiker) →
# waarschuwing en gewoon door: de echte migratie blijft per migratie transactioneel, met back-up en de vorige release actief.
migratie_proef() {
  local bron="$1" script uit rc=0
  [ "${PROEF_UIT:-0}" != 1 ] || { melding "migratieproef overgeslagen (PROEF_UIT=1)"; return 0; }
  [ -d "$bron/migrations" ] || return 0
  script="$bron/deploy/uitrol/mijn-ruimte-migratie-proef.sh"
  [ -s "$script" ] || script=/usr/local/sbin/mijn-ruimte-migratie-proef
  [ -s "$script" ] || { waarschuwing "migratieproef: script ontbreekt; overgeslagen"; return 0; }
  voortgang proef 44 "nieuwe migraties proberen op een kopie van het schema"
  uit="$(mktemp)"
  bash "$script" --map "$bron/migrations" --uit "$uit" --script "$HUIDIG/dist-server/migratie-proef.mjs" 2>&1 | sed 's/^/[installeer] /' || rc=${PIPESTATUS[0]}
  if [ "$rc" -eq 4 ]; then
    python3 - "$uit" <<'PY' || true
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
for m in d.get("migraties", []):
    if m.get("ok"): print("[installeer] proef ok: %s (%s ms)" % (m["naam"], m.get("ms")))
    else:
        f = m.get("fout") or {}
        print("[installeer] FOUT: migratieproef %s regel %s: %s %s%s" % (m["naam"], f.get("regel") or "?", f.get("code", ""), f.get("bericht", ""), (" · " + f["constraint"]) if f.get("constraint") else ""))
PY
    rm -f -- "$uit"
    fout "migratieproef mislukt — dit pakket zou in «databasemigraties» omvallen; niets gewijzigd / проба міграцій не пройдена, нічого не змінено"
  elif [ "$rc" -ne 0 ]; then
    waarschuwing "migratieproef niet uitgevoerd (code $rc); de installatie gaat door met back-up en transactionele migraties"
  else
    melding "migratieproef: alle nieuwe migraties slagen op de kopie van het schema"
  fi
  rm -f -- "$uit"
}

migreren() {
  local doel="$1"
  pg_versie_controleren "$doel"
  if [ "${ZONDER_BACKUP:-0}" != "1" ] && [ -e "$HUIDIG" ] && systemctl cat mijn-ruimte-backup.service >/dev/null 2>&1; then
    voortgang backup 75 "back-up van de database"
    melding "back-up vóór migratie…"
    chmod 750 /srv/mijn-ruimte/current/deploy/backup-maken.sh 2>/dev/null || true
    # Mislukt de back-up, dan de echte oorzaak tonen (laatste regels van de dienst, niet alleen «Job … failed») en één keer opnieuw
    # proberen: een gelijktijdige run (timer, «back-up nu») of een tijdelijke databasefout mag een uitrol niet laten mislukken.
    # 18.10.2026: uitrol 20261018-151122 faalde zo één keer; de tweede poging lukte zonder wijziging.
    if ! systemctl start mijn-ruimte-backup.service; then
      melding "back-up mislukt; oorzaak volgens de dienst:"
      journalctl -u mijn-ruimte-backup.service -n 15 --no-pager -o cat 2>/dev/null | sed 's/^/[backup] /' || true
      melding "nog één poging over 20 s…"
      sleep 20
      systemctl reset-failed mijn-ruimte-backup.service 2>/dev/null || true
      if ! systemctl start mijn-ruimte-backup.service; then
        oorzaak="$(journalctl -u mijn-ruimte-backup.service -n 30 --no-pager -o cat 2>/dev/null | grep -E '\[backup\]|error|ERROR|fout|FATAL|denied|No space' | tail -n 1 | cut -c1-200)"
        journalctl -u mijn-ruimte-backup.service -n 15 --no-pager -o cat 2>/dev/null | sed 's/^/[backup] /' || true
        fout "back-up mislukt (2 pogingen): ${oorzaak:-zie journalctl -u mijn-ruimte-backup}; niets gewijzigd (ZONDER_BACKUP=1 om over te slaan)"
      fi
    fi
  fi
  voortgang migraties 80 "databasemigraties"
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

# Na een geslaagde eerste gezondheidscontrole blijft de nieuwe release nog even onder toezicht (NABEWAKING_SEC, standaard 40 s,
# 0 = uit): een release die pas na enkele seconden crasht (crashloop, verbroken databaseverbinding na migratie, onhandelbare fout bij de eerste
# echte verzoeken) wordt zo nog binnen deze installatie teruggezet, terwijl de eigenaar niet bij de site is. Falen = drie opeenvolgende
# mislukte controles, of de dienst is herstart (andere hoofdproces-id dan direct na de eerste controle).
nabewaken() {
  local sec="${NABEWAKING_SEC:-40}" pid0 pid fouten=0 t=0
  [[ "$sec" =~ ^[0-9]+$ ]] || sec=40
  [ "$sec" -gt 0 ] || return 0
  pid0="$(systemctl show -p MainPID --value "$DIENST" 2>/dev/null || echo 0)"
  voortgang nabewaken 98 "nieuwe release $sec s onder toezicht"
  melding "nabewaking: nieuwe release $sec s onder toezicht…"
  while [ "$t" -lt "$sec" ]; do
    sleep 2; t=$((t + 2))
    pid="$(systemctl show -p MainPID --value "$DIENST" 2>/dev/null || echo 0)"
    if [ "$pid" != "$pid0" ]; then waarschuwing "nabewaking: de dienst is zelf herstart (pid $pid0 → $pid)"; return 1; fi
    if curl -fsS --max-time 3 "$GEZONDHEID_URL" 2>/dev/null | grep -q '"ok":true'; then fouten=0; else
      fouten=$((fouten + 1)); waarschuwing "nabewaking: gezondheidscontrole mislukt ($fouten/3)"
      [ "$fouten" -ge 3 ] && return 1
    fi
  done
  melding "nabewaking: $sec s stabiel"
  return 0
}

# Dode-mansschakelaar (deploy/uitrol/mijn-ruimte-nazorg.sh): NAZORG_MIN minuten (standaard 30, 0 = uit) na een geslaagde activering draait een
# aparte root-timer zelf terug naar de vorige release als de site dan toch niet meer gezond is. Los van de app, dus ook als de site down is.
nazorg_markeren() {
  local doel="$1" min="${NAZORG_MIN:-30}" vorige
  [[ "$min" =~ ^[0-9]+$ ]] || min=30
  [ "$min" -gt 0 ] || return 0
  vorige="$(cat "$VORIGE_BESTAND" 2>/dev/null || true)"
  [ -n "$vorige" ] && [ -d "$vorige" ] && [ "$vorige" != "$doel" ] || return 0
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte-uitrol
  printf '%s %s %s\n' "$(( $(date +%s) + min * 60 ))" "$doel" "$vorige" > /var/lib/mijn-ruimte-uitrol/nazorg
  chmod 0600 /var/lib/mijn-ruimte-uitrol/nazorg
  melding "nazorg: ${min} min lang wordt automatisch teruggedraaid als de site faalt"
}

# ---------------------------------------------------------------------------------------------
# Rendercontrole (22.10.2026, zone A — na release 20261021-221718: «Buffer is not defined» in de technische bundel, elke admin.*-pagina
# wit, maar /__gezondheid en «HTTP 200» groen; installer, nazorg en «Діагностика» zagen niets en de beloofde autoterugdraai bleef uit).
# Na activeren + gezondheid + nabewaking opent scripts/rook-controle.mjs de sleutelpagina's van de NIEUWE release in een headless
# Chromium (alleen loopback): als testeigenaar met technisch profiel op een WEGWERPDATABASE (mijnruimte_rook_<stempel>, hier als postgres
# aangemaakt en weer verwijderd — de productiedatabase wordt nooit geraakt; dist-server/rook.mjs weigert elke andere naam), en elke
# bundel wordt in de browser geïmporteerd. Uitkomst → $STATUS_GEBEURTENISSEN/rook-controle.json (leest «Діагностика»).
#   code 0 = in orde; 1 = KAPOT → automatisch terug naar de vorige release (reden in gebeurtenissen.jsonl, code ROOK_TERUGGEDRAAID);
#   code 2 = niet uitgevoerd (geen browser, geen postgres-rol, time-out…) → NOOIT terugdraaien, wel een eerlijke waarschuwing.
# Zonder browser (sudo mijn-ruimte-installeer browser-controle) alleen de modulecontrole in Node (vm zonder Buffer/process/require):
# die vangt precies de fout van 20261021 in het «paginaskelet», maar meldt «rendering niet gecontroleerd».
# De vorige release wordt na een terugdraai één keer live gecontroleerd (alleen melden, nooit nog eens terugdraaien: geen lus).
# Migraties worden NIET teruggedraaid (zie terugdraaien); de rook-stand gebruikt een eigen database en laat het schema met rust.
# Omgeving: ROOK_UIT=1 (controle overslaan), ROOK_CHROMIUM (pad), ROOK_GEHEUGEN_MAX (1500M), ROOK_TIJD_SEC (600).
ROOK_REDEN=""
ROOK_STATUS="rook-controle.json"
rook_chromium() { local k; for k in "${ROOK_CHROMIUM:-}" "$APP_ROOT/browser/chrome-headless-shell" /usr/bin/chromium /usr/bin/chromium-browser /usr/lib/chromium/chromium; do [ -n "$k" ] && [ -x "$k" ] && { echo "$k"; return 0; }; done; return 1; }
# Databaserol uit de migratie-URL (migratie.env, anders geheimen.env): eigenaar van de wegwerpdatabase. Alleen de gebruikersnaam, nooit het wachtwoord.
rook_db_rol() {
  python3 - "$MIGRATIE_ENV" "$GEHEIMEN" <<'PY'
import sys, re, urllib.parse
for pad in sys.argv[1:]:
    try: regels = open(pad, encoding="utf-8").read().splitlines()
    except OSError: continue
    for sleutel in ("DATABASE_URL_MIGRATIE", "DATABASE_URL", "DATABASE_URL_SYSTEM"):
        for r in regels:
            m = re.match(r"\s*(?:export\s+)?" + sleutel + r"=(.*)$", r)
            if m:
                u = urllib.parse.urlparse(m.group(1).strip().strip("\"'"))
                if u.username and re.fullmatch(r"[A-Za-z0-9_]{1,63}", u.username) and u.hostname in ("127.0.0.1", "localhost", "::1", None):
                    print(u.username); sys.exit(0)
print("")
PY
}
rook_psql() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }
rook_db_maken() { rook_psql -c "CREATE DATABASE \"$1\" OWNER \"$2\"" >/dev/null 2>&1; }
rook_db_opruimen() { rook_psql -c "DROP DATABASE IF EXISTS \"$1\" WITH (FORCE)" >/dev/null 2>&1 || true; }
rook_dbs_opruimen() { local d; for d in $(rook_psql -At -c "SELECT datname FROM pg_database WHERE datname LIKE 'mijnruimte\\_rook\\_%'" 2>/dev/null); do rook_db_opruimen "$d"; done; }
# Samenvatting (uk) uit het JSON-resultaat, voor het logboek en de gebeurtenis.
rook_samenvatting() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("samenvatting",{}).get(sys.argv[2],"")[:400])' "$1" "${2:-uk}" 2>/dev/null || true; }

# rook_controleren <releasemap> [stand|live] [scriptmap]  → 0 in orde, 1 kapot, 2 niet uitgevoerd; zet ROOK_REDEN (uk) bij 1.
rook_controleren() {
  local doel="$1" modus="${2:-stand}" script="${3:-$1}" db="" rol="" werk uit rc=2 chromium="" args=() soort
  ROOK_REDEN=""
  [ "${ROOK_UIT:-0}" != 1 ] || { melding "rendercontrole overgeslagen (ROOK_UIT=1)"; return 2; }
  [ -s "$script/scripts/rook-controle.mjs" ] || { waarschuwing "rendercontrole: scripts/rook-controle.mjs ontbreekt in $script; rendering niet gecontroleerd"; return 2; }
  [ -f "$doel/dist/index.html" ] || { waarschuwing "rendercontrole: $doel/dist/index.html ontbreekt"; return 2; }
  werk="$(mktemp -d "$APP_ROOT/.rook.XXXXXX")"; chown "root:$GEBRUIKER" "$werk"; chmod 0770 "$werk"
  uit="$werk/rook-controle.json"
  args=(--dist "$doel/dist" --uit "$uit" --profiel "$werk/chromium" --tijd "${ROOK_PAGINA_SEC:-20}")
  chromium="$(rook_chromium || true)"
  if [ -z "$chromium" ]; then
    args+=(--alleen-modules); soort="alleen modules (geen browser: sudo mijn-ruimte-installeer browser-controle)"
  elif [ "$modus" = live ]; then
    args+=(--live "http://127.0.0.1:$PORT" --chromium "$chromium"); soort="browser, live dienst zonder aanmelding"
  else
    if [ -f "$doel/dist-server/rook.mjs" ] && id postgres >/dev/null 2>&1 && command -v psql >/dev/null 2>&1 && rol="$(rook_db_rol)" && [ -n "$rol" ]; then
      rook_dbs_opruimen
      db="mijnruimte_rook_$(date +%Y%m%d%H%M%S)"
      if rook_db_maken "$db" "$rol"; then args+=(--stand --migreren --chromium "$chromium"); soort="browser, stand met testeigenaar + technisch profiel (database $db)"
      else waarschuwing "rendercontrole: wegwerpdatabase $db niet aan te maken (rol $rol); alleen modulecontrole"; db=""; args+=(--alleen-modules); soort="alleen modules"; fi
    else
      waarschuwing "rendercontrole: geen dist-server/rook.mjs of geen lokale postgres-rol; alleen modulecontrole"; args+=(--alleen-modules); soort="alleen modules"
    fi
  fi
  local omgeving=(-E ROOK_ZONE=installer)
  [ -z "$db" ] || omgeving+=(-E "ROOK_DB=$db")
  [ -z "$chromium" ] || omgeving+=(-E "ROOK_CHROMIUM=$chromium")
  voortgang rook 97 "rendercontrole: $soort"
  melding "rendercontrole ($soort)…"
  set +e
  systemd-run --quiet --wait --pipe --collect --unit="mijn-ruimte-rook-$(date +%s)-$$" \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p EnvironmentFile="$GEHEIMEN" -p EnvironmentFile=-"$MIGRATIE_ENV" -p WorkingDirectory="$script" \
    -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p ReadWritePaths="$werk" \
    -p MemoryMax="${ROOK_GEHEUGEN_MAX:-1500M}" -p TimeoutStartSec="${ROOK_TIJD_SEC:-600}" \
    -E HOME="$werk" -E TMPDIR="$werk" -E PATH="$(dirname "$NODE"):/usr/bin:/bin" -E PORT="$PORT" "${omgeving[@]}" \
    "$NODE" "$script/scripts/rook-controle.mjs" "${args[@]}"
  rc=$?
  set -e
  [ -z "$db" ] || rook_db_opruimen "$db"
  if [ -s "$uit" ]; then
    mkdir -p "$STATUS_GEBEURTENISSEN"
    install -m 0640 -o root -g "$STATUS_GROEP" "$uit" "$STATUS_GEBEURTENISSEN/$ROOK_STATUS"
    melding "rendercontrole: $(rook_samenvatting "$uit" uk)"
    # Een kapotte uitslag blijft apart bewaard (de volgende controle — van de vorige release — overschrijft rook-controle.json).
    if [ "$rc" -eq 1 ]; then ROOK_REDEN="$(rook_samenvatting "$uit" uk)"; install -m 0640 -o root -g "$STATUS_GROEP" "$uit" "$STATUS_GEBEURTENISSEN/rook-controle-kapot.json"; fi
  else
    waarschuwing "rendercontrole: geen resultaat (code $rc; journalctl -u 'mijn-ruimte-rook-*' -n 50); rendering niet gecontroleerd"
    rc=2
  fi
  rm -rf "$werk"
  case "$rc" in 0|1|2) ;; *) rc=2 ;; esac
  return "$rc"
}

# Gebeurtenis voor de pagina «Оновлення» (gebeurtenissen.jsonl): noteer_rook <ROOK_TERUGGEDRAAID|ROOK_MISLUKT|ROOK_KAPOT|ROOK_WAARSCHUWING> <niveau> <release> <vorige>
# Teksten komen uit rook-controle.json (samenvatting uk/nl); de codes staan vertaald in shared/uitrol-codes.ts.
noteer_rook() {
  local code="$1" niveau="$2" release="$3" vorige="${4:-}" json="$STATUS_GEBEURTENISSEN/$ROOK_STATUS"
  mkdir -p "$STATUS_GEBEURTENISSEN" || return 1
  (
    flock 7
    tmp="$(mktemp "$STATUS_GEBEURTENISSEN/.gebeurtenis.XXXXXX")"
    python3 - "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl" "$tmp" "$json" "$code" "$niveau" "$(basename "$release")" "$(basename "${vorige:-}")" "$(pakket_versie "$release" || true)" "${MIJN_RUIMTE_UITROL_MODUS:-ssh}" <<'PY' || { rm -f -- "$tmp"; exit 1; }
import json, sys, datetime, secrets, re
pad, tmp, jsonpad, code, niveau, release, vorige, pakket, modus = sys.argv[1:10]
try: d = json.load(open(jsonpad, encoding="utf-8"))
except Exception: d = {}
s = d.get("samenvatting", {}); uk0 = str(s.get("uk", ""))[:300]; nl0 = str(s.get("nl", ""))[:300]
if code == "ROOK_TERUGGEDRAAID":
    uk = f"Відкочено автоматично з {release} на {vorige}: {uk0}"; nl = f"Automatisch teruggedraaid van {release} naar {vorige}: {nl0}"
elif code == "ROOK_MISLUKT":
    uk = f"Випуск {release} не рендериться, а відкат неможливий або не вдався: {uk0} Потрібен SSH: sudo mijn-ruimte-installeer terugdraaien"; nl = f"Release {release} rendert niet en terugdraaien kon niet of mislukte: {nl0} SSH nodig: sudo mijn-ruimte-installeer terugdraaien"
elif code == "ROOK_KAPOT":
    uk = f"Рендер-контроль випуску {release}: {uk0}"; nl = f"Rendercontrole van release {release}: {nl0}"
else:
    uk = f"Рендер-контроль випуску {release}: {uk0}"; nl = f"Rendercontrole van release {release}: {nl0}"
nu = datetime.datetime.now(datetime.timezone.utc)
regel = {"id": nu.strftime("%Y%m%dT%H%M%S%fZ") + "-" + secrets.token_hex(4), "tijd": nu.isoformat(), "bron": "uitrol", "code": code, "niveau": niveau,
         "uk": uk, "nl": nl, "tag": pakket or release, "herkomst": modus if re.fullmatch(r"[a-z]+", modus) else "ssh", "release": release}
if pakket: regel["pakket"] = pakket
if vorige: regel["vorige"] = vorige
try: oud = open(pad, encoding="utf-8").read().splitlines()[-499:]
except FileNotFoundError: oud = []
with open(tmp, "w", encoding="utf-8") as f:
    f.write("\n".join(oud + [json.dumps(regel, ensure_ascii=False)]) + "\n")
PY
    chgrp "$STATUS_GROEP" "$tmp" 2>/dev/null || true
    chmod 0640 "$tmp"
    mv -f "$tmp" "$STATUS_GEBEURTENISSEN/gebeurtenissen.jsonl"
  ) 7>"$STATUS_GEBEURTENISSEN/.gebeurtenissen.lock"
}

# Handmatig / door de nazorg: `mijn-ruimte-installeer rook-controle [--live] [release]` — controleert de ACTIEVE release (of een genoemde),
# schrijft rook-controle.json en bij «kapot» een gebeurtenis ROOK_KAPOT. Draait NOOIT zelf terug (dat doet alleen installeren/nazorg).
rook_opdracht() {
  local modus=stand naam="" doel rc=0
  while [ $# -gt 0 ]; do case "$1" in --live) modus=live ;; --stand) modus=stand ;; *) naam="$1" ;; esac; shift; done
  vereis_root; vereis_node
  if [ -n "$naam" ]; then doel="$RELEASES/$naam"; else doel="$(actieve_release)"; fi
  [ -n "$doel" ] && [ -d "$doel" ] || fout "geen release gevonden (${doel:-geen})"
  rook_controleren "$doel" "$modus" || rc=$?
  case "$rc" in
    0) melding "rendercontrole in orde: $(basename "$doel")" ;;
    1) noteer_rook ROOK_KAPOT warn "$doel" || true; waarschuwing "rendercontrole KAPOT: $(basename "$doel") — $ROOK_REDEN" ;;
    *) waarschuwing "rendercontrole niet uitgevoerd (code $rc)" ;;
  esac
  return "$rc"
}

activeren() {
  local doel="$1" vorige
  vorige="$(actieve_release)"
  voortgang activeren 90 "overschakelen en de dienst herstarten"
  omzetten "$doel"
  [ -n "$vorige" ] && [ "$vorige" != "$doel" ] && echo "$vorige" > "$VORIGE_BESTAND"
  systemctl restart "$DIENST"
  voortgang gezondheid 95 "gezondheidscontrole"
  local rrc=0
  local drc=0
  if gezond && { diep_gezond || drc=$?; [ "$drc" -ne 1 ]; }; then
    if nabewaken; then
      # Rendercontrole (22.10.2026): HTTP 200 is geen bewijs dat een pagina rendert. 1 = kapot → terugdraaien; 0/2 → actief (2 met waarschuwing).
      rook_controleren "$doel" || rrc=$?
      if [ "$rrc" -ne 1 ]; then
        [ "$rrc" -eq 0 ] || waarschuwing "rendering van $doel is NIET gecontroleerd (zie hierboven); de release is wel actief"
        melding "actief: $doel"
        return 0
      fi
      waarschuwing "rendercontrole: release $doel rendert niet — $ROOK_REDEN"
    else
      waarschuwing "nabewaking mislukt; journalctl -u $DIENST -n 50"
    fi
  else
    waarschuwing "gezondheidscontrole mislukt ($GEZONDHEID_URL); journalctl -u $DIENST -n 50"
  fi
  if [ -n "$vorige" ] && [ -d "$vorige" ] && [ "$vorige" != "$doel" ]; then
    waarschuwing "automatisch terug naar $vorige"
    omzetten "$vorige"
    systemctl restart "$DIENST"
    gezond && melding "vorige release draait weer" || waarschuwing "ook de vorige release is niet gezond!"
    if [ "$rrc" -eq 1 ]; then
      noteer_rook ROOK_TERUGGEDRAAID warn "$doel" "$vorige" || waarschuwing "gebeurtenis ROOK_TERUGGEDRAAID niet geschreven"
      # De vorige release één keer live nakijken (publieke pagina's, geen aanmelding): alleen melden — nooit nog eens terugdraaien (geen lus).
      local reden="$ROOK_REDEN" vrc=0
      rook_controleren "$vorige" live "$doel" || vrc=$?
      [ "$vrc" -ne 1 ] || { waarschuwing "ook de vorige release $vorige rendert niet: $ROOK_REDEN"; noteer_rook ROOK_MISLUKT error "$vorige" || true; }
      ROOK_REDEN="$reden"
    fi
  elif [ "$rrc" -eq 1 ]; then
    noteer_rook ROOK_MISLUKT error "$doel" || true
  fi
  fout "installatie van $doel mislukt${ROOK_REDEN:+: rendercontrole — $ROOK_REDEN}"
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

# Stap «перевірка змінних» (20.10.2026): ontbrekende server-geheimen aanmaken vóór er iets wordt gebouwd of omgezet. Een release
# die een NIEUWE verplichte sleutel verwacht (bv. MAIL_APP_WACHTWOORD_SLEUTEL_V1 voor mail met app-wachtwoord) mag de site niet
# stil kapotmaken: de sleutel wordt hier gemaakt, of de installatie stopt met een duidelijke melding. Bestaande waarden blijven
# altijd staan; er wordt nooit een waarde getoond (alleen naam + vingerafdruk). Zie deploy/geheimen-aanmaken.sh en ENV-VARS.md.
geheimen_controleren() {
  local bron="$1" script="$1/deploy/geheimen-aanmaken.sh"
  [ -s "$script" ] || { waarschuwing "deploy/geheimen-aanmaken.sh ontbreekt in $bron; geheimen niet gecontroleerd"; return 0; }
  voortgang geheimen 5 "ontbrekende geheimen aanmaken"
  bash "$script" --stil "$GEHEIMEN" || fout "server-geheimen onvolledig (zie hierboven; ENV-VARS.md)"
}
# Pad van een hulpscript: de actieve release, anders de kopie in /usr/local/sbin (van een vorige installatie).
hulpscript() {
  local k
  for k in "$HUIDIG/deploy/$1.sh" "/usr/local/sbin/$2"; do [ -s "$k" ] && { echo "$k"; return 0; }; done
  fout "$1.sh niet gevonden (eerst een release met dit script installeren)"
}
# Hulpscripts voor de eigenaar naast mijn-ruimte-installeer (root, 0755): geheimen, register, OAuth-client.
hulpscripts_installeren() {
  local doel="$1" f
  for f in geheimen-aanmaken:mijn-ruimte-geheimen geheimen-register:mijn-ruimte-geheimen-register oauth-client-zetten:mijn-ruimte-oauth-client google-login-zetten:google-login-zetten ocr-talen-installeren:mijn-ruimte-ocr-talen browser-controle-installeren:mijn-ruimte-browser-controle apparaat-inrichten:mijn-ruimte-apparaat; do
    [ -s "$doel/deploy/${f%%:*}.sh" ] || continue
    install -m 0755 -o root -g root "$doel/deploy/${f%%:*}.sh" "/usr/local/sbin/${f##*:}"
  done
  melding "hulpscripts bijgewerkt: mijn-ruimte-geheimen, mijn-ruimte-geheimen-register, mijn-ruimte-oauth-client, mijn-ruimte-ocr-talen, mijn-ruimte-browser-controle"
}

installeren() {
  local bron="${1:?bronmap ontbreekt}" datum doel
  vereis_root; vereis_node; vergrendel
  rm -f /var/lib/mijn-ruimte-uitrol/nazorg /var/lib/mijn-ruimte-uitrol/nazorg-fouten   # een lopende installatie mag niet door de nazorg worden teruggedraaid
  [ -s "$GEHEIMEN" ] || fout "$GEHEIMEN ontbreekt (zie ENV-VARS.md)"
  geheimen_controleren "$(readlink -f "$bron")"
  # Audit-fix 10: de app start niet zonder eigen IP-pepper; liever hier stoppen dan na het omzetten.
  grep -Eq '^[[:space:]]*AUDIT_IP_PEPPER=.{32,}' "$GEHEIMEN" || fout "AUDIT_IP_PEPPER ontbreekt in $GEHEIMEN: eerst «$0 geheimen» (zie ENV-VARS.md)"
  id "$GEBRUIKER" >/dev/null 2>&1 || fout "gebruiker $GEBRUIKER ontbreekt; eerst: $0 inrichten $bron"
  bron="$(readlink -f "$bron")"
  # Vergissing voorkomen (17.10.2026: tweemaal de OUDE map ingesteld terwijl een nieuw archief naast de oude map was uitgepakt):
  # toon wat er nu écht wordt geïnstalleerd en waarschuw als dit niet nieuwer is dan de actieve versie.
  local pv hv
  pv="$(pakket_versie "$bron" || true)"; hv="$(pakket_versie "$HUIDIG" || true)"
  melding "map: $bron"
  melding "versie in deze map (UITROL-VERSIE): ${pv:-onbekend}   |   nu actief: ${hv:-onbekend}"
  if [ -n "$pv" ] && [ -n "$hv" ] && [[ ! "$pv" > "$hv" ]]; then
    waarschuwing "deze map ($pv) is NIET nieuwer dan de actieve versie ($hv). Pakte u de juiste map uit? (tar maakt een map met de naam van het archief.) Doorgaan over 8 s; Ctrl+C om te stoppen."
    sleep 8
  fi
  datum="$(date +%Y%m%d-%H%M%S)"
  doel="$RELEASES/$datum"
  [ ! -e "$doel" ] || fout "$doel bestaat al"
  install -d -o root -g "$GEBRUIKER" -m 0750 "$doel"
  ONVOLTOOID="$doel"
  migratie_proef "$bron"
  voortgang kopie 45 "broncode kopiëren"; melding "bron kopiëren naar $doel…"; bron_kopieren "$bron" "$doel"
  # Geen patch-scripts meer tijdens het installeren (vroeger o.a. een base64-blob die als root werd uitgevoerd): wat in de bron
  # staat, is wat er gebouwd wordt. Zie deploy/RUNBOOK-VEILIGE-UITROL.md.
  melding "bouwen (npm ci, audit, vite, server-bundel)…"; bouwen "$doel"
  deploy_herstellen "$bron" "$doel"
  migreren "$doel"
  ONVOLTOOID=""   # vanaf hier blijft de release bestaan (ook als activeren mislukt, voor diagnose)
  goedkeur_inbox_maken   # vóór het herstarten: de app-unit noemt deze map in ReadWritePaths
  install -d -o root -g "$GEBRUIKER" -m 0770 "$PAKKETTEN_DIR"   # idem: archieven van releases (ReadWritePaths, audit 18.10.2026 punt 4)
  units_installeren "$doel"
  hulpscripts_installeren "$doel"
  activeren "$doel"
  nazorg_markeren "$doel"
  oude_deur_opruimen
  veilige_uitrol_inrichten "$doel"
  beheer_inrichten "$doel"
  goedkeuring_inrichten "$doel"
  besluit_inrichten "$doel"
  orch_inrichten
  ssh_ca_inrichten "$doel"
  db_rollen_hulp_inrichten "$doel"
  guacamole_inrichten "$doel"
  opa_inrichten "$doel"
  # UITROL-001: migratieproef vóór de upload (root-script + path-unit; de site legt alleen proef-<id>.json in de inbox).
  if [ -s "$doel/deploy/uitrol/mijn-ruimte-migratie-proef.sh" ]; then
    install -m 0755 -o root -g root "$doel/deploy/uitrol/mijn-ruimte-migratie-proef.sh" /usr/local/sbin/mijn-ruimte-migratie-proef
    install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 "$APP_ROOT/proef-inbox"
    install -d -o root -g root -m 0711 /var/lib/mijn-ruimte-proef
    install -d -o root -g "$GEBRUIKER" -m 0750 "$STATUS_GEBEURTENISSEN/proef"
    systemctl enable --now mijn-ruimte-proef.path >/dev/null 2>&1 || waarschuwing "mijn-ruimte-proef.path kon niet worden gestart"
    melding "migratieproef ingericht"
  fi
  # Volledig archief ("Архів на ПК"): root-script + path-unit die het verzoekbestand van de site bewaakt (de site kan zelf niets als root
  # doen). Uitvoer in een root-map (uitgifte root:mijnruimte 0750, werkmap 0700), het hele archief age-versleuteld.
  if [ -s "$doel/deploy/archief-maken.sh" ]; then
    install -m 0755 -o root -g root "$doel/deploy/archief-maken.sh" /usr/local/sbin/mijn-ruimte-archief
    install -d -o "$GEBRUIKER" -g "$GEBRUIKER" -m 0750 /srv/data/uploads/mcp-archives
    install -d -o root -g root -m 0711 /var/lib/mijn-ruimte-archief
    install -d -o root -g root -m 0700 /var/lib/mijn-ruimte-archief/werk
    install -d -o root -g "$GEBRUIKER" -m 0750 /var/lib/mijn-ruimte-archief/uitgifte
    # Oude, deels onversleutelde archieven in de app-map blijven staan: er wordt NIETS automatisch verwijderd. Ze wel melden,
    # want ze bevatten broncode en units (en in oude versies sudoers) leesbaar. De eigenaar controleert en verwijdert ze zelf.
    oud_archief="$(find /srv/data/uploads/mcp-archives -maxdepth 1 -type f \( -name 'mijn-ruimte-*-volledig.tar' -o -name 'mijn-ruimte-*.tar.gz' \) 2>/dev/null | wc -l || true)"
    if [ "${oud_archief:-0}" -gt 0 ]; then
      waarschuwing "er staan $oud_archief oud(e) onversleuteld(e) archief/archieven in /srv/data/uploads/mcp-archives; die zijn NIET verwijderd. Controleer ze en verwijder ze zelf (ls -l /srv/data/uploads/mcp-archives)."
    fi
    systemctl enable --now mijn-ruimte-archief.path >/dev/null 2>&1 || waarschuwing "mijn-ruimte-archief.path kon niet worden gestart"
    melding "archief-hulp bijgewerkt"
  fi
  # Timers (cron, opruimen, back-up) starten; `enable` alleen start ze pas na een herstart.
  systemctl enable "${TIMERS[@]}" >/dev/null 2>&1 || true   # nieuwe timers moeten ook een herstart overleven
  systemctl start "${TIMERS[@]}"
  agenten_bijwerken "$doel"
  # Zone G (22.10.2026): deze server als apparaat van de eigenaar (opdracht-terminal); stil, nooit fataal, alleen de eerste keer.
  if [ -s "$doel/deploy/apparaat-inrichten.sh" ]; then bash "$doel/deploy/apparaat-inrichten.sh" --bij-installeren "$doel" || waarschuwing "server als apparaat: later met «$0 terminal-inrichten»"; fi
  releases_opruimen
  melding "klaar: release $datum (commit $(cat "$doel/RELEASE-COMMIT"))"
  pakket_bewaren_ssh "$bron" "$(pakket_versie "$doel")" || true
  pakketgegevens_melden "$doel" || true
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
  # Na de audit en niet-fataal: de hoofdapp is terug en gezond (zie mcp_deur_bijwerken).
  # Faalt de deur, dan ook een gebeurtenis voor de site (noteer_mcp_deur), anders zag de eigenaar daar alleen «teruggedraaid».
  mcp_deur_bijwerken "$doel" || {
    waarschuwing "MCP-deur (poort 8091) niet teruggezet naar $(basename "$doel"): controleer $APP_ROOT/mcp/server.mjs en de unit, daarna 'systemctl daemon-reload && systemctl try-restart mijn-ruimte-mcp' — NIET opnieuw terugdraaien (dat zet de vorige release terug)"
    noteer_mcp_deur MCP_DEUR_NIET_TERUGGEZET warn "$doel" || waarschuwing "gebeurtenis MCP_DEUR_NIET_TERUGGEZET niet geschreven"
  }
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

# Etap E: journaal → eigen SIEM. Alleen SIEM_-regels in siem.env (de dienst leest die naast geheimen.env); Loki alleen op loopback
# (ook de app controleert dat). Het bestand: /var/log/mijn-ruimte/audit.ndjson, map 2750 (groep adm als die bestaat, zodat een
# Wazuh-agent of Promtail in die groep kan lezen), logrotate dagelijks 30 dagen. Uitzetten: siem uit (verwijdert alleen siem.env).
siem_instellen() {
  local stand="${1:-}"; shift || true
  local bestand=0 loki="" begin=0 groep="$GEBRUIKER" tmp
  case "$stand" in
    uit) rm -f /etc/mijn-ruimte/siem.env; systemctl restart "$DIENST"; melding "SIEM-export uit (bestaande bestanden in /var/log/mijn-ruimte blijven staan)"; return 0 ;;
    aan) ;;
    *) fout "gebruik: $0 siem aan [--bestand] [--loki http://127.0.0.1:3100] [--vanaf-begin] | $0 siem uit" ;;
  esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --bestand) bestand=1; shift ;;
      --loki) loki="${2:-}"; shift 2 || fout "--loki vraagt een adres" ;;
      --vanaf-begin) begin=1; shift ;;
      *) fout "onbekende optie: $1" ;;
    esac
  done
  [ "$bestand" -eq 1 ] || [ -n "$loki" ] || fout "kies --bestand en/of --loki <url>"
  if [ -n "$loki" ] && ! [[ "$loki" =~ ^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$ ]]; then
    fout "Loki alleen op deze machine (http://127.0.0.1:<poort>): het journaal gaat nooit rechtstreeks naar buiten"
  fi
  grep -q '/etc/mijn-ruimte/siem.env' /etc/systemd/system/"$DIENST" 2>/dev/null || fout "de dienst kent siem.env nog niet: installeer eerst deze release (installeren), dan siem aan"
  getent group adm >/dev/null && groep=adm
  install -d -m 2750 -o "$GEBRUIKER" -g "$groep" /var/log/mijn-ruimte
  tmp="$(mktemp /etc/mijn-ruimte/.siem.XXXXXX)"
  {
    echo "# Gemaakt door mijn-ruimte-installeer siem ($(date -u +%Y-%m-%dT%H:%M:%SZ)). Alleen SIEM_-regels; zie deploy/SIEM.md."
    [ "$bestand" -eq 1 ] && echo "SIEM_BESTAND=/var/log/mijn-ruimte/audit.ndjson"
    [ -n "$loki" ] && echo "SIEM_LOKI_URL=$loki"
    [ "$begin" -eq 1 ] && echo "SIEM_VANAF=begin"
    true
  } > "$tmp"
  chown root:"$GEBRUIKER" "$tmp"; chmod 0640 "$tmp"; mv -f "$tmp" /etc/mijn-ruimte/siem.env
  cat > /etc/logrotate.d/mijn-ruimte-siem <<LR
/var/log/mijn-ruimte/audit.ndjson {
  daily
  rotate 30
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
  su $GEBRUIKER $groep
}
LR
  chmod 0644 /etc/logrotate.d/mijn-ruimte-siem
  systemctl restart "$DIENST"
  melding "SIEM-export aan:$([ "$bestand" -eq 1 ] && echo ' /var/log/mijn-ruimte/audit.ndjson')$([ -n "$loki" ] && echo " Loki $loki") — stand: technisch profiel → «Щось не працює? Перевірка» → «Журнал і SIEM»"
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

# ---------------------------------------------------------------------------------------------
# Eigen domein voor een app (21.10.2026, AI-recht «Власний домен для додатка» → app_domain). De site zet na de bevestiging met
# passkey de Caddy-route op het apparaat (apps.route); DIT zet alleen de tunnelregel <host> → Caddy (http://127.0.0.1:<poort>) in
# /etc/cloudflared/config.yml, vlak vóór de vangregel `  - service: http_status:404`. Weigert: hosts onder het domein van de site
# (die krijgen de inlogcookies van de site), ongeldige namen, een configuratie zonder precies één vangregel. Staat de host er al,
# dan verandert er niets. Volgorde: nieuwe versie in een tijdelijk bestand → `cloudflared tunnel ingress validate` → kopie van de
# oude → vervangen → tunnel herstarten; start die niet, dan gaat de kopie terug. De DNS (CNAME naar <tunnel-id>.cfargotunnel.com)
# zet de eigenaar zelf bij zijn DNS-beheerder; de site controleert hem. Een herstart van de tunnel onderbreekt de site enkele seconden.
CF_CONFIG=/etc/cloudflared/config.yml
cf_regel_toevoegen() { # cf_regel_toevoegen <in> <uit> <host> <poort> — alleen tekstwerk (ook in de eenheidstest)
  local in="$1" uit="$2" host="$3" poort="$4"
  [ "$(grep -cE '^  - service: http_status:404[[:space:]]*$' "$in")" = 1 ] || return 3
  awk -v h="$host" -v p="$poort" '
    /^  - service: http_status:404[[:space:]]*$/ && !gedaan { print "  # eigen app-domein (mijn-ruimte-installeer app-domein)"; print "  - hostname: " h; print "    service: http://127.0.0.1:" p; gedaan = 1 }
    { print }' "$in" > "$uit"
}
app_domein_geldig() { # app_domein_geldig <host> <sitedomein> — 0 = mag; anders een reden op stderr
  local host="$1" domein="$2"
  [ ${#host} -le 253 ] && [[ "$host" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]] || { echo "ongeldige hostnaam: $host" >&2; return 1; }
  [[ "$host" =~ ^[0-9.]+$ ]] && { echo "een IP-adres is geen domein: $host" >&2; return 1; }
  case "$host" in "$domein"|*."$domein") echo "$host valt onder $domein: daar krijgt een app de inlogcookies van de site; kies een domein buiten $domein" >&2; return 1 ;; esac
  return 0
}
app_domein() {
  local host="${1:?hostnaam ontbreekt (bv. notities.voorbeeld.nl)}"; shift
  local poort=8090
  while [ $# -gt 0 ]; do
    case "$1" in
      --caddy-poort) poort="${2:?}"; shift 2 ;;
      *) fout "onbekende optie: $1" ;;
    esac
  done
  vereis_root
  host="${host,,}"
  [[ "$poort" =~ ^[0-9]{4,5}$ ]] && [ "$poort" -ge 1024 ] && [ "$poort" -le 65535 ] || fout "--caddy-poort: 1024-65535 (standaard 8090, zoals apps-inrichten)"
  local domein
  domein="$(sed -n "s/^export const PUBLIC_DOMAIN = '\([a-z0-9.-]*\)';.*/\1/p" "$HUIDIG/backend/deployment-identity.ts" 2>/dev/null | head -1)"
  [ -n "$domein" ] || fout "domein van de site niet gevonden in $HUIDIG/backend/deployment-identity.ts"
  app_domein_geldig "$host" "$domein" || fout "geweigerd"
  command -v cloudflared >/dev/null 2>&1 || fout "cloudflared ontbreekt op deze server"
  [ -s "$CF_CONFIG" ] || fout "$CF_CONFIG ontbreekt (eerst de tunnel inrichten, zie deploy/LEESMIJ.md)"
  if grep -qE "^[[:space:]]*-?[[:space:]]*hostname:[[:space:]]*${host//./\\.}[[:space:]]*$" "$CF_CONFIG"; then
    melding "$host staat al in $CF_CONFIG: niets veranderd"; return 0
  fi
  systemctl is-active --quiet caddy 2>/dev/null || waarschuwing "Caddy draait niet: de tunnelregel wordt gezet, maar de app is pas bereikbaar met Caddy (apps-inrichten --caddy tunnel)"
  local tmp kopie tid
  tmp="$(mktemp "$(dirname "$CF_CONFIG")/.config-app-domein.XXXXXX")"
  if ! cf_regel_toevoegen "$CF_CONFIG" "$tmp" "$host" "$poort"; then
    rm -f -- "$tmp"; fout "$CF_CONFIG heeft niet precies één vangregel '  - service: http_status:404' (twee spaties ervoor): pas het bestand eerst zelf aan"
  fi
  if ! cloudflared tunnel --config "$tmp" ingress validate >/dev/null 2>&1; then
    rm -f -- "$tmp"; fout "cloudflared keurt de nieuwe configuratie af; er is niets veranderd"
  fi
  kopie="$CF_CONFIG.voor-app-domein.$(date +%Y%m%d%H%M%S)"
  cp -a -- "$CF_CONFIG" "$kopie"
  chown root:root "$tmp"; chmod 0644 "$tmp"; mv -f -- "$tmp" "$CF_CONFIG"
  if ! systemctl restart cloudflared || ! sleep 3 || ! systemctl is-active --quiet cloudflared; then
    cp -a -- "$kopie" "$CF_CONFIG"; systemctl restart cloudflared || true
    fout "de tunnel startte niet met de nieuwe regel; de oude configuratie staat terug ($kopie)"
  fi
  tid="$(sed -n 's/^tunnel:[[:space:]]*\([0-9a-f-]\{36\}\)[[:space:]]*$/\1/p' "$CF_CONFIG" | head -1)"
  melding "tunnelregel gezet: https://$host → Caddy op 127.0.0.1:$poort (kopie van de oude configuratie: $kopie)"
  melding "DNS bij uw DNS-beheerder: CNAME $host → ${tid:-<TUNNEL-ID>}.cfargotunnel.com (zone bij Cloudflare: cloudflared tunnel route dns ${tid:-<TUNNEL-ID>} $host)"
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
  siem) vereis_root; siem_instellen "$@" ;;
  beheer-koppelen) beheer_koppelen "$@" ;;
  terminal-inrichten) vereis_root; vereis_node; exec bash "$(hulpscript apparaat-inrichten mijn-ruimte-apparaat)" "$@" ;;   # zone G: server als apparaat + opdracht-terminal, zie deploy/apparaat-inrichten.sh
  app-domein) app_domein "$@" ;;
  geheimen) vereis_root; exec bash "$(hulpscript geheimen-aanmaken mijn-ruimte-geheimen)" "$@" ;;
  geheimen-register) vereis_root; exec bash "$(hulpscript geheimen-register mijn-ruimte-geheimen-register)" "$@" ;;
  oauth-client) vereis_root; exec bash "$(hulpscript oauth-client-zetten mijn-ruimte-oauth-client)" "$@" ;;
  ocr-talen) vereis_root; MIJN_RUIMTE_GEBRUIKER="$GEBRUIKER" exec bash "$(hulpscript ocr-talen-installeren mijn-ruimte-ocr-talen)" "$@" ;;   # OCR voor /zoek: tesseract + taalbestanden (SHA-256), zie deploy/ocr-talen-installeren.sh
  browser-controle) vereis_root; MIJN_RUIMTE_GEBRUIKER="$GEBRUIKER" exec bash "$(hulpscript browser-controle-installeren mijn-ruimte-browser-controle)" "$@" ;;   # headless Chromium (vastgepind, SHA-256) voor de rendercontrole, zie deploy/browser-controle-installeren.sh
  rook-controle) rook_opdracht "$@" ;;   # rendercontrole van de actieve release (stand) of --live; schrijft rook-controle.json, draait nooit zelf terug
  noteer-proef) [ "$(id -u)" -ne 0 ] && [ "${INSTALLEER_NOTEER_PROEF:-}" = 1 ] || fout "alleen in een test"; noteer_ssh "$@" ;;
  *) sed -n '/^set -euo/q;2,$p' "$0"; exit 2 ;;
esac
