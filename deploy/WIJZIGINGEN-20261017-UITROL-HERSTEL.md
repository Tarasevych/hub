> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261017-UITROL-HERSTEL.uk.md) · [🇳🇱 **Nederlandse versie**](./WIJZIGINGEN-20261017-UITROL-HERSTEL.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# Herstel van de uitrol (updates), technisch profiel en logboek — 17 oktober 2026

Aanleiding: na de wijzigingen van pakket 20261017-112000 (agent grok) werkten updates vanaf de site, de pagina «Оновлення», de duur van
het technisch profiel en het zicht op de uitrol niet meer betrouwbaar. Dit pakket herstelt alleen wat in code en test is aangetoond.

## Wat is gerepareerd

| Onderdeel | Oorzaak (bewezen) | Herstel |
|---|---|---|
| Passkey-/handtekening-uitrol blijft hangen op «bezig INSTALLEREN»; voorstel blijft «goedgekeurd» | `deploy/uitrol/mijn-ruimte-uitrol.sh` draait met `set -euo pipefail`. Na een geslaagde installatie volgt `ls … \| tail \| xargs` op een lege releases-map: `ls` geeft 2, het script stopt vóór `status klaar` en vóór de «OK»-gebeurtenis | Eerst de uitkomst (`status klaar`, gebeurtenis `OK`), daarna de extra's (archief, GitHub) in een best-effort blok zonder `set -e` |
| Geen zicht op het verloop van een uitrol | `/api/owner/uitrol/log` las `/var/lib/mijn-ruimte-uitrol/pakket.*` (root:root 0700, voor de app onleesbaar), was een GET zonder sessiecontext en slikte elke fout | Root publiceert elke 2 s de laatste 200 regels (geheimen gemaskeerd) als `installeer.log` in de statusmap (root:mijnruimte 0640); route is nu `POST /api/owner/uitrol/log` en leest alleen dat bestand |
| Voorstellen blijven eeuwig «goedgekeurd» | `synchroniseer()` keek alleen naar het láátste `status.json` (alleen `methode=passkey`, dezelfde versie); geen time-out | Uitkomst uit alle recente regels van `gebeurtenissen.jsonl`, gekoppeld op versie en pas ná het goedkeurmoment; zonder uitkomst na 30 min → `verlopen` (`GEEN_UITKOMST`), behalve als root er nog mee bezig is |
| «Updaten vanaf de site werkt niet» na een mislukte poging | `versie` was UNIQUE voor alle statussen (VERSIE_BESTAAT_AL), en verlaten uploads telden mee voor `TE_VEEL_OPEN` (max. 3) tot 24 uur | Migratie 0046: versie alleen uniek voor levende voorstellen (uploaden, wacht, goedgekeurd, geïnstalleerd); uploads zonder voortgang > 30 min worden afgebroken (`UPLOAD_STIL`), ook bij elke nieuwe `voorstel/begin` |
| Technisch profiel: «tot uitloggen» / «tot verlaten» gaven een fout | `activeren` rekende 30 resp. 7 dagen; de CHECK `tech_activaties_duur` (migratie 0030) staat maximaal 8 uur toe | Beide vallen onder het rolplafond (eigenaar 120 min) en de 8-uurs grens; het einde wordt in de database uitgerekend (`now() + duur`); de teksten in het venster noemen het echte maximum |
| Logboek | Alle auditaanroepen in `tech-profiel.ts` en `uitrol-goedkeuring.ts` slikten fouten (`.catch(() => undefined)`) | Een mislukte auditregel komt altijd in het servicelogboek (`AUDIT MISLUKT …`); het verlopen en vervangen van een technische activering wordt nu ook gelogd |
| Pagina «Оновлення» | `AdminUitrolModern` kwam bovenop de oude secties (dubbele lijsten), kreeg geen `passkeys` («Passkey: Немає»), `SSH_OK` telde als fout (rode stip), vijf knoppen deden niets, goedkeuren zonder sha256/commit/wijzigingen, valse voortgang, UTC-tijden | Het blok toont alleen nog de echte uitrolstatus (controle → installatie → klaar/mislukt) + logboek; alles anders staat één keer in de secties eronder; tijden lokaal; verwijderd: dode `AdminUitrolProgress.tsx`, kapotte route `uitrol/archief` |
| Meldingen | `TE_VEEL_OPEN`, `VERSIE_BESTAAT_AL`, `GEEN_VOORBEREIDER_GRANT` hadden geen tekst | Teksten (UK/NL) in `AdminUitrolView` |

## Tests
- Nieuw: `tests/eenheid/uitrol-herstel.test.ts` (25 controles: hergebruik versie, opruimen, uitkomst van root, duur en logboek van het technisch profiel).
- Bijgewerkt: `tests/eenheid/uitrol-goedkeuring.test.ts` — testpakketten dragen AUTEUR/AGENT/SAMENVATTING (regel van 15 oktober), het testtoken heeft ruimte `technisch` (migratie 0042), en een controle op het gepubliceerde installatielogboek met gemaskeerde geheimen.

## Uitrollen
1. Pakket uploaden via «Оновлення» (of de MCP-hulpmiddelen), met de passkey goedkeuren. De installer voert migratie 0046 uit.
2. Controleren: `journalctl -u mijn-ruimte-uitrol -n 100` na de installatie en op de pagina de status «Встановлено».
3. Uitrolscript (`deploy/uitrol/mijn-ruimte-uitrol.sh`) wordt door root-installer zelf geïnstalleerd; zie RUNBOOK-VEILIGE-UITROL.md.

## Bewust niet aangepast (apart besluit nodig)
- De root-hulp maakt een GitHub-release met de inhoud van `SAMENVATTING` ongeëscaped in JSON en met een token als root; het blok draait nu pas ná de uitkomst en is niet fataal, maar de inhoud is niet herzien.
- Het archief naar `/srv/mijn-ruimte/releases` wordt door het script nooit gevuld (bronpad bestaat niet); daarom is de downloadroute verwijderd in plaats van gerepareerd.
- Donkere modus voor `admin-uitrol.css` (vaste kleuren), de hash-keten-controle over het hele logboek, verloren logboekregels vóór 17.10 09:27 (databasecontrole nodig).
