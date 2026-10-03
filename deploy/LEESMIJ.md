# Deploy-bestanden Mijn Ruimte (VM achter Cloudflare Tunnel)

Niets hiervan wordt automatisch uitgerold. Volgorde voor een nieuwe VM (Debian/Ubuntu, als root):

1. **Pakketten**: Node 24 (`/usr/bin/node`, bijv. via NodeSource), `npm`, `git`, `rsync`, `curl`,
   PostgreSQL 17 (server + `postgresql-client-17` voor `pg_dump`), `cloudflared`.
2. **Inrichten**: `deploy/installeer-app.sh inrichten /pad/naar/checkout`
   - systeemgebruiker `mijnruimte` (geen shell), groep `mijnruimte-backup` (voor de host die back-ups ophaalt);
   - mappen `/srv/mijn-ruimte/{releases,dashboard}`, `/srv/data/uploads`, `/srv/backups/mijn-ruimte`, `/etc/mijn-ruimte`;
   - systemd-units en timers naar `/etc/systemd/system/` en ingeschakeld.
3. **Database**: rol en database `mijnruimte` aanmaken (de opdracht wordt door `inrichten` getoond).
4. **Geheimen**: `/etc/mijn-ruimte/geheimen.env` met `DATABASE_URL`, daarna de overige verplichte sleutels op de VM
   laten genereren: `deploy/geheimen-aanvullen.sh --eigenaar <e-mailadres>` (overschrijft niets, toont geen waarden).
   Modus `0600 root:root` volstaat: systemd leest het bestand als root vóór het starten van de dienst.
5. **Installeren**: `deploy/installeer-app.sh installeren /pad/naar/checkout`
   bron kopiëren (alleen gecommitte HEAD) → bouwen als `mijnruimte` (`npm ci`, audit, vite, server-bundel,
   `npm prune --omit=dev`) → back-up → migraties → `current`-symlink atomisch omzetten → herstart →
   gezondheidscontrole (`/__gezondheid`); mislukt die, dan automatisch terug naar de vorige release.
6. **Dashboard**: `deploy/installeer-app.sh dashboard /pad/naar/dashboardmap` (alleen `*.html/*.css/*.js`/afbeeldingen,
   naar `/srv/mijn-ruimte/dashboard`, `root:mijnruimte`, bestanden 0640: alleen-lezen voor de dienst).
7. **Tunnel**: zie "Tunnel" hieronder. `inrichten` zet al een `/etc/cloudflared/config.yml` klaar met plaatshouder
   `TUNNEL-ID-INVULLEN` (niet ingeschakeld).
8. **Controle**: `systemctl status mijn-ruimte`, `systemctl list-timers 'mijn-ruimte-*'`,
   `journalctl -u mijn-ruimte -f`, `curl -s http://127.0.0.1:8080/__gezondheid`.

## Bestanden

| Bestand | Doel |
|---|---|
| `mijn-ruimte.service` | HTTP-server (`dist-server/start.mjs`), gebruiker `mijnruimte`, `EnvironmentFile=/etc/mijn-ruimte/geheimen.env`, hardening (NoNewPrivileges, ProtectSystem=strict, alleen `/srv/data/uploads` schrijfbaar, PrivateTmp, ProtectHome, lege CapabilityBoundingSet, SystemCallFilter, …). |
| `mijn-ruimte-cron@.service` | Eén cron-taak uit `cron.json` (`dist-server/cron.mjs %i`), zelfde hardening. |
| `mijn-ruimte-mail-onderhoud.timer` | `mail-provider-maintenance`, elke 5 min. |
| `mijn-ruimte-google-sync.timer` | `google-suite-bplus-sync`, elke 5 min (verschoven met 2 min). |
| `mijn-ruimte-opruimen.timer` | `opruimen` (verlopen OAuth-states, PKCE, transacties, handoffs, sessies, limietrijen), elk uur. |
| `mijn-ruimte-backup.service` / `.timer` | Dagelijks 03:30 `backup-maken.sh`. |
| `backup-maken.sh` | `pg_dump` (custom-formaat) + `uploads.tar.gz` + `SHA256SUMS` + `KLAAR` in `/srv/backups/mijn-ruimte/<datum>/`; bewaart 7 dagen op de VM. |
| `cloudflared-config.yml` | Sjabloon: hub, id, mail, cloud, ai, github, huis, api, admin, dashboard → `http://127.0.0.1:8080`; rest 404. |
| `installeer-app.sh` | `inrichten`, `installeren`, `terugdraaien [release]`, `lijst`, `dashboard <map>`. Start na een geslaagde installatie ook de timers. |
| `geheimen-aanvullen.sh` | Genereert ontbrekende sleutels (`openssl rand`) in `geheimen.env`; bestaande waarden blijven, niets wordt getoond. |

## Opties (omgevingsvariabelen van de scripts)
Dit zijn geen app-geheimen (die staan in `ENV-VARS.md`), alleen instellingen van de deployscripts:

| Variabele | Script | Standaard | Betekenis |
|---|---|---|---|
| `BEWAAR_RELEASES` | `installeer-app.sh` | `5` | Aantal releases dat bewaard blijft (oudere worden verwijderd, de actieve en vorige nooit). |
| `ZONDER_BACKUP=1` | `installeer-app.sh` | uit | Back-up vóór de migratie overslaan (alleen als er net een verse back-up is). |
| `NODE` | `installeer-app.sh` | `/usr/bin/node` | Pad naar Node 24. |
| `PORT` | `installeer-app.sh`, `mijn-ruimte.service` | `8080` | Lokale poort (gezondheidscontrole op `http://127.0.0.1:$PORT/__gezondheid`); houd gelijk aan de unit en `cloudflared-config.yml`. |
| `UPLOADS_DIR` | `backup-maken.sh`, units | `/srv/data/uploads` | Map met geüploade bestanden. |
| `BOUW_GEHEUGEN_MAX` / `BOUW_SWAP_MAX` / `BOUW_HEAP_MB` | `installeer-app.sh` | `1400M` / `2G` / `2048` | Geheugenplafond (cgroup) en Node-heap voor de build. De vite-build heeft ~1,5 GB heap nodig; op een VM met 2 GB RAM wijkt hij uit naar swap. Een tekort stopt alleen de build. |
| `BACKUP_DIR` | `backup-maken.sh` | `/srv/backups/mijn-ruimte` | Doelmap van de back-ups op de VM. |
| `BACKUP_BEWAAR_DAGEN` | `backup-maken.sh` | `7` | Hoeveel dagen back-ups op de VM blijven staan. |

## Tunnel (Cloudflare; vraagt een Cloudflare-login, nog niet gedaan)
Als root op de VM:
```bash
cloudflared tunnel login                       # opent een URL: inloggen bij Cloudflare, zone tarasevych.com kiezen
cloudflared tunnel create mijn-ruimte          # schrijft /root/.cloudflared/<ID>.json en toont het tunnel-ID
install -m 0600 /root/.cloudflared/<ID>.json /etc/cloudflared/<ID>.json
sed -i 's/TUNNEL-ID-INVULLEN/<ID>/g' /etc/cloudflared/config.yml
cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml
for h in hub id mail cloud ai github huis api admin dashboard; do cloudflared tunnel route dns mijn-ruimte $h.tarasevych.com; done
cloudflared service install                    # maakt cloudflared.service (leest /etc/cloudflared/config.yml)
systemctl enable --now cloudflared
```
Bestaan er al DNS-records voor deze namen (bijv. van AppDeploy), dan eerst in het Cloudflare-dashboard verwijderen
of `route dns --overwrite-dns` gebruiken. De tunnel maakt alleen uitgaande verbindingen (poort 7844 naar Cloudflare);
ufw hoeft niet open. Daarna in Google Cloud de redirect-URI's op `https://id.tarasevych.com/…` zetten (ENV-VARS.md).

## Terugdraaien
`deploy/installeer-app.sh terugdraaien` (vorige release) of `… terugdraaien 20261003-101500`.
Migraties zijn alleen vooruit: het schema blijft op de nieuwste stand. Houd migraties daarom
uitbreidend (kolommen/tabellen toevoegen, niets hernoemen of verwijderen in dezelfde release).

## Back-ups ophalen (pull vanaf de host)
De VM duwt niets weg. Een host-gebruiker (bijv. `backup`, lid van `mijnruimte-backup` op de VM, alleen
SSH-sleutel, liefst met `command=`-beperking tot rsync) haalt op:
```bash
rsync -a vm:/srv/backups/mijn-ruimte/ /pad/op/host/mijn-ruimte/
for d in /pad/op/host/mijn-ruimte/2*/; do [ -f "$d/KLAAR" ] && (cd "$d" && sha256sum -c --quiet SHA256SUMS); done
```
Bewaar `geheimen.env` (vooral alle `*_KEY_V1` en `RECOVERY_CODE_PEPPER`) **apart** en offline:
zonder die sleutels zijn TOTP-geheimen, tokens en kluisitems in de dump onbruikbaar.

## Back-up terugzetten
```bash
systemctl stop mijn-ruimte 'mijn-ruimte-*.timer'
sudo -u postgres dropdb mijnruimte && sudo -u postgres createdb -O mijnruimte mijnruimte
sudo -u postgres pg_restore --no-owner --role=mijnruimte -d mijnruimte /pad/database.dump
tar -xzf /pad/uploads.tar.gz -C /srv/data && chown -R mijnruimte:mijnruimte /srv/data/uploads
systemctl start mijn-ruimte 'mijn-ruimte-*.timer'
```
