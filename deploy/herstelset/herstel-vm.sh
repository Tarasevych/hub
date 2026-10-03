#!/usr/bin/env bash
# herstel-vm.sh — zet Mijn Ruimte terug op een NIEUWE Ubuntu 24.04-VM vanuit de offline herstelset.
# Volgorde (zie 00-BEGIN-HIER-UA.txt / -NL.txt):
#   basis                 sudo zonder wachtwoord voor beheer, updates, datavolume, runtime (Postgres/Node/cloudflared), age, app-gebruiker
#   geheimen              stdin = ONTSLEUTELD geheimenarchief (tar), op de pc ontsleuteld; zet geheimen.env + tunnel-JSON terug
#   database              Postgres-cluster, rol en database (hergebruikt het wachtwoord uit geheimen.env)
#   app                   broncode uitpakken, inrichten, publieke age-sleutel, installeren, dashboard
#   db-terugzetten        stdin = ONTSLEUTELDE database.dump
#   uploads-terugzetten   stdin = ONTSLEUTELDE uploads.tar.gz
#   tunnel                tunnel met de teruggezette credentials (zelfde tunnel-ID, DNS blijft)
#   tunnel-nieuw NAAM     nieuwe tunnel (na 'cloudflared tunnel login'); DNS van de 10 hosts omzetten
#   controle              dienst, gezondheid, hosts, timers, tunnel, versleutelde back-up
# Als root:  sudo bash ~/herstel/scripts/herstel-vm.sh <stap>
# Toont nooit geheime waarden.
set -euo pipefail
KIT="${HERSTEL_MAP:-/home/beheer/herstel}"
WERK=/root/herstel
HOSTS=(hub id mail cloud ai github huis api admin dashboard)
DOMEIN=tarasevych.com
stap="${1:?stap ontbreekt}"
[ "$(id -u)" -eq 0 ] || { echo "als root (sudo) uitvoeren" >&2; exit 1; }
cd /
inst() { echo "$WERK/bron/mijn-ruimte/deploy/installeer-app.sh"; }
melding() { echo "[herstel] $*"; }

case "$stap" in
basis)
  echo 'beheer ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-beheer
  chmod 0440 /etc/sudoers.d/90-beheer; visudo -cf /etc/sudoers.d/90-beheer
  timedatectl set-timezone Europe/Kyiv || true
  melding "systeem bijwerken (kan 5-15 min duren)…"
  bash "$KIT/scripts/vm/bijwerken.sh" || { tail -n 20 /var/log/bijwerken.log; exit 1; }
  tail -n 3 /var/log/bijwerken.log
  bash "$KIT/scripts/vm/maak-datavolume.sh"
  mount -a; findmnt /srv/data
  bash "$KIT/scripts/vm/installeer-runtime.sh"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq age >/dev/null
  bash "$KIT/scripts/vm/maak-app-gebruiker.sh"
  node --version; psql --version; cloudflared --version | head -1; age --version
  melding "basis klaar"
  ;;
geheimen)
  t=$(mktemp -d /dev/shm/herstel-XXXXXX); trap 'find "$t" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$t"' EXIT
  tar -xpf - -C "$t"
  [ -s "$t/etc/mijn-ruimte/geheimen.env" ] || { echo "geheimen.env niet in het archief (verkeerde sleutel of bestand?)" >&2; exit 1; }
  install -d -o root -g root -m 0750 /etc/mijn-ruimte
  install -o root -g root -m 0600 "$t/etc/mijn-ruimte/geheimen.env" /etc/mijn-ruimte/geheimen.env
  n=0
  for j in "$t"/etc/cloudflared/*.json; do
    [ -e "$j" ] || continue
    install -d -o root -g root -m 0755 /etc/cloudflared
    install -o root -g root -m 0600 "$j" "/etc/cloudflared/$(basename "$j")"; n=$((n+1))
  done
  melding "geheimen.env teruggezet ($(grep -c '=' /etc/mijn-ruimte/geheimen.env) instellingen), tunnel-credentials: $n"
  ;;
database)
  [ -s /etc/mijn-ruimte/geheimen.env ] || { echo "eerst stap 'geheimen'" >&2; exit 1; }
  bash "$KIT/scripts/vm/configureer-postgresql.sh"
  ;;
app)
  tgz=$(ls -1 "$KIT"/broncode/mijn-ruimte-zelf-hosten-*.tar.gz | tail -1)
  rm -rf "$WERK/bron"; install -d -m 0700 "$WERK/bron"
  tar -xzf "$tgz" -C "$WERK/bron"
  melding "broncode: $(basename "$tgz") (commit $(cat "$WERK/bron/mijn-ruimte/BRON-COMMIT"))"
  bash "$(inst)" inrichten "$WERK/bron/mijn-ruimte"
  install -o root -g root -m 0644 "$KIT/sleutels/herstelsleutel-age.pub.txt" /etc/mijn-ruimte/backup-ontvanger.age.pub
  ZONDER_BACKUP=1 bash "$(inst)" installeren "$WERK/bron/mijn-ruimte"
  dtgz=$(ls -1 "$KIT"/broncode/dashboard/*.tar.gz 2>/dev/null | tail -1 || true)
  if [ -n "$dtgz" ]; then
    rm -rf "$WERK/dashboard"; install -d -m 0700 "$WERK/dashboard"; tar -xzf "$dtgz" -C "$WERK/dashboard"
    d=$(dirname "$(find "$WERK/dashboard" -name qa.html | head -1)")
    bash "$(inst)" dashboard "$d"
  fi
  curl -s http://127.0.0.1:8080/__gezondheid; echo
  ;;
db-terugzetten)
  install -o postgres -g postgres -m 0600 /dev/stdin /var/tmp/herstel-database.dump
  head -c 5 /var/tmp/herstel-database.dump | grep -q PGDMP || { shred -u /var/tmp/herstel-database.dump; echo "geen geldige dump (verkeerde sleutel/bestand?)" >&2; exit 1; }
  systemctl stop mijn-ruimte.service 'mijn-ruimte-*.timer'
  sudo -u postgres dropdb --if-exists mijnruimte
  sudo -u postgres createdb -O mijnruimte mijnruimte
  sudo -u postgres pg_restore --no-owner --role=mijnruimte -d mijnruimte /var/tmp/herstel-database.dump
  shred -u /var/tmp/herstel-database.dump
  systemctl start mijn-ruimte.service
  systemctl start mijn-ruimte-mail-onderhoud.timer mijn-ruimte-google-sync.timer mijn-ruimte-opruimen.timer mijn-ruimte-backup.timer
  sudo -u postgres psql -At -d mijnruimte -c "select 'records: ' || count(*) from app.records"
  sleep 2; curl -s http://127.0.0.1:8080/__gezondheid; echo
  ;;
uploads-terugzetten)
  tar -xzpf - -C /srv/data
  chown -R mijnruimte:mijnruimte /srv/data/uploads
  melding "uploads: $(find /srv/data/uploads -type f | wc -l) bestanden"
  ;;
tunnel|tunnel-nieuw)
  if [ "$stap" = tunnel-nieuw ]; then
    naam="${2:?naam van de nieuwe tunnel ontbreekt}"
    [ -f /root/.cloudflared/cert.pem ] || { echo "eerst: sudo cloudflared tunnel login" >&2; exit 1; }
    cloudflared tunnel create "$naam"
    id=$(cloudflared tunnel list --name "$naam" --output json | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
    install -d -m 0755 /etc/cloudflared
    install -o root -g root -m 0600 "/root/.cloudflared/$id.json" "/etc/cloudflared/$id.json"; shred -u "/root/.cloudflared/$id.json"
    for h in "${HOSTS[@]}"; do cloudflared tunnel route dns --overwrite-dns "$naam" "$h.$DOMEIN"; done
    shred -u /root/.cloudflared/cert.pem
  else
    j=$(ls -1 /etc/cloudflared/*.json 2>/dev/null | head -1 || true)
    [ -n "$j" ] || { echo "geen tunnel-credentials in /etc/cloudflared: gebruik 'tunnel-nieuw NAAM'" >&2; exit 1; }
    id=$(basename "$j" .json)
  fi
  sed "s/<TUNNEL-ID>/$id/g" "$WERK/bron/mijn-ruimte/deploy/cloudflared-config.yml" > /etc/cloudflared/config.yml
  chmod 0644 /etc/cloudflared/config.yml
  cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
  install -m 0644 -o root -g root "$WERK/bron/mijn-ruimte/deploy/cloudflared.service" /etc/systemd/system/cloudflared.service
  systemctl daemon-reload; systemctl enable --now cloudflared.service
  sleep 5; systemctl is-active cloudflared.service
  melding "tunnel-ID: $id"
  ;;
controle)
  echo "== dienst: $(systemctl is-active mijn-ruimte.service), tunnel: $(systemctl is-active cloudflared.service 2>/dev/null || true)"
  echo "== gezondheid: $(curl -s http://127.0.0.1:8080/__gezondheid)"
  for h in "${HOSTS[@]}"; do printf '%-26s lokaal %s\n' "$h.$DOMEIN" "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $h.$DOMEIN" http://127.0.0.1:8080/)"; done
  systemctl list-timers 'mijn-ruimte-*' --no-pager | head -6
  systemctl start mijn-ruimte-backup.service
  d=$(ls -1d /srv/backups/mijn-ruimte/2*/ | sort | tail -1)
  ls "$d"; grep -E '^versleuteling' "$d/info.txt"
  ;;
*) sed -n '2,15p' "$0"; exit 2 ;;
esac
