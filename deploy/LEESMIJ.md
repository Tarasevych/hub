# Deploy-bestanden Mijn Ruimte (VM achter Cloudflare Tunnel)

Niets hiervan wordt automatisch uitgerold. Volgorde voor een nieuwe VM (Debian/Ubuntu, als root):

1. **Pakketten**: Node 24 (`/usr/bin/node`, bijv. via NodeSource), `npm`, `git`, `rsync`, `curl`,
   PostgreSQL 17 (server + `postgresql-client-17` voor `pg_dump`), `age` (versleutelde back-ups), `cloudflared`.
   Zet de publieke age-sleutel in `/etc/mijn-ruimte/backup-ontvanger.age.pub` (root, 0644); zonder die sleutel
   weigert de back-up (en dus ook `installeren`, dat vooraf een back-up maakt). Zie `HERSTEL.md`.
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
7. **Tunnel**: zie "Tunnel" hieronder. `inrichten` zet een `/etc/cloudflared/config.yml` klaar met plaatshouder
   `TUNNEL-ID-INVULLEN`; tunnel aanmaken, DNS en `cloudflared.service` volgen daarna (vraagt een Cloudflare-login).
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
| `backup-maken.sh` | `pg_dump` (custom-formaat) en uploads-tar, rechtstreeks door `age -R` (alleen de publieke sleutel staat op de VM) → `database.dump.age`, `uploads.tar.gz.age` + `info.txt`, `SHA256SUMS`, `KLAAR` in `/srv/backups/mijn-ruimte/<datum>/`; bewaart 7 dagen op de VM. |
| `reservekopie-ophalen.ps1` | Windows-host: haalt de nieuwste versleutelde back-up via SSH op naar `R:\mijn-ruimte-reservekopie\vm-back-ups\` (weigert onversleutelde) en start daarna `cloud/cloud-reservekopie.ps1` (Google Drive; `-ZonderCloud` slaat dat over). |
| `HERSTEL.md` | Noodplan: terugzetten vanaf GitHub + versleutelde back-up + age-herstelsleutel. |
| `cloud/` | Windows-host: `cloud-reservekopie.ps1` zet dagelijks (na het ophalen, zelfde taak 09:00) alleen `.age` + SHA256 naar Google Drive met rclone (scope `drive.file`, map `mijn-ruimte-reservekopie`; 30 dagelijks + 12 maandelijks; herstelset als `herstelset-<stempel>.zip.age`). `cloud-koppelen.ps1` = eenmalige Google-login; `cloud-wachtwoord.ps1` = DPAPI-wachtwoord voor de versleutelde rclone.conf. Zie `cloud/UITLEG-LEESMIJ.txt`. |
| `herstelset/` | Offline herstelset voor een externe schijf: handleiding (UA/NL), `herstel-vm.sh` (stappen op een nieuwe VM), `ontsleutel-naar-vm.ps1` (age-pijp pc→VM zonder klare tekst op schijf), `nieuwe-vm-maken.ps1`, `controleer-herstelset.ps1`, `herstelset-bijwerken.ps1`. |
| `vtpm/` | Automatisch LUKS-ontgrendelen via de Hyper-V-vTPM: `stap1-admin.ps1` (host, admin) en `luks-tpm-ontgrendelen.sh` (clevis tpm2, PCR 7; wachtwoordslot blijft). |
| `cloudflared.service` | Gehardende unit voor de tunnel (`tunnel run` met `/etc/cloudflared/config.yml`). |
| `cloudflared-config.yml` | Sjabloon: hub, id, mail, cloud, ai, github, huis, api, admin, dashboard → `http://127.0.0.1:8080`; rest 404. |
| `installeer-app.sh` | `inrichten`, `installeren`, `terugdraaien [release]`, `lijst`, `dashboard <map>`. Start na een geslaagde installatie ook de timers. |
| `geheimen-aanvullen.sh` | Genereert ontbrekende sleutels (`openssl rand`) in `geheimen.env`; bestaande waarden blijven, niets wordt getoond. |
| `google-login-zetten.sh` | Installeren als `/usr/local/sbin/google-login-zetten` (`install -o root -g root -m 0755`). Leest twee regels van stdin (client-ID, client-secret), controleert het formaat, zet `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` in `geheimen.env` (eigenaar/rechten blijven, atomisch via tijdelijk bestand + `mv`), verwijdert een afwijkende `GOOGLE_SUITE_CLIENT_ID` (die wint anders), herstart `mijn-ruimte`, eist `is-active` + HTTP 200 voor `Host: hub.tarasevych.com` op `127.0.0.1:8080`. Back-up (root, 0600) wordt na succes geshred; bij falen oud bestand terug + herstart. Toont nooit waarden. |
| `../scripts/google-login-instellen.ps1` | Windows-pc: vraagt Client ID (zichtbaar) en Client secret (`Read-Host -AsSecureString`) en stuurt ze via de **stdin** van `ssh -i T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver -o BatchMode=yes beheer@10.77.0.10 sudo -n /usr/local/sbin/google-login-zetten`; toont alleen OK/mislukt. Vereist dat `beheer` dit zonder wachtwoord mag (`sudo -n`, zoals in `HERSTEL.md`). |

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
| `BACKUP_ONTVANGER` | `backup-maken.sh` | `/etc/mijn-ruimte/backup-ontvanger.age.pub` | Publieke age-sleutel waarnaar versleuteld wordt. |
| `BACKUP_ONVERSLEUTELD` | `backup-maken.sh` | uit | `1` = zonder versleuteling (alleen voor tests). |

## Tunnel (Cloudflare) — ingericht op 3 okt 2026
Tunnel `mijn-ruimte`, ID `a176c08b-29e7-47b0-95d9-9ec9383572f2` (het ID is niet geheim). Alle tien hostnamen zijn
CNAME's naar `<ID>.cfargotunnel.com` (aangemaakt met `cloudflared tunnel route dns`; er bestonden nog geen records).

Op de VM:
- `/etc/cloudflared/config.yml` (root, 0644): ingress zoals `deploy/cloudflared-config.yml`, ingevuld met het ID.
- `/etc/cloudflared/<ID>.json` (root:root, 0600): tunnel-credentials. **Geheim**; zit niet in de app-back-up, wel
  (samen met `geheimen.env`) in het age-archief `R:\mijn-ruimte-reservekopie\geheimen\` (zie `HERSTEL.md`).
- `cloudflared.service` uit `deploy/cloudflared.service` (i.p.v. `cloudflared service install`): draait als root maar
  zonder capabilities, ProtectSystem=strict, enz. (`systemd-analyze security`: 1,8 OK). Alleen uitgaand (QUIC/7844);
  ufw ongewijzigd. Lokaal luistert cloudflared alleen op `127.0.0.1:20241` (metrics).
- `cert.pem` (accountcertificaat van `tunnel login`) is na het aanmaken en routeren **geshred**. Voor nieuwe
  DNS-routes of tunnelbeheer opnieuw `cloudflared tunnel login` doen en `cert.pem` daarna weer verwijderen.

Opnieuw opbouwen (bijv. nieuwe VM), als root:
```bash
cloudflared tunnel login                                  # cert.pem in /root/.cloudflared
# credentials terughalen voor de bestaande tunnel (of: tunnel create + route dns --overwrite-dns)
cloudflared tunnel token --cred-file /etc/cloudflared/<ID>.json mijn-ruimte && chmod 600 /etc/cloudflared/<ID>.json
sed 's/<TUNNEL-ID>/<ID>/g' deploy/cloudflared-config.yml > /etc/cloudflared/config.yml
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
for h in hub id mail cloud ai github huis api admin dashboard; do cloudflared tunnel route dns mijn-ruimte $h.tarasevych.com; done
install -m 0644 deploy/cloudflared.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now cloudflared
shred -u /root/.cloudflared/cert.pem
```
Aanbevolen in het Cloudflare-dashboard: SSL/TLS **Full**, **Always Use HTTPS** aan (nu antwoordt `http://` nog met 200;
HSTS van de app dekt browsers pas na het eerste https-bezoek). Daarna in Google Cloud de redirect-URI's op
`https://id.tarasevych.com/…` zetten (ENV-VARS.md).

## Terugdraaien
`deploy/installeer-app.sh terugdraaien` (vorige release) of `… terugdraaien 20261003-101500`.
Migraties zijn alleen vooruit: het schema blijft op de nieuwste stand. Houd migraties daarom
uitbreidend (kolommen/tabellen toevoegen, niets hernoemen of verwijderen in dezelfde release).

## Back-ups ophalen (pull vanaf de host)
De VM duwt niets weg. De Windows-host haalt op met `deploy/reservekopie-ophalen.ps1` (SSH als `beheer`, lid van
`mijnruimte-backup`): nieuwste map met `KLAAR`, alleen `.age`-bestanden, SHA256SUMS gecontroleerd, naar
`R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>\`. Een Linux-host kan hetzelfde met rsync:
```bash
rsync -a vm:/srv/backups/mijn-ruimte/ /pad/op/host/mijn-ruimte/
for d in /pad/op/host/mijn-ruimte/2*/; do [ -f "$d/KLAAR" ] && (cd "$d" && sha256sum -c --quiet SHA256SUMS); done
```
De back-ups zijn versleuteld naar de publieke age-sleutel; ontsleutelen kan alleen met de offline
herstelsleutel. `geheimen.env` (vooral alle `*_KEY_V1` en `RECOVERY_CODE_PEPPER`) zit er niet in maar staat
in een apart age-archief: zonder die sleutels zijn TOTP-geheimen, tokens en kluisitems in de dump onbruikbaar.

## Back-up terugzetten
Volledig stappenplan (ontsleutelen op de pc, klare tekst via SSH de VM in): `HERSTEL.md`. Kort, op een machine
met de herstelsleutel:
```bash
age -d -i herstelsleutel-age.txt -o database.dump database.dump.age
age -d -i herstelsleutel-age.txt uploads.tar.gz.age | tar -xzf - -C /srv/data
systemctl stop mijn-ruimte 'mijn-ruimte-*.timer'
sudo -u postgres dropdb mijnruimte && sudo -u postgres createdb -O mijnruimte mijnruimte
sudo -u postgres pg_restore --no-owner --role=mijnruimte -d mijnruimte database.dump && shred -u database.dump
chown -R mijnruimte:mijnruimte /srv/data/uploads
systemctl start mijn-ruimte 'mijn-ruimte-*.timer'
```
