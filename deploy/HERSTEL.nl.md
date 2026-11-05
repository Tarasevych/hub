> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./HERSTEL.uk.md) · **🇳🇱 Nederlands** ([origineel](./HERSTEL.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# HERSTEL — Mijn Ruimte terugzetten na verlies van de VM

> Hele pc kwijt? Gebruik de **offline herstelset** (`R:\mijn-ruimte-reservekopie\herstelset\`, kopie op een
> externe schijf): stap-voor-stapplan `00-BEGIN-HIER-UA.txt/.pdf` en `00-BEGIN-HIER-NL.txt`, met
> `scripts\herstel-vm.sh` en `scripts\ontsleutel-naar-vm.ps1`. Dit bestand is de korte versie.
>
> Externe schijf ook kwijt? Elke dag staan dezelfde **versleutelde** back-ups en de hele herstelset
> (`herstelset-<datum>.zip.age`) op Google Drive in `mijn-ruimte-reservekopie/` (zie `deploy/cloud/UITLEG-LEESMIJ.txt`
> en hoofdstuk 4 van `00-BEGIN-HIER-NL.txt`). Alleen `.age` + SHA256 staan daar; de herstelsleutel nooit.

Je hebt vier dingen nodig. Zonder de **herstelsleutel** zijn 3 en 4 onbruikbaar.

| # | Wat | Waar |
|---|---|---|
| 1 | Herstelsleutel (age-privésleutel) | `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt` + offline USB-schijf/papier |
| 2 | Broncode | GitHub `Tarasevych/hub`, branch `zelf-hosten`; offline: `R:\mijn-ruimte-reservekopie\broncode\zelf-hosten\<datum-commit>\` (git-bundle + tar.gz + SHA256SUMS) |
| 3 | Versleutelde back-up (database + uploads) | `R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>\` (`database.dump.age`, `uploads.tar.gz.age`) |
| 4 | Versleutelde geheimen (`geheimen.env` + tunnel-credentials) | `R:\mijn-ruimte-reservekopie\geheimen\geheimen-<stempel>\geheimen-<stempel>.tar.age` |

Publieke sleutel (niet geheim, staat op de VM in `/etc/mijn-ruimte/backup-ontvanger.age.pub`):
zie `herstelsleutel-age.pub.txt`. De VM kan zijn eigen back-ups **niet** ontsleutelen; dat kan alleen met 1.
Zet de privésleutel nooit op de VM, in GitHub of op T:\. Hieronder wordt er alleen op de pc mee ontsleuteld
en gaat de klare tekst via SSH rechtstreeks de nieuwe VM in.

## Snelste weg: het volledige archief (één bestand, één opdracht)
Site `mcp.tarasevych.com` → «Archief naar pc» → «Volledig archief samenstellen» maakt `mijn-ruimte-<stempel>-volledig.tar.age` (root-script
`/usr/local/sbin/mijn-ruimte-archief`, gestart door `mijn-ruimte-archief.path`; voortgang in `kit-status.txt`; uitvoer in de root-map
`/var/lib/mijn-ruimte-archief/uitgifte` onder de vaste naam `archief-laatste.tar.age`; de laatste twee generaties blijven staan, de oudste
verdwijnt; `ARCHIEF_BEWAAR` in het script regelt het aantal). Downloaden kan alleen de eigenaar, na step-up, via een
eenmalige download-id. Het **hele archief** is met age versleuteld voor de bestaande publieke sleutel (sinds 2026-10; daarvoor waren alleen database,
bestanden en geheimen versleuteld). Inhoud: code, MCP-deur, git-bundels, database + rollen, bestanden, systeemunits/tunnelconfig (geen sudoers), geheimen,
`LEES-MIJ.txt`, `SHA256SUMS` en `vidnovyty.sh`. Op een nieuwe Ubuntu/Debian-machine (virtueel of fysiek, x86-64 of ARM64):
```bash
age -d -i /pad/naar/herstelsleutel-age.txt mijn-ruimte-<stempel>-volledig.tar.age | tar -x && cd mijn-ruimte-<stempel>-volledig
# (Windows: & "$env:ProgramFiles\age\age.exe" -d -i T:\herstelsleutel-age.txt -o archief.tar mijn-ruimte-…-volledig.tar.age; daarna tar -xf archief.tar)
sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt --proefrun   # eerst alleen tonen
sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt              # echt uitvoeren
```
Het script controleert de sommen, installeert Node/PostgreSQL 17/age/cloudflared, ontsleutelt, herstelt database/bestanden, bouwt de site voor deze
architectuur (`installeer-app.sh`) en wacht op de gezondheidscontrole. Nog niet op een lege machine volledig doorlopen; de proefrun en het maken zijn
getest op de productie-VM. De tweegeneratieregeling, de harde link en het herstel van de git-opslagplaatsen zijn nog niet op de VM getest.
De handmatige stappen hieronder blijven de bewezen weg.

Git-opslagplaatsen (`kod/repos/*.bundle`, met `INDEX.tsv`) worden teruggezet op hun eigen pad onder `/srv/mijn-ruimte`, alleen als dat pad nog
niet bestaat. Oude, onversleutelde archieven (`mijn-ruimte-*-volledig.tar`, `*.tar.gz`) in `/srv/data/uploads/mcp-archives` verwijdert de
installer **niet**; hij meldt ze alleen. Controleer ze en verwijder ze zelf.

## 0. Controleren (PowerShell op de pc)
```powershell
cd R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>
Get-Content SHA256SUMS | % { $h,$n = $_ -split '\s+',2; if ((Get-FileHash $n).Hash.ToLower() -ne $h) { "FOUT $n" } else { "OK $n" } }
```

## 1. Nieuwe VM
Ubuntu met LUKS, gebruiker `beheer` met de SSH-sleutel `T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver(.pub)`.
Pakketten: Node 24, npm, git, rsync, curl, PostgreSQL 17 (+ client), `age`, `cloudflared` (zie `deploy/LEESMIJ.md`).

## 2. Broncode en inrichten (op de VM)
```bash
git clone -b zelf-hosten https://github.com/Tarasevych/hub.git ~/hub     # of: git clone <bundle> ~/hub
sudo bash ~/hub/deploy/installeer-app.sh inrichten ~/hub
```
Maak rol en database `mijnruimte` aan (de opdracht staat in de uitvoer van `inrichten`).

## 3. Geheimen terugzetten (vanaf de pc)
`cmd /c` omdat PowerShell 5.1 binaire pijpen beschadigt; gebruik binnen `cmd /c "…"` geen `>` of `&`.
```powershell
$age = 'T:\mijn-ruimte\hulpmiddelen\age\age\age.exe'
$sl  = 'R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt'
$k   = 'T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver'
$vm  = 'beheer@<VM-IP>'
$g   = 'R:\mijn-ruimte-reservekopie\geheimen\geheimen-<stempel>\geheimen-<stempel>.tar.age'
cmd /c "$age -d -i $sl $g | ssh -i $k $vm sudo -n tar -xpf - -C /"
```
Dit zet `/etc/mijn-ruimte/geheimen.env` en `/etc/cloudflared/<ID>.json` terug (root, 0600); archieven van na
audit-fix 4 (`env-splitsen`) bevatten ook `/etc/mijn-ruimte/migratie.env` (daar staat dan `DATABASE_URL`). Controleer
`DATABASE_URL` (wachtwoord van de nieuwe Postgres-rol moet overeenkomen) en zet de publieke sleutel terug:
`scp herstelsleutel-age.pub.txt` → `sudo install -m 0644 … /etc/mijn-ruimte/backup-ontvanger.age.pub`.

## 4. Applicatie installeren (op de VM)
```bash
sudo ZONDER_BACKUP=1 bash ~/hub/deploy/installeer-app.sh installeren ~/hub
sudo systemctl stop mijn-ruimte 'mijn-ruimte-*.timer'
```

## 5. Database en uploads terugzetten (vanaf de pc)
```powershell
$b = 'R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>'
cmd /c "$age -d -i $sl $b\database.dump.age | ssh -i $k $vm sudo -n install -o postgres -m 0600 /dev/stdin /var/tmp/database.dump"
cmd /c "$age -d -i $sl $b\uploads.tar.gz.age | ssh -i $k $vm sudo -n tar -xzpf - -C /srv/data"
```
Daarna op de VM:
```bash
sudo -u postgres dropdb mijnruimte && sudo -u postgres createdb -O mijnruimte mijnruimte
sudo -u postgres pg_restore --no-owner --role=mijnruimte -d mijnruimte /var/tmp/database.dump
sudo shred -u /var/tmp/database.dump
sudo chown -R mijnruimte:mijnruimte /srv/data/uploads
sudo systemctl start mijn-ruimte 'mijn-ruimte-*.timer'
curl -s http://127.0.0.1:8080/__gezondheid
```

### 5b. Systeemarchief (code, units, tunnelconfig, MCP-brug)
Elke back-upmap bevat ook `systeem.tar.gz.age` en `systeem-info.txt` (klare tekst: versies van node/postgres/cloudflared/age, diensten, poorten,
en welke paden niet leesbaar waren). Het archief bevat de actieve release, de systemd-units en timers, `/etc/cloudflared/config.yml` (zonder
inloggegevens), de MCP-brug met overlay en `/etc/mijn-ruimte` zonder geheimen. Nodig als de release of een unit verloren is, of om de
brug (poort 8091) en de tunnelconfiguratie na een totaalverlies exact terug te zetten:
```powershell
cmd /c "$age -d -i $sl $b\systeem.tar.gz.age | ssh -i $k $vm sudo -n sh -c 'mkdir -p /var/tmp/systeem-herstel && tar -xzpf - -C /var/tmp/systeem-herstel'"
```
Kopieer daarna bewust per onderdeel (units naar `/etc/systemd/system`, `systemctl daemon-reload`); overschrijf nooit blind een draaiende server.

## 6. Tunnel
Met de teruggezette credentials: `deploy/cloudflared.service` installeren en `systemctl enable --now cloudflared`
(zie `deploy/LEESMIJ.md`, "Tunnel"). Geen nieuwe tunnel of DNS nodig zolang het tunnel-ID hetzelfde blijft.

## Na een herstel
- Maak meteen een nieuwe back-up (`sudo systemctl start mijn-ruimte-backup.service`) en haal die op
  met `T:\mijn-ruimte\scripts\reservekopie-ophalen.ps1`.
- Wordt de herstelsleutel ooit gelekt: nieuw sleutelpaar maken, de publieke sleutel op de VM vervangen,
  een nieuw geheimenarchief maken en de geheimen zelf (sleutels in `geheimen.env`) roteren.
