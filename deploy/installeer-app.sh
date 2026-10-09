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
  install -m 0755 -o root -g root "$doel/deploy/goedkeuring/mijn-ruimte-passkey.sh" /usr/local/sbin/mijn-ruimte-passkey
  install -d -o root -g root -m 0755 /var/lib/mijn-ruimte
  install -d -o root -g root -m 0700 /var/lib/mijn-ruimte/goedkeuring
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
    bash -c 'set -euo pipefail; npm ci --no-audit --no-fund; npm run build; npm prune --omit=dev --no-audit --no-fund' \
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
  releases_opruimen
  melding "klaar: release $datum (commit $(cat "$doel/RELEASE-COMMIT"))"
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
  *) sed -n '2,23p' "$0"; exit 2 ;;
esac
