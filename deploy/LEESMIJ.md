# Deploy-bestanden Mijn Ruimte (VM achter Cloudflare Tunnel)

Niets hiervan wordt automatisch uitgerold. Volgorde voor een nieuwe VM (Debian/Ubuntu, als root):

1. **Pakketten**: Node 24 (`/usr/bin/node`, bijv. via NodeSource), `npm`, `git`, `rsync`, `curl`,
   PostgreSQL 17 (server + `postgresql-client-17` voor `pg_dump`), `cloudflared`.
2. **Inrichten**: `deploy/installeer-app.sh inrichten /pad/naar/checkout`
   - systeemgebruiker `mijnruimte` (geen shell), groep `mijnruimte-backup` (voor de host die back-ups ophaalt);
   - mappen `/srv/mijn-ruimte/{releases,dashboard}`, `/srv/data/uploads`, `/srv/backups/mijn-ruimte`, `/etc/mijn-ruimte`;
   - systemd-units en timers naar `/etc/systemd/system/` en ingeschakeld.
3. **Database**: rol en database `mijnruimte` aanmaken (de opdracht wordt door `inrichten` getoond).
4. **Geheimen**: `/etc/mijn-ruimte/geheimen.env` volgens `ENV-VARS.md` (root:mijnruimte, 0640).
5. **Installeren**: `deploy/installeer-app.sh installeren /pad/naar/checkout`
   bron kopiëren (alleen gecommitte HEAD) → bouwen als `mijnruimte` (`npm ci`, audit, vite, server-bundel,
   `npm prune --omit=dev`) → back-up → migraties → `current`-symlink atomisch omzetten → herstart →
   gezondheidscontrole (`/__gezondheid`); mislukt die, dan automatisch terug naar de vorige release.
6. **Tunnel**: `deploy/cloudflared-config.yml` invullen (tunnel-ID) als `/etc/cloudflared/config.yml`,
   DNS-routes maken voor alle tien hostnamen, `systemctl enable --now cloudflared`.
7. **Controle**: `systemctl status mijn-ruimte`, `systemctl list-timers 'mijn-ruimte-*'`,
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
| `installeer-app.sh` | `inrichten`, `installeren`, `terugdraaien [release]`, `lijst`. |

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
