> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./VOLLEDIGA-KOPIYA-VIDNOVLENNYA.uk.md) · **🇳🇱 Nederlands** ([origineel](./VOLLEDIGA-KOPIYA-VIDNOVLENNYA.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Volledige kopie van «Mijn Ruimte»: wat erin zit en hoe te herstellen

Deze set wordt aangemaakt door `T:\mijn-ruimte\scripts\volledige-kopie.ps1` (kan herhaaldelijk worden uitgevoerd: telkens een nieuwe map met tijdstempel).
Doel: alles wat nodig is om de site en onze volledige ontwikkelomgeving vanaf nul te herstellen, **zonder verlies van ook maar één byte**. Stand van zaken: `05-status\STATUS-ROBOTA-*.md`.

## Wat zit er in de map

| Map | Inhoud | Versleuteling |
|---|---|---|
| `01-broncode\` | `hub-alle-branches.bundle` (volledige git-historie, alle branches), `hub-werkmap.tar.gz` (volledige werkmap van het project inclusief `.git` en niet-gevolgde bestanden; zonder `node_modules`, `dist`, `dist-server`, `rapporten`: die zijn reproduceerbaar), lijst van branches en git-status | nee (code) |
| `02-ontwikkeling\` | `ontwikkeling-overig.tar.gz` (staging-scripts, tests, logboeken), `uitrol.tar` (alle gebouwde releasepakketten met controlesommen), `scripts.tar.gz`, `broncode-archieven.tar` | nee |
| `03-server\` | `vm-back-up-<tijdstempel>\` (verse **versleutelde** kopie van database en uploads, met `SHA256SUMS`) en `server-bestanden.tar.age` (code van de huidige release zonder `node_modules`, brug-overlay, Cloudflare-configuraties, `/etc/mijn-ruimte`, systemd-units, scripts in `/usr/local/sbin`, sudoers) | **ja** (age) |
| `04-geheimen-versleuteld\` | `geheimen-pc.tar.age` (ondertekeningssleutel van de extensie, SSH-sleutel voor toegang tot de server), `gesprekken-en-geheugen.tar.age` (gesprekslogboeken en geheugen van de assistent) | **ja** (age) |
| `05-status\` | wat wel en niet is geïmplementeerd, wijzigingslogboeken, plannen, geheugen van de assistent (tekst, zonder geheimen) | nee |
| `SHA256SUMS`, `controleer.ps1`, `inhoud-*.txt` | controlesommen van alle bestanden, controlescript, lijsten met bestandsnamen in de versleutelde archieven (zonder inhoud) | nee |

## BELANGRIJK over de sleutel
De versleutelde bestanden kunnen alleen worden geopend met de **privésleutel van age**: `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt`.
Als u die op dezelfde externe USB-stick zet, heeft de versleuteling geen enkele zin. Bewaar de sleutel **apart** (andere USB-stick, papier, wachtwoordmanager). Zonder de sleutel kan niemand de `.age`-bestanden openen, noch u, noch ik.

## 1. Integriteit controleren (PowerShell, in de map van de kopie)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\controleer.ps1
```
Alle regels moeten `OK` tonen.

## 2. Code herstellen
```powershell
git clone .\01-broncode\hub-alle-branches.bundle hub
cd hub; git branch -a            # alle branches, waaronder feature/connectors-agent-v2 en zelf-hosten
git checkout feature/connectors-agent-v2
```
Of pak `hub-werkmap.tar.gz` uit (daarin zit al de kant-en-klare werkmap met alle niet-gecommitte bestanden en historie) en voer daarna `npm ci` uit.
Bouwen en testen: `T:\mijn-ruimte\hulpmiddelen\node\env.ps1`, `npm run build`, controles met `testdb.ps1` (zie `deploy/LEESMIJ.md`).

## 3. Server herstellen
Het hoofdscenario is hetzelfde als in `deploy/HERSTEL.md` (dat staat ook in `02-ontwikkeling\scripts.tar.gz` samen met de scripts):
1. Nieuwe VM (Ubuntu), pakketten, `git clone` van de code, `installeer-app.sh inrichten`.
2. De versleutelde serverbestanden (configuraties, geheimen, releasecode, overlay, units) worden vanaf de pc als stream teruggezet, zonder tussentijds ontsleutelen naar schijf:
```powershell
$age='T:\mijn-ruimte\hulpmiddelen\age\age\age.exe'; $sl='<pad naar herstelsleutel-age.txt>'; $k='T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver'
cmd /c "$age -d -i $sl 03-server\server-bestanden.tar.age | ssh -i $k beheer@<VM-IP> sudo -n tar -xpf - -C /"
ssh -i $k beheer@<VM-IP> sudo -n systemctl daemon-reload
```
3. Database en uploads uit `03-server\vm-back-up-<tijdstempel>\` volgens stap 5 uit `HERSTEL.md` (`database.dump.age`, `uploads.tar.gz.age`).
4. `sudo systemctl start mijn-ruimte 'mijn-ruimte-*.timer'`, controleer `curl http://127.0.0.1:8080/__gezondheid` → `ok:true`.
5. Cloudflare-tunnel: het referentiesbestand zit al in `server-bestanden.tar.age` (`/etc/cloudflared`). `sudo systemctl enable --now cloudflared`.

## 4. Sleutels en geheimen op de pc herstellen
```powershell
cmd /c "$age -d -i $sl 04-geheimen-versleuteld\geheimen-pc.tar.age | tar -xf - -C T:\mijn-ruimte"
```
Zet `T:\mijn-ruimte\geheim\extension-signing-key.pem` (ondertekeningssleutel van de extensie, id `ofpffonakgjioahgfejmiblfmbkobmmi`) en `T:\mijn-ruimte\hulpmiddelen\ssh\...` (SSH-sleutel voor toegang tot de server) terug.
Gesprekslogboeken en geheugen van de assistent (optioneel): `gesprekken-en-geheugen.tar.age` uitpakken in `C:\Users\<u >\.claude\projects\` (`tar -xf - -C ...`).

## 5. Wat er niet in zit (en waarom)
- De schijf van de virtuele machine zelf (`*.vhdx`): een draaiende versleutelde (LUKS) VM kan niet consistent «live» worden gekopieerd. In plaats daarvan: database, uploads, configuraties, geheimen en code — dit is voldoende om de site op een nieuwe VM op te bouwen.
- `node_modules`, `dist`, `dist-server`: worden gereproduceerd vanuit `package-lock.json` en `npm run build`.
- Draagbare hulpmiddelen (`hulpmiddelen\node`, `postgres`, `rclone`): worden opnieuw gedownload (controlesommen in `hulpmiddelen\*\VERIFICATIE.txt`).
- De publieke code staat ook op GitHub (`Tarasevych/hub`), maar de Chrome Web Store, accounts en wachtwoorden worden niet op GitHub bewaard.
