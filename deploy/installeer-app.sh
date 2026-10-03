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
#                      BOUW_GEHEUGEN_MAX (1400M), BOUW_SWAP_MAX (2G), BOUW_HEAP_MB (2048) voor de build.
set -euo pipefail

APP_ROOT=/srv/mijn-ruimte
RELEASES="$APP_ROOT/releases"
HUIDIG="$APP_ROOT/current"
VORIGE_BESTAND="$APP_ROOT/VORIGE"
GEHEIMEN=/etc/mijn-ruimte/geheimen.env
DIENST=mijn-ruimte.service
GEBRUIKER=mijnruimte
BACKUP_GROEP=mijnruimte-backup
NODE="${NODE:-/usr/bin/node}"
PORT="${PORT:-8080}"
BEWAAR="${BEWAAR_RELEASES:-5}"
GEZONDHEID_URL="http://127.0.0.1:${PORT}/__gezondheid"
TIMERS=(mijn-ruimte-mail-onderhoud.timer mijn-ruimte-google-sync.timer mijn-ruimte-opruimen.timer mijn-ruimte-backup.timer)

ONVOLTOOID=""   # pad van een release die nog niet klaar is; wordt bij een fout verwijderd
opruimen_bij_afbreken() { if [ -n "$ONVOLTOOID" ] && [ -d "$ONVOLTOOID" ]; then echo "[installeer] onvolledige release $ONVOLTOOID verwijderd" >&2; rm -rf -- "$ONVOLTOOID"; fi; }
trap opruimen_bij_afbreken EXIT
git_bron() { git -c safe.directory="$BRON_GIT" -C "$BRON_GIT" "$@"; }

melding() { echo "[installeer] $*"; }
waarschuwing() { echo "[installeer] LET OP: $*" >&2; }
fout() { echo "[installeer] FOUT: $*" >&2; exit 1; }

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
  for f in "$bron"/deploy/*.service "$bron"/deploy/*.timer; do
    [ -e "$f" ] || continue
    if ! cmp -s "$f" "/etc/systemd/system/$(basename "$f")"; then
      install -m 0644 -o root -g root "$f" /etc/systemd/system/
      gewijzigd=1
    fi
  done
  if [ "$gewijzigd" -eq 1 ]; then systemctl daemon-reload; melding "systemd-units bijgewerkt"; fi
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
    -p MemoryMax="${BOUW_GEHEUGEN_MAX:-1400M}" -p MemorySwapMax="${BOUW_SWAP_MAX:-2G}" -p Nice=10 \
    -p NoNewPrivileges=yes -p PrivateTmp=yes \
    -E PATH="$(dirname "$NODE"):/usr/bin:/bin" -E HOME="$APP_ROOT/.bouw-home" \
    -E npm_config_cache="$APP_ROOT/.npm-cache" -E npm_config_update_notifier=false -E NODE_ENV=development \
    -E NODE_OPTIONS="--max-old-space-size=${BOUW_HEAP_MB:-2048}" \
    bash -c 'set -euo pipefail; npm ci --no-audit --no-fund; npm run build; npm prune --omit=dev --no-audit --no-fund' \
    || fout "bouwen mislukt (journalctl -u mijn-ruimte-bouw-$(basename "$doel"))"
  [ -f "$doel/dist/index.html" ] || fout "bouwen mislukt: dist/index.html ontbreekt"
  [ -f "$doel/dist-server/start.mjs" ] || fout "bouwen mislukt: dist-server/start.mjs ontbreekt"
  find "$doel/dist" -name '*.map' -delete
  rm -rf "$doel/rapporten"
  # Code is daarna alleen-lezen voor de dienst (root is eigenaar).
  chown -R "root:$GEBRUIKER" "$doel"
  chmod -R u=rwX,g=rX,o= "$doel"
}

migreren() {
  local doel="$1"
  if [ "${ZONDER_BACKUP:-0}" != "1" ] && [ -e "$HUIDIG" ] && systemctl cat mijn-ruimte-backup.service >/dev/null 2>&1; then
    melding "back-up vóór migratie…"
    systemctl start mijn-ruimte-backup.service || fout "back-up mislukt; niets gewijzigd (ZONDER_BACKUP=1 om over te slaan)"
  fi
  melding "migraties uitvoeren…"
  systemd-run --quiet --wait --pipe --collect \
    -p User="$GEBRUIKER" -p Group="$GEBRUIKER" -p EnvironmentFile="$GEHEIMEN" -p WorkingDirectory="$doel" \
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
  vorige="$(readlink -f "$HUIDIG" 2>/dev/null || true)"
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
  actief="$(readlink -f "$HUIDIG" 2>/dev/null || true)"
  vorige="$(cat "$VORIGE_BESTAND" 2>/dev/null || true)"
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
  id "$GEBRUIKER" >/dev/null 2>&1 || fout "gebruiker $GEBRUIKER ontbreekt; eerst: $0 inrichten $bron"
  bron="$(readlink -f "$bron")"
  datum="$(date +%Y%m%d-%H%M%S)"
  doel="$RELEASES/$datum"
  [ ! -e "$doel" ] || fout "$doel bestaat al"
  install -d -o root -g "$GEBRUIKER" -m 0750 "$doel"
  ONVOLTOOID="$doel"
  melding "bron kopiëren naar $doel…"; bron_kopieren "$bron" "$doel"
  melding "bouwen (npm ci, audit, vite, server-bundel)…"; bouwen "$doel"
  migreren "$doel"
  ONVOLTOOID=""   # vanaf hier blijft de release bestaan (ook als activeren mislukt, voor diagnose)
  units_installeren "$doel"
  activeren "$doel"
  # Timers (cron, opruimen, back-up) starten; `enable` alleen start ze pas na een herstart.
  systemctl start "${TIMERS[@]}"
  releases_opruimen
  melding "klaar: release $datum (commit $(cat "$doel/RELEASE-COMMIT"))"
}

terugdraaien() {
  local naam="${1:-}" doel actief
  vereis_root; vergrendel
  actief="$(readlink -f "$HUIDIG" 2>/dev/null || true)"
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
  actief="$(readlink -f "$HUIDIG" 2>/dev/null || true)"
  vorige="$(cat "$VORIGE_BESTAND" 2>/dev/null || true)"
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
