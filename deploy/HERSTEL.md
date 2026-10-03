# HERSTEL — Mijn Ruimte terugzetten na verlies van de VM

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
$vm  = 'beheer@10.77.0.10'
$g   = 'R:\mijn-ruimte-reservekopie\geheimen\geheimen-<stempel>\geheimen-<stempel>.tar.age'
cmd /c "$age -d -i $sl $g | ssh -i $k $vm sudo -n tar -xpf - -C /"
```
Dit zet `/etc/mijn-ruimte/geheimen.env` en `/etc/cloudflared/<ID>.json` terug (root, 0600). Controleer
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

## 6. Tunnel
Met de teruggezette credentials: `deploy/cloudflared.service` installeren en `systemctl enable --now cloudflared`
(zie `deploy/LEESMIJ.md`, "Tunnel"). Geen nieuwe tunnel of DNS nodig zolang het tunnel-ID hetzelfde blijft.

## Na een herstel
- Maak meteen een nieuwe back-up (`sudo systemctl start mijn-ruimte-backup.service`) en haal die op
  met `T:\mijn-ruimte\scripts\reservekopie-ophalen.ps1`.
- Wordt de herstelsleutel ooit gelekt: nieuw sleutelpaar maken, de publieke sleutel op de VM vervangen,
  een nieuw geheimenarchief maken en de geheimen zelf (sleutels in `geheimen.env`) roteren.
