> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./LEESMIJ.uk.md) · **🇳🇱 Nederlands** ([origineel](./LEESMIJ.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Deploy-bestanden Mijn Ruimte (VM achter Cloudflare Tunnel)

Niets hiervan wordt automatisch uitgerold. Volgorde voor een nieuwe VM (Debian/Ubuntu, als root):

1. **Pakketten**: Node 24 (`/usr/bin/node`, bijv. via NodeSource), `npm`, `git`, `rsync`, `curl`,
   PostgreSQL 17 (server + `postgresql-client-17` voor `pg_dump`), `age` (versleutelde back-ups), `cloudflared`.
   **PostgreSQL-versie**: minimaal **16** (Ubuntu 24.04 LTS: `postgresql-16`; alle migraties getest), aanbevolen **17**.
   Lager (bijv. Ubuntu 22.04: PG 14) wordt niet ondersteund: `installeren` controleert de versie vóór back-up en
   migraties (`dist-server/migrate.mjs --pg-controle`) en stopt dan met een melding in het Nederlands en Oekraïens,
   zonder iets aan de database te veranderen. Upgraden: `pg_upgradecluster` of het PGDG-pakket van postgresql.org.
   De `pg_dump`-client moet minstens dezelfde hoofdversie hebben als de server. Minimum in de code: `server/pg-versie.ts`.
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
8. **Databaserollen (beveiliging fase 2, optioneel maar aanbevolen)**: na een geslaagde `installeren`:
   `deploy/db-rollen-instellen.sh instellen` — maakt `mijnruimte_migrator` (eigenaar schema), `mijnruimte_app`
   (alleen DML op `app.records`, onder RLS) en `mijnruimte_system` (BYPASSRLS: cron, aanmelden, beheer, back-up),
   schrijft `DATABASE_URL_MIGRATIE/_APP/_SYSTEM` in `geheimen.env` (wachtwoorden op de VM gemaakt, nooit getoond),
   herstart en controleert; mislukt dat, dan alles terug. RLS staat daarna in **audit-modus**:
   `db-rollen-instellen.sh status` toont wat afdwingen zou weigeren; `rls-aan` / `rls-uit` schakelt direct (zonder
   herstart). Zonder deze stap werkt alles met de ene oude rol zoals vroeger. Zie `RUNBOOK-FASE-2-3.md`.
9. **Controle**: `systemctl status mijn-ruimte`, `systemctl list-timers 'mijn-ruimte-*'`,
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
| `db-rollen-instellen.sh` | Als root: `instellen`, `status`, `rls-aan`, `rls-uit`, `rls-groepen`, `rls-groep <groep> aan\|uit` (RLS per groep van tabellen, migratie 0033; weigert `aan` zolang `app.rls_audit` voor die tabellen overtredingen telt, tenzij `FORCEER=1`; de site toont alleen de stand in Diagnostiek → Gegevensisolatie), `terugdraaien`, `env-splitsen`/`env-samenvoegen` (`DATABASE_URL` + `DATABASE_URL_MIGRATIE` naar/van `migratie.env`), `audit-beheerder[-weg] <e-mail\|id>`. Voert `db-rollen.sql` + `../migrations/rechten.sql` (resp. `db-rollen-terug.sql`) uit als `postgres` via stdin; naar Postgres gaat alleen een SCRAM-verifier (`scram-verifier.mjs`), bestaande wachtwoorden worden hergebruikt. `geheimen.env`/`migratie.env` atomisch (eigenaar/rechten blijven). |
| `RUNBOOK-FASE-2-3.md` | Uitrol beveiliging fase 2+3: tarball controleren, installeren, rollen, RLS audit-modus → afdwingen, auth-poort afdwingen, terugdraaien. |
| `RUNBOOK-AUDIT-FIXES.md` | Uitrol audit-fixes: back-up, `AUDIT_IP_PEPPER`, installeren (0007/0008), rollen, `env-splitsen`, auditbeheerder, geheimenarchief, verificatie, terugdraaien, noodgevallen. |
| `db-rollen.sql` / `db-rollen-terug.sql` | Rollen, eigendom, rechten, `FORCE ROW LEVEL SECURITY`, `jsonb_contains` LEAKPROOF (GIN-index onder RLS; opnieuw draaien na een major-upgrade van Postgres) / eigendom terug naar de oude rol, FORCE en afdwingen uit. |
| `geheimen-aanmaken.sh` | **20.10.2026.** Genereert ALLE ontbrekende sleutels (`openssl rand`) in `geheimen.env` (incl. `MAIL_APP_WACHTWOORD_SLEUTEL_V1`, `AGENDA_ABONNEMENT_SLEUTEL_V1`); bestaande waarden blijven; toont alleen naam + vingerafdruk; schrijft `geheimen.journaal`. Loopt automatisch als eerste stap van `installeer-app.sh installeren`; met de hand: `mijn-ruimte-installeer geheimen`. `geheimen-aanvullen.sh` (oude naam) verwijst ernaar. |
| `geheimen-register.sh` | Register van alle geheimen zonder waarden (naam, doel, waar, vingerafdruk, datum, wie roteert): `mijn-ruimte-installeer geheimen-register --uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md`. Sjabloon voor de eigenaar: `GEHEIMEN-REGISTER.md`. |
| `oauth-client-zetten.sh` | OAuth-client van Google of Microsoft in `geheimen.env` zetten met VERBORGEN invoer (terminal) of via stdin (pc-script), formaatcontrole, atomisch schrijven, herstart + `/__gezondheid`-controle: `mijn-ruimte-installeer oauth-client google|microsoft`. `google-login-zetten.sh` (oude naam) verwijst ernaar. De waarden zelf staan in admin → Integraties → Koppelwizard. |
| `google-login-zetten.sh` | Installeren als `/usr/local/sbin/google-login-zetten` (`install -o root -g root -m 0755`). Leest twee regels van stdin (client-ID, client-secret), controleert het formaat, zet `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` in `geheimen.env` (eigenaar/rechten blijven, atomisch via tijdelijk bestand + `mv`), verwijdert een afwijkende `GOOGLE_SUITE_CLIENT_ID` (die wint anders), herstart `mijn-ruimte`, eist `is-active` + HTTP 200 voor `Host: hub.tarasevych.com` op `127.0.0.1:8080`. Back-up (root, 0600) wordt na succes geshred; bij falen oud bestand terug + herstart. Toont nooit waarden. |
| `../scripts/google-login-instellen.ps1` | Windows-pc: vraagt Client ID (zichtbaar) en Client secret (`Read-Host -AsSecureString`) en stuurt ze via de **stdin** van `ssh -i T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver -o BatchMode=yes beheer@203.0.113.10 sudo -n /usr/local/sbin/google-login-zetten`; toont alleen OK/mislukt. Vereist dat `beheer` dit zonder wachtwoord mag (`sudo -n`, zoals in `HERSTEL.md`). |

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
| `ROOK_UIT` / `ROOK_CHROMIUM` / `ROOK_GEHEUGEN_MAX` / `ROOK_TIJD_SEC` / `ROOK_PAGINA_SEC` | `installeer-app.sh` | uit / (zoekt zelf) / `1500M` / `600` / `20` | Rendercontrole na het activeren (22.10.2026, RUNBOOK-VEILIGE-UITROL §8a): `ROOK_UIT=1` slaat hem over; pad naar de browser; geheugenplafond en tijdslimiet van de stand; seconden per pagina. |
| `NAZORG_ROOK_NA` / `NAZORG_ROOK_TUSSEN` | `mijn-ruimte-nazorg.sh` | `120` / `600` | Seconden na de activering vóór de live rendercontrole; minimale tussentijd voor verzoeken vanaf de site («Rendercontrole uitvoeren»). |
| `BACKUP_DIR` | `backup-maken.sh` | `/srv/backups/mijn-ruimte` | Doelmap van de back-ups op de VM. |
| `BACKUP_BEWAAR_DAGEN` | `backup-maken.sh` | `7` | Hoeveel dagen back-ups op de VM blijven staan. |
| `BACKUP_ONTVANGER` | `backup-maken.sh` | `/etc/mijn-ruimte/backup-ontvanger.age.pub` | Publieke age-sleutel waarnaar versleuteld wordt. |
| `BACKUP_ONVERSLEUTELD` | `backup-maken.sh` | uit | `1` = zonder versleuteling (alleen voor tests). |

## Eigen logo's van diensten (BYOS, 21.10.2026)
De site tekent **geen** logo's van andere merken na. Merken waarvan de code een vorm met echte herkomst meelevert (simple-icons, CC0;
lobehub, MIT) tonen die vorm; alle andere (Outlook, Ukr.net, I.ua, Online.ua, Yahoo, Windows, Edge, Teams, …) tonen één en dezelfde
**neutrale plaat**: 1–2 letters van de naam op de merktoon (contrast ≥ 4,5:1). Wie op zijn eigen server het officiële logo wil, levert het
bestand zelf aan — het bestand dat u van de **officiële merkpagina** van de dienst haalde (u bent zelf verantwoordelijk voor het
gebruiksrecht).

| | |
|---|---|
| Map | `/srv/mijn-ruimte/merk-eigen` (aan te passen met `MERK_EIGEN_MAP` in `geheimen.env`). `installeer-app.sh` maakt de map aan (eigenaar `mijnruimte`, 0755); de unit heeft `ReadWritePaths=-/srv/mijn-ruimte/merk-eigen`. |
| Bestandsnaam | `<sleutel>.svg` of `<sleutel>.png`, kleine letters — de sleutel van het merkregister: `microsoftoutlook`, `ukrnet`, `iua`, `onlineua`, `yahoo`, `windows`, `edge`, `microsoft`, `microsoftteams`, `microsoftonedrive`, … (zie `src/merk/merk-tabel.ts`). Staan beide er, dan telt het eerste in alfabetische volgorde; de andere wordt als dubbel gemeld. |
| Grootte | ≤ **200 KB** per bestand, hoogstens 64 bestanden. |
| PNG | moet een echte PNG zijn (handtekening + IHDR). |
| SVG | wordt **ontsmet**: XML-proloog, commentaar, `<metadata>` en editor-naamruimten (inkscape, sodipodi, …) gaan eruit. **Geweigerd** (met reden) wordt elk bestand met `<script>`, `<foreignObject>`, `<image>`, `<a>`, animatie-elementen, `on…`-attributen, `javascript:`, `href`/`url()` naar iets anders dan `#…`, `@import`, `DOCTYPE`/`ENTITY`, of een onbekend element. De browser krijgt het bestand als data-URI in een `<img>` (daar voert een SVG nooit script uit). |
| Opladen via de site | admin → **Integraties** → «Koppelwizard» → «Eigen dienstlogo's»: dienst kiezen, bestand kiezen. Alleen de eigenaar, met een verse **passkey**-bevestiging; elke wijziging staat in het beheerjournaal (`integration.merk-eigen.*`). Daar staan ook de bestanden uit de map die NIET aanvaard zijn, met de reden. |
| Met de hand | als `beheer`: het bestand eerst naar uw thuismap kopiëren (`scp`), dan `sudo -u mijnruimte install -m 0644 ~/ukrnet.svg /srv/mijn-ruimte/merk-eigen/ukrnet.svg`. Geen herstart nodig: de server leest de map opnieuw (cache 30 s); een open pagina ziet het na herladen. |
| Weghalen | in admin «Verwijderen», of het bestand uit de map verwijderen. Dan komt de neutrale plaat (of de ingebouwde vorm) terug. |

API: `POST /api/owner/merk-eigen/lijst` (elke goedgekeurde sessie; de lijst van geweigerde bestanden alleen voor de eigenaar),
`POST /api/owner/admin/merk-eigen/zetten` en `…/wissen` (eigenaar, admin, passkey).
Regels en ontsmetting: `shared/merk-eigen.ts`; server: `backend/merk-eigen.ts`; test: `tests/eenheid/mail-accounts-beheer-20261021.test.ts`.

### Officiële logo's en logo's/foto's van afzenders (21.10.2026, migratie 0093)
Volgorde per merk: **eigen bestand** (hierboven) → **officieel logo uit de ingebouwde basis** (`src/merk/officieel/`: Windows, Edge,
Microsoft, Node.js, Outlook, OneDrive, OneNote, Teams, Azure, Yahoo, monday.com, Pipedrive, Webhooks, OAuth — uit npm-pakketten met
CC0/MIT-licentie, herkomst en sha256 in `HERKOMST.json`; werkt zonder internet) → vorm met herkomst (simple-icons/lobehub) →
**logo uit de database van de site** (`app.merk_beeld`) → neutrale plaat. Bijwerken van de ingebouwde basis: `node scripts/merk-officieel-maken.mjs`
(met `--ua <map>` voor bestanden van de eigen website van een dienst, met `bron.json`).

De database vult **de server zelf** (nooit de browser): voor het domein van een merk zonder ingebouwd logo (Ukr.net, I.ua, Online.ua,
Entra, Fastmail, Freshdesk, Mollie, Tuya) en voor het domein van een afzender van een organisatie: eerst het **BIMI**-record
(`default._bimi.<domein>`), dan de **eigen website** (`<link rel=icon>`, manifest ≥ 128 px), als laatste `/favicon.ico`; ook het
organisatiedomein. Alleen https, alleen publieke adressen (DNS-pinning), ≤ 3 omleidingen, 5 s, ≤ 256 KB, SVG ontsmet; geslaagd = 30 dagen,
mislukt = 1 dag. Daarvoor moet de server naar buiten mogen op **443** (en DNS). Uitzetten: admin → **Integraties** → «Afzenderlogo's»
(standaard aan; het domein ziet dan alleen het IP van de server). Een adres van een gratis maildienst (gmail.com, ukr.net …) krijgt nooit
het logo van die dienst als foto.

Foto's van **mensen** (`app.afzender_beeld`, per gebruiker en ruimte, adres alleen als HMAC, onder de eigen sleutel als de sleutelkluis
aanstaat) komen alleen uit wat de mens zelf aanzet in E-mail → Instellingen → «Afzenders»: de eigen **Google-contacten** (People API,
alleen lezen; zet in het Google Cloud-project ook de People API aan) en **Gravatar** (standaard uit). Server: `backend/merk-bron.ts`;
regels: `shared/merk-bron.ts`; tests: `tests/eenheid/merk-bron-20261021.test.ts`, `merk-bron-google-20261021.test.ts`, `merk-officieel-20261021.test.ts`.

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

## Zoeken «/zoek» (22.10.2026)
Globaal zoeken over interface, post, bijlagen, bestanden, agenda, bord en GitHub. Index in PostgreSQL (migraties 0100–0104), gevuld door de
cron `zoek-index` (timer `mijn-ruimte-zoek-index.timer`); OCR optioneel via `mijn-ruimte-installeer ocr-talen` (tesseract + poppler-utils).
Documentatie: `docs/zoek/ZOEKEN.md` (architectuur, index, API, ranking), `docs/zoek/ZOEK-BEHEER.md` (stand bekijken, herstel, migraties, uitrol,
terugdraaien, prestaties), `docs/zoek/ZOEK-BEVEILIGING.md` (isolatie), `docs/zoek/ZOEK-UITBREIDEN.md` (nieuwe bron/soort), `docs/zoek/ZOEK-TESTEN.md`.
Omgevingsvariabelen `ZOEK_*`: `ENV-VARS.md`. De index is afgeleide data: `TRUNCATE app.zoek_objecten` is altijd veilig.

## Rendercontrole (22.10.2026)
HTTP 200 is geen bewijs dat een pagina rendert (release 20261021-221718: «Buffer is not defined», elke admin-pagina wit). Na het activeren
opent de installer de sleutelpagina's in een headless Chromium op de server (wegwerpkopie van de release op een eigen database
`mijnruimte_rook_<stempel>`, testeigenaar + technisch profiel) en importeert elke bundel; kapot → automatisch terug naar de vorige release
(gebeurtenis `ROOK_TERUGGEDRAAID` op «Updates»). Zonder browser alleen de modulecontrole in Node, eerlijk gemeld als «renderen niet gecontroleerd».
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle      # eenmalig: chrome-headless-shell (vastgepind, SHA-256) in /srv/mijn-ruimte/browser
sudo /usr/local/sbin/mijn-ruimte-installeer rook-controle [--live]  # handmatig; «Diagnostiek» → «Rendercontrole uitvoeren» doet hetzelfde via de nazorg-timer
```
Uitslag: `/var/lib/mijn-ruimte-uitrol-status/rook-controle.json` (en `rook-controle-kapot.json`). Details: `RUNBOOK-VEILIGE-UITROL.md` §8a.

## Terugdraaien
`deploy/installeer-app.sh terugdraaien` (vorige release) of `… terugdraaien 20261003-101500`.
Sinds 22.10.2026 draait de installer ook automatisch terug als de pagina's niet renderen (zie «Rendercontrole» hierboven).
Migraties zijn alleen vooruit: het schema blijft op de nieuwste stand. Houd migraties daarom
uitbreidend (kolommen/tabellen toevoegen, niets hernoemen of verwijderen in dezelfde release).
Met de databaserollen: eerst `deploy/db-rollen-instellen.sh terugdraaien` (variabelen weg, eigendom terug, FORCE
uit), dán `installeer-app.sh terugdraaien` naar een release van vóór fase 2. Een oudere release negeert de
`DATABASE_URL_*`-variabelen, maar `pg_dump` als de oude rol werkt onder FORCE RLS niet meer.

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
Waren de databaserollen ingesteld, draai daarna opnieuw `deploy/db-rollen-instellen.sh instellen` (zet eigendom,
rechten en FORCE weer goed; de bestaande wachtwoorden blijven).
