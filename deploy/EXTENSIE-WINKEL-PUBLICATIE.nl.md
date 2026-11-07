> 🌐 **Taal / Мова:** [Українська](ПУБЛІКАЦІЯ-РОЗШИРЕННЯ-ОГЛЯДАЧА.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Publicatie van de extensie «Mijn Ruimte» in de Chrome Web Store (voor installatie met één klik)

Chrome staat niet toe dat externe extensies buiten de winkel om «met één klik» worden geïnstalleerd (ontwikkelaarsmodus, geforceerde installatie via groepsbeleid werkt alleen op beheerde computers, en de vlag `--load-extension` is verwijderd vanaf Chrome 137). De enige echte «één-klik-installatie» is de Chrome Web Store. Alles hieronder staat klaar; alleen het ontwikkelaarsaccount van de eigenaar van de site is nodig.

## Wat de eigenaar moet doen
1. Een Chrome-ontwikkelaarsaccount registreren (eenmalig 5 USD): https://chrome.google.com/webstore/devconsole
2. Download `https://mcp.tarasevych.com/downloads/mijn-ruimte-extension.zip` (of bouw het pakket met `node scripts/bouw-extensie.mjs`).
3. Zichtbaarheid: **Unlisted** (verborgen / alleen toegankelijk via de link). Neem de teksten uit de onderstaande secties over.
4. Na goedkeuring de URL van de extensiepagina kopiëren naar het bestand `extension/store-url.txt` (één regel), committen en uitrollen. De site toont dan zelf de knop «Installeren vanuit de Chrome Web Store» (leest `extension-version.json`), terwijl het hulpbestand als terugvaloptie behouden blijft.

## Beschrijving voor de winkel
**Naam:** Mijn Ruimte
**Korte beschrijving:** Laat uw AI-assistent (via de Mijn Ruimte-connector) uw pagina's op tarasevych.com lezen en bedienen, uitsluitend met uw toestemming.
**Uitgebreide beschrijving:** De extensie werkt uitsluitend op tarasevych.com en verzamelt niets over andere websites. U schakelt AI zelf in voor uw browser op de site en kiest welke mogelijkheden zijn toegestaan: pagina lezen, diagnostiek, tabbladen, scrollen, navigatie, klikken, typen, kiezen uit lijsten, toetsen, site-acties en schermafbeeldingen. Acties die wijzigingen aanbrengen wachten altijd op uw «Toestaan». De AI werkt alleen zolang u op de site bent aangemeld.

## Verantwoording van de machtigingen (voor de winkelbeoordeling)
- `host_permissions: https://*.tarasevych.com/*`: lezen en bedienen van pagina's op de eigen site van de gebruiker, inclusief de lijst met tabbladen en een schermafbeelding van een tabblad van deze site. Andere websites zijn voor de extensie onzichtbaar.
- `storage`: bewaart het koppeltoken (niet zichtbaar voor webpagina's).
- `alarms`: controleert elke minuut of de verbinding nog actief is (de service achtergrondproces valt in slaap).
- `optional_permissions: debugger`: **optioneel**. Chrome accepteert deze machtiging niet als optioneel (het aanvragen geeft altijd «Alleen permissions specified in de manifest may be requested»); daarom is diepe diagnostiek via CDP niet beschikbaar in het winkelpakket. Daarvoor bestaat een apart pakket `mijn-ruimte-extension-diagnose.zip` buiten de winkel waarin `debugger` in `permissions` staat. In alle gevallen is de debugger alleen beschikbaar in het technische profiel, alleen op beheerpagina's van de eigen site en alleen met een actieve ondertekende ontgrendeling; inhoud en kopteksten van verzoeken worden niet gelezen.
- Externe code: geen (alle code zit in het pakket). Gegevens worden niet verkocht of gedeeld met derden.

## Privacybeleid (kort, voor de winkelpagina)
De extensie stuurt uitsluitend gegevens naar de server mcp.tarasevych.com waarvoor de gebruiker zijn AI-assistent toestemming heeft gegeven, en alleen in antwoord op diens opdrachten (de inhoud van een geopende pagina op tarasevych.com, de lijst met bijbehorende tabbladen, en een schermafbeelding na afzonderlijke toestemming). Wachtwoorden en betaalvelden worden niet gelezen en niet ingevuld. Het koppeltoken wordt lokaal in de browser opgeslagen en kan op de site worden ingetrokken met de knop «Ontkoppelen».
