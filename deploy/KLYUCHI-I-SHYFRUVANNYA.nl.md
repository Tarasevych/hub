> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./KLYUCHI-I-SHYFRUVANNYA.uk.md) · **🇳🇱 Nederlands** ([origineel](./KLYUCHI-I-SHYFRUVANNYA.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Sleutels en versleuteling: wat waarmee is versleuteld (één pagina)

## Hoofdregel
**Er is slechts ÉÉN versleutelingssleutel voor alle archieven: de age-herstelsleutel («herstelsleutel»).** Er zijn geen nieuwe versleutelingssleutels aangemaakt.

| | Waar | Waarvoor |
|---|---|---|
| **Publieke sleutel** (niet geheim) `age1st2ew4cecq2slgrx6vg22wzhwmfxqt706cdmlv5tuqwa49nk4cks0hjrmk` | server `/etc/mijn-ruimte/backup-ontvanger.age.pub`, `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.pub.txt`, `T:\mijn-ruimte\hulpmiddelen\age\backup-ontvanger.age.pub` (alle drie identiek, gecontroleerd) | hiermee wordt **versleuteld** |
| **Privésleutel** (GEHEIM) `herstelsleutel-age.txt` | staat **niet** op de server, niet op R: en niet op T:. Uitsluitend bij u, offline (USB-stick/papier) | hiermee wordt **ontsleuteld** |

Zonder de privésleutel kan geen enkel `.age`-bestand worden geopend: niet door u, niet door de assistent en niet door de server. Bewaar deze sleutel niet op dezelfde externe USB-stick als de back-up zelf.

## Welke bestanden waarmee zijn versleuteld
Alle `*.age`-bestanden in deze map (evenals de nachtelijke kopieën op de server en in `R:\mijn-ruimte-reservekopie\vm-back-ups\`) zijn versleuteld met **deze ene publieke sleutel**:

| Bestand | Wat zit erin |
|---|---|
| `03-server\vm-back-up-<stempel>\database.dump.age` | database (pg_dump) |
| `03-server\vm-back-up-<stempel>\uploads.tar.gz.age` | gebruikersbestanden |
| `03-server\server-bestanden.tar.age` | code van de huidige release, brug-overlay, configuratie van Cloudflare en `/etc/mijn-ruimte` (geheimen), systemd-units, scripts, sudoers |
| `04-geheimen-versleuteld\geheimen-pc.tar.age` | ondertekensleutel van de extensie, SSH-sleutel voor toegang tot de server |
| `04-geheimen-versleuteld\gesprekken-en-geheugen.tar.age` | gesprekslogboeken en geheugen van de assistent |

Al het overige in de map is **niet versleuteld** (code, plannen, status, controlesommen); daarin staan geen geheimen.

## Andere sleutels (dit zijn GEEN versleutelingssleutels)
- **SSH-sleutel voor toegang tot de server** `T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver`: zit in `geheimen-pc.tar.age`.
- **Ondertekensleutel van de extensie (CRX)** `T:\mijn-ruimte\geheim\extension-signing-key.pem`: de enige sleutel die tijdens dit traject is aangemaakt; ondertekent de extensie (id `ofpffonakgjioahgfejmiblfmbkobmmi`) en zit in `geheimen-pc.tar.age`. Zonder deze sleutel kan geen CRX-update worden uitgebracht.
- Servergeheimen (`geheimen.env`, inloggegevens van de tunnel) zitten in `server-bestanden.tar.age`.

## Hoe te ontsleutelen
```powershell
cmd /c "T:\mijn-ruimte\hulpmiddelen\age\age\age.exe -d -i <pad naar herstelsleutel-age.txt> <bestand.age> | tar -xf - -C <doelmap>"
```
Let op: op deze pc **blokkeert het Windows-beleid (Device Guard) momenteel het starten van `age.exe`** vanaf `T:`. Dit moet vooraf worden opgelost (het programma toestaan, of ontsleutelen op een andere computer/Linux-machine met `age`). Geef het aan als er een ontsleutelingsvariant zonder `age.exe` moet worden klaargezet.
